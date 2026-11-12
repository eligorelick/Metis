/**
 * P11 (D-218): a refusal is judged from its cause and evidence, never its
 * wording. These are the source lines that still decide by reading a refusal,
 * gap or rejection sentence (`reason`): a `startsWith`, `includes`, regex test
 * or equality against prose. The list is a ratchet: a new wording-reading line
 * fails, and a later step that removes one must lower its count here.
 *
 * The site IDs (C conflict, G gap, P provider status, R stored-report reader,
 * S sector-specific, O other prose) are the step-1 inventory's. Writers of the
 * C sites' sentences also write a typed `cause` (`@/types/refusalCause`); the
 * readers do not use it yet.
 *
 * Comparing a reason to `null`, `undefined` or a kebab-case code literal
 * ("value-mismatch") is a typed check and is not counted.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const PINNED: Record<string, number> = {
  // C1-C5, C7, C9, C12 read conflict wording; C6, C8, C10 compare two refusal sentences for identity.
  // C11 moved to its code in D-219; its wording, for conflicts with no code, is in refusalCauseRead.ts.
  "src/edgar/financialEnrichment.ts": 13,
  // D-219: the one place a conflict without a typed cause is read by its sentence, for the readers
  // migrated to codes: C14's two patterns and C11's one, moved verbatim.
  "src/edgar/refusalCauseRead.ts": 3,
  // C13: a vendor loss-quarter EPS conflict rechecked from its wording.
  "src/pipeline/keyless.ts": 1,
  // C15: netDebt removed when its sentence equals totalDebt's. C14 moved to its code in D-219.
  "src/pipeline/stageB/leaseScope.ts": 1,
  // C16, C17: a gap dropped when its sentence equals the superseded conflict's.
  "src/pipeline/cashFlowBasis.ts": 1,
  "src/pipeline/primaryCapitalBasis.ts": 1,
  // G1, G2: the unprofitable-overlay DCF suppression sentence; P1 caller: analyst-estimate quota.
  "src/pipeline/compute.ts": 3,
  // G3, G4: which DCF gap names the withheld fair value.
  "src/pipeline/stageB/fairValue.ts": 2,
  // G5: the temporary-equity enrichment gap that leaves a bridge claim unknown.
  "src/pipeline/stageB/seniorClaims.ts": 1,
  // G6: forensic gaps deduplicated by field and sentence.
  "src/pipeline/stageB/forensics.ts": 1,
  // G7: a rejected duplicate fiscal period.
  "src/pipeline/stageC/payload.ts": 1,
  // P1 (definition and retry callers), P2: FMP quota and empty-array status sentences.
  "src/providers/fmp.ts": 6,
  // P3, P4, P1 caller: empty-array and unlinked-predecessor sentences, member quota.
  "src/pipeline/dataBundle.ts": 3,
  // P5, P6: empty-array / no-key / unknown-ticker status and the no-key skip sentence.
  "src/pipeline/jobRunner.ts": 4,
  "src/app/company/[symbol]/page.tsx": 3,
  // P7: peer profile refusals.
  "src/pipeline/peers.ts": 2,
  // R1-R16: readers of a saved report's stored sentences (P21: old reports carry no code).
  "src/report/completeness.ts": 2,
  "src/report/gapResolution.ts": 3,
  "src/report/legacyBridgeMethod.ts": 2,
  "src/report/legacyEdgarDerivedLines.ts": 3,
  "src/report/legacyValuationNotes.ts": 3,
  "src/report/principalAggregationSafety.ts": 1,
  "src/report/providerFallback.ts": 2,
  "src/report/researchReview.ts": 5,
  // S1: the non-bank lender convention (sector-specific; left for an owner decision).
  "src/report/readerConventions.ts": 1,
  // O1: an estimate-anchor stop sentence, display only.
  "src/pipeline/stageB/valuation.ts": 1,
};

const NOT_TEXT = String.raw`(?!\s*(?:null|undefined)\b)(?!\s*["'\`][a-z0-9-]*["'\`])`;
const WORDING_READS: readonly RegExp[] = [
  /\b(?:reason|suppressionReason)\??\.(?:startsWith|endsWith|includes|indexOf|match|search)\(/,
  /\.(?:test|exec)\([^)]*\b(?:reason|suppressionReason)\b/,
  new RegExp(String.raw`\breason\s*[!=]==?` + NOT_TEXT + String.raw`\s*[\w"'\`]`),
  new RegExp(String.raw`(?<!\b(?:null|undefined)\s*)[!=]==?\s*[\w.?!\][]*\.reason\b`),
  /\bisFmpQuotaReason\(/,
];

const files = (dir: string): string[] => readdirSync(dir).flatMap((entry) => {
  const full = path.join(dir, entry);
  if (statSync(full).isDirectory()) return files(full);
  return /\.tsx?$/.test(entry) ? [full] : [];
});

function wordingReads(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const file of files("src")) {
    const lines = readFileSync(file, "utf8").split(/\r?\n/).filter((line) => !/^\s*(?:\/\/|\*)/.test(line));
    const hits = lines.filter((line) => WORDING_READS.some((pattern) => pattern.test(line))).length;
    if (hits > 0) counts[file.split(path.sep).join("/")] = hits;
  }
  return counts;
}

describe("refusal wording reads (P11 ratchet)", () => {
  it("are exactly the pinned sites: none added, and a removed one is unpinned here", () => {
    expect(wordingReads()).toEqual(PINNED);
  });

  it("the scan sees each kind of wording read and ignores typed checks", () => {
    const hit = (line: string) => WORDING_READS.some((pattern) => pattern.test(line));
    expect(hit(`if (conflict.reason.startsWith("debt maturity scope unresolved:")) {`)).toBe(true);
    expect(hit(`if (/no total operating-lease liability/.test(refused.reason ?? "")) {`)).toBe(true);
    expect(hit(`if (gap.reason === LEGACY_REASON) {`)).toBe(true);
    expect(hit(`if (fieldConflicts.netDebt?.reason === conflict.reason) delete x;`)).toBe(true);
    expect(hit(`if (!isFmpQuotaReason(result.gap.reason)) return result;`)).toBe(true);
    expect(hit(`if (reason === null) return row;`)).toBe(false);
    expect(hit(`if (result.reason === "value-mismatch") {`)).toBe(false);
    expect(hit(`if (conflict.cause === "debt-maturity-scope") {`)).toBe(false);
  });
});
