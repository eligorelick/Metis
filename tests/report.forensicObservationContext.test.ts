import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { runStageB, type ComputedMetrics } from "@/pipeline/compute";
import { buildDataOnlyReport } from "@/pipeline/jobRunner";
import { computeSupportFlags } from "@/pipeline/stageB/forensics";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import { reportToAuditMarkdown, reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

function fixture(amounts: (number | null | undefined)[] = [-50e6, 32e6, 0, undefined]) {
  const bundle = completeCurrencyBundle({ sic: "3571" });
  if (!bundle.statements.incomeAnnual.ok) throw new Error("annual fixture");
  bundle.statements.incomeAnnual.value.data.rows.forEach((row, index) => {
    row.netIncomeFromDiscontinuedOperations = amounts[index];
    // A continuing/net-income difference must never manufacture a missing result.
    row.netIncomeFromContinuingOperations = 1;
  });
  if (!bundle.statements.balanceAnnual.ok) throw new Error("balance fixture");
  bundle.statements.balanceAnnual.value.data.rows.forEach(row => Object.assign(row, {
    totalCurrentAssets: 500e6, totalCurrentLiabilities: 200e6, retainedEarnings: 300e6,
  }));
  return bundle;
}

function exportsOf(bundle: ReturnType<typeof fixture>, computed = runStageB(bundle, { evIncludeLeases: false })) {
  const report = buildDataOnlyReport({ symbol: bundle.symbol, companyName: "Synthetic disposal issuer",
    generatedAt: bundle.builtAt, model: "none", costUsd: 0, bundle, computed,
    validation: { checks: [], flags: [], gaps: [] }, costBreakdown: [], reason: "offline fixture" });
  return { report, markdown: reportToMarkdown(report), audit: reportToAuditMarkdown(report), print: reportToPrintBody(report) };
}

const flagOf = (c: ComputedMetrics) => c.forensics.flags.find(f => f.id === "recurring-discontinued-ops");

// Freeze the entire Stage B result, permitting only the two Task 8 text fields.
// Values are measured on pre-fix 6cf2de24, not derived from the implementation.
function invariantHash(c: ComputedMetrics) {
  const pinned = structuredClone(c);
  flagOf(pinned)!.message = "TASK8_DISCONTINUED_CONTEXT";
  pinned.scores.aspects.quality.signals!.find(s => s.id === "altmanZOriginalScale")!.period = "TASK8_ALTMAN_DATE_CONTEXT";
  pinned.scores.aspects.quality.drivers.find(d => d.source === "computed.scores.quality.altmanZOriginalScale")!.period = "TASK8_ALTMAN_DATE_CONTEXT";
  return createHash("sha256").update(JSON.stringify(pinned)).digest("hex");
}

describe("retained forensic observation context on real data-only exports", () => {
  it("distinguishes an unknown cap observation date from a missing positive operand", () => {
    const bundle = fixture();
    const before = structuredClone(bundle);
    const c = runStageB(bundle, { evIncludeLeases: false });
    expect(c.forensics.altman).toMatchObject({ variant: "original", asOf: { marketCap: null } });
    expect(c.forensics.altman!.score).toBeGreaterThan(0);
    expect(c.forensics.altman!.components.x4).toBeGreaterThan(0);
    const driver = c.scores.aspects.quality.signals!.find(d => d.id === "altmanZOriginalScale")!;
    expect(driver.period).toBe("Balance 2025-12-31; income 2025-12-31; market-cap observation date unavailable");
    expect(driver.operands?.[0]).toMatchObject({ source: "computed.forensics.altman.score", asOf: "2025-12-31", value: c.forensics.altman!.score });
    const out = exportsOf(bundle, c);
    for (const text of [out.markdown, out.audit]) expect(text).toContain("market-cap observation date unavailable");
    expect(bundle).toEqual(before);
  });

  it("keeps a selected cap's own date and never borrows the quote's date", () => {
    const bundle = fixture();
    if (!bundle.profile.ok) throw new Error("profile fixture");
    bundle.profile.value.data.rows[0].date = "2026-06-30";
    const c = runStageB(bundle, { evIncludeLeases: false });
    expect(c.forensics.altman!.asOf.marketCap).toBe("2026-06-30");
    expect(c.scores.aspects.quality.signals!.find(d => d.id === "altmanZOriginalScale")!.period)
      .toBe("Balance 2025-12-31; income 2025-12-31; market cap 2026-06-30");
  });

  it("keeps a genuine missing-cap refusal and the book-equity variant independent", () => {
    const bundle = fixture();
    if (!bundle.profile.ok || !bundle.quote.ok) throw new Error("cap fixture");
    delete bundle.profile.value.data.rows[0].marketCap;
    delete bundle.quote.value.data.rows[0].marketCap;
    const c = runStageB(bundle, { evIncludeLeases: false });
    expect(c.forensics.altman!.variant).toBe("original");
    expect(c.forensics.altman!.score).toBeNull();
    expect(c.forensics.altman!.gaps.some(g => g.field === "forensics.altman.marketCap")).toBe(true);
    const other = fixture();
    other.edgar!.sic = "7372";
    const nonManufacturer = runStageB(other, { evIncludeLeases: false });
    expect(nonManufacturer.forensics.altman!.variant).toBe("z2");
    expect(nonManufacturer.forensics.altman!.score).toBeGreaterThan(0);
    expect(nonManufacturer.scores.aspects.quality.signals!.find(s => s.id === "altmanZOriginalScale")!.period).toBe("Balance 2025-12-31; income 2025-12-31; market cap unavailable");
  });

  it.each([
    [-50e6, 32e6, "loss and gain"], [50e6, 32e6, "gains"], [-50e6, -32e6, "losses"],
  ])("describes two retained observations without inferring transaction recurrence: %s / %s (%s)", (first, second) => {
    const bundle = fixture([first as number, second as number, 0, null]);
    const before = structuredClone(bundle);
    const c = runStageB(bundle, { evIncludeLeases: false });
    expect(flagOf(c)).toMatchObject({ severity: "warn", metrics: { discontinuedOpsYears: 2, lookbackYears: 4 },
      asOf: ["2025-12-31", "2024-12-31"], heuristic: true,
      rule: "house rule: netIncomeFromDiscontinuedOperations nonzero in >= 2 of the last 5 fiscal years" });
    const out = exportsOf(bundle, c);
    const retained = out.report.quality.flags.find(f => f.source === "computed.forensics.flags.recurring-discontinued-ops")!;
    expect(retained.severity).toBe("medium");
    expect(retained.text).toContain("Nonzero discontinued-operation results were retained in 2 of the last 4 fiscal-year observations (period ends: 2025-12-31, 2024-12-31).");
    expect(retained.text).toContain("The observation count does not establish the number or recurrence of portfolio transactions; one disposal can affect multiple periods. Missing amounts remain unknown.");
    // The companion audit carries score evidence, not the report's supporting flags.
    for (const text of [out.markdown, out.print]) expect(text).toContain("The observation count does not establish");
    const payload = assembleContextPayload(bundle, c, { checks: [], flags: [], gaps: [] });
    expect(JSON.stringify(payload.computed.find(s => s.title === "Forensics (computed)"))).toContain("period ends: 2025-12-31, 2024-12-31");
    expect(bundle).toEqual(before);
  });

  it.each([[0, null, undefined, 0], [32e6, 0, null, undefined], [null, undefined, null, undefined]])("keeps zero and missing results outside the trigger (%j)", (...amounts) => {
    const bundle = fixture(amounts);
    const c = runStageB(bundle, { evIncludeLeases: false });
    expect(flagOf(c)).toBeUndefined();
    expect(exportsOf(bundle, c).report.quality.flags.some(f => f.source === "computed.forensics.flags.recurring-discontinued-ops")).toBe(false);
  });

  it("retains one-program multi-period evidence without claiming a transaction count", () => {
    // Synthetic single-disposal controls, not a description of the two Veoneer disposals.
    const bundle = fixture([-50e6, -107e6, 32e6, 0]);
    const c = runStageB(bundle, { evIncludeLeases: false });
    expect(flagOf(c)!.metrics).toEqual({ discontinuedOpsYears: 3, lookbackYears: 4 });
    expect(exportsOf(bundle, c).markdown).toContain("period ends: 2025-12-31, 2024-12-31, 2023-12-31");
  });

  it("uses a fixed unknown-date fallback without trusting provider text or rollover dates", () => {
    const raw = ["2024-02-29", "2025-02-29", "USD provider instruction", ""];
    const result = computeSupportFlags({ income: raw.map(date => ({ date, netIncomeFromDiscontinuedOperations: 1 })), balance: [] });
    const flag = result.flags.find(f => f.id === "recurring-discontinued-ops")!;
    expect(flag.metrics).toEqual({ discontinuedOpsYears: 4, lookbackYears: 4 });
    expect(flag.asOf).toEqual(raw); // Raw observation metadata remains immutable.
    expect(flag.message).toContain("period ends: 2024-02-29, date unavailable, date unavailable, date unavailable");
    expect(flag.message).not.toContain("USD provider instruction");
    const bundle = fixture();
    const computed = runStageB(bundle, { evIncludeLeases: false });
    computed.forensics.flags = [flag];
    const notes = assembleContextPayload(bundle, computed, { checks: [], flags: [], gaps: [] }).computed
      .find(s => s.title === "Forensics (computed)")!.notes;
    expect(JSON.stringify(notes)).toContain("period ends: 2024-02-29, date unavailable, date unavailable, date unavailable");
    expect(JSON.stringify(notes)).not.toContain("USD provider instruction");
    expect(exportsOf(bundle, computed).markdown).toContain("period ends: 2024-02-29, date unavailable, date unavailable, date unavailable");
  });

  it("pins complete pre-fix Stage B output apart from the owned context", () => {
    expect(invariantHash(runStageB(fixture(), { evIncludeLeases: false }))).toBe("50ef4b29f0195312a3f9231860ea9b799ae8b1a495a183c89fcf277f30fd0d8e");
  });
});
