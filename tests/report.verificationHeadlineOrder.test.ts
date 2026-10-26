/**
 * Audit 2026-10-22 B-10: the verification headline led with its weakest
 * check. "87% figures traced to a cited source" came first and the share of
 * numeric claims actually matched to a figure came third, without a
 * percentage. The headline now leads with the numeric validation fraction;
 * traced figures follow on their own line, worded as provenance.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ReportView } from "@/components/report/ReportView";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { provenanceHeadline, trustHeadline, trustRows } from "@/report/presentation";
import { ReportSchema, type ProvenanceCoverage, type Report } from "@/report/schema";
import { loadTask28Fixture } from "./helpers/task28Report";

// META #45's stored counts: 138/159 figures traced, 40 of 109 numeric claims matched.
const META: ProvenanceCoverage = {
  numeric: { supported: 138, total: 159, rate: 138 / 159 },
  factualClaims: { supported: 150, total: 150, rate: 1 },
  judgments: { cited: 0, total: 0, rate: null },
  factualValidation: { cited: 150, validated: 40, unchecked: 110, contradicted: 0, qualitative: 41, total: 150, rate: 40 / 150 },
};

function metaReport(): Report {
  const report = loadTask28Fixture();
  report.meta.provenanceCoverage = META;
  report.appendix.provenanceCoverage = META;
  return ReportSchema.parse(report);
}

const VALIDATION = "40/109 (36.7%) numeric claims numerically matched to a cited figure (not whole-claim validation); 0 contradicted; 41 qualitative claims cited, not machine-checkable";
const PROVENANCE = "138/159 (86.8%) figures traced to a cited source; 150/150 factual claims carry a citation (provenance, not validation)";

describe("verification headline order (audit 2026-10-22 B-10)", () => {
  it("leads with the numeric validation fraction and puts traced figures on a provenance line", () => {
    expect(trustHeadline(META)).toBe(VALIDATION);
    expect(provenanceHeadline(META)).toBe(PROVENANCE);
  });

  it("lists the numeric validation row first in the trust table", () => {
    expect(trustRows(META)[0].label).toBe("Numeric factual claims numerically matched to a cited figure");
  });

  it("says when no numeric validation was recorded instead of promoting traced figures", () => {
    const legacy = { ...META, factualValidation: undefined };
    expect(trustHeadline(legacy)).toBe("numeric claims not validated: no verification result recorded");
    expect(provenanceHeadline(legacy)).toBe(PROVENANCE);
  });

  it.each([
    { name: "Markdown", header: (r: Report) => { const md = reportToMarkdown(r); return md.slice(0, md.indexOf("### Key data")); } },
    { name: "print", header: (r: Report) => { const p = reportToPrintBody(r); return p.slice(0, p.indexOf("</header>")); } },
  ])("prints a Verification row and a Provenance row in the $name header", ({ header }) => {
    const text = header(metaReport());
    expect(text).toContain(VALIDATION);
    expect(text).toContain(PROVENANCE);
    expect(text.indexOf("Verification")).toBeLessThan(text.indexOf("Provenance"));
    expect(text).not.toMatch(/figures traced to a cited source; 150\/150 factual claims cited; 40/);
  });

  it.each(["classic", "dossier"] as const)("shows both lines, validation first, in the %s layout", (layout) => {
    const html = renderToStaticMarkup(createElement(ReportView, { report: metaReport(), layout }));
    const verification = html.indexOf(`Verification · ${VALIDATION}`);
    expect(verification).toBeGreaterThan(-1);
    expect(html.indexOf(`Provenance · ${PROVENANCE}`)).toBeGreaterThan(verification);
  });
});
