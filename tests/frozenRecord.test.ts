/**
 * P27 frozen-record machinery: the leaf diff, the record file layout and the
 * refresh protocol's refusals. The records themselves are pinned in
 * stageC.payload.passes.test.ts and audit.fixtureComparison.test.ts.
 */
import { describe, expect, it } from "vitest";

import {
  assertFrozenLog,
  diffFrozen,
  formatFrozen,
  frozenRecordSha256,
  normalizeFrozen,
  planFrozenRefresh,
  promptDigest,
  toFrozenJson,
  type FrozenJson,
} from "./helpers/frozenRecord";
import { parseFreezeArgs } from "../scripts/freeze-refresh.mjs";

const REASON = "Reviewed wording change in the valuation notes; no number, period or identity moves.";
const record: FrozenJson = {
  finance: { value: 1, periods: ["FY2025", "FY2026"], notes: ["a"] },
  registry: [{ id: "x", origin: "fmp:quote" }],
};

describe("frozen record diff and layout", () => {
  it("names each differing leaf, absent leaves and order changes", () => {
    const changed = structuredClone(record) as { finance: { value: number; periods: string[] }; registry: { id: string }[] };
    changed.finance.value = 2;
    changed.finance.periods[1] = "FY2099";
    changed.registry[0]!.id = "y";
    expect(diffFrozen(record, changed as unknown as FrozenJson).lines).toEqual([
      "$.finance.value: frozen 1 -> today 2",
      "$.finance.periods[1]: frozen \"FY2026\" -> today \"FY2099\"",
      "$.registry[0].id: frozen \"x\" -> today \"y\"",
    ]);
    expect(diffFrozen({ a: 1 }, { a: 1, b: [] }).lines).toEqual(["$.b: frozen (absent) -> today []"]);
    expect(diffFrozen({ a: 1, b: 2 }, { b: 2, a: 1 })).toEqual({
      paths: ["$.a", "$.b"],
      lines: ["$: key order changed: frozen [\"a\",\"b\"] -> today [\"b\",\"a\"]"],
    });
    expect(diffFrozen(record, structuredClone(record)).lines).toEqual([]);
  });

  it("round-trips the file layout and digests only bulky text", () => {
    const value = toFrozenJson({ short: "s", long: "x".repeat(5_000), nested: { list: [1, null, "z"], empty: {} } });
    expect(JSON.parse(formatFrozen(value))).toEqual(value);
    expect(frozenRecordSha256(JSON.parse(formatFrozen(value)) as FrozenJson)).toBe(frozenRecordSha256(value));
    expect((value as { long: { $text: { bytes: number } } }).long.$text.bytes).toBe(5_000);
    expect(promptDigest("intro\n## A\none\n## B\ntwo")).toMatchObject({
      sections: [{ heading: "(before the first ## heading)" }, { heading: "## A" }, { heading: "## B" }],
    });
  });
});

describe("frozen record refresh protocol", () => {
  const next = structuredClone(record) as { finance: { notes: string[] } };
  next.finance.notes[0] = "b";

  it("records a scoped, decision-linked refresh with both hashes", () => {
    const entry = planFrozenRefresh("stagec-payload", record, next as unknown as FrozenJson,
      { decision: "D-300", reason: REASON, scope: ["$.finance.notes"] }, "2026-11-12");
    expect(entry).toEqual({
      date: "2026-11-12", target: "stagec-payload", decision: "D-300", reason: REASON, scope: ["$.finance.notes"],
      beforeSha256: frozenRecordSha256(record), afterSha256: frozenRecordSha256(next as unknown as FrozenJson),
      changedLeaves: 1, changedPaths: ["$.finance.notes[0]"],
    });
  });

  it.each([
    [{ decision: "", reason: REASON, scope: ["$.finance.notes"] }, /decision id/],
    [{ decision: "initial-freeze", reason: REASON, scope: ["$.finance.notes"] }, /decision id/],
    [{ decision: "D-300", reason: "too short", scope: ["$.finance.notes"] }, /real reason/],
    [{ decision: "D-300", reason: `TODO ${REASON}`, scope: ["$.finance.notes"] }, /real reason/],
    [{ decision: "D-300", reason: REASON, scope: [] }, /needs --scope/],
    [{ decision: "D-300", reason: REASON, scope: ["$"] }, /may not re-record the whole record/],
    [{ decision: "D-300", reason: REASON, scope: ["$.registry"] }, /outside --scope/],
    [{ decision: "D-300", reason: REASON, scope: ["$.finance.note"] }, /outside --scope/],
  ])("refuses %o", (request, error) => {
    expect(() => planFrozenRefresh("stagec-payload", record, next as unknown as FrozenJson, request)).toThrow(error);
  });

  it("refuses a refresh with nothing to change and a first freeze that is not whole-record", () => {
    expect(() => planFrozenRefresh("stagec-payload", record, record, { decision: "D-300", reason: REASON, scope: ["$.finance"] }))
      .toThrow(/already matches/);
    expect(() => planFrozenRefresh("audit-fixture", null, record, { decision: "initial-freeze", reason: REASON, scope: ["$.finance"] }))
      .toThrow(/--scope \$/);
  });

  it("binds the log chain to the committed record", () => {
    const first = planFrozenRefresh("audit-fixture", null, record, { decision: "initial-freeze", reason: REASON, scope: ["$"] }, "2026-11-12");
    const second = planFrozenRefresh("audit-fixture", record, next as unknown as FrozenJson,
      { decision: "D-300", reason: REASON, scope: ["$.finance"] }, "2026-11-13");
    expect(() => assertFrozenLog([first, second], { "audit-fixture": next as unknown as FrozenJson })).not.toThrow();
    expect(() => assertFrozenLog([first], { "audit-fixture": next as unknown as FrozenJson })).toThrow(/last entry must hash/);
    expect(() => assertFrozenLog([second], { "audit-fixture": next as unknown as FrozenJson })).toThrow();
  });

  it("only starts from the script with every field, never under CI", () => {
    const argv = ["--target", "audit-fixture", "--decision", "D-300", "--reason", REASON, "--scope", "$.projection.stageB"];
    expect(parseFreezeArgs(argv, {})).toEqual({ target: "audit-fixture", decision: "D-300", reason: REASON, scope: "$.projection.stageB" });
    expect(() => parseFreezeArgs(argv, { CI: "true" })).toThrow(/never runs in CI/);
    expect(() => parseFreezeArgs(argv.slice(0, 6), {})).toThrow(/--scope/);
    expect(() => parseFreezeArgs(["--target", "other", ...argv.slice(2)], {})).toThrow(/--target/);
  });
});

// The pin and the refresh planner read one diff: every kind of difference it
// sees counts for both, wherever else in the record a value also changed.
describe("frozen record differences of every kind reach the refresh scope check", () => {
  type FrozenObject = { [key: string]: FrozenJson };
  const plan = (previous: FrozenJson, next: FrozenJson, scope: string[]) =>
    planFrozenRefresh("stagec-payload", previous, next, { decision: "D-300", reason: REASON, scope }, "2026-11-12");
  const keyed = {
    finance: { value: 1, periods: ["FY2025", "FY2026"], notes: ["a"] },
    registry: { x: { origin: "fmp:quote" }, y: { origin: "sec:10-K" } },
  } satisfies FrozenObject;
  const reversed = (value: FrozenObject): FrozenObject => Object.fromEntries(Object.entries(value).reverse());

  it("refuses a value change in scope that travels with an unrelated key reorder, naming the reordered keys", () => {
    const next: FrozenJson = { finance: { ...keyed.finance, value: 2 }, registry: reversed(keyed.registry) };
    expect(diffFrozen(keyed, next).paths).toEqual(["$.finance.value", "$.registry.x", "$.registry.y"]);
    expect(() => plan(keyed, next, ["$.finance"]))
      .toThrow(/2 changed leaf\/leaves outside --scope \$\.finance:\n\$\.registry\.x\n\$\.registry\.y$/);
    expect(plan(keyed, next, ["$.finance", "$.registry"]).changedPaths)
      .toEqual(["$.finance.value", "$.registry.x", "$.registry.y"]);
    // the same inside an array element: a value change plus that element's own key reorder
    const nested = structuredClone(record) as { finance: { value: number }; registry: FrozenObject[] };
    nested.finance.value = 2;
    nested.registry[0] = reversed(nested.registry[0]!);
    expect(() => plan(record, nested as unknown as FrozenJson, ["$.finance"]))
      .toThrow(/outside --scope \$\.finance:\n\$\.registry\[0\]\.id\n\$\.registry\[0\]\.origin$/);
  });

  it("accepts and logs a key reorder alone inside the declared scope, and refuses it outside", () => {
    const next: FrozenJson = { ...keyed, finance: reversed(keyed.finance) };
    expect(JSON.stringify(next)).not.toBe(JSON.stringify(keyed));
    const entry = plan(keyed, next, ["$.finance"]);
    expect(entry).toMatchObject({ changedLeaves: 2, changedPaths: ["$.finance.value", "$.finance.notes"] });
    expect(entry.afterSha256).toBe(frozenRecordSha256(next));
    expect(entry.afterSha256).not.toBe(entry.beforeSha256);
    expect(() => plan(keyed, next, ["$.registry"]))
      .toThrow(/outside --scope \$\.registry:\n\$\.finance\.value\n\$\.finance\.notes$/);
    expect(() => plan(keyed, next, ["$.finance.value"])).toThrow(/1 changed leaf\/leaves outside[^\n]*\n\$\.finance\.notes$/);
    // top-level keys too: a root reorder names each moved member, never only "$"
    expect(diffFrozen(keyed, reversed(keyed)).paths).toEqual(["$.finance", "$.registry"]);
  });

  it("treats an array reorder the same way: logged in scope, refused elsewhere or beside another change", () => {
    const next = structuredClone(keyed);
    next.finance.periods.reverse();
    expect(plan(keyed, next, ["$.finance.periods"]).changedPaths).toEqual(["$.finance.periods[0]", "$.finance.periods[1]"]);
    expect(() => plan(keyed, next, ["$.finance.notes"]))
      .toThrow(/outside --scope \$\.finance\.notes:\n\$\.finance\.periods\[0\]\n\$\.finance\.periods\[1\]$/);
    next.finance.value = 2;
    expect(() => plan(keyed, next, ["$.finance.value"])).toThrow(/2 changed leaf\/leaves outside/);
  });

  it("reports no order difference when nothing is reordered", () => {
    const deep: FrozenJson = { a: { b: [{ c: 1, d: [2, { e: null, f: {} }] }], g: [] }, h: "x" };
    expect(diffFrozen(deep, structuredClone(deep))).toEqual({ paths: [], lines: [] });
    expect(diffFrozen(deep, JSON.parse(formatFrozen(deep)) as FrozenJson)).toEqual({ paths: [], lines: [] });
    expect(diffFrozen({ a: 1, b: 2, c: 3 }, { a: 1, b: 9, c: 3 }).paths).toEqual(["$.b"]);
    // a key added in the middle, or removed, leaves the other keys' relative order alone: only that key
    expect(diffFrozen({ a: 1, c: 3 }, { a: 1, b: 2, c: 3 })).toEqual({ paths: ["$.b"], lines: ["$.b: frozen (absent) -> today 2"] });
    expect(diffFrozen({ a: 1, b: 2, c: 3 }, { a: 1, c: 3 })).toEqual({ paths: ["$.b"], lines: ["$.b: frozen 2 -> today (absent)"] });
    // integer-like keys enumerate in JavaScript's own order on both sides, so they never read as a reorder
    expect(diffFrozen({ b: 1, 2: 2, 1: 1 }, JSON.parse("{\"1\": 1, \"b\": 1, \"2\": 2}") as FrozenJson).paths).toEqual([]);
  });

  it("sees added or removed keys, type changes and null versus absent, and refuses them out of scope", () => {
    const cases: [FrozenJson, FrozenJson, string[]][] = [
      [{ a: 1, s: { k: 1 } }, { a: 1, s: { k: 1, extra: 0 } }, ["$.s.extra"]],
      [{ a: 1, s: { k: 1, gone: 0 } }, { a: 1, s: { k: 1 } }, ["$.s.gone"]],
      [{ a: 1, s: { k: null } }, { a: 1, s: {} }, ["$.s.k", "$.s"]],
      [{ a: 1, s: {} }, { a: 1, s: { k: null } }, ["$.s", "$.s.k"]],
      [{ a: 1, s: { k: 1 } }, { a: 1, s: 1 }, ["$.s.k", "$.s"]],
      [{ a: 1, s: [] }, { a: 1, s: {} }, ["$.s"]],
      [{ a: 1, s: 1 }, { a: 1, s: "1" }, ["$.s"]],
      [{ a: 1, s: { 0: "x" } }, { a: 1, s: ["x"] }, ["$.s[\"0\"]", "$.s[0]"]],
      [{ a: 1, s: null }, { a: 1, s: false }, ["$.s"]],
    ];
    for (const [previous, next, paths] of cases) {
      const label = JSON.stringify([previous, next]);
      expect(diffFrozen(previous, next).paths, label).toEqual(paths);
      expect(() => plan(previous, next, ["$.a"]), label).toThrow(/outside --scope \$\.a/);
      expect(plan(previous, next, ["$.s"]).changedPaths, label).toEqual(paths);
    }
  });

  it("compares exactly what is written and hashed, so non-JSON members of today's output cannot split the pin from the file", () => {
    const today = { a: 1, gone: undefined, at: new Date("2026-11-12T00:00:00.000Z"), nan: Number.NaN } as unknown as FrozenJson;
    const stored: FrozenJson = { a: 1, at: "2026-11-12T00:00:00.000Z", nan: null };
    expect(normalizeFrozen(today)).toEqual(stored);
    expect(diffFrozen(stored, today)).toEqual({ paths: [], lines: [] });
    expect(frozenRecordSha256(today)).toBe(frozenRecordSha256(stored));
    const entry = plan({ ...stored, a: 2 }, today, ["$.a"]);
    expect(entry.changedPaths).toEqual(["$.a"]);
    // the bytes expectFrozenRecord writes parse back to the hash the log records
    expect(frozenRecordSha256(JSON.parse(formatFrozen(normalizeFrozen(today))) as FrozenJson)).toBe(entry.afterSha256);
  });

  it("finds no difference exactly when the record hashes agree", () => {
    const base: FrozenJson = { a: { b: [1, { c: "x", d: null }], e: {} }, f: [] };
    const variants: FrozenJson[] = [
      structuredClone(base),
      { f: [], a: { b: [1, { c: "x", d: null }], e: {} } },
      { a: { e: {}, b: [1, { c: "x", d: null }] }, f: [] },
      { a: { b: [1, { d: null, c: "x" }], e: {} }, f: [] },
      { a: { b: [{ c: "x", d: null }, 1], e: {} }, f: [] },
      { a: { b: [1, { c: "x" }], e: {} }, f: [] },
      { a: { b: [1, { c: "x", d: null }], e: [] }, f: [] },
      { a: { b: [1, { c: "x", d: null }], e: {} }, f: [null] },
    ];
    for (const variant of variants) {
      const { paths, lines } = diffFrozen(base, variant);
      expect(paths.length === 0, JSON.stringify(variant)).toBe(frozenRecordSha256(base) === frozenRecordSha256(variant));
      expect(lines.length === 0).toBe(paths.length === 0);
    }
  });
});
