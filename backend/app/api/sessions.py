import logging
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response

from app.services.pdf_resume import generate_resume_pdf
from app.agents.pipeline import run_document_pipeline, run_evaluation_pipeline
from app.api.schemas import CreateSessionRequest, QuestionResponse, SessionResponse
from app.core.auth import get_current_user
from app.core.database import db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sessions", tags=["sessions"])


def _session_to_response(s: dict) -> SessionResponse:
    report = s.get("report") or {}
    overall_score = None
    avg_content = None
    avg_relevance = None
    avg_completeness = None
    avg_presentation = None

    if isinstance(report, list) and len(report) > 0:
        rep = report[0]
    elif isinstance(report, dict):
        rep = report
    else:
        rep = {}

    if rep:
        overall_score = float(rep["overall_score"]) if rep.get("overall_score") is not None else None
        avg_content = float(rep["avg_content"]) if rep.get("avg_content") is not None else None
        avg_relevance = float(rep["avg_relevance"]) if rep.get("avg_relevance") is not None else None
        avg_completeness = float(rep["avg_completeness"]) if rep.get("avg_completeness") is not None else None
        avg_presentation = float(rep["avg_presentation"]) if rep.get("avg_presentation") is not None else None

    return SessionResponse(
        id=s["id"],
        title=s.get("title"),
        position_applied=s["position_applied"],
        industry=s.get("industry"),
        language=s.get("language", "vi"),
        status=s["status"],
        current_question_index=s.get("current_question_index", 0),
        created_at=s["created_at"],
        error_message=s.get("error_message"),
        overall_score=overall_score,
        avg_content=avg_content,
        avg_relevance=avg_relevance,
        avg_completeness=avg_completeness,
        avg_presentation=avg_presentation,
    )


@router.get("", response_model=list[SessionResponse])
async def list_sessions(user: Annotated[dict, Depends(get_current_user)]):
    sessions = db.list_sessions(user["sub"])
    return [_session_to_response(s) for s in sessions]


@router.post("", response_model=SessionResponse)
async def create_session(
    body: CreateSessionRequest,
    user: Annotated[dict, Depends(get_current_user)],
):
    cv_doc = db.get_document(body.cv_document_id, user["sub"])
    if not cv_doc:
        raise HTTPException(status_code=404, detail="CV document not found")

    if body.jd_document_id:
        jd_doc = db.get_document(body.jd_document_id, user["sub"])
        if not jd_doc:
            raise HTTPException(status_code=404, detail="JD document not found")

    session = db.create_session(
        {
            "user_id": user["sub"],
            "position_applied": body.position_applied,
            "industry": body.industry,
            "language": body.language,
            "status": "parsing",
            "cv_document_id": body.cv_document_id,
            "jd_document_id": body.jd_document_id,
        }
    )

    # Chay pipeline dong bo: cho parse CV + tao cau hoi xong roi moi tra ve.
    # Frontend chi can goi 1 lan, khong polling.
    try:
        await run_document_pipeline(session["id"])
    except Exception as exc:
        # Pipeline da tu cap nhat status=failed + error_message trong DB.
        # Log ra day de de debug, khong raise lai tranh 500 cho client.
        logger.error(
            "Pipeline failed for session %s: %s",
            session["id"],
            exc,
            exc_info=True,
        )

    updated = db.get_session(session["id"], user["sub"]) or session
    return _session_to_response(updated)


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(session_id: str, user: Annotated[dict, Depends(get_current_user)]):
    session = db.get_session(session_id, user["sub"])
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return _session_to_response(session)


@router.get("/{session_id}/questions", response_model=list[QuestionResponse])
async def get_questions(session_id: str, user: Annotated[dict, Depends(get_current_user)]):
    session = db.get_session(session_id, user["sub"])
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    questions = db.list_questions(session_id, main_only=True)
    return [
        QuestionResponse(
            id=q["id"],
            category=q["category"],
            question_text=q["question_text"],
            order_index=q["order_index"],
            is_follow_up=q.get("is_follow_up", False),
        )
        for q in questions
    ]


@router.post("/{session_id}/start", response_model=SessionResponse)
async def start_session(session_id: str, user: Annotated[dict, Depends(get_current_user)]):
    session = db.get_session(session_id, user["sub"])
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session["status"] != "ready":
        raise HTTPException(status_code=400, detail=f"Session not ready, status={session['status']}")

    updated = db.update_session(
        session_id,
        {
            "status": "active",
            "started_at": datetime.now(timezone.utc).isoformat(),
            "current_question_index": 0,
            "follow_up_count": 0,
        },
    )
    return _session_to_response(updated)


@router.post("/{session_id}/complete")
async def complete_session(
    session_id: str,
    background_tasks: BackgroundTasks,
    user: Annotated[dict, Depends(get_current_user)],
):
    session = db.get_session(session_id, user["sub"])
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    db.update_session(session_id, {"status": "evaluating"})
    background_tasks.add_task(run_evaluation_pipeline, session_id)
    return {"status": "evaluating", "message": "Dang danh gia buoi phong van..."}


@router.get("/{session_id}/messages")
async def get_messages(session_id: str, user: Annotated[dict, Depends(get_current_user)]):
    session = db.get_session(session_id, user["sub"])
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    messages = db.list_messages(session_id)
    return [
        {
            "id": m["id"],
            "role": m["role"],
            "message_type": m["message_type"],
            "content": m["content"],
            "sequence_number": m["sequence_number"],
            "created_at": m["created_at"],
        }
        for m in messages
    ]


@router.get("/{session_id}/candidate-profile")
async def get_candidate_profile(session_id: str, user: Annotated[dict, Depends(get_current_user)]):
    session = db.get_session(session_id, user["sub"])
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    profile = db.get_candidate_profile(session_id)
    if not profile:
        return {
            "skills": [],
            "experiences": [],
            "projects": [],
            "education": [],
            "achievements": [],
            "jd_gap_analysis": {}
        }
    return profile


@router.put("/{session_id}/candidate-profile")
async def update_candidate_profile(
    session_id: str,
    body: dict,
    user: Annotated[dict, Depends(get_current_user)]
):
    session = db.get_session(session_id, user["sub"])
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    update_data = {
        "skills": body.get("skills", []),
        "experiences": body.get("experiences", []),
        "projects": body.get("projects", []),
        "education": body.get("education", []),
        "achievements": body.get("achievements", []),
        "jd_gap_analysis": body.get("jd_gap_analysis", {})
    }
    
    profile = db.upsert_candidate_profile(session_id, update_data)
    return profile


@router.get("/{session_id}/cv/pdf")
async def get_cv_pdf(session_id: str, user: Annotated[dict, Depends(get_current_user)]):
    session = db.get_session(session_id, user["sub"])
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    profile = db.get_candidate_profile(session_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Candidate profile not found")
        
    pdf_bytes = generate_resume_pdf(session.get("position_applied") or "Chuyên viên", profile)
    
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="optimized-cv-{session_id}.pdf"'},
    )
