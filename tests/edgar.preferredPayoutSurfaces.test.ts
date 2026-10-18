/** Pure synthetic integration: no network, user database, or retained issuer facts. */
import { describe, expect, it } from "vitest";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import type { CompanyFacts } from "@/edgar/xbrl";
import { tangibleCommonEquity } from "@/pipeline/stageB/returns";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { parseStoredReport } from "@/report/history";
import { reportToAuditMarkdown } from "@/report/export/auditMarkdown";
import { buildSyntheticRouteBundle, runResearchRoutePanel } from "./helpers/researchRoutePanel";
import { M } from "./helpers/currencyBundle";

type ZeroCashMode = "positive" | "negative" | "period" | "currency" | "direct-zero" | "aggregate-zero";

function parsedCash(usableYears: number, zeroMode?: ZeroCashMode) {
  const tags: Record<string, unknown[]> = {};
  const add = (tag: string, value: number, year: number, instant = false) => {
    (tags[tag] ??= []).push({ ...(instant ? {} : { start: `${year}-01-${tag === "PaymentsOfDividendsPreferredStockAndPreferenceStock" && zeroMode === "period" ? "02" : "01"}` }), end: `${year}-12-31`, val: value * M,
      accn: `0000000001-${year + 1}-000001`, filed: `${year + 1}-02-20`, form: "10-K", fy: year, fp: "FY" });
  };
  for (const [i, year] of [2025, 2024, 2023].entries()) {
    const common = [30, 28, 26][i]!;
    add("NetCashProvidedByUsedInOperatingActivities", 220, year);
    add("Assets", 900, year, true);
    add("PreferredStockIncludingAdditionalPaidInCapitalNetOfDiscount", 50, year, true);
    add("PaymentsOfDividends", zeroMode ? 0 : common + 8, year);
    if (zeroMode && zeroMode !== "aggregate-zero") add("PaymentsOfDividendsPreferredStockAndPreferenceStock", zeroMode === "negative" ? -8 : 8, year);
    add("PaymentsForRepurchaseOfCommonStock", [20, 30, 13][i]!, year);
    add("ProceedsFromIssuanceOfCommonStock", [10, 2, 0][i]!, year);
    if (i < usableYears || zeroMode === "direct-zero") add("PaymentsOfDividendsCommonStock", zeroMode ? 0 : common, year);
  }
  const facts: CompanyFacts = { cik: 1, entityName: "Synthetic bank", facts: { "us-gaap":
    Object.fromEntries(Object.entries(tags).map(([tag, points]) => [tag, { units: {
      [tag === "PaymentsOfDividendsPreferredStockAndPreferenceStock" && zeroMode === "currency" ? "CAD" : "USD"]: points,
    } }])),
  } };
  return buildStatementsFromCompanyFacts(facts, { symbol: "SYNBANK", cik: "1", annualPeriods: 3, quarterlyPeriods: 0,
    asOf: "2026-07-06", factsObservedAt: "2026-07-06T00:00:00Z",
    vendorSplits: { status: "retrieved", source: "test:vendor", events: [], coverage: [{ from: "2020-01-01", to: "2026-07-06" }] },
  });
}

function panel(usableYears: number, zeroMode?: ZeroCashMode) {
  const parsed = parsedCash(usableYears, zeroMode);
  const bundle = buildSyntheticRouteBundle("bank");
  if (!bundle.statements.cashflowAnnual.ok) throw new Error("synthetic cash flow required");
  bundle.statements.cashflowAnnual.value.data.rows = parsed.cashflowAnnual.rows;
  // Retain the clearly synthetic envelope; field-level provenance names the
  // parser's facts. This exercises downstream consumers, not provider custody.
  const serializedBundle = JSON.parse(JSON.stringify(bundle)) as typeof bundle;
  const result = runResearchRoutePanel(serializedBundle);
  return { parsed, ...result, payload: assembleContextPayload(serializedBundle, result.computed, result.validation) };
}

describe("preferred payout admission across financial report surfaces", () => {
  it.each(["positive", "negative", "period", "currency"] as const)("zero total with %s preferred cash preserves explicit refusal through every surface", (mode) => {
    const { parsed, computed, report, surfaces, payload } = panel(0, mode);
    expect(parsed.cashflowAnnual.rows).toHaveLength(3);
    for (const row of parsed.cashflowAnnual.rows) expect(row).toMatchObject({ commonDividendsPaid: null, netDividendsPaid: 0 });
    expect(computed.returns.rote.latestTangibleCommonEquity).toBe(400 * M);
    expect(computed.returns.rote.latestRotePct).toBeCloseTo(140 / 375 * 100, 10);
    if (computed.valuation.kind !== "excess-return") throw new Error("bank route expected");
    expect(computed.valuation.excessReturn).toMatchObject({ equityValue: null, perShare: null, impliedPToBv: null,
      payoutRatioPct: { value: null }, reverseSolve: { impliedCurrentRoePct: null } });
    for (const row of parsed.cashflowAnnual.rows) expect(row.fieldConflicts?.commonDividendsPaid).toMatchObject({ usable: false, reason: expect.any(String) });
    const gap = computed.gaps.find(g => g.field === "valuation.excessReturn.payout");
    expect(gap).toMatchObject({ severity: "critical", reason: expect.stringMatching(/payout history unavailable/) });
    expect(report.fairValue).toMatchObject({ status: "suppressed", perShare: null });
    expect(report.valuation.dcf.perShare).toBeNull();
    expect(report.appendix.missingData).toContainEqual(gap);
    const stored = JSON.stringify(report);
    const read = parseStoredReport(stored);
    expect(read?.fairValue).toMatchObject({ status: "suppressed", perShare: null });
    expect(read?.valuation.dcf.perShare).toBeNull();
    expect(read?.appendix.missingData).toContainEqual(gap);
    expect(JSON.stringify(report)).toBe(stored);
    expect(payload.computed.flatMap(section => section.figures).find(figure => figure.label === "excess-return per share")?.value).toBeNull();
    for (const surface of [...Object.values(surfaces), reportToAuditMarkdown(report)]) {
      expect(surface).toContain("payout history unavailable");
      expect(surface).not.toContain("12.57");
    }
  });
  it.each(["direct-zero", "aggregate-zero"] as const)("genuinely sourced %s remains a usable payout observation", (mode) => {
    const { parsed, computed, report } = panel(0, mode);
    for (const row of parsed.cashflowAnnual.rows) {
      expect(row.commonDividendsPaid).toBe(0);
      expect(row.fieldConflicts?.commonDividendsPaid).toBeUndefined();
    }
    if (computed.valuation.kind !== "excess-return") throw new Error("bank route expected");
    expect(computed.valuation.excessReturn.payoutRatioPct.value).toBeCloseTo((10 / 140 + 28 / 130 + 13 / 120) / 3 * 100, 10);
    expect(computed.valuation.excessReturn.perShare).not.toBeNull();
    expect(report.fairValue?.status).toBe("available");
  });
  it.each([0, 1])("%s usable common payout years withholds every dependent valuation", (usableYears) => {
    const { parsed, computed, report, surfaces } = panel(usableYears);
    expect(parsed.cashflowAnnual.rows.filter(row => row.commonDividendsPaid !== null)).toHaveLength(usableYears);
    expect(computed.returns.rote.latestTangibleCommonEquity).toBe(400 * M);
    expect(computed.returns.rote.latestRotePct).toBeCloseTo(140 / 375 * 100, 10);
    expect(computed.valuation.kind).toBe("excess-return");
    if (computed.valuation.kind !== "excess-return") throw new Error("bank route expected");
    expect(computed.valuation.excessReturn).toMatchObject({ equityValue: null, perShare: null, impliedPToBv: null,
      payoutRatioPct: { value: null }, reverseSolve: { impliedCurrentRoePct: null } });
    const gap = computed.gaps.find(g => g.field === "valuation.excessReturn.payout");
    expect(gap).toMatchObject({ severity: "critical", reason: expect.stringMatching(/payout history unavailable/) });
    expect(report.fairValue).toMatchObject({ status: "suppressed", perShare: null });
    expect(report.valuation.dcf.perShare).toBeNull();
    expect(report.appendix.missingData).toContainEqual(gap);
    const stored = JSON.stringify(report);
    const read = parseStoredReport(stored);
    expect(read?.fairValue).toMatchObject({ status: "suppressed", perShare: null });
    expect(read?.appendix.missingData).toContainEqual(gap);
    expect(JSON.stringify(report)).toBe(stored);
    for (const surface of [...Object.values(surfaces), reportToAuditMarkdown(report)]) {
      expect(surface).toContain("payout history unavailable");
      expect(surface).not.toMatch(/\b(?:NaN|Infinity)\b/);
    }
  });
  it("two usable common payout years retain the existing admission threshold", () => {
    const { computed } = panel(2);
    if (computed.valuation.kind !== "excess-return") throw new Error("bank route expected");
    expect(computed.valuation.excessReturn.payoutRatioPct.value).toBeCloseTo((40 / 140 + 56 / 130) / 2 * 100, 10);
    expect(computed.valuation.excessReturn.equityValue).not.toBeNull();
    expect(computed.valuation.excessReturn.perShare).not.toBeNull();
  });
  it("clean common cash retains the 34.716117% payout control", () => {
    const { computed } = panel(3);
    if (computed.valuation.kind !== "excess-return") throw new Error("bank route expected");
    expect(computed.valuation.excessReturn.payoutRatioPct.value).toBeCloseTo(34.71611721611722, 10);
  });
  it("the existing APIC-inclusive TCE control remains 287062", () => {
    const tags = { Assets: 4_424_900, StockholdersEquity: 362_438, Goodwill: 52_731,
      PreferredStockIncludingAdditionalPaidInCapitalNetOfDiscount: 20_045,
      FiniteLivedIntangibleAssetsNet: 1_300, IndefiniteLivedIntangibleAssetsExcludingGoodwill: 1_300 };
    const facts: CompanyFacts = { cik: 1, entityName: "Synthetic carrying-value control", facts: { "us-gaap":
      Object.fromEntries(Object.entries(tags).map(([tag, val]) => [tag, { units: { USD: [
        { end: "2025-12-31", val, accn: "0000000001-26-000001", filed: "2026-02-20", form: "10-K", fy: 2025, fp: "FY" },
      ] } }])),
    } };
    const parsed = buildStatementsFromCompanyFacts(facts, { symbol: "SYN", cik: "1", annualPeriods: 1, quarterlyPeriods: 0,
      asOf: "2026-07-06", vendorSplits: { status: "unavailable", source: "test", reason: "no per-share control" } });
    const row = parsed.balanceAnnual.rows[0]!;
    expect(tangibleCommonEquity({ ...row, date: String(row.date) })).toBe(287_062);
  });
});
