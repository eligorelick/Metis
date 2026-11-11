import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ReportSnapshotHeader } from "@/components/report/ReportSnapshotHeader";
import { ReportView } from "@/components/report/ReportView";
import { runStageB } from "@/pipeline/compute";
import { buildDataOnlyReport } from "@/pipeline/jobRunner";
import type { ValidationReport } from "@/pipeline/stageA/validate";
import type { DataBundle } from "@/pipeline/types";
import { EVIDENCE_CONTRACT_VERSION, evidenceContractStatus } from "@/report/evidenceContract";
import { reportToMarkdown } from "@/report/export/markdown";
import { markdownBlockquote } from "@/report/export/markdownEscape";
import { esc, reportToPrintBody } from "@/report/export/printHtml";
import { parseStoredReportWithSafety } from "@/report/legacyEntitySafety";
import { evidenceContractNotice, syntheticNotice } from "@/report/presentation";
import { providerFallbackNotice } from "@/report/providerFallback";
import { ReportSchema, type Report } from "@/report/schema";
import type { ManifestEntry } from "@/types/core";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

/**
 * P21, D-217: new reports carry `meta.evidenceContract`; saved reports are never
 * rewritten. A stored report without the stamp, or with one this build does not
 * recognise, shows one note on the app screen, Markdown and print, beside (not
 * instead of) the specific warnings it already had.
 */
const OLDER = "Built under older rules: this saved report has no evidence-rules stamp, so its figures are shown as saved.";
const unrecognised = (stamp: string) =>
  `Built under unrecognised rules: this saved report's evidence-rules stamp "${stamp}" is not one this app knows, so its figures are shown as saved.`;

const fallbackGap: ManifestEntry = {
  field: "keyless.quote",
  reason: "served by yahoo (some endpoint) because FMP FMP quota/rate limit (HTTP 429): Limit Reach",
  severity: "info",
  expected: false,
};

function newReport(gaps: ManifestEntry[] = []): Report {
  const bundle: DataBundle = completeCurrencyBundle({ debt: 300 });
  bundle.gaps = [...bundle.gaps, ...gaps];
  return buildDataOnlyReport({
    symbol: bundle.symbol, companyName: "Test General Co", generatedAt: "2026-07-06T12:00:00.000Z", model: "none", costUsd: 0,
    bundle, validation: { checks: [], flags: [], gaps: [] } as unknown as ValidationReport, computed: runStageB(bundle), costBreakdown: [], reason: "no analysis",
  });
}

/** Stored JSON as an older build wrote it: the same report without the stamp. */
function unstampedJson(report: Report): string {
  const { evidenceContract, ...meta } = report.meta;
  expect(evidenceContract).toBe(EVIDENCE_CONTRACT_VERSION);
  return JSON.stringify({ ...report, meta });
}

function surfaces(report: Report) {
  return {
    classic: renderToStaticMarkup(createElement(ReportView, { report, layout: "classic" })),
    dossier: renderToStaticMarkup(createElement(ReportView, { report, layout: "dossier" })),
    header: renderToStaticMarkup(createElement(ReportSnapshotHeader, { snapshot: report, reportId: 7, status: "done", actions: null })),
    markdown: reportToMarkdown(report),
    print: reportToPrintBody(report),
  };
}

const count = (text: string, needle: string) => text.split(needle).length - 1;

/** React's text escaping, for the app surfaces. */
const html = (text: string) => text.replaceAll('"', "&quot;").replaceAll("'", "&#x27;");

function expectNoteOnEverySurface(report: Report, note: string): void {
  expect(evidenceContractNotice(report)).toBe(note);
  const s = surfaces(report);
  expect(count(s.classic, html(note))).toBe(1);
  expect(count(s.dossier, html(note))).toBe(1);
  expect(s.header).toContain(`data-run-notice="evidenceContract">${html(note)}</p>`);
  expect(count(s.markdown, `> ${markdownBlockquote(note)}`)).toBe(1);
  expect(count(s.print, `<p class="disclaimer">${esc(note)}</p>`)).toBe(1);
}

/** Give the first dated claim or number a month-only as-of, as pre-1.2 builds wrote. */
function withMonthOnlyAsOf(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(withMonthOnlyAsOf);
  if (value === null || typeof value !== "object") return false;
  const node = value as Record<string, unknown>;
  if (typeof node.source === "string" && typeof node.asOf === "string" && /^\d{4}-\d{2}-\d{2}$/.test(node.asOf)) {
    node.asOf = node.asOf.slice(0, 7);
    return true;
  }
  return Object.values(node).some(withMonthOnlyAsOf);
}

describe("evidence-contract stamp (P21, D-217)", () => {
  it("stamps a newly built report, which then shows no note", () => {
    const report = newReport();
    expect(report.meta.evidenceContract).toBe(EVIDENCE_CONTRACT_VERSION);
    expect(evidenceContractStatus(report.meta)).toEqual({ state: "current" });
    expect(evidenceContractNotice(report)).toBeNull();
    const stored = parseStoredReportWithSafety(JSON.stringify(report));
    expect(stored?.report.meta.evidenceContract).toBe(EVIDENCE_CONTRACT_VERSION);
    const s = surfaces(stored!.report);
    for (const text of Object.values(s)) expect(text).not.toContain("Built under");
    expect(s.header).not.toContain('data-run-notice="evidenceContract"');
  });

  it("reads an unstamped stored report unchanged and shows the older-rules note on every surface", () => {
    const json = unstampedJson(newReport());
    const before = json.slice();
    const stored = parseStoredReportWithSafety(json);
    expect(stored).not.toBeNull();
    expect(json).toBe(before);
    expect("evidenceContract" in stored!.report.meta).toBe(false);
    expect(evidenceContractStatus(stored!.report.meta)).toEqual({ state: "absent" });
    expectNoteOnEverySurface(stored!.report, OLDER);
  });

  it("keeps the legacy read mode for an unstamped report that fails the save-time gates", () => {
    const legacy = JSON.parse(unstampedJson(newReport())) as Record<string, unknown>;
    expect(withMonthOnlyAsOf(legacy)).toBe(true);
    expect(ReportSchema.safeParse(legacy).success).toBe(false);
    const json = JSON.stringify(legacy);
    const stored = parseStoredReportWithSafety(json);
    expect(stored?.readMode).toBe("legacy");
    expect(JSON.parse(json)).toEqual(legacy);
    expectNoteOnEverySurface(stored!.report, OLDER);
  });

  it("discloses an unrecognised stamp without refusing the report or treating it as current", () => {
    const report = newReport();
    const json = JSON.stringify({ ...report, meta: { ...report.meta, evidenceContract: "EVIDENCE_CONTRACT_99" } });
    const stored = parseStoredReportWithSafety(json);
    expect(stored).not.toBeNull();
    expect(stored!.report.meta.evidenceContract).toBe("EVIDENCE_CONTRACT_99");
    expect(evidenceContractStatus(stored!.report.meta)).toEqual({ state: "unrecognised", stamp: "EVIDENCE_CONTRACT_99" });
    expectNoteOnEverySurface(stored!.report, unrecognised("EVIDENCE_CONTRACT_99"));
  });

  it("rejects a malformed stamp value instead of guessing", () => {
    const report = newReport();
    for (const evidenceContract of ["", 1, null]) {
      expect(ReportSchema.safeParse({ ...report, meta: { ...report.meta, evidenceContract } }).success).toBe(false);
    }
  });

  it("shows the note beside, never instead of, an existing specific warning", () => {
    const stored = parseStoredReportWithSafety(unstampedJson(newReport([fallbackGap])))!.report;
    const fallback = providerFallbackNotice(stored);
    expect(fallback).toMatch(/^Provider fallback ·/);
    const s = surfaces(stored);
    for (const text of [s.classic, s.header, s.markdown, s.print]) {
      expect(text).toContain(fallback!);
      expect(text).toContain(OLDER);
      expect(text.indexOf(fallback!)).toBeLessThan(text.indexOf(OLDER));
    }
  });

  it("keeps the bundled synthetic sample's own notice and adds the older-rules note", () => {
    const json = readFileSync("fixtures/report/DEMO-sample.json", "utf8");
    const stored = parseStoredReportWithSafety(json)!.report;
    expect(readFileSync("fixtures/report/DEMO-sample.json", "utf8")).toBe(json);
    expect(stored.meta.evidenceContract).toBeUndefined();
    const synthetic = syntheticNotice(stored)!;
    expect(synthetic).toMatch(/^Synthetic demonstration/);
    const s = surfaces(stored);
    for (const text of [s.classic, s.header, s.markdown, s.print]) {
      expect(text).toContain(synthetic);
      expect(text).toContain(OLDER);
    }
  });
});
