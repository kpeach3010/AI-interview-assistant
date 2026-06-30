from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from app.api.schemas import ReportResponse
from app.core.auth import get_current_user
from app.core.database import db
from app.services.supabase_storage import storage_service

router = APIRouter(prefix="/sessions", tags=["reports"])


@router.get("/{session_id}/report", response_model=ReportResponse)
async def get_report(session_id: str, user: Annotated[dict, Depends(get_current_user)]):
    session = db.get_session(session_id, user["sub"])
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    report = db.get_report(session_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not ready yet")

    evaluations = db.list_evaluations(session_id)
    evaluations.sort(key=lambda e: (e.get("questions") or {}).get("order_index", 999))

    pdf_url = None
    if report.get("pdf_path") and report.get("pdf_bucket"):
        try:
            pdf_url = storage_service.get_signed_url(report["pdf_bucket"], report["pdf_path"])
        except Exception:
            pdf_url = None

    cv_suggestions = report.get("cv_suggestions") or []

    profile = db.get_candidate_profile(session_id) or {}
    jd_gap_analysis = profile.get("jd_gap_analysis") if isinstance(profile, dict) else None

    all_messages = db.list_messages(session_id)

    return ReportResponse(
        session_id=session_id,
        total_duration_ms=session.get("total_duration_ms"),
        overall_score=float(report["overall_score"]),
        avg_content=float(report["avg_content"]),
        avg_relevance=float(report["avg_relevance"]),
        avg_completeness=float(report["avg_completeness"]),
        avg_presentation=float(report["avg_presentation"]),
        summary=report["summary"],
        cv_suggestions=cv_suggestions if isinstance(cv_suggestions, list) else [],
        evaluations=[
            {
                "question_id": e["question_id"],
                "question_text": (e.get("questions") or {}).get("question_text", ""),
                "answer_duration_ms": (e.get("questions") or {}).get("answer_duration_ms"),
                "candidate_answer": next((m["content"] for m in all_messages if m["role"] == "candidate" and m["question_id"] == e["question_id"]), None),
                "category": (e.get("questions") or {}).get("category", ""),
                "score_content": float(e["score_content"]),
                "score_relevance": float(e["score_relevance"]),
                "score_completeness": float(e["score_completeness"]),
                "score_presentation": float(e["score_presentation"]),
                "score_overall": float(e["score_overall"]),
                "feedback": e["feedback"],
                "sample_answer": e.get("sample_answer"),
                "strengths": e.get("strengths", []),
                "weaknesses": e.get("weaknesses", []),
            }
            for e in evaluations
        ],
        pdf_url=pdf_url,
        jd_gap_analysis=jd_gap_analysis,
    )


@router.get("/{session_id}/report/pdf")
async def download_report_pdf(session_id: str, user: Annotated[dict, Depends(get_current_user)]):
    session = db.get_session(session_id, user["sub"])
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    report = db.get_report(session_id)
    if not report or not report.get("pdf_path"):
        raise HTTPException(status_code=404, detail="PDF not available")

    pdf_bytes = storage_service.download_file(report.get("pdf_bucket") or "reports", report["pdf_path"])
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="report-{session_id}.pdf"'},
    )
