/**
 * The one parse step every saved-report reader starts from (P21: stored bytes
 * never change; P13: a definition used in several places is computed once).
 *
 * It sets aside the listed retired fields (D-216, `legacyRetiredFields.ts`),
 * then validates strictly, falling back to the lenient legacy read. The full
 * stored-report reader (`parseStoredReportWithSafety`) builds its view on this
 * step, and light checks that only need the stored record, such as whether a
 * job's report is data-only, use it directly so both agree on which saved
 * reports can be read. A report this step cannot read gives null.
 */
import { detachRetiredStoredFields, type RetiredStoredField } from "@/report/legacyRetiredFields";
import { ReportSchema, withLenientLegacyRead, type Report } from "@/report/schema";

export type StoredReportReadMode = "strict" | "legacy";

/** Validate a report with exactly the mode selected by its original stored read. */
export function validateStoredReportInReadMode(
  value: unknown,
  readMode: StoredReportReadMode,
): Report | null {
  const parsed = readMode === "strict"
    ? ReportSchema.safeParse(value)
    : withLenientLegacyRead(() => ReportSchema.safeParse(value));
  return parsed.success ? parsed.data : null;
}

export interface StoredReportRecord {
  /** The validated stored record, before any read-time view is applied. */
  report: Report;
  readMode: StoredReportReadMode;
  /** Retired fields set aside before validation, for the view to disclose. */
  retired: RetiredStoredField[];
}

/** Parse and validate one stored report JSON string; null when it cannot be read. */
export function readStoredReportRecord(reportJson: string | null): StoredReportRecord | null {
  if (reportJson === null) return null;
  try {
    // Listed retired fields (exact path, shape and writing builds) are set
    // aside and disclosed; any other unknown field still fails the read.
    const { raw, retired } = detachRetiredStoredFields(JSON.parse(reportJson));
    const strict = ReportSchema.safeParse(raw);
    const readMode: StoredReportReadMode = strict.success ? "strict" : "legacy";
    const report = strict.success ? strict.data : validateStoredReportInReadMode(raw, "legacy");
    return report === null ? null : { report, readMode, retired };
  } catch {
    return null;
  }
}
