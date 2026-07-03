import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  SparklesIcon,
  ArrowLeftIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  PrinterIcon,
  DocumentMagnifyingGlassIcon,
  ChevronRightIcon,
  ChartBarIcon,
  DocumentTextIcon,
  InformationCircleIcon,
  ChevronLeftIcon
} from '@heroicons/react/24/outline';
import { CheckBadgeIcon } from '@heroicons/react/24/solid';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../lib/api';

export interface Suggestion {
  original: string;
  improved: string;
  explanation: string;
  severity: 'high' | 'medium' | 'low';
}

interface ReportData {
  overall_score?: number;
  summary?: string;
  annotated_cv_markdown?: string;
}

interface SessionResponse {
  id: string;
  cv_url?: string;
}

interface CandidateProfileData {
  jd_gap_analysis?: {
    matched_skills?: string[];
    missing_keywords?: string[];
    weak_areas?: string[];
  };
}

export default function CVSuggestionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { accessToken } = useAuth();


  const [report, setReport] = useState<ReportData | null>(null);
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [profile, setProfile] = useState<CandidateProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [rawText, setRawText] = useState<string>("");
  const [viewMode, setViewMode] = useState<"file" | "text">("text");

  useEffect(() => {
    if (!sessionId || !accessToken) return;

    const fetchData = async () => {
      try {
        const [reportData, sessionData, profileData, rawTextData] = await Promise.all([
          apiFetch<ReportData>(`/sessions/${sessionId}/report`, {}, accessToken).catch((err) => { console.error("Fetch report failed:", err); return null; }),
          apiFetch<SessionResponse>(`/sessions/${sessionId}`, {}, accessToken).catch((err) => { console.error("Fetch session failed:", err); return null; }),
          apiFetch<CandidateProfileData>(`/sessions/${sessionId}/candidate-profile`, {}, accessToken).catch((err) => { console.error("Fetch profile failed:", err); return null; }),
          apiFetch<{ raw_text: string }>(`/sessions/${sessionId}/cv/original/text`, {}, accessToken).catch((err) => { console.error("Fetch original text failed:", err); return null; })
        ]);
        console.log("fetchData response - rawTextData:", rawTextData);
        if (sessionData) {
          setSession(sessionData);
        }
        if (profileData) {
          setProfile(profileData);
        }
        if (rawTextData) {
          setRawText(rawTextData.raw_text);
        }
        if (reportData) {
          setReport(reportData);
          try {
            const parsedSuggestions = JSON.parse(reportData.annotated_cv_markdown || '[]');
            setSuggestions(Array.isArray(parsedSuggestions) ? parsedSuggestions : []);
          } catch {
            setSuggestions([]);
          }
        }
      } catch (err) {
        console.error('Failed to load CV data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [sessionId, accessToken]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        <div className="flex flex-col items-center">
          <div className="relative w-24 h-24 flex items-center justify-center">
            <div className="absolute inset-0 border-4 border-indigo-100 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
            <SparklesIcon className="w-8 h-8 text-indigo-600 animate-pulse" />
          </div>
          <p className="mt-6 text-indigo-900/70 font-semibold tracking-wide animate-pulse">Đang phân tích chi tiết CV...</p>
        </div>
      </div>
    );
  }

  const gapAnalysis = profile?.jd_gap_analysis || {};
  const matchedSkills = gapAnalysis.matched_skills || [];
  const missingKeywords = gapAnalysis.missing_keywords || [];

  const totalATSKeywords = matchedSkills.length + missingKeywords.length;
  let atsScore = 0;
  if (totalATSKeywords > 0) {
    atsScore = Math.round((matchedSkills.length / totalATSKeywords) * 100);
  }

  const getScoreColor = (score: number) => {
    if (score >= 8) return 'text-emerald-500 stroke-emerald-500 bg-emerald-50 border-emerald-100';
    if (score >= 5) return 'text-blue-500 stroke-blue-500 bg-blue-50 border-blue-100';
    return 'text-rose-500 stroke-rose-500 bg-rose-50 border-rose-100';
  };

  const scoreClass = getScoreColor(report?.overall_score || 0);
  const scoreNumber = report?.overall_score || 0;

  const highSeverityCount = suggestions.filter(s => s.severity === 'high').length;
  const mediumSeverityCount = suggestions.filter(s => s.severity === 'medium').length;
  const lowSeverityCount = suggestions.filter(s => s.severity === 'low').length;

  const originalCvUrl = session?.cv_url
    ? `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/sessions/${sessionId}/cv/original/pdf?token=${accessToken}`
    : null;

  return (
    <div className="min-h-screen bg-slate-50/50 pb-20 font-sans selection:bg-indigo-200 selection:text-indigo-900">

      {/* Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-100 shadow-sm print:hidden">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center gap-6">
              <Link to="/dashboard" className="group flex items-center justify-center w-11 h-11 rounded-full bg-white shadow-sm border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 transition-all duration-300">
                <ArrowLeftIcon className="w-5 h-5 text-slate-500 group-hover:text-indigo-600 group-hover:-translate-x-0.5 transition-transform" />
              </Link>
              <div>
                <h1 className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600 flex items-center gap-3">
                  <SparklesIcon className="w-7 h-7 text-indigo-500" />
                  Báo cáo Tối ưu CV
                </h1>
                <p className="text-sm text-slate-500 font-medium mt-1">Đánh giá chuyên sâu và đề xuất cải thiện từ AI</p>
              </div>
            </div>
            <div>
              <button
                onClick={handlePrint}
                className="group relative inline-flex items-center gap-2.5 px-6 py-2.5 bg-white border border-slate-200 hover:border-indigo-600 text-slate-700 hover:text-indigo-600 rounded-xl font-semibold transition-all duration-300 shadow-sm hover:shadow-md overflow-hidden"
              >
                <div className="absolute inset-0 bg-indigo-50 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <PrinterIcon className="w-5 h-5 relative z-10" />
                <span className="relative z-10">Xuất PDF</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 flex flex-col gap-6">

        {/* Top Stats Overview - Bento Grid */}
        <div className="w-full shrink-0 grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-4 xl:gap-6">

          {/* Score Card (Span 1) */}
          <div className="bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 p-6 flex flex-col items-center justify-center relative overflow-hidden group hover:border-indigo-100 transition-all duration-300">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl -mr-10 -mt-10 transition-transform group-hover:scale-110"></div>
            <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-1.5 w-full justify-center">
              <CheckBadgeIcon className="w-5 h-5 text-indigo-500" />
              Điểm Đánh Giá
            </h3>
            <div className="relative">
              <svg className="w-28 h-28 transform -rotate-90">
                <circle cx="56" cy="56" r="46" className="stroke-slate-100" strokeWidth="8" fill="none" />
                <circle
                  cx="56" cy="56" r="46"
                  className={`transition-all duration-1000 ease-out ${scoreClass.split(' ')[1]}`}
                  strokeWidth="8" fill="none"
                  strokeDasharray="289.0"
                  strokeDashoffset={289.0 - (289.0 * scoreNumber) / 10}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-4xl font-black ${scoreClass.split(' ')[0]}`}>{scoreNumber}</span>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">/ 10</span>
              </div>
            </div>
          </div>

          {/* ATS Match Card (Span 1) */}
          <div className="bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 p-6 flex flex-col justify-center relative overflow-hidden group hover:border-purple-100 transition-all duration-300">
            <div className="absolute bottom-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl -mr-10 -mb-10 transition-transform group-hover:scale-110"></div>
            <h3 className="text-sm font-bold text-slate-700 mb-6 flex items-center gap-1.5">
              <ChartBarIcon className="w-5 h-5 text-purple-500" />
              Độ Khớp ATS
            </h3>
            <div className="flex flex-col gap-3 z-10">
              <div className="flex justify-between items-end">
                <span className="text-5xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-br from-slate-700 to-slate-900">
                  {atsScore}<span className="text-2xl font-bold">%</span>
                </span>
              </div>
              <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/50 shadow-inner">
                <div
                  className={`h-full rounded-full transition-all duration-1500 relative overflow-hidden ${atsScore >= 70 ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' :
                      atsScore >= 40 ? 'bg-gradient-to-r from-blue-400 to-blue-500' :
                        'bg-gradient-to-r from-rose-400 to-rose-500'
                    }`}
                  style={{ width: `${atsScore}%` }}
                >
                  <div className="absolute inset-0 bg-white/20 w-full" style={{ backgroundImage: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)' }}></div>
                </div>
              </div>
              <span className="text-xs font-semibold text-slate-400 flex items-center gap-1 mt-1">
                Dựa trên từ khóa JD <ChevronRightIcon className="w-3 h-3" />
              </span>
            </div>
          </div>

          {/* Summary Card (Span 2) */}
          <div className="md:col-span-1 xl:col-span-2 bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 transition-all duration-300">
            <div className="w-full h-full p-6 flex flex-col relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl"></div>
              <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-1.5 relative z-10">
                <SparklesIcon className="w-5 h-5 text-indigo-500" />
                Nhận Xét & Đánh Giá Tổng Quan
              </h3>
              <div className="flex-1 overflow-y-auto max-h-48 pr-3 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-slate-100/50 [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-slate-400 relative z-10">
                <p className="text-[15px] text-slate-700 leading-relaxed font-medium whitespace-pre-wrap">
                  {report?.summary || 'AI đang phân tích và đưa ra nhận xét tổng quan về CV của bạn...'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Split - 2 Columns */}
        <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">

          {/* Left Panel - CV Preview */}
          <div className="lg:w-1/2 w-full h-full flex flex-col print:hidden min-h-[600px] lg:min-h-[800px]">
            <div className="flex-1 bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 flex flex-col overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-50 flex items-center justify-between shrink-0">
                <h3 className="text-xl font-black text-slate-800 flex items-center gap-3">
                  <div className="p-2 bg-indigo-100 rounded-xl">
                    <DocumentTextIcon className="w-6 h-6 text-indigo-600" />
                  </div>
                  CV gốc
                </h3>
                <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-semibold shadow-sm shrink-0">
                  <button
                    onClick={() => setViewMode("text")}
                    className={`px-3 py-1 rounded-md transition-all ${viewMode === "text" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                  >
                    Văn bản
                  </button>
                  <button
                    onClick={() => setViewMode("file")}
                    className={`px-3 py-1 rounded-md transition-all ${viewMode === "file" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                  >
                    File gốc PDF/Word
                  </button>
                </div>
              </div>
              <div className="flex-1 p-2 md:p-3 relative group min-h-[400px]">
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="relative h-full w-full bg-slate-50 rounded-2xl shadow-inner border border-slate-200 overflow-hidden">
                {viewMode === "text" ? (
                  <div className="absolute inset-0 p-4 md:p-6 overflow-y-auto bg-slate-50 text-slate-700 select-text">
                    <div className="max-w-2xl mx-auto bg-white p-6 md:p-8 border border-slate-200/80 shadow-[0_4px_15px_rgba(0,0,0,0.03)] min-h-full rounded-2xl whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-800 tracking-wide">
                      {rawText || "Không tìm thấy nội dung văn bản trích xuất từ CV."}
                    </div>
                  </div>
                ) : originalCvUrl ? (
                  <>
                    <iframe
                      src={originalCvUrl}
                      className="w-full h-full border-0 absolute inset-0 bg-slate-100 z-0"
                      title="Original CV"
                    />
                    <div className="absolute top-4 right-4 z-10">
                      <a
                        href={originalCvUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-white/90 backdrop-blur-sm border border-slate-200 text-sm font-semibold text-indigo-600 rounded-xl shadow-sm hover:bg-indigo-50 transition-colors flex items-center gap-2"
                      >
                        <DocumentTextIcon className="w-4 h-4" />
                        Tải file gốc
                      </a>
                    </div>
                  </>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 italic p-6 text-center">
                    <DocumentMagnifyingGlassIcon className="w-16 h-16 text-slate-300 mb-4" />
                    <p className="text-lg font-medium text-slate-500">Không thể tải file PDF</p>
                    <p className="text-sm mt-2">Vui lòng kiểm tra lại đường dẫn hoặc định dạng file.</p>
                  </div>
                )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel - Suggestions */}
          <div className="lg:w-1/2 w-full h-full flex flex-col min-h-[600px] lg:min-h-[800px]">
            <div className="flex-1 bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 flex flex-col overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-50 flex items-center justify-between shrink-0">
                <h3 className="text-xl font-black text-slate-800 flex items-center gap-3">
                  <div className="p-2 bg-indigo-100 rounded-xl">
                    <SparklesIcon className="w-6 h-6 text-indigo-600" />
                  </div>
                  Đề Xuất Cải Thiện
                </h3>
                <div className="flex items-center gap-2">
                  <div className="hidden sm:flex items-center gap-2 mr-2">
                    {highSeverityCount > 0 && (
                      <div className="group relative">
                        <span className="px-2.5 py-1 bg-rose-50 text-rose-700 rounded-lg text-[13px] font-bold border border-rose-100 flex items-center gap-1.5 cursor-help">
                          <ExclamationTriangleIcon className="w-3.5 h-3.5" /> {highSeverityCount}
                        </span>
                        <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max opacity-0 transition-opacity duration-200 group-hover:opacity-100 z-50">
                          <div className="bg-slate-800 text-white text-[11px] font-semibold rounded-md py-1 px-2.5 shadow-lg">
                            Nghiêm trọng
                          </div>
                          <div className="w-1.5 h-1.5 bg-slate-800 rotate-45 absolute -bottom-0.5 left-1/2 -translate-x-1/2"></div>
                        </div>
                      </div>
                    )}
                    {mediumSeverityCount > 0 && (
                      <div className="group relative">
                        <span className="px-2.5 py-1 bg-amber-50 text-amber-700 rounded-lg text-[13px] font-bold border border-amber-100 flex items-center gap-1.5 cursor-help">
                          <SparklesIcon className="w-3.5 h-3.5" /> {mediumSeverityCount}
                        </span>
                        <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max opacity-0 transition-opacity duration-200 group-hover:opacity-100 z-50">
                          <div className="bg-slate-800 text-white text-[11px] font-semibold rounded-md py-1 px-2.5 shadow-lg">
                            Mức độ vừa
                          </div>
                          <div className="w-1.5 h-1.5 bg-slate-800 rotate-45 absolute -bottom-0.5 left-1/2 -translate-x-1/2"></div>
                        </div>
                      </div>
                    )}
                    {lowSeverityCount > 0 && (
                      <div className="group relative">
                        <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg text-[13px] font-bold border border-blue-100 flex items-center gap-1.5 cursor-help">
                          <CheckCircleIcon className="w-3.5 h-3.5" /> {lowSeverityCount}
                        </span>
                        <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max opacity-0 transition-opacity duration-200 group-hover:opacity-100 z-50">
                          <div className="bg-slate-800 text-white text-[11px] font-semibold rounded-md py-1 px-2.5 shadow-lg">
                            Gợi ý nhỏ
                          </div>
                          <div className="w-1.5 h-1.5 bg-slate-800 rotate-45 absolute -bottom-0.5 left-1/2 -translate-x-1/2"></div>
                        </div>
                      </div>
                    )}
                    {(highSeverityCount > 0 || mediumSeverityCount > 0 || lowSeverityCount > 0) && (
                      <div className="w-px h-5 bg-slate-200 mx-1"></div>
                    )}
                  </div>
                  <span className="px-4 py-1.5 bg-indigo-50 text-indigo-700 rounded-xl text-sm font-bold border border-indigo-100 whitespace-nowrap">
                    Tổng: {suggestions.length} đề xuất
                  </span>
                </div>
              </div>

              <div className="p-6 space-y-6 bg-transparent flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-slate-300 transition-colors">
                {/* Banner nhắc nhở rà soát thêm cho CV điểm thấp */}
                {suggestions.length > 0 && scoreNumber < 7.0 && (
                  <div className="flex items-start gap-2.5 text-indigo-700 bg-indigo-50/70 p-3.5 rounded-xl text-[13px] font-medium border border-indigo-100/50">
                    <InformationCircleIcon className="w-5 h-5 shrink-0 text-indigo-500" />
                    <p className="leading-relaxed">
                      <strong>Lưu ý:</strong> Dưới đây chỉ là các lỗi tiêu biểu. Vì CV cần cải thiện nhiều, hãy kết hợp đọc <strong>Nhận Xét Tổng Quan</strong> để tự rà soát và viết lại toàn bộ nhé.
                    </p>
                  </div>
                )}
                {suggestions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center h-full">
                    {scoreNumber >= 7.0 ? (
                      <>
                        <div className="w-24 h-24 bg-emerald-50 rounded-full flex items-center justify-center mb-4">
                          <CheckBadgeIcon className="w-12 h-12 text-emerald-500" />
                        </div>
                        <h4 className="text-lg font-bold text-slate-800 mb-2">CV của bạn rất tuyệt vời!</h4>
                        <p className="text-slate-500 max-w-md">AI không tìm thấy vấn đề nghiêm trọng nào cần sửa đổi. Bạn đã sẵn sàng để ứng tuyển.</p>
                      </>
                    ) : (
                      <>
                        <div className="w-24 h-24 bg-amber-50 rounded-full flex items-center justify-center mb-4">
                          <ExclamationTriangleIcon className="w-12 h-12 text-amber-500" />
                        </div>
                        <h4 className="text-lg font-bold text-slate-800 mb-2">Chưa trích xuất được đề xuất chi tiết</h4>
                        <p className="text-slate-500 max-w-md">Hệ thống chưa thể tự động trích xuất các đoạn văn bản chi tiết cần sửa (có thể do định dạng CV hoặc nội dung cần thay đổi quá lớn). Vui lòng đọc kỹ phần <strong>Nhận Xét & Đánh Giá</strong> ở trên để định hướng lại cách viết CV của bạn.</p>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col h-full relative">
                    {/* Render current slide */}
                    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm transition-all duration-300 flex flex-col mb-4 mx-4 relative z-0 h-[420px] overflow-hidden">
                      {(() => {
                        const s = suggestions[currentSlide];
                        if (!s) return null;
                        return (
                          <>
                            {/* Header with original text */}
                            <div className="p-5 border-b border-slate-100 bg-slate-50/50 shrink-0">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${s.severity === 'high' ? 'bg-red-50 text-red-600 border border-red-100' :
                                      s.severity === 'medium' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                                        'bg-blue-50 text-blue-600 border border-blue-100'
                                    }`}>
                                    Mức độ: {s.severity === 'high' ? 'Nghiêm trọng' : s.severity === 'medium' ? 'Vừa' : 'Nhỏ'}
                                  </span>
                                </div>
                              </div>
                              <div className="max-h-24 overflow-y-auto pr-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-200 hover:[&::-webkit-scrollbar-thumb]:bg-slate-300">
                                <p className="text-[14px] text-slate-500 font-medium line-through decoration-rose-300/70 decoration-2">
                                  "{s.original}"
                                </p>
                              </div>
                            </div>

                            {/* Improved Text */}
                            <div className="p-5 bg-white relative flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-200 hover:[&::-webkit-scrollbar-thumb]:bg-slate-300">
                              <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                                <SparklesIcon className="w-16 h-16 text-emerald-500" />
                              </div>
                              <div className="flex items-center gap-2 mb-2 relative z-10">
                                <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase tracking-wider rounded-lg border border-emerald-200/50 flex items-center gap-1">
                                  <CheckCircleIcon className="w-3 h-3" /> Đề xuất AI
                                </span>
                              </div>
                              <p className="text-[15px] text-emerald-950 font-semibold relative z-10 leading-relaxed">
                                {s.improved}
                              </p>
                            </div>

                            {/* Explanation Footer */}
                            <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 mt-auto shrink-0 flex items-start gap-3">
                              <InformationCircleIcon className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                              <p className="text-[13px] text-slate-600 font-medium leading-relaxed">
                                {s.explanation}
                              </p>
                            </div>
                          </>
                        );
                      })()}
                    </div>

                    {/* Left Navigation Button */}
                    <button
                      onClick={() => setCurrentSlide(prev => Math.max(0, prev - 1))}
                      disabled={currentSlide === 0}
                      className={`absolute -left-3 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full border flex items-center justify-center transition-all ${currentSlide === 0
                          ? 'bg-slate-50 border-slate-100 text-slate-300 opacity-50 cursor-not-allowed'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 shadow-sm hover:shadow hover:scale-110'
                        }`}
                    >
                      <ChevronLeftIcon className="w-4 h-4" />
                    </button>

                    {/* Right Navigation Button */}
                    <button
                      onClick={() => setCurrentSlide(prev => Math.min(suggestions.length - 1, prev + 1))}
                      disabled={currentSlide === suggestions.length - 1}
                      className={`absolute -right-3 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full border flex items-center justify-center transition-all ${currentSlide === suggestions.length - 1
                          ? 'bg-slate-50 border-slate-100 text-slate-300 opacity-50 cursor-not-allowed'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 shadow-sm hover:shadow hover:scale-110'
                        }`}
                    >
                      <ChevronRightIcon className="w-4 h-4" />
                    </button>

                    {/* Pagination Dots (Only) */}
                    <div className="flex flex-col items-center justify-center mt-auto pt-4 gap-2.5">
                      <div className="text-[13px] font-bold text-slate-400 bg-slate-50 px-3 py-1 rounded-full border border-slate-100">
                        Đang xem {currentSlide + 1} / {suggestions.length}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap justify-center px-4">
                        {suggestions.map((_, idx) => (
                          <button
                            key={idx}
                            onClick={() => setCurrentSlide(idx)}
                            className={`h-2 rounded-full transition-all duration-300 ${currentSlide === idx
                                ? 'w-6 bg-indigo-500'
                                : 'w-2 bg-slate-200 hover:bg-slate-300'
                              }`}
                            aria-label={`Go to slide ${idx + 1}`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}

              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}