import { describe, expect, it } from "vitest";
import { validateClaimNumericSupport } from "@/pipeline/stageC/claimEvidence";
import type { NumericProvenanceRecord } from "@/pipeline/stageC/provenance";

const record = (fields: Partial<NumericProvenanceRecord>): NumericProvenanceRecord => ({
  id: "computed.test", label: "test", kind: "computed", value: 12.34, unit: "currency-per-share", currency: "USD",
  period: null, asOf: "2026-11-03", origin: "computed.test", formulaVersion: "stage-b-v1", displayPrecision: 4, ...fields,
});
const check = (text: string, rec: NumericProvenanceRecord) => validateClaimNumericSupport(
  { label: "ESTIMATE", text, source: rec.id, asOf: rec.asOf },
  { record: rec, excerpts: [], sourceId: rec.id, reportingCurrency: "USD" });
const projection = (metric: string, unit: NumericProvenanceRecord["unit"], scenario = "weighted") => record({
  id: `computed.weighted-projections.${metric.toLowerCase()}-${scenario}-12m-ending-2027-09-30`,
  label: `${metric} ${scenario} 12M ending 2027-09-30`, origin: `computed.projections.${metric}.${scenario}`,
  value: unit === "currency" ? 12.34e9 : 12.34, unit, currency: unit === "percent" ? null : "USD", period: "12M ending 2027-09-30",
});
const dcf = record({ id: "computed.valuation.dcf-per-share", label: "DCF per share", origin: "computed.valuation.dcf" });
const price = record({ id: "payload.quote.price", label: "price", kind: "provider", origin: "fmp:quote", formulaVersion: null });
const reverse = record({ id: "computed.valuation.reverse-dcf-implied-revenue-growth", label: "reverse-DCF implied revenue growth",
  origin: "computed.valuation.reverseDcf", unit: "percent", currency: null });

const cases = [
  ["ADS quote", price, "The ADS price was USD 12.34 per share.", "ADS price", "ADS dividend"],
  ["DCF base case", dcf, "Our DCF base-case value is USD 12.34 per share.", "base-case", "bull-case"],
  ["reverse DCF TTM", reverse, "The reverse DCF implies year-one revenue growth over TTM of 12.34%.", "revenue", "earnings"],
  ["reverse DCF trailing revenue", reverse, "The reverse DCF implies year-one revenue growth over trailing twelve-month revenue of 12.34%.", "revenue growth", "margin"],
  ["weighted revenue", projection("revenue", "currency"), "Weighted projected revenue for the 12 months ending 2027-09-30 is USD 12.34 billion.", "revenue", "income"],
  ["weighted revenue modeled", projection("revenue", "currency"), "Weighted revenue for the 12 months ending 2027-09-30 is modeled at USD 12.34 billion.", "revenue", "income"],
  ["weighted operating margin", projection("operatingMargin", "percent"), "Weighted projected operating margin for the 12 months ending 2027-09-30 is 12.34%.", "operating", "gross"],
  ["weighted operating EPS", projection("epsDiluted", "currency-per-share"), "Weighted projected operating EPS for the 12 months ending 2027-09-30 is USD 12.34 per share.", "operating", "reported diluted"],
  ["weighted unlevered FCF", projection("fcf", "currency"), "Weighted projected unlevered free cash flow for the 12 months ending 2027-09-30 is USD 12.34 billion.", "unlevered", "levered"],
  ["bull revenue", projection("revenue", "currency", "bull"), "Bull-case projected revenue for the 12 months ending 2027-09-30 is USD 12.34 billion.", "Bull", "Bear"],
  ["bear revenue", projection("revenue", "currency", "bear"), "Bear-case projected revenue for the 12 months ending 2027-09-30 is USD 12.34 billion.", "Bear", "Bull"],
  ["EV/EBITDA", record({ id:"computed.valuation.evtoebitda-current", label:"evToEbitda (current)", origin:"computed.valuation.multiples.evToEbitda", unit:"ratio", currency:null }), "EV/EBITDA is 12.34x.", "EBITDA", "revenue"],
  ["settled close", record({ id:"computed.technicals.last-close", label:"last close", origin:"computed.technicals" }), "The last settled close was USD 12.34 per share.", "close", "dividend"],
  ["five-year share change", record({ id:"computed.capital-cash.weighted-average-diluted-common-share-change-5y-total", label:"weighted-average diluted common-share change (5y total)", origin:"computed.capital.shareCount", unit:"percent", currency:null }), "Weighted-average diluted share change over five years was 12.34%.", "diluted", "basic"],
  ["TTM standardized FCF", record({ id:"computed.current-capital.standardized-fcf", label:"standardized fcf", origin:"computed.capital.current.cashBridge.standardizedFcf", value:12.34e9, unit:"currency", period:"ttm: 2025-10-01 to 2026-09-30" }), "Standardized free cash flow for the twelve months to 2026-09-30 was USD 12.34 billion.", "free cash flow", "net income"],
  ["TTM after SBC FCF", record({ id:"computed.current-capital.after-sbc-standardized-fcf", label:"after sbc standardized fcf", origin:"computed.capital.current.cashBridge.afterSbcStandardizedFcf", value:12.34e9, unit:"currency", period:"ttm: 2025-10-01 to 2026-09-30" }), "Standardized free cash flow after stock compensation for the twelve months to 2026-09-30 was USD 12.34 billion.", "after", "before"],
] as const;

describe("D-187 producer-bound headline readings", () => {
  it.each(cases)("binds %s", (_name, rec, text) => {
    expect(check(text, rec).status).toBe("validated");
  });
  it.each(cases)("retains value, period, metric, currency and share basis for %s", (_name, rec, text, metric, wrongMetric) => {
    expect(check(text.replace("12.34", "23.45"), rec).status).not.toBe("validated");
    const wrongPeriod = text.includes("2027-09-30") ? text.replace("2027-09-30", "2028-09-30") : `For FY2024, ${text}`;
    expect(check(wrongPeriod, rec).status).not.toBe("validated");
    expect(check(text.replace(metric, wrongMetric), rec).status).not.toBe("validated");
    const wrongCurrency = text.includes("USD") ? text.replace("USD", "EUR") : text.replace("12.34", "EUR 12.34");
    expect(check(wrongCurrency, rec).status).not.toBe("validated");
    const wrongBasis = text.includes("per share") ? text.replace("per share", "in total") : text.replace(/billion|%|x\./, match => `${match.replace(".", "")} per share.`);
    expect(check(wrongBasis, rec).status).not.toBe("validated");
    expect(check(text, { ...rec, origin: "computed.unrelated", id: "computed.unrelated" }).status).not.toBe("validated");
  });
  it.each(["year-two", "year-five"])("does not change the reverse DCF horizon to %s", horizon => {
    expect(check(`The reverse DCF implies ${horizon} revenue growth over TTM of 12.34%.`, reverse).status).not.toBe("validated");
  });
  it.each(["last quarter", "prior fiscal year", "trailing six-month revenue"])("does not change the reverse DCF baseline to %s", basis => {
    expect(check(`The reverse DCF implies year-one revenue growth over ${basis} of 12.34%.`, reverse).status).not.toBe("validated");
  });
  it("retains single-record ambiguity and operating EPS definition", () => {
    expect(check("Our DCF base-case value is USD 12.34 per share against a quote of USD 20.00 per share.", dcf).status).toBe("unchecked");
    expect(check("Weighted projected reported diluted EPS for the 12 months ending 2027-09-30 is USD 12.34 per share.", projection("epsDiluted", "currency-per-share")).status).not.toBe("validated");
    expect(check("Weighted projected free cash flow for the previous quarter is USD 12.34 billion.", projection("fcf", "currency")).status).not.toBe("validated");
  });
  it("retains the five-year total share-change definition", () => {
    const rec=cases.find(([name])=>name === "five-year share change")![1];
    for (const phrase of ["over four years", "per year over five years", "over five years annualized"])
      expect(check(`Weighted-average diluted share change ${phrase} was 12.34%.`,rec).status).not.toBe("validated");
  });
});

describe("D-187 house grade annotations", () => {
  const score=record({ id:"computed.deterministic-aspect-scores.quality-score", label:"quality score", origin:"computed.scores.quality", value:78.51, unit:"score", currency:null });
  it.each([", grade B", ", in band B"])("checks the printed grade before ignoring %s", annotation => {
    expect(check(`The quality score is 78.51 out of 100${annotation}.`,score).status).toBe("validated");
    expect(check(`The quality score is 78.51 out of 100${annotation.replace("B","A")}.`,score).status).not.toBe("validated");
    expect(check(`The quality score is 77.51 out of 100${annotation}.`,score).status).not.toBe("validated");
    expect(check(`The moat score is 78.51 out of 100${annotation}.`,score).status).not.toBe("validated");
    expect(check(`For FY2024, the quality score is 78.51 out of 100${annotation}.`,score).status).not.toBe("validated");
    expect(check(`The quality score is USD 78.51 per share${annotation}.`,score).status).not.toBe("validated");
  });
});

describe("D-189 plain headline wording stays producer-bound", () => {
  const score = (aspect: string, value = 85.33) => record({ id: `computed.deterministic-aspect-scores.${aspect.toLowerCase()}-score`,
    label: `${aspect} score`, origin: `computed.scores.${aspect}`, value, unit: "score", currency: null });
  const tbv = record({ id: "computed.valuation.pricetotbv-current", label: "priceToTbv (current)", origin: "computed.valuation.multiples.priceToTbv", value: 3.1, unit: "ratio", currency: null });
  const rote = record({ id: "computed.valuation.rote-the-return-p-tbv-is-read-against", label: "ROTE (the return P/TBV is read against)",
    origin: "computed.returns.rote", value: 20.7, unit: "percent", currency: null, asOf: "2025-12-31", fiscalPeriod: "FY2025" });
  const pe = record({ id: "computed.valuation.p-e-current-fy2025", label: "P/E (current, FY2025)", origin: "computed.valuation.multiples.peTtm",
    value: 16.9, unit: "ratio", currency: null, period: "FY2025", fiscalPeriod: "FY2025" });
  const er = record({ id: "computed.valuation.excess-return-per-share", label: "excess-return per share", origin: "computed.valuation.excessReturn", value: 222.78, asOf: "2025-12-31" });
  const eps = record({ id: "payload.estimates.est-eps-2026-12-31", label: "est EPS 2026-12-31", origin: "fmp:analyst-estimates",
    kind: "provider", value: 24.69, period: "2026-12-31" });
  const beneish = record({ id: "computed.forensics.beneish-m", label: "Beneish M", origin: "computed.forensics.beneish", value: -3.01, unit: "score", currency: null });
  const rsi = record({ id: "computed.technicals.rsi-14", label: "RSI-14", origin: "computed.technicals.rsi14", unit: "index", currency: null, value: 31.72 });
  const insider = record({ id: "payload.insiders.insider-sale-transactions-form-4-code-s-four-calendar-quarters-ended-2026-09-30", label: "insider sale transactions (Form 4 code S), four calendar quarters ended 2026-09-30",
    origin: "fmp:insider-statistics", kind: "provider", unit: "count", currency: null, value: 43, period: "2026-09-30" });
  const headlines = [
    [tbv, "Current price to tangible book value was 3.1 times.", "3.1", "tangible book value", "earnings"],
    [rote, "Return on tangible common equity for FY2025 was 20.7%.", "20.7", "tangible common equity", "assets"],
    [pe, "Price to earnings on FY2025 diluted EPS was 16.9 times.", "16.9", "diluted", "basic"],
    [er, "Our excess-return value was USD 222.78 per share at 2025-12-31.", "222.78", "excess-return", "DCF"],
    [eps, "Provider estimated EPS was USD 24.69 per share for 2026-12-31.", "24.69", "EPS", "revenue"],
    [beneish, "The Beneish M score was -3.01, read as unlikely manipulation.", "-3.01", "Beneish", "Piotroski"],
    [{ ...beneish, asOf: "2025-12-31", fiscalPeriod: "FY2025" }, "The Beneish M-score for fiscal 2025 was -3.01.", "-3.01", "Beneish", "Piotroski"],
    [rsi, "RSI-14 was 31.72 on 2026-11-03.", "31.72", "RSI-14", "RSI-7"],
    [insider, "There were 43 insider sale transactions (Form 4 code S) in the four calendar quarters ended 2026-09-30.", "43", "sale", "purchase"],
    [projection("revenue", "currency"), "The fixed-prior weighted revenue for the 12 months to 2027-09-30 is USD 12.34 billion.", "12.34", "revenue", "income"],
  ] as const;
  it.each(["fundamentals", "valuation", "technicals", "quality", "leadership", "moat", "balanceSheet"])("reads a bare %s score only from its score producer", aspect => {
    const rec = score(aspect), text = `The ${aspect === "balanceSheet" ? "balance-sheet" : aspect} score is 85.33 (grade A).`;
    expect(check(text, rec).status).toBe("validated");
    for (const wrong of [text.replace("85.33", "65.33"), text.replace("grade A", "grade B"),
      text.replace("score", "margin"), text.replace("85.33", "USD 85.33"), text.replace("85.33", "85.33 per share"),
      `For FY2024, ${text}`]) expect(check(wrong, rec).status, wrong).not.toBe("validated");
    expect(check(text, { ...rec, id: "computed.unrelated", origin: "computed.unrelated" }).status).not.toBe("validated");
    expect(check(text, { ...rec, label: "different score" }).status).not.toBe("validated");
  });
  it.each(headlines)("binds the exact producer for %j", (rec, text, value, metric, wrongMetric) => {
    expect(check(text, rec), text).toMatchObject({ status: "validated" });
    for (const wrong of [text.replace(value, "999.99"), text.replace(metric, wrongMetric),
      text.includes("USD") ? text.replace("USD", "EUR") : text.replace(value, `EUR ${value}`),
      text.includes("per share") ? text.replace("per share", "in total") : text.replace(value, `${value} per share`),
      text.includes("2025") ? text.replace("2025", "2024") : text.includes("2026-12-31") ? text.replace("2026-12-31", "2027-12-31") : `For FY2024, ${text}`])
      expect(check(wrong, rec).status, wrong).not.toBe("validated");
    expect(check(text, { ...rec, id: "computed.unrelated", origin: "computed.unrelated" }).status).not.toBe("validated");
    expect(check(text, { ...rec, label: "unrelated metric" }).status).not.toBe("validated");
  });
  it("does not bind a second score or a completeness assertion to the score", () => {
    expect(check("The moat score is 85.33 (grade A), with evidence completeness of 0.75.", score("moat")).status).not.toBe("validated");
    expect(check("The moat score is 85.33 (grade A), with full evidence completeness.", score("moat")).status).not.toBe("validated");
    expect(check("Our excess-return value was USD 222.78 per share against a quote of USD 337.98.", er).status).not.toBe("validated");
    expect(check("The Beneish M score was -2.00, read as unlikely manipulation.", { ...beneish, value: -2 }).status).not.toBe("validated");
    expect(check("The Beneish M score was -3.01, read as likely manipulation.", beneish).status).not.toBe("validated");
  });
  it("requires retained calendar fiscal evidence for an annual ROTE record without a fiscal label", () => {
    const rec = { ...rote, fiscalPeriod: undefined };
    const text = "Return on tangible common equity for FY2025 was 20.7%.";
    const options = { record: rec, sourceId: rec.id, reportingCurrency: "USD", excerpts: [
      { source: "edgar:10-K", title: "Annual report: reporting period ended 2025-12-31 (FY2025)", text: "Retained annual filing.", asOf: "2025-12-31", truncated: false, originalChars: 23 },
    ] };
    expect(check(text, rec).status).not.toBe("validated");
    expect(validateClaimNumericSupport({ label: "FACT", text, source: rec.id, asOf: rec.asOf }, options).status).toBe("validated");
    expect(validateClaimNumericSupport({ label: "FACT", text: text.replace("2025", "2024"), source: rec.id, asOf: rec.asOf }, options).status).not.toBe("validated");
    expect(validateClaimNumericSupport({ label: "FACT", text, source: rec.id, asOf: rec.asOf }, { ...options,
      excerpts: options.excerpts.map(e => ({ ...e, title: "Annual report: reporting period ended 2025-06-30 (FY2025)" })) }).status).not.toBe("validated");
  });
  it("reads the annual ROTE fiscal label from the retained same-period annual statement, never the calendar alone", () => {
    const rec = { ...rote, fiscalPeriod: undefined };
    const text = "Return on tangible common equity for FY2025 was 20.7%.";
    const statement = record({ id: "payload.statements.income-statement-annual.2025-12-31.net-income", kind: "provider",
      origin: "fmp:income-statement(annual)", label: "net income", period: "2025-12-31", fiscalPeriod: "FY2025" });
    const options = { record: rec, sourceId: rec.id, reportingCurrency: "USD", excerpts: [], registry: [statement] };
    const claim = { label: "FACT" as const, text, source: rec.id, asOf: rec.asOf };
    expect(validateClaimNumericSupport(claim, options).status).toBe("validated");
    for (const invalid of [{ ...statement, period: "2024-12-31" }, { ...statement, fiscalPeriod: undefined },
      { ...statement, id: "computed.unrelated", origin: "computed.unrelated" }])
      expect(validateClaimNumericSupport(claim, { ...options, registry: [invalid] }).status).not.toBe("validated");
    expect(validateClaimNumericSupport(claim, { ...options, registry: [statement, { ...statement, fiscalPeriod: "FY2024" }] }).status).not.toBe("validated");
    expect(validateClaimNumericSupport(claim, { ...options, registry: [statement, { ...statement, fiscalPeriod: "FY2024" }], excerpts: [
      { source: "edgar:10-K", title: "Annual report: reporting period ended 2025-12-31 (FY2025)", text: "Retained annual filing.", asOf: "2025-12-31", truncated: false, originalChars: 23 },
    ] }).status).not.toBe("validated");
  });
});

describe("D-187 statement outflow magnitudes", () => {
  const outflow = (metric: "buybacks" | "capex", frequency = "quarterly") => record({
    id: `payload.statements.cash-flow-${frequency}.2026-09-30.${metric}-negative`, label: `${metric} (negative)`, kind:"provider",
    value:-4.071e9, unit:"currency", currency:"EUR", period:"2026-09-30", fiscalPeriod:frequency === "quarterly" ? "Q3 FY2026" : "FY2026",
    asOf:"2026-09-30", origin:"fmp:cash-flow(quarter)",
  });
  it.each(["buybacks", "share repurchases", "capital expenditure", "capex"])("accepts positive %s amounts only on the signed statement contract", metric => {
    const rec=outflow(/buybacks|repurchases/.test(metric) ? "buybacks" : "capex");
    for (const annotation of ["", " (cash outflow)", " of cash outflow"]) {
      const text=`${metric} for the quarter ended 2026-09-30 were EUR 4.07 billion${annotation}.`;
      expect(check(text,rec).status).toBe("validated");
      expect(check(text.replace("4.07", "5.07"),rec).status).not.toBe("validated");
      expect(check(text.replace("2026-09-30", "2025-09-30"),rec).status).not.toBe("validated");
      expect(check(text.replace(metric, "dividends"),rec).status).not.toBe("validated");
      expect(check(text.replace("EUR", "USD"),rec).status).not.toBe("validated");
      expect(check(text.replace("billion", "billion per share"),rec).status).not.toBe("validated");
    }
  });
  it("accepts annual capex magnitudes", () => {
    expect(check("Capex at 2026-09-30 was EUR 4.07 billion.",outflow("capex","annual")).status).toBe("validated");
  });
  it.each([" (cash inflow)", " of cash inflow", " of inflow"])("retains inflow refusal: %s", annotation => {
    for (const amount of ["4.07", "-4.07"]) expect(check(`Buybacks for the quarter ended 2026-09-30 were EUR ${amount} billion${annotation}.`,outflow("buybacks")).status).not.toBe("validated");
  });
  it.each(["rose", "fell", "increased", "decreased"])("keeps signed direction rules: %s", verb => {
    expect(check(`Buybacks ${verb} EUR 4.07 billion for the quarter ended 2026-09-30.`,outflow("buybacks")).status).not.toBe("validated");
  });
  it("does not export magnitude matching to other records or nonnegative values", () => {
    const text="Buybacks for the quarter ended 2026-09-30 were EUR 4.07 billion.";
    for (const id of ["computed.current-capital.buybacks-negative", "payload.statements.income-statement-quarterly.2026-09-30.buybacks-negative", "payload.statements.cash-flow-monthly.2026-09-30.buybacks-negative"])
      expect(check(text,{...outflow("buybacks"),id}).status).not.toBe("validated");
    expect(check(text,{...outflow("buybacks"),label:"other outflow"}).status).not.toBe("validated");
    expect(check(text.replace("4.07", "-4.07"),{...outflow("buybacks"),value:4.071e9}).status).not.toBe("validated");
    expect(check(text,{...outflow("buybacks"),value:0}).status).not.toBe("validated");
  });
});
