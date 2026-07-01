"""Lead Orchestrator — điều phối viên của hội đồng. Khi cần CHUYỂN mục tiêu, chọn
mục tiêu kế tiếp và phân công chuyên gia phù hợp dựa trên bảng mục tiêu và độ ưu
tiên. Guardrail tất định (drill/switch/end) nằm ở turn_graph; Lead lo phần 'chọn
đánh giá gì tiếp theo cho khôn ngoan'."""

import json
import logging

from app.agents.base_agent import BaseAgent
from app.agents.schemas import Goal, TurnDirective

logger = logging.getLogger(__name__)

# Chuyên gia mặc định theo category của mục tiêu.
_CATEGORY_TO_SPECIALIST = {
    "screening": "screening",
    "technical": "technical",
    "behavioral": "behavioral",
    "project": "project",
}


def _fallback_directive(open_goals: list[Goal], exclude_id: str | None) -> TurnDirective:
    """Chọn mục tiêu ưu tiên cao nhất (khác mục tiêu vừa xong nếu có thể)."""
    candidates = [g for g in open_goals if g.id != exclude_id] or open_goals
    if not candidates:
        return TurnDirective(action="end", reason="Hết mục tiêu để đánh giá.")
    goal = candidates[0]
    return TurnDirective(
        action="switch_goal",
        target_goal_id=goal.id,
        specialist=_CATEGORY_TO_SPECIALIST.get(goal.category, "technical"),
        reason=f"Chuyển sang năng lực ưu tiên: {goal.label}",
    )


class LeadOrchestrator(BaseAgent):
    name = "LeadOrchestrator"
    prompt_file = "lead_orchestrator.txt"
    use_quality_model = False
    max_tokens = 256

    async def choose(
        self,
        *,
        open_goals: list[Goal],
        exclude_id: str | None,
        budget_left: int,
        language: str,
    ) -> TurnDirective:
        if not open_goals:
            return TurnDirective(action="end", reason="Đã phủ hết mục tiêu.")

        payload = [
            {
                "id": g.id,
                "label": g.label,
                "category": g.category,
                "priority": g.priority,
                "status": g.status,
                "has_bank_question": bool(g.question_ids),
            }
            for g in open_goals
        ]
        user_prompt = f"""Số câu hỏi còn lại trong ngân sách: {budget_left}
Mục tiêu vừa đánh giá xong (nên tránh lặp lại): {exclude_id or '(chưa có)'}

Các mục tiêu CÒN MỞ (JSON):
{json.dumps(payload, ensure_ascii=False)}

Chọn mục tiêu kế tiếp để đánh giá và chuyên gia phù hợp. CHỈ trả về JSON:
{{
  "action": "switch_goal",
  "target_goal_id": "<id trong danh sách trên>",
  "specialist": "screening | technical | behavioral | project",
  "reason": "<lý do ngắn gọn>"
}}
Ngôn ngữ: {language}
"""
        try:
            directive: TurnDirective = await self.run_json(user_prompt, schema=TurnDirective)
            # Bảo đảm target hợp lệ; nếu LLM chọn bậy -> fallback.
            valid_ids = {g.id for g in open_goals}
            if directive.action == "switch_goal" and directive.target_goal_id not in valid_ids:
                return _fallback_directive(open_goals, exclude_id)
            return directive
        except Exception as exc:  # noqa: BLE001
            logger.info("Lead lỗi, dùng fallback tất định: %s", exc)
            return _fallback_directive(open_goals, exclude_id)
