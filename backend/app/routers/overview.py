from fastapi import APIRouter, Depends, Query

from ..db import get_db
from ..filters import ContactFilters, add_in, effective_partner, scope_match
from ..reports import report_response
from ..security import CurrentUser, require_module
from .contacts import contact_summary
from .marketing import marketing_summary

router = APIRouter(prefix="/api/overview", tags=["overview"])


def _exam_snapshot(user: CurrentUser, f: ContactFilters) -> dict:
    match = scope_match(user, f.partner)
    match["dataset"] = "PM119"
    add_in(match, "board", f.board)
    add_in(match, "region", f.region)
    res = list(get_db().exam_candidates.aggregate([
        {"$match": match},
        {"$facet": {
            "kpi": [{"$group": {
                "_id": None, "count": {"$sum": 1}, "avg": {"$avg": "$qualifier.total"}, "max": {"$max": "$qualifier.total"},
                "finalists": {"$sum": {"$cond": ["$advanced", 1, 0]}}, "certificates": {"$sum": {"$cond": ["$certificate", 1, 0]}},
            }}],
            "grades": [
                {"$group": {"_id": {"board": "$board", "grade": "$qualifier.grade"}, "count": {"$sum": 1}}},
            ],
        }},
    ]))[0]
    kpi = res["kpi"][0] if res["kpi"] else {"count": 0, "avg": None, "max": None, "finalists": 0, "certificates": 0}
    kpi.pop("_id", None)
    kpi["cert_rate"] = kpi["certificates"] / kpi["count"] if kpi["count"] else None
    return {"kpi": kpi, "grades": [{**r["_id"], "count": r["count"]} for r in res["grades"]]}


@router.get("")
def overview(f: ContactFilters = Depends(), user: CurrentUser = Depends(require_module("overview"))):
    db = get_db()
    modules = set(user.modules)
    viewing = effective_partner(user, f.partner)
    if user.is_admin and viewing:
        partner = db.partners.find_one({"_id": viewing}) or {}
        modules = set(partner.get("modules", []))

    out: dict = {"modules": sorted(modules), "viewing_partner": viewing}
    if "contacts" in modules:
        s = contact_summary(f.match(user))
        out["crm"] = {k: s[k] for k in ("kpi", "funnel", "timeline", "by_segment", "by_region", "by_board", "by_channel", "by_payment")}
    if "marketing" in modules:
        m = marketing_summary(f, user)
        out["marketing"] = {"kpi": m["kpi"], "channels": m["channels"]}
    if "exams" in modules:
        out["exams"] = _exam_snapshot(user, f)
    if "sponsorship" in modules:
        scope = {"partners": viewing} if viewing else {}
        benefits = list(db.sponsor_benefits.find(scope, {"_id": 0, "partners": 0}))
        reach = list(db.media_reach.find(scope, {"_id": 0, "partners": 0}))
        out["sponsorship"] = {
            "benefits": benefits,
            "avg_progress": sum(b["progress"] for b in benefits) / len(benefits) if benefits else None,
            "total_reach": sum(r["reach"] or 0 for r in reach),
            "total_engagement": sum(r["engagement"] or 0 for r in reach),
        }
    if user.is_admin and not viewing:
        out["pipeline"] = db.meta.find_one({"_id": "pipeline"}, {"_id": 0})
    return out


@router.get("/export")
def export_overview(
    format: str = Query("xlsx", pattern="^(xlsx|docx|pdf)$"),
    f: ContactFilters = Depends(),
    user: CurrentUser = Depends(require_module("overview")),
):
    """Xuất báo cáo tổng quan (Excel / Word / PDF) theo đúng bộ lọc và phạm vi đối tác đang xem."""
    return report_response(format, overview(f, user), user, f)
