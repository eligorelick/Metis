import type { Report, Valuation } from "@/report/schema";
import { formatFinancialValue, formatMultiple } from "@/report/format";

export interface ValuationReviewInputs {
  scenarioPresentation?: Report["scenarioPresentation"];
  thesisTriggers?: Report["thesisTriggers"];
  peerCoverage?: Valuation["peerCoverage"];
}

export interface ReviewBlock {
  title: string;
  paragraphs: string[];
  items: Array<{ title: string; paragraphs: string[] }>;
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
            `Source: ${n.source}${n.asOf ? `; as of ${n.asOf}` : ""}${n.period ? `; period ${n.period}` : ""}.`,
          ],
        };
      }),
    });
  }
  const peers = input.peerCoverage;
  if (peers) {
    blocks.push({
      title: "Peer comparison coverage",
      paragraphs: [
        ...peers.methodology,
        `${peers.evaluated} of ${peers.candidates} candidate issuers evaluated. Eligible issuers: ${peers.eligible.join(", ") || "none"}. Eligibility does not guarantee a usable value for every multiple.`,
      ],
      items: [
        ...(peers.comparisons ?? []).map((row) => ({
          title: row.name,
          paragraphs: [`Company ${formatMultiple(row.current)}; peer median ${formatMultiple(row.peerMedian)}; ${row.peerCount} comparable peers.`, row.basis],
        })),
        ...(peers.exclusions.length ? [{
          title: "Excluded or unavailable comparisons",
          paragraphs: peers.exclusions.map((exclusion) => `${exclusion.symbol}: ${exclusion.reason}`),
        }] : []),
      ],
    });
  }
  return blocks;
}
