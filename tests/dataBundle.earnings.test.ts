import { describe, expect, it } from "vitest";

import { deriveNextEarnings } from "@/pipeline/dataBundle";
import type { FetchResult, Sourced } from "@/types/core";
import type { FmpEarningsRow, FmpPayload } from "@/providers/fmp";

function earnings(rows: FmpEarningsRow[]): FetchResult<FmpPayload<FmpEarningsRow>> {
  const value: Sourced<FmpPayload<FmpEarningsRow>> = {
    data: { rows, raw: rows },
    asOf: "2026-07-05",
    source: "fmp",
    endpoint: "fmp://earnings",
    fetchedAt: "2026-07-05T00:00:00.000Z",
  };
  return { ok: true, value };
}

describe("deriveNextEarnings", () => {
  it("preserves expected access restrictions and attempted sources", () => {
    expect(deriveNextEarnings({ ok: false, gap: { field: "fmp.earnings(SCHW)", reason: "subscription unavailable", severity: "warn", expected: true, attemptedSources: ["/stable/earnings?symbol=SCHW"] } }, "2026-10-03", "SCHW"))
      .toMatchObject({ ok: false, gap: { expected: true, attemptedSources: ["/stable/earnings?symbol=SCHW"] } });
  });

  it("ignores malformed dates instead of treating them as future events", () => {
    const result = deriveNextEarnings(
      earnings([
        { date: "not-a-date", epsActual: null },
        { date: "2026-08-01T00:00:00Z", epsActual: null },
      ]),
      "2026-07-06",
      "AAPL",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The malformed row must not be selected — assert the SELECTED ROW, not the
    // envelope's asOf. Since 2026-08-31 `asOf` is the observation date the
    // derivation inherits from its parent envelope; the future event date lives
    // in the datum, so it is the datum that pins the selection.
    expect(result.value.data.date).toBe("2026-08-01T00:00:00Z");
    expect(result.value.asOf).toBe("2026-07-05");
  });

  it("stamps the next earnings date with the day the calendar was observed, not the last reported quarter", () => {
    // D-63: FMP's earnings envelope is dated by its newest reported row (NVDA,
    // fetched 2026-10-15: "2026-08-26"), which printed a past date beside the
    // next earnings date.
    const value: Sourced<FmpPayload<FmpEarningsRow>> = {
      data: { rows: [{ date: "2026-11-18", epsActual: null }, { date: "2026-08-26", epsActual: 2.46 }], raw: [] },
      asOf: "2026-08-26", source: "fmp", endpoint: "fmp://earnings", fetchedAt: "2026-10-15T12:00:00.000Z",
    };
    const result = deriveNextEarnings({ ok: true, value }, "2026-10-15", "NVDA");
    expect(result).toMatchObject({ ok: true, value: { asOf: "2026-10-15", data: { date: "2026-11-18" } } });
  });

  it("does not accept impossible calendar dates", () => {
    const result = deriveNextEarnings(
      earnings([{ date: "9999-02-30", epsActual: null }]),
      "2026-07-06",
      "AAPL",
    );
    expect(result.ok).toBe(false);
  });
  it("skips a today-dated row that has already been reported", () => {
    // Finnhub's JPM calendar on 2026-10-13: the morning's print still sat on
    // today's date with its actuals filled in.
    const result = deriveNextEarnings(
      earnings([
        { date: "2027-01-14", epsActual: null, revenueActual: null },
        { date: "2026-10-13", epsActual: 5.75, revenueActual: 50_172_000_000 },
      ]),
      "2026-10-13",
      "JPM",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.data.date).toBe("2027-01-14");
  });

  it("treats a row with only an actual revenue figure as reported", () => {
    const result = deriveNextEarnings(
      earnings([{ date: "2026-10-13", epsActual: null, revenueActual: 50_172_000_000 }]),
      "2026-10-13",
      "JPM",
    );
    expect(result.ok).toBe(false);
  });
});
