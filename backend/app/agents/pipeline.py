import logging

from app.agents.document_parser_agent import parse_documents
from app.agents.evaluator_agent import evaluate_session
from app.agents.question_generator_agent import generate_questions
from app.core.database import db
from app.services.document_parser import extract_text_from_bytes
from app.services.supabase_storage import storage_service

logger = logging.getLogger(__name__)


async def run_document_pipeline(session_id: str) -> None:
    session = db.get_session_with_docs(session_id)
    if not session:
        raise ValueError("Session not found")

    db.update_session(session_id, {"status": "parsing"})

    try:
        cv_doc = session.get("cv_document") or {}
        cv_bytes = storage_service.download_file(cv_doc["storage_bucket"], cv_doc["storage_path"])
        cv_text = extract_text_from_bytes(cv_bytes, cv_doc["file_name"])

        jd_text = None
        jd_doc = session.get("jd_document")
        if jd_doc:
            jd_bytes = storage_service.download_file(jd_doc["storage_bucket"], jd_doc["storage_path"])
            jd_text = extract_text_from_bytes(jd_bytes, jd_doc["file_name"])

        profile = await parse_documents(
            session_id,
            cv_text,
            jd_text,
            session["position_applied"],
            session.get("industry"),
        )

        await generate_questions(
            session_id,
            profile,
            session["position_applied"],
            session.get("industry"),
            session.get("language", "vi"),
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
        return await evaluate_session(session_id)
    except Exception as exc:
        db.update_session(session_id, {"status": "failed", "error_message": str(exc)})
        raise
