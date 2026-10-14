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
 * rule keeps its meaning: ONE field, filled only when the vendor row lacks it
 * and preferred stock is outstanding, only from a full-year 10-K fact whose
 * period end equals the vendor row's date, never overriding a vendor value, and
 * every filled period is disclosed in the missing-data manifest.
 */

import type { CompanyFacts } from "@/edgar/xbrl";
import type { FmpBalanceSheetRow, FmpIncomeStatementRow, FmpPayload } from "@/providers/fmp";
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
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function spanDays(start: string, end: string): number {
  return (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS;
}

/** Newest-filed full-year 10-K fact ending exactly on `date`, or null. */
export function filedCommonEarnings(
  facts: CompanyFacts,
  date: string,
): { value: number; accn: string | null; filed: string | null } | null {
  const concept = facts.facts["us-gaap"]?.[TAG] as { units?: Record<string, XbrlPoint[]> } | undefined;
  const points = concept?.units?.USD;
  if (!Array.isArray(points)) return null;
  let best: { value: number; accn: string | null; filed: string } | null = null;
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
    const span = spanDays(p.start, p.end);
    if (span < 350 || span > 380) continue;
    if (best === null || p.filed > best.filed) {
      best = { value: p.val, accn: typeof p.accn === "string" ? p.accn : null, filed: p.filed };
    }
  }
  return best;
}

export function supplementCommonEarnings(
  income: FetchResult<FmpPayload<FmpIncomeStatementRow>>,
  balance: FetchResult<FmpPayload<FmpBalanceSheetRow>>,
  facts: CompanyFacts | null,
): CommonEarningsSupplement {
  const none: CommonEarningsSupplement = { income, gaps: [] };
  if (facts === null || !income.ok || !balance.ok) return none;

  const filled: string[] = [];
  const rows = income.value.data.rows.map((row) => {
    if (typeof row.netIncomeAvailableToCommon === "number" && Number.isFinite(row.netIncomeAvailableToCommon)) return row;
    if (typeof row.date !== "string") return row;
    // The filed fact is read from the USD unit only.
    if (row.reportedCurrency !== undefined && row.reportedCurrency !== null && row.reportedCurrency !== "USD") return row;
    const bal = balance.value.data.rows.find((b) => b.date === row.date);
    const preferred = bal?.preferredStock;
    if (typeof preferred !== "number" || !Number.isFinite(preferred) || preferred <= 0) return row;
    const filed = filedCommonEarnings(facts, row.date);
    if (filed === null) return row;
    filled.push(`${row.date} (${filed.accn ?? "10-K"} filed ${filed.filed})`);
    return { ...row, netIncomeAvailableToCommon: filed.value };
  });
  if (filled.length === 0) return none;

  return {
    income: { ...income, value: { ...income.value, data: { ...income.value.data, rows } } },
    gaps: [
      {
        field: "statements.incomeAnnual.netIncomeAvailableToCommon",
        reason:
          `the vendor income statement carries no net income available to common beside outstanding preferred stock, ` +
          `so that one field was taken from SEC EDGAR companyfacts (us-gaap/${TAG}, full-year 10-K, same period end) ` +
          `for ${filled.join(", ")}; every other field on those rows is the vendor's`,
        severity: "info",
        attemptedSources: [`edgar:companyfacts us-gaap/${TAG}`],
        expected: true,
      },
    ],
  };
}
