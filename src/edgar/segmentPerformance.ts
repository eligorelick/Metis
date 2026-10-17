/** Matched quarterly segment tables only; no estimated values or label mappings. */
export interface SegmentPerformance {
  segment: string;
  metric: "adjusted-ebitda";
  months: 3;
  periodEnd: string;
  comparisonPeriodEnd: string;
  currency: string;
  scale: number;
  revenue: number;
  priorRevenue: number;
  profit: number;
  priorProfit: number;
  marginPct: number;
  priorMarginPct: number;
  changeBasisPoints: number;
  spans: { start: number; end: number; text: string }[];
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const HEADER = new RegExp(`Three months ended (?<month>${MONTHS.join("|")})\\s+(?<day>\\d{1,2}),?\\s+(?:(?<tail>Six|Nine|Twelve) months ended (?<tailMonth>${MONTHS.join("|")})\\s+(?<tailDay>\\d{1,2}),?\\s+)?(?<year>20\\d{2})\\s+(?<prior>20\\d{2})\\s+%\\s*Change(?:\\s+\\k<year>\\s+\\k<prior>\\s+%\\s*Change)?`, "g");
const NUMBER = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?`;
const AMOUNT = String.raw`\$?\s*\(?-?${NUMBER}\)?`;
const CHANGE = String.raw`(?:\(?-?\d+(?:\.\d+)?\)?\s*%|N/?A|[—–-])`;
type Span = SegmentPerformance["spans"][number];
interface Table { periodEnd: string; priorEnd: string; currency: string; scale: number; header: Span; rows: Map<string, { current: number; prior: number; span: Span }> }
const span = (text: string, start: number, end: number): Span => ({ start, end, text: text.slice(start, end) });
function day(month: string, date: string, year: string): string | null {
  const iso = `${year}-${String(MONTHS.indexOf(month) + 1).padStart(2, "0")}-${date.padStart(2, "0")}`;
  return Number.isFinite(Date.parse(iso)) && new Date(iso).toISOString().slice(0, 10) === iso ? iso : null;
}
function amount(raw: string): number {
  const value = Number(raw.replace(/[$,()\s]/g, ""));
  return raw.includes("(") ? -value : value;
}
function readTable(text: string, heading: RegExpExecArray, currency: string): Table | null {
  const from = Math.max(0, heading.index - 600);
  const window = text.slice(from, heading.index + heading[0].length + 400);
  const headers = [...window.matchAll(HEADER)];
  const headingEnd = heading.index + heading[0].length;
  // A heading is either directly before its header or directly after the
  // header's currency/scale. Do not borrow another table's period labels.
  const header = headers.find((h) => from + h.index >= headingEnd && text.slice(headingEnd, from + h.index).trim() === "") ??
    headers.filter((h) => from + h.index + h[0].length <= heading.index).at(-1);
  if (!header?.groups) return null;
  const g = header.groups;
  if (Number(g.year) - Number(g.prior) !== 1 || (g.tail && (g.tailMonth !== g.month || g.tailDay !== g.day || !new RegExp(`${g.year}\\s+${g.prior}\\s+%\\s*Change$`).test(header[0])))) return null;
  const periodEnd = day(g.month!, g.day!, g.year!);
  const priorEnd = day(g.month!, g.day!, g.prior!);
  if (!periodEnd || !priorEnd) return null;
  let cursor = from + header.index + header[0].length;
  const units: { currency: string; scale: number }[] = [];
  for (let i = 0; i < 2; i++) {
    const unit = /^\s*\((US\$|\$|USD|EUR|GBP|CAD|€|£)\s+in\s+(thousands|millions|billions)\)/.exec(text.slice(cursor));
    if (!unit) break;
    const code = unit[1] === "$" ? currency : unit[1] === "US$" ? "USD" : unit[1] === "€" ? "EUR" : unit[1] === "£" ? "GBP" : unit[1]!;
    units.push({ currency: code, scale: unit[2] === "thousands" ? 1e3 : unit[2] === "millions" ? 1e6 : 1e9 });
    cursor += unit[0].length;
  }
  const unit = units[0];
  if (!unit || units.some((u) => u.currency !== currency || u.scale !== unit.scale) || (g.tail && units.length !== 2)) return null;
  if (cursor <= heading.index) {
    if (text.slice(cursor, heading.index).trim() !== "") return null;
    cursor = headingEnd;
  }
  const row = new RegExp(`^\\s*([A-Za-z][A-Za-z0-9 &'()./-]{0,100}?)\\s+(${AMOUNT})\\s+(${AMOUNT})\\s+${CHANGE}${g.tail ? `\\s+${AMOUNT}\\s+${AMOUNT}\\s+${CHANGE}` : ""}`);
  const headerSpan = span(text, Math.min(heading.index, from + header.index), cursor);
  const rows: Table["rows"] = new Map();
  for (let i = 0; i < 32; i++) {
    const match = row.exec(text.slice(cursor, cursor + 1500));
    if (!match) break;
    const label = match[1]!.trim();
    if (/^(?:total|segment adjusted|unallocated)\b/i.test(label)) break;
    if (rows.has(label)) return null;
    const current = amount(match[2]!);
    const prior = amount(match[3]!);
    if (!Number.isFinite(current) || !Number.isFinite(prior)) return null;
    rows.set(label, { current: current * unit.scale, prior: prior * unit.scale, span: span(text, cursor, cursor + match[0].length) });
    cursor += match[0].length;
  }
  return { periodEnd, priorEnd, currency, scale: unit.scale, header: headerSpan, rows };
}

/** Both source tables must establish the same completed quarter and units. */
export function parseSegmentPerformance(text: string, periodEnd: string | null, currency: string | null): SegmentPerformance[] {
  if (!periodEnd || !currency || text.length > 500_000) return [];
  const tables = (pattern: RegExp) => [...text.matchAll(pattern)].flatMap((heading) => {
    const table = readTable(text, heading, currency);
    return table?.periodEnd === periodEnd ? [table] : [];
  });
  const revenues = tables(/\bRevenue by Segment\b/g);
  const profits = tables(/\bAdjusted EBITDA by Segment\b/g);
  if (revenues.length !== 1 || profits.length !== 1) return [];
  const revenue = revenues[0]!, profit = profits[0]!;
  if (revenue.priorEnd !== profit.priorEnd || revenue.scale !== profit.scale || revenue.currency !== profit.currency) return [];
  return [...revenue.rows].flatMap(([segment, r]) => {
    const p = profit.rows.get(segment);
    if (!p || r.current <= 0 || r.prior <= 0 || ![r.current, r.prior, p.current, p.prior].every(Number.isFinite)) return [];
    const marginPct = p.current / r.current * 100;
    const priorMarginPct = p.prior / r.prior * 100;
    const changeBasisPoints = (marginPct - priorMarginPct) * 100;
    if (![marginPct, priorMarginPct, changeBasisPoints].every(Number.isFinite)) return [];
    return [{ segment, metric: "adjusted-ebitda" as const, months: 3 as const, periodEnd, comparisonPeriodEnd: revenue.priorEnd, currency, scale: revenue.scale,
      revenue: r.current, priorRevenue: r.prior, profit: p.current, priorProfit: p.prior, marginPct, priorMarginPct,
      changeBasisPoints, spans: [revenue.header, r.span, profit.header, p.span] }];
  });
}
