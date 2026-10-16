/** One deterministic identity for the target table and all projection fans. */
import { convergentFadeWeights, GROWTH_FADE_HALF_LIFE_YEARS, MARGIN_CLAMP_PP, runDcf, type DcfAssumptions, type DcfRunOptions } from "@/pipeline/stageB/valuation";

export interface ScenarioAssumptions {
  methodVersion: string;
  /**
   * "mean-reverting-convergent" (D-60): both shocks start at full size in year
   * one and decay on the base path's convergent weights to zero in the final
   * explicit year. "persistent-explicit-horizon" is the retired construction,
   * kept so stored reports still read.
   */
  shockPersistence: "mean-reverting-convergent" | "persistent-explicit-horizon";
  terminalTransition: string;
  growthMarginCorrelation: number | null;
  /**
   * `marginDeltaPp` is the shock requested; `effectiveMarginDeltaPp` (D-65),
   * present only when the scenario margin cap or the house bounds cut it, is
   * the year-one shift the path actually carries (NVDA bull: +10.12pp
   * requested, 0pp effective under the 65.21% cap).
   */
  scenarios: { name: "bull" | "base" | "bear"; growthDeltaPp: number; marginDeltaPp: number; effectiveMarginDeltaPp?: number }[];
  alternatives: { name: "decaying-growth-shock"; bullPerShare: number | null; bearPerShare: number | null; basis: string }[];
}

export const SCENARIO_PATHS_METHOD_VERSION = "SHARED_SCENARIO_PATHS_2026_10_D60" as const;

/**
 * D-60: mean-reverting scenario shocks. A ±σ growth shift held for all ten
 * explicit years (NVDA: +25pp a year to $7.9T of revenue, or ten straight
 * years of decline) compounds a one-year dispersion into a decade. Growth
 * beyond one or two years is not persistent (Chan, Karceski and Lakonishok
 * 2003) and profitability mean-reverts (Fama and French 2000), so each shock
 * takes the base path's convergent fade weight: full size in year one, gone in
 * the final explicit year, so the terminal growth rate and margin are the base
 * case's. Scenario margins are capped at gross margin less the leanest
 * operating-expense ratio on record (`scenarioMarginCeiling`), never below the
 * base path.
 */
export function perturbScenarioAssumptions(a: DcfAssumptions, growthDelta: number, marginDelta: number): DcfAssumptions {
  const shifted = structuredClone(a);
  const weights = convergentFadeWeights(a.growthPath.value.length);
  // The bounds give the shock headroom over the base-case clamps; they never
  // move a valid base level.
  const shift = (path: number[], delta: number, lo: number, hi: number) => path.map((v, i) => {
    const d = delta * (weights[i] ?? 0);
    return Math.max(Math.min(lo, v) - Math.abs(d), Math.min(v + d, Math.max(hi, v) + Math.abs(d)));
  });
  shifted.growthPath.value = shift(a.growthPath.value, growthDelta, -30, 60);
  const ceiling = a.scenarioMarginCeiling?.pct ?? null;
  shifted.ebitMarginPath.value = shift(a.ebitMarginPath.value, marginDelta, MARGIN_CLAMP_PP[0], MARGIN_CLAMP_PP[1])
    .map((m, i) => (ceiling === null ? m : Math.min(m, Math.max(a.ebitMarginPath.value[i], ceiling))));
  return shifted;
}

export function scenarioTerminalTransition(a: DcfAssumptions): string {
  const ceiling = a.scenarioMarginCeiling ?? null;
  return (
    `Growth and margin shocks are full size in year one and decay on the base path's convergent weights (a ${GROWTH_FADE_HALF_LIFE_YEARS}-year half-life, rescaled to reach zero in year ${a.years}), ` +
    "so terminal growth and the terminal margin equal the base case. " +
    (ceiling === null
      ? "No gross profit is on record, so scenario margins are bounded only by the house margin range. "
      : `Scenario operating margins are capped at ${Math.round(ceiling.pct * 100) / 100}% (gross margin ${Math.round(ceiling.grossMarginPct * 100) / 100}%, ${ceiling.grossMarginPeriod}, less the leanest operating-expense ratio ${Math.round(ceiling.minOpexRatioPct * 100) / 100}%, ${ceiling.minOpexRatioPeriod}), never below the base path. `) +
    "Tax, reinvestment efficiency, terminal ROIC and the equity bridge stay at base."
  );
}

export function buildScenarioPaths(a: DcfAssumptions, opts: DcfRunOptions, dispersion: {
  sigmaGrowth: number; sigmaMargin: number; growthMarginCorrelation: number | null;
}) {
  const negligible = Math.round(dispersion.sigmaGrowth * 100) === 0 || Math.round(dispersion.sigmaMargin * 100) === 0;
  const correlation = negligible ? null : dispersion.growthMarginCorrelation;
  const dg = dispersion.sigmaGrowth;
  const dm = dispersion.sigmaMargin * (correlation ?? 0);
  const run = (growthDeltaPp: number, marginDeltaPp: number) => {
    const shocked = perturbScenarioAssumptions(a, growthDeltaPp, marginDeltaPp);
    // D-65: the shift that survives the margin cap and growth bounds, by year.
    const effectiveMargin = shocked.ebitMarginPath.value.map((m, i) => m - a.ebitMarginPath.value[i]);
    return { growthDeltaPp, marginDeltaPp, effectiveMarginDeltaPp: effectiveMargin[0] ?? 0,
      marginCapBinding: Math.abs((effectiveMargin[0] ?? 0) - marginDeltaPp) > 1e-9, result: runDcf(shocked, opts) };
  };
  const up = run(dg, dm);
  const down = run(-dg, -dm);
  // EV ordering works even when the per-share bridge is unavailable, and is the
  // same ordering as a valid common-equity bridge (all claims/shares held fixed).
  const orderingInverted = down.result.enterpriseValue > up.result.enterpriseValue;
  const bull = orderingInverted ? down : up;
  const bear = orderingInverted ? up : down;
  const effective = (s: typeof up) => (s.marginCapBinding ? { effectiveMarginDeltaPp: s.effectiveMarginDeltaPp } : {});
  const scenarioAssumptions: ScenarioAssumptions = {
    methodVersion: SCENARIO_PATHS_METHOD_VERSION,
    shockPersistence: "mean-reverting-convergent",
    terminalTransition: scenarioTerminalTransition(a),
    growthMarginCorrelation: correlation,
    scenarios: [
      { name: "bull", growthDeltaPp: bull.growthDeltaPp, marginDeltaPp: bull.marginDeltaPp, ...effective(bull) },
      { name: "base", growthDeltaPp: 0, marginDeltaPp: 0 },
      { name: "bear", growthDeltaPp: bear.growthDeltaPp, marginDeltaPp: bear.marginDeltaPp, ...effective(bear) },
    ],
    // The decaying-growth alternative is now the main construction.
    alternatives: [],
  };
  return { bull, bear, orderingInverted, scenarioAssumptions };
}
