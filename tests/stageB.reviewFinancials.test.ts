import { describe, expect, it } from "vitest";
import { buildQuarterlySegments, type FilingRevenue, type RevenueFact } from "@/edgar/segmentFacts";
import { runStageB } from "@/pipeline/compute";
import { computeProjections, interestRunRate } from "@/pipeline/stageB/projections";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { validateClaimNumericSupport } from "@/pipeline/stageC/claimEvidence";
import { residualNote } from "@/pipeline/filingDisclosures";
import { completeCurrencyBundle, currencyBundle, M } from "./helpers/currencyBundle";

function noInterest(debt: number) {
  const bundle = currencyBundle({ debt, siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
  for (const result of [bundle.statements.incomeAnnual, bundle.statements.incomeQuarterly]) {
    if (!result.ok) throw new Error("income fixture missing");
    for (const row of result.value.data.rows) delete row.interestExpense;
  }
  return bundle;
}

function projectionInputs() {
  const bundle = noInterest(300);
  const baseline = runStageB(currencyBundle());
  const income = bundle.statements.incomeAnnual;
  if (!income.ok) throw new Error("income fixture missing");
  return { route: baseline.route, valuation: baseline.valuation, waccPct: baseline.returns.wacc.waccPct,
    dilutedShares: 100 * M, incomeHistory: income.value.data.rows.map((row) => ({ date: String(row.date), revenue: Number(row.revenue),
      ebit: Number(row.ebit), netIncome: Number(row.netIncome), epsDiluted: Number(row.epsDiluted), interestExpense: null as number | null,
      interestExpenseDisclosed: false })), fcfHistory: [], shareCountAnnualizedPct: 0, currency: "USD", asOf: "2026-07-06" };
}

describe("review: forecast interest needs disclosed expense or a debt-free anchor", () => {
  it("withholds only EPS when both expense anchors are missing despite debt", () => {
    // Keep a valid, independently established DCF/WACC: the projection
    // builder must not convert a missing interest operand to a reported zero.
    const projections = computeProjections(projectionInputs());
    expect(projections.series.some((series) => series.metric === "revenue")).toBe(true);
    expect(projections.series.some((series) => series.metric === "epsDiluted")).toBe(false);
    expect(projections.series.flatMap((series) => series.disclosures)).toContainEqual(
      expect.objectContaining({ field: "projections.eps.interestExpense", severity: "warn" }),
    );
  });

  it("preserves EPS on an evidenced, matching debt-free balance", () => {
    const computed = runStageB(noInterest(0));
    const eps = computed.projections.series.find((series) => series.metric === "epsDiluted");
    expect(eps).toBeDefined();
    expect(eps!.assumptions.join(" ")).toMatch(/debt-free.*2026-03-31/);
  });

  it("retains the annual expense fallback and an explicitly reported zero quarter", () => {
    const bundle = noInterest(300);
    const annual = bundle.statements.incomeAnnual;
    if (!annual.ok) throw new Error("income fixture missing");
    annual.value.data.rows[0]!.interestExpense = 15 * M;
    const eps = runStageB(bundle).projections.series.find((series) => series.metric === "epsDiluted");
    expect(eps?.assumptions.join(" ")).toMatch(/latest annual interest expense/);
    expect(interestRunRate({ date: "2026-03-31", interestExpense: 0 }, null, null)).toBeNull();
    expect(interestRunRate({ date: "2026-03-31", interestExpense: 0, interestExpenseDisclosed: true }, null, null)?.value).toBe(0);
  });

  it("does not use zero provider placeholders to publish EPS for a debt issuer", () => {
    const inputs = projectionInputs();
    inputs.incomeHistory.forEach((row) => { row.interestExpense = 0; });
    expect(computeProjections(inputs).series.some((series) => series.metric === "epsDiluted")).toBe(false);
    inputs.incomeHistory[0]!.interestExpenseDisclosed = true;
    expect(computeProjections(inputs).series.some((series) => series.metric === "epsDiluted")).toBe(true);
  });

  it("requires the debt-free evidence to match the exact DCF anchor", () => {
    for (const debtAtAnchor of [{ date: "2025-12-31", debt: 0 }, { date: "2026-06-30", debt: 0 },
      { date: "2026-03-31", debt: null }, { date: "2026-03-31", debt: -1 }]) {
      expect(computeProjections({ ...projectionInputs(), debtAtAnchor }).series.some((series) => series.metric === "epsDiluted")).toBe(false);
    }
  });

  it("does not borrow a debt-free balance in a different currency", () => {
    const bundle = noInterest(0);
    const balance = bundle.statements.balanceQuarterly;
    if (!balance.ok) throw new Error("balance fixture missing");
    balance.value.data.rows.forEach((row) => { row.reportedCurrency = "EUR"; });
    expect(runStageB(bundle).projections.series.some((series) => series.metric === "epsDiluted")).toBe(false);
  });

  it.each([false, true])("rejects a debt-free total contradicted by financing components (lease-only total: %s)", (leaseOnly) => {
    const bundle = noInterest(0);
    const balance = bundle.statements.balanceQuarterly;
    if (!balance.ok) throw new Error("balance fixture missing");
    Object.assign(balance.value.data.rows[0]!, leaseOnly
      ? { totalDebt: 300 * M, operatingLeaseLiability: 300 * M, longTermDebt: 300 * M }
      : { totalDebt: 0, shortTermDebt: 100 * M, longTermDebt: 200 * M });
    expect(runStageB(bundle).projections.series.some((series) => series.metric === "epsDiluted")).toBe(false);
  });
});

function acquisitionBundle(acquisitionsNet: number | null, primary: number | null = 2 * M) {
  const bundle = completeCurrencyBundle({ debt: 300 });
  const cf = bundle.statements.cashflowAnnual;
  if (!cf.ok) throw new Error("cash-flow fixture missing");
  Object.assign(cf.value.data.rows[0]!, { acquisitionsNet, otherInvestingActivities: -13 * M });
  const tagged = (val: number) => ({ units: { USD: [{ start: "2025-01-01", end: "2025-12-31", val,
    accn: "0000000001-26-000001", form: "10-K", filed: "2026-02-15", fy: 2025, fp: "FY" }] } });
  bundle.edgar = { ...bundle.edgar, companyFacts: { ok: true, value: { data: { cik: 1, entityName: "TEST", facts: { "us-gaap": {
    PaymentsToAcquireBusinessTwoNetOfCashAcquired: tagged(13 * M),
    ...(primary === null ? {} : { PaymentsToAcquireBusinessesNetOfCashAcquired: tagged(primary) }),
  } } }, asOf: "2026-02-15", source: "edgar", endpoint: "test", fetchedAt: bundle.builtAt } } };
  return bundle;
}
const acquisition = (line: number | null, primary: number | null = 2 * M) => runStageB(acquisitionBundle(line, primary)).forensics.accruals;

describe("review: filed business payments must not duplicate the acquisitions line", () => {
  it.each([-13 * M, -15 * M])("does not add the second payment to an already-inclusive line %s", (line) => {
    expect(acquisition(line)?.acquisitionCashPaid).toBe(-line);
  });
  it.each([13 * M, 15 * M])("does not mistake a matching generic primary %s for proof of non-overlap", (primary) => {
    expect(acquisition(-primary, primary)?.acquisitionCashPaid).toBe(primary);
  });
  it("does not assert that a smaller generic primary excludes the second payment", () => {
    const accruals = acquisition(-2 * M);
    expect(accruals?.acquisitionCashPaid).toBe(2 * M);
    expect(accruals?.notes.join(" ")).toMatch(/partial.*overlap.*unresolved/i);
  });
  it.each([null, 0])("retains a filed payment without a competing acquisitions line (%s)", (line) => {
    expect(acquisition(line)?.acquisitionCashPaid).toBe(13 * M);
  });
  it("does not assert non-overlap when the primary payment is untagged", () => {
    expect(acquisition(-2 * M, null)?.acquisitionCashPaid).toBe(2 * M);
  });
  it("keeps the unresolved filed payment visible and cannot validate the partial line as total acquisition cash", () => {
    const bundle = acquisitionBundle(-2 * M);
    const computed = runStageB(bundle);
    expect(computed.forensics.accruals?.acquisitionCashPaidUnallocated).toBe(13 * M);
    expect(computed.forensics.accruals?.notes.join(" ")).toMatch(/13\.0 million.*overlap.*unresolved/);
    expect(computed.forensics.gaps).toContainEqual(expect.objectContaining({ field: "forensics.accruals.acquisitionCashPaid", severity: "warn" }));
    const payload = assembleContextPayload(bundle, computed, { checks: [], flags: [], gaps: [] });
    const record = payload.provenanceRegistry!.find((entry) => entry.origin === "computed.forensics.accruals.acquisitionCashPaid")!;
    expect(record.label).toMatch(/classified vendor.*partial.*unresolved/);
    expect(payload.provenanceRegistry!.find((entry) => entry.origin === "computed.forensics.accruals.acquisitionCashPaidUnallocated"))
      .toMatchObject({ label: "filed business payment (unallocated; overlap with classified acquisitions unresolved)", value: 13 * M,
        unit: "currency", currency: "USD", asOf: "2025-12-31" });
    const support = validateClaimNumericSupport({ text: "Cash paid for acquisitions, net of cash acquired, was USD 2 million.", label: "FACT",
      source: record.id, asOf: record.asOf }, { record, sourceId: record.id, excerpts: [], reportingCurrency: "USD" });
    expect(support.status).not.toBe("validated");
  });
});

const axis = "us-gaap:StatementBusinessSegmentsAxis";
const fact = (member: string | null, prior: boolean, value: number): RevenueFact => ({
  axis: member === null ? null : axis, member, start: prior ? "2025-01-01" : "2026-01-01", end: prior ? "2025-03-31" : "2026-03-31",
  value, currency: "USD", concept: "us-gaap:Revenues",
});
const filing = (accession: string, filingDate: string, facts: RevenueFact[]): FilingRevenue & { concept: string } => ({
  accession, filingDate, form: "10-Q", facts, concept: "us-gaap:Revenues",
});
const current = [fact(null, false, 100), fact("acme:A", false, 60), fact("acme:B", false, 40)];
const bRow = (filings: ReturnType<typeof filing>[]) => buildQuarterlySegments(filings, {})!.axes[0]!.rows.find((row) => row.member === "acme:B")!;

describe("review: segment residuals need presentation continuity", () => {
  it("describes source continuity without claiming arbitrary member renames", () => {
    const note = residualNote("Reportable segment", 1);
    expect(note).toContain("share a filing presentation");
    expect(note).toContain("pooled cross-filing derivations");
    expect(note).not.toContain("carries a member renamed");
  });
  it("never assigns historical C revenue to a newly presented B", () => {
    const row = bRow([filing("new", "2026-05-01", current),
      filing("old", "2025-05-01", [fact(null, true, 80), fact("acme:A", true, 50), fact("acme:C", true, 30)])]);
    expect(row.values).toEqual([40, null]);
    expect(row.residualAt ?? []).not.toContain(1);
  });
  it("withholds an unmapped historical remainder even without an old C tag", () => {
    expect(bRow([filing("new", "2026-05-01", current),
      filing("old", "2025-05-01", [fact(null, true, 80), fact("acme:A", true, 50)])]).values).toEqual([40, null]);
  });
  it("retains a residual within the issuer's same-filing comparative presentation", () => {
    const row = bRow([filing("new", "2026-05-01", [...current, fact(null, true, 80), fact("acme:A", true, 50)])]);
    expect(row.values).toEqual([40, 30]);
    expect(row.residualAt).toContain(1);
  });
  it("retains an explicit recast comparative without inferring a residual", () => {
    const row = bRow([filing("new", "2026-05-01", [...current, fact(null, true, 80), fact("acme:A", true, 50), fact("acme:B", true, 30)]),
      filing("old", "2025-05-01", [fact(null, true, 80), fact("acme:A", true, 50), fact("acme:C", true, 30)])]);
    expect(row.values).toEqual([40, 30]);
    expect(row.residualAt ?? []).not.toContain(1);
  });

  it("does not launder pooled cross-filing operands into same-filing presentation evidence", () => {
    const duration = (member: string | null, end: string, value: number): RevenueFact => ({
      ...fact(member, true, value), start: "2025-01-01", end,
    });
    const row = bRow([filing("new", "2026-05-01", [...current, duration(null, "2025-12-31", 400), duration("acme:A", "2025-12-31", 300)]),
      filing("old", "2025-11-01", [duration(null, "2025-09-30", 300), duration("acme:A", "2025-09-30", 210), duration("acme:C", "2025-09-30", 90)])]);
    expect(row.values).toEqual([40, null]);
    expect(row.residualAt ?? []).not.toContain(1);
  });
});
