// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReportContents } from "@/components/report/ReportContents";

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  container.className = "thesis-report";
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe("report contents keyboard navigation", () => {
  it("reveals the whole focused assessment shortcut without scrolling the report",async()=>{
    vi.stubGlobal("IntersectionObserver",class {observe(){} disconnect(){}});
    await act(async()=>root.render(createElement("div",null,
      createElement("nav",{className:"dossier-grade-navigation"},createElement("a",{href:"#report-leadership"},"Leadership proxy: limited evidence")),
      createElement(ReportContents,{reportIdentity:"MU:46",hasProjections:true}),
      createElement("section",{id:"report-leadership"}),
    )));
    const nav=container.querySelector<HTMLElement>(".dossier-grade-navigation")!;
    const link=nav.querySelector<HTMLAnchorElement>("a")!;
    vi.spyOn(nav,"getBoundingClientRect").mockReturnValue({left:20,right:220} as DOMRect);
    vi.spyOn(link,"getBoundingClientRect").mockReturnValue({left:180,right:300} as DOMRect);
    const vertical=window.scrollY;
    await act(async()=>link.focus());
    expect(nav.scrollLeft).toBe(80);
    expect(window.scrollY).toBe(vertical);
  });
  it("tracks a destination positioned at its CSS anchor offset above the reading content",async()=>{
    vi.stubGlobal("IntersectionObserver",class {observe(){} disconnect(){}});
    vi.stubGlobal("requestAnimationFrame",(callback:FrameRequestCallback)=>{callback(0);return 1;});
    vi.stubGlobal("cancelAnimationFrame",vi.fn());
    await act(async()=>root.render(createElement("div",null,createElement("div",{className:"report-grade-strip"}),createElement(ReportContents,{reportIdentity:"MU:46",hasProjections:true}),createElement("section",{id:"report-verdict",style:{scrollMarginTop:"172px"}}),createElement("section",{id:"report-business",style:{scrollMarginTop:"172px"}}))));
    vi.spyOn(container.querySelector("#report-verdict")!,"getBoundingClientRect").mockReturnValue({top:-800} as DOMRect);
    vi.spyOn(container.querySelector("#report-business")!,"getBoundingClientRect").mockReturnValue({top:171.98} as DOMRect);
    vi.spyOn(container.querySelector(".report-grade-strip")!,"getBoundingClientRect").mockReturnValue({bottom:109} as DOMRect);
    await act(async()=>window.dispatchEvent(new Event("scroll")));
    expect(container.querySelector('a[aria-current="location"]')?.getAttribute("href")).toBe("#report-business");
    container.querySelector<HTMLElement>("#report-verdict")!.style.scrollMarginTop="212px";
    container.querySelector<HTMLElement>("#report-business")!.style.scrollMarginTop="212px";
    vi.spyOn(container.querySelector("#report-business")!,"getBoundingClientRect").mockReturnValue({top:212} as DOMRect);
    await act(async()=>window.dispatchEvent(new Event("resize")));
    expect(container.querySelector('a[aria-current="location"]')?.getAttribute("href")).toBe("#report-business");
  });
  it("uses the section at the sticky reading edge when a preceding long section still intersects", async () => {
    let notify: IntersectionObserverCallback = () => {};
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback) { notify=callback; }
      observe() {}
      disconnect() {}
    });
    await act(async () => root.render(createElement("div",null,
      createElement("div",{className:"report-grade-strip"}),
      createElement(ReportContents,{reportIdentity:"MU:46",hasProjections:true}),
      createElement("section",{id:"report-balanceSheet"}),
      createElement("section",{id:"report-valuation"}),
    )));
    const previous=container.querySelector<HTMLElement>("#report-balanceSheet")!;
    const current=container.querySelector<HTMLElement>("#report-valuation")!;
    vi.spyOn(previous,"getBoundingClientRect").mockReturnValue({top:-800,bottom:210} as DOMRect);
    vi.spyOn(current,"getBoundingClientRect").mockReturnValue({top:212,bottom:1000} as DOMRect);
    vi.spyOn(container.querySelector(".report-grade-strip")!,"getBoundingClientRect").mockReturnValue({bottom:195} as DOMRect);
    await act(async()=>notify([{isIntersecting:true,target:previous,boundingClientRect:new DOMRect(0,-800,300,1010),intersectionRect:new DOMRect(),intersectionRatio:1,rootBounds:null,time:0}],{} as IntersectionObserver));
    expect(container.querySelector('a[aria-current="location"]')?.getAttribute("href")).toBe("#report-valuation");
  });
  it("updates when scrolling across a wrapped sticky edge without an intersection transition",async()=>{
    vi.stubGlobal("IntersectionObserver",class {observe(){} disconnect(){}});
    vi.stubGlobal("requestAnimationFrame",(callback:FrameRequestCallback)=>{callback(0);return 1;});
    vi.stubGlobal("cancelAnimationFrame",vi.fn());
    await act(async()=>root.render(createElement("div",null,createElement("div",{className:"report-grade-strip"}),createElement(ReportContents,{reportIdentity:"MU:46",hasProjections:true}),createElement("section",{id:"report-balanceSheet"}),createElement("section",{id:"report-valuation"}))));
    const previous=container.querySelector<HTMLElement>("#report-balanceSheet")!;
    const current=container.querySelector<HTMLElement>("#report-valuation")!;
    vi.spyOn(previous,"getBoundingClientRect").mockReturnValue({top:-800} as DOMRect);
    const position=vi.spyOn(current,"getBoundingClientRect").mockReturnValue({top:300} as DOMRect);
    vi.spyOn(container.querySelector(".report-grade-strip")!,"getBoundingClientRect").mockReturnValue({bottom:195} as DOMRect);
    await act(async()=>window.dispatchEvent(new Event("scroll")));
    expect(container.querySelector('a[aria-current="location"]')?.getAttribute("href")).toBe("#report-balanceSheet");
    position.mockReturnValue({top:212} as DOMRect);
    await act(async()=>window.dispatchEvent(new Event("scroll")));
    expect(container.querySelector('a[aria-current="location"]')?.getAttribute("href")).toBe("#report-valuation");
  });
  it("closes with Escape and returns focus to the disclosure summary", async () => {
    await act(async () => root.render(createElement(ReportContents, { reportIdentity: "report:3", hasProjections: false })));
    const disclosure = container.querySelector("details")!;
    disclosure.open = true;
    const link = container.querySelector<HTMLAnchorElement>('a[href="#report-valuation"]')!;
    link.focus();
    await act(async () => link.dispatchEvent(new KeyboardEvent("keydown", { key:"Escape", bubbles:true })));
    expect(disclosure.open).toBe(false);
    expect(document.activeElement).toBe(container.querySelector("summary"));
    expect(container.querySelectorAll("a").length).toBe(14);
    expect(container.textContent).toContain("Projections · not recorded");
  });
});
