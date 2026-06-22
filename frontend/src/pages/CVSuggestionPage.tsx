import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { SparklesIcon, ArrowLeftIcon, ExclamationTriangleIcon, DocumentTextIcon, ClipboardDocumentIcon, CheckIcon, CheckCircleIcon, XCircleIcon, BriefcaseIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../lib/api';

interface ReportData {
  cv_suggestions?: Array<{ section: string; suggestion: string }>;
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
      })
      .catch((err) => console.error('Không thể sao chép: ', err));
  };

  const getBeforeAfterForSection = (section: string) => {
    const sec = section.toLowerCase();
    if (sec.includes('experience') || sec.includes('kinh nghiệm') || sec.includes('lịch sử') || sec.includes('làm việc')) {
      return {
        before: '"Chịu trách nhiệm phát triển tính năng Frontend cho dự án, sửa lỗi hệ thống và code giao diện."',
        after: '"Chủ trì phát triển 3 module Frontend cốt lõi bằng React & TypeScript, trực tiếp giải quyết 15+ bug nghiêm trọng và tối ưu hóa luồng tải trang giúp tăng 30% tốc độ tải."'
      };
    }
    if (sec.includes('skill') || sec.includes('kỹ năng') || sec.includes('công nghệ') || sec.includes('kỹ thuật')) {
      return {
        before: '"Có kiến thức lập trình Web, làm việc với Java, Python, Javascript, React, SQL, Git..."',
        after: '"Thành thạo lập trình hướng đối tượng (OOP) qua Java & Python; 2 năm kinh nghiệm thực chiến phát triển SPA với React.js; tối ưu truy vấn SQL (PostgreSQL)."'
      };
    }
    if (sec.includes('project') || sec.includes('dự án') || sec.includes('sản phẩm')) {
      return {
        before: '"Làm dự án website bán hàng, quản lý sản phẩm, tài khoản và lịch sử giao dịch bằng PHP."',
        after: '"Xây dựng web app E-commerce chuẩn RESTful API với Laravel (PHP) & MySQL; triển khai Docker để đóng gói sản phẩm và quản lý CI/CD qua GitHub Actions."'
      };
    }
    return {
      before: '"Làm việc chăm chỉ, nhiệt tình và hoàn thành tốt các nhiệm vụ được giao trong dự án."',
      after: '"Ứng dụng quy trình Agile/Scrum quản lý công việc cá nhân; chủ động đề xuất giải pháp kỹ thuật giúp giảm thiểu 20% thời gian triển khai dự án."'
    };
  };

  const matched = report?.jd_gap_analysis?.matched_skills || [];
  const missing = report?.jd_gap_analysis?.missing_keywords || [];
  const weak = report?.jd_gap_analysis?.weak_areas || [];
  const hasJdData = matched.length > 0 || missing.length > 0;
  const matchScore = hasJdData ? Math.round((matched.length / (matched.length + missing.length)) * 100) : 0;

  useEffect(() => {
    if (!sessionId || !accessToken) return;

    const fetchReport = async () => {
      try {
        const data = await apiFetch<ReportData>(
          `/sessions/${sessionId}/report`,
          {},
          accessToken
        );
        setReport(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Chưa có báo cáo');
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [sessionId, accessToken]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <div className="w-12 h-12 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mb-4"></div>
        <p className="text-slate-500 font-medium">Đang tải gợi ý CV...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8 pb-20 animate-fade-in font-sans">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Gợi ý <span className="text-emerald-600">nâng cấp CV</span>
          </h1>
          <p className="text-slate-500 mt-2 font-medium flex items-center gap-2">
            <DocumentTextIcon className="w-5 h-5 text-emerald-500" /> 
            Dựa trên kết quả phân tích AI và mô tả công việc
          </p>
        </div>
        <Link
          to={`/report/${sessionId}`}
          className="flex items-center gap-2 text-emerald-600 font-semibold bg-emerald-50 px-5 py-2.5 rounded-full hover:bg-emerald-100 transition-colors shadow-sm"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Quay lại báo cáo
        </Link>
      </div>

      {error && !report && (
        <div className="bg-red-50 text-red-700 p-4 rounded-2xl flex items-center gap-3">
          <ExclamationTriangleIcon className="w-6 h-6" />
          <span className="font-medium">{error}</span>
        </div>
      )}

      {/* ATS Match Simulator Dashboard */}
      {report && (
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 -mr-8 -mt-8 w-48 h-48 rounded-full bg-emerald-500/5 blur-3xl group-hover:opacity-100 transition-opacity duration-700" />
          <div className="absolute bottom-0 left-0 -ml-8 -mb-8 w-32 h-32 rounded-full bg-violet-500/5 blur-3xl" />
          
          <h2 className="text-xl font-extrabold mb-6 flex items-center gap-2.5 relative z-10">
            <BriefcaseIcon className="w-6 h-6 text-emerald-400 stroke-[2.5]" />
            Hệ thống phân tích tương thích ATS (ATS Match Simulator)
          </h2>

          {hasJdData ? (
            <div className="grid md:grid-cols-12 gap-8 items-center relative z-10">
              {/* Score Circular gauge */}
              <div className="md:col-span-4 flex flex-col items-center justify-center text-center border-b md:border-b-0 md:border-r border-white/10 pb-6 md:pb-0 md:pr-8">
                <div className="relative w-36 h-36 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle
                      cx="72"
                      cy="72"
                      r="60"
                      className="text-white/10"
                      strokeWidth="10"
                      stroke="currentColor"
                      fill="transparent"
                    />
                    <circle
                      cx="72"
                      cy="72"
                      r="60"
                      className="text-emerald-500 transition-all duration-1000 ease-out"
                      strokeWidth="10"
                      strokeDasharray={2 * Math.PI * 60}
                      strokeDashoffset={2 * Math.PI * 60 * (1 - matchScore / 100)}
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="transparent"
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center justify-center">
                    <span className="text-4xl font-black">{matchScore}%</span>
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Trùng khớp</span>
                  </div>
                </div>

                <div className="mt-4">
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
                    matchScore >= 80 ? "bg-emerald-500/20 text-emerald-300" :
                    matchScore >= 50 ? "bg-amber-500/20 text-amber-300" :
                    "bg-red-500/20 text-red-300"
                  }`}>
                    {matchScore >= 80 ? "Độ tương thích cao" :
                     matchScore >= 50 ? "Tương thích trung bình" :
                     "Tương thích thấp"}
                  </span>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                    Điểm số dựa trên số lượng từ khóa chuyên môn trong CV khớp với yêu cầu mô tả công việc (JD).
                  </p>
                </div>
              </div>

              {/* Badges lists */}
              <div className="md:col-span-8 space-y-5">
                {/* Matched Keywords */}
                <div>
                  <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <CheckCircleIcon className="w-4 h-4 text-emerald-400" />
                    Từ khóa đã trùng khớp ({matched.length})
                  </h4>
                  {matched.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {matched.map((skill, idx) => (
                        <span key={idx} className="text-xs font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 px-2.5 py-1 rounded-lg transition-colors">
                          {skill}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400 italic">Chưa phát hiện từ khóa trùng khớp.</span>
                  )}
                </div>

                {/* Missing Keywords */}
                <div>
                  <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <XCircleIcon className="w-4 h-4 text-rose-400" />
                    Từ khóa còn thiếu cần bổ sung ({missing.length})
                  </h4>
                  {missing.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {missing.map((keyword, idx) => (
                        <span key={idx} className="text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 px-2.5 py-1 rounded-lg transition-colors">
                          + {keyword}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400 italic">Tuyệt vời! Không thiếu từ khóa cốt lõi nào.</span>
                  )}
                </div>

                {/* Weak Areas */}
                {weak.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-violet-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                      <SparklesIcon className="w-4 h-4 text-violet-400" />
                      Điểm cần làm rõ / bổ sung
                    </h4>
                    <ul className="text-xs text-slate-300 space-y-1.5 list-disc list-inside leading-relaxed pl-1">
                      {weak.map((area, idx) => (
                        <li key={idx} className="hover:text-white transition-colors">
                          {area}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-6 relative z-10">
              <p className="text-slate-400 text-sm font-medium mb-3">
                Bạn chưa tải lên Mô tả công việc (JD) cho phiên phỏng vấn này.
              </p>
              <p className="text-xs text-slate-500 max-w-lg mx-auto">
                Để sử dụng tính năng phân tích từ khóa ATS, đánh giá độ trùng khớp và phát hiện các từ khóa bị thiếu, vui lòng đính kèm file mô tả công việc (JD) ở những buổi phỏng vấn tiếp theo.
              </p>
            </div>
          )}
        </div>
      )}

      {report && (
        <div className="grid gap-6">
          {(report?.cv_suggestions?.length || 0) > 0 ? (
            (report?.cv_suggestions || []).map((s, i) => (
              <div key={i} className="bg-white rounded-3xl p-6 md:p-8 shadow-[0_10px_30px_rgba(16,185,129,0.04)] border border-emerald-50 relative overflow-hidden group hover:shadow-[0_15px_35px_rgba(16,185,129,0.1)] transition-all duration-300">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50/50 rounded-bl-full -mr-16 -mt-16 transition-transform duration-500 group-hover:scale-110"></div>
                <div className="flex items-start gap-5">
                  <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center shrink-0 relative z-10">
                    <SparklesIcon className="w-7 h-7 text-emerald-600" />
                  </div>
                  <div className="relative z-10 pt-1 flex-1">
                    <div className="flex items-center justify-between gap-4 mb-3">
                      <div className="inline-flex items-center px-3 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold uppercase tracking-wider">
                        {s.section}
                      </div>
                      <button
                        onClick={() => handleCopy(s.suggestion, i)}
                        className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-emerald-600 bg-slate-50 hover:bg-emerald-50 px-2.5 py-1 rounded-lg border border-slate-100 hover:border-emerald-100 transition-all shadow-sm shrink-0"
                      >
                        {copiedIndex === i ? (
                          <>
                            <CheckIcon className="w-3.5 h-3.5 text-emerald-600 stroke-[2.5]" />
                            <span className="text-emerald-700">Đã chép</span>
                          </>
                        ) : (
                          <>
                            <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                            <span>Sao chép</span>
                          </>
                        )}
                      </button>
                    </div>
                    <p className="text-slate-700 text-base font-medium leading-relaxed">
                      {s.suggestion}
                    </p>

                    {/* Simulated Before/After Comparison Box */}
                    {(() => {
                      const sample = getBeforeAfterForSection(s.section);
                      return (
                        <div className="mt-5 grid md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100 text-xs font-semibold shadow-inner">
                          <div className="space-y-1.5">
                            <span className="text-slate-400 uppercase tracking-wider text-[10px] block">Cách viết cũ nên tránh</span>
                            <p className="text-slate-500 line-through bg-red-50/40 p-3 rounded-xl border border-red-50/50 font-medium leading-relaxed">
                              {sample.before}
                            </p>
                          </div>
                          <div className="space-y-1.5">
                            <span className="text-emerald-600 uppercase tracking-wider text-[10px] block">AI đề xuất sửa lại</span>
                            <p className="text-slate-700 bg-emerald-50/30 p-3 rounded-xl border border-emerald-50/40 font-medium leading-relaxed">
                              {sample.after}
                            </p>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="bg-white rounded-3xl p-16 text-center shadow-sm border border-slate-100">
              <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <DocumentTextIcon className="w-10 h-10 text-slate-400" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-3">CV của bạn đã rất tốt!</h3>
              <p className="text-slate-500 font-medium">Hệ thống AI không tìm thấy điểm nào cần cải thiện thêm cho CV của bạn so với yêu cầu của vị trí này.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}