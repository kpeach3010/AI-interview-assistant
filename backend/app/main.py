from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import documents, reports, sessions, websocket
from app.core.config import get_settings
from app.core.database import connect_db, disconnect_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
    yield
    await disconnect_db()


settings = get_settings()

app = FastAPI(
    title="AI Interview Assistant API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents.router)
app.include_router(sessions.router)
app.include_router(reports.router)
app.include_router(websocket.router)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/slides")
async def get_slides():
    import os
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    slide_dir = os.path.join(base_dir, "..", "frontend", "public", "slide")
    if not os.path.exists(slide_dir):
        # Fallback to hardcoded list if not found
        return ["/slide/1.png", "/slide/2.jpg"]
    try:
        files = os.listdir(slide_dir)
        images = [f for f in files if f.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'))]
        # Sort naturally or alphabetically
        images.sort()
        return [f"/slide/{img}" for img in images]
    except Exception:
        return ["/slide/1.png", "/slide/2.jpg"]
