import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import { tagsFor } from "@/edgar/tagSynonyms";
import { sameFiledInstant, vendorAgreesWithFiled } from "@/edgar/vendorAgreement";
import { CORE_FACT_FORMS, parseFactPoints, conceptFactsSchema, type CompanyFacts } from "@/edgar/xbrl";
import type { FmpBalanceSheetRow, StatementFieldProvenance } from "@/providers/fmp";
import type { ManifestEntry } from "@/types/core";

const FIELDS = ["temporaryEquity", "temporaryEquityAttributableToParent", "temporaryEquityAttributableToNoncontrollingInterest"] as const;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const same = vendorAgreesWithFiled;
const utcDay = (timestamp: string): number => Math.floor(Date.parse(timestamp) / 86_400_000);

export function temporaryEquityFiledEnds(facts: CompanyFacts): ReadonlySet<string> {
 const ends = new Set<string>();
 for (const field of FIELDS) for (const tag of tagsFor(field)) {
  const parsed=conceptFactsSchema.safeParse(facts.facts["us-gaap"]?.[tag]);
  if(parsed.success) for(const points of Object.values(parsed.data.units)) for(const point of parseFactPoints(points)) if(!point.start) ends.add(point.end);
 }
 return ends;
}
export const TEMPORARY_EQUITY_REFUSED_REASON = "temporary carrying amounts were filed for this SEC period but refused (conflicting values, a filing after the analysis cutoff, or no exact period and unit match)";

/** Reuse the normalizer's cutoff, exact-period/unit and ambiguity guards once
 * per statement envelope. This performs no external reads or share inference.
 */
export function temporaryEquityRows(facts: CompanyFacts, scope: "annual" | "quarter", observedAt: string): FmpBalanceSheetRow[] | null {
  if (!FIELDS.some(field => tagsFor(field).some(tag => facts.facts["us-gaap"]?.[tag] !== undefined))) return null;
  const built = buildStatementsFromCompanyFacts(facts, { symbol: "SEC", cik: String(facts.cik), annualPeriods: 100, quarterlyPeriods: 100,
    asOf: observedAt.slice(0, 10), factsObservedAt: observedAt,
    vendorSplits: { status: "unavailable", source: "temporary-equity-only", reason: "no share fields are used for temporary-equity supplementation" } });
  return scope === "annual" ? built.balanceAnnual.rows : built.balanceQuarterly.rows;
}

/** A category may join only a matching vendor balance and SAME-FILING SEC
 * A/L/permanent-equity operands. D-261: that complete filed category replaces a vendor conflict.
 */
export function supplementTemporaryEquity<T extends FmpBalanceSheetRow>(row: T, secRows: readonly FmpBalanceSheetRow[], factsCik: number, filedEnds: ReadonlySet<string>): { row: T; gaps: ManifestEntry[] } {
  const gaps: ManifestEntry[] = [];
  if (!row.date || !filedEnds.has(row.date)) return { row, gaps };
  const refuse = (reason: string) => {
    gaps.push({ field: `statements.balance.${row.date}.temporaryEquity`, reason: `temporary-equity SEC enrichment withheld: ${reason}`, severity: "warn", cause: "temporary-equity-enrichment-withheld" });
    return { row, gaps };
  };
  if (typeof row.cik !== "string" || !/^\d{1,10}$/.test(row.cik) || row.cik.replace(/^0+/, "") !== String(factsCik).replace(/^0+/, "")) return refuse("vendor issuer CIK is unknown or differs from companyfacts");
  const sec = secRows.find(candidate => candidate.date === row.date && candidate.reportedCurrency === row.reportedCurrency);
  if (!sec) return refuse("no exact compatible SEC balance period and reporting currency");
  const equityFields = ["totalStockholdersEquity", "totalEquity"] as const;
  // Only an ordinary unsourced FMP zero is an undisclosed placeholder.
  // Known field evidence (even incompatible evidence) makes zero an observed
  // operand that must pass the same value and context admission checks.
  const knownEquity = equityFields.filter(field => finite(row[field]) &&
    (row[field] !== 0 || row.fieldProvenance?.[field] !== undefined || row.fieldConflicts?.[field] !== undefined));
  if (knownEquity.length === 0) return refuse("vendor permanent-equity scope is unknown");
  const operands = ["totalAssets", "totalLiabilities", ...knownEquity,
    ...(finite(row.minorityInterest) ? ["minorityInterest"] : [])];
  let out = row;
  for (const field of FIELDS) {
    const value = sec[field], evidence = sec.fieldProvenance?.[field];
    if (!finite(value) || evidence === undefined || sec.fieldConflicts?.[field]?.usable === false) continue;
    const filing = evidence.filings[0];
    const compatible = (source: StatementFieldProvenance | undefined): boolean => source?.source === "edgar" && source.unit === row.reportedCurrency &&
      source.periodEnd === row.date && source.periodStart === null && filing !== undefined && source.filings.length > 0 &&
      source.filings.every(item => item.accn === filing.accn && item.filed === filing.filed && item.form === filing.form);
    // Independently filed vendor operand evidence need not share SEC's filing
    // version, but its known unit, instant period and availability must agree.
    const compatibleVendor = (source: StatementFieldProvenance | undefined): boolean => source === undefined ||
      source.source === "edgar" && source.unit === row.reportedCurrency && source.periodEnd === row.date && source.periodStart === null &&
      // Acquisition can follow run start on the same UTC day. This preserves
      // day-level filing availability, without asserting intraday knowledge.
      Number.isFinite(utcDay(source.observedAt)) && utcDay(source.observedAt) <= utcDay(evidence.observedAt) &&
      source.filings.length > 0 && source.filings.every(item => /^\d{4}-\d{2}-\d{2}$/.test(item.filed) &&
        Number.isFinite(Date.parse(item.filed)) && new Date(item.filed).toISOString().slice(0, 10) === item.filed &&
        item.filed >= source.periodEnd && utcDay(item.filed) <= utcDay(source.observedAt) &&
        utcDay(item.filed) <= utcDay(evidence.observedAt) && CORE_FACT_FORMS.has(item.form));
    if (!compatible(evidence) || operands.some(operand => !finite(row[operand]) || !finite(sec[operand]) || !same(row[operand] as number, sec[operand] as number) ||
      row.fieldConflicts?.[operand]?.usable === false || !compatible(sec.fieldProvenance?.[operand]) || !compatibleVendor(row.fieldProvenance?.[operand]))) {
      gaps.push({ field: `statements.balance.${row.date}.${field}`, reason: "temporary-equity SEC enrichment withheld: vendor A/L/permanent-equity operands are missing, conflicting, or do not match the temporary category's exact SEC filing scope", severity: "warn", cause: "temporary-equity-operands-unmatched" });
      continue;
    }
    const prior = row.fieldConflicts?.[field];
    const ownRefusal = prior?.usable === false && prior.cause === undefined &&
      prior.reason.startsWith(`temporary-equity vendor/SEC conflict for ${field}:`) && prior.secValue === value &&
      sameFiledInstant(prior.secEvidence, evidence);
    if (prior?.usable === false && !ownRefusal) continue;
    const vendor = ownRefusal ? prior.vendorValue : row[field];
    if (vendor != null) {
      if (finite(vendor) && same(vendor, value) && row.fieldConflicts?.[field]?.usable !== false) continue;
      const reason = `${field} uses filed ${value} ${evidence.unit} after matching same-filing SEC assets, liabilities and permanent equity; vendor ${vendor} retained as an observation (D-261)`;
      out = { ...out, [field]: value, fieldProvenance: { ...out.fieldProvenance, [field]: evidence },
        fieldConflicts: { ...out.fieldConflicts, [field]: { vendorValue: finite(vendor) ? vendor : null, secValue: value, usable: true, resolution: "filed-family", reason, secEvidence: evidence } } };
      gaps.push({ field: `statements.balance.${row.date}.${field}`, reason, severity: "info", expected: true });
      continue;
    }
    if (row.fieldConflicts?.[field]?.usable === false) continue;
    out = { ...out, [field]: value, fieldProvenance: { ...out.fieldProvenance, [field]: evidence } };
    gaps.push({ field: `statements.balance.${row.date}.${field}`, reason: `missing temporary-equity category ${field} enriched from ${evidence.tags.join(" + ")} after matching same-filing SEC A/L/permanent-equity operands`, severity: "info", expected: true });
  }
  if (!FIELDS.some(field => finite(sec[field]) && sec.fieldProvenance?.[field] !== undefined && sec.fieldConflicts?.[field]?.usable !== false)) return refuse(TEMPORARY_EQUITY_REFUSED_REASON);
  return { row: out, gaps };
}
