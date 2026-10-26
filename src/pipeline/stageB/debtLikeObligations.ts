/**
 * Audit 2026-10-22 E-7: obligations the DCF equity bridge deducts beside net
 * debt. Asset-retirement obligations and environmental remediation accruals
 * are claims on the enterprise whose settlement the FCFF path does not
 * project (FCX: $3.84B and $2.02B at 2025-12-31), so equity value is what is
 * left after them.
 *
 * Only the issuer's own XBRL facts count: the filed total, else noncurrent
 * plus current, at the bridge's balance date, else at the latest date in the
 * year before it (many filers, FCX among them, tag these in the 10-K only), with
 * that date disclosed. A current portion alone is not the obligation, and a
 * balance filed as zero, or an annual balance sheet that no longer tags it,
 * ends the look-back (settled or sold). The undiscounted "Gross" environmental tag is not the
 * recognised liability and is never read. Assets the filer tags as legally
 * restricted to settle the retirement obligations (nuclear decommissioning
 * trusts) are read at the retirement obligation's date and returned beside it
 * so the bridge can offset the two. Nothing tagged ⇒ null, and the bridge is
 * unchanged.
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
}

interface TagChoice {
  total: string[];
  /** Summed when no total is filed at the date: noncurrent first, then current; the noncurrent part must be among them. */
  parts: string[];
}

const ASSET_RETIREMENT: TagChoice = {
  total: ["AssetRetirementObligation"],
  parts: ["AssetRetirementObligationsNoncurrent", "AssetRetirementObligationCurrent"],
};
const ENVIRONMENTAL: TagChoice = {
  total: ["AccrualForEnvironmentalLossContingencies"],
  parts: ["AccruedEnvironmentalLossContingenciesNoncurrent", "AccruedEnvironmentalLossContingenciesCurrent"],
};
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

/** Whether the filer states the obligation as zero at `date` (the total, or the noncurrent part with no current part). */
function filedZero(facts: CompanyFacts, choice: TagChoice, unit: string, date: string, observedDay: string): boolean {
  const val = (tag: string): number | undefined => instantFact(facts, tag, unit, date, observedDay)?.val;
  return choice.total.some((tag) => val(tag) === 0) ||
    (choice.parts.length > 0 && val(choice.parts[0]!) === 0 && choice.parts.every((tag) => (val(tag) ?? 0) === 0));
}

function readLatest(facts: CompanyFacts, choice: TagChoice, unit: string, date: string, observedDay: string): (FiledObligation & { date: string }) | null {
  for (const at of candidateDates(facts, choice, unit, date, observedDay)) {
    const found = read(facts, choice, unit, at, observedDay);
    // A balance filed as zero is the filer's statement that nothing is owed, not an omission.
    if (found === null && filedZero(facts, choice, unit, at, observedDay)) return null;
    if (found !== null) {
      return at === date ? { ...found, date: at }
        : { ...found, date: at, asOf: at, basis: `${found.basis}; the latest filed balance, as the ${date} balance sheet does not tag it` };
    }
  }
  return null;
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
  if (value <= 0 || !parts.some((p) => p.tag === choice.parts[0])) return null;
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
  if (aro === null && env === null) return null;
  const strip = (o: (FiledObligation & { date: string }) | null): FiledObligation | null =>
    o === null ? null : { value: o.value, basis: o.basis, ...(o.asOf === undefined ? {} : { asOf: o.asOf }) };
  return {
    assetRetirement: strip(aro),
    environmental: strip(env),
    settlementAssets: aro === null ? null : read(facts, SETTLEMENT_ASSETS, unit, aro.date, observedDay),
  };
}
