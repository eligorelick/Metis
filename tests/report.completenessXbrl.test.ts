import { describe, expect, it } from "vitest";

import { buildDataCompleteness, deriveReportCompletenessPresentation } from "@/report/completeness";
import { dataStateText } from "@/report/presentation";
import type { ManifestEntry } from "@/types/core";

/**
 * `xbrl: "failed"` asserts the FMP↔XBRL cross-check RAN and disagreed. Stage A
 * distinguishes that from "could not run" by severity: a not-checkable period
 * files an `info` gap, a real disagreement files a `warn`. Classifying on prose
 * alone reported "failed" for reports that were simply never cross-checked.
 */
const gap = (over: Partial<ManifestEntry>): ManifestEntry => ({
  field: "validation.xbrlCrossCheck",
  reason: "something about xbrl",
  severity: "info",
  ...over,
});

describe("XBRL completeness classification", () => {
  it.each(["refused", "replaced"])("N3 says a revenue conflict was found and vendor revenue %s", action => {
    const gaps: ManifestEntry[] = [gap({reason:"FMP revenue missing/zero - cross-check not possible"}), {
      field: action === "refused" ? "statements.income.2025-12-31.revenue" : "statements.sourceSwitch.incomeAnnual.2025-12-31",
      severity: action === "refused" ? "warn" : "info",
      reason: action === "refused" ? "Income classification conflict for revenue: vendor 457211000, filed 506865000 USD" : "Vendor revenue 457211000 conflicts with filed 506865000 USD; whole SEC-built row replaced the vendor row",
    }];
    const completeness=buildDataCompleteness(gaps);
    expect(completeness.xbrl).toBe("failed");
    const p=deriveReportCompletenessPresentation(completeness,gaps);
    expect(dataStateText(p)).toContain(`XBRL conflict found; vendor revenue ${action}`);
    expect(dataStateText(p)).not.toContain("XBRL skipped");
  });
  it("reports checked when nothing is disclosed", () => {
    expect(buildDataCompleteness([]).xbrl).toBe("checked");
  });

  it("reports failed for a real FMP/XBRL disagreement", () => {
    const disagreement = gap({
      severity: "warn",
      reason:
        "FMP and XBRL disagree on revenue by 12% for FY 2025-12-31 (FMP 100, XBRL 88 via us-gaap:Revenues)",
    });

    expect(buildDataCompleteness([disagreement]).xbrl).toBe("failed");
  });

  it("reports skipped when no XBRL fact resolved for the period", () => {
    const notCheckable = gap({
      reason:
        "FMP↔XBRL revenue cross-check not checkable for Q 2025-09-30 — no XBRL fact resolved for that period",
    });

    expect(buildDataCompleteness([notCheckable]).xbrl).toBe("skipped");
  });

  it("reports skipped for a legacy report that records no cross-check", () => {
    const legacy = gap({
      field: "legacy.audit.xbrl",
      severity: "warn",
      reason: "No XBRL/company-facts cross-check is recorded for this persisted report",
    });

    expect(buildDataCompleteness([legacy]).xbrl).toBe("skipped");
  });

  it("reports skipped when companyfacts was unavailable", () => {
    const unavailable = gap({
      severity: "warn",
      reason: "FMP↔XBRL cross-check skipped — companyfacts unavailable (HTTP 403)",
    });

    expect(buildDataCompleteness([unavailable]).xbrl).toBe("skipped");
  });

  it("still marks forensic validation provisional whenever the check did not run", () => {
    const notCheckable = gap({ reason: "no XBRL fact matched period end=2025-12-31" });

    const out = buildDataCompleteness([notCheckable]);
    expect(out.xbrl).toBe("skipped");
    expect(out.forensicValidation).toBe("provisional");
  });
});
