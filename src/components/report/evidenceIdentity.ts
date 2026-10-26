import { createHash } from "node:crypto";
import type { SourcedClaim, TracedNumber } from "@/report/schema";

/** Server-only opaque identity; equal source labels do not identify equal observations. */
export function evidenceIdentity(kind: string, recorded: unknown): string {
  return createHash("sha256").update(JSON.stringify([kind, recorded])).digest("hex");
}

export function evidenceAttributes(kind: "claim" | "number", recorded: SourcedClaim | TracedNumber) {
  return {
    "data-evidence-kind": kind,
    "data-evidence-key": evidenceIdentity(kind, recorded),
    "data-evidence-source-id": recorded.sourceId ?? recorded.source,
    "data-evidence-context-key": evidenceSourceIdentity(kind, recorded),
  };
}

/** Exact recorded identity/context only. A source-label resemblance cannot join facts. */
export function evidenceSourceIdentity(kind: "claim" | "number", recorded: SourcedClaim | TracedNumber): string {
  return evidenceIdentity(`source-context:${kind}`, [recorded.sourceId ?? recorded.source, recorded.asOf,
    ...(kind === "number" && "value" in recorded ? [recorded.value, recorded.unit, recorded.currency ?? null, recorded.period, recorded.periodContext ?? null] : []),
  ]);
}
