// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandLauncher } from "@/components/CommandLauncher";
import { UiDesignProvider } from "@/appearance/UiDesignProvider";
import { EvidenceInspector } from "@/components/report/EvidenceInspector";
import { TracedNumberSourceDetails } from "@/components/report/primitives";
import { REPORT_SECTION_MANIFEST } from "@/report/sectionManifest";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
let container: HTMLDivElement; let root: Root; const fetcher = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true); vi.stubGlobal("fetch",fetcher); fetcher.mockReset(); router.refresh.mockReset();
  vi.stubGlobal("matchMedia",()=>({ matches:true,addEventListener() {},removeEventListener() {} }));
  vi.spyOn(HTMLDialogElement.prototype,"showModal").mockImplementation(function(this: HTMLDialogElement){this.open=true;});
  vi.spyOn(HTMLDialogElement.prototype,"close").mockImplementation(function(this: HTMLDialogElement){this.open=false;});
  container=document.createElement("div"); document.body.append(container); root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function render(coverageAvailable=true, allSections=false) {
  await act(async()=>root.render(createElement(UiDesignProvider,{initialDesign:"current",layout:"dossier",coverage:[{symbol:"DEMO",companyName:"Thesis Example Systems"},{symbol:"BRK.B",companyName:"Berkshire Hathaway"}],coverageAvailable},
    createElement(CommandLauncher),createElement("textarea",{"aria-label":"Ordinary editing"}),
    createElement("div",{className:"thesis-report"},
      createElement("section",{id:"report-verdict",tabIndex:-1},createElement("h2",null,"Verdict")),
      createElement("section",{id:"report-valuation",tabIndex:-1},createElement("h2",null,"Valuation")),
      ...(allSections ? REPORT_SECTION_MANIFEST.filter(section=>!["verdict","valuation"].includes(section.key)).map(section=>createElement("section",{key:section.key,id:`report-${section.key}`,tabIndex:-1},createElement("h2",null,section.key==="quality" ? "Quality / Red-Flags" : section.printTitle))) : []),
      createElement(TracedNumberSourceDetails,{n:{value:48,unit:"USD/share",source:"stored observation",asOf:"2026-01-15",verified:true}}),
      createElement(EvidenceInspector,{reportIdentity:"DEMO:31"})))));
}
function launch(){return container.querySelector<HTMLButtonElement>('button[aria-label="Search research"]')!;}
function palette(){return container.querySelector<HTMLDialogElement>('dialog[aria-label="Search research"]');}
async function key(key:string,extras:KeyboardEventInit={}){await act(async()=>{(document.activeElement??document.body).dispatchEvent(new KeyboardEvent("keydown",{key,bubbles:true,cancelable:true,...extras}));});}
async function open(){await act(async()=>launch().click());await vi.waitFor(()=>expect(palette()?.open).toBe(true));}
function input(){return palette()!.querySelector<HTMLInputElement>('input[type="search"]')!;}
async function search(value:string){await act(async()=>{input().value=value;input().dispatchEvent(new InputEvent("input",{bubbles:true}));});}
function results(){return [...palette()!.querySelectorAll<HTMLAnchorElement>('.command-results a')];}

describe("command search over current coverage and report destinations",()=>{
  it("lazily opens from a visible button, searches recorded names/aliases and never starts research",async()=>{
    await render();expect(palette()).toBeNull();await open();expect(document.activeElement).toBe(input());
    await search("example systems");expect(results().map(a=>a.getAttribute("href"))).toEqual(["/company/DEMO"]);
    await search("brk-b");expect(results()[0]?.getAttribute("href")).toBe("/company/BRK.B");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("uses actual section anchors, supports keyboard movement and returns focus on Escape",async()=>{
    await render();launch().focus();await key("k",{ctrlKey:true});await vi.waitFor(()=>expect(palette()?.open).toBe(true));
    await search("valuation");expect(results()[0]?.getAttribute("href")).toBe("#report-valuation");
    await key("ArrowDown");expect(document.activeElement).toBe(results()[0]);await key("Escape");
    expect(palette()).toBeNull();expect(document.activeElement).toBe(launch());
    await key("/");await vi.waitFor(()=>expect(palette()?.open).toBe(true));await search("valuation");
    await key("Enter");expect(palette()).toBeNull();expect(document.activeElement?.id).toBe("report-valuation");
    expect(container.querySelector('[href="#report-business"]')).toBeNull();
  });
  it("contains focus and does not capture typing, composition or plain number keys",async()=>{
    await render();const editing=container.querySelector<HTMLTextAreaElement>('textarea')!;editing.focus();await key("/");await key("k",{ctrlKey:true});expect(palette()).toBeNull();
    editing.blur();await key("/",{isComposing:true});await key("1");expect(palette()).toBeNull();await open();
    await key("Tab",{shiftKey:true});expect(document.activeElement?.textContent).toBe("Close search");await key("Tab");expect(document.activeElement).toBe(input());
  });
  it("finds the full displayed section titles, punctuation variants and the Moat destination",async()=>{
    await render(true,true);await open();
    for(const section of REPORT_SECTION_MANIFEST){
      await search(section.printTitle);
      expect(results().some(link=>link.getAttribute("href")===`#report-${section.key}`)).toBe(true);
    }
    await search("Quality / Red-Flags");expect(results()[0]?.getAttribute("href")).toBe("#report-quality");
    await search("moat");expect(results()[0]?.getAttribute("href")).toBe("#report-competitive");
    await search("///");expect(results()).toHaveLength(0);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("shows no-match/add as explicit validated watchlist work with real pending/error/success",async()=>{
    await render();await open();await search("NEWCO");expect(palette()!.textContent).toContain("No matching destinations");
    const add=()=>[...palette()!.querySelectorAll<HTMLButtonElement>("button")].find(button=>button.textContent==="Add NEWCO to watchlist")!;
    expect(add()).toBeDefined();fetcher.mockResolvedValueOnce({ok:false,status:503,json:async()=>({error:"Watchlist unavailable"})});
    await act(async()=>add().click());expect(palette()!.textContent).toContain("Watchlist unavailable");expect(fetcher.mock.calls[0]![0]).toBe("/api/watchlist");
    fetcher.mockResolvedValueOnce({ok:true});await act(async()=>add().click());expect(router.refresh).toHaveBeenCalledOnce();expect(palette()!.textContent).toContain("Added NEWCO to watchlist");
    expect(fetcher.mock.calls.every(call=>call[0]==="/api/watchlist")).toBe(true);
  });
  it("does not offer an invented ticker for invalid text or claim failed coverage is empty",async()=>{
    await render(false);await open();await search("../bad symbol");expect(palette()!.textContent).toContain("Coverage could not be loaded");
    expect(palette()!.querySelector('input[aria-label="add ticker"]')).toBeNull();expect(results()).toHaveLength(0);
  });
  it("allows only one modal to own focus across source inspection and search",async()=>{
    await render();const source=container.querySelector<HTMLElement>('details[data-evidence-key] > summary')!;
    await act(async()=>source.click());expect(container.querySelector('dialog.evidence-dialog')?.hasAttribute("open")).toBe(true);
    await key("k",{ctrlKey:true});await act(async()=>launch().click());expect(palette()).toBeNull();
    await act(async()=>container.querySelector('dialog.evidence-dialog')!.dispatchEvent(new Event("cancel",{cancelable:true})));
    await open();await act(async()=>source.click());expect(container.querySelectorAll("dialog[open]")).toHaveLength(1);
    await key("Escape");expect(container.querySelectorAll("dialog[open]")).toHaveLength(0);
  });
});
