import {readFileSync} from "node:fs";
import {afterAll,it,expect} from "vitest";
import {completeCurrencyBundle} from "./helpers/currencyBundle";
import {buildFilingDisclosures} from "@/pipeline/filingDisclosures";
import {runStageB} from "@/pipeline/compute";
function adobeBundle() {
  const b = completeCurrencyBundle({ symbol: "ADBE" });
  const captured = JSON.parse(readFileSync("fixtures/company-ir/adobe-20261019/audit-financial-inputs.json", "utf8"));
  Object.assign(b, { builtAt: captured.builtAt, profile: captured.profile, quote: captured.quote, statements: captured.statements });
  Object.assign(b.edgar, captured.edgar);
  return b;
}

const originalTz=process.env.TZ;
afterAll(()=>{if(originalTz===undefined)delete process.env.TZ;else process.env.TZ=originalTz;});
it.each(["UTC","America/Denver","Europe/Berlin","Asia/Tokyo"])("DATA-111 prose dates in %s",tz=>{
 process.env.TZ=tz;
 expect(buildFilingDisclosures(adobeBundle()).capitalReturn).toMatchObject({authorizationRemaining:24.55e9,authorizationRemainingAsOf:"2026-08-28"});
 expect(runStageB(adobeBundle()).projections?.series.find(s=>s.metric==="epsDiluted")?.capitalReturn?.authorizationRemaining).toBe(24.55e9);
});
