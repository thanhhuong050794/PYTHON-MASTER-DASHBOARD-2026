const intFmt = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const dec1 = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });

export const dash = "–";

export function fmtInt(v: number | null | undefined): string {
  return v === null || v === undefined || Number.isNaN(v) ? dash : intFmt.format(v);
}

export function fmtNum(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return dash;
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: digits }).format(v);
}

export function fmtVnd(v: number | null | undefined): string {
  return v === null || v === undefined ? dash : `${intFmt.format(v)} ₫`;
}

/** 18.100.000 → "18,1 tr" ; 850.000 → "850 N" */
export function fmtVndCompact(v: number | null | undefined): string {
  if (v === null || v === undefined) return dash;
  const a = Math.abs(v);
  if (a >= 1e9) return `${dec1.format(v / 1e9)} tỷ`;
  if (a >= 1e6) return `${dec1.format(v / 1e6)} tr`;
  if (a >= 1e3) return `${dec1.format(v / 1e3)} N`;
  return intFmt.format(v);
}

export function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return dash;
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: digits }).format(v * 100)}%`;
}

export function fmtSignedPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return dash;
  return `${v > 0 ? "+" : ""}${fmtPct(v, 0)}`;
}

/** Thời gian nghiệp vụ lưu theo giờ Việt Nam (không kèm múi giờ) → hiển thị nguyên giá trị. */
export function fmtLocalDateTime(iso: string | null | undefined, withTime = true): string {
  if (!iso) return dash;
  const [d, t = ""] = iso.split("T");
  const [y, m, day] = d.split("-");
  const date = `${day}/${m}/${y}`;
  return withTime && t ? `${date} ${t.slice(0, 5)}` : date;
}

/** Thời gian hệ thống (đăng nhập, audit) lưu UTC → đổi sang giờ máy người xem. */
export function fmtUtc(iso: string | null | undefined): string {
  if (!iso) return dash;
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  return d.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

export function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
