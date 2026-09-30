"""Nạp toàn bộ dữ liệu Excel vào MongoDB + tạo đối tác & tài khoản mặc định.

    cd backend
    uv run python -m etl.seed                 # nạp dữ liệu + đối tác + tài khoản (nếu chưa có)
    uv run python -m etl.seed --dry-run       # chỉ đọc Excel, in kết quả đối soát, không ghi DB
    uv run python -m etl.seed --skip-data     # chỉ tạo đối tác & tài khoản
    uv run python -m etl.seed --reset-passwords  # đặt lại mật khẩu mặc định cho tài khoản mặc định
"""

import argparse
import sys
from collections import Counter
from datetime import datetime, timezone

from pymongo import ASCENDING, IndexModel

from app.config import settings
from app.partners import DEFAULT_USERS, MODULES, PARTNERS
from app.security import hash_password

from .loaders import EXAM_DATASETS, file_info, find_files, load_crm, load_exam_meta, load_exams, load_marketing, load_raw

DATA_COLLECTIONS = [
    "raw_web_signups", "raw_talkshow", "raw_fb_leads",
    "contacts", "signups", "leads", "duplicate_log", "data_quality",
    "channel_budgets", "media_reach", "sponsor_benefits",
    "exam_candidates", "exam_scores",
]

INDEXES = {
    "contacts": [["partners"], ["board"], ["region"], ["segment"], ["channel"], ["first_touch"], ["payment_status"]],
    "signups": [["partners"], ["contact_id"]],
    "leads": [["partners"], ["source"], ["created_at"]],
    "duplicate_log": [["partners"]],
    "data_quality": [["partners"], ["issue_type"]],
    "channel_budgets": [["partners"]],
    "exam_candidates": [["partners"], ["dataset", "board"], ["contact_id"]],
    "exam_scores": [["partners"], ["dataset", "board", "round"]],
}


def build_documents() -> tuple[dict[str, list[dict]], dict, list[dict]]:
    files = find_files(settings.data_dir)
    print(f"Đọc dữ liệu từ {settings.data_dir}")
    raw = load_raw(files["booklet1"])
    crm = load_crm(files["booklet2"], files["roi"], raw)
    marketing = load_marketing(files["roi"])
    exam_meta = load_exam_meta(files["exam_119"])
    contact_tags = {c["_id"]: c["partners"] for c in crm["contacts"]}
    candidates, scores, exam_checks = load_exams(files, exam_meta, contact_tags)

    segments = crm.pop("_segments")
    docs = {**raw, **crm, **marketing, "exam_candidates": candidates, "exam_scores": scores}

    raw_counts = {k: len(raw[k]) for k in ("raw_web_signups", "raw_talkshow", "raw_fb_leads")}
    total_raw = sum(raw_counts.values())
    merged = len(docs["duplicate_log"])
    meta_docs = [
        {"_id": "segments", "items": segments},
        {"_id": "exam", **exam_meta, "datasets": [{k: d[k] for k in ("code", "label", "linked")} for d in EXAM_DATASETS]},
        {
            "_id": "pipeline",
            "raw_counts": raw_counts,
            "total_raw": total_raw,
            "unique_contacts": len(docs["contacts"]),
            "merged_records": merged,
            "duplicate_rate": merged / total_raw if total_raw else None,
        },
    ]
    checks = reconcile(docs, exam_checks)
    return docs, {"files": {k: file_info(p) for k, p in files.items()}, "meta_docs": meta_docs}, checks


def reconcile(docs: dict[str, list[dict]], exam_checks: list[str]) -> list[dict]:
    """Đối soát với số liệu trên Dashboard Booklet 2 / báo cáo ROI."""
    contacts = docs["contacts"]
    results = []

    def check(name: str, actual, expected):
        ok = actual == expected if not isinstance(expected, float) else abs(actual - expected) < 0.5
        results.append({"check": name, "actual": actual, "expected": expected, "ok": ok})

    check("Số dòng thô (3 nguồn)", sum(len(docs[k]) for k in ("raw_web_signups", "raw_talkshow", "raw_fb_leads")), 191)
    check("Liên hệ duy nhất", len(contacts), 145)
    check("Bản ghi bị gộp", len(docs["duplicate_log"]), 46)
    check("Đã đăng ký web", sum(c["web_registered"] for c in contacts), 119)
    check("Đã thanh toán (gồm miễn phí)", sum(c["paid"] for c in contacts), 66)
    check("Doanh thu ghi nhận (VND)", float(sum(c["revenue"] for c in contacts)), 18_100_000.0)
    check("Dòng website (Main_Signups_Clean)", len(docs["signups"]), 132)
    check("Lead Talkshow + FB", len(docs["leads"]), 59)

    by_channel = Counter(c["channel"] for c in contacts)
    paid_by_channel = Counter(c["channel"] for c in contacts if c["paid"])
    rev_by_channel = Counter()
    for c in contacts:
        rev_by_channel[c["channel"]] += c["revenue"]
    for ch in docs["channel_budgets"]:
        rep = ch["report"]
        check(f"Kênh {ch['channel']}: liên hệ", by_channel[ch["channel"]], rep["unique_contacts"])
        check(f"Kênh {ch['channel']}: thanh toán", paid_by_channel[ch["channel"]], rep["paid"])
        check(f"Kênh {ch['channel']}: doanh thu", float(rev_by_channel[ch["channel"]]), float(rep["revenue"] or 0))

    counts = Counter((c["dataset"], c["board"]) for c in docs["exam_candidates"])
    check("Điểm thi PM119 – Bảng A", counts[("PM119", "Bảng A")], 24)
    check("Điểm thi PM119 – Bảng B", counts[("PM119", "Bảng B")], 95)
    check("Điểm thi bộ A24", counts[("A24", "Bảng A")], 24)
    check("Điểm thi bộ B95", counts[("B95", "Bảng B")], 95)
    finalists = Counter((c["dataset"], c["board"]) for c in docs["exam_candidates"] if c.get("final"))
    check("PM119 – số người có điểm Chung kết", finalists[("PM119", "Bảng A")] + finalists[("PM119", "Bảng B")], 13)
    check("Điểm thi: tính lại khớp cột công thức Excel", len(exam_checks), 0)
    for msg in exam_checks[:10]:
        results.append({"check": msg, "actual": None, "expected": None, "ok": False})
    return results


def write_data(db, docs: dict[str, list[dict]], meta_docs: list[dict]) -> None:
    for name in DATA_COLLECTIONS:
        coll = db[name]
        coll.drop()
        if docs.get(name):
            coll.insert_many(docs[name], ordered=True)
        for keys in INDEXES.get(name, []):
            coll.create_indexes([IndexModel([(k, ASCENDING) for k in keys])])
        print(f"  {name:<18} {len(docs.get(name, [])):>5} documents")
    for m in meta_docs:
        db.meta.replace_one({"_id": m["_id"]}, m, upsert=True)


def seed_partners_and_users(db, reset_passwords: bool) -> None:
    now = datetime.now(timezone.utc)
    for p in PARTNERS:
        db.partners.update_one(
            {"_id": p["code"]},
            {
                "$set": {k: p[k] for k in ("name", "type", "description", "scope_rule")},
                # Cài đặt quyền chỉ đặt khi tạo mới để không ghi đè chỉnh sửa của admin
                "$setOnInsert": {"modules": p["modules"], "can_view_pii": False, "active": True, "created_at": now},
            },
            upsert=True,
        )
    db.users.create_index("username", unique=True)
    db.audit_logs.create_index([("at", -1)])
    for u in DEFAULT_USERS:
        password = settings.seed_admin_password if u["role"] == "admin" else settings.seed_partner_password
        if len(password) < 8 and (reset_passwords or db.users.count_documents({"username": u["username"]}) == 0):
            raise SystemExit("Cần đặt SEED_ADMIN_PASSWORD và SEED_PARTNER_PASSWORD (≥ 8 ký tự) trong .env trước khi tạo tài khoản")
        existing = db.users.find_one({"username": u["username"]})
        if existing is None:
            db.users.insert_one({
                **u,
                "password_hash": hash_password(password),
                "active": True,
                "token_version": 0,
                "created_at": now,
                "last_login": None,
            })
            print(f"  + tài khoản {u['username']:<9} ({u['partner_code'] or 'admin'})")
        elif reset_passwords:
            db.users.update_one(
                {"_id": existing["_id"]},
                {"$set": {"password_hash": hash_password(password), "active": True}, "$inc": {"token_version": 1}},
            )
            print(f"  ~ đặt lại mật khẩu {u['username']}")
    print(f"  Module khả dụng: {', '.join(MODULES)}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-data", action="store_true")
    parser.add_argument("--reset-passwords", action="store_true")
    args = parser.parse_args()

    checks, info = [], {}
    if not args.skip_data:
        docs, info, checks = build_documents()
        print("\nĐối soát số liệu:")
        for c in checks:
            mark = "OK " if c["ok"] else "LỆCH"
            detail = "" if c["actual"] is None else f"{c['actual']} (kỳ vọng {c['expected']})"
            print(f"  [{mark}] {c['check']}: {detail}")
        if args.dry_run:
            return 0 if all(c["ok"] for c in checks) else 1

    from app.db import get_db

    db = get_db()
    db.client.admin.command("ping")
    print(f"\nKết nối MongoDB OK → database `{settings.mongo_db_name}`")
    started = datetime.now(timezone.utc)
    if not args.skip_data:
        print("Ghi dữ liệu:")
        write_data(db, docs, info["meta_docs"])
    print("Đối tác & tài khoản:")
    seed_partners_and_users(db, args.reset_passwords)
    if not args.skip_data:
        db.import_runs.insert_one({
            "started_at": started,
            "finished_at": datetime.now(timezone.utc),
            "files": list(info["files"].values()),
            "counts": {name: len(docs.get(name, [])) for name in DATA_COLLECTIONS},
            "checks": checks,
            "ok": all(c["ok"] for c in checks),
        })
    print("Hoàn tất.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
