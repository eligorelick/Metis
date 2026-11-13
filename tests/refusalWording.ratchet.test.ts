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
  // C6, C8, C10 compare two refusal sentences for identity.
  // C11 moved to its code in D-219, C4 and C12 in D-220, C7 and C9 in D-221 (C5, legacy-only, too),
  // C1-C3 in D-222; their wording, for conflicts with no code, is in refusalCauseRead.ts.
  "src/edgar/financialEnrichment.ts": 3,
  // D-219, D-220: the one place a conflict without a typed cause is read by its sentence, for the
  // readers migrated to codes, moved verbatim: C14's two patterns and C11's one (D-219); the
  // shortTermDebt pattern C4 and C12 share, C4's longTermDebt one and C12's total/net one (D-220);
  // C7's combined-total pattern, C9's minor-difference one and C5's legacy vendor-sum one (D-221);
  // the stock-compensation pattern C1 and C2 share, C3's cash one and C13's share-count one (D-222).
  // D-242: the gap and provider-status tests, for missing-data entries with no code, moved verbatim:
  // G1/G2's overlay one, G3's two leads, G4's balance-fields one, G5's prefix and SEC-silent suffix,
  // P1's quota one, P2/P5's exact empty-array one, P3's containment one, P5's no-key and
  // unlisted-ticker ones, P4's unlinked-predecessor one and P7a's symbol-refusal one (13 lines).
  "src/edgar/refusalCauseRead.ts": 25,
  // C13 (src/pipeline/keyless.ts) moved to its code in D-222; that file reads no wording now.
  // C15: netDebt removed when its sentence equals totalDebt's. C14 moved to its code in D-219.
  "src/pipeline/stageB/leaseScope.ts": 1,
  // C16, C17: a gap dropped when its sentence equals the superseded conflict's.
  "src/pipeline/cashFlowBasis.ts": 1,
  "src/pipeline/primaryCapitalBasis.ts": 1,
  // G1, G2 and the P1 caller (src/pipeline/compute.ts), G3, G4 (stageB/fairValue.ts) and G5
  // (stageB/seniorClaims.ts) moved to the gap's typed cause in D-242; those files read no wording now.
  // G6: forensic gaps deduplicated by field and sentence.
  "src/pipeline/stageB/forensics.ts": 1,
  // G7 (src/pipeline/stageC/payload.ts) moved to the quarter-rejection kind in D-223; that file reads no wording now.
  // P1 and P2 (src/providers/fmp.ts), P3, P4 and the P1 caller (src/pipeline/dataBundle.ts), P5
  // (src/pipeline/jobRunner.ts and src/app/company/[symbol]/page.tsx, now one check in
  // src/pipeline/unknownTicker.ts) and P7a (src/pipeline/peers.ts) moved to the typed cause in D-242.
  // P6: the in-memory AI-skip disclosure (not a missing-data entry; no code exists for it).
  "src/pipeline/jobRunner.ts": 1,
  // P7b: PEER_PROVIDER_TERMINAL over provider-written failure text (no single writer composes it).
  "src/pipeline/peers.ts": 1,
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
  // O1 (src/pipeline/stageB/valuation.ts) moved to a typed "not covered" value in D-223; that file reads no wording now.
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
