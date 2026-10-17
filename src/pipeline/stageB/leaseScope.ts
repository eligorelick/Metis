/** Retained rows can predate the parser's requirement for both lease maturities. */
export interface LeaseScopeRow {
  operatingLeaseLiability?: number | null;
  financeLeaseLiability?: number | null;
  capitalLeaseObligations?: number | null;
  fieldProvenance?: Record<string, { tags: string[] }>;
}
type Portion = "current" | "noncurrent";
export function incompleteLeaseCoverage(row: LeaseScopeRow | null | undefined): { operating: Portion | null; finance: Portion | null; note: string } | null {
  if (!row) return null;
  const portion = (field: "operatingLeaseLiability" | "financeLeaseLiability", prefix: "Operating" | "Finance"): Portion | null => {
    // Older adapters copied the summed lease field to its operating slice
    // without copying provenance. Its equal-value source still identifies
    // the partial maturity; equality alone never establishes a missing part.
    const own = row.fieldProvenance?.[field]?.tags;
    const tags = own ?? (row[field] != null && row[field] === row.capitalLeaseObligations ? row.fieldProvenance?.capitalLeaseObligations?.tags : undefined) ?? [];
    const current = tags.includes(`us-gaap/${prefix}LeaseLiabilityCurrent`);
    const noncurrent = tags.includes(`us-gaap/${prefix}LeaseLiabilityNoncurrent`);
    const total = tags.includes(`us-gaap/${prefix}LeaseLiability`) || (prefix === "Finance" && tags.includes("us-gaap/CapitalLeaseObligations"));
    if (total || current === noncurrent) return null;
    return current ? "current" : "noncurrent";
  };
  const operating = portion("operatingLeaseLiability", "Operating");
  const finance = portion("financeLeaseLiability", "Finance");
  if (operating === null && finance === null) return null;
  const details = ([ ["Operating", operating], ["Finance", finance] ] as const).flatMap(([kind, maturity]) => maturity === null ? [] :
    [`${kind} lease liability is ${maturity} only; the ${maturity === "noncurrent" ? "current" : "noncurrent"} portion is unverified`]);
  return { operating, finance, note: `${details.join(". ")}. Retained lease operands establish only the disclosed maturity; a complete lease-inclusive debt or net-debt total is unavailable. No earlier period's missing maturity is imported. The lease-excluded convention continues to remove the disclosed operating-lease portion already embedded in retained debt; this does not establish full lease coverage.` };
}
