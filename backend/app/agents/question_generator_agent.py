import json
import logging
import re
from pathlib import Path
from typing import Any

from app.agents.schemas import QuestionList
from app.core.config import get_settings
from app.core.database import db
from app.core.llm_router import llm_router

logger = logging.getLogger(__name__)

# Câu hỏi cần nhiều token đầu ra (10-12 câu + tiêu chí chấm) -> nới rộng.
_QGEN_MAX_TOKENS = 2800


def _load_prompt(name: str) -> str:
    path = Path(__file__).parent / "prompts" / name
    return path.read_text(encoding="utf-8")


def _normalize(text: str) -> str:
    """Chuẩn hoá để so trùng câu hỏi gần giống nhau."""
    return re.sub(r"[^\w\s]", "", (text or "").lower()).strip()


def _dedupe_questions(questions: list[Any]) -> list[Any]:
    """Khử các câu hỏi trùng/gần-giống (so theo chuỗi chuẩn hoá)."""
    seen: set[str] = set()
    unique = []
    for q in questions:
        key = _normalize(q.question_text)
        if key and key not in seen:
            seen.add(key)
            unique.append(q)
    return unique


async def generate_questions(
    session_id: str,
    profile: dict[str, Any],
    position: str,
    industry: str | None,
    language: str,
    jd_text: str | None = None,
    feedback: str | None = None,
) -> list[dict[str, Any]]:
    settings = get_settings()
    template = _load_prompt("question_generator.txt")
    system = template.format(language=language, position=position, industry=industry or "")

    # Truyền cả profile (đã parse) lẫn JD thô để câu hỏi bám sát yêu cầu công việc.
    jd_block = f"\n\nJob Description (raw):\n{jd_text[:4000]}" if jd_text else "\n\nJob Description: (không có)"
    # Phản hồi từ QA (Question Critic) ở vòng trước — yêu cầu khắc phục khi sinh lại.
    fb_block = (
        f"\n\nPHẢN HỒI TỪ HỘI ĐỒNG (vòng trước) — HÃY KHẮC PHỤC:\n{feedback}"
        if feedback
        else ""
    )
    user_prompt = f"""Candidate Profile (parsed JSON):
{json.dumps(profile, ensure_ascii=False)[:10000]}
{jd_block}{fb_block}
"""

    data, provider = await llm_router.generate_json(
        user_prompt,
        system,
        max_tokens=_QGEN_MAX_TOKENS,
        model=settings.groq_quality_model,
    )

    logger.info("[QuestionGenerator] provider=%s model=%s", provider, settings.groq_quality_model)

    result = QuestionList.model_validate(data)

    # Hậu kiểm: khử trùng lặp, đánh lại order_index liên tục.
    questions = _dedupe_questions(result.questions)
    for idx, q in enumerate(questions):
        q.order_index = idx

    db.delete_questions(session_id)

    created = []
    for q in questions:
        record = db.create_question(
            {
                "session_id": session_id,
                "category": q.category,
                "question_text": q.question_text,
                "order_index": q.order_index,
                "source_context": q.source_context or {},
            }
        )
        created.append(record)

    logger.info("[QuestionGenerator] session=%s tạo %d câu hỏi", session_id, len(created))
    return created
