"""Hint endpoint: generates a short answer suggestion for the current interview question."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.auth import get_current_user
from app.core.database import db
from app.core.llm_router import llm_router

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sessions", tags=["hint"])


class HintRequest(BaseModel):
    question_text: str
    language: str = "vi"


class HintResponse(BaseModel):
    hint: str
    provider: str


def _build_skills_summary(profile: dict | None) -> str:
    """Extract a rich but compact candidate summary from profile for personalization."""
    if not profile:
        return "Ứng viên chưa có hồ sơ"

    parts: list[str] = []

    skills = profile.get("skills") or []
    if skills:
        skill_names = [
            s.get("name", "") if isinstance(s, dict) else str(s)
            for s in skills[:10]
        ]
        names = ", ".join(filter(None, skill_names))
        if names:
            parts.append(f"Kỹ năng: {names}")

    experiences = profile.get("experiences") or []
    if experiences:
        exp = experiences[0]
        if isinstance(exp, dict):
            title = exp.get("title", "")
            company = exp.get("company", "")
            desc = exp.get("description", "") or exp.get("responsibilities", "")
            exp_line = f"Kinh nghiệm gần nhất: {title} tại {company}".strip(" tại")
            if desc:
                short_desc = str(desc)[:120].rstrip()
                exp_line += f" ({short_desc}...)" if len(str(desc)) > 120 else f" ({short_desc})"
            parts.append(exp_line)

    projects = profile.get("projects") or []
    if projects:
        proj = projects[0]
        if isinstance(proj, dict):
            name = proj.get("name", "")
            tech = proj.get("technologies", "") or proj.get("tech_stack", "")
            if name:
                proj_line = f"Dự án tiêu biểu: {name}"
                if tech:
                    proj_line += f" (công nghệ: {str(tech)[:80]})"
                parts.append(proj_line)

    achievements = profile.get("achievements") or []
    if achievements:
        ach = achievements[0]
        ach_text = ach.get("description", "") if isinstance(ach, dict) else str(ach)
        if ach_text:
            parts.append(f"Thành tích nổi bật: {str(ach_text)[:100]}")

    return "\n".join(parts) if parts else "Ứng viên phổ thông"


def _build_prompt(question_text: str, candidate_summary: str, position: str, language: str) -> str:
    """Build a structured, personalized prompt optimized for Groq free tier token budget."""
    if language == "vi":
        return (
            f"Vị trí ứng tuyển: {position}\n"
            f"Câu hỏi phỏng vấn: \"{question_text}\"\n\n"
            f"Thông tin của bạn:\n{candidate_summary}\n\n"
            f"Viết 3 gợi ý ngắn giúp bạn trả lời tốt câu hỏi trên, phù hợp với vị trí {position}.\n"
            f"Viết theo ngôi thứ hai, nói thẳng với người đọc: dùng 'Hãy...', 'Bạn có thể...', 'Nêu...', 'Trình bày...' — KHÔNG dùng 'Gợi ý ứng viên...', 'Khuyến khích ứng viên...'.\n"
            f"Chỉ đề cập kỹ năng và kinh nghiệm có liên quan trực tiếp đến câu hỏi. Bỏ qua thông tin không liên quan.\n\n"
            f"Format mỗi điểm: • [Từ khóa ngắn]: nội dung gợi ý hành động cụ thể (tối đa 30 từ).\n"
            f"Tiếng Việt tự nhiên, rõ ràng. Chỉ trả về đúng 3 dòng bullet."
        )
    return (
        f"Position applied: {position}\n"
        f"Interview question: \"{question_text}\"\n\n"
        f"Your background:\n{candidate_summary}\n\n"
        f"Write 3 short hints to help you answer the question well, relevant to the {position} role.\n"
        f"Speak directly in second person: use 'Describe...', 'Highlight...', 'Mention...' — NOT 'The candidate should...'.\n"
        f"Only mention skills and experience directly relevant to the question. Ignore unrelated info.\n\n"
        f"Format: • [Short keyword]: specific actionable advice (max 30 words).\n"
        f"Clear, natural English. Return only the 3 bullet lines."
    )



@router.post("/{session_id}/hint", response_model=HintResponse)
async def get_answer_hint(
    session_id: str,
    body: HintRequest,
    user: Annotated[dict, Depends(get_current_user)],
) -> HintResponse:
    """Generate a short 3-bullet hint for the current interview question."""
    session = db.get_session(session_id, user["sub"])
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session["status"] not in ("active", "ready"):
        raise HTTPException(status_code=400, detail="Session is not active")

    if not body.question_text.strip():
        raise HTTPException(status_code=400, detail="question_text is required")

    profile = db.get_candidate_profile(session_id)
    candidate_summary = _build_skills_summary(profile)
    position = session.get("position_applied") or "vị trí chưa xác định"

    prompt = _build_prompt(body.question_text, candidate_summary, position, body.language)

    system_msg = (
        "Bạn là coach phỏng vấn. Viết gợi ý theo ngôi thứ hai, nói thẳng với người đọc ('Hãy', 'Bạn có thể', 'Nêu'). "
        "KHÔNG viết 'Gợi ý ứng viên', 'Khuyến khích ứng viên' hay bất kỳ ngôi thứ ba nào khác. "
        "Chỉ trả về đúng 3 dòng bullet theo format yêu cầu."
    )

    try:
        hint_text, provider = await llm_router.generate(
            prompt,
            system=system_msg,
            prefer="groq",
            max_tokens=384,
        )
    except Exception as exc:
        logger.error("Hint generation failed for session %s: %s", session_id, exc)
        raise HTTPException(status_code=500, detail="Failed to generate hint") from exc

    hint_text = hint_text.strip()

    return HintResponse(hint=hint_text, provider=provider)
