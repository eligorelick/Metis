/**
 * NVIDIA's FY2026 10-K moved its marketable securities line from
 * `MarketableSecuritiesCurrent` to `DebtSecuritiesCurrent` (39.065B at
 * 2026-01-25, 34.143B at 2026-07-26). The keyless statements read only the
 * older tags, so cash and short-term investments fell to cash alone and net
 * debt and invested capital moved by the whole securities balance.
 */
import { describe, expect, it } from "vitest";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import type { CompanyFacts } from "@/edgar/xbrl";
import { resolveNetDebt } from "@/pipeline/stageB/netDebt";

type Points = Record<string, { end: string; value: number }[]>;
function build(points: Points) {
  const facts = { cik: 1, entityName: "Ordinary issuer", facts: { "us-gaap": Object.fromEntries(Object.entries(points).map(([tag, rows]) =>
    [tag, { units: { USD: rows.map(({ end, value }) => ({ val: value, end, filed: new Date(Date.parse(`${end}T00:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10), form: "10-K", fp: "FY",
      fy: Number(end.slice(0, 4)), accn: `0000000001-${end.slice(2, 4)}-000001` })) } }])) } } as unknown as CompanyFacts;
  return buildStatementsFromCompanyFacts(facts, { symbol: "TEST", cik: "0000000001", asOf: "2026-10-16", annualPeriods: 2, quarterlyPeriods: 0,
    vendorSplits: { status: "retrieved", source: "test", events: [], coverage: [{ from: "2020-01-01", to: "2026-10-16" }] } });
}

const older = "2025-01-26", newer = "2026-01-25";
const base: Points = {
  Assets: [{ end: older, value: 111_601 }, { end: newer, value: 206_803 }],
  LongTermDebtNoncurrent: [{ end: older, value: 7_469 }, { end: newer, value: 7_469 }],
  CashAndCashEquivalentsAtCarryingValue: [{ end: older, value: 8_589 }, { end: newer, value: 10_605 }],
};

describe("current debt securities tagged DebtSecuritiesCurrent", () => {
  it("counts them in cash and short-term investments, period by period", () => {
    const rows = build({ ...base, MarketableSecuritiesCurrent: [{ end: older, value: 34_621 }], DebtSecuritiesCurrent: [{ end: newer, value: 39_065 }] })
      .balanceAnnual.rows;
    const at = (end: string) => rows.find((row) => row.date === end)!;
    expect(at(newer)).toMatchObject({ shortTermInvestments: 39_065, cashAndShortTermInvestments: 10_605 + 39_065 });
    // The house net debt (Stage B) nets cash and short-term investments.
    expect(resolveNetDebt(at(newer))).toMatchObject({ value: 7_469 - (10_605 + 39_065) });
    expect(at(newer).fieldProvenance?.shortTermInvestments?.tags).toEqual(["us-gaap/DebtSecuritiesCurrent"]);
    expect(at(older)).toMatchObject({ shortTermInvestments: 34_621, cashAndShortTermInvestments: 8_589 + 34_621 });
  });

  it("leaves a period that tags an earlier short-term investment element on that element", () => {
    const row = build({ ...base, MarketableSecuritiesCurrent: [{ end: newer, value: 39_065 }], DebtSecuritiesCurrent: [{ end: newer, value: 41_000 }] })
      .balanceAnnual.rows.find((r) => r.date === newer)!;
    expect(row.shortTermInvestments).toBe(39_065);
    expect(row.fieldProvenance?.shortTermInvestments?.tags).toEqual(["us-gaap/MarketableSecuritiesCurrent"]);
  });
});
