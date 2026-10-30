import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { validateBundle } from "@/pipeline/stageA/validate";
import { degradationPlan } from "@/pipeline/stageB/sectorRouting";
import { assembleContextPayload, serializePayloadForPrompt } from "@/pipeline/stageC/payload";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

function build(currency: string) {
  const b = completeCurrencyBundle({ symbol: "ADRX", annualCurrency: currency,
    quarterCurrencies: Array(4).fill(currency), siblingQuarterCurrencies: Array(4).fill(currency) });
  if (!b.profile.ok || !b.profile.value.data.rows[0]) throw new Error("fixture profile missing");
  b.profile.value.data.rows[0].isAdr = true;
  b.edgar.companyFacts = { ok: false, gap: { field: "edgar.companyFacts", reason: "No company facts for this synthetic ADR", severity: "info" } };
  const c = runStageB(b, { evIncludeLeases: false });
  const payload = assembleContextPayload(b, c, validateBundle(b));
  const prompt = serializePayloadForPrompt(payload);
  return { b, c, payload, prompt, manifest: payload.missingData as { field: string; reason: string }[] };
}

describe("FIN-313: ADR disclosures describe the path that runs", () => {
  it("manifest and prompt never claim a ratio map or an FX per-ADS conversion", () => {
    const { manifest, prompt, c } = build("USD");
    expect(manifest.filter(m => /ADR ratio|eps_local/.test(m.reason))).toEqual([]);
    expect(prompt).not.toMatch(/ADR_RATIOS|ADR ratio \/ FX|ADR ratio map|eps_local/);
    expect(c.route.notes.join("\n")).toContain("No depositary ratio is applied");
  });
  it("USD/USD ADR has no statements-currency sentence", () => {
    expect(build("USD").manifest.some(m => /Statements are in/.test(m.reason))).toBe(false);
  });
  it("EUR statements and USD ADR quote name the two known currencies", () => {
    expect(build("EUR").manifest.find(m => m.field === "degradation.fundamentals.currency")?.reason)
      .toContain("Statements are in EUR while the ADR quotes in USD: per-ADS and per-share comparisons with the price are withheld; no depositary ratio or FX rate is applied.");
  });
  it("states that dividend yield is gross without claiming a withholding calculation", () => {
    expect(build("USD").manifest.find(m => m.field === "degradation.header.dividendYield")?.reason)
      .toBe("[annotate] Dividend yield is shown GROSS of foreign withholding tax and depositary pass-through fees; no withholding rate is applied.");
  });
  it("control: the unverified share basis stays withheld without an invented adr.ratio gap", () => {
    const { b, c } = build("USD");
    expect(c.route.overlays).toContain("adr");
    const gaps = [...c.gaps, ...c.valuation.gaps];
    expect(gaps.find(g => g.field === "valuation.perShare.securityBasis")?.reason).toMatch(/no depositary ratio is guessed/);
    expect(gaps.some(g => g.field === "adr.ratio")).toBe(false);
    expect(b.profile.ok && b.profile.value.data.rows[0]?.currency).toBe("USD");
  });
  it.each([
    undefined, null, { statements: null, quote: "USD" }, { statements: "USD", quote: null },
    { statements: "GBP", quote: "GBp" }, { statements: "GBp", quote: "GBP" },
    { statements: "USD", quote: "USD" },
  ])("does not invent a mismatch when currency evidence is absent, equal, or minor-unit: %j", currencies => {
    expect(degradationPlan("general", ["adr"], 8, null, currencies).items.some(i => i.target === "fundamentals.currency")).toBe(false);
  });
  it("normalizes a known mismatch and keeps a non-ADR control unchanged", () => {
    const currencies = { statements: " eur ", quote: " usd " };
    expect(degradationPlan("general", ["adr"], 8, null, currencies).items.find(i => i.target === "fundamentals.currency")?.disclosure)
      .toContain("Statements are in EUR while the ADR quotes in USD");
    expect(degradationPlan("general", [], 8, null, currencies)).toEqual(degradationPlan("general", [], 8));
  });
});
