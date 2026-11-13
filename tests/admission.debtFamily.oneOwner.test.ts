/**
 * D-254 (P13, P7): `admitDebtFields` is called from two places only.
 *
 * - `src/edgar/financialEnrichment.ts`: its owner. `enrichFinancialFields`
 *   admits the balance rows once when the data bundle is built.
 * - `src/pipeline/admission/debtFamily.ts`: the run's shared preparation, which
 *   every later reader asks (Stage B and the Stage C payload today).
 *
 * A reader that calls the admission itself decides the family a second time
 * with its own arguments, which is what this pilot removed. A site that has to
 * stay on its own call is listed in `LEFT_ON_THEIR_OWN_CALL` with its reason
 * and its count; that list may only shrink. It is empty.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.join(process.cwd(), "src");

const files = (dir: string): string[] => readdirSync(dir).flatMap((entry) => {
  const full = path.join(dir, entry);
  if (statSync(full).isDirectory()) return files(full);
  return /\.tsx?$/.test(entry) ? [full] : [];
});

const relative = (file: string): string => path.relative(process.cwd(), file).split(path.sep).join("/");

/** Calls, not the declaration; a comment that spells a call counts, so write the name without its bracket there. */
const CALL = /(?<!function\s)\badmitDebtFields\s*(?:<[^>()]*>)?\s*\(/g;
const IMPORT = /import\s*(?:type\s*)?\{[^}]*\badmitDebtFields\b[^}]*\}\s*from/g;

function sites(pattern: RegExp): Record<string, number> {
  const found: Record<string, number> = {};
  for (const file of files(SRC)) {
    const count = readFileSync(file, "utf8").match(pattern)?.length ?? 0;
    if (count > 0) found[relative(file)] = count;
  }
  return found;
}

/** Readers left on their own call, with the reason. May only shrink. */
const LEFT_ON_THEIR_OWN_CALL: Record<string, { calls: number; reason: string }> = {};

describe("D-254: the debt family has one admission owner and one shared preparation", () => {
  it("only the enrichment owner and the shared preparation call the admission", () => {
    expect(sites(CALL)).toEqual({
      "src/edgar/financialEnrichment.ts": 1,
      "src/pipeline/admission/debtFamily.ts": 1,
      ...Object.fromEntries(Object.entries(LEFT_ON_THEIR_OWN_CALL).map(([file, site]) => [file, site.calls])),
    });
  });

  it("only the shared preparation imports it", () => {
    expect(sites(IMPORT)).toEqual({ "src/pipeline/admission/debtFamily.ts": 1 });
  });

  it("no reader is left on its own call", () => {
    expect(Object.keys(LEFT_ON_THEIR_OWN_CALL)).toEqual([]);
  });
});
