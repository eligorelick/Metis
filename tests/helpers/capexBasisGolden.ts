import { expect } from "vitest";

const current = "Standardized FCF = operating cash flow minus the retained statement's cash-capex field. That field is not reconciled to cash PP&E alone and may include software or other capital spending; coverage can differ between provider periods. Do not equate it with issuer-defined FCF or a PP&E-only calculation. Lease-adjusted FCF additionally subtracts finance-lease principal when disclosed.";
const prior = "Standardized FCF = operating cash flow minus cash PP&E; lease-adjusted FCF additionally subtracts finance-lease principal when disclosed. Issuer convention must be checked before comparison.";

/** Restore only the reviewed FIG basis wording; preserve every financial/hash pin. */
export function restoreCapexBasisGolden<T>(input: T, expectedOccurrences: number): T {
  let occurrences = 0;
  const visit = (value: unknown): unknown => {
    if (typeof value === "string") {
      occurrences += value.split(current).length - 1;
      return value.replaceAll(current, prior);
    }
    if (value !== null && typeof value === "object") {
      for (const [key, leaf] of Object.entries(value)) (value as Record<string, unknown>)[key] = visit(leaf);
    }
    return value;
  };
  const restored = visit(structuredClone(input)) as T;
  expect(occurrences).toBe(expectedOccurrences);
  return restored;
}
