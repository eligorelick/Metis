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
