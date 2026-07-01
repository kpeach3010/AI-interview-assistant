"""Lớp cơ sở chuẩn hoá 'một vai trò trong đội ngũ' multi-agent.

Mỗi agent (Lead, Scorekeeper, chuyên gia, critic...) kế thừa BaseAgent để dùng
chung: nạp prompt template, gọi llm_router (chọn model tier), validate schema và
log nhất quán. Toàn bộ hạ tầng LLM tái sử dụng app.core.llm_router.
"""

import logging
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from app.core.config import get_settings
from app.core.llm_router import llm_router

logger = logging.getLogger(__name__)

_PROMPTS_DIR = Path(__file__).parent / "prompts"


def load_prompt(name: str) -> str:
    """Nạp prompt template từ thư mục prompts/."""
    return (_PROMPTS_DIR / name).read_text(encoding="utf-8")


class BaseAgent:
    """Vai trò LLM tối giản. Đặt thuộc tính lớp rồi gọi run_json().

    - name: nhãn để log.
    - prompt_file: tên file trong prompts/ dùng làm system prompt (tùy chọn).
    - use_quality_model: True -> dùng groq_quality_model (tác vụ cần chất lượng).
    - max_tokens: giới hạn token đầu ra.
    """

    name: str = "agent"
    prompt_file: str | None = None
    use_quality_model: bool = False
    max_tokens: int = 512

    def __init__(self) -> None:
        self._system_template: str = load_prompt(self.prompt_file) if self.prompt_file else ""

    def system_prompt(self, **kwargs: Any) -> str:
        """Trả system prompt, có thể format với tham số (an toàn nếu thiếu key)."""
        if kwargs and self._system_template:
            try:
                return self._system_template.format(**kwargs)
            except (KeyError, IndexError, ValueError):
                return self._system_template
        return self._system_template

    async def run_json(
        self,
        user_prompt: str,
        *,
        system: str | None = None,
        schema: type[BaseModel] | None = None,
        max_tokens: int | None = None,
        **system_fmt: Any,
    ) -> Any:
        """Gọi LLM ở chế độ JSON. Nếu có `schema` thì validate & trả model, ngược
        lại trả dict thô. Ném lỗi lên trên để caller quyết định fallback."""
        settings = get_settings()
        model = settings.groq_quality_model if self.use_quality_model else None
        sys = system if system is not None else self.system_prompt(**system_fmt)
        data, provider = await llm_router.generate_json(
            user_prompt,
            sys,
            max_tokens=max_tokens or self.max_tokens,
            model=model,
        )
        logger.info("[%s] provider=%s", self.name, provider)
        if schema is not None:
            return schema.model_validate(data)
        return data
