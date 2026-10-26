// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReportNotes, reportNotesKey } from "@/components/report/ReportNotes";

let container: HTMLDivElement; let root: Root;
let visited: Map<string, { symbol: string; reportId: number }>;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); localStorage.clear(); visited = new Map(); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => {
  vi.restoreAllMocks();
  // Resolve this test's deliberately blocked drafts through the real UI. Tab
  // memory intentionally outlives an editor; production needs no test reset API.
  for (const { symbol, reportId } of [...visited.values()]) {
    await render(symbol, reportId);
    const resolve = [...container.querySelectorAll("button")].find(node => node.textContent === "Save note" || node.textContent === "Keep this version");
    if (resolve) await act(async () => resolve.click());
  }
  await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals();
});
async function render(symbol = "DEMO", reportId = 31) {
  const key = reportNotesKey(symbol, reportId);
  if (key) visited.set(key, { symbol, reportId });
  await act(async () => root.render(createElement(ReportNotes, { symbol, reportId })));
}
function editor() { return container.querySelector<HTMLTextAreaElement>("textarea")!; }
async function write(text: string) { await act(async () => { editor().value = text; editor().dispatchEvent(new InputEvent("input", { bubbles: true })); }); }
async function button(label: string) { await act(async () => [...container.querySelectorAll("button")].find(node => node.textContent === label)!.click()); }
describe("browser-local notes for one saved report", () => {
  it("stores every edit immediately, renders plain text and isolates report and issuer identities", async () => {
    expect(reportNotesKey("BRK-B", 31)).toBe(reportNotesKey("brk.b", 31));
    await render(); const text = '<script>alert("note")</script>\nResearch question, not generated analysis.';
    await write(text); expect(localStorage.getItem(reportNotesKey("DEMO",31)!)).toBe(text);
    expect(container.querySelector("script")).toBeNull(); expect(container.textContent).toContain("Saved in this browser");
    expect(container.textContent).toContain("not part of the generated research or exports");
    await render("DEMO", 32); expect(editor().value).toBe(""); await write("Second report note");
    await render("DBNK", 31); expect(editor().value).toBe("");
    await render("DEMO", 31); expect(editor().value).toBe(text);
  });
  it("restores a persisted note after an actual editor unmount", async () => {
    await render("DEMO", 41); await write("Retained without a debounce window");
    await act(async () => root.render(createElement("p", null, "Another page")));
    await render("DEMO",41); expect(editor().value).toBe("Retained without a debounce window");
  });
  it("retains an unsaved draft across report switches and exposes blocked/quota failures", async () => {
    const backing = window.localStorage;
    const writeFailure = vi.spyOn(window,"localStorage","get").mockReturnValue({ getItem: (key: string) => backing.getItem(key), setItem() { throw new DOMException("Private quota details", "QuotaExceededError"); } } as unknown as Storage);
    await render("DEMO",51); await write("Unsaved draft survives navigation");
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Unsaved");
    expect(container.querySelector('.report-notes > summary')?.textContent).toContain("Unsaved");
    expect(container.textContent).not.toContain("Private quota details");
    const leaving = new Event("beforeunload", { cancelable:true }); window.dispatchEvent(leaving); expect(leaving.defaultPrevented).toBe(true);
    await render("DEMO",52); await render("DEMO",51); expect(editor().value).toBe("Unsaved draft survives navigation");
    writeFailure.mockRestore(); await button("Save note");
    expect(localStorage.getItem(reportNotesKey("DEMO",51)!)).toBe("Unsaved draft survives navigation");
    expect(container.textContent).toContain("Saved in this browser");
  });
  it("keeps unload protection for a retained draft after navigating away from every editor", async () => {
    const backing = window.localStorage;
    const blocked = vi.spyOn(window,"localStorage","get").mockReturnValue({ getItem: (key: string) => backing.getItem(key), setItem() { throw new DOMException("quota", "QuotaExceededError"); } } as unknown as Storage);
    await render("DEMO",101); await write("Protect this draft on another page");
    await act(async () => root.render(createElement("p", null, "Settings page")));
    const leaving = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(leaving);
    expect(leaving.defaultPrevented).toBe(true);
    await render("DEMO",101); expect(editor().value).toBe("Protect this draft on another page");
    blocked.mockRestore(); await button("Save note");
    const saved = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(saved);
    expect(saved.defaultPrevented).toBe(false);
  });
  it("does not call a silently ignored write saved, and handles unavailable reads", async () => {
    const backing = window.localStorage;
    vi.spyOn(window,"localStorage","get").mockReturnValue({ getItem: (key: string) => backing.getItem(key), setItem() {} } as unknown as Storage);
    await render("DEMO",61); await write("Ignored storage write"); expect(container.textContent).toContain("Unsaved");
    vi.restoreAllMocks(); vi.spyOn(window,"localStorage","get").mockReturnValue({ getItem() { throw new Error("Private denied details"); }, setItem: (key: string, value: string) => backing.setItem(key,value) } as unknown as Storage);
    await render("DEMO",62); expect(container.textContent).toContain("Storage is unavailable");
    await write("Still editable"); expect(editor().value).toBe("Still editable"); expect(container.textContent).not.toContain("Private denied details");
  });
  it("preserves both versions when another tab changes the same note", async () => {
    await render("DEMO",71); await write("My version"); const key = reportNotesKey("DEMO",71)!;
    localStorage.setItem(key,"Other tab version");
    await act(async () => window.dispatchEvent(new StorageEvent("storage", { key, newValue:"Other tab version", storageArea:localStorage })));
    expect(editor().value).toBe("My version"); expect(editor().readOnly).toBe(true);
    expect(container.textContent).toContain("Changed in another tab");
    await render("DEMO",72); await render("DEMO",71); expect(editor().readOnly).toBe(true);
    await button("Use stored version");
    expect(editor().value).toBe("Other tab version"); expect(editor().readOnly).toBe(false);
  });
  it.each(["Other version 3", null])("refreshes a retained conflict after a stored change while its editor is unmounted: %s", async latest => {
    await render("DEMO",111); await write("My retained version"); const key = reportNotesKey("DEMO",111)!;
    localStorage.setItem(key,"Other version 2");
    await act(async () => window.dispatchEvent(new StorageEvent("storage", { key, newValue:"Other version 2", storageArea:localStorage })));
    await render("DEMO",112);
    if (latest === null) localStorage.removeItem(key); else localStorage.setItem(key, latest);
    await render("DEMO",111);
    expect(editor().value).toBe("My retained version"); expect(editor().readOnly).toBe(true);
    expect(container.querySelector("pre")?.textContent).toBe(latest ?? "");
    await button("Use stored version");
    expect(editor().value).toBe(latest ?? "");
    expect(container.textContent).toContain(latest === null ? "No note saved" : "Saved in this browser");
    expect(localStorage.getItem(key)).toBe(latest);
  });
  it("resolves a conflict from current storage rather than the last observed event", async () => {
    await render("DEMO",121); await write("My retained version"); const key = reportNotesKey("DEMO",121)!;
    localStorage.setItem(key,"Other version 2");
    await act(async () => window.dispatchEvent(new StorageEvent("storage", { key, newValue:"Other version 2", storageArea:localStorage })));
    localStorage.setItem(key,"Other version 3");
    await button("Use stored version");
    expect(editor().value).toBe("Other version 3"); expect(localStorage.getItem(key)).toBe("Other version 3");
    expect(container.textContent).toContain("Saved in this browser");
  });
  it("keeps the local conflict and unload protection when the current stored version cannot be read", async () => {
    await render("DEMO",131); await write("My retained version"); const key = reportNotesKey("DEMO",131)!;
    localStorage.setItem(key,"Other version 2");
    await act(async () => window.dispatchEvent(new StorageEvent("storage", { key, newValue:"Other version 2", storageArea:localStorage })));
    const blocked = vi.spyOn(window,"localStorage","get").mockImplementation(() => { throw new Error("Private storage denial"); });
    await button("Use stored version");
    expect(editor().value).toBe("My retained version"); expect(editor().readOnly).toBe(true);
    expect(container.querySelector('[role="status"]')?.textContent).toContain("could not be read");
    expect(container.textContent).not.toContain("Saved in this browser"); expect(container.textContent).not.toContain("Private storage denial");
    const leaving = new Event("beforeunload", { cancelable:true }); window.dispatchEvent(leaving); expect(leaving.defaultPrevented).toBe(true);
    blocked.mockRestore(); await button("Use stored version"); expect(editor().value).toBe("Other version 2");
  });
  it("distinguishes another tab clearing a note from a saved empty note", async () => {
    await render("DEMO",81); await write("Retain me until I choose"); const key = reportNotesKey("DEMO",81)!;
    localStorage.removeItem(key);
    await act(async () => window.dispatchEvent(new StorageEvent("storage",{key,newValue:null,storageArea:localStorage})));
    expect(editor().value).toBe("Retain me until I choose"); await button("Use stored version");
    expect(editor().value).toBe(""); expect(container.textContent).toContain("No note saved");
  });
  it.each([["../DEMO",31],["DEMO",0],["DEMO",Number.NaN]] as const)("withholds notes for invalid identity %s/%s", async (symbol,id) => {
    await render(symbol,id); expect(editor()).toBeNull(); expect(reportNotesKey(symbol,id)).toBeNull();
  });
});
