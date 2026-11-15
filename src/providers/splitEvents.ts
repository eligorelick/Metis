/**
 * P3: a price vendor dates a split by the first session on its adjusted price basis, independently of legal
 * effectiveness or XBRL context. Retrieved coverage establishes which events the vendor knows within that
 * span; unavailable or unrequested coverage never means no splits.
 */

export interface VendorSplitEvent {
  /** First session on the post-split basis (exchange-local calendar date). */
  session: string;
  /** Post-split shares per pre-split share: numerator / denominator (below 1 for a reverse split). */
  ratio: number;
  numerator: number;
  denominator: number;
}

export interface VendorSplitCoverage {
  from: string;
  to: string;
}

/** One retrieved answer, before its events and coverage are combined with others. */
export interface VendorSplitObservation {
  source: string;
  events: VendorSplitEvent[];
  coverage: VendorSplitCoverage[];
}

export type VendorSplitEvidence =
  | {
      status: "retrieved";
      source: string;
      events: VendorSplitEvent[];
      /** Sessions the answer covers; there may be several (daily history, recent quote, full history). */
      coverage: VendorSplitCoverage[];
      /** Original answers retained by a merge, including covered dates with no event. */
      observations?: VendorSplitObservation[];
    }
  | { status: "unavailable"; source: string; reason: string };

export function unavailableSplitEvidence(source: string, reason: string): VendorSplitEvidence {
  return { status: "unavailable", source, reason };
}

/**
 * Merge several vendor answers. Events describing the same session and ratio
 * are one event; the coverage is the union. Any retrieved answer makes the
 * merge retrieved (its coverage says how far it reaches). Original answers
 * survive nested merges so reconciliation can detect contradictions. Only when
 * none was retrieved is the merge unavailable, naming every reason.
 */
export function mergeSplitEvidence(parts: readonly VendorSplitEvidence[]): VendorSplitEvidence {
  const retrieved = parts.filter((p): p is Extract<VendorSplitEvidence, { status: "retrieved" }> => p.status === "retrieved");
  if (retrieved.length === 0) {
    // Every part is unavailable here.
    const reasons = parts.flatMap((p) => (p.status === "unavailable" ? [`${p.source}: ${p.reason}`] : []));
    return unavailableSplitEvidence(
      [...new Set(parts.map((p) => p.source))].join(" + ") || "none",
      reasons.length === 0 ? "no vendor split list was requested" : reasons.join("; "),
    );
  }
  const events = new Map<string, VendorSplitEvent>();
  for (const part of retrieved) {
    for (const e of part.events) events.set(`${e.session}|${Number(e.ratio.toFixed(6))}`, e);
  }
  return {
    status: "retrieved",
    source: [...new Set(retrieved.map((p) => p.source))].join(" + "),
    events: [...events.values()].sort((a, b) => (a.session < b.session ? -1 : a.session > b.session ? 1 : 0)),
    coverage: retrieved.flatMap((p) => p.coverage),
    observations: retrieved.flatMap((p) => p.observations ?? [{ source: p.source, events: p.events, coverage: p.coverage }]),
  };
}
