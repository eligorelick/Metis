import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportView } from "@/components/report/ReportView";
import { reportToAuditMarkdown, reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { filingDisclosureTables } from "@/report/filingDisclosurePresentation";
import { filingCommentaryOutlookTables, filingFactTables, filingGovernanceTables, type FilingSupplements } from "@/report/filingSupplementPresentation";
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
  it("does not turn absent optional records into claims about an issuer", () => {
    const absent = { currency: null };
    expect(filingFactTables(absent)).toEqual([]);
    expect(filingCommentaryOutlookTables(absent)).toEqual([]);
    expect(filingGovernanceTables(absent)).toEqual([]);
  });

  it("keeps days, shares and counts distinct and discloses an unrecorded measurement date", () => {
    const base = disclosures().filingFacts[0]!;
    const tables = filingFactTables({ currency: "USD", filingFacts: [
      { ...base, label: "Receivable days", value: 46.5, unit: "days", qualifier: null, computed: null, asOf: null, period: null },
      { ...base, label: "Shares subject to agreement", value: 123456, unit: "shares", qualifier: null, computed: null, asOf: null, period: null },
      { ...base, label: "Customer count", value: 3, unit: "count", qualifier: null, computed: null, asOf: null, period: null },
    ] });
    expect(tables[0]?.rows.map((r) => r.slice(0, 3))).toEqual([
      ["Receivable days", "46.5 days", "Not recorded"],
      ["Shares subject to agreement", "123,456 shares", "Not recorded"],
      ["Customer count", "3", "Not recorded"],
    ]);
  });

  it("distinguishes confirmed and scheduled appointments from anticipated changes", () => {
    const base = disclosures().officerChanges[0]!;
    const tables = filingGovernanceTables({ currency: "USD", officerChanges: [
      { ...base, kind: "appointment", board: true, anticipated: false, inEffect: true, effective: "2026-09-30", announced: null, note: null, package: [] },
      { ...base, kind: "appointment", anticipated: false, inEffect: false, effective: null, note: null, package: [] },
      { ...base, anticipated: true, effective: null },
    ] });
    expect(tables[0]?.rows[0]).toEqual(["Example Officer — EVP (board)", "Appointment", "Not recorded", "Effective 2026-09-30", "Not recorded", expect.any(String)]);
    expect(tables[0]?.rows[1]?.[3]).toBe("Scheduled date not recorded");
    expect(tables[0]?.rows[2]?.[3]).toBe("Anticipated date not recorded; effective status unconfirmed");
  });

  it("retains a negative pay vote and plan changes when share capacity or expiration is absent", () => {
    const base = disclosures();
    const changed: FilingSupplements = { currency: "USD", sayOnPay: { ...base.sayOnPay, approved: false, meetingDate: null, brokerNonVotes: 4 }, tradingArrangements: [
      { ...base.tradingArrangements[0]!, action: "modification", shares: null, includesFutureAwards: false, expires: null },
      { ...base.tradingArrangements[0]!, action: "termination", shares: 5000, includesFutureAwards: false },
    ] };
    const tables = filingGovernanceTables(changed);
    expect(tables[0]?.rows[0]?.slice(0, 2)).toEqual(["Not recorded", "Not approved"]);
    expect(tables[0]?.rows[0]?.[5]).toBe("4");
    expect(tables[1]?.rows[0]?.slice(1, 5)).toEqual(["Modified", "2026-06-15", "Count not stated", "Not recorded"]);
    expect(tables[1]?.rows[1]?.[1]).toBe("Terminated");
  });

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
