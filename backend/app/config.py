"""Cấu hình đọc từ file .env ở thư mục gốc dự án (biến môi trường thật được ưu tiên)."""

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[2]
load_dotenv(ROOT_DIR / ".env", override=False)


def _bool(name: str, default: bool) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    mongo_uri: str
    mongo_db_name: str
    jwt_secret: str
    jwt_expire_hours: int
    cookie_secure: bool
    data_dir: Path
    seed_admin_password: str
    seed_partner_password: str
    frontend_dist: Path


def _load() -> Settings:
    jwt_secret = os.getenv("JWT_SECRET", "")
    if len(jwt_secret) < 32:
        raise RuntimeError("JWT_SECRET trong .env phải có ít nhất 32 ký tự")
    data_dir = Path(os.getenv("DATA_DIR", "Data-20260929T164510Z-1-001/Data"))
    return Settings(
        mongo_uri=os.environ["MONGO_URI"],
        mongo_db_name=os.getenv("MONGO_DB_NAME", "neu_admissions"),
        jwt_secret=jwt_secret,
        jwt_expire_hours=int(os.getenv("JWT_EXPIRE_HOURS", "12")),
        cookie_secure=_bool("COOKIE_SECURE", False),
        data_dir=data_dir if data_dir.is_absolute() else ROOT_DIR / data_dir,
        seed_admin_password=os.getenv("SEED_ADMIN_PASSWORD", ""),
        seed_partner_password=os.getenv("SEED_PARTNER_PASSWORD", ""),
        frontend_dist=ROOT_DIR / "frontend" / "dist",
    )


settings = _load()
