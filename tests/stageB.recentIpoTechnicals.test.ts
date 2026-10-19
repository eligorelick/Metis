import { describe, expect, it } from "vitest";

import { degradationPlan, metricPolicy, routeCompany } from "@/pipeline/stageB/sectorRouting";
import { computeTechnicals, type OhlcvRow } from "@/pipeline/stageB/technicals";

const ANALYSIS_AT = "2026-10-18T00:00:00Z";
const DAY_MS = 86_400_000;
const route = routeCompany(
  {
    sector: "Technology", industry: "Software", ipoDate: "2025-03-28",
    isAdr: false, isEtf: false, isFund: false, country: "US", currency: "USD",
  },
  { availableQuarters: 6, incomeTtm: null, incomeAnnual: null, cashflowTtm: null, cashflowAnnual: null },
  { today: ANALYSIS_AT.slice(0, 10) },
);

const bar = (date: string, close = 100): OhlcvRow => ({
  date, open: close, high: close + 1, low: close - 1, close, volume: 1_000,
});

/** Deterministic weekday observations; no inferred or filled missing sessions. */
function sessions(count: number): OhlcvRow[] {
  const rows: OhlcvRow[] = [];
  for (let time = Date.parse("2026-10-16T00:00:00Z"); rows.length < count; time -= DAY_MS) {
    const date = new Date(time);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) rows.push(bar(date.toISOString().slice(0, 10)));
  }
  return rows.reverse();
}

function compute(rows: OhlcvRow[], reference = sessions(300)) {
  return computeTechnicals(rows, reference, [], null, { analysisAt: ANALYSIS_AT });
}

describe("recent listings use each technical feature's admitted history", () => {
  it("retains the verified recent-IPO financial restrictions without discarding available technicals", () => {
    expect(route.overlays).toContain("recent-ipo");
    const policy = metricPolicy(route);
    expect(policy.suppress).toEqual(expect.arrayContaining(["cagr5y", "cagr10y", "beta", "seasonality", "beneishM", "piotroskiF"]));
    expect(policy.suppress).not.toContain("sma200");
    expect(policy.suppress).not.toContain("fiftyTwoWeekRange");
  });

  it("admits exactly 200 observations for SMA200 while withholding the shorter-than-year range", () => {
    const technicals = compute(sessions(200));
    expect(technicals.rowsUsed).toBe(200);
    expect(technicals.smaCross.sma200).toBe(100);
    expect(technicals.gaps.some(gap => gap.field === "technicals.sma200")).toBe(false);
    expect(technicals.range52w.high52w).toBeNull();
    expect(technicals.range52w.insufficientHistory).toBe(true);
    expect(metricPolicy(route).suppress).not.toContain("sma200");
  });

  it("withholds SMA200 at 199 observations even across a missing-session hole", () => {
    const rows = sessions(200);
    rows.splice(100, 1);
    const technicals = compute(rows);
    expect(technicals.rowsUsed).toBe(199);
    expect(technicals.smaCross.sma200).toBeNull();
    expect(technicals.gaps.find(gap => gap.field === "technicals.sma200")?.reason).toContain("199 trading rows");
  });

  it("does not count repeated observations toward the 200-session boundary", () => {
    const rows = sessions(199);
    const technicals = compute([...rows, ...rows]);
    expect(technicals.rowsUsed).toBe(199);
    expect(technicals.smaCross.sma200).toBeNull();
  });

  it("excludes a conflicted session rather than choosing a close to reach 200", () => {
    const rows = sessions(200);
    const technicals = compute([...rows, { ...rows[100], close: 101 }]);
    expect(technicals.rowsUsed).toBe(199);
    expect(technicals.smaCross.sma200).toBeNull();
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("does not count invalid close %s toward SMA200", close => {
    const rows = sessions(200);
    rows[100] = { ...rows[100], close };
    expect(compute(rows).smaCross.sma200).toBeNull();
    expect(compute(rows).rowsUsed).toBe(199);
  });

  it("does not let future observations complete the SMA window or move its as-of", () => {
    const technicals = compute([...sessions(199), bar("2026-10-19", 900)]);
    expect(technicals.rowsUsed).toBe(199);
    expect(technicals.asOf).toBe("2026-10-16");
    expect(technicals.smaCross.sma200).toBeNull();
    expect(technicals.notes.join(" ")).toContain("future-dated");
  });

  it("uses the existing split-adjusted close contract without substituting dividend-adjusted closes", () => {
    const rows = sessions(200).map(row => ({ ...row, adjClose: 5 }));
    expect(compute(rows).smaCross.sma200).toBe(100);
  });

  it("keeps a densely observed full-year range available for a recent listing", () => {
    const rows = sessions(300);
    const technicals = compute(rows);
    expect(technicals.smaCross.sma200).toBe(100);
    expect(technicals.range52w.insufficientHistory).toBe(false);
    expect(technicals.range52w.high52w).toBe(101);
    expect(technicals.range52w.low52w).toBe(99);
    expect(metricPolicy(route).suppress).not.toContain("fiftyTwoWeekRange");
  });

  it.each([
    ["2025-10-23", false],
    ["2025-10-24", true],
  ] as const)("honors the existing seven-day year-start tolerance at %s", (firstDate, insufficient) => {
    const technicals = compute(sessions(300).filter(row => row.date >= firstDate));
    expect(technicals.range52w.insufficientHistory).toBe(insufficient);
    expect(technicals.range52w.high52w).toBe(insufficient ? null : 101);
  });

  it("does not use an invalid boundary observation to claim a full year", () => {
    const technicals = compute([{ ...bar("2025-10-16"), high: Number.NaN }, ...sessions(200)]);
    expect(technicals.range52w.insufficientHistory).toBe(true);
    expect(technicals.range52w.high52w).toBeNull();
  });

  it("withholds a purported 52-week range made from only two observed dates", () => {
    const technicals = compute([bar("2025-03-28"), bar("2026-10-16")]);
    expect(technicals.range52w.insufficientHistory).toBe(true);
    expect(technicals.range52w.high52w).toBeNull();
    expect(technicals.range52w.pctFromHigh).toBeNull();
  });

  it("does not let abundant older observations substitute for a missing trailing year", () => {
    const old = sessions(500).filter(row => row.date < "2025-10-16");
    expect(old.length).toBeGreaterThan(200);
    const technicals = compute([...old, bar("2026-10-16")]);
    expect(technicals.range52w.insufficientHistory).toBe(true);
    expect(technicals.range52w.high52w).toBeNull();
  });

  it("withholds an otherwise dense trailing year with a missing multi-month interval", () => {
    const rows = sessions(300).filter(row => row.date < "2026-02-01" || row.date > "2026-05-01");
    const technicals = compute(rows);
    expect(technicals.range52w.insufficientHistory).toBe(true);
    expect(technicals.range52w.high52w).toBeNull();
  });

  it("does not mistake monthly observations spanning a year for daily range coverage", () => {
    const rows = Array.from({ length: 13 }, (_, index) => bar(new Date(Date.UTC(2025, 9 + index, 16)).toISOString().slice(0, 10)));
    const technicals = compute(rows);
    expect(technicals.range52w.insufficientHistory).toBe(true);
    expect(technicals.range52w.high52w).toBeNull();
  });

  it("withholds the range when even one independently observed session is absent", () => {
    const rows = sessions(300);
    const missing = rows.splice(150, 1)[0].date;
    const technicals = compute(rows);
    expect(technicals.range52w.high52w).toBeNull();
    expect(technicals.gaps.find(gap => gap.field === "technicals.range52w")?.reason).toContain(missing);
  });

  it("does not let equally sparse issuer and SPY series attest each other's coverage", () => {
    const rows = sessions(300).filter((_, index) => index % 5 === 0);
    expect(compute(rows, rows).range52w.high52w).toBeNull();
  });

  it("withholds range coverage when the observed SPY reference is unavailable", () => {
    const technicals = compute(sessions(300), []);
    expect(technicals.smaCross.sma200).toBe(100);
    expect(technicals.range52w.high52w).toBeNull();
    expect(technicals.gaps.find(gap => gap.field === "technicals.range52w")?.reason).toContain("reference");
  });

  it.each([199, 200])("requires at least 200 distinct reference observations within the year: %s", count => {
    const year = sessions(300).filter(row => row.date >= "2025-10-16");
    const reference = Array.from({ length: count }, (_, index) => year[Math.round(index * (year.length - 1) / (count - 1))]);
    const technicals = compute(sessions(300), reference);
    expect(technicals.range52w.high52w).toBe(count === 200 ? 101 : null);
  });

  it("rejects a reference with a large interior gap despite more than 200 annual observations", () => {
    const reference = sessions(300).filter(row => row.date < "2026-03-01" || row.date > "2026-03-20");
    expect(reference.filter(row => row.date >= "2025-10-16").length).toBeGreaterThan(200);
    expect(compute(sessions(300), reference).range52w.high52w).toBeNull();
  });

  it.each([
    ["late start", (row: OhlcvRow) => row.date >= "2025-11-01"],
    ["early tail", (row: OhlcvRow) => row.date <= "2026-10-01"],
  ])("rejects an observed reference with an incompatible %s", (_, include) => {
    expect(compute(sessions(300), sessions(300).filter(include)).range52w.high52w).toBeNull();
  });

  it("does not count invalid or duplicate reference observations toward coverage", () => {
    const weekly = sessions(300).filter((_, index) => index % 5 === 0);
    const reference = [...weekly, ...weekly, ...sessions(300).map(row => ({ ...row, close: 0 }))];
    expect(compute(sessions(300), reference).range52w.high52w).toBeNull();
  });

  it("excludes conflicting reference observations rather than assuming that session was observed", () => {
    const year = sessions(300).filter(row => row.date >= "2025-10-16");
    const reference = Array.from({ length: 200 }, (_, index) => year[Math.round(index * (year.length - 1) / 199)]);
    expect(compute(sessions(300), [...reference, { ...reference[100], close: 101 }]).range52w.high52w).toBeNull();
  });

  it("does not use future reference observations to complete the coverage floor", () => {
    const year = sessions(300).filter(row => row.date >= "2025-10-16");
    const reference = Array.from({ length: 199 }, (_, index) => year[Math.round(index * (year.length - 1) / 198)]);
    expect(compute(sessions(300), [...reference, bar("2026-10-19")]).range52w.high52w).toBeNull();
  });

  it("describes feature-specific requirements without claiming available history is missing", () => {
    const plan = degradationPlan(route.base, route.overlays, 6);
    const sma = plan.items.find(item => item.target === "technicals.sma200");
    const range = plan.items.find(item => item.target === "technicals.range52w");
    expect(sma?.action).toBe("annotate");
    expect(sma?.disclosure).toContain("200 admitted");
    expect(range?.action).toBe("annotate");
    expect(range?.disclosure).toContain("12 calendar months");
    expect(plan.items.find(item => item.target === "fundamentals.cagr")?.action).toBe("suppress");
  });
});
