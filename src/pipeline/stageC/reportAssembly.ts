/**
 * Report assembly, split out of passes.ts: builds the report from the judge output and the
 * computed figures (sources, as-of map, scenario targets, fair value, DCF display, multiples,
 * reverse DCF, forensic scores, segment shares, product-line headings). Code owns every number
 * (P18, P20, P22).
 */

import { withRetiredGapWording } from "@/report/retiredReaderWording";
import { vendorAgreesWithFiled } from "@/edgar/vendorAgreement";
import { withComputationContext } from "@/edgar/computationContext";
/**
 * Stage C — the four grounded LLM pass runners plus report assembly.
 *
 * Every runner takes the anthropic `runPass` fn INJECTED (a {@link RunPassFn})
 * so tests drive the passes without a live API.
 * The runners never crash the app: a keyless / refusal / max_tokens outcome
 * comes back as a typed failure the orchestrator can branch on and file as a
 * gap (rule #4).
 *
 * Passes:
 *  - runBullPass / runBearPass: plain-text web research (max ~8 uses), then
 *    tool-free ANALYST_CASE_SCHEMA writing. runBullThenBear sequences research per the prompt-cache
 *    rule (fire bull, await its first streamed token so the cache entry becomes
 *    readable, then fire bear — avoids a double 1.25x cache write, the prompt-cache rule).
 *  - runJudgePass: payload + both cases -> JSON-only JUDGE_OUTPUT_SCHEMA,
 *    validated locally with Zod. The full judge schema is NOT sent as
 *    Anthropic strict structured output because the live grammar compiler rejects
 *    it as too large; the schema is included as prompt text instead.
 *  - runVerifyPass: measures CITATION COVERAGE (provenance, NOT correctness).
 *    Every TracedNumber must resolve an exact registry ID and match value, unit,
 *    currency, period, and as-of. Its printed description must not conflict with
 *    the cited metric (D-144). Prose citations must resolve an exact payload
 *    source/date or an observed fetched URL; this is counted separately from
 *    numeric prose support. Prose numbers additionally require a typed value
 *    or an unambiguous metric/unit/period binding to retained source spans.
 *    Qualitative prose remains cited-only. Untraceable evidence is flagged
 *    [unverified] and never silently deleted. The pass does not independently
 *    re-derive formulas or validate whether a cited source itself is correct.
 *  - assembleReport: wraps a JudgeOutput with meta + appendix and validates the
 *    whole thing against ReportSchema (throws a typed error on failure so the
 *    runner can retry the judge with the Zod error — max 2 retries).
 *
 * SERVER-ONLY in production (the real runPass reads ANTHROPIC_API_KEY), but this
 * module imports NO provider client directly — runPass is injected — so it is
 * unit-testable in a plain node environment.
 */
import { balanceIntegrityView } from "@/pipeline/balanceIntegrity";
import { withPrimaryCapitalBasis, primaryCapitalManifest, primaryCapitalAudit } from "@/pipeline/primaryCapitalBasis";
import { bankRevenueManifest } from "@/pipeline/incomeBasis";
import type { ManifestEntry } from "@/types/core";
import { returnPathLanguageManifestEntries } from "@/pipeline/stageC/returnPathLanguage";
import { sourceManifestEntries, type DataBundle } from "@/pipeline/types";
import { selectedGeographyNotes } from "@/edgar/annualGeography";
import { admittedGeography, withoutMemberMarker } from "@/edgar/segmentFacts";
import { routeMetricsBlock, statementCurrencies, type ComputedMetrics } from "@/pipeline/compute";
import { computeDcfDisplay } from "@/pipeline/stageB/fairValue";
import { EV_LEASE_SETTING_TEXT, isStartingGrowthFamily, type MultipleKey, type MultipleStat } from "@/pipeline/stageB/valuation";
import { piotroskiSignalOutcomes } from "@/pipeline/stageB/forensics";
import { applyScenarioPresentation, buildScenarioPresentation, comparableScenarioPrice } from "@/report/scenarioPresentation";
import { buildThesisTriggers } from "@/report/thesisTriggers";
import { guardEarningsReferences } from "@/report/earningsReferences";
import { guardEarningsSchedule } from "@/report/earningsSchedule";
import { buildEvidenceTiming } from "@/report/evidenceTiming";
import { technicalTrendText } from "@/report/technicalTrend";
import { buildSourceFactSummary } from "@/report/sourceFacts";
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import { buildMarketData } from "@/pipeline/marketData";
import { EVIDENCE_CONTRACT_VERSION } from "@/report/evidenceContract";
import { ReportSchema, DISCLAIMER_TEXT, REPORT_SPEC_VERSION, productLineHeadingKey, UNNAMED_PRODUCT_LINE_HEADING, type JudgeOutput, type Report, type ReportMeta, type Appendix, type SourceEntry, type CostBreakdownEntry, type VerificationLogEntry, type TracedNumber, type ProvenanceCoverage, type ScenarioTargets, type FairValue } from "@/report/schema";
import { assembleContextPayload, segmentRecordCitations, type SegmentRecordCitation, degradationDisclosures, sourceEvidenceDisclosures, guidanceLowCitation, nextEarningsNote, type ContextPayload } from "@/pipeline/stageC/payload";
import { buildDataCompleteness } from "@/report/completeness";
import { applyGradeOverrideContract } from "@/pipeline/stageC/gradeContract";
import { applyReportAssessmentStatus } from "@/report/assessment";
import { applyFinancialDiagnostics } from "@/report/financialDiagnostics";
import { applyConfidenceCeilings } from "@/pipeline/stageC/confidenceCeiling";
import { attributeJudgeProtocolDisclosures, buildExecutionMetadataEntry } from "@/report/execution";
import { completeJudgeProtocol, judgeProtocolManifestEntries, type JudgeProtocolDraft } from "@/pipeline/stageC/judgeProtocol";
import { consistencyManifestEntries } from "@/pipeline/stageC/consistency";
import { annotateSharedModelFamily, sharedModelFamilyOf } from "@/report/execution";
import type { ConsistencyChecks } from "@/report/schema";
import { ReportValidationError } from "./passParsing";

/* ------------------------------------------------------------------------ *
 * assembleReport — wrap JudgeOutput with meta + appendix, validate
 * ------------------------------------------------------------------------ */

export interface AssembleReportArgs {
  symbol: string;
  bundle: DataBundle;
  computed: ComputedMetrics;
  judgeOutput: JudgeOutput;
  verify: {
    verificationRate: number | null;
    /** Omitted only by legacy/test callers; generation passes explicit coverage. */
    coverage?: ProvenanceCoverage;
    /** WS7 (D-20): deterministic check results; omitted only by legacy callers. */
    checks?: ConsistencyChecks;
    log: VerificationLogEntry[];
  };
  costEntries: CostBreakdownEntry[];
  model: string;
  /**
   * WS7 (D-20): how the judge pass was actually run (order, seed, per-side
   * lengths and self-assessments, `both`-mode reconciliation). Completed here
   * with the model-family fact the cost entries carry. Omitted by the data-only
   * and legacy paths, which never ran a judge.
   */
  judgeProtocol?: JudgeProtocolDraft;
  /** Pipeline version stamped into meta . Defaults to REPORT_SPEC_VERSION. */
  pipelineVersion?: string;
  /** Internal pre-verification assembly only; final and fallback assembly stay strict. */
  provisionalVerification?: boolean;
  /**
   * Stage A validation gaps (balance-sheet identity breaks, FMP↔XBRL
   * disagreements, stale-fundamentals flags). Merged into the appendix
   * missing-data manifest so the rendered report discloses exactly what the
   * prompt was told (H4) — the prompt already merges these via
   * assembleContextPayload. Optional so stand-in callers (verify stand-in) omit.
   */
  validationGaps?: ManifestEntry[];
}

/** Sum a cost-breakdown into a single total. */
export function totalCost(entries: CostBreakdownEntry[]): number {
  return entries.reduce((acc, e) => acc + e.costUsd, 0);
}

/**
 * Build the appendix source list from the bundle's source manifest — one
 * exact provider envelope, deterministically sorted and deduplicated.
 */
export function buildSources(bundle: DataBundle): SourceEntry[] {
  return sourceManifestEntries(bundle.sourceManifest).map(
    (entry): SourceEntry => ({ ...entry }),
  );
}

/**
 * The as-of map for meta: bundle asOf plus the report generation stamp. NOTE:
 * `generatedAt` on meta is a wall-clock time — assembleReport is the ONE place a
 * timestamp is allowed, because the report object is persisted, not cached. The
 * PAYLOAD stays clock-free; only the final Report meta carries generation time.
 */
function buildAsOfMap(bundle: DataBundle): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(bundle.asOf).sort()) out[k] = bundle.asOf[k];
  return out;
}

/**
 * Wrap a JudgeOutput with meta + appendix into a full Report, then validate the
 * whole thing against ReportSchema. Throws {@link ReportValidationError} (with
 * the Zod error) on failure so the runner can retry the judge with the error fed
 * back (max 2 retries).
 *
 * `generatedAt` is provided injectably for deterministic tests; production omits
 * it and gets the current time (the only clock read in Stage C, on the persisted
 * report — never on the cached payload).
 */
/**
 * The horizon label printed beside a computed scenario target (D-40). The
 * target is a present-value DCF sensitivity over the explicit DCF horizon,
 * not a twelve-month forecast, so the label is set here and a scenario with
 * no non-null computed target reads "n/a". Shared by the AI and data-only reports.
 */
export const SCENARIO_TARGET_HORIZON = "explicit DCF horizon";

/**
 * Overwrite each scenario's priceTarget with the DETERMINISTIC computed target
 * (Stage B {@link computeScenarioTargets}; P18: code owns numbers), so the
 * judge/LLM number can never control the headline. A scenario
 * with no available computed target — the block is `suppressed`/absent, or that
 * scenario's per-share is null — gets `priceTarget: null` (a target is SUPPRESSED,
 * never fabricated). The horizon beside it is {@link SCENARIO_TARGET_HORIZON}
 * when that scenario's computed per-share is non-null and "n/a" otherwise
 * (D-40), so a null target never carries a horizon.
 * The judge's scenario NARRATIVE (probability, assumptions,
 * whatWouldHaveToBeTrue) is preserved here; final scenario presentation later
 * separates qualitative conditions from actual numerical prerequisites. Pure.
 */
export function applyScenarioTargets(
  valuation: JudgeOutput["valuation"],
  scenarioTargets: ScenarioTargets | undefined,
): JudgeOutput["valuation"] {
  const byName = new Map<string, TracedNumber | null>();
  if (scenarioTargets && scenarioTargets.status === "available") {
    for (const t of scenarioTargets.targets) byName.set(t.name, t.perShare);
  }
  return {
    ...valuation,
    scenarios: valuation.scenarios.map((s) => {
      const priceTarget = byName.get(s.name) ?? null;
      // A target listed with a null perShare is still no target: "n/a".
      return { ...s, priceTarget, horizon: priceTarget !== null
        ? scenarioTargets?.method === "excess-return-history" ? "explicit excess-return horizon" : SCENARIO_TARGET_HORIZON
        : "n/a" };
    }),
  };
}

/**
 * Overwrite valuation.dcf.perShare + upsidePct with the DETERMINISTIC fair value
 * (Stage B {@link computeFairValue}; P18: code owns numbers) so the
 * judge/LLM cannot author the headline intrinsic value. When the block is absent /
 * suppressed, both are nulled — a fair value is SUPPRESSED, never fabricated. The
 * judge's dcf.assumptions display list + sensitivityGrid + reverse-DCF narrative
 * are preserved verbatim. Pure; returns a new valuation.
 */
export function applyFairValue(
  valuation: JudgeOutput["valuation"],
  fairValue: FairValue | undefined,
): JudgeOutput["valuation"] {
  const available = fairValue !== undefined && fairValue.status === "available";
  return {
    ...valuation,
    dcf: {
      ...valuation.dcf,
      perShare: available ? fairValue.perShare : null,
      upsidePct: available ? fairValue.upsidePct : null,
    },
  };
}

/**
 * Overwrite valuation.dcf.assumptions + sensitivityGrid with the DETERMINISTIC
 * Stage B display (computeDcfDisplay; P18: code owns numbers)
 * so the valuation card shows the real computed inputs, never judge-transcribed
 * ones. Empty for routes with no FCFF DCF (excess-return / REIT / pre-revenue /
 * suppressed) — nothing is fabricated. The judge keeps the reverse-DCF narrative
 * and the section interpretation. Pure; returns a new valuation. If the computed
 * valuation is absent (verify stand-in path), leaves the judge's values untouched.
 */
export function applyDcfDisplay(
  valuation: JudgeOutput["valuation"],
  computedValuation: ComputedMetrics["valuation"] | undefined,
  currency: string | null = null,
  currentUse?: import("@/report/schema").ValuationUse,
): JudgeOutput["valuation"] {
  if (computedValuation === undefined) return valuation;
  const display = computeDcfDisplay(computedValuation, currency, currentUse);
  return {
    ...valuation,
    dcf: {
      ...valuation.dcf,
      ...display,
    },
  };
}

/**
 * Fixed human labels for the multiples table, one per Stage B {@link MultipleKey}
 * (matches the P/E · EV/EBITDA · P/FFO naming used across sectorRouting notes
 * and the UI). Exported so tests and renderers can rely on the exact strings.
 */
export const MULTIPLE_LABELS: Record<MultipleKey, string> = {
  peTtm: "P/E (TTM)",
  evToEbitda: "EV/EBITDA",
  evToSales: "EV/Sales",
  // D-19: "free cash flow" means two things in this report
  // — the vendor convention (OCF + capex) that this multiple and its own-history
  // distribution are built on, and the house default that subtracts SBC. The
  // label says which one the reader is looking at.
  priceToFcf: "P/FCF (before SBC)",
  priceToBook: "P/B",
  priceToTbv: "P/TBV",
  priceToFfo: "P/FFO",
  priceToAffo: "P/AFFO",
};

/** An exact count or amount for reader text, digits grouped ("119,996,000"); nothing is rounded away. */
function groupedFigure(v: number | null): string {
  return v === null || !Number.isFinite(v) ? "n/a" : v.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/**
 * D-112: a P/E or EV/EBITDA whose earnings are the latest
 * fiscal year (TTM suppressed) is named for that year, "P/E (FY2025)", never
 * "(TTM)". Every other row keeps its fixed label.
 */
export function multipleLabel(stat: Pick<MultipleStat, "key" | "period" | "ownershipScope">): string {
  if (stat.key === "priceToFcf" && stat.ownershipScope) return "P/FCF (before SBC; cash attribution unresolved)";
  const annual = stat.period !== undefined && stat.period.startsWith("FY");
  if (annual && stat.key === "peTtm") return `P/E (${stat.period})`;
  if (annual && stat.key === "evToEbitda") return `EV/EBITDA (${stat.period})`;
  return MULTIPLE_LABELS[stat.key];
}

/**
 * Replace the judge's valuation.multiples rows WHOLESALE with rows derived from
 * the DETERMINISTIC Stage B multiples framework (2026-07 invariant-1 hardening):
 * current / peer median / own-5y percentile / sector-appropriate flag all come
 * from computed numbers, never from LLM transcription. Pre-revenue routes
 * (multiples === null) or an absent computed valuation (verify stand-in) yield
 * an EMPTY table — rows are never fabricated and judge rows never survive.
 * Pure; returns a new valuation.
 */
export function applyMultiples(
  valuation: JudgeOutput["valuation"],
  computedValuation: ComputedMetrics["valuation"] | undefined,
): JudgeOutput["valuation"] {
  const mr = computedValuation?.multiples ?? null;
  // D-99 (report wording): Stage B appends the whole EV bridge to each EV
  // multiple's basis, and the table note below states it again, so the bridge
  // would print several times, each naming the environment variable that
  // keeps leases in EV. The note (multiplesBasis) states it once, in reader
  // terms; each EV row points to it.
  const bridgeBasis = mr?.enterpriseValue?.basis ?? null;
  const readerBridge = bridgeBasis === null ? null : bridgeBasis
    .replace(EV_LEASE_SETTING_TEXT.excluded, " (house default)")
    .replace(EV_LEASE_SETTING_TEXT.included, " (a non-default setting)");
  const rowBasis = (basis: string): string =>
    bridgeBasis !== null && bridgeBasis.trim() !== "" && basis.includes(bridgeBasis)
      ? basis.replace(bridgeBasis, "Enterprise value as stated once in the enterprise-value bridge note.")
      : basis;
  const rows =
    mr === null
      ? []
      : mr.multiples.map((stat) => {
          // A multiple on gain-inflated earnings is not ranked (D-98), so the
          // table shows no rank beside its caveat.
          const history = stat.gainInflatedEarnings ? null : stat.ownHistory;
          return {
            name: multipleLabel(stat),
            current: stat.current,
            ...(typeof stat.basis === "string" && stat.basis.trim() ? { basis: rowBasis(stat.basis) } : {}),
            peerMedian: stat.peers?.median ?? null,
            peerCount: stat.peers?.count ?? null,
            own5yPercentile: history?.percentileRank ?? null,
            // N is sample size, separate from the normalized percentile scale.
            ownHistoryObservations: history?.observations ?? null,
            ...(history?.observationDetails ? { ownHistoryDetails: history.observationDetails } : {}),
            ...(typeof history?.basis === "string" ? { ownHistoryBasis: history.basis } : {}),
            ...(stat.gainInflatedEarnings ? { ownHistoryBasis: `not ranked: ${stat.gainInflatedEarnings.basis}`, earningsCaveat: stat.gainInflatedEarnings.basis } : {}),
            ...(stat.ebitdaLowerBound ? { earningsCaveat: stat.ebitdaLowerBound.basis } : {}),
            sectorAppropriate: mr.sectorAppropriate.includes(stat.key),
          };
        });
  const { peerCoverage: _modelCoverage, multiplesBasis: _modelMultiplesBasis, marketValueScope: _modelMarketValueScope, ...rest } = valuation;
  void _modelCoverage;
  void _modelMultiplesBasis;
  void _modelMarketValueScope;
  const scope = mr?.enterpriseValue?.equityScope;
  const headline = scope?.status === "resolved"
    ? `Issuer-common equity: ${groupedFigure(scope.economicShares)} economic shares outstanding at ${scope.shareCountAsOf}; capitalization ${groupedFigure(scope.marketCap)} ${scope.currency ?? "(currency unavailable)"}. ` : "";
  const ownershipScopes = [...new Set(mr?.multiples.flatMap(stat => [stat.ownershipScope, stat.historyScope].filter((scope): scope is string => typeof scope === "string")) ?? [])];
  const multiplesBasis = [mr?.enterpriseValue?.basis && readerBridge !== null ? headline + readerBridge +
    (scope && !mr.enterpriseValue.basis.includes(scope.basis) ? ` ${scope.basis}` : "") : "", ...ownershipScopes].filter(Boolean).join(" ") || undefined;
  const marketValueScope = scope && mr?.enterpriseValue ? {
    status: scope.status, marketCap: scope.marketCap, economicShares: scope.economicShares,
    currency: scope.currency ?? null, shareCountAsOf: scope.shareCountAsOf,
    priceAsOf: scope.priceAsOf ?? null,
    approximate: scope.approximate, basis: scope.basis,
    ...(scope.multiClass ? { multiClass: true as const } : {}),
    ...(scope.classPriceDates ? { classPriceDates: scope.classPriceDates } : {}),
    ...(scope.classAmbiguity ? { classAmbiguity: true as const } : {}),
    enterpriseValue: mr.enterpriseValue.value, enterpriseValueBasis: readerBridge ?? mr.enterpriseValue.basis,
  } : undefined;
  return { ...rest, multiples: rows, ...(multiplesBasis ? { multiplesBasis } : {}), ...(marketValueScope ? { marketValueScope } : {}), ...(mr?.peerCoverage ? { peerCoverage: mr.peerCoverage } : {}) };
}

/**
 * Overwrite reverseDcf.impliedMetric + impliedValue with the DETERMINISTIC
 * Stage B reverse-DCF solve (2026-07 invariant-1 hardening). The metric label
 * names exactly what the solver inverted: method "growth" solved the constant
 * explicit-horizon revenue growth that justifies the price; method "margin"
 * solved the terminal EBIT margin (fallback mode). Method "none", a non-DCF
 * route, or an absent computed valuation → "n/a" + null (suppressed, never
 * fabricated). The judge's `narrative` prose is ALWAYS preserved verbatim.
 * Pure; returns a new valuation.
 */
export function applyReverseDcf(
  valuation: JudgeOutput["valuation"],
  computedValuation: ComputedMetrics["valuation"] | undefined,
): JudgeOutput["valuation"] {
  let impliedMetric = "n/a";
  let impliedValue: number | null = null;
  if (
    computedValuation !== undefined &&
    computedValuation.kind === "dcf" &&
    computedValuation.reverseDcf !== null
  ) {
    const r = computedValuation.reverseDcf;
    if (r.method === "growth") {
      impliedMetric = isStartingGrowthFamily(r.growthPathFamily)
        ? "starting revenue growth (fades to terminal rate)"
        : "revenue growth (path family unavailable)";
      impliedValue = r.impliedRevenueGrowthPct;
    } else if (r.method === "margin") {
      impliedMetric = "terminal EBIT margin";
      impliedValue = r.impliedTerminalMarginPct;
    }
  }
  return {
    ...valuation,
    reverseDcf: { ...valuation.reverseDcf, impliedMetric, impliedValue },
  };
}

/**
 * Overwrite the four quality.forensicScores blocks with the DETERMINISTIC Stage
 * B forensics (2026-07 invariant-1 hardening): Altman variant/score/zone,
 * Beneish M + verdict, Piotroski F out-of-N, and the cash-flow accruals ratio +
 * house-rule band. The judge's `notApplicableReason` prose is PRESERVED exactly
 * when the computed counterpart is null (it explains why the score is missing/
 * suppressed) and DROPPED when a computed score exists. Altman's variant falls
 * back selection → judge string only when the computed layer is truly absent.
 * Pure; returns a new quality section (flags/graded untouched).
 */
export function applyForensicScores(
  quality: JudgeOutput["quality"],
  forensics: ComputedMetrics["forensics"] | undefined,
): JudgeOutput["quality"] {
  const j = quality.forensicScores;
  const keepReason = (
    judgeReason: string | undefined,
    computedScore: number | null,
  ): { notApplicableReason?: string } =>
    computedScore === null && judgeReason !== undefined
      ? { notApplicableReason: judgeReason }
      : {};

  const altmanScore = forensics?.altman?.score ?? null;
  const altman = {
    variant:
      forensics?.altman?.variant ?? forensics?.altmanSelection.variant ?? j.altman.variant,
    score: altmanScore,
    zone: forensics?.altman?.zone ?? null,
    ...keepReason(j.altman.notApplicableReason, altmanScore),
  };

  // D-61: the decompositions travel in the strings every renderer already
  // prints (variant and zone), so the report shows all eight Beneish indices,
  // whether sales growth alone carries a flag, and which Piotroski signals
  // failed — without a schema change.
  const beneishScore = forensics?.beneish?.score ?? null;
  const bx = forensics?.beneish ?? null;
  const ix = bx?.indices;
  const two = (v: number | null | undefined): string => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(2) : "n/a");
  const beneish = {
    variant:
      bx !== null && beneishScore !== null && ix
        ? `m-score: DSRI ${two(ix.dsri)}, GMI ${two(ix.gmi)}, AQI ${two(ix.aqi)}, SGI ${two(ix.sgi)}, DEPI ${two(ix.depi)}, ` +
          `SGAI ${two(ix.sgai)}, TATA ${typeof ix.tata === "number" ? ix.tata.toFixed(3) : "n/a"}, LVGI ${two(ix.lvgi)}` +
          (typeof bx.sgiNeutralScore === "number" ? `; M with SGI at 1.0: ${bx.sgiNeutralScore.toFixed(2)}` : "") +
          (bx.neutralized?.length ? `; neutralized: ${bx.neutralized.join(", ")} (missing inputs set to 1.0)` : "") +
          (bx.clamped?.length ? `; clamped: ${bx.clamped.join(", ")} (house bounds)` : "")
        : "m-score",
    score: beneishScore,
    zone: bx?.growthLed === true ? "flag (growth-led; graded on SGI-neutral M)" : bx?.verdict ?? null,
    ...keepReason(j.beneish.notApplicableReason, beneishScore),
  };

  const piotroskiScore = forensics?.piotroski?.score ?? null;
  const outcomes = forensics?.piotroski ? piotroskiSignalOutcomes(forensics.piotroski) : null;
  const piotroski = {
    variant: "f-score",
    score: piotroskiScore,
    zone:
      forensics?.piotroski && piotroskiScore !== null && outcomes !== null
        ? `${piotroskiScore}/${forensics.piotroski.outOf}` +
          (outcomes.failed.length > 0 ? `; failed: ${outcomes.failed.join(", ")}` : "; every evaluable signal passed")
        : null,
    ...keepReason(j.piotroski.notApplicableReason, piotroskiScore),
  };

  // PRIMARY accruals construction (Hribar–Collins cash-flow ratio) + its
  // house-rule band — the same pair Stage B leads with; the variant names the
  // D-61 definition behind it.
  const accrualsScore = forensics?.accruals?.cashFlowAccrualRatio ?? null;
  const definition = forensics?.accruals?.definition;
  const accruals = {
    variant:
      definition === "financial-asset-adjusted"
        ? "cash-flow, financial-asset-adjusted (Richardson et al. 2005)"
        : definition === "operating"
          ? "cash-flow, operating accruals (NI − CFO)"
          : "cash-flow",
    score: accrualsScore,
    zone: forensics?.accruals?.band ?? null,
    ...keepReason(j.accruals.notApplicableReason, accrualsScore),
  };

  return { ...quality, forensicScores: { altman, beneish, piotroski, accruals } };
}

/**
 * Sum the LATEST period's as-reported segment values from one bundle
 * segmentation feed (rows arrive newest-first; mirrors payload.ts
 * segmentsSection, which renders exactly rows[0] to the LLM — numerator and
 * denominator therefore come from the same period the judge saw). Returns null
 * when the feed is a gap, empty, or sums to a non-positive total.
 */
function latestSegmentationTotal(
  res: DataBundle["segmentation"]["product"] | undefined,
  bundle: DataBundle | undefined,
): { total: number | null; reason?: "no-same-period-revenue" | "revenue-refused" | "split-does-not-reconcile" } {
  const missing = {total:null, reason:"no-same-period-revenue" as const};
  // D-280 (P10): a withheld or unavailable feed names no revenue cause; the heading falls back to
  // "share basis not established" rather than claim same-period revenue is missing.
  if (res === undefined || !res.ok || !res.value) return {total:null};
  const data = res.value.data.rows[0]?.data;
  if (data === undefined || data === null || typeof data !== "object") return {total:null};
  let total = 0;
  let counted = 0;
  for (const key of Object.keys(data)) {
    const v = data[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      total += v;
      counted++;
    }
  }
  const latest = res.value.data.rows[0]!;
  // D-280 (P7/P8/P13): exact period and currency, using the existing same-observation allowance.
  const income = latest.period?.startsWith("Q") ? bundle?.statements.incomeQuarterly : bundle?.statements.incomeAnnual;
  const rows = income?.ok ? income.value.data.rows : [];
  const revenue = rows.find(row => row.date === latest.date && row.reportedCurrency === latest.reportedCurrency);
  if (!revenue || typeof latest.reportedCurrency !== "string") return missing;
  if (revenue.fieldConflicts?.revenue?.usable === false || typeof revenue.revenue !== "number" || !Number.isFinite(revenue.revenue) || revenue.revenue <= 0)
    return {total:null,reason:"revenue-refused"};
  return counted > 0 && total > 0 && vendorAgreesWithFiled(total,revenue.revenue)
    ? {total:revenue.revenue} : {total:null,reason:"split-does-not-reconcile"};
}

/** D-280: shares use same-period consolidated revenue only after the full split reconciles (P8).
 * Missing, partial or overlapping splits withhold every share; model percentages are discarded.
 */
/** D-299 (P18): the name a segment row carries when its cited record does not establish one. */
export const UNBOUND_SEGMENT_NAME = "Segment (name not established)";

/**
 * D-299 (P18, P19): a segment row's name is code-owned. The row's revenue must
 * cite one segment record of this bundle by its exact payload id (member
 * identity), of the row's own kind (product or geographic), and the row must
 * state that record's date (its period, else its as-of date), currency and monetary unit, with an amount that is
 * the same observation (P8 allowance; both are in the record's own units, so no
 * scale is assumed). The record's own name then replaces the model's text;
 * otherwise the name is withheld.
 */
export function boundSegmentName(
  row: { name: string; revenue: { value: number; unit?: string; period?: string | null; asOf?: string | null; currency?: string | null; source?: string; sourceId?: string } },
  records: readonly SegmentRecordCitation[],
  kind: "product" | "geographic",
): string {
  const cited = row.revenue.sourceId ?? row.revenue.source;
  const value = row.revenue.value;
  if (typeof cited !== "string" || typeof value !== "number" || !Number.isFinite(value)) return UNBOUND_SEGMENT_NAME;
  const matches = records.filter(record => record.id === cited && record.kind === kind);
  if (matches.length !== 1) return UNBOUND_SEGMENT_NAME;
  const record = matches[0]!;
  // The row's stated date: its period, else its as-of date (an annual segmentation row's date is its period end).
  const stated = row.revenue.period ?? row.revenue.asOf ?? null;
  const period = stated === null ? null : stated.slice(0, 10);
  if (period === null || record.period === null || period !== record.period) return UNBOUND_SEGMENT_NAME;
  if (row.revenue.currency == null || record.currency === null || row.revenue.currency !== record.currency) return UNBOUND_SEGMENT_NAME;
  if (row.revenue.unit !== record.unit) return UNBOUND_SEGMENT_NAME;
  return vendorAgreesWithFiled(record.value, value) ? record.name : UNBOUND_SEGMENT_NAME;
}

export function applySegmentShares(
  business: JudgeOutput["business"],
  bundle: DataBundle | undefined,
  /** D-299: assembly binds model-written row names to their cited records; code-built rows are already the record's. */
  options: { bindModelNames?: boolean } = {},
): JudgeOutput["business"] {
  const share = (revenueValue: number, total: number | null): number | null => {
    if (total === null) return null;
    const pct = (revenueValue / total) * 100;
    return Number.isFinite(pct) ? Math.round(pct * 10) / 10 : null;
  };
  const productTotal = latestSegmentationTotal(bundle?.segmentation?.product, bundle);
  const segmentRecords = options.bindModelNames !== true || bundle?.segmentation === undefined ? [] : segmentRecordCitations(bundle);
  const named = <R extends Parameters<typeof boundSegmentName>[0]>(row: R, kind: "product" | "geographic"): string =>
    options.bindModelNames === true ? boundSegmentName(row, segmentRecords, kind) : row.name;
  // D-127: the share basis follows the same admission as the payload and the data-only report.
  const primary = bundle?.segmentation?.geographic === undefined ? undefined
    : admittedGeography(bundle.segmentation.geographic, bundle.edgar?.quarterlySegments);
  const geographicTotal = latestSegmentationTotal(primary, bundle);
  const basis = selectedGeographyNotes(primary)[0];
  const latest = primary?.ok ? primary.value.data.rows[0] : undefined;
  const geographic = basis && primary?.ok && latest?.data && typeof latest.reportedCurrency === "string" && typeof latest.date === "string"
    ? Object.entries(latest.data).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name,
      revenue: { value, unit: "currency", currency: latest.reportedCurrency!, period: latest.date!, asOf: latest.date!,
        source: primary.value.endpoint, verified: null, verificationNote: basis } satisfies TracedNumber,
      sharePct: share(value, geographicTotal.total),
      shareWithheldReason: geographicTotal.reason,
    }))
    : business.segments.geographic.map(row => ({ ...row, name: named(row, "geographic"), sharePct: share(row.revenue.value, geographicTotal.total), shareWithheldReason: geographicTotal.reason }));
  return {
    ...business,
    segments: {
      product: business.segments.product.map((row) => ({
        ...row,
        name: named(row, "product"),
        sharePct: share(row.revenue.value, productTotal.total),
        shareWithheldReason: productTotal.reason,
      })),
      geographic,
    },
  };
}

/**
 * D-271 (P18: code owns labels): the product and
 * geographic segment names in the bundle's own segmentation data (filed or
 * provider rows, never model text), plus filed quarterly member labels (D-277),
 * as heading keys.
 */
export function bundleSegmentNameKeys(bundle: DataBundle | undefined): Set<string> {
  const keys = new Set<string>();
  for (const res of [bundle?.segmentation?.product, bundle?.segmentation?.geographic]) {
    if (res === undefined || !res.ok || !res.value) continue;
    for (const row of res.value.data.rows ?? []) {
      const data = row?.data;
      if (data === undefined || data === null || typeof data !== "object") continue;
      for (const name of Object.keys(data)) { const key = productLineHeadingKey(withoutMemberMarker(name)); if (key) keys.add(key); }
    }
  }
  // D-277 (P18): the same code-built filed member labels used by the quarterly
  // segment table; never judge-authored business.segments or claim text.
  const filed = bundle?.edgar?.quarterlySegments;
  if (filed?.ok) {
    for (const axis of filed.value.data.axes) {
      for (const row of axis.rows) {
        const key = productLineHeadingKey(row.label);
        if (key) keys.add(key);
      }
    }
  }
  return keys;
}

/**
 * D-271: a model-written product-line heading can assert what
 * its only naming claim says is unproven ("Verandol dominates the market" over
 * "No reviewed source establishes that Verandol dominates the market"), and the
 * report's own segment rows keep judge-authored names, so neither the claims
 * nor those rows make a heading code-owned. At assembly a heading stands only
 * when it equals, as a whole name, a segment name in the bundle's segmentation
 * data or filed quarterly segment member labels (D-277); otherwise the fixed
 * heading replaces it and the claims are kept. The
 * read-time rule (a naming FACT must be validated or qualitative) still applies.
 */
export function gateProductLineHeadings<T extends { productLine: string }>(items: readonly T[] | undefined, names: ReadonlySet<string>): T[] | undefined {
  return items?.map(item => names.has(productLineHeadingKey(item.productLine)) ? item : { ...item, productLine: UNNAMED_PRODUCT_LINE_HEADING });
}

/** The sources an executive decision may quote: the same excerpts the verify pass reads. */
export function retainedDecisionSources(payload: ContextPayload): { source: string; text: string }[] {
  return [payload.transcript ?? null, ...(payload.filings ?? [])].filter((excerpt): excerpt is NonNullable<typeof excerpt> => excerpt !== null);
}

/** Report assembly runs inside one computation context (P13), like Stage B (src/edgar/computationContext.ts). */
export function assembleReport(args: AssembleReportArgs, generatedAt?: string): Report {
  return withComputationContext(() => assembleReportInContext(args, generatedAt));
}

function assembleReportInContext(args: AssembleReportArgs, generatedAt?: string): Report {
  const originalBundle = args.bundle;
  args = { ...args, bundle: balanceIntegrityView(withPrimaryCapitalBasis(args.bundle)) };
  const companyName = firstProfileName(args.bundle) ?? args.symbol;
  const coverage: ProvenanceCoverage = args.verify.coverage ?? {
    numeric: { supported: 0, total: 0, rate: null },
    factualClaims: { supported: 0, total: 0, rate: null },
    judgments: { cited: 0, total: 0, rate: null },
  };

  // WS7 (D-20): complete the adversarial protocol with the model families the
  // settled cost entries name, and disclose it — in the metadata AND in the
  // missing-data manifest, like every other behavior the report depends on.
  const execution = annotateSharedModelFamily(
    args.costEntries.map((entry) =>
      buildExecutionMetadataEntry({
        step: entry.step,
        requestedModel: entry.requestedModel ?? entry.model,
        effectiveModel: entry.model,
        requestedEffort: entry.requestedEffort ?? null,
        fallbackUsed: entry.fallbackUsed ?? false,
      }),
    ),
  );
  const judgeProtocol =
    args.judgeProtocol === undefined
      ? undefined
      : completeJudgeProtocol(args.judgeProtocol, sharedModelFamilyOf(execution));

  const missingData = attributeJudgeProtocolDisclosures(bankRevenueManifest(originalBundle, primaryCapitalManifest(originalBundle, dedupManifest([
    ...withRetiredGapWording(args.bundle.gaps),
    ...args.computed.gaps,
    ...(args.validationGaps ?? []),
    ...degradationDisclosures(args.computed.degradation),
    ...sourceEvidenceDisclosures(args.bundle),
    ...(args.judgeProtocol?.disclosures ?? []),
    ...(judgeProtocol === undefined ? [] : judgeProtocolManifestEntries(judgeProtocol)),
    ...(args.verify.checks === undefined ? [] : consistencyManifestEntries(args.verify.checks)),
    // D-102: "recovering toward the cost of equity" when the trailing return is already above the terminal target.
    ...returnPathLanguageManifestEntries(args.judgeOutput, args.computed),
  ]))), { execution, model: args.model });

  const meta: ReportMeta = {
    symbol: args.symbol,
    companyName,
    generatedAt: generatedAt ?? new Date().toISOString(),
    specVersion: REPORT_SPEC_VERSION,
    model: args.model,
    pipelineVersion: args.pipelineVersion ?? REPORT_SPEC_VERSION,
    // P21, D-217: only a report built now carries the current evidence-rules stamp.
    evidenceContract: EVIDENCE_CONTRACT_VERSION,
    costUsd: totalCost(args.costEntries),
    verificationRate: args.verify.verificationRate,
    provenanceCoverage: coverage,
    // WS7 (D-20)
    ...(args.verify.checks === undefined ? {} : { consistencyChecks: args.verify.checks }),
    ...(judgeProtocol === undefined ? {} : { judgeProtocol }),
    // end WS7
    dataCompleteness: buildDataCompleteness(missingData),
    execution,
    disclaimer: DISCLAIMER_TEXT,
    asOfMap: buildAsOfMap(args.bundle),
  };
  meta.evidenceTiming = buildEvidenceTiming(args.bundle, {
    calculationAsOf: args.computed.builtAt ?? null,
    reportGeneratedAt: meta.generatedAt,
  });

  // Missing-data manifest = computed gaps + Stage A validation gaps + Stage B
  // degradation disclosures. dedupManifest flattens+dedups by field|reason and
  // applies the same severity ordering as the payload's mergeManifest, so this
  // is a superset-equal of what the prompt disclosed (H4/L7): the rendered
  // report can never be less transparent than the LLM's own input.
  const appendix: Appendix = {
    sources: buildSources(args.bundle),
    missingData,
    verificationRate: args.verify.verificationRate,
    provenanceCoverage: coverage,
    // WS7 (D-20): checked, beside cited, in the appendix a reader actually opens.
    ...(args.verify.checks === undefined ? {} : { consistencyChecks: args.verify.checks }),
    verificationLog: args.verify.log,
    costBreakdown: args.costEntries,
  };

  // Deterministic scenario price targets + DCF fair value overwrite the judge's
  // (or null them when suppressed) so the LLM never authors the headline numbers
  // (P18). The blocks are attached for their trace/basis/reasons.
  // The same pattern extends to the remaining
  // judge-path numerics: multiples rows, the reverse-DCF implied value, forensic
  // scores, and segment revenue shares are all computed-injected below.
  // Executive tenure is derived from an established office start; the legacy
  // tenureYears field never preserves a model-authored number.
  const scenarioTargets = args.computed.scenarioTargets;
  const fairValue = args.computed.fairValue;
  const routeMetrics = routeMetricsBlock(args.computed);
  const valuation = applyScenarioPresentation(applyReverseDcf(
    applyMultiples(
      applyDcfDisplay(
        applyFairValue(
          applyScenarioTargets(args.judgeOutput.valuation, scenarioTargets),
          fairValue,
        ),
        args.computed.valuation,
        args.computed.valuation === undefined ? null : args.computed.valuationTranslation?.fx.quoteCurrency ?? statementCurrencies(args.bundle).model,
        fairValue?.currentUse,
      ),
      args.computed.valuation,
    ),
    args.computed.valuation,
  ), args.computed);
  const quality = applyForensicScores(args.judgeOutput.quality, args.computed.forensics);
  const segmentNames = bundleSegmentNameKeys(args.bundle);
  const sharedBusiness = applySegmentShares(args.judgeOutput.business, args.bundle, { bindModelNames: true });
  const business = sharedBusiness.products === undefined ? sharedBusiness
    : { ...sharedBusiness, products: gateProductLineHeadings(sharedBusiness.products, segmentNames) };
  const competitive = args.judgeOutput.competitive.competitorsByProductLine === undefined ? args.judgeOutput.competitive
    : { ...args.judgeOutput.competitive, competitorsByProductLine: gateProductLineHeadings(args.judgeOutput.competitive.competitorsByProductLine, segmentNames) };
  // D-63: guidance, issuer FCF, capital return, dated 8-K
  // events, XBRL segment revenue by quarter and the eight-quarter trend,
  // pipeline-filled from the bundle. Built before the triggers (D-65), which
  // cite its guidance records.
  const filingDisclosures = buildFilingDisclosures(args.bundle, args.computed.route?.cashFlowApplicability, args.computed.capital?.cashDividendPayout);

  const candidate: Report = {
    meta,
    verdict: args.judgeOutput.verdict,
    business,
    fundamentals: args.judgeOutput.fundamentals,
    balanceSheet: args.judgeOutput.balanceSheet,
    valuation,
    quality,
    technicals: args.computed.technicals ? {
      ...args.judgeOutput.technicals,
      read: { ...args.judgeOutput.technicals.read, trend: technicalTrendText(args.computed.technicals, statementCurrencies(args.bundle).trading) },
    } : args.judgeOutput.technicals,
    leadership: args.judgeOutput.leadership,
    competitive,
    catalystsRisks: args.judgeOutput.catalystsRisks,
    outlook: args.judgeOutput.outlook,
    macro: args.judgeOutput.macro,
    appendix,
    disagreements: args.judgeOutput.disagreements,
    // Deterministic scores + projections + scenario targets (pipeline-filled from
    // Stage B). Optional in the schema, so a MINIMAL_COMPUTED stand-in (undefined)
    // parses cleanly.
    ...(args.computed.scores ? { scores: args.computed.scores } : {}),
    ...(args.computed.projections ? { projections: args.computed.projections } : {}),
    ...(scenarioTargets ? { scenarioTargets } : {}),
    scenarioPresentation: buildScenarioPresentation(args.computed, comparableScenarioPrice(args.computed, args.bundle)),
    thesisTriggers: args.computed.valuation ? buildThesisTriggers(args.computed, guidanceLowCitation(filingDisclosures)) : [],
    ...(fairValue ? { fairValue } : {}),
    // WS5 (D-17): the bank / insurer / mortgage-REIT route metrics and the
    // P/TBV-against-ROTE reading, pipeline-filled exactly like the blocks
    // above. Absent entirely on routes that have none, so a general report is
    // unchanged.
    ...(routeMetrics ? { routeMetrics } : {}),
  };
  if (filingDisclosures) candidate.filingDisclosures = filingDisclosures;
  const primaryCapital = primaryCapitalAudit(args.bundle, args.computed.capital?.primaryRepurchaseExecutions);
  if (primaryCapital) candidate.primaryCapitalEvidence = primaryCapital;
  // D-62: provider market and consensus data (quote, shares, EV, FY+1/FY+2
  // consensus, price targets, grade counts, short interest) for the page-1
  // key-data box. Copied as served; the payload the model saw is unchanged.
  const marketData = buildMarketData(args.bundle, { isAdr: args.computed.route?.overlays?.includes("adr") === true, stageBGaps: args.computed.gaps, cashFlowApplicability: args.computed.route?.cashFlowApplicability });
  if (marketData) candidate.marketData = marketData;

  // A failed verification pass still persists final assembly. Establish the
  // rendered destination here as well; provisional assembly retains the raw
  // reference until verification attaches its trusted payload-backed summary.
  let assembled = candidate;
  let executivePayload: ContextPayload | undefined;
  if (!args.provisionalVerification) {
    const quarterly = args.bundle.statements?.incomeQuarterly;
    // Legacy adapters can supply statement rows with only { gaps: [] } for
    // Stage B. They retain report compatibility and no asserted destination.
    const payloadContextReady = typeof args.computed.builtAt === "string" &&
      Array.isArray(args.computed.suppressed) && Array.isArray(args.computed.gaps) &&
      (["route", "growth", "returns", "capital", "forensics", "technicals", "valuation"] as const)
        .every(key => args.computed[key] !== null && typeof args.computed[key] === "object");
    if (quarterly?.ok && quarterly.value.data.rows.length > 0 && payloadContextReady) {
      const payload = assembleContextPayload(args.bundle, args.computed, { checks: [], flags: [], gaps: args.validationGaps ?? [] });
      candidate.sourceFactSummary = buildSourceFactSummary(payload);
    }
    const guarded = guardEarningsReferences(candidate, candidate.sourceFactSummary?.earningsReconciliation.status === "available");
    const scheduleNote = nextEarningsNote(args.bundle);
    const schedulePayload = payloadContextReady ? assembleContextPayload(args.bundle, args.computed, { checks: [], flags: [], gaps: args.validationGaps ?? [] }) : undefined;
    executivePayload = schedulePayload;
    const scheduleGuard = guardEarningsSchedule(guarded.report, scheduleNote === null ? [] : [scheduleNote], schedulePayload?.citationRegistry,
      (schedulePayload?.filings ?? []).filter(entry => entry.sourceEvidence?.kind === "issuer-statement").map(entry => entry.source),
      schedulePayload ? { issuerName: schedulePayload.companyName, newsNotes: schedulePayload.news?.notes ?? [], passages: schedulePayload.filings ?? [] } : undefined);
    scheduleGuard.report.appendix.verificationLog = [...(candidate.appendix.verificationLog ?? []), ...guarded.log, ...scheduleGuard.log];
    assembled = scheduleGuard.report;
  }
  const parsed = ReportSchema.safeParse(applyFinancialDiagnostics(assembled, args.computed, args.bundle, {
    pendingVerification: args.provisionalVerification === true,
    executiveEvidence: { officerTenures: executivePayload?.leadership.officerTenures, tenureConflicts: executivePayload?.leadership.tenureConflicts, notes: executivePayload?.leadership.notes, filings: executivePayload && retainedDecisionSources(executivePayload), issuer: executivePayload?.companyName, asOf: assembled.meta.generatedAt, numericRecords: executivePayload?.provenanceRegistry },
  }));
  if (!parsed.success) {
    throw new ReportValidationError(
      `assembled report failed ReportSchema validation`,
      parsed.error.message,
    );
  }
  // D-50: cap each section's confidence label at the deterministic data-coverage
  // ceiling (the model may go lower, never higher). Runs before verification.
  return applyReportAssessmentStatus(applyGradeOverrideContract(applyConfidenceCeilings(parsed.data), args.verify.log));
}

function firstProfileName(bundle: DataBundle): string | null {
  if (!bundle.profile.ok) return null;
  const row = bundle.profile.value.data.rows[0];
  const name = row?.companyName;
  return typeof name === "string" && name.length > 0 ? name : null;
}

/** Dedup + severity-order manifest entries for the appendix (stable). */
function dedupManifest(entries: ManifestEntry[]): ManifestEntry[] {
  const seen = new Map<string, ManifestEntry>();
  for (const e of entries) {
    const key = `${e.field}|${e.reason}`;
    if (!seen.has(key)) seen.set(key, e);
  }
  const order: Record<ManifestEntry["severity"], number> = { critical: 0, warn: 1, info: 2 };
  return [...seen.values()].sort((a, b) => {
    if (order[a.severity] !== order[b.severity]) return order[a.severity] - order[b.severity];
    if (a.field !== b.field) return a.field < b.field ? -1 : 1;
    return a.reason < b.reason ? -1 : a.reason > b.reason ? 1 : 0;
  });
}
