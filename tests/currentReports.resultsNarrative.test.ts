import {it,expect} from "vitest";
import {collectCurrentReports} from "@/providers/currentReports";
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
 expect(cr.value.data.releases.find(r=>r.accession==="monthly")!.releaseNarrative).toBeNull();
 expect(cr.value.data.releases.find(r=>r.accession==="q4")!.releaseNarrative).toContain("net income was");
 const b=completeCurrencyBundle({});b.edgar!.currentReports=cr;
 expect(buildFilingDisclosures(b)?.capitalReturn?.dividendPerShare).toBe(1.3);
 const payload=assembleContextPayload(b,runStageB(b),{checks:[],flags:[],gaps:[]} as unknown as ValidationReport);
 expect(payload.filings.some(e=>e.title.includes("earnings release") && e.text.includes("net income was"))).toBe(true);
});
