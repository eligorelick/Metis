import type { VerificationLogEntry } from "@/report/schema";

export type EarningsReferenceAuditEntry = Omit<VerificationLogEntry, "reason"> & {
  reason: "unsupported-report-reference" | "report-reference-normalized";
};

const DESTINATION = String.raw`(?:earnings|net[\s-]income)\s+(?:bridge|reconciliation)`;
const POINTER = String.raw`(?:below|above|following)`;
const FORWARD_REFERENCE = new RegExp(String.raw`\b${DESTINATION}\b[^.!?]{0,45}\b${POINTER}\b|\b${POINTER}\b[^.!?]{0,45}\b${DESTINATION}\b`, "i");
const EXPLICIT_ABSENCE = new RegExp(String.raw`\b(?:no|without)\s+(?:reported\s+)?${DESTINATION}\b|\b${DESTINATION}\b[^.!?]{0,35}\b(?:not|unavailable|absent|missing)\b`, "i");

/** A deliberately narrow structural check, not a factual-prose classifier. */
export function promisesEarningsDestination(text: string): boolean {
  return text.split(/(?<=[.!?])\s+(?=[A-Z])/u)
    .some(sentence => FORWARD_REFERENCE.test(sentence) && !EXPLICIT_ABSENCE.test(sentence));
}

/**
 * A complete rendered earnings reconciliation is the only valid destination.
 * An unrelated cash/debt bridge cannot satisfy this contract. Original model
 * text remains in the audit entry and in the persisted raw pass artifact.
 */
export function guardEarningsReferences<T extends object>(input: T, available: boolean): {
  report: T; log: EarningsReferenceAuditEntry[];
} {
  const report = structuredClone(input);
  const log: EarningsReferenceAuditEntry[] = [];
  const walk = (node: unknown, path: string): void => {
    if (node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }
    const claim = node as Record<string, unknown>;
    if (typeof claim.text === "string" && typeof claim.source === "string" &&
        ["FACT", "ESTIMATE", "JUDGMENT"].includes(String(claim.label)) &&
        "asOf" in claim && promisesEarningsDestination(claim.text)) {
      log.push({ claim: claim.text, outcome: "removed", reason: available ? "report-reference-normalized" : "unsupported-report-reference",
        validationStatus: "unchecked", claimSupportStatus: "unreviewed", evidenceKind: "factual-claim",
        path, source: claim.source,
        note: available ? "The positional pointer was replaced with the fixed Fundamentals section destination where every required earnings operand and reconciliation renders. This is a structural reference check, not validation of surrounding prose."
          : "The model promised an earnings bridge, but no complete compatible reported-earnings reconciliation is rendered. The reference was withheld; this does not adjudicate the surrounding financial interpretation." });
      if (available) {
        claim.text = claim.text.replace(new RegExp(FORWARD_REFERENCE.source, "gi"), "reported earnings reconciliation in the Fundamentals section");
        return;
      }
      claim.text = "Report reference withheld: a complete, source-bound reported earnings reconciliation is unavailable in this report.";
      claim.source = "pipeline:report-reference";
      delete claim.sourceId;
      claim.asOf = null;
      return;
    }
    for (const [key, value] of Object.entries(claim)) {
      if (key !== "verificationLog") walk(value, path ? `${path}.${key}` : key);
    }
  };
  walk(report, "");
  return { report, log };
}
