import base64
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.agents.interview_agent import decide_next_action, get_opening_question
from app.core.auth import verify_supabase_token
from app.core.database import db
from app.services.stt import transcribe_audio_base64
from app.services.supabase_storage import storage_service
from app.services.tts import synthesize_speech

logger = logging.getLogger(__name__)

router = APIRouter()


def _next_sequence(session_id: str) -> int:
    last = db.get_last_message(session_id)
    return (last["sequence_number"] + 1) if last else 0


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

    if session["status"] == "ready":
        db.update_session(
            session_id,
            {"status": "active", "started_at": datetime.now(timezone.utc).isoformat()},
        )

    language = session.get("language", "vi")

    try:
        opening = await get_opening_question(session_id)
        greeting = opening.get("greeting", "")
        question_text = opening["text"]

        if greeting:
            _save_message(session_id, "interviewer", "system", greeting)
            greeting_audio = await synthesize_speech(greeting, language)
            await websocket.send_json({
                "type": "interviewer_speech",
                "text": greeting,
                "audio_base64": base64.b64encode(greeting_audio).decode() if greeting_audio else None,
                "message_type": "system",
            })

        _save_message(session_id, "interviewer", "question", question_text, opening["question_id"])
        q_audio = await synthesize_speech(question_text, language)
        await websocket.send_json({
            "type": "interviewer_speech",
            "text": question_text,
            "audio_base64": base64.b64encode(q_audio).decode() if q_audio else None,
            "question_id": opening["question_id"],
            "question_index": opening["question_index"],
            "total_questions": opening["total_questions"],
            "message_type": "question",
        })

        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "audio_chunk":
                audio_b64 = data.get("audio_base64", "")
                question_id = data.get("question_id")

                transcript = transcribe_audio_base64(audio_b64, language)
                if not transcript:
                    await websocket.send_json({"type": "transcript", "text": "", "final": False})
                    continue

                audio_bytes = base64.b64decode(audio_b64)
                msg_id = storage_service.new_doc_id()
                audio_path = f"{session_id}/{msg_id}.webm"
                try:
                    storage_service.upload_file("audio-recordings", audio_path, audio_bytes, "audio/webm")
                except Exception as exc:
                    logger.warning("Audio upload failed: %s", exc)
                    audio_path = None

                _save_message(session_id, "candidate", "answer", transcript, question_id, audio_path)
                await websocket.send_json({"type": "transcript", "text": transcript, "final": True})

                action = await decide_next_action(session_id, transcript, language)

                if action["action"] == "complete":
                    complete_msg = action.get("message", "Phong van ket thuc.")
                    _save_message(session_id, "interviewer", "system", complete_msg)
                    complete_audio = await synthesize_speech(complete_msg, language)
                    await websocket.send_json({
                        "type": "interview_complete",
                        "text": complete_msg,
                        "audio_base64": base64.b64encode(complete_audio).decode() if complete_audio else None,
                    })
                    break

                response_text = action["text"]
                msg_type_out = "follow_up" if action["action"] == "follow_up" else "question"
                _save_message(
                    session_id, "interviewer", msg_type_out, response_text, action.get("question_id")
                )
                resp_audio = await synthesize_speech(response_text, language)
                await websocket.send_json({
                    "type": "interviewer_speech",
                    "text": response_text,
                    "audio_base64": base64.b64encode(resp_audio).decode() if resp_audio else None,
                    "question_id": action.get("question_id"),
                    "question_index": action.get("question_index"),
                    "total_questions": action.get("total_questions"),
                    "message_type": msg_type_out,
                })

            elif msg_type == "transcribe_audio":
                audio_b64 = data.get("audio_base64", "")
                transcript = transcribe_audio_base64(audio_b64, language)

                # Tải file âm thanh lên Supabase để lưu giữ làm bằng chứng ghi âm
                audio_bytes = base64.b64decode(audio_b64)
                msg_id = storage_service.new_doc_id()
                audio_path = f"{session_id}/{msg_id}.webm"
                try:
                    storage_service.upload_file("audio-recordings", audio_path, audio_bytes, "audio/webm")
                except Exception as exc:
                    logger.warning("Audio upload failed during transcribe: %s", exc)
                    audio_path = None

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

                if action["action"] == "complete":
                    complete_msg = action.get("message", "Phong van ket thuc.")
                    _save_message(session_id, "interviewer", "system", complete_msg)
                    complete_audio = await synthesize_speech(complete_msg, language)
                    await websocket.send_json({
                        "type": "interview_complete",
                        "text": complete_msg,
                        "audio_base64": base64.b64encode(complete_audio).decode() if complete_audio else None,
                    })
                    break

                response_text = action["text"]
                msg_type_out = "follow_up" if action["action"] == "follow_up" else "question"
                _save_message(
                    session_id, "interviewer", msg_type_out, response_text, action.get("question_id")
                )
                resp_audio = await synthesize_speech(response_text, language)
                await websocket.send_json({
                    "type": "interviewer_speech",
                    "text": response_text,
                    "audio_base64": base64.b64encode(resp_audio).decode() if resp_audio else None,
                    "question_id": action.get("question_id"),
                    "question_index": action.get("question_index"),
                    "total_questions": action.get("total_questions"),
                    "message_type": msg_type_out,
                })

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
