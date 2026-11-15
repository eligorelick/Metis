/** DCF sensitivity grids and reverse solves; rerun the same model and domain rules (P16; D-99, D-102). */
import { type DcfCoreOutput, type DcfRunOptions, dcfCore, type DcfCoreOverrides } from "./dcf";
import { isNum, GRID_TV_GUARD_PP, SENSITIVITY_WACC_STEPS_PP, SENSITIVITY_STEPS_PP, posOrNull, gapEntry, fmtNum, convergentFadeWeights, REVERSE_PRESCAN_POINTS, BISECTION_MAX_ITER, BISECTION_TOL_PP, REVERSE_GROWTH_RANGE_PCT, REVERSE_MARGIN_RANGE_PCT, MARGIN_FADE_YEARS } from "./primitives";
import { type ManifestEntry } from "@/types/core";
import { type DcfAssumptions } from "./assumptions";
import { bridgeToPerShare, unsplitCellsNote } from "./equityBridge";


// ---------------------------------------------------------------------------
// Sensitivity grid
// ---------------------------------------------------------------------------

/**
 * D-102 for one grid cell: the cell's own rerun is outside the DCF's domain on the base DCF's tests
 * (equity value at or below zero, or an explicit-period present value below zero), so its per-share
 * is withheld, not published.
 */
function gridCellOutsideDomain(core: DcfCoreOutput, equityValue: number | null): boolean {
  return core.pvExplicit < 0 || (isNum(equityValue) && equityValue <= 0);
}

function gridDomainNote(withheld: number): string[] {
  return withheld === 0 ? [] : [
    `${withheld} cell${withheld === 1 ? "" : "s"} whose own rerun is outside the DCF's domain (equity value at or below zero, or a terminal value above the whole enterprise value) withheld, as the base DCF would be (audit 2026-10-22 B-29)`,
  ];
}

export interface SensitivityGrid {
  /** Row axis: WACC values (pct), base +/- 2 in 1pp steps (D-60). */
  waccPcts: number[];
  /** Column axis: terminal growth values (pct), base +/- 1 in 0.5 steps. */
  gTermPcts: number[];
  /** perShare[i][j] for waccPcts[i] x gTermPcts[j]; null where TV guard violated. */
  perShare: (number | null)[][];
  notes: string[];
  gaps: ManifestEntry[];
}

/**
 * 5x5 per-share sensitivity: WACC +/-2pp in 1pp steps (D-60) x gTerm +/-1pp in 0.5 steps. The
 * cash-flow path is held fixed; only discounting + terminal are recomputed.
 * Cells violating the grid TV guard (WACC - g < 1.5pp) are null, never
 * a huge number — a looser bound than the 2.0pp base-case guard on purpose.
 */
export function sensitivityGrid(assumptions: DcfAssumptions, base: DcfRunOptions): SensitivityGrid {
  const notes: string[] = [
    "Explicit-period reinvestment is floored at zero: contracting revenue does not release invested capital in these grid cells.",
    `grid cells with WACC - terminal growth < ${GRID_TV_GUARD_PP}pp are withheld and shown as — (Gordon TV guard; docs/METHODOLOGY.md, Fade and horizon)`,
  ];
  const gaps: ManifestEntry[] = [];
  const waccPcts = SENSITIVITY_WACC_STEPS_PP.map((s) => base.waccPct + s);
  const gTermPcts = SENSITIVITY_STEPS_PP.map((s) => assumptions.terminal.gTermPct.value + s);
  if (!isNum(base.netDebt) || posOrNull(base.dilutedShares) === null) {
    gaps.push(
      gapEntry(
        "valuation.sensitivityGrid",
        "net debt or diluted shares missing — per-share sensitivity not computable",
        "warn",
      ),
    );
    return {
      waccPcts,
      gTermPcts,
      perShare: waccPcts.map(() => gTermPcts.map(() => null)),
      notes,
      gaps,
    };
  }
  // Terminal ROIC is defined RELATIVE to the WACC (the terminal-value house
  // convention: WACC plus any evidenced excess), so each cell keeps the base
  // case's EXCESS rather than its level. At a fixed level a −1pp WACC row
  // earned a phantom +1pp excess and a +1pp row a phantom deficit, and under
  // the default rule the g-axis reversed sign across rows while the assumption
  // block said terminal ROIC = WACC.
  const terminalExcessPp = assumptions.terminal.roicTermPct.value - base.waccPct;
  notes.push(
    `terminal ROIC held at WACC ${terminalExcessPp >= 0 ? "+" : "−"} ${fmtNum(Math.abs(terminalExcessPp))}pp in every cell (the house convention defines it relative to the discount rate)`,
  );
  let withheld = 0;
  let unsplitCells = 0;
  const perShare = waccPcts.map((w) => {
    const cellAssumptions: DcfAssumptions = {
      ...assumptions,
      terminal: {
        ...assumptions.terminal,
        roicTermPct: { ...assumptions.terminal.roicTermPct, value: w + terminalExcessPp },
      },
    };
    return gTermPcts.map((g) => {
      const core = dcfCore(cellAssumptions, w, { gTermPct: g, guardMode: "null", guardPp: GRID_TV_GUARD_PP });
      if (core === null) return null;
      const bridged = bridgeToPerShare(
        core.enterpriseValue,
        base.netDebt,
        base.dilutedShares,
        [],
        base.minorityInterest ?? null,
        base.preferred ?? null,
        base.nonOperatingAssets ?? null,
        base.noncontrollingEarningsShare ?? null,
        base.temporaryEquity?.unsplit ?? 0,
      );
      if (bridged.unsplitWithheld === true) unsplitCells += 1;
      if (bridged.perShare !== null && gridCellOutsideDomain(core, bridged.equityValue)) {
        withheld += 1;
        return null;
      }
      return bridged.perShare;
    });
  });
  notes.push(...gridDomainNote(withheld));
  if (unsplitCells > 0) notes.push(unsplitCellsNote(base.temporaryEquity!.unsplit));
  return { waccPcts, gTermPcts, perShare, notes, gaps };
}

/** D-60: year-one revenue growth shifts (pp) of the growth × margin grid; each decays on the convergent weights. */
export const GROWTH_GRID_STEPS_PP: readonly number[] = [-20, -10, 0, 10, 20];
/** D-60: sustained operating-margin shifts (pp) of the growth × margin grid, applied to every year and the terminal value. */
export const MARGIN_GRID_STEPS_PP: readonly number[] = [-10, -5, 0, 5, 10];

export interface GrowthMarginGrid {
  growthShiftsPp: number[];
  marginShiftsPp: number[];
  /** perShare[i][j] for growthShiftsPp[i] × marginShiftsPp[j]; null above the scenario margin ceiling or without a bridge. */
  perShare: (number | null)[][];
  notes: string[];
}

/**
 * D-60: the two inputs that decide the value. The WACC × g grid varies the two least decisive
 * inputs; this one varies year-one growth (the reverse DCF's convergent-shift family, so the shift
 * is gone by the final explicit year) against a sustained operating-margin shift. A cell whose
 * margin would exceed the scenario ceiling (gross margin less the leanest operating-expense ratio
 * on record) above the base path is null, not priced.
 */
export function growthMarginGrid(assumptions: DcfAssumptions, base: DcfRunOptions): GrowthMarginGrid {
  const growthShiftsPp = [...GROWTH_GRID_STEPS_PP];
  const marginShiftsPp = [...MARGIN_GRID_STEPS_PP];
  const ceiling = assumptions.scenarioMarginCeiling?.pct ?? null;
  const weights = convergentFadeWeights(assumptions.growthPath.value.length);
  const notes = [
    "Explicit-period reinvestment is floored at zero: contracting revenue does not release invested capital in these grid cells.",
    `rows shift year-one revenue growth by ${growthShiftsPp.join("/")}pp, decaying on the convergent weights to zero by year ${assumptions.years}; ` +
      `columns shift the operating margin by ${marginShiftsPp.join("/")}pp in every year and the terminal value; WACC, terminal growth, tax and the bridge stay at base`,
    ceiling === null
      ? "no gross profit on record, so no cell is withheld for exceeding gross margin"
      : `cells whose margin would exceed ${fmtNum(ceiling)}% (gross margin less the leanest operating-expense ratio) above the base path are withheld`,
  ];
  let withheld = 0;
  let unsplitCells = 0;
  const perShare = growthShiftsPp.map((dg) =>
    marginShiftsPp.map((dm) => {
      const margins = assumptions.ebitMarginPath.value.map((m) => m + dm);
      if (ceiling !== null && dm > 0 && margins.some((m, i) => m > Math.max(assumptions.ebitMarginPath.value[i], ceiling) + 1e-9)) return null;
      const growth = assumptions.growthPath.value.map((g, i) => g + dg * (weights[i] ?? 0));
      const core = dcfCore(assumptions, base.waccPct, { growthPathPct: growth, ebitMarginPathPct: margins, guardMode: "clamp" });
      if (core === null) return null;
      const bridged = bridgeToPerShare(core.enterpriseValue, base.netDebt, base.dilutedShares, [], base.minorityInterest ?? null,
        base.preferred ?? null, base.nonOperatingAssets ?? null, base.noncontrollingEarningsShare ?? null, base.temporaryEquity?.unsplit ?? 0);
      if (bridged.unsplitWithheld === true) unsplitCells += 1;
      if (bridged.perShare !== null && gridCellOutsideDomain(core, bridged.equityValue)) {
        withheld += 1;
        return null;
      }
      return bridged.perShare;
    }),
  );
  notes.push(...gridDomainNote(withheld));
  if (unsplitCells > 0) notes.push(unsplitCellsNote(base.temporaryEquity!.unsplit));
  return { growthShiftsPp, marginShiftsPp, perShare, notes };
}

// ---------------------------------------------------------------------------
// Reverse DCF (market-implied growth / terminal margin)
// ---------------------------------------------------------------------------

/**
 * The one-parameter growth-path family a reverse solve searched. D-58 replaced
 * "linear-fade-to-terminal" (a linear fade from the solved year-one rate) with
 * "convergent-shift-to-terminal": the base path with its year-one growth moved
 * to the solved rate and every later year moved by the same amount times the
 * convergent fade weight, so the shift is gone by the final year. The base
 * path is the family member at the base year-one growth, so implied minus base
 * year-one growth compares like with like.
 */
export type GrowthPathFamily = "linear-fade-to-terminal" | "convergent-shift-to-terminal";

/** Both families start from a year-one rate and reach the base path's final rate. */
export function isStartingGrowthFamily(family: GrowthPathFamily | undefined): boolean {
  return family === "linear-fade-to-terminal" || family === "convergent-shift-to-terminal";
}

export interface ReverseDcfResult {
  marginPathFamily?: "base-shift-to-terminal";
  impliedMarginPathPct?: number[] | null;
  method: "growth" | "margin" | "none";
  /** First-year growth (pct) on `growthPathFamily`, reaching the forward model's final rate. */
  impliedRevenueGrowthPct: number | null;
  growthPathFamily?: GrowthPathFamily;
  baseRevenueGrowthPct?: number | null;
  impliedGrowthPathPct?: number[] | null;
  /** Market-implied terminal EBIT margin (pct) — margin-fallback mode. */
  impliedTerminalMarginPct: number | null;
  /**
   * D-99 (reverse DCF beyond the range): present only when the growth pre-scan found no root because
   * the price lies above (or below) the DCF value at every evaluable year-one growth on the grid.
   * `boundPct` is the grid end the price lies beyond, `perShareAtBound` the value there. No implied
   * growth is inferred; `basis` states what the grid does establish.
   */
  /** `rising`: value rises with growth across the whole grid, so the price implies growth beyond the range end. */
  growthOutsideRange?: { side: "above" | "below"; boundPct: number; perShareAtBound: number; rising: boolean; basis: string };
  notes: string[];
  gaps: ManifestEntry[];
}

interface Bracket {
  lo: number;
  hi: number;
  fLo: number;
  fHi: number;
}

/** Uniform pre-scan grid (17 points) over [lo, hi]. */
function prescanGrid(lo: number, hi: number): number[] {
  return Array.from(
    { length: REVERSE_PRESCAN_POINTS },
    (_, i) => lo + ((hi - lo) * i) / (REVERSE_PRESCAN_POINTS - 1),
  );
}

/** All sign-change brackets of f over the grid (skips non-evaluable points). */
function findBrackets(xs: number[], fs: (number | null)[]): Bracket[] {
  const brackets: Bracket[] = [];
  for (let i = 0; i < xs.length; i++) {
    const a = fs[i];
    if (a === null) continue;
    // Exact grid roots include both boundaries, even beside an unevaluable
    // point; they do not require a sign change in a neighbouring interval.
    if (a === 0) brackets.push({ lo: xs[i], hi: xs[i], fLo: a, fHi: a });
    if (i === xs.length - 1) continue;
    const b = fs[i + 1];
    if (b === null) continue;
    if (a * b < 0) brackets.push({ lo: xs[i], hi: xs[i + 1], fLo: a, fHi: b });
  }
  return brackets;
}

/** Bracket whose midpoint is closest to `anchor` (economically meaningful branch). */
function nearestBracket(brackets: Bracket[], anchor: number): Bracket | null {
  if (brackets.length === 0) return null;
  let best = brackets[0];
  let bestDist = Math.abs((best.lo + best.hi) / 2 - anchor);
  for (const b of brackets.slice(1)) {
    const d = Math.abs((b.lo + b.hi) / 2 - anchor);
    if (d < bestDist) {
      best = b;
      bestDist = d;
    }
  }
  return best;
}

/** Derivative-free bisection to BISECTION_TOL_PP, retaining exact price roots. */
function bisect(
  f: (x: number) => number | null,
  bracket: Bracket,
  price: number,
): number | null {
  let { lo, hi, fLo } = bracket;
  if (lo === hi) return lo; // exact grid root
  const fTol = 1e-10 * Math.abs(price);
  for (let iter = 0; iter < BISECTION_MAX_ITER && hi - lo > BISECTION_TOL_PP; iter++) {
    const mid = (lo + hi) / 2;
    const fMid = f(mid);
    if (fMid === null) return null; // guard tripped mid-bracket — cannot refine
    if (Math.abs(fMid) < fTol) return mid;
    if (fLo * fMid <= 0) {
      hi = mid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}

/**
 * Reverse DCF: what first-year revenue growth, on the base path shifted by the
 * same amount fading out by the final year (D-58, "convergent-shift-to-terminal"),
 * justifies the current price, everything else frozen at base case? Pre-scans
 * f(g) on a 17-point grid over [-20, +60], widened to base year-one growth
 * + 30pp when that is higher (value is non-monotone in growth when
 * ROIC < WACC — picks the sign-change bracket whose midpoint is nearest the
 * base-case year-1 growth), then bisects to 1bp. If no bracket exists or the
 * base-year FCFF is negative, falls back to solving the market-implied
 * terminal EBIT margin over [0, 60] with the same machinery.
 */
export function reverseDcf(
  currentPrice: number | null,
  assumptions: DcfAssumptions,
  opts: DcfRunOptions,
): ReverseDcfResult {
  const hit = { unsplit: false };
  const result = reverseDcfCore(currentPrice, assumptions, opts, hit);
  // D-135: a candidate path whose deduction takes the profit share while an unsplit total is
  // deducted is withheld from the solve.
  if (hit.unsplit) {
    const note = unsplitCellsNote(opts.temporaryEquity!.unsplit);
    result.notes.push(note);
    result.gaps.push(gapEntry("valuation.dcf.temporaryEquityAllocation", note, "warn"));
  }
  return result;
}

function reverseDcfCore(
  currentPrice: number | null,
  assumptions: DcfAssumptions,
  opts: DcfRunOptions,
  hit: { unsplit: boolean },
): ReverseDcfResult {
  const notes: string[] = [];
  const gaps: ManifestEntry[] = [];
  const none = (why: string): ReverseDcfResult => {
    notes.push(why);
    return { method: "none", impliedRevenueGrowthPct: null, impliedTerminalMarginPct: null,
      growthPathFamily: "convergent-shift-to-terminal", baseRevenueGrowthPct: assumptions.growthPath.value[0] ?? null,
      impliedGrowthPathPct: null, notes, gaps };
  };

  const price = posOrNull(currentPrice);
  if (price === null) {
    gaps.push(gapEntry("valuation.reverseDcf", "current price missing — nothing to invert", "warn"));
    return none("reverse DCF skipped: no current price");
  }
  if (!isNum(opts.netDebt) || posOrNull(opts.dilutedShares) === null) {
    gaps.push(
      gapEntry("valuation.reverseDcf", "net debt or diluted shares missing — per-share value not computable", "warn"),
    );
    return none("reverse DCF skipped: equity bridge inputs missing");
  }

  const n = assumptions.years;
  const perShareAt = (overrides: Omit<DcfCoreOverrides, "guardMode">): number | null => {
    const core = dcfCore(assumptions, opts.waccPct, { ...overrides, guardMode: "clamp" });
    if (core === null) return null;
    const bridged = bridgeToPerShare(
      core.enterpriseValue,
      opts.netDebt,
      opts.dilutedShares,
      [],
      opts.minorityInterest ?? null,
      opts.preferred ?? null,
      opts.nonOperatingAssets ?? null,
      opts.noncontrollingEarningsShare ?? null,
      opts.temporaryEquity?.unsplit ?? 0,
    );
    if (bridged.unsplitWithheld === true) hit.unsplit = true;
    if (gridCellOutsideDomain(core, bridged.equityValue)) {
      const reason = "Reverse-DCF candidates outside the DCF domain (negative explicit-period present value or non-positive equity) are withheld; no bound or bracket spans a withheld candidate.";
      if (!notes.includes(reason)) notes.push(reason);
      return null;
    }
    return bridged.perShare;
  };

  // Base-year FCFF sign check (negative-FCF companies skip the growth solve).
  const baseRows = dcfCore(assumptions, opts.waccPct, { guardMode: "clamp" });
  const baseFcff1 = baseRows?.yearRows[0]?.fcff ?? null;
  const baseG1 = assumptions.growthPath.value[0];
  const finalGrowth = assumptions.growthPath.value[n - 1];
  // D-58: the base path itself is the family member at g = baseG1.
  const shiftWeights = convergentFadeWeights(n);
  const shiftedPath = (g: number): number[] =>
    assumptions.growthPath.value.map((base, i) => base + (g - baseG1) * shiftWeights[i]);

  // D-99 (reverse DCF beyond the range): what an unbracketed growth scan establishes.
  let growthOutsideRange: ReverseDcfResult["growthOutsideRange"];

  const solveGrowth = (): ReverseDcfResult | null => {
    const lo = REVERSE_GROWTH_RANGE_PCT[0];
    const hi = Math.max(REVERSE_GROWTH_RANGE_PCT[1], baseG1 + 30);
    const xs = [...new Set([...prescanGrid(lo, hi), ...(baseG1 >= lo && baseG1 <= hi ? [baseG1] : [])])].sort((a, b) => a - b);
    const fG = (g: number): number | null => {
      const v = perShareAt({ growthPathPct: shiftedPath(g) });
      return v === null ? null : v - price;
    };
    const fs = xs.map(fG);
    const brackets = findBrackets(xs, fs);
    if (brackets.length === 0) {
      // D-99: with every grid value on one side of the price, the grid does establish something: no
      // year-one growth in the range reaches the price. The implied rate is still not inferred; only
      // which end it lies beyond, and only when value rises with growth across the whole grid.
      const values = fs.every((f) => f !== null) ? fs.map((f) => (f as number) + price) : null;
      const side = values === null ? null : values.every((v) => v < price) ? "above" : values.every((v) => v > price) ? "below" : null;
      let reason = `no root bracket for the fading year-one growth anchor on the [${lo}, ${hi}]% pre-scan grid; no outside-range growth is inferred because value may be non-monotone`;
      if (values !== null && side !== null) {
        const rising = values.every((v, i) => i === 0 || v >= values[i - 1]);
        const at = side === "above" ? xs.length - 1 : 0;
        const extreme = side === "above" ? Math.max(...values) : Math.min(...values);
        const basis = `the price ${fmtNum(price)} is ${side} the DCF value at every year-one growth on the [${fmtNum(lo)}, ${fmtNum(hi)}]% pre-scan grid ` +
          (rising
            ? `(${fmtNum(values[at])} at ${fmtNum(xs[at])}%), and value rises with growth across the grid, so the price implies year-one growth ${side} ${fmtNum(xs[at])}%`
            : `(${side === "above" ? "highest" : "lowest"} value ${fmtNum(extreme)}); value is non-monotone in growth here, so no year-one growth in the range ${side === "above" ? "reaches" : "comes down to"} the price and no outside-range growth is inferred`);
        growthOutsideRange = { side, boundPct: xs[at], perShareAtBound: values[at], rising, basis };
        reason = `no root bracket for the fading year-one growth anchor: ${basis}`;
      }
      notes.push(reason);
      gaps.push(gapEntry("valuation.reverseDcf.growthBracket", reason, "warn"));
      return null;
    }
    if (brackets.length > 1) {
      notes.push(
        `f(growth) non-monotone: ${brackets.length} sign-change brackets on the pre-scan grid — picked the bracket nearest base-case growth ${fmtNum(baseG1)}% (house rule)`,
      );
    }
    const bracket = nearestBracket(brackets, baseG1);
    if (bracket === null) return null;
    const root = bisect(fG, bracket, price);
    if (root === null) return null;
    notes.push(
      `implied first-year revenue growth, with every later year of the base path shifted by the same amount times its convergent fade weight so the shift is gone by year ${n} (final growth ${fmtNum(finalGrowth)}%); compare with the base year-one growth ${fmtNum(baseG1)}% on the same path, not a historical CAGR; all other assumptions frozen at base case`,
    );
    return { method: "growth", impliedRevenueGrowthPct: root, impliedTerminalMarginPct: null,
      growthPathFamily: "convergent-shift-to-terminal", baseRevenueGrowthPct: baseG1,
      impliedGrowthPathPct: shiftedPath(root), notes, gaps };
  };

  const solveMargin = (): ReverseDcfResult | null => {
    const [lo, hi] = REVERSE_MARGIN_RANGE_PCT;
    const m0 = assumptions.ebitMarginPath.value[0];
    const terminal = assumptions.ebitMarginPath.value[n - 1];
    const weights = assumptions.ebitMarginPath.value.map((_, i) => Math.min(1, i / Math.max(1, Math.min(MARGIN_FADE_YEARS, n) - 1)));
    const xs = [...new Set([...prescanGrid(lo, hi), ...(terminal >= lo && terminal <= hi ? [terminal] : [])])].sort((a,b) => a-b);
    const fM = (m: number): number | null => {
      const v = perShareAt({ ebitMarginPathPct: assumptions.ebitMarginPath.value.map((base, i) => base + (m - terminal) * weights[i]) });
      return v === null ? null : v - price;
    };
    const fs = xs.map(fM);
    const brackets = findBrackets(xs, fs);
    if (brackets.length === 0) {
      const fHi = fs[fs.length - 1];
      if (fHi !== null && fHi < 0) {
        notes.push(
          `even a ${hi}% terminal EBIT margin does not justify the price — years-to-breakeven framing applies (fallback B)`,
        );
      } else {
        notes.push("no sign change of f(terminal margin) on the pre-scan grid");
      }
      return null;
    }
    const anchor = assumptions.ebitMarginPath.value[n - 1];
    if (brackets.length > 1) {
      notes.push(
        `f(margin) has ${brackets.length} brackets — picked the one nearest base terminal margin ${fmtNum(anchor)}% (house rule)`,
      );
    }
    const bracket = nearestBracket(brackets, anchor);
    if (bracket === null) return null;
    const root = bisect(fM, bracket, price);
    if (root === null) return null;
    notes.push(
      `market-implied steady-state (terminal) EBIT margin, shifting the base margin path by the terminal-margin delta times its own fade weights (current ${fmtNum(m0)}% unchanged); growth path frozen at base case`,
    );
    return { method: "margin", impliedRevenueGrowthPct: null, impliedTerminalMarginPct: root,
      marginPathFamily: "base-shift-to-terminal",
      impliedMarginPathPct: assumptions.ebitMarginPath.value.map((base, i) => base + (root - terminal) * weights[i]),
      growthPathFamily: "convergent-shift-to-terminal", baseRevenueGrowthPct: baseG1,
      impliedGrowthPathPct: null, notes, gaps };
  };

  if (baseFcff1 !== null && baseFcff1 <= 0) {
    notes.push(
      "base-year FCFF <= 0 — revenue-growth inversion unreliable; solving market-implied terminal EBIT margin instead (fallback A)",
    );
    const viaMargin = solveMargin();
    if (viaMargin) return viaMargin;
    return none("reverse DCF: margin fallback found no root");
  }

  const viaGrowth = solveGrowth();
  if (viaGrowth) return viaGrowth;
  notes.push("growth inversion found no bracket — attempting terminal-margin fallback (fallback A)");
  const withOutside = (r: ReverseDcfResult): ReverseDcfResult => (growthOutsideRange ? { ...r, growthOutsideRange } : r);
  const viaMargin = solveMargin();
  if (viaMargin) return withOutside(viaMargin);
  return withOutside(none("reverse DCF: no root in growth [-20, 60] nor terminal margin [0, 60]"));
}
export { bisect };
