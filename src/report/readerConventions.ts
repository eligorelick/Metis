/** Read-time copy only. Stored reports and their audit trail keep their original detail. */
import type { Report } from "@/report/schema";
import type { ReportAuditTable } from "@/report/auditTables";

const LENDER_PARAGRAPH = /Owner FCF, P\/FCF, FCF yield, FCF conversion\/growth and cash runway are not applicable:[\s\S]*?Source: https?:\/\/\S+\.(?=\s|$)/g;

export function isLenderConvention(text: string): boolean {
  return text.startsWith("Owner FCF, P/FCF, FCF yield, FCF conversion/growth and cash runway are not applicable:");
}

export function readerConventionText(text: string, context = ""): string {
  const metric = `${context} ${text.slice(0, text.indexOf("Owner FCF,"))}`;
  const reason = /grad|capital adequacy/i.test(metric)
    ? "Industrial leverage and coverage do not establish lender capital adequacy (see Lender conventions)."
    : /EV\/|enterpriseValue|enterprise value|multiplesBasis|debtProfile|debtBridge|computed\.capital\.current/i.test(metric)
      ? "Not applicable to a non-bank lender: loan funding is operating inventory finance (see Lender conventions)."
      : "Not applicable to a non-bank lender: owner cash flow is not established (see Lender conventions).";
  return text.replace(LENDER_PARAGRAPH, reason).replace(/\bdcf-suppressed\b/g, "cash-flow valuation unavailable");
}

/** The dedicated field is preferred; older reports may retain the paragraph only in a basis. */
export function lenderConventionExplanation(report: Report): string | null {
  const dedicated = report.filingDisclosures?.quarterlyGrossMarginNotApplicable;
  if (dedicated && isLenderConvention(dedicated)) return dedicated;
  const bases = [report.valuation.multiplesBasis, ...report.valuation.multiples.map(m => m.basis),
    ...report.balanceSheet.debtProfile.commentary.map(c => c.text)];
  for (const basis of bases) {
    const match = basis?.match(LENDER_PARAGRAPH)?.[0];
    if (match) return match;
  }
  return null;
}

export function lenderConventionTables(report: Report): ReportAuditTable[] {
  const explanation = lenderConventionExplanation(report);
  return explanation ? [{ heading: "Lender conventions", headers: [], rows: [], note: explanation }] : [];
}

/** Group raw base-unit amounts without touching dates, accessions, hashes or decimals. */
export function readerBaseUnits(text: string): string {
  return text.replace(/(?<![\w./:,\-])\d{7,9}(?![\w.,/:-])/g, (value: string, offset: number) =>
    /\b(?:seed|hash|fingerprint|accession|CIK)\s*[:=]?\s*$/i.test(text.slice(Math.max(0, offset - 30), offset))
      ? value : Number(value).toLocaleString("en-US"));
}

/** A refused input's retained evidence is useful even when there is no model output. */
export function unavailableModelInputTables(report: Pick<Report, "valuation" | "fairValue">): ReportAuditTable[] {
  const inputs = report.valuation.dcf.assumptions.filter(a => a.basis.trim());
  const rows = inputs.map(a => [a.name, a.value, readerBaseUnits(readerConventionText(a.basis, a.name))]);
  for (const reason of report.fairValue?.reasons ?? []) {
    if (isLenderConvention(reason.reason) || reason.reason.includes("(see Lender conventions)") || rows.some(row => row[2] === reason.reason)) continue;
    rows.push(["Valuation availability", "Unavailable", readerBaseUnits(readerConventionText(reason.reason))]);
  }
  return rows.length ? [{ heading: "Valuation input availability", headers: ["Input", "Recorded value", "Basis / limitation"], rows }] : [];
}

/** Keep claim and figure identities intact for the existing verification-mark index. */
export function withReaderConventions(report: Report): Report {
  function visit(value: unknown, path: string): unknown {
    if (typeof value === "string") {
      const text = readerConventionText(value, path);
      return /\.(?:note|basis|reason|oneLineWhy|definition|enterpriseValueNote|multiplesBasis)$|\.(?:notes|assumptions)\.\d+$/.test(path) ? readerBaseUnits(text) : text;
    }
    if (Array.isArray(value)) return value.map((v, i) => visit(v, `${path}.${i}`));
    if (!value || typeof value !== "object") return value;
    const obj = value as Record<string, unknown>;
    if (typeof obj.source === "string" && ("text" in obj || "value" in obj)) return value;
    return Object.fromEntries(Object.entries(obj).map(([key, child]) => [key,
      key === "appendix" || key === "quarterlyGrossMarginNotApplicable" ? child : visit(child, `${path}.${key}`)]));
  }
  const view = visit(report, "report") as Report;
  view.valuation = { ...view.valuation, multiples: view.valuation.multiples.map((m, i) => ({
    ...m, basis: report.valuation.multiples[i]?.basis === undefined ? undefined : readerConventionText(report.valuation.multiples[i]!.basis!, m.name),
  })) };
  if (report.valuation.multiplesBasis && lenderConventionExplanation(report)) {
    view.valuation.multiplesBasis = "Market enterprise value is context only for this non-bank lender; full bridge details are in the companion audit export (see Lender conventions).";
  }
  return view;
}

export function unavailableCashFlowModel(report: Pick<Report, "valuation" | "fairValue" | "projections">): boolean {
  return report.valuation.dcf.perShare === null && report.valuation.dcf.sensitivityGrid.length === 0 &&
    !report.valuation.dcf.forecastRows?.length && !report.valuation.dcf.excessReturnGrid &&
    report.valuation.reverseDcf.impliedValue === null &&
    (report.fairValue?.status === "suppressed" || report.projections?.series.length === 0);
}

export function cashFlowModelExplanation(report: Pick<Report, "filingDisclosures">): string {
  return report.filingDisclosures?.quarterlyGrossMarginNotApplicable
    ? "DCF, reverse DCF, scenario targets and weighted projections are unavailable because owner cash flow is not established for this non-bank lender (see Lender conventions)."
    : "DCF, reverse DCF, scenario targets and weighted projections are unavailable for this company's valuation route or retained inputs; no numerical forecast or scenario probability is implied.";
}

export function providerPeerListPresentation(report: Pick<Report, "competitive"> & Partial<Pick<Report, "valuation">>): { heading: string; note?: string } {
  const coverage = report.valuation?.peerCoverage;
  const listed = report.competitive.peerTable;
  const excluded = listed.length > 0 && coverage && listed.every(p => p.symbol &&
    !coverage.eligible.includes(p.symbol) && coverage.exclusions.some(e => e.symbol === p.symbol));
  return excluded ? { heading: "Provider peer list", note: "The provider's list is shown for scale only; these issuers were excluded by the comparable screen and are not used as comparables." } : { heading: "Peer table" };
}
