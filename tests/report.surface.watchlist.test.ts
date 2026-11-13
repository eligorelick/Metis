import { PassThrough } from "node:stream";
import { createElement } from "react";
import { renderToPipeableStream, renderToStaticMarkup } from "react-dom/server";

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WatchlistRowView } from "@/watchlist/watchlist";

vi.mock("server-only", () => ({}));
vi.mock("@/config/env", () => ({
  getConfig: () => ({
    fixtureMode: true,
    hasFmpKey: false,
    hasFinnhubKey: false,
    hasFredKey: false,
    hasAnthropicKey: false,
  }),
}));
vi.mock("@/ai/connections", () => ({ describeAnalysisRoute: () => ({ provider: "none", model: null, effort: null, ready: false, label: "AI off (data-only reports)" }) }));
vi.mock("@/components/watchlist/AddTicker", () => ({ AddTicker: () => null }));
vi.mock("@/components/watchlist/RemoveButton", () => ({ RemoveButton: () => null }));
vi.mock("@/components/watchlist/RunsDisclosure", () => ({ RunsDisclosure: () => null }));

const WATCH_ROW = {
  symbol: "AAPL",
  companyName: "Apple Inc.",
  price: 211.5,
  changePct: 1.23,
  asOf: "2026-08-08",
  grades: {
    fundamentals: "A",
    valuation: "B",
    technicals: "C",
    balanceSheet: "D",
    quality: "F",
    leadership: "D",
    moat: "A",
  },
  lastReportAt: "2026-08-08T00:00:00.000Z",
  verificationRate: 0.9,
  nextEarnings: "2026-10-30",
  runs: [],
  gaps: [],
} as const satisfies WatchlistRowView;

function legacyGrades(): WatchlistRowView["grades"] {
  const grades: WatchlistRowView["grades"] = { ...WATCH_ROW.grades };
  delete grades.balanceSheet;
  return grades;
}

vi.mock("@/watchlist/watchlist", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/watchlist/watchlist")>();
  return {
    ...actual,
    getWatchlistView: vi.fn(async () => [WATCH_ROW]),
  };
});

import Home from "@/app/page";
import { Sidebar, WatchlistSidebar } from "@/components/watchlist/Sidebar";
import { getWatchlistView } from "@/watchlist/watchlist";
import { GRADE_SURFACES } from "@/report/surfaceManifest";

const EXPECTED_TITLES = ["F: A", "V: B", "T: C", "BS: D", "Q: F", "L: D", "M: A"];

/**
 * D-246: the Home dashboard is the coverage desk, which titles each grade with
 * the manifest's full label ("Balance Sheet: D"); the sidebar keeps the short
 * label ("BS: D"). The same manifest decides both.
 */
function deskTitle(sidebarTitle: string): string {
  const [short, value] = sidebarTitle.split(": ");
  return `${GRADE_SURFACES.find((descriptor) => descriptor.shortLabel === short)!.label}: ${value}`;
}
const count = (html: string, text: string): number => html.split(text).length - 1;

function expectCanonicalGradeTitles(html: string): void {
  let cursor = -1;
  for (const title of EXPECTED_TITLES) {
    const next = html.indexOf(`title="${title}"`, cursor + 1);
    expect(next, title).toBeGreaterThan(cursor);
    cursor = next;
  }
}

function renderAsync(node: ReturnType<typeof createElement>): Promise<string> {
  return new Promise((resolve, reject) => {
    let html = "";
    const destination = new PassThrough();
    destination.setEncoding("utf8");
    destination.on("data", (chunk: string) => { html += chunk; });
    destination.on("end", () => resolve(html));
    destination.on("error", reject);
    const stream = renderToPipeableStream(node, {
      onAllReady: () => stream.pipe(destination),
      onError: reject,
    });
  });
}

describe("manifest-driven watchlist renderers", () => {
  beforeEach(() => {
    vi.mocked(getWatchlistView).mockResolvedValue([WATCH_ROW]);
  });

  it("discloses a failed sidebar load without claiming an empty watchlist or a zero count", async () => {
    vi.mocked(getWatchlistView).mockRejectedValue(new Error("database unavailable"));
    const html = renderToStaticMarkup(await WatchlistSidebar({}));
    expect(html).toContain('role="alert"');
    expect(html).toMatch(/could not load/i);
    expect(html).toMatch(/reload/i);
    expect(html).not.toMatch(/no tickers yet/i);
    expect(html).not.toMatch(/>0<\/span>/);
    expect(html).not.toContain("database unavailable");
  });

  it("keeps a successful empty sidebar distinct from a failed load", async () => {
    vi.mocked(getWatchlistView).mockResolvedValue([]);
    const html = renderToStaticMarkup(await WatchlistSidebar({}));
    expect(html).toMatch(/no tickers yet/i);
    expect(html).not.toContain('role="alert"');
  });

  it("discloses failed loads in both Home surfaces without an empty-state onboarding suggestion", async () => {
    vi.mocked(getWatchlistView).mockRejectedValue(new Error("database unavailable"));
    const html = await renderAsync(await Home());
    expect(html.match(/role="alert"/g) ?? []).toHaveLength(2);
    expect(html).not.toMatch(/no tickers yet|start with DEMO|0 tickers/i);
    expect(html).not.toContain("database unavailable");
  });

  it("renders all seven persisted grades through the actual Sidebar in canonical order", () => {
    const html = renderToStaticMarkup(createElement(Sidebar, {
      rows: [WATCH_ROW],
    }));
    expectCanonicalGradeTitles(html);
    expect(html.match(/title="BS: D"/g)).toHaveLength(1);
  });

  it("omits optional balance only for a legacy Sidebar row without a placeholder", () => {
    const html = renderToStaticMarkup(createElement(Sidebar, {
      rows: [{ ...WATCH_ROW, grades: legacyGrades() }],
    }));
    expect(html).not.toContain("BS:");
    expect(html).not.toContain("balanceSheet");
    for (const title of EXPECTED_TITLES.filter((title) => !title.startsWith("BS:"))) {
      expect(html).toContain(`title="${title}"`);
    }
  });

  it("renders all seven grades through both actual Home watchlist surfaces", async () => {
    const html = await renderAsync(await Home());
    expect(html.match(/title="BS: D"/g) ?? []).toHaveLength(1);
    expect(count(html, 'title="Balance Sheet: D"')).toBe(1);
    expect([...html.matchAll(/title="(F: A|V: B|T: C|BS: D|Q: F|L: D|M: A)"/g)]
      .map((match) => match[1])).toEqual(EXPECTED_TITLES);
    const desk = EXPECTED_TITLES.map(deskTitle);
    expect(desk.map((title) => html.indexOf(`title="${title}"`))).toEqual([...desk.map((title) => html.indexOf(`title="${title}"`))].sort((a, b) => a - b));
    for (const title of desk) expect(count(html, `title="${title}"`), title).toBe(1);
  });

  it("renders unassessed saved grades neutrally in both sidebar and dashboard while retaining supported letters", async () => {
    vi.mocked(getWatchlistView).mockResolvedValue([{ ...WATCH_ROW,
      grades: { ...WATCH_ROW.grades, quality: null, valuation: null, moat: null },
    }]);
    const html = await renderAsync(await Home());
    for (const label of ["Q", "V", "M"]) {
      expect(html.match(new RegExp(`title="${label}: not assessed"`, "g")) ?? []).toHaveLength(1);
      expect(count(html, `title="${deskTitle(`${label}: not assessed`)}"`)).toBe(1);
    }
    expect(html.match(/aria-label="not assessed"/g)).toHaveLength(6);
    expect(html.match(/title="F: A"/g)).toHaveLength(1);
    expect(count(html, `title="${deskTitle("F: A")}"`)).toBe(1);
    expect(html).not.toMatch(/title="(?:Q|V|M): (?:null|[ABCDF])"/);
    for (const label of ["Q", "V", "M"]) for (const bad of ["null", "A", "B", "C", "D", "F"]) expect(html).not.toContain(`title="${deskTitle(`${label}: ${bad}`)}"`);
  });

  it("renders a legacy Home through both surfaces without fabricating optional balance", async () => {
    vi.mocked(getWatchlistView).mockResolvedValue([{ ...WATCH_ROW, grades: legacyGrades() }]);
    const html = await renderAsync(await Home());
    expect(html).not.toContain("BS:");
    expect(html).not.toContain("Balance Sheet:");
    expect(html).not.toContain("balanceSheet");
    for (const title of EXPECTED_TITLES.filter((title) => !title.startsWith("BS:"))) {
      expect(html.match(new RegExp(`title="${title}"`, "g")) ?? []).toHaveLength(1);
      expect(count(html, `title="${deskTitle(title)}"`), title).toBe(1);
    }
  });

  it("explains withheld grades and stale saved quotes accessibly on both Home surfaces", async () => {
    vi.mocked(getWatchlistView).mockResolvedValue([{ ...WATCH_ROW,
      grades: { ...WATCH_ROW.grades, quality: null },
      gradeLabels: { quality: "Not assessed — limited evidence (40% of signals; 50% required)" },
      priceStale: true,
    }]);
    const html = await renderAsync(await Home());
    const limited = "Not assessed — limited evidence (40% of signals; 50% required)";
    expect(count(html, `title="Q: ${limited}"`)).toBe(1);
    expect(count(html, `aria-label="Q: ${limited}"`)).toBe(1);
    expect(count(html, `title="${deskTitle(`Q: ${limited}`)}"`)).toBe(1);
    expect(count(html, `aria-label="${deskTitle(`Q: ${limited}`)}"`)).toBe(1);
    // The sidebar says "cached quote · date · stale"; the coverage desk's cached-quote column says "date · stale".
    expect(count(html, "cached quote · 2026-08-08 · stale")).toBe(1);
    expect(html.match(/2026-08-08(?:<!-- -->)? · stale/g) ?? []).toHaveLength(2);
    expect(html.match(/title="F: A"/g) ?? []).toHaveLength(1);
    expect(count(html, `title="${deskTitle("F: A")}"`)).toBe(1);
  });
});
