import { describe, expect, it } from "vitest";
import { validateClaimNumericSupport } from "@/pipeline/stageC/claimEvidence";
import type { NumericProvenanceRecord } from "@/pipeline/stageC/provenance";

const record = (fields: Partial<NumericProvenanceRecord>): NumericProvenanceRecord => ({ id: "computed.test", label: "test", kind: "computed", value: 10.8541, unit: "percent", currency: null, period: null, asOf: "2026-11-07", origin: "computed.test", formulaVersion: "stage-b-v1", displayPrecision: 4, ...fields });
const projection = (metric: string, unit: NumericProvenanceRecord["unit"], value: number) => record({ id: `computed.weighted-projections.${metric.toLowerCase()}-weighted-12m-ending-2031-09-27`, label: `${metric} weighted 12M ending 2031-09-27`, origin: `computed.projections.${metric}.weighted`, unit, value, currency: unit === "percent" ? null : "USD", period: "12M ending 2031-09-27" });
const check = (text: string, rec: NumericProvenanceRecord) => validateClaimNumericSupport({ label: "ESTIMATE", text, source: rec.id, asOf: rec.asOf }, { record: rec, sourceId: rec.id, excerpts: [], reportingCurrency: "USD" });
const cases = [
  ["WACC", record({ id: "computed.returns.wacc", label: "WACC", origin: "computed.returns.wacc" }), "The WACC assumption is 10.9%.", "WACC", "cost of equity"],
  ["weighted revenue projection", projection("revenue", "currency", 77.5077e9), "The weighted revenue projection for the twelve months ending 2031-09-27 is USD 77.51 billion.", "revenue", "net income"],
  ["weighted operating EPS projection", projection("epsDiluted", "currency-per-share", 11.163), "The weighted operating EPS projection for the twelve months ending 2031-09-27 is USD 11.16 per share.", "operating", "GAAP diluted"],
  ["weighted margin", projection("operatingMargin", "percent", 20.08), "Weighted operating margin for the twelve months ending 2031-09-27 is projected at 20.1%.", "operating", "gross"],
  ["weighted FCFF", projection("fcf", "currency", 7.1735e9), "Weighted unlevered free cash flow to the firm for the twelve months ending 2031-09-27 is projected at USD 7.17 billion.", "unlevered", "levered"],
  ["provider's consensus target", record({ id: "payload.estimates.price-target-consensus", label: "price target consensus", origin: "fmp:price-target-consensus", kind: "provider", value: 205.5, unit: "currency-per-share", currency: "USD" }), "The provider's consensus price target is USD 205.50 per share.", "consensus", "median"],
] as const;

describe("metric-bound numerical phrasing remediation", () => {
  it.each(cases)("matches %s with the source period and units", (_name, rec, text) => expect(check(text, rec).status).toBe("validated"));
  it.each(cases)("refuses wrong metric, unit, period and value for %s", (_name, rec, text, from, to) => {
    expect(check(text.replace(from, to), rec).status).not.toBe("validated");
    expect(check(text.includes("2031-09-27") ? text.replace("2031-09-27", "2030-09-27") : text.replace(" is ", " for FY2030 is "), rec).status).not.toBe("validated");
    expect(check(text.replace(/10\.9|77\.51|11\.16|20\.1|7\.17|205\.50/, "999.99"), rec).status).not.toBe("validated");
    expect(check(text.includes("USD") ? text.replace("USD", "EUR") : text.replace("%", "x"), rec).status).not.toBe("validated");
  });
});
