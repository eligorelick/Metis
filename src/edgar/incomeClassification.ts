import type { CompanyFacts } from "@/edgar/xbrl";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import type { FmpIncomeStatementRow, FmpPayload, StatementFieldProvenance } from "@/providers/fmp";
import type { FetchResult, ManifestEntry } from "@/types/core";

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const same = (a: number, b: number) => Math.abs(a - b) <= Math.max(1e-8, Math.abs(b) * 1e-10);

/** Reuse canonical filed statement resolution; never infer expense placement from EBIT. */
export function enrichIncomeClassification(income: FetchResult<FmpPayload<FmpIncomeStatementRow>>, facts: CompanyFacts, scope: "annual" | "quarter", observedAt: string): { income: typeof income; gaps: ManifestEntry[] } {
  if (!income.ok || income.value.source === "edgar" || income.value.data.rows.length === 0) return { income, gaps: [] };
  const built = buildStatementsFromCompanyFacts(facts, { symbol: "", cik: String(facts.cik), asOf: observedAt.slice(0, 10), factsObservedAt: observedAt,
    annualPeriods: Math.max(12, income.value.data.rows.length + 2), quarterlyPeriods: Math.max(12, income.value.data.rows.length + 4),
    vendorSplits: { status: "unavailable", source: "income-classification", reason: "Income classification does not resolve per-share values" } });
  const filed = scope === "annual" ? built.incomeAnnual.rows : built.incomeQuarterly.rows;
  const gaps: ManifestEntry[] = [];
  const allowed: Record<string, string[]> = {
    revenue: ["us-gaap/Revenues", "us-gaap/RevenueFromContractWithCustomerExcludingAssessedTax", "us-gaap/SalesRevenueNet", "us-gaap/RevenueFromContractWithCustomerIncludingAssessedTax"],
    costOfRevenue: ["us-gaap/CostOfRevenue", "us-gaap/CostOfGoodsAndServicesSold"],
    grossProfit: ["us-gaap/GrossProfit"], operatingExpenses: ["us-gaap/OperatingExpenses"],
  };
  const rows = income.value.data.rows.map(row => {
    if (!row.date || !/^[A-Z]{3}$/.test(row.reportedCurrency ?? "") || (row.cik != null && row.cik.replace(/^0+/, "") !== String(facts.cik).replace(/^0+/, ""))) return row;
    const sec = filed.find(candidate => candidate.date === row.date);
    if (!sec) return row;
    const evidenceFor = (field: string): StatementFieldProvenance | null => {
      const proof = sec.fieldProvenance?.[field];
      if (field === "grossProfit" && proof === undefined) {
        const revenue = evidenceFor("revenue"), cost = evidenceFor("costOfRevenue");
        if (revenue && cost && cost.tags.some(tag => allowed.costOfRevenue!.includes(tag)) &&
          revenue.periodStart === cost.periodStart && revenue.periodEnd === cost.periodEnd && revenue.unit === cost.unit &&
          JSON.stringify(revenue.filings) === JSON.stringify(cost.filings) && finite(sec.revenue) && finite(sec.costOfRevenue)) {
          return { ...revenue, tags: [...revenue.tags, ...cost.tags], calculation: "revenue-minus-cost" };
        }
      }
      return proof && proof.unit === row.reportedCurrency && proof.periodEnd === row.date && proof.periodStart !== null &&
        (row.periodStart == null || row.periodStart === proof.periodStart) && proof.filings.length > 0 &&
        (row.filingDate == null || [...proof.filings].sort((a, b) => b.filed.localeCompare(a.filed))[0]?.filed === row.filingDate) ? proof : null;
    };
    let out = row;
    const refuse = (field: string, value: number | null, proof: StatementFieldProvenance | null, reason: string) => {
      const fieldConflicts = { ...out.fieldConflicts };
      if (fieldConflicts[field]?.usable !== false) fieldConflicts[field] = { usable: false, vendorValue: finite(row[field]) ? row[field] : null, secValue: value, reason, ...(proof ? { secEvidence: proof } : {}) };
      out = { ...out, [field]: null, fieldConflicts };
      gaps.push({ field: `statements.income.${row.date}.${field}`, reason, severity: "warn", attemptedSources: ["fmp:income-statement", "edgar:companyfacts"] });
    };
    for (const [field, tags] of Object.entries(allowed)) {
      if (row.fieldConflicts?.[field]?.usable === false) { out = { ...out, [field]: null }; continue; }
      const proof = evidenceFor(field);
      if (!proof || (!proof.tags.some(tag => tags.includes(tag)) && !(field === "grossProfit" && proof.calculation === "revenue-minus-cost")) || !finite(sec[field]) || !finite(row[field])) continue;
      if (same(row[field], sec[field])) out = { ...out, fieldProvenance: { ...out.fieldProvenance, [field]: proof } };
      else refuse(field, sec[field], proof, `Income classification conflict for ${field}: vendor ${row[field]}, filed ${sec[field]} ${proof.unit}, ${proof.periodStart} through ${row.date}; a reconciled EBIT does not establish expense placement`);
    }
    // A cost classification refusal also invalidates an unsupported vendor GP;
    // a separately matching directly filed GP remains usable on its own basis.
    if (out.fieldConflicts?.costOfRevenue?.usable === false && !out.fieldProvenance?.grossProfit && finite(out.grossProfit)) {
      refuse("grossProfit", null, evidenceFor("costOfRevenue"), "Gross profit classification unavailable: refused cost placement and no independently matching filed gross profit");
    }
    if (out.fieldConflicts?.grossProfit?.usable === false) out = { ...out, grossProfitRatio: null, grossProfitMargin: null };
    if (finite(out.operatingExpenses) && !evidenceFor("operatingExpenses")) {
      const component = ["sellingGeneralAndAdministrativeExpenses", "researchAndDevelopmentExpenses"].find(field => finite(sec[field]) && same(out.operatingExpenses as number, sec[field]) && evidenceFor(field));
      if (component) refuse("operatingExpenses", null, evidenceFor(component), "Operating expenses unavailable: a partial expense component does not establish a complete operating-expense total");
    }
    return out;
  });
  return { income: { ...income, value: { ...income.value, data: { ...income.value.data, rows } } }, gaps };
}
