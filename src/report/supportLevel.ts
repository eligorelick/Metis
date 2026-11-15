/**
 * D-300 (P12, P19, P22; release items R40 and R41): the report's support level
 * and its share of confirmed statements, stated once near the top of every
 * reader surface and defined here once for the README.
 *
 * Code decides both lines from typed evidence the report already carries: the
 * fair-value status and its typed valuation-use reason, the route recorded on
 * the route metrics, the P12 grade qualifications written by
 * `financialEvidenceQualifications` (`src/report/assessment.ts`), the typed
 * statement-evidence entries (`statementEvidenceEntries`) and the
 * verification marks. No model text and no reason wording is read to decide
 * anything: each limitation is chosen by a typed code, field or status, and
 * its plain words are written here. Read time only; stored reports keep their
 * bytes (P21).
 */
import type { Report, SourcedClaim } from "@/report/schema";
import type { ManifestEntry } from "@/types/core";
import { claimStatusMark } from "@/report/verificationMarks";

export type SupportLevelKey = "full" | "limited";

/** The two levels, in the words every surface and the README use (R41). */
export const SUPPORT_LEVELS: Readonly<Record<SupportLevelKey, { label: string; definition: string }>> = {
  full: {
    label: "Full support",
    definition: "The company is on a route the methods support, and no headline figure rests on vendor data not checked against a filing, is withheld for a missing filing or input, or is limited by the route.",
  },
  limited: {
    label: "Limited support",
    definition: "At least one of those conditions does not hold. The report lists, in plain words, what was not checked against filings or is not covered.",
  },
};

/** What the confirmed share counts, said once wherever it is shown. */
export const CONFIRMED_SHARE_DEFINITION =
  "A statement counts as confirmed only when code matched it against the record it cites (its [validated] mark). " +
  "Citation coverage shows where statements point, not that they are correct, and is not counted.";

/** The data-only line: no model wrote any statement in the report. */
export const DATA_ONLY_STATEMENTS_TEXT = "No AI-written statements (data-only report).";

export const SUPPORT_BLOCK_HEADING = "Support for this report";

export type SupportLimitationCode =
  | "financial-route" | "route-no-per-share-value" | "fair-value-withheld" | "fair-value-dated"
  | "headline-input-withheld" | "operating-scope-unverified" | "cash-only-liquidity"
  | "foreign-interim-vendor" | "ads-eps-derived" | "predecessor-history" | "filing-not-retrieved";

export interface SupportLimitation { code: SupportLimitationCode; text: string }

export interface SupportLevel { level: SupportLevelKey; label: string; limitations: readonly SupportLimitation[] }

const FINANCIAL_ROUTE_NAME: Readonly<Record<string, string>> = {
  bank: "bank", insurer: "insurer", "reit-mortgage": "mortgage REIT",
};

/** Plain names for the headline inputs a P12 qualification can name (typed manifest fields). */
const HEADLINE_INPUT_LABEL: ReadonlyArray<readonly [RegExp, string]> = [
  [/^returns\.wacc\.weights$/, "the discount-rate (WACC) capital weights"],
  [/^returns\.wacc\.interestExpense$/, "the interest expense the discount rate needs"],
  [/^returns\.wacc/, "a discount-rate (WACC) input"],
  [/^valuation\.dcf\.salesToCapital$/, "the sales-to-capital input of the cash-flow valuation"],
  [/^valuation\.dcf/, "the cash-flow valuation"],
  [/^valuation\.excessReturn\.preferredCapital$/, "the preferred capital the excess-return valuation deducts"],
  [/^valuation\.excessReturn/, "an excess-return valuation input"],
  [/^valuation\./, "a valuation input"],
  [/^returns\./, "a return-on-capital input"],
  [/^capital\./, "a capital-structure input"],
  [/^statements\./, "a financial-statement line"],
];

function headlineInputLabel(field: string): string {
  return HEADLINE_INPUT_LABEL.find(([pattern]) => pattern.test(field))?.[1] ?? "a headline input";
}

/** Plain names for the filing documents an `edgar.*` critical gap names. */
const FILING_LABEL: ReadonlyArray<readonly [RegExp, string]> = [
  [/^edgar\.latestTenK\b/, "the latest annual report (10-K)"],
  [/^edgar\.mdna\b/, "management's discussion and analysis (MD&A)"],
  [/^edgar\.item1a\b/, "the risk factors (Item 1A)"],
  [/^edgar\.business\b/, "the business description (Item 1)"],
];

function filingLabel(field: string): string {
  return FILING_LABEL.find(([pattern]) => pattern.test(field))?.[1] ?? "a filing section";
}

/**
 * The support level of one report. A limitation is chosen only by a typed
 * code, field or status; its text is fixed here. Older reports that lack a
 * typed field simply contribute no limitation from it.
 */
export function supportLevel(report: Pick<Report, "appendix"> & Partial<Pick<Report, "fairValue" | "routeMetrics" | "scores">>): SupportLevel {
  const out: SupportLimitation[] = [];
  const add = (code: SupportLimitationCode, text: string) => { if (!out.some(item => item.text === text)) out.push({ code, text }); };
  const fv = report.fairValue;
  // Route: the financial-company routes value on book value and excess returns (P14).
  const route = report.routeMetrics?.route;
  if (fv?.method === "excess-return" || (route !== undefined && FINANCIAL_ROUTE_NAME[route] !== undefined)) {
    add("financial-route", `${FINANCIAL_ROUTE_NAME[route ?? ""] ?? "financial-company"} route: valued on book value and excess returns on equity; cash-flow and invested-capital measures (free-cash-flow valuation, ROIC) do not apply`);
  }
  if (fv !== undefined) {
    const use = fv.currentUse;
    if (use?.reason === "route-policy") add("route-no-per-share-value", "no per-share fair value: this company's route does not apply the cash-flow valuation model");
    else if (fv.status === "dated-reference" || use?.status === "dated-reference") add("fair-value-dated", `the fair value is a dated reference${use?.valueDate ? ` (valued at ${use.valueDate})` : ""}, not updated to the current price`);
    else if (fv.status === "suppressed" || fv.status === "outside-domain") add("fair-value-withheld", "the per-share fair value is withheld because an input could not be established");
  }
  // P12: the qualifications the grades already carry (assessment.ts financialEvidenceQualifications).
  for (const reason of report.scores?.qualification?.composite.reasons ?? []) {
    // The withheld fair value is already listed; a generic valuation field would only repeat it.
    if (reason.code === "financial-evidence-blocked" && reason.field && !(reason.field === "valuation.dcf" && out.some(item => item.code === "fair-value-withheld"))) {
      add("headline-input-withheld", `${headlineInputLabel(reason.field)} could not be established from the filings, so figures built on it are withheld`);
    }
    else if (reason.code === "selected-operating-scope-unverified") add("operating-scope-unverified", "the operating income used in the discount rate has unverified consolidated scope");
    else if (reason.code === "cash-only-liquidity") add("cash-only-liquidity", "liquidity is measured on cash only; short-term investments are not established");
  }
  const gaps: readonly ManifestEntry[] = report.appendix.missingData;
  // statementEvidenceEntries (assessment.ts) writes these two typed fields.
  if (gaps.some(gap => gap.field === "statements.foreignInterim")) add("foreign-interim-vendor", "interim figures from Form 6-K are vendor data not checked against a filing");
  if (gaps.some(gap => gap.field === "statements.adsEps")) add("ads-eps-derived", "earnings per ADS are derived from ordinary-share EPS, not a filed per-ADS amount");
  if (gaps.some(gap => gap.field === "edgar.predecessor")) add("predecessor-history", "successor issuer: history before the reorganization comes from the predecessor's filings or is not included");
  const filings = [...new Set(gaps.filter(gap => gap.severity === "critical" && gap.expected !== true && gap.field.startsWith("edgar.")).map(gap => filingLabel(gap.field)))];
  if (filings.length > 0) add("filing-not-retrieved", `not retrieved from the filings: ${filings.length === 1 ? filings[0] : `${filings.slice(0, -1).join(", ")} and ${filings.at(-1)}`}; statements that need ${filings.length === 1 ? "it" : "them"} are not covered`);
  const level: SupportLevelKey = out.length === 0 ? "full" : "limited";
  return { level, label: SUPPORT_LEVELS[level].label, limitations: out };
}

/** One line: "Full support." or "Limited support: a; b." */
export function supportLevelText(view: SupportLevel): string {
  return view.limitations.length === 0 ? `${view.label}.` : `${view.label}: ${view.limitations.map(item => item.text).join("; ")}.`;
}

/* ======================================================================== *
 * Share of statements confirmed
 * ======================================================================== */

export interface ConfirmedShare { confirmed: number; total: number }

/** Containers the reader surfaces do not print (they are audit-export material). */
const AUDIT_ONLY_KEYS = new Set(["appendix", "meta", "auditValuation"]);

function isTaggedStatement(node: unknown): node is SourcedClaim {
  const claim = node as Partial<SourcedClaim>;
  return typeof claim.text === "string" && typeof claim.source === "string" && (claim.label === "FACT" || claim.label === "ESTIMATE");
}

/** Same words, tag, citation and date: one statement however often it is repeated. */
function statementKey(claim: SourcedClaim): string {
  return [claim.label, claim.text.trim().replace(/\s+/g, " "), claim.source, claim.sourceId ?? "", claim.asOf ?? ""].join("\u0000");
}

/**
 * The typed numerator and denominator (P19): every FACT or ESTIMATE statement
 * the reader surfaces show, counted once, and those whose own verification
 * mark is "validated". An unmarked statement counts as not confirmed. Call
 * after the report's verification marks are indexed (prepareReportForSurface).
 */
export function confirmedStatementShare(report: Report): ConfirmedShare {
  const seen = new Map<string, boolean>();
  const visit = (node: unknown): void => {
    if (node === null || typeof node !== "object") return;
    if (Array.isArray(node)) { for (const child of node) visit(child); return; }
    if (isTaggedStatement(node)) {
      const key = statementKey(node);
      seen.set(key, seen.get(key) === true || claimStatusMark(node) === "validated");
      return;
    }
    for (const [key, value] of Object.entries(node)) if (!AUDIT_ONLY_KEYS.has(key)) visit(value);
  };
  visit(report);
  return { confirmed: [...seen.values()].filter(Boolean).length, total: seen.size };
}

function shareText(confirmed: number, total: number): string {
  const pct = (confirmed / total) * 100;
  const shown = pct.toFixed(1);
  return confirmed === total ? "100%" : Number(shown) === 100 ? "<100.0%" : confirmed > 0 && Number(shown) === 0 ? ">0.0%" : `${shown}%`;
}

/** "N of M statements were confirmed against their records by code (P%)." */
export function confirmedShareText(report: Report, modelWritten: boolean): string {
  if (!modelWritten) return DATA_ONLY_STATEMENTS_TEXT;
  const { confirmed, total } = confirmedStatementShare(report);
  if (total === 0) return "The AI wrote no FACT or ESTIMATE statements in this report, so none could be confirmed.";
  return `${confirmed} of ${total} statements were confirmed against their records by code (${shareText(confirmed, total)}).`;
}

/** The block every surface prints near the top: heading, two labelled lines and the definition note. */
export interface SupportBlock { heading: string; rows: ReadonlyArray<readonly [string, string]>; note: string }

export function supportBlock(report: Report, modelWritten: boolean): SupportBlock {
  return {
    heading: SUPPORT_BLOCK_HEADING,
    rows: [["Support level", supportLevelText(supportLevel(report))], ["Statements confirmed", confirmedShareText(report, modelWritten)]],
    note: `${SUPPORT_LEVELS.full.label}: ${SUPPORT_LEVELS.full.definition} ${SUPPORT_LEVELS.limited.label}: ${SUPPORT_LEVELS.limited.definition}${modelWritten ? ` ${CONFIRMED_SHARE_DEFINITION}` : ""}`,
  };
}
