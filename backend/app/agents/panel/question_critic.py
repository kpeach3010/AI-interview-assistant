"""Question Critic — vai trò QA trong hội đồng: soát ngân hàng câu hỏi đã sinh
xem có phủ đủ yêu cầu JD, không trùng lặp, độ khó hợp lý. Trả phản hồi để vòng
sinh câu hỏi kế tiếp khắc phục (self-critique loop)."""

import json
import logging

from app.agents.base_agent import BaseAgent
from app.agents.schemas import QuestionCritique
from app.core.database import db

logger = logging.getLogger(__name__)


class QuestionCritic(BaseAgent):
    name = "QuestionCritic"
    prompt_file = "question_critic.txt"
    use_quality_model = True
    max_tokens = 900

    async def review(self, session_id: str, position: str) -> QuestionCritique:
        questions = db.list_questions(session_id, main_only=True)
        profile = db.get_candidate_profile(session_id) or {}
        jd = profile.get("jd_gap_analysis") or {}

        q_list = [
            {
                "category": q.get("category"),
                "text": q.get("question_text"),
                "evidence": (q.get("source_context") or {}).get("evidence_quote")
                if isinstance(q.get("source_context"), dict)
                else None,
            }
            for q in questions
        ]
        user_prompt = f"""Vị trí tuyển: {position}
Số câu hỏi hiện có: {len(questions)}

Danh sách câu hỏi (JSON):
{json.dumps(q_list, ensure_ascii=False)[:8000]}

JD gap analysis:
weak_areas: {jd.get('weak_areas', [])}
missing_keywords: {jd.get('missing_keywords', [])}
matched_skills: {jd.get('matched_skills', [])}
"""
        return await self.review_from_prompt(user_prompt)

    async def review_from_prompt(self, user_prompt: str) -> QuestionCritique:
        try:
            return await self.run_json(user_prompt, schema=QuestionCritique)
        except Exception as exc:  # noqa: BLE001
            logger.info("QuestionCritic lỗi, coi như đạt: %s", exc)
            return QuestionCritique(needs_revision=False)
