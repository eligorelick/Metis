import type { FiscalPeriod, GuidanceItem, IssuerGuidance } from "@/edgar/currentReports";
import { htmlToText, type ParsedDocument } from "@/edgar/extract";

const CURRENT_QUARTER = /^Q([1-4])\s+FY\s*'?(20\d{2}|\d{2})\s+(?:Estimates|Current Guidance)$/i;
const TABLE_COLUMN_CUE = /\b(?:Q[1-4]\b[^.]{0,60}\bEstimates|(?:Previous|Current) Guidance)\b/i;
const ENDPOINT_RANGE = /^(US\$|\$|€|£)\s*(\d+(?:\.\d+)?)\s*(B|M|billion|million)?\s*[-–—]\s*(US\$|\$|€|£)?\s*(\d+(?:\.\d+)?)\s*(B|M|billion|million)?$/i;

/**
 * Current-only tables require actual cells: flattened text cannot establish
 * either a single column or a source row. Refusals are non-null so the caller
 * cannot rescue an ambiguous table by scanning its flattened text as prose.
 */
function parseQuarterlyDocumentTable(text: string, document: ParsedDocument): IssuerGuidance | null {
  const refused = (): IssuerGuidance => ({ period: null, items: [], qualifiers: [], unparsed: [] });
  if (document.fullText !== text) return refused();
  const tables = [...document.pre.matchAll(/<table\b[^>]*>[\s\S]*?<\/table\s*>/gi)]
    .map(table => {
      const head = htmlToText(table[0]).slice(0, 500);
      // These explicitly supported compact layouts retain their old route,
      // including its annual previous/current-column validation.
      const compact = /^Metric\s+(?:Q[1-4]\s+20\d{2}|Full Year\s+20\d{2})(?:\s|$)/.test(head);
      return { table, compact, current: !compact && TABLE_COLUMN_CUE.test(head) };
    }).filter(candidate => candidate.compact || candidate.current);
  if (!tables.some(candidate => candidate.current)) return null;
  if (tables.length !== 1) return refused();
  // Local conservative fence for this new layout only. Flattened coordinates
  // do not prove browser visibility; an explicit hidden ancestor may begin
  // outside the positive-scope window. Even unrelated closed hidden elements
  // decline this route. Legacy compact parsing and shared extraction stay intact.
  if (document.pre.length > 2_000_000) return refused();
  const visibilitySource = document.pre.replace(/<!--[\s\S]*?-->|<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ");
  const tags = /<(?:[^"'<>]|"[^"]*"|'[^']*')*>/g;
  if ([...visibilitySource.matchAll(tags)].some(([tag]) => /\shidden(?=[\s=/>])/i.test(tag.replace(/"[^"]*"|'[^']*'/g, '""')))) return refused();
  const table = tables[0]!.table;
  if (table[0].length > 60_000 || htmlToText(table[0]).length > 6_000 || /<table\b/i.test(table[0].slice(table[0].indexOf(">") + 1))) return refused();
  const scopeLabel = /^(?:(?:Business|Financial|Consolidated) Outlook|Consolidated Guidance)$/i;
  const captions = [...table[0].matchAll(/<caption\b[^>]*>([\s\S]*?)<\/caption\s*>/gi)];
  if (captions.length > 1 || captions.some(caption => !scopeLabel.test(htmlToText(caption[1]!)))) return refused();
  // Require a complete, immediately preceding visible scope label inside the
  // bounded context. A missing/truncated label is not consolidated proof.
  // Paragraph/div labels may contain emphasis; any intervening visible text
  // (including standalone bold/strong segment labels) invalidates that proof.
  const contextStart = Math.max(0, table.index - 1_500);
  const context = document.pre.slice(contextStart, table.index);
  const section = [...context.matchAll(/<(h[1-6]|p|div)\b[^>]*>[\s\S]*?<\/\1\s*>/gi)].at(-1);
  if (section === undefined || !scopeLabel.test(htmlToText(section[0])) ||
      htmlToText(context.slice(section.index + section[0].length)) !== "") return refused();
  // As with row/header spans below, the label must really occur at its
  // flattened-source coordinate. Script/style content cannot prove visibility,
  // even when its opening wrapper falls outside the scope lookback.
  const scopePrefix = htmlToText(document.pre.slice(0, contextStart + section.index));
  const scopeStart = scopePrefix.length + (scopePrefix.length === 0 ? 0 : 1);
  const scopeText = htmlToText(section[0]);
  if (text.slice(scopeStart, scopeStart + scopeText.length) !== scopeText) return refused();
  const rows = [...table[0].matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr\s*>/gi)];
  if (rows.length < 2 || rows.length > 32) return refused();
  const cellsOf = (row: string): string[] | null => {
    const cells = [...row.matchAll(/<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]\s*>/gi)];
    if (cells.length !== 2 || cells.some(cell => /\b(?:colspan|rowspan)\s*=/i.test(cell[1]!.replace(/\b(?:colspan|rowspan)\s*=\s*(?:"1"|'1'|1(?=\s|$))/gi, "")))) return null;
    return cells.map(cell => htmlToText(cell[2]!));
  };
  const header = cellsOf(rows[0]![0]);
  const match = header && CURRENT_QUARTER.exec(header[1]!);
  if (!header || !/^(?:Metric|Consolidated)?$/i.test(header[0]!) || !match) return refused();
  const fiscalQuarter = Number(match[1]) as 1 | 2 | 3 | 4;
  const fiscalYear = match[2]!.length === 2 ? 2000 + Number(match[2]) : Number(match[2]);
  const period: FiscalPeriod = { label: `Q${fiscalQuarter} FY${fiscalYear}`, fiscalYear, fiscalQuarter };
  // Coordinates address the same flattened document used by the release.
  const spanOf = (rawRow: RegExpExecArray, value: string) => {
    const prefix = htmlToText(document.pre.slice(0, table.index + rawRow.index));
    const start = prefix.length + (prefix.length === 0 ? 0 : 1);
    const rowText = htmlToText(rawRow[0]);
    const offset = rowText.indexOf(value);
    if (offset < 0 || text.slice(start, start + rowText.length) !== rowText) return null;
    return { start: start + offset, end: start + offset + value.length, text: value };
  };
  const headerSpan = spanOf(rows[0]!, header[1]!);
  if (headerSpan === null) return refused();
  const items: GuidanceItem[] = [];
  const seen = new Set<string>();
  let consolidated = true;
  for (const row of rows.slice(1)) {
    const cells = cellsOf(row[0]);
    if (cells === null) return refused();
    const [label, value] = cells as [string, string];
    const revenue = /^(?:Total |Consolidated )?Revenues?$/i.test(label);
    const eps = /^(GAAP|Non-GAAP) diluted (?:EPS|earnings per share)$/i.exec(label);
    // A section/segment/adjustment row ends the supported consolidated run.
    // It cannot lend its scope to a subsequent bare "Revenues" row.
    if (!revenue && !eps) { consolidated = false; continue; }
    if (!consolidated) continue;
    const metric = revenue ? "revenue" : "eps";
    const basis = revenue ? "unspecified" : eps![1]!.toLowerCase() === "gaap" ? "gaap" : "non-gaap";
    const key = `${metric}|${basis}`;
    if (seen.has(key)) return refused();
    seen.add(key);
    const range = ENDPOINT_RANGE.exec(value);
    if (!range) continue;
    const [, symbol, lowText, lowScale, secondSymbol, highText, highScale] = range;
    if (secondSymbol && secondSymbol.toUpperCase() !== symbol!.toUpperCase()) continue;
    const scaleOf = (scale: string | undefined) => /^(?:b|billion)$/i.test(scale ?? "") ? 1e9 : /^(?:m|million)$/i.test(scale ?? "") ? 1e6 : null;
    const scale = revenue ? scaleOf(lowScale) : 1;
    if (revenue ? scale === null || scale !== scaleOf(highScale) : lowScale !== undefined || highScale !== undefined) continue;
    const low = revenue ? Number((Number(lowText) * scale!).toFixed(2)) : Number(lowText);
    const high = revenue ? Number((Number(highText) * scale!).toFixed(2)) : Number(highText);
    if (!Number.isFinite(low) || !Number.isFinite(high) || low > high) continue;
    const raw = htmlToText(row[0]);
    const span = spanOf(row, raw);
    if (span === null) return refused();
    items.push({ metric, basis, period, unit: revenue ? "currency" : "currency-per-share", symbol: symbol!.toUpperCase(),
      low, mid: Number(((low + high) / 2).toFixed(6)), high, form: "range", sentence: raw.slice(0, 500), span, headerSpan });
  }
  return { period, items, qualifiers: [], unparsed: [] };
}

const MONEY = /(?<symbol>US\$|\$|€|£)\s*(?<low>\d+(?:\.\d+)?)\s*[-–—]\s*(?<second>US\$|\$|€|£)?\s*(?<high>\d+(?:\.\d+)?)\s*(?<scale>B|M|billion|million)\b/g;
const POINTS = /(?<low>[+-]?\d+(?:\.\d+)?)\s*[-–—]\s*(?<high>[+-]?\d+(?:\.\d+)?)\s*(?:pts|percentage points)\b/g;
const GROWTH = /([+-]?\d+(?:\.\d+)?)\s*[-–—]\s*([+-]?\d+(?:\.\d+)?)\s*%/g;
const HEADERS = /\bMetric\s+(?:Q([1-4])\s+(20\d{2})|Full Year\s+(20\d{2}))(?:\s+(Previous Guidance\s+Current Guidance|Current Guidance\s+Previous Guidance))?/g;
const ROWS = /\b(Adjusted EBITDA margin expansion|Adjusted EBITDA|Gross Bookings|Revenue)\*{0,2}\s+/g;
const STOP = /\*\*\s*A reconciliation|\bQuarterly Dividend\b|\bConference Call\b|\bForward-Looking Statements\b/;

/** Old compact formats plus bounded single-quarter tables with document evidence. */
export function parseGuidanceTables(text: string, document?: ParsedDocument): IssuerGuidance | null {
  if (document !== undefined) {
    const quarterly = parseQuarterlyDocumentTable(text, document);
    if (quarterly !== null) return quarterly;
  }
  const heading = /\b(?:Business|Financial) Outlook\s+Metric\b/.exec(text);
  if (!heading) return null;
  const start = heading.index;
  const window = text.slice(start, start + 6000);
  const stop = /\bQuarterly Dividend\b|\bConference Call\b|\bForward-Looking Statements\b/.exec(window);
  const block = window.slice(0, stop?.index ?? window.length);
  const headers = [...block.matchAll(HEADERS)];
  if (headers.length === 0) return null;
  const items: GuidanceItem[] = [];
  const unparsed: string[] = [];
  const seen = new Set<string>();
  for (const [i, header] of headers.entries()) {
    const quarter = header[1] ? Number(header[1]) as 1 | 2 | 3 | 4 : null;
    const year = Number(header[2] ?? header[3]);
    const period: FiscalPeriod = { label: quarter === null ? `FY${year}` : `Q${quarter} FY${year}`, fiscalYear: year, fiscalQuarter: quarter };
    const revisions = header[4] === "Previous Guidance Current Guidance";
    if (header[4] && !revisions) continue;
    // Annual columns must explicitly distinguish previous and current.
    if (quarter === null && !revisions) continue;
    const from = header.index + header[0].length;
    const segment = block.slice(from, headers[i + 1]?.index ?? block.length);
    const rowBlock = segment.slice(0, STOP.exec(segment)?.index ?? segment.length);
    const rows = [...rowBlock.matchAll(ROWS)];
    for (const [j, row] of rows.entries()) {
      if (row[1] === "Gross Bookings") continue;
      const end = rows[j + 1]?.index ?? rowBlock.length;
      const raw = rowBlock.slice(row.index, end).trimEnd();
      const expansion = row[1] === "Adjusted EBITDA margin expansion";
      const ranges = [...raw.matchAll(expansion ? POINTS : MONEY)];
      const count = revisions ? 2 : 1;
      if (ranges.length !== count) { unparsed.push(raw.slice(0, 500)); continue; }
      const bounds = ranges.map((match) => {
        const g = match.groups!;
        const scale = expansion ? 1 : /^(?:B|billion)$/.test(g.scale!) ? 1e9 : 1e6;
        const low = expansion ? Number(g.low) : Number((Number(g.low) * scale).toFixed(2));
        const high = expansion ? Number(g.high) : Number((Number(g.high) * scale).toFixed(2));
        if (!Number.isFinite(low) || !Number.isFinite(high) || low > high || (!expansion && g.second && g.symbol !== g.second)) return null;
        return { low, mid: (low + high) / 2, high, symbol: expansion ? null : g.symbol!, scale };
      });
      const current = bounds.at(-1), previous = revisions ? bounds[0] : null;
      if (!current || (revisions && (!previous || previous.symbol !== current.symbol || previous.scale !== current.scale))) { unparsed.push(raw.slice(0, 500)); continue; }
      const metric = expansion ? "adjusted-ebitda-margin-expansion" : row[1] === "Adjusted EBITDA" ? "adjusted-ebitda" : "revenue";
      const key = `${period.label}|${metric}`;
      if (seen.has(key)) return null;
      seen.add(key);
      const growthRanges = [...raw.matchAll(GROWTH)].map((match) => ({ low: Number(match[1]), high: Number(match[2]) }));
      const growthOk = growthRanges.length === count && growthRanges.every((g) => g.low <= g.high);
      const coordinate = start + from + row.index;
      items.push({ metric, basis: metric === "revenue" ? "unspecified" : "non-gaap", period, unit: expansion ? "percentage-points" : "currency", symbol: current.symbol,
        low: current.low, mid: current.mid, high: current.high, form: "range", sentence: raw.slice(0, 500),
        span: { start: coordinate, end: coordinate + raw.length, text: raw },
        headerSpan: { start: start + header.index, end: start + header.index + header[0].length, text: header[0] },
        ...(previous ? { previous: { low: previous.low, mid: previous.mid, high: previous.high } } : {}),
        ...(growthOk ? { growth: growthRanges.at(-1)! } : {}),
        ...(growthOk && revisions ? { previousGrowth: growthRanges[0]! } : {}),
      });
    }
  }
  const caveat = /A reconciliation\b[^.]{0,1400}?\./.exec(block)?.[0];
  return { period: items.find((item) => item.period.fiscalQuarter !== null)?.period ?? null, items, qualifiers: caveat ? [caveat] : [], unparsed: unparsed.slice(0, 4) };
}
