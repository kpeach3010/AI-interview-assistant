import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Backend FastAPI chạy ở localhost:8000.
// Khi mở web qua Cloudflare Tunnel (1 link duy nhất), frontend gọi API/WS
// bằng đường dẫn tương đối (same-origin) và Vite proxy chúng sang backend.
const BACKEND = "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // Cho phép truy cập qua domain ngẫu nhiên *.trycloudflare.com (và mọi host khác)
    allowedHosts: true,
    proxy: {
      "/documents": { target: BACKEND, changeOrigin: true },
      "/sessions": { target: BACKEND, changeOrigin: true },
      "/slides": { target: BACKEND, changeOrigin: true },
      "/health": { target: BACKEND, changeOrigin: true },
      // WebSocket phỏng vấn voice
      "/ws": { target: BACKEND, changeOrigin: true, ws: true },
    },
  },
});
