export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Params = Record<string, string | number | boolean | null | undefined>;

// Local:  VITE_API_URL không set → API_BASE = "" → gọi "/api/..." → Vite proxy chuyển tới localhost:8000
// Render: VITE_API_URL = "https://python-master-dashboard-2026.onrender.com" → gọi thẳng backend
const API_BASE = "";

export function qs(params: Params): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(`${API_BASE}/api${path}`, {
    credentials: "include",
    ...rest,
    headers: {
      Accept: "application/json",
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(rest.headers ?? {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (!res.ok) {
    let message = `Lỗi ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") message = body.detail;
      else if (Array.isArray(body.detail)) message = body.detail.map((d: { msg: string }) => d.msg).join("; ");
    } catch {
      /* phản hồi không phải JSON */
    }
    if (res.status === 401 && !path.startsWith("/auth/login")) {
      window.dispatchEvent(new Event("auth:expired"));
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

export function downloadUrl(path: string, params: Params): string {
  return `${API_BASE}/api${path}${qs({ ...params, format: "csv" })}`;
}

/** Tải file nhị phân (Excel/Word/PDF) kèm cookie đăng nhập; báo lỗi nếu API từ chối. */
export async function downloadFile(path: string, params: Params = {}): Promise<void> {
  const res = await fetch(`${API_BASE}/api${path}${qs(params)}`, { credentials: "include", headers: { Accept: "*/*" } });
  if (!res.ok) {
    let message = `Lỗi ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") message = body.detail;
    } catch {
      /* không phải JSON */
    }
    if (res.status === 401 && !path.startsWith("/auth/login")) {
      window.dispatchEvent(new Event("auth:expired"));
    }
    throw new ApiError(res.status, message);
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") ?? "";
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  const quoted = /filename="([^"]+)"/i.exec(cd);
  const name = decodeURIComponent(star?.[1] ?? quoted?.[1] ?? "bao_cao");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}