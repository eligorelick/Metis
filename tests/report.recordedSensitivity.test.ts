// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReportView } from "@/components/report/ReportView";
import { loadTask28Fixture } from "./helpers/task28Report";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
function reportFixture() {
  const report = loadTask28Fixture();
  report.valuation.dcf.sensitivityGrid = [
    { waccPct: 8.125, gTermPct: 2, perShare: -10.1256789 },
    { waccPct: 8.125, gTermPct: 3, perShare: null },
    { waccPct: 9.125, gTermPct: 2, perShare: 0 },
  ];
  return report;
}
function region() { return container.querySelector<HTMLElement>('[aria-label="Recorded sensitivity cases"]'); }
async function select(wacc: string, growth: string) {
  const target = region()!.querySelector<HTMLButtonElement>(`button[data-sensitivity-wacc="${wacc}"][data-sensitivity-growth="${growth}"]`)!;
  await act(async () => target.click());
}

describe("inspection of recorded sensitivity cells", () => {
  it("selects the exact stored observation without changing the headline, grade or report bytes", async () => {
    const report = reportFixture(); const before = JSON.stringify(report);
    await act(async () => root.render(createElement(ReportView, { report, layout: "dossier" })));
    expect(region()).not.toBeNull();
    await select("8.125", "2");
    const selected = region()!.querySelector('[role="status"]')!.textContent;
    expect(selected).toContain("8.125%");
    expect(selected).toContain("-10.1256789");
    expect(selected).toContain("currency not recorded");
    expect(container.querySelector("#report-valuation")!.textContent).toContain("48.00");
    expect(JSON.stringify(report)).toBe(before);
    expect(region()!.querySelector('[aria-pressed="true"]')).not.toBeNull();
  });

  it("distinguishes stored withheld, zero, and unrecorded grid intersections", async () => {
    await act(async () => root.render(createElement(ReportView, { report: reportFixture(), layout: "dossier" })));
    expect(region()).not.toBeNull();
    await select("8.125", "3");
    expect(region()!.querySelector('[role="status"]')!.textContent).toContain("withheld");
    await select("9.125", "2");
    expect(region()!.querySelector('[role="status"]')!.textContent).toContain("Recorded value (unrounded): 0");
    expect(region()!.querySelector('button[data-sensitivity-wacc="9.125"][data-sensitivity-growth="3"]')).toBeNull();
    expect(region()!.querySelectorAll("button[data-sensitivity-wacc]")).toHaveLength(3);
  });

  it("clears a selected case when the stored grid changes despite an identical generation date", async () => {
    const report = reportFixture();
    await act(async () => root.render(createElement(ReportView, { report, layout: "dossier" })));
    expect(region()).not.toBeNull();
    await select("8.125", "2");
    const changed = structuredClone(report);
    changed.valuation.dcf.sensitivityGrid[0].perShare = 99.123;
    await act(async () => root.render(createElement(ReportView, { report: changed, layout: "dossier" })));
    expect(region()!.querySelector('[aria-pressed="true"]')).toBeNull();
    expect(region()!.querySelector('[role="status"]')!.textContent).toContain("Select a recorded cell");
    expect(region()!.textContent).not.toContain("-10.1256789");
  });

  it("inspects the bank return/cost-of-equity grid with its actual return and book-value context", async () => {
    const report = reportFixture();
    report.valuation.dcf.sensitivityGrid = [];
    report.valuation.dcf.perShare = { ...report.valuation.dcf.perShare!, unit: "EUR/share", currency: "EUR" };
    report.valuation.dcf.excessReturnGrid = { rows: [{ label: "Trailing reported return", startReturnPct: 16.75, bookValue: 10_000_000 }], costOfEquityPcts: [11.125, 12.125], perShare: [[-10.123456, null]], notes: ["Stored excess-return conventions"] };
    await act(async () => root.render(createElement(ReportView, { report, layout: "dossier" })));
    const matrix = container.querySelector<HTMLElement>('[aria-label="Recorded excess-return sensitivity"]');
    expect(matrix).not.toBeNull();
    await act(async () => matrix!.querySelector<HTMLButtonElement>('button[data-matrix-row="0"][data-matrix-column="0"]')!.click());
    const selected = matrix!.querySelector('[role="status"]')!.textContent;
    for (const value of ["16.75%", "10000000 EUR", "11.125%", "-10.123456", "EUR"]) expect(selected).toContain(value);
    await act(async () => matrix!.querySelector<HTMLButtonElement>('button[data-matrix-row="0"][data-matrix-column="1"]')!.click());
    expect(matrix!.querySelector('[role="status"]')!.textContent).toContain("withheld");
    expect(matrix!.textContent).toContain("Stored excess-return conventions");
    expect(region()).toBeNull();
  });

  it("preserves a zero growth/margin shift and its raw value while withholding selection for missing axis context", async () => {
    const report = reportFixture();
    report.valuation.dcf.growthMarginGrid = { growthShiftsPp: [0], marginShiftsPp: [0, 2.5], perShare: [[0, -15.12345], [100]], notes: ["Recorded sustained-margin convention"] };
    await act(async () => root.render(createElement(ReportView, { report, layout: "dossier" })));
    const matrix = container.querySelector<HTMLElement>('[aria-label="Recorded growth and margin sensitivity"]');
    expect(matrix).not.toBeNull();
    await act(async () => matrix!.querySelector<HTMLButtonElement>('button[data-matrix-row="0"][data-matrix-column="0"]')!.click());
    expect(matrix!.querySelector('[role="status"]')!.textContent).toContain("growth shift 0pp");
    expect(matrix!.querySelector('[role="status"]')!.textContent).toContain("margin shift 0pp");
    expect(matrix!.querySelector('[role="status"]')!.textContent).toContain("Recorded value (unrounded): 0");
    expect(matrix!.querySelector('button[data-matrix-row="1"]')).toBeNull();
    expect(matrix!.textContent).toContain("axis context was not recorded");
    expect(matrix!.textContent).toContain("Recorded sustained-margin convention");
  });
});
