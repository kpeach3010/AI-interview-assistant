import { useCallback, useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AudioPlayer from "../components/AudioPlayer";
import InterviewProgress from "../components/InterviewProgress";
import MicRecorder from "../components/MicRecorder";
import TranscriptPanel from "../components/TranscriptPanel";
import { useAuth } from "../contexts/AuthContext";
import { useVoiceInterview } from "../hooks/useVoiceInterview";
import { apiFetch } from "../lib/api";

export default function InterviewPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [completing, setCompleting] = useState(false);
  const [inputMode, setInputMode] = useState<"voice" | "text">("voice");
  const [textAnswer, setTextAnswer] = useState("");
  const [editedVoiceText, setEditedVoiceText] = useState("");

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
    transcribeAudio,
    submitAnswer,
    replayAudio,
    clearTranscription,
    endInterview,
    onAudioEnded,
  } = useVoiceInterview({
    sessionId: sessionId!,
    token: accessToken!,
    onComplete: handleComplete,
  });

  // Đồng bộ hóa kết quả chuyển đổi giọng nói -> văn bản vào textarea chỉnh sửa
  useEffect(() => {
    if (transcriptionResult !== null) {
      setEditedVoiceText(transcriptionResult);
    }
  }, [transcriptionResult]);

  const handleEnd = () => {
    endInterview();
    handleComplete();
  };

  const handleAudioRecording = (base64: string) => {
    transcribeAudio(base64);
  };

  const handleVoiceSubmit = () => {
    if (!editedVoiceText.trim()) return;
    submitAnswer(editedVoiceText, audioPath);
    setEditedVoiceText("");
    clearTranscription();
  };

  const handleTextSubmit = () => {
    if (!textAnswer.trim()) return;
    submitAnswer(textAnswer, null);
    setTextAnswer("");
  };

  const handleReRecord = () => {
    clearTranscription();
    setEditedVoiceText("");
  };

  if (!sessionId || !accessToken) return null;

  // Lấy câu hỏi hiện tại từ cuộc hội thoại
  const lastInterviewerMsg = [...messages]
    .reverse()
    .find((m) => m.role === "interviewer");
  const currentQuestionText = lastInterviewerMsg?.content || "Hệ thống đang chuẩn bị câu hỏi...";

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Phòng phỏng vấn</h1>
        <span className={`text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1.5 ${connected ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-500 animate-ping" : "bg-red-500"}`}></span>
          {connected ? "Đã kết nối" : "Đang kết nối..."}
        </span>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 text-sm shadow-sm">
          {error}
        </div>
      )}

      {totalQuestions > 0 && (
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
          <InterviewProgress current={questionIndex} total={totalQuestions} />
        </div>
      )}

      {/* Hộp hiển thị câu hỏi hiện tại (Đứng đầu và rất trực quan) */}
      {!isComplete && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50/30 rounded-2xl border border-blue-100/50 p-6 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-100/30 rounded-full blur-xl pointer-events-none"></div>
          
          <div className="flex items-start justify-between gap-4 relative z-10">
            <div className="space-y-2 flex-1">
              <span className="text-xs font-bold text-primary-600 tracking-wider uppercase">Câu hỏi từ nhà tuyển dụng</span>
              <p className="text-slate-800 text-lg font-medium leading-relaxed">
                {currentQuestionText}
              </p>
            </div>
            
            <div className="flex flex-col items-end gap-3 shrink-0">
              <button
                onClick={replayAudio}
                disabled={!lastQuestionAudio || isAiSpeaking}
                className={`p-3 rounded-full shadow-md flex items-center justify-center transition-all ${
                  isAiSpeaking 
                    ? "bg-primary-500 text-white animate-pulse" 
                    : lastQuestionAudio
                    ? "bg-white text-slate-700 hover:bg-slate-50 hover:scale-105 active:scale-95"
                    : "bg-slate-100 text-slate-400 cursor-not-allowed"
                }`}
                title="Đọc lại câu hỏi"
              >
                {isAiSpeaking ? (
                  <svg className="w-5 h-5 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center relative z-10 text-xs">
            <span className="text-slate-500 font-medium">
              {isAiSpeaking ? "🔊 Nhà tuyển dụng đang nói..." : "⏸ Đã dừng phát giọng nói"}
            </span>
            <label className="flex items-center gap-2 cursor-pointer select-none text-slate-600 hover:text-slate-800 transition">
              <input
                type="checkbox"
                checked={autoReadAloud}
                onChange={(e) => setAutoReadAloud(e.target.checked)}
                className="w-4 h-4 rounded text-primary-600 focus:ring-primary-500 border-slate-300"
              />
              Tự động đọc câu hỏi mới
            </label>
          </div>
        </div>
      )}

      {/* Lịch sử cuộc hội thoại */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Lịch sử cuộc hội thoại</h3>
        <TranscriptPanel messages={messages} />
      </div>

      <AudioPlayer audioBase64={currentAudio} onEnded={onAudioEnded} />

      {/* Lựa chọn và nhập liệu câu trả lời */}
      {!isComplete && (
        <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-6">
          <div className="flex justify-center">
            <div className="bg-slate-100 p-1 rounded-xl flex gap-1 w-full max-w-sm">
              <button
                type="button"
                onClick={() => {
                  setInputMode("voice");
                  clearTranscription();
                }}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 ${
                  inputMode === "voice"
                    ? "bg-white text-primary-600 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span>🎙️</span> Giọng nói
              </button>
              <button
                type="button"
                onClick={() => {
                  setInputMode("text");
                  clearTranscription();
                }}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 ${
                  inputMode === "text"
                    ? "bg-white text-primary-600 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span>✍️</span> Văn bản
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
                  placeholder="Nhập câu trả lời chi tiết của bạn ở đây..."
                  rows={4}
                  className="w-full p-4 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm shadow-inner resize-none transition"
                />
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400">
                    {textAnswer.length} ký tự
                  </span>
                  <button
                    onClick={handleTextSubmit}
                    disabled={!textAnswer.trim() || isAiSpeaking || !connected}
                    className="bg-primary-600 text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 transition shadow-sm"
                  >
                    Gửi câu trả lời
                  </button>
                </div>
              </div>
            )}

            {/* CHẾ ĐỘ GHI ÂM GIỌNG NÓI */}
            {inputMode === "voice" && (
              <div className="flex flex-col items-center justify-center">
                {transcriptionResult === null && !isTranscribing && (
                  <div className="py-4">
                    <MicRecorder
                      onAudioChunk={handleAudioRecording}
                      disabled={isAiSpeaking || !connected}
                    />
                  </div>
                )}

                {isTranscribing && (
                  <div className="flex flex-col items-center gap-3 py-6">
                    <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
                    <p className="text-sm font-medium text-slate-600">Đang nhận diện giọng nói của bạn...</p>
                  </div>
                )}

                {transcriptionResult !== null && (
                  <div className="w-full space-y-3 bg-slate-50 border border-slate-200/60 p-4 rounded-xl shadow-inner animate-fadeIn">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Kiểm tra lại câu trả lời</span>
                      <span className="text-xs text-slate-400">Có thể chỉnh sửa văn bản dưới đây</span>
                    </div>
                    <textarea
                      value={editedVoiceText}
                      onChange={(e) => setEditedVoiceText(e.target.value)}
                      rows={4}
                      className="w-full p-3 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm shadow-sm"
                    />
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={handleReRecord}
                        className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-100 font-medium transition"
                      >
                        Ghi âm lại 🔄
                      </button>
                      <button
                        onClick={handleVoiceSubmit}
                        disabled={!editedVoiceText.trim() || isAiSpeaking || !connected}
                        className="px-5 py-2 bg-primary-600 text-white rounded-lg text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 transition shadow-sm"
                      >
                        Gửi câu trả lời 🚀
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-center">
            <button
              onClick={handleEnd}
              className="text-xs font-semibold text-red-500 hover:text-red-600 bg-red-50 hover:bg-red-100 px-4 py-2 rounded-xl transition border border-red-100"
            >
              Kết thúc phỏng vấn ⏹
            </button>
          </div>
        </div>
      )}

      {isComplete && (
        <div className="bg-white rounded-2xl border border-slate-100 p-8 shadow-md text-center max-w-md mx-auto space-y-4">
          <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto border border-green-200">
            <span className="text-3xl">🎉</span>
          </div>
          <h2 className="text-xl font-bold text-slate-800">Phỏng vấn kết thúc!</h2>
          <p className="text-sm text-slate-500">
            Hệ thống đang tổng hợp và đánh giá câu trả lời của bạn.
          </p>
          <button
            onClick={handleComplete}
            disabled={completing}
            className="w-full bg-primary-600 text-white py-3 rounded-xl font-semibold hover:bg-primary-700 disabled:opacity-50 transition shadow-md shadow-primary-500/10"
          >
            {completing ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                Đang đánh giá...
              </span>
            ) : (
              "Xem báo cáo chi tiết"
            )}
          </button>
        </div>
      )}
    </div>
  );
}
