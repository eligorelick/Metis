import { describe, expect, it } from "vitest";
import retained from "./fixtures/figr-r9-bases.json";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { runStageB } from "@/pipeline/compute";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import type { CompanyFacts } from "@/edgar/xbrl";
import { filedCashFlowTtm, filedCapexTtm } from "@/edgar/financialEnrichment";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";

const at = "2026-11-02T16:04:50.794Z";
const url = "https://www.sec.gov/Archives/edgar/data/2064124/000162828026057061/figr-20260630.htm";
const epsNote = retained.epsNote;

function fixture() {
  const b = completeCurrencyBundle({ symbol: "FIGR", siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
  b.builtAt = at;
  if (!b.profile.ok || !b.quote.ok) throw Error("fixture");
  Object.assign(b.profile.value.data.rows[0]!, { cik: "2064124", companyName: "Figure Technology Solutions, Inc. Class A common stock", isAdr: false });
  b.quote.value.asOf = "2026-11-02";
  b.quote.value.data.rows[0]!.timestamp = Date.parse(at) / 1000;
  b.edgar.registrant = { cik10: "0002064124", name: "Figure Technology Solutions, Inc.", tickers: ["FIGR"], exchanges: ["Nasdaq"], sic: "3571", sicDescription: null, fiscalYearEnd: "1231", stateOfIncorporation: "DE", forms: ["10-Q", "10-K"] };
  b.edgar.companyFacts = { ok: true, value: { data: structuredClone(retained.companyFacts) as CompanyFacts, source: "edgar", endpoint: "retained", fetchedAt: at, asOf: "2026-06-30" } };
  b.edgar.cik = { ok: true, value: { ...b.edgar.companyFacts.value, data: { cik: 2064124, cik10: "0002064124", ticker: "FIGR", title: "Figure" } } };
  b.edgar.tenQNotes = { ok: true, value: { source: "edgar", endpoint: url, fetchedAt: at, asOf: "2026-06-30", data: { text: epsNote, chars: epsNote.length, sectionName: "tenQNotes", method: "toc-anchor", accession: "0001628280-26-057061", filingDate: "2026-08-14", reportDate: "2026-06-30", form: "10-Q", documentUrl: url } } };
  b.economicShareEvidence = [{ issuerId: "0002064124", securityId: "FIGR", asOf: "2026-08-07", filed: "2026-08-14", effectiveFrom: "2026-08-14", effectiveTo: null, complete: true, sourceHash: "retained", sourceIds: [url], classes: [
    { classId: "FIGR", shares: 185672153, countBasis: "outstanding", economicUnitsPerQuotedShare: 1, priceBasis: "quoted-market-price" },
    { classId: "class b common stock", shares: 37893047, countBasis: "outstanding", economicUnitsPerQuotedShare: 1, priceBasis: "economic-equivalence-proxy" },
    { classId: "blockchain common stock", shares: 812672, countBasis: "outstanding", economicUnitsPerQuotedShare: 1, priceBasis: "economic-equivalence-proxy" },
  ] }];
  const dates = ["2026-06-30", "2026-03-31", "2025-12-31", "2025-09-30"];
  for (const family of [b.statements.incomeQuarterly, b.statements.balanceQuarterly, b.statements.cashflowQuarterly]) {
    if (!family.ok) throw Error("fixture");
    family.value.data.rows = family.value.data.rows.slice(0, 4).map((r, i) => ({ ...r, date: dates[i], cik: "2064124", period: ["Q2", "Q1", "Q4", "Q3"][i], fiscalYear: dates[i]!.slice(0, 4) }));
  }
  if (!b.statements.incomeQuarterly.ok || !b.statements.cashflowAnnual.ok || !b.statements.cashflowQuarterly.ok) throw Error("fixture");
  Object.assign(b.statements.incomeQuarterly.value.data.rows[0]!, { weightedAverageShsOut: 221514237, weightedAverageShsOutDil: 246969949 });
  Object.assign(b.statements.cashflowAnnual.value.data.rows[0]!, { capitalExpenditure: -20649000, stockBasedCompensation: 62364000 });
  b.statements.cashflowQuarterly.value.data.rows.forEach(r => { delete r.capitalExpenditure; });
  return b;
}

describe("R9 FIGR deterministic basis fixes", () => {
  it("selects current YTD rather than a co-filed standalone quarter for allocated SBC", () => {
    expect(filedCashFlowTtm(retained.companyFacts as CompanyFacts, "AllocatedShareBasedCompensationExpense", "USD", "2026-06-30", at)).toMatchObject({ value: 113732000, operands: [72421000, 51976000, 10665000] });
  });
  it("does not substitute allocated SBC expense for a missing cash-flow add-back", () => {
    const facts = structuredClone(retained.companyFacts) as CompanyFacts;
    delete facts.facts["us-gaap"]!.ShareBasedCompensation;
    facts.facts["us-gaap"]!.Revenues = { units: { USD: [{ start: "2025-01-01", end: "2025-12-31", val: 506865000, filed: "2026-03-16", form: "10-K", accn: "0002064124-26-000009", fy: 2025, fp: "FY" }] } };
    const built = buildStatementsFromCompanyFacts(facts, { symbol: "FIGR", cik: "0002064124", annualPeriods: 3, quarterlyPeriods: 8, asOf: "2026-11-02", vendorSplits: { status: "unavailable", source: "fixture", reason: "offline fixture" } });
    expect(built.cashflowAnnual.rows.find(r => r.date === "2025-12-31")?.stockBasedCompensation).toBeNull();
  });
  it("admits a filed combined-class EPS denominator without equating an average to a later cover count", () => {
    const c = runStageB(fixture());
    expect(c.valuation.gaps.find(g => g.field === "valuation.perShare.economicClassBasis")).toMatchObject({ severity: "info", reason: expect.stringMatching(/combined.*246,969,949/i) });
    expect(c.valuation.gaps.find(g => g.field === "valuation.perShare.economicClassBasis")?.reason).not.toContain("does not match");
  });
  it.each(["unnamed", "unequal", "wrong-count", "wrong-period", "not-combined", "duplicate"])("keeps the class-basis protection for %s evidence", change => {
    const b = fixture(); if (!b.edgar.tenQNotes?.ok) throw Error("fixture");
    if (change === "unnamed") b.edgar.tenQNotes.value.data.text = epsNote.replaceAll("Blockchain common stock", "another class");
    if (change === "unequal") b.economicShareEvidence![0]!.classes[1]!.economicUnitsPerQuotedShare = 2;
    if (change === "wrong-count") b.edgar.tenQNotes.value.data.text = epsNote.replace("246,969,949", "249,969,949");
    if (change === "wrong-period") b.edgar.tenQNotes.value.data.reportDate = "2026-03-31";
    if (change === "not-combined") b.edgar.tenQNotes.value.data.text = epsNote.replace("they have been combined as common shares below", "they have not been combined as common shares below");
    if (change === "duplicate") b.economicShareEvidence![0]!.classes.push({ ...b.economicShareEvidence![0]!.classes[1]! });
    expect(runStageB(b).valuation.gaps.find(g => g.field === "valuation.perShare.economicClassBasis")?.severity).toBe("warn");
  });
  it("derives TTM software capex on the annual tag basis without enabling lender owner FCF", () => {
    const b = fixture();
    if (!b.profile.ok || !b.edgar.registrant || !b.edgar.tenQNotes?.ok) throw Error("fixture");
    b.edgar.sic = "6163"; b.edgar.registrant.sic = "6163";
    Object.assign(b.profile.value.data.rows[0]!, { sector: "Financial Services", industry: "Loan Brokers" });
    b.edgar.tenQNotes.value.data.statementsText = "CONSOLIDATED STATEMENTS OF CASH FLOWS Operating activities: Originations of loans held for sale (2,600) Proceeds from loan sales 4,500 Net cash used in operating activities (450) Investing activities: Software (10)";
    const c = runStageB(b);
    expect(c.capital.current?.cashBridge.cashCapitalExpenditure).toBe(-23451000);
    expect(c.capital.current?.filedCashFlows?.capitalExpenditure).toMatchObject({ tag: "PaymentsToDevelopSoftware", value: 23451000, operands: [20649000, 12673000, 9871000] });
    expect(c.gaps.find(g => g.field === "compute.ttmCashFlow.capitalExpenditure")?.reason).not.toMatch(/suppressed/);
    expect(c.capital.current?.cashBridge.standardizedFcf).toBeNull();
    expect(c.route.cashFlowApplicability?.status).toBe("not-applicable");
    expect(c.valuation.kind === "dcf" ? c.valuation.dcf : null).toBeNull();
  });
  it.each(["different-tag", "ambiguous-tags", "different-filing", "different-currency", "future", "annual-refused"])("does not derive capex on an unestablished annual basis (%s)", change => {
    const facts = structuredClone(retained.companyFacts) as CompanyFacts;
    const software = facts.facts["us-gaap"]!.PaymentsToDevelopSoftware as { units: { USD: { start: string; end: string; filed: string; accn: string }[] } };
    const annual = { date: "2025-12-31", reportedCurrency: "USD", capitalExpenditure: -20649000, fieldConflicts: {} };
    if (change === "different-tag") annual.capitalExpenditure = -50000000;
    if (change === "ambiguous-tags") facts.facts["us-gaap"]!.PaymentsToAcquirePropertyPlantAndEquipment = structuredClone(software);
    if (change === "different-filing") software.units.USD.find(p => p.end === "2025-06-30")!.accn = "0002064124-26-000099";
    if (change === "different-currency") annual.reportedCurrency = "EUR";
    if (change === "future") software.units.USD.find(p => p.end === "2026-06-30")!.filed = "2027-01-01";
    if (change === "annual-refused") annual.fieldConflicts = { capitalExpenditure: { usable: false, reason: "refused", vendorValue: -20649000, secValue: null } };
    expect(filedCapexTtm(facts, annual, "USD", "2026-06-30", at)).toBeNull();
  });
  it("does not replace missing allocated-SBC operands with the cash-flow SBC basis", () => {
    const b = fixture(); if (!b.edgar.companyFacts.ok) throw Error("fixture");
    delete b.edgar.companyFacts.value.data.facts["us-gaap"]!.AllocatedShareBasedCompensationExpense;
    const c = runStageB(b);
    expect(c.capital.current?.cashBridge.stockBasedCompensation).toBe(109079000);
    expect(c.capital.current?.allocatedSbcExpense).toBeUndefined();
  });
  it("registers separate cash-flow and allocated SBC bases and names the revenue ratio basis", () => {
    const b = fixture(); const c = runStageB(b); const p = assembleContextPayload(b, c, { checks: [], flags: [], gaps: [] });
    expect(p.provenanceRegistry?.find(r => r.origin === "computed.capital.current.cashBridge.stockBasedCompensation")).toMatchObject({ value: 109079000, label: "SBC, cash-flow add-back" });
    expect(p.provenanceRegistry?.find(r => r.origin === "computed.capital.current.allocatedSbcExpense")).toMatchObject({ value: 113732000, label: "SBC, allocated expense", periodContext: { start: "2025-07-01", end: "2026-06-30", basis: "rolling-12-month" } });
    expect(p.computed.flatMap(s => s.figures).find(f => f.source === "computed.capital.sbc" && f.unit === "%")?.label).toContain("cash-flow add-back");
    expect(p.filingFacts?.figures.filter(f => /SBC/.test(f.label)).every(f => /allocated expense|cash-flow add-back|capitalized/.test(f.label))).toBe(true);
  });
});
