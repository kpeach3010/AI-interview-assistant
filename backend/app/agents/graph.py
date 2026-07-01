"""LangGraph 'crew' offline có vòng tự phản biện (self-critique).

- Question crew: generate_questions -> critique_questions -> (lặp nếu QA yêu cầu,
  tối đa 2 vòng) -> plan_goals. Nhận `profile` đã parse (caching giữ ở pipeline).
- Eval crew: evaluate -> critique_report (soát & ghi log, không tạo lại báo cáo).
"""

import logging
from typing import TypedDict

from langgraph.graph import END, StateGraph

from app.agents.evaluator_agent import evaluate_session
from app.agents.panel.panel_planner import plan_goals
from app.agents.panel.question_critic import QuestionCritic
from app.agents.panel.report_critic import ReportCritic
from app.agents.question_generator_agent import generate_questions

logger = logging.getLogger(__name__)

_MAX_QGEN_ITERATIONS = 2


# ---------------------------------------------------------------------------
# Question crew (sinh câu hỏi + QA + lập goals)
# ---------------------------------------------------------------------------
class QuestionState(TypedDict, total=False):
    session_id: str
    profile: dict
    position: str
    industry: str | None
    language: str
    jd_text: str | None
    qgen_iteration: int
    critique: dict | None


def _feedback_from_critique(critique: dict | None) -> str | None:
    if not critique:
        return None
    gaps = critique.get("coverage_gaps") or []
    issues = critique.get("issues") or []
    if not gaps and not issues:
        return None
    parts = []
    if gaps:
        parts.append("Thiếu phủ (coverage gaps): " + "; ".join(str(g) for g in gaps))
    if issues:
        parts.append("Vấn đề cần sửa: " + "; ".join(str(i) for i in issues))
    return "\n".join(parts)


async def node_generate_questions(state: QuestionState) -> QuestionState:
    feedback = _feedback_from_critique(state.get("critique"))
    await generate_questions(
        state["session_id"],
        state.get("profile") or {},
        state["position"],
        state.get("industry"),
        state.get("language", "vi"),
        jd_text=state.get("jd_text"),
        feedback=feedback,
    )
    return {**state, "qgen_iteration": state.get("qgen_iteration", 0) + 1}


async def node_critique_questions(state: QuestionState) -> QuestionState:
    critique = await QuestionCritic().review(state["session_id"], state["position"])
    data = critique.model_dump()
    if data.get("needs_revision"):
        logger.info(
            "[QuestionCritic] session=%s cần sinh lại (vòng %d): gaps=%s",
            state["session_id"],
            state.get("qgen_iteration", 1),
            data.get("coverage_gaps"),
        )
    return {**state, "critique": data}


def _route_after_critique(state: QuestionState) -> str:
    critique = state.get("critique") or {}
    iteration = state.get("qgen_iteration", 1)
    if critique.get("needs_revision") and iteration < _MAX_QGEN_ITERATIONS:
        return "generate_questions"
    return "plan_goals"


async def node_plan_goals(state: QuestionState) -> QuestionState:
    # Không để lỗi lập goals (VD chưa chạy migration panel_state) làm hỏng cả
    # pipeline sinh câu hỏi. Thất bại thì live panel sẽ tự lập goals lười sau.
    try:
        await plan_goals(state["session_id"])
    except Exception as exc:  # noqa: BLE001
        logger.warning("plan_goals lỗi (bỏ qua): %s", exc)
    return state


def build_question_graph():
    graph = StateGraph(QuestionState)
    graph.add_node("generate_questions", node_generate_questions)
    graph.add_node("critique_questions", node_critique_questions)
    graph.add_node("plan_goals", node_plan_goals)
    graph.set_entry_point("generate_questions")
    graph.add_edge("generate_questions", "critique_questions")
    graph.add_conditional_edges(
        "critique_questions",
        _route_after_critique,
        {"generate_questions": "generate_questions", "plan_goals": "plan_goals"},
    )
    graph.add_edge("plan_goals", END)
    return graph.compile()


# ---------------------------------------------------------------------------
# Eval crew (chấm điểm + soát báo cáo)
# ---------------------------------------------------------------------------
class EvalState(TypedDict, total=False):
    session_id: str
    result: dict | None
    critique: dict | None


async def node_evaluate(state: EvalState) -> EvalState:
    result = await evaluate_session(state["session_id"])
    return {**state, "result": result}


async def node_critique_report(state: EvalState) -> EvalState:
    critique = await ReportCritic().review(state.get("result") or {})
    data = critique.model_dump()
    if data.get("needs_revision"):
        logger.warning(
            "[ReportCritic] session=%s báo cáo cần soát lại: %s",
            state["session_id"],
            data.get("issues"),
        )
    return {**state, "critique": data}


def build_eval_graph():
    graph = StateGraph(EvalState)
    graph.add_node("evaluate", node_evaluate)
    graph.add_node("critique_report", node_critique_report)
    graph.set_entry_point("evaluate")
    graph.add_edge("evaluate", "critique_report")
    graph.add_edge("critique_report", END)
    return graph.compile()


# Compile 1 lần, tái sử dụng.
_question_graph = None
_eval_graph = None


def question_graph():
    global _question_graph
    if _question_graph is None:
        _question_graph = build_question_graph()
    return _question_graph


def eval_graph():
    global _eval_graph
    if _eval_graph is None:
        _eval_graph = build_eval_graph()
    return _eval_graph
