import { describe, expect, it } from "vitest";

import {
  applyUnsupportedTerminal,
  unsupportedFromEvent,
  unsupportedFromSnapshot,
} from "@/app/company/[symbol]/GenerateReport";

describe("GenerateReport — unsupported terminal state", () => {
  it.each(["unknown", "non-equity"])("preserves %s reasons across live and resumed terminal states", kind => {
    const terminal = { kind, message: "Classification is not established by the available evidence." };
    expect(unsupportedFromSnapshot({ status: "unsupported", totalCostUsd: 0, unsupported: terminal }))
      .toEqual({ ...terminal, totalCostUsd: 0 });
    expect(unsupportedFromEvent({ type: "unsupported", ...terminal }))
      .toEqual({ ...terminal, totalCostUsd: 0 });
  });
  it("recognizes replayed unsupported snapshots and closes instead of reconnecting", () => {
    const terminal = unsupportedFromSnapshot({
      status: "unsupported",
      totalCostUsd: 0,
      unsupported: {
        kind: "etf-fund",
        message: "ETF and fund analysis is not supported; companies only.",
      },
    });
    const transitions: string[] = [];

    applyUnsupportedTerminal(terminal!, {
      setPhase: (phase) => transitions.push(`phase:${phase}`),
      setMessage: (message) => transitions.push(`message:${message}`),
      setTotalCost: (cost) => transitions.push(`cost:${cost}`),
      closeStream: () => transitions.push("closed"),
    });

    expect(transitions).toEqual([
      "phase:unsupported",
      "message:ETF and fund analysis is not supported; companies only.",
      "cost:0",
      "closed",
    ]);
  });

  it("treats malformed persisted unsupported status as terminal with a safe explanation", () => {
    expect(
      unsupportedFromSnapshot({
        status: "unsupported",
        totalCostUsd: 0,
        unsupported: undefined,
      }),
    ).toEqual({
      kind: null,
      message: "This instrument is not supported for company analysis.",
      totalCostUsd: 0,
    });
  });

  it("turns a malformed live unsupported frame into the same safe terminal outcome", () => {
    expect(
      unsupportedFromEvent({
        type: "unsupported",
        kind: "bogus",
        message: "   ",
      }),
    ).toEqual({
      kind: null,
      message: "This instrument is not supported for company analysis.",
      totalCostUsd: 0,
    });
  });

  it("ignores supported running/done/error snapshots", () => {
    for (const status of ["queued", "running", "done", "error"]) {
      expect(unsupportedFromSnapshot({ status, totalCostUsd: 0, unsupported: null })).toBeNull();
    }
  });
});
