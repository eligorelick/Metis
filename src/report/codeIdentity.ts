/**
 * The code identity of a report (P27, P20, D-227): which exact build assembled
 * it. This module is its one owner.
 *
 * A newly built report carries `meta.codeIdentity` only when the running app
 * has a verified runtime artifact identity (a build made by
 * `scripts/build-with-identity.mjs`, checked by `readRuntimeCodeIdentity` in
 * `scripts/runtime-artifact-manifest.mjs`). Without one (dev server, tests,
 * the same-report harness, the CLI) the field is omitted: never guessed, never
 * filled with placeholders (P10, P20). Saved reports are never rewritten to add
 * it (P21).
 *
 * The identity locates code; it does not retain or execute it. It is recorded
 * data only: no staleness state, notice, rerun prompt, cache or resume key, or
 * replay decision reads it, no surface shows it, and it never reaches a model
 * request (the job runner writes it after the passes; no request schema holds
 * report metadata). A different identity says a report was made by different
 * code, not that its figures are stale, so it never forces a rerun.
 * `tests/report.codeIdentity.test.ts` keeps every other src file from reading it.
 */
import { z } from "zod";
import type { Report } from "@/report/schema";

// A fresh schema per field: a shared instance would become a reused `$defs`
// entry in `reportToJsonSchema` and renumber every later definition.
const sha256Hex = () => z.string().regex(/^[a-f0-9]{64}$/);

export const ReportCodeIdentitySchema = z.object({
  /** Git commit the build was made from; null when the build had no project git metadata. */
  codeCommit: z.string().regex(/^[a-f0-9]{40,64}$/).nullable(),
  /** SHA-256 of the uncommitted diff of the built sources at build time; null when unknown. */
  dirtyDiffHash: sha256Hex().nullable(),
  /** SHA-256 of docs/METHODOLOGY.md as captured by the build. */
  methodDocumentHash: sha256Hex(),
  /** SHA-256 of the verified, sorted list of compiled modules (relative path and SHA-256). */
  compiledArtifactHash: sha256Hex(),
  /** The combined method and compiled-artifact hash run-input snapshot custody records. */
  methodArtifactHash: sha256Hex(),
  /** SHA-256 of package-lock.json as captured by the build. */
  dependencyLockHash: sha256Hex(),
}).strict();
export type ReportCodeIdentity = z.infer<typeof ReportCodeIdentitySchema>;

/**
 * Record the assembling build's identity on a report built now. Without a
 * verified identity (or with one that does not match the stored shape) the
 * report is returned unchanged, so the field stays absent.
 */
export function withCodeIdentity<T extends Pick<Report, "meta">>(report: T, identity: unknown): T {
  if (identity === undefined) return report;
  const parsed = ReportCodeIdentitySchema.safeParse(identity);
  if (!parsed.success) return report;
  return { ...report, meta: { ...report.meta, codeIdentity: parsed.data } };
}

/**
 * The report as every surface derives display identity from it: without the
 * recorded code identity, so a report renders the same with or without it.
 */
export function withoutCodeIdentity<T extends Pick<Report, "meta">>(report: T): T {
  if (!("codeIdentity" in report.meta)) return report;
  const meta = { ...report.meta };
  delete meta.codeIdentity;
  return { ...report, meta };
}
