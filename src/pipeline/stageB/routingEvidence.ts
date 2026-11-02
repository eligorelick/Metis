/**
 * Stage B — sector-routing evidence from EDGAR XBRL companyfacts (WS5, D-16).
 *
 * PURE, deterministic, read-only: reads the bundle's companyfacts payload and
 * reports which balance-sheet and income-statement tags a filer carries. The
 * routing layer (`routeCompany`) combines this with the vendor industry string
 * and the SEC SIC code; this module never decides a route on its own.
 *
 * Evidence rules (the WS5 methodology, "Routing evidence"):
 * - deposits AND (loans OR net interest income)      → bank
 * - premiums earned/written AND loss/policy reserves → insurer
 * - net investment property >= half of same-filing Assets -> property REIT
 * - mortgage loans plus MBS >= half of same-filing Assets -> mortgage REIT
 * FIN-308 P9: token holdings, gross cost alone and generic loan tags do not
 * establish either type. Both majorities (including 50/50) stay undetermined.
 * - regulatory assets or rate-regulated revenue       → regulated-utility
 *   overlay evidence only (audit 2026-10-22 B-13; never a base route)
 *
 * Base-route inference requires a filed asset majority. For an already-routed
 * REIT, the sub-map comparison also admits PP&E as rental real property.
 * Mortgage assets additionally
 * need corroboration (repo funding or an already-financial classification)
 * before setting a base route. A declared non-financial industry is retained
 * with a conflict disclosure when financial evidence disagrees.
 *
 * A tag counts as present only when it carries a non-zero core-form fact whose
 * period end is within `recencyMonths` of the newest evidence fact on file, so
 * a legacy tag a filer stopped using a decade ago cannot classify it today.
 * Every signal records the tag, the value and the period end that decided it,
 * so the routing note can state the evidence used.
 */

import {
  dedupFactPoints,
  tagPoints,
  type CompanyFacts,
  type FactPoint,
} from "@/edgar/xbrl";
import type { FetchResult } from "@/types/core";
import { tagsFor } from "@/edgar/tagSynonyms";

/** One tag that contributed to the routing evidence. */
export interface EvidenceSignal {
  tag: string;
  value: number;
  unit: string;
  /** Period end of the fact (instant date, or duration end). */
  end: string;
  /** Duration start when the fact is a flow; absent for instants. */
  start?: string;
  form: string;
  accn: string;
}

export type EvidenceClass = "bank" | "insurer" | "reit" | "reit-mortgage";

export interface RoutingEvidence {
  /** True when a companyfacts payload was available to read. */
  available: boolean;
  /** Why no evidence could be read (companyfacts gap reason), else null. */
  unavailableReason: string | null;
  /** Newest period end across every evidence tag found (as-of of the evidence). */
  asOf: string | null;
  bank: EvidenceSignal[];
  insurer: EvidenceSignal[];
  equityReit: EvidenceSignal[];
  mortgageReit: EvidenceSignal[];
  /**
   * Repo funding (`SecuritiesSoldUnderAgreementsToRepurchase`) on its own, so
   * the routing layer can ask whether anything CORROBORATES a mortgage-asset
   * read before letting it set a base route. These signals are also included in
   * `mortgageReit` when that group fires; this field is populated whenever the
   * tag is present and recent, even when it does not.
   */
  mortgageFunding: EvidenceSignal[];
  /**
   * Audit 2026-10-22 B-13: rate-regulated revenue or regulatory assets whose
   * newest fact ends within `recencyMonths` of the run date. Evidence for the
   * regulated-utility overlay only; it never suggests a base route.
   */
  regulatedUtility: EvidenceSignal[];
  /**
   * The base route the tags alone support, in precedence order bank > insurer
   * > equity REIT > mortgage REIT; null when no financial tags are present.
   */
  suggests: EvidenceClass | null;
  /**
   * The REIT sub-map the tags support: "equity" for a net property majority,
   * "mortgage" for a mortgage-asset majority, null when neither or both.
   */
  reitSubmap: "equity" | "mortgage" | null;
  /** FIN-308: consumed only after the issuer's REIT base route is established. */
  reitAssetComparison?: {
    submap: "equity" | "mortgage" | null;
    basis: string;
  };
  /** Plain-English statement of the rule that produced `suggests`. */
  basis: string | null;
  /** Provenance of every signal. */
  source: string;
}

export const ROUTING_EVIDENCE_SOURCE = "edgar:companyfacts us-gaap";

/** Months of slack between the newest evidence fact and a tag's own newest fact. */
export const ROUTING_EVIDENCE_RECENCY_MONTHS = 24;

// ---------------------------------------------------------------------------
// Tag sets. Each group lists the us-gaap elements that evidence one activity;
// alternate spellings across taxonomy vintages are listed together. Order is
// the reporting order in notes only — presence of ANY tag in a group counts.
// ---------------------------------------------------------------------------

export const BANK_DEPOSIT_TAGS = [
  "Deposits",
  "DepositsDomestic",
  "DepositsForeign",
  "InterestBearingDepositLiabilities",
  "NoninterestBearingDepositLiabilities",
] as const;

export const BANK_LOAN_TAGS = [
  "LoansAndLeasesReceivableNetReportedAmount",
  "LoansAndLeasesReceivableGrossCarryingAmount",
  "FinancingReceivableExcludingAccruedInterestAfterAllowanceForCreditLoss",
  "FinancingReceivableExcludingAccruedInterestBeforeAllowanceForCreditLoss",
  "NotesReceivableGross",
] as const;

export const BANK_NII_TAGS = ["InterestIncomeExpenseNet", "InterestIncomeExpenseAfterProvisionForLoanLoss"] as const;

export const INSURER_PREMIUM_TAGS = [
  "PremiumsEarnedNet",
  "PremiumsEarnedNetPropertyAndCasualty",
  "PremiumsEarnedNetLife",
  "PremiumsWrittenNet",
  "PremiumsWrittenGross",
] as const;

export const INSURER_RESERVE_TAGS = [
  "LiabilityForClaimsAndClaimsAdjustmentExpense",
  "LiabilityForUnpaidClaimsAndClaimsAdjustmentExpenseNet",
  "LiabilityForFuturePolicyBenefits",
  "PolicyholderBenefitsAndClaimsIncurredNet",
  "LiabilityForFuturePolicyBenefitsAndUnpaidClaimsAndClaimsAdjustmentExpense",
] as const;

export const EQUITY_REIT_PROPERTY_TAGS = [
  "RealEstateInvestmentPropertyNet",
  "RealEstateInvestmentPropertyAtCost",
  "RealEstateAccumulatedDepreciation",
] as const;

/**
 * Mortgage-backed securities. Every element here NAMES mortgage-backed
 * securities: a generic debt-securities element
 * (`AvailableForSaleSecuritiesDebtSecurities`,
 * `DebtSecuritiesAvailableForSaleExcludingAccruedInterest`,
 * `AvailableForSaleSecuritiesDebtSecuritiesAmortizedCostBasis`) is what an
 * ordinary corporate treasury tags for its bond portfolio, so those three used
 * to route Apple, Alphabet or Microsoft to the mortgage-REIT map. Evidence
 * about a business model has to be specific to that business model.
 */
export const MORTGAGE_REIT_MBS_TAGS = [
  "MortgageBackedSecuritiesAvailableForSaleFairValueDisclosure",
  "MortgageBackedSecuritiesHeldToMaturityFairValueDisclosure",
  "MortgageBackedSecuritiesIssuedByUSGovernmentSponsoredEnterprisesFairValueDisclosure",
  "MortgageBackedSecuritiesIssuedByPrivateEnterprisesFairValueDisclosure",
] as const;

/**
 * Loans a mortgage REIT holds for investment. The generic receivable elements
 * that used to sit here — `NotesReceivableNet`,
 * `LoansAndLeasesReceivableNetReportedAmount`,
 * `FinancingReceivableExcludingAccruedInterestAfterAllowanceForCreditLoss` —
 * are what any manufacturer with vendor financing tags, and any bank; none of
 * them is mortgage-REIT-specific. They stay in {@link BANK_LOAN_TAGS}, where a
 * deposit tag has to accompany them before they classify anything.
 */
export const MORTGAGE_REIT_LOAN_TAGS = [
  "LoansReceivableHeldForInvestmentNet",
  "MortgageLoansOnRealEstate",
  "MortgageLoansOnRealEstateCarryingAmountOfMortgages",
  "MortgageLoansOnRealEstateCommercialAndConsumer",
] as const;

/** Repo funding is the hallmark mortgage-REIT liability; supporting evidence only. */
export const MORTGAGE_REIT_FUNDING_TAGS = ["SecuritiesSoldUnderAgreementsToRepurchase"] as const;

/**
 * Audit 2026-10-22 B-13: what rate regulation leaves in the statements, the
 * revenue a commission sets and the regulatory assets it allows to be
 * recovered. `RegulatedAndUnregulatedOperatingRevenue` is a total and evidences
 * neither.
 */
export const REGULATED_UTILITY_TAGS = [
  "RegulatoryAssetsNoncurrent",
  "RegulatoryAssetsCurrent",
  "RegulatoryAssets",
  "RegulatedOperatingRevenue",
  "RegulatedOperatingRevenueElectric",
  "RegulatedOperatingRevenueElectricNonNuclear",
  "RegulatedOperatingRevenueGas",
  "RegulatedOperatingRevenueWater",
  "RegulatedOperatingRevenuePipelines",
  "RegulatedOperatingRevenueOther",
] as const;

function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const shifted = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate()));
  return shifted.toISOString().slice(0, 10);
}

/** Newest deduped core-form point of a tag with a finite non-zero value (filed by `filedBy`, when given), or null. */
function newestPoint(facts: CompanyFacts, tag: string, filedBy?: string, includeZero = false): { point: FactPoint; unit: string } | null {
  const tp = tagPoints(facts, tag);
  if (tp === null) return null;
  let best: FactPoint | null = null;
  // Filed-by first: a period re-filed after the run is read as it was filed before it.
  for (const p of dedupFactPoints(filedBy === undefined ? tp.points : tp.points.filter((q) => q.filed <= filedBy))) {
    if (!Number.isFinite(p.val) || (!includeZero && p.val === 0)) continue;
    if (best === null || p.end > best.end || (p.end === best.end && p.filed > best.filed)) best = p;
  }
  return best === null ? null : { point: best, unit: tp.unit };
}

function toSignal(tag: string, hit: { point: FactPoint; unit: string }): EvidenceSignal {
  const { point, unit } = hit;
  return {
    tag,
    value: point.val,
    unit,
    end: point.end,
    ...(point.start !== undefined ? { start: point.start } : {}),
    form: point.form,
    accn: point.accn,
  };
}

function empty(reason: string | null, available: boolean): RoutingEvidence {
  return {
    available,
    unavailableReason: reason,
    asOf: null,
    bank: [],
    insurer: [],
    equityReit: [],
    mortgageReit: [],
    mortgageFunding: [],
    regulatedUtility: [],
    suggests: null,
    reitSubmap: null,
    basis: null,
    source: ROUTING_EVIDENCE_SOURCE,
  };
}

/** Human-readable "Tag value (end)" list for routing notes. */
export function describeSignals(signals: readonly EvidenceSignal[]): string {
  return signals.map((s) => `${s.tag} ${s.value} ${s.unit} (${s.end})`).join(", ");
}

/**
 * Read the routing evidence from a companyfacts FetchResult. Never throws for
 * missing data: an absent or failed payload yields `available: false` with the
 * gap reason so the routing layer can disclose it.
 */
export function deriveRoutingEvidence(
  companyFacts: FetchResult<CompanyFacts> | null | undefined,
  opts: { recencyMonths?: number; today?: string } = {},
): RoutingEvidence {
  if (companyFacts === null || companyFacts === undefined) {
    return empty("EDGAR companyfacts not fetched for this bundle", false);
  }
  if (!companyFacts.ok) {
    return empty(`EDGAR companyfacts unavailable: ${companyFacts.gap.reason}`, false);
  }
  const facts = companyFacts.value.data;
  const recencyMonths = opts.recencyMonths ?? ROUTING_EVIDENCE_RECENCY_MONTHS;

  const groups: Record<string, readonly string[]> = {
    assets: ["Assets"],
    deposits: BANK_DEPOSIT_TAGS,
    loans: BANK_LOAN_TAGS,
    nii: BANK_NII_TAGS,
    premiums: INSURER_PREMIUM_TAGS,
    reserves: INSURER_RESERVE_TAGS,
    property: [...EQUITY_REIT_PROPERTY_TAGS, "RealEstateInvestmentPropertyAccumulatedDepreciation"],
    mbs: MORTGAGE_REIT_MBS_TAGS,
    mortgageLoans: MORTGAGE_REIT_LOAN_TAGS,
    repo: MORTGAGE_REIT_FUNDING_TAGS,
  };

  // B-13: utility evidence is dated against the run, not against the
  // financial tags (a utility usually has none of those).
  const utilityCutoff = opts.today !== undefined && /^\d{4}-\d{2}-\d{2}/.test(opts.today) ? addMonths(opts.today.slice(0, 10), -recencyMonths) : null;
  const regulatedUtility = REGULATED_UTILITY_TAGS.flatMap((tag) => {
    const hit = utilityCutoff === null ? null : newestPoint(facts, tag, (opts.today as string).slice(0, 10));
    return hit === null || utilityCutoff === null || hit.point.end < utilityCutoff ? [] : [toSignal(tag, hit)];
  });

  // First pass: newest non-zero point per tag, and the newest end overall.
  const hits = new Map<string, EvidenceSignal>();
  let newestEnd: string | null = null;
  for (const tags of Object.values(groups)) {
    for (const tag of tags) {
      if (hits.has(tag)) continue;
      const hit = newestPoint(facts, tag);
      if (hit === null) continue;
      const signal = toSignal(tag, hit);
      hits.set(tag, signal);
      if (newestEnd === null || signal.end > newestEnd) newestEnd = signal.end;
    }
  }
  if (newestEnd === null) return { ...empty(null, true), asOf: null, regulatedUtility };

  // Second pass: keep only tags whose newest fact is recent relative to the
  // newest evidence fact, so retired tags cannot classify the filer.
  const cutoff = addMonths(newestEnd, -recencyMonths);
  const recent = (tags: readonly string[]): EvidenceSignal[] =>
    tags.map((t) => hits.get(t)).filter((s): s is EvidenceSignal => s !== undefined && s.end >= cutoff);

  const deposits = recent(groups.deposits);
  const loans = recent(groups.loans);
  const nii = recent(groups.nii);
  const premiums = recent(groups.premiums);
  const reserves = recent(groups.reserves);
  const repo = recent(groups.repo);

  const bank = deposits.length > 0 && (loans.length > 0 || nii.length > 0) ? [...deposits, ...loans, ...nii] : [];
  const insurer = premiums.length > 0 && reserves.length > 0 ? [...premiums, ...reserves] : [];
  // FIN-308 P9: a token holding does not establish a business model. Compare
  // net property or mortgage assets to Assets on the SAME instant, currency
  // and filing. Alias totals are selected once, never summed as components.
  const assetsHit = newestPoint(facts, "Assets", opts.today?.slice(0, 10));
  const assets = assetsHit ? toSignal("Assets", assetsHit) : undefined;
  const assetCutoff = opts.today ? addMonths(opts.today.slice(0, 10), -recencyMonths) : cutoff;
  const same = (tags: readonly string[]): EvidenceSignal | undefined => tags.map(t => {
    const hit = newestPoint(facts, t, opts.today?.slice(0, 10), true);
    return hit ? toSignal(t, hit) : undefined;
  }).find(s =>
    s !== undefined && assets !== undefined && assets.value > 0 && !assets.start && !s.start &&
    assets.end >= assetCutoff && s.end === assets.end && s.accn === assets.accn && s.unit === assets.unit && s.value >= 0);
  const net = same(["RealEstateInvestmentPropertyNet"]);
  const cost = same(["RealEstateInvestmentPropertyAtCost"]);
  const depreciation = same(["RealEstateInvestmentPropertyAccumulatedDepreciation", "RealEstateAccumulatedDepreciation"]);
  const propertyValue = net?.value ?? (cost && depreciation ? cost.value - depreciation.value : null);
  const propertySignals = net ? [net] : cost && depreciation ? [cost, depreciation] : [];
  const afs = same(["MortgageBackedSecuritiesAvailableForSaleFairValueDisclosure"]);
  // AFS is carried at fair value. HTM and issuer-category fair-value-only
  // disclosures do not establish carrying assets and cannot supply a majority.
  const mbsSignals = afs ? [afs] : [];
  const loan = same(MORTGAGE_REIT_LOAN_TAGS.filter(t => t !== "LoansReceivableHeldForInvestmentNet"));
  const mortgageSignals = [...mbsSignals, ...(loan ? [loan] : [])];
  const mortgageValue = mortgageSignals.reduce((sum, s) => sum + s.value, 0);
  const majority = (v: number | null): boolean => assets !== undefined && v !== null && v >= assets.value * 0.5 && v <= assets.value && assets.value > 0;
  const propertyMajority = majority(propertyValue);
  const mortgageMajority = majority(mortgageValue);
  // Both majorities would assert incompatible types (including a 50/50 book).
  const equityReit = propertyMajority && !mortgageMajority ? [...propertySignals, assets!] : [];
  const mortgageReit = mortgageMajority && !propertyMajority ? [...mortgageSignals, assets!, ...repo] : [];

  // Coordinator revision, 2026-11-02: an established REIT's sub-map answers
  // mortgage versus equity, not whether rental property dominates goodwill,
  // intangibles and right-of-use assets. Generic PP&E is rental real property
  // ONLY in that established REIT context; it never sets `suggests` below.
  const ppe = same(tagsFor("propertyPlantEquipmentNet"));
  const realSignals = [...propertySignals, ...(ppe ? [ppe] : [])];
  const realValue = (propertyValue ?? 0) + (ppe?.value ?? 0);
  const realPositive = realValue > 0 && assets !== undefined && realValue <= assets.value;
  const realAtLeastMortgage = realValue >= mortgageValue;
  const mortgageBelowHalf = assets !== undefined && mortgageValue < assets.value * 0.5;
  const knownEquity = realPositive && realAtLeastMortgage && mortgageBelowHalf;
  // Retain the existing ambiguous 50/50 control: two majorities do not decide.
  const knownMortgage = mortgageMajority && !majority(realValue);
  const knownSubmap = knownEquity ? "equity" : knownMortgage ? "mortgage" : null;
  const reitAssetComparison: NonNullable<RoutingEvidence["reitAssetComparison"]> = {
    submap: knownSubmap,
    basis: `already routed REIT: PP&E is rental real property (towers, data centres); ` +
      `real assets = net real-estate investment property (RealEstateInvestmentPropertyNet, or ` +
      `RealEstateInvestmentPropertyAtCost less RealEstateInvestmentPropertyAccumulatedDepreciation / ` +
      `RealEstateAccumulatedDepreciation) plus PropertyPlantAndEquipmentNet (${describeSignals(realSignals) || "no comparable filed real-asset fact"}). ` +
      `Mortgage assets = MortgageLoansOnRealEstate family plus MortgageBackedSecuritiesAvailableForSaleFairValueDisclosure ` +
      `(${describeSignals(mortgageSignals) || "no comparable mortgage-asset fact"}); ` +
      `same-instant, same-currency, same-accession Assets (${assets ? `${describeSignals([assets])}; accession ${assets.accn}` : "unavailable"}). ` +
      `Equity tests: real assets ${realValue} > 0 (${realPositive}); ${realValue} >= mortgage assets ${mortgageValue} (${realAtLeastMortgage}); ` +
      `${mortgageValue} < 50% of Assets ${assets?.value ?? "unavailable"} (${mortgageBelowHalf}). ` +
      `Mortgage test: mortgage assets >= 50% of Assets (${mortgageMajority}), without two conflicting majorities ` +
      `(${!majority(realValue)}); existing funding/classification corroboration required. ` +
      `Result: ${knownSubmap ?? "unknown"}; ${knownEquity ? "filed rental real assets meet the equity comparisons" :
        knownMortgage ? "filed mortgage assets dominate total assets" : "filed assets do not establish either sub-map"}.`,
  };

  let suggests: EvidenceClass | null = null;
  let basis: string | null = null;
  if (bank.length > 0) {
    suggests = "bank";
    basis = `deposits (${describeSignals(deposits)}) with ${loans.length > 0 ? `loans (${describeSignals(loans)})` : ""}${
      loans.length > 0 && nii.length > 0 ? " and " : ""
    }${nii.length > 0 ? `net interest income (${describeSignals(nii)})` : ""} → bank`;
  } else if (insurer.length > 0) {
    suggests = "insurer";
    basis = `premiums (${describeSignals(premiums)}) with loss/policy reserves (${describeSignals(reserves)}) → insurer`;
  } else if (equityReit.length > 0) {
    suggests = "reit";
    basis = `net investment property (${describeSignals(propertySignals)}) is at least 50% of same-filing Assets (${describeSignals([assets!])}) → equity REIT`;
  } else if (mortgageReit.length > 0) {
    suggests = "reit-mortgage";
    basis = `mortgage-backed securities and mortgage loans (${describeSignals(mortgageSignals)}) are at least 50% of same-filing Assets (${describeSignals([assets!])}) → mortgage REIT`;
  }

  const reitSubmap: RoutingEvidence["reitSubmap"] =
    equityReit.length > 0 ? "equity" : mortgageReit.length > 0 ? "mortgage" : null;

  const all = [...bank, ...insurer, ...equityReit, ...mortgageReit];
  const asOf = all.reduce<string | null>((acc, s) => (acc === null || s.end > acc ? s.end : acc), null);

  return {
    available: true,
    unavailableReason: null,
    asOf,
    bank,
    insurer,
    equityReit,
    mortgageReit,
    mortgageFunding: repo,
    regulatedUtility,
    suggests,
    reitSubmap,
    reitAssetComparison,
    basis,
    source: ROUTING_EVIDENCE_SOURCE,
  };
}
