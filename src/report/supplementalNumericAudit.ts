import type { VerificationLogEntry } from "@/report/schema";

const NOTE = "Supplemental numeric inventory: metric, unit, period and accounting basis not independently matched; excluded from the tracing rate.";

/**
 * Plain scalar cells and retained operands in the deterministic supplements
 * cannot inherit a TracedNumber check. Inventory this superset separately;
 * neither a finite number nor an equal registry value establishes its metric.
 * A typed adapter may eventually match individual cells, but this inventory
 * deliberately makes no source-validation claim and never changes coverage.
 */
export function supplementalNumericAudit(root: object): VerificationLogEntry[] {
  const entries: VerificationLogEntry[] = [];
  const walk = (node: unknown, path: string): void => {
    if (typeof node === "number") {
      if (Number.isFinite(node)) entries.push({ path, claim: String(node), evidenceKind: "number", check: "plain-figure", outcome: "unverified", traceKind: "untraced", validationStatus: "unchecked", numericSupportStatus: "unchecked", claimSupportStatus: "unreviewed", reason: "text-context-mismatch", note: NOTE });
      return;
    }
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach((child, index) => walk(child, `${path}[${index}]`)); return; }
    const obj = node as Record<string, unknown>;
    // The ordinary verifier already owns all fully traced cells.
    if (typeof obj.value === "number" && typeof obj.unit === "string" && typeof obj.source === "string" && "verified" in obj) return;
    for (const [key, value] of Object.entries(obj)) walk(value, `${path}.${key}`);
  };
  const obj = root as Record<string, unknown>;
  for (const key of ["filingDisclosures", "marketData"] as const) walk(obj[key], key);
  return entries;
}

export function supplementalNumericInventoryText(log: readonly VerificationLogEntry[] | undefined): string | null {
  const count = log?.filter(entry => entry.note === NOTE).length ?? 0;
  return count === 0 ? null : `${count} cells/operands inventoried; metric, unit, period and accounting basis not independently matched; excluded from the tracing rate`;
}
