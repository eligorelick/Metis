/**
 * The leaf-path tools shared by `npm run golden:diff` and the frozen DEMO
 * fixture record, exercised on small documents so each rule is visible. No
 * network. (Until D-232 this file also tested the retired intended-delta
 * ledger: its file format, reconstruction check, manifest identity view and
 * regenerator.)
 */
import { describe, expect, it } from "vitest";

import { canonicalJson, comparePaths, diffPaths, encodeSegment, splitPath } from "./helpers/jsonLeafPaths";

describe("leaf paths", () => {
  it("escapes a key that itself contains a dot, so the two shapes stay distinguishable", () => {
    const nested = { asOfMap: { edgar: { cik: "2026-01-01" } } };
    const flat = { asOfMap: { "edgar.cik": "2026-01-01" } };
    expect(diffPaths(nested, flat).sort()).toEqual([
      "asOfMap.edgar",
      "asOfMap.edgar\\.cik",
    ]);
    expect(splitPath("asOfMap.edgar\\.cik")).toEqual(["asOfMap", "edgar.cik"]);
    expect(splitPath("asOfMap.edgar.cik")).toEqual(["asOfMap", "edgar", "cik"]);
    expect(splitPath(encodeSegment("a.b") + ".c")).toEqual(["a.b", "c"]);
    expect(splitPath(encodeSegment("back\\slash"))).toEqual(["back\\slash"]);
  });

  it("reports a surplus array element and a key present on only one side", () => {
    expect(diffPaths({ xs: [1, 2] }, { xs: [1, 2, 3] })).toEqual(["xs.2"]);
    expect(diffPaths({ a: 1 }, { a: 1, b: 2 })).toEqual(["b"]);
  });

  it("orders numeric indices numerically and other segments by name", () => {
    expect(["xs.10", "xs.2", "b", "a.z", "a"].sort(comparePaths)).toEqual(["a", "a.z", "b", "xs.2", "xs.10"]);
  });

  it("writes canonical JSON with sorted keys at every depth and arrays in order", () => {
    expect(canonicalJson({ b: [2, { d: 1, c: null }], a: "x" })).toBe('{"a":"x","b":[2,{"c":null,"d":1}]}');
  });
});
