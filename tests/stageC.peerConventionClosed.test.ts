/** AI-301: a stock-peers row's currency never comes from a provider convention, only from its own row or profile. */
import { describe, expect, it, vi } from "vitest";

// Simulates ANALYST_ESTIMATE_PROVIDER_CONVENTION being set to EUR: estimateCurrency
// then returns EUR for any row that states no currency of its own.
vi.mock("@/pipeline/estimateCurrency", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/pipeline/estimateCurrency")>();
  return { ...actual, estimateCurrency: (row: object | null | undefined) => actual.estimateCurrency(row) ?? "EUR" };
});

import { runStageB } from "@/pipeline/compute";
import { loadPeerFundamentals } from "@/pipeline/peers";
import type { ValidationReport } from "@/pipeline/stageA/validate";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import type { DataBundle, FmpFetch } from "@/pipeline/types";
import type { FmpRawRow } from "@/providers/fmp";

import { BUILT_AT, completeCurrencyBundle } from "./helpers/currencyBundle";

const EMPTY_VALIDATION = { checks: [], flags: [], gaps: [] } as unknown as ValidationReport;

describe("a stock-peers row never takes a convention currency", () => {
  it("leaves the payload cap unestablished although estimateCurrency would answer EUR", () => {
    const rows = [{ symbol: "PEER", companyName: "Peer Inc", price: 50, mktCap: 4e9 }];
    const bundle = { ...completeCurrencyBundle({}),
      peers: { ok: true, value: { data: { rows, raw: rows }, asOf: "2026-07-01", source: "fmp", endpoint: "stock-peers", fetchedAt: BUILT_AT } },
      peerFundamentals: { candidates: {}, candidateCount: 1, exclusions: [], notes: [], listingCurrencies: {}, collectedAt: BUILT_AT } } as unknown as DataBundle;
    const payload = assembleContextPayload(bundle, runStageB(bundle), EMPTY_VALIDATION);
    expect(payload.peers.figures[0]).toMatchObject({ value: 4e9, currency: null });
    expect((payload.provenanceRegistry ?? []).some((r) => r.origin === "fmp:stock-peers")).toBe(false);
  });

  it("does not treat a convention currency as established when screening discovery", async () => {
    const now = new Date("2026-10-13T18:00:00Z");
    const data = (r: FmpRawRow[]): FmpFetch<FmpRawRow> => ({ ok: true, value: { data: { rows: r, raw: r }, source: "fmp", endpoint: "test", asOf: "2026-10-13", fetchedAt: now.toISOString() } }) as never;
    const requested: string[] = [];
    const refused = { ok: false as const, gap: { field: "fmp.profile", reason: "refused", severity: "info" as const } };
    const result = await loadPeerFundamentals({ symbol: "ROOT", now, enabled: true,
      profile: { symbol: "ROOT", cik: "1", companyName: "Root Inc", industry: "X", sector: "Y", currency: "USD", isAdr: false, marketCap: 180e9 },
      discovered: data([{ symbol: "TINY", companyName: "Tiny Inc", mktCap: 50e6 }]) as never,
      client: () => ({ profile: async (s: string) => { requested.push(s); return refused; }, quote: async () => refused, incomeStatement: async () => refused, balanceSheet: async () => refused }) });
    expect(result.exclusions.find((e) => e.symbol === "TINY")?.reason).toMatch(/^size screen:/);
    expect(requested).not.toContain("TINY");
  });
});
