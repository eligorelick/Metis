import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import { runStageB } from "@/pipeline/compute";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { ReportView } from "@/components/report/ReportView";
import { reportToAuditMarkdown, reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { filingFactTables } from "@/report/filingSupplementPresentation";
import { completeCurrencyBundle, M } from "./helpers/currencyBundle";
import { confirmFixtureIssuer } from "./helpers/edgarIdentity";
import { loadTask28Fixture } from "./helpers/task28Report";

function fixture() {
  const bundle = completeCurrencyBundle({});
  bundle.builtAt = "2026-10-17T00:00:00Z";
  confirmFixtureIssuer(bundle, 1);
  const accession = "0000000001-26-000002";
  const filed = "2026-08-06";
  const end = "2026-06-30";
  const concept = (value: number, start?: string) => ({ units: { USD: [{ val: value * M, ...(start ? { start } : {}), end, filed, accn: accession, form: "10-Q", fy: 2026, fp: "Q2" }] } });
  const gaap = {
    ShareBasedCompensation: concept(217, "2026-01-01"),
    AllocatedShareBasedCompensationExpense: concept(217, "2026-01-01"),
    EmployeeServiceShareBasedCompensationAllocationOfRecognizedPeriodCostsCapitalizedAmount: concept(49, "2026-01-01"),
    CapitalizedComputerSoftwareAmortization1: concept(350, "2026-01-01"),
    CashAndCashEquivalentsAtCarryingValue: concept(6682), RestrictedCashAndCashEquivalentsAtCarryingValue: concept(2402),
    RestrictedCashAndCashEquivalentsNoncurrent: concept(0),
    CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents: concept(9084),
    IncomeTaxesReceivable: concept(50), AccruedIncomeTaxesCurrent: concept(55),
    IncreaseDecreaseInAccountsReceivable: concept(1654, "2026-01-01"),
    IncreaseDecreaseInOtherOperatingAssets: concept(230, "2026-01-01"),
    IncreaseDecreaseInOtherAccountsPayableAndAccruedLiabilities: concept(282, "2026-01-01"),
    IncreaseDecreaseInIncomeTaxes: concept(-12, "2026-01-01"),
  };
  bundle.edgar.companyFacts = { ok: true, value: { source: "edgar", endpoint: "fixture companyfacts", asOf: end, fetchedAt: bundle.builtAt, data: { cik: 1, entityName: "Ordinary issuer", facts: { "us-gaap": gaap } } } };
  bundle.edgar.tenQNotes = { ok: true, value: { source: "edgar", endpoint: "fixture notes", asOf: end, fetchedAt: bundle.builtAt,
    data: { sectionName: "tenQNotes", text: "Notes to consolidated statements", chars: 32, method: "toc-anchor", form: "10-Q", accession,
      reportDate: end, filingDate: filed, documentUrl: `https://www.sec.gov/Archives/edgar/data/1/${accession.replaceAll("-", "")}/issuer.htm` } } };
  return { bundle, gaap };
}
const composition = (bundle: ReturnType<typeof fixture>["bundle"]) => buildFilingDisclosures(bundle)?.filingFacts?.filter(f => f.key.startsWith("composition-")) ?? [];
function annualMetadataFixture() {
  const { bundle, gaap } = fixture();
  delete bundle.edgar.tenQNotes;
  for (const c of Object.values(gaap)) for (const p of c.units.USD) Object.assign(p, { end: "2025-12-31", ...(p.start ? { start: "2025-01-01" } : {}),
    filed: "2026-02-13", accn: "0000000001-26-000001", form: "10-K", fp: "FY" });
  gaap.AllocatedShareBasedCompensationExpense.units.USD[0]!.val = 398 * M;
  gaap.EmployeeServiceShareBasedCompensationAllocationOfRecognizedPeriodCostsCapitalizedAmount.units.USD[0]!.val = 99 * M;
  bundle.edgar.latestTenK = { ok: true, value: { source: "edgar", endpoint: "https://data.sec.gov/submissions/CIK0000000001.json", asOf: "2025-12-31", fetchedAt: bundle.builtAt,
    data: { accessionNumber: "0000000001-26-000001", filingDate: "2026-02-13", reportDate: "2025-12-31", form: "10-K", primaryDocument: "annual.htm" } } };
  return bundle;
}

describe("source-bound financial composition disclosures", () => {
  it("keeps recognized and capitalized SBC separate without inventing a comprehensive service cost", () => {
    const { bundle } = fixture();
    const facts = composition(bundle).filter(f => f.key.startsWith("composition-sbc-"));
    expect(facts.map(f => f.value)).toEqual([217 * M, 49 * M]);
    expect(facts[0]?.sourceTag).toContain("AllocatedShareBasedCompensationExpense");
    for (const fact of facts) {
      expect(fact.period).toBe("2026-01-01 to 2026-06-30");
      expect(fact.text).toMatch(/not additive/i);
      expect(fact.text).toMatch(/amortization of previously capitalized SBC.*unestablished/i);
      expect(fact.text).toMatch(/comprehensive current-service cost.*unestablished/i);
    }
  });
  it("reconciles same-source cash, keeps current income taxes gross, and labels working-capital subtotal partial", () => {
    const { bundle } = fixture();
    const facts = composition(bundle);
    expect(facts.filter(f => f.key.startsWith("composition-cash-")).map(f => f.value)).toEqual([6682 * M, 2402 * M, 0, 9084 * M]);
    expect(facts.find(f => f.key === "composition-cash-combined")?.computed).toContain("6682000000 + 2402000000 + 0 = 9084000000 USD");
    const tax = facts.filter(f => f.key.startsWith("composition-tax-"));
    expect(tax.map(f => f.value)).toEqual([50 * M, 55 * M]);
    expect(tax.every(f => /not an occupancy-tax pair.*legal netting.*unestablished/i.test(f.text))).toBe(true);
    const wc = facts.filter(f => f.key.startsWith("composition-working-capital-"));
    expect(wc.map(f => f.value)).toEqual([-1654 * M, -230 * M, 282 * M, -12 * M, -1614 * M]);
    expect(wc.at(-1)?.label).toMatch(/partial subtotal/i);
    expect(wc.every(f => /other working-capital components remain unresolved/i.test(f.text))).toBe(true);
    expect(wc.every(f => !/merchant/i.test(f.text))).toBe(true);
  });
  it.each(["issuer", "accession", "date", "currency", "future", "url"])("rejects unestablished %s source compatibility", kind => {
    const { bundle, gaap } = fixture();
    if (!bundle.edgar.tenQNotes?.ok || !bundle.edgar.companyFacts.ok) throw new Error("fixture missing");
    if (kind === "issuer") bundle.edgar.companyFacts.value.data.cik = 2;
    if (kind === "accession") bundle.edgar.tenQNotes.value.data.accession = "0000000001-26-000003";
    if (kind === "date") bundle.edgar.tenQNotes.value.data.reportDate = "2026-03-31";
    if (kind === "future") bundle.builtAt = "2026-08-01T00:00:00Z";
    if (kind === "url") bundle.edgar.tenQNotes.value.data.documentUrl = "https://example.com/issuer.htm";
    if (kind === "currency") for (const c of Object.values(gaap)) { Object.assign(c.units, { EUR: c.units.USD }); c.units.USD = []; }
    expect(composition(bundle)).toEqual([]);
  });
  it("does not substitute all software amortization for missing capitalized-SBC detail or fill missing WC components with zero", () => {
    const { bundle, gaap } = fixture();
    gaap.EmployeeServiceShareBasedCompensationAllocationOfRecognizedPeriodCostsCapitalizedAmount.units.USD = [];
    gaap.IncreaseDecreaseInOtherOperatingAssets.units.USD = [];
    const facts = composition(bundle);
    expect(facts.filter(f => f.key.startsWith("composition-sbc-")).map(f => f.value)).toEqual([217 * M]);
    expect(facts.some(f => f.key === "composition-working-capital-subtotal")).toBe(false);
  });
  it("admits exact annual SEC metadata and matching XBRL without claiming the unavailable notes were read", () => {
    const bundle = annualMetadataFixture();
    const facts = composition(bundle).filter(f => f.key.startsWith("composition-sbc-"));
    expect(facts.map(f => f.value)).toEqual([398 * M, 99 * M]);
    expect(facts[0]?.source.url).toBe("https://www.sec.gov/Archives/edgar/data/1/000000000126000001/annual.htm");
    expect(facts[0]?.sourceTag).toContain("edgar:xbrl");
    expect(bundle.edgar.tenKNotes).toBeUndefined();
  });
  it.each(["primary-document", "foreign-issuer", "future-filing"])("rejects annual metadata with %s unavailable", kind => {
    const bundle = annualMetadataFixture();
    if (!bundle.edgar.latestTenK.ok || !bundle.edgar.companyFacts.ok) throw new Error("fixture missing");
    if (kind === "primary-document") bundle.edgar.latestTenK.value.data.primaryDocument = "";
    if (kind === "foreign-issuer") bundle.edgar.companyFacts.value.data.cik = 2;
    if (kind === "future-filing") bundle.builtAt = "2026-02-01T00:00:00Z";
    expect(composition(bundle)).toEqual([]);
  });
  it("keeps composition caveats attached in live, Markdown, print, audit and numeric payload surfaces", () => {
    const { bundle } = fixture();
    const disclosures = buildFilingDisclosures(bundle)!;
    expect(filingFactTables(disclosures).some(t => /SBC composition/.test(t.heading))).toBe(true);
    const report = loadTask28Fixture();
    report.filingDisclosures = disclosures;
    for (const text of [reportToMarkdown(report), reportToPrintBody(report), reportToAuditMarkdown(report), renderToStaticMarkup(createElement(ReportView, { report }))]) {
      expect(text).toContain("comprehensive current-service cost is unestablished");
      expect(text).toContain("other working-capital components remain unresolved");
      expect(text).not.toContain("merchant payables and deferred merchant bookings remain unresolved");
      expect(text).toContain("not an occupancy-tax pair");
    }
    const payload = assembleContextPayload(bundle, runStageB(bundle), { checks: [], flags: [], gaps: [] });
    expect(payload.filingFacts?.notes.join(" ")).toContain("comprehensive current-service cost is unestablished");
    expect(payload.filingFacts?.notes.join(" ")).toContain("other working-capital components remain unresolved");
    expect(payload.filingFacts?.notes.join(" ")).not.toContain("merchant payables and deferred merchant bookings remain unresolved");
  });
  it("preserves merchant-specific warnings when the same admitted filing identifies merchant balances", () => {
    const { bundle } = fixture();
    if (!bundle.edgar.tenQNotes?.ok) throw new Error("fixture missing notes");
    bundle.edgar.tenQNotes.value.data.text = "Merchant payables and deferred merchant bookings are presented in accrued liabilities.";
    const wc = composition(bundle).filter(f => f.key.startsWith("composition-working-capital-"));
    expect(wc).toHaveLength(5);
    expect(wc.every(f => /merchant payables and deferred merchant bookings remain unresolved/i.test(f.text))).toBe(true);
    expect(wc.every(f => /other working-capital components remain unresolved/i.test(f.text))).toBe(true);
  });
  it("retains merchant caveats supported by the same filing's statement prefix", () => {
    const { bundle } = fixture();
    if (!bundle.edgar.tenQNotes?.ok) throw new Error("fixture missing notes");
    bundle.edgar.tenQNotes.value.data.statementsText = "Deferred merchant bookings are included in current liabilities.";
    const wc = composition(bundle).filter(f => f.key.startsWith("composition-working-capital-"));
    expect(wc).toHaveLength(5);
    expect(wc.every(f => /merchant payables and deferred merchant bookings remain unresolved/i.test(f.text))).toBe(true);
  });
});
