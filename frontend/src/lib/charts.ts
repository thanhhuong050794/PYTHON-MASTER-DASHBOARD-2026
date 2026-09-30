/**
 * Bộ dựng option ECharts theo chuẩn mark spec:
 * cột ≤24px, đầu cột bo 4px (gốc vuông), khe 2px màu nền giữa các đoạn xếp chồng,
 * line 2px, lưới/trục là hairline liền, chữ luôn dùng token chữ (không dùng màu series),
 * tooltip: giá trị đậm đứng trước, tên series phía sau, khoá series là nét ngắn.
 */
import type { EChartsCoreOption } from "echarts/core";
import { escapeHtml, fmtNum } from "./format";
import type { Palette } from "./theme";

export type Fmt = (v: number) => string;
export type Series = { name: string; data: (number | null)[]; color: string };

const AXIS_FONT = 11;
const BAR_MAX = 24;

export function tooltipBase(p: Palette, trigger: "item" | "axis" = "item") {
  return {
    trigger,
    confine: true,
    backgroundColor: p.surface,
    borderColor: p.grid,
    borderWidth: 1,
    padding: [8, 10],
    textStyle: { color: p.text, fontFamily: p.font, fontSize: 12 },
    extraCssText: "box-shadow:0 6px 24px rgba(0,0,0,.16);border-radius:8px;",
    ...(trigger === "axis"
      ? { axisPointer: { type: "line", lineStyle: { color: p.axis, width: 1 }, label: { show: false } } }
      : {}),
  };
}

export function tipHtml(
  p: Palette,
  title: string,
  rows: { color?: string; name: string; value: string; kind?: "line" | "rect" }[],
): string {
  const head = `<div style="color:${p.text2};font-size:11.5px;margin-bottom:4px">${escapeHtml(title)}</div>`;
  const body = rows
    .map((r) => {
      const key = r.color
        ? `<span style="display:inline-block;width:12px;height:${r.kind === "rect" ? 8 : 2}px;border-radius:${r.kind === "rect" ? 2 : 1}px;background:${r.color};margin-right:6px;vertical-align:middle"></span>`
        : "";
      return `<div style="display:flex;align-items:center;gap:8px;justify-content:space-between;min-width:140px">
        <span>${key}<b style="font-weight:650;color:${p.text}">${escapeHtml(r.value)}</b></span>
        <span style="color:${p.text2}">${escapeHtml(r.name)}</span></div>`;
    })
    .join("");
  return head + body;
}

function valueAxis(p: Palette, fmt?: Fmt, extra: object = {}) {
  return {
    type: "value",
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: p.muted, fontSize: AXIS_FONT, formatter: fmt ? (v: number) => fmt(v) : undefined },
    splitLine: { lineStyle: { color: p.grid, width: 1, type: "solid" } },
    ...extra,
  };
}

function categoryAxis(p: Palette, data: string[], extra: object = {}) {
  return {
    type: "category",
    data,
    axisLine: { lineStyle: { color: p.axis, width: 1 } },
    axisTick: { show: false },
    axisLabel: { color: p.text2, fontSize: AXIS_FONT, hideOverlap: true },
    ...extra,
  };
}

export type BarCfg = {
  categories: string[];
  series: Series[];
  horizontal?: boolean;
  stack?: boolean;
  valueFmt?: Fmt;
  axisFmt?: Fmt;
  labels?: boolean;
  /** Màu theo từng cột (chỉ dùng cho thang thứ bậc hoặc phân kỳ, 1 series) */
  pointColors?: string[];
  max?: number;
  labelWidth?: number;
  markLine?: { value: number; label: string };
};

export function barOption(p: Palette, cfg: BarCfg): EChartsCoreOption {
  const { categories, series, horizontal, stack } = cfg;
  const fmt = cfg.valueFmt ?? ((v: number) => fmtNum(v));
  const radiusEnd = horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0];
  const radiusNeg = horizontal ? [4, 0, 0, 4] : [0, 0, 4, 4];

  // Đoạn trên cùng (khác 0) của mỗi cột xếp chồng mới được bo góc
  const topIndex = categories.map((_, ci) => {
    let top = -1;
    series.forEach((s, si) => {
      if ((s.data[ci] ?? 0) !== 0) top = si;
    });
    return top;
  });

  const echSeries = series.map((s, si) => ({
    name: s.name,
    type: "bar",
    stack: stack ? "total" : undefined,
    barMaxWidth: BAR_MAX,
    barGap: "25%",
    barCategoryGap: "35%",
    data: s.data.map((v, ci) => {
      const rounded = !stack || topIndex[ci] === si;
      const neg = (v ?? 0) < 0;
      return {
        value: v,
        itemStyle: {
          color: cfg.pointColors?.[ci] ?? s.color,
          borderRadius: rounded ? (neg ? radiusNeg : radiusEnd) : 0,
          ...(stack ? { borderColor: p.surface, borderWidth: 1 } : {}),
        },
      };
    }),
    label: {
      show: !!cfg.labels && (!stack || si === series.length - 1),
      position: horizontal ? "right" : "top",
      color: p.text2,
      fontSize: 11,
      formatter: (d: { value: number; dataIndex: number }) => {
        if (stack) {
          const total = series.reduce((a, x) => a + (x.data[d.dataIndex] ?? 0), 0);
          return total ? fmt(total) : "";
        }
        return d.value === null || d.value === undefined ? "" : fmt(d.value);
      },
    },
    emphasis: { focus: "none", itemStyle: { opacity: 0.85 } },
    markLine: cfg.markLine && si === 0
      ? {
          silent: true, symbol: "none",
          lineStyle: { color: p.text2, width: 1, type: "solid" },
          label: { formatter: cfg.markLine.label, color: p.text2, fontSize: 11, position: horizontal ? "end" : "insideEndTop" },
          data: [horizontal ? { xAxis: cfg.markLine.value } : { yAxis: cfg.markLine.value }],
        }
      : undefined,
  }));

  const vAxis = valueAxis(p, cfg.axisFmt ?? cfg.valueFmt, cfg.max !== undefined ? { max: cfg.max } : {});
  const cAxis = categoryAxis(p, categories, horizontal ? { inverse: true, axisLabel: { color: p.text2, fontSize: AXIS_FONT, width: cfg.labelWidth ?? 130, overflow: "truncate" } } : {});
  return {
    animationDuration: 300,
    textStyle: { fontFamily: p.font },
    grid: { left: 8, right: cfg.labels && horizontal ? 56 : 16, top: cfg.labels && !horizontal ? 22 : 12, bottom: 4, containLabel: true },
    xAxis: horizontal ? vAxis : cAxis,
    yAxis: horizontal ? cAxis : vAxis,
    tooltip: {
      ...tooltipBase(p, "item"),
      formatter: (d: { dataIndex: number; seriesIndex: number }) => {
        const cat = categories[d.dataIndex];
        const rows = (stack ? series : [series[d.seriesIndex]]).map((s) => ({
          color: cfg.pointColors?.[d.dataIndex] ?? s.color,
          name: s.name,
          value: s.data[d.dataIndex] === null ? "–" : fmt(s.data[d.dataIndex] ?? 0),
          kind: "rect" as const,
        }));
        if (stack && series.length > 1) {
          const total = series.reduce((a, x) => a + (x.data[d.dataIndex] ?? 0), 0);
          rows.push({ color: undefined as unknown as string, name: "Tổng", value: fmt(total), kind: "rect" });
        }
        return tipHtml(p, cat, rows);
      },
    },
    series: echSeries,
  };
}

export function barHeight(n: number, horizontal = true, perRow = 30): number {
  return horizontal ? Math.max(140, n * perRow + 40) : 280;
}

export type LineCfg = { x: string[]; xLabels?: string[]; series: Series[]; valueFmt?: Fmt; area?: boolean; endLabels?: boolean };

export function lineOption(p: Palette, cfg: LineCfg): EChartsCoreOption {
  const fmt = cfg.valueFmt ?? ((v: number) => fmtNum(v));
  return {
    animationDuration: 300,
    textStyle: { fontFamily: p.font },
    grid: { left: 8, right: cfg.endLabels ? 70 : 16, top: 14, bottom: 4, containLabel: true },
    xAxis: categoryAxis(p, cfg.xLabels ?? cfg.x, { boundaryGap: false }),
    yAxis: valueAxis(p, fmt),
    tooltip: {
      ...tooltipBase(p, "axis"),
      formatter: (items: { dataIndex: number; seriesIndex: number }[]) => {
        const i = items[0]?.dataIndex ?? 0;
        return tipHtml(p, (cfg.xLabels ?? cfg.x)[i], cfg.series.map((s) => ({
          color: s.color, name: s.name, value: s.data[i] === null ? "–" : fmt(s.data[i] ?? 0), kind: "line" as const,
        })));
      },
    },
    series: cfg.series.map((s) => ({
      name: s.name,
      type: "line",
      data: s.data,
      showSymbol: false,
      symbol: "circle",
      symbolSize: 8,
      lineStyle: { width: 2, color: s.color, cap: "round", join: "round" },
      itemStyle: { color: s.color, borderColor: p.surface, borderWidth: 2 },
      areaStyle: cfg.area ? { color: s.color, opacity: 0.1 } : undefined,
      emphasis: { focus: "none", scale: false },
      endLabel: cfg.endLabels ? { show: true, color: p.text2, fontSize: 11, formatter: (d: { value: number }) => fmt(d.value) } : undefined,
    })),
  };
}

export function heatmapOption(p: Palette, cfg: { xLabels: string[]; yLabels: string[]; data: [number, number, number][]; valueName: string }): EChartsCoreOption {
  const max = Math.max(1, ...cfg.data.map((d) => d[2]));
  return {
    animationDuration: 300,
    textStyle: { fontFamily: p.font },
    grid: { left: 8, right: 12, top: 8, bottom: 44, containLabel: true },
    xAxis: { ...categoryAxis(p, cfg.xLabels), splitArea: { show: false } },
    yAxis: { ...categoryAxis(p, cfg.yLabels, { axisLine: { show: false } }), inverse: true },
    visualMap: {
      min: 0, max, calculable: false, orient: "horizontal", left: "center", bottom: 0, itemHeight: 140, itemWidth: 10,
      inRange: { color: [p.seqLo, p.seqHi] }, textStyle: { color: p.muted, fontSize: 11 },
      text: [`${max}`, "0"],
    },
    tooltip: {
      ...tooltipBase(p, "item"),
      formatter: (d: { value: [number, number, number] }) =>
        tipHtml(p, `${cfg.yLabels[d.value[1]]}, ${cfg.xLabels[d.value[0]]}`, [{ name: cfg.valueName, value: fmtNum(d.value[2]) }]),
    },
    series: [{
      type: "heatmap",
      data: cfg.data.filter((d) => d[2] > 0),
      itemStyle: { borderColor: p.surface, borderWidth: 2, borderRadius: 3 },
      emphasis: { itemStyle: { borderColor: p.text, borderWidth: 1 } },
    }],
  };
}

export function boxplotOption(p: Palette, cfg: { categories: string[]; boxes: number[][]; counts: number[]; color: string; markLine?: { value: number; label: string } }): EChartsCoreOption {
  return {
    animationDuration: 300,
    textStyle: { fontFamily: p.font },
    grid: { left: 8, right: 24, top: 18, bottom: 4, containLabel: true },
    xAxis: valueAxis(p, (v) => fmtNum(v, 0), { min: 0, max: 1000 }),
    yAxis: categoryAxis(p, cfg.categories, { inverse: true, axisLabel: { color: p.text2, fontSize: AXIS_FONT, width: 200, overflow: "truncate" } }),
    tooltip: {
      ...tooltipBase(p, "item"),
      formatter: (d: { dataIndex: number }) => {
        const b = cfg.boxes[d.dataIndex];
        return tipHtml(p, `${cfg.categories[d.dataIndex]} · ${cfg.counts[d.dataIndex]} thí sinh`, [
          { name: "Cao nhất", value: fmtNum(b[4], 0) },
          { name: "Tứ phân vị trên", value: fmtNum(b[3], 0) },
          { name: "Trung vị", value: fmtNum(b[2], 0) },
          { name: "Tứ phân vị dưới", value: fmtNum(b[1], 0) },
          { name: "Thấp nhất", value: fmtNum(b[0], 0) },
        ]);
      },
    },
    series: [{
      type: "boxplot",
      data: cfg.boxes,
      boxWidth: [8, 16],
      itemStyle: { color: `${cfg.color}33`, borderColor: cfg.color, borderWidth: 1.5 },
      emphasis: { itemStyle: { borderWidth: 2 } },
      markLine: cfg.markLine ? {
        silent: true, symbol: "none", lineStyle: { color: p.text2, width: 1, type: "solid" },
        label: { formatter: cfg.markLine.label, color: p.text2, fontSize: 11, position: "start" },
        data: [{ xAxis: cfg.markLine.value }],
      } : undefined,
    }],
  };
}

export function scatterOption(
  p: Palette,
  cfg: { series: { name: string; color: string; points: { x: number; y: number; label: string }[] }[]; xName: string; yName: string; min?: number },
): EChartsCoreOption {
  return {
    animationDuration: 300,
    textStyle: { fontFamily: p.font },
    grid: { left: 8, right: 20, top: 26, bottom: 24, containLabel: true },
    xAxis: valueAxis(p, (v) => fmtNum(v, 0), {
      name: cfg.xName, nameLocation: "middle", nameGap: 26, nameTextStyle: { color: p.text2, fontSize: 11 }, min: cfg.min, max: 1000,
      axisLine: { show: true, lineStyle: { color: p.axis } },
    }),
    yAxis: valueAxis(p, (v) => fmtNum(v, 0), { name: cfg.yName, nameTextStyle: { color: p.text2, fontSize: 11, align: "left" }, min: cfg.min, max: 1000 }),
    tooltip: {
      ...tooltipBase(p, "item"),
      formatter: (d: { seriesIndex: number; dataIndex: number }) => {
        const s = cfg.series[d.seriesIndex];
        const pt = s.points[d.dataIndex];
        return tipHtml(p, pt.label, [
          { color: s.color, name: cfg.xName, value: fmtNum(pt.x, 0), kind: "rect" },
          { color: s.color, name: cfg.yName, value: fmtNum(pt.y, 0), kind: "rect" },
        ]);
      },
    },
    series: cfg.series.map((s) => ({
      name: s.name,
      type: "scatter",
      symbolSize: 11,
      data: s.points.map((pt) => [pt.x, pt.y]),
      itemStyle: { color: s.color, borderColor: p.surface, borderWidth: 2 },
      emphasis: { scale: 1.3 },
    })),
  };
}
