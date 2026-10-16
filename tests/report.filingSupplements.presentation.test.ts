import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportView } from "@/components/report/ReportView";
import { reportToAuditMarkdown, reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { filingDisclosureTables } from "@/report/filingDisclosurePresentation";
import type { FilingDisclosures } from "@/report/schema";
import { loadTask28Fixture } from "./helpers/task28Report";

const source = { form: "10-Q", accession: "0000000000-26-000001", exhibit: null, filingDate: "2026-08-26", url: "https://www.sec.gov/example" };

function disclosures() {
  const base: FilingDisclosures = {
    version: "1.0.0", currency: "USD", currencyBasis: "Statements in USD", guidance: null, guidanceChecks: [],
    freeCashFlow: [], freeCashFlowDefinition: null, capitalReturn: null, events: [], segments: [], quarterlyTrend: [], notes: [],
  };
  return Object.assign(base, {
    filingFacts: [
      { key: "deal-consideration-total", label: "Example transaction total consideration", value: 20e9, unit: "currency" as const, asOf: "2026-07-26", period: null, qualifier: "approximately", computed: "paid plus payable", sourceTag: "edgar:10-Q notes", source, text: "The transaction includes amounts paid and payable." },
      { key: "customer-share", label: "Direct customer A share of revenue", value: 22, unit: "percent" as const, asOf: "2026-07-26", period: "quarter ended 2026-07-26", qualifier: null, computed: null, sourceTag: "edgar:10-Q notes", source, text: "Customer A represented 22% of quarterly revenue." },
    ],
    commentaryOutlook: [{ topic: "DSO", text: "We expect DSO to normalize next quarter.", source }],
    officerChanges: [{ kind: "departure" as const, person: "Example Officer", role: "EVP", board: false, announced: "2026-08-26", effective: "2026-09-30", anticipated: true, inEffect: true, note: "Subject to transition arrangements.", package: [{ component: "Cash payment", value: 2e6 }], source }],
    sayOnPay: { meetingDate: "2026-06-01", approved: true, votesFor: 100, votesAgainst: 20, abstentions: 5, brokerNonVotes: null, supportPct: 80, source },
    tradingArrangements: [{ person: "Example Director", role: "Director", action: "adoption" as const, date: "2026-06-15", shares: 100000, includesFutureAwards: true, expires: "2027-06-15", source }],
  });
}

describe("deterministic filing supplements", () => {
  it("shows the filing's amount, qualifier, period and derivation without relying on analyst prose", () => {
    const tables = filingDisclosureTables(disclosures(), "balanceSheet");
    const text = JSON.stringify(tables);
    expect(text).toContain("Example transaction total consideration");
    expect(text).toContain("approximately $20B");
    expect(text).toContain("paid plus payable");
    expect(text).toContain("quarter ended 2026-07-26");
    expect(text).toContain("22.0%");
    expect(text).not.toContain("edgar:10-Q");
  });

  it("puts the recorded facts, outlook and governance on Markdown, print and live surfaces", () => {
    const report = loadTask28Fixture();
    report.filingDisclosures = disclosures();
    for (const [surface, text] of [
      ["markdown", reportToMarkdown(report)],
      ["print", reportToPrintBody(report)],
      ["live", renderToStaticMarkup(createElement(ReportView, { report }))],
    ]) {
      for (const expected of ["Example transaction total consideration", "Direct customer A share of revenue", "We expect DSO to normalize next quarter.", "Example Officer", "Anticipated", "Example Director", "Rule 10b5-1", "future awards", "80.0%", "Cash payment"]) {
        expect(text, `${surface}: ${expected}`).toContain(expected);
      }
      expect(text, surface).toContain("Plan capacity is not an executed sale");
      expect(text, surface).toContain("2027-06-15");
    }
    const audit = reportToAuditMarkdown(report);
    expect(audit).toContain("Filing disclosure supplements (raw record)");
    expect(audit).toContain('"sourceTag": "edgar:10-Q notes"');
    expect(audit).toContain('"shares": 100000');
    expect(audit).toContain('"anticipated": true');
  });
});
