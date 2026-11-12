/**
 * Stage B, the Stage C payload and the data-only report give the same bytes
 * with the per-run computation context as without it (P13: computed once,
 * read everywhere; every figure identical), and nothing they run writes to
 * what the context shares. The SEC companyfacts are deep-frozen for the cached
 * run, and so is every value the context shares between readers
 * (`memoizeShared`), so any write throws in these strict-mode modules.
 * Copies handed out by `memoize` are the callers' own and may be written.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CompanyFacts } from "@/edgar/xbrl";
import { balanceIntegrityView } from "@/pipeline/balanceIntegrity";
import { runStageB } from "@/pipeline/compute";
import { buildDataOnlyReport, NO_KEY_SKIP_REASON } from "@/pipeline/jobRunner";
import { canonicalSnapshotJson } from "@/pipeline/runInputSnapshot";
import { validateBundle } from "@/pipeline/stageA/validate";
import { assembleContextPayload, serializePayloadForPrompt } from "@/pipeline/stageC/payload";
import type { DataBundle } from "@/pipeline/types";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { withIssuerFacts } from "./helpers/confirmedIssuer";

const state = vi.hoisted(() => ({ bypass: false, freeze: false, calls: new Map<string, number>(), computes: new Map<string, number>(), servedFrozen: new Set<string>() }));

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Reflect.ownKeys(value)) deepFreeze((value as Record<PropertyKey, unknown>)[key]);
  }
  return value;
}

vi.mock("@/edgar/computationContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/edgar/computationContext")>();
  const count = (map: Map<string, number>, ns: string) => map.set(ns, (map.get(ns) ?? 0) + 1);
  return {
    ...actual,
    memoize: <T>(ns: string, input: object | string, args: unknown, compute: () => T): T => {
      count(state.calls, ns);
      if (state.bypass) return compute();
      return actual.memoize(ns, input, args, () => { count(state.computes, ns); return compute(); });
    },
    memoizeShared: <T>(ns: string, input: object | string, args: unknown, compute: () => T): T => {
      count(state.calls, ns);
      if (state.bypass) return compute();
      return actual.memoizeShared(ns, input, args, () => { count(state.computes, ns); const value = compute(); return state.freeze ? deepFreeze(value) : value; });
    },
  };
});

const fixture = (name: string): CompanyFacts =>
  JSON.parse(readFileSync(path.join(process.cwd(), "fixtures", "edgar", `${name}_companyfacts_audit_20261019.json`), "utf8")) as CompanyFacts;

/** A synthetic vendor bundle carrying an issuer's real SEC companyfacts as a confirmed issuer. */
function bundleFor(symbol: string, facts: CompanyFacts, sic: string): DataBundle {
  const bundle = completeCurrencyBundle({ symbol, sic });
  return withIssuerFacts(bundle, facts);
}

/** The job runner's deterministic chain (scripts/golden/worker.ts follows the same order). */
function runChain(bundle: DataBundle): { stageB: string; payload: string; report: string } {
  const validation = validateBundle(bundle, { now: new Date(bundle.builtAt) });
  const computed = runStageB(bundle, undefined, validation);
  const view = balanceIntegrityView(bundle);
  const payload = assembleContextPayload(view, computed, validation);
  const report = buildDataOnlyReport({
    symbol: view.symbol, companyName: view.symbol, generatedAt: view.builtAt, model: "none", costUsd: 0,
    bundle: view, validation, computed, costBreakdown: [], execution: [], reason: NO_KEY_SKIP_REASON,
  });
  return { stageB: canonicalSnapshotJson(computed), payload: serializePayloadForPrompt(payload), report: JSON.stringify(report) };
}

afterEach(() => {
  // servedFrozen accumulates across the cases on purpose; the check after them reads it.
  state.bypass = false;
  state.freeze = false;
  state.calls.clear();
  state.computes.clear();
  vi.useRealTimers();
});

describe("Stage B, payload and data-only report with the computation context", () => {
  it.each([
    { symbol: "PGR", name: "pgr", sic: "6331" },
    { symbol: "O", name: "o", sic: "6798" },
    { symbol: "SNOW", name: "snow", sic: "7372" },
  ])("$symbol: identical bytes cached and uncached, with the shared evidence frozen", ({ symbol, name, sic }) => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-07-06T00:00:00.000Z") });
    state.bypass = true;
    const uncached = runChain(bundleFor(symbol, fixture(name), sic));
    const uncachedCalls = state.calls.get("statements") ?? 0;
    expect(uncachedCalls).toBeGreaterThan(1);

    state.bypass = false;
    state.freeze = true;
    state.calls.clear();
    const bundle = bundleFor(symbol, fixture(name), sic);
    if (!bundle.edgar.companyFacts?.ok) throw new Error("fixture facts missing");
    deepFreeze(bundle.edgar.companyFacts.value.data);
    const cached = runChain(bundle);

    expect(cached.stageB).toBe(uncached.stageB);
    expect(cached.payload).toBe(uncached.payload);
    expect(cached.report).toBe(uncached.report);
    // The same reads happened, and some were served from the context.
    expect(state.calls.get("statements")).toBe(uncachedCalls);
    expect(state.computes.get("statements")!).toBeLessThan(uncachedCalls);
    for (const [ns, n] of state.calls) if (n > (state.computes.get(ns) ?? 0)) state.servedFrozen.add(ns);
  });

  it("the frozen runs above exercised every shared value and served hits for the statements", () => {
    expect([...state.servedFrozen].sort()).toEqual(expect.arrayContaining(["factsForFilings", "parsedConceptPoints", "statements"]));
  });

  it("leaves no context open after a run, so later direct calls are uncached", () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-07-06T00:00:00.000Z") });
    runChain(bundleFor("PGR", fixture("pgr"), "6331"));
    state.calls.clear();
    state.computes.clear();
    runChain(bundleFor("PGR", fixture("pgr"), "6331"));
    // A second run (new bundle, new facts object) recomputes everything it computed the first time.
    expect(state.computes.get("statements")! > 0).toBe(true);
  });
});
