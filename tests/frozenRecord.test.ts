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
    expect(diffFrozen({ a: 1, b: 2 }, { b: 2, a: 1 }).lines).toEqual(["order changed at leaf 0: frozen $.a -> today $.b"]);
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
