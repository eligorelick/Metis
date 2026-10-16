import type { ScoreAspect, ScoreSignal } from "@/report/schema";
import type { ScoringInputs } from "./grading";
import { windowCagr, yearsBetweenDates, type CagrPoint } from "./growth";

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const day = (value: string | null | undefined): string | null => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
};
type Evidence = Pick<ScoreSignal, "family" | "asOf" | "period" | "startDate" | "endDate" | "windowYears" | "fallbackReason" | "operands">;

/** Metadata only: mirror each grader's selected operand and never change its numeric score. */
export function describeScoreEvidence(i: ScoringInputs, aspect: ScoreAspect, id: string): Evidence {
  const result: Evidence = { family: aspect, asOf: null, period: null, startDate: null, endDate: null, windowYears: null, fallbackReason: null, operands: [] };
  const dates = (start: string | null | undefined, end: string | null | undefined) => {
    result.startDate = day(start); result.endDate = day(end); result.asOf = result.endDate;
    result.period = result.startDate && result.endDate ? `${result.startDate} to ${result.endDate}` : result.endDate;
    result.windowYears = result.startDate && result.endDate ? yearsBetweenDates(result.startDate, result.endDate) : null;
  };
  const operand = (name: string, value: number | null | undefined, source: string, asOf: string | null = result.asOf) => {
    result.operands.push({ name, value: finite(value) ? value : null, source, asOf: day(asOf) });
  };
  const quoteDate = day(i.quoteAsOf) ?? (i.valuation.kind !== "pre-revenue" ? day(i.valuation.multiples?.asOf.quote) : null);
  const rateDates = [i.wacc.asOf?.riskFreeRate, i.wacc.asOf?.statements, i.wacc.asOf?.marketCap, i.wacc.erpAsOf].map(day).filter((d): d is string => d !== null).sort();
  const rateDate = rateDates.at(-1) ?? null;
  const growthRows: CagrPoint[] | null = id === "revenueCagr" ? i.growth.revenueCagrs : id === "epsCagr" ? i.growth.epsDilutedCagrs : id === "fcfCagr" ? i.growth.fcfCagrs : null;
  if (growthRows) {
    result.family = "growth";
    result.fallbackReason = "No span-compatible 5-, 3- or 1-year CAGR is available.";
    for (const years of [5, 3, 1]) {
      if (windowCagr(growthRows, years).cagrPct === null) continue;
      const row = growthRows.find(r => r.windowYears === years)!;
      dates(row.startDate, row.endDate); result.windowYears = finite(row.actualYears) ? row.actualYears : years;
      result.fallbackReason = years === 5 ? null : `5-year CAGR unavailable or span-incompatible; using ${years}-year CAGR. ${row.note ?? ""}`.trim();
      const collection = id === "revenueCagr" ? "revenueCagrs" : id === "epsCagr" ? "epsDilutedCagrs" : "fcfCagrs";
      const source = `computed.growth.${collection}[${growthRows.indexOf(row)}]`;
      operand("start value", row.startValue, `${source}.startValue`, result.startDate);
      operand("end value", row.endValue, `${source}.endValue`, result.endDate);
      break;
    }
  } else if (id === "equityReturnVsCoeSpread" || id === "roeImpliedVsAchievable") {
    const er = i.valuation.kind === "excess-return" ? i.valuation.excessReturn : null;
    result.family = id === "equityReturnVsCoeSpread" ? "capital-returns" : "valuation";
    dates(null, er?.asOf);
    operand(i.route.base === "bank" ? "current ROTE" : "current common ROE", er?.roePathPct?.value?.[0], "computed.valuation.excessReturn.roePathPct.value[0]", result.endDate);
    if (id === "equityReturnVsCoeSpread") {
      operand("cost of equity", er?.costOfEquityPct?.value, "computed.valuation.excessReturn.costOfEquityPct.value", rateDate);
      result.period = `Equity-return period end ${result.endDate ?? "unavailable"}; cost-of-equity observation ${rateDate ?? "unavailable"}`;
    } else {
      operand("implied current equity return", er?.reverseSolve?.impliedCurrentRoePct, "computed.valuation.excessReturn.reverseSolve.impliedCurrentRoePct", quoteDate);
      result.asOf = quoteDate; result.windowYears = er?.horizonYears?.value ?? null;
      result.period = `Same equity-return fade over ${result.windowYears ?? "unavailable"} explicit years; return measured at ${result.endDate ?? "unavailable"}`;
    }
  } else if (/^(?:roic|rote)(?:Level|Stability)$/.test(id) || id === "roicVsWaccSpread" || id === "capitalDeployment") {
    result.family = "capital-returns";
    const tangible = id.startsWith("rote");
    const rows = tangible ? i.rote.series.map(r => ({ date: r.date, value: r.rotePct })) : i.roic.series.map(r => ({ date: r.date, value: r.roicPct }));
    const valid = rows.filter(r => finite(r.value));
    const source = tangible ? "computed.returns.rote" : "computed.returns.roic";
    if (id.endsWith("Stability")) {
      dates(valid[0]?.date, valid.at(-1)?.date);
      result.period = `Annual return observations ${result.period ?? "with unavailable dates"}`;
      for (const row of valid) operand(`return at ${row.date}`, row.value, `${source}.series`, day(row.date));
    } else {
      dates(null, tangible ? i.rote.asOf : i.roic.asOf);
      operand(tangible ? "ROTE" : "ROIC", tangible ? i.rote.latestRotePct : i.roic.latestRoicPct, `${source}.latest${tangible ? "Rote" : "Roic"}Pct`);
      if (id === "roicVsWaccSpread" || id === "capitalDeployment") {
        operand("WACC", i.wacc.waccPct, "computed.returns.wacc.waccPct", rateDate);
        result.period = `ROIC period end ${result.endDate ?? "unavailable"}; WACC observation ${rateDate ?? "unavailable"}`;
      }
    }
  } else if (aspect === "balanceSheet") {
    result.family = id === "sbcPctOfFcf" ? "equity-compensation" : "financial-strength";
    if (i.route.base === "bank") {
      const key = id === "tceToTangibleAssets" ? "tangibleLeverage" : id;
      const metric = i.financialMetrics?.route === "bank" ? i.financialMetrics.metrics.find(m => m.key === key) : undefined;
      dates(null, metric?.asOf); result.period = metric ? `${metric.basis}; measured at ${result.endDate ?? "unavailable"}` : null;
      result.fallbackReason = metric?.withheldReason ?? (metric ? null : "Bank route metric unavailable; no industrial capital substitute.");
      operand(metric?.label ?? key, metric?.withheldReason ? null : metric?.value, `computed.financialMetrics.${key}`);
    } else {
      const current = i.capital.current as (NonNullable<ScoringInputs["capital"]["current"]> & {
        ebit?: number | null; interestExpense?: number | null; fcfBeforeSbc?: number | null; netIncome?: number | null;
      }) | undefined;
      dates(current?.periodStart, current ? current.asOf : i.capital.asOf);
      result.period = `${current?.basis ?? "annual"} ${result.period ?? "period unavailable"}`;
      result.fallbackReason = current ? current.fallbackReason : "Current TTM snapshot absent; using the explicitly annual capital metrics.";
      const source = current ? "computed.capital.current" : "computed.capital";
      if (id === "netDebtToEbitda") {
        operand("net debt", current ? current.netDebt : i.capital.netDebtToEbitda.netDebt, `${source}.${current ? "netDebt" : "netDebtToEbitda.netDebt"}`);
        operand("EBITDA", current ? current.ebitda : i.capital.netDebtToEbitda.ebitda, `${source}.${current ? "ebitda" : "netDebtToEbitda.ebitda"}`);
      } else if (id === "interestCoverage") {
        if (current) {
          operand("EBIT / interest expense", current.interestCoverage, `${source}.interestCoverage`);
          if ("ebit" in current) operand("EBIT", current.ebit, `${source}.ebit`);
          if ("interestExpense" in current) operand("interest expense", current.interestExpense, `${source}.interestExpense`);
        }
        else { operand("EBIT", i.capital.interestCoverage.ebit, `${source}.interestCoverage.ebit`); operand("interest expense", i.capital.interestCoverage.interestExpense, `${source}.interestCoverage.interestExpense`); }
      } else if (id === "fcfConversionBeforeSbc") {
        if (!current || "fcfBeforeSbc" in current) operand("FCF before SBC", current ? current.fcfBeforeSbc : i.capital.fcf.latestFcfBeforeSbc, `${source}.${current ? "fcfBeforeSbc" : "fcf.latestFcfBeforeSbc"}`);
        if (current && "netIncome" in current) operand("net income", current.netIncome, `${source}.netIncome`);
        operand("FCF / net income", current ? current.fcfConversionBeforeSbc : i.capital.fcf.latestConversionBeforeSbc, `${source}.${current ? "fcfConversionBeforeSbc" : "fcf.latestConversionBeforeSbc"}`);
      } else if (id === "sbcPctOfFcf") {
        operand("SBC", current ? current.cashBridge.stockBasedCompensation : i.capital.sbc.latest, `${source}.${current ? "cashBridge.stockBasedCompensation" : "sbc.latest"}`);
        if (!current || "fcfBeforeSbc" in current) operand("FCF before SBC", current ? current.fcfBeforeSbc : i.capital.fcf.latestFcfBeforeSbc, `${source}.${current ? "fcfBeforeSbc" : "fcf.latestFcfBeforeSbc"}`);
        if (current) operand("SBC / FCF before SBC, percent", current.sbcPctOfFcf, `${source}.sbcPctOfFcf`);
      }
      if (current && ["fcfConversionBeforeSbc", "sbcPctOfFcf"].includes(id) && !("fcfBeforeSbc" in current)) {
        result.fallbackReason = [result.fallbackReason, "Graded FCF operands are not retained in this snapshot; standardized FCF and annual operands are not substituted for the graded vendor/reported ratio."].filter(Boolean).join(" ");
      }
    }
  } else if (aspect === "quality") {
    result.family = "accounting-integrity";
    if (id === "altmanZOriginalScale") {
      const altman = i.forensics.altman;
      dates(null, altman?.asOf.balanceSheet ?? altman?.asOf.incomeStatement);
      operand("original variant Z score before grade-scale mapping", altman?.score, "computed.forensics.altman.score");
      result.period = `Balance ${day(altman?.asOf.balanceSheet) ?? "unavailable"}; income ${day(altman?.asOf.incomeStatement) ?? "unavailable"}; market cap ${day(altman?.asOf.marketCap) ?? "unavailable"}`;
    } else {
      const metric = id === "beneishM" ? i.forensics.beneish : id === "piotroskiF" ? i.forensics.piotroski : id === "accrualsRatioAbs" ? i.forensics.accruals : null;
      const p = metric?.asOf;
      dates(p && "prior2" in p ? p.prior2 ?? p.prior : p?.prior, p?.current);
      if (id === "piotroskiF") { operand("signals passed", i.forensics.piotroski?.score, "computed.forensics.piotroski.score"); operand("signals assessed", i.forensics.piotroski?.outOf, "computed.forensics.piotroski.outOf"); }
      else if (id === "accrualsRatioAbs") operand("cash-flow accrual ratio before absolute transform", i.forensics.accruals?.cashFlowAccrualRatio, "computed.forensics.accruals.cashFlowAccrualRatio");
      else if (id === "beneishM") operand("Beneish M", i.forensics.beneish?.score, "computed.forensics.beneish.score");
    }
  } else if (aspect === "valuation") {
    result.family = "valuation"; result.asOf = quoteDate;
    const ownKeys = id === "peOwnHistoryRank" ? ["peTtm", "evToEbitda", "priceToFcf"] : id === "priceToTbvOwnHistoryRank" ? ["priceToTbv", "priceToBook"] : id === "pFfoOwnHistoryRank" ? ["priceToFfo", "priceToAffo"] : null;
    if (ownKeys) {
      const stats = i.valuation.kind !== "pre-revenue" ? i.valuation.multiples?.multiples ?? [] : [];
      const selected = ownKeys.map(key => stats.find(m => m.key === key)).find(m => finite(m?.ownHistory?.percentileRank));
      result.period = selected ? `Current ${selected.key} rank among ${selected.ownHistory!.observations} historical quarters; historical observation dates unavailable` : null;
      result.fallbackReason = selected ? `Historical sample dates unavailable${selected.key !== ownKeys[0] ? `; ${ownKeys[0]} unavailable, using ${selected.key}` : ""}.` : "Own-history rank unavailable.";
      if (selected) {
        operand(`${selected.key} current multiple`, selected.current, `computed.valuation.multiples.${selected.key}.current`, quoteDate);
        operand("own-history rank", selected.ownHistory!.percentileRank, `computed.valuation.multiples.${selected.key}.ownHistory.percentileRank`, quoteDate);
        operand("historical observations", selected.ownHistory!.observations, `computed.valuation.multiples.${selected.key}.ownHistory.observations`, null);
      }
    } else if (i.valuation.kind === "dcf") {
      const a = i.valuation.assumptions;
      if (id === "reverseImpliedVsAchievable") {
        operand("implied starting growth, same fade", i.valuation.reverseDcf?.impliedRevenueGrowthPct, "computed.valuation.reverseDcf.impliedRevenueGrowthPct", quoteDate);
        operand("base starting growth, same fade", i.valuation.reverseDcf?.baseRevenueGrowthPct ?? a?.growthPath.value[0], "computed.valuation.reverseDcf.baseRevenueGrowthPct", day(a?.asOf.statements));
        result.windowYears = a?.years ?? null;
        result.period = "Same explicit DCF horizon and fading growth-path family; comparing first-year anchors.";
      } else if (id === "dcfUpside") {
        operand("DCF per share", i.valuation.dcf?.perShare, "computed.valuation.dcf.perShare", day(a?.asOf.statements));
        operand("current quote", i.currentPrice, "computed.currentPrice", quoteDate);
        // D-60: the statement date is the DCF's start (TTM end), not its revenue
        // anchor, which since D-58 is guidance, consensus or the run-rate.
        result.period = `Quote observation ${quoteDate ?? "unavailable"}; DCF statement start ${day(a?.asOf.statements) ?? "unavailable"}` +
          `${a?.revenueAnchor ? `, year-one revenue from ${a.revenueAnchor.source}` : ""}`;
      }
    }
  } else if (aspect === "technicals") {
    result.family = "momentum-and-trend";
    if (id === "relStrength12m1m") {
      const m = i.technicals.relativeStrength.benchmark.momentum12m1m;
      dates(m?.startDate, m?.endDate);
      operand("issuer return", m?.symbolReturnPct, "computed.technicals.relativeStrength.benchmark.momentum12m1m.symbolReturnPct");
      operand("benchmark return", m?.benchmarkReturnPct, "computed.technicals.relativeStrength.benchmark.momentum12m1m.benchmarkReturnPct");
    } else if (id === "smaGap") {
      dates(null, i.technicals.asOf); result.period = `SMA50 / SMA200 at ${result.endDate ?? "unavailable"}; exact first-session dates not retained`;
      operand("SMA50", i.technicals.smaCross.sma50, "computed.technicals.smaCross.sma50"); operand("SMA200", i.technicals.smaCross.sma200, "computed.technicals.smaCross.sma200");
    } else {
      dates(null, i.technicals.range52w.asOf); result.period = `52-week range at ${result.endDate ?? "unavailable"}; exact first-session date not retained`;
      operand("last close", i.technicals.lastClose, "computed.technicals.lastClose"); operand("52-week high", i.technicals.range52w.high52w, "computed.technicals.range52w.high52w", day(i.technicals.range52w.highDate));
    }
  } else if (id === "shareCountTrend") {
    result.family = "capital-return-policy";
    const trend = i.capital.shareCount;
    dates(trend.startDate, trend.endDate); result.windowYears = finite(trend.actualYears) ? trend.actualYears : result.windowYears;
    operand("start shares", trend.startShares, "computed.capital.shareCount.startShares", result.startDate); operand("end shares", trend.endShares, "computed.capital.shareCount.endShares", result.endDate);
  } else if (id === "buybackDiscipline") {
    result.family = "capital-return-policy";
    const b = i.capital.buybackPriceAnalysis;
    const used = b.years.filter(r => finite(r.sharesProxy) && r.sharesProxy > 0 && finite(r.avgPriceProxy) && r.avgPriceProxy > 0 && r.repurchased > 0);
    dates(used[0]?.date, used.at(-1)?.date); result.asOf = quoteDate;
    result.period = `Contributing annual repurchase-price observations ${result.period ?? "unavailable"}; compared with quote ${quoteDate ?? "unavailable"}`;
    operand("average repurchase price proxy", b.avgPricePaidProxy, "computed.capital.buybackPriceAnalysis.avgPricePaidProxy", result.endDate);
    operand("current quote", b.currentPrice, "computed.capital.buybackPriceAnalysis.currentPrice", quoteDate);
  } else if (id === "grossMarginLevel" || id === "operatingMarginSlope") {
    result.family = "profitability";
    const rows = (id === "grossMarginLevel" ? i.growth.margins.gross.series : i.growth.margins.operating.series).filter(r => finite(r.pct));
    if (id === "grossMarginLevel") {
      const latest = rows.at(-1); dates(null, latest?.date);
      operand("gross margin", latest?.pct, "computed.growth.margins.gross.series");
    } else {
      dates(rows[0]?.date, rows.at(-1)?.date);
      for (const row of rows) operand(`operating margin at ${row.date}`, row.pct, "computed.growth.margins.operating.series", day(row.date));
    }
  }
  return result;
}
