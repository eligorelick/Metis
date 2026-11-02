import { expect, it } from "vitest";
import { withholdContradictedReleaseLabels, shownFilingDisclosures, fiscalLabelContradicted, fiscalLabelEndedBy } from "@/report/filingDisclosurePresentation";
import type { FilingDisclosures } from "@/report/schema";
const periods=[{end:"2026-06-30",label:"Q2 FY2026"},{end:"2025-09-30",label:"Q3 FY2025"}];
function fixture():FilingDisclosures {return {quarterlyTrend:periods.map(p=>({periodEnd:p.end,fiscalLabel:p.label})),notes:[],guidance:{reportedPeriod:"Q2 FY2025",reportedPeriodEnd:"2026-06-30",source:{filingDate:"2026-07-30"},rows:[{period:"Q3 FY2025",low:197e9,high:202e9}]},guidanceChecks:[{period:"Q2 FY2025",periodEnd:"2026-06-30",guidance:{filingDate:"2026-04-30"}}]} as unknown as FilingDisclosures;}
it("withholds the disputed completed, outlook and paired-check labels without changing amounts",()=>{
 const d=withholdContradictedReleaseLabels(fixture(),periods);
 expect(d.guidance?.reportedPeriod).toBeNull();expect(d.guidance?.rows[0]).toMatchObject({period:"fiscal quarter",low:197e9,high:202e9});expect(d.guidanceChecks).toEqual([]);
});
it("stored disclosures use their own trend and leave bytes unchanged",()=>{
 const d=fixture(), before=JSON.stringify(d);
 expect(shownFilingDisclosures(d).guidance?.reportedPeriod).toBeNull();expect(JSON.stringify(d)).toBe(before);
});
it("retains agreeing labels and leaves unknown fiscal bases alone",()=>{
 const d=fixture();d.guidance!.reportedPeriod="Q2 FY2026";d.guidance!.rows[0]!.period="Q3 FY2026";d.guidanceChecks=[];
 expect(withholdContradictedReleaseLabels(d,periods)).toBe(d);expect(withholdContradictedReleaseLabels(d,[])).toBe(d);
 expect(fiscalLabelContradicted(periods,"Q3 FY2025","2026-06-30")).toBe(true);
 expect(fiscalLabelContradicted(periods,"Q3 FY2025","2025-10-01")).toBe(false);
 expect(fiscalLabelEndedBy(periods,"Q3 FY2025","2025-09-29")).toBe(false);
});

import { runStageB } from "@/pipeline/compute";
import type { ValidationReport } from "@/pipeline/stageA/validate";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { buildFilingDisclosures } from "@/pipeline/filingDisclosures";
import { filingDisclosureTables } from "@/report/filingDisclosurePresentation";
import type { DataBundle } from "@/pipeline/types";
import { buildEarningsReleaseRecord, CURRENT_REPORTS_VERSION } from "@/providers/currentReports";
import { BUILT_AT, completeCurrencyBundle } from "./helpers/currencyBundle";
const RELEASE = "Example Corp Reports First Quarter Results. Example Corp today announced financial results for its first quarter ended March 31, 2026. " +
  "Net income was $10.0 million, or $0.10 per diluted share. Business Outlook For the second quarter of 2025, Example expects revenue to be in the range of $120 million to $125 million.";
function sparseBundle(rowLabelled: boolean): DataBundle {
  const b = completeCurrencyBundle({});
  const rows = (b.statements.incomeQuarterly as unknown as { value: { data: { rows: Record<string, unknown>[] } } }).value.data.rows;
  if (rowLabelled) rows[0] = { ...rows[0], fiscalYear: "2026", period: "Q1" };
  const built = buildEarningsReleaseRecord({ filing: { accessionNumber: "0000000000-26-000024", filingDate: "2026-04-30" },
    releaseUrl: "https://www.sec.gov/x/ex99.htm", commentaryUrl: null, releaseText: RELEASE, commentaryText: null, includeNarrative: true });
  b.edgar.currentReports = { ok: true, value: { data: { version: CURRENT_REPORTS_VERSION, releases: [{ ...built, reported: { fiscal: { label: "Q1 FY2025", fiscalYear: 2025, fiscalQuarter: 1 }, periodEnd: "2026-03-31" } }], events: [], notes: [] },
    source: "edgar", asOf: "2026-04-30", endpoint: "fixture", fetchedAt: BUILT_AT } } as never;
  return b;
}

it.each([false,true])("AI-512-V1 sparse quarterly labels agree with the excerpt withholding (%s)",labelled=>{
 const b=sparseBundle(labelled),d=buildFilingDisclosures(b)!;
 const p=assembleContextPayload(b,runStageB(b),{checks:[],flags:[],gaps:[]} as unknown as ValidationReport);
 expect(d.guidance?.reportedPeriod).toBeNull();
 expect(d.guidance?.rows.map(r=>r.period)).toEqual(["fiscal quarter"]);
 expect(d.guidance?.rows[0]).toMatchObject({low:120e6,high:125e6});
 const title=p.filings.find(e=>e.source==="edgar:8-K EX-99.1")!.title;
 expect(title).toContain("issuer fiscal label withheld");
 expect(title).not.toContain("Q1 FY2025");
 expect(JSON.stringify(filingDisclosureTables(d,"outlook"))).not.toContain("FY2025");
});
