import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { RunsOn } from "@/app/company/[symbol]/GenerateReport";

describe("GenerateReport — the route a report will run on", () => {
  it("names the route and links to Settings", () => {
    const html = renderToStaticMarkup(createElement(RunsOn, { route: { label: "ChatGPT plan · gpt-6.1-sol · max effort", ready: true } }));
    expect(html).toContain("Next run");
    expect(html).not.toContain("Runs on");
    expect(html).toContain("ChatGPT plan · gpt-6.1-sol · max effort");
    expect(html).toContain('href="/settings"');
    expect(html).not.toContain("text-warn");
  });
  it("says plainly when the route is not ready", () => {
    const html = renderToStaticMarkup(createElement(RunsOn, { route: { label: "ChatGPT plan · sign-in needed", ready: false } }));
    expect(html).toContain("ChatGPT plan · sign-in needed");
    expect(html).toContain("text-warn");
  });
  it("renders nothing when the route is unknown", () => {
    expect(renderToStaticMarkup(createElement(RunsOn, { route: null }))).toBe("");
    expect(renderToStaticMarkup(createElement(RunsOn, {}))).toBe("");
  });
});
