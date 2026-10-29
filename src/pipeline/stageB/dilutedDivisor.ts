/**
 * The per-share divisor of a loss period (audit 2026-10-27 FIN-404; see
 * docs/METHODOLOGY.md "Share basis (D-65)").
 *
 * Under ASC 260-10-45-17..20 a period with a loss from continuing operations
 * reports a diluted weighted count equal to its basic count, because every
 * potential share is antidilutive. The filed count is therefore right for
 * that period's EPS and wrong as a divisor of a value per share: the options
 * and RSUs are still outstanding. A loss row takes its own basic count plus
 * the award dilution (diluted minus basic) of the newest profitable period
 * that shows one, or its basic count alone when no period does, and says so.
 */

export interface DivisorRow {
  date: string;
  basic: number | null;
  diluted: number | null;
  netIncome: number | null;
  /** Income from continuing operations; decides the sign when filed, as EPS does. */
  continuingIncome?: number | null;
  /** The filed if-converted increment for the period (Task 11 supplies it); not award dilution. */
  conversionShares?: number | null;
}

export type DivisorBasis = "filed" | "loss-period-substituted" | "loss-period-basic";

export interface DivisorResult {
  shares: number | null;
  basis: DivisorBasis;
  donorDate: string | null;
  note: string | null;
}

const finite = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);
const income = (row: DivisorRow): number | null => {
  const v = row.continuingIncome ?? row.netIncome;
  return finite(v) ? v : null;
};

/** Award dilution (diluted − basic − conversion shares) of a profitable period, or null when it shows none. */
function awardDilution(row: DivisorRow): number | null {
  const inc = income(row);
  if (inc === null || inc <= 0 || !finite(row.basic) || !finite(row.diluted)) return null;
  const dilution = row.diluted - row.basic - (finite(row.conversionShares) ? row.conversionShares : 0);
  return dilution > 0 ? dilution : null;
}

export function awardDilutedDivisor(row: DivisorRow, donors: readonly DivisorRow[]): DivisorResult {
  const filed: DivisorResult = { shares: finite(row.diluted) ? row.diluted : null, basis: "filed", donorDate: null, note: null };
  const inc = income(row);
  if (!finite(row.basic) || !finite(row.diluted) || row.basic <= 0 || inc === null || inc >= 0 || row.diluted > row.basic + 1) return filed;
  const donor = donors
    .filter((d) => awardDilution(d) !== null)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))[0];
  if (donor === undefined) {
    return {
      shares: row.basic, basis: "loss-period-basic", donorDate: null,
      note: `The ${row.date} period is a loss, so its filed diluted count equals its basic count (antidilutive, ASC 260-10-45-17..20); no profitable period in the filed history shows award dilution, so the divisor is the basic count and carries no option or RSU dilution.`,
    };
  }
  const dilution = awardDilution(donor) as number;
  return {
    shares: row.basic + dilution, basis: "loss-period-substituted", donorDate: donor.date,
    note: `The ${row.date} period is a loss, so its filed diluted count equals its basic count (antidilutive, ASC 260-10-45-17..20); the divisor is that basic count plus the ${dilution.toLocaleString("en-US", { maximumFractionDigits: 0 })} shares of option and RSU dilution the profitable period ending ${donor.date} showed.`,
  };
}
