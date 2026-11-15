/**
 * The bull and bear analyst passes, split out of passes.ts: each side's request, repair and
 * continuation, bounded research, and the bull-then-bear launch with its sibling-abandon and
 * not-launched outcomes. Paid work is bounded and failures are stated as observed (P23, P24).
 */

import { parseSubscriptionModel } from "@/ai/contracts";
import { ANALYST_CASE_KEYS, type AnalystCase } from "@/report/schema";
import { renderUntrustedJson, type ContextPayload } from "@/pipeline/stageC/payload";
import { canonicalizeFetchedUrl } from "@/pipeline/stageC/provenance";
import { continuationInstruction, hasCompletedSections, mergeContinuation, type PassContinuation } from "@/pipeline/stageC/continuation";
import { webResearchLimitationText, type ProviderExecution, type WebResearchLimitation } from "@/report/execution";
import { buildAnalystResearchFraming, buildAnalystResearchMaterial } from "@/pipeline/stageC/prompts";
import { AnalystResearchSchema, type AnalystResearch, type PassSettlementHook } from "@/pipeline/jobArtifacts";
import type { FirstStreamEvent, PassDeps, PassErrorLike, PassRun, RunPassArgs, RunPassOutcome, StreamingHandleLike } from "./passTypes";
import { buildAnalystRepairRunPassArgs, buildAnalystRunPassArgs, toolsFor } from "./passRequests";
import { ANALYST_SECTION_PARTS, finishStructuredPass, isTransientSubscriptionFailure, runPassInSections, sectionExecution, settlePassRun, sumUsage } from "./passExecution";
import { checkCarriedAnalystSections, parseAnalystCase } from "./passOutputs";
import { extractText, webSearchesOf } from "./passParsing";

/* ------------------------------------------------------------------------ *
 * Bull / bear passes
 * ------------------------------------------------------------------------ */

export async function runBullPass(
  deps: PassDeps,
  payload: ContextPayload,
  settlement?: PassSettlementHook<AnalystCase>,
  beforeProviderLaunch?: () => void | Promise<void>,
): Promise<PassRun<AnalystCase>> {
  const request = buildAnalystRunPassArgs(deps, payload, "bull");
  deps.validateRunPass?.(request);
  await beforeProviderLaunch?.();
  const run = await runAnalystRequest(deps, request, "bull");
  return settlePassRun(run, deps.model, settlement);
}

/** Run the bear pass. Independent — never receives the bull output. */
export async function runBearPass(
  deps: PassDeps,
  payload: ContextPayload,
  settlement?: PassSettlementHook<AnalystCase>,
  beforeProviderLaunch?: () => void | Promise<void>,
): Promise<PassRun<AnalystCase>> {
  const request = buildAnalystRunPassArgs(deps, payload, "bear");
  deps.validateRunPass?.(request);
  await beforeProviderLaunch?.();
  const run = await runAnalystRequest(deps, request, "bear");
  return settlePassRun(run, deps.model, settlement);
}

/** Run one analyst repair attempt (see analystRepairFeedback). */
export async function runAnalystRepairPass(
  deps: PassDeps,
  payload: ContextPayload,
  side: "bull" | "bear",
  validationFeedback: string,
  settlement?: PassSettlementHook<AnalystCase>,
  beforeProviderLaunch?: () => void | Promise<void>,
): Promise<PassRun<AnalystCase>> {
  const request = buildAnalystRepairRunPassArgs(deps, payload, side, validationFeedback);
  deps.validateRunPass?.(request);
  await beforeProviderLaunch?.();
  const run = await runAnalystRequest(deps, request, side);
  return settlePassRun(run, deps.model, settlement);
}

/**
 * Run one analyst CONTINUATION attempt: the side's previous response was cut
 * off by the provider's time limit after completing some sections. Only the
 * rest is requested, and the kept sections are merged back in before schema
 * validation (see stageC/continuation.ts).
 */
export async function runAnalystContinuationPass(
  deps: PassDeps,
  payload: ContextPayload,
  side: "bull" | "bear",
  continuation: PassContinuation,
  settlement?: PassSettlementHook<AnalystCase>,
  beforeProviderLaunch?: () => void | Promise<void>,
): Promise<PassRun<AnalystCase>> {
  const base = buildAnalystRunPassArgs(deps, payload, side);
  const retry = continuation.sectionRetryCount ? { sectionRetryCount: continuation.sectionRetryCount } : {};
  const request: RunPassArgs = deps.sectionedOutput
    ? { ...base, ...retry }
    : {
        ...base,
        messages: hasCompletedSections(continuation)
          ? [...base.messages, { role: "user", content: continuationInstruction(continuation.completed, ANALYST_CASE_KEYS) }]
          : base.messages,
        ...retry,
      };
  deps.validateRunPass?.(request);
  await beforeProviderLaunch?.();
  const run = await runAnalystRequest(deps, request, side, continuation.completed);
  return settlePassRun(run, deps.model, settlement);
}

/** One analyst request: whole, or in parts on a time-limited connection. */
async function runAnalystRequest(
  deps: PassDeps,
  request: RunPassArgs,
  side: "bull" | "bear",
  completed: Record<string, unknown> = {},
): Promise<PassRun<AnalystCase>> {
  return startAnalystRequest(deps, request, side, completed).result;
}

/** Bounds on research carried into the writing request, so its size can never fail the writer's preflight. */
export const ANALYST_RESEARCH_NOTES_MAX_CHARS = 40_000;
const ANALYST_RESEARCH_MAX_SOURCES = 200;

function boundedResearch(notes: string, sources: AnalystResearch["sources"], webResearchUsed: boolean): AnalystResearch {
  const kept = notes.length <= ANALYST_RESEARCH_NOTES_MAX_CHARS ? notes
    : `${notes.slice(0, ANALYST_RESEARCH_NOTES_MAX_CHARS)}
[research notes truncated at ${ANALYST_RESEARCH_NOTES_MAX_CHARS} characters]`;
  return AnalystResearchSchema.parse({ notes: kept, ...(webResearchUsed ? { webResearchUsed } : {}), sources: sources.slice(0, ANALYST_RESEARCH_MAX_SOURCES).map((source) => ({
    url: source.url, title: source.title.slice(0, 500), pageAge: source.pageAge === null ? null : source.pageAge.slice(0, 100),
  })) });
}

/** Research is optional; a failed provider/auth/policy request is not. */
function optionalResearchLimitation(outcome: Extract<RunPassOutcome, { ok: false }>, request: RunPassArgs): WebResearchLimitation | undefined {
  const provider = parseSubscriptionModel(request.model)?.provider;
  // The Claude sign-in route has the same local action and time limits (D-269);
  // its capability refusal is ChatGPT-only (an HTTP 400 on the tools parameter).
  if (provider !== "chatgpt" && provider !== "claude" || outcome.error.kind !== "transport" || request.signal?.aborted || outcome.error.aborted || outcome.error.notLaunched) return undefined;
  const failure = outcome.error.providerFailure;
  if (failure?.code === "local_web_action_limit") return "action_limit";
  if (failure?.code === "local_web_time_limit") return "time_limit";
  if (provider === "chatgpt" && failure?.code === "subscription_sharing_unsupported_capability" && failure.httpStatus === 400 &&
      /^(?:tools|tools\[0\](?:\.type)?)$/.test(failure.param ?? "")) return "capability_unavailable";
  return undefined;
}

/** Research and writing are separate provider invocations, each with its own permit.
 * The checkpoint is written before writing starts, including empty research. */
function startAnalystRequest(
  deps: PassDeps,
  request: RunPassArgs,
  side: "bull" | "bear",
  completed: Record<string, unknown> = {},
  streaming = false,
): { firstToken: Promise<FirstStreamEvent>; result: Promise<PassRun<AnalystCase>> } {
  const checkpointField = `llm.${side}:research`;
  const saved = AnalystResearchSchema.safeParse(deps.sectionCheckpoint?.load(checkpointField).research);
  const launch = (args: RunPassArgs): StreamingHandleLike => {
    deps.validateRunPass?.(args);
    return streaming && deps.runPassStreaming
      ? deps.runPassStreaming(args)
      : { firstToken: Promise.resolve("streamEvent"), result: deps.runPass(args) };
  };
  const write = (args: RunPassArgs): { firstToken: Promise<FirstStreamEvent>; result: Promise<PassRun<AnalystCase>> } => {
    if (deps.sectionedOutput) return { firstToken: Promise.resolve("streamEvent"), result: writeAnalystRequest(deps, args, side, completed) };
    const handle = launch(args);
    return { firstToken: handle.firstToken, result: handle.result.then(outcome => finishStructuredPass(outcome,
      raw => parseAnalystCase(mergeContinuation(completed, raw)), `llm.${side}`, deps.model)) };
  };
  const withNotes = (research: AnalystResearch): RunPassArgs => {
    const messages = [...request.messages];
    const first = messages[0];
    if (!first || typeof first.content === "string") throw new Error("analyst writer requires a cached payload block");
    messages[0] = { ...first, content: [first.content[0],
      { type: "text", text: buildAnalystResearchMaterial(side, renderUntrustedJson(research)) },
      ...first.content.slice(1)] };
    return { ...request, messages };
  };
  const attach = (run: PassRun<AnalystCase>, research: AnalystResearch,
    charge?: Pick<PassErrorLike, "usage" | "costUsd" | "fallbackUsed" | "presumed" | "execution" | "model" | "webSearches">): PassRun<AnalystCase> => {
    const current = run.ok ? run.result : run;
    const usage = charge ? sumUsage(charge.usage ?? { input_tokens: 0, output_tokens: 0 }, current.usage ?? { input_tokens: 0, output_tokens: 0 }) : current.usage;
    const totals = {
      usage,
      costUsd: (current.costUsd ?? 0) + (charge?.costUsd ?? 0),
      webSearches: (current.webSearches ?? 0) + (charge?.webSearches ?? (charge?.usage ? webSearchesOf(charge.usage) : 0)),
      fallbackUsed: current.fallbackUsed === true || charge?.fallbackUsed === true,
      ...((current.presumed || charge?.presumed) ? { presumed: true } : {}),
    };
    if (usage && (totals.webSearches > 0 || charge?.webSearches !== undefined)) {
      totals.usage = { ...usage, server_tool_use: { ...usage.server_tool_use, web_search_requests: totals.webSearches } };
    }
    // The final writer has no tools, but its case uses the research above.
    // Count only this attempt's completed actions; a checkpoint can retain web
    // evidence without launching (or charging) another research request.
    const combined = charge ? sectionExecution(deps.model, [charge, current]) : { model: current.model, execution: current.execution };
    const execution: ProviderExecution = { ...current.execution, ...combined.execution,
      webSearches: totals.webSearches,
      ...(research.limitation === undefined ? {} : { webResearchLimitation: research.limitation }),
      webResearchUsed: research.limitation === undefined && (current.execution?.webResearchUsed === true || charge?.execution?.webResearchUsed === true ||
        research.webResearchUsed === true || research.sources.length > 0 || totals.webSearches > 0),
    };
    return run.ok
      ? { ...run, result: { ...run.result, ...totals, model: combined.model ?? run.result.model, execution, usage: totals.usage!, research,
          fetchedUrls: [...new Set([...run.result.fetchedUrls, ...research.sources.map(source => source.url)])].sort() } }
      : { ...run, ...totals, execution, error: { ...run.error, execution, research } };
  };
  if (saved.success) {
    const handle = write(withNotes(saved.data));
    return { firstToken: handle.firstToken, result: handle.result.then(run => attach(run, saved.data)) };
  }
  const tools = toolsFor(deps, true, deps.model);
  if (!tools) return write(request);
  const researchRequest: RunPassArgs = { ...request, tools, outputSchema: undefined,
    messages: [{ role: "user", content: [
      ...(typeof request.messages[0].content === "string" ? [] : request.messages[0].content.slice(0, 1)),
      { type: "text", text: buildAnalystResearchFraming(side) },
    ] }] };
  const researchHandle = launch(researchRequest);
  return { firstToken: researchHandle.firstToken, result: researchHandle.result.then(async outcome => {
    if (!outcome.ok) {
      const limitation = optionalResearchLimitation(outcome, researchRequest);
      if (limitation === undefined) return finishStructuredPass(outcome, parseAnalystCase, `llm.${side}`, deps.model);
      // Save only the typed limitation. Partial notes, annotations and URLs from
      // the canceled request are not evidence and cannot reach a writer/retry.
      const research: AnalystResearch = { limitation, notes: webResearchLimitationText(limitation), sources: [], webResearchUsed: false };
      try {
        deps.sectionCheckpoint?.save(checkpointField, { research });
        return attach(await write(withNotes(research)).result, research, outcome.error);
      } catch (error) {
        return attach(hardFailure(`llm.${side}`, error, deps.model), research, outcome.error);
      }
    }
    const data = outcome.value.data;
    const urls = new Set((data.fetchedUrls ?? []).flatMap(url => canonicalizeFetchedUrl(url) ?? []));
    const sources = (data.fetchedSources ?? []).filter(source => urls.has(source.url));
    let research: AnalystResearch = { notes: "", sources: [] };
    try {
      research = boundedResearch(data.researchText ?? extractText(data.message), [
        ...sources, ...[...urls].filter(url => !sources.some(source => source.url === url)).map(url => ({ url, title: "", pageAge: null })),
      ], data.execution?.webResearchUsed === true || webSearchesOf(data.usage) > 0 || urls.size > 0);
      deps.sectionCheckpoint?.save(checkpointField, { research });
      return attach(await write(withNotes(research)).result, research, data);
    } catch (error) {
      // The research request was billed: a writer that cannot launch (preflight,
      // checkpoint or a thrown transport) keeps that charge on the pass record.
      return attach(hardFailure(`llm.${side}`, error, deps.model), research, data);
    }
  }) };
}

async function writeAnalystRequest(
  deps: PassDeps, request: RunPassArgs, side: "bull" | "bear", completed: Record<string, unknown>,
): Promise<PassRun<AnalystCase>> {
  const parse = (raw: unknown) => parseAnalystCase(mergeContinuation(completed, raw));
  if (deps.sectionedOutput) {
    return runPassInSections({
      deps,
      base: request,
      allKeys: ANALYST_CASE_KEYS,
      parts: ANALYST_SECTION_PARTS,
      completed,
      parse,
      checkStored: checkCarriedAnalystSections,
      field: `llm.${side}`,
      requestedModel: deps.model,
    });
  }
  const outcome = await deps.runPass(request);
  return finishStructuredPass(outcome, parse, `llm.${side}`, deps.model);
}

export interface BullBearResult {
  bull: PassRun<AnalystCase>;
  bear: PassRun<AnalystCase>;
}

/**
 * A sibling launch failed after bull crossed its provider boundary. Bull is
 * awaited and durably settled before this typed partial state is propagated,
 * so callers must never fabricate a second fallback settlement for it.
 */
export class BullBearOverlapLaunchFailure extends Error {
  constructor(
    readonly bull: PassRun<AnalystCase>,
    readonly bearLaunched: boolean,
    cause: unknown,
  ) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`bear launch failed after bull started: ${detail}`, { cause });
    this.name = "BullBearOverlapLaunchFailure";
  }
}

/**
 * Per-side lifecycle hooks so the caller can stamp REAL start/finish times.
 * The two passes overlap in the streaming path (bear fires once bull's first
 * token lands), so the job runner cannot infer per-pass timing from around
 * the combined call. Hook throws are swallowed — telemetry must never break
 * a paid pass.
 */
export interface BullBearHooks {
  /** Durable permit gate. Unlike telemetry hooks, failure must stop launch. */
  beforePass?: (side: "bull" | "bear") => void | Promise<void>;
  /** Durable authority fence propagated at the immediate provider boundary. */
  beforeProviderLaunch?: (side: "bull" | "bear") => void | Promise<void>;
  onPassStart?: (side: "bull" | "bear") => void;
  onPassFinish?: (side: "bull" | "bear") => void;
}

export interface BullBearSettlementHooks {
  bull?: PassSettlementHook<AnalystCase>;
  bear?: PassSettlementHook<AnalystCase>;
}

function safeHook(hook: ((side: "bull" | "bear") => void) | undefined, side: "bull" | "bear"): void {
  try {
    hook?.(side);
  } catch {
    // Telemetry hooks never break a pass.
  }
}

/** Resolve/reject passthrough that fires the finish hook either way. */
function tapFinish<T>(promise: Promise<T>, hooks: BullBearHooks, side: "bull" | "bear"): Promise<T> {
  return promise.then(
    (value) => {
      safeHook(hooks.onPassFinish, side);
      return value;
    },
    (err: unknown) => {
      safeHook(hooks.onPassFinish, side);
      throw err;
    },
  );
}

function pendingForever(): Promise<never> {
  return new Promise<never>(() => undefined);
}

/**
 * Once bull has crossed its provider boundary, every bear gate/fence failure
 * must first observe bull's exact durable settlement. Conversely, a bull
 * settlement failure must interrupt a still-pending bear gate instead of
 * waiting for capacity/lease expiry before the control-plane failure surfaces.
 */
async function setupBearAfterLaunchedBull<T>(
  settledBull: Promise<PassRun<AnalystCase>>,
  setup: () => Promise<T>,
  bearWasLaunched: () => boolean,
): Promise<T> {
  const setupPromise = setup();
  const bullFailure = settledBull.then(
    () => pendingForever(),
    (error: unknown) => Promise.reject(error),
  );
  try {
    return await Promise.race([setupPromise, bullFailure]);
  } catch (error) {
    const bullOutcome = await Promise.allSettled([settledBull]);
    if (bullOutcome[0].status === "rejected") {
      // Promise.race installed rejection observation on the pending setup. The
      // runner aborts its shared signal on settlement persistence failure so a
      // capacity-polling permit gate also exits and releases any prelaunch lease.
      void setupPromise.catch(() => undefined);
      throw bullOutcome[0].reason;
    }
    throw new BullBearOverlapLaunchFailure(
      bullOutcome[0].value,
      bearWasLaunched(),
      error,
    );
  }
}

function failureMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function hardFailure(field: string, err: unknown, model: string): PassRun<AnalystCase> {
  const reason = failureMessage(err);
  return {
    ok: false,
    gap: { field, reason, severity: "critical", attemptedSources: [parseSubscriptionModel(model)?.provider ?? "anthropic"] },
    error: { kind: "transport", message: reason },
  };
}

/**
 * Whether a failed analyst run leaves the whole job unable to produce a report.
 *
 * The runner pays for one repair attempt per side whose output was RECEIVED and
 * rejected by the schema (`validationError`), and only then synthesizes. Any
 * other failure — transport, refusal, a stalled stream the idle guard
 * abandoned — is not repairable, so `recoverable` in the runner is false and
 * the job degrades to a data-only report whatever the sibling does next.
 *
 * The sibling used to keep generating anyway: on 2026-09-03 bull was abandoned
 * at 19:05:00 and bear billed on until the user cancelled it by hand at
 * 19:13:12, eight minutes of paid output for a report that could no longer be
 * written. A side's output is only worth finishing because a partial resume can
 * reuse it, and a resume re-runs the failed side regardless — so the sibling's
 * remaining spend buys, at best, one pass on a run the user may never resume.
 */
function endsTheRun(run: PassRun<AnalystCase>): boolean {
  // A dropped zero-cost subscription stream is retried by the runner, so the
  // sibling's output is still worth finishing: aborting it would turn one
  // retryable side into two.
  return !run.ok && run.validationError === undefined && !isTransientSubscriptionFailure(run);
}

/** A per-side signal that aborts with the job's, or on its own. */
function siblingAbortSignal(
  base: AbortSignal | undefined,
  controller: AbortController,
): AbortSignal {
  return base === undefined ? controller.signal : AbortSignal.any([base, controller.signal]);
}

/**
 * The abort reason a doomed run hands its surviving side. A sentinel, so the
 * relabel below can tell an abort WE issued from one the job signal issued: a
 * cancel or a stage deadline aborts both sides at once, both then satisfy
 * `endsTheRun`, and each side's controller fires for the other — without the
 * sentinel both would be labelled "abandoned because the sibling failed" for a
 * run nobody's sibling failed.
 */
class SiblingAbandonedSignal extends Error {
  constructor(readonly failed: "bull" | "bear") {
    super(`${failed} pass failed unrecoverably; the run cannot produce a report`);
    this.name = "SiblingAbandonedSignal";
  }
}

/**
 * Relabel a side we abandoned on purpose. The provider reports a deliberate
 * abort as an ordinary transport failure ("request aborted by the caller"),
 * which reads like a provider fault. The billed figures on the run are kept
 * exactly as the provider settled them: what the request reported before the
 * abort plus a presumed remainder for the output it may have generated
 * unread (DECISIONS D-09), flagged presumed so `npm run costs:reconcile` can
 * lower it — the abort stops further billing, it does not make the spend so
 * far knowable.
 */
function abandonedSibling(
  run: PassRun<AnalystCase>,
  side: "bull" | "bear",
  failed: "bull" | "bear",
): PassRun<AnalystCase> {
  if (run.ok) return run;
  const message =
    `${side} pass abandoned because the ${failed} pass failed unrecoverably — ` +
    "the run could no longer produce a report, so its request was aborted; what it billed up to " +
    "the abort is settled as reported usage plus a presumed remainder";
  return {
    ...run,
    gap: { ...run.gap, reason: message },
    error: { ...run.error, message },
  };
}

/**
 * A side that never reached the provider because its sibling had already ended
 * the run. `notLaunched` keeps the runner from settling or billing it at all.
 */
function siblingNeverLaunched(side: "bull" | "bear", failed: "bull" | "bear"): PassRun<AnalystCase> {
  const message =
    `${side} pass not launched because the ${failed} pass failed unrecoverably — ` +
    "the run could no longer produce a report, so no second analyst request was sent";
  return {
    ok: false,
    gap: { field: `llm.${side}`, reason: message, severity: "critical", attemptedSources: [] },
    error: { kind: "transport", message, notLaunched: true },
  };
}

function bearNotLaunched(reason: string): PassRun<AnalystCase> {
  const message = `bear pass not launched because bull stream did not reach a first token (${reason})`;
  return {
    ok: false,
    gap: { field: "llm.bear", reason: message, severity: "critical", attemptedSources: [] },
    error: { kind: "transport", message, notLaunched: true },
  };
}

/**
 * Sequence bull then bear per the prompt-cache write rule : fire the
 * bull pass, AWAIT its first streamed token so the payload cache entry becomes
 * readable, then fire bear so it READS the cache bull wrote instead of paying a
 * second 1.25x write. When no streaming runner is injected (tests / dry-run), it
 * degrades to a correct sequential await — bull fully completes before bear
 * starts, which is still cache-correct, just without the concurrency win.
 */
export async function runBullThenBear(
  deps: PassDeps,
  payload: ContextPayload,
  hooks: BullBearHooks = {},
  settlements: BullBearSettlementHooks = {},
): Promise<BullBearResult> {
  if (deps.runPassStreaming) {
    // Validate a throwaway build FIRST so an invalid request never takes a
    // durable lease, then build the request that is actually sent AFTER the
    // hooks — `beforePass` is where the runner registers this side's
    // per-request admission, and the args snapshot `deps.admissionFor(side)`
    // at construction. Building before the hook captured `undefined` and
    // silently disabled per-request admission for both analyst passes: no
    // request reserved or settled on its own, and a stalled stream's presumed
    // remainder was booked as an `actual` cost the reconciler cannot lower.
    // The non-streaming fallback below has always had this order.
    deps.validateRunPass?.(buildAnalystRunPassArgs(deps, payload, "bull"));
    await hooks.beforePass?.("bull");
    safeHook(hooks.onPassStart, "bull");
    await hooks.beforeProviderLaunch?.("bull");
    // Either side may end the run (see endsTheRun); when one does, the other is
    // aborted at once rather than left billing for output nothing can use.
    const abandon = { bull: new AbortController(), bear: new AbortController() };
    const abandonSibling = (side: "bull" | "bear", failed: "bull" | "bear"): void => {
      if (abandon[side].signal.aborted) return;
      abandon[side].abort(new SiblingAbandonedSignal(failed));
    };
    /**
     * Relabel a side only when OUR abort is what ended it: the sibling
     * controller fired with its sentinel, the job signal did not, and the
     * provider reports a caller abort (`error.aborted`). A side that failed on
     * its own in the same instant keeps its own message: whether the abort or
     * the provider got there first is a microtask race, and the provider's
     * flag settles it without one.
     */
    const wasCutShort = (side: "bull" | "bear", run: PassRun<AnalystCase>): boolean =>
      abandon[side].signal.aborted &&
      abandon[side].signal.reason instanceof SiblingAbandonedSignal &&
      deps.signal?.aborted !== true &&
      !run.ok &&
      run.error.aborted === true;
    /**
     * The run exactly as it is settled AND returned. The relabel has to reach
     * the settlement hook: the durable pass artifact and the step detail it
     * writes are what a resume, the pipeline page and a post-mortem read, and
     * they used to record the provider's raw abort message while the manifest
     * said the run abandoned the side on purpose.
     */
    const labelled = (side: "bull" | "bear", run: PassRun<AnalystCase>): PassRun<AnalystCase> =>
      wasCutShort(side, run) ? abandonedSibling(run, side, side === "bull" ? "bear" : "bull") : run;
    const bullHandle = startAnalystRequest(deps, {
      ...buildAnalystRunPassArgs(deps, payload, "bull"),
      signal: siblingAbortSignal(deps.signal, abandon.bull),
    }, "bull", {}, true);
    const bullRun = tapFinish(bullHandle.result, hooks, "bull").then(
      (outcome) => outcome,
      (error: unknown) => hardFailure("llm.bull", error, deps.model),
    );
    // Attached before bear is launched, so an already-doomed bull hands bear a
    // signal that is aborted the moment its request is created.
    void bullRun.then(
      (run) => {
        if (endsTheRun(run)) abandonSibling("bear", "bull");
      },
      () => undefined,
    );
    // Cache entry becomes readable only once bull actually emits a stream event.
    // Raced with the result itself: the provider's contract is that firstToken
    // settles on every terminal exit, and the race keeps a slip in that
    // contract from leaving the orchestrator waiting on a side that has
    // already finished (a cancel during a pre-token retry backoff once did).
    const firstEvent = await Promise.race([
      bullHandle.firstToken,
      bullRun.then(() => "error" as const),
    ]);
    if (firstEvent !== "streamEvent") {
      const bull = await bullRun;
      const settledBull = settlePassRun(bull, deps.model, settlements.bull);
      if (!bull.ok) {
        const bear = bearNotLaunched(firstEvent);
        await settledBull;
        // Bear never crossed a provider/model boundary, so its in-memory gap
        // is not a durable pass outcome and must not create a placeholder
        // artifact or cost identity.
        return { bull, bear };
      }

      // Rare but possible: the SDK reached "end" without our streamEvent latch.
      // Run bear sequentially after bull completes rather than racing without a
      // confirmed cache write.
      let bearLaunched = false;
      const { settledBear } = await setupBearAfterLaunchedBull(
        settledBull,
        async () => {
          deps.validateRunPass?.(buildAnalystRunPassArgs(deps, payload, "bear"));
          await hooks.beforePass?.("bear");
          safeHook(hooks.onPassStart, "bear");
          await hooks.beforeProviderLaunch?.("bear");
          bearLaunched = true;
          return {
            settledBear: tapFinish(
              runBearPass(deps, payload, settlements.bear),
              hooks,
              "bear",
            ),
          };
        },
        () => bearLaunched,
      );
      const outcomes = await Promise.allSettled([
        settledBull,
        settledBear,
      ]);
      if (outcomes[0].status === "rejected") throw outcomes[0].reason;
      if (outcomes[1].status === "rejected") throw outcomes[1].reason;
      return { bull, bear: outcomes[1].value };
    }
    const settledBull = bullRun.then((run) =>
      settlePassRun(labelled("bull", run), deps.model, settlements.bull),
    );
    let bearLaunched = false;
    const bearHandle = await setupBearAfterLaunchedBull(
      settledBull,
      async () => {
        // The run is already lost: do not open a paid request just to kill it.
        if (abandon.bear.signal.aborted) return null;
        deps.validateRunPass?.(buildAnalystRunPassArgs(deps, payload, "bear"));
        await hooks.beforePass?.("bear");
        // Re-checked after the permit gate: bull can end the run inside that
        // await, and this is the last point before the request is authorized
        // where backing out still releases the lease as a prelaunch (a request
        // opened with an already-aborted signal dies unbilled, but it should
        // not have been opened at all).
        if (abandon.bear.signal.aborted) return null;
        safeHook(hooks.onPassStart, "bear");
        await hooks.beforeProviderLaunch?.("bear");
        bearLaunched = true;
        return startAnalystRequest(deps, {
          ...buildAnalystRunPassArgs(deps, payload, "bear"),
          signal: siblingAbortSignal(deps.signal, abandon.bear),
        }, "bear", {}, true);
      },
      () => bearLaunched,
    );
    if (bearHandle === null) {
      // Bull ended the run before bear was launched, so bear never reached the
      // provider and never billed.
      const bullOnly = await Promise.allSettled([settledBull]);
      if (bullOnly[0].status === "rejected") throw bullOnly[0].reason;
      return { bull: bullOnly[0].value, bear: siblingNeverLaunched("bear", "bull") };
    }
    const bearRun = tapFinish(bearHandle.result, hooks, "bear").then(
      (outcome) => outcome,
      (error: unknown) => hardFailure("llm.bear", error, deps.model),
    );
    void bearRun.then(
      (run) => {
        if (endsTheRun(run)) abandonSibling("bull", "bear");
      },
      () => undefined,
    );
    const settledBear = bearRun.then((run) =>
      settlePassRun(labelled("bear", run), deps.model, settlements.bear),
    );
    const [bullOutcome, bearOutcome] = await Promise.allSettled([
      settledBull,
      settledBear,
    ]);
    if (bullOutcome.status === "rejected") throw bullOutcome.reason;
    if (bearOutcome.status === "rejected") throw bearOutcome.reason;
    return { bull: bullOutcome.value, bear: bearOutcome.value };
  }

  // Non-streaming fallback: sequential (bull completes, then bear reads cache).
  deps.validateRunPass?.(buildAnalystRunPassArgs(deps, payload, "bull"));
  await hooks.beforePass?.("bull");
  safeHook(hooks.onPassStart, "bull");
  const bull = await tapFinish(
    runBullPass(deps, payload, undefined, () => hooks.beforeProviderLaunch?.("bull")),
    hooks,
    "bull",
  );
  const settledBull = settlePassRun(bull, deps.model, settlements.bull);
  // Sequential path: bull is already known here, so a run it has ended never
  // opens a bear request at all (see endsTheRun).
  if (endsTheRun(bull)) {
    await settledBull;
    return { bull, bear: siblingNeverLaunched("bear", "bull") };
  }
  let bearLaunched = false;
  const { settledBear } = await setupBearAfterLaunchedBull(
    settledBull,
    async () => {
      deps.validateRunPass?.(buildAnalystRunPassArgs(deps, payload, "bear"));
      await hooks.beforePass?.("bear");
      safeHook(hooks.onPassStart, "bear");
      await hooks.beforeProviderLaunch?.("bear");
      bearLaunched = true;
      return {
        settledBear: tapFinish(
          runBearPass(deps, payload, settlements.bear),
          hooks,
          "bear",
        ),
      };
    },
    () => bearLaunched,
  );
  const outcomes = await Promise.allSettled([
    settledBull,
    settledBear,
  ]);
  if (outcomes[0].status === "rejected") throw outcomes[0].reason;
  if (outcomes[1].status === "rejected") throw outcomes[1].reason;
  return { bull, bear: outcomes[1].value };
}
