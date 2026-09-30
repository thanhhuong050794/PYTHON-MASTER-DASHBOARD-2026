import statistics

from fastapi import APIRouter, Depends, Query

from ..db import get_db
from ..filters import ExamFilters, apply_pii, csv_response, paginate
from ..security import CurrentUser, require_module

router = APIRouter(prefix="/api/exams", tags=["exams"])

Q = "$qualifier.total"
CERT = {"$cond": ["$certificate", 1, 0]}
ADV = {"$cond": ["$advanced", 1, 0]}
GRADES = ["Giỏi", "Khá", "Trung bình", "Yếu"]


def _stats_group(field: str) -> list[dict]:
    return [
        {"$group": {
            "_id": f"${field}",
            "count": {"$sum": 1},
            "avg": {"$avg": Q},
            "max": {"$max": Q},
            "min": {"$min": Q},
            "certificates": {"$sum": CERT},
            "finalists": {"$sum": ADV},
            "totals": {"$push": Q},
        }},
        {"$sort": {"avg": -1}},
    ]


def _with_box(rows: list[dict]) -> list[dict]:
    """Thêm tứ phân vị để vẽ boxplot, bỏ mảng điểm thô khỏi response."""
    out = []
    for r in rows:
        totals = sorted(t for t in r.pop("totals") if t is not None)
        box = None
        if len(totals) >= 2:
            q1, q2, q3 = statistics.quantiles(totals, n=4, method="inclusive")
            box = [totals[0], q1, q2, q3, totals[-1]]
        elif totals:
            box = [totals[0]] * 5
        out.append({"key": r.pop("_id"), **r, "box": box, "cert_rate": r["certificates"] / r["count"] if r["count"] else None})
    return out


@router.get("/summary")
def summary(f: ExamFilters = Depends(), user: CurrentUser = Depends(require_module("exams"))):
    db = get_db()
    meta = db.meta.find_one({"_id": "exam"}) or {"params": {}, "structure": [], "datasets": []}
    max_of = {(s["board"], s["round"], s["section"]): s["max_score"] for s in meta["structure"]}

    facets = {
        "kpi": [{"$group": {
            "_id": None,
            "count": {"$sum": 1},
            "avg": {"$avg": Q}, "max": {"$max": Q}, "min": {"$min": Q},
            "finalists": {"$sum": ADV},
            "final_avg": {"$avg": "$final.total"},
            "certificates": {"$sum": CERT},
            "paid": {"$sum": {"$cond": ["$paid", 1, 0]}},
        }}],
        "by_board": _stats_group("board"),
        "final_by_board": [
            {"$match": {"final": {"$ne": None}}},
            {"$group": {"_id": "$board", "count": {"$sum": 1}, "avg": {"$avg": "$final.total"},
                        "max": {"$max": "$final.total"}, "min": {"$min": "$final.total"},
                        "certificates": {"$sum": {"$cond": [{"$gte": ["$final.total", meta["params"].get("certificate_threshold", 600)]}, 1, 0]}}}},
        ],
        "histogram": [
            {"$match": {"qualifier.total": {"$ne": None}}},
            {"$group": {"_id": {"board": "$board", "bin": {"$min": [9, {"$floor": {"$divide": [Q, 100]}}]}}, "count": {"$sum": 1}}},
        ],
        "grades": [
            {"$project": {"board": 1, "g": [
                {"round": "qualifier", "grade": "$qualifier.grade"},
                {"round": "final", "grade": "$final.grade"},
            ]}},
            {"$unwind": "$g"},
            {"$match": {"g.grade": {"$ne": None}}},
            {"$group": {"_id": {"board": "$board", "round": "$g.round", "grade": "$g.grade"}, "count": {"$sum": 1}}},
        ],
        "sections": [
            {"$project": {"board": 1, "parts": [
                {"round": "qualifier", "s": {"$objectToArray": {"$ifNull": ["$qualifier.sections", {}]}}},
                {"round": "final", "s": {"$objectToArray": {"$ifNull": ["$final.sections", {}]}}},
            ]}},
            {"$unwind": "$parts"},
            {"$unwind": "$parts.s"},
            {"$group": {"_id": {"board": "$board", "round": "$parts.round", "section": "$parts.s.k"},
                        "avg": {"$avg": "$parts.s.v"}, "count": {"$sum": 1}}},
        ],
        "by_school": _stats_group("school"),
        "by_school_type": _stats_group("school_type"),
        "by_province": _stats_group("province"),
        "by_region": _stats_group("region"),
        "by_paid": _stats_group("paid"),
        "finalists": [
            {"$match": {"final": {"$ne": None}}},
            {"$project": {"_id": 0, "full_name": 1, "board": 1, "school": 1, "qualifier": "$qualifier.total",
                          "final": "$final.total", "final_rank": "$final.rank"}},
            {"$sort": {"board": 1, "final": -1}},
        ],
    }
    res = next(db.exam_candidates.aggregate([{"$match": f.match(user)}, {"$facet": facets}]))
    kpi = res["kpi"][0] if res["kpi"] else {"count": 0, "avg": None, "max": None, "min": None, "finalists": 0, "final_avg": None, "certificates": 0, "paid": 0}
    kpi.pop("_id", None)
    kpi["cert_rate"] = kpi["certificates"] / kpi["count"] if kpi["count"] else None

    sections = []
    for r in res["sections"]:
        k = r["_id"]
        mx = max_of.get((k["board"], k["round"], k["section"]))
        sections.append({**k, "avg": r["avg"], "count": r["count"], "max_score": mx, "pct": r["avg"] / mx if mx else None})

    return {
        "kpi": kpi,
        "params": meta["params"],
        "structure": meta["structure"],
        "datasets": meta["datasets"],
        "by_board": _with_box(res["by_board"]),
        "final_by_board": [{"key": r.pop("_id"), **r} for r in res["final_by_board"]],
        "histogram": [{"board": r["_id"]["board"], "bin": int(r["_id"]["bin"]), "count": r["count"]} for r in res["histogram"]],
        "grades": [{**r["_id"], "count": r["count"]} for r in res["grades"]],
        "grade_order": GRADES,
        "sections": sections,
        "by_school": _with_box(res["by_school"]),
        "by_school_type": _with_box(res["by_school_type"]),
        "by_province": _with_box(res["by_province"]),
        "by_region": _with_box(res["by_region"]),
        "by_paid": _with_box(res["by_paid"]),
        "finalists": res["finalists"],
    }


LIST_FIELDS = {
    "_id": 0, "stt": 1, "contact_id": 1, "full_name": 1, "email": 1, "board": 1, "school": 1, "school_type": 1,
    "province": 1, "region": 1, "paid": 1, "qualifier": 1, "final": 1, "advanced": 1, "certificate": 1, "best_total": 1,
}
SORTABLE = {"qualifier.total", "qualifier.rank", "final.total", "full_name", "school", "province", "stt", "best_total"}
CSV_COLUMNS = [
    ("stt", "STT"), ("contact_id", "Contact ID"), ("full_name", "Họ tên"), ("email", "Email"), ("board", "Bảng"),
    ("school", "Trường"), ("province", "Tỉnh/TP"), ("paid", "Đã thanh toán"),
    ("qualifier.sections.reading", "VL – Đọc hiểu"), ("qualifier.sections.design", "VL – Design"),
    ("qualifier.sections.debugging", "VL – Debugging"), ("qualifier.total", "VL – Tổng"), ("qualifier.rank", "VL – Hạng"),
    ("qualifier.grade", "VL – Xếp loại"), ("advanced", "Vào chung kết"), ("final.total", "CK – Tổng"),
    ("final.rank", "CK – Hạng"), ("certificate", "Chứng chỉ COS Pro"),
]


@router.get("/list")
def list_candidates(
    f: ExamFilters = Depends(),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    sort: str | None = None,
    format: str = Query("json", pattern="^(json|csv)$"),
    user: CurrentUser = Depends(require_module("exams")),
):
    match = f.match(user)
    if format == "csv":
        rows = list(get_db().exam_candidates.find(match, LIST_FIELDS).sort([("board", 1), ("qualifier.rank", 1)]))
        return csv_response(apply_pii(rows, user), CSV_COLUMNS, f"diem_thi_{f.dataset}.csv")
    total, rows = paginate(get_db().exam_candidates, match, LIST_FIELDS, sort, SORTABLE, page, page_size, ("qualifier.total", -1))
    return {"total": total, "page": page, "page_size": page_size, "rows": apply_pii(rows, user)}
