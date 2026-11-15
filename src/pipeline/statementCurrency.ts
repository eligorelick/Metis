/**
 * Statement currency evidence, split out of compute.ts: the currency each statement row, quarter
 * window and statement family is established in, from the row's own label or one filing's evidence;
 * an unestablished currency withholds the figures that would combine it (P4, P7).
 */

import type { ManifestEntry } from "@/types/core";
import type { DataBundle, FmpFetch } from "@/pipeline/types";
import type { FmpRawRow } from "@/providers/fmp";
import { normalizeReportedCurrency } from "@/pipeline/stageB/sectorRouting";
import { isoDay, rowsOf } from "./bundleRows";

/** A statement row as currency evidence: its period end, its own label and its filing identity. */
export type CurrencyEvidenceRow = { date?: unknown; reportedCurrency?: unknown; acceptedDate?: unknown; cik?: unknown };

function filingField(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * Whether two statement rows are provably parts of ONE filing: the same period
 * end AND the same SEC acceptance timestamp (and the same CIK when both state
 * one). A shared period-end date alone proves nothing — an amended filing, a
 * restatement or another provider feed can close on the same day in another
 * presentation currency.
 */
export function sameFiling(a: CurrencyEvidenceRow, b: CurrencyEvidenceRow): boolean {
  const day = isoDay(a.date);
  if (day === null || isoDay(b.date) !== day) return false;
  const accepted = filingField(a.acceptedDate);
  if (accepted === null || accepted !== filingField(b.acceptedDate)) return false;
  const cik = (row: CurrencyEvidenceRow) => filingField(row.cik)?.replace(/^0+/, "") ?? null;
  return cik(a) === null || cik(b) === null || cik(a) === cik(b);
}

/** What the evidence says about one quarter's currency. */
type QuarterCurrency =
  | { state: "known"; code: string; fromSameFiling: boolean }
  | { state: "unknown"; unlinkedLabels: boolean }
  | { state: "conflict"; codes: string[] };

export function quarterCurrency(row: CurrencyEvidenceRow, siblings: readonly CurrencyEvidenceRow[]): QuarterCurrency {
  const own = normalizeReportedCurrency(row.reportedCurrency);
  const linked = siblings.filter((sibling) => sameFiling(row, sibling));
  const codes = new Set<string>(own === null ? [] : [own]);
  for (const sibling of linked) {
    const code = normalizeReportedCurrency(sibling.reportedCurrency);
    if (code !== null) codes.add(code);
  }
  // A filing presents its statements in one currency: two codes within it are
  // conflicting evidence, never "no evidence".
  if (codes.size > 1) return { state: "conflict", codes: [...codes].sort() };
  if (codes.size === 1) return { state: "known", code: [...codes][0]!, fromSameFiling: own === null };
  const day = isoDay(row.date);
  return {
    state: "unknown",
    unlinkedLabels: siblings.some(
      (sibling) => day !== null && isoDay(sibling.date) === day && normalizeReportedCurrency(sibling.reportedCurrency) !== null,
    ),
  };
}

/**
 * The one currency four quarters are in, established row by row, keeping the
 * three kinds of evidence apart:
 *
 *  - `known`: every quarter is established in the same code — by its own
 *    label, or by the other statements of THE SAME FILING (sameFiling) when
 *    it has none. The annual statement is never evidence for a quarter.
 *  - `conflict`: some quarter's evidence names two currencies.
 *  - `mixed`: the quarters are each established, in different currencies.
 *  - `unknown`: at least one quarter has no evidence at all.
 *
 * Only a `known` window is a sum; any other state withholds it from every use.
 */
type WindowCurrency =
  | { state: "known"; code: string; fromSameFiling: boolean }
  | { state: "unknown" | "conflict" | "mixed"; detail: string };

export function resolveQuarterCurrency(
  rows: readonly CurrencyEvidenceRow[],
  siblings: readonly CurrencyEvidenceRow[],
): WindowCurrency {
  const quarters = rows.map((row) => ({ day: isoDay(row.date) ?? String(row.date ?? "?"), evidence: quarterCurrency(row, siblings) }));
  const describe = ({ day, evidence }: (typeof quarters)[number]): string =>
    `${day} ${
      evidence.state === "known" ? evidence.code : evidence.state === "conflict" ? `conflict (${evidence.codes.join(" vs ")})` : "unknown"
    }`;
  const conflicts = quarters.filter((q) => q.evidence.state === "conflict");
  if (conflicts.length > 0) return { state: "conflict", detail: conflicts.map(describe).join(", ") };
  const known = quarters.flatMap((q) => (q.evidence.state === "known" ? [q.evidence] : []));
  const codes = new Set(known.map((k) => k.code));
  if (codes.size > 1) return { state: "mixed", detail: quarters.map(describe).join(", ") };
  if (known.length === quarters.length && known.length > 0) {
    return { state: "known", code: known[0]!.code, fromSameFiling: known.some((k) => k.fromSameFiling) };
  }
  const unlinked = quarters.some((q) => q.evidence.state === "unknown" && q.evidence.unlinkedLabels);
  return {
    state: "unknown",
    detail:
      (known.length === 0 ? "no quarter carries a currency label" : `only some quarters are established (${quarters.map(describe).join(", ")})`) +
      (unlinked
        ? ", and the same-period rows that do carry one are not linked to the same filing (no shared SEC acceptance timestamp), so their label is not the quarter's"
        : ", and no other statement of the same filing supplies one"),
  };
}

/**
 * The one currency a set of statement rows is established in — each row by its
 * own label or its own filing's other statements — or null when any row is
 * unknown or in conflict, or two rows differ.
 */
export function establishedRowsCurrency(
  rows: readonly CurrencyEvidenceRow[],
  siblings: readonly CurrencyEvidenceRow[],
): string | null {
  const codes = new Set<string | null>(
    rows.map((row) => {
      const evidence = quarterCurrency(row, siblings);
      return evidence.state === "known" ? evidence.code : null;
    }),
  );
  return rows.length > 0 && codes.size === 1 && !codes.has(null) ? ([...codes][0] ?? null) : null;
}

type StatementFamily = "incomeAnnual" | "balanceAnnual" | "cashflowAnnual" | "balanceQuarterly" | "incomeQuarterly" | "cashflowQuarterly";

export const STATEMENT_FAMILY: Record<StatementFamily, { label: string; endpoint: string }> = {
  incomeAnnual: { label: "annual income statement", endpoint: "fmp:/stable/income-statement" },
  balanceAnnual: { label: "annual balance sheet", endpoint: "fmp:/stable/balance-sheet-statement" },
  cashflowAnnual: { label: "annual cash-flow statement", endpoint: "fmp:/stable/cash-flow-statement" },
  balanceQuarterly: { label: "quarterly balance sheet", endpoint: "fmp:/stable/balance-sheet-statement?period=quarter" },
  incomeQuarterly: { label: "quarterly income statement", endpoint: "fmp:/stable/income-statement?period=quarter" },
  cashflowQuarterly: { label: "quarterly cash-flow statement", endpoint: "fmp:/stable/cash-flow-statement?period=quarter" },
};

/**
 * The rows of one statement family that may be COMBINED with the model's other
 * rows — across statements (interest over debt, net income over equity, EBIT
 * against net debt) or across years (growth rates, averages, forensic deltas).
 *
 * A row qualifies only when its currency is ESTABLISHED (own label, or a
 * statement of the same filing) as the model currency. Missing evidence
 * establishes nothing, and no exchange rate is invented. Walking back from
 * the newest row, the history stops at the first row that does not qualify:
 * a gap year is never skipped over, so a "YoY" or a two-year average can
 * never silently span a currency change. The rows left out stay in the
 * statements as reported; only the calculations that combine rows lose them,
 * and the gap says why.
 */
export function rowsInModelCurrency<T extends CurrencyEvidenceRow>(
  family: StatementFamily,
  rows: readonly T[],
  model: string | null,
  evidence: readonly CurrencyEvidenceRow[],
): { rows: T[]; gap: ManifestEntry | null } {
  const ordered = rows
    .map((row, index) => ({ row, index, day: isoDay(row.date) }))
    .sort((a, b) => (b.day ?? "").localeCompare(a.day ?? "") || a.index - b.index);
  const kept = new Set<T>();
  let breakAt: { day: string; evidence: QuarterCurrency } | null = null;
  let excluded = 0;
  for (const { row, day } of ordered) {
    if (breakAt === null) {
      const found = quarterCurrency(row, evidence);
      if (model !== null && day !== null && found.state === "known" && found.code === model) {
        kept.add(row);
        continue;
      }
      breakAt = { day: day ?? String(row.date ?? "?"), evidence: found };
    }
    excluded += 1;
  }
  if (breakAt === null) return { rows: [...rows], gap: null };

  const { label, endpoint } = STATEMENT_FAMILY[family];
  const found = breakAt.evidence;
  const why =
    model === null
      ? "the model's own currency is not established, so no row can be shown to share it"
      : found.state === "known"
        ? `the ${label} for ${breakAt.day} is in ${found.code} but the model runs in ${model}`
        : found.state === "conflict"
          ? `the currency evidence for the ${label} of ${breakAt.day} is in conflict (${found.codes.join(" vs ")}) while the model runs in ${model}`
          : `the ${label} for ${breakAt.day} carries no currency label and no statement of the same filing supplies one, so its currency is not established (unknown), and it is not assumed to be the model's ${model}`;
  const scope =
    model === null
      ? `all ${excluded} ${label} row${excluded === 1 ? "" : "s"} are`
      : excluded === 1
        ? "that row is"
        : `that row and the ${excluded - 1} older one${excluded === 2 ? "" : "s"} are`;
  return {
    rows: rows.filter((row) => kept.has(row)),
    gap: {
      field: `compute.${family}.currency`,
      reason:
        `${why}. No FX conversion is applied, so ${scope} left out of every calculation that combines statements or ` +
        "years (cost of debt, WACC, ROIC and DuPont, net debt, the DCF and multiples bridges, forensic scores, growth rates " +
        "and projections), and those figures are withheld where they depended on them; each row's own margins and its " +
        "reported figures remain, in their own currency or as currency unknown",
      severity: "warn",
      attemptedSources: [endpoint],
    },
  };
}

/**
 * Every statement row of a bundle, as currency evidence: a row's own label,
 * and the labels of the statements filed with it (sameFiling). Tolerant of a
 * degraded bundle missing members.
 */
export function statementCurrencyEvidence(bundle: DataBundle): CurrencyEvidenceRow[] {
  const statements: Partial<DataBundle["statements"]> = bundle.statements ?? {};
  const rows = (f: FmpFetch<FmpRawRow> | undefined): FmpRawRow[] => (f === undefined ? [] : rowsOf(f));
  return [
    ...rows(statements.incomeAnnual),
    ...rows(statements.balanceAnnual),
    ...rows(statements.cashflowAnnual),
    ...rows(statements.incomeQuarterly),
    ...rows(statements.balanceQuarterly),
    ...rows(statements.cashflowQuarterly),
  ];
}

/**
 * The currency the statement row(s) for one period end are established in —
 * each by its own label or a statement of the same filing — or null when no
 * row has that date, any is unknown or in conflict, or two differ.
 */
export function establishedCurrencyOn(
  rows: readonly CurrencyEvidenceRow[],
  date: string | null,
  evidence: readonly CurrencyEvidenceRow[],
): string | null {
  const day = date === null ? null : isoDay(date);
  return day === null ? null : establishedRowsCurrency(rows.filter((row) => isoDay(row.date) === day), evidence);
}

/** Withhold a window whose currency is not established; null when it is. */
export function windowCurrencyGap(
  window: "income" | "cash-flow",
  currency: WindowCurrency,
  endpoint: string,
): ManifestEntry | null {
  const field = window === "income" ? "compute.ttmIncome" : "compute.ttmCashFlow";
  const fallback = "the TTM basis is suppressed; latest annual statement used instead";
  switch (currency.state) {
    case "known":
      return null;
    case "mixed":
      return {
        field,
        reason: `latest 4 quarterly rows are not in one reporting currency (${currency.detail}) — a sum across currencies is no figure at all, so ${fallback}`,
        severity: "warn",
        attemptedSources: [endpoint],
      };
    case "conflict":
      return {
        field,
        reason:
          `latest 4 quarterly ${window} rows' currency evidence is in conflict (${currency.detail}): statements of one ` +
          `filing name different currencies, so no quarter's currency is established — ${fallback}`,
        severity: "warn",
        attemptedSources: [endpoint],
      };
    case "unknown":
      return {
        field: `${field}.currency`,
        reason:
          `the latest 4 quarterly ${window} rows' reporting currency could not be established: ${currency.detail}; the ` +
          "annual statement's currency is not evidence for the quarters. A sum of quarters not shown to share one " +
          "currency is not a figure, so it is withheld from every use — the DCF anchor, the price multiples, and the " +
          `ratios and signs built on its sums (interest coverage, cost of debt, tax rate, routing) — and ${fallback}`,
        severity: "warn",
        attemptedSources: [endpoint],
      };
  }
}
