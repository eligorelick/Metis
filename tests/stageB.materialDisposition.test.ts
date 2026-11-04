import { describe, expect, it } from "vitest";
import { unusualOperatingItemsTtm } from "@/pipeline/stageB/unusualItems";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { ExtractedSection } from "@/pipeline/types";
import { runStageB } from "@/pipeline/compute";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

const M = 1e6;
const point = (start: string, end: string, val: number, filed = "2026-02-01") =>
  ({ start, end, val, accn: "0000000042-26-000001", fy: 2025, fp: "FY", form: "10-K", filed });
function facts(gain = 100 * M): CompanyFacts {
  return { cik: 42, entityName: "Synthetic", facts: { "us-gaap": {
    GainLossOnDispositionOfAssets: { units: { USD: [point("2025-01-01", "2025-12-31", gain),
      point("2025-01-01", "2025-09-30", 0), point("2026-01-01", "2026-09-30", 0)] } },
    OperatingIncomeLoss: { units: { USD: [point("2025-01-01", "2025-12-31", 200 * M)] } },
  } } } as unknown as CompanyFacts;
}
function section(options: { amount?: number; lineAmount?: number; below?: boolean; date?: string; filed?: string } = {}): ExtractedSection {
  const amount = options.amount ?? 100;
  return { sectionName: "tenKNotes", method: "toc-anchor", chars: 400,
    accession: "0000000042-26-000001", form: "10-K", reportDate: "2025-12-31", filingDate: options.filed ?? "2026-02-01",
    documentUrl: "https://www.sec.gov/Archives/edgar/data/42/000000004226000001/test.htm",
    text: `Note 3 - Navigation Software Divestiture On ${options.date ?? "October 31, 2025"}, we closed the sale of our navigation business. The sale resulted in a gain of $ ${amount} recorded in Gain on dispositions, net in the Consolidated Statements of Operations.`,
    statementsText: `Consolidated Statements of Operations (Dollars in millions) Years ended December 31, 2025 2024 Total revenues 1,000 900 ` +
      (options.below ? `Operating income 200 180 Gain on dispositions, net ${options.lineAmount ?? amount} 0` : `Gain on dispositions, net ${options.lineAmount ?? amount} 0 Operating income 200 180`) +
      " Other income, net 10 5 Income before income taxes 210 185",
  };
}
const window = { ttmEnd: "2026-09-30", fiscalYearEnd: "2025-12-31", unit: "USD", observedAt: "2026-11-01T12:00:00Z" };
const read = (f = facts(), s: ExtractedSection[] = [section()], oi = 250 * M) =>
  unusualOperatingItemsTtm(f, { ...window, ...{ operatingIncome: oi, sections: s } });

describe("material disposal gains need placement, materiality and the matching window", () => {
  it("removes only the named completed sale, retaining routine gains in the aggregate tag", () => {
    const result = read(facts(105 * M), [section({ lineAmount: 105 })]);
    expect(result?.value).toBe(100 * M);
    expect(result?.basis).toMatch(/Navigation Software Divestiture/);
  });
  it("leaves a small routine disposal below 10% of absolute operating income untouched", () => {
    const result = read(facts(5 * M), [section({ amount: 5 })]);
    expect(result?.value ?? 0).toBe(0);
    expect(result?.dcfRefusal).toBeUndefined();
  });
  it("leaves a material gain recorded below operating income untouched", () => {
    const result = read(facts(), [section({ below: true })]);
    expect(result?.value ?? 0).toBe(0);
    expect(result?.dcfRefusal).toBeUndefined();
  });
  it("does not mistake a cash-flow reconciliation for below-operating placement", () => {
    const s = section();
    s.statementsText = "Consolidated Statements of Operations (Dollars in millions) Total revenues 1,000 Operating income 200 " +
      "Other income 10 Net income 180 Consolidated Statements of Cash Flows Gain on dispositions, net 100 0";
    expect((read(facts(), [s]) as { dcfRefusal?: string })?.dcfRefusal).toMatch(/placement/i);
  });
  it("recognizes a fully placed gain even when reported operating income is zero", () => {
    expect((read(facts(), [section()], 0) as { dcfRefusal?: string })?.dcfRefusal).toBeUndefined();
  });
  it("refuses the DCF when a material disposal has no retained placement evidence", () => {
    const result = read(facts(), []) as { dcfRefusal?: string } | null;
    expect(result?.dcfRefusal).toMatch(/material.*dispos.*placement/i);
  });
  it("refuses mismatched statement amounts rather than treating line order as proof", () => {
    const bad = section();
    bad.statementsText = bad.statementsText!.replace("Operating income 200", "Operating income 300");
    expect((read(facts(), [bad]) as { dcfRefusal?: string })?.dcfRefusal).toMatch(/placement/i);
  });
  it("does not remove an event before the trailing window even when an aggregate tag is material", () => {
    const result = read(facts(), [section({ date: "September 1, 2025" })]);
    expect(result?.value ?? 0).toBe(0);
  });
  it("uses the admitted period start instead of assuming 365 days", () => {
    const result = unusualOperatingItemsTtm(facts(), { ...window, ...{ periodStart: "2025-11-01", operatingIncome: 250 * M, sections: [section()] } });
    expect(result?.value ?? 0).toBe(0);
  });
  it("does not use filing evidence acquired after the analysis cutoff", () => {
    expect((read(facts(), [section({ filed: "2026-12-01" })]) as { dcfRefusal?: string })?.dcfRefusal).toMatch(/placement/i);
  });
  it("requires the individual event to be material even when the aggregate tag is large", () => {
    expect(read(facts(), [section({ amount: 5 })])?.value ?? 0).toBe(0);
  });
  it("refuses another unresolved material tag even after one sale has been placed", () => {
    const f = facts();
    f.facts["us-gaap"]!.GainLossOnSaleOfOtherAssets = structuredClone(f.facts["us-gaap"]!.GainLossOnDispositionOfAssets);
    const other = f.facts["us-gaap"]!.GainLossOnSaleOfOtherAssets as { units: { USD: ReturnType<typeof point>[] } };
    other.units.USD = other.units.USD.map(p => ({ ...p, val: p.val ? 150 * M : 0 }));
    expect((read(f) as { dcfRefusal?: string })?.dcfRefusal).toMatch(/placement/i);
  });
});

function bundleWithSale(retainPlacement = true) {
  const b = completeCurrencyBundle({ debt: 0 });
  b.edgar.cik = { ok: true, value: { data: { cik: 42, cik10: "0000000042", ticker: b.symbol },
    source: "edgar", endpoint: "synthetic", asOf: b.builtAt, fetchedAt: b.builtAt } } as typeof b.edgar.cik;
  b.edgar.companyFacts = { ok: true, value: { data: facts(), source: "edgar", endpoint: "synthetic", asOf: b.builtAt, fetchedAt: b.builtAt } };
  if (retainPlacement) b.edgar.tenKNotes = { ok: true, value: { data: section(), source: "edgar", endpoint: "synthetic", asOf: b.builtAt, fetchedAt: b.builtAt } };
  return b;
}
describe("disposal normalization reaches all shared operating-income consumers", () => {
  it("normalizes historical margins and withholds earnings multiples without a sale tax allocation", () => {
    const b = bundleWithSale(), before = structuredClone(b);
    const c = runStageB(b);
    expect(b).toEqual(before);
    expect(c.growth.margins.operating.series.at(-1)?.pct).toBe(10);
    expect(c.growth.margins.net.series.at(-1)?.pct).toBeNull();
    expect(c.valuation.multiples?.multiples.find(m => m.key === "peTtm")?.current).toBeNull();
    expect(c.notes.join(" ")).toMatch(/Navigation Software Divestiture/);
  });
  it("withholds a DCF rather than using a material gain with unknown placement", () => {
    const c = runStageB(bundleWithSale(false));
    expect(c.fairValue.status).not.toBe("available");
    expect(c.valuation.gaps.map(g => g.reason).join(" ")).toMatch(/material.*dispos.*placement/i);
  });
  it("names the completed sale when normalized economics fail the existing DCF domain", () => {
    const b = bundleWithSale();
    if (!b.edgar.companyFacts?.ok || !b.edgar.tenKNotes?.ok) throw new Error("fixture");
    b.edgar.companyFacts.value.data = facts(500 * M);
    b.edgar.tenKNotes.value.data = section({ amount: 500 });
    const c = runStageB(b);
    expect(c.fairValue.perShare).toBeNull();
    expect(c.fairValue.reasons.map(r => r.reason).join(" ")).toMatch(/Navigation Software Divestiture/);
  });
});
