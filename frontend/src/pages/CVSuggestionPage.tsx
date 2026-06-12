import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { SparklesIcon, ArrowLeftIcon, ExclamationTriangleIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../lib/api';

interface ReportData {
  cv_suggestions?: Array<{ section: string; suggestion: string }>;
}

export default function CVSuggestionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { accessToken } = useAuth();
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
                  <div className="relative z-10 pt-1">
                    <div className="inline-flex items-center px-3 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold uppercase tracking-wider mb-3">
                      {s.section}
                    </div>
                    <p className="text-slate-700 text-base font-medium leading-relaxed">
                      {s.suggestion}
                    </p>
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