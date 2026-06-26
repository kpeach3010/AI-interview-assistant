import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

from app.agents.schemas import AnswerEvaluationData, CvSuggestion, ReportSummary
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


def _build_report_summary(data: dict[str, Any], computed_overall: float) -> ReportSummary:
    """Dung ReportSummary chiu loi khi LLM tra JSON sai cau truc."""
    data = data if isinstance(data, dict) else {}

    overall = _coerce_float(data.get("overall_score"), computed_overall)

    summary_text = data.get("summary")
    if not isinstance(summary_text, str) or not summary_text.strip():
        summary_text = (
            f"Diem tong the buoi phong van: {computed_overall}/10. "
            "He thong khong tao duoc tom tat chi tiet, vui long xem danh gia tung cau hoi."
        )

    raw_suggestions = data.get("cv_suggestions")
    suggestions: list[CvSuggestion] = []
    if isinstance(raw_suggestions, list):
        for item in raw_suggestions:
            if isinstance(item, dict) and item.get("suggestion"):
                suggestions.append(
                    CvSuggestion(
                        section=str(item.get("section", "Chung")),
                        suggestion=str(item["suggestion"]),
                        priority=str(item.get("priority", "medium")),
                    )
                )

    return ReportSummary(overall_score=overall, summary=summary_text, cv_suggestions=suggestions)


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

    main_questions = db.list_questions(session_id, main_only=True)
    candidate_messages = db.list_messages(session_id, role="candidate")

    answers_by_question: dict[str, str] = {}
    for msg in candidate_messages:
        qid = msg.get("question_id")
        if qid:
            answers_by_question[qid] = msg["content"]

    system_template = _load_prompt("evaluator.txt")
    system = system_template.format(language=session.get("language", "vi"))

    evaluations = []
    total_scores = {"content": 0.0, "relevance": 0.0, "completeness": 0.0, "presentation": 0.0}

    for question in main_questions:
        answer = answers_by_question.get(question["id"], "")
        if not answer:
            answer = "(Ung vien khong tra loi hoac khong ghi nhan duoc)"

        prompt = f"""Cau hoi ({question['category']}): {question['question_text']}
Cau tra loi: {answer}
Vi tri: {session['position_applied']}
"""
        try:
            data, _ = await llm_router.generate_json(prompt, system)
            ev = AnswerEvaluationData.model_validate(data)
        except Exception:
            # LLM tra JSON sai -> cham diem 0, ghi nhan can xem lai
            ev = AnswerEvaluationData(
                score_content=0,
                score_relevance=0,
                score_completeness=0,
                score_presentation=0,
                strengths=[],
                weaknesses=["Khong danh gia duoc cau tra loi"],
                feedback="He thong khong tao duoc danh gia cho cau nay.",
                sample_answer="",
            )
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

    n = max(len(main_questions), 1)
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

    summary_prompt = f"""Chi tiết buổi phỏng vấn:
{json.dumps(interview_details, ensure_ascii=False)}

Dữ liệu CV hiện tại của ứng viên:
{json.dumps(profile_data, ensure_ascii=False)}

Vị trí ứng tuyển: {session.get('position_applied')}
Lĩnh vực: {session.get('industry', 'Khong xac dinh')}
Điểm trung bình: {overall_score}/10
Điểm trung bình từng tiêu chí: {json.dumps(averages)}
"""
    summarizer_system_template = _load_prompt("summarizer.txt")
    summarizer_system = summarizer_system_template.format(language=session.get("language", "vi"))
    try:
        summary_data, _ = await llm_router.generate_json(summary_prompt, summarizer_system)
    except Exception:
        summary_data = {}

    report_summary = _build_report_summary(summary_data, overall_score)

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
