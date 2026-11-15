/** Read-time copy only. Stored reports and their audit trail keep their original detail. */
import type { Report } from "@/report/schema";
import { BUSINESS_STORY_HEADING } from "@/report/schema";
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
  return text.replace(LENDER_PARAGRAPH, reason).replace(/\bdcf-suppressed\b/g, "cash-flow valuation unavailable")
    // "Provider enterprise value not applicable: Not applicable to a non-bank
    // lender: ..." states the reason once (pre-run re-render of the FIGR report).
    .replace(/\bnot applicable:\s+Not applicable to a non-bank lender:/g, "not applicable to a non-bank lender:");
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

/**
 * An identifier, never an amount, by the words just before it: a hash, seed, fingerprint or accession; a CIK (also
 * "CIK number"/"CIK no."); a version; an id, number or "no."/"#" reference (file, account, registration, serial,
 * document, reference or filing number). D-308 review round 1 (P22).
 */
export const IDENTIFIER_CONTEXT = /(?:\b(?:seed|hash|fingerprint|accession|version|ver\.|v\.|id|ids|identifier|serial)|\bCIK(?:\s+(?:number|no\.?))?|\b(?:file|account|registration|serial|document|reference|filing|form|case|order|invoice|CUSIP|ISIN)\s+(?:number|no\.?)|\bno\.|#)\s*[:=]?\s*$/i;

/** D-312 review (P19/P22): an FX operand or a stated native observation keeps
 * its recorded digits. All reader number formatters use this same boundary. */
export function isStoredRateValue(text: string, offset: number, length: number): boolean {
  const before = text.slice(Math.max(0, offset - 60), offset);
  const after = text.slice(offset + length);
  return /\bnative value\s*[:=]?\s*(?:[A-Z]{3}\s+)?[+−]?$/i.test(before)
    || /^(?:[eE][+-]?\d+)?\s+[A-Z]{3}\s+per\s+[A-Z]{3}\b/.test(after)
    || (/\b[A-Z]{3}\s+$/.test(before) && /^(?:[eE][+-]?\d+)?\s+per\s+[A-Z]{3}\b/.test(after));
}

/** An 8-digit basic date (YYYYMMDD, 19xx or 20xx, a real calendar day) is a date, not an amount. */
function basicDate(digits: string): boolean {
  const m = /^(19|20)(\d\d)(\d\d)(\d\d)$/.exec(digits);
  if (!m) return false;
  const [year, month, day] = [Number(m[1]! + m[2]!), Number(m[3]), Number(m[4])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * Group raw base-unit amounts (seven or more whole digits) in CODE-WRITTEN reader text, without touching dates,
 * accessions, hashes or identifiers. D-308 (P22): an amount with cents ("31234567890.12", "2208355468.988709 ADS") and
 * an amount that ends a sentence ("SBC of 270000000.") or a clause ("31234567890.12, UNADJUSTED") are grouped too, at
 * most two decimals, the exact-amount format the reported-FCF sentence already prints ("-1,234,000,000"). Text only:
 * no stored number changes. Never applied to model-written prose, quotes or claims, which are shown as written
 * (review round 1). A leading-zero run, an 8-digit basic date and a number after an identifier word are left alone.
 */
export function readerBaseUnits(text: string): string {
  return text.replace(/(?<![\w./:,\-])-?(?!0\d)\d{7,15}(?:\.\d+)?(?![\w/:-]|[.,]\d)/g, (value: string, offset: number) => {
    if (isStoredRateValue(text, offset, value.length)) return value;
    const digits = value.replace(/^-/, "");
    if (IDENTIFIER_CONTEXT.test(text.slice(Math.max(0, offset - 40), offset))) return value;
    if (!digits.includes(".") && basicDate(digits)) return value;
    return Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 });
  });
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

/**
 * D-308 review round 2: a grade block's one-line reason and interpretation (a section's `graded`, the moat block, the
 * grade strip) can be written by the AI, so the reader view never groups them. Display groups them only when no
 * model-prose mark is attached (a data-only report's code-written grade text).
 */
const AI_WRITTEN_GRADE_PROSE = /\.(?:graded|moatGraded|gradeStrip\.[A-Za-z]+)\.(?:oneLineWhy|interpretation)$/;

/** Keep claim and figure identities intact for the existing verification-mark index. */
export function withReaderConventions(report: Report): Report {
  function visit(value: unknown, path: string): unknown {
    if (typeof value === "string") {
      const text = readerConventionText(value, path);
      // D-308 sweep: basis lists (fair value, scenario targets), the scenario interpretation, a signal's fallback
      // reason and period cell, and a grade qualification's detail carry the same producer amounts as the fields
      // already listed. Traced figures are returned unchanged above, so their periods and identities are untouched.
      // Review round 1: code-written fields only; a grade line (oneLineWhy) can be model-written and is shown as written.
      if (AI_WRITTEN_GRADE_PROSE.test(path)) return text;
      return /\.(?:note|basis|reason|definition|enterpriseValueNote|multiplesBasis|interpretation|fallbackReason|ownHistoryBasis|earningsCaveat|detail|period)$|\.(?:notes|assumptions|basis)\.\d+$/.test(path) ? readerBaseUnits(text) : text;
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
    ...m, basis: report.valuation.multiples[i]?.basis === undefined ? undefined : readerBaseUnits(readerConventionText(report.valuation.multiples[i]!.basis!, m.name)),
  })) };
  if (report.valuation.multiplesBasis && lenderConventionExplanation(report)) {
    view.valuation.multiplesBasis = "Market enterprise value is context only for this non-bank lender; full bridge details are in the companion audit export (see Lender conventions).";
  }
  return view;
}

export function unavailableCashFlowModel(report: Pick<Report, "valuation" | "fairValue" | "projections">): boolean {
  if (report.fairValue?.auditValue || report.fairValue?.reference) return false;
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

export function providerPeerListPresentation(report: Pick<Report, "competitive"> & Partial<Pick<Report, "valuation" | "meta">>): { heading: string; note?: string; hideTable?: boolean } {
  const coverage = report.valuation?.peerCoverage;
  // A subject row or incomplete model-authored peer rows cannot override the
  // pipeline's comparable screen. With no screen recorded, preserve old tables.
  if (coverage && coverage.candidates > 0 && coverage.eligible.length === 0) {
    // Only point at a competitor discussion the report actually carries. D-271:
    // competitors by product line render in the business section's group.
    const discussed = (report.competitive.competitors?.length ?? 0) > 0;
    const byLine = (report.competitive.competitorsByProductLine ?? []).some(item => item.claims.length > 0);
    const byLineText = `competitors by product line are under ${BUSINESS_STORY_HEADING} in the Business section`;
    const pointer = discussed && byLine ? `; competitors are discussed in this section, and ${byLineText}`
      : discussed ? "; competitors are discussed in this section" : byLine ? `; ${byLineText}` : "";
    return { heading: "Peer table", hideTable: true,
      note: `The data provider's peer list contained no comparable companies${pointer}.` };
  }
  if (report.competitive.peerTable.length === 0 && coverage && (coverage.evaluated > 0 || coverage.eligible.length > 0)) {
    return { heading: "Peer table", hideTable: true,
      note: `No analyst peer comparison table was recorded. The deterministic screen evaluated ${coverage.evaluated} issuers; eligible: ${coverage.eligible.join(", ") || "none"}. Per-metric availability and exclusions are shown under Peer comparison coverage and in the audit export.` };
  }
  // Some peers passed the screen, but every listed row is an excluded issuer
  // (the subject's own row aside): the rows stay, captioned as scale only.
  const subject = report.meta?.symbol?.toUpperCase();
  const listed = report.competitive.peerTable.filter(p => !(subject && p.symbol?.toUpperCase() === subject));
  const allListedExcluded = listed.length > 0 && coverage && listed.every(p => p.symbol &&
    !coverage.eligible.includes(p.symbol) && coverage.exclusions.some(e => e.symbol === p.symbol));
  return allListedExcluded
    ? { heading: "Provider peer list", note: "The provider's list is shown for scale only; these issuers were excluded by the comparable screen and are not used as comparables." }
    : { heading: "Peer table" };
}

/** Provider roster facts do not establish an executive assessment or governance conclusion. */
export function leadershipRosterPresentation(leadership: Report["leadership"]) {
  const isRosterFact = (claim: Report["leadership"]["governanceNotes"][number]) => claim.source === "fmp:key-executives" && claim.label === "FACT";
  return {
    roster: leadership.governanceNotes.filter(isRosterFact),
    governance: leadership.governanceNotes.filter(claim => !isRosterFact(claim)),
  };
}
