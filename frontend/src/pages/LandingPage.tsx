import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  SparklesIcon,
  ArrowRightIcon,
  ChevronDownIcon,
  CloudArrowUpIcon,
  AdjustmentsHorizontalIcon,
  ChatBubbleLeftRightIcon,
  CheckIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Link } from "react-router-dom";
import AppFooter from "../components/AppFooter";
import AppHeader from "../components/AppHeader";
import { useAuth } from "../contexts/AuthContext";

const FAQ_ITEMS = [
  {
    q: "AI Interview Assistant hoạt động như thế nào?",
    a: "Bạn tải lên CV và mô tả công việc (JD), hệ thống AI sẽ phân tích và tạo ra 10–15 câu hỏi phỏng vấn cá nhân hoá. Sau đó bạn thực hiện phỏng vấn thoại hoặc văn bản trực tiếp với AI. Khi hoàn thành, bạn nhận được báo cáo đánh giá chi tiết kèm đề xuất cải thiện CV.",
  },
  {
    q: "Tôi có cần tải app hay cài đặt gì không?",
    a: "Không. AI Interview Assistant hoạt động hoàn toàn trên trình duyệt web — không cần cài đặt, không cần plugin. Bạn chỉ cần đăng ký tài khoản miễn phí và bắt đầu luyện tập ngay.",
  },
  {
    q: "Hỗ trợ những ngôn ngữ nào?",
    a: "Hệ thống hỗ trợ đầy đủ cả Tiếng Việt và Tiếng Anh (English). Bạn có thể chọn ngôn ngữ phỏng vấn khi tạo phiên. AI sẽ đặt câu hỏi và đánh giá câu trả lời theo ngôn ngữ bạn chọn.",
  },
  {
    q: "Tôi có thể upload định dạng CV nào?",
    a: "Hệ thống hỗ trợ file PDF và DOCX. Đảm bảo CV của bạn có nội dung text (không phải ảnh scan) để AI có thể phân tích chính xác nhất.",
  },
  {
    q: "Báo cáo đánh giá gồm những gì?",
    a: "Báo cáo chi tiết bao gồm: điểm số theo 4 tiêu chí (Nội dung, Độ liên quan, Tính đầy đủ, Trình bày), nhận xét từng câu trả lời kèm câu trả lời mẫu, điểm mạnh/yếu tổng quan, và các đề xuất cụ thể để nâng cấp CV phù hợp với vị trí ứng tuyển.",
  },
  {
    q: "Dịch vụ có hoàn toàn miễn phí không?",
    a: "Hiện tại AI Interview Assistant hoàn toàn miễn phí để sử dụng. Bạn có thể tạo nhiều phiên phỏng vấn, xem lịch sử và tải báo cáo mà không mất phí.",
  },
];

const SOLUTIONS = [
  {
    num: "01",
    title: "Phân tích CV & JD",
    metric: "95% Tiết kiệm",
    desc: "AI tự động bóc tách kỹ năng, kinh nghiệm và so khớp với mô tả công việc. Nhận diện các điểm mạnh và điểm thiếu hụt so với vị trí ứng tuyển.",
    testimonial: "Nhờ AI chỉ ra điểm thiếu sót, tôi đã sửa lại CV của mình và nhận được lời mời phỏng vấn chỉ sau 3 ngày nộp hồ sơ.",
    author: "Nguyễn Văn A",
    role: "Front-end Developer",
    image: "/slide/1.png",
  },
  {
    num: "02",
    title: "Phỏng vấn thoại AI",
    metric: "100% Thực tế",
    desc: "Hội thoại trực tiếp bằng giọng nói tự nhiên giống buổi phỏng vấn online thực tế. AI đặt câu hỏi thông minh, đào sâu và hỗ trợ song ngữ.",
    testimonial: "Môi trường phỏng vấn nói chuyện trực tiếp giúp tôi đỡ run hơn rất nhiều. AI phản hồi nhanh và sửa phát âm cực tốt.",
    author: "Trần Thị B",
    role: "Marketing Specialist",
    image: "/slide/2.jpg",
  },
  {
    num: "03",
    title: "Đánh giá & Gợi ý sửa",
    metric: "4 Tiêu chí",
    desc: "Chấm điểm chi tiết 4 tiêu chí chuẩn quốc tế: Nội dung, Sự liên quan, Tính đầy đủ, Trình bày. Kèm câu trả lời mẫu hoàn hảo.",
    testimonial: "Báo cáo chấm điểm cực kỳ chi tiết, chỉ ra rõ lỗi sai và gợi ý luôn cả câu trả lời mẫu hoàn hảo để tôi học tập.",
    author: "Lê Hoàng C",
    role: "Data Analyst",
    image: "/slide/1.png",
  }
];

export default function LandingPage() {
  const { user } = useAuth();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [activeSolution, setActiveSolution] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setProgress(0);
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          setActiveSolution(curr => (curr + 1) % SOLUTIONS.length);
          return 0;
        }
        return prev + 2.5; // Increments to 100 over 4 seconds
      });
    }, 100);
    return () => clearInterval(interval);
  }, [activeSolution]);

  return (
    <>
      {/* Google Fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        * { font-family: 'Inter', sans-serif; }

        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes floatUpDown {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-10px); }
        }
        .anim-hero   { animation: fadeSlideUp 0.7s ease both; }
        .anim-delay1 { animation-delay: 0.1s; }
        .anim-delay2 { animation-delay: 0.2s; }
        .anim-delay3 { animation-delay: 0.35s; }
        .anim-delay4 { animation-delay: 0.5s; }
        .hero-img    { animation: floatUpDown 4s ease-in-out infinite; }
        .feature-card:hover { border-color: #7c3aed; transform: translateY(-4px); }
        .feature-card { transition: border-color 0.2s, transform 0.25s; }
        .btn-primary  { transition: background 0.2s, transform 0.15s, box-shadow 0.2s; }
        .btn-primary:hover  { background: #6d28d9; transform: translateY(-1px); box-shadow: 0 8px 24px rgba(124,58,237,0.35); }
        .btn-ghost:hover { background: #f3f0ff; }
        .faq-answer {
          overflow: hidden;
          transition: max-height 0.35s ease, opacity 0.3s ease;
          max-height: 0;
          opacity: 0;
        }
        .faq-answer.open {
          max-height: 400px;
          opacity: 1;
        }
        .faq-chevron { transition: transform 0.3s ease; }
        .faq-chevron.open { transform: rotate(180deg); }
        .faq-row { cursor: pointer; transition: background 0.15s; }
        .faq-row:hover { background: #faf5ff; }
        .carousel-btn-prev:hover, .carousel-btn-next:hover {
          transform: translateY(-50%) scale(1.08) !important;
          background: rgba(255, 255, 255, 0.95) !important;
          box-shadow: 0 12px 36px rgba(124, 58, 237, 0.25), 0 2px 4px rgba(0,0,0,0.05) !important;
        }
        .carousel-btn-prev:active, .carousel-btn-next:active {
          transform: translateY(-50%) scale(0.95) !important;
        }
        .guide-card:hover {
          transform: translateY(-6px);
          border-color: #c4b5fd !important;
          box-shadow: 0 20px 40px rgba(124, 58, 237, 0.08) !important;
        }
        @media (min-width: 1024px) {
          .step-connector {
            display: flex !important;
          }
        }
        @media (max-width: 1023px) {
          .step-connector {
            display: none !important;
          }
        }
        .comp-card {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .comp-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 30px rgba(0,0,0,0.03) !important;
        }
        .comp-card-active {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .comp-card-active:hover {
          transform: translateY(-8px) scale(1.01);
          box-shadow: 0 20px 40px rgba(124, 58, 237, 0.15) !important;
        }
      `}</style>

      <div style={{ minHeight: "100vh", background: "#ffffff", color: "#0f172a", lineHeight: 1.6 }}>

        <AppHeader />

        {/* ── HERO SECTION ── */}
        <section style={{
          position: "relative",
          maxWidth: 1400, margin: "0 auto", padding: "3rem 2rem 6rem",
          minHeight: "calc(100vh - 68px)",
          display: "flex", flexDirection: "column", alignItems: "center"
        }}>

          {/* Main Headline */}
          <div style={{ textAlign: "center", marginBottom: "3rem", maxWidth: 1200, position: "relative", zIndex: 5 }}>
            <h1 className="anim-hero anim-delay1" style={{
              fontSize: "clamp(2.5rem, 5vw, 4.2rem)", fontWeight: 900,
              lineHeight: 1.3, letterSpacing: -1.5, color: "#0f172a", margin: 0
            }}>
              Nâng cấp kỹ năng phỏng vấn cùng{" "}
              <span style={{
                display: "inline-block", background: "#f3f0ff", borderRadius: 99,
                padding: "4px 24px", color: "#7c3aed", verticalAlign: "middle",
                fontSize: "clamp(2rem, 4.5vw, 3.8rem)", fontWeight: 900,
                whiteSpace: "nowrap"
              }}>AI interview assistant</span> mỗi ngày
            </h1>
          </div>

          {/* Carousel & Centered Overlay Container */}
          <div style={{ position: "relative", width: "100%", zIndex: 10, marginBottom: "4rem" }}>

            {/* Hero Image */}
            <div className="anim-hero anim-delay2 w-full max-w-[900px] mx-auto aspect-video rounded-3xl overflow-hidden bg-white flex items-center justify-center relative shadow-[0_20px_50px_rgba(124,58,237,0.18)]">
              <img
                src="/1.png"
                alt="Hero Illustration"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            </div>

            {/* Overlays Container (Responsive flexbox) */}
            <div className="absolute -bottom-10 md:-bottom-12 left-1/2 -translate-x-1/2 w-full max-w-[1100px] px-4 md:px-10 flex flex-col md:flex-row items-center justify-between gap-6 z-20 pointer-events-none">
              
              {/* Text Card */}
              <div className="anim-hero anim-delay3 w-full md:max-w-[420px] pointer-events-auto bg-white/85 backdrop-blur-xl p-5 md:p-6 rounded-3xl border border-white/60 shadow-[0_24px_48px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.05)] flex flex-col gap-3">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 0 4px rgba(16, 185, 129, 0.15)" }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#10b981", letterSpacing: 0.5, textTransform: "uppercase" }}>Sẵn sàng</span>
                </div>
                <p style={{ fontSize: 16, color: "#334155", lineHeight: 1.6, margin: 0, fontWeight: 500 }}>
                  Phân tích CV, luyện phỏng vấn thực tế và nhận <span style={{ color: "#7c3aed", fontWeight: 700 }}>đánh giá chi tiết</span> để tự tin hơn trên hành trình tìm việc.
                </p>
              </div>

              {/* Buttons */}
              <div className="anim-hero anim-delay3 flex flex-wrap justify-center gap-3 pointer-events-auto w-full md:w-auto">
                {user ? (
                  <Link to="/dashboard" style={{
                    background: "linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)", color: "white", padding: "14px 28px",
                    borderRadius: 99, fontWeight: 600, fontSize: 15, textDecoration: "none",
                    boxShadow: "0 10px 25px rgba(124, 58, 237, 0.3)",
                    transition: "transform 0.15s, opacity 0.2s"
                  }} className="btn-primary w-full sm:w-auto text-center">
                    Tạo phiên phỏng vấn ↗
                  </Link>
                ) : (
                  <>
                    <Link to="/register" style={{
                      background: "linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)", color: "white", padding: "14px 28px",
                      borderRadius: 99, fontWeight: 600, fontSize: 15, textDecoration: "none",
                      boxShadow: "0 10px 25px rgba(124, 58, 237, 0.3)",
                      transition: "transform 0.15s, opacity 0.2s",
                      whiteSpace: "nowrap"
                    }} className="btn-primary w-full sm:w-auto text-center">
                      Luyện tập miễn phí ↗
                    </Link>
                    <Link to="/login" style={{
                      background: "rgba(255,255,255,0.9)", backdropFilter: "blur(12px)",
                      color: "#475569", padding: "14px 24px",
                      borderRadius: 99, fontWeight: 600, fontSize: 15, textDecoration: "none",
                      border: "1.5px solid #e2e8f0", boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                      transition: "background 0.2s"
                    }} className="btn-ghost w-full sm:w-auto text-center">
                      Đăng nhập
                    </Link>
                  </>
                )}
              </div>
            </div>

          </div>
        </section>

        {/* ── STATS BAR ── */}
        <section style={{ background: "#fafafa", borderTop: "1px solid #f1f5f9", borderBottom: "1px solid #f1f5f9" }}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center max-w-[1200px] mx-auto px-8 py-10">
            {[
              { num: "10–15 câu hỏi", label: "Câu hỏi cá nhân hoá từ CV của bạn" },
              { num: "2 ngôn ngữ", label: "Hỗ trợ Tiếng Việt & English" },
              { num: "4 tiêu chí", label: "Đánh giá Nội dung · Liên quan · Đầy đủ · Trình bày" },
            ].map(({ num, label }) => (
              <div key={num} style={{ padding: "1rem" }}>
                <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "#7c3aed", letterSpacing: -0.5 }}>{num}</div>
                <div style={{ fontSize: 14, color: "#64748b", marginTop: 4, fontWeight: 500 }}>{label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── FEATURE CARDS ── */}
        <section style={{ maxWidth: 1200, margin: "0 auto", padding: "5rem 2rem" }}>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start" style={{ gap: "2.5rem" }}>

            {/* Left Column - Large visual */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h2 style={{ fontSize: "2rem", fontWeight: 800, color: "#0f172a", letterSpacing: -0.5, margin: 0, paddingLeft: 16, borderLeft: "5px solid #3b82f6", lineHeight: 1.2 }}>
                  Khám phá <span style={{ color: "#7c3aed" }}>giải pháp</span>
                </h2>

              </div>

              <div style={{
                background: "#f8fafc",
                borderRadius: 32,
                overflow: "hidden",
                height: 480,
                position: "relative",
                boxShadow: "0 20px 40px rgba(0,0,0,0.03)",
                border: "1.5px solid #f1f5f9",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "2rem"
              }}>
                <img
                  src={SOLUTIONS[activeSolution].image}
                  alt={SOLUTIONS[activeSolution].title}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    borderRadius: 20,
                    transition: "all 0.5s ease"
                  }}
                />
              </div>
            </motion.div>

            {/* Right Column - Controls & Info cards */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
              style={{ display: "flex", flexDirection: "column", gap: "1.5rem", marginTop: "3.5rem" }}
            >

              {/* Step numbers & Thumbnails */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  {SOLUTIONS.map((item, idx) => {
                    const isActive = idx === activeSolution;
                    return (
                      <button
                        key={idx}
                        onClick={() => setActiveSolution(idx)}
                        style={{
                          background: "none",
                          border: "none",
                          padding: "8px 0",
                          cursor: "pointer",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "start",
                          width: 80,
                          textAlign: "left"
                        }}
                      >
                        <div style={{
                          fontSize: 13,
                          fontWeight: isActive ? 800 : 500,
                          color: isActive ? "#7c3aed" : "#94a3b8",
                          marginBottom: 4,
                          display: "flex",
                          alignItems: "center",
                          gap: 6
                        }}>
                          {item.num}
                          {isActive && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#7c3aed" }} />}
                        </div>
                        {/* Progress line */}
                        <div style={{ width: "100%", height: 3, background: "#e2e8f0", borderRadius: 99, overflow: "hidden" }}>
                          <div style={{
                            width: isActive ? `${progress}%` : "0%",
                            height: "100%",
                            background: "#7c3aed",
                            transition: isActive ? "none" : "width 0.3s ease"
                          }} />
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Thumbnails of inactive slides */}
                <div style={{ display: "flex", gap: 8 }}>
                  {SOLUTIONS.map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveSolution(idx)}
                      style={{
                        width: 56,
                        height: 38,
                        borderRadius: 8,
                        overflow: "hidden",
                        border: `2px solid ${idx === activeSolution ? "#7c3aed" : "transparent"}`,
                        padding: 0,
                        cursor: "pointer",
                        opacity: idx === activeSolution ? 1 : 0.6,
                        transition: "all 0.3s ease",
                        background: "#fff"
                      }}
                    >
                      <img src={item.image} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </button>
                  ))}
                </div>
              </div>

              {/* Main value/metric card */}
              <div style={{
                background: "#fbfbfe",
                borderRadius: 24,
                padding: "2.5rem",
                border: "1px solid #eef2ff",
                boxShadow: "0 10px 30px rgba(124,58,237,0.03)",
                position: "relative",
                transition: "all 0.3s ease"
              }}>
                <div style={{
                  fontSize: "2.8rem",
                  fontWeight: 900,
                  color: "#7c3aed",
                  letterSpacing: -1,
                  lineHeight: 1,
                  marginBottom: 16
                }}>
                  {SOLUTIONS[activeSolution].metric}
                </div>

                <h3 style={{ fontSize: "1.2rem", fontWeight: 800, color: "#0f172a", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                  {SOLUTIONS[activeSolution].title}
                  <span style={{ fontSize: 16 }}>↗</span>
                </h3>

                <p style={{ fontSize: 14, color: "#64748b", lineHeight: 1.7, margin: 0, fontWeight: 500 }}>
                  {SOLUTIONS[activeSolution].desc}
                </p>
              </div>

              {/* Founder quote/testimonial card */}
              <div style={{
                background: "#f0fdf4",
                borderRadius: 24,
                padding: "1.8rem 2rem",
                border: "1px solid #dcfce7",
                display: "flex",
                gap: 16,
                alignItems: "start",
                transition: "all 0.3s ease"
              }}>
                <div style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  background: "#16a34a",
                  color: "white",
                  fontSize: 18,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0
                }}>
                  {SOLUTIONS[activeSolution].author[0]}
                </div>
                <div>
                  <p style={{ fontSize: 14, color: "#14532d", fontStyle: "italic", margin: "0 0 10px 0", lineHeight: 1.6, fontWeight: 500 }}>
                    "{SOLUTIONS[activeSolution].testimonial}"
                  </p>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#166534" }}>
                    {SOLUTIONS[activeSolution].author} <span style={{ color: "#3f6212", fontWeight: 500, fontSize: 12 }}>— {SOLUTIONS[activeSolution].role}</span>
                  </div>
                </div>
              </div>

            </motion.div>

          </div>
        </section>

        {/* ── GUIDE SECTION ── */}
        <motion.section 
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          style={{ maxWidth: 1200, margin: "0 auto", padding: "5rem 2rem 7rem" }}>
          <div style={{ textAlign: "right", marginBottom: "4rem", display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <h2 style={{ fontSize: "2.6rem", fontWeight: 900, color: "#0f172a", letterSpacing: -1, margin: "0 0 1rem", maxWidth: 600, lineHeight: 1.2, paddingRight: 16, borderRight: "5px solid #3b82f6" }}>
              <span style={{ color: "#7c3aed", position: "relative", whiteSpace: "nowrap" }}>
                3 bước
                <svg width="100%" height="12" viewBox="0 0 100 12" preserveAspectRatio="none" style={{ position: "absolute", bottom: 0, left: 0, zIndex: -1 }}>
                  <path d="M2 9 Q 50 12 98 6" stroke="#c4b5fd" strokeWidth="4" fill="transparent" strokeLinecap="round" />
                </svg>
              </span> để bắt đầu phỏng vấn
            </h2>
            <p style={{ color: "#64748b", fontSize: "1.05rem", maxWidth: 520, margin: 0, fontWeight: 500, lineHeight: 1.6 }}>
              Tải CV, chọn vị trí ứng tuyển và thực hành với các câu hỏi<br />
              được cá nhân hóa theo kinh nghiệm và yêu cầu công việc.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "2.5rem", position: "relative" }}>
            {[
              {
                num: "01",
                label: "BƯỚC 01",
                title: "Tải lên CV & Mô tả công việc",
                desc: "Chỉ cần đăng nhập và tải lên hồ sơ CV (dạng PDF/Word) cùng mô tả công việc (JD) của vị trí bạn muốn ứng tuyển.",
                Icon: CloudArrowUpIcon,
                color: "#7c3aed",
                bg: "#f3f0ff"
              },
              {
                num: "02",
                label: "BƯỚC 02",
                title: "Thiết lập cấu hình phỏng vấn",
                desc: "Lựa chọn ngôn ngữ trả lời (Tiếng Việt/Tiếng Anh), lựa chọn cấp độ kinh nghiệm (Junior/Senior) và tùy chỉnh giới hạn thời gian phù hợp.",
                Icon: AdjustmentsHorizontalIcon,
                color: "#10b981",
                bg: "#f0fdf4"
              },
              {
                num: "03",
                label: "BƯỚC 03",
                title: "Hội thoại thoại & Nhận kết quả",
                desc: "Trực tiếp trò chuyện bằng giọng nói tự nhiên với AI. Khi kết thúc, nhận ngay báo cáo đánh giá chi tiết kèm mẹo sửa CV.",
                Icon: ChatBubbleLeftRightIcon,
                color: "#f59e0b",
                bg: "#fff7ed"
              }
            ].map(({ num, label, title, desc, Icon, color, bg }, idx) => (
              <div key={num} className="guide-card" style={{
                background: "white",
                borderRadius: 24,
                padding: "2.5rem 2rem",
                border: "1px solid #e2e8f0",
                boxShadow: "0 4px 20px rgba(0,0,0,0.01)",
                position: "relative",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                zIndex: 5,
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start"
              }}>
                {/* Step labels representing sequential order explicitly */}
                <div style={{
                  background: bg,
                  color: color,
                  padding: "4px 14px",
                  borderRadius: 99,
                  fontSize: 11,
                  fontWeight: 800,
                  marginBottom: "1.5rem",
                  letterSpacing: 0.5
                }}>
                  {label}
                </div>

                {/* Large Background Step Number */}
                <div style={{
                  position: "absolute",
                  top: 20,
                  right: 24,
                  fontSize: "5.5rem",
                  fontWeight: 900,
                  color: "#f8fafc",
                  lineHeight: 1,
                  userSelect: "none",
                  zIndex: -1
                }}>
                  {num}
                </div>

                {/* Icon Circle */}
                <div style={{
                  width: 64,
                  height: 64,
                  borderRadius: 20,
                  background: bg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "1.5rem",
                  boxShadow: `0 8px 20px rgba(0, 0, 0, 0.02)`
                }}>
                  <Icon style={{ width: 30, height: 30, color: color, strokeWidth: 1.8 }} />
                </div>

                <h3 style={{
                  fontSize: "1.15rem",
                  fontWeight: 800,
                  color: "#0f172a",
                  marginBottom: 12,
                  letterSpacing: -0.3,
                  lineHeight: 1.4
                }}>
                  {title}
                </h3>

                <p style={{
                  fontSize: 14,
                  color: "#64748b",
                  lineHeight: 1.7,
                  margin: 0,
                  fontWeight: 500
                }}>
                  {desc}
                </p>

                {/* Desktop Step Sequence Connectors */}
                {idx < 2 && (
                  <div className="step-connector" style={{
                    width: 36, height: 36, borderRadius: "50%",
                    background: "white",
                    border: "1.5px solid #e2e8f0",
                    boxShadow: "0 4px 10px rgba(0,0,0,0.05)",
                    display: "none", alignItems: "center", justifyContent: "center",
                    position: "absolute", right: -18, top: "50%",
                    transform: "translate(50%, -50%)",
                    zIndex: 10
                  }}>
                    <ArrowRightIcon style={{ width: 18, height: 18, color: "#7c3aed", strokeWidth: 2.5 }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </motion.section>

        {/* ── COMPARISON SECTION ── */}
        <motion.section 
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          style={{ maxWidth: 1000, margin: "0 auto", padding: "5rem 2rem 8rem" }}>
          <div style={{ textAlign: "center", marginBottom: "4rem" }}>
            <h2 style={{ fontSize: "2.2rem", fontWeight: 900, color: "#0f172a", letterSpacing: -0.8, margin: "0 0 1rem", position: "relative", display: "inline-block" }}>
              Một sự chuẩn bị <span style={{ color: "#7c3aed" }}>khác biệt hoàn toàn</span>
              <div style={{ position: "absolute", bottom: -10, left: "50%", transform: "translateX(-50%)", width: "85%", height: 4, background: "#3b82f6", borderRadius: 4 }} />
            </h2>
            <p style={{ color: "#64748b", fontSize: "1.05rem", maxWidth: 540, margin: "0 auto", fontWeight: 500, paddingTop: 8 }}>
              So sánh hiệu quả giữa cách luyện tập truyền thống và luyện tập thông minh cùng AI.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "2.5rem", alignItems: "stretch" }}>

            {/* Traditional Practice Card */}
            <div className="comp-card" style={{
              background: "#fafbfd",
              borderRadius: 28,
              padding: "3rem 2.5rem",
              border: "1px solid #e2e8f0",
              boxShadow: "0 4px 12px rgba(0,0,0,0.01)",
              opacity: 0.85,
              display: "flex",
              flexDirection: "column"
            }}>
              <h3 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#475569", marginBottom: 10 }}>
                Tự luyện tập truyền thống
              </h3>
              <p style={{ fontSize: 14, color: "#94a3b8", marginBottom: "2.5rem", lineHeight: 1.6 }}>
                Cách chuẩn bị quen thuộc trước gương hoặc đọc tài liệu lý thuyết trên mạng.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", flexGrow: 1 }}>
                {[
                  "Tự đoán lỗi sai, không có bất kỳ phản hồi chuyên sâu nào.",
                  "Câu hỏi rập khuôn, chung chung, không sát với CV và mô tả công việc (JD).",
                  "Cảm giác cô đơn và dễ nản chí vì tự độc thoại một mình.",
                  "Tốn thời gian tự tổng hợp kiến thức mà không biết hiệu quả thực tế."
                ].map((text, i) => (
                  <div key={i} style={{ display: "flex", gap: 12, alignItems: "start" }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: "50%", background: "#f1f5f9",
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2
                    }}>
                      <XMarkIcon style={{ width: 14, height: 14, color: "#94a3b8", strokeWidth: 3 }} />
                    </div>
                    <span style={{ fontSize: 14, color: "#64748b", lineHeight: 1.5, fontWeight: 500 }}>{text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Assistant Card (Highlighted) */}
            <div className="comp-card-active" style={{
              background: "white",
              borderRadius: 28,
              padding: "3rem 2.5rem",
              border: "2px solid #7c3aed",
              boxShadow: "0 20px 40px rgba(124, 58, 237, 0.08)",
              position: "relative",
              display: "flex",
              flexDirection: "column"
            }}>
              {/* Highlight Badge */}
              <div style={{
                position: "absolute", top: -16, left: "50%", transform: "translateX(-50%)",
                background: "linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)",
                color: "white", padding: "6px 20px", borderRadius: 99,
                fontSize: 11, fontWeight: 800, letterSpacing: 0.8,
                boxShadow: "0 8px 20px rgba(124, 58, 237, 0.25)",
                display: "flex", alignItems: "center", gap: 6,
                whiteSpace: "nowrap"
              }}>
                <SparklesIcon style={{ width: 14, height: 14, color: "white", strokeWidth: 2.5 }} />
                KHUYÊN DÙNG CHO ỨNG VIÊN
              </div>

              <h3 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#0f172a", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                AI Interview Assistant
              </h3>
              <p style={{ fontSize: 14, color: "#64748b", marginBottom: "2.5rem", lineHeight: 1.6 }}>
                Giải pháp luyện tập phỏng vấn thực chiến thông minh mang tính cá nhân hoá tối đa.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", flexGrow: 1, marginBottom: "2.5rem" }}>
                {[
                  "Chấm điểm chi tiết ngay lập tức theo 4 tiêu chí chuẩn quốc tế.",
                  "Hệ thống tự động phân tích CV & JD để đưa ra câu hỏi của riêng bạn.",
                  "Hội thoại bằng giọng nói tự nhiên, hỗ trợ song ngữ Việt - Anh 24/7.",
                  "Đề xuất đáp án mẫu hoàn hảo và chỉ dẫn sửa lỗi từng câu trả lời."
                ].map((text, i) => (
                  <div key={i} style={{ display: "flex", gap: 12, alignItems: "start" }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: "50%", background: "#f3f0ff",
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2
                    }}>
                      <CheckIcon style={{ width: 14, height: 14, color: "#7c3aed", strokeWidth: 3 }} />
                    </div>
                    <span style={{ fontSize: 14, color: "#475569", lineHeight: 1.5, fontWeight: 600 }}>{text}</span>
                  </div>
                ))}
              </div>

              <Link to="/register" style={{
                background: "linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)",
                color: "white", textAlign: "center", padding: "12px 24px", borderRadius: 12,
                fontWeight: 700, fontSize: 14, textDecoration: "none",
                boxShadow: "0 8px 20px rgba(124, 58, 237, 0.2)",
                transition: "opacity 0.2s"
              }} className="btn-primary">
                Trải nghiệm miễn phí ngay ↗
              </Link>
            </div>

          </div>
        </motion.section>

        {/* ── FAQ SECTION ── */}
        <motion.section 
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          style={{ maxWidth: 800, margin: "0 auto", padding: "0 2rem 5rem" }}>
          <div style={{ textAlign: "center", marginBottom: "3rem" }}>
            <h2 style={{ fontSize: "2rem", fontWeight: 800, color: "#0f172a", letterSpacing: -0.5, margin: "0 0 0.75rem" }}>
              Câu hỏi{" "}
              <span style={{ color: "#7c3aed" }}>thường gặp</span>
            </h2>
            <p style={{ color: "#64748b", fontSize: "1.05rem", margin: 0 }}>
              Chưa rõ điều gì? Chúng tôi đã chuẩn bị sẵn câu trả lời.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {FAQ_ITEMS.map((item, idx) => (
              <div key={idx} style={{
                borderRadius: 14,
                border: `1.5px solid ${openFaq === idx ? "#c4b5fd" : "#f1f5f9"}`,
                background: openFaq === idx ? "#faf5ff" : "white",
                overflow: "hidden",
                boxShadow: openFaq === idx
                  ? "0 4px 20px rgba(124,58,237,0.08)"
                  : "0 1px 4px rgba(0,0,0,0.04)",
                transition: "border-color 0.2s, box-shadow 0.2s, background 0.2s",
              }}>
                {/* Question row */}
                <button
                  className="faq-row"
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center",
                    justifyContent: "space-between", gap: 16,
                    padding: "1.1rem 1.5rem",
                    background: "transparent", border: "none", cursor: "pointer",
                    textAlign: "left",
                  }}
                  aria-expanded={openFaq === idx}
                >
                  <span style={{
                    fontSize: "1rem", fontWeight: 600,
                    color: openFaq === idx ? "#7c3aed" : "#0f172a",
                    lineHeight: 1.5, transition: "color 0.2s"
                  }}>
                    {item.q}
                  </span>
                  <ChevronDownIcon
                    className={`faq-chevron${openFaq === idx ? " open" : ""}`}
                    style={{
                      width: 20, height: 20, flexShrink: 0,
                      color: openFaq === idx ? "#7c3aed" : "#94a3b8",
                      transition: "color 0.2s"
                    }}
                  />
                </button>

                {/* Answer */}
                <div className={`faq-answer${openFaq === idx ? " open" : ""}`}>
                  <p style={{
                    margin: 0, padding: "0 1.5rem 1.25rem",
                    fontSize: 15, color: "#475569", lineHeight: 1.75
                  }}>
                    {item.a}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </motion.section>

        {/* ── CTA BANNER ── */}
        <motion.section 
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          style={{ maxWidth: 1200, margin: "0 auto", padding: "0 2rem 5rem" }}>
          <div style={{
            background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 60%, #0ea5e9 100%)",
            borderRadius: 24, padding: "3.5rem 3rem",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            flexWrap: "wrap", gap: "2rem",
            boxShadow: "0 20px 60px rgba(124,58,237,0.25)"
          }}>
            <div>
              <h2 style={{ fontSize: "1.7rem", fontWeight: 800, color: "white", margin: "0 0 8px", letterSpacing: -0.5 }}>
                Sẵn sàng chinh phục buổi phỏng vấn?
              </h2>
              <p style={{ color: "rgba(255,255,255,0.8)", fontSize: "1rem", margin: 0 }}>
                Đăng ký miễn phí ngay hôm nay. Không cần thẻ tín dụng.
              </p>
            </div>
            <Link to="/register" style={{
              padding: "14px 32px", borderRadius: 10, fontWeight: 700, fontSize: 15,
              background: "white", color: "#7c3aed", textDecoration: "none",
              boxShadow: "0 4px 16px rgba(0,0,0,0.15)", whiteSpace: "nowrap",
              display: "inline-flex", alignItems: "center", gap: 8,
              transition: "transform 0.15s, box-shadow 0.2s"
            }} className="btn-ghost">
              Bắt đầu ngay
              <ArrowRightIcon style={{ width: 16, height: 16, strokeWidth: 2.5 }} />
            </Link>
          </div>
        </motion.section>

        <AppFooter />

      </div>
    </>
  );
}
