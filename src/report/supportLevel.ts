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
import { TAX_OPERAND_EVIDENCE_SINCE_SPEC, specVersionBefore } from "@/report/versions";
import { DCF_TAX_OPERANDS_FIELD, evidencePercentText } from "@/report/assessment";
import { claimEchoKey } from "@/report/presentation";

export { DCF_TAX_OPERANDS_FIELD };

export type SupportLevelKey = "full" | "limited";

/** The two levels, in the words every surface and the README use (R41). */
export const SUPPORT_LEVELS: Readonly<Record<SupportLevelKey, { label: string; definition: string }>> = {
  full: {
    label: "Full support",
    definition: "The company is on a route the methods support, every grade rests on complete recorded evidence, and no headline figure or valuation input rests on vendor data not checked against a filing, is withheld for a missing filing or input, or is limited by the route.",
  },
  limited: {
    label: "Limited support",
    definition: "At least one of those conditions does not hold, or the report does not record the evidence to show it. The report lists, in plain words, what was not checked against filings or is not covered.",
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
  | "foreign-interim-vendor" | "ads-eps-derived" | "predecessor-history" | "filing-not-retrieved"
  | "tax-operands-vendor" | "tax-evidence-not-recorded" | "grade-evidence-missing" | "grade-evidence-limited"
  | "grade-evidence-partial" | "fcf-after-sbc-withheld"
  | "current-valuation-unavailable" | "grade-qualification-not-recorded";

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

/** Lower-case grade names for the grade-evidence limitations (typed `reason.aspect`). */
const GRADE_NAME: Readonly<Record<string, string>> = {
  fundamentals: "fundamentals", valuation: "valuation", quality: "quality", balanceSheet: "balance-sheet",
  moat: "moat", leadership: "leadership", technicals: "technicals",
};

function gradeList(aspects: readonly string[]): string {
  const names = aspects.map(aspect => GRADE_NAME[aspect] ?? "one");
  return names.length === 1 ? `${names[0]} grade` : `${names.slice(0, -1).join(", ")} and ${names.at(-1)} grades`;
}

/** "a", "a and b", "a, b and c". */
function listText(items: readonly string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** Scored, weighted grades with a recorded route-applicable share below 100% (D-309), in grade order. */
function partialGrades(scores: Report["scores"] | undefined, named: readonly string[]): Array<{ aspect: string; share: number }> {
  if (!scores?.aspects) return [];
  return Object.keys(GRADE_NAME).flatMap(aspect => {
    const score = scores.aspects[aspect as keyof typeof scores.aspects];
    const share = score?.applicableCompleteness;
    if (!score || score.score === null || score.band === null || (scores.composite?.weights?.[aspect as keyof typeof scores.aspects] ?? 0) <= 0 ||
      typeof share !== "number" || !Number.isFinite(share) || share >= 1 || named.includes(aspect)) return [];
    return [{ aspect, share }];
  });
}

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
export function supportLevel(report: Pick<Report, "appendix"> & Partial<Pick<Report, "fairValue" | "routeMetrics" | "scores" | "meta">>): SupportLevel {
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
    // Review round 1: a domain failure (non-positive equity value, negative explicit-period value) is a model limit, not missing evidence.
    else if (fv.status === "outside-domain") add("fair-value-withheld", "the per-share fair value is withheld because the cash-flow model's result falls outside the range it is valid for");
    else if (fv.status === "suppressed") add("fair-value-withheld", "the per-share fair value is withheld because an input could not be established");
  }
  // P12: the qualifications the grades already carry (assessment.ts withAssessmentQualification).
  // Review round 1 (D-300): every reason code limits support; a grade with no recorded
  // qualification is not shown to be supported, so it cannot establish full support (P19).
  const qualification = report.scores === undefined ? undefined : report.scores.qualification;
  if (report.scores !== undefined && (qualification === undefined || qualification.composite.status === "unknown")) {
    add("grade-qualification-not-recorded", "this report does not record the evidence behind its grades");
  }
  const missingGrades: string[] = [], limitedGrades: string[] = [];
  for (const reason of qualification?.composite.reasons ?? []) {
    // The withheld fair value is already listed; a generic valuation field would only repeat it.
    if (reason.code === "financial-evidence-blocked") {
      if (reason.field && !(reason.field === "valuation.dcf" && out.some(item => item.code === "fair-value-withheld"))) {
        add("headline-input-withheld", `${headlineInputLabel(reason.field)} could not be established from the filings, so figures built on it are withheld`);
      }
    }
    else if (reason.code === "selected-operating-scope-unverified") add("operating-scope-unverified", "the operating income used in the discount rate has unverified consolidated scope");
    else if (reason.code === "cash-only-liquidity") add("cash-only-liquidity", "liquidity is measured on cash only; short-term investments are not established");
    else if (reason.code === "missing-applicable-aspect") { if (reason.aspect && !missingGrades.includes(reason.aspect)) missingGrades.push(reason.aspect); }
    else if (reason.code === "limited-applicable-evidence") { if (reason.aspect && !limitedGrades.includes(reason.aspect)) limitedGrades.push(reason.aspect); }
    else if (reason.code === "current-valuation-unavailable") {
      if (!out.some(item => item.code === "fair-value-withheld" || item.code === "fair-value-dated" || item.code === "route-no-per-share-value")) {
        add("current-valuation-unavailable", "the valuation is not established as current at the quote date");
      }
    }
    else add("grade-qualification-not-recorded", "this report does not record the evidence behind its grades");
  }
  if (missingGrades.length > 0) add("grade-evidence-missing", `the ${gradeList(missingGrades)} ${missingGrades.length === 1 ? "has" : "have"} no evidence that applies on this company's route`);
  if (limitedGrades.length > 0) add("grade-evidence-limited", `the ${gradeList(limitedGrades)} ${limitedGrades.length === 1 ? "rests" : "rest"} on limited evidence`);
  // D-309 (P12, P19; revises D-300): "every grade rests on complete recorded evidence" holds only at 100%. A scored
  // grade below all of the evidence that applies on its route (`applicableCompleteness`; signals and aspects the
  // route does not apply are outside that denominator, P14) limits support, named with its share. No grade, score or
  // letter floor changes. A saved aspect without the share already reads as unrecorded (its qualification is unknown).
  const partial = partialGrades(report.scores, [...missingGrades, ...limitedGrades]);
  if (partial.length > 0) {
    add("grade-evidence-partial", `the ${gradeList(partial.map(item => item.aspect))} ${partial.length === 1 ? "rests" : "rest"} on ` +
      `${listText(partial.map(item => evidencePercentText(item.share)))} of the evidence that applies on this company's route`);
  }
  const gaps: readonly ManifestEntry[] = report.appendix.missingData;
  // Review round 1 (D-300): the cash-flow valuation's tax rate is a headline input. Its operands are
  // checked against a filing unless the typed manifest entry says otherwise; a saved report written
  // before that entry existed does not record which, so it is not shown to be checked (P19).
  const dcfHeadline = fv !== undefined && fv.method === "fcff-dcf" && (fv.status === "available" || fv.status === "dated-reference");
  if (gaps.some(gap => gap.field === DCF_TAX_OPERANDS_FIELD)) add("tax-operands-vendor", "the tax rate of the cash-flow valuation uses provider tax and pre-tax income figures not checked against a filing");
  else if (dcfHeadline && specVersionBefore(report.meta?.specVersion, TAX_OPERAND_EVIDENCE_SINCE_SPEC)) {
    add("tax-evidence-not-recorded", "this report does not record whether the tax rate's operands were checked against a filing");
  }
  // statementEvidenceEntries (assessment.ts) writes these two typed fields.
  if (gaps.some(gap => gap.field === "statements.foreignInterim")) add("foreign-interim-vendor", "interim figures from Form 6-K are vendor data not checked against a filing");
  if (gaps.some(gap => gap.field === "statements.adsEps")) add("ads-eps-derived", "earnings per ADS are derived from ordinary-share EPS, not a filed per-ADS amount");
  // D-309: the house free-cash-flow figure is after stock-based compensation; Stage B's typed `capital.fcf.sbc`
  // entry records that it is withheld (the latest fiscal year's compensation is not established).
  if (gaps.some(gap => gap.field === "capital.fcf.sbc" && gap.expected !== true)) {
    add("fcf-after-sbc-withheld", "stock-based compensation is not established for the latest fiscal year, so free cash flow after it is withheld");
  }
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

/** Containers the reader surfaces do not print: audit-export material and the grade strip's reasoning (the strip shows grades and one-line reasons). */
const AUDIT_ONLY_KEYS = new Set(["appendix", "meta", "auditValuation", "gradeStrip"]);

function isTaggedStatement(node: unknown): node is SourcedClaim {
  const claim = node as Partial<SourcedClaim>;
  return typeof claim.text === "string" && typeof claim.source === "string" && (claim.label === "FACT" || claim.label === "ESTIMATE");
}

/**
 * One statement however often it is repeated: the presentation layer's own identity (P22), the one
 * shown-once uses (words, tag, whole citation, resolved date and verification mark). Review round 1:
 * a validated and a contradicted copy of the same words are two statements, counted apart.
 */
const statementKey = claimEchoKey;

/**
 * The typed numerator and denominator (P19): every FACT or ESTIMATE statement
 * the reader surfaces show, counted once, and those whose own verification
 * mark is "validated". An unmarked statement counts as not confirmed. Call
 * after the report's verification marks are indexed (prepareReportForSurface).
 */
export function confirmedStatementShare(report: Report): ConfirmedShare {
  const seen = new Map<string, boolean>();
  const visit = (node: unknown, factsOnly = false): void => {
    if (node === null || typeof node !== "object") return;
    if (Array.isArray(node)) { for (const child of node) visit(child, factsOnly); return; }
    if (isTaggedStatement(node)) {
      // Review round 1: an officer with neither grade shows only FACTs (executiveCardClaims, executiveGroups).
      if (factsOnly && node.label !== "FACT") return;
      const key = statementKey(node);
      seen.set(key, seen.get(key) === true || claimStatusMark(node) === "validated");
      return;
    }
    for (const [key, value] of Object.entries(node)) if (!AUDIT_ONLY_KEYS.has(key)) visit(value, factsOnly);
  };
  const { leadership, ...rest } = report;
  visit(rest);
  const { executives, ...otherLeadership } = leadership;
  visit(otherLeadership);
  for (const e of executives) visit(e, e.grade === "not-assessed" && e.credibilityGrade === "not-assessed");
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
