import { PRETAX_EXCLUDING_EQUITY_METHOD_TAG, tagsFor } from "@/edgar/tagSynonyms";
import type { CompanyFacts } from "@/edgar/xbrl";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import { vendorAgreesWithFiled } from "@/edgar/vendorAgreement";
import type { FmpIncomeStatementRow, FmpPayload, StatementFieldProvenance } from "@/providers/fmp";
import type { FetchResult, ManifestEntry } from "@/types/core";

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const same = vendorAgreesWithFiled;

/** An unreconciled ASC-606 amount need not cover the face revenue line. It
 * can omit derivative or lease transactions and can be rounded in a note.
 * Keep the refusal, but never call this evidence a proved consolidated total. */
export function contractRevenueScopeRefusal(proof: StatementFieldProvenance | null | undefined, vendor: number, filed: number): string | null {
  if (!proof || proof.tags.length !== 1 || !/^us-gaap\/RevenueFromContractWithCustomer(?:Including|Excluding)AssessedTax$/.test(proof.tags[0]!)) return null;
  return `Revenue scope unresolved: vendor revenue ${vendor} ${proof.unit} differs from contract-revenue fact ${filed} for ${proof.periodStart} through ${proof.periodEnd} (${proof.filings.map(f => `${f.form} ${f.accn}`).join(" + ")}). ` +
    "The contract-revenue amount is not established as consolidated operating revenue; derivative or lease transactions may be outside it, and a note may be rounded. A reconciled full income statement for the same registrant is required; a subsidiary registrant cannot substitute. Revenue and dependent margins remain withheld; source observations retained.";
}

/** Reuse canonical filed statement resolution; never infer expense placement from EBIT. */
export function enrichIncomeClassification(income: FetchResult<FmpPayload<FmpIncomeStatementRow>>, facts: CompanyFacts, scope: "annual" | "quarter", observedAt: string,
  opts: { bankRevenue?: boolean; securitiesRevenue?: boolean; earningsOnly?: boolean; filedRows?: FmpIncomeStatementRow[] } = {}): { income: typeof income; gaps: ManifestEntry[] } {
  if (!income.ok || income.value.data.rows.length === 0) return { income, gaps: [] };
  const built = opts.filedRows ? null : buildStatementsFromCompanyFacts(facts, { symbol: "", cik: String(facts.cik), asOf: observedAt.slice(0, 10), factsObservedAt: observedAt,
    bankRevenue: opts.bankRevenue || opts.securitiesRevenue, annualPeriods: Math.max(12, income.value.data.rows.length + 2), quarterlyPeriods: Math.max(12, income.value.data.rows.length + 4),
    vendorSplits: { status: "unavailable", source: "income-classification", reason: "Income classification does not resolve per-share values" } });
  const filed = opts.filedRows ?? (scope === "annual" ? built!.incomeAnnual.rows : built!.incomeQuarterly.rows);
  const gaps: ManifestEntry[] = [];
  const allowed: Record<string, string[]> = {
    revenue: ["us-gaap/Revenues", "us-gaap/RevenueFromContractWithCustomerExcludingAssessedTax", "us-gaap/SalesRevenueNet", "us-gaap/RevenueFromContractWithCustomerIncludingAssessedTax"],
    costOfRevenue: ["us-gaap/CostOfRevenue", "us-gaap/CostOfGoodsAndServicesSold"],
    grossProfit: ["us-gaap/GrossProfit"], operatingExpenses: ["us-gaap/OperatingExpenses"],
  };
  const industrialRevenue = [...allowed.revenue!];
  if (opts.bankRevenue === true) allowed.revenue!.push(...[...tagsFor("bankRevenueTotal"), ...tagsFor("bankRevenueComponents")].map(tag => `us-gaap/${tag}`));
  const rows = income.value.data.rows.map(row => {
    if (!row.date || !/^[A-Z]{3}$/.test(row.reportedCurrency ?? "") || (row.cik != null && row.cik.replace(/^0+/, "") !== String(facts.cik).replace(/^0+/, ""))) return row;
    const sec = filed.find(candidate => candidate.date === row.date);
    if (!sec) return row;
    const evidenceFor = (field: string): StatementFieldProvenance | null => {
      const proof = sec.fieldProvenance?.[field];
      if (field === "grossProfit" && proof === undefined) {
        const revenue = evidenceFor("revenue"), cost = evidenceFor("costOfRevenue");
        if (revenue && cost && revenue.tags.some(tag => industrialRevenue.includes(tag)) && cost.tags.some(tag => allowed.costOfRevenue!.includes(tag)) &&
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
    // A self-consistent provider loss is still contradicted when the exact
    // filed interval reports a profit. Refuse the family together so aliases
    // cannot restore it and a partial transplant cannot break its arithmetic.
    const earnings = ["incomeBeforeTax", "incomeTaxExpense", "netIncome"] as const;
    const sameScope = (a: StatementFieldProvenance, b: StatementFieldProvenance) =>
      a.unit === b.unit && a.periodStart === b.periodStart && a.periodEnd === b.periodEnd &&
      JSON.stringify(a.filings) === JSON.stringify(b.filings);
    const conflict = earnings.find(field => {
      const proof = evidenceFor(field);
      const vendor = row[field];
      if (!proof || !finite(vendor) || !finite(sec[field]) || same(vendor, sec[field])) return false;
      if (field === "incomeBeforeTax" && proof.tags.includes(`us-gaap/${PRETAX_EXCLUDING_EQUITY_METHOD_TAG}`)) {
        const equity = evidenceFor("equityMethodIncomeLoss");
        if (equity && sameScope(proof, equity) && finite(sec.equityMethodIncomeLoss) &&
            same(vendor, sec.incomeBeforeTax! + sec.equityMethodIncomeLoss)) return false;
      }
      if (field !== "netIncome") return true;
      // Parent, consolidated and common income are distinct valid scopes.
      // Only independently filed, same-interval alternatives can bridge them.
      return !["netIncomeConsolidated", "netIncomeAvailableToCommon"].some(alternative => {
        const other = evidenceFor(alternative);
        return other && sameScope(proof, other) && finite(sec[alternative]) && same(vendor, sec[alternative]);
      });
    });
    if (conflict) {
      const proof = evidenceFor(conflict)!;
      const reason = `Filed earnings conflict for ${conflict}: vendor ${row[conflict]}, filed ${sec[conflict]} ${proof.unit}, ${proof.periodStart} through ${row.date}; pretax, tax and net-income family withheld together, including ownership/continuing aliases and dependent margins; vendor observations retained`;
      for (const field of [...earnings, "bottomLineNetIncome", "netIncomeConsolidated", "netIncomeAvailableToCommon",
        "netIncomeFromContinuingOperations", "netIncomeFromDiscontinuedOperations"]) {
        refuse(field, finite(sec[field]) ? sec[field] : null, evidenceFor(field) ?? proof, reason);
      }
      out = { ...out, netIncomeRatio: null, netProfitMargin: null, incomeBeforeTaxRatio: null, effectiveTaxRate: null };
    }
    const netRevenue = evidenceFor("revenue");
    if (opts.securitiesRevenue && netRevenue?.tags.includes("us-gaap/RevenuesNetOfInterestExpense") &&
        finite(sec.revenue) && finite(row.revenue) && !same(row.revenue, sec.revenue) && row.fieldConflicts?.revenue?.usable !== false) {
      const reason = `Securities-firm revenue reconciled from vendor ${row.revenue} gross of interest expense to directly filed net revenue ${sec.revenue} ${netRevenue.unit}, ${netRevenue.periodStart} through ${row.date}; incompatible gross-revenue costs, profit subtotals and margins withheld`;
      out = { ...out, revenue: sec.revenue, fieldProvenance: { ...out.fieldProvenance, revenue: netRevenue } };
      for (const field of ["costOfRevenue", "grossProfit", "operatingIncome", "operatingExpenses"]) {
        if (finite(row[field])) refuse(field, null, netRevenue, reason);
      }
      out = { ...out, grossProfitRatio: null, grossProfitMargin: null, operatingIncomeRatio: null, netIncomeRatio: null };
      gaps.push({ field: `statements.income.${row.date}.revenue`, reason, severity: "info", expected: true, attemptedSources: ["edgar:companyfacts/us-gaap/RevenuesNetOfInterestExpense", "fmp:income-statement"] });
    }
    if (opts.earningsOnly) return out;
    const canonicalCostEvidence = evidenceFor("costOfRevenue");
    // A canonical unknown cannot establish a refusal outside this row's source scope.
    if (sec.fieldConflicts?.grossProfit?.usable === false && canonicalCostEvidence && evidenceFor("revenue")) {
      refuse("grossProfit", null, canonicalCostEvidence, sec.fieldConflicts.grossProfit.reason);
    }
    for (const [field, tags] of Object.entries(allowed)) {
      if (field === "revenue" && out !== row && out.fieldProvenance?.revenue === netRevenue && out.revenue === sec.revenue && opts.securitiesRevenue) continue;
      if (row.fieldConflicts?.[field]?.usable === false) { out = { ...out, [field]: null }; continue; }
      const proof = evidenceFor(field);
      if (!proof || (!proof.tags.some(tag => tags.includes(tag)) && !(field === "grossProfit" && proof.calculation === "revenue-minus-cost")) || !finite(sec[field]) || !finite(row[field])) continue;
      if (same(row[field], sec[field])) out = { ...out, fieldProvenance: { ...out.fieldProvenance, [field]: proof } };
      else refuse(field, sec[field], proof, (field === "revenue" ? contractRevenueScopeRefusal(proof, row[field], sec[field]) : null) ??
        `Income classification conflict for ${field}: vendor ${row[field]}, filed ${sec[field]} ${proof.unit}, ${proof.periodStart} through ${row.date}; a reconciled EBIT does not establish expense placement`);
    }
    const unsupportedOperand = (["revenue", "costOfRevenue"] as const).map(field => ({ field, proof: evidenceFor(field) }))
      .find(({ field, proof }) => proof && !proof.tags.some(tag => (field === "revenue" ? industrialRevenue : allowed[field]!).includes(tag)));
    if (finite(out.grossProfit) && !out.fieldProvenance?.grossProfit && unsupportedOperand) {
      refuse("grossProfit", null, unsupportedOperand.proof, `Gross-profit classification unavailable: filed ${unsupportedOperand.field} definition is not independently compatible with industrial gross-profit arithmetic; no comparable filed subtotal established`);
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
