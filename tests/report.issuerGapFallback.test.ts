import { expect, it } from "vitest";
import { classifyManifest, manifestIssuer } from "@/report/completeness";
const gaps = (fields: string[]) => fields.map(field => ({ field, severity: "warn" as const, reason: "Unavailable" }));
it("RPT-207 merges issuer price and statement fallbacks without unique endpoints", () => {
 const rows = gaps(["fmp.historicalPriceEodFull(INTU)", "fmp.historicalPriceEodFull(SPY)", "fmp.historicalPriceEodFull(XLK)", "fmp.incomeStatement(INTU,annual)", "keyless.eodPrices", "keyless.incomeAnnual"]);
 expect(manifestIssuer(rows)).toBe("INTU");
 const groups = classifyManifest(rows).dataGaps;
 expect(groups).toHaveLength(4);
 expect(groups.find(g => g.key === "eodPrices")?.fields).toHaveLength(2);
 expect(groups.find(g => g.key === "incomeAnnual")?.fields).toHaveLength(2);
});
it("RPT-207 retains ambiguity with several non-benchmark symbols", () => {
 expect(manifestIssuer(gaps(["fmp.historicalPriceEodFull(INTU)", "fmp.historicalPriceEodFull(AMD)"]))).toBeNull();
 expect(manifestIssuer(gaps(["fmp.historicalPriceEodFull(SPY)", "fmp.historicalPriceEodFull(XLK)"]))).toBeNull();
});
