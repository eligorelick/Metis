import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { DISCLAIMER_TEXT, REPORT_SPEC_VERSION } from "@/report/schema";
import { PAYLOAD_VERSION } from "@/pipeline/stageC/payload";
import { STAGE_B_IMPLEMENTATION_VERSION } from "@/pipeline/runInputSnapshot";
import { SCORE_BANDS_VERSION } from "@/pipeline/stageB/grading";
import { classifyAccrualBand } from "@/pipeline/stageB/forensics";
import { PROVISION_TAGS } from "@/pipeline/stageB/financialMetrics";
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const flat = (s: string) => s.replace(/\s+/g, " ");
it("DOC-101 places the three bank rows in the metric table and refuses component sums", () => {
 const text=read("docs/METHODOLOGY.md");
 const table=text.slice(text.indexOf("| Net interest margin |" )).split(/\n(?!\|)/)[0];
 for(const name of ["NPL ratio", "Provisions / loans", "Cost of deposits"]) expect(table).toContain(`| ${name} |`);
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
 const row=t.split("| FMP `analyst-estimates` `epsAvg`")[1].split("\n")[0];
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
