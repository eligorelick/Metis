import { providerGeographyContradiction, type GeographyContradiction } from "@/edgar/segmentFacts";
import { listingSuffix } from "@/pipeline/peers";
import { normalizeFinancialUnit, unitCurrency } from "@/report/format";
import { geographicBasisNote } from "@/report/presentation";
import type { Report, TracedNumber } from "@/report/schema";

/**
 * Immutable view of a stored report made before this batch's report spec
 * (audit 2026-10-27, B3, D-67): the stored record kinds that were wrong as
 * shown are displayed under the current rules. The stored report, its bytes and
 * its recorded counts are never rewritten; a report at or after the cutoff is
 * returned as the identical object.
 *
 * Every note below is a fixed string: no provider, filing or model text reaches
 * it, because those are untrusted.
 */
export const PAYLOAD_RECORD_CORRECTION_SPEC = "1.45.0";
export const PAYLOAD_RECORD_CORRECTION_FIELD = "presentation.payloadRecords";
export const PAYLOAD_RECORD_CORRECTION_NOTE =
  "Deterministic presentation correction: foreign peer market caps shown without a currency, insider transaction counts shown as shares, the capex/D&A average label, the data-only FRED unit sentences, provider geography the report's own XBRL segment tables contradict, and the data-only label that called the fiscal-year FCF conversion graded; the displayed coverage counts exclude the corrected entries; no analyst or model rerun occurred; the stored report and its recorded counts are unchanged.";

const PEER_NOTE = "Peer market cap: the provider row states no currency and this listing's exchange suffix differs from the subject's; reports before spec 1.45.0 gave it the subject's currency (D-57, amended by D-124), so its currency is not established.";
const INSIDER_NOTE = "FMP's insider total purchases and sales count open-market transactions, not shares, and covered only FMP's newest calendar quarter at the fetch date, which may have been the quarter in progress (D-125).";
const LOG_NOTE = "(display correction, D-124, D-125, D-127)";
const CAPEX_PERIOD_OLD = "capex / D&A, 5y average";
const CAPEX_PERIOD_NEW = "capex / D&A, average of up to 5 fiscal years (the number averaged was not recorded)";
const CAPEX_SOURCE = "computed.capital.maintenanceVsGrowthCapex";
const INSIDER_IDS: ReadonlySet<string> = new Set(["payload.insiders.insider-total-purchases", "payload.insiders.insider-total-sales"]);
const GEOGRAPHY_ID_PREFIX = "payload.segments.geographic-";
const SHARED_GEOGRAPHY_SOURCE = "fmp:revenue-geographic-segmentation";
const OLD_FCF_LABEL = "FCF conversion (FCF before SBC / net income — the graded ratio)";
const NEW_FCF_LABEL = "FCF conversion (FCF before SBC / net income)";

const LEGACY_GEOGRAPHY_NOTES: Readonly<Record<GeographyContradiction, string>> = {
  "business-segments": "Not company geography: these provider rows name the issuer's reportable business segments in this report's XBRL segment table; reports before spec 1.45.0 listed them as geography (D-80, applied to provider rows by D-127).",
  "issuer-geography": "Not established as company geography: the issuer tags its own geographic revenue (this report's XBRL geographic table), and at least one of these provider region names is not among that table's labels; reports before spec 1.45.0 listed them as geography (D-80, applied to provider rows by D-127).",
};

/** The generator's exact data-only sentences that were false (AI-310); model-written text never contains them. */
const MACRO_SENTENCES: Readonly<Record<string, readonly [string, string]>> = {
  APU000072610: ["Displayed in USD per therm.", "Displayed in USD per kilowatt-hour."],
  PCE: ["Displayed in USD (FRED serves billions; shown ×1,000,000,000).", "Displayed in USD at a seasonally adjusted annual rate (FRED serves billions; shown ×1,000,000,000)."],
  PCEND: ["Displayed in USD (FRED serves billions; shown ×1,000,000,000).", "Displayed in USD at a seasonally adjusted annual rate (FRED serves billions; shown ×1,000,000,000)."],
  PCEDG: ["Displayed in USD (FRED serves billions; shown ×1,000,000,000).", "Displayed in USD at a seasonally adjusted annual rate (FRED serves billions; shown ×1,000,000,000)."],
};

/** Numeric semver compare; an unparsable version counts as before. */
export function specVersionBefore(version: string, cutoff: string): boolean {
  const parse = (v: string): number[] | null => {
    const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
    return m === null ? null : [Number(m[1]), Number(m[2]), Number(m[3])];
  };
  const a = parse(version);
  const b = parse(cutoff);
  if (a === null) return true;
  if (b === null) return false;
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i]! < b[i]!;
  return false;
}

const idOf = (n: Pick<TracedNumber, "sourceId" | "source">): string => n.sourceId ?? n.source;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isTraced = (v: unknown): v is TracedNumber =>
  isRecord(v) && typeof v.value === "number" && typeof v.unit === "string" && typeof v.source === "string" && "verified" in v && "asOf" in v;

/** Rebuild only what changed: an untouched subtree is returned as the same object. */
function mapTraced(value: unknown, fix: (n: TracedNumber) => TracedNumber): unknown {
  if (Array.isArray(value)) {
    const next = value.map((item) => mapTraced(item, fix));
    return next.some((item, i) => item !== value[i]) ? next : value;
  }
  if (!isRecord(value)) return value;
  if (isTraced(value)) return fix(value);
  let changed = false;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const mapped = mapTraced(child, fix);
    if (mapped !== child) changed = true;
    next[key] = mapped;
  }
  return changed ? next : value;
}

type Coverage = NonNullable<Report["meta"]["provenanceCoverage"]>;

/** Displayed counts follow the marks (docs/METHODOLOGY.md, the stored-report read rule); totals never change. */
function adjustCoverage(coverage: Coverage | undefined, numericDrop: number, factualMove: number): Coverage | undefined {
  if (coverage === undefined || (numericDrop === 0 && factualMove === 0)) return coverage;
  const supported = coverage.numeric.supported - numericDrop;
  const fv = coverage.factualValidation;
  if (supported < 0 || (fv !== undefined && fv.validated - factualMove < 0)) return coverage;
  const numeric = { ...coverage.numeric, supported, rate: coverage.numeric.total === 0 ? null : supported / coverage.numeric.total };
  if (fv === undefined) return { ...coverage, numeric };
  const validated = fv.validated - factualMove;
  return { ...coverage, numeric, factualValidation: { ...fv, validated, unchecked: fv.unchecked + factualMove, rate: fv.total === 0 ? null : validated / fv.total } };
}

export function withLegacyPayloadRecordSafety(report: Report): Report {
  if (!specVersionBefore(report.meta.specVersion, PAYLOAD_RECORD_CORRECTION_SPEC)) return report;
  const kinds: string[] = [];

  // Rule 1 (AI-301): peer caps on another listing market than the subject's are not money in the subject's currency.
  const subjectSuffix = listingSuffix(report.meta.symbol);
  const peerIds = new Set<string>();
  for (const row of report.competitive?.peerTable ?? []) {
    if (row.symbol === null || listingSuffix(row.symbol) === subjectSuffix) continue;
    for (const metric of row.metrics) {
      if (idOf(metric).startsWith("payload.peers.") && normalizeFinancialUnit(metric.unit) === "usd" && metric.currency !== null) peerIds.add(idOf(metric));
    }
  }

  // Rules 1, 2, 4: every traced number of a corrected kind, wherever the report shows it.
  const fix = (n: TracedNumber): TracedNumber => {
    const id = idOf(n);
    if (peerIds.has(id) && normalizeFinancialUnit(n.unit) === "usd" && n.currency !== null) {
      kinds.push("foreign peer market caps");
      // A unit that names a currency ("USD") would establish it again (format.ts establishedCurrency), so it becomes "currency".
      return { ...n, unit: unitCurrency(n.unit) === null ? n.unit : "currency", currency: null, verified: false, verificationNote: PEER_NOTE };
    }
    if (INSIDER_IDS.has(id) && n.unit === "shares") {
      kinds.push("insider transaction counts");
      return { ...n, unit: "count", verified: false, verificationNote: INSIDER_NOTE };
    }
    if ((n.source === CAPEX_SOURCE || id === CAPEX_SOURCE) && n.period === CAPEX_PERIOD_OLD) {
      kinds.push("capex/D&A average label");
      return { ...n, period: CAPEX_PERIOD_NEW };
    }
    return n;
  };
  let next = mapTraced(report, fix) as Report;

  // Rule 5 (AI-310, data-only): the generator's exact false unit sentences.
  const series = next.macro?.relevantSeries;
  if (series !== undefined) {
    const fixed = series.map((row) => {
      const pair = MACRO_SENTENCES[row.seriesId];
      return pair === undefined || !row.relevance.includes(pair[0]) ? row : { ...row, relevance: row.relevance.replace(pair[0], pair[1]) };
    });
    if (fixed.some((row, i) => row !== series[i])) {
      kinds.push("FRED data-only unit sentences");
      next = { ...next, macro: { ...next.macro, relevantSeries: fixed } };
    }
  }

  // Rule 7 (AI-509): provider geography the report's own XBRL tables contradict.
  const geographicIds = new Set<string>();
  const geographic = next.business?.segments?.geographic ?? [];
  const isProvider = (row: (typeof geographic)[number]): boolean => {
    const id = idOf(row.revenue);
    return id.startsWith(GEOGRAPHY_ID_PREFIX) || id === SHARED_GEOGRAPHY_SOURCE;
  };
  const providerRows = geographic.filter(isProvider);
  if (providerRows.length > 0 && geographicBasisNote(geographic) === null) {
    const why = providerGeographyContradiction(
      providerRows.map((row) => row.name),
      (next.filingDisclosures?.segments ?? []).map((s) => ({ axis: s.axis, rows: s.rows.map((r) => ({ label: r.label })) })),
    );
    if (why !== null) {
      const note = LEGACY_GEOGRAPHY_NOTES[why];
      let changed = false;
      const rows = geographic.map((row) => {
        if (!isProvider(row)) return row;
        const id = idOf(row.revenue);
        if (id.startsWith(GEOGRAPHY_ID_PREFIX)) geographicIds.add(id);
        if (row.sharePct === null && row.revenue.verified === false && row.revenue.verificationNote === note) return row;
        changed = true;
        return { ...row, sharePct: null, revenue: { ...row.revenue, verified: false, verificationNote: note } };
      });
      if (changed) next = { ...next, business: { ...next.business, segments: { ...next.business.segments, geographic: rows } } };
      // The same record cited anywhere else in the report (a key number, a table cell) carries the same mark, as rules 1 and 2 do.
      const marked = mapTraced(next, (n) =>
        !geographicIds.has(idOf(n)) || (n.verified === false && n.verificationNote === note) ? n : { ...n, verified: false, verificationNote: note }) as Report;
      if (marked !== next) changed = true;
      next = marked;
      if (changed) kinds.push("provider geography");
    }
  }

  // Rule 8 (AI-511, data-only): the fiscal-year FCF conversion is not the graded figure.
  const fcf = next.fundamentals?.fcf;
  if (fcf?.some((row) => row.label === OLD_FCF_LABEL)) {
    kinds.push("FCF conversion label");
    next = { ...next, fundamentals: { ...next.fundamentals, fcf: fcf.map((row) => (row.label === OLD_FCF_LABEL ? { ...row, label: NEW_FCF_LABEL } : row)) } };
  }

  // Rule 3: the log entries of the corrected ids follow their marks.
  const corrected = new Set<string>([...peerIds, ...INSIDER_IDS, ...geographicIds]);
  let numericDrop = 0;
  let factualMove = 0;
  const log = next.appendix?.verificationLog;
  if (log !== undefined) {
    const fixedLog = log.map((entry) => {
      if (entry.source === undefined || !corrected.has(entry.source)) return entry;
      const status = entry.validationStatus === "validated";
      const support = entry.numericSupportStatus === "validated";
      const outcome = entry.outcome === "verified";
      if (!status && !support && !outcome) return entry;
      if (outcome && entry.evidenceKind === "number") numericDrop += 1;
      if (status && entry.evidenceKind === "factual-claim") factualMove += 1;
      return {
        ...entry,
        ...(outcome ? { outcome: "unverified" as const } : {}),
        ...(status ? { validationStatus: "unchecked" as const } : {}),
        ...(support ? { numericSupportStatus: "unchecked" as const } : {}),
        note: entry.note ? `${entry.note} ${LOG_NOTE}` : LOG_NOTE,
      };
    });
    if (fixedLog.some((entry, i) => entry !== log[i])) {
      if (fixedLog.some((entry, i) => entry !== log[i] && entry.source !== undefined && INSIDER_IDS.has(entry.source))) kinds.push("insider transaction counts");
      next = { ...next, appendix: { ...next.appendix, verificationLog: fixedLog } };
    }
  }

  // Rule 3b: the header counts follow the marks.
  const meta = adjustCoverage(next.meta.provenanceCoverage, numericDrop, factualMove);
  if (meta !== next.meta.provenanceCoverage) next = { ...next, meta: { ...next.meta, provenanceCoverage: meta } };
  const appendix = adjustCoverage(next.appendix?.provenanceCoverage, numericDrop, factualMove);
  if (appendix !== next.appendix?.provenanceCoverage) next = { ...next, appendix: { ...next.appendix, provenanceCoverage: appendix } };

  // Rule 6: one disclosure, once.
  if (next === report) return report;
  const kindsFired = [...new Set(kinds)];
  if (next.appendix.missingData.some((gap) => gap.field === PAYLOAD_RECORD_CORRECTION_FIELD)) return next;
  return {
    ...next,
    appendix: {
      ...next.appendix,
      missingData: [...next.appendix.missingData, {
        field: PAYLOAD_RECORD_CORRECTION_FIELD, reason: PAYLOAD_RECORD_CORRECTION_NOTE, severity: "info" as const, expected: true, attemptedSources: kindsFired,
      }],
    },
  };
}
