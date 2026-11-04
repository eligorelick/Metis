import { citationSourceId } from "@/pipeline/stageC/citations";
import { isFilingOrTranscriptSource } from "@/pipeline/stageC/consistency";
import type { Executive, Leadership, ManagementAction, SourcedClaim, VerificationLogEntry } from "@/report/schema";

export interface ExecutiveDecisionEvidence {
  asOf?: string | null;
  notes?: readonly string[];
  filings?: readonly { source: string; text: string }[];
}

/** Only issuer-wide CEO/CFO titles confer office context; divisional CEOs do not. */
export function executiveOffice(title: string): "ceo" | "cfo" | undefined {
  if (/\b(?:deputy|assistant|former|incoming|designate|chief of staff)\b/i.test(title)) return undefined;
  if (/\b(?:CEO|chief executive officer)\s+(?:of|for)\b/i.test(title)) return undefined;
  if (/\b(?:CFO|chief financial officer)\s+(?:of|for)\b/i.test(title)) return undefined;
  if (/\b(?:CEO|chief executive officer)\b/i.test(title)) return "ceo";
  if (/\b(?:CFO|chief financial officer)\b/i.test(title)) return "cfo";
  return undefined;
}

function day(value: string | null | undefined): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const stamp = Date.parse(value);
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === value ? value : undefined;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

function writtenDay(year: string, month: string, date: string): string | undefined {
  const index = MONTHS.indexOf(month.toLowerCase()) + 1;
  return index ? day(`${year}-${String(index).padStart(2, "0")}-${date.padStart(2, "0")}`) : undefined;
}

/** Calendar dates a sentence states. Filings write them out, so ISO alone would never match a quotation. */
function statedDays(text: string): string[] {
  const days = [...text.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].map(m => day(m[0]));
  for (const m of text.matchAll(/\b(\d{1,2}) ([A-Za-z]+) (\d{4})\b/g)) days.push(writtenDay(m[3]!, m[2]!, m[1]!));
  for (const m of text.matchAll(/\b([A-Za-z]+) (\d{1,2}),? (\d{4})\b/g)) days.push(writtenDay(m[3]!, m[1]!, m[2]!));
  return days.filter((d): d is string => d !== undefined);
}

/** Whitespace, case and the report's USD spelling of a filing's dollar sign do not change a quotation. */
function normalized(text: string): string {
  return text.toLowerCase().replace(/(?:\bus)?\$\s*/g, "usd ").replace(/\s+/g, " ").trim();
}

/** Sentences of a retained source. An abbreviation that splits one fails closed; a dropped qualification cannot match. */
function sentencesOf(text: string): string[] {
  return text.split(/\n+|(?<=[.!?\]])\s+(?=[A-Z[("\u201c])/);
}

/** A verifier span can stop at a clause, so this labels a quotation for display and never admits a grade. */
function quotedInSpan(claim: SourcedClaim, entry: VerificationLogEntry): boolean {
  return entry.sourceSpans?.some(span => span.source === citationSourceId(claim) && normalized(span.text) === normalized(claim.text)) === true;
}

function quotedInRetainedSource(text: string, source: string | null | undefined, context: ExecutiveDecisionEvidence): boolean {
  const quote = normalized(text);
  return (context.filings ?? []).some(f => f.source === source && sentencesOf(f.text).some(sentence => normalized(sentence) === quote));
}

/** Exact path, claim and canonical source identity; any failed check or unresolved citation vetoes it. */
export function executiveClaimEntry(claim: SourcedClaim, path: string, log: readonly VerificationLogEntry[]): VerificationLogEntry | undefined {
  if (log.some(e => e.path === path && (e.check && e.outcome === "unverified" || e.validationStatus === "contradicted" || e.outcome === "removed"))) return undefined;
  const entry = log.find(e => !e.check && e.path === path && e.claim === claim.text && e.source === citationSourceId(claim));
  return entry?.traceKind === "untraced" ? undefined : entry;
}

/** Never derive tenure from pay, a rounded tenureYears, a title, or the current roster alone. */
export function executiveTenureStart(e: Executive, index: number, log: readonly VerificationLogEntry[], context: ExecutiveDecisionEvidence): string | undefined {
  const office = executiveOffice(e.title);
  if (!office) return undefined;
  const starts = (context.notes ?? []).flatMap(note => {
    const match = /^(.*?) — (.*?) \(since (\d{4}-\d{2}-\d{2})\)/.exec(note);
    return match && note.endsWith("[fmp:key-executives]") && match[1] === e.name && executiveOffice(match[2]!) === office && day(match[3]) ? [match[3]!] : [];
  });
  // A narrow biography fallback: the whole dated appointment sentence must be
  // present verbatim in its retained filing, not just cited by the judge.
  for (const [i, claim] of e.reasoning.entries()) {
    if (claim.label !== "FACT" || !isFilingOrTranscriptSource(citationSourceId(claim) ?? "") ||
      !executiveClaimEntry(claim, `leadership.executives[${index}].reasoning[${i}]`, log) ||
      !quotedInRetainedSource(claim.text, citationSourceId(claim), context)) continue;
    const match = /^(?:On (?:\d{1,2} [A-Za-z]+ \d{4}|[A-Za-z]+ \d{1,2}, \d{4}),? )?(.+?) (?:became|was appointed(?: as)?|succeeded .+? as) (.+?)(?:,? (?:on|effective|with effect from) [^.]+)?\.$/.exec(claim.text);
    const dates = statedDays(claim.text);
    // "of <issuer>" is permitted in the biography, whose retained sentence
    // names the officer. Office authority still comes from the exact roster.
    const role = match?.[2]?.replace(/\s+of\s+.+$/i, "") ?? "";
    if (match?.[1] === e.name && executiveOffice(role) === office && dates.length === 1) starts.push(dates[0]!);
  }
  const unique = [...new Set(starts)];
  return unique.length === 1 ? unique[0] : undefined;
}

function officeAction(e: Executive, a: ManagementAction): boolean {
  const office = executiveOffice(e.title);
  if (!office) return false;
  if (a.actor === office) return true;
  if (a.actor !== "board" && a.actor !== "company") return false;
  return office === "ceo" || ["capital-allocation", "acquisition-divestiture", "guidance"].includes(a.category);
}

/** A proposal/authorization is a decision, not proof of its eventual return. */
function decisionAction(a: ManagementAction): boolean {
  return ["capital-allocation", "acquisition-divestiture", "strategy", "leadership-change"].includes(a.category) &&
    a.action.some(c => /\b(?:authori[sz]ed|approved|announced|acquired|purchased|repurchased|redeemed|issued|elected|appointed|launched|closed)\b/i.test(c.text)) &&
    !a.action.some(c => /\b(?:not|never|may|might|could|would|will|plans? to|expects? to)\s+(?:\w+\s+){0,2}(?:authori[sz]e[ds]?|approve[ds]?|announce[ds]?|acquire[ds]?|purchase[ds]?|repurchase[ds]?|redeem(?:ed)?|issue[ds]?|elect(?:ed)?|appoint(?:ed)?|launch(?:ed)?|close[ds]?)\b|\bannounced\s+(?:(?:a|the)\s+)?(?:no|proposed|plans?|proposal)\b/i.test(c.text));
}

export function validatedExecutiveDecisions(e: Executive, index: number, leadership: Leadership, log: readonly VerificationLogEntry[], context: ExecutiveDecisionEvidence): ManagementAction[] {
  const start = executiveTenureStart(e, index, log, context), end = day(context.asOf?.slice(0, 10));
  if (!start || !end || start > end) return [];
  const cardClaims = [...e.reasoning.map((claim, i) => ({ claim, path: `leadership.executives[${index}].reasoning[${i}]` })),
    ...(e.evidence.capitalAllocation ?? []).map((claim, i) => ({ claim, path: `leadership.executives[${index}].evidence.capitalAllocation[${i}]` }))];
  return (leadership.managementActions ?? []).filter((a, i) => {
    const occurred = day(a.occurredOn);
    const bound = cardClaims.some(({ claim, path }) => claim.label === "FACT" && executiveClaimEntry(claim, path, log) !== undefined &&
      a.action.some(c => c.text === claim.text && citationSourceId(c) === citationSourceId(claim) && c.asOf === claim.asOf));
    return bound && occurred !== undefined && occurred >= start && occurred <= end && officeAction(e, a) && decisionAction(a) && a.action.length > 0 &&
      a.action.every((c, j) => {
        const entry = executiveClaimEntry(c, `leadership.managementActions[${i}].action[${j}]`, log);
        // A numeric match is not a match of the decision, and a repeated amount
        // can leave a true sentence numerically ambiguous. An exact quotation of
        // a whole sentence of the cited retained source proves figures, wording
        // and qualifications together.
        return c.label === "FACT" && c.asOf && isFilingOrTranscriptSource(citationSourceId(c) ?? "") && entry !== undefined &&
          statedDays(c.text).includes(occurred) && quotedInRetainedSource(c.text, citationSourceId(c), context);
      });
  });
}

export interface ExecutiveOfficeContext {
  actions: (ManagementAction & { verificationNote: string })[];
  guidance: SourcedClaim[];
  note: string;
}

/** Withheld grade rationales stay withheld when a context-only card is expanded. */
export function executiveCardClaims(e: Executive, claims: SourcedClaim[]): SourcedClaim[] {
  return e.grade === "not-assessed" && e.credibilityGrade === "not-assessed" ? claims.filter(c => c.label === "FACT") : claims;
}

/** Read-time context only: retains original claims and never changes a saved grade or verification mark. */
export function executiveOfficeContext(e: Executive, leadership: Leadership, log: readonly VerificationLogEntry[] = [], guidance: readonly SourcedClaim[] = []): ExecutiveOfficeContext | undefined {
  const actions = (leadership.managementActions ?? []).flatMap((a, i) => {
    if (!day(a.occurredOn) || !officeAction(e, a) || ["compensation", "insider-transaction"].includes(a.category)) return [];
    const action = a.action.filter((c, j) => c.label === "FACT" && citationSourceId(c) &&
      executiveClaimEntry(c, `leadership.managementActions[${i}].action[${j}]`, log)?.validationStatus !== undefined);
    if (!action.length) return [];
    const assessment = a.assessment.filter((c, j) => executiveClaimEntry(c, `leadership.managementActions[${i}].assessment[${j}]`, log)?.validationStatus !== undefined);
    const entries = a.action.map((c, j) => ({ c, entry: executiveClaimEntry(c, `leadership.managementActions[${i}].action[${j}]`, log) }));
    const validated = entries.every(({ entry }) => entry?.validationStatus === "validated");
    const quoted = entries.every(({ c, entry }) => entry !== undefined && quotedInSpan(c, entry));
    return [{ ...a, action, assessment, verificationNote: quoted ? "quoted from the source" : validated ? "figures checked against the source" : "cited; figures not checked" }];
  });
  if (!actions.length) return undefined;
  const outlook = guidance.filter((c, i) => executiveClaimEntry(c, `outlook.guidanceCredibility[${i}]`, log)?.validationStatus !== undefined);
  const execution = e.grade === "not-assessed"
    ? "Execution is not assessed: this card has no validated record of dated decisions within an established tenure."
    : "The saved execution grade is retained; company decisions and outcomes do not measure personal skill.";
  const credibility = e.credibilityGrade === "not-assessed"
    ? "Credibility is not assessed: no validated comparison of earlier guidance with a later actual for the same period and basis."
    : "The saved credibility assessment is retained.";
  const specific = /^(?:Execution is not assessed:|Execution assesses decisions|Validated dated decisions)/.test(e.assessmentReason ?? "") ? e.assessmentReason : undefined;
  return { actions, guidance: outlook, note: `${specific ?? `${execution} ${credibility}`} The decisions below are the company's and the board's. They give context for the office and do not measure this person's own record.` };
}
