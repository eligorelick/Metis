/** Evidence-led DCF assumptions and revenue anchors; never tune inputs to price (P16; D-60). */
import { type FiscalDatedRow, quarterWindowViolation } from "@/pipeline/stageB/quarterWindows";
import { type FiscalYearRule, thirteenWeekFactor, periodDays, fiscalYearEndFor, fiftyTwoWeekFactor } from "../fiscalCalendar";
import { isNum, fmtNum, TERMINAL_EXCESS_RETURN_MIN_YEARS, TERMINAL_EXCESS_RETURN_CAP_PP, TERMINAL_EXCESS_RETURN_CARRY, TERMINAL_EXCESS_RETURN_MIN_PP, type Assumption, posOrNull, fmtMoney, DCF_HORIZON_YEARS, NEAR_TERM_GROWTH_CLAMP_PP, clampWithNote, zeroAsNull, gapEntry, TERMINAL_G_CAP_PCT, convergentFadePath, safeDiv, MARGIN_CLAMP_PP, MARGIN_FADE_YEARS, MARGIN_TREND_THRESHOLD_PP_PER_YEAR, IMPROVING_MARGIN_TREND_SHARE, fadePath, MARGIN_WARN_BAND_PP, marginalTaxFloor, establishedSalesToCapital, S2C_CLAMP, GROWTH_FADE_HALF_LIFE_YEARS } from "./primitives";
import { medianOf } from "./statistics";
import { type ManifestEntry } from "@/types/core";
import { daysBetween, MIN_CONSENSUS_ANALYSTS, MAX_CONSENSUS_CV_PCT, NEXT_QUARTER_DAYS, revenueRunRate, calendarizeConsensusWindow, seasonalQuarterShares, YEAR_AGO_QUARTER_DAYS, GUIDED_QUARTER_TO_YEAR_ONE_YEARS, LATEST_QUARTER_TO_YEAR_ONE_YEARS } from "./consensus";
import { forecastYearPeriod } from "./dcf";
import { parseIssuerGrowthEffect } from "@/edgar/currentReports";
import { CAGR_SPAN_TOLERANCE_YEARS, missingAnnualIntervals, interiorMissingDates, unavailableAnnualPeriods, linearRegressionSlope, yearsBetweenDates } from "@/pipeline/stageB/growth";
import { taxRateWithoutOneOffs } from "./tax";
import { leaseDebtScopeRefusal } from "@/pipeline/stageB/leaseScope";
import { operatingLeaseOutOfDebt, resolveNetDebt, millions, leaseDebtConflict } from "@/pipeline/stageB/netDebt";
import { resolveConsolidatedEquity } from "@/pipeline/stageB/ownership";
import { temporaryEquityClaims, LEASE_EMPTIED_CAPITAL_LEAD, TEMPORARY_EQUITY_REFUSAL_LEAD } from "@/pipeline/stageB/seniorClaims";
import { type GapCause } from "@/types/refusalCause";
import { MAX_ROLL_FORWARD_DAYS } from "@/pipeline/stageB/valuationUse";
import { DCF_TAX_OPERANDS_FIELD } from "@/report/assessment";


// ---------------------------------------------------------------------------
// DCF assumptions
// ---------------------------------------------------------------------------

/** Annual analyst-estimate row (FMP /stable/analyst-estimates field names). */
export interface AnalystEstimateRow {
  /** Fiscal period end the estimate refers to (ISO). */
  date: string;
  revenueAvg: number | null;
  /** D-65: number of analysts behind the revenue estimate (FMP numAnalystsRevenue); absent when the provider gives none. */
  analysts?: number | null;
  /** D-65: lowest and highest analyst revenue estimate. */
  revenueLow?: number | null;
  revenueHigh?: number | null;
}

/* D-60, D-65: Anchor the projection to the established revenue window and disclose the evidence used. */
export interface FiscalYearToDate {
  /** End of the previous fiscal year (the day before this fiscal year starts). */
  priorFiscalYearEnd: string;
  /** Last day reported (the TTM end). */
  through: string;
  revenue: number;
  quarters: number;
}

/* D-136: Calendarize consensus and guidance over the issuer fiscal windows using the established seasonal shape. */
export interface RevenueSeasonality {
  /** The last complete fiscal year's end; the fourth quarter ends on it. */
  fiscalYearEnd: string;
  quarters: { date: string; revenue: number }[];
}

/** D-65: one forecast window set against calendarized consensus. */
export interface ConsensusPathRow {
  year: number;
  label: string;
  startDate: string;
  endDate: string;
  /** Calendarized consensus revenue; null when the estimates do not cover the window. */
  consensus: number | null;
  /** True when this year's growth came from consensus. */
  anchored: boolean;
  /** Why the year is or is not anchored. */
  status: string;
  /** Fiscal-year estimates behind the window. */
  fiscalYears: { date: string; revenue: number; analysts: number | null; dispersionPct: number | null; days: number; reportedToDate?: number }[];
}

/** Income-statement slice used by the DCF builder (FMP field names). */
export interface DcfIncomeRow extends FiscalDatedRow {
  /** Whole operating statement projection; separate from a reported total that
   * can include equity-affiliate earnings and other non-operating income. */
  operatingBasis?: string;
  grossProfitBasis?: string;
  operatingPerimeterRefusal?: string;
  unusualOperatingItems?: number | null;
  date: string;
  /** Inclusive filed duration, or the gap to the preceding period end. */
  days?: number | null;
  /* D-60: Anchor the projection to the established revenue window and disclose the evidence used. */
  basis?: "ttm" | "annual";
  revenue: number | null;
  operatingIncome: number | null;
  /** D-60: gross profit, for the scenario operating-margin ceiling; absent or null leaves the ceiling unavailable. */
  grossProfit?: number | null;
  incomeBeforeTax?: number | null;
  incomeTaxExpense?: number | null;
  taxEvidenceBasis?: string;
}

/** Selected whole balance-sheet slice used by the DCF builder (FMP field names). */
export interface DcfBalanceRow {
  cashConflictReconciled?: true;
  cashBasis?: "cash-only";
  cashAndCashEquivalents?: number | null;
  shortTermInvestments?: number | null;
  fieldProvenance?: import("../leaseScope").LeaseScopeRow["fieldProvenance"];
  operatingLeaseLiability?: number | null;
  financeLeaseLiability?: number | null;
  capitalLeaseObligations?: number | null;
  /* D-97: Remove operating leases only when filed evidence establishes their inclusion and scope. */
  shortTermDebt?: number | null;
  longTermDebt?: number | null;
  leaseCoverageNote?: string;
  date: string;
  basis: "quarter" | "annual";
  totalDebt: number | null;
  totalStockholdersEquity: number | null;
  /** Consolidated equity is used once; otherwise parent equity plus signed NCI. */
  totalEquity?: number | null;
  minorityInterest?: number | null;
  /**
   * D-135: temporary equity is financing capital (read through `temporaryEquityClaims`; a refusal
   * rides in `fieldConflicts`).
   */
  temporaryEquity?: number | null;
  temporaryEquityAttributableToParent?: number | null;
  temporaryEquityAttributableToNoncontrollingInterest?: number | null;
  /**
   * D-135: Retain the preferred line as filed so `temporaryEquityClaims` can detect a mezzanine
   * series filed twice.
   */
  preferredStock?: number | null;
  fieldConflicts?: Record<string, { usable?: boolean; reason?: string } | undefined>;
  cashAndShortTermInvestments: number | null;
  /** D-60: non-operating long-term investments, removed from the sales-to-capital denominator when reported. */
  longTermInvestments?: number | null;
}

/* D-19: SBC treatment, with the reported FCF before and after it. */
export interface DcfSbcTreatment {
  beforeSbc: number | null;
  afterSbc: number | null;
  sbc: number | null;
  asOf: string | null;
  basis: string;
}

/* D-19: log-linear revenue trend over every annual year on record (growth.ts `logLinearGrowth`). Structural, so the DCF does not depend on the whole GrowthResult. */
export interface DcfRevenueTrend {
  growthPct: number | null;
  rSquared: number | null;
  n: number;
  startDate: string | null;
  endDate: string | null;
}

export interface DcfAssumptionInputs {
  /** Snapshot cutoff, used to admit recent annual margin fallbacks. */
  analysisCutoff?: string | null;
  /** D-147: the stake and its income must be on the same side of the DCF. */
  equityMethodStake?: { value: number; treatment: "added-back" | "operating"; incomePlacement: "in-operating-income" | "below-operating-income" | "undetermined" | null; incomeExcludedFromEbit?: boolean; basis: string } | null;
  /**
   * D-135 (D-25): the lease-inclusive switch (`METIS_EV_INCLUDE_LEASES`, from `runStageB`'s
   * `evIncludeLeases`). Absent is false, the default: sales-to-capital and its sales-to-capital
   * history remove the proven operating-lease slice from debt exactly when the equity bridge does.
   */
  includeLeasesInEv?: boolean;
  /** 3y revenue CAGR in percent (computed upstream from statements); null when unavailable. */
  revenueCagr3yPct: number | null;
  /** 5y revenue CAGR in percent — one of the growth-anchor methods (D-18). */
  revenueCagr5yPct?: number | null;
  /**
   * D-39: the measured span of a 3y / 5y CAGR that was computed but excluded
   * because that span is not its window (growth.ts `windowCagr`). The method
   * is then listed as unavailable with this span. Absent or null means the
   * CAGR is either the window's own or was not computed at all.
   */
  revenueCagr3yExcludedSpanYears?: number | null;
  revenueCagr5yExcludedSpanYears?: number | null;
  /* D-19: the log-linear regression method of the growth anchor. Absent or null makes it an unavailable method, named as such in the basis. */
  revenueLogLinear?: DcfRevenueTrend | null;
  /* D-19: the WACC disclosure sentence (returns.ts `waccDisclosure`), printed verbatim in the assumption block so the discount rate is never an unattributed percentage. */
  waccBasis?: string | null;
  /*
   * D-19: the reported free-cash-flow metric before and after the SBC deduction (capital.ts). The
   * FCFF DCF does not consume FCF — it projects EBIT, which already expenses SBC — but the
   * assumption block must show the adjustment so the two numbers a reader sees are never silently
   * different definitions.
   */
  fcfSbc?: DcfSbcTreatment | null;
  /** Forward annual analyst estimates (FMP names); null/empty when uncovered. */
  analystEstimates: AnalystEstimateRow[] | null;
  /* D-98: Retain the analyst-estimate refusal even when the estimate rows are absent. */
  analystEstimatesRefusal?: string | null;
  waccPct: number;
  riskFreePct: number;
  /* D-30: Compare the model reporting currency with the listing currency before publishing a per-share upside. */
  reportedCurrency?: string | null;
  /** Listing/trading currency of the quote and market cap. */
  quoteCurrency?: string | null;
  /** Base income statement: four-quarter TTM, or an explicitly labeled annual fallback. */
  incomeTtm: DcfIncomeRow | null;
  /* D-98: Separate tagged operating one-offs from the recurring starting margin. */
  unusualOperatingItems?: import("../unusualItems").UnusualOperatingItems | null;
  /** D-198: completed material disposals already excluded from the shared calculation view. */
  operatingNormalizationBasis?: string;
  operatingNormalizationRefusal?: string | null;
  equityBridgePreferredRefusal?: string | null;
  /** Annual income history (any order; used for 5y median margin + trend). */
  incomeHistory: DcfIncomeRow[];
  /** Identities of recorded periods excluded from financial history. */
  incomeCadenceBarriers?: FiscalDatedRow[];
  recurringOperatingItemsBasis?: string;
  /** Unambiguous weekday year-end rule established from filed annual ends. */
  fiscalCalendar?: FiscalYearRule | null;
  /** Selected newest whole balance row; required invested-capital fields fail closed. */
  balance: DcfBalanceRow | null;
  /**
   * D-135: why `balance` is not dated at the statement date, when it is not (`dcfBridgeRow`), so
   * the basis and the info gap state only what was checked.
   */
  bridgeCause?: { cause: "statement-row" | "none-filed" | "incomplete" | "statement-row-refused" | "anchor-refused"; detail: string | null };
  /* D-104: Establish sales-to-capital from compatible filed history before using it in valuation. */
  capitalHistory?: DcfBalanceRow[] | null;
  marketCap: number | null;
  /**
   * Annual ROIC history (any order; the newest five count), the evidence
   * behind the terminal excess-return house rule. Omitted or null: the
   * terminal ROIC stays at WACC without comment.
   */
  roicHistory?: DcfRoicYear[] | null;
  /**
   * D-58: the TTM window's newest quarter and the same fiscal quarter a year
   * earlier, both in the model currency. They set the seasonally neutral
   * run-rate the year-one revenue anchor is measured against. Omitted or
   * null: the anchor is measured against the TTM, as before D-58.
   */
  quarterRevenue?: DcfQuarterRevenue | null;
  /** D-58: next-quarter management guidance in the model currency; null when none was ingested. */
  guidance?: DcfGuidance | null;
  /** D-58: issuer domicile (ISO 3166 alpha-2), for the statutory marginal tax floor. */
  domicileCountry?: string | null;
  /** D-65: revenue already reported in the fiscal year the first window starts in. */
  fiscalYearToDate?: FiscalYearToDate | null;
  /* D-136: Calendarize consensus and guidance over the issuer fiscal windows using the established seasonal shape. */
  revenueSeasonality?: RevenueSeasonality | null;
  /**
   * D-65: the date the value is compared with a price (the quote date). Cash
   * flows discounted to the statement date are rolled forward to it at the
   * WACC. Omitted or not after the statement date: no roll-forward.
   */
  valuationDate?: string | null;
}

/** D-58: the run-rate quarters (revenue in the model currency). */
export interface DcfQuarterRevenue {
  latest: { date: string; revenue: number | null; days?: number | null };
  yearAgo: { date: string; revenue: number | null; days?: number | null } | null;
  /* D-136: Compare guidance with the same fiscal quarter a year earlier. */
  guidedYearAgo?: { date: string; revenue: number | null; days?: number | null } | null;
  /** Newest first, ending at guidedYearAgo; eight quarters establish one yearly factor. */
  guidedYearAgoWindow?: Array<{ date: string; revenue: number; days?: number | null }>;
}

/** D-58: management's outlook for the next fiscal quarter (an 8-K earnings release). */
export interface DcfGuidance {
  /** Raw issuing-release qualifiers; ex-item effects are disclosure only. */
  qualifiers?: readonly string[];
  /** Guided revenue for the next fiscal quarter (midpoint), model currency. */
  revenue: number;
  /** Guided quarter's period end (ISO date). */
  periodEnd: string;
  periodStart?: string;
  periodEndBasis?: "calendar-quarter" | "13-week-quarter" | "fiscal-year-end-rule" | null;
  /** Date the guidance was published (ISO date). */
  asOf: string;
  /** Provenance tag of the release. */
  source: string;
  /** Guided operating (EBIT) margin, percent, when the outlook implies one. */
  operatingMarginPct?: number | null;
  /** D-60: low end of the guided revenue range, when the outlook gives one. */
  revenueLow?: number | null;
  /** Optional quarterly range and identity for an admitted annual comparison. */
  revenueHigh?: number | null;
  currency?: string;
  fiscalYear?: number;
  /** Comparison evidence only; this fiscal-year range never replaces NTM. */
  annualRevenueComparison?: { periodLabel: string; fiscalYear: number; low: number; high: number; currency: string; source: string; asOf: string };
  /** D-60: guided GAAP effective tax rate (percent) and the period it covers, when the same release gives one. */
  taxRatePct?: number | null;
  taxRatePeriod?: string | null;
  /** D-60: low end of the guided GAAP gross margin, percent. */
  grossMarginLowPct?: number | null;
}

/** D-58: the seasonally neutral annualized revenue run-rate at the latest quarter. */
export interface RevenueRunRate {
  value: number;
  latestQuarterEnd: string;
  /** Latest quarter on a 13-week basis × 4. */
  latestQuarterAnnualized: number;
  latestQuarterWeeks: number | null;
  lengthNote: string | null;
  /** TTM carried 4.5 months forward at the latest quarter's year-over-year growth. */
  seasonallyNeutral: number;
  /** Latest quarter's year-over-year revenue growth, percent. */
  yoyPct: number;
}

/** D-58: what set the year-one (and year-two) revenue level. */
export interface RevenueAnchor {
  source: "guidance" | "consensus" | "run-rate" | "ttm";
  yearOneRevenue: number;
  /** Year-one growth over the start revenue, percent (growthPath[0]). */
  yearOneGrowthPct: number;
  /** Year-two growth from consensus, percent, when consensus anchored year two. */
  yearTwoGrowthPct: number | null;
  /**
   * D-65: the growth of every anchored year in order (year one first): year
   * one from the anchor source, each later entry from consensus. The fade
   * starts after the last entry. Absent on assumptions built before D-65.
   */
  anchoredGrowthPct?: number[];
  /** D-65: the 1-based years whose growth came from consensus. */
  consensusYears?: number[];
  /** D-65: every explicit window against calendarized consensus, anchored or not. */
  consensusPath?: ConsensusPathRow[];
  runRate: RevenueRunRate | null;
  /** The unclamped year-one revenue when the house clamp moved it; null otherwise. */
  clampedFrom: number | null;
  basis: string;
  /**
   * D-60 evidence beside the level actually used, so the reverse DCF and the
   * report can set the price against it. Absent on assumptions built before D-60.
   */
  evidence?: {
    /** Guided quarter on a 13-week basis, out of its season, × 4; fallback TTM × (1 + g)^(7.5/12). */
    guidedRunRate: number | null;
    guidedFloor?: number | null;
    guidedSeasonalFactor?: number | null;
    /** Guided quarter over the latest reported quarter, annualized, percent. */
    guidedPacePct: number | null;
    /* D-136: Retain the guided quarter growth over its comparable prior-year window. */
    guidedYoyPct?: number | null;
    guidedYoyIssuerEffectPp?: number | null;
    /** Calendarized consensus for the year-one and year-two windows. */
    consensusYearOne: number | null;
    consensusYearTwo: number | null;
    /** Whether the near-term growth rate (median of methods, clamped) set any year-one level. */
    nearTermRateUsed: boolean;
    /** The guided quarter itself, for observable checkpoints. */
    guidedQuarter?: { periodEnd: string; revenueLow: number; revenueMid: number; grossMarginLowPct: number | null; source: string; asOf: string } | null;
  };
}

export interface DcfRoicYear {
  operatingLoss?: boolean;
  date: string;
  roicPct: number | null;
  /*
   * D-19: that fiscal year's OWN WACC, recomputed from the risk-free observation at its year end
   * (returns.ts `waccByFiscalYear`). Absent or null means the current WACC is applied to that year
   * and the note says so.
   */
  waccPct?: number | null;
  /** Date of the risk-free observation behind `waccPct`. */
  waccAsOf?: string | null;
  /* D-102: Use the evidenced starting return and converge payout to the terminal return and growth assumptions. */
  combinationEvidence?: string | null;
}

export interface TerminalRoic {
  roicTermPct: number;
  /** Excess return carried in perpetuity, percentage points above WACC (0 = default). */
  excessPp: number;
  basis: string;
  /** Why the default held when history was supplied; null when none is owed. */
  note: string | null;
  /*
   * D-19: how each fiscal year's ROIC was compared to a cost of capital. "per-year" when at least
   * one year carried its own recomputed WACC, "current" when the single current WACC was applied to
   * every year, "none" when no history was supplied.
   */
  waccBasis: "per-year" | "current" | "none";
  /** The comparison sentence, so the assumption block can state it verbatim. */
  waccBasisNote: string | null;
}

const TERMINAL_ROIC_DEFAULT_BASIS =
  "terminal ROIC = WACC (zero excess returns in perpetuity, HOUSE CONVENTION default — see docs/METHODOLOGY.md, \"Terminal value house convention\")";

/*
 * D-19: Apply the terminal excess-return HOUSE CONVENTION (see TERMINAL_EXCESS_RETURN_CAP_PP). It
 * is not a standard: it is this app's own convention, and it is labelled as such wherever it is
 * printed. each fiscal year is compared to its OWN WACC when the caller supplied one (recomputed
 * from that year end's risk-free observation); years without one fall back to the current WACC and
 * the note says which happened.
 */
export function terminalRoic(
  waccPct: number,
  history: DcfRoicYear[] | null,
  /**
   * The return and hurdle names printed in the basis and notes. The excess-return
   * equity model applies this same convention to ROTE (or common ROE) against
   * the cost of equity, so its disclosures must not say ROIC and WACC.
   */
  labels: { ret: string; rate: string } = { ret: "ROIC", rate: "WACC" },
  /* D-102: Use the evidenced starting return and converge payout to the terminal return and growth assumptions. */
  options: { rule?: "every-year" | "four-of-five" } = {},
): TerminalRoic {
  const { ret: RET, rate: RATE } = labels;
  const fourOfFive = options.rule === "four-of-five";
  const hold = (
    note: string | null,
    waccBasis: TerminalRoic["waccBasis"],
    waccBasisNote: string | null,
  ): TerminalRoic => ({
    roicTermPct: waccPct,
    excessPp: 0,
    basis:
      RET === "ROIC"
        ? TERMINAL_ROIC_DEFAULT_BASIS
        : `terminal ${RET} = ${RATE} (zero excess returns in perpetuity, HOUSE CONVENTION default — see docs/METHODOLOGY.md)`,
    note,
    waccBasis,
    waccBasisNote,
  });
  if (history === null) return hold(null, "none", null);
  // The four-of-five rule reads the latest five fiscal years as filed: a year whose return is
  // unestablished stays in that window as non-evidence, so an older year cannot fill it (D-102).
  const byDate = [...history].sort((a, b) => b.date.localeCompare(a.date));
  const window = fourOfFive ? byDate.slice(0, 5) : byDate;
  const years = window
    .filter((y): y is DcfRoicYear & { roicPct: number } => isNum(y.roicPct))
    .slice(0, 5);
  const n = years.length;
  const lastN = fourOfFive ? window.length : n;
  const unestablishedText = fourOfFive && window.length > n
    ? `; ${window.filter((y) => !isNum(y.roicPct)).map((y) => y.date).join(", ")} not established, so not evidence`
    : "";
  // Each year against its own cost of capital when one was recomputed for it.
  const waccForYear = (y: DcfRoicYear): number => (isNum(y.waccPct) ? y.waccPct : waccPct);
  const perYear = years.filter((y) => isNum(y.waccPct));
  const currentOnly = years.filter((y) => !isNum(y.waccPct));
  /**
   * D-19: If supplied history contains no computable ROIC year, there is no ROIC-versus-WACC
   * comparison. Report "none" without blaming a missing risk-free observation; the
   * minimum-history branch names the missing ROIC evidence.
   */
  const waccBasis: TerminalRoic["waccBasis"] =
    n === 0 ? "none" : perYear.length > 0 ? "per-year" : "current";
  const waccBasisNote =
    n === 0
      ? null
      : perYear.length === 0
      ? `${RET}-vs-${RATE} history compares every fiscal year to the CURRENT ${RATE} ${fmtNum(waccPct)}% — no per-year risk-free observation was available to recompute a year-specific ${RATE}`
      : `${RET}-vs-${RATE} history uses each fiscal year's own ${RATE}, recomputed from that year end's risk-free observation (${perYear
          .map((y) => `${y.date}: ${fmtNum(waccForYear(y))}%${y.waccAsOf ? ` (rf as of ${y.waccAsOf})` : ""}`)
          .join(", ")})` +
        (currentOnly.length > 0
          ? `; the current ${RATE} ${fmtNum(waccPct)}% was applied to ${currentOnly
              .map((y) => y.date)
              .join(", ")}, which had no usable risk-free observation`
          : "");
  if (n < TERMINAL_EXCESS_RETURN_MIN_YEARS) {
    return hold(
      `terminal ${RET} held at ${RATE}: ${n} fiscal year${n === 1 ? "" : "s"} of ${RET} on record, ${TERMINAL_EXCESS_RETURN_MIN_YEARS} needed to evidence durable excess returns (house convention)`,
      waccBasis,
      waccBasisNote,
    );
  }
  const below = years.filter((y) => y.roicPct <= waccForYear(y));
  // At most one combination year is set aside (the latest), so set-aside years
  // never stand in for the evidence; any other counts as a miss.
  const combinationBelow = fourOfFive
    ? below.filter((y) => typeof y.combinationEvidence === "string" && y.combinationEvidence !== "").sort((a, b) => b.date.localeCompare(a.date))
    : [];
  const setAside = combinationBelow.slice(0, 1);
  const misses = below.filter((y) => !setAside.includes(y));
  const above = n - below.length;
  const missText = (list: typeof years): string =>
    list.map((y) => `${y.date}: ${RET} ${fmtNum(y.roicPct)}%${y.operatingLoss ? " (operating loss)" : ""} vs ${RATE} ${fmtNum(waccForYear(y))}%`).join("; ");
  const setAsideText = setAside.length === 0
    ? ""
    : `; set aside as business-combination year${setAside.length === 1 ? "" : "s"}, not counted as a miss: ${setAside.map((y) => `${y.date} (${RET} ${fmtNum(y.roicPct)}%${y.operatingLoss ? " (operating loss)" : ""} vs ${RATE} ${fmtNum(waccForYear(y))}%, ${y.combinationEvidence})`).join("; ")}` +
      (combinationBelow.length > 1 ? `; only one business-combination year is set aside, so ${combinationBelow.slice(1).map((y) => y.date).join(", ")} count${combinationBelow.length === 2 ? "s" : ""} as ${combinationBelow.length === 2 ? "a miss" : "misses"}` : "");
  const combinationAbove = fourOfFive
    ? years.filter((y) => !below.includes(y) && typeof y.combinationEvidence === "string" && y.combinationEvidence !== "")
    : [];
  const annotatedText = combinationAbove.length === 0
    ? ""
    : `; business-combination year${combinationAbove.length === 1 ? "" : "s"} (above the hurdle, annotated): ${combinationAbove.map((y) => `${y.date} (${y.combinationEvidence})`).join("; ")}`;
  if (fourOfFive && above + setAside.length < TERMINAL_EXCESS_RETURN_MIN_YEARS) {
    return hold(
      `terminal ${RET} held at ${RATE}: ${RET} beat that year's ${RATE} in only ${above} of the last ${lastN} fiscal years (${missText(misses)}${setAsideText}${unestablishedText}) — at least ${TERMINAL_EXCESS_RETURN_MIN_YEARS} of the last 5 are needed to evidence durable excess returns (house convention)`,
      waccBasis,
      waccBasisNote,
    );
  }
  if (!fourOfFive && below.length > 0) {
    return hold(
      `terminal ${RET} held at ${RATE}: ${RET} was at or below that year's ${RATE} in ${below.length} of the last ${n} fiscal years (${below
        .map((y) => `${y.date}: ${RET} ${fmtNum(y.roicPct)}%${y.operatingLoss ? " (operating loss)" : ""} vs ${RATE} ${fmtNum(waccForYear(y))}%`)
        .join("; ")}) — excess returns not evidenced as durable (house convention)`,
      waccBasis,
      waccBasisNote,
    );
  }
  // A set-aside combination year is not evidence either way, so it stays out of the median too.
  const counted = years.filter((y) => !setAside.includes(y));
  const spreads = counted.map((y) => y.roicPct - waccForYear(y));
  const median = medianOf(spreads) as number;
  const excess = Math.min(TERMINAL_EXCESS_RETURN_CAP_PP, TERMINAL_EXCESS_RETURN_CARRY * median);
  if (excess < TERMINAL_EXCESS_RETURN_MIN_PP) {
    return hold(
      fourOfFive
        ? `terminal ${RET} held at ${RATE}: ${RET} exceeded ${RATE} in ${above} of the last ${lastN} fiscal years${setAsideText}${unestablishedText}${annotatedText} but the median spread ${fmtNum(median)}pp is too thin to carry (house convention floor ${TERMINAL_EXCESS_RETURN_MIN_PP}pp)`
        : `terminal ${RET} held at ${RATE}: ${RET} exceeded ${RATE} in all ${n} fiscal years but the median spread ${fmtNum(median)}pp is too thin to carry (house convention floor ${TERMINAL_EXCESS_RETURN_MIN_PP}pp)`,
      waccBasis,
      waccBasisNote,
    );
  }
  const oldest = years[n - 1].date;
  const newest = years[0].date;
  const observedYearNumbers = new Set(years.map(y => Number(y.date.slice(0, 4))));
  const missingYears = Array.from({ length: Math.max(0, Number(newest.slice(0, 4)) - Number(oldest.slice(0, 4)) + 1) }, (_, i) => Number(oldest.slice(0, 4)) + i).filter(y => !observedYearNumbers.has(y));
  return {
    roicTermPct: waccPct + excess,
    excessPp: excess,
    basis:
      `terminal ${RET} = ${RATE} ${fmtNum(waccPct)}% + ${fmtNum(excess)}pp evidenced excess return: ` +
      (fourOfFive
        ? `${RET} exceeded ${RATE} in ${above} of the last ${lastN} fiscal years` +
          (above < TERMINAL_EXCESS_RETURN_MIN_YEARS && setAside.length > 0
            ? `, and the set-aside business-combination year counts toward the at least ${TERMINAL_EXCESS_RETURN_MIN_YEARS} of the last 5 required `
            : `, at least ${TERMINAL_EXCESS_RETURN_MIN_YEARS} of the last 5 being required `) +
          `(${oldest} to ${newest}${misses.length > 0 ? `; miss: ${missText(misses)}` : ""}${setAsideText}${unestablishedText}${annotatedText}; median spread ${fmtNum(median)}pp over the years counted); `
        : `${RET} exceeded ${RATE} in ${n} observed fiscal years (${oldest} to ${newest}${missingYears.length ? `; missing fiscal-year observations: ${missingYears.join(", ")}; observations are not consecutive` : ""}, median spread ${fmtNum(median)}pp); `) +
      `half the spread is carried in perpetuity, capped at ${TERMINAL_EXCESS_RETURN_CAP_PP}pp ` +
      "(HOUSE CONVENTION after McKinsey's RONIC guidance and Damodaran's modest-excess-return cap — not a standard; see docs/METHODOLOGY.md)",
    note: null,
    waccBasis,
    waccBasisNote,
  };
}

/* D-19: one method of the growth anchor and what it produced. */
export interface GrowthAnchorMethod {
  name: string;
  valuePct: number | null;
  /** Value with its fit statistics / window, or the reason it was unavailable. */
  detail: string;
}

/* D-19: median-of-methods near-term growth anchor. */
export interface GrowthAnchor {
  /*
   * D-18: The year-one growth faded by the DCF is the median of available methods after the
   * near-term clamp. The assumption table must describe that clamped value rather than a different
   * pre-clamp median.
   */
  pointPct: number;
  /**
   * The pre-clamp median, present ONLY when the clamp actually moved the value.
   * Undefined means the anchor is the median untouched.
   */
  preClampMedianPct?: number;
  /** Min..max across the available methods; null when only one was available. */
  rangePct: [number, number] | null;
  methods: GrowthAnchorMethod[];
  /** Names of the methods that could not be computed. */
  unavailable: string[];
  basis: string;
}

export interface DcfAssumptions {
  /** Exact basis of the revenue anchor; absent on legacy/manual assumptions. */
  forecastPeriod?: { basis: "rolling-12-month" | "fiscal-year"; anchorEndDate: string; anchorStartDate: string | null };
  startRevenue: Assumption<number>;
  /** Explicit horizon (default 10). */
  years: number;
  /* D-19: the discount rate with every input named. */
  wacc: Assumption<number>;
  /* D-19: SBC treatment, with the reported FCF before and after it. */
  sbc: Assumption<DcfSbcTreatment>;
  /* D-19: the growth anchor's methods, point estimate and range. */
  growthAnchor: GrowthAnchor;
  /** D-58: what set the year-one/two revenue level; absent on assumptions built before D-58. */
  revenueAnchor?: RevenueAnchor;
  /** Revenue growth per explicit year, percent, length === years. */
  growthPath: Assumption<number[]>;
  /** EBIT margin per explicit year, percent, length === years. */
  ebitMarginPath: Assumption<number[]>;
  /** Company-specific effective tax rate per explicit year, percent. */
  taxRatePath: Assumption<number[]>;
  salesToCapital: Assumption<number>;
  terminal: {
    gTermPct: Assumption<number>;
    /** Terminal ROIC, percent — default = WACC (zero excess returns). */
    roicTermPct: Assumption<number>;
    /** Terminal reinvestment rate as a FRACTION of NOPAT: g / ROIC. */
    reinvestmentRate: Assumption<number>;
  };
  midYear: Assumption<boolean>;
  /**
   * D-60: the highest operating margin a bull/bear scenario may reach. Null
   * when gross profit is not on record; absent on assumptions built before D-60.
   */
  scenarioMarginCeiling?: ScenarioMarginCeiling | null;
  /* D-98: Use the evidenced margin regime and disclose the improving-margin fade assumption. */
  improvingMarginFade?: { currentPct: number; targetPct: number };
  /**
   * D-65: the date the value is stated at. The explicit years are windows
   * from the statement date, so their flows are discounted from it; every
   * discount exponent then moves back by `elapsedYears`, which rolls the whole
   * value forward to the quote date at the WACC. Absent or 0: the value is at
   * the statement date (assumptions built before D-65, or no later quote).
   */
  valuationDate?: { value: string; elapsedYears: number; basis: string };
  /**
   * D-65: long-term investments the sales-to-capital denominator removed as non-operating (D-60).
   * The equity bridge adds back exactly this amount, so an asset left out of operating capital is
   * never left out of value too. D-135: recorded whenever the balance carries a holding; `basis` is
   * set only when the denominator does not remove the holding, and it replaces, in the bridge
   * line's provenance, the clause saying it does. Either the holding meets or exceeds a positive
   * invested capital, so nothing is left to remove from operating capital and sales-to-capital
   * takes the house cap (the bridge still adds the holding back), or the lease-emptied path
   * (capital already non-positive) takes the issuer's own history for the ratio.
   */
  nonOperatingInvestments?: { value: number; balanceDate: string; basis?: string };
  /* D-98, D-58: Use the evidenced margin regime and disclose the improving-margin fade assumption. */
  investmentTax?: { ratePct: number; basis: string };
  asOf: { statements: string | null; estimates: string | null };
  notes: string[];
}

/**
 * D-60: operating margin = gross margin − operating-expense ratio, so no
 * scenario can earn more than today's gross margin less the leanest
 * operating-expense ratio the issuer has actually run.
 */
export interface ScenarioMarginCeiling {
  pct: number;
  grossMarginPct: number;
  /** The period the gross margin is measured over (TTM, else the latest fiscal year). */
  grossMarginPeriod: string;
  minOpexRatioPct: number;
  /** The period with the leanest operating-expense ratio among the TTM and the last five fiscal years. */
  minOpexRatioPeriod: string;
  basis: string;
}

export interface BuildDcfAssumptionsResult {
  assumptions: DcfAssumptions | null;
  notes: string[];
  gaps: ManifestEntry[];
}

/* D-60: Annualize the analyst growth leg over the actual distance between the TTM and fiscal-year endpoints. */
const DAYS_PER_YEAR = 365.25;
const LEG_DAY_MS = 24 * 3600 * 1000;
/** Below this span the partial-period ratio is too noisy to annualize — skip the leg. */
const ANALYST_LEG_MIN_DAYS = 90;
/** Spans in this band are an aligned fiscal year (52/53-week calendars) — the ratio IS the annual rate. */
const ANALYST_LEG_ALIGNED_DAYS: readonly [number, number] = [351, 380];

/** Average analyst-implied revenue growth over the next ~2 fiscal years, percent. */
function analystTwoYearGrowthPct(
  rows: AnalystEstimateRow[] | null,
  ttmRevenue: number | null,
  ttmDate: string | null,
  periodBasis: string,
): { value: number | null; asOf: string | null; notes: string[]; legs: string[] } {
  const notes: string[] = [];
  const legs: string[] = [];
  if (!rows || rows.length === 0) return { value: null, asOf: null, notes, legs };
  const future = rows
    .filter((r) => posOrNull(r.revenueAvg) !== null && (!ttmDate || r.date > ttmDate))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 2);
  if (future.length === 0) return { value: null, asOf: null, notes, legs };
  const growths: number[] = [];
  const base = posOrNull(ttmRevenue);
  if (base !== null) {
    const ratio = (future[0].revenueAvg as number) / base;
    const t0 = ttmDate !== null ? Date.parse(ttmDate) : Number.NaN;
    const t1 = Date.parse(future[0].date);
    const days =
      Number.isFinite(t0) && Number.isFinite(t1) ? Math.round((t1 - t0) / LEG_DAY_MS) : null;
    if (
      days === null ||
      (days >= ANALYST_LEG_ALIGNED_DAYS[0] && days <= ANALYST_LEG_ALIGNED_DAYS[1])
    ) {
      // Aligned full fiscal year (or no day-count derivable): raw ratio is the annual rate.
      growths.push((ratio - 1) * 100);
      legs.push(`FY ending ${future[0].date} over ${periodBasis} ${fmtNum((ratio - 1) * 100)}%`);
    } else if (days < ANALYST_LEG_MIN_DAYS) {
      notes.push(
        `analyst year-1 growth leg skipped: ${periodBasis} end ${ttmDate} to FY1 end ${future[0].date} spans only ${days} days (< ${ANALYST_LEG_MIN_DAYS}) — too noisy to annualize; FY1→FY2 leg used alone`,
      );
    } else {
      const annualized = (Math.pow(ratio, DAYS_PER_YEAR / days) - 1) * 100;
      notes.push(
        `analyst year-1 growth leg annualized by day-count: ${fmtNum((ratio - 1) * 100)}% over ${days} days (${periodBasis} end ${ttmDate} → FY1 end ${future[0].date}) → ${fmtNum(annualized)}%/yr`,
      );
      growths.push(annualized);
      legs.push(`FY ending ${future[0].date} over ${periodBasis} ${fmtNum((ratio - 1) * 100)}% in ${days} days, annualized ${fmtNum(annualized)}%`);
    }
  }
  if (future.length === 2) {
    const g = ((future[1].revenueAvg as number) / (future[0].revenueAvg as number) - 1) * 100;
    growths.push(g);
    legs.push(`FY ending ${future[1].date} over FY ending ${future[0].date} ${fmtNum(g)}%`);
  }
  if (growths.length === 0) return { value: null, asOf: null, notes, legs };
  return {
    value: growths.reduce((a, b) => a + b, 0) / growths.length,
    asOf: future[future.length - 1].date,
    notes,
    legs,
  };
}

const YEAR_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const yearWord = (k: number): string => YEAR_WORDS[k] ?? String(k);

/** D-65: "years 1–4", "year one", "no year": the years consensus set, for every text that names them. */
export function consensusYearsText(years: readonly number[]): string {
  if (years.length === 0) return "no year";
  if (years.length === 1) return `year ${yearWord(years[0])}`;
  const contiguous = years.every((y, i) => i === 0 || y === years[i - 1] + 1);
  return contiguous ? `years ${years[0]}–${years[years.length - 1]}` : `years ${years.join(", ")}`;
}

/** D-65: the reported fiscal-year-to-date revenue, only when it ends on the TTM end and spans whole quarters. */
function validFiscalYearToDate(ytd: FiscalYearToDate | null | undefined, ttmEnd: string | null, basis: DcfIncomeRow["basis"]): FiscalYearToDate | null {
  if (!ytd || ttmEnd === null || basis === "annual" || ytd.through !== ttmEnd || posOrNull(ytd.revenue) === null) return null;
  const days = daysBetween(ytd.priorFiscalYearEnd, ytd.through);
  if (days === null || !Number.isInteger(ytd.quarters) || ytd.quarters < 1 || ytd.quarters > 3) return null;
  // 52/53-week quarters run 13 or 14 weeks.
  return days >= ytd.quarters * 84 && days <= ytd.quarters * 98 ? ytd : null;
}

/**
 * D-65: why the fiscal-year estimates behind a window cannot anchor it, or
 * null when they can. A provider row without an analyst count or range is
 * accepted for years one and two (the D-60 rule, under which those years were
 * already consensus) and never beyond, where coverage thins.
 */
function consensusGate(fiscalYears: ConsensusPathRow["fiscalYears"], year: number): string | null {
  for (const f of fiscalYears) {
    if (f.analysts === null) {
      if (year > 2) return `the provider gives no analyst count for the fiscal year ending ${f.date}, required beyond year two`;
      continue;
    }
    if (f.analysts < MIN_CONSENSUS_ANALYSTS) {
      return `the fiscal year ending ${f.date} has ${f.analysts} revenue estimate${f.analysts === 1 ? "" : "s"}, fewer than the ${MIN_CONSENSUS_ANALYSTS} a consensus needs`;
    }
    if (f.dispersionPct === null) {
      if (year > 2) return `the provider gives no low-high range for the fiscal year ending ${f.date}, required beyond year two`;
      continue;
    }
    if (f.dispersionPct > MAX_CONSENSUS_CV_PCT) {
      return `the fiscal year ending ${f.date} has an implied analyst dispersion of ${fmtNum(f.dispersionPct)}%, above the ${MAX_CONSENSUS_CV_PCT}% limit`;
    }
  }
  return null;
}

/** D-58: guidance usable as the next-quarter level, or null. */
function nextQuarterGuidance(guidance: DcfGuidance | null | undefined, ttmEnd: string | null): DcfGuidance | null {
  if (!guidance || ttmEnd === null || posOrNull(guidance.revenue) === null) return null;
  const days = daysBetween(ttmEnd, guidance.periodEnd);
  const published = daysBetween(ttmEnd, guidance.asOf);
  if (days === null || days < NEXT_QUARTER_DAYS[0] || days > NEXT_QUARTER_DAYS[1]) return null;
  return published !== null && published >= 0 ? guidance : null;
}

/** The quarter share of its trailing year relative to the constant-growth share. */
function guidedSeasonalFactor(window: DcfQuarterRevenue["guidedYearAgoWindow"], yearAgo: string | null): { value: number; years: number } | null {
  if (!window || yearAgo === null || window[0]?.date !== yearAgo) return null;
  const factors: number[] = [];
  for (let offset = 0; offset <= 8 && offset + 8 <= window.length; offset += 4) {
    const eight = window.slice(offset, offset + 8);
    if (eight.some(row => posOrNull(row.revenue) === null) ||
        Array.from({ length: 5 }, (_, i) => quarterWindowViolation(eight.slice(i, i + 4))).some(reason => reason !== null)) break;
    const revenue = eight.map(row => row.revenue * thirteenWeekFactor(row.days ?? null));
    const ttm = revenue.slice(0, 4).reduce((a, b) => a + b, 0);
    const previous = revenue.slice(4).reduce((a, b) => a + b, 0);
    const rho = Math.pow(ttm / previous, .25);
    const factor = (revenue[0] / ttm) / (rho ** 3 / (1 + rho + rho ** 2 + rho ** 3));
    if (!Number.isFinite(factor) || factor <= 0) break;
    factors.push(factor);
  }
  return factors.length === 0 ? null : { value: factors.reduce((a, b) => a + b, 0) / factors.length, years: factors.length };
}

/**
 * D-136: consensus consistent with the seasonal twelve-month floor, then the
 * guided quarter taken out of its growth-adjusted season and carried at its
 * year-over-year pace, then the reported run-rate. Below eight quarters ending
 * at the guided year-ago quarter, guidance carries TTM for one year at that pace.
 * No guidance level without the same fiscal quarter a year earlier. Sequential
 * pace is evidence only and never widens the broken-input guard.
 */
function buildRevenueAnchor(args: {
  inputs: DcfAssumptionInputs;
  startRev: number;
  periodBasis: string;
  gMid: number;
  notes: string[];
}): RevenueAnchor {
  const { inputs, startRev, periodBasis, gMid, notes } = args;
  const ttm = inputs.incomeTtm;
  const ttmEnd = ttm?.date ?? null;
  const windowBasis = ttm?.basis === "annual" ? "fiscal-year" : "rolling-12-month";
  const runRate = ttm?.basis !== "annual" && ttmEnd !== null ? revenueRunRate(startRev, ttmEnd, inputs.quarterRevenue) : null;
  const level = runRate?.value ?? startRev;
  const levelText = runRate === null
    ? `${periodBasis} revenue ${fmtMoney(startRev)}`
    : `the seasonally neutral run-rate ${fmtMoney(runRate.value)} (latest quarter ending ${runRate.latestQuarterEnd} × 4 = ${fmtMoney(runRate.latestQuarterAnnualized)}; ` +
      `${periodBasis} ${fmtMoney(startRev)} carried 4.5 months at the quarter's ${fmtNum(runRate.yoyPct)}% year-over-year growth = ${fmtMoney(runRate.seasonallyNeutral)}; bounded by the two)` +
      (runRate.lengthNote === null ? "" : `; ${runRate.lengthNote}`);
  // D-65: every explicit window against calendarized consensus. The first
  // window takes the current fiscal year's consensus less what is already
  // reported; each window then passes or fails the breadth and agreement gates.
  const reported = validFiscalYearToDate(inputs.fiscalYearToDate, ttmEnd, ttm?.basis);
  const path: (ConsensusPathRow & { gate: string | null })[] = [];
  // P11, D-223: notCovered[k - 1] is true when year k's gate is "not covered by the
  // fiscal-year estimates". Local only, never on the path rows or in the output.
  const notCovered: boolean[] = [];
  /* D-136: Calendarize consensus and guidance over the issuer fiscal windows using the established seasonal shape. */
  let spread: "seasonal" | "even" | null = null;
  for (let k = 1; ttmEnd !== null && k <= DCF_HORIZON_YEARS; k++) {
    const w = forecastYearPeriod(ttmEnd, k, windowBasis);
    if (w === null) break;
    const cal = calendarizeConsensusWindow(inputs.analystEstimates, w, reported, inputs.revenueSeasonality, inputs.fiscalCalendar);
    if (cal.value !== null && cal.partialSpread !== null) spread = spread === "even" ? "even" : cal.partialSpread;
    notCovered.push(cal.value === null && !cal.staleAgainstReported);
    const gate = cal.value === null
      ? cal.staleAgainstReported
        ? `the fiscal-year consensus is at or below the ${fmtMoney((reported as FiscalYearToDate).revenue)} already reported through ${(reported as FiscalYearToDate).through}`
        : `${w.label} is not covered by the fiscal-year estimates`
      : consensusGate(cal.fiscalYears, k);
    path.push({ year: k, label: w.label, startDate: w.startDate, endDate: w.endDate, consensus: cal.value, anchored: false, status: "", fiscalYears: cal.fiscalYears, gate });
  }
  const usable = (k: number): boolean => path[k - 1] !== undefined && path[k - 1].consensus !== null && path[k - 1].gate === null;
  const window1 = path[0] ?? null;
  const ntm1 = usable(1) ? path[0].consensus : null;
  const ntm2 = usable(2) ? path[1].consensus : null;
  const reportedText = reported === null || !window1?.fiscalYears.some((f) => f.reportedToDate !== undefined) ? "" :
    `; the fiscal year ending ${window1.fiscalYears.find((f) => f.reportedToDate !== undefined)?.date} contributes its consensus less the ${fmtMoney(reported.revenue)} ` +
    `already reported through ${reported.through} (${reported.quarters} quarter${reported.quarters === 1 ? "" : "s"}), spread over its unreported days`;
  const shares = seasonalQuarterShares(inputs.revenueSeasonality);
  const annualWeekdays = inputs.incomeHistory.map(row => new Date(row.date).getUTCDay());
  const approximate = inputs.fiscalCalendar === null && annualWeekdays.length >= 2 &&
    annualWeekdays.every(day => day === annualWeekdays[0]);
  const spreadText = (spread === "seasonal" && shares !== null
    ? `fiscal-year estimates spread by the quarterly shape of the fiscal year ending ${(inputs.revenueSeasonality as RevenueSeasonality).fiscalYearEnd} ` +
      `(${shares.slice(0, 3).map((x) => `${fmtNum(x * 100)}%`).join(", ")} and ${fmtNum(shares[3] * 100)}% of its reported revenue, each quarter's share over its three months)`
    : spread === "even"
      ? `fiscal-year estimates weighted by day overlap, each fiscal year spread evenly over its days because ${shares === null
        ? "the last complete fiscal year has no four reported quarterly revenues to shape it"
        : "its year end is not an anniversary of the fiscal year the quarterly shape was measured in"}`
      : "fiscal-year estimates weighted by day overlap") +
      (approximate ? "; fiscal-year boundaries are the provider's dates, approximate by up to a week" : "");
  const statedGuide = nextQuarterGuidance(inputs.guidance, ttmEnd);
  const fG = thirteenWeekFactor(statedGuide === null ? null : periodDays(statedGuide.periodStart, statedGuide.periodEnd));
  const annual = statedGuide?.annualRevenueComparison;
  const quarterLow = posOrNull(statedGuide?.revenueLow);
  const quarterHigh = posOrNull(statedGuide?.revenueHigh);
  const comparable = statedGuide !== null && annual !== undefined && annual.fiscalYear === statedGuide.fiscalYear &&
    annual.currency === statedGuide.currency && annual.source === statedGuide.source && annual.asOf === statedGuide.asOf &&
    posOrNull(annual.low) !== null && posOrNull(annual.high) !== null && annual.low <= annual.high &&
    quarterLow !== null && quarterHigh !== null && quarterLow <= statedGuide.revenue && statedGuide.revenue <= quarterHigh;
  const refusedExtrapolation = comparable && (4 * quarterLow * fG > annual.high || 4 * quarterHigh * fG < annual.low);
  const comparabilityText = !refusedExtrapolation ? "" :
    ` Quarterly-guidance annualization withheld by the independent house comparability guard: the quarter range${fG === 1 ? "" : " on a 13-week basis"} x 4 ` +
    `${fmtMoney(4 * quarterLow * fG)}-${fmtMoney(4 * quarterHigh * fG)} lies entirely outside ${annual.periodLabel} revenue ` +
    `${fmtMoney(annual.low)}-${fmtMoney(annual.high)} from the same release (${annual.source}, ${annual.asOf}). ` +
    "This is a model comparability policy, not an accounting fact: the quarter is not an unconditional annual revenue floor. " +
    "Fiscal-year and next-twelve-month periods differ; fiscal-year guidance is not substituted for NTM. The quarterly floor, sequential pace and quarterly level extrapolation are withheld; the existing consensus, run-rate or TTM fallback is used.";
  const guide = refusedExtrapolation ? null : statedGuide;
  const carry = (from: number, years: number, ratePct: number): number => from * Math.pow(1 + ratePct / 100, years);

  // D-60: the guided sequential pace, annualized.
  const latestQuarter = inputs.quarterRevenue?.latest.date === ttmEnd ? posOrNull(inputs.quarterRevenue?.latest.revenue) : null;
  const fL = thirteenWeekFactor(inputs.quarterRevenue?.latest.days ?? null);
  const guidedPacePct = guide !== null && latestQuarter !== null ? (Math.pow(guide.revenue * fG / (latestQuarter * fL), 4) - 1) * 100 : null;
  /* D-136: Use a compatible year-ago quarter to establish guided year-over-year growth. */
  const yearAgoRow = inputs.quarterRevenue?.guidedYearAgo ?? null;
  const yearAgoRevenue = posOrNull(yearAgoRow?.revenue);
  const yearAgoDays = guide === null || yearAgoRow === null ? null : daysBetween(yearAgoRow.date, guide.periodEnd);
  const baseGap = yearAgoRow === null || ttmEnd === null ? null : daysBetween(yearAgoRow.date, ttmEnd);
  const fYA = thirteenWeekFactor(yearAgoRow?.days ?? null);
  const guidedYearAgo = guide !== null && yearAgoRow !== null && yearAgoRevenue !== null && yearAgoDays !== null &&
    baseGap !== null && baseGap >= 250 && baseGap <= 300 &&
    yearAgoDays >= YEAR_AGO_QUARTER_DAYS[0] && yearAgoDays <= YEAR_AGO_QUARTER_DAYS[1] ? { date: yearAgoRow.date, revenue: yearAgoRevenue * fYA } : null;
  const guidedYoyPct = guide !== null && guidedYearAgo !== null ? (guide.revenue * fG / guidedYearAgo.revenue - 1) * 100 : null;
  const seasonal = guidedSeasonalFactor(inputs.quarterRevenue?.guidedYearAgoWindow, guidedYearAgo?.date ?? null);
  const guidedRunRate = guide === null || guidedYoyPct === null ? null : seasonal === null
    ? startRev * Math.pow(1 + guidedYoyPct / 100, 7.5 / 12) : 4 * guide.revenue * fG / seasonal.value;
  const guidedLow = guide === null ? null : (posOrNull(guide.revenueLow) ?? guide.revenue) * fG;
  const guidedFloor = guidedLow === null || guidedYearAgo === null ? null
    : guidedLow + (startRev - guidedYearAgo.revenue) * Math.min(1, guidedLow / guidedYearAgo.revenue);
  const consensusConsistent = ntm1 !== null && (guidedFloor === null || ntm1 >= guidedFloor);

  // Broken-input guard, widened to the evidenced pace.
  const pace = [guidedYoyPct, runRate?.yoyPct ?? null].filter((v): v is number => isNum(v));
  const lo = Math.min(NEAR_TERM_GROWTH_CLAMP_PP[0], ...pace);
  const hi = Math.max(NEAR_TERM_GROWTH_CLAMP_PP[1], ...pace);
  const rangeText = lo === NEAR_TERM_GROWTH_CLAMP_PP[0] && hi === NEAR_TERM_GROWTH_CLAMP_PP[1]
    ? `[${lo}%, +${hi}%]`
    : `[${fmtNum(lo)}%, +${fmtNum(hi)}%] (the house [${NEAR_TERM_GROWTH_CLAMP_PP[0]}%, +${NEAR_TERM_GROWTH_CLAMP_PP[1]}%] widened to the evidenced pace)`;

  let source: RevenueAnchor["source"];
  let raw: number;
  let rawText: string;
  let nearTermRateUsed = false;
  const guidanceText = guide === null ? "" :
    `management guidance ${fmtMoney(guide.revenue)} for the quarter ending ${guide.periodEnd} (${guide.source}, ${guide.asOf})`;
  const assumedLengthText = (() => {
    if (guide?.periodEndBasis !== "13-week-quarter" || !inputs.fiscalCalendar) return "";
    const year = Number(guide.periodEnd.slice(0, 4));
    const end = [year - 1, year, year + 1].map(y => ({ y, end: fiscalYearEndFor(inputs.fiscalCalendar!, y) }))
      .filter(row => row.end >= guide.periodEnd).sort((a, b) => a.end.localeCompare(b.end))[0];
    return end !== undefined && daysBetween(fiscalYearEndFor(inputs.fiscalCalendar, end.y - 1), end.end) === 371
      ? `; the guided quarter's length assumed to be 13 weeks: the fiscal year ending ${end.end} has 53 weeks and the release does not say which quarter holds the extra week` : "";
  })();
  if (ntm1 !== null && window1 !== null && consensusConsistent) {
    source = "consensus";
    raw = ntm1;
    rawText = `analyst consensus calendarized to ${window1.label} (${spreadText}${reportedText})` +
      (guidedFloor === null ? "" : `, at or above the twelve-month floor the guidance implies (low end ${fmtMoney(guidedLow as number)} plus the window's other three quarters at their year-ago level${guidedLow! < guidedYearAgo!.revenue ? ", reduced at the low-end year-over-year pace" : ""} = ${fmtMoney(guidedFloor)}; ${guidanceText}), so consistent with the outlook`);
  } else if (guide !== null && guidedYoyPct !== null && guidedYearAgo !== null && guidedRunRate !== null) {
    source = "guidance";
    raw = carry(guidedRunRate, GUIDED_QUARTER_TO_YEAR_ONE_YEARS, guidedYoyPct);
    const comparison = `guided quarter over the quarter ending ${guidedYearAgo.date}, ${fmtMoney(guide.revenue * fG)} over ${fmtMoney(guidedYearAgo.revenue)}, both on a 13-week basis`;
    rawText = (seasonal === null
      ? `the trailing twelve months carried twelve months at the guided year-over-year pace ${fmtNum(guidedYoyPct)}% (${comparison}; fewer than eight quarters end at the year-ago quarter, so no seasonal factor; ${guidanceText})`
      : `the guided quarter ${guidanceText} on a 13-week basis taken out of its season (÷ s = ${seasonal.value.toFixed(4)}, its share of its own trailing year against the share constant growth gives, the mean of ${seasonal.years} yearly factors) × 4 = ${fmtMoney(guidedRunRate)}, carried 4.5 months at the guided year-over-year pace ${fmtNum(guidedYoyPct)}% (${comparison})`) +
      (ntm1 === null
        ? window1?.consensus != null && window1.gate !== null ? `; consensus ${fmtMoney(window1.consensus)} for the window is not used: ${window1.gate}` : ""
        : `; consensus ${fmtMoney(ntm1)} for the window sits below the twelve-month floor the guidance implies and is not used for year one`);
  } else {
    source = runRate === null ? "ttm" : "run-rate";
    nearTermRateUsed = true;
    const years = runRate === null ? 1 : LATEST_QUARTER_TO_YEAR_ONE_YEARS;
    raw = carry(level, years, gMid);
    rawText = runRate === null
      ? `${periodBasis} revenue grown one year at the near-term growth rate ${fmtNum(gMid)}%`
      : `the run-rate carried 7.5 months to the year-one midpoint at the near-term growth rate ${fmtNum(gMid)}%`;
  }
  if (guide !== null && guidedYearAgo === null) rawText += `; guidance ${fmtMoney(guide.revenue)} not used for year one: no same fiscal quarter a year earlier to put it on a twelve-month basis`;
  rawText += assumedLengthText;
  const floor = level * (1 + lo / 100);
  const ceiling = level * (1 + hi / 100);
  const yearOneRevenue = Math.min(ceiling, Math.max(floor, raw));
  const clampedFrom = yearOneRevenue === raw ? null : raw;
  const clampText = clampedFrom === null
    ? ""
    : `; CLAMPED from ${fmtMoney(raw)} to ${fmtMoney(yearOneRevenue)}: the house guard bounds year-one revenue to ${rangeText} of ${runRate === null ? `${periodBasis} revenue` : "the run-rate"}`;
  if (clampedFrom !== null) {
    notes.push(`year-one revenue (${source}) clamped ${fmtMoney(raw)} -> ${fmtMoney(yearOneRevenue)} (house guard ${rangeText} of ${fmtMoney(level)})`);
  }
  // Without a run-rate, guidance or consensus this is the pre-D-58 rule
  // exactly: TTM grown one year at the clamped rate.
  const yearOneGrowthPct = source === "ttm" && clampedFrom === null ? gMid : (yearOneRevenue / startRev - 1) * 100;
  // Later years (D-58/D-60 for year two, D-65 beyond): each takes consensus
  // growth, window over window — the consensus level itself when consensus set
  // year one, else consensus growth applied to the level actually used, with
  // the gap to the consensus level stated. Year two may not fall below the
  // house floor or re-accelerate past both the house ceiling and year one
  // (clamped, as D-58 did); from year three a window that fails a gate, or
  // whose growth leaves that band, ends the anchored stretch, and the fade
  // starts from the last anchored year. The final explicit year is always the
  // fade's, so the path reaches the terminal rate.
  if (path[0]) {
    path[0].anchored = source === "consensus";
    path[0].status = source === "consensus"
      ? "anchored: the year-one level"
      : path[0].gate !== null ? `not anchored: ${path[0].gate}`
        : `not anchored: year one comes from ${source}${guidedFloor !== null && ntm1 !== null && ntm1 < guidedFloor ? " (consensus is below the twelve-month floor the guidance implies)" : ""}`;
  }
  const anchoredGrowth = [yearOneGrowthPct];
  const consensusYears: number[] = source === "consensus" ? [1] : [];
  const stepTexts: string[] = [];
  let anchoredLevel = yearOneRevenue;
  // notCovered: the reason is, or quotes, a "not covered" gate (P11, D-223).
  let stop: { year: number; reason: string; notCovered: boolean } | null = null;
  for (let k = 2; k <= path.length; k++) {
    const row = path[k - 1];
    if (stop !== null) {
      row.status = `not anchored: the anchored stretch ended at year ${yearWord(anchoredGrowth.length)}`;
      continue;
    }
    if (k >= DCF_HORIZON_YEARS) {
      stop = { year: k, reason: "it is the final explicit year, which the fade sets to the terminal rate", notCovered: false };
    } else if (!usable(k - 1)) {
      stop = { year: k, reason: `there is no consensus growth into it (year ${yearWord(k - 1)}: ${path[k - 2].gate ?? "no consensus"})`, notCovered: notCovered[k - 2] };
    } else if (!usable(k)) {
      stop = { year: k, reason: row.gate ?? "no consensus", notCovered: notCovered[k - 1] };
    } else if (k > 2 && !consensusYears.includes(k - 1)) {
      stop = { year: k, reason: `year ${yearWord(k - 1)} was not anchored`, notCovered: false };
    }
    if (stop !== null) {
      row.status = `not anchored: ${stop.reason}`;
      continue;
    }
    const prev = path[k - 2].consensus as number;
    const cur = row.consensus as number;
    const rawG = (cur / prev - 1) * 100;
    const prevG = anchoredGrowth[anchoredGrowth.length - 1];
    const gHi = Math.max(NEAR_TERM_GROWTH_CLAMP_PP[1], prevG);
    let g = rawG;
    let clampNote = "";
    if (k === 2) {
      g = clampWithNote(rawG, NEAR_TERM_GROWTH_CLAMP_PP[0], gHi, "consensus year-two growth (pct)", notes);
      if (g !== rawG) {
        clampNote = `, ${fmtNum(rawG)}% clamped to [${NEAR_TERM_GROWTH_CLAMP_PP[0]}%, ${fmtNum(gHi)}%] = [house floor, max(house ceiling ${NEAR_TERM_GROWTH_CLAMP_PP[1]}%, year-one growth)]`;
      }
    } else if (rawG < NEAR_TERM_GROWTH_CLAMP_PP[0] || rawG > gHi) {
      stop = { year: k, reason: `consensus growth ${fmtNum(rawG)}% ${rawG < NEAR_TERM_GROWTH_CLAMP_PP[0] ? `falls below the ${NEAR_TERM_GROWTH_CLAMP_PP[0]}% house floor` : `re-accelerates past max(${NEAR_TERM_GROWTH_CLAMP_PP[1]}%, year ${yearWord(k - 1)}'s ${fmtNum(prevG)}%)`}`, notCovered: false };
      row.status = `not anchored: ${stop.reason}`;
      continue;
    }
    anchoredGrowth.push(g);
    consensusYears.push(k);
    anchoredLevel *= 1 + g / 100;
    row.anchored = true;
    row.status = g === rawG ? "anchored: consensus growth" : "anchored: consensus growth, clamped";
    const gap = (anchoredLevel / cur - 1) * 100;
    stepTexts.push(
      `year ${yearWord(k)} grows ${fmtNum(g)}% on consensus (${row.label} ${fmtMoney(cur)} over ${fmtMoney(prev)}${clampNote})` +
      (Math.abs(gap) < 0.05 ? "" : `, so year ${yearWord(k)} ${fmtMoney(anchoredLevel)} is ${fmtNum(Math.abs(gap))}% ${gap < 0 ? "below" : "above"} the consensus level`),
    );
    // A clamped year two leaves the consensus levels behind; later years fade.
    if (g !== rawG) stop = { year: k + 1, reason: "year two's consensus growth was clamped", notCovered: false };
  }
  const yearTwoGrowthPct = consensusYears.includes(2) ? anchoredGrowth[1] : null;
  // When consensus sets later years but not year one, the spread is stated with them.
  const laterSpreadText = source === "consensus" || spread === null ? "" : ` (consensus calendarized with ${spreadText})`;
  const yearTwoText = stepTexts.length === 0 ? "" : `; ${stepTexts.join("; ")}${laterSpreadText}`;
  const anyConsensus = path.some((r) => r.consensus !== null);
  const lastCovered = [...path].reverse().find((r) => r.consensus !== null);
  const stopText = stop === null || !anyConsensus ? "" :
    `; year ${yearWord(stop.year)} is not anchored: ${stop.reason}${stop.notCovered && lastCovered ? ` (the estimates cover through ${lastCovered.label})` : ""}`;
  const yearOneGap = ntm1 === null || source === "consensus" ? null : (yearOneRevenue / ntm1 - 1) * 100;
  const yearOneGapText = yearOneGap === null || Math.abs(yearOneGap) < 0.05 ? "" :
    `; year one is ${fmtNum(Math.abs(yearOneGap))}% ${yearOneGap < 0 ? "below" : "above"} the consensus ${fmtMoney(ntm1 as number)}`;
  const gateText = !anyConsensus ? "" :
    ` House rule: consensus sets every year whose fiscal-year estimates have at least ${MIN_CONSENSUS_ANALYSTS} analysts and an implied dispersion of at most ${MAX_CONSENSUS_CV_PCT}%, while its growth stays within [${NEAR_TERM_GROWTH_CLAMP_PP[0]}%, max(${NEAR_TERM_GROWTH_CLAMP_PP[1]}%, the prior year)].`;
  const guidedYoyIssuerEffectPp = statedGuide?.qualifiers?.map(parseIssuerGrowthEffect).find(effect => effect !== null)?.pp ?? null;
  const issuerEffectText = guidedYoyIssuerEffectPp === null ? "" :
    `; the issuer states that, excluding an item it names, the guided quarter's year-over-year growth would be about ${Math.abs(guidedYoyIssuerEffectPp).toFixed(2)}pp ${guidedYoyIssuerEffectPp < 0 ? "lower" : "higher"}; this issuer-stated effect is disclosed only and does not adjust any modeled revenue level`;
  const basis =
    `year-one revenue ${fmtMoney(yearOneRevenue)} (${fmtNum(yearOneGrowthPct)}% over ${periodBasis} ${fmtMoney(startRev)}) from ${rawText}` +
    `${clampText}${yearOneGapText}; measured against ${levelText}${yearTwoText}${stopText} (house rule: consensus levels when consistent with admitted guidance extrapolation, then model extrapolation of quarterly guidance, then the run-rate).${gateText}${comparabilityText}${issuerEffectText}`;
  notes.push(`Year-one revenue anchor: ${basis}`);
  return {
    source, yearOneRevenue, yearOneGrowthPct, yearTwoGrowthPct, runRate, clampedFrom, basis,
    anchoredGrowthPct: anchoredGrowth,
    consensusYears,
    consensusPath: path.map((row) => ({ year: row.year, label: row.label, startDate: row.startDate, endDate: row.endDate,
      consensus: row.consensus, anchored: row.anchored, status: row.status, fiscalYears: row.fiscalYears })),
    evidence: { guidedRunRate, guidedPacePct,
      /** D-136: Without stated guidance, use the existing evidenced revenue anchor. */
      ...(statedGuide === null ? {} : { guidedYoyPct, guidedYoyIssuerEffectPp, guidedFloor, guidedSeasonalFactor: seasonal?.value ?? null }),
      consensusYearOne: ntm1, consensusYearTwo: ntm2, nearTermRateUsed,
      guidedQuarter: statedGuide === null ? null : { periodEnd: statedGuide.periodEnd, revenueLow: posOrNull(statedGuide.revenueLow) ?? statedGuide.revenue, revenueMid: statedGuide.revenue,
        grossMarginLowPct: isNum(statedGuide.grossMarginLowPct) ? statedGuide.grossMarginLowPct : null, source: statedGuide.source, asOf: statedGuide.asOf } },
  };
}

/**
 * D-60: the scenario operating-margin ceiling. The gross margin is the TTM's
 * (the latest fiscal year's when no TTM gross profit exists); the
 * operating-expense ratio, (gross profit − operating income) / revenue, is the
 * lowest among the TTM and the last five fiscal years. A row whose operating
 * income exceeds its gross profit, or whose gross margin is outside (0, 100],
 * is a broken row and is skipped.
 */
export function scenarioMarginCeiling(ttm: DcfIncomeRow | null, history: DcfIncomeRow[]): ScenarioMarginCeiling | null {
  const ratios = (row: DcfIncomeRow, period: string) => {
    const revenue = posOrNull(zeroAsNull(row.revenue));
    if (revenue === null || !isNum(row.grossProfit) || !isNum(row.operatingIncome)) return [];
    const gross = (row.grossProfit / revenue) * 100;
    const opex = ((row.grossProfit - row.operatingIncome) / revenue) * 100;
    return gross > 0 && gross <= 100 && opex >= 0 ? [{ gross, opex, period }] : [];
  };
  const current = ttm === null ? [] : ratios(ttm, ttm.basis === "annual" ? `FY ${ttm.date}` : `TTM ending ${ttm.date}`);
  const annual = history
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5)
    .flatMap((row) => ratios(row, `FY ${row.date}`));
  const latest = current[0] ?? annual[0];
  if (latest === undefined) return null;
  const leanest = [...current, ...annual].reduce((best, p) => (p.opex < best.opex ? p : best));
  const pct = latest.gross - leanest.opex;
  return {
    pct,
    grossMarginPct: latest.gross,
    grossMarginPeriod: latest.period,
    minOpexRatioPct: leanest.opex,
    minOpexRatioPeriod: leanest.period,
    basis:
      `scenario operating margins are capped at ${fmtNum(pct)}% = gross margin ${fmtNum(latest.gross)}% (${latest.period}) ` +
      `less the leanest operating-expense ratio on record, ${fmtNum(leanest.opex)}% (${leanest.period}, among the TTM and the last five fiscal years); ` +
      "the cap never pulls a scenario below the base path (house rule)",
  };
}

/**
 * D-60: the discounting convention, stated where the reader sees the
 * assumptions. The Gordon terminal value is FCFF_(N+1) / (WACC − g): the value
 * at the end of year N of flows that, like the explicit ones, arrive through
 * each year. Discounting it at N − 0.5 keeps that timing; at N it would treat
 * explicit flows as mid-year and perpetuity flows as year-end.
 */
export const MID_YEAR_DISCOUNTING_BASIS =
  "mid-year convention: explicit-year FCFF is discounted at t − 0.5 years, and the Gordon terminal value is discounted at N − 0.5 " +
  "because its perpetuity flows also arrive through each year (Rosenbaum & Pearl, Investment Banking, ch. 3: perpetuity-growth terminal " +
  "values take the mid-year factor, exit-multiple values the year-end factor; Koller, Goedhart & Wessels, Valuation, apply the half-year " +
  "adjustment to the whole value including continuing value). Discounting the terminal value at N instead lowers it by a factor of " +
  "(1 + WACC)^0.5 (house rule)";

/**
 * Build the base-case DCF assumption block. Every assumption carries
 * {value, basis}; every clamp/fallback fired lands in notes[]; missing inputs
 * produce gaps and — when the base is unusable — a null assumptions object.
 */
export function buildDcfAssumptions(inputs: DcfAssumptionInputs): BuildDcfAssumptionsResult {
  const notes: string[] = [];
  const gaps: ManifestEntry[] = [];
  if(inputs.incomeTtm?.operatingPerimeterRefusal) return {assumptions:null,notes:[inputs.incomeTtm.operatingPerimeterRefusal],
    gaps:[gapEntry("valuation.dcf.operatingPerimeter",inputs.incomeTtm.operatingPerimeterRefusal,"critical")]};
  if (inputs.equityBridgePreferredRefusal) return { assumptions: null, notes: [inputs.equityBridgePreferredRefusal],
    gaps: [gapEntry("valuation.dcf.preferredCapital", inputs.equityBridgePreferredRefusal, "critical")] };
  const normalizationRefusal = inputs.operatingNormalizationRefusal ?? inputs.unusualOperatingItems?.dcfRefusal;
  if (normalizationRefusal) return { assumptions: null, notes: [normalizationRefusal],
    gaps: [gapEntry("valuation.dcf.operatingDisposition", normalizationRefusal, "critical")] };
  if (inputs.operatingNormalizationBasis) notes.push(`Operating income excludes ${inputs.operatingNormalizationBasis}`);
  const years = DCF_HORIZON_YEARS;

  const baseFactor = fiftyTwoWeekFactor(inputs.incomeTtm?.days ?? null);
  const scaleFlow = (value: number | null | undefined) => value == null ? value : value * baseFactor;
  const ttm = inputs.incomeTtm === null || baseFactor === 1 ? inputs.incomeTtm : {
    ...inputs.incomeTtm,
    revenue: scaleFlow(inputs.incomeTtm.revenue) as number | null,
    operatingIncome: scaleFlow(inputs.incomeTtm.operatingIncome) as number | null,
    grossProfit: scaleFlow(inputs.incomeTtm.grossProfit),
    incomeBeforeTax: scaleFlow(inputs.incomeTtm.incomeBeforeTax),
    incomeTaxExpense: scaleFlow(inputs.incomeTtm.incomeTaxExpense),
  };
  const periodBasis = ttm?.basis === "annual" ? `latest annual FY ${ttm.date}` : "TTM";
  const startRev = posOrNull(zeroAsNull(ttm?.revenue));
  if (startRev === null) {
    gaps.push(
      gapEntry(
        "valuation.dcf.startRevenue",
        "base-period revenue missing or non-positive (FMP zero-for-undisclosed treated as null) — DCF not buildable",
        "critical",
      ),
    );
    return { assumptions: null, notes, gaps };
  }

  const filedRevenue = inputs.incomeTtm!.revenue as number;

  // --- Terminal growth: min(2.5, rf) — Damodaran g <= rf rule --------------
  // Computed first: the near-term anchor falls back to it when revenue
  // history shows no trend.
  const gTerm = Math.min(TERMINAL_G_CAP_PCT, inputs.riskFreePct);
  /** D-19: Label the terminal rule as a "house convention" wherever its assumptions are presented. */
  const gTermBasis = `min(${TERMINAL_G_CAP_PCT}%, risk-free ${fmtNum(inputs.riskFreePct)}%) — HOUSE CONVENTION: nothing grows faster than rf forever`;

  /*
   * D-18: The near-term growth anchor is the median of supported methods, with their full range
   * disclosed: log-linear regression over all annual years with fit and sample size, three- and
   * five-year CAGRs, and analyst consensus when available. Name each method result and each
   * unavailable method in the basis; do not let the worse CAGR or a sign-disagreement shortcut
   * determine the whole growth path.
   */
  const analyst = analystTwoYearGrowthPct(inputs.analystEstimates, startRev, ttm?.date ?? null, periodBasis);
  notes.push(...analyst.notes);

  const methods: GrowthAnchorMethod[] = [];
  const trend = inputs.revenueLogLinear ?? null;
  if (trend && isNum(trend.growthPct)) {
    methods.push({
      name: "log-linear revenue regression",
      valuePct: trend.growthPct,
      detail:
        `${fmtNum(trend.growthPct)}%/yr fitted over ${trend.n} annual years` +
        `${trend.startDate && trend.endDate ? ` (${trend.startDate} to ${trend.endDate})` : ""}` +
        `${isNum(trend.rSquared) ? `, R2 ${fmtNum(trend.rSquared)}` : ", R2 unavailable"}`,
    });
  } else {
    methods.push({
      name: "log-linear revenue regression",
      valuePct: null,
      detail: `unavailable: ${trend === null ? "no annual revenue trend supplied" : "fewer than 3 positive annual revenue observations"}`,
    });
  }
  // D-39: a window whose CAGR was computed over a different span is not that
  // window's method; say what was measured instead of "no CAGR".
  const cagrMethod = (window: 3 | 5, pct: number | null | undefined, excludedSpan: number | null | undefined): GrowthAnchorMethod => {
    const name = `${window}y revenue CAGR`;
    if (isNum(pct)) return { name, valuePct: pct, detail: `${fmtNum(pct)}%` };
    if (isNum(excludedSpan)) {
      return {
        name,
        valuePct: null,
        detail: `unavailable: measured span ${excludedSpan.toFixed(2)} years, not the ${window}-year window (±${CAGR_SPAN_TOLERANCE_YEARS}-year tolerance)`,
      };
    }
    return { name, valuePct: null, detail: `unavailable: no ${window}-year revenue CAGR` };
  };
  methods.push(cagrMethod(3, inputs.revenueCagr3yPct, inputs.revenueCagr3yExcludedSpanYears));
  methods.push(cagrMethod(5, inputs.revenueCagr5yPct, inputs.revenueCagr5yExcludedSpanYears));
  if (analyst.value !== null) {
    methods.push({
      name: "analyst-consensus case",
      valuePct: analyst.value,
      // D-65 (P2-9): both legs are printed, so the average can be reproduced.
      detail: `${fmtNum(analyst.value)}% (mean of ${analyst.legs.join(" and ")}, through ${analyst.asOf ?? "?"})`,
    });
  } else {
    methods.push({
      name: "analyst-consensus case",
      valuePct: null,
      detail: "unavailable: no usable analyst revenue estimates",
    });
  }

  const available = methods.filter((m): m is GrowthAnchorMethod & { valuePct: number } => isNum(m.valuePct));
  const unavailable = methods.filter((m) => !isNum(m.valuePct)).map((m) => m.name);
  if (available.length === 0) {
    gaps.push(
      gapEntry(
        "valuation.dcf.nearTermGrowth",
        `no growth-anchor method available (${unavailable.join("; ")}) — DCF growth path not buildable`,
        "critical",
      ),
    );
    return { assumptions: null, notes, gaps };
  }
  const values = available.map((m) => m.valuePct);
  const point = medianOf(values) as number;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const rangePct: [number, number] | null = available.length > 1 ? [lo, hi] : null;
  /*
   * D-18, D-58: Clamp the median before describing it. Carry the latest evidenced revenue level
   * forward at that clamped rate: from the run-rate or guided quarter to the year-one midpoint, or
   * from TTM over a full year when neither exists.
   */
  const gMid = clampWithNote(
    point,
    NEAR_TERM_GROWTH_CLAMP_PP[0],
    NEAR_TERM_GROWTH_CLAMP_PP[1],
    "near-term growth (pct)",
    notes,
  );
  const clampFired = gMid !== point;
  // D-60: build the year-one level first, so the clamp sentence says whether
  // the clamped rate set it. Under guidance or consensus it does not, and
  // D-58's "year-one revenue is built from the clamped value" was false.
  const revenueAnchor = buildRevenueAnchor({ inputs, startRev, periodBasis, gMid, notes });
  const rateSetsYearOne = revenueAnchor.evidence?.nearTermRateUsed ?? true;
  const clampSentence = !clampFired
    ? (rateSetsYearOne ? "" : ` It does not set year one, which comes from ${revenueAnchor.source}.`)
    : rateSetsYearOne
      ? ` CLAMPED to ${fmtNum(gMid)}%: the near-term growth house rule bounds the rate to [${NEAR_TERM_GROWTH_CLAMP_PP[0]}%, ${NEAR_TERM_GROWTH_CLAMP_PP[1]}%], and year-one revenue is built from the clamped value, not the median.`
      : ` CLAMPED to ${fmtNum(gMid)}% by the near-term growth house rule [${NEAR_TERM_GROWTH_CLAMP_PP[0]}%, ${NEAR_TERM_GROWTH_CLAMP_PP[1]}%]; it does not set year one, which comes from ${revenueAnchor.source}, and is shown as a cross-check only.`;
  const anchorBasis =
    `median of ${available.length} available growth method${available.length === 1 ? "" : "s"} = ${fmtNum(point)}%` +
    `${rangePct === null ? " (single method; no range)" : `, range ${fmtNum(lo)}% to ${fmtNum(hi)}%`}` +
    ` — methods: ${methods.map((m) => `${m.name} ${m.detail}`).join("; ")}` +
    ` (house rule: median of methods).` +
    clampSentence;
  notes.push(`Near-term growth anchor: ${anchorBasis}`);
  if (unavailable.length > 0) {
    gaps.push(
      gapEntry(
        "valuation.dcf.growthAnchor",
        `growth-anchor method(s) unavailable: ${unavailable.join(", ")} — the point estimate is the median of the ${available.length} that were computable`,
        "info",
      ),
    );
  }
  if (analyst.value === null) {
    const refusal = inputs.analystEstimatesRefusal ?? null;
    if (refusal !== null) {
      const degraded =
        `the valuation is degraded: analyst revenue estimates were refused by the data provider's rate limit (HTTP 429) — ${refusal.replace(/\.$/, "")} — ` +
        "so the analyst-consensus growth method was excluded from the median and no year is anchored to consensus";
      notes.push(`Valuation degraded: ${degraded}.`);
      gaps.push(gapEntry("valuation.dcf.analystGrowth", `no usable analyst revenue estimates because ${degraded}`, "warn"));
    } else {
      gaps.push(
        gapEntry("valuation.dcf.analystGrowth", "no usable analyst revenue estimates — the analyst-consensus growth method was excluded from the median", "info"),
      );
    }
  }

  const gMidBasis =
    `median of the available growth methods (${available.map((m) => `${m.name} ${fmtNum(m.valuePct)}%`).join(", ")})` +
    (clampFired
      ? ` = ${fmtNum(point)}%, clamped to ${fmtNum(gMid)}% by the near-term growth house rule range [${NEAR_TERM_GROWTH_CLAMP_PP[0]}%, ${NEAR_TERM_GROWTH_CLAMP_PP[1]}%]`
      : "");
  const growthAnchor: GrowthAnchor = {
    pointPct: gMid,
    ...(clampFired ? { preClampMedianPct: point } : {}),
    rangePct,
    methods,
    unavailable,
    basis: anchorBasis,
  };

  // --- D-58: year one (and two) from evidence, then a convergent fade ------
  /* D-60: Anchor the projection to the established revenue window and disclose the evidence used. */
  const anchoredGrowth = (revenueAnchor.anchoredGrowthPct ?? [revenueAnchor.yearOneGrowthPct]).slice(0, Math.max(1, years - 1));
  const lastAnchored = anchoredGrowth[anchoredGrowth.length - 1];
  const growthPath = [
    ...anchoredGrowth,
    ...convergentFadePath(lastAnchored, gTerm, years - anchoredGrowth.length + 1).slice(1),
  ];
  const guide = nextQuarterGuidance(inputs.guidance, ttm?.date ?? null);

  // --- EBIT margin path -----------------------------------------------------
  /* D-98: Separate one-off tax effects from the evidenced operating tax assumption and disclose the basis. */
  const unusual = inputs.unusualOperatingItems == null ? null : {
    ...inputs.unusualOperatingItems, value: inputs.unusualOperatingItems.value * baseFactor,
  };
  const baseOperatingIncome = ttm?.operatingIncome ?? null;
  const normalizeUnusual = unusual !== null && unusual.value !== 0 && isNum(baseOperatingIncome);
  /*
   * The 52/53 factor cancels in ratios. Use filed amounts so rounding cannot change the established
   * margin path or scenario shock.
   */
  const filedOperatingIncome = inputs.incomeTtm?.operatingIncome ?? null;
  const ttmMarginRaw = safeDiv(normalizeUnusual
    ? (filedOperatingIncome as number) - inputs.unusualOperatingItems!.value
    : filedOperatingIncome, filedRevenue);
  if (normalizeUnusual) {
    notes.push(
      `EBIT margin seed excludes tagged one-off items of ${fmtNum(unusual.value)} from ${periodBasis} operating income ${fmtNum(baseOperatingIncome as number)}: ${unusual.basis}`,
    );
  } else if (unusual !== null && unusual.withheld.length > 0) {
    notes.push(`EBIT margin seed keeps tagged one-off items the filings don't place inside the ${periodBasis} window: ${unusual.basis}`);
  }
  const normalizedHistory = inputs.incomeHistory.map(row => ({ ...row, operatingIncome: row.operatingIncome === null ? null : row.operatingIncome - (row.unusualOperatingItems ?? 0) }));
  const normalizedTtm = inputs.incomeTtm == null ? null : { ...inputs.incomeTtm,
    operatingIncome: normalizeUnusual ? (filedOperatingIncome as number) - inputs.unusualOperatingItems!.value : filedOperatingIncome };
  const normalizedYears = inputs.incomeHistory.filter(row => row.unusualOperatingItems).map(row => `${row.date}: ${row.unusualOperatingItems}`).join(", ");
  if (normalizedYears) notes.push(`EBIT margin history excludes tagged one-off items (${normalizedYears}); the scenario ceiling reads the same rows.`);
  if (inputs.recurringOperatingItemsBasis) notes.push(inputs.recurringOperatingItemsBasis);
  const marginWindow = normalizedHistory
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5)
    .map((r) => {
      const margin = safeDiv(r.operatingIncome, posOrNull(zeroAsNull(r.revenue)));
      return { date: r.date, marginPct: margin === null ? null : margin * 100 };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  const marginHistory=normalizedHistory.filter(r=>marginWindow.some(p=>p.date===r.date));
  const absentMargins=missingAnnualIntervals([...marginHistory,...(inputs.incomeCadenceBarriers ?? [])]);
  const interiorMargins = [...interiorMissingDates(marginWindow.map(p=>({date:p.date,value:p.marginPct}))),...absentMargins.map(p=>p.label),
    ...unavailableAnnualPeriods(marginHistory,inputs.incomeCadenceBarriers)];
  const histMarginPoints = marginWindow.filter((p):p is {date:string;marginPct:number}=>p.marginPct!==null);
  const histMargins = histMarginPoints.map((point) => point.marginPct);
  const median5y = medianOf(histMargins);
  const oldestMarginDate = histMarginPoints[0]?.date;
  const marginSlope = interiorMargins.length ? null : linearRegressionSlope(
    histMarginPoints.map((point) => ({
      x: oldestMarginDate === undefined ? null : yearsBetweenDates(oldestMarginDate, point.date),
      y: point.marginPct,
    })),
  );

  // D-58: guidance, when it implies an operating margin, sets year one.
  const guidedMargin = guide !== null && isNum(guide.operatingMarginPct) ? guide.operatingMarginPct : null;
  let m0 = guidedMargin ?? (ttmMarginRaw !== null ? ttmMarginRaw * 100 : null);
  let m0Source = guidedMargin !== null
    ? `guided (${guide!.source})`
    : normalizeUnusual ? `${periodBasis}, excluding tagged one-off items` : periodBasis;
  const marginCutoff = inputs.analysisCutoff ?? inputs.valuationDate ?? inputs.incomeTtm?.date ?? null;
  const annualFloor = marginCutoff ? new Date(`${marginCutoff}T00:00:00Z`) : null;
  if (annualFloor && Number.isFinite(annualFloor.getTime())) annualFloor.setUTCMonth(annualFloor.getUTCMonth() - 15);
  const latestAnnualMargin = [...histMarginPoints].reverse().find(p => marginCutoff !== null && p.date <= marginCutoff &&
    annualFloor !== null && Date.parse(p.date) >= annualFloor.getTime());
  if (m0 === null && latestAnnualMargin) {
    m0 = latestAnnualMargin.marginPct;
    m0Source = `latest annual FY ${latestAnnualMargin.date}`;
    notes.push(`TTM EBIT margin unavailable — base margin set to ${m0Source}, within 15 months of ${marginCutoff}`);
    gaps.push(gapEntry("valuation.dcf.ttmEbitMargin", `TTM operating income or revenue missing; using ${m0Source} before the 5y median`, "warn"));
  }
  if (m0 === null && median5y !== null) {
    m0 = median5y;
    m0Source = "5y median";
    notes.push("TTM EBIT margin unavailable — base margin set to 5y median (fallback)");
    gaps.push(gapEntry("valuation.dcf.ttmEbitMargin", "TTM operating income or revenue missing", "warn"));
  }
  if (m0 === null) {
    gaps.push(
      gapEntry("valuation.dcf.ebitMargin", "no EBIT margin derivable from TTM or history — DCF not buildable", "critical"),
    );
    return { assumptions: null, notes, gaps };
  }

  // The margin cap is a broken-input guard, not a view on what a company can
  // earn, so it never binds below a margin the issuer has demonstrably earned:
  // a flat 45% cap removed a third of the DCF of a 65%-margin payments network
  // under a rule no document described. The ceiling is the house figure or
  // the issuer's own highest annual margin in the five-year history,
  // whichever is higher (METHODOLOGY "Fade and horizon", RESEARCH §7.5).
  // D-58: it binds the margin the path fades TO — year five onward and the
  /* D-60: Anchor the projection to the established revenue window and disclose the evidence used. */
  /* D-98: Use the evidenced margin regime and disclose the improving-margin fade assumption. */
  const ttmMarginPoint = ttm?.basis !== "annual" && ttmMarginRaw !== null && ttmMarginRaw <= 1 && ttm?.date
    ? [{ date: ttm.date, marginPct: ttmMarginRaw * 100, ttm: true }]
    : [];
  const observedPoints: { date: string; marginPct: number; ttm?: boolean }[] = [
    ...histMarginPoints.filter((p) => isNum(p.marginPct)),
    ...ttmMarginPoint,
  ];
  const observedTop = observedPoints.reduce<{ date: string; marginPct: number; ttm?: boolean } | null>(
    (best, p) => (best === null || p.marginPct > best.marginPct ? p : best),
    null,
  );
  const marginCeiling = Math.max(MARGIN_CLAMP_PP[1], observedTop?.marginPct ?? MARGIN_CLAMP_PP[1]);
  const ceilingText = observedTop !== null && observedTop.marginPct > MARGIN_CLAMP_PP[1]
    ? `the issuer's highest sustained margin (the last five fiscal years and the TTM), ${fmtNum(marginCeiling)}% (${observedTop.ttm ? `TTM ending ${observedTop.date}` : `FY ${observedTop.date}`})`
    : `the house ceiling ${MARGIN_CLAMP_PP[1]}%`;
  const yearOneCeiling = m0 <= 100 ? Math.max(marginCeiling, m0) : marginCeiling;
  const m0Raw = m0;
  m0 = Math.min(yearOneCeiling, Math.max(MARGIN_CLAMP_PP[0], m0));
  if (m0 !== m0Raw) {
    notes.push(`EBIT margin (pct) clamped: current ${fmtNum(m0Raw)} -> ${fmtNum(m0)} (house rule range [${MARGIN_CLAMP_PP[0]}, ${fmtNum(yearOneCeiling)}])`);
  }

  const fadeYears = Math.min(MARGIN_FADE_YEARS, years);
  let regime: string | null = null;
  let slopeBasis = "unavailable";
  let targetMargin = m0;
  let improvingBound: string | null = null;
  let missingImprovingCeiling = false;
  if (median5y === null) {
    gaps.push(gapEntry("valuation.dcf.marginTarget", "no annual margin history — margin held flat", "info"));
  } else {
    regime = marginSlope === null
      ? "stable/insufficient-history"
      : marginSlope > MARGIN_TREND_THRESHOLD_PP_PER_YEAR
        ? "improving"
        : marginSlope < -MARGIN_TREND_THRESHOLD_PP_PER_YEAR
          ? "declining"
          : "stable";
    /* D-98: Use the evidenced margin regime and disclose the improving-margin fade assumption. */
    const improvingCeiling = regime === "improving" && marginSlope !== null
      ? scenarioMarginCeiling(normalizedTtm, normalizedHistory)
      : null;
    const trendTarget = marginSlope !== null ? m0 + IMPROVING_MARGIN_TREND_SHARE * marginSlope * fadeYears : m0;
    const improvingTarget = improvingCeiling === null ? m0 : Math.min(trendTarget, improvingCeiling.pct);
    missingImprovingCeiling = regime === "improving" && improvingCeiling === null && trendTarget > m0;
    targetMargin = regime === "improving"
      ? Math.max(m0, median5y, improvingTarget)
      : regime === "declining"
        ? Math.min(m0, median5y)
        : median5y;
    if (regime === "improving" && improvingCeiling !== null && improvingTarget > Math.max(m0, median5y)) {
      improvingBound = trendTarget <= improvingCeiling.pct
        ? `half the dated trend over ${fadeYears} years (${fmtNum(m0)}% + ${IMPROVING_MARGIN_TREND_SHARE} × ${fmtNum(marginSlope as number)}pp × ${fadeYears}), below the ${fmtNum(improvingCeiling.pct)}% gross margin less the leanest operating-expense ratio`
        : `the gross margin less the leanest operating-expense ratio, ${fmtNum(improvingCeiling.pct)}% (${fmtNum(improvingCeiling.grossMarginPct)}% ${improvingCeiling.grossMarginPeriod} less ${fmtNum(improvingCeiling.minOpexRatioPct)}% ${improvingCeiling.minOpexRatioPeriod}), below half the dated trend (${fmtNum(trendTarget)}%)`;
    }
    slopeBasis = marginSlope === null ? "unavailable" : `${fmtNum(marginSlope)}pp/year`;
    notes.push(
      `EBIT margin regime ${regime}: dated 5y slope ${slopeBasis}; target ${fmtNum(targetMargin)}% versus ${m0Source === "5y median" ? "historical seed" : "current"} ${fmtNum(m0)}% and median ${fmtNum(median5y)}%`,
    );
  }
  const cappedTarget = Math.min(marginCeiling, Math.max(MARGIN_CLAMP_PP[0], targetMargin));
  const capText = cappedTarget < targetMargin
    ? `; the target ${fmtNum(targetMargin)}% is capped at ${ceilingText} (house broken-input guard; it binds year ${fadeYears} onward, not year one)`
    : cappedTarget > targetMargin
      ? `; the target ${fmtNum(targetMargin)}% is floored at ${MARGIN_CLAMP_PP[0]}% (house rule)`
      : "";
  if (cappedTarget !== targetMargin) {
    notes.push(
      `EBIT margin target (pct) clamped ${fmtNum(targetMargin)} -> ${fmtNum(cappedTarget)} to the house rule range [${MARGIN_CLAMP_PP[0]}, ${fmtNum(marginCeiling)}]` +
        (marginCeiling > MARGIN_CLAMP_PP[1] ? ` (ceiling raised from ${MARGIN_CLAMP_PP[1]} to the issuer's own observed maximum margin)` : "") +
        `; year one keeps the current ${fmtNum(m0)}%`,
    );
  }
  const fade = fadePath(m0, cappedTarget, fadeYears);
  const marginPath = Array.from({ length: years }, (_, i) => (i < fade.length ? fade[i] : cappedTarget));
  // Written after every clamp, so the text names the values the path holds.
  const regimeText = regime === null
    ? "no 5y margin history for a fade target"
    : `${regime} dated-margin regime (5y median ${fmtNum(median5y as number)}%, slope ${slopeBasis})`;
  let marginBasis = cappedTarget === m0
    ? `held flat at ${m0Source === "5y median" ? "historical seed" : "current"} ${fmtNum(m0)}% (${m0Source}) under ${regimeText}${capText}`
    : `fade ${m0Source === "5y median" ? "historical seed" : "current"} ${fmtNum(m0)}% (${m0Source}) -> ${fmtNum(cappedTarget)}% by year ${fadeYears} under ${regimeText}` +
      `${improvingBound !== null ? `; the improving target is ${improvingBound}` : ""}${capText}, flat thereafter`;
  if (interiorMargins.length) marginBasis += `; trend withheld across interior unavailable periods: ${interiorMargins.join(", ")}`;
  if (missingImprovingCeiling) {
    const cause = [...new Set([ttm?.grossProfitBasis,...normalizedHistory.map(r=>r.grossProfitBasis)].filter((s):s is string=>!!s))].join(" ");
    const reason = `Improving-trend uplift is withheld because a supported gross-profit ceiling is unavailable${cause ? `. ${cause}` : "."}`;
    marginBasis += `; ${reason}`;
    gaps.push(gapEntry("valuation.dcf.marginCeiling",reason,"info"));
  }
  if (histMarginPoints.length < marginWindow.length || m0Source === "5y median") {
    const missing=marginWindow.filter(p=>p.marginPct===null).map(p=>p.date);
    marginBasis += `; historical support: ${histMarginPoints.length} observed annual margins${histMarginPoints.length ? ` from ${histMarginPoints[0]!.date} to ${histMarginPoints.at(-1)!.date}` : ""} in the latest ${marginWindow.length} available annual rows${missing.length ? `; unsupported annual margins: ${missing.join(", ")}` : ""}`;
  }
  if (inputs.equityMethodStake?.incomePlacement === "in-operating-income") marginBasis += `; ${inputs.equityMethodStake.basis}`;
  if (marginPath.some((m) => m < MARGIN_WARN_BAND_PP[0] || m > MARGIN_WARN_BAND_PP[1])) {
    notes.push(
      `EBIT margin path leaves [${MARGIN_WARN_BAND_PP[0]}%, ${MARGIN_WARN_BAND_PP[1]}%] — unusual outside software; review (house-rule warning)`,
    );
  }

  // --- Tax rate path: company history, never a universal domicile assumption -
  const pretax = zeroAsNull(inputs.incomeTtm?.incomeBeforeTax);
  const taxExp = inputs.incomeTtm?.incomeTaxExpense ?? null;
  const historicalTaxRates = inputs.incomeHistory.flatMap((row): number[] => {
    const rowPretax = zeroAsNull(row.incomeBeforeTax);
    const rowTax = row.incomeTaxExpense ?? null;
    if (rowPretax === null || rowPretax <= 0 || !isNum(rowTax) || rowTax < 0) return [];
    return [Math.min(35, Math.max(0, (rowTax / rowPretax) * 100))];
  });
  const historicalMedianTax = medianOf(historicalTaxRates);
  const { pct: taxFloor, basis: taxFloorText } = marginalTaxFloor(inputs.domicileCountry);
  const observedCurrentTaxRate =
    pretax !== null && pretax > 0 && isNum(taxExp) && taxExp >= 0
      ? clampWithNote((taxExp / pretax) * 100, 0, 35, "effective tax rate (pct)", notes)
      : null;
  const rereadTax = normalizeUnusual ? taxRateWithoutOneOffs({ pretax, taxExpense: taxExp, oneOff: inputs.unusualOperatingItems!.value, marginalPct: taxFloor, historicalMedianPct: historicalMedianTax }) : null;
  const currentTaxRate = rereadTax?.pct ?? observedCurrentTaxRate;
  const unavailableTaxReason = pretax !== null && pretax > 0 && isNum(taxExp) && taxExp < 0
    ? `${periodBasis} observed effective rate ${fmtNum(taxExp / pretax * 100)}% reflects a tax benefit and is excluded from the recurring forecast seed`
    : `${periodBasis} effective rate not computable (non-positive pre-tax income or missing tax expense)`;
  const rereadBasis = rereadTax === null ? null : `${periodBasis} effective rate re-read without tagged one-off items of ${fmtNum(inputs.unusualOperatingItems!.value)}: ${fmtNum(rereadTax.noTaxEffectPct)}% with no tax effect on them, ${fmtNum(rereadTax.marginalEffectPct)}% taxed at the ${fmtNum(taxFloor)}% marginal rate; year one ${fmtNum(rereadTax.pct)}% (${rereadTax.source === "marginal-reading" ? "no historical median: the marginal-rate reading" : `the company historical median ${fmtNum(historicalMedianTax!)}% held within that range`})`;
  if (rereadBasis) notes.push(rereadBasis);
  const companyTerminalTax = historicalMedianTax ?? currentTaxRate;
  if (currentTaxRate === null && companyTerminalTax === null) {
    gaps.push(
      gapEntry(
        "valuation.dcf.effectiveTaxRate",
        "no positive-pre-tax current or historical company tax rate — DCF suppressed instead of assuming a universal marginal rate",
        "critical",
      ),
    );
    return { assumptions: null, notes, gaps };
  }
  // D-58: a below-statutory effective rate (credits, deferrals, preferential
  // regimes) is not carried in perpetuity: the terminal rate converges toward
  // the marginal rate (Damodaran), never below the 15% global minimum (OECD
  /* D-98: Separate one-off tax effects from the evidenced operating tax assumption and disclose the basis. */

  const companyTax = companyTerminalTax as number;
  const taxTerminal = Math.max(companyTax, taxFloor);
  const companyTaxText = historicalMedianTax !== null ? "company historical median" : `${periodBasis} effective rate${rereadTax ? " re-read without tagged one-off items" : ""}`;
  const terminalTaxText = taxTerminal > companyTax
    ? `the ${companyTaxText} ${fmtNum(companyTax)}% floored at ${fmtNum(taxTerminal)}% = ${taxFloorText} (house rule: the terminal rate converges toward the marginal rate)`
    : `the ${companyTaxText} ${fmtNum(taxTerminal)}%, at or above the ${fmtNum(taxFloor)}% floor = ${taxFloorText}`;
  if (taxTerminal > companyTax) notes.push(`terminal tax rate floored: ${terminalTaxText}`);
  // D-60: management's effective-tax-rate guidance, when the same release
  /* D-60: Anchor the projection to the established revenue window and disclose the evidence used. */
  const guidedTax =
    guide !== null && isNum(guide.taxRatePct) && guide.taxRatePct >= 0 && guide.taxRatePct <= 50 ? guide.taxRatePct : null;
  const tEff = guidedTax ?? currentTaxRate ?? taxTerminal;
  if (currentTaxRate === null && guidedTax === null) {
    // The substitution is a note and a gap, as the margin fallback's is, and
    // the basis says no current rate was observed: it used to print "TTM
    // effective rate 22%" for an issuer with a pre-tax loss.
    notes.push(
      `${unavailableTaxReason} — tax path held at ${terminalTaxText}`,
    );
    gaps.push(
      gapEntry(
        "valuation.dcf.ttmTaxRate",
        `${unavailableTaxReason} — ${fmtNum(taxTerminal)}% (${companyTaxText} ${fmtNum(companyTax)}%, floor ${fmtNum(taxFloor)}%) is used for the whole path`,
        "info",
      ),
    );
  }
  const taxBasis =
    guidedTax !== null
      ? `guided GAAP effective rate ${fmtNum(guidedTax)}% (${guide?.taxRatePeriod ?? "guided period"}, ${guide?.source ?? "earnings release"})` +
        `${currentTaxRate === null ? "" : ` against the ${periodBasis} ${rereadTax ? "rate re-read without tagged one-off items," : "observed"} ${fmtNum(currentTaxRate)}%`}` +
        `${tEff === taxTerminal ? ` held flat: terminal rate is ${terminalTaxText}` : ` fading to ${fmtNum(taxTerminal)}% by year ${years}: ${terminalTaxText}`} (house rule: tax guidance sets year one)`
      : currentTaxRate === null
      ? `${unavailableTaxReason} — held at ${terminalTaxText} for all ${years} years`
      : tEff === taxTerminal
        ? `${rereadBasis ?? `${periodBasis} effective rate ${fmtNum(tEff)}%`} held flat: terminal rate is ${terminalTaxText}`
        : `${rereadBasis ?? `${periodBasis} effective rate ${fmtNum(tEff)}%`} fading to ${fmtNum(taxTerminal)}% by year ${years}: ${terminalTaxText}`;
  const qualifiedTaxBasis = inputs.incomeTtm?.taxEvidenceBasis;
  const taxRatePath = fadePath(tEff, taxTerminal, years);

  // --- Sales-to-capital ------------------------------------------------------
  const bal = inputs.balance;
  /* D-97: Remove operating leases only when filed evidence establishes their inclusion and scope. */
  const debtScopeRefusal = leaseDebtScopeRefusal(bal, true) === null ? null : leaseDebtScopeRefusal(bal, false);
  if (debtScopeRefusal) {
    gaps.push(gapEntry("valuation.dcf.salesToCapital", `${debtScopeRefusal} Raw lease-inclusive invested capital cannot support sales-to-capital; DCF withheld.`, "critical"));
    return { assumptions: null, notes, gaps };
  }
  const leaseExcluded = leaseDebtScopeRefusal(bal, true) !== null && bal !== null && isNum(bal.operatingLeaseLiability);
  // D-25, D-97, D-135: On the default lease setting, remove the operating slice from debt exactly
  // when the equity bridge removes it: it must be positive, inside total debt, and have proven
  // scope. Apply the partial-coverage lease guard first.
  const leaseOut = leaseExcluded || bal === null ? { amount: 0, note: null, clause: null } : operatingLeaseOutOfDebt(bal, inputs.includeLeasesInEv === true);
  const leaseBasis = { fcx1Excluded: leaseExcluded, includeLeasesInEv: inputs.includeLeasesInEv === true, currentRowExcludesLease: leaseOut.note === null };
  const icDebt = bal && bal.fieldConflicts?.totalDebt?.usable !== false && isNum(bal.totalDebt) ? bal.totalDebt - (leaseExcluded ? bal.operatingLeaseLiability as number : leaseOut.amount) : null;
  const liquidityResolution = bal?.cashConflictReconciled ? resolveNetDebt(bal) : null;
  const liquidity = bal?.cashConflictReconciled
    ? isNum(bal.totalDebt) && liquidityResolution?.value != null ? bal.totalDebt - liquidityResolution.value : null
    : bal?.fieldConflicts?.cashAndShortTermInvestments?.usable !== false &&
      bal?.fieldConflicts?.cashAndCashEquivalents?.usable !== false && isNum(bal?.cashAndShortTermInvestments)
      ? bal.cashAndShortTermInvestments : null;
  const admittedLiquidity = liquidity !== null;
  if (liquidityResolution?.cashBasis === "cash-only") notes.push(liquidityResolution.reason);
  const equity = resolveConsolidatedEquity(bal ?? {});
  // D-135: temporary equity (redeemable preferred and redeemable NCI) is financing capital. A
  // refused operand leaves the capital unknown, never zero (D-87): the DCF is withheld as it is for
  // missing equity.
  const temporary = temporaryEquityClaims(bal);
  const temporaryText = temporary !== null && temporary.capitalTotal !== 0 ? ` + temporary equity ${fmtMoney(temporary.capitalTotal)} [${temporary.capitalBasis}]` : "";
  const ic =
    bal && icDebt !== null && equity.value !== null && admittedLiquidity
      ? icDebt + equity.value + (temporary === null ? 0 : temporary.capitalTotal) - liquidity!
      : null;
  const mainCapitalGap = (lead: string, cause?: GapCause): ManifestEntry => gapEntry(
    "valuation.dcf.salesToCapital",
    `${lead} - this sales-to-capital DCF is suppressed instead of inventing a capital-efficiency input. An explicit operating-cash-flow model requires separately supported reinvestment assumptions; negative book capital alone does not prohibit valuation`,
    "critical",
    cause,
  );
  if (bal === null || ic === null) {
    const operand = (field: string) => `${({totalDebt:"total debt",cashAndShortTermInvestments:"cash and short-term investments",cashAndCashEquivalents:"cash and cash equivalents"} as Record<string,string>)[field] ?? field}${bal?.fieldConflicts?.[field]?.usable === false ? ` withheld (${bal.fieldConflicts[field]!.reason ?? "source conflict"})` : ""}`;
    const missing = bal === null ? ["balance row"] : [
      ...(icDebt === null ? [operand("totalDebt")] : []),
      ...(equity.value === null ? ["consolidated equity (total equity / parent stockholders equity)"] : []),
      ...(!admittedLiquidity ? [operand("cashAndShortTermInvestments"), ...(bal.fieldConflicts?.cashAndCashEquivalents?.usable === false ? [operand("cashAndCashEquivalents")] : [])] : []),
    ];
    const lead = liquidityResolution?.conflict ? `invested capital liquidity refused: ${liquidityResolution.reason}`
      : `balance-sheet fields missing for invested capital: ${missing.join(", ")}${bal ? ` at ${bal.date}` : ""}`;
    gaps.push(mainCapitalGap(lead, "invested-capital-balance-fields-missing"));
    return { assumptions: null, notes, gaps };
  }
  // D-135: If removing the proven operating lease empties otherwise positive invested capital, use
  // issuer history on the same lease basis or withhold the DCF. Never fall back to a
  // lease-inclusive mixed basis. Non-positive capital without a lease removal retains its existing
  // gap.
  let emptiedHistory: ReturnType<typeof establishedSalesToCapital> | null = null;
  if (ic <= 0) {
    if (!(leaseOut.amount > 0 && ic + leaseOut.amount > 0)) {
      gaps.push(mainCapitalGap("invested capital <= 0"));
      return { assumptions: null, notes, gaps };
    }
    const history = establishedSalesToCapital(inputs.incomeHistory, inputs.capitalHistory ?? null, leaseBasis);
    if (history.ratio === null) {
      /*
       * D-135: Withholding caused by lease-emptied invested capital is a warning rather than a
       * critical report-blocking gap.
       */
      gaps.push(gapEntry("valuation.dcf.salesToCapital",
        `${LEASE_EMPTIED_CAPITAL_LEAD}invested capital ${millions(ic)} is not positive once the operating lease ${millions(leaseOut.amount)} leaves debt (lease-excluded basis), and the issuer's own filed history does not establish a sales-to-capital ratio on that basis (${history.basis}) - ` +
        `this sales-to-capital DCF is withheld instead of falling back to the lease-inclusive basis`, "warn", "invested-capital-lease-emptied"));
      return { assumptions: null, notes, gaps };
    }
    emptiedHistory = history;
  }
  // Only after main's critical checks (a refused claim is zero in `ic` above, so those read as at main): a refused
  /* D-135: An unresolved temporary-equity operand withholds the per-share bridge and names the missing claim. */
  if (temporary !== null && temporary.refusal !== null) {
    /*
     * D-135: This return bypasses bridge checks that run only for a built DCF. Retain critical
     * lease-conflict and lease-scope gaps beside the invested-capital warning.
     */
    const leaseConflict = leaseDebtConflict(bal);
    if (leaseConflict !== null) gaps.push(gapEntry("valuation.dcf.leaseIntegrity", leaseConflict, "critical"));
    const scopeRefusal = leaseDebtScopeRefusal(bal, inputs.includeLeasesInEv === true);
    if (scopeRefusal) gaps.push(gapEntry("valuation.dcf.netDebt.leaseScope", scopeRefusal, "critical"));
    gaps.push(gapEntry("valuation.dcf.salesToCapital", `${TEMPORARY_EQUITY_REFUSAL_LEAD}${temporary.refusal} (balance ${bal.date.slice(0, 10)}) - invested capital for sales-to-capital cannot be established, so the DCF cannot be built without the claim's amount and is withheld instead of zero-filling it`, "warn", "invested-capital-temporary-equity-refused"));
    return { assumptions: null, notes, gaps };
  }
  // After the capital/claim refusals above so this warn cannot hide an existing critical. D-267
  // (P1, P13; revises D-65 for the fiscal-year fallback): when the model falls back to the
  // fiscal-year statement, the balance that supplies invested capital and the equity bridge must be
  // dated at that fiscal year end. D-135's bridge row is that balance when one is admitted
  // (`dcfBridgeRow`); when none is (none filed, incomplete, refused, or the anchor refused),
  // another date's balance would count flows twice or not at all and would set the fiscal year's
  // revenue against another date's capital, so the model value is withheld with the root cause
  // named. The typed cause routes it through the existing withheld-DCF path (P11). The
  // trailing-window route keeps its D-65 disclosure below (left for separate work; see D-267).
  const fallbackStatementDate = ttm?.basis === "annual" ? ttm.date ?? null : null;
  const fallbackOffsetDays = fallbackStatementDate !== null && bal !== null ? daysBetween(fallbackStatementDate, bal.date.slice(0, 10)) : null;
  if (ttm?.basis === "annual" && fallbackOffsetDays !== 0) {
    const balanceDate = bal.date.slice(0, 10);
    const cause = inputs.bridgeCause?.cause;
    const detail = inputs.bridgeCause?.detail ?? null;
    const offset = fallbackOffsetDays === null
      ? "date offset cannot be established because the statement or balance date is missing or unparseable"
      : fallbackOffsetDays > 0
      ? `${fallbackOffsetDays} days after the statement date, so flows between the two dates would be in both that balance and the first forecast window`
      : `${-fallbackOffsetDays} days before the statement date, so flows between the two dates would be in neither that balance nor the first forecast window`;
    const root = cause === "none-filed" ? `no balance sheet is filed at the fiscal-year statement date ${fallbackStatementDate}`
      : cause === "incomplete" ? `the balance sheet at the fiscal-year statement date ${fallbackStatementDate} lacks ${detail ?? "an operand the bridge reads"}`
      : cause === "statement-row-refused" ? `the balance sheet at the fiscal-year statement date ${fallbackStatementDate} is withheld (${detail ?? "refused"})`
      : cause === "anchor-refused" ? `the market EV's balance (${balanceDate}) is withheld${detail ? ` (${detail})` : ""}; a refused anchor is never replaced by another date's balance`
      : `the balance sheet the model reads is not dated at the fiscal-year statement date ${fallbackStatementDate}`;
    /**
     * D-135: This return bypasses `valueCompany` bridge checks, so preserve the applicable bridge
     * gaps here.
     */
    const leaseConflict = leaseDebtConflict(bal);
    if (leaseConflict !== null) gaps.push(gapEntry("valuation.dcf.leaseIntegrity", leaseConflict, "critical"));
    const scopeRefusal = leaseDebtScopeRefusal(bal, inputs.includeLeasesInEv === true);
    if (scopeRefusal) gaps.push(gapEntry("valuation.dcf.netDebt.leaseScope", scopeRefusal, "critical"));
    const balanceLabel = cause === "anchor-refused" ? "the retained balance" : "the only admitted balance";
    gaps.push(gapEntry("valuation.dcf.bridgeBalanceDate",
      `${root}; ${balanceLabel} is ${balanceDate}, ${offset}. On the fiscal-year fallback, invested capital and the equity bridge must be dated at the statement date, ` +
      "so this DCF is withheld instead of mixing dates", "warn", "dcf-balance-date-mismatch"));
    return { assumptions: null, notes, gaps };
  }
  // D-60: long-term investments (strategic and non-marketable stakes, long
  // marketable securities) are non-operating: their income is below the EBIT
  // this DCF projects, so they are not capital the operating path earns on.
  /* D-104: Remove established non-operating investments from the operating sales-to-capital denominator. */
  const filedLti = isNum(bal.longTermInvestments) && bal.longTermInvestments > 0 ? bal.longTermInvestments : 0;
  const operatingStake = inputs.equityMethodStake?.treatment === "operating" ? Math.min(filedLti, Math.max(0, inputs.equityMethodStake.value)) : 0;
  const lti = filedLti - operatingStake > 0 ? filedLti - operatingStake : null;
  const operatingIc = lti !== null && ic - lti > 0 ? ic - lti : null;
  const holdingExceedsCapital = emptiedHistory === null && lti !== null && operatingIc === null;
  const exceedsBasis = holdingExceedsCapital
    ? `operating invested capital ${millions(ic - (lti as number))} is not positive once long-term investments ${millions(lti as number)} are removed, so the operating ratio is unbounded and takes the house cap ${S2C_CLAMP[1]} (the limit it approaches from below); the holding is added back in the bridge (house rule)`
    : null;
  const exceedsHoldingClause = `the holding meets or exceeds operating invested capital, so sales-to-capital takes the house cap ${S2C_CLAMP[1]} and the holding is added back here`;
  const emptiedHoldingClause = "sales-to-capital takes the issuer's own history because invested capital is not positive once the operating lease leaves debt";
  const capitalDefinition = `invested capital (total debt + consolidated equity [${equity.basis}]${temporaryText} - cash and short-term investments, ${bal.basis} balance as of ${bal.date}; ${equity.reason})`;
  /* D-104: Establish sales-to-capital from compatible filed history before using it in valuation. */
  const s2cHistory = emptiedHistory ?? establishedSalesToCapital(inputs.incomeHistory, inputs.capitalHistory ?? null, leaseBasis);
  /* Capital efficiency uses reported flows; only the DCF starting flows are annualised. */
  const rawS2c = emptiedHistory !== null ? emptiedHistory.ratio as number : holdingExceedsCapital ? S2C_CLAMP[1] : filedRevenue / (operatingIc ?? ic);
  const s2cFloor = s2cHistory.ratio !== null && s2cHistory.ratio < S2C_CLAMP[0] ? s2cHistory.ratio : S2C_CLAMP[0];
  const s2c = s2cFloor === S2C_CLAMP[0] ? clampWithNote(rawS2c, S2C_CLAMP[0], S2C_CLAMP[1], "sales-to-capital", notes)
    : clampWithNote(rawS2c, s2cFloor, S2C_CLAMP[1], "sales-to-capital", notes, `the issuer's filed-history floor ${fmtNum(s2cFloor)} in place of the house floor ${S2C_CLAMP[0]}; house cap ${S2C_CLAMP[1]}`);
  let s2cBasis = exceedsBasis !== null
    ? `sales-to-capital is the house cap ${S2C_CLAMP[1]}, not a measured ratio; ${capitalDefinition} less long-term investments: ${exceedsBasis}`
    : operatingIc !== null
    ? `${periodBasis} revenue / operating invested capital (total debt + consolidated equity [${equity.basis}]${temporaryText} - cash and short-term investments - long-term investments ${fmtMoney(lti as number)}, ${bal.basis} balance as of ${bal.date}; ${equity.reason}; long-term investments are treated as non-operating assets, and the equity bridge adds them back at carrying value less the tax a sale would owe)`
    : `${periodBasis} revenue / ${capitalDefinition}`;
  if (bal.leaseCoverageNote) s2cBasis += ` Retained total-debt operand ${bal.totalDebt} (source monetary units): ${bal.leaseCoverageNote}`;
  if (leaseExcluded) s2cBasis += ` Invested capital excludes the disclosed operating-lease portion ${bal.operatingLeaseLiability} (source monetary units): the lease-inclusive total is unavailable, so debt is taken on the lease-excluded basis.`;
  else if (leaseOut.amount > 0) s2cBasis += ` The operating-lease liability ${millions(leaseOut.amount)} removed: its cost is inside the EBIT this DCF projects (ASC 842).`;
  else if (leaseOut.clause !== null) s2cBasis += ` The operating lease is not removed from invested capital: ${leaseOut.clause}; total debt is used as reported.`;
  else if (leaseBasis.includeLeasesInEv && isNum(bal.operatingLeaseLiability) && bal.operatingLeaseLiability > 0) s2cBasis += ` The operating lease ${millions(bal.operatingLeaseLiability)} is kept in invested capital: METIS_EV_INCLUDE_LEASES keeps it in debt, as the equity bridge does.`;
  if (emptiedHistory !== null) {
    s2cBasis = `sales-to-capital ${s2c.toFixed(4)}x is the median of the issuer's own filed fiscal-year ratios on the lease-excluded basis: invested capital ${millions(ic)} is not positive once the operating lease ${millions(leaseOut.amount)} leaves debt, ` +
      `so the ${bal.basis} balance as of ${bal.date} cannot establish a ratio and the lease is not put back (${emptiedHistory.basis})${s2c !== rawS2c ? `; held to the house cap ${S2C_CLAMP[1]}` : ""}` +
      `${lti !== null ? `; long-term investments ${fmtMoney(lti)} are treated as non-operating assets, and the equity bridge adds them back at carrying value less the tax a sale would owe` : ""}`;
  } else if (s2c !== rawS2c && s2cFloor !== S2C_CLAMP[0] && rawS2c < s2cFloor) s2cBasis = `model input used ${s2c.toFixed(4)}x; raw ratio ${rawS2c.toFixed(4)}x = revenue ${filedRevenue} / ${operatingIc !== null ? "operating " : ""}invested capital ${operatingIc ?? ic} (source monetary units). ` +
    `Applied lower floor ${s2c.toFixed(4)}x, the issuer's own filed history in place of the house floor ${S2C_CLAMP[0]}: ${s2cHistory.basis}. Forecast reinvestment uses the applied ratio, not the raw ratio. Raw-input basis: ${s2cBasis}`;
  else if (s2c !== rawS2c) s2cBasis = `model input used ${s2c.toFixed(4)}x; raw ratio ${rawS2c.toFixed(4)}x = revenue ${filedRevenue} / ${operatingIc !== null ? "operating " : ""}invested capital ${operatingIc ?? ic} (source monetary units). ` +
    `Applied ${rawS2c > S2C_CLAMP[1] ? "upper cap" : "lower floor"} ${s2c.toFixed(4)}x within house-policy range [${S2C_CLAMP[0]}, ${S2C_CLAMP[1]}]: a house input guard against extreme or mis-scaled capital-efficiency inputs, not an observed economic limit or a calibrated capital-productivity estimate. Forecast reinvestment uses the applied ratio, not the raw ratio. Raw-input basis: ${s2cBasis}` +
    `${rawS2c < S2C_CLAMP[0] ? ` Floor basis: ${s2cHistory.basis}.` : ""}`;
  else if (rawS2c < S2C_CLAMP[0]) s2cBasis += ` The house floor ${S2C_CLAMP[0]} does not apply: ${s2cHistory.basis}.`;
  if (operatingStake > 0) s2cBasis += ` The equity-method stake ${millions(operatingStake)} stays in operating capital: its income is inside EBIT but unmeasured (FIN-401).`;

  // --- Terminal economics ----------------------------------------------------
  const terminal = terminalRoic(inputs.waccPct, inputs.roicHistory ?? null);
  if (normalizedYears) terminal.basis += `; terminal evidence uses operating income excluding admitted tagged one-off items (${normalizedYears}); reported GAAP ROIC is unchanged`;
  if (inputs.recurringOperatingItemsBasis) terminal.basis += `; ${inputs.recurringOperatingItemsBasis}`;
  if (terminal.note !== null) notes.push(terminal.note);
  /* D-19: say which cost of capital each ROIC year was measured against, in the notes AND in the manifest when it was not the year's own WACC. */
  if (terminal.waccBasisNote !== null) notes.push(terminal.waccBasisNote);
  if (terminal.waccBasis === "current") {
    gaps.push(
      gapEntry(
        "valuation.dcf.terminalRoic.waccBasis",
        "no per-fiscal-year risk-free observation was available, so the ROIC-vs-WACC evidence behind the terminal excess-return house convention compares every fiscal year to the CURRENT WACC",
        "info",
      ),
    );
  }
  const roicTerm = terminal.roicTermPct;
  const reinvestRate = roicTerm > 0 ? gTerm / roicTerm : 0;

  /* D-19: SBC treatment, stated in the assumption block with the size of the adjustment to the reported free-cash-flow metric. */
  const sbcInfo = inputs.fcfSbc ?? null;
  const sbcBasis =
    sbcInfo === null || sbcInfo.beforeSbc === null
      ? "Stock-based compensation is expensed inside the EBIT this DCF projects, so it is never added back here; the reported free-cash-flow SBC adjustment is not established. The FCFF path derives from revenue, EBIT margin and reinvestment, not from the free-cash-flow metric, so the two are consistent but not the same series."
      : sbcInfo.sbc === null
        ? `Stock-based compensation is expensed inside the EBIT this DCF projects, so it is never added back here; SBC is not established, so it is not deducted from the reported free-cash-flow metric. The FCFF path derives from revenue, EBIT margin and reinvestment, not from the free-cash-flow metric, so the two are consistent but not the same series. Reported free cash flow as of ${sbcInfo.asOf ?? "?"}: ${fmtNum(sbcInfo.beforeSbc)}, UNADJUSTED — stock-based compensation is not established.`
        : `Stock-based compensation is expensed inside the EBIT this DCF projects, so it is never added back here; the reported free-cash-flow metric subtracts it as well (house default). The FCFF path derives from revenue, EBIT margin and reinvestment, not from the free-cash-flow metric, so the two are consistent but not the same series. Reported free cash flow as of ${sbcInfo.asOf ?? "?"}: ${fmtNum(sbcInfo.beforeSbc)} before SBC → ${fmtNum(sbcInfo.afterSbc as number)} after subtracting SBC of ${fmtNum(sbcInfo.sbc)}.`;
  notes.push(sbcBasis);

  // D-60: the ceiling the bull/bear margin shocks may not cross. The scenario
  // construction text states it; it does not bind the base path.
  const scenarioCeiling = scenarioMarginCeiling(normalizedTtm, normalizedHistory);

  // D-65: the explicit windows start the day after the statement date, so the
  // flows are discounted to that date; the price they are compared with is a
  // later quote. Rolling the value forward at the WACC states it at the quote
  // date. The bridge stays at the statement-date balance: cash generated since
  // then is inside the first window's flows, not double counted.
  const statementDate = ttm?.date ?? null;
  // D-135: the bridge row is the statement-date balance when one exists (`dcfBridgeRow`); when none
  // does, the text names the balance actually used and which side of the statement date it falls
  // on, never the D-65 sentence.
  const bridgeOffsetDays = statementDate !== null ? daysBetween(statementDate, bal.date.slice(0, 10)) : null;
  const bridgeDate = bal.date.slice(0, 10);
  const bridgeCause = inputs.bridgeCause?.cause;
  const bridgeDetail = inputs.bridgeCause?.detail ?? null;
  const keeps = bridgeCause === "statement-row-refused" || bridgeCause === "anchor-refused";
  const dayClause = bridgeOffsetDays === null || bridgeOffsetDays === 0 ? null
    : bridgeOffsetDays > 0
      ? `${bridgeOffsetDays} days after the statement date; flows between the two dates are in both that balance and the first window`
      : `${-bridgeOffsetDays} days before the statement date; flows between the two dates are in neither that balance nor the first window`;
  const bridgeBalanceText = dayClause === null ? null : `the equity bridge ${keeps ? "keeps" : "uses"} the ${bridgeDate} balance, ${dayClause}`;
  if (bridgeBalanceText !== null) {
    const lead = bridgeCause === "none-filed" ? `no balance sheet is filed at the statement date ${statementDate}`
      : bridgeCause === "incomplete" ? `the balance sheet at the statement date ${statementDate} lacks ${bridgeDetail ?? "an operand the bridge reads"}`
      : bridgeCause === "statement-row-refused" ? `the balance sheet at the statement date ${statementDate} is withheld (${bridgeDetail ?? "refused"})`
      : bridgeCause === "anchor-refused" ? null
      : `the balance sheet the bridge reads is not dated at the statement date ${statementDate}`;
    gaps.push(gapEntry("valuation.dcf.bridgeBalanceDate",
      lead === null
        ? `the market EV's balance (${bridgeDate}) is withheld${bridgeDetail ? ` (${bridgeDetail})` : ""}, so the equity bridge keeps it and the DCF stays withheld as before; that balance is ${dayClause}`
        : `${lead}; ${bridgeBalanceText}`, "info"));
  }
  const elapsedDays = statementDate !== null && inputs.valuationDate ? daysBetween(statementDate, inputs.valuationDate) : null;
  const annualFallbackBasis = ttm?.basis === "annual"
    ? `Annual fallback: statement ${statementDate}; price ${inputs.valuationDate ?? "date unavailable"}; equity-bridge balance ${bridgeDate}` +
      (elapsedDays === null ? "." : `; statement age at price ${elapsedDays} days.`) +
      ` Balance changes after ${bridgeDate} are not reflected in this equity bridge; the dated annual fallback carries that uncertainty.`
    : null;
  if (annualFallbackBasis) notes.push(annualFallbackBasis);
  let valuationDate: DcfAssumptions["valuationDate"] | undefined;
  if (elapsedDays !== null && elapsedDays > 0 && elapsedDays <= MAX_ROLL_FORWARD_DAYS) {
    const elapsedYears = elapsedDays / DAYS_PER_YEAR;
    const factor = Math.pow(1 + inputs.waccPct / 100, elapsedYears);
    valuationDate = {
      value: inputs.valuationDate as string,
      elapsedYears,
      basis: `cash flows are discounted from the statement date ${statementDate} and rolled forward ${elapsedDays} days to the quote date ${inputs.valuationDate} ` +
        `at the WACC (× ${factor.toFixed(4)}), so the per-share value and the price it is compared with share a date; ${bridgeBalanceText ?? `the equity bridge stays at the ${statementDate} balance, ` +
        "whose later cash generation is inside the first window's flows"} (house rule)`,
    };
    notes.push(`Valuation date: ${valuationDate.basis}`);
  } else if (elapsedDays !== null && elapsedDays > MAX_ROLL_FORWARD_DAYS) {
    notes.push(`Valuation date: the quote ${inputs.valuationDate} is ${elapsedDays} days after the statement date ${statementDate}, beyond the ${MAX_ROLL_FORWARD_DAYS}-day roll-forward limit; the value is stated at the statement date${bridgeBalanceText === null ? "" : `, and ${bridgeBalanceText}`} (house rule)`);
    gaps.push(gapEntry("valuation.dcf.valuationDate", `quote ${elapsedDays} days after the statement date — value not rolled forward`, "info"));
  }

  const assumptions: DcfAssumptions = {
    ...(ttm?.date ? { forecastPeriod: {
      basis: ttm.basis === "annual" ? "fiscal-year" as const : "rolling-12-month" as const,
      anchorEndDate: ttm.date,
      anchorStartDate: forecastYearPeriod(ttm.date, 0, "rolling-12-month")?.startDate ?? null,
    } } : {}),
    startRevenue: { value: startRev, basis: `${periodBasis} revenue as of ${ttm?.date ?? "?"}` +
      (annualFallbackBasis ? `. ${annualFallbackBasis}` : "") +
      (baseFactor === 1 ? "" : `; 53-week ${periodBasis} on a 52-week basis (× 52/53), all base-period flows and tagged one-offs scaled together`) },
    years,
    wacc: {
      value: inputs.waccPct,
      basis: inputs.waccBasis ?? `WACC ${fmtNum(inputs.waccPct)}% (inputs not supplied to the assumption block)`,
    },
    sbc: {
      value: inputs.fcfSbc ?? {
        beforeSbc: null,
        afterSbc: null,
        sbc: null,
        asOf: null,
        basis: "free-cash-flow SBC treatment not supplied to the assumption block",
      },
      basis: sbcBasis,
    },
    growthAnchor,
    revenueAnchor,
    growthPath: {
      value: growthPath,
      basis:
        `year one ${fmtNum(growthPath[0])}% from the revenue anchor (${revenueAnchor.source === "consensus" ? "analyst consensus" : revenueAnchor.source})` +
        (anchoredGrowth.length >= 2
          ? `, ${anchoredGrowth.length === 2 ? "year two" : `years 2–${anchoredGrowth.length}`} ${anchoredGrowth.slice(1).map((g) => `${fmtNum(g)}%`).join(", ")} on consensus` +
            ` (consensus anchors ${consensusYearsText(revenueAnchor.consensusYears ?? [])}; house rule)`
          : revenueAnchor.source === "consensus" ? " (consensus anchors year one only)" : "") +
        "; " +
        `later years follow a convergent fade from year ${anchoredGrowth.length}'s ${fmtNum(lastAnchored)}% to the terminal rate ${fmtNum(gTerm)}% in year ${years}: ` +
        `the excess over the terminal rate decays geometrically with a ${GROWTH_FADE_HALF_LIFE_YEARS}-year half-life, rescaled so it closes exactly in year ${years}, ` +
        `so it falls somewhat faster than halving every ${GROWTH_FADE_HALF_LIFE_YEARS} years (house rule; the linear fade is retired). ` +
        (rateSetsYearOne
          ? `Year one carries the near-term growth rate ${fmtNum(gMid)}% = ${gMidBasis}. `
          : "") +
        "The year-one revenue anchor and the near-term growth rows state their own bases.",
    },
    ebitMarginPath: { value: marginPath, basis: marginBasis + (ttm?.operatingBasis ? `; ${ttm.operatingBasis}` : "") +
      (inputs.operatingNormalizationBasis ? `; excludes ${inputs.operatingNormalizationBasis}` : "") },
    ...(improvingBound !== null && cappedTarget > m0 ? { improvingMarginFade: { currentPct: m0, targetPct: cappedTarget } } : {}),
    taxRatePath: { value: taxRatePath, basis: [taxBasis, qualifiedTaxBasis].filter(Boolean).join("; ") },
    salesToCapital: { value: s2c, basis: s2cBasis },
    terminal: {
      gTermPct: { value: gTerm, basis: gTermBasis },
      roicTermPct: {
        value: roicTerm,
        basis: terminal.waccBasisNote === null ? terminal.basis : `${terminal.basis}; ${terminal.waccBasisNote}`,
      },
      reinvestmentRate: {
        value: reinvestRate,
        basis: "terminal reinvestment = terminal growth / terminal return on invested capital (Damodaran consistency rule)",
      },
    },
    midYear: { value: true, basis: MID_YEAR_DISCOUNTING_BASIS },
    scenarioMarginCeiling: scenarioCeiling,
    ...(valuationDate ? { valuationDate } : {}),
    ...(lti !== null ? { nonOperatingInvestments: { value: lti, balanceDate: bal.date,
      ...(operatingStake > 0 || exceedsBasis !== null || emptiedHistory !== null ? { basis: [
        ...(operatingStake > 0 ? [`only the remaining non-operating investments ${millions(lti)} are removed; the equity-method stake ${millions(operatingStake)} stays in operating capital`] : []),
        ...(exceedsBasis !== null ? [exceedsHoldingClause] : emptiedHistory !== null ? [emptiedHoldingClause] : []),
      ].join("; ") } : {}) } } : {}),
    investmentTax: { ratePct: taxFloor, basis: taxFloorText },
    asOf: { statements: ttm?.date ?? null, estimates: analyst.asOf },
    notes,
  };
  if (liquidityResolution?.cashBasis === "cash-only") gaps.push({ field: "valuation.dcf.cashBasis", reason: `${bal?.date}: ${liquidityResolution.reason}`, severity: "info" });
  /* D-300: Expose qualified tax operands beside the tax basis so the reader can assess the evidence. */
  if (qualifiedTaxBasis) gaps.push(gapEntry(DCF_TAX_OPERANDS_FIELD, qualifiedTaxBasis, "info"));
  return { assumptions, notes, gaps };
}
export { DAYS_PER_YEAR };
