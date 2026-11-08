import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { DISCLAIMER_TEXT, REPORT_SPEC_VERSION } from "@/report/schema";
import { PAYLOAD_BUDGETS, PAYLOAD_VERSION } from "@/pipeline/stageC/payload";
import { STAGE_B_IMPLEMENTATION_VERSION } from "@/pipeline/runInputSnapshot";
import { SCORE_BANDS_VERSION } from "@/pipeline/stageB/grading";
import { classifyAccrualBand } from "@/pipeline/stageB/forensics";
import { PROVISION_TAGS } from "@/pipeline/stageB/financialMetrics";
import { calendarizeConsensusWindow } from "@/pipeline/stageB/valuation";
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const flat = (s: string) => s.replace(/\s+/g, " ");
it("DOC-101 places the three bank rows in the metric table and refuses component sums", () => {
 const text=read("docs/METHODOLOGY.md");
 const table=text.slice(text.indexOf("| Net interest margin |" )).split(/\n(?!\|)/)[0];
 for(const name of ["NPL ratio", "Provisions / loans", "Cost of deposits"]) { expect(table).toContain(`| ${name} |`); expect(text.split("\n").filter(l=>l.startsWith(`| ${name} |`))).toHaveLength(1); }
 const row=text.split("\n").find(l=>l.startsWith("| Provisions / loans |"))!;
 for(const tag of PROVISION_TAGS) expect(row).toContain(tag);
 expect(row).toContain("components are not summed");
 expect(row).toContain("total loans are unavailable or not positive");
});
it("JOB-212 documents the canceled error and explicit resumable Retry",()=>{
 const t=flat(read("docs/OPERATIONS.md"));
 expect(t).toContain("job canceled by user");
 expect(t).toContain("Retry may resume");
 expect(t).not.toMatch(/Retry rejects queued\/running, canceled/);
 expect(t).not.toContain("active/unsupported/canceled/conflicting");
});
it("DOC-102 describes signed forensic bands and the absolute grade limitation",()=>{
 const t=flat(read("docs/RESEARCH.md"));
 expect(t).not.toMatch(/\|ratio\| < 0\.10|Fixed bands \(\|ratio\|/);
 expect(t).toContain("below 0.10 *unremarkable*, 0.10 up to 0.20 *elevated*, 0.20 and above *red*");
 expect(t).toContain("ACCRUALS_ABS_BAND");
 expect([classifyAccrualBand(-0.45),classifyAccrualBand(0.15),classifyAccrualBand(0.45)]).toEqual(["unremarkable","elevated","red"]);
});
it("DOC-201 quotes the conditional disclaimer verbatim",()=>{
 const s=read("docs/METHODOLOGY.md").split("## Disclaimer scope")[1].split("\n## ")[0];
 expect(s.split("\n").filter(l=>l.startsWith("> ")).map(l=>l.slice(2).trim()).join(" ")).toBe(DISCLAIMER_TEXT);
});
it("DOC-202 pins current stamps, EPS inheritance and continuing value",()=>{
 const t=flat(read("docs/METHODOLOGY.md"));
 expect(t).toContain(`The current source declares report ${REPORT_SPEC_VERSION} / payload ${PAYLOAD_VERSION}, Stage B \`${STAGE_B_IMPLEMENTATION_VERSION}\` and score bands \`${SCORE_BANDS_VERSION}\``);
 for(const [,v] of t.matchAll(/currently \`(SCORE_BANDS_[A-Z0-9_]+)\`/g)) expect(v).toBe(SCORE_BANDS_VERSION);
 const row=read("docs/METHODOLOGY.md").split("\n").find(l=>l.startsWith("| FMP `analyst-estimates` `epsAvg`"))!;
 expect(row).toContain('currencyBasis: "inherited"');
 expect(t).not.toContain("and adds no continuing value");
 const c=flat(read("CHANGELOG.md"));
 expect(c).toContain(`report spec **${REPORT_SPEC_VERSION}** and payload **${PAYLOAD_VERSION}**`);
});
it("DOC-204 discloses excerpt families, budgets and issuer website egress",()=>{
 const t=flat(read("docs/PRIVACY.md"));
 for(const s of ["12,000 for quarterly MD&A","24,000","10-K Item 1 or 20-F Item 4","Part I Item 1","Part II Item 5","Part I Item 4","dated officer signatures","EX-99.2","reconciliation tables","material-event 8-K items","official company statements","MetisResearch/1.0 (public investor-relations announcement discovery)"]) expect(t).toContain(s);
 expect(flat(read("README.md"))).toContain("an EDGAR-confirmed issuer's own website");
 expect(read("docs/DATA-RIGHTS.md")).toContain("**Issuer websites.**");
});

it("DOC-204 pins all named payload budgets and excerpt families",()=>{
 const privacy=flat(read("docs/PRIVACY.md"));
 for(const key of ["item1aChars","item1aMaxChars","businessChars","tenQNotesChars","tenKNotesChars","tenQOtherChars","mdnaChars","tenQMdnaChars","newsChars","earningsReleaseChars","cfoCommentaryChars","eightKEventChars","eightKCreditEventChars","eightKEventsTotalChars"] as const) expect(privacy,key).toContain(PAYLOAD_BUDGETS[key].toLocaleString("en-US"));
 const families:Record<string,string>={"edgar:10-K item1":"10-K Item 1 or 20-F Item 4","edgar:20-F item4":"10-K Item 1 or 20-F Item 4","edgar:10-K item1A":"10-K Item 1A or 20-F Item 3.D","edgar:20-F item3D":"10-K Item 1A or 20-F Item 3.D","edgar:10-K item7":"10-K Item 7 or 20-F Item 5","edgar:20-F item5":"10-K Item 7 or 20-F Item 5","edgar:10-K notes":"10-K's notes","edgar:10-Q notes":"Part I Item 1","edgar:10-Q item2":"Part I Item 2","edgar:10-Q item4":"Part I Item 4","edgar:10-Q item5":"Part II Item 5","edgar:10-Q signatures":"dated officer signatures","edgar:8-K":"material-event 8-K items","edgar:8-K EX-99 reconciliation":"reconciliation tables","edgar:8-K EX-99.1":"EX-99.1","edgar:8-K EX-99.2":"EX-99.2","edgar:xbrl segment revenue":"segments","edgar:companyfacts/us-gaap/":"filed cash-flow operands"};
 const source=read("src/pipeline/stageC/payload.ts");
 Object.assign(families,{"edgar:primary-repurchase-shares:":"primary repurchase counts and equity costs","edgar:primary-repurchase-equity-cost:":"primary repurchase counts and equity costs"});
 for(const [,id] of source.matchAll(/["`](edgar:[^"`$]+?)\s*(?=["`$])/g)) { expect(families,id).toHaveProperty(id.trim()); expect(privacy).toContain(families[id.trim()]); }
});

// DOC-301 (B12-OD-8): the worked example is the synthetic D-99 fixture of
// tests/stageB.dcfAnchoring.test.ts, recomputed here from the code, not a
// provider-derived report counterfactual.
it("DOC-301 describes the shaped spread of the next fiscal year with the code's own worked example",()=>{
 const seasonality={fiscalYearEnd:"2025-12-31",quarters:[{date:"2025-03-31",revenue:100},{date:"2025-06-30",revenue:100},{date:"2025-09-30",revenue:100},{date:"2025-12-31",revenue:200}]};
 const estimates=[{date:"2026-12-31",revenueAvg:550},{date:"2027-12-31",revenueAvg:600},{date:"2028-12-31",revenueAvg:660}];
 const reported={priorFiscalYearEnd:"2025-12-31",through:"2026-06-30",revenue:220,quarters:2};
 const w1={startDate:"2026-07-01",endDate:"2027-06-30"};
 const shaped=calendarizeConsensusWindow(estimates,w1,reported,seasonality);
 const even=calendarizeConsensusWindow(estimates,w1,reported);
 expect([shaped.partialSpread,even.partialSpread]).toEqual(["seasonal","even"]);
 const t=flat(read("docs/METHODOLOGY.md"));
 expect(t).not.toContain("The next fiscal year's share is still an even spread");
 expect(t).not.toContain("no within-year shape is assumed");
 expect(t).toContain(`${shaped.value!.toFixed(0)}, where an even spread gives ${even.value!.toFixed(2)}`);
});
