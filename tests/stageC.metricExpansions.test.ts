import { expect, it } from "vitest";
import { validateClaimNumericSupport } from "@/pipeline/stageC/claimEvidence";
import type { NumericProvenanceRecord } from "@/pipeline/stageC/provenance";

const record = (label: string): NumericProvenanceRecord => ({ id: "computed.returns.test", kind: "computed", label, origin: "computed.returns",
  formulaVersion: "test", value: 38.676, unit: "percent", currency: null, period: "FY2025", fiscalPeriod: "FY2025", asOf: "2025-12-31", displayPrecision: 4 });
function check(metric: string, label: string, over: Partial<NumericProvenanceRecord> = {}) {
  const r = { ...record(label), ...over };
  return validateClaimNumericSupport({ label: "FACT", source: r.id, asOf: r.asOf, text: `${metric} for FY2025 was 38.7%.` },
    { record: r, registry: [r], sourceId: r.id, reportingCurrency: null, excerpts: [] }).status;
}

it.each([
  ["ROIC", "return on invested capital"], ["ROE", "return on equity"], ["ROA", "return on assets"],
  ["ROTCE", "return on tangible common equity"], ["ROTE", "return on tangible common equity"],
  ["WACC", "weighted average cost of capital"], ["revenue CAGR", "revenue compound annual growth rate"],
  ["EBIT margin", "earnings before interest and taxes margin"],
  ["EBITDA margin", "earnings before interest taxes depreciation and amortization margin"],
  ["NOPAT margin", "net operating profit after tax margin"], ["ERP used", "equity risk premium used"],
])("matches producer acronym %s to its expansion", (acronym, expansion) => {
  expect(check(acronym, acronym)).toBe("validated");
  expect(check(expansion, acronym)).toBe("validated");
  expect(check(acronym, expansion)).toBe("validated");
});

it("preserves return definitions, currency, values, units and periods", () => {
  expect(check("return on equity", "ROIC")).not.toBe("validated");
  expect(check("return on assets", "ROE")).not.toBe("validated");
  expect(check("return on tangible equity", "ROTE")).not.toBe("validated");
  expect(check("return on invested capital", "ROIC", { value: 30 })).not.toBe("validated");
  expect(check("return on invested capital", "ROIC", { unit: "ratio" })).not.toBe("validated");
  expect(check("return on invested capital", "ROIC", { period: "FY2024", fiscalPeriod: "FY2024" })).not.toBe("validated");
});
