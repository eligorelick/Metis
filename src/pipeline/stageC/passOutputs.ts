/**
 * Per-pass output normalization, split out of passes.ts: analyst case and judge output casing,
 * citation fields, placeholder and unsafe-assumption checks, dated items, product-line headings and
 * the carried-section checks a retry keeps. Code owns numbers and labels (P18).
 */

import { ANALYST_CASE_SCHEMA, JUDGE_OUTPUT_SCHEMA, ANALYST_CASE_KEYS, FRED_ATTRIBUTION_TEXT, DevelopmentDirectionSchema, IsoDateSchema, ManagementActionCategorySchema, ManagementActorSchema, QUALITATIVE_ITEM_CAP, ShareholderAlignmentSchema, fillNullableGaps, invalidAnalystCaseSections, invalidJudgeOutputSections, noBuySellHold, productLineNamedInClaims, UNNAMED_PRODUCT_LINE_HEADING, type SourcedClaim } from "@/report/schema";
import { INCOMPLETE_ANALYST_CASE } from "@/pipeline/stageC/payload";
import { citationSourceId } from "@/pipeline/stageC/citations";
import { statesNumberWord } from "@/pipeline/stageC/consistency";
import { isPlainObject } from "./passParsing";

const CLAIM_LABEL_VALUES = new Set(["FACT", "ESTIMATE", "JUDGMENT"]);
const GRADE_VALUES = new Set(["A", "B", "C", "D", "F"]);
const SCENARIO_NAME_VALUES = new Set(["bull", "base", "bear"]);
const LOWER_ENUM_VALUES_BY_KEY: Record<string, ReadonlySet<string>> = {
  confidence: new Set(["high", "medium", "low"]),
  severity: new Set(["high", "medium", "low"]),
  significance: new Set(["high", "medium", "low"]),
  probability: new Set(["high", "medium", "low"]),
  direction: new Set(["positive", "negative", "mixed"]),
  strength: new Set(["none", "narrow", "wide"]),
  // Every member of the schema's disagreement kind. `entity` was missing, so a
  // judge writing `kind: "Entity"` — on exactly the entry the prompt forces it
  // to emit for a deterministic entity conflict — failed validation and burned
  // a paid judge retry while `Fact` and `Interpretation` were silently fixed.
  kind: new Set(["fact", "interpretation", "entity"]),
};

function normalizeUpperEnum(value: unknown, allowed: ReadonlySet<string>): unknown {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toUpperCase();
  return allowed.has(normalized) ? normalized : value;
}

function normalizeLowerEnum(value: unknown, allowed: ReadonlySet<string>): unknown {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  return allowed.has(normalized) ? normalized : value;
}

function bandLowMedHigh(p: number): "low" | "medium" | "high" {
  if (p < 1 / 3) return "low";
  if (p < 2 / 3) return "medium";
  return "high";
}

/**
 * Coerce a low/med/high-shaped value that isn't already a valid enum member.
 * Models (haiku especially) emit numeric or percent probabilities on risk
 * objects — natural confusion, since the same judge schema uses NUMERIC
 * probabilities for scenarios. Banding is mechanical and order-preserving
 * (<1/3 low, <2/3 medium, else high), so it maps the model's own judgment
 * rather than inventing one. Unrecognized values pass through for Zod to
 * reject as before.
 */
function coerceLowMedHigh(value: unknown): unknown {
  if (typeof value === "number" && Number.isFinite(value)) {
    return bandLowMedHigh(value > 1 ? value / 100 : value);
  }
  if (typeof value !== "string") return value;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "moderate" || trimmed === "med" || trimmed === "mid" || trimmed === "middle") {
    return "medium";
  }
  const pct = trimmed.match(/^(\d+(?:\.\d+)?)\s*%$/);
  if (pct) return bandLowMedHigh(Number(pct[1]) / 100);
  const num = Number(trimmed);
  if (trimmed !== "" && Number.isFinite(num)) return bandLowMedHigh(num > 1 ? num / 100 : num);
  return value;
}

const LOW_MED_HIGH = LOWER_ENUM_VALUES_BY_KEY.severity;

function isSourcedClaimLike(obj: Record<string, unknown>): boolean {
  return (
    typeof obj.text === "string" &&
    typeof obj.label === "string" &&
    typeof obj.source === "string" &&
    Object.prototype.hasOwnProperty.call(obj, "asOf")
  );
}

function normalizeKnownEnumCasing(raw: unknown): unknown {
  if (raw === null || typeof raw !== "object") return raw;
  if (Array.isArray(raw)) return raw.map(normalizeKnownEnumCasing);

  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    next[key] = normalizeKnownEnumCasing(value);
  }

  if (isSourcedClaimLike(next)) {
    next.label = normalizeUpperEnum(next.label, CLAIM_LABEL_VALUES);
  }
  if ("grade" in next) next.grade = normalizeUpperEnum(next.grade, GRADE_VALUES);
  if ("credibilityGrade" in next) {
    next.credibilityGrade = normalizeUpperEnum(next.credibilityGrade, GRADE_VALUES);
  }

  for (const [key, allowed] of Object.entries(LOWER_ENUM_VALUES_BY_KEY)) {
    if (key in next) next[key] = normalizeLowerEnum(next[key], allowed);
  }

  // Risk-shaped objects only (never scenarios, whose `probability` is
  // legitimately numeric): band numeric/percent probability/severity values
  // the casing pass couldn't fix into the low/med/high enum.
  if (
    typeof next.title === "string" &&
    "probability" in next &&
    "severity" in next &&
    "source" in next
  ) {
    for (const key of ["probability", "severity"] as const) {
      const value = next[key];
      if (typeof value !== "string" || !LOW_MED_HIGH.has(value)) {
        next[key] = coerceLowMedHigh(value);
      }
    }
  }

  return next;
}

/**
 * A blank or null `sourceId` is no citation: drop it so the claim or number cites its
 * `source`, as one without the field does (citationSourceId). The request
 * schema marks the field required, and the model fills it with "" whenever it
 * has no registry id; failing the parse on that would cost a repair (D-114).
 */
/** A valid ISO year ("2026") or year-month ("2026-01") without a day. */
function isPartialIsoDate(value: string): boolean {
  const match = /^(\d{4})(?:-(\d{2}))?$/.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = match[2] === undefined ? 1 : Number(match[2]);
  return year >= 1900 && year <= 2200 && month >= 1 && month <= 12;
}

function normalizeCitationFields(raw: unknown): unknown {
  if (raw === null || typeof raw !== "object") return raw;
  if (Array.isArray(raw)) return raw.map(normalizeCitationFields);
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (key === "sourceId" && (value === null || (typeof value === "string" && value.trim().length === 0))) continue;
    next[key] = normalizeCitationFields(value);
  }
  // D-295 (P18): a figure definition is written only by deterministic code.
  if (typeof next.value === "number" && typeof next.unit === "string") delete next.definition;
  // FIG / Sonnet 5.5: a canonical sourceId with source:"" is already a
  // citation, but the required legacy field rejected the whole paid answer.
  // Copy only a syntactically valid ID on a claim/number; provenance and truth
  // still require verification. Preserve any nonblank legacy source verbatim.
  const carrier = (typeof next.text === "string" && typeof next.label === "string") ||
    (typeof next.value === "number" && typeof next.unit === "string");
  // D-156: a claim or number's `asOf` is nullable and null is its "no date";
  // a blank string is read the same way, so it never rejects a whole case.
  // D-182: a valid month or year alone ("2026-01", "2026") is a coarser date,
  // not a wrong one, and must not cost a repair round; it is read as no date too (the claim's text keeps the
  // period, and no day is invented). Any other malformed date still fails.
  if (carrier && typeof next.asOf === "string" && (next.asOf.trim() === "" || isPartialIsoDate(next.asOf.trim()))) next.asOf = null;
  if (carrier && (next.source == null || (typeof next.source === "string" && next.source.trim() === "")) &&
      typeof next.sourceId === "string") {
    const id = citationSourceId({ sourceId: next.sourceId });
    if (id !== null) next.source = id;
  }
  // A placeholder duplicate ID conveys no citation. Keep the independently
  // supplied legacy citation, which the verifier will still have to resolve.
  if (carrier && hasPlaceholderContent(next.sourceId, "sourceId") && typeof next.source === "string" &&
      !hasPlaceholderContent(next.source, "source") && citationSourceId({ source: next.source }) !== null) {
    delete next.sourceId;
  }
  return next;
}

function removeUnsafeAnalystAssumptions(raw: unknown): unknown {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const root = raw as Record<string, unknown>;
  const priceTarget = root.priceTarget;
  if (priceTarget === null || typeof priceTarget !== "object" || Array.isArray(priceTarget)) return raw;
  const target = priceTarget as Record<string, unknown>;
  if (!Array.isArray(target.assumptions)) return raw;
  return {
    ...root,
    priceTarget: {
      ...target,
      assumptions: target.assumptions.filter(
        (item) => typeof item !== "string" || noBuySellHold(item),
      ),
    },
  };
}

/** An analyst output as the schema sees it: the parse and the carried-section check share this. */
function normalizeAnalystCase(raw: unknown): unknown {
  // fillNullableGaps: the request schema lets the model OMIT a nullable field
  // instead of sending null (collapseNullableComplexity, report/schema.ts) —
  // restore the null before validating against the still-strict Zod schema.
  return fillNullableGaps(ANALYST_CASE_SCHEMA, removeUnsafeAnalystAssumptions(normalizeKnownEnumCasing(normalizeCitationFields(raw))));
}

/**
 * Why one section of a schema-valid analyst case is too thin to stand, or
 * null (D-113). A case of one thesis claim, no drivers, risks or catalysts and
 * a price target of 0 with no horizon passes the schema, and every debate card
 * would read "Not addressed by the bull case".
 * Catalysts and evidence may be empty: the framing asks for catalysts only
 * where they exist.
 */
function hasPlaceholderContent(value: unknown, field = ""): boolean {
  if (typeof value === "string") return ["text", "source", "sourceId", "horizon", "assumptions"].includes(field) && /^(?:x+|tbd|todo|placeholder)$/i.test(value.trim());
  if (Array.isArray(value)) return value.some(item => hasPlaceholderContent(item, field));
  return value !== null && typeof value === "object" && Object.entries(value).some(([key, item]) => hasPlaceholderContent(item, key));
}

function analystSectionGap(key: string, value: unknown): string | null {
  if (hasPlaceholderContent(value, key)) return `\`${key}\` contains placeholder content; supply supported content or an explicit evidence limitation`;
  if (key === "thesis" || key === "keyDrivers" || key === "risksToCase") {
    return Array.isArray(value) && value.length === 0 ? `\`${key}\` is empty: give it at least one sourced claim` : null;
  }
  if (key !== "priceTarget" || value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const target = value as { value?: unknown; horizon?: unknown; assumptions?: unknown };
  const gaps = [
    ...(typeof target.value === "number" && !(target.value > 0) ? ["`priceTarget.value` must be a positive price"] : []),
    ...(typeof target.horizon === "string" && target.horizon.trim().length === 0 ? ["`priceTarget.horizon` is empty: state the horizon"] : []),
    ...(Array.isArray(target.assumptions) && !target.assumptions.some(item => typeof item === "string" && item.trim().length > 0)
      ? ["`priceTarget.assumptions` must explain the target or explicitly qualify insufficient valuation evidence"] : []),
  ];
  return gaps.length === 0 ? null : gaps.join("; ");
}

/**
 * Schema validation, then the content check: a thin case fails like a schema
 * error, so the runner's one repair re-asks with this reason as its feedback.
 */
export const parseAnalystCase = (raw: unknown) => {
  const r = ANALYST_CASE_SCHEMA.safeParse(normalizeAnalystCase(raw));
  if (!r.success) return { ok: false, error: r.error.message } as const;
  const sections: Record<string, unknown> = r.data;
  const gaps = ANALYST_CASE_KEYS.flatMap((key) => analystSectionGap(key, sections[key]) ?? []);
  return gaps.length === 0
    ? ({ ok: true, value: r.data } as const)
    : ({ ok: false, error: `${INCOMPLETE_ANALYST_CASE} ${gaps.join("; ")}` } as const);
};

function cleanRatingSafeArray(value: unknown): unknown {
  return Array.isArray(value)
    ? value.filter((item) => typeof item !== "string" || noBuySellHold(item))
    : value;
}

/** A sentence that opens as the analyst's own interpretation. */
const JUDGMENT_OPENER = /^(?:In our (?:judgment|view)|We (?:judge|think|believe|read|consider))\b/;
const EMBEDDED_JUDGMENT = /(?<=[.!?])\s+(?=(?:In our (?:judgment|view)|We (?:judge|think|believe|read|consider))\b)/;

function isClaimCarrier(value: unknown): value is Record<string, unknown> & { text: string; label: string } {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).text === "string" && typeof (value as Record<string, unknown>).label === "string" &&
    typeof (value as Record<string, unknown>).source === "string";
}

/**
 * D-157: a FACT holds only its sourced
 * statement. In a list of claims, a FACT's sentences from the first one that
 * opens as an interpretation ("In our judgment …") on become a JUDGMENT claim
 * with the same citation, and a FACT that opens that way is a JUDGMENT. A claim
 * outside a list is left whole: its slot holds one claim.
 */
function splitEmbeddedJudgments(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (!isClaimCarrier(item) || item.label !== "FACT") return [splitEmbeddedJudgments(item)];
      const text = item.text.trim();
      if (JUDGMENT_OPENER.test(text)) return [{ ...item, label: "JUDGMENT" }];
      const at = EMBEDDED_JUDGMENT.exec(text);
      if (at === null) return [item];
      const factText = text.slice(0, at.index).trim();
      const judgmentText = text.slice(at.index + at[0].length).trim();
      return factText === "" || judgmentText === "" ? [item] : [{ ...item, text: factText }, { ...item, label: "JUDGMENT", text: judgmentText }];
    });
  }
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, splitEmbeddedJudgments(child)]));
}

/* ------------------------------------------------------------------------ *
 * Q1: recent developments and management actions. A paid section request is
 * not discarded for a shape a careful reader would accept: these repairs keep
 * every sourced claim and never invent one.
 * ------------------------------------------------------------------------ */

/** An event date, or null: a timestamp keeps its day; a month or quarter is not a date. */
function normalizedOccurredOn(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const day = trimmed.slice(0, 10);
  const shaped = trimmed.length === 10 || /^\d{4}-\d{2}-\d{2}T/.test(trimmed);
  return shaped && /^\d{4}-\d{2}-\d{2}$/.test(day) && IsoDateSchema.safeParse(day).success ? day : null;
}

/** A claim list: a single claim becomes a list; blank claims and bare text (no citation) are dropped; a missing list is empty. */
function normalizedClaimList(value: unknown): unknown {
  if (value === undefined || value === null || typeof value === "string") return [];
  const list = isPlainObject(value) ? [value] : value;
  if (!Array.isArray(list)) return list;
  return list.filter((claim) => isPlainObject(claim) && !(typeof claim.text === "string" && claim.text.trim() === ""));
}

function normalizedText(value: unknown): unknown {
  return value === undefined || value === null ? "" : value;
}

/** A missing headline is the item's own first sourced fact, shortened at a word boundary. */
function derivedTitle(title: unknown, facts: unknown): unknown {
  if (typeof title === "string" && title.trim() !== "") return title;
  const first = Array.isArray(facts) && isPlainObject(facts[0]) && typeof facts[0].text === "string" ? facts[0].text.trim() : null;
  if (first === null) return title ?? "";
  if (first.length <= 80) return first;
  const cut = first.slice(0, 80);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 40)).replace(/[\s,;:]+$/, "")}…`;
}

/**
 * Dated items newest first (undated last, original order otherwise), capped.
 * An item whose factual list is empty carries no sourced fact and is dropped.
 */
function normalizedDatedItems(items: unknown, factKey: string, viewKey: string, repair: (item: Record<string, unknown>) => Record<string, unknown>): unknown {
  if (!Array.isArray(items)) return items;
  const kept = items.flatMap((item, index) => {
    if (!isPlainObject(item)) return [{ item: item as unknown, index }];
    const next = repair({ ...item, occurredOn: normalizedOccurredOn(item.occurredOn),
      [factKey]: normalizedClaimList(item[factKey]), [viewKey]: normalizedClaimList(item[viewKey]) });
    const facts = next[factKey];
    return Array.isArray(facts) && facts.length === 0 ? [] : [{ item: next as unknown, index }];
  });
  const date = (item: unknown): string => isPlainObject(item) && typeof item.occurredOn === "string" ? item.occurredOn : "";
  return kept.sort((a, b) => date(b.item).localeCompare(date(a.item)) || a.index - b.index)
    .slice(0, QUALITATIVE_ITEM_CAP).map(({ item }) => item);
}

const DIRECTION_VALUES: ReadonlySet<string> = new Set(DevelopmentDirectionSchema.options);
const CATEGORY_VALUES: ReadonlySet<string> = new Set(ManagementActionCategorySchema.options);
const ALIGNMENT_VALUES: ReadonlySet<string> = new Set(ShareholderAlignmentSchema.options);
const ACTOR_VALUES: ReadonlySet<string> = new Set(ManagementActorSchema.options);
/** Hyphenated lower-case words, so a rule can match whole words anywhere in the label. */
const labelKey = (value: string): string => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
// Ordered: the subject of the action (pay, an insider trade) outranks who acted.
const CATEGORY_RULES: ReadonlyArray<[RegExp, string]> = [
  [/(?:^|-)(?:compensation|remuneration|pay|comp|bonus)(?:-|$)/, "compensation"],
  [/(?:^|-)(?:insider|10b5|form-4)(?:-|$)|(?:^|-)(?:stock|share|director|officer|executive|ceo|cfo)-(?:sale|sales|sell|selling|purchase|purchases|buy|buying)(?:-|$)/, "insider-transaction"],
  [/(?:^|-)(?:buyback|buybacks|repurchase|repurchases|dividend|dividends|debt|financing|refinancing|capital|notes|bonds?|issuance|offering)(?:-|$)/, "capital-allocation"],
  [/(?:^|-)(?:acquisition|acquisitions|acquire|acquired|divestiture|divestment|divest|merger|m-a|disposal|spin-off|spinoff)(?:-|$)/, "acquisition-divestiture"],
  [/(?:^|-)(?:guidance|outlook|forecast)(?:-|$)/, "guidance"],
  [/(?:^|-)(?:board|director|directors)(?:-|$)/, "board-change"],
  [/(?:^|-)(?:executive|executives|officer|officers|management|ceo|cfo|coo|leadership|succession|appointment|resignation|retirement|departure)(?:-|$)/, "leadership-change"],
  [/(?:^|-)(?:strateg|restructur|reorgani[sz]|transformation)/, "strategy"],
];
const ACTOR_RULES: ReadonlyArray<[RegExp, string]> = [
  [/(?:^|-)(?:ceo|chief-executive)(?:-|$)/, "ceo"],
  [/(?:^|-)(?:cfo|chief-financial)(?:-|$)/, "cfo"],
  [/(?:^|-)(?:board|director|directors|chair|chairman|chairwoman|chairperson|committee)(?:-|$)/, "board"],
  [/(?:^|-)(?:company|management|issuer|firm|group)(?:-|$)/, "company"],
  [/(?:^|-)(?:officer|officers|executive|executives|president|coo|cto|cio|counsel|chief|evp|svp|vp|treasurer|secretary)(?:-|$)/, "other-executive"],
];

function normalizedLabel(value: unknown, allowed: ReadonlySet<string>, rules: ReadonlyArray<[RegExp, string]>, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const key = labelKey(value);
  if (allowed.has(key)) return key;
  return rules.find(([pattern]) => pattern.test(key))?.[1] ?? fallback;
}

function normalizedAlignment(value: unknown): string {
  return normalizedLabel(value, ALIGNMENT_VALUES, [
    [/^(?:mis|not-|un|poorly-)aligned|^against/, "misaligned"],
    [/^(?:partial|partly|somewhat|mixed)/, "mixed"],
    [/^(?:well-|fully-|strongly-)?aligned/, "aligned"],
  ], "unclear");
}

function normalizeRecentDevelopments(verdict: Record<string, unknown>): Record<string, unknown> {
  const next = { ...verdict };
  let value = next.recentDevelopments;
  if (value === null) { delete next.recentDevelopments; return next; }
  if (Array.isArray(value)) value = { summary: [], items: value };
  if (!isPlainObject(value)) return next;
  next.recentDevelopments = { ...value, summary: normalizedClaimList(value.summary),
    items: normalizedDatedItems(value.items ?? [], "whatHappened", "whyItMatters", (item) => ({ ...item,
      title: derivedTitle(item.title, item.whatHappened),
      // Casing is already repaired; any other word is the mixed case, not a lost section.
      direction: typeof item.direction === "string" && DIRECTION_VALUES.has(item.direction) ? item.direction : "mixed",
      affects: normalizedText(item.affects) })) };
  return next;
}

function normalizeManagementActions(leadership: Record<string, unknown>): Record<string, unknown> {
  const next = { ...leadership };
  if (next.managementActions === null) { delete next.managementActions; return next; }
  if (!Array.isArray(next.managementActions)) return next;
  next.managementActions = normalizedDatedItems(next.managementActions, "action", "assessment", (item) => ({ ...item,
    category: normalizedLabel(item.category, CATEGORY_VALUES, CATEGORY_RULES, "other"),
    shareholderAlignment: normalizedAlignment(item.shareholderAlignment),
    // A role only: a name here would escape the named-person check that reads cited claims.
    actor: normalizedLabel(item.actor, ACTOR_VALUES, ACTOR_RULES, "unspecified") }));
  return next;
}

export function normalizeJudgeOutput(raw: unknown): unknown {
  const enumNormalized = normalizeKnownEnumCasing(normalizeCitationFields(raw));
  if (enumNormalized === null || typeof enumNormalized !== "object" || Array.isArray(enumNormalized)) {
    return enumNormalized;
  }
  const root = { ...(enumNormalized as Record<string, unknown>) };

  // Generation uses lists even when a model supplies a legacy single claim.
  // Do this before splitting embedded judgments so facts keep their own label.
  // ReportSchema deliberately preserves saved single objects and their paths.
  if (isPlainObject(root.catalystsRisks)) {
    const section = { ...root.catalystsRisks };
    for (const key of ["catalysts", "risks"]) {
      if (Array.isArray(section[key])) section[key] = section[key].map(item =>
        isPlainObject(item) && isPlainObject(item.reasoning)
          ? { ...item, reasoning: [item.reasoning] } : item);
    }
    root.catalystsRisks = section;
  }

  if (isPlainObject(root.verdict)) root.verdict = normalizeRecentDevelopments(root.verdict);
  if (isPlainObject(root.leadership)) root.leadership = normalizeManagementActions(root.leadership);

  if (root.macro !== null && typeof root.macro === "object" && !Array.isArray(root.macro)) {
    root.macro = {
      ...(root.macro as Record<string, unknown>),
      fredAttribution: FRED_ATTRIBUTION_TEXT,
    };
  }

  if (root.valuation !== null && typeof root.valuation === "object" && !Array.isArray(root.valuation)) {
    const valuation = { ...(root.valuation as Record<string, unknown>) };
    if (Array.isArray(valuation.scenarios)) {
      const scenarios = valuation.scenarios.map((scenario) => {
        if (scenario === null || typeof scenario !== "object" || Array.isArray(scenario)) return scenario;
        const next = { ...(scenario as Record<string, unknown>) };
        next.name = normalizeLowerEnum(next.name, SCENARIO_NAME_VALUES);
        next.assumptions = cleanRatingSafeArray(next.assumptions);
        next.whatWouldHaveToBeTrue = cleanRatingSafeArray(next.whatWouldHaveToBeTrue);
        // Scenario price targets are DETERMINISTIC (Stage B computeScenarioTargets),
        // injected by assembleReport — the judge/LLM does not author them. Null any
        // number the model emitted anyway so it never reaches the verify pass's
        // citation-coverage count nor the report (P18). assembleReport then overwrites this with the computed target
        // or leaves it null when suppressed.
        next.priceTarget = null;
        // The only displayed weights come from the computed projection prior.
        // Do not compare, validate or publish model-invented scenario odds.
        next.probability = null;
        return next;
      });
      valuation.scenarios = scenarios;
    }
    // DCF perShare + upsidePct + assumptions table + sensitivityGrid are ALL
    // DETERMINISTIC (Stage B computeFairValue / computeDcfDisplay), injected by
    // assembleReport — discard any the judge emitted so they never reach the verify
    // pass count nor the report (P18). assembleReport injects the computed values (or empties off the
    // DCF route). The judge keeps only the reverse-DCF narrative + interpretation.
    if (valuation.dcf !== null && typeof valuation.dcf === "object" && !Array.isArray(valuation.dcf)) {
      valuation.dcf = {
        ...(valuation.dcf as Record<string, unknown>),
        perShare: null,
        upsidePct: null,
        assumptions: [],
        sensitivityGrid: [],
      };
    }
    root.valuation = valuation;
  }

  return withNamedProductLines(splitEmbeddedJudgments(root));
}

/** D-271 (P18): the generated business-story lists whose items carry a product-line heading. */
const PRODUCT_LINE_FIELDS = [["business", "products"], ["competitive", "competitorsByProductLine"]] as const;
/** D-271: the generated business-story claim lists (blank claims are regenerated). */
const BUSINESS_STORY_CLAIM_FIELDS = [["business", "marketStructure"], ["business", "whatIsComing"], ["business", "customersAndSuppliers"],
  ["business", "protection"], ["business", "managementPlan"], ["business", "industry"], ["competitive", "competitors"]] as const;

/**
 * D-271 (P18): a product-line heading is a label, so it stands only when one of
 * the item's own FACT claims writes that name. Otherwise the code-owned
 * heading replaces it; the claims are kept and verified as usual. Runs after
 * embedded judgments are split, so only sourced statements can name the line.
 */
/** D-271: a heading longer than this is a sentence, not a name. */
export const PRODUCT_LINE_HEADING_MAX_WORDS = 8;
export const PRODUCT_LINE_HEADING_MAX_CHARS = 60;

/**
 * D-271: a heading is a name, never a claim.
 * It may carry no digit, percent sign, currency symbol (Unicode Sc) or number
 * word (the verifier's own `statesNumberWord` list), and at most
 * {@link PRODUCT_LINE_HEADING_MAX_WORDS} words and
 * {@link PRODUCT_LINE_HEADING_MAX_CHARS} characters.
 */
export function productLineHeadingIsName(heading: string): boolean {
  const text = heading.trim();
  return text.length > 0 && text.length <= PRODUCT_LINE_HEADING_MAX_CHARS &&
    text.split(/\s+/).length <= PRODUCT_LINE_HEADING_MAX_WORDS &&
    !/[\p{N}%\p{Sc}]/u.test(text) && !statesNumberWord(text);
}

function withNamedProductLines(value: unknown): unknown {
  if (!isPlainObject(value)) return value;
  const root = { ...value };
  for (const [section, field] of PRODUCT_LINE_FIELDS) {
    const owner = root[section];
    if (!isPlainObject(owner) || !Array.isArray(owner[field])) continue;
    root[section] = { ...owner, [field]: owner[field].map(item => {
      if (!isPlainObject(item) || typeof item.productLine !== "string" || !Array.isArray(item.claims)) return item;
      const claims = item.claims.filter((claim): claim is { text: string; label: SourcedClaim["label"] } =>
        isPlainObject(claim) && typeof claim.text === "string" && typeof claim.label === "string");
      return productLineHeadingIsName(item.productLine) && productLineNamedInClaims({ productLine: item.productLine, claims })
        ? item : { ...item, productLine: UNNAMED_PRODUCT_LINE_HEADING };
    }) };
  }
  return root;
}

export const parseJudgeOutput = (raw: unknown) => {
  // See normalizeAnalystCase — same nullable-omission compensation.
  const r = JUDGE_OUTPUT_SCHEMA.safeParse(fillNullableGaps(JUDGE_OUTPUT_SCHEMA, normalizeJudgeOutput(raw)));
  if (r.success) {
    const gaps = invalidJudgeGenerationSections(r.data);
    if (gaps.length) return { ok: false, error: `Generation sections need substantive content: ${gaps.join(", ")}` } as const;
  }
  return r.success
    ? ({ ok: true, value: r.data } as const)
    : ({ ok: false, error: r.error.message } as const);
};

function invalidJudgeGenerationSections(sections: Record<string, unknown>): string[] {
  const invalid: string[] = [];
  if (isPlainObject(sections.verdict) && typeof sections.verdict.synthesis === "string" && !sections.verdict.synthesis.trim()) invalid.push("verdict");
  if (isPlainObject(sections.business) && Array.isArray(sections.business.whatTheySell) &&
      (sections.business.whatTheySell.length === 0 || sections.business.whatTheySell.some(claim => isPlainObject(claim) && typeof claim.text === "string" && !claim.text.trim()))) invalid.push("business");
  // The arrays may be empty or absent (historical output), but a carried blank
  // claim must be regenerated just as it would be in a complete response.
  const blank = (claim: unknown) => isPlainObject(claim) && typeof claim.text === "string" && !claim.text.trim();
  for (const [section, field] of BUSINESS_STORY_CLAIM_FIELDS) {
    const value = sections[section];
    if (isPlainObject(value) && Array.isArray(value[field]) && value[field].some(blank) && !invalid.includes(section)) invalid.push(section);
  }
  for (const [section, field] of PRODUCT_LINE_FIELDS) {
    const value = sections[section];
    if (isPlainObject(value) && Array.isArray(value[field]) && value[field].some(item =>
      isPlainObject(item) && Array.isArray(item.claims) && item.claims.some(blank)) && !invalid.includes(section)) invalid.push(section);
  }
  return invalid;
}

/** Sections carried from a cut-off response, split by whether they can be kept (D-111). */
export interface CarriedSectionCheck {
  /** The sections that validate on their own, exactly as written. */
  kept: Record<string, unknown>;
  /** The sections that do not, in the order they were written; the retry asks for them again. */
  dropped: string[];
}

function splitCarriedSections(
  sections: Record<string, unknown>,
  normalized: unknown,
  invalid: (sections: Record<string, unknown>) => string[],
): CarriedSectionCheck {
  const view = normalized !== null && typeof normalized === "object" && !Array.isArray(normalized)
    ? (normalized as Record<string, unknown>)
    : {};
  const bad = new Set(invalid(Object.fromEntries(Object.keys(sections).map((key) => [key, view[key]]))));
  return {
    kept: Object.fromEntries(Object.entries(sections).filter(([key]) => !bad.has(key))),
    dropped: Object.keys(sections).filter((key) => bad.has(key)),
  };
}

/**
 * D-111: a carried section overrides whatever the retry writes
 * for it, so a parseable but schema-invalid one failed the merged output
 * whatever the retry returned. Each section is normalized as the full parse
 * normalizes it and checked alone; the ones that fail are dropped, so the
 * retry is asked for them again.
 */
export function checkCarriedJudgeSections(sections: Record<string, unknown>): CarriedSectionCheck {
  return splitCarriedSections(
    sections,
    fillNullableGaps(JUDGE_OUTPUT_SCHEMA, normalizeJudgeOutput(sections)),
    normalized => [...invalidJudgeOutputSections(normalized), ...invalidJudgeGenerationSections(normalized)],
  );
}

/**
 * As checkCarriedJudgeSections, for a bull or bear case. A carried section
 * that is too thin (analystSectionGap) would fail the merged case the same
 * way, so it is asked for again too.
 */
export function checkCarriedAnalystSections(sections: Record<string, unknown>): CarriedSectionCheck {
  return splitCarriedSections(sections, normalizeAnalystCase(sections), (normalized) => [
    ...invalidAnalystCaseSections(normalized),
    ...Object.keys(normalized).filter((key) => analystSectionGap(key, normalized[key]) !== null),
  ]);
}
