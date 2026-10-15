/** Pure, bounded source selection. Offsets always refer to the original source. */
export const EVIDENCE_SELECTION_VERSION = "section-evidence-2";
export const MATERIAL_CATEGORIES = ["results", "guidance", "capex-liquidity", "tax", "exceptional", "fcf", "earnings-quality", "subsequent-liquidity"] as const;
export type EvidenceCategory = typeof MATERIAL_CATEGORIES[number];
export interface EvidenceSpan { start: number; end: number; text: string }
export interface EvidenceCoverage {
  version: string;
  retainedChars: number;
  omittedChars: number;
  categories: { category: EvidenceCategory; status: "retained" | "omitted" | "not-found"; availablePassages: number; retainedPassages: number }[];
}
export interface SelectedEvidence {
  text: string;
  truncated: boolean;
  originalChars: number;
  spans: EvidenceSpan[];
  coverage: EvidenceCoverage;
}
const CATEGORY_PATTERNS: Record<EvidenceCategory, RegExp> = {
  results: /\b(?:results of operations|revenue|operating (?:income|margin)|net income|earnings per share)\b/i,
  guidance: /\b(?:outlook|guidance|expect(?:s|ed)?|anticipate|forecast|project(?:s|ed)?|intend|plan to)\b/i,
  "capex-liquidity": /\b(?:capital expenditur|capex|liquidity|capital resources|cash (?:and|flows)|finance leases?|debt maturit)/i,
  tax: /\b(?:income tax|tax (?:charge|expense|rate|benefit)|valuation allowance|effective tax|deferred tax)\b/i,
  exceptional: /\b(?:exceptional|one[- ](?:off|time)|non[- ]recurring|restructur|severance|legal (?:charge|expense|accrual)|litigation|settlement|impairment)\b/i,
  fcf: /\b(?:free cash flow|reconcil(?:e|iation)|principal payments|purchases of property)\b/i,
  "earnings-quality": /\b(?:other income(?:\s*\(expense\))?|other expense(?:\s*\(income\))?|non[- ]operating|(?:unrealized|non[- ]cash|investment) (?:gains?|losses?)|equity (?:securities|warrant) valuations?|(?:upward|downward|reclassification|fair[- ]value) adjustments?)\b/i,
  "subsequent-liquidity": /^(?=[\s\S]*\b(?:subsequent(?:ly)?|(?:after|following|since) (?:the )?(?:quarter|period|year)[ -]end)\b)(?=[\s\S]*\b(?:funded|funding|paid|repaid|repayment|borrowed|issued|issuance|acquired|acquisition|invested|investment|commitment)\b)(?=[\s\S]*\d)/i,
};
interface Passage extends EvidenceSpan { categories: EvidenceCategory[]; score: number }

function passages(text: string): Passage[] {
  const boundaries = [0, ...[...text.matchAll(/\n+|(?<=[.!?])\s+(?=[A-Z“"(])/g)].map((match) => match.index + match[0].length), text.length];
  const out: Passage[] = [];
  for (let i = 1; i < boundaries.length; i++) {
    let start = boundaries[i - 1];
    const stop = boundaries[i];
    while (start < stop) {
      let end = Math.min(stop, start + 1_100);
      if (end < stop) {
        const space = text.lastIndexOf(" ", end);
        if (space > start + 700) end = space;
      }
      const body = text.slice(start, end);
      if (body.trim() !== "") {
        const categories = MATERIAL_CATEGORIES.filter((category) => CATEGORY_PATTERNS[category].test(body));
        const quantities = (body.match(/\d[\d,.]*\s*(?:%|billion|million)|\$\s*\d/g) ?? []).length;
        const score = Math.min(quantities, 8) * 3 + categories.length * 2 +
          (/\b(?:expect|outlook|guidance|tax charge|valuation allowance|severance|free cash flow)\b/i.test(body) ? 8 : 0);
        out.push({ start, end, text: body, categories, score });
      }
      start = end;
    }
  }
  return out;
}

export function selectMaterialEvidence(text: string, maxChars: number): SelectedEvidence {
  const budget = Math.max(0, Math.floor(maxChars));
  const all = passages(text);
  const selected: Passage[] = [];
  const separator = "\n[…source passage omitted…]\n";
  // Counts/disclosure are never evidence and have a fixed reservation.
  const reserve = text.length > budget ? Math.min(budget, 210) : 0;
  let remaining = budget - reserve;
  const add = (passage: Passage): boolean => {
    if (selected.includes(passage)) return true;
    // A remaining commitment often refers to the investment in the preceding
    // sentence. Keep that adjacent, bounded context atomically with its funding
    // disclosure, rather than presenting an unbound amount or dropping its date.
    const previous = all[all.indexOf(passage) - 1];
    const needsContext = passage.categories.includes("subsequent-liquidity") &&
      /\b(?:remaining|commitment|this|these|such|additional)\b/i.test(passage.text) && previous &&
      /\b(?:invested|investment|acquired|acquisition|purchase|agreement|commitment|loan|notes?)\b/i.test(previous.text);
    const additions = (needsContext ? [previous, passage] : [passage]).filter((candidate) => !selected.includes(candidate));
    const cost = additions.reduce((sum, candidate) => sum + candidate.text.length, 0) +
      separator.length * (selected.length > 0 ? additions.length : additions.length - 1);
    if (cost > remaining) return false;
    selected.push(...additions);
    remaining -= cost;
    return true;
  };
  if (text.length <= budget) {
    selected.push({ start: 0, end: text.length, text, categories: [], score: 0 });
  } else {
    // Every material family gets a turn before any family can fill the budget.
    const ranked = MATERIAL_CATEGORIES.map((category) => all.filter((passage) => passage.categories.includes(category))
      .sort((a, b) => b.score - a.score || a.start - b.start));
    for (let round = 0; round < 3; round++) {
      for (const candidates of ranked) {
        const next = candidates.filter((candidate) => !selected.includes(candidate))[0];
        if (next) add(next);
      }
    }
    if (all[0]) add(all[0]);
    // Generic risk/business narrative can be useful even without a keyword or
    // amount. Only skip unscored forward-looking-statement boilerplate here.
    for (const passage of all.filter((candidate) => candidate.score > 0 || !/\bforward[- ]looking statements\b/i.test(candidate.text))
      .sort((a, b) => b.score - a.score || a.start - b.start)) add(passage);
  }
  const spans = selected.sort((a, b) => a.start - b.start).map(({ start, end, text: body }) => ({ start, end, text: body }));
  const retainedChars = spans.reduce((sum, span) => sum + span.end - span.start, 0);
  const omittedChars = text.length - retainedChars;
  const categories = MATERIAL_CATEGORIES.map((category) => {
    const available = all.filter((passage) => passage.categories.includes(category));
    const retained = available.filter((passage) => spans.some((span) => span.start <= passage.start && span.end >= passage.end));
    return { category, status: available.length === 0 ? "not-found" as const : retained.length === 0 ? "omitted" as const : "retained" as const,
      availablePassages: available.length, retainedPassages: retained.length };
  });
  const marker = omittedChars > 0
    ? `\n\n…[TRUNCATED ${omittedChars} of ${text.length} source chars omitted; material selection is incomplete; see coverage]`
    : "";
  // Tiny caller budgets are valid too; do not return a marker longer than them.
  return { text: (spans.map((span) => span.text).join(separator) + marker).slice(0, budget),
    truncated: omittedChars > 0, originalChars: text.length, spans,
    coverage: { version: EVIDENCE_SELECTION_VERSION, retainedChars, omittedChars, categories } };
}
