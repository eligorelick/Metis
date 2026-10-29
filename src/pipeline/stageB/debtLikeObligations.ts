/**
 * Audit 2026-10-22 E-7, extended by audit 2026-10-27 FIN-305 (decisions spec 4.3, B4): obligations
 * the DCF equity bridge deducts beside net debt. Asset-retirement obligations and environmental
 * remediation accruals (FCX: $3.84B and $2.02B at 2025-12-31), recognised pension and OPEB
 * deficits, loss-contingency accruals and business-combination contingent consideration are claims
 * on the enterprise whose settlement the FCFF path does not project, so equity value is what is
 * left after them. The bridge deducts each after tax at the D-98 marginal rate
 * (`docs/METHODOLOGY.md` "EV bridge"); this module reads only the filed amounts, before tax.
 *
 * Only the issuer's own XBRL facts count (`debtLikeObligationsAt`), except for a successor registrant
 * with no annual report of its own yet: `successorObligationsAt` reads a family it does not tag from its
 * predecessor when B-36 continuity holds (FIN-403). The filed total, else noncurrent plus current, at the
 * bridge's balance date, else at the latest date in the year before it (many filers, FCX among
 * them, tag these in the 10-K only), with that date disclosed. A current portion alone is not the
 * obligation for the retirement, environmental and pension readings; a loss-contingency accrual or
 * contingent-consideration liability filed as a current portion alone counts as the whole
 * (`currentAloneIsWhole`: litigation and earn-out balances are commonly all current, and a current
 * part alone can only understate the claim). A balance filed as zero, or an annual balance sheet
 * that no longer tags it, ends the look-back (settled or sold). The undiscounted "Gross"
 * environmental tag is not the recognised liability and is never read. Assets the filer tags as
 * legally restricted to settle the retirement obligations (nuclear decommissioning trusts) are read
 * at the retirement obligation's date and returned beside it so the bridge can offset the two.
 *
 * Pension and OPEB: the filer's broadest recognised liability family at the date, never summed
 * across families (`PENSION_FAMILIES`, in order); the look-back is date first, then family.
 * Overfunded plans are not credited. A loss-contingency accrual is read net of any same-date
 * environmental accrual, so an environmental accrual inside the total is never counted twice.
 * Nothing tagged => null, and the bridge is unchanged.
 */
import { CORE_FACT_FORMS, parseFactPoints, type CompanyFacts, type FactPoint } from "@/edgar/xbrl";
import { instantFact, validDay } from "@/pipeline/stageB/marketableEquity";

export interface FiledObligation {
  value: number;
  /** The tags, amounts and filing, for the bridge disclosure. */
  basis: string;
  /** The balance date read, when earlier than the bridge's (the bridge line names it). */
  asOf?: string;
}

export interface DebtLikeObligations {
  assetRetirement: FiledObligation | null;
  environmental: FiledObligation | null;
  /** Assets legally restricted to settling the retirement obligations; an offset, never added on its own. */
  settlementAssets: FiledObligation | null;
  /** FIN-305: the recognised pension and OPEB deficit, from the broadest filed family; overfunded plans are not credited. */
  pension?: FiledObligation | null;
  /** FIN-305: the loss-contingency accrual above any same-date environmental accrual. */
  lossContingencies?: FiledObligation | null;
  /** FIN-305: business-combination contingent consideration. */
  contingentConsideration?: FiledObligation | null;
}

export interface TagChoice {
  total: string[];
  /** Summed when no total is filed at the date: noncurrent first, then current; the noncurrent part must be among them. */
  parts: string[];
  /** A current part filed alone is the whole balance (loss contingencies, contingent consideration); the noncurrent part need not be among the parts. */
  currentAloneIsWhole?: boolean;
}

const ASSET_RETIREMENT: TagChoice = {
  total: ["AssetRetirementObligation"],
  parts: ["AssetRetirementObligationsNoncurrent", "AssetRetirementObligationCurrent"],
};
const ENVIRONMENTAL: TagChoice = {
  total: ["AccrualForEnvironmentalLossContingencies"],
  parts: ["AccruedEnvironmentalLossContingenciesNoncurrent", "AccruedEnvironmentalLossContingenciesCurrent"],
};
const LOSS_CONTINGENCIES: TagChoice = {
  total: ["LossContingencyAccrualAtCarryingValue"],
  parts: ["LossContingencyAccrualCarryingValueNoncurrent", "LossContingencyAccrualCarryingValueCurrent"],
  currentAloneIsWhole: true,
};
const CONTINGENT_CONSIDERATION: TagChoice = {
  total: ["BusinessCombinationContingentConsiderationLiability"],
  parts: ["BusinessCombinationContingentConsiderationLiabilityNoncurrent", "BusinessCombinationContingentConsiderationLiabilityCurrent"],
  currentAloneIsWhole: true,
};
/**
 * The pension and OPEB liability families, broadest first (FIN-305, OD-4): (a) pension plus other postretirement plus
 * postemployment, (b) pension plus other postretirement defined-benefit plans, (c) the pension plans and the other
 * postretirement plans each on their own, summed. Postemployment benefits (ASC 712) count only inside (a). A family is
 * one list of choices whose readings are summed; the first family filed at a date is the reading, never a sum across families.
 */
export const PENSION_FAMILIES: readonly (readonly TagChoice[])[] = [
  [{ total: [], parts: ["PensionAndOtherPostretirementAndPostemploymentBenefitPlansLiabilitiesNoncurrent", "PensionAndOtherPostretirementAndPostemploymentBenefitPlansLiabilitiesCurrent"] }],
  [{ total: [], parts: ["PensionAndOtherPostretirementDefinedBenefitPlansLiabilitiesNoncurrent", "PensionAndOtherPostretirementDefinedBenefitPlansLiabilitiesCurrent"] }],
  [
    { total: [], parts: ["DefinedBenefitPensionPlanLiabilitiesNoncurrent", "DefinedBenefitPensionPlanLiabilitiesCurrent"] },
    { total: [], parts: ["OtherPostretirementDefinedBenefitPlanLiabilitiesNoncurrent", "OtherPostretirementDefinedBenefitPlanLiabilitiesCurrent"] },
  ],
];
/** Every pension tag, for the candidate dates of the look-back. */
const PENSION_ANY: TagChoice = { total: PENSION_FAMILIES.flatMap((f) => f.flatMap((c) => c.total)), parts: PENSION_FAMILIES.flatMap((f) => f.flatMap((c) => c.parts)) };
const SETTLEMENT_ASSETS: TagChoice = {
  total: ["AssetRetirementObligationLegallyRestrictedAssetsFairValue", "DecommissioningFundInvestments", "DecommissioningTrustAssetsAmount"],
  parts: [],
};

const billions = (v: number): string => `${(v / 1e9).toFixed(3)}B`;
const filing = (f: FactPoint): string => `${f.form} filed ${f.filed}`;
/** How far before the bridge's balance date a filed balance still stands in for it: one fiscal year. */
const MAX_LAG_DAYS = 366;
const DAY_MS = 86_400_000;

/**
 * Balance dates an annual report filed by the run states (any 10-K, 20-F or 40-F `Assets` fact, though later 10-Qs
 * re-file the year end as their comparative column): there an untagged obligation is absent, not omitted.
 */
function annualBalanceDates(facts: CompanyFacts, unit: string, observedDay: string): Set<string> {
  const concept = facts.facts["us-gaap"]?.Assets as { units?: Record<string, unknown[]> } | undefined;
  return new Set(parseFactPoints(concept?.units?.[unit] ?? []).filter((p) =>
    p.start === undefined && /^(10-K|20-F|40-F)/.test(p.form) && CORE_FACT_FORMS.has(p.form) && validDay(p.filed) && p.filed <= observedDay)
    .map((p) => p.end));
}

/**
 * The bridge date, then each earlier date within a year at which one of the choice's tags was filed by the run,
 * never before the latest annual balance sheet on or before the bridge date.
 */
function candidateDates(facts: CompanyFacts, choice: TagChoice, unit: string, date: string, observedDay: string): string[] {
  const annual = annualBalanceDates(facts, unit, observedDay);
  if (annual.has(date)) return [date];
  const yearBefore = new Date(Date.parse(`${date}T00:00:00Z`) - MAX_LAG_DAYS * DAY_MS).toISOString().slice(0, 10);
  const floor = [...annual].filter((d) => d < date).reduce((a, b) => (b > a ? b : a), yearBefore);
  const earlier = [...choice.total, ...choice.parts].flatMap((tag) => {
    const concept = facts.facts["us-gaap"]?.[tag] as { units?: Record<string, unknown[]> } | undefined;
    return parseFactPoints(concept?.units?.[unit] ?? []).filter((p) =>
      p.start === undefined && p.end < date && p.end >= floor && CORE_FACT_FORMS.has(p.form) && validDay(p.filed) && p.filed <= observedDay)
      .map((p) => p.end);
  });
  return [date, ...[...new Set(earlier)].sort().reverse()];
}

/** Whether the filer states the obligation as zero at `date` (the total, or the noncurrent part with no current part; a current part alone for `currentAloneIsWhole`). */
function filedZero(facts: CompanyFacts, choice: TagChoice, unit: string, date: string, observedDay: string): boolean {
  const val = (tag: string): number | undefined => instantFact(facts, tag, unit, date, observedDay)?.val;
  const partsZero = choice.currentAloneIsWhole === true
    ? choice.parts.some((tag) => val(tag) === 0)
    : choice.parts.length > 0 && val(choice.parts[0]!) === 0;
  return choice.total.some((tag) => val(tag) === 0) ||
    (partsZero && choice.parts.every((tag) => (val(tag) ?? 0) === 0));
}

/** The balance read at one date, or `"zero"` when the filer states the obligation as zero there, else null. */
type DateReading = FiledObligation | "zero" | null;

function readLatestWith(candidates: string[], date: string, readAt: (at: string) => DateReading): (FiledObligation & { date: string }) | null {
  for (const at of candidates) {
    const found = readAt(at);
    // A balance filed as zero is the filer's statement that nothing is owed, not an omission.
    if (found === "zero") return null;
    if (found !== null) {
      return at === date ? { ...found, date: at }
        : { ...found, date: at, asOf: at, basis: `${found.basis}; the latest filed balance, as the ${date} balance sheet does not tag it` };
    }
  }
  return null;
}

function readLatest(facts: CompanyFacts, choice: TagChoice, unit: string, date: string, observedDay: string): (FiledObligation & { date: string }) | null {
  return readLatestWith(candidateDates(facts, choice, unit, date, observedDay), date, (at) => {
    const found = read(facts, choice, unit, at, observedDay);
    return found === null && filedZero(facts, choice, unit, at, observedDay) ? "zero" : found;
  });
}

/**
 * The first pension family with a positive reading at `date`, its choices' readings summed. A family filed as zero
 * never blocks a positive family at the same date (as E-7's own reader and family (c)'s parts); a filed zero ends the
 * look-back only when no family is positive there.
 */
function readPensionAt(facts: CompanyFacts, unit: string, date: string, observedDay: string): DateReading {
  let zero = false;
  for (const family of PENSION_FAMILIES) {
    const found = family.flatMap((choice) => {
      const r = read(facts, choice, unit, date, observedDay);
      return r === null ? [] : [r];
    });
    if (found.length > 0) {
      return { value: found.reduce((sum, r) => sum + r.value, 0), basis: found.map((r) => r.basis).join(" + ") };
    }
    if (family.some((choice) => filedZero(facts, choice, unit, date, observedDay))) zero = true;
  }
  return zero ? "zero" : null;
}

function read(facts: CompanyFacts, choice: TagChoice, unit: string, date: string, observedDay: string): FiledObligation | null {
  for (const tag of choice.total) {
    const fact = instantFact(facts, tag, unit, date, observedDay);
    if (fact !== null && fact.val > 0) return { value: fact.val, basis: `us-gaap/${tag} ${billions(fact.val)} at ${date} (${filing(fact)})` };
  }
  const parts = choice.parts.flatMap((tag) => {
    const fact = instantFact(facts, tag, unit, date, observedDay);
    return fact === null ? [] : [{ tag, fact }];
  });
  const value = parts.reduce((sum, p) => sum + p.fact.val, 0);
  if (value <= 0 || (choice.currentAloneIsWhole !== true && !parts.some((p) => p.tag === choice.parts[0]))) return null;
  return {
    value,
    basis: `${parts.map((p) => `us-gaap/${p.tag} ${billions(p.fact.val)}`).join(" + ")} at ${date} (${[...new Set(parts.map((p) => filing(p.fact)))].join("; ")})`,
  };
}

export function debtLikeObligationsAt(facts: CompanyFacts | null | undefined, date: string | null, unit: string | null, observedAt: string): DebtLikeObligations | null {
  const observedDay = observedAt.slice(0, 10);
  if (!facts || !validDay(date) || typeof unit !== "string" || !/^[A-Z]{3}$/.test(unit) || !validDay(observedDay)) return null;
  const aro = readLatest(facts, ASSET_RETIREMENT, unit, date, observedDay);
  const env = readLatest(facts, ENVIRONMENTAL, unit, date, observedDay);
  const pension = readLatestWith(candidateDates(facts, PENSION_ANY, unit, date, observedDay), date, (at) => readPensionAt(facts, unit, at, observedDay));
  const loss = readLatest(facts, LOSS_CONTINGENCIES, unit, date, observedDay);
  const consideration = readLatest(facts, CONTINGENT_CONSIDERATION, unit, date, observedDay);
  // Only the amount above any same-date environmental accrual: the environmental accrual may sit inside the total.
  const lossNet = ((): FiledObligation | null => {
    if (loss === null) return null;
    const inside = read(facts, ENVIRONMENTAL, unit, loss.date, observedDay);
    const asOf = loss.asOf === undefined ? {} : { asOf: loss.asOf };
    if (inside === null) return { value: loss.value, basis: loss.basis, ...asOf };
    const net = loss.value - inside.value;
    return net > 0
      ? { value: net, basis: `${loss.basis}, less the environmental accrual of ${billions(inside.value)} inside it (${inside.basis}), which is deducted on its own line`, ...asOf }
      : null;
  })();
  if (aro === null && env === null && pension === null && lossNet === null && consideration === null) return null;
  const strip = (o: (FiledObligation & { date: string }) | null): FiledObligation | null =>
    o === null ? null : { value: o.value, basis: o.basis, ...(o.asOf === undefined ? {} : { asOf: o.asOf }) };
  return {
    assetRetirement: strip(aro),
    environmental: strip(env),
    settlementAssets: aro === null ? null : read(facts, SETTLEMENT_ASSETS, unit, aro.date, observedDay),
    pension: strip(pension),
    lossContingencies: lossNet,
    contingentConsideration: strip(consideration),
  };
}

/** A successor registrant's predecessor (`bundle.edgar.predecessor`), with whether B-36 continuity was established. */
export interface SuccessorPredecessor {
  facts: CompanyFacts;
  cik10: string;
  continuity: boolean;
}

/**
 * FIN-403: the predecessor's facts, when they may stand in for a successor's own. Only while the successor has no
 * annual report of its own (a 10-K, 20-F or 40-F `Assets` balance dated on or before `date`, filed by the run), and only
 * when its filings re-present the predecessor's periods unchanged (`successorContinuity`, B-36), so the two are one
 * reporting entity. Otherwise null, and nothing is read from the predecessor.
 */
export function predecessorFactsFor(own: CompanyFacts | null | undefined, predecessor: SuccessorPredecessor | null, date: string | null, unit: string | null, observedAt: string): CompanyFacts | null {
  const observedDay = observedAt.slice(0, 10);
  if (!own || predecessor === null || !predecessor.continuity) return null;
  if (!validDay(date) || typeof unit !== "string" || !/^[A-Z]{3}$/.test(unit) || !validDay(observedDay)) return null;
  return [...annualBalanceDates(own, unit, observedDay)].some((d) => d <= date) ? null : predecessor.facts;
}

/**
 * FIN-403: a successor registrant's first periodic reports are 10-Qs, so its companyfacts hold no retirement obligation
 * and the bridge deducted nothing for it. Per family (asset retirement, environmental, pension, loss contingencies,
 * contingent consideration), the successor's own reading wins when it has one; a family it does not tag is read from the
 * predecessor (`predecessorFactsFor`), its basis prefixed with the predecessor's CIK. A family is never summed across the
 * two registrants. The settlement assets follow the retirement obligation they offset, from the same facts.
 */
export function successorObligationsAt(own: CompanyFacts | null | undefined, predecessor: SuccessorPredecessor | null, date: string | null, unit: string | null, observedAt: string): DebtLikeObligations | null {
  const mine = debtLikeObligationsAt(own, date, unit, observedAt);
  const predecessorFacts = predecessorFactsFor(own, predecessor, date, unit, observedAt);
  const theirs = predecessorFacts === null || predecessor === null ? null : debtLikeObligationsAt(predecessorFacts, date, unit, observedAt);
  if (theirs === null) return mine;
  const prefix = `predecessor (CIK ${predecessor!.cik10}, one reporting entity under B-36): `;
  const adopt = (o: FiledObligation | null | undefined): FiledObligation | null => (o ? { ...o, basis: `${prefix}${o.basis}` } : null);
  const pick = (a: FiledObligation | null | undefined, b: FiledObligation | null | undefined): FiledObligation | null => a ?? adopt(b);
  const assetRetirement = pick(mine?.assetRetirement, theirs.assetRetirement);
  const merged: DebtLikeObligations = {
    assetRetirement,
    environmental: pick(mine?.environmental, theirs.environmental),
    // The fund offsets the obligation it was read beside: the predecessor's only when the obligation is the predecessor's.
    settlementAssets: mine?.assetRetirement ? mine.settlementAssets : adopt(theirs.settlementAssets),
    pension: pick(mine?.pension, theirs.pension),
    lossContingencies: pick(mine?.lossContingencies, theirs.lossContingencies),
    contingentConsideration: pick(mine?.contingentConsideration, theirs.contingentConsideration),
  };
  return Object.values(merged).every((o) => o === null) ? null : merged;
}
