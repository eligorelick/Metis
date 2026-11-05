import { describe, expect, it } from "vitest";
import { runStageB, ttmIncome, ttmCashFlow } from "@/pipeline/compute";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { validateBundle } from "@/pipeline/stageA/validate";
import { balanceBreakdownFailure, balanceIntegrityView } from "@/pipeline/balanceIntegrity";
import type { CompanyFacts } from "@/edgar/xbrl";
import { withIssuerFacts } from "./helpers/confirmedIssuer";
import { completeCurrencyBundle, currencyBundle, M } from "./helpers/currencyBundle";

function fixture() {
  const bundle = currencyBundle({ siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
  if (!bundle.statements.balanceQuarterly.ok) throw new Error("balances required");
  bundle.statements.balanceQuarterly.value.data.rows = bundle.statements.balanceQuarterly.value.data.rows.map((row, index) => ({
    ...row, netReceivables: 200 * M, inventory: 100 * M, propertyPlantEquipmentNet: 1000 * M, longTermInvestments: 200 * M,
    totalCurrentAssets: 600 * M, totalNonCurrentAssets: 1450 * M,
    totalDebt: (index === 0 ? 400 : 300) * M,
  }));
  return bundle;
}

function partial() {
  const bundle = fixture();
  if (!bundle.statements.balanceQuarterly.ok) throw new Error("balances required");
  const row = bundle.statements.balanceQuarterly.value.data.rows[0]!;
  Object.assign(row, { netReceivables: 0, inventory: 0, propertyPlantEquipmentNet: 0, longTermInvestments: 0,
    totalNonCurrentAssets: 0, totalCurrentAssets: 70 * M, cashAndShortTermInvestments: 400 * M,
    shortTermInvestments: 330 * M, otherCurrentAssets: -330 * M, otherAssets: 1980 * M });
  return bundle;
}

describe("partial preliminary balance rows", () => {
  it.each(["small residual", "null", "absent", "one material class"])("rejects a collapsed breakdown with %s instead of requiring exact zeros", mode => {
    const previous = { date: "2026-06-30", reportedCurrency: "USD", totalAssets: 1000, netReceivables: 200, inventory: 100, propertyPlantEquipmentNet: 500, longTermInvestments: 0 };
    const row: typeof previous & { otherAssets: number } = { ...previous, date: "2026-09-30", netReceivables: 0, inventory: 0, propertyPlantEquipmentNet: 0, otherAssets: 1000 };
    if (mode === "small residual") row.netReceivables = 1;
    if (mode === "null") Object.assign(row, { netReceivables: null, inventory: null, propertyPlantEquipmentNet: null, longTermInvestments: null });
    if (mode === "absent") for (const field of ["netReceivables", "inventory", "propertyPlantEquipmentNet", "longTermInvestments"] as const) delete (row as Partial<typeof row>)[field];
    if (mode === "one material class") Object.assign(previous, { netReceivables: 0, inventory: 0, propertyPlantEquipmentNet: 0, longTermInvestments: 800 });
    expect(balanceBreakdownFailure(row, previous)).toBeTypeOf("string");
  });

  it.each(["cash", "short-term investments", "held for sale"])("retains a genuine disposal into %s while total assets hold", destination => {
    const previous = { date: "2026-06-30", reportedCurrency: "USD", totalAssets: 1000, netReceivables: 200, inventory: 100, propertyPlantEquipmentNet: 500, longTermInvestments: 0, cashAndShortTermInvestments: 100 };
    const row = { ...previous, date: "2026-09-30", netReceivables: 0, inventory: 0, propertyPlantEquipmentNet: 0,
      cashAndShortTermInvestments: destination === "held for sale" ? 100 : 900,
      cashAndCashEquivalents: destination === "cash" ? 900 : 100,
      shortTermInvestments: destination === "short-term investments" ? 800 : 0,
      assetsHeldForSale: destination === "held for sale" ? 800 : 0 };
    expect(balanceBreakdownFailure(row, previous)).toBeNull();
  });

  it("retains a fully accounted classified presentation change", () => {
    const previous = { date: "2025-12-31", reportedCurrency: "USD", totalAssets: 1000, netReceivables: 300, inventory: 0, propertyPlantEquipmentNet: 10, longTermInvestments: 0,
      cashAndShortTermInvestments: 500, taxAssets: 100, goodwillAndIntangibleAssets: 50, otherCurrentAssets: 20, otherNonCurrentAssets: 20 };
    const row = { ...previous, date: "2026-03-31", totalAssets: 1200, netReceivables: 10, propertyPlantEquipmentNet: 0, cashAndShortTermInvestments: 550, otherCurrentAssets: 470 };
    expect(balanceBreakdownFailure(row, previous)).toBeNull();
  });

  it("keeps the complete duplicate and rejects only the matching incomplete observation", () => {
    const bundle = fixture();
    if (!bundle.statements.balanceQuarterly.ok) throw new Error("fixture");
    const data = bundle.statements.balanceQuarterly.value.data;
    const complete = data.rows[0]!;
    const stub = { ...complete, netReceivables: 0, inventory: 0, propertyPlantEquipmentNet: 0, longTermInvestments: 0, otherAssets: complete.totalAssets };
    data.raw = [stub, ...data.rows];
    expect(balanceIntegrityView(bundle).statements.balanceQuarterly).toEqual(bundle.statements.balanceQuarterly);
    data.rows = [stub, ...data.rows];
    const view = balanceIntegrityView(bundle);
    if (!view.statements.balanceQuarterly.ok) throw new Error("fixture");
    expect(view.statements.balanceQuarterly.value.data.rows.filter(row => row.date === complete.date)).toEqual([complete]);
  });

  it("dates the admitted envelope at the latest retained row", () => {
    const bundle = partial();
    if (!bundle.statements.balanceQuarterly.ok) throw new Error("fixture");
    bundle.statements.balanceQuarterly.value.asOf = "2026-03-31";
    const view = balanceIntegrityView(bundle);
    expect(view.statements.balanceQuarterly.ok && view.statements.balanceQuarterly.value.asOf).toBe("2025-12-31");
  });

  it("distinguishes same-date observations whose classified residuals have opposite signs", () => {
    const bundle = partial();
    if (!bundle.statements.balanceQuarterly.ok) throw new Error("fixture");
    const data = bundle.statements.balanceQuarterly.value.data;
    Object.assign(data.rows[0]!, { cashAndShortTermInvestments: 70 * M, otherAssets: 0, otherCurrentAssets: 1980 * M });
    data.raw = structuredClone([{ ...data.rows[0]!, otherCurrentAssets: -1980 * M }, ...data.rows]);
    const view = balanceIntegrityView(bundle);
    expect(view.statements.balanceQuarterly.ok && view.statements.balanceQuarterly.value.data.rows[0]?.date).toBe("2026-03-31");
  });

  it("still identifies an observation when its acceptance timestamp is reformatted", () => {
    const bundle = partial();
    if (!bundle.statements.balanceQuarterly.ok) throw new Error("fixture");
    const data = bundle.statements.balanceQuarterly.value.data;
    data.rows[0]!.acceptedDate = "2026-05-01 16:00:00";
    data.raw = structuredClone(data.rows);
    data.rows[0]!.acceptedDate = "2026-05-01T16:00:00Z";
    const view = balanceIntegrityView(bundle);
    expect(view.statements.balanceQuarterly.ok && view.statements.balanceQuarterly.value.data.rows[0]?.date).toBe("2025-12-31");
  });

  it.each(["incomeQuarterly", "cashflowQuarterly"] as const)("rejects an independent %s skeleton and refuses the latest TTM window", kind => {
    const bundle = companion(kind);
    if (!bundle.statements.balanceQuarterly.ok) throw new Error("fixture");
    bundle.statements.balanceQuarterly = fixture().statements.balanceQuarterly;
    const c = runStageB(bundle);
    const field = kind === "incomeQuarterly" ? "compute.ttmIncome" : "compute.ttmCashFlow";
    expect(c.gaps.some(gap => gap.field === field && gap.reason.includes("rejected"))).toBe(true);
    expect(kind === "incomeQuarterly" ? c.route.asOf.incomeTtm : c.route.asOf.cashflowTtm).toBeNull();
    const view = balanceIntegrityView(bundle);
    const family = view.statements[kind];
    expect(family.ok && family.value.data.rows.some(row => row.date === "2026-03-31")).toBe(false);
  });
  it("removes a rejected balance from calculation rows while preserving the original observation", () => {
    const bundle = partial();
    if (!bundle.statements.balanceQuarterly.ok) throw new Error("fixture");
    bundle.statements.balanceQuarterly.value.data.raw = structuredClone(bundle.statements.balanceQuarterly.value.data.rows);
    const original = JSON.stringify(bundle);
    const view = balanceIntegrityView(bundle);
    if (!view.statements.balanceQuarterly.ok) throw new Error("fixture");
    expect(view.statements.balanceQuarterly.value.data.rows.some(row => row.date === "2026-03-31")).toBe(false);
    expect(view.statements.balanceQuarterly.value.data.rows[0]?.date).toBe("2025-12-31");
    expect(view.statements.balanceQuarterly.value.data.raw).toEqual(bundle.statements.balanceQuarterly.value.data.raw);
    expect(JSON.stringify(bundle)).toBe(original);
    expect(balanceIntegrityView(view)).toEqual(view);
  });
  function companion(kind: "incomeQuarterly" | "cashflowQuarterly", complete = false, sameRelease = true) {
    const bundle = { ...completeCurrencyBundle({ siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] }), statements: partial().statements };
    if (!bundle.statements.balanceQuarterly.ok || !bundle.statements[kind].ok) throw new Error("fixture");
    const filing = { filingDate: "2026-05-01", acceptedDate: "2026-05-01 16:00:00", cik: "1" };
    Object.assign(bundle.statements.balanceQuarterly.value.data.rows[0]!, filing);
    const rows = bundle.statements[kind].value.data.rows;
    Object.assign(rows[0]!, filing, sameRelease ? {} : { acceptedDate: "2026-05-01 18:00:00" });
    if (kind === "incomeQuarterly") {
      Object.assign(rows[1]!, { costOfRevenue: 150 * M, grossProfit: 90 * M, operatingIncome: 48 * M, cik: "1" });
      Object.assign(rows[0]!, { costOfRevenue: complete ? 180 * M : 0, grossProfit: complete ? 120 * M : 0,
        operatingIncome: complete ? 60 * M : 0, weightedAverageShsOut: complete ? 100 * M : 0, weightedAverageShsOutDil: complete ? 100 * M : 0 });
    } else {
      Object.assign(rows[1]!, { operatingCashFlow: 55 * M, netCashProvidedByInvestingActivities: -10 * M, netCashProvidedByFinancingActivities: 20 * M, cik: "1" });
      Object.assign(rows[0]!, { operatingCashFlow: complete ? 55 * M : 0,
        netCashProvidedByInvestingActivities: complete ? -10 * M : 0, netCashProvidedByFinancingActivities: complete ? 20 * M : 0 });
    }
    return bundle;
  }

  it.each(["incomeQuarterly", "cashflowQuarterly"] as const)("excludes an empty %s breakdown from calculations and payload", kind => {
    const bundle = companion(kind);
    const view = balanceIntegrityView(bundle);
    const family = view.statements[kind];
    if (!family.ok) throw new Error("fixture");
    expect(family.value.data.rows.some(row => row.date === "2026-03-31")).toBe(false);
    const trailing = kind === "incomeQuarterly" ? ttmIncome(family.value.data.rows) : ttmCashFlow(family.value.data.rows);
    expect(trailing?.date).not.toBe("2026-03-31");
    const c = runStageB(bundle);
    const validation = validateBundle(bundle as never, { now: new Date(bundle.builtAt) });
    const payload = assembleContextPayload(bundle, c, validation);
    for (const block of payload.statements.filter(b => b.title.includes("quarterly") && b.title.startsWith(kind === "incomeQuarterly" ? "Income" : "Cash"))) {
      const cells = block.lineItems.flatMap(line => line.byPeriod).filter(cell => cell.period === "2026-03-31");
      expect(cells).toEqual([]);
    }
    const balance = payload.statements.find(b => b.title.startsWith("Balance") && b.title.includes("quarterly"));
    expect(balance?.lineItems.flatMap(line => line.byPeriod).filter(cell => cell.period === "2026-03-31")).toEqual([]);
  });

  it.each(["incomeQuarterly", "cashflowQuarterly"] as const)("retains complete %s at either acceptance time", kind => {
    for (const bundle of [companion(kind, true), companion(kind, true, false)]) {
      const family = balanceIntegrityView(bundle).statements[kind];
      if (!family.ok) throw new Error("fixture");
      expect(family.value.data.rows.some(row => row.date === "2026-03-31")).toBe(true);
    }
  });

  it("does not publish cash-scope endpoints or let them change otherwise complete flow results", () => {
    const bundle = companion("cashflowQuarterly", true);
    const changed = structuredClone(bundle);
    if (!changed.statements.cashflowQuarterly.ok) throw new Error("fixture");
    Object.assign(changed.statements.cashflowQuarterly.value.data.rows[0]!, { cashAtBeginningOfPeriod: 1, cashAtEndOfPeriod: 2, netChangeInCash: 3 });
    const validation = validateBundle(bundle as never, { now: new Date(bundle.builtAt) });
    const control = runStageB(bundle, undefined, validation), result = runStageB(changed, undefined, validation);
    expect(result).toEqual(control);
    expect(assembleContextPayload(changed, result, validation)).toEqual(assembleContextPayload(bundle, control, validation));
  });
  it("rejects consecutive stubs against the latest accepted breakdown, regardless of input order", () => {
    const bundle = partial();
    if (!bundle.statements.balanceQuarterly.ok) throw new Error("fixture");
    const rows = bundle.statements.balanceQuarterly.value.data.rows;
    const olderStub = { ...rows[0]!, date: "2025-12-31" };
    bundle.statements.balanceQuarterly.value.data.rows = [rows[2]!, rows[0]!, olderStub];
    const view = balanceIntegrityView(bundle);
    if (!view.statements.balanceQuarterly.ok) throw new Error("fixture");
    const admitted = view.statements.balanceQuarterly.value.data.rows;
    expect(admitted.map(r => r.date)).toEqual(["2025-09-30"]);
    expect(view.gaps.filter(g => g.field.endsWith(".integrity"))).toHaveLength(2);
  });

  it("retains a genuine major disposal after a rejected stub", () => {
    const bundle = partial();
    if (!bundle.statements.balanceQuarterly.ok) throw new Error("fixture");
    const rows = bundle.statements.balanceQuarterly.value.data.rows;
    bundle.statements.balanceQuarterly.value.data.rows = [
      { ...rows[0]!, totalAssets: 300 * M }, { ...rows[0]!, date: "2025-12-31" }, rows[2]!,
    ];
    const view = balanceIntegrityView(bundle);
    if (!view.statements.balanceQuarterly.ok) throw new Error("fixture");
    expect(view.statements.balanceQuarterly.value.data.rows[0]?.totalAssets).toBe(300 * M);
  });
  it("uses the latest complete quarter for both bridges and withholds stale current leverage, with dates disclosed", () => {
    const bundle = partial();
    const frozen = JSON.stringify(bundle);
    const c = runStageB(bundle);
    expect(c.valuation.multiples?.enterpriseValue.value).toBe(10_000 * M + 180 * M);
    if (c.valuation.kind !== "dcf") throw new Error("DCF required");
    expect(c.valuation.dcf?.bridge.netDebt).toBe(180 * M);
    expect(c.capital.current?.netDebt).toBeNull();
    expect(c.capital.current?.netDebtToEbitda).toBeNull();
    expect(c.valuation.notes.join(" ")).toMatch(/2026-03-31.*2025-12-31/);
    expect(c.gaps.some(g => g.field === "statements.balance.2026-03-31.integrity")).toBe(true);
    expect(JSON.stringify(bundle)).toBe(frozen);
  });

  it("does not treat a zero investment line or a small negative residual as a whole-row failure", () => {
    const bundle = fixture();
    if (!bundle.statements.balanceQuarterly.ok) throw new Error("balances required");
    Object.assign(bundle.statements.balanceQuarterly.value.data.rows[0]!, { longTermInvestments: 0, otherCurrentAssets: -M });
    const c = runStageB(bundle);
    expect(c.valuation.multiples?.enterpriseValue.value).toBe(10_000 * M + 280 * M);
    expect(c.gaps.some(g => g.field.endsWith(".integrity"))).toBe(false);
  });

  it("withholds all operands of a rejected annual row instead of feeding it to forensic ratios", () => {
    const bundle = partial();
    if (!bundle.statements.balanceQuarterly.ok || !bundle.statements.balanceAnnual.ok) throw new Error("balances required");
    const rows = bundle.statements.balanceQuarterly.value.data.rows;
    bundle.statements.balanceAnnual.value.data.rows = [
      { ...rows[0]!, date: "2025-12-31", period: "FY", totalCurrentLiabilities: 0, retainedEarnings: 0 },
      { ...rows[1]!, date: "2024-12-31", period: "FY", totalCurrentLiabilities: 500 * M, retainedEarnings: 500 * M },
    ];
    const control = structuredClone(bundle);
    if (!control.statements.balanceAnnual.ok) throw new Error("fixture");
    control.statements.balanceAnnual.value.data.rows[0] = { ...control.statements.balanceAnnual.value.data.rows[1]!, date: "2025-12-31" };
    expect(runStageB(control).forensics.altman?.score).toBeTypeOf("number");
    const c = runStageB(bundle);
    expect(c.gaps.some(g => g.field === "statements.balance.2025-12-31.integrity")).toBe(true);
    expect(c.forensics.altman?.score ?? null).toBeNull();
  });

  it("refuses when no complete balance exists", () => {
    const bundle = partial();
    if (!bundle.statements.balanceAnnual.ok || !bundle.statements.balanceQuarterly.ok) throw new Error("fixture");
    bundle.statements.balanceAnnual.value.data.rows = [];
    for (const row of bundle.statements.balanceQuarterly.value.data.rows.slice(1)) row.totalDebt = undefined;
    const c = runStageB(bundle);
    expect(c.valuation.multiples?.enterpriseValue.value).toBeNull();
  });

  it("preserves a known cash-scope refusal on a retained row", () => {
    const bundle = partial();
    if (!bundle.statements.balanceQuarterly.ok) throw new Error("fixture");
    bundle.statements.balanceQuarterly.value.data.rows[1]!.fieldConflicts = {
      cashAndShortTermInvestments: { usable: false, vendorValue: 400 * M, secValue: null, reason: "cash scope unresolved" },
    };
    const c = runStageB(bundle);
    expect(c.valuation.multiples?.enterpriseValue.value).toBeNull();
  });

  it("ignores malformed entries in the retained raw response", () => {
    const bundle = partial();
    if (!bundle.statements.balanceQuarterly.ok) throw new Error("fixture");
    bundle.statements.balanceQuarterly.value.data.raw = [null, false, {}, ...bundle.statements.balanceQuarterly.value.data.rows];
    expect(() => balanceIntegrityView(bundle)).not.toThrow();
  });

  it.each(["no prior", "unclassified", "disposal", "different currency", "different issuer", "two retained lines"])("does not reject %s evidence", mode => {
    const row = { date: "2026-03-31", reportedCurrency: "USD", cik: "1", totalAssets: 1000, netReceivables: 0, inventory: 0, propertyPlantEquipmentNet: 0, longTermInvestments: 0 };
    const previous = { ...row, date: "2025-12-31", netReceivables: 100, propertyPlantEquipmentNet: 500 };
    if (mode === "unclassified") Object.assign(previous, { netReceivables: 0, propertyPlantEquipmentNet: 0 });
    if (mode === "disposal") row.totalAssets = 300;
    if (mode === "different currency") row.reportedCurrency = "EUR";
    if (mode === "different issuer") row.cik = "2";
    if (mode === "two retained lines") Object.assign(row, { propertyPlantEquipmentNet: 500, longTermInvestments: 100 });
    expect(balanceBreakdownFailure(row, mode === "no prior" ? undefined : previous)).toBeNull();
  });

  it("does not replace a rejected vendor row from filed anchors", () => {
    const b = partial();
    const point = { end: "2026-03-31", filed: "2026-05-01", form: "10-Q", fy: 2026, fp: "Q1", accn: "0000000042-26-000001" };
    const facts: CompanyFacts = { cik: 42, entityName: "Synthetic", facts: { "us-gaap": Object.fromEntries([
      ["Assets", 2050], ["StockholdersEquity", 520], ["CashAndCashEquivalentsAtCarryingValue", 70], ["ShortTermInvestments", 50], ["LongTermDebtNoncurrent", 300],
      ["ShortTermBorrowings", 0], ["OperatingLeaseLiability", 0], ["FinanceLeaseLiability", 0],
    ].map(([tag, value]) => [tag, { units: { USD: [{ ...point, val: Number(value) * M }] } }])) } };
    const bundle = withIssuerFacts(b, facts, true);
    const view = balanceIntegrityView(bundle);
    if (!view.statements.balanceQuarterly.ok) throw new Error("fixture");
    expect(view.statements.balanceQuarterly.value.data.rows.some(row => row.date === "2026-03-31")).toBe(false);
  });
});
