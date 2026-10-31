import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { StatementFieldProvenance } from "@/providers/fmp";
import { currencyBundle } from "./helpers/currencyBundle";
import { withIssuerFacts } from "./helpers/confirmedIssuer";

// Deliberately synthetic dates and QNames; the actual retained report-53 rows are unavailable.
const ends = ["2025-12-31", "2024-12-31"];
const total = "us-gaap/ReceivablesNetCurrent";
const trade = "us-gaap/AccountsReceivableNetCurrent";
const observedAt = "2026-03-01T12:00:00Z";
const evidence = (end: string, tag: string): StatementFieldProvenance => ({ source: "edgar", unit: "USD", periodStart: null, periodEnd: end, observedAt,
  tags: [tag], filings: [{ accn: "0000000001-26-000001", filed: "2026-02-15", form: "10-K" }] });
function fixture(confirmed = true) {
  const b = currencyBundle();
  if (!b.statements.balanceAnnual.ok || !b.statements.incomeAnnual.ok) throw new Error("fixture requires annual statements");
  b.statements.balanceAnnual.value.data.rows.slice(0, 2).forEach((r, i) => Object.assign(r, { cik: "1", netReceivables: [4315e6, 2347e6][i],
    fieldProvenance: { netReceivables: evidence(ends[i], i === 0 ? total : trade) } }));
  b.statements.incomeAnnual.value.data.rows.slice(0, 2).forEach((r, i) => r.revenue = [44284e6, 38962e6][i]);
  const f: CompanyFacts = { cik: 1, entityName: "Synthetic", facts: { "us-gaap": { ReceivablesNetCurrent: { units: { USD: ends.map((end, i) => ({
    end, val: [4315e6, 3929e6][i], accn: "0000000001-26-000001", filed: "2026-02-15", form: "10-K",
  })) } } } } };
  withIssuerFacts(b, f, confirmed);
  if (b.edgar.companyFacts?.ok) b.edgar.companyFacts.value.fetchedAt = observedAt;
  return b;
}
function freeze(v: unknown): void { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } }

describe("compute receivables evidence integration", () => {
  it("preserves provenance through compute and applies an issuer-confirmed whole pair without changing raw inputs or capital", () => {
    const b = fixture(); const before = JSON.stringify(b); freeze(b);
    const result = runStageB(b);
    expect(result.forensics.beneish?.indices.dsri).toBeCloseTo((4315/44284)/(3929/38962), 12);
    expect(result.forensics.flags.some(f => f.id === "receivables-vs-revenue" || f.id === "dsri-elevated")).toBe(false);
    expect(JSON.stringify(b)).toBe(before);
    const unconfirmed = runStageB(fixture(false));
    expect(unconfirmed.forensics.beneish?.neutralized).toContain("DSRI");
    expect(result.valuation).toEqual(unconfirmed.valuation);
    expect(result.forensics.altman).toEqual(unconfirmed.forensics.altman);
    expect(result.forensics.accruals).toEqual(unconfirmed.forensics.accruals);
  });

  it.each(["missing-acquisition", "wrong-cik", "one-day", "currency", "cutoff"])("does not repair using %s evidence", kind => {
    const b = fixture();
    if (!b.edgar.companyFacts?.ok || !b.statements.balanceAnnual.ok) throw new Error("fixture");
    if (kind === "missing-acquisition") b.edgar.companyFacts.value.fetchedAt = "";
    if (kind === "wrong-cik") b.edgar.companyFacts.value.data.cik = 2;
    if (kind === "one-day") b.statements.balanceAnnual.value.data.rows[1].date = "2024-12-30";
    if (kind === "currency") {
      b.statements.balanceAnnual.value.data.rows[1].reportedCurrency = undefined;
      b.statements.balanceAnnual.value.data.rows[1].fieldProvenance!.netReceivables.unit = "";
    }
    if (kind === "cutoff") b.edgar.companyFacts.value.fetchedAt = "2026-08-01T12:00:00Z";
    const result = runStageB(b);
    expect(result.forensics.beneish?.neutralized).toContain("DSRI");
    expect(result.forensics.flags.some(f => f.id === "receivables-vs-revenue")).toBe(false);
  });

  it("retains alias conflicts through compute instead of silently reusing the numbers", () => {
    const b = fixture(false);
    if (!b.statements.balanceAnnual.ok) throw new Error("fixture");
    b.statements.balanceAnnual.value.data.rows.forEach(r => {
      r.fieldProvenance = undefined;
      r.fieldConflicts = { netReceivables: { vendorValue: r.netReceivables ?? null, secValue: null, usable: false, reason: "alias conflict" } };
    });
    expect(runStageB(b).forensics.beneish?.neutralized).toContain("DSRI");
  });
});


it("repairs using explicit provenance currency when row currency labels are absent", () => {
  const b = fixture();
  if (!b.statements.balanceAnnual.ok || !b.statements.incomeAnnual.ok) throw new Error("fixture");
  // Preserve the separate upstream currency gate: matching filing identity
  // establishes the unlabelled balance rows from labelled income siblings.
  b.statements.balanceAnnual.value.data.rows.forEach(r => { r.reportedCurrency = undefined; r.acceptedDate = "2026-02-15 16:00:00"; });
  b.statements.incomeAnnual.value.data.rows.slice(0, 2).forEach(r => { r.cik = "1"; r.acceptedDate = "2026-02-15 16:00:00"; });
  expect(runStageB(b).forensics.beneish?.indices.dsri).toBeCloseTo((4315/44284)/(3929/38962), 12);
});


it("preserves the upstream currency refusal without filing identity instead of admitting whole rows from receivables alone", () => {
  const b = fixture();
  if (!b.statements.balanceAnnual.ok) throw new Error("fixture");
  b.statements.balanceAnnual.value.data.rows.forEach(r => r.reportedCurrency = undefined);
  const result = runStageB(b);
  expect(result.forensics.beneish?.neutralized).toContain("DSRI");
  expect(result.forensics.flags.some(f => f.id === "receivables-vs-revenue")).toBe(false);
});

it("retains newer selected primary evidence against an older incomplete companyfacts copy collection", () => {
  const b = fixture();
  if (!b.statements.balanceAnnual.ok) throw new Error("fixture");
  const current = b.statements.balanceAnnual.value.data.rows[0];
  current.netReceivables = 5000e6;
  current.fieldProvenance!.netReceivables.filings = [{ accn: "later", filed: "2026-02-16", form: "10-K/A" }];
  const before = JSON.stringify(b); freeze(b);
  const result = runStageB(b);
  expect(result.forensics.beneish?.neutralized).toContain("DSRI");
  expect(result.forensics.flags.some(f => f.id === "receivables-vs-revenue")).toBe(false);
  expect(result.forensics.gaps.find(g => g.field === "forensics.flags.receivables")?.reason).toContain("no complete eligible");
  expect(JSON.stringify(b)).toBe(before);
});

it("does not compare a nonmonetary field when missing row labels pass the unchanged filing-linked currency gate", () => {
  const b = fixture();
  if (!b.statements.balanceAnnual.ok || !b.statements.incomeAnnual.ok) throw new Error("fixture");
  b.statements.balanceAnnual.value.data.rows.forEach(r => { r.reportedCurrency = undefined; r.acceptedDate = "2026-02-15 16:00:00"; });
  b.statements.incomeAnnual.value.data.rows.slice(0, 2).forEach(r => { r.cik = "1"; r.acceptedDate = "2026-02-15 16:00:00"; });
  b.statements.balanceAnnual.value.data.rows[0].fieldProvenance!.netReceivables.unit = "shares";
  b.statements.balanceAnnual.value.data.rows[1].fieldProvenance!.netReceivables.tags = [total];
  const result = runStageB(b);
  expect(result.forensics.beneish?.neutralized).toContain("DSRI");
  expect(result.forensics.flags.some(f => f.id === "receivables-vs-revenue")).toBe(false);
  expect(result.forensics.gaps.find(g => g.field === "forensics.flags.receivables")?.reason).toContain("no complete eligible");
});
