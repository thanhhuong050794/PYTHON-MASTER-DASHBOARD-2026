"""Băm mật khẩu, phát hành/kiểm tra JWT và các dependency phân quyền."""

import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, status

from .config import settings
from .db import get_db
from .partners import MODULES

COOKIE_NAME = "neu_bi_session"
JWT_ALG = "HS256"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


def validate_password_strength(password: str) -> None:
    if len(password) < 8:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Mật khẩu phải có ít nhất 8 ký tự")
    if password.isdigit() or password.isalpha():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Mật khẩu phải gồm cả chữ và số/ký tự đặc biệt")


def create_token(user: dict) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user["username"],
        "ver": user.get("token_version", 0),
        "iat": now,
        "exp": now + timedelta(hours=settings.jwt_expire_hours),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=JWT_ALG)


class LoginThrottle:
    """Khoá tạm thời sau nhiều lần đăng nhập sai (theo username + IP), lưu trong bộ nhớ."""

    def __init__(self, max_failures: int = 5, window_s: int = 300):
        self.max_failures = max_failures
        self.window_s = window_s
        self._fails: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def _recent(self, key: str) -> list[float]:
        cutoff = time.time() - self.window_s
        fails = [t for t in self._fails.get(key, []) if t > cutoff]
        self._fails[key] = fails
        return fails

    def check(self, key: str) -> None:
        with self._lock:
            fails = self._recent(key)
            if len(fails) >= self.max_failures:
                wait = int(self.window_s - (time.time() - fails[0])) + 1
                raise HTTPException(
                    status.HTTP_429_TOO_MANY_REQUESTS,
                    f"Đăng nhập sai quá nhiều lần, thử lại sau {wait} giây",
                )

    def fail(self, key: str) -> None:
        with self._lock:
            self._recent(key).append(time.time())

    def reset(self, key: str) -> None:
        with self._lock:
            self._fails.pop(key, None)


login_throttle = LoginThrottle()


@dataclass
class CurrentUser:
    username: str
    full_name: str
    role: str
    partner_code: str | None
    partner_name: str | None
    modules: list[str]
    can_view_pii: bool
    extra: dict = field(default_factory=dict)

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"

    def public(self) -> dict:
        return {
            "username": self.username,
            "full_name": self.full_name,
            "role": self.role,
            "partner_code": self.partner_code,
            "partner_name": self.partner_name,
            "modules": self.modules,
            "can_view_pii": self.can_view_pii,
        }


def _token_from_request(request: Request) -> str | None:
    token = request.cookies.get(COOKIE_NAME)
    if token:
        return token
    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return None


def load_current_user(username: str) -> CurrentUser | None:
    db = get_db()
    user = db.users.find_one({"username": username})
    if not user or not user.get("active", True):
        return None
    if user["role"] == "admin":
        return CurrentUser(
            username=user["username"],
            full_name=user.get("full_name", ""),
            role="admin",
            partner_code=None,
            partner_name=None,
            modules=list(MODULES) + ["admin"],
            can_view_pii=True,
            extra={"token_version": user.get("token_version", 0)},
        )
    partner = db.partners.find_one({"_id": user.get("partner_code")})
    if not partner or not partner.get("active", True):
        return None
    return CurrentUser(
        username=user["username"],
        full_name=user.get("full_name", ""),
        role="partner",
        partner_code=partner["_id"],
        partner_name=partner.get("name"),
        modules=[m for m in partner.get("modules", []) if m in MODULES],
        can_view_pii=bool(partner.get("can_view_pii", False)),
        extra={"token_version": user.get("token_version", 0)},
    )


def get_current_user(request: Request) -> CurrentUser:
    token = _token_from_request(request)
    unauthorized = HTTPException(status.HTTP_401_UNAUTHORIZED, "Phiên đăng nhập không hợp lệ hoặc đã hết hạn")
    if not token:
        raise unauthorized
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        raise unauthorized
    user = load_current_user(payload.get("sub", ""))
    if not user or user.extra.get("token_version", 0) != payload.get("ver", 0):
        raise unauthorized
    return user


def require_admin(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Chỉ quản trị viên được thực hiện thao tác này")
    return user


def require_module(module: str):
    def dep(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if module not in user.modules:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Tài khoản không có quyền xem mục “{MODULES.get(module, module)}”")
        return user

    return dep
