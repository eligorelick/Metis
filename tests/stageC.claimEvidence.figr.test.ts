import { describe, expect, it } from "vitest";
import { validateClaimNumericSupport } from "@/pipeline/stageC/claimEvidence";
import type { NumericProvenanceRecord } from "@/pipeline/stageC/provenance";
import records from "./fixtures/r5-figr-verifier-records.json";
import { runVerifyPass, type PassDeps } from "@/pipeline/stageC/passes";
import type { ContextPayload } from "@/pipeline/stageC/payload";

const cited = (id: string): NumericProvenanceRecord => {
  const record = records.find(record => record.id === id);
  if (!record) throw new Error(`Missing frozen FIGR record ${id}`);
  return record as NumericProvenanceRecord;
};
const check = (text: string, record: NumericProvenanceRecord) => validateClaimNumericSupport(
  { label: "FACT", text, source: record.id, asOf: record.asOf },
  { record, excerpts: [], sourceId: record.id, reportingCurrency: "USD" });

describe("R5 FIGR typed record false negatives", () => {
  const moat = cited("computed.deterministic-aspect-scores.moat-score");
  it("matches a score with its correct house grade annotation", () => {
    expect(check("The moat score was 30.12 out of 100 (grade F).", moat).status).toBe("validated");
  });
  it.each([
    "The moat score was 31.12 out of 100 (grade F).",
    "The moat score was 30.12 out of 100 (grade A).",
    "The quality score was 30.12 out of 100 (grade F).",
    "The moat score for FY2025 was 30.12 out of 100 (grade F).",
    "The moat score was 30.12% (grade F).",
    "The moat score was 30.12 out of 100, inside the neutral F band.",
  ])("keeps wrong score metadata unvalidated: %s", text => {
    expect(check(text, moat).status).not.toBe("validated");
  });

  const completeness = cited("computed.deterministic-aspect-scores.moat-evidence-completeness");
  it("reads a bare dimensionless fraction only from explicit fraction provenance", () => {
    expect(check("Moat evidence completeness was 0.75.", completeness).status).toBe("validated");
    expect(check("Moat evidence completeness was 75%.", completeness).status).toBe("validated");
  });
  it.each([
    "Moat evidence completeness was 0.65.",
    "Quality evidence completeness was 0.75.",
    "Moat evidence completeness for FY2025 was 0.75.",
    "Moat evidence completeness was 75.",
    "Moat evidence completeness was 0.75x.",
    "Moat evidence completeness was 0.75, so no quantitative moat score exists.",
  ])("keeps the fraction's value, identity and unit: %s", text => {
    expect(check(text, completeness).status).not.toBe("validated");
  });
  it("does not infer a bare ratio without fraction metadata", () => {
    expect(check("Moat evidence completeness was 0.75.", { ...completeness, unitScale: undefined }).status).not.toBe("validated");
  });
  it("keeps the real zero-completeness explanation and composite neutral band", () => {
    expect(check("Valuation evidence completeness was 0, so no quantitative valuation score exists. In our judgment the neutral D band is the appropriate default.",
      cited("computed.deterministic-aspect-scores.valuation-evidence-completeness")).status).toBe("validated");
    expect(check("The composite score was 53.46 out of 100, inside the neutral D band.", cited("computed.deterministic-aspect-scores.composite-score")).status).toBe("validated");
  });

  const tax = cited("payload.statements.income-statement-quarterly.2026-06-30.income-tax-expense");
  it("matches negative tax expense described as a benefit", () => {
    expect(check("Income tax expense for the quarter ended 2026-06-30 was USD -4.45 million, a benefit.", tax).status).toBe("validated");
  });
  it.each([
    "Income tax expense for the quarter ended 2026-06-30 was USD 4.45 million, a benefit.",
    "Income tax expense for the quarter ended 2026-03-31 was USD -4.45 million, a benefit.",
    "Interest expense for the quarter ended 2026-06-30 was USD -4.45 million, a benefit.",
    "Income tax expense for the quarter ended 2026-06-30 was EUR -4.45 million, a benefit.",
  ])("does not hide an incorrect tax claim: %s", text => {
    expect(check(text, tax).status).not.toBe("validated");
  });

  it.each([
    ["payload.statements.cash-flow-annual.2025-12-31.capex-negative", "Capital expenditure for FY2025 was USD -20.65 million (cash outflow)."],
    ["payload.statements.cash-flow-quarterly.2026-03-31.buybacks-negative", "Buybacks for the quarter ended 2026-03-31 were USD -9.70 million (cash outflow)."],
    ["payload.statements.cash-flow-quarterly.2026-06-30.buybacks-negative", "Buybacks for the quarter ended 2026-06-30 were USD 0."],
  ])("matches signed cash flow without requiring the label's sign legend: %s", (id, text) => {
    const record = cited(id);
    expect(check(text, record).status).toBe("validated");
    expect(check(text.replace(/FY2025|2026-03-31|2026-06-30/, "FY2024"), record).status).not.toBe("validated");
    expect(check(text.replace(/Capital expenditure|Buybacks/, "Dividends"), record).status).not.toBe("validated");
    expect(check(text.replace(/-20.65|-9.70|USD 0/, "USD 12.34"), record).status).not.toBe("validated");
  });
  it("retains cash-flow sign and inflow/outflow meaning", () => {
    const rec = cited("payload.statements.cash-flow-quarterly.2026-03-31.buybacks-negative");
    // D-187 revises D-160: an outflow amount may use its positive magnitude.
    expect(check("Buybacks for the quarter ended 2026-03-31 were USD 9.70 million (cash outflow).", rec).status).toBe("validated");
    expect(check("Buybacks for the quarter ended 2026-03-31 were USD -9.70 million (cash inflow).", rec).status).not.toBe("validated");
  });

  const piotroski = records.find(record => record.origin === "computed.forensics.piotroski") as NumericProvenanceRecord;
  const financialScore = "The financial-variant Piotroski score was 3, measured on the 5 of 9 signals that can be evaluated for this lender.";
  it("binds Piotroski coverage counts to the producer's declared financial variant", () => {
    expect(check(financialScore, piotroski).status).toBe("validated");
  });
  it.each([
    financialScore.replace("was 3", "was 4"),
    financialScore.replace("5 of 9", "6 of 9"),
    financialScore.replace("5 of 9", "5 of 8"),
    financialScore.replace("financial-variant", "industrial-variant"),
    financialScore.replace("Piotroski", "Altman"),
    financialScore.replace("was 3", "for FY2024 was 3"),
  ])("never treats arbitrary Piotroski quantities as annotations: %s", text => {
    expect(check(text, piotroski).status).not.toBe("validated");
  });
});

describe("R5 FIGR sweep: producer-owned names and intervals", () => {
  it.each([
    ["computed.valuation.pettm-current", "The trailing price-to-earnings multiple was 24.3x."],
    ["computed.valuation.pricetobook-current", "Price to book was 3.4x."],
    ["computed.capital-cash.capex-revenue-latest", "Capex as a share of revenue was 4.1% in FY2025."],
    ["payload.estimates.price-target-consensus", "The provider consensus price target was USD 50.00 per share. It is shown for context only; we have no model value to reconcile it against."],
    ["payload.filing-facts.combined-cash-including-restrictions-reported-as-of-2026-06-30", "Combined cash including restrictions was USD 1.53 billion at 2026-06-30. Restricted cash is not all available liquidity."],
    ["computed.technicals.relative-strength-vs-spy-12-1-month-latest-month-skipped", "Relative strength versus SPY over 12 months skipping the latest month was -41.2 percentage points."],
    ["payload.insiders.insider-sale-transactions-form-4-code-s-four-calendar-quarters-ended-2026-09-30", "Insiders made 104 sale transactions in the four calendar quarters ended 2026-09-30."],
    ["payload.insiders.insider-purchase-transactions-form-4-code-p-four-calendar-quarters-ended-2026-09-30", "Insiders made 1 purchase transaction in the four calendar quarters ended 2026-09-30."],
    ["payload.insiders.mspr-2026-10", "The monthly insider sentiment index for 2026-10 was -100."],
    ["payload.insiders.insider-shares-disposed-all-reported-dispositions-incl-open-market-sales-tax-withholding-and-gifts-four-calendar-quarters-ended-2026-09-30", "Insiders disposed of 9,787,254 shares in the four calendar quarters ended 2026-09-30, a total that includes open-market sales, tax withholding and gifts."],
    ["computed.comparable-peers.market-cap-ttm-common-earnings-eligible-peer-count-after-filtering", "Market cap to TTM common earnings eligible peer count after filtering was 0, so no peer median exists."],
  ])("matches the cited producer's equivalent name: %s", (id, text) => {
    const record = cited(id);
    expect(check(text, record).status).toBe("validated");
    expect(check(text, { ...record, value: record.value + Math.abs(record.value) * 0.2 + 100 }).status).not.toBe("validated");
    expect(check(text.replace(/Price|price|Capex|cash|strength|sale|purchase|sentiment|earnings|disposed/, "unrelated"), record).status).not.toBe("validated");
    expect(check(`For FY2024, ${text}`, record).status).not.toBe("validated");
  });
  it("does not drop disposition categories from the insider total", () => {
    const record = cited("payload.insiders.insider-shares-disposed-all-reported-dispositions-incl-open-market-sales-tax-withholding-and-gifts-four-calendar-quarters-ended-2026-09-30");
    expect(check("Insiders disposed of 9,787,254 shares in the four calendar quarters ended 2026-09-30, a total that includes open-market sales and gifts.", record).status).not.toBe("validated");
    expect(check("Insiders sold 9,787,254 shares in the four calendar quarters ended 2026-09-30.", record).status).not.toBe("validated");
  });
  it.each([
    ["computed.valuation.pettm-current", "The forward price-to-earnings multiple was 24.3x."],
    ["computed.valuation.pricetobook-current", "Book to price was 3.4x."],
    ["computed.capital-cash.capex-revenue-latest", "Revenue as a share of capex was 4.1% in FY2025."],
    ["payload.filing-facts.combined-cash-including-restrictions-reported-as-of-2026-06-30", "Cash excluding restrictions was USD 1.53 billion at 2026-06-30."],
    ["computed.technicals.relative-strength-vs-spy-12-1-month-latest-month-skipped", "Relative strength versus SPY over 12 months including the latest month was -41.2 percentage points."],
    ["payload.insiders.mspr-2026-10", "The monthly insider sentiment index for 2026-09 was -100."],
  ])("does not erase a definition in an alias: %s", (id, text) => {
    expect(check(text, cited(id)).status).not.toBe("validated");
  });
  it.each([
    ["computed.current-capital.operating-cash-flow", "2025-07-01 to 2026-06-30"],
    ["payload.insiders.insider-sale-transactions-form-4-code-s-four-calendar-quarters-ended-2026-09-30", "2025-10-01 to 2026-09-30"],
  ])("accepts only the complete ordered registered interval on a traced figure: %s", async (id, period) => {
    const record = cited(id);
    const payload = { provenanceRegistry: [record], citationRegistry: [], filings: [] } as unknown as ContextPayload;
    const verify = async (window: string) => {
      const result = await runVerifyPass({} as PassDeps, payload, { number: { value: record.value, unit: record.unit, currency: record.currency,
        period: window, source: id, asOf: record.asOf, verified: null } });
      return result.verifiedReport.number.verified;
    };
    expect(await verify(period)).toBe(true);
    expect(await verify(period.split(" to ").reverse().join(" to "))).toBe(false);
    expect(await verify(period.replace("2025-", "2024-"))).toBe(false);
    expect(await verify(period.replace("2026-", "2027-"))).toBe(false);
  });
});
