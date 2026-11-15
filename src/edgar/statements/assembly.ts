/** Statement row assembly and balance evidence guards; preserve period and entity scope (P1, P5; D-97, D-134). */
import { type ChainSpec, RESTRICTED_CASH_CURRENT_TAGS, RESTRICTED_CASH_NONCURRENT_TAGS, CONTINUING_EPS_WORKING_FIELDS, INCOME_CHAINS, BANK_REVENUE_SPEC, BANK_OPERATING_INCOME_SPEC, BANK_INTEREST_INCOME_SPEC, INCOME_UNSOURCED, BALANCE_CHAINS, BALANCE_ALIASES, BALANCE_UNSOURCED, CASHFLOW_CHAINS, CASHFLOW_ALIASES } from "./fieldSpecs";
import { type FieldValues, type ComputeContext, computeIncome, computeBalance, computeCashflow } from "./computation";
import { type NoteSink, type TagResolver, type Resolved, resolveSpec, filingRef, filedIncomeLine } from "./resolution";
import { type QuarterContext, resolveLongTermInvestments, decimalsFor, equityMethodPlacement } from "./quarters";
import { type FactPoint, type CompanyFacts, conceptFactsSchema, CORE_FACT_FORMS } from "@/edgar/xbrl";
import { tagsFor, REVENUE_TAGS, REVENUE_COMPONENT_TAGS, GROSS_PROFIT_COST_TAGS, TOTAL_INCOME_EXPENSE_TAGS, NONSERVICE_BENEFIT_EXPENSE_TAG, NET_INTEREST_NONOPERATING_TAG, EBIT_NON_OPERATING_ADJUSTMENTS } from "@/edgar/tagSynonyms";
import { withinDays, TOLERANCE_DAYS, dateMs, DAY_MS, isForeignAnnualForm, daysBetween, tidy, MONEY_DECIMALS } from "./periodMath";
import { type StatementBuildOptions, type StatementRowsResult, type Restatement, MATERIAL_FIELDS, type OriginalValue, RESTATEMENT_THRESHOLD_PCT, type Derivation } from "./types";
import { type StatementFieldProvenance, type FiledIncomeLine } from "@/providers/fmp";
import { ADDITIONAL_OPERATING_COST_TAGS } from "../revenuePresentation";
import { filingRepresented, isAmendment, describeChangePct } from "@/edgar/presentationLineage";
import { type ManifestEntry } from "@/types/core";


// ---------------------------------------------------------------------------
// Row assembly
// ---------------------------------------------------------------------------

type StatementName = "income" | "balance" | "cashflow";
type Scope = "annual" | "quarter";

interface StatementDef {
  statement: StatementName;
  chains: Record<string, ChainSpec>;
  /** Ordered; the first that resolves anchors the row's labels and currency. */
  anchors: string[];
  aliases: Record<string, string>;
  unsourced: string[];
  computed: string[];
  compute: (v: FieldValues, notes: NoteSink, ctx: string, cc: ComputeContext) => void;
}

interface PeriodSlot {
  date: string;
  resolve: TagResolver;
  quarter: QuarterContext | null;
  instant?: TagResolver;
  /** Every deduped-away and winning companyfacts copy of `tag` in `unit` (quarterly slots only). */
  copiesOf?: (tag: string, unit: string) => readonly FactPoint[] | null;
}

interface BuildState {
  filesTwentyF: boolean;
  filesForm20F: boolean;
  temporaryEquityPeriods: ReadonlySet<string>;
  nciZeroPeriods: ReadonlySet<string>;
  balanceRefusals: ReadonlyMap<string, string>;
}

const TEMPORARY_EQUITY_FIELDS = ["temporaryEquity", "temporaryEquityAttributableToParent", "temporaryEquityAttributableToNoncontrollingInterest"] as const;
const TEMPORARY_EQUITY_TAGS = new Set(TEMPORARY_EQUITY_FIELDS.flatMap(field => tagsFor(field)));
/** How far back the zero noncontrolling-interest balance an inference rests on may lie. */
const NCI_PRIOR_ZERO_MAX_DAYS = 400;

/* D-97: Infer zero NCI only from the issuer own compatible filed zero observations. */
function inferredZeroNciPeriods(facts: CompanyFacts, asOf: string): Set<string> {
  const day = asOf.slice(0, 10);
  const points = (tags: readonly string[], instant: boolean): FactPoint[] => tags.flatMap((tag) => {
    const raw = conceptFactsSchema.safeParse(facts.facts["us-gaap"]?.[tag]);
    if (!raw.success) return [];
    return Object.values(raw.data.units).flat().flatMap((input): FactPoint[] => {
      if (input === null || typeof input !== "object") return [];
      const p = input as Partial<FactPoint>;
      return typeof p.end === "string" && typeof p.filed === "string" && typeof p.form === "string" && typeof p.val === "number" &&
        Number.isFinite(p.val) && CORE_FACT_FORMS.has(p.form) && p.filed <= day && p.end <= day && (p.start === undefined) === instant ? [p as FactPoint] : [];
    });
  });
  const balances = points(tagsFor("minorityInterest"), true);
  const income = points(tagsFor("netIncomeAttributableToNoncontrollingInterest"), false);
  const out = new Set<string>();
  for (const end of new Set(income.map((p) => p.end))) {
    const ending = income.filter((p) => p.end === end);
    if (ending.some((p) => p.val !== 0)) continue;
    if (balances.some((p) => withinDays(p.end, end, TOLERANCE_DAYS))) continue;
    const prior = balances.filter((p) => p.end < end && withinDays(p.end, end, NCI_PRIOR_ZERO_MAX_DAYS));
    if (prior.length === 0) continue;
    const latest = prior.reduce((a, b) => (b.end > a.end ? b : a)).end;
    const spansSinceZero = ending.some((p) => p.start !== undefined && dateMs(p.start) <= dateMs(latest) + (TOLERANCE_DAYS + 1) * DAY_MS);
    if (spansSinceZero && prior.filter((p) => p.end === latest).every((p) => p.val === 0)) out.add(end);
  }
  return out;
}

/** Admission guard for these newly used balance categories, before the general
 * index's same-version first-wins dedup can hide contradictory amounts. Raw
 * exposure also survives a rejected value/unit so it cannot re-enable A-E.
 */
function balanceEvidenceGuards(facts: CompanyFacts, asOf: string): Pick<BuildState, "temporaryEquityPeriods" | "balanceRefusals"> {
  const temporaryEquityPeriods = new Set<string>();
  const balanceRefusals = new Map<string, string>();
  const sensitiveTags = new Set([...TEMPORARY_EQUITY_TAGS, "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
    "RestrictedCashAndCashEquivalentsAtCarryingValue", "RestrictedCashAndCashEquivalentsNoncurrent", ...RESTRICTED_CASH_CURRENT_TAGS, ...RESTRICTED_CASH_NONCURRENT_TAGS]);
  for (const tag of sensitiveTags) {
    const raw = conceptFactsSchema.safeParse(facts.facts["us-gaap"]?.[tag]);
    if (!raw.success) continue;
    type Version = { key: string; unit: string; filed: string; form: string; accn: string; values: Set<number>; invalid: boolean };
    const versions = new Map<string, Version>();
    for (const [unit, points] of Object.entries(raw.data.units)) for (const input of points) {
      if (input === null || typeof input !== "object") continue;
      const p = input as Record<string, unknown>;
      if (typeof p.end !== "string" || typeof p.filed !== "string" || typeof p.form !== "string" || typeof p.accn !== "string" ||
        p.start !== undefined || !CORE_FACT_FORMS.has(p.form) || p.filed > asOf.slice(0, 10) || p.end > asOf.slice(0, 10)) continue;
      const validDay = (day: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(dateMs(day)) && new Date(dateMs(day)).toISOString().slice(0, 10) === day;
      if (!validDay(p.end) || !validDay(p.filed)) continue;
      if (TEMPORARY_EQUITY_TAGS.has(tag)) temporaryEquityPeriods.add(p.end);
      const key = `${tag}|${unit}|${p.end}`;
      const versionKey = `${key}|${p.accn}|${p.filed}|${p.form}`;
      const version = versions.get(versionKey) ?? { key, unit, filed: p.filed, form: p.form, accn: p.accn, values: new Set<number>(), invalid: false };
      if (typeof p.val !== "number" || !Number.isFinite(p.val)) version.invalid = true;
      else version.values.add(p.val);
      versions.set(versionKey, version);
    }
    // Preserve the index's latest-filed / amendment / accession priority.
    // A later clean filing resolves an earlier conflict; a foreign unit's
    // conflict cannot invalidate a compatible reporting-currency point.
    const winners = new Map<string, Version>();
    for (const version of versions.values()) {
      const previous = winners.get(version.key);
      const amendment = Number(version.form.endsWith("/A"));
      const previousAmendment = Number(previous?.form.endsWith("/A"));
      if (previous === undefined || version.filed > previous.filed || version.filed === previous.filed &&
        (amendment > previousAmendment || amendment === previousAmendment && version.accn > previous.accn)) winners.set(version.key, version);
    }
    for (const version of winners.values()) {
      if (version.invalid) balanceRefusals.set(version.key, `${tag} refused: nonfinite or invalid monetary carrying amount`);
      else if (version.values.size > 1) balanceRefusals.set(version.key, `${tag} refused: conflicting same-filing, same-period ${version.unit} carrying amounts`);
    }
  }
  return { temporaryEquityPeriods, balanceRefusals };
}

/**
 * How long after a period ends its own report may still arrive. SEC annual deadlines top out
 * at 120 days (20-F; a 10-K is 60-90), so 270 days leaves generous slack for a late filer —
 * while staying well under the ~410 days at which the SAME period reappears as a comparative
 * inside the NEXT year's annual report, whose `fy` is one year too high.
 */
const MAX_OWN_PERIOD_FILING_LAG_DAYS = 270;

/**
 * `fy`/`fp` describe the FILING, not the fact's period (xbrl.ts:37), so they may only be
 * trusted when this filing is plausibly the period's OWN report: an annual `fp`/form for an
 * annual row, or a 10-Q for a quarterly row, filed within the window above. A comparative
 * carried in a later filing fails one test or both, and the fiscal-year end's own year is
 * used instead — which for a quarter is the discovered year end after it, and only when no
 * year end has been discovered yet (the quarters after the latest 10-K) the quarter's own
 * calendar year. A 10-Q's own `fy` is exactly the label those newest quarters need: on a
 * September fiscal calendar the December quarter belongs to the NEXT fiscal year, and its
 * calendar year mislabels it until the 10-K arrives.
 */
function fiscalYearLabel(anchor: FactPoint, slot: PeriodSlot): string {
  const form = anchor.form.trim();
  const fromAnnualFiling = anchor.fp === "FY" || form.startsWith("10-K") || isForeignAnnualForm(form);
  const fromOwnQuarterlyFiling = slot.quarter !== null && form.startsWith("10-Q");
  const lag = daysBetween(anchor.end, anchor.filed);
  const reportsOwnPeriod = lag >= 0 && lag <= MAX_OWN_PERIOD_FILING_LAG_DAYS;
  if ((fromAnnualFiling || fromOwnQuarterlyFiling) && reportsOwnPeriod && typeof anchor.fy === "number") {
    return String(anchor.fy);
  }
  return (slot.quarter?.fyEnd ?? slot.date).slice(0, 4);
}

function quarterLabel(anchor: FactPoint, ctx: QuarterContext): string {
  if (ctx.isFiscalYearEnd) return "Q4";
  const fp = anchor.fp ?? "";
  if (fp === "Q1" || fp === "Q2" || fp === "Q3") return fp;
  if (ctx.fyStart === null) return "Q4";
  const ordinal = Math.min(4, Math.max(1, Math.round(daysBetween(ctx.fyStart, ctx.end) / 91.3)));
  return `Q${ordinal}`;
}

function buildStatementRows<TRow>(
  def: StatementDef,
  slots: PeriodSlot[],
  scope: Scope,
  opts: StatementBuildOptions,
  state: BuildState,
  notes: NoteSink,
): StatementRowsResult<TRow> {
  const rows: TRow[] = [];
  const restatements: Restatement[] = [];
  const fieldNames = [...Object.keys(def.chains), ...Object.keys(def.aliases), ...def.computed, ...def.unsourced];
  const material = new Set(MATERIAL_FIELDS[def.statement]);

  for (const slot of slots) {
    const ctxLabel = slot.date;
    const values: FieldValues = {};
    const resolutions = new Map<string, Resolved>();
    const rowAnchor = def.anchors.flatMap((field) => {
      const spec = def.chains[field];
      const r = spec === undefined ? null : resolveSpec(spec, slot.resolve, notes, `${field} ${ctxLabel}`, { field, period: slot.date });
      return r === null ? [] : [r];
    })[0];
    let resolvingField = "";
    const sameRowEvidence: TagResolver = (tag, kind, _currency, magnitudeOnly) => {
      const refusal = state.balanceRefusals.get(`${tag}|${rowAnchor?.unit ?? ""}|${slot.date}`);
      if (def.statement === "balance" && refusal !== undefined) {
        notes.withhold(resolvingField, slot.date, refusal);
        notes.add(`${resolvingField} ${ctxLabel}: ${refusal}`);
        return null;
      }
      if (rowAnchor === undefined) return slot.resolve(tag, kind, undefined, magnitudeOnly);
      const r = slot.resolve(tag, kind, kind === "shares" ? undefined : rowAnchor.unit, magnitudeOnly);
      if (r === null) {
        const raw = slot.resolve(tag, kind);
        if (raw !== null) {
          const text = `mixed_unit: ${tag} uses ${raw.unit}, conflicting with row reporting currency ${rowAnchor.unit}; field/component withheld without a currency conversion`;
          notes.add(`${resolvingField} ${ctxLabel}: ${text}`);
          notes.withhold(resolvingField, slot.date, text);
        }
        return null;
      }
      const start = r.periodStart ?? r.point.start;
      const anchorStart = rowAnchor.periodStart ?? rowAnchor.point.start;
      if (r.point.end !== rowAnchor.point.end || start !== anchorStart) {
        const text = `period_mismatch: ${tag} covers ${start ?? "instant"}..${r.point.end}, conflicting with row anchor ${anchorStart ?? "instant"}..${rowAnchor.point.end}; field/component withheld`;
        notes.add(`${resolvingField} ${ctxLabel}: ${text}`);
        notes.withhold(resolvingField, slot.date, text);
        return null;
      }
      return r;
    };
    for (const [field, spec] of Object.entries(def.chains)) {
      resolvingField = field;
      const refusalsBefore = notes.refusals.length;
      const r = def.statement === "balance" && field === "longTermInvestments"
        ? resolveLongTermInvestments(sameRowEvidence, notes, `${field} ${ctxLabel}`, { field, period: slot.date })
        : resolveSpec(spec, sameRowEvidence, notes, `${field} ${ctxLabel}`, { field, period: slot.date });
      values[field] = r === null ? null : tidy(r.value, decimalsFor(spec.unit));
      if (r !== null) resolutions.set(field, r);
      // A refusal becomes a withholding only when the field ends null; if a later chain step served, it stays a note.
      else if (notes.refusals.length > refusalsBefore) notes.withhold(field, slot.date, notes.refusals[notes.refusals.length - 1]!);
    }
    // A quarter derived by SUBTRACTING year-to-date figures can come out
    // negative when the two operands do not describe the same thing — a
    // comparative re-presented between the two filings, a perimeter change, a
    // filer that tagged a cumulative figure as a quarter. Negative revenue for
    // a quarter is not something any filer reported; it is an artefact of the
    // subtraction, and publishing it puts a negative number into every growth
    // rate, margin and multiple that reads the quarter. It becomes a disclosed
    // gap naming the two periods it came from.
    const derivedRevenue = resolutions.get("revenue");
    const revenueValue = values.revenue;
    if (
      slot.quarter !== null &&
      derivedRevenue !== undefined &&
      derivedRevenue.derivation !== undefined &&
      revenueValue !== null &&
      revenueValue !== undefined &&
      revenueValue < 0
    ) {
      const operands = derivedRevenue.derivedFrom ?? [];
      const text =
        `revenue WITHHELD for this quarter: the ${DERIVATION_PHRASE[derivedRevenue.derivation]} derivation produced ` +
        `${revenueValue}, and a negative quarterly revenue is not a figure any filer reported — it is an artefact of ` +
        `subtracting two periods that do not describe the same thing (a comparative re-presented between the filings, ` +
        `a change of perimeter, or a cumulative figure tagged as a quarter). The operands were: ${
          operands.length > 0 ? operands.join(" MINUS ") : "not recorded"
        }.`;
      notes.add(`${def.statement} ${ctxLabel}: ${text}`);
      notes.withhold("revenue", slot.date, text);
      values.revenue = null;
      resolutions.delete("revenue");
    }

    for (const [alias, source] of Object.entries(def.aliases)) values[alias] = values[source] ?? null;

    const anchorField = def.anchors.find((f) => resolutions.has(f));
    if (anchorField === undefined) {
      // Say the true cause: an anchor that was filed and withheld for presentation is not a missing
      // fact.
      const refused = notes.withheld.find((w) => def.anchors.includes(w.field) && w.periods.includes(slot.date) && notes.presentationRefusals.includes(w.text));
      notes.add(
        refused === undefined
          ? `${def.statement} ${ctxLabel}: no ${def.anchors.join(" or ")} fact resolved; row omitted`
          : `${def.statement} ${ctxLabel}: ${refused.field} is withheld for presentation (${refused.text}); row omitted`,
      );
      continue;
    }
    const anchor = resolutions.get(anchorField) as Resolved;
    def.compute(values, notes, ctxLabel, {
      resolved: resolutions,
      temporaryEquityDisclosed: [...state.temporaryEquityPeriods].some(end => withinDays(end, slot.date, TOLERANCE_DAYS)),
      nciInferredZero: [...state.nciZeroPeriods].some(end => withinDays(end, slot.date, TOLERANCE_DAYS)),
      money: (tag) => {
        const r = sameRowEvidence(tag, "money");
        return r === null ? null : tidy(r.value, MONEY_DECIMALS);
      },
      fact: (tag) => sameRowEvidence(tag, "money"),
      replace: (field, resolved) => { if (resolved === null) resolutions.delete(field); else resolutions.set(field, resolved); },
    });
    // A withheld aggregate-dividend proxy has no common-dividend provenance.
    if (def.statement === "cashflow" && values.commonDividendsPaid === null) resolutions.delete("commonDividendsPaid");
    for (const field of def.unsourced) values[field] ??= null;

    if (isForeignAnnualForm(anchor.point.form.trim()) || isForeignAnnualForm(anchor.reporter.form.trim())) {
      state.filesTwentyF = true;
    }
    if (anchor.point.form.trim().startsWith("20-F") || anchor.reporter.form.trim().startsWith("20-F")) state.filesForm20F = true;

    const row: Record<string, unknown> = {
      symbol: opts.symbol,
      cik: opts.cik,
      date: slot.date,
      reportedCurrency: anchor.unit,
      // Labels and dates come from the filing that FIRST reported the period; the VALUE above
      // still comes from the max(filed) dedup winner, so a restatement wins the number.
      fiscalYear: fiscalYearLabel(anchor.reporter, slot),
      period: slot.quarter === null ? "FY" : quarterLabel(anchor.reporter, slot.quarter),
      filingDate: anchor.reporter.filed,
      acceptedDate: anchor.reporter.filed,
    };
    for (const field of fieldNames) row[field] = values[field] ?? null;
    if (def.statement === "income") {
      const placement = equityMethodPlacement(resolutions, sameRowEvidence, slot.instant, notes);
      if (placement !== undefined) row.equityMethodIncomePlacement = placement;
    }
    const fieldProvenance: Record<string, StatementFieldProvenance> = {};
    if (opts.factsObservedAt === undefined) notes.add(`${def.statement} ${ctxLabel}: SEC field acquisition timestamp unavailable; filing dates establish the analytical cutoff, while observedAt remains unknown`);
    for (const [field, resolved] of resolutions) {
      const filings = [...new Map((resolved.evidencePoints ?? [resolved.point]).map((p) => [`${p.accn}|${p.filed}`, filingRef(p)])).values()];
      fieldProvenance[field] = { source: "edgar", unit: resolved.unit, periodStart: resolved.periodStart ?? resolved.point.start ?? null,
        periodEnd: resolved.point.end, observedAt: opts.factsObservedAt ?? "", tags: resolved.tags.map((tag) => `us-gaap/${tag}`), filings,
        ...(resolved.flowOperands ? { flowOperands: resolved.flowOperands } : {}),
        ...(resolved.derivation !== undefined ? { derivation: resolved.derivation } : {}) };
    }
    for (const [alias, source] of Object.entries(def.aliases)) {
      if (fieldProvenance[source] !== undefined) fieldProvenance[alias] = fieldProvenance[source]!;
    }
    // Each lease slice keeps the tags that served it, so a partial operating
    // maturity stays visible beside a finance lease (the summed total's tags
    // describe neither slice once both are present).
    for (const field of ["operatingLeaseLiability", "financeLeaseLiability"] as const) {
      const total = fieldProvenance.capitalLeaseObligations;
      const family = [...tagsFor(field), ...tagsFor(`${field}Parts`)].map((tag) => `us-gaap/${tag}`);
      const tags = total?.tags.filter((tag) => family.includes(tag)) ?? [];
      if (def.statement === "balance" && values[field] != null && fieldProvenance[field] === undefined && total && tags.length > 0) fieldProvenance[field] = { ...total, tags };
    }
    // Parent equity inferred from an NCI-inclusive total is that total's fact,
    // marked so the ownership basis reads it as parent equity, not consolidated.
    if (def.statement === "balance" && values.totalStockholdersEquity != null && !resolutions.has("totalStockholdersEquity") && fieldProvenance.totalEquity) {
      fieldProvenance.totalStockholdersEquity = { ...fieldProvenance.totalEquity, calculation: "nci-inferred-zero" };
    }
    if (def.statement === "income" && values.grossProfit != null && !resolutions.has("grossProfit") && fieldProvenance.revenue && fieldProvenance.costOfRevenue) {
      fieldProvenance.grossProfit = { ...fieldProvenance.revenue, tags: [...fieldProvenance.revenue.tags, ...fieldProvenance.costOfRevenue.tags], calculation: "revenue-minus-cost" };
    }
    if (def.statement === "income") {
      const lines: Record<string, FiledIncomeLine> = {};
      for (const tag of [...REVENUE_TAGS, ...REVENUE_COMPONENT_TAGS, ...tagsFor("grossProfit"), ...GROSS_PROFIT_COST_TAGS,
        ...TOTAL_INCOME_EXPENSE_TAGS, NONSERVICE_BENEFIT_EXPENSE_TAG, ...tagsFor("operatingIncome"), ...tagsFor("operatingExpenses"), ...tagsFor("interestExpense"),
      ...tagsFor("sellingGeneralAndAdministrativeExpenses"), ...tagsFor("researchAndDevelopmentExpenses"), ...ADDITIONAL_OPERATING_COST_TAGS, NET_INTEREST_NONOPERATING_TAG,
        ...EBIT_NON_OPERATING_ADJUSTMENTS.flatMap(a => a.tags),
        // D-257 (P7): the two components of a bank's total net revenue, each with its own
        // period and filings, so the income classification can tie the filed total to them.
        ...tagsFor("bankRevenueComponents")]) {
        const r = notes.quietly(() => sameRowEvidence(tag, "money"));
        if (r) lines[tag] = filedIncomeLine(r, opts.factsObservedAt ?? "");
      }
      row.filedIncomeLines = lines;
    }
    row.fieldProvenance = fieldProvenance;
    if (def.statement === "income") {
      const refused = notes.withheld.filter(held => held.field === "grossProfit" && held.periods.includes(slot.date));
      if (refused.length > 0) row.fieldConflicts = { grossProfit: { vendorValue: null, secValue: null, usable: false, reason: refused.map(held => held.text).join("; ") } };
    } else if (def.statement === "balance") {
      if (values.totalLiabilities != null && !resolutions.has("totalLiabilities")) row.identityDerivedFields = ["totalLiabilities"];
      const refused = notes.withheld.filter((held) => ["cashAndCashEquivalents", "cashAndShortTermInvestments", "shortTermDebt", "longTermDebt", "totalDebt", "netDebt", "totalLiabilities", ...TEMPORARY_EQUITY_FIELDS].includes(held.field) && held.periods.includes(slot.date));
      if (refused.length > 0) row.fieldConflicts = Object.fromEntries(refused.map((held) => {
        const cause = notes.causeOf(held);
        return [held.field, { vendorValue: null, secValue: null, usable: false, reason: held.text, ...(cause !== undefined ? { cause } : {}) }];
      }));
    } else if (def.statement === "cashflow" && values.commonDividendsPaid === null) {
      // Statement-level withholding notes do not travel with a serialized row.
      // Preserve an explicit common-cash refusal so payout cannot infer zero.
      const refused = notes.withheld.filter((held) => held.field === "commonDividendsPaid" && held.periods.includes(slot.date));
      if (refused.length > 0) row.fieldConflicts = { commonDividendsPaid:
        { vendorValue: null, secValue: null, usable: false, reason: refused.map(held => held.text).join("; ") } };
    }

    // The superseded figure of every field a later filing changed, kept beside
    // the value the row carries; a MATERIAL line that moved by more than
    // RESTATEMENT_THRESHOLD_PCT of its first-reported value also raises a
    // statement-level `restatement` flag the forensics module can read.
    const original: Record<string, OriginalValue> = {};
    const rowFlags: Restatement[] = [];
    for (const [field, resolved] of resolutions) {
      const prior = resolved.original;
      if (prior === undefined) continue;
      original[field] = prior;
      if (!material.has(field)) continue;
      // A change against an original of zero is not a percentage. It used to be
      // Infinity, which rendered "Infinity%" in a manifest reason and
      // serialised to `null` in the row by accident; `null` is now the
      // deliberate sentinel and every reader tests for it.
      const changePct = prior.value === 0 ? null : ((resolved.value - prior.value) / Math.abs(prior.value)) * 100;
      if (changePct !== null && !(Math.abs(changePct) > RESTATEMENT_THRESHOLD_PCT)) continue;
      rowFlags.push({
        date: slot.date,
        field,
        original: prior.value,
        restated: resolved.value,
        changePct: changePct === null ? null : tidy(changePct, 4),
        originalFiling: { accn: prior.accn, filed: prior.filed, form: prior.form },
        restatedFiling: filingRef(resolved.point),
      });
    }
    if (Object.keys(original).length > 0) row.original = original;
    // D-134: the filing that supplies a quarter's revenue and whether it re-presented earlier
    // periods of that concept (the test `presentationMixed` applies to a minuend), so a growth cell
    // can tell two bases apart. Additive: omitted unless one tag and unit supplied the figure and
    // its copies can be identified.
    if (def.statement === "income" && slot.quarter !== null) {
      const revenue = resolutions.get("revenue");
      const copies = revenue !== undefined && revenue.tags.length === 1 ? slot.copiesOf?.(revenue.tags[0]!, revenue.unit) ?? null : null;
      if (revenue !== undefined && copies !== null && copies.some((c) => c.accn === revenue.point.accn)) {
        row.revenuePresentation = {
          accn: revenue.point.accn,
          form: revenue.point.form,
          filed: revenue.point.filed,
          represented: filingRepresented(copies, revenue.point.accn, RESTATEMENT_THRESHOLD_PCT, isAmendment(revenue.point) ? revenue.point : undefined),
        };
      }
    }
    if (rowFlags.length > 0) {
      row.restatement = rowFlags;
      restatements.push(...rowFlags);
      for (const flag of rowFlags) {
        notes.add(
          `${def.statement} ${ctxLabel}: ${flag.field} restated or re-presented from ${flag.original} (${flag.originalFiling.form} ${flag.originalFiling.filed}) to ${flag.restated} (${flag.restatedFiling.form} ${flag.restatedFiling.filed}), ${describeChangePct(flag.changePct)} — the row carries the last-filed value and the superseded one as \`original\`; a comparative RE-PRESENTED for discontinued operations or a change of reportable segments moves the same way and companyfacts cannot tell it from a correction`,
        );
      }
    }

    if (slot.quarter !== null) {
      // A working field leaves the row, so its derivation is not the row's.
      const derivedFields = [...resolutions.entries()].filter(([field, r]) => r.derivation !== undefined && !CONTINUING_EPS_WORKING_FIELDS.has(field));
      const derivation = anchor.derivation ?? derivedFields[0]?.[1].derivation;
      if (derivation !== undefined) {
        row.derivation = derivation;
        row.derivedFrom = [...new Set(derivedFields.flatMap(([, r]) => r.derivedFrom ?? []))];
        const names = derivedFields.filter(([, r]) => r.derivation === derivation).map(([f]) => f);
        notes.add(`${def.statement} ${ctxLabel} (${String(row.period)}): ${DERIVATION_PHRASE[derivation]} derivation used for ${names.join(", ")}`);
      }
    }
    rows.push(row as TRow);
  }

  const gaps: ManifestEntry[] = [];
  if (rows.length === 0) gaps.push(noRowsGap(def, scope, opts, slots.length));
  return { rows, notes: notes.notes, gaps, substitutions: notes.substitutions, restatements, withheld: notes.withheld };
}

function noRowsGap(def: StatementDef, scope: Scope, opts: StatementBuildOptions, candidates: number): ManifestEntry {
  return {
    field: `edgar.statements.${def.statement}(${opts.symbol},${scope})`,
    reason:
      `no ${scope === "annual" ? "annual" : "quarterly"} ${def.statement} rows could be built from SEC companyfacts: ` +
      `${candidates} candidate period${candidates === 1 ? "" : "s"}, none with a ${def.anchors.join(" or ")} anchor`,
    severity: "warn",
    attemptedSources: def.anchors.map((f) => `companyfacts us-gaap/${f}`),
  };
}

const DERIVATION_PHRASE: Record<Derivation, string> = {
  "ytd-difference": "YTD difference",
  "fy-minus-ytd": "FY − YTD",
  "fy-minus-quarters": "FY − (Q1+Q2+Q3)",
  "fy-share-identity": "Q4 net income ÷ Q4 shares from the day-weighted FY identity",
};

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const INCOME_DEF = (bankRevenue: boolean): StatementDef => ({
  statement: "income",
  chains: bankRevenue
    ? {
        ...INCOME_CHAINS,
        revenue: BANK_REVENUE_SPEC,
        operatingIncome: BANK_OPERATING_INCOME_SPEC,
        interestIncome: BANK_INTEREST_INCOME_SPEC,
      }
    : INCOME_CHAINS,
  anchors: ["revenue", "netIncome"],
  aliases: {},
  unsourced: INCOME_UNSOURCED,
  computed: ["grossProfit", "ebitda", "ebit"],
  compute: (v, n, c, cc) => computeIncome(v, n, c, cc, bankRevenue ? "bank" : "general"),
});

const BALANCE_DEF: StatementDef = {
  statement: "balance",
  chains: BALANCE_CHAINS,
  anchors: ["totalAssets"],
  aliases: BALANCE_ALIASES,
  unsourced: BALANCE_UNSOURCED,
  computed: ["cashAndShortTermInvestments", "totalEquity", "totalLiabilities", "totalDebt", "netDebt", "operatingLeaseLiability", "financeLeaseLiability"],
  compute: computeBalance,
};

const CASHFLOW_DEF: StatementDef = {
  statement: "cashflow",
  chains: CASHFLOW_CHAINS,
  anchors: ["operatingCashFlow"],
  aliases: CASHFLOW_ALIASES,
  unsourced: [],
  computed: ["freeCashFlow"],
  compute: (v) => computeCashflow(v),
};
export { type StatementName, type BuildState, buildStatementRows, INCOME_DEF, balanceEvidenceGuards, inferredZeroNciPeriods, type PeriodSlot, BALANCE_DEF, type StatementDef, CASHFLOW_DEF, noRowsGap };
