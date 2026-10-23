/**
 * When a vendor statement figure and the filed SEC figure are the same
 * observation (audit 2026-10-22 A-11, owner decision): within one reporting
 * unit of the filer, at most a million, or 0.01% of the larger figure,
 * whichever is wider. Filers display rounded figures and a vendor can derive a
 * quarter as the year less nine months, so an exact match refused display
 * rounding as a conflict; a classification difference is percent-scale and
 * still refuses.
 */
export const VENDOR_SEC_TOLERANCE = { unitCap: 1_000_000, share: 0.0001 } as const;

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

export function vendorAgreesWithFiled(vendor: number, filed: number): boolean {
  const allowance = Math.max(1e-8, sharedReportingUnit(vendor, filed), Math.max(Math.abs(vendor), Math.abs(filed)) * VENDOR_SEC_TOLERANCE.share);
  return Math.abs(vendor - filed) <= allowance;
}
