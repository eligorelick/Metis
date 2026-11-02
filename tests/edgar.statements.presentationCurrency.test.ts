// DATA-104 verifier probe (m1-verify-14). Asserts the CORRECT behaviour: a tag
// filed in two money units must be resolved in one presentation currency per
// series, never by taking the USD series alone and dropping (or re-basing)
// the periods the filer reported only in its own currency.
import { describe, expect, it } from "vitest";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import type { CompanyFacts } from "@/edgar/xbrl";

type Pt = { start?: string; end: string; val: number; accn: string; filed: string; form: string; fy: number; fp: string };
const OPTS = { symbol: "ADR", cik: "0001000001", annualPeriods: 5, quarterlyPeriods: 4, asOf: "2026-10-27",
  vendorSplits: { status: "unavailable" as const, source: "probe", reason: "probe" } };

// Realistic 20-F shape: each annual report carries three fiscal years in CNY
// (own year + two comparatives) and a USD convenience translation of its own
// year only, at that year-end's rate.
const CNY: Record<number, Record<string, number>> = {
  2021: { Revenues: 800_000e6, NetIncomeLoss: 60_000e6, NetCashProvidedByUsedInOperatingActivities: 150_000e6, Assets: 1_600_000e6 },
  2022: { Revenues: 850_000e6, NetIncomeLoss: 65_000e6, NetCashProvidedByUsedInOperatingActivities: 160_000e6, Assets: 1_700_000e6 },
  2023: { Revenues: 868_687e6, NetIncomeLoss: 72_509e6, NetCashProvidedByUsedInOperatingActivities: 199_752e6, Assets: 1_753_042e6 },
  2024: { Revenues: 941_168e6, NetIncomeLoss: 79_741e6, NetCashProvidedByUsedInOperatingActivities: 182_593e6, Assets: 1_764_829e6 },
  2025: { Revenues: 996_347e6, NetIncomeLoss: 129_470e6, NetCashProvidedByUsedInOperatingActivities: 163_509e6, Assets: 1_802_000e6 },
};
const RATE: Record<number, number> = { 2023: 7.10, 2024: 7.30, 2025: 6.85 };

function twentyFFacts(usdYears: number[]): CompanyFacts {
  const tags = Object.keys(CNY[2025]!);
  const usGaap: Record<string, { units: Record<string, Pt[]> }> = {};
  for (const tag of tags) usGaap[tag] = { units: { CNY: [], USD: [] } };
  for (const filingYear of [2023, 2024, 2025]) {
    const meta = { accn: `0001000001-${String(filingYear + 1).slice(2)}-000010`, filed: `${filingYear + 1}-04-20`, form: "20-F", fy: filingYear, fp: "FY" };
    for (const tag of tags) {
      const instant = tag === "Assets";
      const years = instant ? [filingYear, filingYear - 1] : [filingYear, filingYear - 1, filingYear - 2];
      for (const y of years) usGaap[tag]!.units.CNY!.push({ ...(instant ? {} : { start: `${y}-01-01` }), end: `${y}-12-31`, val: CNY[y]![tag]!, ...meta });
      if (usdYears.includes(filingYear)) {
        usGaap[tag]!.units.USD!.push({ ...(instant ? {} : { start: `${filingYear}-01-01` }), end: `${filingYear}-12-31`, val: Math.round(CNY[filingYear]![tag]! / RATE[filingYear]!), ...meta });
      }
    }
  }
  return { cik: 1000001, entityName: "EXAMPLE ADR HOLDINGS", facts: { "us-gaap": usGaap } };
}

describe("DATA-104: tag filed in two currency units", () => {
  it("control: a CNY-only 20-F filer gets all five fiscal years in CNY", () => {
    const f = twentyFFacts([]);
    for (const t of Object.values(f.facts["us-gaap"]!) as { units: Record<string, unknown[]> }[]) delete t.units.USD;
    const built = buildStatementsFromCompanyFacts(f, OPTS);
    expect(built.incomeAnnual.rows.map((r) => r.date)).toEqual(["2025-12-31", "2024-12-31", "2023-12-31", "2022-12-31", "2021-12-31"]);
    expect(built.reportedCurrency).toBe("CNY");
  });

  it("a filer that began tagging a USD convenience translation in its latest 20-F keeps its CNY history", () => {
    const built = buildStatementsFromCompanyFacts(twentyFFacts([2025]), OPTS);
    expect(built.reportedCurrency).toBe("CNY");
    expect(built.incomeAnnual.rows.map(r => r.revenue)).toEqual([996_347e6, 941_168e6, 868_687e6, 850_000e6, 800_000e6]);
    expect(built.incomeAnnual.notes.some(n => /convenience_unit: USD/.test(n))).toBe(true);
  });

  it("a filer that tags a USD convenience translation in every 20-F keeps a single-currency, constant-rate history", () => {
    const built = buildStatementsFromCompanyFacts(twentyFFacts([2023, 2024, 2025]), OPTS);
    const r = built.incomeAnnual.rows;
    // Revenue growth FY2025 over FY2024 as the filer reported it: 996,347 / 941,168 - 1 = 5.86%.
    const growth = (r[0]!.revenue as number) / (r[1]!.revenue as number) - 1;
    expect(r.length).toBe(5);
    expect(growth).toBeCloseTo(996_347 / 941_168 - 1, 3);
  });
});


describe("DATA-104 presentation controls", () => {
  it("withholds an old currency-only year after a presentation change", () => {
    const f = twentyFFacts([2023, 2024, 2025]);
    for (const concept of Object.values(f.facts["us-gaap"]!) as { units: Record<string, Pt[]> }[]) {
      const original = concept.units.CNY!;
      concept.units.EUR = original.filter(p => p.end !== "2021-12-31");
      concept.units.USD = original.filter(p => p.end === "2021-12-31");
      delete concept.units.CNY;
    }
    const built = buildStatementsFromCompanyFacts(f, OPTS);
    expect(built.reportedCurrency).toBe("EUR");
    expect(built.incomeAnnual.rows).toHaveLength(4);
    expect(built.incomeAnnual.rows.every(r => r.reportedCurrency === "EUR")).toBe(true);
    expect(built.incomeAnnual.notes.some(n => /mixed_unit: fiscal year ending 2021-12-31 is filed only in USD/.test(n))).toBe(true);
  });
  it("does not select a non-anchor debt currency", () => {
    const f = twentyFFacts([]);
    for (const concept of Object.values(f.facts["us-gaap"]!) as { units: Record<string, Pt[]> }[]) {
      concept.units.USD = concept.units.CNY!;
      delete concept.units.CNY;
    }
    f.facts["us-gaap"]!.CommercialPaper = { units: { EUR: [{ end: "2025-12-31", val: 1e6, accn: "0001000001-26-000010", filed: "2026-04-20", form: "20-F", fy: 2025, fp: "FY" }] } };
    const built = buildStatementsFromCompanyFacts(f, OPTS);
    expect(built.reportedCurrency).toBe("USD");
    expect(built.balanceAnnual.rows.every(r => r.reportedCurrency === "USD")).toBe(true);
  });
});
