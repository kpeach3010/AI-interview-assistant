import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { HomeIcon, ChartBarIcon, ClockIcon } from "@heroicons/react/24/outline";
import React from "react";

export default function AppHeader() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const NavItem = ({ to, icon: Icon, label }: { to: string, icon: any, label: string }) => {
    const isActive = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
    return (
      <Link to={to} style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "6px 14px 6px 16px",
        borderRadius: 9999,
        background: isActive ? "#f3f0ff" : "#f8fafc",
        color: isActive ? "#7c3aed" : "#475569",
        fontWeight: isActive ? 600 : 500,
        fontSize: 14,
        textDecoration: "none",
        transition: "background 0.2s, color 0.2s"
      }}>
        <span>{label}</span>
        <Icon style={{ width: 16, height: 16, strokeWidth: 2.5, color: isActive ? "#7c3aed" : "#64748b" }} />
      </Link>
    );
  };

  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 50,
      background: "#ffffff",
      borderBottom: "1px solid #f1f5f9",
      padding: "12px 0",
    }}>
      <div style={{
        maxWidth: 1200, margin: "0 auto",
        padding: "0 2rem",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        {/* Logo */}
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <div style={{
            width: 28, height: 28, borderRadius: "50%",
            background: "linear-gradient(135deg, #1e293b, #0f172a)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "white", fontWeight: 900, fontSize: 11,
            flexShrink: 0,
          }}>AI</div>
          <span style={{ fontWeight: 700, fontSize: 15, color: "#334155" }}>
            AI Interview <span style={{ color: "#7c3aed" }}>Assistant</span>
          </span>
        </Link>

        {/* Center Nav */}
        <nav style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <NavItem to="/" icon={HomeIcon} label="Trang chủ" />
          {user && (
            <>
              <NavItem to="/dashboard" icon={ChartBarIcon} label="Tạo phiên" />
              <NavItem to="/history" icon={ClockIcon} label="Lịch sử" />
            </>
          )}
        </nav>

        {/* Right Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {user ? (
            <>
              <span style={{ fontSize: 13, color: "#64748b", fontWeight: 500 }}>{user.email}</span>
              <button onClick={handleSignOut} style={{
                background: "#f1f5f9", color: "#475569", border: "none",
                padding: "6px 14px", borderRadius: 9999, fontSize: 13, fontWeight: 600,
                cursor: "pointer", transition: "background 0.2s"
              }}>
                Đăng xuất
              </button>
            </>
          ) : (
            <>
              <Link to="/login" style={{
                fontSize: 14, fontWeight: 600, color: "#475569", textDecoration: "none",
                padding: "8px 16px", borderRadius: 9999, transition: "background 0.2s"
              }}>Đăng nhập</Link>
              <Link to="/register" style={btnDarkStyle}>Đăng ký</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

const btnDarkStyle: React.CSSProperties = {
  padding: "8px 20px",
  borderRadius: 9999,
  fontWeight: 600,
  fontSize: 14,
  background: "#0f172a",
  color: "white",
  textDecoration: "none",
  border: "none",
  cursor: "pointer",
  transition: "background 0.2s",
};
