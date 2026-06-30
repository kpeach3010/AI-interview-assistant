import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { HomeIcon, ChartBarIcon, ClockIcon, Bars3Icon, XMarkIcon, ArrowRightOnRectangleIcon } from "@heroicons/react/24/outline";
import React, { useState } from "react";

const NavItem = ({ 
  icon: Icon, 
  label, 
  isActive, 
  onClick 
}: { 
  icon: React.ComponentType<{ className?: string }>, 
  label: string, 
  isActive: boolean, 
  onClick: () => void 
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-full transition-colors font-medium text-sm w-full md:w-auto ${
        isActive ? "bg-violet-100 text-violet-600" : "bg-slate-50 text-slate-600 hover:bg-slate-100"
      }`}
    >
      <span>{label}</span>
      <Icon className={`w-4 h-4 stroke-[2.5px] ${isActive ? "text-violet-600" : "text-slate-500"}`} />
    </button>
  );
};

export default function AppHeader() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const getIsActive = (to: string) => location.pathname === to || (to !== "/" && location.pathname.startsWith(to));
  
  const handleNavClick = (to: string) => {
    navigate(to);
    setIsMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-[100] bg-white border-b border-slate-100 py-2 md:py-0">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 md:h-16 relative">
          {/* Logo (Left Side) */}
          <div className="flex-1 flex items-center justify-start">
            <Link to="/" className="flex items-center gap-2.5 no-underline shrink-0">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center text-white font-black text-[11px] shrink-0">AI</div>
              <span className="font-bold text-[15px] text-slate-700">
                AI Interview <span className="text-violet-600">Assistant</span>
              </span>
            </Link>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center">
            <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2 text-slate-600 hover:bg-slate-100 rounded-md transition-colors">
              {isMenuOpen ? <XMarkIcon className="w-6 h-6" /> : <Bars3Icon className="w-6 h-6" />}
            </button>
          </div>

          {/* Desktop Center Nav (Absolute Centered) */}
          <nav className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 items-center gap-2">
            <NavItem isActive={getIsActive("/")} onClick={() => handleNavClick("/")} icon={HomeIcon} label="Trang chủ" />
            {user && (
              <>
                <NavItem isActive={getIsActive("/dashboard")} onClick={() => handleNavClick("/dashboard")} icon={ChartBarIcon} label="Tạo phiên" />
                <NavItem isActive={getIsActive("/history")} onClick={() => handleNavClick("/history")} icon={ClockIcon} label="Lịch sử" />
              </>
            )}
          </nav>

          {/* Desktop Right Actions */}
          <div className="hidden md:flex flex-1 items-center justify-end gap-4">
            {user ? (
              <>
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-full p-1 pr-3 transition-colors hover:border-slate-200">
                  <div className="w-7 h-7 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center font-bold text-[11px] uppercase shrink-0">
                    {user.email?.[0] || 'U'}
                  </div>
                  <span className="text-[13px] text-slate-600 font-medium max-w-[140px] truncate" title={user.email || ""}>
                    {user.email}
                  </span>
                  <div className="w-px h-4 bg-slate-200 mx-1"></div>
                  <button 
                    onClick={handleSignOut} 
                    className="text-slate-400 hover:text-red-500 transition-colors flex items-center justify-center p-1 rounded-full hover:bg-red-50"
                    title="Đăng xuất"
                  >
                    <ArrowRightOnRectangleIcon className="w-4 h-4 stroke-[2.5px]" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <Link to="/login" className="text-sm font-semibold text-slate-600 px-4 py-2 rounded-full hover:bg-slate-50 transition-colors">Đăng nhập</Link>
                <Link to="/register" className="px-5 py-2 rounded-full font-semibold text-sm bg-slate-900 text-white hover:bg-slate-800 transition-colors">Đăng ký</Link>
              </>
            )}
          </div>
        </div>

        {/* Mobile Menu Content */}
        {isMenuOpen && (
          <div className="md:hidden border-t border-slate-100 py-4 space-y-4">
            <nav className="flex flex-col gap-2">
              <NavItem isActive={getIsActive("/")} onClick={() => handleNavClick("/")} icon={HomeIcon} label="Trang chủ" />
              {user && (
                <>
                  <NavItem isActive={getIsActive("/dashboard")} onClick={() => handleNavClick("/dashboard")} icon={ChartBarIcon} label="Tạo phiên" />
                  <NavItem isActive={getIsActive("/history")} onClick={() => handleNavClick("/history")} icon={ClockIcon} label="Lịch sử" />
                </>
              )}
            </nav>
            <div className="flex flex-col gap-3 pt-4 border-t border-slate-100">
              {user ? (
                <>
                  <div className="flex items-center gap-3 px-2 py-2 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="w-8 h-8 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center font-bold text-xs uppercase shrink-0">
                      {user.email?.[0] || 'U'}
                    </div>
                    <span className="text-[13px] text-slate-600 font-medium flex-1 truncate">{user.email}</span>
                    <button 
                      onClick={handleSignOut} 
                      className="text-slate-500 hover:text-red-500 bg-white shadow-sm border border-slate-200 hover:border-red-200 p-2 rounded-lg transition-all"
                      title="Đăng xuất"
                    >
                      <ArrowRightOnRectangleIcon className="w-4 h-4 stroke-[2.5px]" />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <Link to="/login" onClick={() => setIsMenuOpen(false)} className="text-sm font-semibold text-slate-600 px-4 py-2 rounded-xl hover:bg-slate-50 transition-colors w-full text-center border border-slate-200">Đăng nhập</Link>
                  <Link to="/register" onClick={() => setIsMenuOpen(false)} className="px-4 py-2 rounded-xl font-semibold text-sm bg-slate-900 text-white hover:bg-slate-800 transition-colors w-full text-center">Đăng ký</Link>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
