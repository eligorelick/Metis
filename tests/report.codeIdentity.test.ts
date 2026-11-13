import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createRuntimeArtifactManifest, readRuntimeArtifactIdentity, readRuntimeCodeIdentity } from "../scripts/runtime-artifact-manifest.mjs";
import { ReportSnapshotHeader } from "@/components/report/ReportSnapshotHeader";
import { ReportView } from "@/components/report/ReportView";
import { runStageB } from "@/pipeline/compute";
import { buildDataOnlyReport } from "@/pipeline/jobRunner";
import { getRuntimeReportCodeIdentity, getRuntimeSnapshotArtifactIdentity } from "@/pipeline/runtimeArtifactIdentity";
import type { ValidationReport } from "@/pipeline/stageA/validate";
import { ReportCodeIdentitySchema, withCodeIdentity, withoutCodeIdentity, type ReportCodeIdentity } from "@/report/codeIdentity";
import { reportToAuditMarkdown } from "@/report/export/auditMarkdown";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody, reportToPrintHtml } from "@/report/export/printHtml";
import { parseStoredReportWithSafety } from "@/report/legacyEntitySafety";
import { analystCaseToJsonSchema, judgeOutputToJsonSchema, reportToJsonSchema, ReportSchema, type Report } from "@/report/schema";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

/**
 * P27, P20, D-227: a newly built report records which exact build assembled it
 * (`meta.codeIdentity`) only when the running app has a verified runtime
 * artifact identity. It is stored data only: no surface shows it, no request
 * schema carries it, and no src file other than its writer reads it.
 */
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const IDENTITY: ReportCodeIdentity = {
  codeCommit: "a".repeat(40),
  dirtyDiffHash: sha("diff"),
  methodDocumentHash: sha("method"),
  compiledArtifactHash: sha("artifacts"),
  methodArtifactHash: sha("method+artifacts"),
  dependencyLockHash: sha("lock"),
};

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function build(buildId = "build-a", options: { codeCommit?: string | null; dirtyDiffBytes?: string } = { codeCommit: "b".repeat(40), dirtyDiffBytes: "build diff" }) {
  const root = mkdtempSync(join(tmpdir(), "metis-code-identity-"));
  roots.push(root);
  const distDir = join(root, ".next");
  mkdirSync(join(distDir, "server", "chunks"), { recursive: true });
  writeFileSync(join(distDir, "BUILD_ID"), buildId);
  writeFileSync(join(distDir, "server", "chunks", "compute.js"), "export const score = 7;");
  writeFileSync(join(distDir, "server", "routes.json"), '{"route":"compute"}');
  const manifest = createRuntimeArtifactManifest({ distDir, buildId, methodArtifactBytes: "method at build", dependencyLockBytes: "lock at build", ...options });
  writeFileSync(join(distDir, "runtime-artifact-identity.json"), JSON.stringify(manifest));
  return { root, distDir, manifest, buildId };
}

function newReport(codeIdentity?: ReportCodeIdentity): Report {
  const bundle = completeCurrencyBundle({ debt: 300 });
  return buildDataOnlyReport({
    symbol: bundle.symbol, companyName: "Test General Co", generatedAt: "2026-07-06T12:00:00.000Z", model: "none", costUsd: 0,
    bundle, validation: { checks: [], flags: [], gaps: [] } as unknown as ValidationReport, computed: runStageB(bundle), costBreakdown: [], reason: "no analysis",
    ...(codeIdentity === undefined ? {} : { codeIdentity }),
  });
}

function surfaces(report: Report) {
  return {
    dossier: renderToStaticMarkup(createElement(ReportView, { report })),
    dossierSelected: renderToStaticMarkup(createElement(ReportView, { report, selectedReportId: 7 })),
    header: renderToStaticMarkup(createElement(ReportSnapshotHeader, { snapshot: report, reportId: 7, status: "done", actions: null })),
    markdown: reportToMarkdown(report),
    print: reportToPrintBody(report),
    printPage: reportToPrintHtml(report),
    audit: reportToAuditMarkdown(report),
  };
}

const stored = (json: string) => {
  const read = parseStoredReportWithSafety(json);
  expect(read).not.toBeNull();
  return read!;
};

describe("code identity on new reports (P27, D-227)", () => {
  it("reads the verified build identity, leaving the snapshot custody reader unchanged", () => {
    const { root, distDir, manifest, buildId } = build();
    const custody = readRuntimeArtifactIdentity({ distDir, buildId });
    expect(custody).toEqual(manifest.identity);
    expect(Object.keys(custody!)).toEqual(["methodArtifactHash", "dependencyLockHash", "codeCommit", "dirtyDiffHash"]);
    const identity = readRuntimeCodeIdentity({ distDir, buildId });
    expect(identity).toEqual({
      codeCommit: "b".repeat(40),
      dirtyDiffHash: sha("build diff"),
      methodDocumentHash: sha("method at build"),
      compiledArtifactHash: sha(JSON.stringify(manifest.artifacts)),
      methodArtifactHash: manifest.identity.methodArtifactHash,
      dependencyLockHash: sha("lock at build"),
    });
    expect(ReportCodeIdentitySchema.parse(identity)).toEqual(identity);
    // No machine path, build id or timestamp travels with it.
    const text = JSON.stringify(identity);
    for (const leak of [root, root.replaceAll("\\", "/"), buildId, "server/", "chunks"]) expect(text).not.toContain(leak);

    vi.spyOn(process, "cwd").mockReturnValue(root);
    vi.stubEnv("METIS_RUNTIME_BUILD_ID", buildId);
    expect(getRuntimeReportCodeIdentity()).toEqual(identity);
    expect(getRuntimeSnapshotArtifactIdentity()).toEqual(custody);
  });

  it("keeps a build without git metadata as null commit and null diff, never a placeholder", () => {
    const { distDir, buildId } = build("build-b", {});
    expect(readRuntimeCodeIdentity({ distDir, buildId })).toMatchObject({ codeCommit: null, dirtyDiffHash: null });
  });

  it("has no identity without verified build evidence", () => {
    const { root, distDir, buildId } = build();
    vi.spyOn(process, "cwd").mockReturnValue(root);
    expect(getRuntimeReportCodeIdentity()).toBeUndefined(); // no build token: dev server, tests, harness, CLI
    vi.stubEnv("METIS_RUNTIME_BUILD_ID", "another-build");
    expect(getRuntimeReportCodeIdentity()).toBeUndefined();
    expect(readRuntimeCodeIdentity({ distDir, buildId: undefined })).toBeUndefined();
    writeFileSync(join(distDir, "server", "chunks", "compute.js"), "export const score = 8;");
    expect(readRuntimeCodeIdentity({ distDir, buildId })).toBeUndefined();
    rmSync(join(distDir, "runtime-artifact-identity.json"));
    expect(readRuntimeCodeIdentity({ distDir, buildId })).toBeUndefined();
  });

  it("writes the field only when an identity is given, and only in the stored shape", () => {
    const report = newReport(IDENTITY);
    expect(report.meta.codeIdentity).toEqual(IDENTITY);
    expect(ReportSchema.parse(report).meta.codeIdentity).toEqual(IDENTITY);
    const without = newReport();
    expect("codeIdentity" in without.meta).toBe(false);
    expect(JSON.stringify(withoutCodeIdentity(report))).toBe(JSON.stringify(without));

    // A malformed identity is not recorded (and the report is the same object).
    for (const bad of [null, {}, { ...IDENTITY, codeCommit: "HEAD" }, { ...IDENTITY, buildId: "x" }, { ...IDENTITY, methodDocumentHash: "" }]) {
      expect(withCodeIdentity(without, bad)).toBe(without);
    }
    expect(withCodeIdentity(without, undefined)).toBe(without);
    expect(withoutCodeIdentity(without)).toBe(without);
  });

  it("reads old reports (without it) and new reports (with it); refusal elsewhere stays strict", () => {
    const withField = JSON.stringify(newReport(IDENTITY));
    const withoutField = JSON.stringify(newReport());
    expect(stored(withField).report.meta.codeIdentity).toEqual(IDENTITY);
    expect("codeIdentity" in stored(withoutField).report.meta).toBe(false);
    expect(stored(withField).readMode).toBe(stored(withoutField).readMode);
    // Bundled saved reports predate the field and still read unchanged.
    for (const file of ["fixtures/report/DEMO-sample.json", "fixtures/report/DEMO-current.json"]) {
      const json = readFileSync(file, "utf8");
      const read = stored(json);
      expect("codeIdentity" in read.report.meta).toBe(false);
      expect(readFileSync(file, "utf8")).toBe(json);
    }
    const report = newReport(IDENTITY);
    // An unknown key inside the identity, a malformed hash, or an unknown meta key is refused.
    for (const meta of [
      { ...report.meta, codeIdentity: { ...IDENTITY, machinePath: "C:/build" } },
      { ...report.meta, codeIdentity: { ...IDENTITY, compiledArtifactHash: "abc" } },
      { ...report.meta, codeIdentity: "a".repeat(40) },
      { ...report.meta, codeIdentityGuess: IDENTITY },
    ]) {
      expect(ReportSchema.safeParse({ ...report, meta }).success).toBe(false);
      expect(parseStoredReportWithSafety(JSON.stringify({ ...report, meta }))).toBeNull();
    }
  });

  it("renders every surface byte for byte the same with and without the field", () => {
    const withoutField = newReport();
    const withField = newReport(IDENTITY);
    expect(surfaces(withField)).toEqual(surfaces(withoutField));
    // Through the stored-report reader as well, and for an older analyzed report.
    expect(surfaces(stored(JSON.stringify(withField)).report)).toEqual(surfaces(stored(JSON.stringify(withoutField)).report));
    const legacy = JSON.parse(readFileSync("fixtures/report/DEMO-current.json", "utf8")) as Report;
    const legacyWith = { ...legacy, meta: { ...legacy.meta, codeIdentity: IDENTITY } };
    expect(surfaces(stored(JSON.stringify(legacyWith)).report)).toEqual(surfaces(stored(JSON.stringify(legacy)).report));
    for (const text of Object.values(surfaces(withField))) {
      for (const value of Object.values(IDENTITY)) if (value !== null) expect(text).not.toContain(value);
    }
  });

  it("never reaches a model request schema", () => {
    const keys = ["codeIdentity", ...Object.keys(IDENTITY)];
    for (const schema of [judgeOutputToJsonSchema(), analystCaseToJsonSchema(), reportToJsonSchema()]) {
      const text = JSON.stringify(schema);
      for (const key of keys) expect(text).not.toContain(`"${key}"`);
    }
  });

  it("is read by no src file other than its owner, schema, writer and the identity reader", () => {
    // The field may never become a gate, notice, cache key or replay decision.
    const allowed: Record<string, RegExp[]> = {
      "src/report/codeIdentity.ts": [/.*/],
      "src/report/schema.ts": [/codeIdentity: ReportCodeIdentitySchema\.optional\(\)/, /"codeIdentity"\]\) \{/, /import \{ ReportCodeIdentitySchema \} from "@\/report\/codeIdentity";/, /^\s*\* src\/report\/codeIdentity\.ts\. /],
      "src/pipeline/jobRunner.ts": [/import \{ withCodeIdentity, type ReportCodeIdentity \} from "@\/report\/codeIdentity";/, /getRuntimeReportCodeIdentity/, /withCodeIdentity\(/, /codeIdentity\?: ReportCodeIdentity;/, /`meta\.codeIdentity` is omitted/],
      "src/pipeline/runtimeArtifactIdentity.ts": [/.*/],
      "src/components/report/ReportView.tsx": [/import \{ withoutCodeIdentity \} from "@\/report\/codeIdentity";/, /evidenceIdentity\("report", withoutCodeIdentity\(withoutGapCauses\(report\)\)\)/],
    };
    const pattern = /codeIdentity|CodeIdentity|runtime-artifact-manifest|compiledArtifactHash|methodDocumentHash/;
    const files: string[] = [];
    const walk = (directory: string) => {
      for (const name of readdirSync(directory)) {
        const path = join(directory, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(?:ts|tsx|mts|mjs|js)$/.test(name)) files.push(relative(process.cwd(), path).replaceAll("\\", "/"));
      }
    };
    walk(join(process.cwd(), "src"));
    const readers = new Set<string>();
    for (const file of files) {
      readFileSync(file, "utf8").split("\n").forEach((line, index) => {
        if (!pattern.test(line)) return;
        readers.add(file);
        const rules = allowed[file];
        expect(rules, `${file}:${index + 1} reads the code identity: ${line.trim()}`).toBeDefined();
        expect(rules!.some(rule => rule.test(line)), `${file}:${index + 1} is not an allowed use: ${line.trim()}`).toBe(true);
      });
    }
    expect([...readers].sort()).toEqual(Object.keys(allowed).sort());
    // The writer only assigns it; nothing compares, branches on or displays it.
    const code = (file: string) => readFileSync(file, "utf8").split("\n").filter(line => !/^\s*(?:\*|\/\/|\/\*)/.test(line)).join("\n");
    expect(code("src/pipeline/jobRunner.ts").match(/\b\w+\.codeIdentity\b/g)).toEqual(["input.codeIdentity", "input.codeIdentity"]);
    expect(code("src/components/report/ReportView.tsx")).not.toMatch(/\.codeIdentity\b/);
  });
});
