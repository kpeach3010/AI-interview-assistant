-- Blackboard chia sẻ của "hội đồng phỏng vấn" đa tác nhân: bảng mục tiêu năng lực
-- (goals), tiến độ đánh giá, budget câu hỏi, vai trò/goal hiện tại.
-- Nullable để tương thích ngược: phiên cũ chưa có panel_state vẫn chạy luồng cũ.
ALTER TABLE interview_sessions
    ADD COLUMN IF NOT EXISTS panel_state JSONB;
