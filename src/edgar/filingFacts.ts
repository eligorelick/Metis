/**
 * D-66: the figures an equity reader takes from a filing's notes, statements
 * and commentary that no typed statement row carries, read as citable facts.
 * NVDA final rerun (2026-10-16): the report could not state the scale of the
 * strategic investments (non-marketable $51.2B, $36.9B under lock-up, $42.4B
 * of equity purchases in the half), the Groq consideration, the supply
 * commitments' jump, the DSO stretch or the officers' trading plans, although
 * every one is printed in the filings the pipeline already reads.
 *
 * Every parser is pure, reads one standard phrasing and returns nothing when
 * the phrasing is absent: a missing fact is never inferred. Money is returned
 * with its printed symbol; the caller admits it only in the statements'
 * currency. Amounts in a table take the table's "(In millions)" scale.
 */
import { isoFromMonthDate, normalizeFilingText, splitSentences } from "@/edgar/currentReports";

export interface FilingFact {
  /** Stable key for the fact's kind ("investments-lock-up"). */
  key: string;
  /** What the figure is, in the filing's words. */
  label: string;
  value: number;
  unit: "currency" | "days" | "shares" | "count";
  /** The printed money symbol ("$"); null for a non-money figure. */
  symbol: string | null;
  /** The date the figure is stated at or for (a balance date, a period end). */
  asOf: string | null;
  /** The printed window ("six months ended 2026-07-26"), when the figure is a flow. */
  period: string | null;
  /** "more than", "approximately", "up to": the filing's own qualifier. */
  qualifier: string | null;
  /** The arithmetic, when the figure is computed from printed ones. */
  computed: string | null;
  /** The source sentence or row, bounded. */
  text: string;
}

const SCALE: Readonly<Record<string, number>> = { thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12 };
const MONTH_DATE = String.raw`(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}`;
const AMOUNT = String.raw`(\$|US\$)\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(thousand|million|billion|trillion)`;

function money(raw: string, scale: string): number {
  return Number((Number(raw.replace(/,/g, "")) * SCALE[scale.toLowerCase()]!).toFixed(2));
}
function clip(text: string, max = 320): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}
function fact(over: Partial<FilingFact> & Pick<FilingFact, "key" | "label" | "value" | "unit" | "text">): FilingFact {
  return { symbol: null, asOf: null, period: null, qualifier: null, computed: null, ...over, text: clip(over.text) };
}

/**
 * Investment scale stated in the notes: the amount under lock-up, the
 * equity-method investments and their variable-interest-entity exposure.
 */
export function parseInvestmentFacts(rawText: string, periodEnd: string | null): FilingFact[] {
  const out: FilingFact[] = [];
  const text = normalizeFilingText(rawText);
  // A purchase-consideration balance is attributable only through this
  // table's numbered footnote, never a party mentioned elsewhere in notes.
  const accruedHeader = new RegExp(String.raw`(${MONTH_ABBR})\s+(${MONTH_ABBR})\s+Accrued and Other Current Liabilities:\s*\(In millions\)`, "i").exec(text);
  if (periodEnd !== null && accruedHeader !== null && isoFromTableDate(accruedHeader[1]!) === periodEnd) {
    const body = text.slice(accruedHeader.index + accruedHeader[0].length).split(new RegExp(String.raw`${MONTH_ABBR}\s+${MONTH_ABBR}\s+Other Long-Term Liabilities:`, "i"))[0]!.slice(0, 2_500);
    const row = /\bAccrued purchase consideration\s+\((\d{1,2})\)\s+\$?\s*([\d,]+)\s+\$?\s*([\d,]+)/i.exec(body);
    const linked = row === null ? null : new RegExp(String.raw`\(${row[1]}\)\s+Related to the ([A-Z][\w&.'’-]*(?:\s+[A-Z][\w&.'’-]*){0,4}?)(?:,\s*(?:Inc|LLC|Ltd)\.?)?\s+(?:non-exclusive license agreement|acquisition|transaction)\.`).exec(body);
    if (row !== null && linked !== null) out.push(fact({ key: "accrued-purchase-consideration", label: `accrued purchase consideration for the ${linked[1]} transaction`,
      value: Number(row[2]!.replace(/,/g, "")) * 1e6, unit: "currency", symbol: "$", asOf: periodEnd,
      text: `${accruedHeader[0]} ${row[0]}. ${linked[0]}` }));
  }
  // The securities table separates current marketable equities from public
  // equities carried in Other Assets. Read its eight explicitly named totals,
  // and require the adjacent note to identify that last column as long-term.
  const table = /Marketable Equity Securities Other Assets \(In millions\)/i.exec(text);
  if (table !== null) {
    const body = text.slice(table.index + table[0].length, table.index + 3_000);
    const total = new RegExp(String.raw`\bTotal(?:\s+\$?\s*${CELL}){8}`).exec(body);
    const values = total?.[0].replace(/^Total/, "").match(/\([\d,\s]+\)|[\d,]+|—|–/g);
    const tableDate = [...text.slice(Math.max(0, table.index - 500), table.index).matchAll(new RegExp(MONTH_ABBR, "g"))].at(-1);
    if (values?.length === 8 && tableDate !== undefined && /long-term portion of publicly-held equity securities/i.test(body)) {
      const asOf = isoFromTableDate(tableDate[0]);
      if (asOf === periodEnd && /^[\d,]+$/.test(values[7]!)) out.push(fact({ key: "long-term-public-equity-securities", label: "long-term publicly-held equity securities",
        value: Number(values[7]!.replace(/,/g, "")) * 1e6, unit: "currency", symbol: "$", asOf, text: `${total![0]} (Other Assets column, in millions; ${tableDate[0]})` }));
    }
  }
  // A table footnote ("(1) Included $36.9 billion of investments that are
  // subject to … lock-up …") is dated by its table's header date; the notes
  // repeat the table for the prior balance date.
  for (const lockUp of text.matchAll(new RegExp(String.raw`\b(?:Included|includes?)\s+${AMOUNT}\s+of investments that are subject to ((?:short-term\s+)?lock-up restrictions)[^.]*\.`, "gi"))) {
    const header = [...text.slice(Math.max(0, lockUp.index - 4_000), lockUp.index).matchAll(new RegExp(MONTH_ABBR, "g"))].at(-1);
    const asOf = header === undefined ? periodEnd : isoFromTableDate(header[0]);
    out.push(fact({ key: "investments-lock-up", label: `investments subject to ${lockUp[4]!.toLowerCase()}`, value: money(lockUp[2]!, lockUp[3]!),
      unit: "currency", symbol: lockUp[1]!, asOf, text: lockUp[0] }));
  }
  for (const sentence of splitSentences(text)) {
    const equityMethod = new RegExp(String.raw`${AMOUNT}\s+of investments in ([a-z][a-z\s-]{2,60}?) accounted for (?:using|under) the equity method as of (${MONTH_DATE})`, "i").exec(sentence);
    if (equityMethod) {
      out.push(fact({ key: "equity-method-investments", label: `equity-method investments in ${equityMethod[4]!.trim()}`, value: money(equityMethod[2]!, equityMethod[3]!),
        unit: "currency", symbol: equityMethod[1]!, asOf: isoFromMonthDate(equityMethod[5]!), text: sentence }));
    }
    const vie = new RegExp(String.raw`\bvariable interest entities\b[^.]{0,80}?\bmaximum loss exposure\b[^$]{0,80}?\bof\s+${AMOUNT}\s+as of (${MONTH_DATE})`, "i").exec(sentence);
    if (vie) {
      out.push(fact({ key: "vie-maximum-loss", label: "maximum loss exposure to equity-method variable interest entities",
        value: money(vie[2]!, vie[3]!), unit: "currency", symbol: vie[1]!, asOf: isoFromMonthDate(vie[4]!), text: sentence }));
    }
  }
  return out;
}

/**
 * "increasing supply commitments from $119 billion last quarter to $279
 * billion as of July 26, 2026" (10-Q notes and MD&A); "financing platforms
 * designed to mobilize more than $500 billion of third-party capital".
 */
export function parseCommitmentFacts(rawText: string): FilingFact[] {
  const out: FilingFact[] = [];
  const seen = new Set<string>();
  for (const sentence of splitSentences(normalizeFilingText(rawText))) {
    const supply = new RegExp(String.raw`\b(supply(?:\s+and\s+capacity)?\s+commitments)\s+from\s+${AMOUNT}\s+last quarter\s+to\s+${AMOUNT}\s+as of (${MONTH_DATE})`, "i").exec(sentence);
    if (supply && !seen.has("supply")) {
      seen.add("supply");
      const asOf = isoFromMonthDate(supply[8]!);
      const label = supply[1]!.toLowerCase().replace(/\s+/g, " ");
      out.push(
        fact({ key: "supply-commitments", label, value: money(supply[6]!, supply[7]!), unit: "currency", symbol: supply[5]!, asOf, text: supply[0] }),
        fact({ key: "supply-commitments-prior-quarter", label: `${label} at the prior quarter end`, value: money(supply[3]!, supply[4]!), unit: "currency",
          symbol: supply[2]!, asOf, period: "prior quarter end", text: supply[0] }),
      );
    }
    const platforms = new RegExp(String.raw`\b(?:financing\s+)?(platforms?|vehicles?|programs?)\s+designed to (?:mobilize|raise|deploy)\s+(more than|up to|approximately)?\s*${AMOUNT}\s+of\s+third-party capital`, "i").exec(sentence);
    if (platforms && !seen.has("platforms")) {
      seen.add("platforms");
      const month = /\bIn\s+((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})\b/.exec(sentence)?.[1] ?? null;
      out.push(fact({ key: "financing-platforms-capital", label: "third-party capital the financing platforms are designed to mobilize",
        value: money(platforms[4]!, platforms[5]!), unit: "currency", symbol: platforms[3]!, period: month, qualifier: platforms[2]?.toLowerCase() ?? null, text: sentence }));
    }
  }
  return out;
}

const MONTH_ABBR = String.raw`(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}`;
const FULL_MONTH: Readonly<Record<string, string>> = { jan: "January", feb: "February", mar: "March", apr: "April", may: "May", jun: "June", jul: "July",
  aug: "August", sep: "September", oct: "October", nov: "November", dec: "December" };
/** "Jul 26, 2026" or "July 26, 2026" -> "2026-07-26". */
function isoFromTableDate(text: string): string | null {
  return isoFromMonthDate(text.replace(/^([A-Za-z]{3})[a-z]*\.?/, (word, abbr: string) => FULL_MONTH[abbr.toLowerCase()] ?? word));
}
/** "Six Months Ended Jul 26, 2026 Jul 27, 2025": the first column's window and end. */
function statementHeader(text: string): { months: number; end: string } | null {
  const m = new RegExp(String.raw`\b(Three|Six|Nine|Twelve)\s+Months\s+Ended\s+(${MONTH_ABBR})`, "i").exec(text) ??
    new RegExp(String.raw`\b(Year)\s+Ended\s+(${MONTH_ABBR})`, "i").exec(text);
  if (m === null) return null;
  const end = isoFromTableDate(m[2]!);
  const months = ({ three: 3, six: 6, nine: 9, twelve: 12, year: 12 } as Record<string, number>)[m[1]!.toLowerCase()]!;
  return end === null ? null : { months, end };
}
const CELL = String.raw`(\(\s*[\d,]+\s*\)|[\d,]+|—|–)`;
/** Financing lines every issuer has; the rest (a payment to a named party) are what the report lacks. */
const STANDARD_FINANCING = /\b(?:debt|borrowings?|notes|repurchases?|dividends?|employee stock|stock plans?|stock options?|principal payments|finance leases?|commercial paper)\b|^other$/i;

/**
 * The condensed statements' investment lines no typed statement row carries:
 * purchases and sales of equity securities and acquisitions (investing), a
 * financing line that is not a standard one (NVIDIA: "Groq, Inc. (2,944)"),
 * and the non-marketable securities balance. Amounts are the current column
 * (year to date for a flow), as paid or received.
 */
export function parseStatementFacts(rawText: string): FilingFact[] {
  const text = normalizeFilingText(rawText);
  const out: FilingFact[] = [];
  const cash = /Statements of Cash Flows\b/i.exec(text);
  if (cash !== null) {
    const body = text.slice(cash.index, cash.index + 8_000);
    const header = statementHeader(body);
    const scale = /\(In millions/i.test(body.slice(0, 400)) ? 1e6 : /\(In thousands/i.test(body.slice(0, 400)) ? 1e3 : null;
    if (header !== null && scale !== null) {
      const window = `${({ 3: "three", 6: "six", 9: "nine", 12: "twelve" } as Record<number, string>)[header.months]} months ended ${header.end}`;
      for (const [kind, from, to] of [["investing", /Cash flows from investing activities:?/i, /Net cash (?:used in|provided by) investing activities/i],
        ["financing", /Cash flows from financing activities:?/i, /Net cash (?:used in|provided by) financing activities/i]] as const) {
        const start = from.exec(body);
        const stop = to.exec(body);
        if (start === null || stop === null || stop.index <= start.index) continue;
        const block = body.slice(start.index + start[0].length, stop.index);
        for (const row of block.matchAll(new RegExp(String.raw`([A-Z][A-Za-z ,.&'’()-]*?[A-Za-z.)])\s+${CELL}\s+${CELL}`, "g"))) {
          const label = row[1]!.replace(/^(?:and\s+)?/, "").trim();
          const cell = row[2]!;
          if (/^[—–]$/.test(cell)) continue;
          const wanted = kind === "investing" ? /\bequity securities\b|\bacquisitions?\b/i.test(label) : !STANDARD_FINANCING.test(label);
          if (!wanted) continue;
          const outflow = cell.startsWith("(");
          const value = Number(cell.replace(/[(),\s]/g, "")) * scale;
          // An investing line names its own direction ("Purchases of …", "Proceeds from …"); a financing line to a named party does not.
          const named = kind === "financing" ? `${label} (financing ${outflow ? "payment" : "receipt"})` : label;
          out.push(fact({ key: `${kind}-cash-flow`, label: named, value, unit: "currency", symbol: "$",
            asOf: header.end, period: window, text: `${label} ${cell} ${row[3]!} (${window}, ${scale === 1e6 ? "in millions" : "in thousands"})` }));
        }
      }
    }
  }
  const balance = new RegExp(String.raw`Balance Sheets?\b[^]{0,200}?\(In millions\)[^]{0,40}?(${MONTH_ABBR})`, "i").exec(text);
  if (balance !== null) {
    const end = isoFromTableDate(balance[1]!);
    const body = text.slice(balance.index, balance.index + 4_000);
    for (const [key, label, pattern] of [["non-marketable-securities", "non-marketable securities", /\bNon-marketable (?:equity )?securities\s+\$?\s?([\d,]+)\s+\$?\s?([\d,]+)/i],
      ["marketable-equity-securities", "marketable equity securities", /\bMarketable equity securities\s+\$?\s?([\d,]+)\s+\$?\s?([\d,]+)/i]] as const) {
      const row = pattern.exec(body);
      if (row !== null && end !== null) out.push(fact({ key, label, value: Number(row[1]!.replace(/,/g, "")) * 1e6,
        unit: "currency", symbol: "$", asOf: end, text: `${row[0]} (In millions)` }));
    }
  }
  return out;
}

/**
 * A business combination or asset deal in the annual notes: the goodwill and
 * intangible recorded, and the consideration paid and payable, under the
 * counterparty the note names. The total is computed from the two parts.
 */
export function parseBusinessCombinationFacts(rawText: string, fiscalYearEnd: string | null): FilingFact[] {
  const text = normalizeFilingText(rawText);
  const out: FilingFact[] = [];
  const notes = [...text.matchAll(/\bNote\s+(\d{1,2})\s*[-–—]\s*/g)];
  for (let i = 0; i < notes.length; i++) {
    const body = text.slice(notes[i]!.index, notes[i + 1]?.index ?? text.length);
    // A note can cover several transactions. Until amounts are explicitly
    // transaction-scoped, never attach the whole note to its first party.
    const parties = new Set([...body.matchAll(/\b(?:agreement|acquisition|merger)\s+with\s+([A-Z][\w&.'’-]*(?:\s+[A-Z][\w&.'’-]*){0,4}?)(?=,|\s+\(|\s+or\b|\s+for\b|\.)|\bacquired\s+([A-Z][\w&.'’-]*(?:\s+[A-Z][\w&.'’-]*){0,4}?)(?=,|\s+\(|\s+or\b|\s+for\b|\.)/g)].map((m) => m[1] ?? m[2]));
    if (parties.size > 1) continue;
    const party = /\b(?:agreement|acquisition|merger)\s+with\s+([A-Z][\w&.'’-]*(?:\s+[A-Z][\w&.'’-]*){0,4}?)(?:,\s*(?:Inc|LLC|Ltd|Corp|Corporation|Co)\.?)?(?=,|\s+\(|\s+or\b|\s+for\b|\.)/.exec(body)?.[1] ??
      /\bacquired\s+([A-Z][\w&.'’-]*(?:\s+[A-Z][\w&.'’-]*){0,4}?)(?=,|\s+\(|\s+or\b|\s+for\b|\.)/.exec(body)?.[1] ?? null;
    if (party === null) continue;
    const goodwill = new RegExp(String.raw`\bWe recorded\s+${AMOUNT}\s+of goodwill(?:\s+and\s+an?\s+${AMOUNT}\s+([a-z][a-z\s-]{0,40}?)\s+intangible assets?)?`, "i").exec(body);
    const consideration = new RegExp(String.raw`\bTotal consideration consists of\s+${AMOUNT}\s+paid at closing\s+and\s+${AMOUNT}(?:,\s*inclusive of imputed interest,)?\s+payable within ([a-z\s]{3,20}?)(?=\s+included|\.|,)`, "i").exec(body);
    if (goodwill === null && consideration === null) continue;
    const sentenceOf = (index: number): string => splitSentences(body.slice(Math.max(0, body.lastIndexOf(". ", index) + 2), index + 400))[0] ?? body.slice(index, index + 300);
    if (goodwill !== null) {
      out.push(fact({ key: "deal-goodwill", label: `goodwill recorded for the ${party} transaction`, value: money(goodwill[2]!, goodwill[3]!), unit: "currency",
        symbol: goodwill[1]!, asOf: fiscalYearEnd, text: sentenceOf(goodwill.index) }));
      if (goodwill[4] !== undefined) {
        out.push(fact({ key: "deal-intangible", label: `${goodwill[7]!.trim()} intangible asset recorded for the ${party} transaction`, value: money(goodwill[5]!, goodwill[6]!),
          unit: "currency", symbol: goodwill[4]!, asOf: fiscalYearEnd, text: sentenceOf(goodwill.index) }));
      }
    }
    if (consideration !== null) {
      const paid = money(consideration[2]!, consideration[3]!);
      const payable = money(consideration[5]!, consideration[6]!);
      const sentence = sentenceOf(consideration.index);
      out.push(
        fact({ key: "deal-consideration-paid", label: `${party} consideration paid at closing`, value: paid, unit: "currency", symbol: consideration[1]!, asOf: fiscalYearEnd, text: sentence }),
        fact({ key: "deal-consideration-payable", label: `${party} consideration payable within ${consideration[7]!.trim()} (inclusive of imputed interest)`, value: payable,
          unit: "currency", symbol: consideration[4]!, asOf: fiscalYearEnd, text: sentence }),
        fact({ key: "deal-consideration-total", label: `${party} total consideration (paid at closing plus payable)`, value: Number((paid + payable).toFixed(2)),
          unit: "currency", symbol: consideration[1]!, asOf: fiscalYearEnd, computed: `${consideration[2]} ${consideration[3]} + ${consideration[5]} ${consideration[6]}`, text: sentence }),
      );
    }
  }
  return out;
}

export interface WorkingCapitalFacts {
  /** Days sales outstanding at the quarter end, and the comparison the commentary gives. */
  dso: number | null;
  priorDso: number | null;
  comparison: "sequential" | "year-ago" | null;
  receivables: number | null;
  receivablesSymbol: string | null;
  /** The commentary's stated reason for the move, bounded. */
  reason: string | null;
  /** The commentary's expectation for DSO ("We expect our DSO to return to more normal levels next quarter."). */
  expectation: string | null;
  sentence: string | null;
}

/** "Accounts receivable was $63.1 billion with 60 days sales outstanding (DSO), up from 45 days sequentially, due to …". */
export function parseWorkingCapital(rawText: string): WorkingCapitalFacts | null {
  const sentences = splitSentences(normalizeFilingText(rawText));
  let found: WorkingCapitalFacts | null = null;
  for (const [i, sentence] of sentences.entries()) {
    const m = new RegExp(String.raw`\bAccounts receivable was\s+${AMOUNT}\s+with\s+(\d{1,3})\s+days sales outstanding(?:\s*\(DSO\))?,?\s+(?:(up|down)\s+from\s+(\d{1,3})\s+days\s+(sequentially|from a year ago|year[- ]over[- ]year))?([^.]*)`, "i").exec(sentence);
    if (m === null) continue;
    const reason = (m[8] ?? "").replace(/^,?\s*(?:due to|driven by|reflecting|as a result of)\s+/i, "").trim();
    const expectation = sentences.slice(i, i + 4).find((s) => /\bexpect\b[^.]*\bDSO\b|\bDSO\b[^.]*\b(?:expect|normaliz)/i.test(s) && s !== sentence) ?? null;
    found = {
      dso: Number(m[4]), priorDso: m[6] ? Number(m[6]) : null,
      comparison: m[7] ? (/sequential/i.test(m[7]) ? "sequential" : "year-ago") : null,
      receivables: money(m[2]!, m[3]!), receivablesSymbol: m[1]!, reason: reason === "" ? null : clip(reason, 200), expectation: expectation === null ? null : clip(expectation, 200),
      sentence: clip(sentence),
    };
    break;
  }
  return found;
}

// ---------------------------------------------------------------------------
// Officers and directors: 8-K Items 5.02 and 5.07, 10-Q Part II Item 5
// ---------------------------------------------------------------------------

export interface OfficerChange {
  kind: "departure" | "appointment";
  person: string;
  /** The role the filing names, with its own abbreviations dropped ("VP and CAO" read in full). */
  role: string;
  /** A Board seat rather than an executive office. */
  board: boolean;
  /** The date the filing says the change was decided or notified. */
  announced: string | null;
  /** The effective date, when the filing states one or ties it to a successor's start. */
  effective: string | null;
  /** The effective date is an expected one ("anticipated to be on …"). */
  anticipated: boolean;
  /** What the filing says happens after the change ("remain with the Company as VP, Finance … until July 1, 2026"). */
  note: string | null;
  /** An appointment's compensation terms (base salary, sign-on bonus, equity target values). */
  package: { component: string; value: number; symbol: string }[];
}

const NAME = String.raw`([A-Z][a-zA-Z'’-]+(?:\s+(?:[A-Z]\.|[A-Z][a-zA-Z'’-]+)){1,3})`;
/** "Vice President, or VP, and Chief Accounting Officer, or CAO," is "Vice President and Chief Accounting Officer". */
function cleanRole(role: string): string {
  return role.replace(/,\s*or\s+[A-Z]{2,5},?/g, "").replace(/\s+,/g, ",").replace(/,\s*$/, "").replace(/\s+/g, " ").trim();
}

/**
 * One 8-K Item 5.02's officer and director changes, from its lettered
 * paragraphs. A departure "effective upon the employment commencement date of
 * his successor" takes the successor's (anticipated) start date from the
 * appointment the same item reports.
 */
export function parseOfficerChanges(itemText: string): OfficerChange[] {
  const text = normalizeFilingText(itemText);
  const paragraphs = text.split(/\s(?=\([a-f]\)\s+On\s)/).map((p) => p.replace(/^\([a-f]\)\s+/, ""));
  const out: OfficerChange[] = [];
  const tiedToSuccessor = new Set<OfficerChange>();
  for (const paragraph of paragraphs) {
    const lead = new RegExp(String.raw`^On (${MONTH_DATE}),\s+`).exec(paragraph);
    if (lead === null) continue;
    const announced = isoFromMonthDate(lead[1]!);
    const rest = paragraph.slice(lead[0].length);
    const appointed = new RegExp(String.raw`\bappointed\s+${NAME},(?:\s+age\s+\d+,)?\s+as\s+(a member of the Board|[^.]+?)\s+of\s+the\s+Company\b`).exec(rest) ??
      new RegExp(String.raw`\bappointed\s+${NAME},(?:\s+age\s+\d+,)?\s+as\s+(a member of the Board|[^.,]+)`).exec(rest);
    if (appointed !== null) {
      const start = new RegExp(String.raw`\beffective\s+(?:upon\s+the\s+commencement\s+of\s+(?:his|her|their)\s+employment[^.]*?(?:which is anticipated to be|on))?\s*(?:on\s+)?(${MONTH_DATE})`, "i").exec(rest);
      const anticipated = /\banticipated to be on\b/i.test(rest);
      const pkg: OfficerChange["package"] = [];
      const component = (label: string, pattern: RegExp): void => {
        const m = pattern.exec(rest);
        if (m !== null) pkg.push({ component: label, value: Number(m[2]!.replace(/,/g, "")), symbol: m[1]! });
      };
      component("annual base salary", /\bannual base salary will be\s+(\$)\s?([\d,]+)/i);
      component("sign-on bonus", /\bsign-on bonus of\s+(\$)\s?([\d,]+)/i);
      component("target annualized cash variable compensation", /\btarget annualized cash variable compensation of\s+(\$)\s?([\d,]+)/i);
      component("new-hire restricted stock units, target value", /\brestricted stock units(?:,\s*or RSUs,)?\s+with a target value of\s+(\$)\s?([\d,]+)/i);
      component("new-hire performance-based restricted stock units, target value", /\bperformance-based RSUs(?:,\s*or [A-Z ]+,)?\s+with a target value of\s+(\$)\s?([\d,]+)/i);
      out.push({ kind: "appointment", person: appointed[1]!, role: cleanRole(appointed[2]!), board: /Board/.test(appointed[2]!), announced,
        effective: start === null ? null : isoFromMonthDate(start[1]!), anticipated, note: null, package: pkg });
      continue;
    }
    const departing = new RegExp(String.raw`^${NAME},\s+(.+?)\s+of\s+[A-Z][\w.,& ]*?(?:,\s*or the Company,)?\s+(?:notified|informed|announced)[^.]*?\b(?:retire|resign|step down|depart)`).exec(rest) ??
      new RegExp(String.raw`^${NAME}\s+(resigned|retired)\s+from\s+(?:the\s+)?(Board of Directors|[^.,]+?)(?:,|\s+effective|\.)`).exec(rest);
    if (departing !== null) {
      const role = departing[2] === "resigned" || departing[2] === "retired" ? departing[3]! : departing[2]!;
      const dated = new RegExp(String.raw`\beffective\s+(${MONTH_DATE})`, "i").exec(rest);
      const onSuccessor = /\beffective upon the (?:employment commencement date|commencement of employment) of (?:his|her|their) successor\b/i.test(rest);
      const immediately = /\beffective immediately\b/i.test(rest);
      const after = /\b(?:Following such date|Thereafter|After (?:that|such) date),?\s+(?:he|she|they) will\s+([^.]+)\./i.exec(rest)?.[1] ??
        /\b(is expected to remain with the Company\s+[^.]+)\./i.exec(rest)?.[1] ?? null;
      const change: OfficerChange = { kind: "departure", person: departing[1]!, role: cleanRole(role), board: /Board/.test(role), announced,
        effective: dated !== null ? isoFromMonthDate(dated[1]!) : immediately ? announced : null, anticipated: false,
        note: after === null ? null : clip(after, 160), package: [] };
      if (onSuccessor && change.effective === null) tiedToSuccessor.add(change);
      out.push(change);
    }
  }
  // A departure tied to the successor's start takes that (anticipated) date.
  const successor = out.find((c) => c.kind === "appointment" && !c.board && c.effective !== null);
  for (const change of tiedToSuccessor) {
    const when = successor === undefined ? "effective when the successor's employment begins" : `effective when ${successor.person}'s employment begins`;
    if (successor !== undefined) {
      change.effective = successor.effective;
      change.anticipated = successor.anticipated;
    }
    change.note = [when, change.note].filter((part): part is string => part !== null).join("; ");
  }
  return out;
}

export interface SayOnPayVote {
  meetingDate: string | null;
  approved: boolean;
  votesFor: number;
  votesAgainst: number;
  abstentions: number;
  brokerNonVotes: number | null;
}

/** The advisory vote on named-executive-officer pay in an 8-K Item 5.07. */
export function parseSayOnPay(itemText: string): SayOnPayVote | null {
  const text = normalizeFilingText(itemText);
  const meeting = new RegExp(String.raw`\bOn (${MONTH_DATE}),\s+at the [^.]*?Annual Meeting`, "i").exec(text);
  const proposals = text.split(/\s(?=\d{1,2}\.\s+Stockholders\s)/);
  for (const proposal of proposals) {
    if (!/\badvisory\b[^.]*\bcompensation of (?:our|the Company['’]s) named executive officers\b|\bcompensation of (?:our|the Company['’]s) named executive officers\b[^.]*\badvisory\b/i.test(proposal)) continue;
    const count = (label: string): number | null => {
      const m = new RegExp(String.raw`Number of (?:shares\s+)?${label}\s+([\d,]+)`, "i").exec(proposal);
      return m === null ? null : Number(m[1]!.replace(/,/g, ""));
    };
    const votesFor = count("For");
    const votesAgainst = count("Against");
    const abstentions = count("Abstaining");
    if (votesFor === null || votesAgainst === null || abstentions === null) return null;
    return { meetingDate: meeting === null ? null : isoFromMonthDate(meeting[1]!), approved: /\bStockholders approved\b/i.test(proposal) && !/\bdid not approve\b/i.test(proposal),
      votesFor, votesAgainst, abstentions, brokerNonVotes: count("Broker Non-Votes") };
  }
  return null;
}

export interface TradingArrangement {
  person: string;
  role: string;
  action: "adoption" | "modification" | "termination";
  date: string;
  /** Shares the arrangement may sell; the footnote says when future awards are included. */
  shares: number | null;
  includesFutureAwards: boolean;
  expires: string | null;
}

const ROLE_START = /^(?:Director|Chairman|Chair|President|Chief|Executive|Senior|Vice|General|Principal|Interim|Lead|Co-|EVP|SVP|CEO|CFO|COO|CTO|Treasurer|Secretary|Controller|Officer)\b/;
/** US-format SEC table dates (M/D/YYYY). */
function usDate(text: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());
  if (m === null) return null;
  const iso = `${m[3]}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : null;
}

/** 10-Q / 10-K "Other Information": the Rule 10b5-1 trading arrangements table. */
export function parseTradingArrangements(itemText: string): TradingArrangement[] {
  const text = normalizeFilingText(itemText);
  const table = /\bExpiration Date\b/i.exec(text);
  if (!/\b10b5-1\b/.test(text) || table === null) return [];
  const body = text.slice(table.index + table[0].length);
  const out: TradingArrangement[] = [];
  const row = /(.+?)\s+(Adoption|Modification|Termination)\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+([\d,]+)\s*([^/]*?)\s+(\d{1,2}\/\d{1,2}\/\d{4}|N\/A|—)(?=\s|$)/g;
  for (const m of body.matchAll(row)) {
    const words = m[1]!.trim().replace(/^\*+\s*/, "").split(/\s+/);
    const at = words.findIndex((word, i) => i >= 2 && ROLE_START.test(word));
    if (at < 0) continue;
    const date = usDate(m[3]!);
    if (date === null) continue;
    out.push({ person: words.slice(0, at).join(" "), role: words.slice(at).join(" "), action: m[2]!.toLowerCase() as TradingArrangement["action"], date,
      shares: Number(m[4]!.replace(/,/g, "")), includesFutureAwards: /\bfuture equity awards\b/i.test(m[5] ?? ""), expires: usDate(m[6]!) });
  }
  return out;
}
