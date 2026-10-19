import { describe, expect, it } from "vitest";

import { runStageB } from "@/pipeline/compute";
import {
  classifyInstrumentSupport,
  UnsupportedInstrumentError,
} from "@/pipeline/stageB/instrumentSupport";
import type { DataBundle } from "@/pipeline/types";

describe("classifyInstrumentSupport — unsupported company-analysis instruments", () => {
  it.each([
    { label: "ETF only", input: { isEtf: true, isFund: false }, kind: "etf" },
    { label: "fund only", input: { isEtf: false, isFund: true }, kind: "fund" },
    { label: "both flags", input: { isEtf: true, isFund: true }, kind: "etf-fund" },
  ] as const)("classifies $label as unsupported $kind", ({ input, kind }) => {
    const result = classifyInstrumentSupport(input);

    expect(result).toMatchObject({ supported: false, kind });
    if (!result.supported) {
      expect(result.reason).toMatch(/not supported/i);
      expect(result.reason).toMatch(/compan/i);
    }
  });

  it.each([
    { label: "explicit company flags", input: { isEtf: false, isFund: false } },
    { label: "positive equity metadata", input: { instrumentType: "EQUITY" } },
    { label: "ADR company flags", input: { isAdr: true, isEtf: false, isFund: false } },
  ] as const)("accepts $label", ({ input }) => {
    expect(classifyInstrumentSupport(input)).toEqual({ supported: true, kind: "company" });
  });

  it.each([
    { label: "null flags", input: { isEtf: null, isFund: null } },
    { label: "missing flags", input: {} },
    { label: "missing profile", input: null },
    { label: "only one negative flag", input: { isEtf: false } },
    { label: "ADR label without security classification", input: { isAdr: true } },
    { label: "unfamiliar explicit type", input: { instrumentType: "NEW_TYPE", isEtf: false, isFund: false } },
  ] as const)("keeps $label unconfirmed", ({ input }) => {
    expect(classifyInstrumentSupport(input)).toMatchObject({ supported: false, kind: "unknown" });
  });

  it.each(["INDEX", "CRYPTOCURRENCY", "CURRENCY", "FUTURE", "OPTION"])("refuses explicit %s even with negative fund flags", instrumentType => {
    expect(classifyInstrumentSupport({ instrumentType, isEtf: false, isFund: false, isAdr: true }))
      .toMatchObject({ supported: false, kind: "non-equity" });
  });

  it("a fund flag cannot be erased by conflicting equity metadata", () => {
    expect(classifyInstrumentSupport({ instrumentType: "EQUITY", isFund: true }))
      .toMatchObject({ supported: false, kind: "fund" });
  });
});

describe("runStageB — unsupported defense", () => {
  it("rejects an ETF before company computation with its typed support outcome", () => {
    const bundle = {
      symbol: "SPY",
      profile: {
        ok: true,
        value: { data: { rows: [{ isEtf: true, isFund: false }] } },
      },
    } as unknown as DataBundle;

    let thrown: unknown;
    try {
      runStageB(bundle);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UnsupportedInstrumentError);
    expect(thrown).toMatchObject({
      support: { supported: false, kind: "etf" },
    });
  });
});
