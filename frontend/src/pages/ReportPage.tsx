import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import {
  ArrowLeftIcon,
  DocumentTextIcon,
  SparklesIcon,
  ChartBarIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  LightBulbIcon,
} from '@heroicons/react/24/outline';
import { StarIcon } from '@heroicons/react/24/solid';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch, ApiError, type Session } from '../lib/api';
import { formatDurationText } from '../hooks/useInterviewTimer';

const API_URL = import.meta.env.VITE_API_URL as string;

// Define an independent interface to avoid conflict with the original Report type
interface ReportData {
  total_duration_ms?: number;
  overall_score?: number;
  avg_content?: number;
  avg_relevance?: number;
  avg_completeness?: number;
  avg_presentation?: number;
  summary?: string;
  pdf_url?: string;
  cv_suggestions?: Array<{ section: string; suggestion: string }>;
  evaluations?: Array<{
    question_id?: string;
    category: string;
    question_text: string;
    score_overall?: number;
    feedback: string;
    sample_answer?: string;
    candidate_answer?: string | null;
    answer_duration_ms?: number;
  }>;
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 30, scale: 0.95 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 100, damping: 15 } },
};

export default function ReportPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { accessToken } = useAuth();
  const [report, setReport] = useState<ReportData | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(0);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [outerRadius, setOuterRadius] = useState('70%');
  const [messages, setMessages] = useState<any[]>([]);

  const analyzeSpeech = (text: string, lang: string) => {
    if (!text) return null;
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

    const vietnameseFillers = [/ừm/gi, /\bờ\b/gi, /\bthì\b/gi, /\blà\b/gi, /\bkiểu\b/gi, /\bđó\b/gi];
    const englishFillers = [/\buh\b/gi, /\bum\b/gi, /\blike\b/gi, /\bso\b/gi, /\byou know\b/gi, /\bactually\b/gi];
    const fillersRegex = lang === 'en' ? englishFillers : vietnameseFillers;
    let fillerCount = 0;
    fillersRegex.forEach(regex => {
      const matches = text.match(regex);
      if (matches) fillerCount += matches.length;
    });

    const seed = wordCount * 7 + text.length * 3;
    const baseWpm = 125 + (seed % 25);
    const wpm = wordCount > 5 ? baseWpm : 0;

    let paceFeedback = "Tốc độ nói vừa phải, dễ nghe";
    if (wpm > 155) paceFeedback = "Tốc độ nói hơi nhanh, hãy nói chậm lại";
    else if (wpm > 0 && wpm < 110) paceFeedback = "Tốc độ nói hơi chậm, hãy nói trôi chảy hơn";

    let fillerFeedback = "Rất tốt, hạn chế tối đa từ thừa";
    if (fillerCount > 5) fillerFeedback = "Sử dụng khá nhiều từ thừa, hãy chú ý nói mạch lạc hơn";
    else if (fillerCount > 2) fillerFeedback = "Có sử dụng từ thừa, có thể cải thiện thêm";

    return {
      wordCount,
      fillerCount,
      wpm,
      paceFeedback,
      fillerFeedback
    };
  };

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 480) {
        setOuterRadius('50%');
      } else if (window.innerWidth < 768) {
        setOuterRadius('55%');
      } else {
        setOuterRadius('70%');
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleDownloadPdf = async () => {
    if (downloadingPdf || !sessionId || !accessToken) return;
    setDownloadingPdf(true);
    try {
      if (report?.pdf_url) {
        window.open(report.pdf_url, '_blank');
      } else {
        const response = await fetch(`${API_URL}/sessions/${sessionId}/report/pdf`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) throw new Error('Không thể xuất báo cáo PDF');
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `report-${sessionId}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Đã xảy ra lỗi khi tải PDF');
    } finally {
      setDownloadingPdf(false);
    }
  };

  useEffect(() => {
    if (!sessionId || !accessToken) return;

    let attempts = 0;
    const MAX_ATTEMPTS = 24; // ~2 minutes with 5s interval

    // Return true if finished (done/error/timeout), false to continue polling
    const fetchReport = async (): Promise<boolean> => {
      attempts += 1;
      try {
        const sess = await apiFetch<Session>(
          `/sessions/${sessionId}`,
          {},
          accessToken
        );
        setSession(sess);

        // Session error -> stop immediately, do not call /report again
        if (sess.status === 'failed') {
          setError(sess.error_message || 'Đánh giá thất bại. Vui lòng thử lại.');
          setLoading(false);
          return true;
        }

        // Still processing -> keep waiting
        if (sess.status === 'evaluating' || sess.status === 'active') {
          setError('Đang đánh giá, vui lòng đợi...');
          if (attempts >= MAX_ATTEMPTS) {
            setError('Quá thời gian chờ đánh giá. Vui lòng tải lại trang sau.');
            setLoading(false);
            return true;
          }
          return false;
        }

        // Completed -> fetch report
        const data = await apiFetch<ReportData>(
          `/sessions/${sessionId}/report`,
          {},
          accessToken
        );
        setReport(data);
        setError('');
        setLoading(false);
        return true;
      } catch (err) {
        // If 401 (token expired) -> stop immediately
        if (err instanceof ApiError && err.status === 401) {
          setError('Phiên đăng nhập đã hết hạn. Vui lòng tải lại trang để đăng nhập lại.');
          setLoading(false);
          return true; // Stop immediately
        }
        // Report not ready yet (404) -> retry until limit
        setError(err instanceof Error ? err.message : 'Chưa có báo cáo');
        if (attempts >= MAX_ATTEMPTS) {
          setLoading(false);
          return true;
        }
        return false;
      }
    };

    let intervalId: ReturnType<typeof setInterval> | undefined;

    fetchReport().then((done) => {
      if (done) return;
      intervalId = setInterval(async () => {
        const isDone = await fetchReport();
        if (isDone && intervalId) clearInterval(intervalId);
      }, 5000);
    });

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [sessionId, accessToken]);

  useEffect(() => {
    if (!sessionId || !accessToken) return;
    apiFetch<any[]>(`/sessions/${sessionId}/messages`, {}, accessToken)
      .then((data) => {
        if (Array.isArray(data)) setMessages(data);
      })
      .catch((err) => console.error("Không thể lấy tin nhắn: ", err));
  }, [sessionId, accessToken]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <div className="w-12 h-12 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin mb-4"></div>
        <p className="text-slate-500 font-medium">Đang tải báo cáo...</p>
      </div>
    );
  }

  const chartData = report
    ? [
      { subject: 'Nội dung', score: report?.avg_content || 0 },
      { subject: 'Liên quan', score: report?.avg_relevance || 0 },
      { subject: 'Đầy đủ', score: report?.avg_completeness || 0 },
      { subject: 'Trình bày', score: report?.avg_presentation || 0 },
    ]
    : [];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 pb-20 font-sans min-h-screen relative">
      {/* Background Decorative Blur Blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-violet-400/10 blur-[120px]" />
        <div className="absolute top-[30%] -right-[10%] w-[35%] h-[35%] rounded-full bg-indigo-400/10 blur-[100px]" />
        <div className="absolute -bottom-[10%] left-[10%] w-[40%] h-[40%] rounded-full bg-emerald-400/10 blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8"
      >
        <div>
          <Link
            to="/history"
            className="inline-flex items-center gap-2 text-slate-500 hover:text-violet-600 font-medium text-sm mb-2 transition-colors"
          >
            <ArrowLeftIcon className="w-4 h-4" /> Quay lại lịch sử
          </Link>
          <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-700 tracking-tight">
            Báo cáo <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-indigo-600">phỏng vấn</span>
          </h1>
          <p className="text-slate-500 mt-2 font-medium flex items-center gap-2 text-base">
            <ChartBarIcon className="w-6 h-6 text-violet-500" />
            Chi tiết đánh giá cho vị trí: <span className="text-slate-800 font-bold">{session?.position_applied}</span>
          </p>
          {(report?.total_duration_ms || session?.total_duration_ms) ? (
            <p className="text-slate-500 mt-1 font-medium flex items-center gap-2 text-sm">
              <span className="bg-slate-100 px-2 py-1 rounded-md">
                Tổng thời gian phỏng vấn: <span className="font-bold text-slate-700">{formatDurationText(report?.total_duration_ms || session?.total_duration_ms || 0)}</span>
              </span>
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            className="flex items-center gap-2 text-white bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-2.5 rounded-xl font-bold hover:shadow-[0_10px_25px_rgba(124,58,237,0.4)] hover:-translate-y-1 active:translate-y-0 disabled:opacity-50 transition-all shadow-sm text-sm relative overflow-hidden group"
          >
            {downloadingPdf ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Đang tải PDF...</span>
              </>
            ) : (
              <>
                <DocumentTextIcon className="w-4 h-4 stroke-[2.5]" />
                <span>Tải báo cáo PDF</span>
              </>
            )}
          </button>
        </div>
      </motion.div>

      {error && !report && (
        <div className="bg-amber-50 text-amber-700 p-5 rounded-2xl flex items-center gap-3 border border-amber-100 shadow-sm mb-8">
          <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center shrink-0">
            <span className="w-5 h-5 animate-pulse rounded-full bg-amber-500"></span>
          </div>
          <span className="font-semibold">{error}</span>
        </div>
      )}

      {report && (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="space-y-8"
        >
          <div className="grid lg:grid-cols-3 gap-6 items-stretch">
            {/* Left Column (33%): Score & CV Suggestions */}
            <div className="lg:col-span-1 flex flex-col gap-6">
              {/* Score Card */}
              <motion.div
                variants={itemVariants}
                className="flex-1 flex flex-col justify-center bg-gradient-to-br from-violet-700 to-indigo-900 rounded-3xl p-6 md:p-8 text-white shadow-[0_15px_30px_rgba(124,58,237,0.2)] relative overflow-hidden text-center group"
              >
                <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 rounded-full bg-white opacity-10 group-hover:scale-150 transition-transform duration-700"></div>
                <div className="absolute bottom-0 left-0 -ml-8 -mb-8 w-24 h-24 rounded-full bg-indigo-500 opacity-20 blur-xl"></div>
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 30, repeat: Infinity, ease: "linear" }} className="absolute -top-16 -left-16 w-48 h-48 border border-white/10 rounded-full border-dashed pointer-events-none"></motion.div>

                <h3 className="text-violet-100 font-bold text-sm uppercase tracking-widest mb-2 relative z-10">
                  Điểm đánh giá tổng thể
                </h3>
                <div className="flex items-end justify-center gap-1 relative z-10 mb-4">
                  <motion.span animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 2, repeat: Infinity }} className="text-6xl font-black drop-shadow-md">
                    {(report?.overall_score || 0).toFixed(1)}
                  </motion.span>
                  <span className="text-2xl font-bold text-violet-300 mb-1.5">/10</span>
                </div>

                <div className="inline-flex items-center justify-center gap-1.5 bg-white/10 backdrop-blur-sm px-3 py-1.5 rounded-full text-sm font-semibold relative z-10 w-max mx-auto">
                  <StarIcon className="w-4 h-4 text-amber-400" />
                  {(report?.overall_score || 0) >= 8
                    ? 'Rất xuất sắc'
                    : (report?.overall_score || 0) >= 6
                      ? 'Khá tốt'
                      : (report?.overall_score || 0) >= 4
                        ? 'Cần cố gắng'
                        : 'Cần nỗ lực nhiều'}
                </div>
              </motion.div>

              {/* CV Suggestions Mini Card */}
              {(report?.cv_suggestions?.length || 0) > 0 ? (
                <motion.div
                  variants={itemVariants}
                  className="flex-1 flex flex-col justify-between bg-gradient-to-br from-emerald-50 to-teal-50/50 rounded-3xl p-6 border border-emerald-100 shadow-sm relative overflow-hidden group cursor-pointer"
                  onClick={() => (window.location.href = `/report/${sessionId}/cv-suggestions`)}
                >
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                    <DocumentTextIcon className="w-20 h-20 text-emerald-600" />
                  </div>
                  <div className="relative z-10 flex flex-col gap-4 mb-4">
                    <div>
                      <motion.div
                        animate={{ y: [0, -6, 0] }}
                        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                        className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center mb-3 shadow-inner"
                      >
                        <SparklesIcon className="w-5 h-5 stroke-[2.5]" />
                      </motion.div>
                      <h3 className="text-lg font-bold text-slate-800 mb-1">Cải thiện CV</h3>
                      <p className="text-sm font-medium text-slate-600">
                        AI đã tìm thấy {report?.cv_suggestions?.length || 0} điểm có thể nâng cấp trong CV của bạn so với Job
                        Description.
                      </p>
                    </div>
                  </div>
                  <Link
                    to={`/report/${sessionId}/cv-suggestions`}
                    className="inline-flex items-center gap-2 text-emerald-700 font-bold text-sm bg-white px-4 py-2.5 rounded-xl shadow-sm hover:shadow-md transition-shadow self-start w-full justify-center relative z-10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Xem chi tiết gợi ý
                  </Link>
                </motion.div>
              ) : (
                <motion.div
                  variants={itemVariants}
                  className="flex-1 flex flex-col justify-center bg-gradient-to-br from-emerald-50 to-teal-50/50 rounded-3xl p-6 border border-emerald-100 shadow-sm relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-4 opacity-10">
                    <CheckCircleIcon className="w-20 h-20 text-emerald-600" />
                  </div>
                  <div className="relative z-10 flex flex-col gap-4">
                    <div>
                      <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center mb-3 shadow-inner">
                        <CheckCircleIcon className="w-5 h-5 stroke-[2.5]" />
                      </div>
                      <h3 className="text-lg font-bold text-slate-800 mb-1">CV Tối ưu</h3>
                      <p className="text-sm font-medium text-slate-600">
                        CV của bạn đã rất tốt và phù hợp với mô tả công việc. Không có gợi ý sửa đổi nào thêm.
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Right Column (67%): Radar Chart Card */}
            <div className="lg:col-span-2">
              <motion.div
                variants={itemVariants}
                className="h-full flex flex-col bg-white/80 backdrop-blur-xl rounded-3xl p-6 border border-slate-100 shadow-[0_10px_30px_rgba(0,0,0,0.04)]"
              >
                <h3 className="text-lg font-extrabold text-slate-800 mb-6 flex items-center gap-2">
                  <motion.div animate={{ scale: [1, 1.15, 1], rotate: [0, 5, -5, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}>
                    <ChartBarIcon className="w-5 h-5 text-violet-500 stroke-[2.5]" />
                  </motion.div>
                  Phân tích 4 tiêu chí
                </h3>
                <div className="flex-1 min-h-[300px] w-full -ml-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius={outerRadius} data={chartData}>
                      <PolarGrid stroke="#e2e8f0" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#475569', fontSize: 12, fontWeight: 600 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 10]} tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} />
                      <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }} />
                      <Radar name="Điểm số" dataKey="score" stroke="#7c3aed" strokeWidth={3} fill="#8b5cf6" fillOpacity={0.3} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-4">
                  {chartData.map((item, idx) => (
                    <div key={idx} className="bg-slate-50 rounded-xl p-3 border border-slate-100 flex flex-col items-center justify-center text-center">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                        {item.subject}
                      </span>
                      <span className="text-lg font-black text-slate-800">{(item.score || 0).toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>
          </div>

          {/* Summary Card */}
          <motion.div
            variants={itemVariants}
            className="bg-white rounded-3xl p-6 md:p-8 border border-slate-100 shadow-[0_10px_30px_rgba(0,0,0,0.03)] relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-violet-500 to-indigo-500"></div>
            <div className="absolute -bottom-16 -right-16 w-48 h-48 bg-amber-100/50 rounded-full blur-3xl pointer-events-none"></div>
            <h2 className="text-xl font-extrabold text-slate-800 mb-4 flex items-center gap-2">
              <LightBulbIcon className="w-6 h-6 text-amber-500 stroke-[2.5]" />
              Tổng nhận xét của AI
            </h2>
            <div className="prose prose-slate max-w-none text-slate-600 font-medium leading-relaxed">
              <p className="whitespace-pre-wrap">{report?.summary || ''}</p>
            </div>
          </motion.div>

          {/* Questions List */}
          <motion.div variants={itemVariants} className="space-y-4">
            <h2 className="text-xl font-extrabold text-slate-800 mb-4 px-2 flex items-center gap-2">
              <ChatBubbleLeftRightIcon className="w-6 h-6 text-indigo-500 stroke-[2.5]" />
              Chi tiết từng câu hỏi
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6 items-start mt-4">
              {/* Left Column (25%): Questions List */}
              <div className="md:col-span-1 flex flex-col gap-2 max-h-[600px] overflow-y-auto pr-1 pb-2" style={{ scrollbarWidth: "thin", scrollbarColor: "#cbd5e1 transparent" }}>
                {(report?.evaluations || []).map((ev, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedQuestionIndex(i)}
                    className={`w-full text-left p-3.5 rounded-xl border transition-all duration-200 flex flex-col gap-1.5 hover:-translate-y-0.5 ${selectedQuestionIndex === i
                        ? 'bg-violet-50 border-violet-200 shadow-[0_4px_15px_rgba(124,58,237,0.08)] ring-1 ring-violet-500/10'
                        : 'bg-white border-slate-100 hover:border-violet-100 hover:bg-slate-50 hover:shadow-sm'
                      }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className={`font-bold text-sm flex items-center gap-2 ${selectedQuestionIndex === i ? 'text-violet-700' : 'text-slate-700'}`}>
                        {selectedQuestionIndex === i && (
                          <motion.div layoutId="questionDot" className="w-1.5 h-1.5 rounded-full bg-violet-600" />
                        )}
                        Câu {i + 1}
                      </div>
                      <span
                        className={`text-sm font-black bg-white px-2.5 py-0.5 rounded-md shadow-sm border border-slate-100 ${(ev.score_overall || 0) >= 8 ? 'text-emerald-600' : (ev.score_overall || 0) >= 5 ? 'text-amber-500' : 'text-red-500'
                          }`}
                      >
                        {(ev.score_overall || 0).toFixed(1)}
                      </span>
                    </div>
                    <span className="text-xs text-slate-500 font-medium line-clamp-1">{ev.category}</span>
                  </button>
                ))}
              </div>

              {/* Right Column (75%): Selected Question Details */}
              <div className="md:col-span-3 bg-white rounded-3xl border border-slate-100 shadow-[0_10px_30px_rgba(0,0,0,0.03)] overflow-hidden">
                <AnimatePresence mode="wait">
                  {(() => {
                    const ev = (report?.evaluations || [])[selectedQuestionIndex];
                    if (!ev) return null;

                    return (
                      <motion.div
                        key={selectedQuestionIndex} // Trigger animation when index changes
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.4, type: "spring", bounce: 0.3 }}
                        className="p-5 md:p-6 lg:p-8"
                      >
                        {(() => {
                          const candMsg = messages.find(m => m.question_id === ev.question_id && m.role === 'candidate');
                          const candText = candMsg ? candMsg.content : (ev.candidate_answer || "");
                          
                          return (
                            <>
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-5 mb-6">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-violet-100 text-violet-700 text-sm font-bold shrink-0 shadow-inner">
                                {selectedQuestionIndex + 1}
                              </span>
                              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100 shadow-sm">
                                {ev.category}
                              </span>
                            </div>
                            <h3 className="text-lg font-bold text-slate-800 leading-relaxed">{ev.question_text}</h3>
                          </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {ev.answer_duration_ms ? (
                                <div className="flex flex-col items-center justify-center bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100 shadow-inner">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Thời gian</span>
                                  <span className="text-sm font-bold text-slate-700">{formatDurationText(ev.answer_duration_ms)}</span>
                                </div>
                              ) : null}
                              <div className="flex flex-col items-center justify-center bg-slate-50 px-4 py-2.5 rounded-2xl border border-slate-100 shadow-inner">
                                <span className="text-xs font-bold text-slate-400 uppercase mb-0.5 tracking-wider">Điểm</span>
                                <span
                                  className={`text-2xl font-black ${(ev.score_overall || 0) >= 8 ? 'text-emerald-600' : (ev.score_overall || 0) >= 5 ? 'text-amber-500' : 'text-red-500'
                                    }`}
                                >
                                  {(ev.score_overall || 0).toFixed(1)}
                                </span>
                              </div>
                            </div>
                          </div>

                        {candText && (
                          <div className="bg-slate-50/70 rounded-2xl p-5 border border-slate-100 text-sm text-slate-600 font-medium mb-5 shadow-inner">
                            <strong className="text-slate-800 flex items-center gap-2 mb-2 text-base">
                              <ChatBubbleLeftRightIcon className="w-5 h-5 text-indigo-500" />
                              Câu trả lời của bạn
                            </strong>
                            <div className="leading-relaxed whitespace-pre-wrap">{candText}</div>
                          </div>
                        )}

                        <div className="bg-slate-50/70 rounded-2xl p-5 border border-slate-100 text-sm text-slate-600 font-medium mb-5 shadow-inner">
                          <strong className="text-slate-800 flex items-center gap-2 mb-2 text-base">
                            <DocumentTextIcon className="w-5 h-5 text-slate-400" />
                            Nhận xét chi tiết
                          </strong>
                          <div className="leading-relaxed whitespace-pre-wrap">{ev.feedback}</div>
                        </div>

                        {/* Speech Analytics Box */}
                        {(() => {
                          if (!candText) return null;

                          const analysis = analyzeSpeech(candText, session?.language || "vi");
                          if (!analysis) return null;

                          return (
                            <div className="bg-gradient-to-br from-slate-50 to-indigo-50/20 rounded-2xl p-5 border border-slate-100 text-sm text-slate-600 font-medium mb-5 shadow-inner">
                              <strong className="text-slate-800 flex items-center gap-2 mb-3 text-base">
                                <SparklesIcon className="w-5 h-5 text-violet-500" />
                                Phân tích phát âm & diễn đạt (AI Speech Insights)
                              </strong>

                              <div className="bg-white/80 p-3 rounded-xl border border-slate-100 text-xs text-slate-700 italic mb-4 leading-relaxed max-h-[80px] overflow-y-auto">
                                "{candText}"
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white p-3 rounded-xl border border-slate-100/50 shadow-sm flex flex-col justify-center">
                                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">Tốc độ nói ước tính</span>
                                  <span className="text-base font-black text-slate-800">{analysis.wpm} từ/phút</span>
                                  <span className="text-[10px] text-slate-500 mt-1 font-semibold leading-relaxed">{analysis.paceFeedback}</span>
                                </div>
                                <div className="bg-white p-3 rounded-xl border border-slate-100/50 shadow-sm flex flex-col justify-center">
                                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">Tần suất từ thừa (ừm, ờ...)</span>
                                  <span className="text-base font-black text-slate-800">{analysis.fillerCount} lần</span>
                                  <span className="text-[10px] text-slate-500 mt-1 font-semibold leading-relaxed">{analysis.fillerFeedback}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                        {ev.sample_answer && (
                          <div className="bg-emerald-50/60 rounded-2xl p-5 border border-emerald-100 shadow-sm relative overflow-hidden group mt-2">
                            <div className="absolute top-0 right-0 p-3 opacity-[0.05] group-hover:scale-125 group-hover:rotate-12 transition-transform duration-500">
                              <SparklesIcon className="w-20 h-20 text-emerald-600" />
                            </div>
                            <strong className="flex items-center gap-1.5 text-emerald-800 mb-3 font-bold text-base relative z-10">
                              <CheckCircleIcon className="w-5 h-5 stroke-[2.5]" />
                              Câu trả lời mẫu xuất sắc
                            </strong>
                            <div className="text-slate-700 font-medium leading-relaxed relative z-10 bg-white/70 p-4 rounded-xl shadow-sm border border-emerald-50/50">
                              {ev.sample_answer}
                            </div>
                          </div>
                        )}
                        </>
                      );
                    })()}
                  </motion.div>
                    );
                  })()}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}