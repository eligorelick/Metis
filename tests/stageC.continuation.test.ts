import { describe, expect, it } from "vitest";
import {
  completedTopLevelFields,
  continuationInstruction,
  mergeContinuation,
} from "@/pipeline/stageC/continuation";

describe("completedTopLevelFields — what a cut-off JSON object already finished", () => {
  it("keeps every complete section and stops at the unfinished one", () => {
    const cut = '{"verdict":{"synthesis":"a } b","n":[1,2]},"business":{"x":"y \\" z"},"fundamentals":{"graded":{"te';
    expect(completedTopLevelFields(cut)).toEqual({
      verdict: { synthesis: "a } b", n: [1, 2] },
      business: { x: 'y " z' },
    });
  });

  it("keeps complete scalars and arrays, but not a scalar the cut may have shortened", () => {
    expect(completedTopLevelFields('{"a":1,"b":true,"c":null,"d":[1],"e":12')).toEqual({ a: 1, b: true, c: null, d: [1] });
    expect(completedTopLevelFields('{"a":1, "b" : "two" ,')).toEqual({ a: 1, b: "two" });
  });

  it("returns a whole object unchanged and nothing for text with no complete section", () => {
    expect(completedTopLevelFields('{"a":{"b":1},"c":2}')).toEqual({ a: { b: 1 }, c: 2 });
    expect(completedTopLevelFields('{"a":{"b":')).toEqual({});
    expect(completedTopLevelFields("")).toEqual({});
    expect(completedTopLevelFields("no json")).toEqual({});
    expect(completedTopLevelFields('{"a" 1}')).toEqual({});
  });

  it("ignores prose before the object", () => {
    expect(completedTopLevelFields('Here it is:\n{"a":1,"b":')).toEqual({ a: 1 });
  });
});

describe("continuationInstruction / mergeContinuation", () => {
  it("names the kept and the remaining sections", () => {
    const text = continuationInstruction({ verdict: {}, business: {} }, ["verdict", "business", "macro", "disagreements"]);
    expect(text).toContain("KEPT exactly as written: verdict, business");
    expect(text).toContain("ONLY the remaining top-level sections: macro, disagreements");
  });

  it("adds the new sections and never lets a re-emitted copy replace a kept one", () => {
    expect(mergeContinuation({ a: 1 }, { a: 2, b: 3 })).toEqual({ a: 1, b: 3 });
    expect(mergeContinuation({ a: 1 }, [1])).toEqual([1]);
    expect(mergeContinuation({ a: 1 }, null)).toBeNull();
  });
});

describe("steppedDownOptions — the retry after a time-limit cut is not the same request", () => {
  it("lowers an explicit effort by the given steps, floored at the lowest level", async () => {
    const { steppedDownOptions } = await import("@/pipeline/stageC/index");
    expect(steppedDownOptions({ effort: "high", serviceTier: "default" }, 1)).toEqual({ effort: "medium", serviceTier: "default" });
    expect(steppedDownOptions({ effort: "max" }, 2)).toEqual({ effort: "high" });
    expect(steppedDownOptions({ effort: "medium" }, 5)).toEqual({ effort: "low" });
  });

  it("leaves the options alone with no step-down, or when no explicit effort was chosen", async () => {
    const { steppedDownOptions } = await import("@/pipeline/stageC/index");
    const opts = { effort: "high" as const };
    expect(steppedDownOptions(opts, 0)).toBe(opts);
    expect(steppedDownOptions(opts, undefined)).toBe(opts);
    expect(steppedDownOptions({ serviceTier: "fast" }, 1)).toEqual({ serviceTier: "fast" });
    expect(steppedDownOptions(undefined, 1)).toBeUndefined();
  });
});
