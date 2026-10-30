import { completeCurrencyBundle } from "./currencyBundle";

export function adrMarketEquityBundle(options: {
  adr?: boolean; cap?: number | null; debt?: number; statementsCurrency?: string;
  profileScope?: "issuer-common"; quoteScope?: "issuer-common";
} = {}) {
  const b = completeCurrencyBundle({ sic: "3571", symbol: "SCOPE", debt: (options.debt ?? 300e6) / 1e6,
    annualCurrency: options.statementsCurrency ?? "USD",
    quarterCurrencies: Array(4).fill(options.statementsCurrency ?? "USD"),
    siblingQuarterCurrencies: Array(4).fill(options.statementsCurrency ?? "USD") });
  if (!b.profile.ok || !b.quote.ok || !b.statements.balanceAnnual.ok) throw new Error("fixture inputs missing");
  Object.assign(b.profile.value.data.rows[0]!, { isAdr: options.adr ?? true,
    marketCap: options.cap === undefined ? 10_000e6 : options.cap,
    ...(options.profileScope ? { marketCapSecurityBasis: options.profileScope } : {}) });
  Object.assign(b.quote.value.data.rows[0]!, { marketCap: options.cap === undefined ? 10_000e6 : options.cap,
    ...(options.quoteScope ? { marketCapSecurityBasis: options.quoteScope } : {}) });
  for (const row of b.statements.balanceAnnual.value.data.rows) Object.assign(row, {
    totalCurrentAssets: 600e6, totalCurrentLiabilities: 400e6, retainedEarnings: 300e6,
  });
  return b;
}
