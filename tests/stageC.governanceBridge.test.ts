import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import type { ExtractedSection } from "@/pipeline/types";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

function payload(text: string, form = "10-K") {
  const bundle = completeCurrencyBundle({ symbol: "FABLE" });
  const section: ExtractedSection = {
    sectionName: "item1A", text, chars: text.length, method: "header-regex",
    accession: "fictional-annual", form, filingDate: "2026-02-20",
    reportDate: "2025-12-31", documentUrl: "https://example.invalid/annual",
  };
  bundle.edgar.item1a = { ok: true, value: { data: section, source: "edgar", endpoint: section.documentUrl, asOf: section.reportDate, fetchedAt: bundle.builtAt } };
  return assembleContextPayload(bundle, runStageB(bundle), { checks: [], flags: [], gaps: [] });
}

describe("filed governance evidence admission", () => {
  it("retains dated votes, named controllers and elected versus available exemptions beyond the risk budget", () => {
    const rights = "Our Class A common stock has one vote per share and our Class B common stock has twenty votes per share.";
    const control = "As of December 31, 2025, Rowan Vale and permitted transferees hold 12,000 Class B shares and control 71% of the combined voting power.";
    const status = "We are a controlled company and have elected to use the exemption from an independent nominating committee.";
    const limit = "We could elect not to have a majority-independent board in the future. We currently maintain a majority-independent board.";
    const p = payload("Revenue and customer concentration risks may affect our business. ".repeat(6000) + rights + " " + control + " " + status + " " + limit);
    const excerpts = p.filings.filter(e => /governance/i.test(e.title));
    expect(excerpts.length).toBeGreaterThan(0);
    const text = excerpts.map(e => e.text).join(" ");
    for (const passage of [rights, control, status, limit]) expect(text).toContain(passage);
    expect(excerpts[0]).toMatchObject({ source: "edgar:10-K item1A governance", asOf: "2025-12-31" });
    expect(excerpts[0]!.title).toContain("filed 2026-02-20");
    expect(p.citationRegistry?.some(r => r.id === "edgar:10-K item1A governance")).toBe(true);
  });

  it("does not invent votes or a current count from an IPO conversion", () => {
    const p = payload("At our IPO, 18,000 Class A shares held by the Controlling Party were converted to Class B shares.");
    expect(p.filings.filter(e => /governance/i.test(e.title))).toEqual([]);
  });

  it("keeps the foreign annual risk section's actual item identity", () => {
    const p = payload("Our Class A shares have one vote per share. We are a controlled company.", "20-F");
    expect(p.filings.find(e => /governance/i.test(e.title))?.source).toBe("edgar:20-F item3D governance");
  });
});
