/**
 * Audit 2026-10-22 C-11: the excess-return route gave the reader no trailing
 * return and no start-ROTE sensitivity, so COF's report said returns would
 * "recover from the acquisition-affected annual starting point toward the cost
 * of equity" when its trailing four quarters already earned about 16.5%, above
 * every point of the 4.2% → 9.6% path. The owner's remedy:
 *  - TTM ROTE (common-equity ROE for insurers) rows in the returns block and
 *    the LLM payload;
 *  - a 3×3 start-return × cost-of-equity grid in the valuation section;
 *  - a Stage C consistency check that flags base-case language about returns
 *    recovering toward the cost of equity when the trailing return already
 *    exceeds the model's terminal target.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runStageB } from "@/pipeline/compute";
import { computeDcfDisplay } from "@/pipeline/stageB/fairValue";
import { excessReturnModel, type ExcessReturnInputs } from "@/pipeline/stageB/valuation";
import { assembleReport } from "@/pipeline/stageC/passes";
import { assembleContextPayload, serializePayloadForPrompt } from "@/pipeline/stageC/payload";
import { returnPathLanguageFindings, returnPathLanguageManifestEntries } from "@/pipeline/stageC/returnPathLanguage";
import { validateBundle } from "@/pipeline/stageA/validate";
import { valuationAuditTables } from "@/report/auditTables";
import { buildScenarioPresentation } from "@/report/scenarioPresentation";
import type { JudgeOutput } from "@/report/schema";
import { buildSyntheticRouteBundle, runResearchRoutePanel } from "./helpers/researchRoutePanel";
import { loadTask28Fixture } from "./helpers/task28Report";

let fetchAttempts = 0;
beforeEach(() => {
  fetchAttempts = 0;
  vi.stubGlobal("fetch", () => {
    fetchAttempts += 1;
    throw new Error("C-11 fixtures attempted network access");
  });
});
afterEach(() => {
  try { expect(fetchAttempts).toBe(0); }
  finally { vi.unstubAllGlobals(); }
});

const COE = 9.6;
const bank = (over: Partial<ExcessReturnInputs> = {}): ExcessReturnInputs => ({
  bookValue: 1000,
  bookValueBasis: "tangible-common-equity",
  currentRoePct: 16.5,
  currentRoeBasis: "ttm-rote",
  currentRoeAsOf: "2026-06-30",
  asOf: "2026-06-30",
  costOfEquityPct: COE,
  payoutRatioPct: 30,
  dilutedShares: 100,
  marketCap: 2000,
  riskFreePct: 4.2,
  startAlternative: { roePct: 4.2, basis: "fiscal-year-rote", asOf: "2025-12-31", bookValue: 950 },
  ...over,
});

describe("C-11: the start-return × cost-of-equity grid", () => {
  it("shows the trailing and fiscal-year starts against the cost of equity ±1pp, centred on the headline", () => {
    const er = excessReturnModel(bank());
    const grid = er.startCoeGrid!;
    expect(grid.costOfEquityPcts).toEqual([COE - 1, COE, COE + 1]);
    expect(grid.rows.map((r) => r.startReturnPct)).toEqual([4.2, 16.5, 21.5]);
    expect(grid.rows[0]).toMatchObject({ bookValue: 950 });
    expect(grid.rows[0].label).toMatch(/^FY 2025-12-31 ROTE start 4\.2%/);
    expect(grid.rows[1].label).toMatch(/^TTM ROTE to 2026-06-30 16\.5% \(headline\)/);
    expect(grid.rows[1]).toMatchObject({ bookValue: 1000 });
    expect(grid.perShare).toHaveLength(3);
    for (const row of grid.perShare) expect(row).toHaveLength(3);
    // The centre cell is the headline; the fiscal-year row at the base CoE is the alternative.
    expect(grid.perShare[1][1]).toBeCloseTo(er.perShare!, 10);
    expect(grid.perShare[0][1]).toBeCloseTo(er.startAlternative!.perShare!, 10);
    // A higher start is worth more; a higher cost of equity is worth less.
    expect(grid.perShare[2][1]!).toBeGreaterThan(grid.perShare[1][1]!);
    expect(grid.perShare[1][0]!).toBeGreaterThan(grid.perShare[1][1]!);
    expect(grid.notes.join(" ")).toMatch(/cost of equity/);
  });

  it("without a fiscal-year alternative the rows are the start ±5pp", () => {
    const grid = excessReturnModel(bank({ startAlternative: null })).startCoeGrid!;
    expect(grid.rows.map((r) => r.startReturnPct)).toEqual([11.5, 16.5, 21.5]);
    expect(grid.rows.every((r) => r.bookValue === 1000)).toBe(true);
  });

  it("floors every cell at zero, as the published headline is floored", () => {
    const er = excessReturnModel(bank({ currentRoePct: -150, startAlternative: null }));
    expect(er.perShare!).toBeLessThan(0);
    const cells = er.startCoeGrid!.perShare.flat();
    expect(cells.every((v) => v !== null && Number.isFinite(v) && v >= 0)).toBe(true);
    expect(er.startCoeGrid!.perShare[1][1]).toBe(0);
  });

  it("is not built without a per-share denominator", () => {
    expect(excessReturnModel(bank({ dilutedShares: null })).startCoeGrid).toBeUndefined();
  });

  it("reaches the report display and renders as a valuation table", () => {
    const { computed, report, surfaces } = runResearchRoutePanel(buildSyntheticRouteBundle("bank"));
    if (computed.valuation.kind !== "excess-return") throw new Error("expected the bank route");
    const display = computeDcfDisplay(computed.valuation, "USD");
    expect(display.excessReturnGrid?.perShare).toHaveLength(3);
    expect(report.valuation.dcf.excessReturnGrid).toEqual(display.excessReturnGrid);
    const table = valuationAuditTables(report.valuation.dcf).find((t) => /starting return/i.test(t.heading));
    expect(table?.headers.slice(1)).toEqual(display.excessReturnGrid!.costOfEquityPcts.map((c) => `CoE ${c.toFixed(1)}%`));
    expect(table?.rows.map((r) => r[0])).toEqual(display.excessReturnGrid!.rows.map((r) => r.label));
    for (const surface of Object.values(surfaces)) {
      expect(surface).toMatch(/Sensitivity \(per share — rows = starting return/);
      expect(surface).toContain(display.excessReturnGrid!.rows[1]!.label);
    }
    // The scenario sensitivity summary reads the grid instead of calling the route unavailable.
    const presentation = buildScenarioPresentation(computed, report.fairValue!.perShare!.value / (1 + report.fairValue!.upsidePct! / 100));
    expect(presentation.sensitivity.status).not.toBe("unavailable");
    expect(presentation.sensitivity.conclusion).toMatch(/starting-return × cost-of-equity grid/);
  });
});

describe("C-11: trailing return rows", () => {
  it.each([
    { route: "bank", payloadLabel: "ROTE (trailing four quarters)", rowLabel: "Return on tangible common equity (trailing four quarters)" },
    { route: "insurer", payloadLabel: "common-equity ROE (trailing four quarters)", rowLabel: "Return on common equity (trailing four quarters)" },
  ] as const)("$route: the payload and the data-only returns block carry the trailing return", ({ route, payloadLabel, rowLabel }) => {
    const bundle = buildSyntheticRouteBundle(route);
    const { computed, report, surfaces } = runResearchRoutePanel(bundle);
    const ttm = computed.returns.commonReturnTtm!;
    expect(ttm.returnPct).not.toBeNull();
    const payload = assembleContextPayload(bundle, computed, validateBundle(bundle, { now: new Date(bundle.builtAt) }));
    const returns = payload.computed.find((s) => s.title === "Returns (computed)")!;
    const figure = returns.figures.find((f) => f.label === payloadLabel);
    expect(figure).toMatchObject({ value: ttm.returnPct, unit: "%", asOf: ttm.asOf });
    expect(figure?.source).toBe("computed.returns.commonReturnTtm");
    const row = report.fundamentals.returns.find((r) => r.label === rowLabel);
    expect(row?.values[0]?.value.value).toBeCloseTo(ttm.returnPct!, 4);
    for (const surface of Object.values(surfaces)) expect(surface).toContain(rowLabel);
    // The grid is citeable in the payload, one figure per cell.
    const valuation = payload.computed.find((s) => s.title === "Valuation (computed)")!;
    expect(valuation.figures.filter((f) => f.source.startsWith("computed.valuation.excessReturn.startCoeGrid."))).toHaveLength(9);
    expect(serializePayloadForPrompt(payload)).toMatch(/start .* × cost of equity/);
  });
});

describe("C-10: the Stage B note names the start the model used", () => {
  it("names the trailing window, not a fiscal year, when the model starts from it", () => {
    const computed = runStageB(buildSyntheticRouteBundle("bank"));
    if (computed.valuation.kind !== "excess-return") throw new Error("expected the bank route");
    expect(computed.valuation.excessReturn.roePathPct.basis).toMatch(/TTM/);
    const note = computed.valuation.notes.find((n) => n.startsWith("Common-share valuation uses")) ?? "";
    expect(note).toMatch(/from the trailing four quarters to [0-9]{4}-[0-9]{2}-[0-9]{2}/);
    expect(note).not.toMatch(/Annual return and opening equity share one dated basis/);
  });
});

describe("C-11: base-case language about returns recovering toward the cost of equity", () => {
  const sentence = "Returns recover from the acquisition-affected annual starting point toward the cost of equity along the model's explicit recovery path.";

  it("flags the sentence when the trailing return already exceeds the terminal target", () => {
    const findings = returnPathLanguageFindings({
      texts: [{ path: "valuation.scenarios[1].assumptions[0]", text: sentence }, { path: "verdict.synthesis", text: "Credit costs normalised." }],
      trailing: { returnPct: 16.5, asOf: "2026-06-30", label: "TTM ROTE" },
      terminalTargetPct: 12.8,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ path: "valuation.scenarios[1].assumptions[0]", sentence });
  });

  it("is silent when the trailing return is at or below the terminal target, or unknown", () => {
    const texts = [{ path: "p", text: sentence }];
    expect(returnPathLanguageFindings({ texts, trailing: { returnPct: 9, asOf: "2026-06-30", label: "TTM ROTE" }, terminalTargetPct: 9.6 })).toEqual([]);
    expect(returnPathLanguageFindings({ texts, trailing: null, terminalTargetPct: 9.6 })).toEqual([]);
    expect(returnPathLanguageFindings({ texts, trailing: { returnPct: 16, asOf: null, label: "TTM ROTE" }, terminalTargetPct: null })).toEqual([]);
  });

  it("reads a recovery sentence whose cost of equity carries a decimal", () => {
    const findings = returnPathLanguageFindings({
      texts: [{ path: "p", text: "Returns recover toward the 10.4% cost of equity by year five." }],
      trailing: { returnPct: 16.5, asOf: "2026-06-30", label: "TTM ROTE" },
      terminalTargetPct: 12.8,
    });
    expect(findings).toHaveLength(1);
  });

  it("does not flag a rise to a return above the cost of equity", () => {
    const findings = returnPathLanguageFindings({
      texts: [
        { path: "a", text: "ROTE is expected to rise to about 17%, well above the cost of equity." },
        { path: "b", text: "Returns improve to 18%, exceeding the 10.4% cost of equity." },
      ],
      trailing: { returnPct: 16.5, asOf: "2026-06-30", label: "TTM ROTE" },
      terminalTargetPct: 12.8,
    });
    expect(findings).toEqual([]);
  });

  it("recognizes past-tense recovery verbs", () => {
    const findings = returnPathLanguageFindings({
      texts: [
        { path: "a", text: "Returns improved toward the cost of equity." },
        { path: "b", text: "ROTE rose toward the 10.4% cost of equity." },
        { path: "c", text: "Returns climbed toward the CoE." },
        { path: "d", text: "Returns were rebuilt toward the cost of equity." },
        { path: "e", text: "Returns have risen toward the cost of equity." },
      ],
      trailing: { returnPct: 16.5, asOf: "2026-06-30", label: "TTM ROTE" },
      terminalTargetPct: 12.8,
    });
    expect(findings.map((f) => f.path)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("ignores sentences that do not describe a recovery toward the cost of equity", () => {
    const findings = returnPathLanguageFindings({
      texts: [
        { path: "a", text: "The cost of equity is 9.6% on a beta of 1.1." },
        { path: "b", text: "Returns fade from the trailing 16.5% toward the cost of equity plus the carried excess." },
        // No return subject: an improvement elsewhere in a sentence that names the hurdle (Codex review, PR #49).
        { path: "c", text: "Margins improve to 20%, while the cost of equity stays at 10%." },
        { path: "d", text: "Capital was rebuilt toward the cost of equity." },
        { path: "e", text: "Credit costs improve along the model's recovery path." },
      ],
      trailing: { returnPct: 16.5, asOf: "2026-06-30", label: "TTM ROTE" },
      terminalTargetPct: 12.8,
    });
    expect(findings).toEqual([]);
  });

  it("puts a warning in the assembled report's missing-data manifest", () => {
    const bundle = buildSyntheticRouteBundle("bank");
    const computed = runStageB(bundle);
    if (computed.valuation.kind !== "excess-return") throw new Error("expected the bank route");
    const target = computed.valuation.excessReturn.financialAssumptions!.terminalRoePct;
    // The synthetic bank earns well above its terminal target on the trailing window.
    expect(computed.returns.commonReturnTtm!.returnPct!).toBeGreaterThan(target);
    const judge = loadTask28Fixture() as JudgeOutput;
    const base = judge.valuation.scenarios.find((s) => s.name === "base")!;
    base.assumptions = [sentence];
    const report = assembleReport({ symbol: bundle.symbol, bundle, computed, judgeOutput: judge, model: "synthetic-test", costEntries: [], verify: { verificationRate: null, log: [] } }, bundle.builtAt);
    const entry = report.appendix.missingData.find((gap) => gap.field === "verify.check.returnPath");
    expect(entry?.severity).toBe("warn");
    expect(entry?.reason).toContain(sentence);
    expect(entry?.reason).toMatch(/trailing/i);

    base.assumptions = ["Credit costs normalise."];
    const clean = assembleReport({ symbol: bundle.symbol, bundle, computed, judgeOutput: judge, model: "synthetic-test", costEntries: [], verify: { verificationRate: null, log: [] } }, bundle.builtAt);
    expect(clean.appendix.missingData.some((gap) => gap.field === "verify.check.returnPath")).toBe(false);
  });

  it("reads only the scenario text the report keeps: commentary, else the legacy assumptions", () => {
    const computed = runStageB(buildSyntheticRouteBundle("bank"));
    const judge = loadTask28Fixture() as JudgeOutput;
    const base = judge.valuation.scenarios.find((s) => s.name === "base")!;
    // Presentation keeps the commentary and replaces the assumptions, so a sentence only there is never shown.
    base.qualitativeCommentary = ["Credit costs normalise."];
    base.assumptions = [sentence];
    expect(returnPathLanguageManifestEntries(judge, computed)).toEqual([]);
    // Without commentary the assumptions become the commentary, and are read under that name.
    base.qualitativeCommentary = undefined;
    const entry = returnPathLanguageManifestEntries(judge, computed)[0];
    expect(entry?.reason).toContain(sentence);
    expect(entry?.reason).toMatch(/qualitativeCommentary\[0\]/);
  });

  it("compares the language with the start the model used, not an unused trailing return", () => {
    const computed = runStageB(buildSyntheticRouteBundle("bank"));
    if (computed.valuation.kind !== "excess-return") throw new Error("expected the bank route");
    const er = computed.valuation.excessReturn;
    const target = er.financialAssumptions!.terminalRoePct;
    const judge = loadTask28Fixture() as JudgeOutput;
    const base = judge.valuation.scenarios.find((s) => s.name === "base")!;
    base.qualitativeCommentary = [sentence];
    // The model started from a fiscal year below its target (the trailing window was not newer).
    const fiscalStart = structuredClone(computed);
    if (fiscalStart.valuation.kind !== "excess-return") throw new Error("expected the bank route");
    fiscalStart.valuation.excessReturn.roePathPct.value = er.roePathPct.value.map((_, i, a) => target - 2 + (2 * i) / (a.length - 1));
    fiscalStart.valuation.excessReturn.asOf = "2025-12-31";
    expect(fiscalStart.returns.commonReturnTtm!.returnPct!).toBeGreaterThan(target);
    expect(returnPathLanguageManifestEntries(judge, fiscalStart)).toEqual([]);
    // A fiscal-year start above the target is flagged, and named as the fiscal-year start.
    fiscalStart.valuation.excessReturn.roePathPct.value = er.roePathPct.value.map((_, i, a) => target + 6 - (6 * i) / (a.length - 1));
    const entry = returnPathLanguageManifestEntries(judge, fiscalStart)[0];
    expect(entry?.reason).toMatch(/the model's fiscal-year start/);
    expect(entry?.reason).not.toMatch(/trailing/);
  });
});

describe("C-10: the trailing start uses only a currency-compatible window", () => {
  it("starts from the fiscal year when the four quarters are in another currency than the annual statement", () => {
    const bundle = buildSyntheticRouteBundle("bank");
    for (const result of [bundle.statements.incomeAnnual, bundle.statements.balanceAnnual, bundle.statements.cashflowAnnual]) {
      if (!result.ok) throw new Error("synthetic fixture requires annual statements");
      for (const row of result.value.data.rows) row.reportedCurrency = "USD";
    }
    const income = bundle.statements.incomeQuarterly;
    if (!income.ok) throw new Error("synthetic fixture requires quarterly income");
    for (const row of income.value.data.rows) row.reportedCurrency = "TWD";
    const computed = runStageB(bundle);
    expect(computed.gaps.find((g) => g.field === "compute.ttmIncome.currency")?.reason).toMatch(/TWD/);
    // TWD earnings over USD equity is no return: the window is withheld, not divided.
    expect(computed.returns.commonReturnTtm?.returnPct ?? null).toBeNull();
    if (computed.valuation.kind !== "excess-return") throw new Error("expected the bank route");
    expect(computed.valuation.excessReturn.roePathPct.basis).not.toMatch(/TTM/);
  });
});
