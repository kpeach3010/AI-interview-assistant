import logging
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from app.agents.schemas import CvSuggestion
from app.core.config import get_settings
from app.core.llm_router import llm_router

logger = logging.getLogger(__name__)


class CvReviewResult(BaseModel):
    cv_score: float
    general_critique: str
    spelling_grammar_issues: list[str] = Field(default_factory=list)
    cv_suggestions: list[CvSuggestion] = Field(default_factory=list)
    # Từ khoá quan trọng trong JD nhưng chưa xuất hiện trong CV (ATS gap).
    ats_keywords_missing: list[str] = Field(default_factory=list)


def _load_prompt(name: str) -> str:
    path = Path(__file__).parent / "prompts" / name
    return path.read_text(encoding="utf-8")


async def review_cv(
    cv_text: str,
    jd_text: str | None,
    position: str,
    industry: str | None,
    language: str = "vi",
) -> dict[str, Any]:
    """
    Tiến hành phân tích và kiểm toán CV thô một cách khắt khe so với vị trí và JD (nếu có).
    Trả về cấu trúc phân tích gồm điểm số, đánh giá chung, lỗi ngữ pháp và gợi ý chi tiết.
    """
    if not cv_text or not cv_text.strip():
        return {
            "cv_score": 1.0,
            "general_critique": "Không tìm thấy nội dung CV hoặc file CV bị trống.",
            "spelling_grammar_issues": ["Không có nội dung để phân tích."],
            "cv_suggestions": [
                {
                    "section": "Chung",
                    "suggestion": "Vui lòng tải lên một file CV hợp lệ có chứa thông tin kinh nghiệm học vấn.",
                    "priority": "high",
                }
            ],
        }

    system_template = _load_prompt("cv_reviewer.txt")
    system = system_template.format(language="Tiếng Việt" if language == "vi" else "English")

    user_prompt = f"""CV TEXT:
{cv_text[:6000]}

JD TEXT:
{jd_text[:4000] if jd_text else "No JD specified"}

Target Position: {position}
Industry: {industry or "Not specified"}
"""

    settings = get_settings()
    try:
        data, _ = await llm_router.generate_json(
            user_prompt, system, max_tokens=2200, model=settings.groq_quality_model
        )
        result = CvReviewResult.model_validate(data)
        return result.model_dump()
    except Exception as exc:
        logger.exception("Failed to review CV via LLM: %s", exc)
        # Giữ kết quả dự phòng an toàn để không sập luồng
        return {
            "cv_score": 5.0,
            "general_critique": "Hệ thống gặp sự cố khi tự động chấm điểm và đánh giá chi tiết CV.",
            "spelling_grammar_issues": [],
            "cv_suggestions": [
                {
                    "section": "Tổng quan",
                    "suggestion": "Hãy tự rà soát lại lỗi chính tả và bố cục STAR trong CV trước khi gửi cho nhà tuyển dụng.",
                    "priority": "medium",
                }
            ],
        }
