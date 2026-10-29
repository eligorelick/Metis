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

function wiringBundle(continuity: boolean): DataBundle {
  const bundle = completeCurrencyBundle({ debt: 300, annualCurrency: "USD" });
  const cmp = { start: "2025-04-01", end: "2025-06-30" };
  const pred = facts(34088, {
    Assets: usd(inst("2025-12-31", 450_000e6, "10-K", "2026-02-18")),
    AssetRetirementObligation: usd(inst("2025-12-31", 125 * M, "10-K", "2026-02-18")),
    NetIncomeLoss: usd({ ...cmp, val: 7_082e6, form: "10-Q", filed: "2025-08-04" }),
    EarningsPerShareDiluted: { unit: "USD/shares", points: [{ ...cmp, val: 1.64, form: "10-Q", filed: "2025-08-04" }] },
  });
  const succ = facts(2115436, {
    Assets: usd(inst("2026-03-31", 460_000e6, "10-Q", "2026-05-04")),
    NetIncomeLoss: usd({ ...cmp, val: continuity ? 7_082e6 : 7_000e6, form: "10-Q", filed: "2026-05-04" }),
    EarningsPerShareDiluted: { unit: "USD/shares", points: [{ ...cmp, val: 1.64, form: "10-Q", filed: "2026-05-04" }] },
  });
  bundle.edgar = { ...bundle.edgar,
    companyFacts: { ok: true, value: { source: "edgar", endpoint: "test facts", asOf: "2026-07-01", fetchedAt: bundle.builtAt, data: succ } },
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
    // The fixture's bridge row is dated 2025-12-31, the predecessor's own balance date, so the line needs no "balance at" clause.
    expect(lines[0]!.label).toBe("asset-retirement obligations (filed, after tax at 21%)");
    expect(lines[0]!.basis).toMatch(/^predecessor \(CIK 0000034088, one reporting entity under B-36\): us-gaap\/AssetRetirementObligation 0\.125B at 2025-12-31 \(10-K filed 2026-02-18\)/);
    expect(computed.gaps.map((g) => g.field)).not.toContain("valuation.dcf.debtLikeObligations.predecessor");
  });

  it("without established continuity nothing is deducted and the run says so", () => {
    const computed = runStageB(wiringBundle(false));
    if (computed.valuation.kind !== "dcf") throw new Error("DCF fixture");
    expect((computed.valuation.dcf?.bridge.nonOperatingComponents ?? []).some((c) => c.kind === "debt-like-obligation")).toBe(false);
    expect(computed.gaps).toContainEqual(expect.objectContaining({ field: "valuation.dcf.debtLikeObligations.predecessor", severity: "info" }));
  });
});
