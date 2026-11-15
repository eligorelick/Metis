import { MODEL_TANGIBLE_COMMON_BASIS } from "@/pipeline/stageB/returns";
import type { ReportAuditTable } from "@/report/auditTables";
import { qualifiedGradeLabel } from "@/report/assessment";
import { supplementalNumericInventoryText } from "@/report/supplementalNumericAudit";
import { passBaseName, passAttemptName, FAILED_PASS_NOTE, type ExecutionMetadataEntry } from "@/report/execution";
import { SPY_BENCHMARK } from "@/pipeline/stageB/sectorRouting";
import { gapGroupKey, shownDataState } from "@/report/completeness";
import { shownFilingDisclosures } from "@/report/filingDisclosurePresentation";
import { estimateTimingText, reportEstimateTiming } from "@/report/estimateTiming";
import { LEASE_DEBT_LABELS } from "@/pipeline/stageB/leaseScope";
import { LENDER_DEBT_PERIMETER_LABEL } from "@/pipeline/stageB/lenderCashFlow";
import { collapseMeasuredCagrValues } from "@/report/cagrPresentation";
import { IDENTIFIER_CONTEXT, readerBaseUnits, readerConventionText, unavailableCashFlowModel } from "@/report/readerConventions";

/** Only a recorded check may annotate a field; saved reports are never rechecked at display time. */
export function withPlainFigureNotes(report: Report): Report {
  const flags = report.appendix.verificationLog?.filter(entry => entry.check === "plain-figure" && entry.traceKind !== "value-match" && entry.path && entry.note);
  if (!flags?.length) return report;
  const next = structuredClone(report);
  const grouped = new Map<string, typeof flags>();
  for (const entry of flags) grouped.set(entry.path!, [...(grouped.get(entry.path!) ?? []), entry]);
  for (const entries of grouped.values()) {
    const entry = entries[0]!;
    const keys = entry.path!.replace(/\[(\d+)\]/g, ".$1").split(".");
    let parent: unknown = next;
    for (const key of keys.slice(0, -1)) parent = parent && typeof parent === "object" ? (parent as Record<string, unknown>)[key] : undefined;
    const key = keys.at(-1)!;
    if (parent && typeof parent === "object" && (parent as Record<string, unknown>)[key] === entry.claim)
      (parent as Record<string, unknown>)[key] = `${entry.claim} (${entries.filter(e => e.claim === entry.claim).map(e => e.note).join(" ")})`;
  }
  return next;
}

/** D-282: the mark a model-written paragraph or table cell carries; the legend explains it. */
export const MODEL_PROSE_MARK = `[${CLAIM_STATUS_WORDS.unverified}]`;
/**
 * D-282: the caption on every AI-authored table, card or row group, on every surface. Its titles, dates and
 * ratings are the AI's; a cell inside it that code checked keeps its own mark.
 */
export const AI_BLOCK_CAPTION = "Written by the AI; not checked by code.";

const GRADE_PROSE_KEYS = ["oneLineWhy", "interpretation"] as const;
const GRADED_SECTIONS = ["fundamentals", "balanceSheet", "valuation", "quality", "technicals", "leadership"] as const;
const MODELED_CONDITIONS_PREFIX = "Modeled conditions: ";

/** A report the AI wrote; a data-only report's text is written by code (it records the analysis.llm gap). */
export function isModelWrittenReport(report: Pick<Report, "appendix">): boolean {
  return !report.appendix.missingData.some(gap => gap.field === "analysis.llm");
}

/**
 * D-282 (P19, P22; release item R1): every model-written paragraph or table
 * cell that is not a tagged statement carries the "not confirmed" mark, on
 * every surface: the verdict paragraph, each grade's one-line reason and
 * interpretation, the debate resolutions, the reverse-DCF and market-share
 * narratives, the technical read, scenario commentary and model-written
 * conditions, and the macro relevance lines. Code-written text (a data-only
 * report, a modeled-conditions line, the code-built trend line) is not marked.
 * Read time only: the stored report is unchanged (P21).
 */
export function withModelProseMarks(report: Report): Report {
  if (!isModelWrittenReport(report)) return report;
  const next = structuredClone(report);
  const mark = (text: string | null | undefined): string | null | undefined =>
    typeof text === "string" && text.trim() !== "" && !text.trimEnd().endsWith(MODEL_PROSE_MARK) ? `${text} ${MODEL_PROSE_MARK}` : text;
  const markBlock = (block: unknown): void => {
    if (!block || typeof block !== "object") return;
    const record = block as Record<string, unknown>;
    for (const key of GRADE_PROSE_KEYS) if (typeof record[key] === "string") record[key] = mark(record[key] as string);
  };
  const root = next as unknown as Record<string, Record<string, unknown> | undefined>;
  if (next.verdict) {
    next.verdict.synthesis = mark(next.verdict.synthesis) as string;
    for (const block of Object.values(next.verdict.gradeStrip ?? {})) markBlock(block);
  }
  for (const section of GRADED_SECTIONS) markBlock(root[section]?.graded);
  markBlock(root.competitive?.moatGraded);
  if (next.competitive && typeof next.competitive.marketShareDirection === "string") next.competitive.marketShareDirection = mark(next.competitive.marketShareDirection) as string;
  for (const d of next.disagreements ?? []) {
    d.judgeResolution = mark(d.judgeResolution) as string;
    d.bullView = mark(d.bullView) as string;
    d.bearView = mark(d.bearView) as string;
  }
  if (next.valuation?.reverseDcf && typeof next.valuation.reverseDcf.narrative === "string") next.valuation.reverseDcf.narrative = mark(next.valuation.reverseDcf.narrative) as string;
  for (const scenario of next.valuation?.scenarios ?? []) {
    if (scenario.qualitativeCommentary) scenario.qualitativeCommentary = scenario.qualitativeCommentary.map(text => mark(text) as string);
    scenario.whatWouldHaveToBeTrue = scenario.whatWouldHaveToBeTrue.map(text => text.startsWith(MODELED_CONDITIONS_PREFIX) ? text : mark(text) as string);
  }
  const read = next.technicals?.read as Record<string, unknown> | undefined;
  if (read) for (const key of ["momentum", "keyLevels", "relativeStrength"]) if (typeof read[key] === "string") read[key] = mark(read[key] as string);
  for (const series of next.macro?.relevantSeries ?? []) series.relevance = mark(series.relevance) as string;
  // flags in a model-written report are the judge's (passes.ts assembly copies them from the judge output); code
  // flags exist only in data-only reports.
  for (const flag of [...(next.quality?.flags ?? []), ...(next.technicals?.flags ?? [])]) flag.text = mark(flag.text) as string;
  return next;
}

/**
 * D-308: the statements of a report the AI wrote, recorded once when a surface prepares the report (like the
 * verification-mark index), so display code can show the AI's words as written. A data-only report's statements
 * are written by code and are not recorded.
 */
const modelWrittenClaims = new WeakSet<object>();

export function indexModelWrittenClaims(report: Report): void {
  if (!isModelWrittenReport(report)) return;
  const visit = (node: unknown): void => {
    if (node === null || typeof node !== "object") return;
    if (Array.isArray(node)) { for (const child of node) visit(child); return; }
    const claim = node as Partial<SourcedClaim>;
    if (typeof claim.text === "string" && typeof claim.source === "string" && typeof claim.label === "string") { modelWrittenClaims.add(node); return; }
    for (const [key, value] of Object.entries(node)) if (key !== "appendix" && key !== "meta") visit(value);
  };
  visit(report);
  // report assembly writes two method statements into every report (`applyFinancialDiagnostics`): the capital
  // grading basis and the debt-bridge note. They are code-written, identified by their typed fields (JUDGMENT,
  // source `computed.capital.current`) on their own commentary paths, never by wording (P11).
  for (const claim of [...report.balanceSheet.coverage.commentary, ...report.balanceSheet.debtProfile.commentary]) {
    if (claim.label === "JUDGMENT" && claim.source === CODE_METHOD_STATEMENT_SOURCE) modelWrittenClaims.delete(claim);
  }
}

/** The typed source of the code-written capital method statements (`applyFinancialDiagnostics`). */
const CODE_METHOD_STATEMENT_SOURCE = "computed.capital.current";

export function isModelWrittenClaim(claim: SourcedClaim): boolean {
  return modelWrittenClaims.has(claim);
}

/** One reminder per checked report; absence of a field note never asserts verification. */
export function plainFigureReaderNote(report: Report): string | null {
  return report.appendix.verificationLog?.some(entry => entry.check === "plain-figure")
    ? "Figures without a note are not necessarily verified." : null;
}
/**
 * Reader-facing presentation rules shared by the Markdown export, the print
 * export and the live report (D-62). The three surfaces call these helpers so
 * a label, a rounding rule or a key-data row reads the same everywhere.
 *
 * Pure and deterministic: no I/O, no clock, no locale-dependent output other
 * than the fixed en-US number grouping the formatters already use. Nothing
 * here changes a stored value; it only decides how a stored value is named,
 * rounded and grouped for a reader. The registry ids, raw values and the full
 * verification record stay in the separate audit export
 * (src/report/export/auditMarkdown.ts).
 */

import { parseSubscriptionModel } from "@/ai/contracts";
import { executionCompleted, subscriptionExecution } from "@/report/execution";
import { deriveReportModelEvidence } from "@/report/modelEvidence";
import { PRINCIPAL_CORRECTION_FIELD } from "@/report/principalAggregationSafety";
import { LEGACY_VALUATION_NOTE_FIELD } from "@/report/legacyValuationNotes";
import { withHistoricalEnterpriseValueSafety } from "@/report/enterpriseValueSafety";
import { compositeNote, compositeText, evidencePercentText, hasLimitedEvidence, MIN_HEADLINE_EVIDENCE, withNeutral } from "@/report/assessment";
import { formatScore } from "@/report/scoreText";
import { attributeGradeReliability, type AttributeGradeReliability } from "@/report/gradeReliability";
import { displayedClaimCoverage, displayedFactualValidation, displayedValidationStatus, numericClaimPartition } from "@/report/claimMatching";
export { displayedValidationStatus } from "@/report/claimMatching";
import { CLAIM_STATUS_WORDS, isComputedFigure, isContradictedFigure } from "@/report/verificationMarks";
import { dcfBaseRateText } from "@/pipeline/stageB/fairValue";
import { comparePriceCurrency } from "@/pipeline/stageB/priceCurrency";
import { fairValueDegradedText, readerFairValueBasisText, readerFairValueReferenceText, readerFairValueWithheldText } from "@/report/fairValueText";
import { riskFreeSourceLabel } from "@/pipeline/riskFreeSeries";
export { factorContributionSensitivityTable } from "@/report/auditTables";
import type { ClassifiedGap, ReportCompletenessPresentation } from "@/report/completeness";
import { reportSection } from "@/report/sectionManifest";
import { evidenceContractStatus } from "@/report/evidenceContract";
import { EXECUTIVE_EVIDENCE_GROUPS } from "@/report/surfaceManifest";
import { executiveAssessmentNote } from "@/report/executiveAssessment";
import { inProgressUsSessionDate } from "@/providers/usSession";
import {
  decimalRound,
  formatCostUsd,
  roundedDisplayedCostTotal,
  formatFinancialAmount,
  formatFinancialValue,
  formatLargeNumber,
  formatMoneyAmount,
  formatMultiple,
  formatNumber,
  formatPct,
  numericCitationTraceLabel,
  peerColumnKeys,
  tracedPeriodLabel,
  unitLabel,
  establishedCurrency,
} from "@/report/format";
import type { ManifestEntry } from "@/types/core";
import { BUSINESS_STORY_HEADING, productLineNamingClaims, UNNAMED_PRODUCT_LINE_HEADING } from "@/report/schema";
import { claimStatusMark } from "@/report/verificationMarks";
import { companyRecordClaim } from "@/report/executiveDecisions";
import { citationAsOf, citationSourceId } from "@/pipeline/stageC/citations";
import { findDirectionWords } from "@/pipeline/stageC/consistency";
import { developmentClaims, managementActionClaims, RECENT_DEVELOPMENTS_HEADING } from "@/report/qualitativeAnalysis";
import type {
  Business,
  Competitive,
  Dcf,
  FairValue,
  MetricRow,
  MoatAssessment,
  ProvenanceCoverage,
  Report,
  RouteMetrics,
  Scenario,
  ScenarioTargets,
  ScoreSignal,
  SourcedClaim,
  TracedNumber,
  Valuation,
  VerificationLogEntry,
} from "@/report/schema";

/* ======================================================================== *
 * Human labels for registry ids
 * ======================================================================== */

const WORD_FIXES: Record<string, string> = {
  ebitda: "EBITDA", ebit: "EBIT", fcf: "FCF", fcff: "FCFF", sbc: "SBC", roic: "ROIC",
  wacc: "WACC", dcf: "DCF", eps: "EPS", ttm: "TTM", rsi: "RSI", macd: "MACD", spy: "SPY",
  noa: "NOA", gaap: "GAAP", yoy: "YoY", qoq: "QoQ", ev: "EV", us: "US", ai: "AI",
  cfo: "CFO", cfi: "CFI", ceo: "CEO", evp: "EVP", pct: "%", vs: "vs", sma: "SMA",
  pettm: "P/E (TTM)", pricetofcf: "price / FCF", operatingmargin: "operating margin",
  balancesheet: "balance sheet", capex: "capex", ppe: "PP&E", cagr: "CAGR", pp: "pp",
  // D-67: run-together multiple and metric names, Beneish index codes, providers.
  pricetobook: "P/B", pricetotbv: "P/TBV", evtoebitda: "EV/EBITDA", evtosales: "EV/Sales",
  epsdiluted: "diluted EPS", fmp: "FMP", sec: "SEC", xbrl: "XBRL", edgar: "EDGAR",
  reit: "REIT", ffo: "FFO", affo: "AFFO", nim: "NIM", roe: "ROE", rote: "ROTE", tce: "TCE",
  aqi: "AQI", tata: "TATA", gmi: "GMI", dsri: "DSRI", sgi: "SGI", depi: "DEPI", sgai: "SGAI", lvgi: "LVGI",
};

/**
 * D-67: phrases the word split leaves mechanical ("Non GAAP", "Issuer defined",
 * "gross margin GAAP"), and a trailing period phrase set off in parentheses
 * ("… (quarter ended 2026-07-26)") as the statement labels already are.
 */
const PHRASE_FIXES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bnon GAAP\b/gi, "non-GAAP"],
  [/\b(issuer|company) defined\b/gi, "$1-defined"],
  [/\brun rate\b/gi, "run-rate"],
  [/\byear one\b/gi, "year-one"],
  [/\bstock based\b/gi, "stock-based"],
  [/\b(short|long) term\b/gi, "$1-term"],
  // D-301 (R29): the statement field "cashSti" is cash and short-term investments.
  [/\bcash sti\b/gi, "cash and short-term investments"],
  [/\b(gross margin|operating expenses|operating margin|tax rate|diluted EPS) (GAAP|non-GAAP)\b/g, "$2 $1"],
  [/\bfree cash flow operating cash flow less capex\b/gi, "FCF, operating cash flow less capex,"],
  // statement-row ids ("capex-negative") read as the outflow they record.
  [/\bcapex negative\b/gi, "capital expenditure (cash outflow)"],
  [/\bbuybacks negative\b/gi, "share repurchases (cash outflow)"],
  [/\b(operating cash flow) issuer reconciliation\b/gi, "$1, issuer reconciliation,"],
  [/,? ((?:quarter|year|three months|six months|nine months|\d+ months) ended \d{4}-\d{2}-\d{2}|as of \d{4}-\d{2}-\d{2})$/, " ($1)"],
  [/,$/, ""],
];

/** Split a registry segment (kebab, snake or camel case) into display words; ISO dates survive intact. */
function segmentWords(segment: string): string[] {
  const dates: string[] = [];
  const guarded = segment.replace(/\d{4}-\d{2}-\d{2}/g, (date) => {
    dates.push(date);
    return `\u0000${dates.length - 1}\u0000`;
  });
  return guarded
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[-_\s]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.replace(/\u0000(\d+)\u0000/g, (_, index: string) => dates[Number(index)] ?? ""))
    .map((word) => {
      const lower = word.toLowerCase();
      if (WORD_FIXES[lower] !== undefined) return WORD_FIXES[lower];
      if (/^q[1-4]$/.test(lower)) return lower.toUpperCase();
      if (/^fy\d{2,4}$/.test(lower)) return `FY${lower.slice(2)}`;
      if (/^\d+w$/.test(lower)) return `${lower.slice(0, -1)}-week`;
      if (/^\d+m$/.test(lower)) return lower.toUpperCase();
      if (/^sma\d+$/.test(lower)) return `SMA ${lower.slice(3)}`;
      if (/^[A-Z0-9]{2,}$/.test(word)) return word;
      return lower;
    });
}

function sentence(words: readonly string[]): string {
  const text = PHRASE_FIXES.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), words.join(" ").replace(/\s+%/g, " %").trim());
  return text.length === 0 ? text : text[0]!.toUpperCase() + text.slice(1);
}

/** A multiple's reader name from its registry spelling ("pricetobook", "priceToBook"). */
function multipleName(id: string): string {
  const key = id.replace(/[-_]/g, "").toLowerCase();
  const names: Record<string, string> = {
    pettm: "P/E (TTM)", pricetobook: "P/B", pricetotbv: "P/TBV", pricetofcf: "Price / FCF",
    evtoebitda: "EV/EBITDA", evtosales: "EV/Sales", marketcaptottmcommonearnings: "Market cap / TTM common earnings",
    marketcapttmcommonearnings: "Market cap / TTM common earnings",
  };
  return names[key] ?? sentence(segmentWords(id));
}

function titleWords(segment: string): string {
  return segmentWords(segment).map((word) => (word.length > 0 && /^[a-z]/.test(word) && !["and", "of", "the", "vs"].includes(word) ? word[0]!.toUpperCase() + word.slice(1) : word)).join(" ");
}

const ASPECT_LABEL: Record<string, string> = {
  fundamentals: "Fundamentals", valuation: "Valuation", quality: "Quality",
  balancesheet: "Balance-sheet", balanceSheet: "Balance-sheet", moat: "Moat",
  // D-61: the deterministic leadership score is a capital-stewardship proxy.
  leadership: "Leadership (capital-stewardship proxy)", technicals: "Technicals", composite: "Composite",
};

const EXACT_LABELS: Record<string, string> = {
  ...Object.fromEntries([
    ...Object.entries(LEASE_DEBT_LABELS),
    ["debtIncludingDisclosedLeasePortion", "Debt including disclosed lease portion (full coverage unverified)"],
    ["operatingLeasesNoncurrent", "Operating leases (noncurrent only)"],
    ["operatingLeasesCurrent", "Operating leases (current only)"],
    ["financeLeasesNoncurrent", "Finance leases (noncurrent only)"],
    ["financeLeasesCurrent", "Finance leases (current only)"],
    ["netDebtIncludingDisclosedLeasePortion", "Net debt including disclosed lease portion (full coverage unverified)"],
    ["netDebtExcludingDisclosedOperatingLeasePortion", "Net debt excluding disclosed operating-lease portion"],
  ].flatMap(([field, label]) => [[`computed.capital.current.debtBridge.${field}`, label],
    [`computed.current-capital.${field!.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()}`, label]])),
  // Stable legacy rule ids describe a materiality screen, not proof of one-off items.
  "computed.forensics.flags.serial-one-time-items": "Material other income/expense",
  "computed.forensics.flags.one-time-items": "Material other income/expense",
  "payload.quote.price": "Share price",
  "computed.technicals.last-close": "Last close",
  "computed.technicals.sma50": "50-day moving average",
  "computed.technicals.sma200": "200-day moving average",
  "computed.technicals.rsi-14": "RSI (14-day)",
  "computed.technicals.macd-histogram": "MACD histogram",
  "computed.technicals.52w-high": "52-week high",
  "computed.technicals.52w-low": "52-week low",
  "computed.technicals.relative-strength-vs-spy-12-1-month-latest-month-skipped": "Relative strength vs SPY, 12-1 month",
  "computed.technicals.relative-strength-vs-spy-6-month": "Relative strength vs SPY, 6 month",
  "computed.technicals.read": "Technical read",
  "computed.technicals.trend-read": "Trend read",
  "computed.technicals.momentum-read": "Momentum read",
  "computed.valuation.dcf-per-share": "DCF value per share",
  "computed.returns.wacc": "WACC",
  "computed.valuation.reverse-dcf-implied-revenue-growth": "Reverse-DCF implied revenue growth",
  "computed.valuation.dcf-terminal-value-share": "Terminal value share of enterprise value",
  "computed.valuation.pettm-current": "P/E (TTM)",
  "computed.valuation.pricetofcf-current": "Price / FCF",
  "computed.scores.composite": "Composite score",
  "computed.capital.current": "Capital bridge",
  "computed.projections.scenarioWeights": "Scenario display weights",
  "computed.scenarioPresentation.sensitivity": "DCF sensitivity grid",
  "computed.forensics.beneish-m": "Beneish M-score",
  "computed.forensics.accruals": "Accrual ratios",
  "computed.forensics.absolute-cash-flow-versus-balance-sheet-accrual-divergence": "Accrual divergence (cash-flow vs balance-sheet)",
  "computed.forensics.accruals.noaCurrent": "Net operating assets (current year)",
  "computed.forensics.accruals.noaPrior": "Net operating assets (prior year)",
  // the scaler is average NOA, or average total assets when NOA is not positive (the forensic notes say which);
  // one label serves both, so it names neither.
  "computed.forensics.accruals.scalerValue": "Accrual scaler (average NOA or total assets)",
  "computed.forensics.accrual-scaler-value": "Accrual scaler (average NOA or total assets)",
  "computed.forensics.accruals.cashFlowAccrualRatio": "Accrual ratio (cash-flow)",
  "computed.forensics.accruals.balanceSheetAccrualRatio": "Accrual ratio (balance-sheet)",
  "computed.forensics.accrual-ratio-cash-flow": "Accrual ratio (cash-flow)",
  "computed.forensics.accrual-ratio-balance-sheet": "Accrual ratio (balance-sheet)",
  "computed.forensics.accruals.aggregateAccrualsCashFlow": "Aggregate accruals (cash-flow)",
  "computed.forensics.accruals.aggregateAccrualsBalanceSheet": "Aggregate accruals (balance-sheet)",
  "computed.forensics.aggregate-accruals-cash-flow": "Aggregate accruals (cash-flow)",
  "computed.forensics.aggregate-accruals-balance-sheet": "Aggregate accruals (balance-sheet)",
  // D-67: use reader labels for registry ids that would otherwise display mechanical field names.
  "computed.valuation.dcf.perShare": "DCF value per share",
  "computed.valuation.guided-run-rate-growth-over-ttm-next-quarter-guidance-4": "Guided run-rate growth over TTM (next-quarter guidance × 4)",
  "computed.valuation.guided-quarter-revenue-growth-year-over-year": "Guided-quarter revenue growth, year over year",
  "computed.valuation.guided-sequential-pace-annualized": "Guided sequential pace, annualized",
  "computed.valuation.consensus-year-one-revenue-growth-over-ttm": "Consensus year-one revenue growth over TTM",
  "computed.valuation.dcf-base-case-year-one-revenue-growth-over-ttm": "DCF base-case year-one revenue growth over TTM",
  // "price paid vs the year's average" beside -3.0% read as paying 3% below the average; the measure is the
  // reverse.
  "computed.capital.buybackPriceAnalysis.timingPct": "Buyback timing (year-average cost vs cost paid; negative = paid above average)",
  "computed.forensics.accruals.definition": "Accrual definition",
  "computed.forensics.beneish.growthLed": "Beneish growth-led test",
  "computed.forensics.beneish-m-with-the-sales-growth-index-at-neutral-1-0": "Beneish M-score (sales-growth index at 1.0)",
  "computed.forensics.piotroski-f-9-signals": "Piotroski F-score (nine signals)",
  "computed.forensics.accrual-operand-operating-investing-cash-flow-cfi-without-financial-asset-flows": "Operating investing cash flow (excluding financial-asset flows)",
  "manifest.valuation.multiples.ownHistory": "Data-gap record: own-history multiple ranks",
  // P22: ids the report printed as run-together words.
  "computed.suppressed": "Route-suppressed metrics",
  "computed.capital-cash.capex-d-a-latest": "Capex / D&A (latest fiscal year)",
  "computed.capital-cash.capex-revenue-latest": "Capex as % of revenue (latest fiscal year)",
  "computed.capital-cash.capex-revenue-slope": "Capex-to-revenue slope",
  // the ratio divides the cash-flow add-back, not allocated SBC expense.
  "computed.capital-cash.sbc-revenue": "SBC (cash-flow add-back) as % of revenue (latest fiscal year)",
  // R9 names the SBC basis in the ids too; older reports keep the ids above.
  "computed.capital-cash.sbc-cash-flow-add-back-revenue": "SBC (cash-flow add-back) as % of revenue (latest fiscal year)",
  "computed.capital-cash.sbc-cash-flow-add-back-fcf": "SBC (cash-flow add-back) as % of FCF (latest fiscal year)",
  "computed.current-capital.sbc-cash-flow-add-back": "SBC (cash-flow add-back)",
  "computed.current-capital.sbc-allocated-expense": "SBC (allocated expense)",
  "computed.capital.current.allocatedSbcExpense": "SBC (allocated expense)",
  "computed.returns.roe-latest-dupont": "ROE (DuPont, latest fiscal year)",
  "computed.valuation.p-e-common-income-denominator": "P/E common-income denominator (TTM)",
  "computed.comparable-peers.market-cap-ttm-common-earnings-eligible-peer-count-after-filtering": "Eligible peers for market cap / TTM common earnings (after screening)",
  "payload.quote.issuer-common-capitalization-economic-price-approximation": "Issuer-common capitalization",
  "payload.insiders.post-window-form-4-code-f-reported-transaction-rows": "Form 4 code F transactions reported after the window",
  "payload.insiders.post-window-form-4-code-f-reported-shares-selected-rows-may-overlap": "Form 4 code F shares reported after the window (selected rows; may overlap)",
};

/** the filed operands behind a TTM identity (`<metric>-filed-<window>-operand-<xbrl tag>`). */
const FILED_OPERAND_METRIC: Readonly<Record<string, string>> = {
  stockbasedcompensation: "Stock-based compensation",
  operatingcashflow: "Operating cash flow",
  capitalexpenditure: "Capital expenditure",
  // R9: the two SBC bases are separate figures, each with its own filed operands.
  "sbc-cash-flow-add-back": "SBC (cash-flow add-back)",
  "sbc-allocated-expense": "SBC (allocated expense)",
};
/** the SBC basis an id slug names. */
const SBC_BASIS_LABEL: Readonly<Record<string, string>> = {
  "cash-flow-add-back": "SBC (cash-flow add-back)",
  "allocated-expense": "SBC (allocated expense)",
};
const FILED_OPERAND_WINDOW: Readonly<Record<string, string>> = {
  "prior-year-ytd": "prior-year year-to-date",
  "current-ytd": "current year-to-date",
  "fiscal-year": "fiscal-year",
};
/** Piotroski signal ids whose words alone name the wrong thing ("Turnover up"). */
const PIOTROSKI_SIGNAL: Readonly<Record<string, string>> = { turnoverUp: "asset turnover up" };

/** P20: reader labels for the insider-statistics ids (the generic fallback reads "form 4 code s"). */
const INSIDER_STAT_LABEL: Readonly<Record<string, string>> = {
  "purchase-transactions": "Insider purchase transactions (Form 4 code P; open-market or private)",
  "sale-transactions": "Insider sale transactions (Form 4 code S; open-market or private)",
  "open-market-purchase-transactions": "Insider purchase transactions (Form 4 code P; open-market or private)",
  "open-market-sale-transactions": "Insider sale transactions (Form 4 code S; open-market or private)",
  "shares-acquired": "Insider shares acquired (all reported acquisitions)",
  "shares-disposed": "Insider shares disposed (all reported dispositions)",
  "acquired-disposed-transaction-count-ratio": "Insider acquired/disposed transaction-count ratio",
};

const PATTERN_LABELS: ReadonlyArray<readonly [RegExp, (match: RegExpExecArray) => string]> = [
  [/^computed\.deterministic-aspect-scores\.([a-z]+)-score$/i, (m) => `${ASPECT_LABEL[m[1]!] ?? sentence(segmentWords(m[1]!))} score`],
  [/^computed\.scores\.([a-zA-Z]+)$/, (m) => `${ASPECT_LABEL[m[1]!] ?? sentence(segmentWords(m[1]!))} score`],
  [/^computed\.scores\.([a-zA-Z]+)\.([a-zA-Z0-9]+)$/, (m) => signalLabel(m[2]!)],
  [/^payload\.statements\.(income-statement|cash-flow|balance-sheet)-(quarterly|annual)\.(\d{4}-\d{2}-\d{2})\.(.+)$/, (m) =>
    `${m[4] === "sbc-cash-flow-add-back" ? SBC_BASIS_LABEL["cash-flow-add-back"] : sentence(segmentWords(m[4]!))} (${m[1] === "balance-sheet" ? "at" : m[2] === "quarterly" ? "quarter ended" : "year ended"} ${m[3]})`],
  [/^computed\.weighted-projections\.([a-z]+)-weighted-12m-ending-(\d{4}-\d{2}-\d{2})$/, (m) => `Weighted ${segmentWords(m[1]!).join(" ")}, 12M ending ${m[2]}`],
  [/^payload\.computed\.projections\.([a-z]+)\.([a-z]+)\.(.+)$/, (m) => `${sentence([m[2]!, "case", ...segmentWords(m[1]!)])}, ${segmentWords(m[3]!).join(" ")}`],
  [/^payload\.computed\.scenario-targets\.([a-z]+)\.per-share$/, (m) => `${sentence([m[1]!])} scenario value per share`],
  [/^payload\.computed\.fair-value\.per-share$/, () => "Model fair value per share"],
  [/^computed\.quarterly-trend\.(q[1-4]-fy\d{4})-(.+)$/, (m) => `${segmentWords(m[1]!).join(" ")} ${segmentWords(m[2]!).join(" ")}`],
  [/^payload\.segment-revenue\.(?:product-market-platform|reportable-segment|geography|geographic)-(.+)-revenue-quarter-ended-(\d{4}-\d{2}-\d{2})$/, (m) => `${titleWords(m[1]!)} revenue (quarter ended ${m[2]})`],
  [/^payload\.segments\.(product|geographic)-(.+)$/, (m) => `${titleWords(m[2]!)} revenue (annual ${m[1]} segment)`],
  [/^payload\.estimates\.est-(revenue|eps)-(\d{4}-\d{2}-\d{2})$/, (m) => `Consensus ${m[1] === "eps" ? "EPS" : "revenue"} estimate, fiscal year ending ${m[2]}`],
  [/^payload\.estimates\.price-target-(consensus|high|low|median)$/, (m) => `Analyst price target (${m[1]})`],
  [/^payload\.leadership\.comp-.+-(fy\d{4})$/, (m) => `Executive compensation record (${segmentWords(m[1]!).join(" ")})`],
  [/^payload\.peers\.([a-z0-9]+)-.+$/, (m) => `${m[1]!.toUpperCase()} market cap`],
  [/^payload\.macro\.([a-z0-9]+)-change-from-prior-observation-[a-z]+$/, (m) => `FRED ${m[1]!.toUpperCase()}, change from prior observation`],
  [/^payload\.macro\.([a-z0-9]+)-[a-z]+$/, (m) => `FRED ${m[1]!.toUpperCase()}`],
  [/^payload\.insiders\.insider-((?:open-market-)?purchase-transactions|(?:open-market-)?sale-transactions|shares-acquired|shares-disposed|acquired-disposed-transaction-count-ratio)-.*?(one|two|three|four)-calendar-quarters?-ended-(\d{4}-\d{2}-\d{2})$/, (m) => `${INSIDER_STAT_LABEL[m[1]!]}, ${m[2]} calendar quarter${m[2] === "one" ? "" : "s"} ended ${m[3]}`],
  [/^payload\.insiders\.mspr-(\d{4}-\d{2})$/, (m) => `Insider sentiment (MSPR), ${m[1]}`],
  [/^computed\.current-capital\.([a-z-]+?)-filed-(prior-year-ytd|current-ytd|fiscal-year)-operand-[a-z]+$/, (m) =>
    `${FILED_OPERAND_METRIC[m[1]!] ?? sentence(segmentWords(m[1]!))} (filed ${FILED_OPERAND_WINDOW[m[2]!]} operand)`],
  // a filing fact names its SBC basis and window.
  [/^payload\.filing-facts\.sbc-(allocated-expense|cash-flow-add-back)-(\d{4}-\d{2}-\d{2})-to-(\d{4}-\d{2}-\d{2})$/, (m) =>
    `${SBC_BASIS_LABEL[m[1]!]}, ${m[2]} to ${m[3]}`],
  [/^computed\.forensics\.piotroski\.signals\.([A-Za-z]+)$/, (m) =>
    `Piotroski signal: ${PIOTROSKI_SIGNAL[m[1]!] ?? segmentWords(m[1]!).join(" ").toLowerCase()}`],
  [/^computed\.forensics\.accrual-operand-(.+)-(?:ni|cfo|cfi)$/, (m) => sentence(segmentWords(m[1]!))],
  // D-67: "Pricetobook current", "Beneish index aqi", "Product market platform data center share of revenue …".
  [/^computed\.valuation\.([a-z]+)-(current|peer-median)$/, (m) => `${multipleName(m[1]!)}${m[2] === "peer-median" ? " peer median" : ""}`],
  [/^computed\.valuation\.peerCoverage\.([a-z-]+)\.median$/, (m) => `${multipleName(m[1]!)} peer median`],
  [/^computed\.forensics\.beneish-index-([a-z]+)$/, (m) => `Beneish ${m[1]!.toUpperCase()} index`],
  [/^computed\.quarterly-trend\.(?:product-market-platform|reportable-segment|geography|geographic)-(.+?)-(revenue-growth-year-over-year|revenue-growth-quarter-over-quarter|share-of-revenue|revenue)-quarter-ended-(\d{4}-\d{2}-\d{2})$/, (m) =>
    `${titleWords(m[1]!)} ${segmentWords(m[2]!).join(" ")} (quarter ended ${m[3]})`],
  [/^manifest\.valuation\.multiples\.peers\.([A-Za-z]+)\.comparabilityCaveat$/, (m) => `Data-gap record: ${multipleName(m[1]!)} peer comparability caveat`],
  [/^manifest\.([a-z]+)\.([A-Za-z]+)\([^)]*\)$/, (m) => `Data-gap record: ${segmentWords(m[1]!).join(" ")} ${segmentWords(m[2]!).join(" ")}`],
  [/^manifest\.(.+)$/, (m) => `Data-gap record: ${segmentWords(m[1]!.replace(/[.()]/g, " ")).join(" ")}`],
];

/** A short reader label for a computed signal id ("revenueCagr" → "Revenue CAGR"). */
export function signalLabel(id: string): string {
  const fixed: Record<string, string> = {
    peOwnHistoryRank: "Valuation multiple own-history rank",
    // Release R54: this rank uses P/TBV, or P/B where tangible book is unavailable; the label is true for both.
    priceToTbvOwnHistoryRank: "Book multiple own-history rank (P/TBV, or P/B where tangible book is unavailable)",
    revenueCagr: "Revenue CAGR", operatingMarginSlope: "Operating-margin slope", epsCagr: "EPS CAGR",
    fcfCagr: "FCF CAGR", dcfUpside: "DCF upside", reverseImpliedVsAchievable: "Reverse-DCF implied vs achievable growth",
    roicVsWaccSpread: "ROIC − fiscal-year-end WACC spread", piotroskiF: "Piotroski F (share of signals)",
    altmanZOriginalScale: "Altman Z (original scale)", accrualsRatioAbs: "Accruals ratio (absolute)",
    beneishM: "Beneish M-score", netDebtToEbitda: "Net debt / EBITDA", interestCoverage: "Interest coverage",
    fcfConversionBeforeSbc: "FCF conversion before SBC", sbcPctOfFcf: "SBC as % of FCF", roicLevel: "ROIC level",
    // D-61 signals; the retired ids stay readable for reports stored before it.
    roicFloor: "ROIC floor (worst year in window)", roteFloor: "ROTE floor (worst year in window)",
    buybackTiming: "Buyback timing (year-average cost vs cost paid; negative = paid above average)",
    beneishMSgiNeutral: "Beneish M-score (sales growth neutral)",
    roicStability: "ROIC stability (std. dev.)", grossMarginLevel: "Gross-margin level",
    buybackDiscipline: "Current price vs average repurchase price", capitalDeployment: "Capital deployment (ROIC − WACC)",
    shareCountTrend: "Annualized weighted-average diluted common-share trend", relStrength12m1m: "Relative strength vs SPY, 12-1 month",
    pctFromHigh52w: "Distance from 52-week high", smaGap: "SMA 50 / SMA 200 gap",
    // the regulated-utility balance sheet.
    cfoPreWcToDebt: "CFO before working-capital changes / debt", debtToBookCapitalization: "Debt / book capitalization (with deferred taxes)",
  };
  return fixed[id] ?? sentence(segmentWords(id));
}

function genericRegistryLabel(source: string): string {
  const parts = source.split(".").filter((part) => part.length > 0);
  const body = parts.slice(1);
  if (body.length === 0) return source;
  let index = body.length - 1;
  let suffix = "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(body[index]!) && index > 0) {
    suffix = ` (${body[index]})`;
    index -= 1;
  }
  // A generic tail ("median", "value", "series") names nothing on its own.
  const generic = /^(median|mean|value|current|series|total|rate|level|latest|perShare|per-share|amount)$/i;
  const words = generic.test(body[index]!) && index > 0
    ? [...segmentWords(body[index - 1]!), ...segmentWords(body[index]!)]
    : segmentWords(body[index]!);
  return `${sentence(words)}${suffix}`;
}

/**
 * A reader label for a figure's registry id. Unknown shapes (anything that is
 * not a computed/payload/manifest id or an SEC citation) are returned
 * unchanged, so a label the pipeline already wrote is never rewritten.
 */
export function metricLabel(source: string, unit = ""): string {
  if (source === "computed.current-capital.provider-debt-perimeter-includes-payables-to-third-party-loan-owners") return LENDER_DEBT_PERIMETER_LABEL;
  const fromUnit = unitLabel(unit);
  if (fromUnit) return readerMetricLabel(fromUnit);
  const piotroski = /^computed\.forensics\.piotroski-f-(financial-variant|eligibility-unresolved)-(\d+)-of-9-signals/.exec(source);
  if (piotroski) return `Piotroski F (${piotroski[1]!.replaceAll("-", " ")}, ${piotroski[2]} of 9 signals)`;
  const outflow = /^(?:payload|computed)\..*\b(capex|buybacks)-negative-(year-ended-\d{4}-\d{2}-\d{2})$/.exec(source);
  if (outflow) return `${outflow[1] === "capex" ? "Capital expenditure" : "Share repurchases"} (cash outflow) (${outflow[2]!.replace("year-ended-", "year ended ")})`;
  // a multiple on the latest fiscal year (TTM suppressed) names that year in its payload label, so in its id too.
  // (D-112).
  const annual = /^computed\.valuation\.(p-e|evtoebitda|evtosales)-current-(fy\d{4}|fy-ended-\d{4}-\d{2}-\d{2})$/.exec(source);
  if (annual) {
    const year = annual[2]!.startsWith("fy-ended-") ? `FY ended ${annual[2]!.slice("fy-ended-".length)}` : annual[2]!.toUpperCase();
    return `${({ "p-e": "P/E", evtoebitda: "EV/EBITDA", evtosales: "EV/Sales" } as const)[annual[1] as "p-e" | "evtoebitda" | "evtosales"]} (${year})`;
  }
  const exact = EXACT_LABELS[source];
  if (exact !== undefined) return exact;
  for (const [pattern, label] of PATTERN_LABELS) {
    const match = pattern.exec(source);
    if (match) return label(match);
  }
  if (/^(computed|payload)\.[^\s]+$/.test(source)) return genericRegistryLabel(source);
  if (/^edgar:/.test(source)) return sourceLabel(source);
  return source;
}

/** Prefer the supplied record label, keeping long signal diagnostics out of tables. */
export function readerMetricLabel(label: string): string {
  const cleaned = label.replace(/^(capex|buybacks) \(negative\)/i, (_, name: string) => `${name.toLowerCase() === "capex" ? "Capital expenditure" : "Share repurchases"} (cash outflow)`)
    .replace(/(Piotroski F \([^)]*?\d+ of 9 signals)[ —;]+\d+ withheld:[^)]*\)/, "$1)");
  return cleaned.length ? cleaned[0]!.toUpperCase() + cleaned.slice(1) : cleaned;
}

/** D-111: the risk-free citation, `computed.returns.wacc.riskFree(<series id>)`. */
const RISK_FREE_CITATION = /^computed\.returns\.wacc\.riskFree\(([^()\s]+)\)$/;
/** The risk-free series ids that are not `fred:<SERIES>`, read under their labels in prose. */
const RISK_FREE_BARE_IDS = /(?<![\w/])(?:fmp:treasury-rates\.year10|fred:DGS10\.last-cached|treasury:par-yield-curve\.10yr)/g;

/**
 * A reader label for a claim's citation ("edgar:10-Q item2" → "10-Q Item 2").
 * Computed and payload ids read as the figure they name; anything unknown is
 * returned verbatim.
 */
export function sourceLabel(source: string): string {
  const item = /^edgar:(10-K|10-Q|20-F|40-F|DEF 14A)\s+item\s*([0-9A-Za-z]+)$/i.exec(source);
  if (item) return `${item[1]!.toUpperCase()} Item ${item[2]!.toUpperCase()}`;
  const exhibit = /^edgar:(8-K|6-K|10-K|10-Q)\s+(EX-[0-9.]+)$/i.exec(source);
  if (exhibit) return `${exhibit[1]!.toUpperCase()} ${exhibit[2]!.toUpperCase()}`;
  const accession = /^edgar:(8-K|6-K|10-K|10-Q|DEF 14A|SC 13D|4)\s+(\d{10}-\d{2}-\d{6})$/i.exec(source);
  if (accession) return `${accession[1]!.toUpperCase()} ${accession[2]}`;
  const edgar = /^edgar:(.+)$/.exec(source);
  if (edgar) return `SEC ${edgar[1]}`;
  // D-67: the DCF basis and thesis triggers cite "sec:8-K EX-99.1 <accession>" and "fred:DGS10".
  const sec = /^sec:(.+)$/.exec(source);
  if (sec) return sec[1]!;
  const fred = /^fred:([A-Za-z0-9]+)$/.exec(source);
  if (fred) return `FRED ${fred[1]!.toUpperCase()}`;
  // D-111: the risk-free citation carries the series that served the rate.
  const riskFree = RISK_FREE_CITATION.exec(source);
  if (riskFree) return `Risk-free rate (${riskFreeSourceLabel(riskFree[1]!)})`;
  if (/^(computed|payload|manifest)\.[^\s]+$/.test(source)) return metricLabel(source);
  // pipeline-owned notes printed their raw ids. D-285: a statement re-cited to one news article names its
  // publisher, title and link; a whole-feed tag (a saved report's, or a row's source column) says that no single
  // article is named.
  const article = /^news: (.+)$/.exec(source);
  if (article) return article[1]!;
  if (/^(?:(?:fmp|finnhub):news|fmp:press-release)$/.test(source.trim())) return "News feed (no single article identified)";
  const pipeline = /^pipeline:([a-z-]+)$/.exec(source);
  if (pipeline) return ({ "insider-coverage": "Insider-filing coverage", "report-reference": "Report cross-reference" } as Record<string, string>)[pipeline[1]!] ?? sentence(segmentWords(pipeline[1]!));
  return source;
}

/**
 * The single source marker a claim carries (D-62): the citation, the
 * registry id only when it differs from the citation, and the as-of date.
 * Replaces the duplicated "`source id: X` `src: X`" pair.
 */
export function claimCitation(claim: Pick<SourcedClaim, "source" | "sourceId" | "asOf">): string {
  const parts = [sourceLabel(claim.source)];
  if (claim.sourceId && claim.sourceId !== claim.source) parts.push(`id ${claim.sourceId}`);
  if (claim.asOf) parts.push(claim.asOf);
  return parts.join(" · ");
}

/** Read legacy reasoning without rewriting its object or verification path. */
export function reasoningClaims(reasoning: SourcedClaim | readonly SourcedClaim[]): readonly SourcedClaim[] {
  return Array.isArray(reasoning) ? reasoning : [reasoning as SourcedClaim];
}

/* ======================================================================== *
 * Figure rows: human label, rounded value, deduplication
 * ======================================================================== */

export interface FigureRow {
  label: string;
  value: string;
  /** The measurement window, or null when the figure did not supply one. */
  period: string | null;
  asOf: string | null;
  /** "✓", "computed" (a data-only report's figure), "not confirmed", "contradicted" or "not checked". */
  cited: string;
  trace: TracedNumber;
}

/**
 * A figure's Cited mark. P20: a data-only report ran no citation check; its
 * figures were computed. D-282 (P18, P19): a figure code could not match to its
 * record at stored precision reads "not confirmed", and one whose value
 * conflicts with that record reads "contradicted", in every table that shows it.
 */
export function citedMark(n: TracedNumber): string {
  if (n.verified === true) return isComputedFigure(n) ? "computed" : "✓";
  if (n.verified === false) return isContradictedFigure(n) ? "contradicted" : "not confirmed";
  return numericCitationTraceLabel(n.verified);
}

/**
 * A figure's displayed value. D-67: a ratio read as a percentage (FCF
 * conversion, accrual ratios) prints in whole percent wherever it appears, and
 * the Piotroski count prints against its nine signals.
 */
export function figureValueText(n: Pick<TracedNumber, "value" | "unit" | "currency" | "source">): string {
  const unit = n.unit.trim().toLowerCase();
  // TATA is a signed accrual fraction, unlike the other Beneish indices.
  if (/^computed\.forensics\.(?:beneish-index-tata|beneish\.indices\.tata)$/i.test(n.source) && ["x", "ratio", "fraction"].includes(unit)) return n.value.toFixed(3);
  if (/evidence-completeness$/.test(n.source) && ["fraction", "frac", "ratio", "number", ""].includes(unit)) return ratioPercentText(n.value);
  if (isRatioAsPercent(n.source) && ["x", "×", "multiple", "fraction", "frac", "ratio"].includes(unit)) return ratioPercentText(n.value);
  if (/piotroski-f-9-signals$/.test(n.source) && Number.isInteger(n.value)) return `${n.value}/9`;
  return formatFinancialAmount(n.value, n.unit, n.currency);
}

export function figureRow(n: TracedNumber, label?: string): FigureRow {
  // D-308: a route metric's period cell can state its formula operands in base units; group them (P22).
  const period = readerBaseUnits(tracedPeriodLabel(n.period, n.periodContext).replace(/^not supplied; /, ""));
  return {
    label: label ?? metricLabel(n.source,n.unit),
    value: figureValueText(n),
    period: period === "not supplied" ? null : period,
    asOf: n.asOf,
    cited: citedMark(n),
    trace: n,
  };
}

/** Explicitly registered aliases; neither a shared label nor an equal amount proves identity. */
const FIGURE_ALIAS_GROUPS: readonly (readonly string[])[] = [
  ...[
    "netDebtToEbitda", "interestCoverage", "fcfConversionBeforeSbc", "sbcPctOfFcf", "netDebt", "ebitda",
    "cashBridge.operatingCashFlow", "cashBridge.cashCapitalExpenditure", "cashBridge.standardizedFcf",
    "cashBridge.financeLeasePrincipalPayments", "cashBridge.leaseAdjustedFcf", "cashBridge.issuerFcf",
    "cashBridge.stockBasedCompensation", "cashBridge.afterSbcStandardizedFcf", "cashBridge.afterSbcIssuerFcf",
    "debtBridge.totalDebtIncludingLeases", "debtBridge.operatingLeases", "debtBridge.financeLeases",
    "debtBridge.cashAndShortTermInvestments", "debtBridge.marketableEquitySecurities", "debtBridge.cashForNetDebt",
    "debtBridge.netDebtIncludingLeases", "debtBridge.netDebtExcludingOperatingLeases",
  ].map((path) => [
    `computed.capital.current.${path}`,
    `computed.current-capital.${path.split(".").at(-1)!.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()}`,
  ]),
  ["computed.forensics.accruals.scalerValue", "computed.forensics.accrual-scaler-value"],
  ["computed.forensics.accruals.cashFlowAccrualRatio", "computed.forensics.accrual-ratio-cash-flow"],
  ["computed.forensics.accruals.balanceSheetAccrualRatio", "computed.forensics.accrual-ratio-balance-sheet"],
  ["computed.forensics.accruals.aggregateAccrualsCashFlow", "computed.forensics.aggregate-accruals-cash-flow"],
  ["computed.forensics.accruals.aggregateAccrualsBalanceSheet", "computed.forensics.aggregate-accruals-balance-sheet"],
  ["computed.valuation.dcf.perShare", "computed.valuation.dcf-per-share"],
];
const FIGURE_METRIC_ALIASES = new Map(FIGURE_ALIAS_GROUPS.flatMap((group) =>
  group.map((source): [string, string] => [source, group[0]!])));

/**
 * The identities a figure row is deduplicated on: its exact source, or a registered metric alias. D-301: rows
 * merge only when every part is identical: the underlying traced value (never its display text or a rounding of
 * it), the metric (the same source or a registered alias of it), the stated window and period context, the unit,
 * currency and as-of date, and the verification mark. A window is never inferred from an end date, and a failed
 * mark is never dropped: a contradicted or unconfirmed copy is a different row from a checked one.
 */
function figureIdentities(row: FigureRow): string[] {
  const n = row.trace;
  const p = n.periodContext;
  const context = p === undefined ? null : p.kind === "instant"
    ? [p.kind, p.at, p.basis ?? null, p.fiscalLabel ?? null]
    : [p.kind, p.start, p.end, p.basis ?? null, p.fiscalLabel ?? null];
  const basis = [n.unit, n.currency ?? null, n.asOf, n.period ?? null, context, row.cited];
  const source = n.sourceId ?? n.source;
  const exact = JSON.stringify(["source", source, n.value, ...basis]);
  const metric = FIGURE_METRIC_ALIASES.get(source);
  return metric === undefined ? [exact] : [exact, JSON.stringify(["alias", metric, n.value, ...basis])];
}

/**
 * Figure rows with exact duplicates removed (D-62): the capital bridge and the forensic battery register the same
 * figure under two ids (`computed.current-capital.*` and `computed.capital.current.*`), and the report printed
 * both. `seen` carries identities across the tables of one section. The first occurrence wins; the rows it removes
 * are identical in value, metric, window, basis and mark (`figureIdentities`), so nothing a reader could see is
 * lost. D-301 retires D-264's merge of an alias copy that omits its period: missing metadata is not evidence that
 * two windows match, so such copies print as their own rows.
 */
export function dedupeFigureRows(rows: readonly FigureRow[], seen: Map<string, FigureRow> = new Map()): FigureRow[] {
  const out: FigureRow[] = [];
  for (const row of rows) {
    const identities = figureIdentities(row);
    if (identities.some((identity) => seen.has(identity))) continue;
    const copy = { ...row };
    for (const identity of identities) seen.set(identity, copy);
    out.push(copy);
  }
  return out;
}

export function figureRows(numbers: readonly TracedNumber[], seen?: Map<string, FigureRow>): FigureRow[] {
  return dedupeFigureRows(numbers.map((n) => figureRow(n)), seen);
}

/* ======================================================================== *
 * Tables: hide empty ones, drop always-empty columns
 * ======================================================================== */

const EMPTY_CELL = new Set(["", "n/a", "—", "-", "not supplied", "unavailable", "unknown"]);

function isEmptyCell(cell: string): boolean {
  return EMPTY_CELL.has(cell.replace(/<[^>]*>/g, "").trim().toLowerCase());
}

/**
 * Drop columns whose every cell is empty ("n/a", "—", "not supplied"), and
 * hide the table (null) when no row has any content beyond its first cell.
 * The first column is the row label and is never dropped. `keep` names
 * columns that stay even when empty.
 */
export function pruneTable(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
  keep: readonly string[] = [],
): { headers: string[]; rows: string[][] } | null {
  const rowKeys = new Set<string>();
  const contentRows = rows.filter(row => {
    if (!row.some(cell => !isEmptyCell(cell))) return false;
    const key = JSON.stringify(row);
    if (rowKeys.has(key)) return false;
    rowKeys.add(key);
    return true;
  });
  if (contentRows.length === 0) return null;
  const keepIndex = headers.map((header, index) =>
    index === 0 || keep.includes(header) || contentRows.some((row) => !isEmptyCell(row[index] ?? "")));
  return {
    headers: headers.filter((_, index) => keepIndex[index]),
    rows: contentRows.map((row) => row.filter((_, index) => keepIndex[index])),
  };
}

/* ======================================================================== *
 * Display text for repeated pipeline strings
 * ======================================================================== */

/**
 * Raw base-unit integers inside stored sentences ("starting revenue
 * 302969000000 reporting-currency units", "diluted shares 24285000000") shown
 * compactly ("302.97B"). Display only; ten or more digits, so years and counts
 * are untouched. D-279 (P22): a quantity never starts with a zero, so a
 * zero-padded identifier (an SEC accession, dashed or not, or a padded CIK)
 * is never compacted, and nothing inside a URL is rewritten.
 */
export function compactLongIntegers(text: string): string {
  return text.split(/((?:https?:\/\/|www\.)[^\s<>"']+)/i).map((part, index) => index % 2 === 1 ? part
    : part.replace(/(^|[^\d.,\-])(-?[1-9]\d{9,})(?!\d|[.,]\d|-\d)/g, (_, lead: string, digits: string) => `${lead}${formatLargeNumber(Number(digits))}`)
      .replace(/([\dKMBT])\s+reporting-currency units/g, "$1 (reporting currency)")
      .replace(/\(reporting-currency units\)/g, "(reporting currency)")).join("");
}

/**
 * Lines common to every list are stated once (D-62): the three scenario
 * cards and the four projection series each repeated the same assumption
 * block. Order follows the first list.
 */
export function splitCommonLines(lists: readonly (readonly string[])[]): { common: string[]; specific: string[][] } {
  if (lists.length < 2) return { common: [], specific: lists.map((list) => [...list]) };
  const [first, ...rest] = lists;
  const common = first!.filter((line) => rest.every((list) => list.includes(line)));
  const commonSet = new Set(common);
  return { common, specific: lists.map((list) => list.filter((line) => !commonSet.has(line))) };
}

/** Heading of the qualitative scenario block shown when no cash-flow model exists. */
export const QUALITATIVE_SCENARIO_HEADING = "Scenario conditions (qualitative)";

/**
 * D-163: remove a commentary prefix that repeats its list heading; state the heading once while preserving
 * stored text.
 */
export function scenarioListItem(text: string): string {
  const stripped = text.replace(/^\s*(?:qualitative commentary|what would have to be true)\s*:\s*/i, "");
  return stripped === text || stripped.length === 0 ? text : stripped[0]!.toUpperCase() + stripped.slice(1);
}

/** The label scenario presentation stores before each analyst condition (applyScenarioPresentation). */
export const SEPARATE_CONDITION_PREFIX = "Separate qualitative condition, not a modeled input or prerequisite for this target: ";
export const SEPARATE_CONDITIONS_HEADING = "Separate qualitative conditions (not modeled inputs or prerequisites for this target)";
const MODELED_CONDITIONS = "Modeled conditions: ";
/** Stands in for the first assumption a modeled condition repeats word for word. */
export const MODELED_SHIFT_REFERENCE = "the year-one shift under Assumptions.";

export interface ScenarioReaderLists {
  conditions: string[];
  commentary: string[];
  /** The analyst conditions the stored text prefixed one by one, printed under one heading. */
  separateConditions: string[];
}

/**
 * D-273: the Markdown and print scenario cards state a repeated label once. A modeled condition that opens with an
 * assumption the card already lists refers to it instead of repeating it; the conditions each stored with the same
 * "separate qualitative condition" prefix print under one heading that keeps that warning once. Every assumption
 * and condition still prints; stored text is unchanged.
 */
export function scenarioReaderLists(scenario: Pick<Scenario, "whatWouldHaveToBeTrue" | "qualitativeCommentary" | "assumptions">, assumptions: readonly string[]): ScenarioReaderLists {
  const listed = [...new Set([...assumptions, ...scenario.assumptions])].filter(a => a.trim().length > 0).sort((x, y) => y.length - x.length);
  const conditions = scenario.whatWouldHaveToBeTrue.map(condition => {
    if (!condition.startsWith(MODELED_CONDITIONS)) return scenarioListItem(condition);
    const rest = condition.slice(MODELED_CONDITIONS.length);
    // only a whole code-written year-one-shift sentence is replaced, so the reference names what it replaces and
    // a longer or different condition ("Revenue grows 5%-10%.") prints as stored.
    const repeated = listed.find(a => /^Year-one shift\b/.test(a) && /\.$/.test(a) && rest.startsWith(a) && (rest.length === a.length || rest[a.length] === " "));
    return repeated === undefined ? condition : `${MODELED_CONDITIONS}${MODELED_SHIFT_REFERENCE}${rest.slice(repeated.length)}`;
  });
  const commentary: string[] = [];
  const separateConditions: string[] = [];
  for (const text of scenario.qualitativeCommentary ?? []) {
    if (text.startsWith(SEPARATE_CONDITION_PREFIX) && text.length > SEPARATE_CONDITION_PREFIX.length) separateConditions.push(text.slice(SEPARATE_CONDITION_PREFIX.length));
    else commentary.push(scenarioListItem(text));
  }
  return { conditions, commentary, separateConditions };
}

/**
 * P22: map peerColumnKeys to reader headings rather than exposing a registry id's final segment as the column
 * label.
 */
export function peerTableColumns(peers: readonly { metrics: readonly TracedNumber[] }[]): { keys: string[]; headings: string[] } {
  const keys: string[] = [];
  const headings: string[] = [];
  for (const peer of peers) {
    const rowKeys = peerColumnKeys(peer.metrics);
    rowKeys.forEach((key, i) => {
      if (keys.includes(key)) return;
      const source = peer.metrics[i]!.source;
      const occurrence = / \((\d+)\)$/.exec(key)?.[1];
      const base = /^(computed|payload)\.[^\s]+$/.test(source) && !/^payload\.peers\.[^.]+$/.test(source) ? metricLabel(source) : key.replace(/ \(\d+\)$/, "");
      keys.push(key);
      headings.push(occurrence === undefined ? base : `${base} (${occurrence})`);
    });
  }
  return { keys, headings };
}

/**
 * D-62: without a cash-flow model, withhold targets, probabilities and deterministic assumptions but retain
 * each case’s stated conditions and qualitative analysis. State shared lines once; return null when every case
 * is empty.
 */
export function qualitativeScenarioConditions(scenarios: readonly Pick<Scenario, "name" | "whatWouldHaveToBeTrue" | "qualitativeCommentary">[]): {
  commonConditions: string[]; commonCommentary: string[];
  cases: { name: Scenario["name"]; conditions: string[]; commentary: string[] }[];
} | null {
  const conditions = splitCommonLines(scenarios.map((sc) => sc.whatWouldHaveToBeTrue.map(scenarioListItem)));
  const commentary = splitCommonLines(scenarios.map((sc) => (sc.qualitativeCommentary ?? []).map(scenarioListItem)));
  const cases = scenarios.map((sc, i) => ({ name: sc.name, conditions: conditions.specific[i] ?? [], commentary: commentary.specific[i] ?? [] }))
    .filter((c) => c.conditions.length > 0 || c.commentary.length > 0);
  return conditions.common.length === 0 && commentary.common.length === 0 && cases.length === 0
    ? null : { commonConditions: conditions.common, commonCommentary: commentary.common, cases };
}

/** Display name for a geographic segment ("TAIWAN, PROVINCE OF CHINA" → "Taiwan"). */
export function geographyLabel(name: string, siblings: readonly { name: string }[] = []): string {
  // D-264: retain the vendor's words, without claiming an exhaustive non-US scope.
  if (/^(?:non[ -]?us|outside u\.?s\.?|international|foreign)$/i.test(name.trim()) && siblings.some(row =>
    !/^(?:non[ -]?us|outside u\.?s\.?|international|foreign|united states|u\.?s\.?|usa)$/i.test(row.name.trim()))) {
    return `${name} (vendor label; scope not established beside named regions)`;
  }
  const fixed: Record<string, string> = {
    "TAIWAN, PROVINCE OF CHINA": "Taiwan",
    "TAIWAN": "Taiwan",
    "UNITED STATES": "United States",
    "KOREA, REPUBLIC OF": "South Korea",
    "UNITED KINGDOM": "United Kingdom",
  };
  const upper = name.trim().toUpperCase();
  if (fixed[upper] !== undefined) return fixed[upper];
  if (name === upper && /[A-Z]/.test(name)) {
    return name.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
  }
  return name;
}

const MOAT_SOURCE: Record<MoatAssessment["source"], string> = {
  switchingCosts: "Switching costs",
  networkEffects: "Network effects",
  scale: "Scale",
  brand: "Brand",
  ip: "Intellectual property",
};

/** "Scale — narrow" rather than the raw enums "scale (narrow)". */
export function moatHeading(m: Pick<MoatAssessment, "source" | "strength">): string {
  return `${MOAT_SOURCE[m.source] ?? m.source} — ${m.strength}`;
}

export function moatSourceLabel(source: MoatAssessment["source"]): string {
  return MOAT_SOURCE[source] ?? source;
}

/* ======================================================================== *
 * D-271: the business story
 * ======================================================================== */

export { BUSINESS_STORY_HEADING };

export interface BusinessStoryLine {
  /** The stated name when a validated or qualitative FACT claim of the line writes it; otherwise the code-owned heading (P18). */
  heading: string;
  claims: readonly SourcedClaim[];
}

export interface BusinessStoryBlock {
  key: "products" | "whatIsComing" | "customersAndSuppliers" | "competitorsByProductLine" | "protection" | "managementPlan" | "industry";
  heading: string;
  /** Plain claim list; empty for a product-line block. */
  claims: readonly SourcedClaim[];
  /** Product-line items; empty for a plain claim block. */
  lines: readonly BusinessStoryLine[];
}

/**
 * D-271,: a heading is a name, never a claim. It is printed only when a FACT claim that writes the name verified
 * (a matched figure) or is a cited qualitative statement. A contradicted, unverified or unchecked claim never
 * lends its words to an unmarked heading; that line prints the code-owned heading and its bullets keep their own
 * marks. Read time, so a stored report obeys too; with no verification log nothing supports a name.
 */
const SUPPORTING_MARKS = new Set(["validated", "qualitative"]);
const productLines = (items: Business["products"] | Competitive["competitorsByProductLine"]): BusinessStoryLine[] =>
  (items ?? []).filter(item => item.claims.length > 0).map(item => ({
    heading: productLineNamingClaims(item).some(claim => SUPPORTING_MARKS.has(claimStatusMark(claim) ?? ""))
      ? item.productLine.trim() : UNNAMED_PRODUCT_LINE_HEADING,
    claims: item.claims,
  }));

/**
 * D-271 (P22): the subsections of "The business", in reading order, for the
 * app, Markdown and print. A field that is absent (every report saved before
 * D-271) or empty yields no block, so no empty heading is printed; when no
 * block remains the group itself is omitted. Read-time only: stored values
 * are never changed.
 */
export function businessStoryBlocks(
  business: Pick<Business, "products" | "whatIsComing" | "customersAndSuppliers" | "protection" | "managementPlan" | "industry">,
  competitive?: Pick<Competitive, "competitorsByProductLine">,
): BusinessStoryBlock[] {
  const blocks: BusinessStoryBlock[] = [
    { key: "products", heading: "Products and services", claims: [], lines: productLines(business.products) },
    { key: "whatIsComing", heading: "What is coming", claims: business.whatIsComing ?? [], lines: [] },
    { key: "customersAndSuppliers", heading: "Customers and suppliers", claims: business.customersAndSuppliers ?? [], lines: [] },
    { key: "competitorsByProductLine", heading: "Competitors by product line", claims: [], lines: productLines(competitive?.competitorsByProductLine) },
    { key: "protection", heading: "Protection and expiry", claims: business.protection ?? [], lines: [] },
    { key: "managementPlan", heading: "Management's plan", claims: business.managementPlan ?? [], lines: [] },
    { key: "industry", heading: "Industry", claims: business.industry ?? [], lines: [] },
  ];
  return blocks.filter(block => block.claims.length > 0 || block.lines.length > 0);
}

/* ======================================================================== *
 * D-273: a statement repeated in several places is shown once in full
 * ======================================================================== */

/** Repeated claim object → the place (section › list) where it is shown in full. */
const claimHomes = new WeakMap<object, string>();
const echoIndexed = new WeakSet<object>();

/**
 * P20: the identity keeps the whole citation (the stored source and source id) and its resolved date, so the same
 * words cited to a different filing or date are a different statement and print in both places.
 */
export function claimEchoKey(claim: SourcedClaim): string {
  return [claim.label, claim.text.trim().replace(/\s+/g, " "), citationSourceId(claim) ?? "", claim.source, claim.sourceId ?? "",
    citationAsOf(claim) ?? "", claim.asOf ?? "", claimStatusMark(claim) ?? ""].join("\u0000");
}

/**
 * D-273 (P22): the reader's claim lists in reading order (the D-273 section
 * order), each with the label of where it prints. Only these lists take part
 * in repeat removal; a claim anywhere else always prints.
 */
function readerClaimLists(report: Report): Array<readonly [string, readonly SourcedClaim[]]> {
  const at = (key: Parameters<typeof reportSection>[0], list: string) => `${reportSection(key).printTitle} › ${list}`;
  const v = report.verdict;
  const b = report.business;
  const c = report.competitive;
  const o = report.outlook;
  const bs = report.balanceSheet;
  const lists: Array<readonly [string, readonly SourcedClaim[]]> = [
    [at("verdict", "Executive summary"), v.executiveSummary ?? []],
    [at("verdict", RECENT_DEVELOPMENTS_LIST), [...(v.recentDevelopments?.summary ?? []), ...(v.recentDevelopments?.items ?? []).flatMap(developmentClaims)]],
    [at("business", "What they sell"), b.whatTheySell],
    [at("business", "Market & industry structure"), b.marketStructure ?? []],
    ...businessStoryBlocks(b, c).map(block => [at("business", block.heading), [...block.claims, ...block.lines.flatMap(line => line.claims)]] as const),
    [at("business", "Concentration risks"), b.concentrationRisks],
    [at("competitive", "Moat grade"), c.moatGraded.reasoning],
    [at("competitive", "Competitors"), c.competitors ?? []],
    [at("competitive", "Moat assessment"), c.moatAssessment.flatMap(m => m.reasoning)],
    [at("outlook", "Segment trajectories"), o.segmentTrajectories],
    [at("outlook", "TAM"), o.tam ?? []],
    [at("outlook", "Estimate-revision trend"), o.estimateRevisionTrend],
    [at("outlook", "Guidance credibility"), o.guidanceCredibility],
    [at("outlook", "Scenario narratives"), [...o.scenarioNarratives.y1, ...o.scenarioNarratives.y3, ...o.scenarioNarratives.y5]],
    [at("catalystsRisks", "Catalysts"), report.catalystsRisks.catalysts.flatMap(item => Array.isArray(item.reasoning) ? item.reasoning : [])],
    [at("catalystsRisks", "Risks"), report.catalystsRisks.risks.flatMap(item => Array.isArray(item.reasoning) ? item.reasoning : [])],
    [at("fundamentals", "Reasoning"), report.fundamentals.graded.reasoning],
    [at("fundamentals", "Commentary"), report.fundamentals.commentary],
    [at("balanceSheet", "Reasoning"), bs.graded?.reasoning ?? []],
    [at("balanceSheet", "Debt profile"), bs.debtProfile.commentary],
    [at("balanceSheet", "Coverage"), bs.coverage.commentary],
    [at("balanceSheet", "Capex trajectory"), bs.capexTrajectory.commentary],
    [at("balanceSheet", "Capital allocation"), bs.capitalAllocation],
    [at("valuation", "Reasoning"), report.valuation.graded.reasoning],
    [at("quality", "Reasoning"), report.quality.graded.reasoning],
    [at("technicals", "Reasoning"), report.technicals.graded.reasoning],
    [at("leadership", "Reasoning"), report.leadership.graded.reasoning],
    [at("leadership", "Management actions"), (report.leadership.managementActions ?? []).flatMap(managementActionClaims)],
    [at("leadership", "Insider activity"), report.leadership.insiderSummary],
    [at("macro", "Sensitivity notes"), report.macro.sensitivityNotes],
  ];
  return lists;
}
const RECENT_DEVELOPMENTS_LIST = RECENT_DEVELOPMENTS_HEADING;

/**
 * D-273 (P22): index the report a reader surface is about to print. The first
 * occurrence of a statement (same label, text, citation, date and verification
 * mark) in reading order is its home and prints in full; every later
 * occurrence is skipped and its list says where the statement is. A statement
 * whose marks differ is not the same statement and prints in both places.
 * Read time only; stored claims and the verification log are unchanged (P21).
 */
export function indexRepeatedClaims(report: Report): void {
  if (echoIndexed.has(report)) return;
  echoIndexed.add(report);
  const homes = new Map<string, string>();
  for (const [home, claims] of readerClaimLists(report)) {
    for (const claim of claims) {
      const key = claimEchoKey(claim);
      const first = homes.get(key);
      if (first === undefined) homes.set(key, home);
      else claimHomes.set(claim, first);
    }
  }
}

/** Where a repeated claim is shown in full, or undefined for a claim that prints here. */
export function repeatedClaimHome(claim: SourcedClaim): string | undefined {
  return claimHomes.get(claim);
}

/** The claims a list prints, and the homes of the repeats it skips (in first-seen order). */
export function withoutRepeatedClaims(claims: readonly SourcedClaim[]): { shown: SourcedClaim[]; homes: string[] } {
  const shown: SourcedClaim[] = [];
  const homes: string[] = [];
  for (const claim of claims) {
    const home = claimHomes.get(claim);
    if (home === undefined) shown.push(claim);
    else if (!homes.includes(home)) homes.push(home);
  }
  return { shown, homes };
}

/** The one line a list prints for its skipped repeats, or null when none. */
export function repeatedClaimsNote(homes: readonly string[]): string | null {
  return homes.length === 0 ? null : `Also stated here, shown in full under ${homes.join("; ")}.`;
}

/* ======================================================================== *
 * D-273: the opening business brief
 * ======================================================================== */

export const BUSINESS_BRIEF_HEADING = "Business in brief";
/**
 * D-303 (P19, P22; R36): what an empty part says. It describes this report, never
 * the sources: a part whose answering fields hold no statement is not covered
 * here; a part whose statements did not qualify points to them, with their marks.
 */
export const BRIEF_PART_NOT_COVERED = "Not covered in this report.";
export const BRIEF_PART_NOT_SHOWN = "Not in the brief: the report's statements on this appear, with their marks, in the sections below.";
/**
 * Printed once instead of five empty parts, only when no part's fields hold any statement (`briefNotCovered`).
 * D-303: a report with statements that did not qualify prints each part's own wording instead, so a cited
 * statement below is never denied.
 */
export const BRIEF_NOT_ESTABLISHED = "Not covered in this report: the business fields the brief reads hold no statement.";

/** D-303: every part is empty because its fields hold nothing (never because statements did not qualify). */
export function briefNotCovered(parts: readonly BusinessBriefPart[]): boolean {
  return parts.every(part => part.claims.length === 0 && part.empty === BRIEF_PART_NOT_COVERED);
}
/** The most claims one part prints, so the brief stays short. */
export const BRIEF_CLAIMS_PER_PART = 1;

export interface BusinessBriefPart {
  key: "sells" | "buyers" | "wins" | "next" | "risks";
  heading: string;
  /** Verified claims only, each keeping its own citation. */
  claims: readonly SourcedClaim[];
  /** D-303: the line an empty part prints (not covered, or covered only below). */
  empty: string;
}

/**
 * P20: a statement of a limitation or an absence ("no reviewed source", "not disclosed") says what is not known; it
 * never fills a brief part, which then says it is not established.
 */
const LIMITATION_WORDS = /\b(?:no (?:reviewed |cited |retained )?(?:sources?|filings?|evidence|data)|no (?:further )?(?:details|information|disclosure)|not (?:established|disclosed|stated|available|reported|given|known|measured|in the (?:excerpts|filings|evidence))|(?:does|do|did) not (?:disclose|state|report|give|establish)|unavailable|cannot|could not)\b/i;
const SEVERITY_RANK: Readonly<Record<string, number>> = { high: 0, medium: 1, low: 2 };
const MOAT_RANK: Readonly<Record<MoatAssessment["strength"], number>> = { wide: 0, narrow: 1, none: 2 };

/**
 * D-273 (P18, P19): a claim may enter the brief only when it is a FACT whose
 * own verification-log entry passed: a matched figure ("validated") or a cited
 * statement with no figure ("qualitative"). An unverified, contradicted or
 * unchecked claim, and every judgment, never enters. Code owns the selection;
 * no model text raises a claim's standing. Read time, so a saved report obeys too.
 */
export function isBriefEligible(claim: SourcedClaim): boolean {
  return claim.label === "FACT" && SUPPORTING_MARKS.has(claimStatusMark(claim) ?? "") && !LIMITATION_WORDS.test(claim.text) &&
    !briefCitationIds(claim).some(id => MARKET_OR_COMPUTED_SOURCE.test(id));
}

/**
 * P20: every identity a citation can carry, so an old bracketed citation the parser cannot resolve
 * ("[payload.quote.price · 2026-11-13 · 2026-11-13]") is still read by its leading id, and the source id field is
 * checked too. Any market or computed identity excludes the claim.
 */
function briefCitationIds(claim: SourcedClaim): string[] {
  const raw = typeof claim.source === "string" ? claim.source.trim() : "";
  const lead = raw.replace(/^\[\s*/, "").split(/\s*[·|\]]\s*/)[0] ?? "";
  return [citationSourceId(claim) ?? "", raw, lead, typeof claim.sourceId === "string" ? claim.sourceId : ""].filter(Boolean);
}

/**
 * D-273 (P18): the brief describes the business, so a claim that
 * cites a market or computed record ("The share price was USD 346.19.",
 * payload.quote.price) is a figure about the stock, never a business line.
 */
const MARKET_OR_COMPUTED_SOURCE = /^(?:payload|computed)\.|^fmp:/i;

/**
 * D-273 (P18): the descriptive parts (what it sells, customers and suppliers, protection) skip a
 * statement of change ("Mortgage fees decreased..."), which reports a result rather than describing the business.
 * The verifier's own direction vocabulary decides (findDirectionWords).
 */
function briefClaims(options: { descriptive: boolean }, ...sources: readonly (readonly SourcedClaim[])[]): SourcedClaim[] {
  const picked: SourcedClaim[] = [];
  const seen = new Set<string>();
  for (const claim of sources.flat()) {
    if (picked.length >= BRIEF_CLAIMS_PER_PART) break;
    const key = claim.text.trim();
    if (!isBriefEligible(claim) || seen.has(key)) continue;
    if (options.descriptive && findDirectionWords(claim.text).length > 0) continue;
    seen.add(key);
    picked.push(claim);
  }
  return picked;
}

/**
 * D-273 (P22): the five-part brief that opens the verdict, assembled by code
 * from the business fields in a fixed order (the D-271 field first, then the
 * older field that holds the same story). Call after the report's verification
 * marks are indexed (prepareReportForSurface does it); with no marks no
 * part is filled.
 */
export function businessBrief(report: Pick<Report, "business" | "competitive" | "catalystsRisks">): BusinessBriefPart[] {
  const b = report.business;
  const c = report.competitive;
  // each part reads only the field that answers it.: a word match cannot prove whose customer a statement names
  // or that a protection statement is a strength, so those two parts carry code-owned labels that describe their
  // field ("Customers and suppliers", "Protection and competition") instead of an interpretation.
  const moats = [...c.moatAssessment].filter(m => m.strength !== "none").sort((x, y) => MOAT_RANK[x.strength] - MOAT_RANK[y.strength]);
  const risks = [...report.catalystsRisks.risks].sort((x, y) => (SEVERITY_RANK[x.severity] ?? 3) - (SEVERITY_RANK[y.severity] ?? 3));
  const part = (key: BusinessBriefPart["key"], heading: string, descriptive: boolean, ...fields: readonly (readonly SourcedClaim[])[]): BusinessBriefPart => ({
    key, heading, claims: briefClaims({ descriptive }, ...fields),
    empty: fields.some(field => field.length > 0) ? BRIEF_PART_NOT_SHOWN : BRIEF_PART_NOT_COVERED,
  });
  return [
    part("sells", "What it sells", true, (b.products ?? []).flatMap(item => item.claims), b.whatTheySell),
    part("buyers", "Customers and suppliers", true, b.customersAndSuppliers ?? []),
    part("wins", "Protection and competition", true, b.protection ?? [], moats.flatMap(m => m.reasoning)),
    part("next", "What is next", false, b.whatIsComing ?? []),
    part("risks", "What could break it", false, risks.flatMap(item => reasoningClaims(item.reasoning)), b.concentrationRisks),
  ];
}

/* ======================================================================== *
 * D-67: executives
 * ======================================================================== */

type ExecutiveRecord = Report["leadership"]["executives"][number];

/** An executive grade for a reader: the raw enum "not-assessed" is never printed. */
export function executiveGradeText(grade: ExecutiveRecord["grade"]): string {
  return grade === "not-assessed" ? "Not assessed" : grade;
}

export interface ExecutiveGroups {
  /** Officers with a grade or dated office context: one card each. */
  assessed: ExecutiveRecord[];
  /** Officers with neither grade assessed: one line lists them. */
  notAssessed: ExecutiveRecord[];
  /** The lines that name them, one per distinct reason. */
  notAssessedLines: string[];
  /** Their cited facts (pay, succession events), kept under the line; their judgments are not. */
  notAssessedClaims: SourcedClaim[];
}

/**
 * D-67: collapse identical 'not assessed' executive cards to one line per distinct reason listing the
 * officers, retaining their cited facts beneath it.
 */
export function executiveGroups(executives: readonly ExecutiveRecord[], withContext: readonly ExecutiveRecord[] = []): ExecutiveGroups {
  const notAssessed = executives.filter((e) => e.grade === "not-assessed" && e.credibilityGrade === "not-assessed" && !withContext.includes(e));
  const assessed = executives.filter((e) => !notAssessed.includes(e));
  const byReason = new Map<string, ExecutiveRecord[]>();
  for (const e of notAssessed) {
    const reason = executiveAssessmentNote(e) ?? "";
    byReason.set(reason, [...(byReason.get(reason) ?? []), e]);
  }
  const notAssessedLines = [...byReason.entries()].map(([reason, people]) =>
    `Not assessed: ${people.map((e) => `${e.name} (${e.title})`).join("; ")}.${reason ? ` ${reason}` : ""}`);
  // only cited facts go under the line. The officer's judgments are the model's case for a grade the evidence gate
  // withheld, so "Not assessed" was followed by "X's execution grade recognizes...". D-302 (R35): an officer-name
  // prefix on a company figure reads as the company's record during that tenure.
  const notAssessedClaims = notAssessed.flatMap((e) => [...e.reasoning, ...EXECUTIVE_EVIDENCE_GROUPS.flatMap((group) => e.evidence[group.key] ?? [])]
    .filter((claim) => claim.label === "FACT").map((claim) => companyRecordClaim(e, claim, "named")));
  return { assessed, notAssessed, notAssessedLines, notAssessedClaims };
}

/**
 * D-67: the annual provider segment tables are the prior presentation; once
 * the quarterly XBRL tables are shown they leave the body (the audit export
 * keeps them). Without quarterly tables they remain the only segment view.
 */
export function showAnnualSegments(quarterlyShown: boolean): boolean {
  return !quarterlyShown;
}

/**
 * The heading of an annual provider segment table. When quarterly XBRL
 * segment tables are shown beside it, it says it is the prior-year annual
 * presentation (D-62) instead of reading as current mix.
 */
export function annualSegmentHeading(kind: "Product" | "Geographic", rows: readonly { revenue: TracedNumber; sharePct?: number | null; shareWithheldReason?: "no-same-period-revenue" | "revenue-refused" | "split-does-not-reconcile" }[], quarterlyShown: boolean): string {
  const reasons = {"no-same-period-revenue":"no same-period revenue", "revenue-refused":"revenue refused", "split-does-not-reconcile":"split does not reconcile"};
  const causes = [...new Set(rows.flatMap(row => row.shareWithheldReason ? [reasons[row.shareWithheldReason]] : []))];
  const incomplete = rows.length > 0 && rows.every(row => row.sharePct === null)
    ? ` (${causes.join("; ") || "share basis not established"}; shares withheld)` : "";
  if (!quarterlyShown) return `${kind} segments${incomplete}`;
  const asOf = rows.find((row) => row.revenue.asOf)?.revenue.asOf;
  return `${kind} segments — annual${asOf ? `, fiscal year ended ${asOf}` : ""} (prior presentation)${incomplete}`;
}

/** A primary geography definition travels with every row, including exceptions. */
export function geographicBasisNote(rows: readonly { revenue: TracedNumber }[]): string | null {
  const first = rows[0]?.revenue;
  const note = first?.verificationNote;
  return first && typeof note === "string" && note.startsWith("Annual geographic revenue (") &&
    first.source.startsWith("https://www.sec.gov/Archives/edgar/data/") &&
    rows.every(row => row.revenue.source === first.source && row.revenue.verificationNote === note) ? note : null;
}

/** A daily bar from a US session that was still open when the subject's price history was fetched. */
export interface ProvisionalSessionBar { date: string; fetchedAt: string; clock: string }

/** Is this appendix source the subject's own daily price history (FMP end-of-day or Yahoo chart)? */
function isDailyHistoryFor(source: Report["appendix"]["sources"][number], symbol: string): boolean {
  const same = (value: string) => {
    let decoded = value;
    try { decoded = decodeURIComponent(value); } catch { /* keep the raw text */ }
    return decoded.toUpperCase().replace(/-/g, ".") === symbol.replace(/-/g, ".");
  };
  if (source.provider === "fmp" && /^\/(?:stable\/historical-price-eod\/|api\/v3\/historical-price-full\/)/.test(source.endpoint)) {
    const query = /[?&]symbol=([^&\s]+)/.exec(source.endpoint)?.[1] ?? /historical-price-full\/([^?\s/]+)/.exec(source.endpoint)?.[1];
    return query !== undefined && same(query);
  }
  if (source.provider === "yahoo") {
    const path = /^\/v8\/finance\/chart\/([^?\s/]+)/.exec(source.endpoint)?.[1];
    return path !== undefined && same(path);
  }
  return false;
}

/**
 * a daily price history fetched while a session is open can end in that session's still-forming bar, and reports
 * built before Stage B began excluding it call that bar's latest trade the "last close". The bar is provisional
 * when the technicals' last close is dated on the session in progress when the subject's daily history was fetched
 * (or, when no history fetch is recorded, when the quote was taken).
 */
export function provisionalSessionBar(report: Pick<Report, "meta" | "technicals"> & { appendix?: Pick<Report["appendix"], "sources"> }): ProvisionalSessionBar | null {
  const lastClose = [...report.technicals.graded.keyNumbers, ...report.technicals.indicators].find((n) => n.source === "computed.technicals.last-close");
  if (!lastClose?.asOf) return null;
  const symbol = report.meta.symbol.toUpperCase();
  const history = (report.appendix?.sources ?? []).filter((s) => isDailyHistoryFor(s, symbol)).map((s) => s.fetchedAt);
  const quote = report.meta.evidenceTiming?.quote;
  const candidates = history.length > 0 ? history : [quote?.acquiredAt ?? quote?.observedAt ?? null];
  const fetchedAt = candidates.find((at): at is string => typeof at === "string" && inProgressUsSessionDate(at) === lastClose.asOf);
  const clock = fetchedAt === undefined ? null : newYorkClock(fetchedAt);
  return fetchedAt === undefined || clock === null ? null : { date: lastClose.asOf, fetchedAt, clock: clock.hhmm };
}

/** The reader label for a last close that is really a still-forming session bar. */
export function provisionalBarLabel(bar: ProvisionalSessionBar): string {
  return `Price in the unfinished ${bar.date} session (fetched ${bar.clock} ET)`;
}

/** The technicals note that keeps the session status beside every level read from that bar. */
export function provisionalBarNote(bar: ProvisionalSessionBar): string {
  return `Price-history timing: the daily price history was fetched at ${bar.clock} ET on ${bar.date}, while that session was still open, so its ${bar.date} bar is unfinished. The price this section calls the last close is the latest trade at fetch time, not a settled closing price, and the moving averages, RSI, 52-week range and drawdown include that partial session.`;
}

/** A technicals figure's label: the last close of an unfinished session is named as such. */
export function technicalsFigureLabel(n: TracedNumber, bar: ProvisionalSessionBar | null): string | undefined {
  return bar !== null && n.source === "computed.technicals.last-close" && n.asOf === bar.date ? provisionalBarLabel(bar) : undefined;
}

/**
 * A technical indicator's label. The last close comes from the daily bars, not
 * from the quote: an intraday quote time says nothing about whether that bar
 * was settled (after the admission fix it is the previous session's close).
 */
export function indicatorLabel(n: TracedNumber, bar: ProvisionalSessionBar | null): string {
  return technicalsFigureLabel(n, bar) ?? metricLabel(n.source, n.unit);
}

/** The reverse-DCF implied value with the unit its metric names. */
export function reverseDcfValueText(metric: string, value: number | null): string {
  if (value === null || !Number.isFinite(value) || /not applicable|unavailable|^n\/a\b/i.test(metric)) return "\u2014";
  return /growth|margin|rate|return|cagr/i.test(metric) ? formatPct(value) : formatNumber(value, 1);
}

/* ======================================================================== *
 * Price timing: "last close" versus an intraday quote
 * ======================================================================== */

/** New York wall-clock parts of an ISO instant, or null when it does not parse. */
function newYorkClock(iso: string): { weekday: string; minutes: number; hhmm: string } | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return { weekday: get("weekday"), minutes: hour * 60 + minute, hhmm: `${get("hour")}:${get("minute")}` };
}

/** Reader-only correction; stored figures and audit exports retain their original bytes. */
export function routeMetricsForDisplay(report: Pick<Report, "routeMetrics" | "appendix">): RouteMetrics | undefined {
  const reason = report.appendix.missingData.find(g => g.field === "valuation.excessReturn.currency" || g.field === "valuation.excessReturn.reverseSolve.currency")?.reason;
  if (!report.routeMetrics || !reason) return report.routeMetrics;
  return { ...report.routeMetrics, metrics: report.routeMetrics.metrics.map(m =>
    m.key === "pTbv" || m.key === "premiumToJustified" ? { ...m, value: null, withheldReason: reason } : m) };
}

/**
 * How to name the quoted price: "last close" when the quote was observed at or after the 16:00 New York close (or
 * on a weekend), "latest price" with the time when it was observed during the session.
 */
export function priceTiming(report: Pick<Report, "meta">): { label: string; detail: string | null; intraday: boolean } {
  const observed = report.meta.evidenceTiming?.quote.observedAt ?? null;
  if (observed === null) return { label: "Price", detail: null, intraday: false };
  const clock = newYorkClock(observed);
  if (clock === null) return { label: "Price", detail: null, intraday: false };
  const weekend = clock.weekday === "Sat" || clock.weekday === "Sun";
  if (!weekend && clock.minutes >= 9 * 60 + 30 && clock.minutes < 16 * 60) {
    return { label: "Latest price", detail: `intraday, ${clock.hhmm} ET`, intraday: true };
  }
  return { label: "Last close", detail: null, intraday: false };
}

/* ======================================================================== *
 * Key-data box (page 1)
 * ======================================================================== */

/** D-175: the Key data row that leads when the newest filing is not yet cross-checked. */
export const FRESH_FILING_LABEL = "Newest filing";

/**
 * The key data rows the cover ledger repeats: the lead row, the composite grade,
 * the model fair value and the scenario range. A fresh-filing caution leads
 * without displacing the row that led before it (the price).
 */
export function coverLedgerRows(rows: readonly KeyDataRow[]): KeyDataRow[] {
  const lead = rows[0]?.label === FRESH_FILING_LABEL ? 2 : 1;
  return rows.filter((row, index) => index < lead || row.label === "Composite grade" || isFairValueKeyDataLabel(row.label) || row.label.startsWith("Scenario range"));
}

export interface KeyDataRow {
  label: string;
  value: string;
  note?: string;
}

/** Every TracedNumber in the report body (the verification log excluded), in document order. */
function collectTraces(report: Report): TracedNumber[] {
  const out: TracedNumber[] = [];
  const visit = (node: unknown, depth: number): void => {
    if (depth > 12 || node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    const record = node as Record<string, unknown>;
    if (typeof record.value === "number" && typeof record.unit === "string" && typeof record.source === "string") {
      out.push(record as unknown as TracedNumber);
      return;
    }
    for (const [key, value] of Object.entries(record)) {
      if (key === "appendix" || key === "verificationLog") continue;
      visit(value, depth + 1);
    }
  };
  visit(report, 0);
  return out;
}

function firstTrace(traces: readonly TracedNumber[], pattern: RegExp): TracedNumber | null {
  return traces.find((trace) => pattern.test(trace.source) && Number.isFinite(trace.value)) ?? null;
}

function money(value: number, currency: string | null, perShare = false): string {
  return perShare ? formatMoneyAmount(value, currency, 2) : formatFinancialAmount(value, "currency", currency);
}

/** "$9.28" for a per-share amount, "$409.80B" for a total, in the established currency. */
function perShareOrTotal(value: number, currency: string | null, perShare: boolean): string {
  return money(value, currency, perShare);
}

type FloatData = NonNullable<Report["marketData"]>["shares"] | undefined;
function comparableFloatDate(shares: FloatData): boolean {
  return shares !== null && shares !== undefined &&
    (shares.floatAsOf === undefined || (shares.floatAsOf !== null && shares.floatAsOf === shares.asOf));
}
function comparableFloatShares(shares: FloatData): number | null {
  if (!comparableFloatDate(shares) || shares?.float == null || !Number.isFinite(shares.float) || shares.float < 0) return null;
  if (shares.outstanding !== null && shares.float > shares.outstanding) return null;
  return shares.float;
}

/**
 * The page-1 key-data box, built ONLY from values already in the report: the provider market data block (D-62)
 * when present, else the traced quote, technicals and DCF bridge. A row whose inputs are absent is omitted, never
 * printed as "n/a". Derived rows (enterprise value at the quote, forward P/E, dividend yield, short interest as a
 * share of float) say how they were derived.
 */
export function keyDataRows(report: Report): KeyDataRow[] {
  const traces = collectTraces(report);
  const md = report.marketData;
  const rows: KeyDataRow[] = [];
  // D-175: a newest filing not yet cross-checked against SEC data leads page one.
  const fresh = report.appendix.missingData.find(gap => gap.field === "validation.freshFiling" && !gap.resolution);
  if (fresh) rows.push({ label: FRESH_FILING_LABEL, value: "not yet cross-checked", note: fresh.reason });
  const perimeter = firstTrace(traces, /^computed\.current-capital\.provider-debt-perimeter-includes-payables-to-third-party-loan-owners$/);
  if (perimeter) rows.push({ label: LENDER_DEBT_PERIMETER_LABEL, value: money(perimeter.value, perimeter.currency ?? null), note: `at ${perimeter.asOf}; filed borrowings and loan-owner payables are shown separately in the debt profile` });
  const bridge = report.valuation.dcf.bridge;
  const dcf = report.valuation.dcf.perShare;
  const modelCurrency = dcf ? establishedCurrency(dcf.unit, dcf.currency) : bridge?.currency ?? null;
  const priceTrace = firstTrace(traces, /^payload\.quote\.price$/) ?? firstTrace(traces, /^computed\.technicals\.last-close$/);
  const priceCurrency = md?.currency ?? (priceTrace ? establishedCurrency(priceTrace.unit, priceTrace.currency) ?? modelCurrency : modelCurrency);
  const timing = priceTiming(report);
  const price = md?.quote?.price ?? priceTrace?.value ?? null;
  const priceAsOf = md?.quote ? md.quote.asOf : priceTrace?.asOf ?? null;
  // The quote's observation time names a quote. Without one the box falls back to
  // the technicals' last close, which is named by its own daily bar (B2-17).
  const fromLastClose = md?.quote?.price == null && priceTrace?.source === "computed.technicals.last-close";
  const priceLabel = fromLastClose
    ? technicalsFigureLabel(priceTrace!, provisionalSessionBar(report)) ?? "Last close"
    : `${timing.label}${timing.detail ? ` (${timing.detail})` : ""}`;
  if (price !== null) {
    rows.push({ label: priceLabel, value: money(price, priceCurrency, true), note: priceAsOf ? `as of ${priceAsOf}` : "observation date unavailable" });
  }
  const quoteRange = md?.quote?.yearHigh != null && md.quote.yearLow != null;
  const high = quoteRange ? md!.quote!.yearHigh : firstTrace(traces, /^computed\.technicals\.52w-high$/)?.value ?? null;
  const low = quoteRange ? md!.quote!.yearLow : firstTrace(traces, /^computed\.technicals\.52w-low$/)?.value ?? null;
  if (high !== null && low !== null) rows.push({ label: `52-week range (${quoteRange ? "quote" : "computed"})`, value: `${money(low, priceCurrency, true)} – ${money(high, priceCurrency, true)}`,
    note: quoteRange ? "Provider quote range; it may use a different window or price basis than the computed technical range." : "Range from the retained price history used for technical calculations." });

  const quotedCap = md?.quote?.marketCap ?? firstTrace(traces, /^payload\.quote\.market-?cap$/)?.value ?? null;
  const dilutedShares = bridge?.dilutedShares ?? null;
  const scope = report.valuation.marketValueScope;
  const admittedPriceAsOf = scope?.priceAsOf ?? null;
  // a scope unresolved across share classes means the quote's cap may cover one class only, so page one shows no
  // figure as the issuer's (D-103).
  const classAmbiguous = scope?.status === "unresolved" && scope.classAmbiguity === true;
  const marketCap = scope?.status === "resolved" ? scope.marketCap : classAmbiguous ? null : quotedCap;
  if (classAmbiguous) rows.push({ label: "Issuer-common capitalization", value: "withheld", note: "class scope unresolved: the filings do not establish every class's outstanding count and economic relation to the quoted class; the quote's market cap may cover one class only" });
  if (marketCap !== null) rows.push(scope?.status === "resolved"
    ? { label: "Issuer-common capitalization", value: money(marketCap, scope.currency), note: `counts at ${scope.shareCountAsOf ?? "unavailable date"}; main quote as of ${admittedPriceAsOf ?? "unavailable date"}${scope.approximate ? scope.basis.includes("economic-weight approximation") ? "; economic-weight approximation" : "; same-price approximation" : ""}${scope.classPriceDates?.length ? `; separate class prices: ${scope.classPriceDates.map(row => `${row.classId} at ${row.asOf}`).join(", ")}` : ""}` }
    : md?.quote?.marketCapOrigin === "computed" && md.quote.marketCap === marketCap
      ? { label: scope ? "Derived market cap (scope unverified)" : "Market cap (derived)", value: money(marketCap, priceCurrency), note: `quote price × filed share count, computed by Métis${scope ? "; complete issuer-common coverage unverified" : ""}${priceAsOf ? `; as of ${priceAsOf}` : ""}` }
      : { label: scope ? "Provider market cap (scope unverified)" : "Market cap", value: money(marketCap, priceCurrency), note: scope ? `raw provider observation; complete issuer-common coverage unverified${priceAsOf ? `; as of ${priceAsOf}` : ""}` : "quote" });
  if (scope?.status === "resolved" && scope.enterpriseValue !== null) {
    rows.push({ label: "Enterprise value (market)", value: money(scope.enterpriseValue, scope.currency), note: "Issuer-common market capitalization plus the disclosed net claims; full bridge in the companion audit export." });
  } else if (!scope && marketCap !== null && bridge && bridge.netDebt !== null) {
    // Legacy reports retain their stored bridge convention; new reports use
    // the admitted Stage B EV, including its NCI, cash and lease scope guards.
    const ev = marketCap + bridge.netDebt + (bridge.noncontrollingBook ?? bridge.minorityInterest ?? 0) + (bridge.preferredEquity ?? 0);
    rows.push({ label: "Enterprise value (market)", value: money(ev, priceCurrency), note: `market cap + net debt${bridge.asOf ? ` at ${bridge.asOf}` : ""} (equity securities are not cash); the EV multiples use the same figure` });
  }
  const outstanding = md?.shares?.outstanding ?? null;
  if (scope?.status === "resolved" && scope.economicShares !== null) {
    rows.push({ label: `Economic share units${md?.shares?.shareUnit ? ` (${md.shares.shareUnit})` : ""}`, value: formatLargeNumber(scope.economicShares), note: `equivalence-weighted outstanding units at ${scope.shareCountAsOf ?? "unavailable date"}; not diluted weighted-average shares` });
  } else if (outstanding !== null && outstanding > 0) {
    const freeFloat = md?.shares?.freeFloatPct;
    rows.push({ label: `${scope ? "Provider shares (scope unverified)" : "Shares outstanding"}${md?.shares?.shareUnit ? ` (${md.shares.shareUnit})` : ""}`, value: formatLargeNumber(outstanding), note: scope ? `raw provider count; class coverage unverified${md?.shares?.asOf ? `; at ${md.shares.asOf}` : ""}` : comparableFloatDate(md?.shares) && freeFloat != null && freeFloat >= 0 && freeFloat <= 100 ? `${formatPct(freeFloat, 1)} free float` : undefined });
  } else if (!scope && dilutedShares !== null && dilutedShares > 0) {
    rows.push({ label: `Diluted shares${bridge?.shareUnit ? ` (${bridge.shareUnit})` : ""}`, value: formatLargeNumber(dilutedShares), note: bridge?.asOf ? `at ${bridge.asOf}` : undefined });
  }
  // the newer quarter's headline, apart from every statement figure (D-103).
  const newer = report.filingDisclosures ? shownFilingDisclosures(report.filingDisclosures).newerResults : undefined;
  if (newer && newer.revenue !== null && newer.epsDiluted !== null && newer.currency !== null) {
    rows.push({
      label: `${newer.reportedPeriod ?? `Quarter ended ${newer.reportedPeriodEnd ?? "after the statements"}`} (unaudited, from the results release)`,
      value: `revenue ${money(newer.revenue, newer.currency)}; diluted EPS ${money(newer.epsDiluted, newer.currency, true)}`,
      note: `${newer.source.form} ${newer.source.accession} filed ${newer.source.filingDate}; not in the statements, TTM or valuation, which end ${newer.statementsEnd}`,
    });
  }
  const capitalReturn = report.filingDisclosures?.capitalReturn ?? null;
  if (capitalReturn?.dividendPerShare != null && price !== null && price > 0) {
    // The price label may fall back to model currency; a yield cannot use that
    // fallback as evidence that a dividend and quote share one currency.
    const quotedCurrency = md?.currency ?? (priceTrace ? establishedCurrency(priceTrace.unit, priceTrace.currency) : null);
    const dividendCurrency = report.filingDisclosures?.currency;
    const yieldCurrency = comparePriceCurrency(dividendCurrency, quotedCurrency);
    const f=capitalReturn.dividendFrequency;
    const multiplier=f===undefined?4:f==="quarterly"?4:f==="monthly"?12:f==="semi-annual"?2:f==="annual"?1:null;
    const amount=money(capitalReturn.dividendPerShare, report.filingDisclosures?.currency ?? priceCurrency, true);
    rows.push(yieldCurrency.comparable ? multiplier===null ? {
      label:"Dividend yield",value:"withheld",note:f===null?"the release does not state the dividend's frequency":`a ${f} dividend is not annualized`,
    } : {
      label: "Dividend yield",
      value: formatPct(((capitalReturn.dividendPerShare * multiplier) / price) * 100, 2),
      note: f===undefined ? `${amount} annualized x4 as a quarterly dividend; this report did not record the release's stated frequency` : `${amount} ${f}${capitalReturn.dividendFrequencyBasis==="xbrl"?" (from the issuer's XBRL dividend facts)":""}${multiplier===1?"":", annualized"}`,
    } : {
      label: "Dividend yield", value: "withheld",
      note: yieldCurrency.mismatch
        ? `dividend in ${dividendCurrency}, quote in ${quotedCurrency} — no FX conversion is attempted`
        : yieldCurrency.reason,
    });
  }

  // Consensus: the provider block first, else any consensus figure the analysis cited.
  const estCurrency = md?.estimateCurrency ?? null;
  const target = md?.priceTarget?.consensus ?? firstTrace(traces, /^payload\.estimates\.price-target-consensus$/)?.value ?? null;
  if (target !== null && (md === undefined || estCurrency !== null)) {
    const lowT = md?.priceTarget?.low ?? firstTrace(traces, /^payload\.estimates\.price-target-low$/)?.value ?? null;
    const highT = md?.priceTarget?.high ?? firstTrace(traces, /^payload\.estimates\.price-target-high$/)?.value ?? null;
    const upside = price !== null && price > 0 ? ` (${formatPct((target / price - 1) * 100, 1, true)} vs price)` : "";
    rows.push({
      label: "Consensus price target",
      value: `${money(target, estCurrency ?? priceCurrency, true)}${upside}`,
      note: lowT !== null && highT !== null ? `range ${money(lowT, estCurrency ?? priceCurrency, true)} – ${money(highT, estCurrency ?? priceCurrency, true)}` : undefined,
    });
  }
  const grades = md?.gradeCounts;
  if (grades) {
    const total = grades.strongPositive + grades.positive + grades.neutral + grades.negative + grades.strongNegative;
    if (total > 0) rows.push({ label: "Analyst grades", value: `${grades.strongPositive + grades.positive} positive · ${grades.neutral} neutral · ${grades.negative + grades.strongNegative} negative`, note: `${total} analysts${grades.asOf ? `, as of ${grades.asOf}` : ""}` });
  }
  const estimates = estCurrency !== null ? md?.estimates ?? [] : [];
  estimates.forEach((e, index) => {
    const label = `Consensus FY+${index + 1} (year ending ${e.fiscalYearEnd})`;
    const parts = [
      e.revenueAvg !== null ? `revenue ${perShareOrTotal(e.revenueAvg, estCurrency, false)}` : null,
      e.epsAvg !== null ? `provider EPS ${perShareOrTotal(e.epsAvg, estCurrency, true)} (accounting basis unverified)` : null,
    ].filter((part): part is string => part !== null);
    if (parts.length > 0) rows.push({ label, value: parts.join(" · "), note: e.analystsRevenue !== null ? `${e.analystsRevenue} revenue / ${e.analystsEps ?? "?"} EPS estimates` : undefined });
  });
  if (md === undefined) {
    const consensusRevenue = firstTrace(traces, /^payload\.estimates\.est-revenue-\d{4}-\d{2}-\d{2}$/);
    if (consensusRevenue) rows.push({ label: metricLabel(consensusRevenue.source), value: formatFinancialAmount(consensusRevenue.value, consensusRevenue.unit, consensusRevenue.currency) });
  }

  const pe = report.valuation.multiples.find((m) => /^P\/E/i.test(m.name) && m.current !== null);
  // D-98, D-103: disclose non-operating gains behind P/E; name a P/E built from market cap over common income
  // separately from price over diluted EPS.
  if (pe) {
    // D-296: the aggregate P/E basis in current and stored wording.
    const notes = [/^(?:marketCap|market cap) \/ common income \(/.test(pe.basis ?? "") ? "market cap / common income, not price / diluted EPS" : null,
      pe.earningsCaveat ? `caveat: ${pe.earningsCaveat}` : null].filter((note): note is string => note !== null);
    rows.push({ label: pe.name, value: formatMultiple(pe.current), ...(notes.length > 0 ? { note: notes.join("; ") } : {}) });
  }
  const forward = estimates.find((e) => e.epsAvg !== null && e.epsAvg > 0);
  const tracedEps = md === undefined ? firstTrace(traces, /^payload\.estimates\.est-eps-\d{4}-\d{2}-\d{2}$/) : null;
  if (forward && price !== null) {
    rows.push({ label: "Price / provider EPS (basis unverified)", value: formatMultiple(price / forward.epsAvg!), note: `year ending ${forward.fiscalYearEnd}; not comparable to GAAP historical P/E or model operating EPS without verified accounting basis` });
  } else if (tracedEps && tracedEps.value > 0 && price !== null) {
    rows.push({ label: "Price / provider EPS (basis unverified)", value: formatMultiple(price / tracedEps.value), note: "Not comparable to GAAP historical P/E or model operating EPS without verified accounting basis" });
  }
  const epsSeries = report.projections?.series.find((s) => s.metric === "epsDiluted");
  const nextEps = epsSeries?.base[0];
  if (nextEps && price !== null && nextEps.value.value > 0) {
    // D-65: the model's EPS is operating EPS (EBIT less interest, taxed at the
    // DCF rate). The provider consensus does not establish an accounting basis.
    rows.push({ label: "Forward P/E (model base-case operating EPS)", value: formatMultiple(price / nextEps.value.value), note: `${nextEps.period}; excludes investment gains` });
  }
  const evEbitda = report.valuation.multiples.find((m) => /^EV\/EBITDA/i.test(m.name) && m.current !== null);
  // an EBITDA on a composed, lower-bound D&A says so. an annual-basis name already carries its year (D-103).
  // (D-112).
  const evLabel = (name: string): string => name === "EV/EBITDA" ? "EV/EBITDA (TTM)" : name;
  if (evEbitda) rows.push({ label: evLabel(evEbitda.name), value: formatMultiple(evEbitda.current), ...(evEbitda.earningsCaveat ? { note: `caveat: ${evEbitda.earningsCaveat}` } : {}) });
  else {
    // Net debt the pipeline withheld for the current EV is not an absent
    // input: say the multiple was withheld, so the box cannot read as merely
    // incomplete. Stage B files this gap for the current balance only, whether
    // the statement builder or the plausibility check withheld the debt.
    const withheldEv = report.valuation.multiples.find((m) => /^EV\/EBITDA/i.test(m.name));
    const netDebtGap = report.appendix.missingData.find((gap) => gap.severity !== "info" && !gap.resolution && gap.field === "valuation.multiples.netDebt");
    if (withheldEv && netDebtGap) rows.push({ label: evLabel(withheldEv.name), value: "withheld", note: "net debt withheld, so EV is too (see the data gaps)" });
  }

  const si = md?.shortInterest;
  if (si) {
    const float = comparableFloatShares(md?.shares);
    const ofFloat = float !== null && float > 0 ? `${formatPct((si.shares / float) * 100, 2)} of float (derived using float observed ${md?.shares?.floatAsOf ?? md?.shares?.asOf ?? "date unestablished"})` : null;
    rows.push({
      label: "Short interest",
      // A semicolon, not a second parenthesis: the ratio already carries its float date in one.
      value: `${formatLargeNumber(si.shares)} shares${ofFloat ? `; ${ofFloat}` : ""}`,
      note: [`settled ${si.settlementDate}`, si.daysToCover !== null ? `${formatNumber(si.daysToCover, 1)} days to cover` : null].filter(Boolean).join("; "),
    });
  }

  if (report.fairValue?.status === "dated-reference" && report.fairValue.reference) {
    const reference = report.fairValue.reference;
    rows.push({ label: "Dated reference model value",
      value: formatFinancialAmount(reference.perShare.value, reference.perShare.unit, reference.perShare.currency),
      note: readerFairValueReferenceText(report.fairValue) ?? undefined });
  }

  if (dcf) {
    const comparison = valuationComparison(dcf, report.valuation.dcf.upsidePct, "key-data");
    rows.push({
      label: fairValueKeyDataLabel(report.fairValue, "shown"),
      value: formatFinancialAmount(dcf.value, dcf.unit, dcf.currency),
      note: [
        comparison === null ? null : `${comparison.text} ${comparison.label}`,
        // the general-route DCF's base rate across the census (D-102).
        report.fairValue?.method === "fcff-dcf" ? dcfBaseRateText() : null,
        // the excess-return value from the fiscal-year start, when it differs by more than 5pp (D-102).
        report.fairValue?.alternative ? `${report.fairValue.alternative.label}: ${formatFinancialAmount(report.fairValue.alternative.perShare, dcf.unit, dcf.currency)}` : null,
        // the inputs an outage or refusal substituted (D-111).
        fairValueDegradedText(report.fairValue),
      ].filter((part): part is string => part !== null).join("; ") || undefined,
    });
  } else if (report.fairValue?.status === "outside-domain") {
    // the headline says why no DCF value is shown (D-102).
    rows.push({
      label: fairValueKeyDataLabel(report.fairValue, "shown"),
      value: "Model outside its domain",
      note: report.fairValue.basis[0]?.replace(/^Model outside its domain: /, "").replace(/\.$/, ""),
    });
  } else if (report.fairValue) {
    rows.push({ label: fairValueKeyDataLabel(report.fairValue, "unavailable"),
      value: "Unavailable for current use", note: report.fairValue.reasons.find(reason => reason.field === "valuation.currentUse")?.reason });
  }
  const bear = report.valuation.scenarios.find((s) => s.name === "bear")?.priceTarget ?? null;
  const bull = report.valuation.scenarios.find((s) => s.name === "bull")?.priceTarget ?? null;
  if (bear && bull) {
    rows.push({ label: "Scenario range (bear – bull, model)", value: `${formatFinancialAmount(bear.value, bear.unit, bear.currency)} – ${formatFinancialAmount(bull.value, bull.unit, bull.currency)}` });
  }
  const scores = report.scores;
  if (scores && scores.composite.score !== null) {
    // P20: the aspects' evidence floor and the neutral qualifier, with the
    // evidence share and the band thresholds beside the figure.
    rows.push({ label: "Composite grade", value: compositeText(scores), note: compositeNote(scores) });
  }
  // D-301 (P22; R29): a recorded caveat's raw base-unit amounts ("pre-tax income 174926000000") read in the shared number format.
  return rows.map(row => row.note ? { ...row, note: compactLongIntegers(row.note) } : row);
}

/**
 * The "Consensus and market" tables (D-62): FY+1/FY+2 consensus with ranges
 * and the forward P/E at the quote, then price targets, grade counts, short
 * interest and the provider's period-end enterprise value. Empty when the
 * report carries no provider market data.
 */
export function insiderEvidenceTables(report: Pick<Report, "marketData">): BodyTable[] {
  const notes = report.marketData?.insiderEvidence;
  return notes?.length ? [{ heading: "Form 4 reporting-person scope and selected rows", headers: ["Evidence"], rows: notes.map(note => [note]), note: "Provider aggregates and selected rows have separate windows." }] : [];
}

export function consensusTables(report: Report): BodyTable[] {
  const md = withHistoricalEnterpriseValueSafety(report).marketData;
  if (!md) return [];
  const tables: BodyTable[] = [];
  if (md.resultsHistory?.length) tables.push({
    heading: "Reported results versus provider consensus (last four reports)",
    headers: ["Report date", "Fiscal window", "Revenue actual", "Revenue estimate", "Difference", "Provider EPS actual (accounting basis unverified)", "Provider EPS estimate (accounting basis unverified)", "EPS difference (accounting basis unverified)", "Source / as-of"],
    rows: md.resultsHistory.map(r => [r.date, r.periodStart && r.periodEnd ? `${r.periodStart} to ${r.periodEnd}` : r.fiscalLabel ? `${r.fiscalLabel}${r.periodEnd ? `; ended ${r.periodEnd}` : ""} (start unestablished)` : "Unestablished", ...Object.entries(r.values).map(([key,v]) => v === null ? "Unavailable: input or currency not established" : r.currency ? money(v,r.currency,key.startsWith("eps")) : `${key.startsWith("eps") ? formatNumber(v, 2) : formatLargeNumber(v)} (currency unestablished)`), `fmp:earnings / ${r.asOf ?? "unavailable"}`]),
    note: "Differences are provider actual minus provider estimate. Report dates are not fiscal period boundaries. Provider EPS accounting basis unverified; never compare with GAAP EPS. Missing operands remain gaps.",
  });

  const cur = md.estimateCurrency;
  const price = md.quote?.price ?? null;
  if (md.estimates.length > 0 && cur !== null) {
    const cell = (v: number | null, perShare: boolean) => (v === null ? "—" : money(v, cur, perShare));
    const range = (lowV: number | null, highV: number | null, perShare: boolean) => (lowV === null || highV === null ? "—" : `${money(lowV, cur, perShare)} – ${money(highV, cur, perShare)}`);
    tables.push({
      heading: "Consensus estimates",
      headers: ["Item", ...md.estimates.map((e, i) => `FY+${i + 1} (ending ${e.fiscalYearEnd})`)],
      rows: [
        ["Revenue (mean)", ...md.estimates.map((e) => cell(e.revenueAvg, false))],
        ["Revenue (low – high)", ...md.estimates.map((e) => range(e.revenueLow, e.revenueHigh, false))],
        ["Provider EPS (mean; accounting basis unverified)", ...md.estimates.map((e) => cell(e.epsAvg, true))],
        ["Provider EPS (low - high; accounting basis unverified)", ...md.estimates.map((e) => range(e.epsLow, e.epsHigh, true))],
        ["Estimates (revenue / EPS)", ...md.estimates.map((e) => `${e.analystsRevenue ?? "—"} / ${e.analystsEps ?? "—"}`)],
        ["Price / provider EPS (basis unverified)", ...md.estimates.map((e) => (price !== null && e.epsAvg !== null && e.epsAvg > 0 ? formatMultiple(price / e.epsAvg) : "—"))],
      ],
      note: `Provider consensus; ${estimateTimingText(reportEstimateTiming(report), md.estimatesAsOf)}; fiscal years after the latest reported year.${md.estimateCurrencyBasis ? ` Currency ${md.estimateCurrencyBasis}.` : ""} EPS accounting basis unverified; do not compare with GAAP TTM EPS/P/E, adjusted guidance or model operating EPS without source evidence of a common basis. Consensus is other analysts' forecast, not this report's.`,
    });
  }
  const rows: string[][] = [];
  if (md.priceTarget && cur !== null) {
    const pt = md.priceTarget;
    if (pt.consensus !== null) {
      const parts = [pt.median !== null ? `median ${money(pt.median, cur, true)}` : null, pt.low !== null && pt.high !== null ? `range ${money(pt.low, cur, true)} – ${money(pt.high, cur, true)}` : null].filter(Boolean);
      rows.push(["Consensus price target", `${money(pt.consensus, cur, true)}${parts.length ? ` (${parts.join("; ")})` : ""}`]);
    }
    const recent = [
      pt.lastMonthCount !== null ? `${pt.lastMonthCount} in the last month${pt.lastMonthAverage !== null ? ` (mean ${money(pt.lastMonthAverage, cur, true)})` : ""}` : null,
      pt.lastQuarterCount !== null ? `${pt.lastQuarterCount} in the last quarter${pt.lastQuarterAverage !== null ? ` (mean ${money(pt.lastQuarterAverage, cur, true)})` : ""}` : null,
    ].filter(Boolean);
    if (recent.length > 0) rows.push(["Recent price targets", recent.join("; ")]);
  }
  if (md.gradeCounts) {
    const g = md.gradeCounts;
    rows.push(["Analyst grades (count)", `${g.strongPositive} strongly positive · ${g.positive} positive · ${g.neutral} neutral · ${g.negative} negative · ${g.strongNegative} strongly negative`]);
  }
  if (md.shortInterest) {
    const si = md.shortInterest;
    const float = comparableFloatShares(md.shares);
    rows.push(["Short interest", [
      `${formatLargeNumber(si.shares)} shares at settlement ${si.settlementDate}`,
      float !== null && float > 0 ? `${formatPct((si.shares / float) * 100, 2)} of float (derived using float observed ${md.shares?.floatAsOf ?? md.shares?.asOf ?? "date unestablished"}; not a FINRA-reported percentage)` : null,
      si.daysToCover !== null ? `${formatNumber(si.daysToCover, 1)} days to cover` : null,
      si.changePct !== null ? `${formatPct(si.changePct, 1, true)} vs prior settlement` : null,
    ].filter(Boolean).join("; ")]);
  }
  const resolvedMultiClass = report.valuation?.marketValueScope?.status === "resolved" && report.valuation.marketValueScope.multiClass === true;
  const oneClassOnly = report.valuation?.marketValueScope?.status === "unresolved" && report.valuation.marketValueScope.classAmbiguity === true ? "; may cover one share class only" : "";
  if (md.quote?.marketCap != null) rows.push([md.quote.marketCapOrigin === "computed" ? `Market cap (derived: quote × filed shares${oneClassOnly})` : resolvedMultiClass ? "Provider market cap (quoted class only; not issuer-common)" : `Market cap (quote${oneClassOnly})`, `${money(md.quote.marketCap, md.currency)}${md.quote.asOf ? ` as of ${md.quote.asOf}` : ""}`]);
  if (md.shares?.outstanding != null) rows.push([`${resolvedMultiClass ? "Provider shares (quoted class only)" : "Shares outstanding"}${md.shares.shareUnit ? ` (${md.shares.shareUnit})` : ""}`, `${formatLargeNumber(md.shares.outstanding)}${md.shares.float !== null ? `; float estimate ${formatLargeNumber(md.shares.float)}${md.shares.floatAsOf === undefined ? "" : md.shares.floatAsOf === null ? " (measurement date unestablished)" : ` measured ${md.shares.floatAsOf}`}` : ""}`]);
  const evLabel = md.enterpriseValueOrigin === "provider" ? "Provider enterprise value (vendor definition, period end)"
    : md.enterpriseValueOrigin === "computed" ? "Derived enterprise value (historical cash-only bridge)" : "Historical enterprise value (source definition unestablished)";
  if (md.enterpriseValue) rows.push([evLabel, `${money(md.enterpriseValue.value, md.currency)} at ${md.enterpriseValue.periodEnd} (that date's market cap + debt − cash and equivalents; not the report's market EV, which uses the quote and nets short-term investments)`]);
  if (md.enterpriseValueNote) rows.push(["Historical enterprise value", md.enterpriseValueNote]);
  if (rows.length > 0) tables.push({ heading: "Market data and positioning", headers: ["Item", "Value"], rows });
  return tables;
}

/* ======================================================================== *
 * Trust headline
 * ======================================================================== */

export interface TrustRow {
  label: string;
  value: string;
}

/** Authoritative selected row, separate from optional identity embedded in old snapshots. */
export interface ReportPresentationContext { selectedReportId?: number }
export function presentationReportId(report: Pick<Report,"meta">, context: ReportPresentationContext = {}): number | undefined {
  return context.selectedReportId ?? report.meta.reportId;
}
export function reportIdentityNote(report: Pick<Report,"meta">, context: ReportPresentationContext = {}): string | null {
  return context.selectedReportId !== undefined && report.meta.reportId !== undefined && context.selectedReportId !== report.meta.reportId
    ? `Selected saved row #${context.selectedReportId}; embedded report ID #${report.meta.reportId}. The selected row controls navigation and exports; its recorded content is unchanged.`
    : null;
}

/** Explicit recorded provenance, never a guess from the ticker or company name. */
export function syntheticNotice(report: Pick<Report, "meta" | "appendix">): string | null {
  const reserved = report.appendix.missingData.some(gap => /^fixture\.reserved\([^)]+\)$/.test(gap.field));
  const historical = report.meta.model === "synthetic-fixture" && report.meta.pipelineVersion.startsWith("synthetic-sample-");
  return reserved || historical
    ? "Synthetic demonstration · fictional issuer and invented observations. This snapshot is not live company research."
    : null;
}

/**
 * One reader note for a report not stamped with this build's evidence rules
 * (P21, D-217). It sits beside, never replaces, the specific legacy warnings.
 */
export function evidenceContractNotice(report: Pick<Report, "meta">): string | null {
  const status = evidenceContractStatus(report.meta);
  if (status.state === "absent") return "Built under older rules: this report has no evidence-rules stamp, so its figures are shown as saved.";
  if (status.state === "unrecognised") return `Built under unrecognised rules: this report's evidence-rules stamp ${JSON.stringify(status.stamp)} is not one this app knows, so its figures are shown as saved.`;
  return null;
}

/**
 * One reader note for a saved report that recorded no projections (P22, P20,
 * D-224). The app, Markdown, print and audit exports all read the sentence
 * and its condition from here. A report whose cash-flow model is unavailable
 * hides the projections section under its reader convention, so it gets no note.
 */
export function projectionsNotRecordedNotice(report: Pick<Report, "valuation" | "fairValue" | "projections">): string | null {
  return report.projections || unavailableCashFlowModel(report)
    ? null
    : "Projections were not recorded in this snapshot. No forecast series or scenario weights are inferred.";
}

export interface ManifestReconciliationRow {
  kind: "expected" | "info" | "data" | "process" | "resolved";
  label: string;
  entries: number;
  groups: number;
}

/** Disjoint accounting of every raw row; grouped display counts never replace recorded severities. */
export function manifestReconciliationRows(gaps: readonly ManifestEntry[], c: Pick<ReportCompletenessPresentation, "classification">): ManifestReconciliationRow[] {
  const k = c.classification;
  const sum = (rows: readonly ClassifiedGap[]) => rows.reduce((n, row) => n + row.fields.length, 0);
  const expected = gaps.filter(gap => gap.expected === true).length;
  const info = gaps.filter(gap => gap.expected !== true && gap.severity === "info").length;
  return [
    { kind: "expected", label: "Expected disclosures", entries: expected, groups: expected },
    { kind: "info", label: "Informational notes", entries: info, groups: info },
    { kind: "data", label: "Grouped data issues", entries: sum(k.dataGaps), groups: k.dataGaps.length },
    { kind: "process", label: "Analysis-process issues", entries: sum(k.processDisclosures), groups: k.processDisclosures.length },
    { kind: "resolved", label: "Recorded warnings shown as information", entries: sum(k.downgraded), groups: k.downgraded.length },
  ].filter(row => row.entries > 0) as ManifestReconciliationRow[];
}

function ratio(supported: number, total: number, rate: number | null): string {
  return rate === null ? `${supported}/${total}` : `${supported}/${total} (${(rate * 100).toFixed(1)}%)`;
}

/**
 * What was verified, one row per kind of check (P0-7). Qualitative claims are
 * counted as cited but not machine-checkable instead of being folded into a
 * "0/N validated" headline; the numeric-claim ratio covers only claims that
 * state a figure.
 */
/**
 * Prose claims the coverage counts contradicted plus cited figures the verification log marks contradicted: the
 * two records the audit export prints (the export marked a cited salary figure contradicted while the header,
 * counting prose claims only, said 0).
 */
function contradictedCount(v: NonNullable<ProvenanceCoverage["factualValidation"]>, log: readonly VerificationLogEntry[] | undefined): { count: number; split: string | null } {
  const figures = (log ?? []).filter((entry) => entry.evidenceKind === "number" && displayedValidationStatus(entry) === "contradicted").length;
  const claims = v.contradicted;
  return {
    count: claims + figures,
    split: figures === 0 ? null : `${figures} cited figure${figures === 1 ? "" : "s"}, ${claims} prose claim${claims === 1 ? "" : "s"}`,
  };
}

export function trustRows(recorded: ProvenanceCoverage | undefined, log?: readonly VerificationLogEntry[]): TrustRow[] {
  if (!recorded) return [];
  const coverage = displayedClaimCoverage(recorded, log);
  // validation first; citation and tracing are provenance (D-110).
  const rows: TrustRow[] = [];
  const v = coverage.factualValidation && displayedFactualValidation(coverage.factualValidation, log);
  if (v) {
    const partition = numericClaimPartition(v);
    rows.push({
      label: "Numeric factual claims numerically matched to a cited figure",
      value: partition.total === null ? partition.unknownText : partition.total === 0
        ? "none to check — no factual claim states a figure"
        : `${v.validated}/${partition.total}${partition.unmatched > 0 ? `; ${partition.unmatched} not matched to a cited figure` : ""}`,
    });
    const contradicted = contradictedCount(v, log);
    rows.push({ label: "Claims contradicted by their cited source", value: contradicted.split === null ? String(contradicted.count) : `${contradicted.count} (${contradicted.split})` });
    if (v.qualitative !== undefined) rows.push({ label: "Qualitative factual claims (cited; not machine-checkable)", value: String(v.qualitative) });
  }
  rows.push(
    { label: "Figures traced to a cited source", value: ratio(coverage.numeric.supported, coverage.numeric.total, coverage.numeric.rate) },
    { label: "Factual claims carrying a citation", value: ratio(coverage.factualClaims.supported, coverage.factualClaims.total, coverage.factualClaims.rate) },
  );
  if (coverage.judgments.total > 0) rows.push({ label: "Judgments carrying a citation", value: ratio(coverage.judgments.cited, coverage.judgments.total, coverage.judgments.rate) });
  const supplemental = supplementalNumericInventoryText(log);
  if (supplemental) rows.push({ label: "Supplemental filing and market numeric inventory (not validation)", value: supplemental });
  return rows;
}

/**
 * One-line header form of {@link trustRows}: what was checked against a cited figure. the line leads with the
 * numeric validation fraction; tracing and citation are provenance, on {@link provenanceHeadline} (D-110).
 */
export function trustHeadline(recorded: ProvenanceCoverage | undefined, log?: readonly VerificationLogEntry[]): string | null {
  if (!recorded) return null;
  const coverage = displayedClaimCoverage(recorded, log);
  const v = coverage.factualValidation && displayedFactualValidation(coverage.factualValidation, log);
  if (!v) return "numeric claims not validated: no verification result recorded";
  const partition = numericClaimPartition(v);
  const parts = [partition.total === null ? partition.unknownText : partition.total === 0
    ? "no factual claim states a figure to match"
    : `${ratio(v.validated, partition.total, v.validated / partition.total)} numeric claims numerically matched to a cited figure (not whole-claim validation)`];
  const contradicted = contradictedCount(v, log);
  parts.push(`${contradicted.count} contradicted${contradicted.split === null ? "" : ` (${contradicted.split})`}`);
  if (v.qualitative !== undefined && v.qualitative > 0) parts.push(`${v.qualitative} qualitative claims cited, not machine-checkable`);
  return parts.join("; ");
}

/** The header's provenance line: figures traced and claims cited, which are not validation (D-110). */
export function provenanceHeadline(recorded: ProvenanceCoverage | undefined, log?: readonly VerificationLogEntry[]): string | null {
  if (!recorded) return null;
  const coverage = displayedClaimCoverage(recorded, log);
  return `${ratio(coverage.numeric.supported, coverage.numeric.total, coverage.numeric.rate)} figures traced to a cited source; ` +
    `${coverage.factualClaims.supported}/${coverage.factualClaims.total} factual claims carry a citation (provenance, not validation)`;
}

/* ======================================================================== *
 * Header: run summary, usage, data state
 * ======================================================================== */

/* ======================================================================== *
 * One home per deterministic table
 * ======================================================================== */

/**
 * The deterministic filing table that already shows a figure, as a
 * cross-reference ("Management guidance (§11 Future Outlook)"), or null
 * (D-62). Guidance, issuer-defined FCF and results against prior guidance
 * were each printed in three to six places.
 */
export function filingTableHome(report: Pick<Report, "filingDisclosures">, source: string): string | null {
  const d = report.filingDisclosures;
  if (!d) return null;
  const where = (key: "fundamentals" | "outlook") => `§${reportSection(key).index} ${reportSection(key).printTitle}`;
  if (d.guidance && d.guidance.rows.length > 0 && /^payload\.issuer-filings\.[a-z0-9-]*guidance\b/.test(source)) return `Management guidance (${where("outlook")})`;
  if (d.freeCashFlow.length > 0 && /^payload\.issuer-filings\.issuer-defined-free-cash-flow/.test(source)) return `Issuer-reported free cash flow (${where("fundamentals")})`;
  if (d.guidanceChecks.length > 0 && /^computed\.quarterly-trend\.q[1-4]-fy\d{4}-[a-z0-9-]*vs-prior-guidance/.test(source)) return `Results against prior guidance (${where("outlook")})`;
  return null;
}

/** Figures not already in a deterministic table, plus the tables that hold the rest. */
export function withoutTabled(report: Pick<Report, "filingDisclosures">, numbers: readonly TracedNumber[]): { kept: TracedNumber[]; homes: string[] } {
  const homes: string[] = [];
  const kept = numbers.filter((n) => {
    const home = filingTableHome(report, n.source);
    if (home !== null && !homes.includes(home)) homes.push(home);
    return home === null;
  });
  return { kept, homes };
}

/** MetricRow groups with tabled values removed (rows left empty are dropped). */
export function metricRowsWithoutTabled<T extends { label: string; values: readonly { period?: string; value: TracedNumber }[] }>(
  report: Pick<Report, "filingDisclosures">,
  rows: readonly T[],
): { kept: T[]; homes: string[] } {
  const homes: string[] = [];
  const kept = rows.flatMap((row) => {
    const values = collapseMeasuredCagrValues(row.values).filter((v) => {
      const home = filingTableHome(report, v.value.source);
      if (home !== null && !homes.includes(home)) homes.push(home);
      return home === null;
    });
    return values.length === 0 ? [] : [{ ...row, label: readerMetricLabel(row.label), values }];
  });
  return { kept, homes };
}

/** "See also: …" line for figures shown in their home table instead. */
export function seeAlsoText(homes: readonly string[]): string | null {
  return homes.length === 0 ? null : `Shown in ${homes.join("; ")}.`;
}

type ExecutionEntries = NonNullable<Report["meta"]["execution"]>;

/** Passes that called a model; the deterministic verify step is not one. */
function modelPasses(entries: ExecutionEntries | undefined): ExecutionEntries {
  return (entries ?? []).filter((entry) => entry.effectiveModel !== "deterministic" && entry.requestedModel !== "deterministic");
}

/**
 * Inline citations inside stored prose ("… [computed.valuation.dcf-per-share ·
 * 2026-10-15]") shown with the same reader label a claim's source marker uses
 * (D-62). Anything that is not a registry id or SEC citation is untouched.
 */
export function humanizeInlineCitations(text: string): string {
  // D-67: a bracket may hold several citations ("[a · d1; b · d2]"); each
  // registry id or SEC citation in it is labelled, anything else is kept.
  const bracketed = text.replace(/\[([^[\]]+)\]/g, (match, body: string) => {
    let changed = false;
    const parts = body.split(";").map((part) => {
      const cite = /^\s*((?:computed|payload|manifest)\.\S+?|(?:edgar|sec|fred):.+?)(\s+·\s+\d{4}-\d{2}-\d{2})?\s*$/.exec(part);
      if (!cite) return part.trim();
      changed = true;
      return `${sourceLabel(cite[1]!.trim())}${cite[2] ?? ""}`;
    });
    return changed ? `[${parts.join("; ")}]` : match;
  });
  return humanizeBareIds(bracketed);
}

/**
 * D-67: registry ids written into stored prose outside a citation bracket
 * ("(source computed.valuation.*)", "(computed.valuation.dcf.perShare)",
 * "sec:8-K EX-99.1 …", "fred:DGS10") read under their reader labels. A
 * wildcard names the model family it stands for.
 */
export function humanizeBareIds(text: string): string {
  return text
    .replace(/(?<![\w[`/.])computed\.returns\.wacc\.riskFree\([^()\s]+\)/g, (id) => sourceLabel(id))
    .replace(RISK_FREE_BARE_IDS, (id) => riskFreeSourceLabel(id))
    .replace(/(?<![\w[`/.])((?:computed|payload|manifest)(?:\.[A-Za-z0-9][A-Za-z0-9\-_]*)+(?:\([A-Z0-9.,\- ]*\))?)(\.\*)?/g, (_match, id: string, wildcard: string | undefined) =>
      wildcard ? `${segmentWords(id.split(".").slice(1).join(" ")).join(" ")} model outputs` : sourceLabel(id))
    .replace(/(?<![\w/])sec:(?=(?:8-K|6-K|10-K|10-Q|20-F|40-F|DEF 14A)\b)/g, "")
    .replace(/(?<![\w/])fred:([A-Za-z0-9]+)/g, (_m, series: string) => `FRED ${series.toUpperCase()}`);
}

/* ======================================================================== *
 * D-67: reader precision for figures inside stored prose
 * ======================================================================== */

/**
 * Ratios a reader reads as a percentage: FCF conversion (FCF ÷ net income) and
 * the accrual ratios. Stored as fractions with an "x" unit, they printed three
 * ways (65.8%, 0.7×, 0.6585x); every surface now prints whole percent.
 */
const RATIO_AS_PERCENT = /fcf-?conversion|accrual-?ratio|accrualsratio/i;

export function isRatioAsPercent(id: string): boolean {
  return RATIO_AS_PERCENT.test(id);
}

/** A ratio-as-percent fraction in its one display format ("66%"). */
export function ratioPercentText(fraction: number): string {
  return formatPct(fraction * 100, 0);
}

function roundedText(value: number, digits: number): string {
  return decimalRound(value, digits).toFixed(digits);
}

/** Two decimals, or two significant digits below 0.1 so an index of 0.0839 keeps "0.084". */
function smallOrTwoDecimals(value: number): string {
  return Math.abs(value) < 0.1 && value !== 0 ? String(Number(value.toPrecision(2))) : roundedText(value, 2);
}

/**
 * Figures in stored prose shown at reader precision (D-67): the analysis
 * passes repeated computed values at four decimals ("USD 296.3179 per share",
 * "426.7365x", "82.1353%", a score of "85.96" beside an integer scorecard).
 * The rule matches the prose-precision prompt rule: per-share amounts to
 * cents, percentages and multiples to one decimal (two below 10×), amounts in
 * billions or trillions to two decimals, 0–100 scores to an integer. Only a
 * figure stated more precisely than that is rounded; a three-decimal coupon
 * ("4.250% Notes") or an exact-to-the-million amount ("USD 7.771 billion") is
 * left as written. Ratio claims (FCF conversion, accrual ratios) retain their
 * wording; displayClaimText may disclose a compatible typed cited measure.
 */
export function readerPrecision(text: string, source?: string): string {
  // A source name cannot recover precision rounded away by the model or
  // identify which operand carries the ratio. Preserve these claims as written.
  if (source !== undefined && isRatioAsPercent(source)) return text;
  const out = text
    .replace(/(?<![\w.])(\d+\.\d+)( on the 0[–-]100 scale)/g, (_m, value: string, tail: string) => `${formatScore(Number(value))}${tail}`)
    // A whole compact amount in stored text ("the guided run-rate $432.00B"), as the formatter prints it.
    .replace(/(\$|\bUSD )(\d+)\.00([KMBT])\b/g, "$1$2$3");
  return out.replace(
    /(?<![\w.:/-])(-?)(\d+)\.(\d+)(?!\.?\d)(\s?(?:x|×)(?![A-Za-z0-9])|%| percentage points?\b| pp\b| (?:trillion|billion|million|thousand)\b| per share\b)?/g,
    (match, sign: string, whole: string, fraction: string, unit: string | undefined, offset: number, whole_text: string) => {
      // D-308: a version, id or CIK number is an identifier, not a figure to round.
      if (IDENTIFIER_CONTEXT.test(whole_text.slice(Math.max(0, offset - 40), offset))) return match;
      const decimals = fraction.length;
      const value = Number(`${sign}${whole}.${fraction}`);
      const tail = unit ?? "";
      const before = whole_text.slice(Math.max(0, offset - 4), offset);
      const money = /(?:USD|EUR|GBP|JPY|CHF|CAD|AUD|TWD|\$) ?$/.test(before);
      if (/^\s?[x×]$/.test(tail)) {
        if (decimals < 3) return match;
        return `${Math.abs(value) >= 10 ? roundedText(value, 1) : smallOrTwoDecimals(value)}×`;
      }
      if (tail === "%") return decimals >= 4 ? `${roundedText(value, 1)}%` : match;
      if (/percentage point|pp/.test(tail)) return decimals >= 3 ? `${roundedText(value, 1)}${tail}` : match;
      if (/trillion|billion|million|thousand/.test(tail)) return decimals >= 4 ? `${roundedText(value, 2)}${tail}` : match;
      if (tail === " per share" || money) return decimals >= 3 ? `${roundedText(value, 2)}${tail}` : match;
      return decimals >= 4 ? `${smallOrTwoDecimals(value)}${tail}` : match;
    },
  );
}

/** Stored prose for a reader: registry ids under reader labels, figures at reader precision. */
/** Decision numbers are internal references. The rule's own explanation stays. */
export function withoutDecisionNumbers(text: string): string {
  return text
    .replaceAll('(house rule, WS6 D-18: median of methods; the former "lower of the 3y/5y CAGR" and sign-disagreement rules are RETIRED)', "(house rule: median of methods)")
    .replace(/\s*\(WS6 review, (?:SHOULD-FIX|BLOCKER) \d+\)/g, "")
    .replace(/([Hh]ouse rule), WS6 D-18:/g, "$1:")
    .replace(/\b([Hh])ouse rule D-\d+(?:\/D-\d+)*\b/g, "$1ouse rule")
    .replace(/\s*\(D-\d+(?:\s+disclosure)?\)/g, "");
}

export function displayProse(text: string, source?: string, options: { modelWritten?: boolean } = {}): string {
  // D-308: code-written prose has its base-unit amounts grouped; model-written prose (a paragraph carrying the
  // "not confirmed" mark, or a claim of a report the AI wrote) is shown as written.
  const conventions = readerConventionText(withoutDecisionNumbers(text), source);
  const readable = (options.modelWritten === true || text.trimEnd().endsWith(MODEL_PROSE_MARK) ? conventions : readerBaseUnits(conventions))
    .replace(/(\bevidence completeness (?:was|is) )((?:0(?:\.\d+)?|1(?:\.0+)?))(?![\d%]|\.\d)/gi, (_, lead: string, value: string) => `${lead}${ratioPercentText(Number(value))}`)
    .replace(/(Self-assessed case strength[^:]*: bull )(\d)(, bear )(\d)(?!\s*(?:\/|of))/g, "$1$2 of 5$3$4 of 5");
  return readerPrecision(humanizeInlineCitations(readable), source);
}

/**
 * Add the table's typed measure only beside compatible, uniquely cited scalar
 * ratio wording. No claim is rewritten or validated. Missing/ambiguous context
 * stays raw and retains the report's existing verification disclosures.
 */
export function displayClaimText(claim: SourcedClaim, numbers: readonly TracedNumber[] = []): string {
  let text = displayProse(claim.text, claim.source, { modelWritten: isModelWrittenClaim(claim) });
  // D-294: name a proved quoted-share unit beside its uniquely cited count, without validating the claim.
  const shares = numbers.filter(n => n.source === claim.source && n.asOf === claim.asOf &&
    (claim.sourceId === undefined || n.sourceId === claim.sourceId) && n.definition === "ADS-equivalent shares");
  if (shares.length === 1) text += " [Cited share-count basis: ADS-equivalent shares.]";
  if (!isRatioAsPercent(claim.source) || /(?:abs|absolute)$/i.test(claim.source)) return text;
  const matches = numbers.filter(n => n.source === claim.source &&
    (claim.sourceId === undefined || n.sourceId === claim.sourceId));
  if (matches.length !== 1) return text;
  const n = matches[0]!;
  if (n.verified !== true || n.asOf === null || n.asOf !== claim.asOf || !n.period?.trim() ||
      !["x", "×", "multiple", "fraction", "frac", "ratio"].includes(n.unit.trim().toLowerCase())) return text;
  // Brackets may qualify entity/window, not merely repeat a citation. Keep
  // them in the sentence check so unestablished bracket context stays raw.
  const body = claim.text;
  // Admit only a whole, bare metric/scalar sentence. Free-form prefixes,
  // named entities, quarter modifiers and other context cannot be established
  // from a shared citation, even when its value/date happen to match.
  const bareMetricStatement = /^(?:The\s+)?(?:FCF conversion(?:\s+(?:before|after)\s+SBC)?|(?:(?:cash[- ]flow|balance[- ]sheet)\s+)?accrual ratio)(?:\s+(?:for\s+(?:the\s+fiscal\s+year\s+ended\s+)?|in\s+)(?:FY\d{4}|\d{4}-\d{2}-\d{2}))?\s+(?:was|is)\s+[+−-]?\d+(?:\.\d+)?\s*[x×%][.!]?$/i;
  if (!bareMetricStatement.test(body.trim())) return text;
  const words = (s: string) => s.replace(/[^a-z]/gi, "").toLowerCase();
  const bodyWords = words(body);
  const sourceWords = words(claim.source);
  if (bodyWords.includes("fcfconversion") !== sourceWords.includes("fcfconversion")) return text;
  for (const variant of ["before SBC", "after SBC", "cash-flow", "balance-sheet"]) {
    if (bodyWords.includes(words(variant)) !== sourceWords.includes(words(variant))) return text;
  }
  const periodPattern = /\bFY\d{4}\b|\b\d{4}-\d{2}-\d{2}\b/g;
  if ((body.match(periodPattern) ?? []).some(p => !n.period!.includes(p) && !JSON.stringify(n.periodContext ?? {}).includes(p))) return text;
  const scalars = [...body.replace(periodPattern, "").matchAll(/(?<![\w.])([+−-]?\d+(?:\.\d+)?)\s*([x×%])?(?![\w\d])/g)];
  if (scalars.length !== 1 || !scalars[0]![2]) return text;
  const scalar = scalars[0]!;
  const raw = scalar[1]!.replace("−", "-");
  const value = Number(raw);
  const typed = scalar[2] === "%" ? n.value * 100 : n.value;
  const digits = raw.split(".")[1]?.length ?? 0;
  // Numeric compatibility at the stated precision is not factual validation.
  if (Math.sign(value) !== Math.sign(typed) || decimalRound(typed, digits) !== value) return text;
  return `${text} [Original rounded claim; cited measure: ${figureValueText(n)} (${metricLabel(n.source, n.unit)}; ${tracedPeriodLabel(n.period, n.periodContext)}; as of ${n.asOf}).]`;
}

/**
 * A section-level disclosure, independent of free-form claim admission above.
 * Financial diagnostics inject these canonical, full-precision records into
 * quality key numbers. Legacy citations can instead name rounded, periodless
 * records. Show the canonical measure separately; a recorded end date alone
 * must never become a fiscal-year duration or validate the model's wording.
 */
export function qualityAccrualClarifications(quality: Report["quality"]): string[] {
  return ([
    ["computed.forensics.accrual-ratio-cash-flow", "computed.forensics.accruals.cashFlowAccrualRatio"],
    ["computed.forensics.accrual-ratio-balance-sheet", "computed.forensics.accruals.balanceSheetAccrualRatio"],
  ] as const).flatMap(([legacy, canonical]) => {
    const cited = quality.graded.reasoning.filter(claim => claim.source === legacy || claim.sourceId === legacy);
    if (cited.length === 0 || cited.some(claim => claim.source !== legacy || claim.sourceId !== legacy)) return [];
    // Count all records at the canonical identity before checking validity:
    // contradictory or duplicate records cannot be silently disambiguated.
    const matches = quality.graded.keyNumbers.filter(n => n.source === canonical || n.sourceId === canonical);
    if (matches.length !== 1) return [];
    const n = matches[0]!;
    if (n.source !== canonical || n.sourceId !== canonical || n.verified !== true ||
        !Number.isFinite(n.value) || typeof n.asOf !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(n.asOf) || !n.period?.trim() ||
        !["x", "×", "multiple", "fraction", "frac", "ratio"].includes(n.unit.trim().toLowerCase()) ||
        cited.some(claim => claim.asOf !== n.asOf)) return [];
    // Do not normalize timestamps, whitespace or rolled-over calendar dates
    // into a different supplied as-of day.
    const asOfDay = new Date(`${n.asOf}T00:00:00Z`);
    if (!Number.isFinite(asOfDay.getTime()) || asOfDay.toISOString().slice(0, 10) !== n.asOf) return [];
    return [`Structured measure clarification: ${metricLabel(n.source, n.unit)}: ${figureValueText(n)} (recorded period: ${tracedPeriodLabel(n.period, n.periodContext)}; as of ${n.asOf}). Original model wording is retained; this separate quality-section measure does not validate the entity or measurement window of the original claim.`];
  });
}

/**
 * D-67: the Markdown and print exports render no chart, so a sentence that
 * points at one ("The shaded band is the scenario range") is dropped there.
 * The live view keeps it beside its fan chart.
 */
export function withoutChartReferences(text: string): string {
  return text
    .replace(/\s*The shaded band\b[^.;]*[.;]\s*([a-z])?/g, (_m, next: string | undefined) => (next ? ` ${next.toUpperCase()}` : ""))
    .trim();
}

/** "bull, bear and judge on chatgpt/gpt-6.1-sol (medium effort)" plus any fallback/floor/same-family note. */
export function runSummary(report: Pick<Report, "meta">): string {
  const m = report.meta;
  const evidence = deriveReportModelEvidence(report);
  const execution = evidence.attempts;
  if (execution.length === 0) return evidence.legacyModelLabel !== null
    ? `saved model label ${evidence.legacyModelLabel}; request and execution unknown`
    : evidence.analysisCompletion === "not-completed"
      ? "Data-only snapshot; no usable analysis was completed; model execution unknown"
      : "Saved model request and execution unknown";
  const stepName = passBaseName;
  const byModel = new Map<string, string[]>();
  const attemptParts: string[] = [];
  const unfinished = new Map<string, typeof execution>();
  for (const entry of execution) {
    const step = stepName(entry.step);
    if (entry.completion === "not-called") {
      unfinished.set(step, [...(unfinished.get(step) ?? []), entry]);
      continue;
    }
    if (entry.modelEvidence === "unknown" || entry.completion === "failed") {
      unfinished.set(step, [...(unfinished.get(step) ?? []), entry]);
      continue;
    }
    const key = `${entry.effectiveModel}${entry.effectiveEffort ? ` (${entry.effectiveEffort} effort)` : ""}`;
    byModel.set(key, [...new Set([...(byModel.get(key) ?? []), stepName(entry.step)])]);
  }
  const list = (items: string[]) => items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
  const done = new Set(execution.filter(e => e.completion === "completed" && e.modelEvidence === "recorded").map(e => passBaseName(e.step)));
  for (const [step, attempts] of unfinished) {
    if (done.has(step)) continue;
    const failed = attempts.filter(e => e.completion === "failed");
    const unknown = attempts.some(e => e.modelEvidence === "unknown");
    attemptParts.push(failed.length ? `${step} failed${failed.length > 1 ? ` after ${failed.length} attempts` : ""}: no usable analysis was completed${unknown ? "; model observation unknown" : `; recorded attempts on ${[...new Set(attempts.flatMap(e => e.models))].join(" + ")}`}` : `${step}: ${unknown ? "model observation unknown" : attempts.some(e => e.adjustments.includes("model-rejected")) ? "rejected before a model call" : "no model call recorded"}`);
  }
  if (execution.every(e => e.completion !== "completed")) attemptParts.unshift("no pass completed");
  const parts = [...byModel.entries()].map(([model, steps]) => `${list(steps)} on ${model}`).concat(attemptParts);
  const adjusted = execution.filter((entry) => entry.completion === "completed" && entry.adjustments.length > 0).map((entry) => `${stepName(entry.step)}: ${entry.adjustments.join(", ")}`);
  if (adjusted.length > 0) parts.push(`adjusted — ${adjusted.join("; ")}`);
  if (m.judgeProtocol?.sharedModelFamily.shared) parts.push("the judge shares the analysts' model family");
  return parts.join("; ");
}

/**
 * Which model passes used only the supplied evidence, from the execution entries whose per-pass note the audit
 * export prints (the report itself never said the analysis had no web search). Null when no pass ran on a plan
 * allowance.
 */
export function evidenceScopeSummary(report: Pick<Report, "meta">): string | null {
  const stepName = passBaseName;
  // P20: failed and never-sent attempts are listed in a
  // data-only report's run details, but they used no evidence at all.
  const entries = modelPasses(report.meta.execution)
    .filter((entry) => executionCompleted(entry) && subscriptionExecution(entry) !== null);
  if (entries.length === 0) return null;
  const list = (steps: string[]) => steps.length <= 1 ? steps.join("") : `${steps.slice(0, -1).join(", ")} and ${steps[steps.length - 1]}`;
  const usedWeb = (entry: ExecutionMetadataEntry) => entry.webResearchLimitation === undefined &&
    (entry.webResearchUsed ?? (entry.webSearches ?? 0) > 0);
  const searched = entries.filter(usedWeb).map(entry => stepName(entry.step));
  const supplied = entries.filter(entry => !usedWeb(entry) && entry.webResearchLimitation === undefined).map(entry => stepName(entry.step));
  const limited = entries.filter(entry => entry.webResearchLimitation !== undefined).map(entry => stepName(entry.step));
  return [searched.length ? `${list(searched)} used web research with supplied evidence` : null,
    limited.length ? `${list(limited)} used only the supplied evidence; optional web research was unavailable and no web findings were accepted` : null,
    supplied.length ? `${list(supplied)} used only the supplied evidence (payload-only; no web search)` : null].filter(Boolean).join("; ");
}

function total(values: readonly (number | undefined)[]): number | null {
  const present = values.filter((value): value is number => typeof value === "number");
  return present.length === 0 ? null : present.reduce((sum, value) => sum + value, 0);
}

type LedgerRow = Report["appendix"]["costBreakdown"][number];
interface LedgerUsage { requests: number; discarded: number; input: number; output: number }

/**
 * token totals over the same ledger rows the cost is summed from, when every row carries its settled tokens.
 * Earlier reports' rows carry none, and keep the per-pass execution totals.
 */
function ledgerUsage(rows: readonly LedgerRow[]): LedgerUsage | null {
  if (rows.length === 0 || rows.some((row) => typeof row.inputTokens !== "number" || typeof row.outputTokens !== "number")) return null;
  return {
    requests: rows.length,
    discarded: rows.filter((row) => row.discarded === true).length,
    input: rows.reduce((sum, row) => sum + row.inputTokens!, 0),
    output: rows.reduce((sum, row) => sum + row.outputTokens!, 0),
  };
}

function requestCountText(usage: LedgerUsage): string {
  return `${usage.requests} ${usage.requests === 1 ? "request" : "requests"}${usage.discarded > 0 ? ` (${usage.discarded} discarded)` : ""}`;
}

function tokenText(input: number | null, output: number | null): string {
  return `${input === null ? "unknown" : formatNumber(input, 0)} input / ${output === null ? "unknown" : formatNumber(output, 0)} output tokens`;
}

/** Tokens for plan-allowance runs, dollars for API runs. */
export function usageSummary(report: Pick<Report, "meta" | "appendix">): string {
  const execution = modelPasses(report.meta.execution);
  const input = total(execution.map((entry) => entry.inputTokens));
  const output = total(execution.map((entry) => entry.outputTokens));
  const tokens = input === null && output === null ? null
    : `${input === null ? "unknown" : formatNumber(input, 0)} input / ${output === null ? "unknown" : formatNumber(output, 0)} output tokens`;
  const unreported = execution.filter(entry => entry.inputTokens === undefined || entry.outputTokens === undefined).map(entry => passAttemptName(entry.step));
  const usageLimit = unreported.length ? `; usage incomplete for ${unreported.join(", ")}` : "";
  const plan = execution.length > 0 && execution.every((entry) => parseSubscriptionModel(entry.effectiveModel) ?? parseSubscriptionModel(entry.requestedModel));
  // The same figure the audit ledger totals: the sum of the displayed rows.
  const cost = roundedDisplayedCostTotal(report.appendix.costBreakdown.map((entry) => entry.costUsd));
  if (plan) {
    const provider = [...new Set(execution.map(entry => {
      const connection = parseSubscriptionModel(entry.effectiveModel) ?? parseSubscriptionModel(entry.requestedModel);
      return connection?.provider === "claude" ? "Claude Code account" : connection?.provider === "gemini" ? "Gemini CLI" : "ChatGPT plan";
    }))].join(" / ");
    return `${tokens ?? "token usage not reported"} on the ${provider} allowance (no API charge recorded)${usageLimit}`;
  }
  const dollars = `${formatCostUsd(cost)} recorded API cost`;
  const ledger = ledgerUsage(report.appendix.costBreakdown);
  if (ledger !== null) return `${dollars} across ${requestCountText(ledger)}; ${tokenText(ledger.input, ledger.output)}`;
  return `${tokens ? `${dollars}; ${tokens}` : dollars}${usageLimit}`;
}

/**
 * The data-state sentence. "Confirmed" described the metadata, not the data; the sentence now leads with the data
 * state.
 */
export function dataStateText(c: ReportCompletenessPresentation): string {
  if (c.metadataStatus !== "confirmed") return c.statusText;
  // The persisted state was set when every critical entry, process ones
  // included, counted toward "blocked". When the only critical entries are
  // analysis-process disclosures, "Blocked: 0 critical data issues" reads as a
  // contradiction: the data state follows the data counts, and the sentence
  // says that it is the analysis that is blocked.
  const processBlocked = c.state === "blocked" && c.dataCriticalCount === 0 && c.processDisclosureCount > 0;
  const shown = shownDataState(c);
  const state = shown === "complete" ? "Complete" : shown === "degraded" ? "Degraded" : shown === "blocked" ? "Blocked" : "Unknown";
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  // D-67: one count per underlying data gap; how the passes ran is counted apart.
  const blocks = processBlocked ? (c.processDisclosureCount === 1 ? ", which blocks the analysis" : ", which block the analysis") : "";
  const process = c.processDisclosureCount > 0 ? `; ${count(c.processDisclosureCount, "analysis-process disclosure", "analysis-process disclosures")} (not data gaps)${blocks}` : "";
  return `${c.dataOnly ? "Data-only \u00b7 " : ""}${state}: ${count(c.dataCriticalCount, "critical data issue", "critical data issues")}, ${count(c.dataWarningCount, "data issue", "data issues")}${process}; EDGAR ${c.edgar}; XBRL ${c.xbrlLabel ?? c.xbrl}; forensics ${c.forensicValidation}.`;
}

/**
 * D-67: section confidence as displayed is capped by the report's data state,
 * the same way D-50 caps it by an aspect's own coverage: "high" is not shown
 * beside a data warning, and nothing above "low" beside a critical gap.
 * Stored labels are unchanged.
 */
export function displayConfidence(
  stored: "high" | "medium" | "low",
  c: Pick<ReportCompletenessPresentation, "metadataStatus" | "dataCriticalCount" | "dataWarningCount"> & Partial<Pick<ReportCompletenessPresentation, "dataOnly">>,
): { level: "high" | "medium" | "low"; cap: string | null } {
  const rank = { low: 0, medium: 1, high: 2 } as const;
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  const ceiling: { level: "high" | "medium" | "low"; why: string } | null = c.dataOnly
    ? { level: "low", why: "no completed multi-pass analysis" }
    : c.dataCriticalCount > 0
    ? { level: "low", why: plural(c.dataCriticalCount, "critical data gap") }
    : c.dataWarningCount > 0
      ? { level: "medium", why: plural(c.dataWarningCount, "data warning") }
      : c.metadataStatus !== "confirmed"
        ? { level: "medium", why: "data completeness not confirmed" }
        : null;
  if (ceiling === null || rank[stored] <= rank[ceiling.level]) return { level: stored, cap: null };
  return { level: ceiling.level, cap: `capped from ${stored}: ${ceiling.why}` };
}

/** "medium — capped from high: 1 data warning", or the stored label. */
export function confidenceText(stored: "high" | "medium" | "low", c: Parameters<typeof displayConfidence>[1]): string {
  const shown = displayConfidence(stored, c);
  return shown.cap === null ? shown.level : `${shown.level} — ${shown.cap}`;
}

/* ======================================================================== *
 * Appendix: data-gap summary and the methodology box
 * ======================================================================== */

const GAP_FAMILY: ReadonlyArray<readonly [RegExp, string]> = [
  [/^fmp\.planLimit|^statements\.backfill/, "Provider plan limits (history backfilled from SEC where possible)"],
  [/^fmp\.|^dataFallback|^keyless\.(?!stockSplits)/, "Provider endpoints unavailable or substituted"],
  [/^keyless\.stockSplits/, "Stock-split history notes"],
  [/^evidenceCoverage/, "Filing passages trimmed to the evidence budget"],
  [/^statements\./, "Statement fields enriched or withheld"],
  [/^valuation\./, "Valuation inputs and peer caveats"],
  [/^llm\./, "Analysis-pass disclosures"],
  [/^verify\./, "Verification findings"],
  [/^earningsCalendar/, "Earnings-date confirmation"],
  [/^analysis\.llm$/, "Analysis not completed"],
];

/** How an entry is displayed (D-67): a disclosure or a downgraded entry is not a data warning. */
export type DisplayedSeverity = "critical" | "warn" | "info" | "disclosure";

export interface GapSummaryRow {
  family: string;
  entries: number;
  highest: DisplayedSeverity;
}

function displayedSeverities(gaps: readonly ManifestEntry[], classification?: ReportCompletenessPresentation["classification"]): Map<ManifestEntry, DisplayedSeverity> {
  const process = new Set(classification?.processDisclosures.flatMap((gap) => gap.fields) ?? []);
  const downgraded = new Set(classification?.downgraded.flatMap((gap) => gap.fields) ?? []);
  return new Map(gaps.map((gap) => [gap, gap.expected === true || downgraded.has(gap.field) ? "info" : process.has(gap.field) ? "disclosure" : gap.severity]));
}

/**
 * The missing-data manifest as counts by family (D-62); the full manifest is
 * in the audit export. D-67: the severity column is the displayed one, so an
 * expected omission, a moot entry or a process disclosure no longer makes a
 * family read as a warning.
 */
export function gapSummary(gaps: readonly ManifestEntry[], classification?: ReportCompletenessPresentation["classification"]): GapSummaryRow[] {
  const rank: Record<DisplayedSeverity, number> = { critical: 4, warn: 3, disclosure: 2, info: 1 };
  const shown = displayedSeverities(gaps, classification);
  const families = new Map<string, GapSummaryRow>();
  for (const gap of gaps) {
    const family = GAP_FAMILY.find(([pattern]) => pattern.test(gap.field))?.[1] ?? "Other";
    const row = families.get(family) ?? { family, entries: 0, highest: "info" as DisplayedSeverity };
    row.entries += 1;
    const severity = shown.get(gap) ?? gap.severity;
    if (rank[severity] > rank[row.highest]) row.highest = severity;
    families.set(family, row);
  }
  return [...families.values()].sort((a, b) => rank[b.highest] - rank[a.highest] || b.entries - a.entries || a.family.localeCompare(b.family));
}

/**
 * The manifest in one sentence. D-67: "34 actionable gaps" counted every
 * informational note as actionable; the sentence now says what the entries
 * are, and counts a data gap once however many entries describe it.
 */
export function gapCountText(gaps: readonly ManifestEntry[], c?: Pick<ReportCompletenessPresentation, "classification">): string {
  if (gaps.length === 0) return "No missing-data entries recorded.";
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const expected = gaps.filter((gap) => gap.expected === true).length;
  if (!c) {
    const actionable = gaps.length - expected;
    return `${plural(actionable, "actionable gap", "actionable gaps")}${expected > 0 ? ` and ${plural(expected, "expected disclosure", "expected disclosures")}` : ""} recorded.`;
  }
  const k = c.classification;
  const data = k.dataGaps.filter((gap) => gap.key !== "analysis.llm");
  const dataEntries = data.reduce((sum, gap) => sum + gap.fields.length, 0);
  const counted = new Set([...k.dataGaps, ...k.processDisclosures, ...k.downgraded].flatMap((gap) => gap.fields));
  const informational = gaps.filter((gap) => gap.expected !== true && !counted.has(gap.field)).length;
  const parts = [
    expected > 0 ? plural(expected, "expected disclosure", "expected disclosures") : null,
    informational > 0 ? plural(informational, "informational note", "informational notes") : null,
    k.downgraded.length > 0 ? `${plural(k.downgraded.length, "recorded warning", "recorded warnings")} shown as information` : null,
    k.processDisclosures.length > 0 ? plural(k.processDisclosures.length, "analysis-process disclosure", "analysis-process disclosures") : null,
    data.length > 0 ? `${plural(data.length, "data gap", "data gaps")}${dataEntries > data.length ? ` (${plural(dataEntries, "entry", "entries")})` : ""}` : null,
  ].filter((part): part is string => part !== null);
  const list = parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `${plural(gaps.length, "manifest entry", "manifest entries")}: ${list}.`;
}

const DATASET_LABEL: Record<string, string> = {
  marketCapHistory: "Market-cap history",
  eodPrices: "Issuer price history", spy: `${SPY_BENCHMARK} benchmark price history`, sectorEtf: "Sector ETF price history",
};

const STATEMENT_LABEL: Record<string, string> = {
  balanceAnnual: "annual balance sheet", balanceQuarterly: "quarterly balance sheet",
  incomeAnnual: "annual income statement", incomeQuarterly: "quarterly income statement",
  cashflowAnnual: "annual cash-flow statement", cashflowQuarterly: "quarterly cash-flow statement",
};

const PROCESS_LABEL: ReadonlyArray<readonly [RegExp, (m: RegExpExecArray) => string]> = [
  [/^llm\.(bull|bear)\.length-cap$/, (m) => `${sentence([m[1]!])} case length cap`],
  [/^llm\.judge\.model-family$/, () => "Judge on the analysts' model family"],
  [/^verify\.check\.namedIndividual$/, () => "Named-person citation check"],
];

/** A reader label for a manifest field or an underlying gap (D-67: no raw manifest field in the body). */
export function gapLabel(gap: Pick<ClassifiedGap, "key" | "fields">): string {
  const field = gap.fields[0] ?? gap.key;
  if (DATASET_LABEL[gap.key] !== undefined) return DATASET_LABEL[gap.key]!;
  const price = /^historicalPriceEodFull\(([^)]+)\)$/.exec(gap.key);
  if (price) return `Price history (${price[1]})`;
  const statementField = gap.fields.map(f => /^fmp\.(incomeStatement|balanceSheet|cashFlow)\(([^,]+),(annual|quarter)\)$/.exec(f)).find(Boolean);
  if (statementField) {
    const [, endpoint, symbol, period] = statementField;
    const key = `${({ incomeStatement: "income", balanceSheet: "balance", cashFlow: "cashflow" } as Record<string,string>)[endpoint]}${period === "annual" ? "Annual" : "Quarterly"}`;
    const label = STATEMENT_LABEL[key];
    return label[0].toUpperCase() + label.slice(1) + (gap.key.startsWith(`${endpoint}(${symbol}`) ? ` (${symbol})` : "");
  }
  for (const [pattern, label] of PROCESS_LABEL) {
    const match = pattern.exec(field);
    if (match) return label(match);
  }
  const withheld = /^keyless\.([A-Za-z]+)\.backfill\.withheld\.([A-Za-z]+)$/.exec(field);
  if (withheld) return `${sentence(segmentWords(withheld[2]!))} withheld from the ${STATEMENT_LABEL[withheld[1]!] ?? segmentWords(withheld[1]!).join(" ")} backfill`;
  const fmp = /^fmp\.([A-Za-z]+)\(/.exec(field);
  if (fmp) {
    const symbol = /^fmp\.[A-Za-z]+\(([^,)]+)/.exec(field)?.[1];
    return `${sentence(segmentWords(fmp[1]!))} (FMP${symbol && gap.key.startsWith(`${fmp[1]}(${symbol}`) ? `, ${symbol}` : ""})`;
  }
  if (field === "analysis.llm") return "Analysis not completed";
  return sentence(segmentWords(field.replace(/\([^)]*\)/g, "").replace(/[.:]/g, " ")));
}

/**
 * D-256 (P22): the reader label of ONE recorded manifest entry, for the
 * per-entry "Recorded gaps" list. It is {@link gapLabel} on the entry's own
 * group key, so an entry reads exactly as its group does in the data-gap
 * tables; the raw field stays in the audit export.
 */
export function manifestEntryLabel(gap: ManifestEntry, issuer: string | null): string {
  return gapLabel({ key: gapGroupKey(gap, issuer), fields: [gap.field] });
}

/**
 * D-301 (P22; R29): the one map from statement field identifiers to the words a
 * reader sees. A recorded reason that lists fields ("eps, epsDiluted") reads
 * "basic EPS, diluted EPS" in the body; the audit export keeps the identifiers.
 */
export const READER_FIELD_LABELS: Readonly<Record<string, string>> = {
  eps: "basic EPS", epsDiluted: "diluted EPS", weightedAverageShsOut: "basic weighted share count", weightedAverageShsOutDil: "diluted weighted share count",
  costOfRevenue: "cost of revenue", grossProfit: "gross profit", operatingExpenses: "operating expenses", operatingIncome: "operating income",
  interestExpense: "interest expense", totalOtherIncomeExpensesNet: "total other income and expense", incomeBeforeTax: "pre-tax income",
  incomeTaxExpense: "income tax expense", netIncome: "net income", netIncomeFromContinuingOperations: "net income from continuing operations",
  netIncomeFromDiscontinuedOperations: "net income from discontinued operations", netIncomeAvailableToCommon: "net income available to common shareholders",
  bottomLineNetIncome: "bottom-line net income", ebitda: "EBITDA",
  cashAndCashEquivalents: "cash and cash equivalents", shortTermInvestments: "short-term investments", cashAndShortTermInvestments: "cash and short-term investments",
  longTermInvestments: "long-term investments", intangibleAssets: "intangible assets", shortTermDebt: "short-term debt", longTermDebt: "long-term debt",
  totalDebt: "total debt", netDebt: "net debt", capitalLeaseObligations: "lease obligations", operatingLeaseLiability: "operating lease liability",
  financeLeaseLiability: "finance lease liability", totalEquity: "total equity", totalStockholdersEquity: "stockholders' equity",
  preferredCapital: "preferred capital", temporaryEquity: "temporary equity", temporaryEquityAttributableToParent: "temporary equity attributable to the parent",
  temporaryEquityAttributableToNoncontrollingInterest: "temporary equity attributable to noncontrolling interests",
  operatingCashFlow: "operating cash flow", netCashProvidedByOperatingActivities: "net cash from operating activities",
  netCashProvidedByInvestingActivities: "net cash from investing activities", netCashProvidedByFinancingActivities: "net cash from financing activities",
  capitalExpenditure: "capital expenditure", investmentsInPropertyPlantAndEquipment: "investment in property, plant and equipment",
  depreciationAndAmortization: "depreciation and amortization", changeInWorkingCapital: "change in working capital", acquisitionsNet: "net acquisitions",
  commonStockIssuance: "share issuance", commonStockRepurchased: "share repurchases", netDividendsPaid: "net dividends paid",
  commonDividendsPaid: "common dividends paid", preferredDividendsPaid: "preferred dividends paid", stockBasedCompensation: "stock-based compensation",
  financeLeasePrincipalPayments: "finance-lease principal payments", interestPaid: "interest paid", marketCap: "market cap",
  peOwnHistoryRank: "valuation multiple own-history rank", priceToTbvOwnHistoryRank: "book multiple own-history rank",
};

const READER_FIELD_PATTERN = new RegExp(`(?<![\\w./:@-])(${Object.keys(READER_FIELD_LABELS).sort((a, b) => b.length - a.length).join("|")})(?![\\w/(@-]|\\.\\w)`, "g");

/** Statement field identifiers in a recorded reason, in plain words (D-301). */
export function plainFieldNames(text: string): string {
  return text.replace(READER_FIELD_PATTERN, (name: string) => READER_FIELD_LABELS[name] ?? name);
}

/** A long manifest reason cut at a sentence or clause near 320 characters; the audit export keeps it whole. */
function shortReason(reason: string): string {
  const limit = 320;
  if (reason.length <= limit) return reason;
  const cut = reason.slice(0, limit);
  const stop = Math.max(cut.lastIndexOf("; "), cut.lastIndexOf(". "));
  const word = cut.lastIndexOf(" ");
  return `${(stop > 120 ? cut.slice(0, stop) : word > 0 ? cut.slice(0, word) : "Reason withheld").trimEnd()} … (full text in the audit export)`;
}

/**
 * D-67: the body's data-gap tables, from the classified manifest. Data
 * warnings and critical gaps are one row per underlying gap; analysis-process
 * disclosures and recorded warnings shown as information are separate tables,
 * each with its reason. The data-only banner entry is not repeated.
 */
export function dataGapTables(c: Pick<ReportCompletenessPresentation, "classification">): BodyTable[] {
  const k = c.classification;
  const tables: BodyTable[] = [];
  const data = k.dataGaps.filter((gap) => gap.key !== "analysis.llm");
  if (data.length > 0) {
    tables.push({
      heading: "Data warnings and critical gaps",
      headers: ["Gap", "Severity", "Reason"],
      rows: data.map((gap) => [gapLabel(gap), gap.severity, `${shortReason(plainFieldNames(displayProse(gap.reason, gap.key)))}${gap.fields.length > 1 ? ` (${gap.fields.length} manifest entries)` : ""}`]),
    });
  }
  if (k.processDisclosures.length > 0) {
    tables.push({
      heading: "Analysis-process disclosures",
      headers: ["Disclosure", "Detail"],
      rows: k.processDisclosures.map((gap) => [gapLabel(gap), shortReason(plainFieldNames(displayProse(gap.reason, gap.key)))]),
      note: "How the analysis passes ran and what verification found; they are not missing data.",
    });
  }
  if (k.downgraded.length > 0) {
    tables.push({
      heading: "Recorded warnings shown as information",
      headers: ["Entry", "Why it is information"],
      rows: k.downgraded.map((gap) => [gapLabel(gap), gap.downgrade ?? ""]),
    });
  }
  return tables;
}

/**
 * The standard limitations, stated once (D-62) instead of as a negation on
 * every table: what the grades, targets, weights, projections, citations and
 * forensic screens are and are not.
 */
export function methodologyNotes(report: Pick<Report, "scores" | "projections" | "valuation" | "meta"> & Partial<Pick<Report, "appendix" | "fairValue">>): string[] {
  const notes = [
    "Grades and the composite score are deterministic house rules (bands, weights and signal transforms published in docs/METHODOLOGY.md). They have not been backtested against outcomes; a grade is a summary of the evidence shown, not a forecast.",
    // do not describe model outputs a route does not produce.
    unavailableCashFlowModel(report)
      ? "This report models no intrinsic value, scenario value or projection (see Valuation). Its scenarios are qualitative conditions, not price targets, guidance, predictions or probabilities."
      : "Intrinsic value, scenario values and projections are model ESTIMATEs computed from the disclosed inputs. They are not analyst price targets, guidance or predictions; the scenario display weights are a fixed prior, not probabilities.",
    "FACT, ESTIMATE and JUDGMENT labels mark what a statement is. A citation shows where a figure came from; it is a provenance check, not proof that a sentence's interpretation is correct.",
    "Forensic screens (Altman, Beneish, Piotroski, accruals) flag items to investigate. A flag is not a finding of misstatement, and a clean screen is not an audit.",
    "Peer, own-history and consensus comparisons are shown only where enough comparable observations exist; a dash means the comparison was withheld, not that it is neutral.",
    "Figures are rounded for display; calculations use full precision. The audit export carries every raw value, registry id, check and data gap.",
  ];
  if (report.meta.judgeProtocol?.sharedModelFamily.shared) {
    notes.push("The judge pass ran on the same model family that wrote the bull and bear cases, so the adjudication is not an independent second opinion.");
  }
  for (const gap of report.appendix?.missingData ?? []) {
    if (gap.field === PRINCIPAL_CORRECTION_FIELD || gap.field.startsWith(`${LEGACY_VALUATION_NOTE_FIELD}.`)) notes.push(gap.reason);
  }
  return notes;
}

/** Where the separate audit export lives for a persisted report. */
export function auditExportPath(report: Pick<Report, "meta">, context: ReportPresentationContext = {}): string | null {
  const id = presentationReportId(report,context);
  return typeof id === "number" && Number.isSafeInteger(id) ? `/api/export/${id}?format=audit` : null;
}

/**
 * the fundamentals cash-flow group is headed "Free cash flow" only when it holds a free-cash-flow measure. A
 * lender's group holds operating cash flow and SBC observations, which are not FCF.
 */
export function cashFlowGroupHeading(rows: readonly MetricRow[]): string {
  const sources = (row: MetricRow) => row.values.map((v) => v.value.sourceId ?? v.value.source);
  if (rows.length === 0 || rows.some((row) => /free cash flow|\bfcf\b/i.test(row.label) || sources(row).some((s) => /(?:^|[.-])fcf(?:$|[.-])|free-cash-flow/i.test(s)))) return "Free cash flow";
  const ocf = rows.some((row) => /operating cash flow/i.test(row.label));
  const sbc = rows.some((row) => /stock-based compensation|\bSBC\b/i.test(row.label));
  return ocf && sbc ? "Operating cash flow and SBC observations" : "Cash flow observations";
}

/** Same basename as the download route, usable after the report leaves the app. */
export function auditExportFilename(report: Pick<Report, "meta">, context: ReportPresentationContext = {}): string | null {
  const id = presentationReportId(report, context);
  if (typeof id !== "number" || !Number.isSafeInteger(id)) return null;
  const symbol = report.meta.symbol.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "report";
  return `${symbol}-report-${id}-audit.md`;
}

/** A signal's raw value in its own unit ("66.9%", "426.7×", "0.66 frac" → "65.8%"). */
export function signalValueText(signal: Pick<ScoreSignal, "raw" | "unit"> & { id?: string }): string {
  // D-67: FCF conversion and the accrual ratio print as the figure tables print them.
  if (signal.id !== undefined && isRatioAsPercent(signal.id) && ["frac", "fraction", "x"].includes(signal.unit.trim().toLowerCase())) return ratioPercentText(signal.raw);
  switch (signal.unit.trim().toLowerCase()) {
    case "%": return formatPct(signal.raw);
    case "pp": return `${signal.raw >= 0 ? "+" : ""}${formatNumber(signal.raw, 1)} pp`;
    case "pp/yr": return `${signal.raw >= 0 ? "+" : ""}${formatNumber(signal.raw, 2)} pp/yr`;
    case "x": return formatMultiple(signal.raw);
    case "frac": case "fraction": return formatPct(signal.raw * 100);
    case "z": case "m": return formatNumber(signal.raw, 2);
    default: return formatNumber(signal.raw, 2);
  }
}

export function signedPoints(value: number, digits = 2): string {
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(digits)}`;
}

/* ======================================================================== *
 * Body tables shared by the three surfaces
 * ======================================================================== */

export interface BodyTable {
  heading: string;
  headers: string[];
  rows: string[][];
  note?: string;
}

const SCORE_ASPECT_ORDER = ["fundamentals", "valuation", "quality", "balanceSheet", "moat", "leadership", "technicals"] as const;
const SCORE_ASPECT_LABEL: Record<(typeof SCORE_ASPECT_ORDER)[number], string> = {
  fundamentals: "Fundamentals", valuation: "Valuation", quality: "Quality", balanceSheet: "Balance Sheet",
  moat: "Moat", leadership: "Leadership (capital-stewardship proxy)", technicals: "Technicals",
};

/**
 * D-256 (P22): what the scorecard says about its band table. The band constant itself (`scores.bandsVersion`) is a
 * machine id; it is printed in the audit export's scorecard ("Band table:..."), not in the body.
 */
/**
 * D-273 (P22): the judge's resolution restates and settles both sides, so the
 * reader shows the topic and the resolution once; the full bull and bear
 * statements are kept verbatim in the audit export.
 */
export const DISAGREEMENT_SIDES_NOTE = "Each resolution weighs both analysts' statements; the full bull and bear statements are in the audit export.";
/**
 * D-273 (P22): the appendix names the providers once and lists only the
 * sources marked stale (P2: a stale input is named where it applies); every
 * source with its endpoint and fetch time is in the audit export.
 */
export function readerSources(sources: Report["appendix"]["sources"]): { summary: string; stale: Report["appendix"]["sources"] } {
  const providers = [...new Set(sources.map(source => source.provider))];
  const stale = sources.filter(source => source.stale === true);
  const unknown = sources.filter(source => source.stale === undefined).length;
  const freshness = [stale.length > 0 ? `${stale.length} marked stale (listed below)` : "none marked stale", ...(unknown > 0 ? [`${unknown} with freshness not recorded`] : [])].join(", ");
  return {
    summary: `${sources.length} source ${sources.length === 1 ? "record" : "records"} from ${providers.join(", ") || "no provider"}; ${freshness}. Every source with its endpoint, as-of date and fetch time is in the audit export.`,
    stale,
  };
}
/** D-273 (P22): where the score diagnostics live once they leave the reader body. */
export const SCORE_DIAGNOSTICS_NOTE = "The score drivers and the factor-family exposure and sensitivity tables are in the audit export.";
export const SCORE_BANDS_READER_NOTE = "House scoring bands in force when this report was built; the band version is recorded in the audit export";

/**
 * One row per aspect: score, band, weight and evidence, with what it
 * measures (D-62: replaces the separate weights and aspect-score tables).
 */
export function scorecardTable(scores: NonNullable<Report["scores"]>): BodyTable {
  const limited = SCORE_ASPECT_ORDER.filter((key) => hasLimitedEvidence(scores.aspects[key]));
  const table: BodyTable = {
    heading: "Scorecard",
    // D-273: each aspect's text qualifies what its score means, so it stays beside the score.
    headers: ["Aspect", "Score", "Band", "Weight", "Evidence (all signal weights)", "What it measures"],
    rows: SCORE_ASPECT_ORDER.map((key) => {
      const aspect = scores.aspects[key];
      const weight = scores.composite.weights[key];
      return [
        SCORE_ASPECT_LABEL[key],
        aspect.score === null ? "—" : formatScore(aspect.score),
        // D-67: the letter is withheld under the evidence floor on every surface.
        hasLimitedEvidence(aspect) ? "limited evidence" : aspect.band === null ? "—" : qualifiedGradeLabel(withNeutral(aspect.band, aspect.score), scores.qualification?.aspects[key]),
        `${formatNumber(weight, Number.isInteger(weight) ? 0 : 1)}%`,
        evidencePercentText(aspect.dataCompleteness),
        withoutDecisionNumbers(aspect.notApplicableReason ?? aspect.note),
      ];
    }),
    note: `Evidence here uses each aspect's full configured signal weight. The reliability table's applicable evidence excludes route-inapplicable inputs. ${limited.map((key) => {
        const signals = scores.aspects[key].signals ?? [];
        const effective = signals.length > 0
          ? signals.reduce((sum, s) => sum + s.effectiveCompositeWeightPct, 0)
          : scores.composite.weights[key] * scores.aspects[key].dataCompleteness;
        const weight = scores.composite.weights[key];
        const why = scores.aspects[key].dataCompleteness < MIN_HEADLINE_EVIDENCE
          ? `below the ${Math.round(MIN_HEADLINE_EVIDENCE * 100)}% floor for a letter`
          : "all from one signal, and a letter needs a second";
        return `${SCORE_ASPECT_LABEL[key]} has evidence for ${evidencePercentText(scores.aspects[key].dataCompleteness)} of its signal weight, ${why}, so no surface shows one; it enters the composite at ${formatPct(effective, 1)} rather than its ${formatNumber(weight, Number.isInteger(weight) ? 0 : 1)}% route weight.`;
      }).join(" ")}`.trim(),
  };
  return table;
}

/** The same missing-input interpretation on the app, Markdown and print scorecards. */
export function gradeReliabilityTable(scores: NonNullable<Report["scores"]>): BodyTable {
  const reasons: Record<Extract<AttributeGradeReliability, { status: "unavailable" }>["reason"], string> = {
    "unknown-coverage": "applicable coverage not recorded",
    "route-inapplicable": "route-inapplicable attribute",
    unscored: "attribute not scored",
    "invalid-coverage": "invalid applicable coverage",
    "invalid-score": "invalid recorded score",
  };
  // Outward display rounding never narrows an arithmetic range. Stabilize
  // floating-point tails at exact hundredths before choosing each direction.
  const endpoint = (value: number, side: "low" | "high") => String(
    Math[side === "low" ? "floor" : "ceil"](Number((value * 100).toPrecision(14))) / 100,
  );
  return {
    heading: "Attribute grade reliability",
    headers: ["Attribute", "Applicable evidence", "Missing-input score range (0–100)", "Conditional band possibilities"],
    rows: SCORE_ASPECT_ORDER.map(key => {
      const aspect = scores.aspects[key];
      const diagnostic = attributeGradeReliability(aspect);
      const coverage = aspect.applicableCompleteness;
      const evidence = diagnostic.status === "unavailable" && diagnostic.reason === "route-inapplicable" ? "Not applicable"
        : coverage === undefined ? "Unknown"
          : typeof coverage === "number" && Number.isFinite(coverage) && coverage >= 0 && coverage <= 1 ? evidencePercentText(coverage)
            : "Unavailable";
      const range = diagnostic.status === "unavailable" ? `Unavailable: ${reasons[diagnostic.reason]}`
        : diagnostic.applicableCompleteness === 1 ? `${diagnostic.score}–${diagnostic.score}`
          : `${endpoint(diagnostic.low, "low")}–${endpoint(diagnostic.high, "high")}`;
      const bands = diagnostic.status === "available" ? `${diagnostic.lowBand}–${diagnostic.highBand}` : "Unavailable";
      return [SCORE_ASPECT_LABEL[key], evidence, range, bands];
    }),
    note: "Missing-input sensitivity: hold the recorded score on observed signal weight fixed and let unobserved applicable weight score from 0 to 100. Route-inapplicable inputs are excluded. Ranges round outward to 0.01 points. Band possibilities apply house thresholds to unrounded endpoints; they are not assessed grades. This is not a probability interval or evidence of accuracy; observing every signal does not establish correctness. Recorded scores, grades and weights stay unchanged, including existing grade admission rules.",
  };
}

/** Absent evidence shares retain legacy presentation; compare the unrounded share. */
export function businessQualityGraded(a: NonNullable<Report["scores"]>["assessments"]): boolean {
  return typeof a?.businessQuality.evidenceCompleteness !== "number"
    || a.businessQuality.evidenceCompleteness >= MIN_HEADLINE_EVIDENCE;
}

/** The business-quality / price-attractiveness split beside the composite, when recorded. */
export function assessmentLine(scores: NonNullable<Report["scores"]>): string | null {
  const a = scores.assessments;
  if (!a) return null;
  const businessKeys = ["fundamentals", "quality", "balanceSheet", "moat", "leadership"] as const;
  const business = businessKeys.map(key => scores.qualification?.aspects[key]);
  const businessQualification = business.find(q => q?.status === "provisional") ?? business.find(q => q?.status === "unknown");
  return [
    `Business quality ${a.businessQuality.score === null ? "—" : formatScore(a.businessQuality.score)} (${!businessQualityGraded(a) ? `not graded: evidence ${evidencePercentText(a.businessQuality.evidenceCompleteness!)}` : a.businessQuality.band === null ? "—" : qualifiedGradeLabel(withNeutral(a.businessQuality.band, a.businessQuality.score), businessQualification)})`,
    // D-67: the valuation letter is withheld under the evidence floor here too.
    `price attractiveness ${a.valuation.score === null ? "—" : formatScore(a.valuation.score)} (${hasLimitedEvidence(scores.aspects.valuation) ? "limited evidence" : a.valuation.band === null ? "—" : qualifiedGradeLabel(withNeutral(a.valuation.band, a.valuation.score), scores.qualification?.aspects.valuation)})`,
    `evidence available for ${evidencePercentText(a.evidenceCompleteness)} of the signal weight`,
  ].join(" · ");
}

/**
 * A pass in one line: model, effort, tokens and any adjustment (the full record is in the audit export).
 * R1: given the cost ledger, the tokens are every request the pass made (with how many there were and
 * were discarded) when its rows carry tokens, not only the accepted attempt's.
 */
export function passLine(entry: NonNullable<Report["meta"]["execution"]>[number], costLedger?: readonly LedgerRow[]): string {
  const step = passAttemptName(entry.step);
  const effort = entry.effectiveEffort ? `, ${entry.effectiveEffort} effort` : "";
  const ledger = costLedger === undefined ? null : ledgerUsage(costLedger.filter((row) => row.step === entry.step));
  const tokens = ledger !== null
    ? `; ${ledger.requests > 1 ? `${requestCountText(ledger)}; ` : ""}${tokenText(ledger.input, ledger.output)}`
    : entry.inputTokens === undefined && entry.outputTokens === undefined ? ""
      : `; ${tokenText(entry.inputTokens ?? null, entry.outputTokens ?? null)}`;
  const requested = entry.requestedModel !== entry.effectiveModel ? ` (requested ${entry.requestedModel})` : "";
  const adjusted = entry.adjustments.length > 0 ? `; ${entry.adjustments.join(", ")}` : "";
  return `${step}: ${entry.effectiveModel}${requested}${effort}${tokens}${adjusted}${(entry.note ?? "").includes(FAILED_PASS_NOTE) ? `; failed: ${FAILED_PASS_NOTE}` : ""}`;
}

/** Score drivers with reader labels, values in their own units and the points each adds. */
export function scoreDriverTable(scores: NonNullable<Report["scores"]>): BodyTable | null {
  const historyLabel = (signal: NonNullable<NonNullable<Report["scores"]>["aspects"]["valuation"]["signals"]>[number]): string => {
    // a P/TBV rank that fell back to P/B is named for what it ranks (D-97).
    if (signal.id === "priceToTbvOwnHistoryRank" && signal.operands.some(operand => /\.multiples\.priceToBook\.current$/.test(operand.source))) return "P/B own-history rank";
    if (signal.id !== "peOwnHistoryRank") return signalLabel(signal.id);
    const source = signal.operands.find(operand => /\.multiples\.(?:peTtm|evToEbitda|priceToFcf)\.current$/.test(operand.source))?.source;
    const key = source?.split(".").at(-2);
    return `${key === "peTtm" ? "P/E" : key === "evToEbitda" ? "EV/EBITDA" : key === "priceToFcf" ? "Price/FCF" : "Multiple"} own-history rank`;
  };
  const rows = SCORE_ASPECT_ORDER.flatMap((key) => (scores.aspects[key].signals ?? []).map((signal) => [
    SCORE_ASPECT_LABEL[key],
    historyLabel(signal),
    signalValueText(signal),
    signal.period ?? "—",
    formatNumber(signal.transformedScore, 0),
    formatPct(signal.effectiveCompositeWeightPct, 1),
    signedPoints(signal.contributionPoints),
    [signal.id === "roteLevel" || signal.id === "roteFloor" ? MODEL_TANGIBLE_COMMON_BASIS : null, signal.fallbackReason].filter(Boolean).join("; ") || "—",
  ]));
  if (rows.length === 0) return null;
  return {
    heading: "Score drivers",
    headers: ["Aspect", "Signal", "Value", "Measured over", "Subscore", "Weight", "Points vs 50", "Fallback"],
    rows,
    note: "The composite is 50 plus the points column. Signals in the same factor family are not independent confirmations.",
  };
}

export function factorExposureTable(scores: NonNullable<Report["scores"]>): BodyTable | null {
  if (!scores.factorExposure || scores.factorExposure.length === 0) return null;
  return {
    heading: "Factor-family exposure",
    headers: ["Factor family", "Weight", "Points vs 50"],
    rows: scores.factorExposure.map((x) => [sentence(segmentWords(x.family)), formatPct(x.weightPct, 1), signedPoints(x.aboveNeutralPoints)]),
  };
}

/** P20: data-only runs performed no citation-check pass. */
export function displayedProvenanceCoverage(report: Pick<Report, "meta" | "appendix">, scope: "header" | "appendix"): ProvenanceCoverage | undefined {
  if (report.appendix.missingData.some(gap => gap.field === "analysis.llm")) return undefined;
  return scope === "header" ? report.meta.provenanceCoverage : report.appendix.provenanceCoverage ?? report.meta.provenanceCoverage;
}

/** P20: merge identical stored macro rows without altering the record. */
/**
 * the pipeline fetches these FRED series as transforms (CPI as year-over-year %, payrolls as a monthly change),
 * but the model names the row, and "Core consumer price index... 2.6%" read as an index level. Transformed rows
 * take a fixed name for what is measured.
 */
const MACRO_TRANSFORM_NAMES: Readonly<Record<string, { unit: RegExp; name: string }>> = {
  CPIAUCSL: { unit: /^%$|percent/i, name: "CPI inflation (all items), year over year" },
  CPILFESL: { unit: /^%$|percent/i, name: "Core CPI inflation (excluding food and energy), year over year" },
  PAYEMS: { unit: /thousand/i, name: "Nonfarm payrolls, monthly change" },
};

/** FRED keys monthly and quarterly observations to the period's first day; that date is not a release date. */
const MONTHLY_MACRO_SERIES = new Set(["CPIAUCSL", "CPILFESL", "UNRATE", "PAYEMS", "FEDFUNDS", "CPIMEDSL", "CES6562000001", "INDPRO", "IPUTIL",
  "PPIACO", "WPU101", "PCOPPUSDM", "RSAFS", "UMCSENT", "TOTALSA", "PCEDG", "PCE", "PCEND", "HOUST", "CSUSHPINSA", "CUSR0000SEHA",
  "APU000072610", "DGORDER", "TSIFRGHT"]);
const QUARTERLY_MACRO_SERIES = new Set(["DRTSCILM"]);
const MONTH_ABBREVIATIONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The observation period a macro row's date stands for: "Sep 2026", "Q3 2026" or the date itself. */
export function macroObservationLabel(seriesId: string, asOf: string | null): string {
  if (asOf === null) return "—";
  const m = /^(\d{4})-(\d{2})-01$/.exec(asOf);
  if (m && MONTHLY_MACRO_SERIES.has(seriesId)) return `${MONTH_ABBREVIATIONS[Number(m[2]) - 1]} ${m[1]}`;
  if (m && QUARTERLY_MACRO_SERIES.has(seriesId) && ["01", "04", "07", "10"].includes(m[2]!)) return `Q${(Number(m[2]) + 2) / 3} ${m[1]}`;
  return asOf;
}

export type MacroDisplayRow = Report["macro"]["relevantSeries"][number] & { observation: string };

export function macroDisplayRows(macro: Report["macro"]): MacroDisplayRow[] {
  const rows: MacroDisplayRow[] = [];
  for (const row of macro.relevantSeries) {
    const existing = rows.find(r => r.seriesId === row.seriesId && r.latest.unit === row.latest.unit && r.latest.value === row.latest.value && r.latest.asOf === row.latest.asOf);
    if (existing) { if (!existing.relevance.includes(row.relevance)) existing.relevance += ` ${row.relevance}`; continue; }
    const transform = MACRO_TRANSFORM_NAMES[row.seriesId];
    rows.push({ ...row, name: transform && transform.unit.test(row.latest.unit) ? transform.name : row.name, observation: macroObservationLabel(row.seriesId, row.latest.asOf) });
  }
  return rows;
}

/* ======================================================================== *
 * Valuation display decisions (P22)
 *
 * Which fair value the valuation section shows and under what label, the
 * comparison with the price (sign and rounding), the withheld and no-model
 * text, the caveats beside the value, and the scenario rows. The app's
 * valuation section (the dossier layout, the only app layout since D-246), its
 * bridge, the key-data box, Markdown and print read these; each renderer only
 * escapes and lays out the text.
 *
 * Every function takes the surface. Where surfaces decide differently today,
 * the difference is a named EXCEPTION here and is kept, so no reader-visible
 * text changes; scripts/report-drift.ts measures each one. Raw traces stay
 * separate from the rounded visible text (`perShare` / `target` beside
 * `valueText` / `targetText`).
 * ======================================================================== */

/** The reader surfaces that show the valuation section. */
export type ValuationSurface = "markdown" | "print" | "dossier";

/** Where the valuation-to-price comparison is shown: a valuation surface or the key-data box. */
export type ValuationComparisonSurface = ValuationSurface | "key-data";

function exportSurface(surface: ValuationComparisonSurface): boolean {
  return surface === "markdown" || surface === "print";
}

/** Every surface's words for a scenario whose per-share target was suppressed. */
export const SCENARIO_TARGET_UNAVAILABLE_TEXT = "per-share target unavailable";

/** The word every surface shows when the headline per-share value is withheld. */
export const VALUATION_WITHHELD_TEXT = "unavailable";

/** The reason the exports print after {@link VALUATION_WITHHELD_TEXT}. */
const VALUATION_WITHHELD_REASON = "the deterministic fair value could not be computed for this route/inputs (see the data-gap summary in the appendix).";

export interface ValuationComparisonView {
  /** The raw stored percentage. */
  pct: number;
  /** The rounded, signed visible text (formatPct, one decimal; a value that rounds to zero prints unsigned). */
  text: string;
  /** "upside" in the exports (before the value); "vs price" in the app (before) and key data (after). */
  label: string;
  /**
   * The app's tone. A negative value that rounds to zero is "neg"
   * (EXCEPTION app-zero-tone: kept as today).
   */
  tone: "pos" | "neg";
}

/**
 * The comparison of the shown per-share value with the price, or null when
 * the value is withheld or no comparison was recorded.
 */
export function valuationComparison(
  perShare: TracedNumber | null,
  upsidePct: number | null,
  surface: ValuationComparisonSurface,
): ValuationComparisonView | null {
  if (perShare === null || upsidePct === null) return null;
  // The exports' signed-percent helper prints an em dash for a non-finite value; the app prints "n/a".
  const text = Number.isFinite(upsidePct) || !exportSurface(surface) ? formatPct(upsidePct, 1, true) : "—";
  return { pct: upsidePct, text, label: exportSurface(surface) ? "upside" : "vs price", tone: upsidePct >= 0 ? "pos" : "neg" };
}

/** The headline label per surface. */
function valuationHeadlineLabel(fairValue: FairValue | undefined, surface: ValuationSurface): string {
  const excessReturn = fairValue?.method === "excess-return";
  // The exports print a sentence label; the app prints a compact caption.
  if (exportSurface(surface)) return excessReturn ? "Model value per share" : "Intrinsic value per share";
  // EXCEPTION dossier-label: the dossier names the FCFF method and calls any other method a recorded model value.
  return excessReturn ? "Excess-return · model value / share"
    : fairValue?.method === "fcff-dcf" ? "FCFF DCF · model value / share" : "Recorded model value / share";
}

export interface ValuationHeadlineView {
  /** The exports' subsection heading. */
  heading: string;
  label: string;
  /** The shown per-share trace (raw), or null when the value is withheld. */
  perShare: TracedNumber | null;
  /** The rounded visible value, or null when withheld. */
  valueText: string | null;
  /** The text after {@link VALUATION_WITHHELD_TEXT} when withheld; null where the surface prints no reason. */
  withheldReason: string | null;
  comparison: ValuationComparisonView | null;
  /** Substituted inputs, at reader precision, beside a shown value (D-111). */
  degradedCaveat: string | null;
  /** The fair value's basis, or why it is withheld or only a dated reference. */
  basisCaveat: string | null;
  /** The app's provenance disclosure label. */
  provenanceLabel: string;
}

/** The valuation headline as one surface shows it (when a cash-flow model applies). */
export function valuationHeadlineView(
  valuation: Pick<Valuation, "dcf">,
  fairValue: FairValue | undefined,
  surface: ValuationSurface,
): ValuationHeadlineView {
  const perShare = valuation.dcf.perShare;
  const degraded = perShare ? fairValueDegradedText(fairValue) : null;
  return {
    heading: fairValue?.method === "excess-return" ? "Excess-return value" : "DCF",
    label: valuationHeadlineLabel(fairValue, surface),
    perShare,
    // The exports print the trace in its own unit; the app prints it through the figure primitive.
    valueText: perShare === null ? null : exportSurface(surface) ? formatFinancialValue(perShare.value, perShare.unit, perShare.currency) : figureValueText(perShare),
    // EXCEPTION app-withheld-no-reason: the app prints the word alone, with no reason.
    withheldReason: exportSurface(surface) ? VALUATION_WITHHELD_REASON : null,
    comparison: valuationComparison(perShare, valuation.dcf.upsidePct, surface),
    degradedCaveat: degraded ? displayProse(degraded) : null,
    basisCaveat: fairValue === undefined ? null
      : fairValue.status === "available" ? displayProse(readerFairValueBasisText(fairValue.basis))
        // EXCEPTION markdown-withheld-reader-form: only Markdown prints the withheld or
        // dated-reference sentence in reader form (displayProse: registry ids as reader
        // labels, figures at reader precision); print and the app print it as stored.
        : surface === "markdown" ? displayProse(readerFairValueWithheldText(fairValue)) : readerFairValueWithheldText(fairValue),
    provenanceLabel: surface === "dossier" || fairValue?.method === "excess-return" ? "Model value provenance" : "DCF provenance",
  };
}

/**
 * Why no value is shown when no cash-flow model applies, or null without a
 * fair value record. EXCEPTION markdown-no-model-reader-form: Markdown prints
 * this sentence as stored; print and the app print it in reader form
 * (displayProse: registry ids as reader labels, grouped and rounded figures).
 */
export function valuationNoModelWithheldText(fairValue: FairValue | undefined, surface: ValuationSurface): string | null {
  if (fairValue === undefined) return null;
  const text = readerFairValueWithheldText(fairValue);
  return surface === "markdown" ? text : displayProse(text);
}

/** The dossier bridge's per-share endpoint label. */
export function recordedPerShareLabel(dcf: Pick<Dcf, "perShare">): string {
  return `Recorded model value per share${dcf.perShare === null ? " (audit only)" : ""}`;
}

/** Every key-data fair-value label starts with this. */
const KEY_DATA_FAIR_VALUE_PREFIX = "Model fair value";

/** True for the key-data row that carries the model fair value. */
export function isFairValueKeyDataLabel(label: string): boolean {
  return label.startsWith(KEY_DATA_FAIR_VALUE_PREFIX);
}

/**
 * The key-data label for the model fair value. A shown or out-of-domain value
 * names excess return or else DCF; an unavailable one names only a recorded
 * FCFF or excess-return method (EXCEPTION key-data-unavailable-label).
 */
export function fairValueKeyDataLabel(fairValue: FairValue | undefined, state: "shown" | "unavailable"): string {
  if (fairValue?.method === "excess-return") return `${KEY_DATA_FAIR_VALUE_PREFIX} (excess return)`;
  if (state === "shown" || fairValue?.method === "fcff-dcf") return `${KEY_DATA_FAIR_VALUE_PREFIX} (DCF)`;
  return KEY_DATA_FAIR_VALUE_PREFIX;
}

export interface ScenarioWeightView {
  label: string;
  text: string;
  /** The app's line when the weight is not recorded. */
  unavailableNote: string;
}

export interface ScenarioRowView {
  scenario: Scenario;
  /** The scenario's index in the stored list. */
  index: number;
  /** The raw target trace, or null when suppressed. */
  target: TracedNumber | null;
  /** The rounded visible target, or null when suppressed ({@link SCENARIO_TARGET_UNAVAILABLE_TEXT}). */
  targetText: string | null;
  /** Null when no weight is shown (D-60: a computed target carries no weight). */
  weight: ScenarioWeightView | null;
  /** The assumption lines this scenario does not share with the others. */
  assumptions: string[];
}

export interface ScenarioBlockView {
  heading: string;
  /** The line on what the weights mean, or null when the surface prints none. */
  weightBasis: string | null;
  /** D-62: the assumption lines every scenario shares, stated once. */
  common: string[];
  rows: ScenarioRowView[];
}

/**
 * A scenario's weight as one surface shows it, or null when no weight is
 * shown (D-60: a computed target carries no weight unless one was stored).
 * EXCEPTION app-weight-wording: the app capitalizes "Display weight" and
 * prints a missing weight as "n/a"; the exports print "unavailable".
 */
export function scenarioWeightView(probability: number | null, computedWeights: boolean, surface: ValuationSurface): ScenarioWeightView | null {
  if (computedWeights && probability === null) return null;
  const app = !exportSurface(surface);
  return {
    label: computedWeights ? app ? "Display weight" : "display weight" : "p",
    text: probability === null ? app ? "n/a" : "unavailable" : `${(probability * 100).toFixed(0)}%`,
    unavailableNote: computedWeights ? "display weight unavailable" : "scenario probability unavailable",
  };
}

/** The app's line when a report recorded no weight basis. */
const APP_WEIGHT_BASIS_FALLBACK = "Narrative probabilities are model JUDGMENTs, not empirically calibrated odds. Data-only reports show them as unavailable.";

/** The scenario rows as one surface shows them (when a cash-flow model applies). */
export function valuationScenarioView(
  valuation: Pick<Valuation, "scenarios">,
  scenarioPresentation: Report["scenarioPresentation"],
  surface: ValuationSurface,
): ScenarioBlockView {
  const app = !exportSurface(surface);
  const computedWeights = app ? Boolean(scenarioPresentation) : scenarioPresentation !== undefined;
  const { common, specific } = splitCommonLines(valuation.scenarios.map((sc) => sc.assumptions.map((line) => displayProse(compactLongIntegers(line)))));
  // EXCEPTION app-scenario-order: the app shows bull, base, bear in that order; the exports keep the stored order.
  const ordered = app
    ? (["bull", "base", "bear"] as const).flatMap((name) => { const found = valuation.scenarios.find((sc) => sc.name === name); return found ? [found] : []; })
    : valuation.scenarios;
  const rows = ordered.map((scenario): ScenarioRowView => {
    const index = valuation.scenarios.indexOf(scenario);
    const target = scenario.priceTarget;
    return {
      scenario,
      index,
      target,
      targetText: target === null ? null : app ? figureValueText(target) : formatFinancialValue(target.value, target.unit, target.currency),
      weight: scenarioWeightView(scenario.probability, computedWeights, surface),
      assumptions: specific[index] ?? [],
    };
  });
  return {
    heading: !app ? "Scenarios" : scenarioPresentation ? "scenarios · sensitivity cases (bull / base / bear)" : "scenarios · probability-weighted (bull / base / bear)",
    // EXCEPTION app-weight-basis-fallback: the app prints a fallback line when none was recorded; the exports print nothing.
    weightBasis: app ? scenarioPresentation?.weightBasis ?? APP_WEIGHT_BASIS_FALLBACK : scenarioPresentation?.weightBasis || null,
    common,
    rows,
  };
}

/**
 * The scenario price-target caveat, or null without a targets record. The
 * surface's escape is applied to each recorded part, never to the fixed words.
 */
export function scenarioTargetsCaveat(scenarioTargets: ScenarioTargets | undefined, escape: (text: string) => string): string | null {
  if (!scenarioTargets) return null;
  return scenarioTargets.status === "available"
    ? `Price targets are computed-derived (${escape(scenarioTargets.method)}), not analyst targets. ${escape(displayProse(scenarioTargets.basis.join(" ")))}`
    : `Scenario price targets suppressed — ${escape(scenarioTargets.missingReasons.map((m) => m.reason).join("; ") || scenarioTargets.basis.join(" "))}`;
}


/** D-287: a disclosed liquidity gap occupies a row on every surface. */
export function unavailableLiquidityTable(commentary: readonly import("@/report/schema").SourcedClaim[]): ReportAuditTable[] {
  const gap = commentary.find(claim => (claim.sourceId ?? claim.source) === "computed.capital.current.debtBridge.cashAndShortTermInvestments.unavailable");
  return gap ? [{ heading: "Liquidity", headers: ["Metric", "Value", "Reason"], rows: [["Cash and short-term investments", "Unavailable", gap.text]] }] : [];
}
