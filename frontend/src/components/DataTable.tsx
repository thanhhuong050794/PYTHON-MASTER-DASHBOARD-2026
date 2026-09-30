import { useEffect, useMemo, useState, type ReactNode } from "react";
import { downloadUrl, qs } from "../lib/api";
import { fmtInt } from "../lib/format";
import { useApi } from "../lib/hooks";
import { Icon } from "./Icons";

export type TableCol<T> = { key: string; label: string; align?: "r"; sort?: string; wrap?: boolean; render?: (row: T) => ReactNode };

type ListResponse<T> = { total: number; rows: T[] };

/** Bảng phân trang phía server, có tìm kiếm, sắp xếp và xuất CSV theo đúng bộ lọc hiện tại. */
export function DataTable<T extends object>({ path, params, columns, defaultSort, title, searchPlaceholder = "Tìm theo mã, tên, email…", csv = true }: {
  path: string;
  params: Record<string, string | null | undefined>;
  columns: TableCol<T>[];
  defaultSort?: string;
  title: string;
  searchPlaceholder?: string;
  csv?: boolean;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sort, setSort] = useState<string | undefined>(defaultSort);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const paramKey = JSON.stringify(params);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setPage(1), [paramKey, debouncedQ, sort, pageSize]);

  const full = useMemo(() => ({ ...params, q: debouncedQ || undefined, sort, page, page_size: pageSize }), [paramKey, debouncedQ, sort, page, pageSize]); // eslint-disable-line react-hooks/exhaustive-deps
  const { data, loading, error } = useApi<ListResponse<T>>(`${path}${qs(full)}`);
  const pages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  const onSort = (key?: string) => {
    if (!key) return;
    setSort((s) => (s === `-${key}` ? key : `-${key}`));
  };

  return (
    <section className={`card col-12${loading ? " loading" : ""}`}>
      <div className="card-head">
        <div>
          <h2>{title}</h2>
          <div className="sub">{data ? `${fmtInt(data.total)} dòng khớp bộ lọc` : " "}</div>
        </div>
      </div>
      <div className="table-tools">
        <input className="input" placeholder={searchPlaceholder} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm kiếm trong bảng" />
        {csv && (
          <a className="btn sm" href={downloadUrl(path, { ...params, q: debouncedQ || undefined, sort })} download>
            <Icon.download /> Xuất CSV
          </a>
        )}
      </div>
      {error && <div className="error">{error}</div>}
      <div className="card-body">
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                {columns.map((c) => {
                  const dir = sort === c.sort ? "▲" : sort === `-${c.sort}` ? "▼" : "";
                  return (
                    <th key={c.key} className={`${c.align ?? ""}${c.sort ? " sortable" : ""}`} onClick={() => onSort(c.sort)} aria-sort={dir === "▲" ? "ascending" : dir === "▼" ? "descending" : undefined}>
                      {c.label} {dir && <span aria-hidden>{dir}</span>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {data?.rows.map((r, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c.key} className={`${c.align ?? ""}${c.wrap ? " wrap" : ""}`}>
                      {c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? "–")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {data && !data.rows.length && <div className="empty">Không có dòng nào khớp bộ lọc</div>}
        </div>
      </div>
      <div className="pager">
        <label className="row">
          Số dòng
          <select className="select" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
            {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <span>Trang {page}/{pages}</span>
        <button className="btn sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Trước</button>
        <button className="btn sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Sau</button>
      </div>
    </section>
  );
}
