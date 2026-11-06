import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { parseMemberLabels } from "@/edgar/segmentFacts";
import { runStageB } from "@/pipeline/compute";
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import { enrichDataOnlyReport } from "@/pipeline/stageC/dataOnlyReport";
import { CompetitiveSection, LeadershipSection, ProjectionsSection } from "@/components/report/sections";
import { filingDisclosureTables } from "@/report/filingDisclosurePresentation";
import { leadershipRosterPresentation } from "@/report/readerConventions";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { peerCoverageAuditLines, valuationReviewBlocks } from "@/report/researchReview";
import type { Report } from "@/report/schema";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { loadTask28Fixture } from "./helpers/task28Report";

const exports = [["Markdown", reportToMarkdown], ["print", reportToPrintBody]] as const;

describe("EXPE report 1 presentation regressions", () => {
  it("decodes XML numeric member punctuation while retaining encoded markup as text", () => {
    const labels = parseMemberLabels(`<link:loc xlink:label="loc" xlink:href="issuer.xsd#issuer_AdvertisingMember"/>
      <link:label xlink:label="label">Group (&#8220;EG&#x201D;) &amp; &lt;img src=x&gt; Advertising [Member]</link:label>
      <link:labelArc xlink:from="loc" xlink:to="label"/>`);
    expect(labels["issuer:AdvertisingMember"]).toBe("Group (“EG”) & <img src=x> Advertising");
  });

  it("renders retained encoded segment labels as safe text without changing the stored report", () => {
    const report = loadTask28Fixture();
    const d = buildFilingDisclosures(completeCurrencyBundle({}))!;
    d.segments = [{ axis: "srt:ProductOrServiceAxis", axisLabel: "Product / market platform", currency: "USD",
      quarters: ["2026-09-30"], rows: [{ label: "Group (&#8220;EG&#8221;) &lt;img src=x&gt;", childOf: null, values: [100] }],
      total: [100], priorPresentation: [], derivedCells: 0, sources: ["retained filing"] }];
    report.filingDisclosures = d;
    const before = JSON.stringify(report);
    for (const [, render] of exports) {
      const output = render(report);
      expect(output).toContain("Group (“EG”)");
      expect(output).not.toContain("<img src=x>");
    }
    expect(JSON.stringify(report)).toBe(before);
  });

  it("routes withheld segment axes and event-text limitations beside the affected evidence", () => {
    const d = buildFilingDisclosures(completeCurrencyBundle({}))!;
    const segment = "Segment XBRL, Geography axis withheld: fewer than two compatible current-quarter members; continuity is unresolved.";
    const event = "8-K 0001104659-26-042073 Item 8.01: retained 4000 of 4208 source characters; omitted officer/event terms remain unreviewed.";
    const outlook = 'Issuer outlook statement not read as structured guidance (8-K filed 2026-02-12): "Revenue growth of 6 to 9 percent"';
    d.notes = [segment, event, outlook];
    d.segments = d.segments.filter(s => s.axisLabel !== "Geography");
    const business = JSON.stringify(filingDisclosureTables(d, "business"));
    const events = JSON.stringify(filingDisclosureTables(d, "catalystsRisks"));
    const guidance = JSON.stringify(filingDisclosureTables(d, "outlook"));
    expect(business).toContain(segment);
    expect(events).toContain(event);
    expect(guidance).toContain("Revenue growth of 6 to 9 percent");
    expect(guidance).not.toContain(segment);
    expect(guidance).not.toContain(event);
    expect(d.notes).toEqual([segment, event, outlook]);
  });

  it("retains capital-return notes when no capital-return table is available", () => {
    const d = buildFilingDisclosures(completeCurrencyBundle({}))!;
    const note = "Quarterly dividend raised from 0.10 to 0.12 USD per share (8-K filed 2026-02-01).";
    d.capitalReturn = null;
    d.freeCashFlow = [];
    d.notes = [note];
    expect(JSON.stringify(filingDisclosureTables(d, "catalystsRisks"))).toContain(note);
    expect(JSON.stringify(filingDisclosureTables(d, "outlook"))).not.toContain(note);
  });

  it("keeps CEO, CFO and chairman in a bounded factual roster regardless of provider ordering", () => {
    const bundle = completeCurrencyBundle({});
    const ordinary = Array.from({ length: 9 }, (_, i) => ({ name: `Officer ${i + 1}`, title: "Vice President", titleSince: null }));
    bundle.executives = { ok: true, value: { source: "fmp", endpoint: "key-executives", fetchedAt: bundle.builtAt,
      asOf: bundle.builtAt.slice(0, 10), data: { raw: {}, rows: [...ordinary,
        { name: "Chief Executive", title: "Chief Executive Officer & Director", titleSince: null },
        { name: "Finance Chief", title: "Chief Financial Officer", titleSince: null },
        { name: "Board Leader", title: "Executive Chairman of the Board", titleSince: null }] } } };
    const stub = loadTask28Fixture();
    stub.leadership.executives = [];
    stub.leadership.governanceNotes = [];
    const report = enrichDataOnlyReport(stub, { bundle, computed: runStageB(bundle), reason: "No completed analyst pass" });
    const roster = report.leadership.governanceNotes;
    for (const name of ["Chief Executive", "Finance Chief", "Board Leader"]) expect(roster.some(c => c.text.includes(name))).toBe(true);
    expect(roster.some(c => /showing \d+ of 12.*omitted/i.test(c.text))).toBe(true);
    expect(report.leadership.executives).toEqual([]);
    for (const [, render] of exports) {
      const output = render(report);
      expect(output).toContain("Provider executive roster");
      expect(output).toContain("No individual executive assessment recorded");
      expect(output).toContain("Chief Executive");
    }
    const html = renderToStaticMarkup(createElement(LeadershipSection, { leadership: report.leadership, index: 8 }));
    expect(html).toContain("Provider executive roster");
    expect(html).toContain("No individual executive assessment recorded");
  });

  it("keeps an analyst judgment in governance even when it cites the provider roster", () => {
    const leadership = loadTask28Fixture().leadership;
    leadership.governanceNotes = [
      { text: "Alex Example — Chief Executive Officer.", label: "FACT", source: "fmp:key-executives", asOf: "2026-11-06" },
      { text: "The roster alone does not establish leadership quality.", label: "JUDGMENT", source: "fmp:key-executives", asOf: "2026-11-06" },
    ];
    const shown = leadershipRosterPresentation(leadership);
    expect(shown.roster).toHaveLength(1);
    expect(shown.governance[0]!.text).toContain("does not establish leadership quality");
  });

  it.each(exports)("distinguishes an absent analyst peer table from existing screen data in %s", (_name, render) => {
    const report = withPeerCoverage();
    const output = render(report);
    expect(output).not.toContain("No peer data");
    expect(output).toContain("No analyst peer comparison table was recorded");
    expect(output).toContain("ABNB, TRIP");
    const html = renderToStaticMarkup(createElement(CompetitiveSection, { competitive: report.competitive, report, index: 9 }));
    expect(html).not.toContain("no peers resolved");
    expect(html).toContain("No analyst peer comparison table was recorded");
  });

  it("does not call missing common-earnings evidence mathematically non-meaningful", () => {
    const report = withPeerCoverage();
    const peers = report.valuation.peerCoverage!;
    const input = { peerCoverage: peers, symbol: report.meta.symbol };
    expect(valuationReviewBlocks(input)[0]!.table!.rows[0]![1]).toBe("unavailable");
    expect(peerCoverageAuditLines(peers).join(" ")).toContain("company unavailable");
    peers.exclusions[0]!.reason = "Common earnings comparison: nonpositive TTM common earnings";
    expect(valuationReviewBlocks(input)[0]!.table!.rows[0]![1]).toBe("n/m");
    expect(peerCoverageAuditLines(peers, report.meta.symbol).join(" ")).toContain("company n/m");
    peers.exclusions[0]!.symbol = "ANOTHER";
    expect(valuationReviewBlocks(input)[0]!.table!.rows[0]![1]).toBe("unavailable");
    peers.comparisons![0]!.currentWithheldReason = "Issuer-common economic share scope unresolved";
    expect(valuationReviewBlocks(input)[0]!.table!.rows[0]![1]).toBe("withheld");
  });

  it.each(exports)("shows the retained operating-EPS refusal instead of an empty forecast table in %s", (_name, render) => {
    const report = withoutOperatingEps();
    const before = JSON.stringify(report);
    const output = render(report);
    const start = output.indexOf("Operating EPS (diluted shares)");
    const eps = output.slice(start, output.indexOf("Macro Context", start));
    expect(eps).toContain("future common-earnings allocation is unestablished");
    expect(eps).not.toMatch(/\| Period \||<th>Period<\/th>/);
    expect(JSON.stringify(report)).toBe(before);
  });

  it("shows a withheld forecast's reason beside its historical chart", () => {
    const report = withoutOperatingEps();
    const html = renderToStaticMarkup(createElement(ProjectionsSection, { projections: report.projections!, index: 12 }));
    expect(html).toContain("future common-earnings allocation is unestablished");
  });
});

function withPeerCoverage(): Report {
  const report = loadTask28Fixture();
  report.competitive.peerTable = [];
  report.valuation.peerCoverage = { candidates: 5, evaluated: 4, eligible: ["ABNB", "TRIP"], methodology: [],
    exclusions: [{ symbol: report.meta.symbol, reason: "Common earnings comparison: common ownership unproven" }],
    comparisons: [{ name: "Market cap / TTM common earnings", current: null, peerMedian: null, peerCount: 0, basis: "Four comparable common-earnings quarters required." }] };
  return report;
}

function withoutOperatingEps(): Report {
  const report = loadTask28Fixture();
  const eps = report.projections!.series.find(s => s.metric === "epsDiluted")!;
  for (const path of ["bull", "base", "bear", "weighted"] as const) eps[path] = [];
  delete eps.flatShare;
  delete eps.shareTrend;
  eps.disclosures = [{ field: "projections.eps.ownershipScope", severity: "warn",
    reason: "Forecast operating EPS withheld: future common-earnings allocation is unestablished." }];
  return report;
}
