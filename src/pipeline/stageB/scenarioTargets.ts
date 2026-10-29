/**
 * Stage B — deterministic bull/base/bear scenario price targets.
 *
 * PURE, deterministic TypeScript: no network, no DB, no LLM. This is the
 * authority for the headline scenario targets, which used to be authored by the
 * judge/LLM (2026-07-11 scenario-credibility checkpoint). The construction:
 *
 *  - base target = the deterministic FCFF-DCF fair value per share
 *    (valuation.dcf.perShare) — reused, never recomputed, so it can never
 *    disagree with the DCF page;
 *  - bull / bear re-run the SAME exported runDcf with a sample-σ year-one
 *    growth shift from consecutive company history and a margin shift scaled
 *    by the observed growth/margin correlation, both decaying to the base path
 *    (D-60, scenarioPaths.ts). This module and projections.ts share
 *    scenarioDispersion + perturbScenarioAssumptions, so the target band and
 *    projection fan cannot disagree on what "bull"/"bear" mean;
 *  - the EV→equity→per-share bridge (net debt, minority, preferred, diluted
 *    shares) is runDcf's own, so all three scenarios use one consistent bridge.
 *
 * Every target is a `computed-derived` TracedNumber (source
 * "computed.scenarioTargets.<scenario>") — calculation traceability, NOT factual
 * verification. It is a DCF sensitivity range, deliberately NOT a narrative-matched
 * analyst target; the LLM keeps the qualitative narrative but no longer owns the
 * number. When the route is non-DCF, or WACC / the base per-share bridge are
 * unavailable, the whole block is `status:"suppressed"` with empty targets and a
 * disclosing missingReasons[] — a target is SUPPRESSED, never fabricated.
 */

import {
  dcfDomainFailure,
  unsplitCellsNote,
  type DcfRunOptions,
  type ValuationResult,
} from "@/pipeline/stageB/valuation";
import {
  effectiveScenarioShocks,
  scenarioDispersion,
  type ProjectionIncomeRow,
} from "@/pipeline/stageB/projections";
import { buildScenarioPaths, marginWithheldText, type ScenarioAssumptions } from "@/pipeline/stageB/scenarioPaths";
import type { CompanyRouteResult } from "@/pipeline/stageB/sectorRouting";
import { perShareUnit, temporaryEquityRefusalGap } from "@/pipeline/stageB/fairValue";
import type { ManifestEntry } from "@/types/core";
import type { ScenarioTarget, ScenarioTargets, TracedNumber } from "@/report/schema";

/** Method id stamped into the block. */
export const SCENARIO_TARGET_METHOD = "dcf-dispersion" as const;
/** Versioned method prior — bump when the construction changes. */
// D-99 (AMZN audit finding 11): the correlated margin shift applies only when it moves with its scenario.
// D-102 (audit 2026-10-22 B-29, E-5): a run outside the DCF's domain withholds the fan; the bridge applies the NCI earnings key.
export const SCENARIO_TARGET_METHOD_VERSION = "SCENARIO_TARGETS_2026_10_D102" as const;

export interface ScenarioTargetsInputs {
  route: CompanyRouteResult;
  /**
   * The valuation result — only the general DCF route yields per-share
   * targets. The EV→equity→per-share bridge (net debt, diluted shares,
   * minority interest, preferred) is read from `valuation.dcf.bridge`, the
   * bridge the base per-share was computed with, never supplied separately.
   */
  valuation: ValuationResult;
  waccPct: number | null;
  /** Annual income history (any order) — for the ±σ dispersion (shared with the fan). */
  incomeHistory: ProjectionIncomeRow[];
  /** Current price for upside %; null ⇒ upside unknown (never defaulted). */
  currentPrice: number | null;
  /** Currency label for the per-share unit. */
  currency: string | null;
  asOf: string;
}

const isNum = (v: number | null | undefined): v is number =>
  typeof v === "number" && Number.isFinite(v);

const round2 = (v: number): number => Math.round(v * 100) / 100;

/**
 * Which side of the base DCF both ±σ runs fall on, or null when they bracket
 * it. Judged on the per-share values the report shows, so a run that shows as
 * the base touches it rather than falling outside.
 */
export function fanOutsideBase(base: number, bull: number, bear: number): "below" | "above" | null {
  const [b, runs] = [round2(base), [round2(bull), round2(bear)]];
  if (runs.every((v) => v < b)) return "below";
  if (runs.every((v) => v > b)) return "above";
  return null;
}

function suppressed(missingReasons: ManifestEntry[], basis: string[]): ScenarioTargets {
  return {
    status: "suppressed",
    method: SCENARIO_TARGET_METHOD,
    methodVersion: SCENARIO_TARGET_METHOD_VERSION,
    basis,
    dispersion: null,
    targets: [],
    missingReasons,
  };
}

export function computeScenarioTargets(inputs: ScenarioTargetsInputs): ScenarioTargets & { scenarioAssumptions?: ScenarioAssumptions } {
  const { valuation, currency, asOf } = inputs;

  // Only the general FCFF-DCF route has a per-share intrinsic value to perturb.
  // Banks/insurers/REITs/pre-revenue/dcf-suppressed → no target (docs/METHODOLOGY.md "Financial-company routes").
  if (valuation.kind !== "dcf") {
    const unresolvedReason = valuation.kind === "ineligible"
      ? valuation.gaps[0]?.reason ?? "valuation applicability is unresolved"
      : null;
    return suppressed(
      [
        {
          field: "valuation.scenarioTargets",
          reason: unresolvedReason !== null
            ? `Scenario price targets withheld: ${unresolvedReason}`
            : `deterministic scenario price targets are modelled only on the general DCF route; this company routed to "${valuation.kind}" - targets suppressed`,
          severity: "info",
        },
      ],
      [unresolvedReason !== null
        ? `Scenario price targets withheld: ${unresolvedReason}`
        : `Scenario price targets unavailable: the ${valuation.kind} route has no FCFF per-share to perturb.`],
    );
  }

  if (!isNum(inputs.waccPct)) {
    return suppressed(
      [
        {
          field: "valuation.scenarioTargets.wacc",
          reason: "WACC unavailable — cannot re-run the DCF for scenario targets",
          severity: "warn",
        },
      ],
      ["Scenario price targets unavailable: WACC could not be computed."],
    );
  }

  const assumptions = valuation.assumptions;
  const baseDcf = valuation.dcf;
  // Audit 2026-10-22 B-29: no fan around a DCF outside its domain.
  if (baseDcf?.domain !== undefined) {
    return suppressed(
      [{ field: "valuation.scenarioTargets", reason: `Scenario price targets withheld: ${baseDcf.domain.reason}`, severity: "warn" }],
      ["Scenario price targets unavailable: the base DCF is outside its domain."],
    );
  }
  // Audit 2026-10-22 E-5: withheld because the NCI claim could not be sized.
  if (baseDcf?.noncontrollingKeyWithheld !== undefined) {
    return suppressed(
      [{ field: "valuation.scenarioTargets", reason: `Scenario price targets withheld: ${baseDcf.noncontrollingKeyWithheld}`, severity: "warn" }],
      ["Scenario price targets unavailable: the noncontrolling interest's share of profit is unestablished."],
    );
  }
  if (assumptions === null || baseDcf === null || !isNum(baseDcf.perShare)) {
    // FIN-119-V1: a refused temporary-equity operand that withheld the DCF is named, as in the fair value.
    const refusedClaim = temporaryEquityRefusalGap(valuation.gaps);
    return suppressed(
      [
        {
          field: "valuation.scenarioTargets",
          reason: refusedClaim !== undefined
            ? `base DCF per-share unavailable: ${refusedClaim.reason} — scenario targets suppressed rather than fabricated`
            : "base DCF per-share unavailable (assumptions/DCF not built, or net debt / diluted shares / the ADR currency guard suppressed the equity bridge) — scenario targets suppressed rather than fabricated",
          severity: "warn",
        },
      ],
      ["Scenario price targets unavailable: the base DCF per-share is not computable."],
    );
  }
  // A non-positive base DCF per-share (enterprise value ≤ net debt — a distressed
  // or heavily levered name) means the DCF itself values the equity at or below
  // zero. A ±σ fan around a non-positive base is not meaningful: the bear extreme
  // also floors at 0 while base stays negative, which would publish base BELOW
  // bear and hand a reader the risk direction backwards. Suppress the fan with
  // disclosure; the headline DCF page still shows the (negative) fair value.
  if (baseDcf.perShare <= 0) {
    return suppressed(
      [
        {
          field: "valuation.scenarioTargets",
          reason:
            "base DCF per-share is non-positive (enterprise value at or below net debt) — a scenario fan around a non-positive equity value is not meaningful; suppressed rather than published with a degenerate ordering",
          severity: "warn",
        },
      ],
      [
        "Scenario price targets unavailable: the base DCF values the equity at or below zero, so a bull/bear fan is not meaningful.",
      ],
    );
  }

  // Company-history sample dispersion and observed covariance — shared with the fan.
  const disp = scenarioDispersion(inputs.incomeHistory);
  if (disp.sigmaGrowth === null || disp.sigmaMargin === null) {
    return suppressed(
      [
        {
          field: "valuation.scenarioTargets.dispersion",
          reason:
            "at least four consecutive annual revenue observations and three margin observations are required for sample dispersion — scenario targets suppressed instead of using house defaults",
          severity: "warn",
        },
      ],
      ["Scenario targets unavailable: company-specific dispersion evidence is too thin."],
    );
  }
  const shocks = effectiveScenarioShocks(disp.sigmaGrowth, disp.sigmaMargin, disp.growthMarginCorrelation);
  const dispersionDegenerate = shocks.degenerate;
  const effectiveCorr = shocks.growthMarginCorrelation;
  const dg = shocks.growthDeltaPp;
  const sigmaSource = "own-history" as const;

  const missingReasons: ManifestEntry[] = [];
  if (disp.growthMarginCorrelation === null) {
    missingReasons.push({
      field: "valuation.scenarioTargets.dispersion.covariance",
      reason:
        "insufficient paired history to estimate growth/margin covariance — scenario margin delta held at zero rather than assuming perfect correlation",
      severity: "warn",
    });
  } else if (dispersionDegenerate) {
    missingReasons.push({
      field: "valuation.scenarioTargets.dispersion.degenerate",
      reason:
        "revenue-growth or operating-margin history shows negligible dispersion (σ rounds to 0.00pp) — the growth/margin correlation is undefined and the bull/bear band collapses toward the base; reported as no measurable dispersion rather than a calibrated fan",
      severity: "info",
    });
  }

  // The bridge is the base DCF's OWN: valueCompany removes the operating-lease
  // liability from net debt before bridging, and re-running the perturbed
  // paths on the raw figure compute.ts held published a bull target below
  // base for every lease-heavy issuer.
  const opts: DcfRunOptions = {
    waccPct: inputs.waccPct,
    netDebt: baseDcf.bridge.netDebt,
    dilutedShares: baseDcf.bridge.dilutedShares,
    minorityInterest: baseDcf.bridge.minorityInterest,
    preferred: baseDcf.bridge.preferred,
    nonOperatingAssets: baseDcf.bridge.nonOperatingAssets ?? null,
    noncontrollingEarningsShare: baseDcf.bridge.noncontrollingEarningsShare ?? null,
    temporaryEquity: baseDcf.bridge.temporaryEquity ?? null,
  };

  const tn = (name: ScenarioTarget["name"], value: number): TracedNumber => ({
    value: round2(value),
    unit: perShareUnit(currency),
    // computed.* ⇒ the verify pass classifies this computed-derived (provenance,
    // not correctness). verified:true == "traced to computed inputs", the same
    // convention projections.ts uses for its estimates — NOT a factual claim.
    source: `computed.scenarioTargets.${name}`,
    asOf,
    verified: true,
  });

  const upsideOf = (perShare: TracedNumber | null): number | null =>
    perShare !== null && isNum(inputs.currentPrice) && inputs.currentPrice > 0
      ? (perShare.value / inputs.currentPrice - 1) * 100
      : null;

  const mk = (
    name: ScenarioTarget["name"],
    perShareValue: number | null,
    growthDeltaPp: number,
    marginDeltaPp: number,
  ): ScenarioTarget => {
    const perShare = isNum(perShareValue) ? tn(name, perShareValue) : null;
    return { name, perShare, upsidePct: upsideOf(perShare), growthDeltaPp, marginDeltaPp };
  };

  // base = the deterministic DCF fair value (reused). bull/bear re-run the SAME
  // engine with ±σ-shifted growth/margin paths and the SAME equity bridge.
  const shared = buildScenarioPaths(assumptions, opts, { sigmaGrowth: dg, sigmaMargin: disp.sigmaMargin, growthMarginCorrelation: effectiveCorr });

  // Where growth earns less than the reinvestment it needs, the +growth run lands
  // BELOW the −growth run, which would publish "bull" beneath "bear" and hand a
  // reader the risk direction backwards. buildScenarioPaths gives the bull the
  // growth shift that raises value and a margin shift that never cuts it (AMZN
  // audit 2026-10-20 finding 11), so the higher value is always labelled bull;
  // each scenario keeps the growth/margin deltas of the path that produced it.
  // base (the DCF fair value) is untouched, so it can never disagree with the
  // DCF page.
  const optimistic = { value: shared.bull.result.perShare, growthDeltaPp: shared.bull.growthDeltaPp, marginDeltaPp: shared.bull.marginDeltaPp };
  const pessimistic = { value: shared.bear.result.perShare, growthDeltaPp: shared.bear.growthDeltaPp, marginDeltaPp: shared.bear.marginDeltaPp };
  if (shared.orderingInverted) {
    missingReasons.push({
      field: "valuation.scenarioTargets.ordering",
      reason:
        "with the margin at base the lower-growth shock is worth more than the higher-growth one (the reinvestment the extra growth needs costs more than the operating profit it adds), so the bull carries the lower growth; bull/bear are labelled by per-share value so the published bull is never below bear, and each scenario's growth/margin deltas describe the path that produced it",
      severity: "warn",
    });
  }

  // A ±σ run whose equity value is at or below zero, or whose terminal value
  // exceeds the whole enterprise value, is outside the DCF's domain, the test the
  // base DCF itself must pass (B-29). Flooring such a run at 0 published a
  // bear target the base DCF would have withheld, so the fan is withheld instead.
  const outside = (["bull", "bear"] as const)
    .map((name) => ({ name, failure: dcfDomainFailure(shared[name].result) }))
    .filter((r): r is { name: "bull" | "bear"; failure: NonNullable<ReturnType<typeof dcfDomainFailure>> } => r.failure !== null);
  if (outside.length > 0) {
    const names = outside.map((r) => r.name).join(" and ");
    return suppressed(
      [
        {
          field: "valuation.scenarioTargets",
          reason: `Scenario price targets withheld: the ${names} run${outside.length === 1 ? " is" : "s are"} outside the DCF's domain — ` +
            outside.map((r) => `${r.name}: ${r.failure.failures.map((f) => f.detail).join("; ")}`).join("; "),
          severity: "warn",
        },
      ],
      [`Scenario price targets unavailable: the ${names} scenario${outside.length === 1 ? "" : "s"} fall${outside.length === 1 ? "s" : ""} outside the DCF's domain, which the base DCF's own value must also pass.`],
    );
  }

  // A fan is a range around the base. Where the DCF's value peaks (or bottoms)
  // at the base path, both ±σ runs land on one side of it, and a "bear – bull"
  // range would exclude the fair value it is meant to bracket. Faster growth
  // that earns less than its reinvestment, with slower growth releasing no
  // capital (reinvestment is floored at zero), gives that peak; Duke Energy's
  // merged second quarter reached it in the 2026-10-22 audit panel.
  const base = baseDcf.perShare;
  const side = isNum(base) && isNum(optimistic.value) && isNum(pessimistic.value) ? fanOutsideBase(base, optimistic.value, pessimistic.value) : null;
  if (side !== null) {
    const below = side === "below";
    return suppressed(
      [
        {
          field: "valuation.scenarioTargets",
          reason: `Scenario price targets withheld: both ±σ runs value the shares ${side} the base DCF ` +
            `(${round2(optimistic.value as number)} and ${round2(pessimistic.value as number)} against ${round2(base as number)} per share), so they do not bracket it and give no range around it` +
            (below ? "; the DCF's value peaks near the base growth path, where faster growth needs reinvestment that earns less than it costs and slower growth releases no capital" : ""),
          severity: "warn",
        },
      ],
      [`Scenario price targets unavailable: both ±σ runs fall ${side} the base DCF value, so they do not bracket it.`],
    );
  }

  // FIN-119: a path whose deduction takes the profit share while an unsplit temporary-equity total is deducted is withheld, and says why.
  const unsplitPath = baseDcf.bridge.temporaryEquity !== undefined && baseDcf.bridge.temporaryEquity.unsplit !== 0 &&
    (shared.bull.result.temporaryEquityWithheld !== undefined || shared.bear.result.temporaryEquityWithheld !== undefined);
  if (unsplitPath) {
    missingReasons.push({ field: "valuation.dcf.temporaryEquityAllocation", reason: unsplitCellsNote(baseDcf.bridge.temporaryEquity!.unsplit), severity: "warn" });
  }

  const targets: ScenarioTarget[] = [
    mk("bull", optimistic.value, optimistic.growthDeltaPp, optimistic.marginDeltaPp),
    mk("base", baseDcf.perShare, 0, 0),
    mk("bear", pessimistic.value, pessimistic.growthDeltaPp, pessimistic.marginDeltaPp),
  ];

  // D-65: the margin shift a path actually carries, when the cap cut it.
  const capped = shared.scenarioAssumptions.scenarios.filter((s) => s.effectiveMarginDeltaPp !== undefined);
  const signed = (v: number) => `${v >= 0 ? "+" : "−"}${round2(Math.abs(v))}pp`;
  const cappedText = capped.length === 0 ? "" :
    ` After the scenario margin cap the year-one margin shift is ${capped.map((s) => `${signed(s.effectiveMarginDeltaPp as number)} for ${s.name} (${signed(s.marginDeltaPp)} requested)`).join(" and ")}` +
    `${shared.scenarioAssumptions.scenarios.filter((s) => s.name !== "base" && s.effectiveMarginDeltaPp === undefined).map((s) => `, ${signed(s.marginDeltaPp)} for ${s.name}`).join("")}, so the shocks are not symmetric around the base margin.`;
  const basis = [
    "base target = the deterministic FCFF-DCF fair value per share (computed.valuation.dcf.perShare).",
    `bull/bear re-run the SAME DCF with year-one growth shifted ±${round2(dg)}pp and the year-one margin shifted ±${round2(Math.abs(shared.bull.marginDeltaPp))}pp, both shocks decaying to zero by the final explicit year; margin sample σ is scaled by observed growth/margin correlation (${effectiveCorr === null ? "unavailable" : round2(effectiveCorr)}), not assumed perfectly correlated, and the margin shift is applied only when it moves with the scenario.${marginWithheldText(shared)}${cappedText} Targets are labelled by per-share value, so the higher scenario is always bull; a fan with either run outside the DCF's domain is withheld.`,
    "Targets are computed-derived DCF sensitivities, not source-verified facts; no weight or probability is attached to them.",
    // D-65: the decay-and-cap paragraph is stated once, as the note of the
    // projections' scenario-construction table (it was printed three times).
    "The shock decay and the scenario margin cap are set out under the weighted projections' scenario construction.",
    ...(unsplitPath ? [unsplitCellsNote(baseDcf.bridge.temporaryEquity!.unsplit)] : []),
  ];

  return {
    status: "available",
    method: SCENARIO_TARGET_METHOD,
    methodVersion: SCENARIO_TARGET_METHOD_VERSION,
    scenarioAssumptions: shared.scenarioAssumptions,
    basis,
    dispersion: {
      growthSigmaPp: round2(disp.sigmaGrowth),
      marginSigmaPp: round2(disp.sigmaMargin),
      sigmaSource,
      growthMarginCorrelation: effectiveCorr,
    },
    targets,
    missingReasons,
  };
}
