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
  /** D-265: the row's filed weighted-average diluted count (the count its EPS divides by), beside a restored `shares`. */
  filedShares?: number | null;
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
    shares: row.basic + dilution, filedShares: row.diluted, basis: "loss-period-substituted", donorDate: donor.date, donorPeriod: period,
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
 * D-265 (P3, P20): a filed count of the issuer's own shares held in an employee benefit trust
 * (`CommonStockSharesHeldInEmployeeTrustShares`) or as an ESOP's unreleased suspense shares
 * (`EmployeeStockOwnershipPlanESOPNumberOfSuspenseShares`), read from the filed facts. The tag establishes only a
 * held count at an instant: it is reported beside a share-basis difference as a dated fact, never as its cause, and
 * it never moves the divisor, the market cap or any value.
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
 * The newest compatible held-share observation per tag (P2: an instant and a filing date on or before `cutoff`, in
 * shares, on a core form; the newest instant, then the newest filing wins, so a later correction supersedes), and
 * only then whether it supplies a positive count: a newest value of zero means there is no held count to report.
 * The first tag of `HELD_SHARE_TAGS` whose newest observation is positive wins. Null when none is.
 */
export function employeeTrustSharesFiled(facts: CompanyFacts | null, cutoff: string): EmployeeTrustShares | null {
  if (facts === null || !isDay(cutoff)) return null;
  for (const tag of HELD_SHARE_TAGS) {
    const newest = points(facts, tag, "shares")
      .filter((p) => p.start === undefined && isDay(p.end) && isDay(p.filed) && p.end <= cutoff && p.filed <= cutoff)
      .sort((a, b) => b.end.localeCompare(a.end) || b.filed.localeCompare(a.filed) || b.accn.localeCompare(a.accn))[0];
    if (newest !== undefined && newest.val > 0) {
      return { tag, shares: newest.val, instant: newest.end, accession: newest.accn, form: newest.form.trim(), filed: newest.filed };
    }
  }
  return null;
}

/**
 * D-265: which share count each market-value and per-share figure sits on. The divisor is the weighted-average
 * diluted count the per-share values divide by (and diluted EPS uses); the quote count is market cap ÷ price.
 * `scopeOwner` hands the whole statement to the owner that already speaks for the shape: "class" (a multi-class
 * issuer, `commonClassScope.ts`) or "quoted-unit" (an ADS quote, `shareUnits.ts`); no competing sentence is written.
 */
export interface ShareBasisComparison {
  divisorShares: number;
  quoteShares: number;
  /** (divisor ÷ quote count − 1) × 100: the one measured difference, against the quote count. */
  differencePct: number;
  direction: "above" | "below";
  /** Quote count − divisor, when the divisor is below. */
  shortfallShares?: number;
  /**
   * Below the quote count, the cause is "not-established": a reported held count (`employeeTrust`) is a dated
   * fact beside the difference, not its proven cause.
   */
  cause: "dilution-or-share-changes" | "not-established" | "scope-owner";
  scopeOwner?: "class" | "quoted-unit";
  /**
   * The divisor is a restored loss-period count (FIN-404: the latest period's basic count plus a profitable period's
   * award dilution), not a filed count; `filedShares` is the latest filed weighted-average diluted count EPS uses.
   */
  restored?: { filedShares: number };
  employeeTrust?: EmployeeTrustShares;
}

export function compareShareBasis(
  divisorShares: number | null | undefined, quoteShares: number | null | undefined, trust: EmployeeTrustShares | null | undefined,
  options: { scopeOwner?: "class" | "quoted-unit"; restoredFromFiled?: number | null } = {},
): ShareBasisComparison | null {
  if (!finite(divisorShares) || !finite(quoteShares) || divisorShares <= 0 || quoteShares <= 0) return null;
  const differencePct = (divisorShares / quoteShares - 1) * 100;
  const direction = divisorShares >= quoteShares ? "above" as const : "below" as const;
  const filed = options.restoredFromFiled;
  const restored = finite(filed) && filed > 0 && filed !== divisorShares ? { restored: { filedShares: filed } } : {};
  const base = { divisorShares, quoteShares, differencePct, direction, ...restored, ...(direction === "below" ? { shortfallShares: quoteShares - divisorShares } : {}) };
  if (options.scopeOwner) return { ...base, cause: "scope-owner", scopeOwner: options.scopeOwner };
  if (direction === "above") return { ...base, cause: "dilution-or-share-changes" };
  return { ...base, cause: "not-established", ...(trust ? { employeeTrust: trust } : {}) };
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
 * The one statement of the difference, always the divisor against the quote count ("4.76% below", "5% above",
 * "within 0.1% of"); every surface follows it with the quote count it is measured against.
 */
export function shareBasisRelation(c: ShareBasisComparison): string {
  if (agrees(c)) return `within ${SHARE_BASIS_DISPLAY_MIN_PCT}% of`;
  return `${pct(c.differencePct)}% ${c.differencePct < 0 ? "below" : "above"}`;
}

/** The held count as the filer reports it, with its filing, dated against the quote; no relation to either count is asserted. */
function heldCountReported(t: EmployeeTrustShares, quoteDay: string | null | undefined): string {
  const quote = quoteDay && isDay(quoteDay) ? quoteDay : null;
  const dated = quote !== null && t.instant >= quote ? "" : `, a dated observation${quote === null ? "" : ` before the quote (${quote})`}`;
  return `${millions(t.shares)} ${HELD_SHARE_LABEL[t.tag]} (us-gaap:${t.tag}) at ${t.instant} (${t.form} ${t.accession}, filed ${t.filed})${dated}`;
}

const deferral = (owner: "class" | "quoted-unit"): string => owner === "class"
  ? "The diluted denominator and the quoted count are on the scopes the share-class note states; this note does not compare them."
  : "The diluted denominator and the quoted count are put on the quoted basis by the ADS (quoted-unit) note; this note does not compare them.";

/**
 * The bridge and valuation sentence: for a class or ADS shape, the deferral to that owner (any direction); for a
 * divisor below the quote count, the measured difference, that dilution cannot explain it, the reported held count
 * when one is filed, and that the cause is not established; null for a divisor at or above it.
 */
export function shareBasisNote(c: ShareBasisComparison, quoteDay: string | null | undefined): string | null {
  if (c.cause === "scope-owner") return deferral(c.scopeOwner ?? "class");
  // A restored divisor is named as what it is in either direction (FIN-404); EPS keeps the filed count.
  const divisor = c.restored === undefined ? `The diluted divisor (${millions(c.divisorShares)})`
    : `The valuation divisor (${millions(c.divisorShares)}; restored: the latest period's basic count plus a profitable period's award dilution, ` +
      `not the filed weighted-average diluted count of ${millions(c.restored.filedShares)})`;
  if (c.direction !== "below") {
    return c.restored === undefined ? null : `${divisor} is ${shareBasisRelation(c)} the ${millions(c.quoteShares)} shares the quoted market cap implies.`;
  }
  if (agrees(c)) {
    return `${divisor} and the ${millions(c.quoteShares)} shares the quoted market cap implies agree within ` +
      `${SHARE_BASIS_DISPLAY_MIN_PCT}%; no cause is attributed to so small a difference.`;
  }
  const head = `${divisor} is ${shareBasisRelation(c)} the ${millions(c.quoteShares)} shares the quoted market cap implies ` +
    `(${millions(c.shortfallShares ?? 0)} shares fewer); option and RSU dilution can only raise a diluted count, so it does not explain this difference.`;
  const t = c.employeeTrust;
  if (t === undefined) {
    return `${head} No filed employee-trust or unreleased ESOP share count on or before the analysis cutoff is admitted, and the cause of the difference is not established.`;
  }
  return `${head} The filer reports ${heldCountReported(t, quoteDay)}; the cause of the difference is not established by the admitted evidence.`;
}

/**
 * The basis sentence for a multiple on provider market cap (`marketCap` true) or on price / diluted EPS; null for a
 * class or ADS shape, whose owner states the basis.
 */
export function shareBasisSentence(c: ShareBasisComparison, marketCap: boolean, quoteDay?: string | null): string | null {
  if (c.cause === "scope-owner") return null;
  if (c.restored !== undefined) {
    // EPS divides by the filed count, the per-share values by the restored divisor: each sentence names its own.
    const eps = compareShareBasis(c.restored.filedShares, c.quoteShares, c.employeeTrust)!;
    if (!marketCap) return shareBasisSentence(eps, false, quoteDay)!.replace("(latest ", "(latest filed ");
    return `Share basis: market cap is the quote price × the ${millions(c.quoteShares)} shares the provider's market cap implies; per-share values divide by ` +
      `a restored valuation divisor (${millions(c.divisorShares)}: the latest period's basic count plus a profitable period's award dilution, not a filed count), ` +
      `${shareBasisRelation(c)} that count. Diluted EPS divides by the filed weighted-average diluted counts (latest filed ${millions(c.restored.filedShares)}).` +
      shareBasisTail(c, quoteDay);
  }
  const relation = `${shareBasisRelation(c)} that count`;
  const tail = shareBasisTail(c, quoteDay);
  return marketCap
    ? `Share basis: market cap is the quote price × the ${millions(c.quoteShares)} shares the provider's market cap implies; diluted EPS and per-share values divide by weighted-average diluted shares (latest ${millions(c.divisorShares)}), ${relation}.${tail}`
    : `Share basis: price / diluted EPS sits on weighted-average diluted shares (latest ${millions(c.divisorShares)}); the market-cap multiples sit on the ${millions(c.quoteShares)} shares the quoted market cap implies, and the diluted count is ${relation}.${tail}`;
}

/** Below the quote count: not dilution, and the cause is not established (with a reported held count when filed). */
function shareBasisTail(c: ShareBasisComparison, quoteDay: string | null | undefined): string {
  if (agrees(c) || c.direction !== "below") return "";
  const t = c.employeeTrust;
  return t !== undefined
    ? ` The difference is not dilution, and its cause is not established by the admitted evidence; the filer reports ${heldCountReported(t, quoteDay)}.`
    : " The difference is not dilution, and its cause is not established.";
}
