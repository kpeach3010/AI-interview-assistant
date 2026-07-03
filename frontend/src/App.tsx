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
import CVSuggestionPage from "./pages/CVSuggestionPage";

function ProtectedPage({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="text-center py-16">Đang tải...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route path="/dashboard" element={<ProtectedPage><UploadPage /></ProtectedPage>} />
      <Route path="/optimize-cv" element={<ProtectedPage><UploadPage /></ProtectedPage>} />
      <Route path="/history" element={<ProtectedPage><HistoryPage /></ProtectedPage>} />
      <Route path="/interview/:sessionId" element={<ProtectedPage><InterviewPage /></ProtectedPage>} />
      <Route path="/report/:sessionId" element={<ProtectedPage><ReportPage /></ProtectedPage>} />
      <Route
        path="/report/:sessionId/cv-suggestions"
        element={<ProtectedPage><CVSuggestionPage /></ProtectedPage>}
      />
      <Route
        path="/cv-suggestion/:sessionId"
        element={<ProtectedPage><CVSuggestionPage /></ProtectedPage>}
      />
    </Routes>
  );
}
