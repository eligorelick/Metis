import { isValidElement, type ReactNode } from "react";
import { ComposedChart, XAxis, YAxis } from "recharts";
import { describe, expect, it } from "vitest";

import {
  ProjectionFanChart,
  projectionAxisLabel,
  projectionTickInterval,
  projectionTickLabel,
  projectionValueTicks,
} from "@/components/charts/ProjectionFanChart";
import type { ProjectionSeries } from "@/report/schema";

// The props sent to Recharts decide the axis labels; inspect them without
// rendering, as tests/charts.missingObservations.test.ts does.
function chartProps(node: ReactNode, type: unknown): Record<string, unknown>[] {
  if (Array.isArray(node)) return node.flatMap((child) => chartProps(child, type));
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [
    ...(node.type === type ? [node.props as Record<string, unknown>] : []),
    ...chartProps(node.props.children, type),
  ];
}

// NVDA report #48's revenue fan (2026-10-26): FY history, then 12M forward periods.
const NVDA_REVENUE = [26.97e9, 60.92e9, 130.5e9, 215.9e9, 412e9, 802e9, 1.31e12, 1.86e12, 2.21e12];

describe("projection fan axes", () => {
  it("shortens period labels to fit one tick each", () => {
    expect(projectionTickLabel("FY2023")).toBe("FY23");
    expect(projectionTickLabel("FY2027 ending 2027-01-31")).toBe("FY27");
    expect(projectionTickLabel("12M ending 2027-07-26")).toBe("Jul ’27");
    expect(projectionTickLabel("12M ending 2030-12-31")).toBe("Dec ’30");
    expect(projectionTickLabel("Y+3 (period basis unavailable)")).toBe("Y+3");
    expect(projectionTickLabel("2026-Q1")).toBe("2026-Q1");
  });

  /**
   * Recharts measures tick text without its font family, so it never hid the
   * colliding monospace labels; at NVDA's two-column width "Jul ’27" and
   * "Jul ’28" overlapped. The interval is set from the labels instead.
   */
  it("thins the time-axis labels to what fits a narrow chart", () => {
    const fy = (year: number) => `FY${year}`;
    const rolling = (year: number) => `12M ending ${year}-07-26`;
    expect(projectionTickInterval([2021, 2022, 2023, 2024, 2025, 2026].map(fy))).toBe(0);
    expect(projectionTickInterval([...[2023, 2024].map(fy), ...[2027, 2028, 2029].map(rolling)])).toBe(0);
    expect(projectionTickInterval([...[2023, 2024, 2025, 2026].map(fy), ...[2027, 2028, 2029, 2030, 2031].map(rolling)])).toBe(1);
    expect(projectionTickInterval([...[2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026].map(fy), ...[2027, 2028, 2029, 2030, 2031].map(rolling)])).toBe(2);
    expect(projectionTickInterval([])).toBe(0);
  });

  it("puts round, distinct, exact ticks on the value axis", () => {
    const ticks = projectionValueTicks(NVDA_REVENUE)!;
    expect(ticks.map((v) => projectionAxisLabel("revenue", v))).toEqual(["0", "500B", "1T", "1.5T", "2T", "2.5T"]);
    expect(ticks[0]).toBeLessThanOrEqual(Math.min(...NVDA_REVENUE));
    expect(ticks.at(-1)).toBeGreaterThanOrEqual(Math.max(...NVDA_REVENUE));

    const fcf = projectionValueTicks([-150e9, 800e9])!;
    expect(fcf.map((v) => projectionAxisLabel("fcf", v))).toEqual(["-250B", "0", "250B", "500B", "750B", "1T"]);
    expect(projectionValueTicks([15, 55, 70])!.map((v) => projectionAxisLabel("operatingMargin", v)))
      .toEqual(["0%", "20%", "40%", "60%", "80%"]);
    expect(projectionValueTicks([0.2, 1.3])!.map((v) => projectionAxisLabel("epsDiluted", v)))
      .toEqual(["0", "0.25", "0.5", "0.75", "1", "1.25", "1.5"]);
    // Nothing to scale: Recharts keeps its own default axis.
    expect(projectionValueTicks([0, 0])).toBeUndefined();
    expect(projectionValueTicks([])).toBeUndefined();
  });

  it("draws history before the forecast and hands Recharts the round ticks", () => {
    const point = (period: string, value: number) => ({
      period,
      value: { value, unit: "USD", currency: "USD" as const, period, source: "computed", asOf: "2026-10-26", verified: true },
    });
    const history = ["FY2023", "FY2024", "FY2025", "FY2026"];
    const forward = ["12M ending 2027-07-26", "12M ending 2028-07-26", "12M ending 2029-07-26", "12M ending 2030-07-26", "12M ending 2031-07-26"];
    const path = forward.map((period, i) => point(period, NVDA_REVENUE[i + 4]!));
    const series = {
      metric: "revenue",
      unit: "USD",
      historical: history.map((period, i) => point(period, NVDA_REVENUE[i]!)),
      bull: path,
      base: path,
      bear: path,
      weighted: path,
      assumptions: [],
      disclosures: [],
    } satisfies ProjectionSeries;
    const chart = ProjectionFanChart({ series });

    const data = chartProps(chart, ComposedChart)[0]!.data as Array<{ period: string }>;
    expect(data.map((row) => row.period)).toEqual([...history, ...forward]);
    const xAxis = chartProps(chart, XAxis)[0]!;
    expect((xAxis.tickFormatter as (v: string) => string)("12M ending 2027-07-26")).toBe("Jul ’27");
    // Every second label: FY23, FY25, Jul ’27, Jul ’29, Jul ’31.
    expect(xAxis.interval).toBe(1);
    const yAxis = chartProps(chart, YAxis)[0]!;
    expect(yAxis.ticks).toEqual([0, 5e11, 1e12, 1.5e12, 2e12, 2.5e12]);
    expect(yAxis.domain).toEqual([0, 2.5e12]);
  });
});
