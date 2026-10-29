/**
 * A stored report valued before the B4a batch's report spec is marked at display
 * time with what the equity-bridge method changed since (audit 2026-10-27 B4a:
 * FIN-103, FIN-119, FIN-303, FIN-305, FIN-108, FIN-311, FIN-109, D-67). Each clause
 * fires only where a stored byte shows the old method touched that report, and
 * FIN-109's corrected sentence replaces the stored one. No figure is rewritten.
 * Synthetic fixtures only; no network.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ReportView } from "@/components/report/ReportView";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { BRIDGE_METHOD_SINCE_SPEC_VERSION, LEGACY_BRIDGE_CLAUSES, withLegacyBridgeMethod } from "@/report/legacyBridgeMethod";
import { parseStoredReportWithSafety } from "@/report/legacyEntitySafety";
import type { Report } from "@/report/schema";

import { cloneTask28, loadTask28Fixture } from "./helpers/task28Report";

const NOTE = /Valued under the equity-bridge method before report spec .*Re-run the report for the current method/;
const CLAIMS = /so any the issuer filed were not deducted/;
const E7 = /deducted the filed retirement and environmental obligations shown in its bridge at their full amount, before the tax relief a settlement earns/;
const LEASE = /sales-to-capital kept the 5,494M operating lease the EV left out in invested capital/;
const DIVISOR_IF = /if the divisor period was a loss quarter, its divisor carried no award dilution/;
const REIT_NOTE = /Priced under the REIT method before report spec .*P\/FFO, P\/AFFO and the implied cap rate used price × weighted diluted shares/;
const FINANCE_SENTENCE = /a total lease liability of 2,387M is a finance lease, which stays in EV and net debt on both bases, so there is no operating slice to remove and EV is reported as-is/;
const FIN109_OLD = "a total lease liability of 2387000000 is disclosed but its operating slice is not, so no lease adjustment was made and EV is reported as-is";

const EV_HEAD = "Enterprise value EXCLUDES the OPERATING-lease liability (house default). EV = market cap + total debt + preferred stock + minority interest − cash and short-term investments";
const EV_TAIL = ". EV/EBITDA uses this same EV. Under US GAAP (ASC 842) operating-lease cost stays in operating expenses.";

const FULL_ENTRY = {
  field: "keyless.incomeAnnual",
  reason: "served by edgar (companyfacts→income-statement(annual)) because FMP returned no rows",
  severity: "info" as const,
  expected: true,
};

const leaseNumber = (sourceId: string, value: number) => ({
  value, unit: "currency", currency: "USD", sourceId, source: sourceId, asOf: "2026-09-03", verified: true,
});

function base(specVersion: string, method: "fcff-dcf" | "excess-return" | null = "fcff-dcf"): Report {
  const report = cloneTask28(loadTask28Fixture());
  report.meta = { ...report.meta, specVersion };
  report.fairValue = method === null
    ? { status: "suppressed", method: null, methodVersion: "stored", perShare: null, upsidePct: null, basis: [], reasons: [{ field: "valuation.fairValue", severity: "info", reason: "n/m" }] }
    : { status: "available", method, methodVersion: "stored", perShare: report.valuation.dcf.perShare, upsidePct: 12, basis: ["Stored fair value basis line."], reasons: [] };
  return report;
}

/** MU-shaped (report 46): the total is wholly a finance lease; the FMP-route wording was stored. */
function financeOnly(specVersion: string, financeValue = 2_387_000_000): Report {
  const report = base(specVersion);
  report.valuation.multiplesBasis = `${EV_HEAD}; ${FIN109_OLD}${EV_TAIL}`;
  report.balanceSheet.debtProfile.numbers = [
    ...report.balanceSheet.debtProfile.numbers,
    leaseNumber("computed.capital.current.debtBridge.financeLeases", financeValue),
  ];
  report.appendix.missingData = [
    ...report.appendix.missingData,
    {
      field: "valuation.multiples.enterpriseValue.leases",
      reason: "lease liabilities of 2387000000 are disclosed only as a combined operating + finance figure (the FMP route publishes no split) — only the OPERATING slice may be netted out of EV, so enterprise value is reported as-is rather than removing an unknown mix",
      severity: "info",
    },
  ];
  return report;
}

/** NVDA-shaped (reports 48-52): an operating lease removed from the EV, sales-to-capital silent about it. */
function leaseLeftOut(specVersion: string): Report {
  const report = base(specVersion);
  report.valuation.multiplesBasis = `${EV_HEAD}, less an OPERATING lease liability of 5,494,000,000 (both already inside totalDebt under FMP's definition)${EV_TAIL}`;
  report.valuation.dcf.assumptions = [
    ...report.valuation.dcf.assumptions,
    { name: "sales-to-capital", value: "2.58", basis: "TTM revenue / operating invested capital (totalDebt + consolidated equity [totalEquity] - cashAndShortTermInvestments - longTermInvestments 51.16B, quarter balance as of 2026-07-26)" },
  ];
  return report;
}

function reit(specVersion: string): Report {
  const report = base(specVersion, null);
  report.routeMetrics = { route: "reit", metrics: [], notes: ["Stored REIT note."], asOf: "2026-06-30" };
  return report;
}

/** A stored DCF bridge whose only populated field is its non-operating component list. */
const bridgeWith = (nonOperatingComponents: { label: string; value: number }[]): Report["valuation"]["dcf"]["bridge"] => ({
  enterpriseValue: null, netDebt: null, minorityInterest: null, preferredEquity: null, equityValue: null, dilutedShares: null,
  presentValueExplicit: null, presentValueTerminal: null, currency: "USD", asOf: null, nonOperatingComponents,
});

const count = (text: string, re: RegExp): number => (text.replace(/\s+/g, " ").match(new RegExp(re.source, `${re.flags.replace("g", "")}g`)) ?? []).length;
const surfaces = (report: Report): string[] => [
  reportToMarkdown(report),
  reportToPrintBody(report),
  renderToStaticMarkup(createElement(ReportView, { report })),
];

describe("legacy equity-bridge method note", () => {
  it("the since-version is the batch's frozen value", () => {
    expect(BRIDGE_METHOD_SINCE_SPEC_VERSION).toBe("1.50.0");
  });

  it("a legacy DCF value carries the method note on every surface", () => {
    const report = base("1.44.0");
    for (const surface of surfaces(report)) expect(count(surface, NOTE)).toBe(1);
    const view = withLegacyBridgeMethod(report);
    expect(view.fairValue!.basis[0]).toBe("Stored fair value basis line.");
    expect(view.fairValue!.basis).toHaveLength(2);
  });

  it("applying the rule twice adds the note once", () => {
    const report = financeOnly("1.44.0");
    const once = withLegacyBridgeMethod(report);
    expect(withLegacyBridgeMethod(once)).toEqual(once);
    expect(once.fairValue!.basis.filter((l) => NOTE.test(l))).toHaveLength(1);
    const through = parseStoredReportWithSafety(JSON.stringify(report))!.report;
    expect(through.fairValue!.basis.filter((l) => NOTE.test(l))).toHaveLength(1);
  });

  it("a report at or after the batch's spec carries no note", () => {
    for (const version of [BRIDGE_METHOD_SINCE_SPEC_VERSION, "9.0.0"]) {
      const report = base(version);
      expect(withLegacyBridgeMethod(report)).toBe(report);
      for (const surface of surfaces(report)) expect(surface).not.toMatch(NOTE);
      const reitReport = reit(version);
      expect(withLegacyBridgeMethod(reitReport)).toBe(reitReport);
      const fin = financeOnly(version);
      expect(withLegacyBridgeMethod(fin)).toBe(fin);
    }
    // Control: B13's spec is below the cutoff, and the comparison is numeric.
    for (const version of ["1.44.0", "1.49.0", "1.9.0"]) {
      for (const surface of surfaces(base(version))) expect(count(surface, NOTE)).toBe(1);
    }
  });

  it("each clause appears only where the stored report shows the old method touched it", () => {
    // The plain task28 fixture: claims clause (conditional) and the conditional loss-quarter clause, nothing else.
    const plain = JSON.stringify(withLegacyBridgeMethod(base("1.44.0")));
    expect(plain).toMatch(CLAIMS);
    expect(plain).toMatch(DIVISOR_IF);
    expect(plain).not.toMatch(E7);
    expect(plain).not.toMatch(/sales-to-capital kept/);
    // Lease clause: the stored EV basis names the operating lease left out and sales-to-capital does not say it was removed.
    const leased = withLegacyBridgeMethod(leaseLeftOut("1.44.0"));
    expect(leased.fairValue!.basis.join(" ")).toMatch(LEASE);
    // Control: sales-to-capital says the lease was removed.
    const removed = leaseLeftOut("1.44.0");
    removed.valuation.dcf.assumptions = removed.valuation.dcf.assumptions.map((a) => (a.name === "sales-to-capital"
      ? { ...a, basis: `${a.basis} The operating-lease liability 5,494M removed: its cost is inside the EBIT this DCF projects (ASC 842; D-25).` }
      : a));
    expect(JSON.stringify(withLegacyBridgeMethod(removed))).not.toMatch(/sales-to-capital kept/);
    // Control: the stored EV basis names a lease left out of net debt, but no sales-to-capital basis is stored.
    const noBasis = leaseLeftOut("1.44.0");
    noBasis.valuation.dcf.assumptions = noBasis.valuation.dcf.assumptions.filter((a) => a.name !== "sales-to-capital");
    expect(JSON.stringify(withLegacyBridgeMethod(noBasis))).not.toMatch(/sales-to-capital kept/);
    // Control: the switch keeps the lease in the EV, so nothing was left out.
    const included = leaseLeftOut("1.44.0");
    included.valuation.multiplesBasis = included.valuation.multiplesBasis!.replace("EXCLUDES", "INCLUDES").replace(", less an OPERATING", ", keeping an OPERATING");
    expect(JSON.stringify(withLegacyBridgeMethod(included))).not.toMatch(/sales-to-capital kept/);
    // The loss-quarter clause is always the conditional wording, even when a stored basis names a loss period.
    const loss = base("1.44.0");
    loss.valuation.dcf.assumptions = [
      ...loss.valuation.dcf.assumptions,
      { name: "diluted shares", value: "100", basis: "The 2026-06-30 period is a loss, so its filed diluted count equals its basic count (antidilutive, ASC 260-10-45-17..20)" },
    ];
    const lossView = JSON.stringify(withLegacyBridgeMethod(loss));
    expect(lossView).toMatch(DIVISOR_IF);
    expect(lossView).not.toMatch(/the divisor period was a loss quarter, so/);
    // Claims clause never asserts that a claim existed.
    expect(plain).not.toMatch(/the issuer filed (a|the) /);
    // An excess-return report carries only the loss-quarter clause.
    const excess = withLegacyBridgeMethod(base("1.44.0", "excess-return"));
    const excessNote = excess.fairValue!.basis.find((l) => NOTE.test(l))!;
    expect(excessNote).toMatch(DIVISOR_IF);
    expect(excessNote).not.toMatch(CLAIMS);
    expect(excessNote).not.toMatch(E7);
    expect(excessNote).not.toMatch(/sales-to-capital/);
    const excessLeased = base("1.44.0", "excess-return");
    excessLeased.valuation.multiplesBasis = leaseLeftOut("1.44.0").valuation.multiplesBasis;
    expect(JSON.stringify(withLegacyBridgeMethod(excessLeased))).not.toMatch(/sales-to-capital kept/);
    // No available DCF or excess-return fair value and no REIT route: the identical object.
    const none = base("1.44.0", null);
    expect(withLegacyBridgeMethod(none)).toBe(none);
    const outside = base("1.44.0");
    outside.fairValue = { ...outside.fairValue!, status: "outside-domain" };
    expect(withLegacyBridgeMethod(outside)).toBe(outside);
  });

  it("each clause checks its own cutoff: a later part's clause still reaches a report at this part's cutoff (G1)", () => {
    const marker = (r: Report): Report => ({ ...r, quality: { ...r.quality, notes: [...(r.quality.notes ?? []), "LATER-PART-CLAUSE"] } });
    LEGACY_BRIDGE_CLAUSES.push({ since: "1.51.0", apply: marker });
    try {
      const atCutoff = base(BRIDGE_METHOD_SINCE_SPEC_VERSION);
      const view = withLegacyBridgeMethod(atCutoff);
      expect(view.quality.notes).toContain("LATER-PART-CLAUSE");
      // This part's clauses add nothing at its own cutoff.
      expect(view.fairValue).toEqual(atCutoff.fairValue);
      // A report at or after the later clause's cutoff gets neither.
      const later = base("1.51.0");
      expect(withLegacyBridgeMethod(later)).toBe(later);
    } finally {
      LEGACY_BRIDGE_CLAUSES.pop();
    }
  });

  it("the lease 'removed' test needs an affirmative statement, across decimals and negation (G3)", () => {
    const withBasis = (tail: string): Report => {
      const r = leaseLeftOut("1.44.0");
      r.valuation.dcf.assumptions = r.valuation.dcf.assumptions.map((a) => (a.name === "sales-to-capital" ? { ...a, basis: `${a.basis}${tail}` } : a));
      return r;
    };
    // A decimal amount before "removed" still counts as removed: no clause.
    expect(JSON.stringify(withLegacyBridgeMethod(withBasis(" The operating-lease liability 5,494.5M removed: its cost is inside the EBIT.")))).not.toMatch(/sales-to-capital kept/);
    // "is not removed" does not count as removed: the clause fires.
    expect(JSON.stringify(withLegacyBridgeMethod(withBasis(" The operating lease is not removed from invested capital: scope unproven; total debt is used as reported.")))).toMatch(LEASE);
  });

  it("stored bytes are never rewritten", () => {
    const report = financeOnly("1.44.0");
    const before = JSON.stringify(report);
    withLegacyBridgeMethod(report);
    surfaces(report);
    expect(JSON.stringify(report)).toBe(before);
  });

  it("a legacy finance-lease-only basis is shown corrected", () => {
    const report = financeOnly("1.44.0");
    const view = withLegacyBridgeMethod(report);
    expect(view.valuation.multiplesBasis).toMatch(FINANCE_SENTENCE);
    expect(view.valuation.multiplesBasis).not.toContain(FIN109_OLD);
    expect(view.appendix.missingData.some((e) => /publishes no split/.test(e.reason))).toBe(false);
    for (const surface of surfaces(report)) {
      expect(surface.replace(/\s+/g, " ")).toMatch(/is a finance lease, which stays in EV/);
      expect(surface).not.toMatch(/publishes no split/);
    }
    // Control: a mixed-lease legacy basis (the finance lease is only part of the total) is shown unchanged.
    const mixed = financeOnly("1.44.0", 1_000_000_000);
    const mixedView = withLegacyBridgeMethod(mixed);
    expect(mixedView.valuation.multiplesBasis).toBe(mixed.valuation.multiplesBasis);
    expect(mixedView.appendix.missingData.some((e) => /publishes no split/.test(e.reason))).toBe(true);
    // Control: a stored operating-lease number means the total is not wholly finance.
    const withOperating = financeOnly("1.44.0");
    withOperating.balanceSheet.debtProfile.numbers = [...withOperating.balanceSheet.debtProfile.numbers, leaseNumber("computed.capital.current.debtBridge.operatingLeases", 5)];
    expect(withLegacyBridgeMethod(withOperating).valuation.multiplesBasis).toBe(withOperating.valuation.multiplesBasis);
    // Control: no stored finance-lease amount, no correction.
    const noFinance = financeOnly("1.44.0");
    noFinance.balanceSheet.debtProfile.numbers = noFinance.balanceSheet.debtProfile.numbers.filter((n) => !/financeLeases/.test(n.sourceId ?? ""));
    expect(withLegacyBridgeMethod(noFinance).valuation.multiplesBasis).toBe(noFinance.valuation.multiplesBasis);
    // The stored scope basis is corrected the same way.
    const scoped = financeOnly("1.44.0");
    scoped.valuation.marketValueScope = {
      status: "resolved", marketCap: 1, economicShares: 1, currency: "USD", shareCountAsOf: null, approximate: false, basis: "b",
      enterpriseValue: 1, enterpriseValueBasis: scoped.valuation.multiplesBasis!,
    };
    expect(withLegacyBridgeMethod(scoped).valuation.marketValueScope!.enterpriseValueBasis).toMatch(FINANCE_SENTENCE);
  });

  it("a legacy REIT block is explained", () => {
    const report = reit("1.44.0");
    const view = withLegacyBridgeMethod(report);
    expect(view.routeMetrics!.notes).toHaveLength(2);
    expect(view.routeMetrics!.notes[0]).toBe("Stored REIT note.");
    expect(view.routeMetrics!.notes[1]).toMatch(REIT_NOTE);
    expect({ ...view, routeMetrics: undefined }).toEqual({ ...report, routeMetrics: undefined });
    expect({ ...view.routeMetrics, notes: [] }).toEqual({ ...report.routeMetrics, notes: [] });
    expect(withLegacyBridgeMethod(view)).toEqual(view);
    for (const surface of [reportToMarkdown(report), renderToStaticMarkup(createElement(ReportView, { report }))]) {
      expect(count(surface, REIT_NOTE)).toBe(1);
    }
    // Control: a non-REIT route gets no REIT note.
    const bank = reit("1.44.0");
    bank.routeMetrics = { ...bank.routeMetrics!, route: "bank" };
    expect(withLegacyBridgeMethod(bank)).toBe(bank);
  });

  it("the legacy note says retirement and environmental obligations were deducted before tax, only when the stored bridge shows one", () => {
    const report = base("1.44.0");
    report.valuation.dcf.bridge = bridgeWith([{ label: "asset-retirement obligations (filed, before tax)", value: -384 }]);
    expect(withLegacyBridgeMethod(report).fairValue!.basis.join(" ")).toMatch(E7);
    // Control: the task28 fixture as it is carries the note without that clause.
    const plain = withLegacyBridgeMethod(base("1.44.0")).fairValue!.basis.join(" ");
    expect(plain).toMatch(NOTE);
    expect(plain).not.toMatch(/before the tax relief/);
    // Control: an after-tax label (this batch's own) is not the legacy clause.
    const after = base("1.44.0");
    after.valuation.dcf.bridge = bridgeWith([{ label: "asset-retirement obligations (filed, after tax at 21%)", value: -303 }]);
    expect(withLegacyBridgeMethod(after).fairValue!.basis.join(" ")).not.toMatch(/before the tax relief/);
  });

  it("composes with B3's and B13's wrappers", () => {
    // B3's peer-currency rule and B13's EDGAR-derived-lines note, beside this batch's.
    const report = base("1.44.0");
    report.appendix.missingData = [...report.appendix.missingData, FULL_ENTRY];
    report.competitive.peerTable = [{
      name: "Example Tokyo Corp.", symbol: "9999.T",
      metrics: [{ value: 21.5e12, unit: "currency", currency: "USD", sourceId: "payload.peers.9999-t-example-tokyo-corp", source: "payload.peers.9999-t-example-tokyo-corp", asOf: "2026-10-25", verified: true }],
    }];
    const DERIVATION = /built from SEC filings before report spec .*re-run the report for the current derivation/;
    for (const surface of surfaces(report)) {
      expect(count(surface, NOTE)).toBe(1);
      expect(count(surface, DERIVATION)).toBe(1);
      expect(count(surface, /currency unknown/)).toBeGreaterThanOrEqual(1);
    }
    const basis = parseStoredReportWithSafety(JSON.stringify(report))!.report.fairValue!.basis;
    const b13 = basis.findIndex((l) => DERIVATION.test(l));
    const b4 = basis.findIndex((l) => NOTE.test(l));
    expect(b13).toBeGreaterThan(-1);
    expect(b4).toBeGreaterThan(b13);
    expect(basis.filter((l) => NOTE.test(l))).toHaveLength(1);
    expect(basis.filter((l) => DERIVATION.test(l))).toHaveLength(1);
  });
});
