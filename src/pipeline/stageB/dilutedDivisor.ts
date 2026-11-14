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
import { CORE_FACT_FORMS, factCoversPeriod, parseFactPoints, type CompanyFacts } from "@/edgar/xbrl";
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
 * ending at its end, by the P1 owner's one definition (`factCoversPeriod`, src/edgar/xbrl.ts: a quarter 70-125 days,
 * a fiscal year 300-400, the end within 3 days; D-247), on a core form, the latest filed. The equity bridge's reader
 * (`convertibleInstrumentsAt`) asks the same. The debt and preferred increments add. Null when neither is filed for
 * the period.
 */
export function conversionSharesFiled(facts: CompanyFacts | null, date: string, period: "quarter" | "fiscal year"): number | null {
  if (facts === null) return null;
  let total: number | null = null;
  for (const tag of CONVERSION_TAGS) {
    const match = points(facts, tag, "shares")
      .filter((p) => factCoversPeriod(p, date, period === "quarter" ? "Q" : "FY"))
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

/**
 * D-265 (P3, P20): the issuer's own shares held where EPS does not count them, read from the filed facts. An employee
 * benefit trust's shares (`CommonStockSharesHeldInEmployeeTrustShares`) and an ESOP's unreleased suspense shares
 * (`EmployeeStockOwnershipPlanESOPNumberOfSuspenseShares`) can be issued, and so inside the quoted count, while EPS
 * leaves them out. Disclosure only: the count names filed evidence beside a share-basis difference and never moves
 * the divisor, the market cap or any value.
 */
export const HELD_SHARE_TAGS = [
  "CommonStockSharesHeldInEmployeeTrustShares",
  "EmployeeStockOwnershipPlanESOPNumberOfSuspenseShares",
] as const;

const HELD_SHARE_LABEL: Record<(typeof HELD_SHARE_TAGS)[number], string> = {
  CommonStockSharesHeldInEmployeeTrustShares: "shares held in an employee trust",
  EmployeeStockOwnershipPlanESOPNumberOfSuspenseShares: "unreleased (suspense) ESOP shares",
};

export interface EmployeeTrustShares {
  tag: (typeof HELD_SHARE_TAGS)[number];
  shares: number;
  instant: string;
  accession: string;
  form: string;
  filed: string;
}

const isDay = (v: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(`${v}T00:00:00Z`));

/**
 * The newest filed held-share count at an instant on or before `cutoff` (P2: nothing filed or dated after the cutoff),
 * in shares, on a core form; the first tag of `HELD_SHARE_TAGS` with such a fact wins. Null when none is filed.
 */
export function employeeTrustSharesFiled(facts: CompanyFacts | null, cutoff: string): EmployeeTrustShares | null {
  if (facts === null || !isDay(cutoff)) return null;
  for (const tag of HELD_SHARE_TAGS) {
    const best = points(facts, tag, "shares")
      .filter((p) => p.start === undefined && p.val > 0 && isDay(p.end) && isDay(p.filed) && p.end <= cutoff && p.filed <= cutoff)
      .sort((a, b) => b.end.localeCompare(a.end) || b.filed.localeCompare(a.filed) || b.accn.localeCompare(a.accn))[0];
    if (best !== undefined) return { tag, shares: best.val, instant: best.end, accession: best.accn, form: best.form.trim(), filed: best.filed };
  }
  return null;
}

/**
 * D-265: which share count each market-value and per-share figure sits on. The divisor is the weighted-average
 * diluted count the per-share values divide by (and diluted EPS uses); the quote count is market cap ÷ price.
 * `scopeOwner` hands the explanation to the owner that already speaks for the shape: "class" (a multi-class issuer,
 * `commonClassScope.ts`) or "quoted-unit" (an ADS quote, `shareUnits.ts`), whose counts are not on one ordinary-share
 * basis with a held-share fact.
 */
export interface ShareBasisComparison {
  divisorShares: number;
  quoteShares: number;
  /** (divisor ÷ quote count − 1) × 100. */
  differencePct: number;
  direction: "above" | "below";
  /** Quote count − divisor, when the divisor is below. */
  shortfallShares?: number;
  cause: "dilution-or-share-changes" | "employee-trust-filed" | "not-established" | "scope-owner";
  employeeTrust?: EmployeeTrustShares;
}

export function compareShareBasis(
  divisorShares: number | null | undefined, quoteShares: number | null | undefined, trust: EmployeeTrustShares | null | undefined,
  options: { scopeOwner?: "class" | "quoted-unit" } = {},
): ShareBasisComparison | null {
  if (!finite(divisorShares) || !finite(quoteShares) || divisorShares <= 0 || quoteShares <= 0) return null;
  const differencePct = (divisorShares / quoteShares - 1) * 100;
  const base = { divisorShares, quoteShares, differencePct };
  if (divisorShares >= quoteShares) return { ...base, direction: "above", cause: options.scopeOwner ? "scope-owner" : "dilution-or-share-changes" };
  const below = { ...base, direction: "below" as const, shortfallShares: quoteShares - divisorShares };
  if (options.scopeOwner) return { ...below, cause: "scope-owner" };
  return trust ? { ...below, cause: "employee-trust-filed", employeeTrust: trust } : { ...below, cause: "not-established" };
}

const pct = (v: number): string => String(Math.round(Math.abs(v) * 100) / 100);

/**
 * The share-basis difference (in percent) below which the two counts are said to agree and no cause is attributed.
 * It is the D-60 note's existing display threshold, moved here so the valuation note, the bridge note and the
 * multiples' basis text read one value; it decides wording only, never a figure.
 */
export const SHARE_BASIS_DISPLAY_MIN_PCT = 0.1;
const agrees = (c: ShareBasisComparison): boolean => Math.abs(c.differencePct) < SHARE_BASIS_DISPLAY_MIN_PCT;

/**
 * The reader sentence for a divisor below the quoted count (null otherwise). It states the measured difference, says
 * dilution cannot explain it, and names a filed held-share count, dated against the quote, or says the cause is not
 * established; for a class or quoted-unit shape it defers to that owner's note and attributes nothing.
 */
export function shareBasisNote(c: ShareBasisComparison, quoteDay: string | null | undefined): string | null {
  if (c.direction !== "below") return null;
  if (agrees(c)) {
    return `The diluted divisor (${millions(c.divisorShares)}) and the ${millions(c.quoteShares)} shares the quoted market cap implies agree within ` +
      `${SHARE_BASIS_DISPLAY_MIN_PCT}%; no cause is attributed to so small a difference.`;
  }
  const measured = `The diluted divisor (${millions(c.divisorShares)}) is ${millions(c.shortfallShares ?? 0)} shares (${pct(c.differencePct)}%) below the ` +
    `${millions(c.quoteShares)} shares the quoted market cap implies`;
  if (c.cause === "scope-owner") return `${measured}; the class or quoted-unit note states how each count is put on the quoted basis, and this comparison does not attribute the difference.`;
  const head = `${measured}; option and RSU dilution can only raise a diluted count, so it does not explain this difference.`;
  const t = c.employeeTrust;
  if (c.cause !== "employee-trust-filed" || t === undefined) {
    return `${head} No filed employee-trust or unreleased ESOP share count on or before the analysis cutoff explains it, so the cause of the difference is not established.`;
  }
  const dated = quoteDay && isDay(quoteDay) && t.instant >= quoteDay ? "" : ` The held count is a dated observation at ${t.instant}, before the quote${quoteDay && isDay(quoteDay) ? ` (${quoteDay})` : ""}.`;
  return `${head} Filed evidence: us-gaap:${t.tag} ${millions(t.shares)} shares at ${t.instant} (${t.form} ${t.accession}, filed ${t.filed}); ` +
    "such shares can be issued, and so inside the quoted count, while EPS and its diluted count leave them out." + dated +
    " Period averaging, awards and share transactions since the quarter also move the two counts; this comparison does not size each cause.";
}

/** The basis sentence for a multiple on provider market cap (`marketCap` true) or on price / diluted EPS. */
export function shareBasisSentence(c: ShareBasisComparison, marketCap: boolean): string {
  const quote = `the ${millions(c.quoteShares)} shares the ${marketCap ? "provider's" : "quoted"} market cap implies`;
  const word = (more: boolean) => agrees(c) ? `within ${SHARE_BASIS_DISPLAY_MIN_PCT}%` : `${pct(c.differencePct)}% ${more ? "more" : "fewer"}`;
  const t = c.employeeTrust;
  const tail = agrees(c) ? ""
    : c.cause === "employee-trust-filed" && t
      ? ` The difference is not dilution; the filer tags ${millions(t.shares)} ${HELD_SHARE_LABEL[t.tag]} at ${t.instant} (us-gaap:${t.tag}), filed evidence that can explain it; this comparison does not size each cause.`
      : c.cause === "not-established" ? " The difference is not dilution, and its cause is not established."
        : c.cause === "scope-owner" ? " The class or quoted-unit note states how each count is put on the quoted basis; this comparison does not attribute the difference." : "";
  return marketCap
    ? `Share basis: market cap is the quote price × ${quote}; diluted EPS and per-share values divide by weighted-average diluted shares (latest ${millions(c.divisorShares)}, ${word(c.differencePct > 0)}).${tail}`
    : `Share basis: price / diluted EPS sits on weighted-average diluted shares (latest ${millions(c.divisorShares)}); the market-cap multiples sit on ${quote}, ${word(c.differencePct < 0)}.${tail}`;
}
