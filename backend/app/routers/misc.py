"""Chất lượng dữ liệu, nhà tài trợ & truyền thông, danh mục giá trị cho bộ lọc."""

from fastapi import APIRouter, Depends, Query

from ..db import get_db
from ..filters import apply_pii, effective_partner, scope_match
from ..partners import PARTNERS
from ..security import CurrentUser, get_current_user, require_module

router = APIRouter(prefix="/api", tags=["misc"])


@router.get("/quality/summary")
def quality_summary(partner: str | None = None, user: CurrentUser = Depends(require_module("quality"))):
    db = get_db()
    match = scope_match(user, partner)
    by_issue = list(db.data_quality.aggregate([
        {"$match": match},
        {"$group": {"_id": {"issue": "$issue_type", "source": "$source"}, "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]))
    by_reason = list(db.duplicate_log.aggregate([
        {"$match": match},
        {"$group": {"_id": {"reason": "$reason_type", "source": "$source"}, "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]))
    flags = list(db.contacts.aggregate([
        {"$match": match}, {"$unwind": "$flags"},
        {"$group": {"_id": "$flags", "count": {"$sum": 1}}}, {"$sort": {"count": -1}},
    ]))
    merged = list(db.contacts.aggregate([
        {"$match": match},
        {"$group": {"_id": "$merged_count", "count": {"$sum": 1}}}, {"$sort": {"_id": 1}},
    ]))
    return {
        "pipeline": db.meta.find_one({"_id": "pipeline"}, {"_id": 0}),
        "by_issue": [{**r["_id"], "count": r["count"]} for r in by_issue],
        "by_reason": [{**r["_id"], "count": r["count"]} for r in by_reason],
        "flags": [{"key": r["_id"], "count": r["count"]} for r in flags],
        "merged_distribution": [{"merged": r["_id"], "count": r["count"]} for r in merged],
        "last_import": db.import_runs.find_one({}, {"_id": 0, "files": 1, "finished_at": 1, "ok": 1, "checks": 1}, sort=[("started_at", -1)]),
    }


@router.get("/quality/list")
def quality_list(
    kind: str = Query("issues", pattern="^(issues|duplicates)$"),
    partner: str | None = None,
    issue: str | None = None,
    source: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    user: CurrentUser = Depends(require_module("quality")),
):
    db = get_db()
    match = scope_match(user, partner)
    if source:
        match["source"] = source
    if kind == "issues":
        coll = db.data_quality
        if issue:
            match["issue_type"] = issue
    else:
        coll = db.duplicate_log
        if issue:
            match["reason_type"] = issue
    total = coll.count_documents(match)
    rows = list(coll.find(match, {"_id": 0, "partners": 0}).sort([("source", 1), ("row_no", 1)]).skip((page - 1) * page_size).limit(page_size))
    if not user.can_view_pii:
        # Giá trị trước/sau chuẩn hoá có thể là email/SĐT → che toàn bộ với tài khoản không có quyền PII
        for r in rows:
            for k in ("value_before", "value_after"):
                if r.get(k) and r.get("issue_type") != "Chuẩn hoá tên trường":
                    r[k] = "•••"
    return {"total": total, "rows": apply_pii(rows, user)}


@router.get("/sponsorship/summary")
def sponsorship(partner: str | None = None, user: CurrentUser = Depends(require_module("sponsorship"))):
    db = get_db()
    match = scope_match(user, partner)
    return {
        "benefits": list(db.sponsor_benefits.find(match, {"_id": 0, "partners": 0})),
        "reach": list(db.media_reach.find(match, {"_id": 0, "partners": 0})),
    }


def _distinct(coll, field: str, match: dict) -> list:
    return sorted(v for v in get_db()[coll].distinct(field, match) if v not in (None, ""))


@router.get("/meta/options")
def options(partner: str | None = None, dataset: str = "PM119", user: CurrentUser = Depends(get_current_user)):
    """Giá trị cho các bộ lọc — chỉ lấy trong phạm vi dữ liệu người dùng được xem."""
    db = get_db()
    match = scope_match(user, partner)
    out: dict = {
        "partners": [{"code": p["code"], "name": p["name"], "type": p["type"]} for p in PARTNERS] if user.is_admin else [],
        "viewing_partner": effective_partner(user, partner),
    }
    if {"contacts", "marketing", "overview"} & set(user.modules):
        bounds = list(db.contacts.aggregate([
            {"$match": {**match, "first_touch": {"$ne": None}}},
            {"$group": {"_id": None, "min": {"$min": "$first_touch"}, "max": {"$max": "$first_touch"}}},
        ]))
        out["contacts"] = {
            "board": _distinct("contacts", "board", match),
            "region": _distinct("contacts", "region", match),
            "province": _distinct("contacts", "province", match),
            "payment_status": _distinct("contacts", "payment_status", match),
            "segment": [
                {"value": s, "label": f"{s} · {n}"}
                for s, n in sorted({(c["segment"], c["segment_name"]) for c in db.contacts.find(match, {"segment": 1, "segment_name": 1}) if c.get("segment")})
            ],
            "channel": _distinct("contacts", "channel", match),
            "source": _distinct("contacts", "sources", match),
            "pic": _distinct("contacts", "pic", match),
            "venue": _distinct("contacts", "exam_venue", match),
            "date_min": bounds[0]["min"] if bounds else None,
            "date_max": bounds[0]["max"] if bounds else None,
        }
    if "leads" in user.modules:
        out["leads"] = {
            k: _distinct("leads", f, match)
            for k, f in (("source", "source"), ("result", "result"), ("campaign", "campaign"), ("platform", "platform"),
                         ("segment", "segment"), ("region", "region"), ("board", "board_interest"), ("pic", "pic"))
        }
    if "exams" in user.modules:
        exam_match = {**match, "dataset": dataset}
        meta = db.meta.find_one({"_id": "exam"}) or {"datasets": []}
        out["exams"] = {
            "datasets": [d for d in meta["datasets"] if db.exam_candidates.count_documents({**match, "dataset": d["code"]}, limit=1)],
            **{k: _distinct("exam_candidates", f, exam_match)
               for k, f in (("board", "board"), ("region", "region"), ("province", "province"),
                            ("school_type", "school_type"), ("school", "school"))},
            "grade": ["Giỏi", "Khá", "Trung bình", "Yếu"],
        }
    return out
