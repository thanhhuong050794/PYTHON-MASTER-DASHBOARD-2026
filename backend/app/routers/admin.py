import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError

from ..db import get_db
from ..partners import MODULES, PARTNER_CODES
from ..security import CurrentUser, hash_password, require_admin, validate_password_strength
from .auth import audit

router = APIRouter(prefix="/api/admin", tags=["admin"])

USER_FIELDS = {"_id": 0, "username": 1, "full_name": 1, "role": 1, "partner_code": 1, "active": 1, "created_at": 1, "last_login": 1}


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    full_name: str = Field(min_length=1, max_length=120)
    role: str = Field(pattern="^(admin|partner)$")
    partner_code: str | None = None
    password: str = Field(min_length=8, max_length=128)


class UserUpdate(BaseModel):
    full_name: str | None = Field(None, min_length=1, max_length=120)
    active: bool | None = None
    partner_code: str | None = None


class PasswordReset(BaseModel):
    password: str = Field(min_length=8, max_length=128)


class PartnerUpdate(BaseModel):
    modules: list[str] | None = None
    can_view_pii: bool | None = None
    active: bool | None = None


@router.get("/users")
def list_users(_: CurrentUser = Depends(require_admin)):
    return list(get_db().users.find({}, USER_FIELDS).sort([("role", 1), ("username", 1)]))


@router.post("/users", status_code=201)
def create_user(body: UserCreate, request: Request, admin: CurrentUser = Depends(require_admin)):
    username = body.username.strip().lower()
    if not re.fullmatch(r"[a-z0-9._-]{3,32}", username):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tên đăng nhập chỉ gồm chữ thường, số, dấu . _ -")
    if body.role == "partner" and body.partner_code not in PARTNER_CODES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tài khoản đối tác phải chọn mã đối tác hợp lệ")
    validate_password_strength(body.password)
    doc = {
        "username": username,
        "full_name": body.full_name.strip(),
        "role": body.role,
        "partner_code": body.partner_code if body.role == "partner" else None,
        "password_hash": hash_password(body.password),
        "active": True,
        "token_version": 0,
        "created_at": datetime.now(timezone.utc),
        "last_login": None,
    }
    try:
        get_db().users.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Tên đăng nhập “{username}” đã tồn tại")
    audit("user_create", admin.username, request, detail={"target": username, "partner": doc["partner_code"]})
    return {k: doc[k] for k in USER_FIELDS if k in doc}


@router.patch("/users/{username}")
def update_user(username: str, body: UserUpdate, request: Request, admin: CurrentUser = Depends(require_admin)):
    db = get_db()
    user = db.users.find_one({"username": username})
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy tài khoản")
    changes: dict = {}
    if body.full_name is not None:
        changes["full_name"] = body.full_name.strip()
    if body.partner_code is not None:
        if user["role"] != "partner" or body.partner_code not in PARTNER_CODES:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Mã đối tác không hợp lệ")
        changes["partner_code"] = body.partner_code
    if body.active is not None:
        if username == admin.username and not body.active:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Không thể tự khoá tài khoản đang đăng nhập")
        changes["active"] = body.active
    update: dict = {"$set": changes}
    if body.active is False or "partner_code" in changes:
        update["$inc"] = {"token_version": 1}  # đá các phiên đang mở
    if changes:
        db.users.update_one({"_id": user["_id"]}, update)
        audit("user_update", admin.username, request, detail={"target": username, **{k: v for k, v in changes.items()}})
    return db.users.find_one({"_id": user["_id"]}, USER_FIELDS)


@router.post("/users/{username}/reset-password")
def reset_password(username: str, body: PasswordReset, request: Request, admin: CurrentUser = Depends(require_admin)):
    validate_password_strength(body.password)
    res = get_db().users.update_one(
        {"username": username},
        {"$set": {"password_hash": hash_password(body.password)}, "$inc": {"token_version": 1}},
    )
    if res.matched_count == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy tài khoản")
    audit("user_reset_password", admin.username, request, detail={"target": username})
    return {"ok": True}


@router.get("/partners")
def list_partners(_: CurrentUser = Depends(require_admin)):
    db = get_db()
    user_counts = {r["_id"]: r["n"] for r in db.users.aggregate([{"$group": {"_id": "$partner_code", "n": {"$sum": 1}}}])}
    record_counts = {}
    for coll in ("contacts", "leads", "exam_candidates"):
        for r in db[coll].aggregate([{"$unwind": "$partners"}, {"$group": {"_id": "$partners", "n": {"$sum": 1}}}]):
            record_counts.setdefault(r["_id"], {})[coll] = r["n"]
    partners = []
    for p in db.partners.find().sort("_id", 1):
        code = p.pop("_id")
        partners.append({"code": code, **p, "users": user_counts.get(code, 0), "records": record_counts.get(code, {})})
    order = {c: i for i, c in enumerate(PARTNER_CODES)}
    partners.sort(key=lambda p: order.get(p["code"], 99))
    return {"partners": partners, "modules": MODULES}


@router.patch("/partners/{code}")
def update_partner(code: str, body: PartnerUpdate, request: Request, admin: CurrentUser = Depends(require_admin)):
    changes: dict = {}
    if body.modules is not None:
        bad = [m for m in body.modules if m not in MODULES]
        if bad:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Module không hợp lệ: {', '.join(bad)}")
        changes["modules"] = [m for m in MODULES if m in body.modules]
    if body.can_view_pii is not None:
        changes["can_view_pii"] = body.can_view_pii
    if body.active is not None:
        changes["active"] = body.active
    res = get_db().partners.update_one({"_id": code}, {"$set": changes}) if changes else None
    if res is not None and res.matched_count == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy đối tác")
    audit("partner_update", admin.username, request, detail={"partner": code, **changes})
    return {"ok": True}


@router.get("/audit")
def audit_log(limit: int = 100, _: CurrentUser = Depends(require_admin)):
    return list(get_db().audit_logs.find({}, {"_id": 0}).sort("at", -1).limit(min(limit, 500)))


@router.get("/imports")
def import_runs(_: CurrentUser = Depends(require_admin)):
    return list(get_db().import_runs.find({}, {"_id": 0}).sort("started_at", -1).limit(10))
