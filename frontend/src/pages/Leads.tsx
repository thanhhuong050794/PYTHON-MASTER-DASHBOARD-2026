import { useMemo } from "react";
import { Chart } from "../components/Chart";
import { ChartCard, Note, StatTile } from "../components/ChartCard";
import { DataTable, type TableCol } from "../components/DataTable";
import { FilterBar, type FilterDef } from "../components/FilterBar";
import { SimpleBarCard } from "../components/Viz";
import { qs } from "../lib/api";
import { barHeight, barOption } from "../lib/charts";
import { fmtInt, fmtLocalDateTime, fmtPct } from "../lib/format";
import { useApi, useScope, useUrlFilters } from "../lib/hooks";
import { entityColor, usePalette } from "../lib/theme";
import type { Options } from "../lib/types";

type KV = { key: string | null; count: number };
type LeadSummary = {
  kpi: { total: number; new_leads: number; in_data: number; dup_external: number; wants_talkshow: number; self_declared_registered: number; unique_contacts: number };
  by_source_result: { source: string; result: string; count: number }[];
  weekly: { week: string; source: string; start: string; count: number }[];
  by_source: KV[]; by_campaign: KV[]; by_platform: KV[]; by_heard_from: KV[]; by_region: KV[]; by_board: KV[];
  by_segment: KV[]; by_pic: KV[]; by_self_declared: KV[]; by_question: KV[];
};
type LeadRow = {
  source: string; row_no: number; contact_id: string; result: string; segment: string; created_at: string | null; full_name: string;
  email: string | null; phone: string | null; board_interest: string; province: string | null; campaign: string | null;
  heard_from: string | null; platform: string | null; wants_talkshow: boolean; question: string | null; pic: string | null;
};

const KEYS = ["date_from", "date_to", "source", "board", "region", "result", "segment", "campaign", "platform", "pic"];
const RESULTS = ["Lead mới", "Đã có trong Data", "Trùng trong form ngoài"];

const COLUMNS: TableCol<LeadRow>[] = [
  { key: "created_at", label: "Thời gian", sort: "created_at", render: (r) => fmtLocalDateTime(r.created_at) },
  { key: "source", label: "Nguồn", sort: "source" },
  { key: "contact_id", label: "Contact ID", sort: "contact_id" },
  { key: "full_name", label: "Họ tên", sort: "full_name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "SĐT" },
  { key: "result", label: "Kết quả làm sạch", sort: "result", render: (r) => <span className={`badge ${r.result === "Lead mới" ? "accent" : ""}`}>{r.result}</span> },
  { key: "segment", label: "Segment", sort: "segment" },
  { key: "board_interest", label: "Bảng quan tâm" },
  { key: "campaign", label: "Campaign / biết qua", sort: "campaign", render: (r) => r.campaign ?? r.heard_from ?? "–" },
  { key: "platform", label: "Nền tảng", render: (r) => r.platform ?? "–" },
  { key: "question", label: "Câu hỏi", wrap: true, render: (r) => r.question ?? "–" },
  { key: "pic", label: "PIC" },
];

export default function Leads() {
  const p = usePalette();
  const { partner } = useScope();
  const { values, set, clear } = useUrlFilters(KEYS);
  const params = { ...values, partner };
  const { data: opts } = useApi<Options>(`/meta/options${qs({ partner })}`);
  const { data, loading, error } = useApi<LeadSummary>(`/leads/summary${qs(params)}`);
  const o = opts?.leads;

  const defs: FilterDef[] = o ? [
    { type: "date", label: "Thời gian", min: "2026-08-01", max: "2026-09-30" },
    { type: "multi", key: "source", label: "Nguồn", options: o.source },
    { type: "multi", key: "result", label: "Kết quả", options: o.result },
    { type: "multi", key: "board", label: "Bảng quan tâm", options: o.board },
    { type: "multi", key: "region", label: "Miền", options: o.region },
    { type: "multi", key: "segment", label: "Segment", options: o.segment },
    { type: "multi", key: "campaign", label: "Campaign FB", options: o.campaign },
    { type: "multi", key: "platform", label: "Nền tảng", options: o.platform },
    { type: "multi", key: "pic", label: "PIC", options: o.pic },
  ] : [];

  const sources = useMemo(() => [...new Set((data?.by_source_result ?? []).map((r) => r.source))].sort(), [data]);
  const resultOption = useMemo(() => barOption(p, {
    categories: sources,
    series: RESULTS.map((res) => ({
      name: res,
      data: sources.map((s) => data?.by_source_result.find((r) => r.source === s && r.result === res)?.count ?? 0),
      color: entityColor(p, "result", res),
    })),
    horizontal: true, stack: true, labels: true, valueFmt: fmtInt,
  }), [p, data, sources]);

  const weeks = useMemo(() => [...new Set((data?.weekly ?? []).map((w) => w.week))].sort(), [data]);
  const weekLabels = useMemo(() => weeks.map((w) => {
    const start = data?.weekly.filter((x) => x.week === w).map((x) => x.start).sort()[0];
    return start ? `Tuần ${fmtLocalDateTime(start, false).slice(0, 5)}` : w;
  }), [weeks, data]);
  const weeklyOption = useMemo(() => barOption(p, {
    categories: weekLabels,
    series: sources.map((s) => ({
      name: s,
      data: weeks.map((w) => data?.weekly.find((x) => x.week === w && x.source === s)?.count ?? 0),
      color: entityColor(p, "source", s),
    })),
    stack: true, labels: true, valueFmt: fmtInt,
  }), [p, data, weeks, weekLabels, sources]);

  const k = data?.kpi;
  return (
    <>
      <p className="page-desc">Lead từ 2 form bên ngoài (Talkshow Google Form, FB Lead Form) được đối chiếu với dữ liệu website trước khi nhập CRM để tránh sinh hồ sơ trùng.</p>
      <FilterBar defs={defs} values={values} set={set} clear={clear} />
      {error && <Note warn>{error}</Note>}
      {k && (
        <div className={`kpis${loading ? " loading-dim" : ""}`}>
          <StatTile label="Dòng lead (2 form)" value={fmtInt(k.total)} hint={`${fmtInt(k.unique_contacts)} liên hệ duy nhất`} />
          <StatTile label="Lead mới" value={fmtInt(k.new_leads)} hint="Chưa có trong dữ liệu website" />
          <StatTile label="Đã có trong Data" value={fmtInt(k.in_data)} hint="Gộp vào hồ sơ sẵn có" />
          <StatTile label="Trùng trong form ngoài" value={fmtInt(k.dup_external)} hint="Điền form nhiều lần" />
          <StatTile label="Muốn nhận lịch Talkshow" value={fmtInt(k.wants_talkshow)} hint={fmtPct(k.total ? k.wants_talkshow / k.total : null, 0)} />
          <StatTile label="Tự khai “Đã đăng ký”" value={fmtInt(k.self_declared_registered)} hint="Cần xác minh với Data" />
        </div>
      )}
      {data && (
        <div className="grid">
          <ChartCard
            title="Kết quả làm sạch theo nguồn" className="col-6" loading={loading} empty={!sources.length}
            legend={RESULTS.map((r) => ({ label: r, color: entityColor(p, "result", r) }))}
            table={{ columns: [{ key: "source", label: "Nguồn" }, { key: "result", label: "Kết quả" }, { key: "count", label: "Dòng", align: "r" }], rows: data.by_source_result }}
          >
            <Chart option={resultOption} height={barHeight(sources.length, true, 56)} ariaLabel="Kết quả làm sạch theo nguồn" />
          </ChartCard>
          <ChartCard
            title="Lead theo tuần" className="col-6" loading={loading} empty={!weeks.length}
            legend={sources.map((s) => ({ label: s, color: entityColor(p, "source", s) }))}
            table={{ columns: [{ key: "week", label: "Tuần ISO" }, { key: "source", label: "Nguồn" }, { key: "count", label: "Lead", align: "r" }], rows: data.weekly }}
          >
            <Chart option={weeklyOption} height={260} ariaLabel="Lead theo tuần" />
          </ChartCard>
          <SimpleBarCard title="Campaign Facebook" sub="Số lead theo chiến dịch quảng cáo" rows={data.by_campaign} valueLabel="Lead" keyLabel="Campaign" loading={loading} />
          <SimpleBarCard title="Biết Talkshow qua đâu" rows={data.by_heard_from} valueLabel="Lead" keyLabel="Kênh" loading={loading} />
          <SimpleBarCard title="Nền tảng quảng cáo" rows={data.by_platform} valueLabel="Lead" keyLabel="Nền tảng" loading={loading} className="col-4" />
          <SimpleBarCard title="Bảng thi quan tâm" rows={data.by_board} valueLabel="Lead" keyLabel="Bảng" loading={loading} className="col-4" />
          <SimpleBarCard title="Segment CRM" rows={data.by_segment} valueLabel="Lead" keyLabel="Segment" loading={loading} className="col-4" />
          <SimpleBarCard title="Khu vực" rows={data.by_region} valueLabel="Lead" keyLabel="Miền" loading={loading} className="col-4" />
          <SimpleBarCard title="Tình trạng tự khai" rows={data.by_self_declared} valueLabel="Lead" keyLabel="Tự khai" loading={loading} className="col-4" />
          <SimpleBarCard title="PIC phụ trách" rows={data.by_pic} fallback="(Chưa phân PIC)" valueLabel="Lead" keyLabel="PIC" loading={loading} className="col-4" />
          <SimpleBarCard title="Câu hỏi thường gặp" sub="Nội dung cần đưa vào FAQ / kịch bản tư vấn" rows={data.by_question} valueLabel="Lượt hỏi" keyLabel="Câu hỏi" loading={loading} className="col-12" />
        </div>
      )}
      <div className="grid">
        <DataTable<LeadRow> title="Danh sách lead" path="/leads/list" params={params} columns={COLUMNS} defaultSort="-created_at" />
      </div>
    </>
  );
}
