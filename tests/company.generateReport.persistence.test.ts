// @vitest-environment happy-dom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UiDesignProvider } from "@/appearance/UiDesignProvider";
import { GenerateReport } from "@/app/company/[symbol]/GenerateReport";
import { PIPELINE_STEPS } from "@/types/core";

const router = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
class Stream {
  static opened: Stream[] = [];
  listeners = new Map<string, (event: MessageEvent) => void>();
  closed = false;
  readyState = 1;
  constructor(readonly url: string) { Stream.opened.push(this); }
  addEventListener(name: string, listener: (event: MessageEvent) => void) { this.listeners.set(name, listener); }
  close() { this.closed = true; }
  emit(name: string, value?: unknown) { this.listeners.get(name)?.(new MessageEvent(name, { data: JSON.stringify(value) })); }
}
let container: HTMLDivElement; let root: Root;
const fetcher = vi.fn();
function snapshot(overrides: Record<string, unknown> = {}) {
  return { jobId: "job-A", revision: 0, symbol: "DEMO", status: "queued",
    steps: PIPELINE_STEPS.map(step => ({ step, status: "pending" })),
    createdAt: "2026-10-24T00:00:00.000Z", updatedAt: "2026-10-24T00:00:00.000Z",
    error: null, reportId: null, verificationRate: null, totalCostUsd: 0,
    dataOnly: false, resumable: false, settlementsPending: false, unsupported: null, ...overrides };
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("EventSource", Stream); vi.stubGlobal("fetch", fetcher);
  Stream.opened = []; fetcher.mockReset(); router.refresh.mockReset(); router.replace.mockReset();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { vi.useRealTimers(); await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function render(symbol = "DEMO", initialJobId: string | null = "job-A", liveView = false, layout: "classic" | "dossier" = "dossier") {
  await act(async () => root.render(createElement(StrictMode, null,
    createElement(UiDesignProvider, { initialDesign: "current", layout },
      createElement(GenerateReport, { key: symbol, symbol, initialJobId, liveView })))));
}
describe("saved-page attachment to an authoritative active run", () => {
  it.each([false, true])("JOB-215 updates saved research once per completed job (live=%s)", async (live) => {
    await render("DEMO", "job-A", live); const stream = Stream.opened.at(-1)!;
    await act(async () => stream.emit("snapshot", snapshot({ status: "running" })));
    await act(async () => stream.emit("snapshot", snapshot({ revision: 1, status: "done", settlementsPending: true })));
    await act(async () => stream.emit("snapshot", snapshot({ revision: 2, status: "done", settlementsPending: false })));
    expect(router.refresh).toHaveBeenCalledTimes(live ? 0 : 1);
    expect(router.replace).toHaveBeenCalledTimes(live ? 1 : 0);
    if (live) expect(router.replace).toHaveBeenCalledWith("/company/DEMO", { scroll: false });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["classic", "dossier"] as const)("P4-1 already-done resumable attachment stays on live view (%s)", async (layout) => {
    await render("DEMO", "job-A", true, layout);
    await act(async () => Stream.opened.at(-1)!.emit("snapshot", snapshot({ status: "done", dataOnly: true, resumable: true })));
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
    expect(container.textContent).toMatch(/Retry/i);
    expect(container.textContent).toContain("Generate starts a new run that runs every pass again, at full cost on a paid connection.");
  });
  it("P4-1 saved-page terminal attachment does not refresh on load", async () => {
    await render();
    await act(async () => Stream.opened.at(-1)!.emit("snapshot", snapshot({ status: "done", resumable: true })));
    expect(router.refresh).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });
  it("JOB-214 clears reconnect warning on open with an unchanged revision", async () => {
    await render(); const stream = Stream.opened.at(-1)!;
    await act(async () => stream.emit("snapshot", snapshot({ status: "running" })));
    await act(async () => stream.emit("error"));
    expect(container.textContent).toMatch(/reconnect/i);
    await act(async () => stream.emit("open"));
    expect(container.textContent).not.toMatch(/reconnecting/i);
  });
  it.each(["classic", "dossier"] as const)("JOB-214 reopens CLOSED streams without posting work (%s)", async (layout) => {
    vi.useFakeTimers(); await render("DEMO", "job-A", false, layout); const stream = Stream.opened.at(-1)!;
    const count = Stream.opened.length;
    stream.readyState = 2;
    await act(async () => stream.emit("error"));
    await act(async () => vi.advanceTimersByTimeAsync(1001));
    expect(Stream.opened).toHaveLength(count + 1);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["classic", "dossier"] as const)("P4-7 stops CLOSED reconnects and GETs once (%s)", async (layout) => {
    vi.useFakeTimers();
    fetcher.mockResolvedValue(new Response(JSON.stringify(snapshot({ revision: 8, status: "error", error: "stopped", resumable: true }))));
    await render("DEMO", "job-A", false, layout);
    const initialCount = Stream.opened.length;
    for (const delay of [1000, 2000, 5000, 10000, 30000]) {
      const stream = Stream.opened.at(-1)!; stream.readyState = 2;
      await act(async () => stream.emit("error"));
      await act(async () => vi.advanceTimersByTimeAsync(delay));
    }
    const last = Stream.opened.at(-1)!; last.readyState = 2;
    await act(async () => { last.emit("error"); last.emit("error"); await Promise.resolve(); });
    await act(async () => vi.advanceTimersByTimeAsync(120000));
    expect(Stream.opened).toHaveLength(initialCount + 5);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith("/api/report/job-A", { method: "GET" });
    expect(container.textContent).toMatch(/live connection lost/i);
    expect(container.textContent).toContain("stopped");
    expect(container.textContent).toMatch(/Retry/i);
  });
  it("JOB-213 accepts a snapshot under the other share-class spelling", async () => {
    await render("BRK-B");
    await act(async () => Stream.opened.at(-1)!.emit("snapshot", snapshot({
      symbol: "BRK.B", status: "running", totalCostUsd: 1.25 })));
    expect(container.textContent).toContain("1.2500");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not present report generation as usable before hydration", () => {
    const html = renderToStaticMarkup(createElement(UiDesignProvider,{initialDesign:"current",layout:"dossier"},createElement(GenerateReport,{symbol:"DEMO"})));
    expect(html).toMatch(/<button[^>]+disabled=""[^>]*>Generate report<\/button>/);
  });
  it("attaches after reload and StrictMode without creating or paying for a job", async () => {
    await render();
    expect(fetcher).not.toHaveBeenCalled();
    expect(Stream.opened.filter(stream => !stream.closed)).toHaveLength(1);
    expect(Stream.opened.at(-1)!.url).toBe("/api/report/job-A/stream");
    expect(container.textContent).toContain("Connecting to existing run");
    expect(container.querySelector("ol")).toBeNull();
    await act(async () => Stream.opened.at(-1)!.emit("snapshot", snapshot()));
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Queued");
    expect(container.querySelectorAll("ol li")).toHaveLength(7);
  });
  it("discloses reconnection and ignores wrong-issuer or regressing frames", async () => {
    await render(); const stream = Stream.opened.at(-1)!;
    await act(async () => stream.emit("snapshot", snapshot({ revision: 3, status: "running" })));
    await act(async () => stream.emit("error"));
    expect(container.textContent).toContain("Connection interrupted");
    await act(async () => stream.emit("snapshot", snapshot({ revision: 4, symbol: "OTHER", error: "wrong issuer" })));
    expect(container.textContent).not.toContain("wrong issuer");
    expect(container.textContent).toContain("Connection interrupted");
    await act(async () => stream.emit("snapshot", snapshot({ revision: 2, status: "queued" })));
    expect(container.querySelector('[role="status"]')?.textContent).not.toContain("Queued");
    await act(async () => stream.emit("snapshot", snapshot({ revision: 5, status: "running" })));
    expect(container.textContent).not.toContain("Connection interrupted");
  });
  it("rebinds a newly observed active job without retaining the old snapshot or starting work", async () => {
    await render(); const old = Stream.opened.at(-1)!;
    await act(async () => old.emit("snapshot", snapshot({ revision: 1, status: "running", totalCostUsd: 1.25 })));
    await render("DEMO", "job-B");
    expect(old.closed).toBe(true); expect(Stream.opened.at(-1)!.url).toBe("/api/report/job-B/stream");
    expect(container.textContent).toContain("Connecting to existing run"); expect(container.textContent).not.toContain("1.2500");
    await act(async () => old.emit("snapshot", snapshot({ revision: 99, error: "obsolete run", status: "error" })));
    expect(container.textContent).not.toContain("obsolete run"); expect(fetcher).not.toHaveBeenCalled();
  });
  it("keeps terminal run details accessible without pushing the saved research below a completed pipeline", async () => {
    await render(); const stream = Stream.opened.at(-1)!;
    await act(async () => stream.emit("snapshot", snapshot({ status: "running" })));
    expect(container.querySelector<HTMLDetailsElement>(".research-run-disclosure")?.open).toBe(true);
    await act(async () => stream.emit("snapshot", snapshot({ revision: 1, status: "done" })));
    const details = container.querySelector<HTMLDetailsElement>(".research-run-disclosure")!;
    expect(details.open).toBe(false); expect(details.querySelectorAll("ol li")).toHaveLength(7);
    expect(details.querySelector("summary")?.textContent).toContain("Completed run");
    expect(router.refresh).toHaveBeenCalledOnce();
  });
  it("closes the old issuer stream and leaves cancellation and retry server-owned", async () => {
    await render(); const stream = Stream.opened.at(-1)!;
    await act(async () => stream.emit("snapshot", snapshot()));
    fetcher.mockResolvedValueOnce({ status: 202 });
    await act(async () => [...container.querySelectorAll("button")].find(node => node.textContent?.trim() === "Cancel run")!.click());
    expect(fetcher).toHaveBeenCalledWith("/api/report/job-A/cancel", { method: "POST" });
    expect(container.textContent).toContain("Cancellation requested");
    await act(async () => stream.emit("snapshot", snapshot({ revision: 1, status: "canceled", resumable: true })));
    fetcher.mockResolvedValueOnce({ status: 409, json: async () => ({ error: "A different run is active" }) });
    await act(async () => [...container.querySelectorAll("button")].find(node => node.textContent?.includes("Resume run"))!.click());
    expect(container.textContent).toContain("A different run is active");
    await render("DBNK", null);
    expect(stream.closed).toBe(true); expect(container.textContent).not.toContain("job-A");
    expect(container.textContent).not.toContain("A different run is active");
  });
});
