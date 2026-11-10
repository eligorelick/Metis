/**
 * The one ordered chain of read-time readers every saved-report surface
 * applies (P21: corrections are read-time views, stored bytes never change;
 * P13: a definition used in several places is computed once).
 *
 * The stored-report parser, the app view and the Markdown, print and audit
 * exports all read a saved report through this chain. The order is part of
 * the contract: each reader sees the output of the one before it. Steps a
 * single surface adds (presenters, grade contracts, reader conventions) stay
 * at that surface.
 */
import type { Report } from "@/report/schema";
import { withPrincipalSummarySafety } from "@/report/principalAggregationSafety";
import { withHistoricalEnterpriseValueSafety } from "@/report/enterpriseValueSafety";
import { withLegacyPayloadRecordSafety } from "@/report/legacyPayloadRecordSafety";
import { withLegacyEdgarDerivedLines } from "@/report/legacyEdgarDerivedLines";
import { withLegacyBridgeMethod } from "@/report/legacyBridgeMethod";
import { withLegacyValuationNotes } from "@/report/legacyValuationNotes";
import { withLegacyImpliedReturnShareBasis } from "@/report/legacyImpliedReturnShareBasis";
import { withLegacyScopeQualifications } from "@/report/legacyScopeQualifications";
import { withValuationUseSafety } from "@/report/valuationUseSafety";

/** The readers {@link withStoredReportView} applies, first to last. */
export const STORED_REPORT_VIEW_READERS = [
  withPrincipalSummarySafety,
  withHistoricalEnterpriseValueSafety,
  withLegacyPayloadRecordSafety,
  withLegacyEdgarDerivedLines,
  withLegacyBridgeMethod,
  withLegacyValuationNotes,
  withLegacyImpliedReturnShareBasis,
  withLegacyScopeQualifications,
] as const;

/**
 * Apply the shared saved-report readers in their fixed order. It does not
 * apply {@link withValuationUseSafety}: the app view runs its own presenters
 * between this chain and that step.
 */
export function withStoredReportView(report: Report): Report {
  return withLegacyScopeQualifications(withLegacyImpliedReturnShareBasis(withLegacyValuationNotes(withLegacyBridgeMethod(withLegacyEdgarDerivedLines(withLegacyPayloadRecordSafety(withHistoricalEnterpriseValueSafety(withPrincipalSummarySafety(report))))))));
}

/**
 * {@link withStoredReportView} followed directly by the current-use valuation
 * check, as the stored-report parser and the Markdown, print and audit exports
 * apply it.
 */
export function withSafeStoredReportView(report: Report): Report {
  return withValuationUseSafety(withStoredReportView(report));
}
