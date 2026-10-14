/**
 * Review conditions derived only from the stored financial model. These are
 * prompts to revisit assumptions, not forecasts of price or mechanical ratings.
 * The reverse solve varies one path while holding the remaining model fixed.
 */
import type { ComputedMetrics } from "@/pipeline/compute";
import type { ThesisTrigger, TracedNumber } from "@/report/schema";
import { establishedCurrency } from "@/report/format";

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
  if (validHorizon && reverse?.method === "growth" && finite(reverse.impliedRevenueGrowthPct)) {
    triggers.push({
      id: "reverse-growth",
      metric: "Supported constant annual revenue growth",
      comparator: "below",
      threshold: reverseThreshold(reverse.impliedRevenueGrowthPct),
      horizon: `Across all ${years} explicit forecast years, with constant growth and no fade`,
      fixedAssumptions: [...commonFixed, "The operating-margin path remains at the base case."],
      consequence: "If revised evidence supports growth below this price-implied threshold, reassess the valuation case and recompute the reverse DCF. This is a conditional model comparison, not a next-period growth target or a predicted price change.",
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

  if (computed.projections.notApplicableReason !== null) return triggers;
  for (const metric of ["revenue", "operatingMargin"] as const) {
    const series = computed.projections.series.find((s) => s.metric === metric);
    const first = series?.base.slice().sort((a, b) => a.period.localeCompare(b.period))[0];
    if (!first || !/^(?:FY)?\d{4}$/.test(first.period) || !finite(first.value.value)) continue;
    if (first.value.source !== `computed.projections.${metric}.base`) continue;
    // A monetary milestone needs an established currency; no implicit USD.
    if (metric === "revenue" && establishedCurrency(first.value.unit, first.value.currency) === null) continue;
    if (metric === "operatingMargin" && first.value.unit !== "%") continue;
    triggers.push({
      id: `projection-${metric}`,
      metric: metric === "revenue" ? "Annual revenue on the model's reporting basis" : "Annual operating margin on the model's reporting basis",
      comparator: "below",
      threshold: structuredClone(first.value),
      horizon: first.periodStart && first.periodEnd
        ? `First modeled annual period: ${first.periodStart} through ${first.periodEnd} (display label ${first.period})`
        : `First projected annual period: ${first.period}; exact model dates are unavailable and must be established before comparing results`,
      fixedAssumptions: [
        "Compare the same annual period, accounting perimeter and metric definition.",
        "Use the report's original base-case forecast; do not replace it with a revised forecast when assessing the outcome.",
      ],
      consequence: "If comparable annual results or updated guidance fall below this base-case milestone, review the operating forecast and its valuation implications. A shortfall initiates review; it does not automatically invalidate the thesis.",
    });
  }
  return triggers;
}
