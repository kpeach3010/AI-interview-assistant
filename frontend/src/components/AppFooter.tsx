import { Link } from "react-router-dom";

export default function AppFooter() {
  return (
    <footer style={{
      background: "#f1f5f9",
      borderTop: "1px solid #e2e8f0",
    }}>
      <div style={{
        maxWidth: 1200, margin: "0 auto",
        padding: "1.25rem 2rem",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: "0.75rem",
      }}>
        {/* Logo + copyright */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7,
            background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "white", fontWeight: 900, fontSize: 11, flexShrink: 0,
          }}>AI</div>
          <span style={{ fontSize: 13, color: "#94a3b8" }}>
            © {new Date().getFullYear()} AI Interview Assistant
          </span>
        </div>

        {/* Links */}
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 13 }}>
          <Link to="/" style={{ color: "#64748b", textDecoration: "none" }}>Trang chủ</Link>
          <Link to="/dashboard" style={{ color: "#64748b", textDecoration: "none" }}>Tạo phiên</Link>
          <Link to="/history" style={{ color: "#64748b", textDecoration: "none" }}>Lịch sử</Link>
        </div>
      </div>
    </footer>
  );
}
