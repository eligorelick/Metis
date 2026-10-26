// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarNavigation } from "@/components/SidebarNavigation";

let root: Root;
let container: HTMLDivElement;
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(createElement(SidebarNavigation, null, createElement("a", { href:"#company", onClick:(event:React.MouseEvent)=>event.preventDefault() }, "Open company"))));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe("mobile coverage navigation", () => {
  it("closes after choosing a company so it cannot cover the new report", async () => {
    const toggle = container.querySelector("button")!;
    await act(async () => toggle.click());
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    await act(async () => container.querySelector("a")!.click());
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });
  it("supports Escape and returns focus to the disclosure control", async () => {
    const toggle = container.querySelector("button")!;
    await act(async () => toggle.click());
    const link = container.querySelector("a")!; link.focus();
    await act(async () => link.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true})));
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);
  });
  it.each([{ isComposing: false, expanded: "false" }, { isComposing: true, expanded: "true" }])("handles Escape on the opening control without interrupting composition: $isComposing", async ({ isComposing, expanded }) => {
    const toggle = container.querySelector("button")!;
    toggle.focus();
    await act(async () => toggle.click());
    expect(document.activeElement).toBe(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    await act(async () => toggle.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true, isComposing })));
    expect(toggle.getAttribute("aria-expanded")).toBe(expanded);
    expect(document.activeElement).toBe(toggle);
  });
});
