import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportView } from "@/components/report/ReportView";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { metricLabel, sourceLabel } from "@/report/presentation";
import type { Report, TracedNumber } from "@/report/schema";
import { loadTask28Fixture } from "./helpers/task28Report";

/**
 * FIGR extra-high paid audit (2026-11-02): read-time defects in the stored
 * report. The peer table printed registry ids as column headings, the excluded
 * provider list lost its "scale only" caption because the model added the
 * subject as a row, several citations printed machine ids, and each scenario's
 * first commentary bullet repeated its own heading.
 */
function report(): Report {
  const r = loadTask28Fixture();
  r.meta.symbol = "FIGR";
  r.meta.reportId = 1;
  return r;
}

function surfaces(r: Report): string[] {
  return [reportToMarkdown(r), reportToPrintBody(r), renderToStaticMarkup(createElement(ReportView, { report: r }))];
}

const figure = (source: string, value: number, unit: TracedNumber["unit"]): TracedNumber =>
  ({ value, unit, ...(unit === "currency" ? { currency: "USD" } : {}), source, sourceId: source, asOf: "2026-11-02", verified: true }) as TracedNumber;

function withSubjectAndExcludedPeers(r: Report): Report {
  r.competitive.peerTable = [
    { name: "Figure Technology Solutions, Inc. (subject)", symbol: "FIGR", metrics: [
      figure("payload.quote.issuer-common-capitalization-economic-price-approximation", 4_957_629_081.84, "currency"),
      figure("computed.valuation.pettm-current", 24.8874, "x"),
    ] },
    { name: "Coinbase", symbol: "COIN", metrics: [figure("payload.peers.coin-coinbase", 60_000_000_000, "currency")] },
    { name: "Galaxy Digital", symbol: "GLXY", metrics: [figure("payload.peers.glxy-galaxy-digital", 5_010_000_000, "currency")] },
  ];
  r.valuation.peerCoverage = { candidates: 2, evaluated: 2, eligible: [], methodology: [], exclusions: [
    { symbol: "COIN", reason: "business model excluded" }, { symbol: "GLXY", reason: "business model excluded" },
  ] } as unknown as NonNullable<Report["valuation"]["peerCoverage"]>;
  return r;
}

/**
 * The peer table's heading row on one surface. The app keeps each figure's
 * source id in its hover title, which is intended; headings must be readable.
 */
function peerBlock(text: string): string {
  const start = text.search(/Provider peer list|Peer table|peer table/i);
  const block = text.slice(start);
  const head = /<thead>([\s\S]*?)<\/thead>/.exec(block)?.[1] ?? /\| Peer \| Symbol \|[^\n]*/.exec(block)?.[0];
  return head ?? block;
}

describe("FIGR extra-high readability", () => {
  it("heads peer-table columns with reader labels, not registry ids", () => {
    const r = withSubjectAndExcludedPeers(report());
    r.valuation.peerCoverage = { ...r.valuation.peerCoverage!, eligible: ["COIN"] };
    for (const text of surfaces(r)) {
      const block = peerBlock(text);
      expect(block).toContain("Issuer-common capitalization");
      expect(block).toContain("P/E (TTM)");
      expect(block).not.toContain("pettm-current");
      expect(block).not.toContain("issuer-common-capitalization-economic-price-approximation");
    }
  });

  it("replaces an excluded provider list even when the model adds the subject", () => {
    const r = withSubjectAndExcludedPeers(report());
    r.competitive.competitors = [{ text: "Rocket Companies competes with the company in home-equity lending.", label: "FACT", source: "edgar.10-K.item1", asOf: "2025-12-31" }];
    for (const text of surfaces(r)) {
      expect(text).toContain("peer list contained no comparable companies");
      expect(text).toContain("competitors are discussed in this section");
      expect(peerBlock(text)).not.toContain("Coinbase");
      expect(peerBlock(text)).not.toContain("Galaxy Digital");
    }
    // A comparable that survived the screen still makes it a peer table.
    r.valuation.peerCoverage = { ...r.valuation.peerCoverage!, eligible: ["COIN"], exclusions: [{ symbol: "GLXY", reason: "business model excluded" }] };
    expect(reportToMarkdown(r)).toContain("Coinbase");
    expect(reportToMarkdown(r)).not.toContain("peer list contained no comparable companies");
  });

  // Review of the combined priority fixes (2026-11-03), findings 4 and 5.
  it("names a competitor discussion only when the report carries one", () => {
    const r = withSubjectAndExcludedPeers(report());
    r.competitive.competitors = [];
    for (const text of surfaces(r)) {
      expect(text).toContain("peer list contained no comparable companies.");
      expect(text).not.toContain("competitors are discussed in this section");
    }
  });

  it("captions excluded listed rows as scale only when other peers passed the screen", () => {
    const r = withSubjectAndExcludedPeers(report());
    r.valuation.peerCoverage = { ...r.valuation.peerCoverage!, eligible: ["HOOD"] };
    const md = reportToMarkdown(r);
    expect(md).toContain("shown for scale only");
    expect(md).not.toContain("peer list contained no comparable companies");
  });

  it.each([
    ["computed.current-capital.stockbasedcompensation-filed-prior-year-ytd-operand-sharebasedcompensation", "Stock-based compensation (filed prior-year year-to-date operand)"],
    ["computed.current-capital.operatingcashflow-filed-fiscal-year-operand-netcashprovidedbyusedinoperatingactivities", "Operating cash flow (filed fiscal-year operand)"],
    ["payload.insiders.post-window-form-4-code-f-reported-transaction-rows", "Form 4 code F transactions reported after the window"],
    ["payload.insiders.post-window-form-4-code-f-reported-shares-selected-rows-may-overlap", "Form 4 code F shares reported after the window (selected rows; may overlap)"],
    ["computed.suppressed", "Route-suppressed metrics"],
    ["computed.capital-cash.capex-d-a-latest", "Capex / D&A (latest fiscal year)"],
    ["computed.capital-cash.capex-revenue-latest", "Capex as % of revenue (latest fiscal year)"],
    ["computed.capital-cash.capex-revenue-slope", "Capex-to-revenue slope"],
    ["computed.capital-cash.sbc-revenue", "SBC (cash-flow add-back) as % of revenue (latest fiscal year)"],
    ["computed.returns.roe-latest-dupont", "ROE (DuPont, latest fiscal year)"],
    ["computed.valuation.p-e-common-income-denominator", "P/E common-income denominator (TTM)"],
    ["computed.comparable-peers.market-cap-ttm-common-earnings-eligible-peer-count-after-filtering", "Eligible peers for market cap / TTM common earnings (after screening)"],
    ["payload.quote.issuer-common-capitalization-economic-price-approximation", "Issuer-common capitalization"],
    ["payload.statements.cash-flow-annual.2025-12-31.capex-negative", "Capital expenditure (cash outflow) (year ended 2025-12-31)"],
    ["payload.statements.cash-flow-quarterly.2026-03-31.buybacks-negative", "Share repurchases (cash outflow) (quarter ended 2026-03-31)"],
    ["computed.forensics.piotroski.signals.turnoverUp", "Piotroski signal: asset turnover up"],
    ["computed.forensics.piotroski.signals.noEquityIssuance", "Piotroski signal: no equity issuance"],
  ])("labels %s for readers", (id, label) => {
    expect(metricLabel(id)).toBe(label);
    expect(sourceLabel(id)).toBe(label);
  });

  it("labels pipeline-owned citations", () => {
    expect(sourceLabel("pipeline:insider-coverage")).toBe("Insider-filing coverage");
    expect(sourceLabel("pipeline:report-reference")).toBe("Report cross-reference");
  });

  it("does not repeat a scenario list heading inside its first bullet", () => {
    const r = report();
    r.valuation.dcf = { ...r.valuation.dcf, perShare: null, upsidePct: null, assumptions: [], sensitivityGrid: [] };
    r.valuation.reverseDcf = { impliedMetric: "n/a", impliedValue: null, narrative: "No reverse DCF applies." };
    r.valuation.scenarios = r.valuation.scenarios.map((s, i) => ({ ...s, priceTarget: null, probability: null, horizon: "n/a",
      whatWouldHaveToBeTrue: [`What would have to be true: condition ${i + 1} holds.`, `Second condition ${i + 1}.`],
      qualitativeCommentary: [`Qualitative commentary: platform fees grow faster in case ${i + 1}.`, `Kiavi adds volume in case ${i + 1}.`] }));
    r.fairValue = { status: "suppressed", method: null, methodVersion: "test", perShare: null, upsidePct: null, basis: [], reasons: [] };
    if (r.projections) r.projections = { ...r.projections, series: [] };
    for (const text of surfaces(r)) {
      expect(text).toContain("Platform fees grow faster in case 1.");
      expect(text).toContain("Condition 1 holds.");
      expect(text).not.toMatch(/Qualitative commentary:\s*platform/i);
      expect(text).not.toMatch(/What would have to be true:\s*condition/i);
    }
  });
});
