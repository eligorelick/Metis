/** One deterministic identity for the target table and all projection fans. */
import { MARGIN_CLAMP_PP, runDcf, type DcfAssumptions, type DcfRunOptions } from "@/pipeline/stageB/valuation";

export interface ScenarioAssumptions {
  methodVersion: string;
  shockPersistence: "persistent-explicit-horizon";
  terminalTransition: string;
  growthMarginCorrelation: number | null;
  scenarios: { name: "bull" | "base" | "bear"; growthDeltaPp: number; marginDeltaPp: number }[];
  alternatives: { name: "decaying-growth-shock"; bullPerShare: number | null; bearPerShare: number | null; basis: string }[];
}

/** Preserve every valid base level, including a margin above the starting-anchor clamp. */
export function perturbScenarioAssumptions(a: DcfAssumptions, growthDelta: number, marginDelta: number): DcfAssumptions {
  const shifted = structuredClone(a);
  const shift = (path: number[], delta: number, lo: number, hi: number) => path.map(v =>
    Math.max(Math.min(lo, v) - Math.abs(delta), Math.min(v + delta, Math.max(hi, v) + Math.abs(delta))));
  shifted.growthPath.value = shift(a.growthPath.value, growthDelta, -30, 60);
  shifted.ebitMarginPath.value = shift(a.ebitMarginPath.value, marginDelta, MARGIN_CLAMP_PP[0], MARGIN_CLAMP_PP[1]);
  return shifted;
}

export function buildScenarioPaths(a: DcfAssumptions, opts: DcfRunOptions, dispersion: {
  sigmaGrowth: number; sigmaMargin: number; growthMarginCorrelation: number | null;
}) {
  const negligible = Math.round(dispersion.sigmaGrowth * 100) === 0 || Math.round(dispersion.sigmaMargin * 100) === 0;
  const correlation = negligible ? null : dispersion.growthMarginCorrelation;
  const dg = dispersion.sigmaGrowth;
  const dm = dispersion.sigmaMargin * (correlation ?? 0);
  const run = (growthDeltaPp: number, marginDeltaPp: number) => ({ growthDeltaPp, marginDeltaPp,
    result: runDcf(perturbScenarioAssumptions(a, growthDeltaPp, marginDeltaPp), opts) });
  const up = run(dg, dm);
  const down = run(-dg, -dm);
  // EV ordering works even when the per-share bridge is unavailable, and is the
  // same ordering as a valid common-equity bridge (all claims/shares held fixed).
  const orderingInverted = down.result.enterpriseValue > up.result.enterpriseValue;
  const bull = orderingInverted ? down : up;
  const bear = orderingInverted ? up : down;
  const decaying = (scenario: typeof bull) => {
    const path = perturbScenarioAssumptions(a, 0, scenario.marginDeltaPp);
    path.growthPath.value = a.growthPath.value.map((g, i, xs) =>
      g + scenario.growthDeltaPp * (xs.length <= 1 ? 0 : 1 - i / (xs.length - 1)));
    const value = runDcf(path, opts).perShare;
    return value === null ? null : Math.max(0, value);
  };
  const scenarioAssumptions: ScenarioAssumptions = {
    methodVersion: "SHARED_SCENARIO_PATHS_2026_10",
    shockPersistence: "persistent-explicit-horizon",
    terminalTransition: "Growth shocks persist through every explicit year, then reset to the unchanged Gordon terminal growth rate; the final shocked EBIT margin persists in terminal value. Tax, reinvestment efficiency, terminal ROIC and the equity bridge stay at base. These are sensitivities, not calibrated probabilities.",
    growthMarginCorrelation: correlation,
    scenarios: [
      { name: "bull", growthDeltaPp: bull.growthDeltaPp, marginDeltaPp: bull.marginDeltaPp },
      { name: "base", growthDeltaPp: 0, marginDeltaPp: 0 },
      { name: "bear", growthDeltaPp: bear.growthDeltaPp, marginDeltaPp: bear.marginDeltaPp },
    ],
    alternatives: [{ name: "decaying-growth-shock", bullPerShare: decaying(bull), bearPerShare: decaying(bear),
      basis: "Same scenario identity and persistent margin shock; only the growth shock decays linearly from its full first-year delta to zero in the final explicit year. Terminal growth remains base; labels retain the main scenario identity even if alternate values cross." }],
  };
  return { bull, bear, orderingInverted, scenarioAssumptions };
}
