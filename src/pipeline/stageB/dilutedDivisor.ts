/**
 * The per-share divisor of a loss period (audit 2026-10-27 FIN-404; see
 * docs/METHODOLOGY.md "Share basis (D-65)").
 *
 * Under ASC 260-10-45-17..20 a period with a loss from continuing operations
 * reports a diluted weighted count equal to its basic count, because every
 * potential share is antidilutive. The filed count is therefore right for
 * that period's EPS and wrong as a divisor of a value per share: the options
 * and RSUs are still outstanding. A loss row takes its own basic count plus
 * the award dilution (diluted minus basic, less the filed if-converted shares
 * the equity bridge already deducts) of the newest profitable period that
 * shows one, or its basic count alone when no period does, and says so.
 */
import { CORE_FACT_FORMS, parseFactPoints, type CompanyFacts } from "@/edgar/xbrl";
import { millions } from "@/pipeline/stageB/netDebt";

export interface DivisorRow {
  date: string;
  basic: number | null;
  diluted: number | null;
  netIncome: number | null;
  /** Income from continuing operations; decides the sign when filed, as EPS does. */
  continuingIncome?: number | null;
  /**
   * The filed if-converted increment for the period, which is not award
   * dilution. `incomeDivisors` reads it from the filed facts; when Task 11
   * (B4b) supplies it from its own reader, that value takes precedence.
   */
  conversionShares?: number | null;
  /** Whether the row is a quarter or a fiscal year (a quarter and a year can share an end date). */
  period?: "quarter" | "fiscal year";
}

export type DivisorBasis = "filed" | "loss-period-substituted" | "loss-period-basic" | "loss-period-withheld";

export interface DivisorResult {
  shares: number | null;
  basis: DivisorBasis;
  donorDate: string | null;
  donorPeriod: "quarter" | "fiscal year" | null;
  note: string | null;
}

export interface DivisorOptions {
  /** The issuer files a convertible instrument near the bridge date (see `convertibleFiledNear`). */
  convertiblesFiled?: boolean;
}

const finite = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);
const income = (row: DivisorRow): number | null => {
  const v = row.continuingIncome ?? row.netIncome;
  return finite(v) ? v : null;
};
const conversion = (row: DivisorRow): number => (finite(row.conversionShares) && row.conversionShares > 0 ? row.conversionShares : 0);

/** Award dilution (diluted - basic - conversion shares, floored at 0) of a profitable period, or null when it shows none. */
function awardDilution(row: DivisorRow): number | null {
  const inc = income(row);
  if (inc === null || inc <= 0 || !finite(row.basic) || !finite(row.diluted)) return null;
  const dilution = row.diluted - row.basic - conversion(row);
  return dilution > 0 ? dilution : null;
}

export function awardDilutedDivisor(row: DivisorRow, donors: readonly DivisorRow[], options: DivisorOptions = {}): DivisorResult {
  const filed: DivisorResult = { shares: finite(row.diluted) ? row.diluted : null, basis: "filed", donorDate: null, donorPeriod: null, note: null };
  const inc = income(row);
  if (!finite(row.basic) || !finite(row.diluted) || row.basic <= 0 || inc === null || inc >= 0 || row.diluted > row.basic + 1) return filed;
  const lead = `The ${row.date} period is a loss, so its filed diluted count equals its basic count (antidilutive, ASC 260-10-45-17..20)`;
  const donor = donors
    .filter((d) => awardDilution(d) !== null)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))[0];
  if (donor === undefined) {
    return {
      ...filed, shares: row.basic, basis: "loss-period-basic",
      note: `${lead}; no profitable period among the last four quarters or the latest fiscal year shows award dilution, so the divisor is the basic count and carries no option or RSU dilution.`,
    };
  }
  const period = donor.period ?? "quarter";
  const donorLabel = `${period} ${donor.date}`;
  if (options.convertiblesFiled === true && (donor.conversionShares === undefined || donor.conversionShares === null)) {
    return {
      ...filed, basis: "loss-period-withheld", donorDate: donor.date, donorPeriod: period,
      note: `Award dilution not restored: the issuer files convertible instruments and the donor period's (${donorLabel}) conversion shares are not filed, so the restored increment could hold conversion shares the bridge already deducts. ${lead}; the filed count divides.`,
    };
  }
  const dilution = awardDilution(donor) as number;
  const taken = conversion(donor);
  return {
    shares: row.basic + dilution, basis: "loss-period-substituted", donorDate: donor.date, donorPeriod: period,
    note: `${lead}; the divisor is that basic count plus the ${millions(dilution)} shares of option and RSU dilution the profitable period (${donorLabel}) showed` +
      `${taken > 0 ? `, after taking out ${millions(taken)} shares of its filed conversion shares, which the bridge deducts as claims` : ""}.`,
  };
}

const CONVERSION_TAGS = [
  "IncrementalCommonSharesAttributableToConversionOfDebtSecurities",
  "IncrementalCommonSharesAttributableToConversionOfPreferredStock",
] as const;

/** The convertible carrying-value tags Task 11 reads (notes, and preferred at its option value). */
const CONVERTIBLE_TAGS = [
  "ConvertibleNotesPayable", "ConvertibleDebtNoncurrent", "ConvertibleLongTermNotesPayable",
  "ConvertibleDebtCurrent", "ConvertibleNotesPayableCurrent", "ConvertibleDebt",
  "ConvertiblePreferredStockNonredeemableOrRedeemableIssuerOptionValue",
] as const;

const DAY_MS = 86_400_000;
const days = (a: string, b: string): number => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS;

function points(facts: CompanyFacts, tag: string, unit: string) {
  const concept = facts.facts["us-gaap"]?.[tag] as { units?: Record<string, unknown[]> } | undefined;
  return parseFactPoints(concept?.units?.[unit] ?? []).filter((p) => CORE_FACT_FORMS.has(p.form.trim()) && Number.isFinite(p.val));
}

/**
 * The filed if-converted share increment for exactly one income period: a duration fact of the period's own length
 * (a quarter 70-110 days, a fiscal year 300-400) ending within 3 days of its end, on a core form, the latest filed.
 * The debt and preferred increments add. Null when neither is filed for the period.
 */
export function conversionSharesFiled(facts: CompanyFacts | null, date: string, period: "quarter" | "fiscal year"): number | null {
  if (facts === null) return null;
  const [min, max] = period === "quarter" ? [70, 110] : [300, 400];
  let total: number | null = null;
  for (const tag of CONVERSION_TAGS) {
    const match = points(facts, tag, "shares")
      .filter((p) => p.start !== undefined && Math.abs(days(date, p.end)) <= 3 && days(p.start, p.end) >= min && days(p.start, p.end) <= max)
      .sort((a, b) => (a.filed < b.filed ? 1 : a.filed > b.filed ? -1 : 0))[0];
    if (match !== undefined) total = (total ?? 0) + match.val;
  }
  return total;
}

/**
 * Whether a convertible instrument is filed with a nonzero balance at or within 366 days before `date`, in any
 * reporting currency: only the balance's presence matters, so every monetary unit the concept carries is read.
 */
export function convertibleFiledNear(facts: CompanyFacts | null, date: string): boolean {
  if (facts === null || date === "") return false;
  return CONVERTIBLE_TAGS.some((tag) => {
    const units = (facts.facts["us-gaap"]?.[tag] as { units?: Record<string, unknown[]> } | undefined)?.units ?? {};
    return Object.keys(units).some((unit) => points(facts, tag, unit).some((p) =>
      p.start === undefined && p.val !== 0 && days(p.end, date) >= 0 && days(p.end, date) <= 366));
  });
}
