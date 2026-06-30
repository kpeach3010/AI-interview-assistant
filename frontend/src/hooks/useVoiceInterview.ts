import { useCallback, useEffect, useRef, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL as string;
const WS_URL = API_URL.replace(/^http/, "ws");

interface TranscriptMessage {
  role: string;
  content: string;
  message_type?: string;
}

interface UseVoiceInterviewOptions {
  sessionId: string;
  token: string;
  voice: string;
  onComplete?: () => void;
}

export function useVoiceInterview({ sessionId, token, voice, onComplete }: UseVoiceInterviewOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [currentAudio, setCurrentAudio] = useState<string | null>(null);
  const [lastQuestionAudio, setLastQuestionAudio] = useState<string | null>(null);
  const [currentQuestionId, setCurrentQuestionId] = useState<string | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);

  // Transcription state
  const [transcriptionResult, setTranscriptionResult] = useState<string | null>(null);
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const [initialSessionMs, setInitialSessionMs] = useState(0);
  const [initialQuestionMs, setInitialQuestionMs] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);

  // Auto read-aloud state & ref to avoid stale closure in WebSocket
  const [autoReadAloud, setAutoReadAloud] = useState(true);
  const autoReadAloudRef = useRef(true);

  useEffect(() => {
    autoReadAloudRef.current = autoReadAloud;
  }, [autoReadAloud]);

  useEffect(() => {
    const ws = new WebSocket(`${WS_URL}/ws/interview/${sessionId}?token=${token}&voice=${encodeURIComponent(voice)}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setError(null);
    };
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setError("Lỗi kết nối WebSocket");

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "history") {
        setMessages(data.messages);
        if (data.question_id) setCurrentQuestionId(data.question_id);
        if (data.question_index != null) setQuestionIndex(data.question_index);
        if (data.total_questions) setTotalQuestions(data.total_questions);
        if (data.session_duration_ms != null) setInitialSessionMs(data.session_duration_ms);
        if (data.question_duration_ms != null) setInitialQuestionMs(data.question_duration_ms);
        if (data.last_audio_base64) {
          setLastQuestionAudio(data.last_audio_base64);
        }
        setIsInitialized(true);
      }

      if (data.type === "interviewer_speech") {
        setMessages((prev) => [
          ...prev,
          { role: "interviewer", content: data.text, message_type: data.message_type },
        ]);
        if (data.audio_base64) {
          setLastQuestionAudio(data.audio_base64);
          if (autoReadAloudRef.current) {
            setCurrentAudio(data.audio_base64);
            setIsAiSpeaking(true);
          }
        } else {
          setLastQuestionAudio(null);
        }
        if (data.question_id) setCurrentQuestionId(data.question_id);
        if (data.question_index != null) setQuestionIndex(data.question_index);
        if (data.total_questions) setTotalQuestions(data.total_questions);

        // Reset transcription result for new question
        setTranscriptionResult(null);
        setAudioPath(null);
        setIsTranscribing(false);
      }

      if (data.type === "transcription_result") {
        setTranscriptionResult(data.text);
        setAudioPath(data.audio_path);
        setIsTranscribing(false);
      }

      if (data.type === "transcript" && data.final && data.text) {
        setMessages((prev) => [
          ...prev,
          { role: "candidate", content: data.text, message_type: "answer" },
        ]);
      }

      if (data.type === "interview_complete") {
        setIsComplete(true);
        setMessages((prev) => [
          ...prev,
          { role: "system", content: data.text, message_type: "system" },
        ]);
        onComplete?.();
      }

      if (data.type === "error") {
        setError(data.message);
      }
    };

    return () => ws.close();
  }, [sessionId, token, voice, onComplete]);

  // Giữ lại để tương thích ngược nếu cần
  const sendAudioChunk = useCallback(
    (audioBase64: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN && currentQuestionId) {
        wsRef.current.send(
          JSON.stringify({
            type: "audio_chunk",
            audio_base64: audioBase64,
            question_id: currentQuestionId,
          })
        );
      }
    },
    [currentQuestionId]
  );

  const transcribeAudio = useCallback(
    (audioBase64: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        setIsTranscribing(true);
        setTranscriptionResult(null);
        setAudioPath(null);
        wsRef.current.send(
          JSON.stringify({
            type: "transcribe_audio",
            audio_base64: audioBase64,
          })
        );
      }
    },
    []
  );

  const submitAnswer = useCallback(
    (text: string, audioPathVal?: string | null) => {
      if (wsRef.current?.readyState === WebSocket.OPEN && currentQuestionId) {
        wsRef.current.send(
          JSON.stringify({
            type: "submit_answer",
            text,
            question_id: currentQuestionId,
            audio_path: audioPathVal || null,
          })
        );
        // Dọn dẹp trạng thái sau khi gửi
        setTranscriptionResult(null);
        setAudioPath(null);
      }
    },
    [currentQuestionId]
  );

  const endInterview = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: "end_interview" }));
  }, []);

  const onAudioEnded = useCallback(() => {
    setIsAiSpeaking(false);
    setCurrentAudio(null);
  }, []);

  const replayAudio = useCallback(() => {
    if (lastQuestionAudio) {
      setCurrentAudio(null);
      setTimeout(() => {
        setCurrentAudio(lastQuestionAudio);
        setIsAiSpeaking(true);
      }, 50);
    }
  }, [lastQuestionAudio]);

  const clearTranscription = useCallback(() => {
    setTranscriptionResult(null);
    setAudioPath(null);
    setIsTranscribing(false);
  }, []);

  return {
    connected,
    messages,
    currentAudio,
    lastQuestionAudio,
    questionIndex,
    totalQuestions,
    isComplete,
    error,
    isAiSpeaking,
    autoReadAloud,
    setAutoReadAloud,
    transcriptionResult,
    audioPath,
    isTranscribing,
    sendAudioChunk,
    transcribeAudio,
    submitAnswer,
    replayAudio,
    clearTranscription,
    endInterview,
    onAudioEnded,
    currentQuestionId,
    initialSessionMs,
    initialQuestionMs,
    isInitialized,
  };
}
