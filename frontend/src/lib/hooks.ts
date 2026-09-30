import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "./api";

export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    setLoading(true);
    api<T>(path)
      .then((d) => {
        if (!cancelled) {
          setData(d); // giữ khung cũ cho tới khi có dữ liệu mới — không nháy skeleton
          setError(null);
        }
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [path, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, reload };
}

/** Bộ lọc lưu trên URL để chia sẻ/bookmark được. */
export function useUrlFilters(keys: string[]) {
  const [sp, setSp] = useSearchParams();
  const values: Record<string, string> = {};
  for (const k of keys) {
    const v = sp.get(k);
    if (v) values[k] = v;
  }
  const set = useCallback(
    (patch: Record<string, string | null | undefined>) => {
      setSp(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v) next.set(k, v);
            else next.delete(k);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSp],
  );
  const clear = useCallback(() => setSp(new URLSearchParams(), { replace: true }), [setSp]);
  return { values, set, clear };
}

/** Admin: xem dữ liệu theo phạm vi của 1 đối tác (giữ khi chuyển trang). */
export type ScopeCtx = { partner: string | null; setPartner: (p: string | null) => void };
export const ScopeContext = createContext<ScopeCtx>({ partner: null, setPartner: () => {} });
export const useScope = () => useContext(ScopeContext);

export function useClickOutside(ref: React.RefObject<HTMLElement | null>, onOut: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOut();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onOut();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, onOut, active]);
}
