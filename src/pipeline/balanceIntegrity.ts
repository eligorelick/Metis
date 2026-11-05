import type { DataBundle } from "@/pipeline/types";
import type { FmpBalanceSheetRow, FmpStatementRow } from "@/providers/fmp";

const ASSET_BREAKDOWN = ["netReceivables", "inventory", "propertyPlantEquipmentNet", "longTermInvestments"] as const;
const CLASSIFIED_ASSETS = ["otherCurrentAssets", "otherNonCurrentAssets", "taxAssets", "prepaids"] as const;
const FLOW_BREAKDOWNS = {
  income: ["costOfRevenue", "grossProfit", "operatingIncome"],
  cashflow: ["operatingCashFlow", "netCashProvidedByInvestingActivities", "netCashProvidedByFinancingActivities"],
} as const;
const SALE_ASSETS = ["assetsHeldForSale", "assetsHeldForSaleCurrent", "assetsHeldForSaleNonCurrent"] as const;
type StatementKind = "balance" | keyof typeof FLOW_BREAKDOWNS;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const positive = (value: unknown): number => finite(value) ? Math.max(0, value) : 0;
const absolute = (value: unknown): number => finite(value) ? Math.abs(value) : 0;
const assetBreakdown = (row: FmpStatementRow): number => ASSET_BREAKDOWN.reduce((sum, field) => sum + positive(row[field]), 0);

function sameScope(row: FmpStatementRow, previous: FmpStatementRow): boolean {
  return row.reportedCurrency != null && row.reportedCurrency === previous.reportedCurrency &&
    (row.cik == null || previous.cik == null || Number(row.cik) === Number(previous.cik));
}

function comparable(row: FmpStatementRow, previous: FmpStatementRow | undefined): previous is FmpStatementRow {
  return !!previous && !!row.date && !!previous.date && row.date > previous.date && sameScope(row, previous);
}

function liquidAssets(row: FmpStatementRow): number {
  return finite(row.cashAndShortTermInvestments) ? positive(row.cashAndShortTermInvestments)
    : positive(row.cashAndCashEquivalents) + positive(row.shortTermInvestments);
}

function saleAssets(row: FmpStatementRow): number {
  return Math.max(positive(row.assetsHeldForSale), positive(row.assetsHeldForSaleCurrent) + positive(row.assetsHeldForSaleNonCurrent));
}

/** Classified residuals can explain a presentation change; unclassified otherAssets cannot. */
function classifiedAssets(row: FmpStatementRow): number {
  const intangibles = finite(row.goodwillAndIntangibleAssets) ? positive(row.goodwillAndIntangibleAssets)
    : positive(row.goodwill) + positive(row.intangibleAssets);
  return assetBreakdown(row) + liquidAssets(row) + intangibles + CLASSIFIED_ASSETS.reduce((sum, field) => sum + positive(row[field]), 0);
}

function collapsedAssets(row: FmpStatementRow, previous: FmpStatementRow): number | null {
  if (!finite(row.totalAssets) || !finite(previous.totalAssets) || previous.totalAssets <= 0 || row.totalAssets <= 0) return null;
  const before = assetBreakdown(previous), after = assetBreakdown(row);
  // A growing balance can also be a skeleton; a genuine large shrink is outside this check.
  if (row.totalAssets < 0.8 * previous.totalAssets || before <= 0.05 * previous.totalAssets || after >= 0.2 * before) return null;
  return before - after;
}

function explainedMovement(row: FmpStatementRow, previous: FmpStatementRow, lost: number): boolean {
  const proceeds = Math.max(0, liquidAssets(row) - liquidAssets(previous));
  const heldForSale = Math.max(0, saleAssets(row) - saleAssets(previous));
  return proceeds + heldForSale >= 0.8 * lost;
}

/** Corroborate the collapse with a material residual or an unexplained asset gap. */
export function balanceBreakdownFailure(row: FmpBalanceSheetRow, previous: FmpBalanceSheetRow | undefined): string | null {
  if (!comparable(row, previous)) return null;
  const lost = collapsedAssets(row, previous);
  if (lost === null || explainedMovement(row, previous, lost)) return null;
  const tolerance = 0.01 * Number(row.totalAssets);
  const unclassifiedGrowth = positive(row.otherAssets) - positive(previous.otherAssets);
  const unexplained = Number(row.totalAssets) - classifiedAssets(row);
  if (unclassifiedGrowth <= tolerance && unexplained <= tolerance) return null;
  return `The major asset breakdown at ${row.date} has collapsed since ${previous.date} while total assets remain. ` +
    "The remaining lines leave a material amount unclassified or unexplained, without corresponding cash, short-term investments or held-for-sale assets. This looks like an incomplete vendor balance.";
}

function flowBreakdownFailure(row: FmpStatementRow, previous: FmpStatementRow | undefined, kind: keyof typeof FLOW_BREAKDOWNS): string | null {
  if (!comparable(row, previous)) return null;
  const fields = FLOW_BREAKDOWNS[kind];
  const priorWasPopulated = fields.every(field => finite(previous[field]));
  const scale = Math.max(absolute(previous.netIncome), absolute(previous.revenue), ...fields.map(field => absolute(previous[field])));
  const priorWasMaterial = scale > 0 && fields.some(field => absolute(previous[field]) > 0.01 * scale);
  if (!priorWasPopulated || !priorWasMaterial || fields.some(field => absolute(row[field]) > 0)) return null;
  const label = kind === "income" ? "income" : "cash-flow";
  return `The ${label} row at ${row.date} has no core breakdown after material figures at ${previous.date}. ` +
    "It looks incomplete; empty components cannot establish reported zeros.";
}

/** Failed observations never become the comparator, including consecutive skeletons. */
function breakdownFailures(rows: readonly FmpStatementRow[], kind: StatementKind): Map<FmpStatementRow, string> {
  const accepted: FmpStatementRow[] = [], failures = new Map<FmpStatementRow, string>();
  for (const row of [...rows].sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
    const previous = accepted.find(prior => comparable(row, prior));
    const reason = kind === "balance" ? balanceBreakdownFailure(row, previous) : flowBreakdownFailure(row, previous, kind);
    if (reason) failures.set(row, reason);
    else accepted.unshift(row);
  }
  return failures;
}

function originalRows(input: { rows: FmpStatementRow[]; raw: unknown }): FmpStatementRow[] {
  return Array.isArray(input.raw) ? input.raw.filter(row => row !== null && typeof row === "object" && typeof row.date === "string") : input.rows;
}

/** Match the observation, not just its date. A complete same-date sibling survives. */
function originalObservation(row: FmpStatementRow, originals: readonly FmpStatementRow[], kind: StatementKind): FmpStatementRow | undefined {
  const candidates = originals.filter(original => original.date === row.date && sameScope(row, original));
  const matchingTime = candidates.filter(original => original.acceptedDate === row.acceptedDate);
  const observations = matchingTime.length ? matchingTime : candidates;
  const fields = kind === "balance"
    ? [...ASSET_BREAKDOWN, ...CLASSIFIED_ASSETS, ...SALE_ASSETS, "totalAssets", "otherAssets", "cashAndShortTermInvestments", "cashAndCashEquivalents", "shortTermInvestments", "goodwillAndIntangibleAssets", "goodwill", "intangibleAssets"]
    : [...FLOW_BREAKDOWNS[kind], "revenue", "netIncome", "netChangeInCash"];
  return observations.find(original => original === row) ?? observations.find(original => fields.every(field =>
    (finite(original[field]) ? original[field] : 0) === (finite(row[field]) ? row[field] : 0))) ?? (candidates.length === 1 ? candidates[0] : undefined);
}

/** One immutable admission view for calculations, reports and charts; raw evidence is retained. */
export function balanceIntegrityView(bundle: DataBundle): DataBundle {
  if (!bundle.statements) return bundle;
  const families = ["balanceAnnual", "balanceQuarterly", "incomeAnnual", "incomeQuarterly", "cashflowAnnual", "cashflowQuarterly"] as const;
  const statements = { ...bundle.statements }, gaps = [...(bundle.gaps ?? [])];
  const rejectedBalanceDates = new Set<string>();
  let changed = false;
  for (const name of families) {
    const family = statements[name];
    if (!family?.ok || family.value.source === "edgar") continue;
    const originals = originalRows(family.value.data);
    const kind = name.startsWith("balance") ? "balance" : name.startsWith("income") ? "income" : "cashflow";
    const failures = breakdownFailures(originals, kind);
    const removed: Array<{ period: string; reason: string }> = [];
    const rows = family.value.data.rows.filter(row => {
      const original = originalObservation(row, originals, kind);
      const reason = original ? failures.get(original) : undefined;
      if (!reason || !row.date) return true;
      removed.push({ period: row.date, reason });
      gaps.push({ field: `statements.${kind}.${row.date}.integrity`, severity: "warn", reason: `${reason} This observation is excluded; its original data remains stored as evidence.` });
      return false;
    });
    if (!removed.length) continue;
    const rejectedPeriods = [...new Map(removed.filter(rejected => !rows.some(row => row.date === rejected.period))
      .map(rejected => [rejected.period, rejected])).values()];
    if (kind === "balance") for (const rejected of rejectedPeriods) rejectedBalanceDates.add(rejected.period);
    statements[name] = { ...family, value: { ...family.value,
      asOf: rows.map(row => row.date ?? "").sort().at(-1) ?? "",
      data: { ...family.value.data, rows, rejectedPeriods: [...(family.value.data.rejectedPeriods ?? []), ...rejectedPeriods] } } };
    changed = true;
  }
  if (!changed) return bundle;
  // A provider EV built on an excluded balance is not an admitted historical observation.
  const enterpriseValues = bundle.enterpriseValues;
  const evRows = enterpriseValues?.ok ? enterpriseValues.value.data.rows.filter(row => !rejectedBalanceDates.has(String(row.date))) : [];
  const admittedEv = enterpriseValues?.ok && evRows.length !== enterpriseValues.value.data.rows.length
    ? { ...enterpriseValues, value: { ...enterpriseValues.value, asOf: evRows.map(row => String(row.date ?? "")).sort().at(-1) ?? "",
      data: { ...enterpriseValues.value.data, rows: evRows } } } : enterpriseValues;
  return { ...bundle, statements, gaps, ...(admittedEv ? { enterpriseValues: admittedEv } : {}) };
}
