"""Live panel 'turn graph' (LangGraph): mỗi khi ứng viên trả lời, hội đồng chạy
Scorekeeper -> Lead -> Specialist để quyết định lượt kế tiếp.

Trả về action dict TƯƠNG THÍCH với _emit_action ở websocket:
  {action: "follow_up"|"next_question"|"complete", text, question_id,
   question_index, total_questions, panelist?}

Guardrail tất định (drill/switch/end, cap thăm dò, bỏ mục tiêu đã lộ trống) nằm ở
node_lead để không bao giờ lặp vô hạn. Mọi lỗi được caller (interview_agent) bắt
để lùi về luồng decide_next_action cũ.
"""

import json
import logging
from typing import Any, TypedDict

from langgraph.graph import END, StateGraph

from app.agents.panel import blackboard
from app.agents.panel.lead_orchestrator import LeadOrchestrator
from app.agents.panel.panel_planner import _norm, plan_goals
from app.agents.panel.scorekeeper import Scorekeeper
from app.agents.panel.specialists import Specialist
from app.agents.schemas import AnswerAssessment, Goal, PanelState, TurnDirective
from app.core.config import get_settings
from app.core.database import db

logger = logging.getLogger(__name__)

_ATTEMPT_CAP = 2  # số lần thăm dò tối đa trên một mục tiêu
_EMERGENT_SOURCE = "emergent"


# ---------------------------------------------------------------------------
# Helpers dùng chung
# ---------------------------------------------------------------------------
def _recent_history(session_id: str) -> str:
    messages = db.list_messages(session_id)
    recent = messages[-6:] if len(messages) >= 6 else messages
    out = ""
    for m in recent:
        role = "Interviewer" if m["role"] == "interviewer" else "Candidate"
        out += f"{role}: {m['content']}\n"
    return out


def _questions_by_id(session_id: str) -> dict[str, dict]:
    return {q["id"]: q for q in db.list_questions(session_id)}


def _sc(question: dict[str, Any] | None) -> dict[str, Any]:
    if not question:
        return {}
    sc = question.get("source_context")
    if isinstance(sc, str):
        try:
            sc = json.loads(sc)
        except (ValueError, TypeError):
            sc = None
    return sc if isinstance(sc, dict) else {}


def _goal_context(goal: Goal | None, qbyid: dict[str, dict]) -> tuple[str, str]:
    """(grading_criteria, standard_terms) suy từ câu hỏi đầu tiên của mục tiêu."""
    if not goal:
        return "", ""
    for qid in goal.question_ids:
        sc = _sc(qbyid.get(qid))
        if sc:
            grading = str(sc.get("grading_criteria") or "")
            terms = " / ".join(
                str(sc.get(k)) for k in ("project_name", "evidence_quote") if sc.get(k)
            )
            return grading, terms
    return "", goal.label


def _unused_bank_qid(goal: Goal, used: set[str]) -> str | None:
    for qid in goal.question_ids:
        if qid not in used:
            return qid
    return None


def _is_emergent(goal: Goal) -> bool:
    return goal.source == _EMERGENT_SOURCE


def _selectable_goals(state: PanelState) -> list[Goal]:
    """Mục tiêu có thể hỏi ở lượt tới: còn câu trong kho chưa dùng, HOẶC là mục
    tiêu 'emergent' (sinh động) chưa được bắt đầu."""
    used = set(state.used_question_ids)
    result = []
    for g in blackboard.open_goals(state):
        if _unused_bank_qid(g, used) is not None:
            result.append(g)
        elif _is_emergent(g) and g.status == "open":
            result.append(g)
    return result


def _emergent_count(state: PanelState) -> int:
    return sum(1 for g in state.goals if _is_emergent(g))


def _maybe_add_emergent_goal(state: PanelState, assessment: AnswerAssessment) -> None:
    """Tất định thêm một mục tiêu 'emergent' khi Scorekeeper phát hiện chủ đề đáng
    đào sâu. Có cap và khử trùng nhãn. Mục tiêu này ưu tiên cao để được hỏi sớm."""
    settings = get_settings()
    if not settings.panel_allow_generate:
        return
    topic = (assessment.emergent_topic or "").strip()
    if not topic or not assessment.suggest_new_goal:
        return
    if state.budget.asked_count >= state.budget.max_questions:
        return
    if _emergent_count(state) >= settings.panel_max_emergent_goals:
        return
    topic_norm = _norm(topic)
    for g in state.goals:
        gl = _norm(g.label)
        if topic_norm and (topic_norm in gl or gl in topic_norm):
            return  # đã có mục tiêu gần giống
    new_id = f"e{_emergent_count(state)}"
    state.goals.append(
        Goal(
            id=new_id,
            label=topic,
            category=state.current_specialist or "technical",
            source=_EMERGENT_SOURCE,
            priority=1,
            status="open",
            question_ids=[],
        )
    )
    logger.info("[Panel] thêm emergent goal '%s' (%s)", topic, new_id)


def _create_main_question(session_id: str, goal: Goal, text: str, order_index: int) -> dict:
    """Tạo bản ghi câu hỏi CHÍNH (is_follow_up=False) cho câu sinh động, để client
    hiển thị và evaluator chấm điểm bình thường."""
    return db.create_question(
        {
            "session_id": session_id,
            "category": goal.category,
            "question_text": text,
            "order_index": order_index,
            "is_follow_up": False,
            "source_context": {
                "cv_section": _EMERGENT_SOURCE,
                "project_name": goal.label,
                "grading_criteria": f"Đánh giá độ chính xác và chiều sâu về: {goal.label}",
            },
        }
    )


def _specialist_for(goal: Goal | None, fallback: str | None) -> str:
    if goal and goal.category in ("screening", "technical", "behavioral", "project"):
        return goal.category
    return fallback or "technical"


def _mark_goal(goal: Goal | None, status: str, assessment: AnswerAssessment | None) -> None:
    if not goal:
        return
    goal.status = status
    if assessment:
        goal.confidence = max(goal.confidence, float(assessment.confidence or 0.0))
        if assessment.note:
            goal.evidence.append(assessment.note)


# ---------------------------------------------------------------------------
# LangGraph state
# ---------------------------------------------------------------------------
class TurnState(TypedDict, total=False):
    session_id: str
    candidate_answer: str
    language: str
    low_confidence: bool
    panel: PanelState
    history: str
    qbyid: dict
    assessment: AnswerAssessment
    directive: TurnDirective
    mode: str  # ask | drill | rescue | clarify
    difficulty: str  # harder | same | easier — tín hiệu cho câu kế
    follow_up_count: int
    action: dict


# ---------------------------------------------------------------------------
# Nodes
# ---------------------------------------------------------------------------
async def node_assess(state: TurnState) -> TurnState:
    session_id = state["session_id"]
    panel = blackboard.load_state(session_id)
    qbyid = _questions_by_id(session_id)
    history = _recent_history(session_id)
    session = db.get_session(session_id) or {}
    follow_up_count = session.get("follow_up_count", 0)

    current_goal = blackboard.get_goal(panel, panel.current_goal_id)
    grading, _terms = _goal_context(current_goal, qbyid)

    assessment = await Scorekeeper().assess(
        candidate_answer=state["candidate_answer"],
        goal_label=current_goal.label if current_goal else "(chưa xác định)",
        grading=grading,
        history=history,
        language=state["language"],
        low_confidence=state.get("low_confidence", False),
    )
    assessment.goal_id = current_goal.id if current_goal else None
    return {
        **state,
        "panel": panel,
        "qbyid": qbyid,
        "history": history,
        "assessment": assessment,
        "follow_up_count": follow_up_count,
    }


async def node_lead(state: TurnState) -> TurnState:
    panel: PanelState = state["panel"]
    assessment: AnswerAssessment = state["assessment"]
    follow_up_count = state["follow_up_count"]
    current_goal = blackboard.get_goal(panel, panel.current_goal_id)
    quality = assessment.answer_quality
    difficulty = assessment.difficulty_adjust

    mode = "ask"
    directive = TurnDirective(action="switch_goal")

    # Chủ đề nổi lên -> thêm mục tiêu 'emergent' (ưu tiên cao) để được hỏi sớm.
    _maybe_add_emergent_goal(panel, assessment)

    # Chốt chặn ngân sách: đã hỏi đủ số câu -> kết thúc (kể cả không drill thêm).
    if panel.budget.asked_count >= panel.budget.max_questions:
        _mark_goal(current_goal, "covered", assessment)
        return {
            **state,
            "directive": TurnDirective(action="end", reason="Đạt ngân sách câu hỏi."),
            "mode": mode,
            "difficulty": difficulty,
            "panel": panel,
        }

    def _switch() -> TurnDirective:
        # Hết ngân sách hoặc không còn mục tiêu có câu hỏi -> kết thúc.
        if panel.budget.asked_count >= panel.budget.max_questions:
            return TurnDirective(action="end", reason="Đạt ngân sách câu hỏi.")
        candidates = _selectable_goals(panel)
        if not candidates:
            return TurnDirective(action="end", reason="Đã phủ hết mục tiêu.")
        return None  # sẽ để Lead chọn

    # --- Chính sách tất định về LOẠI hành động ---
    if quality == "substantive" and (assessment.covered or assessment.is_strength):
        _mark_goal(current_goal, "strength_confirmed" if assessment.is_strength else "covered", assessment)
        directive = _switch() or await LeadOrchestrator().choose(
            open_goals=_selectable_goals(panel),
            exclude_id=panel.current_goal_id,
            budget_left=panel.budget.max_questions - panel.budget.asked_count,
            language=state["language"],
        )
    elif quality in ("cannot_answer", "off_topic"):
        if follow_up_count == 0:
            mode = "rescue"
            directive = TurnDirective(
                action="drill",
                target_goal_id=panel.current_goal_id,
                specialist=_specialist_for(current_goal, panel.current_specialist),
                reason="Vớt 1 câu dễ hơn cùng lĩnh vực.",
            )
        else:
            _mark_goal(current_goal, "gap_confirmed", assessment)
            directive = _switch() or await LeadOrchestrator().choose(
                open_goals=_selectable_goals(panel),
                exclude_id=panel.current_goal_id,
                budget_left=panel.budget.max_questions - panel.budget.asked_count,
                language=state["language"],
            )
    elif quality == "unintelligible":
        if follow_up_count == 0:
            mode = "clarify"
            directive = TurnDirective(
                action="drill",
                target_goal_id=panel.current_goal_id,
                specialist=_specialist_for(current_goal, panel.current_specialist),
                reason="Nhờ nói lại (nghi STT sai).",
            )
        else:
            directive = _switch() or await LeadOrchestrator().choose(
                open_goals=_selectable_goals(panel),
                exclude_id=panel.current_goal_id,
                budget_left=panel.budget.max_questions - panel.budget.asked_count,
                language=state["language"],
            )
    elif quality == "hostile":
        directive = _switch() or await LeadOrchestrator().choose(
            open_goals=_selectable_goals(panel),
            exclude_id=panel.current_goal_id,
            budget_left=panel.budget.max_questions - panel.budget.asked_count,
            language=state["language"],
        )
    else:
        # partial / substantive chưa đủ: đào sâu nếu còn hạn mức, ngược lại chuyển.
        if follow_up_count >= _ATTEMPT_CAP:
            _mark_goal(current_goal, "covered", assessment)
            directive = _switch() or await LeadOrchestrator().choose(
                open_goals=_selectable_goals(panel),
                exclude_id=panel.current_goal_id,
                budget_left=panel.budget.max_questions - panel.budget.asked_count,
                language=state["language"],
            )
        else:
            mode = "drill"
            directive = TurnDirective(
                action="drill",
                target_goal_id=panel.current_goal_id,
                specialist=_specialist_for(current_goal, panel.current_specialist),
                reason="Đào sâu để làm rõ.",
            )

    return {**state, "directive": directive, "mode": mode, "difficulty": difficulty, "panel": panel}


async def node_act(state: TurnState) -> TurnState:
    session_id = state["session_id"]
    panel: PanelState = state["panel"]
    directive: TurnDirective = state["directive"]
    mode = state["mode"]
    qbyid: dict = state["qbyid"]
    language = state["language"]
    panel.turn += 1

    total = panel.budget.max_questions

    if directive.action == "end":
        blackboard.save_state(session_id, panel)
        msg = (
            "Cảm ơn bạn. Buổi phỏng vấn đã kết thúc."
            if language == "vi"
            else "Thank you. The interview is now complete."
        )
        return {**state, "action": {"action": "complete", "message": msg}}

    if directive.action == "drill":
        goal = blackboard.get_goal(panel, directive.target_goal_id)
        role = directive.specialist
        grading, terms = _goal_context(goal, qbyid)
        text = await Specialist(role).compose(
            mode=mode,
            goal_label=goal.label if goal else "",
            base_question="",
            grading=grading,
            standard_terms=terms,
            history=state["history"],
            language=language,
            candidate_answer=state["candidate_answer"],
            difficulty=state.get("difficulty", "same"),
        )
        follow_up = db.create_question(
            {
                "session_id": session_id,
                "category": goal.category if goal else "technical",
                "question_text": text,
                "order_index": panel.budget.asked_count,
                "is_follow_up": True,
                "parent_question_id": None,
            }
        )
        db.update_session(session_id, {"follow_up_count": state["follow_up_count"] + 1})
        panel.current_specialist = role
        panel.budget.asked_count += 1
        blackboard.save_state(session_id, panel)
        return {
            **state,
            "action": {
                "action": "follow_up",
                "text": text,
                "question_id": follow_up["id"],
                "question_index": panel.budget.asked_count - 1,
                "total_questions": total,
                "panelist": role,
            },
        }

    # switch_goal -> chọn mục tiêu chọn được, rồi soạn câu (kho hoặc sinh động)
    used = set(panel.used_question_ids)
    goal = blackboard.get_goal(panel, directive.target_goal_id)
    role = directive.specialist
    difficulty = state.get("difficulty", "same")

    def _selectable(g: Goal | None) -> bool:
        return bool(
            g
            and (_unused_bank_qid(g, used) is not None or (_is_emergent(g) and g.status == "open"))
        )

    # Nếu mục tiêu Lead chọn không hợp lệ -> lấy mục tiêu chọn được khác; hết -> end.
    if not _selectable(goal):
        candidates = _selectable_goals(panel)
        goal = candidates[0] if candidates else None
        if goal:
            role = _specialist_for(goal, role)

    if not goal:
        blackboard.save_state(session_id, panel)
        msg = (
            "Cảm ơn bạn. Buổi phỏng vấn đã kết thúc."
            if language == "vi"
            else "Thank you. The interview is now complete."
        )
        return {**state, "action": {"action": "complete", "message": msg}}

    grading, terms = _goal_context(goal, qbyid)
    is_emergent_ask = _is_emergent(goal) and _unused_bank_qid(goal, used) is None

    if is_emergent_ask:
        # Sinh câu hỏi CHÍNH mới cho chủ đề nổi lên (ngoài kho).
        text = await Specialist(role).compose(
            mode="ask_emergent",
            goal_label=goal.label,
            base_question="",
            grading=grading,
            standard_terms=terms,
            history=state["history"],
            language=language,
            candidate_answer=state["candidate_answer"],
            difficulty=difficulty,
        )
        record = _create_main_question(session_id, goal, text, panel.budget.asked_count)
        qid = record["id"]
        goal.question_ids.append(qid)
    else:
        qid = _unused_bank_qid(goal, used)
        base_q = qbyid.get(qid, {})
        text = await Specialist(role).compose(
            mode="ask",
            goal_label=goal.label,
            base_question=base_q.get("question_text", ""),
            grading=grading,
            standard_terms=terms,
            history=state["history"],
            language=language,
            difficulty=difficulty,
        )

    panel.used_question_ids.append(qid)
    panel.current_goal_id = goal.id
    panel.current_specialist = role
    if goal.status == "open":
        goal.status = "probing"
    panel.budget.asked_count += 1
    db.update_session(
        session_id,
        {"follow_up_count": 0, "current_question_index": panel.budget.asked_count},
    )
    blackboard.save_state(session_id, panel)
    return {
        **state,
        "action": {
            "action": "next_question",
            "text": text,
            "question_id": qid,
            "question_index": panel.budget.asked_count - 1,
            "total_questions": total,
            "panelist": role,
        },
    }


# ---------------------------------------------------------------------------
# Build & run
# ---------------------------------------------------------------------------
def build_turn_graph():
    graph = StateGraph(TurnState)
    graph.add_node("assess", node_assess)
    graph.add_node("lead", node_lead)
    graph.add_node("act", node_act)
    graph.set_entry_point("assess")
    graph.add_edge("assess", "lead")
    graph.add_edge("lead", "act")
    graph.add_edge("act", END)
    return graph.compile()


_turn_graph = None


def turn_graph():
    global _turn_graph
    if _turn_graph is None:
        _turn_graph = build_turn_graph()
    return _turn_graph


async def run_turn(
    session_id: str,
    candidate_answer: str,
    language: str,
    low_confidence: bool = False,
) -> dict:
    """Chạy 1 lượt hội đồng, trả action dict tương thích _emit_action."""
    result = await turn_graph().ainvoke(
        {
            "session_id": session_id,
            "candidate_answer": candidate_answer,
            "language": language,
            "low_confidence": low_confidence,
        }
    )
    return result["action"]


async def opening_turn(session_id: str, language: str) -> dict:
    """Khởi tạo blackboard (nếu cần) và chọn câu hỏi mở màn: mục tiêu ưu tiên cao
    nhất (ưu tiên screening) + chuyên gia phù hợp."""
    panel = blackboard.load_state(session_id)
    if not panel.goals:
        await plan_goals(session_id)
        panel = blackboard.load_state(session_id)
    if not panel.goals:
        raise ValueError("Panel goals empty")

    qbyid = _questions_by_id(session_id)
    # Ưu tiên screening (mở màn nhẹ nhàng), rồi tới priority.
    candidates = _selectable_goals(panel)
    if not candidates:
        raise ValueError("No goal with bank question")
    candidates.sort(key=lambda g: (0 if g.category == "screening" else 1, g.priority))
    goal = candidates[0]
    role = _specialist_for(goal, "screening")

    used = set(panel.used_question_ids)
    qid = _unused_bank_qid(goal, used)
    base_q = qbyid.get(qid, {})
    grading, terms = _goal_context(goal, qbyid)
    text = await Specialist(role).compose(
        mode="ask",
        goal_label=goal.label,
        base_question=base_q.get("question_text", ""),
        grading=grading,
        standard_terms=terms,
        history="",
        language=language,
    )

    panel.used_question_ids.append(qid)
    panel.current_goal_id = goal.id
    panel.current_specialist = role
    goal.status = "probing"
    panel.budget.asked_count = 1
    panel.turn = 1
    db.update_session(session_id, {"follow_up_count": 0, "current_question_index": 1})
    blackboard.save_state(session_id, panel)

    greeting = (
        "Xin chào, chúng tôi là hội đồng phỏng vấn hôm nay. Chúng ta bắt đầu nhé!"
        if language == "vi"
        else "Hello, we are your interview panel today. Let's begin."
    )
    return {
        "action": "question",
        "greeting": greeting,
        "text": text,
        "question_id": qid,
        "question_index": 0,
        "total_questions": panel.budget.max_questions,
        "panelist": role,
    }
