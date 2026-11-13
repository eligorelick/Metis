/**
 * D-257 (P7, P8, P11, P13, P14): the revenue of a bank.
 *
 * A data provider states a bank's revenue gross of interest expense; the filing states total net revenue (net
 * interest income plus noninterest income). The income classification compared the two and refused the row, and the
 * securities-firm rule (D-200) had no bank twin. The bank rule adopts the filed total for every annual and quarterly
 * row whose filing proves it, and withholds a row it cannot prove beside rows it moved.
 *
 * JPMorgan's facts are its public SEC companyfacts (fixtures/edgar/jpm_companyfacts_bank_revenue.json). The control
 * bank uses the fiscal 2025 figures of Bank of America and Wells Fargo recorded from SEC companyfacts in
 * fixtures/edgar/bank_xbrl_tag_matrix.json; that file carries no accession numbers, so theirs are placeholders. The
 * provider's gross figure for JPMorgan's fiscal 2025 is the one D-251 records (279,745M); every other provider
 * figure here is a stand-in (the filed total plus a constant), since only "a different figure" matters to the rule.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { enrichIncomeClassification, provenBankRevenue } from "@/edgar/incomeClassification";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import type { CompanyFacts } from "@/edgar/xbrl";
import { bankRevenueManifest, withIncomeOperatingBasis } from "@/pipeline/incomeBasis";
import { runStageB } from "@/pipeline/compute";
import type { DataBundle } from "@/pipeline/types";
import type { FmpIncomeStatementRow, FmpPayload, StatementFieldProvenance } from "@/providers/fmp";
import type { FetchResult } from "@/types/core";
import { withIssuerFacts } from "./helpers/confirmedIssuer";
import { buildSyntheticRouteBundle } from "./helpers/researchRoutePanel";

const B = 1e9;
const M = 1e6;
const AT = "2026-11-12T18:17:47.889Z";
const jpmFacts = (): CompanyFacts => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "fixtures", "edgar", "jpm_companyfacts_bank_revenue.json"), "utf8")) as CompanyFacts;
/** A provider revenue that is not the filed total: only the difference matters to the rule. */
const gross = (filedNet: number) => filedNet + 60 * B;

type Row = FmpIncomeStatementRow;
const input = (rows: Row[]): FetchResult<FmpPayload<Row>> =>
  ({ ok: true, value: { data: { rows, raw: structuredClone(rows) }, asOf: String(rows[0]!.date), source: "fmp", endpoint: "fixture", fetchedAt: AT } });
function classify(rows: Row[], facts: CompanyFacts, scope: "annual" | "quarter", opts: Parameters<typeof enrichIncomeClassification>[4] = { bankRevenue: true }, at = AT) {
  const result = enrichIncomeClassification(input(rows), facts, scope, at, opts);
  if (!result.income.ok) throw new Error("income expected");
  return { rows: result.income.value.data.rows, gaps: result.gaps, cleared: result.cleared, income: result.income };
}
const providerRow = (date: string, filingDate: string, revenue: number, extra: Partial<Row> = {}): Row => ({
  cik: "0000019617", date, reportedCurrency: "USD", filingDate, period: "FY", revenue,
  costOfRevenue: revenue * 0.4, grossProfit: revenue * 0.6, operatingExpenses: revenue * 0.34, operatingIncome: revenue * 0.26, ...extra });
/** The row as the stored snapshot holds it: the classification refused the revenue at acquisition. */
function refusedRow(date: string, filingDate: string, vendor: number, filed: number, evidence: Pick<StatementFieldProvenance, "periodStart" | "tags" | "filings">, extra: Partial<Row> = {}): Row {
  const row = providerRow(date, filingDate, vendor, extra);
  const reason = `Income classification conflict for revenue: vendor ${vendor}, filed ${filed} USD, ${evidence.periodStart} through ${date}; a reconciled EBIT does not establish expense placement`;
  return { ...row, revenue: null as unknown as undefined, fieldConflicts: { revenue: { usable: false, vendorValue: vendor, secValue: filed, reason,
    secEvidence: { source: "edgar", unit: "USD", periodEnd: date, observedAt: AT, ...evidence } } } };
}
const TEN_K_2025 = { accn: "0001628280-26-008131", filed: "2026-02-13", form: "10-K" };

/** JPMorgan's annual rows as the stored snapshot holds them: fiscal 2025 refused, older years the provider's figure, unchecked. */
function jpmAnnualRows(): Row[] {
  return [
    refusedRow("2025-12-31", "2026-02-13", 279_745 * M, 182_447 * M, { periodStart: "2025-01-01", tags: ["us-gaap/Revenues"], filings: [TEN_K_2025] }),
    providerRow("2024-12-31", "2025-02-14", gross(177_556 * M)),
    providerRow("2023-12-31", "2024-02-16", gross(158_104 * M)),
    providerRow("2022-12-31", "2023-02-21", gross(128_695 * M)),
    providerRow("2021-12-31", "2022-02-22", gross(121_649 * M)),
    providerRow("2020-12-31", "2021-02-23", gross(119_543 * M)),
  ];
}
const JPM_ANNUAL_FILED: [string, number, string][] = [
  ["2025-12-31", 182_447 * M, "0001628280-26-008131"],
  ["2024-12-31", 177_556 * M, "0001628280-26-008131"],
  ["2023-12-31", 158_104 * M, "0001628280-26-008131"],
  ["2022-12-31", 128_695 * M, "0000019617-25-000270"],
  ["2021-12-31", 121_649 * M, "0000019617-24-000225"],
  // Restated: the fiscal 2020 10-K stated 119,543M; the fiscal 2021 and 2022 10-Ks state 119,951M (P2: the newest filing).
  ["2020-12-31", 119_951 * M, "0000019617-23-000231"],
];

describe("D-257: JPMorgan on its filed facts", () => {
  it("replaces the refused fiscal 2025 revenue and the provider's older years with the filed total net revenue", () => {
    const out = classify(jpmAnnualRows(), jpmFacts(), "annual", { bankRevenue: true, earningsOnly: true });
    for (const [date, filed, accn] of JPM_ANNUAL_FILED) {
      const row = out.rows.find(r => r.date === date)!;
      expect(row.revenue, date).toBe(filed);
      expect(row.fieldProvenance?.revenue, date).toMatchObject({ source: "edgar", unit: "USD", periodStart: `${date.slice(0, 4)}-01-01`, periodEnd: date,
        tags: ["us-gaap/Revenues"], filings: [{ accn, form: "10-K" }] });
      expect(row.fieldConflicts?.revenue, date).toMatchObject({ usable: true, resolution: "filed-family", secValue: filed });
      // The provider subtotals built on the provider's revenue go with it; no margin is left on a mixed basis.
      for (const field of ["costOfRevenue", "grossProfit", "operatingIncome", "operatingExpenses"]) {
        expect(row[field], `${date} ${field}`).toBeNull();
        expect(row.fieldConflicts?.[field]?.usable, `${date} ${field}`).toBe(false);
      }
    }
    expect(out.rows[0]!.fieldConflicts!.revenue!.vendorValue).toBe(279_745 * M);
    expect(out.rows[0]!.fieldConflicts!.revenue!.reason).toContain("net interest income 95443000000 plus noninterest income 87004000000");
    // One informational entry for the statement, and no data gap.
    expect(out.gaps.map(g => [g.field, g.severity, g.expected])).toEqual([["statements.incomeAnnual.revenue.bankNetRevenue", "info", true]]);
    expect(out.gaps[0]!.reason).toContain("2025-12-31 182447000000 USD (10-K 0001628280-26-008131)");
    expect(out.gaps[0]!.reason).toContain("2020-12-31 119951000000 USD (10-K 0000019617-23-000231)");
    // The refusal that stood is reported cleared, by its own sentence.
    expect(out.cleared).toEqual([{ field: "statements.income.2025-12-31.revenue", reason: jpmAnnualRows()[0]!.fieldConflicts!.revenue!.reason }]);
  });

  it("adopts each quarter from its own filing, and the fourth quarter as fiscal year minus nine months", () => {
    const q = (date: string, filingDate: string, filedNet: number, period: string) => providerRow(date, filingDate, gross(filedNet), { period });
    const rows = [
      refusedRow("2026-09-30", "2026-11-03", 76_192 * M, 50_172 * M, { periodStart: "2026-07-01", tags: ["us-gaap/RevenuesNetOfInterestExpense"],
        filings: [{ accn: "0001628280-26-069523", filed: "2026-11-03", form: "10-Q" }] }, { period: "Q3" }),
      q("2026-06-30", "2026-08-06", 57_347 * M, "Q2"), q("2026-03-31", "2026-05-01", 49_836 * M, "Q1"), q("2025-12-31", "2026-02-13", 45_798 * M, "Q4"),
      q("2025-09-30", "2025-11-04", 46_427 * M, "Q3"),
    ];
    const out = classify(rows, jpmFacts(), "quarter", { bankRevenue: true, earningsOnly: true });
    expect(out.rows.map(r => r.revenue)).toEqual([50_172 * M, 57_347 * M, 49_836 * M, 45_798 * M, 46_427 * M]);
    expect(out.rows[0]!.fieldProvenance?.revenue).toMatchObject({ tags: ["us-gaap/RevenuesNetOfInterestExpense"], periodStart: "2026-07-01",
      filings: [{ accn: "0001628280-26-069523", form: "10-Q" }] });
    // Fiscal 2025 (182,447M, 10-K) less the nine months to 2025-09-30 (136,649M, 10-Q): 45,798M; components 24,995M + 20,803M.
    expect(out.rows[3]!.fieldProvenance?.revenue).toMatchObject({ derivation: "fy-minus-ytd", periodStart: "2025-10-01",
      filings: [{ accn: "0001628280-26-008131", form: "10-K" }, { accn: "0001628280-25-048859", form: "10-Q" }] });
    expect(out.rows[3]!.fieldConflicts!.revenue!.reason).toContain("net interest income 24995000000 plus noninterest income 20803000000");
    // The trailing four quarters are one basis: nine months 2026 (157,355M) + fiscal 2025 (182,447M) - nine months 2025 (136,649M).
    expect(out.rows.slice(0, 4).reduce((sum, r) => sum + r.revenue!, 0)).toBe(203_153 * M);
    expect(out.gaps.map(g => g.field)).toEqual(["statements.incomeQuarterly.revenue.bankNetRevenue"]);
  });

  it("gives the same rows at acquisition, where no refusal has been stored yet, and changes nothing on a second pass", () => {
    const fresh = jpmAnnualRows();
    fresh[0] = providerRow("2025-12-31", "2026-02-13", 279_745 * M);
    const first = classify(fresh, jpmFacts(), "annual");
    expect(first.rows.map(r => r.revenue)).toEqual(JPM_ANNUAL_FILED.map(([, filed]) => filed));
    expect(first.gaps.filter(g => g.severity !== "info")).toEqual([]);
    expect(first.cleared).toBeUndefined();
    const second = enrichIncomeClassification(first.income, jpmFacts(), "annual", AT, { bankRevenue: true, earningsOnly: true });
    expect(second.income).toEqual(first.income);
    expect(second.gaps).toEqual([]);
  });

  it("names the proof: the total, its two components, one filing, the exact period", () => {
    const built = buildStatementsFromCompanyFacts(jpmFacts(), { symbol: "JPM", cik: "19617", asOf: "2026-11-12", factsObservedAt: AT, annualPeriods: 8, quarterlyPeriods: 8,
      bankRevenue: true, vendorSplits: { status: "unavailable", source: "test", reason: "monetary only" } });
    const sec = built.incomeAnnual.rows.find(r => r.date === "2025-12-31")!;
    const proven = provenBankRevenue({ date: "2025-12-31", reportedCurrency: "USD" }, sec)!;
    expect(proven.value).toBe(182_447 * M);
    expect(proven.components.map(line => [line.proof.tags[0], line.value])).toEqual([["us-gaap/InterestIncomeExpenseNet", 95_443 * M], ["us-gaap/NoninterestIncome", 87_004 * M]]);
    expect(proven.components.every(line => line.proof.filings.length === 1 && line.proof.filings[0]!.accn === "0001628280-26-008131")).toBe(true);
    // Another currency, another period end, or a stated start that is not the filing's: no proof.
    expect(provenBankRevenue({ date: "2025-12-31", reportedCurrency: "EUR" }, sec)).toBeNull();
    expect(provenBankRevenue({ date: "2025-12-30", reportedCurrency: "USD" }, sec)).toBeNull();
    expect(provenBankRevenue({ date: "2025-12-31", reportedCurrency: "USD", periodStart: "2025-02-01" }, sec)).toBeNull();
  });
});

/** One fiscal year of a bank in companyfacts shape. */
function bankYear(cik: number, total: { tag: "Revenues" | "RevenuesNetOfInterestExpense"; val: number }, netInterest: number, noninterest: number): CompanyFacts {
  const point = { start: "2025-01-01", end: "2025-12-31", accn: "0000000000-26-000001", filed: "2026-02-20", form: "10-K", fy: 2025, fp: "FY" };
  return { cik, entityName: "CONTROL BANK", facts: { "us-gaap": {
    [total.tag]: { units: { USD: [{ ...point, val: total.val }] } },
    InterestIncomeExpenseNet: { units: { USD: [{ ...point, val: netInterest }] } },
    NoninterestIncome: { units: { USD: [{ ...point, val: noninterest }] } },
  } } };
}
const controlRow = (cik: number, revenue: number): Row => ({ ...providerRow("2025-12-31", "2026-02-20", revenue), cik: String(cik) });

describe("D-257: other filers", () => {
  it.each([
    // Bank of America tags `Revenues` only; Wells Fargo tags `RevenuesNetOfInterestExpense` (bank_xbrl_tag_matrix.json).
    ["Bank of America, fiscal 2025", 70858, { tag: "Revenues" as const, val: 113_097 * M }, 60_096 * M, 53_001 * M],
    ["Wells Fargo, fiscal 2025", 72971, { tag: "RevenuesNetOfInterestExpense" as const, val: 83_699 * M }, 47_484 * M, 36_215 * M],
  ])("control bank: %s takes its filed total", (_name, cik, total, netInterest, noninterest) => {
    const out = classify([controlRow(cik, gross(total.val))], bankYear(cik, total, netInterest, noninterest), "annual");
    expect(out.rows[0]).toMatchObject({ revenue: total.val, grossProfit: null, fieldProvenance: { revenue: { tags: [`us-gaap/${total.tag}`] } },
      fieldConflicts: { revenue: { usable: true, resolution: "filed-family", vendorValue: gross(total.val), secValue: total.val } } });
    expect(out.gaps.map(g => g.severity)).toEqual(["info"]);
  });

  it("a bank whose components do not add up to the total stays refused, at acquisition and in a stored row", () => {
    const facts = bankYear(70858, { tag: "Revenues", val: 113_097 * M }, 60_096 * M, 53_000 * M);
    const fresh = classify([controlRow(70858, gross(113_097 * M))], facts, "annual");
    expect(fresh.rows[0]!.revenue).toBeNull();
    expect(fresh.rows[0]!.fieldConflicts?.revenue).toMatchObject({ usable: false, secValue: 113_097 * M });
    expect(fresh.gaps.some(g => g.field === "statements.income.2025-12-31.revenue" && g.severity === "warn")).toBe(true);
    const stored = { ...refusedRow("2025-12-31", "2026-02-20", gross(113_097 * M), 113_097 * M, { periodStart: "2025-01-01", tags: ["us-gaap/Revenues"],
      filings: [{ accn: "0000000000-26-000001", filed: "2026-02-20", form: "10-K" }] }), cik: "70858" };
    const replay = classify([stored], facts, "annual", { bankRevenue: true, earningsOnly: true });
    expect(replay.rows[0]).toEqual(stored);
    expect(replay.cleared).toBeUndefined();
    // A missing component is the same: nothing is plugged.
    const noComponent = bankYear(70858, { tag: "Revenues", val: 113_097 * M }, 60_096 * M, 53_001 * M);
    delete noComponent.facts["us-gaap"]!.NoninterestIncome;
    expect(classify([stored], noComponent, "annual", { bankRevenue: true, earningsOnly: true }).rows[0]).toEqual(stored);
  });

  it("a refusal that stands on other evidence is not cleared (P11)", () => {
    const facts = bankYear(70858, { tag: "Revenues", val: 113_097 * M }, 60_096 * M, 53_001 * M);
    const other = { ...refusedRow("2025-12-31", "2026-02-20", gross(113_097 * M), 113_000 * M, { periodStart: "2025-01-01", tags: ["us-gaap/Revenues"],
      filings: [{ accn: "0000000000-26-000001", filed: "2026-02-20", form: "10-K" }] }), cik: "70858" };
    expect(classify([other], facts, "annual", { bankRevenue: true, earningsOnly: true }).rows[0]).toEqual(other);
    const contract = { ...refusedRow("2025-12-31", "2026-02-20", gross(113_097 * M), 113_097 * M, { periodStart: "2025-01-01",
      tags: ["us-gaap/RevenueFromContractWithCustomerExcludingAssessedTax"], filings: [{ accn: "0000000000-26-000001", filed: "2026-02-20", form: "10-K" }] }), cik: "70858" };
    expect(classify([contract], facts, "annual", { bankRevenue: true, earningsOnly: true }).rows[0]).toEqual(contract);
  });

  it("a row whose stated period start is not the filing's is not adopted; beside an adopted row it is withheld", () => {
    const facts = jpmFacts();
    const shifted = providerRow("2024-12-31", "2025-02-14", gross(177_556 * M), { periodStart: "2024-02-01" });
    // Alone, with nothing established against the filed total in the row's own filing, it stays exactly as it was.
    expect(classify([shifted], facts, "annual", { bankRevenue: true, earningsOnly: true }).rows[0]).toEqual(shifted);
    const out = classify([jpmAnnualRows()[0]!, shifted], facts, "annual", { bankRevenue: true, earningsOnly: true });
    expect(out.rows[0]!.revenue).toBe(182_447 * M);
    expect(out.rows[1]!.revenue).toBeNull();
    expect(out.rows[1]!.fieldConflicts?.revenue).toMatchObject({ usable: false, vendorValue: gross(177_556 * M), secValue: null });
    expect(out.gaps.find(g => g.field === "statements.income.2024-12-31.revenue")).toMatchObject({ severity: "warn" });
    expect(out.rows[1]!.fieldConflicts!.revenue!.reason).toContain("no filed total for the row's own period is available");
    // The same for a row of another registrant in the statement: this issuer's filings cannot prove it.
    const foreign = { ...providerRow("2024-12-31", "2025-02-14", gross(177_556 * M)), cik: "0000070858" };
    const mixed = classify([jpmAnnualRows()[0]!, foreign], facts, "annual", { bankRevenue: true, earningsOnly: true });
    expect(mixed.rows.map(r => r.revenue)).toEqual([182_447 * M, null]);
  });

  it("a year the filing cannot prove is withheld beside the years it can: no series mixes the two bases (P13)", () => {
    const facts = jpmFacts();
    const points = (facts.facts["us-gaap"]!.NoninterestIncome as { units: { USD: { end: string; start?: string }[] } }).units;
    points.USD = points.USD.filter(p => !(p.start === "2022-01-01" && p.end === "2022-12-31"));
    const out = classify(jpmAnnualRows(), facts, "annual", { bankRevenue: true, earningsOnly: true });
    expect(out.rows.map(r => r.revenue)).toEqual([182_447 * M, 177_556 * M, 158_104 * M, null, 121_649 * M, 119_951 * M]);
    expect(out.rows[3]!.fieldConflicts?.revenue).toMatchObject({ usable: false, vendorValue: gross(128_695 * M), secValue: 128_695 * M });
    expect(out.rows[3]!.fieldConflicts!.revenue!.reason).toContain("is not proven by net interest income plus noninterest income");
    // Its provider subtotals are left as observations of a refused row; nothing new is invented for it.
    expect(out.rows[3]!.grossProfit).toBe(gross(128_695 * M) * 0.6);
  });

  it("moves nothing when the provider's revenue is not established as a different figure", () => {
    const facts = jpmFacts();
    // The newest year agrees with its own filing; an older year differs only from a later restatement. As before D-257.
    const rows = [providerRow("2025-12-31", "2026-02-13", 182_447 * M), providerRow("2020-12-31", "2021-02-23", 119_543 * M)];
    const out = classify(rows, facts, "annual", { bankRevenue: true, earningsOnly: true });
    expect(out.rows).toEqual(rows);
    expect(out.gaps).toEqual([]);
  });

  it("leaves the securities-firm rule as it was, also when the calculation view sets both routes for SIC 6211", () => {
    const facts = bankYear(886982, { tag: "RevenuesNetOfInterestExpense", val: 58_283 * M }, 9_000 * M, 49_283 * M);
    const row = { ...providerRow("2025-12-31", "2026-02-20", 125_097 * M), cik: "886982" };
    const securities = classify([row], facts, "annual", { securitiesRevenue: true });
    const both = classify([row], facts, "annual", { securitiesRevenue: true, bankRevenue: true });
    for (const out of [securities, both]) {
      expect(out.rows[0]).toMatchObject({ revenue: 58_283 * M, costOfRevenue: null, grossProfit: null, operatingIncome: null, operatingExpenses: null });
      expect(out.rows[0]!.fieldConflicts?.revenue).toBeUndefined();
      expect(out.gaps.find(g => g.field === "statements.income.2025-12-31.revenue")!.reason).toMatch(/^Securities-firm revenue reconciled from vendor 125097000000 gross of interest expense/);
      expect(out.gaps.some(g => g.field.endsWith("bankNetRevenue"))).toBe(false);
    }
    expect(both.rows).toEqual(securities.rows);
  });

  it("does not reach an insurer or an industrial: without bank routing the classification is unchanged", () => {
    // The same filed identity under a filer that is not routed as a bank: the general rule decides, as before.
    const facts = bankYear(80661, { tag: "Revenues", val: 113_097 * M }, 60_096 * M, 53_001 * M);
    const row = { ...providerRow("2025-12-31", "2026-02-20", gross(113_097 * M)), cik: "80661" };
    for (const opts of [{}, { earningsOnly: true }]) {
      const out = classify([row], facts, "annual", opts);
      expect(out.rows[0]!.revenue === 113_097 * M && out.rows[0]!.fieldConflicts?.revenue?.resolution === "filed-family"
        && out.gaps.some(g => g.field.endsWith("bankNetRevenue"))).toBe(false);
      expect(out.gaps.some(g => g.field.endsWith("bankNetRevenue"))).toBe(false);
      expect(out.rows[0]!.fieldConflicts?.costOfRevenue).toBeUndefined();
    }
    // An industrial with ordinary revenue: no bank total, no bank components, nothing to do even if it were routed as a bank.
    const industrial: CompanyFacts = { cik: 1, entityName: "INDUSTRIAL", facts: { "us-gaap": {
      RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [{ start: "2025-01-01", end: "2025-12-31", val: 500 * M, accn: "0000000001-26-000001", filed: "2026-02-20", form: "10-K", fy: 2025, fp: "FY" }] } } } } };
    const plain = { ...providerRow("2025-12-31", "2026-02-20", 500 * M), cik: "1" };
    expect(classify([plain], industrial, "annual", { bankRevenue: true, earningsOnly: true }).rows[0]).toEqual(plain);
  });
});

/** A synthetic bank bundle carrying JPMorgan's filed revenue lines and a provider revenue gross of interest expense. */
function bankBundle(edit: (facts: CompanyFacts) => void = () => {}): DataBundle {
  const bundle = buildSyntheticRouteBundle("bank");
  bundle.edgar.sic = "6021";
  const facts = jpmFacts();
  // The synthetic rows keep their own earnings; only the revenue lines are JPMorgan's.
  delete facts.facts["us-gaap"]!.NetIncomeLoss;
  edit(facts);
  const filed: Record<string, [string, number]> = {
    "2025-12-31": ["2026-02-13", 182_447 * M], "2024-12-31": ["2025-02-14", 177_556 * M], "2023-12-31": ["2024-02-16", 158_104 * M], "2022-12-31": ["2023-02-21", 128_695 * M] };
  const annual = bundle.statements.incomeAnnual;
  if (!annual.ok) throw new Error("annual income required");
  for (const row of annual.value.data.rows) {
    const [filingDate, net] = filed[String(row.date)]!;
    Object.assign(row, { cik: "0000019617", filingDate, revenue: gross(net), costOfRevenue: gross(net) * 0.4, grossProfit: gross(net) * 0.6 });
  }
  // As a provider payload does, keep the rows as received: the row-integrity check reads them, not the admitted view.
  annual.value.data.raw = structuredClone(annual.value.data.rows);
  return withIssuerFacts(bundle, facts);
}
const annualRows = (bundle: DataBundle): Row[] => { const f = bundle.statements.incomeAnnual; if (!f.ok) throw new Error("annual income required"); return f.value.data.rows; };

describe("D-257: through the calculation view and Stage B", () => {
  it("the view moves the history to the filed basis and the stored bundle keeps its bytes", () => {
    const bundle = bankBundle();
    const before = structuredClone(bundle);
    const view = withIncomeOperatingBasis(bundle);
    expect(bundle).toEqual(before);
    expect(annualRows(view).map(r => r.revenue)).toEqual([182_447 * M, 177_556 * M, 158_104 * M, 128_695 * M]);
    expect(annualRows(view).every(r => r.grossProfit == null && r.fieldConflicts?.grossProfit?.usable === false)).toBe(true);
    expect(view.gaps.filter(g => g.field === "statements.incomeAnnual.revenue.bankNetRevenue")).toHaveLength(1);
  });

  it("revenue growth is computed on the filed totals, with no revenue eligibility refusal", () => {
    const computed = runStageB(bankBundle(), { evIncludeLeases: false });
    expect(computed.gaps.some(g => g.field === "eligibility.annual.revenue")).toBe(false);
    const oneYear = computed.growth.revenueCagrs.find(c => c.windowYears === 1)!;
    expect(oneYear).toMatchObject({ startValue: 177_556 * M, endValue: 182_447 * M, startDate: "2024-12-31", endDate: "2025-12-31" });
    expect(oneYear.cagrPct).toBeCloseTo((182_447 / 177_556 - 1) * 100, 9);
    const threeYear = computed.growth.revenueCagrs.find(c => c.windowYears === 3)!;
    expect(threeYear.cagrPct).toBeCloseTo((Math.cbrt(182_447 / 128_695) - 1) * 100, 9);
    // The gross and operating margins stay what the bank route makes them: not shown.
    expect(computed.growth.margins.gross.series).toEqual([]);
    expect(computed.growth.margins.operating.series).toEqual([]);
  });

  it("with one year unproven the series is withheld by the standing eligibility rule, not mixed", () => {
    const computed = runStageB(bankBundle(facts => {
      const units = (facts.facts["us-gaap"]!.InterestIncomeExpenseNet as { units: { USD: { end: string; start?: string }[] } }).units;
      units.USD = units.USD.filter(p => !(p.start === "2023-01-01" && p.end === "2023-12-31"));
    }), { evIncludeLeases: false });
    const refusal = computed.gaps.find(g => g.field === "eligibility.annual.revenue");
    expect(refusal?.reason).toContain("Annual revenue definitions are unreconciled (statements.income.2023-12-31.revenue)");
    expect(computed.growth.revenueCagrs.every(c => c.cagrPct === null)).toBe(true);
  });

  it("retires the stored refusal's manifest entry, and only that entry", () => {
    const bundle = bankBundle();
    const stored = refusedRow("2025-12-31", "2026-02-13", 279_745 * M, 182_447 * M, { periodStart: "2025-01-01", tags: ["us-gaap/Revenues"], filings: [TEN_K_2025] });
    Object.assign(annualRows(bundle)[0]!, { revenue: null, fieldConflicts: stored.fieldConflicts });
    const reason = stored.fieldConflicts!.revenue!.reason;
    const entries = [
      { field: "statements.income.2025-12-31.revenue", reason, severity: "warn" as const },
      { field: "statements.income.2025-12-31.revenue", reason: "another warning on the same field", severity: "warn" as const },
      { field: "statements.income.2025-12-31.grossProfit", reason, severity: "warn" as const },
    ];
    bundle.gaps = [...bundle.gaps, entries[0]!];
    expect(bankRevenueManifest(bundle, entries)).toEqual(entries.slice(1));
    expect(withIncomeOperatingBasis(bundle).gaps.some(g => g.reason === reason)).toBe(false);
    expect(annualRows(withIncomeOperatingBasis(bundle))[0]!.revenue).toBe(182_447 * M);
    // A bundle with nothing refused against a bank total is returned as given.
    expect(bankRevenueManifest(bankBundle(), entries)).toEqual(entries);
    expect(bankRevenueManifest(buildSyntheticRouteBundle("general"), entries)).toEqual(entries);
  });
});
