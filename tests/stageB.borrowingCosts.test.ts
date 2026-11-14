import { describe, expect, it } from "vitest";
import type { CompanyFacts } from "@/edgar/xbrl";
import { priorYearCostOfDebt, runStageB } from "@/pipeline/compute";
import { computeWacc, waccDisclosure, type WaccInputs } from "@/pipeline/stageB/returns";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { completeCurrencyBundle, M } from "./helpers/currencyBundle";
import { withIssuerFacts } from "./helpers/confirmedIssuer";

const accn = "0000000042-26-000001";
const point = (val: number, end: string, start?: string, filing = accn) =>
  ({ val, end, ...(start ? { start } : {}), accn: filing, filed: "2026-04-30", form: "10-Q" });
function facts(tags: Record<string, ReturnType<typeof point>[]>): CompanyFacts {
  return { cik: 42, entityName: "Synthetic borrower", facts: { "us-gaap": Object.fromEntries(
    Object.entries(tags).map(([tag, points]) => [tag, { units: { USD: points } }]),
  ) } };
}
function capitalizedBundle(kind: "incurred" | "release", confirmed = true) {
  const b = completeCurrencyBundle({ debt: 300, siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
  if (!b.statements.incomeAnnual.ok || !b.statements.incomeQuarterly.ok) throw Error("fixture");
  for (const r of [...b.statements.incomeAnnual.value.data.rows, ...b.statements.incomeQuarterly.value.data.rows]) r.interestExpense = 0;
  b.statements.incomeQuarterly.value.data.rows[0]!.interestExpense = (kind === "incurred" ? 5 : 2) * M;
  return withIssuerFacts(b, facts({
    InterestCostsIncurred: [point(5 * M, "2026-03-31", "2026-01-01")],
    RealEstateInventoryCapitalizedInterestCostsCostOfSales1: [point(2 * M, "2026-03-31", "2026-01-01")],
    RealEstateInventoryCapitalizedInterestCosts: [point(10 * M, "2025-12-31"), point(13 * M, "2026-03-31")],
  }), confirmed);
}

describe("capitalized borrowing costs are not income-statement interest", () => {
  it.each(["incurred", "release"] as const)("refuses a provider %s amount before WACC and coverage grading", kind => {
    const b = capitalizedBundle(kind), original = JSON.stringify(b);
    const c = runStageB(b);
    expect(c.returns.wacc.waccPct).toBeNull();
    expect(c.returns.wacc.interestCoverageRatio).toBeNull();
    expect(c.capital.interestCoverage.value).toBeNull();
    expect(c.capital.current?.interestCoverage).toBeNull();
    expect(c.scores.aspects.balanceSheet.signals?.some(s => s.id === "interestCoverage") ?? false).toBe(false);
    expect(c.gaps.some(g => g.field === "statements.income.2026-03-31.interestExpense" && /capitalized/i.test(g.reason))).toBe(true);
    const payload = assembleContextPayload(b, c, { checks: [], flags: [], gaps: [] });
    const quarterly = payload.statements.find(s => s.title === "Income statement — quarterly");
    expect(quarterly?.lineItems.find(l => l.lineItem === "interest expense")?.byPeriod.find(p => p.period === "2026-03-31")?.value).toBeNull();
    expect(quarterly?.notes.join(" ")).toMatch(/capitalized-interest rollforward/i);
    expect(JSON.stringify(b)).toBe(original);
  });

  it.each(["different-amount", "different-currency", "different-filing", "future-fact", "unconfirmed-issuer", "not-all-capitalized", "direct-expense"] as const)(
    "does not infer a capitalized-interest misclassification without matching evidence: %s", mode => {
      const b = capitalizedBundle("incurred", mode !== "unconfirmed-issuer");
      if (!b.edgar.companyFacts.ok || !b.statements.incomeQuarterly.ok) throw Error("fixture");
      const tags = b.edgar.companyFacts.value.data.facts["us-gaap"]!;
      const incurred = tags.InterestCostsIncurred as { units: { USD: ReturnType<typeof point>[]; EUR?: ReturnType<typeof point>[] } };
      const balances = tags.RealEstateInventoryCapitalizedInterestCosts as { units: { USD: ReturnType<typeof point>[] } };
      if (mode === "different-amount") b.statements.incomeQuarterly.value.data.rows[0]!.interestExpense = 4 * M;
      if (mode === "different-currency") { incurred.units.EUR = incurred.units.USD; incurred.units.USD = []; }
      if (mode === "different-filing") balances.units.USD[0]!.accn = "0000000042-25-000001";
      if (mode === "future-fact") incurred.units.USD[0]!.filed = "2027-04-30";
      if (mode === "not-all-capitalized") balances.units.USD[1]!.val = 12 * M;
      if (mode === "direct-expense") tags.InterestExpense = { units: { USD: [point(5 * M, "2026-03-31", "2026-01-01")] } };
      expect(runStageB(b).returns.wacc.waccPct).not.toBeNull();
    },
  );

  it("does not let an older expense copy overrule a newer capitalized-interest presentation", () => {
    const b = capitalizedBundle("incurred");
    if (!b.edgar.companyFacts.ok) throw Error("fixture");
    b.edgar.companyFacts.value.data.facts["us-gaap"]!.InterestExpense = {
      units: { USD: [{ ...point(5 * M, "2026-03-31", "2026-01-01"), filed: "2026-04-15", accn: "0000000042-26-000000" }] },
    };
    expect(runStageB(b).returns.wacc.waccPct).toBeNull();
  });

  it.each([
    "incurred", "release", "newer-operating", "latest-preferred-copy", "operating-only", "legacy-preferred",
  ] as const)("retains corroborated expense using direct-concept priority: %s", mode => {
    const kind = mode === "release" ? "release" : "incurred";
    const b = capitalizedBundle(kind), amount = (kind === "release" ? 2 : 5) * M;
    if (!b.edgar.companyFacts.ok) throw Error("fixture");
    const tags = b.edgar.companyFacts.value.data.facts["us-gaap"]!;
    const preferred = [point(amount, "2026-03-31", "2026-01-01")];
    const operating = point(7 * M, "2026-03-31", "2026-01-01");
    if (mode === "newer-operating") { operating.filed = "2026-05-15"; operating.accn = "0000000042-26-000002"; }
    if (mode === "latest-preferred-copy") {
      preferred[0]!.val = 4 * M;
      preferred.push({ ...preferred[0]!, val: amount, filed: "2026-05-15", accn: "0000000042-26-000002" });
    }
    if (mode === "operating-only") operating.val = amount;
    else tags.InterestExpenseNonoperating = { units: { USD: preferred } };
    if (mode === "legacy-preferred") {
      preferred[0]!.val = 4 * M;
      tags.InterestExpense = { units: { USD: [point(amount, "2026-03-31", "2026-01-01")] } };
    }
    tags.InterestExpenseOperating = { units: { USD: [operating] } };
    const original = JSON.stringify(b), c = runStageB(b);
    expect(c.returns.wacc.waccPct).not.toBeNull();
    expect(c.returns.wacc.interestCoverageRatio).not.toBeNull();
    expect(c.capital.current?.interestCoverage).toBeGreaterThan(0);
    expect(c.gaps.some(g => g.field === "statements.income.2026-03-31.interestExpense")).toBe(false);
    const payload = assembleContextPayload(b, c, { checks: [], flags: [], gaps: [] });
    const quarterly = payload.statements.find(s => s.title === "Income statement — quarterly");
    expect(quarterly?.lineItems.find(l => l.lineItem === "interest expense")?.byPeriod.find(p => p.period === "2026-03-31")?.value).toBe(amount);
    expect(JSON.stringify(b)).toBe(original);
  });

  it.each(["lower-priority-match", "latest-preferred-copy", "legacy-preferred"] as const)(
    "uses the preferred filed expense instead of a superseded or lower-priority vendor match: %s", mode => {
      const b = capitalizedBundle("incurred");
      if (!b.edgar.companyFacts.ok) throw Error("fixture");
      const tags = b.edgar.companyFacts.value.data.facts["us-gaap"]!;
      const preferred = [point(4 * M, "2026-03-31", "2026-01-01")];
      if (mode === "latest-preferred-copy") {
        preferred.push({ ...preferred[0]!, val: 5 * M });
        preferred[0]!.filed = "2026-05-15"; preferred[0]!.accn = "0000000042-26-000002";
      }
      if (mode === "legacy-preferred") {
        tags.InterestExpense = { units: { USD: [point(4 * M, "2026-03-31", "2026-01-01")] } };
        preferred[0]!.val = 5 * M;
      }
      tags.InterestExpenseNonoperating = { units: { USD: preferred } };
      tags.InterestExpenseOperating = { units: { USD: [point(5 * M, "2026-03-31", "2026-01-01")] } };
      const original = JSON.stringify(b), c = runStageB(b);
      expect(c.returns.wacc.waccPct).not.toBeNull();
      expect(c.returns.wacc.interestCoverageRatio).toBeGreaterThan(0);
      expect(c.capital.current?.interestCoverage).toBeGreaterThan(0);
      const correction = c.gaps.find(g => g.field === "statements.income.2026-03-31.interestExpense");
      expect(correction?.reason).toContain("corrected from vendor 5M to 4M USD");
      expect(correction?.reason).toContain(mode === "legacy-preferred" ? "us-gaap/InterestExpense," : "us-gaap/InterestExpenseNonoperating,");
      expect(correction?.reason).toContain(mode === "latest-preferred-copy" ? "0000000042-26-000002" : accn);
      const payload = assembleContextPayload(b, c, { checks: [], flags: [], gaps: [] });
      const quarterly = payload.statements.find(s => s.title === "Income statement — quarterly");
      expect(quarterly?.lineItems.find(l => l.lineItem === "interest expense")?.byPeriod.find(p => p.period === "2026-03-31")?.value).toBe(4 * M);
      expect(JSON.stringify(b)).toBe(original);
    },
  );

  it("refuses ambiguous preferred expense copies instead of falling through to a matching lower-priority concept", () => {
    const b = capitalizedBundle("incurred");
    if (!b.edgar.companyFacts.ok) throw Error("fixture");
    const tags = b.edgar.companyFacts.value.data.facts["us-gaap"]!;
    tags.InterestExpenseNonoperating = { units: { USD: [
      point(4 * M, "2026-03-31", "2026-01-01"), point(5 * M, "2026-03-31", "2026-01-01"),
    ] } };
    tags.InterestExpenseOperating = { units: { USD: [point(5 * M, "2026-03-31", "2026-01-01")] } };
    const c = runStageB(b);
    expect(c.returns.wacc.waccPct).toBeNull();
    expect(c.capital.interestCoverage.value).toBeNull();
    expect(c.gaps.some(g => g.field === "statements.income.2026-03-31.interestExpense" && /capitalized/i.test(g.reason))).toBe(true);
  });

  it("keeps a minimal legacy bundle without companyfacts usable", () => {
    const b = capitalizedBundle("incurred");
    Reflect.deleteProperty(b.edgar, "companyFacts");
    if (!b.statements.incomeQuarterly.ok) throw Error("fixture");
    for (const row of b.statements.incomeQuarterly.value.data.rows) row.interestExpense = 0;
    expect(runStageB(b).returns.wacc.waccPct).toBeNull();
  });
});

const income = [
  { date: "2026-09-30", reportedCurrency: "USD", interestExpense: 0, operatingIncome: 500 },
  { date: "2025-09-30", reportedCurrency: "USD", interestExpense: 0, operatingIncome: 450 },
];
const balance = [
  { date: "2026-09-30", reportedCurrency: "USD", totalDebt: 1_200 },
  { date: "2025-09-30", reportedCurrency: "USD", totalDebt: 1_100 },
  { date: "2024-09-30", reportedCurrency: "USD", totalDebt: 900 },
];
const wacc: WaccInputs = { beta: 1, riskFreePct: 4, erpPct: 5, interestExpenseTtm: 0, totalDebtAvg: 1_150,
  marketCap: 9_000, effectiveTaxRate: .2, ebitTtm: 500, totalAssets: 10_000, reportedCurrency: "USD", quoteCurrency: "USD" };
function historicalEvidence() {
  const f = facts({
    InterestCostsIncurred: [point(40, "2025-09-30", "2024-10-01")],
    NotesPayable: [point(900, "2024-09-30"), point(1_100, "2025-09-30")],
  });
  for (const tag of Object.values(f.facts["us-gaap"]!)) for (const p of (tag as { units: { USD: ReturnType<typeof point>[] } }).units.USD) {
    p.form = "10-K"; p.filed = "2025-11-15"; p.accn = "0000000042-25-000001";
  }
  return { facts: f, observedAt: "2026-11-01T00:00:00Z" };
}

describe("historical filed interest incurred is a separate borrowing-cost basis", () => {
  it.each([80, 40, 0])("does not revive an older annual cost after a later core filing reports %s for the same annual duration", value => {
    const evidence = historicalEvidence();
    const incurred = evidence.facts.facts["us-gaap"]!.InterestCostsIncurred as { units: { USD: ReturnType<typeof point>[] } };
    incurred.units.USD.push({ ...incurred.units.USD[0]!, val: value, form: "10-Q", filed: "2026-02-15", accn: "0000000042-26-000002" });
    const prior = priorYearCostOfDebt(income, balance, { borrowingCostEvidence: evidence });
    expect(prior).toBeNull();
    expect(computeWacc({ ...wacc, priorYearCostOfDebt: prior }).waccPct).toBeNull();
  });

  it.each(["non-core", "future"] as const)("keeps the available annual cost when a later observation is %s", mode => {
    const evidence = historicalEvidence();
    const incurred = evidence.facts.facts["us-gaap"]!.InterestCostsIncurred as { units: { USD: ReturnType<typeof point>[] } };
    incurred.units.USD.push({ ...incurred.units.USD[0]!, val: 80, form: mode === "non-core" ? "8-K" : "10-Q",
      filed: mode === "future" ? "2027-02-15" : "2026-02-15", accn: "0000000042-26-000002" });
    expect(priorYearCostOfDebt(income, balance, { borrowingCostEvidence: evidence })?.pct).toBe(4);
  });

  it("uses an exact annual incurred cost and matching filed debt without creating an expense or ICR", () => {
    const before = JSON.stringify(income);
    const prior = priorYearCostOfDebt(income, balance, { borrowingCostEvidence: historicalEvidence() });
    expect(prior?.pct).toBe(4); // 40 / mean(900, 1100) * 100
    expect(prior?.interestExpense).toBe(0);
    expect(prior?.borrowingCost?.amount).toBe(40);
    const result = computeWacc({ ...wacc, priorYearCostOfDebt: prior });
    expect(result.costOfDebtMethod).toBe("historical");
    expect(result.costOfDebtPct).toBe(4);
    expect(result.interestCoverageRatio).toBeNull();
    expect(result.notes.join(" ")).toMatch(/2025-09-30.*incurred|incurred.*2025-09-30/i);
    expect(result.notes.join(" ")).toContain("0000000042-25-000001");
    expect(waccDisclosure(result).summary).toContain("InterestCostsIncurred");
    expect(waccDisclosure(result).summary).toContain("2025-09-30");
    expect(result.gaps.find(g => g.field === "returns.wacc.interestExpense")?.severity).toBe("warn");
    expect(JSON.stringify(income)).toBe(before);
  });

  it("does not synthesize a rating when the incurred-cost rate is outside the existing band", () => {
    const evidence = historicalEvidence();
    (evidence.facts.facts["us-gaap"]!.InterestCostsIncurred as { units: { USD: ReturnType<typeof point>[] } }).units.USD[0]!.val = 1;
    const result = computeWacc({ ...wacc, priorYearCostOfDebt: priorYearCostOfDebt(income, balance, { borrowingCostEvidence: evidence }) });
    expect(result.waccPct).toBeNull();
    expect(result.syntheticRating).toBeNull();
  });

  it.each(["missing-incurred", "cash-paid-only", "release-only", "different-debt", "conflicting-debt-total", "missing-opening", "different-unit", "different-filing", "future-filing", "future-period", "quarter-only", "negative-cost", "conflicting-cost", "conflicting-accessions", "stale", "sparse-stale"] as const)(
    "refuses unsupported historical borrowing evidence: %s", mode => {
      const evidence = historicalEvidence(), rows = structuredClone(balance), years = structuredClone(income);
      const tags = evidence.facts.facts["us-gaap"]!;
      const incurred = tags.InterestCostsIncurred as { units: { USD: ReturnType<typeof point>[] } };
      const debt = tags.NotesPayable as { units: { USD: ReturnType<typeof point>[] } };
      if (["missing-incurred", "cash-paid-only", "release-only"].includes(mode)) delete tags.InterestCostsIncurred;
      if (mode === "cash-paid-only") tags.InterestPaid = incurred;
      if (mode === "release-only") tags.RealEstateInventoryCapitalizedInterestCostsCostOfSales1 = incurred;
      if (mode === "different-debt") rows[1]!.totalDebt = 1_200;
      if (mode === "conflicting-debt-total") tags.DebtLongtermAndShorttermCombinedAmount = {
        units: { USD: debt.units.USD.map(p => ({ ...p, val: p.val + 100 })) },
      };
      if (mode === "missing-opening") rows.pop();
      if (mode === "different-unit") rows[2]!.reportedCurrency = "EUR";
      if (mode === "different-filing") debt.units.USD[0]!.accn = "0000000042-24-000001";
      if (mode === "future-filing") incurred.units.USD[0]!.filed = "2027-11-15";
      if (mode === "future-period") evidence.observedAt = "2025-08-01";
      if (mode === "quarter-only") incurred.units.USD[0]!.start = "2025-07-01";
      if (mode === "negative-cost") incurred.units.USD[0]!.val = -40;
      if (mode === "conflicting-cost") incurred.units.USD.push({ ...incurred.units.USD[0]!, val: 50 });
      if (mode === "conflicting-accessions") incurred.units.USD.push({ ...incurred.units.USD[0]!, accn: "0000000042-25-000000", val: 50 });
      if (mode === "stale") years.splice(1, 0, ...["2025-12-31", "2025-11-30", "2025-10-31"].map(date => ({ ...years[0]!, date })));
      if (mode === "sparse-stale") { years[0]!.date = "2029-09-30"; evidence.observedAt = "2030-01-01"; }
      expect(priorYearCostOfDebt(years, rows, { borrowingCostEvidence: evidence })).toBeNull();
    },
  );

  it.each(["confirmed", "unconfirmed", "future-acquisition"] as const)("wires the separate filed cost through Stage B only with available issuer evidence: %s", mode => {
    const b = completeCurrencyBundle({ debt: 300 });
    if (!b.statements.incomeAnnual.ok || !b.statements.incomeQuarterly.ok || !b.statements.balanceAnnual.ok) throw Error("fixture");
    for (const row of [...b.statements.incomeAnnual.value.data.rows, ...b.statements.incomeQuarterly.value.data.rows]) row.interestExpense = 0;
    b.statements.balanceAnnual.value.data.rows.push({ ...b.statements.balanceAnnual.value.data.rows[1]!, date: "2023-12-31" });
    const f = facts({ InterestCostsIncurred: [point(12 * M, "2024-12-31", "2024-01-01")],
      NotesPayable: [point(300 * M, "2023-12-31"), point(300 * M, "2024-12-31")] });
    for (const tag of Object.values(f.facts["us-gaap"]!)) for (const p of (tag as { units: { USD: ReturnType<typeof point>[] } }).units.USD) {
      p.form = "10-K"; p.filed = "2025-02-15"; p.accn = "0000000042-25-000001";
    }
    withIssuerFacts(b, f, mode !== "unconfirmed");
    if (mode === "future-acquisition" && b.edgar.companyFacts.ok) b.edgar.companyFacts.value.fetchedAt = "2027-02-15";
    const before = JSON.stringify(b), result = runStageB(b);
    expect(result.returns.wacc.costOfDebtPct).toBe(mode === "confirmed" ? 4 : null);
    expect(result.returns.wacc.interestCoverageRatio).toBeNull();
    expect(result.capital.current?.interestCoverage).toBeNull();
    expect(JSON.stringify(b)).toBe(before);
  });
});
