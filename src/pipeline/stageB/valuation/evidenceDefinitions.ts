/** Filed revenue and investment line definitions; retain admitted scope without replacing observations (P5, P20; D-293). */
import { type CompanyFacts, conceptFactsSchema, parseFactPoints, factCoversPeriod, CORE_FACT_FORMS } from "@/edgar/xbrl";
import { vendorAgreesWithFiled } from "@/edgar/vendorAgreement";


/** D-293: retained filed line scope, never a replacement observation. */
export function investmentDefinition(tags: readonly string[]): string | null {
  const unique = [...new Set(tags)];
  if (unique.length === 1 && unique[0] === "us-gaap/LongTermInvestmentsAndReceivablesNet") return "long-term investments, advances and long-term receivables, net (filed carrying value)";
  if (unique.length === 1 && unique[0] === "us-gaap/EquityMethodInvestments") return "equity-method investments only (filed carrying value; other investments not established in this line)";
  if (unique.includes("us-gaap/EquityMethodInvestments") || unique.includes("us-gaap/LongTermInvestmentsAndReceivablesNet")) {
    const classes = [...new Set(unique.map(tag => tag === "us-gaap/EquityMethodInvestments" ? "equity-method investments"
      : tag === "us-gaap/LongTermInvestmentsAndReceivablesNet" ? "long-term investments, advances and receivables"
      : ["us-gaap/AvailableForSaleSecuritiesDebtSecuritiesNoncurrent", "us-gaap/MarketableSecuritiesNoncurrent"].includes(tag) ? "noncurrent debt securities"
      : tag === "us-gaap/EquitySecuritiesWithoutReadilyDeterminableFairValueAmount" ? "nonmarketable equity securities" : "other filed investment components"))];
    return `${classes.join(" plus ")} (filed carrying value)`;
  }
  return null;
}
export function revenueDefinition(tags: readonly string[]): string | null {
  return tags.some(t => /(?:^|\/)SalesAndOtherOperatingRevenue$/.test(t)) ? "sales and other operating revenue" : null;
}

export const INVESTMENT_DEFINITION_FAMILIES = [["us-gaap/LongTermInvestmentsAndReceivablesNet"], ["us-gaap/EquityMethodInvestments"]] as const;
export const REVENUE_DEFINITION_FAMILIES = [["us-gaap/SalesAndOtherOperatingRevenue"]] as const;

/** D-293: disclose an unmatched provider line beside the exact same-filing annual total. */
export function annualRevenueDefinition(row: { date?: string; revenue?: number; fiscalYear?: unknown; reportedCurrency?: string | null; filingDate?: string; fieldProvenance?: Record<string, { tags: string[] }> }, facts: CompanyFacts | null, cutoff: string): string | null {
  if (!facts || !row.date || !row.reportedCurrency || !row.filingDate || typeof row.revenue !== "number") return null;
  const parsed = conceptFactsSchema.safeParse(facts.facts["us-gaap"]?.Revenues);
  if (!parsed.success) return null;
  const samePeriod = (p: ReturnType<typeof parseFactPoints>[number]) => p.end === row.date && !!p.start && factCoversPeriod(p,row.date!,"FY") &&
    p.filed === row.filingDate!.slice(0,10) && p.filed <= cutoff.slice(0,10) && CORE_FACT_FORMS.has(p.form);
  const totals = parseFactPoints(parsed.data.units[row.reportedCurrency] ?? []).filter(samePeriod);
  if (new Set(totals.map(p => `${p.accn}|${p.start}|${p.val}`)).size !== 1) return null;
  const total = totals[0];
  if (!total || vendorAgreesWithFiled(row.revenue,total.val)) return null;
  for (const concepts of Object.values(facts.facts)) for (const raw of Object.values(concepts)) {
    const concept = conceptFactsSchema.safeParse(raw);
    if (concept.success && parseFactPoints(concept.data.units[row.reportedCurrency] ?? []).some(p => samePeriod(p) && p.accn === total.accn && p.start === total.start && vendorAgreesWithFiled(row.revenue!,p.val))) return null;
  }
  const year = /^\d{4}$/.test(String(row.fiscalYear)) ? String(row.fiscalYear) : row.date.slice(0,4);
  return `provider revenue line, not reconciled to a filed line; filed total revenues for FY${year} were ${total.val.toLocaleString("en-US", { maximumSignificantDigits: 21 })} ${row.reportedCurrency} (${total.form} ${total.accn})`;
}
