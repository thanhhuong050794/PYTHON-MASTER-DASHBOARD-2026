"""Quy tắc gắn mã đối tác (row-level security) cho từng loại document.

API không tự suy luận quyền: chỉ lọc {"partners": <mã>}. Mọi thay đổi phạm vi dữ liệu
của đối tác được sửa tại đây rồi chạy lại `python -m etl.seed`.
"""

from .normalize import REGION_SOUTH_LABEL

CHANNEL_OWNER = {
    "Facebook": "METAADS",
    "Đối tác trường": "INFO",
}


def contact_partners(c: dict) -> list[str]:
    tags = set()
    if c.get("board") == "Bảng A":
        tags.add("THPT")
    if c.get("board") == "Bảng B":
        tags.add("DH")
    owner = CHANNEL_OWNER.get(c.get("channel_base"))
    if owner:
        tags.add(owner)
    if (
        "miennam" in c.get("utm_partners", [])
        or c.get("region") == REGION_SOUTH_LABEL
        or c.get("exam_venue") == "TP.HCM"
    ):
        tags.add("MIENNAM")
    return sorted(tags)


def lead_partners(lead: dict, contact_tags: list[str]) -> list[str]:
    tags = set(contact_tags)
    if lead.get("source") == "FB Lead Form":
        tags.add("METAADS")
    return sorted(tags)


def exam_partners(candidate: dict, contact_tags: list[str] | None) -> list[str]:
    tags = {"DN"}
    if candidate.get("board") == "Bảng A":
        tags.add("THPT")
    if candidate.get("board") == "Bảng B":
        tags.add("DH")
    if candidate.get("region") == REGION_SOUTH_LABEL:
        tags.add("MIENNAM")
    for code in ("INFO", "METAADS"):
        if contact_tags and code in contact_tags:
            tags.add(code)
    return sorted(tags)


def channel_partners(channel: str) -> list[str]:
    owner = CHANNEL_OWNER.get(channel)
    return [owner] if owner else []
