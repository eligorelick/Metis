/**
 * Review conditions derived only from the stored financial model. These are
 * prompts to revisit assumptions, not forecasts of price or mechanical ratings.
 * The reverse solve varies one path while holding the remaining model fixed.
 *
 * D-60: every condition must be observable. The former projection milestones
 * restated the base path (NVDA: "revenue below $469.70B", "margin below
 * 65.48%") and the reverse threshold was a growth rate on a modeled fade. Now:
 * the reverse threshold also names the revenue level it implies for the first
 * modeled year and the evidence beside it, and guidance supplies the
 * next-quarter checkpoints (revenue and gross margin against the low end of
 * management's own range).
 */
import type { ComputedMetrics } from "@/pipeline/compute";
import type { ThesisTrigger, TracedNumber } from "@/report/schema";
import { establishedCurrency, formatFinancialValue } from "@/report/format";
import { forecastYearPeriod, isStartingGrowthFamily } from "@/pipeline/stageB/valuation";

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function reverseThreshold(value: number): TracedNumber {
  return { value, unit: "%", source: "computed.valuation.reverseDcf", asOf: null, verified: null };
}

export function buildThesisTriggers(
  computed: Pick<ComputedMetrics, "valuation" | "projections">,
): ThesisTrigger[] {
  const triggers: ThesisTrigger[] = [];
  const val = computed.valuation;
  if (val.kind !== "dcf" || !val.dcf || !val.assumptions || !finite(val.dcf.perShare)) return triggers;
  const reverse = val.reverseDcf;
  const years = val.assumptions.years;
  const validHorizon = Number.isInteger(years) && years > 0;
  const commonFixed = [
    "Discount rate, terminal growth and reinvestment conventions remain at the model's base case.",
    "The current quote, net debt, other senior claims and diluted share count remain fixed.",
  ];
  const currency = establishedCurrency(computed.projections.series.find((s) => s.metric === "revenue")?.unit ?? "", null);
  const money = (v: number): string => formatFinancialValue(v, "currency", currency);
  const anchor = val.assumptions.revenueAnchor;
  const start = val.assumptions.startRevenue?.value;
  const anchorEnd = val.assumptions.forecastPeriod?.anchorEndDate;
  const firstWindow = anchorEnd ? forecastYearPeriod(anchorEnd, 1, val.assumptions.forecastPeriod?.basis ?? "rolling-12-month") : null;
  if (validHorizon && reverse?.method === "growth" && finite(reverse.impliedRevenueGrowthPct)) {
    const fades = isStartingGrowthFamily(reverse.growthPathFamily);
    const linear = reverse.growthPathFamily === "linear-fade-to-terminal";
    // The observable equivalent: the first modeled year's revenue the price requires.
    const impliedLevel = finite(start) && start > 0 ? start * (1 + reverse.impliedRevenueGrowthPct / 100) : null;
    const evidence = anchor?.evidence;
    const observable = impliedLevel === null || firstWindow === null ? "" :
      `; equivalent to revenue of ${money(impliedLevel)} for ${firstWindow.label} (${firstWindow.startDate} through ${firstWindow.endDate}), observable as reported quarters accumulate` +
      ` — against the base case's ${money(anchor?.yearOneRevenue ?? NaN)} (${anchor?.source ?? "model"})` +
      `${finite(evidence?.consensusYearOne) ? `, consensus ${money(evidence.consensusYearOne)}` : ""}` +
      `${finite(evidence?.guidedRunRate) ? ` and the guided run-rate ${money(evidence.guidedRunRate)}` : ""}`;
    triggers.push({
      id: "reverse-growth",
      metric: fades ? "Supported starting annual revenue growth" : "Supported constant annual revenue growth",
      comparator: "below",
      threshold: reverseThreshold(reverse.impliedRevenueGrowthPct),
      horizon: (fades
        ? linear
          ? `Starting annual growth, with a linear fade to the base model's final growth rate across ${years} explicit forecast years`
          : `Starting annual growth, with the base path's later years shifted by the same amount, fading out by the base model's final growth rate across ${years} explicit forecast years`
        : `Across all ${years} explicit forecast years, with constant growth and no fade`) + observable,
      fixedAssumptions: [...commonFixed, "The operating-margin path remains at the base case."],
      consequence: "If reported revenue, guidance or consensus for that window point below this price-implied level, reassess the valuation case and recompute the reverse DCF. This is a conditional model comparison, not a next-period growth target or a predicted price change.",
    });
  } else if (validHorizon && reverse?.method === "margin" && finite(reverse.impliedTerminalMarginPct)) {
    triggers.push({
      id: "reverse-margin",
      metric: "Supported terminal operating margin",
      comparator: "below",
      threshold: reverseThreshold(reverse.impliedTerminalMarginPct),
      horizon: `Margin fades from the starting level to the terminal level over ${years} explicit forecast years`,
      fixedAssumptions: [...commonFixed, "The revenue growth path remains at the base case; the operating-margin path is the reverse solver's fade."],
      consequence: "If revised evidence supports a terminal margin below this price-implied threshold, reassess margin durability and recompute the valuation. This is a conditional model comparison, not a next-quarter margin target.",
    });
  }

  // D-60: next-quarter checkpoints from management's own range.
  const quarter = anchor?.evidence?.guidedQuarter ?? null;
  if (quarter !== null && currency !== null && finite(quarter.revenueLow)) {
    triggers.push({
      id: "guided-quarter-revenue",
      metric: `Reported revenue for the guided quarter ending ${quarter.periodEnd}`,
      comparator: "below",
      threshold: { value: quarter.revenueLow, unit: currency, currency, source: quarter.source, asOf: quarter.asOf, verified: null },
      horizon: `The fiscal quarter ending ${quarter.periodEnd}, reported in the next earnings release (guided midpoint ${money(quarter.revenueMid)})`,
      fixedAssumptions: ["Compare GAAP revenue for the same fiscal quarter with the low end of the range management published."],
      consequence: "A result below the low end of management's own range would break the trajectory the year-one revenue anchor is checked against; review the anchor and recompute the DCF. A shortfall initiates review; it does not by itself invalidate the thesis.",
    });
    if (finite(quarter.grossMarginLowPct)) {
      triggers.push({
        id: "guided-quarter-gross-margin",
        metric: `Reported GAAP gross margin for the guided quarter ending ${quarter.periodEnd}`,
        comparator: "below",
        threshold: { value: quarter.grossMarginLowPct, unit: "%", source: quarter.source, asOf: quarter.asOf, verified: null },
        horizon: `The fiscal quarter ending ${quarter.periodEnd}, reported in the next earnings release`,
        fixedAssumptions: ["Compare the GAAP gross margin for the same fiscal quarter with the low end of the guided range."],
        consequence: "The base operating-margin path and the scenario margin ceiling rest on gross margin near the guided level; a result below the guided range calls for revisiting both. This is a review prompt, not a forecast.",
      });
    }
  }
  return triggers;
}
