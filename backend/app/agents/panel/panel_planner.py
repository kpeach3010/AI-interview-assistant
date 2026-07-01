"""Panel Planner — suy ra 'bảng mục tiêu' (goals) cho buổi phỏng vấn.

Cách làm: gom nhóm ngân hàng câu hỏi đã sinh sẵn theo đích (project/skill/JD) một
cách TẤT ĐỊNH, dùng jd_gap_analysis để nâng ưu tiên các khoảng trống, rồi (tùy
chọn) 1 LLM call tinh chỉnh nhãn/ưu tiên cho dễ đọc. Kết quả lưu vào blackboard.
"""

import json
import logging
import re
from typing import Any

from app.agents.base_agent import BaseAgent
from app.agents.panel import blackboard
from app.agents.schemas import Goal, PanelBudget
from app.core.config import get_settings
from app.core.database import db

logger = logging.getLogger(__name__)

_WS = re.compile(r"\s+")
_PUNCT = re.compile(r"[^\w\s]")


def _norm(text: str) -> str:
    return _WS.sub(" ", _PUNCT.sub("", str(text or "").lower())).strip()


def _sc(question: dict[str, Any]) -> dict[str, Any]:
    sc = question.get("source_context")
    if isinstance(sc, str):
        try:
            sc = json.loads(sc)
        except (ValueError, TypeError):
            sc = None
    return sc if isinstance(sc, dict) else {}


def _target_label(sc: dict[str, Any]) -> str:
    for key in ("project_name", "evidence_quote", "cv_section"):
        v = sc.get(key)
        if v and str(v).strip():
            return str(v).strip()
    return ""


def _source_of(sc: dict[str, Any]) -> str:
    section = _norm(sc.get("cv_section", ""))
    if "jd" in section or "requirement" in section:
        return "jd_requirement"
    if "project" in section:
        return "cv_project"
    if "skill" in section:
        return "skill"
    return "cv"


class _GoalRefiner(BaseAgent):
    name = "PanelPlanner"
    prompt_file = "panel_planner.txt"
    use_quality_model = True
    max_tokens = 900


async def _refine_labels(goals: list[Goal], jd: dict[str, Any]) -> None:
    """1 LLM call tùy chọn: tinh chỉnh label (tiếng Việt gọn) + priority. Chỉ cập
    nhật label/priority theo id, KHÔNG đụng question_ids. Lỗi thì bỏ qua."""
    try:
        payload = [
            {"id": g.id, "label": g.label, "category": g.category, "questions": len(g.question_ids)}
            for g in goals
        ]
        user_prompt = (
            "Goals hiện tại (JSON):\n"
            f"{json.dumps(payload, ensure_ascii=False)}\n\n"
            "JD gap analysis:\n"
            f"weak_areas: {jd.get('weak_areas', [])}\n"
            f"missing_keywords: {jd.get('missing_keywords', [])}\n"
            f"matched_skills: {jd.get('matched_skills', [])}\n"
        )
        data = await _GoalRefiner().run_json(user_prompt)
        refined = data.get("goals") if isinstance(data, dict) else None
        if not isinstance(refined, list):
            return
        by_id = {g.id: g for g in goals}
        for item in refined:
            if not isinstance(item, dict):
                continue
            g = by_id.get(str(item.get("id", "")))
            if not g:
                continue
            label = str(item.get("label", "")).strip()
            if label:
                g.label = label
            pr = item.get("priority")
            if isinstance(pr, int) and 1 <= pr <= 3:
                g.priority = pr
    except Exception as exc:  # noqa: BLE001
        logger.info("Refine goals bỏ qua (dùng bản tất định): %s", exc)


async def plan_goals(session_id: str) -> list[Goal]:
    """Suy ra & lưu goals vào blackboard. Trả danh sách goals."""
    settings = get_settings()
    questions = db.list_questions(session_id, main_only=True)
    profile = db.get_candidate_profile(session_id) or {}
    jd = profile.get("jd_gap_analysis") or {}

    # Từ khoá khoảng trống JD -> để nâng ưu tiên goal tương ứng.
    weak_terms = {
        _norm(t)
        for t in (jd.get("weak_areas") or []) + (jd.get("missing_keywords") or [])
        if str(t).strip()
    }

    # Gom nhóm câu hỏi theo (đích, category) một cách tất định.
    groups: dict[str, dict[str, Any]] = {}
    order: list[str] = []
    for q in questions:
        sc = _sc(q)
        label = _target_label(sc) or q.get("category", "technical")
        category = q.get("category", "technical")
        key = f"{_norm(label)}|{category}"
        grp = groups.get(key)
        if grp is None:
            grp = {"label": label, "category": category, "source": _source_of(sc), "qids": []}
            groups[key] = grp
            order.append(key)
        grp["qids"].append(q["id"])

    goals: list[Goal] = []
    for i, key in enumerate(order):
        grp = groups[key]
        label_norm = _norm(grp["label"])
        # Ưu tiên: khoảng trống JD > mặc định > screening.
        if any(term and (term in label_norm or label_norm in term) for term in weak_terms):
            priority = 1
        elif grp["category"] == "screening":
            priority = 3
        else:
            priority = 2
        goals.append(
            Goal(
                id=f"g{i}",
                label=grp["label"],
                category=grp["category"],
                source=grp["source"],
                priority=priority,
                question_ids=grp["qids"],
            )
        )

    if goals:
        await _refine_labels(goals, jd)

    state = blackboard.load_state(session_id)
    state.goals = goals
    max_q = settings.panel_max_questions
    state.budget = PanelBudget(
        max_questions=min(max_q, len(questions)) if questions else max_q,
        asked_count=0,
    )
    state.current_goal_id = None
    state.current_specialist = None
    state.turn = 0
    blackboard.save_state(session_id, state)

    logger.info("[PanelPlanner] session=%s tạo %d goals", session_id, len(goals))
    return goals
