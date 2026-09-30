import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, BoxplotChart, HeatmapChart, LineChart, ScatterChart } from "echarts/charts";
import { GridComponent, MarkLineComponent, TooltipComponent, VisualMapComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";

echarts.use([BarChart, LineChart, HeatmapChart, BoxplotChart, ScatterChart, GridComponent, TooltipComponent, VisualMapComponent, MarkLineComponent, SVGRenderer]);

export function Chart({ option, height = 280, ariaLabel }: { option: EChartsCoreOption; height?: number; ariaLabel: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inst = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    inst.current = echarts.init(ref.current, undefined, { renderer: "svg" });
    const ro = new ResizeObserver(() => inst.current?.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      inst.current?.dispose();
      inst.current = null;
    };
  }, []);

  useEffect(() => {
    inst.current?.setOption(option, { notMerge: true });
  }, [option]);

  useEffect(() => {
    inst.current?.resize();
  }, [height]);

  return <div ref={ref} className="chart-box" style={{ height }} role="img" aria-label={ariaLabel} />;
}
