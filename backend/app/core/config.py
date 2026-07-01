from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    database_url: str = ""  # DATABASE_URL
    direct_database_url: str = ""  # DIRECT_DATABASE_URL

    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5:7b"

    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"

    groq_api_key: str = ""
    groq_model: str = "llama-3.1-8b-instant"
    # Model mạnh hơn cho tác vụ nền cần chất lượng cao (sinh câu hỏi, review CV,
    # parse CV, summarizer). Không dùng cho phần phỏng vấn real-time.
    groq_quality_model: str = "llama-3.3-70b-versatile"

    llm_prefer: str = "auto"  # auto | local | cloud | groq | gemini | ollama

    # Hệ "hội đồng phỏng vấn" đa tác nhân (Lead orchestrator + chuyên gia +
    # scorekeeper). Tắt = dùng luồng decide_next_action tuyến tính cũ (an toàn).
    panel_enabled: bool = True
    # Ngân sách câu hỏi chính tối đa cho một buổi phỏng vấn do Lead điều phối.
    panel_max_questions: int = 12
    # Cho phép sinh câu hỏi ĐỘNG ngoài kho (chủ đề nổi lên). Tắt = chỉ tinh chỉnh
    # trong kho đã QA.
    panel_allow_generate: bool = True
    # Số mục tiêu 'emergent' (sinh động) tối đa được thêm trong một buổi.
    panel_max_emergent_goals: int = 3

    whisper_model: str = "small"
    whisper_device: str = "cpu"

    frontend_url: str = "http://localhost:5173"
    backend_url: str = "http://localhost:8000"


@lru_cache
def get_settings() -> Settings:
    return Settings()
