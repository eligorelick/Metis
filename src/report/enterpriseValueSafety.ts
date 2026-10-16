import type { MarketData, Report } from "@/report/schema";

export const DERIVED_EV_ENDPOINT = "derived:enterprise-values(balance×close×shares)";
export interface HistoricalDebtEvidence { date: string; currency: string | null; value: number | null; usable: boolean }
const same = (a: number, b: number): boolean => Math.abs(a - b) <= Math.max(1, Math.abs(b) * 1e-10);

/** A locally computed cash-only bridge must reconcile to its own dated debt. */
export function admitHistoricalEnterpriseValue(
  enterpriseValue: MarketData["enterpriseValue"],
  origin: MarketData["enterpriseValueOrigin"],
  currency: string | null,
  debt: readonly HistoricalDebtEvidence[],
): Pick<MarketData, "enterpriseValue" | "enterpriseValueOrigin" | "enterpriseValueNote"> {
  if (enterpriseValue === null || origin !== "computed") return { enterpriseValue, ...(origin ? { enterpriseValueOrigin: origin } : {}) };
  const compatible = currency === null ? [] : debt.filter((entry) => entry.date === enterpriseValue.periodEnd && entry.currency === currency);
  const values = compatible.flatMap((entry) => entry.usable && entry.value !== null && Number.isFinite(entry.value) ? [entry.value] : []);
  const unavailable = compatible.length === 0 || compatible.some((entry) => !entry.usable || entry.value === null) || values.some((value) => !same(value, values[0]!));
  const mismatch = enterpriseValue.totalDebt === null || values.length === 0 || !same(enterpriseValue.totalDebt, values[0]!);
  if (unavailable || mismatch) return { enterpriseValue: null, enterpriseValueOrigin: origin,
    enterpriseValueNote: `Derived historical enterprise value withheld at ${enterpriseValue.periodEnd}: ${unavailable ? "same-date carrying debt is unavailable or conflicting" : "its debt operand differs from the established same-date carrying debt"}. The report's primary market EV is separate; no replacement historical value is inferred.` };
  return { enterpriseValue, enterpriseValueOrigin: origin };
}

/** Immutable stored-report view; only known local derivations can be refused. */
export function withHistoricalEnterpriseValueSafety(report: Report): Report {
  const md = report.marketData;
  if (!md?.enterpriseValue) return report;
  const ev = md.enterpriseValue;
  const computed = report.appendix?.sources.some((source) => source.provider === "computed" && source.endpoint === DERIVED_EV_ENDPOINT && source.asOf.slice(0, 10) === ev.periodEnd);
  const origin = md.enterpriseValueOrigin ?? (computed ? "computed" : undefined);
  if (origin !== "computed") return report;
  const debtIds = new Set(["computed.current-capital.total-debt-including-leases", "computed.capital.current.debtBridge.totalDebtIncludingLeases"]);
  const debt = (report.balanceSheet?.debtProfile.numbers ?? []).flatMap((number): HistoricalDebtEvidence[] =>
    debtIds.has(number.sourceId ?? number.source) && number.verified === true && number.unit === "currency"
      ? [{ date: number.asOf ?? "", currency: number.currency ?? null, value: number.value, usable: true }] : []);
  // A current balance or an absent historical reference cannot contradict an
  // older historical bridge. Preserve that date's value; identify its origin.
  if (!debt.some((entry) => entry.date === ev.periodEnd && entry.currency === md.currency)) {
    return md.enterpriseValueOrigin === origin ? report : { ...report, marketData: { ...md, enterpriseValueOrigin: origin } };
  }
  const admitted = admitHistoricalEnterpriseValue(ev, origin, md.currency, debt);
  if (admitted.enterpriseValue !== null && md.enterpriseValueOrigin === origin) return report;
  return { ...report, marketData: { ...md, ...admitted } };
}
