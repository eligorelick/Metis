/**
 * Clearly synthetic provider-shaped rows for offline integration regression.
 * No retained/live filings, provider ingestion, model analysis, or forecasting
 * accuracy is being evaluated here. Every analytical/report function is real.
 */
import { deepStrictEqual } from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ReportView } from "@/components/report/ReportView";
import { runStageB } from "@/pipeline/compute";
import { buildDataOnlyReport } from "@/pipeline/jobRunner";
import { validateBundle } from "@/pipeline/stageA/validate";
import type { DataBundle } from "@/pipeline/types";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintHtml } from "@/report/export/printHtml";
import { ReportSchema } from "@/report/schema";

import { BUILT_AT, completeCurrencyBundle, M } from "./currencyBundle";

export const SYNTHETIC_ROUTES = ["general", "bank", "insurer", "reit", "adr", "loss-making", "pre-revenue"] as const;
export type SyntheticRoute = (typeof SYNTHETIC_ROUTES)[number];

export function buildSyntheticRouteBundle(route: SyntheticRoute, options: { quarterHistory?: boolean } = {}): DataBundle {
  const bundle = completeCurrencyBundle({
    symbol: `SYN${route.replace(/[^a-z]/g, "").toUpperCase()}`,
    bank: route === "bank" || route === "insurer",
    reit: route === "reit",
    burning: route === "loss-making" || route === "pre-revenue",
    debt: 0,
    annualCurrency: "USD",
    siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"],
    estimateCurrency: "USD",
    priceTargetCurrency: "USD",
  });
  if (!bundle.profile.ok || !bundle.marketRiskPremium.ok) throw new Error("synthetic fixture requires profile and ERP");
  Object.assign(bundle.profile.value.data.rows[0]!, {
    companyName: `Synthetic ${route} company`,
    ...(route === "insurer" ? { industry: "Insurance - Life" } : {}),
    isAdr: route === "adr",
  });
  // Country identity is required; an unlabelled ERP cannot establish US CoE.
  bundle.marketRiskPremium.value.data.rows[0]!.country = "United States";
  bundle.edgar.companyFacts = {
    ok: false,
    gap: { field: "edgar.companyFacts", reason: "Synthetic panel has no retained XBRL filing", severity: "info" },
  };
  bundle.gaps = [bundle.edgar.companyFacts.gap];
  if (options.quarterHistory) {
    const income = bundle.statements.incomeQuarterly;
    if (!income.ok) throw new Error("synthetic history requires quarterly income");
    const template = income.value.data.rows[7]!;
    for (const date of ["2024-03-31", "2023-12-31", "2023-09-30", "2023-06-30"]) {
      income.value.data.rows.push({ ...template, date, revenue: 200 * M, netIncome: 30 * M, depreciationAndAmortization: 10 * M });
    }
    const dates = income.value.data.rows.map((row) => String(row.date));
    for (const result of [bundle.statements.balanceQuarterly, bundle.statements.cashflowQuarterly]) {
      if (!result.ok) throw new Error("synthetic history requires quarter siblings");
      const template = result.value.data.rows[0]!;
      result.value.data.rows = dates.map((date) => ({ ...template, date }));
    }
    bundle.enterpriseValues = {
      ok: true,
      value: {
        data: { rows: dates.map((date) => ({ date, marketCapitalization: 10_000 * M, enterpriseValue: 9_930 * M })), raw: {} },
        source: "fmp", endpoint: "synthetic:/enterprise-values", asOf: dates[0]!, fetchedAt: BUILT_AT,
      },
    };
  }

  if (route === "bank" || route === "insurer") {
    for (const result of [bundle.statements.balanceAnnual, bundle.statements.balanceQuarterly]) {
      if (!result.ok) throw new Error("synthetic fixture requires balances");
      for (const row of result.value.data.rows) row.preferredStock = 50 * M;
    }
    for (const result of [bundle.statements.incomeAnnual, bundle.statements.incomeQuarterly]) {
      if (!result.ok) throw new Error("synthetic fixture requires income");
      for (const row of result.value.data.rows) {
        row.netIncomeAvailableToCommon = Number(row.netIncome) - (result === bundle.statements.incomeAnnual ? 10 : 2.5) * M;
      }
    }
  }
  if (route === "loss-making" || route === "pre-revenue") {
    for (const result of [bundle.statements.incomeAnnual, bundle.statements.incomeQuarterly]) {
      if (!result.ok) throw new Error("synthetic fixture requires income");
      for (const row of result.value.data.rows) {
        const annual = result === bundle.statements.incomeAnnual;
        Object.assign(row, {
          netIncome: (annual ? -80 : -20) * M,
          operatingIncome: (annual ? -60 : -15) * M,
          ebit: (annual ? -60 : -15) * M,
          epsDiluted: annual ? -0.8 : -0.2,
          ...(route === "pre-revenue" ? { revenue: 0, grossProfit: 0 } : {}),
        });
      }
    }
    for (const result of [bundle.statements.cashflowAnnual, bundle.statements.cashflowQuarterly]) {
      if (!result.ok) throw new Error("synthetic fixture requires cash flows");
      for (const row of result.value.data.rows) {
        const annual = result === bundle.statements.cashflowAnnual;
        Object.assign(row, {
          operatingCashFlow: (annual ? -220 : -55) * M,
          netCashProvidedByOperatingActivities: (annual ? -220 : -55) * M,
          freeCashFlow: ((annual ? -220 : -55) * M) + Number(row.capitalExpenditure),
          netIncome: (annual ? -80 : -20) * M,
        });
      }
    }
  }
  // Preserve provider-envelope custody through a transparently synthetic path.
  const income = bundle.statements.incomeAnnual;
  if (!income.ok) throw new Error("synthetic fixture requires annual income");
  income.value.endpoint = "synthetic:/income-statement";
  bundle.sourceManifest = {
    "statements.incomeAnnual": {
      provider: income.value.source,
      endpoint: income.value.endpoint,
      asOf: income.value.asOf,
      fetchedAt: income.value.fetchedAt,
      stale: false,
    },
  };
  bundle.asOf = { "statements.incomeAnnual": income.value.asOf };
  return bundle;
}

export function runResearchRoutePanel(bundle: DataBundle) {
  const before = structuredClone(bundle);
  const validation = validateBundle(bundle, { now: new Date(BUILT_AT) });
  const computed = runStageB(bundle, { evIncludeLeases: false }, validation);
  deepStrictEqual(bundle, before, "Stage A/B mutated the synthetic input");
  const computedBefore = structuredClone(computed);
  const report = ReportSchema.parse(buildDataOnlyReport({
    symbol: bundle.symbol,
    companyName: `Synthetic ${bundle.symbol} company`,
    generatedAt: "2026-07-06T12:00:00.000Z",
    model: "none",
    costUsd: 0,
    bundle,
    validation,
    computed,
    costBreakdown: [],
    reason: "Synthetic offline accounting-route control",
  }));
  deepStrictEqual(bundle, before, "Report generation mutated the synthetic input");
  deepStrictEqual(computed, computedBefore, "Report generation mutated Stage B metrics");
  const reportBefore = structuredClone(report);
  const surfaces = {
    markdown: reportToMarkdown(report),
    printHtml: reportToPrintHtml(report),
    webHtml: renderToStaticMarkup(createElement(ReportView, { report })),
  };
  deepStrictEqual(report, reportBefore, "Rendering mutated the parsed report");
  return { validation, computed, report, surfaces };
}
