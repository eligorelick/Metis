// Audit 2026-10-27 batch B1. Records are synthetic, shaped like NVDA #50 /
// AMZN #43 EDGAR registry rows; amounts come from the committed SEC fixtures
// (fixtures/edgar/nvda-current-reports/) or are round numbers. No provider,
// network, database or model call.
import { describe, expect, it } from "vitest";
import { reportedSeriesLatest, windowsNamed } from "@/pipeline/stageC/claimEvidence";
import { runVerifyPass, type PassDeps, type VerifyResult } from "@/pipeline/stageC/passes";
import { consistencyManifestEntries } from "@/pipeline/stageC/consistency";
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
