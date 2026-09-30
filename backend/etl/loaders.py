"""Đọc 6 workbook nguồn → các document chuẩn hoá cho MongoDB.

Nguồn sự thật của CRM là Booklet 2 (đã làm sạch, gộp trùng thành 145 Contact ID).
Booklet 1 được nạp nguyên dạng vào các collection raw_* để truy vết.
Điểm thi là dữ liệu GIẢ LẬP; các cột công thức (tổng, hạng, xếp loại…) được tính lại
theo đúng quy tắc trong sheet Tham_so vì 2 file Bảng A/B không lưu giá trị đã tính.
"""

import hashlib
import math
from collections import defaultdict
from pathlib import Path

import pandas as pd

from .normalize import (
    clean,
    norm_province,
    region_of,
    safe_key,
    split_list,
    to_date_str,
    to_dt,
    to_float,
    to_int,
    to_phone,
    yes,
)
from .tagging import channel_partners, contact_partners, exam_partners, lead_partners

FILE_PATTERNS = {
    "booklet1": "NEU_CaseStudy_Booklet1_Raw_Data_PTIT*.xlsx",
    "booklet2": "NEU_CaseStudy_Booklet2_Cleaned_Answer_Key*.xlsx",
    "roi": "Bao_Cao_Hieu_Qua_Truyen_Thong_ROI_DoiSoat*.xlsx",
    "exam_119": "diem_gia_lap_119_thi_sinh*.xlsx",
    "exam_a": "diem_gia_lap_Bang_A_24*.xlsx",
    "exam_b": "diem_gia_lap_Bang_B_95*.xlsx",
}

SOURCE_LABELS = {
    "Website (Data)": "Website",
    "Talkshow Google Form": "Talkshow",
    "FB Lead Form v2": "FB Lead Form",
    "Data": "Website",
    "Talkshow_GGForm": "Talkshow",
    "FB Form v2": "FB Lead Form",
}

LEAD_RESULT_LABELS = {
    "Giữ (lead mới)": "Lead mới",
    "Đã có trong Data – gộp vào hồ sơ": "Đã có trong Data",
    "Trùng trong file ngoài – gộp": "Trùng trong form ngoài",
}

PAYMENT_LABELS = {
    "Miễn phí (free)": "Miễn phí",
}

SECTION_LABELS = {"reading": "Đọc hiểu code", "design": "Design · viết hàm", "debugging": "Debugging"}
ROUND_KEYS = {"VL": "qualifier", "CK": "final"}
ROUND_LABELS = {"qualifier": "Vòng loại", "final": "Chung kết"}

EXAM_DATASETS = [
    {"code": "PM119", "label": "119 thí sinh (liên kết CRM)", "file": "exam_119", "linked": True},
    {"code": "A24", "label": "Bảng A – 24 thí sinh (bộ độc lập)", "file": "exam_a", "linked": False},
    {"code": "B95", "label": "Bảng B – 95 thí sinh (bộ độc lập)", "file": "exam_b", "linked": False},
]

NO_PERMISSION_CAMPAIGN = "(Không đủ quyền xem campaign)"


def find_files(data_dir: Path) -> dict[str, Path]:
    found = {}
    for key, pattern in FILE_PATTERNS.items():
        matches = sorted(data_dir.glob(pattern))
        if not matches:
            raise FileNotFoundError(f"Không tìm thấy file {pattern} trong {data_dir}")
        found[key] = matches[0]
    return found


def file_info(path: Path) -> dict:
    return {
        "name": path.name,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "size": path.stat().st_size,
        "sheets": pd.ExcelFile(path).sheet_names,
    }


def _sheet(path: Path, sheet: str, header: int) -> pd.DataFrame:
    df = pd.read_excel(path, sheet_name=sheet, header=header, dtype=object)
    df.columns = [str(c).strip() for c in df.columns]
    return df.dropna(how="all")


def _records(df: pd.DataFrame) -> list[dict]:
    return [{k: clean(v) for k, v in row.items()} for row in df.to_dict("records")]


def _source_label(v) -> str | None:
    v = clean(v)
    return SOURCE_LABELS.get(v, v)


# ─────────────────────────── Booklet 1: dữ liệu thô ───────────────────────────


def load_raw(path: Path) -> dict[str, list[dict]]:
    """3 sheet thô, giữ nguyên giá trị; row_no = số dòng trong Excel để đối chiếu Duplicate_Log."""
    out = {}
    for sheet, coll in (("Data", "raw_web_signups"), ("Talkshow_GGForm", "raw_talkshow"), ("FB Form v2", "raw_fb_leads")):
        df = pd.read_excel(path, sheet_name=sheet, header=0, dtype=object)
        docs = []
        for i, row in enumerate(df.to_dict("records")):
            values = {safe_key(k): clean(v) for k, v in row.items() if not str(k).startswith("col")}
            if not any(v is not None for v in values.values()):
                continue
            docs.append({"row_no": i + 2, "sheet": sheet, **values})
        out[coll] = docs
    return out


# ─────────────────────────── Booklet 2: CRM đã làm sạch ───────────────────────────


def load_crm(booklet2: Path, roi: Path, raw: dict[str, list[dict]]) -> dict[str, list[dict]]:
    master = _records(_sheet(booklet2, "Master_Contacts", 8))
    signups_df = _records(_sheet(booklet2, "Main_Signups_Clean", 7))
    leads_df = _records(_sheet(booklet2, "External_Leads_Clean", 7))
    dup_df = _records(_sheet(booklet2, "Duplicate_Log", 6))
    dq_df = _records(_sheet(booklet2, "Data_Quality", 6))
    attribution = {r["Contact ID"]: r for r in _records(_sheet(roi, "Contacts_Attribution", 5)) if r.get("Contact ID")}

    venues = {}
    for sheet, venue in (("Bảng B – Hà Nội", "Hà Nội"), ("Bảng B – TP.HCM", "TP.HCM")):
        for r in _records(_sheet(booklet2, sheet, 7)):
            if r.get("Contact ID"):
                venues[r["Contact ID"]] = {"venue": venue, "venue_address": r.get("Địa điểm thi")}

    # Thông tin chỉ có ở dòng website: UTM partner, mã KM, ngày sinh, CCCD
    by_contact_signups = defaultdict(list)
    for r in signups_df:
        if r.get("Contact ID"):
            by_contact_signups[r["Contact ID"]].append(r)

    contacts = []
    for r in master:
        cid = r.get("Contact ID")
        if not cid or not str(cid).startswith("PT-"):
            continue
        rows = by_contact_signups.get(cid, [])
        kept = next((s for s in rows if s.get("Giữ/Trùng") == "Giữ"), rows[0] if rows else {})
        attr = attribution.get(cid, {})
        province = norm_province(r.get("Khu vực"))
        sources = [_source_label(s) for s in split_list(r.get("Nguồn dữ liệu"), ",")]
        payment = clean(r.get("Trạng thái thanh toán"))
        payment = PAYMENT_LABELS.get(payment, payment)
        venue = venues.get(cid, {})
        doc = {
            "_id": cid,
            "contact_id": cid,
            "full_name": r.get("Họ tên"),
            "email": r.get("Email"),
            "phone": to_phone(r.get("SĐT")),
            "board": r.get("Bảng"),
            "province": province,
            "region": region_of(province),
            "school": r.get("Trường (chuẩn hoá)"),
            "web_registered": yes(r.get("Đăng ký web")),
            "payment_status": payment,
            "paid": payment in ("Đã thanh toán", "Miễn phí"),
            "fee": to_float(r.get("Lệ phí (VND)")),
            "revenue": to_float(attr.get("Lệ phí ghi nhận (VND)")) or 0.0,
            "has_external": yes(r.get("Có tương tác Talkshow/FB")),
            "talkshow_form": yes(r.get("Talkshow Google Form")),
            "fb_form": yes(r.get("FB Lead Form")),
            "wants_talkshow": None if clean(r.get("Muốn nhận lịch Talkshow")) is None else yes(r.get("Muốn nhận lịch Talkshow")),
            "question": r.get("Câu hỏi / Quan tâm"),
            "self_declared": r.get("Tự khai đã đăng ký?"),
            "merged_count": to_int(r.get("Số bản ghi gộp")) or 1,
            "data_rows": to_int(r.get("Số dòng trong Data")) or 0,
            "sources": sources,
            "source_combo": " + ".join(sources) if sources else None,
            "first_touch": to_dt(r.get("Tiếp xúc đầu tiên")),
            "web_registered_at": to_dt(r.get("Ngày đăng ký web")),
            "segment": r.get("Segment"),
            "segment_name": r.get("Tên segment"),
            "sub_segment": r.get("Sub-segment"),
            "drip": r.get("Drip campaign"),
            "flags": split_list(r.get("Cờ cần kiểm tra"), ";"),
            "pic": r.get("PIC"),
            "notes": r.get("Ghi chú (gộp)"),
            "utm_partners": sorted({s["Partner"] for s in rows if s.get("Partner")}),
            "promo_codes": sorted({s["Mã khuyến mãi"] for s in rows if s.get("Mã khuyến mãi")}),
            "dob": to_date_str(kept.get("Ngày sinh")),
            "cccd": clean(kept.get("Số CCCD")),
            "channel_base": attr.get("Kênh gán theo dữ liệu Booklet 2"),
            "channel": attr.get("Kênh cuối cùng") or attr.get("Kênh gán theo dữ liệu Booklet 2"),
            "channel_is_assumed": clean(attr.get("Điều chỉnh GIẢ ĐỊNH (Google/TikTok/Email/Zalo)")) is not None,
            "exam_venue": venue.get("venue"),
            "exam_venue_address": venue.get("venue_address"),
        }
        doc["partners"] = contact_partners(doc)
        contacts.append(doc)

    tags_by_contact = {c["_id"]: c["partners"] for c in contacts}

    signups = []
    for r in signups_df:
        cid = r.get("Contact ID")
        province = norm_province(r.get("Khu vực (chuẩn hoá)"))
        signups.append({
            "row_no": to_int(r.get("Dòng gốc (Data)")),
            "contact_id": cid,
            "is_kept": r.get("Giữ/Trùng") == "Giữ",
            "status": r.get("Giữ/Trùng"),
            "registered_at": to_dt(r.get("Thời gian đăng ký")),
            "full_name": r.get("Họ tên (chuẩn hoá)"),
            "full_name_raw": r.get("Họ tên (gốc)"),
            "email": r.get("Email (chuẩn hoá)"),
            "email_raw": r.get("Email (gốc)"),
            "phone": to_phone(r.get("SĐT (chuẩn hoá)")),
            "phone_raw": clean(r.get("SĐT (gốc)")),
            "board": r.get("Bảng"),
            "province": province,
            "region": region_of(province),
            "school": r.get("Trường (chuẩn hoá)"),
            "school_raw": r.get("Trường (gốc)"),
            "dob": to_date_str(r.get("Ngày sinh")),
            "cccd": clean(r.get("Số CCCD")),
            "fee": to_float(r.get("Lệ phí")),
            "payment_status": r.get("payment_status"),
            "utm_partner": r.get("Partner"),
            "promo_code": r.get("Mã khuyến mãi"),
            "pic": r.get("PIC"),
            "note": r.get("Ghi chú"),
            "partners": tags_by_contact.get(cid, []),
        })

    fb_raw = {d["row_no"]: d for d in raw["raw_fb_leads"]}
    leads = []
    for r in leads_df:
        cid = r.get("Contact ID")
        source = _source_label(r.get("Nguồn"))
        row_no = to_int(r.get("Dòng gốc"))
        province = norm_province(r.get("Khu vực (chuẩn hoá)"))
        channel = r.get("Campaign / Kênh")
        lead = {
            "source": source,
            "row_no": row_no,
            "contact_id": cid,
            "result": LEAD_RESULT_LABELS.get(r.get("Kết quả làm sạch"), r.get("Kết quả làm sạch")),
            "segment": r.get("Segment"),
            "created_at": to_dt(r.get("Thời gian")),
            "full_name": r.get("Họ tên (chuẩn hoá)"),
            "full_name_raw": r.get("Họ tên (gốc)"),
            "email": r.get("Email (chuẩn hoá)"),
            "email_raw": r.get("Email (gốc)"),
            "phone": to_phone(r.get("SĐT (chuẩn hoá)")),
            "phone_raw": clean(r.get("SĐT (gốc)")),
            "board_interest": r.get("Bảng quan tâm"),
            "province": province,
            "region": region_of(province),
            "school_raw": r.get("Trường (gốc)"),
            "wants_talkshow": yes(r.get("Muốn nhận lịch Talkshow")),
            "self_declared": r.get("Tự khai đã đăng ký"),
            "question": r.get("Câu hỏi"),
            "pic": r.get("PIC"),
            "note": r.get("Ghi chú"),
            "campaign": None,
            "heard_from": None,
            "platform": None,
            "ad_name": None,
            "adset_name": None,
        }
        if source == "FB Lead Form":
            raw_row = fb_raw.get(row_no, {})
            no_perm = bool(channel and "không có đủ quyền" in channel.lower())
            lead["campaign"] = NO_PERMISSION_CAMPAIGN if no_perm else channel
            platform = clean(raw_row.get("platform"))
            lead["platform"] = {"fb": "Facebook", "ig": "Instagram"}.get(platform, platform)
            lead["ad_name"] = None if no_perm else clean(raw_row.get("ad_name"))
            lead["adset_name"] = None if no_perm else clean(raw_row.get("adset_name"))
        else:
            lead["heard_from"] = channel
        lead["partners"] = lead_partners(lead, tags_by_contact.get(cid, []))
        leads.append(lead)

    duplicates = []
    for r in dup_df:
        cid = r.get("Contact ID")
        reason = r.get("Lý do") or ""
        duplicates.append({
            "source": _source_label(r.get("Nguồn")),
            "row_no": to_int(r.get("Dòng gốc")),
            "contact_id": cid,
            "full_name_raw": r.get("Họ tên (gốc)"),
            "email_raw": r.get("Email (gốc)"),
            "payment_status": r.get("payment_status"),
            "reason": reason,
            "reason_type": reason.split(" – ")[0].strip() if reason else None,
            "partners": tags_by_contact.get(cid, []),
        })

    row_to_contact = {("Website", s["row_no"]): s["contact_id"] for s in signups}
    row_to_contact.update({(lead["source"], lead["row_no"]): lead["contact_id"] for lead in leads})
    quality = []
    for r in dq_df:
        source = _source_label(r.get("Nguồn"))
        row_no = to_int(r.get("Dòng gốc"))
        cid = row_to_contact.get((source, row_no))
        quality.append({
            "issue_type": r.get("Loại vấn đề"),
            "source": source,
            "row_no": row_no,
            "contact_id": cid,
            "value_before": None if clean(r.get("Giá trị gốc")) is None else str(clean(r.get("Giá trị gốc"))),
            "value_after": None if clean(r.get("Giá trị sau chuẩn hoá")) is None else str(clean(r.get("Giá trị sau chuẩn hoá"))),
            "note": r.get("Ghi chú"),
            "partners": tags_by_contact.get(cid, []),
        })

    segments = [
        {
            "drip": r.get("Drip"),
            "segment": (r.get("Segment") or "").split(" · ")[0],
            "segment_name": r.get("Segment"),
            "entry_rule": r.get("Điều kiện vào"),
            "goal": r.get("Mục tiêu"),
            "exit_rule": r.get("Điều kiện ra"),
        }
        for r in _records(_sheet(booklet2, "Drip_Segments", 6))
        if r.get("Drip")
    ]

    return {
        "contacts": contacts,
        "signups": signups,
        "leads": leads,
        "duplicate_log": duplicates,
        "data_quality": quality,
        "_segments": segments,
    }


# ─────────────────────────── Báo cáo truyền thông & ROI ───────────────────────────


def load_marketing(roi: Path) -> dict[str, list[dict]]:
    roi_rows = {r["Kênh (UTM Source)"]: r for r in _records(_sheet(roi, "Nguồn & ROI", 3)) if r.get("Kênh (UTM Source)")}
    cpa_rows = {r["Nguồn"]: r for r in _records(_sheet(roi, "CPA Analysis", 3)) if r.get("Nguồn")}
    recon_rows = {r["Kênh"]: r for r in _records(_sheet(roi, "Đối soát", 2)) if r.get("Kênh")}

    channels = []
    for order, (name, r) in enumerate(roi_rows.items()):
        if name == "Tổng" or name.startswith("Ghi chú") or name.startswith("•"):
            continue
        note = r.get("Nguồn số liệu") or ""
        cpa = cpa_rows.get(name, {})
        recon = recon_rows.get(name, {})
        channels.append({
            "_id": name,
            "channel": name,
            "order": order,
            "budget": to_float(r.get("Ngân sách chi tiêu (VNĐ)")) or 0.0,
            "clicks": to_float(r.get("Lượt click Logo/Banner")),
            "ctr": to_float(r.get("CTR (%)")),
            "data_note": note,
            "is_assumed": "GIẢ ĐỊNH" in note.upper(),
            "active_candidates_assumed": to_float(cpa.get("Active Candidate (Thi thực tế) – giả định")),
            "report": {
                "unique_contacts": to_int(r.get("Liên hệ duy nhất")),
                "web_registrations": to_int(r.get("Đăng ký web")),
                "paid": to_int(r.get("Đã thanh toán")),
                "revenue": to_float(r.get("Doanh thu thu về (VNĐ)")),
                "roi": to_float(r.get("ROI (%)")),
            },
            "original_report": None if not recon else {
                "registrations": to_float(recon.get("Đăng ký (gốc)")),
                "paid": to_float(recon.get("Thanh toán (gốc)")),
                "revenue": to_float(recon.get("Doanh thu gốc (VNĐ)")),
                "roi": to_float(recon.get("ROI gốc")),
                "comment": recon.get("Nhận xét"),
            },
            "partners": channel_partners(name),
        })

    reach = [
        {
            "channel": r.get("Kênh truyền thông"),
            "reach": to_float(r.get("Lượt tiếp cận (Reach)")),
            "engagement": to_float(r.get("Lượt tương tác (Engagement)")),
            "engagement_rate": to_float(r.get("Tỉ lệ tương tác")),
            "importance": to_float(r.get("Mức độ quan trọng (Khảo sát 1-5)")),
            "partners": ["DN"],
        }
        for r in _records(_sheet(roi, "Hiệu quả Kênh", 2))
        if r.get("Kênh truyền thông") and not str(r["Kênh truyền thông"]).startswith("•")
    ]

    benefits = []
    for r in _records(_sheet(roi, "Theo dõi Quyền lợi", 2)):
        item = r.get("Hạng mục Quyền lợi")
        if not item or str(item).startswith("•"):
            continue
        status = r.get("Tình trạng hoàn thành") or ""
        if "%" in status:
            progress = float(status.rsplit(" ", 1)[-1].rstrip("%")) / 100
        else:
            progress = 0.0
        benefits.append({
            "item": item,
            "status": status,
            "progress": progress,
            "placement": r.get("Vị trí xuất hiện"),
            "schedule": r.get("Thời gian triển khai"),
            "note": r.get("Ghi chú / Quyền lợi chưa thực hiện"),
            "partners": ["DN"],
        })

    return {"channel_budgets": channels, "media_reach": reach, "sponsor_benefits": benefits}


# ─────────────────────────── Điểm thi (giả lập) ───────────────────────────


def _section_key(col: str) -> str | None:
    c = col.lower()
    if any(x in c for x in ("tổng", "hạng", "cấp", "xếp loại")):
        return None
    if "đọc hiểu" in c:
        return "reading"
    if "design" in c or "thiết kế" in c:
        return "design"
    if "debugging" in c:
        return "debugging"
    return None


def grade_of(total: float | None, params: dict) -> str | None:
    if total is None:
        return None
    if total >= params["grade_excellent"]:
        return "Giỏi"
    if total >= params["grade_good"]:
        return "Khá"
    if total >= params["grade_average"]:
        return "Trung bình"
    return "Yếu"


def load_exam_meta(path: Path) -> dict:
    tham_so = pd.read_excel(path, sheet_name="Tham_so", header=None, dtype=object)
    values = {str(clean(r[0])): r[1] for r in tham_so.itertuples(index=False) if clean(r[0])}

    def pick(prefix: str):
        return next(to_float(v) for k, v in values.items() if k.startswith(prefix))

    params = {
        "certificate_threshold": pick("Ngưỡng nhận chứng chỉ"),
        "top_ratio": pick("Tỷ lệ Top vào chung kết"),
        "grade_excellent": pick("Giỏi khi"),
        "grade_good": pick("Khá khi"),
        "grade_average": pick("Trung bình khi"),
    }
    structure = []
    for r in _records(_sheet(path, "Cau_truc_de", 3)):
        if r.get("Phần thi") is None or r.get("Bảng") not in ("Bảng A", "Bảng B"):
            continue
        section = _section_key(str(r["Phần thi"]))
        structure.append({
            "board": r["Bảng"],
            "round": "qualifier" if r["Vòng"] == "Vòng loại" else "final",
            "round_label": r["Vòng"],
            "level": r.get("Cấp COS Pro"),
            "section": section,
            "section_label": r["Phần thi"],
            "questions": r.get("Câu"),
            "max_score": to_float(r.get("Điểm tối đa")),
        })
    return {"params": params, "structure": structure}


def load_exams(files: dict[str, Path], meta: dict, contact_tags: dict[str, list[str]]) -> tuple[list[dict], list[dict], list[str]]:
    params, structure = meta["params"], meta["structure"]
    max_of = {(s["board"], s["round"], s["section"]): s["max_score"] for s in structure}
    level_of = {(s["board"], s["round"]): s["level"] for s in structure}
    checks: list[str] = []

    candidates, scores = [], []
    for ds in EXAM_DATASETS:
        df = _sheet(files[ds["file"]], "Tong_hop", 0)
        rows = _records(df)
        section_cols = {
            col: (ROUND_KEYS[col[:2]], _section_key(col))
            for col in df.columns
            if col[:2] in ROUND_KEYS and _section_key(col)
        }

        ds_cands = []
        for r in rows:
            stt = to_int(r.get("STT"))
            if stt is None:
                continue
            board = r.get("Bảng")
            province = norm_province(r.get("Tỉnh/TP"))
            school = r.get("Trường")
            cand = {
                "_id": f"{ds['code']}:{stt:03d}",
                "dataset": ds["code"],
                "stt": stt,
                "contact_id": f"PT-{stt:03d}" if ds["linked"] else None,
                "email": r.get("Email"),
                "full_name": r.get("Họ tên"),
                "board": board,
                "school": school,
                "school_type": "THPT" if str(school or "").startswith("THPT") else "Đại học / Học viện",
                "province": province,
                "region": region_of(province),
                "paid": yes(r.get("Đã thanh toán")),
                "simulated": True,
            }
            for rnd in ("qualifier", "final"):
                sections = {sec: to_float(r.get(col)) for col, (rk, sec) in section_cols.items() if rk == rnd}
                sections = {k: v for k, v in sections.items() if v is not None}
                cand[rnd] = {
                    "level": level_of.get((board, rnd)),
                    "sections": sections,
                    "total": sum(sections.values()) if sections else None,
                } if sections else None
            cand["_cached"] = {
                "vl_total": to_float(r.get("VL – Tổng (/1000)")),
                "vl_rank": to_int(r.get("VL – Hạng trong bảng")),
                "ck_total": to_float(r.get("CK – Tổng (/1000)")),
                "cert": r.get("Chứng chỉ COS Pro (≥600)"),
            }
            ds_cands.append(cand)

        # Hạng kiểu thi đấu trong từng bảng, Top x% (làm tròn lên) vào chung kết
        by_board = defaultdict(list)
        for c in ds_cands:
            by_board[c["board"]].append(c)
        for board, group in by_board.items():
            n_final = math.ceil(round(len(group) * params["top_ratio"], 6))
            q_totals = [c["qualifier"]["total"] for c in group if c["qualifier"]]
            f_totals = [c["final"]["total"] for c in group if c["final"]]
            for c in group:
                q = c["qualifier"]
                if q:
                    q["rank"] = sum(1 for t in q_totals if t > q["total"]) + 1
                    q["grade"] = grade_of(q["total"], params)
                c["advanced"] = bool(q and q["rank"] <= n_final)
                f = c["final"]
                if f and not c["advanced"]:
                    checks.append(f"{c['_id']}: có điểm Chung kết nhưng không thuộc Top {n_final}")
                if f:
                    f["rank"] = sum(1 for t in f_totals if t > f["total"]) + 1
                    f["grade"] = grade_of(f["total"], params)
                best = max([x["total"] for x in (q, f) if x] or [0])
                c["best_total"] = best
                c["certificate"] = best >= params["certificate_threshold"]

        for c in ds_cands:
            cached = c.pop("_cached")
            if cached["vl_total"] is not None and c["qualifier"] and cached["vl_total"] != c["qualifier"]["total"]:
                checks.append(f"{c['_id']}: tổng VL tính lại {c['qualifier']['total']} ≠ Excel {cached['vl_total']}")
            if cached["vl_rank"] is not None and c["qualifier"] and cached["vl_rank"] != c["qualifier"]["rank"]:
                checks.append(f"{c['_id']}: hạng VL tính lại {c['qualifier']['rank']} ≠ Excel {cached['vl_rank']}")
            if cached["cert"] in ("Có", "Không") and (cached["cert"] == "Có") != c["certificate"]:
                checks.append(f"{c['_id']}: chứng chỉ tính lại khác Excel")
            c["partners"] = exam_partners(c, contact_tags.get(c["contact_id"]) if c["contact_id"] else None)
            candidates.append(c)
            for rnd in ("qualifier", "final"):
                part = c[rnd]
                if not part:
                    continue
                for sec, score in part["sections"].items():
                    mx = max_of.get((c["board"], rnd, sec))
                    scores.append({
                        "dataset": c["dataset"],
                        "candidate_id": c["_id"],
                        "contact_id": c["contact_id"],
                        "board": c["board"],
                        "round": rnd,
                        "round_label": ROUND_LABELS[rnd],
                        "level": part["level"],
                        "section": sec,
                        "section_label": SECTION_LABELS[sec],
                        "score": score,
                        "max_score": mx,
                        "pct": score / mx if mx else None,
                        "province": c["province"],
                        "region": c["region"],
                        "school": c["school"],
                        "school_type": c["school_type"],
                        "paid": c["paid"],
                        "partners": c["partners"],
                    })
    return candidates, scores, checks
