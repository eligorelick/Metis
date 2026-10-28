/**
 * Derived quarters on one presentation (audit 2026-10-27 FIN-511, decision C-9).
 *
 * A quarter derived by subtraction (fiscal year less nine-month year to date, a
 * difference of two year-to-date figures, or the fiscal year less three
 * quarters) must net two figures that sit on one presentation. Filing-date
 * lineage (D-13) is the minimum; this module decides when it is not enough.
 * The statement builder and the vendor-enrichment derivation both call it, so
 * a derived value means the same thing in both. Pure: no I/O, no clock.
 *
 * See docs/METHODOLOGY.md "Derived quarters on one presentation" for the
 * rules and their sources (ASC 250-10-45-23, ASC 205-20-45-3, SEC FRM 13110.4).
 */

import type { FactPoint } from "@/edgar/xbrl";

/** The slice of a fact the pairing rules read. A `FactPoint` satisfies it. */
export interface LineageCopy {
  start?: string;
  end: string;
  val: number;
  accn: string;
  filed: string;
  form: string;
}

/** A copy of a discontinued-operations element, with its tag and unit (C-9 labels). */
export interface LabelCopy extends LineageCopy {
  tag: string;
  unit: string;
}

/** A FactPoint must stay usable wherever a LineageCopy is wanted (compile-time check only). */
export type FactPointIsALineageCopy = FactPoint extends LineageCopy ? true : never;

/** A signed percentage, or the reason there is none. */
export function describeChangePct(changePct: number | null, decimals = 2): string {
  return changePct === null
    ? "from zero — no percentage is defined against an original of 0"
    : `${changePct > 0 ? "+" : ""}${changePct.toFixed(decimals)}%`;
}

const isAmendment = (c: LineageCopy): boolean => c.form.trim().endsWith("/A");
const samePeriod = (a: LineageCopy, b: LineageCopy): boolean => a.end === b.end && (a.start ?? "") === (b.start ?? "");

/** Earliest filed first; on a same-day tie the original before an amendment, then the lower accession (buildReporters' order). */
export function firstReportedOrder(a: LineageCopy, b: LineageCopy): number {
  if (a.filed !== b.filed) return a.filed < b.filed ? -1 : 1;
  const aAmend = isAmendment(a);
  const bAmend = isAmendment(b);
  if (aAmend !== bAmend) return aAmend ? 1 : -1;
  if (a.accn === b.accn) return 0;
  return a.accn < b.accn ? -1 : 1;
}

/** The first-reported copy of `p`'s period (same start and end) among `copies`; `p` itself when it stands alone. */
export function firstReportedCopy<T extends LineageCopy>(copies: readonly T[], p: T): T {
  let best: T = p;
  for (const c of copies) {
    if (samePeriod(c, p) && firstReportedOrder(c, best) < 0) best = c;
  }
  return best;
}

/**
 * |later - first| > thresholdPct/100 x |first|, so a first-reported 0 that became non-zero counts. The one
 * materiality test of this module: `filingRepresented`, `representationLabelled` and rule 3 all call it.
 */
export function movedBeyond(first: LineageCopy, later: LineageCopy, thresholdPct: number): boolean {
  return Math.abs(later.val - first.val) > (thresholdPct / 100) * Math.abs(first.val);
}

/**
 * True when the filing CHANGED a period of this concept: it carries a copy of a period it did not first report
 * that `movedBeyond` the copy filed just before it. A filing that only repeats a recast an earlier filing made
 * (a 10-K carrying a prior year the previous 10-K had already re-presented) re-presented nothing, so the
 * nine-month figures filed after that earlier recast are on its basis (measured against the first-reported copy,
 * every later 10-K would count: American Tower's FY2023 revenue, recast once in the 10-K of 2025-02-25).
 * `exceptPeriod` leaves out the period under derivation: a minuend's filing re-presented EARLIER periods (an
 * amendment that corrects its own year re-presents nothing).
 */
export function filingRepresented(copies: readonly LineageCopy[], accn: string, thresholdPct: number, exceptPeriod?: LineageCopy): boolean {
  for (const c of copies) {
    if (c.accn !== accn || (exceptPeriod !== undefined && samePeriod(c, exceptPeriod))) continue;
    let before: LineageCopy | null = null;
    for (const x of copies) {
      if (x.accn !== accn && samePeriod(x, c) && firstReportedOrder(x, c) < 0 && (before === null || firstReportedOrder(x, before) > 0)) before = x;
    }
    if (before !== null && movedBeyond(before, c, thresholdPct)) return true;
  }
  return false;
}

/**
 * C-9: the re-filing labels its copy of `refiled`'s period a re-presentation for a discontinued operation
 * (ASC 205-20-45-3, 45-3A). Among `labelCopies` (every core copy of every discontinued-operations element),
 * some copy with `accn === refiled.accn`, the same start and end as `refiled`, and `val !== 0` either is its own
 * (tag, unit, period)'s first-reported copy (the line is new in the re-filing) or `movedBeyond` that copy.
 */
export function representationLabelled(labelCopies: readonly LabelCopy[], refiled: LineageCopy, thresholdPct: number): boolean {
  for (const l of labelCopies) {
    if (l.accn !== refiled.accn || !samePeriod(l, refiled) || l.val === 0) continue;
    const first = firstReportedCopy(
      labelCopies.filter((c) => c.tag === l.tag && c.unit === l.unit),
      l,
    );
    if (first.accn === l.accn || movedBeyond(first, l, thresholdPct)) return true;
  }
  return false;
}

const filingOf = (c: LineageCopy): string => `${c.form.trim()} of ${c.filed} (${c.accn})`;

/** The reason a minuend/subtrahend pair nets two presentations, or null when they share one (FIN-511 (b)). */
export function presentationMixed(
  copies: readonly LineageCopy[],
  minuend: LineageCopy,
  subtrahends: readonly LineageCopy[],
  thresholdPct: number,
): string | null {
  if (!filingRepresented(copies, minuend.accn, thresholdPct, minuend)) return null;
  const other = subtrahends.find((s) => !filingRepresented(copies, s.accn, thresholdPct));
  if (other === undefined) return null;
  return (
    `presentation changed in ${minuend.form.trim()} ${minuend.filed} (${minuend.accn}): that filing re-presented earlier periods of this concept ` +
    `and the ${filingOf(other)} that supplies the subtrahend did not, so the difference would net two bases`
  );
}

export type PairChoice<T> =
  | {
      kind: "pair";
      minuend: T;
      subtrahends: readonly T[];
      basis: "as-filed" | "first-reported";
      refiledBy: T | null;
      /** Why the first-reported copy stands in (basis "first-reported" only): C-9's two admitted cases. */
      refiledAs: "precision" | "labelled-representation" | null;
    }
  | { kind: "withheld"; reason: string }
  | { kind: "none" };

type Pair<T> = Extract<PairChoice<T>, { kind: "pair" }>;

const periodOf = (c: LineageCopy): string => `${c.start ?? "(instant)"}..${c.end}`;
const spanDays = (c: LineageCopy): number =>
  c.start === undefined ? 0 : (Date.parse(`${c.end}T00:00:00Z`) - Date.parse(`${c.start}T00:00:00Z`)) / 86_400_000;
const subtrahendLabel = (c: LineageCopy): string => (spanDays(c) > 100 ? "year-to-date" : "quarter");
const pctMove = (from: LineageCopy, to: LineageCopy): number | null =>
  from.val === 0 ? null : ((to.val - from.val) / Math.abs(from.val)) * 100;

/**
 * The pair a derivation may net (OD-5 (a) with the review's two sharpenings and C-9, (a2') on the subtrahend
 * side, then (b)). `subtrahendsFor(m)` returns the subtrahend copies minuend `m`'s filing lineage saw (the caller's
 * lineagePoints lookup), or null. `labelled(m)` says whether `m`'s filing labels `m`'s period a re-presentation
 * (callers pass `(m) => representationLabelled(labelCopies, m, thresholdPct)`).
 */
export function oneBasisPair<T extends LineageCopy>(
  copies: readonly T[],
  winner: T,
  subtrahendsFor: (minuend: T) => readonly T[] | null,
  thresholdPct: number,
  labelled: (refiled: T) => boolean,
): PairChoice<T> {
  const wasRefiled = (c: T): boolean => firstReportedCopy(copies, c).val !== c.val;

  // Rule 4 (C-9, subtrahend side): a later, material, unlabelled copy of a subtrahend supersedes the one netted.
  // The later copy is never netted (D-13); this only decides between the pair and a withholding.
  const checked = (pair: Pair<T>): PairChoice<T> => {
    for (const s of pair.subtrahends) {
      let latest: T | null = null;
      for (const c of copies) {
        if (!samePeriod(c, s) || !(c.filed > pair.minuend.filed)) continue;
        if (latest === null || firstReportedOrder(c, latest) > 0) latest = c;
      }
      if (latest === null || !movedBeyond(s, latest, thresholdPct) || labelled(latest)) continue;
      return {
        kind: "withheld",
        reason:
          `${subtrahendLabel(s)} ${periodOf(s)} netted as ${s.val} (${s.form.trim()} ${s.filed}, ${s.accn}) was re-filed as ${latest.val} ` +
          `(${describeChangePct(pctMove(s, latest))}) in ${latest.form.trim()} ${latest.filed} (${latest.accn}), after the ${filingOf(pair.minuend)}, ` +
          `and that filing labels no re-presentation for the period: a corrected figure replaces the original (ASC 250-10-45-23), ` +
          `so the quarter cannot be derived on one basis`,
      };
    }
    return pair;
  };
  const mixedOrPair = (minuend: T, subs: readonly T[], rest: Pick<Pair<T>, "basis" | "refiledBy" | "refiledAs">): PairChoice<T> => {
    const mixed = presentationMixed(copies, minuend, subs, thresholdPct);
    if (mixed !== null) return { kind: "withheld", reason: mixed };
    return checked({ kind: "pair", minuend, subtrahends: subs, ...rest });
  };

  // Rule 1: the winner counts as re-filed only when it is not the first-reported copy, carries a different value
  // and is not an amendment (an amendment corrects its own report and stays in the lineage).
  const first = firstReportedCopy(copies, winner);
  const refiled = first.val !== winner.val && !isAmendment(winner);

  // Rule 2: keep today's pair when the winner is not re-filed, or when the subtrahend its lineage saw moved with it.
  // A winner whose own lineage has no subtrahend at all has nothing to net on any basis (the first-reported copy's
  // lineage is a subset of it): the caller keeps today's handling, a lineage note when a later copy exists, else null.
  const subs = subtrahendsFor(winner);
  if (subs === null) return { kind: "none" };
  if (!refiled || subs.every(wasRefiled)) {
    return mixedOrPair(winner, subs, { basis: "as-filed", refiledBy: null, refiledAs: null });
  }

  // Rule 3a (C-9): a material change that the re-filing does not label is not shown to be a re-presentation.
  const material = movedBeyond(first, winner, thresholdPct);
  if (material && !labelled(winner)) {
    return {
      kind: "withheld",
      reason:
        `${periodOf(winner)} first reported as ${first.val} in ${first.form.trim()} ${first.filed} (${first.accn}) was re-filed as ${winner.val} ` +
        `(${describeChangePct(pctMove(first, winner))}) in ${winner.form.trim()} ${winner.filed} (${winner.accn}), and that filing labels no re-presentation for the period ` +
        `(it files no new or changed discontinued-operations line for it): a corrected figure replaces the original (ASC 250-10-45-23), ` +
        `so the first-reported copy cannot stand in, and no subtrahend is filed on the re-filed basis`,
    };
  }
  // Rule 3b: a precision-only move or a labelled re-presentation; the quarter is the one first reported.
  const subsFirst = subtrahendsFor(first);
  if (subsFirst === null) {
    return {
      kind: "withheld",
      reason:
        `${periodOf(winner)} re-filed with a different value in ${winner.form.trim()} ${winner.filed} (${winner.accn}) while its subtrahend was not; ` +
        `the first-reported copy (${first.form.trim()} ${first.filed}, ${first.accn}) has no subtrahend filed on or before it`,
    };
  }
  return mixedOrPair(first, subsFirst, { basis: "first-reported", refiledBy: winner, refiledAs: material ? "labelled-representation" : "precision" });
}
