import asyncio
import base64
import logging

from app.core.config import get_settings
from groq import Groq

logger = logging.getLogger(__name__)

# Ngưỡng heuristic để đánh dấu transcript "độ tin cậy thấp" (nghi STT nghe sai).
# avg_logprob càng âm càng kém chắc; no_speech_prob càng cao càng giống nhiễu.
_AVG_LOGPROB_MIN = -1.0
_NO_SPEECH_MAX = 0.6


def _seg_value(segment, key: str):
    """Đọc thuộc tính segment dù SDK trả dict hay object."""
    if isinstance(segment, dict):
        return segment.get(key)
    return getattr(segment, key, None)


def _is_low_confidence(segments) -> bool:
    """Suy ra cờ độ tin cậy thấp từ các segment của verbose_json. Best-effort:
    thiếu dữ liệu thì coi như bình thường (False)."""
    logprobs: list[float] = []
    no_speech: list[float] = []
    for seg in segments or []:
        lp = _seg_value(seg, "avg_logprob")
        ns = _seg_value(seg, "no_speech_prob")
        if isinstance(lp, (int, float)):
            logprobs.append(float(lp))
        if isinstance(ns, (int, float)):
            no_speech.append(float(ns))
    if logprobs and (sum(logprobs) / len(logprobs)) < _AVG_LOGPROB_MIN:
        return True
    if no_speech and max(no_speech) > _NO_SPEECH_MAX:
        return True
    return False


# Gợi ý từ đệm (filler) giúp Whisper giữ lại từ ngập ngừng thay vì bỏ qua.
_FILLER_HINT = "À, ừm... thì, tôi, ờ, tôi nghĩ là... vâng."


def _build_stt_prompt(glossary: str | None) -> str:
    """Ghép danh sách thuật ngữ (glossary) vào initial prompt của Whisper để mô
    hình phiên âm ĐÚNG CHÍNH TẢ các thuật ngữ tiếng Anh khi người nói xen kẽ
    Việt–Anh (VD: FastAPI, RESTful API, PostgreSQL). Prompt của Whisper giới hạn
    ~224 token nên glossary đã được cắt gọn từ phía gọi."""
    glossary = (glossary or "").strip()
    if glossary:
        return f"Thuật ngữ kỹ thuật có thể xuất hiện: {glossary}. {_FILLER_HINT}"
    return _FILLER_HINT


def transcribe_audio_base64_conf(
    audio_b64: str, language: str, glossary: str | None = None
) -> tuple[str, bool]:
    """Nhận diện giọng nói qua Groq; trả (text, low_confidence).
    low_confidence=True khi transcript nhiều khả năng bị nghe sai.
    `glossary`: danh sách thuật ngữ (phân tách bằng dấu phẩy) để tăng độ chính
    xác khi nói xen kẽ Việt–Anh."""
    settings = get_settings()
    if not settings.groq_api_key:
        logger.error("GROQ_API_KEY is missing. Cannot use Groq STT.")
        return "", False

    try:
        # 1. Loại bỏ tiền tố định dạng nếu Frontend gửi kèm sang
        if "," in audio_b64:
            audio_b64 = audio_b64.split(",")[1]

        # 2. Giải mã chuỗi base64 thuần túy thành bytes dữ liệu
        audio_data = base64.b64decode(audio_b64)

        client = Groq(api_key=settings.groq_api_key)
        # Giữ ngôn ngữ NỀN theo phiên (thường là 'vi'); Whisper vẫn phiên âm được
        # các từ tiếng Anh chèn giữa câu — glossary giúp nó viết đúng chính tả.
        lang = language if language in ("vi", "en") else "vi"
        stt_prompt = _build_stt_prompt(glossary)

        # 3. Gửi thẳng file lên Groq API (whisper-large-v3-turbo). Ưu tiên verbose_json
        #    để lấy thêm avg_logprob/no_speech_prob phục vụ đánh giá độ tin cậy;
        #    nếu không hỗ trợ, fallback về json để vẫn lấy được transcript.
        try:
            transcription = client.audio.transcriptions.create(
                file=("audio.webm", audio_data),
                model="whisper-large-v3-turbo",
                response_format="verbose_json",
                language=lang,
                prompt=stt_prompt,
            )
            text = getattr(transcription, "text", "") or ""
            low_confidence = False
            try:
                low_confidence = _is_low_confidence(getattr(transcription, "segments", None))
            except Exception as exc:  # noqa: BLE001
                logger.debug("STT confidence check failed: %s", exc)
            return text, low_confidence
        except Exception as exc:  # noqa: BLE001
            logger.warning("verbose_json STT failed (%s); fallback to json.", exc)
            transcription = client.audio.transcriptions.create(
                file=("audio.webm", audio_data),
                model="whisper-large-v3-turbo",
                response_format="json",
                language=lang,
                prompt=stt_prompt,
            )
            return (getattr(transcription, "text", "") or ""), False
    except Exception as e:
        logger.error(f"Lỗi nhận diện STT qua Groq: {e}")
        return "", False


def transcribe_audio_base64(audio_b64: str, language: str) -> str:
    text, _ = transcribe_audio_base64_conf(audio_b64, language)
    return text


def transcribe_audio_bytes(audio_bytes: bytes, language: str = "vi") -> str:
    return transcribe_audio_base64(base64.b64encode(audio_bytes).decode(), language)


async def transcribe_audio_base64_async(audio_b64: str, language: str) -> str:
    """Async wrapper: chạy Groq STT (blocking) trong thread riêng để KHÔNG chặn
    event loop. Nhờ vậy nhiều phiên phỏng vấn đồng thời không làm 'đơ' lẫn nhau."""
    return await asyncio.to_thread(transcribe_audio_base64, audio_b64, language)


async def transcribe_audio_base64_conf_async(
    audio_b64: str, language: str, glossary: str | None = None
) -> tuple[str, bool]:
    """Như trên nhưng trả kèm cờ low_confidence."""
    return await asyncio.to_thread(
        transcribe_audio_base64_conf, audio_b64, language, glossary
    )
