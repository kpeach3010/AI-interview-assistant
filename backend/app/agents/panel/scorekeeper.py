"""Scorekeeper — chấm nhanh câu trả lời cuối theo tiêu chí của mục tiêu hiện tại,
phân loại chất lượng (6 nhãn) và cho biết mục tiêu đã đánh giá đủ chưa. Kết quả
dùng để Lead ra quyết định và cập nhật blackboard."""

import logging

from app.agents.base_agent import BaseAgent
from app.agents.schemas import AnswerAssessment

logger = logging.getLogger(__name__)


class Scorekeeper(BaseAgent):
    name = "Scorekeeper"
    prompt_file = "scorekeeper.txt"
    use_quality_model = False
    max_tokens = 300

    async def assess(
        self,
        *,
        candidate_answer: str,
        goal_label: str,
        grading: str,
        history: str,
        language: str,
        low_confidence: bool = False,
    ) -> AnswerAssessment:
        stt_hint = (
            "\nLƯU Ý: hệ thống STT báo độ tin cậy THẤP — nếu câu trả lời rời rạc/vô "
            "nghĩa, ưu tiên xếp 'unintelligible'.\n"
            if low_confidence
            else ""
        )
        user_prompt = f"""Năng lực đang đánh giá: "{goal_label}"
Tiêu chí một câu trả lời tốt: {grading or '(không có tiêu chí cụ thể)'}
{stt_hint}
Lịch sử trò chuyện gần nhất:
{history}

Câu trả lời cuối của ứng viên: "{candidate_answer}"

Hãy đánh giá và CHỈ trả về JSON:
{{
  "answer_quality": "substantive | partial | cannot_answer | off_topic | hostile | unintelligible",
  "covered": true/false,   // năng lực này đã được đánh giá ĐỦ chưa
  "is_strength": true/false, // câu trả lời cho thấy đây là điểm MẠNH
  "confidence": 0.0,        // mức tự tin của bạn về kết luận (0..1)
  "note": "<ghi chú rất ngắn để lưu hồ sơ>",
  "difficulty_adjust": "harder | same | easier", // câu kế nên KHÓ hơn nếu trả lời quá tốt, DỄ hơn nếu đang đuối
  "emergent_topic": "<chủ đề/công nghệ/quyết định đáng đào sâu mà ứng viên vừa nêu nhưng CHƯA nằm trong mạch câu hỏi; rỗng nếu không có>",
  "suggest_new_goal": true/false // emergent_topic có xứng đáng thành một mục tiêu đánh giá riêng không
}}
Ngôn ngữ: {language}
"""
        try:
            res: AnswerAssessment = await self.run_json(user_prompt, schema=AnswerAssessment)
            return res
        except Exception as exc:  # noqa: BLE001
            logger.info("Scorekeeper lỗi, mặc định partial: %s", exc)
            return AnswerAssessment(answer_quality="partial")
