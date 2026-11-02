import { createHash } from "node:crypto";
import type { DataBundle } from "@/pipeline/types";
import type { EconomicShareEvidence } from "@/pipeline/stageB/securityBasis";

const labelPattern = "(?:Class [A-Z0-9]{1,8}|[A-Z][A-Z-]{0,30}) common stock";
const labels = (text: string): string[] => [...text.matchAll(new RegExp(`\\b(${labelPattern})\\b`, "gi"))].map(m => m[1]!.toLowerCase());
const validDay = (v: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const dated = (text: string): string | null => {
  const ms = Date.parse(`${text} UTC`);
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : null;
};

/**
 * N2: a deliberately narrow alternative to the inline cover layouts.
 * A primary balance sheet explicitly counts every equally participating class
 * at its report date, in unscaled shares; the SAME filing states their current
 * identical dividend/liquidation rights. Names, voting rights and conversion
 * options alone prove nothing. The provider title binds the quote class; it is
 * retained as provider evidence, never described as a filed symbol/title row.
 */
export function retainedClassEconomicEvidence(bundle: DataBundle): EconomicShareEvidence[] {
  const existing = bundle.economicShareEvidence ?? [];
  if (existing.length) return existing;
  const cutoff = bundle.builtAt.slice(0, 10);
  const registrant = bundle.edgar.registrant;
  const profile = bundle.profile.ok ? bundle.profile.value.data.rows[0] : null;
  if (!registrant || !profile || !validDay(cutoff) || !/^\d{10}$/.test(registrant.cik10) ||
    Number(profile.cik) !== Number(registrant.cik10) || profile.symbol !== bundle.symbol ||
    !registrant.tickers.includes(bundle.symbol) || profile.isAdr !== false || !bundle.profile.ok) return existing;
  const title = typeof profile.companyName === "string" ? profile.companyName : "";
  const quoteLabels = labels(title);
  if (quoteLabels.length !== 1) return existing;
  const notes = [bundle.edgar.tenQNotes, bundle.edgar.tenKNotes].flatMap(s => s?.ok ? [s.value] : [])
    .filter(s => /^(?:10-Q|10-K)(?:\/A)?$/.test(s.data.form) && validDay(s.data.filingDate) && s.data.filingDate <= cutoff)
    .sort((a, b) => b.data.filingDate.localeCompare(a.data.filingDate));
  const source = notes[0];
  if (!source) return existing;
  const d = source.data;
  if (!validDay(d.reportDate) || d.reportDate > d.filingDate || !/^\d{10}-\d{2}-\d{6}$/.test(d.accession)) return existing;
  try {
    const url = new URL(d.documentUrl);
    if (url.protocol !== "https:" || !["sec.gov", "www.sec.gov"].includes(url.hostname) || url.port || url.search || url.hash || url.username || url.password ||
      !new RegExp(`^/Archives/edgar/data/${Number(registrant.cik10)}/${d.accession.replaceAll("-", "")}/[a-zA-Z0-9_.-]+\\.html?$`).test(url.pathname)) return existing;
  } catch { return existing; }
  // Never carry an older statement past a newer periodic filing or a competing
  // same-day inventory. No omission establishes that a class disappeared.
  if ([bundle.edgar.latestTenQ, bundle.edgar.latestTenK].some(s => s?.ok && s.value.data.filingDate <= cutoff && s.value.data.filingDate > d.filingDate) ||
    (bundle.edgar.economicShareInventory ?? []).some(s => s.source.filingDate <= cutoff &&
      (s.source.filingDate > d.filingDate || s.source.filingDate === d.filingDate && s.source.documentUrl !== d.documentUrl ||
        s.source.filingDate === d.filingDate && [...s.classes, ...(s.observations ?? [])].some(o => o.asOf > d.reportDate)))) return existing;
  const statement = d.statementsText ?? "";
  if (!/BALANCE SHEETS?\b/i.test(statement) || !/in thousands, except share and per share data/i.test(statement)) return existing;
  const equityStart = /stockholders['\u2019]? equity:/i.exec(statement);
  if (!equityStart) return existing;
  const equity = statement.slice(equityStart.index).split(/\b(?:CONSOLIDATED )?STATEMENTS OF\b/i)[0]!;
  const entries = [...equity.matchAll(new RegExp(`\\b(${labelPattern})\\s*[-\\u2013\\u2014]`, "gi"))];
  const names = entries.map(m => m[1]!.toLowerCase());
  if (names.length < 2 || new Set(names).size !== names.length || !names.includes(quoteLabels[0]!)) return existing;
  // A plain or otherwise unsupported common-stock count is not silently lost.
  if ((equity.match(/\bcommon stock\b/gi) ?? []).length !== names.length) return existing;
  const countPattern = /([\d,]+|no)(?:\s+and\s+([\d,]+|no))?\s+shares issued and outstanding at ([A-Za-z]+\s+\d{1,2},?\s+\d{4})/gi;
  const counts: number[] = [];
  for (let i = 0; i < entries.length; i++) {
    const row = equity.slice(entries[i]!.index! + entries[i]![0].length, entries[i + 1]?.index);
    const observed = [...row.matchAll(countPattern)];
    if (!observed.length || dated(observed[0]![3]!) !== d.reportDate) return existing;
    const current = observed.filter(m => dated(m[3]!) === d.reportDate).map(m => m[1]!.toLowerCase() === "no" ? 0 : Number(m[1]!.replaceAll(",", "")));
    if (!current.length || current.some(n => !Number.isSafeInteger(n) || n < 0 || n !== current[0])) return existing;
    counts.push(current[0]!);
  }
  const sentences = d.text.split(/(?<=\.)\s+(?=[A-Z])/).map(s => s.trim());
  const equality = /^The rights, including the (?:liquidation and dividend|dividend and liquidation) rights(?: and sharing of losses)?, of the (.+) are identical, (?:other than|except with respect to) voting rights\.$/i;
  const relation = sentences.find(s => {
    const match = equality.exec(s);
    if (!match) return false;
    const related = labels(match[1]!);
    const remainder = match[1]!.replace(new RegExp(labelPattern, "gi"), "").replace(/\b(?:and|the)\b|[,\s]/gi, "");
    return !remainder && related.length === names.length && new Set(related).size === related.length && names.every(n => related.includes(n));
  });
  if (!relation || sentences.some(s => s !== relation && labels(s).some(n => names.includes(n)) && /\b(?:dividends?|distributions?|liquidation)\b/i.test(s) &&
    /\b(?:different|unequal|not equal|not identical|preferen\w*|priority|senior|subordinat\w*|not entitled|non-?participating|times|twice|half|percent|greater|less than|equal to)\b|\d\s?%|\b\d+\/\d+\b/i.test(s))) return existing;
  return [{ issuerId: registrant.cik10, securityId: bundle.symbol, asOf: d.reportDate, filed: d.filingDate,
    effectiveFrom: d.filingDate, effectiveTo: null, complete: true,
    sourceHash: createHash("sha256").update(JSON.stringify({ statement, text: d.text, quoteTitle: title })).digest("hex"),
    sourceIds: [d.documentUrl, bundle.profile.value.endpoint],
    basis: `Filed balance-sheet counts at ${d.reportDate}, not a cover-date inventory or weighted averages. Quote class bound by provider title "${title}", not independently by a filed trading-symbol row. The hash covers the retained statement, notes and provider title, not raw filing HTML. Filed rights: "${relation}"`,
    classes: names.map((name, i) => ({ classId: name === quoteLabels[0] ? bundle.symbol : name, shares: counts[i]!, countBasis: "outstanding",
      economicUnitsPerQuotedShare: 1, priceBasis: name === quoteLabels[0] ? "quoted-market-price" : "economic-equivalence-proxy" })) }];
}
