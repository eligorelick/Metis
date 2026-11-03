import { describe, expect, it } from "vitest";
import { identicalClassRights } from "@/edgar/economicShares";
import { retainedClassEconomicEvidence } from "@/edgar/retainedClassEconomics";
import { resolveEconomicEquityScope } from "@/pipeline/stageB/securityBasis";
import type { DataBundle } from "@/pipeline/types";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import filed from "./fixtures/valuation-coverage-equal-classes.json";

const rights = "There are no differences in the dividend and liquidation preferences or participation rights of the holders of Class A and Class B Common Stock.";
function fixture() {
  const b = completeCurrencyBundle({ symbol: "EQUAL" });
  b.builtAt = "2026-11-03T18:00:00Z";
  if (!b.profile.ok) throw Error("profile fixture");
  Object.assign(b.profile.value.data.rows[0]!, { symbol: b.symbol, cik: "0000320187", companyName: "Example, Inc.", isAdr: false });
  b.edgar.registrant = { cik10: "0000320187", name: "Example", tickers: [b.symbol], exchanges: ["NYSE"], sic: "3021", sicDescription: null, fiscalYearEnd: "0531", stateOfIncorporation: null, forms: ["10-K", "10-Q"] };
  b.edgar.tenKNotes = structuredClone(filed.tenKNotes) as DataBundle["edgar"]["tenKNotes"];
  b.edgar.tenQNotes = structuredClone(filed.tenQNotes) as DataBundle["edgar"]["tenQNotes"];
  b.edgar.economicShareInventory = structuredClone(filed.economicShareInventory);
  return b;
}

describe("D-186 equally participating class coverage", () => {
  it("reads the filed no-differences sentence as equal economic rights", () => {
    expect(identicalClassRights(rights)).toEqual(["class a common stock", "class b common stock"]);
  });
  it("values every dated class at the same-price approximation without guessing the quoted class", () => {
    const b = fixture(), before = JSON.stringify(b);
    const evidence = retainedClassEconomicEvidence(b);
    const scope = resolveEconomicEquityScope({ price: 50, marketCap: 1, issuerId: "0000320187", securityId: "EQUAL", currency: "USD", priceAsOf: "2026-11-03", isAdr: false }, evidence, "2026-11-03");
    expect(scope).toMatchObject({ status: "resolved", economicShares: 1_485_308_829, marketCap: 74_265_441_450, approximate: true, shareCountAsOf: "2026-09-28" });
    expect(scope.basis).toContain(rights);
    expect(scope.basis).toContain("quoted class is not identified");
    expect(scope.sourceIds).toContain(filed.tenKNotes.value.data.documentUrl);
    expect(scope.sourceIds).toContain(filed.tenQNotes.value.data.documentUrl);
    expect(JSON.stringify(b)).toBe(before);
  });
  it("refuses a split after the cover date rather than using pre-split counts", () => {
    const b = fixture();
    b.edgar.shareBasis = { basisDay: "2026-11-03", splits: { asOf: "2026-11-03", coverage: [], events: [{ date: "2026-10-15", ratio: 2 }], notes: [], unresolved: [], vendor: { source: "fixture", status: "unavailable" } } } as unknown as NonNullable<DataBundle["edgar"]["shareBasis"]>;
    expect(retainedClassEconomicEvidence(b)).toEqual([]);
  });
  it("refuses an inventory with a third class absent from its cover observations", () => {
    const b = fixture();
    b.edgar.economicShareInventory![1]!.classes.push({ classId: "unknown", label: "Class C", shares: 1, asOf: "2026-09-28", sourceId: "source" });
    expect(retainedClassEconomicEvidence(b)).toEqual([]);
  });
  it.each(["missing rights", "qualified rights", "other issuer", "ADR", "incomplete cover", "duplicate cover", "mixed dates", "future cover", "extra class", "contrary newer rights", "unbound URL", "newer filing", "stale rights", "split"])("refuses %s", mode => {
    const b = fixture();
    if (!b.edgar.tenKNotes?.ok || !b.edgar.tenQNotes?.ok || !b.profile.ok) throw Error("fixture");
    const a = b.edgar.tenKNotes.value.data, q = b.edgar.tenQNotes.value.data;
    const inventory = b.edgar.economicShareInventory![1]!;
    if (mode === "missing rights") a.text = "Class A converts to Class B.";
    if (mode === "qualified rights") a.text = rights.replace(".", ", except for special dividends.");
    if (mode === "other issuer") b.profile.value.data.rows[0]!.cik = "99";
    if (mode === "ADR") b.profile.value.data.rows[0]!.isAdr = true;
    if (mode === "incomplete cover") inventory.observations!.pop();
    if (mode === "duplicate cover") inventory.observations!.push({ ...inventory.observations![0]! });
    if (mode === "mixed dates") inventory.observations![0]!.asOf = "2026-09-27";
    if (mode === "future cover") inventory.observations!.forEach(o => o.asOf = "2026-10-03");
    if (mode === "extra class") q.statementsText = q.statementsText!.replace("Capital in excess", "Class C — 5 shares outstanding Capital in excess");
    if (mode === "contrary newer rights") q.text += " Class B common stock has preferential dividend rights.";
    if (mode === "unbound URL") q.documentUrl = "https://example.com/filing.htm";
    if (mode === "newer filing") b.edgar.economicShareInventory!.push({ ...inventory, source: { ...inventory.source, filingDate: "2026-10-03" } });
    if (mode === "stale rights") a.filingDate = "2024-07-15";
    if (mode === "split") b.edgar.shareBasis = { basisDay: "2026-11-03", splits: { asOf: "2026-11-03", coverage: [], events: [], notes: [], unresolved: [{ reason: "unknown split" }], vendor: { source: "fixture", status: "unavailable" } } } as unknown as NonNullable<DataBundle["edgar"]["shareBasis"]>;
    expect(retainedClassEconomicEvidence(b)).toEqual([]);
  });
});
