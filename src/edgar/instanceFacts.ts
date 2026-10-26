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
 * Only what companyfacts itself publishes is read: numeric, non-nil facts in
 * the us-gaap, srt, dei and ifrs-full taxonomies, on contexts with no segment
 * or scenario (the consolidated registrant; a combined filing's subsidiaries
 * sit on dei:LegalEntityAxis and are left out), for the filer's own CIK. A
 * fact the instance states twice with different values at the same precision
 * is dropped rather than guessed.
 *
 * Pure: no network, no clock.
 */

import type { CompanyFacts, FactPoint } from "@/edgar/xbrl";

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

/** Every accession a companyfacts payload carries, and its newest periodic-report filing date. */
function carried(facts: CompanyFacts): { accessions: Set<string>; newestPeriodicFiled: string | null } {
  const accessions = new Set<string>();
  let newest: string | null = null;
  for (const namespace of Object.values(facts.facts)) {
    for (const concept of Object.values(namespace ?? {})) {
      const units = (concept as { units?: Record<string, unknown> } | null)?.units;
      if (units === null || typeof units !== "object") continue;
      for (const list of Object.values(units)) {
        if (!Array.isArray(list)) continue;
        for (const p of list as Partial<FactPoint>[]) {
          if (typeof p?.accn === "string") accessions.add(p.accn);
          if (typeof p?.form === "string" && /^10-[KQ]/.test(p.form.trim()) && typeof p.filed === "string" && (newest === null || p.filed > newest)) newest = p.filed;
        }
      }
    }
  }
  return { accessions, newestPeriodicFiled: newest };
}

export interface InstanceMerge {
  facts: CompanyFacts;
  /** The filings merged, oldest first; empty when companyfacts already carried every one. */
  merged: (InstanceFiling & { periodEnd: string | null; count: number })[];
  /** companyfacts' own newest periodic filing date before the merge. */
  companyFactsThrough: string | null;
}

/**
 * Adds to `facts` the instances of periodic filings filed after the newest
 * one companyfacts carries and absent from it. The input is not modified.
 */
export function mergeInstanceFacts(facts: CompanyFacts, instances: readonly InstanceFacts[]): InstanceMerge {
  const { accessions, newestPeriodicFiled } = carried(facts);
  const newer = instances
    .filter((i) => i.count > 0 && !accessions.has(i.filing.accession) && (newestPeriodicFiled === null || i.filing.filingDate > newestPeriodicFiled))
    .sort((a, b) => a.filing.filingDate.localeCompare(b.filing.filingDate));
  if (newer.length === 0) return { facts, merged: [], companyFactsThrough: newestPeriodicFiled };
  const out: CompanyFacts = { ...facts, facts: { ...facts.facts } };
  for (const instance of newer) {
    for (const [ns, concepts] of Object.entries(instance.facts)) {
      const namespace = { ...(out.facts[ns] ?? {}) };
      for (const [concept, units] of Object.entries(concepts)) {
        const existing = namespace[concept] as { units?: Record<string, unknown[]> } | undefined;
        const nextUnits: Record<string, unknown[]> = { ...(existing?.units ?? {}) };
        for (const [unit, points] of Object.entries(units)) nextUnits[unit] = [...(nextUnits[unit] ?? []), ...points];
        namespace[concept] = { ...(existing ?? { label: null, description: null }), units: nextUnits };
      }
      out.facts[ns] = namespace;
    }
  }
  return {
    facts: out,
    merged: newer.map((i) => ({ ...i.filing, periodEnd: i.periodEnd, count: i.count })),
    companyFactsThrough: newestPeriodicFiled,
  };
}
