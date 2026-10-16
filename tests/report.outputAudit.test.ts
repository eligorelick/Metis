import { describe, expect, it } from "vitest";
import { buildMarketData } from "@/pipeline/marketData";
import { buildDataCompleteness, deriveReportCompletenessPresentation } from "@/report/completeness";
import { consensusTables, dataStateText } from "@/report/presentation";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintHtml } from "@/report/export/printHtml";
import { reportToAuditMarkdown } from "@/report/export/auditMarkdown";
import { currencyBundle } from "./helpers/currencyBundle";
import { loadTask28Fixture } from "./helpers/task28Report";
import { ReportSchema } from "@/report/schema";
import { withHistoricalEnterpriseValueSafety } from "@/report/enterpriseValueSafety";
import { reservedFixtureManifestEntry } from "@/providers/reservedSymbols";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportView } from "@/components/report/ReportView";

const endpoint = "derived:enterprise-values(balance×close×shares)";
const periodEnd = "2026-06-28";
function bundle(source: "computed" | "fmp" = "computed", debt = 13279e6) {
  const b = currencyBundle({ siblingQuarterCurrencies: ["USD", "USD", "USD", "USD"] });
  if (!b.statements.balanceQuarterly.ok) throw new Error("fixture missing");
  Object.assign(b.statements.balanceQuarterly.value.data.rows[0]!, { date: periodEnd, totalDebt: 15270e6 });
  b.enterpriseValues = { ok: true, value: { source, endpoint: source === "computed" ? endpoint : "enterprise-values", asOf: periodEnd, fetchedAt: b.builtAt,
    data: { rows: [{ date: periodEnd, enterpriseValue: 202457909347.53418 + debt - 4533e6, marketCapitalization: 202457909347.53418,
      addTotalDebt: debt, minusCashAndCashEquivalents: 4533e6 }], raw: {} } } };
  return b;
}
function report() {
  const r = loadTask28Fixture();
  r.marketData = buildMarketData(bundle("fmp"))!;
  delete r.marketData.enterpriseValueOrigin;
  r.appendix.sources.push({ provider: "computed", endpoint, asOf: periodEnd, fetchedAt: r.meta.generatedAt });
  r.balanceSheet.debtProfile.numbers = [{ value: 15270e6, unit: "currency", currency: "USD", asOf: periodEnd,
    source: "computed.current-capital.total-debt-including-leases", sourceId: "computed.current-capital.total-debt-including-leases", verified: true }];
  return r;
}

describe("audited output: internal historical EV carrying-debt operand", () => {
  it("withholds the exact obsolete QCOM13.279B internally derived operand without replacing its EV", () => {
    const b = bundle();
    const raw = JSON.stringify(b);
    const md = buildMarketData(b)!;
    expect(md.enterpriseValue).toBeNull();
    expect(md.enterpriseValueNote).toMatch(/debt.*(differ|reconcil)|unavailable/i);
    expect(JSON.stringify(b)).toBe(raw);
  });
  it("preserves true vendor EV and a reconciled internal historical EV", () => {
    expect(buildMarketData(bundle("fmp"))!.enterpriseValue?.value).toBe(211203909347.53418);
    expect(buildMarketData(bundle("computed", 15270e6))!.enterpriseValue?.value).toBe(213194909347.53418);
  });
  it.each(["totalDebt", "shortTermDebt", "longTermDebt", "financeLeaseLiability", "capitalLeaseObligations", "operatingLeaseLiability"])("withholds an internally derived EV whose same-date %s was explicitly refused", (field) => {
    const b = bundle("computed", 15270e6);
    if (!b.statements.balanceQuarterly.ok) throw new Error("fixture missing");
    b.statements.balanceQuarterly.value.data.rows[0]!.fieldConflicts = { [field]: { vendorValue: 15270e6, secValue: null, usable: false, reason: "incomplete debt" } };
    expect(buildMarketData(b)!.enterpriseValue).toBeNull();
  });
  it("suppresses an old stored computed row from all visible outputs using same-date verified debt, preserving its raw report", () => {
    const r = report();
    const raw = JSON.stringify(r);
    const body = JSON.stringify(consensusTables(r));
    expect(body).not.toContain("211.2");
    expect(body).toMatch(/withheld/i);
    expect(reportToMarkdown(r)).not.toContain("211.20B");
    expect(reportToPrintHtml(r)).not.toContain("211.20B");
    expect(reportToAuditMarkdown(r)).not.toContain("211203909347");
    expect(reportToAuditMarkdown(r)).toContain("debt operand differs");
    const web = renderToStaticMarkup(createElement(ReportView, { report: r }));
    expect(web).toContain("debt operand differs");
    expect(web).not.toContain("211.20B");
    expect(JSON.stringify(r)).toBe(raw);
  });
  it("never calls an unestablished legacy row a vendor definition", () => {
    const r = report();
    r.appendix.sources = [];
    expect(JSON.stringify(consensusTables(r))).not.toContain("vendor definition");
  });
  it("makes an immutable, idempotent, schema-valid JSON copy containing the explicit withholding reason", () => {
    const r = report();
    const original = JSON.stringify(r);
    const safe = withHistoricalEnterpriseValueSafety(r);
    expect(safe.marketData?.enterpriseValue).toBeNull();
    expect(safe.marketData?.enterpriseValueOrigin).toBe("computed");
    expect(safe.marketData?.enterpriseValueNote).toMatch(/debt operand differs/);
    expect(withHistoricalEnterpriseValueSafety(safe)).toBe(safe);
    expect(ReportSchema.safeParse(safe).success).toBe(true);
    expect(JSON.stringify(r)).toBe(original);
    expect(safe.meta).toBe(r.meta);
    expect(safe.valuation).toBe(r.valuation);
    expect(safe.scores).toBe(r.scores);
  });
  it("does not compare a different date or currency with a known computed historical bridge", () => {
    const r = report();
    for (const change of [{ asOf: "2026-03-31" }, { currency: "EUR" }, { verified: false }]) {
      const copy = structuredClone(r);
      Object.assign(copy.balanceSheet.debtProfile.numbers[0]!, change);
      expect(withHistoricalEnterpriseValueSafety(copy).marketData?.enterpriseValue?.value).toBe(r.marketData!.enterpriseValue!.value);
      expect(withHistoricalEnterpriseValueSafety(copy).marketData?.enterpriseValueNote).toBeUndefined();
    }
  });
  it("retains a reconciled prior-date bridge including positively established reported leases", () => {
    const b = bundle("computed", 35147e6);
    if (!b.statements.balanceQuarterly.ok) throw new Error("fixture missing");
    Object.assign(b.statements.balanceQuarterly.value.data.rows[0]!, { shortTermDebt: 7547e6, longTermDebt: 17312e6,
      capitalLeaseObligations: 10288e6, totalDebt: 35147e6 });
    expect(buildMarketData(b)?.enterpriseValueNote).toContain("plus the reported lease liabilities");
    expect(buildMarketData(b)?.enterpriseValue?.totalDebt).toBe(35147e6);
  });
});

describe("audited output: requested EDGAR member gaps with retained sources", () => {
  const gaps = [{ field: "edgar.tenKNotes(QCOM)", reason: "Annual notes could not be extracted", severity: "warn" as const },
    { field: "validation.xbrlCrossCheck", reason: "XBRL cross-check skipped", severity: "info" as const }];
  const sources = [{ provider: "edgar", endpoint: "10-Q notes", asOf: periodEnd, fetchedAt: "2026-10-16T00:00:00Z" }];
  it("labels partial coverage while retaining persisted missing, gap counts and provisional forensics", () => {
    const stored = buildDataCompleteness(gaps);
    const raw = JSON.stringify(stored);
    const c = deriveReportCompletenessPresentation(stored, gaps, sources);
    expect(c.edgar).toBe("partial");
    expect(dataStateText(c)).toContain("EDGAR partial");
    expect(c).toMatchObject({ warningCount: 1, xbrl: "skipped", forensicValidation: "provisional" });
    expect(c.statusText).toContain("EDGAR partial");
    expect(JSON.stringify(stored)).toBe(raw);
    expect(stored.edgar).toBe("missing");
  });
  it("retains missing without retained sources and unknown without confirmed metadata", () => {
    expect(deriveReportCompletenessPresentation(buildDataCompleteness(gaps), gaps, []).edgar).toBe("missing");
    expect(deriveReportCompletenessPresentation(undefined, gaps, sources).edgar).toBe("unknown");
    const fixtureGaps = [reservedFixtureManifestEntry("DEMO")];
    expect(deriveReportCompletenessPresentation(buildDataCompleteness(fixtureGaps), fixtureGaps, sources).edgar).toBe("missing");
  });
  it("uses the partial wording across report and audit exports without rewriting recorded metadata", () => {
    const r = loadTask28Fixture();
    r.appendix.missingData = gaps;
    r.appendix.sources = sources;
    r.meta.dataCompleteness = buildDataCompleteness(gaps);
    const raw = JSON.stringify(r);
    for (const render of [reportToMarkdown, reportToPrintHtml, reportToAuditMarkdown]) expect(render(r)).toContain("EDGAR partial");
    expect(JSON.stringify(r)).toBe(raw);
  });
});
