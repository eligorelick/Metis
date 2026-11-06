import { expect, it } from "vitest";
import { runStageB, ttmIncome } from "@/pipeline/compute";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { enrichDataOnlyReport } from "@/pipeline/stageC/dataOnlyReport";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { loadTask28Fixture } from "./helpers/task28Report";
import type { ValidationReport } from "@/pipeline/stageA/validate";

it("does not describe an entire trailing numerator as filed when only one quarter was checked",()=>{
 const b=completeCurrencyBundle({});if(!b.statements.incomeQuarterly.ok)throw Error("fixture");
 const rows=b.statements.incomeQuarterly.value.data.rows;
 rows[1]!.operatingIncomeBasis="Operating income uses the same-period filed operating result.";
 rows[1]!.fieldConflicts={operatingIncome:{usable:true,cause:"operating-basis",vendorValue:60e6,secValue:60e6,reason:"filed result"}};
 const ttm=ttmIncome(rows);
 expect(ttm?.operatingIncomeBasis).toMatch(/corroborated quarters: 2025-12-31/i);
 expect(ttm?.operatingIncomeBasis).toMatch(/unverified.*2026-03-31/i);
});
it("labels an annual DCF base and carries statement, price, stale balance and uncertainty into consumers",()=>{
 const b=completeCurrencyBundle({debt:300,siblingQuarterCurrencies:["USD","USD","USD","USD"]});
 b.builtAt="2026-11-05T00:00:00Z";
 if(!b.statements.incomeQuarterly.ok||!b.quote.ok||!b.eodPrices.ok)throw Error("fixture");
 b.quote.value.data.rows[0]!.priceAsOf="2026-11-04";b.quote.value.data.rows[0]!.timestamp=Date.parse("2026-11-04T21:00:00Z")/1000;
 b.eodPrices.value.data.rows[0]!.date="2026-11-04";
 for(const r of b.statements.incomeQuarterly.value.data.rows)r.fieldConflicts={operatingIncome:{usable:false,vendorValue:r.operatingIncome??null,secValue:null,reason:"Independent numerator refusal"}};
 const c=runStageB(b);if(c.valuation.kind!=="dcf"||!c.valuation.assumptions)throw Error("Annual DCF expected");
 const a=c.valuation.assumptions;
 expect(a.forecastPeriod?.basis).toBe("fiscal-year");expect(a.valuationDate).toBeUndefined();
 expect(a.growthAnchor.basis).not.toContain("over TTM");
 expect(a.growthAnchor.basis).toContain("over latest annual FY 2025-12-31");
 const payload=assembleContextPayload(b,c,{checks:[],flags:[],gaps:[]} as unknown as ValidationReport);
 const report=enrichDataOnlyReport(loadTask28Fixture(),{bundle:b,computed:c,reason:"Offline synthetic check"});
 for(const text of [JSON.stringify(payload),JSON.stringify(report),reportToMarkdown(report),reportToPrintBody(report)]){
  expect(text).toContain("2025-12-31");expect(text).toContain("2026-11-04");
  expect(text).toContain("308 days");expect(text).toMatch(/balance changes after.*not reflected/i);
 }
});
