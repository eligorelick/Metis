import { describe, expect, it } from "vitest";
import type { CompanyFacts } from "@/edgar/xbrl";
import { validateBundle } from "@/pipeline/stageA/validate";
import { runStageB } from "@/pipeline/compute";
import { buildDataOnlyReport } from "@/pipeline/jobRunner";
import { keyDataRows } from "@/report/presentation";
import { reportToMarkdown } from "@/report/export/markdown";
import { BUILT_AT, completeCurrencyBundle } from "./helpers/currencyBundle";
import { withIssuerFacts } from "./helpers/confirmedIssuer";

// D-175. AAPL on 2026-11-02: the 10-K for the year ended 2026-09-26 was accepted at 16:30 and the
// provider's rows for it arrived within hours, partly wrong (D-173, D-174), while SEC companyfacts
// did not yet carry the period, so no figure from that filing could be cross-checked. The cross-check
// recorded "not checkable" info rows in the appendix only; this caution states it where readers look.
const FIELD = "validation.freshFiling";
const NEWEST = "2026-03-31"; // the helper bundle's newest quarter

function facts(ends: readonly string[]): CompanyFacts {
  const point = (end: string, val: number) => ({ end, val, accn: "0000000042-26-000001", filed: "2026-05-01", form: "10-Q", fy: 2026, fp: "Q1" });
  return { cik: 42, entityName: "Test General Co", facts: { "us-gaap": {
    Revenues: { units: { USD: ends.map(end => ({ ...point(end, 300e6), start: "2025-01-01" })) } },
    Assets: { units: { USD: ends.map(end => point(end, 2050e6)) } },
  } } } as unknown as CompanyFacts;
}

function bundle(filed: string | null, secEnds: readonly string[] = ["2025-12-31", "2025-09-30"]) {
  const b = completeCurrencyBundle({});
  if (!b.statements.incomeQuarterly.ok) throw new Error("fixture");
  const newest = b.statements.incomeQuarterly.value.data.rows.find(row => row.date === NEWEST);
  if (!newest) throw new Error("fixture requires the newest quarter");
  if (filed !== null) Object.assign(newest, { filingDate: filed, acceptedDate: `${filed} 16:30:23` });
  return withIssuerFacts(b, facts(secEnds));
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
});
