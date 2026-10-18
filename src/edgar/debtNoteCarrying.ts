/** Narrow, deterministic carrying-value reconciliation for a two-class debt note. */
import { isoFromMonthDate, normalizeFilingText, splitSentences } from "@/edgar/currentReports";
import type { DebtPresentationInput } from "@/edgar/debtPresentation";
import type { StatementFieldProvenance } from "@/providers/fmp";

export interface DebtNoteCarryingInput {
  text: string;
  periodEnd: string;
  currency: string;
  observedAt: string;
  principal: number;
  source: DebtPresentationInput["source"];
  principalSource: DebtPresentationInput["tagSource"];
}
export interface DebtNoteCarryingResult {
  currentDebt: number;
  noncurrentDebt: number;
  carryingDebt: number;
  principalDebt: number;
  discounts: number;
  evidence: StatementFieldProvenance & { documentUrl: string; text: string; reconciliation: string };
}
const DATE = String.raw`(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2},? \d{4}`;
const CELL = String.raw`(?:\(\s*\d[\d,]*\s*\)|\d[\d,]*|[-—–])`;
const PAIR = String.raw`\s+\$?\s*(${CELL})\s+\$?\s*(${CELL})`;
const day = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
const amount = (s: string): number => /^[-—–]$/.test(s) ? 0 : Number(s.replace(/[(),\s]/g, "")) * (s.startsWith("(") ? -1 : 1);

export function reconcileDebtNoteCarrying(input: DebtNoteCarryingInput): DebtNoteCarryingResult | null {
  const { source: s, principalSource: p } = input;
  const cutoff = input.observedAt.slice(0, 10);
  if (!day(cutoff) || !day(input.periodEnd) || !day(s.filingDate) || !day(s.reportDate) || s.filingDate > cutoff ||
      input.periodEnd > cutoff || s.reportDate !== input.periodEnd || s.filingDate < s.reportDate ||
      input.currency !== "USD" || p.unit !== "USD" || p.periodEnd !== input.periodEnd || p.accession !== s.accession ||
      p.filingDate !== s.filingDate || !/^10-[KQ](?:\/A)?$/.test(s.form) || !/^\d{10}-\d{2}-\d{6}$/.test(s.accession) || !/^\d+$/.test(p.cik)) return null;
  try {
    const url = new URL(s.documentUrl);
    const path = /^\/Archives\/edgar\/data\/(\d+)\/(\d{18})\/[^/]+$/.exec(url.pathname);
    if (url.protocol !== "https:" || !["www.sec.gov", "sec.gov"].includes(url.hostname) || !path ||
        path[1]!.replace(/^0+/, "") !== p.cik.replace(/^0+/, "") || path[2] !== s.accession.replaceAll("-", "")) return null;
  } catch { return null; }
  if (!Number.isFinite(input.principal) || input.principal <= 0) return null;
  const text = normalizeFilingText(input.text);
  const header = new RegExp(String.raw`\b10\. Debt The total debt obligations are as follows \(dollars in millions\): Maturities Effective Interest Rates (${DATE}) (${DATE}) Recourse debt:`, "g");
  const headers = [...text.matchAll(header)];
  if (headers.length !== 1) return null;
  const h = headers[0]!;
  if (isoFromMonthDate(h[1]!) !== input.periodEnd || isoFromMonthDate(h[2]!) === null || isoFromMonthDate(h[2]!)! >= input.periodEnd) return null;
  const body = text.slice(h.index! + h[0].length, h.index! + 6000);
  const parts = body.split("Non-recourse debt:");
  if (parts.length !== 2) return null;
  const summaries: number[][][] = [];
  let tableEnd = 0;
  for (const [i, name] of ["recourse", "non-recourse"].entries()) {
    const pattern = new RegExp(String.raw`Less: Unamortized discount and issuance costs${PAIR} Total ${name} debt, net of unamortized discount and issuance costs${PAIR} Less: ${i === 0 ? "Recourse" : "Non-recourse"} debt, current${PAIR} Total ${name} debt, non-current${PAIR}(?=\s|$)`, "g");
    const matches = [...parts[i]!.matchAll(pattern)];
    if (matches.length !== 1) return null;
    const m = matches[0]!;
    const rows = [1, 3, 5, 7].map((at) => [amount(m[at]!), amount(m[at + 1]!)]);
    for (const column of [0, 1]) {
      const [discount, net, current, noncurrent] = rows.map((r) => r[column]!);
      if (![discount!, net!, current!, noncurrent!].every(Number.isFinite) || discount! > 0 || net! < 0 || current! > 0 || noncurrent! < 0 || net! + current! !== noncurrent!) return null;
    }
    summaries.push(rows);
    if (i === 1) tableEnd = h.index! + h[0].length + parts[0]!.length + "Non-recourse debt:".length + m.index! + m[0].length;
  }
  const currentDebt = -summaries.reduce((sum, rows) => sum + rows[2]![0]!, 0) * 1e6;
  const noncurrentDebt = summaries.reduce((sum, rows) => sum + rows[3]![0]!, 0) * 1e6;
  const carryingDebt = summaries.reduce((sum, rows) => sum + rows[1]![0]!, 0) * 1e6;
  const discounts = -summaries.reduce((sum, rows) => sum + rows[0]![0]!, 0) * 1e6;
  if (input.principal - discounts !== carryingDebt || currentDebt + noncurrentDebt !== carryingDebt) return null;
  // The aggregate tag is only a principal anchor after the note's separately
  // dated maturity schedule agrees. No fiscal bucket becomes current debt.
  const schedulePattern = new RegExp(String.raw`As of (${DATE}), the future principal payments for the Company's total debt were as follows \(in millions\): Years Ending December 31, Amount (Remaining portion of \d{4}\s+\$?\s*${CELL}(?:\s+\d{4}\s+\$?\s*${CELL}){1,10}) Thereafter\s+\$?\s*(${CELL}) Total\s+\$?\s*(${CELL})(?=\s|$)`, "g");
  const schedules = [...text.slice(tableEnd, h.index! + 10_000).matchAll(schedulePattern)];
  if (schedules.length !== 1) return null;
  const schedule = schedules[0]!;
  if (isoFromMonthDate(schedule[1]!) !== input.periodEnd) return null;
  const buckets = [...schedule[2]!.matchAll(new RegExp(String.raw`(?:Remaining portion of )?(\d{4})\s+\$?\s*(${CELL})`, "g"))];
  if (buckets.some((b, i) => Number(b[1]) !== Number(input.periodEnd.slice(0, 4)) + i || amount(b[2]!) < 0)) return null;
  const thereafter = amount(schedule[3]!);
  const principalTotal = amount(schedule[4]!);
  if (thereafter < 0 || principalTotal * 1e6 !== input.principal || buckets.reduce((sum, b) => sum + amount(b[2]!), thereafter) !== principalTotal) return null;
  // Arithmetic cannot establish consolidated scope or exclude lease overlap.
  // Read explicit qualifications around this note, including its lead-in;
  // unsupported qualifications refuse recovery rather than change the sums.
  const afterHeader = text.slice(h.index! + h[0].length);
  const nextNote = /\b11\.\s+[A-Z]/.exec(afterHeader);
  const context = text.slice(Math.max(0, h.index! - 600), nextNote ? h.index! + h[0].length + nextNote.index : undefined);
  for (const sentence of splitSentences(context)) {
    const declaredCurrency = /\b(?:all (?:amounts|figures|balances)|(?:(?:this|the) )?(?:(?:following|above|below) )?(?:debt )?(?:note|table|schedule)(?: (?:amounts|figures|balances))?)\b[^.]{0,100}\b(?:are|is)\s+(?:(?:denominated|reported|presented|stated)\s+)?in\s+(.+)/i.exec(sentence)?.[1];
    if (declaredCurrency !== undefined && !/^(?:USD|U\.?S\.? dollars|United States dollars)\b/i.test(declaredCurrency)) return null;
    const scopeReference = /\b(?:debt obligations|debt table|total debt|principal (?:maturity|payments?) schedule|(?:following|above|this) (?:debt )?(?:table|schedule))\b/i.test(sentence);
    if (!scopeReference) continue;
    if (/\b(?:solely|only|exclusively|standalone|stand-alone|unconsolidated|parent-only|subsidiary-only|exclude(?:s)? (?:all )?other consolidated)\b/i.test(sentence) ||
        (/\b(?:includ(?:e|es|ed|ing)|contain(?:s|ed)?|compris(?:e|es|ed|ing))\b/i.test(sentence) && /\b(?:operating|finance|capital|recognized)\b[^.]{0,70}\blease\b/i.test(sentence))) return null;
  }
  return { currentDebt, noncurrentDebt, carryingDebt, principalDebt: input.principal, discounts,
    evidence: { source: "edgar", unit: "USD", periodStart: null, periodEnd: input.periodEnd, observedAt: input.observedAt,
      tags: ["filing:debt-note:carrying-reconciliation", "us-gaap/DebtInstrumentCarryingAmount"],
      filings: [{ accn: s.accession, filed: s.filingDate, form: s.form }], documentUrl: s.documentUrl,
      text: `${text.slice(h.index, tableEnd)} ${schedule[0]}`, reconciliation: `principal ${input.principal} - discounts ${discounts} = carrying ${carryingDebt} = current ${currentDebt} + noncurrent ${noncurrentDebt}` } };
}
