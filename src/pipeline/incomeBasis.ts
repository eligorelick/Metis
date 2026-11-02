import type { DataBundle } from "./types";
import type { FmpIncomeStatementRow, StatementFieldProvenance } from "@/providers/fmp";
import { confirmedIssuerFacts } from "@/edgar/issuerFacts";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import { vendorAgreesWithFiled } from "@/edgar/vendorAgreement";
import { sectorIndustryForSic } from "@/edgar/sic";

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
function sameBasis(a: StatementFieldProvenance | undefined, b: StatementFieldProvenance | undefined): boolean {
  return !!a && !!b && a.source === "edgar" && b.source === "edgar" && a.unit === b.unit &&
    a.filings.length > 0 && b.filings.length > 0 && a.periodStart !== null && a.periodStart === b.periodStart && a.periodEnd === b.periodEnd &&
    JSON.stringify(a.filings.map(f => `${f.accn}|${f.filed}`).sort()) === JSON.stringify(b.filings.map(f => `${f.accn}|${f.filed}`).sort());
}

/** Calculation view only, including replay of bundles frozen before admission existed. */
export function withIncomeOperatingBasis(bundle: DataBundle): DataBundle {
  if (!bundle.statements?.incomeAnnual || !bundle.statements.incomeQuarterly) return bundle;
  const facts = confirmedIssuerFacts(bundle.symbol, bundle.edgar);
  const acquired = bundle.edgar?.companyFacts?.ok ? bundle.edgar.companyFacts.value.fetchedAt : null;
  const filed = facts && acquired && Number.isFinite(Date.parse(acquired)) && Date.parse(acquired) <= Date.parse(bundle.builtAt)
    ? buildStatementsFromCompanyFacts(facts, { symbol: bundle.symbol, cik: String(facts.cik), asOf: bundle.builtAt.slice(0, 10), factsObservedAt: acquired,
      annualPeriods: 40, quarterlyPeriods: 80, bankRevenue: sectorIndustryForSic(bundle.edgar.sic ?? null).industry?.toLowerCase().startsWith("banks") === true,
      vendorSplits: { status: "unavailable", source: "operating-basis", reason: "Additive operating amounts only; no per-share inference" } }) : null;
  const gaps = [...(bundle.gaps ?? [])];
  const family = (name: "incomeAnnual" | "incomeQuarterly") => {
    const input = bundle.statements[name];
    if (!input.ok) return input;
    const candidates = name === "incomeAnnual" ? filed?.incomeAnnual.rows : filed?.incomeQuarterly.rows;
    const rows = input.value.data.rows.map(row => {
      let out: FmpIncomeStatementRow = row;
      const sec = candidates?.find(r => r.date === row.date && r.reportedCurrency === row.reportedCurrency &&
        (row.cik == null || Number(row.cik) === facts?.cik));
      const revenue = sec?.fieldProvenance?.revenue, operating = sec?.fieldProvenance?.operatingIncome;
      const matches = sec && finite(row.revenue) && finite(sec.revenue) && vendorAgreesWithFiled(row.revenue, sec.revenue) &&
        row.fieldConflicts?.revenue?.usable !== false && (row.periodStart == null || row.periodStart === revenue?.periodStart) &&
        (row.filingDate == null || revenue?.filings.some(f => f.filed === row.filingDate));
      if (matches && finite(sec.operatingIncome) && operating?.tags.includes("us-gaap/OperatingIncomeLoss") && sameBasis(revenue, operating) &&
        row.fieldConflicts?.operatingIncome?.usable !== false && sec.fieldConflicts?.operatingIncome?.usable !== false) {
        out = { ...row, operatingIncome: sec.operatingIncome, fieldProvenance: { ...row.fieldProvenance, revenue: revenue!, operatingIncome: operating } };
      }
      const revProof = out.fieldProvenance?.revenue, opProof = out.fieldProvenance?.operatingIncome;
      const revSource = revProof?.source ?? out.source ?? input.value.source;
      const opSource = opProof?.source ?? out.source ?? input.value.source;
      const mixed = revSource !== opSource || (revProof !== undefined || opProof !== undefined) && !sameBasis(revProof, opProof);
      if (finite(out.operatingIncome) && mixed) {
        const reason = `Operating income and operating margin for ${row.date} withheld: a common revenue/operating-income source, period and filed basis is not established.`;
        out = { ...out, operatingIncome: undefined, operatingIncomeRatio: undefined,
          fieldConflicts: { ...out.fieldConflicts, operatingIncome: { usable: false, vendorValue: row.operatingIncome ?? null, secValue: null, reason } } };
        gaps.push({ field: `statements.income.${row.date}.operatingIncome`, severity: "info", reason });
      }
      const expense = out.fieldProvenance?.operatingExpenses;
      if (finite(out.operatingExpenses) && !(expense?.tags.includes("us-gaap/OperatingExpenses") && sameBasis(out.fieldProvenance?.revenue, expense))) {
        const reason = `Operating expenses for ${row.date} withheld: a complete operating-expense total on the revenue's filed basis is not established; vendor expense subsets and revenue minus operating income do not establish this subtotal.`;
        out = { ...out, operatingExpenses: undefined, fieldConflicts: { ...out.fieldConflicts,
          operatingExpenses: { usable: false, vendorValue: row.operatingExpenses ?? null, secValue: null, reason } } };
        gaps.push({ field: `statements.income.${row.date}.operatingExpenses`, severity: "info", reason });
      }
      return out;
    });
    return { ...input, value: { ...input.value, data: { ...input.value.data, rows } } };
  };
  return { ...bundle, statements: { ...bundle.statements, incomeAnnual: family("incomeAnnual"), incomeQuarterly: family("incomeQuarterly") }, gaps };
}
