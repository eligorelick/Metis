import { decodeEntities, primaryDocumentStructure, type ParsedDocument } from "./extract";
import { isoFromMonthDate } from "./currentReports";

export interface PrimaryCapitalIdentity {
  cik: string; entityName: string; accession: string; form: string; filingDate: string;
  reportDate: string; documentUrl: string; observedAt: string;
}
export interface PrimaryCapitalLocator { start: number; end: number; text: string }
export interface PrimaryCapitalProof {
  coordinateSystem: "original-html-characters";
  statement: PrimaryCapitalLocator; row: PrimaryCapitalLocator;
  period: PrimaryCapitalLocator[]; units: PrimaryCapitalLocator;
  currencyUnit?: PrimaryCapitalLocator;
}
interface PeriodEvidence { periodStart: string; periodEnd: string; currency: string; scale: number; proof: PrimaryCapitalProof }
export interface PrimaryRepurchaseCash extends PeriodEvidence { amount: number }
export interface PrimaryRepurchaseExecution extends PeriodEvidence { shares: number; cost: number }
export interface PrimaryCapitalEvidence {
  version: 1; source: PrimaryCapitalIdentity; cash: PrimaryRepurchaseCash[];
  executions: PrimaryRepurchaseExecution[]; refusals: string[];
}

type Structure = NonNullable<ReturnType<typeof primaryDocumentStructure>>;
type Element = Structure["elements"][number];
const DAY = 86_400_000;
const MONTH = "(?:January|February|March|April|May|June|July|August|September|October|November|December)";
const day = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
const nextDay = (s: string): string => new Date(Date.parse(s) + DAY).toISOString().slice(0, 10);
const annual = (start: string, end: string): boolean => day(start) && day(end) && (Date.parse(end) - Date.parse(start)) / DAY >= 350 && (Date.parse(end) - Date.parse(start)) / DAY <= 380;
const owner = (s: string): string => s.toUpperCase().replace(/\/[A-Z]{2}\//g, "").replace(/\s+AND SUBSIDIARIES$/, "").replace(/[^A-Z0-9]/g, "");

/** Public so retained proof consumers can recheck source metadata without HTML. */
export function validPrimaryCapitalIdentity(source: PrimaryCapitalIdentity): boolean {
  if (!/^\d{1,10}$/.test(source.cik) || Number(source.cik) <= 0 || !owner(source.entityName) ||
      !/^\d{10}-\d{2}-\d{6}$/.test(source.accession) || !/^(?:10-[KQ]|20-F|40-F)(?:\/A)?$/.test(source.form) ||
      !day(source.filingDate) || !day(source.reportDate) || source.reportDate > source.filingDate ||
      !Number.isFinite(Date.parse(source.observedAt)) || source.observedAt.slice(0, 10) < source.filingDate) return false;
  try {
    const url = new URL(source.documentUrl);
    const parts = /^\/Archives\/edgar\/data\/(\d+)\/(\d{18})\/[^/]+\.(?:htm|html)$/i.exec(url.pathname);
    return url.protocol === "https:" && url.hostname === "www.sec.gov" && !url.search && !url.hash && !url.username && !url.password &&
      parts !== null && Number(parts[1]) === Number(source.cik) && parts[2] === source.accession.replaceAll("-", "");
  } catch { return false; }
}

function number(text: string): number | null {
  const t = text.replace(/\s/g, "").replace(/^\$/, "");
  if (/^[—–-]$/.test(t)) return 0;
  if (!/^(?:\((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\)|(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)$/.test(t)) return null;
  return Number(t.replace(/[(),]/g, "")) * (t.startsWith("(") ? -1 : 1);
}

function ancestor(element: Element, tag: string): Element | undefined {
  let node = element.parent;
  while (node && node.tag !== tag) node = node.parent;
  return node;
}

/** Narrow face-statement recovery. Unsupported layouts remain explicit gaps. */
export function primaryCapitalEvidence(document: ParsedDocument, identity: PrimaryCapitalIdentity): PrimaryCapitalEvidence {
  const out: PrimaryCapitalEvidence = { version: 1, source: { ...identity }, cash: [], executions: [], refusals: [] };
  if (!validPrimaryCapitalIdentity(identity)) { out.refusals.push("Invalid primary filing identity or availability date."); return out; }
  const structure = primaryDocumentStructure(document);
  if (!structure) { out.refusals.push("Primary capital statements require balanced, source-bound document markup."); return out; }
  const { elements, text, source } = structure;
  const cashCandidates = new Map<string, number>(), executionCandidates = new Map<string, number>();
  const visible = elements.filter(e => !e.hidden);
  const locator = (e: Element): PrimaryCapitalLocator => ({ start: e.start, end: e.end, text: text(e.start, e.end).slice(0, 600) });
  const rawText = (e: Element): string => decodeEntities(source.slice(e.start, e.end).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  const uniqueById = (tag: string) => {
    const map = new Map<string, Element | null>();
    for (const e of elements.filter(e => e.tag === tag)) {
      const id = e.attrs.get("id");
      if (id) map.set(id, map.has(id) ? null : e);
    }
    return map;
  };
  const units = uniqueById("xbrli:unit"), contexts = uniqueById("xbrli:context");
  const unit = (id: string): { currency: string; node: Element } | null => {
    const node = units.get(id);
    if (!node || elements.some(e => e.start > node.start && e.end < node.end && e.tag === "xbrli:divide")) return null;
    const match = /^iso4217:([A-Z]{3})$/.exec(rawText(node));
    return match ? { currency: match[1]!, node } : null;
  };
  const periodContext = (id: string, start: string, end: string, equity: boolean): boolean => {
    const node = contexts.get(id);
    if (!node) return false;
    const inner = elements.filter(e => e.start > node.start && e.end < node.end);
    const select = (tag: string) => inner.filter(e => e.tag === tag);
    const ids = select("xbrli:identifier"), starts = select("xbrli:startdate"), ends = select("xbrli:enddate");
    if (ids.length !== 1 || !/^\d{1,10}$/.test(rawText(ids[0]!)) || Number(rawText(ids[0]!)) !== Number(identity.cik) ||
        starts.length !== 1 || ends.length !== 1 || rawText(starts[0]!) !== start || rawText(ends[0]!) !== end ||
        inner.some(e => ["xbrli:scenario", "xbrldi:typedmember", "xbrli:instant"].includes(e.tag))) return false;
    const members = select("xbrldi:explicitmember");
    return members.length === 0 || equity && members.length === 1 && members[0]!.attrs.get("dimension") === "us-gaap:StatementEquityComponentsAxis" &&
      /^(?:us-gaap:CommonStockMember|us-gaap:TreasuryStockMember)$/.test(rawText(members[0]!));
  };
  const blocks = visible.filter(e => /^(?:h[1-6]|p|div)$/.test(e.tag) && !e.blockChild && !ancestor(e, "table"));
  const tables = visible.filter(e => e.tag === "table" && !ancestor(e, "table"));
  const cashTitle = /^CONSOLIDATED STATEMENTS? OF CASH FLOWS$/i;
  const equityTitle = /^CONSOLIDATED STATEMENTS? OF (?:(?:CHANGES IN )?(?:STOCKHOLDERS[’']?|SHAREHOLDERS[’']?) |TOTAL )EQUITY$/i;

  for (const [i, heading] of blocks.entries()) {
    const caption = text(heading.start, heading.end);
    const cash = cashTitle.test(caption), equity = equityTitle.test(caption);
    if (!cash && !equity) continue;
    const prior = blocks[i - 1];
    if (!prior || owner(text(prior.start, prior.end)) !== owner(identity.entityName)) continue;
    const table = tables.find(t => t.start >= heading.end);
    if (!table || text(heading.end, table.start).length > 180 || blocks.some(b => b.start > heading.end && b.end < table.start && /STATEMENTS|SCHEDULE/i.test(text(b.start, b.end)))) continue;
    const children = visible.filter(e => e.start > table.start && e.end < table.end);
    if (children.some(e => e.tag === "table" || Number(e.attrs.get("rowspan") ?? 1) !== 1)) { out.refusals.push("Unsupported primary capital table layout."); continue; }
    const rows = children.filter(e => e.tag === "tr" && ancestor(e, "table") === table).map(node => ({
      node, cells: children.filter(e => /^(?:td|th)$/.test(e.tag) && ancestor(e, "tr") === node)
        .map(node => ({ node, text: text(node.start, node.end) })).filter(c => c.text !== "" && c.text !== "$"),
    }));
    const scaleRows = rows.filter(r => /^\((?:(?:USD|EUR|CAD|US dollars) )?[Ii]n (?:millions|thousands)(?:, except (?:common stock )?share data)?\)$/.test(r.cells.map(c => c.text).join(" ")));
    if (scaleRows.length !== 1) continue;
    const scaleRow = scaleRows[0]!, scaleText = text(scaleRow.node.start, scaleRow.node.end);
    const scale = /millions/.test(scaleText) ? 1e6 : 1e3;
    const explicitCurrency = /\((USD|EUR|CAD|US dollars) /i.exec(scaleText)?.[1]?.replace(/US dollars/i, "USD").toUpperCase();

    const proof = (row: Element, periods: Element[], currencyUnit?: Element): PrimaryCapitalProof => ({
      coordinateSystem: "original-html-characters", statement: locator(heading), row: locator(row), period: periods.map(locator), units: locator(scaleRow.node),
      ...(currencyUnit ? { currencyUnit: { start: currencyUnit.start, end: currencyUnit.end, text: rawText(currencyUnit) } } : {}),
    });
    const validateCell = (cell: Element, start: string, end: string, isShares = false): { currency: string; unit?: Element } | null => {
      const facts = children.filter(e => e.tag === "ix:nonfraction" && e.start > cell.start && e.end < cell.end);
      if (facts.length === 0) return explicitCurrency ? { currency: explicitCurrency } : null;
      if (facts.length !== 1) return null;
      const fact = facts[0]!, attrs = fact.attrs;
      if (attrs.get("xsi:nil") === "true" || !/^(?:ixt:num-dot-decimal|ixt:numdotdecimal)?$/.test(attrs.get("format") ?? "") ||
          !periodContext(attrs.get("contextref") ?? "", start, end, equity)) return null;
      if (isShares) {
        const node = units.get(attrs.get("unitref") ?? "");
        return node && rawText(node) === "xbrli:shares" && Number(attrs.get("scale") ?? 0) === 0 ? { currency: "shares" } : null;
      }
      const result = unit(attrs.get("unitref") ?? "");
      return result && (!explicitCurrency || result.currency === explicitCurrency) && 10 ** Number(attrs.get("scale") ?? 0) === scale ? { currency: result.currency, unit: result.node } : null;
    };

    if (cash) {
      const dateRows = rows.filter(r => new RegExp(`^Year(?:s)? Ended (${MONTH} \\d{1,2}),?$`, "i").test(r.cells.map(c => c.text).join(" ")));
      const yearRows = rows.filter(r => r.cells.length > 0 && r.cells.every(c => /^20\d{2}$/.test(c.text)));
      if (dateRows.length !== 1 || yearRows.length !== 1) continue;
      const dateRow = dateRows[0]!, yearRow = yearRows[0]!;
      const monthDay = new RegExp(`(${MONTH} \\d{1,2})`, "i").exec(text(dateRow.node.start, dateRow.node.end))![1]!;
      const years = yearRow.cells.map(c => Number(c.text));
      if (years.length > 4 || new Set(years).size !== years.length) continue;
      for (const row of rows.filter(r => r.cells[0]?.text === "Repurchases of common stock")) {
        if (row.cells.length !== years.length + 1) continue;
        for (const [column, year] of years.entries()) {
          const end = isoFromMonthDate(`${monthDay}, ${year}`), previous = isoFromMonthDate(`${monthDay}, ${year - 1}`);
          if (!end || !previous || end > identity.reportDate) continue;
          cashCandidates.set(end, (cashCandidates.get(end) ?? 0) + 1);
          const start = nextDay(previous), cell = row.cells[column + 1]!, amount = number(cell.text);
          const validated = validateCell(cell.node, start, end);
          if (amount === null || amount >= 0 || !validated || !annual(start, end)) continue;
          out.cash.push({ periodStart: start, periodEnd: end, amount: Number((Math.abs(amount) * scale).toFixed(2)), currency: validated.currency, scale,
            proof: proof(row.node, [dateRow.node, yearRow.node], validated.unit) });
        }
      }
    } else {
      const headers = rows.filter(r => r.cells.length === 6 && r.cells.map(c => c.text).join("|") === "Common Stock|Additional Paid-in Capital|Retained Earnings|Treasury Stock|Non-controlling Interests|Total Equity");
      if (headers.length !== 1) continue;
      const boundary = new RegExp(`^Balances at (${MONTH} \\d{1,2}, \\d{4})(?: \\(.*\\))?$`, "i");
      const boundaries = rows.flatMap((r, index) => {
        const match = boundary.exec(r.cells[0]?.text ?? ""), date = match ? isoFromMonthDate(match[1]!) : null;
        return date ? [{ row: r, index, date }] : [];
      });
      if (boundaries.length < 2 || boundaries.length > 5 || boundaries.some((b, n) => n > 0 && !annual(nextDay(boundaries[n - 1]!.date), b.date))) continue;
      for (let n = 1; n < boundaries.length; n++) {
        const before = boundaries[n - 1]!, after = boundaries[n]!, start = nextDay(before.date), end = after.date;
        if (end > identity.reportDate) continue;
        for (const row of rows.slice(before.index + 1, after.index)) {
          if (row.cells[0]?.text.startsWith("Repurchases of common stock")) executionCandidates.set(end, (executionCandidates.get(end) ?? 0) + 1);
          const sharesMatch = /^Repurchases of common stock \(\s*((?:\d{1,3}(?:,\d{3})+|\d+)) shares\s*\)$/.exec(row.cells[0]?.text ?? "");
          if (!sharesMatch || row.cells.length !== 7) continue;
          const shares = Number(sharesMatch[1]!.replaceAll(",", "")), values = row.cells.slice(1).map(c => number(c.text));
          // Only the treasury-cost movement is supported. NCI and other equity
          // components must be explicitly zero, with a matching total cost.
          if (!Number.isSafeInteger(shares) || shares <= 0 || values.some(v => v === null) ||
              [0, 1, 2, 4].some(i => values[i] !== 0) || values[3]! >= 0 || values[3] !== values[5]) continue;
          const validated = validateCell(row.cells[6]!.node, start, end), shareUnit = validateCell(row.cells[0]!.node, start, end, true);
          if (!validated || !shareUnit) continue;
          out.executions.push({ periodStart: start, periodEnd: end, shares, cost: Number((Math.abs(values[5]!) * scale).toFixed(2)), currency: validated.currency, scale,
            proof: proof(row.node, [before.row.node, after.row.node], validated.unit) });
        }
      }
    }
  }
  // A duplicate statement is ambiguous even when the numbers happen to agree.
  const unique = <T extends { periodEnd: string }>(records: T[], counts: Map<string, number>): T[] => records.filter(r => counts.get(r.periodEnd) === 1);
  if (unique(out.cash, cashCandidates).length !== out.cash.length || unique(out.executions, executionCandidates).length !== out.executions.length) out.refusals.push("Duplicate primary capital rows for the same annual period were withheld.");
  out.cash = unique(out.cash, cashCandidates); out.executions = unique(out.executions, executionCandidates);
  if (out.cash.length === 0) out.refusals.push("No unambiguous annual parent-common cash repurchase row with supported currency and period.");
  if (out.executions.length === 0) out.refusals.push("No unambiguous annual parent-common share and equity-cost pair within explicit annual bounds.");
  return out;
}
