import { describe, expect, it } from "vitest";
import { forwardAnnualEstimates } from "@/pipeline/forwardEstimates";
import { calendarizeConsensusWindow } from "@/pipeline/stageB/valuation";

describe("canonical forward fiscal estimates", () => {
  const actual = ["2026-09-27", "2025-09-28", "2024-09-29", "2023-09-24"];
  const estimates = [{ date: "2026-09-28", revenueAvg: 900 }, { date: "2027-09-28", revenueAvg: 1200 }, { date: "2028-09-28", revenueAvg: 1400 }];
  it("excludes an already reported annual alias and snaps future periods to an established calendar", () => {
    expect(forwardAnnualEstimates(estimates, actual).map(r => r.date)).toEqual(["2027-09-26", "2028-09-24"]);
    expect(estimates[0].date).toBe("2026-09-28");
  });
  it("recognizes a completed alias without inventing a future calendar from a single year", () => {
    expect(forwardAnnualEstimates(estimates, actual.slice(0, 1)).map(r => r.date)).toEqual(["2027-09-28", "2028-09-28"]);
  });
  it("ignores invalid dates and does not exclude estimates a genuine quarter after the latest annual", () => {
    expect(forwardAnnualEstimates([{ date: "invalid" }, { date: "2026-12-31" }], ["2026-09-27"]).map(r => r.date)).toEqual(["2026-12-31"]);
  });
  it("prevents one stale alias day from entering a complete forecast window", () => {
    const rows = forwardAnnualEstimates(estimates, actual);
    const result = calendarizeConsensusWindow(rows, { startDate: "2026-09-28", endDate: "2027-09-26" }, null, null, { kind: "last-weekday", weekday: 0, month: 9 });
    expect(result.value).toBeCloseTo(1200);
    expect(result.fiscalYears.map(r => r.date)).toEqual(["2027-09-26"]);
  });
});
