import { expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
it("uses one zero tax shield for identical keyed/keyless loss statements (FIN-406)",()=>{
  const build=(vendor:boolean)=>{
    const b=completeCurrencyBundle({});
    if(!b.statements.incomeQuarterly.ok)throw Error("fixture");
    for(const q of b.statements.incomeQuarterly.value.data.rows.slice(0,4)){q.incomeBeforeTax=-10e6;q.incomeTaxExpense=0;}
    if(!vendor)b.ratiosTtm={ok:false,gap:{field:"fixture",reason:"no ratio",severity:"info"}};
    return runStageB(b);
  };
  expect(build(true).returns.wacc.taxRateUsed).toBe(0);
  expect(build(true).returns.wacc.waccPct).toBe(build(false).returns.wacc.waccPct);
  const keyed=build(true).valuation, keyless=build(false).valuation;
  if(keyed.kind!=="dcf" || keyless.kind!=="dcf")throw Error("fixture requires DCF");
  expect(keyed.dcf?.perShare).toBe(keyless.dcf?.perShare);
});
