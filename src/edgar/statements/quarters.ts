/** Fiscal windows and derived quarter operands; require one compatible presentation (P1; D-59, D-134). */
import { withinDays, TOLERANCE_DAYS, ANNUAL_FORMS, durationDays, ANNUAL_MIN_DAYS, ANNUAL_MAX_DAYS, QUARTERLY_FORMS, daysBetween, dateMs, DAY_MS, QUARTER_MIN_DAYS, QUARTER_MAX_DAYS, PER_SHARE_DECIMALS, MONEY_DECIMALS, tidy } from "./periodMath";
import { type FactIndex, pickUnitPoints, reporterFor, findDurationForAnnual, findInstant, buildFactIndex, findByDurationDays, lineagePoints, findDurationExact, findAnnualDuration } from "./factIndex";
import { FY_ANCHOR_DURATION_TAGS, BALANCE_CHAINS, type UnitKind } from "./fieldSpecs";
import { type TagResolver, resolvedPoint, type NoteSink, type ResolveAt, type Resolved, resolveSpec, createNoteSink, filingRef, describePoint } from "./resolution";
import { type CompanyFacts, type FactPoint } from "@/edgar/xbrl";
import { type StatementFieldProvenance, type EquityMethodIncomePlacement } from "@/providers/fmp";
import { discoverStockSplits } from "@/edgar/splits";
import { unavailableSplitEvidence } from "@/providers/splitEvents";
import { PRETAX_EXCLUDING_EQUITY_METHOD_TAG, COSTS_AND_EXPENSES_TAG } from "@/edgar/tagSynonyms";
import { labelCopiesOf, sameFilingVerdict } from "./computation";
import { representationLabelled, type PairChoice, oneBasisPair, describeChangePct } from "@/edgar/presentationLineage";
import { RESTATEMENT_THRESHOLD_PCT } from "./types";


// ---------------------------------------------------------------------------
// Fiscal calendar discovery
// ---------------------------------------------------------------------------

interface FiscalYear {
  end: string;
  /** Start of the fiscal year, from the anchor duration point; null when unknown. */
  start: string | null;
}

/** Newest-first, near-duplicate ends merged (a 53rd week moves an end by days). */
function mergeEndsDesc(ends: Iterable<string>, prefer?: ReadonlySet<string>): string[] {
  const sorted = [...new Set(ends)].sort((a, b) => b.localeCompare(a));
  const kept: string[] = [];
  for (const end of sorted) {
    const last = kept[kept.length - 1];
    if (last !== undefined && withinDays(end, last, TOLERANCE_DAYS)) {
      // Keep the fiscal-year end of a cluster rather than an adjacent instant.
      if (prefer !== undefined && prefer.has(end) && !prefer.has(last)) kept[kept.length - 1] = end;
      continue;
    }
    kept.push(end);
  }
  return kept;
}

function discoverFiscalYears(index: FactIndex): FiscalYear[] {
  const ends = new Set<string>();
  const starts = new Map<string, { start: string; duration: number; filed: string }>();
  for (const tag of FY_ANCHOR_DURATION_TAGS) {
    const up = pickUnitPoints(index, tag, "money");
    if (up === null) continue;
    // Iterate the REPORTERS, not the dedup winners: a period first reported on a 10-K but
    // later carried as a comparative in a 10-Q would otherwise stop looking like a year end.
    for (const p of up.reporters.values()) {
      if (!ANNUAL_FORMS.has(p.form.trim())) continue;
      const d = durationDays(p);
      if (d === null || d < ANNUAL_MIN_DAYS || d > ANNUAL_MAX_DAYS) continue;
      ends.add(p.end);
      const cur = starts.get(p.end);
      if (cur === undefined || d > cur.duration || (d === cur.duration && p.filed > cur.filed)) {
        starts.set(p.end, { start: p.start as string, duration: d, filed: p.filed });
      }
    }
  }
  const assets = pickUnitPoints(index, "Assets", "money");
  if (assets !== null) {
    for (const p of assets.reporters.values()) {
      if (p.start !== undefined || !ANNUAL_FORMS.has(p.form.trim())) continue;
      ends.add(p.end);
    }
  }
  return mergeEndsDesc(ends).map((end) => {
    const exact = starts.get(end);
    if (exact !== undefined) return { end, start: exact.start };
    // The merge may have kept a neighbouring end; reuse a start within tolerance.
    let best: { start: string; duration: number } | null = null;
    for (const [key, value] of starts) {
      if (!withinDays(key, end, TOLERANCE_DAYS)) continue;
      if (best === null || value.duration > best.duration) best = value;
    }
    return { end, start: best?.start ?? null };
  });
}

function discoverQuarterEnds(index: FactIndex, fiscalYearEnds: ReadonlySet<string>): string[] {
  const ends = new Set<string>(fiscalYearEnds);
  const assets = pickUnitPoints(index, "Assets", "money");
  if (assets !== null) {
    for (const p of assets.reporters.values()) {
      if (p.start !== undefined || !QUARTERLY_FORMS.has(p.form.trim())) continue;
      ends.add(p.end);
    }
  }
  return mergeEndsDesc(ends, fiscalYearEnds);
}

interface QuarterContext {
  end: string;
  /** Start of the fiscal year containing `end`; null when no anchor spans it. */
  fyStart: string | null;
  /** End of that fiscal year (used for the fiscal-year label). */
  fyEnd: string | null;
  isFiscalYearEnd: boolean;
  /** Nearest earlier quarter end 70-110 days back; null at the oldest quarter. */
  previousEnd: string | null;
}

/**
 * The fiscal-year window containing `q`: the longest anchor duration point (FY
 * first reported on an annual form, or year-to-date) whose [start, end] brackets `q`. When nothing
 * brackets it, the previous quarter end + 1 day is used as the window start so a
 * year-to-date difference can still be attempted.
 */
function fiscalWindowFor(index: FactIndex, q: string, previousEnd: string | null): { start: string | null; end: string | null } {
  let best: { start: string; end: string; duration: number } | null = null;
  for (const tag of FY_ANCHOR_DURATION_TAGS) {
    const up = pickUnitPoints(index, tag, "money");
    if (up === null) continue;
    for (const p of up.points) {
      const d = durationDays(p);
      if (p.start === undefined || d === null || d > ANNUAL_MAX_DAYS) continue;
      // A 10-Q can also report rolling twelve-month income on its cash-flow
      // statement. Its start is not the fiscal-year start: using it as one
      // suppresses valid YTD differences. Consult the original reporter so a
      // genuine annual period refiled as a later 10-Q comparative still counts.
      if (d >= ANNUAL_MIN_DAYS && !ANNUAL_FORMS.has(reporterFor(up, p).form.trim())) continue;
      if (daysBetween(p.start, q) < -TOLERANCE_DAYS || daysBetween(q, p.end) < -TOLERANCE_DAYS) continue;
      if (best === null || d > best.duration) best = { start: p.start, end: p.end, duration: d };
    }
  }
  if (best !== null) return { start: best.start, end: best.duration >= ANNUAL_MIN_DAYS ? best.end : null };
  if (previousEnd !== null) {
    return { start: new Date(dateMs(previousEnd) + DAY_MS).toISOString().slice(0, 10), end: null };
  }
  return { start: null, end: null };
}

function buildQuarterContexts(index: FactIndex, quarterEnds: string[], fiscalYearEnds: ReadonlySet<string>): QuarterContext[] {
  const isFyEnd = (end: string): boolean => [...fiscalYearEnds].some((f) => withinDays(f, end, TOLERANCE_DAYS));
  return quarterEnds.map((end, i) => {
    let previousEnd: string | null = null;
    for (let j = i + 1; j < quarterEnds.length; j += 1) {
      const gap = daysBetween(quarterEnds[j] as string, end);
      if (gap >= QUARTER_MIN_DAYS && gap <= QUARTER_MAX_DAYS) {
        previousEnd = quarterEnds[j] as string;
        break;
      }
      if (gap > QUARTER_MAX_DAYS) break;
    }
    const window = fiscalWindowFor(index, end, previousEnd);
    // Prefer a discovered fiscal-year end at or after this quarter for labelling.
    const laterFyEnds = [...fiscalYearEnds].filter((f) => daysBetween(end, f) >= -TOLERANCE_DAYS).sort();
    return {
      end,
      fyStart: window.start,
      fyEnd: laterFyEnds[0] ?? window.end,
      isFiscalYearEnd: isFyEnd(end),
      previousEnd,
    };
  });
}

// ---------------------------------------------------------------------------
// Tag resolvers per period kind
// ---------------------------------------------------------------------------

function annualResolver(index: FactIndex, fy: FiscalYear): TagResolver {
  return (tag, kind, currency) => {
    const up = pickUnitPoints(index, tag, kind, currency);
    if (up === null) return null;
    const p = findDurationForAnnual(up.points, fy.start, fy.end);
    return p === null ? null : resolvedPoint(tag, up, p, p.val);
  };
}

function instantResolver(index: FactIndex, end: string): TagResolver {
  return (tag, kind, currency) => {
    const up = pickUnitPoints(index, tag, kind, currency);
    if (up === null) return null;
    const p = findInstant(up.points, end);
    return p === null ? null : resolvedPoint(tag, up, p, p.val);
  };
}

/**
 * The builder and provider fill evaluate the identical D-98 chain, including its component floor
 * (D-147).
 */
function resolveLongTermInvestments(resolve: TagResolver, notes: NoteSink, label: string, at?: ResolveAt): Resolved | null {
  return resolveSpec(BALANCE_CHAINS.longTermInvestments!, resolve, notes, label, at);
}

export function longTermInvestmentsChainAt(facts: CompanyFacts, date: string, unit: string, observedAt: string): {
  value: number; evidence: StatementFieldProvenance; notes: string[];
  components: { label: string; value: number; tags: string[] }[]; absent: string[];
} | null {
  const cutoff = observedAt.slice(0, 10);
  const index = buildFactIndex(facts, { splits: discoverStockSplits(facts, { asOf: cutoff, vendor: unavailableSplitEvidence("investment chain", "no share fields consumed") }), day: cutoff, withheld: [] }, cutoff, []);
  const notes = createNoteSink();
  const resolve = instantResolver(index, date);
  const hit = resolveLongTermInvestments((tag, kind) => resolve(tag, kind, unit), notes, `longTermInvestments ${date}`);
  if (hit === null) return null;
  const filings = [...new Map((hit.evidencePoints ?? [hit.point]).map(p => [p.accn, filingRef(p)])).values()];
  return { value: hit.value, evidence: { source: "edgar", unit: hit.unit, periodStart: null, periodEnd: date,
    observedAt, tags: hit.tags.map(tag => `us-gaap/${tag}`), filings }, notes: notes.notes,
    components: hit.componentDetails?.present ?? [{ label: "long-term investments", value: hit.value, tags: hit.tags }], absent: hit.componentDetails?.absent ?? [] };
}

/** D-147: This is a house arithmetic tolerance, not an accounting materiality threshold. */
export const EQUITY_METHOD_PLACEMENT_TOLERANCE = { relative: 0.001, absolute: 1_000_000 } as const;

function equityMethodPlacement(
  resolutions: ReadonlyMap<string, Resolved>, resolve: TagResolver, instant: TagResolver | undefined, notes: NoteSink,
): EquityMethodIncomePlacement | undefined {
  const operating = resolutions.get("operatingIncome");
  if (operating === undefined) return undefined; // A presentation-refused OI must not be re-derived.
  const income = resolutions.get("equityMethodIncomeLoss")?.value ?? null;
  const pretax = resolutions.get("incomeBeforeTax")?.value ?? null;
  let refused = false;
  const money = (tag: string): number | null => {
    const before = notes.presentationRefusals.length;
    const attempts = notes.withholdAttempts.length;
    const hit = notes.quietly(() => resolve(tag, "money"));
    refused ||= notes.presentationRefusals.length > before || notes.withholdAttempts.length > attempts;
    notes.presentationRefusals.length = before;
    notes.withholdAttempts.length = attempts;
    return hit?.value ?? null;
  };
  const result = (placement: EquityMethodIncomePlacement["placement"], basis: string): EquityMethodIncomePlacement => ({ placement, income, basis });
  const tolerance = Math.max(EQUITY_METHOD_PLACEMENT_TOLERANCE.absolute, EQUITY_METHOD_PLACEMENT_TOLERANCE.relative * Math.abs(pretax ?? 0));
  if (income !== null && Math.abs(income) <= tolerance) return result("immaterial", "Filed equity-method income is within the placement tolerance of zero; it takes the base window's measured placement.");
  if (operating.adjustments !== undefined) {
    const { amounts, baseTags } = operating.adjustments;
    if (amounts.IncomeLossFromEquityMethodInvestments !== undefined) return result("below-operating-income", "The EBIT derivation subtracted the filed equity-method income.");
    if (baseTags.includes(PRETAX_EXCLUDING_EQUITY_METHOD_TAG)) {
      const revenue = money("Revenues");
      const costs = money(COSTS_AND_EXPENSES_TAG);
      return result(!refused && income !== null && revenue !== null && costs !== null && pretax !== null && Math.abs(revenue - costs - pretax) <= tolerance
        ? "in-operating-income" : "below-operating-income", "Pretax element excludes equity-method income by definition; revenue less costs is tested for income already inside revenue.");
    }
    const stake = instant?.("EquityMethodInvestments", "money", operating.unit)?.value ?? null;
    if (income === null && stake !== null && stake > 0) return result("in-operating-income", "Derived EBIT could not subtract untagged equity-method income; its filed stake stays in operating capital.");
    return income === null ? undefined : result("undetermined", "The EBIT derivation did not establish the equity-method income's scope.");
  }
  if (income === null) return undefined;
  const aggregate = money("NonoperatingIncomeExpense");
  const below = aggregate ?? ((money("OtherNonoperatingIncomeExpense") ?? 0) + (money("InvestmentIncomeInterest") ?? 0));
  const interest = money("InterestExpense") ?? money("InterestAndDebtExpense") ?? 0;
  if (refused || pretax === null) return result("undetermined", "A placement operand is unavailable or withheld for presentation; its absence is not a zero.");
  const rest = pretax - operating.value - below + interest;
  if (Math.abs(rest) <= tolerance) return result(aggregate === null ? "in-operating-income" : "undetermined", aggregate === null
    ? "Component arithmetic reconciles pretax to operating income without a separate equity-method result."
    : "The nonoperating aggregate can itself hold equity-method income; a reconciliation cannot establish inclusion in operating income.");
  if (Math.abs(rest - income) <= tolerance) return result("below-operating-income", "Pretax less operating income and the other filed components reconciles to equity-method income.");
  return result("undetermined", "Filed components do not establish the equity-method income's placement.");
}

function decimalsFor(kind: UnitKind): number {
  return kind === "perShare" ? PER_SHARE_DECIMALS : MONEY_DECIMALS;
}

/** The three 3-month points preceding an FY end, all required, from one filing lineage. */
function precedingQuarterPoints(points: FactPoint[], ctx: QuarterContext, quarterEnds: string[]): FactPoint[] | null {
  const out: FactPoint[] = [];
  let cursor = ctx.previousEnd;
  for (let i = 0; i < 3; i += 1) {
    if (cursor === null) return null;
    const p = findByDurationDays(points, cursor, QUARTER_MIN_DAYS, QUARTER_MAX_DAYS);
    if (p === null) return null;
    out.push(p);
    const idx = quarterEnds.indexOf(cursor);
    cursor = null;
    for (let j = idx + 1; j < quarterEnds.length && idx >= 0; j += 1) {
      const gap = daysBetween(quarterEnds[j] as string, quarterEnds[idx] as string);
      if (gap >= QUARTER_MIN_DAYS && gap <= QUARTER_MAX_DAYS) {
        cursor = quarterEnds[j] as string;
        break;
      }
      if (gap > QUARTER_MAX_DAYS) break;
    }
  }
  return out;
}

/**
 * The quarterly period algorithm.
 *
 *  (a) a tagged 3-month fact ending at the quarter (skipped when `ytdOnly`,
 *      because 10-Q cash-flow facts are year-to-date by construction);
 *  (c) at a fiscal-year end: FY - year-to-date-through-the-previous-quarter,
 *      else FY - (Q1 + Q2 + Q3) when all three 3-month facts exist;
 *  (b) otherwise the year-to-date difference — and, in the first quarter of a
 *      fiscal year, the year-to-date fact IS the quarter.
 *
 * Weighted share counts are never subtracted (a share count is a stock, not a
 * flow); per-share amounts use (a) only. A fourth-quarter EPS is rebuilt after
 * the rows are built (deriveFourthQuarterPerShare), never by FY − YTD.
 */
function quarterResolver(
  index: FactIndex,
  ctx: QuarterContext,
  quarterEnds: string[],
  ytdOnly: boolean,
  notes: NoteSink,
): TagResolver {
  const resolveQuarter: TagResolver = (tag, kind, currency, magnitudeArg) => {
    const magnitudeOnly = magnitudeArg !== undefined && magnitudeArg !== false;
    const up = pickUnitPoints(index, tag, kind, currency);
    if (up === null) return null;
    const pts = up.points;
    const decimals = decimalsFor(kind);

    if (!ytdOnly) {
      const threeMonth = findByDurationDays(pts, ctx.end, QUARTER_MIN_DAYS, QUARTER_MAX_DAYS);
      if (threeMonth !== null) return resolvedPoint(tag, up, threeMonth, threeMonth.val);
    }
    if (kind === "shares") return null;

    /** Every operand of a difference comes from the minuend's own filing lineage. */
    const lineage = (minuend: FactPoint): FactPoint[] => lineagePoints(up, minuend.filed);
    const refuse = (minuend: FactPoint, what: string): null => {
      notes.add(
        `${tag} ${ctx.end}: ${what} not derived — no ${
          ctx.isFiscalYearEnd ? "year-to-date" : "prior year-to-date"
        } fact filed on or before the ${minuend.form.trim()} of ${minuend.filed} (accession ${minuend.accn}) that reported the minuend, so the difference would mix two filing lineages`,
      );
      return null;
    };
    /*
     * D-134: `oneBasisPair` chooses operands on one presentation or explains why no pair is
     * admissible. A withheld pair records both a note and a refusal, leaving the field as a
     * disclosed withholding.
     */
    const labelCopies = labelCopiesOf(index);
    const labelled = (m: FactPoint): boolean => representationLabelled(labelCopies, m, RESTATEMENT_THRESHOLD_PCT);
    const choose = (winner: FactPoint, subtrahendsFor: (m: FactPoint) => readonly FactPoint[] | null): PairChoice<FactPoint> => {
      if (magnitudeOnly) {
        const subs = subtrahendsFor(winner);
        return subs === null ? { kind: "none" } : { kind: "pair", minuend: winner, subtrahends: subs, basis: "as-filed", refiledBy: null, refiledAs: null };
      }
      return oneBasisPair(up.all, winner, subtrahendsFor, RESTATEMENT_THRESHOLD_PCT, labelled);
    };
    const withheldNote = (choice: Extract<PairChoice<FactPoint>, { kind: "withheld" }>, what: string): null => {
      notes.add(`${tag} ${ctx.end}: ${what} not derived — ${choice.reason}`);
      notes.refusePresentation(`${tag} ${ctx.end}: ${choice.reason}`);
      return null;
    };
    const firstReportedNote = (choice: Extract<PairChoice<FactPoint>, { kind: "pair" }>, noun: string, subtrahend: string): void => {
      if (choice.basis !== "first-reported" || choice.refiledBy === null) return;
      const by = choice.refiledBy;
      const movedPct = choice.minuend.val === 0 ? null : ((by.val - choice.minuend.val) / Math.abs(choice.minuend.val)) * 100;
      const how =
        choice.refiledAs === "labelled-representation"
          ? "as a re-presentation it labels with a discontinued-operations line"
          : `by a change within 1% (${describeChangePct(movedPct, 4)})`;
      notes.add(
        `${tag} ${ctx.end}: derived from the first-reported ${noun} (${choice.minuend.form.trim()} ${choice.minuend.filed}), because ${by.form.trim()} ${by.filed} re-filed it ${how} and the ${subtrahend} it would be netted against was not re-filed with it`,
      );
    };

    if (ctx.isFiscalYearEnd) {
      const fy =
        (ctx.fyStart !== null ? findDurationExact(pts, ctx.fyStart, ctx.end) : null) ?? findAnnualDuration(pts, ctx.end);
      if (fy === null || fy.start === undefined) return null;
      // Per-share amounts are not additive across periods with different share
      // counts (FY EPS − nine-month EPS is not the fourth quarter's EPS); the
      // fourth quarter's EPS is rebuilt from its net income and a share count
      // backed out of the day-weighted identity (deriveFourthQuarterPerShare).
      if (kind === "perShare") return null;
      // A year-to-date fact through the previous quarter exists in some filing: the difference is FY − YTD, and
      // a copy that only a later filing carries is disclosed rather than silently mixed.
      if (ctx.previousEnd !== null && findDurationExact(pts, fy.start, ctx.previousEnd) !== null) {
        const choice = choose(fy, (m) => {
          const y = findDurationExact(lineage(m), m.start!, ctx.previousEnd!);
          return y === null ? null : [y];
        });
        if (choice.kind === "none") return refuse(fy, "FY − YTD");
        if (choice.kind === "withheld") return withheldNote(choice, "FY − YTD");
        firstReportedNote(choice, "FY", "year to date");
        const ytdPrev = choice.subtrahends[0]!;
        return {
          ...resolvedPoint(tag, up, choice.minuend, tidy(choice.minuend.val - ytdPrev.val, decimals)),
          derivation: "fy-minus-ytd",
          derivedFrom: [describePoint(tag, choice.minuend), describePoint(tag, ytdPrev)],
          evidencePoints: [choice.minuend, ytdPrev],
          flowOperands: [{ tag: `us-gaap/${tag}`, points: [choice.minuend, ytdPrev] }],
          periodStart: new Date(dateMs(ytdPrev.end) + DAY_MS).toISOString().slice(0, 10),
        };
      }
      const choice = choose(fy, (m) => precedingQuarterPoints(lineage(m), ctx, quarterEnds));
      if (choice.kind === "none") {
        return precedingQuarterPoints(pts, ctx, quarterEnds) === null ? null : refuse(fy, "FY − (Q1+Q2+Q3)");
      }
      if (choice.kind === "withheld") return withheldNote(choice, "FY − (Q1+Q2+Q3)");
      firstReportedNote(choice, "FY", "quarters");
      const sum = choice.subtrahends.reduce((total, p) => total + p.val, 0);
      return {
        ...resolvedPoint(tag, up, choice.minuend, tidy(choice.minuend.val - sum, decimals)),
        derivation: "fy-minus-quarters",
        derivedFrom: [describePoint(tag, choice.minuend), ...choice.subtrahends.map((p) => describePoint(tag, p))],
        evidencePoints: [choice.minuend, ...choice.subtrahends],
        flowOperands: [{ tag: `us-gaap/${tag}`, points: [choice.minuend, ...choice.subtrahends] }],
        periodStart: new Date(dateMs(choice.subtrahends[0]!.end) + DAY_MS).toISOString().slice(0, 10),
      };
    }

    if (kind === "perShare" || ctx.fyStart === null) return null;
    const ytd = findDurationExact(pts, ctx.fyStart, ctx.end);
    if (ytd === null || ytd.start === undefined) return null;
    // First quarter of the fiscal year: the year-to-date fact IS the quarter.
    if (daysBetween(ctx.fyStart, ctx.end) <= QUARTER_MAX_DAYS) return resolvedPoint(tag, up, ytd, ytd.val);
    if (ctx.previousEnd === null) return null;
    if (findDurationExact(pts, ytd.start, ctx.previousEnd) === null) return null;
    const choice = choose(ytd, (m) => {
      const y = findDurationExact(lineage(m), m.start!, ctx.previousEnd!);
      return y === null ? null : [y];
    });
    if (choice.kind === "none") return refuse(ytd, "YTD difference");
    if (choice.kind === "withheld") return withheldNote(choice, "YTD difference");
    firstReportedNote(choice, "year to date", "prior year to date");
    const prior = choice.subtrahends[0]!;
    return {
      ...resolvedPoint(tag, up, choice.minuend, tidy(choice.minuend.val - prior.val, decimals)),
      derivation: "ytd-difference",
      derivedFrom: [describePoint(tag, choice.minuend), describePoint(tag, prior)],
      evidencePoints: [choice.minuend, prior],
      flowOperands: [{ tag: `us-gaap/${tag}`, points: [choice.minuend, prior] }],
      periodStart: new Date(dateMs(prior.end) + DAY_MS).toISOString().slice(0, 10),
    };
  };

  /*
   * D-134: A magnitude probe naming its candidate also obtains a same-filing floor verdict; a
   * presentation-refused floor still constrains the candidate.
   */
  return (tag, kind, currency, magnitudeArg) => {
    const r = resolveQuarter(tag, kind, currency, magnitudeArg);
    if (r === null || typeof magnitudeArg !== "object") return r;
    const verdict = sameFilingVerdict(index, ctx, tag, magnitudeArg.against, kind, currency);
    return verdict === null ? r : { ...r, sameFiling: verdict };
  };
}
export { type QuarterContext, resolveLongTermInvestments, decimalsFor, equityMethodPlacement, discoverFiscalYears, discoverQuarterEnds, mergeEndsDesc, buildQuarterContexts, type FiscalYear, instantResolver, quarterResolver, annualResolver };
