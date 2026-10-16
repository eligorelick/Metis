import { describe, expect, it } from "vitest";
import { validateClaimNumericSupport } from "@/pipeline/stageC/claimEvidence";
import { runVerifyPass, type PassDeps } from "@/pipeline/stageC/passes";
import type { ContextPayload, TextExcerpt } from "@/pipeline/stageC/payload";

// Exact flattened liquidity table from CRWV report36's frozen 10-Q Item2.
const table = "The following table summarizes our principal sources of liquidity for the periods presented (in millions): June 30, 2026 December 31, 2025 Cash and cash equivalents $ 5,524 $ 3,127 Marketable securities 15 34 Availability under existing facilities(1) 10,014 3,701 Total liquidity $ 15,553 $ 6,862";
const excerpt: TextExcerpt = { title: "10-Q Item 2 — MD&A, period ended 2026-06-30", source: "edgar:10-Q item2", asOf: "2026-06-30", text: table, originalChars: table.length, truncated: false };
const claim = "Total liquidity as of 2026-06-30 was USD 15.55 billion.";
function check(text = claim, sourceText = table) {
  return validateClaimNumericSupport({ label: "FACT", text, source: excerpt.source, asOf: excerpt.asOf },
    { excerpts: [{ ...excerpt, text: sourceText }], sourceId: excerpt.source, reportingCurrency: "USD" });
}

describe("table scale immediately before explicit date columns", () => {
  it("reads CRWV's exact preceding million declaration at the bound column and retains source offsets", () => {
    const result = check();
    expect(result.status).toBe("validated");
    expect(result.spans[0]?.text).toBe("Total liquidity $ 15,553");
    expect(table.slice(result.spans[0]!.start, result.spans[0]!.end)).toBe(result.spans[0]!.text);
    expect(check("Total liquidity as of 2026-06-30 was USD 15,553 million.").status).toBe("validated");
    expect(check("Total liquidity as of 2025-12-31 was USD 6,862 million.").status).toBe("validated");
  });

  it("reverifies both original report36 claim forms without changing the supplied payload or report", async () => {
    const payload = { symbol: "CRWV", companyName: "CoreWeave", filings: [excerpt], citationRegistry: [{ id: excerpt.source, kind: "payload-text", origin: excerpt.source, asOf: excerpt.asOf }], provenanceRegistry: [
      { id: "payload.statements.currency", currency: "USD" },
    ] } as unknown as ContextPayload;
    const report = { balanceSheet: { coverage: { numbers: [{ value: 15553, verified: false, currency: "USD", unit: "USD millions: Total liquidity", source: excerpt.source, asOf: excerpt.asOf, period: "June 30, 2026" }],
      commentary: [{ label: "FACT", text: claim, source: excerpt.source, asOf: excerpt.asOf }] } } };
    const raw = JSON.stringify({ payload, report });
    const result = await runVerifyPass({} as PassDeps, payload, report);
    expect(result.log.find((entry) => entry.path === "balanceSheet.coverage.numbers[0]"), JSON.stringify(result.log)).toMatchObject({ validationStatus: "validated" });
    expect(result.log.find((entry) => entry.path === "balanceSheet.coverage.commentary[0]")).toMatchObject({ numericSupportStatus: "validated" });
    expect(JSON.stringify({ payload, report })).toBe(raw);
  });

  it("retains genuine wrong scale, amount, currency, date and column controls", () => {
    expect(check("Total liquidity as of 2026-06-30 was USD 15.55 million.").status).toBe("contradicted");
    expect(check("Total liquidity as of 2026-06-30 was USD 6.862 billion.").status).toBe("contradicted");
    expect(check("Total liquidity as of 2026-06-30 was EUR 15.55 billion.").reason).toBe("currency-mismatch");
    expect(check("Total liquidity as of 2026-03-31 was USD 15.55 billion.").status).not.toBe("validated");
    expect(check("Total liquidity as of 2025-12-31 was USD 15.55 billion.").status).toBe("contradicted");
  });

  it("binds only an adjacent declaration and never borrows an earlier table's units", () => {
    const prior = "Other assets (in billions): June 30, 2026 December 31, 2025 Other assets $ 1 $ 2. ";
    expect(check(claim, prior + table).status).toBe("validated");
    const unscaled = "Other assets (in millions): June 30, 2026 December 31, 2025 Other assets $ 1 $ 2. " +
      "Liquidity table June 30, 2026 December 31, 2025 Total liquidity $ 15,553 $ 6,862";
    expect(check(claim, unscaled).status).not.toBe("validated");
    const separate = table.replace("(in millions):", "(in millions): Another table follows.");
    expect(check(claim, separate).status).not.toBe("validated");
  });

  it("keeps identical raw cells from differently scaled adjacent tables ambiguous in either order", () => {
    const millions = "Liquidity (in millions): June 30, 2026 December 31, 2025 Total liquidity $ 15,553 $ 6,862. ";
    const billions = millions.replace("(in millions)", "(in billions)");
    expect(check(claim, millions + billions).status).toBe("unchecked");
    expect(check(claim, billions + millions).status).toBe("unchecked");
  });

  it("does not admit unsupported currency or unit qualifiers in a preceding declaration", () => {
    expect(check(claim, table.replace("(in millions)", "(in millions, EUR amounts)")).status).toBe("unchecked");
    expect(check(claim, table.replace(/\$/g, "€")).reason).toBe("currency-mismatch");
  });
  it("keeps contradictory scale declarations unchecked instead of selecting whichever appears last", () => {
    expect(check(claim, table.replace("(in millions):", "(in billions) (in millions):")).status).toBe("unchecked");
    expect(check(claim, table.replace("December 31, 2025", "December 31, 2025 (in thousands)")).status).toBe("unchecked");
  });
});
