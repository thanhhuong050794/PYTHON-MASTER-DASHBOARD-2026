from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from ..config import settings
from ..db import get_db
from ..security import (
    COOKIE_NAME,
    CurrentUser,
    create_token,
    get_current_user,
    hash_password,
    load_current_user,
    login_throttle,
    validate_password_strength,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


# Cookie cross-site (Render: fe và be khác subdomain) bắt buộc SameSite=None + Secure=True.
# Localhost chạy HTTP nên phải để SameSite=Lax + Secure=False.
_SAMESITE = "none" if settings.cookie_secure else "lax"
_SECURE = settings.cookie_secure
_COOKIE_KW = dict(
    max_age=settings.jwt_expire_hours * 3600,
    httponly=True,
    secure=_SECURE,
    samesite=_SAMESITE,
    path="/",
)


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)


class ChangePasswordIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


def audit(action: str, username: str | None, request: Request | None, ok: bool = True, detail: dict | None = None) -> None:
    get_db().audit_logs.insert_one({
        "at": datetime.now(timezone.utc),
        "action": action,
        "username": username,
        "ok": ok,
        "ip": request.client.host if request and request.client else None,
        "detail": detail or {},
    })


@router.post("/login")
def login(body: LoginIn, request: Request, response: Response):
    username = body.username.strip().lower()
    key = f"{username}|{request.client.host if request.client else ''}"
    login_throttle.check(key)

    db = get_db()
    user = db.users.find_one({"username": username})
    if not user or not user.get("active", True) or not verify_password(body.password, user.get("password_hash", "")):
        login_throttle.fail(key)
        audit("login", username, request, ok=False)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sai tên đăng nhập hoặc mật khẩu")

    current = load_current_user(username)
    if current is None:
        audit("login", username, request, ok=False, detail={"reason": "partner_inactive"})
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Đối tác của tài khoản đang bị khoá")

    login_throttle.reset(key)
    db.users.update_one({"_id": user["_id"]}, {"$set": {"last_login": datetime.now(timezone.utc)}})
    audit("login", username, request)
    response.set_cookie(COOKIE_NAME, create_token(user), **_COOKIE_KW)
    return current.public()


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(
        COOKIE_NAME,
        path="/",
        secure=_SECURE,
        httponly=True,
        samesite=_SAMESITE,
    )
    return {"ok": True}


@router.get("/me")
def me(user: CurrentUser = Depends(get_current_user)):
    return user.public()


@router.post("/change-password")
def change_password(body: ChangePasswordIn, request: Request, response: Response, user: CurrentUser = Depends(get_current_user)):
    db = get_db()
    doc = db.users.find_one({"username": user.username})
    if not verify_password(body.current_password, doc["password_hash"]):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Mật khẩu hiện tại không đúng")
    validate_password_strength(body.new_password)
    db.users.update_one(
        {"_id": doc["_id"]},
        {"$set": {"password_hash": hash_password(body.new_password), "password_changed_at": datetime.now(timezone.utc)},
         "$inc": {"token_version": 1}},
    )
    audit("change_password", user.username, request)
    # Phiên cũ bị vô hiệu (token_version tăng) → cấp cookie mới cho phiên hiện tại
    response.set_cookie(COOKIE_NAME, create_token(db.users.find_one({"_id": doc["_id"]})), **_COOKIE_KW)
    return {"ok": True}