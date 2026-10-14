import { valuationReviewBlocks, type ValuationReviewInputs } from "@/report/researchReview";

export function ValuationReview(props: ValuationReviewInputs) {
  return valuationReviewBlocks(props).map((block) => (
    <section key={block.title} className="min-w-0 border border-edge bg-raised px-3 py-3">
      <h3 className="mb-2 text-[12px] font-semibold text-fg">{block.title}</h3>
      {block.paragraphs.map((paragraph, i) => <p key={i} className="mb-1 break-words text-[11px] leading-relaxed text-muted">{paragraph}</p>)}
      {block.items.map((item, i) => (
        <div key={i} className="mt-3 border-t border-edge pt-2">
          <h4 className="mb-1 text-[11px] font-medium text-fg">{item.title}</h4>
          {item.paragraphs.map((paragraph, j) => <p key={j} className="mb-1 break-words text-[11px] leading-relaxed text-muted">{paragraph}</p>)}
        </div>
      ))}
    </section>
  ));
}
