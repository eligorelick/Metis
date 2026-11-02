import { describe, expect, it } from "vitest";
import { buildMarketData } from "@/pipeline/marketData";
import { keyDataRows } from "@/report/presentation";
import { readerConventionText } from "@/report/readerConventions";
import type { Report } from "@/report/schema";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { loadTask28Fixture } from "./helpers/task28Report";

/**
 * Pre-run check for the FIGR Opus 5.5 extra-high run (2026-11-02): the stored
 * high-effort FIGR report re-rendered with the integrated code printed
 * "Provider enterprise value not applicable: Not applicable to a non-bank
 * lender: ..." and "21.28M shares (17.33% of float (derived using float
 * observed 2026-11-01))" in the key data. Both are read-time wording only.
 */
const LENDER = "Owner FCF, P/FCF, FCF yield, FCF conversion/growth and cash runway are not applicable: SIC 6163 places loan originations in operating activities. Source: https://www.sec.gov/Archives/edgar/data/2064124/figr-20260630.htm.";

describe("pre-run readability: no doubled or nested wording", () => {
  it("states a lender reason once after a 'not applicable' lead-in", () => {
    expect(readerConventionText(`Provider enterprise value not applicable: ${LENDER}`, "report.marketData.historicalEv.enterpriseValueNote"))
      .toBe("Provider enterprise value not applicable to a non-bank lender: loan funding is operating inventory finance (see Lender conventions).");
    // A reason without the lead-in keeps its own sentence.
    expect(readerConventionText(LENDER, "report.valuation.multiples.EV/EBITDA"))
      .toBe("Not applicable to a non-bank lender: loan funding is operating inventory finance (see Lender conventions).");
  });

  it("prints the short-interest float ratio without parentheses inside parentheses", () => {
    const b = completeCurrencyBundle({});
    const r: Report = loadTask28Fixture();
    r.marketData = buildMarketData(b)!;
    r.marketData.shares = { outstanding: 185672150, float: 122844222, freeFloatPct: null, asOf: "2026-11-01", floatAsOf: "2026-11-01" };
    r.marketData.shortInterest = { shares: 21284003, settlementDate: "2026-10-15", daysToCover: 4.71, changePct: 19.61, averageDailyVolume: 4520281 };
    const row = keyDataRows(r).find(x => x.label === "Short interest")!;
    expect(row.value).toBe("21.28M shares; 17.33% of float (derived using float observed 2026-11-01)");
    expect(row.value).not.toMatch(/\([^()]*\(/);
    expect(row.note).toContain("2026-10-15");
  });
});
