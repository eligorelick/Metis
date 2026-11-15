/** Dated share observations and cover-class disclosures; require a proved share basis (P3, P6; D-30, D-103). */
import { type FactIndex, pickUnitPoints, DEI_SHARES_TAG } from "./factIndex";
import { type UnitKind } from "./fieldSpecs";
import { type FactPoint, filterToCoreForms } from "@/edgar/xbrl";
import { type SharesOutstandingPoint, type FilingRef } from "./types";
import { BALANCE_SHEET_SHARES_TAG } from "@/edgar/tagSynonyms";
import { filingRef } from "./resolution";


// ---------------------------------------------------------------------------
// dei cover-page facts
// ---------------------------------------------------------------------------

/**
 * Newest point of one indexed concept. Same-`end` duplicates in companyfacts
 * are refilings, so the max(`filed`) winner is the right one — they are never
 * summed.
 */
function latestPoint(
  index: FactIndex,
  key: string,
  kind: UnitKind,
  instantOnly = false,
): { value: number; asOf: string } | null {
  const up = pickUnitPoints(index, key, kind);
  if (up === null) return null;
  let best: FactPoint | null = null;
  for (const p of up.points) {
    if (instantOnly && p.start !== undefined) continue;
    if (best === null || p.end > best.end || (p.end === best.end && p.filed > best.filed)) best = p;
  }
  return best === null ? null : { value: best.val, asOf: best.end };
}

function latestDeiPoint(index: FactIndex, tag: string, kind: UnitKind): { value: number; asOf: string } | null {
  return latestPoint(index, `dei:${tag}`, kind);
}

/**
 * Cover-page share count, else the balance-sheet all-classes total. See
 * `SharesBasis`: a per-class reporter files no non-dimensional dei cover count
 * at all, and suppressing its market cap is worse than reporting the
 * combined-class figure with the basis named.
 */
export function latestSharesOutstanding(index: FactIndex): SharesOutstandingPoint | null {
  const cover = latestCoverShareCount(index);
  if (cover !== null) return cover;
  const balanceSheet = latestPoint(index, BALANCE_SHEET_SHARES_TAG, "shares", true);
  return balanceSheet === null
    ? null
    : { ...balanceSheet, basis: "balance sheet CommonStockSharesOutstanding" };
}

/**
 * One period's cover-page share count: the per-class facts of the filing that
 * won that period, summed.
 */
export interface CoverShareCount {
  value: number;
  /** Period end (the cover-page "as of" date). */
  asOf: string;
  filing: FilingRef;
  /** The per-class counts summed into `value`, in filed order; length 1 for a single-class filer. */
  classes: number[];
  /**
   * Facts of the WINNING FILING that repeated a value another fact of the same
   * filing already carried, and were therefore counted once. Companyfacts drops
   * the class dimension, so a repeat is indistinguishable from a second class
   * with an identical count — see `classAmbiguityNote`.
   */
  collapsedRepeats: number;
}

/** The largest class may exceed the smallest by this factor before the sum is flagged (N2). */
export const CLASS_SIZE_RATIO_WARN = 100;

/**
 * The newest cover-page share count, SUMMED across share classes.
 *
 * `dei:EntityCommonStockSharesOutstanding` is stated once per class of
 * registered common stock, so a multi-class issuer's cover page produces
 * several facts with the same period end and the same accession — one per
 * class. Companyfacts drops the class dimension, so they are indistinguishable
 * except by value, and the period dedup (one fact per period) kept exactly one
 * of them: the market cap of a three-class issuer was the market cap of
 * whichever class sorted first. Facts of one filing and one date are therefore
 * summed, and the per-class breakdown is carried for disclosure.
 *
 * Byte-identical repeats of a fact (the same value in the same filing for the
 * same date) are a companyfacts artifact, not a second class, and are counted
 * once — but the count of them is carried, because that assumption is exactly
 * what cannot be verified from this source.
 *
 * Exported because the keyless market-cap HISTORY needs the same rule applied
 * to every period, not only the newest one: summing the spot count while
 * deduplicating the series made one report contradict itself.
 */
export function coverShareCountsByPeriod(points: readonly FactPoint[]): CoverShareCount[] {
  const byEnd = new Map<string, FactPoint[]>();
  for (const p of filterToCoreForms([...points])) {
    const group = byEnd.get(p.end);
    if (group === undefined) byEnd.set(p.end, [p]);
    else group.push(p);
  }
  const out: CoverShareCount[] = [];
  for (const [end, group] of byEnd) {
    let winner = group[0] as FactPoint;
    for (const p of group) {
      if (p.filed > winner.filed || (p.filed === winner.filed && p.accn > winner.accn)) winner = p;
    }
    const seen = new Set<string>();
    const classes: number[] = [];
    let collapsedRepeats = 0;
    for (const p of group) {
      if (p.accn !== winner.accn || p.filed !== winner.filed) continue;
      const key = `${p.val}|${p.form.trim()}|${p.start ?? ""}`;
      if (seen.has(key)) {
        collapsedRepeats += 1;
        continue;
      }
      seen.add(key);
      classes.push(p.val);
    }
    out.push({
      value: classes.reduce((s, v) => s + v, 0),
      asOf: end,
      filing: filingRef(winner),
      classes,
      collapsedRepeats,
    });
  }
  return out.sort((a, b) => (a.asOf < b.asOf ? -1 : a.asOf > b.asOf ? 1 : 0));
}

/**
 * N1: two classes with identical share counts are byte-identical facts in
 * companyfacts, so the repeat is dropped and the total silently halves. The
 * source cannot tell the two cases apart, so the ambiguity is disclosed rather
 * than resolved by picking one.
 */
export function classAmbiguityNote(count: CoverShareCount): string | null {
  if (count.collapsedRepeats === 0) return null;
  const total = count.classes.length + count.collapsedRepeats;
  return (
    `the cover page of ${count.filing.form} ${count.filing.accn} (filed ${count.filing.filed}) carries ${total} ` +
    `dei:${DEI_SHARES_TAG} facts for ${count.asOf} but only ${count.classes.length} distinct value(s): ` +
    `${count.collapsedRepeats} repeat(s) were counted once. Companyfacts carries no class dimension, so a repeated ` +
    "fact is indistinguishable from a SECOND SHARE CLASS with an identical count — if these are distinct classes " +
    `the share count ${count.value} understates the registered shares, and every per-share and market-cap figure ` +
    "derived from it is correspondingly overstated."
  );
}

/**
 * N2: summing raw per-class counts assumes equal per-share economics. Berkshire's
 * B shares convert 1:1500 to an A share, so a raw sum of the two classes is off
 * by an order of magnitude as a measure of economic ownership.
 */
export function classRatioNote(count: CoverShareCount): string | null {
  if (count.classes.length < 2) return null;
  const largest = Math.max(...count.classes);
  const smallest = Math.min(...count.classes);
  if (smallest <= 0 || largest / smallest <= CLASS_SIZE_RATIO_WARN) return null;
  return (
    `the per-class cover counts summed for ${count.asOf} differ by a factor of ${Math.round(largest / smallest)} ` +
    `(largest ${largest}, smallest ${smallest}). A raw sum assumes every class has the SAME per-share economics; ` +
    "for an issuer whose classes convert at a fixed ratio (Berkshire's B shares convert 1:1500 to an A share) that " +
    "assumption fails by an order of magnitude, and companyfacts carries no conversion ratio, so the sum is a share " +
    "COUNT and must not be read as economically weighted ownership."
  );
}

function latestCoverShareCount(index: FactIndex): SharesOutstandingPoint | null {
  const up = pickUnitPoints(index, `dei:${DEI_SHARES_TAG}`, "shares");
  if (up === null) return null;
  const counts = coverShareCountsByPeriod(up.all);
  const latest = counts[counts.length - 1];
  if (latest === undefined || latest.classes.length === 0) return null;
  const point: SharesOutstandingPoint = {
    value: latest.value,
    asOf: latest.asOf,
    basis: "dei cover page",
    filing: latest.filing,
  };
  if (latest.classes.length > 1) point.classes = latest.classes;
  const notes = [classAmbiguityNote(latest), classRatioNote(latest)].filter((n): n is string => n !== null);
  if (notes.length > 0) point.classNotes = notes;
  return point;
}
export { latestDeiPoint };
