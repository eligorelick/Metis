import {it,expect} from "vitest";
import {hasMaterialEventItem,splitEightKItems} from "@/edgar/currentReports";
it.each(["1.03","1.05","2.04","3.01","3.02","3.03","5.01"])("DATA-107 admits Item %s",item=>expect(hasMaterialEventItem(item)).toBe(true));
it.each(["2.02","5.03","7.01,9.01"])("DATA-107 excludes %s",item=>expect(hasMaterialEventItem(item)).toBe(false));

import {collectCurrentReports} from "@/providers/currentReports";
import type {EdgarClient,EdgarFiling} from "@/providers/edgar";
it("DATA-107 reads an old priority cyber filing ahead of routine events at the cap",async()=>{
 const filings:EdgarFiling[]=Array.from({length:11},(_,i)=>({accessionNumber:`a${i}`,filingDate:`2026-10-${String(20-i).padStart(2,"0")}`,reportDate:"2026-10-01",form:"8-K",primaryDocument:`a${i}.htm`,items:i===10?"1.05":"8.01"}));
 const read:string[]=[];
 const client={fetchFilingDocument:async(_cik:string,f:EdgarFiling)=>{
  read.push(f.accessionNumber);
  const title=f.items==="1.05"?"Material Cybersecurity Incidents":"Other Events";
  return {ok:true,value:{data:`Item ${f.items} ${title}. On October 1, 2026, the Company reported a material incident.`,source:"edgar",endpoint:"fixture",asOf:f.filingDate,fetchedAt:"2026-10-20T00:00:00Z"}};
 }} as unknown as EdgarClient;
 const result=await collectCurrentReports(client,"1",filings,"2026-10-20","fixture");
 // DATA-107 B-F6 coordinator decision: priority selects the cap; chosen reads are chronological.
 expect(read).toHaveLength(10);expect(read[0]).toBe("a0");expect(read).toContain("a10");
 expect(result.ok && result.value.data.events.some(e=>e.accession==="a10")).toBe(true);
 expect(result.ok && result.value.data.notes.join(" ")).toContain("a9");
});

it.each(["Election of Directors","Appointment of Certain Officers","(e) Compensatory Arrangements of Certain Officers"])("DATA-108 accepts a clause heading %s",title=>{
 const heading=title.startsWith("(")?`Item 5.02${title}`:`Item 5.02 ${title}`;
 expect(splitEightKItems(`${heading}. On September 3, 2026, the Board approved a retention award.`)).toMatchObject([{item:"5.02",text:"On September 3, 2026, the Board approved a retention award."}]);
});

it("DATA-109 omits a page-number-only contents section",()=>{
 const text="Item 1.01 Entry into a Material Definitive Agreement 3 Item 1.01 Entry into a Material Definitive Agreement. On February 26, 2026, the Company signed a material agreement.";
 expect(splitEightKItems(text).map(s=>s.text)).toEqual(["On February 26, 2026, the Company signed a material agreement."]);
});

import {withoutTocStubs} from "@/report/filingDisclosurePresentation";
it("DATA-109 cleans legacy summary stubs while retaining real terms",()=>{
 expect(withoutTocStubs("Item 1.01: 3 Item 1.01: On February 26 the issuer signed. Item 8.01: 4")).toBe("Item 1.01: On February 26 the issuer signed.");
});

it("DATA-108 prose clause cross-reference cannot split the enclosing event",()=>{
 const body="The Company previously disclosed Item 5.02 Appointment of Certain Officers matters, and on May 1, 2026 announced a $500 million buyback program.";
 expect(splitEightKItems(`Item 8.01 Other Events. ${body}`)).toMatchObject([{item:"8.01",text:body}]);
 expect(splitEightKItems(`Item 8.01 Other Events. ${body}`)).toHaveLength(1);
});
it("DATA-108 consumes consecutive same-title clauses before the operative body",()=>{
 const body="On May 1, 2026, the Board appointed a new officer.";
 expect(splitEightKItems(`Item 5.02 Election of Directors; Appointment of Certain Officers. ${body}`)).toMatchObject([{item:"5.02",text:body}]);
 expect(splitEightKItems("Item 5.02 Appointment of Certain Officers\nOn May 1, 2026, the Board appointed a new officer.")).toMatchObject([{item:"5.02",text:body}]);
});

import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { runStageB } from "@/pipeline/compute";
import { filingDisclosureTables } from "@/report/filingDisclosurePresentation";
it.each([3,11])("DATA-107 chosen events are newest first everywhere (%s candidates)",async count=>{
 const filings:EdgarFiling[]=Array.from({length:count},(_,i)=>({accessionNumber:`order${i}`,filingDate:`2026-10-${String(20-i).padStart(2,"0")}`,reportDate:"2026-10-01",form:"8-K",primaryDocument:`order${i}.htm`,items:i===count-1?"1.05":"8.01"}));
 const read:string[]=[];
 const client={fetchFilingDocument:async(_cik:string,f:EdgarFiling)=>{
  read.push(f.accessionNumber);
  return {ok:true,value:{data:`Item ${f.items} ${f.items==="1.05"?"Material Cybersecurity Incidents":"Other Events"}. On October 1, 2026, the Company reported a material incident.`,source:"edgar",endpoint:"fixture",asOf:f.filingDate,fetchedAt:"2026-10-20T00:00:00Z"}};
 }} as unknown as EdgarClient;
 const result=await collectCurrentReports(client,"1",filings,"2026-10-20","fixture");
 if(!result.ok)throw Error(result.gap.reason);
 const expected=(count===11?[...filings.slice(0,9),filings[10]!]:filings).map(f=>f.accessionNumber);
 expect(read).toEqual(expected);
 expect(result.value.data.events.map(e=>e.accession)).toEqual(expected);
 const b=completeCurrencyBundle({});b.edgar!.currentReports=result;
 const d=buildFilingDisclosures(b)!;
 expect(d.events?.map(e=>e.accession)).toEqual(expected);
 const table=filingDisclosureTables(d,"catalystsRisks").find(t=>t.heading.startsWith("Material SEC current reports"))!;
 expect(table.rows.map(r=>r[0])).toEqual(expected.map(a=>filings.find(f=>f.accessionNumber===a)!.filingDate));
 const p=assembleContextPayload(b,runStageB(b),{checks:[],flags:[],gaps:[]});
 const titles=p.filings.filter(e=>e.title.includes("8-K ") && e.title.includes("order")).map(e=>e.title);
 expect(titles.length).toBeGreaterThan(0);
 const position=expected.map(a=>titles.findIndex(t=>t.includes(`8-K ${a};`))).filter(i=>i>=0);
 expect(position).toEqual([...position].sort((a,b)=>a-b));
});
