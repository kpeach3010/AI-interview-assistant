from typing import Any

from app.core.database import db
from app.core.llm_router import llm_router


async def decide_next_action(
    session_id: str,
    candidate_answer: str,
    language: str,
) -> dict[str, Any]:
    session = db.get_session(session_id)
    if not session:
        raise ValueError("Session not found")

    all_questions = db.list_questions(session_id)
    main_questions = [q for q in all_questions if not q.get("is_follow_up")]
    idx = session.get("current_question_index", 0)
    follow_up_count = session.get("follow_up_count", 0)

    if idx >= len(main_questions):
        msg = "Cảm ơn bạn đã hoàn thành phỏng vấn." if language == "vi" else "Thank you for completing the interview."
        return {"action": "complete", "message": msg}

    current_q = main_questions[idx]

    messages = db.list_messages(session_id)
    recent_messages = messages[-6:] if len(messages) >= 6 else messages
    chat_history_str = ""
    for m in recent_messages:
        role_str = "Interviewer" if m["role"] == "interviewer" else "Candidate"
        chat_history_str += f"{role_str}: {m['content']}\n"

    next_rephrased = None
    if follow_up_count < 2 and len(candidate_answer.strip()) > 10:
        next_q_text = main_questions[idx+1]['question_text'] if idx+1 < len(main_questions) else 'Hết câu hỏi'
        prompt = f"""Bạn là một Chuyên gia Phỏng vấn Cấp cao.
Nhiệm vụ: Đánh giá câu trả lời cuối cùng của ứng viên và quyết định hỏi "đào sâu" (follow-up) HAY chuyển sang câu tiếp theo.

Nguyên tắc:
- Chỉ hỏi đào sâu TỐI ĐA 2 lần cho 1 câu hỏi chính (Đã đào sâu: {follow_up_count} lần).
- Hỏi đào sâu (follow_up) nếu: Câu trả lời thiếu kết quả (Result trong STAR), hoặc có điểm thú vị cần làm rõ. Phải hỏi xoáy vào 1 chi tiết cụ thể ứng viên vừa nói.
- Chuyển câu (next_question) nếu: Ứng viên đã trả lời đủ chi tiết. Khi chuyển, viết lại (rephrase) câu hỏi tiếp theo để tạo sự liên kết tự nhiên.
- VĂN PHONG GIAO TIẾP: Câu hỏi sinh ra (dù là follow-up hay next_question) phải RẤT NGẮN GỌN (dưới 25 từ), tự nhiên như văn nói. KHÔNG gộp 2-3 ý vào một câu.
- TUYỆT ĐỐI KHÔNG dùng câu hỏi đóng (Có/Không). Thay vì hỏi "Bạn có nghĩ rằng...", hãy hỏi "Yếu tố X đã ảnh hưởng như thế nào...".

Lịch sử trò chuyện gần nhất:
{chat_history_str}

Câu hỏi chính đang hỏi: "{current_q['question_text']}"
Câu tiếp theo dự kiến: "{next_q_text}"

Trình bày JSON kết quả:
{{
    "action": "follow_up" | "next_question",
    "text": "Nội dung câu hỏi follow-up HOẶC câu hỏi tiếp theo đã được viết lại cho tự nhiên"
}}
Ngôn ngữ: {language}
"""
        data, _ = await llm_router.generate_json(prompt, "Chỉ trả về JSON hợp lệ.")
        action = data.get("action", "next_question")
        text = data.get("text", "")

        if action == "follow_up" and text:
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
                "total_questions": len(main_questions),
            }

        if action == "next_question" and text:
            next_rephrased = text

    next_idx = idx + 1
    db.update_session(session_id, {"current_question_index": next_idx, "follow_up_count": 0})

    if next_idx >= len(main_questions):
        msg = "Cảm ơn bạn. Buổi phỏng vấn đã kết thúc." if language == "vi" else "Thank you. The interview is now complete."
        return {"action": "complete", "message": msg}

    next_q = main_questions[next_idx]
    final_text = next_rephrased if next_rephrased else next_q["question_text"]
    
    # Update the actual text in DB if it was rephrased
    if next_rephrased:
        # We don't have a direct method to update a single question text in db_service, but it's fine. We return it to websocket.
        pass

    return {
        "action": "next_question",
        "text": final_text,
        "question_id": next_q["id"],
        "question_index": next_idx,
        "total_questions": len(main_questions),
    }


async def get_opening_question(session_id: str) -> dict[str, Any]:
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
