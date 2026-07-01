import json
import logging
import re
from pathlib import Path
from typing import Any

from app.core.config import get_settings
from app.core.database import db
from app.core.llm_router import llm_router

logger = logging.getLogger(__name__)

# Persona + quy tắc liêm chính dùng chung, nạp 1 lần ở cấp module.
_PERSONA = (Path(__file__).parent / "prompts" / "interviewer_persona.txt").read_text(
    encoding="utf-8"
)

# Tối đa số lần "thăm dò" (đào sâu / vớt / hỏi lại) trên MỘT câu hỏi chính.
_ATTEMPT_CAP = 2

_WS = re.compile(r"\s+")


def _normalize(text: str) -> str:
    """Chuẩn hoá nhẹ để so khớp 'đích' của câu hỏi (không phân biệt hoa/thường,
    gộp khoảng trắng)."""
    return _WS.sub(" ", str(text or "").strip().casefold())


def _source_context(question: dict[str, Any]) -> dict[str, Any]:
    """Lấy source_context an toàn (Supabase có thể trả dict hoặc chuỗi JSON)."""
    sc = question.get("source_context")
    if isinstance(sc, str):
        try:
            sc = json.loads(sc)
        except (ValueError, TypeError):
            sc = None
    return sc if isinstance(sc, dict) else {}


def _target_key(question: dict[str, Any]) -> str:
    """'Đích' năng lực/đối tượng mà câu hỏi nhắm tới, để nhóm các câu cùng mảng."""
    sc = _source_context(question)
    for key in ("project_name", "evidence_quote", "cv_section"):
        value = sc.get(key)
        if value and str(value).strip():
            return _normalize(str(value))
    return ""


def _advance_past_same_target(
    main_questions: list[dict[str, Any]], idx: int, current_q: dict[str, Any]
) -> int:
    """Trả về index câu hỏi chính kế tiếp có 'đích' KHÁC câu hiện tại — dùng khi
    ứng viên đã lộ rõ khoảng trống ở một mảng, để không hỏi lặp mảng đó nữa.
    Nếu không xác định được đích thì chỉ nhích 1 (fallback an toàn)."""
    current_key = _target_key(current_q)
    nxt = idx + 1
    if not current_key:
        return nxt
    while nxt < len(main_questions) and _target_key(main_questions[nxt]) == current_key:
        nxt += 1
    return nxt


def _complete_message(language: str) -> dict[str, Any]:
    msg = (
        "Cảm ơn bạn. Buổi phỏng vấn đã kết thúc."
        if language == "vi"
        else "Thank you. The interview is now complete."
    )
    return {"action": "complete", "message": msg}


def _make_probe(
    session_id: str,
    current_q: dict[str, Any],
    idx: int,
    total: int,
    text: str,
    follow_up_count: int,
) -> dict[str, Any]:
    """Tạo một câu 'thăm dò' (đào sâu / vớt dễ hơn / hỏi lại) gắn với câu hỏi
    chính hiện tại. Tất cả đều lưu is_follow_up=True và tăng bộ đếm thăm dò."""
    db.update_session(session_id, {"follow_up_count": follow_up_count + 1})
    follow_up = db.create_question(
        {
            "session_id": session_id,
            "category": current_q["category"],
            "question_text": text,
            "order_index": current_q["order_index"],
            "is_follow_up": True,
            "parent_question_id": current_q["id"],
        }
    )
    return {
        "action": "follow_up",
        "text": text,
        "question_id": follow_up["id"],
        "question_index": idx,
        "total_questions": total,
    }


def _advance(
    session_id: str,
    main_questions: list[dict[str, Any]],
    next_idx: int,
    language: str,
    rephrased: str | None = None,
) -> dict[str, Any]:
    """Chuyển sang câu hỏi chính tại next_idx (reset bộ đếm thăm dò). Nếu hết câu
    thì kết thúc. `rephrased` (nếu có) là câu chuyển tiếp đã viết lại tự nhiên."""
    db.update_session(
        session_id, {"current_question_index": next_idx, "follow_up_count": 0}
    )
    if next_idx >= len(main_questions):
        return _complete_message(language)

    next_q = main_questions[next_idx]
    final_text = rephrased.strip() if rephrased and rephrased.strip() else next_q["question_text"]
    return {
        "action": "next_question",
        "text": final_text,
        "question_id": next_q["id"],
        "question_index": next_idx,
        "total_questions": len(main_questions),
    }


def _build_prompt(
    *,
    follow_up_count: int,
    chat_history: str,
    current_q: dict[str, Any],
    next_q_text: str,
    low_confidence: bool,
    language: str,
) -> str:
    sc = _source_context(current_q)
    grading = sc.get("grading_criteria") or "(không có tiêu chí cụ thể)"
    project = sc.get("project_name") or "(không có)"
    evidence = sc.get("evidence_quote") or "(không có)"

    stt_hint = (
        "\nLƯU Ý: Hệ thống nhận dạng giọng nói báo độ tin cậy THẤP cho câu trả lời "
        "này — nếu nội dung rời rạc/vô nghĩa, hãy ưu tiên xếp loại 'unintelligible'.\n"
        if low_confidence
        else ""
    )

    return f"""Nhiệm vụ: Đọc câu trả lời CUỐI CÙNG của ứng viên, PHÂN LOẠI chất lượng và QUYẾT ĐỊNH bước tiếp theo.

Số lần đã thăm dò cho câu hỏi chính này: {follow_up_count} (tối đa {_ATTEMPT_CAP}).

Câu hỏi chính đang hỏi: "{current_q['question_text']}"
Năng lực câu hỏi này cần đánh giá: {grading}
Thuật ngữ/đối tượng CHUẨN (dùng đúng chính tả này, KHÔNG lặp lại từ ứng viên/máy nghe sai):
  - project/kỹ năng: {project}
  - bằng chứng CV/JD: {evidence}
Câu hỏi chính dự kiến kế tiếp: "{next_q_text}"
{stt_hint}
Lịch sử trò chuyện gần nhất:
{chat_history}

Chọn action:
- "deepen": ứng viên trả lời có nội dung (substantive) nhưng thiếu Kết quả (Result trong STAR) hoặc có điểm đáng làm rõ → sinh 1 câu đào sâu, xoáy vào chi tiết LIÊN QUAN tới năng lực đang đánh giá.
- "rescue": ứng viên không trả lời được / lạc đề → sinh 1 câu CÙNG lĩnh vực nhưng DỄ/căn bản hơn để cho họ cơ hội.
- "clarify": câu trả lời vô nghĩa nghi do STT sai → nhờ ứng viên nói lại NGẮN GỌN, KHÔNG lặp lại từ nghe sai.
- "next_topic": chuyển sang câu hỏi chính kế tiếp (viết lại `text` cho tự nhiên, liền mạch).
- "advance": tương tự next_topic (chuyển câu), dùng khi câu trả lời đã đủ ý.

Quy tắc bám năng lực: nếu ứng viên lái sang chuyện ngoài lề (VD mức lương cụ thể), KÉO về đúng năng lực câu hỏi, đừng đuổi theo chi tiết đó.

CHỈ trả về JSON:
{{
  "answer_quality": "substantive | partial | cannot_answer | off_topic | hostile | unintelligible",
  "action": "deepen | rescue | clarify | next_topic | advance",
  "text": "Nội dung câu hỏi/câu chuyển tiếp (rỗng nếu chỉ muốn dùng câu kế có sẵn)"
}}
Ngôn ngữ: {language}
"""


async def decide_next_action(
    session_id: str,
    candidate_answer: str,
    language: str,
    low_confidence: bool = False,
) -> dict[str, Any]:
    """Điều phối lượt kế tiếp. Nếu bật hội đồng đa tác nhân thì chạy panel turn
    graph; lỗi bất kỳ -> lùi về luồng tuyến tính cũ (an toàn)."""
    if get_settings().panel_enabled:
        try:
            from app.agents.panel.turn_graph import run_turn

            return await run_turn(session_id, candidate_answer, language, low_confidence)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Panel turn lỗi, lùi về luồng cũ: %s", exc)
    return await _legacy_decide_next_action(session_id, candidate_answer, language, low_confidence)


async def _legacy_decide_next_action(
    session_id: str,
    candidate_answer: str,
    language: str,
    low_confidence: bool = False,
) -> dict[str, Any]:
    session = db.get_session(session_id)
    if not session:
        raise ValueError("Session not found")

    all_questions = db.list_questions(session_id)
    main_questions = [q for q in all_questions if not q.get("is_follow_up")]
    idx = session.get("current_question_index", 0)
    follow_up_count = session.get("follow_up_count", 0)

    if idx >= len(main_questions):
        return _complete_message(language)

    current_q = main_questions[idx]
    total = len(main_questions)
    answer = (candidate_answer or "").strip()

    messages = db.list_messages(session_id)
    recent_messages = messages[-6:] if len(messages) >= 6 else messages
    chat_history_str = ""
    for m in recent_messages:
        role_str = "Interviewer" if m["role"] == "interviewer" else "Candidate"
        chat_history_str += f"{role_str}: {m['content']}\n"

    # Câu trả lời rỗng (im lặng): chuyển thẳng câu kế, khỏi gọi LLM.
    if not answer:
        return _advance(session_id, main_questions, idx + 1, language)

    next_q_text = (
        main_questions[idx + 1]["question_text"]
        if idx + 1 < len(main_questions)
        else "Hết câu hỏi"
    )
    prompt = _build_prompt(
        follow_up_count=follow_up_count,
        chat_history=chat_history_str,
        current_q=current_q,
        next_q_text=next_q_text,
        low_confidence=low_confidence,
        language=language,
    )
    data, _ = await llm_router.generate_json(prompt, _PERSONA, max_tokens=256)
    quality = str(data.get("answer_quality", "partial")).strip().lower()
    proposed = str(data.get("action", "advance")).strip().lower()
    text = (data.get("text") or "").strip()

    # --- Chính sách tất định (Python) ---

    # Chốt chặn vòng lặp: đã thăm dò đủ số lần cho câu này -> buộc chuyển câu.
    if follow_up_count >= _ATTEMPT_CAP:
        # Nếu vẫn không trả lời được, bỏ qua luôn các câu còn lại cùng mảng.
        if quality in ("cannot_answer", "off_topic"):
            next_idx = _advance_past_same_target(main_questions, idx, current_q)
            return _advance(session_id, main_questions, next_idx, language)
        return _advance(session_id, main_questions, idx + 1, language)

    # Ứng viên bế tắc / lạc đề: thử VỚT 1 lần, sau đó chuyển mảng + bỏ câu cùng mảng.
    if quality in ("cannot_answer", "off_topic"):
        if follow_up_count == 0 and text:
            return _make_probe(session_id, current_q, idx, total, text, follow_up_count)
        next_idx = _advance_past_same_target(main_questions, idx, current_q)
        return _advance(session_id, main_questions, next_idx, language)

    # Nghi STT sai: nhờ nói lại đúng 1 lần (không nhại từ sai), rồi thôi.
    if quality == "unintelligible":
        if follow_up_count == 0 and text:
            return _make_probe(session_id, current_q, idx, total, text, follow_up_count)
        return _advance(session_id, main_questions, idx + 1, language)

    # Thù địch: hạ nhiệt chuyên nghiệp rồi sang câu kế, KHÔNG đào sâu.
    if quality == "hostile":
        return _advance(session_id, main_questions, idx + 1, language, rephrased=text or None)

    # Có nội dung: đào sâu nếu LLM đề xuất và còn hạn mức; ngược lại chuyển câu.
    if proposed == "deepen" and text:
        return _make_probe(session_id, current_q, idx, total, text, follow_up_count)

    return _advance(session_id, main_questions, idx + 1, language, rephrased=text or None)


async def get_opening_question(session_id: str) -> dict[str, Any]:
    """Câu mở màn. Panel bật -> Lead chọn mục tiêu/chuyên gia mở màn; lỗi -> cũ."""
    session = db.get_session(session_id)
    if not session:
        raise ValueError("Session not found")

    if get_settings().panel_enabled:
        try:
            from app.agents.panel.turn_graph import opening_turn

            return await opening_turn(session_id, session.get("language", "vi"))
        except Exception as exc:  # noqa: BLE001
            logger.warning("Panel opening lỗi, lùi về luồng cũ: %s", exc)

    return await _legacy_get_opening_question(session_id)


async def _legacy_get_opening_question(session_id: str) -> dict[str, Any]:
    session = db.get_session(session_id)
    if not session:
        raise ValueError("Session not found")

    main_questions = db.list_questions(session_id, main_only=True)
    if not main_questions:
        raise ValueError("No questions generated")

    first = main_questions[0]
    greeting = (
        "Xin chào, tôi là người phỏng vấn bạn hôm này. Chúng ta bắt đầu nhé!"
        if session.get("language") == "vi"
        else "Hello, I will be your interviewer today. Let's begin."
    )

    return {
        "action": "question",
        "greeting": greeting,
        "text": first["question_text"],
        "question_id": first["id"],
        "question_index": 0,
        "total_questions": len(main_questions),
    }
