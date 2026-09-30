import { useState, type ReactNode } from "react";
import { Icon } from "./Icons";

export type Column<T> = { key: string; label: string; align?: "r"; render?: (row: T) => ReactNode };
export type LegendItem = { label: string; color: string; kind?: "rect" | "line" };

export function Legend({ items }: { items: LegendItem[] }) {
  if (items.length < 2) return null;
  return (
    <div className="legend">
      {items.map((it) => (
        <span key={it.label}>
          <i className={it.kind === "line" ? "line" : undefined} style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

export function SimpleTable<T extends object>({ columns, rows, empty = "Không có dữ liệu" }: { columns: Column<T>[]; rows: T[]; empty?: string }) {
  if (!rows.length) return <div className="empty">{empty}</div>;
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead>
          <tr>{columns.map((c) => <th key={c.key} className={c.align}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c.key} className={c.align}>
                  {c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? "–")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Thẻ biểu đồ: tiêu đề, chú giải, và bảng số liệu tương đương (xem không cần tooltip). */
export function ChartCard<T extends object>({
  title, sub, legend, table, children, className = "col-6", loading, actions, empty,
}: {
  title: string;
  sub?: ReactNode;
  legend?: LegendItem[];
  table?: { columns: Column<T>[]; rows: T[] };
  children: ReactNode;
  className?: string;
  loading?: boolean;
  actions?: ReactNode;
  empty?: boolean;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section className={`card ${className}${loading ? " loading" : ""}`}>
      <div className="card-head">
        <div>
          <h2>{title}</h2>
          {sub && <div className="sub">{sub}</div>}
        </div>
        <div className="actions">
          {actions}
          {table && !empty && (
            <button className="btn ghost sm" onClick={() => setShowTable((s) => !s)} aria-pressed={showTable} title={showTable ? "Xem biểu đồ" : "Xem bảng số liệu"}>
              {showTable ? <Icon.chart /> : <Icon.table />}
              <span>{showTable ? "Biểu đồ" : "Bảng"}</span>
            </button>
          )}
        </div>
      </div>
      <div className="card-body">
        {empty ? (
          <div className="empty">Không có dữ liệu trong phạm vi lọc</div>
        ) : showTable && table ? (
          <SimpleTable columns={table.columns} rows={table.rows} />
        ) : (
          <>
            {legend && <Legend items={legend} />}
            {children}
          </>
        )}
      </div>
    </section>
  );
}

export function StatTile({ label, value, hint, hero }: { label: string; value: ReactNode; hint?: ReactNode; hero?: boolean }) {
  return (
    <div className={`tile${hero ? " hero" : ""}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Note({ children, warn }: { children: ReactNode; warn?: boolean }) {
  return (
    <div className={`note${warn ? " warn" : ""}`}>
      <Icon.info />
      <div>{children}</div>
    </div>
  );
}
