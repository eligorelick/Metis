// Audit 2026-10-27 batch B1. Records are synthetic, shaped like NVDA #50 /
// AMZN #43 EDGAR registry rows; amounts come from the committed SEC fixtures
// (fixtures/edgar/nvda-current-reports/) or are round numbers. No provider,
// network, database or model call.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { namesRecency, reportedSeriesLatest, validateClaimNumericSupport, windowsNamed } from "@/pipeline/stageC/claimEvidence";
import { runVerifyPass, type PassDeps, type VerifyResult } from "@/pipeline/stageC/passes";
import { comparisonCueEnd, consistencyManifestEntries, findComparisonBasePhrases, findPeriodPhrases } from "@/pipeline/stageC/consistency";
import type { ContextPayload, TextExcerpt } from "@/pipeline/stageC/payload";
import type { NumericProvenanceRecord } from "@/pipeline/stageC/provenance";
import type { VerificationLogEntry } from "@/report/schema";

const NO_MODEL = { model: "must-not-call", runPass: async () => { throw new Error("no model call permitted"); } } as unknown as PassDeps;

function rec(fields: Partial<NumericProvenanceRecord> & Pick<NumericProvenanceRecord, "id" | "value">): NumericProvenanceRecord {
  return {
    kind: "provider", unit: "currency", currency: "USD", period: null, asOf: "2026-07-26",
    origin: "edgar:test", formulaVersion: null, displayPrecision: 4, ...fields,
  };
}

// One USD statement row, so a printed "$" resolves to the issuer's reporting
// currency (D-45: passes.ts derives reportingCurrency from payload.statements.* rows).
export const USD_ROW = rec({ id: "payload.statements.balance-sheet-quarterly.2026-07-26.cash-and-equivalents", label: "cash and equivalents",
  value: 1e9, period: "2026-07-26", origin: "edgar:balance-sheet(quarter)" });

export async function cite(registry: NumericProvenanceRecord[], id: string, text: string): Promise<{
  entry: VerificationLogEntry; out: VerifyResult<object>; periodRow: VerificationLogEntry | undefined; manifest: string[] }> {
  const record = registry.find((r) => r.id === id)!;
  const payload = { provenanceRegistry: registry, citationRegistry: [], filings: [], companyName: "NVIDIA Corporation", symbol: "NVDA" } as unknown as ContextPayload;
  const out = await runVerifyPass(NO_MODEL, payload, { commentary: [{ label: "FACT", text, source: id, asOf: record.asOf }] });
  const entry = out.log.find((e) => e.check === undefined)!;
  return { entry, out, periodRow: out.log.find((e) => e.check === "period"), manifest: consistencyManifestEntries(out.checks).map((m) => m.field) };
}

export async function citeExcerpt(excerpt: TextExcerpt, text: string): Promise<{ entry: VerificationLogEntry; out: VerifyResult<object> }> {
  const payload = { provenanceRegistry: [USD_ROW], citationRegistry: [{ id: excerpt.source, asOf: excerpt.asOf, origin: excerpt.source, kind: "payload-text" }],
    filings: [excerpt], companyName: "NVIDIA Corporation", symbol: "NVDA" } as unknown as ContextPayload;
  const out = await runVerifyPass(NO_MODEL, payload, { commentary: [{ label: "FACT", text, source: excerpt.source, asOf: excerpt.asOf }] });
  return { entry: out.log.find((e) => e.check === undefined)!, out };
}

const GM = rec({ id: "computed.growth-margins.gross-margin-latest", label: "gross margin (latest)", kind: "computed", unit: "percent", currency: null,
  value: 71.1, asOf: "2026-01-25", origin: "computed.growth.margins.gross", formulaVersion: "stage-b-v1" });
const OM = rec({ ...GM, id: "computed.growth-margins.operating-margin-latest", label: "operating margin (latest)", value: 60.4 });
const FCF_AFTER_SBC = rec({ id: "computed.capital-cash.latest-fcf-after-sbc-house-default", label: "latest FCF (after SBC, house default)", kind: "computed",
  value: 90.29e9, asOf: "2026-01-25", origin: "computed.capital.fcf" });
const PE = rec({ id: "computed.valuation.pettm-current", label: "peTtm (current)", kind: "computed", unit: "ratio", currency: null,
  value: 27.3, asOf: "2026-10-27", origin: "computed.valuation.multiples.peTtm" });
const GM_FY = { ...GM, id: "computed.test.gross-margin-fy-labelled", fiscalPeriod: "FY2026" };

describe("AI-106 period-less records", () => {
  it.each([
    [GM, "Gross margin for FY2024 was 71.1%."],
    [GM, "Gross margin for Q2 FY2027 was 71.1%."],
    [OM, "Operating margin in fiscal 2023 was 60.4%."],
    [FCF_AFTER_SBC, "Latest FCF after SBC (house default) for FY2024 was USD 90.29 billion."],
    [PE, "Current TTM P/E as of 2025-01-26 was 27.3x."],
  ])("AI-106: a year, quarter or date a period-less record does not carry leaves the claim unverified (%#)", async (record, text) => {
    const { entry, out } = await cite([record], record.id, text);
    expect(entry).toMatchObject({ validationStatus: "unchecked", reason: "period-mismatch" });
    expect(out.coverage.factualValidation?.validated).toBe(0);
  });
  it("AI-106 control: the record's own as-of date and no period still validate", async () => {
    for (const [record, text] of [[GM, "Gross margin for the period ended 2026-01-25 was 71.1%."], [PE, "Current TTM P/E as of 2026-10-27 was 27.3x."], [GM, "Gross margin was 71.1%."]] as const)
      expect((await cite([record], record.id, text)).entry.validationStatus).toBe("validated");
  });
  it("AI-106: a declared fiscal label establishes that label only, named as fiscal", async () => {
    expect((await cite([GM_FY], GM_FY.id, "Gross margin for FY2026 was 71.1%.")).entry.validationStatus).toBe("validated");
    expect((await cite([GM_FY], GM_FY.id, "Gross margin for FY2025 was 71.1%.")).entry).toMatchObject({ validationStatus: "unchecked", reason: "period-mismatch" });
    expect((await cite([GM_FY], GM_FY.id, "Gross margin in 2026 was 71.1%.")).entry.validationStatus).toBe("unchecked");
    // OD-1 residual: the claim reader reads a bare "fiscal 2026" as the year 2026.
    expect((await cite([GM_FY], GM_FY.id, "Gross margin for fiscal 2026 was 71.1%.")).entry.validationStatus).toBe("unchecked");
  });
});

const Q_REV = rec({ id: "payload.statements.income-statement-quarterly.2026-07-26.revenue", label: "revenue", value: 96_221_000_000, period: "2026-07-26",
  periodContext: { kind: "duration", start: "2026-04-27", end: "2026-07-26", basis: "fiscal-quarter", fiscalLabel: "Q2 FY2027" }, fiscalPeriod: "Q2 FY2027",
  asOf: "2026-07-26", origin: "edgar:income-statement(quarter)" });
const FY_REV = rec({ id: "payload.statements.income-statement-annual.2026-01-25.revenue", label: "revenue", value: 215_938_000_000, period: "2026-01-25",
  periodContext: { kind: "duration", start: "2025-01-27", end: "2026-01-25", basis: "fiscal-year", fiscalLabel: "FY2026" }, fiscalPeriod: "FY2026",
  asOf: "2026-01-25", origin: "edgar:income-statement(annual)" });
const ROIC = rec({ id: "computed.returns.roic-latest", label: "ROIC (latest)", kind: "computed", unit: "percent", currency: null, value: 149.8,
  asOf: "2026-01-25", origin: "computed.returns.roic" });
const ACCRUAL = rec({ id: "computed.forensics.accrual-ratio-balance-sheet", label: "accrual ratio (balance-sheet)", kind: "computed", unit: "ratio", currency: null,
  value: 0.64, period: "2026-01-25", asOf: "2026-01-25", origin: "computed.forensics.accruals.balanceSheetAccrualRatio" });
const LQ_YOY = rec({ id: "computed.valuation.latest-quarter-revenue-growth-year-over-year", label: "latest-quarter revenue growth, year over year", kind: "computed",
  unit: "percent", currency: null, value: 105.85, asOf: "2026-07-26", origin: "computed.valuation.reverseDcfContext.latestQuarterYoy" });
const Y1 = rec({ id: "computed.valuation.consensus-year-one-revenue-growth-over-ttm", label: "consensus year-one revenue growth over TTM", kind: "computed",
  unit: "percent", currency: null, value: 73.7, asOf: "2026-07-26", origin: "computed.valuation.reverseDcfContext.consensusYearOne" });
const ITEM7: TextExcerpt = { source: "edgar:10-K item7", asOf: "2026-01-25", title: "10-K Item 7 - Management's Discussion and Analysis (FY2026)",
  text: "We invested $17.5 billion in private companies and infrastructure funds.", truncated: false, originalChars: 71 };
const RELEASE_Q2: TextExcerpt = { source: "edgar:8-K EX-99.1", asOf: "2026-08-26",
  title: "8-K EX-99.1 - earnings release, Q2 FY2027, quarter ended 2026-07-26 (8-K; filed 2026-08-26)", text: "Revenue was $96.2 billion.", truncated: false, originalChars: 26 };

describe("AI-303 windows written without for/during/over", () => {
  it.each([
    [Q_REV, "Revenue for the latest fiscal year was USD 96.22 billion."],
    [Q_REV, "Revenue for the most recent fiscal year was USD 96.22 billion."],
    [FY_REV, "Revenue for the most recent quarter was USD 215.94 billion."],
    [FY_REV, "This quarter's revenue was USD 215.94 billion."],
    [FY_REV, "Revenue this quarter was USD 215.94 billion."],
    [FY_REV, "The quarter's revenue was USD 215.94 billion."],
    [FY_REV, "Latest-quarter revenue was USD 215.94 billion."],
    [FY_REV, "Most recent quarter revenue was USD 215.94 billion."],
    [Q_REV, "Fiscal-year revenue was USD 96.22 billion."],
    [Q_REV, "Revenue this fiscal year was USD 96.22 billion."],
    [Q_REV, "The fiscal year's revenue was USD 96.22 billion."],
  ])("AI-303: a wrong window however written is not validated (%#)", async (record, text) => {
    // the same reason the explicit "Revenue for the fiscal year was ..." control gets today
    expect((await cite([Q_REV, FY_REV], record.id, text)).entry).toMatchObject({ validationStatus: "unchecked", reason: "text-context-mismatch" });
  });
  it("AI-303 control: the right window in the same spellings validates", async () => {
    for (const [record, text] of [[Q_REV, "Revenue for the latest quarter was USD 96.22 billion."], [FY_REV, "Revenue for the latest fiscal year was USD 215.94 billion."],
      [Q_REV, "This quarter's revenue was USD 96.22 billion."], [FY_REV, "Fiscal-year revenue was USD 215.94 billion."], [Q_REV, "Revenue for Q2 FY2027 was USD 96.22 billion."]] as const)
      expect((await cite([Q_REV, FY_REV], record.id, text)).entry.validationStatus).toBe("validated");
    for (const [record, text] of [[Q_REV, "Revenue for the fiscal year was USD 96.22 billion."], [FY_REV, "Quarterly revenue was USD 215.94 billion."], [Q_REV, "Annual revenue was USD 96.22 billion."]] as const)
      expect((await cite([Q_REV, FY_REV], record.id, text)).entry.validationStatus).not.toBe("validated");
  });
  it("AI-303: a window a record label names loosely is established; a period-less or unlabelled record establishes none (OD-1)", async () => {
    expect((await cite([LQ_YOY], LQ_YOY.id, "Latest-quarter revenue growth year over year was 105.85%.")).entry.validationStatus).toBe("validated");
    expect((await cite([LQ_YOY], LQ_YOY.id, "Revenue growth year over year was 105.85%.")).entry.validationStatus).toBe("validated");
    expect((await cite([LQ_YOY], LQ_YOY.id, "Annual revenue growth year over year was 105.85%.")).entry.validationStatus).not.toBe("validated");
    expect((await cite([ROIC], ROIC.id, "ROIC for the latest fiscal year was 149.8%.")).entry.validationStatus).toBe("unchecked");
    expect((await cite([ACCRUAL], ACCRUAL.id, "The balance-sheet accrual ratio for the same year was 0.64x.")).entry.validationStatus).toBe("unchecked");
  });
  it("AI-303: horizons, plurals and comparison words are not windows", async () => {
    expect(windowsNamed("Consensus year-one revenue growth over TTM revenue")).toEqual(["TTM"]);
    for (const text of ["a year ago", "the five-year period", "each fiscal year's average price", "10% per year", "the half-year", "the last four quarters",
      "about a quarter of revenue", "at the end of the quarter", "at the latest quarter end", "year over year", "a year earlier"])
      expect(windowsNamed(text), text).toEqual([]);
    expect(windowsNamed("the prior-year quarter")).toEqual(["quarter"]);
    expect(windowsNamed("this quarter's revenue")).toEqual(["quarter"]);
    expect(windowsNamed("the year ended 2026-01-25")).toEqual(["annual"]);
    expect(windowsNamed("year-to-date revenue")).toEqual(["YTD"]);
    expect(windowsNamed("at year-end")).toEqual(["FYE"]); // AI-303-V3: the fiscal year-end instant
    // end to end: a correct claim using such words keeps its status
    expect((await cite([Y1], Y1.id, "Consensus year-one revenue growth over TTM revenue is 73.7%.")).entry.validationStatus).toBe("validated");
    expect((await cite([Q_REV], Q_REV.id, "Revenue per year was USD 96.22 billion.")).entry.validationStatus).toBe("validated");
  });
  it("AI-303 (excerpt path, AI-303-V2): a quarter is not the 10-K's fiscal year; the excerpt's own window is", async () => {
    expect((await citeExcerpt(ITEM7, "NVIDIA invested USD 17.5 billion in private companies and infrastructure funds.")).entry.validationStatus).toBe("validated");
    for (const text of ["For the latest quarter, NVIDIA invested USD 17.5 billion in private companies and infrastructure funds.",
      "In the most recent quarter, NVIDIA invested USD 17.5 billion in private companies and infrastructure funds.",
      "This quarter NVIDIA invested USD 17.5 billion in private companies and infrastructure funds."])
      expect((await citeExcerpt(ITEM7, text)).entry.validationStatus).not.toBe("validated");
    expect((await citeExcerpt(ITEM7, "For the fiscal year, NVIDIA invested USD 17.5 billion in private companies and infrastructure funds.")).entry.validationStatus).toBe("validated");
    expect((await citeExcerpt(RELEASE_Q2, "Revenue for the quarter ended 2026-07-26 was USD 96.2 billion.")).entry.validationStatus).toBe("validated");
    expect((await citeExcerpt(RELEASE_Q2, "Revenue for the fiscal year was USD 96.2 billion.")).entry.validationStatus).not.toBe("validated");
  });
});

// Fix round 1 (AI-303): "fiscal year 2026" / "calendar year 2025" name a year, not an annual window as well.
describe("AI-303 a year word followed by its year is not also a window", () => {
  const OPINC: TextExcerpt = { source: "edgar:10-K item7", asOf: "2026-01-25", title: "10-K FY2026",
    text: "Operating income in fiscal year 2026 was $17.5 billion.", truncated: false, originalChars: 55 };
  const CAL_REV = rec({ id: "payload.statements.income-statement-annual.2025-12-31.revenue", label: "revenue", value: 5e9, period: "2025", asOf: "2025-12-31" });
  it("windowsNamed reads no window from a year word that a year follows", () => {
    for (const text of ["Revenue in fiscal year 2025 was 5", "calendar year 2025 revenue", "in fiscal year FY2026", "the fiscal year Q2 2026"])
      expect(windowsNamed(text), text).toEqual([]);
    expect(windowsNamed("Revenue for the fiscal year was 5")).toEqual(["annual"]);
    expect(windowsNamed("the quarter ended 2026-07-26")).toEqual(["quarter"]);
  });
  it("an excerpt claim echoing its source's 'fiscal year YYYY' validates; a wrong year does not", async () => {
    expect((await citeExcerpt(OPINC, "Operating income in fiscal year 2026 was USD 17.5 billion.")).entry.validationStatus).toBe("validated");
    expect((await citeExcerpt(OPINC, "Operating income in fiscal year 2025 was USD 17.5 billion.")).entry.validationStatus).not.toBe("validated");
  });
  it("a record carrying the year (and no annual basis) validates 'in fiscal year YYYY'; a wrong year does not", async () => {
    expect((await cite([CAL_REV], CAL_REV.id, "Revenue in fiscal year 2025 was USD 5 billion.")).entry.validationStatus).toBe("validated");
    expect((await cite([CAL_REV], CAL_REV.id, "Revenue in fiscal year 2024 was USD 5 billion.")).entry.validationStatus).toBe("unchecked");
  });
});

const TTM_OCF = rec({ id: "computed.current-capital.operating-cash-flow", label: "operating cash flow", kind: "computed", value: 134.36e9,
  period: "ttm: 2025-07-27 to 2026-07-26", asOf: "2026-07-26", origin: "computed.capital.current.cashBridge.operatingCashFlow", formulaVersion: "stage-b-v1" });

describe("AI-302 trailing-window start date", () => {
  it.each([
    "Operating cash flow for the trailing twelve months ended 2025-07-27 was USD 134.36 billion.",
    "Operating cash flow for the TTM ending 2025-07-27 was USD 134.36 billion.",
    "Operating cash flow for the trailing period ended 2025-07-27 was USD 134.36 billion.",
  ])("AI-302: a lone window start date is not the window's end: %s", async (text) => {
    const { entry, out } = await cite([TTM_OCF], TTM_OCF.id, text);
    expect(entry).toMatchObject({ validationStatus: "unchecked", reason: "period-mismatch" });
    expect(out.coverage.factualValidation?.validated).toBe(0);
  });
  it("AI-302 control: the end date and the complete interval validate; an interior date does not", async () => {
    const end = await cite([TTM_OCF], TTM_OCF.id, "Operating cash flow for the trailing twelve months ended 2026-07-26 was USD 134.36 billion.");
    expect(end.entry.validationStatus).toBe("validated");
    expect(end.out.checks.period.failed).toBe(0);
    expect((await cite([TTM_OCF], TTM_OCF.id, "Operating cash flow for the trailing twelve months from 2025-07-27 to 2026-07-26 was USD 134.36 billion.")).entry.validationStatus).toBe("validated");
    expect((await cite([TTM_OCF], TTM_OCF.id, "Operating cash flow for the trailing twelve months ended 2025-10-26 was USD 134.36 billion.")).entry.validationStatus).not.toBe("validated");
  });
});

const debt = (fields: Partial<NumericProvenanceRecord> & Pick<NumericProvenanceRecord, "id" | "value">) =>
  rec({ label: "total debt", ...fields });
const Q_DEBT = debt({ id: "payload.statements.balance-sheet-quarterly.2026-07-26.total-debt", value: 30e9, period: "2026-07-26",
  periodContext: { kind: "instant", at: "2026-07-26", fiscalLabel: "Q2 FY2027" }, fiscalPeriod: "Q2 FY2027", asOf: "2026-07-26", origin: "edgar:balance-sheet(quarter)" });
const FY_DEBT = debt({ id: "payload.statements.balance-sheet-annual.2026-01-25.total-debt", value: 10e9, period: "2026-01-25",
  periodContext: { kind: "instant", at: "2026-01-25", fiscalLabel: "FY2026" }, fiscalPeriod: "FY2026", asOf: "2026-01-25", origin: "edgar:balance-sheet(annual)" });
const Q4_DEBT = debt({ id: "payload.statements.balance-sheet-quarterly.2026-01-25.total-debt", value: 10e9, period: "2026-01-25",
  periodContext: { kind: "instant", at: "2026-01-25", fiscalLabel: "Q4 FY2026" }, fiscalPeriod: "Q4 FY2026", asOf: "2026-01-25", origin: "edgar:balance-sheet(quarter)" });
const CC_DEBT = rec({ id: "computed.current-capital.total-debt-including-leases", label: "total debt including leases", kind: "computed", value: 12e9,
  period: "2026-07-26", asOf: "2026-07-26", origin: "computed.capital.current.debtBridge.totalDebtIncludingLeases" });
const ANNUAL_NOTE: TextExcerpt = { source: "edgar:10-K notes", asOf: "2026-01-25", title: "10-K notes (FY2026)", text: "Total debt was $10.0 billion.", truncated: false, originalChars: 29 };
const QUARTER_NOTE: TextExcerpt = { ...ANNUAL_NOTE, source: "edgar:10-Q notes", asOf: "2026-08-26", title: "10-Q notes, Q2 FY2027, quarter ended 2026-07-26" };

describe("AI-303-V3 fiscal year-end", () => {
  it.each([
    "Total debt at fiscal year-end was USD 30.00 billion.",
    "Total debt at the end of the fiscal year was USD 30.00 billion.",
    "Total debt at the latest fiscal year-end was USD 30.00 billion.",
  ])("AI-303-V3: a mid-year quarter-end balance is not the fiscal year-end balance: %s", async (text) => {
    expect((await cite([Q_DEBT, FY_DEBT], Q_DEBT.id, text)).entry.validationStatus).toBe("unchecked");
  });
  it("AI-303-V3: an FY or Q4 instant establishes the year end; an undated-basis bridge figure does not", async () => {
    expect((await cite([Q_DEBT, FY_DEBT], FY_DEBT.id, "Total debt at fiscal year-end was USD 10.00 billion.")).entry.validationStatus).toBe("validated");
    expect((await cite([Q4_DEBT], Q4_DEBT.id, "Total debt at the end of the fiscal year was USD 10.00 billion.")).entry.validationStatus).toBe("validated");
    expect((await cite([CC_DEBT], CC_DEBT.id, "Total debt including leases was USD 12.00 billion at fiscal year-end.")).entry.validationStatus).toBe("unchecked");
    expect((await cite([Q_DEBT], Q_DEBT.id, "Total debt as of 2026-01-25 was USD 30.00 billion.")).entry).toMatchObject({ validationStatus: "unchecked", reason: "period-mismatch" });
    expect((await cite([Q_DEBT], Q_DEBT.id, "Total debt at the end of FY2026 was USD 30.00 billion.")).entry.validationStatus).toBe("unchecked");
    expect((await citeExcerpt(ANNUAL_NOTE, "Total debt at fiscal year-end was USD 10.0 billion.")).entry.validationStatus).toBe("validated");
    expect((await citeExcerpt(QUARTER_NOTE, "Total debt at fiscal year-end was USD 10.0 billion.")).entry.validationStatus).not.toBe("validated");
    expect(windowsNamed("at year-end")).toEqual(["FYE"]);
    expect(windowsNamed("at the end of the fiscal year")).toEqual(["FYE"]);
    expect(windowsNamed("at the latest quarter end")).toEqual([]);
  });
});

// AI-303-V3 fix round 1: a source clause or an annual excerpt's own date can state the year-end.
describe("AI-303-V3 fiscal year-end on a filing excerpt", () => {
  const K_DATE: TextExcerpt = { ...ANNUAL_NOTE, text: "As of January 25, 2026, total debt was $10.0 billion." };
  const K_TABLE: TextExcerpt = { ...ANNUAL_NOTE, text: "Liquidity Jan 25, 2026 Jan 26, 2025 (In millions) Total debt $ 10,000 $ 8,500 " };
  const Q_YE: TextExcerpt = { ...QUARTER_NOTE, text: "Total debt at fiscal year-end was $10.0 billion." };
  const Q_DATE: TextExcerpt = { ...QUARTER_NOTE, text: "As of July 26, 2026, total debt was $10.0 billion." };
  const V = async (excerpt: TextExcerpt, text: string) => (await citeExcerpt(excerpt, text)).entry.validationStatus;
  it("a year-end claim naming the 10-K's own reporting date validates; another date does not", async () => {
    expect(await V(K_DATE, "Total debt at fiscal year-end (2026-01-25) was USD 10.0 billion.")).toBe("validated");
    expect(await V(K_DATE, "Total debt at fiscal year-end (2025-01-26) was USD 10.0 billion.")).not.toBe("validated");
    expect(await V(K_DATE, "Total debt as of 2026-01-25 was USD 10.0 billion.")).toBe("validated");
    expect(await V(K_TABLE, "Total debt at fiscal year-end (2026-01-25) was USD 10.0 billion.")).toBe("validated");
    expect(await V(K_TABLE, "Total debt at fiscal year-end (2025-01-26) was USD 8.5 billion.")).not.toBe("validated");
  });
  it("a clause that states the year-end itself establishes it, in a 10-Q too", async () => {
    expect(await V(Q_YE, "Total debt at fiscal year-end was USD 10.0 billion.")).toBe("validated");
    expect(await V(Q_YE, "Total debt at the end of the fiscal year was USD 10.0 billion.")).toBe("validated");
  });
  it("controls: a quarter-end or undated-year-end source never validates a year-end claim", async () => {
    expect(await V(Q_DATE, "Total debt at fiscal year-end was USD 10.0 billion.")).not.toBe("validated");
    expect(await V(Q_DATE, "Total debt at fiscal year-end (2026-07-26) was USD 10.0 billion.")).not.toBe("validated");
    // the 10-Q clause names the year-end but not its date: the claim's date is not stated by any source
    expect(await V(Q_YE, "Total debt at fiscal year-end (2026-01-25) was USD 10.0 billion.")).not.toBe("validated");
    expect(await V(Q_YE, "Total debt was USD 10.0 billion.")).not.toBe("validated");
    expect(await V({ ...QUARTER_NOTE, text: "As of January 25, 2026, total debt was $10.0 billion." }, "Total debt at fiscal year-end (2026-01-25) was USD 10.0 billion.")).not.toBe("validated");
  });
});

// AI-303-V4: "latest" means the newest registered period of the cited series.
const Q1_REV = rec({ id: "payload.statements.income-statement-quarterly.2026-04-26.revenue", label: "revenue", value: 81_615_000_000, period: "2026-04-26",
  periodContext: { kind: "duration", start: "2026-01-26", end: "2026-04-26", basis: "fiscal-quarter", fiscalLabel: "Q1 FY2027" }, fiscalPeriod: "Q1 FY2027",
  asOf: "2026-07-26", origin: "edgar:income-statement(quarter)" });
const Q1_DEBT = debt({ id: "payload.statements.balance-sheet-quarterly.2026-04-26.total-debt", value: 20e9, period: "2026-04-26",
  periodContext: { kind: "instant", at: "2026-04-26", fiscalLabel: "Q1 FY2027" }, fiscalPeriod: "Q1 FY2027", asOf: "2026-07-26", origin: "edgar:balance-sheet(quarter)" });
const EST_A = rec({ id: "payload.estimates.est-revenue-2027-01-31", label: "est revenue 2027-01-31", value: 300e9, period: "2027-01-31", asOf: "2026-07-26", origin: "test:estimates" });
const EST_B = rec({ ...EST_A, id: "payload.estimates.est-revenue-2028-01-30", label: "est revenue 2028-01-30", period: "2028-01-30", value: 350e9 });

describe("AI-303-V4 latest", () => {
  it("AI-303-V4: the newest registered period per reported series; forecasts are no series", () => {
    const latest = reportedSeriesLatest([Q1_REV, Q_REV, FY_REV, Q1_DEBT, Q_DEBT, EST_A, EST_B, TTM_OCF, GM]);
    expect(latest.get("payload.statements.income-statement-quarterly.*.revenue")).toBe("2026-07-26");
    expect(latest.get("payload.statements.balance-sheet-quarterly.*.total-debt")).toBe("2026-07-26");
    expect(latest.get("payload.statements.income-statement-annual.*.revenue")).toBe("2026-01-25");
    expect(latest.size).toBe(3);
  });
  it.each([
    [Q1_REV, "Revenue for the latest quarter was USD 81.62 billion."],
    [Q1_REV, "Latest quarterly revenue was USD 81.62 billion."],
    [Q1_DEBT, "Total debt at the latest quarter end was USD 20.00 billion."],
    [Q1_DEBT, "Total debt at the most recent quarter-end was USD 20.00 billion."],
  ])("AI-303-V4: an older period called the latest is not validated (%#)", async (record, text) => {
    expect((await cite([Q_REV, Q1_REV, Q_DEBT, Q1_DEBT], record.id, text)).entry).toMatchObject({ validationStatus: "unchecked", reason: "period-mismatch" });
  });
  it("AI-303-V4 control: the newest period called the latest, and an older one named exactly, validate", async () => {
    const registry = [Q_REV, Q1_REV, Q_DEBT, Q1_DEBT, GM];
    for (const [record, text] of [[Q_REV, "Revenue for the latest quarter was USD 96.22 billion."], [Q_DEBT, "Total debt at the latest quarter end was USD 30.00 billion."],
      [Q1_REV, "Revenue for Q1 FY2027 was USD 81.62 billion."], [GM, "Latest gross margin was 71.1%."]] as const)
      expect((await cite(registry, record.id, text)).entry.validationStatus).toBe("validated");
  });
});

// AI-303-V4 fix round 1: the recency word must modify a period or a filing.
describe("AI-303-V4 recency word modifies a period", () => {
  const registry = [Q_REV, Q1_REV, Q_DEBT, Q1_DEBT, FY_REV, GM];
  it.each([
    "Revenue for Q1 FY2027 was USD 81.62 billion, the latest NVIDIA.",
    "Revenue for Q1 FY2027 was USD 81.62 billion, latest.",
  ])("a recency word on something else does not reject an exact period: %s", async (text) => {
    expect((await cite(registry, Q1_REV.id, text)).entry.validationStatus).toBe("validated");
  });
  // "the latest guidance" / "the latest product launch" add metric words the record does not carry, so the metric
  // check stops them (text-context-mismatch) whatever the recency rule does; what matters here is that the
  // recency rule is not the reason (no period-mismatch).
  it.each([
    "Revenue for Q1 FY2027 was USD 81.62 billion, below the latest guidance.",
    "Revenue for Q1 FY2027 was USD 81.62 billion, ahead of the latest product launch.",
  ])("a recency word on guidance or a launch is not read as a recency claim: %s", async (text) => {
    expect((await cite(registry, Q1_REV.id, text)).entry.reason).not.toBe("period-mismatch");
  });
  it.each([
    "Revenue for the latest quarter was USD 81.62 billion.",
    "Revenue for the latest quarter, Q1 FY2027, was USD 81.62 billion.",
  ])("a recency word on a period still rejects an older row (%#)", async (text) => {
    expect((await cite(registry, Q1_REV.id, text)).entry).toMatchObject({ validationStatus: "unchecked", reason: "period-mismatch" });
  });
  // A filing word is also a recency target; the extra words stop these earlier on the metric check, so only the status is pinned.
  it.each([
    "Revenue in the latest 10-Q was USD 81.62 billion.",
    "Revenue for the latest reported period was USD 81.62 billion.",
  ])("a recency word on a filing or reported period never validates an older row: %s", async (text) => {
    expect((await cite(registry, Q1_REV.id, text)).entry.validationStatus).toBe("unchecked");
  });
  it("an older annual row called the most recent fiscal year is rejected once a later annual is registered", async () => {
    const FY_NEW = rec({ ...FY_REV, id: "payload.statements.income-statement-annual.2027-01-31.revenue", period: "2027-01-31", asOf: "2027-03-01",
      periodContext: { kind: "duration", start: "2026-01-26", end: "2027-01-31", basis: "fiscal-year", fiscalLabel: "FY2027" }, fiscalPeriod: "FY2027", value: 300e9 });
    expect((await cite([FY_REV, FY_NEW], FY_REV.id, "Revenue for the most recent fiscal year was USD 215.94 billion.")).entry).toMatchObject({ validationStatus: "unchecked", reason: "period-mismatch" });
  });
  it("control: the newest annual row called the latest fiscal year validates beside newer quarterly rows (separate series)", async () => {
    expect((await cite(registry, FY_REV.id, "Revenue for the latest fiscal year was USD 215.94 billion.")).entry.validationStatus).toBe("validated");
  });
});

// AI-303-V4 fix round 2: hyphenated and labelled recency phrasings are checked too.
describe("AI-303-V4 hyphenated and labelled recency", () => {
  const FY_NEW = rec({ ...FY_REV, id: "payload.statements.income-statement-annual.2027-01-31.revenue", period: "2027-01-31", asOf: "2027-03-01",
    periodContext: { kind: "duration", start: "2026-01-26", end: "2027-01-31", basis: "fiscal-year", fiscalLabel: "FY2027" }, fiscalPeriod: "FY2027", value: 300e9 });
  const quarterly = [Q_REV, Q1_REV];
  const annual = [FY_REV, FY_NEW];
  it.each([
    [quarterly, Q1_REV, "Revenue for the latest-quarter was USD 81.62 billion."],
    [quarterly, Q1_REV, "Latest-quarter revenue was USD 81.62 billion."],
    [quarterly, Q1_REV, "Revenue for the latest Q4 was USD 81.62 billion."],
    [annual, FY_REV, "Revenue for the latest full-year was USD 215.94 billion."],
    [annual, FY_REV, "Revenue for the latest FY2026 was USD 215.94 billion."],
  ])("an older row called the latest in a hyphenated or labelled form stays unverified (%#)", async (registry, record, text) => {
    const entry = (await cite(registry, record.id, text)).entry;
    expect(entry.validationStatus).toBe("unchecked");
    expect(entry.reason).toBe("period-mismatch");
  });
  it.each([
    [quarterly, Q_REV, "Revenue for the latest-quarter was USD 96.22 billion."],
    [quarterly, Q_REV, "Latest-quarter revenue was USD 96.22 billion."],
    [annual, FY_NEW, "Revenue for the latest full-year was USD 300.00 billion."],
    [annual, FY_NEW, "Revenue for the latest FY2027 was USD 300.00 billion."],
  ])("control: the newest row called the latest in the same forms validates (%#)", async (registry, record, text) => {
    expect((await cite(registry, record.id, text)).entry.validationStatus).toBe("validated");
  });
  // These phrasings carry words the metric check does not read ("FY", "twelve-month"), so they stop there; the status is pinned,
  // and the predicate test below shows the recency rule itself recognises them.
  it.each([
    [annual, FY_REV, "Revenue for the latest FY was USD 215.94 billion."],
    [annual, FY_REV, "Latest twelve-month revenue was USD 215.94 billion."],
    [annual, FY_REV, "Revenue for the latest 12-month period was USD 215.94 billion."],
  ])("an older row called the latest in a form the metric check stops is never validated (%#)", async (registry, record, text) => {
    expect((await cite(registry, record.id, text)).entry.validationStatus).toBe("unchecked");
  });
  it("the recency predicate: period and filing nouns, hyphens and labels count; other nouns do not", () => {
    for (const yes of ["the latest-quarter", "latest full-year", "latest twelve-month revenue", "latest 12-month", "the latest FY", "latest Q4", "latest FY2026",
      "most recent fiscal year", "most-recent quarter", "newest annual figure", "the latest 10-Q", "the latest 10-K filing", "the latest filing", "the latest report", "latest reported results"])
      expect(namesRecency(yes), yes).toBe(true);
    for (const no of ["the latest guidance", "the latest product launch", "latest NVIDIA", "a recent quarter", "the latest, and", "latest."])
      expect(namesRecency(no), no).toBe(false);
  });
});

const NEUTRAL = "8-K EX-99.1 - earnings release, quarter ended 2026-06-30 (8-K 0001018724-26-000024; filed 2026-07-30)";
const SYN = (text: string): TextExcerpt => ({ source: "edgar:8-K EX-99.1", asOf: "2026-07-30", title: NEUTRAL, text, truncated: false, originalChars: text.length });
const AMZN = SYN("• AWS segment operating income was $16.6 billion, compared with $10.2 billion in second quarter 2025. • North America segment operating income was $9.1 billion, compared with $7.5 billion in second quarter 2025.");
const FX = SYN("Excluding the $0.1 billion favorable impact from year-over-year changes in foreign exchange rates throughout the quarter, net sales increased 20% compared with second quarter 2025.");
const YOY_26 = rec({ id: "computed.quarterly-trend.revenue-growth-year-over-year-quarter-ended-2026-06-30", label: "revenue growth year over year, quarter ended 2026-06-30",
  kind: "computed", unit: "percent", currency: null, value: 19.6205, period: "2026-06-30", asOf: "2026-06-30", origin: "computed.quarterly-trend" });
const YOY_25 = rec({ ...YOY_26, id: "computed.quarterly-trend.revenue-growth-year-over-year-quarter-ended-2025-06-30", label: "revenue growth year over year, quarter ended 2025-06-30",
  value: 13.3333, period: "2025-06-30", asOf: "2025-06-30" });
const NV_YOY = rec({ id: "computed.quarterly-trend.revenue-growth-year-over-year-quarter-ended-2026-07-26", label: "revenue growth year over year, quarter ended 2026-07-26",
  kind: "computed", unit: "percent", currency: null, value: 105.85, period: "2026-07-26", fiscalPeriod: "Q2 FY2027", asOf: "2026-07-26", origin: "computed.quarterly-trend" });
const NV_QOQ = rec({ ...NV_YOY, id: "computed.quarterly-trend.revenue-growth-quarter-over-quarter-quarter-ended-2026-07-26", label: "revenue growth quarter over quarter, quarter ended 2026-07-26", value: 17.9 });

describe("AI-402 comparison bases", () => {
  const UP_FROM = SYN("Revenue was USD 12.4 billion, up 23% from the second quarter of fiscal 2025.");
  it.each([
    [AMZN, "AWS segment operating income in second quarter 2025 was USD 16.6 billion."],
    [SYN("Revenue was USD 12.4 billion, compared with USD 10.1 billion for the second quarter of fiscal 2025."), "Revenue in the second quarter of fiscal 2025 was USD 12.4 billion."],
    [UP_FROM, "Revenue in the second quarter of fiscal 2025 was USD 12.4 billion."],
    [SYN("Revenue was USD 12.4 billion, up 23% versus the second quarter of fiscal 2025."), "Revenue in the second quarter of fiscal 2025 was USD 12.4 billion."],
    [SYN("Net sales increased 20% compared with second quarter 2025."), "Net sales in second quarter 2025 increased 20%."],
    [FX, "Net sales in second quarter 2025 increased 20%."],
  ])("AI-402: a figure before the comparison word does not take the base's period (%#)", async (excerpt, text) => {
    expect((await citeExcerpt(excerpt, text)).entry.validationStatus).toBe("unchecked");
  });
  it.each([
    [AMZN, "AWS segment operating income in second quarter 2025 was USD 10.2 billion."],
    [AMZN, "North America segment operating income in second quarter 2025 was USD 7.5 billion."],
    [UP_FROM, "Revenue in the second quarter of fiscal 2025 was USD 10.1 billion."],
  ])("AI-402: a correct year-ago figure is never contradicted by the current one (%#)", async (excerpt, text) => {
    const { entry, out } = await citeExcerpt(excerpt, text);
    expect(entry.validationStatus).toBe("unchecked");
    expect(out.coverage.factualValidation?.contradicted).toBe(0);
  });
  it("AI-402: a figure before the comparison word reads the excerpt's own period", async () => {
    expect((await citeExcerpt(AMZN, "AWS segment operating income in the quarter ended 2026-06-30 was USD 16.6 billion.")).entry.validationStatus).toBe("validated");
    expect((await citeExcerpt(UP_FROM, "Revenue for the quarter ended 2026-06-30 was USD 12.4 billion.")).entry.validationStatus).toBe("validated");
  });
  it("AI-402: the echo of a source comparison validates; a wrong base does not", async () => {
    const growth = SYN("Net sales increased 20% compared with second quarter 2025.");
    expect((await citeExcerpt(growth, "Net sales increased 20% compared with second quarter 2025.")).entry.validationStatus).toBe("validated");
    expect((await citeExcerpt(growth, "Net sales increased 20% compared with second quarter 2024.")).entry.validationStatus).not.toBe("validated");
  });
  it('AI-402: a bare "from" opens an interval, not a comparison base', () => {
    const at = (text: string, phrase: string) => comparisonCueEnd(text, text.indexOf(phrase));
    expect(at("Operating cash flow from 2025-07-27 to 2026-07-26 was USD 134.36 billion.", "2025-07-27")).toBeNull();
    expect(at("Capex over fiscal 2027 is expected to be USD 25 billion.", "2027")).toBeNull();
    expect(at("Revenue from the third quarter 2026 onward is recognized ratably.", "third quarter 2026")).toBeNull();
    expect(at("Revenue actual versus the prior guidance midpoint for Q2 FY2027 was 5.7%.", "Q2 FY2027")).toBeNull();
    expect(at("AWS segment operating income was $16.6 billion, compared with $10.2 billion in second quarter 2025.", "second quarter 2025")).not.toBeNull();
    expect(at("Revenue was USD 12.4 billion, up 23% from the second quarter of fiscal 2025.", "second quarter of fiscal 2025")).not.toBeNull();
    expect(at("Revenue grew 20% over fiscal 2025.", "2025")).not.toBeNull();
    expect(at("Net sales are expected to be between $197.0 billion and $202.0 billion, or to grow between 9% and 12% compared with third quarter 2025.", "third quarter 2025")).not.toBeNull();
    // A bare "from" across an amount is D-98's base; "over" and an amount range are not.
    expect(at("Revenue grew to USD 12.4 billion from USD 10.1 billion in the second quarter of fiscal 2025.", "second quarter of fiscal 2025")).not.toBeNull();
    expect(at("Capex is expected to be over USD 10 billion in fiscal 2027.", "2027")).toBeNull();
    expect(at("Revenue is expected to range from USD 10.0 billion to USD 10.4 billion for the fourth quarter of 2026.", "fourth quarter of 2026")).toBeNull();
    expect(at("Revenue grew from $391.0 billion in FY2024 to $416.2 billion in FY2025.", "FY2024")).not.toBeNull();
    expect(at("Revenue grew from $391.0 billion in FY2024 to $416.2 billion in FY2025.", "FY2025")).toBeNull();
  });
  it("AI-402-V2: a fiscal-label base is compared with the figure's own base quarter, not a calendar year", async () => {
    for (const [record, text] of [[NV_YOY, "Revenue growth year over year for the quarter was 105.85%, compared with Q2 FY2026."],
      [NV_QOQ, "Revenue growth quarter over quarter for the quarter was 17.9%, compared with Q1 FY2027."]] as const) {
      const { entry, periodRow } = await cite([record], record.id, text);
      expect(periodRow, text).toBeUndefined();
      expect(entry.validationStatus, text).toBe("validated");
    }
    const wrong = await cite([NV_YOY], NV_YOY.id, "Revenue growth year over year for the quarter was 105.85%, compared with Q2 FY2025.");
    expect(wrong.entry.validationStatus).toBe("unchecked");
    expect(wrong.periodRow).toMatchObject({ reason: "period-word-mismatch" });
  });
  it("AI-402-V2: a correct YoY sentence naming its comparison base gets no period finding", async () => {
    for (const text of ["Revenue growth year over year for the quarter was 19.62%, compared with second quarter 2025.",
      "Revenue growth year over year for the quarter ended 2026-06-30 was 19.62%, compared with second quarter 2025."]) {
      const { entry, out, periodRow, manifest } = await cite([YOY_26, YOY_25], YOY_26.id, text);
      expect(entry).toMatchObject({ validationStatus: "validated", reason: "supported" });
      expect(periodRow).toBeUndefined();
      expect(manifest).not.toContain("verify.check.period");
      expect(out.checks.period).toEqual({ checked: 1, passed: 1, failed: 0, rate: 1 });
    }
  });
  it("AI-402-V2: the base is checked as the base", async () => {
    const wrongBase = await cite([YOY_26, YOY_25], YOY_26.id, "Revenue growth year over year for the quarter was 19.62%, compared with second quarter 2024.");
    expect(wrongBase.entry.validationStatus).toBe("unchecked");
    expect(wrongBase.periodRow).toMatchObject({ reason: "period-word-mismatch" });
    expect(wrongBase.periodRow?.note).toContain("comparison base");
    const yearAgoRecord = await cite([YOY_26, YOY_25], YOY_25.id, "Revenue growth year over year for the quarter was 13.33%, compared with second quarter 2025.");
    expect(yearAgoRecord.entry.validationStatus).not.toBe("validated");
    expect(yearAgoRecord.periodRow).toMatchObject({ reason: "period-word-mismatch" });
  });
  it("AI-302 x AI-402: a start date beside a comparison that names the window's end is still only a start", async () => {
    // Task 2's start-date gate accepts a start only when the clause names the end; a comparison base is not the clause's own period.
    const { entry } = await cite([TTM_OCF], TTM_OCF.id, "Operating cash flow for the trailing twelve months ended 2025-07-27 was USD 134.36 billion, compared with 2026-07-26.");
    expect(entry).toMatchObject({ validationStatus: "unchecked", reason: "period-mismatch" });
    // Control: the complete interval still validates.
    expect((await cite([TTM_OCF], TTM_OCF.id, "Operating cash flow for the trailing twelve months from 2025-07-27 to 2026-07-26 was USD 134.36 billion.")).entry.validationStatus).toBe("validated");
  });
});

describe("AI-402 fix round 1: a stated comparison base must be established by the cited evidence", () => {
  const LEVEL_25 = rec({ id: "computed.test.gross-margin-level", label: "gross margin", kind: "computed", unit: "percent", currency: null, value: 74,
    period: "2025-06-30", asOf: "2025-06-30", origin: "computed.test" });
  const LEVEL_26 = { ...LEVEL_25, period: "2026-06-30", asOf: "2026-06-30" };
  it.each([
    [LEVEL_26, "Gross margin was 74%, up from Q2 2019."],
    [GM, "Gross margin was 71.1%, compared with fiscal 2019."],
    [LEVEL_26, "Gross margin was 74%, compared with second quarter 2025."],
  ])("a base on a level or period-less record is not established, so the claim stays unverified (%#)", async (record, text) => {
    const { entry, out } = await cite([record], record.id, text);
    expect(entry).toMatchObject({ validationStatus: "unchecked", reason: "period-mismatch" });
    expect(out.coverage.factualValidation?.validated).toBe(0);
  });
  it("guidance, target, estimate and outlook phrases are not comparison bases and keep the claim's own period", async () => {
    for (const text of ["Gross margin was 74%, against 2026 guidance.", "Gross margin was 74%, compared with 2026 estimates."])
      expect((await cite([LEVEL_25], LEVEL_25.id, text)).entry.validationStatus, text).toBe("unchecked");
    // The claim keeps its own period: "2026" is a stated period, not a base.
    const sentence = "Gross margin was 74%, against 2026 guidance.";
    expect(findPeriodPhrases(sentence, [], [])).toEqual(["2026"]);
    expect(findComparisonBasePhrases(sentence, [], [])).toEqual([]);
  });
  it("a spelled fiscal quarter base is compared by fiscal label (AI-405, ruling 2026-10-28): the wrong one stays unverified, the right one validates", async () => {
    // Re-pinned 2026-10-28 (AI-405 and the controller ruling): until Task 9 neither was established; now the right base (Q2 FY2026) validates.
    expect((await cite([NV_YOY], NV_YOY.id,
      "Revenue growth year over year for the quarter was 105.85%, compared with the second quarter of fiscal 2025.")).entry).toMatchObject({ validationStatus: "unchecked", reason: "period-word-mismatch" });
    expect((await cite([NV_YOY], NV_YOY.id,
      "Revenue growth year over year for the quarter was 105.85%, compared with the second quarter of fiscal 2026.")).entry.validationStatus).toBe("validated");
  });
  it("a QoQ base against a YoY record, and the reverse, stay unverified", async () => {
    expect((await cite([NV_YOY], NV_YOY.id, "Revenue growth year over year for the quarter was 105.85%, compared with Q1 FY2027.")).entry.validationStatus).toBe("unchecked");
    expect((await cite([NV_QOQ], NV_QOQ.id, "Revenue growth quarter over quarter for the quarter was 17.9%, compared with Q2 FY2026.")).entry.validationStatus).toBe("unchecked");
  });
  it("two rows: one record cannot bind two figures, at HEAD and now, so the claim is not validated by the base alone", async () => {
    const Q_NOW = rec({ ...Q_REV, value: 81.6e9 });
    const Q_PRIOR = rec({ ...Q_REV, id: "payload.statements.income-statement-quarterly.2025-07-27.revenue", value: 72.0e9, period: "2025-07-27", asOf: "2025-07-27",
      periodContext: { kind: "duration", start: "2025-04-28", end: "2025-07-27", basis: "fiscal-quarter", fiscalLabel: "Q2 FY2026" }, fiscalPeriod: "Q2 FY2026" });
    const { entry } = await cite([Q_NOW, Q_PRIOR, USD_ROW], Q_NOW.id, "Revenue was USD 81.6 billion in Q2 FY2027, up from USD 72.0 billion in Q2 FY2026.");
    // Ruling (b) (a cited record whose own period is the base) is not reachable: the record path binds one figure per claim (text-ambiguous at HEAD too).
    expect(entry).toMatchObject({ validationStatus: "unchecked", reason: "text-ambiguous" });
  });
});

describe("AI-402 fix round 2: a bare spelled fiscal base keeps its fiscal marker", () => {
  const lead = "Revenue growth year over year for the quarter was 105.85%, compared with ";
  // Re-pinned 2026-10-28 (AI-405, controller ruling): Task 9 reads "fiscal YYYY" as the fiscal year FY<YYYY>. A fiscal year is
  // not the Q2 FY2026 quarter the figure is measured against, so each of these stays unverified; the reason moves from the gate's
  // period-mismatch to the period check's own base finding (period-word-mismatch), which is true here.
  it.each(["fiscal 2025.", "fiscal year 2025.", "fiscal 2026.", "fiscal year 2026."])(
    "a base spelled 'fiscal' year is unverified, wrong or right: it is a year, not the quarter the figure is measured against (%s)", async (base) => {
      expect((await cite([NV_YOY], NV_YOY.id, lead + base)).entry).toMatchObject({ validationStatus: "unchecked", reason: "period-word-mismatch" });
    });
  it("control (pinned): an FY-labelled base is compared by fiscal label", async () => {
    // A fiscal year is not the Q2 FY2026 quarter the figure is measured against, so a bare FY base stays unverified.
    expect((await cite([NV_YOY], NV_YOY.id, `${lead}Q2 FY2026.`)).entry.validationStatus).toBe("validated");
    // The spaced "FY 2026" is deterministic too (AI-402 review minor): unchecked, like the unspaced spelling.
    for (const base of ["FY2026", "FY 2026", "FY2025", "Q2 FY2025"]) expect((await cite([NV_YOY], NV_YOY.id, `${lead}${base}.`)).entry.validationStatus, base).toBe("unchecked");
  });
});

// AI-404: the sentence of fixtures/edgar/nvda-current-reports/q2fy27-ex99-2.txt starting "Inventory was $31.6 billion".
const COMMENTARY: TextExcerpt = { source: "edgar:8-K EX-99.2", asOf: "2026-08-26",
  title: "8-K EX-99.2 — CFO commentary, Q2 FY2027, quarter ended 2026-07-26 (8-K; filed 2026-08-26)",
  text: "Inventory was $31.6 billion, up from $25.8 billion sequentially, as we prepare for the introduction of Vera Rubin in the third quarter.",
  truncated: false, originalChars: 134 };
const TWO: TextExcerpt = { source: "edgar:10-Q item2", asOf: "2026-06-30", title: "Quarterly review",
  text: "Operating margin was 31% in 2026; gross margin was 43% in 2025.", truncated: false, originalChars: 62 };

describe("AI-404 periods named outside the figure's clause", () => {
  it.each([
    [FY_REV, "For the quarter ended 2026-07-26, Data Center demand stayed strong; revenue was USD 215.94 billion."],
    [Q1_REV, "NVIDIA's quarter ended 2026-07-26 set a record. Revenue was USD 81.62 billion."],
  ])("AI-404: a one-figure claim's period in another clause or sentence is checked (record path, %#)", async (record, text) => {
    expect((await cite([Q_REV, Q1_REV, FY_REV], record.id, text)).entry).toMatchObject({ validationStatus: "unchecked", reason: "period-mismatch" });
  });
  it("AI-404: a one-figure claim's period in another clause is checked (excerpt path)", async () => {
    expect((await citeExcerpt(COMMENTARY, "In Q1 FY2027 NVIDIA kept building supply; inventory was USD 31.6 billion.")).entry.validationStatus).toBe("unchecked");
    expect((await citeExcerpt(COMMENTARY, "Inventory for Q2 FY2027 was USD 31.6 billion.")).entry.validationStatus).toBe("validated");
    expect((await citeExcerpt(COMMENTARY, "Inventory for Q1 FY2027 was USD 31.6 billion.")).entry.validationStatus).not.toBe("validated");
  });
  it("AI-404 control: the record's own period named in another clause validates", async () => {
    expect((await cite([Q_REV], Q_REV.id, "Revenue was USD 96.22 billion; that was NVIDIA's quarter ended 2026-07-26.")).entry.validationStatus).toBe("validated");
  });
  it("AI-404 control: a wrong period in the figure's own clause stays unverified", async () => {
    expect((await cite([Q_REV, Q1_REV], Q_REV.id, "Data Center demand stayed strong; revenue for the quarter ended 2026-04-26 was USD 96.22 billion.")).entry)
      .toMatchObject({ validationStatus: "unchecked", reason: "period-mismatch" });
  });
  it("AI-404: a claim with several figures still reads each clause", async () => {
    const { entry } = await citeExcerpt(TWO, "Operating margin was 31% in 2026; gross margin was 43% in 2025.");
    expect(entry.validationStatus).toBe("validated");
    expect(entry.sourceSpans).toHaveLength(2);
  });
});

// AI-404 fix round 1: a forward-looking clause lends its period to no past figure.
const GUIDE: TextExcerpt = { source: "edgar:8-K EX-99.2", asOf: "2026-08-26",
  title: "8-K EX-99.2 — CFO commentary, Q2 FY2027, quarter ended 2026-07-26 (8-K; filed 2026-08-26)",
  text: "Revenue is expected to be $108.0 billion in the third quarter of fiscal 2027.", truncated: false, originalChars: 76 };
describe("AI-404 fix round 1: forward-looking clauses and the whole-claim period", () => {
  it("a guided figure stated as a past result is not dated by a forward-looking clause", async () => {
    expect((await citeExcerpt(GUIDE, "Revenue was USD 108.0 billion; NVIDIA expects strength in Q3 FY2027.")).entry.validationStatus).not.toBe("validated");
    expect((await citeExcerpt(GUIDE, "Revenue was USD 108.0 billion.")).entry).toMatchObject({ validationStatus: "unchecked", reason: "text-context-mismatch" });
  });
  it("record path: the citation check does not lend a forward-looking clause's period (the sentence-level period check still demotes it)", async () => {
    const fwd = await cite([Q_REV], Q_REV.id, "Revenue was USD 96.22 billion; NVIDIA expects strength in Q3 FY2027.");
    // Not period-mismatch from the citation check; fail-closed, never validated: consistency.ts reads the whole sentence's years.
    expect(fwd.entry).toMatchObject({ validationStatus: "unchecked", reason: "period-word-mismatch" });
  });
  it("control: a non-forward clause still lends its period (excerpt and record path)", async () => {
    expect((await citeExcerpt(COMMENTARY, "Inventory was USD 31.6 billion; that was Q2 FY2027.")).entry.validationStatus).toBe("validated");
    expect((await citeExcerpt(COMMENTARY, "Inventory was USD 31.6 billion; that was Q1 FY2027.")).entry.validationStatus).not.toBe("validated");
    expect((await cite([Q_REV, Q1_REV], Q_REV.id, "Revenue was USD 96.22 billion; NVIDIA expects strength in Q3 FY2027. That was the quarter ended 2026-04-26.")).entry.validationStatus)
      .toBe("unchecked");
  });
  it("control (pinned): a forward-looking claim's own period is still read", async () => {
    const guided = await citeExcerpt(GUIDE, "Revenue for Q3 FY2027 is expected to be USD 108.0 billion.");
    const wrong = await citeExcerpt(GUIDE, "Revenue for Q2 FY2027 is expected to be USD 108.0 billion.");
    expect(guided.entry.validationStatus).toBe("validated");
    expect(wrong.entry.validationStatus).not.toBe("validated");
  });
  it("pinned (C-3): a period named in a neighbouring non-forward clause is read as the figure's period, so the claim validates only when the figure matches the source for that period", async () => {
    // "the firm reorganized in 2025" names 2025 and the source dates 43% to 2025: validated by design; against 2026 it is not.
    expect((await citeExcerpt(TWO, "Gross margin was 43%; the firm reorganized in 2025.")).entry.validationStatus).toBe("validated");
    expect((await citeExcerpt(TWO, "Gross margin was 43%; the firm reorganized in 2026.")).entry.validationStatus).not.toBe("validated");
  });
  it("M1: a figure's digits are not read as a year in a source clause", async () => {
    const SRC: TextExcerpt = { source: "edgar:10-Q item2", asOf: "2026-06-30", title: "Quarterly review", text: "Inventory was $2,026 million.", truncated: false, originalChars: 29 };
    expect((await citeExcerpt(SRC, "Inventory was USD 2,026 million.")).entry.validationStatus).toBe("validated");
  });
});

// AI-302-V1 (OD-3): a forward-looking clause binds only a forward-looking claim, under no inherited period.
// Excerpts are sliced from the committed SEC fixtures (no network).
const fixture = (name: string): string => readFileSync(path.join(process.cwd(), "fixtures/edgar/nvda-current-reports", name), "utf8");
const EX991 = fixture("q2fy27-ex99-1.txt");
const EX992 = fixture("q2fy27-ex99-2.txt");
const ex = (source: string, asOf: string, title: string, text: string): TextExcerpt => ({ source, asOf, title, text, truncated: false, originalChars: text.length });
const releaseStart = EX991.indexOf("NVIDIA (NASDAQ: NVDA) today reported");
const RELEASE = ex("edgar:8-K EX-99.1", "2026-08-26", "8-K EX-99.1 - earnings release, Q2 FY2027, quarter ended 2026-07-26 (8-K; filed 2026-08-26)",
  EX991.slice(releaseStart, EX991.indexOf("Highlights", releaseStart)));
const inventoryAt = EX992.indexOf("Inventory was $31.6 billion");
const COMMENTARY_FULL = ex("edgar:8-K EX-99.2", "2026-08-26", COMMENTARY.title ?? "",
  `${EX992.slice(inventoryAt, EX992.indexOf(". ", inventoryAt) + 1)}\n${EX992.slice(EX992.indexOf("Revenue is expected to be $108.0 billion"), EX992.indexOf("For the full year fiscal 2027"))}`);
describe("AI-302-V1 forward-looking clauses", () => {
  it("setup: both slices carry the outlook bullets", () => {
    expect(RELEASE.text).toContain("are expected to be 74.0%");
    expect(COMMENTARY_FULL.text).toContain("are expected to be 74.0%");
    expect(COMMENTARY_FULL.text).toContain("Inventory was $31.6 billion");
  });
  it.each([RELEASE, COMMENTARY_FULL])("AI-302-V1: the Q3 FY2027 guide is not validated as the Q2 FY2027 result (%#)", async (excerpt) => {
    const { entry, out } = await citeExcerpt(excerpt, "GAAP and non-GAAP gross margins for Q2 FY2027 were 74.0%.");
    expect(entry.validationStatus).toBe("unchecked");
    expect(out.coverage.factualValidation?.validated).toBe(0);
    expect((await citeExcerpt(excerpt, "GAAP and non-GAAP gross margins were 74.0%.")).entry.validationStatus).toBe("unchecked");
  });
  it("AI-302-V1: the guide dated by the quarter end is not validated, and the true result is not contradicted by the guide", async () => {
    expect((await citeExcerpt(RELEASE, "GAAP and non-GAAP gross margins in the period ended 2026-07-26 were 74.0%.")).entry.validationStatus).toBe("unchecked");
    const { entry } = await citeExcerpt(RELEASE, "GAAP and non-GAAP gross margins for Q2 FY2027 were 75.0%.");
    expect(entry.validationStatus).not.toBe("contradicted");
    expect((entry.sourceSpans ?? []).map((s) => s.text).join(" ")).not.toMatch(/expected to be 74\.0%/);
  });
  it("AI-302-V1 control: a forward-looking claim binds the guide; a result claim binds the result", async () => {
    expect((await citeExcerpt(RELEASE, "GAAP and non-GAAP gross margins are expected to be 74.0%.")).entry.validationStatus).toBe("validated");
    expect((await citeExcerpt(COMMENTARY_FULL, "Inventory for Q2 FY2027 was USD 31.6 billion.")).entry.validationStatus).toBe("validated");
    // OD-3 non-goal: an outlook lead's period is not carried to its bullets
    expect((await citeExcerpt(RELEASE, "Revenue for Q3 FY2027 is expected to be USD 108.0 billion.")).entry.validationStatus).toBe("unchecked");
  });
  it("AI-302-V1: management guidance is forward-looking; accounting guidance is not", async () => {
    const GUIDED = ex("edgar:8-K EX-99.1", "2026-08-26", RELEASE.title ?? "", "Our guidance for third-quarter revenue is $108.0 billion.");
    expect((await citeExcerpt(GUIDED, "Revenue for Q2 FY2027 was USD 108.0 billion.")).entry.validationStatus).toBe("unchecked");
    expect((await citeExcerpt(GUIDED, "Revenue guidance is USD 108.0 billion.")).entry.validationStatus).toBe("validated");
    // AI-305 / OD-1: a phrase before the figure is part of its own description, so it sits after a comma here ("accounting guidance" is still not forward-looking).
    const NOTE = ex("edgar:10-K notes", "2026-01-25", "10-K notes (FY2026)", "Operating lease liabilities were $2.5 billion, under the new lease accounting guidance.");
    expect((await citeExcerpt(NOTE, "Operating lease liabilities were USD 2.5 billion.")).entry.validationStatus).toBe("validated");
    const OURS = ex("edgar:10-K notes", "2026-01-25", "10-K notes (FY2026)", "Operating lease liabilities were $2.5 billion, under our new guidance.");
    expect((await citeExcerpt(OURS, "Operating lease liabilities were USD 2.5 billion.")).entry.validationStatus).toBe("unchecked");
  });
  // Task 7 reviews: a RESULT claim never binds the guide, whatever forward wording sits in a neighbouring clause or after the figure.
  it.each([
    "Revenue was USD 108.0 billion in Q3 FY2027.",
    "Revenue was USD 108.0 billion, as expected in Q3 FY2027.",
    "Revenue was USD 108.0 billion; the Q3 FY2027 target is strong.",
    "Revenue was USD 108.0 billion; we are confident about Q3 FY2027.",
    "Revenue was USD 108.0 billion; NVIDIA expects strength in Q3 FY2027.",
  ])("AI-302-V1: a result claim does not bind the guided figure (%s)", async (text) => {
    expect((await citeExcerpt(GUIDE, text)).entry.validationStatus).toBe("unchecked");
  });
  it("AI-302-V1 accepted recall loss (OD-3): a guided figure restated with a subject and verb the source clause lacks leaves the claim unchecked", async () => {
    // The loss is a metric-token mismatch (unchecked/text-context-mismatch): the claim's own words "NVIDIA expects" are metric
    // words the source clause "Revenue is expected to be $108.0 billion ..." does not carry. It is not the own-clause modality rule
    // ("For Q3 FY2027, revenue is expected to be USD 108.0 billion." validates). Recall is lost, never precision.
    // Accepted under OD-3, pinned 2026-10-28 (AI-302-V1 review), reworded after the Task 9 review.
    expect((await citeExcerpt(GUIDE, "For Q3 FY2027, NVIDIA expects revenue of USD 108.0 billion.")).entry.validationStatus).toBe("unchecked");
  });
  it("AI-302-V1 control: a forward-looking claim still binds the guide it states", async () => {
    expect((await citeExcerpt(GUIDE, "Revenue for Q3 FY2027 is expected to be USD 108.0 billion.")).entry.validationStatus).toBe("validated");
    expect((await citeExcerpt(GUIDE, "Revenue is expected to be USD 108.0 billion in the third quarter of fiscal 2027.")).entry.validationStatus).toBe("validated");
  });
});

// AI-405 (C-5): the period check is never stricter than the citation check. Synthetic 52/53-week issuer ("Example Tools Inc").
const ANNUAL_53 = rec({ id: "payload.statements.income-statement-annual.2026-01-03.revenue", label: "revenue", value: 4_710_000_000, period: "2026-01-03",
  periodContext: { kind: "duration", start: "2024-12-29", end: "2026-01-03", basis: "fiscal-year", fiscalLabel: "FY2025" }, fiscalPeriod: "FY2025",
  asOf: "2026-01-03", origin: "edgar:income-statement(annual)" });
const QUARTER_53 = rec({ id: "payload.statements.income-statement-quarterly.2026-01-03.revenue", label: "revenue", value: 1_230_000_000, period: "2026-01-03",
  periodContext: { kind: "duration", start: "2025-09-28", end: "2026-01-03", basis: "fiscal-quarter", fiscalLabel: "Q4 FY2025" }, fiscalPeriod: "Q4 FY2025",
  asOf: "2026-01-03", origin: "edgar:income-statement(quarter)" });
const GUIDE_ROW = rec({ id: "computed.quarterly-trend.q2-fy2027-revenue-actual-vs-prior-guidance-midpoint", label: "Q2 FY2027 revenue actual vs prior guidance midpoint",
  kind: "computed", unit: "percent", currency: null, value: 5.74, period: "Q2 FY2027", asOf: "2026-07-26", origin: "computed.quarterly-trend" });

describe("AI-405 period check on fiscal labels", () => {
  it.each([
    [ANNUAL_53, "Revenue for fiscal 2025 was USD 4.71 billion."],
    [ANNUAL_53, "Revenue for 2025 was USD 4.71 billion."],
    [QUARTER_53, "Revenue for Q4 2025 was USD 1.23 billion."],
  ])("AI-405: a sentence the citation check validates is not failed by the period check: %s", async (record, text) => {
    const { entry, periodRow, manifest } = await cite([ANNUAL_53, QUARTER_53, USD_ROW], record.id, text);
    expect(periodRow).toBeUndefined();
    expect(manifest).not.toContain("verify.check.period");
    expect(entry.validationStatus).toBe("validated");
  });
  it("AI-405 control: FY2025 and the ISO year end validate; calendar 2026 does not", async () => {
    for (const text of ["Revenue for FY2025 was USD 4.71 billion.", "Revenue for the fiscal year ended 2026-01-03 was USD 4.71 billion."])
      expect((await cite([ANNUAL_53, USD_ROW], ANNUAL_53.id, text))).toMatchObject({ entry: { validationStatus: "validated" }, periodRow: undefined });
    expect((await cite([ANNUAL_53, USD_ROW], ANNUAL_53.id, "Revenue for 2026 was USD 4.71 billion.")).entry.validationStatus).toBe("unchecked");
  });
  it("AI-405: a fiscal-label record named by its own quarter end gets no period finding; another date is not checked", async () => {
    const own = await cite([GUIDE_ROW], GUIDE_ROW.id, "Revenue actual versus the prior guidance midpoint for the quarter ended 2026-07-26 was 5.74%.");
    expect(own.periodRow).toBeUndefined();
    const other = await cite([GUIDE_ROW], GUIDE_ROW.id, "Revenue actual versus the prior guidance midpoint for the quarter ended 2026-04-26 was 5.74%.");
    expect(other.periodRow).toBeUndefined();
    expect(other.out.checks.period.checked).toBe(0);
  });
  it("AI-405: a spelled fiscal quarter the citation check accepts gets no period finding; a wrong one still does", async () => {
    const own = await cite([Q_REV, USD_ROW], Q_REV.id, "Revenue for the second quarter of fiscal 2027 was USD 96.22 billion.");
    expect(own.periodRow).toBeUndefined();
    expect(own.entry.validationStatus).toBe("validated");
    const wrong = await cite([Q_REV, USD_ROW], Q_REV.id, "Revenue for the second quarter of fiscal 2026 was USD 96.22 billion.");
    expect(wrong.entry.validationStatus).toBe("unchecked");
    expect(wrong.periodRow).toMatchObject({ reason: "period-word-mismatch" });
    // the same spelling as a comparison base (C-2): NVDA's Q2 FY2026 is the base quarter of Q2 FY2027
    const base = await cite([NV_YOY], NV_YOY.id, "Revenue growth year over year for the quarter was 105.85%, compared with the second quarter of fiscal 2026.");
    expect(base.periodRow).toBeUndefined();
    expect(base.entry.validationStatus).toBe("validated");
    expect((await cite([ANNUAL_53, USD_ROW], ANNUAL_53.id, "Revenue for fiscal year 2025 was USD 4.71 billion.")).periodRow).toBeUndefined();
  });
  it("AI-405 (ruling): a wrong spelled base stays unverified and gets a base finding; only the right one validates", async () => {
    const lead = "Revenue growth year over year for the quarter was 105.85%, compared with ";
    for (const base of ["the second quarter of fiscal 2025", "fiscal 2025", "fiscal year 2025", "fiscal 2026", "fiscal year 2026", "the second quarter of fiscal 2027"]) {
      const { entry } = await cite([NV_YOY], NV_YOY.id, `${lead}${base}.`);
      expect(entry.validationStatus, base).toBe("unchecked");
    }
    const wrongQuarter = await cite([NV_YOY], NV_YOY.id, `${lead}the second quarter of fiscal 2025.`);
    expect(wrongQuarter.periodRow).toMatchObject({ reason: "period-word-mismatch" });
  });
  it("AI-405: a record with no fiscal label does not check a spelled fiscal year (D-66)", async () => {
    const NO_LABEL = rec({ ...ANNUAL_53, id: "payload.statements.income-statement-annual.2026-01-03.nolabel-revenue", fiscalPeriod: undefined, periodContext: undefined });
    const { periodRow, out } = await cite([NO_LABEL, USD_ROW], NO_LABEL.id, "Revenue for fiscal 2025 was USD 4.71 billion.");
    expect(periodRow).toBeUndefined();
    expect(out.checks.period.checked).toBe(0);
  });
});

// Final review (2026-10-28, AI-402): the comparison-cue reader backtracked exponentially on comma-grouped table rows. Inside its
// amount-and-word filler an amount's digits and its separator could both take a comma, and the space before the unit and the
// separator could both take a space, so each comma or space doubled the paths. At the branch head these two inputs took about
// 33.6 s and 66 s; the amount is now read one way.
describe("final review: the comparison-cue reader stays fast on comma-grouped rows (AI-402)", () => {
  const timed = <T>(fn: () => T): { value: T; ms: number } => {
    const t0 = performance.now();
    const value = fn();
    return { value, ms: performance.now() - t0 };
  };
  it("verifies a claim against 1,000 characters of comma-grouped table rows in under 250 ms", () => {
    const row = (k: number) => "more than 1 year " + Array.from({ length: 9 }, (_, i) => `${i + 1},${100 + i + k},${300 + i}`).join(" ") + " Total 2025 ";
    const text = "(In thousands) Maturities of investments " + Array.from({ length: 8 }, (_, k) => row(k)).join("") + "and revenue was $5 billion";
    expect(text.length).toBeGreaterThanOrEqual(1000);
    const excerpt: TextExcerpt = { title: "10-Q (reporting period ended 2026-07-26)", text, source: "edgar:10-Q notes", asOf: "2026-07-26",
      truncated: false, originalChars: text.length };
    const { value, ms } = timed(() => validateClaimNumericSupport({ label: "FACT", text: "Revenue was USD 5 billion.", source: excerpt.source, asOf: excerpt.asOf },
      { excerpts: [excerpt], sourceId: excerpt.source, reportingCurrency: "USD" }));
    expect(value.status).toBe("validated");
    expect(ms).toBeLessThan(250);
  });
  it("reads a 12-amount row with three spaces between amounts in under 250 ms", () => {
    const text = "Less than " + Array.from({ length: 12 }, (_, i) => `${i + 1},234`).join("   ") + " Revenue 2025";
    const { value, ms } = timed(() => comparisonCueEnd(text, text.indexOf("2025")));
    // "Revenue" is not a filler word, so no cue governs the year.
    expect(value).toBeNull();
    expect(ms).toBeLessThan(250);
  });
  it("control: an amount list after a cue still reaches its base", () => {
    const text = "Less than 1,234   2,234   3,234 in 2025";
    expect(comparisonCueEnd(text, text.indexOf("2025"))).toBe("Less than".length);
  });
});
