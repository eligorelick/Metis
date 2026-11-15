/** Restore only the reviewed public-polish wording for existing byte-level pins.
 * New reader wording is checked separately; numbers and all other bytes stay pinned.
 */
const wording = [
  [
    " (house rule: median of methods).",
    " (house rule, WS6 D-18: median of methods; the former \"lower of the 3y/5y CAGR\" and sign-disagreement rules are RETIRED)."
  ],
  [
    "treated as non-operating assets, and the equity bridge adds them back at carrying value less the tax a sale would owe",
    "non-operating, house rule D-60, and the equity bridge adds them back at carrying value less the tax a sale would owe, house rule D-65"
  ],
  [
    "ranked in. The capital block's house-default free cash flow subtracts SBC and is a DIFFERENT figure; the two are never mixed",
    "ranked in. The capital block's house-default free cash flow subtracts SBC and is a DIFFERENT figure; the two are never mixed (WS6 review, SHOULD-FIX 4)"
  ]
] as const;
export function restorePublicPolishGolden<T>(value: T): T {
  return JSON.parse(JSON.stringify(value), (_key, item: unknown) => {
    if (typeof item !== "string") return item;
    return wording.reduce((text, [current, previous]) => text.replaceAll(current, previous), item);
  }) as T;
}


/** D-304-D-306: exact reader-only replacements for historical whole-output pins.
 * Current wording is checked by release.presentationProducers and financialDiagnostics.
 */
export function restoreReleaseLeftoversGolden<T>(value: T): T {
  const replacements = [
    ["Provider trailing effective tax rate (observed)", "FMP ratios-ttm effectiveTaxRateTTM (observed effective rate)"],
    ["Provider effective tax rate (observed)", "FMP ratios effectiveTaxRate (observed effective rate)"],
    ["TATA: net income from continuing operations unavailable", "TATA: netIncomeFromContinuingOperations unavailable"],
    ["net income used (fallback).", "netIncome used (fallback)."],
    ["cash and cash equivalents withheld (", "cashAndCashEquivalents withheld ("],
    ["cash and cash equivalents or short-term investments missing", "cashAndCashEquivalents or shortTermInvestments missing"],
    ["Short-term investments at ", "shortTermInvestments at "],
    ["Current P/E empirical percentile rank", "Current peTtm empirical percentile rank"],
    ["P/E current multiple", "peTtm current multiple"],
    ["Current EV/EBITDA empirical percentile rank", "Current evToEbitda empirical percentile rank"],
    ["EV/EBITDA current multiple", "evToEbitda current multiple"],
    ["Current Price/FCF empirical percentile rank", "Current priceToFcf empirical percentile rank"],
    ["Price/FCF current multiple", "priceToFcf current multiple"],
    ["Current P/TBV empirical percentile rank", "Current priceToTbv empirical percentile rank"],
    ["P/TBV current multiple", "priceToTbv current multiple"],
    ["Current P/B empirical percentile rank", "Current priceToBook empirical percentile rank"],
    ["P/B current multiple", "priceToBook current multiple"],
    ["Current P/FFO empirical percentile rank", "Current priceToFfo empirical percentile rank"],
    ["P/FFO current multiple", "priceToFfo current multiple"],
    ["Current P/AFFO empirical percentile rank", "Current priceToAffo empirical percentile rank"],
    ["P/AFFO current multiple", "priceToAffo current multiple"],
    ["which is the original-scale equivalent used for scoring", "which is the value the altmanZOriginalScale driver carries"],
    ["terminal reinvestment = terminal growth / terminal return on invested capital", "terminal reinvestment = gTerm / ROICterm"],
    ["WACC - terminal growth <", "WACC - gTerm <"],
    ["The capital block deducts SBC where disclosed and otherwise labels free cash flow unadjusted; its treatment is stated separately", "The capital block's house-default free cash flow subtracts SBC and is a DIFFERENT figure; the two are never mixed"],
    ["the reported free-cash-flow SBC adjustment is not established.", "the reported free-cash-flow metric subtracts it as well (house default)."],
    ["SBC is not established, so it is not deducted from the reported free-cash-flow metric.", "the reported free-cash-flow metric subtracts it as well (house default)."],
    ["net income from discontinued operations nonzero", "netIncomeFromDiscontinuedOperations nonzero"],
    ["it is reported as terminal excess return", "it is reported as terminalExcess"],
  ] as const;
  const result = structuredClone(value);
  const restore = (item: unknown): unknown => {
    if (typeof item === "string") {
      if (/^house rule: \|total other income and expenses, net\| > [\d.]+% of \|operating income\|$/.test(item))
        return item.replace("total other income and expenses, net", "totalOtherIncomeExpensesNet").replace("operating income", "operatingIncome");
      return replacements.reduce((text, [current, prior]) => text.replaceAll(current, prior), item);
    }
    if (item && typeof item === "object") for (const [key, child] of Object.entries(item))
      (item as Record<string, unknown>)[key] = restore(child);
    return item;
  };
  return restore(result) as T;
}
