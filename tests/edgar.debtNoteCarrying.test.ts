import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import { admitDebtFields } from "@/edgar/financialEnrichment";
import { reconcileDebtNoteCarrying, type DebtNoteCarryingInput } from "@/edgar/debtNoteCarrying";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { ExtractedSection } from "@/pipeline/types";
import type { FmpStatementRow } from "@/providers/fmp";
import frozen from "./fixtures/crwv-debt-facts.json";

const observedAt = "2026-10-18T03:45:24.555Z";
const end = "2026-06-30";
const section: ExtractedSection = { form: "10-Q", accession: "0001769628-26-000366", filingDate: "2026-08-12", reportDate: end,
  documentUrl: "https://www.sec.gov/Archives/edgar/data/1769628/000176962826000366/crwv-20260630.htm",
  sectionName: "tenQNotes", method: "header-regex", chars: 1, text: readFileSync("fixtures/edgar/crwv-debt-note-20260630.txt", "utf8") };
function source() {
  const facts = structuredClone(frozen.facts) as CompanyFacts;
  const built = buildStatementsFromCompanyFacts(facts, { symbol: "CRWV", cik: "0001769628", asOf: observedAt.slice(0, 10), factsObservedAt: observedAt,
    annualPeriods: 2, quarterlyPeriods: 4, vendorSplits: { status: "retrieved", source: "test:vendor", events: [], coverage: [{ from: "2020-01-01", to: observedAt.slice(0, 10) }] } });
  return { facts, row: built.balanceQuarterly.rows.find((entry) => entry.date === end)! };
}
const parserInput: DebtNoteCarryingInput = { text: section.text, periodEnd: end, currency: "USD", observedAt, principal: 35551e6, source: section,
  principalSource: { cik: "1769628", accession: section.accession, filingDate: section.filingDate, periodEnd: end, unit: "USD" } };

describe("Note 10 carrying debt recovery", () => {
  it("replaces the unsupported fiscal maturity allocation with reconciled carrying classes, adding known leases once", () => {
    const { facts, row } = source();
    expect(row.totalDebt).toBeNull();
    const raw = JSON.stringify(row);
    const result = admitDebtFields(row, facts, "USD", observedAt, [section]);
    expect(result.row).toMatchObject({ shortTermDebt: 7513e6, longTermDebt: 27555e6, totalDebt: 51608e6, capitalLeaseObligations: 16540e6 });
    expect(result.row.fieldProvenance?.totalDebt).toMatchObject({ periodEnd: end, unit: "USD", tags: expect.arrayContaining(["filing:debt-note:carrying-reconciliation"]) });
    expect(result.row.fieldConflicts?.totalDebt).toBeUndefined();
    expect(admitDebtFields(result.row, facts, "USD", observedAt, [section]).row.totalDebt).toBe(51608e6);
    expect(JSON.stringify(row)).toBe(raw);
  });

  it("records the carrying bridge and exact dated source without treating principal as carrying debt", () => {
    const parsed = reconcileDebtNoteCarrying(parserInput);
    expect(parsed).toMatchObject({ currentDebt: 7513e6, noncurrentDebt: 27555e6, carryingDebt: 35068e6, principalDebt: 35551e6, discounts: 483e6 });
    expect(parsed?.evidence).toMatchObject({ periodEnd: end, documentUrl: section.documentUrl, text: expect.stringContaining("Total recourse debt"),
      filings: [{ accn: section.accession, filed: section.filingDate, form: section.form }] });
  });

  it.each([
    ["net", "31,405 20,726", "31,406 20,726"],
    ["current", "( 6,235 ) ( 6,118 )", "( 6,236 ) ( 6,118 )"],
    ["noncurrent", "25,170 $ 14,608", "25,171 $ 14,608"],
    ["comparative", "25,170 $ 14,608", "25,170 $ 14,609"],
    ["discount", "( 427 ) ( 242 )", "( 428 ) ( 242 )"],
    ["scale", "dollars in millions", "dollars in billions"],
    ["currency", "dollars in millions", "EUR in millions"],
    ["period", "June 30, 2026 December 31, 2025", "December 31, 2025 June 30, 2026"],
    ["principal schedule", "Total $ 35,551", "Total $ 35,552"],
    ["schedule subtotal", "2027 6,184", "2027 6,185"],
    ["missing class", "Total non-recourse debt, non-current $ 2,385 $ 57", ""],
  ])("rejects an unsupported or contradictory %s instead of using a residual plug", (_name, from, to) => {
    expect(reconcileDebtNoteCarrying({ ...parserInput, text: section.text.replace(from, to) })).toBeNull();
  });

  it("requires source filing, issuer, cutoff, reporting period and currency identity", () => {
    const changes: Partial<DebtNoteCarryingInput>[] = [
      { currency: "EUR" }, { periodEnd: "2026-09-30" }, { observedAt: "2026-08-11T00:00:00Z" }, { principal: 35068e6 },
      { source: { ...section, filingDate: "2026-08-13" } }, { source: { ...section, reportDate: "2026-03-31" } },
      { source: { ...section, documentUrl: section.documentUrl.replace("/1769628/", "/1234567/") } },
      { source: { ...section, accession: "0001769628-26-000367" } },
      { principalSource: { ...parserInput.principalSource, cik: "1234567" } },
      { principalSource: { ...parserInput.principalSource, unit: "CAD" } },
    ];
    for (const change of changes) expect(reconcileDebtNoteCarrying({ ...parserInput, ...change })).toBeNull();
  });

  it("keeps missing/wrong notes, unknown leases and unrelated refusals closed", () => {
    const { facts, row } = source();
    for (const sections of [[], [{ ...section, text: "10. Debt" }], [{ ...section, accession: "0001769628-26-000367" }]]) {
      expect(admitDebtFields(row, facts, "USD", observedAt, sections).row.totalDebt).toBeNull();
    }
    for (const field of ["capitalLeaseObligations", "operatingLeaseLiability", "financeLeaseLiability"]) {
      const bad: FmpStatementRow = { ...row, [field]: null };
      if (field !== "capitalLeaseObligations") bad.capitalLeaseObligations = null;
      expect(admitDebtFields(bad, facts, "USD", observedAt, [section]).row.totalDebt).toBeNull();
    }
    for (const field of ["shortTermDebt", "longTermDebt", "totalDebt", "netDebt", "capitalLeaseObligations", "operatingLeaseLiability", "financeLeaseLiability"]) {
      const bad = { ...row, fieldConflicts: { ...row.fieldConflicts, [field]: { usable: false as const, vendorValue: 1, secValue: 2, reason: "explicit vendor conflict" } } };
      expect(admitDebtFields(bad, facts, "USD", observedAt, [section]).row.totalDebt).toBeNull();
      expect(bad.fieldConflicts[field]?.reason).toBe("explicit vendor conflict");
    }
  });

  it("does not overwrite an unconflicted observed net debt that contradicts the recovered basis", () => {
    const { facts, row } = source();
    const bad = { ...row, netDebt: 123, fieldConflicts: { ...row.fieldConflicts } };
    delete bad.fieldConflicts.netDebt;
    const out = admitDebtFields(bad, facts, "USD", observedAt, [section]).row;
    expect(out.netDebt === 123 || out.fieldConflicts?.netDebt?.usable === false).toBe(true);
    expect(bad.netDebt).toBe(123);
  });

  it.each([
    "The debt obligations shown above include all recognized operating and finance lease liabilities.",
    "The debt table includes capital lease obligations.",
  ])("refuses a financing table that explicitly includes leases: %s", (overlap) => {
    const { facts, row } = source();
    const badSection = { ...section, text: `${section.text} ${overlap}` };
    expect(reconcileDebtNoteCarrying({ ...parserInput, text: badSection.text })).toBeNull();
    expect(admitDebtFields(row, facts, "USD", observedAt, [badSection]).row.totalDebt).toBeNull();
  });

  it.each([
    "The following debt obligations and principal maturity schedule are solely those of Subsidiary A, and exclude all other consolidated subsidiaries.",
    "The following debt table contains only the parent company's obligations.",
  ])("refuses an explicitly partial issuer scope: %s", (scope) => {
    const { facts, row } = source();
    const badSection = { ...section, text: `${scope} ${section.text}` };
    expect(reconcileDebtNoteCarrying({ ...parserInput, text: badSection.text })).toBeNull();
    expect(admitDebtFields(row, facts, "USD", observedAt, [badSection]).row.totalDebt).toBeNull();
  });

  it.each(["All amounts in this debt note are in Canadian dollars.", "This debt table is presented in EUR.", "The following debt table is presented in EUR."])("refuses an explicit foreign note currency: %s", (qualification) => {
    const { facts, row } = source();
    const badSection = { ...section, text: `${qualification} ${section.text}` };
    expect(reconcileDebtNoteCarrying({ ...parserInput, text: badSection.text })).toBeNull();
    expect(admitDebtFields(row, facts, "USD", observedAt, [badSection]).row.totalDebt).toBeNull();
  });

  it("retains an explicitly USD table without inferring foreign scope from EUR-denominated instruments", () => {
    expect(reconcileDebtNoteCarrying({ ...parserInput, text: `All amounts in this debt note are in USD. ${section.text}` })?.carryingDebt).toBe(35068e6);
  });
});
