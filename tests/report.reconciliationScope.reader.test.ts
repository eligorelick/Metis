// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { FundamentalsSection } from "@/components/report/sections";
import { filingDisclosureTables } from "@/report/filingDisclosurePresentation";
import { loadTask28Fixture } from "./helpers/task28Report";
import type { FilingDisclosures, FilingRef } from "@/report/schema";

it("keeps source-scoped reader tables correctly associated across reorder and replacement without duplicate keys", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"), root = createRoot(host);
  const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const report = loadTask28Fixture();
  const source: FilingRef = { form: "8-K", accession: "reader", filingDate: "2026-08-05", exhibit: "EX-99.1", url: "https://www.sec.gov/release" };
  const facts: NonNullable<FilingDisclosures["reconciliation"]> = [
    { metric: "gaap-diluted-eps", value: 2, unit: "currency-per-share", periodEnd: "2026-06-30", months: 3, source },
    { metric: "gaap-diluted-eps", value: 7, unit: "currency-per-share", periodEnd: "2026-06-30", months: 3, source: { ...source, exhibit: "EX-99.2", url: "https://www.sec.gov/commentary" } },
  ];
  report.filingDisclosures = { version: "1.0.0", currency: "USD", currencyBasis: "fixture", guidance: null, guidanceChecks: [], freeCashFlow: [], freeCashFlowDefinition: null, capitalReturn: null, events: [], segments: [], quarterlyTrend: [], reconciliation: facts, notes: [] };
  try {
    for (const observations of [facts, [...facts].reverse(), [{ ...facts[1]!, value: 9 }]]) {
      const filingDisclosures = { ...report.filingDisclosures!, reconciliation: observations };
      await act(async () => root.render(createElement(FundamentalsSection, { fundamentals: report.fundamentals, index: 4, report: { filingDisclosures }, extraTables: filingDisclosureTables(filingDisclosures, "fundamentals") })));
      for (const f of observations) {
        const note = [...host.querySelectorAll("p")].find(p => p.textContent?.includes(`Document: ${f.source.url}`));
        expect(note?.parentElement?.textContent).toContain(`$${f.value.toFixed(2)}`);
      }
      if (observations.length === 1) expect(host.textContent).not.toContain("Document: https://www.sec.gov/release");
    }
    expect(errors.mock.calls.filter(args => /same key|unique.*key/i.test(args.join(" ")))).toEqual([]);
  } finally {
    await act(async () => root.unmount()); errors.mockRestore(); host.remove(); vi.unstubAllGlobals();
  }
});
