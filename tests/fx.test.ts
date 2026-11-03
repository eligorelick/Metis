import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fetchValuationFx, selectValuationFx, FX_SERIES } from "@/pipeline/fx";
import { series } from "@/providers/fred";

describe("dated H.10 valuation FX", () => {
  it("fetches and parses the needed untransformed series through the FRED client", async () => {
    let request = "";
    const result = await fetchValuationFx("TWD", "USD", "2026-11-02", (id, options) => series(id, options, {
      fetchImpl: async input => { request = String(input); return new Response(readFileSync("fixtures/fx/DEXTAUS.csv", "utf8")); },
      minRequestIntervalMs: 0, retryDelaysMs: [],
    }));
    expect(request).toContain("id=DEXTAUS");
    expect(result?.ok).toBe(true);
    if (!result?.ok) return;
    expect(selectValuationFx("TWD", "USD", "2026-11-02", result).rate?.observation).toEqual({ date: "2026-10-30", value: 32.59 });
  });
  it("uses the latest observation on/before the quote day, independent of input order", () => {
    const data = fx("DEXTAUS", [{ date: "2026-10-30", value: 32.59 }, { date: "2026-11-03", value: 99 }, { date: "2026-10-29", value: 32.53 }]);
    const selected = selectValuationFx("TWD", "USD", "2026-11-02", data);
    expect(selected.rate?.usdPerReportingUnit).toBeCloseTo(1 / 32.59, 12);
    expect(selected.rate?.series).toBe("DEXTAUS");
    expect(selected.rate?.observation.date).toBe("2026-10-30");
  });
  it("inverts local-per-USD series and keeps USD-per-local EUR/GBP directional", () => {
    expect(selectValuationFx("EUR", "USD", "2026-11-02", fx("DEXUSEU", [{ date: "2026-10-30", value: 1.1163 }])).rate?.usdPerReportingUnit).toBe(1.1163);
    expect(FX_SERIES.GBP).toEqual({ series: "DEXUSUK", units: "USD-per-local" });
  });
  it.each([
    ["TWD", "USD", "2026-11-07", "DEXTAUS", [{ date: "2026-10-30", value: 32.59 }], /stale/],
    ["TWD", "USD", "2026-11-02", "DEXTAUS", [{ date: "2026-11-03", value: 32.59 }], /on or before/],
    ["TWD", "USD", "2026-11-02", "DEXUSEU", [{ date: "2026-10-30", value: 32.59 }], /series/],
    ["TWD", "USD", "2026-11-02", "DEXTAUS", [{ date: "2026-10-30", value: 0 }], /positive/],
    ["TWD", "USD", "2026-02-30", "DEXTAUS", [], /date/],
    ["XYZ", "USD", "2026-11-02", "DEXTAUS", [], /unsupported/],
    ["TWD", "EUR", "2026-11-02", "DEXTAUS", [], /USD/],
  ] as const)("fails closed: %s %s %s", (from, to, date, id, rows, reason) => {
    const result = selectValuationFx(from, to, date, fx(id, [...rows]));
    expect(result.rate).toBeNull();
    expect(result.reason).toMatch(reason);
  });
  it("keeps no-op same-currency fetches and missing FX honest", async () => {
    expect(await fetchValuationFx("USD", "USD", "2026-11-02", () => { throw new Error("unneeded fetch"); })).toBeUndefined();
    expect(selectValuationFx("TWD", "USD", "2026-11-02", undefined).rate).toBeNull();
  });
});

function fx(seriesId: string, data: { date: string; value: number }[]) {
  return { ok: true as const, value: { source: "fred" as const, endpoint: `fredgraph.csv?id=${seriesId}`, asOf: "2026-10-30", fetchedAt: "2026-11-02T23:00:00Z", data } };
}
