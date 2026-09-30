from fastapi import APIRouter, Depends, Query

from ..db import get_db
from ..filters import LeadFilters, apply_pii, csv_response, paginate
from ..security import CurrentUser, require_module

router = APIRouter(prefix="/api/leads", tags=["leads"])


def _group(field: str, sort: dict | None = None) -> list[dict]:
    return [
        {"$group": {"_id": f"${field}", "count": {"$sum": 1}}},
        {"$sort": sort or {"count": -1, "_id": 1}},
    ]


def _rows(items):
    return [{"key": r.pop("_id"), **r} for r in items]


@router.get("/summary")
def summary(f: LeadFilters = Depends(), user: CurrentUser = Depends(require_module("leads"))):
    facets = {
        "kpi": [{"$group": {
            "_id": None,
            "total": {"$sum": 1},
            "new_leads": {"$sum": {"$cond": [{"$eq": ["$result", "Lead mới"]}, 1, 0]}},
            "in_data": {"$sum": {"$cond": [{"$eq": ["$result", "Đã có trong Data"]}, 1, 0]}},
            "dup_external": {"$sum": {"$cond": [{"$eq": ["$result", "Trùng trong form ngoài"]}, 1, 0]}},
            "wants_talkshow": {"$sum": {"$cond": ["$wants_talkshow", 1, 0]}},
            "self_declared_registered": {"$sum": {"$cond": [{"$eq": ["$self_declared", "Đã đăng ký"]}, 1, 0]}},
            "contacts": {"$addToSet": "$contact_id"},
        }}],
        "by_source_result": [
            {"$group": {"_id": {"source": "$source", "result": "$result"}, "count": {"$sum": 1}}},
            {"$sort": {"_id.source": 1, "_id.result": 1}},
        ],
        "by_source": _group("source"),
        "by_campaign": [{"$match": {"campaign": {"$ne": None}}}, *_group("campaign")],
        "by_platform": [{"$match": {"platform": {"$ne": None}}}, *_group("platform")],
        "by_heard_from": [{"$match": {"heard_from": {"$ne": None}}}, *_group("heard_from")],
        "by_region": _group("region"),
        "by_board": _group("board_interest", {"_id": 1}),
        "by_segment": _group("segment", {"_id": 1}),
        "by_pic": _group("pic"),
        "by_self_declared": [{"$match": {"self_declared": {"$ne": None}}}, *_group("self_declared")],
        "by_question": [{"$match": {"question": {"$ne": None}}}, *_group("question")],
        "weekly": [
            {"$match": {"created_at": {"$ne": None}}},
            {"$group": {
                "_id": {"week": {"$dateToString": {"format": "%G-W%V", "date": "$created_at"}}, "source": "$source"},
                "start": {"$min": "$created_at"},
                "count": {"$sum": 1},
            }},
            {"$sort": {"_id.week": 1}},
        ],
    }
    res = next(get_db().leads.aggregate([{"$match": f.match(user)}, {"$facet": facets}]))
    kpi = res["kpi"][0] if res["kpi"] else {"total": 0, "new_leads": 0, "in_data": 0, "dup_external": 0, "wants_talkshow": 0, "self_declared_registered": 0, "contacts": []}
    kpi.pop("_id", None)
    kpi["unique_contacts"] = len([c for c in kpi.pop("contacts") if c])
    return {
        "kpi": kpi,
        "by_source_result": [{"source": r["_id"]["source"], "result": r["_id"]["result"], "count": r["count"]} for r in res["by_source_result"]],
        "weekly": [{"week": r["_id"]["week"], "source": r["_id"]["source"], "start": r["start"], "count": r["count"]} for r in res["weekly"]],
        **{k: _rows(res[k]) for k in facets if k.startswith("by_") and k != "by_source_result"},
    }


LIST_FIELDS = {
    "_id": 0, "source": 1, "row_no": 1, "contact_id": 1, "result": 1, "segment": 1, "created_at": 1, "full_name": 1,
    "email": 1, "phone": 1, "board_interest": 1, "province": 1, "region": 1, "wants_talkshow": 1, "self_declared": 1,
    "question": 1, "campaign": 1, "heard_from": 1, "platform": 1, "pic": 1, "note": 1,
}
SORTABLE = {"created_at", "source", "result", "segment", "campaign", "full_name", "contact_id"}
CSV_COLUMNS = [
    ("source", "Nguồn"), ("row_no", "Dòng gốc"), ("contact_id", "Contact ID"), ("result", "Kết quả làm sạch"),
    ("segment", "Segment"), ("created_at", "Thời gian"), ("full_name", "Họ tên"), ("email", "Email"), ("phone", "SĐT"),
    ("board_interest", "Bảng quan tâm"), ("province", "Khu vực"), ("campaign", "Campaign"), ("platform", "Nền tảng"),
    ("heard_from", "Biết Talkshow qua"), ("wants_talkshow", "Muốn nhận lịch Talkshow"), ("self_declared", "Tự khai"),
    ("question", "Câu hỏi"), ("pic", "PIC"),
]


@router.get("/list")
def list_leads(
    f: LeadFilters = Depends(),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    sort: str | None = None,
    format: str = Query("json", pattern="^(json|csv)$"),
    user: CurrentUser = Depends(require_module("leads")),
):
    match = f.match(user)
    if format == "csv":
        rows = list(get_db().leads.find(match, LIST_FIELDS).sort("created_at", 1))
        return csv_response(apply_pii(rows, user), CSV_COLUMNS, "lead_talkshow_fb.csv")
    total, rows = paginate(get_db().leads, match, LIST_FIELDS, sort, SORTABLE, page, page_size, ("created_at", -1))
    return {"total": total, "page": page, "page_size": page_size, "rows": apply_pii(rows, user)}
