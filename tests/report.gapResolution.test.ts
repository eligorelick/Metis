import { describe, expect, it } from "vitest";
import { classifyManifest } from "@/report/completeness";
import { isAcquisitionResolution, resolveAcquisitionGaps } from "@/report/gapResolution";
import { ManifestEntrySchema } from "@/report/schema";
import type { FmpBalanceSheetRow, StatementFieldProvenance } from "@/providers/fmp";
import type { StatementSet } from "@/pipeline/types";
import type { ManifestEntry } from "@/types/core";

const end = "2026-06-30", observedAt = "2026-10-18T00:00:00Z";
const note = "filing:debt-note:carrying-reconciliation";
function row(): FmpBalanceSheetRow {
  const values = { shortTermDebt: 20, longTermDebt: 80, totalDebt: 130, netDebt: 80, capitalLeaseObligations: 30,
    operatingLeaseLiability: 20, financeLeaseLiability: 10, cashAndCashEquivalents: 50, totalAssets: 300,
    totalLiabilities: 200, totalStockholdersEquity: 90, temporaryEquityAttributableToParent: 10 };
  return { date: end, cik: "1234567", reportedCurrency: "USD", ...values,
    fieldProvenance: Object.fromEntries(Object.keys(values).map(field => [field, { source: "edgar", unit: "USD", periodStart: null,
      periodEnd: end, observedAt, tags: [field.includes("Debt") ? note : field === "temporaryEquityAttributableToParent" ? "us-gaap/TemporaryEquityCarryingAmountAttributableToParent" : `us-gaap/${field}`],
      filings: [{ accn: "0001234567-26-000001", filed: "2026-08-01", form: "10-Q" }] } satisfies StatementFieldProvenance])) };
}
function statements(rows: FmpBalanceSheetRow[], annual: FmpBalanceSheetRow[] = []): Pick<StatementSet, "balanceAnnual" | "balanceQuarterly"> {
  const result = (rows: FmpBalanceSheetRow[]) => ({ ok: true as const, value: { source: "edgar" as const, endpoint: "test:synthetic", asOf: end,
    fetchedAt: observedAt, data: { rows, raw: rows } } });
  return { balanceAnnual: result(annual), balanceQuarterly: result(rows) };
}
const debtGap = (field = "totalDebt", periods = end): ManifestEntry => ({ field: `keyless.balanceQuarterly.withheld.${field}`, severity: "warn",
  reason: `incomplete debt carrying value: debt maturity scope unresolved: unsupported fiscal bucket (periods: ${periods})`, attemptedSources: ["edgar:companyfacts"] });
const temporaryGap = (): ManifestEntry => ({ field: `statements.balance.${end}.temporaryEquityAttributableToParent`, severity: "warn",
  reason: "temporary-equity SEC enrichment withheld: vendor A/L/permanent-equity operands are missing, conflicting, or do not match the temporary category's exact SEC filing scope" });
const resolve = (gaps: ManifestEntry[], rows: FmpBalanceSheetRow[] = [row()], annual: FmpBalanceSheetRow[] = []) => resolveAcquisitionGaps(gaps, statements(rows, annual), "1234567", observedAt);

describe("resolved acquisition attempts", () => {
  it("preserves the failed attempt while removing its resolved field from final gaps", () => {
    const gap = { field: "keyless.balanceQuarterly.withheld.totalDebt", severity: "warn", reason: "incomplete debt carrying value: debt maturity scope unresolved: unsupported fiscal bucket (periods: 2026-06-30)",
      resolution: { status: "resolved", method: "same-filing-debt-note", reason: "Exact final carrying field admitted from a same-filing debt note.",
        evidence: [{ scope: "balanceQuarterly", field: "totalDebt", period: "2026-06-30", currency: "USD", cik: "1234567", value: 130,
          observedAt: "2026-10-18T00:00:00Z", tags: ["filing:debt-note:carrying-reconciliation"], filings: [{ accn: "0001234567-26-000001", filed: "2026-08-01", form: "10-Q" }] }] } } as ManifestEntry;
    const classified = classifyManifest([gap]);
    expect(classified.dataGaps).toEqual([]);
    expect(classified.downgraded).toEqual([expect.objectContaining({ severity: "info", recordedSeverity: "warn", fields: [gap.field], reason: gap.reason, downgrade: gap.resolution!.reason })]);
    expect(gap.severity).toBe("warn");
  });

  it("resolves each exact debt field without mutating its source attempt", () => {
    const gaps = [debtGap("shortTermDebt"), debtGap("totalDebt"), debtGap("netDebt")];
    const original = JSON.stringify(gaps), rows = [row()], rawRows = JSON.stringify(rows);
    const resolved = resolve(gaps, rows);
    expect(resolved.every(gap => gap.resolution?.method === "same-filing-debt-note")).toBe(true);
    for (const gap of resolved) expect(ManifestEntrySchema.safeParse(gap).success).toBe(true);
    expect(classifyManifest(resolved).dataGaps).toEqual([]);
    expect(JSON.stringify(gaps)).toBe(original);
    expect(JSON.stringify(rows)).toBe(rawRows);
  });

  it("uses established same-filing aggregate evidence naming both observed lease classes", () => {
    const admitted = row();
    delete admitted.fieldProvenance!.operatingLeaseLiability;
    delete admitted.fieldProvenance!.financeLeaseLiability;
    admitted.fieldProvenance!.capitalLeaseObligations!.tags = ["us-gaap/OperatingLeaseLiability", "us-gaap/FinanceLeaseLiability"];
    expect(resolve([debtGap()], [admitted])[0]!.resolution).toBeDefined();
  });

  it.each(["missing", "nonfinite", "conflict", "date", "currency", "issuer", "filing", "future", "unknown leases", "lease arithmetic", "debt arithmetic", "unproved cash"])("keeps a debt refusal active for %s evidence", kind => {
    const bad = row();
    if (kind === "missing") bad.totalDebt = undefined;
    if (kind === "nonfinite") bad.totalDebt = Number.NaN;
    if (kind === "conflict") bad.fieldConflicts = { totalDebt: { usable: false, vendorValue: 1, secValue: 2, reason: "unresolved" } };
    if (kind === "date") bad.fieldProvenance!.totalDebt!.periodEnd = "2026-03-31";
    if (kind === "currency") bad.fieldProvenance!.totalDebt!.unit = "EUR";
    if (kind === "issuer") bad.cik = "7654321";
    if (kind === "filing") bad.fieldProvenance!.financeLeaseLiability!.filings[0]!.accn = "0001234567-26-000002";
    if (kind === "future") bad.fieldProvenance!.totalDebt!.observedAt = "2026-10-19T00:00:00Z";
    if (kind === "unknown leases") { bad.financeLeaseLiability = 0; delete bad.fieldProvenance!.financeLeaseLiability; }
    if (kind === "lease arithmetic") bad.capitalLeaseObligations = 31;
    if (kind === "debt arithmetic") bad.totalDebt = 131;
    if (kind === "unproved cash") delete bad.fieldProvenance!.cashAndCashEquivalents;
    expect(resolve([debtGap(kind === "unproved cash" ? "netDebt" : "totalDebt")], [bad])[0]!.resolution).toBeUndefined();
  });

  it("requires every refused date and the precise statement scope", () => {
    expect(resolve([debtGap("totalDebt", `${end}, 2026-03-31`)])[0]!.resolution).toBeUndefined();
    expect(resolve([debtGap()], [], [row()])[0]!.resolution).toBeUndefined();
    expect(resolve([debtGap()], [row(), row()])[0]!.resolution).toBeUndefined();
  });

  it("does not resolve arbitrary errors, conflicts, covenant warnings or unrecognized fields", () => {
    for (const changed of [ { field: "edgar.companyFacts" }, { field: "keyless.balanceQuarterly.withheld.covenants" }, { reason: "vendor conflict (periods: 2026-06-30)" }, { severity: "critical" as const } ]) {
      expect(resolve([{ ...debtGap(), ...changed }])[0]!.resolution).toBeUndefined();
    }
  });

  it("resolves only the retained temporary category while absent aggregate/NCI remain gaps", () => {
    const parent = temporaryGap();
    const missing = [ { ...parent, field: `statements.balance.${end}.temporaryEquity` },
      { ...parent, field: `statements.balance.${end}.temporaryEquityAttributableToNoncontrollingInterest` } ];
    const resolved = resolve([parent, ...missing]);
    expect(resolved[0]!.resolution?.method).toBe("retained-sec-category");
    expect(resolved.slice(1).every(gap => gap.resolution === undefined)).toBe(true);
    expect(classifyManifest(resolved).dataGaps).toHaveLength(2);
  });

  it("requires every retained scope for temporary category warnings and real sourced zero", () => {
    const bad = row(); bad.temporaryEquityAttributableToParent = 0; delete bad.fieldProvenance!.temporaryEquityAttributableToParent;
    expect(resolve([temporaryGap()], [row()], [bad])[0]!.resolution).toBeUndefined();
    const zero = row(); zero.temporaryEquityAttributableToParent = 0;
    expect(resolve([temporaryGap()], [zero])[0]!.resolution).toBeDefined();
    const missing = row(); delete missing.fieldProvenance!.temporaryEquityAttributableToParent;
    expect(resolve([temporaryGap()], [missing])[0]!.resolution).toBeUndefined();
  });

  it.each([12, 10 + 1e-10])("keeps a shared temporary-category warning unresolved when annual amount %s differs from quarterly 10", value => {
    const annual = row(); annual.temporaryEquityAttributableToParent = value;
    const gap = resolve([temporaryGap()], [row()], [annual])[0]!;
    expect(gap.resolution).toBeUndefined();
    expect(classifyManifest([gap]).dataGaps).toHaveLength(1);
  });

  it.each([12, 10 + 1e-10])("does not accept conflicting persisted same-period value %s alongside 10", value => {
    const gap = resolve([temporaryGap()], [row()], [row()])[0]!;
    gap.resolution!.evidence[1]!.value = value;
    expect(classifyManifest([gap]).dataGaps).toHaveLength(1);
    expect(classifyManifest([gap]).downgraded).toEqual([]);
  });

  it("accepts equal annual/quarterly category amounts with independently filed provenance", () => {
    const annual = row();
    annual.fieldProvenance!.temporaryEquityAttributableToParent!.filings[0]!.accn = "0001234567-26-000002";
    const gap = resolve([temporaryGap()], [row()], [annual])[0]!;
    expect(gap.resolution!.evidence.map(proof => proof.value)).toEqual([10, 10]);
    expect(classifyManifest([gap]).dataGaps).toEqual([]);
  });

  it("does not compare values belonging to different reported periods", () => {
    const prior = row(); prior.date = "2026-03-31";
    for (const [field, proof] of Object.entries(prior.fieldProvenance!)) {
      proof.periodEnd = prior.date;
      if (typeof prior[field] === "number") prior[field] = (prior[field] as number) * 2;
    }
    const gap = resolve([debtGap("totalDebt", `${end}, ${prior.date}`)], [row(), prior])[0]!;
    expect(gap.resolution!.evidence.map(proof => proof.value)).toEqual([130, 260]);
    expect(classifyManifest([gap]).dataGaps).toEqual([]);
  });

  it("distinguishes retained exact category evidence from a correctly refused same-filing supplement", () => {
    const retained = row();
    retained.fieldProvenance!.temporaryEquityAttributableToParent!.filings[0]!.accn = "0001234567-26-000002";
    expect(resolve([temporaryGap()], [retained])[0]!.resolution?.reason).toContain("retained SEC category");
    retained.fieldProvenance!.temporaryEquityAttributableToParent!.tags = ["us-gaap/PreferredStockValue"];
    expect(resolve([temporaryGap()], [retained])[0]!.resolution).toBeUndefined();
  });

  it("compares availability by UTC day while preserving the source timestamp", () => {
    const retained = row();
    retained.fieldProvenance!.temporaryEquityAttributableToParent!.observedAt = "2026-10-19T00:30:00+02:00";
    const admitted = resolve([temporaryGap()], [retained])[0]!;
    expect(admitted.resolution).toBeDefined();
    expect(admitted.resolution!.evidence[0]!.observedAt).toBe("2026-10-19T00:30:00+02:00");
    expect(ManifestEntrySchema.safeParse(admitted).success).toBe(true);
    retained.fieldProvenance!.temporaryEquityAttributableToParent!.observedAt = "2026-10-18T23:30:00-02:00";
    expect(resolve([temporaryGap()], [retained])[0]!.resolution).toBeUndefined();
  });

  it.each([
    "2026-10-18", "2026-10-18T00:00:00", "2026-10-18T00:00:00+0000", "2026-09-31T00:00:00Z",
    "2026-10-18T24:00:00Z", "2026-10-18T00:60:00Z", "2026-10-18T00:00:60Z", "2026-10-18T00:00:00+24:00",
    "2026-10-18T00:00:00+00:60", "2026-10-18t00:00:00z", "not-a-timestamp",
  ])("rejects invalid source timestamp consistently at producer/runtime/schema: %s", timestamp => {
    const malformed = row();
    malformed.fieldProvenance!.temporaryEquityAttributableToParent!.observedAt = timestamp;
    const produced = resolveAcquisitionGaps([temporaryGap()], statements([malformed]), "1234567", "2026-12-31T00:00:00Z")[0]!;
    expect(produced.resolution).toBeUndefined();
    const persisted = resolve([temporaryGap()])[0]!;
    persisted.resolution!.evidence[0]!.observedAt = timestamp;
    expect(isAcquisitionResolution(persisted.resolution)).toBe(false);
    expect(ManifestEntrySchema.safeParse(persisted).success).toBe(false);
    expect(classifyManifest([persisted]).dataGaps).toHaveLength(1);
  });

  it.each(["2026-10-18", "2026-10-18T00:00:00", "2026-10-31T24:00:00Z", "2026-11-31T00:00:00Z"])("rejects an invalid reconciliation cutoff: %s", cutoff => {
    expect(resolveAcquisitionGaps([temporaryGap()], statements([row()]), "1234567", cutoff)[0]!.resolution).toBeUndefined();
  });

  it.each(["2026-10-18T00:00Z", "2026-10-18T00:00:00.123456Z", "2026-10-19T00:30:00+02:00"])("preserves a valid zoned source timestamp across producer/runtime/schema: %s", timestamp => {
    const retained = row();
    retained.fieldProvenance!.temporaryEquityAttributableToParent!.observedAt = timestamp;
    const produced = resolve([temporaryGap()], [retained])[0]!;
    expect(produced.resolution!.evidence[0]!.observedAt).toBe(timestamp);
    expect(isAcquisitionResolution(produced.resolution)).toBe(true);
    expect(ManifestEntrySchema.safeParse(produced).success).toBe(true);
  });

  it("drops stale resolution metadata if final evidence no longer admits the field", () => {
    const resolved = resolve([debtGap()]);
    expect(resolve(resolved, [])[0]!.resolution).toBeUndefined();
  });

  it("rejects mismatched persisted resolution annotations", () => {
    const resolved = resolve([debtGap()])[0]!;
    for (const changed of [{ field: "netDebt" }, { period: "2026-03-31" }, { scope: "balanceAnnual" as const }, { tags: ["unrelated"] }]) {
      const altered = structuredClone(resolved); Object.assign(altered.resolution!.evidence[0]!, changed);
      expect(classifyManifest([altered]).dataGaps).toHaveLength(1);
    }
  });

  it.each([null, false, 42, "resolved", {}, { status: "resolved", method: "same-filing-debt-note", reason: "bad", evidence: null },
    { status: "resolved", method: "same-filing-debt-note", reason: "bad", evidence: {} }])("fails closed for malformed persisted resolution %j", resolution => {
    const bad = { ...debtGap(), resolution } as unknown as ManifestEntry;
    expect(() => classifyManifest([bad])).not.toThrow();
    expect(classifyManifest([bad]).dataGaps).toHaveLength(1);
  });

  it("runtime-validates every nested proof before consuming raw API metadata", () => {
    const resolved = resolve([debtGap()])[0]!.resolution!;
    expect(isAcquisitionResolution(resolved)).toBe(true);
    for (const altered of [ { tags: null }, { filings: [null] }, { currency: null }, { period: 42 }, { observedAt: null }, { filings: [] }, { tags: [1] } ]) {
      const bad = structuredClone(resolved); Object.assign(bad.evidence[0]!, altered);
      expect(isAcquisitionResolution(bad)).toBe(false);
      expect(() => classifyManifest([{ ...debtGap(), resolution: bad }])).not.toThrow();
      expect(classifyManifest([{ ...debtGap(), resolution: bad }]).dataGaps).toHaveLength(1);
    }
  });
});
