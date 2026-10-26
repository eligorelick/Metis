/**
 * Audit 2026-10-22 C-15: Southern Co. tags its noncontrolling interest on the
 * 10-K face (`MinorityInterest`) but in each 10-Q only as a dimensional fact
 * (`StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest`
 * on `StatementEquityComponentsAxis = NoncontrollingInterestMember`), which
 * companyfacts drops. The latest quarterly balance then had total equity
 * only, the NCI gate withheld the DCF and every EV and book multiple, and the
 * critical gap said "DCF inputs not provided by caller". The 10-Q's own
 * equity statement is now read for the NCI, and the gap names the gate.
 * The iXBRL below is synthetic, modelled on that filing's structure.
 */
import { describe, expect, it } from "vitest";

import { parseEquityStatementNci } from "@/edgar/equityStatementNci";
import { enrichFinancialFields } from "@/edgar/financialEnrichment";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { FmpBalanceSheetRow, FmpCashFlowRow, FmpPayload } from "@/providers/fmp";
import type { FetchResult } from "@/types/core";
import { runStageB } from "@/pipeline/compute";
import { currencyBundle, M } from "./helpers/currencyBundle";

const CIK = "0000092122";
const context = (id: string, instant: string, members: [string, string][] = [], cik = CIK) =>
  `<xbrli:context id="${id}"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">${cik}</xbrli:identifier>` +
  (members.length ? `<xbrli:segment>${members.map(([dim, member]) => `<xbrldi:explicitMember dimension="${dim}">${member}</xbrldi:explicitMember>`).join("")}</xbrli:segment>` : "") +
  `</xbrli:entity><xbrli:period><xbrli:instant>${instant}</xbrli:instant></xbrli:period></xbrli:context>`;
const fact = (contextRef: string, value: string, extra = "") =>
  `<ix:nonFraction name="us-gaap:StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest" contextRef="${contextRef}" unitRef="usd" decimals="-6" scale="6" format="ixt:num-dot-decimal"${extra}>${value}</ix:nonFraction>`;
const NCI = ["us-gaap:StatementEquityComponentsAxis", "us-gaap:NoncontrollingInterestMember"] as [string, string];
const SUBSIDIARY = ["dei:LegalEntityAxis", "so:AlabamaPowerMember"] as [string, string];

function filing(body: string): string {
  return `<html xmlns:ix="http://www.xbrl.org/2013/inlineXBRL"><body><ix:header><ix:resources>` +
    context("c-1", "2026-03-31") + context("c-2", "2026-03-31", [NCI]) + context("c-3", "2026-03-31", [SUBSIDIARY, NCI]) +
    context("c-4", "2026-06-30", [NCI]) + context("c-5", "2026-06-30") +
    `<xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit></ix:resources></ix:header>${body}</body></html>`;
}
const identity = { issuerId: CIK, form: "10-Q", accession: "0000092122-26-000054", filingDate: "2026-07-30" };
const statement = filing(`<table><tr><td>${fact("c-1", "39,912")}</td><td>${fact("c-2", "2,790")}</td><td>${fact("c-3", "15")}</td></tr>` +
  `<tr><td>${fact("c-5", "42,342")}</td><td>${fact("c-4", "2,772")}</td></tr></table>`);

const observedAt = "2026-10-13T12:00:00.000Z";
function sourced<T extends FmpBalanceSheetRow | FmpCashFlowRow>(rows: T[]): FetchResult<FmpPayload<T>> {
  return { ok: true, value: { data: { rows, raw: rows }, source: "fmp", asOf: "2026-03-31", endpoint: "fmp:statements", fetchedAt: observedAt } };
}
const noFacts: CompanyFacts = { cik: 92122, entityName: "Example", facts: { "us-gaap": {} } };

describe("NCI from the filing's equity statement (audit 2026-10-22 C-15)", () => {
  it("reads the issuer's NCI column and consolidated total, ignoring a subsidiary's", () => {
    const parsed = parseEquityStatementNci(statement, identity);
    expect(parsed.observations).toEqual([
      { end: "2026-03-31", currency: "USD", noncontrollingInterest: 2_790e6, totalEquity: 39_912e6 },
      { end: "2026-06-30", currency: "USD", noncontrollingInterest: 2_772e6, totalEquity: 42_342e6 },
    ]);
  });

  it("drops an instant whose NCI facts conflict", () => {
    const conflicting = filing(`${fact("c-1", "39,912")}${fact("c-2", "2,790")}${fact("c-2", "2,791")}`);
    expect(parseEquityStatementNci(conflicting, identity).observations).toEqual([]);
  });

  it("fills a quarterly row that has the consolidated total only, and says where the split came from", () => {
    const balance = sourced([{ date: "2026-03-31", reportedCurrency: "USD", totalEquity: 39_912e6 }]);
    const out = enrichFinancialFields(balance, sourced<FmpCashFlowRow>([]), noFacts, "quarter", observedAt, [], [], [parseEquityStatementNci(statement, identity)]);
    const row = out.balance.ok ? out.balance.value.data.rows[0]! : null;
    expect(row).toMatchObject({ minorityInterest: 2_790e6, totalStockholdersEquity: 37_122e6, totalEquity: 39_912e6 });
    expect(row?.fieldProvenance?.minorityInterest?.filings).toEqual([{ accn: "0000092122-26-000054", filed: "2026-07-30", form: "10-Q" }]);
    expect(row?.fieldProvenance?.totalStockholdersEquity?.calculation).toBe("total-equity-less-equity-statement-nci");
    const gap = out.gaps.find(g => g.field === "statements.balance.2026-03-31.minorityInterest");
    expect(gap?.severity).toBe("info");
    expect(gap?.reason).toContain("NoncontrollingInterestMember");
  });

  it("leaves the row alone when the filing's total does not match the row's total equity", () => {
    const balance = sourced([{ date: "2026-03-31", reportedCurrency: "USD", totalEquity: 40_500e6 }]);
    const out = enrichFinancialFields(balance, sourced<FmpCashFlowRow>([]), noFacts, "quarter", observedAt, [], [], [parseEquityStatementNci(statement, identity)]);
    const row = out.balance.ok ? out.balance.value.data.rows[0]! : null;
    expect(row?.minorityInterest ?? null).toBeNull();
    expect(out.gaps.find(g => g.field === "statements.balance.2026-03-31.minorityInterest")?.severity).toBe("warn");
  });

  it("does not override a row that already has its split", () => {
    const balance = sourced([{ date: "2026-03-31", reportedCurrency: "USD", totalEquity: 39_912e6, minorityInterest: 2_000e6, totalStockholdersEquity: 37_912e6 }]);
    const out = enrichFinancialFields(balance, sourced<FmpCashFlowRow>([]), noFacts, "quarter", observedAt, [], [], [parseEquityStatementNci(statement, identity)]);
    expect(out.balance.ok && out.balance.value.data.rows[0]).toMatchObject({ minorityInterest: 2_000e6 });
  });
});

describe("the NCI gate and its DCF gap (audit 2026-10-22 C-15)", () => {
  function consolidatedOnly(split: boolean) {
    const bundle = currencyBundle();
    for (const result of [bundle.statements.balanceAnnual, bundle.statements.balanceQuarterly]) {
      if (!result.ok) continue;
      for (const row of result.value.data.rows) {
        row.totalEquity = 500 * M;
        row.minorityInterest = split ? 20 * M : undefined;
        row.totalStockholdersEquity = split ? 480 * M : undefined;
        row.fieldProvenance = { ...row.fieldProvenance,
          totalEquity: { source: "edgar", unit: "USD", periodStart: null, periodEnd: String(row.date), observedAt, tags: ["us-gaap/StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"], filings: [] },
          ...(split ? { totalStockholdersEquity: { source: "edgar", unit: "USD", periodStart: null, periodEnd: String(row.date), observedAt, tags: ["us-gaap/StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"], filings: [], calculation: "total-equity-less-equity-statement-nci" as const } } : {}) };
      }
    }
    return runStageB(bundle);
  }

  it("names the unresolved NCI split in the critical DCF gap", () => {
    const result = consolidatedOnly(false);
    const critical = result.valuation.gaps.find(g => g.field === "valuation.dcf" && g.severity === "critical");
    expect(critical?.reason).toContain("noncontrolling ownership unresolved");
    expect(critical?.reason).not.toContain("not provided by caller");
  });

  it("clears the gate once the equity statement supplies the split", () => {
    const result = consolidatedOnly(true);
    expect(result.valuation.gaps.some(g => g.field === "valuation.dcf.noncontrollingOwnership")).toBe(false);
    expect(result.valuation.gaps.some(g => g.field === "valuation.dcf" && g.severity === "critical")).toBe(false);
  });
});
