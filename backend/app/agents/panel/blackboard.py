"""Đọc/ghi & thao tác blackboard (PanelState) của hội đồng phỏng vấn."""

import logging

from app.agents.schemas import Goal, PanelState
from app.core.database import db

logger = logging.getLogger(__name__)


def load_state(session_id: str) -> PanelState:
    """Nạp blackboard của phiên; trả PanelState rỗng nếu chưa khởi tạo."""
    raw = db.get_panel_state(session_id)
    if not raw:
        return PanelState()
    try:
        return PanelState.model_validate(raw)
    except Exception as exc:  # noqa: BLE001
        logger.warning("panel_state hỏng, dùng state rỗng: %s", exc)
        return PanelState()


def save_state(session_id: str, state: PanelState) -> None:
    """Ghi blackboard xuống DB."""
    db.save_panel_state(session_id, state.model_dump())


def get_goal(state: PanelState, goal_id: str | None) -> Goal | None:
    if not goal_id:
        return None
    for g in state.goals:
        if g.id == goal_id:
            return g
    return None


def open_goals(state: PanelState) -> list[Goal]:
    """Các mục tiêu chưa đánh giá xong, sắp theo ưu tiên (1 cao nhất)."""
    pending = [g for g in state.goals if g.status in ("open", "probing")]
    return sorted(pending, key=lambda g: (g.priority, g.id))


def is_complete(state: PanelState) -> bool:
    """Hết mục tiêu để hỏi hoặc đã đạt ngân sách câu hỏi."""
    if state.budget.asked_count >= state.budget.max_questions:
        return True
    return not open_goals(state)
