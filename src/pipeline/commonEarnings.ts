/**
 * Net income available to common, from SEC EDGAR, for issuers with preferred
 * stock whose vendor income row does not carry it.
 *
 * Why this exists: FMP's income statement has no `netIncomeAvailableToCommon`
 * for banks such as JPM, and its cash-flow `preferredDividendsPaid` is a zero
 * placeholder beside outstanding preferred. `computeRote` therefore (correctly)
 * refuses to credit the preferred coupon to common, so ROTE, the payout ratio
 * and the whole excess-return valuation were suppressed and the bank grades
 * fell back to a placeholder. The figure itself is filed: companyfacts carries
 * `NetIncomeLossAvailableToCommonStockholdersBasic` for the same fiscal year.
 *
 * Scope is deliberately narrow so the "no statement row mixes source fields"
 * rule keeps its meaning: explicit earnings-scope fields, filled only when the vendor row lacks them
 * and preferred stock or noncontrolling interests are outstanding, only from a full-year 10-K fact whose
 * period end equals the vendor row's date, never overriding a vendor value, and
 * every filled period is disclosed in the missing-data manifest.
 */

import type { CompanyFacts } from "@/edgar/xbrl";
import { CONSOLIDATED_NET_INCOME_TAGS } from "@/edgar/tagSynonyms";
import type { FmpBalanceSheetRow, FmpIncomeStatementRow, FmpPayload, StatementFieldProvenance } from "@/providers/fmp";
import type { FetchResult, ManifestEntry } from "@/types/core";

const TAG = "NetIncomeLossAvailableToCommonStockholdersBasic";
const ANNUAL_FORMS = new Set(["10-K", "10-K/A", "10-KT"]);
const DAY_MS = 86_400_000;

interface XbrlPoint {
  start?: unknown;
  end?: unknown;
  val?: unknown;
  form?: unknown;
  fp?: unknown;
  filed?: unknown;
  accn?: unknown;
}

export interface CommonEarningsSupplement {
  income: FetchResult<FmpPayload<FmpIncomeStatementRow>>;
  gaps: ManifestEntry[];
}

function isDay(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

function spanDays(start: string, end: string): number {
  return (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS;
}

/** Newest eligible full-year 10-K fact ending exactly on `date`, or null. */
export function filedCommonEarnings(
  facts: CompanyFacts,
  date: string,
  analysisAsOf?: string,
): { value: number; accn: string | null; filed: string | null } | null {
  const selected = selectCommonEarnings(facts, date, analysisAsOf);
  return selected === null ? null : { value: selected.value, accn: selected.accn, filed: selected.filed };
}

interface CommonEarningsFact { value: number; accn: string | null; filed: string; start: string; end: string; form: string }
function selectCommonEarnings(facts: CompanyFacts, date: string, analysisAsOf?: string): CommonEarningsFact | null {
  return selectAnnualEarnings(facts, TAG, date, analysisAsOf);
}
function selectAnnualEarnings(facts: CompanyFacts, tag: string, date: string, analysisAsOf?: string): CommonEarningsFact | null {
  if (analysisAsOf !== undefined && !isDay(analysisAsOf)) return null;
  const concept = facts.facts["us-gaap"]?.[tag] as { units?: Record<string, XbrlPoint[]> } | undefined;
  const points = concept?.units?.USD;
  if (!Array.isArray(points)) return null;
  let best: CommonEarningsFact | null = null;
  for (const p of points) {
    if (
      p.fp !== "FY" ||
      typeof p.form !== "string" ||
      !ANNUAL_FORMS.has(p.form) ||
      !isDay(p.start) ||
      !isDay(p.end) ||
      p.end !== date ||
      typeof p.val !== "number" ||
      !Number.isFinite(p.val) ||
      !isDay(p.filed)
    ) {
      continue;
    }
    if (analysisAsOf !== undefined && (p.filed > analysisAsOf || p.end > analysisAsOf)) continue;
    const span = spanDays(p.start, p.end);
    if (span < 350 || span > 380) continue;
    if (best === null || p.filed > best.filed) {
      best = { value: p.val, accn: typeof p.accn === "string" ? p.accn : null, filed: p.filed, start: p.start, end: p.end, form: p.form };
    }
  }
  return best;
}

export function supplementCommonEarnings(
  income: FetchResult<FmpPayload<FmpIncomeStatementRow>>,
  balance: FetchResult<FmpPayload<FmpBalanceSheetRow>>,
  facts: CompanyFacts | null,
  analysisAsOf?: string,
  factsObservedAt?: string,
): CommonEarningsSupplement {
  const none: CommonEarningsSupplement = { income, gaps: [] };
  if (facts === null || !income.ok || !balance.ok) return none;

  const supplemented = [
    ["netIncomeAvailableToCommon", [TAG]],
    ["netIncomeConsolidated", CONSOLIDATED_NET_INCOME_TAGS],
    ["netIncomeAttributableToNoncontrollingInterest", ["NetIncomeLossAttributableToNoncontrollingInterest"]],
  ] as const;
  const filled = new Map<string, string[]>();
  const selectedTags = new Map<string, Set<string>>();
  const rows = income.value.data.rows.map((row) => {
    if (typeof row.date !== "string") return row;
    // The filed fact is read from the USD unit only.
    if (row.reportedCurrency !== undefined && row.reportedCurrency !== null && row.reportedCurrency !== "USD") return row;
    const bal = balance.value.data.rows.find((b) => b.date === row.date);
    const preferred = bal?.preferredStock;
    const nci = bal?.minorityInterest;
    const hasPreferred = typeof preferred === "number" && Number.isFinite(preferred) && preferred > 0;
    const hasNci = typeof nci === "number" && Number.isFinite(nci) && nci !== 0;
    if (!hasPreferred && !hasNci) return row;
    const explicitStarts = [row.periodStart, ...Object.values(row.fieldProvenance ?? {}).map(p => p.periodStart)].filter(start => start !== undefined && start !== null);
    let out = row;
    for (const [field, tags] of supplemented) {
      if (typeof row[field] === "number" && Number.isFinite(row[field])) continue;
      const selected = tags.map(tag => ({ tag, fact: selectAnnualEarnings(facts, tag, row.date!, analysisAsOf) }))
        .find(candidate => candidate.fact !== null && !explicitStarts.some(start => start !== candidate.fact!.start));
      if (selected === undefined) continue;
      const { tag, fact: filed } = selected;
      if (filed === null) continue;
      const provenance: StatementFieldProvenance = {
        source: "edgar", unit: "USD", periodStart: filed.start, periodEnd: filed.end,
        observedAt: factsObservedAt ?? "", tags: [`us-gaap/${tag}`],
        filings: [{ accn: filed.accn ?? "", filed: filed.filed, form: filed.form }],
      };
      filled.set(field, [...(filled.get(field) ?? []), `${row.date} (${filed.accn ?? "10-K"} filed ${filed.filed})`]);
      selectedTags.set(field, new Set([...(selectedTags.get(field) ?? []), tag]));
      out = { ...out, [field]: filed.value, fieldProvenance: { ...out.fieldProvenance, [field]: provenance } };
    }
    return out;
  });
  if (filled.size === 0) return none;

  return {
    income: { ...income, value: { ...income.value, data: { ...income.value.data, rows } } },
    gaps: supplemented.filter(([field]) => filled.has(field)).map(([field]) => ({
        field: `statements.incomeAnnual.${field}`,
        reason:
          `the vendor income statement carries no ${field} beside outstanding preferred stock or noncontrolling interests, ` +
          `so that scope field was taken from SEC EDGAR companyfacts (${[...selectedTags.get(field)!].map(tag => `us-gaap/${tag}`).join(", ")}, full-year 10-K, same period end) ` +
          `for ${filled.get(field)!.join(", ")}; vendor observations are preserved`,
        severity: "info",
        attemptedSources: [...selectedTags.get(field)!].map(tag => `edgar:companyfacts us-gaap/${tag}`),
        expected: true,
      })),
  };
}
