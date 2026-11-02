import { CORE_FACT_FORMS, parseFactPoints, type CompanyFacts } from "@/edgar/xbrl";
import type { ManifestEntry } from "@/types/core";
import { millions } from "@/pipeline/stageB/netDebt";

export interface ConvertibleInstrument {
  kind: "notes" | "preferred";
  conversionShares: number;
  claim: number | null;
  settlement: "full-shares" | "net-share" | "unknown";
  conversionPrice: number | null;
  period: { start: string; end: string };
  basis: string;
}
export interface ConvertibleReading {
  kind: "notes" | "preferred";
  conversionShares: number;
  claim: number | null;
  reading: "claim" | "converted" | "net-share" | "unresolved";
  /** Actual adjustments, retained for EPS and every downstream disclosure. */
  sharesRemoved: number;
  restored: number;
  basis: string;
}
const days = (a: string, b: string) => (Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86400000;
const preferredTag = "ConvertiblePreferredStockNonredeemableOrRedeemableIssuerOptionValue";
export function convertibleInstrumentsAt(facts: CompanyFacts | null | undefined,
  divisor: { end: string; basis: "quarter" | "annual" }, bridgeDate: string, unit: string, observedAt: string,
  bridge: { permanentPreferred: number | null; totalDebt: number | null }) {
  const gaps: ManifestEntry[] = [];
  const points = (tag: string, u = unit) => {
    const concept = facts?.facts["us-gaap"]?.[tag] as { units?: Record<string, unknown[]> } | undefined;
    return parseFactPoints(concept?.units?.[u] ?? []).filter(p => CORE_FACT_FORMS.has(p.form) && p.filed <= observedAt.slice(0, 10)
      && !p.dimensions && !p.segment && Number.isFinite(p.val)).sort((a, b) => b.filed.localeCompare(a.filed));
  };
  const at = (tag: string) => points(tag).find(p => !p.start && p.end === bridgeDate)?.val ?? null;
  const first = (tags: string[]) => tags.map(at).find(v => v !== null) ?? null;
  const convertiblePreferredClaim = at(preferredTag);
  // An independently filed inclusive carrying total equal to the two series establishes a sum.
  // Names in free text and equal-looking par values do not establish separate series.
  const permanent = bridge.permanentPreferred ?? 0;
  const preferredSeriesDistinct = permanent > 0 && (convertiblePreferredClaim ?? 0) > 0 &&
    ["PreferredStockIncludingAdditionalPaidInCapitalNetOfDiscount", "PreferredStockIncludingAdditionalPaidInCapital"]
      .some(tag => at(tag) === permanent + convertiblePreferredClaim!);
  const inclusive = at("ConvertibleNotesPayable");
  const noncurrent = first(["ConvertibleDebtNoncurrent", "ConvertibleLongTermNotesPayable"]);
  const current = first(["ConvertibleDebtCurrent", "ConvertibleNotesPayableCurrent"]);
  const notesClaim = inclusive ?? (noncurrent !== null || current !== null ? (noncurrent ?? 0) + (current ?? 0) : at("ConvertibleDebt"));
  const k = points("DebtInstrumentConvertibleConversionPrice1", `${unit}/shares`)
    .filter(p => !p.start && p.val > 0 && days(p.end, bridgeDate) >= 0 && days(p.end, bridgeDate) <= 366)
    .sort((a, b) => b.end.localeCompare(a.end) || b.filed.localeCompare(a.filed))[0]?.val ?? null;
  const instruments: ConvertibleInstrument[] = [];
  for (const kind of ["notes", "preferred"] as const) {
    const claim = kind === "notes" ? notesClaim : convertiblePreferredClaim;
    const tag = `IncrementalCommonSharesAttributableToConversionOf${kind === "notes" ? "DebtSecurities" : "PreferredStock"}`;
    const [min, max] = divisor.basis === "quarter" ? [80, 100] : [350, 380];
    const n = points(tag, "shares").find(p => p.end === divisor.end && p.start && days(p.start, p.end) >= min && days(p.start, p.end) <= max && p.val >= 0);
    if (!n || n.val === 0) {
      if ((claim ?? 0) > 0) gaps.push({ field: "valuation.perShare.convertibleShares", severity: "info",
        reason: `Convertible ${kind}: no positive if-converted increment is filed for the divisor's ${divisor.basis} ending ${divisor.end}; the divisor may hold conversion shares. Claim and count are retained.` });
      continue;
    }
    const ratio = k !== null && claim !== null && claim > 0 ? n.val / (claim / k) : null;
    const settlement = kind === "preferred" ? "full-shares" : ratio !== null && ratio >= 0.95 && ratio <= 1.05 ? "full-shares" : ratio !== null && ratio < 0.95 ? "net-share" : "unknown";
    instruments.push({ kind, conversionShares: n.val, claim, settlement, conversionPrice: kind === "notes" ? k : null,
      period: { start: n.start!, end: n.end }, basis: `${tag}, ${n.start}..${n.end}, filed ${n.filed}; claim ${claim === null ? "unestablished" : millions(claim)} at ${bridgeDate}` });
  }
  return { instruments, convertiblePreferredClaim, preferredSeriesDistinct, gaps };
}

export function foldConvertiblePreferred(permanent: number | null, claim: number | null | undefined, distinct = false) {
  if (!(claim != null && claim > 0)) return { preferred: permanent, gap: null };
  const overlap = permanent !== null && permanent > 0 && !distinct;
  return { preferred: distinct ? (permanent ?? 0) + claim : Math.max(permanent ?? 0, claim), gap: overlap ? {
    field: "valuation.dcf.preferredClaimOverlap", severity: "warn" as const,
    reason: `Preferred ${millions(permanent!)} and convertible preferred ${millions(claim)} may overlap; the filing does not distinguish the series. Deduct the larger once, never the sum.`,
  } : null };
}

export function convertibleVariants(instruments: readonly ConvertibleInstrument[], deducted: { preferred: number; notes: number }) {
  let variants: Array<{ restored: { notes: number; preferred: number }; sharesRemoved: number; readings: ConvertibleReading[] }> = [
    { restored: { notes: 0, preferred: 0 }, sharesRemoved: 0, readings: [] },
  ];
  for (const instrument of instruments) {
    const { kind, claim, conversionShares: n } = instrument;
    const eligible = claim !== null && claim > 0 && claim <= deducted[kind] && instrument.settlement === "full-shares";
    // OD-2 M6: triangular confidence blend. At C/K the full two-reading rule applies;
    // at either 5% boundary it continuously meets the conservative claim-plus-shares value.
    const ratio = kind === "notes" && claim && instrument.conversionPrice ? n / (claim / instrument.conversionPrice) : 1;
    const weight = kind === "notes" ? Math.max(0, Math.min(1, 1 - Math.abs(ratio - 1) / 0.05)) : 1;
    const basis = `${instrument.basis}${eligible && weight < 1 ? `; conservative continuous conversion-count blend ${weight * 100}% (zero at 95%/105%, full at 100%)` : ""}`;
    const choices: ConvertibleReading[] = eligible ? [
      { kind, claim, conversionShares: n, reading: "claim", restored: 0, sharesRemoved: n * weight, basis },
      { kind, claim, conversionShares: n, reading: "converted", restored: Math.min(claim, deducted[kind]) * weight, sharesRemoved: 0, basis },
    ] : [{ kind, claim, conversionShares: n, reading: instrument.settlement === "net-share" ? "net-share" : "unresolved", restored: 0, sharesRemoved: 0, basis }];
    variants = variants.flatMap(v => choices.map(r => ({ restored: { ...v.restored, [kind]: v.restored[kind] + r.restored }, sharesRemoved: v.sharesRemoved + r.sharesRemoved, readings: [...v.readings, r] })));
  }
  return variants;
}

export function convertibleReadingGaps(readings: readonly ConvertibleReading[], dilutedShares: number | null): ManifestEntry[] {
  return readings.map(r => {
    const bound = dilutedShares !== null && dilutedShares > r.conversionShares ? `at most ${(100 * r.conversionShares / (dilutedShares - r.conversionShares)).toFixed(2)}%` : "an unbounded amount (increment reaches the divisor)";
    return { field: "valuation.perShare.convertibleClaim", severity: r.reading === "unresolved" ? "warn" : "info",
      reason: `Convertible ${r.kind}: ${r.reading}. ${r.basis}. ` + (r.reading === "unresolved"
        ? `Claim and conversion shares are retained: the filed claim or full-share settlement is not established in the bridge. No usable conversion price/full count establishes share settlement (ASC 260-10-45-40(b)). Value may be understated by ${bound}.`
        : r.reading === "net-share" ? "Cash-principal settlement (ASC 260-10-45-40(b)): claim and conversion-spread shares both remain."
          : `Remove ${r.sharesRemoved} conversion shares; restore ${millions(r.restored)} of the deducted claim. Time value of the conversion option is not modelled.`) };
  });
}
