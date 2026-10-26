// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UiDesignProvider } from "@/appearance/UiDesignProvider";
import { ExportButtons } from "@/components/report/ExportButtons";

let container: HTMLDivElement; let root: Root;
const fetcher = vi.fn(); const createUrl = vi.fn<(value: Blob | MediaSource) => string>(() => "blob:local-export"); const revokeUrl = vi.fn();
const downloaded: Array<{ href: string; filename: string }> = [];
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("fetch", fetcher);
  fetcher.mockReset(); createUrl.mockClear(); revokeUrl.mockClear(); downloaded.length = 0;
  vi.spyOn(URL, "createObjectURL").mockImplementation(createUrl); vi.spyOn(URL, "revokeObjectURL").mockImplementation(revokeUrl);
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { downloaded.push({ href: this.href, filename: this.download }); });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function render(reportId = 31, symbol = "DEMO") {
  await act(async () => root.render(createElement(UiDesignProvider, { initialDesign: "current", layout: "dossier" }, createElement(ExportButtons, { reportId, symbol }))));
}
async function choose(label: string) {
  const link = [...container.querySelectorAll("a")].find(node => node.textContent === label)!;
  await act(async () => link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
}
function response(body = "# Saved report\nOriginal evidence", filename = "DEMO-report-31.md", status = 200) {
  return new Response(body, { status, headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"` } });
}
describe("selected-report export menu", () => {
  it("retains all real native destinations before enhancement", async () => {
    await render();
    expect(container.querySelector('a[href="/api/export/31?format=md"]')).not.toBeNull();
    expect(container.querySelector('a[href="/api/export/31?format=audit"]')).not.toBeNull();
    expect(container.querySelector('a[href="/company/DEMO/report/31/print?autoprint=1"]')?.getAttribute("target")).toBe("_blank");
  });
  it("downloads the actual response bytes and acknowledges only the browser handoff", async () => {
    await render(); fetcher.mockResolvedValueOnce(response()); await choose("Full report · Markdown");
    expect(fetcher.mock.calls[0]![0]).toBe("/api/export/31?format=md");
    expect(await (createUrl.mock.calls[0]![0] as Blob).text()).toContain("Original evidence");
    expect(downloaded).toEqual([{ href: "blob:local-export", filename: "DEMO-report-31.md" }]);
    expect(container.textContent).toContain("Download handed to your browser");
  });
  it("reports HTTP or malformed export failures without a fake success", async () => {
    await render(); fetcher.mockResolvedValueOnce(response("Unavailable", "DEMO-report-31.md", 422)); await choose("Audit trail · Markdown");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("422"); expect(downloaded).toHaveLength(0);
    fetcher.mockResolvedValueOnce(response("wrong report", "DEMO-report-99.md")); await choose("Full report · Markdown");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("invalid download metadata"); expect(downloaded).toHaveLength(0);
  });
  it("aborts a pending old-report export when report identity changes", async () => {
    let finish!: (value: Response) => void;
    fetcher.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await render(); await choose("Full report · Markdown"); const signal = fetcher.mock.calls[0]![1].signal as AbortSignal;
    await render(32, "DBNK"); expect(signal.aborted).toBe(true);
    await act(async () => finish(response())); expect(downloaded).toHaveLength(0); expect(container.textContent).not.toContain("Download handed");
  });
  it("closes on Escape and returns focus to its summary", async () => {
    await render(); const details = container.querySelector("details")!; details.open = true;
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    await act(async () => details.querySelector("a")!.dispatchEvent(event));
    expect(details.open).toBe(false); expect(event.defaultPrevented).toBe(true); expect(document.activeElement).toBe(details.querySelector("summary"));
  });

  it("keeps an open menu within the viewport after opening or resizing", async () => {
    await render();
    const details = container.querySelector("details")!;
    const menu = container.querySelector("nav")!;
    vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(320);
    const bounds = vi.spyOn(menu, "getBoundingClientRect");
    bounds.mockReturnValue({ left: -122, right: 158 } as DOMRect);
    await act(async () => { details.open = true; details.dispatchEvent(new Event("toggle")); });
    expect(menu.style.getPropertyValue("--export-menu-shift")).toBe("134px");
    bounds.mockReturnValue({ left: 80, right: 360 } as DOMRect);
    await act(async () => window.dispatchEvent(new Event("resize")));
    expect(menu.style.getPropertyValue("--export-menu-shift")).toBe("-52px");
    bounds.mockReturnValue({ left: 14, right: 294 } as DOMRect);
    await act(async () => window.dispatchEvent(new Event("resize")));
    expect(menu.style.getPropertyValue("--export-menu-shift")).toBe("0px");
  });
});
