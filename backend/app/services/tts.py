import asyncio
import io
import logging

from gtts import gTTS

logger = logging.getLogger(__name__)

_cache: dict[str, bytes] = {}

async def synthesize_speech(text: str, language: str = "vi") -> bytes:
    if not text or not text.strip():
        return b""

    cache_key = f"{language}:{text[:200]}"
    if cache_key in _cache:
        return _cache[cache_key]

    try:
        # Run gTTS in a separate thread to prevent blocking the event loop
        def _generate():
            tts = gTTS(text=text, lang=language)
            fp = io.BytesIO()
            tts.write_to_fp(fp)
            return fp.getvalue()

        audio = await asyncio.to_thread(_generate)
        
        if audio:
            _cache[cache_key] = audio
        return audio
    except Exception as exc:
        logger.warning("Google TTS failed: %s", exc)
        return b""

def synthesize_speech_sync(text: str, language: str = "vi") -> bytes:
    return asyncio.get_event_loop().run_until_complete(synthesize_speech(text, language))
