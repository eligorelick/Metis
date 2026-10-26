/**
 * Audit 2026-10-22 E-7: obligations the DCF equity bridge deducts beside net
 * debt. Asset-retirement obligations and environmental remediation accruals
 * are claims on the enterprise whose settlement the FCFF path does not
 * project (FCX: $3.84B and $2.02B at 2025-12-31), so equity value is what is
 * left after them.
 *
 * Only the issuer's own XBRL facts at the bridge's balance date count: the
 * filed total, else noncurrent plus current. The undiscounted "Gross"
 * environmental tag is not the recognised liability and is never read. Assets
 * the filer tags as legally restricted to settle the retirement obligations
 * (nuclear decommissioning trusts) are returned beside them so the bridge can
 * offset the two. Nothing tagged ⇒ null, and the bridge is unchanged.
 */
import type { CompanyFacts, FactPoint } from "@/edgar/xbrl";
import { instantFact, validDay } from "@/pipeline/stageB/marketableEquity";

export interface FiledObligation {
  value: number;
  /** The tags, amounts and filing, for the bridge disclosure. */
  basis: string;
}

export interface DebtLikeObligations {
  assetRetirement: FiledObligation | null;
  environmental: FiledObligation | null;
  /** Assets legally restricted to settling the retirement obligations; an offset, never added on its own. */
  settlementAssets: FiledObligation | null;
}

interface TagChoice {
  total: string[];
  /** Summed when no total is filed at the date: noncurrent first, then current. */
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
  if (value <= 0) return null;
  return {
    value,
    basis: `${parts.map((p) => `us-gaap/${p.tag} ${billions(p.fact.val)}`).join(" + ")} at ${date} (${[...new Set(parts.map((p) => filing(p.fact)))].join("; ")})`,
  };
}

export function debtLikeObligationsAt(facts: CompanyFacts | null | undefined, date: string | null, unit: string | null, observedAt: string): DebtLikeObligations | null {
  const observedDay = observedAt.slice(0, 10);
  if (!facts || !validDay(date) || typeof unit !== "string" || !/^[A-Z]{3}$/.test(unit) || !validDay(observedDay)) return null;
  const assetRetirement = read(facts, ASSET_RETIREMENT, unit, date, observedDay);
  const environmental = read(facts, ENVIRONMENTAL, unit, date, observedDay);
  if (assetRetirement === null && environmental === null) return null;
  return { assetRetirement, environmental, settlementAssets: assetRetirement === null ? null : read(facts, SETTLEMENT_ASSETS, unit, date, observedDay) };
}
