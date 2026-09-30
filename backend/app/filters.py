"""Bộ lọc dùng chung: phạm vi đối tác (row-level) + tham số lọc trên query string."""

import csv
import io
import re
from datetime import datetime, timedelta

from fastapi import HTTPException, Query, status
from fastapi.responses import StreamingResponse

from .partners import PARTNER_CODES
from .security import CurrentUser


def split_values(v: str | None) -> list[str]:
    if not v:
        return []
    return [p.strip() for p in v.split(",") if p.strip()]


def scope_match(user: CurrentUser, partner: str | None) -> dict:
    """Đối tác chỉ thấy document gắn mã của mình; admin có thể xem theo góc nhìn 1 đối tác."""
    if not user.is_admin:
        return {"partners": user.partner_code}
    if partner:
        if partner not in PARTNER_CODES:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Mã đối tác không hợp lệ: {partner}")
        return {"partners": partner}
    return {}


def effective_partner(user: CurrentUser, partner: str | None) -> str | None:
    return user.partner_code if not user.is_admin else partner


def add_in(match: dict, field: str, raw: str | None) -> None:
    values = split_values(raw)
    if not values:
        return
    # "__none__" cho phép lọc giá trị trống (VD: liên hệ chưa có PIC)
    parsed = [None if v == "__none__" else v for v in values]
    match[field] = {"$in": parsed}


def add_bool(match: dict, field: str, raw: str | None) -> None:
    if raw in ("true", "false"):
        match[field] = raw == "true"


def add_date_range(match: dict, field: str, date_from: str | None, date_to: str | None) -> None:
    rng = {}
    try:
        if date_from:
            rng["$gte"] = datetime.fromisoformat(date_from)
        if date_to:
            rng["$lt"] = datetime.fromisoformat(date_to) + timedelta(days=1)
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ngày lọc phải theo định dạng YYYY-MM-DD")
    if rng:
        match[field] = rng


def add_search(match: dict, fields: list[str], q: str | None) -> None:
    if not q or not q.strip():
        return
    pattern = re.escape(q.strip()[:80])
    match["$or"] = [{f: {"$regex": pattern, "$options": "i"}} for f in fields]


class ContactFilters:
    def __init__(
        self,
        partner: str | None = Query(None, description="Admin: xem theo phạm vi 1 đối tác"),
        date_from: str | None = Query(None, description="Tiếp xúc đầu tiên từ ngày (YYYY-MM-DD)"),
        date_to: str | None = Query(None),
        board: str | None = Query(None, description="Bảng A,Bảng B"),
        region: str | None = Query(None),
        province: str | None = Query(None),
        payment_status: str | None = Query(None),
        segment: str | None = Query(None),
        channel: str | None = Query(None),
        source: str | None = Query(None, description="Website,Talkshow,FB Lead Form"),
        pic: str | None = Query(None),
        venue: str | None = Query(None),
        q: str | None = Query(None, description="Tìm theo mã, tên, email"),
    ):
        self.partner = partner
        self.date_from, self.date_to = date_from, date_to
        self.board, self.region, self.province = board, region, province
        self.payment_status, self.segment, self.channel = payment_status, segment, channel
        self.source, self.pic, self.venue, self.q = source, pic, venue, q

    def is_filtered(self) -> bool:
        return any([
            self.date_from, self.date_to, self.board, self.region, self.province, self.payment_status,
            self.segment, self.channel, self.source, self.pic, self.venue, self.q,
        ])

    def match(self, user: CurrentUser) -> dict:
        m = scope_match(user, self.partner)
        add_date_range(m, "first_touch", self.date_from, self.date_to)
        add_in(m, "board", self.board)
        add_in(m, "region", self.region)
        add_in(m, "province", self.province)
        add_in(m, "payment_status", self.payment_status)
        add_in(m, "segment", self.segment)
        add_in(m, "channel", self.channel)
        add_in(m, "pic", self.pic)
        add_in(m, "exam_venue", self.venue)
        sources = split_values(self.source)
        if sources:
            m["sources"] = {"$in": sources}
        add_search(m, ["contact_id", "full_name", "email"], self.q)
        return m


class LeadFilters:
    def __init__(
        self,
        partner: str | None = Query(None),
        date_from: str | None = Query(None),
        date_to: str | None = Query(None),
        source: str | None = Query(None, description="Talkshow,FB Lead Form"),
        board: str | None = Query(None, description="Bảng quan tâm"),
        region: str | None = Query(None),
        result: str | None = Query(None),
        segment: str | None = Query(None),
        campaign: str | None = Query(None),
        platform: str | None = Query(None),
        pic: str | None = Query(None),
        q: str | None = Query(None),
    ):
        self.partner = partner
        self.date_from, self.date_to = date_from, date_to
        self.source, self.board, self.region, self.result = source, board, region, result
        self.segment, self.campaign, self.platform, self.pic, self.q = segment, campaign, platform, pic, q

    def match(self, user: CurrentUser) -> dict:
        m = scope_match(user, self.partner)
        add_date_range(m, "created_at", self.date_from, self.date_to)
        add_in(m, "source", self.source)
        add_in(m, "board_interest", self.board)
        add_in(m, "region", self.region)
        add_in(m, "result", self.result)
        add_in(m, "segment", self.segment)
        add_in(m, "campaign", self.campaign)
        add_in(m, "platform", self.platform)
        add_in(m, "pic", self.pic)
        add_search(m, ["contact_id", "full_name", "email"], self.q)
        return m


class ExamFilters:
    def __init__(
        self,
        partner: str | None = Query(None),
        dataset: str = Query("PM119", description="PM119 | A24 | B95"),
        board: str | None = Query(None),
        region: str | None = Query(None),
        province: str | None = Query(None),
        school_type: str | None = Query(None),
        school: str | None = Query(None),
        paid: str | None = Query(None, description="true | false"),
        grade: str | None = Query(None, description="Xếp loại Vòng loại"),
        certificate: str | None = Query(None, description="true | false"),
        advanced: str | None = Query(None, description="true | false"),
        q: str | None = Query(None),
    ):
        self.partner, self.dataset = partner, dataset
        self.board, self.region, self.province = board, region, province
        self.school_type, self.school, self.paid = school_type, school, paid
        self.grade, self.certificate, self.advanced, self.q = grade, certificate, advanced, q

    def match(self, user: CurrentUser) -> dict:
        m = scope_match(user, self.partner)
        m["dataset"] = self.dataset
        add_in(m, "board", self.board)
        add_in(m, "region", self.region)
        add_in(m, "province", self.province)
        add_in(m, "school_type", self.school_type)
        add_in(m, "school", self.school)
        add_in(m, "qualifier.grade", self.grade)
        add_bool(m, "paid", self.paid)
        add_bool(m, "certificate", self.certificate)
        add_bool(m, "advanced", self.advanced)
        add_search(m, ["contact_id", "full_name", "email", "school"], self.q)
        return m


# ─────────────────────────── Che thông tin cá nhân ───────────────────────────


def mask_email(v: str | None) -> str | None:
    if not v or "@" not in v:
        return v
    name, domain = v.split("@", 1)
    return f"{name[:2]}{'*' * max(len(name) - 2, 3)}@{domain}"


def mask_phone(v: str | None) -> str | None:
    if not v or len(v) < 6:
        return v
    return f"{v[:3]}****{v[-3:]}"


PII_MASKERS = {
    "email": mask_email,
    "email_raw": mask_email,
    "phone": mask_phone,
    "phone_raw": mask_phone,
}
PII_HIDDEN = {"cccd", "dob", "notes", "note"}


def apply_pii(rows: list[dict], user: CurrentUser) -> list[dict]:
    if user.can_view_pii:
        return rows
    for r in rows:
        for field, fn in PII_MASKERS.items():
            if field in r:
                r[field] = fn(r[field])
        for field in PII_HIDDEN & r.keys():
            r[field] = None
    return rows


# ─────────────────────────── Tiện ích phân trang & xuất CSV ───────────────────────────


def paginate(coll, match: dict, projection: dict, sort: str | None, allowed_sorts: set[str], page: int, page_size: int, default_sort: tuple[str, int]):
    sort_field, sort_dir = default_sort
    if sort:
        field = sort.lstrip("-")
        if field not in allowed_sorts:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Không sắp xếp được theo {field}")
        sort_field, sort_dir = field, -1 if sort.startswith("-") else 1
    total = coll.count_documents(match)
    cursor = (
        coll.find(match, projection)
        .sort([(sort_field, sort_dir), ("_id", 1)])
        .skip((page - 1) * page_size)
        .limit(page_size)
    )
    return total, list(cursor)


def csv_response(rows: list[dict], columns: list[tuple[str, str]], filename: str) -> StreamingResponse:
    buf = io.StringIO()
    buf.write("﻿")  # BOM để Excel đọc đúng tiếng Việt
    writer = csv.writer(buf)
    writer.writerow([label for _, label in columns])
    for r in rows:
        out = []
        for key, _ in columns:
            v = r
            for part in key.split("."):
                v = v.get(part) if isinstance(v, dict) else None
            if isinstance(v, list):
                v = "; ".join(str(x) for x in v)
            elif isinstance(v, datetime):
                v = v.strftime("%Y-%m-%d %H:%M")
            elif isinstance(v, bool):
                v = "Có" if v else "Không"
            out.append("" if v is None else v)
        writer.writerow(out)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
