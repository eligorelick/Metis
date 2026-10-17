import { createHash } from "node:crypto";
import { htmlToText } from "./extract";
import type { EdgarFiling } from "@/providers/edgar";
import type { FmpPayload, FmpSegmentationRow } from "@/providers/fmp";
import type { FetchResult } from "@/types/core";

export interface AnnualGeography {
  cik: string; accession: string; form: "10-K"; filingDate: string; reportDate: string;
  documentUrl: string; fetchedAt: string; sha256: string; currency: string; scale: number;
  definition: string;
  periods: { end: string; values: Record<string, number>; total: number }[];
  spans: { start: number; end: number; html: string }[];
}
interface Identity { cik: string; filing: EdgarFiling; documentUrl: string; fetchedAt: string; cutoff: string }
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const attr = (s: string, name: string) => new RegExp(`\\b${name}=["']([^"']+)["']`, "i").exec(s)?.[1] ?? null;
const date = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
const cik = (s: string) => /^\d{1,10}$/.test(s) ? s.replace(/^0+(?=\d)/, "") : null;

/** Complete local prose belongs to the table, including adjacent qualifications. */
function geographyEvidenceBlock(html: string, tableStart: number, tableEnd: number): { start: number; end: number; prose: string; contextRef: string | null } | null {
  const floor = Math.max(0, tableStart - 50_000);
  const prefix = html.slice(floor, tableStart);
  const headings = [...prefix.matchAll(/Geographic(?:al)?(?:\s|<[^>]+>|&#160;|&nbsp;)+Information/gi)];
  const heading = headings.at(-1);
  if (!heading) return null;
  let start = floor + heading.index;
  let contextRef: string | null = null;
  const dataConcepts = (table: string): string[] => {
    const text = htmlToText(table);
    const facts = [...table.matchAll(/<ix:nonFraction\b([^>]*)>/gi)].map(fact => attr(fact[1]!, "name") ?? "");
    return facts.length >= 2 && new Set(text.match(/\b20\d{2}\b/g)).size >= 2 && /\b(?:Year(?:s)? Ended|As of)\b/i.test(text) && /\(In (?:thousands|millions|billions)\)/i.test(text)
      ? facts : [];
  };
  const priorTables = [...prefix.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)].filter(table => dataConcepts(table[0]).length > 0);
  const priorData = priorTables.at(-1);
  const priorBoundary = priorData ? priorData.index + priorData[0].length : 0;
  const paragraphs = [...prefix.slice(priorBoundary, heading.index).matchAll(/<(p|div|table|h[1-6])\b[^>]*>[\s\S]*?<\/\1>/gi)]
    .filter(paragraph => htmlToText(paragraph[0]) !== "");
  const blocks = [...prefix.matchAll(/<ix:nonNumeric\b([^>]*)>/gi)];
  const enclosing = blocks.filter(block => !/<\/ix:nonNumeric>/i.test(prefix.slice(block.index + block[0].length)));
  if (enclosing.length > 1) return null;
  if (enclosing.length === 1) {
    const block = enclosing[0]!;
    if (!/TextBlock$/.test(attr(block[1]!, "name") ?? "")) return null;
    contextRef = attr(block[1]!, "contextRef");
    if (!contextRef) return null;
    start = floor + block.index;
    // A separate tagged block is stronger than neighboring unrelated prose,
    // but an explicit referential scope qualification still governs its table.
    const qualification = paragraphs.find(paragraph => paragraph.index + priorBoundary < block.index &&
      /\b(?:these|those|this|the) (?:amounts|figures|data|table|disclosure)\b|\b(?:figures?|amounts?|data) (?:below|above)\b|\bselected operations\b/i.test(htmlToText(paragraph[0])));
    if (qualification) start = floor + priorBoundary + qualification.index;
  } else {
    // Untagged tables inherit the complete prose/layout block since the last
    // established numeric table. A neutral paragraph cannot sever a qualifier.
    if (!priorData && floor > 0) return null;
    if (paragraphs.length > 0) start = floor + priorBoundary + paragraphs[0]!.index;
  }
  const ceiling = Math.min(html.length, tableEnd + 50_000);
  const suffix = html.slice(tableEnd, ceiling);
  let afterLength = suffix.length;
  // Layout/footnote tables and headings do not establish a new population.
  // Only a separately introduced, typed quantitative table for another metric
  // ends this local evidence block; otherwise uncertain context is retained.
  for (const next of suffix.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)) {
    const concepts = dataConcepts(next[0]);
    if (concepts.length === 0 || concepts.some(name => !/^us-gaap:/.test(name) || /Revenue|SalesRevenue/i.test(name))) continue;
    const introductions = [...suffix.slice(0, next.index).matchAll(/\bThe following table (?:presents|summarizes|shows)\b/gi)];
    const introduction = introductions.at(-1);
    if (!introduction) continue;
    const text = htmlToText(suffix.slice(introduction.index, next.index));
    if (!/^The following table (?:presents|summarizes|shows) [^.!?]+[:.]?$/i.test(text) || /\brevenue\b/i.test(text)) continue;
    afterLength = introduction.index;
    break;
  }
  if (afterLength === suffix.length && ceiling < html.length) return null;
  const end = tableEnd + afterLength;
  const prose = htmlToText(html.slice(start, tableStart) + " " + html.slice(tableEnd, end))
    .replace(/\bGeographic(?:al)? Information\b/i, "").trim();
  return prose.length <= 3000 ? { start, end, prose, contextRef } : null;
}

/**
 * Deliberately bounded matched-table fallback. Values, currency and scale must
 * agree with the table's own inline revenue facts and annual contexts. No
 * country relabeling, inferred geographic basis, FX conversion or new fetch.
 */
export function parseAnnualGeography(html: string, identity: Identity): FetchResult<AnnualGeography> {
  const gap = (reason: string): FetchResult<AnnualGeography> => ({ ok: false, gap: {
    field: "edgar.annualGeography", reason, severity: "info", attemptedSources: [identity.documentUrl],
  } });
  const f = identity.filing;
  const expected = `https://www.sec.gov/Archives/edgar/data/${cik(identity.cik)}/${f.accessionNumber.replace(/-/g, "")}/${f.primaryDocument}`;
  if (f.form !== "10-K" || cik(identity.cik) === null || identity.documentUrl !== expected ||
    !/^\d{10}-\d{2}-\d{6}$/.test(f.accessionNumber) || !/^[A-Za-z0-9_.-]+\.html?$/i.test(f.primaryDocument) ||
    !date(f.reportDate) || !date(f.filingDate) || !date(identity.cutoff) || f.reportDate > f.filingDate ||
    f.filingDate > identity.cutoff || !Number.isFinite(Date.parse(identity.fetchedAt))) return gap("Primary annual filing identity, period or availability is not established.");
  if (html.length > 20_000_000) return gap("Annual geography parser document budget exceeded.");
  const units = new Map<string, string>();
  for (const m of html.matchAll(/<(?:xbrli:)?unit\b([^>]*)>([\s\S]*?)<\/(?:xbrli:)?unit>/gi)) {
    const id = attr(m[1]!, "id");
    const measure = /^\s*<(?:xbrli:)?measure>\s*iso4217:([A-Z]{3})\s*<\/(?:xbrli:)?measure>\s*$/.exec(m[2]!);
    if (id && measure) units.set(id, measure[1]!);
  }
  const contexts = new Map<string, { start: string; end: string; member: string | null }>();
  const contextIds = new Set<string>();
  for (const m of html.matchAll(/<(?:xbrli:)?context\b([^>]*)>([\s\S]*?)<\/(?:xbrli:)?context>/gi)) {
    const id = attr(m[1]!, "id");
    if (id && contextIds.has(id)) return gap("Duplicate XBRL context identity makes annual geography scope ambiguous.");
    if (id) contextIds.add(id);
    const ownerTag = /<(?:xbrli:)?identifier\b([^>]*)>\s*(\d+)\s*<\/(?:xbrli:)?identifier>/.exec(m[2]!);
    const owner = ownerTag && attr(ownerTag[1]!, "scheme") === "http://www.sec.gov/CIK" ? ownerTag[2] : undefined;
    const start = /<(?:xbrli:)?startDate>\s*(\d{4}-\d{2}-\d{2})/.exec(m[2]!)?.[1];
    const end = /<(?:xbrli:)?endDate>\s*(\d{4}-\d{2}-\d{2})/.exec(m[2]!)?.[1];
    const days = start && end ? (Date.parse(end) - Date.parse(start)) / 86_400_000 + 1 : 0;
    const segments = [...m[2]!.matchAll(/<(?:xbrli:)?segment\b[^>]*>([\s\S]*?)<\/(?:xbrli:)?segment>/gi)];
    const members = [...m[2]!.matchAll(/<(?:xbrldi:)?explicitMember\b([^>]*)>\s*([^<]+?)\s*<\/(?:xbrldi:)?explicitMember>/gi)];
    // A company total has no dimensions. Detail may have exactly one explicit
    // geographical axis, never a business/product axis, typed scope or scenario.
    const consolidated = segments.length === 0 && members.length === 0;
    const geographic = segments.length === 1 && members.length === 1 &&
      /^(?:srt|us-gaap):StatementGeographicalAxis$/.test(attr(members[0]![1]!, "dimension") ?? "") &&
      segments[0]![1]!.replace(members[0]![0], "").trim() === "";
    if (id && owner && cik(owner) === cik(identity.cik) && start && end && date(start) && date(end) && days >= 350 && days <= 380 &&
      !/<(?:xbrli:)?scenario\b|<(?:xbrldi:)?typedMember\b/i.test(m[2]!) && (consolidated || geographic)) {
      contexts.set(id, { start, end, member: geographic ? members[0]![2]!.trim() : null });
    }
  }
  const candidates: AnnualGeography[] = [];
  let count = 0;
  for (const table of html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)) {
    if (++count > 500) return gap("Annual geography parser table budget exceeded.");
    if (table[0].length > 150_000 || /<table\b/i.test(table[0].slice(6))) continue;
    const evidence = geographyEvidenceBlock(html, table.index, table.index + table[0].length);
    if (!evidence || (evidence.contextRef !== null && (contexts.get(evidence.contextRef)?.member !== null || contexts.get(evidence.contextRef)?.end !== f.reportDate))) continue;
    const definition = evidence.prose;
    if (definition.length > 2000 || !/\brevenue\b/i.test(definition) || !/\b(?:based on|attribut\w+ to|determined by)\b/i.test(definition)) continue;
    // Admit a direct whole-issuer geography definition, not arbitrary revenue
    // modifiers such as B2B revenue or revenue from a subset of customers.
    // The allocation exception remains in the original definition shown later.
    const statements = definition.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
    const definitions = statements.filter(s => /\b(?:based on|attribut\w+ to|determined by)\b/i.test(s));
    if (definitions.length !== 1) continue;
    const sentence = definitions[0]!;
    const allocation = /\b(?:based on|attribut\w+ to|determined by)\b/i.exec(sentence);
    const scope = allocation && /^(?:The following table (?:presents|summarizes|shows)\s+)?(?:(?:our|consolidated|total company|total)\s+)?revenues? by geographic(?:al)? (?:areas?|regions?|locations?)(.*)$/i.exec(sentence.slice(0, allocation.index).trim());
    if (!scope) continue;
    // Every part of the attribution must preserve the revenue population.
    // Unknown basis text and exceptions are withheld, rather than silently
    // dropping a suffix that may exclude a segment or selected operations.
    const attribution = sentence.slice(allocation!.index).replace(/[.!?]$/, "");
    const exception = /\b(?:with the exception of|except(?: for)?)\b/i.exec(attribution);
    const allocationRule = (exception ? attribution.slice(0, exception.index) : attribution).trim().replace(/,$/, "");
    if (!/^(?:based on|determined by|attributed to) (?:the )?(?:geographic(?:al)? )?(?:location of (?:our )?(?:websites(?: or points of sale)?|customers)|customer (?:locations?|billing (?:locations?|addresses?)|shipping (?:locations?|addresses?))|points? of sale|destination of (?:our )?shipments)(?:,? for (?:the )?(?:years?|periods?) ended [A-Za-z]+ \d{1,2}, \d{4}(?:, \d{4})*(?: and \d{4})?)?$/i.test(allocationRule)) continue;
    if (exception && !/^(?:with the exception of|except(?: for)?) [A-Za-z0-9 &'’().-]{1,100}, which (?:has|have) all been allocated to [A-Za-z][A-Za-z &'’()-]{0,80}, the location of (?:its|their) corporate headquarters(?:, for (?:the )?(?:years?|periods?) ended [A-Za-z]+ \d{1,2}, \d{4}(?:, \d{4})*(?: and \d{4})?)?$/i.test(attribution.slice(exception.index))) continue;
    if (/\b(?:segments?|divisions?|products?|business units?|business lines?|subsidiar(?:y|ies)|brands?|channels?)\b/i.test(allocationRule) ||
      /\bfor\b(?!\s+(?:the\s+)?(?:years?|periods?)\s+ended\b)/i.test(allocationRule)) continue;
    const text = htmlToText(table[0]);
    const header = new RegExp(`^Year(?:s)? Ended (${MONTHS.join("|")}) (\\d{1,2}),? ((?:20\\d{2}\\s+){1,3}20\\d{2}) \\(In (thousands|millions|billions)\\) Revenue\\b`, "i").exec(text);
    if (!header) continue;
    const ends = header[3]!.split(/\s+/).map(year => `${year}-${String(MONTHS.findIndex(m => m.toLowerCase() === header[1]!.toLowerCase()) + 1).padStart(2, "0")}-${header[2]!.padStart(2, "0")}`);
    if (ends[0] !== f.reportDate || ends.some((end, i) => !date(end) || (i > 0 && Number(ends[i - 1]!.slice(0, 4)) - Number(end.slice(0, 4)) !== 1))) continue;
    const scale = header[4]!.toLowerCase() === "thousands" ? 1e3 : header[4]!.toLowerCase() === "millions" ? 1e6 : 1e9;
    const periods = ends.map(end => ({ end, values: {} as Record<string, number>, total: 0 }));
    let currency: string | null = null, started = false, total = false, valid = true, rows = 0;
    const geographicMembers = new Set<string>();
    const periodStarts: string[] = [];
    for (const row of table[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const labelText = htmlToText(row[1]!);
      if (labelText === "Revenue") { started = true; continue; }
      if (!started) continue;
      const facts = [...row[1]!.matchAll(/<ix:nonFraction\b([^>]*)>([\s\S]*?)<\/ix:nonFraction>/gi)];
      const firstNumber = labelText.search(/\$|\d/);
      const label = labelText.slice(0, firstNumber < 0 ? labelText.length : firstNumber).trim();
      if (total || facts.length !== ends.length || firstNumber < 0 || rows >= 20 || (label && !/^[A-Za-z][A-Za-z ,'&()./-]{0,100}$/.test(label))) { valid = false; break; }
      const isTotal = label === "" || /^Total(?: revenue)?$/i.test(label);
      let rowMember: string | null = null;
      const numericText = labelText.slice(firstNumber);
      const numbers = [...numericText.matchAll(/\$?\s*(\d[\d,]*(?:\.\d+)?)/g)];
      if (numbers.length !== ends.length || numericText.replace(/\$?\s*(\d[\d,]*(?:\.\d+)?)/g, "").trim() !== "") { valid = false; break; }
      for (let i = 0; i < facts.length; i++) {
        const fact = facts[i]!;
        const unit = units.get(attr(fact[1]!, "unitRef") ?? "");
        const value = Number(htmlToText(fact[2]!).replace(/,/g, ""));
        const scope = contexts.get(attr(fact[1]!, "contextRef") ?? "");
        const member = scope?.member ?? null;
        const memberLabel = member === "country:US" ? "United States" : member === "us-gaap:NonUsMember" ? "All other countries" : member?.split(":").at(-1)?.replace(/Member$/, "");
        const normalizedLabel = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (!unit || (currency !== null && unit !== currency) || scope?.end !== ends[i] ||
          (periodStarts[i] !== undefined && periodStarts[i] !== scope?.start) ||
          (isTotal ? member !== null : member === null || !memberLabel || normalizedLabel(memberLabel) !== normalizedLabel(label) ||
            (rowMember !== null && rowMember !== member) || (i === 0 && geographicMembers.has(member))) ||
          !/^us-gaap:(?:Revenue\w*|SalesRevenueNet)$/.test(attr(fact[1]!, "name") ?? "") ||
          10 ** Number(attr(fact[1]!, "scale")) !== scale || attr(fact[1]!, "sign") !== null ||
          !Number.isFinite(value) || value < 0 || value !== Number(numbers[i]![1]!.replace(/,/g, "")) ||
          (!isTotal && Object.hasOwn(periods[i]!.values, label))) { valid = false; break; }
        currency = unit;
        periodStarts[i] = scope!.start;
        rowMember = member;
        if (isTotal) periods[i]!.total = value * scale;
        else periods[i]!.values[label] = value * scale;
      }
      if (!valid) break;
      if (rowMember !== null) geographicMembers.add(rowMember);
      if (isTotal) total = true;
      else rows++;
    }
    if (!valid || !total || rows < 2 || currency === null || periods.some(p => p.total <= 0 || Math.abs(Object.values(p.values).reduce((sum, v) => sum + v, 0) - p.total) > .01)) continue;
    // Unknown local prose is an unestablished population, not a company-wide
    // assertion. Only explicit consolidated coverage or a compatible country
    // concentration disclosure may accompany the admitted allocation definition.
    const supporting = statements.filter(statement => statement !== sentence);
    if (supporting.some(statement => {
      const text = statement.replace(/[.!?]$/, "");
      if (/^(?:These (?:amounts|figures)|This table) (?:include|includes|cover|covers|present|presents) all consolidated revenue$/i.test(text)) return false;
      const concentration = /^No (?:sales|revenues?) to an individual country other than (?:the )?(.+?) accounted for more than \d+(?:\.\d+)?% of (?:total )?revenues?(?: for (?:the )?presented (?:years|periods))?$/i.exec(text);
      return !concentration || !Object.keys(periods[0]!.values).some(label => label.toLowerCase() === concentration[1]!.toLowerCase());
    })) continue;
    const geographyWords = (s: string) => s.toLowerCase().replace(/\b(?:the|and)\b/g, "").replace(/[^a-z0-9]/g, "");
    if (scope[1]!.trim() !== "" && geographyWords(scope[1]!) !== geographyWords(Object.keys(periods[0]!.values).join(" "))) continue;
    candidates.push({ cik: identity.cik, accession: f.accessionNumber, form: "10-K", filingDate: f.filingDate, reportDate: f.reportDate,
      documentUrl: identity.documentUrl, fetchedAt: identity.fetchedAt, sha256: createHash("sha256").update(html).digest("hex"), currency, scale, definition, periods,
      spans: [{ start: evidence.start, end: table.index, html: html.slice(evidence.start, table.index) }, { start: table.index, end: table.index + table[0].length, html: table[0] },
        ...(htmlToText(html.slice(table.index + table[0].length, evidence.end)) === "" ? [] : [{ start: table.index + table[0].length, end: evidence.end, html: html.slice(table.index + table[0].length, evidence.end) }])] });
  }
  if (candidates.length !== 1) return gap(`No unique matched annual geography revenue table (${candidates.length} eligible tables); values and allocation basis withheld.`);
  return { ok: true, value: { data: candidates[0]!, source: "edgar", endpoint: identity.documentUrl, asOf: f.reportDate, fetchedAt: identity.fetchedAt } };
}

export function annualGeographyFallback(vendor: FetchResult<FmpPayload<FmpSegmentationRow>>, primary: FetchResult<AnnualGeography> | undefined): FetchResult<FmpPayload<FmpSegmentationRow>> {
  const row = vendor.ok ? vendor.value.data.rows[0] : undefined;
  const values = row?.data && typeof row.data === "object" ? Object.values(row.data) : [];
  if (row && typeof row.date === "string" && date(row.date) && typeof row.reportedCurrency === "string" && /^[A-Z]{3}$/.test(row.reportedCurrency.trim().toUpperCase()) &&
    values.length > 0 && values.every(v => typeof v === "number" && Number.isFinite(v)) && values.reduce((sum, v) => sum + v, 0) > 0) return vendor;
  if (!primary?.ok) return vendor;
  const data = primary.value.data;
  return { ok: true, value: { ...primary.value, data: { rows: data.periods.map(p => ({ date: p.end, fiscalYear: Number(p.end.slice(0, 4)), period: "FY", reportedCurrency: data.currency, data: p.values })), raw: data } } };
}

/** Definition follows the selected primary rows; a vendor row never inherits it. */
export function selectedGeographyNotes(result: FetchResult<FmpPayload<FmpSegmentationRow>> | undefined): string[] {
  if (!result?.ok || result.value.source !== "edgar") return [];
  const raw = result.value.data.raw as Partial<AnnualGeography> | null;
  return raw && typeof raw.definition === "string" && typeof raw.documentUrl === "string"
    ? [`Annual geographic revenue (${raw.reportDate}; ${raw.currency}; filed ${raw.filingDate}; ${raw.documentUrl}). Disclosed allocation basis: ${raw.definition}`] : [];
}
