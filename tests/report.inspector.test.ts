// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EvidenceInspector } from "@/components/report/EvidenceInspector";
import { ClaimText } from "@/components/report/ClaimText";
import { TracedNumberSourceDetails } from "@/components/report/primitives";
import type { TracedNumber } from "@/report/schema";
import { SourceEvidenceCatalog } from "@/components/report/SourceEvidenceCatalog";
import { loadTask28Fixture } from "./helpers/task28Report";

let container: HTMLDivElement;
let root: Root;
let mobile = false;
const mediaListeners = new Set<() => void>();
const number: TracedNumber = { value: -10.125, unit: "currency", currency: "EUR", period: "FY2025",
  sourceId: "filing:original", source: "recorded-source", asOf: "2025-11-01", verified: false, verificationNote: "Original citation unresolved" };

beforeEach(() => {
  mobile = false;
  mediaListeners.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: mobile, addEventListener(_event: string, listener: () => void) { mediaListeners.add(listener); }, removeEventListener(_event: string, listener: () => void) { mediaListeners.delete(listener); } }));
  // happy-dom does not implement the browser's native modal top layer.
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function (this: HTMLDialogElement) { this.open = true; });
  vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (this: HTMLDialogElement) { this.open = false; });
  container = document.createElement("div");
  container.className = "thesis-report";
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

async function render(identity = "DEMO:report:31", count = 1) {
  await act(async () => root.render(createElement("div", null,
    ...Array.from({ length: count }, (_, i) => createElement(ClaimText, { key: i, claim: { label: "FACT", text: `Recorded claim ${i}`, source: "filing:claim", sourceId: `claim:${i}`, asOf: "2024-10-01" } })),
    createElement(TracedNumberSourceDetails, { n: number }),
    createElement(TracedNumberSourceDetails, { n: { ...number, value: 0, period: "FY2024", asOf: null, currency: undefined } }),
    createElement("aside", { "aria-label": "Report evidence and gaps" },
      createElement("p", null, "Completeness unknown · Recorded gap: unavailable segment disclosure"),
      createElement(EvidenceInspector, { reportIdentity: identity })),
  )));
}
function inspector() { return container.querySelector<HTMLElement>('[aria-label="Selected evidence"]')!; }
function sources() { return [...container.querySelectorAll<HTMLDetailsElement>("details[data-evidence-key]")]; }
async function click(element: Element) { await act(async () => element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }))); }
function button(label: string) { return [...container.querySelectorAll("button")].find(node => node.textContent === label)!; }

describe("one report-bound evidence controller", () => {
  it("pins the original figure context without expanding its native disclosure or displacing the gap warning", async () => {
    await render();
    const original = sources()[1];
    await click(original.querySelector("summary")!);
    expect(original.open).toBe(false);
    for (const recorded of ["-10.125", "EUR", "FY2025", "2025-11-01", "filing:original", "untraced", "Original citation unresolved"]) {
      expect(inspector().textContent).toContain(recorded);
    }
    expect(container.textContent).toContain("Completeness unknown");
    await click(sources()[2].querySelector("summary")!);
    expect(inspector().textContent).toContain("FY2024");
    expect(inspector().textContent).toContain("recorded value 0");
    expect(inspector().textContent).toContain("as of not recorded");
    expect(inspector().textContent).not.toContain("EUR");
    expect(inspector().textContent).not.toContain("FY2025");
  });

  it("keeps a claim's observation date and clears the selected context when the report identity changes", async () => {
    await render();
    await click(sources()[0].querySelector("summary")!);
    expect(inspector().textContent).toContain("FACT · Recorded claim 0");
    expect(inspector().textContent).toContain("2024-10-01");
    expect(inspector().textContent).toContain("claim:0");
    await render("DEMO:report:34");
    expect(inspector().textContent).toContain("Select a claim or a figure");
    expect(inspector().textContent).not.toContain("claim:0");
    await render("DEMO:report:31");
    expect(inspector().textContent).not.toContain("claim:0");
  });

  it("opens a mobile modal and returns focus to the selected summary on Escape", async () => {
    mobile = true;
    await render();
    const trigger = sources()[1].querySelector<HTMLElement>("summary")!;
    trigger.focus();
    await click(trigger);
    const dialog = container.querySelector("dialog")!;
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain("FY2025");
    expect(dialog.contains(document.activeElement)).toBe(true);
    const previous = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
    await act(async () => document.activeElement!.dispatchEvent(previous));
    expect(previous.defaultPrevented).toBe(true);
    expect(dialog.contains(document.activeElement)).toBe(true);
    await act(async () => dialog.dispatchEvent(new Event("cancel", { bubbles: false, cancelable: true })));
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute("aria-expanded")).not.toBe("true");
  });

  it("expands all 105 native sources and collapses source details without hiding the full claims", async () => {
    await render("DEMO:large", 105);
    expect(container.querySelectorAll('[aria-label="Selected evidence"]')).toHaveLength(1);
    await click(button("Expand all sources"));
    expect(sources()).toHaveLength(107);
    expect(sources().every(node => node.open)).toBe(true);
    await click(button("Collapse source details"));
    expect(sources().every(node => !node.open)).toBe(true);
    expect(container.textContent).toContain("Recorded claim 104");
  });

  it("copies only escaped recorded content and does not infer a filing link from a source string", async () => {
    await act(async () => root.render(createElement("div", null,
      createElement(TracedNumberSourceDetails, { n: { ...number, source: '<script>alert("source")</script>', sourceId: '<img src=x onerror="alert(1)">' } }),
      createElement(EvidenceInspector, { reportIdentity: "unsafe-text:1" }),
    )));
    await click(sources()[0].querySelector("summary")!);
    expect(inspector().textContent).toContain('<script>alert("source")</script>');
    expect(inspector().querySelector("script,img,a")).toBeNull();
  });

  it("preserves modified-click native behavior and closes desktop selection with Escape", async () => {
    await render();
    const trigger = sources()[0].querySelector<HTMLElement>("summary")!;
    const modified = new MouseEvent("click", { ctrlKey: true, bubbles: true, cancelable: true });
    await act(async () => trigger.dispatchEvent(modified));
    expect(modified.defaultPrevented).toBe(false);
    expect(inspector().textContent).toContain("Select a claim or a figure");
    await click(trigger);
    await act(async () => trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(inspector().textContent).toContain("Select a claim or a figure");
    expect(document.activeElement).toBe(trigger);
  });

  it("retains the selected origin and focus return when resizing between desktop and mobile", async () => {
    await render();
    const trigger = sources()[1].querySelector<HTMLElement>("summary")!;
    await click(trigger);
    await act(async () => { mobile = true; mediaListeners.forEach(listener => listener()); });
    expect(container.querySelector("dialog")!.open).toBe(true);
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    await act(async () => { mobile = false; mediaListeners.forEach(listener => listener()); });
    expect(container.querySelector("dialog")!.open).toBe(false);
    expect(inspector().textContent).toContain("FY2025");
    await click(button("Close evidence"));
    expect(document.activeElement).toBe(trigger);
  });

  it("joins additional filing context only for the exact recorded identity, amount, currency and period", async () => {
    const report = loadTask28Fixture();
    report.sourceFactSummary = {
      version: "1.0.0", status: "available", reason: null, qualifier: "as reported",
      rows: [{ metric: "revenue", label: "Reported revenue", definition: "reported-statement-line-item", value: 1200, unit: "currency", currency: "EUR", period: "2025-12-31",
        periodContext: { kind: "duration", start: "2025-01-01", end: "2025-12-31" }, source: "filing:revenue:2025", asOf: "2026-02-01", provenanceId: "filing:revenue:2025", origin: "Original filing reference 0000123456-26-000001", qualifier: "as reported", canonicalText: "Reported revenue was 1,200 EUR." }],
      earningsReconciliation: { status: "unavailable", reason: "Operands missing", method: null, pretaxMinusTax: null, reconciledNetIncome: null, reportedNetIncome: null, residual: null, operandIds: [], explanation: "No reconciliation was recorded." },
    };
    const row = report.sourceFactSummary.rows[0];
    const observation = { ...row, sourceId: row.provenanceId, verified: null };
    await act(async () => root.render(createElement("div", null,
      createElement(SourceEvidenceCatalog, { report }),
      createElement(TracedNumberSourceDetails, { n: observation }),
      createElement(TracedNumberSourceDetails, { n: { ...observation, currency: "USD" } }),
      createElement(TracedNumberSourceDetails, { n: { ...observation, period: "2024-12-31" } }),
      createElement(TracedNumberSourceDetails, { n: { ...observation, sourceId: "filing:revenue" } }),
      createElement(EvidenceInspector, { reportIdentity: "context:1" }),
    )));
    await click(sources()[0].querySelector("summary")!);
    expect(inspector().textContent).toContain("Original filing reference 0000123456-26-000001");
    expect(inspector().textContent).toContain("Reported revenue was 1,200 EUR.");
    for (const disclosure of sources().slice(1)) {
      await click(disclosure.querySelector("summary")!);
      expect(inspector().textContent).not.toContain("Original filing reference");
      expect(inspector().textContent).toContain("No additional structured filing context is recorded for this observation");
    }
  });
});
