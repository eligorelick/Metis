import type { DiffReasonCode } from "./diff";

export const DIFF_REASON_LABELS: Record<DiffReasonCode, string> = {
  "invalid-entity": "A report entity identifier is invalid",
  "entity-mismatch": "Reports belong to different entities",
  "missing-from-report-version": "Source report pipeline version is missing",
  "missing-to-report-version": "Target report pipeline version is missing",
  "from-report-version-conflict":
    "Source report pipeline version conflicts with embedded metadata",
  "to-report-version-conflict":
    "Target report pipeline version conflicts with embedded metadata",
  "report-version-mismatch": "Report pipeline versions differ",
  "missing-from-spec-version": "Source persisted spec version is missing",
  "missing-to-spec-version": "Target persisted spec version is missing",
  "from-spec-metadata-conflict":
    "Source persisted spec version conflicts with embedded metadata",
  "to-spec-metadata-conflict":
    "Target persisted spec version conflicts with embedded metadata",
  "spec-version-mismatch": "Persisted report spec versions differ",
  "duplicate-driver-identity": "Duplicate score-driver identity",
  "duplicate-target-identity": "Duplicate scenario-target identity",
  "duplicate-projection-identity": "Duplicate projection identity",
  "projection-period-conflict": "Projection point period conflicts with its series",
  "unit-mismatch": "Units are not comparable",
  "currency-mismatch": "Currencies are not comparable",
  "period-mismatch": "Periods are not comparable",
};
