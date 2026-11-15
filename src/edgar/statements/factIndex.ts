/** Cutoff-filtered facts, units and filing lineage; never use evidence after the cutoff (P2; D-53, D-97). */
import { type FactPoint, dedupByPeriod, type CompanyFacts, conceptFactsSchema, filterToCoreForms, parseFactPoints } from "@/edgar/xbrl";
import { firstReportedOrder } from "@/edgar/presentationLineage";
import { type ChainSpec, FY_ANCHOR_DURATION_TAGS, INCOME_CHAINS, BALANCE_CHAINS, CASHFLOW_CHAINS, BANK_REVENUE_SPEC, BANK_INTEREST_INCOME_SPEC, type UnitKind } from "./fieldSpecs";
import { NONSERVICE_BENEFIT_EXPENSE_TAG, NET_INTEREST_NONOPERATING_TAG, TOTAL_INCOME_EXPENSE_TAGS, BALANCE_SHEET_SHARES_TAG, tagsFor } from "@/edgar/tagSynonyms";
import { ADDITIONAL_OPERATING_COST_TAGS } from "../revenuePresentation";
import { type StockSplits, shareBasisFactor } from "@/edgar/splits";
import { type ShareBasisWithheld, type StatementFactExclusion } from "./types";
import { tidy, PER_SHARE_DECIMALS, dateMs, ANNUAL_FORMS, durationDays, ANNUAL_MIN_DAYS, ANNUAL_MAX_DAYS, withinDays, TOLERANCE_DAYS } from "./periodMath";


// ---------------------------------------------------------------------------
// Fact index
// ---------------------------------------------------------------------------

interface UnitPoints {
  unit: string;
  /** Deduped: the max(filed) winner per period. This is where a VALUE comes from. */
  points: FactPoint[];
  /*
   * D-13, D-134: Use the newest filed copy for the value and the first core-form copy for the
   * period labels. A later filing can carry a comparative whose `fy`, `fp`, `form` and `filed`
   * describe that later filing rather than the fact period. Keep all copies for filing-lineage
   * checks.
   */
  reporters: Map<string, FactPoint>;
  /**
   * EVERY core-form copy of this (tag, unit), deduped by nothing: a derived
   * quarter needs the copy of its subtrahend that belongs to the SAME filing
   * lineage as its minuend, which the max(filed) winner is not when only one of
   * the two was restated (see `lineagePoints`).
   */
  all: FactPoint[];
}
type FactIndex = Map<string, UnitPoints[]>;

/*
 * D-134: For a filing cutoff, deduplicate only core copies filed no later than that cutoff. Never
 * subtract a YTD copy restated after the annual minuend. A material unlabelled re-filing withholds
 * the quarter through `oneBasisPair` rather than mixing presentations.
 */
function lineagePoints(up: UnitPoints, filedCutoff: string): FactPoint[] {
  return dedupByPeriod(up.all.filter((p) => p.filed <= filedCutoff));
}

/** Dedup/grouping key: durations by (start, end), instants by end. Mirrors dedupByPeriod. */
function periodKey(p: FactPoint): string {
  return `${p.start ?? ""}|${p.end}`;
}

/** The filing that first reported a point's period; the point itself when it stands alone. */
function reporterFor(up: UnitPoints, p: FactPoint): FactPoint {
  return up.reporters.get(periodKey(p)) ?? p;
}

/** Earliest `filed` wins; ties prefer the original over an amendment, then the lower accession. */
function buildReporters(corePoints: FactPoint[]): Map<string, FactPoint> {
  const reporters = new Map<string, FactPoint>();
  for (const p of corePoints) {
    const key = periodKey(p);
    const cur = reporters.get(key);
    if (cur === undefined || firstReportedOrder(p, cur) < 0) reporters.set(key, p);
  }
  return reporters;
}

function collectTags(spec: ChainSpec, into: Set<string>): void {
  if (spec.kind === "chain") {
    for (const step of spec.steps) collectTags(step, into);
    return;
  }
  if (spec.kind === "sumAnyOf" || spec.kind === "sumAll") {
    for (const part of spec.parts) collectTags(part.spec, into);
    // An optional subtrahend is only ever resolved by tag, so its tags have to
    // be parsed into the index like any other.
    if (spec.kind === "sumAll") {
      for (const adjustment of spec.minusAny ?? []) for (const tag of adjustment.tags) into.add(tag);
    }
    return;
  }
  if (spec.kind === "diff") {
    into.add(spec.plus);
    into.add(spec.minus);
    return;
  }
  for (const tag of spec.tags) into.add(tag);
  // A floor tag is only ever resolved by tag, so it has to be parsed into the index.
  if (spec.kind === "first") for (const tag of [...(spec.unlessBelow ?? []), ...Object.values(spec.unlessBelowTag ?? {}).flat()]) into.add(tag);
}

/** Every us-gaap tag any chain or anchor can ask for; nothing else is parsed. */
const NEEDED_US_GAAP_TAGS: ReadonlySet<string> = (() => {
  const tags = new Set<string>(FY_ANCHOR_DURATION_TAGS);
  tags.add("Assets");
  tags.add(NONSERVICE_BENEFIT_EXPENSE_TAG);
  // Independent operating reconciliation reads the signed aggregate without
  // substituting gross interest income or cash interest paid.
  tags.add(NET_INTEREST_NONOPERATING_TAG);
  for (const tag of TOTAL_INCOME_EXPENSE_TAGS) tags.add(tag);
  for (const tag of ADDITIONAL_OPERATING_COST_TAGS) tags.add(tag);
  // Not in any chain: the share-count fallback below reads it directly.
  tags.add(BALANCE_SHEET_SHARES_TAG);
  for (const table of [INCOME_CHAINS, BALANCE_CHAINS, CASHFLOW_CHAINS]) {
    for (const spec of Object.values(table)) collectTags(spec, tags);
  }
  collectTags(BANK_REVENUE_SPEC, tags);
  collectTags(BANK_INTEREST_INCOME_SPEC, tags);
  // Completeness/scope evidence only, never carrying-value stand-ins.
  tags.add("DebtInstrumentCarryingAmount");
  tags.add("ConvertibleLongTermNotesPayable");
  tags.add("LongTermDebtMaturitiesRepaymentsOfPrincipalRemainderOfFiscalYear");
  return tags;
})();

/** Cover-page share count; stated once per class of registered common stock. */
const DEI_SHARES_TAG = tagsFor("deiSharesOutstanding")[0] as string;
const DEI_PUBLIC_FLOAT_TAG = tagsFor("deiPublicFloat")[0] as string;
const NEEDED_DEI_TAGS = new Set([DEI_SHARES_TAG, DEI_PUBLIC_FLOAT_TAG]);

function unitMatches(unit: string, kind: UnitKind): boolean {
  if (kind === "money") return /^[A-Z]{3}$/.test(unit);
  if (kind === "perShare") return unit.endsWith("/shares");
  return unit === "shares";
}

/** Where the split basis of a share or per-share point is decided, and what was left out. */
interface ShareBasisContext {
  splits: StockSplits;
  day: string;
  withheld: ShareBasisWithheld[];
}

/**
 * Put every per-share and share-count point on the share basis of the session
 * `ctx.day` (see src/edgar/splits.ts). Applied to each point by its OWN filing
 * date, before the max(filed) dedup, so a period restated in a post-split
 * filing is scaled once (by 1) and a period only ever filed pre-split is
 * scaled by the splits since. A point whose side of a split cannot be
 * established is LEFT OUT (and recorded), so the dedup falls to a filing of
 * that period whose basis is known, or the field stays empty; it is never
 * published on a guessed basis. A cover-page count is a count as of its own
 * date (`measured`). Money facts are untouched.
 */
function toShareBasis(points: FactPoint[], concept: string, unit: string, ctx: ShareBasisContext): FactPoint[] {
  const perShare = unitMatches(unit, "perShare");
  const shares = unitMatches(unit, "shares");
  if (!perShare && !shares) return points;
  const pointInTime = concept === `dei:${DEI_SHARES_TAG}`;
  return points.flatMap((p) => {
    if (!Number.isFinite(p.val)) return [p];
    const basis = shareBasisFactor(ctx.splits, p.filed, pointInTime ? p.end : null, ctx.day);
    if ("withheld" in basis) {
      ctx.withheld.push({ concept, end: p.end, filed: p.filed, reason: basis.withheld });
      return [];
    }
    if (basis.factor === 1) return [p];
    const val = perShare ? tidy(p.val / basis.factor, PER_SHARE_DECIMALS) : Math.round(p.val * basis.factor);
    return [{ ...p, val }];
  });
}

/**
 * Parse -> split adjustment -> core-form filter -> per-period max(filed), once
 * per (tag, unit). Unit entries are ordered USD-first then alphabetically so a
 * filer reporting in two currencies resolves deterministically.
 */
function buildFactIndex(facts: CompanyFacts, ctx: ShareBasisContext, asOf: string, exclusions: StatementFactExclusion[]): FactIndex {
  const index: FactIndex = new Map();
  const namespaces: [string, string, ReadonlySet<string>][] = [
    ["us-gaap", "", NEEDED_US_GAAP_TAGS],
    ["dei", "dei:", NEEDED_DEI_TAGS],
  ];
  for (const [namespace, prefix, wanted] of namespaces) {
    const concepts = facts.facts[namespace];
    if (concepts === undefined || concepts === null || typeof concepts !== "object") continue;
    for (const [tag, raw] of Object.entries(concepts)) {
      if (!wanted.has(tag)) continue;
      const parsed = conceptFactsSchema.safeParse(raw);
      if (!parsed.success) continue;
      const entries: UnitPoints[] = [];
      for (const [unit, rawPoints] of Object.entries(parsed.data.units)) {
        if (!Array.isArray(rawPoints)) continue;
        const cutoff = asOf.slice(0, 10);
        const validDay = (day: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(dateMs(day)) && new Date(dateMs(day)).toISOString().slice(0, 10) === day;
        // Availability precedes split adjustment and dedup: a future comparative
        // must not replace the observation that was actually public at analysis.
        const available = filterToCoreForms(parseFactPoints(rawPoints)).filter((p) => {
          const reason = !validDay(cutoff) || !validDay(p.filed) || !validDay(p.end) || (p.start !== undefined && !validDay(p.start))
            ? "invalid_date" : p.filed > cutoff ? "future_filing" : p.end > cutoff ? "future_period" : null;
          if (reason === null) return true;
          exclusions.push({ concept: `${namespace}:${tag}`, unit, ...(p.start === undefined ? {} : { start: p.start }), end: p.end, filed: p.filed, accn: p.accn, value: p.val, reason });
          return false;
        });
        const core = toShareBasis(available, prefix + tag, unit, ctx);
        const points = dedupByPeriod(core);
        if (points.length > 0) entries.push({ unit, points, reporters: buildReporters(core), all: core });
      }
      if (entries.length === 0) continue;
      entries.sort((a, b) => (a.unit === "USD" ? -1 : b.unit === "USD" ? 1 : a.unit.localeCompare(b.unit)));
      index.set(prefix + tag, entries);
    }
  }
  return index;
}

/** D-148: prefer the newest annual filing's broadest anchor coverage. */
function presentationCurrency(index: FactIndex): string | null {
  const anchors = [...new Set([...FY_ANCHOR_DURATION_TAGS, "Assets"])];
  const cells = anchors.flatMap(tag => (index.get(tag) ?? []).filter(up => unitMatches(up.unit, "money"))
    .flatMap(up => up.all.filter(p => ANNUAL_FORMS.has(p.form.trim())).map(p => ({ unit: up.unit, point: p }))));
  if (cells.length === 0) return null;
  const newest = cells.map(c => `${c.point.filed}|${c.point.accn}`).sort().at(-1)!;
  const units = [...new Set(cells.map(c => c.unit))];
  const coverage = (unit: string) => new Set(cells.filter(c => c.unit === unit && `${c.point.filed}|${c.point.accn}` === newest).map(c => c.point.end)).size;
  const total = (unit: string) => cells.filter(c => c.unit === unit).length;
  return units.sort((a, b) => coverage(b) - coverage(a) || total(b) - total(a) || (a === "USD" ? -1 : b === "USD" ? 1 : a.localeCompare(b)))[0]!;
}

function otherUnitAnnualNotes(index: FactIndex, unit: string): string[] {
  const ends = new Map<string, Set<string>>();
  for (const tag of [...new Set([...FY_ANCHOR_DURATION_TAGS, "Assets"])]) {
    for (const up of index.get(tag) ?? []) {
      if (!unitMatches(up.unit, "money")) continue;
      const dates = ends.get(up.unit) ?? new Set<string>();
      for (const p of up.all) {
        const duration = durationDays(p);
        if (ANNUAL_FORMS.has(p.form.trim()) && (tag === "Assets" || (duration !== null && duration >= ANNUAL_MIN_DAYS && duration <= ANNUAL_MAX_DAYS))) dates.add(p.end);
      }
      ends.set(up.unit, dates);
    }
  }
  const own = ends.get(unit) ?? new Set<string>();
  const notes: string[] = [];
  for (const [other, dates] of ends) {
    if (other === unit || dates.size === 0) continue;
    const shared = [...dates].filter(end => own.has(end)).sort();
    if (shared.length) notes.push(`convenience_unit: ${other} amounts for ${shared.join(", ")} sit beside the ${unit} statements (a convenience translation, Regulation S-X 3-20(b)) and are not used`);
    for (const end of [...dates].filter(end => !own.has(end)).sort()) notes.push(`mixed_unit: fiscal year ending ${end} is filed only in ${other}; the statements are in ${unit}; the year is withheld without a currency conversion`);
  }
  return notes;
}

function pickUnitPoints(index: FactIndex, tag: string, kind: UnitKind, currency?: string): UnitPoints | null {
  const entries = index.get(tag);
  if (entries === undefined) return null;
  return entries.find((e) => unitMatches(e.unit, kind) && (currency === undefined || kind === "shares" || e.unit === (kind === "perShare" ? `${currency}/shares` : currency))) ?? null;
}

// ---------------------------------------------------------------------------
// Period resolvers
// ---------------------------------------------------------------------------

/** Deterministic pick: closest end, then latest filed, then largest accession. */
function pickBest(candidates: FactPoint[], end: string): FactPoint | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0] ?? null;
  const target = dateMs(end);
  const sorted = [...candidates].sort((a, b) => {
    const da = Math.abs(dateMs(a.end) - target);
    const db = Math.abs(dateMs(b.end) - target);
    if (da !== db) return da - db;
    if (a.filed !== b.filed) return b.filed.localeCompare(a.filed);
    return b.accn.localeCompare(a.accn);
  });
  return sorted[0] ?? null;
}

/** Instant (balance-date) fact ending within tolerance of `end`. */
function findInstant(points: FactPoint[], end: string): FactPoint | null {
  return pickBest(
    points.filter((p) => p.start === undefined && withinDays(p.end, end, TOLERANCE_DAYS)),
    end,
  );
}

/** Duration fact whose own length falls in [minDays, maxDays] and ends near `end`. */
function findByDurationDays(points: FactPoint[], end: string, minDays: number, maxDays: number): FactPoint | null {
  return pickBest(
    points.filter((p) => {
      const d = durationDays(p);
      return d !== null && d >= minDays && d <= maxDays && withinDays(p.end, end, TOLERANCE_DAYS);
    }),
    end,
  );
}

/** Duration fact matching BOTH ends of an explicit [start, end] window. */
function findDurationExact(points: FactPoint[], start: string, end: string): FactPoint | null {
  return pickBest(
    points.filter(
      (p) => p.start !== undefined && withinDays(p.start, start, TOLERANCE_DAYS) && withinDays(p.end, end, TOLERANCE_DAYS),
    ),
    end,
  );
}

function findAnnualDuration(points: FactPoint[], end: string): FactPoint | null {
  return findByDurationDays(points, end, ANNUAL_MIN_DAYS, ANNUAL_MAX_DAYS);
}

/**
 * Annual-row lookup. The explicit window wins; when it misses (or no fiscal-year
 * start is known) any 300-400 day fact ending at the same fiscal year end is
 * accepted. That fallback exists because a restating filing can shift a concept's
 * context start by more than the 3-day tolerance while the year end is unchanged.
 */
function findDurationForAnnual(points: FactPoint[], start: string | null, end: string): FactPoint | null {
  if (start !== null) {
    const exact = findDurationExact(points, start, end);
    if (exact !== null) return exact;
  }
  return findAnnualDuration(points, end);
}
export { type UnitPoints, reporterFor, collectTags, type FactIndex, pickUnitPoints, findDurationForAnnual, findInstant, buildFactIndex, findByDurationDays, lineagePoints, findDurationExact, findAnnualDuration, DEI_SHARES_TAG, presentationCurrency, otherUnitAnnualNotes, unitMatches, DEI_PUBLIC_FLOAT_TAG };
