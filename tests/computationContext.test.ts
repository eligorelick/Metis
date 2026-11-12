/**
 * The per-run computation context (src/edgar/computationContext.ts, P13):
 * exact-input keys, copies that callers cannot corrupt, and no entry outliving
 * its run step. The statement builder is checked against its uncached self for
 * every distinct option set the callers request, on real SEC companyfacts.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { canonicalKey, computationContextActive, memoize, memoizeShared, withComputationContext } from "@/edgar/computationContext";
import { parseOperatingRevenueBridge } from "@/edgar/currentReports";
import { factsForFilings, parsedConceptPoints } from "@/edgar/filedPresentation";
import { buildStatementsFromCompanyFacts, buildStatementsUncached, type StatementBuildOptions } from "@/edgar/statements";
import type { CompanyFacts } from "@/edgar/xbrl";
import { unavailableSplitEvidence } from "@/providers/splitEvents";

const fixture = (name: string): CompanyFacts =>
  JSON.parse(readFileSync(path.join(process.cwd(), "fixtures", "edgar", `${name}_companyfacts_audit_20261019.json`), "utf8")) as CompanyFacts;

describe("canonicalKey", () => {
  it("ignores key order but keeps every value distinction", () => {
    expect(canonicalKey({ a: 1, b: [1, "x"] })).toBe(canonicalKey({ b: [1, "x"], a: 1 }));
    const distinct = [{}, { a: undefined }, { a: null }, { a: 0 }, { a: -0 }, { a: NaN }, { a: "0" }, { a: false }, { a: [] }, { a: {} }, { a: [undefined] }, { a: Infinity }];
    expect(new Set(distinct.map(canonicalKey)).size).toBe(distinct.length);
  });

  it("refuses anything that is not plain data, so it is never cached approximately", () => {
    class Box { x = 1; }
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    for (const value of [() => 1, new Map(), new Set(), new Date(0), new Box(), Symbol("s"), 1n, cyclic, { [Symbol("k")]: 1 }, [1, , 3]]) {
      expect(canonicalKey(value)).toBeNull();
    }
    const shared = { x: 1 };
    expect(canonicalKey({ a: shared, b: shared })).not.toBeNull(); // repeated, not cyclic
  });
});

describe("withComputationContext", () => {
  it("caches nothing outside a scope", () => {
    let computed = 0;
    const input = {};
    memoize("t", input, 1, () => ++computed);
    memoize("t", input, 1, () => ++computed);
    expect(computed).toBe(2);
    expect(computationContextActive()).toBe(false);
  });

  it("computes once per exact key inside a scope and separates every other key", () => {
    const a = {}, b = {};
    let computed = 0;
    withComputationContext(() => {
      expect(computationContextActive()).toBe(true);
      for (let i = 0; i < 3; i++) memoize("t", a, { n: 1 }, () => ++computed);
      expect(computed).toBe(1);
      memoize("t", a, { n: 2 }, () => ++computed); // other options
      memoize("t", b, { n: 1 }, () => ++computed); // other input object
      memoize("u", a, { n: 1 }, () => ++computed); // other namespace
      memoize("t", "text", { n: 1 }, () => ++computed); // string input
      memoize("t", "text2", { n: 1 }, () => ++computed);
      memoize("t", a, { n: 1, extra: undefined }, () => ++computed); // an undefined member is a different key
      expect(computed).toBe(7);
      // A function argument cannot be encoded exactly: computed every time.
      memoize("t", a, { f: () => 1 }, () => ++computed);
      memoize("t", a, { f: () => 1 }, () => ++computed);
      expect(computed).toBe(9);
    });
  });

  it("hands every caller its own copy, so a mutation never reaches another caller", () => {
    withComputationContext(() => {
      const input = {};
      const make = () => ({ rows: [{ value: 1, notes: ["n"] }] });
      const first = memoize("t", input, null, make);
      first.rows[0]!.value = 99;
      first.rows[0]!.notes.push("mutated");
      first.rows.push({ value: 2, notes: [] });
      const second = memoize("t", input, null, make);
      expect(second).toEqual(make());
      second.rows.length = 0;
      expect(memoize("t", input, null, make)).toEqual(make());
      expect(memoize("t", input, null, make)).not.toBe(memoize("t", input, null, make));
    });
  });

  it("clears on return and on throw, so nothing leaks into the next run", () => {
    const input = { v: 1 };
    const read = () => memoize("t", input, null, () => ({ v: input.v }));
    withComputationContext(() => expect(read()).toEqual({ v: 1 }));
    input.v = 2; // the next run sees changed evidence under the same object
    withComputationContext(() => expect(read()).toEqual({ v: 2 }));
    expect(() => withComputationContext(() => { read(); throw new Error("boom"); })).toThrow("boom");
    expect(computationContextActive()).toBe(false);
    input.v = 3;
    withComputationContext(() => expect(read()).toEqual({ v: 3 }));
  });

  it("reuses the enclosing scope when nested (one synchronous run step)", () => {
    let computed = 0;
    const input = {};
    withComputationContext(() => {
      memoize("t", input, null, () => ++computed);
      withComputationContext(() => memoize("t", input, null, () => ++computed));
      expect(computationContextActive()).toBe(true);
    });
    expect(computed).toBe(1);
    expect(computationContextActive()).toBe(false);
  });

  it("closes before a returned promise continues, so async continuations run uncached", async () => {
    let computed = 0;
    const input = {};
    await withComputationContext(async () => {
      memoize("t", input, null, () => ++computed);
      await Promise.resolve();
      expect(computationContextActive()).toBe(false);
      memoize("t", input, null, () => ++computed);
    });
    expect(computed).toBe(2);
  });

  it("memoizeShared returns the stored value itself, only within the scope", () => {
    const input = {};
    withComputationContext(() => {
      const first = memoizeShared("s", input, null, () => ({ x: 1 }));
      expect(memoizeShared("s", input, null, () => ({ x: 2 }))).toBe(first);
    });
    expect(memoizeShared("s", input, null, () => ({ x: 3 }))).toEqual({ x: 3 });
  });
});

/**
 * Every distinct option set a caller of buildStatementsFromCompanyFacts
 * requests (src/pipeline/incomeBasis.ts, balanceIntegrity.ts,
 * filingDisclosures.ts, compute.ts, releaseQuarterEarnings.ts, peerFilings.ts,
 * src/edgar/incomeClassification.ts, temporaryEquityEnrichment.ts), with the
 * run-specific values filled in.
 */
function callerOptionSets(facts: CompanyFacts, asOf: string, observedAt: string): StatementBuildOptions[] {
  const cik = String(facts.cik);
  const none = (source: string) => unavailableSplitEvidence(source, "test");
  return [
    { symbol: "T", cik, asOf, factsObservedAt: observedAt, annualPeriods: 40, quarterlyPeriods: 80, bankRevenue: false, vendorSplits: none("operating-basis") },
    { symbol: "T", cik, asOf, factsObservedAt: observedAt, annualPeriods: 40, quarterlyPeriods: 80, bankRevenue: true, vendorSplits: none("operating-basis") },
    { symbol: "T", cik, asOf, factsObservedAt: observedAt, annualPeriods: 40, quarterlyPeriods: 0, vendorSplits: none("annual-nci-predecessor") },
    { symbol: "T", cik, asOf, factsObservedAt: observedAt, annualPeriods: 12, quarterlyPeriods: 30, vendorSplits: none("balance corroboration") },
    { symbol: "T", cik, asOf, factsObservedAt: observedAt, annualPeriods: 12, quarterlyPeriods: 40, vendorSplits: none("filed revenue presentation") },
    { symbol: "T", cik, asOf, factsObservedAt: observedAt, annualPeriods: 2, quarterlyPeriods: 5, vendorSplits: none("retained-common-earnings") },
    { symbol: "T", cik, asOf, factsObservedAt: observedAt, annualPeriods: 5, quarterlyPeriods: 20, vendorSplits: none("release quarter") },
    { symbol: "T", cik, asOf, factsObservedAt: observedAt, annualPeriods: 2, quarterlyPeriods: 6, bankRevenue: false, basisDay: asOf, vendorSplits: none("peer") },
    { symbol: "", cik, asOf, factsObservedAt: observedAt, annualPeriods: 12, quarterlyPeriods: 14, bankRevenue: undefined, vendorSplits: none("income-classification") },
    { symbol: "", cik, asOf, factsObservedAt: observedAt, annualPeriods: 40, quarterlyPeriods: 80, bankRevenue: undefined, vendorSplits: none("income-presentation") },
    { symbol: "SEC", cik, asOf, factsObservedAt: observedAt, annualPeriods: 100, quarterlyPeriods: 100, vendorSplits: none("temporary-equity-only") },
    // Same periods, different cutoff: must never share a result.
    { symbol: "T", cik, asOf: "2025-06-30", factsObservedAt: observedAt, annualPeriods: 12, quarterlyPeriods: 30, vendorSplits: none("balance corroboration") },
  ];
}

const json = (value: unknown) => JSON.stringify(value);

describe("buildStatementsFromCompanyFacts inside a run's context", () => {
  // An insurer, an equity REIT and a software issuer with a January year end.
  const cases = [
    { name: "pgr", asOf: "2026-10-20", observedAt: "2026-10-20T00:06:23.764Z" },
    { name: "o", asOf: "2026-10-20", observedAt: "2026-10-20T00:25:56.282Z" },
    { name: "snow", asOf: "2026-10-20", observedAt: "2026-10-20T00:45:54.455Z" },
  ];

  it.each(cases)("$name: cached equals uncached for every caller option set, on a miss and on a hit", ({ name, asOf, observedAt }) => {
    const facts = fixture(name);
    const sets = callerOptionSets(facts, asOf, observedAt);
    const uncached = sets.map((opts) => buildStatementsUncached(facts, opts));
    expect(new Set(uncached.map(json)).size).toBeGreaterThan(1); // the option sets really differ
    withComputationContext(() => {
      // Interleave: every set's miss, then every set's hit, so no set can read another's entry.
      const misses = sets.map((opts) => buildStatementsFromCompanyFacts(facts, opts));
      const hits = sets.map((opts) => buildStatementsFromCompanyFacts(facts, opts));
      for (let i = 0; i < sets.length; i++) {
        expect(misses[i]).toEqual(uncached[i]);
        expect(hits[i]).toEqual(uncached[i]);
        expect(json(hits[i])).toBe(json(uncached[i]));
        expect(hits[i]).not.toBe(misses[i]);
      }
    });
  });

  it("two different fact sets never share a result, even with equal options", () => {
    const facts = fixture("pgr");
    const opts = callerOptionSets(facts, "2026-10-20", "2026-10-20T00:06:23.764Z")[3]!;
    const changed = structuredClone(facts);
    const assets = (changed.facts["us-gaap"]!.Assets as { units: { USD: { val: number }[] } }).units.USD;
    for (const point of assets) point.val += 1_000_000;
    withComputationContext(() => {
      const original = buildStatementsFromCompanyFacts(facts, opts);
      const other = buildStatementsFromCompanyFacts(changed, opts);
      expect(other).toEqual(buildStatementsUncached(changed, opts));
      expect(json(other)).not.toBe(json(original));
      expect(buildStatementsFromCompanyFacts(facts, opts)).toEqual(buildStatementsUncached(facts, opts));
      // A filtered fact set is its own key, and equal to building the filter uncached.
      const accn = facts.facts["us-gaap"]!.Assets as { units: { USD: { accn: string }[] } };
      const filing = accn.units.USD.at(-1)!.accn;
      const filtered = buildStatementsFromCompanyFacts(factsForFilings(facts, [filing]), opts);
      expect(filtered).toEqual(buildStatementsUncached(factsForFilings(facts, [filing]), opts));
      expect(json(filtered)).not.toBe(json(original));
    });
  });

  it("a consumer that mutates its result cannot change what the next reader gets", () => {
    const facts = fixture("o");
    const opts = callerOptionSets(facts, "2026-10-20", "2026-10-20T00:25:56.282Z")[0]!;
    const expected = buildStatementsUncached(facts, opts);
    withComputationContext(() => {
      const first = buildStatementsFromCompanyFacts(facts, opts);
      first.incomeAnnual.rows[0]!.revenue = -1;
      first.incomeAnnual.rows.reverse();
      first.balanceQuarterly.rows.length = 0;
      first.incomeAnnual.notes.push("mutated");
      first.splits.events.length = 0;
      expect(buildStatementsFromCompanyFacts(facts, opts)).toEqual(expected);
    });
  });

  it("no entry survives its run: the same facts object, changed between runs, is rebuilt", () => {
    const facts = fixture("pgr");
    const opts = callerOptionSets(facts, "2026-10-20", "2026-10-20T00:06:23.764Z")[3]!;
    const before = withComputationContext(() => buildStatementsFromCompanyFacts(facts, opts));
    const assets = (facts.facts["us-gaap"]!.Assets as { units: { USD: { val: number }[] } }).units.USD;
    for (const point of assets) point.val += 1_000_000;
    const after = withComputationContext(() => buildStatementsFromCompanyFacts(facts, opts));
    expect(after).toEqual(buildStatementsUncached(facts, opts));
    expect(json(after)).not.toBe(json(before));
  });

  it("factsForFilings is shared within a run regardless of accession order and equals the uncached filter", () => {
    const facts = fixture("snow");
    const accns = [...new Set((facts.facts["us-gaap"]!.Revenues as { units: { USD: { accn: string }[] } } | undefined)?.units.USD.map((p) => p.accn)
      ?? Object.values(facts.facts["us-gaap"]!).flatMap((c) => Object.values((c as { units: Record<string, { accn: string }[]> }).units).flat().map((p) => p.accn)))].slice(0, 2);
    const uncached = factsForFilings(facts, accns);
    withComputationContext(() => {
      const first = factsForFilings(facts, accns);
      expect(factsForFilings(facts, [...accns].reverse().concat(accns[0]!))).toBe(first);
      expect(first).toEqual(uncached);
      expect(factsForFilings(facts, accns.slice(0, 1))).not.toBe(first);
      expect(factsForFilings(structuredClone(facts), accns)).not.toBe(first);
    });
  });

  it("parsedConceptPoints matches a fresh parse and is per raw concept object", () => {
    const facts = fixture("pgr");
    const raw = facts.facts["us-gaap"]!.Assets;
    const fresh = parsedConceptPoints(raw);
    withComputationContext(() => {
      const first = parsedConceptPoints(raw);
      expect(first).toEqual(fresh);
      expect(parsedConceptPoints(raw)).toBe(first);
      expect(parsedConceptPoints(structuredClone(raw))).not.toBe(first);
      expect(parsedConceptPoints("not a concept")).toBeNull();
    });
  });
});

describe("parseOperatingRevenueBridge memo", () => {
  const table = (sales: number) => [
    "CONSOLIDATED STATEMENTS OF INCOME (in millions of U.S. dollars)",
    "Three Months Ended September 30, 2026 2025",
    `Sales and other operating revenues ${sales} 900`,
    "Income from equity affiliates 10 9",
    "Other income 5 4",
    `Total revenues and other income ${sales + 15} 913`,
  ].join(" ");

  it("returns what the text itself produces, as a fresh copy each time", () => {
    const first = parseOperatingRevenueBridge(table(1000));
    expect(first.length).toBeGreaterThan(0);
    first[0]!.sales = -1;
    first.length = 0;
    const second = parseOperatingRevenueBridge(table(1000));
    expect(second.length).toBeGreaterThan(0);
    expect(second[0]!.sales).toBe(1000 * 1e6);
    expect(parseOperatingRevenueBridge(table(2000))[0]!.sales).toBe(2000 * 1e6);
    expect(parseOperatingRevenueBridge("no table here")).toEqual([]);
  });
});
