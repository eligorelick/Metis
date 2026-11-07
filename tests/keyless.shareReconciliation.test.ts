import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import type { CompanyFacts, FactPoint } from "@/edgar/xbrl";
import { runStageB } from "@/pipeline/compute";
import { buildDataBundle } from "@/pipeline/dataBundle";
import { buildDataOnlyReport } from "@/pipeline/jobRunner";
import { applyKeylessFallbacks, guardVendorShareFields, type KeylessInputs } from "@/pipeline/keyless";
import { assembleContextPayload, serializePayloadForPrompt } from "@/pipeline/stageC/payload";
import type { DataBundle } from "@/pipeline/types";
import { createEdgarClient } from "@/providers/edgar";
import { createFmpClient, type FmpIncomeStatementRow, type FmpPayload } from "@/providers/fmp";
import { makeLimiter } from "@/providers/http";
import type { VendorSplitEvidence } from "@/providers/splitEvents";
import type { YahooClient } from "@/providers/yahoo";
import { reportToMarkdown } from "@/report/export/markdown";
import type { FetchResult } from "@/types/core";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { withIssuerFacts } from "./helpers/confirmedIssuer";
import { withFilerShareUnits } from "@/pipeline/shareUnits";

const AS_OF = "2026-11-01";
const FETCHED = `${AS_OF}T22:38:31.000Z`;
const CIK = "0001579878";
const noSplits: VendorSplitEvidence = { status: "retrieved", source: "fixture:split-history", events: [], coverage: [{ from: "2020-01-01", to: AS_OF }] };
const tags = { eps: "EarningsPerShareBasic", epsDiluted: "EarningsPerShareDiluted", weightedAverageShsOut: "WeightedAverageNumberOfSharesOutstandingBasic", weightedAverageShsOutDil: "WeightedAverageNumberOfDilutedSharesOutstanding", revenue: "Revenues", netIncome: "NetIncomeLoss" } as const;

function fiscalRow(date: string, period: string, values: Partial<FmpIncomeStatementRow> = {}): FmpIncomeStatementRow {
  return { date, period, fiscalYear: date.slice(0, 4), cik: CIK, symbol: "FIG", reportedCurrency: "USD", revenue: 228_199_000, netIncome: 8_611_000, ...values };
}

function factsFor(rows: FmpIncomeStatementRow[]): CompanyFacts {
  const concepts: Record<string, { units: Record<string, FactPoint[]> }> = {};
  for (const row of rows) for (const [field, tag] of Object.entries(tags)) {
    const value = row[field];
    if (typeof value !== "number") continue;
    const unit = field.startsWith("eps") ? "USD/shares" : field.startsWith("weighted") ? "shares" : "USD";
    const start = `${row.date!.slice(0, 4)}-${row.period === "FY" ? "01" : ({ Q1: "01", Q2: "04", Q3: "07", Q4: "10" } as Record<string, string>)[row.period!]}-01`;
    const point: FactPoint = { start, end: row.date!, val: value, filed: "2026-05-14", accn: `0001628280-26-${row.date!.replaceAll("-", "").slice(2)}`, form: row.period === "FY" ? "10-K" : "10-Q", fy: Number(row.fiscalYear), fp: row.period! };
    ((concepts[tag] ??= { units: {} }).units[unit] ??= []).push(point);
  }
  concepts.Assets = { units: { USD: rows.map(row => ({ end: row.date!, val: 2_000_000_000, filed: "2026-05-14", accn: `0001628280-26-${row.date!.replaceAll("-", "").slice(2)}`,
    form: row.period === "FY" ? "10-K" : "10-Q", fy: Number(row.fiscalYear), fp: row.period! })) } };
  return { cik: 1579878, entityName: "Figma, Inc.", facts: { "us-gaap": concepts, dei: {} } };
}

function built(facts: CompanyFacts, splitEvidence = noSplits) {
  return buildStatementsFromCompanyFacts(facts, { symbol: "FIG", cik: CIK, asOf: AS_OF, factsObservedAt: FETCHED, annualPeriods: 10, quarterlyPeriods: 24, vendorSplits: splitEvidence });
}

const quarter = fiscalRow("2025-03-31", "Q1", { eps: -2.05, epsDiluted: -2.05, weightedAverageShsOut: 474_811_000, weightedAverageShsOutDil: 474_811_000 });
const primaryQuarter = { ...quarter, eps: 0.04, epsDiluted: 0.04, weightedAverageShsOut: 231_076_000, weightedAverageShsOutDil: 231_076_000, netIncome: 44_882_000 };

describe("vendor EPS and weighted shares with independently comparable primary facts", () => {
  it("reconciles filed quarter-specific loss EPS as well as its share denominator", () => {
    const filed = { ...quarter, netIncome: -200e6, eps: -2, epsDiluted: -2, weightedAverageShsOut: 100e6, weightedAverageShsOutDil: 100e6 };
    const facts = factsFor([filed]);
    const primary = built(facts);
    const vendor = { ...filed, epsDiluted: -1.8, weightedAverageShsOutDil: 111e6 };
    const out = guardVendorShareFields([vendor], primary.incomeQuarterly.rows, primary.splits, AS_OF,
      { companyFacts: facts, registrantTickers: ["FIG"], isAdr: false, fiscalYearEnd: "1231", period: "quarter", reconcileFiled: true });
    expect(out.rows[0]).toMatchObject({ epsDiluted: -2, weightedAverageShsOutDil: 100e6 });
    expect(out.rows[0]?.fieldConflicts?.epsDiluted).toMatchObject({ usable: true, vendorValue: -1.8, secValue: -2 });
    const guarded = guardVendorShareFields([vendor], primary.incomeQuarterly.rows, primary.splits, AS_OF,
      { companyFacts: facts, registrantTickers: ["FIG"], isAdr: false, fiscalYearEnd: "1231", period: "quarter" });
    expect(guardVendorShareFields(guarded.rows, [], primary.splits, AS_OF,
      { companyFacts: facts, registrantTickers: ["FIG"], isAdr: false, fiscalYearEnd: "1231", period: "quarter", reconcileFiled: true }).rows[0]?.epsDiluted).toBe(-2);
  });
  it("corrects a quarter count that actually matches the filed nine-month count below the old 3% band", () => {
    const row = fiscalRow("2026-09-30", "Q3", { weightedAverageShsOutDil: 7312.5e6 });
    const facts = factsFor([{ ...row, weightedAverageShsOutDil: 7222.2e6 }]);
    const c = facts.facts["us-gaap"]![tags.weightedAverageShsOutDil] as { units: { shares: FactPoint[] } };
    c.units.shares.push({ ...c.units.shares[0]!, start: "2026-01-01", val: 7312.5e6 });
    const primary = built(facts);
    const out = guardVendorShareFields([row], primary.incomeQuarterly.rows, primary.splits, AS_OF,
      { companyFacts: facts, registrantTickers: ["FIG"], isAdr: false, fiscalYearEnd: "1231", period: "quarter", reconcileFiled: true });
    expect(out.rows[0]?.weightedAverageShsOutDil).toBe(7222.2e6);
    expect(out.rows[0]?.fieldProvenance?.weightedAverageShsOutDil?.periodStart).toBe("2026-07-01");
    expect(out.reconciled[0]?.reason).toMatch(/different.*period|year.to.date/i);
    const b = withIssuerFacts(completeCurrencyBundle({}), facts);
    b.builtAt = FETCHED;
    if (!b.profile.ok || !b.statements.incomeQuarterly.ok) throw Error("fixture");
    b.profile.value.data.rows[0]!.isAdr = false;
    b.edgar.registrant = { cik10: CIK, name: "Example", tickers: ["FIG"], sic: null, sicDescription: null,
      exchanges: [], fiscalYearEnd: "1231", forms: ["10-Q"], stateOfIncorporation: null };
    b.edgar.shareBasis = { splits: primary.splits, basisDay: AS_OF };
    b.statements.incomeQuarterly.value.data.rows = [row];
    const original = JSON.stringify(b);
    const replay = withFilerShareUnits(b).statements.incomeQuarterly;
    expect(replay.ok && replay.value.data.rows[0]?.weightedAverageShsOutDil).toBe(7222.2e6);
    expect(JSON.stringify(b)).toBe(original);
  });
  it("uses the unique same-filing annual interval for an off-calendar count", () => {
    const row = fiscalRow("2025-12-27", "FY", { weightedAverageShsOutDil: 4856e6 });
    const facts = factsFor([{ ...row, weightedAverageShsOutDil: 4530e6 }]);
    for (const concept of Object.values(facts.facts["us-gaap"]!)) for (const points of Object.values((concept as { units: Record<string, FactPoint[]> }).units)) {
      for (const p of points) if (p.start) p.start = "2024-12-29";
    }
    const primary = built(facts);
    const out = guardVendorShareFields([row], primary.incomeAnnual.rows, primary.splits, AS_OF,
      { companyFacts: facts, registrantTickers: ["FIG"], isAdr: false, fiscalYearEnd: "1226", period: "annual", reconcileFiled: true });
    expect(out.rows[0]?.weightedAverageShsOutDil).toBe(4530e6);
  });
  it("does not treat normal count rounding as a conflict in filed reconciliation", () => {
    const row = { ...primaryQuarter, weightedAverageShsOutDil: 231080000 };
    const facts = factsFor([primaryQuarter]);
    const primary = built(facts);
    const out = guardVendorShareFields([row], primary.incomeQuarterly.rows, primary.splits, AS_OF,
      { companyFacts: facts, registrantTickers: ["FIG"], isAdr: false, fiscalYearEnd: "1231", period: "quarter", reconcileFiled: true });
    expect(out.rows[0]?.weightedAverageShsOutDil).toBe(231080000);
    expect(out.withheld).toEqual([]);
  });
  it("does not transplant a filed count with an unresolved thousand/million scaling error", () => {
    const facts = factsFor([{ ...primaryQuarter, weightedAverageShsOutDil: 231.076 }]);
    const primary = built(facts);
    const out = guardVendorShareFields([primaryQuarter], primary.incomeQuarterly.rows, primary.splits, AS_OF,
      { companyFacts: facts, registrantTickers: ["FIG"], isAdr: false, fiscalYearEnd: "1231", period: "quarter", reconcileFiled: true });
    expect(out.rows[0]?.weightedAverageShsOutDil).toBeUndefined();
    expect(out.rows[0]?.fieldConflicts?.weightedAverageShsOutDil?.secValue).toBe(231.076);
  });
  it("keeps already guarded split-adjusted history unchanged during filed reconciliation", () => {
    const facts = factsFor([primaryQuarter]);
    const primary = built(facts);
    const splits = { ...primary.splits, events: [{ date: "2026-06-01", ratio: 10, tagged: 10, evidence: 10,
      contextDates: ["2026-06-01"], announced: "2026-05-01", firstAdjustedSession: "2026-06-01", sessionWindow: { from: "2026-06-01", to: "2026-06-01" },
      legalFrom: "2026-06-01", sources: ["edgar", "vendor"] as ("edgar" | "vendor")[] }] };
    const row = { ...primaryQuarter, epsDiluted: 0.004, weightedAverageShsOutDil: 2310760000 };
    const out = guardVendorShareFields([row], [], splits, AS_OF,
      { companyFacts: facts, registrantTickers: ["FIG"], isAdr: false, fiscalYearEnd: "1231", period: "quarter", reconcileFiled: true });
    expect(out.rows).toEqual([row]);
  });
  it("checks IFRS EPS in native currency per ADS on an established ratio", () => {
    const row = fiscalRow("2025-12-31", "FY", { reportedCurrency: "TWD", epsDiluted: 331.25 });
    const facts: CompanyFacts = { cik: Number(CIK), entityName: "Foreign", facts: { "ifrs-full": {
      Revenue: { units: { TWD: [{ start: "2025-01-01", end: row.date!, val: 1000, filed: "2026-04-01", form: "20-F", accn: "0001579878-26-000001", fy: 2025, fp: "FY" }] } },
      DilutedEarningsLossPerShare: { units: { "TWD/shares": [{ start: "2025-01-01", end: row.date!, val: 65.47, filed: "2026-04-01", form: "20-F", accn: "0001579878-26-000001", fy: 2025, fp: "FY" }] } },
    } } };
    const primary = built(facts);
    const out = guardVendorShareFields([row], [], primary.splits, AS_OF,
      { companyFacts: facts, registrantTickers: ["FIG"], isAdr: true, fiscalYearEnd: "1231", period: "annual", reconcileFiled: true, ordinarySharesPerQuotedUnit: 5 });
    expect(out.rows[0]?.epsDiluted).toBeCloseTo(327.35, 8);
    expect(out.rows[0]?.fieldProvenance?.epsDiluted?.tags).toContain("ifrs-full/DilutedEarningsLossPerShare");
  });
  it("withholds unverified ADR EPS without an established quoted-unit ratio", () => {
    const facts = factsFor([primaryQuarter]), primary = built(facts);
    const out = guardVendorShareFields([quarter], [], primary.splits, AS_OF,
      { companyFacts: facts, registrantTickers: ["FIG"], isAdr: true, fiscalYearEnd: "1231", period: "quarter", reconcileFiled: true });
    expect(out.rows[0]?.epsDiluted).toBeUndefined();
    expect(out.withheld.find(r => r.field === "epsDiluted")?.reason).toMatch(/ratio.*not established/i);
  });
  it("qualifies an ADR EPS period absent from filed facts even with an established ratio", () => {
    const facts = factsFor([primaryQuarter]), primary = built(facts);
    const row = { ...quarter, date: "2025-12-31", period: "FY", epsDiluted: 2 };
    const out = guardVendorShareFields([row], [], primary.splits, AS_OF,
      { companyFacts: facts, registrantTickers: ["FIG"], isAdr: true, fiscalYearEnd: "1231", period: "annual", reconcileFiled: true, ordinarySharesPerQuotedUnit: 5 });
    expect(out.rows[0]?.epsDiluted).toBeUndefined();
    expect(out.withheld.find(r => r.field === "epsDiluted")?.reason).toMatch(/same.period.*not established/i);
  });
  it.each([{ registrantTickers: ["BRK.A", "BRK.B"] }, { registrantTickers: [] }, { registrantTickers: undefined }])("keeps unequal or unestablished share units (%j)", ({ registrantTickers }) => {
    const facts = factsFor([{ ...primaryQuarter, eps: 150, epsDiluted: 150, weightedAverageShsOutDil: 1000000 }]);
    const primary = built(facts);
    const row = { ...quarter, symbol: "BRK.B", eps: 0.1, epsDiluted: 0.1, weightedAverageShsOutDil: 1500000000 };
    const out = guardVendorShareFields([row], primary.incomeQuarterly.rows, primary.splits, AS_OF,
      { companyFacts: facts, registrantTickers, isAdr: false, fiscalYearEnd: "1231", period: "quarter" });
    expect(out.rows).toEqual([row]);
    expect(out.withheld).toEqual([]);
  });

  // A registrant whose SEC ticker list names several symbols (FIGR lists FIGR
  // and FGRS; banks list preferred series) is compared once a comparable period
  // shows the vendor counts shares in the filer's unit.
  const multiTicker = (facts: CompanyFacts) => ({ companyFacts: facts, registrantTickers: ["FIGR", "FGRS"], isAdr: false, fiscalYearEnd: "1231", period: "quarter" as const });

  it("compares a multi-ticker registrant once one period establishes the vendor's share unit", () => {
    const current = fiscalRow("2026-03-31", "Q1", { eps: -0.27, epsDiluted: -0.27, weightedAverageShsOut: 523_485_000, weightedAverageShsOutDil: 523_485_000 });
    const facts = factsFor([primaryQuarter, current]);
    const primary = built(facts);
    const result = guardVendorShareFields([quarter, current], primary.incomeQuarterly.rows, primary.splits, AS_OF, multiTicker(facts));
    expect(result.rows[1]).toBe(current);
    expect(result.rows[0]?.epsDiluted).toBeUndefined();
    expect(result.rows[0]?.weightedAverageShsOutDil).toBeUndefined();
    expect(result.rows[0]?.fieldConflicts?.epsDiluted).toMatchObject({ vendorValue: -2.05, secValue: 0.04, usable: false });
    expect(result.withheld).toHaveLength(4);
  });

  it.each([[1.02, 2], [1.04, 0]])("establishes a multi-ticker share unit only within the existing tolerance: vendor counts at %sx withhold %s field(s)", (ratio, refused) => {
    const facts = factsFor([primaryQuarter]);
    const primary = built(facts);
    const row = { ...quarter, weightedAverageShsOut: Math.round(231_076_000 * ratio), weightedAverageShsOutDil: Math.round(231_076_000 * ratio) };
    const result = guardVendorShareFields([row], primary.incomeQuarterly.rows, primary.splits, AS_OF, multiTicker(facts));
    expect(result.withheld.map(entry => entry.field)).toEqual(["eps", "epsDiluted"].slice(0, refused));
    if (refused === 0) expect(result.rows[0]).toBe(row);
  });

  it("does not establish a multi-ticker share unit from a period the filer does not state", () => {
    const facts = factsFor([primaryQuarter]);
    const primary = built(facts);
    const unfiled = fiscalRow("2025-06-30", "Q2", { weightedAverageShsOut: 231_076_000, weightedAverageShsOutDil: 231_076_000 });
    const result = guardVendorShareFields([quarter, unfiled], primary.incomeQuarterly.rows, primary.splits, AS_OF, multiTicker(facts));
    expect(result.rows).toEqual([quarter, unfiled]);
    expect(result.withheld).toEqual([]);
  });

  it.each([[0.035, 0.04], [0.005, 0.01], [-0.004, 0], [0.04, 0.06]])("rounds at the coarser cent precision: filed %s vendor %s", (filed, vendor) => {
    const facts = factsFor([{ ...primaryQuarter, epsDiluted: filed }]);
    const primary = built(facts);
    const out = guardVendorShareFields([{ ...primaryQuarter, epsDiluted: vendor }], primary.incomeQuarterly.rows, primary.splits, AS_OF,
      { companyFacts: facts, registrantTickers: ["FIG"], isAdr: false, fiscalYearEnd: "1231", period: "quarter" });
    expect(out.rows[0]?.epsDiluted).toBe(filed === 0.04 ? undefined : vendor);
  });

  it("identifies a vendor value superseded by a later exact-interval filing", () => {
    const facts = factsFor([{ ...primaryQuarter, epsDiluted: 0.13 }]);
    const concept = facts.facts["us-gaap"]![tags.epsDiluted] as { units: Record<string, FactPoint[]> };
    concept.units["USD/shares"]!.push({ ...concept.units["USD/shares"]![0]!, val: 0.10, filed: "2025-05-10", accn: "0001628280-25-000001" });
    const primary = built(facts);
    const out = guardVendorShareFields([{ ...primaryQuarter, epsDiluted: 0.10 }], primary.incomeQuarterly.rows, primary.splits, AS_OF,
      { companyFacts: facts, registrantTickers: ["FIG"], isAdr: false, fiscalYearEnd: "1231", period: "quarter" });
    expect(out.rows[0]?.epsDiluted).toBeUndefined();
    expect(out.rows[0]?.fieldConflicts?.epsDiluted?.reason).toMatch(/matches an earlier filing.*superseded by a later filing/);
    expect(out.withheld.find(entry => entry.field === "epsDiluted")?.reason).not.toContain("differs from");
  });

  it("rejects FIG's opposite-sign Q1 EPS and inflated denominator without requiring a split", () => {
    const facts = factsFor([primaryQuarter]);
    const primary = built(facts);
    const before = structuredClone({ quarter, facts, primary });
    expect(primary.incomeQuarterly.rows[0]).toMatchObject({ date: "2025-03-31", period: "Q1", fiscalYear: "2025", epsDiluted: 0.04 });
    const result = guardVendorShareFields([quarter], primary.incomeQuarterly.rows, primary.splits, AS_OF,
      { companyFacts: facts, registrantTickers: ["FIG"], isAdr: false, fiscalYearEnd: "1231", period: "quarter" });
    expect(result.rows[0]?.epsDiluted).toBeUndefined();
    expect(result.rows[0]?.weightedAverageShsOutDil).toBeUndefined();
    expect(result.rows[0]?.netIncome).toBe(8_611_000); // Common-basic allocation is not consolidated profit.
    expect(result.rows[0]?.fieldConflicts?.epsDiluted).toMatchObject({ vendorValue: -2.05, secValue: 0.04, usable: false,
      secEvidence: { unit: "USD/shares", periodStart: "2025-01-01", periodEnd: "2025-03-31" } });
    expect(result.withheld).toHaveLength(4);
    expect({ quarter, facts, primary }).toEqual(before);
  });

  it.each([
    ["2023-12-31", 487_460_903, 187_207_000],
    ["2024-12-31", 448_206_000, 195_612_000],
    ["2025-12-31", 511_036_000, 337_044_000],
  ])("rejects the independently filed annual denominator conflict for %s", (date, vendor, filed) => {
    const row = fiscalRow(date, "FY", { weightedAverageShsOutDil: vendor });
    const facts = factsFor([{ ...row, weightedAverageShsOutDil: filed }]);
    const primary = built(facts);
    const result = guardVendorShareFields([row], primary.incomeAnnual.rows, primary.splits, AS_OF,
      { companyFacts: facts, registrantTickers: ["FIG"], isAdr: false, fiscalYearEnd: "1231", period: "annual" });
    expect(result.rows[0]?.weightedAverageShsOutDil).toBeUndefined();
    expect(result.rows[0]?.fieldConflicts?.weightedAverageShsOutDil).toMatchObject({ vendorValue: vendor, secValue: filed, usable: false });
  });

  it("checks a directly filed quarter even when no statement anchor can establish a whole row", () => {
    const facts = factsFor([primaryQuarter]);
    delete facts.facts["us-gaap"]!.Assets;
    // L3: revenue now independently anchors income; remove both anchors to
    // retain this test's independent per-share evidence trigger.
    delete facts.facts["us-gaap"]!.Revenues;
    const primary = built(facts);
    expect(primary.incomeQuarterly.rows).toEqual([]);
    const result = guardVendorShareFields([quarter], primary.incomeQuarterly.rows, primary.splits, AS_OF,
      { companyFacts: facts, registrantTickers: ["FIG"], isAdr: false, fiscalYearEnd: "1231", period: "quarter" });
    expect(result.rows[0]?.epsDiluted).toBeUndefined();
    expect(result.rows[0]?.fieldConflicts?.epsDiluted).toMatchObject({ vendorValue: -2.05, secValue: 0.04 });
    expect(result.rows[0]?.weightedAverageShsOutDil).toBeUndefined();
  });

  it("treats padded and unpadded representations of the confirmed CIK as one issuer", () => {
    const facts = factsFor([primaryQuarter]);
    const primary = built(facts);
    const result = guardVendorShareFields([{ ...quarter, cik: "1579878" }], primary.incomeQuarterly.rows, primary.splits, AS_OF,
      { companyFacts: facts, registrantTickers: ["FIG"], isAdr: false, fiscalYearEnd: "1231", period: "quarter" });
    expect(result.rows[0]?.epsDiluted).toBeUndefined();
    expect(result.rows[0]?.fieldConflicts?.epsDiluted?.secValue).toBe(0.04);
  });

  it("retains FIG's matching current 2026 quarter rather than suppressing the whole vendor history", () => {
    const row = fiscalRow("2026-03-31", "Q1", { eps: -0.27, epsDiluted: -0.27, weightedAverageShsOut: 523_485_000, weightedAverageShsOutDil: 523_485_000 });
    const facts = factsFor([row]);
    const primary = built(facts);
    const result = guardVendorShareFields([row], primary.incomeQuarterly.rows, primary.splits, AS_OF,
      { companyFacts: facts, registrantTickers: ["FIG"], isAdr: false, fiscalYearEnd: "1231", period: "quarter" });
    expect(result.rows[0]).toBe(row);
    expect(result.withheld).toEqual([]);
  });

  it("keeps independent matching fields and normal rounding, without filling a vendor gap", () => {
    const row = { ...quarter, eps: undefined, epsDiluted: 0.04, weightedAverageShsOutDil: 231_080_000 };
    const facts = factsFor([primaryQuarter]);
    const primary = built(facts);
    const result = guardVendorShareFields([row], primary.incomeQuarterly.rows, primary.splits, AS_OF,
      { companyFacts: facts, registrantTickers: ["FIG"], isAdr: false, fiscalYearEnd: "1231", period: "quarter" });
    expect(result.rows[0]?.eps).toBeUndefined();
    expect(result.rows[0]?.epsDiluted).toBe(0.04);
    expect(result.rows[0]?.weightedAverageShsOutDil).toBe(231_080_000);
    expect(result.rows[0]?.weightedAverageShsOut).toBeUndefined();
  });

  it.each([[0.0017, 0], [0.007, 0.01], [-0.0017, 0]] as const)("does not invent a primary EPS conflict from rounding %s to %s without a split", (vendor, filed) => {
    const row = { ...quarter, eps: vendor, epsDiluted: vendor };
    const facts = factsFor([{ ...primaryQuarter, eps: filed, epsDiluted: filed }]);
    const primary = built(facts);
    const result = guardVendorShareFields([row], primary.incomeQuarterly.rows, primary.splits, AS_OF,
      { companyFacts: facts, registrantTickers: ["FIG"], isAdr: false, fiscalYearEnd: "1231", period: "quarter" });
    expect(result.rows[0]?.eps).toBe(vendor);
    expect(result.rows[0]?.epsDiluted).toBe(vendor);
    expect(result.withheld.filter(field => field.field === "eps" || field.field === "epsDiluted")).toEqual([]);
    // A near-zero EPS does not excuse the independently wrong share denominator.
    expect(result.rows[0]?.weightedAverageShsOutDil).toBeUndefined();
  });

  it.each([
    ["different issuer", { cik: "0000000042" }, {}],
    ["different currency", { reportedCurrency: "EUR" }, {}],
    ["unknown currency", { reportedCurrency: undefined }, {}],
    ["different fiscal quarter", { period: "Q2" }, {}],
    ["different explicit start", { periodStart: "2024-01-01" }, {}],
    ["unknown fiscal calendar", {}, { fiscalYearEnd: null }],
    ["ADR units", {}, { isAdr: true }],
    ["unclassified share units", {}, { isAdr: null }],
  ])("does not claim a contradiction from %s", (_name, edits, options) => {
    const row = { ...quarter, ...edits };
    const facts = factsFor([primaryQuarter]);
    const primary = built(facts);
    const result = guardVendorShareFields([row], primary.incomeQuarterly.rows, primary.splits, AS_OF,
      { companyFacts: facts, registrantTickers: ["FIG"], isAdr: false, fiscalYearEnd: "1231", period: "quarter", ...options });
    expect(result.rows).toEqual([row]);
    expect(result.withheld).toEqual([]);
  });

  it("retains vendor values when no primary coverage exists", () => {
    const facts = factsFor([{ ...primaryQuarter, eps: undefined, epsDiluted: undefined, weightedAverageShsOut: undefined, weightedAverageShsOutDil: undefined }]);
    const primary = built(facts);
    const result = guardVendorShareFields([quarter], primary.incomeQuarterly.rows, primary.splits, AS_OF,
      { companyFacts: facts, registrantTickers: ["FIG"], isAdr: false, fiscalYearEnd: "1231", period: "quarter" });
    expect(result.rows).toEqual([quarter]);
    expect(result.withheld).toEqual([]);
  });

  it.each(["ytd", "unit", "future", "uncovered-basis"] as const)("keeps the EPS when direct primary evidence has %s incompatibility", kind => {
    const facts = factsFor([primaryQuarter]);
    const concept = facts.facts["us-gaap"]![tags.epsDiluted] as { units: Record<string, FactPoint[]> };
    if (kind === "ytd") concept.units["USD/shares"]![0]!.start = "2024-01-01";
    if (kind === "unit") { concept.units["EUR/shares"] = concept.units["USD/shares"]!; delete concept.units["USD/shares"]; }
    if (kind === "future") concept.units["USD/shares"]![0]!.filed = "2026-11-02";
    const primary = built(facts, kind === "uncovered-basis" ? { ...noSplits, coverage: [{ from: "2026-06-01", to: AS_OF }] } : noSplits);
    const result = guardVendorShareFields([quarter], primary.incomeQuarterly.rows, primary.splits, AS_OF,
      { companyFacts: facts, registrantTickers: ["FIG"], isAdr: false, fiscalYearEnd: "1231", period: "quarter" });
    expect(result.rows[0]?.epsDiluted).toBe(-2.05);
    expect(result.rows[0]?.fieldConflicts?.epsDiluted).toBeUndefined();
  });

  it("does not resolve ambiguous same-filing SEC facts by whichever one happened to be last", () => {
    const facts = factsFor([primaryQuarter]);
    const concept = facts.facts["us-gaap"]![tags.epsDiluted] as { units: Record<string, FactPoint[]> };
    concept.units["USD/shares"]!.push({ ...concept.units["USD/shares"]![0]!, val: -2.05 });
    const primary = built(facts);
    const result = guardVendorShareFields([quarter], primary.incomeQuarterly.rows, primary.splits, AS_OF,
      { companyFacts: facts, registrantTickers: ["FIG"], isAdr: false, fiscalYearEnd: "1231", period: "quarter" });
    expect(result.rows[0]?.epsDiluted).toBe(-2.05);
    expect(result.rows[0]?.weightedAverageShsOutDil).toBeUndefined();
  });
});

function rowsOf(member: FetchResult<FmpPayload<FmpIncomeStatementRow>>) { return member.ok ? member.value.data.rows : []; }

function producerFixture() {
  const bundle = completeCurrencyBundle({ symbol: "FIG", debt: 300 });
  const rawRows: FmpIncomeStatementRow[] = [];
  for (const member of ["incomeAnnual", "incomeQuarterly"] as const) {
    const result = bundle.statements[member];
    if (!result.ok) throw new Error("income fixture unavailable");
    result.value.data.rows = result.value.data.rows.map(row => {
      const period = member === "incomeAnnual" ? "FY" : `Q${Math.ceil(Number(row.date!.slice(5, 7)) / 3)}`;
      const scoped = fiscalRow(row.date!, period, row);
      rawRows.push({ ...scoped, eps: row.epsDiluted, weightedAverageShsOut: row.weightedAverageShsOutDil });
      return { ...scoped, eps: (row.epsDiluted as number) * 4, epsDiluted: (row.epsDiluted as number) * 4,
        weightedAverageShsOut: (row.weightedAverageShsOutDil as number) * 4, weightedAverageShsOutDil: (row.weightedAverageShsOutDil as number) * 4 };
    });
  }
  if (bundle.profile.ok) Object.assign(bundle.profile.value.data.rows[0]!, { symbol: "FIG", cik: CIK, isAdr: false, instrumentType: "EQUITY" });
  if (bundle.quote.ok) {
    bundle.quote.value.asOf = "2026-10-30";
    bundle.quote.value.data.rows[0]!.timestamp = Date.parse("2026-10-30T20:00:00Z") / 1000;
  }
  const facts = factsFor(rawRows);
  const failed = async () => ({ ok: false as const, gap: { field: "fixture", reason: "no external reads", severity: "info" as const } });
  const inputs: KeylessInputs = { symbol: "FIG", today: AS_OF, eodFrom: "2021-01-01", sectorEtfSymbol: null, fmpKeyless: false, statementSource: "fmp", edgarConfirmedIssuer: true,
    annualPeriods: 10, quarterlyPeriods: 24, now: () => new Date(FETCHED), resolveSectorEtf: () => null,
    fmp: { ...bundle.statements, profile: bundle.profile, quote: bundle.quote, eodPrices: bundle.eodPrices,
      spy: bundle.benchmarkPrices.spy, sectorEtf: bundle.benchmarkPrices.sectorEtf, enterpriseValues: bundle.enterpriseValues, marketCapHistory: bundle.marketCapHistory, sharesFloat: bundle.sharesFloat },
    edgar: { cik: { ok: true, value: { data: { cik: 1579878, cik10: CIK, ticker: "FIG", title: "Figma, Inc." }, source: "edgar", endpoint: "fixture:issuer", asOf: AS_OF, fetchedAt: FETCHED } },
      registrant: { cik10: CIK, name: "Figma, Inc.", tickers: ["FIG"], exchanges: ["NYSE"], sic: "7372", sicDescription: "Software", fiscalYearEnd: "1231", stateOfIncorporation: "DE", forms: ["10-K", "10-Q"] },
      companyFacts: { ok: true, value: { data: facts, source: "edgar", endpoint: "fixture:companyfacts", asOf: AS_OF, fetchedAt: FETCHED } } },
    yahoo: { dailyHistory: failed, meta: failed, quote: failed, splitHistory: async () => ({ ok: true, value: { data: noSplits, source: "yahoo", endpoint: "fixture:split-history", asOf: AS_OF, fetchedAt: FETCHED } }) } as unknown as YahooClient };
  return { bundle, inputs };
}

describe("the producer's refused share fields reach calculation, grades, payload and exports", () => {
  it("does not rebuild the rejected EPS or share trend in later stages", async () => {
    const { bundle, inputs } = producerFixture();
    const before = structuredClone(bundle);
    const produced = await applyKeylessFallbacks(inputs);
    const admitted: DataBundle = { ...bundle, gaps: [...bundle.gaps, ...produced.gaps], statements: { ...bundle.statements,
      incomeAnnual: produced.members.incomeAnnual, incomeQuarterly: produced.members.incomeQuarterly } };
    expect(rowsOf(admitted.statements.incomeAnnual).every(row => row.weightedAverageShsOutDil === undefined)).toBe(true);
    expect(rowsOf(admitted.statements.incomeQuarterly).every(row => row.epsDiluted === undefined)).toBe(true);
    const control = runStageB(bundle);
    expect(control.capital.shareCount.trendPct).not.toBeNull();
    expect(control.scores.aspects.leadership.drivers.some(driver => driver.source.endsWith("shareCountTrend") && driver.value !== null)).toBe(true);
    expect(control.growth.epsDilutedCagrs.some(point => point.cagrPct !== null)).toBe(true);
    const computed = runStageB(admitted);
    if (control.valuation.kind !== "dcf" || computed.valuation.kind !== "dcf") throw new Error("fixture must use the DCF route");
    expect(control.valuation.dcf?.perShare).toEqual(expect.any(Number));
    expect(computed.capital.shareCount.trendPct).toBeNull();
    expect(computed.growth.epsDilutedCagrs.every(point => point.cagrPct === null)).toBe(true);
    expect(computed.valuation.dcf?.perShare ?? null).toBeNull();
    expect(computed.scores.aspects.leadership.drivers.some(driver => driver.source.endsWith("shareCountTrend"))).toBe(false);
    expect(computed.scores.aspects.leadership.signals?.some(signal => signal.id === "shareCountTrend")).toBe(false);
    expect(computed.growth.revenueCagrs).toEqual(control.growth.revenueCagrs);
    expect(computed.capital.fcf).toEqual(control.capital.fcf);
    const validation = { checks: [], flags: [], gaps: [] };
    const payload = assembleContextPayload(admitted, computed, validation);
    expect((payload.provenanceRegistry ?? []).filter(record => /epsDiluted|weightedAverageShsOut/.test(record.id))).toEqual([]);
    expect(serializePayloadForPrompt(payload)).not.toMatch(/diluted EPS[^\n]*=1\.8/);
    const report = buildDataOnlyReport({ symbol: "FIG", companyName: "Figma fixture", generatedAt: FETCHED, model: "none", costUsd: 0,
      bundle: admitted, computed, validation, costBreakdown: [], reason: "offline reconciliation fixture" });
    expect(report.scores?.aspects.leadership.drivers.some(driver => driver.source.endsWith("shareCountTrend"))).toBe(false);
    expect(report.fundamentals.growthTable.some(row => row.label === "Diluted EPS CAGR")).toBe(false);
    expect(reportToMarkdown(report)).not.toContain("Diluted EPS CAGR");
    expect(produced.gaps.some(gap => /vendor.*filed|vendor.*filer/i.test(gap.reason))).toBe(true);
    expect(bundle).toEqual(before);
  });

  it("never imports another issuer's primary observations through the producer", async () => {
    const { inputs } = producerFixture();
    inputs.edgarConfirmedIssuer = false;
    const result = await applyKeylessFallbacks(inputs);
    expect(result.members.incomeAnnual).toBe(inputs.fmp.incomeAnnual);
    expect(result.members.incomeQuarterly).toBe(inputs.fmp.incomeQuarterly);
  });

  it("checks the companyfacts identity against the confirmed CIK before comparing a vendor row", async () => {
    const { inputs } = producerFixture();
    if (!inputs.edgar.companyFacts.ok) throw new Error("missing fixture facts");
    inputs.edgar.companyFacts.value.data.cik = 42;
    const result = await applyKeylessFallbacks(inputs);
    expect(result.members.incomeAnnual).toBe(inputs.fmp.incomeAnnual);
    expect(result.members.incomeQuarterly).toBe(inputs.fmp.incomeQuarterly);
  });

  // FIGR's vendor FY2025 counts are twice the 10-K's while its 2026 quarters match the 10-Qs.
  it("lets a quarterly series that shows a multi-ticker registrant's share unit govern the annual rows", async () => {
    const { inputs } = producerFixture();
    inputs.edgar.registrant = { ...inputs.edgar.registrant!, tickers: ["FIGR", "FGRS"] };
    const quarterly = inputs.fmp.incomeQuarterly;
    if (!quarterly.ok) throw new Error("income fixture unavailable");
    quarterly.value.data.rows = quarterly.value.data.rows.map(row => ({ ...row, eps: (row.eps as number) / 4, epsDiluted: (row.epsDiluted as number) / 4,
      weightedAverageShsOut: (row.weightedAverageShsOut as number) / 4, weightedAverageShsOutDil: (row.weightedAverageShsOutDil as number) / 4 }));
    const result = await applyKeylessFallbacks(inputs);
    expect(result.members.incomeQuarterly).toBe(quarterly);
    expect(rowsOf(result.members.incomeAnnual).every(row => row.epsDiluted === undefined && row.weightedAverageShsOutDil === undefined)).toBe(true);
  });

  it("compares neither series when none shows a multi-ticker registrant's share unit", async () => {
    const { inputs } = producerFixture();
    inputs.edgar.registrant = { ...inputs.edgar.registrant!, tickers: ["FIGR", "FGRS"] };
    const result = await applyKeylessFallbacks(inputs);
    expect(result.members.incomeAnnual).toBe(inputs.fmp.incomeAnnual);
    expect(result.members.incomeQuarterly).toBe(inputs.fmp.incomeQuarterly);
  });

  it("carries refusals through the real bundle builder and its later enrichment", async () => {
    const { bundle, inputs } = producerFixture();
    const unavailable = async () => new Response("offline fixture", { status: 404 });
    const fmp = createFmpClient({ apiKey: "OFFLINE-FIXTURE", limiter: makeLimiter(1e6, 1e6), now: inputs.now, sleep: async () => {},
      fetchImpl: async input => {
        const url = new URL(String(input));
        const endpoint = url.pathname.split("/").at(-1);
        const member = endpoint === "income-statement" ? inputs.fmp[url.searchParams.get("period") === "annual" ? "incomeAnnual" : "incomeQuarterly"]
          : endpoint === "profile" ? bundle.profile : endpoint === "quote" ? bundle.quote : null;
        return new Response(JSON.stringify(member?.ok ? member.value.data.rows : []));
      } });
    const edgar = createEdgarClient({ transport: { fetchText: async url => {
      const raw = url.includes("company_tickers") ? { 0: { cik_str: 1579878, ticker: "FIG", title: "Figma, Inc." } }
        : url.includes("companyfacts") ? inputs.edgar.companyFacts.ok ? inputs.edgar.companyFacts.value.data : null
        : url.includes("submissions") ? { cik: "1579878", name: "Figma, Inc.", sic: "7372", fiscalYearEnd: "1231", tickers: ["FIG"], exchanges: ["NYSE"], stateOfIncorporation: "DE", filings: { recent: { accessionNumber: [], filingDate: [], reportDate: [], form: [], primaryDocument: [] }, files: [] } } : null;
      return { status: raw === null ? 404 : 200, body: JSON.stringify(raw), fetchedAt: FETCHED, fromCache: false, stale: false };
    } } });
    const produced = await buildDataBundle("FIG", { fmp, edgar, yahoo: inputs.yahoo, now: inputs.now, filingDisclosures: false, companyIr: false, riskFreeFallback: false,
      fred: { fetchImpl: unavailable, retryDelaysMs: [], minRequestIntervalMs: 0 },
      finnhub: { apiKey: "OFFLINE-FIXTURE", fetchImpl: unavailable, retryDelaysMs: [] },
      finra: { fetchImpl: unavailable, retryDelaysMs: [], minRequestIntervalMs: 0 } });
    expect(rowsOf(produced.statements.incomeAnnual)).toHaveLength(4);
    expect(produced.edgar.companyFacts.ok).toBe(true);
    expect(produced.edgar.registrant?.cik10).toBe(CIK);
    expect(rowsOf(produced.statements.incomeAnnual).every(row => row.weightedAverageShsOutDil === undefined && row.fieldConflicts?.weightedAverageShsOutDil?.usable === false)).toBe(true);
    expect(rowsOf(produced.statements.incomeQuarterly).every(row => row.epsDiluted === undefined && row.fieldConflicts?.epsDiluted?.usable === false)).toBe(true);
    expect(runStageB(produced).capital.shareCount.trendPct).toBeNull();
  });
});
