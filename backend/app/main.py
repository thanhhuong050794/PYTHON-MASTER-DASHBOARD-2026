"""BI Dashboard tuyển sinh NEU/PTIT — FastAPI.

    cd backend && uv run uvicorn app.main:app --reload --port 8000
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
# 1. Tạo app TRƯỚC
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://neu-admissions-dashboard.onrender.com",
    ],
    allow_credentials=True,   # BẮT BUỘC true để gửi cookie đăng nhập
    allow_methods=["*"],
    allow_headers=["*"],
)
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .db import get_db
from .routers import admin, auth, contacts, exams, leads, marketing, misc, overview

app = FastAPI(title="NEU Admissions BI", version="1.0.0", docs_url="/api/docs", openapi_url="/api/openapi.json")

for r in (auth.router, admin.router, overview.router, contacts.router, marketing.router, leads.router, exams.router, misc.router):
    app.include_router(r)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    if request.url.path.startswith("/api/"):
        response.headers.setdefault("Cache-Control", "no-store")
    return response


@app.get("/api/health")
def health():
    get_db().client.admin.command("ping")
    return {"ok": True, "db": settings.mongo_db_name}


# Phục vụ bản build của frontend (npm run build) — SPA fallback về index.html
dist = settings.frontend_dist
if (dist / "index.html").exists():
    app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        file = (dist / path).resolve()
        if path and file.is_file() and file.is_relative_to(dist.resolve()):
            return FileResponse(file)
        return FileResponse(dist / "index.html")
