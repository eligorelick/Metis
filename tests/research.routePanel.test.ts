/** Synthetic offline integration controls; these are not live-provider or forecast-accuracy evidence. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { M } from "./helpers/currencyBundle";
import { reportToAuditMarkdown } from "@/report/export/auditMarkdown";
import { buildSyntheticRouteBundle, runResearchRoutePanel, SYNTHETIC_ROUTES } from "./helpers/researchRoutePanel";

let fetchAttempts = 0;
beforeEach(() => {
  fetchAttempts = 0;
  vi.stubGlobal("fetch", () => {
    fetchAttempts += 1;
    throw new Error("synthetic route panel attempted network access");
  });
});
afterEach(() => {
  try { expect(fetchAttempts).toBe(0); }
  finally { vi.unstubAllGlobals(); }
});

describe("synthetic accounting-route integration panel", () => {
  it.each(SYNTHETIC_ROUTES)("%s: retains immutable inputs and deterministic reports on every surface", (route) => {
    const bundle = buildSyntheticRouteBundle(route);
    const before = structuredClone(bundle);
    const first = runResearchRoutePanel(bundle);
    expect(bundle).toEqual(before);
    const repeated = runResearchRoutePanel(bundle);
    expect(bundle).toEqual(before);
    expect(repeated).toEqual(first);
    expect(first.report.meta).toMatchObject({ model: "none", costUsd: 0, verificationRate: null });
    expect(first.report.appendix.missingData.some((gap) => gap.field === "analysis.llm")).toBe(true);
    expect(first.report.scores).toEqual(first.computed.scores);
    expect(first.report.appendix.sources).toEqual([{
      provider: "fmp", endpoint: "synthetic:/income-statement", asOf: "2025-12-31", fetchedAt: "2026-07-06T00:00:00.000Z", stale: false,
    }]);
    expect(first.validation.checks.find((check) => check.id === "xbrlCrossCheck")).toMatchObject({ status: "skipped" });
    expect(first.report.appendix.missingData.some((gap) => gap.field === "validation.xbrlCrossCheck")).toBe(true);
    expect(first.validation.checks.find((check) => check.id === "balanceSheetIdentity.2025-12-31"))
      .toMatchObject({ status: "pass", deltaPct: 0 });
    for (const surface of Object.values(first.surfaces)) {
      expect(surface).toContain(bundle.symbol);
      expect(surface).toContain("Synthetic offline accounting-route control");
      expect(surface).not.toMatch(/\b(?:NaN|Infinity)\b/);
    }
  });

  it("general: retains real USD FCFF computation and explicitly unbacktested projection priors", () => {
    const { computed, report, surfaces } = runResearchRoutePanel(buildSyntheticRouteBundle("general"));
    expect(computed.route).toMatchObject({ base: "general", overlays: [] });
    expect(computed.returns.wacc.costOfEquityPct).toBeCloseTo(8.5, 10);
    expect(computed.valuation.kind).toBe("dcf");
    if (computed.valuation.kind !== "dcf") throw new Error("expected FCFF control");
    expect(computed.valuation.assumptions?.startRevenue.value).toBe(1_200 * M);
    expect(computed.capital.fcf.latestFcf).toBe(170 * M);
    expect(report.fairValue).toMatchObject({ status: "available", method: "fcff-dcf" });
    expect(report.valuation.dcf.perShare).toEqual(report.fairValue?.perShare);
    expect(report.projections?.series.length).toBeGreaterThan(0);
    expect(report.projections?.scenarioWeights).toEqual({ bull: 0.25, base: 0.5, bear: 0.25 });
    expect(report.projections?.weightsVersion).toContain("UNBACKTESTED");
    expect(report.projections?.series.find((series) => series.metric === "revenue")?.base[0]?.value)
      .toMatchObject({ unit: "USD", source: "computed.projections.revenue.base", verified: true });
    // D-67: a whole amount at its scale prints without decimals.
    for (const surface of Object.values(surfaces)) expect(surface).toContain("$170M");
  });

  it.each([
    { route: "bank", book: 400 * M, roe: 140 / 375 * 100, basis: /tangible common equity/, unavailable: "nim" },
    { route: "insurer", book: 450 * M, roe: 140 / 425 * 100, basis: /common equity/, unavailable: "combinedRatio" },
  ] as const)("$route: values common claims on the correct equity base and withholds unavailable named metrics", ({ route, book, roe, basis, unavailable }) => {
    const { computed, report, surfaces } = runResearchRoutePanel(buildSyntheticRouteBundle(route));
    expect(computed.route.base).toBe(route);
    expect(computed.valuation.kind).toBe("excess-return");
    if (computed.valuation.kind !== "excess-return") throw new Error("expected financial valuation");
    const valuation = computed.valuation.excessReturn;
    // FY equity 500m, preferred 50m, intangibles 50m. Prior equity 450m.
    // Common FY income 140m; bank averages tangible common, insurer common.
    // Audit 2026-10-22 C-10: the newer trailing window is the start, from the
    // book value at its end; the fiscal-year start is valued beside it.
    const ttm = computed.returns.commonReturnTtm!;
    expect(ttm.basis).toBe(route === "bank" ? "tangible-common-equity" : "common-equity");
    expect(valuation.openingBookValue.value).toBe(ttm.closingEquity);
    expect(valuation.openingBookValue.basis).toMatch(basis);
    expect(valuation.roePathPct.value[0]).toBeCloseTo(ttm.returnPct!, 10);
    expect(valuation.startAlternative).toMatchObject({ asOf: "2025-12-31", bookValue: book });
    expect(valuation.startAlternative!.startRoePct).toBeCloseTo(roe, 10);
    expect(valuation.payoutRatioPct.value).toBeCloseTo((40 / 140 + 56 / 130 + 39 / 120) / 3 * 100, 10);
    expect(report.fairValue).toMatchObject({ status: "available", method: "excess-return" });
    expect(report.valuation.dcf.perShare).toEqual(report.fairValue?.perShare);
    expect(report.valuation.dcf.sensitivityGrid).toEqual([]);
    expect(report.valuation.dcf.assumptions).toEqual([]);
    expect(computed.capital.fcf.latestFcf).toBeNull();
    expect(computed.returns.roic.series).toEqual([]);
    expect(computed.valuation.multiples.multiples.find((row) => row.key === "evToEbitda")?.current).toBeNull();
    expect(report.projections?.series).toEqual([]);
    expect(report.scenarioTargets).toMatchObject({ status: "suppressed", targets: [] });
    const metric = report.routeMetrics?.metrics.find((row) => row.key === unavailable);
    expect(metric?.value).toBeNull();
    expect(metric?.withheldReason).toEqual(expect.any(String));
    for (const surface of Object.values(surfaces)) {
      expect(surface).toContain("excess-return");
      expect(surface).toContain(metric!.label);
      expect(surface).toContain("Forward FCFF projections are only modelled on the general route");
    }
  });

  it("REIT: keeps fiscal-year FFO/AFFO distinct from trailing earnings and suppresses FCFF forecasts", () => {
    const { computed, report, surfaces } = runResearchRoutePanel(buildSyntheticRouteBundle("reit"));
    expect(computed.route).toMatchObject({ base: "reit", reitSubmap: "equity" });
    expect(computed.valuation.kind).toBe("reit");
    if (computed.valuation.kind !== "reit") throw new Error("expected REIT valuation");
    // FY NI 150m + D&A 50m = FFO 200m; less 40m capex = rough AFFO 160m.
    // Trailing NI is 180m and must not replace that fiscal-year numerator.
    expect(computed.valuation.reit).toMatchObject({
      asOf: "2025-12-31", ffoPerShare: 2, affoPerShare: 1.6, pToFfo: 50, pToAffo: 62.5,
    });
    expect(computed.valuation.reit.notes.join(" ")).toMatch(/APPROXIMATE|approximate/);
    expect(report.valuation.multiples.find((row) => row.name === "P/FFO")?.current).toBe(50);
    expect(report.fairValue).toMatchObject({ status: "suppressed", perShare: null });
    expect(report.projections?.series).toEqual([]);
    for (const surface of Object.values(surfaces)) {
      expect(surface).toContain("P/FFO");
      expect(surface).toContain("50.00");
      expect(surface).toContain("Forward FCFF projections are only modelled on the general route");
    }
  });

  it("same-currency ADR: withholds quoted-share valuation when retained ADS evidence is absent", () => {
    const { computed, report } = runResearchRoutePanel(buildSyntheticRouteBundle("adr"));
    expect(computed.route.overlays).toContain("adr");
    expect(computed.valuation.kind).toBe("dcf");
    if (computed.valuation.kind !== "dcf") throw new Error("expected ADR DCF route");
    expect(computed.valuation.dcf?.perShare).toBeNull();
    expect(computed.valuation.gaps.some((gap) => /quoted.*share|share.*ADS/i.test(gap.reason))).toBe(true);
    expect(report.fairValue).toMatchObject({ status: "suppressed", perShare: null });
    expect(report.valuation.dcf.perShare).toBeNull();
    expect(report.valuation.multiples.find((row) => row.name === "P/E (TTM)")?.current).toBeNull();
    expect(report.scenarioTargets).toMatchObject({ status: "suppressed", targets: [] });
  });

  it.each(["loss-making", "pre-revenue"] as const)("%s: computes liquidity and cash-burn runway and suppresses FCFF reports", (route) => {
    const { computed, report, surfaces } = runResearchRoutePanel(buildSyntheticRouteBundle(route));
    expect(computed.route.overlays).toContain("unprofitable");
    if (route === "pre-revenue") expect(computed.route.overlays).toContain("pre-revenue");
    expect(computed.valuation.kind).toBe(route === "pre-revenue" ? "pre-revenue" : "dcf-suppressed");
    expect(computed.runway).toMatchObject({ burning: true, liquidAssets: 120 * M, avgQuarterlyBurn: 65 * M, burnWindowQuarters: 4 });
    expect(computed.runway?.runwayQuarters).toBeCloseTo(120 / 65, 10);
    expect(report.fairValue).toMatchObject({ status: "suppressed", perShare: null });
    expect(report.valuation.dcf.perShare).toBeNull();
    expect(report.projections?.series).toEqual([]);
    expect(report.scenarioTargets).toMatchObject({ status: "suppressed", targets: [] });
    if (route === "pre-revenue") expect(report.valuation.multiples).toEqual([]);
    for (const surface of Object.values(surfaces)) {
      expect(surface).toContain("Forward FCFF projections are only modelled on the general route");
    }
  });

  it("ADR currency conflict: keeps local-currency operating evidence while withholding quote comparisons", () => {
    const bundle = buildSyntheticRouteBundle("adr");
    for (const result of [bundle.statements.incomeAnnual, bundle.statements.incomeQuarterly, bundle.statements.balanceAnnual,
      bundle.statements.balanceQuarterly, bundle.statements.cashflowAnnual, bundle.statements.cashflowQuarterly]) {
      if (!result.ok) throw new Error("fixture requires statements");
      for (const row of result.value.data.rows) row.reportedCurrency = "TWD";
    }
    const { computed, report, surfaces } = runResearchRoutePanel(bundle);
    expect(computed.route.overlays).toContain("adr");
    expect(report.fairValue).toMatchObject({ status: "suppressed", perShare: null });
    expect(report.valuation.dcf.perShare).toBeNull();
    expect(report.valuation.multiples.length).toBeGreaterThan(0);
    expect(report.valuation.multiples.every((row) => row.current === null)).toBe(true);
    expect(report.appendix.missingData.find((gap) => gap.field === "valuation.priceComparison.currency")?.reason)
      .toMatch(/TWD.*USD/);
    const cashFlow = report.fundamentals.fcf.find((row) => row.label === "Free cash flow (after SBC, house default)");
    expect(cashFlow?.values.at(-1)?.value).toMatchObject({ value: 170 * M, currency: "TWD" });
    for (const surface of Object.values(surfaces)) {
      expect(surface).toContain("170M TWD");
      expect(surface).not.toContain("$170M");
    }
  });

  it.each(["bank", "insurer"] as const)("%s missing common earnings: does not substitute total earnings beside preferred claims", (route) => {
    const bundle = buildSyntheticRouteBundle(route);
    for (const result of [bundle.statements.incomeAnnual, bundle.statements.incomeQuarterly]) {
      if (!result.ok) throw new Error("fixture requires income");
      for (const row of result.value.data.rows) delete row.netIncomeAvailableToCommon;
    }
    const { computed, report, surfaces } = runResearchRoutePanel(bundle);
    expect(computed.valuation.kind).toBe("excess-return");
    if (computed.valuation.kind !== "excess-return") throw new Error("expected financial route");
    expect(computed.valuation.excessReturn.perShare).toBeNull();
    expect(report.fairValue).toMatchObject({ status: "suppressed", perShare: null });
    expect(report.valuation.dcf.perShare).toBeNull();
    expect(report.projections?.series).toEqual([]);
    expect(report.appendix.missingData.some((gap) => /common.*earnings|earnings.*common/i.test(gap.reason))).toBe(true);
    for (const surface of Object.values(surfaces)) expect(surface).toMatch(/common.*earnings|earnings.*common/i);
  });

  it("bank missing risk-free evidence: preserves book inputs and discloses suppressed intrinsic value", () => {
    const bundle = buildSyntheticRouteBundle("bank");
    bundle.treasury = { ok: false, gap: { field: "treasury", reason: "Synthetic missing risk-free observation", severity: "warn" } };
    const { computed, report, surfaces } = runResearchRoutePanel(bundle);
    expect(computed.returns.wacc.costOfEquityPct).toBeNull();
    expect(computed.valuation.kind).toBe("excess-return");
    if (computed.valuation.kind !== "excess-return") throw new Error("expected financial route");
    expect(computed.valuation.excessReturn.openingBookValue.value).toBe(computed.returns.commonReturnTtm!.closingEquity);
    expect(report.fairValue).toMatchObject({ status: "suppressed", perShare: null });
    expect(report.valuation.dcf.perShare).toBeNull();
    for (const surface of Object.values(surfaces)) expect(surface).toContain("cost of equity");
  });

  it("REIT missing depreciation: withholds FFO/AFFO instead of treating the defining add-back as zero", () => {
    const bundle = buildSyntheticRouteBundle("reit");
    if (!bundle.statements.incomeAnnual.ok) throw new Error("fixture requires income");
    delete bundle.statements.incomeAnnual.value.data.rows[0]!.depreciationAndAmortization;
    const { computed, report, surfaces } = runResearchRoutePanel(bundle);
    expect(computed.valuation.kind).toBe("reit");
    if (computed.valuation.kind !== "reit") throw new Error("expected REIT route");
    expect(computed.valuation.reit).toMatchObject({ ffoPerShare: null, affoPerShare: null, pToFfo: null, pToAffo: null });
    expect(report.valuation.multiples.find((row) => row.name === "P/FFO")?.current).toBeNull();
    expect(report.appendix.missingData.some((gap) => gap.field === "valuation.reit.ffo")).toBe(true);
    // D-62: the body names the withheld FFO warning; the full manifest entry
    // (with the depreciation tags it tried) is in the audit export. D-67: by
    // its reader label; the manifest field itself is in the audit export.
    for (const surface of Object.values(surfaces)) expect(surface).toContain("Valuation REIT FFO");
    expect(reportToAuditMarkdown(report)).toContain("valuation.reit.ffo");
    expect(reportToAuditMarkdown(report)).toMatch(/depreciation/i);
  });

  it("undetermined REIT subtype: withholds FFO metrics until equity-versus-mortgage identity is supported", () => {
    const bundle = buildSyntheticRouteBundle("reit");
    if (!bundle.profile.ok) throw new Error("fixture requires profile");
    delete bundle.profile.value.data.rows[0]!.industry;
    bundle.edgar.sic = "6798";
    const { computed, report, surfaces } = runResearchRoutePanel(bundle);
    expect(computed.route).toMatchObject({ base: "reit", reitSubmap: "undetermined" });
    expect(computed.valuation.kind).toBe("reit");
    if (computed.valuation.kind !== "reit") throw new Error("expected REIT route");
    expect(computed.valuation.reit).toMatchObject({ pToFfo: null, pToAffo: null, ffoPerShare: null });
    expect(report.valuation.multiples.find((row) => row.name === "P/FFO")?.current).toBeNull();
    expect(report.valuation.multiples.find((row) => row.name === "P/AFFO")?.current).toBeNull();
    expect(report.projections?.series).toEqual([]);
    for (const surface of Object.values(surfaces)) expect(surface).toContain("sub-map is undetermined");
  });

  it("equity REIT with twelve quarters: retains nine usable FFO/AFFO history windows", () => {
    const { computed, report } = runResearchRoutePanel(buildSyntheticRouteBundle("reit", { quarterHistory: true }));
    expect(computed.valuation.kind).toBe("reit");
    if (computed.valuation.kind !== "reit") throw new Error("expected REIT route");
    for (const key of ["priceToFfo", "priceToAffo"]) {
      expect(computed.valuation.multiples.multiples.find((row) => row.key === key)?.ownHistory?.observations).toBe(9);
    }
    expect(report.valuation.multiples.find((row) => row.name === "P/FFO"))
      .toMatchObject({ current: 50, ownHistoryObservations: 9 });
    expect(report.valuation.multiples.find((row) => row.name === "P/AFFO"))
      .toMatchObject({ current: 62.5, ownHistoryObservations: 9 });
  });

  it("undetermined REIT with twelve quarters: withholds current and historical equity-REIT multiples", () => {
    const bundle = buildSyntheticRouteBundle("reit", { quarterHistory: true });
    if (!bundle.profile.ok) throw new Error("fixture requires profile");
    delete bundle.profile.value.data.rows[0]!.industry;
    bundle.edgar.sic = "6798";
    const { computed, report, surfaces } = runResearchRoutePanel(bundle);
    expect(computed.route.reitSubmap).toBe("undetermined");
    expect(computed.valuation.kind).toBe("reit");
    if (computed.valuation.kind !== "reit") throw new Error("expected REIT route");
    for (const key of ["priceToFfo", "priceToAffo"]) {
      expect(computed.valuation.multiples.multiples.find((row) => row.key === key))
        .toMatchObject({ current: null, ownHistory: null, peers: null });
    }
    for (const name of ["P/FFO", "P/AFFO"]) {
      expect(report.valuation.multiples.find((row) => row.name === name))
        .toMatchObject({ current: null, own5yPercentile: null, ownHistoryObservations: null });
    }
    for (const surface of Object.values(surfaces)) expect(surface).toContain("sub-map is undetermined");
  });

  it("mortgage REIT with twelve quarters: keeps its common-book model and omits equity-REIT multiples", () => {
    const bundle = buildSyntheticRouteBundle("reit", { quarterHistory: true });
    if (!bundle.profile.ok) throw new Error("fixture requires profile");
    bundle.profile.value.data.rows[0]!.industry = "REIT - Mortgage";
    const { computed, report } = runResearchRoutePanel(bundle);
    expect(computed.route).toMatchObject({ base: "reit-mortgage", reitSubmap: "mortgage" });
    expect(computed.valuation.kind).toBe("excess-return");
    if (computed.valuation.kind !== "excess-return") throw new Error("expected mortgage book route");
    // C-10: the trailing window's closing common equity is the opening book.
    expect(computed.valuation.excessReturn.openingBookValue.value).toBe(computed.returns.commonReturnTtm!.closingEquity);
    expect(computed.valuation.excessReturn.startAlternative?.bookValue).toBe(500 * M);
    expect(report.fairValue).toMatchObject({ status: "available", method: "excess-return" });
    expect(report.valuation.multiples.some((row) => row.name === "P/FFO" || row.name === "P/AFFO")).toBe(false);
    expect(report.projections?.series).toEqual([]);
  });

  it("cash-burn currency conflict: withholds runway rather than mixing liquidity and burn currencies", () => {
    const bundle = buildSyntheticRouteBundle("loss-making");
    if (!bundle.statements.balanceQuarterly.ok) throw new Error("fixture requires quarter balances");
    for (const row of bundle.statements.balanceQuarterly.value.data.rows) row.reportedCurrency = "EUR";
    const { computed, report, surfaces } = runResearchRoutePanel(bundle);
    expect(computed.runway).toMatchObject({ burning: true, avgQuarterlyBurn: 65 * M, runwayQuarters: null, estimatedExhaustionDate: null });
    expect(report.appendix.missingData.some((gap) => gap.field === "runway.currency")).toBe(true);
    for (const surface of Object.values(surfaces)) expect(surface).toContain("no FX conversion is attempted");
  });

  it("failed Stage A identity: carries the 25% discrepancy through the parsed report and all surfaces", () => {
    const bundle = buildSyntheticRouteBundle("general");
    if (!bundle.statements.balanceAnnual.ok) throw new Error("fixture requires annual balances");
    bundle.statements.balanceAnnual.value.data.rows[0]!.totalAssets = 1_600 * M;
    const { validation, report, surfaces } = runResearchRoutePanel(bundle);
    expect(validation.checks.find((check) => check.id === "balanceSheetIdentity.2025-12-31"))
      .toMatchObject({ status: "fail", deltaPct: 25 });
    expect(report.appendix.missingData.some((gap) => gap.field === "validation.balanceSheetIdentity.2025-12-31")).toBe(true);
    for (const surface of Object.values(surfaces)) expect(surface).toContain("balance-sheet identity residual 25%");
  });

  it("missing Stage A denominator: reports an uncheckable balance identity rather than a pass", () => {
    const bundle = buildSyntheticRouteBundle("general");
    if (!bundle.statements.balanceAnnual.ok) throw new Error("fixture requires annual balances");
    delete bundle.statements.balanceAnnual.value.data.rows[0]!.totalAssets;
    const { validation, report, surfaces } = runResearchRoutePanel(bundle);
    expect(validation.checks.find((check) => check.id === "balanceSheetIdentity.2025-12-31"))
      .toMatchObject({ status: "skipped" });
    expect(report.appendix.missingData.some((gap) => gap.field === "validation.balanceSheetIdentity.2025-12-31")).toBe(true);
    for (const surface of Object.values(surfaces)) expect(surface).toContain("identity not checkable");
  });

  it("malformed latest quarter: rejects the impossible date and uses coherent annual DCF inputs", () => {
    const bundle = buildSyntheticRouteBundle("general");
    if (!bundle.statements.incomeQuarterly.ok) throw new Error("fixture requires quarters");
    Object.assign(bundle.statements.incomeQuarterly.value.data.rows[0]!, { date: "2026-02-31", revenue: 9_999 * M });
    const { computed, report, surfaces } = runResearchRoutePanel(bundle);
    expect(computed.valuation.kind).toBe("dcf");
    if (computed.valuation.kind !== "dcf") throw new Error("expected general route");
    expect(computed.valuation.assumptions?.startRevenue.value).toBe(1_000 * M);
    expect(report.valuation.dcf.assumptions.find((row) => row.name === "start revenue")?.value).toBe("1.00B");
    expect(report.appendix.missingData.some((gap) => /invalid|malformed|calendar/i.test(gap.reason))).toBe(true);
    for (const surface of Object.values(surfaces)) expect(surface).toContain("2026-02-31");
  });
});
