/** Valuation route orchestration and evidence gates; unsupported inputs withhold results (P10, P14; D-102). */
import { type ConvertibleInstrument, foldConvertiblePreferred, convertibleVariants, convertibleReadingGaps } from "@/pipeline/stageB/convertibles";
import { type EmployeeTrustShares, compareShareBasis, shareBasisSentence, shareBasisNote, SHARE_BASIS_DISPLAY_MIN_PCT, shareBasisRelation } from "@/pipeline/stageB/dilutedDivisor";
import { type MultiplesBalance, type MultiplesFrameworkInputs, type MultiplesResult, multiplesFramework, type MultipleKey } from "./multiples";
import { type TemporaryEquityClaims } from "@/pipeline/stageB/seniorClaims";
import { type DebtLikeObligations } from "@/pipeline/stageB/debtLikeObligations";
import { type DcfAssumptionInputs, type DcfAssumptions, buildDcfAssumptions } from "./assumptions";
import { type ExcessReturnInputs, type ExcessReturnResult, excessReturnModel, withholdPriceToTangibleBook } from "./excessReturn";
import { type ReitInputs, type ReitValuationResult, reitValuation } from "./reit";
import { type SectorRoute, type ManifestEntry, type CompanyRoute } from "@/types/core";
import { type DcfResult, type TemporaryEquityDisclosure, type NonOperatingAssetComponent, type DcfRunOptions, runDcf, dcfDomainFailure } from "./dcf";
import { type SensitivityGrid, type GrowthMarginGrid, type ReverseDcfResult, sensitivityGrid, growthMarginGrid, reverseDcf } from "./sensitivity";
import { isNum, gapEntry, fmtNum, posOrNull, financeLeaseOnlyTotal, financeLeaseOnlyEvClause, fmtMoney, LONG_TERM_INVESTMENTS_REMOVED_CLAUSE } from "./primitives";
import { millions, operatingLeaseScopeUnproven, leaseDebtConflict } from "@/pipeline/stageB/netDebt";
import { noncontrollingOwnershipUnresolved } from "@/pipeline/stageB/ownership";
import { resolveSecurityBasis, resolveEconomicEquityScope } from "@/pipeline/stageB/securityBasis";
import { comparePriceCurrency } from "@/pipeline/stageB/priceCurrency";
import { leaseDebtScopeRefusal, leaseEvidenceNote } from "@/pipeline/stageB/leaseScope";
import { metricPolicy } from "@/pipeline/stageB/sectorRouting";
import { RATE_REGULATED_UTILITY_SIC } from "@/edgar/sic";
import { displayClassName } from "@/edgar/classEvidence";
import { classifyValuationDateUse, valuationUseExplanation } from "@/pipeline/stageB/valuationUse";
import { UNSPLIT_CELLS_LEAD } from "./equityBridge";


// ---------------------------------------------------------------------------
// valueCompany — route dispatcher
// ---------------------------------------------------------------------------

export interface ValuationBundleInputs {
  convertibles?: ConvertibleInstrument[];
  convertiblePreferredClaim?: number | null;
  preferredSeriesDistinct?: boolean;
  currentPrice: number | null;
  waccPct: number | null;
  /** The WACC gap explaining a null `waccPct`, quoted by the DCF gap. */
  waccUnavailableReason?: string | null;
  netDebt: number | null;
  dilutedShares: number | null;
  /** Required for an ADR per-share bridge, along with dated ADS evidence. */
  dilutedShareSecurityBasis?: "ordinary" | "quoted" | "issuer-economic";
  /**
   * D-103 (class-tagged market cap): how the multi-class producer (`issuerEconomicDilutedShares`)
   * decided — the basis of an admitted issuer-economic count, or the reason it was refused.
   */
  dilutedShareEconomicBasis?: string | null;
  /**
   * D-135: set only when the divisor row is a loss period, whose filed diluted count equals its
   * basic count; `dilutedShares` already carries the substitution.
   */
  dilutedShareDivisor?:
    | { basis: "loss-period-substituted"; donorDate: string; donorPeriod: "quarter" | "fiscal year"; note: string;
        /** D-265: the latest row's filed weighted-average diluted count, the one its EPS divides by. */
        filedShares?: number }
    | { basis: "loss-period-basic" | "loss-period-withheld"; note: string };
  /** D-265 (P3, P2): the filed held-share count on or before the cutoff (`employeeTrustSharesFiled`); disclosure only. */
  employeeTrustShares?: EmployeeTrustShares | null;
  /** Consolidated equity proves outside claims, but the equity bridge has no allocation. */
  noncontrollingOwnershipUnresolved?: boolean;
  /**
   * D-135: the balance row the DCF equity bridge reads, the one dated at the DCF statement date
   * (`dcfBridgeRow`). Absent ⇒ the bridge reads `multiples.balance`, the anchor the market EV uses.
   */
  bridgeBalance?: MultiplesBalance | null;
  /** Minority interest / preferred equity for the DCF equity bridge (0 when absent). */
  minorityInterest?: number | null;
  preferred?: number | null;
  /**
   * D-135: the redeemable preferred and redeemable NCI filed in temporary equity at the bridge
   * date. `valueCompany` folds them into `preferred` and `minorityInterest` before the earnings key
   * block, so one claim is deducted once.
   */
  temporaryEquity?: TemporaryEquityClaims | null;
  /**
   * D-135 (a withheld enrichment is unknown, not absent): the issuer tags temporary equity at the
   * bridge date but its SEC enrichment was withheld, so a claim may be missing. No claim is added
   * and nothing is withheld; one warn gap says so.
   */
  temporaryEquityUnknown?: { bridge: { date: string; reason: string } | null; market: { date: string; reason: string } | null } | null;
  /**
   * D-102 (NCI on the earnings key): profit attributable to noncontrolling interests and consolidated
   * profit (ProfitLoss), the key the DCF bridge uses for NCI, over the trailing four quarters or else
   * the latest fiscal year (`noncontrollingEarningsInput`). Null/absent ⇒ the key is unestablished,
   * and a DCF with a noncontrolling interest withholds its per-share value.
   */
  noncontrollingEarnings?: { noncontrollingIncome: number | null; consolidatedProfit: number | null; asOf: string | null; basis?: "ttm" | "annual"; sourceBasis?: string } | null;
  /** Independently filed annual key; current when it matches the latest FY, otherwise D-188 gates apply. */
  staleNoncontrollingEarnings?: ValuationBundleInputs["noncontrollingEarnings"];
  latestAnnualIncomeDate?: string | null;
  analysisCutoff?: string | null;
  /*
   * D-19: TOTAL lease liabilities (FMP `capitalLeaseObligations`), already inside `totalDebt` and
   * therefore inside `netDebt`. Null when undisclosed. Disclosure context only — the bridge adjusts
   * by `operatingLeaseLiability`.
   */
  leaseLiability?: number | null;
  /*
   * D-19: the OPERATING slice, the only one the equity bridge may net out of net debt.
   * Finance-lease interest is below EBIT and its right-of-use amortisation is added back in EBITDA,
   * so its liability is debt in both frames. Null when the split is unavailable ⇒ net debt is used
   * as reported.
   */
  operatingLeaseLiability?: number | null;
  /** D-19: METIS_EV_INCLUDE_LEASES — keep leases in the EV bridge. */
  includeLeasesInEv?: boolean;
  /**
   * D-60: marketable equity securities the house net debt excluded from cash,
   * at their filed fair value. The DCF bridge adds them back as a separately
   * disclosed non-operating asset. Null ⇒ none identified.
   */
  nonOperatingAssets?: { value: number; basis: string } | null;
  /**
   * D-65: the filed source of the long-term investments the DCF removes from
   * operating capital (balance date, filing, any XBRL carrying-value fact),
   * for the bridge disclosure. The amount is the DCF's own
   * (`DcfAssumptions.nonOperatingInvestments`), never supplied separately.
   */
  longTermInvestmentsBasis?: string | null;
  /**
   * D-104 and D-135: the asset-retirement, environmental, pension and OPEB, loss-contingency and
   * contingent-consideration obligations tagged at the bridge's balance date (or within D-104's
   * look-back), and any assets legally restricted to settle the retirement obligations. The DCF bridge
   * deducts them after tax, except the pension and OPEB deficit of a rate-regulated utility, which it
   * discloses. Null ⇒ none tagged.
   */
  debtLikeObligations?: DebtLikeObligations | null;
  /**
   * D-104, D-204: Read SIC through the established rate-regulated-utility set. Under the utility
   * reading, disclose rather than deduct the pension and OPEB deficit; a merchant generator sharing
   * the code may therefore be overstated by the after-tax deficit. A missing SIC does not establish
   * utility treatment, and a deducted pension line then carries the `sicUnknown` gap.
   */
  sicCode?: number | null;
  /** General route: DCF assumption inputs (null when not applicable). */
  dcfInputs: DcfAssumptionInputs | null;
  multiples: MultiplesFrameworkInputs;
  /** Bank/insurer route (null otherwise). */
  excessReturn: ExcessReturnInputs | null;
  /** Equity REIT route (null otherwise). */
  reit: ReitInputs | null;
}

export type ValuationResult =
  | {
      kind: "ineligible";
      route: SectorRoute;
      multiples: MultiplesResult;
      notes: string[];
      gaps: ManifestEntry[];
    }
  | {
      kind: "dcf";
      route: SectorRoute;
      assumptions: DcfAssumptions | null;
      dcf: DcfResult | null;
      sensitivity: SensitivityGrid | null;
      /** D-60: year-one growth × sustained margin grid; absent on results built before D-60. */
      growthMarginGrid?: GrowthMarginGrid | null;
      reverseDcf: ReverseDcfResult | null;
      multiples: MultiplesResult;
      notes: string[];
      gaps: ManifestEntry[];
    }
  | {
      kind: "excess-return";
      route: SectorRoute;
      excessReturn: ExcessReturnResult;
      multiples: MultiplesResult;
      notes: string[];
      gaps: ManifestEntry[];
    }
  | {
      kind: "reit";
      route: SectorRoute;
      reit: ReitValuationResult;
      multiples: MultiplesResult;
      notes: string[];
      gaps: ManifestEntry[];
    }
  | {
      kind: "pre-revenue";
      route: SectorRoute;
      multiples: null;
      notes: string[];
      gaps: ManifestEntry[];
    }
  | {
      /**
       * General route with an overlay-suppressed DCF, or a FIN-OTHER prior
       * suppression retained because newly applicable model inputs fail.
       * Multiples remain available; metricPolicy separately decides which
       * ones are applicable for the actual route/overlays. Unlike pre-revenue,
       * `multiples` is a real MultiplesResult, not null.
       */
      kind: "dcf-suppressed";
      /** Specific disclosure when prior suppression is retained for unsupported FIN-OTHER inputs. */
      suppressionReason?: string;
      suppressionKind?: "route-policy" | "input-evidence";
      route: SectorRoute;
      multiples: MultiplesResult;
      notes: string[];
      gaps: ManifestEntry[];
    };

/**
 * Dispatch per sector route: general -> DCF + sensitivity + reverse DCF +
 * multiples; bank/insurer/mortgage-REIT -> excess-return + book multiples
 * (NO DCF); equity REIT -> reitValuation + FFO multiples; pre-revenue overlay
 * -> null valuation (runway framing handled by a different module).
 */
/**
 * D-135 (a withheld enrichment is unknown, not absent): no claim is added and nothing is withheld,
 * but the reader is told, for each consumer whose own balance date the withheld enrichment touched.
 * The DCF bridge reads the statement-date row and the enterprise value reads the anchor row, so
 * the dates can differ. A consumer that publishes no figure is not named.
 */
export function valueCompany(route: CompanyRoute, inputs: ValuationBundleInputs): ValuationResult {
  const result = valueCompanyCore(route, inputs);
  const unknown = inputs.temporaryEquityUnknown ?? null;
  if (unknown === null || route.base === "bank" || route.base === "insurer" || route.base === "reit-mortgage") return result;
  const published = result.kind === "dcf" && result.dcf !== null && isNum(result.dcf.perShare);
  const multiples = "multiples" in result ? result.multiples : null;
  const enterpriseValues = multiples !== null && multiples !== undefined && isNum(multiples.enterpriseValue.value);
  const dcfUnknown = published ? unknown.bridge : null;
  const evUnknown = enterpriseValues ? unknown.market : null;
  if (dcfUnknown === null && evUnknown === null) return result;
  const missing = (u: { date: string; reason: string }, consumers: string) =>
    `its SEC enrichment for the ${u.date} balance was withheld (${u.reason}); a redeemable preferred or redeemable noncontrolling claim at that date could not be established ` +
    `and may be missing from ${consumers}, which keep their figures without it`;
  const parts = dcfUnknown !== null && evUnknown !== null && dcfUnknown.date === evUnknown.date
    ? [missing(dcfUnknown, "the DCF bridge and the enterprise values")]
    : [...(dcfUnknown !== null ? [missing(dcfUnknown, "the DCF bridge")] : []), ...(evUnknown !== null ? [missing(evUnknown, "the enterprise values")] : [])];
  result.gaps.push(gapEntry("valuation.temporaryEquity.unknown", `The issuer has tagged temporary equity in some period, but ${parts.join("; and ")}.`, "warn"));
  return result;
}

function valueCompanyCore(route: CompanyRoute, inputs: ValuationBundleInputs): ValuationResult {
  const notes: string[] = [];
  const gaps: ManifestEntry[] = [];
  if (route.modelEligibility?.status === "unresolved") {
    const { reason, sources } = route.modelEligibility;
    const entry: ManifestEntry = { field: "valuation.modelEligibility", reason, severity: "warn", attemptedSources: sources };
    // No model is selected, so no multiple/history/peer rank can smuggle its
    // assumptions back into the grade. Raw source statements remain upstream.
    return { kind: "ineligible", route: route.base, notes: [reason], gaps: [entry], multiples: {
      multiples: [], sectorAppropriate: [],
      enterpriseValue: { value: null, excludingLeases: null, includingLeases: null,
        leaseLiability: null, includeLeases: inputs.includeLeasesInEv === true, basis: reason },
      asOf: { quote: inputs.multiples.quote.priceAsOf ?? null, statements: inputs.multiples.incomeTtm?.date ?? null },
      notes: [reason], gaps: [entry],
    } };
  }

  // D-147: deduct each filed preferred series once before offering conversion readings.
  const foldedPreferred = foldConvertiblePreferred(inputs.preferred ?? null, inputs.convertiblePreferredClaim, inputs.preferredSeriesDistinct);
  inputs = { ...inputs, preferred: foldedPreferred.preferred };
  if (foldedPreferred.gap) gaps.push(foldedPreferred.gap);
  // D-135: redeemable preferred and redeemable NCI are claims senior to common, carried outside
  // every equity field the bridge reads. Fold them into `preferred` and `minorityInterest` here,
  // before the earnings key block, so the redeemable NCI joins book NCI as the floor of the
  // earnings key test (never a second deduction) and every D-26 re-run inherits the claims.
  const temporaryClaims = inputs.temporaryEquity ?? null;
  const temporaryRefusal = temporaryClaims?.refusal ?? null;
  const temporaryAdmitted = temporaryClaims !== null && temporaryRefusal === null && temporaryClaims.total !== 0 ? temporaryClaims : null;
  const redeemableNoncontrolling = temporaryAdmitted?.redeemableNoncontrolling ?? 0;
  let temporaryEquityDisclosure: TemporaryEquityDisclosure | null = null;
  let temporaryEquityNote: string | null = null;
  if (temporaryAdmitted !== null) {
    const parentLike = temporaryAdmitted.redeemablePreferred + temporaryAdmitted.unsplit;
    inputs = { ...inputs,
      ...(parentLike !== 0 ? { preferred: (isNum(inputs.preferred) ? inputs.preferred : 0) + parentLike } : {}),
      // A null book NCI is not a zero claim under the NCI earnings key (D-102): it stays null and the
      // redeemable amount is carried beside it.
      ...(redeemableNoncontrolling !== 0 && isNum(inputs.minorityInterest) ? { minorityInterest: inputs.minorityInterest + redeemableNoncontrolling } : {}) };
    temporaryEquityDisclosure = { redeemablePreferred: temporaryAdmitted.redeemablePreferred, redeemableNoncontrolling,
      unsplit: temporaryAdmitted.unsplit, basis: temporaryAdmitted.basis };
    const parts = [
      ...(temporaryAdmitted.redeemablePreferred !== 0 ? [`temporary equity attributable to the parent (redeemable preferred and other redeemable parent equity) of ${millions(temporaryAdmitted.redeemablePreferred)}, deducted beside preferred`] : []),
      ...(temporaryAdmitted.unsplit !== 0 ? [`temporary equity of ${millions(temporaryAdmitted.unsplit)} with no filed parent/NCI split, deducted beside preferred`] : []),
      ...(redeemableNoncontrolling !== 0 ? [`redeemable noncontrolling interests of ${millions(redeemableNoncontrolling)}, added to the book noncontrolling interest as the floor of the larger-of test (E-5), never deducted twice`] : []),
    ];
    temporaryEquityNote = `DCF equity bridge deducts ${parts.join(" and ")}: filed in temporary equity outside every equity field, they are claims senior to common (${temporaryAdmitted.basis}; house rule).` +
      (parentLike !== 0
        ? " This caption can also hold redeemable common shares (for example shares subject to possible redemption or an ESOP put), which may already be in the diluted share count; " +
          "the filed facts do not separate them from redeemable preferred, so such shares would be counted both as a claim and in the divisor."
        : "");
  }
  // D-105: the critical DCF gap names this gate, not a missing caller input.
  let dcfWithheldCause: string | null = null;
  // D-135: the DCF-only gates read the balance the bridge reads.
  const bridgeBalance = inputs.bridgeBalance ?? inputs.multiples.balance;
  if ((inputs.noncontrollingOwnershipUnresolved === true || noncontrollingOwnershipUnresolved(bridgeBalance)) && inputs.dcfInputs !== null) {
    const reason = "Consolidated equity has no resolved parent/NCI split, or differs from parent equity, and the NCI allocation is unavailable. The consolidated operating DCF cannot be presented as parent/common equity by treating unknown outside claims as zero; book NCI would itself be only a proxy for market value.";
    gaps.push(gapEntry("valuation.dcf.noncontrollingOwnership", reason, "warn"));
    notes.push(reason);
    dcfWithheldCause = `DCF withheld: noncontrolling ownership unresolved at ${bridgeBalance?.date ?? "the valuation balance date"} (the balance sheet carries consolidated equity without a filed parent/NCI split; see valuation.dcf.noncontrollingOwnership)`;
    inputs = { ...inputs, dcfInputs: null, dilutedShares: null };
  }

  // D-102 (NCI on the earnings key): a consolidated DCF bridged to common equity needs the outside
  // holders' share of profit to size their claim. Without it the DCF runs on book NCI only to test its
  // domain (book is the smallest deduction the rule allows), and the per-share value is then withheld.
  let noncontrollingEarningsShare: number | null = null;
  let noncontrollingKeyMissing: string | null = null;
  const filedKey = inputs.staleNoncontrollingEarnings;
  if (filedKey && filedKey.asOf === inputs.latestAnnualIncomeDate &&
      (!isNum(inputs.noncontrollingEarnings?.noncontrollingIncome) || !isNum(inputs.noncontrollingEarnings?.consolidatedProfit))) {
    inputs = { ...inputs, noncontrollingEarnings: filedKey };
    if (filedKey.sourceBasis) notes.push(filedKey.sourceBasis);
  }
  const noncontrollingEarningsAsOf = inputs.noncontrollingEarnings?.asOf ?? null;
  const noncontrollingEarningsBasis = inputs.noncontrollingEarnings?.basis;
  // A zero book balance does not negate the outside claim positive NCI income shows.
  const noncontrollingIncomeClaim = isNum(inputs.noncontrollingEarnings?.noncontrollingIncome) && inputs.noncontrollingEarnings.noncontrollingIncome > 0;
  // A signed NCI income, profit or loss, shows outside holders exist.
  const noncontrollingIncomeSigned = isNum(inputs.noncontrollingEarnings?.noncontrollingIncome) && inputs.noncontrollingEarnings.noncontrollingIncome !== 0;
  if (!isNum(inputs.minorityInterest) && (noncontrollingIncomeSigned || redeemableNoncontrolling > 0)) {
    // Neither book nor the larger of book and the profit share can be set
    // without the book balance; a null book is not a zero claim. A redeemable
    // NCI is itself evidence of outside holders, as signed NCI income is.
    const earnings = inputs.noncontrollingEarnings;
    const allocated = noncontrollingIncomeSigned && earnings
      ? `are allocated ${fmtNum(earnings.noncontrollingIncome!)} of ${earnings.basis === "annual" ? "fiscal-year" : "trailing"} net income`
      : null;
    const unavailable = "but their book value is unavailable, so the deduction can be set neither at book" +
      `${redeemableNoncontrolling > 0 ? " (plus the redeemable amount)" : ""} nor at the larger of ${redeemableNoncontrolling > 0 ? "that" : "book"} and their profit share. `;
    const withheld = "The per-share value is withheld: the consolidated DCF would otherwise credit the outside holders' claim to common holders (audit 2026-10-22 E-5).";
    noncontrollingKeyMissing = redeemableNoncontrolling > 0
      ? `Noncontrolling interests hold a redeemable noncontrolling interest of ${millions(redeemableNoncontrolling)} filed in temporary equity${allocated === null ? "" : ` and ${allocated}`}, ${unavailable}${withheld}`
      : `Noncontrolling interests ${allocated}, ${unavailable}${withheld}`;
  } else if (isNum(inputs.minorityInterest) && (inputs.minorityInterest !== 0 || noncontrollingIncomeClaim)) {
    const earnings = inputs.noncontrollingEarnings ?? null;
    const period = earnings?.basis === "annual" ? `fiscal-year (${earnings.asOf ?? "date unavailable"})` : "trailing";
    // A share above 1 (the parent's own share negative) is not a claim on value.
    if (earnings !== null && isNum(earnings.noncontrollingIncome) && isNum(earnings.consolidatedProfit) && earnings.consolidatedProfit > 0 &&
      earnings.noncontrollingIncome <= earnings.consolidatedProfit) {
      noncontrollingEarningsShare = earnings.noncontrollingIncome / earnings.consolidatedProfit;
    } else {
      noncontrollingKeyMissing = `Noncontrolling interest of ${fmtNum(inputs.minorityInterest)} sits in the consolidated DCF, but its share of consolidated profit could be established from neither the trailing four quarters nor the latest fiscal year ` +
        (earnings === null ? "(no trailing or fiscal-year noncontrolling and consolidated profit)"
          : !isNum(earnings.noncontrollingIncome) ? `(${period} profit attributable to noncontrolling interests unavailable)`
          : !isNum(earnings.consolidatedProfit) ? `(${period} consolidated profit unavailable)`
          : earnings.consolidatedProfit <= 0 ? `(${period} consolidated profit ${fmtNum(earnings.consolidatedProfit)} is not positive)`
          : `(${period} profit attributable to noncontrolling interests ${fmtNum(earnings.noncontrollingIncome)} exceeds consolidated profit ${fmtNum(earnings.consolidatedProfit)}, so the parent's own share is negative)`) +
        ". The per-share value is withheld: book NCI alone can understate the outside holders' claim on a consolidated valuation (audit 2026-10-22 E-5).";
    }
  }

  if (route.overlays.includes("pre-revenue")) {
    notes.push(
      "pre-revenue: DCF, reverse DCF and multiples suppressed (denominators zero/negative); runway + scenario framing handled elsewhere",
    );
    gaps.push(gapEntry("valuation", "pre-revenue company — no meaningful intrinsic-value model in v1", "info"));
    return { kind: "pre-revenue", route: route.base, multiples: null, notes, gaps };
  }

  const adr = route.overlays.includes("adr") || inputs.multiples.quote.isAdr === true;
  if (adr) {
    const security = resolveSecurityBasis(inputs.multiples.securityBasis ?? [], inputs.multiples.securityBasisAsOf ?? "");
    const quotedSharesKnown = inputs.dilutedShareSecurityBasis === "quoted" && security?.quoteUnit === "ADS" &&
      (inputs.multiples.quote.issuerId === undefined || inputs.multiples.quote.issuerId === security.issuerId) &&
      (inputs.multiples.quote.securityId === undefined || inputs.multiples.quote.securityId === security.securityId);
    inputs = { ...inputs, multiples: { ...inputs.multiples, quote: { ...inputs.multiples.quote, isAdr: true } } };
    if (!quotedSharesKnown) {
      const reason = "ADR per-share valuation withheld: weighted-average diluted shares are not established as shares of the quoted ADS with verified effective-dated security evidence; no depositary ratio is guessed";
      notes.push(reason);
      gaps.push(gapEntry("valuation.perShare.securityBasis", reason, "warn"));
      inputs = { ...inputs, dilutedShares: null,
        excessReturn: inputs.excessReturn ? { ...inputs.excessReturn, dilutedShares: null } : null,
        reit: inputs.reit ? { ...inputs.reit, shares: null, sharePrice: null } : null };
    }
    if (inputs.multiples.quote.marketCapSecurityBasis !== "issuer-common" && inputs.excessReturn) {
      inputs = { ...inputs, excessReturn: { ...inputs.excessReturn, marketCap: null } };
    }
  }

  const economicScope = resolveEconomicEquityScope(inputs.multiples.quote,
    inputs.multiples.economicShareEvidence ?? [], inputs.multiples.securityBasisAsOf ?? "");
  const multiclassEvidence = inputs.multiples.economicShareEvidence?.some(row => row.classes.length > 1) === true;
  if (economicScope.status === "unresolved" ||
    (multiclassEvidence && inputs.dilutedShareSecurityBasis !== "issuer-economic")) {
    const reason = "Per-share intrinsic valuation withheld: common-class coverage or the economic basis of weighted-average diluted shares is unresolved. Outstanding class counts do not establish the diluted denominator; no class ratio is guessed." +
      (economicScope.status === "resolved" && inputs.dilutedShareEconomicBasis ? ` ${inputs.dilutedShareEconomicBasis}` : ` ${economicScope.basis}`);
    notes.push(reason);
    gaps.push(gapEntry("valuation.perShare.economicClassBasis", reason, "warn"));
    inputs = { ...inputs, dilutedShares: null,
      excessReturn: inputs.excessReturn ? { ...inputs.excessReturn, dilutedShares: null } : null,
      reit: inputs.reit ? { ...inputs.reit, shares: null, sharePrice: null } : null };
  } else if (multiclassEvidence && inputs.dilutedShareEconomicBasis) {
    notes.push(inputs.dilutedShareEconomicBasis);
    gaps.push(gapEntry("valuation.perShare.economicClassBasis", inputs.dilutedShareEconomicBasis, "info"));
  }
  // D-135: said once, and only where a per-share value that divides by the count is published (the
  // DCF, the excess-return route and the REIT FFO/AFFO per share).
  const divisorDisclosure = (perShare: number | null | undefined, shares: number | null | undefined = inputs.dilutedShares): void => {
    if (inputs.dilutedShareDivisor === undefined || !isNum(perShare) || !isNum(shares) || shares <= 0) return;
    gaps.push(gapEntry("valuation.perShare.lossPeriodDivisor", inputs.dilutedShareDivisor.note, "info"));
    if (inputs.dilutedShareDivisor.basis !== "loss-period-substituted" || !notes.some((n) => n.startsWith("Per-share values divide by the latest period's basic count plus"))) {
      notes.push(inputs.dilutedShareDivisor.note);
    }
  };
  if (economicScope.status !== "unverified-vendor-scope") inputs = { ...inputs,
    excessReturn: inputs.excessReturn ? { ...inputs.excessReturn, marketCap: economicScope.marketCap } : null };

  const multiples = multiplesFramework(route.base, inputs.multiples);
  // D-265 (P3, P20): each multiple's basis names the share count it sits on and the measured difference.
  const restoredFromFiled = inputs.dilutedShareDivisor?.basis === "loss-period-substituted" ? inputs.dilutedShareDivisor.filedShares ?? null : null;
  const shareScopeOwner = { restoredFromFiled, ...(economicScope.multiClass ? { scopeOwner: "class" as const }
    : inputs.multiples.quote.isAdr === true ? { scopeOwner: "quoted-unit" as const } : {}) };
  const quoteShares = isNum(inputs.multiples.quote.marketCap) && isNum(inputs.multiples.quote.price) && inputs.multiples.quote.price > 0
    ? inputs.multiples.quote.marketCap / inputs.multiples.quote.price : null;
  const multiplesShareBasis = compareShareBasis(inputs.dilutedShares, quoteShares, inputs.employeeTrustShares, shareScopeOwner);
  if (multiplesShareBasis !== null) {
    const onMarketCap = (key: MultipleKey, basis: string) => key !== "peTtm" || basis.startsWith("market cap /");
    const quoteDay = inputs.multiples.quote.priceAsOf;
    const withSentence = (basis: string, marketCap: boolean): string => {
      const sentence = shareBasisSentence(multiplesShareBasis, marketCap, quoteDay);
      return sentence === null ? basis : `${basis}${/[.;]$/.test(basis.trimEnd()) ? "" : "."} ${sentence}`;
    };
    multiples.multiples = multiples.multiples.map(row => row.current === null ? row
      : { ...row, basis: withSentence(row.basis, onMarketCap(row.key, row.basis)) });
    if (multiples.peerCoverage) multiples.peerCoverage = { ...multiples.peerCoverage, comparisons: multiples.peerCoverage.comparisons.map(c =>
      c.current === null ? c : { ...c, basis: withSentence(c.basis, true) }) };
  }
  const cashFlowApplicability = route.cashFlowApplicability;
  if (cashFlowApplicability?.status === "not-applicable") {
    const reason = cashFlowApplicability.reason;
    multiples.multiples = multiples.multiples.map(row => ["priceToFcf", "evToEbitda", "evToSales"].includes(row.key) ? { key: row.key, current: null, basis: reason, ownHistory: null, peers: null } : row);
    multiples.sectorAppropriate = multiples.sectorAppropriate.filter(key => !["priceToFcf", "evToEbitda", "evToSales"].includes(key));
    if (!multiples.sectorAppropriate.includes("priceToTbv")) multiples.sectorAppropriate.push("priceToTbv");
    multiples.multiples = multiples.multiples.map(row => row.key === "priceToTbv" ? { ...row,
      basis: `${row.basis}. Applicable lender equity multiple, read against ROTE; the dated tangible common equity deducts goodwill and identified intangible assets. Missing or nonpositive tangible common equity withholds the value, not the route's applicability.` } : row);
    multiples.notes.push(reason);
    const bridge = multiples.enterpriseValue;
    const contextBasis = inputs.multiples.balance?.date === cashFlowApplicability.asOf ? cashFlowApplicability.evDebtBasis : undefined;
    bridge.basis = contextBasis
      ? `${contextBasis} ${bridge.basis.replace("EV/EBITDA uses this same EV.", "Industrial EV multiples are not applicable.")}`
      : `EV context unavailable: the filed debt components do not tie to the retained provider debt perimeter at the selected balance date. ${reason}`;
    multiples.notes = multiples.notes.map(note => note.replace("EV/EBITDA uses this same EV.", "Industrial EV multiples are not applicable."));
    if (!contextBasis) { bridge.value = null; bridge.excludingLeases = null; bridge.includingLeases = null; }

    multiples.gaps = multiples.gaps.filter(g => !g.field.startsWith("valuation.multiples.priceToFcf"));
  }
  if (route.base === "reit" && inputs.reit && multiples.enterpriseValue.noncontrollingInterestBasis === "unknown-allocation") {
    const reason = "REIT enterprise value and implied cap rate withheld: consolidated equity establishes outside ownership but the NCI allocation is unavailable; no market NCI value is inferred from the book-equity difference. FFO figures are evaluated separately.";
    notes.push(reason);
    gaps.push(gapEntry("valuation.reit.noncontrollingOwnership", reason, "warn"));
  }
  // The one rule every comparison with the quote obeys (priceCurrency.ts):
  // statements and quote in ONE KNOWN currency, or no comparison at all.
  const quoteComparison = comparePriceCurrency(inputs.multiples.reportedCurrency, inputs.multiples.quote.currency);
  // Hoist the multiples model's own gaps (peers, ownHistory, priceToFfo) into
  // the valuation manifest, mirroring the excess-return and REIT hoists below.
  // Without this the peers gap added earlier never reached the missing-data
  // manifest, so a permanently empty peer column still had no disclosure.
  gaps.push(...multiples.gaps);

  if (route.base === "bank" || route.base === "insurer" || route.base === "reit-mortgage") {
    notes.push("FCFF DCF and FCFF reverse-DCF suppressed for financials (debt is raw material) — excess-return model used");
    /*
     * D-16: the three FCFF-derived outputs and the ROIC−WACC spread are all withheld on this route,
     * and each now says so in the manifest as well as the notes. They were structurally absent
     * before — nothing computed them — but an absence with no stated reason reads to a report
     * reader as missing data rather than as a deliberate methodological refusal.
     */
    gaps.push(
      gapEntry(
        "valuation.dcf",
        `FCFF DCF withheld on the '${route.base}' route: FCFF is before debt service, but debt, cash and reinvestment cannot be separated reliably into operating and financing items for a deposit-, float- or repo-funded balance sheet — the equity excess-return model is used instead`,
        "info",
      ),
      gapEntry(
        "valuation.reverseDcf",
        `FCFF reverse DCF withheld on the '${route.base}' route: it inverts the same FCFF model, so the growth or margin it would solve for inherits the same category error — the excess-return model's reverse solve (the starting ROE at which the model's value per share equals the price, with market cap only as a disclosed fallback) is reported instead`,
        "info",
      ),
      gapEntry(
        "valuation.evEbitda",
        `EV/EBITDA withheld on the '${route.base}' route: enterprise value adds debt and subtracts cash, both of which are operating items here, so the multiple is not defined (a profitable bank can show a negative EV)`,
        "info",
      ),
      gapEntry(
        "returns.roicVsWacc",
        `ROIC − WACC withheld on the '${route.base}' route: invested capital (debt + equity − cash) is undefined when deposits, policy reserves or repo fund the assets and cash is itself an earning asset — return on tangible common equity against the cost of equity is the value-creation read instead`,
        "info",
      ),
    );
    if (route.base === "reit-mortgage") {
      notes.push("mortgage REIT routed to the book-value (excess-return) map (docs/METHODOLOGY.md, Financial-company routes)");
    }
    const er = inputs.excessReturn
      ? excessReturnModel({ ...inputs.excessReturn, quoteAsOf: inputs.multiples.quote.priceAsOf ?? null })
      : excessReturnModel({ bookValue: null, currentRoePct: null, costOfEquityPct: null });
    if (!inputs.excessReturn) {
      gaps.push(gapEntry("valuation.excessReturn", "excess-return inputs not provided by caller", "critical"));
    }
    // Currency guard, the excess-return twin of the DCF guard below. The
    // per-share value is in the statements' reportedCurrency while the price it
    // is graded against is the quote currency, so on a mismatch the upside is
    // off by the FX rate. Suppress the per-share (and the reverse solve,
    // which compares the statement-currency model to the quote) rather
    // than publish a mixed-currency comparison. No FX conversion attempted.
    const erReported = inputs.multiples.reportedCurrency;
    const erQuote = inputs.multiples.quote.currency;
    if (!quoteComparison.comparable && quoteComparison.mismatch) {
      const currencyReason = `Currency translation not admitted: statements in ${erReported}, quote in ${erQuote}`;
      notes.push(
        `${currencyReason} — excess-return per-share and reverse solve suppressed; ` +
          "See multiples (flagged) for relative valuation.",
      );
      gaps.push(
        gapEntry(
          "valuation.excessReturn.currency",
          `${currencyReason} — excess-return per-share suppressed rather than comparing a per-share value in one currency with a price in another`,
          "critical",
        ),
      );
      const guarded: ExcessReturnResult = {
        ...er,
        priceToTangibleBookVsRote: withholdPriceToTangibleBook(er.priceToTangibleBookVsRote, currencyReason),
        perShare: null,
        startAlternative: undefined,
        startCoeGrid: undefined,
        reverseSolve: {
          impliedCurrentRoePct: null,
          notes: [
            ...er.reverseSolve.notes,
            `reverse solve suppressed: the quote is in ${erQuote} while book value is in ${erReported}`,
          ],
        },
      };
      // Hoist the model-level gaps on this path too. Suppressing the per-share
      // does not make the CoE/bookValue/payout/ROE gaps irrelevant — an ADR is
      // exactly where the reader needs to see everything else that was missing,
      // so returning early without them made a degraded model MORE opaque than
      // the unguarded path below.
      gaps.push(...er.gaps);
      return { kind: "excess-return", route: route.base, excessReturn: guarded, multiples, notes, gaps };
    }
    if (!quoteComparison.comparable) {
      // Currency unknown on one side: the per-share value (book value and ROE,
      // all statements) stands in its own currency, but the reverse solve sets
      // the statement-currency model against the quote and is withheld.
      gaps.push(
        gapEntry(
          "valuation.excessReturn.reverseSolve.currency",
          `${quoteComparison.reason} — the market-implied ROE sets the quote against book value, so it is withheld`,
          "warn",
        ),
      );
      gaps.push(...er.gaps);
      const withheld: ExcessReturnResult = {
        ...er,
        priceToTangibleBookVsRote: withholdPriceToTangibleBook(er.priceToTangibleBookVsRote, quoteComparison.reason),
        reverseSolve: {
          impliedCurrentRoePct: null,
          notes: [...er.reverseSolve.notes, `reverse solve withheld: ${quoteComparison.reason}`],
        },
      };
      return { kind: "excess-return", route: route.base, excessReturn: withheld, multiples, notes, gaps };
    }
    // Hoist model-level gaps (CoE/bookValue/payout/ROE suppression, …) so
    // they reach the merged manifest, mirroring the general branch's
    // gaps.push(...built.gaps) — otherwise a suppressed model is invisible in
    // the report appendix.
    gaps.push(...er.gaps);
    divisorDisclosure(er.perShare);
    return { kind: "excess-return", route: route.base, excessReturn: er, multiples, notes, gaps };
  }

  if (route.base === "reit") {
    notes.push("FCFF DCF suppressed for equity REITs — P/FFO / P/AFFO + cap-rate sketch used");
    /*
     * D-16: a net-income DCF is withheld on this route with the reason, not merely omitted.
     * Real-estate depreciation is a large non-cash charge against a REIT's GAAP net income, so
     * discounting that net income would value the company on an earnings figure the industry itself
     * replaces with FFO.
     */
    gaps.push(
      gapEntry(
        "valuation.netIncomeDcf",
        "net-income DCF withheld on the equity-REIT route: GAAP net income is struck after real-estate depreciation, a non-cash charge on assets that typically hold or gain value, so discounting it would understate the company — FFO/AFFO and P/FFO are used instead, per the NAREIT definition",
        "info",
      ),
    );
    // P/FFO, P/AFFO and the implied cap rate set the quote against the
    // statements; FFO per share does not. Without one known currency the price
    // is withheld from the block, so only the price-free figures remain.
    if (inputs.reit && !quoteComparison.comparable) {
      gaps.push(
        gapEntry(
          "valuation.reit.currency",
          `${quoteComparison.reason} — P/FFO, P/AFFO and the implied cap rate withheld; FFO and AFFO per share stand`,
          "warn",
        ),
      );
    }
    // The lease refusal is already in the multiples' EV (null), which the block reads; the gap stays.
    const reitDebtRefusal = leaseDebtScopeRefusal(inputs.multiples.balance, inputs.includeLeasesInEv === true);
    if (reitDebtRefusal) gaps.push(gapEntry("valuation.reit.enterpriseValue.leaseScope", reitDebtRefusal, "critical"));
    // D-135: the market cap P/FFO was priced on and the house EV come from the multiples. Every
    // guard that withholds the price (ADR security basis, unresolved class basis, price currency)
    // withholds both with it.
    const reitInputs: ReitInputs | null = inputs.reit && !quoteComparison.comparable ? { ...inputs.reit, sharePrice: null } : inputs.reit ?? null;
    const reitBridge = multiples.enterpriseValue;
    const reitMarketCap = reitInputs !== null && reitInputs.sharePrice !== null ? posOrNull(reitBridge.equityScope?.marketCap) : null;
    const reit = reitInputs !== null
      ? reitValuation({
        ...reitInputs,
        marketCap: reitMarketCap,
        enterpriseValue: reitMarketCap === null ? null : {
          value: reitBridge.value,
          // The multiples' own basis, verbatim: every component and amount matches by construction (D-26).
          basis: reitBridge.basis,
        },
      })
      : reitValuation({ ffoApprox: null, affoApprox: null, sharePrice: null, shares: null });
    if (!inputs.reit) {
      gaps.push(gapEntry("valuation.reit", "REIT inputs not provided by caller", "critical"));
    }
    gaps.push(...reit.gaps);
    // D-135: FFO and AFFO per share divide by the same count; said once, where one is published.
    // D-233: that count is the REIT block's own (FFO's fiscal year), and the disclosure describes
    // that row.
    divisorDisclosure(reit.ffoPerShare ?? reit.affoPerShare, reitInputs?.shares);
    return { kind: "reit", route: route.base, reit, multiples, notes, gaps };
  }

  // D-204: the existing filed rate-regulation overlay establishes applicability.
  // Utility capex is financed with external capital earning an allowed return;
  // this FCFF model does not represent that rate-base funding cycle.
  if (route.overlays.includes("regulated-utility")) {
    const reason = "Regulated utility: large capital spending is funded with external capital that earns an allowed return. " +
      "The FCFF model does not capture that regulated rate-base funding cycle; intrinsic per-share value, reverse DCF and DCF scenario targets are withheld. " +
      "Use the retained P/E, dividend yield and EV/EBITDA multiples and peer comparisons for valuation context; no rate-base value is estimated.";
    gaps.push(gapEntry("valuation.dcf.regulatedUtility", reason, "info"));
    return { kind: "dcf-suppressed", suppressionKind: "route-policy", route: route.base, multiples, suppressionReason: reason, notes: [...notes, reason], gaps };
  }

  // General route: DCF + sensitivity + reverse DCF + multiples — unless
  // metricPolicy suppresses fcfDcf for this route's overlays (currently:
  // "unprofitable"), in which case an FCFF-based intrinsic-value model isn't
  // meaningful and we skip it entirely rather than returning a DCF the
  // report's own display policy says shouldn't be shown.
  if (metricPolicy(route).suppress.includes("fcfDcf")) {
    if (cashFlowApplicability?.status === "not-applicable") {
      const reason = cashFlowApplicability.reason;
      return { kind: "dcf-suppressed", suppressionKind: "route-policy", route: route.base, multiples, suppressionReason: reason, notes: [...notes, reason], gaps };
    }
    const reason = "DCF suppressed for unprofitable overlay — house rule: net income or operating cash flow is negative on the selected TTM/annual basis. " +
      "A separately supported normalization/turnaround forecast is required; see relative multiples and scenario/runway framing.";
    notes.push(`fcfDcf suppressed by metric policy (unprofitable overlay) — ${reason}`);
    gaps.push(
      gapEntry(
        "valuation.dcf",
        reason,
        "info",
        "dcf-unprofitable-overlay",
      ),
    );
    return { kind: "dcf-suppressed", suppressionKind: "route-policy", route: route.base, multiples, suppressionReason: reason, notes, gaps };
  }
  let assumptions: DcfAssumptions | null = null;
  let dcf: DcfResult | null = null;
  let sensitivity: SensitivityGrid | null = null;
  let growthMargin: GrowthMarginGrid | null = null;
  let reverse: ReverseDcfResult | null = null;
  // ADR currency guard (P4): the per-share DCF value is in the statements' reportedCurrency while the
  // price it is graded against is in the quote currency. On a mismatch the upside would be off by the
  // FX rate, so the DCF, reverse DCF and sensitivity grid are suppressed with a disclosed gap, exactly
  // as the multiples framework flags its currencyMismatch. No FX conversion is attempted.
  const dcfIn = inputs.dcfInputs;
  const dcfCurrencyMismatch =
    dcfIn !== null &&
    typeof dcfIn.reportedCurrency === "string" &&
    typeof dcfIn.quoteCurrency === "string" &&
    dcfIn.reportedCurrency.toUpperCase() !== dcfIn.quoteCurrency.toUpperCase();
  // Currency is checked FIRST because it is the root cause, not a symptom: an
  // ADR's WACC is itself suppressed for the same mismatch (the equity weight
  // would divide a quote-currency market cap by a reporting-currency debt
  // balance), so testing `waccPct` first would report the generic "WACC
  // unavailable" and hide the specific, actionable reason from the valuation
  // section entirely.
  if (dcfCurrencyMismatch) {
    notes.push(
      `ADR/currency mismatch: statements in ${dcfIn.reportedCurrency}, quote in ${dcfIn.quoteCurrency} — DCF, sensitivity grid and reverse DCF suppressed ` +
        `(per-share intrinsic value would be in ${dcfIn.reportedCurrency} against a ${dcfIn.quoteCurrency} price; no FX conversion attempted). ` +
        "See multiples (flagged) for relative valuation.",
    );
    gaps.push(
      gapEntry(
        "valuation.dcf.currency",
        `reportedCurrency ${dcfIn.reportedCurrency} != quote currency ${dcfIn.quoteCurrency} (ADR case) — DCF/reverse-DCF suppressed rather than comparing mixed-currency per-share vs price`,
        "critical",
      ),
    );
  } else if (dcfIn === null || !isNum(inputs.waccPct)) {
    gaps.push(
      gapEntry("valuation.dcf", dcfIn === null ? dcfWithheldCause ?? "DCF inputs not provided by caller"
        : `WACC unavailable — DCF suppressed${inputs.waccUnavailableReason ? `: ${inputs.waccUnavailableReason}` : ""}`, "critical"),
    );
  } else {
    const built = buildDcfAssumptions(dcfIn);
    gaps.push(...built.gaps);
    notes.push(...built.notes);
    assumptions = built.assumptions;
    if (assumptions !== null) {
      /*
       * D-19: the DCF equity bridge follows the SAME lease convention as the multiples EV. Net debt
       * is built from totalDebt, which already contains the lease liabilities, so the default
       * subtracts the OPERATING slice back out and METIS_EV_INCLUDE_LEASES=1 keeps it. Both bridges
       * are stated. Only the OPERATING slice leaves net debt. The finance-lease liability stays as
       * financing debt: its interest is below EBIT; its amortisation is inside EBIT and added back
       * in EBITDA.
       */
      const totalLeaseLiability =
        isNum(inputs.leaseLiability) && inputs.leaseLiability >= 0 ? inputs.leaseLiability : null;
      // D-97: the operating lease leaves net debt only when totalDebt is shown to hold it; otherwise net
      // debt is used as reported.
      const bridgeLeaseScope = operatingLeaseScopeUnproven({ ...bridgeBalance,
        capitalLeaseObligations: inputs.leaseLiability ?? bridgeBalance?.capitalLeaseObligations,
        operatingLeaseLiability: inputs.operatingLeaseLiability ?? bridgeBalance?.operatingLeaseLiability });
      if (bridgeLeaseScope !== null) gaps.push(gapEntry("valuation.dcf.netDebt.leaseScope", bridgeLeaseScope, "warn"));
      const leaseLiability =
        bridgeLeaseScope === null && isNum(inputs.operatingLeaseLiability) && inputs.operatingLeaseLiability >= 0
          ? inputs.operatingLeaseLiability
          : null;
      const financeLeaseLiability =
        isNum(bridgeBalance?.financeLeaseLiability) && bridgeBalance.financeLeaseLiability >= 0 ? bridgeBalance.financeLeaseLiability
        : totalLeaseLiability !== null && leaseLiability !== null
          ? Math.max(0, totalLeaseLiability - leaseLiability)
          : null;
      const includeLeases = inputs.includeLeasesInEv === true;
      const bridgeEvidence = { ...bridgeBalance, fieldProvenance: { ...bridgeBalance?.fieldProvenance },
        capitalLeaseObligations: inputs.leaseLiability ?? bridgeBalance?.capitalLeaseObligations,
        operatingLeaseLiability: inputs.operatingLeaseLiability ?? bridgeBalance?.operatingLeaseLiability };
      if (inputs.leaseLiability != null && inputs.leaseLiability !== bridgeBalance?.capitalLeaseObligations) delete bridgeEvidence.fieldProvenance.capitalLeaseObligations;
      if (inputs.operatingLeaseLiability != null && inputs.operatingLeaseLiability !== bridgeBalance?.operatingLeaseLiability) delete bridgeEvidence.fieldProvenance.operatingLeaseLiability;
      const leaseConflict = leaseDebtConflict({
        ...bridgeEvidence,
        totalDebt: bridgeBalance?.totalDebt,
        capitalLeaseObligations: inputs.leaseLiability,
        operatingLeaseLiability: inputs.operatingLeaseLiability,
        financeLeaseLiability: bridgeBalance?.financeLeaseLiability,
      });
      if (leaseConflict !== null) gaps.push(gapEntry("valuation.dcf.leaseIntegrity", leaseConflict, "critical"));
      const bridgeScopeRefusal = leaseDebtScopeRefusal(bridgeBalance, inputs.includeLeasesInEv === true);
      if (bridgeScopeRefusal) { notes.push(bridgeScopeRefusal); gaps.push(gapEntry("valuation.dcf.netDebt.leaseScope", bridgeScopeRefusal, "critical")); }
      const netDebtIncludingLeases = leaseConflict === null && bridgeScopeRefusal === null ? inputs.netDebt : null;
      const netDebtExcludingLeases =
        isNum(netDebtIncludingLeases) && leaseLiability !== null
          ? netDebtIncludingLeases - leaseLiability
          : netDebtIncludingLeases;
      const netDebtForBridge = includeLeases ? netDebtIncludingLeases : netDebtExcludingLeases;
      // A caller override is not the filed observation the row's provenance describes.
      // This only limits prose; the guard and bridge arithmetic above remain unchanged.
      if (isNum(netDebtIncludingLeases)) {
        notes.push(
          `DCF equity bridge: EV − net debt − minority interest − preferred equity. ` +
            leaseEvidenceNote(bridgeEvidence,
              { removed: !includeLeases ? leaseLiability : null, result: netDebtForBridge }) +
            (bridgeLeaseScope !== null ? ` ${bridgeLeaseScope}.` : "") +
            (financeLeaseLiability !== null && financeLeaseLiability > 0 ? ` The existing bridge retains a finance-lease amount of ${fmtNum(financeLeaseLiability)} under both conventions; this arithmetic is not a source-completeness attestation. Finance-lease right-of-use amortisation is inside EBIT, while its interest is below EBIT.` : "") +
            (financeLeaseOnlyTotal(totalLeaseLiability, inputs.operatingLeaseLiability, bridgeBalance?.financeLeaseLiability, leaseConflict) !== null
              ? ` ${financeLeaseOnlyEvClause(totalLeaseLiability!)}.` : ""),
        );
      }
      // D-60: equity securities left out of cash return as a non-operating asset at their filed
      // fair value, only when net debt itself bridges. D-65: so do the long-term investments the
      // sales-to-capital denominator removed as non-operating, at their filed carrying value.
      // D-135: a holding that met or exceeded invested capital is added back too. The exceed and
      // lease-emptied cases keep the filed provenance and swap only the clause that says the
      // denominator removes the amount.
      const components: NonOperatingAssetComponent[] = [];
      if (isNum(netDebtForBridge) && inputs.nonOperatingAssets && isNum(inputs.nonOperatingAssets.value) && inputs.nonOperatingAssets.value > 0) {
        components.push({ kind: "marketable-equity-securities", label: "marketable equity securities (filed fair value, not cash)",
          value: inputs.nonOperatingAssets.value, basis: inputs.nonOperatingAssets.basis });
      }
      const lti = assumptions.nonOperatingInvestments ?? null;
      if (isNum(netDebtForBridge) && lti !== null && isNum(lti.value) && lti.value > 0) {
        components.push({ kind: "long-term-investments", label: "long-term investments (filed carrying value)", value: lti.value,
          basis: (inputs.longTermInvestmentsBasis ?? `long-term investments ${fmtMoney(lti.value)} on the ${lti.balanceDate} balance sheet, at carrying value: ${LONG_TERM_INVESTMENTS_REMOVED_CLAUSE}`)
            .replace(LONG_TERM_INVESTMENTS_REMOVED_CLAUSE, lti.basis ?? LONG_TERM_INVESTMENTS_REMOVED_CLAUSE) });
      }
      for (const c of components) {
        const placement = c.kind === "long-term-investments" ? dcfIn.equityMethodStake : null;
        notes.push(
          `DCF equity bridge adds ${c.label} of ${fmtNum(c.value)}: ${c.basis}. ` +
            (placement?.incomePlacement === "in-operating-income" && placement.treatment === "added-back" && (placement.incomeExcludedFromEbit ?? placement.value > 0)
              ? `They are not cash: ${placement.basis}; no marketability discount or fair-value estimate is applied.`
              : placement?.treatment === "operating"
                ? `The equity-method portion ${millions(placement.value)} stays in operating capital; this line adds only the remaining non-operating investments, with no marketability discount or fair-value estimate.`
                : placement?.incomePlacement == null || placement.incomePlacement === "below-operating-income" || c.kind !== "long-term-investments"
                  ? "They are not cash: their gains and losses sit below operating income, so the FCFF path does not value them, and no marketability discount or fair-value estimate is applied."
                  : "They are not cash: their gains and losses are assumed below operating income under Regulation S-X Rule 5-03; placement is undetermined, so the existing add-back is retained, with no marketability discount or fair-value estimate." +
                    (placement?.incomePlacement === "in-operating-income" && placement.value <= 0 ? ` ${placement.basis}.` : "")),
        );
      }
      if (dcfIn.equityMethodStake?.treatment === "operating") notes.push(`DCF equity-method treatment: ${dcfIn.equityMethodStake.basis}.`);
      // D-98 (tax on investments): a stake reaches shareholders by being sold, and the gain is taxed. The
      // basis of each holding is not in the statements, so the whole carrying value is taxed at the
      // marginal rate: an upper bound on the tax, exact for stakes bought for next to nothing.
      const investmentTax = assumptions.investmentTax ?? null;
      const grossInvestments = components.reduce((sum, c) => sum + c.value, 0);
      if (investmentTax !== null && grossInvestments > 0 && investmentTax.ratePct > 0) {
        const value = -grossInvestments * investmentTax.ratePct / 100;
        const label = `estimated tax on non-operating investments (${fmtNum(investmentTax.ratePct)}% marginal rate, zero tax basis assumed)`;
        const basis = `${fmtNum(investmentTax.ratePct)}% of the ${fmtNum(grossInvestments)} added above; the rate is ${investmentTax.basis}. ` +
          "The tax basis of each holding is not filed in the statements, so none is assumed: this is the most the tax could be, and it overstates it for holdings carried near cost";
        components.push({ kind: "investment-tax", label, value, basis });
        notes.push(`DCF equity bridge subtracts the ${label} of ${fmtNum(-value)}: ${basis}.`);
      }
      // D-104, extended by D-135: filed retirement, environmental, pension and OPEB, loss-contingency and
      // contingent-consideration obligations are claims the FCFF path never pays, so the bridge deducts
      // them, AFTER tax at the D-98 marginal rate the bridge already uses for the investments it adds.
      // Funds legally restricted to retirement settle those first, less any long-term investments already
      // added above; the relief is applied to the amount deducted, never to the offset.
      const obligations = isNum(netDebtForBridge) ? inputs.debtLikeObligations ?? null : null;
      const taxRatePct = assumptions.investmentTax?.ratePct ?? 0;
      const afterTax = taxRatePct > 0;
      const keep = afterTax ? 1 - taxRatePct / 100 : 1;
      // A balance from an earlier filing is dated on its line; the bridge's
      // own balance-sheet date would otherwise be read as its date.
      const obligationLabel = (name: string, o: { asOf?: string }) =>
        `${name} (filed, ${afterTax ? `after tax at ${fmtNum(taxRatePct)}%` : "before tax"}${o.asOf === undefined ? "" : `; balance at ${o.asOf}, the latest filed`})`;
      const relief = (net: number) => (afterTax && net > 0 ? ` (${fmtNum(net * keep)} after the ${fmtNum(taxRatePct)}% tax relief)` : "");
      let retirementDeducted = false;
      if (obligations !== null) {
        const aro = obligations.assetRetirement;
        if (aro !== null && aro.value > 0) {
          // The fund may already be inside the investments added above; only
          // what lies beyond them is credited, so it is never counted twice.
          const assetsAdded = components.filter((c) => c.kind === "long-term-investments" || c.kind === "marketable-equity-securities")
            .reduce((sum, c) => sum + c.value, 0);
          const fund = obligations.settlementAssets;
          const offset = fund === null ? 0 : Math.min(aro.value, Math.max(0, fund.value - assetsAdded));
          const fundNote = fund === null ? ""
            : `, less assets legally restricted to settle them (${fund.basis}) of ${fmtNum(fund.value)}` +
              (assetsAdded > 0 ? ` beyond the investments of ${fmtNum(assetsAdded)} the bridge already adds` : "") +
              `: an offset of ${fmtNum(offset)}`;
          if (aro.value - offset > 0) {
            retirementDeducted = true;
            components.push({ kind: "debt-like-obligation", label: obligationLabel("asset-retirement obligations", aro), value: -((aro.value - offset) * keep), basis: `${aro.basis}${fundNote}` });
          }
          notes.push(fund === null
            ? `DCF equity bridge subtracts asset-retirement obligations of ${fmtNum(aro.value)}${relief(aro.value)}: ${aro.basis}.`
            : `DCF equity bridge weighs asset-retirement obligations of ${fmtNum(aro.value)} (${aro.basis})${fundNote}, so ${fmtNum(aro.value - offset)} is deducted${relief(aro.value - offset)}.`);
        }
        const deduct = (name: string, o: { value: number; basis: string; asOf?: string } | null | undefined) => {
          if (o === null || o === undefined || !(o.value > 0)) return;
          components.push({ kind: "debt-like-obligation", label: obligationLabel(name, o), value: -(o.value * keep), basis: o.basis });
          notes.push(`DCF equity bridge subtracts ${name} of ${fmtNum(o.value)}${relief(o.value)}: ${o.basis}.`);
        };
        deduct("environmental remediation accruals", obligations.environmental);
        const pension = obligations.pension ?? null;
        if (pension !== null && pension.value > 0) {
          if (isNum(inputs.sicCode) && RATE_REGULATED_UTILITY_SIC.has(inputs.sicCode)) {
            /*
             * D-104, D-204: Under regulated-utility accounting, costs can be recovered through
             * rates, but the offsetting regulatory asset is dimensional XBRL that companyfacts does
             * not carry. The same SIC also admits merchant generators, so disclose the utility
             * reading without asserting recovery.
             */
            const reading = `SIC ${inputs.sicCode} is read as a rate-regulated utility (ASC 980): its pension and OPEB deficit is disclosed, not deducted; ` +
              "a filer under this code whose rates do not recover the deficit (a merchant generator) is overstated by it after tax";
            notes.push(`Pension and other postretirement benefit deficits of ${millions(pension.value)} (${pension.basis}): ${reading}. ` +
              "The offsetting regulatory asset is reported only in dimensional XBRL, which the SEC companyfacts the bridge reads does not carry.");
            gaps.push(gapEntry("valuation.dcf.debtLikeObligations.rateRegulated",
              `Pension and OPEB deficit of ${millions(pension.value)}: ${reading}.`, "info"));
          } else {
            deduct("pension and other postretirement benefit deficits", pension);
            if (!isNum(inputs.sicCode)) {
              gaps.push(gapEntry("valuation.dcf.debtLikeObligations.sicUnknown",
                "The filer's SIC code is not established, so it is read as not a rate-regulated utility and its pension and OPEB deficit is deducted.", "info"));
            }
          }
        }
        deduct("loss-contingency accruals", obligations.lossContingencies);
        deduct("business-combination contingent consideration", obligations.contingentConsideration);
        if (components.some((c) => c.kind === "debt-like-obligation")) {
          notes.push("These are filed liabilities and the FCFF path does not project their settlement, so equity value is what remains after them. " +
            (afterTax
              ? `Each is deducted net of the tax relief a settlement would earn, at the ${fmtNum(taxRatePct)}% marginal-rate floor (${assumptions.investmentTax!.basis}). ` +
                "The relief is approximate: the rate omits state and local taxes and assumes the deduction is taken against taxable income in the year the claim is paid, " +
                "and a payment that is not deductible (a government fine or penalty, 26 U.S.C. §162(f)) or that only adds to tax basis (contingent consideration, which adds to the basis of the acquired assets or shares) " +
                `is credited a relief it will not earn, or not for years, understating that claim by up to ${fmtNum(taxRatePct)}% of it.` +
                (retirementDeducted ? " The retirement obligations' accretion, which filers charge to operating income, also lowers the projected NOPAT, so their time value is counted twice; the bridge does not adjust for it." : "")
              : "They are deducted at the recognised amount before any tax relief, which overstates the claim by the tax deduction a settlement would earn. " +
                "The retirement obligations' accretion, which filers charge to operating income, also lowers the projected NOPAT, so their time value is counted twice; the bridge does not adjust for either."));
          // D-135: none of these joins the market EV; say so where the EV is stated. Only the
          // families with a deducted line are named: a utility's disclosed pension deficit is not
          // one.
          const deductedFamilies = [
            ["retirement", /^asset-retirement/], ["environmental", /^environmental/], ["pension and OPEB", /^pension/],
            ["loss-contingency", /^loss-contingency/], ["contingent-consideration", /^business-combination contingent/],
          ].filter(([, label]) => components.some((c) => c.kind === "debt-like-obligation" && (label as RegExp).test(c.label))).map(([name]) => name as string);
          const named = deductedFamilies.length > 2 ? `${deductedFamilies.slice(0, -1).join(", ")} and ${deductedFamilies[deductedFamilies.length - 1]}` : deductedFamilies.join(" and ");
          multiples.enterpriseValue.basis += ` The debt-like obligations the DCF equity bridge deducts (${named}) are not added to the market EV.`;
        }
      }
      if (temporaryEquityNote !== null) notes.push(temporaryEquityNote);
      const nonOperatingTotal = components.reduce((sum, c) => sum + c.value, 0);
      let runOpts: DcfRunOptions = {
        waccPct: inputs.waccPct,
        netDebt: netDebtForBridge,
        dilutedShares: inputs.dilutedShares,
        minorityInterest: inputs.minorityInterest ?? null,
        preferred: inputs.preferred ?? null,
        ...(temporaryEquityDisclosure !== null ? { temporaryEquity: temporaryEquityDisclosure } : {}),
        ...(noncontrollingEarningsShare !== null ? { noncontrollingEarningsShare, noncontrollingEarningsAsOf, ...(noncontrollingEarningsBasis !== undefined ? { noncontrollingEarningsBasis } : {}) } : {}),
        ...(components.length > 0 ? { nonOperatingAssets: nonOperatingTotal, nonOperatingComponents: components } : {}),
      };
      dcf = runDcf(assumptions, runOpts);
      if (inputs.convertibles?.length && dcf.perShare !== null) {
        const original = runOpts;
        const variants = convertibleVariants(inputs.convertibles, { preferred: inputs.convertiblePreferredClaim ?? 0,
          notes: Math.max(0, inputs.bridgeBalance?.totalDebt ?? inputs.multiples.balance?.totalDebt ?? 0) });
        let best: DcfResult | null = null;
        for (const variant of variants) {
          const shares = original.dilutedShares === null ? null : original.dilutedShares - variant.sharesRemoved;
          if (shares === null || shares <= 0) continue;
          const candidateOpts = { ...original, dilutedShares: shares,
            netDebt: original.netDebt === null ? null : original.netDebt - variant.restored.notes,
            preferred: (original.preferred ?? 0) - variant.restored.preferred };
          const candidate = runDcf(assumptions, candidateOpts);
          if (candidate.perShare !== null && (best === null || candidate.perShare < best.perShare!)) {
            best = candidate; runOpts = candidateOpts; candidate.bridge.convertibles = variant.readings;
          }
        }
        if (best !== null) dcf = best;
        const entries = convertibleReadingGaps(dcf.bridge.convertibles ?? [], original.dilutedShares);
        gaps.push(...entries); notes.push(...entries.map(e => e.reason));
      }
      if (economicScope.approximation) dcf.notes.push(economicScope.approximation.basis);

      // D-188: a small stale filed allocation can only authorize a book claim.
      // Its absolute earnings share and book / consolidated equity must both
      // be below 1%; missing allocations and nonpositive profit are never zero.
      if (noncontrollingKeyMissing !== null && filedKey?.basis === "annual" && filedKey.asOf && inputs.analysisCutoff &&
          isNum(inputs.minorityInterest) && inputs.minorityInterest >= 0 && redeemableNoncontrolling === 0 &&
          isNum(filedKey.noncontrollingIncome) && isNum(filedKey.consolidatedProfit) && filedKey.consolidatedProfit > 0) {
        const oldest = new Date(`${inputs.analysisCutoff}T00:00:00Z`);
        oldest.setUTCMonth(oldest.getUTCMonth() - 24);
        const share = Math.abs(filedKey.noncontrollingIncome / filedKey.consolidatedProfit);
        const consolidated = dcf.equityValue === null ? null : dcf.equityValue + (dcf.bridge.noncontrollingDeducted ?? inputs.minorityInterest);
        if (filedKey.asOf <= inputs.analysisCutoff && Date.parse(filedKey.asOf) >= oldest.getTime() && share < 0.01 &&
            consolidated !== null && consolidated > 0 && inputs.minorityInterest / consolidated < 0.01) {
          const basis = `Immaterial NCI stale annual key ${filedKey.asOf}, within 24 months of cutoff ${inputs.analysisCutoff}: absolute allocation / consolidated profit ${(share * 100).toFixed(6)}% < 1%; book NCI / consolidated equity ${(inputs.minorityInterest / consolidated * 100).toFixed(6)}% < 1%. Book NCI is deducted; the stale allocation only sizes the E-5 test, whose 10% trigger is not met. ${filedKey.sourceBasis ?? "Filed annual allocation"}.`;
          noncontrollingKeyMissing = null;
          notes.push(basis);
          gaps.push(gapEntry("valuation.dcf.noncontrollingEarningsKey.staleImmaterial", basis, "info"));
        }
      }

      // D-102 (DCF domain tests): a DCF outside its domain publishes nothing built from its per-share.
      // The bridge and year rows stay, so a reader sees why; the critical gap names the failed test.
      const domain = dcfDomainFailure(dcf);
      if (domain !== null) {
        if (dcfIn?.operatingNormalizationBasis) domain.reason += ` Operating income excludes the completed sale: ${dcfIn.operatingNormalizationBasis}.`;
        dcf.domain = domain;
        dcf.perShare = null;
        notes.push(`${domain.reason}.`);
        gaps.push(gapEntry("valuation.dcf.domain", domain.reason, "critical"), ...dcf.gaps);
        return { kind: "dcf", route: route.base, assumptions, dcf, sensitivity: null, growthMarginGrid: null, reverseDcf: null, multiples, notes, gaps };
      }
      // D-102: inside its domain, but the NCI claim cannot be sized. The bridge stays visible at
      // book; nothing built from the per-share is published. The NCI reason leads only when no
      // earlier gate (shares, net debt) had already withheld the per-share value. D-135: a refused
      // temporary-equity operand, or an unsplit total beside the NCI earnings key (D-102; the
      // unsplit amount may be NCI the key already sizes), leaves the claim unknown: the per share
      // is withheld, never zero-filled (D-87). `runDcf` already withheld the
      // unsplit-beside-earnings-key case (and put its gap in `dcf.gaps`).
      const refusedReason = temporaryRefusal !== null
        ? `Temporary equity cannot be admitted as a claim: ${temporaryRefusal}. The per-share value is withheld: the redeemable preferred and redeemable noncontrolling claims are unknown, not zero (FIN-119).`
        : null;
      const temporaryEquityWithheld = refusedReason ?? dcf.temporaryEquityWithheld ?? null;
      if (noncontrollingKeyMissing !== null || temporaryEquityWithheld !== null) {
        // Each reason is recorded as the cause only when no earlier gate (shares, net debt) had already withheld the per share.
        if (noncontrollingKeyMissing !== null && dcf.perShare !== null) dcf.noncontrollingKeyWithheld = noncontrollingKeyMissing;
        if (refusedReason !== null && dcf.perShare !== null) dcf.temporaryEquityWithheld = refusedReason;
        dcf.perShare = null;
        dcf.equityValue = null;
        if (noncontrollingKeyMissing !== null) {
          notes.push(noncontrollingKeyMissing);
          gaps.push(gapEntry("valuation.dcf.noncontrollingEarningsKey", noncontrollingKeyMissing, "warn"));
        }
        if (temporaryEquityWithheld !== null) {
          notes.push(temporaryEquityWithheld);
          if (refusedReason !== null) gaps.push(gapEntry("valuation.dcf.temporaryEquityAllocation", refusedReason, "warn"));
        }
        gaps.push(...dcf.gaps);
        return { kind: "dcf", route: route.base, assumptions, dcf, sensitivity: null, growthMarginGrid: null, reverseDcf: null, multiples, notes, gaps };
      }
      // D-98 (improving margins): the improving fade is a judgment, so the reader sees what it is worth:
      // the value with the margin held at today's level.
      const fade = assumptions.improvingMarginFade;
      if (fade !== undefined && dcf.perShare !== null) {
        const flat = runDcf(
          { ...assumptions, ebitMarginPath: { ...assumptions.ebitMarginPath, value: assumptions.ebitMarginPath.value.map(() => fade.currentPct) } },
          runOpts,
        );
        if (flat.perShare !== null) {
          const text = `margin-fade sensitivity: ${fmtNum(dcf.perShare)} a share on the faded path to ${fmtNum(fade.targetPct)}%, ` +
            `${fmtNum(flat.perShare)} with the margin held flat at ${fmtNum(fade.currentPct)}%`;
          assumptions.ebitMarginPath.basis = `${assumptions.ebitMarginPath.basis}; ${text}`;
          notes.push(`DCF ${text}.`);
        }
      }
      sensitivity = sensitivityGrid(assumptions, runOpts);
      growthMargin = growthMarginGrid(assumptions, runOpts);
      // D-60: the terminal transition, stated. The explicit years reinvest
      // revenue growth / sales-to-capital; the Gordon year reinvests g / RONIC.
      // Where the two conventions disagree FCFF steps at year N+1, and the
      // reader should see that it is a convention meeting, not a forecast.
      const lastRow = dcf.yearRows.at(-1);
      if (lastRow && lastRow.nopat > 0) {
        const wTerm = (assumptions.wacc.value - dcf.gTermUsedPct) / 100;
        const fcffNext = dcf.terminalValue * wTerm;
        const roicTerm = assumptions.terminal.roicTermPct.value;
        const termReinvest = roicTerm > 0 ? Math.min(1, dcf.gTermUsedPct / roicTerm) : 0;
        const lastReinvest = lastRow.reinvestment / lastRow.nopat;
        const impliedRonic = (lastRow.nopat / lastRow.revenue) * assumptions.salesToCapital.value * 100;
        const step = lastRow.fcff !== 0 ? (fcffNext / lastRow.fcff - 1) * 100 : null;
        const text =
          `terminal transition: FCFF ${fmtMoney(lastRow.fcff)} in year ${lastRow.year} becomes ${fmtMoney(fcffNext)} in year ${lastRow.year + 1}` +
          `${step === null ? "" : ` (${step >= 0 ? "+" : ""}${fmtNum(step)}%)`}: reinvestment moves from ${fmtNum(lastReinvest * 100)}% of NOPAT ` +
          `(revenue growth / sales-to-capital, an implied return on new capital of ${fmtNum(impliedRonic)}%) to ${fmtNum(termReinvest * 100)}% ` +
          `(terminal growth ${fmtNum(dcf.gTermUsedPct)}% / terminal ROIC ${fmtNum(roicTerm)}%). The step is where the two reinvestment conventions meet, not a forecast`;
        assumptions.terminal.reinvestmentRate = { ...assumptions.terminal.reinvestmentRate, basis: `${assumptions.terminal.reinvestmentRate.basis}; ${text}` };
        notes.push(`DCF ${text}.`);
      }
      // D-60: say which share count divides the equity value. The weighted
      // diluted count includes option and RSU dilution; a quote's market cap
      // divides by basic shares outstanding at the quote date.
      const quotePrice = inputs.multiples.quote.price;
      const quoteCap = inputs.multiples.quote.marketCap;
      if (isNum(dcf.bridge.dilutedShares) && dcf.bridge.dilutedShares > 0 && isNum(quotePrice) && quotePrice > 0 && isNum(quoteCap) && quoteCap > 0) {
        const implied = quoteCap / quotePrice;
        const diff = (dcf.bridge.dilutedShares / implied - 1) * 100;
        // D-65: the reader sees both share counts beside the bridge.
        dcf.bridge.sharesOutstandingAtQuote = implied;
        // D-265 (P3, P20): a divisor below the quote count is never explained as dilution; the class and quoted-unit owners keep their shapes.
        const shareBasis = compareShareBasis(dcf.bridge.dilutedShares, implied, inputs.employeeTrustShares, shareScopeOwner);
        const belowNote = shareBasis === null ? null : shareBasisNote(shareBasis, inputs.multiples.quote.priceAsOf);
        if (shareBasis !== null) dcf.bridge.shareBasis = shareBasis;
        if (belowNote !== null) dcf.bridge.shareBasisNote = belowNote;
        if (Math.abs(diff) >= SHARE_BASIS_DISPLAY_MIN_PCT) {
          // D-135: the wording follows how the count was formed (filed or withheld: the filed
          // count; a loss period's basic count plus a profitable period's award dilution; a loss
          // period's basic count alone).
          const divisor = inputs.dilutedShareDivisor;
          const substituted = divisor?.basis === "loss-period-substituted" ? divisor : null;
          const basicOnly = divisor?.basis === "loss-period-basic";
          const head = substituted !== null
            ? `Per-share values divide by the latest period's basic count plus the award dilution of the profitable period (${substituted.donorPeriod} ${substituted.donorDate}) (the latest period is a loss, so its filed diluted count carries none), ${fmtMoney(dcf.bridge.dilutedShares)}`
            : basicOnly
              ? `Per-share values divide by the latest period's basic count, ${fmtMoney(dcf.bridge.dilutedShares)}, which carries no option or RSU dilution (the latest period is a loss and no profitable period among the last four quarters or the latest fiscal year shows any)`
              : `Per-share values divide by the latest weighted-average diluted share count, ${fmtMoney(dcf.bridge.dilutedShares)}`;
          // A loss period's filed count equals its basic count (ASC 260-10-45-17), so the
          // not-restored case carries no award dilution either. D-135's statement of what the
          // divisor carries stays beside the D-265 sentence.
          const tail = belowNote !== null && !economicScope.multiClass
            ? `${belowNote}${basicOnly || divisor?.basis === "loss-period-withheld"
              ? " The per-share value does not carry the option and RSU dilution the market cap omits."
              : substituted !== null ? " The restored award dilution is kept in the divisor." : ""}`
            : economicScope.multiClass
            ? `The quoted market-cap count may cover only the quoted class; the diluted denominator uses the admitted all-class units. ${economicScope.approximation ? `${fmtMoney(economicScope.approximation.affectedShares)} of the difference is the unquoted ${economicScope.approximation.unprovenClassIds.map(displayClassName).join(", ")}, not option or RSU dilution. ` : ""}The remaining difference can reflect period averaging, awards and share transactions; this comparison alone does not attribute it.`
            : basicOnly || divisor?.basis === "loss-period-withheld"
            ? "The gap is repurchases or issuance since the quarter, and the per-share value does not carry the option and RSU dilution the market cap omits."
            : substituted !== null
              ? "The gap is option and RSU dilution plus repurchases or issuance since the quarter; the restored award dilution is kept so the per-share value carries the dilution the market cap omits."
              : "The gap is option and RSU dilution plus repurchases or issuance since the quarter; the diluted count is kept so the per-share value carries the dilution the market cap omits.";
          /*
           * D-265: Use one statement with one denominator: compare the model divisor with the
           * quoted share count.
           */
          const relation = shareBasis === null ? `${fmtNum(Math.abs(diff))}% ${diff < 0 ? "below" : "above"}` : shareBasisRelation(shareBasis);
          notes.push(`${head}; the quoted market cap implies ${fmtMoney(implied)} shares outstanding at the quote, and the divisor is ${relation} that count. ${tail}`);
        }
      }
      // The reverse DCF solves for the growth the market cap implies, so it
      // needs the quote and the model in one known currency; the DCF and its
      // grid are price-free and stand either way.
      if (quoteComparison.comparable) {
        const use = classifyValuationDateUse({ statementDate: assumptions.asOf.statements ?? null,
          quoteDate: inputs.multiples.quote.priceAsOf ?? null, rolledTo: assumptions.valuationDate?.value ?? null,
          elapsedYears: assumptions.valuationDate?.elapsedYears ?? null });
        if (use.status === "current") reverse = reverseDcf(inputs.currentPrice, assumptions, runOpts);
        else gaps.push(gapEntry("valuation.reverseDcf.currentUse", valuationUseExplanation(use), "warn"));
      } else {
        gaps.push(
          gapEntry(
            "valuation.reverseDcf.currency",
            `${quoteComparison.reason} — the reverse DCF sets the market price against the model, so it is withheld; the DCF per share stands in the model's currency`,
            "warn",
          ),
        );
      }
      // Hoist the DCF and reverse-DCF model gaps too. The earlier hoist covered
      // only the multiples channel, so a suppressed equity bridge or an
      // unsolvable reverse DCF stayed invisible in the manifest — the same
      // defect, on the model that carries the headline number.
      gaps.push(...dcf.gaps, ...(reverse?.gaps ?? []));
      // D-135: a grid cell withheld by the unsplit rule is said once for the run, even when the
      // base per share published.
      const cellNote = [sensitivity, growthMargin].flatMap((g) => g?.notes ?? []).find((n) => n.startsWith(UNSPLIT_CELLS_LEAD));
      if (cellNote !== undefined && !gaps.some((g) => g.field === "valuation.dcf.temporaryEquityAllocation")) {
        gaps.push(gapEntry("valuation.dcf.temporaryEquityAllocation", cellNote, "warn"));
      }
    }
  }
  divisorDisclosure(dcf?.perShare);
  return { kind: "dcf", route: route.base, assumptions, dcf, sensitivity, growthMarginGrid: growthMargin, reverseDcf: reverse, multiples, notes, gaps };
}
