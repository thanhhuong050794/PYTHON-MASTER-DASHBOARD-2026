import { useEffect, useState } from "react";

export type ThemeMode = "system" | "light" | "dark";
const KEY = "neu-bi-theme";

export function getThemeMode(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function applyThemeMode(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", mode);
  try {
    if (mode === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, mode);
  } catch {
    /* bộ nhớ trình duyệt bị chặn — vẫn áp dụng cho phiên hiện tại */
  }
}

export type Palette = {
  surface: string; surface2: string; text: string; text2: string; muted: string; grid: string; axis: string;
  accent: string; series: string[]; other: string; ord: string[]; divPos: string; divNeg: string; divMid: string;
  seqLo: string; seqHi: string; good: string; warning: string; serious: string; critical: string; font: string;
};

function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return {
    surface: v("--surface"), surface2: v("--surface-2"), text: v("--text"), text2: v("--text-2"), muted: v("--muted"),
    grid: v("--grid"), axis: v("--axis"), accent: v("--accent"),
    series: ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6", "--s7", "--s8"].map(v),
    other: v("--other"),
    ord: ["--ord-1", "--ord-2", "--ord-3", "--ord-4"].map(v),
    divPos: v("--div-pos"), divNeg: v("--div-neg"), divMid: v("--div-mid"),
    seqLo: v("--seq-lo"), seqHi: v("--seq-hi"),
    good: v("--good"), warning: v("--warning"), serious: v("--serious"), critical: v("--critical"),
    font: v("--font"),
  };
}

/** Bảng màu biểu đồ lấy từ CSS token; tự cập nhật khi đổi theme hoặc theme hệ điều hành. */
export function usePalette(): Palette {
  const [palette, setPalette] = useState<Palette>(readPalette);
  useEffect(() => {
    const update = () => setPalette(readPalette());
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", update);
    return () => {
      mo.disconnect();
      mq.removeEventListener("change", update);
    };
  }, []);
  return palette;
}

/** Màu cố định theo thực thể (không theo thứ hạng) — lọc bớt series không làm đổi màu series còn lại. */
const ENTITY_SLOTS: Record<string, Record<string, number>> = {
  board: { "Bảng A": 0, "Bảng B": 1 },
  source: { Website: 0, Talkshow: 1, "FB Lead Form": 2 },
  result: { "Lead mới": 0, "Đã có trong Data": 1, "Trùng trong form ngoài": 2 },
  region: { "Miền Bắc": 0, "Miền Trung": 1, "Miền Nam": 2 },
  platform: { Facebook: 0, Instagram: 1 },
  round: { qualifier: 0, final: 1 },
  compare: { "Báo cáo gốc": 0, "Sau đối soát": 1 },
};

export function entityColor(p: Palette, kind: keyof typeof ENTITY_SLOTS | string, key: string | null | undefined): string {
  const slot = ENTITY_SLOTS[kind]?.[key ?? ""];
  return slot === undefined ? p.other : p.series[slot];
}
