import type { Report, Valuation } from "@/report/schema";
import { formatFinancialValue, formatMultiple } from "@/report/format";
import { sourceLabel } from "@/report/presentation";

export interface ValuationReviewInputs {
  scenarioPresentation?: Report["scenarioPresentation"];
  thesisTriggers?: Report["thesisTriggers"];
  peerCoverage?: Valuation["peerCoverage"];
}

export interface ReviewBlock {
  title: string;
  paragraphs: string[];
  items: Array<{ title: string; paragraphs: string[] }>;
  /** D-67: a compact table the block ends with (the peer comparisons). */
  table?: { headers: string[]; rows: string[][] };
}

type PeerCoverage = NonNullable<Valuation["peerCoverage"]>;

/**
 * D-67: the peer screen in two lines for the report body. The screen rules,
 * per-metric notes and every exclusion (about 56 lines for NVDA) are in the
 * audit export ({@link peerCoverageAuditLines}).
 */
export function peerCoverageSummary(peers: PeerCoverage): string[] {
  const eligible = new Set(peers.eligible);
  const screenedOut = new Set(peers.exclusions.filter((e) => !eligible.has(e.symbol)).map((e) => e.symbol)).size;
  const caveat = peers.methodology.some((line) => /comparability caveat/i.test(line))
    ? " Medians that are shown carry a comparability caveat: business-model, accounting and metric-definition evidence is not independently sourced."
    : "";
  return [
    `${peers.evaluated} of ${peers.candidates} candidate issuers evaluated; eligible: ${peers.eligible.join(", ") || "none"}${screenedOut > 0 ? `; ${screenedOut} excluded at the screen` : ""}.${caveat}`,
    "The screen rules, the per-metric notes and each exclusion with its reason are in the audit export.",
  ];
}

/** The full peer screen record for the audit export (D-67). */
export function peerCoverageAuditLines(peers: PeerCoverage): string[] {
  return [
    ...peers.methodology,
    `${peers.evaluated} of ${peers.candidates} candidate issuers evaluated. Eligible issuers: ${peers.eligible.join(", ") || "none"}. Eligibility does not guarantee a usable value for every multiple.`,
    ...(peers.comparisons ?? []).map((row) => `${row.name}: company ${formatMultiple(row.current)}; peer median ${formatMultiple(row.peerMedian)}; ${row.peerCount} comparable peers. ${row.basis}`),
    ...peers.exclusions.map((exclusion) => `Excluded — ${exclusion.symbol}: ${exclusion.reason}`),
  ];
}

/** Shared wording for app, Markdown and print; escaping belongs to the renderer. */
export function valuationReviewBlocks(input: ValuationReviewInputs): ReviewBlock[] {
  const blocks: ReviewBlock[] = [];
  if (input.scenarioPresentation) {
    blocks.push({
      title: "Valuation sensitivity assessment",
      paragraphs: [input.scenarioPresentation.sensitivity.conclusion, input.scenarioPresentation.interpretation],
      items: [],
    });
  }
  if (input.thesisTriggers?.length) {
    blocks.push({
      title: "What would change the assessment",
      paragraphs: ["These model-derived conditions prompt a review of the thesis. They are conditional estimates, not automatic investment decisions."],
      items: input.thesisTriggers.map((trigger) => {
        const n = trigger.threshold;
        const threshold = n.unit === "%" ? `${n.value.toFixed(2)}%` : formatFinancialValue(n.value, n.unit, n.currency ?? null);
        return {
          title: `${trigger.metric}: ${trigger.comparator} ${threshold}`,
          paragraphs: [
            `Horizon: ${trigger.horizon}.`,
            `Held fixed / comparison basis: ${trigger.fixedAssumptions.join(" ")}`,
            trigger.consequence,
            `Source: ${sourceLabel(n.source)}${n.asOf ? `; as of ${n.asOf}` : ""}${n.period ? `; period ${n.period}` : ""}.`,
          ],
        };
      }),
    });
  }
  const peers = input.peerCoverage;
  if (peers) {
    const comparisons = peers.comparisons ?? [];
    blocks.push({
      title: "Peer comparison coverage",
      paragraphs: peerCoverageSummary(peers),
      items: [],
      ...(comparisons.length === 0 ? {} : {
        table: {
          headers: ["Comparison", "Company", "Peer median", "Comparable peers"],
          rows: comparisons.map((row) => [row.name, formatMultiple(row.current), row.peerMedian === null ? "withheld" : formatMultiple(row.peerMedian), String(row.peerCount)]),
        },
      }),
    });
  }
  return blocks;
}
