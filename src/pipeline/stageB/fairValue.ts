/**
 * Stage B — deterministic intrinsic per-share fair value.
 *
 * PURE, deterministic TypeScript. This is the authority for the report's DCF-card
 * headline (valuation.dcf.perShare + upsidePct), which used to be authored by the
 * judge/LLM (2026-07-11 DCF-credibility checkpoint). It resolves the ROUTE-
 * APPROPRIATE deterministic per-share already computed by valueCompany — reused,
 * never recomputed, so it can never disagree with the valuation engine:
 *
 *  - general route  → the FCFF DCF fair value (computed.valuation.dcf.perShare);
 *  - bank/insurer   → the book-value excess-return per-share
 *                     (computed.valuation.excessReturn.perShare) — NO WACC/FCFF;
 *  - equity REIT / pre-revenue / dcf-suppressed → NO per-share intrinsic model
 *                     (REITs use P/FFO; pre-revenue has none) → SUPPRESSED.
 *
 * upsidePct = (perShare / current price − 1)·100, or null when the price or the
 * per-share is missing (never defaulted). The per-share is a `computed-derived`
 * TracedNumber (source "computed.valuation.*") — calculation traceability, NOT
 * factual verification. When no model applies or the equity bridge was suppressed
 * (net debt / diluted shares / ADR currency guard), the whole block is
 * `status:"suppressed"` with a null per-share and a disclosing reasons[] — a fair
 * value is SUPPRESSED, never fabricated.
 */

import { consensusYearsText, MAX_CONSENSUS_CV_PCT, MIN_CONSENSUS_ANALYSTS, type DcfAssumptions, type DcfYearRow, type ValuationResult } from "@/pipeline/stageB/valuation";
import type { ManifestEntry } from "@/types/core";
import type { DcfAssumption, FairValue, SensitivityCell, TracedNumber } from "@/report/schema";

/** Versioned method prior — bump when the resolution changes. */
export const FAIR_VALUE_METHOD_VERSION = "FAIR_VALUE_2026_07" as const;

export interface FairValueInputs {
  /** The route-dispatched valuation result (carries the per-route per-share). */
  valuation: ValuationResult;
  /** Current price for upside %; null ⇒ upside unknown (never defaulted). */
  currentPrice: number | null;
  /** Currency label for the per-share unit. */
  currency: string | null;
  asOf: string;
}

const isNum = (v: number | null | undefined): v is number =>
  typeof v === "number" && Number.isFinite(v);

const round2 = (v: number): number => Math.round(v * 100) / 100;

function suppressed(reasons: ManifestEntry[], basis: string[]): FairValue {
  return {
    status: "suppressed",
    method: null,
    methodVersion: FAIR_VALUE_METHOD_VERSION,
    perShare: null,
    upsidePct: null,
    basis,
    reasons,
  };
}

/**
 * Per-share unit label. The trading currency is NOT defaulted to USD: it
 * becomes the printed unit, so assuming it would denominate a foreign issuer's
 * figures in dollars on no evidence. Unknown reads as unknown.
 */
export function perShareUnit(currency: string | null): string {
  return currency !== null && currency.trim().length > 0
    ? `${currency}/share`
    : "per share (currency unknown)";
}

export function computeFairValue(inputs: FairValueInputs): FairValue {
  const { valuation, currency, asOf } = inputs;

  // Resolve the route-appropriate deterministic per-share, its method + source tag.
  let perShareValue: number | null = null;
  let method: "fcff-dcf" | "excess-return" | null = null;
  let source = "";
  let methodLabel = "";
  if (valuation.kind === "dcf") {
    method = "fcff-dcf";
    source = "computed.valuation.dcf.perShare";
    methodLabel = "FCFF discounted-cash-flow fair value (NOPAT − sales-to-capital reinvestment, Gordon terminal, EV→equity bridge)";
    perShareValue = valuation.dcf?.perShare ?? null;
  } else if (valuation.kind === "excess-return") {
    method = "excess-return";
    source = "computed.valuation.excessReturn.perShare";
    methodLabel = "book-value excess-return fair value (BV0 + Σ PV(ROE − cost of equity), no WACC/FCFF)";
    perShareValue = valuation.excessReturn.perShare;
  }

  // Audit 2026-10-22 B-29: a DCF outside its domain is not a fair value.
  if (valuation.kind === "dcf" && valuation.dcf?.domain !== undefined) {
    const domain = valuation.dcf.domain;
    return {
      status: "outside-domain",
      method: "fcff-dcf",
      methodVersion: FAIR_VALUE_METHOD_VERSION,
      perShare: null,
      upsidePct: null,
      basis: [
        `Model outside its domain: ${domain.failures.map((f) => f.detail).join("; ")}.`,
        "No per-share value, scenario targets, sensitivity grid or reverse DCF is published from it, and the valuation grade does not use it.",
      ],
      reasons: [{ field: "valuation.dcf.domain", reason: domain.reason, severity: "critical" }],
    };
  }

  if (method === null || !isNum(perShareValue)) {
    const reason =
      valuation.kind === "ineligible" ? valuation.gaps[0]?.reason ?? "Model applicability unresolved; intrinsic value withheld."
      : valuation.kind === "reit"
        ? "equity REITs are valued on P/FFO and P/AFFO multiples — no DCF-style per-share intrinsic value is modelled (docs/METHODOLOGY.md, Financial-company routes)"
        : valuation.kind === "pre-revenue"
          ? "pre-revenue company — no meaningful intrinsic per-share model in v1"
          : valuation.kind === "dcf-suppressed"
            ? "intrinsic per-share DCF suppressed for this route/overlay (e.g. structurally negative free cash flow) — see missing-data"
            : "deterministic intrinsic per-share unavailable — the model was not built, or net debt / diluted shares / the ADR currency guard suppressed the equity bridge";
    // Not-applicable routes are info; a suppressed bridge on a modellable route is a warn.
    const severity: ManifestEntry["severity"] =
      valuation.kind === "reit" || valuation.kind === "pre-revenue" ? "info" : "warn";
    return suppressed(
      [{ field: "valuation.dcf.perShare", reason, severity }],
      [`Intrinsic value per share unavailable: ${reason}.`],
    );
  }

  // Limited liability: common equity cannot be worth less than nothing. A DCF
  // whose enterprise value sits below net debt and the senior claims values
  // the equity at or below zero; the published figure is 0 with the reason,
  // and the upside bottoms at −100% — the same floor the scenario targets
  // apply to their extremes, so the two blocks can no longer contradict each
  // other (one refused a negative number the other published as available).
  const floored = perShareValue < 0;
  const reasons: ManifestEntry[] = floored
    ? [
        {
          field: "valuation.dcf.perShare.floor",
          reason: `the ${method} per-share is ${round2(perShareValue)} — enterprise value at or below net debt and the senior claims; published as 0 (common equity cannot be worth less than nothing) with the upside capped at −100%`,
          severity: "warn",
        },
      ]
    : [];
  const perShare: TracedNumber = {
    value: floored ? 0 : round2(perShareValue),
    unit: perShareUnit(currency),
    // computed.* ⇒ the verify pass classifies this computed-derived (provenance,
    // not correctness). verified:true == "traced to computed inputs", the same
    // convention projections/scenarioTargets use — NOT a factual claim.
    source,
    asOf,
    verified: true,
  };
  const upsidePct =
    isNum(inputs.currentPrice) && inputs.currentPrice > 0
      ? (perShare.value / inputs.currentPrice - 1) * 100
      : null;

  // Audit 2026-10-22 C-10: the excess-return start, and the fiscal-year start
  // beside it when the two differ by more than the house threshold.
  const startLines: string[] = [];
  let alternative: FairValue["alternative"];
  if (valuation.kind === "excess-return") {
    const er = valuation.excessReturn;
    startLines.push(`Excess-return path: ${er.roePathPct.basis}.`);
    const alt = er.startAlternative;
    if (alt?.besideHeadline === true && isNum(alt.perShare)) {
      const altPerShare = round2(Math.max(0, alt.perShare));
      alternative = {
        label: alt.label,
        perShare: altPerShare,
        upsidePct: isNum(inputs.currentPrice) && inputs.currentPrice > 0 ? (altPerShare / inputs.currentPrice - 1) * 100 : null,
      };
      startLines.push(
        `The ${alt.label} gives ${altPerShare} per share from its own fiscal-year book value; the two starts are ${round2(Math.abs(alt.differencePp))}pp apart, so it is shown beside the headline (house convention: more than 5pp).`,
      );
    }
  }

  return {
    status: "available",
    method,
    methodVersion: FAIR_VALUE_METHOD_VERSION,
    perShare,
    upsidePct,
    basis: [
      `Intrinsic value per share = the deterministic ${methodLabel}.`,
      "Computed-derived (source computed.valuation.*), not a source-verified analyst target — the LLM interprets it but does not author the number.",
      ...(floored
        ? [
            `The model's per-share is ${round2(perShareValue)}: enterprise value sits at or below net debt and the senior claims, so the intrinsic value is published as 0 under limited liability and the upside is capped at −100%.`,
          ]
        : []),
      ...startLines,
    ],
    reasons,
    ...(alternative !== undefined ? { alternative } : {}),
  };
}

/* ------------------------------------------------------------------------ *
 * Deterministic DCF display (assumptions rows + sensitivity cells)
 *
 * Reshapes the DETERMINISTIC Stage B DcfAssumptions + SensitivityGrid into the
 * report's display shapes so the valuation card shows the real computed inputs,
 * not judge-transcribed ones. Only the general FCFF-DCF route has these; every
 * other route (excess-return / REIT / pre-revenue / suppressed) returns EMPTY —
 * there is no FCFF DCF to show, so nothing is fabricated. Mirrors the company
 * page's AssumptionTable / SensitivityGridTable transforms.
 * ------------------------------------------------------------------------ */

const pct1 = (v: number): string => `${(Math.round(v * 10) / 10).toFixed(1)}%`;
const num2 = (v: number): string => (Math.round(v * 100) / 100).toFixed(2);
/** Compact large-number formatter for the start-revenue row. */
function big(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  return String(Math.round(v));
}

function assumptionRows(a: DcfAssumptions): DcfAssumption[] {
  const g = a.growthPath.value;
  const m = a.ebitMarginPath.value;
  // WS6: the discount rate and the growth anchor's range are report-visible
  // rows, so a reader sees the WACC inputs and the method spread, not just the
  // point estimate the fade starts from.
  const anchor = a.growthAnchor;
  // WS6 review (SHOULD-FIX 1): `pointPct` is the CLAMPED anchor the DCF fades
  // from, and the row says so when the clamp moved it — the table used to print
  // the pre-clamp median beside a year-one growth taken from the clamped value.
  const clampNote =
    anchor.preClampMedianPct === undefined
      ? ""
      : `, clamped from the ${pct1(anchor.preClampMedianPct)} median`;
  const anchorValue =
    anchor.rangePct === null
      ? `${pct1(anchor.pointPct)} (single method${clampNote})`
      : `${pct1(anchor.pointPct)} (range ${pct1(anchor.rangePct[0])} – ${pct1(anchor.rangePct[1])}${clampNote})`;
  // D-58: what set the year-one revenue level (guidance, consensus or run-rate).
  const revenueAnchor = a.revenueAnchor;
  const revenueAnchorRow: DcfAssumption[] = revenueAnchor === undefined
    ? []
    : [{
        name: "year-one revenue anchor",
        value: `${big(revenueAnchor.yearOneRevenue)} (${revenueAnchor.source === "guidance" ? "model extrapolation of quarterly guidance" : revenueAnchor.source}${revenueAnchor.clampedFrom === null ? "" : `, clamped from ${big(revenueAnchor.clampedFrom)}`})`,
        basis: revenueAnchor.basis,
      }];
  // D-65 (P2-9): the near-term rate is a row only when it set year one. Under
  // guidance or consensus it moves nothing in the DCF, and a "25.0% (range
  // …)" row beside an 82% year one read as an input; its methods stay in the
  // notes and the audit export.
  const nearTermRow: DcfAssumption[] = revenueAnchor?.evidence?.nearTermRateUsed === false
    ? []
    : [{ name: "near-term growth rate (median of methods, after the house clamp)", value: anchorValue, basis: anchor.basis }];
  // D-65: which explicit years consensus set, stated as a row so no text has to say "consensus-anchored" alone.
  const consensusYears = revenueAnchor?.consensusYears;
  const consensusRow: DcfAssumption[] = consensusYears === undefined || revenueAnchor?.consensusPath === undefined
    ? []
    : [{
        name: "consensus-anchored years",
        value: consensusYears.length === 0 ? "none" : `${consensusYearsText(consensusYears)} of ${a.years}`,
        basis: consensusYears.length === 0
          ? "no explicit year takes its growth from analyst consensus; the revenue anchor row says why"
          : `${consensusYearsText(consensusYears)} take their revenue from calendarized analyst consensus; years ${consensusYears[consensusYears.length - 1] + 1}–${a.years} follow the convergent fade. ` +
            `A year is anchored only while its fiscal-year estimates have at least ${MIN_CONSENSUS_ANALYSTS} analysts, an implied dispersion of at most ${MAX_CONSENSUS_CV_PCT}% ` +
            "((high − low) ÷ (d2(n) × mean)) and growth within the house band (house rule D-65); the DCF path vs consensus table shows every window",
      }];
  const valuationDateRow: DcfAssumption[] = a.valuationDate === undefined ? [] : [{
    name: "valuation date",
    value: a.valuationDate.value,
    basis: a.valuationDate.basis,
  }];
  return [
    { name: "start revenue", value: big(a.startRevenue.value), basis: a.startRevenue.basis },
    ...revenueAnchorRow,
    ...consensusRow,
    { name: "WACC (discount rate)", value: pct1(a.wacc.value), basis: a.wacc.basis },
    ...nearTermRow,
    { name: "revenue growth (yr1 → yrN)", value: `${pct1(g[0])} → ${pct1(g[g.length - 1])}`, basis: a.growthPath.basis },
    { name: "EBIT margin (yr1 → yrN)", value: `${pct1(m[0])} → ${pct1(m[m.length - 1])}`, basis: a.ebitMarginPath.basis },
    { name: "forecast tax rate (yr1 → yrN)", value: `${pct1(a.taxRatePath.value[0])} → ${pct1(a.taxRatePath.value.at(-1)!)}`, basis: `${a.taxRatePath.basis}; actual year-row tax rates include modeled loss carryforwards and can differ from this assumption path.` },
    { name: "sales-to-capital", value: num2(a.salesToCapital.value), basis: a.salesToCapital.basis },
    { name: "terminal growth", value: pct1(a.terminal.gTermPct.value), basis: a.terminal.gTermPct.basis },
    { name: "terminal ROIC", value: pct1(a.terminal.roicTermPct.value), basis: a.terminal.roicTermPct.basis },
    // D-60: the terminal reinvestment and the discounting convention are
    // assumptions the value depends on, so they are rows, not footnotes.
    { name: "terminal reinvestment (terminal growth / terminal ROIC)", value: pct1(a.terminal.reinvestmentRate.value * 100), basis: a.terminal.reinvestmentRate.basis },
    { name: "discounting convention", value: a.midYear.value ? "mid-year (terminal value at N − 0.5)" : "year-end", basis: a.midYear.basis },
    ...valuationDateRow,
    {
      name: "free cash flow, SBC treatment",
      value:
        a.sbc.value.beforeSbc === null
          ? "n/a"
          : a.sbc.value.afterSbc === null || a.sbc.value.sbc === null
            ? `${big(a.sbc.value.beforeSbc)} (unadjusted)`
            : `${big(a.sbc.value.beforeSbc)} → ${big(a.sbc.value.afterSbc)}`,
      basis: a.sbc.basis,
    },
  ];
}

export interface DcfDisplay {
  assumptions: DcfAssumption[];
  sensitivityGrid: SensitivityCell[];
  sensitivityNotes?: string[];
  bridge?: {
    enterpriseValue: number | null; netDebt: number | null; minorityInterest: number | null; preferredEquity: number | null;
    equityValue: number | null; dilutedShares: number | null; presentValueExplicit: number | null; presentValueTerminal: number | null;
    currency: string | null; asOf: string | null; nonOperatingAssets?: number;
    /** D-65: the bridge's non-operating assets, one row each. */
    nonOperatingComponents?: { label: string; value: number }[];
    /** D-65: the date the value is stated at, when rolled forward from the statement date. */
    valuationDate?: string; rollForwardFactor?: number;
    /** D-65: shares outstanding the quote implies, beside the diluted denominator. */
    sharesOutstandingAtQuote?: number;
  };
  /** D-65: each explicit window's DCF revenue beside calendarized consensus. */
  consensusPath?: { period: string; modelRevenue: number; consensusRevenue: number | null; gapPct: number | null; anchored: boolean;
    fiscalYears: string; status: string }[];
  growthMarginGrid?: { growthShiftsPp: number[]; marginShiftsPp: number[]; perShare: (number | null)[][]; notes: string[] };
  /** Audit 2026-10-22 C-11: the excess-return route's start-return × cost-of-equity grid. */
  excessReturnGrid?: { rows: { label: string; startReturnPct: number; bookValue: number }[]; costOfEquityPcts: number[]; perShare: (number | null)[][]; notes: string[] };
  forecastRows?: { year: number; period: string; periodStart?: string; periodEnd?: string; periodBasis?: "rolling-12-month" | "fiscal-year";
    revenue: number; growthPct: number; ebitMarginPct: number; taxRatePct: number; nopat: number; reinvestment: number; fcff: number; presentValue: number }[];
}

export function computeDcfDisplay(valuation: ValuationResult, currency: string | null = null): DcfDisplay {
  // C-11: the excess-return route carries its own start-return × CoE grid.
  const erGrid = valuation.kind === "excess-return" ? valuation.excessReturn.startCoeGrid : undefined;
  if (erGrid !== undefined) {
    return { assumptions: [], sensitivityGrid: [], excessReturnGrid: {
      rows: erGrid.rows.map((r) => ({ ...r })), costOfEquityPcts: [...erGrid.costOfEquityPcts],
      perShare: erGrid.perShare.map((row) => [...row]), notes: [...erGrid.notes] } };
  }
  // Only the general FCFF-DCF route carries DCF assumptions + a WACC×g grid.
  if (valuation.kind !== "dcf" || valuation.assumptions === null) {
    return { assumptions: [], sensitivityGrid: [] };
  }
  const assumptions = assumptionRows(valuation.assumptions);
  const grid = valuation.sensitivity;
  const sensitivityGrid: SensitivityCell[] = [];
  if (grid !== null) {
    grid.waccPcts.forEach((w, i) => {
      grid.gTermPcts.forEach((gt, j) => {
        sensitivityGrid.push({ waccPct: w, gTermPct: gt, perShare: grid.perShare[i]?.[j] ?? null });
      });
    });
  }
  const dcf = valuation.dcf;
  const sensitivityNotes = grid ? { sensitivityNotes: [...grid.notes] } : {};
  if (dcf === null) return { assumptions, sensitivityGrid, ...sensitivityNotes };
  const mapRow = (r: DcfYearRow) => ({ year: r.year, period: r.period?.label ?? `Y+${r.year}`,
    ...(r.period ? { periodStart: r.period.startDate, periodEnd: r.period.endDate, periodBasis: r.period.basis } : {}),
    revenue: r.revenue, growthPct: r.growthPct, ebitMarginPct: r.ebitMarginPct, taxRatePct: r.taxRatePct,
    nopat: r.nopat, reinvestment: r.reinvestment, fcff: r.fcff, presentValue: r.pv });
  const growthMarginGrid = valuation.growthMarginGrid
    ? { growthMarginGrid: { growthShiftsPp: [...valuation.growthMarginGrid.growthShiftsPp], marginShiftsPp: [...valuation.growthMarginGrid.marginShiftsPp],
        perShare: valuation.growthMarginGrid.perShare.map((row) => [...row]), notes: [...valuation.growthMarginGrid.notes] } }
    : {};
  const a = valuation.assumptions;
  const vd = a.valuationDate;
  // D-65: the DCF path beside consensus, through the first window the
  // estimates no longer cover (the rest of the horizon is the fade alone).
  const path = a.revenueAnchor?.consensusPath;
  const lastCovered = path ? path.reduce((last, r, i) => (r.consensus !== null ? i : last), -1) : -1;
  const consensusPath = path && lastCovered >= 0
    ? path.slice(0, Math.min(path.length, lastCovered + 2)).flatMap((r) => {
        const row = dcf.yearRows[r.year - 1];
        if (row === undefined) return [];
        return [{
          period: row.period?.label ?? r.label,
          modelRevenue: row.revenue,
          consensusRevenue: r.consensus,
          gapPct: r.consensus === null || r.consensus <= 0 ? null : (row.revenue / r.consensus - 1) * 100,
          anchored: r.anchored,
          fiscalYears: r.fiscalYears.map((f) => `FY ending ${f.date}: ${big(f.revenue)}${f.reportedToDate !== undefined ? ` less ${big(f.reportedToDate)} reported` : ""}` +
            `, ${f.days} days, ${f.analysts === null ? "analyst count not given" : `${f.analysts} analysts`}` +
            `${f.dispersionPct === null ? "" : `, implied dispersion ${pct1(f.dispersionPct)}`}`).join("; "),
          status: r.status,
        }];
      })
    : [];
  return { assumptions, sensitivityGrid, ...sensitivityNotes, ...growthMarginGrid, bridge: {
    enterpriseValue: dcf.enterpriseValue, netDebt: dcf.bridge.netDebt, minorityInterest: dcf.bridge.minorityInterest,
    preferredEquity: dcf.bridge.preferred, equityValue: dcf.equityValue, dilutedShares: dcf.bridge.dilutedShares,
    presentValueExplicit: dcf.pvExplicit, presentValueTerminal: dcf.pvTerminal, currency,
    asOf: valuation.assumptions.asOf.statements,
    ...(dcf.bridge.nonOperatingAssets !== undefined ? { nonOperatingAssets: dcf.bridge.nonOperatingAssets } : {}),
    ...(dcf.bridge.nonOperatingComponents ? { nonOperatingComponents: dcf.bridge.nonOperatingComponents.map((c) => ({ label: c.label, value: c.value })) } : {}),
    ...(vd !== undefined ? { valuationDate: vd.value, rollForwardFactor: Math.pow(1 + a.wacc.value / 100, vd.elapsedYears) } : {}),
    ...(dcf.bridge.sharesOutstandingAtQuote !== undefined ? { sharesOutstandingAtQuote: dcf.bridge.sharesOutstandingAtQuote } : {}),
  }, forecastRows: dcf.yearRows.map(mapRow), ...(consensusPath.length > 0 ? { consensusPath } : {}) };
}
