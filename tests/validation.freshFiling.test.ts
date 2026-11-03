import { describe, expect, it } from "vitest";
import type { CompanyFacts } from "@/edgar/xbrl";
import { validateBundle } from "@/pipeline/stageA/validate";
import { runStageB } from "@/pipeline/compute";
import { buildDataOnlyReport } from "@/pipeline/jobRunner";
import { coverLedgerRows, keyDataRows } from "@/report/presentation";
import { reportToMarkdown } from "@/report/export/markdown";
import { BUILT_AT, completeCurrencyBundle } from "./helpers/currencyBundle";
import { withIssuerFacts } from "./helpers/confirmedIssuer";

// D-175. AAPL on 2026-11-02: the 10-K for the year ended 2026-09-26 was accepted at 16:30 and the
// provider's rows for it arrived within hours, partly wrong (D-173, D-174), while SEC companyfacts
// did not yet carry the period, so no figure from that filing could be cross-checked. The cross-check
// recorded "not checkable" info rows in the appendix only; this caution states it where readers look.
const FIELD = "validation.freshFiling";
const NEWEST = "2026-03-31"; // the helper bundle's newest quarter

function facts(ends: readonly string[], kind: "us-gaap" | "ifrs-20f" = "us-gaap"): CompanyFacts {
  const form = kind === "us-gaap" ? "10-Q" : "20-F";
  const point = (end: string, val: number) => ({ end, val, accn: "0000000042-26-000001", filed: "2026-05-01", form, fy: 2026, fp: kind === "us-gaap" ? "Q1" : "FY" });
  const concepts = kind === "us-gaap"
    ? { Revenues: { units: { USD: ends.map(end => ({ ...point(end, 300e6), start: "2025-01-01" })) } }, Assets: { units: { USD: ends.map(end => point(end, 2050e6)) } } }
    : { Revenue: { units: { EUR: ends.map(end => ({ ...point(end, 300e6), start: "2025-01-01" })) } }, Assets: { units: { EUR: ends.map(end => point(end, 2050e6)) } } };
  return { cik: 42, entityName: "Test General Co", facts: { [kind === "us-gaap" ? "us-gaap" : "ifrs-full"]: concepts } } as unknown as CompanyFacts;
}

function bundle(filed: string | null, secEnds: readonly string[] = ["2025-12-31", "2025-09-30"], kind: "us-gaap" | "ifrs-20f" = "us-gaap",
  dates: (filed: string) => Record<string, string> = day => ({ filingDate: day, acceptedDate: `${day} 16:30:23` })) {
  const b = completeCurrencyBundle({});
  if (!b.statements.incomeQuarterly.ok) throw new Error("fixture");
  const newest = b.statements.incomeQuarterly.value.data.rows.find(row => row.date === NEWEST);
  if (!newest) throw new Error("fixture requires the newest quarter");
  if (filed !== null) Object.assign(newest, dates(filed));
  return withIssuerFacts(b, facts(secEnds, kind));
}

function annualFiled(b: ReturnType<typeof bundle>, filed: string) {
  if (!b.statements.incomeAnnual.ok) throw new Error("fixture");
  const annual = b.statements.incomeAnnual.value.data.rows.find(row => row.date === "2025-12-31");
  if (!annual) throw new Error("fixture requires the 2025-12-31 annual row");
  Object.assign(annual, { filingDate: filed, acceptedDate: `${filed} 16:30:23` });
  return b;
}

const now = new Date(BUILT_AT); // 2026-07-06

describe("fresh-filing caution (D-175)", () => {
  it("cautions when the newest filing is days old and SEC data does not yet carry its period", () => {
    const gap = validateBundle(bundle("2026-07-04"), { now }).gaps.find(g => g.field === FIELD);
    expect(gap).toMatchObject({ severity: "warn" });
    expect(gap?.reason).toContain(`period ended ${NEWEST}`);
    expect(gap?.reason).toContain("filed 2026-07-04");
    expect(gap?.reason).toContain("not yet cross-checked");
  });

  it("stays silent for an older filing, a period SEC already carries, or a row without a filing date", () => {
    expect(validateBundle(bundle("2026-05-01"), { now }).gaps.some(g => g.field === FIELD)).toBe(false);
    expect(validateBundle(bundle("2026-07-04", [NEWEST, "2025-12-31"]), { now }).gaps.some(g => g.field === FIELD)).toBe(false);
    expect(validateBundle(bundle(null), { now }).gaps.some(g => g.field === FIELD)).toBe(false);
  });

  it("ignores a filing date after the analysis time", () => {
    expect(validateBundle(bundle("2026-07-09"), { now }).gaps.some(g => g.field === FIELD)).toBe(false);
  });

  it("dates an after-hours filing by its acceptance, not the next business day SEC files it on", () => {
    // Accepted Friday 2026-07-03 after 17:30 ET, filed Monday 2026-07-06, analysed Saturday.
    const afterHours = bundle("2026-07-03", undefined, undefined, () => ({ acceptedDate: "2026-07-03 18:00:00", filingDate: "2026-07-06" }));
    const gap = validateBundle(afterHours, { now: new Date("2026-07-04T12:00:00Z") }).gaps.find(g => g.field === FIELD);
    expect(gap?.reason).toContain("filed 2026-07-03");
  });

  it("matches the SEC period end within the cross-check's 3-day tolerance", () => {
    expect(validateBundle(bundle("2026-07-04", ["2026-03-29", "2025-12-31"]), { now }).gaps.some(g => g.field === FIELD)).toBe(false);
    expect(validateBundle(bundle("2026-07-04", ["2026-03-27", "2025-12-31"]), { now }).gaps.some(g => g.field === FIELD)).toBe(true);
  });

  it("reads an IFRS 20-F filer's ifrs-full facts, and never waits for the quarters it reports on 6-K", () => {
    // The newest quarter came from a 6-K two days ago; SEC data carries only the 20-F years, and has 2025.
    expect(validateBundle(bundle("2026-07-04", ["2025-12-31", "2024-12-31"], "ifrs-20f"), { now }).gaps.some(g => g.field === FIELD)).toBe(false);
    // A fresh 20-F whose year SEC data does not yet carry is cautioned.
    const fresh20F = annualFiled(bundle(null, ["2024-12-31", "2023-12-31"], "ifrs-20f"), "2026-07-02");
    const gap = validateBundle(fresh20F, { now }).gaps.find(g => g.field === FIELD);
    expect(gap?.reason).toContain("period ended 2025-12-31");
  });
});

describe("fresh-filing caution on page one (D-175)", () => {
  const report = (filed: string) => {
    const b = bundle(filed);
    return buildDataOnlyReport({ symbol: b.symbol, companyName: "Test General Co", generatedAt: b.builtAt, model: "none", costUsd: 0,
      bundle: b, computed: runStageB(b), validation: validateBundle(b, { now }), costBreakdown: [], reason: "no analysis" });
  };

  it("leads the key data with the caution and its reason", () => {
    const fresh = report("2026-07-04");
    expect(keyDataRows(fresh)[0]).toMatchObject({ label: "Newest filing", value: "not yet cross-checked" });
    expect(keyDataRows(fresh)[0]?.note).toContain("filed 2026-07-04");
    expect(reportToMarkdown(fresh)).toContain("| Newest filing | not yet cross-checked |");
  });

  it("adds nothing for an older filing", () => {
    expect(keyDataRows(report("2026-05-01")).some(row => row.label === "Newest filing")).toBe(false);
  });

  it("keeps the price on the cover ledger beside the caution", () => {
    const fresh = coverLedgerRows(keyDataRows(report("2026-07-04"))).map(row => row.label);
    const older = coverLedgerRows(keyDataRows(report("2026-05-01"))).map(row => row.label);
    expect(fresh[0]).toBe("Newest filing");
    expect(fresh.slice(1)).toEqual(older);
  });
});
