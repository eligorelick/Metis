/**
 * D-300 (P12, P19, P22): the report's support level
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
import type { Report, TracedNumber } from "@/report/schema";
import type { ManifestEntry } from "@/types/core";
import { claimStatusMark } from "@/report/verificationMarks";
import { TAX_OPERAND_EVIDENCE_SINCE_SPEC, specVersionBefore } from "@/report/versions";
import { DCF_TAX_OPERANDS_FIELD, evidencePercentText } from "@/report/assessment";
import { claimEchoKey, readerStatementInventory } from "@/report/presentation";

export { DCF_TAX_OPERANDS_FIELD };

export type SupportLevelKey = "full" | "limited";

/** The two levels, in the words every surface and the README use (D-300). */
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
  "A statement repeated in another section counts once. Citation coverage shows where statements point, not that they are correct, and is not counted.";

/** The data-only line: no model wrote any statement in the report. */
export const DATA_ONLY_STATEMENTS_TEXT = "No AI-written statements (data-only report).";

export const SUPPORT_BLOCK_HEADING = "Support for this report";

export type SupportLimitationCode =
  | "financial-route" | "route-no-per-share-value" | "fair-value-withheld" | "fair-value-dated"
  | "headline-input-withheld" | "operating-scope-unverified" | "cash-only-liquidity"
  | "foreign-interim-vendor" | "ads-eps-derived" | "predecessor-history" | "filing-not-retrieved"
  | "tax-operands-vendor" | "tax-evidence-not-recorded" | "grade-evidence-missing" | "grade-evidence-limited"
  | "grade-evidence-partial" | "fcf-after-sbc-withheld" | "headline-input-qualified"
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

/**
 * D-309 (P10, P12, P19): the manifest fields of valuation inputs and headline figures. Any such entry
 * that is not an expected omission means a valuation input or headline figure is withheld, unchecked or qualified, so
 * the report is not full support. Scores (`scores.*`) are excluded: grade evidence is judged by its share above.
 */
const HEADLINE_GAP_FIELD = /^(?:valuation|returns\.wacc|capital\.fcf)(?:\.|$)|^capital\.(?:netDebtToEbitda|interestCoverage)$/;

/** One plain sentence per typed field (first match wins); the entry's reason wording is never read (P11). */
const HEADLINE_GAP_TEXT: ReadonlyArray<readonly [RegExp, string]> = [
  [/^valuation\.dcf\.fairValueFinancialAssets$/, "a separate add-back for financial assets is not included in the cash-flow value because their placement on the balance sheet is unresolved"],
  [/^valuation\.analystEstimates\.currency$/, "the currency of the provider's analyst estimates is not stated on the estimates or does not match the model, so the consensus growth case rests on a currency inferred from the filings or is not used"],
  [/^valuation\.currencyTranslation$/, "valuation inputs in the reporting currency are translated at one dated spot exchange rate"],
  [/^valuation\.dcf\.(?:analystGrowth|growthAnchor)$/, "a growth-anchor method of the cash-flow valuation is unavailable, so the anchor uses the methods that could be computed"],
  [/^valuation\.dcf\.marginCeiling$/, "the cash-flow valuation's margin uplift is withheld because a supported gross-profit ceiling is unavailable"],
  [/^valuation\.dcf\.regulatedUtility$/, "the cash-flow model does not capture regulated rate-base funding"],
  [/^valuation\.dcf\.valuationDate$/, "the cash-flow value is not rolled forward to the quote date"],
  [/^valuation\.dcf\.salesToCapital$/, "the sales-to-capital input of the cash-flow valuation is not established"],
  [/^valuation\.dcf$/, "the cash-flow valuation could not be established"],
  [/^valuation\.reverseDcf\.growthBracket$/, "the reverse cash-flow valuation could not solve for an implied growth rate within its search range"],
  [/^valuation\.reverseDcf\.currentUse$/, "the reverse cash-flow valuation is a dated reference, not updated to the current price"],
  [/^valuation\.reverseDcf$/, "the reverse cash-flow valuation is withheld"],
  [/^valuation\.evEbitda$/, "EV/EBITDA is withheld"],
  [/^valuation\.netIncomeDcf$/, "the net-income cash-flow valuation is withheld"],
  [/^valuation\.excessReturn\.openingBook$/, "the opening book value of the excess-return valuation is not established"],
  [/^valuation\.excessReturn/, "an excess-return valuation input is not established"],
  [/^valuation\.multiples\.ownHistory/, "the own-history multiple ranks rest on incomplete history or on partial, excluded or differently based historical windows"],
  [/^valuation\.multiples\.peers\.[^.]+\.comparabilityCaveat$/, "peer multiples are compared without independently sourced evidence that the peers' business models and metric definitions are comparable"],
  [/^valuation\.multiples\.peers$/, "too few comparable peers pass the screen, so peer medians are withheld"],
  [/^valuation\.multiples\.priceToFcf\.cashOwnership$/, "price to free cash flow is withheld because the free cash flow attributable to common holders is unresolved"],
  [/^valuation\.multiples\.priceToFcf\.historicalCashOwnership$/, "some historical price-to-free-cash-flow windows have unresolved attribution to common holders"],
  [/^valuation\.multiples\.enterpriseValue\.leases$/, "lease coverage in the enterprise value is not verified"],
  [/^valuation\.(?:multiples|reit)\.enterpriseValue$/, "the enterprise value is withheld, so the multiples built on it are not shown"],
  [/^valuation\.multiples\.marketCap/, "the market capitalization is withheld, so the multiples built on it are not shown"],
  [/^valuation\.(?:multiples\.)?netDebt$/, "net debt is withheld, so the equity bridge and multiples built on it are not computed"],
  [/^valuation\.multiples\.(?:preferredCapital|priceToBook\.commonEquity)$/, "preferred capital is unresolved, so the book-value multiples on common equity are withheld"],
  [/^valuation\.perShare\.economicClassBasis$/, "the per-share value is withheld because the economic basis of the diluted share count is unresolved"],
  [/^valuation\.perShare\.convertibleShares$/, "the diluted share count may include convertible-note shares the filings do not establish"],
  [/^valuation\.temporaryEquity/, "temporary equity is not established for the latest balance sheet"],
  [/^valuation\.reit\./, "an equity-REIT measure (FFO, AFFO or the implied cap rate) is approximate or unavailable"],
  [/^returns\.wacc\.beta$/, "the discount rate's beta is not established from the issuer's own price history"],
  [/^returns\.wacc\.economicClassBasis$/, "the equity weight of the discount rate rests on an unresolved economic share scope"],
  [/^returns\.wacc\.effectiveTaxRate/, "the discount rate's tax rate is not an observed effective rate"],
  [/^returns\.wacc\.history$/, "the ROIC-versus-WACC history uses the current discount rate for years without their own"],
  [/^capital\.netDebtToEbitda$/, "net debt to EBITDA is withheld"],
  [/^capital\.interestCoverage$/, "interest coverage is withheld"],
  [/^capital\.fcf/, "a free-cash-flow figure is withheld or qualified"],
];

/** A field the route itself makes inapplicable; the route limitation already says so ("limited by the route"). */
const ROUTE_COVERED_GAP = /^valuation(?:\.(?:dcf|reverseDcf|evEbitda|netIncomeDcf|dcf\.regulatedUtility))?$/;

function headlineGapText(field: string): string {
  return HEADLINE_GAP_TEXT.find(([pattern]) => pattern.test(field))?.[1] ?? `${headlineInputLabel(field)} is withheld or qualified`;
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
type SupportReport = Pick<Report, "appendix"> & Partial<Pick<Report, "fairValue" | "routeMetrics" | "scores" | "meta" | "balanceSheet" | "fundamentals">>;

/** D-310 review: calculation-owned records only. Provider envelope dates are
 * observations, and the capital calculation may have rejected their newest row. */
function capitalRecords(report: SupportReport): TracedNumber[] {
  const out: TracedNumber[] = [];
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    const row = node as Partial<TracedNumber>;
    if (typeof row.value === "number" && Number.isFinite(row.value) && typeof row.source === "string" && typeof row.unit === "string") { out.push(row as TracedNumber); return; }
    Object.values(node).forEach(visit);
  };
  visit(report.balanceSheet);
  visit(report.fundamentals);
  return out;
}

function refusedCapitalPeriod(records: readonly TracedNumber[], field: string): string | undefined {
  const sbc = field === "capital.fcf.sbc";
  const root = sbc ? "computed.capital.fcf.beforeSbc" : `computed.${field}`;
  const dates = [...new Set(records.flatMap(n => {
    const id = n.sourceId ?? n.source;
    if (id !== root && !(id.startsWith(`${root}.`) && !sbc)) return [];
    const date = n.periodContext?.kind === "duration" ? n.periodContext.end : n.periodContext?.kind === "instant" ? n.periodContext.at
      : sbc && /^\d{4}-\d{2}-\d{2}$/.test(n.period ?? "") ? n.period : n.asOf;
    return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? [date] : [];
  }))];
  // The SBC gap's producer names the last admitted FCF row; other calculations
  // require one unambiguous basis date, never a newest-date guess across operands.
  return sbc ? dates.sort().at(-1) : dates.length === 1 ? dates[0] : undefined;
}

export function supportLevel(report: SupportReport): SupportLevel {
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
    // D-300: a domain failure (non-positive equity value, negative explicit-period value) is a model limit, not missing evidence.
    else if (fv.status === "outside-domain") add("fair-value-withheld", "the per-share fair value is withheld because the cash-flow model's result falls outside the range it is valid for");
    else if (fv.status === "suppressed") add("fair-value-withheld", "the per-share fair value is withheld because an input could not be established");
  }
  // P12: the qualifications the grades already carry (assessment.ts withAssessmentQualification).
  // D-300: every reason code limits support; a grade with no recorded
  // qualification is not shown to be supported, so it cannot establish full support (P19).
  const qualification = report.scores === undefined ? undefined : report.scores.qualification;
  if (report.scores !== undefined && (qualification === undefined || qualification.composite.status === "unknown")) {
    add("grade-qualification-not-recorded", "this report does not record the evidence behind its grades");
  }
  const missingGrades: string[] = [], limitedGrades: string[] = [];
  const namedFields = new Set<string>();
  for (const reason of qualification?.composite.reasons ?? []) {
    // The withheld fair value is already listed; a generic valuation field would only repeat it.
    if (reason.code === "financial-evidence-blocked") {
      if (reason.field) namedFields.add(reason.field);
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
  const capital = capitalRecords(report);
  // D-300: the cash-flow valuation's tax rate is a headline input. Its operands are
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
  const currentAfterSbcShown = capital.some(n => ["computed.capital.current.cashBridge.afterSbcStandardizedFcf", "computed.current-capital.after-sbc-standardized-fcf"].includes(n.sourceId ?? n.source));
  if (!currentAfterSbcShown && gaps.some(gap => gap.field === "capital.fcf.sbc" && gap.expected !== true)) {
    const period = refusedCapitalPeriod(capital, "capital.fcf.sbc");
    add("fcf-after-sbc-withheld", `stock-based compensation is not established for ${period ? `the historical annual period ended ${period}` : "the historical annual calculation (period not recorded)"}, so free cash flow after it is withheld`);
  }
  // D-309: the literal definition. Every other unexpected entry on a valuation input or headline
  // figure limits support, in one plain sentence per typed field, unless a limitation above already names it.
  const has = (...codes: SupportLimitationCode[]) => out.some(item => codes.includes(item.code));
  for (const gap of gaps) {
    const field = gap.field;
    if (gap.expected === true || !HEADLINE_GAP_FIELD.test(field) || namedFields.has(field)) continue;
    if (field === DCF_TAX_OPERANDS_FIELD || field === "capital.fcf.sbc") continue;
    if (ROUTE_COVERED_GAP.test(field) && has("financial-route", "route-no-per-share-value")) continue;
    if (field === "valuation.dcf" && has("fair-value-withheld", "fair-value-dated")) continue;
    if (/^valuation\.(?:reverseDcf\.currentUse|dcf\.valuationDate)$/.test(field) && has("fair-value-dated")) continue;
    // D-310 (P1, P11): capital.* is the annual computation; currentCapital
    // is a separate owner. A saved gap without its period cannot assert a
    // current refusal. Read only the calculation's typed records, never dataset dates or reason text.
    const annualCapital = /^capital\.(?:netDebtToEbitda|interestCoverage|fcf)/.test(field);
    const period = refusedCapitalPeriod(capital, field);
    const text = headlineGapText(field);
    add("headline-input-qualified", annualCapital
      ? period ? text.replace(/ is /, ` for the historical annual period ended ${period} is `)
        : `${text.replace(/^(a |the )?/, "$1historical ")} (period not recorded)`
      : text);
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

/** D-311: repeats share the presentation identity; marks come from that same inventory. */
export function confirmedStatementShare(report: Report): ConfirmedShare {
  const seen = new Map<string, boolean>();
  for (const claim of readerStatementInventory(report)) {
    const key = claimEchoKey(claim);
    seen.set(key, claimStatusMark(claim) === "validated");
  }
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
  return `${confirmed} of ${total} distinct statements were confirmed against their records by code (${shareText(confirmed, total)}); a statement repeated in another section counts once.`;
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
