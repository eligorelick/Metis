import { z } from "zod";
import { QUOTE_STALE_DAYS } from "@/pipeline/stageA/validate";
import type { FetchResult } from "@/types/core";
import type { Report } from "@/report/schema";

const NullableStamp = z.string().nullable();
const AcquisitionSchema = z.object({ source: z.string(), at: NullableStamp }).strict();

/** Pipeline-owned timing evidence, separate from model-authored valuation assumptions. */
export const EvidenceTimingSchema = z.object({
  version: z.literal("1"),
  cutoffAt: NullableStamp,
  quote: z.object({ observedAt: NullableStamp, acquiredAt: NullableStamp, stale: z.boolean().nullable() }).strict(),
  financialPeriods: z.array(z.object({ source: z.string(), periodEnd: NullableStamp }).strict()),
  filings: z.array(z.object({ source: z.string(), form: z.string().nullable(), reportDate: NullableStamp, filedAt: NullableStamp }).strict()),
  publications: z.array(z.object({ source: z.string(), publishedAt: NullableStamp }).strict()),
  acquisitions: z.array(AcquisitionSchema),
  calculationAsOf: NullableStamp,
  calculatedAt: NullableStamp,
  reportGeneratedAt: NullableStamp,
}).strict();
export type EvidenceTiming = z.infer<typeof EvidenceTimingSchema>;

const STATEMENTS = ["incomeAnnual", "incomeQuarterly", "balanceAnnual", "balanceQuarterly", "cashflowAnnual", "cashflowQuarterly"] as const;
const FILINGS = ["latestTenK", "latestTenQ", "item1a", "mdna", "tenQMdna"] as const;
interface FilingDates { form?: string; reportDate?: string; filingDate?: string }
interface StatementDates { date?: string; filingDate?: string }
/** Narrow input keeps the disclosure independently testable; DataBundle satisfies it. */
export interface EvidenceTimingBundle {
  builtAt: string;
  quote?: FetchResult<{ rows: readonly { timestamp?: number }[] }>;
  statements?: Partial<Record<(typeof STATEMENTS)[number], FetchResult<{ rows: readonly StatementDates[] }>>>;
  edgar?: Partial<Record<(typeof FILINGS)[number], FetchResult<FilingDates>>>;
  sourceManifest?: Readonly<Record<string, { fetchedAt: string; provider?: string; endpoint?: string; asOf?: string; stale?: boolean }>>;
}

const supplied = (value: unknown): string | null => typeof value === "string" && value.trim() ? value : null;

/** Full ISO validation avoids Date.parse's impossible-date rollovers and local-time guesses. */
function stampMs(value: string | null): number | null {
  if (value === null) return null;
  const match = /^(\d{4}-\d{2}-\d{2})(?:T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?$/.exec(value);
  if (!match) return null;
  const ms = Date.parse(value);
  const day = Date.parse(`${match[1]}T00:00:00Z`);
  return Number.isFinite(ms) && Number.isFinite(day) && new Date(day).toISOString().slice(0, 10) === match[1] ? ms : null;
}

/** The quote contract is Unix seconds; financial period strings are never parsed as numbers. */
function quoteStamp(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 253_402_300_799) return null;
  return new Date(value * 1000).toISOString();
}

export function buildEvidenceTiming(
  bundle: EvidenceTimingBundle,
  options: { calculationAsOf: string | null; reportGeneratedAt: string },
): EvidenceTiming {
  const quote = bundle.quote?.ok ? bundle.quote.value : null;
  const acquisitions: EvidenceTiming["acquisitions"] = Object.entries(bundle.sourceManifest ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([source, entry]) => ({ source, at: supplied(entry.fetchedAt) }));
  const capture = (source: string, result: FetchResult<unknown> | undefined) => {
    if (result?.ok && !acquisitions.some((entry) => entry.source === source)) acquisitions.push({ source, at: supplied(result.value.fetchedAt) });
  };
  capture("quote", bundle.quote);
  const financialPeriods = STATEMENTS.flatMap((key) => {
    const result = bundle.statements?.[key];
    capture(`statements.${key}`, result);
    if (!result?.ok) return [];
    // Only actual statement dates establish financial periods. Envelope asOf can be a fallback.
    const periodEnd = supplied(result.value.data.rows[0]?.date);
    return periodEnd === null ? [] : [{ source: `statements.${key}`, periodEnd }];
  });
  const statementFilings = STATEMENTS.flatMap((key) => {
    const result = bundle.statements?.[key];
    const row = result?.ok ? result.value.data.rows[0] : undefined;
    return supplied(row?.filingDate) === null ? [] : [{ source: `statements.${key}`, form: null, reportDate: supplied(row?.date), filedAt: supplied(row?.filingDate) }];
  });
  const filings = [...statementFilings, ...FILINGS.flatMap((key) => {
    const result = bundle.edgar?.[key];
    capture(`edgar.${key}`, result);
    if (!result?.ok) return [];
    return [{ source: `edgar.${key}`, form: supplied(result.value.data.form), reportDate: supplied(result.value.data.reportDate), filedAt: supplied(result.value.data.filingDate) }];
  })];
  return {
    version: "1",
    cutoffAt: supplied(options.reportGeneratedAt),
    quote: { observedAt: quoteStamp(quote?.data.rows[0]?.timestamp), acquiredAt: supplied(quote?.fetchedAt), stale: quote?.stale ?? (quote ? false : null) },
    financialPeriods,
    filings,
    // Existing filing metadata establishes filing, not a separate publication time.
    publications: [],
    acquisitions: acquisitions.sort((a, b) => a.source.localeCompare(b.source)),
    calculationAsOf: supplied(options.calculationAsOf),
    // Stage B is pure and has an analysis cutoff, not a recorded wall-clock execution stamp.
    calculatedAt: null,
    reportGeneratedAt: supplied(options.reportGeneratedAt),
  };
}

export interface EvidenceTimingRow { label: string; value: string }
export const EVIDENCE_TIMING_NOTE = "Dates describe different events. The analysis cutoff is the calculation basis; an actual calculation timestamp is not supplied unless explicitly recorded. Acquisition does not establish publication or quote observation. These disclosures do not establish valuation accuracy.";

function dateText(value: string | null, cutoff: number | null): string {
  if (value === null) return "not supplied";
  const ms = stampMs(value);
  if (ms === null) return `${value} (invalid date)`;
  return cutoff !== null && ms > cutoff ? `${value} (future to disclosure cutoff)` : value;
}

function legacyTiming(report: Report): EvidenceTiming {
  const sources = report.appendix.sources;
  const quote = sources.find((source) => /(?:^|[/.(\s])(?:batch-)?quote(?:$|[/.(\s?])/i.test(source.endpoint));
  return {
    version: "1", cutoffAt: supplied(report.meta.generatedAt),
    quote: { observedAt: null, acquiredAt: supplied(quote?.fetchedAt), stale: quote?.stale ?? null },
    // Historical as-of maps retain provider envelopes, which may fall back to
    // the fetch date. They do not independently establish financial periods.
    financialPeriods: [],
    filings: [], publications: [],
    acquisitions: sources.map((source) => ({ source: `${source.provider}:${source.endpoint}`, at: supplied(source.fetchedAt) })),
    calculationAsOf: null, calculatedAt: null, reportGeneratedAt: supplied(report.meta.generatedAt),
  };
}

/** Shared unescaped wording. React, Markdown and print apply their own context-safe escaping. */
export function evidenceTimingRows(report: Report): EvidenceTimingRow[] {
  const timing = report.meta.evidenceTiming ?? legacyTiming(report);
  const cutoff = stampMs(timing.cutoffAt);
  const observed = stampMs(timing.quote.observedAt);
  let observation = dateText(timing.quote.observedAt, cutoff);
  if (timing.quote.observedAt === null) observation += "; current observation cannot be established";
  else if (observed === null) observation += "; current observation cannot be established";
  else if (cutoff === null) observation += "; cutoff invalid; current observation cannot be established";
  else if (observed > cutoff) observation = `${timing.quote.observedAt} (future to disclosure cutoff; current observation cannot be established)`;
  else {
    // Same calendar-day basis and threshold as Stage A quote validation.
    const observationDay = Date.parse(`${timing.quote.observedAt.slice(0, 10)}T00:00:00Z`);
    if (cutoff - observationDay > QUOTE_STALE_DAYS * 86_400_000) observation += `; older than ${QUOTE_STALE_DAYS} calendar days (existing freshness policy)`;
  }
  if (timing.quote.stale === true) observation += "; served past cache TTL";
  const quoteAcquired = stampMs(timing.quote.acquiredAt);
  if (cutoff !== null && quoteAcquired !== null && quoteAcquired > cutoff) observation += "; acquisition is future to disclosure cutoff; current observation cannot be established";
  const acquisitions = [...new Set(timing.acquisitions.map((item) => item.at).filter((at): at is string => at !== null))]
    .sort((a, b) => (stampMs(a) ?? Number.POSITIVE_INFINITY) - (stampMs(b) ?? Number.POSITIVE_INFINITY) || a.localeCompare(b));
  const invalidAcquisitions = acquisitions.filter((at) => stampMs(at) === null);
  const datedAcquisitions = acquisitions.filter((at) => stampMs(at) !== null);
  const acquisitionRange = datedAcquisitions.length === 0 ? "" : datedAcquisitions.length === 1
    ? dateText(datedAcquisitions[0], cutoff)
    : `${dateText(datedAcquisitions[0], cutoff)} to ${dateText(datedAcquisitions[datedAcquisitions.length - 1], cutoff)}`;
  const acquisitionText = [acquisitionRange, ...invalidAcquisitions.map((at) => dateText(at, cutoff))].filter(Boolean).join("; ") || "not supplied";
  const rows: EvidenceTimingRow[] = [
    { label: "Quote observation", value: observation },
    { label: "Quote acquisition", value: dateText(timing.quote.acquiredAt, cutoff) },
    { label: "Financial period ends", value: timing.financialPeriods.map((item) => `${item.source}: ${dateText(item.periodEnd, cutoff)}`).join("; ") || "not supplied" },
    { label: "Filing", value: timing.filings.map((item) => `${item.source}${item.form ? ` (${item.form})` : ""}: filed ${dateText(item.filedAt, cutoff)}; financial report period end ${dateText(item.reportDate, cutoff)}`).join("; ") || "not supplied" },
    { label: "Publication", value: timing.publications.map((item) => `${item.source}: ${dateText(item.publishedAt, cutoff)}`).join("; ") || "not supplied" },
    { label: "Input acquisition", value: acquisitionText },
    { label: "Analysis cutoff / calculation basis", value: dateText(timing.calculationAsOf, cutoff) },
    { label: "Calculation time", value: dateText(timing.calculatedAt, cutoff) },
    { label: "Report generated", value: dateText(timing.reportGeneratedAt, cutoff) },
    { label: "Disclosure cutoff", value: dateText(timing.cutoffAt, cutoff) },
  ];
  if (!report.meta.evidenceTiming) {
    const quoteAsOf = Object.entries(report.meta.asOfMap).filter(([key]) => /^quote(?:\.|$)/.test(key));
    const envelope = quoteAsOf.map(([key, value]) => `${key}: ${dateText(value, cutoff)}`).join("; ");
    if (envelope) rows.splice(1, 0, { label: "Quote envelope as of", value: `${envelope}; actual observation timestamp not supplied` });
    const statementAsOf = Object.entries(report.meta.asOfMap)
      .filter(([key]) => /^statements\./.test(key))
      .sort(([a], [b]) => a.localeCompare(b));
    const statementEnvelope = statementAsOf.map(([key, value]) => `${key}: ${dateText(value, cutoff)}`).join("; ");
    if (statementEnvelope) rows.splice(rows.findIndex((row) => row.label === "Financial period ends") + 1, 0, {
      label: "Statement envelope as of",
      value: `${statementEnvelope}; actual financial period end not supplied`,
    });
  }
  return rows;
}
