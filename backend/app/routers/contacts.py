from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query

from ..db import get_db
from ..filters import ContactFilters, apply_pii, csv_response, paginate
from ..security import CurrentUser, require_module

router = APIRouter(prefix="/api/contacts", tags=["contacts"])

PAID = {"$cond": ["$paid", 1, 0]}
WEB = {"$cond": ["$web_registered", 1, 0]}
UNPAID_REG = {"$and": ["$web_registered", {"$not": ["$paid"]}]}


def _group(field: str, extra: dict | None = None, sort: dict | None = None) -> list[dict]:
    return [
        {"$group": {
            "_id": f"${field}",
            "count": {"$sum": 1},
            "web_registered": {"$sum": WEB},
            "paid": {"$sum": PAID},
            "revenue": {"$sum": "$revenue"},
            **(extra or {}),
        }},
        {"$sort": sort or {"count": -1, "_id": 1}},
    ]


def _rows(items: list[dict], key: str = "key") -> list[dict]:
    return [{key: r.pop("_id"), **r} for r in items]


def _daily_series(first: list[dict], reg: list[dict]) -> list[dict]:
    """Chuỗi ngày liên tục + luỹ kế: liên hệ mới, đăng ký web, đã thanh toán (theo ngày đăng ký)."""
    firsts = {r["_id"]: r["n"] for r in first}
    regs = {r["_id"]: r for r in reg}
    keys = sorted(set(firsts) | set(regs))
    if not keys:
        return []
    start, end = date.fromisoformat(keys[0]), date.fromisoformat(keys[-1])
    out, c_first, c_reg, c_paid = [], 0, 0, 0
    d = start
    while d <= end:
        k = d.isoformat()
        n_first = firsts.get(k, 0)
        n_reg = regs.get(k, {}).get("n", 0)
        n_paid = regs.get(k, {}).get("paid", 0)
        c_first, c_reg, c_paid = c_first + n_first, c_reg + n_reg, c_paid + n_paid
        out.append({
            "date": k, "new_contacts": n_first, "registrations": n_reg, "paid": n_paid,
            "cum_contacts": c_first, "cum_registrations": c_reg, "cum_paid": c_paid,
        })
        d += timedelta(days=1)
    return out


def contact_summary(match: dict) -> dict:
    facets = {
        "kpi": [{"$group": {
            "_id": None,
            "total": {"$sum": 1},
            "web_registered": {"$sum": WEB},
            "paid": {"$sum": PAID},
            "revenue": {"$sum": "$revenue"},
            "unpaid_registered": {"$sum": {"$cond": [UNPAID_REG, 1, 0]}},
            "unpaid_fees": {"$sum": {"$cond": [UNPAID_REG, {"$ifNull": ["$fee", 0]}, 0]}},
            "leads_only": {"$sum": {"$cond": ["$web_registered", 0, 1]}},
            "external": {"$sum": {"$cond": ["$has_external", 1, 0]}},
            "flagged": {"$sum": {"$cond": [{"$gt": [{"$size": "$flags"}, 0]}, 1, 0]}},
            "merged_records": {"$sum": {"$subtract": ["$merged_count", 1]}},
            "undated_contacts": {"$sum": {"$cond": [{"$eq": ["$first_touch", None]}, 1, 0]}},
            "undated_registrations": {"$sum": {"$cond": [{"$and": ["$web_registered", {"$eq": ["$web_registered_at", None]}]}, 1, 0]}},
            "undated_paid": {"$sum": {"$cond": [{"$and": ["$paid", {"$eq": ["$web_registered_at", None]}]}, 1, 0]}},
            "free": {"$sum": {"$cond": [{"$eq": ["$payment_status", "Miễn phí"]}, 1, 0]}},
        }}],
        "by_segment": _group("segment", {"name": {"$first": "$segment_name"}}, {"_id": 1}),
        "by_drip": _group("drip", sort={"_id": 1}),
        "by_sub_segment": _group("sub_segment"),
        "by_channel": _group("channel"),
        "by_source_combo": _group("source_combo"),
        "by_source": [{"$unwind": "$sources"}, *_group("sources")],
        "by_region": _group("region"),
        "by_province": _group("province"),
        "by_board": _group("board", sort={"_id": 1}),
        "by_payment": _group("payment_status"),
        "by_pic": _group("pic"),
        "by_venue": _group("exam_venue"),
        "by_flag": [{"$unwind": "$flags"}, {"$group": {"_id": "$flags", "count": {"$sum": 1}}}, {"$sort": {"count": -1}}],
        "t_first": [
            {"$match": {"first_touch": {"$ne": None}}},
            {"$group": {"_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$first_touch"}}, "n": {"$sum": 1}}},
        ],
        "t_reg": [
            {"$match": {"web_registered_at": {"$ne": None}}},
            {"$group": {
                "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$web_registered_at"}},
                "n": {"$sum": 1}, "paid": {"$sum": PAID},
            }},
        ],
        "heatmap": [
            {"$match": {"web_registered_at": {"$ne": None}}},
            {"$group": {
                "_id": {"dow": {"$isoDayOfWeek": "$web_registered_at"}, "hour": {"$hour": "$web_registered_at"}},
                "n": {"$sum": 1},
            }},
        ],
    }
    res = next(get_db().contacts.aggregate([{"$match": match}, {"$facet": facets}]))
    kpi = res["kpi"][0] if res["kpi"] else {
        "total": 0, "web_registered": 0, "paid": 0, "revenue": 0, "unpaid_registered": 0, "unpaid_fees": 0,
        "leads_only": 0, "external": 0, "flagged": 0, "merged_records": 0, "free": 0,
        "undated_contacts": 0, "undated_registrations": 0, "undated_paid": 0,
    }
    kpi.pop("_id", None)
    kpi["paid_rate"] = kpi["paid"] / kpi["web_registered"] if kpi["web_registered"] else None
    kpi["potential_revenue"] = kpi["unpaid_fees"]  # khớp "doanh thu tiềm năng" của Booklet 2
    return {
        "kpi": kpi,
        "funnel": [
            {"stage": "Liên hệ duy nhất", "value": kpi["total"]},
            {"stage": "Đăng ký trên website", "value": kpi["web_registered"]},
            {"stage": "Đã thanh toán", "value": kpi["paid"]},
        ],
        **{k: _rows(res[k]) for k in facets if k.startswith("by_")},
        "timeline": _daily_series(res["t_first"], res["t_reg"]),
        "heatmap": [{"dow": r["_id"]["dow"], "hour": r["_id"]["hour"], "count": r["n"]} for r in res["heatmap"]],
    }


@router.get("/summary")
def summary(f: ContactFilters = Depends(), user: CurrentUser = Depends(require_module("contacts"))):
    return contact_summary(f.match(user))


LIST_FIELDS = {
    "_id": 0, "contact_id": 1, "full_name": 1, "email": 1, "phone": 1, "board": 1, "province": 1, "region": 1,
    "payment_status": 1, "fee": 1, "revenue": 1, "channel": 1, "channel_is_assumed": 1, "segment": 1, "drip": 1,
    "sources": 1, "pic": 1, "first_touch": 1, "web_registered_at": 1, "exam_venue": 1, "flags": 1,
    "utm_partners": 1, "promo_codes": 1, "dob": 1, "cccd": 1, "notes": 1, "question": 1,
}
SORTABLE = {"contact_id", "full_name", "board", "province", "payment_status", "revenue", "channel", "segment", "pic", "first_touch", "web_registered_at"}
CSV_COLUMNS = [
    ("contact_id", "Contact ID"), ("full_name", "Họ tên"), ("email", "Email"), ("phone", "SĐT"), ("board", "Bảng"),
    ("province", "Tỉnh/TP"), ("region", "Miền"), ("payment_status", "Trạng thái thanh toán"), ("fee", "Lệ phí"),
    ("revenue", "Doanh thu ghi nhận"), ("channel", "Kênh"), ("segment", "Segment"), ("drip", "Drip"),
    ("sources", "Nguồn dữ liệu"), ("pic", "PIC"), ("first_touch", "Tiếp xúc đầu tiên"),
    ("web_registered_at", "Ngày đăng ký web"), ("exam_venue", "Điểm thi"), ("flags", "Cờ cần kiểm tra"),
]


@router.get("/list")
def list_contacts(
    f: ContactFilters = Depends(),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    sort: str | None = Query(None, description="VD: -revenue"),
    format: str = Query("json", pattern="^(json|csv)$"),
    user: CurrentUser = Depends(require_module("contacts")),
):
    match = f.match(user)
    if format == "csv":
        rows = list(get_db().contacts.find(match, LIST_FIELDS).sort("contact_id", 1))
        return csv_response(apply_pii(rows, user), CSV_COLUMNS, "lien_he.csv")
    total, rows = paginate(get_db().contacts, match, LIST_FIELDS, sort, SORTABLE, page, page_size, ("contact_id", 1))
    return {"total": total, "page": page, "page_size": page_size, "rows": apply_pii(rows, user)}
