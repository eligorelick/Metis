import type { ManifestEntry } from "@/types/core";
import type { DataCompleteness as PersistedDataCompleteness, SourceEntry } from "@/report/schema";
import { RESERVED_FIXTURE_MANIFEST_FIELD } from "@/providers/reservedSymbols";
import { resolvedAcquisitionReason } from "@/report/gapResolution";

/** Only source identity is needed to distinguish partial from missing coverage. */
export type CompletenessSource = Pick<SourceEntry, "provider" | "endpoint">;

export interface DataCompleteness {
  state: "complete" | "degraded" | "blocked";
  criticalCount: number;
  warningCount: number;
  edgar: "available" | "missing";
  xbrl: "checked" | "skipped" | "failed";
  forensicValidation: "complete" | "provisional";
}

/** Summarize provider gaps without treating a missing response as valid data. */
export function buildDataCompleteness(
  gaps: readonly ManifestEntry[],
): DataCompleteness {
  // Expected structural omissions (for example, a non-standardized filing
  // section that is intentionally absent for an issuer) are disclosures, not
  // provider failures. Exclude them from headline completeness states while
  // retaining them in the report's detailed manifest.
  const actionableGaps = gaps.filter((gap) => gap.expected !== true);
  // Reserved runs intentionally make no provider requests. Excluding their
  // expected omissions from incident counts must not imply successful checks.
  const fixtureOnly = gaps.some((gap) => gap.field.startsWith(`${RESERVED_FIXTURE_MANIFEST_FIELD}(`));
  const criticalCount = actionableGaps.filter((gap) => gap.severity === "critical").length;
  const warningCount = actionableGaps.filter((gap) => gap.severity === "warn").length;
  // A `keyless.*` entry reports on the EDGAR + Yahoo SUBSTITUTION layer, not on
  // EDGAR's availability, and it names its sources in prose ("served by edgar
  // (companyfacts→income-statement)"). Classifying those as EDGAR gaps inverted
  // the meaning: a keyed run that successfully filled its statements FROM
  // companyfacts — the best possible EDGAR outcome — reported `edgar: "missing"`
  // and downgraded forensics to "provisional". When EDGAR really is unavailable
  // its own `edgar.*` member gaps are in this same manifest and still classify.
  const edgarGaps = actionableGaps.filter(
    (gap) => /^(?:legacy\.audit\.)?(?:edgar(?:[.:(]|$)|company.?facts(?:[.:(]|$))/i.test(gap.field),
  );
  // Routing evidence and financial-method disclosures may mention successful
  // XBRL reads. Only cross-check namespaces describe the cross-check outcome.
  const xbrlGaps = actionableGaps.filter((gap) => /^(?:(?:validation|edgar|legacy\.audit)\.)?xbrl(?:CrossCheck)?(?:[.:(]|$)/i.test(gap.field));
  // "failed" must mean the cross-check RAN and disagreed — not that it could
  // not be performed. Stage A already encodes that distinction in severity: a
  // not-checkable period (no XBRL fact resolved, mixed currency) files an
  // `info` gap, while a real FMP↔XBRL disagreement files a `warn`. Classifying
  // on prose alone reported "failed" for reports that were merely never
  // cross-checked (e.g. a legacy report's "No XBRL/company-facts cross-check is
  // recorded", or "no XBRL fact matched period end=…").
  const xbrlCheckFailed = xbrlGaps.some(
    (gap) =>
      (gap.severity === "warn" || gap.severity === "critical") &&
      !/skip|not run|not checked|not checkable|no[t]?\s[^.]*\bcross-check\b|no xbrl fact/i.test(
        gap.reason,
      ),
  );
  const xbrl = fixtureOnly ? "skipped" as const : xbrlGaps.length === 0
    ? "checked" as const
    : xbrlCheckFailed
      ? "failed" as const
      : "skipped" as const;
  const edgar = fixtureOnly || edgarGaps.length > 0 ? "missing" as const : "available" as const;

  return {
    state: criticalCount > 0 ? "blocked" : actionableGaps.length > 0 ? "degraded" : "complete",
    criticalCount,
    warningCount,
    edgar,
    xbrl,
    forensicValidation: edgar === "missing" || xbrl !== "checked" ? "provisional" : "complete",
  };
}

/* ------------------------------------------------------------------------ *
 * D-67: what a reader counts as a data gap
 * ------------------------------------------------------------------------ */

type Severity = ManifestEntry["severity"];

/** One underlying gap, which several manifest entries may describe. */
export interface ClassifiedGap {
  /** Stable key of the underlying gap (the dataset or field it is about). */
  key: string;
  /** Severity as displayed: a downgraded entry shows "info". */
  severity: Severity;
  /** The highest severity any of its manifest entries recorded. */
  recordedSeverity: Severity;
  /** The manifest fields describing this gap, in manifest order. */
  fields: string[];
  /** The shortest reason among its entries (the full set is in the audit export). */
  reason: string;
  /** Why the displayed severity differs from the recorded one, when it does. */
  downgrade?: string;
}

export interface ManifestClassification {
  /** Critical and warning DATA gaps, one row per underlying gap. */
  dataGaps: ClassifiedGap[];
  /**
   * How the analysis ran or what verification found (a length cap, a
   * same-family judge, a named-person check): disclosed, but not missing data.
   */
  processDisclosures: ClassifiedGap[];
  /** Recorded as warnings, displayed as information, each with its reason. */
  downgraded: ClassifiedGap[];
}

const RANK: Record<Severity, number> = { info: 1, warn: 2, critical: 3 };

/** Provider fields another source of the same dataset reads under its own name. */
const DATASET_ALIAS: Record<string, string> = {
  historicalMarketCap: "marketCapHistory",
};

/**
 * The dataset a manifest field is about, so the provider failure, the
 * substitution layer's verdict and its detail entry count as one gap:
 * `fmp.historicalMarketCap(NVDA)`, `keyless.marketCapHistory` and
 * `keyless.marketCapHistory.shareBasis` all describe the missing market-cap
 * history. A field-level backfill entry keeps its own key.
 */
export function gapDatasetKey(field: string): string {
  const fmp = /^fmp\.([A-Za-z]+)\(/.exec(field);
  if (fmp) return DATASET_ALIAS[fmp[1]!] ?? fmp[1]!;
  const keyless = /^keyless\.([A-Za-z]+)(?:\.[A-Za-z]+)*$/.exec(field);
  if (keyless && !field.includes(".backfill.")) return DATASET_ALIAS[keyless[1]!] ?? keyless[1]!;
  return field;
}

/** Analysis-process disclosures: how the passes ran and what verification found. */
export function isProcessDisclosure(field: string): boolean {
  return field === "analysis.llm" || /^(?:llm|verify)\./.test(field);
}

/**
 * Why a recorded warning is information for a reader, or null when it is a
 * real data gap. Each rule names the evidence that makes the entry moot.
 */
function downgradeReason(gap: ManifestEntry, edgarAvailable: boolean): string | null {
  if (gap.severity !== "warn") return null;
  const resolved = resolvedAcquisitionReason(gap);
  if (resolved !== null) return resolved;
  // The 8-K, 10-K and 10-Q lists are read from SEC EDGAR submissions; the FMP
  // filings search is a convenience index of the same filings.
  if (/^fmp\.secFilingsSearch\(/.test(gap.field) && edgarAvailable) {
    return "The filing list is read from SEC EDGAR submissions, which were available; the provider's search index is not used.";
  }
  // A period mismatch alone does not establish an issuer's adoption date or
  // whether a withheld lease field contains operating or finance leases.
  // Keep that warning actionable until issuer-specific evidence resolves it.
  return null;
}

/**
 * D-67: the missing-data manifest as a reader counts it. One underlying gap
 * is one row however many entries describe it; analysis-process disclosures
 * are separated from data gaps; entries whose evidence shows them moot are
 * shown as information with the reason. Expected omissions and the data-only
 * `analysis.llm` banner entry keep their existing treatment. Pure: the
 * persisted counts are unchanged, so stored reports still confirm.
 */
export function classifyManifest(gaps: readonly ManifestEntry[]): ManifestClassification {
  const actionable = gaps.filter((gap) => gap.expected !== true);
  const edgarAvailable = buildDataCompleteness(gaps).edgar === "available";
  const groups = new Map<string, { kind: "data" | "process" | "downgraded"; entries: ManifestEntry[]; downgrade?: string }>();
  for (const gap of actionable) {
    if (gap.severity === "info") continue;
    const downgrade = isProcessDisclosure(gap.field) ? null : downgradeReason(gap, edgarAvailable);
    const kind = isProcessDisclosure(gap.field) ? "process" : downgrade !== null ? "downgraded" : "data";
    const key = `${kind}|${kind === "process" ? gap.field : gapDatasetKey(gap.field)}`;
    const group = groups.get(key) ?? { kind, entries: [], ...(downgrade !== null ? { downgrade } : {}) };
    group.entries.push(gap);
    groups.set(key, group);
  }
  const out: ManifestClassification = { dataGaps: [], processDisclosures: [], downgraded: [] };
  for (const [key, group] of groups) {
    const recordedSeverity = group.entries.reduce<Severity>((max, e) => (RANK[e.severity] > RANK[max] ? e.severity : max), "info");
    const reason = group.entries.reduce((best, e) => (e.reason.length < best.length ? e.reason : best), group.entries[0]!.reason);
    const row: ClassifiedGap = {
      key: key.slice(key.indexOf("|") + 1),
      severity: group.kind === "downgraded" ? "info" : recordedSeverity,
      recordedSeverity,
      fields: group.entries.map((e) => e.field),
      reason,
      ...(group.downgrade ? { downgrade: group.downgrade } : {}),
    };
    if (group.kind === "process") out.processDisclosures.push(row);
    else if (group.kind === "downgraded") out.downgraded.push(row);
    else out.dataGaps.push(row);
  }
  out.dataGaps.sort((a, b) => RANK[b.severity] - RANK[a.severity]);
  return out;
}

export type CompletenessMetadataStatus = "confirmed" | "missing" | "inconsistent";

export interface ReportCompletenessPresentation {
  metadataStatus: CompletenessMetadataStatus;
  dataOnly: boolean;
  analysisReason: string | null;
  actionableGapCount: number;
  additionalActionableGapCount: number;
  expectedGapCount: number;
  informationalActionableGapCount: number;
  state: PersistedDataCompleteness["state"] | "unknown";
  criticalCount: number | "unknown";
  warningCount: number | "unknown";
  edgar: PersistedDataCompleteness["edgar"] | "partial" | "unknown";
  xbrl: PersistedDataCompleteness["xbrl"] | "unknown";
  forensicValidation: PersistedDataCompleteness["forensicValidation"] | "unknown";
  bannerText: string | null;
  manifestText: string;
  statusText: string;
  /**
   * D-67: the manifest as a reader counts it (one row per underlying gap,
   * process disclosures apart, moot entries downgraded). The persisted
   * counts above keep their stored meaning.
   */
  classification: ManifestClassification;
  /** Critical data gaps, one per underlying gap. */
  dataCriticalCount: number;
  /** Warning-level data gaps, one per underlying gap. */
  dataWarningCount: number;
  /** Warning- or critical-level analysis-process disclosures. */
  processDisclosureCount: number;
}

function completenessMatches(
  persisted: PersistedDataCompleteness,
  recomputed: PersistedDataCompleteness,
): boolean {
  return persisted.state === recomputed.state
    && persisted.criticalCount === recomputed.criticalCount
    && persisted.warningCount === recomputed.warningCount
    && persisted.edgar === recomputed.edgar
    && persisted.xbrl === recomputed.xbrl
    && persisted.forensicValidation === recomputed.forensicValidation;
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Reconcile persisted completeness metadata with the raw manifest before any
 * renderer describes the report as complete. Missing or stale metadata stays
 * explicitly unknown; it is never silently replaced with a recomputation.
 */
export function deriveReportCompletenessPresentation(
  persisted: PersistedDataCompleteness | undefined,
  gaps: readonly ManifestEntry[],
  retainedSources: readonly CompletenessSource[] = [],
): ReportCompletenessPresentation {
  const recomputed = buildDataCompleteness(gaps);
  const metadataStatus: CompletenessMetadataStatus = persisted === undefined
    ? "missing"
    : completenessMatches(persisted, recomputed)
      ? "confirmed"
      : "inconsistent";
  const analysisEntries = gaps.filter((gap) => gap.field === "analysis.llm");
  const analysisReason = analysisEntries[0]?.reason ?? null;
  const actionable = gaps.filter((gap) => gap.expected !== true);
  const additionalActionable = actionable.filter((gap) => gap.field !== "analysis.llm");
  const expectedGapCount = gaps.filter((gap) => gap.expected === true).length;
  const informationalActionableGapCount = additionalActionable.filter(
    (gap) => gap.severity === "info",
  ).length;
  const fixtureOnly = gaps.some((gap) => gap.field.startsWith(`${RESERVED_FIXTURE_MANIFEST_FIELD}(`));
  const edgar = metadataStatus !== "confirmed" ? "unknown" : persisted!.edgar === "missing" && !fixtureOnly &&
    retainedSources.some((source) => source.provider === "edgar" && source.endpoint.trim() !== "") ? "partial" : persisted!.edgar;

  const statusText = metadataStatus === "confirmed"
    ? `Data completeness: ${persisted!.state}; recorded entries: critical ${persisted!.criticalCount}; warnings ${persisted!.warningCount}; EDGAR ${edgar}; XBRL ${persisted!.xbrl}; forensics ${persisted!.forensicValidation}.`
    : metadataStatus === "missing"
      ? "Completeness unknown: persisted completeness metadata was not recorded."
      : "Completeness unknown: persisted completeness metadata could not be confirmed against the missing-data manifest.";

  const manifestParts: string[] = [];
  if (gaps.length === 0) {
    manifestParts.push("No missing-data entries recorded.");
  } else {
    manifestParts.push(countLabel(actionable.length, "actionable gap", "actionable gaps"));
    if (expectedGapCount > 0) {
      manifestParts.push(countLabel(expectedGapCount, "expected disclosure", "expected disclosures"));
    }
  }
  if (metadataStatus !== "confirmed") manifestParts.push(statusText);

  let bannerText: string | null = null;
  if (analysisReason !== null) {
    const prefix = `No completed multi-pass analysis. ${analysisReason}`;
    if (metadataStatus === "confirmed" && additionalActionable.length === 0) {
      bannerText = `${prefix} Deterministic data is complete.`;
    } else if (metadataStatus === "confirmed") {
      bannerText = `${prefix} ${countLabel(additionalActionable.length, "additional data gap", "additional data gaps")} recorded.`;
    } else {
      bannerText = `${prefix} ${statusText}`;
    }
  }

  const classification = classifyManifest(gaps);
  return {
    classification,
    dataCriticalCount: classification.dataGaps.filter((gap) => gap.severity === "critical").length,
    dataWarningCount: classification.dataGaps.filter((gap) => gap.severity === "warn").length,
    processDisclosureCount: classification.processDisclosures.length,
    metadataStatus,
    dataOnly: analysisReason !== null,
    analysisReason,
    actionableGapCount: actionable.length,
    additionalActionableGapCount: additionalActionable.length,
    expectedGapCount,
    informationalActionableGapCount,
    state: metadataStatus === "confirmed" ? persisted!.state : "unknown",
    criticalCount: metadataStatus === "confirmed" ? persisted!.criticalCount : "unknown",
    warningCount: metadataStatus === "confirmed" ? persisted!.warningCount : "unknown",
    edgar,
    xbrl: metadataStatus === "confirmed" ? persisted!.xbrl : "unknown",
    forensicValidation: metadataStatus === "confirmed"
      ? persisted!.forensicValidation
      : "unknown",
    bannerText,
    manifestText: manifestParts.join(" "),
    statusText,
  };
}
