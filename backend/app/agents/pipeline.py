import logging

from app.agents.document_parser_agent import parse_documents
from app.agents.evaluator_agent import evaluate_session
from app.agents.graph import eval_graph, question_graph
from app.agents.question_generator_agent import generate_questions
from app.core.config import get_settings
from app.core.database import db
from app.services.document_parser import extract_text_from_bytes
from app.services.supabase_storage import storage_service

logger = logging.getLogger(__name__)


def _sanitize_text(text: str) -> str:
    """
    Sanitize text extracted from PDF/DOCX before saving to PostgreSQL.
    - Remove null bytes (\x00) which PostgreSQL does not support in text columns.
    - Strip leading/trailing whitespaces (including newline before %PDF header).
    """
    return text.replace("\x00", "").strip()


async def run_document_pipeline(session_id: str) -> None:
    session = db.get_session_with_docs(session_id)
    if not session:
        raise ValueError("Session not found")

    db.update_session(session_id, {"status": "parsing"})

    try:
        cv_doc = session.get("cv_document") or {}
        cv_bytes = storage_service.download_file(cv_doc["storage_bucket"], cv_doc["storage_path"])
        cv_text = _sanitize_text(extract_text_from_bytes(cv_bytes, cv_doc["file_name"]))

        jd_text = None
        jd_doc = session.get("jd_document")
        if jd_doc:
            jd_bytes = storage_service.download_file(jd_doc["storage_bucket"], jd_doc["storage_path"])
            jd_text = _sanitize_text(extract_text_from_bytes(jd_bytes, jd_doc["file_name"]))

        saved_profile = cv_doc.get("parsed_profile")
        if saved_profile and isinstance(saved_profile, dict) and saved_profile.get("skills"):
            logger.info("Reusing existing parsed profile for document %s in session %s", cv_doc["id"], session_id)
            profile = saved_profile
            # Copy to session's candidate_profile
            db.upsert_candidate_profile(
                session_id,
                {
                    "skills": profile.get("skills", []),
                    "experiences": profile.get("experiences", []),
                    "projects": profile.get("projects", []),
                    "education": profile.get("education", []),
                    "achievements": profile.get("achievements", []),
                    "jd_gap_analysis": profile.get("jd_gap_analysis", {}),
                },
            )
            # Regenerate embeddings for the new session
            from app.services.embedding import build_chunks_from_profile, store_embedding
            chunks = build_chunks_from_profile(profile)
            if jd_text:
                chunks.append(("jd", jd_text[:1000]))
            for idx, (section, text) in enumerate(chunks):
                store_embedding(cv_doc["id"], session_id, idx, section, text)
            
            # Update documents status to done
            db.update_document(cv_doc["id"], {"parse_status": "done", "raw_text": cv_text})
            if session.get("jd_document_id") and jd_text:
                db.update_document(session["jd_document_id"], {"parse_status": "done", "raw_text": jd_text})
        else:
            profile = await parse_documents(
                session_id,
                cv_text,
                jd_text,
                session["position_applied"],
                session.get("industry"),
            )

        if get_settings().panel_enabled:
            # Question crew (LangGraph): sinh câu hỏi -> QA phản biện -> (lặp) ->
            # lập bảng mục tiêu (goals) cho hội đồng.
            await question_graph().ainvoke(
                {
                    "session_id": session_id,
                    "profile": profile,
                    "position": session["position_applied"],
                    "industry": session.get("industry"),
                    "language": session.get("language", "vi"),
                    "jd_text": jd_text,
                    "qgen_iteration": 0,
                    "critique": None,
                }
            )
        else:
            await generate_questions(
                session_id,
                profile,
                session["position_applied"],
                session.get("industry"),
                session.get("language", "vi"),
                jd_text=jd_text,
            )

        title_prefix = "Phỏng vấn" if session.get("language") == "vi" else "Interview"
        db.update_session(
            session_id,
            {"status": "ready", "title": f"{title_prefix} {session['position_applied']}"},
        )
    except Exception as exc:
        logger.exception("Pipeline failed for session %s", session_id)
        db.update_session(session_id, {"status": "failed", "error_message": str(exc)})
        raise


async def run_evaluation_pipeline(session_id: str) -> dict:
    db.update_session(session_id, {"status": "evaluating"})
    try:
        if get_settings().panel_enabled:
            # Eval crew (LangGraph): chấm điểm -> soát báo cáo (self-critique).
            state = await eval_graph().ainvoke({"session_id": session_id, "result": None})
            return state.get("result") or {}
        return await evaluate_session(session_id)
    except Exception as exc:
        db.update_session(session_id, {"status": "failed", "error_message": str(exc)})
        raise
