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

it.each([
  { body: null, status: 405, message: "Restart Metis" },
  { body: "<html>Internal server error</html>", status: 500, message: "Could not delete this run (HTTP 500)" },
  { body: '{"error":', status: 502, message: "Could not delete this run (HTTP 502)" },
  { body: "null", status: 500, message: "Could not delete this run (HTTP 500)" },
  { body: '{"error":{"detail":"internal"}}', status: 500, message: "Could not delete this run (HTTP 500)" },
])("handles an unreadable $status response without hiding the failure behind a JSON error", async ({ body, status, message }) => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response(body, { status }));
  await act(async () => root.render(createElement(DeleteReportButton, { reportId: 42, symbol: "DEMO", redirect: true })));
  await act(async () => container.querySelector("button")!.click());
  await act(async () => container.querySelector("button")!.click());
  expect(container.querySelector('[role="alert"]')!.textContent).toContain(message);
  expect(nav.replace).not.toHaveBeenCalled(); expect(nav.refresh).not.toHaveBeenCalled();
  expect(container.querySelector("button")!.disabled).toBe(false);
  await act(async () => container.querySelector("button")!.click());
  expect(nav.replace).toHaveBeenCalledWith("/company/DEMO/history");
  expect(nav.refresh).toHaveBeenCalledTimes(1);
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

it("accepts an empty successful response and refreshes history without navigating away", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
  await act(async () => root.render(createElement(DeleteReportButton, { reportId: 42, symbol: "DEMO" })));
  await act(async () => container.querySelector("button")!.click());
  await act(async () => container.querySelector("button")!.click());
  expect(nav.replace).not.toHaveBeenCalled(); expect(nav.refresh).toHaveBeenCalledTimes(1);
  expect(container.querySelector('[role="alert"]')).toBeNull();
});
