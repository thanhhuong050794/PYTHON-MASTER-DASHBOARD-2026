import { useMemo } from "react";
import { Chart } from "../components/Chart";
import { ChartCard, Note, SimpleTable, StatTile } from "../components/ChartCard";
import { FilterBar } from "../components/FilterBar";
import { StatusStackCard } from "../components/Viz";
import { qs } from "../lib/api";
import { barHeight, barOption } from "../lib/charts";
import { fmtInt, fmtNum, fmtPct, fmtSignedPct, fmtVnd, fmtVndCompact } from "../lib/format";
import { useApi, useScope, useUrlFilters } from "../lib/hooks";
import { entityColor, usePalette } from "../lib/theme";
import type { ChannelRow, MarketingSummary, Options } from "../lib/types";
import { contactFilterDefs } from "./Contacts";

export default function Marketing() {
  const p = usePalette();
  const { partner } = useScope();
  const { values, set, clear } = useUrlFilters(["date_from", "date_to", "board", "region"]);
  const { data: opts } = useApi<Options>(`/meta/options${qs({ partner })}`);
  const { data, loading, error } = useApi<MarketingSummary>(`/marketing/summary${qs({ ...values, partner })}`);

  const channels = data?.channels ?? [];
  const budgeted = channels.filter((c) => c.budget_visible && (c.budget ?? 0) > 0);

  const roiOption = useMemo(() => barOption(p, {
    categories: budgeted.map((c) => c.channel),
    series: [{ name: "ROI", data: budgeted.map((c) => c.roi), color: p.divPos }],
    pointColors: budgeted.map((c) => ((c.roi ?? 0) >= 0 ? p.divPos : p.divNeg)),
    horizontal: true, labels: true, valueFmt: fmtSignedPct, labelWidth: 120,
  }), [p, budgeted]);

  const budgetOption = useMemo(() => barOption(p, {
    categories: budgeted.map((c) => c.channel),
    series: [
      { name: "Ngân sách", data: budgeted.map((c) => c.budget), color: p.series[0] },
      { name: "Doanh thu", data: budgeted.map((c) => c.revenue), color: p.series[1] },
    ],
    horizontal: true, valueFmt: fmtVndCompact, labelWidth: 120,
  }), [p, budgeted]);

  const cpaOption = useMemo(() => barOption(p, {
    categories: budgeted.map((c) => c.channel),
    series: [
      { name: "CPA lead (đăng ký web)", data: budgeted.map((c) => c.cpa_lead), color: p.series[0] },
      { name: "CPA thanh toán", data: budgeted.map((c) => c.cpa_paid), color: p.series[1] },
      { name: "CPA dự thi (giả định)", data: budgeted.map((c) => c.cpa_active), color: p.series[2] },
    ],
    horizontal: true, valueFmt: fmtVndCompact, labelWidth: 120,
  }), [p, budgeted]);

  const convRows = channels.filter((c) => c.web_registered > 0);
  const convOption = useMemo(() => barOption(p, {
    categories: convRows.map((c) => c.channel),
    series: [{ name: "Tỉ lệ thanh toán / đăng ký", data: convRows.map((c) => c.conversion), color: p.series[0] }],
    horizontal: true, labels: true, valueFmt: (v) => fmtPct(v, 0), labelWidth: 170, max: 1,
  }), [p, convRows]);

  const recon = channels.filter((c) => c.original_report);
  const reconOption = useMemo(() => barOption(p, {
    categories: recon.map((c) => c.channel),
    series: [
      { name: "Báo cáo gốc", data: recon.map((c) => c.original_report?.registrations ?? null), color: entityColor(p, "compare", "Báo cáo gốc") },
      { name: "Sau đối soát", data: recon.map((c) => c.web_registered), color: entityColor(p, "compare", "Sau đối soát") },
    ],
    horizontal: true, valueFmt: fmtInt, labelWidth: 120,
  }), [p, recon]);
  const reconRevOption = useMemo(() => barOption(p, {
    categories: recon.map((c) => c.channel),
    series: [
      { name: "Báo cáo gốc", data: recon.map((c) => c.original_report?.revenue ?? null), color: entityColor(p, "compare", "Báo cáo gốc") },
      { name: "Sau đối soát", data: recon.map((c) => c.revenue), color: entityColor(p, "compare", "Sau đối soát") },
    ],
    horizontal: true, valueFmt: fmtVndCompact, labelWidth: 120,
  }), [p, recon]);

  const ctrRows = budgeted.filter((c) => c.ctr !== null);
  const ctrOption = useMemo(() => barOption(p, {
    categories: ctrRows.map((c) => c.channel),
    series: [{ name: "CTR", data: ctrRows.map((c) => c.ctr), color: p.series[0] }],
    horizontal: true, labels: true, valueFmt: (v) => fmtPct(v, 1), labelWidth: 120,
  }), [p, ctrRows]);

  const k = data?.kpi;
  const anyAssumed = channels.some((c) => c.is_assumed || c.assumed_contacts > 0);
  const compareLegend = [
    { label: "Báo cáo gốc", color: entityColor(p, "compare", "Báo cáo gốc") },
    { label: "Sau đối soát", color: entityColor(p, "compare", "Sau đối soát") },
  ];

  return (
    <>
      <p className="page-desc">Hiệu quả 8 nhóm kênh: 6 kênh có ngân sách và 2 nhóm không tốn chi phí (Talkshow, Website trực tiếp). Số liệu thu về tính từ hồ sơ liên hệ nên luôn khớp với trang CRM.</p>
      <FilterBar defs={contactFilterDefs(opts?.contacts, false)} values={values} set={set} clear={clear} />
      {error && <Note warn>{error}</Note>}
      {anyAssumed && (
        <Note warn>
          Số liệu Google, TikTok, Email, Zalo là <b>giả định</b> (chia 32 liên hệ web chưa gắn UTM) vì dữ liệu gốc không có UTM của 4 kênh này; Facebook và Đối tác trường lấy từ dữ liệu thật.
        </Note>
      )}
      {data?.filtered && k?.budget !== null && (
        <Note>Đang lọc dữ liệu: doanh thu chỉ gồm tập đã lọc nhưng ngân sách là toàn kênh, nên ROI/CPA mang tính tham khảo.</Note>
      )}
      {k && (
        <div className={`kpis${loading ? " loading-dim" : ""}`}>
          <StatTile label="Ngân sách truyền thông" value={k.budget === null ? "–" : fmtVndCompact(k.budget)} hint={k.budget === null ? "Không có kênh trả phí thuộc phạm vi" : fmtVnd(k.budget)} />
          <StatTile label="Doanh thu thu về" value={fmtVndCompact(k.revenue)} hint={fmtVnd(k.revenue)} />
          <StatTile label={k.roi_program !== null ? "ROI toàn chương trình" : "ROI kênh trả phí"} value={fmtSignedPct(k.roi_program ?? k.roi_paid_channels)} hint={k.roi_program !== null ? `Kênh trả phí: ${fmtSignedPct(k.roi_paid_channels)}` : undefined} />
          <StatTile label="CPA / thí sinh thanh toán" value={fmtVndCompact(k.cpa_paid)} hint="Trên các kênh có ngân sách" />
          <StatTile label="Liên hệ được gán kênh" value={fmtInt(k.contacts)} hint={`${fmtInt(k.paid)} đã thanh toán`} />
        </div>
      )}
      {data && (
        <div className="grid">
          <section className={`card col-12${loading ? " loading" : ""}`}>
            <div className="card-head"><div><h2>Bảng hiệu quả theo kênh</h2><div className="sub">GĐ = số liệu giả định. ROI = (doanh thu − ngân sách) / ngân sách.</div></div></div>
            <SimpleTable<ChannelRow>
              rows={channels}
              columns={[
                { key: "channel", label: "Kênh", render: (r) => <>{r.channel}{r.is_assumed && <span className="badge warn" style={{ marginLeft: 6 }}>GĐ</span>}</> },
                { key: "contacts", label: "Liên hệ", align: "r" },
                { key: "web_registered", label: "Đăng ký web", align: "r" },
                { key: "unregistered", label: "Lead chưa ĐK", align: "r" },
                { key: "paid", label: "Thanh toán", align: "r" },
                { key: "conversion", label: "TT / ĐK", align: "r", render: (r) => fmtPct(r.conversion) },
                { key: "budget", label: "Ngân sách", align: "r", render: (r) => (r.budget_visible ? fmtVnd(r.budget) : "–") },
                { key: "revenue", label: "Doanh thu", align: "r", render: (r) => fmtVnd(r.revenue) },
                { key: "roi", label: "ROI", align: "r", render: (r) => <span className={r.roi === null ? "" : r.roi >= 0 ? "delta-up" : "delta-down"}>{fmtSignedPct(r.roi)}</span> },
                { key: "cpa_paid", label: "CPA thanh toán", align: "r", render: (r) => fmtVnd(r.cpa_paid) },
                { key: "clicks", label: "Click", align: "r", render: (r) => fmtInt(r.clicks) },
                { key: "ctr", label: "CTR", align: "r", render: (r) => fmtPct(r.ctr) },
              ]}
            />
          </section>

          <ChartCard
            title="ROI theo kênh" className="col-6" loading={loading} empty={!budgeted.length}
            sub="Xanh = có lãi, đỏ = lỗ so với ngân sách"
            table={{ columns: [{ key: "channel", label: "Kênh" }, { key: "roi", label: "ROI", align: "r", render: (r: ChannelRow) => fmtSignedPct(r.roi) }], rows: budgeted }}
          >
            <Chart option={roiOption} height={barHeight(budgeted.length, true, 40)} ariaLabel="ROI theo kênh" />
          </ChartCard>
          <ChartCard
            title="Ngân sách và doanh thu" className="col-6" loading={loading} empty={!budgeted.length} legend={[{ label: "Ngân sách", color: p.series[0] }, { label: "Doanh thu", color: p.series[1] }]}
            table={{ columns: [
              { key: "channel", label: "Kênh" },
              { key: "budget", label: "Ngân sách", align: "r", render: (r: ChannelRow) => fmtVnd(r.budget) },
              { key: "revenue", label: "Doanh thu", align: "r", render: (r: ChannelRow) => fmtVnd(r.revenue) },
            ], rows: budgeted }}
          >
            <Chart option={budgetOption} height={barHeight(budgeted.length, true, 44)} ariaLabel="Ngân sách và doanh thu theo kênh" />
          </ChartCard>

          <ChartCard
            title="Chi phí trên mỗi đầu ra (CPA)" className="col-6" loading={loading} empty={!budgeted.length}
            sub="Lead cơ bản → thanh toán → dự thi thực tế (giả định). Kênh không có thanh toán sẽ trống."
            legend={[{ label: "CPA lead", color: p.series[0] }, { label: "CPA thanh toán", color: p.series[1] }, { label: "CPA dự thi (GĐ)", color: p.series[2] }]}
            table={{ columns: [
              { key: "channel", label: "Kênh" },
              { key: "cpa_lead", label: "CPA lead", align: "r", render: (r: ChannelRow) => fmtVnd(r.cpa_lead) },
              { key: "cpa_paid", label: "CPA thanh toán", align: "r", render: (r: ChannelRow) => fmtVnd(r.cpa_paid) },
              { key: "active_candidates_assumed", label: "Dự thi (GĐ)", align: "r", render: (r: ChannelRow) => fmtNum(r.active_candidates_assumed, 0) },
              { key: "cpa_active", label: "CPA dự thi", align: "r", render: (r: ChannelRow) => fmtVnd(r.cpa_active) },
            ], rows: budgeted }}
          >
            <Chart option={cpaOption} height={barHeight(budgeted.length, true, 58)} ariaLabel="CPA theo kênh" />
          </ChartCard>
          <ChartCard
            title="Tỉ lệ chuyển đổi thanh toán" className="col-6" loading={loading} empty={!convRows.length}
            sub="Đã thanh toán / đăng ký web, theo kênh"
            table={{ columns: [{ key: "channel", label: "Kênh" }, { key: "paid", label: "Thanh toán", align: "r" }, { key: "web_registered", label: "Đăng ký", align: "r" }, { key: "conversion", label: "Tỉ lệ", align: "r", render: (r: ChannelRow) => fmtPct(r.conversion) }], rows: convRows }}
          >
            <Chart option={convOption} height={barHeight(convRows.length, true, 34)} ariaLabel="Tỉ lệ chuyển đổi theo kênh" />
          </ChartCard>

          <StatusStackCard
            title="Liên hệ theo kênh" className="col-6" loading={loading}
            rows={channels.map((c) => ({ key: c.channel, count: c.contacts, web_registered: c.web_registered, paid: c.paid, revenue: c.revenue }))}
          />
          <ChartCard
            title="CTR logo / banner" className="col-6" loading={loading} empty={!ctrRows.length}
            sub="Số click và CTR nhập tay từ báo cáo gốc"
            table={{ columns: [{ key: "channel", label: "Kênh" }, { key: "clicks", label: "Click", align: "r", render: (r: ChannelRow) => fmtInt(r.clicks) }, { key: "ctr", label: "CTR", align: "r", render: (r: ChannelRow) => fmtPct(r.ctr) }], rows: ctrRows }}
          >
            <Chart option={ctrOption} height={barHeight(ctrRows.length, true, 34)} ariaLabel="CTR theo kênh" />
          </ChartCard>

          {recon.length > 0 && (
            <>
              <ChartCard
                title="Đối soát: đăng ký theo kênh" className="col-6" loading={loading} legend={compareLegend}
                sub="Báo cáo gốc đếm dòng thô; sau đối soát là người duy nhất đã đăng ký web"
                table={{ columns: [
                  { key: "channel", label: "Kênh" },
                  { key: "orig", label: "Gốc", align: "r", render: (r: ChannelRow) => fmtInt(r.original_report?.registrations) },
                  { key: "web_registered", label: "Sau đối soát", align: "r" },
                  { key: "comment", label: "Nhận xét", render: (r: ChannelRow) => r.original_report?.comment ?? "–" },
                ], rows: recon }}
              >
                <Chart option={reconOption} height={barHeight(recon.length, true, 44)} ariaLabel="Đối soát đăng ký" />
              </ChartCard>
              <ChartCard
                title="Đối soát: doanh thu theo kênh" className="col-6" loading={loading} legend={compareLegend}
                table={{ columns: [
                  { key: "channel", label: "Kênh" },
                  { key: "orig", label: "Gốc", align: "r", render: (r: ChannelRow) => fmtVnd(r.original_report?.revenue) },
                  { key: "revenue", label: "Sau đối soát", align: "r", render: (r: ChannelRow) => fmtVnd(r.revenue) },
                  { key: "roi", label: "ROI gốc → mới", align: "r", render: (r: ChannelRow) => `${fmtSignedPct(r.original_report?.roi)} → ${fmtSignedPct(r.roi)}` },
                ], rows: recon }}
              >
                <Chart option={reconRevOption} height={barHeight(recon.length, true, 44)} ariaLabel="Đối soát doanh thu" />
              </ChartCard>
            </>
          )}
        </div>
      )}
    </>
  );
}
