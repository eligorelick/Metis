import { describe, expect, it } from "vitest";
import { comparablePeers, type PeerEconomicEvidence } from "@/pipeline/stageB/peerComparability";
import { multiplesFramework } from "@/pipeline/stageB/valuation";

const evidence: PeerEconomicEvidence = { businessModel: "advertising_platform", accountingStandard: "US_GAAP", periodBasis: "TTM", periodEnd: "2026-06-30", priceCurrency: "USD", statementCurrency: "USD", definitions: { peTtm: "GAAP diluted earnings", priceToFcf: "OCF minus cash capex before SBC" }, sourceIds: ["issuer_filing:financial_model"], availableAt: "2026-08-01" };
const peers = Array.from({ length: 4 }, (_, i) => ({ symbol: `P${i}`, economicEvidence: evidence, multiples: { peTtm: 10 + 2 * i, priceToFcf: 20 } }));
describe("economic peer comparability precedes statistics", () => {
  it("retains comparable raw peers and blocks missing/different business economics before any median", () => {
    const raw = [...peers, { ...peers[0]!, symbol: "CLOUD", economicEvidence: { ...evidence, businessModel: "infrastructure_cloud" } }, { symbol: "UNKNOWN", multiples: { peTtm: 1 } }];
    const out = comparablePeers(evidence, raw, "peTtm", "2026-10-13");
    expect(out.eligible.map((p) => p.symbol)).toEqual(["P0", "P1", "P2", "P3", "UNKNOWN"]);
    expect(out.excluded).toMatchObject([{ symbol: "CLOUD", reasons: ["different business-model economics"] }]);
    expect(out.caveats).toEqual([expect.stringMatching(/UNKNOWN.*not independently sourced/)]);
    expect(raw).toHaveLength(6);
    expect(out.eligible[0]).toBe(peers[0]);
  });
  it.each([
    ["accounting basis", { accountingStandard: "IFRS" }],
    ["cash-flow definition", { definitions: { priceToFcf: "issuer adjusted FCF after lease principal" } }],
    ["period basis", { periodBasis: "FY" }],
    ["currency alignment", { statementCurrency: "EUR" }],
    ["source availability", { availableAt: "2026-10-14" }],
    ["source support", { sourceIds: [] }],
  ])("excludes an incompatible %s", (_label, patch) => {
    expect(comparablePeers(evidence, [{ ...peers[0]!, economicEvidence: { ...evidence, ...patch } as PeerEconomicEvidence }], "priceToFcf", "2026-10-13").eligible).toEqual([]);
  });
  it("discloses, rather than silently drops, a median whose subject evidence is absent", () => {
    const input = { quote: { price: 100, marketCap: 1000, currency: "USD" }, reportedCurrency: "USD", incomeTtm: { date: "2026-06-30", revenue: 100, operatingIncome: 30, netIncome: 20, depreciationAndAmortization: 2, epsDiluted: 2 }, cashFlowTtm: null, balance: null, peers, peerComparisonAsOf: "2026-10-13" };
    const out = multiplesFramework("general", input);
    expect(out.multiples.find((m) => m.key === "peTtm")?.peers?.median).toBe(13);
    expect(out.gaps.some((g) => /caveat.*not independently sourced/i.test(g.reason))).toBe(true);
    const supported = multiplesFramework("general", { ...input, subjectEconomicEvidence: evidence, peerComparisonAsOf: "2026-10-13" });
    expect(supported.multiples.find((m) => m.key === "peTtm")?.peers?.median).toBe(13);
    expect(supported.gaps.some((g) => /caveat/i.test(g.reason))).toBe(false);
    const contrary = multiplesFramework("general", { ...input, subjectEconomicEvidence: { ...evidence, accountingStandard: "IFRS" }, peerComparisonAsOf: "2026-10-13" });
    expect(contrary.multiples.find((m) => m.key === "peTtm")?.peers).toBeNull();
  });
});
