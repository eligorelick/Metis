import type { FiscalPeriod, GuidanceItem, IssuerGuidance } from "@/edgar/currentReports";

const MONEY = /(?<symbol>US\$|\$|€|£)\s*(?<low>\d+(?:\.\d+)?)\s*[-–—]\s*(?<second>US\$|\$|€|£)?\s*(?<high>\d+(?:\.\d+)?)\s*(?<scale>B|M|billion|million)\b/g;
const POINTS = /(?<low>[+-]?\d+(?:\.\d+)?)\s*[-–—]\s*(?<high>[+-]?\d+(?:\.\d+)?)\s*(?:pts|percentage points)\b/g;
const GROWTH = /([+-]?\d+(?:\.\d+)?)\s*[-–—]\s*([+-]?\d+(?:\.\d+)?)\s*%/g;
const HEADERS = /\bMetric\s+(?:Q([1-4])\s+(20\d{2})|Full Year\s+(20\d{2}))(?:\s+(Previous Guidance\s+Current Guidance|Current Guidance\s+Previous Guidance))?/g;
const ROWS = /\b(Adjusted EBITDA margin expansion|Adjusted EBITDA|Gross Bookings|Revenue)\*{0,2}\s+/g;
const STOP = /\*\*\s*A reconciliation|\bQuarterly Dividend\b|\bConference Call\b|\bForward-Looking Statements\b/;

/** Explicit compact Metric/period tables only; unsupported layouts stay unparsed. */
export function parseGuidanceTables(text: string): IssuerGuidance | null {
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
