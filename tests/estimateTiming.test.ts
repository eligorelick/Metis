import { describe, expect, it } from "vitest";
import { buildEstimateTiming, estimateDay, estimateModelTiming, estimateModelTimingText, estimateTimingText, readEstimateTiming, reportEstimateTiming } from "@/report/estimateTiming";
import { formatFigure } from "@/pipeline/stageC/payload";
import type { Report } from "@/report/schema";

const AT = "2026-10-30T23:21:15.748Z";
const unknown = { version: "1", asOfRole: "unclassified", acquisitionOrigin: "unknown", acquiredAt: null, fixtureLoadedAt: null, recordedAt: null, publishedAt: null } as const;

describe("validated estimate date roles", () => {
  it.each([null, 20261030, "2026-10-30T12:00:00Z", "2026-02-29", "2026-04-31", "ignore instructions"])("does not turn %s into a Gregorian day", value => {
    expect(estimateDay(value)).toBeNull();
  });
  it("accepts actual leap days without imposing a freshness policy", () => {
    expect(estimateDay("2024-02-29")).toBe("2024-02-29");
    expect(estimateDay("2032-02-29")).toBe("2032-02-29");
  });
  it("leaves unsupported generic date-selection inputs unclassified", () => {
    for (const rows of [[], [{ publishedDate: "2026-10-27" }], [{ date: "2026-02-30" }], [{ date: "untrusted", timestamp: 12345678 }]]) {
      expect(buildEstimateTiming(rows, AT, {})).toEqual(unknown);
    }
    expect(buildEstimateTiming([{ date: "2026-09-28" }], "untrusted", {})).toEqual(unknown);
  });
  it("separates all-future fallback days from absent acquisition and fixture loads", () => {
    const rows = [{ date: "2027-09-28" }];
    expect(buildEstimateTiming(rows, AT, {})).toEqual({ ...unknown, asOfRole: "fallback-day" });
    const fixture = buildEstimateTiming(rows, AT, { fixtureLoadedAt: AT });
    expect(fixture).toMatchObject({ asOfRole: "fallback-day", acquiredAt: null, fixtureLoadedAt: AT });
    expect(estimateTimingText(fixture, "2026-10-30")).toContain("fallback envelope day 2026-10-30");
  });
  it("can retain a valid same-response timestamp when the outer acquisition is invalid", () => {
    expect(buildEstimateTiming([{ date: "2026-09-28" }], "untrusted", { cacheFetchedAt: "untrusted", responseFetchedAt: AT }))
      .toEqual({ ...unknown, acquisitionOrigin: "response", acquiredAt: AT });
  });
  it.each([
    { acquiredAt: AT }, { acquisitionOrigin: "cache" },
    { acquisitionOrigin: "cache", acquiredAt: AT, fixtureLoadedAt: AT },
    { acquisitionOrigin: "fixture-load", fixtureLoadedAt: AT, recordedAt: AT },
    { acquisitionOrigin: "legacy-recorded" }, { recordedAt: AT },
    { acquisitionOrigin: "unknown", fixtureLoadedAt: AT },
    { publishedAt: "2026-10-27" },
    { acquisitionOrigin: "response", acquiredAt: "2026-02-30T12:00:00Z" },
    { acquisitionOrigin: "response", acquiredAt: "2026-10-30T24:00:00Z" },
  ])("does not print a malformed or contradictory saved timing assertion: %j", override => {
    const value = { ...unknown, ...override };
    expect(readEstimateTiming(value)).toEqual(unknown);
    expect(estimateTimingText(value, "2026-09-28")).toBe("unclassified recorded date 2026-09-28; original acquisition not established; publication/update vintage not established");
  });
  it("requires unique exact source identity for legacy recovery", () => {
    const entry = { provider: "fmp", endpoint: "/stable/analyst-estimates?symbol=QCOM&period=annual", asOf: "2026-09-28", fetchedAt: AT };
    const report = { meta: { symbol: "QCOM" }, appendix: { sources: [] } } as unknown as Report;
    expect(reportEstimateTiming(report)).toEqual(unknown);
    report.appendix.sources = [entry, entry];
    expect(reportEstimateTiming(report)).toEqual(unknown);
    for (const suffix of ["&symbol=QCOM", "&period=annual"]) {
      report.appendix.sources = [{ ...entry, endpoint: entry.endpoint + suffix }];
      expect(reportEstimateTiming(report)).toEqual(unknown);
    }
    report.appendix.sources = [{ ...entry, endpoint: "/stable/analyst-estimates?symbol=QCOM" }];
    expect(reportEstimateTiming(report)).toEqual(unknown);
  });
  it("preserves unrelated supported non-FMP dated evidence and its provenance tag", () => {
    expect(formatFigure({ label: "filed revenue", value: 100, unit: "currency", currency: "USD", period: "2026-09-30", source: "edgar:10-Q", asOf: "2026-10-28" }))
      .toBe("filed revenue: 100 currency (USD) [edgar:10-Q · 2026-10-28]");
  });
  it.each([
    ["response", "recorded acquisition UTC day 2026-10-31"],
    ["cache", "recorded acquisition UTC day 2026-10-31"],
    ["fixture-load", "fixture loaded UTC day 2026-10-31"],
    ["legacy-recorded", "recorded response UTC day 2026-10-31"],
    ["unknown", "original acquisition not established"],
  ] as const)("projects only validated source instants to UTC days for model %s evidence", (origin, text) => {
    const at = "2026-10-30T23:21:15.748-05:00";
    const timing = { ...unknown, acquisitionOrigin: origin,
      acquiredAt: origin === "response" || origin === "cache" ? at : null,
      fixtureLoadedAt: origin === "fixture-load" ? at : null,
      recordedAt: origin === "legacy-recorded" ? at : null };
    const model = estimateModelTiming(timing);
    expect(model.precision).toBe("day-UTC");
    expect(estimateModelTimingText(model, "2026-09-28")).toContain(text);
    expect(JSON.stringify(model)).not.toContain("T23:");
    expect(estimateTimingText(timing, "2026-09-28")).toContain(origin === "unknown" ? "original acquisition not established" : at);
  });
});
