import asyncio
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Số câu được chấm song song cùng lúc (tôn trọng rate-limit Groq free tier:
# 6000 TPM. Quá cao sẽ gây 429 hàng loạt).
_EVAL_CONCURRENCY = 2
# Đánh giá một câu cần ít token đầu ra -> giảm để nhanh hơn.
_EVAL_MAX_TOKENS = 700

from app.agents.schemas import AnswerEvaluationData, CvSuggestion, ReportSummary
from app.agents.cv_reviewer_agent import review_cv
from app.core.config import get_settings
from app.core.database import db
from app.core.llm_router import llm_router
from app.services.pdf_report import generate_report_pdf
from app.services.supabase_storage import storage_service


def _load_prompt(name: str) -> str:
    path = Path(__file__).parent / "prompts" / name
    return path.read_text(encoding="utf-8")


def _coerce_float(value: Any, fallback: float) -> float:
    """LLM doi khi tra so duoi dang dict/str -> ep ve float an toan."""
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except ValueError:
            return fallback
    return fallback


def _build_report_summary(data: dict[str, Any], computed_overall: float, cv_suggestions: list[CvSuggestion]) -> ReportSummary:
    """Dung ReportSummary chiu loi khi LLM tra JSON sai cau truc."""
    data = data if isinstance(data, dict) else {}

    overall = _coerce_float(data.get("overall_score"), computed_overall)

    summary_text = data.get("summary")
    if not isinstance(summary_text, str) or not summary_text.strip():
        summary_text = (
            f"Diem tong the buoi phong van: {computed_overall}/10. "
            "He thong khong tao duoc tom tat chi tiet, vui long xem danh gia tung cau hoi."
        )

    return ReportSummary(overall_score=overall, summary=summary_text, cv_suggestions=cv_suggestions)


def _weighted_overall(scores: dict[str, float]) -> float:
    return (
        scores["content"] * 0.3
        + scores["relevance"] * 0.25
        + scores["completeness"] * 0.25
        + scores["presentation"] * 0.2
    )


async def evaluate_session(session_id: str) -> dict[str, Any]:
    session = db.get_session(session_id)
    if not session:
        raise ValueError("Session not found")

    all_questions = db.list_questions(session_id)
    # Sort all questions by order_index, then by created_at to preserve order in report
    all_questions.sort(key=lambda q: (q.get("order_index") or 0, q.get("created_at") or ""))

    candidate_messages = db.list_messages(session_id, role="candidate")

    answers_by_question: dict[str, str] = {}
    for msg in candidate_messages:
        qid = msg.get("question_id")
        if qid:
            answers_by_question[qid] = msg["content"]

    # Chế độ hội đồng: Lead có thể bỏ qua một số câu trong kho -> chỉ chấm những
    # câu ĐÃ được hỏi (có câu trả lời), tránh kéo điểm xuống vì câu chưa dùng.
    if get_settings().panel_enabled:
        answered = [q for q in all_questions if q["id"] in answers_by_question]
        if answered:
            all_questions = answered

    system_template = _load_prompt("evaluator.txt")
    system = system_template.format(language=session.get("language", "vi"))

    evaluations = []
    total_scores = {"content": 0.0, "relevance": 0.0, "completeness": 0.0, "presentation": 0.0}

    semaphore = asyncio.Semaphore(_EVAL_CONCURRENCY)

    async def _grade_one(question: dict[str, Any]) -> AnswerEvaluationData:
        """Chấm 1 câu (chỉ phần gọi LLM) — chạy song song có giới hạn."""
        answer = answers_by_question.get(question["id"], "").strip()
        if not answer:
            answer = "(Ứng viên không trả lời câu hỏi này)"

        source_context = question.get("source_context") or {}
        grading_criteria = source_context.get("grading_criteria") or "N/A"

        prompt = f"""Question ({question['category']}): {question['question_text']}
Expected grading criteria: {grading_criteria}
Candidate answer: {answer}
Target position: {session['position_applied']}
"""
        async with semaphore:
            try:
                data, _ = await llm_router.generate_json(prompt, system, max_tokens=_EVAL_MAX_TOKENS)
                return AnswerEvaluationData.model_validate(data)
            except Exception:
                return AnswerEvaluationData(
                    score_content=0.0,
                    score_relevance=0.0,
                    score_completeness=0.0,
                    score_presentation=0.0,
                    strengths=[],
                    weaknesses=["Khong danh gia duoc cau tra loi"],
                    feedback="He thong khong tao duoc danh gia cho cau nay.",
                    sample_answer="N/A",
                )

    # Gọi LLM song song cho tất cả câu (giữ nguyên thứ tự kết quả).
    ev_results: list[AnswerEvaluationData] = await asyncio.gather(
        *(_grade_one(q) for q in all_questions)
    )

    # Ghi DB + cộng dồn điểm tuần tự (theo đúng thứ tự câu hỏi).
    for question, ev in zip(all_questions, ev_results):
        overall = _weighted_overall(
            {
                "content": ev.score_content,
                "relevance": ev.score_relevance,
                "completeness": ev.score_completeness,
                "presentation": ev.score_presentation,
            }
        )

        record = db.upsert_evaluation(
            session_id,
            question["id"],
            {
                "score_content": ev.score_content,
                "score_relevance": ev.score_relevance,
                "score_completeness": ev.score_completeness,
                "score_presentation": ev.score_presentation,
                "score_overall": round(overall, 2),
                "strengths": ev.strengths,
                "weaknesses": ev.weaknesses,
                "feedback": ev.feedback,
                "sample_answer": ev.sample_answer,
            },
        )
        total_scores["content"] += ev.score_content
        total_scores["relevance"] += ev.score_relevance
        total_scores["completeness"] += ev.score_completeness
        total_scores["presentation"] += ev.score_presentation
        evaluations.append({"question": question, "evaluation": record, "ev_data": ev})

    n = max(len(all_questions), 1)
    averages = {k: round(v / n, 2) for k, v in total_scores.items()}
    overall_score = round(_weighted_overall(averages), 2)

    profile = db.get_candidate_profile(session_id)
    if profile:
        profile_data = {
            "skills": profile.get("skills", []),
            "experiences": profile.get("experiences", []),
            "projects": profile.get("projects", []),
            "education": profile.get("education", []),
            "achievements": profile.get("achievements", []),
            "jd_gap_analysis": profile.get("jd_gap_analysis", {})
        }
    else:
        profile_data = {}

    interview_details = []
    for e in evaluations:
        interview_details.append({
            "question": e["question"]["question_text"],
            "category": e["question"]["category"],
            "answer": answers_by_question.get(e["question"]["id"], ""),
            "score": e["evaluation"]["score_overall"],
            "feedback": e["evaluation"]["feedback"]
        })

    summary_prompt = f"""Interview details:
{json.dumps(interview_details, ensure_ascii=False)}

Candidate's CV data:
{json.dumps(profile_data, ensure_ascii=False)}

Target position: {session.get('position_applied')}
Industry: {session.get('industry', 'Not specified')}
Average score: {overall_score}/10
Criterion average scores: {json.dumps(averages)}
"""
    summarizer_system_template = _load_prompt("summarizer.txt")
    summarizer_system = summarizer_system_template.format(language=session.get("language", "vi"))
    try:
        summary_data, _ = await llm_router.generate_json(
            summary_prompt, summarizer_system, max_tokens=1200, model=get_settings().groq_quality_model
        )
    except Exception:
        summary_data = {}

    # Call the dedicated CV Reviewer Agent on raw CV text
    cv_text = ""
    jd_text = None
    if session.get("cv_document_id"):
        cv_doc = db.get_document(session["cv_document_id"])
        if cv_doc:
            cv_text = cv_doc.get("raw_text") or ""
    
    if session.get("jd_document_id"):
        jd_doc = db.get_document(session["jd_document_id"])
        if jd_doc:
            jd_text = jd_doc.get("raw_text")

    cv_review = await review_cv(
        cv_text=cv_text,
        jd_text=jd_text,
        position=session["position_applied"],
        industry=session.get("industry"),
        language=session.get("language", "vi"),
    )
    
    suggestions: list[CvSuggestion] = []
    
    # 1. Add overall CV Critique card
    score = cv_review.get("cv_score", 0.0)
    critique = cv_review.get("general_critique", "")
    priority = "high" if score <= 5.0 else ("medium" if score <= 7.5 else "low")
    
    suggestions.append(
        CvSuggestion(
            section="Đánh giá tổng quan CV",
            suggestion=f"Điểm chất lượng CV: {score}/10.\n\nNhận xét chung: {critique}",
            priority=priority
        )
    )
    
    # 2. Add grammar & spelling issues if any
    grammar_issues = cv_review.get("spelling_grammar_issues", [])
    if grammar_issues:
        issues_text = "\n".join([f"- {issue}" for issue in grammar_issues])
        suggestions.append(
            CvSuggestion(
                section="Lỗi chính tả & Ngữ pháp",
                suggestion=f"Phát hiện các lỗi chính tả, hành văn thiếu chuyên nghiệp:\n{issues_text}",
                priority="high"
            )
        )

    # 2b. Từ khoá JD còn thiếu (ATS gap)
    ats_missing = cv_review.get("ats_keywords_missing", [])
    if ats_missing:
        kw_text = ", ".join(str(k) for k in ats_missing)
        suggestions.append(
            CvSuggestion(
                section="Từ khoá JD còn thiếu (ATS)",
                suggestion=(
                    "Các từ khoá/kỹ năng JD yêu cầu nhưng CV chưa thể hiện rõ. "
                    f"Bổ sung nếu bạn thực sự có: {kw_text}"
                ),
                priority="high",
            )
        )

    # 3. Add other detailed suggestions (kèm bằng chứng + Before/After thật từ LLM)
    for item in cv_review.get("cv_suggestions", []):
        if isinstance(item, dict) and item.get("suggestion"):
            suggestions.append(
                CvSuggestion(
                    section=str(item.get("section", "Chung")),
                    suggestion=str(item["suggestion"]),
                    priority=str(item.get("priority", "medium")),
                    evidence=item.get("evidence"),
                    before=item.get("before"),
                    after=item.get("after"),
                )
            )

    report_summary = _build_report_summary(summary_data, overall_score, suggestions)

    eval_list_for_pdf = [
        {
            "question_text": e["question"]["question_text"],
            "score_overall": e["evaluation"]["score_overall"],
            "feedback": e["evaluation"]["feedback"],
        }
        for e in evaluations
    ]
    # Tao + upload PDF: neu loi van luu report (web) de khong sap pipeline
    pdf_bucket: str | None = None
    pdf_path: str | None = None
    try:
        pdf_bytes = generate_report_pdf(
            session.get("title") or "",
            session["position_applied"],
            overall_score,
            averages,
            report_summary.summary,
            eval_list_for_pdf,
            [s.model_dump() for s in report_summary.cv_suggestions],
        )
        candidate_path = f"{session['user_id']}/{session_id}/report.pdf"
        storage_service.upload_file("reports", candidate_path, pdf_bytes, "application/pdf")
        pdf_bucket = "reports"
        pdf_path = candidate_path
    except Exception:
        logger.exception("Khong tao duoc PDF report cho session %s", session_id)

    db.upsert_report(
        session_id,
        {
            "overall_score": overall_score,
            "avg_content": averages["content"],
            "avg_relevance": averages["relevance"],
            "avg_completeness": averages["completeness"],
            "avg_presentation": averages["presentation"],
            "summary": report_summary.summary,
            "cv_suggestions": [s.model_dump() for s in report_summary.cv_suggestions],
            "pdf_bucket": pdf_bucket,
            "pdf_path": pdf_path,
        },
    )

    db.update_session(
        session_id,
        {"status": "completed", "completed_at": datetime.now(timezone.utc).isoformat()},
    )

    return {
        "overall_score": overall_score,
        "averages": averages,
        "summary": report_summary.summary,
        "cv_suggestions": [s.model_dump() for s in report_summary.cv_suggestions],
        "evaluations_count": len(evaluations),
    }
