import asyncio
import base64
import logging
import re
import time
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.agents.interview_agent import decide_next_action, get_opening_question
from app.core.auth import verify_supabase_token
from app.core.database import db
from app.services.stt import transcribe_audio_base64_conf_async
from app.services.supabase_storage import storage_service
from app.services.tts import peek_cache, synthesize_speech

logger = logging.getLogger(__name__)

router = APIRouter()

# Tách câu để stream TTS theo từng câu (giảm time-to-first-audio cho reply dài).
_SENT_SPLIT = re.compile(r"(?<=[.!?…。！？])\s+")


def _split_sentences(text: str) -> list[str]:
    parts = [p.strip() for p in _SENT_SPLIT.split(text) if p.strip()]
    return parts or ([text.strip()] if text.strip() else [])


def _next_sequence(session_id: str) -> int:
    last = db.get_last_message(session_id)
    return (last["sequence_number"] + 1) if last else 0


# Số thuật ngữ tối đa nhồi vào initial prompt của STT (giới hạn token của Whisper).
_MAX_GLOSSARY_TERMS = 40


def _collect_stt_glossary(session_id: str) -> str:
    """Gom thuật ngữ kỹ thuật (skills, tech-stack, tên dự án, keyword JD) từ hồ sơ
    ứng viên để mớm cho Whisper -> phiên âm ĐÚNG CHÍNH TẢ thuật ngữ tiếng Anh khi
    ứng viên nói xen kẽ Việt–Anh. Trả chuỗi rỗng nếu chưa có hồ sơ."""
    try:
        prof = db.get_candidate_profile(session_id)
    except Exception as exc:  # noqa: BLE001
        logger.debug("Collect glossary failed: %s", exc)
        return ""
    if not prof:
        return ""

    raw: list = []
    for s in prof.get("skills") or []:
        raw.append(s.get("name") if isinstance(s, dict) else s)
    for p in prof.get("projects") or []:
        if isinstance(p, dict):
            raw.append(p.get("name"))
            raw.extend(p.get("tech_stack") or [])
    jd = prof.get("jd_gap_analysis") or {}
    if isinstance(jd, dict):
        raw.extend(jd.get("matched_skills") or [])
        raw.extend(jd.get("missing_keywords") or [])

    seen: set[str] = set()
    terms: list[str] = []
    for item in raw:
        term = str(item or "").strip()
        # Chỉ giữ thuật ngữ có chữ cái ASCII (tiếng Anh/công nghệ), bỏ chuỗi quá dài.
        if not term or len(term) > 30 or not any(c.isascii() and c.isalpha() for c in term):
            continue
        key = term.casefold()
        if key in seen:
            continue
        seen.add(key)
        terms.append(term)
        if len(terms) >= _MAX_GLOSSARY_TERMS:
            break
    return ", ".join(terms)


async def _send_interviewer_stream(
    websocket: WebSocket,
    text: str,
    language: str,
    voice: str,
    *,
    message_type: str,
    question_id: str | None = None,
    question_index: int | None = None,
    total_questions: int | None = None,
    panelist: str | None = None,
) -> None:
    """Gửi một lượt phản hồi của AI theo kiểu streaming:
    1) Gửi TEXT ngay (người dùng thấy chữ tức thì, không chờ audio).
    2) Nếu audio đã prefetch -> gửi nguyên khối (gần như tức thì).
       Ngược lại tổng hợp & gửi audio THEO TỪNG CÂU để câu đầu phát sớm.
    3) Báo done để client biết hết luồng.
    Giao thức message: type='interviewer_speech_chunk'.
    """
    await websocket.send_json({
        "type": "interviewer_speech_chunk",
        "seq": 0,
        "text": text,
        "message_type": message_type,
        "question_id": question_id,
        "question_index": question_index,
        "total_questions": total_questions,
        "panelist": panelist,
        "done": False,
    })

    seq = 1
    cached = peek_cache(text, language, voice)
    if cached is not None:
        await websocket.send_json({
            "type": "interviewer_speech_chunk",
            "seq": seq,
            "audio_base64": base64.b64encode(cached).decode(),
            "done": False,
        })
        seq += 1
    else:
        for sentence in _split_sentences(text):
            audio = await synthesize_speech(sentence, language, voice)
            if audio:
                await websocket.send_json({
                    "type": "interviewer_speech_chunk",
                    "seq": seq,
                    "audio_base64": base64.b64encode(audio).decode(),
                    "done": False,
                })
                seq += 1

    await websocket.send_json({"type": "interviewer_speech_chunk", "seq": seq, "done": True})


def _spawn_prefetch(session_id: str, shown_main_index: int, language: str, voice: str) -> None:
    """Tổng hợp trước (nền) audio cho câu hỏi CHÍNH kế tiếp để khi tới lượt
    phát gần như tức thì. Kết quả nằm trong cache của tts."""

    async def _warm() -> None:
        try:
            qs = db.list_questions(session_id, main_only=True)
            nxt = shown_main_index + 1
            if 0 <= nxt < len(qs):
                await synthesize_speech(qs[nxt]["question_text"], language, voice)
        except Exception as exc:  # noqa: BLE001
            logger.debug("Prefetch next question audio failed: %s", exc)

    asyncio.create_task(_warm())


def _spawn_audio_upload(audio_bytes: bytes, bucket: str, path: str) -> None:
    """Upload bản ghi âm lên Supabase ở chế độ nền (fire-and-forget) để KHÔNG
    làm chậm lượt phản hồi. Best-effort: lỗi thì chỉ log."""

    async def _do() -> None:
        try:
            await asyncio.to_thread(
                storage_service.upload_file, bucket, path, audio_bytes, "audio/webm"
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Background audio upload failed: %s", exc)

    asyncio.create_task(_do())


async def _emit_action(
    websocket: WebSocket,
    session_id: str,
    action: dict,
    language: str,
    voice: str,
) -> bool:
    """Phát kết quả của decide_next_action ra client (streaming). Trả True nếu
    phỏng vấn kết thúc (caller nên break)."""
    if action["action"] == "complete":
        complete_msg = action.get("message", "Phong van ket thuc.")
        _save_message(session_id, "interviewer", "system", complete_msg)
        complete_audio = await synthesize_speech(complete_msg, language, voice)
        await websocket.send_json({
            "type": "interview_complete",
            "text": complete_msg,
            "audio_base64": base64.b64encode(complete_audio).decode() if complete_audio else None,
        })
        return True

    response_text = action["text"]
    msg_type_out = "follow_up" if action["action"] == "follow_up" else "question"
    _save_message(session_id, "interviewer", msg_type_out, response_text, action.get("question_id"))
    await _send_interviewer_stream(
        websocket,
        response_text,
        language,
        voice,
        message_type=msg_type_out,
        question_id=action.get("question_id"),
        question_index=action.get("question_index"),
        total_questions=action.get("total_questions"),
        panelist=action.get("panelist"),
    )
    if action.get("question_index") is not None:
        _spawn_prefetch(session_id, action["question_index"], language, voice)
    return False


def _save_message(
    session_id: str,
    role: str,
    message_type: str,
    content: str,
    question_id: str | None = None,
    audio_path: str | None = None,
) -> None:
    db.create_message(
        {
            "session_id": session_id,
            "question_id": question_id,
            "role": role,
            "message_type": message_type,
            "content": content,
            "audio_bucket": "audio-recordings" if audio_path else None,
            "audio_path": audio_path,
            "sequence_number": _next_sequence(session_id),
        }
    )


@router.websocket("/ws/interview/{session_id}")
async def interview_websocket(websocket: WebSocket, session_id: str):
    await websocket.accept()

    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return

    try:
        user = await verify_supabase_token(token)
    except Exception:
        await websocket.close(code=4001, reason="Invalid token")
        return

    session = db.get_session(session_id, user["sub"])
    if not session:
        await websocket.close(code=4004, reason="Session not found")
        return

    if session["status"] not in ("ready", "active"):
        await websocket.send_json({"type": "error", "message": f"Session status: {session['status']}"})
        await websocket.close()
        return

    language = session.get("language", "vi")
    voice = websocket.query_params.get("voice", "vi-VN-HoaiMyNeural")
    # Kho thuật ngữ để mớm cho STT (tính 1 lần/phiên), giúp phiên âm đúng khi nói
    # xen kẽ Việt–Anh.
    stt_glossary = _collect_stt_glossary(session_id)

    try:
        messages = db.list_messages(session_id)
        
        if not messages:
            # Mới bắt đầu
            if session["status"] == "ready":
                db.update_session(
                    session_id,
                    {"status": "active", "started_at": datetime.now(timezone.utc).isoformat()},
                )
                
            opening = await get_opening_question(session_id)
            greeting = opening.get("greeting", "")
            question_text = opening["text"]

            if greeting:
                _save_message(session_id, "interviewer", "system", greeting)
                await _send_interviewer_stream(
                    websocket, greeting, language, voice, message_type="system"
                )

            _save_message(session_id, "interviewer", "question", question_text, opening["question_id"])
            await _send_interviewer_stream(
                websocket,
                question_text,
                language,
                voice,
                message_type="question",
                question_id=opening["question_id"],
                question_index=opening["question_index"],
                total_questions=opening["total_questions"],
                panelist=opening.get("panelist"),
            )
            # Prefetch audio câu hỏi chính kế tiếp.
            _spawn_prefetch(session_id, opening["question_index"], language, voice)
        else:
            # Phục hồi phiên
            history_data = []
            last_question_id = None
            for msg in messages:
                history_data.append({
                    "role": msg["role"],
                    "content": msg["content"],
                    "message_type": msg["message_type"]
                })
                if msg["question_id"]:
                    last_question_id = msg["question_id"]
            
            all_q = db.list_questions(session_id)
            all_main_q = [q for q in all_q if not q.get("is_follow_up")]
            total_q = len(all_main_q)
            q_idx = session.get("current_question_index") or 0
            
            session_duration_ms = session.get("total_duration_ms") or 0
            question_duration_ms = 0
            if last_question_id:
                for q in all_q:
                    if q["id"] == last_question_id:
                        question_duration_ms = q.get("answer_duration_ms") or 0
                        break

            last_audio_base64 = None
            if messages[-1]["role"] == "interviewer" and messages[-1]["message_type"] in ("question", "follow_up"):
                last_q_audio = await synthesize_speech(messages[-1]["content"], language, voice)
                if last_q_audio:
                    last_audio_base64 = base64.b64encode(last_q_audio).decode()
            
            await websocket.send_json({
                "type": "history",
                "messages": history_data,
                "question_id": last_question_id,
                "question_index": q_idx,
                "total_questions": total_q,
                "last_audio_base64": last_audio_base64,
                "session_duration_ms": session_duration_ms,
                "question_duration_ms": question_duration_ms
            })

            # Nếu user đã trả lời xong trước khi thoát mà AI chưa phản hồi, sinh câu tiếp theo
            if messages[-1]["role"] == "candidate":
                action = await decide_next_action(session_id, messages[-1]["content"], language)
                await _emit_action(websocket, session_id, action, language, voice)

        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "audio_chunk":
                # Luồng NHANH (auto-submit): STT + lưu + sinh câu kế trong 1 bước.
                t0 = time.perf_counter()
                audio_b64 = data.get("audio_base64", "")
                question_id = data.get("question_id")

                transcript, low_confidence = await transcribe_audio_base64_conf_async(audio_b64, language, stt_glossary)
                t_stt = time.perf_counter()
                if not transcript:
                    await websocket.send_json({"type": "transcript", "text": "", "final": False})
                    continue

                audio_bytes = base64.b64decode(audio_b64)
                msg_id = storage_service.new_doc_id()
                audio_path = f"{session_id}/{msg_id}.webm"
                _spawn_audio_upload(audio_bytes, "audio-recordings", audio_path)

                _save_message(session_id, "candidate", "answer", transcript, question_id, audio_path)
                await websocket.send_json({"type": "transcript", "text": transcript, "final": True})

                action = await decide_next_action(session_id, transcript, language, low_confidence)
                t_llm = time.perf_counter()
                done = await _emit_action(websocket, session_id, action, language, voice)
                t_end = time.perf_counter()
                logger.info(
                    "[turn] stt=%.0fms llm=%.0fms tts+send=%.0fms total=%.0fms",
                    (t_stt - t0) * 1000,
                    (t_llm - t_stt) * 1000,
                    (t_end - t_llm) * 1000,
                    (t_end - t0) * 1000,
                )
                if done:
                    break

            elif msg_type == "transcribe_audio":
                # Luồng THỦ CÔNG (review): chỉ trả transcript để người dùng xem lại.
                audio_b64 = data.get("audio_base64", "")
                transcript, _ = await transcribe_audio_base64_conf_async(audio_b64, language, stt_glossary)

                # Tải file âm thanh lên Supabase (nền) để lưu làm bằng chứng ghi âm
                audio_bytes = base64.b64decode(audio_b64)
                msg_id = storage_service.new_doc_id()
                audio_path = f"{session_id}/{msg_id}.webm"
                _spawn_audio_upload(audio_bytes, "audio-recordings", audio_path)

                await websocket.send_json({
                    "type": "transcription_result",
                    "text": transcript,
                    "audio_path": audio_path,
                })

            elif msg_type == "submit_answer":
                text = data.get("text", "")
                question_id = data.get("question_id")
                audio_path = data.get("audio_path")

                # Lưu tin nhắn câu trả lời chính thức của ứng viên
                _save_message(session_id, "candidate", "answer", text, question_id, audio_path)
                await websocket.send_json({"type": "transcript", "text": text, "final": True})

                action = await decide_next_action(session_id, text, language)
                done = await _emit_action(websocket, session_id, action, language, voice)
                if done:
                    break

            elif msg_type == "end_interview":
                end_msg = "Cam on ban. Buoi phong van da ket thuc." if language == "vi" else "Thank you. The interview has ended."
                _save_message(session_id, "interviewer", "system", end_msg)
                await websocket.send_json({"type": "interview_complete", "text": end_msg})
                break

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected for session %s", session_id)
    except Exception as exc:
        logger.exception("WebSocket error: %s", exc)
        try:
            await websocket.send_json({"type": "error", "message": str(exc)})
        except Exception:
            pass
