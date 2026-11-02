import { estimateDay } from "@/report/estimateTiming";
import type { VerificationLogEntry } from "@/report/schema";

// Only assembler-owned calendar notes establish this constraint. Neither a
// filing's title/date nor free-form model prose can confirm an event.
const PROVIDER_NOTE = /^next scheduled earnings date per provider calendar \(a provider schedule, not a company confirmation\): (\d{4}-\d{2}-\d{2}) \[(fmp|finnhub):earnings-calendar · (\d{4}-\d{2}-\d{2})\]$/;
const PROSE_KEYS = new Set(["synthesis", "judgeResolution", "bullView", "bearView", "narrative", "trend", "momentum", "keyLevels", "relativeStrength"]);

/** Qualify a known provider-only event date; never assert that the date is false. */
export function guardEarningsSchedule<T extends object>(input: T, notes: readonly string[]): {
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
    let next = text;
    for (const event of events) {
      // Bind the event to its sentence, not a different dated statement in a
      // composite claim. Keep whitespace and the original text for the audit.
      const parts = next.split(/((?<=[.!?])\s+(?=[A-Z]))/u);
      const isEvent = (part: string) => part.includes(event.date) && /\b(?:earnings|results)\b/i.test(part);
      if (!parts.some(isEvent)) continue;
      const qualifier = `${event.provider === "fmp" ? "FMP" : "Finnhub"} calendar estimate; company confirmation not established`;
      const dated = `${event.date} (${qualifier})`;
      if (claim) qualifiedClaimPaths.add(path);
      const amended = parts.map(part => isEvent(part) && !part.includes(dated) ? part.replaceAll(event.date, dated) : part).join("");
      if (amended === next) continue;
      next = amended;
      if (claim?.label === "FACT") claim.label = "ESTIMATE";
      log.push({ claim: text, path, outcome: "unverified", reason: "earnings-date-qualified",
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
