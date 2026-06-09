import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { useAuth } from "./contexts/AuthContext";
import HistoryPage from "./pages/HistoryPage";
import InterviewPage from "./pages/InterviewPage";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ReportPage from "./pages/ReportPage";
import UploadPage from "./pages/UploadPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="text-center py-16">Đang tải...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      {/* Trang chủ công khai */}
      <Route path="/" element={<LandingPage />} />

      {/* Auth */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Các trang yêu cầu đăng nhập */}
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<UploadPage />} />
        <Route path="/interview/:sessionId" element={<InterviewPage />} />
        <Route path="/report/:sessionId" element={<ReportPage />} />
        <Route path="/history" element={<HistoryPage />} />
      </Route>
    </Routes>
  );
}
