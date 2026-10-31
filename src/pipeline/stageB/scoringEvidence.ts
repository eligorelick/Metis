import type { ScoreAspect, ScoreSignal } from "@/report/schema";
import type { ScoringInputs } from "./grading";
import { CAGR_SPAN_TOLERANCE_YEARS, scoringMargin, windowCagr, yearsBetweenDates, type CagrPoint } from "./growth";
import { sbcExceedsAllFcf } from "./capital";

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const day = (value: string | null | undefined): string | null => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
};
/** Reader names for the multiples an own-history rank can fall back across. */
const HISTORY_KEY_LABEL: Record<string, string> = {
  peTtm: "P/E", evToEbitda: "EV/EBITDA", priceToFcf: "Price/FCF", priceToTbv: "P/TBV", priceToBook: "P/B", priceToFfo: "P/FFO", priceToAffo: "P/AFFO",
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
      // Historical endpoint rates are not durability forecasts. Retain the
      // scored window and disclose same-end alternatives, without silently
      // replacing it with an invented "normalized" growth assumption.
      const alternatives = [5, 3, 1].flatMap(window => {
        const value = windowCagr(growthRows, window).cagrPct;
        const point = growthRows.find(r => r.windowYears === window);
        if (value === null || !point || point.endDate !== row.endDate) return [];
        const alternativeSource = `computed.growth.${collection}[${growthRows.indexOf(point)}]`;
        operand(`${window}-year historical CAGR`, value, `${alternativeSource}.cagrPct`, day(point.endDate));
        if (point !== row) {
          operand(`${window}-year start value`, point.startValue, `${alternativeSource}.startValue`, day(point.startDate));
          operand(`${window}-year end value`, point.endValue, `${alternativeSource}.endValue`, day(point.endDate));
        }
        return [{ window, value }];
      });
      const short = alternatives.find(p => p.window === 3);
      const sensitivity = years === 5 && short
        ? ` Window sensitivity: historical 5-year CAGR ${row.cagrPct!.toFixed(2)}% versus 3-year CAGR ${short.value.toFixed(2)}% (${(row.cagrPct! - short.value).toFixed(2)} percentage-point difference); recovery or base effects may affect endpoint growth. These historical rates do not establish a durable growth forecast.`
        : " Historical endpoint growth does not establish a durable growth forecast.";
      result.fallbackReason = `${result.fallbackReason ?? ""}${sensitivity}`.trim();
      const longest = growthRows.filter(point => {
        if (!finite(point.cagrPct) || !finite(point.actualYears) || point.actualYears <= result.windowYears! ||
          point.endDate !== row.endDate || point.startDate === row.startDate || !day(point.startDate) || !day(point.endDate) ||
          !finite(point.startValue) || !finite(point.endValue) || point.startValue <= 0 || point.endValue <= 0) return false;
        const span = yearsBetweenDates(point.startDate!, point.endDate!);
        return span !== null && Math.abs(span - point.actualYears) <= CAGR_SPAN_TOLERANCE_YEARS;
      }).sort((a, b) => b.actualYears! - a.actualYears!)[0];
      if (longest) {
        result.fallbackReason += ` Longest retained window: ${longest.actualYears!.toFixed(2)} years of available history (${longest.startDate} to ${longest.endDate}): ${longest.cagrPct!.toFixed(2)}%; historical context only, with the scoring window unchanged.`;
        const longSource = `computed.growth.${collection}[${growthRows.indexOf(longest)}]`;
        operand("longest-history CAGR", longest.cagrPct, `${longSource}.cagrPct`, day(longest.endDate));
        operand("longest-history start value", longest.startValue, `${longSource}.startValue`, day(longest.startDate));
        operand("longest-history end value", longest.endValue, `${longSource}.endValue`, day(longest.endDate));
      }
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
  } else if (/^(?:roic|rote)(?:Level|Floor)$/.test(id) || id === "roicVsWaccSpread") {
    result.family = "capital-returns";
    const tangible = id.startsWith("rote");
    const rows = tangible ? i.rote.series.map(r => ({ date: r.date, value: r.rotePct })) : i.roic.series.map(r => ({ date: r.date, value: r.roicPct }));
    const valid = rows.filter(r => finite(r.value));
    const source = tangible ? "computed.returns.rote" : "computed.returns.roic";
    if (id.endsWith("Floor")) {
      // D-61: the lowest annual return in the window; every observation is
      // an operand so the reader sees which year set the floor.
      dates(valid[0]?.date, valid.at(-1)?.date);
      result.period = `Lowest of the annual return observations ${result.period ?? "with unavailable dates"}`;
      // AMZN audit 2026-10-20 finding 9: a year inside the stated window with no
      // return is named, so the window is not read as complete, and a year
      // taxed at the marginal-rate floor says so.
      const first = rows.findIndex(r => finite(r.value)), last = rows.findLastIndex(r => finite(r.value));
      const missing = first < 0 ? [] : rows.slice(first, last + 1).filter(r => !finite(r.value)).map(r => r.date);
      if (missing.length > 0) result.period += `; no return for ${missing.join(", ")}, so the floor does not cover ${missing.length === 1 ? "that year" : "those years"}`;
      const floored = tangible ? [] : i.roic.series.filter(r => finite(r.roicPct) && r.taxFloorBasis);
      if (floored.length > 0) result.fallbackReason = floored.map(r => `${r.date}: ${r.taxFloorBasis}.`).join(" ");
      for (const row of valid) operand(`return at ${row.date}`, row.value, `${source}.series`, day(row.date));
    } else {
      // AMZN audit 2026-10-20 finding 9: the latest year's ROIC may rest on the marginal-rate floor too.
      const latestBasis = tangible ? undefined : i.roic.series.at(-1)?.taxFloorBasis;
      if (latestBasis && finite(i.roic.latestRoicPct)) result.fallbackReason = `${i.roic.series.at(-1)!.date}: ${latestBasis}.`;
      dates(null, tangible ? i.rote.asOf : i.roic.asOf);
      operand(tangible ? "ROTE" : "ROIC", tangible ? i.rote.latestRotePct : i.roic.latestRoicPct, `${source}.latest${tangible ? "Rote" : "Roic"}Pct`);
      if (id === "roicVsWaccSpread") {
        operand("WACC", i.wacc.waccPct, "computed.returns.wacc.waccPct", rateDate);
        result.period = `ROIC period end ${result.endDate ?? "unavailable"}; WACC observation ${rateDate ?? "unavailable"}`;
      }
    }
  } else if (aspect === "balanceSheet") {
    result.family = id === "sbcPctOfFcf" ? "equity-compensation" : "financial-strength";
    if (id === "cfoPreWcToDebt" || id === "debtToBookCapitalization") {
      // Audit 2026-10-22 B-13: the regulated-utility ratios, on the window and balance sheet they were computed on.
      const credit = i.utilityCredit ?? null;
      const o = credit?.operands;
      const cfo = id === "cfoPreWcToDebt";
      dates(cfo ? i.capital.current?.periodStart : null, credit?.asOf);
      if (cfo) result.period = `${i.capital.current?.basis ?? "annual"} ${result.period ?? "period unavailable"}`;
      result.fallbackReason = credit === null ? "Regulated-utility credit ratios not computed." : null;
      if (cfo) {
        operand("operating cash flow", o?.operatingCashFlow, "computed.utilityCredit.operands.operatingCashFlow");
        operand("working-capital change", o?.changeInWorkingCapital, "computed.utilityCredit.operands.changeInWorkingCapital");
        operand("total debt", o?.totalDebt, "computed.utilityCredit.operands.totalDebt");
        operand("CFO before working capital / debt, percent", credit?.cfoPreWcToDebtPct, "computed.utilityCredit.cfoPreWcToDebtPct");
      } else {
        operand("total debt", o?.totalDebt, "computed.utilityCredit.operands.totalDebt");
        operand("total equity", o?.totalEquity, "computed.utilityCredit.operands.totalEquity");
        operand("deferred income taxes", o?.deferredIncomeTaxes, "computed.utilityCredit.operands.deferredIncomeTaxes");
        operand("debt / book capitalization, percent", credit?.debtToBookCapitalizationPct, "computed.utilityCredit.debtToBookCapitalizationPct");
      }
    } else if (i.route.base === "bank") {
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
        // AMZN audit 2026-10-20 finding 8: the grader scores this case at the band floor.
        if ((current ? current.sbcPctOfFcf : i.capital.sbc.pctOfFcf) === null &&
          sbcExceedsAllFcf(current ? current.fcfBeforeSbc : i.capital.fcf.latestFcfBeforeSbc, current ? current.cashBridge.stockBasedCompensation : i.capital.sbc.latest)) {
          result.fallbackReason = [result.fallbackReason,
            "Free cash flow before SBC is zero or negative while SBC is positive, so SBC exceeds all of the free cash flow: " +
            "SBC / FCF is undefined, and the signal is graded at the band floor (SBC at 100% or more of FCF). " +
            "The value shown is that floor, not a measured ratio."].filter(Boolean).join(" ");
        }
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
      const metric = id === "beneishM" || id === "beneishMSgiNeutral" ? i.forensics.beneish : id === "piotroskiF" ? i.forensics.piotroski : id === "accrualsRatioAbs" ? i.forensics.accruals : null;
      const p = metric?.asOf;
      dates(p && "prior2" in p ? p.prior2 ?? p.prior : p?.prior, p?.current);
      if (id === "piotroskiF") { operand("signals passed", i.forensics.piotroski?.score, "computed.forensics.piotroski.score"); operand("signals assessed", i.forensics.piotroski?.outOf, "computed.forensics.piotroski.outOf"); }
      else if (id === "accrualsRatioAbs") {
        operand("cash-flow accrual ratio before absolute transform", i.forensics.accruals?.cashFlowAccrualRatio, "computed.forensics.accruals.cashFlowAccrualRatio");
        if (i.forensics.accruals?.definition === "operating") result.fallbackReason = "Financial-asset-adjusted accrual inputs are unavailable or unreconciled; graded on operating accruals (NI \u2212 CFO).";
      }
      else if (id === "beneishM") operand("Beneish M", i.forensics.beneish?.score, "computed.forensics.beneish.score");
      else if (id === "beneishMSgiNeutral") {
        operand("Beneish M", i.forensics.beneish?.score, "computed.forensics.beneish.score");
        operand("sales-growth index (SGI)", i.forensics.beneish?.indices.sgi, "computed.forensics.beneish.indices.sgi");
        operand("Beneish M with SGI at neutral 1.0", i.forensics.beneish?.sgiNeutralScore, "computed.forensics.beneish.sgiNeutralScore");
        result.fallbackReason = "Sales growth alone carries M above the −1.78 flag line; graded on M with SGI at neutral 1.0 (D-61).";
      }
    }
  } else if (aspect === "valuation") {
    result.family = "valuation"; result.asOf = quoteDate;
    const ownKeys = id === "peOwnHistoryRank" ? ["peTtm", "evToEbitda", "priceToFcf"] : id === "priceToTbvOwnHistoryRank" ? ["priceToTbv", "priceToBook"] : id === "pFfoOwnHistoryRank" ? ["priceToFfo", "priceToAffo"] : null;
    if (ownKeys) {
      const stats = i.valuation.kind !== "pre-revenue" ? i.valuation.multiples?.multiples ?? [] : [];
      const selected = ownKeys.map(key => stats.find(m => m.key === key && m.gainInflatedEarnings === undefined)).find(m => finite(m?.ownHistory?.percentileRank));
      const gainInflated = stats.find(m => m.key === ownKeys[0] && m.gainInflatedEarnings !== undefined)?.gainInflatedEarnings;
      const details = selected?.ownHistory?.observationDetails ?? [];
      const completeSample = details.length > 0 && details.length === selected?.ownHistory?.observations &&
        details.every(point => day(point.periodEnd) !== null && finite(point.value));
      const periods = completeSample ? details.map(point => point.periodEnd).sort() : [];
      result.period = selected ? `Current ${selected.key} empirical percentile rank among ${selected.ownHistory!.observations} historical quarters; ` +
        (completeSample ? `retained fiscal sample periods ${periods[0]} to ${periods.at(-1)}` : "historical sample dates unavailable or incomplete") : null;
      const missingMarketDates = details.filter(point => day(point.marketDate) === null).length;
      const cashStat = stats.find(m => m.key === "priceToFcf");
      const cashOwnershipScope = [cashStat?.ownershipScope, cashStat?.historyScope].filter(Boolean).join(" ");
      result.fallbackReason = selected ? [
        selected.key === "peTtm" && finite(selected.ownHistory?.rankedCurrent?.value)
          ? `P/E ranked as market cap / common income ${selected.ownHistory.rankedCurrent.value}x, the construction of its history; the P/E shown is price / diluted EPS.` : null,
        cashOwnershipScope ?? null,
        completeSample ? null : "Historical sample dates unavailable or incomplete.",
        completeSample && missingMarketDates > 0 ? `${missingMarketDates} market observation date(s) unavailable; fiscal period dates are not substituted.` : null,
        "Historical publication availability at the market observation dates is not established; this is a retrospective comparison of retained statement history.",
        selected.key !== ownKeys[0] && gainInflated !== undefined ? `${HISTORY_KEY_LABEL[ownKeys[0]!] ?? ownKeys[0]} not ranked: ${gainInflated.basis}; using ${HISTORY_KEY_LABEL[selected.key] ?? selected.key} own-history rank.` : null,
        selected.key !== ownKeys[0] && gainInflated === undefined ? `${HISTORY_KEY_LABEL[ownKeys[0]!] ?? ownKeys[0]} history comparison unavailable; using ${HISTORY_KEY_LABEL[selected.key] ?? selected.key} own-history rank. This does not imply the current multiple is unavailable.` : null,
      ].filter(Boolean).join(" ") : ["Own-history rank unavailable.", cashOwnershipScope].filter(Boolean).join(" ");
      if (selected) {
        operand(`${selected.key} current multiple`, selected.current, `computed.valuation.multiples.${selected.key}.current`, quoteDate);
        operand("own-history rank", selected.ownHistory!.percentileRank, `computed.valuation.multiples.${selected.key}.ownHistory.percentileRank`, quoteDate);
        operand("historical observations", selected.ownHistory!.observations, `computed.valuation.multiples.${selected.key}.ownHistory.observations`, null);
        if (completeSample) details.forEach((point, index) => {
          operand(`historical multiple, period ending ${point.periodEnd}`, point.value,
            `computed.valuation.multiples.${selected.key}.ownHistory.observationDetails[${index}].value`, day(point.marketDate));
        });
      }
    } else if (i.valuation.kind === "dcf") {
      const a = i.valuation.assumptions;
      if (id === "reverseImpliedVsAchievable") {
        operand("implied starting growth, same fade", i.valuation.reverseDcf?.impliedRevenueGrowthPct, "computed.valuation.reverseDcf.impliedRevenueGrowthPct", quoteDate);
        operand("base starting growth, same fade", i.valuation.reverseDcf?.baseRevenueGrowthPct ?? a?.growthPath.value[0], "computed.valuation.reverseDcf.baseRevenueGrowthPct", day(a?.asOf.statements));
        result.windowYears = a?.years ?? null;
        result.period = "Same explicit DCF horizon and fading growth-path family; comparing first-year anchors.";
        // AMZN audit 2026-10-20 finding 10: the grader scores an unbracketed scan at its range end.
        const outside = i.valuation.reverseDcf?.growthOutsideRange;
        const base = i.valuation.reverseDcf?.baseRevenueGrowthPct ?? a?.growthPath.value[0];
        if (!finite(i.valuation.reverseDcf?.impliedRevenueGrowthPct) && outside && finite(base)) {
          operand("growth search-range end the price lies beyond", outside.boundPct, "computed.valuation.reverseDcf.growthOutsideRange.boundPct", quoteDate);
          operand("DCF per share at that range end", outside.perShareAtBound, "computed.valuation.reverseDcf.growthOutsideRange.perShareAtBound", quoteDate);
          const gap = (outside.boundPct - base).toFixed(2);
          // Independent review of these fixes: an implied gap is stated only
          // when value rises with growth; otherwise only the range-end score.
          result.fallbackReason = `No implied growth was solved: ${outside.basis}. ` + (outside.rising === false
            ? outside.side === "above"
              ? `No implied growth is inferred; the price is above the value at every growth in the range, so the signal scores at the band floor.`
              : `No implied growth is inferred; the price is below the value at every growth in the range, so the signal is scored at the range end (${gap} pp from base).`
            : outside.side === "above"
              ? `Implied minus base starting growth is therefore at least ${gap} pp, past the band's last breakpoint, so the signal scores at the band floor.`
              : `Implied minus base starting growth is therefore at most ${gap} pp, and the signal is scored at that bound; a wider gap would score no lower.`);
        }
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
    result.period = `Annualized weighted-average diluted common-share trend; ${result.period ?? "window unavailable"}`;
    result.fallbackReason = "This income-statement denominator trend does not measure point-in-time outstanding shares or economic dilution; IPOs, conversions and anti-dilutive exclusions can affect comparability.";
    operand("start weighted-average diluted common shares", trend.startShares, "computed.capital.shareCount.startShares", result.startDate); operand("end weighted-average diluted common shares", trend.endShares, "computed.capital.shareCount.endShares", result.endDate);
  } else if (id === "buybackTiming") {
    // D-61: each covered fiscal year's actual price paid against that year's
    // average price; the quote is not an input.
    result.family = "capital-return-policy";
    const b = i.capital.buybackPriceAnalysis;
    const used = b.years.filter(r => finite(r.actualPricePaid) && finite(r.avgPriceProxy) && r.repurchased > 0);
    dates(used[0]?.date, used.at(-1)?.date);
    result.period = `Fiscal years with tagged repurchase prices ${result.period ?? "unavailable"}; each compared with the same year's average price`;
    result.fallbackReason = "This same-year execution-price comparison does not assess contemporaneous intrinsic-value discipline.";
    for (const row of used) {
      operand(`price paid, year ending ${row.date}`, row.actualPricePaid, "computed.capital.buybackPriceAnalysis.years.actualPricePaid", day(row.date));
      operand(`average price, year ending ${row.date}`, row.avgPriceProxy, "computed.capital.buybackPriceAnalysis.years.avgPriceProxy", day(row.date));
    }
    operand("share of repurchase dollars covered, percent", b.timingCoveragePct, "computed.capital.buybackPriceAnalysis.timingCoveragePct", result.endDate);
  } else if (id === "grossMarginLevel" || id === "operatingMarginSlope") {
    result.family = "profitability";
    const rows = (id === "grossMarginLevel" ? i.growth.margins.gross.series : i.growth.margins.operating.series).filter(r => finite(r.pct));
    if (id === "grossMarginLevel") {
      const latest = scoringMargin(i.growth.margins.gross.series, i.growth.asOf);
      dates(null, latest.date); result.fallbackReason = latest.reason;
      operand("gross margin", latest.pct, "computed.growth.margins.gross.series");
    } else {
      dates(rows[0]?.date, rows.at(-1)?.date);
      for (const row of rows) operand(`operating margin at ${row.date}`, row.pct, "computed.growth.margins.operating.series", day(row.date));
    }
  }
  return result;
}
