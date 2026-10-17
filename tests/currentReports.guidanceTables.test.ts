import { describe, expect, it } from "vitest";
import { parseGuidance } from "@/edgar/currentReports";
import { buildEarningsReleaseRecord, CURRENT_REPORTS_VERSION } from "@/providers/currentReports";
import { buildFilingDisclosures, nextPeriodRevenueGuidance } from "@/pipeline/filingDisclosures";
import { FilingDisclosuresSchema } from "@/report/schema";
import { filingDisclosureTables } from "@/report/filingDisclosurePresentation";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { runStageB } from "@/pipeline/compute";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

const table = "Business Outlook Metric Q3 2026 Gross Bookings $30 - $31B +5 - 7% Revenue $4.2 - $4.4B +5 - 8% Adjusted EBITDA** $1.1 - $1.2B Metric Full Year 2026 Previous Guidance Current Guidance Gross Bookings $120 - $122B +6 - 8% $123 - $125B +8 - 9% Revenue $15.1 - $15.3B +6 - 9% $15.5 - $15.7B +9 - 10% Adjusted EBITDA margin expansion** +1 - 1.25pts +1.5 - 1.75pts ** A reconciliation for the Adjusted EBITDA and Adjusted EBITDA margin expansion forecast is not provided because we cannot, without unreasonable effort, predict certain items, including foreign exchange gains or losses and minority investment gains or losses. Quarterly Dividend The board declared a dividend.";
const release = `Example Reports Financial Results for Second Quarter 2026. Quarter ended June 30, 2026. ${table}`;
function withRelease(text = release) {
  const bundle = completeCurrencyBundle({ annualCurrency: "USD" });
  if (bundle.statements.incomeQuarterly.ok) bundle.statements.incomeQuarterly.value.data.rows.unshift({ date: "2026-06-30", reportedCurrency: "USD", revenue: 4e9 });
  const record = buildEarningsReleaseRecord({ filing: { accessionNumber: "guidance-source", filingDate: "2026-08-05" }, releaseUrl: "https://www.sec.gov/release.htm", commentaryUrl: null, releaseText: text, commentaryText: null, includeNarrative: true });
  bundle.edgar.currentReports = { ok: true, value: { data: { version: CURRENT_REPORTS_VERSION, releases: [record], events: [], notes: [] }, source: "edgar", asOf: "2026-08-05", endpoint: "https://www.sec.gov/release.htm", fetchedAt: "2026-10-13T00:00:00Z" } };
  return bundle;
}
describe("explicit previous/current guidance tables", () => {
  it("reads current quarter and annual money ranges while retaining previous guidance and growth separately", () => {
    const guidance = parseGuidance(table);
    expect(guidance?.items).toMatchObject([
      { metric: "revenue", period: { label: "Q3 FY2026" }, low: 4.2e9, high: 4.4e9, growth: { low: 5, high: 8 } },
      { metric: "adjusted-ebitda", basis: "non-gaap", low: 1.1e9, high: 1.2e9 },
      { metric: "revenue", period: { label: "FY2026" }, low: 15.5e9, high: 15.7e9, previous: { low: 15.1e9, high: 15.3e9 }, growth: { low: 9, high: 10 }, previousGrowth: { low: 6, high: 9 } },
      { metric: "adjusted-ebitda-margin-expansion", basis: "non-gaap", unit: "percentage-points", low: 1.5, high: 1.75, previous: { low: 1, high: 1.25 } },
    ]);
    expect(guidance?.qualifiers.join(" ")).toMatch(/reconciliation.*not provided.*unreasonable effort/i);
    for (const item of guidance?.items ?? []) {
      expect(item.span).toBeDefined();
      expect(table.slice(item.span!.start, item.span!.end)).toBe(item.span!.text);
      expect(item.headerSpan).toBeDefined();
      expect(item.headerSpan!.text).toMatch(/^Metric (?:Q3|Full Year) 2026/);
      expect(table.slice(item.headerSpan!.start, item.headerSpan!.end)).toBe(item.headerSpan!.text);
    }
  });
  it("carries table basis into deterministic presentation and never treats margin expansion as an operating margin", () => {
    const bundle = withRelease();
    const disclosures = buildFilingDisclosures(bundle);
    expect(FilingDisclosuresSchema.safeParse(disclosures).success).toBe(true);
    const expansion = disclosures?.guidance?.rows.find((r) => r.metric === "adjusted-ebitda-margin-expansion");
    expect(expansion).toMatchObject({ unit: "percentage-points", low: 1.5, previous: { low: 1 } });
    expect(filingDisclosureTables(disclosures, "outlook")[0]?.rows.find((r) => /margin expansion/.test(r[1]!))?.join(" ")).toMatch(/1\.5.*pp/);
    expect(nextPeriodRevenueGuidance(bundle)).toMatchObject({ low: 4.2e9, high: 4.4e9, impliedOperatingMarginPct: null });
    const payload = assembleContextPayload(bundle, runStageB(bundle), { checks: [], flags: [], gaps: [] });
    expect(payload.issuerFilings?.figures.filter((f) => /margin expansion/.test(f.label)).every((f) => f.unit === "pp" && f.currency === null)).toBe(true);
  });
  it("scales decimal billion guidance to exact monetary base units", () => {
    const guidance = parseGuidance(table.replace("$15.5 - $15.7B", "$16.05 - $16.22B"));
    expect(guidance?.items.find((r) => r.metric === "revenue" && r.period.fiscalQuarter === null)?.high).toBe(16_220_000_000);
  });
  it.each([
    table.replace("Previous Guidance Current Guidance", "Current Guidance Previous Guidance"),
    table.replace("$15.5 - $15.7B", "$15.7 - $15.5B"),
    table.replace("$15.5 - $15.7B", "€15.5 - €15.7B"),
  ])("does not invent an annual current money range from unsupported or inconsistent columns", (text) => {
    expect(parseGuidance(text)?.items.some((i) => i.metric === "revenue" && i.period.fiscalQuarter === null) ?? false).toBe(false);
  });
});
