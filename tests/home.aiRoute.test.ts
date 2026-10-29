import { PassThrough } from "node:stream";
import type { ReactElement } from "react";
import { renderToPipeableStream } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  redesign: false,
  route: { provider: "chatgpt", model: "gpt-6.1-sol", effort: "max", ready: true, label: "ChatGPT plan · gpt-6.1-sol · max effort" } as unknown,
  throws: false,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/config/env", () => ({
  getConfig: () => ({ fixtureMode: true, hasFmpKey: false, hasFinnhubKey: false, hasFredKey: false, hasAnthropicKey: false,
    uiRedesign: h.redesign, analysisModel: "claude-opus-5-5" }),
}));
vi.mock("@/ai/connections", () => ({
  describeAnalysisRoute: () => { if (h.throws) throw new Error("store unreadable"); return h.route; },
}));
vi.mock("@/watchlist/watchlist", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/watchlist/watchlist")>()), getWatchlistView: vi.fn(async () => []) }));
vi.mock("@/components/watchlist/AddTicker", () => ({ AddTicker: () => null }));
vi.mock("@/components/watchlist/RemoveButton", () => ({ RemoveButton: () => null }));
vi.mock("@/components/watchlist/RunsDisclosure", () => ({ RunsDisclosure: () => null }));

import Home from "@/app/page";

function renderAsync(node: ReactElement): Promise<string> {
  return new Promise((resolve, reject) => {
    let html = "";
    const sink = new PassThrough();
    sink.on("data", (chunk) => { html += String(chunk); });
    sink.on("end", () => resolve(html));
    const stream = renderToPipeableStream(node, { onAllReady: () => stream.pipe(sink), onError: reject });
  });
}

beforeEach(() => {
  h.redesign = false; h.throws = false;
  h.route = { provider: "chatgpt", model: "gpt-6.1-sol", effort: "max", ready: true, label: "ChatGPT plan · gpt-6.1-sol · max effort" };
});

describe.each([[false, "classic"], [true, "redesign"]])("Home AI route (redesign=%s, %s)", (redesign) => {
  it("shows the route reports run on, with a Settings link, not the env default as the analysis model", async () => {
    h.redesign = redesign;
    const html = await renderAsync(await Home());
    expect(html).toContain("Reports run on");
    expect(html).toContain("ChatGPT plan · gpt-6.1-sol · max effort");
    expect(html).not.toContain("analysis model (env default)");
    expect(html).not.toContain("Environment model default");
    expect(html).toContain('href="/settings"');
  });
  it("says plainly when the route is not ready, and survives an unreadable store", async () => {
    h.redesign = redesign;
    h.route = { provider: "chatgpt", model: "gpt-6.1-sol", effort: "max", ready: false, label: "ChatGPT plan · sign-in needed" };
    expect(await renderAsync(await Home())).toContain("ChatGPT plan · sign-in needed");
    h.throws = true;
    expect(await renderAsync(await Home())).toContain("unavailable");
  });
});
