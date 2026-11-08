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
export interface PrimaryRepurchaseExecution extends PeriodEvidence {
  shares: number; cost: number;
  /** Only literal inline concepts from the witnessed cells; absent for plain rows. */
  tags?: { shares?: string; cost?: string };
}
export interface PrimaryRepurchaseCostDisclosure {
  periodStart: string; periodEnd: string; currency: string; amount: number;
  tag: "PaymentsForRepurchaseOfCommonStock";
  definition: "total-cost-including-commissions-and-excise-taxes";
  proof: PrimaryCapitalLocator;
}
export interface PrimaryCapitalEvidence {
  version: 1; source: PrimaryCapitalIdentity; cash: PrimaryRepurchaseCash[];
  executions: PrimaryRepurchaseExecution[]; refusals: string[];
  costDisclosures?: PrimaryRepurchaseCostDisclosure[];
  /** Preserve known-period refusals so later consumers cannot revive an older value. */
  refusedPeriods?: { periodEnd: string; kind: "cash" | "execution"; reason: string }[];
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
  const out: PrimaryCapitalEvidence = { version: 1, source: {
    cik: identity.cik, entityName: identity.entityName, accession: identity.accession, form: identity.form,
    filingDate: identity.filingDate, reportDate: identity.reportDate, documentUrl: identity.documentUrl, observedAt: identity.observedAt,
  }, cash: [], executions: [], refusals: [] };
  if (!validPrimaryCapitalIdentity(identity)) { out.refusals.push("Invalid primary filing identity or availability date."); return out; }
  const structure = primaryDocumentStructure(document);
  if (!structure) { out.refusals.push("Primary capital statements require balanced, source-bound document markup."); return out; }
  const { elements, text, source } = structure;
  const visibilityRefused = elements.some(e => e.tag === "style" && /(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse))/i.test(source.slice(e.start, e.end)) ||
      e.tag === "link" && /(?:^|\s)stylesheet(?:\s|$)/i.test(e.attrs.get("rel") ?? ""));
  if (visibilityRefused) out.refusals.push("Stylesheet-dependent visibility is unsupported for primary capital statement proof.");
  // Continue only to retain applicable annual refusal markers. No values from
  // this presentation may be admitted when its visibility is unproved.
  const cashCandidates = new Map<string, number>(), executionCandidates = new Map<string, number>();
  let cashLayoutRefused = visibilityRefused, equityLayoutRefused = visibilityRefused;
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
    const refuseLayout = () => { if (cash) cashLayoutRefused = true; else equityLayoutRefused = true; };
    const table = tables.find(t => t.start >= heading.end);
    if (!table || text(heading.end, table.start).length > 180 || blocks.some(b => b.start > heading.end && b.end < table.start && /STATEMENTS|SCHEDULE/i.test(text(b.start, b.end)))) { refuseLayout(); continue; }
    const children = visible.filter(e => e.start > table.start && e.end < table.end);
    if (children.some(e => e.tag === "table" || Number(e.attrs.get("rowspan") ?? 1) !== 1 || !/^(?:[1-9]|[1-9]\d)$/.test(e.attrs.get("colspan") ?? "1"))) { refuseLayout(); out.refusals.push("Unsupported primary capital table layout."); continue; }
    const rows = children.filter(e => e.tag === "tr" && ancestor(e, "table") === table).map(node => {
      let column = 0;
      const cells = children.filter(e => /^(?:td|th)$/.test(e.tag) && ancestor(e, "tr") === node).map(node => {
        const start = column; column += Number(node.attrs.get("colspan") ?? 1);
        return { node, text: text(node.start, node.end), columnStart: start, columnEnd: column };
      }).filter(c => c.text !== "" && c.text !== "$");
      return { node, cells };
    });
    const scaleRows = rows.filter(r => /^\((?:(?:USD|EUR|CAD|US dollars) )?[Ii]n (?:millions|thousands)(?:, except (?:common stock )?share data)?\)$/.test(r.cells.map(c => c.text).join(" ")));
    if (scaleRows.length !== 1) { refuseLayout(); continue; }
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
        return node && rawText(node) === "xbrli:shares" && Number(attrs.get("scale") ?? 0) === 0 && !(Number(attrs.get("decimals")) < 0) ? { currency: "shares" } : null;
      }
      const result = unit(attrs.get("unitref") ?? "");
      return result && (!explicitCurrency || result.currency === explicitCurrency) && 10 ** Number(attrs.get("scale") ?? 0) === scale ? { currency: result.currency, unit: result.node } : null;
    };

    if (cash) {
      const dateRows = rows.filter(r => new RegExp(`^Year(?:s)? Ended (${MONTH} \\d{1,2}),?$`, "i").test(r.cells.map(c => c.text).join(" ")));
      const yearRows = rows.filter(r => r.cells.length > 0 && r.cells.every(c => /^20\d{2}$/.test(c.text)));
      if (dateRows.length !== 1 || yearRows.length !== 1) { refuseLayout(); continue; }
      const dateRow = dateRows[0]!, yearRow = yearRows[0]!;
      const monthDay = new RegExp(`(${MONTH} \\d{1,2})`, "i").exec(text(dateRow.node.start, dateRow.node.end))![1]!;
      const years = yearRow.cells.map(c => Number(c.text));
      if (years.length > 4 || new Set(years).size !== years.length) { refuseLayout(); continue; }
      for (const row of rows.filter(r => r.cells[0]?.text === "Repurchases of common stock")) {
        for (const [column, year] of years.entries()) {
          const end = isoFromMonthDate(`${monthDay}, ${year}`), previous = isoFromMonthDate(`${monthDay}, ${year - 1}`);
          if (!end || !previous || end > identity.reportDate) continue;
          cashCandidates.set(end, (cashCandidates.get(end) ?? 0) + 1);
          // A blank or omitted comparative cell still makes this an applicable
          // presentation. Retain its refusal instead of reviving another row.
          if (row.cells.length !== years.length + 1) continue;
          const start = nextDay(previous), cell = row.cells[column + 1]!, amount = number(cell.text);
          const header = yearRow.cells[column]!;
          if (cell.columnStart < header.columnStart || cell.columnEnd > header.columnEnd) continue;
          const validated = validateCell(cell.node, start, end);
          if (amount === null || amount > 0 || !validated || !annual(start, end)) continue;
          out.cash.push({ periodStart: start, periodEnd: end, amount: Number((Math.abs(amount) * scale).toFixed(2)), currency: validated.currency, scale,
            proof: proof(row.node, [dateRow.node, yearRow.node], validated.unit) });
        }
      }
    } else {
      const headers = rows.filter(r => r.cells.length === 6 && r.cells.map(c => c.text).join("|") === "Common Stock|Additional Paid-in Capital|Retained Earnings|Treasury Stock|Non-controlling Interests|Total Equity");
      if (headers.length !== 1) { refuseLayout(); continue; }
      const boundary = new RegExp(`^Balances at (${MONTH} \\d{1,2}, \\d{4})(?: \\(.*\\))?$`, "i");
      const boundaries = rows.flatMap((r, index) => {
        const match = boundary.exec(r.cells[0]?.text ?? ""), date = match ? isoFromMonthDate(match[1]!) : null;
        return date ? [{ row: r, index, date }] : [];
      });
      if (boundaries.length < 2 || boundaries.length > 5 || boundaries.some((b, n) => n > 0 && !annual(nextDay(boundaries[n - 1]!.date), b.date))) { refuseLayout(); continue; }
      for (let n = 1; n < boundaries.length; n++) {
        const before = boundaries[n - 1]!, after = boundaries[n]!, start = nextDay(before.date), end = after.date;
        if (end > identity.reportDate) continue;
        for (const row of rows.slice(before.index + 1, after.index)) {
          if (row.cells[0]?.text.startsWith("Repurchases of common stock")) executionCandidates.set(end, (executionCandidates.get(end) ?? 0) + 1);
          const sharesMatch = /^Repurchases of common stock \(\s*((?:\d{1,3}(?:,\d{3})+|\d+)) shares\s*\)$/.exec(row.cells[0]?.text ?? "");
          if (!sharesMatch || row.cells.length !== 7) continue;
          if (row.cells.slice(1).some((cell, column) => cell.columnStart < headers[0]!.cells[column]!.columnStart || cell.columnEnd > headers[0]!.cells[column]!.columnEnd)) continue;
          const shares = Number(sharesMatch[1]!.replaceAll(",", "")), values = row.cells.slice(1).map(c => number(c.text));
          // Only the treasury-cost movement is supported. NCI and other equity
          // components must be explicitly zero, with a matching total cost.
          if (!Number.isSafeInteger(shares) || shares <= 0 || values.some(v => v === null) ||
              [0, 1, 2, 4].some(i => values[i] !== 0) || values[3]! >= 0 || values[3] !== values[5]) continue;
          const validated = validateCell(row.cells[6]!.node, start, end), shareUnit = validateCell(row.cells[0]!.node, start, end, true);
          if (!validated || !shareUnit) continue;
          const concept = (cell: Element): string | undefined => {
            const name = children.find(e => e.tag === "ix:nonfraction" && e.start > cell.start && e.end < cell.end)?.attrs.get("name");
            return /^us-gaap:([A-Za-z][A-Za-z0-9]+)$/.exec(name ?? "")?.[1];
          };
          const tags = { shares: concept(row.cells[0]!.node), cost: concept(row.cells[6]!.node) };
          out.executions.push({ periodStart: start, periodEnd: end, shares, cost: Number((Math.abs(values[5]!) * scale).toFixed(2)), currency: validated.currency, scale,
            ...(tags.shares || tags.cost ? { tags } : {}),
            proof: proof(row.node, [before.row.node, after.row.node], validated.unit) });
        }
      }
    }
  }
  // A duplicate statement is ambiguous even when the numbers happen to agree.
  const unique = <T extends { periodEnd: string }>(records: T[], counts: Map<string, number>): T[] => records.filter(r => counts.get(r.periodEnd) === 1);
  if (unique(out.cash, cashCandidates).length !== out.cash.length || unique(out.executions, executionCandidates).length !== out.executions.length) out.refusals.push("Duplicate primary capital rows for the same annual period were withheld.");
  out.cash = cashLayoutRefused || out.cash.length > 4 ? [] : unique(out.cash, cashCandidates);
  out.executions = equityLayoutRefused || out.executions.length > 4 ? [] : unique(out.executions, executionCandidates);
  const refused = [
    ...[...cashCandidates.keys()].filter(end => !out.cash.some(r => r.periodEnd === end)).map(periodEnd => ({ periodEnd, kind: "cash" as const, reason: "Unproved or conflicting annual cash repurchase row." })),
    ...[...executionCandidates.keys()].filter(end => !out.executions.some(r => r.periodEnd === end)).map(periodEnd => ({ periodEnd, kind: "execution" as const, reason: "Unproved or conflicting annual share and equity-cost pair." })),
  ].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
  if (refused.length) out.refusedPeriods = refused.slice(0, 24);
  // A bulk Payments tag can be attached to a rounded all-in cost in prose.
  // Prove that actual use in this filing; numerical proximity alone is never
  // a scope bridge for a conflicting normalized cash-flow observation.
  const disclosures: PrimaryRepurchaseCostDisclosure[] = [];
  for (const fact of visible.filter(e => e.tag === "ix:nonfraction" && e.attrs.get("name") === "us-gaap:PaymentsForRepurchaseOfCommonStock")) {
    let paragraph = fact.parent;
    while (paragraph && !/^(?:div|p)$/.test(paragraph.tag)) paragraph = paragraph.parent;
    if (!paragraph || text(paragraph.start, paragraph.end).length > 1500) continue;
    const prefix = text(paragraph.start, fact.start), suffix = text(fact.end, paragraph.end);
    const year = /During fiscal (20\d{2}), (?:the Company|we) repurchased [\d,.]+ (?:million )?shares of (?:its|our) common stock at a total cost, including commissions and excise taxes, of \$$/i.exec(prefix)?.[1];
    const magnitude = /^(million|billion)\b/i.exec(suffix)?.[1]?.toLowerCase();
    const scale = magnitude === "million" ? 1e6 : magnitude === "billion" ? 1e9 : null;
    const amount = number(text(fact.start, fact.end)), currency = unit(fact.attrs.get("unitref") ?? "");
    if (!year || !scale || !currency || amount === null || amount <= 0 || fact.attrs.get("xsi:nil") === "true" ||
        !/^(?:ixt:num-dot-decimal|ixt:numdotdecimal)?$/.test(fact.attrs.get("format") ?? "") || 10 ** Number(fact.attrs.get("scale") ?? 0) !== scale) continue;
    const period = out.cash.find(c => c.periodEnd.startsWith(year) && c.currency === currency.currency && periodContext(fact.attrs.get("contextref") ?? "", c.periodStart, c.periodEnd, false));
    if (!period) continue;
    disclosures.push({ periodStart: period.periodStart, periodEnd: period.periodEnd, currency: currency.currency, amount: Number((amount * scale).toFixed(2)),
      tag: "PaymentsForRepurchaseOfCommonStock", definition: "total-cost-including-commissions-and-excise-taxes", proof: locator(paragraph) });
  }
  const disclosurePeriods = [...new Set(disclosures.map(d => d.periodEnd))];
  const resolvedDisclosures = disclosurePeriods.flatMap(end => {
    const matches = disclosures.filter(d => d.periodEnd === end);
    return new Set(matches.map(d => `${d.currency}|${d.amount}`)).size === 1 ? [matches[0]!] : [];
  });
  if (resolvedDisclosures.length) out.costDisclosures = resolvedDisclosures;
  if (out.cash.length === 0) out.refusals.push("No unambiguous annual parent-common cash repurchase row with supported currency and period.");
  if (out.executions.length === 0) out.refusals.push("No unambiguous annual parent-common share and equity-cost pair within explicit annual bounds.");
  return out;
}
