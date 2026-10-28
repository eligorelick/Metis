/** AI-301: a stock-peers market cap is money only in a currency that peer's own data establishes. */
import { describe, expect, it } from "vitest";

import { runStageB } from "@/pipeline/compute";
import type { ValidationReport } from "@/pipeline/stageA/validate";
import { assembleContextPayload, serializePayloadForPrompt, type ContextPayload } from "@/pipeline/stageC/payload";
import { matchProvenanceRecord } from "@/pipeline/stageC/provenance";
import type { DataBundle } from "@/pipeline/types";

import { BUILT_AT, completeCurrencyBundle } from "./helpers/currencyBundle";

const EMPTY_VALIDATION = { checks: [], flags: [], gaps: [] } as unknown as ValidationReport;

describe("peer market-cap currency", () => {
  function withPeers(listingCurrencies: Record<string, string>): DataBundle {
    const rows = [
      // AI-301 itself: a foreign cap inside the 100x band (69.5x the subject's 10.00B), listed at HEAD as "(USD, inherited)" and verifiable as USD.
      { symbol: "9998.TW", companyName: "Example Taipei Corp.", price: 150, mktCap: 695e9 },
      { symbol: "9999.T", companyName: "Example Tokyo Corp.", price: 12000, mktCap: 21e12 },
      { symbol: "PEER", companyName: "Peer Inc", price: 50, mktCap: 4e9 },
      { symbol: "MICRO", companyName: "Micro Inc", price: 1, mktCap: 50e6 },
    ];
    return { ...completeCurrencyBundle({}),
      peers: { ok: true, value: { data: { rows, raw: rows }, asOf: "2026-07-01", source: "fmp", endpoint: "stock-peers", fetchedAt: BUILT_AT } },
      peerFundamentals: { candidates: {}, candidateCount: 2, exclusions: [], notes: [], listingCurrencies, collectedAt: BUILT_AT } } as unknown as DataBundle;
  }
  const build = (b: DataBundle) => assembleContextPayload(b, runStageB(b), EMPTY_VALIDATION);
  const fig = (p: ContextPayload, s: string) => p.peers.figures.find((f) => f.label.startsWith(`${s} — `));

  it("registers a peer cap only in the currency that peer's own data states, never the subject's", () => {
    const payload = build(withPeers({ PEER: "USD" }));
    const registry = payload.provenanceRegistry ?? [];
    expect(fig(payload, "9998.TW")).toMatchObject({ value: 695e9, currency: null });
    expect(matchProvenanceRecord({ source: "payload.peers.9998-tw-example-taipei-corp", value: 695e9, unit: "currency", currency: "USD", period: null, asOf: "2026-07-01" } as never, registry).ok).toBe(false);
    expect(payload.peers.notes).toContain("9998.TW (Example Taipei Corp.): size not compared: the provider row states no currency and its exchange suffix (.TW) differs from the subject's (none).");
    expect(fig(payload, "9999.T")).toMatchObject({ value: 21e12, currency: null });
    expect(fig(payload, "9999.T")!.currencyInherited).toBeUndefined();
    expect(registry.some((r) => r.id.startsWith("payload.peers.9999-t"))).toBe(false);
    expect(matchProvenanceRecord({ source: "payload.peers.9999-t-example-tokyo-corp", value: 21e12, unit: "currency", currency: "USD", period: null, asOf: "2026-07-01" } as never, registry).ok).toBe(false);
    expect(serializePayloadForPrompt(payload)).toContain("9999.T — Example Tokyo Corp.: 21000000000000 currency mkt cap (currency unknown)");
    expect(payload.peers.notes).toContain("9999.T (Example Tokyo Corp.): size not compared: the provider row states no currency and its exchange suffix (.T) differs from the subject's (none).");
    expect(fig(payload, "PEER")).toMatchObject({ value: 4e9, currency: "USD" });
    const peerRecord = registry.find((r) => r.id === fig(payload, "PEER")!.provenanceId)!;
    expect(peerRecord).toMatchObject({ currency: "USD" });
    expect(peerRecord.currencyBasis).toBeUndefined();
    // Control (D-65): the same-market micro-cap is still kept out of the list.
    expect(fig(payload, "MICRO")).toBeUndefined();
    expect(payload.peers.notes).toContain("MICRO (Micro Inc) is not listed as a peer: size screen: market cap 50M is 200× smaller than the subject's 10.00B, outside the 100× comparable-size band (house rule D-65).");
    // Control (D-57 unchanged for the subject's own rows): the estimates still inherit USD.
    expect(payload.estimates.figures.some((f) => f.currencyInherited === true && f.currency === "USD")).toBe(true);
  });

  it("registers a peer listed in another established currency in that currency and does not size-compare it", () => {
    const payload = build(withPeers({ PEER: "USD", "9999.T": "JPY" }));
    expect(fig(payload, "9999.T")).toMatchObject({ value: 21e12, currency: "JPY" });
    expect((payload.provenanceRegistry ?? []).find((r) => r.id === fig(payload, "9999.T")!.provenanceId)).toMatchObject({ currency: "JPY", value: 21e12 });
    expect(payload.peers.notes).toContain("9999.T (Example Tokyo Corp.): size not compared: listed in JPY, the subject in USD; no currency conversion.");
  });

  it("reads an admitted candidate's profile when a pre-batch snapshot recorded no listing currency", () => {
    const b = withPeers({}) as unknown as { peerFundamentals: { candidates: Record<string, unknown> } };
    const gap = { ok: false, gap: { field: "fixture", reason: "fixture gap", severity: "info" } };
    b.peerFundamentals.candidates.PEER = { profile: { ok: true, value: { data: { rows: [{ symbol: "PEER", currency: "USD" }], raw: [] }, asOf: "2026-07-01", source: "fmp", endpoint: "profile", fetchedAt: BUILT_AT } },
      quote: gap, incomeQuarterly: gap, balanceQuarterly: gap };
    expect(fig(build(b as unknown as DataBundle), "PEER")).toMatchObject({ currency: "USD" });
  });
});
