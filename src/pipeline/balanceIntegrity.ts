import { confirmedIssuerFacts } from "@/edgar/issuerFacts";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import type { DataBundle } from "@/pipeline/types";
import type { FmpBalanceSheetRow, FmpStatementRow } from "@/providers/fmp";

const ASSET_BREAKDOWN = ["netReceivables", "inventory", "propertyPlantEquipmentNet", "longTermInvestments"] as const;
const ANCHOR_FIELDS = ["totalAssets", "totalDebt", "totalStockholdersEquity", "cashAndShortTermInvestments"] as const;
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
type StatementKind = "balance" | "income" | "cashflow";
const BREAKDOWNS = {
  balance: { fields: ASSET_BREAKDOWN, label: "balance", headline: ["totalAssets"] },
  income: { fields: ["costOfRevenue", "grossProfit", "operatingIncome"], label: "income statement", headline: ["revenue", "netIncome"] },
  cashflow: { fields: ["operatingCashFlow", "netCashProvidedByInvestingActivities", "netCashProvidedByFinancingActivities"], label: "cash-flow statement", headline: ["netIncome", "netChangeInCash"] },
} as const;

function sameScope(row: FmpStatementRow, previous: FmpStatementRow): boolean {
  return row.reportedCurrency != null && row.reportedCurrency === previous.reportedCurrency &&
    (row.cik == null || previous.cik == null || Number(row.cik) === Number(previous.cik));
}

/** Same missing-breakdown rule; flow families additionally require the rejected balance's release identity. */
function missingBreakdown(row: FmpStatementRow, previous: FmpStatementRow | undefined, kind: StatementKind): string | null {
  if (!previous || !row.date || !previous.date || row.date <= previous.date || !sameScope(row, previous)) return null;
  const rule = BREAKDOWNS[kind];
  if (!rule.fields.every(field => row[field] === 0) || !rule.headline.some(field => finite(row[field]) && row[field] !== 0)) return null;
  const scale = kind === "balance" ? previous.totalAssets : Math.max(...rule.fields.map(field => finite(previous[field]) ? Math.abs(previous[field]) : 0));
  if (!finite(scale) || scale <= 0 || rule.fields.filter(field => finite(previous[field]) &&
    (kind === "balance" ? previous[field] : Math.abs(previous[field])) > 0.01 * scale).length < 2) return null;
  if (kind === "balance") {
    if (!finite(row.totalAssets) || row.totalAssets <= 0 || Math.min(row.totalAssets, scale) < 0.8 * Math.max(row.totalAssets, scale)) return null;
    return `The balance dated ${row.date} reports zero receivables, inventory, property and equipment, and long-term investments, ` +
      `although at least two of these exceeded 1% of assets on ${previous.date} and total assets changed by no more than 20%. ` +
      "This incomplete asset breakdown cannot establish a complete balance.";
  }
  return `The ${rule.label} dated ${row.date} retains headline figures but its entire core breakdown is zero, ` +
    `although at least two components were material on ${previous.date}. It comes from the same preliminary release as an incomplete balance; ` +
    "these missing components cannot be treated as reported zeros.";
}

/** D-207: missing breakdown, not a negative residual or one legitimate zero. */
export function balanceBreakdownFailure(row: FmpBalanceSheetRow, previous: FmpBalanceSheetRow | undefined): string | null {
  return missingBreakdown(row, previous, "balance");
}

/** Keep the instant and audit metadata; no consumer may read the rejected amounts. */
function withoutAmounts<T extends FmpStatementRow>(row: T, reason: string, kind: StatementKind): T {
  return { ...Object.fromEntries(Object.entries(row).filter(([, value]) => typeof value !== "number")),
    statementIntegrityReason: reason, ...(kind === "balance" ? { balanceIntegrityReason: reason } : {}) } as T;
}

/** Assess oldest first; a failed observation never becomes the next comparator. */
function breakdownFailures(rows: readonly FmpStatementRow[], kind: StatementKind, eligible: (row: FmpStatementRow) => boolean = () => true): Map<string, string> {
  const accepted: FmpStatementRow[] = [];
  const failures = new Map<string, string>();
  for (const row of [...rows].sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
    const previous = accepted.find(prior => prior.date && row.date && prior.date < row.date &&
      sameScope(row, prior));
    const reason = eligible(row) ? missingBreakdown(row, previous, kind) : null;
    if (reason && row.date) failures.set(row.date, reason);
    else accepted.unshift(row);
  }
  return failures;
}

/** A replacement is a whole filed instant on one issuer/currency/accession, never a field splice. */
function filedReplacement<T extends FmpStatementRow>(row: T, candidates: readonly T[], kind: StatementKind): T | undefined {
  return candidates.find(candidate => {
    if (candidate.date !== row.date || candidate.reportedCurrency !== row.reportedCurrency ||
      (row.cik != null && Number(candidate.cik) !== Number(row.cik))) return false;
    const fields: readonly string[] = kind === "balance" ? ANCHOR_FIELDS : kind === "income"
      ? ["revenue", "costOfRevenue", "grossProfit", "operatingIncome", "netIncome"]
      : [...BREAKDOWNS.cashflow.fields, "cashAtBeginningOfPeriod", "cashAtEndOfPeriod", "netChangeInCash"];
    const operands = fields.flatMap(field => candidate.fieldProvenance?.[field] ? [field] :
      field === "cashAndShortTermInvestments" ? ["cashAndCashEquivalents", "shortTermInvestments"] :
      field === "totalDebt" ? ["shortTermDebt", "longTermDebt", "capitalLeaseObligations"] : [field]);
    const evidence = operands.map(field => candidate.fieldProvenance?.[field]);
    if ([...fields, ...operands].some(field => !finite(candidate[field]) || candidate.fieldConflicts?.[field]?.usable === false) ||
      evidence.some(proof => !proof || proof.periodEnd !== row.date || (kind === "balance" && proof.periodStart !== null) || proof.unit !== row.reportedCurrency) ||
      (kind !== "balance" && new Set(evidence.map(p => p?.periodStart).filter(start => start != null)).size !== 1)) return false;
    return evidence[0]!.filings.some(filing => evidence.every(proof => proof!.filings.length > 0 && proof!.filings.every(f => f.accn === filing.accn)));
  });
}

function originalRows(input: { rows: FmpStatementRow[]; raw: unknown }): FmpStatementRow[] {
  return Array.isArray(input.raw) ? input.raw.filter(r => r !== null && typeof r === "object" && typeof r.date === "string") : input.rows;
}

function sameRelease(row: FmpStatementRow, balance: FmpStatementRow): boolean {
  if (row.date !== balance.date || !sameScope(row, balance)) return false;
  if (row.acceptedDate && balance.acceptedDate) return row.acceptedDate.replace(" ", "T").replace(/Z$/, "") === balance.acceptedDate.replace(" ", "T").replace(/Z$/, "");
  return !!row.filingDate && row.filingDate === balance.filingDate;
}

/** One immutable admission view for calculations and payload; raw observations remain evidence. */
export function balanceIntegrityView(bundle: DataBundle): DataBundle {
  const families = ["balanceAnnual", "balanceQuarterly", "incomeAnnual", "incomeQuarterly", "cashflowAnnual", "cashflowQuarterly"] as const;
  const failures = new Map<FmpStatementRow, { reason: string; kind: StatementKind }>();
  const rejectedReleases: FmpStatementRow[] = [];
  for (const name of families) {
    const family = bundle.statements[name];
    if (!family.ok || family.value.source === "edgar") continue;
    const rows = family.value.data.rows;
    const raw = originalRows(family.value.data);
    const kind = name.startsWith("balance") ? "balance" : name.startsWith("income") ? "income" : "cashflow";
    const reasons = breakdownFailures(raw, kind, kind === "balance" ? undefined : row => rejectedReleases.some(balance => sameRelease(row, balance)));
    if (kind === "balance") rejectedReleases.push(...raw.filter(row => row.date && reasons.has(row.date)));
    for (const row of rows) {
      const reason = row.date ? reasons.get(row.date) : undefined;
      if (reason) failures.set(row, { reason, kind });
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
      const failure = failures.get(row);
      if (!failure) return row;
      const { reason, kind } = failure;
      const replacement = filedReplacement(row, filed?.[name].rows ?? [], kind);
      gaps.push({ field: `statements.${kind}.${row.date}.integrity`, severity: replacement ? "info" : "warn", reason: reason +
        (replacement ? " A complete same-period filed statement replaces the vendor row." : " No complete same-period filed statement is retained; these amounts are withheld. Any older balance used is dated separately; an older flow cannot replace a missing current period.") });
      return replacement ?? withoutAmounts(row, reason, kind);
    }) } } };
  }
  return { ...bundle, statements, gaps };
}
