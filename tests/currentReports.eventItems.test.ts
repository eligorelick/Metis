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
 expect(read).toHaveLength(10);expect(read[0]).toBe("a10");
 expect(result.ok && result.value.data.events.some(e=>e.accession==="a10")).toBe(true);
 expect(result.ok && result.value.data.notes.join(" ")).toContain("a9");
});

it.each(["Election of Directors","Appointment of Certain Officers","(e) Compensatory Arrangements of Certain Officers"])("DATA-108 accepts a clause heading %s",title=>{
 const heading=title.startsWith("(")?`Item 5.02${title}`:`Item 5.02 ${title}`;
 expect(splitEightKItems(`${heading}. On September 3, 2026, the Board approved a retention award.`)).toMatchObject([{item:"5.02",text:"On September 3, 2026, the Board approved a retention award."}]);
});
