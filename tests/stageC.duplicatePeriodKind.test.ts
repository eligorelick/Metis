/**
 * P11 (D-223, inventory site G7): a statement block's "served more than once
 * with no provably latest filing" note is decided by the rejection kind that
 * `normalizeQuarterRowsWithKinds` sets beside each sentence, not by reading
 * the sentence. Nothing stored changes: `normalizeQuarterRows` still returns
 * exactly `{ rows, rejected }` with `{ period, reason }` records, and the
 * snapshots below (the rejected records, the block notes, and a hash of the
 * whole Stage B output and statement blocks) were recorded on main before the
 * change, so a pass proves byte-identity for every rejection kind.
 */
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { runStageB } from "@/pipeline/compute";
import { multiplesFramework, type MultiplesFrameworkInputs } from "@/pipeline/stageB/valuation";
import type { ValidationReport } from "@/pipeline/stageA/validate";
import * as quarterWindows from "@/pipeline/stageB/quarterWindows";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import type { DataBundle } from "@/pipeline/types";

import { completeCurrencyBundle } from "./helpers/currencyBundle";

type Normalized = { rows: unknown[]; rejected: Array<{ period: string; reason: string }>; rejectionKinds: string[] };
const hooks = vi.hoisted(() => ({ alter: null as null | ((result: Normalized) => Normalized) }));

// Lets a test reword the sentences payload.ts receives, leaving the kinds as set.
vi.mock("@/pipeline/stageB/quarterWindows", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/pipeline/stageB/quarterWindows")>();
  return {
    ...real,
    normalizeQuarterRowsWithKinds: (rows: never[]) => {
      const result = real.normalizeQuarterRowsWithKinds(rows) as unknown as Normalized;
      return hooks.alter ? hooks.alter(result) : result;
    },
  };
});

const EMPTY_VALIDATION = { checks: [], flags: [], gaps: [] } as unknown as ValidationReport;
const DUPLICATE_NOTE = (period: string): string =>
  `Fiscal period ${period} was served more than once with no provably latest filing; it is left out, as Stage B leaves it out.`;
const KIND_WORDS = ["rejectionKinds", "invalid-date", "alias-scope-conflict", "alias-value-restatement", "duplicate-missing-recency", "duplicate-tied-recency"];

type Row = Record<string, unknown>;
const annualRows = (bundle: DataBundle): Row[] =>
  (bundle.statements.incomeAnnual as unknown as { value: { data: { rows: Row[] } } }).value.data.rows;
const quarterRows = (bundle: DataBundle): Row[] =>
  (bundle.statements.incomeQuarterly as unknown as { value: { data: { rows: Row[] } } }).value.data.rows;

/** The bundle's FY2025 income row replaced by `fy2025(base)`, plus a fifth year so the window can lose one. */
function annualCase(fy2025: (base: Row) => Row[]): DataBundle {
  const bundle = completeCurrencyBundle({});
  const rows = annualRows(bundle);
  rows.push({ ...rows[3], date: "2021-12-31", fiscalYear: "2021", revenue: 600e6, netIncome: 100e6 });
  const base = { ...rows[0], cik: "0000000042", reportedCurrency: "USD", fiscalYear: "2025", period: "FY", filingDate: "2026-02-20", acceptedDate: "2026-02-20 15:00:00" };
  rows.splice(0, 1, ...fy2025(base));
  return bundle;
}
/** A three-day FY alias of `base` (same scope and filing day). */
const alias = (base: Row, extra: Row = {}): Row => ({ ...base, date: "2025-12-28", acceptedDate: "2026-02-20 16:00:00", ...extra });

const CASES: Record<string, () => DataBundle> = {
  "no rejection": () => annualCase((base) => [base]),
  "duplicate, missing recency": () => annualCase((base) => [
    { ...base, acceptedDate: undefined, filingDate: undefined },
    { ...base, revenue: 985e6, filingDate: "2026-05-15", acceptedDate: "2026-05-15 16:05:00" },
  ]),
  "duplicate, tied recency": () => annualCase((base) => [{ ...base, acceptedDate: undefined }, { ...base, acceptedDate: undefined, revenue: 985e6 }]),
  "duplicate over fiscal aliases, tied recency": () => annualCase((base) => [alias(base, { acceptedDate: undefined }), { ...base, acceptedDate: undefined }]),
  "invalid date": () => annualCase((base) => [base, { ...base, date: "2025-02-30" }]),
  "contradictory aliases": () => annualCase((base) => [base, alias(base),
    { ...base, reportedCurrency: "EUR", filingDate: "2026-03-01", acceptedDate: "2026-03-01 16:00:00" }]),
  "unrepresented restatement": () => annualCase((base) => [base,
    alias(base, { acceptedDate: "2026-02-20", fieldProvenance: { revenue: { filings: [{ filed: "2026-04-20" }] } } }),
    { ...base, filingDate: "2026-03-15", acceptedDate: "2026-03-15 16:00:00", revenue: 985e6 }]),
  "quarterly duplicate, tied recency": () => {
    const bundle = completeCurrencyBundle({});
    const rows = quarterRows(bundle);
    rows.splice(0, 1, { ...rows[0], filingDate: "2026-05-01" }, { ...rows[0], filingDate: "2026-05-01", revenue: 301e6 });
    return bundle;
  },
};
const sourceRows = (name: string, bundle: DataBundle): Row[] => name.startsWith("quarterly") ? quarterRows(bundle) : annualRows(bundle);
const blockTitle = (name: string): string => name.startsWith("quarterly") ? "Income statement — quarterly" : "Income statement — annual";
const sha = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function observe(name: string) {
  const bundle = CASES[name]();
  const rows = sourceRows(name, bundle);
  const normalized = quarterWindows.normalizeQuarterRows(rows);
  const computed = runStageB(bundle);
  const payload = assembleContextPayload(bundle, computed, EMPTY_VALIDATION);
  const block = payload.statements.find((b) => b.title === blockTitle(name))!;
  return { rows, normalized, computed, payload, block };
}

describe("the duplicate-period note reads the rejection kind (G7, D-223)", () => {
  // Recorded on main (f1b2a556) before the change; see the file comment.
  const MAIN_OWN_HISTORY = "dab44a533b6d0d7058538da540436794303992ec35f600e5aec4f2ca6eb14ad2";
  const MAIN: Record<string, { rejected: unknown; periods: string[]; notes: string[]; stageB: string; statements: string }> = {
    "no rejection": {
      rejected: [],
      periods: ["2025-12-31", "2024-12-31", "2023-12-31", "2022-12-31", "2021-12-31"],
      notes: [],
      stageB: "96be8c723c3c2494a89f601bd29a62b9e54475134c4a9fcd23b43b9cc079e8f2",
      statements: "92b373e4f661f520105fd9c2bd7fc77bef5d0405e314a089d60f8e16212f94c9",
    },
    "duplicate, missing recency": {
      rejected: [{"period": "2025-12-31", "reason": "duplicate fiscal period 2025-12-31 has missing or invalid acceptedDate/filingDate recency; whole period rejected as ambiguous"}],
      periods: ["2024-12-31", "2023-12-31", "2022-12-31", "2021-12-31"],
      notes: ["Fiscal period 2025-12-31 was served more than once with no provably latest filing; it is left out, as Stage B leaves it out."],
      stageB: "b1fc7c0136a3a4bd2caa90c39471a852d9ca59c23b997016b2b791e45a5cc8fd",
      statements: "f9946d28ffa75f2b268a1e66aaa679502d998236cc1a2ca5aa20de8ab6dede5b",
    },
    "duplicate, tied recency": {
      rejected: [{"period": "2025-12-31", "reason": "duplicate fiscal period 2025-12-31 has tied or overlapping acceptedDate/filingDate recency; whole period rejected as ambiguous"}],
      periods: ["2024-12-31", "2023-12-31", "2022-12-31", "2021-12-31"],
      notes: ["Fiscal period 2025-12-31 was served more than once with no provably latest filing; it is left out, as Stage B leaves it out."],
      stageB: "caf03cdf024d1266888d0c7b0fd4158e233f70e4f1f4a00c72ebaddb730b1048",
      statements: "f9946d28ffa75f2b268a1e66aaa679502d998236cc1a2ca5aa20de8ab6dede5b",
    },
    "duplicate over fiscal aliases, tied recency": {
      rejected: [{"period": "2025-12-28 / 2025-12-31", "reason": "duplicate fiscal period 2025-12-28 / 2025-12-31 has tied or overlapping acceptedDate/filingDate recency; whole period rejected as ambiguous"}],
      periods: ["2024-12-31", "2023-12-31", "2022-12-31", "2021-12-31"],
      notes: ["Fiscal period 2025-12-28 / 2025-12-31 was served more than once with no provably latest filing; it is left out, as Stage B leaves it out."],
      stageB: "10b82e0513c7edf007b6af63c9f7327311a435c3da915b588b94facd06a2e5dc",
      statements: "ae3ce9254e18fe4791ac4039154e38e181809fb5aa01323d8d5f516447ebc508",
    },
    "invalid date": {
      rejected: [{"period": "2025-02-30", "reason": "invalid fiscal period-end date \"2025-02-30\"; expected a real Gregorian YYYY-MM-DD"}],
      periods: ["2025-12-31", "unknown", "2024-12-31", "2023-12-31", "2022-12-31"],
      notes: [],
      stageB: "03850562b779b43f76d21b028eca37ceab804d1aa807e8c30dd29b1bc51878ba",
      statements: "c3ca27403072e4d0604e277d4452b11efe2e526ecb560c634bb187ab111d4d26",
    },
    "contradictory aliases": {
      rejected: [{"period": "2025-12-28 / 2025-12-31", "reason": "fiscal aliases 2025-12-28 / 2025-12-31 contain contradictory issuer, currency or fiscal scope; whole period rejected as ambiguous"}],
      periods: ["2024-12-31", "2023-12-31", "2022-12-31", "2021-12-31"],
      notes: [],
      stageB: "7010b8998e856d4ebd7e84c455235b576b6e5fa42a3fa4fa714ecd0b9a7dbdcf",
      statements: "f9d7fff3571a19119ca100742f1f05db7f73d6a1ff0c56ce09755e8a88dfb7b9",
    },
    "unrepresented restatement": {
      rejected: [{"period": "2025-12-28 / 2025-12-31", "reason": "fiscal aliases 2025-12-28 / 2025-12-31 have value-source restatements not represented by row recency; whole period rejected as ambiguous"}],
      periods: ["2024-12-31", "2023-12-31", "2022-12-31", "2021-12-31"],
      notes: [],
      stageB: "fe1480c2a877bb2df2bc4811377cd8a9b1ec8a8231c95fffdb7feca937e97609",
      statements: "f9d7fff3571a19119ca100742f1f05db7f73d6a1ff0c56ce09755e8a88dfb7b9",
    },
    "quarterly duplicate, tied recency": {
      rejected: [{"period": "2026-03-31", "reason": "duplicate fiscal period 2026-03-31 has tied or overlapping acceptedDate/filingDate recency; whole period rejected as ambiguous"}],
      periods: ["2025-12-31", "2025-09-30", "2025-06-30", "2025-03-31"],
      notes: ["Fiscal period 2026-03-31 was served more than once with no provably latest filing; it is left out, as Stage B leaves it out."],
      stageB: "4131d7c8fc409c39b7c7bd89e9cd8c69a1cb3325acd47e34ed4afa5323d4f73b",
      statements: "f203013eaca777ea72c800df761a4abc005d77c7a45435391627053ab1d1ac38",
    },
  };

  it.each(Object.keys(CASES))("%s (main): records, notes and stored output as on main", (name) => {
    const { normalized, computed, payload, block } = observe(name);
    // normalizeQuarterRows keeps its exact shape.
    expect(Object.keys(normalized)).toEqual(["rows", "rejected"]);
    for (const record of normalized.rejected) expect(Object.keys(record)).toEqual(["period", "reason"]);
    // The notes are exactly what the sentence check gave.
    const fromSentence = normalized.rejected.filter((entry) => entry.reason.startsWith("duplicate fiscal period")).map((entry) => DUPLICATE_NOTE(entry.period));
    expect(block.notes.filter((note) => note.endsWith("it is left out, as Stage B leaves it out."))).toEqual(fromSentence);
    // Nothing stored gains a key: Stage B output (gaps, own-history disclosures) and the payload.
    for (const stored of [JSON.stringify(computed), JSON.stringify(payload)]) for (const word of KIND_WORDS) expect(stored).not.toContain(word);
    expect({ rejected: normalized.rejected, periods: block.periods, notes: block.notes, stageB: sha(computed), statements: sha(payload.statements) }).toEqual(MAIN[name]);
  });

  it("a rejected duplicate reaches the stored gap entries with no new key (main)", () => {
    const quarterly = observe("quarterly duplicate, tied recency").computed;
    const annual = observe("duplicate, tied recency").computed;
    const carrying = (computed: typeof quarterly) => computed.gaps.filter((gap) => gap.reason.includes("duplicate fiscal period"))
      .map((gap) => [gap.field, Object.keys(gap)]);
    expect(carrying(quarterly)).toEqual([
      ["compute.quarterRows.income", ["field", "reason", "severity", "attemptedSources"]],
      ["compute.ttmIncome", ["field", "reason", "severity", "attemptedSources"]],
    ]);
    expect(carrying(annual)).toEqual([
      ["capital.income.period", ["field", "reason", "severity"]],
      ["growth.incomeStatement.period", ["field", "reason", "severity"]],
      ["projections.incomeStatement.period", ["field", "reason", "severity"]],
    ]);
  });

  it("a rejected duplicate quarter reaches the own-history disclosure as on main, with no new key (main)", () => {
    const dates = Array.from({ length: 24 }, (_, i) => `${2025 - Math.floor(i / 4)}-${["12-31", "09-30", "06-30", "03-31"][i % 4]}`);
    const quarter = (date: string) => ({ date, filingDate: "2026-02-15", revenue: 100, operatingIncome: 30, netIncome: 10, depreciationAndAmortization: 20,
      incomeDepreciationAndAmortization: 20, operatingCashFlow: 28, capitalExpenditure: -5, totalStockholdersEquity: 500, totalDebt: 0,
      cashAndShortTermInvestments: 0, preferredStock: 0, minorityInterest: 0 });
    const inputs = {
      quote: { price: 12, marketCap: 1200, currency: "USD" }, reportedCurrency: "USD",
      incomeTtm: { date: dates[0], revenue: 400, operatingIncome: 120, netIncome: 40, depreciationAndAmortization: 83, epsDiluted: 1 },
      cashFlowTtm: { date: dates[0], operatingCashFlow: 112, capitalExpenditure: -20 },
      balance: { date: dates[0], totalDebt: 0, cashAndShortTermInvestments: 0, totalStockholdersEquity: 500, goodwill: 0, intangibleAssets: 0, preferredStock: 0, minorityInterest: 0 },
      // 2023-06-30 is served twice on the same filing day: a tied duplicate.
      quarterlyFundamentals: [...dates.map(quarter), { ...quarter("2023-06-30"), revenue: 101 }],
      enterpriseValuesHistory: dates.map((date) => ({ date, marketCapitalization: 1200, enterpriseValue: 1200 })),
    } as MultiplesFrameworkInputs;
    const result = multiplesFramework("general", inputs);
    const windows = result.gaps.filter((gap) => gap.field === "valuation.multiples.ownHistory.windows");
    expect(windows.map((gap) => gap.reason.includes("period 2023-06-30: duplicate fiscal period 2023-06-30 has tied or overlapping"))).toEqual([true]);
    const stored = JSON.stringify(result);
    for (const word of KIND_WORDS) expect(stored).not.toContain(word);
    expect(sha(result)).toBe(MAIN_OWN_HISTORY);
  });

  it.each(Object.keys(CASES))("%s: the kinds name exactly the periods the sentence check named", (name) => {
    const { rows, normalized } = observe(name);
    const withKinds = quarterWindows.normalizeQuarterRowsWithKinds(rows as never[]);
    expect({ rows: withKinds.rows, rejected: withKinds.rejected }).toEqual(normalized);
    expect(withKinds.rejectionKinds).toHaveLength(withKinds.rejected.length);
    const byKind = withKinds.rejected.filter((_, i) => quarterWindows.isAmbiguousDuplicateRejection(withKinds.rejectionKinds[i])).map((entry) => entry.period);
    const bySentence = withKinds.rejected.filter((entry) => entry.reason.startsWith("duplicate fiscal period")).map((entry) => entry.period);
    expect(byKind).toEqual(bySentence);
  });

  it("each case reaches the rejection kind it is named for", () => {
    const kinds = (name: string) => quarterWindows.normalizeQuarterRowsWithKinds(sourceRows(name, CASES[name]()) as never[]).rejectionKinds;
    expect(Object.fromEntries(Object.keys(CASES).map((name) => [name, kinds(name)]))).toEqual({
      "no rejection": [],
      "duplicate, missing recency": ["duplicate-missing-recency"],
      "duplicate, tied recency": ["duplicate-tied-recency"],
      "duplicate over fiscal aliases, tied recency": ["duplicate-tied-recency"],
      "invalid date": ["invalid-date"],
      "contradictory aliases": ["alias-scope-conflict"],
      "unrepresented restatement": ["alias-value-restatement"],
      "quarterly duplicate, tied recency": ["duplicate-tied-recency"],
    });
  });

  it("a reworded duplicate sentence still gets its note: the kind decides", () => {
    hooks.alter = (result) => ({ ...result, rejected: result.rejected.map((entry) => ({ ...entry, reason: `reworded: ${entry.reason}` })) });
    try {
      expect(observe("duplicate, tied recency").block.notes).toContain(DUPLICATE_NOTE("2025-12-31"));
      expect(observe("duplicate, missing recency").block.notes).toContain(DUPLICATE_NOTE("2025-12-31"));
    } finally {
      hooks.alter = null;
    }
  });

  it("a non-duplicate rejection worded as a duplicate gets no note: the kind decides", () => {
    hooks.alter = (result) => ({ ...result, rejected: result.rejected.map((entry) => ({ ...entry, reason: `duplicate fiscal period ${entry.period} (reworded)` })) });
    try {
      for (const name of ["invalid date", "contradictory aliases", "unrepresented restatement"]) {
        expect(observe(name).block.notes.some((note) => note.includes("was served more than once"))).toBe(false);
      }
    } finally {
      hooks.alter = null;
    }
  });
});
