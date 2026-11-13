/**
 * D-251 (P5): filed common earnings for a fiscal year whose preferred stock was redeemed before the year's end,
 * through Stage B. All issuers here are synthetic (tests/helpers/researchRoutePanel.ts); the filed-fact cases for
 * the named company are in tests/commonEarnings.test.ts.
 *
 * The earnings selector refuses total net income for a year in which preferred claims existed. The filed figure was
 * read only when preferred or noncontrolling interests stood on the year's closing balance, so the redemption year
 * had no common earnings, the payout history fell under two usable years and the excess-return value was withheld.
 */
import { describe, expect, it } from "vitest";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { DataBundle } from "@/pipeline/types";
import { M } from "./helpers/currencyBundle";
import { withIssuerFacts } from "./helpers/confirmedIssuer";
import { buildSyntheticRouteBundle, runResearchRoutePanel } from "./helpers/researchRoutePanel";

const TAG = "NetIncomeLossAvailableToCommonStockholdersBasic";
const FILED_2025 = { start: "2025-01-01", end: "2025-12-31", val: 146 * M, form: "10-K", fp: "FY", filed: "2026-02-09", accn: "0000000042-26-000001" };

function filed(points: object[] = [FILED_2025]): CompanyFacts {
  return { cik: 42, entityName: "SYNTHETIC INSURER", facts: { "us-gaap": { [TAG]: { units: { USD: points } } } } };
}

function rows<T>(member: { ok: boolean; value?: { data: { rows: T[] } } }): T[] {
  if (!member.ok || !member.value) throw new Error("synthetic rows required");
  return member.value.data.rows;
}

/**
 * An insurer whose vendor rows carry no common earnings for fiscal 2025 and 2024. `preferredUntil` is the last
 * balance date that still shows the preferred: "2025-06-30" redeems it during fiscal 2025; null means it never existed.
 */
function insurer(preferredUntil: string | null, facts: CompanyFacts | null = filed()): DataBundle {
  const bundle = buildSyntheticRouteBundle("insurer");
  for (const member of [bundle.statements.balanceAnnual, bundle.statements.balanceQuarterly]) {
    for (const row of rows(member)) row.preferredStock = preferredUntil !== null && String(row.date) <= preferredUntil ? 50 * M : 0;
  }
  for (const row of rows(bundle.statements.incomeAnnual).slice(0, 2)) delete row.netIncomeAvailableToCommon;
  return facts === null ? bundle : withIssuerFacts(bundle, facts);
}

function valuation(bundle: DataBundle) {
  const { computed, report } = runResearchRoutePanel(bundle);
  if (computed.valuation.kind !== "excess-return") throw new Error("insurer route required");
  return { computed, report, excessReturn: computed.valuation.excessReturn };
}

describe("D-251: the redemption year's filed common earnings reach the payout history and the valuation", () => {
  it("root cause: preferred redeemed during fiscal 2025 no longer leaves that year without common earnings", () => {
    const { computed, report, excessReturn } = valuation(insurer("2025-06-30"));
    // 2025: (30M dividends + 20M buybacks - 10M issuance) / 146M filed; 2024 stays refused (preferred at its end, no filed
    // figure); 2023: (26M + 13M) / 120M. Two usable years.
    expect(excessReturn.payoutRatioPct.value).toBeCloseTo(((40 / 146) + (39 / 120)) / 2 * 100, 10);
    expect(excessReturn.perShare).not.toBeNull();
    // The fixture quote predates its statements, so the headline is withheld for that unrelated reason; the model value is kept.
    expect(report.fairValue?.auditValue?.value).toBeGreaterThan(0);
    const disclosure = computed.gaps.filter(g => g.field === "statements.incomeAnnual.netIncomeAvailableToCommon.redeemedPreferred");
    expect(disclosure).toHaveLength(1);
    expect(disclosure[0]!.reason).toMatch(/preferred stock or preferred dividends on record in its earnings window .* and none at its end/);
    expect(disclosure[0]!.reason).toContain("2025-12-31 (0000000042-26-000001 filed 2026-02-09)");
  });

  it("without the filed figure the year stays refused and the valuation withheld, as before", () => {
    const { report, excessReturn } = valuation(insurer("2025-06-30", null));
    expect(excessReturn.payoutRatioPct.value).toBeNull();
    expect(excessReturn.perShare).toBeNull();
    expect(report.fairValue).toMatchObject({ status: "suppressed", perShare: null });
    expect(report.fairValue?.auditValue).toBeUndefined();
    // A figure filed after the report's cutoff is not evidence either (P2).
    const late = valuation(insurer("2025-06-30", filed([{ ...FILED_2025, filed: "2026-08-01" }])));
    expect(late.excessReturn.payoutRatioPct.value).toBeNull();
  });

  it("compatible control: an insurer that never had preferred keeps its total net income; the filed figure is not read", () => {
    const { computed, excessReturn } = valuation(insurer(null));
    // 150M, 140M and 120M: total net income is the common holders' in a year with no preferred claim.
    expect(excessReturn.payoutRatioPct.value).toBeCloseTo(((40 / 150) + (56 / 140) + (39 / 120)) / 3 * 100, 10);
    expect(computed.gaps.some(g => g.field === "statements.incomeAnnual.netIncomeAvailableToCommon.redeemedPreferred")).toBe(false);
  });

  it("unrelated shape: preferred outstanding throughout with vendor common earnings is untouched by the filed fact", () => {
    const plain = buildSyntheticRouteBundle("insurer");
    const withFacts = withIssuerFacts(buildSyntheticRouteBundle("insurer"), filed());
    const before = valuation(plain).excessReturn, after = valuation(withFacts).excessReturn;
    expect(after.payoutRatioPct.value).toBe(before.payoutRatioPct.value);
    expect(after.perShare).toBe(before.perShare);
    expect(after.payoutRatioPct.value).toBeCloseTo(34.71611721611722, 10);
  });
});
