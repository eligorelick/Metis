import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { foreignBundle } from "./helpers/foreignBundle";
import { filedAnnualNciEarnings } from "@/pipeline/nciEarnings";

function fixture(mode = "current") {
  const b = foreignBundle();
  if (!b.edgar.companyFacts.ok) throw Error("fixture");
  for (const family of [b.statements.balanceAnnual, b.statements.balanceQuarterly]) if (family.ok) for (const row of family.value.data.rows) {
    row.minorityInterest = 1000; row.totalEquity = row.totalStockholdersEquity! + 1000;
  }
  const point = { start: mode === "stale" ? "2024-01-01" : "2025-01-01", end: mode === "stale" ? "2024-12-31" : "2025-12-31",
    val: 100e6, filed: "2026-02-01", form: "20-F", accn: "0000000042-26-000001" };
  Object.assign(b.edgar.companyFacts.value.data.facts["ifrs-full"]!, {
    ProfitLoss: { units: { TWD: [point] } },
    ProfitLossAttributableToOwnersOfParent: { units: { TWD: [{ ...point, val: 100.5e6, accn: mode === "mixed-filing" ? "other" : point.accn }] } },
  });
  return b;
}
describe("D-188 filed annual NCI key", () => {
  it("does not rescue a contradictory current allocation with an older key", () => {
    const b = fixture();
    if (!b.edgar.companyFacts.ok) throw Error("fixture");
    const f = b.edgar.companyFacts.value.data.facts["ifrs-full"]!;
    const profits = (f.ProfitLoss as { units: { TWD: { start: string; end: string; val: number; filed: string; form: string; accn: string }[] } }).units.TWD;
    const parents = (f.ProfitLossAttributableToOwnersOfParent as { units: { TWD: typeof profits } }).units.TWD;
    const current = profits[0]!;
    profits.push({ ...current, start: "2024-01-01", end: "2024-12-31" });
    parents.push({ ...current, start: "2024-01-01", end: "2024-12-31", val: 100.5e6 });
    f.ProfitLossAttributableToNoncontrollingInterests = { units: { TWD: [{ ...current, val: 5e6 }] } };
    expect(filedAnnualNciEarnings(b, "TWD")).toBeNull();
  });
  it("reads a directly filed allocation and sorts multiple fiscal periods", () => {
    const b = fixture();
    if (!b.edgar.companyFacts.ok) throw Error("fixture");
    const f = b.edgar.companyFacts.value.data.facts["ifrs-full"]!;
    const concept = f.ProfitLoss as { units: { TWD: { start: string; end: string; val: number }[] } };
    const point = concept.units.TWD[0]!;
    concept.units.TWD.push({ ...point, start: "2024-01-01", end: "2024-12-31" });
    f.ProfitLossAttributableToNoncontrollingInterests = { units: { TWD: [{ ...point, val: -0.5e6 }] } };
    expect(filedAnnualNciEarnings(b, "TWD")).toMatchObject({ asOf: "2025-12-31", noncontrollingIncome: -0.5e6 });
  });
  it.each(["future-acquisition", "profit-dispute", "parent-dispute", "allocation-dispute"])("refuses %s evidence", mode => {
    const b = fixture();
    if (!b.edgar.companyFacts.ok) throw Error("fixture");
    const f = b.edgar.companyFacts.value.data.facts["ifrs-full"]!;
    const concept = f.ProfitLoss as { units: { TWD: { val: number }[] } };
    const point = concept.units.TWD[0]!;
    if (mode === "future-acquisition") b.edgar.companyFacts.value.fetchedAt = "2027-01-01T00:00:00Z";
    if (mode === "profit-dispute") concept.units.TWD.push({ ...point, val: 110e6 });
    if (mode === "parent-dispute") (f.ProfitLossAttributableToOwnersOfParent as typeof concept).units.TWD.push({ ...point, val: 110e6 });
    if (mode === "allocation-dispute") f.ProfitLossAttributableToNoncontrollingInterests = { units: { TWD: [{ ...point, val: 1e6 }, { ...point, val: 2e6 }] } };
    expect(filedAnnualNciEarnings(b, "TWD")).toBeNull();
  });
  it("derives the current allocation from consolidated less parent profit in one filing", () => {
    const c = runStageB(fixture());
    if (c.valuation.kind !== "dcf") throw Error("fixture");
    expect(c.valuation.dcf!.perShare).not.toBeNull();
    expect(c.valuation.dcf!.bridge.noncontrollingEarningsShare).toBe(-0.005);
    expect(c.valuation.notes.join(" ")).toMatch(/consolidated.*less.*parent/i);
  });
  it("uses a proved stale annual allocation only under the narrow materiality rule", () => {
    const c = runStageB(fixture("stale"));
    expect(c.fairValue.perShare).not.toBeNull();
    expect(c.valuation.notes.join(" ")).toMatch(/stale.*2024-12-31/i);
  });
  it("does not subtract across different filings", () => {
    const c = runStageB(fixture("mixed-filing"));
    expect(c.fairValue.perShare).toBeNull();
  });
});
