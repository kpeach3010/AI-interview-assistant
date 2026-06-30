import re
from pathlib import Path
from typing import Any

from app.agents.schemas import CandidateProfileData
from app.core.config import get_settings
from app.core.database import db
from app.core.llm_router import llm_router
from app.services.embedding import build_chunks_from_profile, store_embedding


def _load_prompt(name: str) -> str:
    path = Path(__file__).parent / "prompts" / name
    return path.read_text(encoding="utf-8")


def _safe_text(text: str | None) -> str:
    """
    Loại bỏ tất cả ký tự không hợp lệ trong PostgreSQL TEXT:
    - Null bytes (\x00 / \u0000) — gây lỗi '22P05'
    - Các ký tự điều khiển C0/C1 khác (trừ tab, newline, carriage return)
    """
    if not text:
        return ""
    # Xóa null byte và các ký tự điều khiển nguy hiểm
    cleaned = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)
    return cleaned.strip()


async def parse_documents(
    session_id: str,
    cv_text: str,
    jd_text: str | None,
    position: str,
    industry: str | None,
) -> dict[str, Any]:
    # Đảm bảo text sạch trước khi dùng (phòng khi caller không sanitize)
    cv_text = _safe_text(cv_text)
    jd_text = _safe_text(jd_text) if jd_text else None

    settings = get_settings()
    system = _load_prompt("document_parser.txt")
    user_prompt = f"""CV TEXT:
{cv_text[:6000]}

JD TEXT:
{jd_text[:4000] if jd_text else "No JD specified"}

Target Position: {position}
Industry: {industry or "Not specified"}
"""

    data, _ = await llm_router.generate_json(
        user_prompt, system, max_tokens=2200, model=settings.groq_quality_model
    )
    try:
        profile = CandidateProfileData.model_validate(data)
    except Exception as exc:
        # JSON sai cau truc nang -> giu profile rong de pipeline khong sap;
        # cau hoi van tao duoc dua tren CV text / vi tri.
        import logging
        logging.getLogger(__name__).warning("Failed to validate candidate profile schema: %s. Raw data: %s", exc, data)
        profile = CandidateProfileData()

    session = db.get_session(session_id)
    if not session:
        raise ValueError("Session not found")

    profile_dict = profile.model_dump()
    db.upsert_candidate_profile(
        session_id,
        {
            "skills": profile_dict["skills"],
            "experiences": profile_dict["experiences"],
            "projects": profile_dict["projects"],
            "education": profile_dict["education"],
            "achievements": profile_dict["achievements"],
            "jd_gap_analysis": profile_dict["jd_gap_analysis"],
        },
    )

    chunks = build_chunks_from_profile(profile_dict)
    if jd_text:
        chunks.append(("jd", jd_text[:1000]))

    for idx, (section, text) in enumerate(chunks):
        store_embedding(session["cv_document_id"], session_id, idx, section, text)

    db.update_document(
        session["cv_document_id"],
        {
            "parse_status": "done",
            "raw_text": cv_text,
            "parsed_profile": profile_dict,
        },
    )
    if session.get("jd_document_id") and jd_text:
        db.update_document(session["jd_document_id"], {"parse_status": "done", "raw_text": jd_text})

    return profile_dict
