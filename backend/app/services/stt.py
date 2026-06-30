import base64
import logging

from app.core.config import get_settings
from groq import Groq

logger = logging.getLogger(__name__)


def transcribe_audio_base64(audio_b64: str, language: str) -> str:
    settings = get_settings()
    if not settings.groq_api_key:
        logger.error("GROQ_API_KEY is missing. Cannot use Groq STT.")
        return ""
        
    try:
        # 1. Loại bỏ tiền tố định dạng nếu Frontend gửi kèm sang
        if "," in audio_b64:
            audio_b64 = audio_b64.split(",")[1]

        # 2. Giải mã chuỗi base64 thuần túy thành bytes dữ liệu
        audio_data = base64.b64decode(audio_b64)
        
        client = Groq(api_key=settings.groq_api_key)
        
        # 3. Gửi thẳng file lên Groq API (sử dụng model whisper-large-v3 siêu tốc)
        transcription = client.audio.transcriptions.create(
            file=("audio.webm", audio_data),
            model="whisper-large-v3-turbo",
            response_format="json",
            language=language if language in ("vi", "en") else "vi",
            prompt="À, ừm... thì, tôi, ờ, tôi nghĩ là... vâng."
        )
        
        return transcription.text
    except Exception as e:
        logger.error(f"Lỗi nhận diện STT qua Groq: {e}")
        return ""
    
def transcribe_audio_bytes(audio_bytes: bytes, language: str = "vi") -> str:
    return transcribe_audio_base64(base64.b64encode(audio_bytes).decode(), language)
