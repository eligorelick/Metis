import type { ValuationUse } from "@/report/schema";
import type { ValuationResult } from "./valuation";

/** Existing D-65 house safeguard; historical margin observations are not dated here. */
export const MAX_ROLL_FORWARD_DAYS = 200;
const DAY_MS = 86_400_000;
const DAYS_PER_YEAR = 365.25;

function strictDay(value: string | null): { day: string; ms: number } | null {
  if (value === null || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? { day: value, ms } : null;
}

export function classifyValuationDateUse(evidence: {
  statementDate: string | null; quoteDate: string | null; rolledTo: string | null; elapsedYears: number | null;
}): ValuationUse {
  const statement = strictDay(evidence.statementDate), quote = strictDay(evidence.quoteDate), rolled = strictDay(evidence.rolledTo);
  let valueDate = evidence.rolledTo === null ? statement?.day ?? null : rolled?.day ?? null;
  const result = (status: ValuationUse["status"], reason: ValuationUse["reason"]): ValuationUse => ({
    status, reason, statementDate: statement?.day ?? null, valueDate, quoteDate: quote?.day ?? null,
  });
  if (quote === null) return result("unestablished", "quote-date-missing");
  if (statement === null) return result("unestablished", "value-date-missing");
  if (evidence.rolledTo !== null) {
    if (rolled === null) return result("unestablished", "invalid-roll-forward");
    const days = (rolled.ms - statement.ms) / DAY_MS, elapsed = evidence.elapsedYears;
    if (days < 0 || days > MAX_ROLL_FORWARD_DAYS || elapsed === null || !Number.isFinite(elapsed) ||
      Math.abs(elapsed - days / DAYS_PER_YEAR) > 1e-9) return result("unestablished", "invalid-roll-forward");
    valueDate = rolled.day;
  } else if (evidence.elapsedYears !== null && evidence.elapsedYears !== 0) {
    return result("unestablished", "invalid-roll-forward");
  }
  if (valueDate! > quote.day) return result("unestablished", "future-value-date");
  if (valueDate === quote.day) return result("current", valueDate === statement.day ? "same-date" : "supported-roll-forward");
  return result("dated-reference", "not-rolled-to-quote");
}

/** Financial admission happens first. Date metadata cannot reopen a refused model. */
export function classifyValuationUse(valuation: ValuationResult, modelAvailable: boolean, quoteDate: string | null): ValuationUse {
  const dates = valuation.kind === "dcf"
    ? { statementDate: valuation.assumptions?.asOf.statements ?? null, rolledTo: valuation.assumptions?.valuationDate?.value ?? null,
      elapsedYears: valuation.assumptions?.valuationDate?.elapsedYears ?? null }
    : valuation.kind === "excess-return"
      ? { statementDate: valuation.excessReturn.asOf, rolledTo: valuation.excessReturn.valuationDate?.value ?? null,
        elapsedYears: valuation.excessReturn.valuationDate?.elapsedYears ?? null }
      : { statementDate: null, rolledTo: null, elapsedYears: null };
  const use = classifyValuationDateUse({ ...dates, quoteDate });
  if (valuation.kind === "reit" || valuation.kind === "pre-revenue" ||
    valuation.kind === "dcf-suppressed" && valuation.suppressionKind === "route-policy") {
    return { ...use, status: "not-applicable", reason: "route-policy" };
  }
  return modelAvailable ? use : { ...use, status: "unestablished", reason: "model-unavailable" };
}

export function valuationUseExplanation(use: ValuationUse): string {
  switch (use.reason) {
    case "not-rolled-to-quote": return `Dated reference value — valuation at ${use.valueDate}; not updated to price dated ${use.quoteDate}.`;
    case "quote-date-missing": return "Current valuation use withheld: the quote observation date is missing or invalid; analysis time is not a substitute.";
    case "value-date-missing": return "Current valuation use withheld: the model's valuation date is unestablished.";
    case "invalid-roll-forward": return `Current valuation use withheld: roll-forward dates or elapsed time are inconsistent with the existing ${MAX_ROLL_FORWARD_DAYS}-day safeguard.`;
    case "future-value-date": return "Current valuation use withheld: the model value is dated after the compared quote.";
    case "model-unavailable": return "Current valuation use withheld by the existing financial or model evidence requirements.";
    case "route-policy": return "A per-share intrinsic model is deliberately inapplicable under the selected route policy.";
    case "same-date": return "Model value and quote observations share the same date.";
    case "supported-roll-forward": return "Model value is supported by the existing roll-forward to the quote observation date.";
  }
}
