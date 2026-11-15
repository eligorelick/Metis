/** DCF projection and domain checks; suppress outputs outside the model domain (P14; D-102). */
import { type ConvertibleReading } from "@/pipeline/stageB/convertibles";
import { type ShareBasisComparison } from "@/pipeline/stageB/dilutedDivisor";
import { type ManifestEntry } from "@/types/core";
import { isNum, fmtMoney, fmtNum, TV_GUARD_PP, gapEntry, safeDiv } from "./primitives";
import { type DcfAssumptions } from "./assumptions";
import { bridgeToPerShare, unsplitEarningsKeyReason, noncontrollingBridgeNote } from "./equityBridge";


// ---------------------------------------------------------------------------
// DCF engine
// ---------------------------------------------------------------------------

export interface DcfRunOptions {
  waccPct: number;
  /** Net debt in reporting-currency units (totalDebt - cash...); null = gap. */
  netDebt: number | null;
  dilutedShares: number | null;
  /**
   * Minority (non-controlling) interest — a claim senior to common equity, netted
   * out of EV in the bridge. Undisclosed ⇒ omit/null ⇒ treated as 0 (FMP convention,
   * mirroring the multiples-path EV definition). Never part of net debt.
   */
  minorityInterest?: number | null;
  /** Preferred equity — same treatment as minority interest above. */
  preferred?: number | null;
  /* D-102: Apply the established noncontrolling earnings key consistently in the common-equity bridge. */
  noncontrollingEarningsShare?: number | null;
  /** E-5: the end of the period the share was measured over, for the disclosure. */
  noncontrollingEarningsAsOf?: string | null;
  /** E-5: that period: the trailing four quarters, or the latest fiscal year when they cannot size the key. */
  noncontrollingEarningsBasis?: "ttm" | "annual";
  /**
   * D-60: non-operating assets ADDED to equity value, at a sourced fair value
   * (marketable equity securities excluded from cash). Their returns are below
   * EBIT, so the FCFF path does not value them. Omit/null ⇒ none.
   */
  nonOperatingAssets?: number | null;
  /** D-65: what `nonOperatingAssets` is made of, for the bridge disclosure; the engine reads only the total. */
  nonOperatingComponents?: NonOperatingAssetComponent[] | null;
  /**
   * FIN-119: the temporary-equity claims already folded into `preferred` and
   * `minorityInterest`. Disclosure only, so every re-run of the bridge (D-26)
   * carries what the base bridge deducted.
   */
  temporaryEquity?: TemporaryEquityDisclosure | null;
}

/** FIN-119: the redeemable claims inside a bridge's `preferred` and `minorityInterest` (never added again). */
export interface TemporaryEquityDisclosure {
  redeemablePreferred: number;
  redeemableNoncontrolling: number;
  unsplit: number;
  basis: string;
}

/* D-135, D-65, D-98: Deduct established senior claims once on the same basis as the enterprise value. */
export interface NonOperatingAssetComponent {
  kind: "marketable-equity-securities" | "long-term-investments" | "investment-tax" | "debt-like-obligation";
  label: string;
  value: number;
  basis: string;
}

export interface DcfYearRow {
  period?: DcfForecastPeriod;
  year: number;
  revenue: number;
  growthPct: number;
  ebitMarginPct: number;
  ebit: number;
  taxRatePct: number;
  nopat: number;
  reinvestment: number;
  fcff: number;
  discountFactor: number;
  pv: number;
}

export interface DcfForecastPeriod {
  basis: "rolling-12-month" | "fiscal-year";
  startDate: string;
  endDate: string;
  label: string;
}

/** Calendar-anniversary windows, clamped for leap days; never a guessed fiscal year. */
export function forecastYearPeriod(anchorEndDate: string, t: number, basis: DcfForecastPeriod["basis"]): DcfForecastPeriod | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchorEndDate) || !Number.isInteger(t)) return null;
  const anchor = new Date(`${anchorEndDate}T00:00:00Z`);
  if (!Number.isFinite(anchor.getTime()) || anchor.toISOString().slice(0, 10) !== anchorEndDate) return null;
  // Retain the exact four-digit ISO-date contract, including the main branch's
  // overflow guard. setUTCFullYear avoids Date.UTC's 1900 offset for years <100.
  if (anchor.getUTCFullYear() + t > 9999 || anchor.getUTCFullYear() + t - 1 < 0) return null;
  const anniversary = (offset: number) => {
    const year = anchor.getUTCFullYear() + offset;
    const month = anchor.getUTCMonth();
    const lastDay = new Date(anchor);
    lastDay.setUTCFullYear(year, month + 1, 0);
    const shifted = new Date(anchor);
    shifted.setUTCFullYear(year, month, Math.min(anchor.getUTCDate(), lastDay.getUTCDate()));
    return shifted;
  };
  const endDate = anniversary(t).toISOString().slice(0, 10);
  const start = anniversary(t - 1);
  start.setUTCDate(start.getUTCDate() + 1);
  return { basis, startDate: start.toISOString().slice(0, 10), endDate,
    label: basis === "fiscal-year" ? `FY${endDate.slice(0, 4)} ending ${endDate}` : `12M ending ${endDate}` };
}

/** The EV→equity→per-share bridge a DCF result was computed with. */
export interface DcfBridge {
  convertibles?: ConvertibleReading[];
  netDebt: number | null;
  dilutedShares: number | null;
  minorityInterest: number | null;
  preferred: number | null;
  /** FIN-119: the temporary-equity claims inside `preferred` / `minorityInterest` above (disclosure only). */
  temporaryEquity?: TemporaryEquityDisclosure;
  /** D-60: present only when the bridge added a sourced non-operating asset. */
  nonOperatingAssets?: number;
  /** D-65: the components of `nonOperatingAssets`, when more than the D-60 equity securities are known. */
  nonOperatingComponents?: NonOperatingAssetComponent[];
  /**
   * D-65: shares outstanding the quote implies (market cap ÷ price), shown
   * beside the diluted denominator; disclosure only, never the divisor.
   */
  sharesOutstandingAtQuote?: number;
  /**
   * D-265 (P3, P20): the divisor beside the quote count, the measured difference and, for a divisor below the quote
   * count, the filed held-share evidence or "not established"; disclosure only, never a divisor or a market cap.
   */
  shareBasis?: ShareBasisComparison;
  /** D-265: the reader sentence for a divisor below the quote count (absent otherwise). */
  shareBasisNote?: string;
  /** E-5: NCI's share of consolidated profit, when the earnings key was established. */
  noncontrollingEarningsShare?: number;
  noncontrollingEarningsAsOf?: string | null;
  noncontrollingEarningsBasis?: "ttm" | "annual";
  /** E-5: the NCI amount the base bridge deducted (book, or the earnings share of consolidated equity value). */
  noncontrollingDeducted?: number;
  noncontrollingDeductionBasis?: "book" | "earnings-share";
}

export interface DcfResult {
  enterpriseValue: number;
  equityValue: number | null;
  perShare: number | null;
  /**
   * The bridge this result used. Every consumer that re-runs the DCF for a
   * scenario (scenarioTargets.ts, projections.ts) reads it from here, so bull,
   * base and bear can never bridge on different net debt: valueCompany removes
   * the operating-lease liability before bridging, and a re-run on the raw
   * figure published a bull target below base for every lease-heavy issuer.
   */
  bridge: DcfBridge;
  pvExplicit: number;
  pvTerminal: number;
  /** pvTerminal / enterpriseValue (share of value in the terminal). */
  terminalShare: number | null;
  terminalValue: number;
  /** Terminal growth actually used after the TV guard (pct). */
  gTermUsedPct: number;
  yearRows: DcfYearRow[];
  notes: string[];
  gaps: ManifestEntry[];
  /* D-102: Withhold per-share outputs and reruns when the DCF fails its domain tests. */
  domain?: DcfDomainFailure;
  /* D-102: Apply the established noncontrolling earnings key consistently in the common-equity bridge. */
  noncontrollingKeyWithheld?: string;
  /**
   * FIN-119: set only when the per-share value was withheld because a
   * temporary-equity claim is refused, or an unsplit total meets the E-5
   * earnings key (no earlier gate had withheld it).
   */
  temporaryEquityWithheld?: string;
}

/* D-102: Withhold per-share outputs and reruns when the DCF fails its domain tests. */
export interface DcfDomainTest {
  test: "equity-value-non-positive" | "terminal-share-above-100pct";
  detail: string;
}

export interface DcfDomainFailure {
  status: "outside";
  failures: DcfDomainTest[];
  /** The per-share the model computed before it was withheld (null when no share count). */
  rawPerShare: number | null;
  reason: string;
}

/* D-102: Withhold per-share outputs and reruns when the DCF fails its domain tests. */
export function dcfDomainFailure(dcf: DcfResult): DcfDomainFailure | null {
  const failures: DcfDomainTest[] = [];
  if (isNum(dcf.equityValue) && dcf.equityValue <= 0) {
    failures.push({
      test: "equity-value-non-positive",
      detail: `equity value ${fmtMoney(dcf.equityValue)} is at or below zero: enterprise value ${fmtMoney(dcf.enterpriseValue)} does not cover net debt and the senior claims`,
    });
  }
  if (dcf.pvExplicit < 0) {
    const share = dcf.enterpriseValue > 0 ? ` (${fmtNum((dcf.pvTerminal / dcf.enterpriseValue) * 100)}% of enterprise value ${fmtMoney(dcf.enterpriseValue)})` : "";
    failures.push({
      test: "terminal-share-above-100pct",
      detail: `the terminal value's present value ${fmtMoney(dcf.pvTerminal)} exceeds the whole enterprise value${share}: the explicit-period present value is ${fmtMoney(dcf.pvExplicit)}, below zero`,
    });
  }
  if (failures.length === 0) return null;
  const reason =
    `FCFF DCF outside its domain: ${failures.map((f) => f.detail).join("; ")}. ` +
    "The per-share value, sensitivity grids, reverse DCF and scenario targets are withheld, and the valuation grade does not use the DCF";
  // `rawPerShare` is null when an unsplit temporary-equity total met the earnings key (the per share was already withheld); nothing reads it.
  return { status: "outside", failures, rawPerShare: dcf.perShare, reason };
}

interface DcfCoreOverrides {
  growthPathPct?: number[];
  ebitMarginPathPct?: number[];
  gTermPct?: number;
  /** "clamp": pull gTerm down to wacc - guardPp and note; "null": return null. */
  guardMode: "clamp" | "null";
  /** WACC − gTerm minimum (pp) before the TV guard fires. Default TV_GUARD_PP (2.0pp). */
  guardPp?: number;
}

interface DcfCoreOutput {
  pvExplicit: number;
  pvTerminal: number;
  terminalValue: number;
  enterpriseValue: number;
  gTermUsedPct: number;
  yearRows: DcfYearRow[];
  notes: string[];
}

/** Shared DCF evaluation. Cash-flow path derives only from assumptions (+overrides). */
function dcfCore(
  a: DcfAssumptions,
  waccPct: number,
  o: DcfCoreOverrides,
): DcfCoreOutput | null {
  const notes: string[] = [];
  const n = a.years;
  const growth = o.growthPathPct ?? a.growthPath.value;
  const margins = o.ebitMarginPathPct ?? a.ebitMarginPath.value;
  const taxes = a.taxRatePath.value;
  const midYear = a.midYear.value;
  const w = waccPct / 100;
  if (w <= -1) return null; // degenerate discount rate

  const guardPp = o.guardPp ?? TV_GUARD_PP;
  let gTerm = o.gTermPct ?? a.terminal.gTermPct.value;
  if (waccPct - gTerm < guardPp) {
    if (o.guardMode === "null") return null;
    const clamped = waccPct - guardPp;
    notes.push(
      `Gordon TV guard: WACC ${fmtNum(waccPct)}% - terminal growth ${fmtNum(gTerm)}% < ${guardPp}pp — terminal growth reduced to ${fmtNum(clamped)}% (house rule)`,
    );
    gTerm = clamped;
  }

  const s2c = a.salesToCapital.value;
  // D-65: the value is stated at the quote date, `elapsed` years after the
  // statement date the windows are measured from.
  const elapsed = a.valuationDate && Number.isFinite(a.valuationDate.elapsedYears) && a.valuationDate.elapsedYears > 0 ? a.valuationDate.elapsedYears : 0;
  const yearRows: DcfYearRow[] = [];
  let rev = a.startRevenue.value;
  let pvExplicit = 0;
  // Net-operating-loss balance carried across the explicit horizon.
  let nolBalance = 0;
  let nolUsed = false;
  for (let t = 1; t <= n; t++) {
    const g = growth[t - 1];
    const m = margins[t - 1];
    const tax = taxes[t - 1];
    const prev = rev;
    rev = prev * (1 + g / 100);
    const ebit = rev * (m / 100);
    // A loss year earns no cash tax REFUND. `ebit * (1 - t)` applied to a
    // negative EBIT credits the firm |EBIT| x t of cash it never receives,
    // shrinking the modelled loss and inflating the DCF — on exactly the
    // unprofitable issuers whose valuation is least certain. Note the
    // deliberate asymmetry one line below: reinvestment is already floored at 0.
    // Losses are instead carried forward and shelter later taxable income,
    // which is standard DCF practice; no jurisdictional cap is modelled.
    let nopat: number;
    // Report the rate actually applied, so ebit/taxRatePct/nopat stay
    /* D-58: Do not create a tax benefit on negative EBIT; apply the evidenced tax path to positive operating profit. */
    let effectiveTaxPct: number;
    if (ebit <= 0) {
      nopat = ebit;
      nolBalance += -ebit;
      effectiveTaxPct = 0;
    } else if (nolBalance <= 0) {
      // Unchanged arithmetic, deliberately: the overwhelming majority of
      // issuers project no loss year, and rearranging this expression would
      // shift their results in the last floating-point digit for no reason.
      nopat = ebit * (1 - tax / 100);
      effectiveTaxPct = tax;
    } else {
      const sheltered = Math.min(ebit, nolBalance);
      nolBalance -= sheltered;
      nolUsed = true;
      nopat = ebit - (ebit - sheltered) * (tax / 100);
      effectiveTaxPct = ((ebit - nopat) / ebit) * 100;
    }
    const reinvestment = Math.max(0, (rev - prev) / s2c);
    const fcff = nopat - reinvestment;
    const discountFactor = Math.pow(1 + w, (midYear ? t - 0.5 : t) - elapsed);
    const pv = fcff / discountFactor;
    pvExplicit += pv;
    yearRows.push({
      year: t,
      ...(a.forecastPeriod && forecastYearPeriod(a.forecastPeriod.anchorEndDate, t, a.forecastPeriod.basis)
        ? { period: forecastYearPeriod(a.forecastPeriod.anchorEndDate, t, a.forecastPeriod.basis)! } : {}),
      revenue: rev,
      growthPct: g,
      ebitMarginPct: m,
      ebit,
      taxRatePct: effectiveTaxPct,
      nopat,
      reinvestment,
      fcff,
      discountFactor,
      pv,
    });
  }

  if (nolUsed) {
    notes.push(
      "Projected operating losses earn no cash tax refund; they are carried forward and shelter later " +
        "taxable income within the explicit horizon (no jurisdictional carryforward cap modelled). " +
        "Year rows report the effective rate actually applied.",
    );
  }
  if (nolBalance > 0) {
    notes.push(
      "Unused net operating losses remain at the end of the explicit horizon; no residual tax asset is " +
        "credited to the terminal value (conservative).",
    );
  }

  // Terminal: FCFF_{N+1} = NOPAT_{N+1} * (1 - g/ROICterm); TV = FCFF_{N+1}/(WACC - g)
  const roicTerm = a.terminal.roicTermPct.value;
  let reinvestRate: number;
  if (roicTerm > 0) {
    reinvestRate = gTerm / roicTerm;
    if (reinvestRate > 1) {
      notes.push(
        `terminal reinvestment rate g/ROIC = ${fmtNum(reinvestRate)} > 1 — clamped to 1 (house rule; terminal FCFF floored at 0)`,
      );
      reinvestRate = 1;
    }
  } else {
    reinvestRate = 0;
    notes.push("terminal ROIC <= 0 — terminal reinvestment set to 0 (house rule)");
  }
  const marginTerm = margins[n - 1];
  const taxTerm = taxes[n - 1];
  // Same rule as the explicit years: a negative terminal EBIT is not handed a
  // tax refund.
  const ebitN1 = rev * (1 + gTerm / 100) * (marginTerm / 100);
  const nopatN1 = ebitN1 > 0 ? ebitN1 * (1 - taxTerm / 100) : ebitN1;
  const fcffN1 = nopatN1 * (1 - reinvestRate);
  const terminalValue = fcffN1 / ((waccPct - gTerm) / 100);
  const pvTerminal = terminalValue / Math.pow(1 + w, (midYear ? n - 0.5 : n) - elapsed);

  return {
    pvExplicit,
    pvTerminal,
    terminalValue,
    enterpriseValue: pvExplicit + pvTerminal,
    gTermUsedPct: gTerm,
    yearRows,
    notes,
  };
}

/**
 * Run the FCFF DCF: mid-year convention per assumptions, Gordon terminal with
 * the WACC - g >= 2pp guard (clamps g down and notes it).
 */
export function runDcf(assumptions: DcfAssumptions, opts: DcfRunOptions): DcfResult {
  const gaps: ManifestEntry[] = [];
  const bridge: DcfBridge = {
    netDebt: opts.netDebt,
    dilutedShares: opts.dilutedShares,
    minorityInterest: opts.minorityInterest ?? null,
    preferred: opts.preferred ?? null,
    ...(opts.temporaryEquity ? { temporaryEquity: { ...opts.temporaryEquity } } : {}),
    ...(isNum(opts.noncontrollingEarningsShare) ? {
      noncontrollingEarningsShare: opts.noncontrollingEarningsShare,
      noncontrollingEarningsAsOf: opts.noncontrollingEarningsAsOf ?? null,
      ...(opts.noncontrollingEarningsBasis !== undefined ? { noncontrollingEarningsBasis: opts.noncontrollingEarningsBasis } : {}),
    } : {}),
    ...(isNum(opts.nonOperatingAssets) && opts.nonOperatingAssets !== 0 ? { nonOperatingAssets: opts.nonOperatingAssets } : {}),
    ...(isNum(opts.nonOperatingAssets) && opts.nonOperatingAssets !== 0 && opts.nonOperatingComponents && opts.nonOperatingComponents.length > 0
      ? { nonOperatingComponents: opts.nonOperatingComponents.map((c) => ({ ...c })) } : {}),
  };
  const core = dcfCore(assumptions, opts.waccPct, { guardMode: "clamp" });
  if (core === null) {
    // Only reachable for degenerate WACC (<= -100%); keep a total-function shape.
    return {
      enterpriseValue: 0,
      equityValue: null,
      perShare: null,
      bridge,
      pvExplicit: 0,
      pvTerminal: 0,
      terminalShare: null,
      terminalValue: 0,
      gTermUsedPct: assumptions.terminal.gTermPct.value,
      yearRows: [],
      notes: ["DCF not evaluable at the supplied WACC (degenerate discount rate)"],
      gaps: [gapEntry("valuation.dcf", "degenerate WACC input", "critical")],
    };
  }
  const { equityValue, perShare, noncontrollingDeducted, noncontrollingBasis, unsplitWithheld } = bridgeToPerShare(
    core.enterpriseValue,
    opts.netDebt,
    opts.dilutedShares,
    gaps,
    opts.minorityInterest ?? null,
    opts.preferred ?? null,
    opts.nonOperatingAssets ?? null,
    opts.noncontrollingEarningsShare ?? null,
    opts.temporaryEquity?.unsplit ?? 0,
  );
  const notes = [...core.notes];
  let temporaryEquityWithheld: string | undefined;
  if (unsplitWithheld === true) {
    temporaryEquityWithheld = unsplitEarningsKeyReason(opts.temporaryEquity!.unsplit);
    gaps.push(gapEntry("valuation.dcf.temporaryEquityAllocation", temporaryEquityWithheld, "warn"));
  }
  // E-5: book NCI, or a profit share valueCompany sized from positive NCI income (book may be zero).
  const noncontrollingClaim = (isNum(opts.minorityInterest) && opts.minorityInterest !== 0) || isNum(opts.noncontrollingEarningsShare);
  if (noncontrollingClaim || (isNum(opts.preferred) && opts.preferred !== 0)) {
    notes.push("equity bridge nets minority interest and preferred equity out of EV (in addition to net debt)");
  }
  // E-5: which NCI basis the bridge used, beside the other.
  if (noncontrollingClaim && equityValue !== null) {
    bridge.noncontrollingDeducted = noncontrollingDeducted;
    bridge.noncontrollingDeductionBasis = noncontrollingBasis;
    notes.push(noncontrollingBridgeNote(bridge, equityValue + noncontrollingDeducted));
  }
  return {
    enterpriseValue: core.enterpriseValue,
    equityValue,
    perShare,
    bridge,
    pvExplicit: core.pvExplicit,
    pvTerminal: core.pvTerminal,
    terminalShare: safeDiv(core.pvTerminal, core.enterpriseValue),
    terminalValue: core.terminalValue,
    gTermUsedPct: core.gTermUsedPct,
    yearRows: core.yearRows,
    notes,
    gaps,
    ...(temporaryEquityWithheld !== undefined ? { temporaryEquityWithheld } : {}),
  };
}
export { type DcfCoreOutput, dcfCore, type DcfCoreOverrides };
