# Trigger reload
import asyncio
import hashlib
import io
import logging

import edge_tts
from gtts import gTTS

logger = logging.getLogger(__name__)

_cache: dict[str, bytes] = {}


def _cache_key(text: str, language: str, voice: str) -> str:
    """Khóa cache dựa trên hash toàn bộ text (không cắt 200 ký tự để tránh
    đụng độ giữa các câu hỏi dài có cùng phần mở đầu)."""
    digest = hashlib.sha1(text.encode("utf-8")).hexdigest()
    return f"{language}:{voice}:{digest}"


def _resolve_voice(language: str, voice: str) -> str:
    if language != "vi" and voice == "vi-VN-HoaiMyNeural":
        return "en-US-AriaNeural"
    return voice


def peek_cache(text: str, language: str = "vi", voice: str = "vi-VN-HoaiMyNeural") -> bytes | None:
    """Trả audio đã cache cho `text` nếu có (vd đã prefetch), ngược lại None.
    Dùng ở hot path để gửi ngay audio câu hỏi đã tổng hợp sẵn."""
    if not text or not text.strip():
        return None
    voice = _resolve_voice(language, voice)
    return _cache.get(_cache_key(text, language, voice))


async def synthesize_speech(text: str, language: str = "vi", voice: str = "vi-VN-HoaiMyNeural") -> bytes:
    if not text or not text.strip():
        return b""

    voice = _resolve_voice(language, voice)

    cache_key = _cache_key(text, language, voice)
    if cache_key in _cache:
        return _cache[cache_key]

    try:
        communicate = edge_tts.Communicate(text, voice)
        audio_data = b""
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_data += chunk["data"]
                
        if audio_data:
            _cache[cache_key] = audio_data
            return audio_data
    except Exception as exc:
        logger.warning("Edge TTS failed: %s. Falling back to gTTS.", exc)
        
    # Fallback to gTTS if Edge TTS fails (e.g. 403 error)
    try:
        def _generate():
            tts = gTTS(text=text, lang=language)
            fp = io.BytesIO()
            tts.write_to_fp(fp)
            return fp.getvalue()

        audio = await asyncio.to_thread(_generate)
        if audio:
            _cache[cache_key] = audio
        return audio
    except Exception as exc2:
        logger.warning("gTTS fallback failed: %s", exc2)
        return b""

def synthesize_speech_sync(text: str, language: str = "vi", voice: str = "vi-VN-HoaiMyNeural") -> bytes:
    return asyncio.get_event_loop().run_until_complete(synthesize_speech(text, language, voice))


async def synthesize_speech_stream(text: str, language: str = "vi", voice: str = "vi-VN-HoaiMyNeural"):
    """Stream audio chunks ngay khi edge-tts trả về (giảm time-to-first-byte).

    Yield từng `bytes` chunk. Nếu cache đã có (vd câu hỏi prefetch) thì yield
    nguyên khối một lần. Nếu edge-tts lỗi thì fallback gTTS (một khối)."""
    if not text or not text.strip():
        return

    voice = _resolve_voice(language, voice)
    cache_key = _cache_key(text, language, voice)
    if cache_key in _cache:
        yield _cache[cache_key]
        return

    collected = b""
    try:
        communicate = edge_tts.Communicate(text, voice)
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                collected += chunk["data"]
                yield chunk["data"]
        if collected:
            _cache[cache_key] = collected
            return
    except Exception as exc:
        logger.warning("Edge TTS stream failed: %s. Falling back to gTTS.", exc)

    # Fallback gTTS (không stream được -> một khối)
    try:
        def _generate():
            tts = gTTS(text=text, lang=language)
            fp = io.BytesIO()
            tts.write_to_fp(fp)
            return fp.getvalue()

        audio = await asyncio.to_thread(_generate)
        if audio:
            _cache[cache_key] = audio
            yield audio
    except Exception as exc2:
        logger.warning("gTTS stream fallback failed: %s", exc2)
