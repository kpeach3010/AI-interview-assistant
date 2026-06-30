import { useCallback, useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AudioPlayer from "../components/AudioPlayer";
import InterviewProgress from "../components/InterviewProgress";
import MicRecorder from "../components/MicRecorder";
import TranscriptPanel from "../components/TranscriptPanel";
import { useAuth } from "../contexts/AuthContext";
import { useVoiceInterview } from "../hooks/useVoiceInterview";
import { useInterviewTimer, formatDurationText } from "../hooks/useInterviewTimer";
import { apiFetch, fetchAnswerHint, submitSessionTiming, submitQuestionTiming } from "../lib/api";
import {
  MicrophoneIcon,
  PencilSquareIcon,
  ArrowPathIcon,
  PaperAirplaneIcon,
  StopCircleIcon,
  CheckCircleIcon,
  EllipsisHorizontalIcon,
  SpeakerWaveIcon,
  PauseIcon,
  LightBulbIcon,
  ChevronUpIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";

export default function InterviewPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [completing, setCompleting] = useState(false);
  const [inputMode, setInputMode] = useState<"voice" | "text">("voice");
  const [textAnswer, setTextAnswer] = useState("");
  const [liveTranscript, setLiveTranscript] = useState<string>("");
  const [editedVoiceText, setEditedVoiceText] = useState("");
  const [voice, setVoice] = useState(() => localStorage.getItem("ai_voice") || "vi-VN-HoaiMyNeural");

  const [hintText, setHintText] = useState<string | null>(null);
  const [isLoadingHint, setIsLoadingHint] = useState(false);
  const [showHint, setShowHint] = useState(false);

  // UX độ trễ thấp: tự dừng khi im lặng (VAD) + gửi thẳng không cần xem lại.
  const [vadEnabled, setVadEnabled] = useState(
    () => localStorage.getItem("ai_vad") !== "0"
  );
  const [reviewBeforeSend, setReviewBeforeSend] = useState(
    () => localStorage.getItem("ai_review") === "1"
  );
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    localStorage.setItem("ai_voice", voice);
  }, [voice]);

  useEffect(() => {
    localStorage.setItem("ai_vad", vadEnabled ? "1" : "0");
  }, [vadEnabled]);

  useEffect(() => {
    localStorage.setItem("ai_review", reviewBeforeSend ? "1" : "0");
  }, [reviewBeforeSend]);

  const handleComplete = useCallback(async () => {
    if (!sessionId || !accessToken) return;
    setCompleting(true);
    try {
      await apiFetch(`/sessions/${sessionId}/complete`, { method: "POST" }, accessToken);
      navigate(`/report/${sessionId}`);
    } catch {
      navigate(`/report/${sessionId}`);
    }
  }, [sessionId, accessToken, navigate]);

  const {
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
  } = useVoiceInterview({
    sessionId: sessionId!,
    token: accessToken!,
    voice,
    onComplete: handleComplete,
  });

  const { 
    sessionElapsedMs, 
    questionElapsedMs, 
    startQuestion, 
    pauseQuestion, 
    completeSession,
    getCurrentQuestionTime,
    initializeTimers
  } = useInterviewTimer();

  const hasInitializedRef = useRef(false);

  // Initialize timers when history is received
  useEffect(() => {
    if (currentQuestionId && !hasInitializedRef.current) {
      const savedSessionMs = parseInt(sessionStorage.getItem(`session_${sessionId}_time`) || '0', 10);
      const savedQuestionMs = parseInt(sessionStorage.getItem(`question_${currentQuestionId}_time`) || '0', 10);

      const finalSessionMs = Math.max(initialSessionMs, savedSessionMs);
      const finalQuestionMs = Math.max(initialQuestionMs, savedQuestionMs);

      initializeTimers(finalSessionMs, finalQuestionMs, currentQuestionId);
      hasInitializedRef.current = true;
    }
  }, [initialSessionMs, initialQuestionMs, currentQuestionId, sessionId, initializeTimers]);

  // Save timings when user leaves the page or closes the tab
  useEffect(() => {
    const saveTimings = () => {
      const sessionTime = completeSession();
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      
      if (sessionTime && sessionTime.durationMs > 0) {
        sessionStorage.setItem(`session_${sessionId}_time`, sessionTime.durationMs.toString());
        fetch(`${apiUrl}/sessions/${sessionId}/timing`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({ total_duration_ms: sessionTime.durationMs }),
          keepalive: true
        }).catch(() => {});
      }

      const qTime = getCurrentQuestionTime();
      if (qTime && qTime.questionId && qTime.durationMs > 0) {
        sessionStorage.setItem(`question_${qTime.questionId}_time`, qTime.durationMs.toString());
        fetch(`${apiUrl}/sessions/${sessionId}/questions/${qTime.questionId}/timing`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({ answer_duration_ms: qTime.durationMs }),
          keepalive: true
        }).catch(() => {});
      }
    };

    window.addEventListener("beforeunload", saveTimings);
    return () => {
      window.removeEventListener("beforeunload", saveTimings);
      saveTimings();
    };
  }, [sessionId, accessToken, completeSession, getCurrentQuestionTime]);

  useEffect(() => {
    if (currentQuestionId && !isComplete) {
      const prevTime = startQuestion(currentQuestionId);
      if (prevTime !== null && prevTime.questionId && prevTime.durationMs > 0) {
        submitQuestionTiming(sessionId!, prevTime.questionId, prevTime.durationMs, accessToken!).catch(console.error);
      }
    }
  }, [currentQuestionId, isComplete, startQuestion, sessionId, accessToken]);

  // Chế độ XEM LẠI: khi có transcript thì đổ vào ô soạn để người dùng sửa rồi
  // tự bấm gửi (luồng 2 bước). Chế độ mặc định (1 bước) không đi qua đây.
  useEffect(() => {
    if (transcriptionResult !== null) {
      setEditedVoiceText(transcriptionResult);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcriptionResult]);

  // Gửi mốc thời gian khi chốt một câu trả lời (dùng chung cho mọi luồng gửi).
  const submitTimings = useCallback(() => {
    const time = pauseQuestion();
    if (time) {
      submitQuestionTiming(sessionId!, time.questionId, time.durationMs, accessToken!).catch(console.error);
      const sessionTime = completeSession();
      if (sessionTime) {
        submitSessionTiming(sessionId!, sessionTime.durationMs, accessToken!).catch(console.error);
      }
    }
  }, [pauseQuestion, completeSession, sessionId, accessToken]);

  // Khi AI bắt đầu xử lý (đã nhận câu trả lời) -> tắt cờ "đang gửi".
  useEffect(() => {
    if (messages.length > 0 && messages[messages.length - 1].role === "candidate") {
      setIsSending(false);
    }
  }, [messages]);

  // Reset hint state whenever a new question appears
  const lastInterviewerMsgForHint = [...messages]
    .reverse()
    .find((m) => m.role === "interviewer");
  const currentQuestionKey = lastInterviewerMsgForHint?.content ?? "";

  // Derived early so handleFetchHint can access it before the early return guard
  const currentQuestionTextEarly =
    lastInterviewerMsgForHint?.content || "Hệ thống đang chuẩn bị câu hỏi...";

  useEffect(() => {
    setHintText(null);
    setShowHint(false);
    setIsLoadingHint(false);
  }, [currentQuestionKey]);

  const handleEnd = () => {
    const sessionTime = completeSession();
    if (sessionTime && sessionTime.durationMs > 0) {
      submitSessionTiming(sessionId!, sessionTime.durationMs, accessToken!).catch(console.error);
    }
    // Also submit the last question's time
    if (currentQuestionId) {
      submitQuestionTiming(sessionId!, currentQuestionId, questionElapsedMs, accessToken!).catch(console.error);
    }
    endInterview();
    handleComplete();
  };

  const handleAudioRecording = (base64: string) => {
    if (reviewBeforeSend) {
      // Luồng 2 bước: nhận transcript -> xem lại -> tự bấm gửi.
      transcribeAudio(base64);
    } else {
      // Luồng 1 bước (mặc định): gửi thẳng, server STT + sinh câu kế trong 1 lần.
      submitTimings();
      setIsSending(true);
      sendAudioChunk(base64);
      setLiveTranscript("");
    }
  };

  const handleVoiceSubmit = () => {
    if (!editedVoiceText.trim()) return;
    const time = pauseQuestion();
    if (time) {
      submitQuestionTiming(sessionId!, time.questionId, time.durationMs, accessToken!).catch(console.error);
      const sessionTime = completeSession();
      if (sessionTime) {
        submitSessionTiming(sessionId!, sessionTime.durationMs, accessToken!).catch(console.error);
      }
    }
    submitAnswer(editedVoiceText, audioPath);
    setEditedVoiceText("");
    clearTranscription();
  };

  const handleTextSubmit = () => {
    if (!textAnswer.trim()) return;
    const time = pauseQuestion();
    if (time) {
      submitQuestionTiming(sessionId!, time.questionId, time.durationMs, accessToken!).catch(console.error);
      const sessionTime = completeSession();
      if (sessionTime) {
        submitSessionTiming(sessionId!, sessionTime.durationMs, accessToken!).catch(console.error);
      }
    }
    submitAnswer(textAnswer, null);
    setTextAnswer("");
  };

  const handleReRecord = () => {
    resetInputs();
  };

  const resetInputs = () => {
    clearTranscription();
    setEditedVoiceText("");
    setLiveTranscript("");
  };

  const handleFetchHint = async () => {
    if (!sessionId || !accessToken || isLoadingHint) return;

    // If hint already loaded, just toggle panel visibility without re-fetching
    if (hintText !== null) {
      setShowHint((prev) => !prev);
      return;
    }

    setIsLoadingHint(true);
    try {
      const res = await fetchAnswerHint(
        sessionId,
        currentQuestionTextEarly,
        "vi",
        accessToken
      );
      setHintText(res.hint);
      setShowHint(true);
    } catch {
      setHintText("Không thể tạo gợi ý. Vui lòng thử lại.");
      setShowHint(true);
    } finally {
      setIsLoadingHint(false);
    }
  };

  if (!sessionId || !accessToken) return null;

  if (!isInitialized) {
    return (
      <div className="max-w-7xl mx-auto flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="w-12 h-12 rounded-full border-4 border-violet-100 border-t-violet-600 animate-spin"></div>
        <p className="text-slate-500 font-medium animate-pulse">Đang kết nối và tải dữ liệu phỏng vấn...</p>
      </div>
    );
  }

  const lastInterviewerMsg = [...messages]
    .reverse()
    .find((m) => m.role === "interviewer");
  const currentQuestionText = lastInterviewerMsg?.content || "Hệ thống đang chuẩn bị câu hỏi...";
  const isFollowUp = lastInterviewerMsg?.message_type === "follow_up";

  // Kiểm tra xem AI có đang xử lý (người dùng vừa trả lời xong)
  const isAiProcessing = messages.length > 0 && messages[messages.length - 1].role === "candidate" && !isComplete;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Phòng phỏng vấn</h1>
        <div className="flex items-center gap-4">
          <select
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-violet-500"
          >
            <option value="vi-VN-HoaiMyNeural">Giọng nữ</option>
            <option value="vi-VN-NamMinhNeural">Giọng nam</option>
          </select>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm">
              <ClockIcon className="w-4 h-4 text-violet-500" />
              {formatDurationText(sessionElapsedMs)}
            </span>
            <span className={`text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5 ${connected ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
              <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-500 animate-ping" : "bg-red-500"}`}></span>
              {connected ? "Đã kết nối" : "Đang kết nối..."}
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 text-sm shadow-sm flex items-center gap-2">
          {error}
        </div>
      )}

      {/* Bố cục 2 cột trên màn hình lớn */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

        {/* Cột trái: Câu hỏi & Nhập liệu (chiếm 2 phần) */}
        <div className="lg:col-span-2 flex flex-col gap-6">

          {/* Hộp hiển thị câu hỏi hiện tại */}
          {!isComplete && (
            <div className="bg-gradient-to-br from-violet-50 to-indigo-50/50 rounded-2xl border border-violet-100 p-6 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-violet-200/40 rounded-full blur-2xl pointer-events-none"></div>

              <div className="flex items-start justify-between gap-4 relative z-10">
                <div className="space-y-3 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-violet-700 tracking-wider uppercase bg-violet-100/50 px-2.5 py-1 rounded-md">Câu hỏi {questionIndex + 1}</span>
                    {isFollowUp && (
                      <span className="text-[10px] font-bold text-emerald-700 uppercase bg-emerald-100/80 px-2 py-1 rounded-md flex items-center gap-1 shadow-sm" title="AI đang hỏi sâu thêm vào câu trả lời trước đó của bạn">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
                        Đào sâu
                      </span>
                    )}
                    {!isAiProcessing && (
                      <span className="text-xs font-medium text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded shadow-sm flex items-center gap-1">
                        <ClockIcon className="w-3 h-3" /> {formatDurationText(questionElapsedMs)}
                      </span>
                    )}
                  </div>
                  {isAiProcessing ? (
                    <div className="flex items-center gap-2 text-violet-600 mt-2 font-medium">
                      <EllipsisHorizontalIcon className="w-6 h-6 animate-pulse" />
                      <span className="animate-pulse">Đang phân tích và chuẩn bị câu hỏi tiếp theo...</span>
                    </div>
                  ) : (
                    <p className="text-slate-800 text-[17px] font-medium leading-relaxed">
                      {currentQuestionText}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-3 shrink-0">
                  {/* Replay audio button */}
                  <button
                    onClick={replayAudio}
                    disabled={!lastQuestionAudio || isAiSpeaking}
                    className={`p-3 rounded-full shadow-sm flex items-center justify-center transition-all ${isAiSpeaking
                      ? "bg-violet-600 text-white animate-pulse"
                      : lastQuestionAudio
                        ? "bg-white text-slate-700 hover:bg-violet-50 hover:text-violet-700 hover:scale-105 active:scale-95"
                        : "bg-slate-100 text-slate-400 cursor-not-allowed"
                      }`}
                    title="Đọc lại câu hỏi"
                  >
                    {isAiSpeaking ? (
                      <SpeakerWaveIcon className="w-5 h-5 animate-bounce" />
                    ) : (
                      <SpeakerWaveIcon className="w-5 h-5" />
                    )}
                  </button>

                  {/* Hint button: pill shape with visible label for clarity */}
                  <button
                    id="btn-answer-hint"
                    onClick={handleFetchHint}
                    disabled={isLoadingHint || isAiSpeaking || !connected}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold shadow-sm transition-all ${isLoadingHint
                      ? "bg-amber-400 text-white animate-pulse cursor-not-allowed"
                      : showHint
                        ? "bg-amber-500 text-white hover:bg-amber-600 hover:scale-105 active:scale-95"
                        : hintText !== null
                          ? "bg-amber-50 text-amber-600 border border-amber-300 hover:bg-amber-100 hover:scale-105 active:scale-95"
                          : "bg-white text-amber-500 border border-amber-200 hover:bg-amber-50 hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                      }`}
                    title={showHint ? "Ẩn gợi ý" : "Gợi ý câu trả lời"}
                  >
                    {isLoadingHint ? (
                      <><ArrowPathIcon className="w-4 h-4 animate-spin" /> <span>Đang tạo...</span></>
                    ) : showHint ? (
                      <><ChevronUpIcon className="w-4 h-4" /> <span>Ẩn gợi ý</span></>
                    ) : hintText !== null ? (
                      <><LightBulbIcon className="w-4 h-4" /> <span>Xem lại gợi ý</span></>
                    ) : (
                      <><LightBulbIcon className="w-4 h-4" /> <span>Gợi ý trả lời</span></>
                    )}
                  </button>
                </div>
              </div>

              {/* Hint panel: slides in below the question text */}
              {showHint && hintText && (
                <div className="mt-4 relative z-10 rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 shrink-0">
                      <LightBulbIcon className="w-4 h-4 text-amber-500" />
                      <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">Gợi ý trả lời</span>
                    </div>
                    {/* <button
                      id="btn-hide-hint"
                      onClick={() => setShowHint(false)}
                      className="text-amber-400 hover:text-amber-600 transition-colors shrink-0"
                      title="Ẩn gợi ý"
                    >
                      <ChevronUpIcon className="w-4 h-4" />
                    </button> */}
                  </div>
                  <ul className="mt-3 space-y-2">
                    {hintText
                      .split("\n")
                      .filter((line) => line.trim())
                      .map((line, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-amber-900 leading-relaxed">
                          <span className="mt-0.5 text-amber-400 shrink-0">•</span>
                          <span>{line.replace(/^[•\-\*]\s*/, "")}</span>
                        </li>
                      ))}
                  </ul>
                  <p className="mt-3 text-[11px] text-amber-500 italic">
                    Chỉ để tham khảo hãy tự suy nghĩ thêm!
                  </p>
                </div>
              )}

              <div className="mt-5 pt-4 border-t border-violet-100 flex justify-between items-center relative z-10 text-xs">
                <span className="text-violet-600 font-medium flex items-center gap-1.5">
                  {isAiSpeaking ? <><SpeakerWaveIcon className="w-4 h-4" /> Đang phát âm thanh...</> : <><PauseIcon className="w-4 h-4" /> Đã dừng</>}
                </span>
                <label className="flex items-center gap-2 cursor-pointer select-none text-slate-600 hover:text-slate-800 transition font-medium">
                  <input
                    type="checkbox"
                    checked={autoReadAloud}
                    onChange={(e) => setAutoReadAloud(e.target.checked)}
                    className="w-4 h-4 rounded text-violet-600 focus:ring-violet-500 border-slate-300"
                  />
                  Tự động đọc
                </label>
              </div>
            </div>
          )}

          {/* Lựa chọn và nhập liệu câu trả lời */}
          {!isComplete && !isAiProcessing && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
              <div className="flex justify-center">
                <div className="bg-slate-100 p-1.5 rounded-xl flex gap-1 w-full max-w-md">
                  <button
                    type="button"
                    onClick={() => {
                      setInputMode("voice");
                      resetInputs();
                    }}
                    className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${inputMode === "voice"
                      ? "bg-white text-violet-700 shadow-sm"
                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                      }`}
                  >
                    <MicrophoneIcon className="w-5 h-5" /> Giọng nói
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInputMode("text");
                      resetInputs();
                    }}
                    className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${inputMode === "text"
                      ? "bg-white text-violet-700 shadow-sm"
                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                      }`}
                  >
                    <PencilSquareIcon className="w-5 h-5" /> Văn bản
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {/* CHẾ ĐỘ NHẬP VĂN BẢN */}
                {inputMode === "text" && (
                  <div className="space-y-3">
                    <textarea
                      value={textAnswer}
                      onChange={(e) => setTextAnswer(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          if (textAnswer.trim() && !isAiSpeaking && connected) {
                            handleTextSubmit();
                          }
                        }
                      }}
                      placeholder="Nhập câu trả lời chi tiết của bạn ở đây..."
                      rows={5}
                      className="w-full p-4 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 text-[15px] shadow-sm resize-none transition-all placeholder:text-slate-400"
                    />
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-400 font-medium bg-slate-50 px-2 py-1 rounded-md">
                        {textAnswer.length} ký tự
                      </span>
                      <button
                        onClick={handleTextSubmit}
                        disabled={!textAnswer.trim() || isAiSpeaking || !connected}
                        className="bg-violet-600 text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 transition-all shadow-md shadow-violet-500/20 flex items-center gap-2"
                      >
                        <PaperAirplaneIcon className="w-4 h-4" /> Gửi câu trả lời
                      </button>
                    </div>
                  </div>
                )}

                {/* CHẾ ĐỘ GHI ÂM GIỌNG NÓI */}
                {inputMode === "voice" && (
                  <div className="flex flex-col items-center justify-center">
                    {transcriptionResult === null && !isTranscribing && !isSending && (
                      <div className="py-6 flex flex-col items-center w-full">
                        <MicRecorder
                          onAudioChunk={handleAudioRecording}
                          onLiveTranscript={setLiveTranscript}
                          disabled={isAiSpeaking || !connected}
                          vadEnabled={vadEnabled}
                        />
                        {/* Toggle UX độ trễ thấp */}
                        <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-xs text-slate-500">
                          <label className="flex items-center gap-1.5 cursor-pointer select-none hover:text-slate-700">
                            <input
                              type="checkbox"
                              checked={vadEnabled}
                              onChange={(e) => setVadEnabled(e.target.checked)}
                              className="w-3.5 h-3.5 rounded text-violet-600 focus:ring-violet-500 border-slate-300"
                            />
                            Tự dừng khi im lặng
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer select-none hover:text-slate-700">
                            <input
                              type="checkbox"
                              checked={reviewBeforeSend}
                              onChange={(e) => setReviewBeforeSend(e.target.checked)}
                              className="w-3.5 h-3.5 rounded text-violet-600 focus:ring-violet-500 border-slate-300"
                            />
                            Xem lại trước khi gửi
                          </label>
                        </div>
                        {liveTranscript && (
                          <div className="mt-6 w-full max-w-lg p-4 bg-slate-50 border border-slate-200 rounded-xl shadow-inner transition-all duration-300">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Đang nghe...</span>
                            </div>
                            <p className="text-[15px] text-slate-700 leading-relaxed italic">
                              "{liveTranscript}"
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {(isTranscribing || isSending) && (
                      <div className="flex flex-col items-center gap-4 py-10">
                        <div className="w-10 h-10 border-4 border-violet-100 border-t-violet-600 rounded-full animate-spin"></div>
                        <p className="text-sm font-semibold text-slate-500">
                          {isSending ? "Đang gửi câu trả lời..." : "Đang nhận diện giọng nói..."}
                        </p>
                      </div>
                    )}

                    {transcriptionResult !== null && (
                      <div className="w-full space-y-3 bg-violet-50/50 border border-violet-100 p-5 rounded-2xl shadow-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-violet-700 uppercase tracking-wide bg-violet-100 px-2 py-1 rounded">Kiểm tra văn bản</span>
                          <span className="text-xs text-slate-500">Có thể chỉnh sửa</span>
                        </div>
                        <textarea
                          value={editedVoiceText}
                          onChange={(e) => setEditedVoiceText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              if (editedVoiceText.trim() && !isAiSpeaking && connected) {
                                handleVoiceSubmit();
                              }
                            }
                          }}
                          rows={4}
                          className="w-full p-4 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 text-[15px] shadow-sm transition-all"
                        />
                        <div className="flex flex-wrap justify-end gap-3 pt-2">
                          <button
                            onClick={handleReRecord}
                            className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition-colors flex items-center gap-2 shadow-sm"
                          >
                            <ArrowPathIcon className="w-4 h-4" /> Ghi âm lại
                          </button>
                          <button
                            onClick={handleVoiceSubmit}
                            disabled={!editedVoiceText.trim() || isAiSpeaking || !connected}
                            className="px-6 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 transition-all shadow-md shadow-violet-500/20 flex items-center gap-2"
                          >
                            <PaperAirplaneIcon className="w-4 h-4" /> Gửi câu trả lời
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="pt-6 border-t border-slate-100 flex justify-center">
                <button
                  onClick={handleEnd}
                  className="text-xs font-semibold text-red-500 hover:text-red-600 bg-red-50 hover:bg-red-100 px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <StopCircleIcon className="w-4 h-4" /> Kết thúc phỏng vấn
                </button>
              </div>
            </div>
          )}

          {isComplete && (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 shadow-sm text-center flex flex-col items-center justify-center space-y-5">
              <div className="w-20 h-20 bg-green-50 text-green-500 rounded-full flex items-center justify-center border-4 border-green-100">
                <CheckCircleIcon className="w-12 h-12" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Hoàn thành phỏng vấn!</h2>
                <p className="text-slate-500">Hệ thống đang tổng hợp và đánh giá kết quả của bạn.</p>
              </div>
              <button
                onClick={handleComplete}
                disabled={completing}
                className="mt-4 w-full max-w-xs bg-violet-600 text-white py-3 px-6 rounded-xl font-semibold hover:bg-violet-700 disabled:opacity-50 transition-all shadow-md shadow-violet-500/20 flex justify-center items-center gap-2"
              >
                {completing ? (
                  <>
                    <ArrowPathIcon className="w-5 h-5 animate-spin" /> Đang đánh giá...
                  </>
                ) : (
                  "Xem báo cáo chi tiết"
                )}
              </button>
            </div>
          )}
        </div>

        {/* Cột phải: Tiến trình & Lịch sử hội thoại (chiếm 1 phần) */}
        <div className="lg:col-span-1 space-y-6">
          {totalQuestions > 0 && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <InterviewProgress current={questionIndex} total={totalQuestions} />
            </div>
          )}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">Lịch sử hội thoại</h3>
            <TranscriptPanel messages={messages} />
          </div>
        </div>

      </div>

      <AudioPlayer audioBase64={currentAudio} onEnded={onAudioEnded} />
    </div>
  );
}
