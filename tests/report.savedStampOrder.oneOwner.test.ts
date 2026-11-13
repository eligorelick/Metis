/**
 * D-249 (P21): one way to decide "was this saved report written before rule X".
 *
 * A saved report's `meta.specVersion` was read against the frozen display
 * cutoffs by three private parsers: `specVersionBefore`
 * (legacyPayloadRecordSafety.ts: trimmed, unreadable counts as before),
 * `legacyCheckNote` (claimMatching.ts: not trimmed, unreadable counts as not
 * before) and the wording choice in legacyScopeQualifications.ts. They agree
 * for every well-formed stamp and disagreed for a missing, padded or malformed
 * one. The parse and the comparison now live once in src/report/versions.ts,
 * beside the cutoffs they read, with one stated behaviour:
 *
 *   - a stamp that cannot be read (missing, not text, or not three dotted
 *     numbers after trimming: "1.56", "1.56.0-rc1", "v1.56.0", "") is BEFORE
 *     every cutoff, so the report gets the legacy read-time view;
 *   - a stamp at or above a cutoff, including one from a newer build, is not
 *     before it;
 *   - a cutoff that cannot be read never fires.
 *
 * No saved report is read here. The stamps below are the eighteen distinct
 * `meta.specVersion` values in the check database copy (2026-11-13), which are
 * plain version text, plus the current stamp.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { INSIDER_ROLES_READ_FROM, legacyCheckNote } from "@/report/claimMatching";
import { specVersionBefore as reexportedSpecVersionBefore } from "@/report/legacyPayloadRecordSafety";
import { legacyScopeQualifications } from "@/report/legacyScopeQualifications";
import * as versions from "@/report/versions";
import { parseSpecStamp, specVersionBefore } from "@/report/versions";

const SAVED_STAMPS = [
  "1.0.0", "1.1.0", "1.2.0", "1.5.0", "1.6.0", "1.10.0", "1.23.1", "1.23.2", "1.33.0", "1.35.0", "1.38.0",
  "1.43.0", "1.44.0", "1.45.0", "1.48.0", "1.49.0", "1.53.0", "1.73.0",
] as const;

const CUTOFFS: Record<string, string> = {
  PAYLOAD_RECORD_CORRECTION_SPEC: versions.PAYLOAD_RECORD_CORRECTION_SPEC,
  EDGAR_DERIVED_LINES_SINCE_SPEC_VERSION: versions.EDGAR_DERIVED_LINES_SINCE_SPEC_VERSION,
  BRIDGE_METHOD_SINCE_SPEC_VERSION: versions.BRIDGE_METHOD_SINCE_SPEC_VERSION,
  ANNUALIZATION_CONVENTION_SPEC: versions.ANNUALIZATION_CONVENTION_SPEC,
  IMPLIED_RETURN_SHARE_BASIS_SPEC: versions.IMPLIED_RETURN_SHARE_BASIS_SPEC,
  LEGACY_SCOPE_SINCE_SPEC: versions.LEGACY_SCOPE_SINCE_SPEC,
  BRIDGE_READINGS_SINCE_SPEC_VERSION: versions.BRIDGE_READINGS_SINCE_SPEC_VERSION,
  DCF_INPUTS_CONVENTION_SPEC: versions.DCF_INPUTS_CONVENTION_SPEC,
  LEGACY_PLACEHOLDER_DISPLAY_CUTOFF: versions.LEGACY_PLACEHOLDER_DISPLAY_CUTOFF,
  N4B_CAGR_DISPLAY_CUTOFF: versions.N4B_CAGR_DISPLAY_CUTOFF,
  INSIDER_ROLES_READ_FROM: versions.INSIDER_ROLES_READ_FROM,
};

/** An independent statement of the order: three numbers compared left to right. */
function numericallyBefore(stamp: string, cutoff: string): boolean {
  const [a, b] = [stamp, cutoff].map((v) => v.split(".").map((part) => Number.parseInt(part, 10)));
  for (let i = 0; i < 3; i += 1) if (a![i] !== b![i]) return a![i]! < b![i]!;
  return false;
}

/** A verification row `legacyCheckNote` qualifies when, and only when, the report is before INSIDER_ROLES_READ_FROM. */
const insiderEntry = {
  claim: "SMITH JOHN (director, officer: CFO) recorded a gift",
  path: "leadership.executives[0].evidence.insiderActivity[0]",
  outcome: "unverified" as const,
  reason: "named-individual-title-mismatch" as const,
  source: "fmp:insider-trades",
  note: 'The claim calls SMITH JOHN "CFO"',
  check: "named-individual" as const,
};
const insiderNoteShown = (stamp: string): boolean => legacyCheckNote(insiderEntry, [insiderEntry], stamp) !== null;
const scopeWording = (stamp: unknown): string => legacyScopeQualifications({ meta: { specVersion: stamp } } as never)[0] ?? "";

describe("D-249: one reading of a saved spec stamp", () => {
  it("reads three dotted numbers after trimming, and nothing else", () => {
    expect(parseSpecStamp("1.56.0")).toEqual([1, 56, 0]);
    expect(parseSpecStamp(" 1.56.0\n")).toEqual([1, 56, 0]);
    expect(parseSpecStamp("1.056.00")).toEqual([1, 56, 0]);
    for (const unreadable of [undefined, null, 156, "", "  ", "n/a", "1.56", "1.56.0.1", "1.56.0-rc1", "1.56.0+build", "v1.56.0", "1.x.0", "stage-c-1.6.44"]) {
      expect(parseSpecStamp(unreadable)).toBeNull();
    }
  });

  it("the helper the legacy readers import is the versions module's own", () => {
    expect(reexportedSpecVersionBefore).toBe(specVersionBefore);
  });

  it.each(Object.entries(CUTOFFS))("%s: every stamp in the saved reports compares numerically", (_name, cutoff) => {
    for (const stamp of [...SAVED_STAMPS, versions.REPORT_SPEC_VERSION]) {
      expect(specVersionBefore(stamp, cutoff)).toBe(numericallyBefore(stamp, cutoff));
    }
  });

  it("numbers compare as numbers, not text (1.9.0 and 1.10.0 precede 1.45.0; 1.100.0 does not)", () => {
    expect(specVersionBefore("1.9.0", "1.45.0")).toBe(true);
    expect(specVersionBefore("1.10.0", "1.45.0")).toBe(true);
    expect(specVersionBefore("1.100.0", "1.45.0")).toBe(false);
    expect(specVersionBefore("2.0.0", "1.45.0")).toBe(false);
    expect(specVersionBefore("1.45.0", "1.45.0")).toBe(false);
  });

  it.each([undefined, null, 156, "", "n/a", "1.56", "1.56.0-rc1", "v1.56.0", "1.99.0-rc1"] as const)(
    "an unreadable stamp (%j) is before every cutoff",
    (stamp) => {
      for (const cutoff of Object.values(CUTOFFS)) expect(specVersionBefore(stamp, cutoff)).toBe(true);
    },
  );

  it("a stamp from a newer build is not before any cutoff, and a padded stamp is read", () => {
    for (const cutoff of Object.values(CUTOFFS)) {
      expect(specVersionBefore("9.0.0", cutoff)).toBe(false);
      expect(specVersionBefore(` ${versions.REPORT_SPEC_VERSION} `, cutoff)).toBe(false);
      expect(specVersionBefore(" 1.0.0 ", cutoff)).toBe(true);
    }
  });

  it("an unreadable cutoff never fires", () => {
    expect(specVersionBefore("1.0.0", "next")).toBe(false);
    expect(specVersionBefore("n/a", "next")).toBe(true);
  });
});

describe("D-249: the readers of one cutoff cannot disagree", () => {
  it.each([...SAVED_STAMPS, versions.REPORT_SPEC_VERSION])("the audit export's insider note follows the helper for the saved stamp %s", (stamp) => {
    expect(insiderNoteShown(stamp)).toBe(specVersionBefore(stamp, INSIDER_ROLES_READ_FROM));
    expect(insiderNoteShown(stamp)).toBe(numericallyBefore(stamp, INSIDER_ROLES_READ_FROM));
  });

  it.each(["", "n/a", "1.55", "1.55.0-rc1", " 1.55.0 ", "v1.55.0"])("an unreadable or padded stamp (%j) gets the insider note, as every other legacy reader treats it", (stamp) => {
    expect(specVersionBefore(stamp, INSIDER_ROLES_READ_FROM)).toBe(true);
    expect(insiderNoteShown(stamp)).toBe(true);
  });

  it("a padded current stamp gets no legacy note from either reader", () => {
    expect(insiderNoteShown(` ${INSIDER_ROLES_READ_FROM} `)).toBe(false);
    expect(specVersionBefore(` ${INSIDER_ROLES_READ_FROM} `, INSIDER_ROLES_READ_FROM)).toBe(false);
  });

  it("the scope note's wording asks the same reader whether the stamp can be read", () => {
    expect(scopeWording("1.52.0")).toMatch(/^Built before report spec 1\.53\.0\./);
    expect(scopeWording(" 1.52.0 ")).toMatch(/^Built before report spec 1\.53\.0\./);
    for (const unreadable of [undefined, "", "n/a", "1.52", "1.52.0-rc1"]) {
      expect(scopeWording(unreadable)).toMatch(/^Historical scope evidence is not recorded;/);
    }
  });
});

describe("D-249: no reader parses a spec stamp on its own", () => {
  const SRC = path.join(process.cwd(), "src");
  /** The Claude CLI's own version text (a tool version, not a report stamp). */
  const NOT_A_REPORT_STAMP = new Set(["src/ai/claude.ts"]);
  const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? files(full) : /\.(?:ts|tsx|mts|cts)$/.test(entry.name) ? [full] : [];
  });
  const rel = (file: string): string => path.relative(process.cwd(), file).split(path.sep).join("/");

  it("a dotted-version pattern is written only in src/report/versions.ts", () => {
    const pattern = /\\d\+\)?\\\.\(?\\d\+\)?\\\.\(?\\d\+/;
    const offenders = files(SRC).map(rel)
      .filter((file) => file !== "src/report/versions.ts" && !NOT_A_REPORT_STAMP.has(file))
      .filter((file) => pattern.test(readFileSync(path.join(process.cwd(), file), "utf8")));
    expect(offenders).toEqual([]);
    expect(pattern.test(readFileSync(path.join(SRC, "report", "versions.ts"), "utf8"))).toBe(true);
  });

  it("no reader splits a spec stamp into numbers by hand", () => {
    const offenders = files(SRC).map(rel)
      .filter((file) => file !== "src/report/versions.ts")
      .filter((file) => /(?:specVersion|SpecVersion|_SPEC\b|_READ_FROM|_CUTOFF)[^\n]*\.split\(["']\.["']\)/.test(readFileSync(path.join(process.cwd(), file), "utf8")));
    expect(offenders).toEqual([]);
  });
});
