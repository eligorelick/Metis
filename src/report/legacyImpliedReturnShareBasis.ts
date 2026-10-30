import type { Report } from "@/report/schema";
import { specVersionBefore } from "@/report/legacyPayloadRecordSafety";

// D-137 / FIN-506: frozen B6 cutoff, independent of B5a's parallel annualization changes.
export const IMPLIED_RETURN_SHARE_BASIS_SPEC = "1.52.0";
export const IMPLIED_RETURN_SHARE_BASIS_FIELD = "presentation.legacyValuation.impliedReturnShareBasis";

/** A view-only disclosure: preserve every stored valuation, score and audit field. */
export function withLegacyImpliedReturnShareBasis(report: Report): Report {
  if (!specVersionBefore(report.meta.specVersion, IMPLIED_RETURN_SHARE_BASIS_SPEC) ||
    !report.scores?.aspects.valuation.drivers.some(d => d.source === "computed.scores.valuation.roeImpliedVsAchievable") ||
    report.appendix.missingData.some(g => g.field === IMPLIED_RETURN_SHARE_BASIS_FIELD)) return report;
  const reason = `Built before spec ${IMPLIED_RETURN_SHARE_BASIS_SPEC}: the implied starting return behind this valuation signal ` +
    "was not solved on the share count the value per share divides by (the price times the diluted shares). " +
    "Where buybacks or dilution separate that count from the one behind the market cap, the implied return is off by roughly " +
    "0.3pp per 1% gap at the price-to-book ratios tested: too low when the diluted count is the larger, too high when it is the smaller. " +
    "Stored figures and scores are unchanged.";
  return { ...report, appendix: { ...report.appendix, missingData: [
    ...report.appendix.missingData, { field: IMPLIED_RETURN_SHARE_BASIS_FIELD, reason, severity: "info", expected: true },
  ] } };
}
