import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Chart } from "../components/Chart";
import { ChartCard, Note, StatTile } from "../components/ChartCard";
import { FilterBar } from "../components/FilterBar";
import { FunnelCard, StatusStackCard, TimelineCard } from "../components/Viz";
import { qs } from "../lib/api";
import { barHeight, barOption } from "../lib/charts";
import { fmtInt, fmtNum, fmtPct, fmtSignedPct, fmtVnd, fmtVndCompact } from "../lib/format";
import { useApi, useScope, useUrlFilters } from "../lib/hooks";
import { entityColor, usePalette } from "../lib/theme";
import type { Breakdown, ChannelRow, ContactSummary, MarketingSummary, Options } from "../lib/types";
import { contactFilterDefs } from "./Contacts";

type OverviewData = {
  modules: string[];
  viewing_partner: string | null;
  crm?: Pick<ContactSummary, "kpi" | "funnel" | "timeline" | "by_segment" | "by_region" | "by_board" | "by_channel" | "by_payment">;
  marketing?: Pick<MarketingSummary, "kpi" | "channels">;
  exams?: { kpi: { count: number; avg: number | null; max: number | null; finalists: number; certificates: number; cert_rate: number | null }; grades: { board: string; grade: string; count: number }[] };
  sponsorship?: { benefits: { item: string; progress: number; status: string }[]; avg_progress: number | null; total_reach: number; total_engagement: number };
  pipeline?: { raw_counts: Record<string, number>; total_raw: number; unique_contacts: number; merged_records: number; duplicate_rate: number };
};

const GRADES = ["Giỏi", "Khá", "Trung bình", "Yếu"];

export default function Overview() {
  const p = usePalette();
  const { partner } = useScope();
  const { values, set, clear } = useUrlFilters(["date_from", "date_to", "board", "region"]);
  const { data: opts } = useApi<Options>(`/meta/options${qs({ partner })}`);
  const { data, loading, error } = useApi<OverviewData>(`/overview${qs({ ...values, partner })}`);

  const channelOption = useMemo(() => {
    const rows = (data?.marketing?.channels ?? []).filter((c) => c.budget_visible);
    return barOption(p, {
      categories: rows.map((c) => c.channel),
      series: [
        { name: "Ngân sách", data: rows.map((c) => c.budget), color: p.series[0] },
        { name: "Doanh thu", data: rows.map((c) => c.revenue), color: p.series[1] },
      ],
      horizontal: true, valueFmt: fmtVndCompact, labelWidth: 120,
    });
  }, [p, data]);

  const gradeOption = useMemo(() => {
    const g = data?.exams?.grades ?? [];
    const boards = [...new Set(g.map((x) => x.board))].sort();
    return barOption(p, {
      categories: GRADES,
      series: boards.map((b) => ({ name: b, data: GRADES.map((gr) => g.find((x) => x.board === b && x.grade === gr)?.count ?? 0), color: entityColor(p, "board", b) })),
      valueFmt: fmtInt, labels: true,
    });
  }, [p, data]);

  const crm = data?.crm;
  const mk = data?.marketing;
  const ex = data?.exams;
  const sp = data?.sponsorship;
  const visibleChannels = (mk?.channels ?? []).filter((c) => c.budget_visible);

  return (
    <>
      <FilterBar defs={contactFilterDefs(opts?.contacts, false)} values={values} set={set} clear={clear} />
      {error && <Note warn>{error}</Note>}
      {data?.viewing_partner && <Note>Đang xem theo phạm vi đối tác <b>{data.viewing_partner}</b> — hiển thị đúng những gì tài khoản đối tác này nhìn thấy.</Note>}

      {crm && (
        <>
          <div className={`kpis${loading ? " loading-dim" : ""}`}>
            <StatTile hero label="Doanh thu lệ phí ghi nhận" value={fmtVndCompact(crm.kpi.revenue)} hint={`${fmtVnd(crm.kpi.revenue)} · ${fmtInt(crm.kpi.paid)} thí sinh đã thanh toán`} />
            <StatTile label="Liên hệ duy nhất" value={fmtInt(crm.kpi.total)} />
            <StatTile label="Đăng ký trên website" value={fmtInt(crm.kpi.web_registered)} />
            <StatTile label="Tỉ lệ thanh toán / đăng ký" value={fmtPct(crm.kpi.paid_rate)} />
            <StatTile label="Doanh thu tiềm năng" value={fmtVndCompact(crm.kpi.potential_revenue)} hint={`${fmtInt(crm.kpi.unpaid_registered)} người chưa thanh toán`} />
            {mk?.kpi.budget !== null && mk?.kpi.budget !== undefined && (
              <StatTile label={mk.kpi.roi_program !== null ? "ROI toàn chương trình" : "ROI kênh được giao"} value={fmtSignedPct(mk.kpi.roi_program ?? mk.kpi.roi_paid_channels)} hint={`Ngân sách ${fmtVndCompact(mk.kpi.budget)}`} />
            )}
          </div>
          <div className="grid">
            <FunnelCard funnel={crm.funnel} loading={loading} />
            <TimelineCard timeline={crm.timeline} undated={{ contacts: crm.kpi.undated_contacts, registrations: crm.kpi.undated_registrations, paid: crm.kpi.undated_paid }} loading={loading} />
            <StatusStackCard title="Segment CRM" rows={crm.by_segment.map((r: Breakdown) => ({ ...r, key: `${r.key} · ${r.name}` }))} sortByCount={false} loading={loading} />
            <StatusStackCard title="Kênh thu hút (attribution)" rows={crm.by_channel} loading={loading} />
          </div>
        </>
      )}

      {mk && visibleChannels.length > 0 && (
        <div className="grid">
          <ChartCard
            title="Ngân sách và doanh thu theo kênh" className="col-12" loading={loading}
            sub={<>So sánh chi tiêu với lệ phí thu về. <Link to="/kenh-roi">Xem phân tích ROI, CPA →</Link></>}
            legend={[{ label: "Ngân sách", color: p.series[0] }, { label: "Doanh thu", color: p.series[1] }]}
            table={{ columns: [
              { key: "channel", label: "Kênh" },
              { key: "budget", label: "Ngân sách", align: "r", render: (r: ChannelRow) => fmtVnd(r.budget) },
              { key: "revenue", label: "Doanh thu", align: "r", render: (r: ChannelRow) => fmtVnd(r.revenue) },
              { key: "roi", label: "ROI", align: "r", render: (r: ChannelRow) => fmtSignedPct(r.roi) },
            ], rows: visibleChannels }}
          >
            <Chart option={channelOption} height={barHeight(visibleChannels.length, true, 44)} ariaLabel="Ngân sách và doanh thu theo kênh" />
          </ChartCard>
        </div>
      )}

      {ex && (
        <>
          <div className="section-title">Kết quả thi (dữ liệu giả lập · bộ 119 thí sinh)</div>
          <div className={`kpis${loading ? " loading-dim" : ""}`}>
            {!crm && <StatTile hero label="Thí sinh có điểm Vòng loại" value={fmtInt(ex.kpi.count)} hint="Bảng A + Bảng B" />}
            {crm && <StatTile label="Thí sinh có điểm" value={fmtInt(ex.kpi.count)} />}
            <StatTile label="Điểm TB Vòng loại" value={fmtNum(ex.kpi.avg, 0)} hint="thang 1.000" />
            <StatTile label="Điểm cao nhất" value={fmtNum(ex.kpi.max, 0)} />
            <StatTile label="Vào chung kết" value={fmtInt(ex.kpi.finalists)} hint="Top 10% mỗi bảng" />
            <StatTile label="Đạt chứng chỉ COS Pro" value={fmtInt(ex.kpi.certificates)} hint={`${fmtPct(ex.kpi.cert_rate)} thí sinh (≥ 600 điểm)`} />
          </div>
          <div className="grid">
            <ChartCard
              title="Xếp loại Vòng loại theo bảng" className="col-12" loading={loading} empty={!ex.grades.length}
              sub={<>Giỏi ≥ 800 · Khá ≥ 600 · Trung bình ≥ 400 · Yếu &lt; 400. <Link to="/diem-thi">Xem chi tiết điểm thi →</Link></>}
              legend={[...new Set(ex.grades.map((g) => g.board))].sort().map((b) => ({ label: b, color: entityColor(p, "board", b) }))}
              table={{ columns: [{ key: "board", label: "Bảng" }, { key: "grade", label: "Xếp loại" }, { key: "count", label: "Thí sinh", align: "r" }], rows: ex.grades }}
            >
              <Chart option={gradeOption} height={260} ariaLabel="Xếp loại vòng loại theo bảng" />
            </ChartCard>
          </div>
        </>
      )}

      {sp && (
        <>
          <div className="section-title">Nhà tài trợ & truyền thông</div>
          <div className="kpis">
            <StatTile label="Tiến độ quyền lợi nhà tài trợ" value={fmtPct(sp.avg_progress, 0)} hint={`${sp.benefits.filter((b) => b.progress >= 1).length}/${sp.benefits.length} hạng mục hoàn thành`} />
            <StatTile label="Tổng lượt tiếp cận" value={fmtInt(sp.total_reach)} hint="5 kênh truyền thông" />
            <StatTile label="Tổng lượt tương tác" value={fmtInt(sp.total_engagement)} hint={<Link to="/tai-tro">Xem chi tiết →</Link>} />
          </div>
        </>
      )}

      {data?.pipeline && (
        <>
          <div className="section-title">Dữ liệu thô → dữ liệu sạch</div>
          <div className="kpis">
            <StatTile label="Dòng thô (3 nguồn)" value={fmtInt(data.pipeline.total_raw)} hint={`Website ${data.pipeline.raw_counts.raw_web_signups} · Talkshow ${data.pipeline.raw_counts.raw_talkshow} · FB ${data.pipeline.raw_counts.raw_fb_leads}`} />
            <StatTile label="Liên hệ duy nhất" value={fmtInt(data.pipeline.unique_contacts)} />
            <StatTile label="Bản ghi bị gộp" value={fmtInt(data.pipeline.merged_records)} hint={`Tỉ lệ trùng ${fmtPct(data.pipeline.duplicate_rate)}`} />
          </div>
        </>
      )}
    </>
  );
}
