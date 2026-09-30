import { useCallback, useMemo, useRef, useState } from "react";
import { useClickOutside } from "../lib/hooks";
import { fmtLocalDateTime } from "../lib/format";
import { Icon } from "./Icons";

export type Option = { value: string; label: string };
export type FilterDef =
  | { type: "multi"; key: string; label: string; options: (Option | string)[] }
  | { type: "single"; key: string; label: string; options: (Option | string)[]; allLabel?: string; required?: boolean }
  | { type: "date"; label: string; min?: string | null; max?: string | null };

const norm = (o: Option | string): Option => (typeof o === "string" ? { value: o, label: o } : o);

function Dropdown({ label, value, on, children, onClose, open, setOpen }: {
  label: string; value: string; on: boolean; children: React.ReactNode; onClose: () => void; open: boolean; setOpen: (v: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, onClose, open);
  return (
    <div className="dd" ref={ref}>
      <button type="button" className={`filter-btn${on ? " on" : ""}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="lbl">{label}:</span>
        <span className="val">{value}</span>
        <Icon.chevron />
      </button>
      {open && <div className="popover" role="listbox">{children}</div>}
    </div>
  );
}

function MultiFilter({ def, value, onChange }: { def: Extract<FilterDef, { type: "multi" }>; value?: string; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const options = useMemo(() => def.options.map(norm), [def.options]);
  const selected = useMemo(() => new Set(value ? value.split(",") : []), [value]);
  const close = useCallback(() => setOpen(false), []);
  const toggle = (v: string) => {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange(next.size ? [...next].join(",") : null);
  };
  const summary = selected.size === 0 ? "Tất cả" : selected.size === 1 ? (options.find((o) => selected.has(o.value))?.label ?? [...selected][0]) : `${selected.size} mục`;
  const shown = options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()));
  return (
    <Dropdown label={def.label} value={summary} on={selected.size > 0} open={open} setOpen={setOpen} onClose={close}>
      {options.length > 8 && (
        <input className="input search" placeholder="Tìm…" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
      )}
      {shown.map((o) => (
        <button key={o.value} type="button" className={`opt${selected.has(o.value) ? " sel" : ""}`} role="option" aria-selected={selected.has(o.value)} onClick={() => toggle(o.value)}>
          <span className="tick">{selected.has(o.value) && <Icon.check />}</span>
          {o.label}
        </button>
      ))}
      {!shown.length && <div className="empty">Không có lựa chọn</div>}
      <div className="foot">
        <button type="button" className="btn sm ghost" onClick={() => onChange(null)} disabled={!selected.size}>Bỏ chọn</button>
        <button type="button" className="btn sm" onClick={close} style={{ marginLeft: "auto" }}>Xong</button>
      </div>
    </Dropdown>
  );
}

function SingleFilter({ def, value, onChange }: { def: Extract<FilterDef, { type: "single" }>; value?: string; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const options = def.options.map(norm);
  const current = options.find((o) => o.value === value);
  return (
    <Dropdown label={def.label} value={current?.label ?? def.allLabel ?? "Tất cả"} on={!!value && !def.required} open={open} setOpen={setOpen} onClose={close}>
      {!def.required && (
        <button type="button" className={`opt${!value ? " sel" : ""}`} onClick={() => { onChange(null); close(); }}>
          <span className="tick">{!value && <Icon.check />}</span>{def.allLabel ?? "Tất cả"}
        </button>
      )}
      {options.map((o) => (
        <button key={o.value} type="button" className={`opt${o.value === value ? " sel" : ""}`} onClick={() => { onChange(o.value); close(); }}>
          <span className="tick">{o.value === value && <Icon.check />}</span>{o.label}
        </button>
      ))}
    </Dropdown>
  );
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function DateFilter({ def, from, to, onChange }: { def: Extract<FilterDef, { type: "date" }>; from?: string; to?: string; onChange: (f: string | null, t: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const presets = useMemo(() => {
    const out: { label: string; from: string | null; to: string | null }[] = [{ label: "Toàn bộ thời gian", from: null, to: null }];
    const today = new Date();
    for (const n of [7, 30, 90]) {
      const d = new Date(today);
      d.setDate(d.getDate() - (n - 1));
      out.push({ label: `${n} ngày gần nhất`, from: iso(d), to: iso(today) });
    }
    // Các tháng có dữ liệu
    if (def.min && def.max) {
      const start = new Date(def.min.slice(0, 7) + "-01T00:00:00");
      const end = new Date(def.max.slice(0, 10) + "T00:00:00");
      for (let d = new Date(start); d <= end; d.setMonth(d.getMonth() + 1)) {
        const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        out.push({ label: `Tháng ${d.getMonth() + 1}/${d.getFullYear()}`, from: iso(d), to: iso(last) });
      }
    }
    return out;
  }, [def.min, def.max]);
  const active = presets.find((p) => p.from === (from ?? null) && p.to === (to ?? null));
  const summary = active ? active.label : `${from ? fmtLocalDateTime(from, false) : "…"} – ${to ? fmtLocalDateTime(to, false) : "…"}`;
  return (
    <Dropdown label={def.label} value={summary} on={!!(from || to)} open={open} setOpen={setOpen} onClose={close}>
      {presets.map((p) => {
        const sel = p === active;
        return (
          <button key={p.label} type="button" className={`opt${sel ? " sel" : ""}`} onClick={() => { onChange(p.from, p.to); close(); }}>
            <span className="tick">{sel && <Icon.check />}</span>{p.label}
          </button>
        );
      })}
      <div className="foot" style={{ display: "grid", gap: 6 }}>
        <span className="muted" style={{ fontSize: 12 }}>Tuỳ chọn khoảng ngày</span>
        <div className="row">
          <input type="date" className="input" value={from ?? ""} onChange={(e) => onChange(e.target.value || null, to ?? null)} aria-label="Từ ngày" />
          <input type="date" className="input" value={to ?? ""} onChange={(e) => onChange(from ?? null, e.target.value || null)} aria-label="Đến ngày" />
        </div>
      </div>
    </Dropdown>
  );
}

export function FilterBar({ defs, values, set, clear }: {
  defs: FilterDef[];
  values: Record<string, string>;
  set: (patch: Record<string, string | null>) => void;
  clear: () => void;
}) {
  const hasAny = defs.some((d) => (d.type === "date" ? values.date_from || values.date_to : d.type === "single" && d.required ? false : values[d.key]));
  return (
    <div className="filterbar" aria-label="Bộ lọc">
      {defs.map((d) => {
        if (d.type === "date")
          return <DateFilter key="date" def={d} from={values.date_from} to={values.date_to} onChange={(f, t) => set({ date_from: f, date_to: t })} />;
        if (d.type === "multi")
          return d.options.length ? <MultiFilter key={d.key} def={d} value={values[d.key]} onChange={(v) => set({ [d.key]: v })} /> : null;
        return <SingleFilter key={d.key} def={d} value={values[d.key]} onChange={(v) => set({ [d.key]: v })} />;
      })}
      {hasAny && <button type="button" className="btn ghost sm" onClick={clear}>Xoá bộ lọc</button>}
    </div>
  );
}
