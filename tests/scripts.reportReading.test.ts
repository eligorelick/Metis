import { expect, it } from "vitest";
import { pathToFileURL } from "node:url";
import path from "node:path";
const { readingCheckFailures } = await import(pathToFileURL(path.resolve("scripts/lib/report-reading-bounds.mjs")).href);
const classic={top:217.703125,stickyBottom:200.9375,doc:{client:390,scroll:390},main:{client:390,scroll:390},hashAfter:"#report-valuation",scrollBefore:0,scrollAfter:29477};
it("TEST-204 accepts recorded unmutated classic and dossier landings",()=>{
 for(const s of [classic,{...classic,top:97.9375,stickyBottom:81.09375},{...classic,top:212.15625,stickyBottom:185,scrollAfter:0}]) expect(readingCheckFailures(s)).toEqual([]);
});
it("TEST-204 rejects recorded classic overflow",()=>expect(readingCheckFailures({...classic,main:{client:390,scroll:2032}})).toContain("main overflow"));
it("TEST-204 rejects recorded no-op jump",()=>expect(readingCheckFailures({...classic,top:29796.703125,stickyBottom:620.125,hashAfter:"",scrollAfter:0})).toEqual(["jump outside landing bound","jump did not move"]));
it("TEST-204 retains document overflow and under-strip refusals",()=>{
 expect(readingCheckFailures({...classic,doc:{client:390,scroll:2014}})).toContain("document overflow");
 expect(readingCheckFailures({...classic,top:0})).toContain("section under sticky strip");
});
