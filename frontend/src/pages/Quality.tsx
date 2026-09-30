import { useMemo, useState } from "react";
import { Chart } from "../components/Chart";
import { ChartCard, Note, SimpleTable, StatTile } from "../components/ChartCard";
import { SimpleBarCard } from "../components/Viz";
import { qs } from "../lib/api";
import { barHeight, barOption } from "../lib/charts";
import { fmtInt, fmtPct, fmtUtc } from "../lib/format";
import { useApi, useScope } from "../lib/hooks";
import { entityColor, usePalette } from "../lib/theme";

type QualitySummary = {
  pipeline: { raw_counts: Record<string, number>; total_raw: number; unique_contacts: number; merged_records: number; duplicate_rate: number };
  by_issue: { issue: string; source: string; count: number }[];
  by_reason: { reason: string; source: string; count: number }[];
  flags: { key: string; count: number }[];
  merged_distribution: { merged: number; count: number }[];
  last_import: { finished_at: string; ok: boolean; files: { name: string; sha256: string; size: number }[]; checks: { check: string; actual: unknown; expected: unknown; ok: boolean }[] } | null;
};
type Row = Record<string, string | number | null>;

const SOURCES = ["Website", "Talkshow", "FB Lead Form"];

function stacked(p: ReturnType<typeof usePalette>, rows: { source: string; count: number }[], keyOf: (r: never) => string) {
  const cats = [...new Set(rows.map((r) => keyOf(r as never)))];
  cats.sort((a, b) => rows.filter((r) => keyOf(r as never) === b).reduce((s, r) => s + r.count, 0) - rows.filter((r) => keyOf(r as never) === a).reduce((s, r) => s + r.count, 0));
  const sources = SOURCES.filter((s) => rows.some((r) => r.source === s));
  return {
    cats,
    sources,
    option: barOption(p, {
      categories: cats,
      series: sources.map((s) => ({ name: s, data: cats.map((c) => rows.find((r) => keyOf(r as never) === c && r.source === s)?.count ?? 0), color: entityColor(p, "source", s) })),
      horizontal: true, stack: true, labels: true, valueFmt: fmtInt, labelWidth: 170,
    }),
  };
}

function LogTable({ kind, partner }: { kind: "issues" | "duplicates"; partner: string | null }) {
  const [page, setPage] = useState(1);
  const { data, loading } = useApi<{ total: number; rows: Row[] }>(`/quality/list${qs({ kind, partner, page, page_size: 15 })}`);
  const pages = data ? Math.max(1, Math.ceil(data.total / 15)) : 1;
  const columns = kind === "issues"
    ? [
        { key: "issue_type", label: "Loại vấn đề" }, { key: "source", label: "Nguồn" }, { key: "row_no", label: "Dòng gốc", align: "r" as const },
        { key: "contact_id", label: "Contact ID" }, { key: "value_before", label: "Giá trị gốc" }, { key: "value_after", label: "Sau chuẩn hoá" },
      ]
    : [
        { key: "source", label: "Nguồn" }, { key: "row_no", label: "Dòng gốc", align: "r" as const }, { key: "contact_id", label: "Gộp vào" },
        { key: "full_name_raw", label: "Họ tên (gốc)" }, { key: "email_raw", label: "Email (gốc)" }, { key: "reason", label: "Lý do" },
      ];
  return (
    <div className={loading ? "loading-dim" : undefined}>
      <SimpleTable<Row> columns={columns} rows={data?.rows ?? []} />
      <div className="pager">
        <span>{fmtInt(data?.total)} dòng · Trang {page}/{pages}</span>
        <button className="btn sm" disabled={page <= 1} onClick={() => setPage((x) => x - 1)}>Trước</button>
        <button className="btn sm" disabled={page >= pages} onClick={() => setPage((x) => x + 1)}>Sau</button>
      </div>
    </div>
  );
}

export default function Quality() {
  const p = usePalette();
  const { partner } = useScope();
  const [tab, setTab] = useState<"issues" | "duplicates" | "import">("issues");
  const { data, loading, error } = useApi<QualitySummary>(`/quality/summary${qs({ partner })}`);

  const issues = useMemo(() => stacked(p, data?.by_issue ?? [], (r: { issue: string }) => r.issue), [p, data]);
  const reasons = useMemo(() => stacked(p, data?.by_reason ?? [], (r: { reason: string }) => r.reason), [p, data]);
  const pl = data?.pipeline;

  return (
    <>
      <p className="page-desc">Nhật ký làm sạch: chuẩn hoá email/SĐT/tỉnh thành/tên trường và gộp trùng. Nguyên nhân gốc là form nhập tự do — nên chuyển sang dropdown danh mục và kiểm tra ngay trên form.</p>
      {error && <Note warn>{error}</Note>}
      {pl && (
        <div className="kpis">
          <StatTile label="Dòng thô (3 nguồn)" value={fmtInt(pl.total_raw)} hint={`Website ${pl.raw_counts.raw_web_signups} · Talkshow ${pl.raw_counts.raw_talkshow} · FB ${pl.raw_counts.raw_fb_leads}`} />
          <StatTile label="Liên hệ duy nhất" value={fmtInt(pl.unique_contacts)} />
          <StatTile label="Bản ghi bị gộp" value={fmtInt(pl.merged_records)} />
          <StatTile label="Tỉ lệ trùng lặp" value={fmtPct(pl.duplicate_rate)} />
          <StatTile label="Lỗi đã chuẩn hoá" value={fmtInt(data?.by_issue.reduce((a, r) => a + r.count, 0))} />
        </div>
      )}
      {data && (
        <div className="grid">
          <ChartCard
            title="Lỗi dữ liệu đầu vào theo loại" className="col-6" loading={loading} empty={!issues.cats.length}
            legend={issues.sources.map((s) => ({ label: s, color: entityColor(p, "source", s) }))}
            table={{ columns: [{ key: "issue", label: "Loại" }, { key: "source", label: "Nguồn" }, { key: "count", label: "Số lần", align: "r" }], rows: data.by_issue }}
          >
            <Chart option={issues.option} height={barHeight(issues.cats.length, true, 40)} ariaLabel="Lỗi dữ liệu theo loại" />
          </ChartCard>
          <ChartCard
            title="Lý do gộp trùng" className="col-6" loading={loading} empty={!reasons.cats.length}
            sub="Trùng email là cùng 1 người; trùng SĐT chỉ gộp khi tên khớp"
            legend={reasons.sources.map((s) => ({ label: s, color: entityColor(p, "source", s) }))}
            table={{ columns: [{ key: "reason", label: "Lý do" }, { key: "source", label: "Nguồn" }, { key: "count", label: "Bản ghi", align: "r" }], rows: data.by_reason }}
          >
            <Chart option={reasons.option} height={barHeight(reasons.cats.length, true, 40)} ariaLabel="Lý do gộp trùng" />
          </ChartCard>
          <SimpleBarCard
            title="Số bản ghi gộp vào 1 hồ sơ" className="col-6" loading={loading} valueLabel="Liên hệ" keyLabel="Số bản ghi"
            rows={data.merged_distribution.map((m) => ({ key: `${m.merged} bản ghi`, count: m.count }))}
          />
          <SimpleBarCard title="Cờ cần kiểm tra thủ công" className="col-6" loading={loading} rows={data.flags} valueLabel="Liên hệ" keyLabel="Cờ" />

          <section className="card col-12">
            <div className="tabs" role="tablist">
              <button className={tab === "issues" ? "on" : ""} onClick={() => setTab("issues")}>Nhật ký chuẩn hoá</button>
              <button className={tab === "duplicates" ? "on" : ""} onClick={() => setTab("duplicates")}>Nhật ký gộp trùng</button>
              <button className={tab === "import" ? "on" : ""} onClick={() => setTab("import")}>Lần nạp dữ liệu gần nhất</button>
            </div>
            {tab === "import" ? (
              data.last_import ? (
                <div className="stack">
                  <div className="row">
                    <span>Nạp lúc {fmtUtc(data.last_import.finished_at)}</span>
                    {data.last_import.ok ? <span className="badge good">Đối soát khớp {data.last_import.checks.length}/{data.last_import.checks.length}</span> : <span className="badge bad">Có số liệu lệch</span>}
                  </div>
                  <SimpleTable
                    rows={data.last_import.checks}
                    columns={[
                      { key: "check", label: "Kiểm tra" },
                      { key: "actual", label: "Thực tế", align: "r", render: (r) => String(r.actual ?? "–") },
                      { key: "expected", label: "Kỳ vọng", align: "r", render: (r) => String(r.expected ?? "–") },
                      { key: "ok", label: "Kết quả", render: (r) => (r.ok ? <span className="badge good">Khớp</span> : <span className="badge bad">Lệch</span>) },
                    ]}
                  />
                  <SimpleTable
                    rows={data.last_import.files}
                    columns={[{ key: "name", label: "File nguồn" }, { key: "size", label: "Dung lượng", align: "r", render: (r) => `${fmtInt(Math.round(r.size / 1024))} KB` }, { key: "sha256", label: "SHA-256", render: (r) => r.sha256.slice(0, 16) + "…" }]}
                  />
                </div>
              ) : <div className="empty">Chưa có lần nạp nào</div>
            ) : (
              <LogTable key={`${tab}-${partner}`} kind={tab} partner={partner} />
            )}
          </section>
        </div>
      )}
    </>
  );
}
