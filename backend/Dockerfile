# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /app

# Install build deps needed for numpy
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM python:3.11-slim

WORKDIR /app

# Chỉ copy packages đã cài (không copy gcc/g++)
COPY --from=builder /install /usr/local

# Copy source code
COPY . .

# Generate Prisma client
RUN prisma generate

# Koyeb / cloud expose port 8000
EXPOSE 8000

# Chạy với uvicorn production (không reload)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
