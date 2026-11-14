import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { validateBundle } from "@/pipeline/stageA/validate";
import { foreignBundle } from "./helpers/foreignBundle";
import { completeCurrencyBundle, M } from "./helpers/currencyBundle";
import { assembleContextPayload, serializePayloadForPrompt } from "@/pipeline/stageC/payload";
import { buildDataOnlyReport } from "@/pipeline/jobRunner";
import { reportToMarkdown } from "@/report/export/markdown";

describe("constant-currency foreign valuation consumers", () => {
  it("uses USD debt in WACC market-value weights", () => {
    const c = runStageB(foreignBundle());
    expect(c.returns.wacc.weightEquity, JSON.stringify(c.returns.wacc)).toBeCloseTo(10_000 / (10_000 + 300 / 32), 10);
    expect(c.returns.wacc.notes.join(" ")).toContain("DEXTAUS");
    expect(c.gaps.some(g => g.field === "returns.wacc.weights.currency")).toBe(false);
  });
  it("preserves historical growth and converts per-ADS EPS once", () => {
    const b = foreignBundle(), original = structuredClone(b);
    delete original.valuationFx;
    const c = runStageB(b), local = runStageB(original);
    expect(c.growth).toEqual(local.growth);
    if (!c.valuation.multiples) throw new Error("fixture route");
    expect(c.valuation.multiples.multiples.find(r => r.key === "peTtm")?.current).toBeCloseTo(100 / (1.8 / 32), 8);
    expect(JSON.stringify(b)).toBe(JSON.stringify({ ...original, valuationFx: b.valuationFx }));
  });
  it("never converts a quote-date capitalization for Altman against an older balance sheet, whichever cap is selected", () => {
    // D-267: the cap converts at the quote-date rate only; no rate dated at the balance date is admitted, so the
    // market-equity X4 is refused by the owner's currency rule and its book-equity substitute is used and disclosed.
    for (const profileCap of [undefined, 1]) {
      const b = foreignBundle();
      if (!b.profile.ok) throw new Error("fixture");
      if (profileCap !== undefined) b.profile.value.data.rows[0]!.marketCap = profileCap;
      const c = runStageB(b);
      expect(c.forensics.altman?.variant).toBe("private");
      expect(c.forensics.altman?.gaps.find(g => g.field === "forensics.altman.currency")?.reason).toMatch(/no exchange rate dated at the balance-sheet date is admitted/);
      expect(c.forensics.altman?.components.x4).not.toBe(20);
    }
  });
  it("runs DCF and reverse DCF in USD per ADS without applying the ratio twice", () => {
    const c = runStageB(foreignBundle());
    expect(c.valuation.kind).toBe("dcf");
    if (c.valuation.kind !== "dcf") throw new Error("fixture route");
    expect(c.valuation.assumptions?.startRevenue.value).toBe(1200 * M / 32);
    expect(c.valuation.dcf?.perShare).toBeTypeOf("number");
    expect(c.valuation.dcf!.perShare).toBeCloseTo(c.valuation.dcf!.equityValue! / (100 * M), 8);
    expect(c.valuation.reverseDcf).not.toBeNull();
    expect(c.fairValue.perShare?.unit).toBe("USD/share");
    expect(c.valuation.notes.join(" ")).toMatch(/1 ADS = 5 ordinary/);
  });
  it("converts price multiples and Altman X4 and admits the price-comparison grade", () => {
    const c = runStageB(foreignBundle());
    if (!("multiples" in c.valuation) || !c.valuation.multiples) throw new Error("fixture route");
    const book = c.valuation.multiples.multiples.find(r => r.key === "priceToBook");
    expect(book?.current).toBeCloseTo(10_000 / (520 / 32), 8);
    // D-267: Altman's market X4 is not converted at the quote-date rate against an older balance (see above).
    expect(c.forensics.altman?.variant).toBe("private");
    expect(c.gaps.some(g => g.field === "valuation.priceComparison.currency")).toBe(false);
    expect(validateBundle(foreignBundle()).gaps.some(g => g.field === "validation.currencyMismatch")).toBe(false);
  });
  it.each(["USD", " usd "])("keeps same-currency %s Stage B output byte-identical with or without an FX member", currency => {
    const b = completeCurrencyBundle({ profileCurrency: currency });
    const before = JSON.stringify(runStageB(b));
    expect(runStageB(b).gaps.some(g => g.field === "valuation.currencyConversion")).toBe(false);
    b.valuationFx = foreignBundle().valuationFx;
    expect(JSON.stringify(runStageB(b))).toBe(before);
  });
  it.each(["FX", "ratio"])("preserves all existing suppression when %s is missing", missing => {
    const b = foreignBundle();
    if (missing === "FX") delete b.valuationFx;
    else if (b.edgar.companyFacts.ok) delete b.edgar.companyFacts.value.data.facts.dei;
    const c = runStageB(b);
    expect(c.gaps.some(g => g.field === "returns.wacc.weights.currency")).toBe(true);
    expect(c.gaps.some(g => g.field === "valuation.dcf.currency")).toBe(true);
    expect(c.gaps.some(g => g.field === "valuation.multiples.currency")).toBe(true);
    expect(c.fairValue.perShare).toBeNull();
  });
  it("keeps analysts with unspecified ADR currency/share units withheld", () => {
    expect(runStageB(foreignBundle()).gaps.some(g => g.field === "valuation.analystEstimates.currency")).toBe(true);
  });
  it("labels the report and provenance in USD per ADS while keeping filed capital in TWD", () => {
    const b = foreignBundle(), c = runStageB(b), validation = validateBundle(b);
    const payload = assembleContextPayload(b, c, validation);
    const dcf = payload.computed.flatMap(s => s.figures).find(f => f.label === "DCF per share");
    expect(dcf?.currency).toBe("USD");
    expect(payload.provenanceRegistry?.find(r => r.id === dcf?.provenanceId)?.currency).toBe("USD");
    expect(c.capital.current?.currency).toBe("TWD");
    const report = buildDataOnlyReport({ symbol: b.symbol, companyName: "ADRX", generatedAt: b.builtAt, model: "none", costUsd: 0, bundle: b, validation, computed: c, costBreakdown: [], reason: "offline test" });
    expect(report.valuation.dcf?.perShare, JSON.stringify(report.valuation.dcf)).toMatchObject({ unit: "USD/share" });
    for (const text of [serializePayloadForPrompt(payload), reportToMarkdown(report)]) {
      expect(text).toContain("one spot rate");
      expect(text).toContain("DEXTAUS");
      expect(text).not.toContain("No depositary ratio is applied");
    }
  });
});
