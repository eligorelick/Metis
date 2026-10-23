import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { operatingMeasuresStated, selectMaterialEvidence } from "@/pipeline/stageC/evidenceSelection";
import { assembleContextPayload, PAYLOAD_BUDGETS } from "@/pipeline/stageC/payload";
import type { DataBundle } from "@/pipeline/types";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

// Audit 2026-10-22 C-16: the 10-K excerpt stated "approximately nine GWs" of
// large-load contracts; the newer 10-Q's "approximately 16 gigawatts" sat 70%
// into a 172k-character MD&A and the interim selection dropped it.
const ANNUAL = "Since 2023, the traditional electric operating companies have contracted with new data centers and other large load customers covering approximately nine GWs of electric load. The company serves approximately 9 million customers.";
const UPDATE = "Since 2023, the traditional electric operating companies have contracts with new data centers and other large load customers covering approximately 11 gigawatts of electric load. Additional contracts totaling approximately five gigawatts are subject to review. The approximately 16 gigawatts of new contracts (Large Load Contracts) are expected to begin service through 2031.";

/** A long MD&A of scored financial prose with the update ~70% in. */
function interimMdna(): string {
  const lines: string[] = [];
  for (let i = 0; lines.join("\n").length < 150_000; i++) {
    lines.push(`Retail revenues in segment ${i} increased $${(i % 90) + 10} million, or ${(i % 9) + 1}.${i % 10}%, in the second quarter 2026 compared to 2025, primarily due to higher rates and an expected increase in operating income and capital expenditures for liquidity purposes.`);
  }
  const at = Math.floor(lines.length * 0.7);
  return [...lines.slice(0, at), UPDATE, ...lines.slice(at)].join("\n");
}

function section(text: string, form: string, reportDate: string, sectionName: string) {
  return { ok: true as const, value: { data: { text, chars: text.length, form, reportDate, filingDate: reportDate, accession: `0000092122-26-${sectionName}`, documentUrl: "https://www.sec.gov/so.htm", method: "toc-anchor", sectionName },
    source: "edgar" as const, asOf: reportDate, endpoint: "https://www.sec.gov/so.htm", fetchedAt: "2026-10-14T00:00:00Z" } };
}

function payloadFor(annual: string, tenQReportDate = "2026-06-30") {
  const bundle = completeCurrencyBundle({}) as DataBundle;
  Object.assign(bundle.edgar, { business: section(annual, "10-K", "2025-12-31", "business"), tenQMdna: section(interimMdna(), "10-Q", tenQReportDate, "tenQItem2") });
  const payload = assembleContextPayload(bundle, runStageB(bundle), { checks: [], flags: [], gaps: [] } as never);
  return payload.filings.find((f) => f.source === "edgar:10-Q item2")!;
}

describe("a newer 10-Q's update of a 10-K operating figure (audit 2026-10-22 C-16)", () => {
  it("names the operating measures the annual excerpt states with a number", () => {
    expect(operatingMeasuresStated(ANNUAL).map((m) => m.name)).toEqual(["gigawatts", "customers"]);
    expect(operatingMeasuresStated("Our customers value reliability.")).toEqual([]);
    expect(operatingMeasuresStated("Goodwill is tested in our three reporting units; we granted 1.2 million restricted stock units.")).toEqual([]);
    expect(operatingMeasuresStated("We delivered 410,000 vehicle units and ended with 301.6 million paid memberships.").map((m) => m.name)).toEqual(["subscribers", "units"]);
  });

  it("keeps the 10-Q passage restating the figure, within the same budget", () => {
    const excerpt = payloadFor(ANNUAL);
    expect(excerpt.text).toContain("approximately 16 gigawatts of new contracts");
    expect(excerpt.text.length).toBeLessThanOrEqual(PAYLOAD_BUDGETS.tenQMdnaChars);
    expect(excerpt.title).toMatch(/kept first.*gigawatts/);
  });

  it("leaves the selection unchanged when the 10-K states no such figure, or the 10-Q is not newer", () => {
    const text = interimMdna();
    const plain = selectMaterialEvidence(text, PAYLOAD_BUDGETS.tenQMdnaChars, "interim");
    expect(plain.text).not.toContain("16 gigawatts");
    expect(payloadFor("We sell electricity to data centers.").text).toBe(plain.text);
    expect(payloadFor(ANNUAL, "2025-09-30").text).toBe(plain.text);
  });
});
