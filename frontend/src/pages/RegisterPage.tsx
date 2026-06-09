import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import AppHeader from "../components/AppHeader";

export default function RegisterPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await signUp(email, password, fullName);
      navigate("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đăng ký thất bại");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", display: "flex", flexDirection: "column" }}>
      <AppHeader />
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
        <div style={{ width: "100%", maxWidth: 440 }}>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, textAlign: "center", marginBottom: "2rem", color: "#0f172a" }}>Đăng ký</h1>
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-xl shadow border space-y-4">
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <div>
          <label className="block text-sm font-medium mb-1">Họ tên</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full border rounded-lg px-3 py-2"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border rounded-lg px-3 py-2"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Mật khẩu</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border rounded-lg px-3 py-2"
            minLength={6}
            required
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary-600 text-white py-2 rounded-lg hover:bg-primary-700 disabled:opacity-50"
        >
          {loading ? "Đang đăng ký..." : "Đăng ký"}
        </button>
        <p className="text-center text-sm text-slate-500">
          Đã có tài khoản?{" "}
          <Link to="/login" className="text-primary-600 hover:underline">
            Đăng nhập
          </Link>
        </p>
      </form>
        </div>
      </div>
    </div>
  );
}
