import { concentratedSbcQuarter } from "@/pipeline/stageB/currentCapital";
import { expect, it } from "vitest";
import { runStageB } from "@/pipeline/compute";
import { applyFinancialDiagnostics } from "@/report/financialDiagnostics";
import { reasoningClaims } from "@/report/presentation";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { validateBundle } from "@/pipeline/stageA/validate";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { cloneTask28, loadTask28Fixture } from "./helpers/task28Report";

function fixture(outlier=true) {
  const b=completeCurrencyBundle({burning:true,siblingQuarterCurrencies:["USD","USD","USD","USD"]});
  if(!b.statements.cashflowQuarterly.ok)throw Error("fixture");
  const rows=b.statements.cashflowQuarterly.value.data.rows;
  for(let i=0;i<4;i++)Object.assign(rows[i]!,{stockBasedCompensation:(outlier?[147554,168998,218294,1138332][i]!:150000)*1000,
    operatingCashFlow:[60893,97308,39886,51163][i]!*1000,capitalExpenditure:-[9216,5284,734,3004][i]!*1000});
  if(!b.statements.incomeQuarterly.ok)throw Error("income fixture");
  for(const q of b.statements.incomeQuarterly.value.data.rows.slice(0,4))q.netIncome=-10e6;
  return {b,c:runStageB(b)};
}
it("qualifies a concentrated SBC quarter and publishes the other-three-quarter companion (N1)",()=>{
  const {b,c}=fixture();const concentration=c.capital.current?.sbcConcentration;
  expect(c.capital.current?.cashBridge.afterSbcStandardizedFcf).toBe(-1442166000);
  expect(concentration).toMatchObject({quarterEnd:"2025-06-30",quarterSbc:1138332000,otherQuarterMedianSbc:168998000,runRateAfterSbc:-469324000});
  if(c.valuation.kind!=="dcf-suppressed")throw Error("suppression fixture");
  expect(c.valuation.suppressionReason).toContain(concentration!.basis);
  const stored=cloneTask28(loadTask28Fixture());
  reasoningClaims(stored.catalystsRisks.risks[0]!.reasoning)[0]!.text="Free cash flow after SBC is negative.";
  const before=JSON.stringify(stored),scores=JSON.stringify(c.scores);
  const report=applyFinancialDiagnostics(stored,c,b);
  expect(reasoningClaims(report.catalystsRisks.risks[0]!.reasoning)[0]!.text).toContain(concentration!.basis);
  expect(report.fundamentals.fcf.some(row=>/run-rate companion/.test(row.label)&&row.values[0]?.value.value===-469324000)).toBe(true);
  expect(JSON.stringify(stored)).toBe(before);expect(JSON.stringify(c.scores)).toBe(scores);
  const payload=assembleContextPayload(b,c,validateBundle(b,{now:new Date(b.builtAt)}));
  expect(JSON.stringify(payload)).toContain(concentration!.basis);
  expect(payload.computed.flatMap(s=>s.figures).some(f=>f.value===-469324000)).toBe(true);
});
it("does not trigger for steady SBC or non-positive comparison quarters",()=>{
  expect(fixture(false).c.capital.current?.sbcConcentration).toBeUndefined();
  const {b}=fixture();if(!b.statements.cashflowQuarterly.ok)throw Error("fixture");
  b.statements.cashflowQuarterly.value.data.rows[0]!.stockBasedCompensation=0;
  expect(runStageB(b).capital.current?.sbcConcentration).toBeUndefined();
});
it("creates list-shaped concentration reasoning and does not duplicate it on a second diagnostic pass",()=>{
  const {b,c}=fixture();
  const stored=loadTask28Fixture();
  stored.catalystsRisks.risks=[];
  const once=applyFinancialDiagnostics(stored,c,b);
  expect(once.catalystsRisks.risks).toHaveLength(1);
  expect(Array.isArray(once.catalystsRisks.risks[0]!.reasoning)).toBe(true);
  expect(reasoningClaims(once.catalystsRisks.risks[0]!.reasoning)[0]!.text).toBe(c.capital.current!.sbcConcentration!.basis);
  expect(applyFinancialDiagnostics(once,c,b).catalystsRisks.risks).toHaveLength(1);
});

it("includes the exact 3x boundary and requires three complete companion flows",()=>{
  const rows=[30,10,10,10].map((stockBasedCompensation,i)=>({date:`2026-0${i+1}-01`,stockBasedCompensation,operatingCashFlow:20,capitalExpenditure:-2}));
  expect(concentratedSbcQuarter(rows,"USD")?.runRateAfterSbc).toBe(32);
  expect(concentratedSbcQuarter(rows.slice(1),"USD")).toBeNull();
  expect(concentratedSbcQuarter(rows.map((r,i)=>({...r,operatingCashFlow:i===1?null:r.operatingCashFlow})),"USD")).toBeNull();
});
