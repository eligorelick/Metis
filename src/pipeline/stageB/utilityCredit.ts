/**
 * Audit 2026-10-22 B-13: the two leverage ratios of Moody's "Regulated
 * Electric and Gas Utilities" methodology (6 August 2024) that the regulated-
 * utility balance sheet is scored on.
 *
 * - CFO pre-W/C / Debt: operating cash flow before changes in working
 *   capital, over total debt. Withheld when the working-capital change is not
 *   on file: reported operating cash flow is a different measure.
 * - Debt / Book Capitalization: total debt over debt + total equity
 *   (noncontrolling interests included) + deferred income taxes, Moody's
 *   definition. Withheld when the deferred taxes are not tagged at the balance
 *   date, or when the capitalization is not positive.
 *
 * Pure: the caller supplies statement values; deferred taxes come from the
 * issuer's companyfacts.
 */
import type { CompanyFacts } from "@/edgar/xbrl";
import { instantFact, validDay } from "@/pipeline/stageB/marketableEquity";

/** Net deferred income tax liability, the balance-sheet line, in preference order. */
export const DEFERRED_INCOME_TAX_TAGS = [
  "DeferredIncomeTaxLiabilitiesNet",
  "DeferredIncomeTaxesAndOtherTaxLiabilitiesNoncurrent",
  "DeferredTaxLiabilitiesNoncurrent",
] as const;

export interface UtilityCreditInputs {
  asOf: string | null;
  operatingCashFlow: number | null;
  /** Cash-flow-statement effect of working-capital changes (negative = a use of cash). */
  changeInWorkingCapital: number | null;
  totalDebt: number | null;
  /** Total equity including noncontrolling interests. */
  totalEquity: number | null;
  deferredIncomeTaxes: { value: number; basis: string } | null;
}

export interface UtilityCreditMetrics {
  asOf: string | null;
  cfoPreWcToDebtPct: number | null;
  debtToBookCapitalizationPct: number | null;
  /** The inputs of each ratio, or why it was withheld. */
  notes: string[];
  /** The figures each ratio reads, for the score evidence. */
  operands?: { operatingCashFlow: number | null; changeInWorkingCapital: number | null; totalDebt: number | null; totalEquity: number | null; deferredIncomeTaxes: number | null };
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const billions = (v: number): string => `${(v / 1e9).toFixed(2)}B`;

export function deferredIncomeTaxesAt(facts: CompanyFacts | null | undefined, date: string | null, unit: string | null, observedAt: string): { value: number; basis: string } | null {
  const observedDay = observedAt.slice(0, 10);
  if (!facts || !validDay(date) || typeof unit !== "string" || !/^[A-Z]{3}$/.test(unit) || !validDay(observedDay)) return null;
  for (const tag of DEFERRED_INCOME_TAX_TAGS) {
    const fact = instantFact(facts, tag, unit, date, observedDay);
    if (fact !== null) return { value: fact.val, basis: `us-gaap/${tag} ${billions(fact.val)} at ${date} (${fact.form} filed ${fact.filed})` };
  }
  return null;
}

export function utilityCreditMetrics(i: UtilityCreditInputs): UtilityCreditMetrics {
  const notes: string[] = [];
  const debt = finite(i.totalDebt) && i.totalDebt > 0 ? i.totalDebt : null;
  let cfoPreWcToDebtPct: number | null = null;
  if (debt === null) {
    notes.push("CFO pre-W/C / debt withheld: total debt is not on file.");
  } else if (!finite(i.operatingCashFlow)) {
    notes.push("CFO pre-W/C / debt withheld: operating cash flow is not on file.");
  } else if (!finite(i.changeInWorkingCapital)) {
    notes.push("CFO pre-W/C / debt withheld: the cash-flow statement's working-capital change is not on file, and reported operating cash flow is a different measure.");
  } else {
    const preWc = i.operatingCashFlow - i.changeInWorkingCapital;
    cfoPreWcToDebtPct = preWc / debt * 100;
    notes.push(`CFO pre-W/C / debt ${cfoPreWcToDebtPct.toFixed(1)}%: operating cash flow ${billions(i.operatingCashFlow)} less the working-capital change ${billions(i.changeInWorkingCapital)}, over total debt ${billions(debt)}.`);
  }
  let debtToBookCapitalizationPct: number | null = null;
  if (debt === null) {
    notes.push("Debt / book capitalization withheld: total debt is not on file.");
  } else if (!finite(i.totalEquity)) {
    notes.push("Debt / book capitalization withheld: total equity is not on file.");
  } else if (i.deferredIncomeTaxes === null) {
    notes.push("Debt / book capitalization withheld: deferred income taxes are not tagged at the balance date, and Moody's book capitalization includes them.");
  } else {
    const capitalization = debt + i.totalEquity + i.deferredIncomeTaxes.value;
    if (capitalization <= 0) {
      notes.push(`Debt / book capitalization withheld: book capitalization is not positive (debt ${billions(debt)}, equity ${billions(i.totalEquity)}, deferred taxes ${billions(i.deferredIncomeTaxes.value)}).`);
    } else {
      debtToBookCapitalizationPct = debt / capitalization * 100;
      notes.push(`Debt / book capitalization ${debtToBookCapitalizationPct.toFixed(1)}%: total debt ${billions(debt)} over debt plus total equity ${billions(i.totalEquity)} plus deferred income taxes (${i.deferredIncomeTaxes.basis}).`);
    }
  }
  return {
    asOf: i.asOf, cfoPreWcToDebtPct, debtToBookCapitalizationPct, notes,
    operands: { operatingCashFlow: i.operatingCashFlow, changeInWorkingCapital: i.changeInWorkingCapital, totalDebt: i.totalDebt,
      totalEquity: i.totalEquity, deferredIncomeTaxes: i.deferredIncomeTaxes?.value ?? null },
  };
}
