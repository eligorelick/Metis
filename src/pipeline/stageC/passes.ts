
import { metisEnv } from "@/config/namespace";
import type { ManifestEntry } from "@/types/core";
import { parseSubscriptionModel, subscriptionModel } from "@/ai/contracts";
import {
  JUDGE_OUTPUT_KEYS,
  judgeOutputToJsonSchema,
  type AnalystCase,
  type JudgeOutput,
  type Report,
  type CostBreakdownEntry,
} from "@/report/schema";
import {
  payloadFingerprint,
  renderUntrustedJson,
  type ContextPayload,
} from "@/pipeline/stageC/payload";
import {
  citationSourceId,
} from "@/pipeline/stageC/citations";
import {
  getEntityRegistry,
  collectEntityConflicts,
  validateEntityText,
  validateJudgeEntityResolution,
  type EntityIssue,
} from "@/pipeline/stageC/entityValidation";
import {
  continuationInstruction,
  hasCompletedSections,
  mergeContinuation,
  API_JUDGE_MAX_SECTION_REQUESTS,
  type PassContinuation,
} from "@/pipeline/stageC/continuation";
import { buildExecutionMetadataEntry, type ProviderExecution } from "@/report/execution";
import {
  SHARED_RULES_BLOCK,
  buildJudgeFraming,
} from "@/pipeline/stageC/prompts";
// WS7 (D-20) begin.
import {
  ANALYST_CASE_CHAR_CAP,
  buildJudgePresentation,
  buildJudgeProtocolDraft,
  caseLengthBanner,
  JUDGE_ORDER_ENV_KEY,
  orderedSides,
  reconcileJudgeOutputs,
  reconciliationNotPerformed,
  resolveJudgeOrderSetting,
  withReconciliation,
  type JudgePresentation,
  type JudgeProtocolDraft,
} from "@/pipeline/stageC/judgeProtocol";
import type {
  JudgeOrder,
  JudgeOrderSetting,
} from "@/report/schema";
// WS7 (D-20) end.
import {
  analystVerificationTexts,
  type PassSettlementHook,
} from "@/pipeline/jobArtifacts";
import type { PassDeps, PassErrorLike, PassResult, PassRun, RunPassArgs, RunPassContentBlock } from "./passTypes";
import { JUDGE_MAX_TOKENS, buildCachedUserMessage, judgeModelFor, judgeRetryFeedback } from "./passRequests";
import { checkCarriedJudgeSections, parseAnalystCase, parseJudgeOutput } from "./passOutputs";
import { JUDGE_SECTION_PARTS, finishStructuredPass, mergeServerToolUse, runPassInSections, runStructuredPass, settlePassRun } from "./passExecution";
import { type VerifyResult, runVerifyPass } from "./verifyPass";
import { type AssembleReportArgs, assembleReport } from "./reportAssembly";
import { ReportValidationError } from "./passParsing";

export { type PassUsage, type PassMessage, type PassOutcomeLike, type PassErrorLike, type RunPassOutcome, type RunPassContentBlock, type RunPassArgs, type RunPassFn, type FirstStreamEvent, type StreamingHandleLike, type RunPassStreamingFn, type WebSearchToolFn, type PassDeps, type PassResult, type PassRun } from "./passTypes";
export { responseShapeText, extractText, parseJsonSalvaging, parseJsonMergingTrailingFields, ReportValidationError } from "./passParsing";
export { ANALYST_MAX_WEB_SEARCHES, ANALYST_MAX_TOKENS, JUDGE_MAX_TOKENS, JUDGE_MODEL_FLOOR, judgeModelFor, JUDGE_RETRY_PREVIOUS_OUTPUT_CAP, judgeRetryFeedback, payloadUserTurn, buildCachedUserMessage, buildAnalystRunPassArgs, analystRepairFeedback, buildAnalystRepairRunPassArgs } from "./passRequests";
export { JUDGE_SECTION_PARTS, ANALYST_SECTION_PARTS, sectionOutputSchema, judgePreflightRequests, isTransientSubscriptionFailure, isRetryablePassFailure } from "./passExecution";
export { normalizeJudgeOutput, PRODUCT_LINE_HEADING_MAX_WORDS, PRODUCT_LINE_HEADING_MAX_CHARS, productLineHeadingIsName, type CarriedSectionCheck, checkCarriedJudgeSections, checkCarriedAnalystSections } from "./passOutputs";
export { runBullPass, runBearPass, runAnalystRepairPass, runAnalystContinuationPass, ANALYST_RESEARCH_NOTES_MAX_CHARS, type BullBearResult, BullBearOverlapLaunchFailure, type BullBearHooks, type BullBearSettlementHooks, runBullThenBear } from "./analystPasses";
export { type VerificationEvidence, type VerifyResult, collectTracedNumbers, runVerifyPass } from "./verifyPass";
export { type AssembleReportArgs, totalCost, buildSources, SCENARIO_TARGET_HORIZON, applyScenarioTargets, applyFairValue, applyDcfDisplay, MULTIPLE_LABELS, multipleLabel, applyMultiples, applyReverseDcf, applyForensicScores, UNBOUND_SEGMENT_NAME, boundSegmentName, applySegmentShares, bundleSegmentNameKeys, gateProductLineHeadings, assembleReport } from "./reportAssembly";

/** Rounding tolerance for tracing a report number to a payload figure. */
/** Max judge retries on a Zod-validation failure. */
export const MAX_JUDGE_RETRIES = 2;

/* ------------------------------------------------------------------------ *
 * Judge pass
 * ------------------------------------------------------------------------ */

/**
 * Build the judge user turn: the payload as the cached first content block
 * (byte-identical to the analyst passes' payload block, so with an identical
 * `tools`+`system` prefix this can in principle share bull/bear's cache entry —
 * subject to the separate, documented `output_config.format` cache-invalidation
 * caveat for structured-output requests, the Anthropic API contract, quirk #3),
 * followed by the judge framing + both cases as a second, volatile block.
 * JSON.stringify is COMPACT (no pretty-print indent) — the model's JSON parsing
 * is whitespace-insensitive, so indentation is pure token overhead, repeated on
 * every judge retry attempt.
 */
export function judgeUserTurns(
  payload: ContextPayload,
  bull: AnalystCase,
  bear: AnalystCase,
  // WS7 (D-20): which case goes first, and how long each one is, are now inputs
  // rather than a hard-coded BULL-then-BEAR constant. Omitted only by legacy
  // callers/tests, which get the historical fixed order and no caps applied.
  presentation?: JudgePresentation,
  orderOverride?: JudgeOrder,
  sectioned = false,
): { role: "user"; content: RunPassContentBlock[] }[] {
  const entityConflicts = entityConflictsForCases(payload, bull, bear);
  const entityConflictBlock = entityConflicts.length === 0
    ? ""
    : [
        "",
        "DETERMINISTIC ENTITY CONFLICTS (must be resolved explicitly):",
        JSON.stringify(entityConflicts),
        "Add kind=entity disagreements that name the canonical entity and explain the supported resolution. Do not silently choose or rename an entity.",
      ].join("\n");
  const order = orderOverride ?? presentation?.order ?? "bull-first";
  const cases: Record<"bull" | "bear", AnalystCase> = {
    bull: presentation?.bull.value ?? bull,
    bear: presentation?.bear.value ?? bear,
  };
  const caseBlock = (side: "bull" | "bear"): string => {
    const capped = side === "bull" ? presentation?.bull : presentation?.bear;
    const truncationNote = capped?.presentation.truncated === true
      ? " — TRUNCATED to the shared length cap; the omitted entries are disclosed in the report"
      : "";
    // The case is model-authored but can quote filing or web text, so it is
    // enveloped like provider data: arguments to weigh, never instructions.
    return [
      `${side.toUpperCase()} CASE (independent analyst; model-authored, untrusted${truncationNote}):`,
      renderUntrustedJson(cases[side]),
    ].join("\n");
  };
  const [first, second] = orderedSides(order);
  const message = buildCachedUserMessage(
      payload,
      [
        // WS7 (D-20), N11: the order sentence follows the SETTING, exactly as
        // the length banner follows the presentation. A legacy caller with no
        // presentation gets the historical fixed order, hence the default.
        buildJudgeFraming(presentation?.setting, sectioned),
        ...(presentation === undefined ? [] : ["", caseLengthBanner(presentation)]),
        "",
        caseBlock(first),
        "",
        caseBlock(second),
        entityConflictBlock,
      ].join("\n"),
      "1h",
    );
  message.content[1].cache_control = { type: "ephemeral", ttl: "1h" };
  message.content.push({ type: "text", text: [
        ...(sectioned ? ["Report content is assembled across separate requests. Emit only the sections and subset schema requested in the final turn."] : [
          "JUDGE_OUTPUT JSON Schema reference:", JSON.stringify(judgeOutputToJsonSchema()), "",
          "Adjudicate on the evidence and emit the JUDGE_OUTPUT schema.",
        ]),
        "Return ONLY valid JSON matching that schema. Do not wrap it in Markdown and do not add prose before or after the JSON.",
      ].join("\n"),
    });
  return [message];
}

function analystClaimTexts(value: unknown): string[] {
  const texts: string[] = [];
  const walk = (node: unknown): void => {
    if (node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((value) => walk(value));
      return;
    }
    const record = node as Record<string, unknown>;
    if (typeof record.text === "string" && typeof record.label === "string") {
      texts.push(record.text);
    }
    Object.values(record).forEach(walk);
  };
  walk(value);
  return texts;
}

function entityConflictsForCases(
  payload: ContextPayload,
  bull: AnalystCase,
  bear: AnalystCase,
): EntityIssue[] {
  const registry = getEntityRegistry(payload.symbol);
  if (registry === null) return [];
  return collectEntityConflicts(
    analystClaimTexts(bull),
    analystClaimTexts(bear),
    registry,
  );
}

/** D-144: payload membership and issuer origin are both required. */
export function issuerPrimarySource(payload: ContextPayload): (id: string) => boolean {
  return id => {
    if (id === payload.transcript?.source || payload.filings.some(row => row.source === id && row.sourceEvidence !== undefined)) return true;
    if (id.startsWith("edgar:")) return (payload.filings ?? []).some(row => row.source === id) || (payload.citationRegistry ?? []).some(row => row.id === id);
    if (id === "fmp:earning-call-transcript") return payload.transcript != null;
    if (id === "fmp:press-release") return (payload.citationRegistry ?? []).some(row => row.id === id);
    return /^(?:payload\.(?:statements|issuer-filings|filing-facts|segments|segment-revenue|leadership|insiders|computed)\.|computed\.)/.test(id) && (payload.provenanceRegistry ?? []).some(row => row.id === id);
  };
}

function unresolvedJudgeEntityConflicts(
  payload: ContextPayload,
  bull: AnalystCase,
  bear: AnalystCase,
  output: JudgeOutput,
): EntityIssue[] {
  const registry = getEntityRegistry(payload.symbol);
  if (registry === null) return [];
  const unresolved = validateJudgeEntityResolution(
    entityConflictsForCases(payload, bull, bear),
    output.disagreements,
  );
  const reportIssues: EntityIssue[] = [];
  const walk = (node: unknown, structuredSource: string | null = null): void => {
    if (typeof node === "string") {
      reportIssues.push(
        ...validateEntityText(node, registry, structuredSource, issuerPrimarySource(payload)).issues.filter(
          (issue) => structuredSource !== null || issue.code !== "primary-source-required",
        ),
      );
      return;
    }
    if (node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((value) => walk(value));
      return;
    }
    const record = node as Record<string, unknown>;
    if (typeof record.text === "string" && typeof record.label === "string") {
      const rawSource = citationSourceId(record);
      const primarySource = rawSource?.startsWith("web:") ? rawSource.slice(4) : rawSource;
      reportIssues.push(...validateEntityText(record.text, registry, primarySource, issuerPrimarySource(payload)).issues);
      for (const [key, value] of Object.entries(record)) {
        if (key !== "text") walk(value);
      }
      return;
    }
    Object.values(record).forEach((value) => walk(value));
  };
  const reportWithoutExplicitConflictQuotes = { ...output } as Partial<JudgeOutput>;
  delete reportWithoutExplicitConflictQuotes.disagreements;
  walk(reportWithoutExplicitConflictQuotes);
  const deduped = new Map<string, EntityIssue>();
  for (const issue of [...unresolved, ...reportIssues]) {
    deduped.set(`${issue.code}\u0000${issue.recordId}\u0000${issue.observed}`, issue);
  }
  return [...deduped.values()];
}

function entityConflictFailure(
  successful: PassResult<JudgeOutput>,
  unresolved: readonly EntityIssue[],
): PassRun<JudgeOutput> {
  const details = unresolved
    .map((issue) => `${issue.code}: ${issue.text}`)
    .join("; ");
  const reason = `judge left deterministic entity conflicts unresolved: ${details}`;
  return {
    ok: false,
    gap: {
      field: "llm.judge.entities",
      reason,
      severity: "critical",
      attemptedSources: ["canonical-entity-registry", "judge-disagreements"],
    },
    error: { kind: "schema", message: reason, repairRejectedComplete: true },
    validationError: reason,
    rawText: JSON.stringify(successful.output),
    usage: successful.usage,
    costUsd: successful.costUsd,
    fallbackUsed: successful.fallbackUsed,
    model: successful.model,
    webSearches: successful.webSearches,
    ...(successful.execution === undefined ? {} : { execution: successful.execution }),
  };
}

/* ------------------------------------------------------------------------ *
 * WS7 (D-20) — the adversarial protocol for one judge pass
 * ------------------------------------------------------------------------ */

/**
 * Resolve the case order and the per-side length caps for a judge pass.
 *
 * Deterministic in `(deps.judgeOrder ?? env, deps.jobSeed ?? payload fingerprint,
 * the two cases)`, which is what lets the runner's `preflightPass` rebuild the
 * EXACT forthcoming request before spending a cent: the same inputs always draw
 * the same order and cap the cases identically.
 */
export function judgePresentationFor(
  deps: PassDeps,
  payload: ContextPayload,
  bull: AnalystCase,
  bear: AnalystCase,
): JudgePresentation {
  return buildJudgePresentation({
    setting: judgeOrderSettingFor(deps),
    seed: deps.jobSeed ?? payloadFingerprint(payload),
    bull,
    bear,
    capChars: ANALYST_CASE_CHAR_CAP,
  });
}

/** The order setting in force: explicit dep, else the environment, else default. */
export function judgeOrderSettingFor(deps: PassDeps): JudgeOrderSetting {
  return (
    deps.judgeOrder ??
    resolveJudgeOrderSetting(
      typeof process === "undefined" ? undefined : metisEnv("JUDGE_ORDER"),
    )
  );
}

/** Exact provider request used by a judge attempt. */
export function buildJudgeRunPassArgs(
  deps: PassDeps,
  payload: ContextPayload,
  bull: AnalystCase,
  bear: AnalystCase,
  validationFeedback?: string,
  // WS7 (D-20): `both` mode builds the mirrored request with the swapped order.
  orderOverride?: JudgeOrder,
  /** Sections kept from a response the provider cut off; only the rest is requested. */
  continuation?: PassContinuation,
): RunPassArgs {
  const presentation = judgePresentationFor(deps, payload, bull, bear);
  const sectioned = deps.sectionedOutput === true || deps.judgeSectionedOutput === true;
  const baseTurns = judgeUserTurns(payload, bull, bear, presentation, orderOverride, sectioned);
  const userTurns =
    hasCompletedSections(continuation)
      ? [...baseTurns, { role: "user" as const, content: continuationInstruction(continuation.completed, JUDGE_OUTPUT_KEYS) }]
      : validationFeedback === undefined || validationFeedback.length === 0
      ? baseTurns
      : [
          ...baseTurns,
          {
            role: "user" as const,
            content: `Your previous output FAILED report-schema validation with this error. Fix EXACTLY these issues and ${sectioned ? "emit only the sections requested in the final turn" : "re-emit the full JUDGE_OUTPUT schema"}:\n${validationFeedback}`,
          },
        ];
  return {
    model: judgeModelFor(deps.model),
    system: SHARED_RULES_BLOCK,
    messages: userTurns,
    maxTokens: JUDGE_MAX_TOKENS,
    effort: deps.effort ?? "high",
    field: "llm.judge",
    signal: deps.signal,
    admission: deps.admissionFor?.("synthesize"),
    reservationPass: "synthesize",
    ...(continuation?.sectionRetryCount ? { sectionRetryCount: continuation.sectionRetryCount } : {}),
    ...(continuation?.sectionRequestsUsed === undefined ? {} : { sectionRequestsUsed: continuation.sectionRequestsUsed }),
    ...(continuation?.sectionMaxKeys === undefined ? {} : { sectionMaxKeys: continuation.sectionMaxKeys }),
  };
}

/**
 * Run the judge/synthesis pass: payload + both cases -> JSON-only
 * JUDGE_OUTPUT_SCHEMA. Unlike bull/bear, the judge intentionally omits
 * `output_config.format.schema`: the full report grammar exceeded Anthropic's
 * live compiled-grammar ceiling. We still include the compact JSON Schema as
 * prompt text and enforce the exact Zod schema after parsing, with retry on
 * validation failure.
 */
export async function runJudgePass(
  deps: PassDeps,
  payload: ContextPayload,
  bull: AnalystCase,
  bear: AnalystCase,
  validationFeedback?: string,
  settlement?: PassSettlementHook<JudgeOutput>,
  beforeProviderLaunch?: () => void | Promise<void>,
  /** Sections kept from a cut-off response; merged in before validation. */
  continuation?: PassContinuation,
): Promise<PassRun<JudgeOutput>> {
  const judgeModel = judgeModelFor(deps.model);
  for (const [side, input] of [["bull", bull], ["bear", bear]] as const) {
    const checked = parseAnalystCase(input);
    if (!checked.ok) {
      const reason = `${side} case failed current generation validation before synthesis: ${checked.error}`;
      return settlePassRun({ ok: false, gap: { field: "llm.judge.analystInputs", reason, severity: "critical" },
        error: { kind: "schema", message: reason, notLaunched: true } }, judgeModel, settlement);
    }
  }
  const presentation = judgePresentationFor(deps, payload, bull, bear);
  const parse =
    continuation === undefined || continuation.repairRejectedComplete
      ? parseJudgeOutput
      : (raw: unknown) => parseJudgeOutput(mergeContinuation(continuation.completed, raw));
  const attempt = async (order: JudgeOrder): Promise<PassRun<JudgeOutput>> => {
    let finished: PassRun<JudgeOutput>;
    if (deps.sectionedOutput || deps.judgeSectionedOutput) {
      // In parts: the kept sections seed the parts instead of a continuation turn.
      const base = buildJudgeRunPassArgs(
        deps, payload, bull, bear, validationFeedback, order,
        continuation === undefined ? undefined : { ...continuation, completed: {} },
      );
      finished = await runPassInSections({
        deps,
        base: { ...base, outputSchema: judgeOutputToJsonSchema() },
        allKeys: JUDGE_OUTPUT_KEYS,
        parts: JUDGE_SECTION_PARTS,
        completed: continuation?.completed,
        parse: parseJudgeOutput,
        checkStored: checkCarriedJudgeSections,
        field: "llm.judge",
        requestedModel: judgeModel,
        ...(parseSubscriptionModel(judgeModel) === null ? { maxRequests: API_JUDGE_MAX_SECTION_REQUESTS } : {}),
        repairRejectedComplete: continuation?.repairRejectedComplete === true,
      });
    } else {
      const request = buildJudgeRunPassArgs(deps, payload, bull, bear, validationFeedback, order, continuation);
      deps.validateRunPass?.(request);
      const outcome = await deps.runPass(request);
      finished = finishStructuredPass(outcome, parse, "llm.judge", judgeModel);
    }
    if (judgeModel === deps.model) return finished;
    // The provider sees the internally floored request. Keep the original
    // selection in durable evidence so a resumed run still discloses the floor.
    return finished.ok
      ? { ...finished, result: { ...finished.result, execution: { ...finished.result.execution, requestedModel: deps.model } } }
      : { ...finished, execution: { ...finished.execution, requestedModel: deps.model } };
  };

  await beforeProviderLaunch?.();
  const run = await attempt(presentation.order);
  let draft = buildJudgeProtocolDraft(presentation);

  if (!run.ok) return settlePassRun(run, judgeModel, settlement);

  // WS7 (D-20): `METIS_JUDGE_ORDER=both` runs the judge a SECOND time with the
  // two cases swapped and reconciles the pair. It costs two judge passes, which
  // is why it is not the default. The second request rides the same authorized
  // launch (exactly as the provider's own transport retries do) and is admitted
  // per-request by the admission object already threaded into the args, so its
  // spend is reserved and settled like any other request; the merged telemetry
  // below is what the cost log records for the pass.
  let result = run.result;
  const repairTurn = validationFeedback !== undefined && validationFeedback.length > 0;
  if (presentation.secondaryOrder !== null && (repairTurn || hasCompletedSections(continuation))) {
    // A validation retry carries the primary's "repair this JSON in place"
    // turn, and a retry after a cut-off response carries the sections that
    // response already wrote under the seeded order (the retry is told to stay
    // consistent with them, and both orders would receive the same ones). A
    // mirrored request anchored on either is not an independent draw —
    // reconciling two repairs of one document, or grades the mirror never
    // wrote, measured nothing about order sensitivity while the report said the
    // two passes agreed — so the mirror is not run (no second paid request) and
    // the reconciliation is disclosed as not performed.
    draft = withReconciliation(
      draft,
      reconciliationNotPerformed(
        repairTurn
          ? "retry attempt: the mirrored (opposite-order) judge pass is not run against a repair-in-place turn, " +
              "because a mirror anchored on the previous output is not an independent draw"
          : `retry attempt: sections kept from a cut-off response (${Object.keys(continuation!.completed).join(", ")}) ` +
              "were written under the seeded order, so a mirrored request would be anchored on them and is not an " +
              "independent draw; the mirrored judge pass was not run",
        "skipped",
      ),
    );
  } else if (presentation.secondaryOrder !== null) {
    // `attempt()` can REJECT rather than return a failure shape: a validate
    // hook throws, an abort throws, and an over-reservation error is rethrown
    // by the provider because it is neither an APIError nor retryable. Awaiting
    // it unwrapped discarded a completed, already-billed primary judge output,
    // skipped its settlement (so the runner settled the pass at zero while the
    // spend sat in the ledger) and burned a retry — two more judge passes for a
    // failure in the OPTIONAL half of the pass. A throw is fed to the same
    // disclosed-degradation path a returned failure takes.
    let mirrored: PassRun<JudgeOutput> | null = null;
    let mirroredThrow: string | null = null;
    try {
      mirrored = await attempt(presentation.secondaryOrder);
    } catch (error) {
      mirroredThrow = error instanceof Error ? error.message : String(error);
    }
    // A throw carries no billing evidence; a returned failure still contributes
    // whatever it billed, which is the module's stated contract.
    if (mirrored !== null) result = mergeJudgeBilling(result, mirrored);
    draft = withReconciliation(
      draft,
      mirrored === null
        ? reconciliationNotPerformed(
            `the mirrored judge request threw before it could report an outcome (${mirroredThrow}); the seeded-order pass stands and its cost is settled, but anything the mirrored request billed is not counted here`,
          )
        : mirrored.ok
          ? reconcileJudgeOutputs(
              run.result.output,
              mirrored.result.output,
              presentation.secondaryOrder,
            )
          : reconciliationNotPerformed(mirrored.error.message),
    );
  }

  const withProtocol: PassResult<JudgeOutput> = { ...result, judgeProtocol: draft };
  const unresolved = unresolvedJudgeEntityConflicts(payload, bull, bear, withProtocol.output);
  const finalRun: PassRun<JudgeOutput> = unresolved.length === 0
    ? { ok: true, result: withProtocol }
    : entityConflictFailure(withProtocol, unresolved);
  return settlePassRun(finalRun, judgeModel, settlement);
}

function mergeJudgeBilling(
  primary: PassResult<JudgeOutput>,
  mirrored: PassRun<JudgeOutput>,
): PassResult<JudgeOutput> {
  const usage = mirrored.ok ? mirrored.result.usage : mirrored.usage;
  const costUsd = mirrored.ok ? mirrored.result.costUsd : (mirrored.costUsd ?? 0);
  const webSearches = mirrored.ok ? mirrored.result.webSearches : (mirrored.webSearches ?? 0);
  const fetchedUrls = mirrored.ok ? mirrored.result.fetchedUrls : [];
  const mirroredModel = mirrored.ok ? mirrored.result.model : mirrored.model;
  const mirroredExecution = mirrored.ok ? mirrored.result.execution : mirrored.execution;
  const provider = parseSubscriptionModel(primary.model)?.provider;
  let execution = primary.execution;
  let model = primary.model;
  // Missing usage is itself relevant when the transport explicitly reports
  // that absence. Legacy failures without evidence retain the primary record.
  if (provider !== undefined && (usage !== undefined || mirroredExecution?.modelObserved !== undefined || mirroredExecution?.usageReported !== undefined)) {
    const observed = (effectiveModel: string | undefined, evidence: ProviderExecution | undefined): string[] => {
      if (evidence?.modelObserved === false) return [];
      if (evidence?.observedModels !== undefined) return evidence.observedModels;
      const parsed = effectiveModel === undefined ? null : parseSubscriptionModel(effectiveModel);
      return parsed === null || parsed.model === "multiple-models" ? [] : [parsed.model];
    };
    const observedModels = [...new Set([
      ...observed(primary.model, primary.execution),
      ...observed(mirroredModel, mirroredExecution),
    ])];
    if (primary.model !== mirroredModel || observedModels.length > 1) model = subscriptionModel(provider, "multiple-models");
    execution = {
      ...(primary.execution?.requestedModel === undefined ? {} : { requestedModel: primary.execution.requestedModel }),
      ...(primary.execution?.modelObserved !== undefined || mirroredExecution?.modelObserved !== undefined
        ? { modelObserved: primary.execution?.modelObserved !== false && mirroredExecution?.modelObserved !== false } : {}),
      ...(primary.execution?.usageReported !== undefined || mirroredExecution?.usageReported !== undefined
        ? { usageReported: primary.execution?.usageReported !== false && mirroredExecution?.usageReported !== false } : {}),
      requestedEffort: primary.execution?.requestedEffort === mirroredExecution?.requestedEffort
        ? primary.execution?.requestedEffort ?? null : null,
      effectiveEffort: primary.execution?.effectiveEffort === mirroredExecution?.effectiveEffort
        ? primary.execution?.effectiveEffort ?? null : null,
      ...(primary.execution?.requestedServiceTier !== undefined && primary.execution.requestedServiceTier === mirroredExecution?.requestedServiceTier
        ? { requestedServiceTier: primary.execution.requestedServiceTier } : {}),
      ...(provider === "chatgpt" ? { effectiveServiceTier: primary.execution?.effectiveServiceTier === mirroredExecution?.effectiveServiceTier
        ? primary.execution?.effectiveServiceTier ?? null : null } : {}),
      observedModels,
      // D-116: the primary's text is the report's, so its kept sections are.
      ...(primary.execution?.carriedSections === undefined ? {} : { carriedSections: primary.execution.carriedSections }),
    };
  }
  const add = (a: number | null | undefined, b: number | null | undefined): number =>
    (a ?? 0) + (b ?? 0);
  return {
    ...primary,
    model,
    ...(primary.presumed === true || (mirrored.ok ? mirrored.result.presumed : mirrored.presumed) === true
      ? { presumed: true } : {}),
    ...(execution === undefined ? {} : { execution }),
    usage: {
      input_tokens: add(primary.usage.input_tokens, usage?.input_tokens),
      output_tokens: add(primary.usage.output_tokens, usage?.output_tokens),
      cache_creation_input_tokens: add(
        primary.usage.cache_creation_input_tokens,
        usage?.cache_creation_input_tokens,
      ),
      cache_read_input_tokens: add(
        primary.usage.cache_read_input_tokens,
        usage?.cache_read_input_tokens,
      ),
      // P24: `webSearches` above sums both requests, so
      // keeping only the primary's server-tool-use block contradicted the
      // provider's own aggregation (aggregateUsage in providers/anthropic.ts
      // rewrites these two counters from the summed totals). Nothing
      // under-bills today — cost comes from `costUsd` and the column from
      // `webSearches` — but the two numbers must not disagree.
      server_tool_use: mergeServerToolUse(primary.usage.server_tool_use, usage?.server_tool_use),
    },
    costUsd: primary.costUsd + costUsd,
    webSearches: primary.webSearches + webSearches,
    fallbackUsed:
      primary.fallbackUsed || (mirrored.ok ? mirrored.result.fallbackUsed : mirrored.fallbackUsed === true),
    fetchedUrls: [...new Set([...primary.fetchedUrls, ...fetchedUrls])],
  };
}

/**
 * Run the judge pass with automatic retry on ReportSchemaZod failure.
 * On a validation failure, re-runs the judge with the Zod error appended to the
 * user turn (max {@link MAX_JUDGE_RETRIES} extra attempts), then fails loudly.
 *
 * Returns the assembled Report on success, or a gap on hard failure (keyless /
 * refusal / retries exhausted) so the orchestrator never crashes.
 */
export interface JudgeAndAssembleResult {
  ok: boolean;
  report?: Report;
  judgePass?: PassResult<JudgeOutput>;
  verify?: VerifyResult;
  gap?: ManifestEntry;
  error?: PassErrorLike | { kind: "validation"; message: string };
  attempts: number;
}

export async function runJudgeVerifyAssemble(
  deps: PassDeps,
  payload: ContextPayload,
  bull: AnalystCase,
  bear: AnalystCase,
  assemble: Omit<AssembleReportArgs, "judgeOutput" | "verify" | "model" | "costEntries"> & {
    /** Cost entries for bull/bear so far; judge/verify costs are appended. */
    priorCostEntries: CostBreakdownEntry[];
  },
  generatedAt?: string,
): Promise<JudgeAndAssembleResult> {
  let lastZodError: string | null = null;
  let lastRawOutput: string | null = null;

  // WS7 (D-20): same seeded order and same per-side caps as the runner's path.
  // This loop issues ONE judge request per attempt and never runs the mirrored
  // pass, so a `both` setting is narrowed to the seeded single order: the
  // request is framed as the one pass it is, the protocol records the order
  // that ran, and the missing reconciliation is disclosed.
  const configured = judgePresentationFor(deps, payload, bull, bear);
  const presentation: JudgePresentation =
    configured.secondaryOrder === null
      ? configured
      : { ...configured, setting: configured.order, secondaryOrder: null };
  const protocolDraft = (): JudgeProtocolDraft =>
    configured.secondaryOrder === null
      ? buildJudgeProtocolDraft(presentation)
      : withReconciliation(
          buildJudgeProtocolDraft(presentation),
          reconciliationNotPerformed(
            `${JUDGE_ORDER_ENV_KEY}=both is configured, but this judge path runs a single ${presentation.order} pass; ` +
              "the mirrored pass and its reconciliation are only run by the job runner",
            "skipped",
          ),
        );

  for (let attempt = 0; attempt <= MAX_JUDGE_RETRIES; attempt++) {
    const baseTurns = judgeUserTurns(payload, bull, bear, presentation);
    const userTurns: { role: "user" | "assistant"; content: string | RunPassContentBlock[] }[] =
      lastZodError === null
        ? baseTurns
        : [
            ...baseTurns,
            {
              role: "user" as const,
              content: judgeRetryFeedback(lastZodError, lastRawOutput ?? undefined),
            },
          ];

    const judgeRun = await runStructuredPass<JudgeOutput>({
      deps,
      system: SHARED_RULES_BLOCK,
      userTurns,
      parse: parseJudgeOutput,
      maxTokens: JUDGE_MAX_TOKENS,
      useWebSearch: false,
      model: judgeModelFor(deps.model),
      field: "llm.judge",
    });

    if (!judgeRun.ok) {
      // A schema-validation failure of received output is RETRYABLE (feed the
      // error back). A transport/no-key failure is not — short-circuit.
      if (judgeRun.validationError !== undefined) {
        lastZodError = judgeRun.validationError;
        lastRawOutput = judgeRun.rawText ?? null;
        if (attempt < MAX_JUDGE_RETRIES) continue;
        break;
      }
      return { ok: false, gap: judgeRun.gap, error: judgeRun.error, attempts: attempt + 1 };
    }

    const unresolvedEntities = unresolvedJudgeEntityConflicts(
      payload,
      bull,
      bear,
      judgeRun.result.output,
    );
    if (unresolvedEntities.length > 0) {
      const entityFailure = entityConflictFailure(judgeRun.result, unresolvedEntities);
      if (!entityFailure.ok) {
        lastZodError = entityFailure.validationError ?? entityFailure.error.message;
        lastRawOutput = entityFailure.rawText ?? null;
        if (attempt < MAX_JUDGE_RETRIES) continue;
        break;
      }
    }

    const verify = await runVerifyPass(deps, payload, judgeRun.result.output, { fetchedUrls: [],
      retainedTexts: [...analystVerificationTexts("bull", { data: bull }), ...analystVerificationTexts("bear", { data: bear })] });

    const costEntries: CostBreakdownEntry[] = [
      ...assemble.priorCostEntries,
      {
        step: "synthesize",
        model: judgeRun.result.model,
        costUsd: judgeRun.result.costUsd,
        requestedModel: deps.model,
        requestedEffort: deps.effort ?? "high",
        effectiveEffort: buildExecutionMetadataEntry({
          step: "synthesize",
          requestedModel: deps.model,
          effectiveModel: judgeRun.result.model,
          requestedEffort: deps.effort ?? "high",
          fallbackUsed: judgeRun.result.fallbackUsed,
        }).effectiveEffort,
        fallbackUsed: judgeRun.result.fallbackUsed,
        adjustments: buildExecutionMetadataEntry({
          step: "synthesize",
          requestedModel: deps.model,
          effectiveModel: judgeRun.result.model,
          requestedEffort: deps.effort ?? "high",
          fallbackUsed: judgeRun.result.fallbackUsed,
        }).adjustments,
      },
    ];

    try {
      const report = assembleReport(
        {
          symbol: assemble.symbol,
          bundle: assemble.bundle,
          computed: assemble.computed,
          judgeOutput: verify.verifiedReport,
          // Thread the coverage triplet through so meta/appendix.provenanceCoverage
          // reflect the real measured provenance instead of being zeroed next to a
          // genuine verificationRate.
          verify: {
            verificationRate: verify.verificationRate,
            coverage: verify.coverage,
            checks: verify.checks,
            log: verify.log,
          },
          costEntries,
          model: deps.model,
          pipelineVersion: assemble.pipelineVersion,
          validationGaps: assemble.validationGaps,
          judgeProtocol: protocolDraft(),
        },
        generatedAt,
      );
      return { ok: true, report, judgePass: judgeRun.result, verify, attempts: attempt + 1 };
    } catch (e) {
      if (e instanceof ReportValidationError) {
        lastZodError = e.zodError;
        lastRawOutput = JSON.stringify(judgeRun.result.output);
        continue; // retry the judge with the error + previous output fed back
      }
      throw e; // programming error — surface it
    }
  }

  return {
    ok: false,
    gap: {
      field: "llm.judge",
      reason: `judge output failed report-schema validation after ${MAX_JUDGE_RETRIES + 1} attempts: ${lastZodError ?? "unknown"}`,
      severity: "critical",
      attemptedSources: [parseSubscriptionModel(deps.model)?.provider ?? "anthropic"],
    },
    error: { kind: "validation", message: lastZodError ?? "validation failed" },
    attempts: MAX_JUDGE_RETRIES + 1,
  };
}
