import type { CitationProvenanceRecord } from "@/pipeline/stageC/provenance";
import { estimateDay } from "@/report/estimateTiming";
import type { VerificationLogEntry } from "@/report/schema";

// Only assembler-owned calendar notes establish an event. Source passages can
// establish its status; citation names and free-form report prose cannot.
const PROVIDER_NOTE = /^next scheduled earnings date per provider calendar \(a provider schedule, not a company confirmation\): (\d{4}-\d{2}-\d{2}) \[(fmp|finnhub):earnings-calendar · (\d{4}-\d{2}-\d{2})\]$/;
const METADATA_KEYS = new Set(["appendix", "meta", "verificationLog", "source", "sourceId", "asOf", "label", "id", "provenanceId"]);
export interface EarningsScheduleEvidence {
  issuerName: string | null;
  newsNotes: readonly string[];
  passages: readonly { source: string; text: string; asOf: string | null }[];
}
interface ScheduledEvent {
  date: string; provider: string; asOf: string;
  status: "vendor-calendar" | "company-newswire" | "confirmed";
  source: string; announcedAt?: string;
}
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function datePattern(date: string): RegExp {
  const [year, month, day] = date.split("-");
  const name = MONTHS[Number(month) - 1]!;
  const monthWord = `(?:${name}|${name.slice(0, 3)}\\.?)`;
  return new RegExp(`\\b(?:${date}|${monthWord}\\s+${Number(day)}(?:st|nd|rd|th)?(?:,)?\\s+${year}|${Number(day)}(?:st|nd|rd|th)?\\s+${monthWord}\\s+${year})\\b`, "gi");
}
// Hard clause boundaries: sentence ends, semicolons outside parentheses and
// spaced em/en dashes (escapes, so file encoding cannot alter the characters).
const HARD_CLAUSE = /(;(?![^()]*\))|(?<=[.!?])\s+(?=[A-Z])|\s+[\u2014\u2013]\s+)/u;
const EVENT_TERM = /\b(?:earnings|results|report|reports|reporting|call)\b/i;
// Words a bare date phrase may contain besides the date ("On <date>", "on Wednesday, <date>").
const DATE_PHRASE_WORDS = new Set(["on", "by", "as", "of", "around", "about", "after", "before", "from", "starting",
  "beginning", "effective", "the", "close", "open", "market", "monday", "tuesday", "wednesday", "thursday", "friday",
  "saturday", "sunday"]);

/**
 * The comma pieces of a clause that state the event on `date` (review M-2). A
 * comma splits the clause, so a dividend or other dated statement beside an
 * earnings phrase is left alone; a bare date phrase set off by a comma reads
 * with the piece beside it. `pieces` keeps the commas (odd indices) for rejoining.
 */
function eventPieces(clause: string, date: string, eventContext = false): { pieces: string[]; hits: Set<number> } {
  // A comma inside "November 12, 2026" belongs to the date, not a new clause.
  const pieces = clause.replace(datePattern(date), value => value.replaceAll(",", "\u0000"))
    .split(/(,(?![^()]*\)))/u).map(value => value.replaceAll("\u0000", ","));
  const text = (i: number) => (i >= 0 && i < pieces.length ? pieces[i]! : "");
  const hits = new Set<number>();
  for (let i = 0; i < pieces.length; i += 2) {
    const piece = pieces[i]!;
    if (!datePattern(date).test(piece)) continue;
    if (EVENT_TERM.test(piece)) { hits.add(i); continue; }
    const words = piece.replace(datePattern(date), " ").toLowerCase().match(/[a-z]+/g) ?? [];
    if (words.every(word => DATE_PHRASE_WORDS.has(word)) && (eventContext || EVENT_TERM.test(text(i - 2)) || EVENT_TERM.test(text(i + 2)))) hits.add(i);
  }
  return { pieces, hits };
}

/** Resolve one date/source/status record per event before editing any prose. */
function scheduledEvents(notes: readonly string[], registry: readonly CitationProvenanceRecord[], companySources: readonly string[], evidence?: EarningsScheduleEvidence): ScheduledEvent[] {
  const events = new Map<string, ScheduledEvent>();
  for (const note of notes) {
    const match = PROVIDER_NOTE.exec(note);
    if (!match || !estimateDay(match[1]) || !estimateDay(match[3]) || events.has(match[1]!)) continue;
    const event: ScheduledEvent = { date: match[1]!, provider: match[2]!, asOf: match[3]!, status: "vendor-calendar", source: `${match[2]}:earnings-calendar` };
    const establishesDate = (text: string) => text.split(HARD_CLAUSE).some(part => eventPieces(part, event.date).hits.size > 0 &&
      /\b(?:will|plans?|planned|scheduled|expects?|announces?|announced|due)\b/i.test(part) &&
      !/\b(?:not|unconfirmed|unverified|might|could|rumou?rs?|speculat\w*)\b|\bmay\s+(?:report|release|announce|be|hold|publish)\b/i.test(part));
    const official = evidence?.passages.find(passage => typeof passage.text === "string" && establishesDate(passage.text) && registry.some(record => record.id === passage.source && record.kind === "payload-text" &&
      (/^edgar:(?:8-K|10-[KQ]|6-K|20-F|40-F)\b/i.test(record.origin) || companySources.includes(record.id))));
    if (official) { event.status = "confirmed"; event.source = official.source; }
    else if (evidence?.issuerName) {
      const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
      const issuer = normalize(evidence.issuerName.replace(/\b(?:(?:class\s+[a-z0-9]+\s+)?common\s+stock|ordinary\s+shares)\b.*$/i, ""))
        .replace(/\s+(?:inc|incorporated|corporation|corp|ltd|limited)$/, "");
      for (const news of evidence.newsNotes) {
        const tag = /\[((?:fmp|finnhub):news|fmp:press-release) · (\d{4}-\d{2}-\d{2})\]$/.exec(news);
        if (!tag || !estimateDay(tag[2]) || !establishesDate(news)) continue;
        const publisher = /^\d{4}-\d{2}-\d{2} \[[^\]]+\] ([^:]+):/.exec(news)?.[1] ?? "";
        if (!/\b(?:globe\s?newswire|business\s?wire|pr\s?newswire|access\s?(?:newswire|wire))\b/i.test(publisher)) continue;
        const content = news.replace(/^\d{4}-\d{2}-\d{2} \[[^\]]+\] [^:]+:\s*/, "").replace(tag[0], "");
        const [title, firstLine = ""] = content.split(/\s+[\u2014\u2013]\s+|\n/);
        // A third-party preview quoting a date does not become the issuer's
        // statement merely because the issuer's name occurs somewhere in it.
        const authored = [title!, firstLine].some(line => normalize(line).startsWith(`${issuer} `) &&
          /^(?:(?:inc|incorporated|corporation|corp|ltd|limited) )?(?:announces?|announced)\b/.test(normalize(line).slice(issuer.length + 1)) && EVENT_TERM.test(line));
        if (issuer && authored) { event.status = "company-newswire"; event.source = tag[1]!; event.announcedAt = tag[2]!; break; }
      }
    }
    events.set(event.date, event);
  }
  return [...events.values()];
}

/** Qualify scheduled dates consistently without calling issuer announcements vendor estimates. */
export function guardEarningsSchedule<T extends object>(input: T, notes: readonly string[], registry: readonly CitationProvenanceRecord[] = [], companySources: readonly string[] = [], evidence?: EarningsScheduleEvidence): {
  report: T; log: VerificationLogEntry[]; qualifiedClaimPaths: Set<string>;
} {
  const report = structuredClone(input);
  const log: VerificationLogEntry[] = [];
  const qualifiedClaimPaths = new Set<string>();
  const events = scheduledEvents(notes, registry, companySources, evidence);
  const qualify = (text: string, path: string, claim?: Record<string, unknown>, eventContext = false): string => {
    let next = text;
    for (const event of events) {
      if (event.status === "confirmed") continue;
      // Bind the event to its own clause, not another dated statement in a
      // composite claim. Keep whitespace and the original text for the audit.
      const parts = next.split(HARD_CLAUSE);
      const isEvent = (part: string) => eventPieces(part, event.date, eventContext).hits.size > 0;
      if (!parts.some(isEvent)) continue;
      const provider = event.provider === "fmp" ? "FMP" : "Finnhub";
      const qualifier = event.status === "company-newswire"
        ? `company-announced via newswire on ${event.announcedAt}; company-hosted release or SEC confirmation not established`
        : `${provider} calendar estimate; not confirmed by an SEC filing or a company-hosted release`;
      // Pre-run check for the FIGR extra-high run (2026-11-02): a date the prose
      // already encloses in parentheses ("(scheduled for 2026-11-12)") takes the
      // qualifier after a comma instead of a nested parenthesis.
      const inline = event.status === "company-newswire" ? qualifier : `${provider === "FMP" ? "an" : "a"} ${provider} calendar estimate not confirmed by an SEC filing or a company-hosted release`;
      const qualifyDates = (piece: string): string => {
        if (piece.includes(qualifier) || piece.includes(inline)) return piece;
        let out = "", depth = 0;
        const dates = new Map([...piece.matchAll(datePattern(event.date))].map(match => [match.index, match[0]]));
        for (let i = 0; i < piece.length;) {
          const date = dates.get(i);
          if (date) { out += `${date}${depth > 0 ? `, ${inline}` : ` (${qualifier})`}`; i += date.length; continue; }
          const ch = piece[i]!;
          if (ch === "(") depth++; else if (ch === ")") depth = Math.max(0, depth - 1);
          out += ch; i++;
        }
        return out;
      };
      if (claim) qualifiedClaimPaths.add(path);
      const amended = parts.map(part => {
        if (!isEvent(part)) return part;
        const { pieces, hits } = eventPieces(part, event.date, eventContext);
        return pieces.map((piece, i) => hits.has(i) ? qualifyDates(piece) : piece).join("");
      }).join("");
      if (amended === next) continue;
      next = amended;
      if (claim?.label === "FACT" && event.status === "vendor-calendar") claim.label = "ESTIMATE";
      log.push({ claim: text, path, outcome: "removed", reason: "earnings-date-qualified",
        validationStatus: "unchecked", numericSupportStatus: "unchecked", claimSupportStatus: "unreviewed",
        evidenceKind: claim?.label === "JUDGMENT" ? "judgment" : "factual-claim",
        ...(typeof claim?.source === "string" ? { source: claim.source } : {}),
        note: `Date qualification added from ${event.source}, ${event.status === "company-newswire" ? `announced ${event.announcedAt}` : `observed ${event.asOf}`}. Surrounding claims were not validated by this correction.` });
    }
    return next;
  };
  const walk = (node: unknown, path: string, eventContext = false): void => {
    if (node === null || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach((child, i) => { if (typeof child === "string") node[i] = qualify(child, `${path}[${i}]`, undefined, eventContext); else walk(child, `${path}[${i}]`, eventContext); }); return; }
    const row = node as Record<string, unknown>;
    if (typeof row.text === "string" && ["FACT", "ESTIMATE", "JUDGMENT"].includes(String(row.label)) && typeof row.source === "string") {
      row.text = qualify(row.text, path, row, eventContext);
      return;
    }
    for (const [key, value] of Object.entries(row)) {
      if (METADATA_KEYS.has(key)) continue;
      const childPath = path ? `${path}.${key}` : key;
      const siblingEvent = Object.entries(row).some(([k, v]) => !METADATA_KEYS.has(k) && typeof v === "string" && EVENT_TERM.test(v));
      if (typeof value === "string") row[key] = qualify(value, childPath, undefined, eventContext || siblingEvent);
      else walk(value, childPath, eventContext || siblingEvent);
    }
  };
  walk(report, "");
  return { report, log, qualifiedClaimPaths };
}
