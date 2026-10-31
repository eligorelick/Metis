import { describe, expect, it } from "vitest";
import { classifyLeaseEvidence, type LeaseScopeRow } from "@/pipeline/stageB/leaseScope";
import { debtBridge } from "@/pipeline/stageB/currentCapital";
import { runStageB } from "@/pipeline/compute";
import { metricLabel } from "@/report/presentation";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { valueCompany, type MultiplesBalance } from "@/pipeline/stageB/valuation";
import { buildDataOnlyReport } from "@/pipeline/jobRunner";
import type { ValidationReport } from "@/pipeline/stageA/validate";
import { completeCurrencyBundle, M } from "./helpers/currencyBundle";

const date = "2026-03-31";
const evidence = (tags: string[]) => ({ source: "edgar" as const, unit: "USD", periodStart: null, periodEnd: date,
  observedAt: "2026-07-06T00:00:00Z", tags: tags.map(t => `us-gaap/${t}`), filings: [{ accn: "0000000001-26-000001", filed: "2026-05-01", form: "10-Q" }] });
const row = (op: number | null = null, finance: number | null = null) => ({ date, reportedCurrency: "USD", totalDebt: 15270 * M,
  leaseEvidenceContext: { cutoff: "2026-07-06T00:00:00Z", acquiredAt: "2026-07-05T00:00:00Z" },
  cashAndShortTermInvestments: 8304 * M, capitalLeaseObligations: (op ?? 0) + (finance ?? 0), operatingLeaseLiability: op, financeLeaseLiability: finance,
  fieldProvenance: { ...(op === null ? {} : { operatingLeaseLiability: evidence(["OperatingLeaseLiability"]) }),
    ...(finance === null ? {} : { financeLeaseLiability: evidence(["FinanceLeaseLiability"]) }),
    ...(op === null || finance === null ? {} : { capitalLeaseObligations: evidence(["OperatingLeaseLiability", "FinanceLeaseLiability"]) }) } });
const classify = (r: LeaseScopeRow) => classifyLeaseEvidence(r);

describe("descriptive lease evidence, independent of numeric admission", () => {
  it.each([0, 832 * M])("does not certify a provider observation of %s", amount => {
    const r = { ...row(), capitalLeaseObligations: amount };
    expect(classify(r)).toMatchObject({ operating: { coverage: "unverified", verifiedZero: false }, finance: { coverage: "unverified", verifiedZero: false }, combined: { coverage: "unverified", verifiedZero: false } });
    expect(debtBridge(r)).toMatchObject({ totalDebtIncludingLeases: 15270 * M, netDebtIncludingLeases: 6966 * M });
    expect(debtBridge(r).leaseScopeNote).toBeUndefined();
  });
  it.each([0, 102 * M])("does not turn complete operating %s into complete finance or combined coverage", op => {
    expect(classify(row(op))).toMatchObject({ operating: { coverage: "complete", verifiedZero: op === 0 }, finance: { coverage: "unverified", verifiedZero: false }, combined: { coverage: "unverified", verifiedZero: false } });
  });
  it("recognizes the XBRL CapitalLeaseObligations concept as finance only", () => {
    const r = row(null, 730 * M); r.fieldProvenance.financeLeaseLiability = evidence(["CapitalLeaseObligations"]);
    expect(classify(r)).toMatchObject({ operating: { coverage: "unverified" }, finance: { coverage: "complete" }, combined: { coverage: "unverified" } });
  });
  it.each([[102 * M, 730 * M], [0, 730 * M], [102 * M, 0], [0, 0]])("recognizes compatible complete components %s / %s", (op, fin) => {
    expect(classify(row(op, fin))).toMatchObject({ operating: { coverage: "complete", verifiedZero: op === 0 }, finance: { coverage: "complete", verifiedZero: fin === 0 }, combined: { coverage: "complete", verifiedZero: op === 0 && fin === 0 } });
  });
  it.each(["unit", "missing-unit", "date", "filed-future", "filed-before-balance", "invalid-date", "observed", "accession", "source", "derivation", "calculation", "conflict", "mixed-filings", "unknown-tags"])("does not certify defective provenance: %s", defect => {
    const r = row(102 * M, 730 * M); const p = r.fieldProvenance.operatingLeaseLiability!;
    if (defect === "unit") p.unit = "EUR";
    if (defect === "missing-unit") p.unit = "";
    if (defect === "date") p.periodEnd = "2025-12-31";
    if (defect === "filed-future") p.filings[0]!.filed = "2026-08-01";
    if (defect === "filed-before-balance") p.filings[0]!.filed = "2026-01-01";
    if (defect === "invalid-date") p.filings[0]!.filed = "2026-02-30";
    if (defect === "observed") p.observedAt = "unknown";
    if (defect === "accession") p.filings[0]!.accn = "";
    if (defect === "source") Object.assign(p, { source: "fmp" });
    if (defect === "derivation") Object.assign(p, { derivation: "ytd-difference" });
    if (defect === "calculation") Object.assign(p, { calculation: "noncurrent-lease-line-completed" });
    if (defect === "conflict") Object.assign(r, { fieldConflicts: { operatingLeaseLiability: { usable: false } } });
    if (defect === "mixed-filings") p.filings.push({ ...p.filings[0]!, accn: "other" });
    if (defect === "unknown-tags") p.tags = ["us-gaap/LeaseLiabilityTotal"];
    expect(classify(r)).toMatchObject({ operating: { coverage: "unverified" }, combined: { coverage: "unverified", verifiedZero: false } });
  });
  it("does not manufacture a combined amount from complete components", () => {
    const r = { ...row(102 * M, 730 * M), capitalLeaseObligations: null };
    expect(classify(r)).toMatchObject({ operating: { coverage: "complete" }, finance: { coverage: "complete" }, combined: { coverage: "unverified", verifiedZero: false }, observedLeaseLine: "missing" });
    expect(r.capitalLeaseObligations).toBeNull();
  });
  it("recognizes disjoint maturities but keeps a single maturity partial", () => {
    const r = row(102 * M, 730 * M);
    r.fieldProvenance.operatingLeaseLiability = evidence(["OperatingLeaseLiabilityCurrent", "OperatingLeaseLiabilityNoncurrent"]);
    expect(classify(r)?.operating.coverage).toBe("complete");
    r.fieldProvenance.operatingLeaseLiability.tags.pop();
    expect(classify(r)).toMatchObject({ operating: { coverage: "current-only" }, combined: { coverage: "partial" } });
  });
  it("requires compatible lineage and an existing reconciled composite, and exact zero", () => {
    const r = row(0, 0);
    r.capitalLeaseObligations = 0.01;
    expect(classify(r)?.combined.verifiedZero).toBe(false);
    r.capitalLeaseObligations = 50;
    expect(classify(r)?.combined.coverage).toBe("unverified");
    r.capitalLeaseObligations = 0;
    r.fieldProvenance.financeLeaseLiability!.filings[0]!.accn = "different";
    expect(classify(r)?.combined.coverage).toBe("unverified");
  });
  it.each(["overlapping", "filed-lineage", "timezone", "combined-tags"])("does not promote unsupported evidence shape: %s", defect => {
    const r = row(102 * M, 730 * M);
    if (defect === "overlapping") r.fieldProvenance.operatingLeaseLiability!.tags.push("us-gaap/OperatingLeaseLiabilityCurrent");
    if (defect === "filed-lineage") r.fieldProvenance.financeLeaseLiability!.filings[0]!.filed = "2026-05-02";
    if (defect === "timezone") r.fieldProvenance.operatingLeaseLiability!.observedAt = "2026-07-06T00:00:00";
    if (defect === "combined-tags") r.fieldProvenance.capitalLeaseObligations!.tags = ["us-gaap/UnrecognizedLeaseTotal"];
    expect(classify(r)?.combined.coverage).toBe("unverified");
  });
  it.each(["missing-context", "missing-cutoff", "missing-acquisition", "future-acquisition", "future-field-window", "filed-after-acquisition", "invalid-cutoff"])("does not certify evidence without actual snapshot availability: %s", defect => {
    const r = row(102 * M, 730 * M);
    if (defect === "missing-context") Object.assign(r, { leaseEvidenceContext: undefined });
    if (defect === "missing-cutoff") r.leaseEvidenceContext.cutoff = "";
    if (defect === "missing-acquisition") r.leaseEvidenceContext.acquiredAt = "";
    if (defect === "future-acquisition") r.leaseEvidenceContext.acquiredAt = "2026-07-07T00:00:00Z";
    if (defect === "future-field-window") r.fieldProvenance.operatingLeaseLiability!.observedAt = "2026-07-07T00:00:00Z";
    if (defect === "filed-after-acquisition") r.leaseEvidenceContext.acquiredAt = "2026-04-30T00:00:00Z";
    if (defect === "invalid-cutoff") r.leaseEvidenceContext.cutoff = "2026-02-30T00:00:00Z";
    expect(classify(r)?.combined.coverage).toBe("unverified");
  });
  it.each(["2026-07-05T00:00:00Z", "2026-07-06T00:00:00Z"])("accepts actual acquisition before or at the analytical cutoff: %s", acquiredAt => {
    const r = row(0, 0); r.leaseEvidenceContext.acquiredAt = acquiredAt;
    expect(classify(r)?.combined).toEqual({ coverage: "complete", verifiedZero: true });
  });
});

function scenario(currency = "USD") {
  const bundle = completeCurrencyBundle({ debt: 15270, siblingQuarterCurrencies: [currency, currency, currency, currency],
    ...(currency === "USD" ? {} : { profileCurrency: currency, annualCurrency: currency, quarterCurrencies: [currency, currency, currency, currency], estimateCurrency: currency, priceTargetCurrency: currency }) });
  for (const res of [bundle.statements.balanceQuarterly, bundle.statements.balanceAnnual]) {
    if (!res.ok) throw new Error("fixture balance missing");
    for (const r of res.value.data.rows) Object.assign(r, { totalDebt: 15270 * M, cashAndShortTermInvestments: 8304 * M,
      cashAndCashEquivalents: 8304 * M, shortTermInvestments: 0, capitalLeaseObligations: 0, operatingLeaseLiability: null, financeLeaseLiability: null, netDebt: null });
  }
  if (!bundle.statements.balanceAnnual.ok) throw new Error("annual missing");
  const old = bundle.statements.balanceAnnual.value.data.rows[0]!;
  Object.assign(old, { capitalLeaseObligations: 832 * M, operatingLeaseLiability: 102 * M, financeLeaseLiability: 730 * M });
  return bundle;
}
function withFactsEnvelope(bundle: ReturnType<typeof scenario>, fetchedAt = "2026-07-05T00:00:00Z") {
  Object.assign(bundle.edgar, {
    cik: { ok: true, value: { source: "edgar", data: { cik: 1, cik10: "0000000001", ticker: bundle.symbol }, asOf: "2026-07-05", fetchedAt, endpoint: "fixture-cik" } },
    companyFacts: { ok: true, value: { source: "edgar", data: { cik: 1, entityName: "Fixture", facts: {} }, asOf: "2026-07-05", fetchedAt, endpoint: "fixture-facts" } },
  });
  return bundle;
}
describe("unknown current zero with older lease balances", () => {
  it("keeps unknown scope concise and composes it into capital/WACC sentences cleanly", () => {
    const out = runStageB(scenario(), { evIncludeLeases: false });
    const text = [out.capital.netDebtToEbitda.note, out.returns.waccInputs.summary, out.returns.waccInputs.weights,
      ...out.returns.wacc.notes].join(" ");
    expect(text).not.toMatch(/\.\s*[;,]|\.\s+as (?:the )?market-value proxy/);
    expect(out.valuation.multiples!.enterpriseValue.basis).toMatch(/operating, finance and combined lease coverage is unverified/i);
    expect(out.valuation.multiples!.enterpriseValue.basis).not.toContain("Complete lease coverage");
  });
  it.each([[false, 0], [true, 0], [false, 832 * M], [true, 832 * M]] as const)("retains debt and EV without declaring zero or all-lease scope (include=%s, observation=%s)", (include, observation) => {
    const bundle = scenario();
    if (!bundle.statements.balanceQuarterly.ok) throw new Error("quarter missing");
    bundle.statements.balanceQuarterly.value.data.rows[0]!.capitalLeaseObligations = observation;
    const out = runStageB(bundle, { evIncludeLeases: include });
    expect(out.capital.current?.debtBridge).toMatchObject({ totalDebtIncludingLeases: 15270 * M, netDebtIncludingLeases: 6966 * M, operatingLeases: null, financeLeases: null });
    const ev = out.valuation.multiples!.enterpriseValue;
    expect(ev.value).toBe(ev.includingLeases);
    expect(ev.excludingLeases).toBe(ev.includingLeases);
    expect(out.returns.wacc.waccPct).not.toBeNull();
    expect(ev.basis).toMatch(observation === 0 ? /records.*zero.*unverified/i : /positive observation.*coverage is unverified/i);
    expect(ev.basis).not.toMatch(/Enterprise value (?:EXCLUDES|INCLUDES)|0 is disclosed|0 are disclosed|both already inside totalDebt/);
    expect(out.returns.wacc.debtBasis).not.toMatch(/lease liabilities remain inside/);
    expect(out.returns.wacc.debtBasis).toMatch(/2025-12-31.*unverified/);
    expect(out.returns.wacc.debtWeightBasis).toMatch(observation === 0 ? /2026-03-31.*zero.*unverified/ : /2026-03-31.*positive observation.*unverified/);
    expect(out.returns.wacc.debtWeightBasis).not.toMatch(/subtracts the retained operating/);
    const note = out.valuation.notes.find(n => n.startsWith("DCF equity bridge"));
    expect(note).toMatch(/2026-03-31/);
    expect(note).toMatch(/unverified/);
    const payload = assembleContextPayload(bundle, out, { checks: [], flags: [], gaps: [] } as unknown as ValidationReport);
    const capital = payload.computed.find(s => s.title === "Current capital (computed)")!;
    expect(capital.figures.find(f => f.source === "computed.capital.current.debtBridge.totalDebtIncludingLeases")?.label).toBe("Debt used in this report");
    expect(capital.notes.join(" ")).toMatch(/lease.*coverage.*unverified/i);
    const debt = capital.figures.find(f => f.source === "computed.capital.current.debtBridge.totalDebtIncludingLeases")!;
    expect(debt.provenanceId).toBe("computed.current-capital.total-debt-including-leases");
    const statementDebt = payload.statements.flatMap(b => b.lineItems).find(l => l.lineItem === "Debt used in this report")!;
    expect(statementDebt.byPeriod.find(c => c.provenanceId)?.provenanceId).toMatch(/\.total-debt$/);
  });
  it.each(["computed.capital.current.debtBridge.totalDebtIncludingLeases", "computed.current-capital.total-debt-including-leases"])("uses a neutral caption for stable numeric ID %s", id => {
    expect(metricLabel(id, "currency")).toBe("Debt used in this report");
  });
});

// Every numeric leaf, null and boolean outside descriptive metadata is checked,
// including WACC/ROIC, EV/history, DCF/scenarios, grades and model eligibility.
function numericState(value: unknown, prefix = "", result: Record<string, unknown> = {}) {
  if (value === null || typeof value === "number" || typeof value === "boolean") result[prefix] = value;
  else if (typeof value === "object") for (const [key, child] of Object.entries(value)) {
    if (key !== "leaseEvidence") numericState(child, `${prefix}.${key}`, result);
  }
  return result;
}
it.each([[false, "USD"], [true, "USD"], [false, "GBP"], [true, "GBP"]] as const)("complete evidence changes descriptions without changing any numeric result, grade or report state (include=%s, currency=%s)", (include, currency) => {
  const bundle = withFactsEnvelope(scenario(currency));
  for (const res of [bundle.statements.balanceQuarterly, bundle.statements.balanceAnnual]) {
    if (!res.ok) throw new Error("balance missing");
    for (const r of res.value.data.rows) Object.assign(r, { capitalLeaseObligations: 832 * M, operatingLeaseLiability: 102 * M, financeLeaseLiability: 730 * M });
  }
  const unknown = runStageB(bundle, { evIncludeLeases: include });
  const sourced = structuredClone(bundle);
  for (const res of [sourced.statements.balanceQuarterly, sourced.statements.balanceAnnual]) {
    if (!res.ok) throw new Error("balance missing");
    for (const r of res.value.data.rows) {
      const p = row(102 * M, 730 * M).fieldProvenance;
      for (const field of Object.values(p)) if (field) { field.periodEnd = r.date!; field.unit = currency; field.filings[0]!.filed = "2026-05-01"; }
      Object.assign(r, { fieldProvenance: p });
    }
  }
  const complete = runStageB(sourced, { evIncludeLeases: include });
  expect(numericState(complete)).toEqual(numericState(unknown));
  expect(complete.valuation.kind).toBe(unknown.valuation.kind);
  expect(complete.scores).toEqual(unknown.scores);
  expect(complete.gaps.map(g => [g.field, g.severity])).toEqual(unknown.gaps.map(g => [g.field, g.severity]));
  const report = (b: typeof bundle, computed: typeof complete) => buildDataOnlyReport({ symbol: b.symbol, companyName: "Fixture", generatedAt: "2026-07-06T00:00:00Z",
    model: "none", costUsd: 0, bundle: b, computed, validation: { checks: [], flags: [], gaps: [] } as unknown as ValidationReport, costBreakdown: [], reason: "no analysis" });
  const first = report(bundle, unknown), second = report(sourced, complete);
  expect(numericState(second)).toEqual(numericState(first));
  expect(first.meta.dataCompleteness).toBeDefined();
  expect(second.meta.dataCompleteness?.state).toBe(first.meta.dataCompleteness?.state);
  expect(first.balanceSheet.debtProfile.commentary.map(c => c.text).join(" ")).toMatch(/combined lease coverage is unverified/);
  expect(second.balanceSheet.debtProfile.commentary.map(c => c.text).join(" ")).toMatch(/Combined lease coverage is complete/);
});

function dcfAtAnchor(inputOp = 100 * M) {
  const anchor: MultiplesBalance = { ...row(100 * M, 20 * M), date: "2025-12-31", totalDebt: 500 * M, cashAndShortTermInvestments: 100 * M,
    totalStockholdersEquity: 700 * M, goodwill: 0, intangibleAssets: 0, minorityInterest: 0, preferredStock: 0 };
  for (const p of Object.values(anchor.fieldProvenance!)) p.periodEnd = anchor.date;
  const latest: MultiplesBalance = { ...anchor, date: "2026-03-31", operatingLeaseLiability: null, financeLeaseLiability: null, capitalLeaseObligations: 0, fieldProvenance: {} };
  return valueCompany({ base: "general", overlays: [], evidence: { sector: null, industry: null } }, {
    currentPrice: 100, waccPct: 9, netDebt: 400 * M, dilutedShares: 100 * M, minorityInterest: 0, preferred: 0, excessReturn: null, reit: null,
    leaseLiability: 120 * M, operatingLeaseLiability: inputOp, includeLeasesInEv: false, bridgeBalance: anchor,
    multiples: { quote: { price: 100, marketCap: 8000 * M, currency: "USD" }, reportedCurrency: "USD", incomeTtm: null, cashFlowTtm: null, balance: latest },
    dcfInputs: { revenueCagr3yPct: 8, revenueCagr5yPct: 8, analystEstimates: null, waccPct: 9, riskFreePct: 4, marketCap: 8000 * M,
      incomeTtm: { date: anchor.date, revenue: 1000 * M, operatingIncome: 250 * M, incomeBeforeTax: 240 * M, incomeTaxExpense: 48 * M },
      incomeHistory: [{ date: anchor.date, revenue: 1000 * M, operatingIncome: 250 * M }],
      balance: { ...anchor, basis: "annual" } } });
}
it("classifies the actual DCF anchor and names the amount removed rather than the resulting net debt", () => {
  const result = dcfAtAnchor();
  const note = result.notes.find(n => n.startsWith("DCF equity bridge"))!;
  expect(note).toMatch(/2025-12-31.*Operating lease coverage is complete/);
  expect(note).toContain("subtracts the retained operating-lease observation 100,000,000 USD; net debt after adjustment 300,000,000");
  expect(result.multiples!.enterpriseValue.basis).toMatch(/2026-03-31.*Operating(?:, finance and combined)? lease coverage is unverified/);
  if (result.kind !== "dcf" || !result.dcf) throw new Error("DCF expected");
  expect(result.dcf.enterpriseValue - result.dcf.equityValue!).toBeCloseTo(300 * M, 4);
});
it("does not use anchor provenance to certify a different caller-supplied lease operand", () => {
  const result = dcfAtAnchor(100 * M - 1);
  expect(result.notes.find(n => n.startsWith("DCF equity bridge"))).toMatch(/Operating(?:, finance and combined)? lease coverage is unverified/);
});
it.each([false, true])("does not infer lease inclusion or ROIC bias from undisclosed operating scope (include=%s)", include => {
  const bundle = scenario();
  for (const res of [bundle.statements.balanceQuarterly, bundle.statements.balanceAnnual]) {
    if (!res.ok) throw new Error("balance missing");
    for (const r of res.value.data.rows) Object.assign(r, { capitalLeaseObligations: 0, operatingLeaseLiability: null, financeLeaseLiability: null });
  }
  const out = runStageB(bundle, { evIncludeLeases: include });
  expect(out.returns.roic.latestRoicPct).not.toBeNull();
  expect(out.returns.roic.notes.join(" ")).not.toMatch(/lease liabilities included|ROIC is understated|operating-lease liability kept inside/);
  expect(out.returns.roic.notes.join(" ")).toMatch(/retained.*basis/);
});

it.each(["past", "at-cutoff", "future", "missing", "wrong-issuer"])("uses the actual confirmed facts acquisition and snapshot cutoff across readers: %s", availability => {
  const bundle = withFactsEnvelope(scenario(), availability === "future" ? "2026-07-07T00:00:00Z" : availability === "at-cutoff" ? "2026-07-06T00:00:00Z" : "2026-07-05T00:00:00Z");
  if (!bundle.edgar.companyFacts.ok) throw new Error("facts fixture missing");
  if (availability === "missing") bundle.edgar.companyFacts.value.fetchedAt = "";
  if (availability === "wrong-issuer") bundle.edgar.companyFacts.value.data.cik = 2;
  for (const res of [bundle.statements.balanceQuarterly, bundle.statements.balanceAnnual]) {
    if (!res.ok) throw new Error("balance missing");
    for (const r of res.value.data.rows) {
      const p = row(0, 0).fieldProvenance;
      for (const field of Object.values(p)) if (field) field.periodEnd = r.date!;
      Object.assign(r, { capitalLeaseObligations: 0, operatingLeaseLiability: 0, financeLeaseLiability: 0, fieldProvenance: p });
    }
  }
  const out = runStageB(bundle, { evIncludeLeases: false });
  const coverage = availability === "past" || availability === "at-cutoff" ? "complete" : "unverified";
  expect(out.capital.current?.debtBridge.leaseEvidence?.combined.coverage).toBe(coverage);
  expect(out.capital.current?.debtBridge.netDebtIncludingLeases).toBe(6966 * M);
  for (const text of [out.valuation.multiples!.enterpriseValue.basis, out.valuation.notes.find(n => n.startsWith("DCF equity bridge")),
    out.returns.wacc.debtBasis, out.returns.wacc.debtWeightBasis]) expect(text).toContain(coverage === "complete" ? "Combined lease coverage is complete" : "combined lease coverage is unverified");
  const payload = assembleContextPayload(bundle, out, { checks: [], flags: [], gaps: [] } as unknown as ValidationReport);
  const balance = payload.statements.find(b => b.title === "Balance sheet — quarterly")!;
  expect(balance.notes.join(" ")).toContain(coverage === "complete" ? "Combined lease coverage is complete" : "combined lease coverage is unverified");
});
