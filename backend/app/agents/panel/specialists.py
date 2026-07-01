"""Các chuyên gia phỏng vấn (vai trò con) do Lead điều phối. Mỗi chuyên gia chia
sẻ persona chung + một 'lăng kính' riêng, soạn câu hỏi cho lượt hiện tại: chọn
câu từ ngân hàng rồi viết lại tự nhiên, hoặc đào sâu / vớt / hỏi lại.

Kế thừa: interviewer_persona.txt (tông + chống nhại STT + thoát khéo), source_context
(thuật ngữ chuẩn), taxonomy hành vi đã xây ở bản trước.
"""

import logging

from app.agents.base_agent import BaseAgent, load_prompt
from app.agents.schemas import SpecialistQuestion

logger = logging.getLogger(__name__)

_PERSONA = load_prompt("interviewer_persona.txt")

_ROLE_PROMPTS = {
    "technical": "specialist_technical.txt",
    "behavioral": "specialist_behavioral.txt",
    "project": "specialist_project.txt",
    "screening": "specialist_screening.txt",
}


class Specialist(BaseAgent):
    name = "Specialist"
    prompt_file = None  # tự ghép system từ persona + lăng kính vai trò
    use_quality_model = False
    max_tokens = 220

    def __init__(self, role: str) -> None:
        self.role = role if role in _ROLE_PROMPTS else "technical"
        super().__init__()
        self._system = _PERSONA + "\n\n--- VAI TRÒ CỦA BẠN ---\n" + load_prompt(
            _ROLE_PROMPTS[self.role]
        )

    async def compose(
        self,
        *,
        mode: str,  # ask | ask_emergent | drill | rescue | clarify
        goal_label: str,
        base_question: str,
        grading: str,
        standard_terms: str,
        history: str,
        language: str,
        candidate_answer: str = "",
        difficulty: str = "same",
    ) -> str:
        difficulty_note = {
            "harder": " Ứng viên đang trả lời tốt — hãy nâng ĐỘ KHÓ (đi sâu hơn, trade-off/edge-case).",
            "easier": " Ứng viên đang chật vật — hãy HẠ ĐỘ KHÓ, hỏi căn bản và cụ thể hơn.",
        }.get(difficulty, "")
        instruction = {
            "ask": (
                f"Hãy đặt câu hỏi đánh giá năng lực: \"{goal_label}\".\n"
                f"Gợi ý từ ngân hàng câu hỏi: \"{base_question}\".\n"
                "Viết lại thật tự nhiên theo giọng chuyên gia của bạn.\n"
                "QUAN TRỌNG: nếu câu gợi ý này đã được ứng viên trả lời (dù gián tiếp) ở "
                "lịch sử bên dưới, ĐỪNG hỏi lại — hãy chuyển sang một KHÍA CẠNH KHÁC của cùng "
                "năng lực." + difficulty_note
            ),
            "ask_emergent": (
                f"Trong câu trả lời vừa rồi, ứng viên nhắc tới chủ đề đáng đào sâu: \"{goal_label}\".\n"
                "Hãy đặt MỘT câu hỏi mới, sắc bén để khai thác chủ đề này, bám vào điều ứng viên "
                "vừa nói (xem lịch sử). Tự nhiên như văn nói." + difficulty_note
            ),
            "drill": (
                f"Ứng viên vừa trả lời: \"{candidate_answer}\".\n"
                f"Hãy hỏi ĐÀO SÂU đúng 1 chi tiết liên quan tới năng lực \"{goal_label}\", "
                "xoáy vào phần còn thiếu (đặc biệt Kết quả/Result). Không hỏi lại điều đã rõ."
            ),
            "rescue": (
                f"Ứng viên chưa trả lời được về \"{goal_label}\".\n"
                "Hãy hỏi 1 câu CÙNG lĩnh vực nhưng DỄ/căn bản hơn để cho họ một cơ hội."
            ),
            "clarify": (
                "Câu trả lời vừa rồi nghe không rõ (nhiều khả năng do nhận dạng giọng nói sai).\n"
                "Hãy nhờ ứng viên nói lại ngắn gọn, TUYỆT ĐỐI không lặp lại từ nghe sai."
            ),
        }.get(mode, "")

        user_prompt = f"""{instruction}

Năng lực cần đánh giá (tiêu chí): {grading or '(không có tiêu chí cụ thể)'}
Thuật ngữ/đối tượng CHUẨN (dùng đúng chính tả, KHÔNG nhại từ ứng viên/máy nghe sai): {standard_terms or '(không có)'}

Lịch sử trò chuyện gần nhất:
{history}

CHỈ trả về JSON: {{"text": "<câu hỏi ngắn gọn dưới 25 từ>"}}
Ngôn ngữ: {language}
"""
        try:
            res: SpecialistQuestion = await self.run_json(
                user_prompt, system=self._system, schema=SpecialistQuestion
            )
            text = (res.text or "").strip()
            return text or (base_question or "").strip()
        except Exception as exc:  # noqa: BLE001
            logger.info("Specialist(%s) lỗi, dùng câu gốc: %s", self.role, exc)
            return (base_question or "").strip()
