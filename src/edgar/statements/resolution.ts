/** Filed field resolution and typed disclosures; missing evidence stays a gap (P10, P20; D-134). */
import { type FactPoint } from "@/edgar/xbrl";
import { type Derivation, type OriginalValue, type FilingRef, type Substitution, type Withholding } from "./types";
import { type StatementFieldProvenance, type FiledIncomeLine } from "@/providers/fmp";
import { type UnitPoints, reporterFor, collectTags } from "./factIndex";
import { type UnitKind, type ChainSpec } from "./fieldSpecs";
import { type StatementConflictCause } from "@/types/refusalCause";
import { REVENUE_TAGS, REVENUE_COMPONENT_TAGS, tagsFor, GROSS_PROFIT_COST_TAGS, COSTS_AND_EXPENSES_TAG } from "@/edgar/tagSynonyms";
import { preferredRevenueLine, filedRevenueLines } from "../revenuePresentation";
import { belowComponentFloor } from "@/edgar/synonymFloor";
import { PER_SHARE_DECIMALS, MONEY_DECIMALS, tidy } from "./periodMath";


// ---------------------------------------------------------------------------
// Field resolution
// ---------------------------------------------------------------------------

interface Resolved {
  value: number;
  /** The fact the value is anchored to (the FY point for a derived quarter). */
  point: FactPoint;
  /** The filing that FIRST reported `point`'s period. Row labels are read off this. */
  reporter: FactPoint;
  unit: string;
  /**
   * The us-gaap tag(s) this value came from, in resolution order. A chain of
   * near-synonyms hides which concept actually won, and for the debt fields
   * that is exactly what decides whether two of them overlap: the composition
   * has to be visible in the row notes and readable by `computeBalance`.
   */
  tags: string[];
  /** For a `sumAnyOf`, each resolved part by label (the lease split needs it). */
  parts?: Record<string, number>;
  /** D-147: the actual sumAll subtraction pass, retained before its prose is rendered. */
  adjustments?: { amounts: Record<string, number>; baseTags: string[] };
  componentDetails?: { present: { label: string; value: number; tags: string[] }[]; absent: string[] };
  derivation?: Derivation;
  derivedFrom?: string[];
  /**
   * The value the period was FIRST reported with, when a later filing changed
   * it. Set only for a value read straight from one fact: for a sum or a
   * derived quarter each operand has its own history and a single "original"
   * would be an invention.
   */
  original?: OriginalValue;
  evidencePoints?: FactPoint[];
  flowOperands?: StatementFieldProvenance["flowOperands"];
  /**
   * Set only on a floor probe (`magnitudeOnly: { against }`): whether, in a filing that carries both tags for a
   * period the candidate nets, the candidate sits below this floor tag. Undefined when no filing carries both.
   */
  sameFiling?: { below: boolean; detail: string };
  /** Actual resolved flow start, rather than a YTD/FY minuend's start. */
  periodStart?: string;
}

function filingRef(p: FactPoint): FilingRef {
  return { accn: p.accn, filed: p.filed, form: p.form.trim() };
}

/**
 * Value and period from `point`; labels from the filing that first reported
 * that period. When that first filing reported a DIFFERENT number, it is kept
 * as `original` so the row can show what was superseded.
 */
function resolvedPoint(tag: string, up: UnitPoints, point: FactPoint, value: number): Resolved {
  const reporter = reporterFor(up, point);
  const out: Resolved = { value, point, reporter, unit: up.unit, tags: [tag], evidencePoints: [point] };
  if (reporter.accn !== point.accn && reporter.val !== point.val && value === point.val) {
    out.original = { value: reporter.val, ...filingRef(reporter) };
  }
  return out;
}

/*
 * D-134: `magnitudeOnly` requests the as-filed operand pair for a floor or nesting probe, never for
 * publication. A floor tag withheld for presentation still bounds the candidate. `{ against }` also
 * requests a same-filing verdict for that candidate through `Resolved.sameFiling`.
 */
type TagResolver = (tag: string, kind: UnitKind, currency?: string, magnitudeOnly?: boolean | { against: string }) => Resolved | null;

interface NoteSink {
  readonly notes: string[];
  readonly substitutions: Substitution[];
  readonly withheld: Withholding[];
  add(note: string): void;
  /** Record that `field` at row `period` was served by a stand-in described by `text`. */
  substitute(field: string, period: string, text: string): void;
  /** Record that `field` at row `period` was left null on purpose, for the reason `text`; `cause` is its typed code (P11, D-218). */
  withhold(field: string, period: string, text: string, cause?: StatementConflictCause): void;
  /** The typed cause recorded with a withholding's exact text, or undefined when its writer recorded none. */
  causeOf(held: { field: string; text: string }): StatementConflictCause | undefined;
  /**
   * Refusals recorded during resolution (a `first` step that skipped every
   * synonym). `buildStatementRows` turns the last new one into a withholding
   * only when the field ends null; a later step that serves leaves it a note.
   */
  readonly refusals: string[];
  refuse(text: string): void;
  /*
   * D-134: A presentation refusal ends the field across every chain: no later stand-in, derivation
   * or alternative tag list may serve it. Record it even while `quietly` mutes a probe; only an
   * unmuted refusal also enters `refusals`.
   */
  readonly presentationRefusals: string[];
  refusePresentation(text: string): void;

  /**
   * Every `withhold` text a resolution tried to record, in order, whether or not
   * it was muted. A caller compares lengths to learn whether a resolution ran
   * into a currency or period mismatch (`sameRowEvidence` withholds then).
   */
  readonly withholdAttempts: string[];
  /**
   * Run a probe with `add`, `substitute`, `withhold` and `refuse` turned into
   * no-ops (nested calls work) and return its result. A probe resolves a tag
   * only to look at its value; the resolver's side effects belong to the field
   * being resolved, not to the probe.
   */
  quietly<T>(fn: () => T): T;
}

function createNoteSink(): NoteSink {
  const seen = new Set<string>();
  const notes: string[] = [];
  const substitutions: Substitution[] = [];
  const withheld: Withholding[] = [];
  const refusals: string[] = [];
  const presentationRefusals: string[] = [];
  const withholdAttempts: string[] = [];
  // Kept beside the records so a Withholding's own shape is unchanged.
  const withheldCauses = new Map<string, StatementConflictCause>();
  const causeKey = (field: string, text: string): string => JSON.stringify([field, text]);
  let muted = 0;
  const record = (into: { field: string; text: string; periods: string[] }[], field: string, period: string, text: string): void => {
    const existing = into.find((s) => s.field === field && s.text === text);
    if (existing === undefined) into.push({ field, text, periods: [period] });
    else if (!existing.periods.includes(period)) existing.periods.push(period);
  };
  return {
    notes,
    substitutions,
    withheld,
    refusals,
    presentationRefusals,
    withholdAttempts,
    add(note: string): void {
      if (muted > 0 || seen.has(note)) return;
      seen.add(note);
      notes.push(note);
    },
    substitute(field: string, period: string, text: string): void {
      if (muted === 0) record(substitutions, field, period, text);
    },
    withhold(field: string, period: string, text: string, cause?: StatementConflictCause): void {
      withholdAttempts.push(text);
      if (muted !== 0) return;
      record(withheld, field, period, text);
      if (cause !== undefined) withheldCauses.set(causeKey(field, text), cause);
    },
    causeOf(held: { field: string; text: string }): StatementConflictCause | undefined {
      return withheldCauses.get(causeKey(held.field, held.text));
    },
    refuse(text: string): void {
      if (muted === 0) refusals.push(text);
    },
    refusePresentation(text: string): void {
      // Recorded even while muted, as `withholdAttempts` is: a probe that ran into a presentation
      // refusal has not found "nothing filed", and the checks that read this list must see it.
      presentationRefusals.push(text);
      if (muted === 0) refusals.push(text);
    },
    quietly<T>(fn: () => T): T {
      muted += 1;
      try {
        return fn();
      } finally {
        muted -= 1;
      }
    },
  };
}

/** The row a resolution is for; carried through `chain` steps so a `disclose` lands on the right field. */
interface ResolveAt {
  field: string;
  period: string;
}

function describePoint(tag: string, p: FactPoint): string {
  return `${tag} ${p.start ?? "(instant)"}..${p.end}`;
}

/**
 * Merge component resolutions into one: first point/unit wins, provenance unions, and the
 * reporter is the earliest-filed of the components — the first filing in which every part of
 * this combined figure had been reported at least once.
 */
function combine(value: number, parts: Resolved[]): Resolved {
  const head = parts[0] as Resolved;
  const derived = parts.find((p) => p.derivation !== undefined);
  const derivedFrom = [...new Set(parts.flatMap((p) => p.derivedFrom ?? []))];
  const reporter = parts.reduce((a, b) => (b.reporter.filed < a.reporter.filed ? b : a), head).reporter;
  const tags = [...new Set(parts.flatMap((p) => p.tags))];
  const out: Resolved = { value, point: head.point, reporter, unit: head.unit, tags,
    evidencePoints: parts.flatMap((p) => p.evidencePoints ?? [p.point]), ...(head.periodStart === undefined ? {} : { periodStart: head.periodStart }) };
  if (derived !== undefined) out.derivation = derived.derivation;
  if (derivedFrom.length > 0) out.derivedFrom = derivedFrom;
  const flowOperands = parts.flatMap(p => p.flowOperands ?? []);
  if (flowOperands.length) out.flowOperands = flowOperands;
  return out;
}

/** Resolve components sharing one unit; components in another unit are dropped. */
function resolveComponents(
  tags: string[],
  unit: UnitKind,
  resolve: TagResolver,
): { present: { tag: string; r: Resolved }[]; absent: string[] } {
  const present: { tag: string; r: Resolved }[] = [];
  const absent: string[] = [];
  for (const tag of tags) {
    const r = resolve(tag, unit);
    if (r === null) {
      absent.push(tag);
      continue;
    }
    if (present.length > 0 && present[0]!.r.unit !== r.unit) {
      absent.push(tag);
      continue;
    }
    present.push({ tag, r });
  }
  return { present, absent };
}

function filedIncomeLine(r: Resolved, observedAt: string): FiledIncomeLine {
  return { value: r.value, proof: { source: "edgar", unit: r.unit, periodStart: r.periodStart ?? r.point.start ?? null,
    periodEnd: r.point.end, observedAt, tags: r.tags.map(tag => `us-gaap/${tag}`),
    filings: [...new Map((r.evidencePoints ?? [r.point]).map(p => [`${p.accn}|${p.filed}`, filingRef(p)])).values()],
    ...(r.flowOperands ? { flowOperands: r.flowOperands } : {}),
    ...(r.derivation ? { derivation: r.derivation } : {}) } };
}

function resolveSpec(spec: ChainSpec, resolve: TagResolver, notes: NoteSink, label: string, at?: ResolveAt): Resolved | null {
  const disclosed = (r: Resolved | null): Resolved | null => {
    if (r === null || !("disclose" in spec) || spec.disclose === undefined) return r;
    notes.add(`${label}: ${spec.disclose}`);
    // A stand-in inside a composite (the interest term of a derived EBIT) is
    // the composite's business to disclose; the field it belongs to discloses
    // its own resolution separately.
    if (at !== undefined) notes.substitute(at.field, at.period, spec.disclose);
    return r;
  };
  switch (spec.kind) {
    case "chain": {
      if (spec.preferLaterRevenuePresentation) {
        // Preserve the canonical chain's filing-lineage refusals and their
        // explanations before comparing the available revenue presentations.
        for (const step of spec.steps) {
          const before = notes.presentationRefusals.length;
          const first = resolveSpec(step, resolve, notes, label, at);
          if (notes.presentationRefusals.length > before) return null;
          if (first) break;
        }
        const resolved = new Map<string, Resolved>();
        const lines: Record<string, FiledIncomeLine> = {};
        for (const tag of [...REVENUE_TAGS, ...REVENUE_COMPONENT_TAGS, ...tagsFor("grossProfit"), ...GROSS_PROFIT_COST_TAGS, COSTS_AND_EXPENSES_TAG, ...tagsFor("operatingIncome")]) {
          const r = notes.quietly(() => resolve(tag, "money"));
          if (r) { resolved.set(tag, r); lines[tag] = filedIncomeLine(r, ""); }
        }
        const selected = preferredRevenueLine(filedRevenueLines(lines), lines);
        if (!selected) return null;
        const parts = selected.proof.tags.map(tag => resolved.get(tag.replace(/^us-gaap\//, ""))!);
        return { ...parts[0]!, value: selected.value, tags: selected.proof.tags.map(tag => tag.replace(/^us-gaap\//, "")),
          evidencePoints: parts.flatMap(r => r.evidencePoints ?? [r.point]) };
      }
      for (const step of spec.steps) {
        const refusalsBefore = notes.refusals.length;
        const presentationBefore = notes.presentationRefusals.length;
        const r = resolveSpec(step, resolve, notes, label, at);
        if (r !== null) {
          return r;
        }
        // A presentation refusal ends the field in every chain: no stand-in, derivation or other
        // tag list may serve it (D-134). Other refusal kinds end only the chains that ask
        // (`stopOnRefusal`).
        if (notes.presentationRefusals.length > presentationBefore) return null;
        if (spec.stopOnRefusal === true && notes.refusals.length > refusalsBefore) return null;
      }
      return null;
    }
    case "first": {
      const skipped: string[] = [];
      /*
       * D-134: Why the candidate `r` of `tag` is a subset line below a component the line item
       * contains, or null. A candidate whose own quarter is withheld for presentation (`r` is then
       * its as-filed value) is judged against each floor tag by the filings that carry both, as a
       * withheld floor tag is; only a floor tag no filing carries beside it is compared with the
       * as-filed value.
       */
      const belowItsFloor = (tag: string, r: Resolved, candidateWithheld = false): string | null => {
        if (spec.unlessBelow === undefined) return null;
        const floorTags = [...spec.unlessBelow, ...(spec.unlessBelowTag?.[tag] ?? [])];
        // Floor probes run quietly: a floor that cannot resolve is simply not a floor.
        const components: { tag: string; value: number }[] = [];
        let sameFilingHit: string | null = null;
        for (const floorTag of floorTags) {
          if (floorTag === tag) continue;
          const presentationBefore = notes.presentationRefusals.length;
          if (candidateWithheld) {
            const verdict = notes.quietly(() => resolve(floorTag, spec.unit, undefined, { against: tag }))?.sameFiling;
            notes.presentationRefusals.length = presentationBefore;
            if (verdict !== undefined) {
              if (verdict.below) sameFilingHit = `${tag} ${r.value} not used — ${verdict.detail}, so it is not the total`;
              continue;
            }
          }
          let f = notes.quietly(() => resolve(floorTag, spec.unit));
          const floorRefused = f === null && notes.presentationRefusals.length > presentationBefore;
          // A floor probe is a magnitude check: what it ran into is not a refusal of the floored field.
          notes.presentationRefusals.length = presentationBefore;
          if (floorRefused) {
            /**
             * D-134: A presentation-refused floor is still a magnitude constraint, never a
             * published value. Compare the candidate and floor within each filing that carries
             * both. Only when no filing carries both may the as-filed magnitude decide.
             */
            f = notes.quietly(() => resolve(floorTag, spec.unit, undefined, { against: tag }));
            if (f?.sameFiling !== undefined) {
              if (f.sameFiling.below) sameFilingHit = `${tag} ${r.value} not used — ${f.sameFiling.detail}, so it is not the total`;
              continue;
            }
          }
          if (f !== null && f.unit === r.unit && f.value > 0) components.push({ tag: floorTag, value: f.value });
        }
        const hit = belowComponentFloor(r.value, components);
        if (sameFilingHit !== null) {
          return candidateWithheld ? `${sameFilingHit} (its quarter is withheld for presentation, so the filings that carry both tags decide, as for a withheld floor tag)` : sameFilingHit;
        }
        if (hit === null) return null;
        const text = `${tag} ${r.value} not used — below the same period's ${hit.tag} ${hit.value}, so it is not the total`;
        return candidateWithheld ? `${text} (its quarter is withheld for presentation and no filing carries both tags, so its as-filed value is compared)` : text;
      };
      for (const tag of spec.tags) {
        const refusalsBefore = notes.refusals.length;
        const presentationBefore = notes.presentationRefusals.length;
        const r = resolve(tag, spec.unit);
        /*
         * D-134: A synonym refused for presentation ends the step: a narrower synonym must not take
         * over (D-134). The check reads `presentationRefusals`, which a muted probe fills too.
         */
        if (r === null && notes.presentationRefusals.length > presentationBefore) {
          /*
           * D-134: Unless the floor would skip the candidate as a subset line anyway: the filings
           * that carry it beside a floor tag decide, as for a refused floor tag, and the as-filed
           * value only where no filing does. Then the next synonym is tried.
           */
          const refusedAt = notes.presentationRefusals.length;
          const asFiled = spec.unlessBelow === undefined ? null : notes.quietly(() => resolve(tag, spec.unit, undefined, true));
          notes.presentationRefusals.length = refusedAt;
          const subset = asFiled === null ? null : belowItsFloor(tag, asFiled, true);
          if (subset === null) return null;
          notes.presentationRefusals.length = presentationBefore;
          notes.refusals.length = refusalsBefore;
          notes.add(`${label}: ${subset}`);
          skipped.push(subset);
          continue;
        }
        if (r === null) continue;
        const subset = belowItsFloor(tag, r);
        if (subset !== null) {
          notes.add(`${label}: ${subset}`);
          skipped.push(subset);
          continue;
        }
        if (spec.requireAgreement) {
          const siblings = spec.tags.filter(sibling => sibling !== tag).flatMap(sibling => {
            const resolved = notes.quietly(() => resolve(sibling, spec.unit));
            return resolved === null ? [] : [{ tag: sibling, resolved }];
          });
          if (siblings.some(s => s.resolved.unit !== r.unit || s.resolved.value !== r.value)) {
            notes.refuse(`${at?.field ?? label} withheld: ambiguous siblings ${tag} ${r.value} ${r.unit}; ${siblings.map(s => `${s.tag} ${s.resolved.value} ${s.resolved.unit}`).join("; ")} disagree and no definitional containment is evidenced`);
            return null;
          }
        }
        if (spec.sign === undefined) return disclosed(r);
        const decimals = spec.unit === "perShare" ? PER_SHARE_DECIMALS : MONEY_DECIMALS;
        const signed: Resolved = { ...r, value: tidy(r.value * spec.sign, decimals) };
        // The superseded figure travels on the same sign convention as the
        // row's value: left as filed, a restated buyback compared −70 against
        // 75 and raised a −193% restatement flag for a 7% change.
        if (r.original !== undefined) {
          signed.original = { ...r.original, value: tidy(r.original.value * spec.sign, decimals) };
        }
        return disclosed(signed);
      }
      if (skipped.length > 0) {
        notes.refuse(
          `${at?.field ?? label} withheld: every combined synonym filed for the period is below a component it includes (${skipped.join("; ")}), and no composition of its components is filed`,
        );
      }
      return null;
    }
    case "sum": {
      const { present } = resolveComponents(spec.tags, spec.unit, resolve);
      if (present.length !== spec.tags.length) return null;
      const total = present.reduce((s, p) => s + p.r.value, 0);
      return disclosed(combine(tidy(total, MONEY_DECIMALS), present.map((p) => p.r)));
    }
    case "sumAll": {
      const present: Resolved[] = [];
      const partTags: { label: string; tags: string[] }[] = [];
      /*
       * D-134: A part that may be absent, with the mismatch (currency, period) that made it
       * unusable when it IS filed, or the nesting disclosure of a refused part the derivation
       * leaves out.
       */
      const deferred: { part: (typeof spec.parts)[number]; problem?: { text: string; kind: "currency" | "period" | "unit" }; nested?: string }[] = [];
      const field = at?.field ?? label;
      const triedTags = (part: ChainSpec): string => {
        const tried = new Set<string>();
        collectTags(part, tried);
        return [...tried].join(", ");
      };
      /** A probe that writes nothing and leaves no presentation refusal behind; `refused` says whether it ran into one. */
      const probe = (tag: string, magnitudeOnly?: true): { r: Resolved | null; refused: boolean } => {
        const before = notes.presentationRefusals.length;
        const r = notes.quietly(() => resolve(tag, spec.unit, undefined, magnitudeOnly));
        const refused = r === null && notes.presentationRefusals.length > before;
        notes.presentationRefusals.length = before;
        return { r, refused };
      };
      /**
       * D-134: A refused optional part excluded by taxonomy nesting is not an operand of the
       * derivation. The aggregate must serve, and either the refused tag is the nesting tag or
       * another filing tags the period interest as that tag. Return the nesting disclosure when
       * those conditions hold; otherwise the refusal ends the field.
       */
      const nestedInsideServedAggregate = (part: (typeof spec.parts)[number], refusedTags: readonly string[]): string | null => {
        const aggregateTag = part.optionalWhenAdjustment?.adjustmentTag;
        const rule = (spec.notAddedWhen ?? []).find((n) => n.partLabel === part.label && n.adjustmentTag === aggregateTag);
        const aggregate = spec.minusAny?.find((a) => aggregateTag !== undefined && a.tags.includes(aggregateTag));
        if (rule === undefined || aggregate === undefined || present.length === 0) return null;
        /**
         * Run the adjustment test quietly in advance so a refusal that remains preserves its
         * exact reason and notes.
         */
        const served = aggregate.tags.some((tag) => {
          const { r } = probe(tag);
          return r !== null && r.unit === present[0]!.unit && r.tags.includes(rule.adjustmentTag);
        });
        if (!served) return null;
        if (refusedTags.includes(rule.partTag)) return rule.disclose;
        if (rule.discloseRefiled === undefined) return null;
        const { r: child } = probe(rule.partTag, true); /**
         * D-134: Probe the period interest by magnitude for taxonomy nesting, including
         * presentation-refused quarters.
         */
        return child !== null && child.unit === present[0]!.unit ? rule.discloseRefiled : null;
      };
      for (const part of spec.parts) {
        const refusalsBefore = notes.refusals.length;
        const attemptsBefore = notes.withholdAttempts.length;
        const presentationBefore = notes.presentationRefusals.length;
        // An optional part is probed quietly first: if it turns out unusable and the aggregate serves, the
        // mismatch withholding it would have written must not stand beside the published value. The probe also
        // records which tags it found withheld for presentation.
        const optional = part.optionalWhenAdjustment !== undefined;
        const refusedTags: string[] = [];
        const tracking: TagResolver = (tag, kind, currency, magnitudeArg) => {
          const before = notes.presentationRefusals.length;
          const found = resolve(tag, kind, currency, magnitudeArg);
          if (found === null && notes.presentationRefusals.length > before) refusedTags.push(tag);
          return found;
        };
        let r = optional
          ? notes.quietly(() => resolveSpec(part.spec, tracking, notes, `${label} (${part.label})`))
          : resolveSpec(part.spec, resolve, notes, `${label} (${part.label})`);
        if (optional && r !== null && (present.length === 0 || present[0]!.unit === r.unit)) {
          r = resolveSpec(part.spec, resolve, notes, `${label} (${part.label})`); // served: its notes belong to the field
        }
        if (r !== null && present.length > 0 && present[0]!.unit !== r.unit) {
          if (optional) {
            deferred.push({ part, problem: { text: `${field} not derived: ${part.label} is filed in ${r.unit}, not ${present[0]!.unit}`, kind: "unit" } });
            continue;
          }
          if (spec.refuseWhenIncomplete === true) notes.refuse(`${field} not derived: ${part.label} is filed in ${r.unit}, not ${present[0]!.unit}`);
          return null;
        }
        if (r === null) {
          if (optional && notes.presentationRefusals.length > presentationBefore) {
            const refusal = notes.presentationRefusals[notes.presentationRefusals.length - 1];
            /**
             * D-134: Interest already excluded by taxonomy nesting is not an added operand. Its
             * refusal therefore does not refuse the field; the nesting disclosure explains the
             * omission.
             */
            const nested = nestedInsideServedAggregate(part, refusedTags);
            if (nested !== null) {
              notes.presentationRefusals.length = presentationBefore;
              deferred.push({ part, nested });
              continue;
            }
            // A refused optional part is not an absent one: dropping it would publish a figure that
            // still holds it, with a disclosure that says the filer files none.
            notes.refusePresentation(`${field} not derived: ${part.label} for the period is withheld (${refusal})`);
            return null;
          }
          const mismatch = notes.withholdAttempts.slice(attemptsBefore).find((t) => /^(mixed_unit|period_mismatch):/.test(t));
          if (optional) {
            deferred.push({ part, ...(mismatch === undefined ? {} : { problem: { text: mismatch, kind: mismatch.startsWith("mixed_unit") ? "currency" : "period" } }) });
            continue;
          }
          // A part that ran into a currency or period mismatch already carries its own withholding (the
          // mismatch text): "not filed" would be false and would stack a second reason on it.
          if (spec.refuseWhenIncomplete === true && mismatch === undefined) {
            notes.refuse(
              notes.refusals.length > refusalsBefore
                ? `${field} not derived: ${part.label} for the period is withheld (${notes.refusals[notes.refusals.length - 1]})`
                : `${field} not derived: ${part.label} is not filed for the period (tags tried: ${triedTags(part.spec)})`,
            );
          }
          return null;
        }
        present.push(r);
        partTags.push({ label: part.label, tags: r.tags });
      }
      const servedByPart = new Set(present.flatMap((r) => r.tags));
      let total = present.reduce((s, r) => s + r.value, 0);
      // Optional subtrahends: each one the filer tagged for this period is
      // removed; one whose parent aggregate also resolved is skipped (the
      // taxonomy already counts it inside that aggregate); one the SERVING BASE
      // TAG excludes by definition is skipped (subtracting it would remove
      // money the base never held); and everything that could not be resolved is
      // named as the error band on the result.
      const subtracted: string[] = [];
      const unavailable: string[] = [];
      const unusable: { label: string; problem: string }[] = [];
      const alreadyInside: string[] = [];
      const notInBase: string[] = [];
      const notAdded: string[] = [];
      const amounts: Record<string, number> = {};
      if (spec.minusAny !== undefined) {
        const resolvedByLabel = new Map<string, Resolved>();
        // Adjustments filed for the period that cannot be used on this row: beside the reason they are left out
        // whatever they hold (`filedUnused`), or, for one that would be subtracted, the mismatch the error band names.
        const filedUnused = new Set<string>();
        const unusableByLabel = new Map<string, string>();
        /*
         * D-134: An adjustment the derivation never subtracts, whatever it holds: it sits inside an
         * aggregate that served for the period, or the base tag that served excludes it by
         * definition. The aggregate is listed before its components
         * (EBIT_NON_OPERATING_ADJUSTMENTS), so it has been resolved by then.
         */
        const unusedBecause = (adjustment: (typeof spec.minusAny)[number]): "inside" | "notInBase" | null =>
          adjustment.componentOf !== undefined && resolvedByLabel.has(adjustment.componentOf)
            ? "inside"
            : adjustment.notWhenBaseTag?.some((tag) => servedByPart.has(tag)) === true
              ? "notInBase"
              : null;
        for (const adjustment of spec.minusAny) {
          const unused = unusedBecause(adjustment) !== null;
          // Resolve LAZILY: a TagResolver has note side effects (a derived
          // quarter that cannot be built adds a "not derived" note), so
          // resolving every synonym of an adjustment and then discarding all
          // but the first hit put notes on the row about tags nothing used.
          for (const tag of adjustment.tags) {
            const attemptsBefore = notes.withholdAttempts.length;
            /*
             * D-134: Probed quietly first: a currency or period mismatch never becomes a
             * withholding beside a derived figure, and an unused adjustment is resolved for its
             * disclosure only.
             */
            const { r: found, refused } = probe(tag);
            const mismatch = found === null ? notes.withholdAttempts.slice(attemptsBefore).find((t) => /^(mixed_unit|period_mismatch):/.test(t)) : undefined;
            const usable = found !== null && found.unit === present[0]!.unit;
            if (unused) {
              // Resolved for its disclosure only: nothing it ran into (a presentation refusal, a mismatch) refuses or
              // withholds the field.
              if (usable) resolvedByLabel.set(adjustment.label, found);
              else if (found === null && !refused && mismatch === undefined) continue; // not filed: the next tag
              else filedUnused.add(adjustment.label);
              break;
            }
            if (mismatch !== undefined && !refused) {
              /**
               * D-134: An item filed in another currency or period is not subtracted. The error
               * band names that mismatch; an unmuted resolution would withhold the unusable
               * component of the published figure.
               */
              unusableByLabel.set(
                adjustment.label,
                mismatch.startsWith("mixed_unit")
                  ? "is filed in another currency than the row's reporting currency (no conversion is made)"
                  : "is filed for a different period than the row",
              );
              break;
            }
            // Otherwise resolved unmuted, as before the probe: its notes and refusal belong to the field.
            const presentationBefore = notes.presentationRefusals.length;
            const r = resolve(tag, spec.unit);
            if (r === null && notes.presentationRefusals.length > presentationBefore) {
              // A refused adjustment is not an untagged one: dropping it would publish a figure
              // that still holds the item, with a disclosure that says the filer tags none (D-134).
              notes.refusePresentation(
                `${field} not derived: ${adjustment.label} for the period is withheld (${notes.presentationRefusals[notes.presentationRefusals.length - 1]})`,
              );
              return null;
            }
            if (r !== null && r.unit === present[0]!.unit) {
              resolvedByLabel.set(adjustment.label, r);
              break;
            }
          }
        }
        /* D-134: An absent part may be skipped only beside its established filed aggregate; otherwise refuse the incomplete derivation. */
        for (const { part, problem, nested } of deferred) {
          if (nested !== undefined) {
            notAdded.push(nested); // D-134: the served aggregate makes this refused nested part unnecessary
            continue;
          }
          const rule = part.optionalWhenAdjustment!;
          if ([...resolvedByLabel.values()].some((r) => r.tags.includes(rule.adjustmentTag))) {
            notAdded.push(
              problem === undefined
                ? rule.disclose
                : rule.discloseUnusable(
                    problem.kind === "period"
                      ? `is filed for a different period than the row`
                      : `is filed in another currency than the row's reporting currency (no conversion is made)`,
                  ),
            );
            continue;
          }
          if (problem !== undefined) {
            notes.refuse(problem.text); // the part's own reason, the same text the mismatch withholding carries
            return null;
          }
          notes.refuse(
            `${field} not derived: ${part.label} is not filed for the period (tags tried: ${triedTags(part.spec)}), and no ${rule.adjustmentTag} aggregate is filed that would make it unnecessary`,
          );
          return null;
        }
        // D-134: A part nested inside a subtracted aggregate is already in it, so do not add it back.
        for (const rule of spec.notAddedWhen ?? []) {
          const inside = [...resolvedByLabel.values()].some((r) => r.tags.includes(rule.adjustmentTag));
          const index = present.findIndex((r) => r.tags.includes(rule.partTag));
          if (index < 0 && inside && rule.partLabel !== undefined && rule.discloseRefiled !== undefined) {
            // Resolved only in this case (lazy resolution) and quietly: a probe that cannot resolve writes no
            // period_mismatch, mixed_unit or "not derived" entry against the field.
            const served = partTags.findIndex((p) => p.label === rule.partLabel);
            // Magnitude-only: the probe asks whether the filer tags this period's interest as the
            // nesting tag, so a quarter refused for presentation still answers yes.
            const child = served < 0 ? null : notes.quietly(() => resolve(rule.partTag, spec.unit, undefined, true));
            if (child !== null && child.unit === present[0]!.unit) {
              total -= present[served]!.value;
              present.splice(served, 1);
              partTags.splice(served, 1);
              notAdded.push(rule.discloseRefiled);
            }
            continue;
          }
          if (index < 0 || !inside) continue;
          total -= present[index]!.value;
          present.splice(index, 1);
          partTags.splice(index, 1);
          notAdded.push(rule.disclose);
        }
        partTags.forEach((p, i) => {
          amounts[p.label] = present[i]!.value; // present and partTags stay in step until the adjustments are appended
        });
        for (const adjustment of spec.minusAny) {
          const hit = resolvedByLabel.get(adjustment.label);
          const unused = unusedBecause(adjustment);
          // An unused adjustment the filer files (served, refused or mismatched) is named for why it is left out.
          if (unused !== null && (hit !== undefined || filedUnused.has(adjustment.label))) {
            (unused === "inside" ? alreadyInside : notInBase).push(adjustment.label);
            continue;
          }
          if (hit === undefined) {
            const problem = unusableByLabel.get(adjustment.label);
            if (problem === undefined) unavailable.push(adjustment.label);
            else unusable.push({ label: adjustment.label, problem });
            continue;
          }
          total -= hit.value;
          subtracted.push(adjustment.label);
          amounts[adjustment.label] = hit.value;
          present.push(hit);
        }
      }
      const combined = combine(tidy(total, MONEY_DECIMALS), present);
      if (spec.discloseAdjusted !== undefined) {
        const text = spec.discloseAdjusted({ subtracted, unavailable, unusable, alreadyInside, notInBase, parts: partTags, notAdded, amounts });
        notes.add(`${label}: ${text}`);
        if (at !== undefined) notes.substitute(at.field, at.period, text);
        return { ...combined, adjustments: { amounts, baseTags: partTags.find(p => p.label === "pretax income")?.tags ?? [] } };
      }
      return disclosed(combined);
    }
    case "sumAny": {
      const { present, absent } = resolveComponents(spec.tags, spec.unit, resolve);
      if (present.length === 0) return null;
      if (absent.length > 0) {
        notes.add(
          `${label}: sum of present components (${present.map((p) => p.tag).join(", ")}); absent and excluded: ${absent.join(", ")}`,
        );
      }
      const total = present.reduce((s, p) => s + p.r.value, 0);
      return combine(tidy(total, MONEY_DECIMALS), present.map((p) => p.r));
    }
    case "sumAnyOf": {
      // Same contract as `sumAny`, one level up: at least one part must resolve,
      // parts in a foreign currency are dropped, and every absent part is named.
      // `at` travels INTO the parts: unlike `sumAll` (whose composite words its
      // own disclosure), a `sumAnyOf` part that resolved through a stand-in is
      // a stand-in for a slice of this very field, so it is that field's
      // substitution — the debt-maturity schedule standing in for the current
      // maturities of long-term debt is the case.
      const present: { label: string; r: Resolved }[] = [];
      const absent: string[] = [];
      for (const part of spec.parts) {
        const r = resolveSpec(part.spec, resolve, notes, `${label} (${part.label})`, at);
        if (r === null || (present.length > 0 && present[0]!.r.unit !== r.unit)) {
          absent.push(part.label);
          continue;
        }
        present.push({ label: part.label, r });
      }
      if (present.length === 0) return null;
      if (absent.length > 0) {
        notes.add(
          `${label}: sum of present components (${present.map((p) => p.label).join(", ")}); absent and excluded: ${absent.join(", ")}`,
        );
      }
      const total = present.reduce((s, p) => s + p.r.value, 0);
      return {
        ...combine(tidy(total, MONEY_DECIMALS), present.map((p) => p.r)),
        parts: Object.fromEntries(present.map((p) => [p.label, p.r.value])),
        componentDetails: { present: present.flatMap(p => p.r.componentDetails?.present ?? [{ label: p.label, value: p.r.value, tags: p.r.tags }]),
          absent: [...absent, ...present.flatMap(p => p.r.componentDetails?.absent ?? [])] },
      };
    }
    case "diff": {
      const plus = resolve(spec.plus, spec.unit);
      const minus = resolve(spec.minus, spec.unit);
      if (plus === null || minus === null || plus.unit !== minus.unit) return null;
      return disclosed(combine(tidy(plus.value - minus.value, MONEY_DECIMALS), [plus, minus]));
    }
  }
}

/*
 * D-134: Test seam, not used by the builder: resolves a `first` step over `tags` with a fresh note
 * sink, inside `notes.quietly` when `quiet`. The resolver refuses each tag in `refused` for
 * presentation and serves each tag in `values` at its value; any other tag is not filed.
 */
export function resolveFirstStepForTests(
  tags: readonly string[],
  refused: readonly string[],
  values: Readonly<Record<string, number>>,
  quiet: boolean,
): number | null {
  const notes = createNoteSink();
  const resolve: TagResolver = (tag) => {
    if (refused.includes(tag)) {
      notes.refusePresentation(`${tag}: withheld for presentation`);
      return null;
    }
    const value = values[tag];
    if (value === undefined) return null;
    const point: FactPoint = { end: "2025-12-31", val: value, accn: "test", form: "10-K", filed: "2026-02-01" };
    return { value, point, reporter: point, unit: "USD", tags: [tag] };
  };
  const run = (): Resolved | null => resolveSpec({ kind: "first", tags: [...tags], unit: "money" }, resolve, notes, "test");
  return (quiet ? notes.quietly(run) : run())?.value ?? null;
}
export { type TagResolver, resolvedPoint, type NoteSink, type ResolveAt, type Resolved, resolveSpec, createNoteSink, filingRef, describePoint, combine, filedIncomeLine };
