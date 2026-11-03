import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { validateBundle } from "@/pipeline/stageA/validate";
import { foreignBundle } from "./helpers/foreignBundle";

function fixture() {
  const b = foreignBundle("TWD", 5);
  if (!b.edgar.companyFacts.ok) throw Error("fixture");
  const point = { start: "2025-01-01", end: "2025-12-31", val: 1000e6, filed: "2026-02-01", form: "20-F", accn: "0000000042-26-000001", fy: 2025, fp: "FY" };
  Object.assign(b.edgar.companyFacts.value.data.facts["ifrs-full"]!, {
    Revenue: { units: { TWD: [point] } },
    Assets: { units: { TWD: [{ ...point, start: undefined, val: 2000e6 }] } },
  });
  b.analystEstimates = { ok: true, value: { source: "fmp", endpoint: "synthetic", fetchedAt: b.builtAt, asOf: "2026-07-02", data: { raw: [], rows: [
    { date: "2025-12-31", revenueAvg: 1005e6, epsAvg: 2 },
    { date: "2026-12-31", revenueAvg: 1100e6, epsAvg: 3 },
    { date: "2027-12-31", revenueAvg: 1200e6, epsAvg: 4 },
  ] } } };
  return b;
}

describe("D-188 foreign revenue calibration", () => {
  it("admits totals through the existing consensus path and labels only revenue in Stage C", () => {
    const b = fixture(), c = runStageB(b);
    expect(c.valuation.notes.join(" ")).toMatch(/calibrat.*2025-12-31.*1005000000.*1000000000.*3%/i);
    expect(c.valuation.kind).toBe("dcf");
    if (c.valuation.kind !== "dcf") throw Error("fixture");
    expect(c.valuation.assumptions?.revenueAnchor?.source).toBe("consensus");
    const payload = assembleContextPayload(b, c, validateBundle(b, { now: new Date(b.builtAt) }));
    expect(payload.estimates.figures.find(f => f.label === "est revenue 2026-12-31")?.currency).toBe("TWD");
    expect(payload.estimates.figures.find(f => f.label === "est EPS 2026-12-31")?.currency).toBeNull();
  });
  it.each(["listing", "no-overlap", "future-overlap", "near-one", "contradiction", "latest-outside-3", "own-currency", "no-foreign-basis"])("refuses calibration for %s", mode => {
    const b = fixture();
    if (!b.analystEstimates.ok || !b.edgar.companyFacts.ok || !b.valuationFx?.ok) throw Error("fixture");
    const rows = b.analystEstimates.value.data.rows;
    if (mode === "listing") rows[0]!.revenueAvg = 1000e6 / 32;
    if (mode === "no-overlap") rows.shift();
    if (mode === "future-overlap") rows[0]!.date = "2027-12-31";
    if (mode === "near-one") b.valuationFx.value.data[0]!.value = 1.01;
    if (mode === "latest-outside-3") rows[0]!.revenueAvg = 1040e6;
    if (mode === "contradiction") {
      rows.push({ date: "2024-12-31", revenueAvg: 700e6 });
      const concept = b.edgar.companyFacts.value.data.facts["ifrs-full"]!.Revenue as { units: { TWD: object[] } };
      concept.units.TWD.push({ start: "2024-01-01", end: "2024-12-31", val: 1000e6, filed: "2026-02-01", form: "20-F", accn: "0000000042-26-000001", fy: 2025, fp: "FY" });
    }
    if (mode === "own-currency") for (const row of rows) row.currency = "USD";
    if (mode === "no-foreign-basis") delete b.valuationFx;
    expect(runStageB(b).valuation.notes.join(" ")).not.toMatch(/revenue totals admitted by calibration/);
  });
});
