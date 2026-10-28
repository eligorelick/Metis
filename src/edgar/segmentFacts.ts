/**
 * Quarterly segment revenue from periodic-report XBRL instances (NVDA report
 * #34 audit, P1-3).
 *
 * The companyfacts API carries no dimensional facts, so the latest 10-Q's
 * segment mix — NVIDIA's Hyperscale / ACIE / Edge Computing presentation —
 * never reached a report; the only segment rows were the vendor's annual
 * product split. Each 10-Q/10-K instance tags revenue against its segment
 * axes (srt:ProductOrServiceAxis, us-gaap:StatementBusinessSegmentsAxis,
 * srt:StatementGeographicalAxis), with the quarter, the year-to-date window
 * and the prior-year comparatives on the issuer's CURRENT presentation.
 *
 * Quarters are taken as the instance states them (a duration of 80-100
 * days). A quarter a filing does not state directly is derived only as the
 * difference of two windows that share a boundary (six months less the
 * second quarter is the first quarter; a fiscal year less nine months is the
 * fourth) — and always within one filing, so a recast later filing never
 * mixes with the presentation it replaced. Across filings, the latest
 * filing's figure for a member and quarter wins.
 *
 * Pure: no network, no clock.
 */

export const SEGMENT_AXES: Readonly<Record<string, string>> = {
  "srt:ProductOrServiceAxis": "Product / market platform",
  "us-gaap:StatementBusinessSegmentsAxis": "Reportable segment",
  "srt:StatementGeographicalAxis": "Geography",
};

const REVENUE_CONCEPTS = [
  "us-gaap:Revenues",
  "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax",
  "us-gaap:RevenueFromContractWithCustomerIncludingAssessedTax",
  "us-gaap:SalesRevenueNet",
] as const;

/** One revenue fact: `axis`/`member` null for the consolidated total. */
export interface RevenueFact {
  axis: string | null;
  member: string | null;
  start: string;
  end: string;
  value: number;
  currency: string;
  concept: string;
}

export interface InstanceRevenue {
  facts: RevenueFact[];
  /** The one revenue concept this instance's segment facts were read from. */
  concept: string | null;
}

interface ContextInfo { start: string; end: string; members: [string, string][]; typed: boolean }

function attr(attrs: string, name: string): string | null {
  return new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)?.[1] ?? null;
}

const DAY_MS = 86_400_000;
function days(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS) + 1;
}
function shiftDay(day: string, by: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + by * DAY_MS).toISOString().slice(0, 10);
}
export function isQuarterLength(start: string, end: string): boolean {
  const n = days(start, end);
  return n >= 80 && n <= 100;
}

/**
 * Revenue facts of one instance document: the undimensioned total and every
 * fact on exactly one segment axis (or one segment axis plus
 * ConsolidationItemsAxis = OperatingSegmentsMember, the segment note's form).
 */
export function parseInstanceRevenue(xml: string): InstanceRevenue {
  const contexts = new Map<string, ContextInfo>();
  for (const m of xml.matchAll(/<(?:xbrli:)?context\b([^>]*)>([\s\S]*?)<\/(?:xbrli:)?context>/g)) {
    const id = attr(m[1]!, "id");
    if (id === null) continue;
    const body = m[2]!;
    const start = /<(?:xbrli:)?startDate>\s*(\d{4}-\d{2}-\d{2})/.exec(body)?.[1];
    const end = /<(?:xbrli:)?endDate>\s*(\d{4}-\d{2}-\d{2})/.exec(body)?.[1];
    if (!start || !end) continue;
    const members = [...body.matchAll(/<xbrldi:explicitMember\b[^>]*dimension="([^"]+)"[^>]*>\s*([^<\s]+)\s*<\/xbrldi:explicitMember>/g)]
      .map((x) => [x[1]!, x[2]!] as [string, string]);
    contexts.set(id, { start, end, members, typed: /<xbrldi:typedMember\b/.test(body) });
  }
  const units = new Map<string, string>();
  for (const m of xml.matchAll(/<(?:xbrli:)?unit\b([^>]*)>([\s\S]*?)<\/(?:xbrli:)?unit>/g)) {
    const id = attr(m[1]!, "id");
    const measure = /<(?:xbrli:)?measure>\s*iso4217:([A-Z]{3})\s*<\/(?:xbrli:)?measure>/.exec(m[2]!);
    if (id !== null && measure && !/divide/.test(m[2]!)) units.set(id, measure[1]!);
  }
  const byConcept = new Map<string, RevenueFact[]>();
  for (const concept of REVENUE_CONCEPTS) {
    const re = new RegExp(`<${concept}\\b([^>]*)>([^<]*)</${concept}>`, "g");
    for (const m of xml.matchAll(re)) {
      if (/xsi:nil="true"/.test(m[1]!)) continue;
      const ctx = contexts.get(attr(m[1]!, "contextRef") ?? "");
      const currency = units.get(attr(m[1]!, "unitRef") ?? "");
      const value = Number(m[2]!.trim());
      if (!ctx || !currency || ctx.typed || !Number.isFinite(value)) continue;
      const segment = ctx.members.filter(([dim]) => dim in SEGMENT_AXES);
      const others = ctx.members.filter(([dim]) => !(dim in SEGMENT_AXES));
      const otherOk = others.length === 0 ||
        (others.length === 1 && others[0]![0] === "srt:ConsolidationItemsAxis" && others[0]![1] === "us-gaap:OperatingSegmentsMember");
      let fact: RevenueFact | null = null;
      if (ctx.members.length === 0) fact = { axis: null, member: null, start: ctx.start, end: ctx.end, value, currency, concept };
      else if (segment.length === 1 && otherOk) fact = { axis: segment[0]![0], member: segment[0]![1], start: ctx.start, end: ctx.end, value, currency, concept };
      if (fact) byConcept.set(concept, [...(byConcept.get(concept) ?? []), fact]);
    }
  }
  // One concept per instance: the one carrying the most segment facts (ties
  // to the list order), so members never mix "Revenues" with contract revenue.
  let best: string | null = null;
  let bestCount = -1;
  for (const concept of REVENUE_CONCEPTS) {
    const count = (byConcept.get(concept) ?? []).filter((f) => f.axis !== null).length;
    if (count > bestCount) { best = concept; bestCount = count; }
  }
  if (best === null || bestCount <= 0) {
    const totals = REVENUE_CONCEPTS.map((c) => byConcept.get(c) ?? []).find((list) => list.length > 0) ?? [];
    return { facts: dedupe(totals), concept: totals[0]?.concept ?? null };
  }
  const chosen = byConcept.get(best)!;
  // The undimensioned total may sit on another concept (contract revenue in
  // the note, Revenues on the face): take it from the chosen concept first.
  const totals = chosen.some((f) => f.axis === null) ? [] : REVENUE_CONCEPTS.map((c) => byConcept.get(c) ?? []).flat().filter((f) => f.axis === null);
  return { facts: dedupe([...chosen, ...totals.filter((f, i, all) => all.findIndex((g) => g.start === f.start && g.end === f.end) === i)]), concept: best };
}

function factKey(f: Pick<RevenueFact, "axis" | "member" | "start" | "end">): string {
  return `${f.axis ?? ""}|${f.member ?? ""}|${f.start}|${f.end}`;
}

function dedupe(facts: RevenueFact[]): RevenueFact[] {
  const seen = new Map<string, RevenueFact>();
  for (const f of facts) if (!seen.has(factKey(f))) seen.set(factKey(f), f);
  return [...seen.values()];
}

/**
 * Issuer member labels from a label linkbase (`*_lab.xml`): element name
 * ("nvda:HyperscaleMember") -> the standard label without " [Member]".
 */
export function parseMemberLabels(labXml: string): Record<string, string> {
  const locs = new Map<string, string>();
  for (const m of labXml.matchAll(/<link:loc\b([^>]*)\/?>/g)) {
    const label = attr(m[1]!, "xlink:label");
    const href = attr(m[1]!, "xlink:href");
    const fragment = href?.split("#")[1];
    if (label && fragment) locs.set(label, fragment.replace("_", ":"));
  }
  const texts = new Map<string, { role: string; text: string }[]>();
  for (const m of labXml.matchAll(/<link:label\b([^>]*)>([\s\S]*?)<\/link:label>/g)) {
    const label = attr(m[1]!, "xlink:label");
    const role = attr(m[1]!, "xlink:role") ?? "";
    if (!label) continue;
    const text = m[2]!.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, "\"").replace(/\s+/g, " ").trim();
    texts.set(label, [...(texts.get(label) ?? []), { role, text }]);
  }
  const out: Record<string, string> = {};
  for (const m of labXml.matchAll(/<link:labelArc\b([^>]*)\/?>/g)) {
    const element = locs.get(attr(m[1]!, "xlink:from") ?? "");
    const labels = texts.get(attr(m[1]!, "xlink:to") ?? "");
    if (!element || !labels || !/Member$/.test(element)) continue;
    const pick = labels.find((l) => /\/terseLabel$/.test(l.role)) ?? labels.find((l) => /\/label$/.test(l.role)) ?? labels[0];
    if (pick) out[element] = pick.text.replace(/\s*\[Member\]\s*$/i, "").trim();
  }
  return out;
}

const COUNTRY_NAMES: Readonly<Record<string, string>> = {
  US: "United States", TW: "Taiwan", CN: "China", HK: "Hong Kong", JP: "Japan", KR: "South Korea", SG: "Singapore",
  IN: "India", IE: "Ireland", GB: "United Kingdom", DE: "Germany", FR: "France", CA: "Canada", NL: "Netherlands",
  CH: "Switzerland", IL: "Israel", MX: "Mexico", BR: "Brazil", AU: "Australia",
};

/** A readable name for a member the label linkbase does not cover. */
export function fallbackMemberLabel(member: string): string {
  const [prefix, local = member] = member.includes(":") ? member.split(":") as [string, string] : ["", member];
  if (prefix === "country") return COUNTRY_NAMES[local] ?? local;
  const words = local
    .replace(/Member$/, "")
    .replace(/Segment$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim();
  return words.replace(/\bAnd\b/g, "and").replace(/\bOf\b/g, "of").replace(/\bIncluding\b/g, "including") || member;
}

// ---------------------------------------------------------------------------
// Quarter series across filings
// ---------------------------------------------------------------------------

export interface FilingRevenue {
  accession: string;
  form: string;
  filingDate: string;
  facts: RevenueFact[];
}

export interface QuarterValue {
  value: number;
  currency: string;
  start: string;
  end: string;
  accession: string;
  filingDate: string;
  /** True when computed as the difference of two windows in one filing. */
  derived: boolean;
  /** Pooled duration subtraction used operands from different filings. */
  crossFilingDerived?: boolean;
}

type DatedFact = RevenueFact & { accession: string; filingDate: string };

/**
 * Quarters implied by pairs of windows sharing a boundary: a window less a
 * shorter one with the same start is its tail, with the same end its head.
 * Only quarter-length results are kept.
 */
function derivedQuarters(facts: readonly DatedFact[]): { fact: DatedFact; start: string; end: string; value: number; crossFilingDerived: boolean }[] {
  const out: { fact: DatedFact; start: string; end: string; value: number; crossFilingDerived: boolean }[] = [];
  for (const long of facts) {
    for (const short of facts) {
      if (long === short || long.currency !== short.currency) continue;
      let start: string | null = null;
      let end: string | null = null;
      if (long.start === short.start && short.end < long.end) { start = shiftDay(short.end, 1); end = long.end; }
      else if (long.end === short.end && short.start > long.start) { start = long.start; end = shiftDay(short.start, -1); }
      if (start === null || end === null || !isQuarterLength(start, end)) continue;
      // The derived cell carries the later of its two filings.
      const newer = long.filingDate >= short.filingDate ? long : short;
      out.push({ fact: newer, start, end, value: long.value - short.value, crossFilingDerived: long.accession !== short.accession });
    }
  }
  return out;
}

function seriesKey(f: Pick<RevenueFact, "axis" | "member">): string {
  return `${f.axis ?? ""}|${f.member ?? ""}`;
}

/** The quarters one filing states or implies, keyed axis|member|start|end. */
function filingQuarters(filing: FilingRevenue): Map<string, QuarterValue> {
  const out = new Map<string, QuarterValue>();
  const put = (f: Pick<RevenueFact, "axis" | "member" | "start" | "end" | "currency">, value: number, derived: boolean): void => {
    const key = factKey(f);
    if (out.has(key) && (derived || !out.get(key)!.derived)) return;
    out.set(key, { value, currency: f.currency, start: f.start, end: f.end, accession: filing.accession, filingDate: filing.filingDate, derived });
  };
  for (const f of filing.facts) if (isQuarterLength(f.start, f.end)) put(f, f.value, false);
  const series = new Map<string, DatedFact[]>();
  for (const f of filing.facts) series.set(seriesKey(f), [...(series.get(seriesKey(f)) ?? []), { ...f, accession: filing.accession, filingDate: filing.filingDate }]);
  for (const facts of series.values()) {
    for (const d of derivedQuarters(facts)) put({ ...d.fact, start: d.start, end: d.end }, d.value, true);
  }
  return out;
}

export interface SegmentRow {
  member: string;
  label: string;
  /** Aligned with `SegmentSeries.quarters`; null where the member is not tagged. */
  values: (number | null)[];
  /** A member whose latest-quarter value equals the sum of two or three others (a subtotal). */
  childOf: string | null;
  /** D-63: quarter indexes filled as the total less the other top-level rows (see `residualCells`). */
  residualAt?: number[];
}

export interface SegmentSeries {
  axis: string;
  axisLabel: string;
  currency: string;
  /** Quarter windows, newest first. */
  quarters: { start: string; end: string }[];
  rows: SegmentRow[];
  /** The consolidated total for each quarter, when tagged. */
  total: (number | null)[];
  /** Members tagged only in earlier quarters (a prior presentation), left out of the table. */
  priorPresentation: string[];
  /** Quarter cells derived as differences of two windows, as "member end-date". */
  derivedCells: number;
  /**
   * D-63: cells filled as the quarter's total less the axis's other top-level
   * members, where the members are shown to be exhaustive (they sum to the
   * total in the latest quarter) and exactly one is untagged in that quarter —
   * a member renamed between filings (NVIDIA's "Other" geography) or a quarter
   * no filing states for it (Edge Computing = total less Data Center).
   */
  residualCells: number;
}

/**
 * D-63 (AI-406): the windows, in days before the latest quarter end, that make
 * a column the adjacent quarter (a 14-week quarter is 98 days) or the
 * year-ago quarter (52-week years give 364 days, 53-week years 371).
 */
export const QOQ_WINDOW_DAYS = { min: 80, max: 100 } as const;
export const YOY_WINDOW_DAYS = { min: 350, max: 380 } as const;

/** Index (> 0) of the first column, newest first, whose end is min..max days before ends[0]; null if none. */
export function priorQuarterIndex(ends: readonly string[], window: { min: number; max: number }): number | null {
  if (ends.length < 2) return null;
  const latest = Date.parse(`${ends[0]!}T00:00:00Z`);
  const index = ends.findIndex((end, i) => {
    if (i === 0) return false;
    const days = (latest - Date.parse(`${end}T00:00:00Z`)) / 86_400_000;
    return days >= window.min && days <= window.max;
  });
  return index > 0 ? index : null;
}

export interface QuarterlySegmentRevenue {
  /** Newest-first quarter windows covered by the consolidated total. */
  quarters: { start: string; end: string }[];
  /** Consolidated revenue per quarter (newest first). */
  total: (number | null)[];
  currency: string | null;
  axes: SegmentSeries[];
  /** Instances that could not be read, disclosed with the table. */
  notes: string[];
  /** Filings read, newest first. */
  filings: { accession: string; form: string; filingDate: string; concept: string | null }[];
}

/**
 * Merge the filings' quarters (newest filing wins) and lay the latest
 * presentation out over up to `maxQuarters` quarters.
 */
export function buildQuarterlySegments(
  filings: readonly (FilingRevenue & { concept: string | null })[],
  labels: Readonly<Record<string, string>>,
  maxQuarters = 8,
): QuarterlySegmentRevenue | null {
  const ordered = [...filings].sort((a, b) => b.filingDate.localeCompare(a.filingDate) || b.accession.localeCompare(a.accession));
  const merged = new Map<string, QuarterValue>();
  for (const filing of ordered) {
    for (const [key, q] of filingQuarters(filing)) if (!merged.has(key)) merged.set(key, q);
  }
  // A fourth quarter is stated by no filing: it is the 10-K's fiscal year less
  // the third-quarter 10-Q's nine months. Windows are pooled across filings
  // (newest filing per window) and fill only cells still empty, so a value a
  // filing states or implies on its own is never replaced by a cross-filing one.
  const windows = new Map<string, DatedFact>();
  for (const filing of ordered) {
    for (const f of filing.facts) {
      if (isQuarterLength(f.start, f.end) || windows.has(factKey(f))) continue;
      windows.set(factKey(f), { ...f, accession: filing.accession, filingDate: filing.filingDate });
    }
  }
  const pooled = new Map<string, DatedFact[]>();
  for (const f of windows.values()) pooled.set(seriesKey(f), [...(pooled.get(seriesKey(f)) ?? []), f]);
  for (const facts of pooled.values()) {
    for (const d of derivedQuarters(facts)) {
      const key = factKey({ ...d.fact, start: d.start, end: d.end });
      if (merged.has(key)) continue;
      merged.set(key, { value: d.value, currency: d.fact.currency, start: d.start, end: d.end, accession: d.fact.accession, filingDate: d.fact.filingDate,
        derived: true, crossFilingDerived: d.crossFilingDerived });
    }
  }
  const totals = [...merged.entries()].filter(([key]) => key.startsWith("||")).map(([, q]) => q);
  // Quarter columns: the consolidated total's quarters, newest first; one
  // window per end date (a recast never changes a quarter's dates).
  const columns: { start: string; end: string }[] = [];
  for (const q of totals.sort((a, b) => b.end.localeCompare(a.end))) {
    if (!columns.some((c) => c.end === q.end)) columns.push({ start: q.start, end: q.end });
  }
  const quarters = columns.slice(0, maxQuarters);
  if (quarters.length === 0) return null;
  const at = (axis: string | null, member: string | null, col: { start: string; end: string }): QuarterValue | undefined =>
    merged.get(factKey({ axis, member, start: col.start, end: col.end }));
  const totalCells = quarters.map((col) => at(null, null, col)?.value ?? null);
  const currency = totals[0]?.currency ?? null;
  const axes: SegmentSeries[] = [];
  const notes: string[] = [];
  for (const axis of Object.keys(SEGMENT_AXES)) {
    const members = [...new Set([...merged.entries()].filter(([key]) => key.startsWith(`${axis}|`)).map(([key]) => key.split("|")[1]!))];
    const current = members.filter((member) => at(axis, member, quarters[0]!) !== undefined);
    if (current.length < 2) {
      const observedMembers = [...new Set(ordered.flatMap(f => f.facts.filter(fact => fact.axis === axis && fact.member !== null).map(fact => fact.member!)))].sort();
      if (observedMembers.length > 0) notes.push(`${SEGMENT_AXES[axis]} axis withheld: fewer than two compatible current-quarter members at ${quarters[0]!.end}; cross-filing member continuity is unresolved. Observed member QNames: ${observedMembers.join(", ")}. Annual/cumulative observations do not establish a renamed quarterly member mapping.`);
      continue;
    }
    let derivedCells = 0;
    const rows: SegmentRow[] = current.map((member) => ({
      member,
      label: labels[member] ?? fallbackMemberLabel(member),
      values: quarters.map((col) => {
        const q = at(axis, member, col);
        if (q?.derived) derivedCells += 1;
        return q?.value ?? null;
      }),
      childOf: null,
    }));
    markSubtotals(rows);
    const residualCells = fillResiduals(rows, totalCells, (i, missing) => {
      const col = quarters[i]!;
      const total = at(null, null, col);
      if (total === undefined || total.crossFilingDerived) return false;
      // Never relabel an old presentation's C as the current B. Missing
      // historical tags establish no mapping, even when today's rows exhaust revenue.
      if (members.some((member) => !current.includes(member) && at(axis, member, col) !== undefined)) return false;
      // A residual belongs to this presentation only when its total and
      // known rows are comparative facts of a filing that itself names the
      // missing member. Cross-filing arithmetic alone cannot establish a recast.
      const filing = ordered.find((entry) => entry.accession === total.accession);
      return filing !== undefined && filing.facts.some((fact) => fact.axis === axis && fact.member === missing.member && fact.currency === total.currency) &&
        rows.filter((row) => row.childOf === null && row.values[i] !== null).every((row) => {
          const cell = at(axis, row.member, col);
          return cell?.accession === total.accession && cell.currency === total.currency && !cell.crossFilingDerived;
        });
    });
    rows.sort((a, b) => {
      const parentA = a.childOf ? rows.find((r) => r.member === a.childOf)! : a;
      const parentB = b.childOf ? rows.find((r) => r.member === b.childOf)! : b;
      if (parentA !== parentB) return (parentB.values[0] ?? 0) - (parentA.values[0] ?? 0);
      if (a.childOf === null) return -1;
      if (b.childOf === null) return 1;
      return (b.values[0] ?? 0) - (a.values[0] ?? 0);
    });
    const prior = members.filter((member) => !current.includes(member)).map((member) => labels[member] ?? fallbackMemberLabel(member)).sort();
    const axisCurrency = at(axis, current[0]!, quarters[0]!)!.currency;
    axes.push({ axis, axisLabel: SEGMENT_AXES[axis]!, currency: axisCurrency, quarters, rows, total: totalCells, priorPresentation: prior, derivedCells, residualCells });
  }
  return {
    quarters,
    total: totalCells,
    currency,
    axes,
    notes,
    filings: ordered.map((f) => ({ accession: f.accession, form: f.form, filingDate: f.filingDate, concept: f.concept })),
  };
}

/**
 * Mark a member as the child of a subtotal member when that member equals the
 * sum of two or three others (NVIDIA's Data Center = Hyperscale + ACIE).
 * Tolerance: 0.1% of the subtotal.
 *
 * AMZN audit 2026-10-20 finding 13: the sum is checked in every quarter where
 * the parent and all the candidate children are tagged, and must hold in at
 * least two of them. Amazon's axis carries two partitions of revenue (product
 * / service, and seven business lines); in the latest quarter alone online
 * stores + third-party seller services + physical stores came within 0.002%
 * of net service sales by coincidence, so product sales were shown as
 * components of service sales. A real subtotal holds in every quarter; a
 * parent the data cannot establish is not given.
 */
function markSubtotals(rows: SegmentRow[]): void {
  const latest = rows.map((r) => r.values[0] ?? null);
  const quarters = rows[0]?.values.length ?? 0;
  const sumsInEveryQuarter = (p: number, combo: readonly number[]): boolean => {
    let agreeing = 0;
    for (let q = 0; q < quarters; q++) {
      const parent = rows[p]!.values[q] ?? null;
      const parts = combo.map((i) => rows[i]!.values[q] ?? null);
      if (parent === null || parts.some((v) => v === null)) continue;
      const sum = parts.reduce<number>((acc, v) => acc + v!, 0);
      if (Math.abs(sum - parent) > Math.max(Math.abs(parent) * 0.001, 1)) return false;
      agreeing += 1;
    }
    return agreeing >= 2;
  };
  for (let p = 0; p < rows.length; p++) {
    const parent = latest[p];
    if (parent === null || parent <= 0) continue;
    const others = rows.map((_, i) => i).filter((i) => i !== p && latest[i] !== null && rows[i]!.childOf === null);
    const found = combos(others, 2).concat(combos(others, 3)).find((combo) => sumsInEveryQuarter(p, combo));
    if (found) for (const i of found) rows[i]!.childOf = rows[p]!.member;
  }
}

/**
 * D-63: fill a quarter's one missing top-level cell as the total less the
 * other top-level rows. Only when the top-level rows are exhaustive — every
 * one is tagged in the latest quarter and they sum to its total within 0.1%
 * — the historical column has the same filing presentation, and the remainder
 * is not negative. Returns the number of cells filled.
 */
function fillResiduals(rows: SegmentRow[], total: readonly (number | null)[], presentationAgrees: (i: number, missing: SegmentRow) => boolean): number {
  const top = rows.filter((r) => r.childOf === null);
  const latestTotal = total[0];
  if (top.length < 2 || latestTotal == null || top.some((r) => r.values[0] == null)) return 0;
  const tolerance = (t: number): number => Math.max(Math.abs(t) * 0.001, 1);
  if (Math.abs(top.reduce((sum, r) => sum + r.values[0]!, 0) - latestTotal) > tolerance(latestTotal)) return 0;
  let filled = 0;
  for (let i = 1; i < total.length; i++) {
    const t = total[i];
    const missing = top.filter((r) => r.values[i] == null);
    if (t == null || missing.length !== 1) continue;
    if (!presentationAgrees(i, missing[0]!)) continue;
    const remainder = t - top.reduce((sum, r) => sum + (r.values[i] ?? 0), 0);
    if (remainder < -tolerance(t)) continue;
    missing[0]!.values[i] = Math.max(0, remainder);
    missing[0]!.residualAt = [...(missing[0]!.residualAt ?? []), i];
    filled += 1;
  }
  return filled;
}

function combos(items: number[], k: number): number[][] {
  if (k === 0) return [[]];
  return items.flatMap((item, i) => combos(items.slice(i + 1), k - 1).map((rest) => [item, ...rest]));
}
