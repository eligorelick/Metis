/**
 * One house definition of the claims senior to common that sit outside
 * permanent equity (audit 2026-10-27 FIN-119, FIN-119-V2; decisions D-next,
 * OD-1): redeemable preferred and redeemable noncontrolling interests, carried
 * in temporary equity (ASC 480-10-S99) at their redemption claim.
 *
 * The DCF bridge, the market and own-history enterprise values and the
 * ownership guards all read these claims through `temporaryEquityClaims`, so
 * none of them keeps its own reading of the three filed fields.
 */
import { IDENTITY_TOLERANCE_PCT } from "@/pipeline/stageA/validate";
import { millions } from "@/pipeline/stageB/netDebt";

const FIELDS = ["temporaryEquity", "temporaryEquityAttributableToParent", "temporaryEquityAttributableToNoncontrollingInterest"] as const;
type TemporaryEquityField = (typeof FIELDS)[number];

/** The balance fields the claims are read from (an FMP-named statement row, a multiples balance or a quarter). */
export interface TemporaryEquityRow {
  temporaryEquity?: number | null;
  temporaryEquityAttributableToParent?: number | null;
  temporaryEquityAttributableToNoncontrollingInterest?: number | null;
  fieldConflicts?: Record<string, { usable?: boolean; reason?: string } | undefined>;
}

export interface TemporaryEquityClaims {
  /** Temporary equity attributable to the parent (redeemable preferred and other redeemable parent equity). */
  redeemablePreferred: number;
  /** Redeemable noncontrolling interests (carrying amount, which is the redemption claim). */
  redeemableNoncontrolling: number;
  /** A filed total with no parent/NCI split: deducted beside preferred, never allocated. */
  unsplit: number;
  total: number;
  basis: string;
  /** Why the claims cannot be admitted (a refused operand, a non-finite value, a total that contradicts its parts); null when they can. */
  refusal: string | null;
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * The temporary-equity claims on one balance row, or null when nothing is filed.
 * The admission mirrors Stage A's `pickTemporaryEquity`: a total, else parent
 * plus NCI, else the observed part (the basis says the other part is
 * undisclosed). A refused or contradictory operand returns a `refusal` with
 * zero amounts: the claim is unknown, never zero (D-87).
 */
export function temporaryEquityClaims(row: TemporaryEquityRow | null | undefined): TemporaryEquityClaims | null {
  if (row === null || row === undefined) return null;
  const refused = FIELDS.filter((field) => row.fieldConflicts?.[field]?.usable === false);
  const filed = FIELDS.filter((field) => row[field] !== null && row[field] !== undefined);
  if (filed.length === 0 && refused.length === 0) return null;
  const withheld = (refusal: string): TemporaryEquityClaims =>
    ({ redeemablePreferred: 0, redeemableNoncontrolling: 0, unsplit: 0, total: 0, basis: "temporary equity refused", refusal });
  if (refused.length > 0) {
    return withheld(`temporary-equity operand refused: ${refused.map((field) => `${field}${row.fieldConflicts?.[field]?.reason ? ` (${row.fieldConflicts[field]!.reason})` : ""}`).join("; ")}`);
  }
  const invalid = filed.filter((field: TemporaryEquityField) => !finite(row[field]));
  if (invalid.length > 0) return withheld(`invalid temporary-equity allocation: nonfinite/non-numeric ${invalid.join(", ")}`);

  const total = row.temporaryEquity;
  const parent = row.temporaryEquityAttributableToParent;
  const nci = row.temporaryEquityAttributableToNoncontrollingInterest;
  const tolerated = (a: number, b: number) => Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b), 1) * IDENTITY_TOLERANCE_PCT / 100;
  const make = (redeemablePreferred: number, redeemableNoncontrolling: number, unsplit: number, basis: string): TemporaryEquityClaims =>
    ({ redeemablePreferred, redeemableNoncontrolling, unsplit, total: redeemablePreferred + redeemableNoncontrolling + unsplit, basis, refusal: null });

  if (finite(total)) {
    if (finite(parent) && finite(nci)) {
      if (!tolerated(total, parent + nci)) {
        return withheld(`temporary-equity allocation conflict: reported total ${millions(total)} vs parent ${millions(parent)} + redeemable NCI ${millions(nci)} (tolerance ${IDENTITY_TOLERANCE_PCT}% of the larger total)`);
      }
      return make(parent, nci, 0, "temporaryEquity, split by its parent and redeemable NCI parts");
    }
    if (finite(parent)) {
      if (parent > total && !tolerated(total, parent)) return withheld(`temporary-equity allocation conflict: parent part ${millions(parent)} exceeds the reported total ${millions(total)}`);
      return make(parent, total - parent, 0, "temporaryEquity less the parent part (the remainder is redeemable NCI)");
    }
    if (finite(nci)) {
      if (nci > total && !tolerated(total, nci)) return withheld(`temporary-equity allocation conflict: redeemable NCI ${millions(nci)} exceeds the reported total ${millions(total)}`);
      return make(total - nci, nci, 0, "temporaryEquity less the redeemable NCI part (the remainder is parent temporary equity)");
    }
    return make(0, 0, total, "temporaryEquity, no parent/NCI split filed");
  }
  if (finite(parent) && finite(nci)) return make(parent, nci, 0, "temporaryEquityAttributableToParent + temporaryEquityAttributableToNoncontrollingInterest");
  if (finite(parent)) return make(parent, 0, 0, "observed parent temporary equity; redeemable NCI undisclosed");
  return make(0, nci as number, 0, "observed redeemable NCI; parent temporary equity undisclosed");
}

/**
 * The temporary-equity operands of a statement row, for the views the claims
 * are read from (the multiples balance, a merged quarter). Only filed values
 * and the refusals that name these three fields are carried, so a row with no
 * temporary equity maps to the empty object.
 */
export function temporaryEquityOperands(row: object): TemporaryEquityRow {
  const r = row as Record<string, unknown>;
  const out: TemporaryEquityRow = {};
  for (const field of FIELDS) if (typeof r[field] === "number") out[field] = r[field] as number;
  const conflicts = r.fieldConflicts as TemporaryEquityRow["fieldConflicts"];
  const refused = conflicts === undefined || conflicts === null ? [] : FIELDS.filter((field) => conflicts[field] !== undefined);
  if (refused.length > 0) out.fieldConflicts = Object.fromEntries(refused.map((field) => [field, conflicts![field]]));
  return out;
}

/** The filed-or-refused SEC-enrichment gap a bridge date's temporary equity hit, or null (see `ValuationBundleInputs.temporaryEquityUnknown`). */
const ENRICHMENT_WITHHELD = "temporary-equity SEC enrichment withheld: ";
const SEC_SILENT = "temporary carrying amounts are absent or explicitly refused for this SEC period";
export function temporaryEquityUnknownAt(
  row: object | null,
  date: string | null,
  gaps: readonly { field: string; reason: string; severity: string }[],
): { date: string; reason: string } | null {
  if (row === null || date === null) return null;
  if (Object.keys(temporaryEquityOperands(row)).length > 0) return null;
  const paths = new Set([`statements.balance.${date}.temporaryEquity`, ...FIELDS.map((field) => `statements.balance.${date}.${field}`)]);
  // The SEC-silent refusal says the SEC period itself holds no temporary equity: it is not a claim that may be missing.
  const hit = gaps.find((gap) => gap.severity === "warn" && paths.has(gap.field) && gap.reason.startsWith(ENRICHMENT_WITHHELD) && !gap.reason.endsWith(SEC_SILENT));
  return hit === undefined ? null : { date, reason: hit.reason.slice(ENRICHMENT_WITHHELD.length) };
}
