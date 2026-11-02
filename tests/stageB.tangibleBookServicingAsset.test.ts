import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

function fixture() {
  const b = completeCurrencyBundle({});
  if (!b.profile.ok || !b.statements.balanceQuarterly.ok) throw new Error("fixture");
  Object.assign(b.profile.value.data.rows[0]!, { cik: "0000000042" });
  b.edgar.registrant = { cik10: "0000000042", name: "Example", tickers: [b.symbol], exchanges: ["NYSE"], sic: "3571", sicDescription: "Computers", fiscalYearEnd: "1231", stateOfIncorporation: "DE", forms: ["10-Q"] };
  Object.assign(b.statements.balanceQuarterly.value.data.rows[0]!, { reportedCurrency: "USD", goodwill: 0, intangibleAssets: 155_024_000 });
  b.edgar.tenQNotes = { ok: true, value: { source: "edgar", endpoint: "filing:notes", asOf: "2026-03-31", fetchedAt: b.builtAt,
    data: { sectionName: "tenQNotes", text: "Loan servicing assets are measured at fair value.",
      statementsText: "CONSOLIDATED BALANCE SHEETS (in thousands of U.S. dollars, except share and per share data) March 31, 2026 December 31, 2025 Assets: Cash 100,000 90,000 Loan servicing asset, at fair value 155,024 113,064 Total assets 2,000,000 1,900,000 Liabilities: Debt 50,000 40,000 Stockholders' equity: Total equity 520,000 500,000 CONSOLIDATED STATEMENTS OF OPERATIONS",
      method: "toc-anchor", chars: 48, accession: "0000000042-26-000001", form: "10-Q", filingDate: "2026-05-06", reportDate: "2026-03-31", documentUrl: "https://www.sec.gov/Archives/edgar/data/42/000000004226000001/quarter.htm" } } };
  return b;
}
const multiples = (b: ReturnType<typeof fixture>) => runStageB(b).valuation.multiples!.multiples;

describe("N2 tangible-book servicing-asset classification", () => {
  it("does not deduct a same-date filed fair-value financial asset misclassified by the vendor", () => {
    const b = fixture(); const before = JSON.stringify(b);
    const m = multiples(b);
    expect(m.find(r => r.key === "priceToTbv")?.current).toBe(m.find(r => r.key === "priceToBook")?.current);
    expect(m.find(r => r.key === "priceToTbv")?.basis).toMatch(/servicing asset.*155024000.*fair value.*not deducted/i);
    expect(JSON.stringify(b)).toBe(before);
  });

  it.each(["different amount", "different date", "foreign source", "wrong issuer", "filed goodwill", "filed intangible", "different currency"])("keeps the vendor deduction without sufficient proof: %s", name => {
    const b = fixture();
    if (!b.edgar.tenQNotes?.ok || !b.statements.balanceQuarterly.ok) throw new Error("fixture");
    const d = b.edgar.tenQNotes.value.data;
    if (name === "different amount") d.statementsText = d.statementsText!.replace("155,024", "150,000");
    if (name === "different date") d.reportDate = "2025-12-31";
    if (name === "foreign source") d.documentUrl = "https://example.com/quarter.htm";
    if (name === "wrong issuer") d.documentUrl = d.documentUrl.replace("/42/", "/99/");
    if (name === "filed goodwill") d.statementsText = d.statementsText!.replace("Total assets", "Goodwill 5,000 4,000 Total assets");
    if (name === "filed intangible") d.statementsText = d.statementsText!.replace("Total assets", "Intangible assets 5,000 4,000 Total assets");
    if (name === "different currency") d.statementsText = d.statementsText!.replace("in thousands of U.S. dollars", "in thousands of euros");
    const m = multiples(b);
    expect(m.find(r => r.key === "priceToTbv")?.current).toBeGreaterThan(m.find(r => r.key === "priceToBook")!.current!);
  });

  it("names the goodwill and vendor intangible amounts actually deducted", () => {
    const b = fixture(); b.edgar.tenQNotes = undefined;
    expect(multiples(b).find(r => r.key === "priceToTbv")?.basis).toMatch(/deducts goodwill 0.*intangibleAssets 155024000/);
  });
});
