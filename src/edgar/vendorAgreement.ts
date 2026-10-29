/**
 * When a vendor statement figure and the filed SEC figure are the same
 * observation (audit 2026-10-22 A-11, owner decision): within one reporting
 * unit of the filer, at most a million, or 0.01% of the larger figure,
 * whichever is wider. Filers display rounded figures and a vendor can derive a
 * quarter as the year less nine months, so an exact match refused display
 * rounding as a conflict; a classification difference is percent-scale and
 * still refuses. The unit allowance applies only when the larger figure is at
 * least 100 units, so it never exceeds 1% of it (Batch 1's rounding bound): 2
 * million against 1 million is a conflict, not display rounding. A figure
 * derived from filed operands may also use their rounding (`vendorAgreesWithDerived`),
 * capped by the same 1%, so 2 million against 1 million, a zero against a
 * nonzero figure and a sign change stay conflicts for it too.
 */
export const VENDOR_SEC_TOLERANCE = { unitCap: 1_000_000, share: 0.0001, minUnits: 100 } as const;

/**
 * The reporting unit both figures are stated in: the largest power of ten, up
 * to the cap, dividing both. companyfacts carries no decimals attribute, so the
 * unit is read from the figures. A zero, or a figure with a fraction, gives none.
 */
export function sharedReportingUnit(a: number, b: number): number {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a === 0 || b === 0) return 0;
  let unit = 1;
  while (unit < VENDOR_SEC_TOLERANCE.unitCap && a % (unit * 10) === 0 && b % (unit * 10) === 0) unit *= 10;
  return unit;
}

/** A-11's allowance between a vendor figure and a filed one. */
function filedAllowance(vendor: number, filed: number): number {
  const larger = Math.max(Math.abs(vendor), Math.abs(filed));
  const unit = sharedReportingUnit(vendor, filed);
  return Math.max(1e-8, larger >= unit * VENDOR_SEC_TOLERANCE.minUnits ? unit : 0, larger * VENDOR_SEC_TOLERANCE.share);
}

export function vendorAgreesWithFiled(vendor: number, filed: number): boolean {
  return Math.abs(vendor - filed) <= filedAllowance(vendor, filed);
}

/**
 * The unit one filed figure is rounded to: the largest power of ten, up to the cap (a million), dividing it
 * exactly. A zero shows no precision and gets the smallest unit, 1, so it never widens an allowance; a figure with
 * a fraction is not a rounded whole figure and gets none (0).
 */
export function roundingUnit(value: number): number {
  if (!Number.isInteger(value)) return 0;
  if (value === 0) return 1;
  let unit = 1;
  while (unit < VENDOR_SEC_TOLERANCE.unitCap && value % (unit * 10) === 0) unit *= 10;
  return unit;
}

/** Half each operand's rounding unit, summed: how far a figure derived from them can sit from the unrounded result. */
export function derivedRoundingAllowance(operands: readonly number[]): number {
  return operands.reduce((sum, operand) => sum + roundingUnit(operand) / 2, 0);
}

/**
 * A vendor figure against a SEC figure derived from filed operands (a fiscal year or year to date less the prior
 * year to date): the same observation within max(A-11's allowance, the operands' rounding allowance capped at 1% of
 * the larger figure). A figure the filing states only to the million is itself uncertain by half a million, so a
 * difference within the operands' stated precision is not a disagreement (audit 2026-10-27 FIN-511-V2, the
 * controller's ruling revising A-11 for derived values). The rounding allowance is the sum over the operands of half
 * each one's `roundingUnit`: up to 1M for two whole-million operands, 2M for four (a sum of two derived figures). The
 * cap is A-11's own bound (one unit at the 100-unit floor, `1 / minUnits`), so a gap across a zero or a sign change,
 * which is at least the larger figure, is never within it. A directly filed figure keeps `vendorAgreesWithFiled`.
 */
export function vendorAgreesWithDerived(vendor: number, derived: number, operands: readonly number[]): boolean {
  const larger = Math.max(Math.abs(vendor), Math.abs(derived));
  const rounding = Math.min(derivedRoundingAllowance(operands), larger / VENDOR_SEC_TOLERANCE.minUnits);
  return Math.abs(vendor - derived) <= Math.max(filedAllowance(vendor, derived), rounding);
}
