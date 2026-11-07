import { normalizeFilingText } from "./currentReports";

export interface QuarterlyEarningsFact {
  periodEnd: string;
  months: 3;
  symbol: "$";
  netIncome: number;
  eps: number;
  epsDiluted: number;
  weightedAverageShsOut: number;
  weightedAverageShsOutDil: number;
}
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const NUMBER = String.raw`\$?\s*\(?-?\d[\d,]*(?:\.\d+)?\)?`;
const CELLS = `((?:${NUMBER}\\s*){4})`;
const numbers = (cells: string) => [...cells.matchAll(/\(?-?\d[\d,]*(?:\.\d+)?\)?/g)].map(m => (m[0].includes("(") ? -1 : 1) * Number(m[0].replace(/[(),]/g, "")));

/** A complete consolidated GAAP statement with two quarterly and two annual
 * columns. No annual subtraction, adjusted EPS, unit inference or partial rows. */
export function parseQuarterlyEarnings(rawText: string): QuarterlyEarningsFact[] {
  const text = normalizeFilingText(rawText);
  const titles = [...text.matchAll(/\bCONSOLIDATED STATEMENTS OF (?:OPERATIONS|INCOME)\b/gi)];
  if (titles.length !== 1) return [];
  // Flattened text must retain the complete governing scope, not just a
  // suffix touching the title. A different consolidated statement establishes
  // an independent population; punctuation/parentheticals alone do not.
  const prefix = text.slice(0, titles[0]!.index);
  const priorStatement = [...prefix.matchAll(/\bCONSOLIDATED (?:BALANCE SHEETS|STATEMENTS OF CASH FLOWS)\b/gi)].at(-1);
  const local = prefix.slice(priorStatement ? priorStatement.index + priorStatement[0].length : 0);
  const adjusted = /\b(?:non[ -]?gaap|adjusted|reconciliation)\b/i;
  let headingStart = 0;
  for (const sentence of local.matchAll(/([^.!?]+[.!?])(?=\s|$)/g)) {
    const value = sentence[1]!;
    const end = sentence.index + sentence[0].length;
    // An adjusted basis remains governing across subsequent neutral sentences.
    // Only explicit discussion of a separate location clears it; "presented
    // below" or "these figures are unaudited" still qualifies this statement.
    const separateLocation = /\b(?:elsewhere|(?:in|under) (?:a |the )?separate (?:section|reconciliation|discussion))\b/i.test(value) &&
      !/\b(?:below|following|these (?:figures|amounts)|this (?:statement|table|section))\b/i.test(value);
    if (adjusted.test(local.slice(headingStart, end)) && !separateLocation) continue;
    if (/\b(?:is|are|was|were|has|have|had|discuss(?:es|ed)?|present(?:s|ed)?|provide(?:s|d)?|include(?:s|d)?)\b/.test(value) && value.split(/\s+/).length >= 5) headingStart = end;
  }
  if (adjusted.test(local.slice(headingStart))) return [];
  const tail = text.slice(titles[0]!.index! + titles[0]![0].length, titles[0]!.index! + 18000);
  const end = tail.search(/\bCONSOLIDATED (?:STATEMENTS|BALANCE SHEETS)\b/i);
  const body = end < 0 ? tail : tail.slice(0, end);
  const header = /^\s*\(In (millions|thousands),? except per share data\)\s*(?:\(Unaudited\)\s*)?Three Months Ended Twelve Months Ended\s+/i.exec(body);
  if (!header) return [];
  const datePattern = new RegExp(`^(${MONTHS.join("|")}) (\\d{1,2}), (20\\d{2})\\s+`, "i");
  let rest = body.slice(header[0].length);
  const ends: string[] = [];
  for (let i = 0; i < 4; i++) {
    const date = datePattern.exec(rest);
    if (!date) return [];
    const iso = `${date[3]}-${String(MONTHS.indexOf(date[1]!.toLowerCase()) + 1).padStart(2, "0")}-${date[2]!.padStart(2, "0")}`;
    if (!Number.isFinite(Date.parse(iso)) || new Date(iso).toISOString().slice(0, 10) !== iso) return [];
    ends.push(iso); rest = rest.slice(date[0].length);
  }
  if (ends[0] !== ends[2] || ends[1] !== ends[3] || (Date.parse(ends[0]!) - Date.parse(ends[1]!)) / 86400000 < 350 || (Date.parse(ends[0]!) - Date.parse(ends[1]!)) / 86400000 > 380) return [];
  const pattern = new RegExp(`\\bNet income(?: \\(loss\\))?\\s+${CELLS}Basic earnings(?: \\(loss\\))? per share\\s+${CELLS}Diluted earnings(?: \\(loss\\))? per share\\s+${CELLS}Shares used in per share calculations:\\s+Basic\\s+${CELLS}Diluted\\s+${CELLS}(?=\\s*(?:[A-Za-z]|$))`, "i");
  const match = pattern.exec(rest);
  if (!match || !match[2]!.includes("$") || !match[3]!.includes("$")) return [];
  if (/\b(?:non[ -]?gaap|adjusted|reconciliation)\b/i.test(rest.slice(0, match.index + match[0].length))) return [];
  const [income, basicEps, dilutedEps, basicShares, dilutedShares] = [1, 2, 3, 4, 5].map(i => numbers(match[i]!));
  if ([income, basicEps, dilutedEps, basicShares, dilutedShares].some(values => values!.length !== 4 || values!.some(value => !Number.isFinite(value)))) return [];
  // Arithmetic is a consistency check, never a replacement for printed EPS.
  // Permit half-unit rounding of share counts and one cent of EPS rounding.
  for (let i = 0; i < 4; i++) {
    const basic = basicShares![i]!, diluted = dilutedShares![i]!, ni = income![i]!;
    if (basic <= 0 || diluted < basic || Math.abs(ni / basic - basicEps![i]!) > 0.01 + Math.abs(ni) * 0.5 / basic ** 2 ||
        Math.abs(ni / diluted - dilutedEps![i]!) > 0.01 + Math.abs(ni) * 0.5 / diluted ** 2) return [];
  }
  const scale = header[1]!.toLowerCase() === "millions" ? 1e6 : 1e3;
  return ends.slice(0, 2).map((periodEnd, i) => ({ periodEnd, months: 3, symbol: "$", netIncome: income![i]! * scale,
    eps: basicEps![i]!, epsDiluted: dilutedEps![i]!, weightedAverageShsOut: basicShares![i]! * scale, weightedAverageShsOutDil: dilutedShares![i]! * scale }));
}
