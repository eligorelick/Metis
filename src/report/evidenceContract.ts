/**
 * The evidence-contract stamp (P21, D-217): which set of evidence rules a
 * report was built under. This module is its one owner.
 *
 * Newly built reports carry `meta.evidenceContract = EVIDENCE_CONTRACT_VERSION`
 * (written by `assembleReport` and `buildDataOnlyReport`). Saved reports are
 * never rewritten to add it: a stored report without the stamp was built under
 * older rules, and one whose stamp this build does not recognise (for example
 * one written by a newer build) is disclosed as such. Neither is refused, and
 * neither is treated as current. The reader note is derived once in
 * `evidenceContractNotice` (src/report/presentation.ts).
 *
 * The stamp moves only by a deliberate decision entry; nothing bumps it
 * automatically.
 */
import { EVIDENCE_CONTRACT_VERSION } from "@/report/versions";
import type { ReportMeta } from "@/report/schema";

export { EVIDENCE_CONTRACT_VERSION } from "@/report/versions";

export type EvidenceContractStatus =
  | { state: "current" }
  | { state: "absent" }
  | { state: "unrecognised"; stamp: string };

/** Classify a report's recorded stamp; never infers one from spec or pipeline text. */
export function evidenceContractStatus(meta: Pick<ReportMeta, "evidenceContract">): EvidenceContractStatus {
  const stamp = meta.evidenceContract;
  if (stamp === undefined) return { state: "absent" };
  if (stamp === EVIDENCE_CONTRACT_VERSION) return { state: "current" };
  return { state: "unrecognised", stamp };
}
