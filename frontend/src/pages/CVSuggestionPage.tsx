import React, { useEffect, useState } from 'react';
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
  cv_document_id?: string;
  jd_document_id?: string;
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
  const [tabLoading, setTabLoading] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const handleTabSwitch = (mode: "text" | "file") => {
    if (mode === viewMode) return;
    setViewMode(mode);
    if (mode === "text") {
      setTabLoading(true);
      setTimeout(() => setTabLoading(false), 500);
    } else {
      setIframeLoaded(false);
    }
  };

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
          console.log("[DEBUG] sessionData:", sessionData);
          console.log("[DEBUG] cv_document_id:", sessionData.cv_document_id);
          console.log("[DEBUG] cv_url from session:", sessionData.cv_url);
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

  // Use backend proxy endpoint for iframe (no CORS, no X-Frame-Options)
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  const originalCvUrl = session?.cv_document_id
    ? `${apiBase}/sessions/${sessionId}/cv/original/file?token=${encodeURIComponent(accessToken || '')}`
    : null;

  // Extract file extension from cv_url
  const fileExt = (() => {
    const url = session?.cv_url || '';
    const filename = url.split('/').pop()?.split('?')[0] || '';
    return filename.includes('.') ? filename.split('.').pop()?.toLowerCase() : 'pdf';
  })();
  const isPdfFile = fileExt === 'pdf' || fileExt === 'txt';

  // === Highlight logic ===
  type TextSegment = { text: string; severity?: 'high' | 'medium' | 'low'; explanation?: string; suggestionIndex?: number };

  const highlightClasses: Record<'high' | 'medium' | 'low', string> = {
    high:   'bg-rose-100 text-rose-900 rounded-sm border-b-2 border-rose-400 cursor-pointer hover:bg-rose-200 transition-colors',
    medium: 'bg-amber-100 text-amber-900 rounded-sm border-b-2 border-amber-400 cursor-pointer hover:bg-amber-200 transition-colors',
    low:    'bg-blue-100 text-blue-900 rounded-sm border-b-2 border-blue-400 cursor-pointer hover:bg-blue-200 transition-colors',
  };

  const getHighlightedSegments = (text: string, sug: Suggestion[]): TextSegment[] | null => {
    if (!text || !sug.length) return null;

    type Range = { start: number; end: number; severity: 'high' | 'medium' | 'low'; explanation: string; suggestionIndex: number };
    const ranges: Range[] = [];

    // Helper: Find match position - try exact first, fallback to regex for flexible whitespace
    const findMatch = (needle: string): { start: number; end: number } | null => {
      if (!needle || needle.length < 5) return null;

      // Pass 1: Exact match
      const idx = text.indexOf(needle);
      if (idx !== -1) return { start: idx, end: idx + needle.length };

      // Pass 2: Regex allowing any whitespace (\s+) instead of space/newline
      try {
        const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const flexed = escaped.replace(/\s+/g, '\\s+');
        const match = new RegExp(flexed).exec(text);
        if (match) return { start: match.index, end: match.index + match[0].length };
      } catch { /* ignore regex error */ }

      return null;
    };

    for (const s of sug) {
      const found = findMatch(s.original);
      if (found) {
        const suggestionIndex = sug.indexOf(s);
        ranges.push({ ...found, severity: s.severity, explanation: s.explanation, suggestionIndex });
      }
    }
    if (!ranges.length) return null;

    // Sort by position, resolve overlaps (keep first)
    ranges.sort((a, b) => a.start - b.start);
    const resolved: Range[] = [];
    let cur = 0;
    for (const r of ranges) {
      if (r.start >= cur) { resolved.push(r); cur = r.end; }
    }

    const segments: TextSegment[] = [];
    cur = 0;
    for (const r of resolved) {
      if (r.start > cur) segments.push({ text: text.slice(cur, r.start) });
      segments.push({ text: text.slice(r.start, r.end), severity: r.severity, explanation: r.explanation, suggestionIndex: r.suggestionIndex });
      cur = r.end;
    }
    if (cur < text.length) segments.push({ text: text.slice(cur) });
    return segments;
  };

  const textSegments = getHighlightedSegments(rawText, suggestions);

  // === Text formatting: Detect ALL CAPS Vietnamese headers ===
  const isHeaderLine = (line: string): boolean => {
    const t = line.trim();
    if (!t || t.length < 3) return false;
    // No lowercase letters
    return !/[a-záăữâấéêếíóôốơớúưứàảãạằẳẵặầẩẫậèẻẽẹềểễệìỉĩịòỏõọồổỗộờởỡợùủũụừửữựỳỷỹỵđ]/.test(t)
      && /[A-ZÀ-ɏḀ-ỿ]/.test(t);
  };

  const renderLineHighlights = (line: string, lineStartPos: number): React.ReactNode => {
    if (!textSegments) return line;
    // Calculate offset for each segment in rawText
    let pos = 0;
    const lineEnd = lineStartPos + line.length;
    const parts: React.ReactNode[] = [];
    let cur = lineStartPos;

    for (const seg of textSegments) {
      const segStart = pos;
      const segEnd = pos + seg.text.length;
      pos = segEnd;

      if (segEnd <= lineStartPos || segStart >= lineEnd) continue;

      const overlapStart = Math.max(segStart, lineStartPos);
      const overlapEnd = Math.min(segEnd, lineEnd);

      if (overlapStart > cur) {
        parts.push(<span key={`plain-${cur}`}>{line.slice(cur - lineStartPos, overlapStart - lineStartPos)}</span>);
      }
      const sliceText = line.slice(overlapStart - lineStartPos, overlapEnd - lineStartPos);
      if (seg.severity) {
        parts.push(
          <mark
            key={`hl-${overlapStart}`}
            className={highlightClasses[seg.severity]}
            onClick={() => { if (seg.suggestionIndex !== undefined) setCurrentSlide(seg.suggestionIndex); }}
          >{sliceText}</mark>
        );
      } else {
        parts.push(<span key={`plain2-${overlapStart}`}>{sliceText}</span>);
      }
      cur = overlapEnd;
    }
    if (cur < lineEnd) parts.push(<span key={`tail-${cur}`}>{line.slice(cur - lineStartPos)}</span>);
    return parts.length ? parts : line;
  };

  const renderFormattedText = (): React.ReactNode => {
    if (!rawText) return <p className="text-slate-400 italic">Không tìm thấy nội dung văn bản trích xuất từ CV.</p>;
    const lines = rawText.split('\n');
    let charOffset = 0;
    let emptyCount = 0;

    return (
      <div>
        {lines.map((line, i) => {
          const lineStart = charOffset;
          charOffset += line.length + 1; // +1 for \n

          if (!line.trim()) {
            emptyCount++;
            // Keep only 1 empty line, skip consecutive ones
            return emptyCount <= 1 ? <div key={i} className="h-2" /> : null;
          }
          emptyCount = 0;

          if (isHeaderLine(line)) {
            return (
              <div key={i} className="mt-6 mb-3">
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-gradient-to-r from-indigo-200 to-transparent" />
                  <span className="text-[11px] font-black text-indigo-500 uppercase tracking-[0.18em] shrink-0">
                    {line.trim()}
                  </span>
                  <div className="h-px flex-1 bg-gradient-to-l from-indigo-200 to-transparent" />
                </div>
              </div>
            );
          }

          return (
            <div key={i} className="text-[13px] text-slate-700 leading-[1.75] py-[1px]">
              {renderLineHighlights(line, lineStart)}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50/50 pb-20 font-sans selection:bg-indigo-200 selection:text-indigo-900">

      {/* Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-100 shadow-sm print:hidden">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center gap-6">
              <div>
                <h1 className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600 flex items-center gap-3">
                  <SparklesIcon className="w-7 h-7 text-indigo-500" />
                  Báo cáo Tối ưu CV
                </h1>
                <p className="text-sm text-slate-500 font-medium mt-1">Đánh giá chuyên sâu và đề xuất cải thiện từ AI</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 flex flex-col gap-6">

        {/* Top Stats Overview */}
        <div className="flex flex-col lg:flex-row gap-6 shrink-0">

          {/* Left Stats (Score + ATS) - ~35% */}
          <div className="lg:w-[35%] w-full flex flex-col sm:flex-row lg:flex-col xl:flex-row gap-6">
            
            {/* Score Card */}
            <div className="w-full sm:w-1/2 lg:w-full xl:w-1/2 bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 p-6 flex flex-col items-center justify-center relative overflow-hidden group hover:border-indigo-100 transition-all duration-300">
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

            {/* ATS Match Card */}
            <div className="w-full sm:w-1/2 lg:w-full xl:w-1/2 bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 p-6 flex flex-col justify-center relative group hover:border-purple-100 transition-all duration-300">
              <div className="absolute inset-0 rounded-[2rem] overflow-hidden pointer-events-none">
                <div className="absolute bottom-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl -mr-10 -mb-10 transition-transform group-hover:scale-110"></div>
              </div>
              <h3 className="text-sm font-bold text-slate-700 mb-6 flex items-center gap-1.5 relative z-10">
              <ChartBarIcon className="w-5 h-5 text-purple-500" />
              Độ Khớp ATS
            </h3>
            
            {!session?.jd_document_id ? (
              <div className="flex flex-col items-center justify-center h-full text-center z-10 space-y-3 pb-4">
                <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mb-1">
                  <DocumentTextIcon className="w-6 h-6 text-slate-400" />
                </div>
                <p className="text-sm font-medium text-slate-500">
                  Không đánh giá ATS
                </p>
                <p className="text-xs text-slate-400 max-w-[200px]">
                  Bạn chưa tải lên Mô tả công việc (JD) để đối chiếu từ khóa.
                </p>
              </div>
            ) : (
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
              <div className="group/tooltip relative mt-1 z-20">
                <span className="text-xs font-semibold text-slate-400 flex items-center gap-1 cursor-help hover:text-purple-600 transition-colors w-max">
                  Chi tiết từ khóa JD <ChevronRightIcon className="w-3 h-3 transition-transform group-hover/tooltip:rotate-90" />
                </span>
                
                {/* Keyword Popover */}
                <div className="absolute top-full left-0 mt-3 w-72 bg-white rounded-2xl shadow-xl border border-slate-200 p-5 opacity-0 pointer-events-none group-hover/tooltip:opacity-100 group-hover/tooltip:pointer-events-auto transition-all duration-200 z-50 transform origin-top-left group-hover/tooltip:translate-y-0 translate-y-2 max-h-80 overflow-y-auto">
                  <div className="mb-5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-600 mb-2.5 flex items-center gap-1.5">
                      <CheckCircleIcon className="w-4 h-4" /> Đã khớp ({matchedSkills.length})
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {matchedSkills.length > 0 ? matchedSkills.map((k: string, i: number) => (
                        <span key={i} className="px-2 py-1 bg-emerald-50 text-emerald-700 text-[11px] font-semibold rounded-md border border-emerald-100">{k}</span>
                      )) : <span className="text-xs text-slate-400 italic">Không có từ khóa khớp</span>}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-rose-600 mb-2.5 flex items-center gap-1.5">
                      <ExclamationTriangleIcon className="w-4 h-4" /> Còn thiếu ({missingKeywords.length})
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {missingKeywords.length > 0 ? missingKeywords.map((k: string, i: number) => (
                        <span key={i} className="px-2 py-1 bg-rose-50 text-rose-700 text-[11px] font-semibold rounded-md border border-rose-100">{k}</span>
                      )) : <span className="text-xs text-slate-400 italic">Đã đầy đủ từ khóa!</span>}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            )}
          </div>
          </div>

          {/* Summary Card - ~65% */}
          <div className="lg:w-[65%] w-full bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 transition-all duration-300">
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
          <div className="lg:w-[60%] w-full h-full flex flex-col print:hidden min-h-[600px] lg:min-h-[800px]">
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
                    onClick={() => handleTabSwitch("text")}
                    className={`px-3 py-1 rounded-md transition-all ${viewMode === "text" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                  >
                    Văn bản
                  </button>
                  <button
                    onClick={() => handleTabSwitch("file")}
                    className={`px-3 py-1 rounded-md transition-all ${viewMode === "file" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                  >
                    File gốc PDF/Word
                  </button>
                </div>
              </div>
              <div className="flex-1 relative group min-h-[500px]">
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl pointer-events-none"></div>
                {viewMode === "text" ? (
                  /* Text view: absolute inset-0 to avoid h-full chain dependency */
                  <div className="absolute inset-0 p-2 md:p-3">
                    <div className="h-full w-full bg-slate-50 rounded-2xl shadow-inner border border-slate-200 overflow-hidden">
                      <div className="h-full p-4 md:p-6 overflow-y-auto bg-slate-50 text-slate-700 select-text">
                        <div className="max-w-2xl mx-auto bg-white p-6 md:p-8 border border-slate-200/80 shadow-[0_4px_15px_rgba(0,0,0,0.03)] min-h-full rounded-2xl font-sans text-sm leading-relaxed text-slate-800 tracking-wide">
                          {/* Legend bar */}
                          {textSegments && (
                            <div className="flex flex-wrap items-center gap-2 mb-5 pb-4 border-b border-slate-100">
                              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mr-1">Chú thích:</span>
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-rose-100 text-rose-700 rounded border-b-2 border-rose-400 font-semibold">Nghiêm trọng</span>
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded border-b-2 border-amber-400 font-semibold">Trung bình</span>
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded border-b-2 border-blue-400 font-semibold">Nhẹ</span>
                              <span className="text-[11px] text-slate-400 ml-1">(✨ Click vào đoạn highlight để xem đề xuất)</span>
                            </div>
                          )}
                          {/* Formatted + Highlighted text */}
                          <div className="relative min-h-[300px]">
                            {tabLoading ? (
                              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-10">
                                <div className="w-10 h-10 border-4 border-indigo-100 border-t-indigo-500 rounded-full animate-spin mb-4"></div>
                                <p className="text-sm font-medium text-slate-500 animate-pulse">Đang xử lý định dạng...</p>
                              </div>
                            ) : (
                              <div className="animate-fade-in-up">
                                {renderFormattedText()}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : originalCvUrl ? (
                  /* File view: absolute inset-0 with flex-col for correct iframe height */
                  <div className="absolute inset-0 p-2 md:p-3 flex flex-col">
                    <div className="flex-1 bg-white rounded-2xl shadow-inner border border-slate-200 overflow-hidden flex flex-col relative">
                      {isPdfFile ? (
                        <>
                          <iframe
                            src={originalCvUrl}
                            className={`flex-1 w-full border-0 transition-opacity duration-500 relative z-0 ${iframeLoaded ? 'opacity-100' : 'opacity-0'}`}
                            title="Original CV"
                            onLoad={() => setIframeLoaded(true)}
                          />
                          {!iframeLoaded && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50 z-10">
                              <div className="w-10 h-10 border-4 border-indigo-100 border-t-indigo-500 rounded-full animate-spin mb-4"></div>
                              <p className="text-sm font-medium text-slate-500 animate-pulse">Đang tải tài liệu gốc...</p>
                            </div>
                          )}
                        </>
                      ) : (
                        /* DOCX/Word: browser cannot render inline */
                        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-slate-50">
                          <div className="w-20 h-20 bg-indigo-50 rounded-2xl flex items-center justify-center mb-5 shadow-sm">
                            <DocumentTextIcon className="w-10 h-10 text-indigo-400" />
                          </div>
                          <p className="text-base font-bold text-slate-700 mb-1">
                            File {fileExt?.toUpperCase()} không hiển thị được inline
                          </p>
                          <p className="text-sm text-slate-500 mb-5 max-w-xs">
                            Trình duyệt chỉ hiển thị PDF trực tiếp. Bạn có thể xem nội dung ở tab <strong>Văn bản</strong>, hoặc tải file về.
                          </p>
                          <a
                            href={originalCvUrl}
                            download
                            className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white font-semibold rounded-xl shadow-sm hover:bg-indigo-700 transition-colors text-sm"
                          >
                            <DocumentTextIcon className="w-4 h-4" />
                            Tải file {fileExt?.toUpperCase()} về
                          </a>
                        </div>
                      )}
                      {isPdfFile && (
                        <div className="absolute top-3 right-3 z-10">
                          <a
                            href={originalCvUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 bg-white/90 backdrop-blur-sm border border-slate-200 text-xs font-semibold text-indigo-600 rounded-lg shadow-sm hover:bg-indigo-50 transition-colors flex items-center gap-1.5"
                          >
                            <DocumentTextIcon className="w-3.5 h-3.5" />
                            Mở tab mới
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 italic p-6 text-center">
                    <DocumentMagnifyingGlassIcon className="w-16 h-16 text-slate-300 mb-4" />
                    <p className="text-lg font-medium text-slate-500">Không thể tải file PDF</p>
                    <p className="text-sm mt-2">Vui lòng kiểm tra lại đường dẫn hoặc định dạng file.</p>
                  </div>
                )}{/* end viewMode conditional */}
              </div>{/* end flex-1 relative group */}
            </div>{/* end white card */}
          </div>{/* end left panel */}

          {/* Right Panel - Suggestions */}
          <div className="lg:w-[40%] w-full h-full flex flex-col min-h-[600px] lg:min-h-[800px]">
            <div className="flex-1 bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 flex flex-col overflow-hidden">
              <div className="px-5 py-5 border-b border-slate-50 flex flex-wrap items-center justify-between gap-4 shrink-0">
                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2 whitespace-nowrap">
                  <div className="p-1.5 bg-indigo-100 rounded-xl">
                    <SparklesIcon className="w-5 h-5 text-indigo-600" />
                  </div>
                  Đề Xuất Cải Thiện
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    {highSeverityCount > 0 && (
                      <div className="group relative">
                        <span className="px-2 py-1 bg-rose-50 text-rose-700 rounded-lg text-xs font-bold border border-rose-100 flex items-center gap-1 cursor-help">
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
                        <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded-lg text-xs font-bold border border-amber-100 flex items-center gap-1 cursor-help">
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
                        <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold border border-blue-100 flex items-center gap-1 cursor-help">
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
                  </div>
                  {(highSeverityCount > 0 || mediumSeverityCount > 0 || lowSeverityCount > 0) && (
                    <div className="hidden sm:block w-px h-4 bg-slate-200 mx-1"></div>
                  )}
                  <span className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-xl text-xs font-bold border border-indigo-100 whitespace-nowrap">
                    Tổng: {suggestions.length} đề xuất
                  </span>
                </div>
              </div>

              <div className="p-4 sm:p-5 space-y-4 bg-transparent flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-slate-300 transition-colors">
                {/* Low score reminder banner */}
                {suggestions.length > 0 && scoreNumber < 7.0 && (
                  <div className="flex items-start gap-2 text-indigo-700 bg-indigo-50/70 p-2.5 px-3.5 rounded-lg text-xs font-medium border border-indigo-100/50">
                    <InformationCircleIcon className="w-4 h-4 shrink-0 text-indigo-500 mt-0.5" />
                    <p className="leading-snug">
                      <strong>Lưu ý:</strong> Dưới đây chỉ là các lỗi tiêu biểu. Vì CV cần cải thiện nhiều, hãy kết hợp đọc <strong>Nhận Xét Tổng Quan</strong> để tự rà soát và viết lại nhé.
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
                    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm transition-all duration-300 flex flex-col mb-4 mx-4 relative z-0 flex-1 min-h-[350px] overflow-hidden">
                      {(() => {
                        const s = suggestions[currentSlide];
                        if (!s) return null;
                        return (
                          <>
                            {/* Header with original text */}
                            <div className="p-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
                              <div className="flex items-center justify-between mb-2.5">
                                <div className="flex items-center gap-2">
                                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${s.severity === 'high' ? 'bg-red-50 text-red-600 border border-red-100' :
                                      s.severity === 'medium' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                                        'bg-blue-50 text-blue-600 border border-blue-100'
                                    }`}>
                                    Mức độ: {s.severity === 'high' ? 'Nghiêm trọng' : s.severity === 'medium' ? 'Vừa' : 'Nhỏ'}
                                  </span>
                                </div>
                              </div>
                              <div className="max-h-32 overflow-y-auto pr-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-200 hover:[&::-webkit-scrollbar-thumb]:bg-slate-300">
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
                              <div className="flex items-center gap-2 mb-3 relative z-10">
                                <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-[11px] font-bold uppercase tracking-wider rounded-lg border border-emerald-200/50 flex items-center gap-1">
                                  <CheckCircleIcon className="w-3.5 h-3.5" /> Đề xuất AI
                                </span>
                              </div>
                              <p className="text-base text-emerald-950 font-semibold relative z-10 leading-relaxed">
                                {s.improved}
                              </p>
                            </div>

                            {/* Explanation Footer */}
                            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 mt-auto shrink-0 flex items-start gap-3">
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