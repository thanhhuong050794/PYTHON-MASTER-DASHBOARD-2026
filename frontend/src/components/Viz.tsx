import { useMemo } from "react";
import { barHeight, barOption, heatmapOption, lineOption, type Fmt } from "../lib/charts";
import { fmtInt, fmtPct, fmtVnd, shortDate } from "../lib/format";
import { usePalette } from "../lib/theme";
import type { Breakdown, TimelinePoint } from "../lib/types";
import { Chart } from "./Chart";
import { ChartCard } from "./ChartCard";

const label = (k: string | null | boolean | undefined, fallback = "(Chưa có)") => (k === null || k === undefined || k === "" ? fallback : String(k));

/** Phễu: các giai đoạn có thứ tự → thang ordinal cùng 1 sắc độ. */
export function FunnelCard({ funnel, className = "col-5", loading }: { funnel: { stage: string; value: number }[]; className?: string; loading?: boolean }) {
  const p = usePalette();
  const option = useMemo(() => barOption(p, {
    categories: funnel.map((f) => f.stage),
    series: [{ name: "Số người", data: funnel.map((f) => f.value), color: p.ord[1] }],
    pointColors: [p.ord[3], p.ord[1], p.ord[0]],
    horizontal: true, labels: true, valueFmt: fmtInt, labelWidth: 150,
  }), [p, funnel]);
  const top = funnel[0]?.value || 0;
  const rows = funnel.map((f, i) => ({
    stage: f.stage, value: f.value,
    of_top: top ? f.value / top : null,
    of_prev: i > 0 && funnel[i - 1].value ? f.value / funnel[i - 1].value : null,
  }));
  const conv = rows[rows.length - 1]?.of_prev;
  return (
    <ChartCard
      title="Phễu tuyển sinh" className={className} loading={loading} empty={!top}
      sub={conv !== null && conv !== undefined ? `Tỉ lệ thanh toán / đăng ký web: ${fmtPct(conv)}` : undefined}
      table={{ columns: [
        { key: "stage", label: "Giai đoạn" },
        { key: "value", label: "Số người", align: "r", render: (r) => fmtInt(r.value) },
        { key: "of_prev", label: "% so với bước trước", align: "r", render: (r) => fmtPct(r.of_prev) },
        { key: "of_top", label: "% so với liên hệ", align: "r", render: (r) => fmtPct(r.of_top) },
      ], rows }}
    >
      <Chart option={option} height={barHeight(3, true, 44)} ariaLabel="Phễu tuyển sinh" />
    </ChartCard>
  );
}

export function TimelineCard({ timeline, undated, className = "col-7", loading }: {
  timeline: TimelinePoint[]; undated?: { contacts: number; registrations: number; paid: number }; className?: string; loading?: boolean;
}) {
  const p = usePalette();
  const option = useMemo(() => lineOption(p, {
    x: timeline.map((t) => t.date),
    xLabels: timeline.map((t) => shortDate(t.date)),
    series: [
      { name: "Liên hệ (luỹ kế)", data: timeline.map((t) => t.cum_contacts), color: p.series[0] },
      { name: "Đăng ký web (luỹ kế)", data: timeline.map((t) => t.cum_registrations), color: p.series[1] },
      { name: "Đã thanh toán (luỹ kế)", data: timeline.map((t) => t.cum_paid), color: p.series[2] },
    ],
    valueFmt: fmtInt, endLabels: true,
  }), [p, timeline]);
  return (
    <ChartCard
      title="Tăng trưởng theo thời gian" className={className} loading={loading} empty={!timeline.length}
      sub={<>Luỹ kế theo ngày tiếp xúc đầu tiên / ngày đăng ký web.{undated && (undated.contacts || undated.registrations) ? ` Dữ liệu gốc thiếu ngày của ${undated.contacts} liên hệ, ${undated.registrations} lượt đăng ký (${undated.paid} đã thanh toán) nên không nằm trên trục thời gian.` : ""}</>}
      legend={[
        { label: "Liên hệ", color: p.series[0], kind: "line" },
        { label: "Đăng ký web", color: p.series[1], kind: "line" },
        { label: "Đã thanh toán", color: p.series[2], kind: "line" },
      ]}
      table={{ columns: [
        { key: "date", label: "Ngày", render: (r) => shortDate(r.date) },
        { key: "new_contacts", label: "Liên hệ mới", align: "r" },
        { key: "registrations", label: "Đăng ký web", align: "r" },
        { key: "paid", label: "Thanh toán", align: "r" },
        { key: "cum_contacts", label: "Luỹ kế liên hệ", align: "r" },
        { key: "cum_registrations", label: "Luỹ kế đăng ký", align: "r" },
        { key: "cum_paid", label: "Luỹ kế thanh toán", align: "r" },
      ], rows: timeline.filter((t) => t.new_contacts || t.registrations) }}
    >
      <Chart option={option} height={300} ariaLabel="Luỹ kế liên hệ, đăng ký và thanh toán theo ngày" />
    </ChartCard>
  );
}

/** Mỗi nhóm tách thành: đã thanh toán / đăng ký chưa thanh toán / chỉ là lead (xếp chồng). */
export function StatusStackCard({ title, sub, rows, className = "col-6", loading, sortByCount = true, labelFallback }: {
  title: string; sub?: string; rows: Breakdown[]; className?: string; loading?: boolean; sortByCount?: boolean; labelFallback?: string;
}) {
  const p = usePalette();
  const data = useMemo(() => (sortByCount ? [...rows].sort((a, b) => b.count - a.count) : rows), [rows, sortByCount]);
  const option = useMemo(() => barOption(p, {
    categories: data.map((r) => label(r.key, labelFallback)),
    series: [
      { name: "Đã thanh toán", data: data.map((r) => r.paid), color: p.ord[0] },
      { name: "Đăng ký, chưa thanh toán", data: data.map((r) => r.web_registered - r.paid), color: p.ord[1] },
      { name: "Lead chưa đăng ký", data: data.map((r) => r.count - r.web_registered), color: p.ord[3] },
    ],
    horizontal: true, stack: true, labels: true, valueFmt: fmtInt, labelWidth: 150,
  }), [p, data, labelFallback]);
  return (
    <ChartCard
      title={title} sub={sub} className={className} loading={loading} empty={!data.length}
      legend={[
        { label: "Đã thanh toán", color: p.ord[0] },
        { label: "Đăng ký, chưa thanh toán", color: p.ord[1] },
        { label: "Lead chưa đăng ký", color: p.ord[3] },
      ]}
      table={{ columns: [
        { key: "key", label: "Nhóm", render: (r) => label(r.key, labelFallback) },
        { key: "count", label: "Liên hệ", align: "r" },
        { key: "web_registered", label: "Đăng ký web", align: "r" },
        { key: "paid", label: "Đã thanh toán", align: "r" },
        { key: "rate", label: "TT / ĐK", align: "r", render: (r) => fmtPct(r.web_registered ? r.paid / r.web_registered : null) },
        { key: "revenue", label: "Doanh thu", align: "r", render: (r) => fmtVnd(r.revenue) },
      ], rows: data }}
    >
      <Chart option={option} height={barHeight(data.length)} ariaLabel={title} />
    </ChartCard>
  );
}

/** Cột ngang 1 series (1 màu) — so sánh độ lớn giữa các nhóm danh nghĩa. */
export function SimpleBarCard<T extends { key: string | null | boolean; count: number }>({
  title, sub, rows, value = (r) => r.count, fmt = fmtInt, className = "col-6", loading, valueLabel = "Số lượng", keyLabel = "Nhóm", fallback, color, extraCols = [],
}: {
  title: string; sub?: string; rows: T[]; value?: (r: T) => number | null; fmt?: Fmt; className?: string; loading?: boolean;
  valueLabel?: string; keyLabel?: string; fallback?: string; color?: string;
  extraCols?: { key: string; label: string; align?: "r"; render?: (r: T) => React.ReactNode }[];
}) {
  const p = usePalette();
  const option = useMemo(() => barOption(p, {
    categories: rows.map((r) => label(r.key as string, fallback)),
    series: [{ name: valueLabel, data: rows.map(value), color: color ?? p.series[0] }],
    horizontal: true, labels: true, valueFmt: fmt, labelWidth: 170,
  }), [p, rows, value, fmt, valueLabel, fallback, color]);
  return (
    <ChartCard
      title={title} sub={sub} className={className} loading={loading} empty={!rows.length}
      table={{ columns: [
        { key: "key", label: keyLabel, render: (r: T) => label(r.key as string, fallback) },
        { key: "value", label: valueLabel, align: "r", render: (r: T) => { const v = value(r); return v === null ? "–" : fmt(v); } },
        ...extraCols,
      ], rows }}
    >
      <Chart option={option} height={barHeight(rows.length)} ariaLabel={title} />
    </ChartCard>
  );
}

const DOW = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

export function HeatmapCard({ cells, className = "col-12", loading }: { cells: { dow: number; hour: number; count: number }[]; className?: string; loading?: boolean }) {
  const p = usePalette();
  const hours = Array.from({ length: 24 }, (_, h) => `${h}h`);
  const option = useMemo(() => heatmapOption(p, {
    xLabels: hours, yLabels: DOW, valueName: "Lượt đăng ký",
    data: cells.map((c) => [c.hour, c.dow - 1, c.count] as [number, number, number]),
  }), [p, cells]); // eslint-disable-line react-hooks/exhaustive-deps
  const peak = cells.reduce((a, c) => (c.count > (a?.count ?? 0) ? c : a), null as null | (typeof cells)[number]);
  return (
    <ChartCard
      title="Thời điểm đăng ký trên website" className={className} loading={loading} empty={!cells.length}
      sub={peak ? `Cao điểm: ${DOW[peak.dow - 1]} lúc ${peak.hour}h (${peak.count} lượt) — gợi ý khung giờ gọi/nhắn chốt thanh toán` : undefined}
      table={{ columns: [
        { key: "dow", label: "Thứ", render: (r) => DOW[r.dow - 1] },
        { key: "hour", label: "Giờ", align: "r", render: (r) => `${r.hour}h` },
        { key: "count", label: "Lượt đăng ký", align: "r" },
      ], rows: [...cells].sort((a, b) => a.dow - b.dow || a.hour - b.hour) }}
    >
      <Chart option={option} height={300} ariaLabel="Bản đồ nhiệt đăng ký theo thứ và giờ" />
    </ChartCard>
  );
}

