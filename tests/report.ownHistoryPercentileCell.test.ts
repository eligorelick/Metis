/**
 * The multiples table's own-history column printed its label ("empirical
 * percentile 2/100 (n = 17 quarters)") in the share bar's 3rem caption slot,
 * which broke it into one- and two-letter lines in both layouts (live NVDA
 * check, 2026-10-26). The label now sits under the bar, whole.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import { describe, expect, it, vi } from "vitest";
import { ReportView } from "@/components/report/ReportView";
import { ownHistoryRankLabel } from "@/report/ownHistoryPresentation";
import { loadTask28Fixture } from "./helpers/task28Report";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("own-history percentile cell", () => {
  it.each(["dossier", "classic"] as const)("prints the whole label outside the bar's caption slot (%s)", (layout) => {
    const report = loadTask28Fixture();
    const rows = report.valuation.multiples.filter((m) => m.own5yPercentile !== null);
    expect(rows.length).toBeGreaterThan(0);
    const window = new Window();
    window.document.body.innerHTML = renderToStaticMarkup(createElement(ReportView, { report, layout }));
    const labels = [...window.document.querySelectorAll("span")].filter((span) => /^empirical percentile /.test(span.textContent ?? ""));
    expect(labels.map((span) => span.textContent)).toEqual(expect.arrayContaining(
      rows.map((m) => ownHistoryRankLabel(m.own5yPercentile, m.ownHistoryObservations))));
    for (const span of labels) expect(span.className).not.toMatch(/\bw-12\b/);
    void window.happyDOM.close();
  });
});
