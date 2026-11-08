import { describe, expect, it } from "vitest";
import { parseDocument } from "@/edgar/extract";
import { primaryCapitalEvidence } from "@/edgar/primaryCapital";
import { withPrimaryCapitalBasis, primaryRepurchaseExecutions } from "@/pipeline/primaryCapitalBasis";
import { runStageB } from "@/pipeline/compute";
import { assembleContextPayload, serializePayloadForPrompt } from "@/pipeline/stageC/payload";
import { completeCurrencyBundle, M } from "./helpers/currencyBundle";
import { withIssuerFacts } from "./helpers/confirmedIssuer";
import { capitalIdentity, inlineCapitalHtml, capitalHtml, capitalCashTable } from "./helpers/primaryCapital";
import type { DataBundle } from "@/pipeline/types";
import type { CompanyFacts } from "@/edgar/xbrl";
import { buildDataOnlyReport } from "@/pipeline/jobRunner";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToAuditMarkdown } from "@/report/export/auditMarkdown";
import { assembleReport } from "@/pipeline/stageC/passes";
import { ReportSchema, type JudgeOutput } from "@/report/schema";
import { loadTask28Fixture } from "./helpers/task28Report";

const point = (val: number) => ({ val, start: "2025-01-01", end: "2025-12-31", accn: capitalIdentity.accession, filed: capitalIdentity.filingDate, form: "10-K", fy: 2025, fp: "FY" });
const facts = (): CompanyFacts => ({ cik: 1234567, entityName: capitalIdentity.entityName, facts: { "us-gaap": {
  PaymentsForRepurchaseOfCommonStock: { units: { USD: [point(40.2 * M)] } },
  StockRepurchasedAndRetiredDuringPeriodValue: { units: { USD: [point(40.2 * M)] } },
} } });
const cashRows = (b: DataBundle) => { if (!b.statements.cashflowAnnual.ok) throw Error("fixture"); return b.statements.cashflowAnnual.value.data.rows; };
const evidenceOf = (b: DataBundle) => { if (!b.edgar.tenKNotes?.ok) throw Error("fixture"); return b.edgar.tenKNotes.value.data.primaryCapitalEvidence!; };

function fixture(): DataBundle {
  const b = withIssuerFacts(completeCurrencyBundle({}), facts());
  const html = inlineCapitalHtml().replace("<h2>Notes", `<p>During fiscal 2025, the Company repurchased 2.0 million shares of its common stock at a total cost, including commissions and excise taxes, of $ <ix:nonFraction name="us-gaap:PaymentsForRepurchaseOfCommonStock" unitRef="usd" contextRef="annual2025" scale="6" format="ixt:num-dot-decimal">40.2</ix:nonFraction> million.</p><h2>Notes`);
  const evidence = primaryCapitalEvidence(parseDocument(html), capitalIdentity);
  b.edgar.tenKNotes = { ok: true, value: { source: "edgar", fetchedAt: capitalIdentity.observedAt, asOf: capitalIdentity.reportDate, endpoint: capitalIdentity.documentUrl,
    data: { sectionName: "tenKNotes", ...capitalIdentity, text: "Note 1. Accounting policies.", chars: 28, method: "header-regex", primaryCapitalEvidence: evidence } } };
  b.edgar.shareBasis = { basisDay: b.builtAt.slice(0, 10), splits: { asOf: b.builtAt.slice(0, 10), vendor: { status: "retrieved", source: "fmp" },
    coverage: [{ from: "2000-01-01", to: b.builtAt.slice(0, 10) }], events: [], unresolved: [], notes: [] } };
  const rows = cashRows(b);
  rows[0] = { ...rows[0], date: "2025-12-31", period: "FY", periodStart: "2025-01-01", commonStockRepurchased: null,
    fieldConflicts: { commonStockRepurchased: { vendorValue: -40 * M, secValue: -40.2 * M, usable: false, reason: "Original bulk repurchase disagreement",
      secEvidence: { source: "edgar", unit: "USD", periodStart: "2025-01-01", periodEnd: "2025-12-31", observedAt: b.builtAt,
        tags: ["us-gaap/PaymentsForRepurchaseOfCommonStock"], filings: [{ accn: capitalIdentity.accession, filed: capitalIdentity.filingDate, form: "10-K" }] } } } };
  rows[1]!.commonStockRepurchased = -20 * M; rows[2]!.commonStockRepurchased = 0;
  return b;
}

describe("shared primary capital admission", () => {
  it("withholds usable vendor cash when the primary source explicitly refuses contradictory rows", () => {
    const b = fixture(), row = cashRows(b)[0]!;
    row.commonStockRepurchased = -40 * M; delete row.fieldConflicts;
    const duplicate = capitalCashTable.replace("</table>", "<tr><td>Repurchases of common stock</td><td>(44.0)</td><td>(20.0)</td></tr></table>");
    Object.assign(evidenceOf(b), primaryCapitalEvidence(parseDocument(capitalHtml(duplicate)), capitalIdentity));
    const before = JSON.stringify(b), view = withPrimaryCapitalBasis(b);
    expect(cashRows(view)[0]!.commonStockRepurchased).toBeNull();
    expect(cashRows(view)[0]!.fieldConflicts?.commonStockRepurchased).toMatchObject({ usable: false, vendorValue: -40 * M });
    expect(view.gaps.some(g => g.field === "statements.cashflow.2025-12-31.commonStockRepurchased")).toBe(true);
    expect(withPrimaryCapitalBasis(view)).toEqual(view);
    expect(JSON.stringify(b)).toBe(before);
  });

  it("checks a plain share count against the counterpart of an inline cost concept", () => {
    const b = fixture(); if (!b.edgar.companyFacts.ok) throw Error("fixture");
    const html = inlineCapitalHtml().replaceAll("In millions", "USD in millions")
      .replace(/<ix:nonFraction name="us-gaap:StockRepurchasedAndRetiredDuringPeriodShares"[^>]*>([^<]*)<\/ix:nonFraction>/g, "$1");
    Object.assign(evidenceOf(b), primaryCapitalEvidence(parseDocument(html), capitalIdentity));
    b.edgar.companyFacts.value.data.facts["us-gaap"] = { StockRepurchasedAndRetiredDuringPeriodShares: { units: { shares: [point(3 * M)] } } };
    expect(evidenceOf(b).executions[1]!.tags).toEqual({ cost: "StockRepurchasedAndRetiredDuringPeriodValue" });
    expect(primaryRepurchaseExecutions(b, ["2025-12-31"]).rows).toEqual([]);
  });

  it("does not use tagged fallback when same-date primary presentations disagree", () => {
    const b = fixture(); if (!b.edgar.companyFacts.ok || !b.edgar.tenKNotes?.ok) throw Error("fixture");
    b.edgar.companyFacts.value.data.facts["us-gaap"]!.StockRepurchasedAndRetiredDuringPeriodShares = { units: { shares: [point(2 * M)] } };
    b.edgar.tenQNotes = structuredClone(b.edgar.tenKNotes);
    b.edgar.tenQNotes.value.data.primaryCapitalEvidence!.executions[1]!.shares = 3 * M;
    expect(primaryRepurchaseExecutions(b, ["2025-12-31"]).rows).toEqual([]);
  });

  it("retains period refusals when a newer source has unsupported stylesheet visibility", () => {
    const b = fixture(); if (!b.edgar.tenKNotes?.ok) throw Error("fixture");
    b.edgar.tenQNotes = structuredClone(b.edgar.tenKNotes);
    const value = b.edgar.tenQNotes.value;
    const identity = { ...capitalIdentity, accession: "0001234567-26-000002", filingDate: "2026-04-01", observedAt: "2026-04-02T00:00:00Z", documentUrl: capitalIdentity.documentUrl.replace("000123456726000001", "000123456726000002") };
    Object.assign(value.data, identity); value.fetchedAt = identity.observedAt;
    value.data.primaryCapitalEvidence = primaryCapitalEvidence(parseDocument(capitalHtml().replace("<body>", "<body><style>table { display: none }</style>")), identity);
    expect(value.data.primaryCapitalEvidence.refusedPeriods).toContainEqual(expect.objectContaining({ kind: "execution", periodEnd: "2025-12-31" }));
    expect(primaryRepurchaseExecutions(b, ["2025-12-31"]).rows).toEqual([]);
  });

  it("preserves a complete tagged execution when primary evidence only covers cash", () => {
    const b = fixture(); if (!b.edgar.companyFacts.ok) throw Error("fixture");
    b.edgar.companyFacts.value.data.facts["us-gaap"]!.StockRepurchasedAndRetiredDuringPeriodShares = { units: { shares: [point(2 * M)] } };
    evidenceOf(b).executions = [];
    expect(primaryRepurchaseExecutions(b, ["2025-12-31"]).rows[0]).toMatchObject({ shares: 2 * M, value: 40.2 * M, sharesTag: "StockRepurchasedAndRetiredDuringPeriodShares" });
  });

  it("does not compare a foreign-currency partial tag to a USD primary cost", () => {
    const b = fixture(); if (!b.edgar.companyFacts.ok) throw Error("fixture");
    b.edgar.companyFacts.value.data.facts["us-gaap"]!.StockRepurchasedAndRetiredDuringPeriodValue = { units: { CAD: [point(53 * M)] } };
    expect(primaryRepurchaseExecutions(b, ["2025-12-31"]).rows[0]).toMatchObject({ shares: 2 * M, value: 40.2 * M });
  });

  it("resolves cash only with a filed definition bridge while preserving original observations", () => {
    const b = fixture(), before = JSON.stringify(b), view = withPrimaryCapitalBasis(b), row = cashRows(view)[0]!;
    expect(row.commonStockRepurchased).toBe(-40 * M);
    expect(row.fieldConflicts?.commonStockRepurchased).toMatchObject({ vendorValue: -40 * M, secValue: -40.2 * M, usable: true, resolution: "primary-cash-line" });
    expect(row.fieldProvenance?.commonStockRepurchased?.tags).toEqual([]);
    expect(row.fieldProvenance?.commonStockRepurchased?.documents?.[0]?.url).toBe(capitalIdentity.documentUrl);
    expect(JSON.stringify(b)).toBe(before);
    expect(withPrimaryCapitalBasis(view)).toEqual(view);
  });

  it("refuses a previously usable vendor cash amount that contradicts the primary cash line", () => {
    const b = fixture();
    cashRows(b)[0]!.commonStockRepurchased = -41 * M;
    delete cashRows(b)[0]!.fieldConflicts;
    const before = JSON.stringify(b), row = cashRows(withPrimaryCapitalBasis(b))[0]!;
    expect(row.commonStockRepurchased).toBeNull();
    expect(row.fieldConflicts?.commonStockRepurchased).toMatchObject({ usable: false, vendorValue: -41 * M, secValue: -40 * M });
    expect(JSON.stringify(b)).toBe(before);
  });

  it.each(["missing-bridge", "different-vendor", "newer-bulk", "other-bulk-period", "other-bulk-tag"])("keeps a cash conflict refused for %s", mode => {
    const b = fixture(), conflict = cashRows(b)[0]!.fieldConflicts!.commonStockRepurchased!;
    if (mode === "missing-bridge") delete evidenceOf(b).costDisclosures;
    if (mode === "different-vendor") conflict.vendorValue = -41 * M;
    if (mode === "newer-bulk") conflict.secEvidence!.filings[0]!.filed = "2026-04-01";
    if (mode === "other-bulk-period") conflict.secEvidence!.periodStart = "2024-01-01";
    if (mode === "other-bulk-tag") conflict.secEvidence!.tags = ["PaymentsForRepurchaseOfPreferredStock"];
    const row = cashRows(withPrimaryCapitalBasis(b))[0]!;
    expect(row.commonStockRepurchased).toBeNull();
    expect(row.fieldConflicts?.commonStockRepurchased?.usable).toBe(false);
  });

  it.each(["wrong-issuer", "wrong-url", "future-observation", "wrong-accession", "wrong-currency", "wrong-period", "ambiguous-primary"])("refuses primary admission for %s", mode => {
    const b = fixture(), evidence = evidenceOf(b);
    if (mode === "wrong-issuer") evidence.source.cik = "7654321";
    if (mode === "wrong-url") evidence.source.documentUrl = evidence.source.documentUrl.replace("example.htm", "other.htm");
    if (mode === "future-observation") evidence.source.observedAt = "2027-01-01T00:00:00Z";
    if (mode === "wrong-accession") evidence.source.accession = "0001234567-26-000002";
    if (mode === "wrong-currency") { evidence.cash.forEach(x => x.currency = "CAD"); evidence.executions.forEach(x => x.currency = "CAD"); }
    if (mode === "wrong-period") { evidence.cash.forEach(x => x.periodStart = "2025-07-01"); evidence.executions.forEach(x => x.periodStart = "2025-07-01"); }
    if (mode === "ambiguous-primary") { evidence.cash.push({ ...evidence.cash[0]!, amount: 42 * M }); evidence.executions.push({ ...evidence.executions[1]!, cost: 42 * M }); }
    expect(cashRows(withPrimaryCapitalBasis(b))[0]!.commonStockRepurchased).toBeNull();
    expect(primaryRepurchaseExecutions(b, ["2025-12-31"]).rows).toEqual([]);
  });

  it("uses exact executed shares and their separate cost with the established split factor", () => {
    const b = fixture();
    expect(primaryRepurchaseExecutions(b, ["2025-12-31"]).rows[0]).toMatchObject({ shares: 2 * M, value: 40.2 * M, basisFactor: 1 });
    b.edgar.shareBasis!.splits.events.push({ date: "2026-05-01", ratio: 2, tagged: 2, evidence: null, contextDates: [], announced: null,
      firstAdjustedSession: "2026-05-01", sessionWindow: { from: "2026-05-01", to: "2026-05-01" }, legalFrom: "2026-05-01", sources: ["vendor"] });
    expect(primaryRepurchaseExecutions(b, ["2025-12-31"]).rows[0]).toMatchObject({ shares: 4 * M, value: 40.2 * M, basisFactor: 2 });
    b.edgar.shareBasis = undefined;
    expect(primaryRepurchaseExecutions(b, ["2025-12-31"]).rows).toEqual([]);
  });

  it("preserves valid tagged pairs and refuses a contradictory tagged share or cost", () => {
    const b = fixture(); if (!b.edgar.companyFacts.ok) throw Error("fixture");
    const tags = b.edgar.companyFacts.value.data.facts["us-gaap"]!;
    tags.StockRepurchasedAndRetiredDuringPeriodShares = { units: { shares: [point(2 * M)] } };
    expect(primaryRepurchaseExecutions(b, ["2025-12-31"]).rows[0]?.sharesTag).toBe("StockRepurchasedAndRetiredDuringPeriodShares");
    tags.StockRepurchasedAndRetiredDuringPeriodShares = { units: { shares: [point(3 * M)] } };
    expect(primaryRepurchaseExecutions(b, ["2025-12-31"]).rows).toEqual([]);
    delete tags.StockRepurchasedAndRetiredDuringPeriodShares;
    tags.StockRepurchasedAndRetiredDuringPeriodValue = { units: { USD: [point(45 * M)] } };
    expect(primaryRepurchaseExecutions(b, ["2025-12-31"]).rows).toEqual([]);
  });

  it("does not mix an unpaired rounded treasury count with the exact retired-share definition", () => {
    const b = fixture(); if (!b.edgar.companyFacts.ok) throw Error("fixture");
    b.edgar.companyFacts.value.data.facts["us-gaap"]!.TreasuryStockSharesAcquired = { units: { shares: [point(1.9 * M)] } };
    const rows = primaryRepurchaseExecutions(b, ["2025-12-31"]).rows;
    expect(rows[0]?.shares).toBe(2 * M);
    expect(rows[0]?.primaryEvidence?.record.tags).toEqual({ shares: "StockRepurchasedAndRetiredDuringPeriodShares", cost: "StockRepurchasedAndRetiredDuringPeriodValue" });
  });

  it("does not resurrect an older execution pair behind a newer conflicting primary filing", () => {
    const b = fixture(); if (!b.edgar.tenKNotes?.ok) throw Error("fixture");
    b.edgar.tenQNotes = structuredClone(b.edgar.tenKNotes);
    const value = b.edgar.tenQNotes.value;
    Object.assign(value.data, { accession: "0001234567-26-000002", filingDate: "2026-04-01", documentUrl: capitalIdentity.documentUrl.replace("000123456726000001", "000123456726000002") });
    value.fetchedAt = "2026-04-02T00:00:00Z";
    Object.assign(value.data.primaryCapitalEvidence!.source, { accession: value.data.accession, filingDate: value.data.filingDate, documentUrl: value.data.documentUrl, observedAt: value.fetchedAt });
    value.data.primaryCapitalEvidence!.executions.push({ ...value.data.primaryCapitalEvidence!.executions[1]!, shares: 3 * M });
    expect(primaryRepurchaseExecutions(b, ["2025-12-31"]).rows).toEqual([]);
  });

  it("retains the refusal of a newer primary filing whose contradictory rows were all discarded", () => {
    const b = fixture(); if (!b.edgar.tenKNotes?.ok) throw Error("fixture");
    b.edgar.tenQNotes = structuredClone(b.edgar.tenKNotes);
    const v = b.edgar.tenQNotes.value, e = v.data.primaryCapitalEvidence!;
    Object.assign(v.data, { accession: "0001234567-26-000002", filingDate: "2026-04-01", documentUrl: capitalIdentity.documentUrl.replace("000123456726000001", "000123456726000002") });
    v.fetchedAt = "2026-04-02T00:00:00Z";
    Object.assign(e.source, { accession: v.data.accession, filingDate: v.data.filingDate, documentUrl: v.data.documentUrl, observedAt: v.fetchedAt });
    e.cash = []; e.executions = []; e.refusedPeriods = [{ periodEnd: "2025-12-31", kind: "cash", reason: "contradictory rows" }, { periodEnd: "2025-12-31", kind: "execution", reason: "contradictory rows" }];
    expect(primaryRepurchaseExecutions(b, ["2025-12-31"]).rows).toEqual([]);
    expect(cashRows(withPrimaryCapitalBasis(b))[0]!.commonStockRepurchased).toBeNull();
  });

  it("carries the same financial evidence into calculated capital, analyst cells and prompt citations", () => {
    const b = fixture(), before = JSON.stringify(b), c = runStageB(b);
    expect(c.capital.buybackPriceAnalysis.totalRepurchased).toBe(60 * M);
    const p = assembleContextPayload(b, c, { checks: [], flags: [], gaps: [] });
    const cash = p.statements.find(s => s.title === "Cash flow — annual");
    expect(cash?.lineItems.find(l => l.lineItem === "buybacks (negative)")?.byPeriod[0]?.value).toBe(-40 * M);
    const prompt = serializePayloadForPrompt(p);
    expect(prompt).toContain("primary equity repurchase cost");
    expect(prompt).toContain(capitalIdentity.documentUrl);
    expect(p.provenanceRegistry?.some(r => r.value === 2 * M && r.id.includes("primary-repurchase-shares"))).toBe(true);
    expect(JSON.stringify(b)).toBe(before);
  });

  it("removes only resolved cash warnings from both report assembly paths", () => {
    const b = fixture(), old = { field: "statements.cashflow.2025-12-31.commonStockRepurchased", reason: cashRows(b)[0]!.fieldConflicts!.commonStockRepurchased!.reason, severity: "warn" as const };
    const unrelated = { ...old, reason: "Independent unresolved history qualification" };
    b.gaps.push(old, unrelated);
    const before = JSON.stringify(b), computed = runStageB(b);
    const dataOnly = buildDataOnlyReport({ symbol: b.symbol, companyName: capitalIdentity.entityName, generatedAt: b.builtAt, model: "none", costUsd: 0,
      bundle: b, computed, validation: { checks: [], flags: [], gaps: [old] }, costBreakdown: [], reason: "Synthetic verification" });
    const judge = loadTask28Fixture() as JudgeOutput;
    const analyst = assembleReport({ symbol: b.symbol, bundle: b, computed, judgeOutput: judge, model: "synthetic", costEntries: [], validationGaps: [old], verify: { verificationRate: null, log: [] } }, b.builtAt);
    for (const report of [dataOnly, analyst]) {
      expect(report.appendix.missingData).not.toContainEqual(old);
      expect(report.appendix.missingData).toContainEqual(unrelated);
      expect(reportToAuditMarkdown(report)).not.toContain(old.reason);
    }
    expect(JSON.stringify(b)).toBe(before);
  });

  it.each([1, 2])("retains bounded exact proofs without a timing grade on split factor %s", factor => {
    const b = fixture();
    if (factor === 2) b.edgar.shareBasis!.splits.events.push({ date: "2026-05-01", ratio: 2, tagged: 2, evidence: null, contextDates: [], announced: null,
      firstAdjustedSession: "2026-05-01", sessionWindow: { from: "2026-05-01", to: "2026-05-01" }, legalFrom: "2026-05-01", sources: ["vendor"] });
    const computed = runStageB(b), payload = assembleContextPayload(b, computed, { checks: [], flags: [], gaps: [] });
    expect(computed.capital.buybackPriceAnalysis.timingPct).toBeNull();
    expect(payload.primaryCapitalEvidence?.executions).toContainEqual(expect.objectContaining({ filedShares: 2 * M, shares: factor * 2 * M, cost: 40.2 * M, basisFactor: factor,
      source: capitalIdentity, proof: evidenceOf(b).executions[1]!.proof }));
    if (factor === 2) expect(payload.provenanceRegistry?.some(r => r.id.includes("primary-filed-repurchase-shares") && r.value === 2 * M)).toBe(true);
    expect(payload.primaryCapitalEvidence?.cash[0]?.proof).toEqual(evidenceOf(b).cash[0]!.proof);
    const prompt = serializePayloadForPrompt(payload);
    expect(prompt).toContain("original-html-characters");
    expect(prompt).toContain(capitalIdentity.accession);
    const dataOnly = buildDataOnlyReport({ symbol: b.symbol, companyName: capitalIdentity.entityName, generatedAt: b.builtAt, model: "none", costUsd: 0,
      bundle: b, computed, validation: { checks: [], flags: [], gaps: [] }, costBreakdown: [], reason: "Synthetic verification" });
    const analyst = assembleReport({ symbol: b.symbol, bundle: b, computed, judgeOutput: loadTask28Fixture() as JudgeOutput, model: "synthetic", costEntries: [], verify: { verificationRate: null, log: [] } }, b.builtAt);
    for (const report of [dataOnly, analyst]) {
      expect(ReportSchema.parse(report).primaryCapitalEvidence).toEqual(payload.primaryCapitalEvidence);
      for (const markdown of [reportToMarkdown(report), reportToAuditMarkdown(report)]) {
        expect(markdown).toContain("2000000");
        expect(markdown).toContain("40200000");
        expect(markdown).toContain(capitalIdentity.accession);
      }
      const audit = reportToAuditMarkdown(report);
      expect(audit).toContain("original-html-characters");
      expect(audit).toContain(String(evidenceOf(b).executions[1]!.proof.row.start));
    }
  });

  it("keeps incomplete older-year history and timing grades refused", () => {
    const b = fixture();
    cashRows(b)[2] = { ...cashRows(b)[2], commonStockRepurchased: null, fieldConflicts: { commonStockRepurchased: { usable: false, vendorValue: -13 * M, secValue: -15 * M, reason: "Unresolved older year" } } };
    const c = runStageB(b);
    expect(c.capital.buybackPriceAnalysis.totalRepurchased).toBe(60 * M);
    expect(c.capital.buybackPriceAnalysis.timingPct).toBeNull();
    expect(c.capital.buybackPriceAnalysis.timingCoveragePct).toBeNull();
    expect(c.gaps.some(g => g.field === "capital.buybackPriceAnalysis.coverage" && g.reason.includes("2023-12-31"))).toBe(true);
  });

  it("traces a measured timing signal and exported primary facts to their actual source", () => {
    const b = fixture();
    if (!b.statements.incomeAnnual.ok) throw Error("fixture");
    for (const row of b.statements.incomeAnnual.value.data.rows) row.weightedAverageShsOut = 10 * M;
    const rows = Array.from({ length: 731 }, (_, n) => ({ date: new Date(Date.UTC(2024, 0, 1) + n * 86_400_000).toISOString().slice(0, 10), marketCap: 250 * M }));
    b.marketCapHistory = { ok: true, value: { source: "fmp", endpoint: "synthetic market history", asOf: "2025-12-31", fetchedAt: b.builtAt, data: { rows, raw: rows } } };
    const c = runStageB(b), timing = c.scores.aspects.leadership.signals?.find(s => s.id === "buybackTiming");
    expect(c.capital.buybackPriceAnalysis.timingPct).toBeCloseTo(24.3781094527363, 8);
    expect(timing?.operands.some(o => o.value === 20.1 && o.source === capitalIdentity.documentUrl)).toBe(true);
    const report = buildDataOnlyReport({ symbol: b.symbol, companyName: capitalIdentity.entityName, generatedAt: b.builtAt, model: "none", costUsd: 0,
      bundle: b, computed: c, validation: { checks: [], flags: [], gaps: [] }, costBreakdown: [], reason: "Synthetic verification" });
    const markdown = reportToMarkdown(report), audit = reportToAuditMarkdown(report);
    expect(markdown).toContain("primary equity statement");
    expect(markdown).toContain("cash outflow");
    expect(markdown.replace(/\\([:._])/g, "$1")).toContain(capitalIdentity.documentUrl);
    expect(audit.replace(/\\([:._])/g, "$1")).toContain(capitalIdentity.documentUrl);
    expect(audit).toContain("20.1");
  });
});
