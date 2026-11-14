// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AiConnections } from "@/app/settings/AiConnections";
import { PROVIDER_CREDENTIALS_CHANGED } from "@/settings/credentialContracts";
let container: HTMLDivElement; let root: Root; let paid: boolean;
beforeEach(() => {
  paid = false; vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ selection: { provider: paid ? "anthropic" : "none" }, selectionIsDefault: true, hasAnthropicKey: paid, connections: [], pending: null })));
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
  const view = { selection: { provider: "none" }, hasAnthropicKey: false, claudeInstalled: true, pending: null,
    connections: [{ provider: "claude", id: "claude-account", label: "Your local Claude Code account", connected: true, planEnabled: true }] };
  const request = vi.fn(async () => Response.json(view)); vi.stubGlobal("fetch", request);
  await act(async () => root.render(createElement(AiConnections)));
  expect(container.textContent).toContain("claude auth login");
  const select = container.querySelector("select")!;
  await act(async () => { select.value = "claude-account"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  const model = container.querySelectorAll("select")[1];
  expect(model.value).toBe("default");
  const effort = container.querySelectorAll("select")[2];
  await act(async () => { effort.value = "high"; effort.dispatchEvent(new Event("change", { bubbles: true })); });
  await act(async () => { Array.from(container.querySelectorAll("button")).find(b => b.textContent === "Save report connection")!.click(); });
  expect(request).toHaveBeenLastCalledWith("/api/ai/connections", expect.objectContaining({ method: "POST", body: JSON.stringify({ action: "select", selection: { provider: "claude", connectionId: "claude-account", model: "default", effort: "high" } }) }));
});
const claudeView = (selection: object) => ({ selection, hasAnthropicKey: false, claudeInstalled: true, pending: null,
  connections: [{ provider: "claude", id: "claude-account", label: "Your local Claude Code account", connected: true, planEnabled: true }] });
const change = async (el: HTMLSelectElement | HTMLInputElement, value: string) => {
  // React tracks the last value it wrote, so set through the native setter for the change to register.
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value); el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true })); });
};
const save = async () => act(async () => { Array.from(container.querySelectorAll("button")).find(b => b.textContent === "Save report connection")!.click(); });
it("offers every Claude model alias while another one is selected", async () => {
  const request = vi.fn(async () => Response.json(claudeView({ provider: "claude", connectionId: "claude-account", model: "default" }))); vi.stubGlobal("fetch", request);
  await act(async () => root.render(createElement(AiConnections)));
  const model = container.querySelectorAll("select")[1];
  expect(model.value).toBe("default");
  // A free-text box with suggestions hides every suggestion that does not match the text already in it.
  expect(container.querySelector("input[list]")).toBeNull();
  expect(Array.from(model.options).map(o => o.value)).toEqual(["default", "opus", "sonnet", "haiku", "fable", "best", "custom"]);
  await change(model, "opus");
  await save();
  expect(request).toHaveBeenLastCalledWith("/api/ai/connections", expect.objectContaining({ body: JSON.stringify({ action: "select", selection: { provider: "claude", connectionId: "claude-account", model: "opus" } }) }));
});
it("accepts a full Claude model ID and shows a saved one", async () => {
  const request = vi.fn(async () => Response.json(claudeView({ provider: "claude", connectionId: "claude-account", model: "claude-opus-5-5" }))); vi.stubGlobal("fetch", request);
  await act(async () => root.render(createElement(AiConnections)));
  const model = container.querySelectorAll("select")[1];
  expect(model.value).toBe("custom");
  const id = container.querySelector<HTMLInputElement>('input[aria-label="Claude model ID"]')!;
  expect(id.value).toBe("claude-opus-5-5");
  // Deleting the saved ID to type another must keep the box open, not fall back to an alias.
  await change(id, "");
  expect(container.querySelector('input[aria-label="Claude model ID"]')).toBe(id);
  expect(model.value).toBe("custom");
  expect(Array.from(container.querySelectorAll("button")).find(b => b.textContent === "Save report connection")!.disabled).toBe(true);
  await change(model, "sonnet");
  expect(container.querySelector('input[aria-label="Claude model ID"]')).toBeNull();
  await change(model, "custom");
  const save_ = Array.from(container.querySelectorAll("button")).find(b => b.textContent === "Save report connection")!;
  expect(save_.disabled).toBe(true);
  await change(container.querySelector<HTMLInputElement>('input[aria-label="Claude model ID"]')!, "claude-fable-5-2");
  await save();
  expect(request).toHaveBeenLastCalledWith("/api/ai/connections", expect.objectContaining({ body: JSON.stringify({ action: "select", selection: { provider: "claude", connectionId: "claude-account", model: "claude-fable-5-2" } }) }));
});
