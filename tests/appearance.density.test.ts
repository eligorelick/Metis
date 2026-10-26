// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseUiDensity, persistUiDensity } from "@/appearance/density";
import { UiDesignProvider } from "@/appearance/UiDesignProvider";
import { WorkspaceToolbar } from "@/components/WorkspaceToolbar";
let container: HTMLDivElement; let root: Root;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); delete document.body.dataset.uiDensity; });

describe("spacing-only reading density", () => {
  it.each([null, undefined, "", "COMPACT", "compact;unsafe=1", {}, 0])("defaults malformed %j to comfortable", value => {
    expect(parseUiDensity(value)).toBe("comfortable");
  });
  it("persists an exact scoped preference and detects silently blocked or throwing storage", () => {
    let cookie = "unrelated=keep";
    const jar = { get cookie() { return cookie; }, set cookie(value: string) { cookie += "; " + value.split(";")[0]; } };
    expect(parseUiDensity("compact")).toBe("compact"); expect(parseUiDensity("comfortable")).toBe("comfortable");
    expect(persistUiDensity("compact", jar, true)).toBe(true); expect(cookie).toContain("unrelated=keep");
    const blocked = { get cookie() { return ""; }, set cookie(_value: string) {} };
    expect(persistUiDensity("comfortable", blocked, false)).toBe(false);
    const broken = { get cookie(): string { throw new Error("private storage details"); }, set cookie(_value: string) { throw new Error("private storage details"); } };
    expect(persistUiDensity("compact", broken, true)).toBe(false);
  });
  it("applies compact spacing immediately and exposes a visit-only state when saving is blocked", async () => {
    vi.spyOn(document, "cookie", "get").mockReturnValue(""); vi.spyOn(document, "cookie", "set").mockImplementation(() => {});
    await act(async () => root.render(createElement(UiDesignProvider, { initialDesign: "current", layout: "dossier" }, createElement(WorkspaceToolbar))));
    const compact = container.querySelector<HTMLInputElement>('input[name="uiDensity"][value="compact"]')!;
    await act(async () => compact.click());
    expect(document.body.dataset.uiDensity).toBe("compact"); expect(compact.checked).toBe(true);
    expect(container.textContent).toContain("Density applied for this visit"); expect(container.textContent).not.toContain("private storage");
  });
});
