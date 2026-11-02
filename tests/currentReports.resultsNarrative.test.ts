import {it,expect} from "vitest";
import {collectCurrentReports,buildEarningsReleaseRecord,CURRENT_REPORTS_VERSION} from "@/providers/currentReports";
import type {EdgarClient,EdgarFiling} from "@/providers/edgar";
import {completeCurrencyBundle} from "./helpers/currencyBundle";
import {buildFilingDisclosures} from "@/pipeline/filingDisclosures";
import {assembleContextPayload} from "@/pipeline/stageC/payload";
import {runStageB} from "@/pipeline/compute";
import type {ValidationReport} from "@/pipeline/stageA/validate";
type Fx = [accession: string, filingDate: string, text: string];
const edgarFiling = ([accession, filingDate]: Fx): EdgarFiling =>
  ({ accessionNumber: accession, filingDate, reportDate: filingDate, form: "8-K", primaryDocument: `${accession}.htm`, items: "2.02,9.01" }) as EdgarFiling;
const ok = <T,>(data: T, endpoint: string) => ({ ok: true as const, value: { data, endpoint, asOf: "2026-10-20", fetchedAt: "2026-10-20T00:00:00Z", source: "edgar" as const } });
const clientFor = (filings: Fx[], unreadable: Set<string> = new Set()) => ({
  filingIndexHeaders: async (_cik: string, accession: string) => ok({ documents: [{ type: "EX-99.1", filename: `${accession}-ex991.htm`, sequence: "2" }], typeByFilename: {} }, `index/${accession}`),
  fetchFilingDocument: async (_cik: string, filing: EdgarFiling) => {
    const hit = filings.find(([accession]) => `${accession}-ex991.htm` === filing.primaryDocument || `${accession}.htm` === filing.primaryDocument);
    if (hit === undefined || unreadable.has(hit[0]) || filing.primaryDocument === `${hit[0]}.htm`)
      return { ok: false as const, gap: { field: "fixture", reason: "HTTP 503 (fixture)", severity: "warn" as const } };
    return ok(`<html><body><p>${hit[2]}</p></body></html>`, `https://www.sec.gov/${filing.primaryDocument}`);
  },
}) as unknown as EdgarClient;


it("AI-506 newest operating update cannot displace results narrative or capital return",async()=>{
 const filings:Fx[]=[
 ["monthly","2026-10-07","Example Corporation Reports September Sales. September sales were $20 billion."],
 ["q4","2026-09-25","Example Corporation Reports Fourth Quarter Results. For the fourth quarter ended August 30, 2026, net income was $2,610 million, or $5.87 per diluted share. The Board declared a quarterly cash dividend of $1.30 per share."],
 ];
 const cr=await collectCurrentReports(clientFor(filings),"1",filings.map(edgarFiling),"2026-10-20","submissions");
 if(!cr.ok)throw new Error(cr.gap.reason);
 // R1 (FIGR paid audit): the newest update keeps its own text, never the results slot.
 expect(cr.value.data.releases.find(r=>r.accession==="monthly")!.releaseNarrative).toContain("September sales were $20 billion");
 expect(cr.value.data.releases.find(r=>r.accession==="q4")!.releaseNarrative).toContain("net income was");
 const b=completeCurrencyBundle({});b.edgar!.currentReports=cr;
 expect(buildFilingDisclosures(b)?.capitalReturn?.dividendPerShare).toBe(1.3);
 const payload=assembleContextPayload(b,runStageB(b),{checks:[],flags:[],gaps:[]} as unknown as ValidationReport);
 expect(payload.filings.some(e=>e.title.includes("earnings release") && e.text.includes("net income was"))).toBe(true);
 expect(payload.filings.some(e=>e.title.includes("earnings release") && e.text.includes("September sales"))).toBe(false);
 const update=payload.filings.filter(e=>e.text.includes("September sales were $20 billion"));
 expect(update).toHaveLength(1);
 expect(update[0]).toMatchObject({source:"edgar:8-K monthly",asOf:"2026-10-07"});
 expect(update[0]!.title).toMatch(/operating update \(not a results release/);
});

it("R1 keeps the newest preliminary operating data as its own excerpt beside the results release (FIGR paid audit)",async()=>{
 const filings:Fx[]=[
 ["prelim","2026-10-07","Example Lending Reports Preliminary September and Q3 2026 Operating Data. Example Lending today reported select unaudited preliminary operating data for the month and quarter ended September 30, 2026 that was at the high end of the Company's previously issued guidance range of $4.8B - $5.2B. Consumer Loan Marketplace Volume for the quarter was $5,119 million, up 20% from the prior quarter and up 107% from the prior-year quarter. Third quarter results will be released in November."],
 ["q2","2026-08-13","Example Lending Reports Second Quarter 2026 Results. For the second quarter ended June 30, 2026, net income was $87.4 million, or $0.35 per diluted share. Consumer Loan Marketplace Volume was $4,259 million."],
 ["q1","2026-05-12","Example Lending Reports First Quarter 2026 Results. For the first quarter ended March 31, 2026, net income was $45.0 million, or $0.18 per diluted share."],
 ];
 const cr=await collectCurrentReports(clientFor(filings),"1",filings.map(edgarFiling),"2026-10-20","submissions");
 if(!cr.ok)throw new Error(cr.gap.reason);
 const records=cr.value.data.releases;
 expect(records.find(r=>r.accession==="prelim")).toMatchObject({reportsResults:false,commentaryNarrative:null});
 expect(records.find(r=>r.accession==="prelim")!.releaseNarrative).toContain("$5,119 million");
 // Only the newest update newer than the results release keeps text; older results keep none.
 expect(records.find(r=>r.accession==="q1")!.releaseNarrative).toBeNull();
 expect(cr.value.data.notes.join(" ")).toContain("is kept as its own excerpt");
 const b=completeCurrencyBundle({});b.edgar!.currentReports=cr;
 const payload=assembleContextPayload(b,runStageB(b),{checks:[],flags:[],gaps:[]} as unknown as ValidationReport);
 const results=payload.filings.filter(e=>e.title.includes("earnings release"));
 expect(results).toHaveLength(1);
 expect(results[0]!.text).toContain("net income was $87.4 million");
 const update=payload.filings.find(e=>e.source==="edgar:8-K prelim");
 expect(update?.text).toContain("Consumer Loan Marketplace Volume for the quarter was $5,119 million");
 expect(update?.title).toMatch(/operating update \(not a results release/);
 expect(update?.asOf).toBe("2026-10-07");
});

it.each(["monthly","annual","special",null] as const)("RPT-201 dividend pay-date note reflects %s frequency", frequency => {
 const release=buildEarningsReleaseRecord({filing:{accessionNumber:"div",filingDate:"2026-10-30"},releaseUrl:"https://www.sec.gov/div",commentaryUrl:null,commentaryText:null,includeNarrative:true,
  releaseText:`Net income was $10 million. The Board declared a ${frequency ?? "cash"} dividend of $1.00 per share, payable on November 30, 2026.`});
 const b=completeCurrencyBundle({});
 b.edgar!.companyFacts={ok:false,gap:{field:"edgar.companyFacts",reason:"not configured",severity:"info"}};
 b.edgar!.currentReports=ok({version:CURRENT_REPORTS_VERSION,releases:[release],events:[],notes:[]},"fixture");
 const p=assembleContextPayload(b,runStageB(b),{checks:[],flags:[],gaps:[]} as unknown as ValidationReport);
 expect(p.issuerFilings?.notes).toContain(`Next ${frequency ? frequency+" " : ""}dividend payable 2026-11-30 (8-K div).`);
});

import { reportsResults } from "@/edgar/currentReports";
it.each(["US$","$","USD","EUR","GBP","JPY","CNY","RMB","\u20ac","\u00a3","\u00a5"])("AI-506 results currency %s is read",currency=>{
 expect(reportsResults(`Net income was ${currency}10.0 million.`)).toBe(true);
 expect(reportsResults(`We expect net income of ${currency}10.0 million next quarter.`)).toBe(false);
});
it("R1 keeps the newest operating update even when four results releases fill the retained slots (FIGR paid audit)",async()=>{
 // FIGR: four results releases filled the four slots, so the October 7
 // preliminary Q3 release was dropped before any narrative rule applied.
 const filings:Fx[]=[
 ["prelim","2026-10-07","Example Lending Reports Preliminary September and Q3 2026 Operating Data. Example Lending today reported select unaudited preliminary operating data for the month and quarter ended September 30, 2026. Consumer Loan Marketplace Volume for the quarter was $5,119 million."],
 ["q2","2026-08-13","Example Lending Reports Second Quarter 2026 Results. For the second quarter ended June 30, 2026, net income was $87.4 million, or $0.35 per diluted share."],
 ["june","2026-07-07","Example Lending Reports Preliminary June and Q2 2026 Operating Data. Consumer Loan Marketplace Volume for the quarter was $4,259 million."],
 ["q1","2026-05-12","Example Lending Reports First Quarter 2026 Results. For the first quarter ended March 31, 2026, net income was $45.0 million, or $0.18 per diluted share."],
 ["q4","2026-02-26","Example Lending Reports Fourth Quarter 2025 Results. For the fourth quarter ended December 31, 2025, net income was $23.0 million, or $0.10 per diluted share."],
 ["q3","2025-11-13","Example Lending Reports Third Quarter 2025 Results. For the third quarter ended September 30, 2025, net income was $43.8 million, or $0.21 per diluted share."],
 ];
 const cr=await collectCurrentReports(clientFor(filings),"1",filings.map(edgarFiling),"2026-10-20","submissions");
 if(!cr.ok)throw new Error(cr.gap.reason);
 const kept=cr.value.data.releases.map(r=>r.accession);
 expect(kept).toEqual(["prelim","q2","q1","q4","q3"]);
 expect(cr.value.data.releases[0]!.releaseNarrative).toContain("$5,119 million");
 const b=completeCurrencyBundle({});b.edgar!.currentReports=cr;
 const payload=assembleContextPayload(b,runStageB(b),{checks:[],flags:[],gaps:[]} as unknown as ValidationReport);
 expect(payload.filings.find(e=>e.source==="edgar:8-K prelim")?.text).toContain("$5,119 million");
 expect(payload.filings.some(e=>e.text.includes("$4,259 million"))).toBe(false);
});

it("R1 passes every retained release's unparsed outlook statement to the model, beyond the diagnostic-note cap (FIGR paid audit)",async()=>{
 // FIGR: the May release's "Q2 2026 Guidance ... $3.8 - $4.1" was the seventh
 // current-report note and the first six were kept, so the passes could not
 // compare Q2 guidance with the Q2 result.
 const outlook=(q:string,lo:string,hi:string)=>`${q} 2026 Guidance $ in billions Consumer Loan Marketplace Volume $${lo} - $${hi} Webcast Information Example Lending will host a conference call. Management expects continued growth.`;
 const filings:Fx[]=[
 ["q2","2026-08-13",`Example Lending Reports Second Quarter 2026 Results. For the second quarter ended June 30, 2026, net income was $87.4 million, or $0.35 per diluted share. We expect strong demand. ${outlook("Q3","4.8","5.2")}`],
 ["u4","2026-07-20","Example Lending Reports Preliminary July Operating Data. July volume was $1,600 million."],
 ["u1","2026-07-07","Example Lending Reports Preliminary June Operating Data. June volume was $1,500 million."],
 ["u3","2026-06-05","Example Lending Reports Preliminary May Operating Data. May volume was $1,400 million."],
 ["q1","2026-05-12",`Example Lending Reports First Quarter 2026 Results. For the first quarter ended March 31, 2026, net income was $45.0 million, or $0.18 per diluted share. We expect strong demand. ${outlook("Q2","3.8","4.1")}`],
 ["u2","2026-04-03","Example Lending Reports Preliminary March Operating Data. March volume was $1,200 million."],
 ["q4","2026-02-26","Example Lending Reports Fourth Quarter 2025 Results. For the fourth quarter ended December 31, 2025, net income was $23.0 million, or $0.10 per diluted share."],
 ["q3","2025-11-13","Example Lending Reports Third Quarter 2025 Results. For the third quarter ended September 30, 2025, net income was $43.8 million, or $0.21 per diluted share."],
 ];
 const cr=await collectCurrentReports(clientFor(filings),"1",filings.map(edgarFiling),"2026-10-20","submissions");
 if(!cr.ok)throw new Error(cr.gap.reason);
 const unparsed=cr.value.data.releases.flatMap(r=>r.guidance?.unparsed ?? []);
 expect(unparsed.some(s=>s.includes("$3.8 - $4.1"))).toBe(true);
 const b=completeCurrencyBundle({});b.edgar!.currentReports=cr;
 const payload=assembleContextPayload(b,runStageB(b),{checks:[],flags:[],gaps:[]} as unknown as ValidationReport);
 const notes=payload.issuerFilings?.notes ?? [];
 const q2Guide=notes.filter(n=>n.includes("$3.8 - $4.1"));
 expect(q2Guide).toHaveLength(1);
 expect(q2Guide[0]).toContain("8-K q1");
 expect(q2Guide[0]).toContain("2026-05-12");
 expect(notes.filter(n=>n.includes("$4.8 - $5.2"))).toHaveLength(1);
});

it("AI-506 OD-10 only operating updates retain no results narrative or release-derived rows",async()=>{
 const filings:Fx[]=[["update","2026-10-07","Example Reports September Sales. September sales were $20 billion. The Board declared a quarterly cash dividend of $1.30 per share. Free Cash Flow is defined as net cash flow provided by operating activities less capital expenditures. Free Cash Flow Three months ended June 30, Six months ended June 30, 2026 2025 2026 2025 (In millions) Net cash provided by operating activities $ 1,010 $ 900 $ 2,040 $ 1,830 Less: Total capital expenditures (200) (190) (410) (400) Free cash flow $ 810 $ 710 $ 1,630 $ 1,430"]];
 const cr=await collectCurrentReports(clientFor(filings),"1",filings.map(edgarFiling),"2026-10-20","submissions");
 if(!cr.ok)throw Error(cr.gap.reason);
 expect(cr.value.data.releases).toHaveLength(1);
 expect(cr.value.data.releases[0]).toMatchObject({reportsResults:false,commentaryNarrative:null});
 expect(cr.value.data.releases[0]!.freeCashFlow.length).toBeGreaterThan(0);
 expect(cr.value.data.notes.join(" ")).toContain("no earnings, EPS or operating-income amount was read in 8-K update (2026-10-07); treated as an operating update");
 expect(cr.value.data.notes.join(" ")).toContain("no earnings-release narrative is kept");
 const b=completeCurrencyBundle({});b.edgar!.currentReports=cr;
 const d=buildFilingDisclosures(b)!;
 expect(d.capitalReturn).toBeNull();expect(d.freeCashFlow).toEqual([]);expect(d.reconciliation).toBeUndefined();
 const p=assembleContextPayload(b,runStageB(b),{checks:[],flags:[],gaps:[]} as unknown as ValidationReport);
 expect(p.filings.some(e=>/earnings release|CFO commentary/i.test(e.title))).toBe(false);
 // R1: the update's own text is one excerpt that says what it is; it yields no release rows.
 const update=p.filings.filter(e=>e.text.includes("September sales"));
 expect(update).toHaveLength(1);
 expect(update[0]!.title).toMatch(/operating update \(not a results release/);
 expect((p.issuerFilings?.figures ?? []).some(f=>/free.cash.flow|dividend|reconciliation/i.test(f.label))).toBe(false);
});
