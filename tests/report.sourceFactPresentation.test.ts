import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildSourceFactSummary } from "@/report/sourceFacts";
import { sourceFactAuditTables } from "@/report/sourceFactPresentation";
import { FundamentalsSection } from "@/components/report/sections";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintHtml } from "@/report/export/printHtml";
import { ReportSchema } from "@/report/schema";
import type { ContextPayload } from "@/pipeline/stageC/payload";

function summary(netIncome = 62.647e9) {
  const period = "2026-06-30", asOf = period;
  const periodContext = { kind: "duration", start: "2026-04-01", end: period, basis: "fiscal-quarter", fiscalLabel: "Q2 FY2026" } as const;
  const values = [["income before tax", "income-before-tax",80.857e9], ["income tax expense","income-tax-expense",18.199e9], ["net income","net-income",netIncome], ["equity-method income (loss), as filed","equity-method-income-loss-as-filed",-0.011e9]] as const;
  const origin = "fmp:income-statement(quarter)";
  const rows = values.map(([label,key,value])=>({ id:`payload.statements.income-statement-quarterly.${period}.${key}`, label, kind:"provider", value, unit:"currency", currency:"USD", period, periodContext, fiscalPeriod:"Q2 FY2026", asOf, origin, formulaVersion:null, displayPrecision:4 }));
  return buildSourceFactSummary({ provenanceRegistry:rows,statements:[{title:"Income statement - quarterly",periods:[period],notes:[],lineItems:values.map(([lineItem,key,value])=>({lineItem,unit:"currency",source:origin,byPeriod:[{period,periodContext,fiscalPeriod:"Q2 FY2026",value,currency:"USD",asOf,provenanceId:`payload.statements.income-statement-quarterly.${period}.${key}`}]}))}] } as unknown as ContextPayload)!;
}

describe("assembled source facts on report surfaces",()=>{
  it("renders all exact reported operands, the calculated identity and its retained residual",()=>{
    const tables=sourceFactAuditTables(summary());
    const text=JSON.stringify(tables);
    for(const value of ["80,857,000,000 USD","18,199,000,000 USD","62,647,000,000 USD","-11,000,000 USD","2026-04-01 to 2026-06-30","Reported earnings reconciliation","Residual"])expect(text).toContain(value);
    expect(text).toContain("not normalized recurring earnings");
  });
  it("shows the same facts on live, Markdown and print without changing stored report data",()=>{
    const report=ReportSchema.parse({...JSON.parse(fs.readFileSync("fixtures/report/DEMO-sample.json","utf8")),sourceFactSummary:summary()});
    const before=structuredClone(report);
    const outputs=[renderToStaticMarkup(React.createElement(FundamentalsSection,{fundamentals:report.fundamentals,sourceFactSummary:report.sourceFactSummary,index:3})),reportToMarkdown(report),reportToPrintHtml(report)];
    for(const output of outputs)for(const value of ["Reported source facts","Reported earnings reconciliation","80,857,000,000 USD","18,199,000,000 USD","62,647,000,000 USD","-11,000,000 USD"])expect(output).toContain(value);
    expect(report).toEqual(before);
  });
  it("keeps missing or non-reconciling evidence explicit without creating an available bridge",()=>{
    const missing=summary();missing.status="unavailable";missing.rows=[];missing.reason="Missing compatible source periods";missing.earningsReconciliation.status="unavailable";missing.earningsReconciliation.reason=missing.reason;
    const text=JSON.stringify(sourceFactAuditTables(missing));
    expect(text).toContain("Missing compatible source periods");
    expect(text).not.toContain("80,857");
    expect(sourceFactAuditTables(undefined)).toEqual([]);
  });
  it("discloses a known nonzero residual even while the reconciliation is unavailable",()=>{
    const mismatch=summary(62.647e9-1);
    expect(mismatch.earningsReconciliation.status).toBe("unavailable");
    const text=JSON.stringify(sourceFactAuditTables(mismatch));
    expect(text).toContain("Residual");expect(text).toContain("1 USD");
    expect(text).toContain("62,647,000,000 USD");
  });
});
