/**
 * Loading screens for the company routes. The company loading screen shows
 * the app shell and a skeleton at once while a page renders; the print page
 * overrides it with nothing, so paper output never shows app chrome.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/company/DEMO",
  useSearchParams: () => new URLSearchParams(),
}));

import CompanyLoading from "@/app/company/[symbol]/loading";
import PrintLoading from "@/app/company/[symbol]/report/[reportId]/print/loading";

describe("company loading screens", () => {
  it("shows the shell, the sidebar placeholder and the research skeleton, with the disclaimer", () => {
    const html = renderToStaticMarkup(createElement(CompanyLoading));
    expect(html).toContain("thesis-shell");
    expect(html).toContain("company-loading");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("loading research");
    expect(html.toLowerCase()).toContain("informational only");
    // A placeholder states no figure, grade or company.
    expect(html).not.toMatch(/\$\d|\d%/);
  });

  it("leaves the print page blank until the report arrives", () => {
    expect(PrintLoading()).toBeNull();
    expect(renderToStaticMarkup(createElement(PrintLoading))).toBe("");
  });
});
