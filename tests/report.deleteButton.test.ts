// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const nav = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
import { DeleteReportButton } from "@/components/report/DeleteReportButton";
let root: Root; let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ deleted: 42 })));
  nav.refresh.mockReset(); nav.replace.mockReset();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
it("requires confirmation and navigates away only after successful deletion", async () => {
  await act(async () => root.render(createElement(DeleteReportButton, { reportId: 42, symbol: "DEMO", redirect: true })));
  await act(async () => container.querySelector("button")!.click());
  expect(fetch).not.toHaveBeenCalled(); expect(container.textContent).toContain("Delete saved run #42?");
  await act(async () => container.querySelector("button")!.click());
  expect(fetch).toHaveBeenCalledWith("/api/report/view/42?symbol=DEMO", { method: "DELETE" });
  expect(nav.replace).toHaveBeenCalledWith("/company/DEMO/history"); expect(nav.refresh).toHaveBeenCalled();
});
it("keeps the run on screen when the server refuses deletion", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "This run is still active." }, { status: 409 })));
  await act(async () => root.render(createElement(DeleteReportButton, { reportId: 42, symbol: "DEMO", redirect: true })));
  await act(async () => container.querySelector("button")!.click()); await act(async () => container.querySelector("button")!.click());
  expect(container.querySelector('[role="alert"]')!.textContent).toContain("still active");
  expect(nav.replace).not.toHaveBeenCalled(); expect(nav.refresh).not.toHaveBeenCalled();
});
