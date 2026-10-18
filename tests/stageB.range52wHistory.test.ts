import { describe, expect, it } from "vitest";

import { maxDrawdown, range52w } from "@/pipeline/stageB/technicals";
import { metricPolicy } from "@/pipeline/stageB/sectorRouting";

/**
 * `range52w` filtered to the trailing 12 months but never checked that 12
 * months of history EXIST, so a stock with three months of trading reported a
 * three-month high/low labelled "52-week". `pctFromHigh` feeds the
 * 0.35-weight high-proximity signal, so the false window could be scored.
 *
 * The original date-span guard mirrored maxDrawdown, but an old first bar
 * cannot establish coverage of the actual trailing year. The range now also
 * requires coverage of an independently eligible observed-session reference.
 *
 * Recent-IPO routing must preserve this feature-specific history guard rather
 * than suppress a valid range solely because the listing is under 24 months old.
 */
const bar = (date: string, price: number) => ({
  date,
  open: price,
  high: price + 1,
  low: price - 1,
  close: price,
  volume: 1_000,
});

/** Daily-ish bars spanning `months` back from 2026-06-30. */
function history(months: number, step = 5) {
  const rows = [];
  const end = Date.parse("2026-06-30T00:00:00Z");
  for (let d = months * 30; d >= 0; d -= step) {
    const iso = new Date(end - d * 86_400_000).toISOString().slice(0, 10);
    rows.push(bar(iso, 100 + (d % 17)));
  }
  return rows;
}

describe("range52w requires a full year of history", () => {
  it("reports the range when history spans more than 12 months", () => {
    // The range requires dense admitted observations plus an eligible
    // independent observed-session reference, not the old five-day sample.
    const rows = history(18, 1);
    const r = range52w(rows, rows.map(row => bar(row.date, 50)));

    expect(r.insufficientHistory).toBe(false);
    expect(r.high52w).not.toBeNull();
    expect(r.low52w).not.toBeNull();
    expect(r.positionPct).not.toBeNull();
  });

  it("does NOT present a three-month range as a 52-week range", () => {
    const r = range52w(history(3));

    expect(r.insufficientHistory).toBe(true);
    expect(r.high52w).toBeNull();
    expect(r.low52w).toBeNull();
    // The graded signal must not band a window shorter than its own label.
    expect(r.positionPct).toBeNull();
    // The observation date is still reported.
    expect(r.asOf).not.toBeNull();
  });

  it("tolerates a first bar a few days inside the boundary (weekends/holidays)", () => {
    const rows = history(12, 1);
    const r = range52w(rows, rows.map(row => bar(row.date, 50)));

    expect(r.insufficientHistory).toBe(false);
  });

  it("returns the empty shape for no rows", () => {
    const r = range52w([]);

    expect(r.insufficientHistory).toBe(false);
    expect(r.high52w).toBeNull();
  });
});

describe("the recent-ipo route defers to the 52-week history guard", () => {
  it("does not suppress a range independently of its actual history", () => {
    const recentIpo = metricPolicy({
      base: "general",
      overlays: ["recent-ipo"],
      evidence: { sector: "Technology", industry: "Software" },
    });

    expect(recentIpo.suppress).not.toContain("fiftyTwoWeekRange");
    // A seasoned issuer is still scored on its 52-week position.
    expect(metricPolicy("general").suppress).not.toContain("fiftyTwoWeekRange");
  });
});

/**
 * `maxDrawdown`'s insufficient-history guard compared rows[0].date to an exact
 * cutoff with no tolerance. The EOD price fetch window is exactly 5 years, so
 * the first available bar can never precede a 5-year cutoff and the 5y guard
 * was structurally ALWAYS true — every report emitted a false
 * `technicals.drawdown.5y` gap, which is noise that trains the reader to
 * ignore real ones.
 */
describe("maxDrawdown's history guard tolerates the exact fetch window", () => {
  it("does not flag insufficient history for a full 5-year window", () => {
    // Exactly five years with dense observations, as a complete EOD fetch
    // supplies. The old every-fifth-day sample cannot attest full coverage.
    const rows = [];
    const end = Date.parse("2026-06-30T00:00:00Z");
    for (let d = Math.round(5 * 365.25); d >= 0; d--) {
      const iso = new Date(end - d * 86_400_000).toISOString().slice(0, 10);
      rows.push({ date: iso, open: 100, high: 101, low: 99, close: 100, volume: 1000 });
    }

    expect(maxDrawdown(rows, 5).insufficientHistory).toBe(false);
  });

  it("still flags a genuinely short window", () => {
    const rows = [];
    const end = Date.parse("2026-06-30T00:00:00Z");
    for (let d = 400; d >= 0; d -= 5) {
      const iso = new Date(end - d * 86_400_000).toISOString().slice(0, 10);
      rows.push({ date: iso, open: 100, high: 101, low: 99, close: 100, volume: 1000 });
    }

    expect(maxDrawdown(rows, 5).insufficientHistory).toBe(true);
  });
});
