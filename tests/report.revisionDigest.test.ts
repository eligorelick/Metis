import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RevisionDigest } from "@/components/report/RevisionDigest";
import { diffReports, type GradeChange, type ReportDiff } from "@/report/diff";
import { contentChangeCount, gradeEndpointText } from "@/report/diffPresentation";
import { loadTask28Fixture } from "./helpers/task28Report";
import { createDatabase, setDbForTests, type DatabaseHandle } from "@/db";
import { reports } from "@/db/schema";
import DiffPage from "@/app/company/[symbol]/history/diff/page";
import HistoryPage from "@/app/company/[symbol]/history/page";
import { resetConfigCache } from "@/config/env";
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", async importOriginal => ({ ...await importOriginal<typeof import("next/navigation")>(), useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/components/watchlist/Sidebar", () => ({ WatchlistSidebar: () => null }));

function digest(mutate: (report: ReturnType<typeof loadTask28Fixture>) => void = () => {}) {
  const older = loadTask28Fixture(); const newer = structuredClone(older); mutate(newer);
  const before = JSON.stringify([older, newer]);
  const diff = diffReports(older, newer, { fromReportVersion: older.meta.pipelineVersion, toReportVersion: newer.meta.pipelineVersion,
    fromSpecVersion: older.meta.specVersion, toSpecVersion: newer.meta.specVersion });
  const html = renderToStaticMarkup(createElement(RevisionDigest, { diff, compareHref: "/company/DEMO/history/diff?a=1&b=2" }));
  expect(JSON.stringify([older, newer])).toBe(before); return html;
}
let handle: DatabaseHandle;
beforeEach(() => { handle = createDatabase(":memory:"); setDbForTests(handle.db); resetConfigCache(); });
afterEach(() => { setDbForTests(null); handle.sqlite.close(); vi.unstubAllEnvs(); resetConfigCache(); });
function seed(symbol: string, id: number) {
  const report = loadTask28Fixture(); report.meta.symbol = symbol;
  handle.db.insert(reports).values({ id, symbol, createdAt: `2026-10-${id.toString().padStart(2, "0")}T00:00:00.000Z`, model: report.meta.model, status: "done", reportJson: JSON.stringify(report), specVersion: report.meta.specVersion }).run();
}
describe("stored report revision digest", () => {
  it("shows admitted changes and freshness without recalculating results", () => {
    const html = digest(report => { report.verdict.gradeStrip.valuation.grade = "A"; report.verdict.synthesis = "Revised stored thesis"; });
    expect(html).toContain("Revision digest"); expect(html).toContain("Valuation"); expect(html).toContain("C → A");
    expect(html).toContain("Thesis changed"); expect(html).toContain("Source freshness"); expect(html).toContain("Full comparison");
  });
  it("explains withheld comparisons rather than claiming zero changes", () => {
    const html = digest(report => { report.meta.specVersion = "incompatible-version"; report.verdict.gradeStrip.valuation.grade = "A"; });
    expect(html).toContain("Persisted report spec versions differ"); expect(html).toContain("Comparison withheld");
    expect(html).not.toContain("C → A"); expect(html).not.toContain("No changes");
  });
  it("withholds dimension-conflicting targets while retaining other comparable changes", () => {
    const html = digest(report => { report.valuation.scenarios[0]!.priceTarget!.currency = "EUR"; report.valuation.scenarios[0]!.priceTarget!.value = 99; report.verdict.synthesis = "Changed thesis"; });
    expect(html).toContain("Currencies are not comparable"); expect(html).not.toContain("99"); expect(html).toContain("Thesis changed");
  });
  it("distinguishes unchanged compared families from missing prior history", async () => {
    expect(digest()).toContain("No changes in comparable report fields"); seed("DEMO", 1);
    const html = renderToStaticMarkup(await HistoryPage({ params: Promise.resolve({ symbol: "DEMO" }) }));
    expect(html).toContain("No prior readable report"); expect(html).toContain("saved reports");
  });
  it("keeps same-report and wrong-issuer selections out of the digest", async () => {
    seed("DEMO", 1); seed("DBNK", 2);
    const same = renderToStaticMarkup(await DiffPage({ params: Promise.resolve({ symbol: "DEMO" }), searchParams: Promise.resolve({ a: "1", b: "1" }) }));
    expect(same).toContain("same report selected"); expect(same).not.toContain("Revision digest");
    const wrong = renderToStaticMarkup(await DiffPage({ params: Promise.resolve({ symbol: "DEMO" }), searchParams: Promise.resolve({ a: "1", b: "2" }) }));
    expect(wrong).toContain("report unavailable"); expect(wrong).not.toContain("Revision digest");
  });
});

it("DB-006: distinguishes a cost-only revision",()=>{
 const html=digest(r=>{r.meta.costUsd+=1.25;});
 expect(html).toContain("No changes in comparable report fields; only the recorded API charge differs.");
 expect(html).not.toContain("Recorded research changed");
});

describe("DB-002 / DB-006 diff presentation helpers", () => {
  const change = (from: "A" | null, to: "B" | null, transition: GradeChange["transition"]): GradeChange =>
    ({ section: "overall", from, to, transition, comparison: "comparable", reasons: [] }) as unknown as GradeChange;

  it("reads a missing endpoint as absent only on the side a section was added or removed", () => {
    expect(gradeEndpointText(change("A", "B", "changed"), "from")).toBe("A");
    expect(gradeEndpointText(change("A", "B", "changed"), "to")).toBe("B");
    expect(gradeEndpointText(change(null, "B", "added"), "from")).toBe("absent");
    expect(gradeEndpointText(change("A", null, "removed"), "to")).toBe("absent");
    // A withheld grade inside a present section was not assessed, on either side.
    expect(gradeEndpointText(change(null, "B", "became-available"), "from")).toBe("not assessed");
    expect(gradeEndpointText(change("A", null, "became-unavailable"), "to")).toBe("not assessed");
    expect(gradeEndpointText(change(null, null, "added"), "to")).toBe("not assessed");
    expect(gradeEndpointText(change(null, null, "removed"), "from")).toBe("not assessed");
  });

  it("counts every content family and the verdict, never the cost", () => {
    const older = loadTask28Fixture();
    const same = diffReports(older, structuredClone(older), { fromReportVersion: older.meta.pipelineVersion, toReportVersion: older.meta.pipelineVersion,
      fromSpecVersion: older.meta.specVersion, toSpecVersion: older.meta.specVersion });
    expect(contentChangeCount(same)).toBe(0);
    const filled = { ...same, gradeChanges: [{}], scoreChanges: [{}], weightChanges: [{}], driverChanges: [{}], targetChanges: [{}],
      projectionChanges: [{}], catalystChanges: [{}], riskChanges: [{}], verdictChanged: true } as unknown as ReportDiff;
    expect(contentChangeCount(filled)).toBe(9);
  });
});
