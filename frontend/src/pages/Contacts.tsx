import { useMemo } from "react";
import { Chart } from "../components/Chart";
import { ChartCard, Note, StatTile } from "../components/ChartCard";
import { DataTable, type TableCol } from "../components/DataTable";
import { FilterBar, type FilterDef } from "../components/FilterBar";
import { FunnelCard, HeatmapCard, SimpleBarCard, StatusStackCard } from "../components/Viz";
import { qs } from "../lib/api";
import { barOption } from "../lib/charts";
import { fmtInt, fmtLocalDateTime, fmtPct, fmtVnd, fmtVndCompact, shortDate } from "../lib/format";
import { useApi, useScope, useUrlFilters } from "../lib/hooks";
import { entityColor, usePalette } from "../lib/theme";
import type { ContactSummary, Options } from "../lib/types";

export const CONTACT_KEYS = ["date_from", "date_to", "board", "region", "province", "payment_status", "segment", "channel", "source", "pic", "venue"];

export function contactFilterDefs(o: Options["contacts"] | undefined, full = true): FilterDef[] {
  if (!o) return [];
  const defs: FilterDef[] = [
    { type: "date", label: "Thời gian", min: o.date_min, max: o.date_max },
    { type: "multi", key: "board", label: "Bảng", options: o.board },
    { type: "multi", key: "region", label: "Miền", options: o.region },
  ];
  if (!full) return defs;
  return [
    ...defs,
    { type: "multi", key: "province", label: "Tỉnh/TP", options: o.province },
    { type: "multi", key: "payment_status", label: "Thanh toán", options: o.payment_status },
    { type: "multi", key: "segment", label: "Segment", options: o.segment },
    { type: "multi", key: "channel", label: "Kênh", options: o.channel },
    { type: "multi", key: "source", label: "Nguồn dữ liệu", options: o.source },
    { type: "multi", key: "pic", label: "PIC", options: [...o.pic, { value: "__none__", label: "(Chưa có PIC)" }] },
    { type: "multi", key: "venue", label: "Điểm thi", options: o.venue },
  ];
}

type ContactRow = {
  contact_id: string; full_name: string; email: string | null; phone: string | null; board: string; province: string | null;
  payment_status: string; revenue: number; channel: string; channel_is_assumed: boolean; segment: string; drip: string;
  sources: string[]; pic: string | null; first_touch: string | null; web_registered_at: string | null; exam_venue: string | null; flags: string[];
};

const PAY_BADGE: Record<string, string> = { "Đã thanh toán": "good", "Miễn phí": "good", "Chưa thanh toán": "warn", "Chưa đăng ký": "" };

const COLUMNS: TableCol<ContactRow>[] = [
  { key: "contact_id", label: "Mã", sort: "contact_id" },
  { key: "full_name", label: "Họ tên", sort: "full_name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "SĐT" },
  { key: "board", label: "Bảng", sort: "board" },
  { key: "province", label: "Tỉnh/TP", sort: "province" },
  { key: "payment_status", label: "Thanh toán", sort: "payment_status", render: (r) => <span className={`badge ${PAY_BADGE[r.payment_status] ?? ""}`}>{r.payment_status}</span> },
  { key: "revenue", label: "Doanh thu", align: "r", sort: "revenue", render: (r) => (r.revenue ? fmtVnd(r.revenue) : "–") },
  { key: "channel", label: "Kênh", sort: "channel", render: (r) => <>{r.channel}{r.channel_is_assumed && <span className="badge warn" title="Kênh gán giả định" style={{ marginLeft: 6 }}>GĐ</span>}</> },
  { key: "segment", label: "Segment", sort: "segment" },
  { key: "sources", label: "Nguồn", render: (r) => r.sources.join(", ") },
  { key: "pic", label: "PIC", sort: "pic" },
  { key: "first_touch", label: "Tiếp xúc đầu", sort: "first_touch", render: (r) => fmtLocalDateTime(r.first_touch) },
  { key: "exam_venue", label: "Điểm thi" },
  { key: "flags", label: "Cần kiểm tra", render: (r) => (r.flags.length ? <span className="badge warn" title={r.flags.join("; ")}>{r.flags.length} cờ</span> : "") },
];

export default function Contacts() {
  const p = usePalette();
  const { partner } = useScope();
  const { values, set, clear } = useUrlFilters(CONTACT_KEYS);
  const params = { ...values, partner };
  const { data: opts } = useApi<Options>(`/meta/options${qs({ partner })}`);
  const { data, loading, error } = useApi<ContactSummary>(`/contacts/summary${qs(params)}`);

  const dailyOption = useMemo(() => {
    const t = (data?.timeline ?? []).filter((x) => x.registrations || x.new_contacts);
    return barOption(p, {
      categories: t.map((x) => shortDate(x.date)),
      series: [
        { name: "Đã thanh toán", data: t.map((x) => x.paid), color: p.ord[0] },
        { name: "Đăng ký chưa thanh toán", data: t.map((x) => x.registrations - x.paid), color: p.ord[1] },
      ],
      stack: true, valueFmt: fmtInt,
    });
  }, [p, data]);

  const boardOption = useMemo(() => {
    const rows = data?.by_board ?? [];
    return barOption(p, {
      categories: ["Liên hệ", "Đăng ký web", "Đã thanh toán"],
      series: rows.map((r) => ({ name: String(r.key), data: [r.count, r.web_registered, r.paid], color: entityColor(p, "board", r.key) })),
      valueFmt: fmtInt, labels: true,
    });
  }, [p, data]);

  const k = data?.kpi;
  return (
    <>
      <p className="page-desc">145 hồ sơ vàng (golden record) sau khi gộp trùng 3 nguồn: website, Talkshow Google Form, FB Lead Form. Mọi biểu đồ và bảng bên dưới dùng chung bộ lọc.</p>
      <FilterBar defs={contactFilterDefs(opts?.contacts)} values={values} set={set} clear={clear} />
      {error && <Note warn>{error}</Note>}
      {k && (
        <div className={`kpis${loading ? " loading-dim" : ""}`}>
          <StatTile label="Liên hệ duy nhất" value={fmtInt(k.total)} hint={`${fmtInt(k.merged_records)} bản ghi đã gộp`} />
          <StatTile label="Đăng ký trên website" value={fmtInt(k.web_registered)} hint={`${fmtInt(k.leads_only)} lead chưa đăng ký`} />
          <StatTile label="Đã thanh toán" value={fmtInt(k.paid)} hint={`Tỉ lệ ${fmtPct(k.paid_rate)} / đăng ký web`} />
          <StatTile label="Doanh thu ghi nhận" value={fmtVndCompact(k.revenue)} hint={fmtVnd(k.revenue)} />
          <StatTile label="Doanh thu tiềm năng" value={fmtVndCompact(k.potential_revenue)} hint={`${fmtInt(k.unpaid_registered)} người đăng ký chưa thanh toán`} />
          <StatTile label="Cần kiểm tra thủ công" value={fmtInt(k.flagged)} hint="Liên hệ có cờ cảnh báo" />
        </div>
      )}
      {data && (
        <div className="grid">
          <FunnelCard funnel={data.funnel} loading={loading} />
          <ChartCard
            title="Đăng ký web theo ngày" className="col-7" loading={loading} empty={!data.timeline.length}
            sub={`Lượt đăng ký mới trong ngày, tách theo trạng thái thanh toán hiện tại.${k?.undated_registrations ? ` ${k.undated_registrations} lượt đăng ký không có ngày trong dữ liệu gốc.` : ""}`}
            legend={[{ label: "Đã thanh toán", color: p.ord[0] }, { label: "Đăng ký chưa thanh toán", color: p.ord[1] }]}
            table={{ columns: [
              { key: "date", label: "Ngày", render: (r) => shortDate(r.date) },
              { key: "registrations", label: "Đăng ký", align: "r" },
              { key: "paid", label: "Đã thanh toán", align: "r" },
            ], rows: data.timeline.filter((t) => t.registrations) }}
          >
            <Chart option={dailyOption} height={280} ariaLabel="Đăng ký web theo ngày" />
          </ChartCard>

          <StatusStackCard title="Theo segment CRM" rows={data.by_segment.map((r) => ({ ...r, key: `${r.key} · ${r.name}` }))} sortByCount={false} loading={loading} />
          <StatusStackCard title="Theo tỉnh/thành" rows={data.by_province} labelFallback="(Chưa rõ tỉnh)" loading={loading} />
          <StatusStackCard title="Hiệu suất theo PIC (người phụ trách)" sub="Số liên hệ PIC đang chăm sóc và kết quả chuyển đổi" rows={data.by_pic} labelFallback="(Chưa phân PIC)" loading={loading} />
          <StatusStackCard title="Theo tổ hợp nguồn dữ liệu" sub="Lịch sử đa kênh của từng người (attribution)" rows={data.by_source_combo} loading={loading} />

          <ChartCard
            title="So sánh Bảng A và Bảng B" className="col-6" loading={loading} empty={!data.by_board.length}
            legend={data.by_board.map((r) => ({ label: String(r.key), color: entityColor(p, "board", r.key) }))}
            table={{ columns: [
              { key: "key", label: "Bảng" }, { key: "count", label: "Liên hệ", align: "r" },
              { key: "web_registered", label: "Đăng ký web", align: "r" }, { key: "paid", label: "Đã thanh toán", align: "r" },
              { key: "revenue", label: "Doanh thu", align: "r", render: (r) => fmtVnd(r.revenue) },
            ], rows: data.by_board }}
          >
            <Chart option={boardOption} height={280} ariaLabel="So sánh Bảng A và B" />
          </ChartCard>
          <SimpleBarCard title="Drip campaign đang chạy" rows={data.by_drip} loading={loading} valueLabel="Liên hệ" keyLabel="Drip" />
          <SimpleBarCard title="Điểm thi (thí sinh đã thanh toán)" rows={data.by_venue} fallback="(Chưa xếp điểm thi)" loading={loading} valueLabel="Liên hệ" keyLabel="Điểm thi" className="col-6" />
          <SimpleBarCard title="Cờ cần kiểm tra thủ công" sub="Lọc bỏ trước khi gửi email hàng loạt" rows={data.by_flag} loading={loading} valueLabel="Liên hệ" keyLabel="Cờ" className="col-6" />
          <HeatmapCard cells={data.heatmap} loading={loading} />
        </div>
      )}
      <div className="grid">
        <DataTable<ContactRow> title="Danh sách liên hệ" path="/contacts/list" params={params} columns={COLUMNS} defaultSort="contact_id" />
      </div>
    </>
  );
}
