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
import { PRINCIPAL_CORRECTION_FIELD } from "@/report/principalAggregationSafety";
import { withHistoricalEnterpriseValueSafety } from "@/report/enterpriseValueSafety";
import { compositeNote, compositeText, evidencePercentText, hasLimitedEvidence, MIN_HEADLINE_EVIDENCE, withNeutral } from "@/report/assessment";
import { formatScore } from "@/report/scoreText";
import { displayedClaimCoverage, displayedFactualValidation, displayedValidationStatus, numericClaimPartition } from "@/report/claimMatching";
export { displayedFactualValidation, displayedValidationStatus } from "@/report/claimMatching";
import { isComputedFigure } from "@/report/verificationMarks";
import { dcfBaseRateText } from "@/pipeline/stageB/fairValue";
import { fairValueDegradedText } from "@/report/fairValueText";
import { riskFreeSourceLabel } from "@/pipeline/riskFreeSeries";
export { factorContributionSensitivityTable } from "@/report/auditTables";
import type { ClassifiedGap, ReportCompletenessPresentation } from "@/report/completeness";
import { reportSection } from "@/report/sectionManifest";
import { EXECUTIVE_EVIDENCE_GROUPS } from "@/report/surfaceManifest";
import {
  decimalRound,
  formatCostUsd,
  roundedDisplayedCostTotal,
  formatFinancialAmount,
  formatLargeNumber,
  formatMoneyAmount,
  formatMultiple,
  formatNumber,
  formatPct,
  numericCitationTraceLabel,
  tracedPeriodLabel,
  unitLabel,
  establishedCurrency,
} from "@/report/format";
import type { ManifestEntry } from "@/types/core";
import type {
  MoatAssessment,
  ProvenanceCoverage,
  Report,
  ScoreSignal,
  SourcedClaim,
  TracedNumber,
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
  [/\b(gross margin|operating expenses|operating margin|tax rate|diluted EPS) (GAAP|non-GAAP)\b/g, "$2 $1"],
  [/\bfree cash flow operating cash flow less capex\b/gi, "FCF, operating cash flow less capex,"],
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
  // AMZN audit 2026-10-20 finding 20: the scaler is average NOA, or average
  // total assets when NOA is not positive (the forensic notes say which); one
  // label serves both, so it names neither.
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
  // D-67: ids the NVDA final rerun cited under mechanical labels.
  "computed.valuation.dcf.perShare": "DCF value per share",
  "computed.valuation.guided-run-rate-growth-over-ttm-next-quarter-guidance-4": "Guided run-rate growth over TTM (next-quarter guidance × 4)",
  "computed.valuation.guided-sequential-pace-annualized": "Guided sequential pace, annualized",
  "computed.valuation.consensus-year-one-revenue-growth-over-ttm": "Consensus year-one revenue growth over TTM",
  "computed.valuation.dcf-base-case-year-one-revenue-growth-over-ttm": "DCF base-case year-one revenue growth over TTM",
  // AMZN audit 2026-10-20 finding 15: "price paid vs the year's average" beside
  // -3.0% read as paying 3% below the average; the measure is the reverse.
  "computed.capital.buybackPriceAnalysis.timingPct": "Buyback timing (year-average cost vs cost paid; negative = paid above average)",
  "computed.forensics.accruals.definition": "Accrual definition",
  "computed.forensics.beneish.growthLed": "Beneish growth-led test",
  "computed.forensics.beneish-m-with-the-sales-growth-index-at-neutral-1-0": "Beneish M-score (sales-growth index at 1.0)",
  "computed.forensics.piotroski-f-9-signals": "Piotroski F-score (nine signals)",
  "computed.forensics.accrual-operand-operating-investing-cash-flow-cfi-without-financial-asset-flows": "Operating investing cash flow (excluding financial-asset flows)",
  "manifest.valuation.multiples.ownHistory": "Data-gap record: own-history multiple ranks",
};

/** AI-117: reader labels for the insider-statistics ids (the generic fallback reads "form 4 code s"). */
const INSIDER_STAT_LABEL: Readonly<Record<string, string>> = {
  "open-market-purchase-transactions": "Insider open-market purchase transactions (Form 4 code P)",
  "open-market-sale-transactions": "Insider open-market sale transactions (Form 4 code S)",
  "shares-acquired": "Insider shares acquired (all reported acquisitions)",
  "shares-disposed": "Insider shares disposed (all reported dispositions)",
  "acquired-disposed-transaction-count-ratio": "Insider acquired/disposed transaction-count ratio",
};

const PATTERN_LABELS: ReadonlyArray<readonly [RegExp, (match: RegExpExecArray) => string]> = [
  [/^computed\.deterministic-aspect-scores\.([a-z]+)-score$/i, (m) => `${ASPECT_LABEL[m[1]!] ?? sentence(segmentWords(m[1]!))} score`],
  [/^computed\.scores\.([a-zA-Z]+)$/, (m) => `${ASPECT_LABEL[m[1]!] ?? sentence(segmentWords(m[1]!))} score`],
  [/^computed\.scores\.([a-zA-Z]+)\.([a-zA-Z0-9]+)$/, (m) => signalLabel(m[2]!)],
  [/^payload\.statements\.(income-statement|cash-flow|balance-sheet)-(quarterly|annual)\.(\d{4}-\d{2}-\d{2})\.(.+)$/, (m) =>
    `${sentence(segmentWords(m[4]!))} (${m[1] === "balance-sheet" ? "at" : m[2] === "quarterly" ? "quarter ended" : "year ended"} ${m[3]})`],
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
  [/^payload\.macro\.([a-z0-9]+)-[a-z]+$/, (m) => `FRED ${m[1]!.toUpperCase()}`],
  [/^payload\.insiders\.insider-(open-market-purchase-transactions|open-market-sale-transactions|shares-acquired|shares-disposed|acquired-disposed-transaction-count-ratio)-.*?(one|two|three|four)-calendar-quarters?-ended-(\d{4}-\d{2}-\d{2})$/, (m) => `${INSIDER_STAT_LABEL[m[1]!]}, ${m[2]} calendar quarter${m[2] === "one" ? "" : "s"} ended ${m[3]}`],
  [/^payload\.insiders\.mspr-(\d{4}-\d{2})$/, (m) => `Insider sentiment (MSPR), ${m[1]}`],
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
    revenueCagr: "Revenue CAGR", operatingMarginSlope: "Operating-margin slope", epsCagr: "EPS CAGR",
    fcfCagr: "FCF CAGR", dcfUpside: "DCF upside", reverseImpliedVsAchievable: "Reverse-DCF implied vs achievable growth",
    roicVsWaccSpread: "ROIC − WACC spread", piotroskiF: "Piotroski F (share of signals)",
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
    // Audit 2026-10-22 B-13: the regulated-utility balance sheet.
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
  const fromUnit = unitLabel(unit);
  if (fromUnit) return fromUnit[0]!.toUpperCase() + fromUnit.slice(1);
  // Audit 2026-10-22 B-9: a multiple on the latest fiscal year (TTM
  // suppressed) names that year in its payload label, so in its id too.
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

/** B-4: the risk-free citation, `computed.returns.wacc.riskFree(<series id>)`. */
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
  // B-4: the risk-free citation carries the series that served the rate.
  const riskFree = RISK_FREE_CITATION.exec(source);
  if (riskFree) return `Risk-free rate (${riskFreeSourceLabel(riskFree[1]!)})`;
  if (/^(computed|payload|manifest)\.[^\s]+$/.test(source)) return metricLabel(source);
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

/* ======================================================================== *
 * Figure rows: human label, rounded value, deduplication
 * ======================================================================== */

export interface FigureRow {
  label: string;
  value: string;
  /** The measurement window, or null when the figure did not supply one. */
  period: string | null;
  asOf: string | null;
  /** "✓", "computed" (a data-only report's figure), "untraced" or "not checked". */
  cited: string;
  trace: TracedNumber;
}

export function citedMark(n: TracedNumber): string {
  // F-23: a data-only report ran no citation check; its figures were computed.
  return n.verified === true ? isComputedFigure(n) ? "computed" : "✓" : numericCitationTraceLabel(n.verified);
}

/**
 * A figure's displayed value. D-67: a ratio read as a percentage (FCF
 * conversion, accrual ratios) prints in whole percent wherever it appears, and
 * the Piotroski count prints against its nine signals.
 */
export function figureValueText(n: Pick<TracedNumber, "value" | "unit" | "currency" | "source">): string {
  const unit = n.unit.trim().toLowerCase();
  if (isRatioAsPercent(n.source) && ["x", "×", "multiple", "fraction", "frac", "ratio"].includes(unit)) return ratioPercentText(n.value);
  if (/piotroski-f-9-signals$/.test(n.source) && Number.isInteger(n.value)) return `${n.value}/9`;
  return formatFinancialAmount(n.value, n.unit, n.currency);
}

export function figureRow(n: TracedNumber, label?: string): FigureRow {
  const period = tracedPeriodLabel(n.period, n.periodContext).replace(/^not supplied; /, "");
  return {
    label: label ?? metricLabel(n.source, n.unit),
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

/** Exact source duplicates, or a known alias with the same displayed value and measurement basis. */
function figureIdentities(row: FigureRow): string[] {
  const n = row.trace;
  const p = n.periodContext;
  const context = p === undefined ? null : p.kind === "instant"
    ? [p.kind, p.at, p.basis ?? null, p.fiscalLabel ?? null]
    : [p.kind, p.start, p.end, p.basis ?? null, p.fiscalLabel ?? null];
  const basis = [n.unit, n.currency ?? null, n.asOf, n.period ?? null, context];
  const source = n.sourceId ?? n.source;
  const exact = JSON.stringify(["source", source, n.value, ...basis]);
  const metric = FIGURE_METRIC_ALIASES.get(source);
  return metric === undefined ? [exact] : [exact, JSON.stringify(["alias", metric, row.value, ...basis])];
}

/**
 * Figure rows with exact duplicates removed (D-62): the capital bridge and the
 * forensic battery register the same figure under two ids
 * (`computed.current-capital.*` and `computed.capital.current.*`), and the
 * report printed both. `seen` carries identities across the tables of one
 * section. The first occurrence wins. Currency and measurement metadata must
 * agree; missing metadata is not evidence that two different windows match.
 */
export function dedupeFigureRows(rows: readonly FigureRow[], seen: Map<string, FigureRow> = new Map()): FigureRow[] {
  const out: FigureRow[] = [];
  for (const row of rows) {
    const identities = figureIdentities(row);
    const prior = identities.map((identity) => seen.get(identity)).find((entry) =>
      entry !== undefined && (
        (entry.trace.sourceId ?? entry.trace.source) !== (row.trace.sourceId ?? row.trace.source)
        || entry.trace.value === row.trace.value
      ));
    if (prior) {
      continue;
    }
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
  const contentRows = rows.filter((row) => row.some((cell, index) => (index === 0 ? !isEmptyCell(cell) : !isEmptyCell(cell))));
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
 * compactly ("302.97B"). Display only; ten or more digits, so years, counts
 * and accession numbers are untouched.
 */
export function compactLongIntegers(text: string): string {
  return text.replace(/(^|[^\d.,\-])(-?\d{10,})(?!\d|[.,]\d|-\d)/g, (_, lead: string, digits: string) => `${lead}${formatLargeNumber(Number(digits))}`)
    .replace(/([\dKMBT])\s+reporting-currency units/g, "$1 (reporting currency)")
    .replace(/\(reporting-currency units\)/g, "(reporting currency)");
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

/** Display name for a geographic segment ("TAIWAN, PROVINCE OF CHINA" → "Taiwan"). */
export function geographyLabel(name: string): string {
  const fixed: Record<string, string> = {
    "TAIWAN, PROVINCE OF CHINA": "Taiwan",
    "TAIWAN": "Taiwan",
    "CHINA": "China (incl. Hong Kong)",
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
 * D-67: executives
 * ======================================================================== */

type ExecutiveRecord = Report["leadership"]["executives"][number];

/** An executive grade for a reader: the raw enum "not-assessed" is never printed. */
export function executiveGradeText(grade: ExecutiveRecord["grade"]): string {
  return grade === "not-assessed" ? "Not assessed" : grade;
}

export interface ExecutiveGroups {
  /** Officers with at least one assessed grade: one card each. */
  assessed: ExecutiveRecord[];
  /** Officers with neither grade assessed: one line lists them. */
  notAssessed: ExecutiveRecord[];
  /** The lines that name them, one per distinct reason. */
  notAssessedLines: string[];
  /** Their cited facts (pay, succession events), kept under the line; their judgments are not. */
  notAssessedClaims: SourcedClaim[];
}

/**
 * D-67: the identical "not assessed" cards (NVDA: six of eight, each repeating
 * the same grade line and reason) collapse into one line per distinct reason
 * listing those officers; their cited facts stay beneath it.
 */
export function executiveGroups(executives: readonly ExecutiveRecord[]): ExecutiveGroups {
  const notAssessed = executives.filter((e) => e.grade === "not-assessed" && e.credibilityGrade === "not-assessed");
  const assessed = executives.filter((e) => !notAssessed.includes(e));
  const byReason = new Map<string, ExecutiveRecord[]>();
  for (const e of notAssessed) {
    const reason = e.assessmentReason?.trim() ?? "";
    byReason.set(reason, [...(byReason.get(reason) ?? []), e]);
  }
  const notAssessedLines = [...byReason.entries()].map(([reason, people]) =>
    `Not assessed: ${people.map((e) => `${e.name} (${e.title})`).join("; ")}.${reason ? ` ${reason}` : ""}`);
  // AMZN audit 2026-10-20 finding 20: only cited facts go under the line. The
  // officer's judgments are the model's case for a grade the evidence gate
  // withheld, so "Not assessed" was followed by "X's execution grade
  // recognizes ...".
  const notAssessedClaims = notAssessed.flatMap((e) => [...e.reasoning, ...EXECUTIVE_EVIDENCE_GROUPS.flatMap((group) => e.evidence[group.key] ?? [])])
    .filter((claim) => claim.label === "FACT");
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
export function annualSegmentHeading(kind: "Product" | "Geographic", rows: readonly { revenue: TracedNumber }[], quarterlyShown: boolean): string {
  if (!quarterlyShown) return `${kind} segments`;
  const asOf = rows.find((row) => row.revenue.asOf)?.revenue.asOf;
  return `${kind} segments — annual${asOf ? `, fiscal year ended ${asOf}` : ""} (prior presentation)`;
}

/** A primary geography definition travels with every row, including exceptions. */
export function geographicBasisNote(rows: readonly { revenue: TracedNumber }[]): string | null {
  const first = rows[0]?.revenue;
  const note = first?.verificationNote;
  return first && typeof note === "string" && note.startsWith("Annual geographic revenue (") &&
    first.source.startsWith("https://www.sec.gov/Archives/edgar/data/") &&
    rows.every(row => row.revenue.source === first.source && row.revenue.verificationNote === note) ? note : null;
}

/** A technical indicator's label, naming an intraday quote "latest price" rather than "last close". */
export function indicatorLabel(n: TracedNumber, timing: { intraday: boolean; detail: string | null }): string {
  if (n.source === "computed.technicals.last-close" && timing.intraday) return `Latest price (${timing.detail})`;
  return metricLabel(n.source, n.unit);
}

/** The reverse-DCF implied value with the unit its metric names. */
export function reverseDcfValueText(metric: string, value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
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

/**
 * How to name the quoted price (audit P3): "last close" when the quote was
 * observed at or after the 16:00 New York close (or on a weekend), "latest
 * price" with the time when it was observed during the session.
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
 * The page-1 key-data box (audit P1-12), built ONLY from values already in
 * the report: the provider market data block (D-62) when present, else the
 * traced quote, technicals and DCF bridge. A row whose inputs are absent is
 * omitted, never printed as "n/a". Derived rows (enterprise value at the
 * quote, forward P/E, dividend yield, short interest as a share of float)
 * say how they were derived.
 */
export function keyDataRows(report: Report): KeyDataRow[] {
  const traces = collectTraces(report);
  const md = report.marketData;
  const rows: KeyDataRow[] = [];
  const bridge = report.valuation.dcf.bridge;
  const dcf = report.valuation.dcf.perShare;
  const modelCurrency = dcf ? establishedCurrency(dcf.unit, dcf.currency) : bridge?.currency ?? null;
  const priceTrace = firstTrace(traces, /^payload\.quote\.price$/) ?? firstTrace(traces, /^computed\.technicals\.last-close$/);
  const priceCurrency = md?.currency ?? (priceTrace ? establishedCurrency(priceTrace.unit, priceTrace.currency) ?? modelCurrency : modelCurrency);
  const timing = priceTiming(report);
  const price = md?.quote?.price ?? priceTrace?.value ?? null;
  const priceAsOf = md?.quote ? md.quote.asOf : priceTrace?.asOf ?? null;
  if (price !== null) {
    rows.push({ label: `${timing.label}${timing.detail ? ` (${timing.detail})` : ""}`, value: money(price, priceCurrency, true), note: priceAsOf ? `as of ${priceAsOf}` : "observation date unavailable" });
  }
  const high = md?.quote?.yearHigh ?? firstTrace(traces, /^computed\.technicals\.52w-high$/)?.value ?? null;
  const low = md?.quote?.yearLow ?? firstTrace(traces, /^computed\.technicals\.52w-low$/)?.value ?? null;
  if (high !== null && low !== null) rows.push({ label: "52-week range", value: `${money(low, priceCurrency, true)} – ${money(high, priceCurrency, true)}` });

  const quotedCap = md?.quote?.marketCap ?? firstTrace(traces, /^payload\.quote\.market-?cap$/)?.value ?? null;
  const dilutedShares = bridge?.dilutedShares ?? null;
  const scope = report.valuation.marketValueScope;
  const admittedPriceAsOf = scope?.priceAsOf ?? null;
  // Audit 2026-10-22 B-8: a scope unresolved across share classes means the
  // quote's cap may cover one class only, so page one shows no figure as the issuer's.
  const classAmbiguous = scope?.status === "unresolved" && scope.classAmbiguity === true;
  const marketCap = scope?.status === "resolved" ? scope.marketCap : classAmbiguous ? null : quotedCap;
  if (classAmbiguous) rows.push({ label: "Issuer-common capitalization", value: "withheld", note: "class scope unresolved: the filings do not establish every class's outstanding count and economic relation to the quoted class; the quote's market cap may cover one class only" });
  if (marketCap !== null) rows.push(scope?.status === "resolved"
    ? { label: "Issuer-common capitalization", value: money(marketCap, scope.currency), note: `counts at ${scope.shareCountAsOf ?? "unavailable date"}; main quote as of ${admittedPriceAsOf ?? "unavailable date"}${scope.approximate ? scope.basis.includes("economic-weight approximation") ? "; economic-weight approximation" : "; same-price approximation" : ""}${scope.classPriceDates?.length ? `; separate class prices: ${scope.classPriceDates.map(row => `${row.classId} at ${row.asOf}`).join(", ")}` : ""}` }
    : md?.quote?.marketCapOrigin === "computed" && md.quote.marketCap === marketCap
      ? { label: scope ? "Derived market cap (scope unverified)" : "Market cap (derived)", value: money(marketCap, priceCurrency), note: `quote price × filed share count, computed by Métis${scope ? "; complete issuer-common coverage unverified" : ""}${priceAsOf ? `; as of ${priceAsOf}` : ""}` }
      : { label: scope ? "Provider market cap (scope unverified)" : "Market cap", value: money(marketCap, priceCurrency), note: scope ? `raw provider observation; complete issuer-common coverage unverified${priceAsOf ? `; as of ${priceAsOf}` : ""}` : "quote" });
  if (scope?.status === "resolved" && scope.enterpriseValue !== null) {
    rows.push({ label: "Enterprise value (market)", value: money(scope.enterpriseValue, scope.currency), note: scope.enterpriseValueBasis });
  } else if (!scope && marketCap !== null && bridge && bridge.netDebt !== null) {
    // Legacy reports retain their stored bridge convention; new reports use
    // the admitted Stage B EV, including its NCI, cash and lease scope guards.
    const ev = marketCap + bridge.netDebt + (bridge.noncontrollingBook ?? bridge.minorityInterest ?? 0) + (bridge.preferredEquity ?? 0);
    rows.push({ label: "Enterprise value (market)", value: money(ev, priceCurrency), note: `market cap + net debt${bridge.asOf ? ` at ${bridge.asOf}` : ""} (equity securities are not cash); the EV multiples use the same figure` });
  }
  const outstanding = md?.shares?.outstanding ?? null;
  if (scope?.status === "resolved" && scope.economicShares !== null) {
    rows.push({ label: "Economic share units", value: formatLargeNumber(scope.economicShares), note: `equivalence-weighted outstanding units at ${scope.shareCountAsOf ?? "unavailable date"}; not diluted weighted-average shares` });
  } else if (outstanding !== null && outstanding > 0) {
    const freeFloat = md?.shares?.freeFloatPct;
    rows.push({ label: scope ? "Provider shares (scope unverified)" : "Shares outstanding", value: formatLargeNumber(outstanding), note: scope ? `raw provider count; class coverage unverified${md?.shares?.asOf ? `; at ${md.shares.asOf}` : ""}` : comparableFloatDate(md?.shares) && freeFloat != null && freeFloat >= 0 && freeFloat <= 100 ? `${formatPct(freeFloat, 1)} free float` : undefined });
  } else if (!scope && dilutedShares !== null && dilutedShares > 0) {
    rows.push({ label: "Diluted shares", value: formatLargeNumber(dilutedShares), note: bridge?.asOf ? `at ${bridge.asOf}` : undefined });
  }
  // Audit 2026-10-22 B-24: the newer quarter's headline, apart from every statement figure.
  const newer = report.filingDisclosures?.newerResults;
  if (newer && newer.revenue !== null && newer.epsDiluted !== null && newer.currency !== null) {
    rows.push({
      label: `${newer.reportedPeriod ?? `Quarter ended ${newer.reportedPeriodEnd ?? "after the statements"}`} (unaudited, from the results release)`,
      value: `revenue ${money(newer.revenue, newer.currency)}; diluted EPS ${money(newer.epsDiluted, newer.currency, true)}`,
      note: `${newer.source.form} ${newer.source.accession} filed ${newer.source.filingDate}; not in the statements, TTM or valuation, which end ${newer.statementsEnd}`,
    });
  }
  const capitalReturn = report.filingDisclosures?.capitalReturn ?? null;
  if (capitalReturn?.dividendPerShare != null && price !== null && price > 0) {
    rows.push({
      label: "Dividend yield",
      value: formatPct(((capitalReturn.dividendPerShare * 4) / price) * 100, 2),
      note: `${money(capitalReturn.dividendPerShare, report.filingDisclosures?.currency ?? priceCurrency, true)} quarterly, annualized`,
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
  // AMZN audit 2026-10-20: a P/E carried by non-operating gains says so.
  // Audit 2026-10-22 B-20: a P/E that is market cap over common income, not
  // price over diluted EPS (the reading a reader assumes), says so.
  if (pe) {
    const notes = [/^marketCap \/ common income \(/.test(pe.basis ?? "") ? "market cap / common income, not price / diluted EPS" : null,
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
  // Audit 2026-10-22 B-7: an EBITDA on a composed, lower-bound D&A says so.
  // Audit 2026-10-22 B-9: an annual-basis name already carries its year.
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
    const ofFloat = float !== null && float > 0 ? `${formatPct((si.shares / float) * 100, 2)} of float` : null;
    rows.push({
      label: "Short interest",
      value: `${formatLargeNumber(si.shares)} shares${ofFloat ? ` (${ofFloat})` : ""}`,
      note: [`settled ${si.settlementDate}`, si.daysToCover !== null ? `${formatNumber(si.daysToCover, 1)} days to cover` : null].filter(Boolean).join("; "),
    });
  }

  if (dcf) {
    rows.push({
      label: report.fairValue?.method === "excess-return" ? "Model fair value (excess return)" : "Model fair value (DCF)",
      value: formatFinancialAmount(dcf.value, dcf.unit, dcf.currency),
      note: [
        report.valuation.dcf.upsidePct === null ? null : `${formatPct(report.valuation.dcf.upsidePct, 1, true)} vs price`,
        // Audit 2026-10-22 B-30: the general-route DCF's base rate across the census.
        report.fairValue?.method === "fcff-dcf" ? dcfBaseRateText() : null,
        // Audit 2026-10-22 C-10: the excess-return value from the fiscal-year start, when it differs by more than 5pp.
        report.fairValue?.alternative ? `${report.fairValue.alternative.label}: ${formatFinancialAmount(report.fairValue.alternative.perShare, dcf.unit, dcf.currency)}` : null,
        // Audit 2026-10-22 F-13: the inputs an outage or refusal substituted.
        fairValueDegradedText(report.fairValue),
      ].filter((part): part is string => part !== null).join("; ") || undefined,
    });
  } else if (report.fairValue?.status === "outside-domain") {
    // Audit 2026-10-22 B-29: the headline says why no DCF value is shown.
    rows.push({
      label: report.fairValue?.method === "excess-return" ? "Model fair value (excess return)" : "Model fair value (DCF)",
      value: "Model outside its domain",
      note: report.fairValue.basis[0]?.replace(/^Model outside its domain: /, "").replace(/\.$/, ""),
    });
  }
  const bear = report.valuation.scenarios.find((s) => s.name === "bear")?.priceTarget ?? null;
  const bull = report.valuation.scenarios.find((s) => s.name === "bull")?.priceTarget ?? null;
  if (bear && bull) {
    rows.push({ label: "Scenario range (bear – bull, model)", value: `${formatFinancialAmount(bear.value, bear.unit, bear.currency)} – ${formatFinancialAmount(bull.value, bull.unit, bull.currency)}` });
  }
  const scores = report.scores;
  if (scores && scores.composite.score !== null) {
    // F-19: the aspects' evidence floor and the neutral qualifier, with the
    // evidence share and the band thresholds beside the figure.
    rows.push({ label: "Composite grade", value: compositeText(scores), note: compositeNote(scores) });
  }
  return rows;
}

/**
 * The "Consensus and market" tables (D-62): FY+1/FY+2 consensus with ranges
 * and the forward P/E at the quote, then price targets, grade counts, short
 * interest and the provider's period-end enterprise value. Empty when the
 * report carries no provider market data.
 */
export function consensusTables(report: Report): BodyTable[] {
  const md = withHistoricalEnterpriseValueSafety(report).marketData;
  if (!md) return [];
  const tables: BodyTable[] = [];
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
      note: `Provider consensus${md.estimatesAsOf ? ` as of ${md.estimatesAsOf}` : ""}; fiscal years after the latest reported year.${md.estimateCurrencyBasis ? ` Currency ${md.estimateCurrencyBasis}.` : ""} EPS accounting basis unverified; do not compare with GAAP TTM EPS/P/E, adjusted guidance or model operating EPS without source evidence of a common basis. Consensus is other analysts' forecast, not this report's.`,
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
      float !== null && float > 0 ? `${formatPct((si.shares / float) * 100, 2)} of float` : null,
      si.daysToCover !== null ? `${formatNumber(si.daysToCover, 1)} days to cover` : null,
      si.changePct !== null ? `${formatPct(si.changePct, 1, true)} vs prior settlement` : null,
    ].filter(Boolean).join("; ")]);
  }
  const oneClassOnly = report.valuation?.marketValueScope?.status === "unresolved" && report.valuation.marketValueScope.classAmbiguity === true ? "; may cover one share class only" : "";
  if (md.quote?.marketCap != null) rows.push([md.quote.marketCapOrigin === "computed" ? `Market cap (derived: quote × filed shares${oneClassOnly})` : `Market cap (quote${oneClassOnly})`, `${money(md.quote.marketCap, md.currency)}${md.quote.asOf ? ` as of ${md.quote.asOf}` : ""}`]);
  if (md.shares?.outstanding != null) rows.push(["Shares outstanding", `${formatLargeNumber(md.shares.outstanding)}${md.shares.float !== null ? `; float estimate ${formatLargeNumber(md.shares.float)}${md.shares.floatAsOf === undefined ? "" : md.shares.floatAsOf === null ? " (measurement date unestablished)" : ` measured ${md.shares.floatAsOf}`}` : ""}`]);
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
 * Prose claims the coverage counts contradicted plus cited figures the
 * verification log marks contradicted: the two records the audit export
 * prints (AMZN audit 2026-10-20 finding 12: the export marked a cited salary
 * figure contradicted while the header, counting prose claims only, said 0).
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
  // Audit 2026-10-22 B-10: validation first; citation and tracing are provenance.
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
  return rows;
}

/**
 * One-line header form of {@link trustRows}: what was checked against a cited
 * figure. Audit 2026-10-22 B-10: the line leads with the numeric validation
 * fraction; tracing and citation are provenance, on {@link provenanceHeadline}.
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

/** The header's provenance line: figures traced and claims cited, which are not validation (B-10). */
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
export function metricRowsWithoutTabled<T extends { label: string; values: readonly { value: TracedNumber }[] }>(
  report: Pick<Report, "filingDisclosures">,
  rows: readonly T[],
): { kept: T[]; homes: string[] } {
  const homes: string[] = [];
  const kept = rows.flatMap((row) => {
    const values = row.values.filter((v) => {
      const home = filingTableHome(report, v.value.source);
      if (home !== null && !homes.includes(home)) homes.push(home);
      return home === null;
    });
    return values.length === 0 ? [] : [{ ...row, values }];
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
    .replace(/(?<![\w.])(\d+\.\d+)( on the 0[–-]100 scale)/g, (_m, value: string, tail: string) => `${roundedText(Number(value), 0)}${tail}`)
    // A whole compact amount in stored text ("the guided run-rate $432.00B"), as the formatter prints it.
    .replace(/(\$|\bUSD )(\d+)\.00([KMBT])\b/g, "$1$2$3");
  return out.replace(
    /(?<![\w.:/-])(-?)(\d+)\.(\d+)(?!\.?\d)(\s?(?:x|×)(?![A-Za-z0-9])|%| percentage points?\b| pp\b| (?:trillion|billion|million|thousand)\b| per share\b)?/g,
    (match, sign: string, whole: string, fraction: string, unit: string | undefined, offset: number, whole_text: string) => {
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
export function displayProse(text: string, source?: string): string {
  return readerPrecision(humanizeInlineCitations(text), source);
}

/**
 * Add the table's typed measure only beside compatible, uniquely cited scalar
 * ratio wording. No claim is rewritten or validated. Missing/ambiguous context
 * stays raw and retains the report's existing verification disclosures.
 */
export function displayClaimText(claim: SourcedClaim, numbers: readonly TracedNumber[] = []): string {
  const text = displayProse(claim.text, claim.source);
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
  const execution = modelPasses(m.execution);
  if (execution.length === 0) return m.model;
  const stepName = (step: string) => (step === "synthesize" ? "judge" : step);
  const byModel = new Map<string, string[]>();
  for (const entry of execution) {
    const key = `${entry.effectiveModel}${entry.effectiveEffort ? ` (${entry.effectiveEffort} effort)` : ""}`;
    byModel.set(key, [...(byModel.get(key) ?? []), stepName(entry.step)]);
  }
  const list = (items: string[]) => items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
  const parts = [...byModel.entries()].map(([model, steps]) => `${list(steps)} on ${model}`);
  const adjusted = execution.filter((entry) => entry.adjustments.length > 0).map((entry) => `${stepName(entry.step)}: ${entry.adjustments.join(", ")}`);
  if (adjusted.length > 0) parts.push(`adjusted — ${adjusted.join("; ")}`);
  if (m.judgeProtocol?.sharedModelFamily.shared) parts.push("the judge shares the analysts' model family");
  return parts.join("; ");
}

/**
 * Which model passes used only the supplied evidence, from the execution
 * entries whose per-pass note the audit export prints (AMZN audit 2026-10-20
 * finding 17: the report itself never said the analysis had no web search).
 * Null when no pass ran on a plan allowance.
 */
export function evidenceScopeSummary(report: Pick<Report, "meta">): string | null {
  const stepName = (step: string) => (step === "synthesize" ? "judge" : step);
  // Codex review of PR #41: failed and never-sent attempts are listed in a
  // data-only report's run details, but they used no evidence at all.
  const steps = modelPasses(report.meta.execution)
    .filter((entry) => executionCompleted(entry) && subscriptionExecution(entry) !== null)
    .map((entry) => stepName(entry.step));
  if (steps.length === 0) return null;
  const list = steps.length <= 1 ? steps.join("") : `${steps.slice(0, -1).join(", ")} and ${steps[steps.length - 1]}`;
  return `${list} used only the supplied evidence (payload-only; no web search)`;
}

function total(values: readonly (number | undefined)[]): number | null {
  const present = values.filter((value): value is number => typeof value === "number");
  return present.length === 0 ? null : present.reduce((sum, value) => sum + value, 0);
}

/**
 * Tokens for plan-allowance runs, dollars for API runs (audit P3: "Cost
 * $0.000000" on a ChatGPT-plan run read as a free run).
 */
export function usageSummary(report: Pick<Report, "meta" | "appendix">): string {
  const execution = modelPasses(report.meta.execution);
  const input = total(execution.map((entry) => entry.inputTokens));
  const output = total(execution.map((entry) => entry.outputTokens));
  const tokens = input === null && output === null ? null
    : `${input === null ? "unknown" : formatNumber(input, 0)} input / ${output === null ? "unknown" : formatNumber(output, 0)} output tokens`;
  const unreported = execution.filter(entry => entry.inputTokens === undefined || entry.outputTokens === undefined).map(entry => entry.step === "synthesize" ? "judge" : entry.step);
  const usageLimit = unreported.length ? `; usage incomplete for ${unreported.join(", ")}` : "";
  const plan = execution.length > 0 && execution.every((entry) => parseSubscriptionModel(entry.effectiveModel) ?? parseSubscriptionModel(entry.requestedModel));
  // The same figure the audit ledger totals: the sum of the displayed rows.
  const cost = roundedDisplayedCostTotal(report.appendix.costBreakdown.map((entry) => entry.costUsd));
  if (plan) {
    const provider = execution.some((entry) => /^gemini\//.test(entry.effectiveModel)) ? "Gemini CLI" : "ChatGPT plan";
    return `${tokens ?? "token usage not reported"} on the ${provider} allowance (no API charge recorded)${usageLimit}`;
  }
  const dollars = `${formatCostUsd(cost)} recorded API cost`;
  return `${tokens ? `${dollars}; ${tokens}` : dollars}${usageLimit}`;
}

/**
 * The data-state sentence (audit P3: "Completeness confirmed: state
 * degraded" read as a contradiction). "Confirmed" described the metadata,
 * not the data; the sentence now leads with the data state.
 */
export function dataStateText(c: ReportCompletenessPresentation): string {
  if (c.metadataStatus !== "confirmed") return c.statusText;
  // The persisted state was set when every critical entry, process ones
  // included, counted toward "blocked". When the only critical entries are
  // analysis-process disclosures, "Blocked: 0 critical data issues" reads as a
  // contradiction: the data state follows the data counts, and the sentence
  // says that it is the analysis that is blocked.
  const processBlocked = c.state === "blocked" && c.dataCriticalCount === 0 && c.processDisclosureCount > 0;
  const shown = processBlocked ? (c.dataWarningCount > 0 ? "degraded" : "complete") : c.state;
  const state = shown === "complete" ? "Complete" : shown === "degraded" ? "Degraded" : shown === "blocked" ? "Blocked" : "Unknown";
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  // D-67: one count per underlying data gap; how the passes ran is counted apart.
  const blocks = processBlocked ? (c.processDisclosureCount === 1 ? ", which blocks the analysis" : ", which block the analysis") : "";
  const process = c.processDisclosureCount > 0 ? `; ${count(c.processDisclosureCount, "analysis-process disclosure", "analysis-process disclosures")} (not data gaps)${blocks}` : "";
  return `${c.dataOnly ? "Data-only · " : ""}${state}: ${count(c.dataCriticalCount, "critical data issue", "critical data issues")}, ${count(c.dataWarningCount, "data issue", "data issues")}${process}; EDGAR ${c.edgar}; XBRL ${c.xbrl}; forensics ${c.forensicValidation}.`;
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
  for (const [pattern, label] of PROCESS_LABEL) {
    const match = pattern.exec(field);
    if (match) return label(match);
  }
  const withheld = /^keyless\.([A-Za-z]+)\.backfill\.withheld\.([A-Za-z]+)$/.exec(field);
  if (withheld) return `${sentence(segmentWords(withheld[2]!))} withheld from the ${STATEMENT_LABEL[withheld[1]!] ?? segmentWords(withheld[1]!).join(" ")} backfill`;
  const fmp = /^fmp\.([A-Za-z]+)\(/.exec(field);
  if (fmp) return `${sentence(segmentWords(fmp[1]!))} (FMP)`;
  if (field === "analysis.llm") return "Analysis not completed";
  return sentence(segmentWords(field.replace(/\([^)]*\)/g, "").replace(/[.:]/g, " ")));
}

/** A long manifest reason cut at a sentence or clause near 320 characters; the audit export keeps it whole. */
function shortReason(reason: string): string {
  const limit = 320;
  if (reason.length <= limit) return reason;
  const cut = reason.slice(0, limit);
  const stop = Math.max(cut.lastIndexOf("; "), cut.lastIndexOf(". "));
  return `${(stop > 120 ? cut.slice(0, stop) : cut).trimEnd()} … (full text in the audit export)`;
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
      rows: data.map((gap) => [gapLabel(gap), gap.severity, `${shortReason(gap.reason)}${gap.fields.length > 1 ? ` (${gap.fields.length} manifest entries)` : ""}`]),
    });
  }
  if (k.processDisclosures.length > 0) {
    tables.push({
      heading: "Analysis-process disclosures",
      headers: ["Disclosure", "Detail"],
      rows: k.processDisclosures.map((gap) => [gapLabel(gap), shortReason(gap.reason)]),
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
export function methodologyNotes(report: Pick<Report, "scores" | "projections" | "valuation" | "meta"> & Partial<Pick<Report, "appendix">>): string[] {
  const notes = [
    "Grades and the composite score are deterministic house rules (bands, weights and signal transforms published in docs/METHODOLOGY.md). They have not been backtested against outcomes; a grade is a summary of the evidence shown, not a forecast.",
    "Intrinsic value, scenario values and projections are model ESTIMATEs computed from the disclosed inputs. They are not analyst price targets, guidance or predictions; the scenario display weights are a fixed prior, not probabilities.",
    "FACT, ESTIMATE and JUDGMENT labels mark what a statement is. A citation shows where a figure came from; it is a provenance check, not proof that a sentence's interpretation is correct.",
    "Forensic screens (Altman, Beneish, Piotroski, accruals) flag items to investigate. A flag is not a finding of misstatement, and a clean screen is not an audit.",
    "Peer, own-history and consensus comparisons are shown only where enough comparable observations exist; a dash means the comparison was withheld, not that it is neutral.",
    "Figures are rounded for display; calculations use full precision. The audit export carries every raw value, registry id, check and data gap.",
  ];
  if (report.meta.judgeProtocol?.sharedModelFamily.shared) {
    notes.push("The judge pass ran on the same model family that wrote the bull and bear cases, so the adjudication is not an independent second opinion.");
  }
  for (const gap of report.appendix?.missingData ?? []) if (gap.field === PRINCIPAL_CORRECTION_FIELD) notes.push(gap.reason);
  return notes;
}

/** Where the separate audit export lives for a persisted report. */
export function auditExportPath(report: Pick<Report, "meta">, context: ReportPresentationContext = {}): string | null {
  const id = presentationReportId(report,context);
  return typeof id === "number" && Number.isSafeInteger(id) ? `/api/export/${id}?format=audit` : null;
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
 * One row per aspect: score, band, weight and evidence, with what it
 * measures (D-62: replaces the separate weights and aspect-score tables).
 */
export function scorecardTable(scores: NonNullable<Report["scores"]>): BodyTable {
  const limited = SCORE_ASPECT_ORDER.filter((key) => hasLimitedEvidence(scores.aspects[key]));
  return {
    heading: "Scorecard",
    headers: ["Aspect", "Score", "Band", "Weight", "Evidence", "What it measures"],
    rows: SCORE_ASPECT_ORDER.map((key) => {
      const aspect = scores.aspects[key];
      const weight = scores.composite.weights[key];
      return [
        SCORE_ASPECT_LABEL[key],
        aspect.score === null ? "—" : formatScore(aspect.score),
        // D-67: the letter is withheld under the evidence floor on every surface.
        hasLimitedEvidence(aspect) ? "limited evidence" : aspect.band === null ? "—" : withNeutral(aspect.band, aspect.score),
        `${formatNumber(weight, Number.isInteger(weight) ? 0 : 1)}%`,
        evidencePercentText(aspect.dataCompleteness),
        aspect.notApplicableReason ?? aspect.note,
      ];
    }),
    ...(limited.length === 0 ? {} : {
      note: `${limited.map((key) => {
        const signals = scores.aspects[key].signals ?? [];
        const effective = signals.length > 0
          ? signals.reduce((sum, s) => sum + s.effectiveCompositeWeightPct, 0)
          : scores.composite.weights[key] * scores.aspects[key].dataCompleteness;
        const weight = scores.composite.weights[key];
        const why = scores.aspects[key].dataCompleteness < MIN_HEADLINE_EVIDENCE
          ? `below the ${Math.round(MIN_HEADLINE_EVIDENCE * 100)}% floor for a letter`
          : "all from one signal, and a letter needs a second";
        return `${SCORE_ASPECT_LABEL[key]} has evidence for ${evidencePercentText(scores.aspects[key].dataCompleteness)} of its signal weight, ${why}, so no surface shows one; it enters the composite at ${formatPct(effective, 1)} rather than its ${formatNumber(weight, Number.isInteger(weight) ? 0 : 1)}% route weight.`;
      }).join(" ")}`,
    }),
  };
}

/** The business-quality / price-attractiveness split beside the composite, when recorded. */
export function assessmentLine(scores: NonNullable<Report["scores"]>): string | null {
  const a = scores.assessments;
  if (!a) return null;
  return [
    `Business quality ${a.businessQuality.score === null ? "—" : formatScore(a.businessQuality.score)} (${a.businessQuality.band === null ? "—" : withNeutral(a.businessQuality.band, a.businessQuality.score)})`,
    // D-67: the valuation letter is withheld under the evidence floor here too.
    `price attractiveness ${a.valuation.score === null ? "—" : formatScore(a.valuation.score)} (${hasLimitedEvidence(scores.aspects.valuation) ? "limited evidence" : a.valuation.band === null ? "—" : withNeutral(a.valuation.band, a.valuation.score)})`,
    `evidence available for ${evidencePercentText(a.evidenceCompleteness)} of the signal weight`,
  ].join(" · ");
}

/** A pass in one line: model, effort, tokens and any adjustment (the full record is in the audit export). */
export function passLine(entry: NonNullable<Report["meta"]["execution"]>[number]): string {
  const step = entry.step === "synthesize" ? "judge" : entry.step;
  const effort = entry.effectiveEffort ? `, ${entry.effectiveEffort} effort` : "";
  const tokens = entry.inputTokens === undefined && entry.outputTokens === undefined ? ""
    : `; ${entry.inputTokens === undefined ? "unknown" : formatNumber(entry.inputTokens, 0)} input / ${entry.outputTokens === undefined ? "unknown" : formatNumber(entry.outputTokens, 0)} output tokens`;
  const requested = entry.requestedModel !== entry.effectiveModel ? ` (requested ${entry.requestedModel})` : "";
  const adjusted = entry.adjustments.length > 0 ? `; ${entry.adjustments.join(", ")}` : "";
  return `${step}: ${entry.effectiveModel}${requested}${effort}${tokens}${adjusted}`;
}

/** Score drivers with reader labels, values in their own units and the points each adds. */
export function scoreDriverTable(scores: NonNullable<Report["scores"]>): BodyTable | null {
  const historyLabel = (signal: NonNullable<NonNullable<Report["scores"]>["aspects"]["valuation"]["signals"]>[number]): string => {
    // Audit PGR-4: a P/TBV rank that fell back to P/B is named for what it ranks.
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
    signal.fallbackReason ?? "—",
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
