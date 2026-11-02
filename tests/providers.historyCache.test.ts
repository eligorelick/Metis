import { expect, it } from "vitest";
import { historyTailTtlMs, historyWindowFallback } from "@/providers/historyCache";
it("only canonical same-symbol daily history keys may fall back", () => {
 for (const key of ["invalid", "fred:/series", "yahoo:/v8/finance/chart/X?interval=1h&period1=2026-01-01&period2=2026-10-01", "fmp:/stable/historical-price-eod/full?symbol=X"]) {
  expect(historyWindowFallback(key)).toBeUndefined();
  expect(historyTailTtlMs(key,new Date("2026-10-02T00:00:00Z"))).toBeNull();
 }
 const fallback=historyWindowFallback("fmp:/stable/historical-price-eod/full?symbol=X&from=2025-10-02&to=2026-10-02")!;
 for (const candidate of ["invalid", "fmp:/stable/historical-price-eod/full?symbol=Y&from=2025-10-01&to=2026-10-01", "fmp:/stable/historical-price-eod/full?symbol=X&from=bad&to=2026-10-01", "fmp:/stable/historical-price-eod/full?symbol=X&from=2025-10-03&to=2026-10-03", "fmp:/stable/historical-price-eod/full?symbol=X&from=2025-09-20&to=2026-09-20"]) expect(fallback.acceptKey(candidate)).toBe(false);
 expect(fallback.acceptKey("fmp:/stable/historical-price-eod/full?symbol=X&from=2025-10-01&to=2026-10-01")).toBe(true);
 expect(historyTailTtlMs("fmp:/stable/historical-price-eod/full?symbol=X&from=2025-10-02&to=2026-10-02",new Date("2026-10-02T15:00:00Z"))).toBe(900000);
});
