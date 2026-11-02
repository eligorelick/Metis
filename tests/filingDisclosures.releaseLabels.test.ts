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
