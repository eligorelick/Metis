/**
 * A filing can present a taxonomy's inclusive LongTermDebt tag on its
 * noncurrent balance-sheet line. Establish that scope from the actual
 * statement, never from the tag's spelling or an issuer-specific exception.
 * Pure; unsupported/partial presentations establish no override.
 */
import { isoFromMonthDate, normalizeFilingText } from "@/edgar/currentReports";

export interface DebtPresentationInput {
  text: string;
  periodEnd: string;
  currency: string;
  tagValue: number;
  currentMaturities?: number | null;
  source: { form: string; accession: string; filingDate: string; reportDate: string; documentUrl: string };
  tagSource: { cik: string; accession: string; filingDate: string; periodEnd: string; unit: string };
}

export interface DebtPresentationEvidence {
  source: "edgar";
  unit: string;
  periodStart: null;
  periodEnd: string;
  tags: string[];
  filings: { accn: string; filed: string; form: string }[];
  /** Exact normalized header and liability rows supporting the scope. */
  text: string;
}

export interface DebtPresentationResult {
  status: "established" | "unestablished" | "conflict";
  scope: "noncurrent" | "inclusive" | null;
  noncurrentDebt: number | null;
  currentDebt: number | null;
  evidence?: DebtPresentationEvidence;
  reason: string;
}

const MONTH_DATE = String.raw`(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2},? \d{4}`;
const SCALE_HEADER = /\(In (thousands|millions|billions)(?:, except (?:par value|per share)(?: and (?:par value|per share))?(?: amounts)?)?\)/i;
const CELL = /^(?:\(?-?\d[\d,]*(?:\.\d+)?\)?|[—–-])$/;
const same = (a: number, b: number): boolean => Math.abs(a - b) <= Math.max(0.01, Math.abs(b) * 1e-12);

function result(status: "unestablished" | "conflict", reason: string): DebtPresentationResult {
  return { status, scope: null, noncurrentDebt: null, currentDebt: null, reason };
}

function sourceMatches(input: DebtPresentationInput): boolean {
  const { source, tagSource } = input;
  if (source.accession !== tagSource.accession || source.filingDate !== tagSource.filingDate || input.periodEnd !== tagSource.periodEnd ||
      input.currency !== "USD" || tagSource.unit !== input.currency || !/^10-[KQ](?:\/A)?$/.test(source.form) ||
      !/^\d{10}-\d{2}-\d{6}$/.test(source.accession) || !/^\d+$/.test(tagSource.cik)) return false;
  try {
    const url = new URL(source.documentUrl);
    const path = /^\/Archives\/edgar\/data\/(\d+)\/(\d{18})\/[^/]+$/.exec(url.pathname);
    return url.protocol === "https:" && (url.hostname === "www.sec.gov" || url.hostname === "sec.gov") && path !== null &&
      path[1]!.replace(/^0+/, "") === tagSource.cik.replace(/^0+/, "") && path[2] === source.accession.replaceAll("-", "");
  } catch { return false; }
}

/** A fully aligned two-column liabilities table, ending at its own total. */
function liabilityRows(text: string): { label: string; values: number[] }[] | null {
  const tokens = text.trim().split(/\s+/);
  const rows: { label: string; values: number[] }[] = [];
  let at = 0;
  while (at < tokens.length && rows.length < 30) {
    const label: string[] = [];
    while (at < tokens.length && tokens[at] !== "$" && !CELL.test(tokens[at]!)) label.push(tokens[at++]!);
    if (label.length === 0 || label.length > 22) return null;
    const values: number[] = [];
    while (at < tokens.length && values.length < 2) {
      const token = tokens[at++]!;
      if (token === "$") continue;
      if (!CELL.test(token)) return null;
      const value = /^[—–-]$/.test(token) ? 0 : Number(token.replace(/[(),]/g, "")) * (token.startsWith("(") ? -1 : 1);
      if (!Number.isFinite(value)) return null;
      values.push(value);
    }
    if (values.length !== 2) return null;
    rows.push({ label: label.join(" "), values });
    if (/^Total liabilities$/i.test(rows.at(-1)!.label)) return rows;
  }
  return null;
}

export function reconcileDebtPresentation(input: DebtPresentationInput): DebtPresentationResult {
  if (!sourceMatches(input)) return result("unestablished", "statement and tagged debt lack matching issuer, filing, period or currency identity");
  if (!Number.isFinite(input.tagValue) || input.tagValue < 0) return result("unestablished", "tagged debt amount is not a nonnegative finite value");
  const text = normalizeFilingText(input.text);
  const heading = /\b(?:CONDENSED\s+)?CONSOLIDATED BALANCE SHEETS?\b/i.exec(text);
  if (heading === null) return result("unestablished", "no supported consolidated balance-sheet heading");
  const rest = text.slice(heading.index, heading.index + 10_000);
  const assetsAt = /\bASSETS\b/i.exec(rest)?.index;
  if (assetsAt === undefined || assetsAt > 800) return result("unestablished", "balance-sheet header is incomplete");
  const header = rest.slice(0, assetsAt);
  const scaleName = SCALE_HEADER.exec(header)?.[1]?.toLowerCase();
  const scale = scaleName === "thousands" ? 1e3 : scaleName === "millions" ? 1e6 : scaleName === "billions" ? 1e9 : null;
  const dates = [...header.matchAll(new RegExp(MONTH_DATE, "g"))].map((m) => isoFromMonthDate(m[0]));
  if (scale === null || dates.length !== 2 || dates.some((date) => date === null) || dates[0] === dates[1] ||
      dates[0] !== input.source.reportDate || !dates.includes(input.periodEnd)) return result("unestablished", "statement scale or date columns do not bind to the source reporting period");
  // A narrow supported header grammar prevents an explicit foreign currency
  // or a second unit declaration from being silently ignored.
  const headerRemainder = header.replace(heading[0], "").replace(SCALE_HEADER, "")
    .replace(new RegExp(MONTH_DATE, "g"), "").replace(/\(?Unaudited\)?|\bUSD\b|\bU\.S\. dollars\b/gi, "").replace(/[\s,$()]/g, "");
  if (headerRemainder !== "") return result("unestablished", "statement header has an unsupported currency or additional unit/context declaration");
  const column = dates.indexOf(input.periodEnd);
  const current = /\bCurrent liabilities\s*:/i.exec(rest);
  if (current === null) return result("unestablished", "no current-liability group");
  const body = rest.slice(current.index + current[0].length);
  const total = /\bTotal liabilities\b(?!\s+and)/i.exec(body);
  if (total === null) return result("unestablished", "no complete total-liabilities row");
  const bounded = body.slice(0, total.index + total[0].length + 100);
  const rows = liabilityRows(bounded);
  if (rows === null) return result("unestablished", "liability rows do not align with the two statement columns");
  const subtotalAt = rows.findIndex((row) => /^Total current liabilities$/i.test(row.label));
  if (subtotalAt <= 0) return result("unestablished", "current liabilities have no complete grouped subtotal");
  const noncurrent = rows.slice(subtotalAt + 1, -1);
  const longTerm = noncurrent.filter((row) => /^Long[- ]term debt(?:,? net)?$/i.test(row.label));
  if (longTerm.length !== 1) return result("unestablished", "one unambiguous long-term debt line was not established below the current-liability subtotal");
  for (const index of [0, 1]) {
    const currentSum = rows.slice(0, subtotalAt).reduce((value, row) => value + row.values[index]!, 0);
    if (!same(currentSum, rows[subtotalAt]!.values[index]!)) return result("conflict", "displayed current liabilities do not reconcile to their subtotal");
    const sum = rows[subtotalAt]!.values[index]! + noncurrent.reduce((value, row) => value + row.values[index]!, 0);
    if (!same(sum, rows.at(-1)!.values[index]!)) return result("conflict", "current-liability subtotal plus all displayed noncurrent liabilities does not reconcile to total liabilities");
  }
  const displayed = longTerm[0]!.values[column]! * scale;
  const currentDebtRows = rows.slice(0, subtotalAt).filter((row) => /^Short[- ]term debt$/i.test(row.label));
  const currentDebt = currentDebtRows.length === 1 ? currentDebtRows[0]!.values[column]! * scale : null;
  if (displayed < 0 || (currentDebt !== null && currentDebt < 0)) return result("conflict", "the displayed debt carrying amounts are negative");
  const scope = same(input.tagValue, displayed) ? "noncurrent" : input.currentMaturities !== null && input.currentMaturities !== undefined &&
    Number.isFinite(input.currentMaturities) && input.currentMaturities >= 0 && same(input.tagValue - input.currentMaturities, displayed) ? "inclusive" : null;
  if (scope === null) return result("conflict", "the tagged debt amount agrees with neither the reconciled noncurrent line nor its inclusive current-maturity amount");
  return { status: "established", scope, noncurrentDebt: displayed, currentDebt,
    evidence: { source: "edgar", unit: input.currency, periodStart: null, periodEnd: input.periodEnd,
      tags: ["filing:balance-sheet:long-term-debt"], filings: [{ accn: input.source.accession, filed: input.source.filingDate, form: input.source.form }],
      text: `${header}Current liabilities: ${bounded}` },
    reason: scope === "noncurrent" ? "the exact tagged amount is the reconciled noncurrent balance-sheet line; current maturities must not be subtracted again"
      : "the tagged amount includes current maturities; subtracting the sourced current maturities reconciles to the noncurrent balance-sheet line" };
}
