"""Hàm chuẩn hoá giá trị đọc từ Excel và danh mục tỉnh/thành → miền."""

import math
import re
from datetime import date, datetime

import pandas as pd

PROVINCE_ALIASES = {
    "tp hcm": "TP. Hồ Chí Minh",
    "tp. hcm": "TP. Hồ Chí Minh",
    "tp.hcm": "TP. Hồ Chí Minh",
    "hồ chí minh": "TP. Hồ Chí Minh",
    "tp hồ chí minh": "TP. Hồ Chí Minh",
    "tp hồ chí minh kv 2": "TP. Hồ Chí Minh",
    "thành phố hồ chí minh": "TP. Hồ Chí Minh",
    "thành phố thủ đức": "TP. Hồ Chí Minh",
    "hà nội": "Hà Nội",
    "ha noi": "Hà Nội",
    "đà nẵng": "Đà Nẵng",
}

REGION_NORTH = {
    "Hà Nội", "Bắc Ninh", "Hải Phòng", "Phú Thọ", "Ninh Bình", "Nam Định", "Thái Nguyên",
    "Vĩnh Phúc", "Quảng Ninh", "Hải Dương", "Hưng Yên", "Thái Bình", "Bắc Giang", "Lào Cai",
}
REGION_CENTRAL = {
    "Thanh Hóa", "Nghệ An", "Hà Tĩnh", "Quảng Bình", "Quảng Trị", "Huế", "Đà Nẵng", "Quảng Nam",
    "Quảng Ngãi", "Bình Định", "Phú Yên", "Khánh Hòa", "Gia Lai", "Đắk Lắk", "Lâm Đồng",
}
REGION_SOUTH = {
    "TP. Hồ Chí Minh", "Đồng Tháp", "Đồng Nai", "Cần Thơ", "Bình Dương", "Bà Rịa – Vũng Tàu",
    "Long An", "Tiền Giang", "An Giang", "Vĩnh Long", "Tây Ninh", "Cà Mau",
}

REGION_NORTH_LABEL = "Miền Bắc"
REGION_CENTRAL_LABEL = "Miền Trung"
REGION_SOUTH_LABEL = "Miền Nam"
REGION_UNKNOWN_LABEL = "Chưa rõ"


def clean(v):
    """NaN/NaT/chuỗi rỗng → None; chuỗi được strip; Timestamp → datetime."""
    if v is None:
        return None
    if isinstance(v, float) and math.isnan(v):
        return None
    if v is pd.NaT:
        return None
    if isinstance(v, pd.Timestamp):
        return None if pd.isna(v) else v.to_pydatetime()
    if isinstance(v, str):
        s = v.replace("​", "").strip()
        return s or None
    return v


def to_int(v):
    v = clean(v)
    if v is None:
        return None
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def to_float(v):
    v = clean(v)
    if v is None or isinstance(v, str) and v.lower() in {"n/a", "–", "-"}:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def to_dt(v):
    v = clean(v)
    if v is None:
        return None
    if isinstance(v, datetime):
        return v
    if isinstance(v, date):
        return datetime(v.year, v.month, v.day)
    try:
        ts = pd.to_datetime(v)
    except (ValueError, TypeError):
        return None
    if pd.isna(ts):
        return None
    if ts.tzinfo is not None:
        ts = ts.tz_convert("Asia/Ho_Chi_Minh").tz_localize(None)
    return ts.to_pydatetime()


def to_date_str(v) -> str | None:
    """Ngày sinh nhập nhiều định dạng (ISO, m/d/Y, d/m/Y) → YYYY-MM-DD, không đoán được thì giữ nguyên."""
    v = clean(v)
    if v is None:
        return None
    if isinstance(v, (datetime, date)):
        return v.strftime("%Y-%m-%d")
    s = str(v)
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        return s
    m = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{4})", s)
    if m:
        a, b, y = int(m[1]), int(m[2]), int(m[3])
        # a > 12 → chắc chắn d/m/Y; b > 12 → chắc chắn m/d/Y; còn lại theo d/m/Y (chuẩn Việt Nam)
        day, month = (b, a) if b > 12 else (a, b)
        try:
            return date(y, month, day).isoformat()
        except ValueError:
            return s
    return s


def to_phone(v) -> str | None:
    v = clean(v)
    if v is None:
        return None
    digits = re.sub(r"\D", "", str(v).split(".")[0] if isinstance(v, float) else str(v))
    if digits.startswith("84") and len(digits) == 11:
        digits = "0" + digits[2:]
    if len(digits) == 9:
        digits = "0" + digits
    return digits or None


def yes(v) -> bool:
    v = clean(v)
    return isinstance(v, str) and v.lower() in {"có", "yes", "true", "x"}


def norm_province(v) -> str | None:
    v = clean(v)
    if v is None:
        return None
    return PROVINCE_ALIASES.get(v.lower(), v)


def region_of(province: str | None) -> str:
    if not province:
        return REGION_UNKNOWN_LABEL
    if province == "Miền Nam":
        return REGION_SOUTH_LABEL
    if province in REGION_NORTH:
        return REGION_NORTH_LABEL
    if province in REGION_CENTRAL:
        return REGION_CENTRAL_LABEL
    if province in REGION_SOUTH:
        return REGION_SOUTH_LABEL
    return REGION_UNKNOWN_LABEL


def split_list(v, sep: str) -> list[str]:
    v = clean(v)
    if v is None:
        return []
    return [p.strip() for p in str(v).split(sep) if p.strip()]


def safe_key(name) -> str:
    """Tên cột Excel → key hợp lệ cho MongoDB (không có '.', không bắt đầu bằng '$')."""
    key = str(name).strip().replace(".", "").replace("$", "")
    return key or "col"
