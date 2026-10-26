import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import { describe, expect, it, vi } from "vitest";
import { ReportView } from "@/components/report/ReportView";
import { ReportSnapshotHeader, observationText } from "@/components/report/ReportSnapshotHeader";
import { ReportEvidenceRail } from "@/components/report/ReportEvidenceRail";
import { GradeStripBar } from "@/components/report/sections";
import { Sidebar } from "@/components/watchlist/Sidebar";
import { loadTask28Fixture } from "./helpers/task28Report";
import { freezeReport, readableHtml, reportDigest } from "./helpers/uiParityContract";

vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));

describe("refined research reading sequence",()=>{
  it("spells out the section names beside sticky assessment grades",()=>{
    const report=loadTask28Fixture();
    const html=renderToStaticMarkup(createElement(GradeStripBar,{gradeStrip:report.verdict.gradeStrip,scores:report.scores,compact:true,presentation:"dossier"}));
    const window=new Window();window.document.body.innerHTML=html;
    const links=[...window.document.querySelectorAll('.dossier-grade-navigation a')];
    expect(links.map(link=>link.querySelector('.text-muted')?.textContent)).toEqual(["Fundamentals","Valuation","Technicals","Balance Sheet","Quality / Red-Flags","Leadership proxy","Moat"]);
    expect(links[5].getAttribute("aria-label")).toContain("capital-stewardship proxy");
    expect(links.map(link=>link.getAttribute("href"))).toEqual(["#report-fundamentals","#report-valuation","#report-technicals","#report-balanceSheet","#report-quality","#report-leadership","#report-competitive"]);
    void window.happyDOM.close();
  });
  it("labels the rail model as a request and keeps actual-pass unknowns separate",()=>{
    const report=loadTask28Fixture();report.meta.model="requested-model-only";
    const text=readableHtml(renderToStaticMarkup(createElement(ReportEvidenceRail,{report}))).text;
    expect(text).toContain("Requested model");
    expect(text).toContain("requested-model-only");
    expect(text).toContain("actual pass models and unknowns");
  });
  it("makes all fourteen report destinations focusable for keyboard contents jumps",()=>{
    const html=renderToStaticMarkup(createElement(ReportView,{report:loadTask28Fixture(),layout:"dossier"}));
    const window=new Window();window.document.body.innerHTML=html;
    const sections=["verdict","business","fundamentals","balanceSheet","valuation","quality","technicals","leadership","competitive","catalystsRisks","outlook","projections","macro","appendix"];
    for(const id of sections) expect(window.document.getElementById(`report-${id}`)?.getAttribute("tabindex"),id).toBe("-1");
    void window.happyDOM.close();
  });
  it.each([undefined,999])("uses the selected row in sticky context when embedded identity is %s",embedded=>{
    const report=loadTask28Fixture();
    if(embedded === undefined) delete report.meta.reportId; else report.meta.reportId=embedded;
    const text=readableHtml(renderToStaticMarkup(createElement(ReportView,{report,layout:"dossier",selectedReportId:3}))).text;
    expect(text).toContain("DEMO · #3");
    if(embedded === 999) expect(text).toContain("Selected saved row #3; embedded report ID #999");
    expect(report.meta.reportId).toBe(embedded);
  });
  it("labels latest watchlist grades independently from the selected historical report",()=>{
    const html=renderToStaticMarkup(createElement(Sidebar,{activeSymbol:"DEMO",activeReportId:3,rows:[{symbol:"DEMO",latestReportId:13,lastReportAt:"2026-10-25",gaps:[],runs:[{id:13,createdAt:"2026-10-25T15:41:29.411Z",status:"done"},{id:3,createdAt:"2026-01-15T12:00:00.000Z",status:"done"}]}]}));
    expect(readableHtml(html).text).toContain("Latest saved report #13");
    const window=new Window(); window.document.body.innerHTML=html;
    expect(window.document.querySelector('a[href="/company/DEMO/report/3"]')?.getAttribute("aria-current")).toBe("page");
    expect(window.document.querySelector('a[href="/company/DEMO/report/13"]')?.hasAttribute("aria-current")).toBe(false);
    void window.happyDOM.close();
    expect(readableHtml(html).text).toContain("UTC · selected");
  });
  it("puts recorded key financials before the full executive and attribution detail, with one assessment shortcut strip",()=>{
    const report=freezeReport(loadTask28Fixture());
    const digest=reportDigest(report);
    const html=renderToStaticMarkup(createElement(ReportView,{report,layout:"dossier"}));
    expect(html.indexOf('id="report-key-data"')).toBeGreaterThan(0);
    expect(html.indexOf('id="report-key-data"')).toBeLessThan(html.indexOf('id="report-research-detail"'));
    expect(html.match(/aria-label="Section assessment shortcuts"/g)).toHaveLength(1);
    expect(readableHtml(html).text).toContain("numerical matches check figures");
    expect(reportDigest(report)).toBe(digest);
  });
  it("keeps a data-only conclusion available without calling deterministic fallbacks analyst assessments",()=>{
    const report=loadTask28Fixture();
    report.appendix.missingData.push({field:"analysis.llm",severity:"critical",reason:"AI is unavailable; no completed analysis."});
    const html=renderToStaticMarkup(createElement(ReportView,{report,layout:"dossier"}));
    const text=readableHtml(html).text;
    expect(text).not.toContain("Analyst section assessments");
    expect(text).toContain("Recorded deterministic summary and limitations");
    expect(text).toContain("AI is unavailable; no completed analysis.");
    expect(text).toContain("No completed analyst synthesis");
  });
  it("identifies the selected snapshot with UTC and separates process from research state",()=>{
    const report=loadTask28Fixture();
    report.meta.generatedAt="2026-10-25T17:11:18.588Z";
    const text=readableHtml(renderToStaticMarkup(createElement(ReportSnapshotHeader,{snapshot:report,reportId:46,status:"done",actions:null}))).text;
    expect(text).toContain("#46");
    expect(text).toContain("2026-10-25 17:11:18.588 UTC");
    expect(text).toContain("Process: DONE");
    expect(text).toContain("Saved snapshot");
  });
  it("reads a recorded quote time as a date or a UTC minute, never a raw ISO string",()=>{
    expect(observationText("2025-12-31")).toBe("2025-12-31");
    expect(observationText("2025-12-31T00:00:00.000Z")).toBe("2025-12-31");
    expect(observationText("2025-12-31T00:00:00+00:00")).toBe("2025-12-31");
    expect(observationText("2026-10-23T20:15:42.123Z")).toBe("2026-10-23 20:15 UTC");
    expect(observationText("2026-10-23T16:15:42-04:00")).toBe("2026-10-23 20:15 UTC");
    expect(observationText("not a date")).toBe("not a date");
    const report=loadTask28Fixture();
    report.meta.evidenceTiming={...(report.meta.evidenceTiming as object),quote:{...(report.meta.evidenceTiming?.quote ?? {}),observedAt:"2025-12-31T00:00:00.000Z"}} as typeof report.meta.evidenceTiming;
    const html=renderToStaticMarkup(createElement(ReportSnapshotHeader,{snapshot:report,reportId:46,status:"done",actions:null}));
    expect(readableHtml(html).text).toContain("Quote observed 2025-12-31");
    expect(html).toContain('dateTime="2025-12-31T00:00:00.000Z"');
  });
});
