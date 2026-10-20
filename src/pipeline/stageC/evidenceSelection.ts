import { materialCreditSupportClauses } from "@/edgar/currentReports";

/** Pure, bounded source selection. Offsets always refer to the original source. */
export const EVIDENCE_SELECTION_VERSION = "section-evidence-2";
export const MATERIAL_CATEGORIES = ["results", "guidance", "capex-liquidity", "tax", "exceptional", "fcf", "earnings-quality", "subsequent-liquidity", "distribution-costs"] as const;
/**
 * D-63: 10-K Item 1 (Business) families. A business description carries few
 * figures, so the financial families above found almost nothing in it; these
 * name what an equity reader takes from it: the software platform and
 * ecosystem, the product roadmap, customers, suppliers and manufacturing,
 * competitors, export and other regulation, and the executive officers.
 */
export const BUSINESS_CATEGORIES = ["platform-software", "products-roadmap", "customers", "suppliers-manufacturing", "competition", "regulation-export", "officers"] as const;
/**
 * D-63: the latest 10-Q's notes to the financial statements. D-66: the 10-K's
 * notes are read with the same families, and business combinations (a deal's
 * consideration, goodwill and intangibles) join them.
 */
export const NOTES_CATEGORIES = ["investments", "commitments-guarantees", "customer-concentration", "debt", "capital-return", "contingencies", "internal-controls", "tax", "subsequent-liquidity", "business-combinations", "performance-obligations"] as const;
export type EvidenceCategory = typeof MATERIAL_CATEGORIES[number] | typeof BUSINESS_CATEGORIES[number] | typeof NOTES_CATEGORIES[number];
/**
 * Which families a source is read for (D-63). `financial` is the original
 * section-evidence-2 selector, unchanged. `risk` reads risk factors for the
 * business families as well as the financial ones; `event` is the financial
 * reading of an 8-K item that first keeps every passage introducing a named
 * party (the counterparty, tenant or acquiree of the operative paragraph).
 */
export type EvidenceProfile = "financial" | "business" | "risk" | "notes" | "event" | "interim";
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
  // D-63: "we incurred a $0.4 billion charge associated with H200 for excess
  // inventory" named no listed family and was dropped from NVDA's 10-Q MD&A.
  exceptional: /\b(?:exceptional|one[- ](?:off|time)|non[- ]recurring|restructur|severance|legal (?:charge|expense|accrual)|litigation|settlement|impairment|write[- ]?downs?|charges? (?:associated|related) (?:with|to)|(?:a|an) \$\s?[\d.,]+\s*(?:billion|million) charge)\b/i,
  fcf: /\b(?:free cash flow|reconcil(?:e|iation)|principal payments|purchases of property)\b/i,
  "earnings-quality": /\b(?:other income(?:\s*\(expense\))?|other expense(?:\s*\(income\))?|non[- ]operating|(?:unrealized|non[- ]cash|investment) (?:gains?|losses?)|equity (?:securities|warrant) valuations?|(?:upward|downward|reclassification|fair[- ]value) adjustments?)\b/i,
  "subsequent-liquidity": /^(?=[\s\S]*\b(?:subsequent(?:ly)?|(?:after|following|since) (?:the )?(?:quarter|period|year)[ -]end)\b)(?=[\s\S]*\b(?:funded|funding|paid|repaid|repayment|borrowed|issued|issuance|acquired|acquisition|invested|investment|commitment)\b)(?=[\s\S]*\d)/i,
  "distribution-costs": /\b(?:selling and marketing|marketing (?:spend|expense|cost)|(?:partner|affiliate|distribution) (?:program )?commissions?|traffic (?:generation|acquisition) costs?)\b/i,
  "platform-software": /\b(?:software|platforms?|ecosystems?|developers?|librar(?:y|ies)|SDKs?|frameworks?|APIs?|CUDA|operating systems?|installed base)\b/i,
  "products-roadmap": /\b(?:architectures?|roadmap|launch(?:ed|es)?|introduc(?:ed|es)|unveil(?:ed|s)?|next[- ]generation|new products?|product (?:transitions?|cycles?|lines?)|production shipments?|commence production)\b/i,
  customers: /\b(?:customers?|clients?|end markets?|hyperscalers?|cloud service providers?|CSPs)\b/i,
  "suppliers-manufacturing": /\b(?:suppliers?|foundr(?:y|ies)|wafers?|manufactur(?:e|ed|ing|ers?)|subcontractors?|supply chains?|packaging|memory|components?|capacity)\b/i,
  competition: /\bcompet(?:e|es|ing|ition|itive|itors?)\b/i,
  "regulation-export": /\b(?:export (?:controls?|restrictions?|licen[cs](?:e|es|ing))|licen[cs]ing requirements?|tariffs?|sanctions?|regulat(?:ion|ions|ory))\b/i,
  officers: /\b(?:[Ee]xecutive [Oo]fficers?|Chief (?:Executive|Financial|Operating|Accounting) Officer|has served as|joined [A-Z][\w.&-]* in (?:19|20)\d{2})\b/,
  investments: /\b(?:publicly[- ]held|privately[- ]held|non[- ]marketable|marketable equity|equity (?:securities|method|investments?)|lock[- ]up|strategic investments?|investments? in)\b/i,
  "commitments-guarantees": /\b(?:purchase obligations?|supply commitments?|commitments?|guarantee(?:s|d)?|guarant(?:y|ies)|obligations? to purchase|capacity agreements?|cloud service agreements?)\b/i,
  "customer-concentration": /\b(?:direct customers?|indirect customers?|concentration|(?:customers?|distributors?|partners?)\b[^.]{0,80}\b(?:represented|accounted for)\b)|\d\s?%[^.]{0,60}\bof (?:our )?(?:total )?(?:net )?(?:revenue|sales)\b/i,
  debt: /\b(?:senior (?:unsecured )?notes|notes due|commercial paper|credit (?:facility|agreement)|revolving|borrowings?|term loans?|debt issuance|issued an aggregate)\b/i,
  "capital-return": /\b(?:repurchase(?:d|s)?|buybacks?|dividends?)\b/i,
  contingencies: /\b(?:litigation|lawsuits?|legal proceedings|contingen(?:t|cy|cies)|indemnit(?:y|ies|ification))\b/i,
  "internal-controls": /\b(?:material weaknesses?|internal control over financial reporting|segregation of duties|remediat(?:e|ion|ing))\b/i,
  "business-combinations": /\b(?:business combinations?|acquisitions? of|acquired|license agreement|(?:total|purchase) consideration|purchase price|goodwill|intangible assets?)\b/i,
  // AMZN audit 2026-10-20 finding 6: the contracted revenue not yet recognized
  // (ASC 606 remaining performance obligations, a backlog). No family named it,
  // so Amazon's $496 billion AWS backlog read only as "commitments" and lost.
  "performance-obligations": /\b(?:(?:remaining )?performance obligations?|RPO|backlog|not yet (?:been )?(?:billed (?:or|nor) )?recogni[sz]ed|contracted (?:but (?:not yet |un)recogni[sz]ed )?revenue|unrecogni[sz]ed revenue)\b/i,
};
/**
 * D-66: the passages of a notes section an equity reader cannot do without,
 * kept before any family takes its turn (bounded by `priorityShare`): each
 * quantified customer concentration (revenue and receivables), extended
 * payment terms, an indirect customer that contributed a meaningful share of
 * revenue, where billed revenue's end customers are, and a deal's
 * consideration and goodwill. NVDA final rerun: 3 of 16 concentration
 * passages were kept and the quarter's 16% customer was not one of them.
 */
const NOTES_PRIORITY: readonly RegExp[] = [
  /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:direct\s+|indirect\s+)?(?:customers?|distributors?|partners?)\b[^.]{0,120}?\b(?:represented|accounted for)\s+\d/i,
  /\bpayment terms\b[^.]{0,160}?\b\d+\s+days\b/i,
  /\b(?:contributed|represented|accounted for)\s+(?:a\s+)?(?:meaningful|significant|material|substantial)\s+(?:amount|portion|share|percentage)\s+of\s+(?:our\s+)?(?:total\s+)?revenue\b/i,
  /\bend customers?\b[^.]{0,160}?\b(?:based|located|headquartered)\b/i,
  /\b(?:total|aggregate)\s+(?:purchase\s+)?consideration\b|\brecorded\s+\$\s?[\d.,]+\s*(?:billion|million)\s+of\s+goodwill\b|\bcarrying amount of goodwill\b/i,
  // The deal itself: "In December 2025, we entered into a non-exclusive license agreement with Groq, Inc.".
  /\b(?:entered into|completed)\b[^.]{0,80}?\b(?:acquisition|acquire|license agreement|merger)\b[^.]{0,40}?\bwith\s+[A-Z]/,
  /\binvestments?\b[^.]{0,120}\baccounted for (?:using|under) the equity method\b/i,
  // AMZN audit 2026-10-20 finding 6: the backlog's amount ("those commitments
  // not yet recognized were approximately $ 496 billion"; "revenue related to
  // remaining performance obligations … was $ 3.2 billion") and when it turns
  // into revenue (a weighted-average remaining contract life, the share
  // recognized over the next twelve months). A contract, revenue or customer
  // must be named, so unrecognized compensation cost is not read as backlog.
  /^(?=[\s\S]*\b(?:contracts?|revenue|customers?|performance obligations?)\b)[\s\S]*\b(?:remaining performance obligations?|backlog|not yet (?:been )?(?:billed (?:or|nor) )?recogni[sz]ed)\b[^.]{0,200}?\$\s?\d/i,
  /^(?=[\s\S]*\b(?:contracts?|revenue|performance obligations?|backlog)\b)(?=[\s\S]*\b(?:recogni[sz]ed?\b[^.]{0,80}?\b(?:next|following) (?:twelve|12) months|weighted[- ]average remaining (?:life|term|duration)\b[^.]{0,40}?\bcontracts?\b))/i,
];
/** D-66: the same concentration statements where an MD&A states them ("Concentration of Revenue"). */
const CONCENTRATION_PRIORITY = NOTES_PRIORITY.slice(0, 4);
const DISTRIBUTION_COST_PRIORITY = /\b(?:selling and marketing|marketing spend|(?:partner|affiliate) (?:program )?commissions?)\b/i;
interface ProfileSpec {
  categories: readonly EvidenceCategory[];
  /** Actual control deficiencies and proceedings, including their counterqualifiers. */
  critical?: (passage: string) => boolean;
  /** Passages that are always kept first, within the budget (in source order). */
  priority?: (passage: string) => boolean;
  /** D-66: the share of the budget priority passages may take (all of it when absent). */
  priorityShare?: number;
  /**
   * Read as prose (D-63): sentence splits skip abbreviations and break a
   * flattened table from the sentence after it; table-like passages never take
   * a family's turn; named entities and `bonus` phrases raise a passage's score.
   */
  prose?: { bonus: RegExp };
  /** Split sentences without breaking at "Corp." or a middle initial (implied by `prose`). */
  abbreviations?: true;
}
/**
 * A sentence that introduces a named party by a defined term: "An affiliate of
 * OpenAI Group PBC (such affiliate, “OpenAI”) will be the tenant", "SB Energy
 * (the “Lessor”)". The parenthesis must follow a capitalised name, so "a lease
 * (each a “Trigger Event”)" and "guaranties (collectively, the “Agreements”)" —
 * defined terms that are not parties — are not kept for that alone.
 */
const DEFINES_PARTY = /[A-Z][A-Za-z0-9.&'’-]*\.?,?\s*\((?:[^()“”"]{0,60},\s*)?(?:the\s+)?[“"][A-Z][^“”"]{0,40}[”"]\)/;
/** An item's dated operative sentence ("(c) On July 1, 2026, the Company appointed …"). */
const DATED_LEAD = /^\s*(?:Item \d\.\d{2} \([^)]*\):\s*)?(?:\([a-z]\)\s*)?On (?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}\b/;
const CONTROL_DISCLOSURE = /\b(?:(?:we|Company)\s+(?:(?:have|had|has)\s+)?(?:previously\s+)?identified material weaknesses?|material weaknesses? identified pertained|material weaknesses? (?:continued|continue) to exist|(?:deficiencies|material weaknesses?)\b[^.]{0,160}\b(?:did not|have not|has not)\b[^.]{0,100}\bmaterial misstatement|insufficient segregation of duties|lack of (?:a )?sufficient\b[^.]{0,120}\b(?:qualified|expertise))\b/i;
const HYPOTHETICAL_CONTROL = /^\s*(?:if|should|in (?:the )?future)\b|\b(?:may|could|might)\s+(?:identify|develop)\b/i;
const LITIGATION_DISCLOSURE = /\b(?:class action\b[^.]{0,180}|(?:actions?|complaints?) (?:were|was|have been) filed|(?:filed|consolidated)\b[^.]{0,120}\b(?:Derivative Actions?|Securities Action)|claims\b[^.]{0,100}\bwithout merit|(?:loss|range of loss)\b[^.]{0,100}\bcannot be reasonably estimated|not accrued any material potential loss)\b/i;
/**
 * AMZN audit 2026-10-20 finding 16: the proceedings that can change a thesis.
 * A case a government brought ("state Attorneys General, and the Federal
 * Trade Commission have filed cases … alleging … monopolization"), antitrust
 * claims actually alleged, relief that reaches billions of dollars or the
 * structure of the business, a regulator's fine, and a dated trial. They
 * named no family and no clause above, so only an orphaned "one class action
 * has been certified" reached the passes.
 */
const AGENCY = String.raw`(?:Federal Trade Commission|FTC|Department of Justice|DOJ|Attorneys? General|European Commission|Competition and Markets Authority|Securities and Exchange Commission|Competition Authority)`;
const MATERIAL_PROCEEDING = new RegExp([
  String.raw`\b${AGENCY}\b[^.]{0,120}?\b(?:sued|(?:filed|brought|commenced)\s+(?:(?:a|an|the)\s+)?(?:cases?|complaints?|lawsuits?|suits?|actions?|charges|proceedings?))\b`,
  String.raw`\b(?:filed|brought|commenced)\s+by\b[^.]{0,120}?\b${AGENCY}\b`,
  String.raw`\balleg(?:e|es|ed|ing|ations?)\b[^.]{0,200}?\b(?:monopoli[sz](?:ation|e|ed|ing)|antitrust|abuse of (?:a )?dominan(?:ce|t position)|anticompetitive)\b`,
  String.raw`\bseek(?:s|ing)?\b[^.]{0,80}?\b(?:billions? of dollars|structural relief|divestitures?)\b`,
  String.raw`\b(?:impos(?:es|ed)|levied)\s+(?:remedial actions and\s+)?(?:a\s+)?fines?\s+of\b`,
  String.raw`(?<!\b(?:clinical|Phase (?:[1-3]|I{1,3})|pivotal|registrational)\s)\btrials?\b[^.]{0,60}?\b(?:scheduled|set)\s+(?:to\s+(?:begin|start|commence)\s+)?(?:for|in|on)\b`,
].join("|"), "i");
const criticalDisclosure = (passage: string): boolean => (CONTROL_DISCLOSURE.test(passage) && !HYPOTHETICAL_CONTROL.test(passage)) || LITIGATION_DISCLOSURE.test(passage) || MATERIAL_PROCEEDING.test(passage);
const PROFILES: Record<EvidenceProfile, ProfileSpec> = {
  financial: { categories: MATERIAL_CATEGORIES, priority: (passage) => DISTRIBUTION_COST_PRIORITY.test(passage), priorityShare: 0.125 },
  // D-66: a 10-Q MD&A read as `financial`, keeping its concentration-of-revenue
  // statements first (the quarter's 16% direct customer, the indirect AI
  // customer), within an eighth of the budget.
  interim: { categories: MATERIAL_CATEGORIES, priority: (passage) => CONCENTRATION_PRIORITY.some((pattern) => pattern.test(passage)) || DISTRIBUTION_COST_PRIORITY.test(passage), priorityShare: 0.25 },
  business: {
    categories: BUSINESS_CATEGORIES,
    prose: { bonus: /\b(?:expected to (?:commence|begin|ship|launch|be available)|roadmap|unveiled|next[- ]generation|joined [A-Z][\w.&-]* in (?:19|20)\d{2}|(?:has|have) served as|co-founded|foundr(?:y|ies)|competitors include|customers include)\b/i },
  },
  risk: {
    categories: [...BUSINESS_CATEGORIES.filter((category) => category !== "officers" && category !== "platform-software"),
      "investments", "commitments-guarantees", "results", "guidance", "capex-liquidity", "tax", "exceptional", "internal-controls", "contingencies"],
    critical: criticalDisclosure,
    prose: { bonus: /\b(?:depend(?:s|ent)? on|rel(?:y|ies|iant) on|concentrat\w*|sole[- ]source|single[- ]source|limited number of (?:customers|suppliers)|export controls?|significant portion of (?:our )?(?:revenue|sales))\b/i },
  },
  notes: {
    categories: NOTES_CATEGORIES,
    critical: criticalDisclosure,
    priority: (passage) => NOTES_PRIORITY.some((pattern) => pattern.test(passage)),
    priorityShare: 0.25,
    prose: { bonus: /\b(?:lock[- ]up|restrictions? on the ability to sell|capped at|maximum (?:gross )?exposure|(?:represented|accounted for) \d[^.]{0,60}\bof (?:our )?(?:total )?(?:net )?(?:revenue|sales)|issued an? (?:aggregate|total)|supply commitments|purchase obligations|equity method|non[- ]marketable)\b/i },
  },
  // The operative paragraph of an 8-K item: its dated lead, the parties it
  // names and the amounts it commits (a cap, a purchase price).
  event: {
    categories: MATERIAL_CATEGORIES,
    priority: (passage) => DATED_LEAD.test(passage) || DEFINES_PARTY.test(passage) || materialCreditSupportClauses(passage).length > 0 || /(?:US)?\$\s?\d[\d,.]*\s*(?:billion|million|trillion)\b/.test(passage),
    abbreviations: true,
  },
};
interface Passage extends EvidenceSpan { categories: EvidenceCategory[]; score: number; table: boolean }

/** Legal-entity suffixes: a passage naming suppliers, customers or competitors. */
const ENTITY = /\b(?:Inc|Ltd|Limited|Corp|Corporation|Co|LLC|PLC|plc|N\.V|S\.A|AG|SE|PBC|Group)\b\.?/g;
const FINANCIAL_BOUNDARY = /\n+|(?<=[.!?])\s+(?=[A-Z“"(])/g;
/**
 * Prose splits: a sentence end that is not an abbreviation ("Colette M.
 * Kress", "Co. Ltd."), a table footnote marker ("(1) Included $36.9 billion of
 * investments that are subject to … lock-up …", which otherwise rides at the
 * end of a flattened table), a note heading ("Note 9 - Debt"), and the first
 * sentence after a flattened table ("… $ 7,469 In June 2026, we issued …").
 */
const PROSE_BOUNDARY = new RegExp([
  String.raw`\n+`,
  String.raw`(?<=[.!?])(?<!\b(?:[A-Z]|Inc|Co|Corp|Ltd|Mr|Ms|Mrs|Dr|No|Nos|St|Jr|Sr|v|vs|U\.S|U\.K|e\.g|i\.e)\.)\s+(?=[A-Z“"(])`,
  String.raw`\s+(?=\(\d{1,2}\)\s+[A-Z])`,
  String.raw`\s+(?=Note \d{1,2}\s*[-–—:.]\s*[A-Z])`,
  String.raw`(?<=[\d)%])\s+(?=[A-Z][a-z]+[ ,][^.]{0,80}?\b(?:we|our|was|were|is|are|had|has|have|represented|accounted)\b)`,
].join("|"), "g");
const TABLE_TOKEN = /^(?:[$(]?[\d,.]+\)?%?|\$|%|\(|\)|—|–|-)$/;

function passages(text: string, profile: EvidenceProfile): Passage[] {
  const { categories: families, prose, abbreviations } = PROFILES[profile];
  const split = prose !== undefined || abbreviations === true ? PROSE_BOUNDARY : FINANCIAL_BOUNDARY;
  const boundaries = [0, ...[...text.matchAll(split)].map((match) => match.index + match[0].length), text.length];
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
        const categories = families.filter((category) => CATEGORY_PATTERNS[category].test(body));
        const quantities = (body.match(/\d[\d,.]*\s*(?:%|billion|million)|\$\s*\d/g) ?? []).length;
        let score = Math.min(quantities, 8) * 3 + categories.length * 2 +
          (/\b(?:expect|outlook|guidance|tax charge|valuation allowance|severance|free cash flow)\b/i.test(body) ? 8 : 0);
        let table = false;
        if (prose) {
          // Named counterparties are the point of a business or notes passage;
          // a flattened table (mostly numbers) is not prose evidence.
          score += Math.min((body.match(ENTITY) ?? []).length, 4) * 2 + (prose.bonus.test(body) ? 8 : 0);
          const tokens = body.split(/\s+/).filter((token) => token !== "");
          table = tokens.length >= 12 && tokens.filter((token) => TABLE_TOKEN.test(token)).length / tokens.length > 0.35;
          if (table) score -= 12;
        }
        out.push({ start, end, text: body, categories, score, table });
      }
      start = end;
    }
  }
  return out;
}

export function selectMaterialEvidence(text: string, maxChars: number, profile: EvidenceProfile = "financial"): SelectedEvidence {
  const budget = Math.max(0, Math.floor(maxChars));
  const spec = PROFILES[profile];
  const all = passages(text, profile);
  const selected: Passage[] = [];
  const separator = "\n[…source passage omitted…]\n";
  /** Printed length of a selection: adjacent passages join without a separator (D-63 profiles). */
  const joinedLength = (list: readonly Passage[]): number => {
    const ordered = [...list].sort((a, b) => a.start - b.start);
    return ordered.reduce((sum, passage, i) => sum + passage.text.length + (i > 0 && ordered[i - 1]!.end !== passage.start ? separator.length : 0), 0);
  };
  // Counts/disclosure are never evidence and have a fixed reservation.
  const reserve = text.length > budget ? Math.min(budget, 210) : 0;
  let remaining = budget - reserve;
  const add = (passage: Passage): boolean => {
    if (selected.includes(passage)) return true;
    // A remaining commitment often refers to the investment in the preceding
    // sentence. Keep that adjacent, bounded context atomically with its funding
    // disclosure, rather than presenting an unbound amount or dropping its date.
    const previous = all[all.indexOf(passage) - 1];
    const fundingContext = passage.categories.includes("subsequent-liquidity") &&
      /\b(?:remaining|commitment|this|these|such|additional)\b/i.test(passage.text) && previous &&
      /\b(?:invested|investment|acquired|acquisition|purchase|agreement|commitment|loan|notes?)\b/i.test(previous.text);
    const marketingContext = passage.categories.includes("distribution-costs") && /^\s*(?:the|this)\s+(?:increase|decrease|change)\b/i.test(passage.text) &&
      previous?.categories.includes("distribution-costs");
    // AMZN audit 2026-10-20 finding 6: "those commitments not yet recognized
    // were approximately $ 496 billion" is a customer backlog only beside the
    // sentence that says whose commitments they are (Amazon's own purchase
    // commitments are another $650 billion).
    const backlogContext = passage.categories.includes("performance-obligations") &&
      /\b(?:those|these|such|this)\s+(?:commitments|obligations|amounts?|revenue|backlog)\b/i.test(passage.text) &&
      previous?.categories.includes("performance-obligations");
    const needsContext = fundingContext || marketingContext || backlogContext;
    const additions = (needsContext ? [previous, passage] : [passage]).filter((candidate) => !selected.includes(candidate));
    const cost = profile === "financial"
      ? additions.reduce((sum, candidate) => sum + candidate.text.length, 0) +
        separator.length * (selected.length > 0 ? additions.length : additions.length - 1)
      : joinedLength([...selected, ...additions]) - joinedLength(selected);
    if (cost > remaining) return false;
    selected.push(...additions);
    remaining -= cost;
    return true;
  };
  if (text.length <= budget) {
    selected.push({ start: 0, end: text.length, text, categories: [], score: 0, table: false });
  } else {
    // A bounded reservation for asserted facts prevents generic, numeric risk
    // prose from displacing a disclosed weakness or a pending case's caveats.
    if (spec.critical !== undefined) {
      const cap = Math.floor(budget * 0.25);
      let used = 0;
      for (const passage of all.filter((candidate) => !candidate.table && spec.critical!(candidate.text))) {
        if (used + passage.text.length > cap) continue;
        const before = remaining;
        if (add(passage)) used += before - remaining;
      }
    }
    // Priority passages (a named party in an 8-K's operative paragraph) first.
    if (spec.priority !== undefined) {
      const cap = spec.priorityShare === undefined ? Number.POSITIVE_INFINITY : Math.floor(budget * spec.priorityShare);
      let used = 0;
      for (const passage of all.filter((candidate) => !candidate.table && spec.priority!(candidate.text))) {
        if (spec.priorityShare !== undefined && used + passage.text.length > cap) continue;
        const before = remaining;
        if (add(passage)) used += before - remaining;
      }
    }
    // Every material family gets a turn before any family can fill the budget.
    // A flattened table never takes a family's turn (prose profiles only).
    const ranked = spec.categories.map((category) => all.filter((passage) => passage.categories.includes(category) && !passage.table)
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
  const categories = spec.categories.map((category) => {
    const available = all.filter((passage) => passage.categories.includes(category));
    const retained = available.filter((passage) => spans.some((span) => span.start <= passage.start && span.end >= passage.end));
    return { category, status: available.length === 0 ? "not-found" as const : retained.length === 0 ? "omitted" as const : "retained" as const,
      availablePassages: available.length, retainedPassages: retained.length };
  });
  const marker = omittedChars > 0
    ? `\n\n…[TRUNCATED ${omittedChars} of ${text.length} source chars omitted; material selection is incomplete; see coverage]`
    : "";
  // The D-63 profiles print two adjacent passages as the one source run they
  // are: the omission separator between them would claim a gap that is not there.
  const joined = profile === "financial"
    ? spans.map((span) => span.text).join(separator)
    : spans.map((span, i) => (i > 0 && spans[i - 1]!.end !== span.start ? separator : "") + span.text).join("");
  // Tiny caller budgets are valid too; do not return a marker longer than them.
  return { text: (joined + marker).slice(0, budget),
    truncated: omittedChars > 0, originalChars: text.length, spans,
    coverage: { version: profile === "financial" ? EVIDENCE_SELECTION_VERSION : `${profile === "risk" || profile === "notes" ? "section-evidence-3" : EVIDENCE_SELECTION_VERSION}/${profile}`, retainedChars, omittedChars, categories } };
}
