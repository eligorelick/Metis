import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
it("P3 records keep one methodology paragraph and the required release heading", () => {
 const methodology = readFileSync("docs/METHODOLOGY.md", "utf8");
 const paragraphs = methodology.split(/\r?\n\r?\n/).filter(p => p.includes("AI-408") && p.includes("MetricRow columns"));
 expect(paragraphs).toHaveLength(1);
 const changelog = readFileSync("CHANGELOG.md", "utf8");
 expect(changelog.match(/^## .+$/m)?.[0]).toBe("## Unreleased - P3 verifier and trust labels (2026-11-02)");
 expect(changelog).toContain("hide stored citation/provenance shares");
 expect(readFileSync("tests/stageC.tracedNumberDescription.test.ts")[0]).not.toBe(0xef);
});
