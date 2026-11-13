import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportEvidenceRail } from "@/components/report/ReportEvidenceRail";
import { ReportView } from "@/components/report/ReportView";
import { deriveReportCompletenessPresentation, manifestIssuer } from "@/report/completeness";
import { reportToAuditMarkdown } from "@/report/export/auditMarkdown";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { dataGapTables, manifestEntryLabel, SCORE_BANDS_READER_NOTE } from "@/report/presentation";
import type { Report } from "@/report/schema";
import type { ManifestEntry } from "@/types/core";
import { loadTask28Fixture } from "./helpers/task28Report";

/**
 * D-256 (P22): two owner-approved reader wordings. The per-entry "Recorded
 * gaps" list reads each entry under its reader label (the label its group has
 * in the data-gap tables) with its recorded reason unchanged, and the
 * scorecard states what its band table is instead of printing the band
 * constant, which stays in the audit export.
 */

const html = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

function reportWith(gaps: ManifestEntry[]): Report {
  const r = loadTask28Fixture();
  r.meta.symbol = "AMZN";
  r.appendix.missingData = gaps;
  return r;
}

const ISSUER = "AMZN";
const PRESS: ManifestEntry = { field: "fmp.pressReleases(AMZN)", reason: "FMP subscription (HTTP 402): Restricted Endpoint.", severity: "warn" };
const ISSUER_ESTIMATES: ManifestEntry = { field: "fmp.analystEstimates(AMZN,annual)", reason: "Estimates unavailable.", severity: "warn" };
const PEER_INCOME: ManifestEntry = { field: "fmp.incomeStatement(WMT,annual)", reason: "Peer statement unavailable.", severity: "warn" };
const MACRO: ManifestEntry = { field: "macro.DGS10", reason: "Series stale.", severity: "warn" };
const DATED: ManifestEntry = { field: "statements.balance.2025-12-31.totalDebt", reason: "Debt components conflict; total debt withheld.", severity: "warn" };
const LLM: ManifestEntry = { field: "analysis.llm", reason: "No analysis key configured.", severity: "critical" };

describe("D-256: Recorded gaps entries read under their reader labels", () => {
  it("labels the named issuer's provider entry without its raw endpoint id", () => {
    const gaps = [PRESS, ISSUER_ESTIMATES, PEER_INCOME];
    expect(manifestIssuer(gaps)).toBe(ISSUER);
    expect(manifestEntryLabel(PRESS, ISSUER)).toBe("Press releases (FMP)");
    expect(manifestEntryLabel(PRESS, ISSUER)).not.toContain("pressReleases");
  });

  it("control: another company's entry keeps its own symbol, and the issuer's does not gain one", () => {
    expect(manifestEntryLabel(PEER_INCOME, ISSUER)).toBe("Annual income statement (WMT)");
    expect(manifestEntryLabel(ISSUER_ESTIMATES, ISSUER)).toBe("Analyst estimates (FMP)");
  });

  it("unrelated shapes: series, dated statement and process ids get a general wording, never the raw id", () => {
    for (const gap of [MACRO, DATED, LLM]) {
      const label = manifestEntryLabel(gap, ISSUER);
      expect(label).not.toBe(gap.field);
      expect(label).not.toMatch(/[A-Za-z]\.[A-Za-z]|\(/);
    }
    expect(manifestEntryLabel(LLM, ISSUER)).toBe("Analysis not completed");
  });

  it("an entry reads exactly as its group does in the data-gap tables (one presentation rule)", () => {
    const gaps = [PRESS, ISSUER_ESTIMATES, PEER_INCOME, MACRO, DATED];
    const c = deriveReportCompletenessPresentation(reportWith(gaps).meta.dataCompleteness, gaps, []);
    const tableLabels = new Set(dataGapTables(c).flatMap((t) => t.rows.map((row) => String(row[0]))));
    for (const gap of gaps) expect(tableLabels.has(manifestEntryLabel(gap, manifestIssuer(gaps)))).toBe(true);
  });

  it("the rendered rail shows labels and the recorded reasons unchanged, never the raw fields", () => {
    const gaps = [PRESS, PEER_INCOME, MACRO, DATED, LLM];
    const rail = renderToStaticMarkup(createElement(ReportEvidenceRail, { report: reportWith(gaps) }));
    const list = /Recorded gaps \(5\)<\/summary>([\s\S]*?)<\/details>/.exec(rail)![1]!;
    for (const gap of gaps) {
      expect(list).not.toContain(html(gap.field));
      expect(list).toContain(html(manifestEntryLabel(gap, ISSUER)));
      expect(list).toContain(html(gap.reason));
    }
    expect(list).toContain("Press releases (FMP)");
  });
});

describe("D-256: the scorecard states its band table in words", () => {
  it("web, Markdown and print show the reader sentence and no band constant; the audit export keeps the constant", () => {
    const r = loadTask28Fixture();
    r.scores!.bandsVersion = "SCORE_BANDS_D256_SENTINEL";
    const web = renderToStaticMarkup(createElement(ReportView, { report: r }));
    for (const body of [web, reportToMarkdown(r), reportToPrintBody(r)]) {
      expect(body).toContain(SCORE_BANDS_READER_NOTE);
      expect(body).not.toMatch(/SCORE(?:\\)?_BANDS(?:\\)?_D256/);
      expect(body).not.toContain("Band policy");
    }
    expect(reportToAuditMarkdown(r)).toMatch(/Band table: SCORE(?:\\)?_BANDS(?:\\)?_D256(?:\\)?_SENTINEL/);
  });
});
