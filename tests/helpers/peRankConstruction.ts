import type { MultiplesFrameworkInputs } from "@/pipeline/stageB/valuation";

/** Synthetic same-construction history: retained 20 quarters have median25x. */
export function peRankIssuer(dilution: number, income: Partial<NonNullable<MultiplesFrameworkInputs["incomeTtm"]>> = {}): MultiplesFrameworkInputs {
  const dates: string[] = [];
  for (let year = 2026; dates.length < 24; year--) for (const end of ["12-31", "09-30", "06-30", "03-31"]) {
    if (`${year}-${end}` <= "2026-06-30" && dates.length < 24) dates.push(`${year}-${end}`);
  }
  return {
    quote: { price: 50, marketCap: 500, currency: "USD" }, reportedCurrency: "USD",
    incomeTtm: { date: dates[0], revenue: 200, operatingIncome: 26, depreciationAndAmortization: 5, netIncome: 20, epsDiluted: 20 / (10 * dilution), ...income },
    cashFlowTtm: { date: dates[0], operatingCashFlow: 30, capitalExpenditure: -5 },
    balance: { date: dates[0], basis: "quarter", totalDebt: 0, cashAndShortTermInvestments: 0, totalStockholdersEquity: 150, minorityInterest: 0, preferredStock: 0, goodwill: 0, intangibleAssets: 0 },
    quarterlyFundamentals: dates.map(date => ({ date, revenue: 50, operatingIncome: 6.5, depreciationAndAmortization: 1.25, netIncome: 5,
      operatingCashFlow: 7.5, capitalExpenditure: -1.25, totalStockholdersEquity: 150, totalDebt: 0, cashAndShortTermInvestments: 0 })),
    enterpriseValuesHistory: dates.slice(0,21).map((date,index) => ({ date, marketCapitalization: (29.75 - index * .5) * 20, enterpriseValue: (29.75 - index * .5) * 20, sourceId: `ev:${date}` })),
  };
}
