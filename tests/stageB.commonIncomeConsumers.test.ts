/** Synthetic source-availability and consumer-boundary regressions. */
import { describe, expect, it } from "vitest";
import type { StatementFieldProvenance } from "@/providers/fmp";
import { parseStoredReport } from "@/report/history";
import { reportToAuditMarkdown } from "@/report/export/auditMarkdown";
import { commonHolderCapital, type CommonIncomeInputs } from "@/pipeline/stageB/securityBasis";
import { buildSyntheticRouteBundle, runResearchRoutePanel } from "./helpers/researchRoutePanel";
import { M } from "./helpers/currencyBundle";
import { ttmIncome } from "@/pipeline/compute";

function evidence(end: string, observedAt: string, quarter = false): StatementFieldProvenance {
  const date = new Date(`${end}T00:00:00Z`);
  return { source: "edgar", unit: "USD", periodStart: quarter
    ? new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 2, 1)).toISOString().slice(0, 10)
    : `${end.slice(0, 4)}-01-01`, periodEnd: end, observedAt,
    tags: ["us-gaap/NetIncomeLossAvailableToCommonStockholdersBasic"], filings: [] };
}

function annual() {
  const bundle = buildSyntheticRouteBundle("bank");
  for (const member of [bundle.statements.incomeQuarterly, bundle.statements.balanceQuarterly, bundle.statements.cashflowQuarterly]) {
    if (!member.ok) throw new Error("synthetic rows required");
    member.value.data.rows = [];
  }
  if (!bundle.statements.incomeAnnual.ok || !bundle.statements.cashflowAnnual.ok) throw new Error("synthetic rows required");
  for (const row of bundle.statements.incomeAnnual.value.data.rows) {
    delete row.epsDiluted;
    row.periodStart = `${String(row.date).slice(0, 4)}-01-01`;
    row.fieldProvenance = { netIncome: evidence(String(row.date), bundle.builtAt), netIncomeAvailableToCommon: evidence(String(row.date), bundle.builtAt) };
  }
  for (const row of bundle.statements.cashflowAnnual.value.data.rows) row.periodStart = `${String(row.date).slice(0, 4)}-01-01`;
  return bundle;
}

function primaryQuarterIncome(commonCount: number, quarterHistory = false) {
  const bundle = buildSyntheticRouteBundle("bank", { quarterHistory });
  for (const member of [bundle.statements.balanceAnnual, bundle.statements.balanceQuarterly]) {
    if (!member.ok) throw new Error("synthetic balances required");
    for (const row of member.value.data.rows) { row.preferredStock = 0; row.minorityInterest = 0; }
  }
  for (const member of [bundle.statements.cashflowAnnual, bundle.statements.cashflowQuarterly]) {
    if (!member.ok) throw new Error("synthetic cash required");
    for (const row of member.value.data.rows) row.preferredDividendsPaid = 0;
  }
  if (!bundle.statements.incomeQuarterly.ok) throw new Error("synthetic income required");
  const rows = bundle.statements.incomeQuarterly.value.data.rows;
  for (const [index, row] of rows.entries()) {
    delete row.epsDiluted;
    delete row.netIncomeAvailableToCommon;
    row.netIncomeOwnershipBasis = "parent";
    row.fieldProvenance = { netIncome: { ...evidence(String(row.date), bundle.builtAt, true), tags: ["us-gaap/NetIncomeLoss"] } };
    if (index < commonCount) {
      row.netIncomeAvailableToCommon = 40 * M;
      row.fieldProvenance.netIncomeAvailableToCommon = evidence(String(row.date), bundle.builtAt, true);
    }
  }
  return { bundle, rows };
}

describe("unused common source scopes do not veto supported primary net income", () => {
  it.each([0, 1, 3])("%s supplied common quarters retain net-income fallback beside unused future row timing", count => {
    const { bundle, rows } = primaryQuarterIncome(count);
    for (const row of rows) { row.filingDate = "2027-01-01"; row.acceptedDate = "2027-01-01T20:00:00Z"; }
    const ttm = ttmIncome(rows);
    expect(ttm?.netIncomeAvailableToCommon).toBeNull();
    const { computed } = runResearchRoutePanel(bundle);
    expect(computed.valuation.multiples?.multiples.find(row => row.key === "peTtm")?.current).toBeCloseTo(10_000 / 180, 10);
  });
  it.each([0, 1, 3])("%s supplied common quarters retain net-income fallback beside unused malformed row timing", count => {
    const { bundle, rows } = primaryQuarterIncome(count);
    for (const row of rows) { row.filingDate = "2026-02-30"; row.acceptedDate = "2026-02-30 20:00:00"; }
    expect(runResearchRoutePanel(bundle).computed.valuation.multiples?.multiples.find(row => row.key === "peTtm")?.current).toBeCloseTo(10_000 / 180, 10);
  });
  it.each([1, 3, 4])("a future supplied common source still refuses with %s present quarters", count => {
    const { bundle, rows } = primaryQuarterIncome(count);
    rows[0]!.fieldProvenance!.netIncomeAvailableToCommon!.filings = [{ accn: "synthetic-future", filed: "2027-01-01", form: "10-Q" }];
    expect(runResearchRoutePanel(bundle).computed.valuation.multiples?.multiples.find(row => row.key === "peTtm")?.current).toBeNull();
  });
  it("an explicit common-field conflict still refuses without a numeric common fact", () => {
    const { bundle, rows } = primaryQuarterIncome(0);
    rows[0]!.fieldConflicts = { netIncomeAvailableToCommon: { usable: false, vendorValue: null, secValue: null, reason: "synthetic common-field conflict" } };
    expect(runResearchRoutePanel(bundle).computed.valuation.multiples?.multiples.find(row => row.key === "peTtm")?.current).toBeNull();
  });
  it.each([40, 0, -5])("complete supplied common %s remains authoritative without a second deduction", value => {
    const { bundle, rows } = primaryQuarterIncome(4);
    for (const row of rows.slice(0, 4)) row.netIncomeAvailableToCommon = value * M;
    const ttm = ttmIncome(rows);
    expect(ttm?.netIncomeAvailableToCommon).toBe(value * 4 * M);
    expect(ttm?.commonIncomeWithheldReason).toBeNull();
    const pe = runResearchRoutePanel(bundle).computed.valuation.multiples?.multiples.find(row => row.key === "peTtm")?.current;
    if (value > 0) expect(pe).toBeCloseTo(10_000 / (value * 4), 10);
    else expect(pe).toBeNull(); // P/E requires positive earnings; common earnings themselves remain zero/negative.
  });
});

describe("current and historical P/E choose one earnings basis for the whole window", () => {
  it.each([0, -5])("complete Basic common %s remains admitted even though P/E requires positive earnings", value => {
    const { bundle, rows } = primaryQuarterIncome(4, true);
    for (const row of rows) {
      row.netIncomeAvailableToCommon = value * M;
      row.fieldProvenance!.netIncomeAvailableToCommon = evidence(String(row.date), bundle.builtAt, true);
    }
    const ttm = ttmIncome(rows);
    expect(ttm?.netIncomeAvailableToCommon).toBe(value * 4 * M);
    expect(ttm?.commonIncomeWithheldReason).toBeNull();
    expect(ttm?.commonIncomeScope?.allocationBasis).toBe("basic-eps-common-stockholders");
    const { computed, report } = runResearchRoutePanel(bundle);
    const pe = computed.valuation.multiples?.multiples.find(row => row.key === "peTtm");
    expect(pe?.current).toBeNull();
    expect(pe?.ownHistory).toBeNull();
    const reportPe = report.valuation.multiples.find(row => row.name.startsWith("P/E"));
    expect(reportPe?.ownHistoryDetails ?? []).toEqual([]);
    expect(parseStoredReport(JSON.stringify(report))?.valuation.multiples.find(row => row.name.startsWith("P/E"))).toEqual(reportPe);
  });
  it.each(Array.from({ length: 16 }, (_, mask) => mask))("matches source scopes and values for common availability mask %s", mask => {
    const bundle = buildSyntheticRouteBundle("bank", { quarterHistory: true });
    const income = bundle.statements.incomeQuarterly;
    if (!income.ok || !bundle.enterpriseValues.ok) throw new Error("synthetic quarterly history required");
    const olderDates = ["2023-03-31", "2022-12-31", "2022-09-30", "2022-06-30"];
    for (const member of [income, bundle.statements.balanceQuarterly, bundle.statements.cashflowQuarterly]) {
      if (!member.ok) throw new Error("synthetic quarter siblings required");
      const template = member.value.data.rows.at(-1)!;
      for (const date of olderDates) member.value.data.rows.push({ ...template, date });
    }
    const market = bundle.enterpriseValues.value.data.rows;
    for (const date of olderDates) market.push({ ...market.at(-1)!, date });
    for (const member of [bundle.statements.balanceAnnual, bundle.statements.balanceQuarterly]) {
      if (!member.ok) throw new Error("synthetic balances required");
      for (const row of member.value.data.rows) { row.preferredStock = 0; row.minorityInterest = 0; }
    }
    for (const member of [bundle.statements.cashflowAnnual, bundle.statements.cashflowQuarterly]) {
      if (!member.ok) throw new Error("synthetic cash required");
      for (const row of member.value.data.rows) row.preferredDividendsPaid = 0;
    }
    const rows = income.value.data.rows;
    for (const [index, row] of rows.entries()) {
      row.netIncome = 45 * M;
      row.netIncomeOwnershipBasis = "parent";
      row.cik = "synthetic-issuer";
      delete row.epsDiluted;
      delete row.netIncomeAvailableToCommon;
      row.fieldProvenance = { netIncome: { ...evidence(String(row.date), bundle.builtAt, true), tags: ["us-gaap/NetIncomeLoss"] } };
      if (mask & (1 << (index % 4))) {
        row.netIncomeAvailableToCommon = 40 * M;
        row.fieldProvenance.netIncomeAvailableToCommon = evidence(String(row.date), bundle.builtAt, true);
      }
    }
    const ttm = ttmIncome(rows);
    expect(ttm?.netIncomeAvailableToCommon).toBe(mask === 15 ? 160 * M : null);
    expect(ttm?.netIncome).toBe(180 * M);
    expect(ttm?.[mask === 15 ? "commonIncomeScope" : "incomeScope"]).toMatchObject({
      issuerId: "synthetic-issuer", currency: "USD", basis: "ttm", periodStart: "2025-04-01", periodEnd: "2026-03-31",
    });
    const expected = 10_000 / (mask === 15 ? 160 : 180);
    const { computed, report, surfaces } = runResearchRoutePanel(bundle);
    const pe = computed.valuation.multiples?.multiples.find(row => row.key === "peTtm");
    expect(pe?.current).toBeCloseTo(expected, 10);
    expect(pe?.ownHistory?.observationDetails).toHaveLength(13);
    for (const point of pe!.ownHistory!.observationDetails!) expect(point.value).toBeCloseTo(expected, 10);
    const reportPe = report.valuation.multiples.find(row => row.name.startsWith("P/E"));
    const storedPe = parseStoredReport(JSON.stringify(report))?.valuation.multiples.find(row => row.name.startsWith("P/E"));
    expect(reportPe?.current).toBeCloseTo(expected, 10);
    expect(reportPe?.ownHistoryDetails).toEqual(pe?.ownHistory?.observationDetails);
    expect(storedPe).toEqual(reportPe);
    for (const surface of Object.values(surfaces)) expect(surface).toContain("P/E");
    expect(reportToAuditMarkdown(report)).toContain(String(expected));
  });
});

describe("source evidence is admitted against the target and analysis cutoff", () => {
  it.each([
    { capitalPeriodEnd: "2025-02-30" }, { capitalPeriodEnd: "invalid" },
    { targetScope: { periodEnd: "2025-02-30" } }, { targetScope: { periodEnd: "invalid" } },
    { targetScope: { periodStart: "2024-02-30", periodEnd: "2025-02-28" } },
    { admissionAsOf: "invalid" }, { admissionAsOf: "" },
  ] satisfies Partial<CommonIncomeInputs>[])("rejects supplied invalid target/capital/cutoff metadata: %j", extra => {
    expect(commonHolderCapital({ netIncome: 100, netIncomeAvailableToCommon: 94,
      commonIncomeScope: { basis: "annual", periodEnd: "2025-02-28" }, ...extra,
    }, { totalStockholdersEquity: 1000 }).commonIncome).toBeNull();
  });
  it.each([false, true])("retains valid or absent target/capital/cutoff metadata (%s)", supplied => {
    expect(commonHolderCapital({ netIncome: 100, netIncomeAvailableToCommon: 94,
      commonIncomeScope: { basis: "annual", periodEnd: "2025-02-28" },
      ...(supplied ? { targetScope: { periodEnd: "2025-02-28" }, capitalPeriodEnd: "2025-02-28", admissionAsOf: "2025-03-01T00:00:00.000Z" } : {}),
    }, { totalStockholdersEquity: 1000 }).commonIncome).toBe(94);
  });
  it("refuses a known future flow even if its observation timestamp claims current availability", () => {
    const scope = { basis: "annual" as const, periodStart: "2027-01-01", periodEnd: "2027-12-31", observedAt: "2026-07-06T00:00:00.000Z" };
    expect(commonHolderCapital({ netIncome: 100, netIncomeAvailableToCommon: 94, commonIncomeScope: scope,
      targetScope: scope, admissionAsOf: "2026-07-06T00:00:00.000Z" }, { totalStockholdersEquity: 1000 }).commonIncome).toBeNull();
  });
  it.each([94, 0, -5])("an unused NI source scope cannot veto direct common %s on legacy callers", value => {
    expect(commonHolderCapital({ netIncome: 100, netIncomeAvailableToCommon: value,
      incomeScope: { basis: "annual", periodStart: "2024-01-01", periodEnd: "2024-12-31" },
      commonIncomeScope: { basis: "annual", periodStart: "2025-01-01", periodEnd: "2025-12-31" },
    }, { totalStockholdersEquity: 1000, preferredStock: 25 }).commonIncome).toBe(value);
  });
  it.each(["future-filing", "future-observation", "prior-year", "nonfinite-nci"] as const)("refuses %s through report/read/export consumers", mode => {
    const bundle = annual();
    if (!bundle.statements.incomeAnnual.ok || !bundle.statements.balanceAnnual.ok) throw new Error("synthetic rows required");
    for (const row of bundle.statements.incomeAnnual.value.data.rows) {
      const common = row.fieldProvenance!.netIncomeAvailableToCommon!;
      if (mode === "future-filing") common.filings = [{ accn: "synthetic-future", filed: "2027-01-01", form: "10-K" }];
      if (mode === "future-observation") common.observedAt = "2027-01-01T00:00:00.000Z";
      if (mode === "prior-year") {
        const end = `${Number(String(row.date).slice(0, 4)) - 1}-12-31`;
        row.fieldProvenance = { netIncome: evidence(end, bundle.builtAt), netIncomeAvailableToCommon: evidence(end, bundle.builtAt) };
      }
      if (mode === "nonfinite-nci") {
        delete row.netIncomeAvailableToCommon;
        row.netIncomeOwnershipBasis = "consolidated";
        row.netIncomeAttributableToNoncontrollingInterest = Infinity;
      }
    }
    if (mode === "nonfinite-nci") for (const row of bundle.statements.balanceAnnual.value.data.rows) { row.preferredStock = 0; row.minorityInterest = 0; }
    const { computed, report, surfaces } = runResearchRoutePanel(bundle);
    expect(computed.returns.rote.latestRotePct).toBeNull();
    expect(computed.returns.rote.latestTangibleCommonEquity).not.toBeNull();
    expect(computed.valuation.multiples?.multiples.find(row => row.key === "peTtm")?.current).toBeNull();
    if (computed.valuation.kind !== "excess-return") throw new Error("bank route required");
    expect(computed.valuation.excessReturn.payoutRatioPct.value).toBeNull();
    expect(computed.valuation.excessReturn.perShare).toBeNull();
    expect(report.fairValue).toMatchObject({ status: "suppressed", perShare: null });
    expect(parseStoredReport(JSON.stringify(report))?.fairValue?.perShare).toBeNull();
    for (const surface of [...Object.values(surfaces), reportToAuditMarkdown(report)]) expect(surface).toMatch(/common.*earnings|earnings.*common/i);
  });
  it.each([140, 0, -5])("valid annual direct common %s wins over an incompatible unused NI fallback", common => {
    const bundle = annual();
    if (!bundle.statements.incomeAnnual.ok) throw new Error("synthetic rows required");
    for (const row of bundle.statements.incomeAnnual.value.data.rows) {
      row.fieldProvenance!.netIncome = evidence(`${Number(String(row.date).slice(0, 4)) - 1}-12-31`, bundle.builtAt);
    }
    bundle.statements.incomeAnnual.value.data.rows[0]!.netIncomeAvailableToCommon = common * M;
    const { computed } = runResearchRoutePanel(bundle);
    if (common === 0) expect(computed.returns.rote.latestRotePct).toBe(0);
    else expect(computed.returns.rote.latestRotePct).toBeCloseTo(common / 375 * 100, 10);
    if (common === 140) {
      if (computed.valuation.kind !== "excess-return") throw new Error("bank route required");
      expect(computed.valuation.excessReturn.payoutRatioPct.value).toBeCloseTo(34.71611721611722, 10);
      expect(computed.valuation.multiples?.multiples.find(row => row.key === "peTtm")?.current).toBeCloseTo(10_000 / 140, 10);
    }
  });
  it("valid four-quarter direct common wins over an incompatible unused NI fallback", () => {
    const bundle = buildSyntheticRouteBundle("bank");
    if (!bundle.statements.incomeQuarterly.ok) throw new Error("synthetic rows required");
    const rows = bundle.statements.incomeQuarterly.value.data.rows;
    for (const row of rows) {
      delete row.epsDiluted; row.netIncomeAvailableToCommon = 40 * M;
      row.fieldProvenance = { netIncome: evidence(String(row.date), bundle.builtAt, true), netIncomeAvailableToCommon: evidence(String(row.date), bundle.builtAt, true) };
    }
    rows[1]!.fieldProvenance!.netIncome = { ...rows[2]!.fieldProvenance!.netIncome! };
    expect(runResearchRoutePanel(bundle).computed.valuation.multiples?.multiples.find(row => row.key === "peTtm")?.current).toBeCloseTo(62.5, 10);
  });
  it.each(["future-filing", "future-observation", "prior-year"] as const)("current TTM refuses direct common source %s", mode => {
    const bundle = buildSyntheticRouteBundle("bank");
    if (!bundle.statements.incomeQuarterly.ok) throw new Error("synthetic rows required");
    for (const row of bundle.statements.incomeQuarterly.value.data.rows) {
      delete row.epsDiluted;
      row.fieldProvenance = { netIncomeAvailableToCommon: evidence(String(row.date), bundle.builtAt, true) };
    }
    const row = bundle.statements.incomeQuarterly.value.data.rows[1]!;
    if (mode === "future-filing") row.fieldProvenance!.netIncomeAvailableToCommon!.filings = [{ accn: "synthetic-future", filed: "2027-01-01", form: "10-Q" }];
    if (mode === "future-observation") row.fieldProvenance!.netIncomeAvailableToCommon!.observedAt = "2027-01-01T00:00:00.000Z";
    if (mode === "prior-year") row.fieldProvenance!.netIncomeAvailableToCommon = evidence("2024-12-31", bundle.builtAt, true);
    expect(runResearchRoutePanel(bundle).computed.valuation.multiples?.multiples.find(row => row.key === "peTtm")?.current).toBeNull();
  });
  it.each(["prior-year", "invalid-date"] as const)("ROTE binds supported common flow to its capital balance (%s)", mode => {
    const bundle = annual();
    if (!bundle.statements.balanceAnnual.ok) throw new Error("synthetic rows required");
    for (const row of bundle.statements.balanceAnnual.value.data.rows) {
      row.fieldProvenance = { totalStockholdersEquity: evidence(mode === "prior-year"
        ? `${Number(String(row.date).slice(0, 4)) - 1}-12-31` : "2025-02-30", bundle.builtAt) };
    }
    const { computed } = runResearchRoutePanel(bundle);
    expect(computed.returns.rote.latestRotePct).toBeNull();
    expect(computed.returns.rote.latestTangibleCommonEquity).toBe(400 * M);
    expect(computed.valuation.multiples?.multiples.find(row => row.key === "peTtm")?.current).toBeCloseTo(10_000 / 140, 10);
  });
});

describe("historical common earnings use the same actual-window and cash admission", () => {
  it.each(["complete", "missing-current", "missing-older", "filed-common"] as const)("historical fallback requires complete four-quarter NCI allocation (%s)", mode => {
    const bundle = buildSyntheticRouteBundle("bank", { quarterHistory: true });
    if (!bundle.statements.incomeQuarterly.ok || !bundle.statements.balanceQuarterly.ok) throw new Error("synthetic rows required");
    const rows = bundle.statements.incomeQuarterly.value.data.rows;
    for (const row of rows) {
      delete row.epsDiluted;
      row.netIncomeOwnershipBasis = "consolidated";
      row.netIncomeAttributableToNoncontrollingInterest = 3 * M;
      if (mode === "filed-common") row.netIncomeAvailableToCommon = 40 * M;
      else delete row.netIncomeAvailableToCommon;
      row.fieldProvenance = { netIncome: evidence(String(row.date), bundle.builtAt, true),
        netIncomeAttributableToNoncontrollingInterest: evidence(String(row.date), bundle.builtAt, true),
        ...(mode === "filed-common" ? { netIncomeAvailableToCommon: evidence(String(row.date), bundle.builtAt, true) } : {}) };
    }
    for (const member of [bundle.statements.balanceAnnual, bundle.statements.balanceQuarterly]) {
      if (!member.ok) throw new Error("synthetic rows required");
      for (const row of member.value.data.rows) { row.preferredStock = 0; row.minorityInterest = 0; }
    }
    const missing = mode === "missing-current" ? 1 : 8;
    if (mode !== "complete") delete rows[missing]!.netIncomeAttributableToNoncontrollingInterest;
    const { computed, report, surfaces } = runResearchRoutePanel(bundle);
    const pe = computed.valuation.multiples?.multiples.find(row => row.key === "peTtm");
    const details = pe?.ownHistory?.observationDetails ?? [];
    if (mode === "complete" || mode === "filed-common") {
      expect(pe?.ownHistory?.observations).toBe(9);
      expect(pe?.current).toBeCloseTo(mode === "filed-common" ? 62.5 : 10_000 / 168, 10);
    } else if (mode === "missing-current") {
      expect(pe?.current).toBeNull();
      expect(details.some(point => point.periodEnd === rows[0]!.date || point.periodEnd === rows[1]!.date)).toBe(false);
      expect(pe?.ownHistory).toBeNull(); // seven eligible observations are below the history-band minimum
    } else {
      expect(pe?.current).toBeCloseTo(10_000 / 168, 10);
      expect(pe?.ownHistory).toBeNull(); // five eligible observations are below the history-band minimum
    }
    const reportPe = report.valuation.multiples.find(row => row.name.startsWith("P/E"));
    const storedPe = parseStoredReport(JSON.stringify(report))?.valuation.multiples.find(row => row.name.startsWith("P/E"));
    expect(reportPe?.ownHistoryDetails ?? []).toEqual(details);
    expect(storedPe?.ownHistoryDetails ?? []).toEqual(details);
    if (mode.startsWith("missing")) for (const surface of [...Object.values(surfaces), reportToAuditMarkdown(report)]) expect(surface).toMatch(/common|noncontrolling|histor/i);
  });
  it.each(["clean", "duplicate", "overlap", "long-window", "currency", "issuer", "nearby-cash", "future-filing", "future-observation", "prior-year"] as const)("refuses contaminated historical observations (%s)", mode => {
    const bundle = buildSyntheticRouteBundle("bank", { quarterHistory: true });
    if (!bundle.statements.incomeQuarterly.ok || !bundle.statements.balanceQuarterly.ok || !bundle.statements.cashflowQuarterly.ok) throw new Error("synthetic rows required");
    // Keep enough unaffected windows to inspect retained observations after
    // rejecting four contaminated windows (the history band has a minimum).
    const olderDates = ["2023-03-31", "2022-12-31", "2022-09-30", "2022-06-30"];
    for (const member of [bundle.statements.incomeQuarterly, bundle.statements.balanceQuarterly, bundle.statements.cashflowQuarterly]) {
      const template = member.value.data.rows.at(-1)!;
      for (const date of olderDates) member.value.data.rows.push({ ...template, date });
    }
    if (!bundle.enterpriseValues.ok) throw new Error("synthetic market history required");
    const marketTemplate = bundle.enterpriseValues.value.data.rows.at(-1)!;
    for (const date of olderDates) bundle.enterpriseValues.value.data.rows.push({ ...marketTemplate, date });
    const rows = bundle.statements.incomeQuarterly.value.data.rows;
    for (const row of rows) {
      delete row.epsDiluted;
      row.cik = "synthetic-issuer";
      row.fieldProvenance = { netIncome: evidence(String(row.date), bundle.builtAt, true), netIncomeAvailableToCommon: evidence(String(row.date), bundle.builtAt, true) };
    }
    const bad = rows[5]!;
    if (mode === "duplicate") bad.fieldProvenance = structuredClone(rows[6]!.fieldProvenance);
    if (mode === "overlap") for (const scope of Object.values(bad.fieldProvenance!)) scope.periodStart = new Date(Date.parse(scope.periodStart!) - 7 * 86_400_000).toISOString().slice(0, 10);
    if (mode === "long-window") for (const scope of Object.values(bad.fieldProvenance!)) scope.periodStart = new Date(Date.parse(scope.periodStart!) - 25 * 86_400_000).toISOString().slice(0, 10);
    if (mode === "currency") for (const scope of Object.values(bad.fieldProvenance!)) scope.unit = "CAD";
    if (mode === "issuer") bad.cik = "synthetic-other-issuer";
    if (mode === "future-filing") bad.fieldProvenance!.netIncomeAvailableToCommon!.filings = [{ accn: "synthetic-future", filed: "2027-01-01", form: "10-Q" }];
    if (mode === "future-observation") bad.fieldProvenance!.netIncomeAvailableToCommon!.observedAt = "2027-01-01T00:00:00.000Z";
    if (mode === "prior-year") bad.fieldProvenance!.netIncomeAvailableToCommon = evidence(`${Number(String(bad.date).slice(0, 4)) - 1}-12-31`, bundle.builtAt, true);
    if (mode === "nearby-cash") {
      for (const row of rows) delete row.netIncomeAvailableToCommon;
      for (const row of bundle.statements.balanceQuarterly.value.data.rows) row.preferredStock = 0;
      for (const row of bundle.statements.cashflowQuarterly.value.data.rows) {
        row.preferredDividendsPaid = -4 * M;
        row.fieldProvenance = { preferredDividendsPaid: evidence(String(row.date), bundle.builtAt, true) };
        row.date = new Date(Date.parse(String(row.date)) + 3 * 86_400_000).toISOString().slice(0, 10);
      }
    }
    const { computed, report, surfaces } = runResearchRoutePanel(bundle);
    const pe = computed.valuation.multiples?.multiples.find(row => row.key === "peTtm");
    const saved = parseStoredReport(JSON.stringify(report));
    const reportPe = report.valuation.multiples.find(row => row.name.startsWith("P/E"));
    const savedPe = saved?.valuation.multiples.find(row => row.name.startsWith("P/E"));
    if (mode === "clean") expect(pe?.ownHistory?.observations).toBe(13);
    else if (mode === "nearby-cash") {
      expect(pe?.current).toBeNull(); expect(pe?.ownHistory).toBeNull();
      expect(reportPe?.ownHistoryDetails ?? []).toEqual([]); expect(savedPe?.ownHistoryDetails ?? []).toEqual([]);
      for (const surface of [...Object.values(surfaces), reportToAuditMarkdown(report)]) expect(surface).toMatch(/common|preferred/i);
    } else {
      // A shifted oldest start with no selected older neighbour can still
      // establish a 53-week-sized window; only demonstrated overlaps refuse.
      const contaminated = new Set(rows.slice(mode === "overlap" ? 3 : 2, 6).map(row => String(row.date)));
      const retained = mode === "overlap" ? 10 : 9;
      expect(pe?.ownHistory?.observations).toBe(retained);
      for (const details of [pe?.ownHistory?.observationDetails, reportPe?.ownHistoryDetails, savedPe?.ownHistoryDetails]) {
        expect(details).toHaveLength(retained);
        expect(details?.some(row => contaminated.has(row.periodEnd))).toBe(false);
      }
      for (const surface of [...Object.values(surfaces), reportToAuditMarkdown(report)]) expect(surface).toMatch(/window|histor|quarter/i);
    }
  });
});
