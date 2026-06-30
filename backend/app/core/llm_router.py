import asyncio
import json
import logging
import re
from typing import Any

import google.generativeai as genai
import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# Số lần thử lại khi Groq trả 429 (rate limit) và mức chờ tối đa mỗi lần.
_GROQ_MAX_RETRIES = 2
_GROQ_MAX_BACKOFF_S = 8.0


def _parse_retry_delay(message: str) -> float:
    """Lấy thời gian chờ gợi ý từ message lỗi 429 của Groq
    (vd 'Please try again in 6.39s'). Mặc định 1.5s."""
    m = re.search(r"try again in ([0-9.]+)\s*s", message)
    if m:
        try:
            return min(float(m.group(1)) + 0.3, _GROQ_MAX_BACKOFF_S)
        except ValueError:
            pass
    return 1.5


class LLMRouter:
    """
    Routes LLM calls across three providers with automatic fallback.

    Default priority order (LLM_PREFER=auto):
        - Ollama healthy  -> ollama -> groq -> gemini
        - Ollama offline  -> groq   -> gemini

    LLM_PREFER options:
        - "auto"   : detect Ollama health, prefer local first
        - "local"  : ollama -> groq -> gemini
        - "cloud"  : groq   -> gemini -> ollama
        - "groq"   : groq   -> gemini -> ollama
        - "gemini" : gemini -> groq   -> ollama
        - "ollama" : ollama -> groq   -> gemini
    """

    def __init__(self) -> None:
        self.settings = get_settings()
        if self.settings.gemini_api_key:
            genai.configure(api_key=self.settings.gemini_api_key)

    # ── Health check ──────────────────────────────────────────────────────

    async def _ollama_healthy(self) -> bool:
        """Return True if the local Ollama server is reachable."""
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(f"{self.settings.ollama_base_url}/api/tags")
                return resp.status_code == 200
        except Exception:
            return False

    # ── Provider calls ────────────────────────────────────────────────────

    async def _call_ollama(self, prompt: str, system: str = "", max_tokens: int = 1500) -> str:
        """Call the local Ollama chat API and return the response text."""
        messages: list[dict[str, str]] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{self.settings.ollama_base_url}/api/chat",
                json={
                    "model": self.settings.ollama_model,
                    "messages": messages,
                    "stream": False,
                    "format": "json",
                    "options": {"num_predict": max_tokens},
                },
            )
            resp.raise_for_status()
            return resp.json()["message"]["content"]

    async def _call_groq(
        self,
        prompt: str,
        system: str = "",
        json_mode: bool = False,
        max_tokens: int = 1500,
        model: str | None = None,
    ) -> str:
        """Call Groq cloud API (free tier: 14,400 req/day, latency < 1s).

        `model` override cho phép dùng model mạnh hơn (vd llama-3.3-70b) cho
        các tác vụ nền cần chất lượng cao."""
        if not self.settings.groq_api_key:
            raise RuntimeError("GROQ_API_KEY is not configured")

        from groq import AsyncGroq  # lazy import – only when needed

        client = AsyncGroq(api_key=self.settings.groq_api_key)
        messages: list[dict[str, str]] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        kwargs: dict = {
            "messages": messages,  # type: ignore[arg-type]
            "model": model or self.settings.groq_model,
            "temperature": 0.7,
            "max_tokens": max_tokens,
        }
        if json_mode:
            # Force Groq to return pure JSON – eliminates markdown fence wrapping
            kwargs["response_format"] = {"type": "json_object"}

        # Tự thử lại khi chạm rate-limit (free tier 6000 TPM): chờ theo thời gian
        # Groq gợi ý rồi gọi lại, thay vì fail ngay sang provider khác.
        last_exc: Exception | None = None
        for attempt in range(_GROQ_MAX_RETRIES + 1):
            try:
                completion = await client.chat.completions.create(**kwargs)
                return completion.choices[0].message.content or ""
            except Exception as exc:  # noqa: BLE001
                msg = str(exc)
                is_rate_limit = "429" in msg or "rate_limit" in msg.lower()
                if is_rate_limit and attempt < _GROQ_MAX_RETRIES:
                    delay = _parse_retry_delay(msg)
                    logger.warning(
                        "[LLMRouter] Groq 429, chờ %.1fs rồi thử lại (%d/%d)",
                        delay, attempt + 1, _GROQ_MAX_RETRIES,
                    )
                    await asyncio.sleep(delay)
                    last_exc = exc
                    continue
                raise
        if last_exc:
            raise last_exc
        return ""

    async def _call_gemini(self, prompt: str, system: str = "") -> str:
        """Call Google Gemini API (free tier: 15 req/min, 1M tokens/day)."""
        if not self.settings.gemini_api_key:
            raise RuntimeError("GEMINI_API_KEY is not configured")

        model = genai.GenerativeModel(
            self.settings.gemini_model,
            system_instruction=system or None,
        )
        response = await model.generate_content_async(prompt)
        return response.text

    # ── Provider selection ────────────────────────────────────────────────

    def _has_groq(self) -> bool:
        return bool(self.settings.groq_api_key)

    def _has_gemini(self) -> bool:
        return bool(self.settings.gemini_api_key)

    async def _build_provider_list(self, prefer: str | None) -> list[str]:
        """Return ordered provider list based on LLM_PREFER setting."""
        mode = prefer or self.settings.llm_prefer

        if mode in ("local", "ollama"):
            return ["ollama", "groq", "gemini"]
        if mode == "cloud":
            return ["groq", "gemini", "ollama"]
        if mode == "groq":
            return ["groq", "gemini", "ollama"]
        if mode == "gemini":
            return ["gemini", "groq", "ollama"]

        # auto: prefer local if Ollama is available
        if await self._ollama_healthy():
            return ["ollama", "groq", "gemini"]
        return ["groq", "gemini", "ollama"]

    # ── Public API ────────────────────────────────────────────────────────

    async def generate(
        self,
        prompt: str,
        system: str = "",
        prefer: str | None = None,
        json_mode: bool = False,
        max_tokens: int = 1500,
        model: str | None = None,
    ) -> tuple[str, str]:
        """
        Generate text with automatic provider fallback.

        `max_tokens` caps output length per call — output tokens drive latency
        linearly, so latency-critical callers should pass a small value.
        `model` override (chỉ áp cho Groq) cho phép chọn model mạnh hơn.

        Returns:
            (result_text, provider_name)
        """
        providers = await self._build_provider_list(prefer)
        last_error: Exception | None = None

        for provider in providers:
            result: str | None = None
            try:
                if provider == "ollama":
                    if not await self._ollama_healthy():
                        logger.debug("Ollama unavailable, skipping.")
                        continue
                    logger.info("[LLMRouter] Using ollama (%s)", self.settings.ollama_model)
                    result = await self._call_ollama(prompt, system, max_tokens=max_tokens)

                elif provider == "groq":
                    if not self._has_groq():
                        logger.debug("Groq API key not set, skipping.")
                        continue
                    logger.info("[LLMRouter] Using groq (%s) json_mode=%s", model or self.settings.groq_model, json_mode)
                    result = await self._call_groq(prompt, system, json_mode=json_mode, max_tokens=max_tokens, model=model)

                elif provider == "gemini":
                    if not self._has_gemini():
                        logger.debug("Gemini API key not set, skipping.")
                        continue
                    logger.info("[LLMRouter] Using gemini (%s)", self.settings.gemini_model)
                    result = await self._call_gemini(prompt, system)

                if result is not None:
                    return result, provider

            except Exception as exc:
                last_error = exc
                logger.warning("[LLMRouter] Provider '%s' failed: %s", provider, exc)

        raise RuntimeError(
            f"All LLM providers failed. Last error: {last_error}. "
            "Check GROQ_API_KEY, GEMINI_API_KEY, or ensure Ollama is running."
        )

    async def generate_json(
        self,
        prompt: str,
        system: str = "",
        prefer: str | None = None,
        max_tokens: int = 1500,
        model: str | None = None,
    ) -> tuple[dict[str, Any], str]:
        """
        Generate and parse a JSON response.
        Uses json_mode=True for Groq to get clean JSON on the first try.
        Falls back to regex/clean + one retry on parse failure.
        `model` override (Groq) cho tác vụ chất lượng cao.

        Returns:
            (parsed_dict, provider_name)
        """
        raw, provider = await self.generate(prompt, system, prefer, json_mode=True, max_tokens=max_tokens, model=model)
        cleaned = self._clean_json_string(raw)

        try:
            return json.loads(cleaned), provider
        except json.JSONDecodeError:
            logger.warning("[LLMRouter] JSON parse failed (provider=%s), retrying with stricter prompt.", provider)
            retry_prompt = (
                f"{prompt}\n\n"
                "Return ONLY valid JSON. No markdown, no code fences, no extra text."
            )
            raw2, provider2 = await self.generate(retry_prompt, system, prefer, json_mode=True, max_tokens=max_tokens, model=model)
            cleaned2 = self._clean_json_string(raw2)
            return json.loads(cleaned2), provider2

    async def generate_stream(
        self,
        prompt: str,
        system: str = "",
        prefer: str | None = None,
        max_tokens: int = 512,
    ):
        """
        Stream text tokens as they are generated (lowest time-to-first-token).

        Yields incremental text deltas. Only Groq and Ollama support true
        token streaming here; if neither is available, falls back to a single
        full `generate()` call and yields the whole result once.

        Use for the voice hot path: pipe deltas into a sentence-chunker, then
        synthesize each finished sentence with streaming TTS.
        """
        providers = await self._build_provider_list(prefer)

        for provider in providers:
            try:
                if provider == "groq":
                    if not self._has_groq():
                        continue
                    from groq import AsyncGroq

                    client = AsyncGroq(api_key=self.settings.groq_api_key)
                    messages: list[dict[str, str]] = []
                    if system:
                        messages.append({"role": "system", "content": system})
                    messages.append({"role": "user", "content": prompt})

                    logger.info("[LLMRouter] Streaming groq (%s)", self.settings.groq_model)
                    stream = await client.chat.completions.create(
                        messages=messages,  # type: ignore[arg-type]
                        model=self.settings.groq_model,
                        temperature=0.7,
                        max_tokens=max_tokens,
                        stream=True,
                    )
                    async for chunk in stream:
                        delta = chunk.choices[0].delta.content if chunk.choices else None
                        if delta:
                            yield delta
                    return

                if provider == "ollama":
                    if not await self._ollama_healthy():
                        continue
                    messages = []
                    if system:
                        messages.append({"role": "system", "content": system})
                    messages.append({"role": "user", "content": prompt})

                    logger.info("[LLMRouter] Streaming ollama (%s)", self.settings.ollama_model)
                    async with httpx.AsyncClient(timeout=120.0) as client_http:
                        async with client_http.stream(
                            "POST",
                            f"{self.settings.ollama_base_url}/api/chat",
                            json={
                                "model": self.settings.ollama_model,
                                "messages": messages,
                                "stream": True,
                                "options": {"num_predict": max_tokens},
                            },
                        ) as resp:
                            resp.raise_for_status()
                            async for line in resp.aiter_lines():
                                if not line.strip():
                                    continue
                                obj = json.loads(line)
                                delta = obj.get("message", {}).get("content")
                                if delta:
                                    yield delta
                    return
            except Exception as exc:
                logger.warning("[LLMRouter] Streaming provider '%s' failed: %s", provider, exc)
                continue

        # Last resort: non-streaming providers (e.g. Gemini) — yield once.
        text, _ = await self.generate(prompt, system, prefer, max_tokens=max_tokens)
        if text:
            yield text

    @staticmethod
    def _clean_json_string(raw: str) -> str:
        """Strip markdown code fences (```json ... ```) if present."""
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            # Remove opening fence line (e.g. ```json)
            cleaned = cleaned.split("\n", 1)[-1]
            # Remove closing fence
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
        return cleaned.strip()

    def provider_status(self) -> dict[str, Any]:
        """Return configuration status of all providers (for /llm-status endpoint)."""
        return {
            "ollama": {
                "configured": True,
                "base_url": self.settings.ollama_base_url,
                "model": self.settings.ollama_model,
            },
            "groq": {
                "configured": self._has_groq(),
                "model": self.settings.groq_model,
            },
            "gemini": {
                "configured": self._has_gemini(),
                "model": self.settings.gemini_model,
            },
            "prefer": self.settings.llm_prefer,
        }


llm_router = LLMRouter()
