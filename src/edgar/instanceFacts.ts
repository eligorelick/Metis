/**
 * A periodic filing's own facts, in companyfacts shape, from its XBRL
 * instance (audit 2026-10-22 B-23).
 *
 * SEC's companyfacts API can run a quarter or two behind the filed 10-Qs: on
 * 2026-10-22 it still ended at the first-quarter 10-Q for Visa, Duke, NextEra,
 * Coca-Cola and Prologis although each had filed its second-quarter 10-Q in
 * July or August. The statements, TTM and multiples then ended a quarter (or
 * two) early with nothing saying so. The newer 10-Q's instance is already
 * fetched for segment revenue (`collectQuarterlySegments`), so its
 * undimensioned facts are read here and merged into the companyfacts payload,
 * each point carrying that filing's accession, form, filing date and fiscal
 * focus exactly as companyfacts would. A filing companyfacts already carries
 * is never merged, so nothing is counted twice.
 *
 * D-236 (P2, P9, P10): "carries" is decided by evidence, not by mention, and
 * the fallback covers every core periodic form (`CORE_FACT_FORMS`), not only
 * Forms 10-K and 10-Q. On 2026-11-12 companyfacts held two facts of TSMC's
 * fiscal 2025 Form 20-F (0001628280-26-025362, filed 2026-04-16), the cover
 * page's share count (dei) and one srt element, and none of the statement
 * facts its instance states, so every figure that needs a filed fact of
 * fiscal 2025 went without one. `feedCoverage` is the one coverage test.
 *
 * Only what companyfacts itself publishes is read: numeric, non-nil facts in
 * the us-gaap, srt, dei and ifrs-full taxonomies, on contexts with no segment
 * or scenario (the consolidated registrant; a combined filing's subsidiaries
 * sit on dei:LegalEntityAxis and are left out), for the filer's own CIK. A
 * fact the instance states twice with different values at the same precision
 * is dropped rather than guessed.
 *
 * Pure: no network, no clock.
 */

import { CORE_FACT_FORMS, type CompanyFacts, type FactPoint } from "@/edgar/xbrl";

/** companyfacts namespace keys, matched by the taxonomy URI an instance declares. */
const NAMESPACES: readonly { key: string; uri: RegExp }[] = [
  { key: "us-gaap", uri: /^https?:\/\/fasb\.org\/us-gaap\/\d{4}/ },
  { key: "srt", uri: /^https?:\/\/fasb\.org\/srt\/\d{4}/ },
  { key: "dei", uri: /^https?:\/\/xbrl\.sec\.gov\/dei\/\d{4}/ },
  { key: "ifrs-full", uri: /^https?:\/\/xbrl\.ifrs\.org\/taxonomy\/[\d-]+\/ifrs-full/ },
];

export interface InstanceFiling {
  accession: string;
  form: string;
  filingDate: string;
}

export interface InstanceFacts {
  filing: InstanceFiling;
  /** dei:DocumentPeriodEndDate, the period the filing reports. */
  periodEnd: string | null;
  /** namespace -> concept -> unit -> points, as in companyfacts. */
  facts: Record<string, Record<string, Record<string, FactPoint[]>>>;
  count: number;
}

interface Context { start?: string; end: string }

function attr(attrs: string, name: string): string | null {
  return new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)?.[1] ?? null;
}

const localName = (measure: string): string => measure.trim().replace(/^[^:]*:/, "");

/**
 * The undimensioned facts of one periodic filing's instance. `cik` is the
 * filer's: a context naming another entity is not this registrant's.
 */
export function parseInstanceFacts(xml: string, filing: InstanceFiling, cik: string): InstanceFacts {
  const prefixes = new Map<string, string>();
  for (const m of xml.slice(0, 20_000).matchAll(/\bxmlns:([A-Za-z_][\w.-]*)="([^"]+)"/g)) {
    const ns = NAMESPACES.find((n) => n.uri.test(m[2]!));
    if (ns) prefixes.set(m[1]!, ns.key);
  }
  const filer = Number(cik);
  const contexts = new Map<string, Context>();
  for (const m of xml.matchAll(/<(?:[\w-]+:)?context\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?context>/g)) {
    const id = attr(m[1]!, "id");
    const body = m[2]!;
    if (id === null || /<(?:[\w-]+:)?(?:segment|scenario)\b/.test(body)) continue;
    const identifier = /<(?:[\w-]+:)?identifier\b[^>]*>\s*([^<\s]+)\s*</.exec(body)?.[1];
    if (identifier === undefined || !/^\d{1,10}$/.test(identifier) || Number(identifier) !== filer) continue;
    const instant = /<(?:[\w-]+:)?instant>\s*(\d{4}-\d{2}-\d{2})\s*</.exec(body)?.[1];
    const start = /<(?:[\w-]+:)?startDate>\s*(\d{4}-\d{2}-\d{2})\s*</.exec(body)?.[1];
    const end = /<(?:[\w-]+:)?endDate>\s*(\d{4}-\d{2}-\d{2})\s*</.exec(body)?.[1];
    if (instant !== undefined) contexts.set(id, { end: instant });
    else if (start !== undefined && end !== undefined && start <= end) contexts.set(id, { start, end });
  }
  const units = new Map<string, string>();
  for (const m of xml.matchAll(/<(?:[\w-]+:)?unit\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?unit>/g)) {
    const id = attr(m[1]!, "id");
    const measures = [...m[2]!.matchAll(/<(?:[\w-]+:)?measure>([^<]+)<\/(?:[\w-]+:)?measure>/g)].map((x) => localName(x[1]!));
    const divide = /<(?:[\w-]+:)?divide\b/.test(m[2]!);
    if (id === null || measures.length === 0 || measures.length > 2 || (measures.length === 2) !== divide) continue;
    units.set(id, measures.join("/"));
  }

  const text = (prefixKey: string, concept: string): string | null => {
    for (const [prefix, key] of prefixes) {
      if (key !== prefixKey) continue;
      const v = new RegExp(`<${prefix}:${concept}\\b[^>]*>([^<]*)</${prefix}:${concept}>`).exec(xml)?.[1]?.trim();
      if (v) return v;
    }
    return null;
  };
  const fyText = text("dei", "DocumentFiscalYearFocus");
  const fy = fyText !== null && /^\d{4}$/.test(fyText) ? Number(fyText) : null;
  const fp = text("dei", "DocumentFiscalPeriodFocus");
  const periodEnd = text("dei", "DocumentPeriodEndDate");

  type Candidate = { point: FactPoint; decimals: number; conflict: boolean };
  const found = new Map<string, Candidate & { ns: string; concept: string; unit: string }>();
  if (prefixes.size > 0) {
    const alternation = [...prefixes.keys()].map((p) => p.replace(/[.-]/g, "\\$&")).join("|");
    const re = new RegExp(`<(${alternation}):([A-Za-z_][\\w.-]*)\\b([^>]*?)(?:/>|>([^<]*)</\\1:\\2>)`, "g");
    for (const m of xml.matchAll(re)) {
      const attrs = m[3]!;
      if (m[4] === undefined || /\bxsi:nil="true"/.test(attrs)) continue;
      const ctx = contexts.get(attr(attrs, "contextRef") ?? "");
      const unit = units.get(attr(attrs, "unitRef") ?? "");
      const raw = m[4].trim();
      if (ctx === undefined || unit === undefined || !/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(raw)) continue;
      const val = Number(raw);
      if (!Number.isFinite(val)) continue;
      const decimalsAttr = attr(attrs, "decimals");
      const decimals = decimalsAttr === "INF" ? Infinity : decimalsAttr !== null && /^-?\d+$/.test(decimalsAttr) ? Number(decimalsAttr) : -Infinity;
      const ns = prefixes.get(m[1]!)!;
      const concept = m[2]!;
      const key = `${ns}|${concept}|${unit}|${ctx.start ?? ""}|${ctx.end}`;
      const point: FactPoint = {
        ...(ctx.start === undefined ? {} : { start: ctx.start }),
        end: ctx.end, val, accn: filing.accession, fy, fp, form: filing.form, filed: filing.filingDate,
      };
      const prior = found.get(key);
      if (prior === undefined || decimals > prior.decimals) found.set(key, { ns, concept, unit, point, decimals, conflict: false });
      else if (decimals === prior.decimals && val !== prior.point.val) prior.conflict = true;
    }
  }
  const facts: InstanceFacts["facts"] = {};
  let count = 0;
  for (const { ns, concept, unit, point, conflict } of found.values()) {
    if (conflict) continue;
    ((facts[ns] ??= {})[concept] ??= {})[unit] ??= [];
    facts[ns]![concept]![unit]!.push(point);
    count += 1;
  }
  return { filing, periodEnd: periodEnd !== null && /^\d{4}-\d{2}-\d{2}$/.test(periodEnd) ? periodEnd : null, facts, count };
}

/**
 * The taxonomies a filer tags its financial statements in. dei is the cover
 * page and srt holds supplementary schedule elements: companyfacts publishes
 * facts of either for a filing whose statements it has not published.
 */
const STATEMENT_NAMESPACES: readonly string[] = ["us-gaap", "ifrs-full"];

/** A filing as the coverage test reads it. */
export interface PeriodicFilingRef {
  accession: string;
  form: string;
  filingDate: string;
}

export interface FeedCoverage {
  /** Accessions whose financial-statement facts companyfacts carries. */
  covered: ReadonlySet<string>;
  /** Filing date of the newest core periodic report among them; null when it covers none. */
  through: string | null;
}

const pointKey = (ns: string, concept: string, unit: string, p: Partial<FactPoint>): string =>
  `${p.accn}|${ns}|${concept}|${unit}|${p.start ?? ""}|${p.end}`;

function eachPoint(facts: CompanyFacts, visit: (ns: string, concept: string, unit: string, point: Partial<FactPoint>) => void): void {
  for (const [ns, namespace] of Object.entries(facts.facts)) {
    for (const [name, concept] of Object.entries(namespace ?? {})) {
      const units = (concept as { units?: Record<string, unknown> } | null)?.units;
      if (units === null || typeof units !== "object") continue;
      for (const [unit, list] of Object.entries(units)) {
        if (!Array.isArray(list)) continue;
        for (const p of list as (Partial<FactPoint> | null)[]) if (p !== null && typeof p === "object") visit(ns, name, unit, p);
      }
    }
  }
}

/**
 * Which filings a companyfacts payload carries (D-236). A filing is covered
 * only when the payload attributes to its accession at least one fact of a
 * statement taxonomy; a filing it merely mentions, through a cover-page or
 * srt fact, is not. The one coverage test: the bundle asks it which instances
 * to fetch and the merge asks it which to admit.
 */
export function feedCoverage(facts: CompanyFacts): FeedCoverage {
  const covered = new Set<string>();
  let through: string | null = null;
  eachPoint(facts, (ns, _concept, _unit, p) => {
    if (!STATEMENT_NAMESPACES.includes(ns) || typeof p.accn !== "string") return;
    covered.add(p.accn);
    if (typeof p.form === "string" && CORE_FACT_FORMS.has(p.form.trim()) && typeof p.filed === "string" && (through === null || p.filed > through)) through = p.filed;
  });
  return { covered, through };
}

/**
 * True when the fallback applies to `filing`: a core periodic report that
 * companyfacts does not cover, filed after the newest one it does.
 */
export function needsInstance(coverage: FeedCoverage, filing: PeriodicFilingRef): boolean {
  return CORE_FACT_FORMS.has(filing.form.trim()) && !coverage.covered.has(filing.accession) &&
    (coverage.through === null || filing.filingDate > coverage.through);
}

export interface InstanceMerge {
  facts: CompanyFacts;
  /** The filings merged, oldest first, each with the number of points added; empty when nothing was added. */
  merged: (InstanceFiling & { periodEnd: string | null; count: number })[];
  /** Filing date of the newest periodic report whose statement facts companyfacts itself carried before the merge. */
  companyFactsThrough: string | null;
}

/**
 * Adds to `facts` the instances of the core periodic filings the fallback
 * applies to (`needsInstance`). A point companyfacts already holds for such a
 * filing (the cover-page fact of a filing it only mentions) is not added
 * again. The input is not modified.
 */
export function mergeInstanceFacts(facts: CompanyFacts, instances: readonly InstanceFacts[]): InstanceMerge {
  const coverage = feedCoverage(facts);
  const unchanged: InstanceMerge = { facts, merged: [], companyFactsThrough: coverage.through };
  const newer = instances
    .filter((i) => i.count > 0 && needsInstance(coverage, i.filing))
    .sort((a, b) => a.filing.filingDate.localeCompare(b.filing.filingDate) || a.filing.accession.localeCompare(b.filing.accession));
  if (newer.length === 0) return unchanged;
  const reading = new Set(newer.map((i) => i.filing.accession));
  const held = new Set<string>();
  eachPoint(facts, (ns, concept, unit, p) => {
    if (typeof p.accn === "string" && reading.has(p.accn)) held.add(pointKey(ns, concept, unit, p));
  });
  const out: CompanyFacts = { ...facts, facts: { ...facts.facts } };
  const merged: InstanceMerge["merged"] = [];
  for (const instance of newer) {
    let added = 0;
    for (const [ns, concepts] of Object.entries(instance.facts)) {
      const namespace = { ...(out.facts[ns] ?? {}) };
      let namespaceAdded = 0;
      for (const [concept, units] of Object.entries(concepts)) {
        const existing = namespace[concept] as { units?: Record<string, unknown[]> } | undefined;
        const nextUnits: Record<string, unknown[]> = { ...(existing?.units ?? {}) };
        let conceptAdded = 0;
        for (const [unit, points] of Object.entries(units)) {
          const fresh = points.filter((p) => !held.has(pointKey(ns, concept, unit, p)));
          if (fresh.length === 0) continue;
          nextUnits[unit] = [...(nextUnits[unit] ?? []), ...fresh];
          conceptAdded += fresh.length;
        }
        if (conceptAdded === 0) continue;
        namespace[concept] = { ...(existing ?? { label: null, description: null }), units: nextUnits };
        namespaceAdded += conceptAdded;
      }
      if (namespaceAdded > 0) out.facts[ns] = namespace;
      added += namespaceAdded;
    }
    if (added > 0) merged.push({ ...instance.filing, periodEnd: instance.periodEnd, count: added });
  }
  return merged.length === 0 ? unchanged : { facts: out, merged, companyFactsThrough: coverage.through };
}
