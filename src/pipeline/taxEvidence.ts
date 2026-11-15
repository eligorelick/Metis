/**
 * Tax rate evidence, split out of compute.ts: the TTM effective tax rate and its re-based pre-tax
 * denominator, and the WACC's statement tax rate when no vendor ratio exists (P13, D-237).
 */

import type { FmpIncomeStatementRow, StatementFieldProvenance } from "@/providers/fmp";
import { PRETAX_EXCLUDING_EQUITY_METHOD_TAG } from "@/edgar/tagSynonyms";
import { effectiveTaxPretaxIncome, effectiveTaxOperands } from "@/edgar/incomeClassification";
import { isoDay, num } from "./bundleRows";
import type { TtmIncome } from "./ttmSynthesis";

/** Filing references of a recorded field, for a disclosure. */
function filingsText(proof: StatementFieldProvenance | undefined): string {
  return proof === undefined ? "filing not recorded" : proof.filings.map(f => `${f.form} ${f.accn}, filed ${f.filed}`).join(" + ") +
    (proof.derivation === undefined ? "" : `; ${proof.derivation}`);
}

/**
 * D-237 (P13, P20): the clause that names a re-based effective-tax denominator,
 * with the filed line, its filing and the row's own pre-tax figure. Null when
 * the row's own pre-tax income is the base.
 */
export function taxRatePretaxOperand(row: FmpIncomeStatementRow): string | null {
  const base = effectiveTaxPretaxIncome(row), own = num(row.incomeBeforeTax);
  if (base === null || own === null || base === own) return null;
  const proof = row.pretaxIncomeBeforeEquityMethod?.proof;
  return `${proof?.periodStart ?? "period start not recorded"} through ${String(row.date ?? "")}: ${base}${proof ? ` ${proof.unit}` : ""} (${filingsText(proof)}) against ${own} including the equity-method result`;
}

/**
 * D-237 (P13): the TTM effective tax rate's denominator, summed over the four
 * quarters of a complete tax pair from each quarter's own base, with the
 * disclosure when any quarter's base is the filed line rather than the row's
 * pre-tax income. The sum is the pair's own when no quarter is re-based, so a
 * window the filings leave alone keeps its figure to the last digit.
 */
export function ttmTaxRatePretax(q: FmpIncomeStatementRow[], pretax: number, tax: number | null): { value: number; basis: string | null } {
  const operands = q.flatMap(row => { const text = taxRatePretaxOperand(row); return text === null ? [] : [text]; });
  if (operands.length === 0) return { value: pretax, basis: null };
  const value = q.reduce((sum, row) => sum + (effectiveTaxPretaxIncome(row) ?? 0), 0);
  const tag = q.map(row => row.pretaxIncomeBeforeEquityMethod?.proof.tags[0]).find(Boolean) ?? "the filed pre-tax line";
  return { value, basis: `TTM effective tax rate: the provision${tax === null ? "" : ` ${tax}`} is divided by ${value}, the four quarters' filed pre-tax income before ` +
    `equity-method results (${tag}), not by the ${pretax} that includes the after-tax equity-method results, because the filer presents those results after its ` +
    `provision. Filed operands: ${operands.join("; ")}. Pre-tax income elsewhere keeps the figure that reconciles to net income.` };
}

/**
 * Effective tax rate from TTM statements (incomeTaxExpense / incomeBeforeTax)
 * for when the FMP ratios endpoints return nothing (otherwise
 * `returns.wacc.effectiveTaxRate` is missing). The two fields
 * are gated as a complete pair in ttmIncome, so the ratio never mixes quarter
 * subsets. Pre-tax losses return null — a negative-base "rate" is meaningless
 * for WACC (computeWacc suppresses a levered WACC when no observed rate exists).
 * D-237: the denominator is the pair's `taxRatePretaxIncome`.
 */
export function effectiveTaxRateFromTtm(ttm: TtmIncome | null): number | null {
  if (ttm === null || ttm.incomeTaxExpense === null || ttm.taxRatePretaxIncome === null) return null;
  if (!(ttm.taxRatePretaxIncome > 0)) return null;
  return (ttm.taxRateIncomeTaxExpense ?? ttm.incomeTaxExpense) / ttm.taxRatePretaxIncome;
}

export interface WaccStatementTaxRate {
  rate: number | null;
  basis: string | null;
  /** Set when the rate is a fallback (not the TTM observed rate): the disclosure for the manifest. */
  fallback: string | null;
}

/**
 * The WACC's statement tax rate when no vendor ratio exists (D-103, owner
 * decision): the TTM observed rate; on a TTM pre-tax loss a 0%
 * shield; with no complete TTM pair the latest annual observed rate, or a 0%
 * shield on an annual pre-tax loss. Every fallback is named. Nothing here
 * invents a rate: with neither pair the result stays null and computeWacc
 * withholds a levered WACC. The 0–35% clamp in computeWacc still applies and
 * discloses itself.
 */
export function waccTaxRateFromStatements(ttm: TtmIncome | null, latestAnnual: FmpIncomeStatementRow | undefined): WaccStatementTaxRate {
  const ttmRate = effectiveTaxRateFromTtm(ttm);
  if (ttmRate !== null) {
    const recoveredPretax = ttm?.filedIncomeFlows?.taxRatePretaxIncome ?? ttm?.filedIncomeFlows?.incomeBeforeTax;
    const rebased = !!ttm?.taxRatePretaxBasis && (!recoveredPretax ||
      recoveredPretax.tags.includes(`us-gaap/${PRETAX_EXCLUDING_EQUITY_METHOD_TAG}`) ||
      recoveredPretax.calculation === "pretax-plus-equity-method");
    return { rate: ttmRate, basis: rebased
      ? "TTM income tax expense / filed pre-tax income before equity-method results, from the statements (observed effective rate; the provider's ratio divides by pre-tax income after those results)"
      : "TTM income tax expense / pre-tax income from the statements (observed effective rate)", fallback: null };
  }
  const zeroShield = (why: string) => {
    const basis = `0% tax shield: ${why}, so no effective rate exists and the debt is given no tax shield (house rule, audit 2026-10-22 B-32)`;
    return { rate: 0, basis, fallback: basis };
  };
  if (ttm !== null && ttm.taxRatePretaxIncome !== null && ttm.taxRatePretaxIncome <= 0) {
    return zeroShield(`TTM pre-tax income is not positive (${ttm.taxRatePretaxIncome} through ${ttm.date})`);
  }
  const date = isoDay(latestAnnual?.date);
  const { pretax, tax } = effectiveTaxOperands(latestAnnual);
  if (date === null || pretax === null || tax === null) return { rate: null, basis: null, fallback: null };
  if (!(pretax > 0)) return zeroShield(`no complete TTM tax pair, and the latest annual pre-tax income is not positive (${pretax}, FY ending ${date})`);
  const basis = `latest annual income tax expense / pre-tax income, FY ending ${date} (observed effective rate; no complete TTM tax pair exists)`;
  return { rate: tax / pretax, basis, fallback: basis };
}
