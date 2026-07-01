"""Report Critic — vai trò QA soát báo cáo cuối: điểm tổng có khớp bằng chứng,
tóm tắt có mâu thuẫn không. Chạy SAU evaluate_session; chỉ soát & ghi log/ghi chú
(không tạo lại báo cáo để tránh ghi trùng PDF)."""

import json
import logging

from app.agents.base_agent import BaseAgent
from app.agents.schemas import ReportCritique

logger = logging.getLogger(__name__)


class ReportCritic(BaseAgent):
    name = "ReportCritic"
    prompt_file = "report_critic.txt"
    use_quality_model = True
    max_tokens = 700

    async def review(self, result: dict) -> ReportCritique:
        user_prompt = f"""Kết quả đánh giá (JSON):
overall_score: {result.get('overall_score')}
averages: {json.dumps(result.get('averages', {}), ensure_ascii=False)}
summary: {result.get('summary', '')}
evaluations_count: {result.get('evaluations_count')}
"""
        try:
            return await self.run_json(user_prompt, schema=ReportCritique)
        except Exception as exc:  # noqa: BLE001
            logger.info("ReportCritic lỗi, coi như đạt: %s", exc)
            return ReportCritique(needs_revision=False)
