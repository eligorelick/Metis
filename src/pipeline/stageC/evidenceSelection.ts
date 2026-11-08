import { materialCreditSupportClauses } from "@/edgar/currentReports";
import { confirmedQuarterResultsSchedules } from "@/edgar/earningsSchedule";

/** Pure, bounded source selection. Offsets always refer to the original source. */
export const EVIDENCE_SELECTION_VERSION = "section-evidence-8";
/**
 * The notes and risk readings. section-evidence-4 (D-99, AMZN audit findings
 * 6 and 16): the performance-obligations family and the pending-case clauses
 * for government cases, their relief, fines and scheduled trials.
 */
export const NOTES_RISK_SELECTION_VERSION = "section-evidence-7";
/**
 * The 8-K event reading. section-evidence-5 (AI-101): a passage that refers to
 * a person by honorific and surname, or by a leading pronoun, is kept only
 * together with the sentence that introduces that person, and an award of
 * shares ranks like a dollar amount. Not -3: that numeral was the notes/risk
 * selector until D-99, and a version string must not change its method.
 * section-evidence-6 (FIGR paid audit R1): the operative passages are kept in
 * tiers, the dated lead first, then the amounts, then the passages that only
 * define a party; a dated lead may follow an item sub-heading ("Merger
 * Agreement On June 10, 2026"), a defined term may be printed with spaces inside
 * its quotes, and an amount may be written out in digits ("$532,426,000").
 */
export const EVENT_SELECTION_VERSION = "section-evidence-7";
export const MATERIAL_CATEGORIES = ["results", "guidance", "capex-liquidity", "tax", "exceptional", "fcf", "earnings-quality", "subsequent-liquidity", "distribution-costs", "operating-costs", "commercial-terms"] as const;
/**
 * D-63: 10-K Item 1 (Business) families. A business description carries few
 * figures, so the financial families above found almost nothing in it; these
 * name what an equity reader takes from it: the software platform and
 * ecosystem, the product roadmap, customers, suppliers and manufacturing,
 * competitors, export and other regulation, and the executive officers.
 */
export const BUSINESS_CATEGORIES = ["platform-software", "products-roadmap", "customers", "suppliers-manufacturing", "competition", "regulation-export", "officers", "commercial-terms", "reporting-changes"] as const;
/**
 * D-63: the latest 10-Q's notes to the financial statements. D-66: the 10-K's
 * notes are read with the same families, and business combinations (a deal's
 * consideration, goodwill and intangibles) join them.
 */
export const NOTES_CATEGORIES = ["investments", "commitments-guarantees", "customer-concentration", "debt", "capital-return", "contingencies", "internal-controls", "tax", "subsequent-liquidity", "business-combinations", "performance-obligations", "commercial-terms", "reporting-changes"] as const;
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
  /** C-16: the measures whose passages the superseding pass itself kept, when one ran. */
  superseded?: string[];
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
  "operating-costs": /\b(?:research and development|R&D|selling,? general and administrative|acquisition.related (?:costs|charges)|service.conditioned (?:shares|compensation))\b/i,
  "commercial-terms": /\b(?:warrants?|exercise price|reduction (?:of|in|to) revenue|contra.revenue|commercial agreement|design.win|deployment|purchase milestones)\b/i,
  "reporting-changes": /\b(?:reportable segment|nonreportable businesses|segment (?:reclassification|recast)|recast (?:prior|comparative))\b/i,
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
  debt: /\b(?:senior (?:unsecured )?notes|notes due|commercial paper|credit (?:facility|agreement)|warehouse|revolving|borrowings?|term loans?|debt (?:issuance|components|at fair value|carried)|issued an aggregate)\b/i,
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
  /**
   * R1: the priority passages' tiers, lower first (source order within a
   * tier); null is not a priority passage. Overrides `priority` when present.
   */
  priorityTier?: (passage: string) => number | null;
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
// R1: some filings print the defined term with spaces inside its quotes ("(the “ Company ”)").
const DEFINES_PARTY = /[A-Z][A-Za-z0-9.&'’-]*\.?,?\s*\((?:[^()“”"]{0,60},\s*)?(?:the\s+)?[“"]\s?[A-Z][^“”"]{0,40}[”"]\)/;
/**
 * An item's dated operative sentence ("(c) On July 1, 2026, the Company appointed …").
 * R1: a short title-case sub-heading may sit between the item title and the
 * date ("Item 1.01 (…): Merger Agreement On June 10, 2026, …").
 */
const DATED_LEAD = /^\s*(?:Item \d\.\d{2} \([^)]*\):\s*)?(?:(?:[A-Z][A-Za-z&'’-]*|and|of|the|for|to)\s+){0,5}?(?:\([a-z]\)\s*)?On (?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}\b/;
/** R1: a dollar amount with a scale word, or one written out in digits to the millions ("$532,426,000"). */
const EVENT_AMOUNT = /(?:US)?\$\s?(?:\d[\d,.]*\s*(?:billion|million|trillion)\b|\d{1,3}(?:,\d{3}){2,}(?:\.\d+)?(?![\d,]))/;
/**
 * R1 (FIGR paid audit): the event profile's priority tiers. The dated lead says
 * who did what and when; the amounts are the deal's terms; a passage that only
 * defines a party ("Northwind (the “Merger”)") comes last. In source order,
 * that defined-term passage used the room and the completion 8-K's
 * consideration ("approximately $590 million") was cut.
 */
function eventPriorityTier(passage: string): number | null {
  if (DATED_LEAD.test(passage)) return 0;
  if (materialCreditSupportClauses(passage).length > 0 || EVENT_AMOUNT.test(passage)) return 1;
  if (isFinancingLifecycle(passage)) return 1;
  return DEFINES_PARTY.test(passage) ? 2 : null;
}
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
const PROCEEDING_NOUN = String.raw`(?:cases?|complaints?|lawsuits?|suits?|actions?|charges|proceedings?)`;
const GOVERNMENT_CASE = new RegExp([
  String.raw`\b${AGENCY}\b[^.]{0,120}?\b(?:sued|(?:filed|brought|commenced)\s+(?:(?:a|an|the)\s+)?${PROCEEDING_NOUN})\b`,
  String.raw`\b${PROCEEDING_NOUN}\s+(?:(?:was|were|has been|have been)\s+)?(?:filed|brought|commenced)\s+by\b[^.]{0,120}?\b${AGENCY}\b`,
  String.raw`\b(?:impos(?:es|ed)|levied)\s+(?:remedial actions and\s+)?(?:a\s+)?fines?\s+of\b`,
].join("|"), "i");
const ALLEGED_ANTITRUST = /\balleg(?:e|es|ed|ing|ations?)\b[^.]{0,200}?\b(?:monopoli[sz](?:ation|e|ed|ing)|antitrust|abuse of (?:a )?dominan(?:ce|t position)|anticompetitive)\b/i;
const MATERIAL_RELIEF = /\bseek(?:s|ing)?\b[^.]{0,80}?\b(?:billions? of dollars|structural relief|divestitures?)\b/i;
const SCHEDULED_TRIAL = /\btrials?\b[^.]{0,60}?\b(?:scheduled|set)\s+(?:to\s+(?:begin|start|commence)\s+)?(?:for|in|on)\b/i;
// Independent review of these fixes: relief and a trial date count only
// beside a legal proceeding, a trial never when it is clinical or commercial,
// and an antitrust allegation never when it is only a risk the issuer may face.
const LEGAL_CONTEXT = /\b(?:court|jury|judge|plaintiffs?|complaints?|lawsuits?|suits?|litigation|proceedings?|cases?|antitrust|Attorneys? General|Commission|regulators?)\b/i;
const NON_LEGAL_TRIAL = /\b(?:clinical|Phase\s*(?:[0-9]|I{1,3}V?|IV)\S*|pivotal|registrational|patients?|enrol\w*|dosing|endpoints?|FDA|stud(?:y|ies)|product candidates?|free trial|trial period)\b/i;
// Codex review of PR #42: a modal within a few words of any proceeding verb
// ("regulators could bring actions", "proceedings may seek structural
// relief") states a risk, whichever clause would otherwise keep it.
const HYPOTHETICAL_CLAIM = /^\s*(?:if|should)\b|\b(?:may|could|might|would)\s+(?:\w+\s+){0,2}?(?:be|become|face|incur|result|bring|seek|file|commence|impose|levy|allege|sue|pursue|initiate)\b/i;
// Codex re-review of PR #42: the modal guard reads only the words up to and
// including the matched claim, so "the FTC filed a case ..., which could
// result in structural relief" stays an actual case while "regulators could
// bring actions alleging ..." does not.
const actualClaim = (pattern: RegExp, passage: string): boolean => {
  const match = pattern.exec(passage);
  return match !== null && !HYPOTHETICAL_CLAIM.test(passage.slice(0, match.index + match[0].length));
};
const materialProceeding = (passage: string): boolean =>
  actualClaim(GOVERNMENT_CASE, passage)
  || actualClaim(ALLEGED_ANTITRUST, passage)
  || (actualClaim(MATERIAL_RELIEF, passage) && LEGAL_CONTEXT.test(passage))
  || (actualClaim(SCHEDULED_TRIAL, passage) && LEGAL_CONTEXT.test(passage) && !NON_LEGAL_TRIAL.test(passage));
const criticalDisclosure = (passage: string): boolean => (CONTROL_DISCLOSURE.test(passage) && !HYPOTHETICAL_CONTROL.test(passage)) || LITIGATION_DISCLOSURE.test(passage) || materialProceeding(passage);
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
    priorityTier: eventPriorityTier,
    abbreviations: true,
  },
};
/**
 * Audit 2026-10-22 C-16: operating figures a 10-K states as a count of an
 * operating measure. Southern Co.'s 10-K excerpt stated "approximately nine
 * GWs" of large-load contracts; its newer 10-Q's "approximately 16 gigawatts"
 * sat 70% into a 172k-character MD&A and the interim selection dropped it,
 * so the passes argued from the superseded figure.
 */
// A count ends in a digit or is a number word; a bare year ("in 2025 customers") is not one.
const COUNT = String.raw`(?:(?!(?:19|20)\d\d\b(?![,.]\d))\d(?:[\d,.]*\d)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)(?:\s+(?:thousand|million|billion))?`;
/** Capacity, not energy: "megawatt-hours" and "gigawatt hours" are not capacity counts. */
const NOT_HOURS = String.raw`(?![- ]hours?\b)`;
export interface OperatingMeasure { name: string; pattern: RegExp }
const OPERATING_MEASURES: readonly OperatingMeasure[] = [
  { name: "gigawatts", pattern: new RegExp(String.raw`\b${COUNT}\s*(?:GWs?|gigawatts?)\b${NOT_HOURS}`, "i") },
  { name: "megawatts", pattern: new RegExp(String.raw`\b${COUNT}\s*(?:MWs?|megawatts?)\b${NOT_HOURS}`, "i") },
  { name: "backlog", pattern: /\bbacklog\b[^.]{0,80}?\$\s?\d|\$\s?[\d.,]+\s*(?:billion|million)\s+(?:of\s+)?backlog\b/i },
  { name: "customers", pattern: new RegExp(String.raw`\b${COUNT}\s+(?:\w+\s+)?customers\b`, "i") },
  { name: "subscribers", pattern: new RegExp(String.raw`\b${COUNT}\s+(?:\w+\s+)?(?:subscribers|paid memberships|paid members|paying members)\b`, "i") },
  // Physical units, not goodwill reporting units, organizational units, units of account or stock, performance and partnership units.
  { name: "units", pattern: new RegExp(String.raw`\b${COUNT}\s+(?:(?!(?:reporting|reportable|operating|geographic|organizational|business|stock|share|performance|restricted|partnership|LP|OP|common)\b)\w+\s+)?units\b(?!\s+of\s+account)`, "i") },
];
/** The operating measures a (10-K) text states with a count, in table order. */
export function operatingMeasuresStated(text: string): OperatingMeasure[] {
  return OPERATING_MEASURES.filter((measure) => measure.pattern.test(text));
}
/** The share of a budget that passages restating a 10-K operating figure may take. */
const SUPERSEDING_SHARE = 0.15;
/**
 * Integration of R8 (FIGR extra-high audit): R8 made flattened tables atomic,
 * and a table never takes a family's turn, so the MD&A's results-of-operations
 * table (FIGR: gain on sale of loans, gain on servicing asset) and its non-GAAP
 * reconciliation left the evidence; the old 1,100-character chunks had carried
 * them. An interim excerpt reserves a bounded share for these primary tables,
 * read from the table's own lead, before the qualifying contexts rotate.
 */
const PRIMARY_TABLE = /\b(?:Results of Operations|statements? of (?:operations|income|earnings)|reconciliation of\b[^.]{0,160}\b(?:adjusted|non-GAAP))/i;
const PRIMARY_TABLE_SHARE = 0.4;

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
// The surname capture admits an inner apostrophe only before a capital (O’Brien, D'Angelo), so a possessive
// "Ms. Testcase’s" captures "Testcase". A class that includes ’ captures "Testcase’s", matches no full name,
// and leaves the salary sentence orphaned, which is the defect.
const HONORIFIC_LEAD = /^\s*(?:Mr|Ms|Mrs|Dr)\.\s+([A-Z][\p{L}-]*(?:['’][A-Z][\p{L}-]*)*)/u;
const PRONOUN_LEAD = /^\s*(?:(?:In|During|On)\s[^,]{1,40},\s*)?(?:she|he|her|his)\b/iu;
const fullNameEnding = (surname: string) =>
  new RegExp(String.raw`\b[A-Z][\p{L}'’-]+(?:\s+[A-Z]\.)?\s+${surname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\b`, "u");
/**
 * AI-101: the passage that says who an event passage is about. An honorific and
 * surname at the start: the nearest earlier passage naming that person in full
 * ("Alan R. Testcase", "Jane Testcase"; "Mr. Testcase" does not match, because
 * "Mr" is followed by "."). A leading third-person pronoun: the previous passage.
 */
function eventReferent(all: readonly Passage[], index: number): Passage | undefined {
  const body = all[index]?.text ?? "";
  const honorific = HONORIFIC_LEAD.exec(body);
  if (honorific) {
    const name = fullNameEnding(honorific[1]!);
    for (let i = index - 1; i >= 0; i--) if (name.test(all[i]!.text)) return all[i];
    return undefined;
  }
  return PRONOUN_LEAD.test(body) && index > 0 ? all[index - 1] : undefined;
}
const TABLE_TOKEN = /^(?:[$(]?[\d,.]+\)?%?|\$|%|\(|\)|—|–|-)$/;

// R8: a number is evidence only together with the definition, scope and later
// status that qualify it. These are source relationships, not issuer rules.
const FOOTNOTE = /^\s*\(([A-Z]|\d{1,2})\)\s+/;
const DEFINITION = /\b(?:we define|is (?:defined|derived|calculated)|definition of|added\b[^.]{0,180}\bdefinition|retrospectively)\b/i;
const LIFECYCLE = /\b(?:(?:no|not any) (?:outstanding )?borrowings|terminated|repaid (?:in full|all|by)|fully repaid|no longer (?:controlled|consolidated)|ceased to be (?:controlled|consolidated))\b/i;
const FINANCING = /\b(?:debt|loans?|borrowings?|credit|facilit(?:y|ies)|warehouse|repurchase agreement|financing|notes|consolidated|merger)\b/i;
const CAUSE = /\b(?:primarily (?:driven|due|consisted)|driven by|largely due to|due to (?:the recognition|awards)|because of)\b/i;
const RELATED_DEBT = /\b(?:debt[^.]{0,65}related parties|related.part(?:y|ies)[^.]{0,65}(?:debt|liabilities|certificates))\b/i;
const THIRD_PARTY_CASH = /^(?=[\s\S]*\b(?:cash|payments|funds)\b)(?=[\s\S]*\b(?:third.part(?:y|ies)|on behalf of|for (?:our )?customers)\b)(?=[\s\S]*\b(?:held|holds?|due to|payables|custodial)\b)/i;
const SENSITIVITY = /\b(?:sensitivity|sensitivities)\b/i;
const KPI_TABLE = /\b(?:key (?:performance|operating|business) (?:measures|metrics|indicators)|operating (?:metrics|statistics)|KPIs?)\b/i;
function isFinancingLifecycle(body: string): boolean {
  const match = LIFECYCLE.exec(body);
  return match !== null && FINANCING.test(body) &&
    !/\b(?:if|unless|may|could|might|would|will|can|right to)\b[^.;]*$/i.test(body.slice(0, match.index));
}
const CONTEXT_BOUNDARY = new RegExp([
  PROSE_BOUNDARY.source
    .replace(String.raw`(?<=[.!?])`, String.raw`(?<=[.!?])(?<!\bn\.m\.)(?<!\bn\.a\.)`)
    .replace(String.raw`(?<=[\d)%])`, String.raw`(?<=[\d)%])(?<!\([A-Z0-9]{1,2}\))`),
  String.raw`\s+(?=\([A-Z]\)\s+[A-Z])`,
  String.raw`\s+(?=NOTE\s+\d{1,2}\s*[-–—:.])`,
  String.raw`(?<=[.!?])\s+(?=\d{1,3}\s+Table of Contents)`,
  String.raw`\s+(?=As of\s+\([Ii]n thousands)`,
  String.raw`(?<=[\d)%])\s+(?=(?:Three|Six|Nine|Twelve) [Mm]onths [Ee]nded)`,
  // A flattened table ends before the introduction to the next table.
  String.raw`(?<=[\d)%])\s+(?=[A-Z][A-Za-z &()—-]{0,80}The following table)`,
].join("|"), "g");

function isTable(body: string, headers = false): boolean {
  const tokens = body.trim().split(/\s+/);
  const numbers = tokens.filter((token) => TABLE_TOKEN.test(token)).length;
  return tokens.length >= 12 && (numbers / tokens.length > 0.35 ||
    (headers && numbers >= 8 && numbers / tokens.length > 0.18 && /\b(?:[Ii]n thousands|[Cc]arrying [Vv]alue|Three Months Ended)\b/.test(body)));
}

type ContextKind = "definition" | "lifecycle" | "sensitivity" | "components" | "cause" | "custodial-cash" | "capital-return";
function contextKind(passage: Passage): ContextKind | null {
  const body = passage.text;
  if (DEFINITION.test(body)) return "definition";
  if (isFinancingLifecycle(body)) return "lifecycle";
  if (SENSITIVITY.test(body) && /\b(?:fair value|valuation|assumption|hypothetical|illustrative)\b/i.test(body)) return "sensitivity";
  if (RELATED_DEBT.test(body) || (passage.table && /^\s*(?:\d{1,3}\s+Table of Contents\s+)?Other (?:income|expense)\b/i.test(body))) return "components";
  if (CAUSE.test(body) && /\b(?:expense|compensation|income|revenue|gain|loss|increase|decrease)\b/i.test(body) && /\d/.test(body)) return "cause";
  if (THIRD_PARTY_CASH.test(body) && /\d/.test(body)) return "custodial-cash";
  if (/\b(?:remaining authori[sz]|(?:no|not) shares[^.]{0,65}repurchas)/i.test(body)) return "capital-return";
  return null;
}

/** Atomic dependencies. Traversal in add() also binds shared table footnotes. */
function contextLinks(all: readonly Passage[], profile: EvidenceProfile): Map<Passage, Set<Passage>> {
  const links = new Map<Passage, Set<Passage>>();
  const bind = (a: Passage, b: Passage): void => {
    if (!links.has(a)) links.set(a, new Set());
    if (!links.has(b)) links.set(b, new Set());
    links.get(a)!.add(b);
    links.get(b)!.add(a);
  };
  for (let i = 0; i < all.length; i++) {
    const passage = all[i]!;
    // Commercial upside and its consideration, timing and accounting terms
    // are one reading. Keep bounded adjacent referents with the originating
    // transaction; if the group cannot fit, omit it rather than detach terms.
    if (strategyKind(passage) !== null) {
      const acquiree = /\b(?:acquired|acquisition of)\s+([A-Z][A-Za-z0-9-]+)/.exec(passage.text)?.[1];
      const consideration = strategyKind(passage) === "consideration";
      for (let j = i + 1; j < Math.min(all.length, i + 6); j++) {
        const next = all[j]!;
        const namedDescription = acquiree !== undefined && next.text.trimStart().startsWith(`${acquiree} `);
        const economicQualification = /\b(?:contracts?|agreements?|customers?|purchases?|orders?|revenue|margins?|payments?|shipments?|deliveries)\b/i.test(next.text) &&
          /\b(?:not disclosed|undisclosed|not guaranteed|subject to|cancel(?:lation|lable|led|ed)?|without penalty)\b/i.test(next.text);
        const warrantAccounting = consideration && /^\s*(?:The grant[- ]date fair value of the warrants?\b|As of\b[^.]{0,100}\bWarrant Shares\b)/i.test(next.text);
        if (next.table || !(namedDescription || economicQualification || warrantAccounting || /^\s*(?:The (?:warrant|acquisition|transaction|agreement|increase|decrease)|Its |Of the shares|These shares|Such |This |Previously,|Deployment |Contract revenue|Due to the timing of the acquisition)/i.test(next.text))) break;
        bind(passage, next);
      }
    }
    // The financial profile can split an oversized sentence into chunks.
    // A later warrant referent still depends on the full introduction, not
    // merely its last chunk; a budget too small for both must omit both.
    if (/^\s*The warrants?\b/i.test(passage.text)) {
      for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
        const previous = all[j]!;
        if (strategyKind(previous) === "consideration") {
          for (let k = j; k < i; k++) bind(all[k]!, passage);
          break;
        }
        if (profile !== "financial" || previous.table || previous.end !== all[j + 1]!.start) break;
      }
    }
    const kind = contextKind(passage);
    const marker = FOOTNOTE.exec(passage.text);
    if (marker) {
      // A metric's referenced footnote may be several other footnotes away.
      // Stop at the nearest table so repeated (A)/(B) labels do not cross tables.
      for (let j = i - 1; j >= 0 && passage.start - all[j]!.start < 8_000; j--) {
        if (!all[j]!.table) continue;
        if (all[j]!.text.includes(`(${marker[1]})`) && (KPI_TABLE.test(all[j]!.text) ||
          (kind === "definition" && /\b(?:we define|is (?:defined|derived|calculated))\b/i.test(passage.text)))) bind(all[j]!, passage);
        break;
      }
    }
    if (kind === "definition") {
      for (let j = i + 1; j < Math.min(all.length, i + 6); j++) {
        const next = all[j]!;
        if (next.table || FOOTNOTE.test(next.text) || !(/^\s*(?:These|This|Such|Valuation changes|Additionally|We believe|The (?:net|resulting|measure|metric))\b/i.test(next.text) ||
          /\b(?:deducted|excluded|divided|denominator|numerator)\b/i.test(next.text))) break;
        bind(passage, next);
      }
    }
    if (kind === "cause" && /^\s*(?:This|The (?:increase|decrease|change))\b/i.test(passage.text) && i > 0) bind(all[i - 1]!, passage);
    if (kind === "lifecycle") {
      // Preserve the preceding facility/transaction terms and following closure
      // qualifications. A bounded local chain cannot consume another note.
      for (let j = i - 1; profile !== "event" && j >= Math.max(0, i - 3); j--) {
        const previous = all[j]!;
        if (previous.table || passage.end - previous.start > 2_400 || !FINANCING.test(previous.text)) break;
        bind(previous, passage);
      }
      const next = all[i + 1];
      if (next && /^\s*(?:Upon such|Prior to|Concurrently|As a result)\b/i.test(next.text)) bind(passage, next);
    }
    if (kind === "sensitivity") {
      // Scope, independence/ownership caveats, shock headers and table rows are
      // one reading. Stop before the next ordinary table or note, not mid-row.
      for (let j = i + 1; j < all.length && all[j]!.start - passage.start <= 6_000; j++) {
        const next = all[j]!;
        if (/\b(?:The following table|NOTE\s+\d|Note\s+\d\s*[-—–])\b/.test(next.text) && !SENSITIVITY.test(next.text)) break;
        bind(passage, next);
        if (next.table) break;
      }
    }
    if (passage.table && contextKind(passage) === "components") {
      const next = all[i + 1];
      if (next && contextKind(next) === "cause") bind(passage, next);
    }
  }
  return links;
}

type StrategyKind = "consideration" | "acquisition" | "perimeter" | "deployment" | "costs";
function strategyKind(passage: Passage): StrategyKind | null {
  const body = passage.text;
  if (passage.table) return null;
  if (/\b(?:issued|granted)\b[^.]{0,100}\bwarrants?\b/i.test(body) && /\b(?:customer|commercial|purchase|exercise price|warrant shares)\b/i.test(body)) return "consideration";
  if (/\b(?:acquired|completed (?:the |an? )?acquisition)\b/i.test(body)) return "acquisition";
  if (/\b(?:beginning|effective|previously|reclassif|recast)/i.test(body) && CATEGORY_PATTERNS["reporting-changes"].test(body)) return "perimeter";
  if (/\b(?:selected|entered into|signed)\b/i.test(body) && /\b(?:commercial agreement|deployment|multi.year|design.win)\b/i.test(body)) return "deployment";
  if (CATEGORY_PATTERNS["operating-costs"].test(body) && /\b(?:increased|decreased|expense|costs)\b/i.test(body) && /\d/.test(body)) return "costs";
  return null;
}

/** R6: voting economics are independent of dividend/liquidation economics.
 * Keep the filed words, including adjacent definitions and elected/available
 * exemption qualifiers. Never derive present ownership from an IPO event.
 */
/**
 * Class votes, a holder's share of the vote, or controlled-company status.
 * Integration review (R6): "voting power" alone also names regulatory
 * ownership thresholds ("10% or more of the outstanding interests or voting
 * power of our Company" in a state-licensing change-of-control rule), which
 * brought unrelated licensing passages into FIGR's governance excerpt.
 */
const GOVERNANCE_TRIGGER = new RegExp([
  String.raw`\bvotes? per share\b`,
  String.raw`\bvoting (?:rights|ratio)\b`,
  String.raw`\bcontrolled.company\b`,
  String.raw`\b(?:combined|aggregate|total) voting power\b`,
  String.raw`\bvoting power of (?:all )?(?:our |the )?(?:outstanding )?(?:capital|common|ordinary) (?:stock|shares)\b`,
  String.raw`\d+(?:\.\d+)?\s?%\s+of\s+(?:the\s+|our\s+)?(?:combined\s+|aggregate\s+|total\s+|outstanding\s+)?voting power\b`,
].join("|"), "i");

export function selectGovernanceEvidence(text: string, maxChars: number): SelectedEvidence | null {
  const all = passages(text, "risk");
  const indices = new Set<number>();
  for (const [i, passage] of all.entries()) {
    if (!GOVERNANCE_TRIGGER.test(passage.text)) continue;
    for (let j = Math.max(0, i - 1); j <= Math.min(all.length - 1, i + 2); j++) indices.add(j);
  }
  const separator = "\n\n[OMITTED SOURCE PASSAGES]\n\n";
  const marker = "\n\n…[TRUNCATED: governance selection is incomplete; other source passages omitted]";
  let remaining = Math.max(0, Math.floor(maxChars)) - marker.length;
  const spans: EvidenceSpan[] = [];
  for (const i of [...indices].sort((a, b) => a - b)) {
    const passage = all[i]!;
    const cost = passage.text.length + (spans.length > 0 && spans.at(-1)!.end !== passage.start ? separator.length : 0);
    if (cost > remaining) continue;
    spans.push({ start: passage.start, end: passage.end, text: passage.text });
    remaining -= cost;
  }
  if (spans.length === 0) return null;
  const retainedChars = spans.reduce((sum, span) => sum + span.text.length, 0);
  const omittedChars = text.length - retainedChars;
  const joined = spans.map((span, i) => (i > 0 && spans[i - 1]!.end !== span.start ? separator : "") + span.text).join("");
  return { text: joined + (omittedChars > 0 ? marker : ""), spans, originalChars: text.length, truncated: omittedChars > 0,
    coverage: { version: "governance-evidence-1", retainedChars, omittedChars, categories: [] } };
}

function passages(text: string, profile: EvidenceProfile): Passage[] {
  const { categories: families, prose, abbreviations } = PROFILES[profile];
  const contextual = profile === "notes" || profile === "interim" || profile === "event";
  // Numbered clauses in an 8-K sentence are not table footnotes.
  const split = profile === "event" ? new RegExp(CONTEXT_BOUNDARY.source.replace(String.raw`\s+(?=\(\d{1,2}\)\s+[A-Z])|`, ""), "g")
    : contextual ? CONTEXT_BOUNDARY : prose !== undefined || abbreviations === true ? PROSE_BOUNDARY : FINANCIAL_BOUNDARY;
  const boundaries = [0, ...[...text.matchAll(split)].map((match) => match.index + match[0].length), text.length];
  const out: Passage[] = [];
  for (let i = 1; i < boundaries.length; i++) {
    let start = boundaries[i - 1];
    const stop = boundaries[i];
    while (start < stop) {
      // Whole sentences and flattened tables are atomic in the filing reading.
      // Oversized units are omitted with coverage, never printed as half a row.
      let end = contextual ? stop : Math.min(stop, start + 1_100);
      if (end < stop) {
        const space = text.lastIndexOf(" ", end);
        if (space > start + 700) end = space;
      }
      const body = text.slice(start, end);
      if (body.trim() !== "") {
        const categories = families.filter((category) => CATEGORY_PATTERNS[category].test(body));
        // An 8-K award "for 4,912 shares" ranks with the dollar amounts (AI-101).
        const quantities = (body.match(/\d[\d,.]*\s*(?:%|billion|million)|\$\s*\d/g) ?? []).length +
          (profile === "event" ? (body.match(/\b\d[\d,]*\s+shares\b/g) ?? []).length : 0);
        let score = Math.min(quantities, 8) * 3 + categories.length * 2 +
          (/\b(?:expect|outlook|guidance|tax charge|valuation allowance|severance|free cash flow)\b/i.test(body) ? 8 : 0);
        let table = contextual && isTable(body, true);
        if (prose) {
          // Named counterparties are the point of a business or notes passage;
          // a flattened table (mostly numbers) is not prose evidence.
          score += Math.min((body.match(ENTITY) ?? []).length, 4) * 2 + (prose.bonus.test(body) ? 8 : 0);
          table = isTable(body, contextual);
          if (table) score -= 12;
        }
        out.push({ start, end, text: body, categories, score, table });
      }
      start = end;
    }
  }
  return out;
}

/**
 * `superseding` (C-16): measures an older annual excerpt states a figure for.
 * The passages of this newer text stating a count of one of them are kept
 * first, one per measure in turn and in source order, within a fixed share of
 * the budget, displacing lower-ranked text.
 */
export function selectMaterialEvidence(text: string, maxChars: number, profile: EvidenceProfile = "financial", superseding: readonly OperatingMeasure[] = []): SelectedEvidence {
  const budget = Math.max(0, Math.floor(maxChars));
  const spec = PROFILES[profile];
  const all = passages(text, profile);
  const schedules = new Set<Passage>();
  if (profile === "financial") {
    // A schedule's introduction and date rows must survive as one exact source
    // passage. Sentence selection otherwise drops the dates or their authority.
    for (const schedule of confirmedQuarterResultsSchedules(text)) {
      const group = all.filter(p => p.start < schedule.end && p.end > schedule.start);
      if (!group.length) continue;
      const start = group[0]!.start, end = group.at(-1)!.end;
      const combined = { start, end, text: text.slice(start, end), categories: [...new Set(group.flatMap(p => p.categories))], score: Math.max(...group.map(p => p.score)), table: false };
      all.splice(all.indexOf(group[0]!), group.length, combined);
      for (const member of group) schedules.delete(member);
      schedules.add(combined);
    }
  }
  const contextual = profile === "notes" || profile === "interim" || profile === "event";
  const links = contextLinks(all, profile);
  const selected: Passage[] = [];
  const superseded = new Set<string>();
  const separator = "\n[…source passage omitted…]\n";
  /** Printed length of a selection: adjacent passages join without a separator (D-63 profiles). */
  const joinedLength = (list: readonly Passage[]): number => {
    const ordered = [...list].sort((a, b) => a.start - b.start);
    return ordered.reduce((sum, passage, i) => sum + passage.text.length + (i > 0 && ordered[i - 1]!.end !== passage.start ? separator.length : 0), 0);
  };
  // Coverage travels in the serialized excerpt too. Pay for its metadata with
  // lower-ranked source text, rather than increasing the payload caps. Limit
  // that reservation to a tenth so tiny standalone callers retain useful room.
  const coverageCost = contextual && profile !== "event" ? Math.min(Math.floor(budget / 10), JSON.stringify({
    categories: spec.categories.map(category => ({ category, status: "retained", availablePassages: all.length, retainedPassages: all.length })),
  }).length) : 0;
  const reserve = text.length > budget ? Math.min(budget, 210 + coverageCost) : 0;
  let remaining = budget - reserve;
  const add = (passage: Passage, limit = remaining): boolean => {
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
    // AI-101: an event passage about a person named elsewhere travels with the
    // sentence naming them (up to three hops, stopping at one already kept).
    const chain: Passage[] = [passage];
    if (profile === "event") {
      for (let hop = 0; hop < 3; hop++) {
        const referent = eventReferent(all, all.indexOf(chain[0]!));
        if (referent === undefined || chain.includes(referent) || selected.includes(referent)) break;
        chain.unshift(referent);
      }
    }
    const additions = [...(needsContext ? [previous, passage] : chain)].filter((candidate) => !selected.includes(candidate));
    for (let i = 0; i < additions.length; i++) {
      for (const linked of links.get(additions[i]!) ?? []) {
        if (!selected.includes(linked) && !additions.includes(linked)) additions.push(linked);
      }
    }
    const cost = profile === "financial"
      ? additions.reduce((sum, candidate) => sum + candidate.text.length, 0) +
        separator.length * (selected.length > 0 ? additions.length : additions.length - 1)
      : joinedLength([...selected, ...additions]) - joinedLength(selected);
    if (cost > remaining || cost > limit) return false;
    selected.push(...additions);
    remaining -= cost;
    return true;
  };
  if (text.length <= budget) {
    selected.push({ start: 0, end: text.length, text, categories: [], score: 0, table: false });
  } else {
    // At most one fifth of the existing budget; failure to fit keeps the
    // normal omission/refusal behavior and never cuts a calendar in half.
    let calendarBudget = Math.floor(budget / 5);
    for (const schedule of schedules) {
      const before = remaining;
      if (add(schedule, calendarBudget)) calendarBudget -= before - remaining;
    }
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
    // Reserve at most a quarter for material strategy economics, rotating
    // across topics so repeated deals cannot crowd out costs or perimeter
    // changes. This changes selection, never the meaning of the source.
    const strategyKinds: StrategyKind[] = ["consideration", "acquisition", "perimeter", "deployment", "costs"];
    const strategyQueues = strategyKinds.map(kind => all.filter(passage => strategyKind(passage) === kind));
    const strategyCap = Math.floor(budget * 0.25);
    let strategyUsed = 0;
    for (let round = 0; strategyQueues.some(queue => queue.length > round); round++) {
      for (const queue of strategyQueues) {
        const passage = queue[round];
        if (!passage || selected.includes(passage)) continue;
        const before = remaining;
        if (add(passage, strategyCap - strategyUsed)) strategyUsed += before - remaining;
      }
    }
    if (superseding.length > 0) {
      const cap = Math.floor(budget * SUPERSEDING_SHARE);
      const queues = superseding.map((measure) => all.filter((candidate) => !candidate.table && measure.pattern.test(candidate.text)));
      let used = 0;
      for (let round = 0; queues.some((queue) => queue.length > round); round++) {
        queues.forEach((queue, index) => {
          const passage = queue[round];
          if (passage === undefined || selected.includes(passage) || used + passage.text.length > cap) return;
          const before = remaining;
          if (add(passage)) {
            used += before - remaining;
            superseded.add(superseding[index]!.name);
          }
        });
      }
    }
    // Primary statement tables first (see PRIMARY_TABLE); a table split across
    // passages keeps its directly following row passages with it.
    if (profile === "interim") {
      const cap = Math.floor(budget * PRIMARY_TABLE_SHARE);
      let used = 0;
      for (const passage of all.filter((candidate) => candidate.table && PRIMARY_TABLE.test(candidate.text.slice(0, 400)))) {
        const group = [passage];
        for (let i = all.indexOf(passage) + 1; i < all.length && all[i]!.table && all[i]!.start === group.at(-1)!.end &&
          !PRIMARY_TABLE.test(all[i]!.text.slice(0, 400)); i++) group.push(all[i]!);
        const size = group.reduce((sum, member) => sum + member.text.length, 0);
        if (selected.includes(passage) || used + size > cap) continue;
        const before = remaining;
        const kept = selected.length;
        if (!group.every((member) => add(member))) {
          // Atomic: a primary table without its rows is not kept.
          selected.splice(kept);
          remaining = before;
          continue;
        }
        used += before - remaining;
      }
    }
    // R8: rotate through qualifying contexts before numeric density can fill
    // the budget. Related tables are eligible here even in a prose profile.
    // Bound these contexts to three quarters before the remaining families run.
    if (contextual && profile !== "event") {
      const kinds: ContextKind[] = ["definition", "lifecycle", "sensitivity", "components", "cause", "custodial-cash", "capital-return"];
      const rank = (passage: Passage): number => {
        if (/\bretrospectively\b/i.test(passage.text)) return -1;
        if (/\b(?:retrospectively|added[^.]{0,180}definition|is (?:derived|calculated))\b/i.test(passage.text)) return 0;
        if (/\b(?:no longer|ceased to be|no (?:outstanding )?borrowings)\b/i.test(passage.text)) return 0;
        if (/\b(?:stock.based compensation|other income|other expense)\b/i.test(passage.text)) return 0;
        return 1;
      };
      const queues = kinds.map((kind) => all.filter((passage) => contextKind(passage) === kind).sort((a, b) => rank(a) - rank(b) || a.start - b.start));
      let used = 0;
      const cap = Math.floor(budget * 0.75);
      for (let round = 0; queues.some((queue) => queue.length > round); round++) {
        for (const queue of queues) {
          const passage = queue[round];
          if (!passage || selected.includes(passage) || used >= cap) continue;
          const before = remaining;
          if (add(passage, cap - used)) used += before - remaining;
        }
      }
    }
    // Priority passages (a named party in an 8-K's operative paragraph) first:
    // by tier where the profile ranks them (R1), else in source order.
    const tier = spec.priorityTier ?? (spec.priority === undefined ? undefined : (passage: string) => spec.priority!(passage) ? 0 : null);
    if (tier !== undefined) {
      const cap = spec.priorityShare === undefined ? Number.POSITIVE_INFINITY : Math.floor(budget * spec.priorityShare);
      let used = 0;
      const tiered = all.flatMap((candidate) => {
        const rank = candidate.table ? null : tier(candidate.text);
        return rank === null ? [] : [{ candidate, rank }];
      }).sort((a, b) => a.rank - b.rank || a.candidate.start - b.candidate.start).map(({ candidate }) => candidate);
      for (const passage of tiered) {
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
    // Generic risk/business narrative can be useful without a keyword or
    // amount. Notes/interim fillers need a score or qualifying context; event
    // fallback skips agreement recitals but still admits named-person context.
    for (const passage of all.filter(candidate => !(profile === "notes" && HYPOTHETICAL_CLAIM.test(candidate.text) && LEGAL_CONTEXT.test(candidate.text) && !criticalDisclosure(candidate.text)))
      .filter((candidate) => candidate.score > 0 || (profile === "event"
      ? !/\b(?:foregoing description|incorporated by reference|previously reported|capitalized terms|representations, warranties)\b/i.test(candidate.text)
      : contextual ? contextKind(candidate) !== null : !/\bforward[- ]looking statements\b/i.test(candidate.text)))
      .sort((a, b) => b.score - a.score || a.start - b.start)) add(passage);
  }
  return renderSelection(text, budget, profile, all, selected, superseding, superseded);
}

/** R8: missing financing status uses the existing shared 8-K pool, displacing
 * lower-value event text. Every supplemental excerpt still has the ordinary
 * event cap; the primary transaction excerpt keeps its dated lead and price. */
export function selectEventLifecycleEvidence(text: string, maxChars: number, retained: readonly EvidenceSpan[]): SelectedEvidence | null {
  const budget = Math.max(0, Math.floor(maxChars));
  const all = passages(text, "event");
  const links = contextLinks(all, "event");
  const selected: Passage[] = [];
  const covered = (passage: Passage): boolean => retained.some(span => span.start <= passage.start && span.end >= passage.end);
  for (const passage of all.filter(candidate => contextKind(candidate) === "lifecycle")) {
    const group = [passage];
    for (let i = 0; i < group.length; i++) for (const linked of links.get(group[i]!) ?? []) if (!group.includes(linked)) group.push(linked);
    if (group.every(covered)) continue;
    const additions = group.filter(candidate => !selected.includes(candidate));
    const cost = [...selected, ...additions].reduce((sum, candidate) => sum + candidate.text.length + 30, 210);
    if (cost <= budget) selected.push(...additions);
  }
  if (selected.length === 0) return null;
  const result = renderSelection(text, budget, "event", all, selected);
  // This is supplementary status evidence, not a second reading of every
  // financial family. Its original spans/omission count remain available.
  result.coverage.categories = [];
  return result;
}

function renderSelection(text: string, budget: number, profile: EvidenceProfile, all: readonly Passage[], selected: Passage[], superseding: readonly OperatingMeasure[] = [], superseded = new Set<string>()): SelectedEvidence {
  const spec = PROFILES[profile];
  const separator = "\n[…source passage omitted…]\n";
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
    coverage: { version: profile === "financial" ? EVIDENCE_SELECTION_VERSION : `${profile === "risk" || profile === "notes" ? NOTES_RISK_SELECTION_VERSION : profile === "event" ? EVENT_SELECTION_VERSION : EVIDENCE_SELECTION_VERSION}/${profile}`, retainedChars, omittedChars, categories },
    ...(superseding.length > 0 ? { superseded: superseding.filter((measure) => superseded.has(measure.name)).map((measure) => measure.name) } : {}) };
}
