import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ClockIcon,
  BriefcaseIcon,
  CalendarIcon,
  LanguageIcon,
  PlusIcon,
  DocumentTextIcon,
  PlayIcon,
  ChartPieIcon,
  MagnifyingGlassIcon,
  VideoCameraIcon,
  CheckCircleIcon,
  ChartBarIcon,
  ChatBubbleLeftRightIcon,
  SparklesIcon,
  PresentationChartLineIcon
} from "@heroicons/react/24/outline";
import { StarIcon } from "@heroicons/react/24/solid";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../contexts/AuthContext";
import { apiFetch, type Session } from "../lib/api";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis
} from "recharts";

const STATUS_LABELS: Record<string, string> = {
  draft: "Nháp",
  parsing: "Đang phân tích",
  ready: "Sẵn sàng",
  active: "Đang phỏng vấn",
  evaluating: "Đang đánh giá",
  completed: "Hoàn thành",
  failed: "Thất bại",
};

const StatusBadge = ({ status }: { status: string }) => {
  const configs: Record<string, { bg: string; text: string }> = {
    ready: { bg: "bg-blue-100", text: "text-blue-700" },
    active: { bg: "bg-amber-100", text: "text-amber-700" },
    evaluating: { bg: "bg-purple-100", text: "text-purple-700" },
    completed: { bg: "bg-emerald-100", text: "text-emerald-700" },
    failed: { bg: "bg-red-100", text: "text-red-700" },
    parsing: { bg: "bg-orange-100", text: "text-orange-700" },
    draft: { bg: "bg-slate-100", text: "text-slate-700" },
  };

  const config = configs[status] || configs.draft;

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${config.bg} ${config.text}`}
    >
      {STATUS_LABELS[status] || status}
    </span>
  );
};

const EVALUATION_CRITERIA = [
  { num: "01", title: "Nội dung", label: "Tiêu chí 1", desc: "Đánh giá chuyên sâu về độ chính xác của thông tin, nền tảng kiến thức chuyên môn và chất lượng của các ví dụ thực tế được đưa ra trong câu trả lời.", Icon: DocumentTextIcon, bg: "bg-blue-50", color: "text-blue-600" },
  { num: "02", title: "Độ liên quan", label: "Tiêu chí 2", desc: "Phân tích mức độ bám sát trọng tâm câu hỏi, tránh lan man và đo lường sự phù hợp trực tiếp với các yêu cầu của vị trí công việc.", Icon: BriefcaseIcon, bg: "bg-emerald-50", color: "text-emerald-600" },
  { num: "03", title: "Tính đầy đủ", label: "Tiêu chí 3", desc: "Kiểm tra khả năng bao quát vấn đề từ đầu đến cuối, đặc biệt chú trọng việc áp dụng phương pháp STAR (Tình huống, Nhiệm vụ, Hành động, Kết quả).", Icon: ChartPieIcon, bg: "bg-amber-50", color: "text-amber-600" },
  { num: "04", title: "Trình bày", label: "Tiêu chí 4", desc: "Đánh giá kỹ năng giao tiếp tổng thể bao gồm sự lưu loát, mạch lạc, cấu trúc trả lời rõ ràng, phong thái tự tin và cách diễn đạt tự nhiên.", Icon: ChatBubbleLeftRightIcon, bg: "bg-violet-50", color: "text-violet-600" },
];

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
};

export default function HistoryPage() {
  const { accessToken } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeCriterion, setActiveCriterion] = useState(0);
  const [activeTab, setActiveTab] = useState<"list" | "analytics">("list");
  const navigate = useNavigate();

  const completedSessions = sessions.filter((s) => s.status === "completed" && s.overall_score !== undefined && s.overall_score !== null);

  const trendData = [...completedSessions]
    .reverse()
    .map((s, index) => ({
      name: `Lần ${index + 1}`,
      score: s.overall_score || 0,
      date: new Date(s.created_at).toLocaleDateString("vi-VN", { day: 'numeric', month: 'short' }),
      position: s.position_applied || s.title || "Phỏng vấn"
    }));

  const totalCompleted = completedSessions.length;
  const avgScores = completedSessions.reduce(
    (acc, curr) => {
      acc.content += curr.avg_content || 0;
      acc.relevance += curr.avg_relevance || 0;
      acc.completeness += curr.avg_completeness || 0;
      acc.presentation += curr.avg_presentation || 0;
      return acc;
    },
    { content: 0, relevance: 0, completeness: 0, presentation: 0 }
  );

  const criteriaData = [
    { name: "Nội dung", score: totalCompleted ? Number((avgScores.content / totalCompleted).toFixed(1)) : 0 },
    { name: "Liên quan", score: totalCompleted ? Number((avgScores.relevance / totalCompleted).toFixed(1)) : 0 },
    { name: "Đầy đủ", score: totalCompleted ? Number((avgScores.completeness / totalCompleted).toFixed(1)) : 0 },
    { name: "Trình bày", score: totalCompleted ? Number((avgScores.presentation / totalCompleted).toFixed(1)) : 0 },
  ];

  useEffect(() => {
    if (!accessToken) return;
    apiFetch<Session[]>("/sessions", {}, accessToken)
      .then((data) => {
        if (Array.isArray(data)) {
          const sorted = data.sort(
            (a, b) => new Date(b.created_at || Date.now()).getTime() - new Date(a.created_at || Date.now()).getTime()
          );
          setSessions(sorted);
        } else {
          setSessions([]);
        }
      })
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, [accessToken]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setActiveCriterion((prev) => (prev + 1) % EVALUATION_CRITERIA.length);
    }, 5000);
    return () => clearTimeout(timer);
  }, [activeCriterion]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <div className="w-12 h-12 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin mb-4"></div>
        <p className="text-slate-500 font-medium">Đang tải lịch sử phỏng vấn...</p>
      </div>
    );
  }

  const completedCount = sessions.filter((s) => s.status === "completed").length;

  const filteredSessions = sessions.filter((s) => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      (s.title || s.position_applied || "").toLowerCase().includes(searchLower) ||
      (s.industry || "").toLowerCase().includes(searchLower);

    let matchesStatus = true;
    if (statusFilter === "completed") {
      matchesStatus = s.status === "completed";
    } else if (statusFilter === "processing") {
      matchesStatus = ["draft", "parsing", "ready", "active", "evaluating"].includes(s.status);
    }

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 pb-20 font-sans min-h-screen">
      <div className="grid lg:grid-cols-3 gap-8 items-start">
        <div className="lg:col-span-2 space-y-6">

          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between"
          >
            <div>
              <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-700 tracking-tight">
                Lịch sử <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-indigo-600">phỏng vấn</span>
              </h1>
              <p className="text-slate-500 mt-2 font-medium flex items-center gap-2 text-base">
                <ClockIcon className="w-6 h-6 text-violet-500" />
                Xem lại các phiên phỏng vấn và kết quả đánh giá của bạn
              </p>
            </div>
          </motion.div>

          {/* Stats Component */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            <div className="bg-gradient-to-br from-white to-slate-50/80 backdrop-blur-xl rounded-2xl p-5 border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)] flex items-center gap-4 hover:border-violet-200 hover:shadow-[0_8px_30px_rgba(124,58,237,0.08)] transition-all duration-300 group relative overflow-hidden">
              <motion.div animate={{ y: [0, -6, 0], opacity: [0.4, 0.8, 0.4] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} className="absolute top-3 right-10">
                <SparklesIcon className="w-5 h-5 text-violet-400" />
              </motion.div>
              <motion.div animate={{ y: [0, 4, 0], opacity: [0.3, 0.6, 0.3] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 1 }} className="absolute bottom-4 right-4">
                <StarIcon className="w-3 h-3 text-violet-300" />
              </motion.div>
              <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 rounded-full bg-violet-500 opacity-5 blur-2xl group-hover:opacity-10 transition-opacity duration-300"></div>
              <div className="relative z-10 w-14 h-14 bg-violet-50 rounded-2xl flex items-center justify-center shrink-0 group-hover:bg-violet-600 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-inner">
                <VideoCameraIcon className="w-7 h-7 text-violet-600 group-hover:text-white transition-colors duration-300" />
              </div>
              <div className="relative z-10">
                <p className="text-slate-500 font-bold text-[11px] uppercase tracking-wider mb-0.5 group-hover:text-violet-600 transition-colors">Tổng số phỏng vấn</p>
                <h4 className="text-3xl font-black text-slate-800">{sessions.length}</h4>
              </div>
            </div>
            <div className="bg-gradient-to-br from-white to-slate-50/80 backdrop-blur-xl rounded-2xl p-5 border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)] flex items-center gap-4 hover:border-emerald-200 hover:shadow-[0_8px_30px_rgba(16,185,129,0.08)] transition-all duration-300 group relative overflow-hidden">
              <motion.div animate={{ y: [0, -6, 0], opacity: [0.4, 0.8, 0.4] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.5 }} className="absolute top-3 right-10">
                <SparklesIcon className="w-5 h-5 text-emerald-400" />
              </motion.div>
              <motion.div animate={{ y: [0, 4, 0], opacity: [0.3, 0.6, 0.3] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 1.5 }} className="absolute bottom-4 right-4">
                <StarIcon className="w-3 h-3 text-emerald-300" />
              </motion.div>
              <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 rounded-full bg-emerald-500 opacity-5 blur-2xl group-hover:opacity-10 transition-opacity duration-300"></div>
              <div className="relative z-10 w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center shrink-0 group-hover:bg-emerald-600 group-hover:scale-110 group-hover:-rotate-3 transition-all duration-300 shadow-inner">
                <CheckCircleIcon className="w-7 h-7 text-emerald-600 group-hover:text-white transition-colors duration-300" />
              </div>
              <div className="relative z-10">
                <p className="text-slate-500 font-bold text-[11px] uppercase tracking-wider mb-0.5 group-hover:text-emerald-600 transition-colors">Phỏng vấn đã hoàn thành</p>
                <h4 className="text-3xl font-black text-slate-800">{completedCount}</h4>
              </div>
            </div>
          </motion.div>

          {sessions.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="bg-white rounded-3xl p-10 text-center shadow-[0_10px_40px_rgba(0,0,0,0.03)] border border-slate-100 relative overflow-hidden group"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-violet-500 to-indigo-500"></div>
              <div className="absolute -inset-24 bg-gradient-to-tr from-violet-100/30 to-emerald-100/30 opacity-0 group-hover:opacity-100 transition-opacity duration-700 rounded-full blur-3xl z-0"></div>
              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="w-20 h-20 bg-violet-50 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner relative z-10"
              >
                <DocumentTextIcon className="w-10 h-10 text-violet-400" />
              </motion.div>
              <h3 className="text-2xl font-extrabold text-slate-800 mb-3">Chưa có phiên phỏng vấn nào</h3>
              <p className="text-slate-500 text-sm font-medium mb-8 max-w-md mx-auto">
                Bạn chưa thực hiện bài phỏng vấn nào. Hãy tạo một phiên mới để trải nghiệm phỏng vấn thực tế với AI.
              </p>
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 text-white text-sm font-bold bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-3 rounded-xl hover:shadow-[0_10px_25px_rgba(124,58,237,0.4)] hover:-translate-y-1 transition-all shadow-sm"
              >
                <PlusIcon className="w-5 h-5 stroke-[2.5]" />
                Tạo buổi phỏng vấn đầu tiên
              </Link>
            </motion.div>
          ) : (
            <>
              {/* Tab Selector */}
              <div className="flex bg-slate-100/80 backdrop-blur-xl p-1 rounded-xl border border-slate-200/60 w-max h-[44px] items-center mb-6">
                <button
                  onClick={() => setActiveTab("list")}
                  className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all flex items-center gap-1.5 ${activeTab === "list" ? "bg-white text-violet-700 shadow-[0_2px_8px_rgba(0,0,0,0.05)]" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                    }`}
                >
                  <ClockIcon className="w-4 h-4" />
                  Lịch sử phỏng vấn
                </button>
                {completedCount > 0 && (
                  <button
                    onClick={() => setActiveTab("analytics")}
                    className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all flex items-center gap-1.5 ${activeTab === "analytics" ? "bg-white text-violet-700 shadow-[0_2px_8px_rgba(0,0,0,0.05)]" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                      }`}
                  >
                    <PresentationChartLineIcon className="w-4 h-4" />
                    Tiến độ & Phân tích
                  </button>
                )}
              </div>

              {activeTab === "list" ? (
                <div className="bg-white/60 backdrop-blur-xl rounded-3xl border border-slate-200/60 shadow-[0_10px_40px_rgba(0,0,0,0.03)] overflow-hidden flex flex-col relative z-10 animate-fade-in">
                  <div className="p-5 md:p-6 border-b border-slate-200/60 bg-white/40">
                    <div className="flex flex-col sm:flex-row gap-3 w-full">
                      <div className="relative w-full flex-1 group">
                        <div className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-violet-100 text-violet-600 rounded-lg flex items-center justify-center transition-all duration-300 group-hover:bg-violet-200 group-focus-within:bg-violet-600 group-focus-within:text-white group-focus-within:scale-105 shadow-sm z-10">
                          <MagnifyingGlassIcon className="w-5 h-5 stroke-[2.5]" />
                        </div>
                        <input
                          type="text"
                          placeholder="Tìm kiếm phiên phỏng vấn..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="w-full pl-14 pr-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-500/15 bg-white/80 backdrop-blur-xl transition-all shadow-sm text-sm font-medium hover:border-violet-300"
                        />
                      </div>
                      <div className="flex bg-slate-100/80 backdrop-blur-xl p-1 rounded-xl border border-slate-200/60 shrink-0 h-[48px] items-center">
                        <button
                          onClick={() => setStatusFilter("all")}
                          className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all flex items-center gap-1.5 ${statusFilter === "all" ? "bg-white text-violet-700 shadow-[0_2px_8px_rgba(0,0,0,0.05)]" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                            }`}
                        >
                          Tất cả
                        </button>
                        <button
                          onClick={() => setStatusFilter("processing")}
                          className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all flex items-center gap-1.5 ${statusFilter === "processing" ? "bg-white text-amber-700 shadow-[0_2px_8px_rgba(0,0,0,0.05)]" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                            }`}
                        >
                          <span className={`w-2 h-2 rounded-full ${statusFilter === "processing" ? "bg-amber-500 animate-pulse" : "bg-slate-400"}`}></span>
                          Đang xử lý
                        </button>
                        <button
                          onClick={() => setStatusFilter("completed")}
                          className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all flex items-center gap-1.5 ${statusFilter === "completed" ? "bg-white text-emerald-700 shadow-[0_2px_8px_rgba(0,0,0,0.05)]" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                            }`}
                        >
                          <CheckCircleIcon className="w-4 h-4" />
                          Hoàn thành
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="p-5 md:p-6 bg-slate-50/30">
                    {filteredSessions.length === 0 ? (
                      <div className="bg-white rounded-2xl p-10 text-center border border-slate-100 shadow-sm">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                          <DocumentTextIcon className="w-8 h-8 text-slate-400" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-700 mb-1">Không tìm thấy dữ liệu</h3>
                        <p className="text-slate-500 text-sm font-medium">Thử thay đổi từ khóa hoặc bộ lọc để xem các kết quả khác.</p>
                      </div>
                    ) : (
                      <motion.div
                        variants={containerVariants}
                        initial="hidden"
                        animate="show"
                        className="grid gap-4 md:max-h-[600px] md:overflow-y-auto pr-2 pb-2 -mr-2"
                        style={{ scrollbarWidth: "thin", scrollbarColor: "#cbd5e1 transparent" }}
                      >
                        {filteredSessions.map((s) => {
                          const isActionable = ["ready", "active", "completed", "evaluating"].includes(s.status);
                          const isReport = ["completed", "evaluating"].includes(s.status);

                          return (
                            <motion.div
                              variants={itemVariants}
                              whileHover={{ y: -2, scale: 1.005 }}
                              key={s.id}
                              onClick={() => {
                                if (s.status === "ready" || s.status === "active") {
                                  navigate(`/interview/${s.id}`);
                                } else if (s.status === "completed" || s.status === "evaluating") {
                                  navigate(`/report/${s.id}`);
                                }
                              }}
                              className={`relative bg-white rounded-2xl py-5 pr-5 pl-7 border border-slate-200 shadow-[0_2px_10px_rgba(0,0,0,0.02)] hover:shadow-[0_15px_30px_rgba(124,58,237,0.08)] hover:border-violet-200 transition-all duration-300 group flex flex-col md:flex-row md:items-center justify-between gap-4 overflow-hidden ${isActionable ? "cursor-pointer" : ""
                                }`}
                            >
                              <div className={`absolute top-0 left-0 bottom-0 w-1.5 transition-colors ${s.status === "completed" ? "bg-emerald-500" :
                                  s.status === "evaluating" ? "bg-purple-500" :
                                    s.status === "active" ? "bg-amber-500" :
                                      s.status === "ready" ? "bg-blue-500" :
                                        s.status === "parsing" ? "bg-orange-500" :
                                          "bg-slate-300"
                                }`} />

                              <div className="absolute inset-0 bg-gradient-to-r from-violet-50/30 to-indigo-50/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10" />

                              <div className="flex-1 relative z-10">
                                <div className="flex items-center gap-3 mb-2.5">
                                  <StatusBadge status={s.status} />
                                  <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                                    <CalendarIcon className="w-3.5 h-3.5" />
                                    {new Date(s.created_at || Date.now()).toLocaleDateString("vi-VN", {
                                      day: "2-digit",
                                      month: "2-digit",
                                      year: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </span>
                                </div>

                                <h3 className="text-lg font-extrabold text-slate-800 mb-2.5 group-hover:text-violet-700 transition-colors">
                                  {s.title || s.position_applied || "Vị trí không xác định"}
                                </h3>

                                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                                  {s.industry && (
                                    <span className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-md border border-slate-100 shadow-sm">
                                      <BriefcaseIcon className="w-3.5 h-3.5 text-slate-400" />
                                      {s.industry}
                                    </span>
                                  )}
                                  <span className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-md border border-slate-100 shadow-sm">
                                    <LanguageIcon className="w-3.5 h-3.5 text-slate-400" />
                                    {s.language === "vi" ? "Tiếng Việt" : "English"}
                                  </span>
                                </div>
                              </div>

                              <div className="shrink-0 flex items-center gap-3 mt-2 md:mt-0 pt-3 md:pt-0 border-t md:border-t-0 border-slate-100 relative z-10">
                                {isActionable ? (
                                  <div className="flex items-center gap-1.5 text-xs font-bold text-violet-600 bg-violet-50 px-3.5 py-2 rounded-lg group-hover:bg-gradient-to-r group-hover:from-violet-600 group-hover:to-indigo-600 group-hover:text-white transition-all shadow-sm hover:shadow-md">
                                    {isReport ? (
                                      <>
                                        Xem kết quả <ChartPieIcon className="w-3.5 h-3.5" />
                                      </>
                                    ) : (
                                      <>
                                        Bắt đầu <PlayIcon className="w-3.5 h-3.5" />
                                      </>
                                    )}
                                  </div>
                                ) : (
                                  <div className="w-5 h-5 shrink-0" />
                                )}
                              </div>
                            </motion.div>
                          );
                        })}
                      </motion.div>
                    )}
                  </div>
                </div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6 animate-fade-in"
                >
                  {/* Summary Banner */}
                  <div className="bg-gradient-to-r from-violet-600 to-indigo-700 rounded-3xl p-6 md:p-8 text-white shadow-lg relative overflow-hidden group">
                    <div className="absolute top-0 right-0 -mr-8 -mt-8 w-36 h-36 rounded-full bg-white opacity-5" />
                    <h3 className="text-lg font-extrabold mb-2 relative z-10 flex items-center gap-2">
                      <SparklesIcon className="w-5 h-5 text-amber-300" />
                      Phân tích tiến độ & Xu hướng học tập
                    </h3>
                    <p className="text-violet-100 text-sm font-medium leading-relaxed relative z-10">
                      {trendData.length >= 2
                        ? `AI ghi nhận bạn đã hoàn thành ${completedCount} phiên phỏng vấn. Điểm số gần đây nhất của bạn là (${trendData[trendData.length - 1].score}/10). Hãy tiếp tục duy trì luyện tập để đạt kết quả tốt nhất!`
                        : `Hoàn thành thêm các buổi phỏng vấn thoại tiếp theo để kích hoạt biểu đồ phân tích tăng trưởng điểm số và phân tích kỹ năng chi tiết.`}
                    </p>
                  </div>

                  {/* Chart Grid */}
                  <div className="grid md:grid-cols-2 gap-6">
                    {/* Score Trend Chart */}
                    <div className="bg-white rounded-3xl p-5 md:p-6 border border-slate-100 shadow-sm flex flex-col h-[350px]">
                      <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <ChartBarIcon className="w-4 h-4 text-violet-600" />
                        Biểu đồ xu hướng điểm số
                      </h4>
                      <div className="flex-1 min-h-0 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} />
                            <YAxis domain={[0, 10]} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} />
                            <RechartsTooltip
                              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}
                              formatter={(value: any, _name: any, props: any) => [`${value} / 10`, `Điểm (${props.payload.position})`]}
                            />
                            <Line type="monotone" dataKey="score" stroke="#7c3aed" strokeWidth={3} activeDot={{ r: 6 }} dot={{ r: 4, stroke: '#7c3aed', strokeWidth: 2, fill: '#fff' }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Criteria Average Chart (Radar Chart) */}
                    <div className="bg-white rounded-3xl p-5 md:p-6 border border-slate-100 shadow-sm flex flex-col h-[350px]">
                      <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <ChartPieIcon className="w-4 h-4 text-emerald-600" />
                        Ma trận kỹ năng đa chiều (Radar Skill Matrix)
                      </h4>
                      <div className="flex-1 min-h-0 w-full flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                          <RadarChart cx="50%" cy="50%" outerRadius="70%" data={criteriaData}>
                            <PolarGrid stroke="#e2e8f0" />
                            <PolarAngleAxis dataKey="name" tick={{ fill: '#475569', fontSize: 12, fontWeight: 'bold' }} />
                            <PolarRadiusAxis angle={30} domain={[0, 10]} tick={{ fill: '#64748b', fontSize: 10 }} />
                            <Radar name="Điểm trung bình" dataKey="score" stroke="#10b981" fill="#10b981" fillOpacity={0.2} />
                            <RechartsTooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }} />
                          </RadarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  {/* Personalized Learning Path */}
                  {completedCount > 0 && (
                    <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-6 mt-6">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                        <div>
                          <h4 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                            <SparklesIcon className="w-5 h-5 text-violet-600" />
                            Lộ trình học tập & Cải thiện cá nhân hóa
                          </h4>
                          <p className="text-xs text-slate-500 mt-1 font-semibold">
                            Dựa trên điểm trung bình thực tế từ các buổi phỏng vấn của bạn
                          </p>
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-6">
                        {(() => {
                          const avgContent = totalCompleted ? (avgScores.content / totalCompleted) : 0;
                          const avgRelevance = totalCompleted ? (avgScores.relevance / totalCompleted) : 0;
                          const avgCompleteness = totalCompleted ? (avgScores.completeness / totalCompleted) : 0;
                          const avgPresentation = totalCompleted ? (avgScores.presentation / totalCompleted) : 0;

                          const paths = [];

                          if (avgContent < 8.0) {
                            paths.push({
                              title: "Củng cố kiến thức chuyên môn",
                              score: avgContent,
                              color: "text-blue-600",
                              bgColor: "bg-blue-50 border-blue-100",
                              iconColor: "bg-blue-100",
                              desc: "Điểm nội dung trả lời còn hạn chế. Hãy tập trung củng cố kiến thức nền tảng và cập nhật các dự án kỹ thuật.",
                              steps: [
                                "Hệ thống hóa các công nghệ cốt lõi ghi trên CV của bạn.",
                                "Chuẩn bị các câu hỏi lý thuyết chuyên sâu về lập trình/system design.",
                                "Xem lại phản hồi chi tiết về các lỗi logic trong câu trả lời cũ."
                              ]
                            });
                          }

                          if (avgRelevance < 8.0) {
                            paths.push({
                              title: "Tối ưu hóa độ bám sát câu hỏi",
                              score: avgRelevance,
                              color: "text-emerald-600",
                              bgColor: "bg-emerald-50 border-emerald-100",
                              iconColor: "bg-emerald-100",
                              desc: "Bạn có xu hướng giải thích dài dòng hoặc chưa đi trực tiếp vào vấn đề chính nhà tuyển dụng yêu cầu.",
                              steps: [
                                "Đọc kỹ từ khóa cốt lõi trong câu hỏi trước khi trả lời.",
                                "Cấu trúc ý trả lời rõ ràng thành 2 - 3 luận điểm chính.",
                                "Tránh đưa các chi tiết không liên quan từ kinh nghiệm ngoài lề."
                              ]
                            });
                          }

                          if (avgCompleteness < 8.0) {
                            paths.push({
                              title: "Làm chủ phương pháp trả lời STAR",
                              score: avgCompleteness,
                              color: "text-amber-600",
                              bgColor: "bg-amber-50 border-amber-100",
                              iconColor: "bg-amber-100",
                              desc: "Các câu hỏi tình huống hành vi của bạn thường bị thiếu kết quả cụ thể hoặc mô tả chưa rõ hành động cá nhân.",
                              steps: [
                                "Bắt đầu bằng mô tả Tình huống (S) và Nhiệm vụ (T) ngắn gọn.",
                                "Làm nổi bật Hành động (A) cá nhân: 'Tôi đã làm...', tránh dùng 'Chúng tôi'.",
                                "Đưa ra Kết quả (R) đo lường được bằng số liệu cụ thể (ví dụ: tăng 20% performance)."
                              ]
                            });
                          }

                          if (avgPresentation < 8.0) {
                            paths.push({
                              title: "Nâng cao kỹ năng thuyết trình & Trình bày",
                              score: avgPresentation,
                              color: "text-violet-600",
                              bgColor: "bg-violet-50 border-violet-100",
                              iconColor: "bg-violet-100",
                              desc: "Tốc độ nói, sự lưu loát hoặc tông giọng của bạn cần được cải thiện để tăng phần tự tin, chuyên nghiệp.",
                              steps: [
                                "Kiểm soát tốc độ nói vừa phải (khoảng 120-140 từ/phút).",
                                "Hạn chế tối đa các từ thừa (ờ, à, thì, là, kiểu như, you know).",
                                "Luyện tập ngắt nghỉ câu rõ ràng và giữ hơi thở đều đặn."
                              ]
                            });
                          }

                          if (paths.length === 0) {
                            return (
                              <div className="col-span-2 text-center py-8 bg-emerald-50/50 rounded-2xl border border-emerald-100/50">
                                <CheckCircleIcon className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                                <h5 className="font-bold text-emerald-800 text-sm">Tuyệt vời! Điểm số của bạn đều trên 8.0</h5>
                                <p className="text-xs text-emerald-600 max-w-md mx-auto mt-1 font-semibold">
                                  Bạn đang có phong độ phỏng vấn rất tốt ở tất cả các khía cạnh. Hãy tiếp tục duy trì luyện tập để làm quen với nhiều câu hỏi áp lực hơn!
                                </p>
                              </div>
                            );
                          }

                          return paths.map((path, idx) => (
                            <div key={idx} className={`rounded-2xl border p-5 flex flex-col justify-between ${path.bgColor}`}>
                              <div>
                                <div className="flex items-center justify-between gap-3 mb-2">
                                  <h5 className={`font-black text-sm ${path.color}`}>{path.title}</h5>
                                  <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full ${path.iconColor} ${path.color}`}>
                                    Trung bình: {path.score.toFixed(1)}/10
                                  </span>
                                </div>
                                <p className="text-slate-600 text-xs font-semibold leading-relaxed mb-4">
                                  {path.desc}
                                </p>
                                <div className="space-y-2.5">
                                  {path.steps.map((step, sIdx) => (
                                    <div key={sIdx} className="flex items-start gap-2.5">
                                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-bold text-slate-500 border border-slate-200">
                                        {sIdx + 1}
                                      </span>
                                      <span className="text-slate-700 text-xs font-medium pt-0.5 leading-relaxed">
                                        {step}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </>
          )}
        </div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="lg:col-span-1 space-y-6"
        >
          {/* CTA Khung Tím - Cột phải */}
          <div className="bg-gradient-to-br from-violet-700 to-indigo-900 rounded-3xl p-6 text-white shadow-[0_15px_30px_rgba(124,58,237,0.2)] relative overflow-hidden">
            <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 rounded-full bg-white opacity-10"></div>
            <h2 className="text-xl font-bold mb-2 relative z-10">Giả lập phỏng vấn thực tế</h2>
            <p className="text-violet-100 text-sm mb-6 font-medium leading-relaxed relative z-10">
              Trải nghiệm môi trường phỏng vấn chuyên nghiệp với AI. Tùy chỉnh câu hỏi theo CV và nhận đánh giá chi tiết ngay sau khi hoàn thành.
            </p>
            <Link
              to="/dashboard"
              className="inline-flex items-center justify-center w-full gap-2 bg-white text-violet-700 px-5 py-3 rounded-xl font-bold hover:bg-violet-50 transition-colors shadow-sm relative z-10"
            >
              <PlusIcon className="w-5 h-5 stroke-[2.5]" />
              Tạo phiên mới
            </Link>
          </div>

          <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 border border-slate-100 shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
            <h2 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2">
              <ChartBarIcon className="w-6 h-6 text-violet-500" />
              4 tiêu chí <span className="text-violet-600">đánh giá</span>
            </h2>

            <div className="relative h-[180px]">
              <AnimatePresence mode="wait">
                {(() => {
                  const item = EVALUATION_CRITERIA[activeCriterion];
                  const Icon = item.Icon;
                  return (
                    <motion.div
                      key={activeCriterion}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      transition={{ duration: 0.3 }}
                      className="absolute inset-0 bg-gradient-to-br from-white to-slate-50 rounded-2xl p-6 border border-slate-100 shadow-[0_4px_15px_rgba(0,0,0,0.02)] flex flex-col justify-center overflow-hidden"
                    >
                      <div className="absolute top-2 right-4 text-6xl font-black text-slate-100/60 select-none z-0">
                        {item.num}
                      </div>
                      <div className="relative z-10">
                        <div className="flex items-start gap-3 mb-3">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-inner ${item.bg}`}>
                            <Icon className={`w-6 h-6 ${item.color}`} strokeWidth={2.5} />
                          </div>
                          <div>
                            <h3 className="font-extrabold text-slate-800 text-base">{item.title}</h3>
                            <div className={`px-2 py-0.5 mt-1 rounded-full text-[10px] font-bold uppercase tracking-wider inline-block ${item.bg} ${item.color}`}>
                              {item.label}
                            </div>
                          </div>
                        </div>
                        <p className="text-slate-600 text-sm font-medium leading-relaxed">
                          {item.desc}
                        </p>
                      </div>
                    </motion.div>
                  );
                })()}
              </AnimatePresence>
            </div>

            <div className="flex justify-center gap-3 mt-6">
              {EVALUATION_CRITERIA.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveCriterion(idx)}
                  className={`h-2.5 rounded-full transition-all duration-300 shadow-inner ${idx === activeCriterion ? "w-8 bg-violet-600" : "w-2.5 bg-slate-200 hover:bg-violet-400"
                    }`}
                  aria-label={`Xem tiêu chí ${idx + 1}`}
                />
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
