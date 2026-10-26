import { readFileSync } from "node:fs";
import { reportToAuditMarkdown } from "@/report/export/auditMarkdown";
import path from "node:path";
import {
  isValidElement,
  type FunctionComponent,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import type { Report } from "@/report/schema";

const harness = vi.hoisted(() => ({
  buildDataBundle: vi.fn(),
  getLatestDoneReport: vi.fn(),
  getReportByIdForSymbol: vi.fn(),
  runStageB: vi.fn(),
  activeJob: vi.fn(),
  instrumentSupport: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/pipeline/jobRunner", () => ({ getReusableActiveJobForSymbol: harness.activeJob }));
vi.mock("@/pipeline/dataBundle", () => ({
  buildDataBundle: harness.buildDataBundle,
}));
vi.mock("@/pipeline/stageA/validate", () => ({
  validateBundle: vi.fn(() => ({ checks: [], flags: [], gaps: [] })),
}));
vi.mock("@/pipeline/compute", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/pipeline/compute")>();
  return { ...actual, runStageB: harness.runStageB };
});
vi.mock("@/pipeline/stageB/instrumentSupport", () => ({
  classifyInstrumentSupport: harness.instrumentSupport,
}));
vi.mock("@/components/charts/map", () => ({
  fundamentalsChartDataFromBundle: vi.fn(() => ({ series: [] })),
  priceChartPropsFromBundle: vi.fn(() => ({ rows: [{ time: "2026-08-07" }], crosses: [] })),
  relativeStrengthSeriesFromBundle: vi.fn(() => []),
}));
vi.mock("@/report/query", () => ({
  getLatestDoneReport: harness.getLatestDoneReport,
}));
vi.mock("@/report/history", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/report/history")>();
  return { ...actual, getReportByIdForSymbol: harness.getReportByIdForSymbol };
});
vi.mock("@/app/company/[symbol]/GenerateReport", () => ({
  GenerateReport: () => null,
}));
vi.mock("@/components/watchlist/Sidebar", () => ({
  WatchlistSidebar: () => null,
}));

import CompanyPage, { CompanyBody } from "@/app/company/[symbol]/page";
import { ReportTabs } from "@/app/company/[symbol]/ReportTabs";
import { ReportNotes } from "@/components/report/ReportNotes";
import { GenerateReport } from "@/app/company/[symbol]/GenerateReport";
import { resetConfigCache } from "@/config/env";
import SavedReportPage from "@/app/company/[symbol]/report/[reportId]/page";
import PrintReportPage from "@/app/company/[symbol]/report/[reportId]/print/page";
import { FundamentalsChartGrid, TechnicalsChartPanel } from "@/components/charts/lazy";
import { ReportView } from "@/components/report/ReportView";
import { ReportSchema } from "@/report/schema";
import {
  computeDupont,
  computeRoic,
  computeRoicVsWaccSpread,
  computeWacc,
} from "@/pipeline/stageB/returns";
import { task28SentinelReport } from "./helpers/task28Report";

type Props = Record<string, unknown> & { children?: ReactNode };
type PersistedReportViewExport =
  typeof import("@/components/report/PersistedReportView")["PersistedReportView"];

function elementsWithin(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(elementsWithin);
  if (!isValidElement(node)) return [];
  const element = node as ReactElement<Props>;
  return [element, ...[element.props.children, element.props.actions, element.props.navigation, element.props.controls].flatMap(value => elementsWithin(value as ReactNode))];
}

function structuralText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(structuralText).join("");
  if (!isValidElement(node)) return "";
  return structuralText((node as ReactElement<Props>).props.children);
}

function invoke(element: ReactElement<Props>): ReactElement<Props> {
  expect(typeof element.type).toBe("function");
  return (element.type as FunctionComponent<Props>)(element.props) as ReactElement<Props>;
}

async function renderLiveReturnsPanel(
  metrics: unknown,
  symbol: string,
): Promise<string> {
  harness.runStageB.mockReturnValue(metrics);
  harness.getLatestDoneReport.mockReturnValue(null);

  const companyTree = await CompanyBody({ symbol });
  const tabs = elementsWithin(companyTree).find((element) => element.type === ReportTabs);
  const liveAnalysis =
    (tabs?.props.analysis as ReactNode | undefined) ?? companyTree;
  const returnsPanel = elementsWithin(liveAnalysis).find(
    (element) =>
      typeof element.type === "function" &&
      element.type.name === "ReturnsPanel",
  );
  expect(returnsPanel).toBeDefined();
  return renderToStaticMarkup(invoke(returnsPanel!));
}

const report = ReportSchema.parse(
  JSON.parse(
    readFileSync(path.join(process.cwd(), "fixtures", "report", "DEMO-sample.json"), "utf8"),
  ),
);

const bundle = {
  symbol: "DEMO",
  builtAt: "2026-08-07T00:00:00.000Z",
  quote: {
    ok: true,
    value: {
      data: {
        rows: [{
          symbol: "DEMO",
          name: "Demo Systems",
          price: 100,
          changePercentage: 1.25,
          marketCap: 1_000_000,
          exchange: "TEST",
        }],
        raw: {},
      },
      asOf: "2026-08-07",
      source: "fmp",
      endpoint: "quote",
      fetchedAt: "2026-08-07T00:00:00.000Z",
      stale: false,
    },
  },
  profile: {
    ok: true,
    value: {
      data: { rows: [{ symbol: "DEMO", companyName: "Demo Systems" }], raw: {} },
      asOf: "2026-08-07",
      source: "fmp",
      endpoint: "profile",
      fetchedAt: "2026-08-07T00:00:00.000Z",
      stale: false,
    },
  },
  statements: {
    incomeAnnual: {
      ok: true,
      value: {
        data: { rows: [], raw: {} },
        asOf: "2025-12-31",
        source: "fmp",
        endpoint: "income-statement",
        fetchedAt: "2026-08-07T00:00:00.000Z",
        stale: false,
      },
    },
  },
};

const computed = {
  route: { base: "standard", overlays: [] },
  gaps: [],
  growth: {
    revenueCagrs: [],
    epsDilutedCagrs: [],
    fcfCagrs: [],
    margins: {
      gross: { series: [], slopePctPtsPerYear: null },
      operating: { series: [], slopePctPtsPerYear: null },
      net: { series: [], slopePctPtsPerYear: null },
    },
    revenueAcceleration: {
      latestYoyPct: null,
      threeYearCagrPct: null,
      accelerating: null,
    },
    notes: [],
  },
  technicals: {
    asOf: "2026-08-06",
    lastClose: 100,
    smaCross: { sma50: 99, sma200: 95, state: "golden" },
    rsi14: 55,
    macd: { histogram: 1, state: "bullish" },
    range52w: { low52w: 70, high52w: 110, positionPct: 75 },
    atr14: { atrPctOfClose: 2 },
    read: {
      trend: "uptrend",
      momentum: "bullish",
      relativeStrength: "outperforming",
      flags: [],
    },
  },
};

describe("persisted report presentation", () => {
  beforeEach(() => {
    harness.buildDataBundle.mockReset();
    harness.buildDataBundle.mockResolvedValue(bundle);
    harness.runStageB.mockReset();
    harness.runStageB.mockReturnValue(computed);
    harness.instrumentSupport.mockReset().mockReturnValue({ supported: true, kind: "company" });
    harness.activeJob.mockReset().mockReturnValue(null);
    harness.getLatestDoneReport.mockReset();
    harness.getLatestDoneReport.mockReturnValue({
      reportId: 42,
      createdAt: "2026-07-01T12:00:00.000Z",
      report,
    });
    harness.getReportByIdForSymbol.mockReset();
    harness.getReportByIdForSymbol.mockReturnValue({
      row: {
        id: 42,
        createdAt: "2026-07-01T12:00:00.000Z",
        model: "claude-opus-4-8",
        status: "done",
        verificationRate: 1,
        costUsd: 1,
      },
      report,
    });
  });

  it("opens an existing ticker report without starting live data or calculations", async () => {
    const before = JSON.stringify(report);
    const tree = await CompanyPage({ params: Promise.resolve({ symbol: "DEMO" }) });
    const persisted = elementsWithin(tree).find((element) => element.props.report === report);
    expect(persisted).toBeDefined();
    expect(elementsWithin(tree).some((element) => element.type === CompanyBody)).toBe(false);
    expect(harness.buildDataBundle).not.toHaveBeenCalled();
    expect(harness.runStageB).not.toHaveBeenCalled();
    const liveLink = elementsWithin(tree).find((element) => element.props.href === "/company/DEMO?view=live");
    expect(liveLink).toBeDefined();
    expect(liveLink!.props.prefetch).toBe(false);
    expect(JSON.stringify(report)).toBe(before);
  });

  it("attaches the dossier saved page to its server-owned active run without invoking research", async () => {
    vi.stubEnv("METIS_UI_REDESIGN", "1"); resetConfigCache();
    harness.activeJob.mockReturnValue({ jobId: "existing-job", status: "queued", updatedAt: "2026-10-24T00:00:00.000Z" });
    try {
      const tree = await CompanyPage({ params: Promise.resolve({ symbol: "DEMO" }) });
      const run = elementsWithin(tree).find(element => element.type === GenerateReport);
      expect(run?.props).toEqual({ symbol: "DEMO", initialJobId: "existing-job" });
      expect(harness.activeJob).toHaveBeenCalledWith("DEMO");
      expect(elementsWithin(tree).some(element => element.props.report === report)).toBe(true);
      expect(harness.buildDataBundle).not.toHaveBeenCalled(); expect(harness.runStageB).not.toHaveBeenCalled();
    } finally { vi.unstubAllEnvs(); resetConfigCache(); }
  });

  it("binds local notes to the actual saved row across latest, historic and live report views", async () => {
    vi.stubEnv("METIS_UI_REDESIGN", "1"); resetConfigCache(); harness.activeJob.mockReturnValue(null);
    try {
      const latest = await CompanyPage({ params: Promise.resolve({ symbol: "DEMO" }) });
      const historic = await SavedReportPage({ params: Promise.resolve({ symbol: "DEMO", reportId: "42" }) });
      for (const tree of [latest,historic]) {
        const note = elementsWithin(tree).find(element => element.type === ReportNotes);
        expect(note?.props).toEqual({ symbol: "DEMO", reportId: 42 });
      }
      const live = await CompanyBody({ symbol: "DEMO", liveRequested: true });
      const tabs = elementsWithin(live).find(element => element.type === ReportTabs)!;
      expect((tabs.props.reportNotes as ReactElement<Props>).type).toBe(ReportNotes);
      expect((tabs.props.reportNotes as ReactElement<Props>).props).toEqual({ symbol: "DEMO", reportId: 42 });
      expect((tabs.props.report as ReactElement<Props>).props).toEqual({ report, selectedReportId:42 });
    } finally { vi.unstubAllEnvs(); resetConfigCache(); }
  });

  it("loads live analysis only when explicitly requested", async () => {
    const tree = await CompanyPage({ params: Promise.resolve({ symbol: "DEMO" }), searchParams: Promise.resolve({ view: "live" }) });
    const live = elementsWithin(tree).find((element) => element.type === CompanyBody);
    expect(live).toBeDefined();
    expect(live!.props.liveRequested).toBe(true);
    expect(harness.buildDataBundle).not.toHaveBeenCalled();
    const body = await CompanyBody(live!.props as { symbol: string; liveRequested: boolean });
    expect(harness.buildDataBundle).toHaveBeenCalledOnce();
    const tabs = elementsWithin(body).find((element) => element.type === ReportTabs);
    expect(tabs!.props.initialTab).toBe("analysis");
  });

  it.each([
    ["LIVEERROR", "exception"],
    ["LIVEMISSING", "confirmed-missing"],
    ["LIVEPROFILE", "unresolved-profile"],
    ["LIVEETF", "unsupported"],
  ] as const)("keeps direct saved research and revisions recovery after %s Live failure", async (symbol, failure) => {
    vi.stubEnv("METIS_UI_REDESIGN", "1"); resetConfigCache();
    const saved = { ...report, meta: { ...report.meta, symbol, companyName: "Saved research issuer" } };
    const before = JSON.stringify(saved);
    harness.getLatestDoneReport.mockReturnValue({ reportId: 42, createdAt: "2026-07-01T12:00:00.000Z", report: saved });
    const rows = failure === "confirmed-missing" ? [] : failure === "unresolved-profile" ? [{}] : [{ symbol, companyName: "Current issuer" }];
    harness.buildDataBundle.mockResolvedValue({ ...bundle, symbol, profile: { ...bundle.profile, value: { ...bundle.profile.value, data: { rows, raw: {} } } } });
    if (failure === "exception") harness.buildDataBundle.mockRejectedValue(new Error("Provider unavailable"));
    if (failure === "unsupported") harness.instrumentSupport.mockReturnValue({ supported: false, kind: "etf", reason: "ETF analysis is not supported." });
    try {
      const html = renderToStaticMarkup(await CompanyBody({ symbol, liveRequested: true }));
      expect(html).toContain('aria-label="Company research views"');
      expect(html).toContain(`href="/company/${symbol}/report/42"`);
      expect(html).toContain(`href="/company/${symbol}/history"`);
      expect(html).toContain("Saved report #42"); expect(html).toContain("2026-07-01");
      expect(harness.buildDataBundle).toHaveBeenCalledTimes(1);
      expect(harness.getLatestDoneReport).toHaveBeenCalledWith(symbol);
      expect(harness.activeJob).not.toHaveBeenCalled();
      expect(JSON.stringify(saved)).toBe(before);
    } finally { vi.unstubAllEnvs(); resetConfigCache(); }
  });

  it.each([{ view: undefined }, { view: ["live", "report"] }, { view: "other" }])("keeps ambiguous or absent view $view on saved research", async ({ view }) => {
    const tree = await CompanyPage({ params: Promise.resolve({ symbol: "DEMO" }), searchParams: Promise.resolve({ view }) });
    expect(elementsWithin(tree).some((element) => element.props.report === report)).toBe(true);
    expect(elementsWithin(tree).some((element) => element.type === CompanyBody)).toBe(false);
    expect(harness.buildDataBundle).not.toHaveBeenCalled();
  });

  it.each([null, { reportId: 42, report: null }])("retains the existing live flow when no usable saved report exists", async (latest) => {
    harness.getLatestDoneReport.mockReturnValue(latest);
    const tree = await CompanyPage({ params: Promise.resolve({ symbol: "DEMO" }) });
    expect(elementsWithin(tree).some((element) => element.type === CompanyBody)).toBe(true);
  });

  it("delegates both persisted routes to one exact report-only boundary", async () => {
    expectTypeOf<PersistedReportViewExport>()
      .parameter(0)
      .toEqualTypeOf<{ report: Report; selectedReportId?: number }>();

    const companyTree = await CompanyBody({ symbol: "DEMO" });
    const tabs = elementsWithin(companyTree).find((element) => element.type === ReportTabs);
    expect(tabs).toBeDefined();
    const companyPersisted = tabs!.props.report as ReactElement<Props>;
    expect(harness.buildDataBundle).toHaveBeenCalledTimes(1);
    expect(harness.runStageB).toHaveBeenCalledTimes(1);

    const savedTree = await SavedReportPage({
      params: Promise.resolve({ symbol: "DEMO", reportId: "42" }),
    });
    const savedPersisted = elementsWithin(savedTree).find(
      (element) => element.props.report === report,
    );
    expect(savedPersisted).toBeDefined();
    expect(harness.buildDataBundle).toHaveBeenCalledTimes(1);
    expect(harness.runStageB).toHaveBeenCalledTimes(1);

    expect(companyPersisted.props).toEqual({report,selectedReportId:42});
    expect(savedPersisted!.props).toEqual({report,selectedReportId:42});
    expect(companyPersisted.type).toBe(savedPersisted!.type);
    // Identical report bytes in different saved rows must not retain a previous
    // row's interactive selection. React's key is outside the report-only props.
    expect(companyPersisted.key).toBe("42");
    expect(savedPersisted!.key).toBe("42");
    const { PersistedReportView } = await import(
      "@/components/report/PersistedReportView"
    );
    expect(companyPersisted.type).toBe(PersistedReportView);

    const reportNode = invoke(companyPersisted);
    expect(reportNode.type).toBe(ReportView);
    expect(reportNode.props).toEqual({report,selectedReportId:42});
    expect(elementsWithin(reportNode).some((element) => element.type === TechnicalsChartPanel)).toBe(false);
    expect(elementsWithin(reportNode).some((element) => element.type === FundamentalsChartGrid)).toBe(false);
  });

  it("keeps the saved-run live link explicit and disables provider-triggering prefetch", async () => {
    const tree = await SavedReportPage({ params: Promise.resolve({ symbol: "DEMO", reportId: "42" }) });
    const live = elementsWithin(tree).find((element) => element.props.href === "/company/DEMO?view=live");
    expect(live).toBeDefined();
    expect(live!.props.href).toBe("/company/DEMO?view=live");
    expect(live!.props.prefetch).toBe(false);
  });

  it("owns the current bundle timestamp only inside live analysis", async () => {
    const companyTree = await CompanyBody({ symbol: "DEMO" });
    const tabs = elementsWithin(companyTree).find((element) => element.type === ReportTabs)!;
    const currentBundleLabel = "built 2026-08-07 00:00:00Z";

    expect(structuralText(tabs.props.analysis as ReactNode)).toContain(currentBundleLabel);
    expect(structuralText(companyTree)).not.toContain(currentBundleLabel);
    expect(structuralText(tabs.props.report as ReactNode)).not.toContain(currentBundleLabel);
  });

  it("keeps both current charts and their explicit as-of labels in live analysis", async () => {
    const companyTree = await CompanyBody({ symbol: "DEMO" });
    const tabs = elementsWithin(companyTree).find((element) => element.type === ReportTabs)!;
    const analysis = tabs.props.analysis as ReactNode;
    const panelElements = elementsWithin(analysis);
    const fundamentals = panelElements.find((element) => "chartData" in element.props)!;
    const technicals = panelElements.find((element) => "priceProps" in element.props)!;

    const fundamentalsRoot = invoke(fundamentals);
    const technicalsRoot = invoke(technicals);

    expect(elementsWithin(fundamentalsRoot).some((element) => element.type === FundamentalsChartGrid)).toBe(true);
    expect(elementsWithin(technicalsRoot).some((element) => element.type === TechnicalsChartPanel)).toBe(true);
    expect(renderToStaticMarkup(fundamentalsRoot.props.right as ReactElement)).toMatch(/as of.*2025-12-31/i);
    expect(renderToStaticMarkup(technicalsRoot.props.right as ReactElement)).toMatch(/as of.*2026-08-06/i);
  });

  it("audit A3 preserves null WACC weights through computeWacc and renders n/a at the live company-page callsite", async () => {
    const wacc = computeWacc({
      beta: 1,
      riskFreePct: 4,
      erpPct: 5,
      interestExpenseTtm: 10,
      totalDebtAvg: null,
      marketCap: 1_000,
      effectiveTaxRate: 0.2,
      ebitTtm: 100,
      analysisDate: "2026-08-07",
    });
    const roic = computeRoic([], []);
    const dupont = computeDupont([], []);
    const roicVsWacc = computeRoicVsWaccSpread(
      roic.latestRoicPct,
      wacc.waccPct,
    );

    expect(wacc.weightEquity).toBeNull();
    expect(wacc.weightDebt).toBeNull();

    const html = await renderLiveReturnsPanel(
      {
        ...computed,
        returns: {
          wacc,
          roic,
          dupont,
          roicVsWacc,
          notes: [...wacc.notes, ...roic.notes, ...dupont.notes],
          gaps: [...wacc.gaps, ...roic.gaps, ...dupont.gaps],
        },
      },
      "A3NULL",
    );

    expect(html).toMatch(
      /<dt[^>]*>weight E \/ D<\/dt><dd[^>]*>n\/a \/ n\/a<\/dd>/,
    );
    expect(html).not.toMatch(/weight E \/ D<\/dt><dd[^>]*>0\.0% \/ 0\.0%<\/dd>/);
  });

  it("audit A4 preserves a null DuPont margin through computeDupont and renders n/a at the live company-page callsite", async () => {
    const wacc = computeWacc({
      beta: 1,
      riskFreePct: 4,
      erpPct: 5,
      interestExpenseTtm: 10,
      totalDebtAvg: 200,
      marketCap: 800,
      effectiveTaxRate: 0.2,
      ebitTtm: 100,
      analysisDate: "2026-08-07",
    });
    const roic = computeRoic([], []);
    const dupont = computeDupont(
      [{ date: "2025-12-31", revenue: 1_000, netIncome: null }],
      [{
        date: "2025-12-31",
        totalAssets: 2_000,
        totalStockholdersEquity: 800,
      }],
    );
    const roicVsWacc = computeRoicVsWaccSpread(
      roic.latestRoicPct,
      wacc.waccPct,
    );

    expect(dupont.latest).toEqual(expect.objectContaining({
      netMargin: null,
      assetTurnover: 0.5,
      leverage: 2.5,
      roePct: null,
    }));

    const html = await renderLiveReturnsPanel(
      {
        ...computed,
        returns: {
          wacc,
          roic,
          dupont,
          roicVsWacc,
          notes: [...wacc.notes, ...roic.notes, ...dupont.notes],
          gaps: [...wacc.gaps, ...roic.gaps, ...dupont.gaps],
        },
      },
      "A4NULL",
    );

    expect(html).toMatch(
      /<dt[^>]*>net margin<\/dt><dd[^>]*>n\/a<\/dd>/,
    );
    expect(html).not.toMatch(/net margin<\/dt><dd[^>]*>0\.0%<\/dd>/);
  });

  it("renders every Task 28 audit family through latest, saved, and print pages without mutation", async () => {
    const rich = task28SentinelReport();
    const unsafe = '<script data-task28-route="persisted">alert(28)</script>';
    rich.scores!.aspects.valuation.drivers[0]!.verificationNote = unsafe;
    // D-62: driver notes are audit-export leaves; a body leaf carries the payload too.
    rich.verdict.synthesis = `${rich.verdict.synthesis} ${unsafe}`;
    const before = JSON.stringify(rich);
    harness.getLatestDoneReport.mockReturnValue({
      reportId: 42,
      createdAt: "2026-07-01T12:00:00.000Z",
      report: rich,
    });
    harness.getReportByIdForSymbol.mockReturnValue({
      row: {
        id: 42,
        createdAt: "2026-07-01T12:00:00.000Z",
        model: "claude-opus-4-8",
        status: "done",
        verificationRate: 1,
        costUsd: 1,
      },
      report: rich,
    });

    const latestHtml = renderToStaticMarkup(await CompanyBody({ symbol: "DEMO" }));
    const savedHtml = renderToStaticMarkup(await SavedReportPage({
      params: Promise.resolve({ symbol: "DEMO", reportId: "42" }),
    }));
    const printHtml = renderToStaticMarkup(await PrintReportPage({
      params: Promise.resolve({ symbol: "DEMO", reportId: "42" }),
      searchParams: Promise.resolve({}),
    }));
    for (const html of [latestHtml, savedHtml, printHtml]) {
      for (const sentinel of [
        "TASK28:composite:methodology",
        "TASK28:evidence:guidanceVsActuals:source-id",
        "TASK28-provider-stale",
        "2026-07-02T03:04:05.678Z",
      ]) expect(html).toContain(sentinel);
      expect(html).toContain("&lt;script data-task28-route=&quot;persisted&quot;&gt;alert(28)&lt;/script&gt;");
      expect(html).not.toContain(unsafe);
    }
    // The raw registry leaves the pages no longer print are in the audit export.
    const audit = reportToAuditMarkdown(rich);
    for (const sentinel of [
      "TASK28:fundamentals:driver:duplicate-identity-note",
      "TASK28:revenue:historical:0:citation-note",
      "TASK28:epsDiluted:weighted:1:source-id",
      "TASK28:PROJECTION-WEIGHTS:VERSION",
      "TASK28.verification.computed.path",
      "TASK28.asOfMap.beta",
    ]) expect(audit).toContain(sentinel);
    expect(JSON.stringify(rich)).toBe(before);
  });
});
