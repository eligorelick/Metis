/**
 * 10-K / 10-Q section extraction — the 4-layer algorithm.
 *
 * Research basis (live-verified across AAPL, JPM, BAC, WFC, C, MXC, FRD,
 * Seneca; failure modes F1–F25):
 *   - the EDGAR extraction contract
 *   - the EDGAR extraction contract (layered decision rule)
 *   - the bank-filing extraction contract (bank modes, F15–F25)
 *
 * Layers:
 *   0. Citi mode — zero item headers anywhere; FORM 10-K CROSS-REFERENCE INDEX
 *      maps items → page ranges (possibly NON-contiguous); slice via the
 *      contents TOC whose link text is the page number (F20/F21).
 *   1. Row-scoped TOC-anchor slicing — merge fragmented adjacent same-href <a>
 *      runs (F1), dedupe shared targets (F2), bind item-number cell to the row
 *      title link (F3); targets may be <div id>, <span id> or <a name>.
 *   2. Hardened header regex on stripped text — optional interposed run before
 *      the title (BAC F15), cross-reference rejection (F7/F7b/F16), monotonic
 *      item ordering; LAST surviving match.
 *   3. MANDATORY stub detector (<2,500 chars OR incorporation phrasing in the
 *      first 400 chars) with redirects: same-doc mini-TOC (JPM), exhibit
 *      redirect signal targeting EX-13* (WFC/FRD; MD&A synonym "Financial
 *      Review"; quoted section names parsed from the stub), 10-Q Part II
 *      Item 1A → unchanged-from-10-K marker.
 *   4. Loud hard-fail — a stub is NEVER returned silently.
 *
 * This module is pure (no network). Exhibit redirects surface as a typed
 * error carrying everything the caller needs to fetch the EX-13 sibling via
 * providers/edgar.ts (filingIndexHeaders TYPE map — never filename/size, F17)
 * and finish with extractFromExhibit().
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SectionSpec {
  form: "10-K" | "10-Q" | "20-F" | "40-F";
  /**
   * 10-K: "1" (Business), "1A" (Risk Factors), "7" (MD&A), "8" (Financial
   *       Statements and Supplementary Data) or "15" (Exhibits and Financial
   *       Statement Schedules, where some filers place the statements; D-66).
   * 10-Q: "1" = Part I Item 1 (Financial Statements and their notes),
   *       "2" = Part I Item 2 (MD&A), "1A" = Part II Item 1A (Risk Factors),
   *       "5" = Part II Item 5 (Other Information: Rule 10b5-1 arrangements; D-66).
   * 20-F: "3D" (Risk Factors), "4" (Information on the Company) or "5"
   *       (Operating and Financial Review).
   */
  item: "1" | "1A" | "7" | "8" | "15" | "2" | "3D" | "4" | "5";
  /** 10-Q only; defaults: items "1" and "2" → part 1, item "1A" → part 2. */
  part?: 1 | 2;
}

export type ExtractMethod =
  | "toc-anchor"
  | "toc-title"
  | "header-regex"
  | "mini-toc-redirect"
  | "page-header-redirect"
  | "structured-item"
  | "reference-table-redirect"
  | "reference-table-pages"
  | "linked-index-redirect"
  | "annual-notes-index-redirect"
  | "crossref-toc"
  | "exhibit-toc"
  | "exhibit-header"
  | "unchanged-from-10k";

export interface ExtractDiagnostics {
  layersTried: string[];
  tocEntryCount: number;
  itemEntryCount: number;
  notes: string[];
  stub?: { chars: number; excerpt: string };
}

export type ExtractionErrorKind = "no_section_found" | "stub_detected" | "not_required" | "exhibit_redirect" | "unresolved_reference";

export interface ExhibitRedirect {
  /** Section titles quoted inside the stub (e.g. "Financial Review"). */
  quotedTitles: string[];
  /** Exhibit TYPE prefix to resolve via the index-headers TYPE map. */
  exhibitTypePrefix: "EX-13";
  section: SectionKind;
  stubText: string;
}

export class ExtractionError extends Error {
  constructor(
    readonly kind: ExtractionErrorKind,
    message: string,
    readonly exhibit?: ExhibitRedirect,
  ) {
    super(message);
    this.name = "ExtractionError";
  }
}

export type ExtractResult =
  | {
      ok: true;
      text: string;
      method: ExtractMethod;
      chars: number;
      /** Set when 10-Q Part II Item 1A merely refers back to the 10-K. */
      marker?: "unchanged_from_10k";
      diagnostics: ExtractDiagnostics;
    }
  | { ok: false; error: ExtractionError; diagnostics: ExtractDiagnostics };

export interface ParsedDocument {
  pre: string;
  entries: TocEntry[];
  fullText: string;
}

// The full source is kept only while its parsed acquisition document is alive.
// It is not part of retained sections or serialized analyst text.
const originalDocuments = new WeakMap<ParsedDocument, string>();

/** The actual periodic-filing signature block, not a role mentioned in prose. */
export function periodicSignatureText(fullText: string): string | null {
  const headings = [...fullText.matchAll(/\bSIGNATURES\b/g)];
  const heading = headings.at(-1);
  if (heading === undefined) return null;
  const text = fullText.slice(heading.index).trim();
  if (text.length > 2_500 || !/the registrant has duly caused this Quarterly Report on Form 10-Q to be signed on its behalf/i.test(text) ||
      !/\bDate:\s*(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b/.test(text) ||
      !/\/s\/\s+[A-Z][A-Za-z .'-]{2,100}\s+Chief Financial Officer\b/.test(text)) return null;
  return text;
}

/** Part I Item 4 contains the current controls conclusion and its limits. */
export function periodicControlsText(fullText: string): string | null {
  const headings = [...fullText.matchAll(/\bItem\s+4\.?\s+Controls and Procedures\b/gi)];
  const heading = headings.at(-1);
  if (heading === undefined) return null;
  const rest = fullText.slice(heading.index);
  // A reference to "Part II, Item 1A" inside the controls discussion is not
  // its end. Require the actual following legal-proceedings item heading.
  const end = /\bPART\s+II\s*[-—–:]?\s*(?:OTHER INFORMATION\s+)?Item\s+1\.?\s+Legal Proceedings\b/i.exec(rest);
  const text = rest.slice(0, end?.index ?? rest.length).trim();
  return text.length <= 12_000 && /\b(?:disclosure controls and procedures|internal control over financial reporting)\b/i.test(text) ? text : null;
}

export interface ExtractOptions {
  /** Stub threshold; default 2,500 chars (stubs observed 252–399; real sections ≥18k). */
  stubMinChars?: number;
  /**
   * Pre-computed hidden-block-stripped/TOC/full-text structure from
   * `parseDocument(html)`. Callers extracting MULTIPLE sections from the SAME
   * fetched document (e.g. Item 1A + Item 7 of one 10-K) should parse once and
   * pass the result here instead of letting each call re-derive it — the parse
   * step is the expensive part of extraction on large filings. Must be derived
   * from the SAME `html` passed to this call; behavior is undefined otherwise.
   * Purely a performance option — output is identical whether supplied or not.
   */
  preparsed?: ParsedDocument;
  /** Absolute Date.now() deadline for the optional annual recovery work. */
  recoveryDeadlineMs?: number;
}

export type SectionKind = "mdna" | "riskFactors" | "business" | "financialStatements" | "otherInformation";

// ---------------------------------------------------------------------------
// Text utilities (exported for tests)
// ---------------------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  bull: "•",
  sect: "§",
  reg: "®",
  copy: "©",
  trade: "™",
};

/** Decode numeric (&#8217; / &#x2019;) and common named HTML entities. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const cp = Number.parseInt(body.slice(2), 16);
      return Number.isNaN(cp) ? whole : safeFromCodePoint(cp, whole);
    }
    if (body.startsWith("#")) {
      const cp = Number.parseInt(body.slice(1), 10);
      return Number.isNaN(cp) ? whole : safeFromCodePoint(cp, whole);
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? whole;
  });
}

function safeFromCodePoint(cp: number, fallback: string): string {
  try {
    return String.fromCodePoint(cp);
  } catch {
    return fallback;
  }
}

/**
 * Remove iXBRL hidden content BEFORE any char counting (F13): <ix:header> /
 * <ix:hidden> blocks and inline style="display:none" elements (balanced scan;
 * self-closing tags handled).
 */
export function stripHiddenBlocks(html: string): string {
  const out = html
    .replace(/<ix:header\b[\s\S]*?<\/ix:header>/gi, " ")
    .replace(/<ix:hidden\b[\s\S]*?<\/ix:hidden>/gi, " ");

  // Match every spelling a filer may legitimately emit, not just the
  // double-quoted all-lowercase one:
  //   - the value quoted with " or ', or unquoted;
  //   - any casing of the `style` attribute and of `display`/`none` (the `i`
  //     flag), with optional whitespace around the colon;
  //   - `display:none` anywhere in a semicolon-separated declaration list;
  //   - namespaced/hyphenated tag names (`ix:nonFraction`), whose names were
  //     previously truncated at the colon so iXBRL hidden blocks survived.
  // The leading `\s` before `style` keeps `data-style="display:none"` — a
  // decoy attribute on VISIBLE content — from being treated as hidden.
  // `display` must also START a declaration (value start, or after `;`/space),
  // so a property that merely ENDS in it — `--display:none`, `mso-display:none`
  // — cannot match. Those do not hide anything, and since the scan below
  // deletes through the matching close tag, one false positive on a wrapper
  // <div> would silently drop a whole visible section of the filing.
  const openRe = new RegExp(
    `<([a-zA-Z][a-zA-Z0-9:._-]*)\\b[^>]*\\sstyle\\s*=\\s*(?:` +
      `"(?:[^"]*[;\\s])?display\\s*:\\s*none[^"]*"` +
      `|'(?:[^']*[;\\s])?display\\s*:\\s*none[^']*'` +
      `|(?:[^\\s>"']*;)?display\\s*:\\s*none[^\\s>]*` +
      `)[^>]*>`,
    "gi",
  );
  const parts: string[] = [];
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(out)) !== null) {
    if (m.index < cursor) continue;
    parts.push(out.slice(cursor, m.index), " ");
    const tag = m[1].toLowerCase();
    const openEnd = m.index + m[0].length;
    if (/\/\s*>$/.test(m[0])) {
      cursor = openEnd;
      continue;
    }
    // Balanced scan for the matching close tag. The tag name is escaped: the
    // name class admits `.`, which is a regex metacharacter and would otherwise
    // let one tag's scan match a different tag.
    const tagRe = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const scanRe = new RegExp(`<${tagRe}\\b[^>]*?(/?)>|</${tagRe}\\s*>`, "gi");
    scanRe.lastIndex = openEnd;
    let depth = 1;
    let end = -1;
    let s: RegExpExecArray | null;
    while ((s = scanRe.exec(out)) !== null) {
      if (s[0].startsWith("</")) {
        depth--;
        if (depth === 0) {
          end = s.index + s[0].length;
          break;
        }
      } else if (s[1] !== "/") {
        depth++;
      }
    }
    if (end === -1) {
      // Unbalanced — drop just the open tag to avoid deleting the document.
      cursor = openEnd;
    } else {
      cursor = end;
    }
  }
  if (parts.length === 0) return out;
  parts.push(out.slice(cursor));
  return parts.join("");
}

/** Tags → spaces, entities decoded, whitespace collapsed. */
export function htmlToText(html: string): string {
  const noBlocks = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ");
  const noTags = noBlocks.replace(/<[^>]*>/g, " ");
  return decodeEntities(noTags)
    .replace(/\s+/g, " ")
    .trim();
}

/** Lowercase, unify apostrophes/dashes/whitespace, strip trailing punctuation. */
export function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’`]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/&/g, "and")
    .replace(/\s+/g, " ")
    .replace(/[.,:;"“”']+$/g, "")
    .replace(/^["“”']+/g, "")
    .trim();
}

export function isAllCaps(s: string): boolean {
  const letters = s.replace(/[^a-zA-Z]/g, "");
  return letters.length >= 3 && letters === letters.toUpperCase();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Anchor & TOC parsing
// ---------------------------------------------------------------------------

export interface MergedAnchor {
  target: string;
  text: string;
  /** Raw-HTML index of the first fragment. */
  index: number;
}

/**
 * Collect <a href="#..."> anchors, merging ADJACENT same-target runs (F1:
 * Workiva fragments one logical link across several <a> elements). Runs are
 * merged only when the gap contains no visible text and no cell boundary, so
 * separate item-number/title links in different cells stay distinct.
 */
export function mergedAnchors(html: string): MergedAnchor[] {
  const re = /<a\b[^>]*href\s*=\s*(?:"#([^"]*)"|'#([^']*)')[^>]*>([\s\S]*?)<\/a>/gi;
  const raw: { target: string; text: string; index: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    raw.push({ target: m[1] ?? m[2] ?? "", text: htmlToText(m[3]), index: m.index, end: m.index + m[0].length });
  }
  const out: MergedAnchor[] = [];
  let lastEnd = -1;
  for (const a of raw) {
    const prev = out.length > 0 ? out[out.length - 1] : null;
    if (prev !== null && prev.target === a.target && lastEnd >= 0) {
      // True fragmentation ("Item 1" + "C" + ".") has NOTHING between the <a>
      // elements — no text, no entities, no cell boundary. Separate item/title
      // links to the same target (JPM main TOC) sit in different cells or have
      // spacing text between them, so they stay distinct.
      const gap = html.slice(lastEnd, a.index);
      const gapClean = gap.replace(/<[^>]*>/g, "");
      if (gap.length < 400 && gapClean.trim() === "" && !/&#?\w+;/.test(gapClean) && !/<\/?t[dh]\b/i.test(gap)) {
        prev.text = `${prev.text}${a.text}`.replace(/\s+/g, " ").trim();
        lastEnd = a.end;
        continue;
      }
    }
    out.push({ target: a.target, text: a.text, index: a.index });
    lastEnd = a.end;
  }
  return out;
}

/** Locate an anchor target: <div id>, <span id>, <a name>, etc. Returns tag-start index or -1. */
export function resolveAnchor(html: string, target: string): number {
  for (const pat of [`id="${target}"`, `id='${target}'`, `name="${target}"`, `name='${target}'`]) {
    const at = html.indexOf(pat);
    if (at !== -1) {
      const tagStart = html.lastIndexOf("<", at);
      return tagStart !== -1 ? tagStart : at;
    }
  }
  return -1;
}

export interface TocEntry {
  /** Normalized item number ("1A", "7") when the row carries one. */
  item?: string;
  title: string;
  target: string;
  /** 1|2 when a PART I/II marker row preceded this entry (10-Q); else null. */
  part: 1 | 2 | null;
  /** Raw-HTML position of the row (or anchor for standalone entries). */
  rowIndex: number;
  /** Printed page number when the row exposes one (Citi/WFC-style TOCs). */
  pageNo?: number;
}

const ITEM_CELL_RE = /^item\s+(\d{1,2}(?:\s*\.?\s*[a-dA-D])?)\s*[.:]?$/i;
const PART_ROW_RE = /^part\s+(i{1,3}|iv|[12])\b/i;

function normItem(s: string): string {
  return s.replace(/[.\s]/g, "").toUpperCase();
}

function partFromMarker(s: string): 1 | 2 | null {
  const u = s.toUpperCase();
  if (u === "I" || u === "1") return 1;
  if (u === "II" || u === "2") return 2;
  return null;
}

/**
 * Row-scoped TOC parse (F2/F3/F21): one entry per distinct anchor in a row;
 * the item-number cell binds to the row's first anchor; titles come from the
 * anchor text or the nearest non-numeric cell; page numbers from numeric link
 * text or numeric cells. A whole-document pass over item-numbered anchor text
 * (AAPL style) fills anything rows missed.
 */
export function parseTocEntries(html: string): TocEntry[] {
  const entries: TocEntry[] = [];
  const seenRowTargets = new Set<string>();
  let currentPart: 1 | 2 | null = null;

  const rowRe = /<tr\b[\s\S]*?<\/tr>/gi;
  let row: RegExpExecArray | null;
  while ((row = rowRe.exec(html)) !== null) {
    const rowHtml = row[0];
    const quickAnchor = rowHtml.includes('href="#') || rowHtml.includes("href='#");
    const quickPart = /part(?:&#160;|&nbsp;|\s|<[^>]*>)+(?:i|1)/i.test(rowHtml);
    if (!quickAnchor && !quickPart) continue;

    // Cells with their raw-HTML spans so anchors can be bound by ADJACENCY —
    // one <tr> may carry several TOC entries and cell order varies (F21).
    const cells: { start: number; end: number; text: string }[] = [];
    const cellRe = /<t[dh]\b[^>]*\/>|<t[dh]\b[^>]*>[\s\S]*?<\/t[dh]>/gi;
    let c: RegExpExecArray | null;
    while ((c = cellRe.exec(rowHtml)) !== null) cells.push({ start: c.index, end: c.index + c[0].length, text: htmlToText(c[0]).trim() });
    const rowText = cells.length > 0 ? cells.map((x) => x.text).join(" ").replace(/\s+/g, " ").trim() : htmlToText(rowHtml);

    const partM = PART_ROW_RE.exec(rowText);
    if (partM !== null) {
      const p = partFromMarker(partM[1]);
      if (p !== null) currentPart = p;
    }

    const anchors = mergedAnchors(rowHtml);
    if (anchors.length === 0) continue;

    // Item number from a dedicated cell (binds to the row's FIRST anchor).
    let rowItem: string | undefined;
    for (const cell of cells) {
      const im = ITEM_CELL_RE.exec(cell.text);
      if (im !== null) {
        rowItem = normItem(im[1]);
        break;
      }
    }

    const isNumericText = (t: string): boolean => /^\d{1,4}$/.test(t);
    const isTitleText = (t: string): boolean => t !== "" && !isNumericText(t) && ITEM_CELL_RE.exec(t) === null;
    const cellIndexOf = (pos: number): number => cells.findIndex((cell) => pos >= cell.start && pos < cell.end);
    /** Nearest cell (own, then left/right alternating) whose text satisfies pred. */
    const nearestCellText = (fromIdx: number, pred: (t: string) => boolean): string | undefined => {
      if (fromIdx === -1) return cells.find((cell) => pred(cell.text))?.text;
      if (pred(cells[fromIdx].text)) return cells[fromIdx].text;
      for (let d = 1; d < cells.length; d++) {
        const left = fromIdx - d;
        const right = fromIdx + d;
        if (left >= 0 && pred(cells[left].text)) return cells[left].text;
        if (right < cells.length && pred(cells[right].text)) return cells[right].text;
      }
      return undefined;
    };

    const distinctTargets = new Set<string>();
    for (const a of anchors) {
      if (distinctTargets.has(a.target)) continue;
      distinctTargets.add(a.target);
      const anchorText = a.text.trim();
      const anchorIsNumeric = isNumericText(anchorText);
      const anchorItem = ITEM_CELL_RE.exec(anchorText);
      const ownCell = cellIndexOf(a.index);

      let title = "";
      if (isTitleText(anchorText) && anchorItem === null) title = anchorText;
      else title = nearestCellText(ownCell, (t) => isTitleText(t) && !(anchorText !== "" && t === anchorText)) ?? "";

      let pageNo: number | undefined;
      if (anchorIsNumeric) pageNo = Number.parseInt(anchorText, 10);
      else {
        const num = nearestCellText(ownCell, isNumericText);
        if (num !== undefined) pageNo = Number.parseInt(num, 10);
      }

      const item = distinctTargets.size === 1 ? (rowItem ?? (anchorItem !== null ? normItem(anchorItem[1]) : undefined)) : anchorItem !== null ? normItem(anchorItem[1]) : undefined;
      entries.push({ item, title, target: a.target, part: currentPart, rowIndex: row.index, pageNo });
      seenRowTargets.add(a.target);
    }
  }

  // Whole-document standalone pass (AAPL-style TOC links, fragmented runs).
  const cap = Math.max(200_000, Math.floor(html.length * 0.4));
  const all = mergedAnchors(html.slice(0, cap));
  const haveItems = new Set(entries.filter((e) => e.item !== undefined).map((e) => `${e.item}|${e.part ?? ""}`));
  for (const a of all) {
    const im = ITEM_CELL_RE.exec(a.text.trim());
    if (im === null) continue;
    const item = normItem(im[1]);
    if (haveItems.has(`${item}|`) || [...haveItems].some((k) => k.startsWith(`${item}|`))) continue;
    if (seenRowTargets.has(a.target)) continue;
    entries.push({ item, title: a.text.trim(), target: a.target, part: null, rowIndex: a.index });
    haveItems.add(`${item}|`);
  }

  entries.sort((a, b) => a.rowIndex - b.rowIndex);
  return entries;
}

// ---------------------------------------------------------------------------
// Section metadata
// ---------------------------------------------------------------------------

interface ItemDef {
  id: string;
  title: RegExp;
}

const APO = "['’‘]";

const TENK_SEQUENCE: ItemDef[] = [
  { id: "1", title: /Business/i },
  { id: "1A", title: /Risk[\s]+Factors/i },
  { id: "1B", title: /Unresolved[\s]+Staff/i },
  { id: "1C", title: /Cybersecurity/i },
  { id: "2", title: /Properties/i },
  { id: "3", title: /Legal[\s]+Proceedings/i },
  { id: "4", title: /Mine[\s]+Safety/i },
  { id: "5", title: /Market[\s]+for/i },
  { id: "6", title: /(?:\[?Reserved\]?|Selected[\s]+Financial)/i },
  { id: "7", title: new RegExp(`Management${APO}?s?[\\s]+Discussion[\\s]+and[\\s]+Analysis`, "i") },
  { id: "7A", title: /Quantitative[\s]+and[\s]+Qualitative/i },
  { id: "8", title: /Financial[\s]+Statements[\s]+and[\s]+Supplementary/i },
  { id: "9", title: /Changes[\s]+in[\s]+and[\s]+Disagreements/i },
  // D-66: Parts III and IV bound Item 15, where some filers put the statements.
  { id: "9A", title: /Controls[\s]+and[\s]+Procedures/i },
  { id: "9B", title: /Other[\s]+Information/i },
  { id: "9C", title: /Disclosure[\s]+Regarding[\s]+Foreign/i },
  { id: "10", title: /Directors,?[\s]+Executive[\s]+Officers/i },
  { id: "11", title: /Executive[\s]+Compensation/i },
  { id: "12", title: /Security[\s]+Ownership/i },
  { id: "13", title: /Certain[\s]+Relationships/i },
  { id: "14", title: /Principal[\s]+Account(?:ant|ing)/i },
  { id: "15", title: /Exhibits?,?[\s]+(?:and[\s]+)?Financial[\s]+Statement/i },
  { id: "16", title: /Form[\s]+10-K[\s]+Summary/i },
];

const TENQ_P1_SEQUENCE: ItemDef[] = [
  { id: "1", title: /(?:Condensed[\s]+)?(?:Consolidated[\s]+)?Financial[\s]+Statements/i },
  { id: "2", title: new RegExp(`Management${APO}?s?[\\s]+Discussion`, "i") },
  { id: "3", title: /Quantitative[\s]+and[\s]+Qualitative/i },
  { id: "4", title: /Controls[\s]+and[\s]+Procedures/i },
];

const TENQ_P2_SEQUENCE: ItemDef[] = [
  { id: "1", title: /Legal[\s]+Proceedings/i },
  { id: "1A", title: /Risk[\s]+Factors/i },
  { id: "2", title: /Unregistered[\s]+Sales/i },
  { id: "3", title: /Defaults/i },
  { id: "4", title: /Mine[\s]+Safety/i },
  { id: "5", title: /Other[\s]+Information/i },
  { id: "6", title: /Exhibits/i },
];

/** Form 20-F annual-report sequence needed to bound the foreign-filer slices. */
const TWENTY_F_SEQUENCE: ItemDef[] = [
  { id: "1", title: /Identity[\s]+of[\s]+Directors/i },
  { id: "2", title: /Offer[\s]+Statistics/i },
  { id: "3", title: /Key[\s]+Information/i },
  { id: "3D", title: /Risk[\s]+Factors/i },
  { id: "4", title: /Information[\s]+on[\s]+the[\s]+Company/i },
  { id: "4A", title: /Unresolved[\s]+Staff/i },
  { id: "5", title: /Operating[\s]+and[\s]+Financial[\s]+Review[\s]+and[\s]+Prospects/i },
  { id: "6", title: /Directors,[\s]+Senior[\s]+Management[\s]+and[\s]+Employees/i },
  { id: "7", title: /Major[\s]+Shareholders/i },
];

const SECTION_KIND: Record<string, SectionKind> = {
  "10-K:1": "business",
  "10-K:1A": "riskFactors",
  "10-K:7": "mdna",
  "10-K:8": "financialStatements",
  "10-K:15": "financialStatements",
  "10-Q:1": "financialStatements",
  "10-Q:2": "mdna",
  "10-Q:1A": "riskFactors",
  "10-Q:5": "otherInformation",
  "20-F:3D": "riskFactors",
  "20-F:4": "business",
  "20-F:5": "mdna",
};

const TITLE_SYNONYMS: Record<SectionKind, string[]> = {
  mdna: ["management's discussion and analysis", "financial review", "management's discussion & analysis", "operating and financial review and prospects"],
  riskFactors: ["risk factors"],
  // D-63: matched by containment, so "business" alone would also claim
  // "Business Strategies"; the 10-K title is "Business" and the 20-F's
  // "Information on the Company".
  business: ["information on the company"],
  financialStatements: ["financial statements (unaudited)", "condensed consolidated financial statements", "financial statements"],
  otherInformation: ["other information"],
};

/** Contents-TOC entries that terminate a redirected section slice. */
const BOUNDARY_SYNONYMS: Record<SectionKind, string[]> = {
  mdna: [
    "management's report on internal control",
    "report of independent registered public accounting",
    "consolidated financial statements",
    "financial statements and notes",
    "audited financial statements",
    "controls and procedures",
    "quantitative and qualitative disclosures",
    "risk factors",
    "consolidated balance sheet",
    "directors, senior management and employees",
    // NOTE: "capital resources" is deliberately absent — "Liquidity and
    // Capital Resources" is a common MD&A SUBSECTION and would truncate it.
  ],
  riskFactors: [
    "controls and procedures",
    "management's report on internal control",
    "report of independent registered public accounting",
    "consolidated financial statements",
    "sustainability",
    "human capital",
    "supervision and regulation",
    "management's discussion and analysis",
    "financial review",
  ],
  business: [
    "risk factors",
    "unresolved staff",
    "properties",
    "operating and financial review",
    "management's discussion and analysis",
  ],
  financialStatements: [
    "management's discussion and analysis",
    "quantitative and qualitative disclosures",
    "controls and procedures",
    "changes in and disagreements",
    "form 10-k summary",
    "signatures",
  ],
  otherInformation: ["exhibits", "signatures"],
};

function specKind(spec: SectionSpec): SectionKind {
  return SECTION_KIND[`${spec.form}:${spec.item}`] ?? "mdna";
}

function specPart(spec: SectionSpec): 1 | 2 {
  if (spec.part !== undefined) return spec.part;
  return spec.item === "2" || spec.item === "1" ? 1 : 2;
}

// ---------------------------------------------------------------------------
// Layer 1 — TOC-anchor slicing
// ---------------------------------------------------------------------------

interface SliceResult {
  text: string;
  method: ExtractMethod;
  startTarget?: string;
}

function anchorPositions(html: string, entries: TocEntry[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of entries) {
    if (!map.has(e.target)) map.set(e.target, resolveAnchor(html, e.target));
  }
  return map;
}

function layer1Slice(html: string, entries: TocEntry[], spec: SectionSpec, notes: string[], financialHierarchy = false): SliceResult | null {
  const itemEntries = entries.filter((e) => e.item !== undefined);
  const pos = anchorPositions(html, entries);

  let candidate: TocEntry | undefined;
  const wanted = normItem(spec.item);

  if (itemEntries.length > 0) {
    const matches = itemEntries.filter((e) => e.item === wanted && pos.get(e.target) !== undefined && (pos.get(e.target) as number) >= 0);
    if (spec.form === "10-Q") {
      const part = specPart(spec);
      const partMatches = matches.filter((e) => e.part === part);
      if (partMatches.length > 0) candidate = partMatches[0];
      else if (matches.length > 0) {
        // No part markers — fall back to title/position heuristics.
        const kind = specKind(spec);
        const byTitle = matches.filter((e) => titleMatchesKind(e.title, kind));
        if (byTitle.length > 0) candidate = byTitle[0];
        else candidate = part === 1 ? matches[0] : matches[matches.length - 1];
        notes.push(`10-Q part disambiguation used ${byTitle.length > 0 ? "title" : "position"} heuristic for Item ${wanted}`);
      }
    } else {
      candidate = matches[0];
    }
    if (candidate !== undefined) {
      const start = pos.get(candidate.target) as number;
      // Boundary: next ITEM entry at a strictly greater anchor position (F2:
      // duplicate targets collapse; next *distinct* anchor bounds the slice).
      let end = html.length;
      for (const e of itemEntries) {
        const p = pos.get(e.target);
        if (p !== undefined && p > start && p < end) end = p;
      }
      const text = htmlToText(html.slice(start, end));
      if (text.length > 0) return { text, method: "toc-anchor", startTarget: candidate.target };
      return null;
    }
  }

  // Title-only TOC variant (MXC): no item-numbered links anywhere.
  const kind = specKind(spec);
  const titleEntries = entries.filter((e) => e.item === undefined && e.title !== "");
  const candidates = titleEntries.filter((e) => titleMatchesKind(e.title, kind) && (pos.get(e.target) ?? -1) >= 0);
  const cand = candidates.find((e) => !conflictingTocTitle(html, entries, e, kind));
  if (cand === undefined) return null;
  const start = pos.get(cand.target) as number;
  // Bound by the next anchor of ANY entry, not just the next title-only one.
  // This branch is reached whenever no item-numbered entry matched the wanted
  // item, which does not mean none EXIST — so ignoring item anchors let the
  // slice run straight through a later item's heading and return that item's
  // text as part of this section. The item-numbered branch above already bounds
  // this way.
  const ordered = entries
    .filter((e) => (pos.get(e.target) ?? -1) >= 0)
    .sort((a, b) => (pos.get(a.target) as number) - (pos.get(b.target) as number));
  let end = html.length;
  const fullItem = /^item\s+(\d{1,2}(?:\s*\.?\s*[a-d])?)\b[.:]?\s+\S/i;
  const parentItem = fullItem.exec(cand.title);
  const hierarchical = financialHierarchy && parentItem !== null && normItem(parentItem[1]) === wanted;
  for (const e of ordered) {
    const p = pos.get(e.target) as number;
    // Full-titled item links may have statement/note child links. Those
    // children do not close their parent item; the next item/part does.
    const nextItem = e.item ?? fullItem.exec(e.title)?.[1];
    const itemBoundary = nextItem !== undefined && normItem(nextItem) !== wanted;
    const partBoundary = spec.form === "10-Q" && e.part !== null && e.part !== specPart(spec);
    if (p > start && (!hierarchical || itemBoundary || partBoundary)) {
      end = p;
      break;
    }
  }
  if (hierarchical && end === html.length) {
    notes.push(`full-titled Item ${wanted} has no closing item/part anchor`);
    return null;
  }
  const text = htmlToText(html.slice(start, end));
  if (text.length === 0) return null;
  notes.push("layer 1 used title-only TOC links (no item-numbered links found)");
  return { text, method: "toc-title", startTarget: cand.target };
}

function titleMatchesKind(title: string, kind: SectionKind): boolean {
  const n = normalizeTitle(title);
  if (n === "") return false;
  // One-way containment only: the entry title must CONTAIN the synonym.
  // (The reverse would make a "Financial Review" entry match the quoted
  // composite "Financial Review – Risk Factors" and hijack Risk Factors.)
  return TITLE_SYNONYMS[kind].some((syn) => n.includes(syn));
}

/** A shared group anchor is not its named child when the body proves another title. */
function conflictingTocTitle(html: string, entries: TocEntry[], entry: TocEntry, kind: SectionKind): boolean {
  if (kind !== "otherInformation") return false;
  const at = resolveAnchor(html, entry.target);
  if (at === null) return false;
  const opening = normalizeTitle(htmlToText(html.slice(at, at + 4_000))).replace(/^table of contents\s*/, "");
  return entries.some(other => other.target === entry.target && other.title !== entry.title &&
    !titleMatchesKind(other.title, kind) && opening.startsWith(normalizeTitle(other.title)));
}

// ---------------------------------------------------------------------------
// Layer 2 — hardened header regex
// ---------------------------------------------------------------------------

interface HeaderCandidate {
  index: number;
  matchText: string;
}

/** SEC headings write lettered items both as 1A and as 1.A / 3.D. */
function itemIdHeaderPattern(id: string): string {
  const lettered = /^(\d+)([a-z])$/i.exec(id);
  return lettered === null
    ? escapeRegExp(id)
    : escapeRegExp(lettered[1]) + "[\\s.]*" + escapeRegExp(lettered[2]);
}

const REJECT_BEFORE_RE = /(see|refer(?:s|red)?[\s]+to|described[\s]+in|discussed[\s]+in|under|in[\s]+part[\s]+[ivx\d])[\s]*["“”'(‘’]*[\s]*$/i;
// NOTE: stub markers ("can be found in", "incorporated by reference") are
// deliberately NOT candidate rejecters — they follow REAL headers on WFC/FRD
// wrapper stubs, and rejecting those would leave zero candidates and skip the
// exhibit-redirect path. They are handled by the Layer-3 stub detector.
// "above|below" gets a TIGHT window: cross-references put it immediately after
// the quoted title (MXC: «"Item 1A. Risk Factors" above»), while real headers
// can legitimately say "The discussion below addresses..." (BAC F16) further out.
// Bound to the ITEM REFERENCE, not to a 100-character prose window. A
// cross-reference attaches these words directly to the reference — «"Item 1A.
// Risk Factors" in this Annual Report», «see Item 1A. Risk Factors for a
// discussion of…» — so only quotes, brackets, punctuation and whitespace may
// intervene. A REAL header is followed by a sentence, and the standard SEC
// risk-factor preamble routinely reaches these same words within 100 chars.
// One participial connector may intervene, because that is how a cross-
// reference is actually written — «"Item 1A. Risk Factors" INCLUDED in this
// Annual Report», «… set forth in this report» — and admitting those was the
// gap left by the first tightening.
// ("You should carefully consider the risks described below … in this Annual
// Report on Form 10-K"), which used to reject the genuine header and leave the
// item with zero candidates.
const REJECT_AFTER_100_RE = /^[\s"'“”‘’)\](.,;:—–-]{0,12}(?:(?:included|contained|appearing|presented|discussed|described|set[\s]+forth|referred[\s]+to|elsewhere)[\s]+)?\b((?:in|of)[\s]+this[\s]+(?:form|report|annual[\s]+report)|for[\s]+(?:a[\s]+)?discussion)\b/i;
const REJECT_AFTER_10_RE = /^[\s\S]{0,10}?\b(above|below)\b/i;
const REJECT_AFTER_60_RE = /^[\s\S]{0,60}?\bon[\s]+page[s]?[\s]+\d/i;

/**
 * Find surviving header candidates for one item on stripped text.
 * Pattern: Item <N>[.:]? + optional interposed run ≤120 chars (F15) + title.
 * Rejects cross-reference contexts (F7/F7b/F16).
 */
export function findHeaderCandidates(fullText: string, def: ItemDefLike, windowStart = 0, windowEnd = Number.MAX_SAFE_INTEGER, boundary = false): HeaderCandidate[] {
  const re = new RegExp(`\\bItem[\\s]+${itemIdHeaderPattern(def.id)}\\b[.:]?[\\s\\S]{0,120}?(?:${def.title.source})`, "gi");
  const out: HeaderCandidate[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(fullText)) !== null) {
    if (m.index < windowStart || m.index > windowEnd) continue;
    const before = fullText.slice(Math.max(0, m.index - 40), m.index);
    if (REJECT_BEFORE_RE.test(before)) continue;
    const after = fullText.slice(m.index + m[0].length, m.index + m[0].length + 130);
    if (REJECT_AFTER_100_RE.test(after) || (!boundary && REJECT_AFTER_60_RE.test(after)) || REJECT_AFTER_10_RE.test(after)) continue;
    out.push({ index: m.index, matchText: m[0] });
  }
  return out;
}

export interface ItemDefLike {
  id: string;
  title: RegExp;
}

function layer2Slice(fullText: string, spec: SectionSpec, notes: string[], requiredBody?: string): { text: string; zeroCandidates: boolean; missingBoundary?: true } | null {
  let seq: ItemDef[];
  let winStart = 0;
  let winEnd = fullText.length;

  if (spec.form === "10-K") {
    seq = TENK_SEQUENCE;
  } else if (spec.form === "20-F") {
    seq = TWENTY_F_SEQUENCE;
  } else {
    const part = specPart(spec);
    seq = part === 1 ? TENQ_P1_SEQUENCE : TENQ_P2_SEQUENCE;
    // Part-aware segmentation: "Item 2." appears in both parts of a 10-Q.
    const partIIPositions: number[] = [];
    const pRe = /\bPART[\s]+II\b/gi;
    let pm: RegExpExecArray | null;
    while ((pm = pRe.exec(fullText)) !== null) partIIPositions.push(pm.index);
    if (partIIPositions.length > 0) {
      // Body Part II header is the LAST occurrence (TOC rows come first).
      const bodyPartII = partIIPositions[partIIPositions.length - 1];
      if (part === 1) winEnd = bodyPartII;
      else winStart = bodyPartII;
    } else if (part === 2) {
      notes.push("10-Q Part II marker not found; searching whole document");
    }
  }

  const idx = seq.findIndex((d) => d.id === normItem(spec.item));
  if (idx === -1) return null;
  const target = seq[idx];
  const targetCands = findHeaderCandidates(fullText, target, winStart, winEnd);
  if (targetCands.length === 0) return { text: "", zeroCandidates: true };

  const boundaryCands: HeaderCandidate[] = [];
  for (const bd of seq.slice(idx + 1, idx + 5)) {
    boundaryCands.push(...findHeaderCandidates(fullText, bd, winStart, winEnd, true));
  }
  if (spec.form === "10-Q" && specPart(spec) === 1 && winEnd < fullText.length) {
    boundaryCands.push({ index: winEnd, matchText: "PART II" });
  }
  boundaryCands.sort((a, b) => a.index - b.index);

  // Monotonic rule: LAST target candidate that still has a boundary after it.
  let chosen: HeaderCandidate | null = null;
  let end = winEnd;
  for (let i = targetCands.length - 1; i >= 0; i--) {
    const c = targetCands[i];
    const b = boundaryCands.find((bc) => bc.index > c.index);
    if (b !== undefined) {
      // A recovery must enclose the complete proved notes, so a running
      // item heading inside those notes cannot replace their real opening.
      if (requiredBody !== undefined && !fullText.slice(c.index, b.index).includes(requiredBody)) continue;
      chosen = c;
      end = b.index;
      break;
    }
  }
  if (chosen === null) {
    notes.push(`layer 2: no closing boundary header after Item ${target.id}`);
    const last = targetCands[targetCands.length - 1]!;
    return { text: fullText.slice(last.index, Math.min(winEnd, last.index + 400)), zeroCandidates: false, missingBoundary: true };
  }
  return { text: fullText.slice(chosen.index, end).trim(), zeroCandidates: false };
}

/** Unlettered 20-F risk factors require standalone Item 3/4 boundaries. */
function unletteredTwentyFRisk(pre: string, fullText: string): string | null {
  // Preserve block evidence: prose references are not headings. Inline
  // formatting may split words (including TSMC's nested spans).
  const inline = String.raw`(?:\s|&(?:#\d+|#x[\da-f]+|nbsp);|<\/?(?:span|b|strong|em|i)\b[^>]*>)*`;
  const standalone = (title: string): number[] => {
    const pattern = title.split(" ").join(inline);
    const re = new RegExp(`<(h[1-6]|p|div)\\b[^>]*>${inline}${pattern}${inline}</\\1\\s*>`, "gi");
    return [...pre.matchAll(re)].map(match =>
      htmlToText(pre.slice(0, match.index + match[0].length)).length - htmlToText(match[0]).length);
  };
  // Reuse every existing cross-reference rejection rule, then additionally
  // require standalone boundaries so later quoted Item 3 references cannot win.
  const starts = standalone(String.raw`Item 3\.? Key Information`);
  const ends = standalone(String.raw`Item 4\.? Information on the Company`);
  const start = findHeaderCandidates(fullText, { id: "3", title: /Key\s+Information/i })
    .filter(c => starts.includes(c.index)).at(-1);
  if (!start) return null;
  const end = findHeaderCandidates(fullText, { id: "4", title: /Information\s+on\s+the\s+Company/i })
    .find(c => c.index > start.index && ends.includes(c.index));
  if (!end) return null;
  const risk = standalone("Risk Factors").find(index => index > start.index + start.matchText.length && index < end.index);
  return risk === undefined ? null : fullText.slice(risk, end.index).trim();
}
// ---------------------------------------------------------------------------
// Layer 3 — stub detection & redirects
// ---------------------------------------------------------------------------

export const STUB_MIN_CHARS = 2500;

const STUB_PHRASE_RE = new RegExp(
  [
    "incorporated[\\s]+(?:herein[\\s]+)?(?:into[\\s]+this[\\s]+item[\\s]+)?by[\\s]+reference",
    "appears?[\\s]+on[\\s]+pages?",
    "refer[\\s]+to[\\s]+(?:the[\\s]+)?(?:part|pages?|item|information|market[\\s]+risk)",
    "can[\\s]+be[\\s]+found[\\s]+in",
    "information[\\s]+in[\\s]+response[\\s]+to[\\s]+this[\\s]+item",
    "see[\\s]+[\\s\\S]{0,60}?on[\\s]+page",
  ].join("|"),
  "i",
);

/**
 * Upper bound for the incorporation-phrase test. Observed real sections are
 * >= 18k chars and observed stubs are 252-399, so anything past this is prose,
 * not a pointer to prose elsewhere.
 */
export const STUB_PHRASE_MAX_CHARS = STUB_MIN_CHARS * 4;

/**
 * Layer-3 stub test: short, OR incorporation phrasing in the first 400 chars of
 * a text that is still short enough to plausibly BE a stub.
 *
 * The phrase leg needs that upper bound. Real 10-K sections routinely open with
 * a cross-reference — "should be read in conjunction with ... refer to the
 * information ... appearing on pages F-1" — and MD&A and Item 1A are the two
 * most likely to do so. Since the length leg above already returns for anything
 * under `minChars`, an unbounded phrase test could only ever fire on text long
 * enough to be a real section, and a detected stub is a LOUD HARD FAIL, so a
 * correctly extracted 40,000-character MD&A was discarded outright.
 */
export function detectStub(text: string, minChars = STUB_MIN_CHARS): { isStub: boolean; reason: string } {
  const withoutItemNumbers = text.replace(/\bItem\s+\d+[A-D]?\./gi, "");
  if (text.length < STUB_MIN_CHARS && (text.match(/\bPage\s+\d+\b/g)?.length ?? 0) >= 2 &&
      !/[.!?](?:\s|$)/.test(withoutItemNumbers)) {
    return { isStub: true, reason: "contents/page listing without a section body" };
  }
  if (text.length < minChars) return { isStub: true, reason: `only ${text.length} chars (<${minChars})` };
  if (text.length >= STUB_PHRASE_MAX_CHARS) return { isStub: false, reason: "" };
  const head = text.slice(0, 400);
  if (STUB_PHRASE_RE.test(head)) return { isStub: true, reason: "incorporation/cross-reference phrasing in first 400 chars" };
  return { isStub: false, reason: "" };
}

const STATEMENT_NUMBER = "-?\\d+(?:,\\d{3})*(?:\\.\\d+)?";
const STATEMENT_AMOUNT = `(?:\\(\\s*${STATEMENT_NUMBER}\\s*\\)|${STATEMENT_NUMBER}|[—–-])`;
// Short superscript footnotes are masked with U+FFFC for proof. They cannot
// turn the compound label "cash flows" into the balance-sheet label "cash".
const BALANCE_CASH_LABEL = "cash(?!(?:\\s|\\uFFFC)+flows?)(?: and cash equivalents)?";
const STATEMENT_ROW_LABELS = [
  BALANCE_CASH_LABEL,
  "(?:total|current|noncurrent) (?:assets|liabilities|equity|revenue)",
  "(?:short|long)[- ]term debt", "accounts (?:payable|receivable)",
  "net (?:income|loss|revenue)", "retained earnings",
];
const HEADED_ROW_LABELS = [...STATEMENT_ROW_LABELS,
  "net\\s*(?:sales|earnings)", "sales", "revenues?", "gross profit",
  "operating (?:profit|income|costs|expenses)",
];
const statementRows = (labels: readonly string[]) => new RegExp(
  `\\b(?:${labels.join("|")})\\b[^.!?]{0,100}?${STATEMENT_AMOUNT}\\s+(?:\\$\\s*)?${STATEMENT_AMOUNT}`, "gi");
const HEADED_STATEMENT_ROWS = statementRows(HEADED_ROW_LABELS);
const STATEMENT_TITLES = "BalanceSheets?|Statements?of(?:FinancialPosition|Income|Operations|Earnings|CashFlows?)";
const STATEMENT_QUALIFIERS = "(?:(?:Unaudited|Interim|Condensed|Consolidated))*";
const STATEMENT_ENTITY = "(?:[A-Z0-9&.,'’()-]{1,100}(?:andSubsidiaries|Inc\\.?|Incorporated|Corporation|Company))?";
const STATEMENT_DATES = "(?:fortheYears?Ended|Years?Ended|asof|at)[A-Z0-9,/.()-]{0,120}";
const STATEMENT_UNITS = "(?:\\((?:in)?(?:thousands|millions|billions)(?:,except[A-Z0-9,/.()-]{0,120})?\\))?";
// "Results of Operations" alone also names MD&A; a statement-period caption is required.
const STATEMENT_CAPTION = new RegExp(`^${STATEMENT_ENTITY}${STATEMENT_QUALIFIERS}(?:(?:${STATEMENT_TITLES})(?:\\(Unaudited\\))?(?:${STATEMENT_DATES})?|ResultsofOperations${STATEMENT_DATES})${STATEMENT_UNITS}$`, "i");

const BALANCE_ROWS = statementRows([
  BALANCE_CASH_LABEL, "(?:total|current|noncurrent) (?:assets|liabilities|equity)",
  "(?:short|long)[- ]term debt", "accounts (?:payable|receivable)", "retained earnings",
]);
const INCOME_ROWS = statementRows([
  "net (?:income|loss|revenue)", "net\\s*(?:sales|earnings)", "(?:total )?(?:sales|revenues?)", "gross profit",
  "operating (?:profit|income|costs|expenses)", "(?:net |total )?interest (?:income|expense)",
]);
const CASH_FLOW_ROWS = statementRows([
  "net (?:income|loss)", "(?:net )?cash (?:provided by|used in|flows? from)",
  "depreciation and amortization", "(?:purchases|payments|proceeds) (?:of|for|from)",
]);
const CASH_FLOW_CONTEXT = /\b(?:cash flows? from|net cash (?:provided by|used in)|(?:operating|investing|financing) activities)\b/i;
// Only statement metadata may bridge an external caption to its first table.
// Unknown prose/headings are boundaries, even without semantic HTML headings.
const STATEMENT_CONTEXT = /^(?:[\s\d(),./:;*$€£–—-]|\b(?:unaudited|continued|in|of|and|or|the|for|as|at|ended|ending|year|years|month|months|week|weeks|quarter|quarters|fiscal|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|twenty|thirty|forty|fifty|thousands|millions|billions|except|share|shares|per|data|amount|amounts|stated|number|numbers|which|are|reflected|par|value|values|expressed|dollar|dollars|US|USD|EUR|CAD|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)\b)*$/i;
const STATEMENT_ISSUER_LINE = /^[A-Z0-9&.,'’() -]{1,120}?(?:Inc\.?|Incorporated|Corporation|Company)(?: and (?:Subsidiaries|Subsidiary Companies))?(?: \(Parent Company\))?(?=\s|$)/i;
function statementContext(text: string): boolean {
  return STATEMENT_CONTEXT.test(text.replace(STATEMENT_ISSUER_LINE, ""));
}
const STATEMENT_SECTION = /^(?:(?:current|noncurrent|non-current|net|total|operating)\s+)?(?:assets|liabilities|liabilities, mezzanine equity and equity|(?:liabilities and )?(?:stockholders[’']?|shareholders[’']?)?\s*equity|revenues?|sales(?: and revenues)?|(?:non)?interest (?:income|expense)|costs?(?: of (?:sales|revenues?))?(?:,? (?:and )?expenses)?(?:,? and other)?|expenses|(?:cash flows? from )?(?:operating|investing|financing) activities)\s*:?$/i;
const STATEMENT_FINANCIAL_SUBSECTION = /^(?:investments?|inventories|(?:available[- ]for[- ]sale|equity|fixed maturity) securities(?:,? at fair value)?|real estate(?: held for investment)?(?:,? at (?:cost|fair value))?|(?:short|long)[- ]term financing receivables|accounts (?:receivable|payable)|deferred credits and other liabilities|collateralized agreements|revenues? and other income|sales, maturities and repayments of)$/i;
const STATEMENT_RECONCILIATION = /^adjustments(?: to (?:reconcile )?net (?:income|earnings)(?: \(loss\))?(?: including noncontrolling interest)?(?: to (?:net )?cash (?:flows? )?(?:provided by(?: \(used in\))?|used (?:in|for)) operating activities)?)?$/i;
const STATEMENT_WORKING_CAPITAL = /^changes in (?:(?:operating )?assets and liabilities|working capital)(?:,? net of business combinations)?$/i;
function statementSection(text: string): boolean {
  const body = text.replace(/\s*:\s*$/, "").replace(/(?:\s*\((?:unaudited|\d{1,3}|[a-z])\))+$/i, "").trim();
  return STATEMENT_SECTION.test(body) || STATEMENT_FINANCIAL_SUBSECTION.test(body) || STATEMENT_RECONCILIATION.test(body) || STATEMENT_WORKING_CAPITAL.test(body);
}
// Explicit business/segment labels and named industry categories are financial
// subgroups; arbitrary text in an empty amount-column grid is not evidence.
const STATEMENT_INDUSTRY = "(?:banking|insurance|railroads?|utilities|energy|manufacturing|service|retail|finance)";
const STATEMENT_BUSINESS_SECTION = new RegExp(`^(?:[A-Z&'(), -]{0,100}\\b(?:businesses|segments)|${STATEMENT_INDUSTRY}(?:(?:,?\\s+and|,)\\s+(?:${STATEMENT_INDUSTRY}|other))*)\\s*:$`, "i");
const STATEMENT_CELL_AMOUNT = new RegExp(`^(?:[$€£]\\s*)?${STATEMENT_AMOUNT}$`);
interface StatementUnit {
  sourceStart: number;
  text: string;
  witness: string;
  caption: string;
  /** End offsets of original, family-compatible rows in this unit only. */
  rowEnds: number[];
  firstRow: number;
}
const sourceStatementUnits = new WeakMap<ParsedDocument, StatementUnit[]>();

/** A caption owns its containing table, or the first adjacent table/plain block
 * sequence. A second table, peer heading or unrelated text cannot lend proof. */
function statementUnits(source: ParsedDocument): StatementUnit[] {
  const cached = sourceStatementUnits.get(source);
  if (cached) return cached;
  let structure = annualRecoveryStructures.get(source);
  if (structure === undefined) {
    structure = appendixStructure(source.pre, true);
    annualRecoveryStructures.set(source, structure);
  }
  if (!structure) return [];
  const layout = structure;
  const tableOf = (node: AppendixElement | undefined): AppendixElement | undefined => {
    for (; node; node = node.parent) if (node.tag === "table") return node;
    return undefined;
  };
  const linked = (node: AppendixElement | undefined): boolean => {
    for (; node; node = node.parent) if (node.tag === "a" && node.attrs.has("href")) return true;
    return false;
  };
  const visible = layout.elements.filter(node => !node.hidden);
  const issuerNames = visible.filter(node => node.attrs.get("name")?.toLowerCase() === "dei:entityregistrantname")
    .map(node => layout.text(node.start, node.end)).filter(name => name.length > 2 && name.length < 150);
  const isContext = (text: string) => statementContext(text) || issuerNames.some(name =>
    text.trim().toLowerCase().startsWith(name.toLowerCase()) && statementContext(text.trim().slice(name.length)));
  const tables = visible.filter(node => node.tag === "table");
  const rows = visible.filter(node => node.tag === "tr" || !node.blockChild && /^(?:p|div)$/.test(node.tag) && !tableOf(node));
  const cellsByRow = new Map<AppendixElement, AppendixElement[]>();
  for (const cell of visible) if (cell.parent?.tag === "tr" && /^(?:td|th)$/.test(cell.tag)) {
    const cells = cellsByRow.get(cell.parent) ?? [];
    cells.push(cell);
    cellsByRow.set(cell.parent, cells);
  }
  const boundaries = visible.filter(node => {
    if (/^h[1-6]$/.test(node.tag)) return true;
    const table = tableOf(node);
    const bold = /^(?:b|strong|th)$/.test(node.tag) || /(?:^|;)\s*font-weight\s*:\s*(?:[6-9]00|bold)\b/i.test(node.attrs.get("style") ?? "");
    if (table ? node.tag !== "tr" : !bold && (node.blockChild || !/^(?:p|div)$/.test(node.tag))) return false;
    const row = node;
    const body = layout.text(row.start, row.end);
    if (!body || isContext(body) || statementSection(body)) return false;
    if (table) {
      const cells = cellsByRow.get(row) ?? [];
      if (STATEMENT_BUSINESS_SECTION.test(body) && cells.length > 1 && Number(cells[0]!.attrs.get("colspan") ?? 1) === 1 &&
          cells.slice(1).every(cell => !layout.text(cell.start, cell.end))) return false;
      // Comparative amount cells identify data rows, including labels outside
      // our proof vocabulary. Unknown text-only rows end ownership regardless
      // of font, empty spacer cells, or an incidental year in their text.
      if (cells.filter(cell => STATEMENT_CELL_AMOUNT.test(layout.text(cell.start, cell.end))).length >= 2 ||
          body.search(HEADED_STATEMENT_ROWS) >= 0 || body.search(CASH_FLOW_ROWS) >= 0) return false;
      return true;
    }
    const firstRow = Math.min(...[HEADED_STATEMENT_ROWS, CASH_FLOW_ROWS].map(pattern => {
      const at = body.search(pattern); return at < 0 ? Infinity : at;
    }));
    return firstRow === Infinity;
  });
  const units: StatementUnit[] = [];
  const add = (start: number, captionEnd: number, caption: string, owner?: AppendixElement, plainEnd?: number) => {
    const containing = tableOf(owner);
    const header = containing && layout.text(containing.start, containing.end);
    const captionWrapper = containing && header && !/\d/.test(header) && header.startsWith(caption) && isContext(header.slice(caption.length));
    const table = (captionWrapper ? undefined : containing) ?? (plainEnd ? tables.find(node => node.start > start && node.end <= plainEnd) : undefined)
      ?? (captionWrapper ? tables.find(node => node.start >= containing.end) : undefined)
      ?? tables.find(node => node.start >= captionEnd);
    const contextStart = captionWrapper ? containing.end : captionEnd;
    const heading = boundaries.find(node => node.start >= contextStart && node.start > start);
    let end = Math.min(table?.end ?? source.pre.length, heading?.start ?? source.pre.length, plainEnd ?? source.pre.length);
    // Inline/plain rows belong to their block sequence, never a later table.
    const between = layout.text(contextStart, table?.start ?? end);
    if (table && (!containing || captionWrapper) && (between.length > 600 || !isContext(between))) end = Math.min(end, table.start);
    if (end <= start) return;
    const body = layout.text(start, end);
    const family = /BalanceSheets?|FinancialPosition/i.test(caption.replace(/\s+/g, "")) ? "balance"
      : /CashFlows?/i.test(caption.replace(/\s+/g, "")) ? "cash" : "income";
    const incompatible = family !== "cash" && CASH_FLOW_CONTEXT.test(body) ||
      family === "balance" && /\b(?:total (?:other )?comprehensive income|years? ended)\b/i.test(body) ||
      family === "income" && /\b(?:total comprehensive income|total assets)\b/i.test(body) ||
      family === "cash" && !CASH_FLOW_CONTEXT.test(body);
    const firstSpan = layout.spans.find(span => span.start >= start && span.start < end && span.text.trim());
    const sourceStart = firstSpan ? firstSpan.start + firstSpan.text.length - firstSpan.text.trimStart().length : start;
    // Following context identifies this source occurrence; it never supplies
    // rows. Without it a shorter failed unit at a different issuer's repeated
    // caption could incorrectly shadow a proved unit with the same beginning.
    const witness = layout.text(start, Math.min(source.pre.length, end + 50_000)).slice(0, body.length + 160);
    const unit: StatementUnit = { sourceStart, text: body, witness, caption, rowEnds: [], firstRow: Infinity };
    const rowPattern = family === "balance" ? BALANCE_ROWS : family === "cash" ? CASH_FLOW_ROWS : INCOME_ROWS;
    const addRows = (rowStart: number, rowEnd: number) => {
      if (incompatible) return;
      const from = Math.max(start, rowStart), to = Math.min(end, rowEnd);
      if (from >= to) return;
      const before = layout.text(start, from);
      const offset = before.length + (before ? 1 : 0);
      // Retain the excerpt and offsets, but mask supported superscript markers
      // for proof. Their link status cannot change a compound label's meaning.
      let lo = 0, hi = layout.spans.length;
      while (lo < hi) { const mid = (lo + hi) >>> 1; if (layout.spans[mid]!.end <= from) lo = mid + 1; else hi = mid; }
      const parts: string[] = [];
      for (let i = lo; i < layout.spans.length && layout.spans[i]!.start < to; i++) {
        const span = layout.spans[i]!;
        const text = decodeEntities(span.text.slice(Math.max(0, from - span.start), Math.min(span.text.length, to - span.start)));
        let superscript = false;
        for (let node = span.parent; node; node = node.parent) if (node.tag === "sup") superscript = true;
        const footnote = superscript && /^(?:\(?[0-9a-z]{1,3}\)?|[*†‡]+)$/i.test(text.trim());
        // Other links could split a label or value into false tokens.
        if (linked(span.parent) && text.trim() && !footnote) return;
        parts.push(footnote ? text.replace(/\S/g, "\uFFFC") : text);
      }
      const proofText = parts.join(" ").replace(/\s+/g, " ").trim();
      if (proofText.length !== layout.text(from, to).length) return;
      for (const match of proofText.matchAll(rowPattern)) {
        const at = offset + match.index;
        if (at < caption.length) continue;
        unit.firstRow = Math.min(unit.firstRow, at);
        unit.rowEnds.push(at + match[0].length);
      }
    };
    for (const row of rows) {
      if (row.end <= start || row.start >= end) continue;
      if (tableOf(row) !== (table && table.start < end ? table : undefined)) continue;
      // A layout row enclosing another table is not a financial row.
      if (tables.some(nested => nested.start > row.start && nested.end < row.end)) continue;
      addRows(row.start, row.end);
    }
    // Preserve original newlines in plain source; never join their amounts.
    for (const span of layout.spans) if (span.end > start && span.start < end && !tableOf(span.parent) &&
        !rows.some(row => row.start <= span.start && row.end >= span.end)) {
      let at = span.start;
      for (const line of span.text.split(/(?<=\n)/)) { addRows(at, at + line.length); at += line.length; }
    }
    unit.rowEnds = [...new Set(unit.rowEnds)].sort((a, b) => a - b);
    if (/\b(?:index|contents|pages?)\b/i.test(body.slice(caption.length, unit.firstRow))) unit.rowEnds = [];
    units.push(unit);
  };
  for (const node of visible) {
    if (node.end - node.start > 5_000 || !/^(?:p|div|h[1-6]|td|th|span)$/.test(node.tag)) continue;
    if (node.tag === "span" && !/(?:^|;)\s*font-weight\s*:\s*(?:[6-9]00|bold)\b/i.test(node.attrs.get("style") ?? "")) continue;
    const body = layout.text(node.start, node.end);
    const firstRow = body.search(HEADED_STATEMENT_ROWS);
    const caption = firstRow > 0 ? body.slice(0, firstRow).trimEnd() : body;
    if (caption.length > 220 || !STATEMENT_CAPTION.test(caption.replace(/\s+/g, "")) || linked(node) ||
        /<a\b[^>]*href\s*=/i.test(source.pre.slice(node.start, node.end))) continue;
    add(node.start, node.end, caption, node, firstRow > 0 ? node.end : undefined);
  }
  for (const span of layout.spans) {
    if (linked(span.parent) || tableOf(span.parent)) continue;
    const raw = span.text.trimStart();
    const line = decodeEntities(raw.split(/\r?\n/, 1)[0]!).trim();
    if (!raw.includes("\n") || !STATEMENT_CAPTION.test(line.replace(/\s+/g, ""))) continue;
    const start = span.start + span.text.length - raw.length;
    const afterCaption = start + raw.indexOf("\n") + 1;
    let end = afterCaption;
    for (const nextLine of source.pre.slice(afterCaption, span.end).split(/(?<=\n)/)) {
      const body = decodeEntities(nextLine).replace(/\s+/g, " ").trim();
      if (body && !isContext(body) && !statementSection(body) &&
          body.search(HEADED_STATEMENT_ROWS) < 0 && body.search(CASH_FLOW_ROWS) < 0) break;
      end += nextLine.length;
    }
    add(start, afterCaption, line, span.parent, end);
  }
  // Nested formatting elements can describe the SAME physical caption. Keep
  // its complete wrapper, including a caption-only layout table. This does not
  // merge distinct source occurrences or skip an index/data table.
  const bySource = new Map<number, StatementUnit>();
  for (const unit of units) {
    const previous = bySource.get(unit.sourceStart);
    if (!previous || unit.text.length > previous.text.length) bySource.set(unit.sourceStart, unit);
  }
  const result = [...bySource.values()];
  sourceStatementUnits.set(source, result);
  return result;
}

/** Match a whole contiguous source unit, including its period/context, before
 * considering its row offsets. Identical strings elsewhere confer no authority. */
export function financialStatementText(text: string, limit = 12_000, source?: ParsedDocument, requireLeadingCaption = false): { statementsText?: string; statementsTextGap?: string } {
  const starts = new Map<number, { unit: StatementUnit; matched: number; unique: boolean }[]>();
  for (const unit of source ? statementUnits(source) : []) {
    const matches: { at: number; matched: number }[] = [];
    for (let at = text.indexOf(unit.caption); at >= 0; at = text.indexOf(unit.caption, at + 1)) {
      const retained = text.slice(at, at + unit.witness.length).trimEnd();
      if (retained.length > unit.caption.length && unit.witness.startsWith(retained)) matches.push({ at, matched: Math.min(retained.length, unit.text.length) });
    }
    for (const { at, matched } of matches) {
      const witnesses = starts.get(at) ?? [];
      witnesses.push({ unit, matched, unique: matches.length === 1 });
      starts.set(at, witnesses);
    }
  }
  for (const [at, witnesses] of [...starts].sort(([a], [b]) => a - b)) {
    if (requireLeadingCaption && at !== 0) continue;
    const proved = (length: number) => witnesses.every(({ unit, matched }) =>
      unit.rowEnds.filter(end => end <= Math.min(length, matched)).length >= 2);
    // Keep useful original coverage if this cap contains the same unit's proof.
    if (proved(limit - at)) return { statementsText: text.slice(0, limit) };
    if (witnesses.every(({ unique, unit }) => unique && unit.firstRow < 1_000) && proved(limit)) {
      return { statementsText: text.slice(at, at + limit) };
    }
  }
  return { statementsTextGap: "no substantive financial-statement rows were established before the notes; caption, period/context and compatible rows must belong to the same source table or bounded statement block; missing or mismatched captions remain unproved" };
}

/**
 * A body that IS the absence statement. Either it ends on the phrase ("Not
 * required.", "None.", "Not applicable.") or, for the smaller-reporting-
 * company wording, it OPENS with it and says for whom in one short sentence
 * ("Not required for smaller reporting companies.", "Not applicable to
 * smaller reporting companies as defined in Rule 12b-2."); a body that only
 * ENDS a longer discussion with "none" is not an absence statement, so the
 * opening form is confined to a single sentence.
 */
const NOT_REQUIRED_RE =
  /(?:^|[.\s])(not[\s]+required|none|not[\s]+applicable)[.\s]*$|(?:^|[.\s])(?:not[\s]+required|not[\s]+applicable|omitted)\b[^.!?]{0,160}(?:smaller[\s]+reporting[\s]+compan|rule[\s]+12b-2|regulation[\s]+s-k)[^.!?]{0,80}[.!?]?[\s"”]*$/i;
const UNCHANGED_10K_RE = /refer[\s]+to[\s\S]{0,220}?(?:form[\s]+10-?k|annual[\s]+report[\s]+on[\s]+form[\s]+10-?k)|no[\s]+material[\s]+changes[\s\S]{0,220}?10-?k/i;
const EXHIBIT_PHRASE_RE = /annual[\s]+report[\s]+to[\s]+(?:share|stock)holders|exhibit[\s]+13|(?:attached|included)[\s]+as[\s]+exhibit/i;

/** Section titles quoted inside a stub (WFC names its EX-13 target "Financial Review"). */
export function parseQuotedTitles(stub: string): string[] {
  const out: string[] = [];
  // Pair each quote style with its own closer. A single character class for all
  // of them lets a straight apostrophe close a double-quoted run, so
  // `"Management's Discussion and Analysis…"` would yield the fragment
  // "Management" — and buildSynonyms ranks stub titles ABOVE the generic
  // synonyms, so that fragment becomes a high-priority substring matcher that
  // can select the wrong exhibit section. `&quot;`/`&apos;` both decode to
  // ASCII, so this shape arrives from ordinary filings.
  // The straight-apostrophe pair additionally requires non-letter boundaries so
  // possessives ("the Company's … shareholders'") cannot fabricate a title.
  const re = /“([^“”]{3,140})”|"([^"]{3,140})"|(?<![A-Za-z])'([^']{3,140})'(?![A-Za-z])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stub)) !== null) {
    const t = (m[1] ?? m[2] ?? m[3] ?? "").trim();
    if (/[a-zA-Z]{3,}/.test(t) && !out.includes(t)) out.push(t);
  }
  return out;
}

/**
 * Same-doc redirect (JPM bank mode): find the annual-report contents TOC entry
 * whose TITLE matches the section, slice its anchor → the next major-boundary
 * entry's anchor. The bare title also appears 50+ times as a running page
 * header — never bound by title occurrence, only by TOC anchors (F12).
 */
function tryMiniTocRedirect(
  html: string,
  entries: TocEntry[],
  kind: SectionKind,
  excludeTargets: Set<string>,
  minChars: number,
  notes: string[],
): string | null {
  const titleEntries = entries.filter((e) => e.item === undefined && e.title !== "" && !excludeTargets.has(e.target) && !conflictingTocTitle(html, entries, e, kind));
  if (titleEntries.length === 0) return null;
  const pos = anchorPositions(html, titleEntries);

  const start = titleEntries.find((e) => titleMatchesKind(e.title, kind) && (pos.get(e.target) ?? -1) >= 0);
  if (start === undefined) return null;
  const startPos = pos.get(start.target) as number;

  const boundaries = BOUNDARY_SYNONYMS[kind];
  const after = titleEntries.flatMap((e) => {
    const p = pos.get(e.target);
    return p === undefined || p <= startPos || e.target === start.target ? [] : [{ e, p }];
  });
  // A NAMED boundary wins; the all-caps peer rule is a fallback, as in
  // extractFromExhibit. Treated as an equal alternative it ended the slice at
  // the first all-caps SUBSECTION of an all-caps section ("RESULTS OF
  // OPERATIONS" inside "MANAGEMENT'S DISCUSSION AND ANALYSIS") and returned
  // that fragment as the whole MD&A, with no note saying so.
  let endPos = html.length;
  let namedBoundary = false;
  for (const { e, p } of after) {
    const n = normalizeTitle(e.title);
    if (boundaries.some((b) => n.includes(b))) {
      namedBoundary = true;
      if (p < endPos) endPos = p;
    }
  }
  if (!namedBoundary && isAllCaps(start.title)) {
    for (const { e, p } of after) {
      if (isAllCaps(e.title) && p < endPos) endPos = p;
    }
  }
  if (endPos === html.length) {
    // No recognizable boundary in the contents TOC: slicing to EOF inside a
    // primary document would swallow the financial statements — refuse.
    return null;
  }
  const text = htmlToText(html.slice(startPos, endPos));
  if (text.length < minChars) return null;
  if (!namedBoundary) {
    notes.push(
      "mini-TOC slice bounded by the next ALL-CAPS heading (no named section boundary followed the start) — " +
        "the section may be truncated at a subsection heading.",
    );
  }
  return text;
}

/**
 * JPM-style filings can embed the full annual report after the short Item 7
 * wrapper without an anchorable mini-TOC. The annual-report pages repeat a
 * "Form 10-K <page> Management's discussion and analysis" header, which is a
 * stronger redirect signal than a bare title occurrence. Bound the slice at
 * the internal-control / financial-statement transition; never fall back to
 * EOF, which could swallow the audited statements.
 */
function tryAnnualReportPageHeaderRedirect(
  fullText: string,
  stubText: string,
  kind: SectionKind,
  minChars: number,
): string | null {
  if (kind !== "mdna") return null;
  const stubAt = fullText.indexOf(stubText);
  if (stubAt < 0) return null;

  const headerRe = /\bForm\s+10-K\s+\d+\s+Management[\u0027\u2019]s\s+discussion\s+and\s+analysis\b/gi;
  headerRe.lastIndex = stubAt + stubText.length;
  const header = headerRe.exec(fullText);
  if (header === null) return null;

  const boundaryRe = /Management[\u0027\u2019]s\s+Report\s+on\s+Internal\s+Control/gi;
  boundaryRe.lastIndex = header.index + header[0].length;
  const boundary = boundaryRe.exec(fullText);
  if (boundary === null) return null;

  const text = fullText.slice(header.index, boundary.index).trim();
  return text.length >= minChars ? text : null;
}

// ---------------------------------------------------------------------------
// Layer 0 — Citi cross-reference-index mode
// ---------------------------------------------------------------------------

export interface CrossRefEntry {
  item: string;
  title: string;
  pages: [number, number][];
  notApplicable: boolean;
}

const PAGE_RANGES_RE = /^\d{1,4}(?:[\s]*[–—-][\s]*\d{1,4})?(?:[,;][\s]*\d{1,4}(?:[\s]*[–—-][\s]*\d{1,4})?)*[,;]?$/;

function parsePageRanges(s: string): [number, number][] {
  const out: [number, number][] = [];
  for (const part of s.split(/[,;]/)) {
    const p = part.trim();
    if (p === "") continue;
    const m = /^(\d{1,4})(?:[\s]*[–—-][\s]*(\d{1,4}))?$/.exec(p);
    if (m === null) continue;
    const a = Number.parseInt(m[1], 10);
    const b = m[2] !== undefined ? Number.parseInt(m[2], 10) : a;
    out.push([a, b]);
  }
  return out;
}

/**
 * Parse the FORM 10-K CROSS-REFERENCE INDEX (item cells like "7." + title cell
 * + page-range cell, ranges possibly continued on following rows; rows carry
 * NO anchors) — F20.
 */
export function parseCrossRefIndex(html: string): CrossRefEntry[] {
  // Scope row scanning to the region after the index heading so page-range-like
  // cells in unrelated financial tables cannot pollute the parse.
  const markerAt = html.search(/CROSS[-\s]?REFERENCE[\s&#;a-z0-9]{0,24}INDEX/i);
  const region = markerAt >= 0 ? html.slice(markerAt, markerAt + 400_000) : html;
  const entries: CrossRefEntry[] = [];
  const rowRe = /<tr\b[\s\S]*?<\/tr>/gi;
  let row: RegExpExecArray | null;
  let current: CrossRefEntry | null = null;
  while ((row = rowRe.exec(region)) !== null) {
    const rowHtml = row[0];
    if (rowHtml.includes('href="#')) {
      current = null;
      continue; // crossref rows have no links
    }
    const cellTexts: string[] = [];
    const cellRe = /<t[dh]\b[^>]*\/>|<t[dh]\b[^>]*>[\s\S]*?<\/t[dh]>/gi;
    let c: RegExpExecArray | null;
    while ((c = cellRe.exec(rowHtml)) !== null) cellTexts.push(htmlToText(c[0]).trim());
    const nonEmpty = cellTexts.filter((t) => t !== "");
    if (nonEmpty.length === 0) continue;

    const itemCell = nonEmpty.find((t) => /^\d{1,2}[A-C]?\.$/i.test(t));
    const naCell = nonEmpty.find((t) => /^not[\s]+applicable$/i.test(t));
    const pageCell = nonEmpty.find((t) => PAGE_RANGES_RE.test(t));

    if (itemCell !== undefined) {
      const title = nonEmpty.filter((t) => t !== itemCell && t !== pageCell && t !== naCell).reduce((a, b) => (b.length > a.length ? b : a), "");
      current = {
        item: normItem(itemCell.replace(/\.$/, "")),
        title,
        pages: pageCell !== undefined ? parsePageRanges(pageCell) : [],
        notApplicable: naCell !== undefined,
      };
      entries.push(current);
    } else if (current !== null && pageCell !== undefined && nonEmpty.every((t) => t === pageCell || PAGE_RANGES_RE.test(t) || t === "")) {
      current.pages.push(...parsePageRanges(pageCell));
    } else if (nonEmpty.some((t) => t.length > 3 && !PAGE_RANGES_RE.test(t))) {
      current = null;
    }
  }
  return entries;
}

function layer0Citi(
  html: string,
  entries: TocEntry[],
  fullText: string,
  spec: SectionSpec,
  notes: string[],
): { text: string } | { notRequired: true } | null {
  if (!/CROSS[-\s]?REFERENCE[\s]+INDEX/i.test(fullText.slice(0, 200_000)) && !/CROSS[-\s]?REFERENCE[\s]+INDEX/i.test(fullText)) return null;
  const crossRef = parseCrossRefIndex(html);
  const wanted = normItem(spec.item);
  const entry = crossRef.find((e) => e.item === wanted);
  if (entry === undefined) return null;
  if (entry.notApplicable) return { notRequired: true };
  if (entry.pages.length === 0) return null;

  // Contents-TOC entries: title + page number + anchor (Citi: page number is the link text).
  const paged = entries.filter((e) => e.pageNo !== undefined && e.title !== "");
  if (paged.length === 0) return null;
  const pos = anchorPositions(html, paged);
  const ordered = paged.filter((e) => (pos.get(e.target) ?? -1) >= 0).sort((a, b) => a.rowIndex - b.rowIndex);

  const pieces: string[] = [];
  for (const [a, b] of entry.pages) {
    const startIdx = ordered.findIndex((e) => (e.pageNo as number) >= a && (e.pageNo as number) <= b);
    if (startIdx === -1) {
      notes.push(`citi-mode: no contents-TOC entry for page range ${a}-${b}`);
      continue;
    }
    const start = ordered[startIdx];
    const startPos = pos.get(start.target) as number;
    // End: first later TOP-LEVEL (all-caps) entry reaching page >= b, else first entry past b.
    let endPos = html.length;
    let fallbackEnd = html.length;
    for (let i = startIdx + 1; i < ordered.length; i++) {
      const e = ordered[i];
      const p = pos.get(e.target) as number;
      if (p <= startPos) continue;
      if ((e.pageNo as number) > b && p < fallbackEnd) fallbackEnd = p;
      if (isAllCaps(e.title) && (e.pageNo as number) >= b && e.target !== start.target) {
        endPos = p;
        break;
      }
    }
    if (endPos === html.length) endPos = fallbackEnd;
    const text = htmlToText(html.slice(startPos, endPos));
    if (text.length > 0) pieces.push(text);
  }
  if (pieces.length === 0) return null;
  notes.push(`citi-mode: assembled ${pieces.length}/${entry.pages.length} page range(s) for Item ${wanted}`);
  return { text: pieces.join("\n\n") };
}

/**
 * Hidden-block strip + TOC/anchor parse + flattened text — the expensive,
 * whole-document part of extraction. Callers extracting multiple sections
 * from the same fetched document should call this once and pass the result
 * to `extractSection` via `ExtractOptions.preparsed` instead of paying the
 * full-document parse cost once per section.
 */
export function parseDocument(html: string): ParsedDocument {
  const pre = stripHiddenBlocks(html);
  const entries = parseTocEntries(pre);
  const fullText = htmlToText(pre);
  const document = { pre, entries, fullText };
  originalDocuments.set(document, html);
  return document;
}

// ---------------------------------------------------------------------------
// extractSection — main entry
// ---------------------------------------------------------------------------

export function extractSection(html: string, spec: SectionSpec, opts: ExtractOptions = {}): ExtractResult {
  const parsed = opts.preparsed ?? parseDocument(html);
  const result = extractItemSection(html, spec, { ...opts, preparsed: parsed });
  if (!result.ok || specKind(spec) !== "financialStatements") return result;
  const opening = (text: string) => spec.form === "10-K"
    ? annualNotesToFinancialStatements(text, parsed, spec.item === "15" ? "15" : "8")
    : notesToFinancialStatements(text, parsed);
  const originalNotes = opening(result.text);
  if (originalNotes === null || financialStatementText(result.text.slice(0, originalNotes.start), 12_000, parsed).statementsText !== undefined) return result;
  const diagnostics = { ...result.diagnostics, notes: [...result.diagnostics.notes] };
  const header = layer2Slice(parsed.fullText, spec, diagnostics.notes, originalNotes.text);
  const candidates = [
    header && !header.zeroCandidates && !header.missingBoundary ? { text: header.text, method: "header-regex" as const } : null,
    layer1Slice(parsed.pre, parsed.entries, spec, diagnostics.notes, true),
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const recoveredNotes = opening(candidate.text);
    // Repeated page headings must not silently discard any later notes.
    if (recoveredNotes?.text !== originalNotes.text ||
        financialStatementText(candidate.text.slice(0, recoveredNotes.start), 12_000, parsed).statementsText === undefined) continue;
    diagnostics.notes.push("recovered statement rows before the byte-identical notes using bounded item headers/anchors");
    return { ok: true, text: candidate.text, chars: candidate.text.length, method: candidate.method, diagnostics };
  }
  return result;
}

function extractItemSection(html: string, spec: SectionSpec, opts: ExtractOptions): ExtractResult {
  if (spec.form === "40-F") {
    return { ok: false, error: new ExtractionError("unresolved_reference",
      "Form 40-F supplies annual disclosures through annual-report exhibits rather than numbered 10-K/20-F items; resolve the referenced annual report from the filing index before extracting narrative"),
    diagnostics: { layersTried: ["form-structure"], tocEntryCount: 0, itemEntryCount: 0, notes: [] } };
  }
  const minChars = opts.stubMinChars ?? STUB_MIN_CHARS;
  const notes: string[] = [];
  const layersTried: string[] = [];

  const parsed = opts.preparsed ?? parseDocument(html);
  const { pre, entries, fullText } = parsed;
  const diagnostics: ExtractDiagnostics = {
    layersTried,
    tocEntryCount: entries.length,
    itemEntryCount: entries.filter((e) => e.item !== undefined).length,
    notes,
  };

  let sectionText: string | null = null;
  let method: ExtractMethod = "toc-anchor";
  let startTarget: string | undefined;
  let zeroCandidates = true;

  // Layer 0 FIRST for Citi-mode documents: zero item-numbered TOC entries plus
  // a FORM 10-K CROSS-REFERENCE INDEX (F20). This must precede the title-only
  // Layer-1 variant, because on Citi that variant would silently return a
  // PARTIAL Item 7 (the cross-reference index maps it to NON-contiguous page
  // ranges that only layer 0 can assemble).
  const hasItemEntries = entries.some((e) => e.item !== undefined);
  if (!hasItemEntries && /CROSS[-\s]?REFERENCE[\s]+INDEX/i.test(fullText)) {
    layersTried.push("layer0-crossref-index");
    const citi = layer0Citi(pre, entries, fullText, spec, notes);
    if (citi !== null) {
      if ("notRequired" in citi) {
        return fail(diagnostics, new ExtractionError("not_required", `Item ${spec.item} is marked Not Applicable in the cross-reference index`));
      }
      const citiStub = detectStub(citi.text, minChars);
      if (!citiStub.isStub) return ok(citi.text, "crossref-toc", diagnostics);
      diagnostics.stub = { chars: citi.text.length, excerpt: citi.text.slice(0, 300) };
      notes.push(`citi-mode slice was a stub: ${citiStub.reason}`);
    }
  }

  layersTried.push("layer1-toc-anchor");
  const l1 = layer1Slice(pre, entries, spec, notes);
  if (l1 !== null) {
    sectionText = l1.text;
    method = l1.method;
    startTarget = l1.startTarget;
    zeroCandidates = false;
  } else {
    layersTried.push("layer2-header-regex");
    const l2 = layer2Slice(fullText, spec, notes);
    if (l2?.missingBoundary) {
      const financial = specKind(spec) === "financialStatements" ? "; no complete financial-statement section boundaries were proved" : "";
      return fail(diagnostics, new ExtractionError("unresolved_reference", `Item ${spec.item}: no closing item boundary was established; document/window end is not a section boundary${financial}. Source reference: ${l2.text}`));
    }
    if (l2 !== null && !l2.zeroCandidates) {
      sectionText = l2.text;
      method = "header-regex";
      zeroCandidates = false;
    } else if (l2 !== null) {
      zeroCandidates = true;
    }
  }

  if (sectionText === null && spec.form === "20-F" && spec.item === "3D") {
    layersTried.push("layer2-unlettered-20f-risk");
    sectionText = unletteredTwentyFRisk(pre, fullText);
    if (sectionText !== null) {
      method = "header-regex";
      notes.push("20-F unlettered Risk Factors heading bounded by Item 3 and Item 4");
    }
  }

  if (sectionText === null) {
    // Late Layer-0 retry: docs whose item entries were all bogus/unresolvable
    // but that do carry a cross-reference index (not attempted above).
    if (zeroCandidates && hasItemEntries) {
      layersTried.push("layer0-crossref-index");
      const citi = layer0Citi(pre, entries, fullText, spec, notes);
      if (citi !== null) {
        if ("notRequired" in citi) {
          return fail(diagnostics, new ExtractionError("not_required", `Item ${spec.item} is marked Not Applicable in the cross-reference index`));
        }
        const stub = detectStub(citi.text, minChars);
        if (!stub.isStub) {
          return ok(citi.text, "crossref-toc", diagnostics);
        }
        diagnostics.stub = { chars: citi.text.length, excerpt: citi.text.slice(0, 300) };
      }
    }
    const recovered = recoverAnnualSection(parsed, spec, minChars, diagnostics, opts.recoveryDeadlineMs);
    if (recovered !== null) return recovered;
    return fail(
      diagnostics,
      new ExtractionError("no_section_found", `no extraction layer located ${spec.form} Item ${spec.item}${spec.form === "10-Q" ? ` (Part ${specPart(spec)})` : ""}`),
    );
  }

  // Layer 3 — MANDATORY stub detection.
  layersTried.push("layer3-stub-detector");
  const stub = detectStub(sectionText, minChars);
  if (!stub.isStub) return ok(sectionText, method, diagnostics);

  diagnostics.stub = { chars: sectionText.length, excerpt: sectionText.slice(0, 300) };
  notes.push(`stub detected: ${stub.reason}`);

  // 3c — 10-Q Part II Item 1A "unchanged from 10-K" marker.
  if (spec.form === "10-Q" && normItem(spec.item) === "1A" && specPart(spec) === 2 && UNCHANGED_10K_RE.test(sectionText)) {
    return { ok: true, text: sectionText, method: "unchanged-from-10k", chars: sectionText.length, marker: "unchanged_from_10k", diagnostics };
  }

  // "Not required." / "None." bodies (F10) — legitimate absence, disclosed loudly.
  if (sectionText.length < 600 && NOT_REQUIRED_RE.test(sectionText)) {
    return fail(diagnostics, new ExtractionError("not_required", `Item ${spec.item} body is "${sectionText.slice(-80).trim()}" — not required for this filer`));
  }

  // 3a — same-doc mini-TOC redirect (JPM).
  layersTried.push("layer3a-mini-toc");
  const exclude = new Set<string>(startTarget !== undefined ? [startTarget] : []);
  const redirected = tryMiniTocRedirect(pre, entries, specKind(spec), exclude, minChars, notes);
  if (redirected !== null) {
    const check = detectStub(redirected, minChars);
    if (!check.isStub) {
      notes.push("same-doc mini-TOC redirect succeeded");
      return ok(redirected, "mini-toc-redirect", diagnostics);
    }
  }

  if (spec.form === "10-K") {
    layersTried.push("layer3a2-page-header");
    const pageHeaderRedirect = tryAnnualReportPageHeaderRedirect(fullText, sectionText, specKind(spec), minChars);
    if (pageHeaderRedirect !== null) {
      notes.push("annual-report page-header redirect succeeded");
      return ok(pageHeaderRedirect, "page-header-redirect", diagnostics);
    }
  }

  // 3b — exhibit redirect signal (FRD/WFC/Seneca). Caller resolves EX-13 via
  // the index-headers TYPE map and calls extractFromExhibit().
  if (EXHIBIT_PHRASE_RE.test(sectionText)) {
    layersTried.push("layer3b-exhibit-redirect");
    const quoted = parseQuotedTitles(sectionText);
    return fail(
      diagnostics,
      new ExtractionError("exhibit_redirect", `Item ${spec.item} is incorporated by reference into an exhibit (resolve EX-13* via index-headers TYPE map)`, {
        quotedTitles: quoted,
        exhibitTypePrefix: "EX-13",
        section: specKind(spec),
        stubText: sectionText,
      }),
    );
  }

  const recovered = recoverAnnualSection(parsed, spec, minChars, diagnostics, opts.recoveryDeadlineMs);
  if (recovered !== null) return recovered;

  if (spec.form === "10-K" && ["8", "15"].includes(spec.item) &&
      /\b(?:index|Item\s+15\b)/i.test(sectionText) && /\bFinancial Statement(?:s| Schedules)\b/i.test(sectionText)) {
    return fail(diagnostics, new ExtractionError("unresolved_reference",
      `${spec.form} Item ${spec.item} points to a same-document financial-statement index; no complete financial-statement section boundaries were proved. Source reference: ${sectionText.slice(0, 400)}`));
  }

  // Layer 4 — loud hard-fail. NEVER return a stub silently.
  layersTried.push("layer4-hard-fail");
  return fail(
    diagnostics,
    new ExtractionError("stub_detected", `extracted ${spec.form} Item ${spec.item} is a ${sectionText.length}-char stub (${stub.reason}) and no redirect succeeded`),
  );

  function ok(text: string, m: ExtractMethod, d: ExtractDiagnostics): ExtractResult {
    return { ok: true, text, method: m, chars: text.length, diagnostics: d };
  }
  function fail(d: ExtractDiagnostics, e: ExtractionError): ExtractResult {
    return { ok: false, error: e, diagnostics: d };
  }
}

// ---------------------------------------------------------------------------
// Notes to the financial statements (D-63)
// ---------------------------------------------------------------------------

const NOTES_HEADING_RE = /\bNotes to (?:the )?(?:Condensed )?(?:Consolidated )?(?:Financial Statements|Financial Information)\b/gi;
const FIRST_NOTE_RE = /^[\s\S]{0,300}?(?:\bNote\s+(?:1|A|One)\b|\b1\s*[.:–—-]\s*[A-Z]|\(1\)\s*[A-Z])/i;

/**
 * The notes portion of a 10-Q Part I Item 1: from the first "Notes to
 * (Condensed) (Consolidated) Financial Statements" heading that is followed by
 * its first note, to the end of the item. The statements before it are tables
 * the payload already carries as typed figures. `start` is the offset in the
 * item text; null when no substantive opening is found. The caller supplies
 * an already bounded item. A null result leaves the caller to retain that
 * proved financial item with its broader identity, or report a specific gap.
 */
export function notesToFinancialStatements(itemText: string, source?: ParsedDocument, currentItem = 1): { text: string; start: number } | null {
  for (const match of itemText.matchAll(NOTES_HEADING_RE)) {
    // "See accompanying notes to condensed consolidated financial statements."
    // closes each statement page; it is a reference, not the heading.
    if (/\b(?:accompanying|see|refer to)\s+(?:the\s+)?$/i.test(itemText.slice(Math.max(0, match.index - 30), match.index))) continue;
    const after = itemText.slice(match.index + match[0].length, match.index + match[0].length + 400);
    const first = /\bNote\s+(?:1|A|One)\b|\b1\s*[.:–—-]\s*[A-Z]|\(1\)\s*[A-Z]/i.exec(after);
    if (first && new RegExp(NOTES_HEADING_RE.source, "i").test(after.slice(0, first.index))) continue;
    if (FIRST_NOTE_RE.test(after) && !notesContentsOpening(after) && !notesReferenceOpening(after)) return sourceNotesBoundary(boundFinancialNotes({ text: itemText.slice(match.index), start: match.index }), source, currentItem);
  }
  const recognized = recognizeAnnualNotes(itemText) ?? recognizeSourceNotes(itemText, source);
  return recognized === null ? null : sourceNotesBoundary(boundFinancialNotes(recognized), source, currentItem);
}

/** Recovery only: original standalone blocks prove typography and first-note
 * bodies that the legacy title grammar misses. Existing successful text wins. */
function recognizeSourceNotes(itemText: string, source?: ParsedDocument): { text: string; start: number } | null {
  if (!source) return null;
  let structure = annualRecoveryStructures.get(source);
  if (structure === undefined) {
    structure = appendixStructure(source.pre, true);
    annualRecoveryStructures.set(source, structure);
  }
  if (!structure) return null;
  const blocks = structure.elements.filter(n => !n.hidden && !n.blockChild && /^(?:p|div|h[1-6]|td|th)$/.test(n.tag));
  for (const node of blocks) {
    if (source.pre.slice(node.start, node.end).length > 30_000) continue;
    const caption = structure.text(node.start, node.end).trim();
    if (caption.length > 220) continue;
    let linked = /<a\b[^>]*href\s*=/i.test(source.pre.slice(node.start, node.end));
    for (let p = node.parent; p && !linked; p = p.parent) linked = p.tag === "a" && p.attrs.has("href");
    if (linked) continue;
    const key = caption.replace(/[\s()]/g, "");
    const title = /^Notesto(?:the)?(?:(?:Unaudited|Interim|Condensed|Consolidated))*Financial(?:Statements|Information)(?:Unaudited)?$/i.test(key);
    const firstNote = /^NOTE\s+1\s*[-–—:.]\s+[A-Z]/i.test(caption) && !/\d\s*$/.test(caption);
    if (!title && !firstNote) continue;
    const after = structure.text(node.end, Math.min(source.pre.length, node.end + 50_000)).trim();
    if (notesContentsOpening(after.slice(0, 400)) || notesReferenceOpening(after)) continue;
    const first = /(?:^|\s)(?:Note\s+1\s*[-–—:.]|1\s*[.():–—-])\s*[A-Z]/i.exec(after.slice(0, 1_600));
    const basis = blocks.some(n => n.start >= node.end && n.start < node.end + 50_000 &&
      /^Basis of Presentation$/i.test(structure!.text(n.start, n.end)) && after.indexOf("Basis of Presentation") < 1_600);
    if (title && !first && !basis) continue;
    // A first-note contents row is followed by a page/another label, not prose.
    if (firstNote && (/^(?:\d{1,4}\b|F\s*-\s*\d+\b|Note\s+2\b)/i.test(after) || after.length < 120)) continue;
    const witnessed = `${caption} ${after.slice(0, 160)}`;
    const start = itemText.indexOf(witnessed);
    if (start < 0 || itemText.indexOf(witnessed, start + 1) !== -1 || detectStub(itemText.slice(start)).isStub) continue;
    return { text: itemText.slice(start), start };
  }
  return null;
}

/** The caller has established Item 1/8 (or a closed foreign Item 18). Retain
 * its broader financial identity when a notes-only opening cannot be proved. */
export function financialStatementsAndNotes(itemText: string, source?: ParsedDocument, currentItem = 1): { text: string; start: number } | null {
  let start = 0;
  const itemHeader = new RegExp(`(?:^|\\bTable of Contents\\s+)Item\\s+${currentItem}\\b[\\s\\S]{0,80}Financial\\s+St\\s*atements\\b`, "i");
  let provedOpening = itemHeader.test(itemText.slice(0, 250));
  const report = EXTERNAL_FINANCIAL_REPORT_RE.exec(itemText);
  // Annual Item 8 can put the audit opinion before the statements. A visible,
  // standalone statement caption proves where the financial body resumes.
  if (source && (report || !provedOpening)) {
    let structure = annualRecoveryStructures.get(source);
    if (structure === undefined) {
      structure = appendixStructure(source.pre, true);
      annualRecoveryStructures.set(source, structure);
    }
    if (structure) for (const n of structure.elements) {
      if (n.hidden || n.blockChild || !/^(?:p|div|h[1-6]|td)$/.test(n.tag)) continue;
      const caption = structure.text(n.start, n.end);
      if (!/^(?:(?:Unaudited|Interim|Condensed|Consolidated)\s+)*(?:Balance Sheets?|Statements? of (?:Financial Position|Income|Operations|Earnings|Cash Flows))$/i.test(caption)) continue;
      if (/<a\b[^>]*href\s*=/i.test(source.pre.slice(n.start, n.end))) continue;
      let linked = false;
      for (let p = n.parent; p; p = p.parent) if (p.tag === "a" && p.attrs.has("href")) linked = true;
      if (linked) continue;
      const following = structure.text(n.end, Math.min(source.pre.length, n.end + 50_000)).trim();
      const witnessed = `${caption} ${following.slice(0, 160)}`, at = itemText.indexOf(witnessed);
      if (at < 0 || itemText.indexOf(witnessed, at + 1) !== -1) continue;
      if (at <= 250) provedOpening = true;
      if (report && at > report.index) { start = at; provedOpening = true; }
      break;
    }
  }
  if (!provedOpening) return null;
  const bounded = sourceNotesBoundary(boundFinancialNotes({ text: itemText.slice(start), start }), source, currentItem);
  return detectStub(bounded.text).isStub ? null : bounded;
}

/** A source heading closes notes; the same words inside a note never do.
 * Match the preceding source context as well as the caption, preserving the
 * caller's exact text offsets instead of substituting another flattening. */
function sourceNotesBoundary(notes: { text: string; start: number }, source?: ParsedDocument, currentItem: number | null = 1): { text: string; start: number } {
  if (!source) return notes;
  let structure = annualRecoveryStructures.get(source);
  if (structure === undefined) {
    structure = appendixStructure(source.pre, true);
    annualRecoveryStructures.set(source, structure);
  }
  if (!structure) return notes;
  const inTable = (n: AppendixElement) => {
    for (let p = n.parent; p; p = p.parent) if (p.tag === "table") return true;
    return false;
  };
  const inLink = (n: AppendixElement) => {
    for (let p = n.parent; p; p = p.parent) if (p.tag === "a" && p.attrs.has("href")) return true;
    return false;
  };
  const position = (node: AppendixElement, caption: string): number | null => {
    if (!notes.text.includes(caption)) return null;
    const locate = (preceding: string): number | null => {
      if (preceding.length < 40) return null;
      const witnessed = `${preceding} ${caption}`;
      const at = notes.text.indexOf(witnessed);
      return at < 0 || notes.text.indexOf(witnessed, at + 1) !== -1 ? null : at + preceding.length;
    };
    const nearby = htmlToText(source.pre.slice(Math.max(0, node.start - 8_000), node.start)).slice(-160);
    // Dense layout can start the nearby window inside an attribute. The full
    // prefix uses complete tokens instead of admitting partial markup.
    return locate(nearby) ?? locate(htmlToText(source.pre.slice(0, node.start)).slice(-160));
  };
  let noteHeads: { at: number; number: number }[] | undefined;
  const continuesAfter = (boundary: number): boolean => {
    if (noteHeads === undefined) {
      noteHeads = [];
      for (const node of structure.elements) {
        if (node.hidden || node.blockChild || inLink(node) || !/^(?:p|div|h[1-6]|td|th)$/.test(node.tag)) continue;
        const html = source.pre.slice(node.start, node.end), caption = htmlToText(html);
        const explicit = /^Note\s+(\d{1,2}|[A-Z])(?=$|\s|[.:–—-](?!\d))/i.exec(caption);
        const bare = !explicit && (/^h[1-6]$/.test(node.tag) || /<(?:b|strong)\b|font-weight\s*:\s*(?:bold|[6-9]00)/i.test(html))
          ? /^(?:\((\d{1,2})\)|(\d{1,2})[.:–—-])\s+/.exec(caption) : null;
        if (!explicit && !bare) continue;
        const rest = caption.slice((explicit ?? bare)![0].length).replace(/^[\s.:–—-]+/, "");
        if (/^(?:to|of|is|was|as|above|below|for|see|refer|the|this|these|includes?|amounts?|represents?|in|all|our|certain|based|total|such|reflects?)\b/i.test(rest)) continue;
        if (caption.length < 220 && /<a\b[^>]*href\s*=/i.test(html)) continue;
        const label = explicit?.[1] ?? bare?.[1] ?? bare?.[2] ?? "";
        const number = /^\d+$/.test(label) ? Number(label) : label.toUpperCase().charCodeAt(0) - 64;
        const at = position(node, caption.slice(0, 120));
        if (at !== null) noteHeads.push({ at, number });
      }
    }
    const preceding = Math.max(0, ...noteHeads.filter(n => n.at < boundary).map(n => n.number));
    return noteHeads.some(n => n.at > boundary && n.number > preceding);
  };
  let end = notes.text.length;
  for (const node of structure.elements) {
    if (node.hidden || node.blockChild || !/^(?:p|div|h[1-6]|li|center|section|article|header|blockquote|td|th)$/.test(node.tag)) continue;
    const caption = htmlToText(source.pre.slice(node.start, node.end));
    if (caption.length > 220 || inLink(node) || /<a\b[^>]*href\s*=/i.test(source.pre.slice(node.start, node.end))) continue;
    const named = /^(?:Glossary(?: of (?:Common )?Terms(?: and Acronyms)?)?|Acronyms|(?:Supplemental|Supplementary) Financial Information|Management[’']s (?:Reports?|Assessment of Internal Control Over Financial Reporting|Responsibility for (?:the )?(?:Consolidated )?Financial Statements)|Report of Management|Unregistered Sales of Equity Securities(?:, Repurchases of Equity Securities and Dividends)?)$/i.test(caption);
    const itemNumber = /^Item\s+(\d{1,2})(?:\s*\.?\s*[A-D])?\s*[.:]?\s+/i.exec(caption);
    const item = currentItem !== null && itemNumber !== null && Number(itemNumber[1]) > currentItem &&
      !/\b(?:above|below|provides?|describes?|discusses?|included|includes?|appears?|refers?|in this|of this)\b/i.test(caption) &&
      [...TENK_SEQUENCE, ...TENQ_P1_SEQUENCE, ...TENQ_P2_SEQUENCE,
        ...(currentItem === 18 ? [{ id: "19", title: /Exhibits/i }] : [])]
        .some(def => findHeaderCandidates(caption, def, 0, caption.length, true).some(c => c.index === 0));
    if (!named && (!item || inTable(node))) continue;
    const boundary = position(node, caption);
    // An unnumbered caption may be a subsection of a note. A later proved,
    // advancing note heading keeps it inside the same notes interval.
    if (boundary !== null && !(named && continuesAfter(boundary))) end = Math.min(end, boundary);
  }
  return end < notes.text.length ? { ...notes, text: notes.text.slice(0, end).trimEnd() } : notes;
}

function notesReferenceOpening(after: string): boolean {
  return /^\s*(?:\(unaudited\)\s*)?[.,;:]?\s*(?:are\s+an?\s+integral\b|See\b|Refer\b|appearing\b|tagged\b)/i.test(after);
}

/** A first-note label and page number followed by another note is navigation. */
function notesContentsOpening(after: string): boolean {
  return /^\s*:?\s*Page\b/i.test(after) ||
    /^\s*\d{2,4}\s+(?:Note\s+)?1\b/i.test(after) ||
    /\b(?:\d{1,4}|F\s*-\s*\d{1,4})\s+(?:Note\s+2\b|2\s*\.\s*[A-Z])/i.test(after) ||
    /^\s*:?\s*Note\s+1\b[^.]{0,150}\.{2,}\s*\d/i.test(after);
}

/**
 * D-66: where an annual filing's notes end — at the valuation-and-qualifying-
 * accounts schedule, the exhibit index or Item 16 — whichever comes first
 * after the notes begin. Item 15 carries all three after the last note.
 */
const ANNUAL_NOTES_END_RE = /\bSchedule [IVX]+\s*[-–—:]?\s*(?:Consolidated\s+)?(?:Valuation and Qualifying Accounts|Supplementary Insurance Information|Reinsurance|Summary of Investments|Condensed Financial Information)\b|\bExhibit Index\b|\bItem 16\.?\s+Form 10-K Summary\b|\bSupplementary Information:\s+Distribution\b/gi;
const EXTERNAL_FINANCIAL_REPORT_RE = /\bREPORT OF INDEPENDENT REGIST\s*ERED PUBLIC ACCOUNTING FIRM(?: on Financial Statement Schedules)?\s+To the (?:Stockholders|Shareholders|Shareowners|Board of Directors)\b[\s\S]{0,350}?(?:Opinions? on the (?:Consolidated )?Financial Statements|Results of Review of Interim Financial Information|We have (?:audited|reviewed)|Our audits of the consolidated financial statements)\b/i;

/** All notes paths share the same external-report stop; a prose mention is insufficient. */
function boundFinancialNotes(notes: { text: string; start: number }, textAppendices = true): { text: string; start: number } {
  const stops: number[] = [];
  const auditor = EXTERNAL_FINANCIAL_REPORT_RE.exec(notes.text);
  if (auditor) stops.push(auditor.index);
  const signatures = /\bSIGNATURES\s+Pursuant to the requirements of the Securities Exchange Act\b/i.exec(notes.text);
  if (signatures) stops.push(signatures.index);
  const management = /\b(?:REPORT OF MANAGEMENT\s+Management[’']s Responsibility for the Financial Statements|Management[’']s Reports(?=\s+Management[’']s Report (?:for Financial Statements|on Internal Control Over Financial Reporting))|Management[’']s Report (?:for Financial Statements|on Internal Control Over Financial Reporting)[\s\S]{0,160}?\bManagement (?:of|is)\b[\s\S]{0,150}?\bresponsible\b)/i.exec(notes.text);
  if (management && !REJECT_BEFORE_RE.test(notes.text.slice(Math.max(0, management.index - 40), management.index))) stops.push(management.index);
  if (textAppendices) for (const end of notes.text.matchAll(ANNUAL_NOTES_END_RE)) {
    if (REJECT_BEFORE_RE.test(notes.text.slice(Math.max(0, end.index - 40), end.index)) ||
      /^\s+(?:provides?|describes?|discusses?|contains?|is|are|included|above|below)\b/i.test(notes.text.slice(end.index + end[0].length))) continue;
    if (end.index > 0) { stops.push(end.index); break; }
  }
  return stops.length ? { text: notes.text.slice(0, Math.min(...stops)).trimEnd(), start: notes.start } : notes;
}

/**
 * D-66: the notes of a 10-K Item 8 (or Item 15): from the notes heading
 * ({@link notesToFinancialStatements}) to the schedules or exhibit index.
 * Null when no notes heading is found.
 */
export function annualNotesToFinancialStatements(itemText: string, source?: ParsedDocument, item: "8" | "15" = "8"): { text: string; start: number } | null {
  return notesToFinancialStatements(itemText, source, Number(item));
}

// Closed vocabulary tolerates inline font-run word splits only in the title.
// Offsets and returned source text are never normalized. Legacy successes win.
const ANNUAL_NOTES_HEADING = new RegExp("\\bNotes\\s+to\\s+(?:the\\s+)?(?:" +
  "Consolidated".split("").join("\\s*") + "\\s+)?" +
  "Financial".split("").join("\\s*") + "\\s+Statements\\b", "gi");
function recognizeAnnualNotes(text: string): { text: string; start: number } | null {
  for (const m of text.matchAll(ANNUAL_NOTES_HEADING)) {
    if (/\b(?:accompanying|see|refer to)\s+(?:the\s+)?$/i.test(text.slice(Math.max(0, m.index - 30), m.index))) continue;
    const after = text.slice(m.index + m[0].length).replace(/^\s*\(Unaudited\)/i, "");
    if (notesReferenceOpening(after) || notesContentsOpening(after.slice(0,400))) continue;
    const numbered = /^\s*(?:[A-Z][a-z]+\s+\d{1,2},\s+\d{4}\s+|\(Tabular dollars[^)]{0,150}\)\s*)?(?:NOTE\s+1\s*[-:.–—]?\s*|1\s*\.?\s+)(?:ACCOUNTING POLICIES|BASIS OF PRESENTATION|Description of the Business and Segment Information|ORGANIZATION AND SIGNI\s*FICANT ACCOUNTING POLICIES)\b/i.exec(after);
    if (numbered && /^\s*(?:\d{1,4}\b|F\s*-\s*\d{1,4}\b|\.{2,}|See\b|Refer\b|is described\b|is incorporated\b)/i.test(after.slice(numbered[0].length))) continue;
    const unnumbered = /^\s*Summary of Significant Accounting Policies\s+NATURE OF BUSINESS\s+/i.test(after) &&
      /\bCONSOLIDATION\s+The Consolidated Financial Statements include\b/i.test(after);
    if ((numbered || unnumbered) && !detectStub(text.slice(m.index)).isStub) return { text: text.slice(m.index), start: m.index };
  }
  return null;
}

/** Compact optional evidence; offsets are JS UTF-16 indices in the original HTML. */
export interface AnnualNotesRedirectEvidence {
  coordinateSystem: "original-html-characters";
  index: { start: number; end: number };
  /** Logical item proved around the financial index, not a running page header. */
  enclosingItem?: "8" | "15";
  notes: { target: string; page: { namespace: "F" | ""; number: number }; start: number };
  schedule?: { target: string; page: { namespace: "S"; number: number }; start: number };
  boundary?: { start: number; kind: "heading" | "document-end"; lastPage: number };
  statements?: { target: string; start: number; retainedChars: number };
}

interface AppendixElement {
  tag: string;
  start: number;
  end: number;
  attrs: Map<string, string>;
  parent?: AppendixElement;
  hidden: boolean;
  blockChild: boolean;
}

/**
 * Local lexical proof, BEFORE destructive preprocessing. Only balanced explicit
 * markup is supported; no DOM repair, stylesheet visibility or global parser
 * change. Actual text nodes, never quoted attribute contents, establish titles.
 * Annual acquisition supplies the full source under its existing elapsed budget:
 * the guidance/event collector's unrelated 2M cap does not apply here.
 */
function appendixStructure(source: string, filingLayout = false, expired?: () => boolean) {
  const elements: AppendixElement[] = [];
  const stack: AppendixElement[] = [];
  const spans: { start: number; end: number; text: string; parent?: AppendixElement }[] = [];
  const blocks = /^(?:h[1-6]|p|div|td|th|tr|table|section)$/;
  const voids = /^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/;
  let cursor = 0;
  let tokens = 0;
  while (cursor < source.length) {
    if ((++tokens & 1023) === 0 && expired?.()) return null;
    const start = source.indexOf("<", cursor);
    const textEnd = start < 0 ? source.length : start;
    if (!stack.at(-1)?.hidden && textEnd > cursor) spans.push({ start: cursor, end: textEnd, text: source.slice(cursor, textEnd), parent: stack.at(-1) });
    if (start < 0) { cursor = source.length; break; }
    if (source.startsWith("<!--", start)) {
      const end = source.indexOf("-->", start + 4);
      if (end < 0) return null;
      cursor = end + 3;
      continue;
    }
    let quote = "";
    let end = start + 1;
    for (; end < source.length; end++) {
      const ch = source[end]!;
      if (quote) { if (ch === quote) quote = ""; }
      else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === ">") break;
      else if (ch === "<") return null;
    }
    if (end === source.length) return null;
    const token = source.slice(start, end + 1);
    cursor = end + 1;
    if (filingLayout && /^<\?xml\s[^?]*\?>$/i.test(token) && source.slice(0, start).trim() === "") continue;
    if (/^<!doctype\s[^<>]*>$/i.test(token)) continue;
    const close = /^<\/([a-z][\w:.-]*)\s*>$/i.exec(token);
    if (close) {
      const node = stack.pop();
      if (!node || node.tag !== close[1]!.toLowerCase()) return null;
      node.end = cursor;
      continue;
    }
    const open = /^<([a-z][\w:.-]*)([\s\S]*?)\/?\s*>$/i.exec(token);
    if (!open) return null;
    const attrs = new Map<string, string>();
    const tail = open[2]!;
    const attrRe = /\s+([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`=]+)))?/y;
    let at = 0;
    while (at < tail.length && tail.slice(at).trim() !== "") {
      attrRe.lastIndex = at;
      const attr = attrRe.exec(tail);
      if (!attr) return null;
      const name = attr[1]!.toLowerCase();
      if (attrs.has(name)) return null;
      attrs.set(name, decodeEntities(attr[2] ?? attr[3] ?? attr[4] ?? ""));
      at = attrRe.lastIndex;
    }
    const tag = open[1]!.toLowerCase();
    // HTML ignores a self-closing slash on nonvoid elements. Treating it as
    // an end could discard a hidden ancestor; this route does not repair HTML.
    // EDGAR layout generators emit empty <td/> spacers. Only the recovery
    // routes admit that spelling, and only immediately before another cell or
    // the row close, where HTML's implied cell end has the same text bounds.
    // The original annual-notes proof remains strict.
    const emptyCell = filingLayout && /^(?:td|th)$/.test(tag) && /^\s*<(?:t[dh]\b|\/tr\s*>)/i.test(source.slice(cursor, cursor + 100));
    const metadataEmpty = filingLayout && !!stack.at(-1)?.hidden && /^(?:(?:link|xbrli|xbrldi):|ix:relationship$)/.test(tag);
    if (/\/\s*>$/.test(token) && !voids.test(tag) && !emptyCell && !metadataEmpty) return null;
    // These raw-text/fallback modes require browser state or special end rules;
    // never reinterpret their contents as ordinary element/text-node evidence.
    if (/^(?:xmp|iframe|noembed|noframes|noscript|plaintext)$/.test(tag)) return null;
    const parent = stack.at(-1);
    const hidden = !!parent?.hidden || attrs.has("hidden") || /^(?:ix:hidden|ix:header|template|script|style)$/.test(tag) ||
      /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse))\s*(?:!important)?\s*(?:;|$)/i.test(attrs.get("style") ?? "");
    const node: AppendixElement = { tag, start, end: cursor, attrs, parent, hidden, blockChild: false };
    if (blocks.test(tag)) for (const ancestor of stack) ancestor.blockChild = true;
    elements.push(node);
    if (/^(?:script|style|textarea|title)$/.test(tag)) {
      const rawEnd = new RegExp(`</${tag}\\s*>`, "gi");
      rawEnd.lastIndex = cursor;
      const match = rawEnd.exec(source);
      if (!match) return null;
      cursor = match.index + match[0].length;
      node.end = cursor;
    } else if (!voids.test(tag) && !/\/\s*>$/.test(token)) stack.push(node);
  }
  if (stack.length) return null;
  // Binary-search source bounds, then flatten ONLY text nodes inside that slice.
  const text = (start: number, end: number) => {
    let lo = 0, hi = spans.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (spans[mid]!.end <= start) lo = mid + 1; else hi = mid; }
    const parts: string[] = [];
    for (let i = lo; i < spans.length && spans[i]!.start < end; i++) {
      const span = spans[i]!;
      parts.push(span.text.slice(Math.max(0, start - span.start), Math.min(span.text.length, end - span.start)));
    }
    return decodeEntities(parts.join(" ")).replace(/\s+/g, " ").trim();
  };
  return { elements, spans, text };
}

/** Source-bound lexical tables, including their hidden unit/context metadata. */
export function primaryDocumentStructure(document: ParsedDocument) {
  const source = originalDocuments.get(document);
  if (source === undefined) return null;
  const structure = appendixStructure(source, true);
  return structure === null ? null : { ...structure, source };
}

// Keyed by the caller's shared document object: no global HTML retention, and
// no eager structural work for successful legacy sections. Cache malformed
// parses too, but never cache a parse interrupted by its caller's deadline.
const annualRecoveryStructures = new WeakMap<ParsedDocument, ReturnType<typeof appendixStructure>>();

/** A failed annual item may be retried against closed, source-bound headings.
 * Ordinary successes never enter these routes. No route can slice to EOF. */
function recoverAnnualSection(
  parsed: ParsedDocument, spec: SectionSpec, minChars: number, diagnostics: ExtractDiagnostics, deadline?: number,
): ExtractResult | null {
  if (spec.form === "10-Q" || !["business", "mdna", "riskFactors"].includes(specKind(spec))) return null;
  diagnostics.layersTried.push("annual-structure-recovery");
  const expired = () => {
    if (deadline === undefined || Date.now() < deadline) return false;
    const note = "annual recovery stopped at the filing extraction deadline";
    if (!diagnostics.notes.includes(note)) diagnostics.notes.push(note);
    return true;
  };
  if (expired()) return null;
  const { pre, entries } = parsed;
  let structure = annualRecoveryStructures.get(parsed);
  if (structure === undefined) {
    structure = appendixStructure(pre, true, expired);
    if (expired()) return null;
    annualRecoveryStructures.set(parsed, structure);
  }
  if (!structure) return null;
  const { elements, text } = structure;
  const nodeText = (n: AppendixElement) => expired() ? "" : text(n.start, n.end);
  const ancestor = (n: AppendixElement, tag: string): AppendixElement | undefined => {
    for (let p = n.parent; p; p = p.parent) if (p.tag === tag) return p;
  };
  const children = new Map<AppendixElement, AppendixElement[]>();
  const targets = new Map<string, AppendixElement[]>();
  for (const n of elements) {
    if (expired()) return null;
    if (n.parent) {
      const list = children.get(n.parent) ?? [];
      list.push(n); children.set(n.parent, list);
    }
    for (const id of new Set([n.attrs.get("id"), n.attrs.get("name")])) {
      if (id === undefined) continue;
      const list = targets.get(id) ?? [];
      list.push(n); targets.set(id, list);
    }
  }
  const target = (id: string): AppendixElement | null => {
    if (!/^[A-Za-z_][A-Za-z0-9_.:-]{0,199}$/.test(id)) return null;
    const list = targets.get(id);
    return list?.length === 1 && !list[0]!.hidden ? list[0]! : null;
  };
  const rows = elements.filter(n => n.tag === "tr" && !n.hidden);
  const cells = (row: AppendixElement) => (children.get(row) ?? []).filter(n => /^(?:td|th)$/.test(n.tag) && !n.hidden);
  const tableRows = new Map<AppendixElement, AppendixElement[]>();
  for (const row of rows) {
    const table = ancestor(row, "table");
    if (!table) continue;
    const list = tableRows.get(table) ?? [];
    list.push(row); tableRows.set(table, list);
  }
  const headings = elements.filter(n => !n.hidden && !n.blockChild && /^(?:h[1-6]|p|div)$/.test(n.tag) &&
    !ancestor(n, "table") && !ancestor(n, "a"));
  // Sony's item title is a two-cell, one-row layout table. A multirow TOC or
  // index cannot confer heading proof, nor can any row with a hyperlink.
  const layoutTitles = rows.filter(n => {
    const table = ancestor(n, "table");
    return table && !ancestor(table, "table") && tableRows.get(table)?.length === 1 && cells(n).length === 2 &&
      !/<a\b[^>]*\bhref\s*=/i.test(pre.slice(table.start, table.end));
  });
  const key = (s: string) => normalizeTitle(s).replace(/[\s.:'’‘,\-]/g, "");
  const closed: Record<string, RegExp> = spec.form === "10-K" ? {
    "1": /^business$/, "1A": /^riskfactors$/, "1B": /^unresolvedstaffcomments$/, "1C": /^cybersecurity$/,
    "2": /^properties$/, "3": /^legalproceedings$/, "4": /^minesafetydisclosures$/,
    "7": /^managementsdiscussionandanalysis(?:of(?:financialconditionandresultsofoperations|resultsofoperationsandfinancialcondition))?$/,
    "7A": /^quantitativeandqualitativedisclosuresaboutmarketrisk$/,
    "8": /^financialstatementsandsupplementarydata$/,
  } : {
    "3": /^keyinformation$/, "3D": /^riskfactors$/, "4": /^informationonthecompany$/,
    "4A": /^unresolvedstaffcomments$/, "5": /^operatingandfinancialreviewandprospects$/,
    "6": /^directorsseniormanagementandemployees$/, "7": /^majorshareholdersandrelatedpartytransactions$/,
  };
  const headingItem = (n: AppendixElement): { id: string; title: string } | null => {
    const title = nodeText(n);
    if (/<a\b[^>]*\bhref\s*=/i.test(pre.slice(n.start, n.end))) return null;
    const m = /^Item\s+(\d{1,2}(?:\s*\.?\s*[A-D])?)(?=[.\s]|$)[\s.:]*(.*)$/i.exec(title);
    if (!m) return null;
    return { id: normItem(m[1]!), title: m[2]! };
  };
  const itemHeading = (n: AppendixElement): string | null => {
    if (nodeText(n).length > 200) return null;
    const heading = headingItem(n);
    if (!heading) return null;
    const { id, title } = heading;
    if (closed[id]?.test(key(title))) return id;
    // Some 20-Fs name the issuer in Item 4. Require the full title in the
    // contents TOC AND its unique destination at this very heading.
    if (spec.form === "20-F" && id === "4" && /^informationabout[a-z][a-z0-9&-]*$/.test(key(title)) &&
        entries.some(e => key(e.title) === key(nodeText(n)) && target(e.target) !== null &&
          target(e.target)!.start <= n.start && n.start - target(e.target)!.start < 2_000 && text(target(e.target)!.start, n.start) === "")) return id;
    return null;
  };
  const itemHeads = [...headings, ...layoutTitles].map(n => ({ n, id: itemHeading(n) })).filter(h => h.id !== null)
    .sort((a, b) => a.n.start - b.n.start);
  // End proof needs an item number, not an exact SEC title; it can never
  // establish a section start. It is deliberately broader than start proof (PR
  // #88 review): a later item's heading ends the section whether a period, colon
  // or dash follows its number ("Item 1A: Risk Factors", "ITEM 1A—RISK FACTORS"),
  // whether or not a name anchor (not a link) wraps it, however a table row
  // splits it across one to four cells ("Item | 1A. | Risk Factors."), in a list
  // item or other block element, and after a Part prefix ("PART I — ITEM 1A.",
  // "Part I, Item 1A."). Wrongly
  // absorbing the next item is the error to avoid; an early end can only shorten
  // the section or leave it a withheld stub.
  const linked = (n: AppendixElement): boolean => /<a\b[^>]*\bhref\s*=/i.test(pre.slice(n.start, n.end));
  const parseBoundary = (value: string): { id: string; title: string } | null => {
    const m = /^(?:Part\s+[IVX]{1,4}\s*[,.:–—-]?\s*)?Item\s+(\d{1,2}(?:\s*\.?\s*[A-D])?)(?=[.\s:–—-]|$)[\s.:–—-]*(.*)$/i.exec(value);
    return m ? { id: normItem(m[1]!), title: m[2]! } : null;
  };
  const boundaryItem = (n: AppendixElement): { id: string; title: string } | null => linked(n) ? null : parseBoundary(nodeText(n));
  // A paragraph that opens with a later item's reference ("Item 1A. Risk Factors
  // below discusses ...", "Item 1A of this report describes ...") is prose, not
  // that item's heading (PR #88 review). It is the item's standard title followed
  // by lowercase words, or text opening in lowercase. A variant or nonstandard
  // title, or a standard title with a parenthetical, still ends the section. The
  // exact standard title ends it in any capitalization ("Item 1A. risk factors.").
  const proseHeading = (heading: { id: string; title: string }): boolean => {
    const title = heading.title.trim();
    const standard = closed[heading.id];
    if (standard?.test(key(title.replace(/\s*\([^()]{1,60}\)\s*[.:]?$/, "")))) return false;
    if (/^[a-z]/.test(title)) return true;
    if (!standard) return false;
    const words = title.split(/\s+/);
    let end = 0;
    for (let k = 1; k <= words.length; k++) if (standard.test(key(words.slice(0, k).join(" ")))) end = k;
    if (end === 0) return false;
    const rest = words.slice(end).join(" ").replace(/^[\s.:;,–—-]+/, "");
    return /^[a-z]/.test(rest);
  };
  const boundaryHeadings = elements.filter(n => !n.hidden && !n.blockChild &&
    /^(?:h[1-6]|p|div|li|center|section|article|header|blockquote)$/.test(n.tag) &&
    !ancestor(n, "table") && !ancestor(n, "a")?.attrs.has("href")).flatMap(n => {
    const heading = boundaryItem(n);
    return heading !== null && !proseHeading(heading) ? [{ n, id: heading.id }] : [];
  });
  // A row of one to four cells reads as its non-empty cell texts in order. A row
  // holding a link is contents, and a prose reference is not a heading.
  const boundaryRows = rows.flatMap(n => {
    const cs = cells(n);
    if (cs.length < 1 || cs.length > 4 || linked(n)) return [];
    const heading = parseBoundary(cs.map(nodeText).filter(cell => cell !== "").join(" "));
    return heading !== null && !proseHeading(heading) ? [{ n, id: heading.id }] : [];
  });
  const boundaries = [...boundaryHeadings, ...boundaryRows].sort((a, b) => a.n.start - b.n.start);
  const accept = (body: string, method: ExtractMethod, note: string): ExtractResult | null => {
    if (expired() || detectStub(body, minChars).isStub) return null;
    diagnostics.notes.push(note);
    return { ok: true, text: body, method, chars: body.length, diagnostics };
  };

  if (expired()) return null;
  if (spec.form === "20-F" && spec.item === "3D") {
    // D. Risk Factors is subordinate to Item 3, not an Item 3D heading.
    // Pair it with the actual Item 3/4 blocks; repeated Item 3 running heads
    // after D cannot move the start past the risk discussion.
    const risks = headings.filter(n => /^(?:d)?riskfactors$/.test(key(nodeText(n))) &&
      !/<a\b[^>]*\bhref\s*=/i.test(pre.slice(n.start, n.end)));
    const candidates = risks.flatMap(risk => {
      const before = itemHeads.filter(h => h.n.end <= risk.start).at(-1);
      const after = boundaries.find(h => h.n.start >= risk.end && h.id !== "3");
      return before?.id === "3" && after?.id === "4" ? [{ start: risk.start, end: after.n.start }] : [];
    });
    if (candidates.length === 1) {
      const c = candidates[0]!;
      const result = accept(text(c.start, c.end), "structured-item", "standalone 20-F risk heading inside proved Item 3/4 bounds");
      if (result) return result;
    }
  } else {
    const seq = spec.form === "10-K" ? TENK_SEQUENCE : TWENTY_F_SEQUENCE;
    const idx = seq.findIndex(d => d.id === spec.item);
    const starts = itemHeads.filter(h => h.id === spec.item);
    if (idx >= 0 && starts.length === 1) {
      const start = starts[0]!.n;
      // Element ends are exclusive: a next-item heading that starts exactly where
      // this one ends bounds an empty section; it must not be passed over (PR #88 review).
      const end = boundaries.find(h => h.n.start >= start.end && seq.slice(idx + 1).some(d => d.id === h.id));
      if (end) {
        const result = accept(text(start.start, end.n.start), "structured-item", "closed standalone item headings bound the complete item, including subsections");
        if (result) return result;
      }
    }
  }

  if (spec.form === "20-F" && spec.item === "3D") {
    // Integrated reports map 3.D to a named chapter. Only a single proved
    // risk mapping is supported; dispersed Item 4/5 mappings remain withheld.
    const markers = headings.filter(n => /(?:reference\s+table\s+20-f|form\s+20-f\s+cross[- ]reference\s+table)/i.test(nodeText(n)));
    const mappings: { row: AppendixElement; page: number; id: string }[] = [];
    for (const [table, trs] of tableRows) {
      if (!markers.some(m => m.end <= table.start && table.start - m.end < 25_000)) continue;
      if (!trs.some(r => {
        const ts = cells(r).map(n => key(nodeText(n)));
        return ts.length === 4 && /^(?:item|itemnumber)$/.test(ts[0]!) && /^form20f(?:caption|description)$/.test(ts[1]!) &&
          /^locationinthis(?:document|report)$/.test(ts[2]!) && /^pages?$/.test(ts[3]!);
      })) continue;
      let item = "";
      for (const row of trs) {
        const cs = cells(row);
        if (cs.length !== 4) continue;
        const ts = cs.map(nodeText);
        if (/^\d{1,2}[A-D]?$/.test(ts[0]!)) item = ts[0]!;
        if (item !== "3" || key(ts[1]!) !== "driskfactors" || key(ts[2]!.split(/\s+[–—-]\s+/).at(-1)!) !== "riskfactors" || !/^\d{1,4}$/.test(ts[3]!)) continue;
        const links = elements.filter(n => n.tag === "a" && !n.hidden && n.start > cs[3]!.start && n.end < cs[3]!.end);
        const href = links[0]?.attrs.get("href");
        if (links.length === 1 && href?.startsWith("#") && nodeText(links[0]!) === ts[3]) mappings.push({ row, page: Number(ts[3]), id: href.slice(1) });
      }
    }
    if (mappings.length === 1) {
      const mapping = mappings[0]!, dest = target(mapping.id);
      const tocRows = new Map(rows.map(r => [r.start, r]));
      const tocs = entries.filter(e => key(e.title) === "riskfactors" && e.pageNo === mapping.page && e.target === mapping.id &&
        dest !== null && e.rowIndex < dest.start);
      const nearHeading = (id: string, title: string) => {
        const dest = target(id);
        if (!dest) return null;
        // A line holding a hyperlink is contents, not a chapter heading (PR #88 review).
        const found = headings.filter(h => key(nodeText(h)) === key(title) && Math.abs(h.start - dest.start) < 2_000 &&
          !/<a\b[^>]*\bhref\s*=/i.test(pre.slice(h.start, h.end)) &&
          (h.end <= dest.start ? text(h.end, dest.start) === "" : h.start >= dest.start && text(dest.start, h.start) === ""));
        return found.length === 1 ? found[0]! : null;
      };
      const proofs = tocs.flatMap(toc => {
        const tocTable = tocRows.has(toc.rowIndex) ? ancestor(tocRows.get(toc.rowIndex)!, "table") : undefined;
        const start = nearHeading(mapping.id, toc.title);
        const next = tocTable && dest ? entries.filter(e => e.pageNo !== undefined &&
          tocRows.has(e.rowIndex) && ancestor(tocRows.get(e.rowIndex)!, "table") === tocTable && (target(e.target)?.start ?? -1) > dest.start)
          .sort((a, b) => target(a.target)!.start - target(b.target)!.start)[0] : undefined;
        // A differently indented/nested title may be a subsection. Without
        // matching row hierarchy, withhold rather than truncate at that link.
        const titleShape = (entry: TocEntry) => {
          const row = tocRows.get(entry.rowIndex);
          if (!row) return null;
          const cs = cells(row), titleCells = cs.filter(c => key(nodeText(c)) === key(entry.title));
          if (titleCells.length !== 1) return null;
          const cell = titleCells[0]!;
          return JSON.stringify([cs.length, cs.indexOf(cell), ...elements.filter(n => n === row || n.start >= cell.start && n.end <= cell.end).map(n =>
            [n.tag, n.attrs.get("class") ?? "", (n.attrs.get("style") ?? "").split(";").map(s => s.trim().toLowerCase())
              .filter(s => /^(?:left|padding-left|margin-left|text-indent|list-style(?:-type)?)\s*:/.test(s)).sort()])]);
        };
        if (!next || next.pageNo! < mapping.page || titleShape(toc) === null || titleShape(toc) !== titleShape(next)) return [];
        const end = next ? nearHeading(next.target, next.title) : null;
        return start && end && start.tag === end.tag && start.start < end.start && end.end < mapping.row.start ? [{ start: start.start, end: end.start }] : [];
      });
      // Integrated reports can repeat the contents table locally. Repetition
      // is corroboration only when every copy proves identical source bounds.
      const bounds = new Set(proofs.map(p => `${p.start}:${p.end}`));
      if (proofs.length === tocs.length && bounds.size === 1) {
        const proof = proofs[0]!;
        const result = accept(text(proof.start, proof.end), "reference-table-redirect", "20-F risk mapping, all contents peers and unique named chapter boundaries agree");
        if (result) return result;
      }
    }
  }

  if (spec.form === "20-F" && ["4", "5"].includes(spec.item)) {
    // A point-page reference does NOT prove the extent of its named chapter.
    // Recover the explicitly mapped pages as labelled excerpts, never as a
    // purported complete item or by guessing the next chapter's boundary.
    const markers = headings.filter(n => /(?:reference\s+table\s+20-f|form\s+20-f\s+cross[- ]reference\s+table)/i.test(nodeText(n)));
    const grid = (row: AppendixElement): { node: AppendixElement; value: string }[] | null => {
      const result: { node: AppendixElement; value: string }[] = [];
      for (const cell of cells(row)) {
        const span = cell.attrs.get("colspan") ?? "1";
        if (!/^[1-4]$/.test(span)) return null;
        result.push({ node: cell, value: nodeText(cell) });
        for (let i = 1; i < Number(span); i++) result.push({ node: cell, value: "" });
      }
      return result.length === 4 ? result : null;
    };
    const indexTables = [...tableRows].filter(([table, trs]) => markers.some(m => m.end <= table.start && table.start - m.end < 250_000) &&
      trs.some(r => {
        const ts = grid(r)?.map(c => key(c.value));
        return ts && /^(?:item|itemnumber)$/.test(ts[0]!) && /^form20f(?:caption|description)$/.test(ts[1]!) &&
          /^locationinthis(?:document|report)$/.test(ts[2]!) && /^pages?$/.test(ts[3]!);
      })).sort(([a], [b]) => a.start - b.start);
    let active = false, closedItem = false, starts = 0;
    const mapped: { title: string; page: number; cell: AppendixElement; row: AppendixElement }[] = [];
    let problem: string | undefined;
    // A table between two header-bearing tables may be a page footer or a
    // headerless continuation. Anything else leaves the mapping unaccounted for.
    const isPageFurniture = (row: AppendixElement) => {
      const ts = cells(row).map(nodeText).filter(Boolean);
      return ts.length === 0 || (ts.length >= 2 && ts.slice(0, -1).some(t => /\bAnnual Report\s+\d{4}$/i.test(t)) && /^\d{1,4}$/.test(ts.at(-1)!));
    };
    const headerTables = new Set(indexTables.map(([table]) => table));
    const firstIndex = indexTables[0]?.[0], lastIndex = indexTables.at(-1)?.[0];
    const spanned = firstIndex && lastIndex
      ? [...tableRows].filter(([table]) => table.start >= firstIndex.start && table.start <= lastIndex.start).sort(([a], [b]) => a.start - b.start)
      : [];
    for (const [table, trs] of spanned) {
      const continuation = !headerTables.has(table);
      if (continuation && !active) continue;
      for (const row of trs) {
        if (continuation && isPageFurniture(row)) continue;
        const cs = grid(row);
        if (!cs) { if (active) problem = continuation ? "an unaccounted table interrupts the item mapping" : "malformed reference-table row"; continue; }
        const ts = cs.map(c => c.value);
        if (ts.every(t => t === "") || /^(?:item|item number)$/i.test(ts[0]!)) continue;
        if (/^\d{1,2}[A-Z]?$/i.test(ts[0]!)) {
          if (active) closedItem = true;
          active = ts[0]!.toUpperCase() === spec.item;
          if (active) {
            starts++;
            if (!closed[spec.item]?.test(key(ts[1]!))) problem = "item caption does not match the requested section";
          }
        }
        if (!active) continue;
        if (ts[2] === "" && ts[3] === "") continue; // Item caption / subsection caption.
        if (/^(?:not applicable|none)$/i.test(ts[2]!) && ts[3] === "") continue;
        if (ts[2] === "" || !/^\d{1,4}$/.test(ts[3]!) || Number(ts[3]) < 1) {
          problem = `unresolved location reference: ${ts[2] || ts[1]}`;
          continue;
        }
        mapped.push({ title: ts[2]!, page: Number(ts[3]), cell: cs[3]!.node, row });
      }
    }
    if (starts > 0) {
      const unresolved = (reason: string): ExtractResult => ({ ok: false, diagnostics,
        error: new ExtractionError("unresolved_reference", `20-F Item ${spec.item} reference table: ${reason}; no partial mapping returned`) });
      if (starts !== 1 || !closedItem || !mapped.length || problem) return unresolved(problem ?? "item mapping is duplicated, empty or lacks a closing item");
      // Fixed-layout pages have explicit closed boxes AND printed page numbers.
      // Source order alone, a nearby anchor or an inferred page sequence is not
      // page evidence. This route does not change the strict notes parser.
      const pageBoxes = elements.filter(n => !n.hidden && n.tag === "div" &&
        /(?:^|;)\s*position\s*:\s*relative\s*(?:;|$)/i.test(n.attrs.get("style") ?? "") &&
        /(?:^|;)\s*height\s*:\s*[\d.]+(?:pt|px)\s*(?:;|$)/i.test(n.attrs.get("style") ?? "") &&
        /(?:^|;)\s*width\s*:\s*[\d.]+(?:pt|px)\s*(?:;|$)/i.test(n.attrs.get("style") ?? "") &&
        /(?:^|;)\s*overflow\s*:\s*hidden\s*(?:;|$)/i.test(n.attrs.get("style") ?? ""));
      const boxes = new Set(pageBoxes);
      const owner = (n: AppendixElement) => {
        for (let p: AppendixElement | undefined = n; p; p = p.parent) if (boxes.has(p)) return p;
        return undefined;
      };
      const pages = new Map<number, { box: AppendixElement; furniture: AppendixElement } | null>();
      const boxNumbers = new Map<AppendixElement, Set<number>>();
      for (const row of rows) {
        const box = owner(row);
        if (!box) continue;
        const ts = cells(row).map(nodeText).filter(Boolean);
        if (ts.length < 2 || !ts.slice(0, -1).some(t => /\bAnnual Report\s+\d{4}$/i.test(t)) || !/^\d{1,4}$/.test(ts.at(-1)!)) continue;
        const number = Number(ts.at(-1));
        const numbers = boxNumbers.get(box) ?? new Set<number>();
        numbers.add(number); boxNumbers.set(box, numbers);
        pages.set(number, pages.has(number) ? null : { box, furniture: row });
      }
      const selected = new Map<number, { box: AppendixElement; body: string; titles: Set<string> }>();
      const navigationPages = new Set<number>();
      for (const mapping of mapped) {
        if (expired()) return null;
        let page: { box: AppendixElement; furniture?: AppendixElement } | null | undefined = pages.get(mapping.page);
        const links = elements.filter(n => n.tag === "a" && !n.hidden && n.start > mapping.cell.start && n.end < mapping.cell.end);
        // The unnumbered Form 20-F cover can be explicitly named as page 1.
        if (page === undefined && mapping.page === 1 && key(mapping.title) === "coverpage" && links.length === 0) {
          const cover = pageBoxes[0];
          if (cover && /\bForm\s+20-F\b/i.test(nodeText(cover)) && /\bANNUAL REPORT\b/.test(nodeText(cover))) page = { box: cover };
        } else {
          const href = links[0]?.attrs.get("href");
          const dest = href?.startsWith("#") ? target(href.slice(1)) : null;
          if (links.length !== 1 || nodeText(links[0]!) !== String(mapping.page) || !dest || !page || owner(dest) !== page.box ||
              ancestor(dest, "table") || ancestor(dest, "a")?.attrs.has("href")) {
            return unresolved(`page ${mapping.page} destination is missing, ambiguous or disagrees with its printed page`);
          }
        }
        if (!page || page.box.end >= mapping.row.start || (boxNumbers.get(page.box)?.size ?? 0) > 1) return unresolved(`page ${mapping.page} has no unique preceding printed page`);
        // Layout tables can hold a page's own heading. A linked "Contents" is a
        // running back-link on every page of some reports, not this page's title.
        const pageLinks = elements.filter(n => n.tag === "a" && n.attrs.has("href") && n.start > page.box.start && n.end < page.box.end);
        const pageHeads = elements.filter(n => !n.hidden && n.start >= page.box.start && n.end <= page.box.end &&
          /^(?:h[1-6]|p|div|td|th|span|b|strong)$/.test(n.tag) && !ancestor(n, "a") && !pageLinks.some(a => a.start >= n.start && a.end <= n.end));
        if (pageHeads.some(h => /^(?:tableofcontents|contents|(?:appendix)?referencetable20f(?:continued)?)$/.test(key(nodeText(h))))) {
          return unresolved(`page ${mapping.page} is contents or a reference index`);
        }
        const without = (omit: AppendixElement[]) => {
          let at = page.box.start;
          const parts: string[] = [];
          for (const n of omit.sort((a, b) => a.start - b.start)) {
            if (n.start > at) parts.push(text(at, n.start));
            at = Math.max(at, n.end);
          }
          parts.push(text(at, page.box.end));
          return parts.filter(Boolean).join(" ");
        };
        // A chapter divider may itself be a linked mini-contents page, with
        // no Contents title. Links plus bare labels are not narrative evidence.
        const furniture = page.furniture ? [page.furniture] : [];
        if (pageLinks.length >= 3 && !/[.!?\d]/.test(without([...furniture, ...pageLinks]))) {
          navigationPages.add(mapping.page);
          continue;
        }
        const previous = selected.get(mapping.page);
        if (previous) previous.titles.add(mapping.title);
        else selected.set(mapping.page, { box: page.box, body: without(furniture), titles: new Set([mapping.title]) });
      }
      const pieces = [...selected].sort(([, a], [, b]) => a.box.start - b.box.start).map(([number, page]) => {
        return `Page ${number} — ${[...page.titles].join("; ")}\n${page.body}`;
      });
      // Apply the stub gate to source text, not to our coverage labels.
      if (detectStub([...selected.values()].map(p => p.body).join("\n"), minChars).isStub) return unresolved("mapped source pages are only navigation or a truncated stub");
      const omitted = navigationPages.size ? ` Navigation-only mapped pages omitted: ${[...navigationPages].join(", ")}.` : "";
      return accept(`20-F Item ${spec.item}: mapped-page excerpts. Chapters may continue beyond the referenced pages; these excerpts are not the complete item.${omitted}\n\n${pieces.join("\n\n")}`,
        "reference-table-pages", `all ${mapped.length} point-page references resolved; ${selected.size} unique source-bound pages retained.${omitted} Chapter completeness is explicitly withheld`);
    }
  }

  if (expired() || spec.form !== "10-K" || !["1", "7"].includes(spec.item)) return null;
  // A linked cross-reference index can explicitly incorporate disjoint pages.
  // Require every mapped range, every link and every printed page. A partial
  // assembly cannot stand in for the item. Printed pages, not the next TOC
  // entry, bound the end (an end link may share a multi-page section target).
  const indexHeads = elements.filter(n => !n.hidden && !n.blockChild && /^(?:h[1-6]|p|div)$/.test(n.tag) &&
    !ancestor(n, "a") && /^form10kcrossreferenceindex$/.test(key(nodeText(n))) &&
    (!ancestor(n, "table") || key(nodeText(ancestor(n, "table")!)) === key(nodeText(n))));
  if (indexHeads.length !== 1) return null;
  const index = indexHeads[0]!;
  const indexTables = [...tableRows].filter(([table, trs]) => table.start >= index.end && table.start - index.end < 20_000 &&
    trs.some(r => cells(r).some(c => new RegExp(`^Item\\s+${spec.item}\\.$`, "i").test(nodeText(c)))));
  if (indexTables.length !== 1) return null;
  const [indexTable, trs] = indexTables[0]!;
  if (trs.filter(r => cells(r).some(c => new RegExp(`^Item\\s+${spec.item}\\.$`, "i").test(nodeText(c)))).length !== 1) return null;
  const mapped: AppendixElement[] = [];
  let active = false, closedItem = false;
  for (const row of trs) {
    const cs = cells(row), ts = cs.map(nodeText);
    const item = ts[0] ? ITEM_CELL_RE.exec(ts[0]) : null;
    if (item) {
      if (active) { closedItem = true; break; }
      active = normItem(item[1]!) === spec.item;
      if (active && !closed[spec.item]?.test(key(ts[1] ?? ""))) return null;
    }
    if (active) {
      if (!ts.some(Boolean) && nodeText(row) === "") continue;
      if (cs.length !== 3 || ts.slice(0, -1).some(t => /^Pages?\s+\d/i.test(t) || PAGE_RANGES_RE.test(t))) return null;
      if (ts[2]?.trim()) mapped.push(cs[2]!);
      else if (!item && ts.some(Boolean)) return null;
    }
  }
  if (!closedItem || !mapped.length) return null;
  // An issuer can expressly incorporate the same whole pages into several
  // items (business/segment results/MD&A/financial notes). These are positive
  // page references, not exclusive ownership claims. Retain the overlap for
  // disclosure; it cannot override an otherwise complete, proved mapping.
  const otherClaims: [number, number][] = [];
  let owner = "";
  for (const [table, claimRows] of tableRows) {
    if (table.start < index.end || table.start - index.end >= 20_000) continue;
    for (const row of claimRows) {
      const ts = cells(row).map(nodeText);
      const item = ts[0] ? ITEM_CELL_RE.exec(ts[0]) : null;
      if (item) owner = normItem(item[1]!);
      if (!owner || owner === spec.item) continue;
      for (const value of ts.slice(1)) {
        const numbers = value.replace(/^Pages?\s+/i, "").replace(/\s*([,;])\s*/g, "$1");
        if (PAGE_RANGES_RE.test(numbers)) otherClaims.push(...parsePageRanges(numbers));
      }
    }
  }
  const breaks = elements.filter(n => n.tag === "hr" && !n.hidden && /(?:^|;)\s*page-break-after\s*:\s*always\s*(?:;|$)/i.test(n.attrs.get("style") ?? ""));
  const pages = new Map<number, { start: number; end: number } | null>();
  const furniture: { start: number; end: number }[] = [];
  let pageStart = 0, rowAt = 0;
  for (const br of breaks) {
    let footer: AppendixElement | undefined;
    while (rowAt < rows.length && rows[rowAt]!.end <= br.start) {
      const row = rows[rowAt++]!;
      if (row.start >= pageStart) footer = row;
    }
    if (footer && footer.end < indexTable.start && text(footer.end, br.start) === "") {
      const cs = cells(footer), ts = cs.map(nodeText).filter(Boolean);
      const labels = ts.length >= 2 && ts.length <= 4 && ts.slice(0, -1).every(t => /^[A-Za-z][A-Za-z &’'-]{2,80}$/.test(t));
      const imageLabel = ts.length === 1 && cs.length === 3 && cs.slice(0, -1).some(c => /<img\b/i.test(pre.slice(c.start, c.end)));
      if ((labels || imageLabel) && /^\d{1,4}$/.test(ts.at(-1)!)) {
        const number = Number(ts.at(-1));
        pages.set(number, pages.has(number) ? null : { start: pageStart, end: footer.start });
        furniture.push({ start: footer.start, end: br.end });
      }
    }
    pageStart = br.end;
  }
  const intervals: { start: number; end: number }[] = [];
  for (const cell of mapped) {
    const numbers = nodeText(cell).replace(/^Pages?\s+/i, "").replace(/\s*([,;])\s*/g, "$1");
    if (!PAGE_RANGES_RE.test(numbers)) return null;
    const ranges = parsePageRanges(numbers);
    const links = elements.filter(n => n.tag === "a" && !n.hidden && n.start > cell.start && n.end < cell.end);
    const endpoints = [...numbers.matchAll(/\d+/g)].map(m => Number(m[0]));
    if (links.length !== endpoints.length || links.some((n, i) => nodeText(n) !== String(endpoints[i]))) return null;
    let linkAt = 0;
    for (const [rangeIndex, [a, b]] of ranges.entries()) {
      if (a < 1 || b < a || b - a > 200) return null;
      if (otherClaims.some(([lo, hi]) => a <= hi && lo <= b)) {
        diagnostics.notes.push(`linked index: explicitly incorporated pages ${a}-${b} are shared with another item`);
      }
      const first = pages.get(a), last = pages.get(b);
      if (!first || !last) return null;
      let prior = -1;
      for (let number = a; number <= b; number++) {
        const page = pages.get(number);
        if (!page || page.start <= prior) return null;
        prior = page.start;
      }
      const resolve = (link: AppendixElement) => {
        const href = link.attrs.get("href");
        return href?.startsWith("#") ? target(href.slice(1)) : null;
      };
      const start = resolve(links[linkAt++]!);
      const hasEndLink = /[–—-]/.test(numbers.split(/[,;]/)[rangeIndex]!);
      const end = hasEndLink ? resolve(links[linkAt++]!) : start;
      // Some page destinations are empty anchors immediately before the <hr>
      // that opens the named page. No visible text or other markup may bridge
      // that relationship; a nearby anchor on an earlier page is insufficient.
      const beforeBreak = start && nodeText(start) === "" && breaks.some(br => br.end === first.start &&
        start.end <= br.start && pre.slice(start.end, br.start).trim() === "");
      const startAt = beforeBreak ? first.start : start?.start;
      if (!start || !end || startAt === undefined || startAt < first.start || startAt >= first.end || end.start < start.start ||
          end.start >= last.end || last.end >= index.start) return null;
      intervals.push({ start: startAt, end: last.end });
    }
  }
  intervals.sort((a, b) => a.start - b.start);
  const merged: typeof intervals = [];
  for (const interval of intervals) {
    const previous = merged.at(-1);
    if (previous && interval.start <= previous.end) previous.end = Math.max(previous.end, interval.end);
    else merged.push({ ...interval });
  }
  // Footer rows prove page coordinates; they are not part of the body. The
  // standalone return-to-contents links likewise carry no section prose.
  furniture.push(...elements.filter(n => n.tag === "a" && !n.hidden && key(nodeText(n)) === "tableofcontents")
    .map(n => ({ start: n.start, end: n.end })));
  furniture.sort((a, b) => a.start - b.start);
  const bodyText = (interval: { start: number; end: number }) => {
    let at = interval.start;
    const parts: string[] = [];
    for (const omit of furniture) {
      if (omit.end <= at || omit.start >= interval.end) continue;
      if (omit.start > at) parts.push(text(at, omit.start));
      at = Math.max(at, omit.end);
    }
    if (at < interval.end) parts.push(text(at, interval.end));
    return parts.filter(Boolean).join(" ");
  };
  return accept(merged.map(bodyText).join("\n\n"), "linked-index-redirect",
    `linked index assembled every mapped range into ${merged.length} non-overlapping interval(s), bounded by printed pages`);
}

/** Notes-only redirect; null preserves the caller's existing warn-level gap. */
export function extractAnnualNotesFromIndex(html: string, source?: ParsedDocument): {
  text: string; method: "annual-notes-index-redirect"; statementsText?: string; evidence: AnnualNotesRedirectEvidence;
} | null {
  const notes = extractAnnualAppendixNotes(html) ?? extractPrintedIndexNotes(html, source);
  if (notes === null) return null;
  // Index routes have already proved appendix headings in original markup;
  // flattened full-title prose must not replace that stronger boundary proof.
  const currentItem = notes.evidence.enclosingItem ? Number(notes.evidence.enclosingItem) : null;
  const bounded = sourceNotesBoundary(boundFinancialNotes({ text: notes.text, start: 0 }, false), source ?? parseDocument(html), currentItem);
  return bounded.text === notes.text ? notes : { ...notes, text: bounded.text };
}

export type ForeignAnnualNotesResult =
  | { ok: true; text: string; method: "structured-item"; statementsText?: string; financialTextScope?: "statements-and-notes" }
  | { ok: false; reason: string; exhibit?: { filename: string; reference: string } };

/** Financial appendices require their own source and closing-boundary proof. */
export function extractForeignAnnualNotes(html: string): ForeignAnnualNotesResult {
  const structure = appendixStructure(html, true);
  const notes = extractProvedForeignNotes(html, structure);
  if (notes.ok) {
    // Both the closed Item 18 and printed-page appendix routes have the same
    // original-markup end stops as domestic notes. Item 18 page furniture stays.
    const bounded = sourceNotesBoundary({ text: notes.text, start: 0 }, parseDocument(html), 18);
    return bounded.text === notes.text ? notes : { ...notes, text: bounded.text };
  }
  if (!structure) return notes;
  const blocks = structure.elements.filter(n => !n.hidden && (!n.blockChild || n.tag === "tr") && /^(?:p|div|h[1-6]|td|tr)$/.test(n.tag));
  const unlinked = (n: AppendixElement) => {
    if (/<a\b[^>]*href\s*=/i.test(html.slice(n.start, n.end))) return false;
    for (let p = n.parent; p; p = p.parent) if (p.tag === "a" && p.attrs.has("href")) return false;
    return true;
  };
  const innermost = (nodes: AppendixElement[]) => nodes.filter(n => !nodes.some(other => other !== n && other.start >= n.start && other.end <= n.end));
  const heads = innermost(blocks.filter(n => /^Item\s+18\.?\s+Financial Statements$/i.test(structure.text(n.start, n.end)) && unlinked(n)));
  const ends = innermost(blocks.filter(n => /^Item\s+19\.?\s+Exhibits$/i.test(structure.text(n.start, n.end)) && unlinked(n)));
  if (heads.length === 1 && ends.length === 1 && heads[0]!.end < ends[0]!.start) {
    const item = financialStatementsAndNotes(structure.text(heads[0]!.start, ends[0]!.start), parseDocument(html), 18);
    if (item) return { ok: true, text: item.text, method: "structured-item", financialTextScope: "statements-and-notes" };
  }
  return notes;
}

function extractProvedForeignNotes(html: string, structure: ReturnType<typeof appendixStructure>): ForeignAnnualNotesResult {
  const missing = (reason: string): ForeignAnnualNotesResult => ({ ok: false, reason: `20-F notes: ${reason}` });
  if (!structure) return missing("primary document markup is not closed; financial appendix boundaries cannot be proved");
  const { elements, text } = structure;
  const nt = (n: AppendixElement) => text(n.start, n.end).replace(/[\u200b\u00ad]/g, "").trim();
  const ancestor = (n: AppendixElement, tag: string) => {
    for (let p = n.parent; p; p = p.parent) if (p.tag === tag) return p;
  };
  const blocks = elements.filter(n => !n.hidden && !n.blockChild && /^(?:p|div|h[1-6]|td)$/.test(n.tag) && !ancestor(n, "a"));
  const linked = (n: AppendixElement) => /<a\b[^>]*href\s*=/i.test(html.slice(n.start, n.end));
  const title = /\bNotes to (?:the )?(?:Consolidated )?Financial Statements(?:\s+FOR THE YEARS ENDED\b[^.]{0,100})?$/i;
  const headings = blocks.filter(n => {
    const value = nt(n), match = title.exec(value);
    return match && /^[A-Z0-9 &.,’()\-]*$/.test(value.slice(0, match.index)) && !linked(n);
  });
  const openings = headings.filter(n => {
    const next = text(n.end, Math.min(html.length, n.end + 50_000)).replace(/^\s*[A-Z][A-Za-z0-9 &.,’()\-]{0,150}\s+and Consolidated Subsidiaries\s+/i, "");
    return !notesContentsOpening(next.slice(0,400)) &&
      /^(?:\s*(?:FOR THE YEARS ENDED\b.{0,100}?)?)\s*(?:\(?IN\.1\)?\s+Basis for Preparation|(?:Note\s+)?1\s*[.():–—-]?\s+[A-Z])/i.test(next);
  });
  if (openings.length !== 1) {
    // Follow only the filing's own annual-report link, never an exhibit guessed
    // from a filename or TYPE. Fetching and proving that document is separate.
    const item18Heads = blocks.filter(n => /^ITEM\s+18\.?\s+FINANCIAL STATEMENTS$/i.test(nt(n)) && !linked(n));
    const reference = blocks.find(n => /^The financial statements\b.*Annual Report\b/i.test(nt(n)) && nt(n).length < 600 &&
      item18Heads.some(head => head.end <= n.start && /\b(?:Item\s+19|Exhibit\s+15\.\d+)\b/i.test(nt(n))));
    const exhibits = elements.filter(n => n.tag === "tr" && !n.hidden && nt(n).length < 1_500 && /\bAnnual Report\b/i.test(nt(n)) && /^15\.\d+\b/.test(nt(n)));
    if (reference && exhibits.length === 1) {
      const row = exhibits[0]!;
      const links = elements.filter(n => n.tag === "a" && n.start >= row.start && n.end <= row.end && !n.hidden);
      const filenames = new Set(links.map(n => n.attrs.get("href")).filter((h): h is string => !!h && /^[A-Za-z0-9_-]+\.html?$/i.test(h)));
      if (filenames.size === 1 && links.every(n => filenames.has(n.attrs.get("href") ?? ""))) {
        return { ok: false, reason: `20-F Item 18 incorporates a separately filed annual report; its financial notes require the referenced exhibit ${[...filenames][0]} and complete note-boundary proof`,
          exhibit: { filename: [...filenames][0]!, reference: nt(row) } };
      }
    }
    return missing(`${openings.length ? "ambiguous substantive notes openings" : "no substantive notes opening was proved in the primary document"}; an incorporated exhibit needs an explicit, unique filing reference`);
  }
  const opening = openings[0]!;
  // An actual later item closes a primary-document financial statement body.
  const item18 = blocks.filter(n => n.start < opening.start && /^ITEM\s+18\.?\s+FINANCIAL STATEMENTS$/i.test(nt(n)) && !linked(n)).at(-1);
  const closingItem = blocks.find(n => n.start > opening.end && /^ITEM\s+19\.?\s+EXHIBITS$/i.test(nt(n)) && !linked(n));
  if (item18 && closingItem) {
    const body = text(opening.start, closingItem.start);
    if (!detectStub(body).isStub) return { ok: true, text: boundFinancialNotes({ text: body, start: 0 }, false).text, method: "structured-item" };
  }
  // Financial indexes can also incorporate an appendix after the item/exhibits.
  // The explicit F-page reference must agree with a unique opening and every
  // intervening printed page, including a proved final page/document close.
  const rows = elements.filter(n => n.tag === "tr" && !n.hidden && n.end < opening.start);
  const mappings = rows.map(row => ({ row, match: /^Notes to (?:the )?(?:Consolidated )?Financial Statements\s+F\s*-\s*(\d+)(?:\s*(?:to|through|[-–—])\s*(?:F\s*-\s*)?(\d+))?$/i.exec(nt(row)) })).filter(m => m.match);
  if (mappings.length !== 1) return missing("the substantive notes have no unique financial-index F-page reference or later closing item");
  const { row, match } = mappings[0]!;
  const indexTable = ancestor(row, "table");
  if (!indexTable || !rows.some(n => ancestor(n, "table") === indexTable && /^(?:Consolidated )?(?:Balance Sheets|Statements of Financial Position)\b[\s\S]*\bF\s*-\s*\d+/i.test(nt(n)))) return missing("notes reference is not part of a proved financial-statement index");
  const first = Number(match![1]), last = match![2] ? Number(match![2]) : undefined;
  const fixedBoxes = new Set(elements.filter(n => !n.hidden && n.tag === "div" &&
    /(?:^|;)\s*position\s*:\s*relative\s*(?:;|$)/i.test(n.attrs.get("style") ?? "") &&
    /(?:^|;)\s*height\s*:\s*[\d.]+(?:pt|px)\s*(?:;|$)/i.test(n.attrs.get("style") ?? "") &&
    /(?:^|;)\s*overflow\s*:\s*hidden\s*(?:;|$)/i.test(n.attrs.get("style") ?? "")));
  const owner = (n: AppendixElement) => {
    for (let p: AppendixElement | undefined = n; p; p = p.parent) if (fixedBoxes.has(p)) return p;
  };
  const openingBox = owner(opening);
  const markers = blocks.filter(n => n.start > row.end && /^F\s*-\s*\d+$/.test(nt(n)) && !ancestor(n, "table") && !linked(n));
  const retained = markers.filter(n => n.start >= (openingBox?.start ?? opening.start));
  if (!retained.length || retained.some((n, i) => Number(nt(n).replace(/^F\s*-\s*/, "")) !== first + i) ||
    (last !== undefined && first + retained.length - 1 !== last)) return missing("financial-index reference disagrees with missing, duplicate or nonconsecutive printed F-pages");
  if (markers.some(n => n.start < retained[0]!.start && Number(nt(n).replace(/^F\s*-\s*/, "")) >= first)) return missing("financial appendix printed-page identity is ambiguous");
  const links = elements.filter(n => n.tag === "a" && !n.hidden && n.start >= row.start && n.end <= row.end);
  for (const link of links) {
    const href = link.attrs.get("href") ?? "";
    if (!/^#[A-Za-z_][A-Za-z0-9_.:-]*$/.test(href)) return missing("notes index points outside the primary document");
    const targets = elements.filter(n => n.attrs.get("id") === href.slice(1) || n.attrs.get("name") === href.slice(1));
    if (targets.length !== 1 || targets[0]!.hidden ||
      !(targets[0] === opening || (openingBox && owner(targets[0]!) === openingBox) ||
        (targets[0]!.start <= opening.start && /^(?:[A-Z0-9 &.,’()\-]+ AND SUBSIDIARIES)?$/.test(text(targets[0]!.end, opening.start).replace(/[\u200b\u00ad]/g, "").trim())))) return missing("notes index destination is missing, duplicated or disagrees with the opening page");
  }
  let end: number;
  if (openingBox) {
    const boxes = retained.map(owner);
    if (boxes.some((box, i) => !box || (i > 0 && box!.start < boxes[i - 1]!.end)) || boxes[0] !== openingBox) return missing("printed F-pages do not identify unique closed physical pages");
    end = boxes.at(-1)!.end;
    if ([...fixedBoxes].some(box => box.start >= openingBox.start && box.end <= end && !boxes.includes(box))) return missing("an intervening physical page has no proved printed F-page identity");
  } else {
    // A final footer closes a flowing appendix; unlike fixed-layout headers,
    // any visible text after it leaves the end unproved.
    end = retained.at(-1)!.end;
  }
  if (text(end, html.length).replace(/[\u200b\u00ad]/g, "").trim() !== "") return missing("visible material follows the final proved financial page; notes end is not established");
  const body = text(opening.start, end);
  if (detectStub(body).isStub) return missing("proved notes interval is only a reference or short stub");
  return { ok: true, text: boundFinancialNotes({ text: body, start: 0 }, false).text, method: "structured-item" };
}

/** Preserve the original appendix proof and its exact output. */
function extractAnnualAppendixNotes(html: string): ReturnType<typeof extractAnnualNotesFromIndex> {
  // Filing generators use self-closing empty cell spacers; the layout parser
  // admits only cells immediately followed by another cell or the row close.
  const structure = appendixStructure(html, true);
  if (!structure) return null;
  const { elements, text } = structure;
  const nodeText = (node: AppendixElement) => text(node.start, node.end);
  const ancestor = (node: AppendixElement, tag: string): AppendixElement | undefined => {
    for (let p = node.parent; p; p = p.parent) if (p.tag === tag) return p;
  };
  const headings = elements.filter(n => !n.hidden && !n.blockChild && /^(?:h[1-6]|p|div)$/.test(n.tag) && !ancestor(n, "a") && !ancestor(n, "table"));
  const finish = headings.find(n => /^Item\s+16\.?\s+Form\s+10-K\s+Summary\.?$/i.test(nodeText(n)));
  if (!finish) return null;
  // Only the Item 15 enclosing the index precedes Item 16. Repeated Item 15
  // captions in the later financial appendix are page furniture.
  const item15 = headings.filter(n => n.end < finish.start && /^Item\s+15\.?\s+Exhibits\s*(?:,|and)\s*(?:and\s+)?Financial Statement Schedules\.?$/i.test(nodeText(n)));
  if (item15.length !== 1) return null;
  const begin = item15[0]!;
  const role = (title: string): "notes" | "schedule" | "statements" | null => {
    if (/^Notes to (?:the )?(?:Condensed )?(?:Consolidated )?Financial (?:Statements|Information)$/i.test(title)) return "notes";
    if (/^(?:\(\d{1,2}\) )?Schedule II(?:\s*[-–—:]\s*Valuation and Qualifying Accounts)?(?: for Fiscal 20\d{2}(?:(?:,? and|,) 20\d{2}){0,3})?$/i.test(title)) return "schedule";
    if (/^Consolidated Balance Sheets$/i.test(title)) return "statements";
    return null;
  };
  type Entry = { role: "notes" | "schedule" | "statements"; title: string; target: string; namespace: string; number: number; table: AppendixElement };
  const entries: Entry[] = [];
  for (const row of elements.filter(n => n.tag === "tr" && n.start > begin.end && n.end <= finish.start && !n.hidden)) {
    const cells = elements.filter(n => /^(?:td|th)$/.test(n.tag) && n.parent === row && !n.hidden);
    const titles = cells.map(n => nodeText(n)).filter(t => role(t) !== null);
    if (!titles.length) continue;
    if (titles.length !== 1) return null;
    const title = titles[0]!, kind = role(title)!;
    const pages = cells.filter(n => /^[FS]\s*-\s*\d{1,4}$/i.test(nodeText(n)));
    if (pages.length !== 1) return null;
    const pageCell = pages[0]!;
    const links = elements.filter(n => n.tag === "a" && n.start >= row.start && n.end <= row.end && !n.hidden);
    const hrefs = new Set(links.map(n => n.attrs.get("href")));
    const href = [...hrefs][0];
    // Strict, bounded identifiers only; percent decoding and sibling URLs are unsupported.
    if (hrefs.size !== 1 || !href || !/^#[A-Za-z_][A-Za-z0-9_.:-]{0,199}$/.test(href) ||
        !links.some(n => n.start > pageCell.start && n.end < pageCell.end)) return null;
    const page = /^([FS])\s*-\s*(\d{1,4})$/i.exec(nodeText(pageCell))!;
    const table = ancestor(row, "table");
    if (!table || table.hidden || table.start < begin.end || table.end > finish.start || Number(page[2]) < 1) return null;
    entries.push({ role: kind, title, target: href.slice(1), namespace: page[1]!.toUpperCase(), number: Number(page[2]), table });
  }
  const one = (kind: Entry["role"]) => {
    const candidates = entries.filter(e => e.role === kind);
    return candidates.length === 1 ? candidates[0]! : null;
  };
  const notes = one("notes"), schedule = one("schedule");
  if (!notes || !schedule || notes.table !== schedule.table || notes.namespace !== "F" || schedule.namespace !== "S") return null;
  const resolve = (entry: Entry) => {
    const targets = elements.filter(n => n.attrs.get("id") === entry.target || n.attrs.get("name") === entry.target);
    if (targets.length !== 1 || targets[0]!.hidden) return null;
    const target = targets[0]!;
    // An empty named anchor/wrapper may immediately precede its heading. No
    // unbounded scan past a wrong title, reference, company prose or index.
    const heading = headings.find(n => n.start >= target.start && n.start - target.start <= 1000 &&
      (text(target.start, n.start) === "" || (entry.role === "notes" &&
        /^[A-Z][A-Z0-9 &.,'’()\-]+ (?:Incorporated|Corporation|INC\.?|CORP\.?)$/.test(text(target.start, n.start)))) && (normalizeTitle(nodeText(n)) === normalizeTitle(entry.title) ||
        (entry.role === "schedule" && /^Schedule II$/i.test(nodeText(n)))));
    return heading ? { target, heading } : null;
  };
  const start = resolve(notes), end = resolve(schedule);
  if (!start || !end || start.target.start <= finish.end || start.heading.end >= end.target.start) return null;
  const body = text(start.heading.start, end.target.start);
  const validated = notesToFinancialStatements(body);
  if (!validated || validated.start !== 0 || detectStub(body).isStub) return null;
  // The legacy flattened helper also accepts "See Note 1 ...". Here the
  // first nonempty original block must itself OPEN the first note; a nearby
  // token in a reference cannot prove it. Inline spans retain their text-node
  // origin. Punctuation/capitalization is not proof: require a standalone
  // named marker or a closed financial-note title with an actual terminator.
  const firstNoteBlock = headings.find(n => n.start >= start.heading.end && n.end <= end.target.start && nodeText(n) !== "");
  if (!firstNoteBlock || text(start.heading.end, firstNoteBlock.start) !== "") return null;
  const opening = nodeText(firstNoteBlock);
  const standaloneMarker = /^Note\s+(?:1|A|One)\s*[.:]?$/i.test(opening);
  const marker = /^(?:Note\s+(?:1|A|One)(?=\s|[.:–—-]|$)\s*(?:[.:–—-]\s*)?|1\s*[.:–—-]\s*|\(1\)\s*)([\s\S]*)$/i.exec(opening);
  // This deliberately small supported-title set is generic across issuers.
  // A block end or period/colon followed by whitespace/end must terminate it;
  // "Organization is described ..." is not an Organization heading.
  const financialTitle = /^(?:Organization(?: and Business)?|Description of Business|Basis of Presentation|(?:Organization and )?Summary of Significant Accounting Policies|Significant Accounting Policies)(?:[.:](?:\s|$)|$)/i;
  if (!standaloneMarker && (marker === null || !financialTitle.test(marker[1]!))) return null;
  // A linked schedule cannot authorize swallowing other appendices/signatures.
  // Exact standalone titles only: a paragraph beginning with a full title and
  // continuing "provides ..." is a reference, not another appendix boundary.
  const excludedHeading = /^(?:SIGNATURES|EXHIBIT INDEX|Item\s+16\.?\s+Form\s+10-K\s+Summary|Schedule\s+[IVX]+(?:(?:\s*[-–—:]\s*|\s+)Valuation and Qualifying Accounts)?)\.?$/i;
  if (headings.some(n => n.start > start.heading.end && n.start < end.target.start && excludedHeading.test(nodeText(n)))) return null;
  const evidence: AnnualNotesRedirectEvidence = {
    coordinateSystem: "original-html-characters", index: { start: notes.table.start, end: notes.table.end }, enclosingItem: "15",
    notes: { target: notes.target, page: { namespace: "F", number: notes.number }, start: start.heading.start },
    schedule: { target: schedule.target, page: { namespace: "S", number: schedule.number }, start: end.target.start },
  };
  let statementsText: string | undefined;
  const statement = one("statements");
  const statementStart = statement && statement.table === notes.table && statement.namespace === "F" && statement.number < notes.number ? resolve(statement) : null;
  if (statement && statementStart && statementStart.target.start > finish.end && statementStart.heading.end < start.target.start &&
      !headings.some(n => n.start > statementStart.heading.end && n.start < start.target.start && excludedHeading.test(nodeText(n)))) {
    statementsText = text(statementStart.heading.start, start.target.start).slice(0, 12_000);
    evidence.statements = { target: statement.target, start: statementStart.heading.start, retainedChars: statementsText.length };
  }
  return { text: body, method: "annual-notes-index-redirect", ...(statementsText ? { statementsText } : {}), evidence };
}

/** D-194: a financial index supplies coordinates, never prose by itself.
 * Every linked row must agree with a unique destination and printed page.
 * Notes end at a closed appendix heading, or a closed document with a final
 * printed footer. Missing/duplicate/interrupted pages refuse the entire route.
 */
function extractPrintedIndexNotes(html: string, source?: ParsedDocument): ReturnType<typeof extractAnnualNotesFromIndex> {
  const structure = appendixStructure(html, true);
  if (!structure || !/<\/body>\s*<\/html>\s*$/i.test(html)) return null;
  const { elements, text } = structure;
  const nt = (n: AppendixElement) => text(n.start, n.end);
  const ancestor = (n: AppendixElement, tag: string): AppendixElement | undefined => {
    for (let p = n.parent; p; p = p.parent) if (p.tag === tag) return p;
  };
  const blocks = elements.filter(n => !n.hidden && !n.blockChild && /^(?:p|div|h[1-6])$/.test(n.tag) && !ancestor(n, "a"));
  const pageNumber = (s: string) => /^(F\s*-\s*)?(\d{1,4})$/i.exec(s);
  const breaks = elements.filter(n => !n.hidden && n.tag === "hr" && /page-break-after\s*:\s*always/i.test(n.attrs.get("style") ?? ""));
  type Page = { start: number; end: number; footer: number; namespace: "" | "F"; number: number };
  const pages: Page[] = [];
  let start = 0;
  for (const end of [...breaks.map(n => n.start), html.length]) {
    const footer = blocks.filter(n => n.start >= start && n.end <= end && pageNumber(nt(n)) && !ancestor(n, "table") && text(n.end, end) === "").at(-1);
    if (footer) {
      const m = pageNumber(nt(footer))!;
      pages.push({ start, end, footer: footer.start, namespace: m[1] ? "F" : "", number: Number(m[2]) });
    }
    start = breaks.find(n => n.start === end)?.end ?? end;
  }
  const resolve = (href: string) => {
    if (!/^#[A-Za-z_][A-Za-z0-9_.:-]{0,199}$/.test(href)) return null;
    const found = elements.filter(n => n.attrs.get("id") === href.slice(1) || n.attrs.get("name") === href.slice(1));
    return found.length === 1 && !found[0]!.hidden ? found[0]! : null;
  };
  const destinationPage = (dest: AppendixElement) => pages.find(p => dest.start >= p.start && dest.start < p.footer) ??
    pages.find(p => breaks.some(br => br.end === p.start && dest.end <= br.start && html.slice(dest.end, br.start).trim() === ""));
  const titleKey = (s: string) => s.replace(/\s/g, "").toLowerCase();
  const isNotes = (s: string) => /^(?:notestothe|notesto)(?:consolidated)?financialstatements$/.test(titleKey(s));
  const rowsByTable = new Map<AppendixElement, AppendixElement[]>();
  const cellsByRow = new Map<AppendixElement, AppendixElement[]>();
  const linksByRow = new Map<AppendixElement, AppendixElement[]>();
  for (const n of elements) {
    if (n.hidden) continue;
    const owner = n.tag === "tr" ? ancestor(n, "table") : /^(?:td|th)$/.test(n.tag) ? n.parent : n.tag === "a" ? ancestor(n, "tr") : undefined;
    if (!owner) continue;
    const map = n.tag === "tr" ? rowsByTable : n.tag === "a" ? linksByRow : cellsByRow;
    const list = map.get(owner) ?? [];
    list.push(n); map.set(owner, list);
  }
  for (const [table, rows] of rowsByTable) {
    if (!rows.some(r => (cellsByRow.get(r) ?? []).some(n => isNotes(nt(n))))) continue;
    // Require a financial-statement index, rather than a contents-only notes row.
    if (!/balance\s*sheets?/i.test(nt(table))) continue;
    const enclosing = blocks.filter(n => n.end < table.start && !ancestor(n, "table") && !/<a\b[^>]*href/i.test(html.slice(n.start, n.end)) &&
      /^Item\s+(?:8\.?\s+Financial Statements(?: and Supplementary Data)?|15\.?\s+Exhibits\s*(?:,|and)\s*(?:and\s+)?Financial Statement Schedules)\.?$/i.test(nt(n))).at(-1);
    const enclosingItem = enclosing ? /^Item\s+15\b/i.test(nt(enclosing)) ? "15" : "8" : undefined;
    type Mapping = { title: string; dest: AppendixElement; page: Page };
    const mappings: Mapping[] = [];
    const groups: AppendixElement[] = [];
    let bad = false, notesGroup = false;
    for (const row of rows) {
      const cells = cellsByRow.get(row) ?? [];
      const title = cells.map(nt).find(s => s && !pageNumber(s)) ?? "";
      if (isNotes(title)) notesGroup = true;
      const links = linksByRow.get(row) ?? [];
      const pageCells = cells.filter(c => pageNumber(nt(c)));
      if (!links.length) {
        if (pageCells.length) { bad = true; break; }
        continue;
      }
      const hrefs = new Set(links.map(n => n.attrs.get("href")));
      if (pageCells.length === 0 && title === "Consolidated Financial Statements" && hrefs.size === 1) {
        const dest = resolve([...hrefs][0] ?? "");
        const page = dest && destinationPage(dest);
        if (!dest || !page || !blocks.some(n => n.start >= page.start && n.end <= page.footer && nt(n) === title &&
          !ancestor(n, "table") && !/<a\b[^>]*href/i.test(html.slice(n.start, n.end)))) { bad = true; break; }
        groups.push(dest);
        continue;
      }
      if (pageCells.length !== 1 || hrefs.size !== 1) { bad = true; break; }
      const dest = resolve([...hrefs][0] ?? ""), printed = pageNumber(nt(pageCells[0]!))!;
      const page = dest && destinationPage(dest);
      if (!dest || !page || page.number !== Number(printed[2]) || page.namespace !== (printed[1] ? "F" : "") ||
          pages.filter(p => p.number === page.number && p.namespace === page.namespace).length !== 1 || dest.start <= table.end) { bad = true; break; }
      // All links, including fragmented page links and title links, were checked.
      mappings.push({ title, dest, page });
    }
    if (bad || !notesGroup) continue;
    if (groups.some(g => !mappings.some(m => /^(?:Consolidated )?(?:Statements? of|Balance Sheets)/i.test(m.title) && destinationPage(g) === m.page))) continue;
    const openings = mappings.filter(m => isNotes(m.title) || /^Note\s+1\s*[-–—:]/i.test(m.title));
    if (openings.length !== 1) continue;
    const opening = openings[0]!;
    const heads = blocks.filter(n => n.start >= opening.page.start && n.end <= opening.page.footer && isNotes(nt(n)) &&
      !ancestor(n, "table") && !/<a\b[^>]*href/i.test(html.slice(n.start, n.end)));
    if (heads.length !== 1) continue;
    const head = heads[0]!;
    const boundary = blocks.find(n => {
      if (n.start <= head.end || ancestor(n, "table")) return false;
      const title = nt(n), item = /^Item\s+(\d+)[A-Z]?\./i.exec(title);
      if (item && ((enclosingItem && Number(item[1]) <= Number(enclosingItem)) || /\(continued\)\.?$/i.test(title))) return false;
      return /^(?:INDEX OF EXHIBITS|EXHIBIT INDEX|SIGNATURES|REPORT OF INDEPENDENT REGIST\s*ERED PUBLIC ACCOUNTING FIRM|Item\s+(?:7A|9|15|16)\..*|Schedule II(?:\s*[-–—:]?\s*Valuation and Qualifying Accounts)?)$/i.test(title);
    });
    // A heading that opens its own page need not continue the notes' numbering,
    // but nothing may stand between the last proved notes page and that heading.
    const boundaryPage = boundary ? pages.find(p => boundary.start >= p.start && boundary.start < p.end) : undefined;
    const opensPage = boundary !== undefined && (!boundaryPage || text(boundaryPage.start, boundary.start) === "");
    const endPage = !boundary ? pages.at(-1) : opensPage ? pages.filter(p => p.end <= boundary.start).at(-1) : boundaryPage;
    if (!endPage || (!boundary && endPage.end !== html.length)) continue;
    if (opensPage && text(endPage.end, boundary!.start) !== "") continue;
    const retained = pages.filter(p => p.start >= opening.page.start && p.start <= endPage.start);
    if (!retained.length || retained.some((p, i) => p.namespace !== opening.page.namespace || p.number !== opening.page.number + i ||
      (i > 0 && !breaks.some(br => br.start === retained[i - 1]!.end && br.end === p.start)))) continue;
    const end = boundary?.start ?? endPage.footer;
    // A notes sub-index cannot silently skip its later notes or cross the end.
    if (mappings.some(m => /^Note\s+\d+\b/i.test(m.title) && (m.page.start < opening.page.start || m.dest.start >= end))) continue;
    const body = text(head.start, end);
    const accepted = recognizeAnnualNotes(body);
    if (!accepted || accepted.start !== 0 || detectStub(body).isStub) continue;
    const evidence: AnnualNotesRedirectEvidence = {
      coordinateSystem: "original-html-characters", index: { start: table.start, end: table.end },
      ...(enclosingItem ? { enclosingItem } : {}),
      notes: { target: opening.dest.attrs.get("id") ?? opening.dest.attrs.get("name")!, page: { namespace: opening.page.namespace, number: opening.page.number }, start: head.start },
      boundary: { start: end, kind: boundary ? "heading" : "document-end", lastPage: endPage.number },
    };
    // The index also locates statements, but cannot establish their rows.
    // Retain only a matching original caption on its mapped page, across a
    // complete printed-page sequence, and require the existing table proof.
    let statementsText: string | undefined;
    for (const statement of mappings.filter(m => m.page.start < opening.page.start &&
      STATEMENT_CAPTION.test(m.title.replace(/\s+/g, ""))).sort((a, b) => a.page.start - b.page.start || a.dest.start - b.dest.start)) {
      const sequence = pages.filter(p => p.start >= statement.page.start && p.start <= opening.page.start);
      if (sequence.some((p, i) => p.namespace !== statement.page.namespace || p.number !== statement.page.number + i ||
        pages.filter(other => other.namespace === p.namespace && other.number === p.number).length !== 1 ||
        (i > 0 && !breaks.some(br => br.start === sequence[i - 1]!.end && br.end === p.start)))) continue;
      const captions = elements.filter(n => !n.hidden && /^(?:p|div|h[1-6]|span)$/.test(n.tag) &&
        n.start >= Math.max(statement.page.start, statement.dest.start) && n.end <= statement.page.footer &&
        !ancestor(n, "table") && !ancestor(n, "a") && !/<a\b[^>]*href/i.test(html.slice(n.start, n.end)) &&
        normalizeTitle(nt(n)) === normalizeTitle(statement.title));
      // Formatting wrappers can share one physical caption; distinct captions
      // on the same page remain ambiguous rather than borrowing each other's rows.
      const leaves = captions.filter(n => !captions.some(child => child.start > n.start && child.end < n.end));
      if (leaves.length !== 1) continue;
      const caption = leaves[0]!;
      if (blocks.some(n => n.start > caption.end && n.start < head.start &&
        /^(?:INDEX OF EXHIBITS|EXHIBIT INDEX|SIGNATURES|REPORT OF INDEPENDENT REGIST\s*ERED PUBLIC ACCOUNTING FIRM|Item\s+(?:7A|9|15|16)\..*|Schedule II(?:\s*[-–—:]?\s*Valuation and Qualifying Accounts)?)$/i.test(nt(n)))) continue;
      const candidate = text(caption.start, head.start);
      // Require proof owned by this mapped leading caption. A later table or
      // plain-text statement cannot rescue its missing or incompatible rows.
      const proved = financialStatementText(candidate, 12_000, source ??= parseDocument(html), true).statementsText;
      if (!proved) continue;
      statementsText = proved;
      evidence.statements = { target: statement.dest.attrs.get("id") ?? statement.dest.attrs.get("name")!, start: caption.start, retainedChars: proved.length };
      break;
    }
    return { text: body, method: "annual-notes-index-redirect", ...(statementsText ? { statementsText } : {}), evidence };
  }
  return null;
}

// ---------------------------------------------------------------------------
// extractFromExhibit — Layer 3b completion (EX-13 body)
// ---------------------------------------------------------------------------

export interface ExhibitExtractOptions {
  section: SectionKind;
  /** Quoted titles parsed from the incorporation stub (preferred over synonyms). */
  quotedTitles?: string[];
  stubMinChars?: number;
}

/**
 * Extract a section from an EX-13 / annual-report exhibit document.
 * Route 1: title-based row-scoped TOC slicing (WFC EX-13 — cell order varies,
 * page number may be the link text, F21).
 * Route 2: title-only heading match on stripped text — FIRST ALL-CAPS/heading
 * occurrence (FRD; decoy titles appear AFTER the real header there), sliced to
 * the next major heading or EOF.
 */
export function extractFromExhibit(exhibitHtml: string, opts: ExhibitExtractOptions): ExtractResult {
  const minChars = opts.stubMinChars ?? STUB_MIN_CHARS;
  const notes: string[] = [];
  const layersTried: string[] = [];
  const pre = stripHiddenBlocks(exhibitHtml);
  const entries = parseTocEntries(pre);
  const diagnostics: ExtractDiagnostics = {
    layersTried,
    tocEntryCount: entries.length,
    itemEntryCount: 0,
    notes,
  };

  const synonyms = buildSynonyms(opts.section, opts.quotedTitles ?? []);

  // Route 1 — exhibit contents TOC. Synonyms are tried in PRIORITY order
  // (quoted titles from the stub first, then generic synonyms).
  layersTried.push("exhibit-toc");
  const titleEntries = entries.filter((e) => e.title !== "");
  if (titleEntries.length > 0) {
    const pos = anchorPositions(pre, titleEntries);
    let start: TocEntry | undefined;
    for (const syn of synonyms) {
      start = titleEntries.find((e) => normalizeTitle(e.title).includes(syn) && (pos.get(e.target) ?? -1) >= 0);
      if (start !== undefined) break;
    }
    if (start !== undefined) {
      const startPos = pos.get(start.target) as number;
      const boundaries = BOUNDARY_SYNONYMS[opts.section];
      const after = titleEntries.flatMap((e) => {
        const p = pos.get(e.target);
        return p === undefined || p <= startPos || e.target === start.target ? [] : [{ e, p }];
      });

      // A named boundary wins. The all-caps peer rule is a FALLBACK, not an
      // equal alternative: inside an exhibit, a section's own SUBSECTIONS are
      // typically all-caps too ("RESULTS OF OPERATIONS" within "FINANCIAL
      // REVIEW"), so treating any all-caps peer as a boundary ended the slice
      // at the first subsection and returned that fragment as ok:true — a
      // silently truncated section, with no note saying so.
      let endPos = pre.length;
      let namedBoundary = false;
      for (const { e, p } of after) {
        const n = normalizeTitle(e.title);
        if (boundaries.some((b) => n.includes(b))) {
          namedBoundary = true;
          if (p < endPos) endPos = p;
        }
      }
      if (!namedBoundary && isAllCaps(start.title)) {
        for (const { e, p } of after) {
          if (isAllCaps(e.title) && p < endPos) endPos = p;
        }
        if (endPos < pre.length) {
          notes.push(
            "exhibit slice bounded by the next ALL-CAPS heading (no named section boundary followed the start) — " +
              "the section may be truncated at a subsection heading.",
          );
        }
      }
      const text = htmlToText(pre.slice(startPos, endPos));
      if (text.length >= minChars) {
        return { ok: true, text, method: "exhibit-toc", chars: text.length, diagnostics };
      }
      notes.push(`exhibit TOC slice too short (${text.length} chars)`);
    }
  }

  // Route 2 — ALL-CAPS standalone heading, FIRST occurrence.
  layersTried.push("exhibit-header");
  const fullText = htmlToText(pre);
  for (const syn of synonyms) {
    const headRe = allCapsTitleRegex(syn);
    const m = headRe.exec(fullText);
    if (m === null) continue;
    const start = m.index;
    // End at the next major ALL-CAPS boundary heading, else EOF.
    let end = fullText.length;
    const rest = fullText.slice(start + m[0].length);
    for (const b of BOUNDARY_SYNONYMS[opts.section]) {
      const bm = allCapsTitleRegex(b).exec(rest);
      if (bm !== null) {
        const abs = start + m[0].length + bm.index;
        if (abs < end) end = abs;
      }
    }
    const text = fullText.slice(start, end).trim();
    if (text.length >= minChars) {
      return { ok: true, text, method: "exhibit-header", chars: text.length, diagnostics };
    }
    notes.push(`exhibit heading "${syn}" slice too short (${text.length} chars)`);
  }

  return {
    ok: false,
    error: new ExtractionError("no_section_found", `no ${opts.section} section found in exhibit (titles tried: ${synonyms.join("; ")})`),
    diagnostics,
  };
}

/**
 * A title quoted in the stub names the exhibit section the item was
 * incorporated from — but a stub can quote MORE than its own target ("see
 * 'Risk Factors' and 'Management's Discussion and Analysis' in the Annual
 * Report"), and every quoted title used to outrank the generic synonyms for
 * whichever section was being extracted. A quoted title that names ANOTHER
 * section kind is therefore left out: kept, it selected the MD&A as the risk
 * factors of a two-title stub.
 */
function buildSynonyms(kind: SectionKind, quoted: string[]): string[] {
  const out: string[] = [];
  // Exhibit redirects exist for the MD&A and risk factors only; the D-63 kinds
  // (business, financial statements) never reach an EX-13 and must not change
  // which quoted titles those two keep.
  const otherKinds = (["mdna", "riskFactors"] as const).filter((k) => k !== kind);
  const namesAnotherKind = (title: string): boolean =>
    !titleMatchesKind(title, kind) && otherKinds.some((k) => titleMatchesKind(title, k));
  for (const q of quoted) {
    const n = normalizeTitle(q);
    if (namesAnotherKind(n)) continue;
    if (n.length >= 3 && !out.includes(n)) out.push(n);
    // "Financial Review – Risk Factors" → also try the segment after the dash.
    const seg = n.split(" - ").pop();
    if (seg !== undefined && seg !== n && seg.length >= 3 && !out.includes(seg) && !namesAnotherKind(seg)) out.push(seg);
  }
  for (const s of TITLE_SYNONYMS[kind]) if (!out.includes(s)) out.push(s);
  return out;
}

/** Build a case-sensitive ALL-CAPS regex for a normalized title. */
function allCapsTitleRegex(normTitle: string): RegExp {
  const words = normTitle
    .toUpperCase()
    .split(/\s+/)
    .filter((w) => w !== "");
  const body = words
    .map((w) => (w === "AND" ? "(?:AND|&)" : escapeRegExp(w).replace(/'/g, "['’]")))
    .join("[\\s]+");
  return new RegExp(body, "g");
}
