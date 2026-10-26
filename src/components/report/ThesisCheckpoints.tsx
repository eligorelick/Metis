import type { Report } from "@/report/schema";
import { valuationReviewBlocks } from "@/report/researchReview";
import { displayProse } from "@/report/presentation";
import { TracedNumberSourceDetails } from "./primitives";

/** Original review conditions, including their held-fixed assumptions and provenance. */
export function ThesisCheckpoints({ triggers }: { triggers: Report["thesisTriggers"] }) {
  const block = valuationReviewBlocks({ thesisTriggers: triggers })[0];
  return <section className="thesis-checkpoints" aria-label="Thesis review checkpoints">
    <h3>Thesis review checkpoints</h3>
    {block ? <>
      {block.paragraphs.map(paragraph => <p className="analysis-visual-description" key={paragraph}>{displayProse(paragraph)}</p>)}
      <div className="thesis-checkpoint-list">{block.items.map((item, index) => <div key={triggers?.[index]?.id ?? index}>
        <h4>{item.title}</h4>
        {item.paragraphs.map((paragraph, i) => <p key={i}>{displayProse(paragraph)}</p>)}
        {triggers?.[index] && <TracedNumberSourceDetails n={triggers[index].threshold} label="Threshold provenance" />}
      </div>)}</div>
    </> : <p className="analysis-unavailable">No model-derived review checkpoints were recorded in this snapshot. <a href="#report-catalystsRisks">Review the recorded catalysts and risks.</a></p>}
  </section>;
}
