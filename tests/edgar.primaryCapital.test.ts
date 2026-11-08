import { describe, expect, it } from "vitest";
import { parseDocument } from "@/edgar/extract";
import { primaryCapitalEvidence } from "@/edgar/primaryCapital";
import { capitalCashTable, capitalEquityTable, capitalHtml, capitalIdentity, inlineCapitalHtml } from "./helpers/primaryCapital";

const parse = (html = capitalHtml(), overrides = {}) => primaryCapitalEvidence(parseDocument(html), { ...capitalIdentity, ...overrides });

describe("primary capital statement recovery", () => {
  it("recovers separate cash and execution costs beyond the retained statement prefix", () => {
    const evidence = parse();
    expect(evidence.cash.find(x => x.periodEnd === "2025-12-31")).toMatchObject({ amount: 40_000_000, currency: "USD", periodStart: "2025-01-01" });
    expect(evidence.executions.find(x => x.periodEnd === "2025-12-31")).toMatchObject({ shares: 2_000_000, cost: 40_200_000, currency: "USD", periodStart: "2025-01-01" });
    const proof = evidence.executions.find(x => x.periodEnd === "2025-12-31")!.proof;
    expect(proof.row.start).toBeGreaterThan(12000);
    expect(capitalHtml().slice(proof.row.start, proof.row.end)).toContain("2,000,000 shares");
    expect(proof.row.text).toContain("40.2");
    expect(evidence.source).toEqual(capitalIdentity);
    expect(JSON.stringify(evidence).length).toBeLessThan(9000);
  });

  it("uses each pair of annual equity boundaries and never a neighboring year's balance", () => {
    expect(parse().executions.map(x => [x.periodStart, x.periodEnd, x.shares, x.cost])).toEqual([
      ["2024-01-01", "2024-12-31", 1_000_000, 20_100_000], ["2025-01-01", "2025-12-31", 2_000_000, 40_200_000],
    ]);
  });

  it.each([
    ["no currency", (s: string) => s.replaceAll("USD in millions", "In millions")],
    ["subsidiary", (s: string) => s.replaceAll("EXAMPLE INDUSTRIES, INC. AND SUBSIDIARIES", "EXAMPLE FINANCE SUBSIDIARY, INC.")],
    ["authorizations", (s: string) => s.replaceAll("Repurchases of common stock", "Authorization to repurchase common stock")],
    ["employee withholding", (s: string) => s.replaceAll("Repurchases of common stock", "Cash paid for shares withheld for taxes")],
    ["class-specific", (s: string) => s.replaceAll("Repurchases of common stock", "Repurchases of Class A common stock")],
    ["hidden", (s: string) => s.replace("<body>", '<body hidden="hidden">')],
    ["unbalanced markup", (s: string) => s.replace("</tr>", "</div>")],
    ["unsupported rows", (s: string) => s.replaceAll("<td>", '<td rowspan="2">')],
  ])("refuses %s evidence", (_, change) => {
    const evidence = parse(change(capitalHtml()));
    expect(evidence.cash).toEqual([]);
    expect(evidence.executions).toEqual([]);
    expect(evidence.refusals.length).toBeGreaterThan(0);
  });

  it.each([
    { cik: "7654321" }, { accession: "0001234567-26-000002" }, { observedAt: "2026-02-01T00:00:00Z" },
    { filingDate: "2026-02-31" }, { reportDate: "2026-04-01" }, { documentUrl: "https://example.com/filing.htm" },
  ])("refuses invalid or contradictory source metadata %j", overrides => {
    const evidence = parse(capitalHtml(), overrides);
    expect(evidence.cash).toEqual([]);
    expect(evidence.executions).toEqual([]);
  });

  it("refuses ambiguous multi-year equity sections and rounded share counts", () => {
    expect(parse(capitalHtml(capitalCashTable, capitalEquityTable.replace("December 31, 2024", "December 31, 2023"))).executions).toEqual([]);
    expect(parse(capitalHtml(capitalCashTable, capitalEquityTable.replaceAll(/\d,000,000 shares/g, "2.0 million shares"))).executions).toEqual([]);
  });

  it("does not keep an earlier convenient same-period table when a duplicate disagrees", () => {
    const html = capitalHtml() .replace("<h2>Notes", `<div>EXAMPLE INDUSTRIES, INC. AND SUBSIDIARIES</div><div>CONSOLIDATED STATEMENTS OF CASH FLOWS</div>${capitalCashTable.replace("(40.0)", "(44.0)")}<h2>Notes`);
    expect(parse(html).cash.some(x => x.periodEnd === "2025-12-31")).toBe(false);
    expect(parse(html).refusedPeriods).toContainEqual(expect.objectContaining({ kind: "cash", periodEnd: "2025-12-31" }));
  });

  it("refuses a noncontrolling cost mixed into the equity movement", () => {
    const equity = capitalEquityTable.replace("<td>(40.2)</td><td>—</td><td>(40.2)</td>", "<td>(39.2)</td><td>(1.0)</td><td>(40.2)</td>");
    expect(parse(capitalHtml(capitalCashTable, equity)).executions.some(x => x.periodEnd === "2025-12-31")).toBe(false);
  });

  it("uses original inline unit and annual context metadata without treating dimensional counts as bulk companyfacts", () => {
    const e = parse(inlineCapitalHtml());
    expect(e.cash.map(x => x.amount)).toEqual([40_000_000, 20_000_000]);
    expect(e.executions.map(x => x.shares)).toEqual([1_000_000, 2_000_000]);
    expect(e.executions[1]!.proof.currencyUnit?.text).toBe("iso4217:USD");
  });

  it.each([
    ["wrong context issuer", (s: string) => s.replaceAll(">0001234567<", ">0007654321<")],
    ["nonannual context", (s: string) => s.replaceAll("-01-01</xbrli:startDate>", "-07-01</xbrli:startDate>")],
    ["unknown unit", (s: string) => s.replaceAll('unitRef="usd"', 'unitRef="missing"')],
    ["duplicate unit", (s: string) => s.replace("</ix:header>", '<xbrli:unit id="usd"><xbrli:measure>iso4217:CAD</xbrli:measure></xbrli:unit></ix:header>')],
  ])("rejects inline %s", (_, change) => {
    const e = parse(change(inlineCapitalHtml()));
    expect(e.cash).toEqual([]); expect(e.executions).toEqual([]);
  });

  it("does not recover a convenient earlier duplicate if a later row has an unreadable number", () => {
    const html = capitalHtml().replace("<h2>Notes", `<div>EXAMPLE INDUSTRIES, INC. AND SUBSIDIARIES</div><div>CONSOLIDATED STATEMENTS OF CASH FLOWS</div>${capitalCashTable.replace("(40.0)", "not available")}<h2>Notes`);
    expect(parse(html).cash.some(x => x.periodEnd === "2025-12-31")).toBe(false);
  });

  it("retains decimal monetary precision without binary rounding noise", () => {
    expect(parse(capitalHtml(capitalCashTable.replace("40.0", "4281.6"))).cash[0]!.amount).toBe(4_281_600_000);
  });

  it("identifies an explicitly different total-cost disclosure for a bulk-tag scope bridge", () => {
    const html = inlineCapitalHtml().replace("<h2>Notes", `<p>During fiscal 2025, the Company repurchased 2.0 million shares of its common stock at a total cost, including commissions and excise taxes, of $ <ix:nonFraction name="us-gaap:PaymentsForRepurchaseOfCommonStock" unitRef="usd" contextRef="annual2025" scale="6" format="ixt:num-dot-decimal">40.2</ix:nonFraction> million.</p><h2>Notes`);
    expect(parse(html).costDisclosures?.[0]).toMatchObject({ amount: 40_200_000, periodEnd: "2025-12-31", tag: "PaymentsForRepurchaseOfCommonStock", currency: "USD" });
    expect(parse(html.replace("the Company repurchased", "the Company authorized")).costDisclosures ?? []).toEqual([]);
  });

  it("rejects cells shifted into the wrong year or equity component by column spans", () => {
    const cash = capitalCashTable.replace('<td>Repurchases of common stock</td>', '<td colspan="2">Repurchases of common stock</td>');
    expect(parse(capitalHtml(cash)).cash).toEqual([]);
    const equity = capitalEquityTable.replaceAll('<td>Repurchases of common stock', '<td colspan="2">Repurchases of common stock');
    expect(parse(capitalHtml(capitalCashTable, equity)).executions).toEqual([]);
  });

  it("does not select an older table behind an ambiguous annual header", () => {
    const html = capitalHtml().replace("<h2>Notes", `<div>EXAMPLE INDUSTRIES, INC. AND SUBSIDIARIES</div><div>CONSOLIDATED STATEMENTS OF CASH FLOWS</div>${capitalCashTable.replace("Year Ended", "Period Ended")}<h2>Notes`);
    expect(parse(html).cash).toEqual([]);
  });

  it("refuses inline counts explicitly rounded to thousands of shares", () => {
    const html = inlineCapitalHtml().replaceAll('unitRef="shares" contextRef=', 'decimals="-3" unitRef="shares" contextRef=');
    expect(parse(html).executions).toEqual([]);
  });

  it("refuses stylesheet-hidden statement tables instead of interpreting them as visible evidence", () => {
    const html = capitalHtml().replace("<body>", '<body><style>.gone { display: none; }</style>').replaceAll("<table>", '<table class="gone">');
    expect(parse(html).cash).toEqual([]); expect(parse(html).executions).toEqual([]);
  });
});
