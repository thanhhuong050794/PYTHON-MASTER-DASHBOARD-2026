from fastapi import APIRouter, Depends

from ..db import get_db
from ..filters import ContactFilters, effective_partner
from ..security import CurrentUser, require_module

router = APIRouter(prefix="/api/marketing", tags=["marketing"])


def _div(a, b):
    return a / b if a is not None and b else None


def marketing_summary(f: ContactFilters, user: CurrentUser) -> dict:
    db = get_db()
    match = f.match(user)
    metrics = {
        r["_id"]: r
        for r in db.contacts.aggregate([
            {"$match": match},
            {"$group": {
                "_id": "$channel",
                "contacts": {"$sum": 1},
                "web_registered": {"$sum": {"$cond": ["$web_registered", 1, 0]}},
                "unregistered": {"$sum": {"$cond": ["$web_registered", 0, 1]}},
                "paid": {"$sum": {"$cond": ["$paid", 1, 0]}},
                "revenue": {"$sum": "$revenue"},
                "assumed": {"$sum": {"$cond": ["$channel_is_assumed", 1, 0]}},
            }},
        ])
    }
    # Ngân sách là dữ liệu cấp kênh: đối tác chỉ thấy ngân sách kênh mình sở hữu
    partner = effective_partner(user, f.partner)
    budget_match = {"partners": partner} if partner else {}
    budgets = {b["channel"]: b for b in db.channel_budgets.find(budget_match, {"_id": 0})}
    order = {b["channel"]: b["order"] for b in db.channel_budgets.find({}, {"channel": 1, "order": 1})}

    channels = []
    for name in sorted(set(metrics) | set(budgets), key=lambda n: order.get(n, 99)):
        m = metrics.get(name, {})
        b = budgets.get(name)
        web, paid, revenue = m.get("web_registered", 0), m.get("paid", 0), m.get("revenue", 0.0)
        row = {
            "channel": name,
            "contacts": m.get("contacts", 0),
            "web_registered": web,
            "unregistered": m.get("unregistered", 0),
            "paid": paid,
            "revenue": revenue,
            "conversion": _div(paid, web),
            "assumed_contacts": m.get("assumed", 0),
            "budget_visible": b is not None,
            "budget": None, "roi": None, "cpa_lead": None, "cpa_paid": None, "cpa_active": None,
            "clicks": None, "ctr": None, "active_candidates_assumed": None,
            "is_assumed": None, "data_note": None, "original_report": None,
        }
        if b:
            budget = b["budget"]
            row.update({
                "budget": budget,
                "roi": _div(revenue - budget, budget),
                "cpa_lead": _div(budget, web),
                "cpa_paid": _div(budget, paid),
                "cpa_active": _div(budget, b.get("active_candidates_assumed")),
                "clicks": b.get("clicks"),
                "ctr": b.get("ctr"),
                "active_candidates_assumed": b.get("active_candidates_assumed"),
                "is_assumed": b.get("is_assumed"),
                "data_note": b.get("data_note"),
                "original_report": b.get("original_report"),
            })
        channels.append(row)

    visible = [c for c in channels if c["budget_visible"]]
    total_budget = sum(c["budget"] or 0 for c in visible)
    total_revenue = sum(c["revenue"] for c in channels)
    budget_revenue = sum(c["revenue"] for c in visible)
    return {
        "kpi": {
            "contacts": sum(c["contacts"] for c in channels),
            "web_registered": sum(c["web_registered"] for c in channels),
            "paid": sum(c["paid"] for c in channels),
            "revenue": total_revenue,
            "budget": total_budget if visible else None,
            # ROI toàn chương trình (như báo cáo gốc) chỉ có nghĩa khi thấy toàn bộ ngân sách
            "roi_program": _div(total_revenue - total_budget, total_budget) if visible and not partner else None,
            "roi_paid_channels": _div(budget_revenue - total_budget, total_budget) if visible else None,
            "cpa_paid": _div(total_budget, sum(c["paid"] for c in visible)) if visible else None,
        },
        "channels": channels,
        "filtered": f.is_filtered(),
    }


@router.get("/summary")
def summary(f: ContactFilters = Depends(), user: CurrentUser = Depends(require_module("marketing"))):
    return marketing_summary(f, user)
