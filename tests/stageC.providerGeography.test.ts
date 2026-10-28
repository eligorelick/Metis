/** AI-509 (OD-4): a provider's "geographic" rows are company geography only when the issuer's own XBRL does not contradict them. */
import { describe, expect, it } from "vitest";

import { admittedGeography, PROVIDER_GEOGRAPHY_REASONS, providerGeographyContradiction } from "@/edgar/segmentFacts";
import { runStageB } from "@/pipeline/compute";
import { enrichDataOnlyReport } from "@/pipeline/stageC/dataOnlyReport";
import { applySegmentShares } from "@/pipeline/stageC/passes";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import type { ContextPayload } from "@/pipeline/stageC/payload";
import type { ValidationReport } from "@/pipeline/stageA/validate";
import type { DataBundle } from "@/pipeline/types";

import { BUILT_AT, completeCurrencyBundle } from "./helpers/currencyBundle";
import { loadTask28Fixture } from "./helpers/task28Report";

const EMPTY_VALIDATION = { checks: [], flags: [], gaps: [] } as unknown as ValidationReport;
const BUSINESS = "us-gaap:StatementBusinessSegmentsAxis", GEOGRAPHY = "srt:StatementGeographicalAxis";
const axis = (name: string, rows: [label: string, member: string][]) => ({ axis: name, axisLabel: name === GEOGRAPHY ? "Geographic area" : "Reportable segment", currency: "USD",
  quarters: [{ start: "2025-10-01", end: "2025-12-31" }], rows: rows.map(([label, member]) => ({ member, label, values: [1e9], childOf: null })),
  total: [rows.length * 1e9], priorPresentation: [], derivedCells: 0, residualCells: 0 });
function withGeography(data: Record<string, number>, axes: ReturnType<typeof axis>[]): DataBundle {
  const b = completeCurrencyBundle({}) as unknown as Record<string, unknown> & { segmentation: object; edgar: object };
  b.segmentation = { ...b.segmentation, geographic: { ok: true, value: { data: { rows: [{ date: "2025-12-31", reportedCurrency: "USD", data }], raw: [] }, asOf: "2025-12-31", source: "fmp", endpoint: "revenue-geographic-segmentation", fetchedAt: BUILT_AT } } };
  b.edgar = { ...b.edgar, quarterlySegments: { ok: true, value: { data: { quarters: [{ start: "2025-10-01", end: "2025-12-31" }], total: [3e9], currency: "USD", axes, notes: [],
    filings: [{ accession: "0000000000-26-000001", form: "10-K", filingDate: "2026-02-10", concept: null }] }, asOf: "2025-12-31", source: "edgar", endpoint: "fixture", fetchedAt: BUILT_AT } } };
  return b as unknown as DataBundle;
}
const build = (b: DataBundle) => assembleContextPayload(b, runStageB(b), EMPTY_VALIDATION);
const geoLabels = (p: ContextPayload) => p.segments.figures.filter((f) => f.label.startsWith("geographic: ")).map((f) => f.label);

describe("provider geography admission (AI-509)", () => {
  it("withholds provider 'geographic' rows that name the issuer's reportable segments (AI-509, AMZN shape)", () => {
    const bundle = withGeography({ "Cloud Services Segment": 2e9, "North Region Segment": 6e9, "Rest of World Segment": 3e9 },
      [axis(BUSINESS, [["North Region", "x:NorthRegionSegmentMember"], ["Cloud", "x:CloudServicesSegmentMember"], ["Rest of World", "x:RestOfWorldSegmentMember"]])]);
    const payload = build(bundle);
    expect(geoLabels(payload)).toEqual([]);
    expect(payload.segments.notes).toContain(PROVIDER_GEOGRAPHY_REASONS["business-segments"]);
    const business = { whatTheySell: [], concentrationRisks: [], segments: { product: [], geographic: [{ name: "North Region Segment",
      revenue: { value: 6e9, unit: "currency", currency: "USD", source: "payload.segments.geographic-north-region-segment", asOf: "2025-12-31", verified: true }, sharePct: 54.5 }] } };
    expect(applySegmentShares(business as never, bundle).segments.geographic[0]!.sharePct).toBeNull();   // the share basis follows the admission
    expect(payload.segmentRevenue!.figures.map((f) => f.label)).toContain("Reportable segment: Cloud revenue, quarter ended 2025-12-31");   // control: the issuer's table stays
  });

  it("withholds provider geography when the issuer tags its own geographic axis (AI-509, NVDA shape)", () => {
    const bundle = withGeography({ "UNITED STATES": 8e9, "Other Americas": 1e9 }, [axis(GEOGRAPHY, [["United States", "country:US"], ["Other", "x:OtherCountriesMember"]])]);
    const payload = build(bundle);
    expect(payload.segments.figures.some((f) => /Americas/.test(f.label))).toBe(false);
    expect(payload.segments.notes).toContain(PROVIDER_GEOGRAPHY_REASONS["issuer-geography"]);
    expect(payload.segmentRevenue!.figures.map((f) => f.label)).toContain("Geographic area: Other revenue, quarter ended 2025-12-31");   // control: the issuer's own label
    const report = enrichDataOnlyReport(loadTask28Fixture(), { bundle, computed: runStageB(bundle), reason: "Synthetic provider geography test" });
    expect(report.business.segments.geographic).toEqual([]);
  });

  it("keeps uncontradicted provider geography under a caveat, and matches neither residual rows nor nothing (controls; review focus 8)", () => {
    const bundle = withGeography({ Americas: 5e9, Europe: 3e9, Other: 1e9 }, [axis(BUSINESS, [["Hardware", "x:HardwareSegmentMember"], ["Other", "us-gaap:AllOtherSegmentsMember"]])]);
    const payload = build(bundle);
    expect(payload.segments.title).toBe("Revenue segmentation (keys as each source names them — never hard-coded)");
    expect(geoLabels(payload)).toEqual(["geographic: Americas", "geographic: Europe", "geographic: Other"]);
    expect(payload.segments.notes).toContain("Geographic keys are FMP's normalised names, not read from the filing's XBRL; FMP's assignment of revenue to them is not checked against the filing.");
    // Region-named reportable segments are segment information, not entity-wide geography (OD-4, ASC 280-10-55-21).
    expect(providerGeographyContradiction(["Americas", "EMEA"], [{ axis: BUSINESS, rows: [{ label: "Americas" }, { label: "EMEA" }] }])).toBe("business-segments");
    expect(providerGeographyContradiction(["Domestic", "Foreign"], [])).toBeNull();
    expect(providerGeographyContradiction(["United States (FY2026)"], [{ axis: GEOGRAPHY, rows: [] }])).toBeNull();   // an empty axis is no evidence
    // OD-4 point 2: provider names that are all the issuer's own geographic labels contradict nothing (META shape) ...
    expect(providerGeographyContradiction(["US & Canada", "Rest of World"], [{ axis: GEOGRAPHY, rows: [{ label: "US & Canada" }, { label: "Rest Of World" }] }])).toBeNull();
    // ... and one name the issuer does not use withholds the set (NVDA shape; the member's local name is no help).
    expect(providerGeographyContradiction(["UNITED STATES", "Other Americas"], [{ axis: GEOGRAPHY, rows: [{ label: "United States", member: "country:US" }, { label: "Other", member: "x:OtherCountriesMember" }] }])).toBe("issuer-geography");
  });

  // Predicate cases of the round-4 review copy (AI-509 review minors). The keys are the names the stored provider answers held;
  // the axes carry the issuer's labels and members.
  it("matches stored provider names against the issuer's axes (AMZN, META and NVDA shapes)", () => {
    const nvdaGeography = { axis: GEOGRAPHY, rows: [{ label: "United States" }, { label: "Taiwan" }, { label: "China (including Hong Kong)" }, { label: "Other" }] };
    // amzn43: the member's local name matches where the label ("AWS") does not; "International Segment" matches the label.
    expect(providerGeographyContradiction(["Amazon Web Services Segment", "International Segment", "North America Segment"],
      [{ axis: BUSINESS, rows: [{ label: "North America" }, { label: "AWS", member: "amzn:AmazonWebServicesSegmentMember" }, { label: "International" }] }])).toBe("business-segments");
    expect(providerGeographyContradiction(["Amazon Web Services Segment"], [{ axis: BUSINESS, rows: [{ label: "AWS" }] }])).toBeNull();   // control: the label alone does not match
    expect(providerGeographyContradiction(["International Segment"], [{ axis: BUSINESS, rows: [{ label: "International" }] }])).toBe("business-segments");
    // meta44: four keys, a business axis and a geography axis side by side; every key is an issuer geographic label.
    expect(providerGeographyContradiction(["US & Canada", "Asia Pacific", "Europe", "Rest Of World"],
      [{ axis: BUSINESS, rows: [{ label: "Family of Apps" }, { label: "Reality Labs" }] },
        { axis: GEOGRAPHY, rows: [{ label: "US & Canada" }, { label: "Asia Pacific" }, { label: "Europe" }, { label: "Rest Of World" }] }])).toBeNull();
    // nvda47: "TAIWAN, PROVINCE OF CHINA" is not the issuer's "Taiwan" (no gazetteer), and "Other Americas" is not its "Other".
    expect(providerGeographyContradiction(["UNITED STATES", "TAIWAN, PROVINCE OF CHINA", "CHINA", "Other Americas"],
      [{ axis: BUSINESS, rows: [{ label: "Compute & Networking" }, { label: "Graphics" }] }, nvdaGeography])).toBe("issuer-geography");
    expect(providerGeographyContradiction(["UNITED STATES", "CHINA"], [nvdaGeography])).toBeNull();   // control: "China (including Hong Kong)" loses its trailing parenthetical
    // nvda48: the "(FY2026)" trailing parenthetical is stripped, so only "Other Americas" contradicts.
    expect(providerGeographyContradiction(["United States (FY2026)", "Taiwan (FY2026)", "China (FY2026)"], [nvdaGeography])).toBeNull();
    expect(providerGeographyContradiction(["United States (FY2026)", "Taiwan (FY2026)", "China (FY2026)", "Other Americas (FY2026)"], [nvdaGeography])).toBe("issuer-geography");
    // nvda49: a single "United States" key is the issuer's own label.
    expect(providerGeographyContradiction(["United States"], [nvdaGeography])).toBeNull();
  });

  it("returns SEC-parsed rows unchanged even where an axis contradicts them (D-80; AI-509 point 4)", () => {
    const bundle = withGeography({ "Other Americas": 1e9 }, [axis(GEOGRAPHY, [["United States", "country:US"]])]);
    const parsed = { ok: true as const, value: { ...(bundle.segmentation.geographic as { ok: true; value: object }).value, source: "edgar" as const } };
    expect(providerGeographyContradiction(["Other Americas"], [{ axis: GEOGRAPHY, rows: [{ label: "United States" }] }])).toBe("issuer-geography");   // the same keys are withheld as FMP's
    expect(admittedGeography(parsed as never, bundle.edgar!.quarterlySegments)).toBe(parsed);
    // The direct contrast: the same rows sourced to FMP are a gap.
    const fmp = { ok: true as const, value: { ...(bundle.segmentation.geographic as { ok: true; value: object }).value, source: "fmp" as const } };
    expect(admittedGeography(fmp as never, bundle.edgar!.quarterlySegments)).toMatchObject({ ok: false });
  });

  it("keeps provider geography that repeats the issuer's own geographic labels, under the caveat (OD-4 point 2; control)", () => {
    const bundle = withGeography({ "US & Canada": 5e9, Europe: 3e9 }, [axis(GEOGRAPHY, [["US & Canada", "x:UsAndCanadaMember"], ["Europe", "x:EuropeMember"]])]);
    const payload = build(bundle);
    expect(geoLabels(payload)).toEqual(["geographic: Europe", "geographic: US & Canada"]);
    expect(payload.segments.notes.some((n) => n.startsWith("Provider (FMP) geographic rows withheld"))).toBe(false);
    expect(payload.segmentRevenue!.figures.map((f) => f.label)).toContain("Geographic area: US & Canada revenue, quarter ended 2025-12-31");
  });
});
