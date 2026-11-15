/**
 * Pass execution, split out of passes.ts: running a structured or sectioned request, summing usage,
 * finishing a structured pass from its outcome, and the settlement and retry classification of a
 * pass run. Failures and retries are stated as observed (P23, P24).
 */

import type { ManifestEntry } from "@/types/core";
import { parseSubscriptionModel, subscriptionModel } from "@/ai/contracts";
import { JUDGE_OUTPUT_KEYS, judgeOutputToJsonSchema } from "@/report/schema";
import { canonicalizeFetchedUrl } from "@/pipeline/stageC/provenance";
import { completedTopLevelFields, sectionDigest, sectionRequestInstruction, splitSections, API_JUDGE_MAX_SECTION_REQUESTS, type PassContinuation, type SectionEvidence } from "@/pipeline/stageC/continuation";
import { type ProviderExecution } from "@/report/execution";
import { createHash } from "node:crypto";
import { PassSettlementHookError, invokePassSettlementHook, serializePassFailure, type PassSettlement, type PassSettlementHook, type PassTelemetry } from "@/pipeline/jobArtifacts";
import type { PassDeps, PassErrorLike, PassRun, PassUsage, RunPassArgs, RunPassContentBlock, RunPassOutcome } from "./passTypes";
import { toolsFor } from "./passRequests";
import { extractText, isPlainObject, parseJsonMergingTrailingFields, parseJsonSalvaging, responseShapeText, webSearchesOf } from "./passParsing";
import { type CarriedSectionCheck, checkCarriedJudgeSections } from "./passOutputs";

/* ------------------------------------------------------------------------ *
 * Generic structured pass runner
 * ------------------------------------------------------------------------ */

interface StructuredPassArgs<T> {
  deps: PassDeps;
  system: string;
  userTurns: { role: "user" | "assistant"; content: string | RunPassContentBlock[] }[];
  outputSchema?: Record<string, unknown>;
  parse: (raw: unknown) => { ok: true; value: T } | { ok: false; error: string };
  maxTokens: number;
  useWebSearch: boolean;
  model: string;
  field: string;
}

export async function runStructuredPass<T>(a: StructuredPassArgs<T>): Promise<PassRun<T>> {
  const request: RunPassArgs = {
    model: a.model,
    system: a.system,
    messages: a.userTurns,
    tools: toolsFor(a.deps, a.useWebSearch, a.model),
    outputSchema: a.outputSchema,
    maxTokens: a.maxTokens,
    effort: a.deps.effort ?? "high",
    field: a.field,
    signal: a.deps.signal,
  };
  a.deps.validateRunPass?.(request);
  const outcome = await a.deps.runPass(request);
  return finishStructuredPass(outcome, a.parse, a.field, a.model);
}

/**
 * Requests per structured response on a connection that closes any single
 * response at 15 minutes (the ChatGPT plan endpoint). A whole judge report at
 * high effort took 10.7-15+ minutes, and every long failure ended at exactly
 * 15.0, so one request per report sits on the wall; at max effort it is past
 * it. Each part asks for a slice of the sections, well under the limit.
 */
export const JUDGE_SECTION_PARTS = 3;
export const ANALYST_SECTION_PARTS = 2;

export function sumUsage(a: PassUsage, b: PassUsage): PassUsage {
  return {
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    cache_creation_input_tokens: (a.cache_creation_input_tokens ?? 0) + (b.cache_creation_input_tokens ?? 0),
    cache_read_input_tokens: (a.cache_read_input_tokens ?? 0) + (b.cache_read_input_tokens ?? 0),
    ...((a.server_tool_use || b.server_tool_use) ? { server_tool_use: mergeServerToolUse(a.server_tool_use, b.server_tool_use) } : {}),
  };
}

/** Match the wire grammar to the requested top-level sections, retaining only reachable definitions. */
export function sectionOutputSchema(schema: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const properties = schema.properties as Record<string, unknown>;
  const subset = { ...schema, properties: Object.fromEntries(keys.map((key) => [key, properties[key]])),
    required: (schema.required as string[]).filter((key) => keys.includes(key)) };
  const definitions = schema.$defs as Record<string, unknown> | undefined;
  if (!definitions) return subset;
  const reachable = new Set<string>();
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!isPlainObject(node)) return;
    const ref = node.$ref;
    if (typeof ref === "string" && ref.startsWith("#/$defs/")) {
      const name = ref.slice("#/$defs/".length);
      if (!reachable.has(name) && name in definitions) { reachable.add(name); visit(definitions[name]); }
    }
    for (const [key, value] of Object.entries(node)) if (key !== "$defs") visit(value);
  };
  visit(subset);
  return { ...subset, $defs: Object.fromEntries([...reachable].map((name) => [name, definitions[name]])) };
}

/** One canonical section request for both preflight and provider dispatch. */
function sectionRunPassArgs(base: RunPassArgs, keys: readonly string[], allKeys: readonly string[],
  completed: Record<string, unknown>, api: boolean): RunPassArgs {
  const schema = base.outputSchema ? sectionOutputSchema(base.outputSchema, keys) : undefined;
  return { ...base, outputSchema: api ? undefined : schema, messages: [
    ...base.messages,
    { role: "user", content: sectionRequestInstruction(completed, keys, allKeys) +
      (schema ? `\n\nOUTPUT SCHEMA FOR THIS PART:\n${JSON.stringify(schema)}` : "") },
  ] };
}

function sectionPlan(allKeys: readonly string[], parts: number, completed: Record<string, unknown>,
  retryCount: number, recovering: boolean, maxRequests?: number, requestsUsed = 0, previousWidth?: number): { parts: number; groups: string[][] } {
  const retryLevel = Math.max(recovering ? 1 : 0, Number.isFinite(retryCount) ? Math.min(6, Math.max(0, Math.floor(retryCount))) : 0);
  const count = Math.min(allKeys.length, parts * 2 ** retryLevel, maxRequests === undefined ? Infinity : Math.max(1, maxRequests - requestsUsed));
  const pending = (keys: readonly string[]) => keys.filter(key => !(key in completed));
  const groups = splitSections(maxRequests === undefined ? allKeys : pending(allKeys), count).map(pending).filter(keys => keys.length > 0);
  if (maxRequests !== undefined && (retryCount > 0 || previousWidth !== undefined)) {
    const maximumWidth = Math.min(previousWidth ?? Infinity,
      Math.ceil(allKeys.length / Math.min(allKeys.length, parts * 2 ** retryLevel)));
    if (groups.some(keys => keys.length > maximumWidth)) {
      throw new Error("Synthesis cannot complete narrower recovery batches within its remaining request allowance; no request was launched");
    }
  }
  return { parts: count, groups };
}

/** Initial known requests; later requests are validated again with newly accepted sections. */
export function judgePreflightRequests(base: RunPassArgs, continuation?: PassContinuation, maxRequests?: number): RunPassArgs[] {
  const completed = checkCarriedJudgeSections(continuation?.repairRejectedComplete ? {} : continuation?.completed ?? {}).kept;
  if (JUDGE_OUTPUT_KEYS.every(key => key in completed)) return [];
  const requestsUsed = continuation?.sectionRequestsUsed ?? 0;
  if (maxRequests !== undefined && requestsUsed >= maxRequests) throw new Error(`Synthesis exhausted its ${maxRequests}-request section budget; no request was launched`);
  const plan = sectionPlan(JUDGE_OUTPUT_KEYS, JUDGE_SECTION_PARTS, completed, continuation?.sectionRetryCount ?? 0,
    Object.keys(completed).length > 0, maxRequests, requestsUsed, continuation?.sectionMaxKeys);
  return plan.groups.map(keys => sectionRunPassArgs({ ...base, outputSchema: judgeOutputToJsonSchema() }, keys, JUDGE_OUTPUT_KEYS, completed, maxRequests !== undefined));
}

/** One provider request's evidence, as a section request or a kept section's writer reports it. */
type RequestObservation = { model?: string; execution?: ProviderExecution };

/**
 * Attribute section usage only to provider evidence shared by all requests.
 * D-116: a section kept from an earlier attempt counts its writer's request
 * among them, so the model, effort and speed describe every request whose text
 * the pass returns; a kept section with no saved writer leaves them
 * unestablished. Usage stays this attempt's own.
 */
export function sectionExecution(
  requestedModel: string,
  observations: RequestObservation[],
  carried: readonly { section: string; digest: string; writer?: SectionEvidence }[] = [],
): { model: string; execution?: ProviderExecution } {
  const writers: RequestObservation[] = carried.map(({ writer }) => writer === undefined ? {} : {
    ...(writer.model === undefined ? {} : { model: writer.model }),
    ...(writer.execution === undefined ? {} : { execution: writer.execution }),
  });
  const all = [...writers, ...observations];
  let model = observations.at(-1)?.model ?? writers.at(-1)?.model ?? requestedModel;
  const provider = parseSubscriptionModel(requestedModel)?.provider;
  const carriedSections = carried.map(({ section, digest, writer }) => ({ section, digest,
    ...(writer?.execution?.modelObserved === undefined ? {} : { modelObserved: writer.execution.modelObserved }),
    ...(writer?.execution?.usageReported === undefined ? {} : { usageReported: writer.execution.usageReported }),
  }));
  const kept = carried.length === 0 ? {} : { carriedSections };
  if (!all.some((o) => o.execution !== undefined)) {
    return { model, ...(carried.length > 0 ? { execution: {
      requestedModel, modelObserved: false, usageReported: false, effectiveEffort: null, effectiveServiceTier: null, ...kept,
    } } : {}) };
  }
  const same = <K extends keyof ProviderExecution>(key: K, among: readonly RequestObservation[] = all): ProviderExecution[K] | null => {
    const first = among[0]?.execution?.[key];
    return first !== undefined && among.every((o) => o.execution?.[key] === first) ? first : null;
  };
  // Requested settings are the attempt's own: a kept section's writer ran under
  // the same captured settings, and one saved without evidence must not erase them.
  const own = observations.length > 0 ? observations : writers;
  const observedModels = [...new Set(all.flatMap((o) => o.execution?.modelObserved !== true ? []
    : o.execution.observedModels ?? (o.model === undefined ? [] : [parseSubscriptionModel(o.model)?.model ?? o.model])))];
  if (observedModels.length > 1) model = provider === undefined ? "multiple-models" : subscriptionModel(provider, "multiple-models");
  const requestedServiceTier = same("requestedServiceTier", own);
  return { model, execution: {
    requestedModel,
    requestedEffort: same("requestedEffort", own),
    effectiveEffort: same("effectiveEffort"),
    ...(all.some(o => o.execution?.taskBudgetTokens !== undefined) ? { taskBudgetTokens: same("taskBudgetTokens") } : {}),
    ...(requestedServiceTier === null ? {} : { requestedServiceTier }),
    ...(provider === "chatgpt" ? { effectiveServiceTier: same("effectiveServiceTier") } : {}),
    modelObserved: all.every((o) => o.execution?.modelObserved === true),
    usageReported: observations.length > 0 && observations.every((o) => o.execution?.usageReported === true),
    observedModels,
    ...kept,
  } };
}

/**
 * Produce one structured response in parts (see JUDGE_SECTION_PARTS): each
 * request returns only its group of top-level sections, later groups see the
 * earlier ones, and the merged object is parsed and schema-validated exactly
 * as a single response would be. A dropped part hands every section finished
 * so far to the caller as `partialText`, so a retry continues from there.
 */
export async function runPassInSections<T>(a: {
  deps: PassDeps;
  base: RunPassArgs;
  allKeys: readonly string[];
  parts: number;
  completed?: Record<string, unknown>;
  parse: (raw: unknown) => { ok: true; value: T } | { ok: false; error: string };
  checkStored: (sections: Record<string, unknown>) => CarriedSectionCheck;
  field: string;
  requestedModel: string;
  maxRequests?: number;
  /** A complete object may still have failed cross-section/report validation. */
  repairRejectedComplete?: boolean;
}): Promise<PassRun<T>> {
  const api = a.maxRequests !== undefined;
  // Evidence and ordered cases are in the first turn. Feedback may change,
  // but cannot erase accepted sections, their writers, or a paid allowance.
  const identity = createHash("sha256").update(JSON.stringify({ model: a.base.model, effort: a.base.effort,
    system: a.base.system, messages: api ? a.base.messages.slice(0, 1) : a.base.messages, schema: a.base.outputSchema })).digest("hex");
  const checkpointField = `${a.field}:${identity}`;
  // Explicit user Retry starts a new generation. An automatic retry/restart
  // shares this counter, while completed sections keep their original identity.
  const budgetField = `${a.field}:budget:${a.deps.runGeneration ?? 0}:${identity}`;
  const priorBudget = api ? a.deps.sectionCheckpoint?.load(budgetField) : undefined;
  const count = (value: unknown): number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
  let requestsUsed = Math.max(count(a.base.sectionRequestsUsed), count(priorBudget?.requestsUsed));
  let maxKeys = Math.min(...[a.base.sectionMaxKeys, priorBudget?.maxKeys].map(count).filter(n => n > 0));
  const stored = a.deps.sectionCheckpoint?.load(checkpointField) ?? {};
  const storedEvidence = a.deps.sectionCheckpoint?.loadEvidence?.(checkpointField) ?? {};
  const valid = (sections: Record<string, unknown>) => a.checkStored(Object.fromEntries(Object.entries(sections).filter(([key]) => a.allKeys.includes(key)))).kept;
  let completed: Record<string, unknown> = { ...valid(stored), ...valid(a.completed ?? {}) };
  const rejectedComplete = a.repairRejectedComplete === true && a.parse(completed).ok;
  // Section validation cannot identify the cause of a later cross-section
  // rejection. Retain the budget/history, but do not pin that rejected object.
  if (rejectedComplete) completed = {};
  const initialKeys = new Set(Object.keys(completed));
  const evidence: Record<string, SectionEvidence> = {};
  for (const [key, value] of Object.entries(completed)) {
    const saved = storedEvidence[key];
    if (saved !== undefined && saved.digest === sectionDigest(value)) evidence[key] = saved;
  }
  const carried = Object.entries(completed).map(([section, value]) => ({ section, digest: sectionDigest(value),
    ...(evidence[section] === undefined ? {} : { writer: evidence[section] }) }));
  const wrote = (key: string, value: unknown, by: RequestObservation): void => {
    evidence[key] = { digest: sectionDigest(value), ...(by.model === undefined ? {} : { model: by.model }),
      ...(by.execution === undefined ? {} : { execution: by.execution }) };
  };
  let lastCheckpoint = JSON.stringify([stored, storedEvidence]);
  const checkpoint = (sections: Record<string, unknown>): void => {
    const known = Object.fromEntries(Object.entries(evidence).filter(([key, value]) => Object.hasOwn(sections, key) && value.digest === sectionDigest(sections[key])));
    const json = JSON.stringify([sections, known]);
    if (json === lastCheckpoint) return;
    a.deps.sectionCheckpoint?.save(checkpointField, sections, known);
    lastCheckpoint = json;
  };
  const observations: RequestObservation[] = [];
  // Keep a bounded diagnostic trail even when section validation drops a known
  // field. It is attached only to failures and never fed to checkpoint recovery.
  let responseText = "";
  const retainResponse = (text: string): void => {
    responseText = (responseText + (responseText ? "\n--- section response ---\n" : "") + text).slice(-1_000_000);
  };
  if (rejectedComplete) checkpoint(completed);
  let usage: PassUsage = { input_tokens: 0, output_tokens: 0 };
  let costUsd = 0;
  let presumed = false;
  let fallbackUsed = false;
  const fetchedUrls = new Set<string>();
  const pending = (keys: readonly string[]) => keys.filter(key => !Object.hasOwn(completed, key));
  const counters = () => api ? { sectionRequestsUsed: requestsUsed,
    ...(Number.isFinite(maxKeys) ? { sectionMaxKeys: maxKeys } : {}),
    sectionProgress: Object.keys(completed).some(key => !initialKeys.has(key)) } : {};
  const failure = (error: PassErrorLike, gap?: ManifestEntry): PassRun<T> => {
    checkpoint(completed);
    const failed = finishStructuredPass({ ok: false,
      gap: gap ?? { field: a.field, reason: error.message, severity: "critical" },
      error: { ...error, ...counters(), usage, costUsd, fallbackUsed, ...(presumed ? { presumed: true } : {}),
        ...sectionExecution(a.requestedModel, observations, carried),
        ...(Object.keys(completed).length ? { partialText: JSON.stringify(completed) } : {}) },
    }, a.parse, a.field, a.requestedModel);
    return failed.ok ? failed : { ...failed, ...(responseText ? { rejectedText: responseText } : {}) };
  };
  const account = (data: { model?: string; execution?: ProviderExecution; usage?: PassUsage; costUsd?: number; presumed?: boolean; fallbackUsed?: boolean }): void => {
    observations.push(data);
    usage = sumUsage(usage, data.usage ?? { input_tokens: 0, output_tokens: 0 });
    costUsd += data.costUsd ?? 0;
    presumed ||= data.presumed === true;
    fallbackUsed ||= data.fallbackUsed === true;
    if (data.model !== undefined && data.usage !== undefined && data.costUsd !== undefined) {
      a.deps.sectionCheckpoint?.record?.(checkpointField, { model: data.model, usage: data.usage, costUsd: data.costUsd, execution: data.execution });
    }
  };
  const accept = (raw: Record<string, unknown>, keys: string[], by: RequestObservation): void => {
    for (const [key, value] of Object.entries(valid(Object.fromEntries(Object.entries(raw).filter(([key]) => keys.includes(key)))))) {
      if (Object.hasOwn(completed, key)) continue;
      completed[key] = value;
      wrote(key, value, by);
    }
    checkpoint(completed);
  };
  const requestPart = async (keys: string[]): Promise<PassRun<T> | null> => {
    for (let tries = 0; ; tries++) {
      if (api && requestsUsed >= a.maxRequests!) return failure({ kind: "section_budget", message: `Synthesis exhausted its ${a.maxRequests}-request section budget; no request was launched` });
      const request = sectionRunPassArgs(a.base, keys, a.allKeys, completed, api);
      request.onPartialText = text => {
        const streamed = valid(completedTopLevelFields(text));
        if (Object.keys(streamed).length) checkpoint({ ...streamed, ...completed });
      };
      let outcome: RunPassOutcome;
      try {
        a.deps.validateRunPass?.(request);
        if (api) {
          requestsUsed++;
          a.deps.sectionCheckpoint?.save(budgetField, { requestsUsed, maxKeys });
        }
        outcome = await a.deps.runPass(request);
      } catch (cause) {
        if (cause instanceof PassSettlementHookError || a.deps.signal?.aborted || (cause instanceof Error && cause.name === "AbortError")) throw cause;
        return failure({ kind: "preflight", message: `Section request could not complete: ${cause instanceof Error ? cause.message : String(cause)}` });
      }
      if (!outcome.ok) {
        account(outcome.error);
        if (outcome.error.partialText) retainResponse(outcome.error.partialText);
        accept(completedTopLevelFields(outcome.error.partialText ?? ""), [...a.allKeys], outcome.error);
        if (api && outcome.error.kind === "max_tokens") {
          maxKeys = Math.min(maxKeys, keys.length);
          a.deps.sectionCheckpoint?.save(budgetField, { requestsUsed, maxKeys });
          // The final closing delimiter can be cut off after every required
          // section is complete. Finalize locally through the normal schema and
          // semantic checks, even on the last request of the last outer attempt.
          if (a.parse(completed).ok) return null;
        }
        return failure(outcome.error, outcome.gap);
      }
      const data = api ? { ...outcome.value.data, execution: { ...outcome.value.data.execution,
        modelObserved: outcome.value.data.execution?.modelObserved ?? true,
        usageReported: outcome.value.data.execution?.usageReported ?? outcome.value.data.presumed !== true,
      } } : outcome.value.data;
      account(data);
      retainResponse(extractText(data.message));
      for (const url of data.fetchedUrls ?? []) fetchedUrls.add(url);
      let json: unknown;
      try { json = parseJsonSalvaging(extractText(data.message)); }
      catch {
        if (!api && tries === 0) continue;
        const failed = failure({ kind: "parse", message: `unparseable structured output for ${a.field}` });
        return { ...failed, ok: false, validationError: "Section output was not valid JSON", rawText: extractText(data.message) } as PassRun<T>;
      }
      if (!isPlainObject(json)) {
        const failed = failure({ kind: "schema", message: "Section response must be a JSON object" });
        return { ...failed, ok: false, validationError: "Section response must be a JSON object", rawText: extractText(data.message) } as PassRun<T>;
      }
      // A provider may return other known sections despite the subset prompt.
      // Keep every independently valid section and avoid buying it again.
      accept(json, [...a.allKeys], data);
      const unknown = Object.keys(json).filter(key => !a.allKeys.includes(key));
      if (unknown.length) {
        const failed = failure({ kind: "schema", message: `Section response contained unknown keys: ${unknown.join(", ")}` });
        return { ...failed, ok: false, validationError: `Remove unknown top-level keys: ${unknown.join(", ")}`, rawText: JSON.stringify(json) } as PassRun<T>;
      }
      return null;
    }
  };
  const alreadyComplete = a.parse(completed).ok;
  if (!alreadyComplete && api && requestsUsed >= a.maxRequests!) return failure({ kind: "section_budget", message: `Synthesis exhausted its ${a.maxRequests}-request section budget; no request was launched` });
  const plan = alreadyComplete ? { parts: a.parts, groups: [] } : sectionPlan(a.allKeys, a.parts, completed,
    a.base.sectionRetryCount ?? 0, initialKeys.size > 0, a.maxRequests, requestsUsed, Number.isFinite(maxKeys) ? maxKeys : undefined);
  // A shorter final group is not evidence of a cutoff. Persist the planned
  // maximum, narrowing it only for recovery or an actual interrupted group.
  if (api && plan.groups.length) maxKeys = Math.min(maxKeys, Math.max(...plan.groups.map(group => group.length)));
  for (const group of plan.groups) {
    const keys = pending(group);
    if (keys.length === 0) continue;
    const ended = await requestPart(keys);
    if (ended !== null) return ended;
  }
  // Paid repairs belong to the bounded outer attempt, where feedback and
  // accepted work are available. A subscription keeps its short missing-part retry.
  const missing = pending(a.allKeys);
  if (!api && missing.length > 0 && !a.parse(completed).ok) {
    for (const group of splitSections(missing, plan.parts)) {
      const ended = await requestPart(group);
      if (ended !== null) return ended;
    }
  }
  const attribution = sectionExecution(a.requestedModel, observations, carried);
  const finished = finishStructuredPass({ ok: true, value: { data: {
    message: { content: [{ type: "text", text: JSON.stringify(completed) }], usage, model: attribution.model },
    usage, costUsd, fallbackUsed, ...(presumed ? { presumed: true } : {}), fetchedUrls: [...fetchedUrls], ...attribution,
  } } }, a.parse, a.field, a.requestedModel);
  if (!finished.ok) {
    checkpoint(completed);
    return { ...finished, ...(responseText ? { rejectedText: responseText } : {}), error: { ...finished.error, ...counters(), ...(Object.keys(completed).length ? { partialText: JSON.stringify(completed) } : {}) } };
  }
  return finished;
}

export function finishStructuredPass<T>(
  outcome: RunPassOutcome,
  parse: (raw: unknown) => { ok: true; value: T } | { ok: false; error: string },
  field: string,
  requestedModel: string,
): PassRun<T> {
  if (!outcome.ok) {
    const usage = outcome.error.usage;
    return {
      ok: false,
      gap: outcome.gap,
      error: outcome.error,
      usage,
      ...(outcome.error.execution === undefined ? {} : { execution: { requestedModel, ...outcome.error.execution } }),
      costUsd: outcome.error.costUsd,
      ...(outcome.error.presumed === undefined ? {} : { presumed: outcome.error.presumed }),
      fallbackUsed: outcome.error.fallbackUsed,
      model: outcome.error.model ?? (outcome.error.costUsd !== undefined ? requestedModel : undefined),
      webSearches: outcome.error.webSearches ?? (usage ? webSearchesOf(usage) : undefined),
    };
  }
  const data = outcome.value.data;
  const attemptedSources = [parseSubscriptionModel(data.model)?.provider ?? "anthropic"];
  const text = extractText(data.message);
  const billedAttempt = {
    ...(data.presumed === undefined ? {} : { presumed: data.presumed }),
    ...(data.execution === undefined ? {} : { execution: { requestedModel, ...data.execution } }),
    usage: data.usage,
    costUsd: data.costUsd,
    fallbackUsed: data.fallbackUsed,
    model: data.model,
    webSearches: webSearchesOf(data.usage),
  };
  let json: unknown;
  try {
    json = parseJsonSalvaging(text);
  } catch (e) {
    // The parser quotes the output around the bad token, line breaks included,
    // and this reason returns to the model as repair feedback: fold it onto one
    // line so quoted model text cannot open a role line.
    const reason = `pass output was not valid JSON: ${(e as Error).message.replace(/\s+/g, " ")}`;
    return {
      ok: false,
      gap: { field, reason, severity: "critical", attemptedSources },
      error: { kind: "parse", message: `unparseable structured output for ${field}` },
      validationError: reason,
      rawText: text,
      responseShape: responseShapeText(data.message, data.usage),
      ...billedAttempt,
    };
  }
  let parsed = parse(json);
  if (!parsed.ok) {
    // Fallback only: an early-closed root left later sections outside the
    // salvaged object. Accept the merged object if — and only if — it passes.
    const merged = parseJsonMergingTrailingFields(text);
    if (merged !== null) {
      const retried = parse(merged);
      if (retried.ok) parsed = retried;
    }
  }
  if (!parsed.ok) {
    const reason = `pass output failed schema validation: ${parsed.error}`;
    return {
      ok: false,
      gap: { field, reason, severity: "critical", attemptedSources },
      error: { kind: "schema", message: `schema-invalid structured output for ${field}` },
      validationError: parsed.error,
      rawText: text,
      responseShape: responseShapeText(data.message, data.usage),
      ...billedAttempt,
    };
  }
  return {
    ok: true,
    result: {
      output: parsed.value,
      ...(data.presumed === undefined ? {} : { presumed: data.presumed }),
      usage: data.usage,
      costUsd: data.costUsd,
      fallbackUsed: data.fallbackUsed,
      model: data.model,
      webSearches: webSearchesOf(data.usage),
      fetchedUrls: data.fetchedUrls ?? [],
      ...(data.execution === undefined ? {} : { execution: { requestedModel, ...data.execution } }),
    },
  };
}

/** Pass accounting includes research and writing, even when writing is rejected. */
function telemetryFromPassRun<T>(
  run: PassRun<T>,
  requestedModel: string,
): PassTelemetry {
  const usage = run.ok ? run.result.usage : run.usage;
  const fetchedUrls = run.ok
    ? [...new Set(run.result.fetchedUrls.flatMap((url) => {
        const canonical = canonicalizeFetchedUrl(url);
        return canonical ? [canonical] : [];
      }))].sort()
    : [...new Set((run.error.research?.sources ?? []).map(source => source.url))].sort();
  return {
    model: run.ok ? run.result.model : (run.model ?? requestedModel),
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage?.cache_creation_input_tokens ?? 0,
    webSearches: run.ok ? run.result.webSearches : (run.webSearches ?? 0),
    costUsd: run.ok ? run.result.costUsd : (run.costUsd ?? 0),
    fallbackUsed: run.ok ? run.result.fallbackUsed : (run.fallbackUsed ?? false),
    billable: !parseSubscriptionModel(requestedModel) && (run.ok || run.costUsd !== undefined),
    ...((run.ok ? run.result.presumed : run.presumed) === undefined ? {} : { presumed: run.ok ? run.result.presumed : run.presumed }),
    ...((run.ok ? run.result.execution : run.execution) === undefined ? {} : { execution: run.ok ? run.result.execution : run.execution }),
    fetchedUrls,
  };
}

function settlementFromPassRun<T>(
  run: PassRun<T>,
  requestedModel: string,
): PassSettlement<T> {
  const telemetry = telemetryFromPassRun(run, requestedModel);
  if (run.ok) return { outcome: "success", data: run.result.output, telemetry, ...(run.result.research ? { research: run.result.research } : {}) };
  return {
    outcome: "failure",
    failure: serializePassFailure(new Error(run.error.message), {
      kind: run.error.kind,
      retryable: isRetryablePassFailure(run),
      providerFailure: run.error.providerFailure,
      // The zod error, not just its category — the one thing that makes a paid
      // rejection diagnosable after the run is over.
      detail: run.validationError,
      // Complete rejected bytes are diagnostic evidence, not recovered sections.
      partialText: run.error.partialText,
      rejectedText: run.rejectedText ?? run.rawText,
      responseShape: run.responseShape,
      research: run.error.research,
    }),
    telemetry,
  };
}

export async function settlePassRun<T>(
  run: PassRun<T>,
  requestedModel: string,
  hook?: PassSettlementHook<T>,
): Promise<PassRun<T>> {
  await invokePassSettlementHook(hook, settlementFromPassRun(run, requestedModel));
  return run;
}

/**
 * A dropped stream on a plan-billed (zero-cost) subscription connection is
 * eligible for bounded retries unless the provider refused it terminally. Paid
 * API transport failures stay non-retryable so a retry can never double-spend.
 */
export function isTransientSubscriptionFailure<T>(run: PassRun<T>): boolean {
  if (run.ok || run.error.kind !== "transport" || run.error.notLaunched === true || run.error.providerFailure?.disposition === "terminal") return false;
  const { model, costUsd } = run.error;
  return (
    costUsd === 0 &&
    run.error.aborted !== true &&
    typeof model === "string" &&
    parseSubscriptionModel(model) !== null
  );
}

/** One retry predicate for durable settlement and the runner facade. */
export function isRetryablePassFailure<T>(run: PassRun<T>): boolean {
  return !run.ok && (run.validationError !== undefined || isTransientSubscriptionFailure(run) ||
    (run.error.kind === "max_tokens" && run.error.sectionProgress === true &&
      (run.error.sectionRequestsUsed ?? API_JUDGE_MAX_SECTION_REQUESTS) < API_JUDGE_MAX_SECTION_REQUESTS));
}

/**
 * WS7 (D-20): fold a mirrored `both`-mode attempt's billing into the primary
 * result so the pass settles ONE cost entry covering both requests. The primary
 * output is the report; usage and execution evidence cover both requests.
 * A mirrored attempt that failed still contributes whatever it billed — an
 * unsettled paid request is exactly the thing the spend controls exist to catch.
 */
/** Sum the two server-tool counters, keeping "no block at all" when neither has one. */
export function mergeServerToolUse(
  primary: PassUsage["server_tool_use"],
  mirrored: PassUsage["server_tool_use"],
): PassUsage["server_tool_use"] {
  if (!primary) return mirrored;
  if (!mirrored) return primary;
  return {
    ...primary,
    ...mirrored,
    web_search_requests:
      (primary.web_search_requests ?? 0) + (mirrored.web_search_requests ?? 0),
  };
}
