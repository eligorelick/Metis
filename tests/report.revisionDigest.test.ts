import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RevisionDigest } from "@/components/report/RevisionDigest";
import { diffReports } from "@/report/diff";
import { loadTask28Fixture } from "./helpers/task28Report";
import { createDatabase, setDbForTests, type DatabaseHandle } from "@/db";
import { reports } from "@/db/schema";
import DiffPage from "@/app/company/[symbol]/history/diff/page";
import HistoryPage from "@/app/company/[symbol]/history/page";
import { resetConfigCache } from "@/config/env";
vi.mock("server-only", () => ({}));
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
beforeEach(() => { handle = createDatabase(":memory:"); setDbForTests(handle.db); vi.stubEnv("METIS_UI_REDESIGN", "1"); resetConfigCache(); });
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
