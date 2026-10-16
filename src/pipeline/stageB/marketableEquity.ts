/**
 * D-60: marketable equity securities held inside "cash and short-term
 * investments". NVDA's 10-Q for the quarter ended 2026-07-26 reports cash and
 * short-term investments of $99.37B as cash $22.44B + marketable debt
 * securities $34.14B + publicly-held equity securities $42.78B, most of the
 * equity under lock-up. Equity stakes are not cash: the house net debt leaves
 * them out and the DCF bridge carries them as a separately disclosed
 * non-operating asset.
 *
 * The amount comes only from the issuer's own fair-value XBRL fact at the
 * balance date, and only when the filing's components reconcile to the
 * combined total (cash + marketable debt securities + equity securities), so
 * an equity stake reported outside short-term investments is never subtracted
 * from cash. Pure: the bundle's companyfacts are the only input.
 */
import { CORE_FACT_FORMS, parseFactPoints, type CompanyFacts, type FactPoint } from "@/edgar/xbrl";

/** Equity securities at fair value through net income: the current-only tag first, then the undivided total. */
export const MARKETABLE_EQUITY_TAGS = ["EquitySecuritiesFvNiCurrent", "EquitySecuritiesFvNi"] as const;
/** Marketable debt securities that sit beside them in short-term investments. */
export const MARKETABLE_DEBT_TAGS = ["DebtSecuritiesCurrent", "AvailableForSaleSecuritiesDebtSecuritiesCurrent"] as const;

export interface MarketableEquityInCash {
  value: number;
  /** Tags whose values reconciled, as `us-gaap/<tag>`. */
  tags: string[];
  filings: { accn: string; filed: string; form: string }[];
  basis: string;
}

export interface MarketableEquityBalance {
  date?: string | null;
  reportedCurrency?: string | null;
  cashAndCashEquivalents?: number | null;
  shortTermInvestments?: number | null;
  cashAndShortTermInvestments?: number | null;
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const validDay = (d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;

/** Newest-filed instant fact for `tag` at exactly `end`, in `unit`, filed by `observedDay`. */
function instantFact(facts: CompanyFacts, tag: string, unit: string, end: string, observedDay: string): FactPoint | null {
  const concept = facts.facts["us-gaap"]?.[tag] as { units?: Record<string, unknown[]> } | undefined;
  const points = parseFactPoints(concept?.units?.[unit] ?? []).filter((p) =>
    p.start === undefined && p.end === end && p.val >= 0 && CORE_FACT_FORMS.has(p.form) && validDay(p.filed) && p.filed <= observedDay);
  return points.sort((a, b) => b.filed.localeCompare(a.filed) || b.accn.localeCompare(a.accn))[0] ?? null;
}

const billions = (v: number): string => `${(v / 1e9).toFixed(3)}B`;

/**
 * D-65: the issuer's filed carrying value of equity securities without a
 * readily determinable fair value (us-gaap/EquitySecuritiesWithoutReadily-
 * DeterminableFairValueAmount: cost less impairment, adjusted for observable
 * price changes) at the balance date. Cited beside the long-term investments
 * the DCF bridge adds back; never used to size them.
 */
export function nonMarketableEquityCarrying(facts: CompanyFacts | null | undefined, date: string | null, unit: string | null, observedAt: string): { value: number; accn: string; form: string; filed: string } | null {
  const observedDay = observedAt.slice(0, 10);
  if (!facts || !validDay(date) || typeof unit !== "string" || !/^[A-Z]{3}$/.test(unit) || !validDay(observedDay)) return null;
  const fact = instantFact(facts, "EquitySecuritiesWithoutReadilyDeterminableFairValueAmount", unit, date, observedDay);
  return fact === null || fact.val <= 0 ? null : { value: fact.val, accn: fact.accn, form: fact.form, filed: fact.filed };
}

export function marketableEquityInCash(facts: CompanyFacts | null | undefined, row: MarketableEquityBalance, observedAt: string): MarketableEquityInCash | null {
  const date = row.date ?? null;
  const unit = row.reportedCurrency ?? null;
  const observedDay = observedAt.slice(0, 10);
  if (!facts || !validDay(date) || typeof unit !== "string" || !/^[A-Z]{3}$/.test(unit) || !validDay(observedDay)) return null;
  const cash = row.cashAndCashEquivalents;
  const combined = finite(row.cashAndShortTermInvestments)
    ? row.cashAndShortTermInvestments
    : finite(cash) && finite(row.shortTermInvestments) ? cash + row.shortTermInvestments : null;
  if (!finite(cash) || combined === null) return null;
  const tolerance = Math.max(1, Math.abs(combined) * 1e-4);
  const debtOptions: (FactPoint & { tag: string } | null)[] = [
    ...MARKETABLE_DEBT_TAGS.flatMap((tag) => {
      const fact = instantFact(facts, tag, unit, date, observedDay);
      return fact === null ? [] : [{ ...fact, tag }];
    }),
    null,
  ];
  for (const equityTag of MARKETABLE_EQUITY_TAGS) {
    const equity = instantFact(facts, equityTag, unit, date, observedDay);
    if (equity === null || equity.val <= 0) continue;
    for (const debt of debtOptions) {
      const debtValue = debt?.val ?? 0;
      if (Math.abs(cash + debtValue + equity.val - combined) > tolerance) continue;
      const used = debt === null ? [{ ...equity, tag: equityTag }] : [{ ...equity, tag: equityTag }, debt];
      return {
        value: equity.val,
        tags: used.map((p) => `us-gaap/${p.tag}`),
        filings: used.map((p) => ({ accn: p.accn, filed: p.filed, form: p.form })),
        basis:
          `marketable equity securities ${billions(equity.val)} (us-gaap/${equityTag}, ${equity.form} filed ${equity.filed}) at fair value on ${date}: ` +
          `cash ${billions(cash)}${debt === null ? "" : ` + marketable debt securities ${billions(debt.val)} (us-gaap/${debt.tag})`} + equity securities = ` +
          `cash and short-term investments ${billions(combined)}`,
      };
    }
  }
  return null;
}
