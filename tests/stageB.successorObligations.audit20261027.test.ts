// Audit 2026-10-27 FIN-403: a successor registrant whose companyfacts payload begins at the reorganisation
// (ExxonMobil Holdings Corp, CIK 2115436, successor to CIK 34088) has no annual report of its own, so its
// asset-retirement obligation was never read and the bridge deducted nothing for it. Until its own first
// annual report, an obligation the successor does not tag is read from the predecessor, per family, when
// the successor's own filings re-present the predecessor's periods unchanged (B-36 continuity).
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { CompanyFacts } from "@/edgar/xbrl";
import { runStageB } from "@/pipeline/compute";
import { successorObligationsAt } from "@/pipeline/stageB/debtLikeObligations";
import type { DataBundle } from "@/pipeline/types";

import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { withIssuerFacts } from "./helpers/confirmedIssuer";

const M = 1_000_000;
const PREDECESSOR_CIK = "0000034088";
const OBSERVED = "2026-10-22";

type Point = { end: string; val: number; form: string; filed: string; start?: string };
function facts(cik: number, concepts: Record<string, { unit: string; points: Point[] }>): CompanyFacts {
  return {
    cik,
    entityName: "Test",
    facts: {
      "us-gaap": Object.fromEntries(Object.entries(concepts).map(([tag, c]) => [tag, {
        label: tag,
        units: { [c.unit]: c.points.map((p, i) => ({ ...p, accn: `000${cik}-26-${String(i).padStart(6, "0")}`, fy: 2026, fp: "Q2" })) },
      }])),
    },
  } as unknown as CompanyFacts;
}
const inst = (end: string, val: number, form: string, filed: string): Point => ({ end, val, form, filed });
const usd = (...points: Point[]) => ({ unit: "USD", points });

const predecessor = (extra: Record<string, { unit: string; points: Point[] }> = {}) => facts(34088, {
  Assets: usd(inst("2025-12-31", 450_000e6, "10-K", "2026-02-18")),
  AssetRetirementObligation: usd(inst("2025-12-31", 12_518e6, "10-K", "2026-02-18")),
  ...extra,
});
const successor = (extra: Record<string, { unit: string; points: Point[] }> = {}) => facts(2115436, {
  Assets: usd(inst("2026-06-30", 460_000e6, "10-Q", "2026-08-03")),
  ...extra,
});
const PRED = { cik10: PREDECESSOR_CIK, continuity: true };

describe("a successor with no annual report of its own bears its predecessor's filed obligations (FIN-403)", () => {
  it("reads the predecessor's obligations when the successor has no annual report of its own", () => {
    const got = successorObligationsAt(successor(), { facts: predecessor(), ...PRED }, "2026-06-30", "USD", OBSERVED)!;
    expect(got.assetRetirement).toMatchObject({ value: 12_518e6, asOf: "2025-12-31" });
    expect(got.assetRetirement!.basis).toMatch(/^predecessor \(CIK 0000034088/);
    expect(got.assetRetirement!.basis).toMatch(/10-K filed 2026-02-18/);
  });

  it("without established continuity nothing is read", () => {
    expect(successorObligationsAt(successor(), { facts: predecessor(), cik10: PREDECESSOR_CIK, continuity: false }, "2026-06-30", "USD", OBSERVED)).toBeNull();
  });

  it("control: without a predecessor it is the successor's own reading, here nothing", () => {
    expect(successorObligationsAt(successor(), null, "2026-06-30", "USD", OBSERVED)).toBeNull();
  });

  it("an annual report of the successor's own ends the predecessor read", () => {
    const own = successor({ Assets: usd(inst("2026-06-30", 460_000e6, "10-Q", "2026-08-03"), inst("2026-12-31", 470_000e6, "10-K", "2027-02-20")) });
    expect(successorObligationsAt(own, { facts: predecessor(), ...PRED }, "2027-03-31", "USD", "2027-04-20")).toBeNull();
  });

  it("an own annual report ends the read even when the predecessor's balance lies inside the look-back window", () => {
    // The bridge date is the successor's own 10-K date and the predecessor's ARO (2026-09-30) is inside the 366-day window,
    // so only the own-annual-report rule can return null here.
    const own = successor({ Assets: usd(inst("2026-12-31", 470_000e6, "10-K", "2027-02-20")) });
    const pred = predecessor({ AssetRetirementObligation: usd(inst("2026-09-30", 12_000e6, "10-Q", "2026-11-03")) });
    expect(successorObligationsAt(own, { facts: pred, ...PRED }, "2026-12-31", "USD", "2027-04-20")).toBeNull();
    // Control: the same predecessor is read when the successor has no annual report of its own.
    const tenQOnly = successor({ Assets: usd(inst("2026-12-31", 470_000e6, "10-Q", "2027-02-20")) });
    expect(successorObligationsAt(tenQOnly, { facts: pred, ...PRED }, "2026-12-31", "USD", "2027-04-20")!.assetRetirement!.value).toBe(12_000e6);
  });

  describe("a family the successor tags is its statement, a filed zero included", () => {
    const pred = predecessor({
      PensionAndOtherPostretirementDefinedBenefitPlansLiabilitiesNoncurrent: usd(inst("2026-03-31", 8_940e6, "10-Q", "2026-05-04")),
      LossContingencyAccrualAtCarryingValue: usd(inst("2025-12-31", 500e6, "10-K", "2026-02-18")),
    });
    const read = (own: CompanyFacts) => successorObligationsAt(own, { facts: pred, ...PRED }, "2026-06-30", "USD", OBSERVED)!;
    it("a zero asset-retirement obligation deducts nothing", () => {
      const got = read(successor({ AssetRetirementObligation: usd(inst("2026-06-30", 0, "10-Q", "2026-08-03")) }));
      expect(got.assetRetirement).toBeNull();
      expect(got.lossContingencies!.value).toBe(500e6);
    });
    it("a zero pension family deducts nothing", () => {
      const got = read(successor({ PensionAndOtherPostretirementDefinedBenefitPlansLiabilitiesNoncurrent: usd(inst("2026-06-30", 0, "10-Q", "2026-08-03")) }));
      expect(got.pension).toBeNull();
      expect(got.assetRetirement!.value).toBe(12_518e6);
    });
    it("a loss accrual equal to the successor's own environmental accrual deducts nothing", () => {
      const got = read(successor({
        LossContingencyAccrualAtCarryingValue: usd(inst("2026-06-30", 49e6, "10-Q", "2026-08-03")),
        AccrualForEnvironmentalLossContingencies: usd(inst("2026-06-30", 49e6, "10-Q", "2026-08-03")),
      }));
      expect(got.lossContingencies).toBeNull();
      expect(got.environmental!.value).toBe(49e6);
    });
    it("control: an untagged family still takes the predecessor's figure", () => {
      const got = read(successor());
      expect(got.pension!.value).toBe(8_940e6);
      expect(got.lossContingencies!.value).toBe(500e6);
    });
  });

  it("the successor's own tagged obligation wins, family by family", () => {
    const own = successor({ AssetRetirementObligation: usd(inst("2026-06-30", 100e6, "10-Q", "2026-08-03")) });
    const pred = predecessor({ AccrualForEnvironmentalLossContingencies: usd(inst("2025-12-31", 400e6, "10-K", "2026-02-18")) });
    const got = successorObligationsAt(own, { facts: pred, ...PRED }, "2026-06-30", "USD", OBSERVED)!;
    expect(got.assetRetirement!.value).toBe(100e6);
    expect(got.assetRetirement!.basis).not.toMatch(/predecessor/);
    expect(got.environmental!.value).toBe(400e6);
    expect(got.environmental!.basis).toMatch(/^predecessor \(CIK 0000034088/);
  });

  it("a family both registrants tag is read once, from the successor", () => {
    const tag = "PensionAndOtherPostretirementDefinedBenefitPlansLiabilitiesNoncurrent";
    const own = successor({ [tag]: usd(inst("2026-06-30", 9_068e6, "10-Q", "2026-08-03")) });
    const pred = predecessor({ [tag]: usd(inst("2026-03-31", 8_940e6, "10-Q", "2026-05-04")) });
    const got = successorObligationsAt(own, { facts: pred, ...PRED }, "2026-06-30", "USD", OBSERVED)!;
    expect(got.pension!.value).toBe(9_068e6);
    expect(got.pension!.basis).not.toMatch(/predecessor/);
    expect(got.assetRetirement!.value).toBe(12_518e6);
    expect(got.assetRetirement!.basis).toMatch(/^predecessor/);
  });

  it("settlement assets follow the retirement obligation they offset", () => {
    const fund = "DecommissioningFundInvestments";
    const pred = predecessor({ [fund]: usd(inst("2025-12-31", 3_000e6, "10-K", "2026-02-18")) });
    const fromPredecessor = successorObligationsAt(successor(), { facts: pred, ...PRED }, "2026-06-30", "USD", OBSERVED)!;
    expect(fromPredecessor.settlementAssets!.value).toBe(3_000e6);
    // The successor's own obligation is offset by its own funds only, never the predecessor's.
    const own = successor({ AssetRetirementObligation: usd(inst("2026-06-30", 100e6, "10-Q", "2026-08-03")) });
    expect(successorObligationsAt(own, { facts: pred, ...PRED }, "2026-06-30", "USD", OBSERVED)!.settlementAssets).toBeNull();
  });
});

// PR #76 Codex review, fix round 4 (C2): the environmental overlap is netted across the merged registrants.
describe("the environmental accrual inside a loss-contingency total is counted once across the merged registrants (C2)", () => {
  const LOSS = "LossContingencyAccrualAtCarryingValue";
  const ENV = "AccrualForEnvironmentalLossContingencies";
  const at = (end: string, val: number) => usd(inst(end, val, "10-Q", "2026-08-03"));
  const read = (own: CompanyFacts, pred: CompanyFacts) => successorObligationsAt(own, { facts: pred, ...PRED }, "2026-06-30", "USD", OBSERVED)!;

  it("a predecessor environmental accrual and a successor that repeats only the total deduct 400M plus 100M, never 400M plus 500M", () => {
    const got = read(successor({ [LOSS]: at("2026-06-30", 500e6) }), predecessor({ [LOSS]: at("2026-06-30", 500e6), [ENV]: at("2026-06-30", 400e6) }));
    expect(got.environmental!.value).toBe(400e6);
    expect(got.lossContingencies!.value).toBe(100e6);
    expect(got.lossContingencies!.basis).toMatch(/less the environmental accrual of 0\.400B/);
  });

  it("the successor's environmental accrual nets the predecessor's loss total in the same way, and a fully overlapping total deducts nothing", () => {
    const own = successor({ [ENV]: at("2026-06-30", 400e6) });
    expect(read(own, predecessor({ [LOSS]: at("2026-06-30", 500e6) })).lossContingencies!.value).toBe(100e6);
    expect(read(own, predecessor({ [LOSS]: at("2026-06-30", 400e6) })).lossContingencies).toBeNull();
  });

  it("a date mismatch keeps the existing reading (its residual is recorded under OD-4)", () => {
    const got = read(successor({ [LOSS]: at("2026-06-30", 500e6) }), predecessor({ [ENV]: usd(inst("2025-12-31", 400e6, "10-K", "2026-02-18")) }));
    expect(got.environmental!.value).toBe(400e6);
    expect(got.lossContingencies!.value).toBe(500e6);
  });

  it("controls: one registrant tagging both is unchanged, and both read from the predecessor stay netted", () => {
    const both = { [LOSS]: at("2026-06-30", 500e6), [ENV]: at("2026-06-30", 400e6) };
    const single = read(successor(both), predecessor());
    expect([single.environmental!.value, single.lossContingencies!.value]).toEqual([400e6, 100e6]);
    const fromPredecessor = read(successor(), predecessor({ [LOSS]: usd(inst("2025-12-31", 500e6, "10-K", "2026-02-18")), [ENV]: usd(inst("2025-12-31", 400e6, "10-K", "2026-02-18")) }));
    expect([fromPredecessor.environmental!.value, fromPredecessor.lossContingencies!.value]).toEqual([400e6, 100e6]);
  });
});

function wiringBundle(continuity: boolean, confirmed = true): DataBundle {
  const bundle = completeCurrencyBundle({ debt: 300, annualCurrency: "USD" });
  const cmp = { start: "2025-04-01", end: "2025-06-30" };
  const pred = facts(34088, {
    Assets: usd(inst("2024-12-31", 440_000e6, "10-K", "2025-02-18")),
    AssetRetirementObligation: usd(inst("2025-09-30", 125 * M, "10-Q", "2025-11-04")),
    NetIncomeLoss: usd({ ...cmp, val: 7_082e6, form: "10-Q", filed: "2025-08-04" }),
    EarningsPerShareDiluted: { unit: "USD/shares", points: [{ ...cmp, val: 1.64, form: "10-Q", filed: "2025-08-04" }] },
  });
  const succ = facts(2115436, {
    Assets: usd(inst("2026-03-31", 460_000e6, "10-Q", "2026-05-04")),
    NetIncomeLoss: usd({ ...cmp, val: continuity ? 7_082e6 : 7_000e6, form: "10-Q", filed: "2026-05-04" }),
    EarningsPerShareDiluted: { unit: "USD/shares", points: [{ ...cmp, val: 1.64, form: "10-Q", filed: "2026-05-04" }] },
  });
  // The successor's facts are read only for a confirmed issuer (PR #76 Codex review).
  withIssuerFacts(bundle, succ, confirmed);
  bundle.edgar = { ...bundle.edgar,
    predecessor: { cik10: PREDECESSOR_CIK, name: "Predecessor Corp", facts: pred, endpoint: "test predecessor facts", fetchedAt: bundle.builtAt,
      via: { accession: "0000034088-26-000001", form: "8-K12B", filed: "2026-07-01", successorFormAccession: "0002115436-26-000001" } },
  } as DataBundle["edgar"];
  return bundle;
}

describe("the bridge deducts the predecessor's obligation (FIN-403 wiring)", () => {
  it("runStageB deducts the predecessor's obligation in the bridge", () => {
    const computed = runStageB(wiringBundle(true));
    if (computed.valuation.kind !== "dcf") throw new Error("DCF fixture");
    const lines = (computed.valuation.dcf?.bridge.nonOperatingComponents ?? []).filter((c) => c.kind === "debt-like-obligation");
    expect(lines).toHaveLength(1);
    // 125 M less the 21% US marginal rate (currencyBundle's profile is US).
    expect(lines[0]!.value).toBeCloseTo(-98.75 * M, 0);
    // The predecessor's balance (2025-09-30) is older than the bridge row, so the line dates it.
    expect(lines[0]!.label).toBe("asset-retirement obligations (filed, after tax at 21%; balance at 2025-09-30, the latest filed)");
    expect(lines[0]!.basis).toMatch(/^predecessor \(CIK 0000034088, one reporting entity under B-36\): us-gaap\/AssetRetirementObligation 0\.125B at 2025-09-30 \(10-Q filed 2025-11-04\)/);
    expect(computed.gaps.map((g) => g.field)).not.toContain("valuation.dcf.debtLikeObligations.predecessor");
  });

  it("facts of an unconfirmed registrant (a stale FMP CIK) read no predecessor obligations", () => {
    const computed = runStageB(wiringBundle(true, false));
    if (computed.valuation.kind !== "dcf") throw new Error("DCF fixture");
    expect((computed.valuation.dcf?.bridge.nonOperatingComponents ?? []).some((c) => c.kind === "debt-like-obligation")).toBe(false);
  });

  it("without established continuity nothing is deducted and the run says so", () => {
    const computed = runStageB(wiringBundle(false));
    if (computed.valuation.kind !== "dcf") throw new Error("DCF fixture");
    expect((computed.valuation.dcf?.bridge.nonOperatingComponents ?? []).some((c) => c.kind === "debt-like-obligation")).toBe(false);
    expect(computed.gaps).toContainEqual(expect.objectContaining({ field: "valuation.dcf.debtLikeObligations.predecessor", severity: "info" }));
  });

  it("control: without continuity and with nothing the predecessor would supply, no gap is raised", () => {
    const bundle = wiringBundle(false);
    const predecessorFacts = (bundle.edgar as unknown as { predecessor: { facts: CompanyFacts } }).predecessor.facts;
    delete (predecessorFacts.facts["us-gaap"] as Record<string, unknown>).AssetRetirementObligation;
    const computed = runStageB(bundle);
    expect(computed.gaps.map((g) => g.field)).not.toContain("valuation.dcf.debtLikeObligations.predecessor");
  });
});
