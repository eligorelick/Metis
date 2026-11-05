import type { DataBundle } from "@/pipeline/types";
import { coerceVendorNumber, type FmpBalanceSheetRow, type FmpStatementRow } from "@/providers/fmp";
import { confirmedIssuerFacts } from "@/edgar/issuerFacts";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import { vendorAgreesWithFiled } from "@/edgar/vendorAgreement";
import { unavailableSplitEvidence } from "@/providers/splitEvents";

const ASSET_BREAKDOWN = ["netReceivables", "inventory", "propertyPlantEquipmentNet", "longTermInvestments"] as const;
const CLASSIFIED_ASSETS = ["otherCurrentAssets", "otherNonCurrentAssets", "taxAssets", "prepaids"] as const;
const FLOW_BREAKDOWNS = {
  income: ["costOfRevenue", "grossProfit", "operatingIncome"],
  cashflow: ["operatingCashFlow", "netCashProvidedByInvestingActivities", "netCashProvidedByFinancingActivities"],
} as const;
const LIQUID_ASSETS = ["cashAndCashEquivalents", "shortTermInvestments", "cashAndShortTermInvestments", "restrictedCashAndCashEquivalents"] as const;
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

function hasCurrentAssetOffset(row: FmpStatementRow): boolean {
  return ["cashAndCashEquivalents", "shortTermInvestments", "netReceivables", "inventory", "otherCurrentAssets"]
    .some(field => finite(row[field]) && row[field] < 0);
}

/** Classified residuals can explain a presentation change; unclassified otherAssets cannot. */
function classifiedAssets(row: FmpStatementRow): number {
  const intangibles = finite(row.goodwillAndIntangibleAssets) ? positive(row.goodwillAndIntangibleAssets)
    : positive(row.goodwill) + positive(row.intangibleAssets);
  return assetBreakdown(row) + liquidAssets(row) + intangibles + CLASSIFIED_ASSETS.reduce((sum, field) => sum + positive(row[field]), 0);
}

function collapsedAssets(row: FmpStatementRow, previous: FmpStatementRow): number | null {
  if (!finite(row.totalAssets) || !finite(previous.totalAssets) || previous.totalAssets <= 0 || row.totalAssets <= 0) return null;
  const priorAssets = previous.totalAssets;
  const material = ASSET_BREAKDOWN.filter(field => positive(previous[field]) > 0.01 * priorAssets);
  const collapsed = material.filter(field => positive(row[field]) < 0.2 * positive(previous[field]));
  if (collapsed.length < 2 && collapsed.length !== material.length) return null;
  const lost = collapsed.reduce((sum, field) => sum + positive(previous[field]) - positive(row[field]), 0);
  // A growing balance can also be a skeleton; a genuine large shrink is outside this check.
  if (row.totalAssets < 0.8 * previous.totalAssets || lost <= 0.05 * previous.totalAssets) return null;
  return lost;
}

function explainedMovement(row: FmpStatementRow, previous: FmpStatementRow, lost: number): boolean {
  const proceeds = Math.max(0, liquidAssets(row) - liquidAssets(previous));
  return !hasCurrentAssetOffset(row) && proceeds >= 0.8 * lost;
}

/** Corroborate the collapse with a material residual or an unexplained asset gap. */
export function balanceBreakdownFailure(row: FmpBalanceSheetRow, previous: FmpBalanceSheetRow | undefined): string | null {
  if (!comparable(row, previous)) return null;
  const lost = collapsedAssets(row, previous);
  if (lost === null || explainedMovement(row, previous, lost)) return null;
  const tolerance = 0.01 * Number(row.totalAssets);
  const residualFields = hasCurrentAssetOffset(row) ? ["otherAssets", "otherCurrentAssets", "otherNonCurrentAssets"] : ["otherAssets"];
  const residualGrowth = residualFields.reduce((sum, field) =>
    sum + Math.max(0, positive(row[field]) - positive(previous[field])), 0);
  const unexplained = Number(row.totalAssets) - classifiedAssets(row);
  const wholeBreakdownCollapsed = assetBreakdown(row) < 0.2 * assetBreakdown(previous);
  if (residualGrowth < 0.8 * lost && (!wholeBreakdownCollapsed || unexplained <= tolerance) && !hasCurrentAssetOffset(row)) return null;
  return `Major named asset lines at ${row.date} have collapsed since ${previous.date} while total assets remain. ` +
    "Residual categories absorb the loss, assets remain unexplained, or a negative current-asset line offsets positive assets. This looks like incomplete vendor asset detail.";
}

function flowBreakdownFailure(row: FmpStatementRow, previous: FmpStatementRow | undefined, kind: keyof typeof FLOW_BREAKDOWNS): string | null {
  if (!comparable(row, previous)) return null;
  const fields = FLOW_BREAKDOWNS[kind];
  const priorWasPopulated = fields.every(field => finite(previous[field]));
  const scale = Math.max(absolute(previous.netIncome), absolute(previous.revenue), ...fields.map(field => absolute(previous[field])));
  const priorWasMaterial = scale > 0 && fields.some(field => absolute(previous[field]) > 0.01 * scale);
  if (!priorWasPopulated || !priorWasMaterial || fields.some(field => absolute(row[field]) > 0.01 * scale)) return null;
  const label = kind === "income" ? "income" : "cash-flow";
  return `The ${label} row at ${row.date} has no material core breakdown after material figures at ${previous.date}. ` +
    "It looks incomplete; empty components cannot establish reported zeros.";
}

/** Failed observations never become the comparator, including consecutive skeletons. */
type Corroborates = (row: FmpStatementRow, previous: FmpStatementRow | undefined) => boolean;
function breakdownFailures(rows: readonly FmpStatementRow[], kind: StatementKind, corroborates?: Corroborates): Map<FmpStatementRow, string> {
  const accepted: FmpStatementRow[] = [], failures = new Map<FmpStatementRow, string>();
  for (const row of [...rows].sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
    const previous = accepted.find(prior => comparable(row, prior));
    const reason = row.source === "edgar" ? null : kind === "balance" ? balanceBreakdownFailure(row, previous) : flowBreakdownFailure(row, previous, kind);
    if (reason && !corroborates?.(row, previous)) failures.set(row, reason);
    else accepted.unshift(row);
  }
  return failures;
}

/** The raw response keeps vendor strings. Read a copy under the rule the admitted rows passed. */
function originalRows(input: { rows: FmpStatementRow[]; raw: unknown }): FmpStatementRow[] {
  if (!Array.isArray(input.raw)) return input.rows;
  return input.raw.filter(row => row !== null && typeof row === "object" && typeof row.date === "string")
    .map(row => Object.fromEntries(Object.entries(row).map(([field, value]) => [field, coerceVendorNumber(value)])) as FmpStatementRow);
}

/** Match the observation, not just its date. A complete same-date sibling survives. */
function originalObservation(row: FmpStatementRow, originals: readonly FmpStatementRow[], kind: StatementKind): FmpStatementRow | undefined {
  const candidates = originals.filter(original => original.date === row.date && sameScope(row, original));
  const matchingTime = candidates.filter(original => original.acceptedDate === row.acceptedDate);
  const observations = matchingTime.length ? matchingTime : candidates;
  const fields = kind === "balance"
    ? [...ASSET_BREAKDOWN, ...CLASSIFIED_ASSETS, "totalAssets", "otherAssets", ...LIQUID_ASSETS, "goodwillAndIntangibleAssets", "goodwill", "intangibleAssets"]
    : [...FLOW_BREAKDOWNS[kind], "revenue", "netIncome", "netChangeInCash"];
  return observations.find(original => original === row) ?? observations.find(original => fields.every(field =>
    (finite(original[field]) ? original[field] : 0) === (finite(row[field]) ? row[field] : 0))) ?? (candidates.length === 1 ? candidates[0] : undefined);
}

/** Shared subject/peer admission. Peers without filing evidence get no corroboration override. */
export function statementIntegrityRows<T extends FmpStatementRow>(data: { rows: T[]; raw: unknown }, kind: StatementKind, corroborates?: Corroborates): {
  rows: T[]; rejected: Array<{ period: string; reason: string }>;
} {
  const originals = originalRows(data), failures = breakdownFailures(originals, kind, corroborates);
  const rejected: Array<{ period: string; reason: string }> = [];
  const rows = data.rows.filter(row => {
    if (row.source === "edgar") return true;
    const original = originalObservation(row, originals, kind);
    const reason = original ? failures.get(original) : undefined;
    if (!reason || !row.date) return true;
    rejected.push({ period: row.date, reason });
    return false;
  });
  return { rows, rejected };
}

/** Prove the existing row, never reconstruct it. Build filed evidence only for a collapse candidate. */
function filedCorroboration(bundle: DataBundle): Corroborates {
  let balances: FmpBalanceSheetRow[] | undefined;
  return (row, previous) => {
    if (!previous || hasCurrentAssetOffset(row)) return false;
    const facts = confirmedIssuerFacts(bundle.symbol, bundle.edgar), source = bundle.edgar?.companyFacts;
    if (!facts || !source?.ok || !finite(Date.parse(source.value.fetchedAt)) || Date.parse(source.value.fetchedAt) > Date.parse(bundle.builtAt) ||
      (row.cik != null && Number(row.cik) !== Number(facts.cik))) return false;
    balances ??= (() => {
      const filed = buildStatementsFromCompanyFacts(facts, { symbol: bundle.symbol, cik: String(facts.cik), asOf: bundle.builtAt.slice(0, 10),
        factsObservedAt: source.value.fetchedAt, annualPeriods: 12, quarterlyPeriods: 30,
        vendorSplits: unavailableSplitEvidence("balance corroboration", "No share fields consumed") });
      return [...filed.balanceAnnual.rows, ...filed.balanceQuarterly.rows];
    })();
    const fields = ["totalAssets", "totalStockholdersEquity",
      ...["goodwill", "intangibleAssets", "preferredStock"].filter(field => positive(row[field]) > 0),
      ...LIQUID_ASSETS.filter(field => positive(row[field]) > positive(previous[field]))];
    return balances.some(filed => {
      if (filed.date !== row.date || filed.reportedCurrency !== row.reportedCurrency) return false;
      const proofs = fields.map(field => filed.fieldProvenance?.[field]);
      if (fields.some(field => !finite(row[field]) || !finite(filed[field]) || !vendorAgreesWithFiled(row[field], filed[field]) ||
        filed.fieldConflicts?.[field]?.usable === false) || proofs.some(proof => !proof || proof.periodEnd !== row.date ||
          proof.periodStart !== null || proof.unit !== row.reportedCurrency)) return false;
      return proofs[0]!.filings.some(filing => proofs.every(proof => proof!.filings.some(f => f.accn === filing.accn)));
    });
  };
}

/** One immutable admission view for calculations, reports and charts; raw evidence is retained. */
export function balanceIntegrityView(bundle: DataBundle): DataBundle {
  if (!bundle.statements) return bundle;
  const families = ["balanceAnnual", "balanceQuarterly", "incomeAnnual", "incomeQuarterly", "cashflowAnnual", "cashflowQuarterly"] as const;
  const statements = { ...bundle.statements }, gaps = [...(bundle.gaps ?? [])], asOf = { ...(bundle.asOf ?? {}) };
  const corroborates = filedCorroboration(bundle);
  const rejectedBalanceDates = new Set<string>();
  let changed = false;
  for (const name of families) {
    const family = statements[name];
    if (!family?.ok || family.value.source === "edgar") continue;
    const kind = name.startsWith("balance") ? "balance" : name.startsWith("income") ? "income" : "cashflow";
    const { rows, rejected: removed } = statementIntegrityRows(family.value.data, kind, kind === "balance" ? corroborates : undefined);
    for (const { period, reason } of removed) gaps.push({ field: `statements.${kind}.${period}.integrity`, severity: "warn",
      reason: `${reason} This observation is excluded; its original data remains stored as evidence.` });
    if (!removed.length) continue;
    const rejectedPeriods = [...new Map(removed.filter(rejected => !rows.some(row => row.date === rejected.period))
      .map(rejected => [rejected.period, rejected])).values()];
    if (kind === "balance") for (const rejected of rejectedPeriods) rejectedBalanceDates.add(rejected.period);
    const retainedDate = rows.map(row => row.date ?? "").sort().at(-1) ?? "";
    asOf[`statements.${name}`] = retainedDate;
    statements[name] = { ...family, value: { ...family.value,
      asOf: retainedDate,
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
  if (admittedEv?.ok && admittedEv !== enterpriseValues) asOf.enterpriseValues = admittedEv.value.asOf;
  return { ...bundle, statements, asOf, gaps, ...(admittedEv ? { enterpriseValues: admittedEv } : {}) };
}
