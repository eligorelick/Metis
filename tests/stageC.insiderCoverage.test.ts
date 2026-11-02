import { describe, expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

function payload(trades: Record<string, unknown>[]) {
  const bundle = completeCurrencyBundle({ symbol: "FABLE" });
  const envelope = <T,>(rows: T[], endpoint: string) => ({ ok: true as const, value: { data: { rows, raw: rows }, asOf: "2026-07-06", source: "fmp" as const, endpoint, fetchedAt: bundle.builtAt } });
  bundle.insiderStats = envelope([{ year: 2026, quarter: 2, totalPurchases: 1, totalSales: 2 }], "insider-trading/statistics");
  bundle.insiderTrades = envelope(trades, "insider-trading/search");
  return assembleContextPayload(bundle, runStageB(bundle), { checks: [], flags: [], gaps: [] });
}

describe("insider inspected coverage", () => {
  it("separates aggregate dates, last inspected Form 4 filing, post-window codes and uncollected Form 144 notices", () => {
    const rows = [
      { transactionDate: "2026-07-01", filingDate: "2026-07-02", formType: "4", transactionType: "S-Sale", securitiesTransacted: 300 },
      { transactionDate: "2026-07-02", filingDate: "2026-07-06", formType: "4", transactionType: "F-InKind", securitiesTransacted: 80 },
      { transactionDate: "2026-07-03", filingDate: "2026-07-06", formType: "144", transactionType: "S-Sale", securitiesTransacted: 9000 },
      { transactionDate: "2026-06-01", filingDate: "2026-06-03", formType: "4", transactionType: "S-Sale", securitiesTransacted: 200 },
    ];
    const notes = payload(rows).insiders.notes.join(" ");
    expect(notes).toContain("2026-04-01 to 2026-06-30");
    expect(notes).toContain("last Form 4 filing date inspected: 2026-07-06");
    expect(notes).toContain("after 2026-06-30");
    expect(notes).toContain("S: 1 reported transaction row, 300 shares");
    expect(notes).toContain("F: 1 reported transaction row, 80 shares");
    expect(notes).toContain("Form 144 proposed-sale notices are not collected");
    expect(notes).toContain("selected provider rows");
    expect(notes).not.toContain("9300 shares");
    expect(notes).not.toContain("9000 @");
  });

  it("does not infer a filing date from transaction dates or claim no activity for missing records", () => {
    const notes = payload([{ transactionDate: "2026-07-01", transactionType: "S-Sale", securitiesTransacted: 50 }]).insiders.notes.join(" ");
    expect(notes).toContain("last Form 4 filing date inspected: unavailable");
    expect(notes).toContain("Form 144 proposed-sale notices are not collected");
    expect(notes).not.toContain("last Form 4 filing date inspected: 2026-07-01");
  });

  it("registers post-window row sums and coverage text so the judge can cite them", () => {
    const p = payload([{ transactionDate: "2026-07-01", filingDate: "2026-07-02", formType: "4", transactionType: "S-Sale", securitiesTransacted: 300 }]);
    expect(p.insiders.figures.find(f => f.label === "Post-window Form 4 code S reported shares (selected rows, may overlap)"))
      .toMatchObject({ value: 300, unit: "shares", asOf: "2026-07-02" });
    expect(p.provenanceRegistry?.some(r => r.value === 300 && r.unit === "shares")).toBe(true);
    expect(p.insiders.figures.find(f => f.label === "Insider filing coverage")?.value).toContain("Form 144 proposed-sale notices are not collected");
  });
});
