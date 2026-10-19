/** Synthetic timing precision controls; no provider timezone is inferred. */
import { describe, expect, it } from "vitest";
import { commonHolderCapital } from "@/pipeline/stageB/securityBasis";
import { parseStoredReport } from "@/report/history";
import { reportToAuditMarkdown } from "@/report/export/auditMarkdown";
import { buildSyntheticRouteBundle, runResearchRoutePanel } from "./helpers/researchRoutePanel";

const ZONES = ["UTC", "America/Los_Angeles", "Asia/Kolkata"] as const;
function inZone<T>(zone: string, action: () => T): T {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try { return action(); }
  finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
}
interface TimingCase { label: string; filedAt?: string[]; observedAt?: string; acceptedAt?: string; cutoff?: string; expected: number | null }
const CASES: TimingCase[] = [
  { label: "root same-day unzoned filing repro", filedAt: ["2026-07-06 16:00:00"], expected: null },
  { label: "older unzoned FMP filing", filedAt: ["2026-07-05 20:00:00"], expected: 94 },
  { label: "future unzoned filing", filedAt: ["2026-07-07 16:00:00"], expected: null },
  { label: "exact UTC filing at cutoff", filedAt: ["2026-07-06T20:00:00Z"], expected: 94 },
  { label: "equivalent negative-offset filing", filedAt: ["2026-07-06T16:00:00-04:00"], expected: 94 },
  { label: "equivalent positive-offset filing", filedAt: ["2026-07-07T01:30:00+05:30"], expected: 94 },
  { label: "equivalent offset cutoff", filedAt: ["2026-07-06T20:00:00Z"], cutoff: "2026-07-06T13:00:00-07:00", expected: 94 },
  { label: "future explicit instant", filedAt: ["2026-07-06T20:00:00.001Z"], expected: null },
  { label: "older filing day", filedAt: ["2026-07-05"], expected: 94 },
  { label: "same-day filing without precise proof", filedAt: ["2026-07-06"], expected: null },
  { label: "same-day filing with precise same-field observation", filedAt: ["2026-07-06"], observedAt: "2026-07-06T19:00:00Z", expected: 94 },
  { label: "same-day unzoned filing with precise observation", filedAt: ["2026-07-06 16:00:00"], observedAt: "2026-07-06T19:00:00Z", expected: 94 },
  { label: "one filing instant cannot prove another component filing day", filedAt: ["2026-07-06", "2026-07-06T19:00:00Z"], expected: null },
  { label: "an older filing instant cannot prove a newer component day", filedAt: ["2026-07-06", "2026-07-05T19:00:00Z"], expected: null },
  { label: "exact acceptance proves its own vendor row's filing availability", filedAt: ["2026-07-06"], acceptedAt: "2026-07-06T19:00:00Z", expected: 94 },
  { label: "future exact acceptance is not absent evidence", acceptedAt: "2026-07-06T20:00:00.001Z", expected: null },
  { label: "same-day unzoned observation", observedAt: "2026-07-06 16:00:00", expected: null },
  { label: "older unzoned observation", observedAt: "2026-07-05 20:00:00", expected: 94 },
  { label: "imprecise observation is not rescued by an earlier filing instant", filedAt: ["2026-07-06T19:00:00Z"], observedAt: "2026-07-06", expected: null },
  { label: "future observation despite older filing", filedAt: ["2026-07-05"], observedAt: "2027-01-01T00:00:00Z", expected: null },
  { label: "impossible zoned filing calendar day", filedAt: ["2026-02-30T12:00:00Z"], expected: null },
  { label: "impossible unzoned filing calendar day", filedAt: ["2026-02-30 12:00:00"], expected: null },
  { label: "impossible observation calendar day", observedAt: "2026-02-30T12:00:00Z", expected: null },
  { label: "invalid source clock", filedAt: ["2026-07-05T25:00:00Z"], expected: null },
  { label: "invalid source offset", filedAt: ["2026-07-05T12:00:00+24:00"], expected: null },
  { label: "invalid cutoff calendar day", cutoff: "2026-02-30T20:00:00Z", expected: null },
  { label: "unsupported unzoned cutoff", cutoff: "2026-07-06 20:00:00", filedAt: ["2026-07-05"], expected: null },
  { label: "date-only cutoff keeps UTC midnight", cutoff: "2026-07-06", filedAt: ["2026-07-06T00:00:00Z"], expected: 94 },
  { label: "date-only cutoff excludes later instant", cutoff: "2026-07-06", filedAt: ["2026-07-06T00:00:00.001Z"], expected: null },
  { label: "date-only cutoff cannot prove same-day filing availability", cutoff: "2026-07-06", filedAt: ["2026-07-06"], expected: null },
  { label: "date-only cutoff retains older-day evidence", cutoff: "2026-07-06", filedAt: ["2026-07-05"], expected: 94 },
];

describe.each(ZONES)("common source timing in %s", zone => {
  it.each(CASES)("$label", sample => inZone(zone, () => {
    const selected = commonHolderCapital({ netIncome: 100, netIncomeAvailableToCommon: 94,
      commonIncomeScope: { basis: "annual", periodStart: "2025-01-01", periodEnd: "2025-12-31",
        filedAt: sample.filedAt, observedAt: sample.observedAt, acceptedAt: sample.acceptedAt },
      admissionAsOf: sample.cutoff ?? "2026-07-06T20:00:00Z",
    }, { totalStockholdersEquity: 1000, preferredStock: 25 });
    expect(selected.commonIncome).toBe(sample.expected);
  }));

  it.each(["vendor-older", "vendor-same-day", "primary-ambiguous-row", "primary-future-row", "primary-malformed-row", "primary-malformed", "primary-future"] as const)("consumer field-source precedence: %s", mode => inZone(zone, () => {
    const bundle = buildSyntheticRouteBundle("bank");
    for (const member of [bundle.statements.incomeQuarterly, bundle.statements.balanceQuarterly, bundle.statements.cashflowQuarterly]) {
      if (!member.ok) throw new Error("synthetic rows required");
      member.value.data.rows = [];
    }
    if (!bundle.statements.incomeAnnual.ok) throw new Error("synthetic rows required");
    for (const row of bundle.statements.incomeAnnual.value.data.rows) {
      delete row.epsDiluted;
      row.filingDate = mode === "vendor-same-day" ? "2026-07-06" : "2026-07-05";
      row.acceptedDate = mode === "vendor-same-day" ? "2026-07-06 00:00:00" : "2026-07-05 20:00:00";
      if (mode.startsWith("primary")) {
        row.fieldProvenance = { netIncomeAvailableToCommon: { source: "edgar", unit: "USD",
          periodStart: `${String(row.date).slice(0, 4)}-01-01`, periodEnd: String(row.date),
          observedAt: mode === "primary-malformed" ? "2026-02-30T00:00:00Z" : bundle.builtAt,
          tags: ["us-gaap/NetIncomeLossAvailableToCommonStockholdersBasic"],
          filings: [{ accn: "synthetic-primary", filed: mode === "primary-future" ? "2027-01-01" : "2026-01-31", form: "10-K" }] } };
        if (mode === "primary-future-row") { row.filingDate = "2027-01-01"; row.acceptedDate = "2027-01-01T20:00:00Z"; }
        if (mode === "primary-malformed-row") { row.filingDate = "2026-02-30"; row.acceptedDate = "2026-02-30 20:00:00"; }
      }
    }
    const { computed, report, surfaces } = runResearchRoutePanel(bundle);
    const admitted = !["vendor-same-day", "primary-malformed", "primary-future"].includes(mode);
    if (computed.valuation.kind !== "excess-return") throw new Error("bank route required");
    if (!report.fairValue) throw new Error("synthetic bank fair value required");
    if (admitted) {
      expect(computed.returns.rote.latestRotePct).toBeCloseTo(140 / 375 * 100, 10);
      expect(computed.valuation.excessReturn.payoutRatioPct.value).toBeCloseTo(34.71611721611722, 10);
      expect(report.fairValue.perShare).not.toBeNull();
    } else {
      expect(computed.returns.rote.latestRotePct).toBeNull();
      expect(computed.valuation.excessReturn.payoutRatioPct.value).toBeNull();
      expect(report.fairValue).toMatchObject({ status: "suppressed", perShare: null });
      expect(parseStoredReport(JSON.stringify(report))?.fairValue?.perShare).toBeNull();
      for (const surface of [...Object.values(surfaces), reportToAuditMarkdown(report)]) expect(surface).toMatch(/common.*earnings|earnings.*common/i);
    }
  }));
});
