import { useCallback, useRef, useState, useEffect } from "react";

// SpeechRecognition type definitions
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

interface MicRecorderProps {
  onAudioChunk: (base64: string) => void;
  onLiveTranscript?: (text: string) => void;
  disabled?: boolean;
  /** Tự dừng ghi âm khi phát hiện im lặng (VAD). Mặc định bật. */
  vadEnabled?: boolean;
  /** Thời gian im lặng (ms) trước khi tự dừng. */
  silenceMs?: number;
}

export default function MicRecorder({
  onAudioChunk,
  onLiveTranscript,
  disabled,
  vadEnabled = true,
  silenceMs = 1200,
}: MicRecorderProps) {
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<any>(null);

  // VAD (voice activity detection) refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const vadRafRef = useRef<number | null>(null);
  const hasSpokenRef = useRef(false);
  const silenceStartRef = useRef<number | null>(null);

  const cleanupVad = useCallback(() => {
    if (vadRafRef.current != null) {
      cancelAnimationFrame(vadRafRef.current);
      vadRafRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    hasSpokenRef.current = false;
    silenceStartRef.current = null;
  }, []);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'vi-VN';

      recognition.onresult = (event: any) => {
        let fullTranscript = '';
        for (let i = 0; i < event.results.length; ++i) {
          fullTranscript += event.results[i][0].transcript;
        }
        if (onLiveTranscript) {
          onLiveTranscript(fullTranscript);
        }
      };
      
      recognitionRef.current = recognition;
    }
  }, [onLiveTranscript]);

  const sendFullRecording = useCallback(() => {
    if (chunksRef.current.length === 0) return;
    // Merge chunks into a complete WebM blob with headers
    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    chunksRef.current = [];
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      if (base64) onAudioChunk(base64);
    };
    reader.readAsDataURL(blob);
  }, [onAudioChunk]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      // Send only when stopped to ensure complete headers for STT
      recorder.onstop = () => {
        sendFullRecording();
      };

      // Record continuously without timeslice, export data on stop
      recorder.start();
      setRecording(true);

      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (e) {
          console.error("Lỗi khi bắt đầu nhận diện giọng nói: ", e);
        }
      }

      // VAD: tự dừng khi im lặng (sau khi đã có tiếng nói).
      if (vadEnabled) {
        try {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          const ctx = new AudioCtx();
          audioCtxRef.current = ctx;
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 2048;
          source.connect(analyser);
          const buf = new Uint8Array(analyser.fftSize);
          hasSpokenRef.current = false;
          silenceStartRef.current = null;

          const SPEAK_RMS = 0.025; // ngưỡng coi là "có tiếng nói"
          const tick = () => {
            if (mediaRecorderRef.current?.state !== "recording") return;
            analyser.getByteTimeDomainData(buf);
            let sum = 0;
            for (let i = 0; i < buf.length; i++) {
              const v = (buf[i] - 128) / 128;
              sum += v * v;
            }
            const rms = Math.sqrt(sum / buf.length);
            const now = performance.now();
            if (rms > SPEAK_RMS) {
              hasSpokenRef.current = true;
              silenceStartRef.current = null;
            } else if (hasSpokenRef.current) {
              if (silenceStartRef.current == null) {
                silenceStartRef.current = now;
              } else if (now - silenceStartRef.current >= silenceMs) {
                stopRecording();
                return;
              }
            }
            vadRafRef.current = requestAnimationFrame(tick);
          };
          vadRafRef.current = requestAnimationFrame(tick);
        } catch (e) {
          console.error("VAD init failed:", e);
        }
      }
    } catch {
      alert("Không thể truy cập microphone. Vui lòng cấp quyền.");
    }
  };

  const stopRecording = () => {
    cleanupVad();
    if (mediaRecorderRef.current?.state === "recording") {
      // stop() triggers ondataavailable then onstop to send blob
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.error("Lỗi khi dừng nhận diện giọng nói: ", e);
      }
    }
    setRecording(false);
  };

  // Dọn dẹp VAD khi unmount
  useEffect(() => cleanupVad, [cleanupVad]);

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        onClick={recording ? stopRecording : startRecording}
        disabled={disabled}
        className={`w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl shadow-lg transition ${recording
            ? "bg-red-500 hover:bg-red-600 animate-pulse"
            : "bg-primary-600 hover:bg-primary-700"
          } disabled:opacity-50`}
      >
        {recording ? "⏹" : "🎤"}
      </button>
      <p className="text-sm text-slate-500">
        {recording ? "Đang ghi âm... Nhấn để dừng" : "Nhấn để bắt đầu trả lời"}
      </p>
    </div>
  );
}
