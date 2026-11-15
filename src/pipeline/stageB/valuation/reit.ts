/** REIT NAV and AFFO valuation; run only where the method applies (P14; D-17, D-96). */
import { type ManifestEntry } from "@/types/core";
import { gapEntry, posOrNull, isNum, safeDiv } from "./primitives";
import { millions } from "@/pipeline/stageB/netDebt";


// ---------------------------------------------------------------------------
// REIT valuation (P/FFO, P/AFFO, implied cap rate sketch)
// ---------------------------------------------------------------------------

export interface ReitInputs {
  /**
   * Approximate FFO reconstruction. `ffoBasis` identifies the available NAREIT
   * components and missing ownership / affiliated-entity reconciliation.
   */
  ffoApprox: number | null;
  /** AFFO — recurring capex and straight-line rent when tagged, else FFO − all capex. */
  affoApprox: number | null;
  /**
   * The quote's price. The block does not price on it (the market cap below
   * does); a null price withholds the market cap and EV here, so no caller can
   * publish a P/FFO from a withheld price.
   */
  sharePrice: number | null;
  /**
   * The weighted diluted count FFO and AFFO per share divide by: the count of
   * FFO's own period (its fiscal year), so the flow and its divisor cover one
   * period (D-233, P13). Never the latest quarter's count, which divides a
   * value per share.
   */
  shares: number | null;
  /** D-233: the period end of that count, named beside the per-share figures. */
  sharesPeriodEnd?: string | null;
  /** D-233: why no count for FFO's own period is established; the per-share figures are withheld with it. */
  sharesWithheldReason?: string | null;
  /**
   * FIN-311: the market cap the multiples framework priced P/FFO and P/AFFO on
   * (the quote's admitted market cap), so a report carries one P/FFO.
   */
  marketCap?: number | null;
  /**
   * FIN-108, FIN-119-V2: the house enterprise value the multiples framework
   * computed (`multiples.enterpriseValue.value`, with the lease scope proof,
   * redeemable preferred and redeemable noncontrolling interest), and the
   * claims it holds. Never rebuilt here.
   */
  enterpriseValue?: { value: number | null; basis: string } | null;
  /** NOI approx = operatingIncome + D&A, when derivable. */
  noiApprox?: number | null;
  asOf?: string | null;
  /* D-16: how FFO was actually built, printed instead of the fixed disclaimer. */
  ffoBasis?: string | null;
  /* D-16: how AFFO was actually built. */
  affoBasis?: string | null;
  /** True when FFO components or the ownership / affiliated-entity basis remain unreconciled. */
  ffoApproximate?: boolean;
  /** True when AFFO inherits approximate FFO or lacks recurring capex / straight-line rent. */
  affoApproximate?: boolean;
  /* D-16: the REIT sub-map. "undetermined" withholds every FFO-based figure, because publishing them would assert an equity REIT on no evidence. */
  submap?: "equity" | "mortgage" | "undetermined" | null;
  /* D-16: the routing reason for an undetermined sub-map, repeated on each withheld figure. */
  submapReason?: string | null;
}

export interface ReitValuationResult {
  pToFfo: number | null;
  pToAffo: number | null;
  ffoPerShare: number | null;
  affoPerShare: number | null;
  /** NOI(approx) / EV, percent — labeled sketch. */
  impliedCapRatePct: number | null;
  enterpriseValue: number | null;
  asOf: string | null;
  /* D-16: non-null when every FFO-based figure was withheld, with the reason. */
  withheldReason: string | null;
  notes: string[];
  gaps: ManifestEntry[];
}

/* D-16: REIT valuation block: P/FFO + P/AFFO + implied-cap-rate sketch. FFO and AFFO now arrive already computed (see `computeNareitFfo` in stageB/financialMetrics.ts), which reconstructs available NAREIT components and discloses unreconciled ownership and affiliated entities. This function prints the basis it is given and preserves its uncertainty. When the equity-vs-mortgage sub-map is undetermined every FFO-based figure is withheld: P/FFO on a mortgage REIT is meaningless, and asserting an equity REIT on the strength of SIC 6798 alone is exactly what D-16 forbids. */
export function reitValuation(inputs: ReitInputs): ReitValuationResult {
  const notes: string[] = [];
  const gaps: ManifestEntry[] = [];

  if (inputs.submap === "undetermined") {
    const reason =
      inputs.submapReason ??
      "the REIT sub-map is undetermined (SIC 6798 covers equity and mortgage REITs alike and no XBRL evidence separated them)";
    notes.push(
      `FFO, AFFO, P/FFO, P/AFFO and the implied cap rate are all WITHHELD: ${reason}. FFO presumes an equity REIT — ` +
        "on a mortgage REIT it is not a meaningful figure — so publishing it here would assert a business model the " +
        "evidence does not support. The book-value metrics a mortgage REIT leads with are withheld for the mirror " +
        "reason.",
    );
    gaps.push(
      gapEntry(
        "valuation.reit.submap",
        `REIT valuation withheld: ${reason} — FFO/AFFO/P-FFO presume an equity REIT and book-value metrics presume a mortgage REIT; neither family is published`,
        "warn",
      ),
    );
    return {
      pToFfo: null,
      pToAffo: null,
      ffoPerShare: null,
      affoPerShare: null,
      impliedCapRatePct: null,
      enterpriseValue: null,
      asOf: inputs.asOf ?? null,
      withheldReason: reason,
      notes,
      gaps,
    };
  }

  notes.push(
    inputs.ffoBasis ??
      "FFO (approx.) = net income + D&A — gains on property sales / RE impairments not netted (no tagged lines)",
  );
  notes.push(
    inputs.affoBasis ??
      "AFFO (rough) = approximate FFO - |capex| — treats ALL capex as maintenance; unreconciled FFO and issuer-specific adjustments prevent a guaranteed bound",
  );
  if (inputs.ffoApproximate === true) {
    notes.push(
      "FFO is labeled APPROXIMATE: ownership reconciliation and/or NAREIT components remain incomplete — the FFO basis above identifies the limitations. " +
        "Common/preferred shareholder allocations, noncontrolling interests and consolidated/unconsolidated partnerships and joint ventures " +
        "are not fully reconciled, so the reconstruction may be above or below the issuer's common-holder FFO.",
    );
  }
  const shares = posOrNull(inputs.shares);
  // D-233 (P13, P10): a flow per share divides by its own period's count, or is withheld with the reason.
  if (shares === null && inputs.sharesWithheldReason) {
    gaps.push(gapEntry(
      "valuation.reit.perShareDivisor",
      `FFO and AFFO per share withheld: ${inputs.sharesWithheldReason}. FFO and AFFO are flows of the fiscal year${inputs.sharesPeriodEnd ? ` ending ${inputs.sharesPeriodEnd}` : ""}, so they divide only by that year's weighted-average diluted share count; another period's count is not substituted.`,
      "warn",
    ));
  }
  const mcap = posOrNull(inputs.sharePrice) !== null ? posOrNull(inputs.marketCap) : null;
  if (mcap === null) {
    gaps.push(gapEntry("valuation.reit.marketCap", "market cap withheld or unavailable (a currency, security-basis or per-share guard, or no admitted market cap)", "warn"));
  }
  const ffo = posOrNull(inputs.ffoApprox);
  const affo = posOrNull(inputs.affoApprox);
  if (ffo === null) {
    gaps.push(gapEntry("valuation.reit.ffo", "FFO missing or non-positive — P/FFO n/m", "warn"));
  }
  // FIN-108: the block reads the multiples' EV as computed (one EV per report); a withheld multiples EV withholds this one.
  const ev = mcap !== null && isNum(inputs.enterpriseValue?.value) ? inputs.enterpriseValue.value : null;
  if (ev === null) {
    gaps.push(gapEntry("valuation.reit.enterpriseValue", "the multiples' enterprise value or the market cap is unavailable — EV/implied cap rate unavailable", "info"));
  } else {
    notes.push(
      `enterprise value = ${millions(ev)}, the multiples' enterprise value (the house definition the multiples and the DCF bridge use, so a report carries one EV). Its basis: ${inputs.enterpriseValue?.basis ?? "the house enterprise value"}`,
    );
  }
  const noi = posOrNull(inputs.noiApprox);
  let impliedCapRatePct: number | null = null;
  if (noi !== null && ev !== null && ev > 0) {
    impliedCapRatePct = (noi / ev) * 100;
    notes.push("implied cap rate = NOI (approx. = operating income + D&A) / EV — a sketch, not an appraisal");
  } else {
    gaps.push(gapEntry("valuation.reit.impliedCapRate", "NOI not derivable (or EV missing) — implied cap rate disclosed as gap", "info"));
  }
  if (shares !== null && inputs.sharesPeriodEnd && (ffo !== null || affo !== null)) {
    notes.push(
      `FFO and AFFO per share divide by the weighted-average diluted share count of FFO's own period, the fiscal year ending ${inputs.sharesPeriodEnd} (${shares} shares), so each flow and its divisor cover one period; the latest quarter's count is not used.`,
    );
  }
  return {
    pToFfo: safeDiv(mcap, ffo),
    pToAffo: safeDiv(mcap, affo),
    ffoPerShare: safeDiv(ffo, shares),
    affoPerShare: safeDiv(affo, shares),
    impliedCapRatePct,
    enterpriseValue: ev,
    asOf: inputs.asOf ?? null,
    withheldReason: null,
    notes,
    gaps,
  };
}
