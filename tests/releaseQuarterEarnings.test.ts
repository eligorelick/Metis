import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import { describe, expect, it } from "vitest";
import { withReleaseQuarterEarnings } from "@/pipeline/releaseQuarterEarnings";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { buildEarningsReleaseRecord, CURRENT_REPORTS_VERSION } from "@/providers/currentReports";
function fixture() {
  const b = completeCurrencyBundle({ symbol: "SYNTH" });
  if (!b.profile.ok || !b.statements.incomeQuarterly.ok) throw Error("fixture");
  b.profile.value.data.rows[0]!.isAdr = false;
  b.edgar.cik = { ok: true, value: { data: { cik: 1, cik10: "0000000001", ticker: "SYNTH", title: "Synthetic" }, source: "edgar", endpoint: "fixture", asOf: "2026-01-01", fetchedAt: b.builtAt } };
  b.edgar.registrant = { cik10: "0000000001", name: "Synthetic", tickers: ["SYNTH"], exchanges: [], forms: ["8-K"], sic: null, sicDescription: null, fiscalYearEnd: "1231", stateOfIncorporation: null };
  b.edgar.shareBasis = { basisDay: b.builtAt.slice(0, 10), splits: { asOf: b.builtAt.slice(0, 10), vendor: { status: "retrieved", source: "fixture" },
    coverage: [{ from: "2025-01-01", to: b.builtAt.slice(0, 10) }], events: [], unresolved: [], notes: [] } };
  const point = { start: "2025-10-01", end: "2025-12-31", val: -30e6, filed: "2026-02-01", form: "10-Q", fp: "Q4", fy: 2025, accn: "0000000001-26-000002" };
  b.edgar.companyFacts = { ok: true, value: { source: "edgar", endpoint: "fixture", asOf: "2026-02-01", fetchedAt: b.builtAt,
    data: { cik: 1, entityName: "Synthetic", facts: { "us-gaap": { NetIncomeLoss: { units: { USD: [point] } }, Revenues: { units: { USD: [{ ...point, val: 100e6 }] } } } } } } };
  b.statements.incomeQuarterly.value.data.rows = [{ cik: "1", date: "2025-12-31", period: "Q4", reportedCurrency: "USD", netIncome: -30e6, eps: -2.8, epsDiluted: -2.7, weightedAverageShsOut: 11e6, weightedAverageShsOutDil: 12e6 }];
  const r = buildEarningsReleaseRecord({ filing: { accessionNumber: "0000000001-26-000001", filingDate: "2026-02-01" }, releaseUrl: "https://www.sec.gov/Archives/edgar/data/1/000000000126000001/earnings.htm", commentaryUrl: null, releaseText: "Net income was $20 million.", commentaryText: null, includeNarrative: false });
  r.quarterlyEarnings = [{ months: 3, symbol: "$", periodEnd: "2025-12-31", netIncome: -30e6, eps: -3, epsDiluted: -3, weightedAverageShsOut: 10e6, weightedAverageShsOutDil: 10e6,
    source: { form: "8-K", accession: r.accession, filingDate: r.filingDate, exhibit: "EX-99.1", url: r.releaseUrl } }];
  b.edgar.currentReports = { ok: true, value: { data: { version: CURRENT_REPORTS_VERSION, releases: [r], events: [], notes: [] }, source: "edgar", endpoint: "fixture", asOf: "2026-02-01", fetchedAt: b.builtAt } };
  return b;
}
describe("filed release quarter admission", () => {
  it("corrects the loss quarter with exact-period consolidated earnings while keeping original observations", () => {
    const b = fixture(), before = JSON.stringify(b);
    const result = withReleaseQuarterEarnings(b).statements.incomeQuarterly;
    expect(result.ok && result.value.data.rows[0]).toMatchObject({ epsDiluted: -3, weightedAverageShsOutDil: 10e6,
      fieldConflicts: { epsDiluted: { vendorValue: -2.7, secValue: -3, usable: true } } });
    expect(buildFilingDisclosures(b)?.quarterlyTrend.find(r => r.periodEnd === "2025-12-31")?.epsDiluted).toBe(-3);
    expect(JSON.stringify(b)).toBe(before);
  });
  it.each([undefined, "2025-10-01"])("admits missing or matching explicit quarter start %s using SEC interval proof", periodStart => {
    const b = fixture(); if (!b.statements.incomeQuarterly.ok) throw Error("fixture");
    b.statements.incomeQuarterly.value.data.rows[0]!.periodStart = periodStart;
    const out = withReleaseQuarterEarnings(b).statements.incomeQuarterly;
    expect(out.ok && out.value.data.rows[0]?.fieldProvenance?.epsDiluted?.periodStart).toBe("2025-10-01");
  });
  it("admits proved CAD dollar currency without treating the glyph as USD", () => {
    const b = fixture(); if (!b.statements.incomeQuarterly.ok || !b.edgar.companyFacts.ok) throw Error("fixture");
    b.statements.incomeQuarterly.value.data.rows[0]!.reportedCurrency = "CAD";
    for (const raw of Object.values(b.edgar.companyFacts.value.data.facts["us-gaap"]!)) {
      const concept = raw as { units: Record<string, unknown[]> };
      concept.units.CAD = concept.units.USD!; delete concept.units.USD;
    }
    const out = withReleaseQuarterEarnings(b).statements.incomeQuarterly;
    expect(out.ok && out.value.data.rows[0]?.fieldProvenance?.epsDiluted?.unit).toBe("CAD/shares");
  });
  it("preserves the original vendor conflict through a later source admission", () => {
    const b = fixture(); if (!b.statements.incomeQuarterly.ok) throw Error("fixture");
    b.statements.incomeQuarterly.value.data.rows[0]!.fieldConflicts = { epsDiluted: { usable: true, vendorValue: -1, secValue: -2.7, resolution: "filed-line", reason: "prior source admission" } };
    const out = withReleaseQuarterEarnings(b).statements.incomeQuarterly;
    expect(out.ok && out.value.data.rows[0]?.fieldConflicts?.epsDiluted?.vendorValue).toBe(-1);
    expect(out.ok && out.value.data.rows[0]?.fieldConflicts?.epsDiluted?.reason).toContain("prior source admission");
  });
  it("preserves current-basis earnings when a split trades after the release despite its earlier accounting context", () => {
    const b = fixture(); if (!b.edgar.shareBasis || !b.statements.incomeQuarterly.ok) throw Error("fixture");
    Object.assign(b.statements.incomeQuarterly.value.data.rows[0]!, { eps: -1.5, epsDiluted: -1.5, weightedAverageShsOut: 20e6, weightedAverageShsOutDil: 20e6 });
    b.edgar.shareBasis.splits.events = [{ date: "2026-01-15", ratio: 2, tagged: 2, evidence: 2, contextDates: ["2026-01-15"], announced: "2026-01-16",
      firstAdjustedSession: "2026-02-17", sessionWindow: { from: "2026-02-17", to: "2026-02-17" }, legalFrom: "2026-02-10", sources: ["edgar", "vendor"] }];
    const before = JSON.stringify(b);
    const out = withReleaseQuarterEarnings(b).statements.incomeQuarterly;
    expect(out.ok && out.value.data.rows[0]).toEqual(b.statements.incomeQuarterly.value.data.rows[0]);
    expect(JSON.stringify(b)).toBe(before);
  });
  it.each(["missing", "unavailable", "incomplete", "ambiguous", "earlierBasis"] as const)("preserves vendor earnings when release split basis is %s", kind => {
    const b = fixture(); if (!b.edgar.shareBasis || !b.statements.incomeQuarterly.ok) throw Error("fixture");
    if (kind === "unavailable") b.edgar.shareBasis.splits.vendor = { status: "unavailable", source: "fixture", reason: "missing history" };
    if (kind === "incomplete") b.edgar.shareBasis.splits.coverage = [{ from: "2026-02-02", to: b.builtAt.slice(0, 10) }];
    if (kind === "ambiguous") b.edgar.shareBasis.splits.events = [{ date: "2026-01-15", ratio: 2, tagged: 2, evidence: 2, contextDates: ["2026-01-15"], announced: "2026-01-16",
      firstAdjustedSession: "2026-02-03", sessionWindow: { from: "2026-02-03", to: "2026-02-03" }, legalFrom: "2026-01-30", sources: ["edgar", "vendor"] }];
    if (kind === "earlierBasis") b.edgar.shareBasis.basisDay = "2026-01-31";
    if (kind === "missing") delete b.edgar.shareBasis;
    const before = JSON.stringify(b);
    const out = withReleaseQuarterEarnings(b).statements.incomeQuarterly;
    expect(out.ok && out.value.data.rows[0]).toEqual(b.statements.incomeQuarterly.value.data.rows[0]);
    expect(JSON.stringify(b)).toBe(before);
  });
  it("uses the release filing basis for statement averages published after a completed split", () => {
    const b = fixture(); if (!b.edgar.shareBasis) throw Error("fixture");
    b.edgar.shareBasis.splits.events = [{ date: "2026-01-15", ratio: 2, tagged: 2, evidence: 2, contextDates: ["2026-01-15"], announced: "2026-01-16",
      firstAdjustedSession: "2026-01-20", sessionWindow: { from: "2026-01-20", to: "2026-01-20" }, legalFrom: "2026-01-13", sources: ["edgar", "vendor"] }];
    const out = withReleaseQuarterEarnings(b).statements.incomeQuarterly;
    expect(out.ok && out.value.data.rows[0]).toMatchObject({ epsDiluted: -3, weightedAverageShsOutDil: 10e6 });
  });
  it.each(["issuer", "currency", "wrongCurrency", "noFacts", "ambiguousCurrency", "factCurrencyMismatch", "duration", "income", "future", "source", "refusal", "adr"])("does not repair incompatible %s", kind => {
    const b = fixture(); if (!b.edgar.currentReports?.ok || !b.statements.incomeQuarterly.ok || !b.profile.ok) throw Error("fixture");
    const fact = b.edgar.currentReports.value.data.releases[0]!.quarterlyEarnings![0]!, row = b.statements.incomeQuarterly.value.data.rows[0]!;
    if (kind === "issuer") row.cik = "2";
    if (kind === "currency") row.reportedCurrency = null;
    if (kind === "wrongCurrency") row.reportedCurrency = "EUR";
    if (kind === "noFacts") b.edgar.companyFacts = { ok: false, gap: { field: "fixture", reason: "missing", severity: "info" } };
    if (kind === "ambiguousCurrency" && b.edgar.companyFacts.ok) {
      for (const raw of Object.values(b.edgar.companyFacts.value.data.facts["us-gaap"]!)) {
        const concept = raw as { units: Record<string, unknown[]> };
        concept.units.CAD = concept.units.USD!;
      }
    }
    if (kind === "factCurrencyMismatch") row.reportedCurrency = "CAD";
    if (kind === "duration") row.periodStart = "2025-01-01";
    if (kind === "income") row.netIncome = -50e6;
    if (kind === "future") fact.source!.filingDate = "2027-02-01";
    if (kind === "source") fact.source!.url = "https://example.com/earnings.htm";
    if (kind === "refusal") row.fieldConflicts = { epsDiluted: { usable: false, vendorValue: -2.7, secValue: null, reason: "split unknown" } };
    if (kind === "adr") b.profile.value.data.rows[0]!.isAdr = true;
    const out = withReleaseQuarterEarnings(b).statements.incomeQuarterly;
    expect(out.ok && out.value.data.rows[0]?.epsDiluted).toBe(-2.7);
  });
});
