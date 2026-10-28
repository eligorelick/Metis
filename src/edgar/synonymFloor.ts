/**
 * Component floors for first-hit synonym chains (audit 2026-10-27 FIN-510,
 * FIN-510-V1, FIN-510-V2; docs/METHODOLOGY.md "D&A from separate lines (B-7)").
 *
 * A synonym that sits below a component the line item itself contains is a
 * subset line, not the filer's total, so the resolver skips it. Pure, no imports.
 */

/**
 * House rounding allowance (D-next): a total below a component by no more than
 * max(0.5% of the component, 2,000,000 in the row's currency) differs by
 * rounding only; the absolute term covers two derived quarters compared with
 * each other (each the difference of two rounded figures).
 */
export const SYNONYM_FLOOR_TOLERANCE = { relative: 0.005, absolute: 2_000_000 } as const;

/**
 * The first component the candidate total sits below (beyond the tolerance), or
 * null. Only a non-negative candidate and a positive component are compared; a
 * negative or zero component is never a floor.
 */
export function belowComponentFloor(
  candidate: number,
  components: readonly { tag: string; value: number }[],
): { tag: string; value: number } | null {
  if (!(candidate >= 0)) return null;
  for (const component of components) {
    if (!(component.value > 0)) continue;
    const allowance = Math.max(SYNONYM_FLOOR_TOLERANCE.relative * component.value, SYNONYM_FLOOR_TOLERANCE.absolute);
    if (candidate < component.value - allowance) return component;
  }
  return null;
}
