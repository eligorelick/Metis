import { confirmedIssuerFacts } from "@/edgar/issuerFacts";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import type { DataBundle } from "@/pipeline/types";
import type { FmpBalanceSheetRow } from "@/providers/fmp";

const ASSET_BREAKDOWN = ["netReceivables", "inventory", "propertyPlantEquipmentNet", "longTermInvestments"] as const;
const ANCHOR_FIELDS = ["totalAssets", "totalDebt", "totalStockholdersEquity", "cashAndShortTermInvestments"] as const;
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** D-207: missing breakdown, not a negative residual or one legitimate zero. */
export function balanceBreakdownFailure(row: FmpBalanceSheetRow, previous: FmpBalanceSheetRow | undefined): string | null {
  if (!previous || !finite(row.totalAssets) || !finite(previous.totalAssets) || row.totalAssets <= 0 || previous.totalAssets <= 0 ||
    !row.date || !previous.date || row.date <= previous.date ||
    row.reportedCurrency == null || row.reportedCurrency !== previous.reportedCurrency ||
    (row.cik != null && previous.cik != null && Number(row.cik) !== Number(previous.cik))) return null;
  if (!ASSET_BREAKDOWN.every(field => row[field] === 0)) return null;
  const material = ASSET_BREAKDOWN.filter(field => finite(previous[field]) && previous[field]! > 0.01 * previous.totalAssets!);
  // At least two substantial asset classes disappear, while at least 80% of
  // the total remains. Isolated zeros and genuine large disposals do not qualify.
  if (material.length < 2 || Math.min(row.totalAssets, previous.totalAssets) < 0.8 * Math.max(row.totalAssets, previous.totalAssets)) return null;
  return `The balance dated ${row.date} reports zero receivables, inventory, property and equipment, and long-term investments, ` +
    `although at least two of these exceeded 1% of assets on ${previous.date} and total assets changed by no more than 20%. ` +
    "This incomplete asset breakdown cannot establish a complete balance.";
}

/** Keep the instant and audit metadata; no consumer may read the rejected amounts. */
function withoutAmounts(row: FmpBalanceSheetRow, reason: string): FmpBalanceSheetRow {
  return { ...Object.fromEntries(Object.entries(row).filter(([, value]) => typeof value !== "number")), balanceIntegrityReason: reason };
}

/** A replacement is a whole filed instant on one issuer/currency/accession, never a field splice. */
function filedReplacement(row: FmpBalanceSheetRow, candidates: readonly FmpBalanceSheetRow[]): FmpBalanceSheetRow | undefined {
  return candidates.find(candidate => {
    if (candidate.date !== row.date || candidate.reportedCurrency !== row.reportedCurrency ||
      (row.cik != null && Number(candidate.cik) !== Number(row.cik))) return false;
    const operands = ANCHOR_FIELDS.flatMap(field => candidate.fieldProvenance?.[field] ? [field] :
      field === "cashAndShortTermInvestments" ? ["cashAndCashEquivalents", "shortTermInvestments"] :
      field === "totalDebt" ? ["shortTermDebt", "longTermDebt", "capitalLeaseObligations"] : [field]);
    const evidence = operands.map(field => candidate.fieldProvenance?.[field]);
    if ([...ANCHOR_FIELDS, ...operands].some(field => !finite(candidate[field]) || candidate.fieldConflicts?.[field]?.usable === false) ||
      evidence.some(proof => !proof || proof.periodEnd !== row.date || proof.periodStart !== null || proof.unit !== row.reportedCurrency)) return false;
    return evidence[0]!.filings.some(filing => evidence.every(proof => proof!.filings.length > 0 && proof!.filings.every(f => f.accn === filing.accn)));
  });
}

/** One immutable calculation view, before enrichment/ratios; raw observations remain evidence. */
export function balanceIntegrityView(bundle: DataBundle): DataBundle {
  const families = ["balanceAnnual", "balanceQuarterly"] as const;
  const failures = new Map<FmpBalanceSheetRow, string>();
  for (const name of families) {
    const family = bundle.statements[name];
    if (!family.ok || family.value.source === "edgar") continue;
    const rows = family.value.data.rows;
    const raw: FmpBalanceSheetRow[] = Array.isArray(family.value.data.raw)
      ? family.value.data.raw.filter(r => r !== null && typeof r === "object" && typeof r.date === "string") : rows;
    for (const row of rows) {
      const original = raw.find(r => r.date === row.date) ?? row;
      const previous = raw.filter(r => r.date && row.date && r.date < row.date).sort((a, b) => b.date!.localeCompare(a.date!))[0];
      const reason = balanceBreakdownFailure(original, previous);
      if (reason) failures.set(row, reason);
    }
  }
  if (!failures.size) return bundle;
  const acquired = bundle.edgar?.companyFacts;
  const facts = acquired?.ok && finite(Date.parse(acquired.value.fetchedAt)) && Date.parse(acquired.value.fetchedAt) <= Date.parse(bundle.builtAt)
    ? confirmedIssuerFacts(bundle.symbol, bundle.edgar) : null;
  const filed = facts ? buildStatementsFromCompanyFacts(facts, {
    symbol: bundle.symbol, cik: String(facts.cik), asOf: bundle.builtAt.slice(0, 10), factsObservedAt: acquired!.ok ? acquired!.value.fetchedAt : undefined,
    annualPeriods: 12, quarterlyPeriods: 30,
    vendorSplits: { status: "unavailable", source: "balance-integrity", reason: "only balance instants are used" },
  }) : null;
  const gaps = [...bundle.gaps];
  const statements = { ...bundle.statements };
  for (const name of families) {
    const family = statements[name];
    if (!family.ok) continue;
    statements[name] = { ...family, value: { ...family.value, data: { ...family.value.data, rows: family.value.data.rows.map(row => {
      const reason = failures.get(row);
      if (!reason) return row;
      const replacement = filedReplacement(row, filed?.[name].rows ?? []);
      gaps.push({ field: `statements.balance.${row.date}.integrity`, severity: replacement ? "info" : "warn", reason: reason +
        (replacement ? " A complete same-period filed balance replaces the vendor row." : " No complete same-period filed balance is retained; these amounts are withheld. Any older complete balance used is dated separately.") });
      return replacement ?? withoutAmounts(row, reason);
    }) } } };
  }
  return { ...bundle, statements, gaps };
}
