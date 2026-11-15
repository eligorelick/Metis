/** Public statement orchestration and caching; preserve source provenance and cutoff (P2, P20; D-53, D-97). */
import { type CompanyFacts, looksLikeBankTagging, type FactPoint } from "@/edgar/xbrl";
import { type StatementBuildOptions, type BuiltStatements, type StatementRowsResult, RESTATEMENT_THRESHOLD_PCT, type ShareBasisWithheld, type StatementFactExclusion } from "./types";
import { memoize } from "@/edgar/computationContext";
import { type FmpIncomeStatementRow, type StatementFieldProvenance, type FmpBalanceSheetRow, type FmpCashFlowRow } from "@/providers/fmp";
import { createNoteSink, type TagResolver, resolvedPoint, type NoteSink } from "./resolution";
import { filedWindowFlow, filedCashFlowTtm } from "../financialEnrichment";
import { type BuildState, buildStatementRows, INCOME_DEF, balanceEvidenceGuards, inferredZeroNciPeriods, type PeriodSlot, BALANCE_DEF, type StatementDef, CASHFLOW_DEF, noRowsGap } from "./assembly";
import { buildFactIndex, pickUnitPoints, presentationCurrency, otherUnitAnnualNotes, unitMatches, DEI_PUBLIC_FLOAT_TAG } from "./factIndex";
import { discoverStockSplits } from "@/edgar/splits";
import { REVENUE_TAGS, tagsFor } from "@/edgar/tagSynonyms";
import { isNum, standInEpsFromContinuingOperations, deriveFourthQuarterPerShare, standInDilutedSharesFromBasic } from "./perShare";
import { completeOperatingBridge } from "../revenuePresentation";
import { movedBeyond, oneBasisPair, representationLabelled } from "@/edgar/presentationLineage";
import { labelCopiesOf } from "./computation";
import { discoverFiscalYears, discoverQuarterEnds, mergeEndsDesc, buildQuarterContexts, type FiscalYear, instantResolver, quarterResolver, annualResolver } from "./quarters";
import { durationDays, QUARTER_MIN_DAYS, QUARTER_MAX_DAYS, dateMs, DAY_MS } from "./periodMath";
import { latestSharesOutstanding, latestDeiPoint } from "./shares";


/**
 * Build the filed statements. Inside a run's computation context
 * (src/edgar/computationContext.ts) the result is computed once per exact
 * input: the identity of `facts` (a filtered or rebuilt fact set is a different
 * object, so a different key) and the canonical encoding of every option
 * (periods, cutoff, observation time, split evidence, basis day, bank-revenue
 * routing, identity). Each caller receives its own deep copy, as if freshly
 * built. Outside a context it is `buildStatementsUncached`.
 */
export function buildStatementsFromCompanyFacts(facts: CompanyFacts, opts: StatementBuildOptions): BuiltStatements {
  return memoize("statements", facts, opts, () => buildStatementsUncached(facts, opts));
}

/** D-260 (P1): the same income chains on one exact monetary window. No EPS
 * or share-count identity is inferred. The shared filed-window owner retains
 * FY + current YTD - prior-year YTD and every underlying observation. */
export function buildIncomeWindowFromCompanyFacts(facts: CompanyFacts, opts: StatementBuildOptions, unit: string, start: string, end: string): StatementRowsResult<FmpIncomeStatementRow> {
  return memoize("income-window", facts, { opts, unit, start, end }, () => {
    const notes = createNoteSink();
    const resolve: TagResolver = (tag, kind, currency) => {
      if (kind !== "money" || currency && currency !== unit) return null;
      const flow = filedWindowFlow(facts, tag, unit, start, end, opts.asOf);
      if (!flow) return null;
      const point = flow.points.find(p => p.end === end)!;
      return { value: flow.value, point, reporter: point, unit, tags: [tag], periodStart: start,
        evidencePoints: flow.points, flowOperands: [{ tag: `us-gaap/${tag}`, points: flow.points }] };
    };
    const state: BuildState = { filesTwentyF: false, filesForm20F: false,
      balanceRefusals: new Map(), temporaryEquityPeriods: new Set(), nciZeroPeriods: new Set() };
    const bank = opts.bankRevenue ?? looksLikeBankTagging(facts);
    const result = buildStatementRows<FmpIncomeStatementRow>(INCOME_DEF(bank),
      [{ date: end, resolve, quarter: null }], "annual", opts, state, notes);
    const row = result.rows[0];
    if (!row || bank) return result;
    // Compose each operating total in its own filing before differencing.
    // Independently rounded children can move more than the already-reconciled
    // operating total. Compatibility is judged on that total, never by adding
    // an allowance to a failed component or treating a missing child as zero.
    const index = buildFactIndex(facts, { splits: discoverStockSplits(facts, { asOf: opts.asOf, vendor: opts.vendorSplits }),
      day: opts.asOf, withheld: [] }, opts.asOf, []);
    const revenueTag = row.fieldProvenance?.revenue?.tags.find(t => REVENUE_TAGS.includes(t.replace(/^us-gaap\//, "")))?.replace(/^us-gaap\//, "");
    const flow = revenueTag ? filedCashFlowTtm(facts, revenueTag, unit, end, opts.asOf) : null;
    if (!flow || flow.start !== start || flow.points.length !== 3) return result;
    const interval = (p: FactPoint): { point: FactPoint; proof: StatementFieldProvenance } | null => {
      const exact: TagResolver = (tag, kind, currency) => {
        if (kind !== "money" || currency && currency !== unit) return null;
        const up = pickUnitPoints(index, tag, kind, unit);
        const ps = up?.all.filter(x => x.start === p.start && x.end === p.end && x.accn === p.accn && x.filed === p.filed && x.form === p.form) ?? [];
        if (!up || !ps.length || ps.some(x => x.val !== ps[0]!.val)) return null;
        return { ...resolvedPoint(tag, up, ps[0]!, ps[0]!.val), flowOperands: [{ tag: `us-gaap/${tag}`, points: [ps[0]!] }] };
      };
      const r = buildStatementRows<FmpIncomeStatementRow>(INCOME_DEF(false), [{ date: p.end, resolve: exact, quarter: null }], "annual", opts, state, createNoteSink()).rows[0];
      if (!r?.fieldProvenance?.revenue || !r.fieldProvenance.incomeBeforeTax || !isNum(r.revenue) || !isNum(r.incomeBeforeTax)) return null;
      const bridge = completeOperatingBridge({ value: r.revenue, proof: r.fieldProvenance.revenue },
        { value: r.incomeBeforeTax, proof: r.fieldProvenance.incomeBeforeTax }, r.filedIncomeLines ?? {});
      return bridge ? { point: { ...p, val: bridge.value }, proof: bridge.proof } : null;
    };
    const totals = flow.points.map(interval);
    if (totals.some(t => t === null)) return result;
    const [annual, current, prior] = totals as NonNullable<ReturnType<typeof interval>>[];
    const copies = pickUnitPoints(index, revenueTag!, "money", unit)!.all.filter(p =>
      (p.start === annual!.point.start && p.end === annual!.point.end) || (p.start === prior!.point.start && p.end === prior!.point.end))
      .flatMap(p => { const t = interval(p); return t ? [t.point] : []; });
    const oldPrior = [...copies].filter(p => p.start === prior!.point.start && p.end === prior!.point.end && p.filed <= annual!.point.filed)
      .sort((a, b) => b.filed.localeCompare(a.filed))[0];
    if (annual!.point.accn !== prior!.point.accn && (!oldPrior || movedBeyond(oldPrior, prior!.point, 0))) return result;
    const pair = oneBasisPair(copies, annual!.point, () => oldPrior ? [oldPrior] : [prior!.point], RESTATEMENT_THRESHOLD_PCT,
      p => representationLabelled(labelCopiesOf(index), p, RESTATEMENT_THRESHOLD_PCT));
    if (pair.kind !== "pair" || pair.minuend.accn !== annual!.point.accn || pair.minuend.val !== annual!.point.val) return result;
    const proof: StatementFieldProvenance = { ...row.fieldProvenance!.revenue!, calculation: "complete-operating-reconciliation",
      tags: [...new Set(totals.flatMap(t => t!.proof.tags))], flowOperands: [
        { tag: "calculation/complete-operating-reconciliation", points: totals.map(t => t!.point) },
        ...totals.flatMap(t => t!.proof.flowOperands ?? []),
      ] };
    row.operatingIncome = annual!.point.val + current!.point.val - prior!.point.val;
    row.ebit = row.operatingIncome;
    row.fieldProvenance = { ...row.fieldProvenance, operatingIncome: proof, ebit: { ...proof, calculation: "operating-income-as-ebit" } };
    return result;
  });
}

/** The statement builder itself, never cached (tests compare it with the cached path). */
export function buildStatementsUncached(facts: CompanyFacts, opts: StatementBuildOptions): BuiltStatements {
  const splits = discoverStockSplits(facts, { asOf: opts.asOf, vendor: opts.vendorSplits });
  const basisDay = opts.basisDay ?? opts.asOf;
  const shareBasisWithheld: ShareBasisWithheld[] = [];
  const factExclusions: StatementFactExclusion[] = [];
  const index = buildFactIndex(facts, { splits, day: basisDay, withheld: shareBasisWithheld }, opts.asOf, factExclusions);
  const presentationUnit = presentationCurrency(index);
  if (presentationUnit !== null) {
    for (const entries of index.values()) entries.sort((a, b) => Number(b.unit === presentationUnit || b.unit === `${presentationUnit}/shares`) - Number(a.unit === presentationUnit || a.unit === `${presentationUnit}/shares`));
  }
  const currencyNotes = presentationUnit === null ? [] : otherUnitAnnualNotes(index, presentationUnit);
  const state: BuildState = { filesTwentyF: false, filesForm20F: false, ...balanceEvidenceGuards(facts, opts.asOf), nciZeroPeriods: inferredZeroNciPeriods(facts, opts.asOf) };

  const allFiscalYears = discoverFiscalYears(index);
  const fiscalYearEnds = new Set(allFiscalYears.map((fy) => fy.end));
  const annualYears = allFiscalYears.slice(0, Math.max(0, opts.annualPeriods));

  const quarterEnds = discoverQuarterEnds(index, fiscalYearEnds);
  // N4b: income comparatives need no balance-sheet instant for that quarter.
  const incomeQuarterEnds = mergeEndsDesc(new Set([...quarterEnds, ...REVENUE_TAGS.flatMap(tag =>
    pickUnitPoints(index, tag, "money")?.points.filter(p => {
      const days = durationDays(p);
      return days !== null && days >= QUARTER_MIN_DAYS && days <= QUARTER_MAX_DAYS;
    }).map(p => p.end) ?? [])]), fiscalYearEnds);
  const incomeContexts = buildQuarterContexts(index, incomeQuarterEnds, fiscalYearEnds).slice(0, Math.max(0, opts.quarterlyPeriods) + 1);
  const quarterContexts = buildQuarterContexts(index, quarterEnds, fiscalYearEnds);
  // One quarter of headroom: the oldest requested quarter still needs its
  // predecessor to resolve a year-to-date difference.
  const quarterSlotContexts = quarterContexts.slice(0, Math.max(0, opts.quarterlyPeriods) + 1);

  const annualSlots = (resolverFor: (fy: FiscalYear) => TagResolver): PeriodSlot[] =>
    annualYears.map((fy) => ({ date: fy.end, resolve: resolverFor(fy), instant: instantResolver(index, fy.end), quarter: null }));
  const quarterSlots = (ytdOnly: boolean, notes: NoteSink): PeriodSlot[] =>
    (ytdOnly ? quarterSlotContexts : incomeContexts).map((ctx) => ({
      date: ctx.end,
      resolve: quarterResolver(index, ctx, ytdOnly ? quarterEnds : incomeQuarterEnds, ytdOnly, notes),
      instant: instantResolver(index, ctx.end),
      quarter: ctx,
      copiesOf: (tag, unit) => index.get(tag)?.find((e) => e.unit === unit)?.all ?? null,
    }));
  const balanceQuarterSlots = (): PeriodSlot[] =>
    quarterSlotContexts.map((ctx) => ({ date: ctx.end, resolve: instantResolver(index, ctx.end), quarter: ctx }));

  const bankTagging = looksLikeBankTagging({ ...facts, facts: { ...facts.facts,
    "us-gaap": Object.fromEntries(Object.entries(facts.facts["us-gaap"] ?? {}).filter(([tag]) => index.has(tag))) } });
  const bankRevenue = opts.bankRevenue ?? bankTagging;
  const incomeDef = INCOME_DEF(bankRevenue);
  const bankNote = bankTagging
    ? "revenue resolved through the bank revenue chain (RevenueFromContractWithCustomer* absent, bank revenue/NII tags present)"
    : "revenue resolved through the bank revenue chain (the issuer is classified as a bank; its ASC-606 revenue tags carry fee revenue only and are tried last)";

  const incomeAnnualNotes = createNoteSink();
  for (const note of currencyNotes) incomeAnnualNotes.add(note);
  const incomeQuarterlyNotes = createNoteSink();
  if (bankRevenue) {
    incomeAnnualNotes.add(bankNote);
    incomeQuarterlyNotes.add(bankNote);
  }
  // The split notes ride with the rows that carry share-basis figures: EPS and
  // weighted shares on the income rows, CommonStockSharesOutstanding on the
  // balance rows.
  const balanceAnnualNotes = createNoteSink();
  for (const note of currencyNotes) balanceAnnualNotes.add(note);
  const balanceQuarterlyNotes = createNoteSink();
  const withheldSummary = describeShareBasisWithheld(shareBasisWithheld, basisDay);
  for (const text of [...splits.notes.map((n) => n.text), ...(withheldSummary === null ? [] : [withheldSummary])]) {
    incomeAnnualNotes.add(text);
    incomeQuarterlyNotes.add(text);
    balanceAnnualNotes.add(text);
    balanceQuarterlyNotes.add(text);
  }

  const incomeAnnual = buildStatementRows<FmpIncomeStatementRow>(
    incomeDef,
    annualSlots((fy) => annualResolver(index, fy)),
    "annual",
    opts,
    state,
    incomeAnnualNotes,
  );
  const incomeQuarterly = buildStatementRows<FmpIncomeStatementRow>(
    incomeDef,
    quarterSlots(false, incomeQuarterlyNotes),
    "quarter",
    opts,
    state,
    incomeQuarterlyNotes,
  );
  standInEpsFromContinuingOperations(incomeAnnual.rows, incomeAnnualNotes);
  standInEpsFromContinuingOperations(incomeQuarterly.rows, incomeQuarterlyNotes);
  deriveFourthQuarterPerShare(incomeQuarterly.rows, incomeAnnual.rows, incomeQuarterlyNotes);
  standInDilutedSharesFromBasic(incomeAnnual.rows, incomeAnnualNotes);
  standInDilutedSharesFromBasic(incomeQuarterly.rows, incomeQuarterlyNotes);
  const balanceAnnual = buildStatementRows<FmpBalanceSheetRow>(
    BALANCE_DEF,
    annualYears.map((fy) => ({ date: fy.end, resolve: instantResolver(index, fy.end), quarter: null })),
    "annual",
    opts,
    state,
    balanceAnnualNotes,
  );
  const balanceQuarterly = buildStatementRows<FmpBalanceSheetRow>(
    BALANCE_DEF,
    balanceQuarterSlots(),
    "quarter",
    opts,
    state,
    balanceQuarterlyNotes,
  );
  const cashflowDef: StatementDef = {
    ...CASHFLOW_DEF,
    compute(values, notes, date, context) {
      CASHFLOW_DEF.compute(values, notes, date, context);
      const common = context.resolved.get("commonDividendsPaid");
      if (common === undefined || common.tags.includes("PaymentsOfDividendsCommonStock")) return;
      const aggregateOnly = common.tags.length === 1 && common.tags[0] === "PaymentsOfDividends";
      let reason: string;
      if (!aggregateOnly) {
        const total = values.netDividendsPaid;
        const preferred = values.preferredDividendsPaid;
        if (total != null && preferred != null && total <= 0 && preferred <= 0 && preferred >= total) return;
        reason = "common dividends are withheld: total less preferred CASH payments have contradictory components (cash outflows must be nonnegative and preferred cannot exceed total); no clamping or earnings-allocation substitution is permitted";
      } else {
        const start = common.periodStart ?? common.point.start;
        if (start === undefined) return;
        // The already cutoff-filtered, deduped index is issuer-local. Any
        // positive monetary carrying-value synonym in this payout window (or its
        // opening balance) establishes preferred exposure, even if par or the
        // closing balance is zero. Distant historical balances do not.
        const opening = dateMs(start) - DAY_MS;
        const knownPreferred = tagsFor("preferredStock").some((tag) =>
          (index.get(tag) ?? []).some((up) => unitMatches(up.unit, "money") && up.points.some((p) =>
            p.start === undefined && p.val > 0 && dateMs(p.end) >= opening && p.end <= common.point.end)));
        // Existence needs no FX conversion; only cash subtraction must share
        // the reporting currency, as enforced by the row resolver above.
        // A failed preferred-cash component must not silently turn the total
        // into common cash. Period/currency mismatches remain refusals, even
        // when no preferred carrying value was filed for the closing date.
        const preferredCashEvidence = tagsFor("preferredDividendsPaid").some((tag) =>
          (index.get(tag) ?? []).some((up) => up.points.some((p) => p.start !== undefined &&
            p.start <= common.point.end && p.end >= start)));
        // Zero total cash establishes zero common cash unless a refused cash
        // component contradicts that inference. Never bypass a failed diff.
        if (values.commonDividendsPaid === 0 && !preferredCashEvidence) return;
        if (!knownPreferred && !preferredCashEvidence) return;
        reason = "preferred stock is outstanding during the payout period or preferred cash evidence is incompatible, but only aggregate dividends paid can be used; common dividends are withheld until the common or preferred CASH distribution is disclosed on the same period and currency basis (earnings allocations are not cash payments)";
      }
      values.commonDividendsPaid = null;
      notes.add(`commonDividendsPaid ${date}: ${reason}`);
      notes.withhold("commonDividendsPaid", date, reason);
    },
  };
  const cashflowAnnualNotes = createNoteSink();
  for (const note of currencyNotes) cashflowAnnualNotes.add(note);
  const cashflowAnnual = buildStatementRows<FmpCashFlowRow>(
    cashflowDef,
    annualSlots((fy) => annualResolver(index, fy)),
    "annual",
    opts,
    state,
    cashflowAnnualNotes,
  );
  const cashflowQuarterlyNotes = createNoteSink();
  const cashflowQuarterly = buildStatementRows<FmpCashFlowRow>(
    cashflowDef,
    quarterSlots(true, cashflowQuarterlyNotes),
    "quarter",
    opts,
    state,
    cashflowQuarterlyNotes,
  );

  // Trim the headroom quarter back to the requested count; a request trimmed to
  // nothing still has to disclose that it produced no rows.
  const quarterlyResults: [StatementRowsResult<{ [k: string]: unknown }>, StatementDef][] = [
    [incomeQuarterly, incomeDef],
    [balanceQuarterly, BALANCE_DEF],
    [cashflowQuarterly, CASHFLOW_DEF],
  ];
  for (const [result, def] of quarterlyResults) {
    result.rows.splice(Math.max(0, opts.quarterlyPeriods));
    // A substitution only counts for the rows that survive the trim.
    const kept = new Set(result.rows.map((row) => String(row.date)));
    for (const sub of result.substitutions) sub.periods = sub.periods.filter((p) => kept.has(p));
    result.substitutions = result.substitutions.filter((sub) => sub.periods.length > 0);
    if (result.rows.length === 0 && result.gaps.length === 0) {
      result.gaps.push(noRowsGap(def, "quarter", opts, quarterSlotContexts.length));
    }
  }

  const currency =
    [
      incomeAnnual.rows[0],
      balanceAnnual.rows[0],
      cashflowAnnual.rows[0],
      incomeQuarterly.rows[0],
      balanceQuarterly.rows[0],
      cashflowQuarterly.rows[0],
    ].find((r) => typeof r?.reportedCurrency === "string")?.reportedCurrency ?? null;

  return {
    incomeAnnual,
    incomeQuarterly,
    balanceAnnual,
    balanceQuarterly,
    cashflowAnnual,
    cashflowQuarterly,
    shares: {
      outstanding: latestSharesOutstanding(index),
      publicFloat: latestDeiPoint(index, DEI_PUBLIC_FLOAT_TAG, "money"),
    },
    reportedCurrency: currency,
    filesTwentyF: state.filesTwentyF,
    filesForm20F: state.filesForm20F,
    splits,
    basisDay,
    shareBasisWithheld,
    factExclusions,
  };
}

/** One line naming the share and per-share facts left out for their split basis; null when none. */
export function describeShareBasisWithheld(withheld: readonly ShareBasisWithheld[], basisDay: string): string | null {
  if (withheld.length === 0) return null;
  const concepts = [...new Set(withheld.map((w) => w.concept))].sort();
  const ends = withheld.map((w) => w.end).sort();
  const reasons = [...new Set(withheld.map((w) => w.reason))];
  return (
    `${withheld.length} share or per-share fact(s) left out (${concepts.join(", ")}; periods ${ends[0]} … ${ends[ends.length - 1]}) ` +
    `because their split basis on ${basisDay} could not be established: ${reasons.slice(0, 3).join("; ")}` +
    (reasons.length > 3 ? `; and ${reasons.length - 3} more reason(s)` : "")
  );
}
