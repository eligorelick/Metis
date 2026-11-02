import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { runStageB } from "@/pipeline/compute";
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import { filingDisclosureTables } from "@/report/filingDisclosurePresentation";
import type { ValidationReport } from "@/pipeline/stageA/validate";
import { describe, expect, it } from "vitest";
import { segmentPresentationChanges, parseInstanceRevenue, parseMemberLabels, sameSegmentBasis, buildQuarterlySegments, type FilingRevenue, type RevenueFact } from "@/edgar/segmentFacts";
const S = 1e8;
const AX = "us-gaap:StatementBusinessSegmentsAxis";
type W = { start: string; end: string };
const fact = (member: string | null, w: W, v: number): RevenueFact =>
  ({ axis: member === null ? null : AX, member, start: w.start, end: w.end, value: v * S, currency: "USD", concept: "us-gaap:Revenues" });
const trio = (w: W, x: number, y: number): RevenueFact[] => [fact(null, w, x + y), fact("p:CloudMember", w, x), fact("p:DevicesMember", w, y)];
const filing = (accession: string, form: string, filingDate: string, facts: RevenueFact[]) => ({ accession, form, filingDate, concept: "us-gaap:Revenues", facts }) as FilingRevenue & { concept: string | null };
const labels = { "p:CloudMember": "Cloud", "p:DevicesMember": "Devices" };

const Q1 = { start: "2025-01-01", end: "2025-03-31" }, Q2 = { start: "2025-04-01", end: "2025-06-30" }, H1 = { start: "2025-01-01", end: "2025-06-30" };
const Q3 = { start: "2025-07-01", end: "2025-09-30" }, M9 = { start: "2025-01-01", end: "2025-09-30" }, FY = { start: "2025-01-01", end: "2025-12-31" };
const Q1N = { start: "2026-01-01", end: "2026-03-31" };
// Old presentation FY2025: Cloud 200/210/220/230 (FY 860), Devices 60/62/64/66 (FY 252).
// The reorganisation moves a line worth 12 a quarter from Devices to Cloud; member QNames unchanged.
const q1Old = filing("0001111111-25-000001", "10-Q", "2025-04-29", trio(Q1, 200, 60));
const q2Old = filing("0001111111-25-000002", "10-Q", "2025-07-29", [...trio(Q2, 210, 62), ...trio(H1, 410, 122)]);
const q3Old = filing("0001111111-25-000003", "10-Q", "2025-10-28", [...trio(Q3, 220, 64), ...trio(M9, 630, 186)]);
const kOld = filing("0001111111-26-000001", "10-K", "2026-02-10", trio(FY, 860, 252));
// (a) Q1 2026 10-Q on the new basis: Q1'26 Cloud 250, Devices 57; restated Q1'25 Cloud 212, Devices 48.
const q1New = filing("0001111111-26-000002", "10-Q", "2026-04-28", [...trio(Q1N, 250, 57), ...trio(Q1, 212, 48)]);
// (b) The 10-K itself presents FY2025 on the new basis: Cloud 908, Devices 204.
const kNew = filing("0001111111-26-000003", "10-K", "2026-02-10", trio(FY, 908, 204));
// New-basis Devices: 48/50/52/54; old basis 60/62/64/66. Same-basis QoQ for Q1'26 Devices: 57/54-1 = +5.56%; old-on-new mix: 57/66-1 = -13.64%.


describe("AI-508 presentation lineage", () => {
 it("withholds a cross-filing quarter before a proven recast", () => {
  const s = buildQuarterlySegments([q1New,kOld,q3Old,q2Old],labels)!;
  expect(s.axes[0]!.rows.find(r=>r.label === "Devices")!.values.map(v=>v===null?null:v/S)).toEqual([57,null,64,62,48]);
 });
 it("retains and marks an unproven cross-filing estimate (OD-11)",()=>{
  const s=buildQuarterlySegments([kNew,q3Old,q2Old,q1Old],labels)!;
  const row=s.axes[0]!.rows.find(r=>r.label === "Devices")!;
  expect(row.values[0]).toBe(18*S);
  expect(row).toHaveProperty("crossFilingAt",[0]);
 });
});

function surfaces(filings: (FilingRevenue & {concept:string|null})[]) {
 const data=buildQuarterlySegments(filings,labels)!;
 const b=completeCurrencyBundle({});
 b.edgar!.quarterlySegments={ok:true,value:{data,asOf:data.quarters[0]!.end,source:"edgar",endpoint:"fixture",fetchedAt:b.builtAt}};
 return {payload:assembleContextPayload(b,runStageB(b),{checks:[],flags:[],gaps:[]} as unknown as ValidationReport),table:filingDisclosureTables(buildFilingDisclosures(b),"business").find(t=>t.heading.startsWith("Segment revenue by quarter"))!};
}
it("excludes earlier basis levels and growth from analysts and explains the classic dash",()=>{
 const {payload,table}=surfaces([q1New,kOld,q3Old,q2Old]);
 expect(payload.quarterlyTrend?.figures.some(f=>/Devices revenue growth quarter over quarter/.test(f.label))).toBe(false);
 expect(payload.segmentRevenue?.figures.some(f=>/Devices.*2025-06-30/.test(f.label))).toBe(false);
 expect(table.note).toContain("presentation changed");
 expect(table.rows.find(r=>r[0]==="Devices")!.at(-3)).toBe("\u2014");
});
it("registers retained cross-filing levels as computed and discloses the 10-K blind spot",()=>{
 const {payload,table}=surfaces([kNew,q3Old,q2Old,q1Old]);
 expect(payload.segmentRevenue?.figures.find(f=>/Devices revenue.*2025-12-31/.test(f.label))).toMatchObject({value:18*S,source:"computed:xbrl segment cross-filing difference"});
 expect(table.note).toContain("until the next 10-Q");
});

it("names the change filing, shared window and affected quarter ends",()=>{
 const s=buildQuarterlySegments([q1New,kOld,q3Old,q2Old],labels)!;
 const note=s.notes.join(" ");
 for(const text of [q1New.accession,q1New.filingDate,"2025-01-01","2025-03-31","2025-12-31","2025-09-30"]) expect(note).toContain(text);
});
it("keeps a moved-together annual and nine-month pair after a recast",()=>{
 const recast=filing("new-nine","10-Q","2025-11-01",[...trio(Q1,212,48),...trio(Q3,232,52),...trio(M9,666,150)]);
 const s=buildQuarterlySegments([kNew,recast,q1Old],labels)!;
 const r=s.axes[0]!.rows.find(r=>r.label==="Devices")!;
 expect(r.values[0]).toBe(54*S);
 expect(r.crossFilingAt).toContain(0);
});
it("uses the latest stable presentation after repeated changes",()=>{
 const second=filing("second","10-Q","2026-05-01",[...trio(Q1N,260,47),...trio(Q1,222,38)]);
 const s=buildQuarterlySegments([second,q1New,q2Old,q1Old],labels)!;
 expect(s.notes.join(" ")).toContain("second");
 expect(s.axes[0]!.rows.find(r=>r.label==="Devices")!.values.at(-1)).toBe(38*S);
});

it("does not assert comparability between older cells after repeated changes",()=>{
 expect(sameSegmentBasis([1,2],1,2)).toBe(false);
 expect(sameSegmentBasis([1,2],0,3)).toBe(true);
});

const Q1_26 = { start: "2026-01-01", end: "2026-03-31" }, Q2_26 = { start: "2026-04-01", end: "2026-06-30" }, H1_26 = { start: "2026-01-01", end: "2026-06-30" };
const Q3_26 = { start: "2026-07-01", end: "2026-09-30" }, M9_26 = { start: "2026-01-01", end: "2026-09-30" };
const q1o26 = filing("0001111111-26-000004", "10-Q", "2026-04-28", [...trio(Q1_26, 240, 61), ...trio(Q1, 200, 60)]);
const q2o26 = filing("0001111111-26-000005", "10-Q", "2026-07-28", [...trio(Q2_26, 245, 63), ...trio(H1_26, 485, 124), ...trio(Q2, 210, 62), ...trio(H1, 410, 122)]);
const q3n26 = filing("0001111111-26-000006", "10-Q", "2026-10-28", [...trio(Q3_26, 270, 65), ...trio(M9_26, 779, 165), ...trio(Q3, 232, 52), ...trio(M9, 666, 150)]);

it("AI-508 refuses an old-presentation residual after a Q3 reallocation", () => {
 const missing = {...q2o26, facts:q2o26.facts.filter(f => !(f.member === "p:DevicesMember" && f.start === Q2_26.start && f.end === Q2_26.end))};
 const filings=[q3n26,missing,q1o26,kOld];
 const data=buildQuarterlySegments(filings,labels)!;
 const devices=data.axes[0]!.rows.find(r => r.label === "Devices")!;
 expect(devices.values[1]).toBeNull();
 expect(devices.residualAt ?? []).not.toContain(1);
 const {payload,table}=surfaces(filings);
 expect(payload.quarterlyTrend?.figures.some(f=>/Devices revenue growth quarter over quarter/.test(f.label))).toBe(false);
 expect(payload.segmentRevenue?.figures.some(f=>/Devices.*total less.*2026-06-30/.test(f.label))).toBe(false);
 expect(table.rows.find(r=>r[0]==="Devices")!.at(-3)).toBe("\u2014");
});

it("AI-508 pins Q3 reallocation and the following 10-K on the current basis", () => {
 const filings=[q3n26,q2o26,q1o26,kOld];
 const data=buildQuarterlySegments(filings,labels)!;
 expect(data.axes[0]!.rows.find(r=>r.label==="Devices")!.values.map(v=>v===null?null:v/S)).toEqual([65,63,61,null,52,62,60]);
 const q3=surfaces(filings).payload;
 expect(q3.quarterlyTrend?.figures.find(f=>/Devices revenue growth year over year/.test(f.label))?.value).toBe(25);
 expect(q3.quarterlyTrend?.figures.some(f=>/Devices revenue growth quarter over quarter/.test(f.label))).toBe(false);
 const next=filing("0001111111-27-000001","10-K","2027-02-10",[...trio({start:"2026-01-01",end:"2026-12-31"},1059,231),...trio(FY,908,204)]);
 const nextFilings=[next,q3n26,q2o26,q1o26];
 const row=buildQuarterlySegments(nextFilings,labels)!.axes[0]!.rows.find(r=>r.label==="Devices")!;
 expect(row.values.map(v=>v===null?null:v/S)).toEqual([66,65,63,61,54,52,62,60]);
 expect(row.crossFilingAt).toEqual([0,4]);
 const p=surfaces(nextFilings).payload;
 expect(p.quarterlyTrend?.figures.find(f=>/Devices revenue growth quarter over quarter/.test(f.label))?.value).toBe(1.54);
 expect(p.quarterlyTrend?.figures.find(f=>/Devices revenue growth year over year/.test(f.label))?.value).toBe(22.22);
 expect(p.segmentRevenue?.figures.find(f=>/Devices.*2026-12-31/.test(f.label))?.source).toBe("computed:xbrl segment cross-filing difference");
});
it.each([[43050e6,1e6,false],[50e6,1e6,false],[50e6,3e6,true]] as const)("AI-508 rounding floor and relative tolerance %s/%s",(base,delta,changed)=>{
 const fx=(w:W,value:number):RevenueFact=>({...fact("p:XMember",w,0),value});
 const pair=[filing("old","10-Q","2025-04-29",[fx(Q1,base)]),filing("new","10-Q","2025-07-29",[fx(Q2,base),fx(H1,2*base+delta)])];
 expect(segmentPresentationChanges(pair).has(`${AX}|p:XMember`)).toBe(changed);
});
import fs from "node:fs";
import path from "node:path";
it("AI-508 NVIDIA instances do not raise a presentation change",()=>{
 const read=(name:string)=>fs.readFileSync(path.join(__dirname,"../fixtures/edgar/nvda-current-reports",name),"utf8");
 const instance=(name:string,accession:string,form:string,filingDate:string)=>{const p=parseInstanceRevenue(read(name));return {accession,form,filingDate,facts:p.facts,concept:p.concept};};
 const s=buildQuarterlySegments([instance("nvda-20260726_htm.xml","0001045810-26-000075","10-Q","2026-08-26"),instance("nvda-20260125_htm.xml","0001045810-26-000021","10-K","2026-02-25"),instance("nvda-20251026_htm.xml","0001045810-25-000230","10-Q","2025-11-19")],parseMemberLabels(read("nvda-20260726_lab.xml")))!;
 expect(s.axes.length).toBeGreaterThan(0);
 expect(s.notes.join(" ")).not.toContain("presentation changed");
 for(const axis of s.axes) {
  expect(axis.totalEarlierPresentationAt ?? []).toEqual([]);
  for(const row of axis.rows)expect(row.earlierPresentationAt ?? []).toEqual([]);
 }
});
