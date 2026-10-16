import type { DataBundle } from "@/pipeline/types";

/** Explicit issuer identity for tests that intentionally admit SEC fixture facts. */
export function confirmFixtureIssuer(bundle: DataBundle, cik: number): void {
  bundle.edgar.cik = { ok: true, value: { source: "edgar", endpoint: "fixture:SEC ticker mapping",
    asOf: bundle.builtAt.slice(0, 10), fetchedAt: bundle.builtAt,
    data: { cik, cik10: String(cik).padStart(10, "0"), ticker: bundle.symbol, title: "Confirmed test issuer" } } };
}
