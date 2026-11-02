import { legacyCheckNote } from "@/report/claimMatching";
import { expect, it } from "vitest";
import { collectPersonRows, collectPersonNames, runConsistencyChecks } from "@/pipeline/stageC/consistency";
it("AI-116 reads each listed owner role without splitting a title comma", () => {
  const insiderNotes = ["2026-09-17 SMITH JOHN (director, officer: President and CEO): G-Gift 1000 @ 0 [fmp:insider-trades · 2026-09-17]", "2026-09-17 JONES JANE (officer: EVP, Operations): S-Sale 1000 @ 10 [fmp:insider-trades · 2026-09-17]"];
  expect(collectPersonRows({ insiderNotes }).map(r => r.title)).toEqual(["director", "President and CEO", "EVP, Operations"]);
});

it("AI-116 qualifies only historical dropped-role judgments", async () => {
 const { legacyCheckNote } = await import("@/report/claimMatching");
 const entry = { claim: "gift", path: "leadership.executives[0].evidence.insiderActivity[0]", outcome: "unverified" as const, reason: "named-individual-title-mismatch" as const, source: "fmp:insider-trades", note: 'The claim calls SMITH JOHN "director", but no cited row gives that title', check: "named-individual" as const };
 expect(legacyCheckNote(entry, [entry], "1.55.0")).toBeNull();
 expect(legacyCheckNote(entry, [entry], "1.56.0")).toBeNull();
 expect(legacyCheckNote({ ...entry, note: 'The claim calls SMITH JOHN "Chief Financial Officer"' }, [{ ...entry, note: 'The claim calls SMITH JOHN "Chief Financial Officer"' }], "1.55.0")).toBeNull();
});

it.each(["Director JOHN SMITH recorded a gift.", "JOHN SMITH (President and CEO) recorded a gift."])("AI-116 accepts a listed role: %s", text => {
 const insiderNotes = ["2026-09-17 SMITH JOHN (director, officer: President and CEO): G-Gift 1000 @ 0 [fmp:insider-trades \u00b7 2026-09-17]"];
 const result = runConsistencyChecks({ claims: [{ path: "leadership.executives[0].evidence.insiderActivity[0]", claim: { label: "FACT", text, source: "fmp:insider-trades", asOf: "2026-09-17" } }], registry: [], citationRegistry: [{ id: "fmp:insider-trades", kind: "payload-text", asOf: "2026-09-17", origin: "fmp:insider-trades" }], fetchedUrls: new Set(), personRows: collectPersonRows({ insiderNotes }), personNames: collectPersonNames({ insiderNotes }) });
 expect(result.findings).toEqual([]);
});
it("AI-116 audit export qualifies both historical rows without mutating them", async () => {
 const { readFileSync } = await import("node:fs");
 const { reportToAuditMarkdown } = await import("@/report/export/auditMarkdown");
 const { ReportSchema } = await import("@/report/schema");
 const report = ReportSchema.parse(JSON.parse(readFileSync("fixtures/report/DEMO-sample.json", "utf8")));
 report.meta.specVersion = "1.55.0";
 const entry = { claim: "gift (director, officer: President and CEO)", path: "leadership.executives[0].evidence.insiderActivity[0]", outcome: "unverified" as const, reason: "named-individual-title-mismatch" as const, source: "fmp:insider-trades", note: 'The claim calls SMITH JOHN "director", but no cited row gives that title' };
 report.appendix.verificationLog = [entry, { ...entry, check: "named-individual" }];
 const before = JSON.stringify(report);
 expect(reportToAuditMarkdown(report).match(/read role by role/g)).toHaveLength(2);
 expect(JSON.stringify(report)).toBe(before);
 report.meta.specVersion = "1.56.0";
 expect(reportToAuditMarkdown(report)).not.toContain("read role by role");
});

it.each(["director, officer: CFO", "officer: CFO, director"])("AI-116 qualifies evidence of multiple roles: %s", roles => {
 const entry = { claim: `SMITH JOHN (${roles}) recorded a gift`, path: "leadership.executives[0].evidence.insiderActivity[0]", outcome: "unverified" as const, reason: "named-individual-title-mismatch" as const, source: "fmp:insider-trades", note: 'The claim calls SMITH JOHN "CFO"', check: "named-individual" as const };
 expect(legacyCheckNote(entry, [entry], "1.55.0")).toContain("read role by role");
 expect(legacyCheckNote(entry, [entry], "1.56.0")).toBeNull();
});
it.each(["officer: CFO", "officer: EVP, Operations"])("AI-116 retains correct single-role refusal: %s", roles => {
 const entry = { claim: `SMITH JOHN (${roles}) recorded a gift`, path: "insider", outcome: "unverified" as const, reason: "named-individual-title-mismatch" as const, source: "fmp:insider-trades", note: 'The claim calls SMITH JOHN "director"', check: "named-individual" as const };
 expect(legacyCheckNote(entry, [entry], "1.55.0")).toBeNull();
});
