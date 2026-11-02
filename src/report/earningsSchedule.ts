import { citationSourceId } from "@/pipeline/stageC/citations";
import type { CitationProvenanceRecord } from "@/pipeline/stageC/provenance";
import { estimateDay } from "@/report/estimateTiming";
import type { VerificationLogEntry } from "@/report/schema";

// Only assembler-owned calendar notes establish this constraint. Neither a
// filing's title/date nor free-form model prose can confirm an event.
const PROVIDER_NOTE = /^next scheduled earnings date per provider calendar \(a provider schedule, not a company confirmation\): (\d{4}-\d{2}-\d{2}) \[(fmp|finnhub):earnings-calendar · (\d{4}-\d{2}-\d{2})\]$/;
const PROSE_KEYS = new Set(["synthesis", "judgeResolution", "bullView", "bearView", "narrative", "trend", "momentum", "keyLevels", "relativeStrength"]);
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
function eventPieces(clause: string, date: string): { pieces: string[]; hits: Set<number> } {
  const pieces = clause.split(/(,(?![^()]*\)))/u);
  const text = (i: number) => (i >= 0 && i < pieces.length ? pieces[i]! : "");
  const hits = new Set<number>();
  for (let i = 0; i < pieces.length; i += 2) {
    const piece = pieces[i]!;
    if (!piece.includes(date)) continue;
    if (EVENT_TERM.test(piece)) { hits.add(i); continue; }
    const words = piece.replaceAll(date, " ").toLowerCase().match(/[a-z]+/g) ?? [];
    if (words.every(word => DATE_PHRASE_WORDS.has(word)) && (EVENT_TERM.test(text(i - 2)) || EVENT_TERM.test(text(i + 2)))) hits.add(i);
  }
  return { pieces, hits };
}

/** Qualify a known provider-only event date; never assert that the date is false. */
export function guardEarningsSchedule<T extends object>(input: T, notes: readonly string[], registry: readonly CitationProvenanceRecord[] = [], companySources: readonly string[] = []): {
  report: T; log: VerificationLogEntry[]; qualifiedClaimPaths: Set<string>;
} {
  const report = structuredClone(input);
  const log: VerificationLogEntry[] = [];
  const qualifiedClaimPaths = new Set<string>();
  const events = notes.flatMap(note => {
    const match = PROVIDER_NOTE.exec(note);
    return match && estimateDay(match[1]) && estimateDay(match[3])
      ? [{ date: match[1]!, provider: match[2]!, asOf: match[3]! }] : [];
  });
  const qualify = (text: string, path: string, claim?: Record<string, unknown>): string => {
    const source = claim ? citationSourceId(claim) : null;
    if (source && registry.some(record => record.id === source && record.kind === "payload-text" &&
      (/^edgar:(?:8-K|10-[KQ]|6-K|20-F|40-F)\b/i.test(record.origin) || companySources.includes(record.id)))) return text;
    let next = text;
    for (const event of events) {
      // Bind the event to its own clause, not another dated statement in a
      // composite claim. Keep whitespace and the original text for the audit.
      const parts = next.split(HARD_CLAUSE);
      const isEvent = (part: string) => part.includes(event.date) && eventPieces(part, event.date).hits.size > 0;
      if (!parts.some(isEvent)) continue;
      // FIGR paid audit (2026-11-02): name the sources that would confirm the
      // date. "Company confirmation not established" read as a contradiction
      // beside a newswire copy of the company's release, which confirms nothing here.
      const qualifier = `${event.provider === "fmp" ? "FMP" : "Finnhub"} calendar estimate; not confirmed by an SEC filing or a company-hosted release`;
      const dated = `${event.date} (${qualifier})`;
      if (claim) qualifiedClaimPaths.add(path);
      const amended = parts.map(part => {
        if (!isEvent(part)) return part;
        const { pieces, hits } = eventPieces(part, event.date);
        return pieces.map((piece, i) => hits.has(i) && !piece.includes(dated) ? piece.replaceAll(event.date, dated) : piece).join("");
      }).join("");
      if (amended === next) continue;
      next = amended;
      if (claim?.label === "FACT") claim.label = "ESTIMATE";
      log.push({ claim: text, path, outcome: "removed", reason: "earnings-date-qualified",
        validationStatus: "unchecked", numericSupportStatus: "unchecked", claimSupportStatus: "unreviewed",
        evidenceKind: claim?.label === "JUDGMENT" ? "judgment" : "factual-claim",
        ...(typeof claim?.source === "string" ? { source: claim.source } : {}),
        note: `Date qualification added from ${event.provider}:earnings-calendar, observed ${event.asOf}. The original prose/citation did not establish company confirmation; surrounding claims were not validated by this correction.` });
    }
    return next;
  };
  const walk = (node: unknown, path: string): void => {
    if (node === null || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach((child, i) => walk(child, `${path}[${i}]`)); return; }
    const row = node as Record<string, unknown>;
    if (typeof row.text === "string" && ["FACT", "ESTIMATE", "JUDGMENT"].includes(String(row.label)) && typeof row.source === "string") {
      row.text = qualify(row.text, path, row);
      return;
    }
    for (const [key, value] of Object.entries(row)) {
      if (key === "appendix" || key === "meta" || key === "verificationLog") continue;
      const childPath = path ? `${path}.${key}` : key;
      if (typeof value === "string" && PROSE_KEYS.has(key)) row[key] = qualify(value, childPath);
      else walk(value, childPath);
    }
  };
  walk(report, "");
  return { report, log, qualifiedClaimPaths };
}
