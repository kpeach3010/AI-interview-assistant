import logging
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.agents.schemas import ReportSummary
from app.core.config import get_settings
from app.core.llm_router import llm_router

logger = logging.getLogger(__name__)


class CvReviewResult(BaseModel):
    cv_score: float
    general_critique: str
    spelling_grammar_issues: list[str] = Field(default_factory=list)
    annotated_cv_markdown: str = ""
    # Từ khoá quan trọng trong JD nhưng chưa xuất hiện trong CV (ATS gap).
    ats_keywords_missing: list[str] = Field(default_factory=list)

    @field_validator("spelling_grammar_issues", "ats_keywords_missing", mode="before")
    @classmethod
    def _clean_str_list(cls, value: Any) -> Any:
        if isinstance(value, list):
            return [str(v) for v in value if v is not None and str(v).strip()]
        return value


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

    from datetime import datetime
    current_year = datetime.now().year
    system_template = _load_prompt("cv_reviewer.txt")
    system = system_template.format(
        language="Tiếng Việt" if language == "vi" else "English",
        current_year=current_year
    )

    user_prompt = f"""CV TEXT:
{cv_text[:6000]}

JD TEXT:
{jd_text[:4000] if jd_text else "No JD specified"}

Target Position: {position}
Industry: {industry or "Not specified"}
"""

    settings = get_settings()
    try:
        import re
        text, _ = await llm_router.generate(
            user_prompt, system, max_tokens=6000, model=settings.groq_quality_model
        )
        
        def extract_tag(tag: str, default: str = "") -> str:
            match = re.search(f"<{tag}>(.*?)</{tag}>", text, re.DOTALL | re.IGNORECASE)
            return match.group(1).strip() if match else default
            
        def extract_list(tag: str) -> list[str]:
            content = extract_tag(tag)
            if not content: return []
            return [line.strip("- ").strip() for line in content.split("\n") if line.strip("- ").strip()]

        # Parse suggestions
        import json
        suggestions = []
        suggestions_content = extract_tag("suggestions")
        if suggestions_content:
            suggestion_blocks = re.findall(r"<suggestion>(.*?)</suggestion>", suggestions_content, re.DOTALL | re.IGNORECASE)
            for block in suggestion_blocks:
                orig = re.search(r"<original>(.*?)</original>", block, re.DOTALL | re.IGNORECASE)
                imp = re.search(r"<improved>(.*?)</improved>", block, re.DOTALL | re.IGNORECASE)
                sev = re.search(r"<severity>(.*?)</severity>", block, re.DOTALL | re.IGNORECASE)
                exp = re.search(r"<explanation>(.*?)</explanation>", block, re.DOTALL | re.IGNORECASE)
                
                if orig and imp:
                    suggestions.append({
                        "original": orig.group(1).strip(),
                        "improved": imp.group(1).strip(),
                        "severity": sev.group(1).strip() if sev else "medium",
                        "explanation": exp.group(1).strip() if exp else ""
                    })
            
            # Fallback nếu AI trả về text chung chung trong <suggestions> mà quên dùng thẻ con <suggestion>
            if not suggestions and len(suggestions_content.strip()) > 20:
                suggestions.append({
                    "original": "Toàn bộ cấu trúc / Hướng đi của CV",
                    "improved": "Viết lại theo định hướng phù hợp hơn với JD",
                    "severity": "high",
                    "explanation": suggestions_content.strip()
                })
                
        # Lớp dự phòng cuối cùng: Nếu vẫn không có suggestion nào, dùng critique làm suggestion
        if not suggestions:
            critique = extract_tag("critique", "")
            logger.warning("No suggestions parsed! critique length: %d", len(critique.strip()))
            if len(critique.strip()) > 10:
                suggestions.append({
                    "original": "Định hướng nội dung CV",
                    "improved": "Tham khảo đánh giá chung để điều chỉnh toàn diện",
                    "severity": "high",
                    "explanation": critique.strip()
                })
                logger.info("Applied final fallback suggestion.")
        
        annotated_cv_json = json.dumps(suggestions, ensure_ascii=False)
        logger.info("Final annotated_cv_json length: %d", len(annotated_cv_json))

        score_str = extract_tag("score", "5.0")
        try:
            score = float(score_str)
        except ValueError:
            score = 5.0
            
        logger.info("Returning success dict. cv_score: %s, has_annotated: %s", score, bool(annotated_cv_json))
        return {
            "cv_score": score,
            "general_critique": extract_tag("critique", ""),
            "spelling_grammar_issues": extract_list("spelling_issues"),
            "annotated_cv_markdown": annotated_cv_json,
            "ats_keywords_missing": extract_list("ats_missing"),
        }
    except Exception as exc:
        logger.exception("Failed to review CV via LLM: %s", exc)
        # Giữ kết quả dự phòng an toàn để không sập luồng
        return {
            "cv_score": 5.0,
            "general_critique": "Hệ thống gặp sự cố khi tự động chấm điểm và đánh giá chi tiết CV.",
            "spelling_grammar_issues": [],
            "annotated_cv_markdown": "[]",
            "ats_keywords_missing": [],
        }
