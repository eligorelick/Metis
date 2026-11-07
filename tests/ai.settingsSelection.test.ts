// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AiConnections } from "@/app/settings/AiConnections";
import { PROVIDER_CREDENTIALS_CHANGED } from "@/settings/credentialContracts";
let container: HTMLDivElement; let root: Root; let paid: boolean;
beforeEach(() => {
  paid = false; vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ selection: { provider: paid ? "anthropic" : "none" }, selectionIsDefault: true, hasAnthropicKey: paid, connections: [], pending: null, geminiInstalled: false })));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
it("follows a newly saved billed default in the dropdown (SEC-206)", async () => {
  await act(async () => root.render(createElement(AiConnections)));
  expect(container.querySelector("select")!.value).toBe("none");
  paid = true; await act(async () => { window.dispatchEvent(new Event(PROVIDER_CREDENTIALS_CHANGED)); });
  expect(container.querySelector("select")!.value).toBe("anthropic");
});
it("retains an unsaved selection on credential refresh (SEC-206)", async () => {
  paid = true; await act(async () => root.render(createElement(AiConnections)));
  const select = container.querySelector("select")!;
  await act(async () => { select.value = "none"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await act(async () => { window.dispatchEvent(new Event(PROVIDER_CREDENTIALS_CHANGED)); });
  expect(select.value).toBe("none");
});
it("saves the local Claude account, model and effort without adding ChatGPT speed settings", async () => {
  const view = { selection: { provider: "none" }, hasAnthropicKey: false, geminiInstalled: false, claudeInstalled: true, pending: null,
    connections: [{ provider: "claude", id: "claude-account", label: "Your local Claude Code account", connected: true, planEnabled: true }] };
  const request = vi.fn(async () => Response.json(view)); vi.stubGlobal("fetch", request);
  await act(async () => root.render(createElement(AiConnections)));
  expect(container.textContent).toContain("claude auth login");
  const select = container.querySelector("select")!;
  await act(async () => { select.value = "claude-account"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  const model = container.querySelector<HTMLInputElement>('input[list="claude-models"]')!;
  expect(model.value).toBe("default");
  const effort = container.querySelectorAll("select")[1];
  await act(async () => { effort.value = "high"; effort.dispatchEvent(new Event("change", { bubbles: true })); });
  await act(async () => { Array.from(container.querySelectorAll("button")).find(b => b.textContent === "Save report connection")!.click(); });
  expect(request).toHaveBeenLastCalledWith("/api/ai/connections", expect.objectContaining({ method: "POST", body: JSON.stringify({ action: "select", selection: { provider: "claude", connectionId: "claude-account", model: "default", effort: "high" } }) }));
});
