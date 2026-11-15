/**
 * D-282..D-285 (release items R1-R5, R8): a report never shows as fact a
 * statement that conflicts with its record, every model-written statement or
 * paragraph carries a plain mark, the value-only figure check reads only
 * code-owned evidence, a grid parameter is not a conflict with the headline
 * record, and a whole-feed news citation names one article or is removed.
 * Several issuer shapes (a per-share value, a WACC percentage, a bank grid,
 * a news-heavy issuer) and controls where each rule must not fire.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ReportView } from "@/components/report/ReportView";
import { runVerifyPass, type PassDeps } from "@/pipeline/stageC/passes";
import { reciteFeedClaims, type ContextPayload, type PayloadNewsArticle } from "@/pipeline/stageC/payload";
import { matchProvenanceRecord, type NumericProvenanceRecord } from "@/pipeline/stageC/provenance";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { citedMark, MODEL_PROSE_MARK, sourceLabel, withModelProseMarks } from "@/report/presentation";
import { ReportSchema, type Report, type SourcedClaim, type VerificationLogEntry } from "@/report/schema";
import { claimStatusMarkText, claimTag, FACT_STATUS_LEGEND, indexVerificationMarks } from "@/report/verificationMarks";
import { loadTask28Fixture } from "./helpers/task28Report";

const record = (over: Partial<NumericProvenanceRecord> = {}): NumericProvenanceRecord => ({
  id: "computed.valuation.dcf-per-share", kind: "computed", value: 124.1778, unit: "currency-per-share", currency: "USD",
  period: null, asOf: "2026-10-28", origin: "computed.valuation", formulaVersion: null, displayPrecision: 4, label: "DCF value per share", ...over,
});
const payload = (records: NumericProvenanceRecord[], extra: Partial<ContextPayload> = {}): ContextPayload => ({ provenanceRegistry: records, citationRegistry: [], filings: [],
  companyName: "Example", symbol: "EX", leadership: { notes: [], figures: [] }, news: { title: "news", figures: [], notes: [] }, ...extra } as unknown as ContextPayload);

describe("D-282: a value conflict is not hidden by a wrong cited date (P19, A1)", () => {
  const candidate = (value: number, asOf: string, over: Partial<NumericProvenanceRecord> & { periodStated?: boolean } = {}) => ({
    value, unit: over.unit ?? "currency-per-share", currency: over.currency === undefined ? "USD" : over.currency, period: over.period ?? null, asOf,
    source: over.id ?? "computed.valuation.dcf-per-share", ...(over.periodStated === undefined ? {} : { periodStated: over.periodStated }),
  });
  // A trailing-twelve-month record that names its window, and an annual figure for an earlier fiscal year.
  const ttmFcf = record({ id: "computed.capital.current.fcf-before-sbc", label: "FCF before SBC", value: 52_300_000_000, unit: "currency",
    period: "ttm: 2025-01-01 to 2025-12-31", periodContext: { kind: "duration", start: "2025-01-01", end: "2025-12-31", basis: "rolling-12-month" }, asOf: "2025-12-31" });

  it("keeps an annual figure stated without a period, against a newer TTM record, a date mismatch, never contradicted (review round 1)", () => {
    // The verify pass gives an unstated period the record's own (passes.ts); that adopted window establishes nothing.
    expect(matchProvenanceRecord(candidate(46_109_000_000, "2024-12-31", { id: ttmFcf.id, unit: "currency", period: ttmFcf.period, periodStated: false }), [ttmFcf])).toMatchObject({ ok: false, reason: "date-mismatch" });
    expect(matchProvenanceRecord(candidate(46_109_000_000, "2024-12-31", { id: ttmFcf.id, unit: "currency", period: ttmFcf.period }), [ttmFcf])).toMatchObject({ ok: false, reason: "date-mismatch" });
  });

  it("calls a conflict contradicted when the figure states its window and the record names one (control)", () => {
    expect(matchProvenanceRecord(candidate(46_109_000_000, "2026-01-30", { id: ttmFcf.id, unit: "currency", period: ttmFcf.period, periodStated: true }), [ttmFcf])).toMatchObject({ ok: false, reason: "value-mismatch" });
  });

  it("never overrides a date mismatch when neither side establishes a window, even at a different value (review round 1)", () => {
    expect(matchProvenanceRecord(candidate(116.1225, "2026-10-29"), [record()])).toMatchObject({ ok: false, reason: "date-mismatch" });
    expect(matchProvenanceRecord(candidate(116.1225, "2026-10-29", { periodStated: true }), [record()])).toMatchObject({ ok: false, reason: "date-mismatch" });
  });

  it("keeps a percentage that is the record rounded, with another date, a date mismatch (control)", () => {
    const wacc = record({ id: "computed.returns.wacc", value: 10.4683, unit: "percent", currency: null, label: "WACC", period: "TTM",
      periodContext: { kind: "duration", start: "2025-01-01", end: "2025-12-31", basis: "rolling-12-month" } });
    expect(matchProvenanceRecord(candidate(10.5, "2026-10-29", { id: "computed.returns.wacc", unit: "percent", currency: null, period: "TTM", periodStated: true }), [wacc])).toMatchObject({ ok: false, reason: "date-mismatch" });
  });

  it("still matches an equal figure with the record's date, and still conflicts an unequal one on the same date (controls)", () => {
    expect(matchProvenanceRecord(candidate(124.1778, "2026-10-28"), [record()]).ok).toBe(true);
    expect(matchProvenanceRecord(candidate(124.18, "2026-10-28"), [record()])).toMatchObject({ ok: false, reason: "value-mismatch" });
  });

  it("reads a claim with a wrong date against its record only when the claim states the record's window", async () => {
    const growth = record({ id: "computed.valuation.reverse-dcf-implied-revenue-growth", value: 50.7275, unit: "percent", currency: null, label: "Reverse-DCF implied revenue growth", period: "FY2026",
      periodContext: { kind: "duration", start: "2026-01-01", end: "2026-12-31", basis: "fiscal-year" } });
    const undated = record({ ...growth, id: "computed.valuation.reverse-dcf-undated", period: null, periodContext: undefined });
    const claim = (text: string, source = growth.id): SourcedClaim => ({ label: "ESTIMATE", text, source, asOf: "2026-10-29" });
    const result = await runVerifyPass({} as PassDeps, payload([growth, undated]), { commentary: [
      claim("The FY2026 reverse-DCF implied revenue growth is 58.9%."),
      claim("The FY2026 reverse-DCF implied revenue growth is 50.7%."),
      // Annual-vs-other-window controls: no period in the claim, or none on the record, stays not confirmed.
      claim("The reverse-DCF implied revenue growth is 58.9%."),
      claim("The FY2026 reverse-DCF implied revenue growth is 58.9%.", undated.id),
    ] });
    const status = (path: string) => result.log.find(e => e.path === path && e.evidenceKind === "factual-claim");
    expect(status("commentary[0]")).toMatchObject({ validationStatus: "contradicted", reason: "value-mismatch", claimSupportStatus: "contradicted" });
    expect(status("commentary[1]")).toMatchObject({ validationStatus: "unchecked", reason: "date-mismatch" });
    expect(status("commentary[2]")).toMatchObject({ validationStatus: "unchecked", reason: "date-mismatch" });
    expect(status("commentary[3]")).toMatchObject({ validationStatus: "unchecked", reason: "date-mismatch" });
    expect(result.coverage.factualValidation?.contradicted).toBe(1);
  });
});

function markedReport(): Report {
  const r = loadTask28Fixture();
  const summary = r.verdict.executiveSummary!;
  summary[0] = { ...summary[0]!, label: "FACT" };
  summary[1] = { ...summary[1]!, label: "ESTIMATE" };
  const entry = (path: string, claim: SourcedClaim, status: NonNullable<VerificationLogEntry["validationStatus"]>): VerificationLogEntry => ({
    claim: claim.text, outcome: "unverified", path, evidenceKind: "factual-claim", source: claim.source, traceKind: "source-cited",
    reason: status === "contradicted" ? "value-mismatch" : "supported", validationStatus: status,
    claimSupportStatus: status === "contradicted" ? "contradicted" : status === "validated" ? "numeric-only" : "cited",
  });
  r.appendix.verificationLog = [entry("verdict.executiveSummary[0]", summary[0]!, "contradicted"), entry("verdict.executiveSummary[1]", summary[1]!, "cited")];
  return ReportSchema.parse(r);
}

describe("D-282: plain marks on every surface (R1, R2, R3)", () => {
  it("shows a contradicted FACT under a CONTRADICTED tag, never as a bold FACT, in Markdown, print and the app", () => {
    const r = markedReport();
    const text = r.verdict.executiveSummary![0]!.text;
    const md = reportToMarkdown(r);
    expect(md).toContain(`- **[CONTRADICTED]** ${text}`);
    expect(md).not.toContain(`- **[FACT]** ${text}`);
    expect(reportToPrintBody(r)).toContain(`<span class="label contradicted">CONTRADICTED</span> ${text}`);
    expect(renderToStaticMarkup(createElement(ReportView, { report: r }))).toContain(">CONTRADICTED<");
  });

  it("keeps the FACT tag of a statement code did not find in conflict (control) and reads it as not confirmed", () => {
    const r = markedReport();
    indexVerificationMarks(r);
    expect(claimTag(r.verdict.executiveSummary![1]!)).toBe("ESTIMATE");
    expect(claimStatusMarkText(r.verdict.executiveSummary![1]!)).toBe("[not confirmed]");
    const judgment: SourcedClaim = { label: "JUDGMENT", text: "In our judgment, x.", source: "edgar:10-K", asOf: null };
    expect(claimTag(judgment)).toBe("JUDGMENT");
  });

  it("states what each mark means in plain words at the top", () => {
    const md = reportToMarkdown(markedReport());
    expect(FACT_STATUS_LEGEND).toContain("written by the AI and not checked by code; it may be wrong");
    expect(FACT_STATUS_LEGEND).toContain("the AI's opinion; facts inside it are not checked");
    expect(FACT_STATUS_LEGEND).toContain("conflict with the record");
    expect(md.indexOf("How to read the marks.")).toBeGreaterThan(-1);
    expect(md.indexOf("How to read the marks.")).toBeLessThan(md.indexOf("## 1."));
  });

  it("marks every model-written paragraph and table cell, and leaves a data-only report's code-written text alone", () => {
    const r = loadTask28Fixture();
    const marked = withModelProseMarks(r);
    expect(marked.verdict.synthesis.endsWith(MODEL_PROSE_MARK)).toBe(true);
    expect(marked.verdict.gradeStrip.fundamentals.oneLineWhy.endsWith(MODEL_PROSE_MARK)).toBe(true);
    expect(marked.valuation.graded.interpretation?.endsWith(MODEL_PROSE_MARK) ?? true).toBe(true);
    expect(marked.disagreements.every(d => d.judgeResolution.endsWith(MODEL_PROSE_MARK))).toBe(true);
    expect(withModelProseMarks(marked)).toEqual(marked); // idempotent
    expect(r.verdict.synthesis.endsWith(MODEL_PROSE_MARK)).toBe(false); // read time only
    const dataOnly = loadTask28Fixture();
    dataOnly.appendix.missingData.push({ field: "analysis.llm", severity: "critical", reason: "No analysis ran." });
    expect(withModelProseMarks(dataOnly)).toBe(dataOnly);
    const md = reportToMarkdown(r);
    expect(md).toContain(`${r.verdict.synthesis} ${MODEL_PROSE_MARK}`.replace(/\[/g, "\\[").replace(/\]/g, "\\]"));
  });

  it("marks model-written quality and technicals flags on Markdown, print and the app; a data-only report's code flags stay unmarked (review round 1)", () => {
    const flagged = (dataOnly: boolean) => {
      const r = loadTask28Fixture();
      r.quality.flags = [{ severity: "medium", text: "Accruals outpaced earnings this year.", source: "computed.forensics.accruals" }];
      r.technicals.flags = [{ severity: "low", text: "Price sits below its 200-day average.", source: "computed.technicals.read.flags" }];
      if (dataOnly) r.appendix.missingData.push({ field: "analysis.llm", severity: "critical", reason: "No analysis ran." });
      return [reportToMarkdown(r).replace(/\\([[\]])/g, "$1"), reportToPrintBody(r), renderToStaticMarkup(createElement(ReportView, { report: r }))];
    };
    const texts = ["Accruals outpaced earnings this year.", "Price sits below its 200-day average."];
    for (const surface of flagged(false)) for (const text of texts) expect(surface).toContain(`${text} ${MODEL_PROSE_MARK}`);
    for (const surface of flagged(true)) for (const text of texts) {
      expect(surface).toContain(text);
      expect(surface).not.toContain(`${text} ${MODEL_PROSE_MARK}`);
    }
    expect(FACT_STATUS_LEGEND).toContain("Titles, dates and ratings the AI chose (such as a risk's severity) carry no mark and are not checked by code.");
  });

  it("marks a table figure not confirmed or contradicted in words, and a matched one with a check (control)", () => {
    const r = loadTask28Fixture();
    const n = r.fundamentals.graded.keyNumbers[0]!;
    n.verified = false;
    expect(citedMark(n)).toBe("not confirmed");
    r.appendix.verificationLog = [{ claim: "x", outcome: "unverified", path: "fundamentals.graded.keyNumbers[0]", evidenceKind: "number", reason: "value-mismatch", validationStatus: "contradicted", traceKind: "untraced" }];
    indexVerificationMarks(r);
    expect(citedMark(r.fundamentals.graded.keyNumbers[0]!)).toBe("contradicted");
    expect(citedMark({ ...n, verified: true })).toBe("✓");
  });
});

describe("D-284: a sensitivity-grid parameter is not a conflict with the headline record (P19, A5)", () => {
  const headline = record({ id: "computed.valuation.cost-of-equity-the-model-s-only-discount-rate", label: "cost of equity (the model's only discount rate)", value: 9.6195, unit: "percent", currency: null, asOf: "2026-11-13" });
  const cell = record({ id: "computed.valuation.excess-return-cell-1", label: "excess-return per share, start TTM ROTE 27.96% (headline +5pp) × cost of equity 8.6%", value: 297.59, asOf: "2026-11-13" });

  it("binds a quoted grid cost of equity to the cell's own label, not the headline cost of equity", async () => {
    const result = await runVerifyPass({} as PassDeps, payload([headline, cell]), { valuation: { reverseDcf: { narrative: "Its most favourable cell assumes an 8.6% cost of equity, and it gives USD 297.59 per share." } } });
    const flags = result.log.filter(e => e.check === "plain-figure");
    expect(flags.map(e => e.note).join(" ")).not.toContain("Differs from the record");
    expect(flags).toEqual([expect.objectContaining({ traceKind: "value-match" })]);
  });

  it("still reports a cost of equity that no record or grid label states (control)", async () => {
    const result = await runVerifyPass({} as PassDeps, payload([headline, cell]), { valuation: { reverseDcf: { narrative: "Its most favourable cell assumes a 7.6% cost of equity, and it gives USD 297.59 per share." } } });
    // The figure keeps a visible note (no value match): only a stated grid parameter can answer for it.
    expect(result.log.find(e => e.check === "plain-figure")).toMatchObject({ traceKind: "untraced", note: "Not matched to a source: 7.6%." });
  });
});

describe("D-285: a whole-feed news citation names one article or is removed (P20, K33)", () => {
  const article = (over: Partial<PayloadNewsArticle> = {}): PayloadNewsArticle => ({
    feed: "fmp:news", date: "2026-11-12", publisher: "Example Wire", title: "Issuer opens a plant", url: "https://news.example/plant", ...over,
  });
  const feed = (asOf: string, label: SourcedClaim["label"] = "FACT"): SourcedClaim => ({ label, text: `News on ${asOf}.`, source: "fmp:news", sourceId: "fmp:news", asOf });

  it("re-cites a statement to the one article of its feed and date, with publisher, title and link", () => {
    const root = { verdict: { executiveSummary: [feed("2026-11-12")] } };
    const result = reciteFeedClaims(root, [article(), article({ date: "2026-11-13", url: "https://news.example/other" })]);
    expect(result).toMatchObject({ recited: 1, removed: [] });
    const claim = root.verdict.executiveSummary[0]!;
    expect(claim.sourceId).toBe(`news: Example Wire, "Issuer opens a plant", https://news.example/plant`);
    expect(sourceLabel(claim.source)).toBe(`Example Wire, "Issuer opens a plant", https://news.example/plant`);
  });

  it("removes a statement whose date holds two articles, or one without a link, and the list item it leaves empty", () => {
    const root = { catalystsRisks: { catalysts: [{ title: "a", reasoning: [feed("2026-11-13", "JUDGMENT")] }, { title: "b", reasoning: [feed("2026-11-14"), { label: "FACT", text: "Filed fact.", source: "edgar:10-K", asOf: "2025-12-31" }] }] } };
    const result = reciteFeedClaims(root, [article({ date: "2026-11-13" }), article({ date: "2026-11-13", url: "https://news.example/two" }), article({ date: "2026-11-14", url: null })]);
    expect(result.removed.map(r => [r.path, r.candidates])).toEqual([["catalystsRisks.catalysts[1].reasoning[0]", 1], ["catalystsRisks.catalysts[0].reasoning[0]", 2]]);
    expect(root.catalystsRisks.catalysts.map(c => c.title)).toEqual(["b"]);
    expect(root.catalystsRisks.catalysts[0]!.reasoning).toEqual([{ label: "FACT", text: "Filed fact.", source: "edgar:10-K", asOf: "2025-12-31" }]);
  });

  it("keeps a development whose optional judgment goes, removes a saved single-statement catalyst, never restores (review round 1)", () => {
    const filed: SourcedClaim = { label: "FACT", text: "Filed event.", source: "edgar:8-K", asOf: "2026-11-12" };
    const root = {
      verdict: { recentDevelopments: { summary: [], items: [{ title: "kept", whatHappened: [filed], whyItMatters: [feed("2026-11-13", "JUDGMENT")] }] } },
      catalystsRisks: { catalysts: [{ title: "single", reasoning: feed("2026-11-13") }, { title: "other", reasoning: filed }] },
      business: { whatTheySell: [feed("2026-11-13")] },
    };
    const result = reciteFeedClaims(root, [article({ date: "2026-11-13" }), article({ date: "2026-11-13", url: "https://news.example/two" })]);
    expect(root.verdict.recentDevelopments.items).toEqual([{ title: "kept", whatHappened: [filed], whyItMatters: [] }]);
    expect(root.catalystsRisks.catalysts.map(c => c.title)).toEqual(["other"]);
    // Review round 1 (lead decision): a removed statement is never restored; the brief's list is left empty and the
    // reader shows its absence state.
    expect(root.business.whatTheySell).toEqual([]);
    expect(result.removed.map(r => r.path).sort()).toEqual(["business.whatTheySell[0]", "catalystsRisks.catalysts[0].reasoning", "verdict.recentDevelopments.items[0].whyItMatters[0]"]);
  });

  it("drops a product line or management action whose required statements all go, and keeps an item whose optional list empties (review round 1)", () => {
    const filed: SourcedClaim = { label: "FACT", text: "Filed.", source: "edgar:10-K", asOf: "2025-12-31" };
    const root = {
      business: { products: [{ productLine: "Gone", claims: [feed("2026-11-13")] }, { productLine: "Kept", claims: [filed, feed("2026-11-13")] }] },
      leadership: { managementActions: [{ action: [feed("2026-11-13")], assessment: [filed] }, { action: [filed], assessment: [feed("2026-11-13", "JUDGMENT")] }] },
      competitive: { moatAssessment: [{ moat: "brand", reasoning: [feed("2026-11-13", "JUDGMENT")] }] },
    };
    reciteFeedClaims(root, [article({ date: "2026-11-13" }), article({ date: "2026-11-13", url: "https://news.example/two" })]);
    expect(root.business.products).toEqual([{ productLine: "Kept", claims: [filed] }]);
    expect(root.leadership.managementActions).toEqual([{ action: [filed], assessment: [] }]);
    expect(root.competitive.moatAssessment).toEqual([{ moat: "brand", reasoning: [] }]);
  });

  it("leaves a filing, press-free or web citation untouched (control) and names a saved report's bare feed tag plainly", () => {
    const filed: SourcedClaim = { label: "FACT", text: "Filed.", source: "edgar:10-K item 7", asOf: "2025-12-31" };
    const web: SourcedClaim = { label: "FACT", text: "Web.", source: "web:https://example.com/a", asOf: "2026-11-01" };
    const root = { facts: [filed, web] };
    expect(reciteFeedClaims(root, [article()])).toEqual({ recited: 0, removed: [] });
    expect(root.facts).toEqual([filed, web]);
    expect(sourceLabel("fmp:news")).toBe("News feed (no single article identified)");
  });

  it("logs a removed statement in the verify pass and verifies a re-cited one against its article id", async () => {
    const articles = [article(), article({ date: "2026-11-13" }), article({ date: "2026-11-13", url: "https://news.example/b" })];
    const p = payload([], { news: { title: "news", figures: [], notes: [], articles }, citationRegistry: [{ id: `news: Example Wire, "Issuer opens a plant", https://news.example/plant`, asOf: "2026-11-12", kind: "payload-text", origin: "fmp:news" }] } as Partial<ContextPayload>);
    const result = await runVerifyPass({} as PassDeps, p, { commentary: [feed("2026-11-12"), feed("2026-11-13")] });
    expect((result.verifiedReport as { commentary: SourcedClaim[] }).commentary).toHaveLength(1);
    expect(result.log.find(e => e.outcome === "removed")?.note).toContain("2 articles");
    expect(result.log.find(e => e.path === "commentary[0]" && e.evidenceKind === "factual-claim")).toMatchObject({ reason: "supported" });
  });
});
