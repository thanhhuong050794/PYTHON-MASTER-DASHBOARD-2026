import { useMemo } from "react";
import { Chart } from "../components/Chart";
import { ChartCard, Note, SimpleTable, StatTile } from "../components/ChartCard";
import { DataTable, type TableCol } from "../components/DataTable";
import { FilterBar, type FilterDef } from "../components/FilterBar";
import { SimpleBarCard } from "../components/Viz";
import { qs } from "../lib/api";
import { barHeight, barOption, boxplotOption, scatterOption } from "../lib/charts";
import { fmtInt, fmtNum, fmtPct } from "../lib/format";
import { useApi, useScope, useUrlFilters } from "../lib/hooks";
import { entityColor, usePalette } from "../lib/theme";
import type { ExamSummary, Options, StatRow } from "../lib/types";

const KEYS = ["dataset", "board", "region", "province", "school_type", "school", "paid", "grade", "certificate", "advanced"];
const SECTION_LABEL: Record<string, string> = { reading: "Đọc hiểu code", design: "Design · viết hàm", debugging: "Debugging" };
const ROUND_LABEL: Record<string, string> = { qualifier: "Vòng loại", final: "Chung kết" };
const BINS = Array.from({ length: 10 }, (_, i) => (i === 9 ? "900–1000" : `${i * 100}–${i * 100 + 99}`));

type Part = { level: string; sections: Record<string, number>; total: number; rank: number; grade: string } | null;
type CandRow = {
  stt: number; contact_id: string | null; full_name: string; email: string | null; board: string; school: string; province: string;
  paid: boolean; qualifier: Part; final: Part; advanced: boolean; certificate: boolean;
};

const COLUMNS: TableCol<CandRow>[] = [
  { key: "rank", label: "Hạng VL", align: "r", sort: "qualifier.rank", render: (r) => r.qualifier?.rank ?? "–" },
  { key: "full_name", label: "Họ tên", sort: "full_name" },
  { key: "contact_id", label: "Contact ID", render: (r) => r.contact_id ?? "–" },
  { key: "email", label: "Email" },
  { key: "board", label: "Bảng" },
  { key: "school", label: "Trường", sort: "school" },
  { key: "province", label: "Tỉnh/TP", sort: "province" },
  { key: "paid", label: "Thanh toán", render: (r) => (r.paid ? <span className="badge good">Đã TT</span> : <span className="badge">Chưa</span>) },
  { key: "reading", label: "Đọc hiểu", align: "r", render: (r) => fmtNum(r.qualifier?.sections.reading, 0) },
  { key: "design", label: "Design", align: "r", render: (r) => fmtNum(r.qualifier?.sections.design, 0) },
  { key: "debugging", label: "Debug", align: "r", render: (r) => fmtNum(r.qualifier?.sections.debugging, 0) },
  { key: "q_total", label: "Tổng VL", align: "r", sort: "qualifier.total", render: (r) => <b>{fmtNum(r.qualifier?.total, 0)}</b> },
  { key: "grade", label: "Xếp loại", render: (r) => r.qualifier?.grade ?? "–" },
  { key: "f_total", label: "Tổng CK", align: "r", sort: "final.total", render: (r) => fmtNum(r.final?.total, 0) },
  { key: "cert", label: "Chứng chỉ", render: (r) => (r.certificate ? <span className="badge good">Đạt</span> : "–") },
];

export default function Exams() {
  const p = usePalette();
  const { partner } = useScope();
  const { values, set, clear } = useUrlFilters(KEYS);
  const dataset = values.dataset ?? "PM119";
  const params = { ...values, dataset, partner };
  const { data: opts } = useApi<Options>(`/meta/options${qs({ partner, dataset })}`);
  const { data, loading, error } = useApi<ExamSummary>(`/exams/summary${qs(params)}`);
  const o = opts?.exams;

  const defs: FilterDef[] = o ? [
    { type: "single", key: "dataset", label: "Bộ dữ liệu", options: o.datasets.map((d) => ({ value: d.code, label: d.label })), required: true, allLabel: o.datasets.find((d) => d.code === "PM119")?.label },
    { type: "multi", key: "board", label: "Bảng", options: o.board },
    { type: "multi", key: "school_type", label: "Loại trường", options: o.school_type },
    { type: "multi", key: "school", label: "Trường", options: o.school },
    { type: "multi", key: "region", label: "Miền", options: o.region },
    { type: "multi", key: "province", label: "Tỉnh/TP", options: o.province },
    { type: "single", key: "paid", label: "Thanh toán", options: [{ value: "true", label: "Đã thanh toán" }, { value: "false", label: "Chưa thanh toán" }] },
    { type: "multi", key: "grade", label: "Xếp loại VL", options: o.grade },
    { type: "single", key: "certificate", label: "Chứng chỉ", options: [{ value: "true", label: "Đạt (≥ 600)" }, { value: "false", label: "Chưa đạt" }] },
    { type: "single", key: "advanced", label: "Chung kết", options: [{ value: "true", label: "Vào chung kết" }, { value: "false", label: "Dừng ở vòng loại" }] },
  ] : [];

  const boards = useMemo(() => [...new Set((data?.histogram ?? []).map((h) => h.board))].sort(), [data]);
  const histOption = useMemo(() => barOption(p, {
    categories: BINS,
    series: boards.map((b) => ({
      name: b, data: BINS.map((_, i) => data?.histogram.find((h) => h.board === b && h.bin === i)?.count ?? 0), color: entityColor(p, "board", b),
    })),
    stack: true, labels: true, valueFmt: fmtInt,
  }), [p, data, boards]);

  const groups = useMemo(() => {
    const keys = new Set((data?.sections ?? []).map((s) => `${s.board}|${s.round}`));
    return ["Bảng A|qualifier", "Bảng A|final", "Bảng B|qualifier", "Bảng B|final"].filter((k) => keys.has(k));
  }, [data]);
  const groupLabel = (g: string) => `${g.split("|")[0]} – ${ROUND_LABEL[g.split("|")[1]]}`;
  const sectionOption = useMemo(() => barOption(p, {
    categories: Object.values(SECTION_LABEL),
    series: groups.map((g, i) => ({
      name: groupLabel(g),
      data: Object.keys(SECTION_LABEL).map((sec) => data?.sections.find((s) => `${s.board}|${s.round}` === g && s.section === sec)?.pct ?? null),
      color: p.series[i],
    })),
    valueFmt: (v) => fmtPct(v, 0), max: 1,
  }), [p, data, groups]);

  const gradeCats = groups;
  const gradeOption = useMemo(() => {
    const order = data?.grade_order ?? [];
    const totals = gradeCats.map((g) => (data?.grades ?? []).filter((x) => `${x.board}|${x.round}` === g).reduce((a, x) => a + x.count, 0));
    return barOption(p, {
      categories: gradeCats.map(groupLabel),
      series: order.map((gr, gi) => ({
        name: gr,
        data: gradeCats.map((g, ci) => {
          const c = data?.grades.find((x) => `${x.board}|${x.round}` === g && x.grade === gr)?.count ?? 0;
          return totals[ci] ? c / totals[ci] : 0;
        }),
        color: p.ord[gi],
      })),
      horizontal: true, stack: true, valueFmt: (v) => fmtPct(v, 0), max: 1, labelWidth: 150,
    });
  }, [p, data, gradeCats]);

  const schools = useMemo(() => (data?.by_school ?? []).filter((s) => s.box).sort((a, b) => (b.box![2] - a.box![2])), [data]);
  const boxOption = useMemo(() => boxplotOption(p, {
    categories: schools.map((s) => String(s.key)),
    boxes: schools.map((s) => s.box!),
    counts: schools.map((s) => s.count),
    color: p.series[0],
    markLine: data ? { value: data.params.certificate_threshold, label: "Ngưỡng chứng chỉ" } : undefined,
  }), [p, schools, data]);

  const scatter = useMemo(() => scatterOption(p, {
    series: [...new Set((data?.finalists ?? []).map((f) => f.board))].sort().map((b) => ({
      name: b, color: entityColor(p, "board", b),
      points: (data?.finalists ?? []).filter((f) => f.board === b).map((f) => ({ x: f.qualifier, y: f.final, label: `${f.full_name} · ${f.school}` })),
    })),
    xName: "Điểm Vòng loại", yName: "Điểm Chung kết", min: 400,
  }), [p, data]);

  const provinces = useMemo(() => [...(data?.by_province ?? [])].sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0)), [data]);
  const paidRows = useMemo(() => (data?.by_paid ?? []).map((r) => ({ ...r, key: r.key ? "Đã thanh toán" : "Chưa thanh toán" })), [data]);

  const k = data?.kpi;
  const statCols = [
    { key: "count", label: "Thí sinh", align: "r" as const, render: (r: StatRow) => fmtInt(r.count) },
    { key: "certificates", label: "Đạt chứng chỉ", align: "r" as const, render: (r: StatRow) => `${fmtInt(r.certificates)} (${fmtPct(r.cert_rate, 0)})` },
    { key: "finalists", label: "Vào CK", align: "r" as const, render: (r: StatRow) => fmtInt(r.finalists) },
  ];

  return (
    <>
      <Note warn>Điểm thi là <b>dữ liệu giả lập</b> (số ngẫu nhiên, seed 2028) theo đúng cấu trúc đề Python Master — không dùng để công bố, xếp hạng hay đánh giá cá nhân.</Note>
      <FilterBar defs={defs} values={values} set={set} clear={clear} />
      {error && <Note warn>{error}</Note>}
      {k && (
        <div className={`kpis${loading ? " loading-dim" : ""}`}>
          <StatTile label="Thí sinh có điểm" value={fmtInt(k.count)} hint={`${fmtInt(k.paid)} đã thanh toán`} />
          <StatTile label="Điểm TB Vòng loại" value={fmtNum(k.avg, 0)} hint={`Thấp nhất ${fmtNum(k.min, 0)} · thang 1.000`} />
          <StatTile label="Điểm cao nhất VL" value={fmtNum(k.max, 0)} />
          <StatTile label="Vào chung kết" value={fmtInt(k.finalists)} hint={k.final_avg !== null ? `Điểm TB chung kết ${fmtNum(k.final_avg, 0)}` : "Top 10% mỗi bảng"} />
          <StatTile label="Đạt chứng chỉ COS Pro" value={fmtInt(k.certificates)} hint={`${fmtPct(k.cert_rate)} · ≥ ${data?.params.certificate_threshold ?? 600} điểm ở vòng bất kỳ`} />
        </div>
      )}
      {data && (
        <div className="grid">
          <ChartCard
            title="Phân bố tổng điểm Vòng loại" className="col-7" loading={loading} empty={!data.histogram.length}
            sub="Số thí sinh theo khoảng 100 điểm; từ 600 trở lên đạt ngưỡng chứng chỉ"
            legend={boards.map((b) => ({ label: b, color: entityColor(p, "board", b) }))}
            table={{ columns: [{ key: "bin", label: "Khoảng điểm", render: (r: { bin: number }) => BINS[r.bin] }, { key: "board", label: "Bảng" }, { key: "count", label: "Thí sinh", align: "r" }], rows: [...data.histogram].sort((a, b) => a.bin - b.bin) }}
          >
            <Chart option={histOption} height={300} ariaLabel="Phân bố điểm vòng loại" />
          </ChartCard>
          <ChartCard
            title="Tỉ lệ điểm theo phần thi" className="col-5" loading={loading} empty={!groups.length}
            sub="Điểm TB ÷ điểm tối đa của phần — phần thấp nhất là điểm yếu cần ôn"
            legend={groups.map((g, i) => ({ label: groupLabel(g), color: p.series[i] }))}
            table={{ columns: [
              { key: "g", label: "Bảng – vòng", render: (r: ExamSummary["sections"][number]) => `${r.board} – ${ROUND_LABEL[r.round]}` },
              { key: "section", label: "Phần thi", render: (r: ExamSummary["sections"][number]) => SECTION_LABEL[r.section] },
              { key: "avg", label: "Điểm TB", align: "r", render: (r: ExamSummary["sections"][number]) => `${fmtNum(r.avg, 0)} / ${r.max_score}` },
              { key: "pct", label: "Tỉ lệ", align: "r", render: (r: ExamSummary["sections"][number]) => fmtPct(r.pct) },
            ], rows: data.sections }}
          >
            <Chart option={sectionOption} height={300} ariaLabel="Tỉ lệ điểm theo phần thi" />
          </ChartCard>

          <ChartCard
            title="Xếp loại theo bảng và vòng" className="col-6" loading={loading} empty={!data.grades.length}
            sub="Tỉ trọng Giỏi / Khá / Trung bình / Yếu — chung kết ít người nên kém ổn định"
            legend={data.grade_order.map((g, i) => ({ label: g, color: p.ord[i] }))}
            table={{ columns: [
              { key: "board", label: "Bảng" }, { key: "round", label: "Vòng", render: (r: { round: string }) => ROUND_LABEL[r.round] },
              { key: "grade", label: "Xếp loại" }, { key: "count", label: "Thí sinh", align: "r" },
            ], rows: data.grades }}
          >
            <Chart option={gradeOption} height={barHeight(gradeCats.length, true, 46)} ariaLabel="Xếp loại theo bảng và vòng" />
          </ChartCard>
          <ChartCard
            title="Vòng loại → Chung kết" className="col-6" loading={loading} empty={!data.finalists.length}
            sub="Mỗi chấm là 1 thí sinh vào chung kết"
            legend={[...new Set(data.finalists.map((f) => f.board))].sort().map((b) => ({ label: b, color: entityColor(p, "board", b) }))}
            table={{ columns: [
              { key: "full_name", label: "Thí sinh" }, { key: "board", label: "Bảng" }, { key: "school", label: "Trường" },
              { key: "qualifier", label: "VL", align: "r" }, { key: "final", label: "CK", align: "r" }, { key: "final_rank", label: "Hạng CK", align: "r" },
            ], rows: data.finalists }}
          >
            <Chart option={scatter} height={300} ariaLabel="Điểm vòng loại và chung kết của thí sinh chung kết" />
          </ChartCard>

          <ChartCard
            title="Phân bố điểm theo trường" className="col-7" loading={loading} empty={!schools.length}
            sub="Hộp = khoảng tứ phân vị, vạch giữa = trung vị; sắp theo trung vị giảm dần"
            table={{ columns: [
              { key: "key", label: "Trường", render: (r: StatRow) => String(r.key) },
              { key: "avg", label: "Điểm TB", align: "r", render: (r: StatRow) => fmtNum(r.avg, 0) },
              { key: "median", label: "Trung vị", align: "r", render: (r: StatRow) => fmtNum(r.box?.[2], 0) },
              ...statCols,
            ], rows: schools }}
          >
            <Chart option={boxOption} height={barHeight(schools.length, true, 28)} ariaLabel="Phân bố điểm theo trường" />
          </ChartCard>
          <SimpleBarCard<StatRow & { key: string }>
            title="Điểm TB Vòng loại theo tỉnh/thành" className="col-5" loading={loading}
            rows={provinces as (StatRow & { key: string })[]} value={(r) => r.avg} fmt={(v) => fmtNum(v, 0)} valueLabel="Điểm TB" keyLabel="Tỉnh/TP"
            extraCols={statCols}
          />

          <section className={`card col-6${loading ? " loading" : ""}`}>
            <div className="card-head"><div><h2>Thống kê theo bảng thi</h2><div className="sub">Vòng loại (VL) và Chung kết (CK)</div></div></div>
            <SimpleTable
              rows={data.by_board.map((b) => ({ ...b, final: data.final_by_board.find((f) => f.key === b.key) }))}
              columns={[
                { key: "key", label: "Bảng", render: (r) => String(r.key) },
                { key: "count", label: "Thí sinh", align: "r" },
                { key: "avg", label: "TB VL", align: "r", render: (r) => fmtNum(r.avg, 0) },
                { key: "range", label: "Min–Max VL", align: "r", render: (r) => `${fmtNum(r.min, 0)}–${fmtNum(r.max, 0)}` },
                { key: "finalists", label: "Vào CK", align: "r" },
                { key: "favg", label: "TB CK", align: "r", render: (r) => fmtNum(r.final?.avg, 0) },
                { key: "cert", label: "Chứng chỉ", align: "r", render: (r) => `${r.certificates} (${fmtPct(r.cert_rate, 0)})` },
              ]}
            />
          </section>
          <SimpleBarCard<StatRow & { key: string }>
            title="Đã thanh toán và chưa thanh toán" sub="Điểm TB Vòng loại của 2 nhóm" className="col-6" loading={loading}
            rows={paidRows as (StatRow & { key: string })[]} value={(r) => r.avg} fmt={(v) => fmtNum(v, 0)} valueLabel="Điểm TB" keyLabel="Nhóm" extraCols={statCols}
          />
        </div>
      )}
      <div className="grid">
        <DataTable<CandRow> title="Bảng điểm thí sinh" path="/exams/list" params={params} columns={COLUMNS} defaultSort="-qualifier.total" searchPlaceholder="Tìm theo tên, email, trường, mã…" />
      </div>
    </>
  );
}
