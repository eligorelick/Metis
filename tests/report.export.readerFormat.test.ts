/**
 * P22: the Markdown and print exports share one set of value formatters
 * (src/report/export/readerFormat.ts). Markdown used to round signed
 * percentages with `toFixed`, so 12.35 printed "+12.3%" there while print and
 * the app printed "+12.4%".
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { num, READER_DASH, signedPct } from "@/report/export/readerFormat";
import { formatPct } from "@/report/format";
import { ReportSchema, type Report } from "@/report/schema";

import { currentValuationUseFixture } from "./helpers/valuationUse";

function loadReport(): Report {
  const parsed = ReportSchema.safeParse(JSON.parse(readFileSync(path.join(process.cwd(), "fixtures", "report", "DEMO-sample.json"), "utf8")));
  if (!parsed.success) throw new Error("fixture must parse against ReportSchema");
  return parsed.data;
}

describe("shared reader formatters", () => {
  it("rounds a signed percentage as the app does", () => {
    // 12.35 is stored as 12.3499…; toFixed(1) gives "12.3", decimalRound gives 12.4.
    expect((12.35).toFixed(1)).toBe("12.3");
    expect(signedPct(12.35)).toBe("+12.4%");
    expect(signedPct(12.35)).toBe(formatPct(12.35, 1, true));
    expect(signedPct(-4)).toBe("-4.0%");
    expect(signedPct(-12.35)).toBe(formatPct(-12.35, 1, true));
    expect(signedPct(-12.35)).toBe("-12.4%");
    expect(signedPct(0)).toBe("+0.0%");
    expect(signedPct(-0.04)).toBe(formatPct(-0.04, 1, true));
  });

  it("prints a dash for absent or non-finite values", () => {
    for (const v of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(signedPct(v)).toBe(READER_DASH);
      expect(num(v)).toBe(READER_DASH);
    }
    expect(READER_DASH).toBe("—");
  });

  it("keeps fixed-decimal numbers unchanged", () => {
    expect(num(1.5)).toBe("1.50");
    expect(num(-2.25, 1)).toBe((-2.25).toFixed(1));
  });
});

describe("Markdown and print show the same DCF upside", () => {
  const upsideIn = (text: string): string | undefined => text.match(/upside (?:<span class="mono">)?([+−-]?\d[\d.]*%)/)?.[1];

  it.each([
    { stored: 12.35, shown: "+12.4%" },
    { stored: -7.25, shown: formatPct(-7.25, 1, true) },
  ])("renders $stored as $shown in both exports", ({ stored, shown }) => {
    const report = loadReport();
    expect(report.valuation.dcf.perShare).not.toBeNull();
    report.valuation.dcf.upsidePct = stored;
    report.fairValue = { status: "available", method: "fcff-dcf", methodVersion: "Synthetic current model",
      perShare: report.valuation.dcf.perShare, upsidePct: stored, basis: ["Synthetic source-admitted model"], reasons: [],
      currentUse: currentValuationUseFixture("2026-07-05") };
    const parsed = ReportSchema.parse(report);
    const markdown = reportToMarkdown(parsed);
    const print = reportToPrintBody(parsed);
    expect(upsideIn(markdown)).toBe(shown);
    expect(upsideIn(print)).toBe(shown);
    expect(shown).toBe(formatPct(stored, 1, true));
  });
});
