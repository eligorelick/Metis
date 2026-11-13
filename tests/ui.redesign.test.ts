import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseEnv, resetConfigCache } from "@/config/env";
import RootLayout from "@/app/layout";
import { CoverageDesk } from "@/components/watchlist/CoverageDesk";

vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: () => undefined })) }));
vi.mock("@/watchlist/watchlist", () => ({ getWatchlistView: vi.fn(async () => []) }));

afterEach(() => { delete process.env.METIS_UI_REDESIGN; delete process.env.THESIS_UI_REDESIGN; resetConfigCache(); });

describe("the dossier layout (D-246: the layout setting is removed)", () => {
  it.each(["", "0", "1", "true", "anything"])("ignores a leftover METIS_UI_REDESIGN=%j: the app starts with the same settings", (value) => {
    const config = parseEnv({ METIS_UI_REDESIGN: value });
    expect(config).toEqual(parseEnv({}));
    expect(config).not.toHaveProperty("uiRedesign");
  });

  it("still refuses the retired THESIS_UI_REDESIGN name, alone or beside a leftover METIS_ value (D-228)", () => {
    expect(() => parseEnv({ THESIS_UI_REDESIGN: "1" })).toThrow(/THESIS_UI_REDESIGN -> METIS_UI_REDESIGN/);
    expect(() => parseEnv({ METIS_UI_REDESIGN: "0", THESIS_UI_REDESIGN: "1" })).toThrow(/THESIS_UI_REDESIGN/);
  });

  it.each(["unset", "0", "1", "true"] as const)("renders the dossier SSR layout boundary with METIS_UI_REDESIGN %s, without serializing config", async (flag) => {
    if (flag !== "unset") process.env.METIS_UI_REDESIGN = flag;
    resetConfigCache();
    const html = renderToStaticMarkup(await RootLayout({ children: createElement("p", null, "Research") }));
    expect(html).toContain('data-ui-layout="dossier"');
    expect(html).toContain('data-ui-design="current"');
    expect(html).not.toMatch(/fmpApiKey|anthropicApiKey|providerCredentials/);
  });

  it("keeps cached zero/negative values, missing context and real destinations readable in coverage", () => {
    const html = renderToStaticMarkup(createElement(CoverageDesk, { rows: [{
      symbol: "BRK-B", companyName: "A long recorded company name", price: 0, changePct: -2.5,
      asOf: "2025-12-31", priceStale: true, lastReportAt: "2026-01-15", verificationRate: 0,
      nextEarnings: null, runs: [], gaps: ["Recorded coverage limitation"], grades: null,
    }] }));
    for (const text of ["0.00", "-2.50%", "2025-12-31", "stale", "2026-01-15", "0%", "No report yet", "Recorded coverage limitation", "does not identify quote currency", "not correctness"])
      expect(html).toContain(text);
    expect(html).toContain('href="/company/BRK-B"');
    expect(html).toContain('href="/company/BRK-B/history"');
    expect(html).not.toContain("$0");
    expect(html).toContain('aria-label="Saved company coverage" tabindex="0"');
  });
});
