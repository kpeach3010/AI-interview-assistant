# AI Interview Assistant (MVP)

Nền tảng luyện phỏng vấn việc làm bằng giọng nói với AI. Upload CV/JD → phỏng vấn voice → đánh giá 4 tiêu chí → báo cáo PDF.

## Stack

- **Frontend**: React + TypeScript + Tailwind + Vite
- **Backend**: FastAPI + LangGraph + Prisma
- **Database/Auth/Storage**: Supabase (PostgreSQL + pgvector)
- **AI**: Ollama (qwen2.5) + Gemini Flash fallback
- **Voice**: faster-whisper (STT) + edge-tts (TTS)

## Yêu cầu

- Node.js 18+
- Python 3.11+
- Tài khoản [Supabase](https://supabase.com) (free tier)
- (Tùy chọn) Docker cho Ollama local
- (Tùy chọn) GEMINI_API_KEY cho fallback cloud

## 1. Thiết lập Supabase

1. Tạo project mới trên Supabase Dashboard
2. Vào **SQL Editor**, chạy lần lượt các file trong `supabase/migrations/` (theo thứ tự 000000 → 000010)
3. Hoặc dùng Supabase CLI: `supabase link` rồi `supabase db push`
4. Lấy credentials từ **Settings → API**:
   - Project URL
   - anon key
   - service_role key
5. Lấy connection string từ **Settings → Database**:
   - Transaction pooler (port 6543) → `DATABASE_URL`
   - Direct connection (port 5432) → `DIRECT_DATABASE_URL`

## 2. Cấu hình môi trường

```bash
cp .env.example .env
# Điền các giá trị Supabase, Gemini, Ollama
```

Copy các biến `VITE_*` sang `frontend/.env`:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_API_URL=http://localhost:8000
```

## 3. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
python -m playwright install chromium   # cần cho xuất CV PDF (HTML→PDF); nếu thiếu sẽ tự fallback fpdf2
uvicorn app.main:app --reload --port 8000
```

> **Lưu ý DB**: Backend dùng Supabase PostgREST (service role) qua `db_service.py`. File `prisma/schema.prisma` là schema tham chiếu; chạy migrations SQL trên Supabase Dashboard là bắt buộc.

```bash
# Tùy chọn: generate Prisma client (cần PATH chứa .venv/Scripts)
prisma generate
```

## 4. Frontend

```bash
cd frontend
npm install
npm run dev
```

Truy cập: http://localhost:5173

## 5. Ollama (tùy chọn, local LLM)

```bash
docker compose up -d
docker exec -it <ollama_container> ollama pull qwen2.5:7b
```

## 6. Chia sẻ web công khai qua Cloudflare Tunnel

Để **bất kỳ ai cũng mở được web qua một đường link** (không cần cùng mạng LAN, không cần cài gì), dùng **Cloudflare Tunnel**. Chỉ cần expose **frontend (port 5173)**: Vite đã được cấu hình **proxy** các request API/WebSocket sang backend `localhost:8000`, nên một link là đủ cho cả giao diện lẫn API.

### Yêu cầu cấu hình (đã thiết lập sẵn trong repo)

- `frontend/.env`: `VITE_API_URL=` **để rỗng** → frontend gọi API/WS bằng đường dẫn tương đối (same-origin).
- `frontend/vite.config.ts`: bật `allowedHosts: true` và `proxy` cho `/documents`, `/sessions`, `/slides`, `/health`, `/ws` → `http://localhost:8000`.

### Cài cloudflared (nếu chưa có)

```bash
winget install --id Cloudflare.cloudflared
# hoặc tải binary tại https://github.com/cloudflare/cloudflared/releases
```

### Chạy (mở 3 cửa sổ terminal)

```bash
# 1) Backend
cd backend
.venv\Scripts\activate
uvicorn app.main:app --port 8000

# 2) Frontend
cd frontend
npm run dev            # phải chạy ở cổng 5173

# 3) Cloudflare Tunnel (trỏ vào frontend)
cloudflared tunnel --url http://localhost:5173
```

Cloudflared sẽ in ra một link dạng:

```
https://<ngẫu-nhiên>.trycloudflare.com
```

Gửi link này cho bất kỳ ai — họ mở được toàn bộ web (đăng nhập, upload CV, phỏng vấn voice, báo cáo).

> **Lưu ý:**
> - Link `trycloudflare.com` là **tunnel tạm thời, đổi mỗi lần chạy** lại lệnh. Muốn link cố định (tên miền riêng) thì cần tài khoản Cloudflare + `cloudflared tunnel login` rồi tạo named tunnel.
> - Frontend **phải chạy đúng cổng 5173**. Nếu 5173 bị chiếm, Vite nhảy sang 5174/5175… → tunnel sẽ trỏ sai cổng. Tắt các tiến trình cũ trước khi chạy.
> - Microphone (phỏng vấn voice) cần HTTPS — link `trycloudflare.com` đã là HTTPS nên mic hoạt động bình thường.
> - Tắt tunnel = đóng terminal cloudflared (Ctrl+C); link ngừng hoạt động ngay.

## Luồng sử dụng

1. **Đăng ký / Đăng nhập** (Supabase Auth)
2. **Upload CV** (+ JD tùy chọn), nhập vị trí ứng tuyển
3. Hệ thống phân tích CV và tạo 10–15 câu hỏi
4. **Phỏng vấn giọng nói** — AI hỏi, bạn trả lời qua microphone
5. **Báo cáo** — điểm 4 tiêu chí, gợi ý cải thiện CV, tải PDF

## API Endpoints

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST | `/documents/upload` | Upload CV/JD |
| POST | `/sessions` | Tạo phiên + parse + generate questions |
| GET | `/sessions` | Lịch sử |
| GET | `/sessions/{id}` | Chi tiết phiên |
| WS | `/ws/interview/{id}?token=...` | Voice interview |
| POST | `/sessions/{id}/complete` | Kích hoạt đánh giá |
| GET | `/sessions/{id}/report` | Báo cáo JSON |
| GET | `/sessions/{id}/report/pdf` | Tải PDF |

## Cấu trúc thư mục

```
├── frontend/          # React app
├── backend/           # FastAPI + agents
├── supabase/          # SQL migrations + RLS
├── docker-compose.yml # Ollama optional
└── .env.example
```

## Kiểm tra thủ công (E2E)

- [ ] Đăng ký tài khoản mới, profile tự tạo trong Supabase
- [ ] Upload CV PDF, status chuyển parsing → ready
- [ ] Có ≥10 câu hỏi trong bảng `questions`
- [ ] WebSocket phỏng vấn: nghe TTS, ghi âm, thấy transcript
- [ ] Hoàn thành → báo cáo có điểm 4 tiêu chí
- [ ] Tải PDF từ Storage bucket `reports`
- [ ] User A không thấy dữ liệu của User B (RLS)

## Xử lý sự cố

| Vấn đề | Giải pháp |
|--------|-----------|
| LLM timeout | Kiểm tra Ollama hoặc thêm `GEMINI_API_KEY` |
| Whisper chậm | Đặt `WHISPER_DEVICE=cpu`, model `small` |
| Mic không hoạt động | Cấp quyền microphone trên browser (HTTPS/localhost) |
| Prisma lỗi kết nối | Dùng pooler URL (6543) cho runtime, direct (5432) cho migrate |
