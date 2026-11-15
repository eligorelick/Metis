/** Financial-route excess returns and tangible-book comparison; converge payout consistently (P14, P16; D-102). */
import { type ConvertibleInstrument, type ConvertibleReading, foldConvertiblePreferred, convertibleVariants, convertibleReadingGaps } from "@/pipeline/stageB/convertibles";
import { type DcfRoicYear, DAYS_PER_YEAR, terminalRoic } from "./assumptions";
import { type Assumption, posOrNull, isNum, fmtNum, TERMINAL_G_CAP_PCT, EXCESS_RETURN_YEARS, gapEntry, clampWithNote, PAYOUT_CLAMP_PCT, TV_GUARD_PP, fadePath, EXCESS_RETURN_START_GAP_PP, safeDiv, REVERSE_ROE_RANGE_PCT } from "./primitives";
import { type FinancialValuationAssumptions, describeFinancialValuation } from "@/pipeline/stageB/valuationAssumptions";
import { type ManifestEntry } from "@/types/core";
import { daysBetween } from "./consensus";
import { MAX_ROLL_FORWARD_DAYS, classifyValuationDateUse, valuationUseExplanation } from "@/pipeline/stageB/valuationUse";
import { MODEL_TANGIBLE_COMMON_BASIS } from "@/pipeline/stageB/returns";
import { bisect } from "./sensitivity";


// ---------------------------------------------------------------------------
// Excess-return model (banks / insurers) — Damodaran equity-only model
// ---------------------------------------------------------------------------

export interface ExcessReturnInputs {
  /** Actual quote observation for the reverse solve, separate from requested model dating. */
  quoteAsOf?: string | null;
  /** Scenario-only admission; leaves the existing forward fair value untouched. */
  scenarioBookEvidence?: {
    openingBookRefusal: string | null;
    tangibleBookRefusal: string | null;
    historyRefusal: string | null;
  };
  valuationDate?: string | null;
  convertibles?: ConvertibleInstrument[];
  totalDebt?: number | null;
  convertiblePreferredClaim?: number | null;
  permanentPreferred?: number | null;
  preferredSeriesDistinct?: boolean;
  /** BV0: equity on the same ownership/asset basis as currentRoePct. */
  bookValue: number | null;
  bookValueRefusal?: string | null;
  bookValueBasisDetail?: string | null;
  /** Production financial routes value only the equity belonging to common holders. */
  bookValueBasis?: "tangible-common-equity" | "common-equity";
  /** Current ROE, percent — TTM unless `currentRoeBasis` says otherwise. */
  currentRoePct: number | null;
  /**
   * Which figure `currentRoePct` actually is. The keyless path has no FMP
   * key-metrics-TTM row and falls back to the latest fiscal-year DuPont ROE
   * (net income / average fiscal-year equity), so the printed assumption must
   * not keep calling that "TTM ROE". Defaults to `"ttm"`.
   */
  currentRoeBasis?: "ttm" | "fiscal-year-dupont" | "fiscal-year-rote" | "fiscal-year-common-roe" | "ttm-rote" | "ttm-common-roe";
  /** Fiscal-year end for any annual return basis; the window's end for a trailing one. */
  currentRoeAsOf?: string | null;
  /**
   * D-102 (the trailing excess-return start): the fiscal-year start the model did not use, when it
   * starts from the trailing four quarters. It is valued with the same fade, terminal target and
   * payout from its own fiscal-year book value, and shown beside the headline when the two starts
   * differ by more than EXCESS_RETURN_START_GAP_PP.
   */
  startAlternative?: {
    roePct: number;
    basis: "fiscal-year-rote" | "fiscal-year-common-roe";
    asOf: string | null;
    bookValue: number;
    /** Preferred claims on this book date; absent means no dated claim. */
    convertiblePreferredClaim?: number | null;
    permanentPreferred?: number | null;
    preferredSeriesDistinct?: boolean;
  } | null;
  /**
   * Optional caller override of the TERMINAL ROE (percent). Without an override,
   * the terminal target follows roeHistory's evidenced-excess convention, or
   * defaults to cost of equity when that evidence is absent or insufficient.
   * Production supplies history rather than an analyst override (compute.ts).
   */
  analystImpliedRoePct?: number | null;
  /**
   * Cost of equity, percent. Null (e.g. risk-free-rate fetch failed upstream) SUPPRESSES the model
   * with a critical gap — a discount rate is never defaulted (P10; mirrors the DCF's WACC guard).
   */
  costOfEquityPct: number | null;
  /** Explicit horizon; default 10. */
  years?: number;
  /** Dividend + buyback payout as % of net income; missing history suppresses. */
  payoutRatioPct?: number | null;
  dilutedShares?: number | null;
  /** Quote price, on the same currency and admitted share basis as the forward per share. */
  price?: number | null;
  /** Reverse-solve fallback when price or diluted shares is unavailable; same currency as bookValue. */
  marketCap?: number | null;
  asOf?: string | null;
  /*
   * D-16: tangible common equity (equity − goodwill − other intangibles − preferred) for the
   * P/TBV-against-ROTE pairing. Optional; without it the pairing is withheld with a reason rather
   * than falling back to plain book value, which would flatter a goodwill-heavy acquirer.
   */
  tangibleCommonEquity?: number | null;
  /** Balance date of the tangible equity used in the P/TBV pairing. */
  tangibleCommonEquityAsOf?: string | null;
  /** D-17: return on tangible common equity, percent — the return P/TBV is read against. */
  rotePct?: number | null;
  roteAsOf?: string | null;
  roteSource?: "computed.returns.commonReturnTtm" | "computed.returns.rote";
  /**
   * Risk-free rate, percent, for the sustainable-growth cap in the justified
   * P/TBV cross-check. The house rule (same one the DCF terminal value obeys)
   * is that nothing grows faster than the risk-free rate forever, so
   * g = min(ROTE x retention, TERMINAL_G_CAP_PCT, riskFree). When it is absent
   * the cap falls back to TERMINAL_G_CAP_PCT alone and the basis says so — no
   * rate is ever invented.
   */
  riskFreePct?: number | null;
  /**
   * Fiscal-year history of the SAME return `currentRoePct` measures (ROTE for
   * banks, common ROE otherwise), each year against that year's own cost of
   * equity in `waccPct`. When supplied, the DCF's terminal excess-return house
   * convention (`terminalRoic`) applies to the fade target: a return that beat
   * the cost of equity in every one of the last 4+ years keeps half its median
   * spread (capped at 5pp) in perpetuity. Absent, ROE fades to the cost of
   * equity exactly as before.
   */
  roeHistory?: DcfRoicYear[] | null;
}

/** D-17: the multiple a financial's price is actually read on, beside the return that justifies it. */
export interface PriceToTangibleBookVsRote {
  /** Optional for callers and legacy results predating explicit pairing dates. */
  asOf?: string | null;
  roteAsOf?: string | null;
  roteSource?: string;
  /** market cap / tangible common equity. */
  pTbv: number | null;
  /** Return on tangible common equity, percent. */
  rotePct: number | null;
  /**
   * A STABLE-GROWTH cross-check: (ROTE − g) / (CoE − g), the Gordon-form
   * justified multiple, with g = min(ROTE × retention, the terminal-growth cap,
   * the risk-free rate). It is NOT the forward excess-return model read as a
   * multiple: that model follows its evidenced terminal target and separately
   * disclosed continuing value, while this identity assumes a constant ROTE in
   * perpetuity. The two rest on different assumptions and can disagree; the
   * basis string says so. Null when the identity does not hold.
   */
  justifiedPTbv: number | null;
  /** pTbv − justifiedPTbv; positive = the market pays more than the return supports. */
  premiumToJustified: number | null;
  basis: string;
  /** Non-null when the pairing (or the justified multiple) was withheld. */
  withheldReason: string | null;
}

function withholdPriceToTangibleBook(p: PriceToTangibleBookVsRote, reason: string): PriceToTangibleBookVsRote {
  return { ...p, pTbv: null, premiumToJustified: null,
    withheldReason: `${reason} — P/TBV sets the quote-currency market cap against statement-currency tangible equity, so it and its premium are withheld; justified P/TBV uses statement figures only` };
}

/** D-102: the excess-return value from the start the model did not use. */
export interface ExcessReturnStartAlternative {
  basis: "fiscal-year-rote" | "fiscal-year-common-roe";
  asOf: string | null;
  startRoePct: number;
  bookValue: number;
  equityValue: number;
  perShare: number | null;
  /** Alternative start minus the start used, percentage points. */
  differencePp: number;
  /** True when |differencePp| > EXCESS_RETURN_START_GAP_PP: the value is printed beside the headline. */
  besideHeadline: boolean;
  /** e.g. "FY 2025-12-31 ROTE start 4.2%". */
  label: string;
}

/**
 * D-102 (the excess-return grid): per-share value for three starting returns against the cost of
 * equity ±1pp. Each row carries the book value it starts from; the centre cell is the headline.
 */
export interface ExcessReturnGrid {
  rows: { label: string; startReturnPct: number; bookValue: number }[];
  costOfEquityPcts: number[];
  perShare: (number | null)[][];
  notes: string[];
}

/**
 * Rows of the D-102 grid without a fiscal-year alternative: the start, and this many pp either
 * side.
 */
export const EXCESS_RETURN_GRID_START_STEP_PP = 5;
/** Columns of the D-102 grid: the cost of equity, and this many pp either side. */
export const EXCESS_RETURN_GRID_COE_STEP_PP = 1;

export interface ExcessReturnResult {
  /** Measurement period of the selected return, distinct from opening book. */
  currentRoeAsOf?: string | null;
  /** D-193: own-record evidence retained for deterministic financial scenarios. */
  scenarioEvidence?: {
    bookEvidence?: ExcessReturnInputs["scenarioBookEvidence"];
    bookValueBasis: ExcessReturnInputs["bookValueBasis"] | null;
    returnHistory: DcfRoicYear[];
    dilutedShares: number | null;
    tangibleBookPerShare: number | null;
    tangibleBookAsOf: string | null;
  };
  valuationDate?: { value: string; elapsedYears: number; basis: string };
  convertibles?: ConvertibleReading[];
  equityValue: number | null;
  perShare: number | null;
  /** equityValue / BV0 — sanity anchor vs (ROE - g)/(CoE - g). */
  impliedPToBv: number | null;
  roePathPct: Assumption<number[]>;
  payoutRatioPct: Assumption<number | null>;
  /** D-17: the explicit horizon the excess returns are summed over. */
  horizonYears: Assumption<number>;
  /** D-17: the discount rate — the cost of EQUITY, never a WACC. */
  costOfEquityPct: Assumption<number | null>;
  /** D-17: opening book equity the model builds on. */
  openingBookValue: Assumption<number | null>;
  /** D-17: P/TBV against ROTE — the pairing a financial is actually judged on. */
  priceToTangibleBookVsRote: PriceToTangibleBookVsRote;
  /** BV_0 .. BV_N under retention compounding. */
  bookValuePath: number[];
  /**
   * Year-N economic profit in currency: (ROE_N − CoE) · BV_{N-1}. Zero when ROE
   * fades to CoE (the default); nonzero when `roeHistory` evidences durable
   * excess returns or a caller overrides the terminal ROE via
   * analystImpliedRoePct. Computed, never assumed.
   */
  terminalExcess: number | null;
  /** Additive: legacy objects may not retain these forward parameters. */
  financialAssumptions?: FinancialValuationAssumptions;
  reverseSolve: { impliedCurrentRoePct: number | null; notes: string[]; basis?: "price-per-diluted-share" | "market-cap" };
  /** D-102: present when the model started from the trailing four quarters and a fiscal-year start exists. */
  startAlternative?: ExcessReturnStartAlternative;
  /** D-102: start-return × cost-of-equity sensitivity; absent without a per-share denominator. */
  startCoeGrid?: ExcessReturnGrid;
  asOf: string | null;
  notes: string[];
  gaps: ManifestEntry[];
}

/**
 * D-102 (owner decision): the payout the continuing value assumes. Residual income growing at g
 * needs book growing at g, a retention of g / ROE_T, so the steady-state payout is 1 − g / ROE_T
 * (Damodaran's stable-growth consistency), clamped to 0-100%. A terminal return at or below zero
 * funds no payout.
 */
export function steadyStatePayoutPct(terminalRoePct: number, gPct: number): number {
  if (terminalRoePct <= 0) return 0;
  return Math.min(100, Math.max(0, (1 - gPct / terminalRoePct) * 100));
}

/**
 * Core: BV_t = BV_{t-1}(1 + ROE_t * retention_t); value = BV0 + sum PV(excess),
 * plus — only when evidenced excess returns are carried past the horizon — the
 * continuing value of the year-N+1 residual income growing at g:
 * CV_N = (ROE_T − CoE) · BV_N / (CoE − g), discounted N years. The payout is
 * given per year (it fades to the steady state).
 */
export function excessReturnValue(
  bv0: number,
  roePathPct: number[],
  coePct: number,
  payoutPathPct: number[],
  continuing: { excessPp: number; gPct: number } | null = null,
): { equityValue: number; bookValuePath: number[]; continuingValuePv: number } {
  const coe = coePct / 100;
  const bookValuePath: number[] = [bv0];
  let bv = bv0;
  let pvExcess = 0;
  for (let t = 1; t <= roePathPct.length; t++) {
    const roe = roePathPct[t - 1] / 100;
    const retention = 1 - payoutPathPct[t - 1] / 100;
    const excess = (roe - coe) * bv;
    pvExcess += excess / Math.pow(1 + coe, t);
    // A LOSS is retained in full. `roe * retention` on a negative ROE returns a
    // fraction of the loss to book value — arithmetically a capital injection
    // proportional to the loss, because `payout x negative earnings` is a
    // negative dividend. Dividends are not negative; a loss reduces book value
    // by its whole amount. Only positive earnings are shared with holders.
    const bvGrowth = roe < 0 ? roe : roe * retention;
    bv = bv * (1 + bvGrowth);
    bookValuePath.push(bv);
  }
  let continuingValuePv = 0;
  if (continuing !== null && continuing.excessPp > 0) {
    const n = roePathPct.length;
    const cv = ((continuing.excessPp / 100) * bv) / (coe - continuing.gPct / 100);
    continuingValuePv = cv / Math.pow(1 + coe, n);
  }
  return { equityValue: bv0 + pvExcess + continuingValuePv, bookValuePath, continuingValuePv };
}

/*
 * D-16: D-102: Use the evidenced starting return and converge payout to the terminal return and
 * growth assumptions. P/TBV read against ROTE — the pair a bank, insurer or mortgage REIT is
 * actually judged on, and the one the route's `lead` list has named all along. Tangible common
 * equity is the denominator, not book equity: goodwill and other intangibles absorb losses only
 * after common equity is gone, so a goodwill-heavy acquirer trading at 1.0x BOOK can be at 2.0x
 * tangible book, and comparing that multiple against a return computed on tangible equity (ROTE)
 * would be comparing two different denominators. The justified multiple is a STABLE-GROWTH
 * cross-check, (ROTE − g) / (CoE − g) — the Gordon form of the residual-income identity, which
 * assumes a constant ROTE in perpetuity. The forward model above assumes the opposite: ROE fades to
 * the cost of equity over the horizon and no continuing value is added. So the two readings rest on
 * DIFFERENT assumptions and can legitimately disagree, and the basis string says which is which
 * rather than claiming they cannot. `g` obeys the same house rule the DCF terminal value obeys —
 * nothing grows faster than the risk-free rate forever — so it is capped at min(ROTE × retention,
 * TERMINAL_G_CAP_PCT, risk-free). Uncapped, a bank at ROTE 14% with a one-third payout implied g =
 * 9.4% and a justified multiple of 7.45x against a forward-model reading of 1.18x, which made every
 * well-earning financial look grossly cheap against its own pipeline fair value. The multiple is
 * withheld — never clamped — when CoE − g is not comfortably positive, because the ratio explodes
 * through infinity there and any number it produced would be an artefact of the arithmetic rather
 * than a valuation.
 */
export const JUSTIFIED_PTBV_MIN_SPREAD_PP = 0.5;

function priceToTangibleBookVsRote(
  inputs: ExcessReturnInputs,
  coePct: number | null,
  payoutPct: number | null,
): PriceToTangibleBookVsRote {
  const tce = posOrNull(inputs.tangibleCommonEquity);
  const mcap = posOrNull(inputs.marketCap);
  const rotePct = isNum(inputs.rotePct) ? inputs.rotePct : null;
  const dating = { asOf: inputs.tangibleCommonEquityAsOf, roteAsOf: inputs.roteAsOf, roteSource: inputs.roteSource };
  const equityDateBasis = inputs.tangibleCommonEquityAsOf ? `; tangible common equity at ${inputs.tangibleCommonEquityAsOf}` : "";
  const empty = (reason: string, basis: string): PriceToTangibleBookVsRote => ({
    ...dating,
    pTbv: null,
    rotePct,
    justifiedPTbv: null,
    premiumToJustified: null,
    basis,
    withheldReason: reason,
  });

  if (tce === null) {
    return empty(
      "tangible common equity unavailable or not positive — P/TBV withheld rather than substituting book equity, which would flatter a goodwill-heavy balance sheet",
      "market cap / tangible common equity, against return on tangible common equity",
    );
  }
  if (mcap === null) {
    return empty(
      "market cap unavailable — P/TBV not computable",
      "market cap / tangible common equity, against return on tangible common equity",
    );
  }
  const pTbv = mcap / tce;

  if (rotePct === null || coePct === null || payoutPct === null) {
    const missing =
      rotePct === null
        ? "return on tangible common equity"
        : coePct === null
          ? "cost of equity"
          : "payout history (needed for the retention rate in g)";
    return {
      ...dating,
      pTbv,
      rotePct,
      justifiedPTbv: null,
      premiumToJustified: null,
      basis: `P/TBV = market cap ${mcap} / tangible common equity ${tce} = ${fmtNum(pTbv)}x${equityDateBasis}`,
      withheldReason: `${missing} unavailable — the justified multiple (ROTE − g)/(CoE − g) was not computed, so the multiple is shown without the return that would justify it`,
    };
  }

  const retention = 1 - payoutPct / 100;
  const gSustainable = (rotePct / 100) * retention * 100;
  // House rule, the same one the DCF terminal value obeys: nothing grows faster
  // than the risk-free rate forever. Uncapped, g = ROTE x retention routinely
  // lands above the cost of equity for a profitable bank, which either withheld
  // the multiple or (just under the floor) published a very large one.
  const rf = isNum(inputs.riskFreePct) ? inputs.riskFreePct : null;
  const gCap = rf === null ? TERMINAL_G_CAP_PCT : Math.min(TERMINAL_G_CAP_PCT, rf);
  const gCapBasis =
    rf === null
      ? `min(ROTE x retention, ${TERMINAL_G_CAP_PCT}% terminal-growth cap) — no risk-free rate supplied, so the cap rests on the house terminal-growth ceiling alone`
      : `min(ROTE x retention, ${TERMINAL_G_CAP_PCT}% terminal-growth cap, risk-free ${fmtNum(rf)}%) — house rule: nothing grows faster than rf forever`;
  const g = Math.min(gSustainable, gCap);
  const gCapped = g < gSustainable;
  const spread = coePct - g;
  if (spread < JUSTIFIED_PTBV_MIN_SPREAD_PP) {
    return {
      ...dating,
      pTbv,
      rotePct,
      justifiedPTbv: null,
      premiumToJustified: null,
      basis:
        `P/TBV = market cap ${mcap} / tangible common equity ${tce} = ${fmtNum(pTbv)}x, against ROTE ${fmtNum(rotePct)}%${equityDateBasis}`,
      withheldReason:
        `growth g = ${fmtNum(g)}% (${gCapped ? `ROTE ${fmtNum(rotePct)}% x retention ${fmtNum(retention * 100)}% = ${fmtNum(gSustainable)}%, capped by ${gCapBasis}` : `ROTE ${fmtNum(rotePct)}% x retention ${fmtNum(retention * 100)}%, below ${gCapBasis}`}) ` +
        `leaves only ${fmtNum(spread)}pp below the cost of equity ${fmtNum(coePct)}% (floor ${JUSTIFIED_PTBV_MIN_SPREAD_PP}pp) — ` +
        "the justified multiple (ROTE − g)/(CoE − g) diverges there, so it is withheld rather than reported as a very large number",
    };
  }
  const justifiedPTbv = (rotePct - g) / spread;
  return {
    ...dating,
    pTbv,
    rotePct,
    justifiedPTbv,
    premiumToJustified: pTbv - justifiedPTbv,
    basis:
      `P/TBV = market cap ${mcap} / tangible common equity ${tce} = ${fmtNum(pTbv)}x, against ROTE ${fmtNum(rotePct)}%${equityDateBasis}. ` +
      `Justified P/TBV = (ROTE ${fmtNum(rotePct)}% − g ${fmtNum(g)}%) / (CoE ${fmtNum(coePct)}% − g ${fmtNum(g)}%) = ` +
      `${fmtNum(justifiedPTbv)}x, where g = ${gCapped ? `${gCapBasis} (ROTE x retention ${fmtNum(retention * 100)}% = ${fmtNum(gSustainable)}%, capped)` : `ROTE x retention ${fmtNum(retention * 100)}% = ${fmtNum(gSustainable)}%, within ${gCapBasis}`}. ` +
      "This is a STABLE-GROWTH cross-check: it assumes ROTE persists in perpetuity. The forward excess-return " +
      "model uses its separately disclosed ROE path and continuation assumptions. The two rest " +
      "on different assumptions and can disagree — read the difference as the value of persistence, not as an error.",
    withheldReason: null,
  };
}

/** D-147: rates and book dates belong to each value; only the headline tests the age limit. */
function growthFactor(fromDay: string | null, toDay: string | null, ratePct: number): number {
  const days = fromDay && toDay ? daysBetween(fromDay, toDay) : null;
  return days !== null && days > 0 ? Math.pow(1 + ratePct / 100, days / DAYS_PER_YEAR) : 1;
}
function rollForwardFactor(fromDay: string | null, toDay: string | null, ratePct: number): { factor: number; days: number } | null {
  const days = fromDay && toDay ? daysBetween(fromDay, toDay) : null;
  return days !== null && days > 0 && days <= MAX_ROLL_FORWARD_DAYS ? { factor: growthFactor(fromDay, toDay, ratePct), days } : null;
}

export function excessReturnModel(inputs: ExcessReturnInputs): ExcessReturnResult {
  const notes: string[] = [];
  const gaps: ManifestEntry[] = [];
  const preferredFold = foldConvertiblePreferred(inputs.permanentPreferred ?? null, inputs.convertiblePreferredClaim, inputs.preferredSeriesDistinct);
  const additionalPreferred = Math.max(0, (preferredFold.preferred ?? 0) - (inputs.permanentPreferred ?? 0));
  if (preferredFold.gap) gaps.push(preferredFold.gap);
  const alternative = inputs.startAlternative;
  const alternativeFold = foldConvertiblePreferred(alternative?.permanentPreferred ?? null,
    alternative?.convertiblePreferredClaim, alternative?.preferredSeriesDistinct);
  const additionalAlternativePreferred = Math.max(0, (alternativeFold.preferred ?? 0) - (alternative?.permanentPreferred ?? 0));
  inputs = { ...inputs,
    bookValue: inputs.bookValue == null ? null : inputs.bookValue - additionalPreferred,
    startAlternative: alternative ? { ...alternative, bookValue: alternative.bookValue - additionalAlternativePreferred } : alternative };
  const years = inputs.years ?? EXCESS_RETURN_YEARS;
  const reverseNotes: string[] = [];
  /*
   * D-16: the horizon, the discount rate and the opening book value are printed as assumptions in
   * their own right — the model's shape was previously only inferable from the ROE-path basis
   * string. The fade target is the cost of equity ONLY when no caller overrides the terminal ROE.
   * Stating "so the year-N excess is zero" unconditionally would contradict a non-zero
   * `terminalExcess` whenever one did — latent today (production supplies no override) but a false
   * sentence either way, and the adjacent note already branches.
   */
  const terminalOverridePct = isNum(inputs.analystImpliedRoePct) ? inputs.analystImpliedRoePct : null;
  const horizonBasis = (built: boolean): string =>
    built
      ? `explicit ${years}-year horizon: the excess return (ROE − cost of equity) x prior-year book equity is ` +
        `discounted year by year to year ${years}. ROE is faded LINEARLY to ` +
        (terminalOverridePct === null
          ? "the cost of equity over exactly that horizon, so the year-N excess is zero and NO continuing value is added beyond it."
          : `a caller-supplied terminal ROE of ${fmtNum(terminalOverridePct)}% over exactly that horizon — NOT to the cost of equity — so the year-N excess is NOT zero (it is reported as terminal excess return), and NO continuing value is added beyond it.`)
      : `explicit ${years}-year horizon (model not built)`;
  const coeSupplied = isNum(inputs.costOfEquityPct) ? inputs.costOfEquityPct : null;
  const unbuiltAssumptions = {
    horizonYears: { value: years, basis: horizonBasis(false) },
    costOfEquityPct: {
      value: coeSupplied,
      basis:
        coeSupplied === null
          ? "not supplied — the model is suppressed rather than discounting at a defaulted rate"
          : `cost of equity ${fmtNum(coeSupplied)}% (CAPM, upstream); the model never uses a WACC`,
    },
    openingBookValue: {
      value: inputs.bookValueRefusal ? null : posOrNull(inputs.bookValue),
      basis:
        inputs.bookValueRefusal ?? (posOrNull(inputs.bookValue) === null
          ? inputs.bookValueRefusal ?? "totalStockholdersEquity missing or non-positive"
          : "latest total stockholders' equity (BV0)"),
    },
    priceToTangibleBookVsRote: priceToTangibleBookVsRote(inputs, coeSupplied, null),
  } satisfies Pick<
    ExcessReturnResult,
    "horizonYears" | "costOfEquityPct" | "openingBookValue" | "priceToTangibleBookVsRote"
  >;

  // A null cost of equity is never silently defaulted upstream; the model is suppressed instead,
  // because the discount rate is load-bearing, exactly like the DCF path's WACC guard (P10).
  if (!isNum(inputs.costOfEquityPct)) {
    gaps.push(
      gapEntry(
        "valuation.excessReturn.costOfEquity",
        "cost of equity unavailable (risk-free rate / CAPM inputs missing upstream) — excess-return valuation suppressed rather than defaulting a discount rate",
        "critical",
      ),
    );
    return {
      equityValue: null,
      perShare: null,
      impliedPToBv: null,
      roePathPct: { value: [], basis: "not built (no cost of equity)" },
      payoutRatioPct: { value: null, basis: "not built (no cost of equity)" },
      bookValuePath: [],
      ...unbuiltAssumptions,
      terminalExcess: null,
      reverseSolve: { impliedCurrentRoePct: null, notes: ["skipped: no cost of equity"] },
      asOf: inputs.asOf ?? null,
      notes,
      gaps,
    };
  }
  const coe = inputs.costOfEquityPct;

  let bv0 = inputs.bookValueRefusal ? null : posOrNull(inputs.bookValue);
  if (bv0 === null) {
    gaps.push(
      gapEntry(inputs.bookValueRefusal ? "valuation.excessReturn.preferredCapital" : "valuation.excessReturn.bookValue", inputs.bookValueRefusal ?? "totalStockholdersEquity missing or non-positive — excess-return model not computable", "critical"),
    );
    return {
      equityValue: null,
      perShare: null,
      impliedPToBv: null,
      roePathPct: { value: [], basis: "not built (no book value)" },
      payoutRatioPct: { value: null, basis: "not built (no book value)" },
      bookValuePath: [],
      ...unbuiltAssumptions,
      terminalExcess: null,
      reverseSolve: { impliedCurrentRoePct: null, notes: ["skipped: no book value"] },
      asOf: inputs.asOf ?? null,
      notes,
      gaps,
    };
  }

  if (!isNum(inputs.payoutRatioPct)) {
    gaps.push(
      gapEntry(
        "valuation.excessReturn.payout",
        "company payout history unavailable — excess-return valuation suppressed rather than assuming a universal payout ratio",
        "critical",
      ),
    );
    return {
      equityValue: null,
      perShare: null,
      impliedPToBv: null,
      roePathPct: { value: [], basis: "not built (no payout history)" },
      payoutRatioPct: { value: null, basis: "not built (no payout history)" },
      bookValuePath: [],
      ...unbuiltAssumptions,
      terminalExcess: null,
      reverseSolve: { impliedCurrentRoePct: null, notes: ["skipped: no payout history"] },
      asOf: inputs.asOf ?? null,
      notes,
      gaps,
    };
  }
  const payout = clampWithNote(
    inputs.payoutRatioPct,
    PAYOUT_CLAMP_PCT[0],
    PAYOUT_CLAMP_PCT[1],
    "payout ratio (pct)",
    notes,
  );
  const payoutBasis = inputs.bookValueBasis
    ? "caller-provided (common dividends + net common buybacks / income available to common, up to 3-year average; at least 2 usable years upstream)"
    : "caller-provided (dividends + net buybacks / net income, 3y avg upstream)";

  // Competitive fade: ROE fades to the cost of equity by the terminal year, so
  // terminal excess returns are zero — the equity-side analogue of the DCF
  // core's terminal ROIC = WACC. A caller MAY override the terminal ROE
  // (analystImpliedRoePct); that asserts persistent excess and is surfaced
  // honestly below. Production supplies the return history instead; its
  // evidenced-excess convention may carry a continuing value past the horizon.
  if (!isNum(inputs.currentRoePct)) {
    gaps.push(
      gapEntry(
        "valuation.excessReturn.currentRoe",
        "current company ROE unavailable — excess-return valuation suppressed rather than substituting the terminal ROE path",
        "critical",
      ),
    );
    return {
      equityValue: null,
      perShare: null,
      impliedPToBv: null,
      roePathPct: { value: [], basis: "not built (no current ROE)" },
      payoutRatioPct: { value: payout, basis: payoutBasis },
      bookValuePath: [],
      ...unbuiltAssumptions,
      terminalExcess: null,
      reverseSolve: { impliedCurrentRoePct: null, notes: ["skipped: no current ROE"] },
      asOf: inputs.asOf ?? null,
      notes,
      gaps,
    };
  }
  const roeStart = inputs.currentRoePct;
  const overrideTerminal = isNum(inputs.analystImpliedRoePct);
  const retLabel = inputs.currentRoeBasis === "fiscal-year-rote" || inputs.currentRoeBasis === "ttm-rote" ? "ROTE" : "ROE";
  // The DCF's terminal excess-return house convention, on the equity side, as "4 of the last 5
  // years" with business-combination years set aside (D-102).
  const evidenced =
    !overrideTerminal && inputs.roeHistory != null
      ? terminalRoic(coe, inputs.roeHistory, { ret: retLabel, rate: "cost of equity" }, { rule: "four-of-five" })
      : null;
  if (evidenced?.note) notes.push(evidenced.note);
  if (evidenced?.waccBasisNote) notes.push(evidenced.waccBasisNote);
  // The carried excess is valued as residual income growing at g past the
  // horizon, under the same g cap as the justified-P/TBV cross-check and the
  // same CoE − g guard as the DCF's Gordon terminal value.
  const rfForG = isNum(inputs.riskFreePct) ? inputs.riskFreePct : null;
  const continuingG = rfForG === null ? TERMINAL_G_CAP_PCT : Math.min(TERMINAL_G_CAP_PCT, rfForG);
  let carriedPp = evidenced?.excessPp ?? 0;
  if (carriedPp > 0 && coe - continuingG < TV_GUARD_PP) {
    notes.push(
      `evidenced excess ${retLabel} not carried: cost of equity ${fmtNum(coe)}% leaves less than ${TV_GUARD_PP}pp over the continuing growth ${fmtNum(continuingG)}% (same guard as the DCF terminal value)`,
    );
    carriedPp = 0;
  }
  const continuing = carriedPp > 0 ? { excessPp: carriedPp, gPct: continuingG } : null;
  const endRoe = overrideTerminal ? (inputs.analystImpliedRoePct as number) : coe + carriedPp;
  const endBasis = overrideTerminal
    ? `caller-supplied terminal ROE ${fmtNum(endRoe)}% (persistent excess asserted)`
    : continuing !== null
      ? `${fmtNum(endRoe)}% — ${evidenced!.basis}; carried past year ${years} as residual income growing at ${fmtNum(continuingG)}%`
      : `cost of equity ${fmtNum(coe)}% (competitive fade — zero terminal excess)`;
  const startBasis =
    inputs.currentRoeBasis === "fiscal-year-rote"
      ? `FY ${inputs.currentRoeAsOf ?? "unknown"} ROTE (common earnings / average tangible common equity)`
      : inputs.currentRoeBasis === "fiscal-year-common-roe"
        ? `FY ${inputs.currentRoeAsOf ?? "unknown"} common-equity ROE (common earnings / average common equity)`
        : inputs.currentRoeBasis === "ttm-rote"
          ? `TTM ROTE to ${inputs.currentRoeAsOf ?? "unknown"} (four quarters of common earnings / average tangible common equity)`
          : inputs.currentRoeBasis === "ttm-common-roe"
            ? `TTM common-equity ROE to ${inputs.currentRoeAsOf ?? "unknown"} (four quarters of common earnings / average common equity)`
            : inputs.currentRoeBasis === "fiscal-year-dupont"
      ? `${inputs.currentRoeAsOf != null ? `FY ${inputs.currentRoeAsOf} ` : ""}DuPont ROE`
      : "TTM ROE";
  const roeBasis = `linear fade from ${startBasis} ${fmtNum(roeStart)}% to ${endBasis} by year ${years}`;
  const roePath = fadePath(roeStart, endRoe, years);
  // D-102: Fade payout from the three-year average in year one to the steady-state payout implied
  // by terminal return and growth in year N, so book grows at g when continuing value begins.
  // Holding the initial payout constant would compound book at above-cost returns before the
  // terminal carry applies.

  const payoutPathFor = (terminalRoePct: number): number[] => fadePath(payout, steadyStatePayoutPct(terminalRoePct, continuingG), years);
  const steadyPayout = steadyStatePayoutPct(endRoe, continuingG);
  const payoutPath = payoutPathFor(endRoe);
  const payoutPathBasis =
    `fades linearly from ${fmtNum(payout)}% in year 1 to ${fmtNum(steadyPayout)}% in year ${years}, the steady state ` +
    `1 − g / terminal ROE = 1 − ${fmtNum(continuingG)}% / ${fmtNum(endRoe)}% at which book grows at g (clamped to 0-100%)`;

  const roll = rollForwardFactor(inputs.asOf ?? null, inputs.valuationDate ?? null, coe);
  let valuationDate: ExcessReturnResult["valuationDate"];
  if (roll !== null) {
    const basis = `Excess-return value rolled forward ${roll.days} days to the quote date ${inputs.valuationDate} from opening book ${inputs.asOf} at the cost of equity ${fmtNum(coe)}% (factor ${roll.factor.toFixed(6)}), gross of distributions; interim dividends and buybacks are not deducted (house convention).`;
    valuationDate = { value: inputs.valuationDate!, elapsedYears: roll.days / DAYS_PER_YEAR, basis };
    notes.push(`Valuation date: ${basis}`);
  } else {
    const elapsed = inputs.asOf && inputs.valuationDate ? daysBetween(inputs.asOf, inputs.valuationDate) : null;
    if (elapsed !== null && elapsed > MAX_ROLL_FORWARD_DAYS) {
      const reason = `Quote ${inputs.valuationDate} is ${elapsed} days after opening book ${inputs.asOf}, beyond the ${MAX_ROLL_FORWARD_DAYS}-day limit; value not rolled forward, stated at the book date.`;
      gaps.push(gapEntry("valuation.excessReturn.valuationDate", reason, "info")); notes.push(`Valuation date: ${reason}`);
    }
  }
  let valued = excessReturnValue(bv0, roePath, coe, payoutPath, continuing);
  let shares = posOrNull(inputs.dilutedShares);
  let restoredBook = 0;
  let restoredPreferredBook = 0;
  let readings: ConvertibleReading[] | undefined;
  if (inputs.convertibles?.length && shares !== null) {
    const filedShares = shares;
    let best = Infinity;
    for (const variant of convertibleVariants(inputs.convertibles, { preferred: inputs.convertiblePreferredClaim ?? 0, notes: inputs.totalDebt ?? 0 })) {
      const d = filedShares - variant.sharesRemoved;
      const c = variant.restored.notes + variant.restored.preferred;
      /**
       * Conversion restores opening common book, which earns the model residual returns. Adding
       * face value after valuation would use an inconsistent basis.
       */
      const candidate = excessReturnValue(bv0 + c, roePath, coe, payoutPath, continuing);
      const value = candidate.equityValue / d;
      if (d > 0 && value < best) { best = value; shares = d; restoredBook = c; restoredPreferredBook = variant.restored.preferred; readings = variant.readings; valued = candidate; }
    }
    bv0 += restoredBook;
    const entries = convertibleReadingGaps(readings ?? [], filedShares);
    gaps.push(...entries); notes.push(...entries.map(e => e.reason));
  }
  const { equityValue, bookValuePath, continuingValuePv } = valued;
  // D-137: the reverse solve must invert the exact admitted forward divisor.
  const perShareOf = (equity: number): number | null => shares !== null ? equity / shares : null;
  const perShare = perShareOf(equityValue);
  if (shares === null) {
    gaps.push(gapEntry("valuation.excessReturn.dilutedShares", "diluted shares missing — per-share value unavailable", "info"));
  }
  // D-102: the fiscal-year start, valued with the same fade target, carry and payout from its own
  // book value, so the reader sees what the start choice is worth.
  let startAlternative: ExcessReturnStartAlternative | undefined;
  /**
   * The selected conversion fraction restores only preferred claims present at the alternative
   * date.
   */
  const preferredConversionFraction = (inputs.convertiblePreferredClaim ?? 0) > 0
    ? restoredPreferredBook / inputs.convertiblePreferredClaim! : 0;
  const alternativeRestoredBook = restoredBook - restoredPreferredBook +
    preferredConversionFraction * Math.min(alternativeFold.preferred ?? 0, alternative?.convertiblePreferredClaim ?? 0);
  const alt = inputs.startAlternative ? { ...inputs.startAlternative, bookValue: inputs.startAlternative.bookValue + alternativeRestoredBook } : null;
  if (alt != null && isNum(alt.roePct) && posOrNull(alt.bookValue) !== null) {
    const altValue = (excessReturnValue(alt.bookValue, fadePath(alt.roePct, endRoe, years), coe, payoutPath, continuing).equityValue) * (roll ? growthFactor(alt.asOf, inputs.valuationDate ?? null, coe) : 1);
    const differencePp = alt.roePct - roeStart;
    const altLabel = `FY ${alt.asOf ?? "unknown"} ${alt.basis === "fiscal-year-rote" ? "ROTE" : "common-equity ROE"} start ${fmtNum(alt.roePct)}%`;
    startAlternative = {
      basis: alt.basis,
      asOf: alt.asOf,
      startRoePct: alt.roePct,
      bookValue: alt.bookValue,
      equityValue: altValue,
      perShare: shares !== null && !(roll && alt.asOf === null) ? altValue / shares : null,
      differencePp,
      besideHeadline: Math.abs(differencePp) > EXCESS_RETURN_START_GAP_PP,
      label: altLabel,
    };
    notes.push(
      `start ${retLabel}: ${startBasis} ${fmtNum(roeStart)}% (newer than the latest fiscal year); the ${altLabel} from book value ${alt.bookValue} ` +
        `would value the equity at ${fmtNum(altValue)}${shares !== null ? ` (${fmtNum(altValue / shares)} per share)` : ""}, ` +
        `${fmtNum(Math.abs(differencePp))}pp ${differencePp < 0 ? "below" : "above"} the start used` +
        (startAlternative.besideHeadline ? ` — more than ${EXCESS_RETURN_START_GAP_PP}pp apart, so it is shown beside the headline (house convention)` : ""),
    );
  }
  // D-102: the start return against the cost of equity. Each column moves the discount rate and the
  // fade target together (the carried excess, if any, is held and passes the same CoE − g guard);
  // each row keeps the headline's horizon and payout. The fiscal-year start, when there is one,
  // replaces the shifted row on its side and starts from its own book value.
  let startCoeGrid: ExcessReturnGrid | undefined;
  if (shares !== null) {
    const step = EXCESS_RETURN_GRID_START_STEP_PP;
    const rows: ExcessReturnGrid["rows"] = [
      { label: `${startBasis.replace(/ \(.*\)$/, "")} ${fmtNum(roeStart - step)}% (headline −${step}pp)`, startReturnPct: roeStart - step, bookValue: bv0 },
      { label: `${startBasis.replace(/ \(.*\)$/, "")} ${fmtNum(roeStart)}% (headline)`, startReturnPct: roeStart, bookValue: bv0 },
      { label: `${startBasis.replace(/ \(.*\)$/, "")} ${fmtNum(roeStart + step)}% (headline +${step}pp)`, startReturnPct: roeStart + step, bookValue: bv0 },
    ];
    const alternativeRow = startAlternative === undefined ? -1 : startAlternative.startRoePct < roeStart ? 0 : 2;
    if (startAlternative !== undefined) {
      rows[startAlternative.startRoePct < roeStart ? 0 : 2] = {
        label: `${startAlternative.label} (fiscal-year book value)`,
        startReturnPct: startAlternative.startRoePct,
        bookValue: startAlternative.bookValue,
      };
    }
    const evidencedPp = evidenced?.excessPp ?? 0;
    const costOfEquityPcts = [coe - EXCESS_RETURN_GRID_COE_STEP_PP, coe, coe + EXCESS_RETURN_GRID_COE_STEP_PP];
    // Floored at 0 like the published headline (limited liability).
    const cell = (value: number): number | null => (Number.isFinite(value) ? Math.max(0, value) : null);
    const perShareGrid = rows.map((row, rowIndex) => costOfEquityPcts.map((c) => {
      const rowDate = rowIndex === alternativeRow ? startAlternative!.asOf : inputs.asOf ?? null;
      if (roll && rowDate === null) return null;
      const factor = roll ? growthFactor(rowDate, inputs.valuationDate ?? null, c) : 1;
      if (c === coe) {
        return cell((excessReturnValue(row.bookValue, fadePath(row.startReturnPct, endRoe, years), coe, payoutPath, continuing).equityValue) * factor / shares);
      }
      const carry = evidencedPp > 0 && c - continuingG >= TV_GUARD_PP ? evidencedPp : 0;
      const target = overrideTerminal ? endRoe : c + carry;
      const cont = carry > 0 ? { excessPp: carry, gPct: continuingG } : null;
      return cell((excessReturnValue(row.bookValue, fadePath(row.startReturnPct, target, years), c, payoutPathFor(target), cont).equityValue) * factor / shares);
    }));
    startCoeGrid = {
      rows,
      costOfEquityPcts,
      perShare: perShareGrid,
      notes: [
        ...((inputs.currentRoeBasis === "fiscal-year-rote" || inputs.currentRoeBasis === "ttm-rote" || alt?.basis === "fiscal-year-rote") ? [MODEL_TANGIBLE_COMMON_BASIS] : []),
        `rows = starting ${retLabel}; columns = cost of equity ${fmtNum(coe)}% ±${EXCESS_RETURN_GRID_COE_STEP_PP}pp`,
        overrideTerminal
          ? `each cell fades its start linearly over ${years} years to the caller-supplied terminal ROE ${fmtNum(endRoe)}%, discounted at the column's cost of equity`
          : evidencedPp > 0
            ? `each cell fades its start linearly over ${years} years to the column's cost of equity plus the ${fmtNum(evidencedPp)}pp evidenced excess, carried past year ${years} at ${fmtNum(continuingG)}% where the cost of equity clears that growth by ${TV_GUARD_PP}pp`
            : `each cell fades its start linearly over ${years} years to the column's cost of equity (zero terminal excess)`,
        `payout fades from ${fmtNum(payout)}% to each cell's steady state (1 − g / its terminal ROE) by year ${years}; ${startAlternative !== undefined ? "the fiscal-year row starts from its own fiscal-year book value, the others from the headline's opening book value" : `rows other than the headline shift its start by ±${step}pp from the same opening book value`}`,
        "the centre cell is the headline value; a cell below zero is shown as 0, as the headline is",
        ...(roll ? [`cells are stated at the quote date ${inputs.valuationDate}, each rolled from its row's opening book at its column's cost of equity`] : []),
      ],
    };
  }
  const impliedPToBv = safeDiv(equityValue, bv0);
  if (impliedPToBv !== null && (impliedPToBv > 3 || impliedPToBv < 0.3)) {
    notes.push(`implied P/B ${fmtNum(impliedPToBv)} outside [0.3, 3] sanity band — review assumptions (house-rule flag)`);
  }

  // Reverse solve: the STARTING ROE which, under this model's own competitive
  // fade and admitted divisor, reproduces the quote price (market cap only on
  // the disclosed fallback). Monotone in the starting ROE.
  //
  // It previously held ROE CONSTANT for `years` and then stopped accruing
  // residual income — neither a fade (what the forward model assumes) nor a
  // perpetuity (what "steady state" promises), so it inverted no model at all.
  // Two things make the fade the right choice rather than the Gordon closed
  // form:
  //   - Empirically, ROE mean-reverts toward the cost of capital (Fama-French
  //     2000; Nissim-Penman 2001). A perpetual constant excess ROE is the
  //     assumption the forward path explicitly refuses.
  //   - grading.ts compares this number DIRECTLY against `roePathPct.value[0]`
  //     (the current ROE) at 0.5 weight of the valuation aspect. That
  //     subtraction is only meaningful if both sides are the same quantity —
  //     a starting ROE under identical dynamics. Holding ROE constant made the
  //     solved value systematically LOW (a flat path is worth more than a
  //     fading one, so less ROE was needed to reach the price), which biased
  //     every bank, insurer and mortgage REIT toward "market too pessimistic".
  //
  // A clean property follows: with no carried excess the model returns exactly
  // book value when ROE equals the cost of equity, so an issuer priced at book
  // solves to CoE. The solve fades to the same target and carries the same
  // continuing value as the forward path, so the comparison stays like for like.
  let impliedCurrentRoePct: number | null = null;
  let reverseBasis: ExcessReturnResult["reverseSolve"]["basis"];
  const mcap = posOrNull(inputs.marketCap);
  const price = posOrNull(inputs.price);
  const usePrice = price !== null && shares !== null;
  const quoteTarget = usePrice ? price : mcap;
  const target = quoteTarget === null ? null : quoteTarget / (roll?.factor ?? 1);
  const reverseUse = classifyValuationDateUse({ statementDate: inputs.asOf ?? null, quoteDate: inputs.quoteAsOf ?? null,
    rolledTo: valuationDate?.value ?? null, elapsedYears: valuationDate?.elapsedYears ?? null });
  if (target === null) {
    reverseNotes.push("skipped: market cap not provided (price or diluted shares unavailable)");
  } else if (reverseUse.status !== "current") {
    const reason = valuationUseExplanation(reverseUse);
    reverseNotes.push(reason);
    gaps.push(gapEntry("valuation.excessReturn.reverseSolve.currentUse", reason, "warn"));
  } else {
    reverseBasis = usePrice ? "price-per-diluted-share" : "market-cap";
    const targetLabel = usePrice ? "the price per diluted share" : "market cap";
    const [lo, hi] = REVERSE_ROE_RANGE_PCT;
    const f = (roe: number): number => {
      // Fade to the SAME terminal target the forward path uses. Hard-wiring CoE
      // here re-opened the apples-to-apples defect this solve exists to close
      // whenever a caller overrode the terminal ROE.
      const value = excessReturnValue(bv0, fadePath(roe, endRoe, years), coe, payoutPath, continuing).equityValue;
      return (usePrice ? perShareOf(value)! : value) - target;
    };
    const fLo = f(lo);
    const fHi = f(hi);
    if (fLo > 0) {
      reverseNotes.push(`${targetLabel} below the ${lo}% starting-ROE value — implied ROE < ${lo}%`);
    } else if (fHi < 0) {
      reverseNotes.push(`${targetLabel} above the ${hi}% starting-ROE value — implied ROE > ${hi}% (price not justifiable on book returns)`);
    } else {
      const root = bisect(f, { lo, hi, fLo, fHi }, target);
      impliedCurrentRoePct = root;
      if (root !== null) {
        const targetBasis = usePrice
          ? `the price per diluted share (${price} on ${shares} shares, the count the value per share divides by)`
          : "market cap (price or diluted shares unavailable)";
        reverseNotes.push(`starting ROE fading to ${endBasis} over ${years} years (payout fading ${fmtNum(payout)}% → ${fmtNum(steadyPayout)}%) matching ${targetBasis} — comparable to the current ROE, same dynamics as the forward path`);
      }
    }
  }

  // Terminal excess = year-N economic profit (ROE_N − CoE)·BV_{N-1}, undiscounted,
  // in currency. Zero by construction when the fade lands on CoE (the default).
  const terminalExcess =
    roePath.length > 0
      ? ((roePath[roePath.length - 1] - coe) / 100) * bookValuePath[bookValuePath.length - 2]
      : 0;
  notes.push(
    overrideTerminal
      ? `excess-return model: equity-only (CoE, never WACC); terminal ROE overridden to ${fmtNum(endRoe)}% — terminal excess ${fmtNum(terminalExcess)} (currency), NOT zero`
      : continuing !== null
        ? `excess-return model: equity-only (CoE, never WACC); ${retLabel} fades to CoE + ${fmtNum(carriedPp)}pp evidenced excess, whose continuing value past year ${years} is ${fmtNum(continuingValuePv)} (currency, present value)`
        : "excess-return model: equity-only (CoE, never WACC); ROE fades to CoE so terminal excess returns = 0",
  );
  // D-17: the P/TBV-against-ROTE pairing, now that the payout (and hence the retention rate inside g)
  // is known.
  const financialAssumptions: FinancialValuationAssumptions = {
    version: "financial-valuation-assumptions-v1", modelKind: "excess-return", horizonYears: years,
    costOfEquityPct: coe, initialCommonBook: bv0, roePathBasis: roeBasis, terminalRoePct: endRoe,
    terminalGrowthPct: continuing === null ? null : continuingG, terminalExcessReturnPp: endRoe - coe,
    continuingValuePv, continuingValueSharePct: equityValue !== 0 ? (continuingValuePv / equityValue) * 100 : null,
    continuingValueBasis: continuing === null
      ? overrideTerminal ? "caller terminal override affects the finite ROE path only; no continuing value was added" : "competitive fade to cost of equity; zero excess returns beyond the horizon"
      : `${evidenced!.basis}; residual income beyond year ${years} = terminal excess return x BV_N / (CoE - growth), discounted ${years} years; growth capped at ${TERMINAL_G_CAP_PCT}%${rfForG === null ? "; risk-free rate unavailable" : ` and risk-free ${fmtNum(rfForG)}%`}`,
    payoutPathPct: payoutPath, steadyStatePayoutPct: steadyPayout, payoutPathBasis,
  };
  if (roll) reverseNotes.push(`Quote target discounted to opening book ${inputs.asOf} by the headline roll factor ${roll.factor}; the solve uses the same convertible reading and divisor as the forward value.`);
  const pTbvVsRote = priceToTangibleBookVsRote(inputs, coe, payout);
  pTbvVsRote.basis += ` ${describeFinancialValuation(financialAssumptions)}`;
  if (pTbvVsRote.withheldReason !== null && pTbvVsRote.pTbv === null) {
    gaps.push(
      gapEntry("valuation.excessReturn.priceToTangibleBook", pTbvVsRote.withheldReason, "info"),
    );
  }
  return {
    equityValue: equityValue * (roll?.factor ?? 1),
    perShare: perShare === null ? null : perShare * (roll?.factor ?? 1),
    scenarioEvidence: {
      ...(inputs.scenarioBookEvidence ? { bookEvidence: inputs.scenarioBookEvidence } : {}),
      bookValueBasis: inputs.bookValueBasis ?? null,
      returnHistory: inputs.roeHistory?.map(row => ({ ...row })) ?? [],
      dilutedShares: shares,
      tangibleBookPerShare: shares === null || inputs.scenarioBookEvidence?.tangibleBookRefusal ? null : inputs.bookValueBasis === "tangible-common-equity"
        ? bv0 / shares : isNum(inputs.tangibleCommonEquity) && inputs.tangibleCommonEquity > 0
          ? inputs.tangibleCommonEquity / shares : null,
      tangibleBookAsOf: inputs.bookValueBasis === "tangible-common-equity" ? inputs.asOf ?? null : inputs.tangibleCommonEquityAsOf ?? null,
    },
    ...(valuationDate ? { valuationDate } : {}),
    ...(readings ? { convertibles: readings } : {}),
    impliedPToBv,
    roePathPct: { value: roePath, basis: roeBasis },
    currentRoeAsOf: inputs.currentRoeAsOf ?? null,
    payoutRatioPct: { value: payout, basis: `${payoutBasis}; the year-1 payout, which fades linearly to the steady-state ${fmtNum(steadyPayout)}% by year ${years} (1 − g / terminal ROE)` },
    horizonYears: {
      value: years,
      basis:
        continuing === null
          ? horizonBasis(true)
          : `explicit ${years}-year horizon: the excess return (ROE − cost of equity) x prior-year book equity is ` +
            `discounted year by year to year ${years}. ROE is faded LINEARLY to the cost of equity plus ${fmtNum(carriedPp)}pp ` +
            `of evidenced excess return over exactly that horizon, so the year-N excess is NOT zero; that excess is carried ` +
            `past year ${years} as residual income growing at ${fmtNum(continuingG)}% (continuing value, present value ` +
            `${fmtNum(continuingValuePv)}).`,
    },
    costOfEquityPct: {
      value: coe,
      basis:
        `cost of equity ${fmtNum(coe)}% (CAPM, upstream) — the ONLY discount rate in this model: the excess returns ` +
        "are equity flows, so a WACC would discount them at a blended rate that includes the cost of deposits, " +
        "policy reserves or repo, which are this company's raw material rather than its financing.",
    },
    openingBookValue: {
      value: bv0,
      basis: `opening book equity BV0 = ${inputs.bookValueBasis === "tangible-common-equity" ? "tangible common equity (equity less goodwill, intangibles and preferred)" : inputs.bookValueBasis === "common-equity" ? "common equity (equity less preferred)" : "latest total stockholders' equity"} ${bv0}${inputs.asOf != null ? ` as of ${inputs.asOf}` : ""}; each later year's book value compounds at the matching equity return x retention` + (inputs.bookValueBasisDetail ? `; preferred capital: ${inputs.bookValueBasisDetail}` : ""),
    },
    priceToTangibleBookVsRote: pTbvVsRote,
    bookValuePath,
    terminalExcess,
    financialAssumptions,
    reverseSolve: { impliedCurrentRoePct, notes: reverseNotes, ...(reverseBasis === undefined ? {} : { basis: reverseBasis }) },
    ...(startAlternative !== undefined ? { startAlternative } : {}),
    ...(startCoeGrid !== undefined ? { startCoeGrid } : {}),
    asOf: inputs.asOf ?? null,
    notes,
    gaps,
  };
}
export { withholdPriceToTangibleBook };
