import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { successorContinuity } from "@/edgar/successor";
import type { CompanyFacts } from "@/edgar/xbrl";
import { runStageB } from "@/pipeline/compute";
import type { DataBundle } from "@/pipeline/types";

import { completeCurrencyBundle } from "./helpers/currencyBundle";

// Audit 2026-10-22 B-36: ExxonMobil Holdings Corp (CIK 2115436) succeeded
// Exxon Mobil Corporation (CIK 34088) on 2026-07-01 in a one-for-one
// holding-company reorganisation. Its first 10-Q re-presents the predecessor's
// Q2 2025 unchanged (net income 7,082M, diluted EPS 1.64), so the two are one
// reporting entity on one share basis, and a TTM across the reorganisation is
// the same group's twelve months.

const SUCCESSOR_CIK = "0002115436";
const PREDECESSOR_CIK = "0000034088";

type Point = { start: string; end: string; val: number; form?: string; filed?: string };
function facts(cik: number, concepts: Record<string, { unit: string; points: Point[] }>): CompanyFacts {
  return {
    cik,
    entityName: "Test",
    facts: {
      "us-gaap": Object.fromEntries(Object.entries(concepts).map(([tag, c]) => [tag, {
        label: tag,
        units: { [c.unit]: c.points.map((p, i) => ({ ...p, accn: `000${cik}-26-${String(i).padStart(6, "0")}`, fy: 2026, fp: "Q2", form: p.form ?? "10-Q", filed: p.filed ?? "2026-08-03" })) },
      }])),
    },
  } as unknown as CompanyFacts;
}
const Q2_2025 = { start: "2025-04-01", end: "2025-06-30" };
const Q2_2026 = { start: "2026-04-01", end: "2026-06-30" };
const predecessorFacts = facts(34088, {
  NetIncomeLoss: { unit: "USD", points: [{ ...Q2_2025, val: 7_082_000_000, filed: "2025-08-04" }, { start: "2026-01-01", end: "2026-03-31", val: 4_183_000_000, filed: "2026-05-04" }] },
  EarningsPerShareDiluted: { unit: "USD/shares", points: [{ ...Q2_2025, val: 1.64, filed: "2025-08-04" }] },
});
const successorFacts = (q2_2025: number, eps = 1.64) => facts(2115436, {
  NetIncomeLoss: { unit: "USD", points: [{ ...Q2_2025, val: q2_2025 }, { ...Q2_2026, val: 14_525_000_000 }] },
  EarningsPerShareDiluted: { unit: "USD/shares", points: [{ ...Q2_2025, val: eps }, { ...Q2_2026, val: 3.48 }] },
});

describe("a successor that re-presents its predecessor's periods unchanged (audit 2026-10-22 B-36)", () => {
  it("names the comparative periods that match in earnings and per-share basis", () => {
    expect(successorContinuity(successorFacts(7_082_000_000), predecessorFacts)).toEqual({ periods: ["2025-04-01 to 2025-06-30"] });
  });

  it("finds none when a re-presented comparative differs, in earnings or per share", () => {
    expect(successorContinuity(successorFacts(7_000_000_000), predecessorFacts)).toBeNull();
    // Same earnings but a different EPS: the share basis changed at the reorganisation.
    expect(successorContinuity(successorFacts(7_082_000_000, 0.82), predecessorFacts)).toBeNull();
  });

  it("compares EPS by role, so a combined basic-and-diluted tag meets separate basic and diluted tags", () => {
    const combined = facts(34088, {
      NetIncomeLoss: { unit: "USD", points: [{ ...Q2_2025, val: 7_082_000_000, filed: "2025-08-04" }] },
      EarningsPerShareBasicAndDiluted: { unit: "USD/shares", points: [{ ...Q2_2025, val: 1.64, filed: "2025-08-04" }] },
    });
    const separate = (eps: number) => facts(2115436, {
      NetIncomeLoss: { unit: "USD", points: [{ ...Q2_2025, val: 7_082_000_000 }] },
      EarningsPerShareBasic: { unit: "USD/shares", points: [{ ...Q2_2025, val: eps }] },
      EarningsPerShareDiluted: { unit: "USD/shares", points: [{ ...Q2_2025, val: eps }] },
    });
    expect(successorContinuity(separate(1.64), combined)).toEqual({ periods: ["2025-04-01 to 2025-06-30"] });
    // Same earnings, half the EPS: a two-for-one share exchange, not one share basis.
    expect(successorContinuity(separate(0.82), combined)).toBeNull();
  });

  it("finds none when no per-share comparative is re-presented, since one share basis is then not shown", () => {
    const noEps = facts(2115436, { NetIncomeLoss: { unit: "USD", points: [{ ...Q2_2025, val: 7_082_000_000 }, { ...Q2_2026, val: 14_525_000_000 }] } });
    expect(successorContinuity(noEps, predecessorFacts)).toBeNull();
  });

  it("finds none when the successor re-presents no predecessor period", () => {
    const own = facts(2115436, { NetIncomeLoss: { unit: "USD", points: [{ ...Q2_2026, val: 14_525_000_000 }] } });
    expect(successorContinuity(own, predecessorFacts)).toBeNull();
  });
});

function quarters(bundle: DataBundle): Record<string, unknown>[] {
  if (!bundle.statements.incomeQuarterly.ok) throw new Error("no quarterly income");
  return bundle.statements.incomeQuarterly.value.data.rows as unknown as Record<string, unknown>[];
}

/** Newest quarter the successor's, the three before it the predecessor's; diluted EPS missing so P/E runs on common income. */
function reorganised(successorCik?: string): DataBundle {
  const bundle = completeCurrencyBundle({ annualCurrency: "USD" });
  (bundle.edgar as { registrant?: unknown }).registrant = { cik10: SUCCESSOR_CIK };
  quarters(bundle).forEach((row, i) => {
    if (i === 0) Object.assign(row, { cik: SUCCESSOR_CIK, epsDiluted: null });
    else Object.assign(row, { cik: PREDECESSOR_CIK, predecessor: true, predecessorCik: PREDECESSOR_CIK, ...(successorCik ? { successorCik } : {}) });
  });
  return bundle;
}

function pe(bundle: DataBundle) {
  const computed = runStageB(bundle);
  if (computed.valuation.kind === "pre-revenue") throw new Error("no multiples");
  return { pe: computed.valuation.multiples.multiples.find((m) => m.key === "peTtm")!, computed };
}

describe("TTM earnings across a reorganisation (audit 2026-10-22 B-36)", () => {
  it("withholds P/E when nothing establishes that the predecessor's quarters are the successor's", () => {
    const { pe: stat, computed } = pe(reorganised());
    expect(stat.current).toBeNull();
    expect(JSON.stringify(computed)).toContain("TTM earnings issuerId differs across actual quarterly flows");
  });

  it("produces P/E when the successor's filing re-presents the predecessor's quarters unchanged", () => {
    const { pe: stat, computed } = pe(reorganised(SUCCESSOR_CIK));
    expect(stat.current).not.toBeNull();
    expect(stat.basis).toMatch(/^marketCap \/ common income \(TTM; /);
    expect(JSON.stringify(computed)).not.toContain("TTM earnings issuerId differs");
  });
});
