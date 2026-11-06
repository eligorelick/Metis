import "server-only";
import { createHash } from "node:crypto";
import { htmlToText } from "@/edgar/extract";
import type { FetchResult } from "@/types/core";
import type { EdgarClient } from "@/providers/edgar";

/** A source excerpt, not a normalized compensation or holdings dataset. */
export interface PublicGovernanceExcerpt {
  caption: string;
  text: string;
  /** Length of this selected source block, not the whole proxy statement. */
  originalChars: number;
  /** Exact raw-document offsets; sourceHash identifies the document. */
  span: { start: number; end: number; html: string };
}

export interface PublicGovernanceEvidence {
  cik: string;
  accession: string;
  form: "DEF 14A";
  filingDate: string;
  /** Preserved when supplied by SEC; never inferred from the compensation year. */
  reportDate: string | null;
  documentUrl: string;
  observedAt: string;
  sourceHash: string;
  compensation: PublicGovernanceExcerpt | null;
  beneficialOwnership: PublicGovernanceExcerpt | null;
  notes: string[];
}

interface Element {
  tag: string;
  attrs: Map<string, string>;
  start: number;
  openEnd: number;
  end: number;
  parent?: Element;
  hidden: boolean;
}
const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const RAW_TAGS = new Set(["script", "style", "textarea", "title"]);
const CAPTION_TAG = /^(?:h[1-6]|p|div|span|b|strong|caption|td|th)$/;
const COMPENSATION_CAPTION = /^(?:(?:fiscal\s+)?20\d{2}\s+)?summary\s+compensation\s+table(?:\s+(?:for\s+)?(?:fiscal\s+)?20\d{2})?\s*[:.]?$/i;
const OWNERSHIP_CAPTION = /^(?:(?:security|stock|share)\s+ownership(?:\s+of\s+(?:certain\s+)?beneficial\s+owners?(?:\s+and\s+management)?)?|beneficial\s+ownership(?:\s+of\s+(?:our\s+)?(?:common\s+stock|shares))?|principal\s+(?:stockholders|shareholders))\s*[:.]?$/i;
const amount = (value: string): boolean => /^(?:[$€£]\s*)?\(?\d[\d,]*(?:\.\d+)?\)?\s*%?(?:\s*\(\d+\))?$/.test(value);
const isoDay = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const normalizedCik = (value: string): string | null => /^\d{1,10}$/.test(value) && Number(value) > 0 ? value.padStart(10, "0") : null;

function attributes(source: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const match of source.matchAll(/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    out.set(match[1]!.toLowerCase(), match[2] ?? match[3] ?? match[4] ?? "");
  }
  return out;
}

/** Bounded lexical structure: unsupported/malformed markup declines evidence. */
function elementsOf(html: string): Element[] | null {
  if (html.length > 20_000_000) return null;
  const elements: Element[] = [], stack: Element[] = [];
  const tags = /<!--[\s\S]*?-->|<!doctype\b[^>]*>|<\/?([A-Za-z][A-Za-z0-9:._-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
  let match: RegExpExecArray | null;
  while ((match = tags.exec(html)) !== null) {
    if (!match[1]) continue;
    const tag = match[1].toLowerCase();
    if (match[0].startsWith("</")) {
      const node = stack.pop();
      if (!node || node.tag !== tag) return null;
      node.end = tags.lastIndex;
      continue;
    }
    const attrs = attributes(match[0].slice(match[0].indexOf(match[1]) + match[1].length, -1));
    const parent = stack.at(-1);
    const hidden = parent?.hidden === true || attrs.has("hidden") || attrs.get("aria-hidden")?.toLowerCase() === "true" ||
      /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse))\b/i.test(attrs.get("style") ?? "") ||
      /^(?:head|script|style|template|noscript|ix:header|ix:hidden)$/.test(tag);
    const node: Element = { tag, attrs, start: match.index, openEnd: tags.lastIndex, end: tags.lastIndex, parent, hidden };
    elements.push(node);
    if (elements.length > 120_000) return null;
    if (RAW_TAGS.has(tag)) {
      const close = new RegExp(`</${tag}\\s*>`, "gi");
      close.lastIndex = tags.lastIndex;
      if (!close.exec(html)) return null;
      node.end = close.lastIndex;
      tags.lastIndex = close.lastIndex;
    } else if (!VOID_TAGS.has(tag) && !/\/\s*>$/.test(match[0])) stack.push(node);
  }
  return stack.length === 0 ? elements : null;
}

function ancestor(node: Element | undefined, tag: string): Element | undefined {
  for (; node; node = node.parent) if (node.tag === tag) return node;
  return undefined;
}

function excerptTables(html: string, elements: Element[], family: "compensation" | "ownership"): PublicGovernanceExcerpt | null {
  const hidden = elements.filter(node => node.hidden && !node.parent?.hidden);
  const text = (start: number, end: number): string => {
    let cursor = start;
    const parts: string[] = [];
    for (const node of hidden) {
      if (node.end <= start || node.start >= end) continue;
      parts.push(html.slice(cursor, Math.max(cursor, node.start)));
      cursor = Math.max(cursor, Math.min(end, node.end));
    }
    parts.push(html.slice(cursor, end));
    return htmlToText(parts.join(" "));
  };
  const visible = elements.filter(node => !node.hidden);
  const tables = visible.filter(node => node.tag === "table");
  const heading = (node: Element): boolean => /^h[1-6]$/.test(node.tag) ||
    /^(?:p|div)$/.test(node.tag) && /(?:^|;)\s*font-weight\s*:\s*(?:bold|[6-9]00)\b/i.test(node.attrs.get("style") ?? "") ||
    /^(?:p|div|span|b|strong)$/.test(node.tag) && node.end - node.start <= 1_000 &&
      /^(?:director compensation|pay versus performance|compensation actually paid|compensation discussion and analysis|outstanding equity awards|grants of plan.based awards|option exercises and stock vested)\s*[:.]?$/i.test(text(node.start, node.end));
  const captions = visible.filter(node => CAPTION_TAG.test(node.tag) && node.end - node.start <= 4_000 && !ancestor(node, "a"))
    .filter(node => !/<a\b[^>]*\bhref\s*=/i.test(html.slice(node.start, node.end)))
    .filter(node => (family === "compensation" ? COMPENSATION_CAPTION : OWNERSHIP_CAPTION).test(text(node.start, node.end)));
  const candidates = new Map<number, PublicGovernanceExcerpt>();
  for (const caption of captions) {
    const containing = ancestor(caption, "table");
    const table = containing ?? tables.find(candidate => candidate.start >= caption.end);
    if (!table || table.end - table.start > 400_000 || tables.some(other => other !== table && other.start > table.start && other.end < table.end)) continue;
    if (!containing && (table.start - caption.end > 20_000 || text(caption.end, table.start).length > 2_500 ||
      visible.some(node => heading(node) && node.start >= caption.end && node.end <= table.start))) continue;
    const rows = visible.filter(node => node.tag === "tr" && ancestor(node, "table") === table);
    const cells = rows.map(row => visible.filter(node => /^(?:td|th)$/.test(node.tag) && ancestor(node, "tr") === row)
      .map(node => text(node.start, node.end)).filter(Boolean));
    if (cells.length < 2 || cells.length > 160) continue;
    const header = cells.slice(0, 4).map(row => row.join(" ")).join(" ");
    const recognized = family === "compensation"
      ? /\bname\b/i.test(header) && /\byear\b/i.test(header) && /\b(?:salary|stock awards?)\b/i.test(header) && /\btotal\b/i.test(header) &&
        cells.some(row => row.length >= 3 && /[A-Za-z]{2}/.test(row[0]!) && row.slice(1).some(cell => /^20\d{2}$/.test(cell)) && row.slice(1).some(cell => amount(cell) && !/^20\d{2}$/.test(cell)))
      : /\bname\b/i.test(header) && /\b(?:beneficial(?:ly)?\s+own(?:ed|er)|ownership)\b/i.test(header) && /\b(?:shares?|stock)\b/i.test(header) && /percent|%/i.test(header) &&
        cells.some(row => row.length >= 3 && /[A-Za-z]{2}/.test(row[0]!) && row.slice(1).filter(amount).length >= 2);
    if (!recognized) continue;
    let start = containing ? table.start : caption.start;
    if (containing) {
      // An internal caption must not detach the table from its preceding
      // units, currency or as-of paragraph. Keep the bounded local preface;
      // a preceding table without a separating heading is ambiguous.
      const previousHeading = visible.filter(node => heading(node) && node.end <= table.start).at(-1);
      const previousTable = tables.filter(node => node.end <= table.start).at(-1);
      const boundary = previousHeading?.start ?? visible.find(node => node.tag === "body")?.openEnd ?? 0;
      if (previousTable && previousTable.end > boundary) continue;
      if (table.start - boundary > 20_000 || text(boundary, table.start).length > 2_500) continue;
      start = boundary;
    }
    const nextHeading = visible.find(node => heading(node) && node.start >= table.end);
    const nextTable = tables.find(node => node.start >= table.end);
    const end = Math.min(nextHeading?.start ?? html.length, nextTable?.start ?? html.length);
    const body = text(start, end);
    // Do not publish a clipped financial row or silently omit local qualifiers.
    if (body.length > 20_000 || body.length < 80) continue;
    candidates.set(table.start, { caption: text(caption.start, caption.end), text: body, originalChars: body.length,
      span: { start, end, html: html.slice(start, end) } });
  }
  // Continued, duplicated or conflicting tables require a richer parser.
  return candidates.size === 1 ? [...candidates.values()][0]! : null;
}

function oldestDate(today: string): string {
  const date = new Date(`${today}T00:00:00Z`);
  const month = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 18, 1));
  const lastDay = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
  month.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return month.toISOString().slice(0, 10);
}

/** Stop waiting and prevent subsequent calls; the supplied client's transport owns HTTP cancellation. */
function cancellable<T>(read: () => Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    read().then(value => { signal.removeEventListener("abort", abort); resolve(value); }, error => { signal.removeEventListener("abort", abort); reject(error); });
  });
}

/**
 * One submissions read plus one exact issuer-admitted primary DEF 14A read.
 * The SEC transport supplies identity, caching, pacing and body-size limits.
 * This recovers research text only: it cannot establish normalized annual pay,
 * exhaustive institutional ownership, 13F flow metrics or current officer roles.
 */
export async function collectPublicGovernance(
  edgar: EdgarClient,
  cik: string,
  today: string,
  opts: { now?: () => Date; signal?: AbortSignal } = {},
): Promise<FetchResult<PublicGovernanceEvidence>> {
  const issuer = normalizedCik(cik);
  const attempted: string[] = [];
  const gap = (reason: string): FetchResult<PublicGovernanceEvidence> => ({ ok: false, gap: {
    field: "edgar.publicGovernance", reason, severity: "warn", attemptedSources: attempted,
  } });
  if (!issuer || !isoDay(today)) return gap("Public governance evidence requires a valid issuer CIK and analysis date.");
  const signal = opts.signal ? AbortSignal.any([opts.signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000);
  try {
    signal.throwIfAborted();
    attempted.push(`https://data.sec.gov/submissions/CIK${issuer}.json`);
    const submissions = await cancellable(() => edgar.submissions(issuer), signal);
    if (!submissions.ok) return gap(`Public governance submissions unavailable: ${submissions.gap.reason}`);
    if (normalizedCik(String(submissions.value.data.cik)) !== issuer) return gap("Public governance submissions issuer does not match the requested CIK.");
    const available = submissions.value.data.recentFilings.filter(filing => isoDay(filing.filingDate) && filing.filingDate <= today);
    const proxies = available.filter(filing => filing.form === "DEF 14A").sort((a, b) => b.filingDate.localeCompare(a.filingDate));
    const filing = proxies[0];
    if (!filing) return gap("No eligible DEF 14A among recent SEC submissions at the analysis date; older overflow pages were not searched.");
    if (filing.filingDate < oldestDate(today)) return gap("Latest DEF 14A is older than eighteen months; current governance evidence remains unavailable.");
    if (proxies.filter(other => other.filingDate === filing.filingDate).length !== 1 ||
      available.some(other => /^(?:DEF 14A\/A|DEFR14A)$/.test(other.form) && other.filingDate >= filing.filingDate)) {
      return gap("Amended or competing DEF 14A scopes require reconciliation; no proxy table was selected.");
    }
    const problem = edgar.filingProblem(issuer, filing);
    if (problem || !/^[A-Za-z0-9_.-]+\.html?$/i.test(filing.primaryDocument)) return gap(`Public governance filing metadata refused: ${problem ?? "unsupported primary document path"}`);
    const expected = `https://www.sec.gov/Archives/edgar/data/${Number(issuer)}/${filing.accessionNumber.replaceAll("-", "")}/${filing.primaryDocument}`;
    attempted.push(expected);
    const document = await cancellable(() => edgar.fetchFilingDocument(issuer, filing, { asOf: filing.filingDate }), signal);
    if (!document.ok) return gap(`Public governance primary document unavailable: ${document.gap.reason}`);
    if (document.value.source !== "edgar" || document.value.endpoint !== expected) return gap("Public governance document URL does not match the issuer's admitted accession and primary document.");
    signal.throwIfAborted();
    const html = document.value.data;
    const elements = elementsOf(html);
    if (!elements) return gap("Public governance document structure is malformed or exceeds the bounded parser budget.");
    const declaredIssuers = elements.filter(node => node.attrs.get("name")?.toLowerCase() === "dei:entitycentralindexkey")
      .map(node => normalizedCik(htmlToText(html.slice(node.openEnd, node.end))));
    if (declaredIssuers.some(declared => declared !== issuer)) return gap("Public governance document declares a different or malformed issuer CIK.");
    const compensation = excerptTables(html, elements, "compensation");
    const beneficialOwnership = excerptTables(html, elements, "ownership");
    if (!compensation && !beneficialOwnership) return gap("No unique source-owned summary compensation or beneficial-ownership caption and substantive table were established in the selected DEF 14A.");
    signal.throwIfAborted();
    const notes = [
      "These are selected as-filed proxy excerpts, not normalized per-officer compensation records or a complete governance review. Table dates and fiscal years remain the filing's own wording; filing date is not the compensation period or evidence of current office.",
      "Beneficial-ownership disclosures are not an exhaustive 13F institutional aggregation: they cannot establish total institutional ownership, investor counts, top-holder rankings, position changes or put/call ratios.",
      "Excerpts retain the table and adjacent prose up to the next table or heading; separately placed footnotes and other proxy sections may require reading the linked filing.",
      ...(!compensation ? ["Annual summary compensation table evidence is unavailable or ambiguous in this selected filing."] : []),
      ...(!beneficialOwnership ? ["Beneficial-ownership table evidence is unavailable or ambiguous in this selected filing."] : []),
    ];
    return { ok: true, value: {
      source: "edgar", endpoint: expected, asOf: filing.filingDate, fetchedAt: document.value.fetchedAt,
      ...(document.value.stale === true || submissions.value.stale === true ? { stale: true } : {}),
      data: { cik: issuer, accession: filing.accessionNumber, form: "DEF 14A", filingDate: filing.filingDate,
        reportDate: filing.reportDate || null, documentUrl: expected, observedAt: (opts.now ?? (() => new Date()))().toISOString(),
        sourceHash: createHash("sha256").update(html).digest("hex"), compensation, beneficialOwnership, notes },
    } };
  } catch (error) {
    return gap(signal.aborted ? "Public governance acquisition was cancelled or exceeded its time budget."
      : `Public governance acquisition failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
