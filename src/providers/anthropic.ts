/**
 * Anthropic provider client — model resolution, structured passes, cost
 * accounting, refusal fallbacks.
 *
 * SERVER-ONLY. Never import this module from a client component: it reads
 * ANTHROPIC_API_KEY from the environment.
 *
 * Design notes :
 * - No key → every call returns a FetchResult gap ("no Anthropic key") so the
 *   pipeline can dry-run end-to-end without throwing.
 * - All requests go through the beta messages surface (`client.beta.messages`)
 *   so fable-5 server-side refusal fallbacks and fallback detection share one
 *   code path; without `betas` the beta endpoint behaves like the GA API.
 * - Omit `temperature` / `top_p` / `top_k` (non-default values fail on current models).
 *   Fable and Opus 5.5 use their always-on adaptive default by omitting thinking;
 *   Fable 5.1 and Opus 5.5 also accept an explicit adaptive configuration.
 *   Opus 4.8 and Opus 5 get `thinking: {type: "adaptive"}`;
 *   Sonnet 5/5.5 run adaptive by default when the param is omitted. Thinking is
 *   never disabled. Every per-model rule is read from the model registry
 *   (config/models.json via src/models/registry.ts), never hard-coded here.
 *
 * Bull-first-then-bear cache-write sequencing (load-bearing for cost —
 * the cost model): a prompt-cache entry becomes readable only once the first
 * response *begins streaming*. Fire the bull pass with `runPassStreaming`,
 * await its `firstToken` promise, then fire the bear pass — it reads the
 * cache bull just wrote instead of paying a second 1.25x write:
 *
 *   const bull = runPassStreaming({ model, system, messages: bullMsgs, maxTokens: 32000 });
 *   await bull.firstToken;                  // cache entry now readable
 *   const bear = runPassStreaming({ model, system, messages: bearMsgs, maxTokens: 32000 });
 *   const [bullRes, bearRes] = await Promise.all([bull.result, bear.result]);
 */

import "server-only";

import Anthropic, {
  AnthropicError,
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
} from "@anthropic-ai/sdk";
import type {
  BetaMessage,
  BetaMessageParam,
  BetaRawMessageStreamEvent,
  BetaTextBlockParam,
  BetaThinkingConfigParam,
  BetaToolUnion,
  BetaUsage,
  BetaWebSearchTool20250305,
  BetaWebSearchTool20260318,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { getConfig } from "@/config/env";
import {
  ANTHROPIC_REQUEST_TIMEOUT_MS as REQUEST_TIMEOUT_MS,
  MODEL_STAGE_DEADLINE_MS,
} from "@/pipeline/leaseTiming";
import { modelSupportsEffort, type ProviderExecution } from "@/report/execution";
import {
  MODEL_REGISTRY,
  REGISTRY_SNAPSHOT_DATE,
  activeModelIds,
  activeModels,
  assertRegistryModel,
  autoPreferenceIds,
  isHighOrAboveEffort,
  judgeFloorModelId,
  resolveRegistryModel,
  type RegistryEffortLevel,
  type RegistryModel,
} from "@/models/registry";
import type { FetchResult, ManifestEntry, Sourced } from "@/types/core";
import { canonicalizeFetchedUrl } from "@/pipeline/stageC/provenance";

/* ------------------------------------------------------------------------ *
 * Constants
 * ------------------------------------------------------------------------ */

/**
 * "auto" model resolution preference order.
 *
 * Opus FIRST is this application's research policy. Opus 5.5 leads at $4/$20
 * per MTok and a 1M context window. Older active Opus entries remain available
 * at their own registry prices. Resolution probes models.list() and falls
 * through the registry order when an account cannot reach a preferred model.
 *
 * Fable 5 is deliberately LAST despite being the "most capable" model: at 2x
 * the older Opus cost its cyber/bio safety classifiers can refuse benign
 * finance-adjacent tickers (defense, biotech, sanctions) → degraded data-only
 * reports, its single turns can run many minutes (worsening page latency), and
 * it requires 30-day org data retention (400s under ZDR). Sonnet 5.5 and 5
 * provide the lower-priced $2/$10 tier in the existing policy.
 * Fable 5 stays reachable via an explicit ANALYSIS_MODEL override ("deep-dive"
 * mode) but is never auto-selected while Opus/Sonnet are available. Fable 5.1
 * sits just before Fable 5 at the tail for the same reasons (same price tier).
 *
 * The order is `autoPreference` in config/models.json.
 */
export const PREFERENCE_ORDER: readonly string[] = autoPreferenceIds();

function defaultAutoModel(): string {
  const first = PREFERENCE_ORDER[0];
  if (first === undefined) throw new Error("model registry: empty auto preference");
  return first;
}

/**
 * The two web-search tool variants the SDK gives a type to. These are SDK
 * DISCRIMINANTS, not policy: which variant a model gets is the registry's
 * per-model `webSearchToolType`, and these names exist only so the typed
 * request object can be narrowed and built. A registry value outside this set
 * is refused by {@link webSearchTool} rather than sent.
 *
 * `web_search_20260318` = dynamic filtering + `response_inclusion` (the
 * Anthropic API contract). `web_search_20250305` is the basic variant for
 * models without dynamic-filtering support: Haiku 4.5 rejects the modern one
 * with 400 "does not support programmatic tool calling" (verified live
 * 2026-07-08).
 */
export const WEB_SEARCH_TOOL_TYPE = "web_search_20260318" as const;
export const WEB_SEARCH_TOOL_TYPE_BASIC = "web_search_20250305" as const;

/**
 * Gap with no stream event after which a paid request is abandoned. Every paid
 * pass streams, so a provider that accepts a request and then goes quiet would
 * otherwise hold a durable lease (and its reservation) until the 10-minute
 * transport timeout with nothing to show for it. Zero disables the guard.
 *
 * THESIS_STREAM_IDLE_SECONDS has exactly ONE parser: the config schema, which
 * validates it once at startup. This used to re-read and re-parse the raw
 * environment variable here with a different accepted range, so an out-of-range
 * value silently became the default in the provider while the config held
 * something else.
 */
export function streamIdleTimeoutMs(): number {
  return getConfig().streamIdleTimeoutMs;
}

/**
 * Effort multipliers on the idle limit.
 *
 * The guard is blind to two things at once. It cannot see that the request is
 * alive — Anthropic keeps a long stream warm with SSE `ping` events, and the
 * SDK drops them before any listener runs (`core/streaming.js`:
 * `if (sse.event === 'ping') continue;`) — and it cannot see that the model is
 * working, because Metis never asks for thinking summaries: the Fable family
 * gets no `thinking` param at all (always-on), as does Opus 5.5; older Opus gets
 * `{type: "adaptive"}` with no `display`, so `display` is the API default
 * "omitted" on every model and reasoning produces no stream traffic.
 *
 * So the guard measures "no application events", which on a thinking model is
 * normal. Effort is the only knob that sets how deep that reasoning goes, and
 * Anthropic's guidance is that a single Fable request at high effort runs many
 * minutes — a flat limit survivable at `low` is a guaranteed false abort at
 * `max`. That is what happened on 2026-09-03: AMZN on claude-fable-5-1 at
 * effort `max`, five reported output tokens, abandoned at 120s and settled at
 * a presumed 127,995-token remainder ($6.40 of a $6.86 pass) for a run that
 * produced no report.
 *
 * The tiers are policy, not measurement: a straight-line widening with thinking
 * depth on top of a base that already sits at undici's body-timeout window, so
 * a dead connection is caught by the layer that CAN see pings and this guard is
 * left as the backstop for a socket kept warm by pings that never produces
 * anything. The ceiling is the model stage's own deadline, past which the guard
 * could never fire. THESIS_STREAM_IDLE_SECONDS scales all of them; zero still
 * disables the guard entirely.
 */
export const STREAM_IDLE_EFFORT_MULTIPLIER: Readonly<Record<RegistryEffortLevel, number>> = {
  low: 1,
  medium: 1,
  high: 2,
  xhigh: 3,
  max: 4,
};

/**
 * Idle limit for one request at a given effort: the configured base scaled by
 * {@link STREAM_IDLE_EFFORT_MULTIPLIER}, clamped to the model stage's deadline.
 *
 * The clamp is the STAGE deadline, not ANTHROPIC_REQUEST_TIMEOUT_MS: that
 * timeout is armed around the fetch itself, which for a streaming request
 * resolves as soon as the response headers arrive, so it bounds how long the
 * provider may take to ANSWER and not how long the stream may run. Undefined
 * effort (a model that does not support it, or a caller that sends none) keeps
 * the unscaled base.
 */
export function streamIdleTimeoutMsFor(effort: RegistryEffortLevel | undefined): number {
  const base = streamIdleTimeoutMs();
  if (base <= 0) return 0;
  const multiplier = effort === undefined ? 1 : STREAM_IDLE_EFFORT_MULTIPLIER[effort];
  return Math.min(base * multiplier, MODEL_STAGE_DEADLINE_MS);
}

/** A stream that accepted the request and then produced nothing for too long. */
export class StreamIdleTimeoutError extends Error {
  constructor(readonly idleMs: number) {
    super(`stream produced no event for ${Math.round(idleMs / 1_000)}s`);
    this.name = "StreamIdleTimeoutError";
  }
}

/** "auto" model resolution is cached for one hour. */
export const MODEL_RESOLUTION_TTL_MS = 60 * 60 * 1000;

/**
 * Hard timeout for one provider HTTP request. Durable paid leases default to
 * 15 minutes and the config refuses to start unless the lease outlives this
 * (src/pipeline/leaseTiming.ts, DECISIONS D-08), so the value lives there and
 * is re-exported here for the provider call sites.
 */
export { ANTHROPIC_REQUEST_TIMEOUT_MS } from "@/pipeline/leaseTiming";

/* ------------------------------------------------------------------------ *
 * Pricing — every figure comes from the model registry (config/models.json,
 * snapshot REGISTRY_SNAPSHOT_DATE). Nothing in this section is hard-coded.
 * ------------------------------------------------------------------------ */

export type ModelPricing = RegistryModel["pricing"];

/** Web search: $10 per 1,000 searches, on top of token costs. */
export const WEB_SEARCH_USD_PER_SEARCH = MODEL_REGISTRY.webSearchUsdPerThousand / 1000;

/** Scheduler reservation and provider-boundary cap for one analyst request. */
export const MAX_PROVIDER_WEB_SEARCHES = 8;

/** Default server-tool sampling limit before pause_turn; each iteration bills input.
 * https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons#pause_turn
 */
export const MAX_SERVER_TOOL_SAMPLING_ITERATIONS = 10;

/** Registry snapshot date, surfaced in report metadata and the pricing table. */
export const MODEL_REGISTRY_SNAPSHOT_DATE: string = REGISTRY_SNAPSHOT_DATE;

/** Active model ids in registry order — the ANALYSIS_MODEL allow-list. */
export const PRICED_MODEL_ALIASES: readonly string[] = activeModelIds();
export type PricedModelAlias = string;

/** Prices by active model id (a registry view for callers that index by id). */
export const PRICING: Readonly<Record<string, ModelPricing>> = Object.fromEntries(
  activeModels().map((entry) => [entry.id, entry.pricing]),
);

/**
 * The registry id an accepted model resolves to: the exact active id, or the
 * active id behind a dated snapshot the registry lists
 * (`claude-haiku-4-5-20251001` → `claude-haiku-4-5`). Dated ids the registry
 * does not list — every family from the 4.6 generation on — resolve to null,
 * as do `-latest` aliases and unknown ids.
 */
export function pricedModelAlias(model: string): PricedModelAlias | null {
  return resolveRegistryModel(model)?.entry.id ?? null;
}

/** Registry entry for an accepted model; throws with an actionable message otherwise. */
export function registryEntryFor(model: string): RegistryModel {
  return assertRegistryModel(model).entry;
}

export function assertPricedModel(model: string): PricedModelAlias {
  return assertRegistryModel(model).entry.id;
}

/** Look up pricing for an accepted model id. */
export function findPricing(model: string): ModelPricing | undefined {
  return resolveRegistryModel(model)?.entry.pricing;
}

/**
 * Pricing in effect for a model at a point in time. No model currently has a
 * dated price change, so this is `findPricing`; the `at` parameter is retained
 * so a future scheduled change has one place to land (and so call sites that
 * already thread a clock keep working).
 */
export function effectivePricingFor(model: string, at = new Date()): ModelPricing | undefined {
  void at;
  return findPricing(model);
}

/** Structural subset of the SDK Usage/BetaUsage objects that cost math needs. */
export interface UsageLike {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/**
 * USD cost of one request. Reads `input_tokens`, `output_tokens`,
 * `cache_creation_input_tokens` (the 5-minute cache-write price from the
 * registry — the only cache TTL Metis requests), `cache_read_input_tokens`
 * (the cache-read price from the registry: 0.1x input on every model except
 * Fable 5.1, which reads at $0.25/MTok) plus $0.01 per web search.
 *
 * Throws for a model outside the registry — silent wrong cost accounting is
 * worse than a loud failure (programming error, not a data gap).
 */
export function computeCostUsd(usage: UsageLike, model: string, webSearches = 0, at = new Date()): number {
  const pricing = effectivePricingFor(model, at);
  if (!pricing) {
    throw new Error(`computeCostUsd: no pricing entry for model "${model}" — add it to config/models.json`);
  }
  const M = 1_000_000;
  const cacheWriteTokens = usage.cache_creation_input_tokens ?? 0;
  const cacheReadTokens = usage.cache_read_input_tokens ?? 0;
  return (
    (usage.input_tokens / M) * pricing.inputPerMTok +
    (usage.output_tokens / M) * pricing.outputPerMTok +
    (cacheWriteTokens / M) * pricing.cacheWrite5mPerMTok +
    (cacheReadTokens / M) * pricing.cacheReadPerMTok +
    webSearches * WEB_SEARCH_USD_PER_SEARCH
  );
}

/** Provider context cap used by the reservation proof. */
export function modelContextTokenLimit(model: string): number {
  return registryEntryFor(model).contextWindowTokens;
}

/** Provider output ceiling (max_tokens) for a model, from the registry. */
export function modelMaxOutputTokens(model: string): number {
  return registryEntryFor(model).maxOutputTokens;
}

export type ReservationPass = "bull" | "bear" | "synthesize" | "verify";

export type VerifyReservationCapability =
  | { billable: false }
  | {
      billable: true;
      maxInputTokens: number;
      maxOutputTokens: number;
      maxWebSearches: number;
    };

function boundedInteger(value: number, label: string, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new Error(`maximum pass cost: invalid ${label} cap`);
  }
  return value;
}

/**
 * How many provider REQUESTS one pass issues per attempt. Every pass issues one
 * — except the judge under `THESIS_JUDGE_ORDER=both`, which issues a mirrored
 * second request with the two cases swapped (D-20). Callers pass the count for
 * the setting in force (JUDGE_PASSES_PER_SETTING); it defaults to 1 so a caller
 * that does not know the setting still gets the historical single-order bound.
 */
export type JudgeRequestsPerPass = 1 | 2;

function judgeRequestMultiplier(
  pass: ReservationPass,
  judgeRequestsPerPass: JudgeRequestsPerPass,
): number {
  return pass === "synthesize" ? judgeRequestsPerPass : 1;
}

/**
 * Conservative standard-price upper bound for every request that one durable
 * attempt can expose: {@link PASS_BILLING_EXPOSURE_MULTIPLIER} request maxima,
 * which is PASS_TRANSPORT_MAX_ATTEMPTS transport executions × one pause
 * resumption cycle each (CLIENT_MAX_RETRIES is 0 under D-10, so the SDK adds
 * no executions of its own) × {@link JudgeRequestsPerPass} orders on the judge.
 *
 * The judge multiplier matters in "pass" reservation mode, which has no
 * per-request admission at all: without it a `both`-mode judge pass ran two
 * requests against one pass reservation sized for one order.
 */
export function maximumPassCostUsd(
  selectedModel: string,
  pass: ReservationPass,
  verifyCapability?: VerifyReservationCapability,
  judgeRequestsPerPass: JudgeRequestsPerPass = 1,
): number {
  if (pass === "verify") {
    if (verifyCapability?.billable === false) return 0;
    if (verifyCapability?.billable !== true) {
      throw new Error("maximum pass cost: verify requires explicit billable capability metadata");
    }
  }

  const requested = registryEntryFor(selectedModel);
  const effectiveModel =
    pass === "synthesize" && requested.family === "haiku"
      ? judgeFloorModelId()
      : selectedModel;
  const effective = registryEntryFor(effectiveModel);
  const pricing = effective.pricing;
  const contextCap = effective.contextWindowTokens;

  const inputTokens = pass === "verify"
    ? boundedInteger(
        (verifyCapability as Extract<VerifyReservationCapability, { billable: true }>).maxInputTokens,
        "verify input",
        contextCap,
      )
    : contextCap;
  // Bull, bear and synthesize requests raise max_tokens to the registry
  // ceiling at effort high and above (effectiveMaxTokens), so the bound
  // covers that ceiling rather than the pass constants.
  const outputTokens = pass === "verify"
    ? boundedInteger(
        (verifyCapability as Extract<VerifyReservationCapability, { billable: true }>).maxOutputTokens,
        "verify output",
        effective.maxOutputTokens,
      )
    : effective.maxOutputTokens;
  const searches = pass === "verify"
    ? boundedInteger(
        (verifyCapability as Extract<VerifyReservationCapability, { billable: true }>).maxWebSearches,
        "verify web-search",
        MAX_PROVIDER_WEB_SEARCHES,
      )
    : pass === "synthesize"
      ? 0
      : MAX_PROVIDER_WEB_SEARCHES;

  const inputIterations = searches > 0 ? MAX_SERVER_TOOL_SAMPLING_ITERATIONS : 1;
  const fallback = effective.serverSideFallback === null ? null : registryEntryFor(effective.serverSideFallback.model);
  const fallbackQuarterMicroUsd = fallback === null ? 0 : (
    (pass === "verify" ? inputTokens : fallback.contextWindowTokens) * fallback.pricing.cacheWrite5mPerMTok * inputIterations * 4 +
    (pass === "verify" ? outputTokens : fallback.maxOutputTokens) * fallback.pricing.outputPerMTok * 4
  );
  // Work in quarter-micro-USD so the cache-write price (a quarter-dollar
  // multiple on every registry entry) and the cap comparison never acquire a
  // binary-floating-point extra micro-dollar. Input is bounded at the
  // 5-minute cache-write price, the dearest way an input token can bill.
  const quarterMicroUsdPerExecution = Math.round(
    inputTokens * pricing.cacheWrite5mPerMTok * inputIterations * 4 +
    outputTokens * pricing.outputPerMTok * 4 +
    searches * 40_000 + fallbackQuarterMicroUsd,
  );
  const microUsd = Math.ceil(
    (quarterMicroUsdPerExecution *
      PASS_BILLING_EXPOSURE_MULTIPLIER *
      judgeRequestMultiplier(pass, judgeRequestsPerPass)) /
      4,
  );
  return microUsd / 1_000_000;
}

/* ------------------------------------------------------------------------ *
 * Client singleton
 * ------------------------------------------------------------------------ */

let clientSingleton: Anthropic | null | undefined;
let clientApiKey: string | undefined;
let clientOverride = false;

/**
 * SDK auto-retry budget: ZERO (DECISIONS D-10). An SDK retry is a whole extra
 * billable request that the durable scheduler never saw, so it cannot be
 * reserved, cannot be admitted against a spend cap, and cannot be settled
 * against a permit. Every retry now happens in {@link runPassStreaming}, one
 * reserved request at a time.
 *
 * Resilience is not lost: the pass-level loop retries the same transient
 * classes the SDK did (408/409/429/5xx incl. 529 `overloaded_error`, and
 * connection failures) AND the mid-stream SSE `error` events the SDK never
 * retried at all — the failure mode of 2026-07-10, where one capacity blip
 * killed both analyst passes after ~8 minutes of billed output each.
 */
export const CLIENT_MAX_RETRIES = 0;

/**
 * Total attempts per streaming pass. This is now the ONLY retry budget (the
 * SDK's is zero), so it covers both classes: a failure of the initial HTTP
 * response, which the SDK used to retry up to five times, and a mid-stream SSE
 * `error` event, which it never retried. Six keeps the combined resilience of
 * the old arrangement while every attempt stays individually reserved.
 *
 * Each retry is a FRESH request: partial streamed output cannot be resumed, so
 * the retry re-bills input (a cache read when the previous attempt's
 * 5-minute-TTL cache entry is still warm; a re-write when not). Past this the
 * pass fails typed ("transport") carrying the billed usage of every attempt.
 */
export const PASS_TRANSPORT_MAX_ATTEMPTS = 6;

/**
 * Backoff before pass-level retry k (index k-1), by failure class.
 *
 * A request that failed BEFORE any token is the case the SDK used to handle:
 * short exponential backoff is right, since nothing was generated and the
 * request is cheap to re-issue. A failure AFTER generation started means
 * Anthropic shed load while already serving the request, so immediate re-entry
 * mostly dies again — and the retry re-bills the input, so it is worth waiting.
 *
 * Deterministic (no jitter) for testability; bull/bear retrying in lockstep can
 * at worst duplicate one 1.25x payload cache write (~$0.15), which is not worth
 * cross-pass coordination machinery.
 */
export const PASS_TRANSPORT_RETRY_DELAYS_MS: readonly number[] = [1_000, 2_000, 4_000, 8_000, 16_000];
export const PASS_MID_STREAM_RETRY_DELAYS_MS: readonly number[] = [15_000, 30_000];

/**
 * Error codes Node and undici (which Node 24 bundles) put on a connection
 * that died. undici's body timeout, the layer that CAN see the provider's SSE
 * pings, surfaces as `TypeError: terminated` with a `BodyTimeoutError` cause.
 */
const CONNECTION_FAILURE_CODES: ReadonlySet<string> = new Set([
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_ABORTED",
  "UND_ERR_RES_CONTENT_LENGTH_MISMATCH",
  "ECONNRESET",
  "ECONNREFUSED",
  "ECONNABORTED",
  "ETIMEDOUT",
  "EPIPE",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
]);

/** The error and every `cause` beneath it (bounded; a cycle cannot spin). */
function causeChain(err: unknown): unknown[] {
  const chain: unknown[] = [];
  let current: unknown = err;
  for (let depth = 0; depth < 8 && current !== undefined && current !== null; depth += 1) {
    if (chain.includes(current)) break;
    chain.push(current);
    current = (current as { cause?: unknown }).cause;
  }
  return chain;
}

/** The connection-failure code carried anywhere on the cause chain, if any. */
export function connectionFailureCode(err: unknown): string | null {
  for (const entry of causeChain(err)) {
    const code = (entry as { code?: unknown } | null)?.code;
    if (typeof code === "string" && CONNECTION_FAILURE_CODES.has(code)) return code;
  }
  return null;
}

/**
 * A fetch that failed before any request byte left the machine (connect phase).
 * The message deliberately avoids "timeout" / "timed out" and sets no `cause`:
 * the SDK tests String(err) + String(err.cause) for those words and would
 * otherwise wrap it as a cause-less APIConnectionTimeoutError, which the
 * settlement treats as a request that was sent and then lost.
 */
export class PreSendConnectionError extends Error {
  readonly name = "PreSendConnectionError";
  constructor(
    readonly connectCode: string,
    readonly original: unknown,
  ) {
    super("the connection to the provider could not be opened, so the request was never sent");
  }
}

/** Codes that mean the connection never opened, wherever they sit. */
const PRE_SEND_CODES: ReadonlySet<string> = new Set([
  "UND_ERR_CONNECT_TIMEOUT",
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
]);

/**
 * undici UND_ERR_CONNECT_TIMEOUT; ECONNREFUSED, ENOTFOUND, EAI_AGAIN;
 * ETIMEDOUT only with syscall "connect" or "getaddrinfo"; EHOSTUNREACH and
 * ENETUNREACH only with syscall "connect" (a route lost on an established
 * socket reads the same code with another syscall, after the send). Header,
 * body and socket failures happen after the send.
 */
export function isPreSendConnectionFailure(err: unknown): boolean {
  return preSendConnectCode(err) !== null;
}

function preSendConnectCode(err: unknown): string | null {
  for (const entry of causeChain(err)) {
    const { code, syscall } = (entry ?? {}) as { code?: unknown; syscall?: unknown };
    if (typeof code !== "string") continue;
    if (PRE_SEND_CODES.has(code)) return code;
    if (code === "ETIMEDOUT" && (syscall === "connect" || syscall === "getaddrinfo")) return code;
    if ((code === "EHOSTUNREACH" || code === "ENETUNREACH") && syscall === "connect") return code;
  }
  return null;
}

/** Rethrows a pre-send failure as PreSendConnectionError; reads globalThis.fetch at call time when inner is omitted. */
export function preSendClassifyingFetch(inner?: typeof fetch): typeof fetch {
  return (async (...args: Parameters<typeof fetch>) => {
    try {
      return await (inner ?? globalThis.fetch)(...args);
    } catch (err) {
      const code = preSendConnectCode(err);
      if (code !== null) throw new PreSendConnectionError(code, err);
      throw err;
    }
  }) as typeof fetch;
}

/**
 * A stream that died between the response headers and `message_stop`.
 *
 * The SDK produces `APIConnectionError` only for a fetch that fails BEFORE the
 * headers arrive. A body that dies mid-stream — undici's ~300s idle body
 * timeout, a socket reset, a clean close before `message_stop` — reaches the
 * stream's error handler as an ordinary Error and is re-wrapped as a BARE
 * `AnthropicError` (not an APIError) carrying the network error on `cause`
 * (`lib/BetaMessageStream.js` #handleError), or thrown by `finalMessage()`
 * with one of the SDK's own "stream ended without producing …" messages.
 * Until this was recognised, every such death was classified as a programming
 * error: the pass promise REJECTED, nothing was retried, and the usage the
 * stream had already billed was dropped — exactly the class of loss the
 * transport retries exist for. The SDK's programming-error messages ("Cannot
 * iterate over a consumed stream", "no body") are not matched.
 */
export function isStreamConnectionFailure(err: unknown): boolean {
  if (!(err instanceof AnthropicError) || err instanceof APIError) return false;
  if (connectionFailureCode(err) !== null) return true;
  // undici reports a dead body as `TypeError: terminated` / `fetch failed`.
  if (causeChain(err).some((entry) => entry instanceof TypeError)) return true;
  const message = err.message.toLowerCase();
  return (
    message.includes("stream ended without producing") ||
    message.includes("terminated") ||
    message.includes("fetch failed") ||
    message.includes("premature")
  );
}

/**
 * Whether a failed pass attempt is worth re-issuing from scratch.
 * - Connection failures before the headers (APIConnectionError) and a stream
 *   that died after them (undici's ~300s idle body timeout on a hung stream, a
 *   socket reset, a premature close — {@link isStreamConnectionFailure}) → yes.
 * - HTTP 408/409/429/5xx (the SDK's own retryable set, seen here only after
 *   CLIENT_MAX_RETRIES exhausted) → yes: by then minutes have passed, and the
 *   pass-level backoff operates on a longer timescale than the SDK's.
 * - Mid-stream SSE errors (APIError with NO status) → only transient types;
 *   `invalid_request_error` etc. would fail identically on every attempt.
 * - User aborts and non-SDK errors (programming bugs) → never.
 */
export function isRetryableTransportError(err: unknown): boolean {
  if (err instanceof APIUserAbortError) return false;
  if (err instanceof APIConnectionError) return true;
  if (isStreamConnectionFailure(err)) return true;
  if (err instanceof APIError) {
    const body = err.error as { error?: { details?: { error_code?: string } }; details?: { error_code?: string } } | undefined;
    if ((body?.error?.details ?? body?.details)?.error_code === "enforced_spend_limit_reached") return false;
    if (typeof err.status === "number") {
      return err.status === 408 || err.status === 409 || err.status === 429 || err.status >= 500;
    }
    const bodyType = (err.error as { error?: { type?: string } } | undefined)?.error?.type;
    const type = err.type ?? bodyType;
    return (
      type === "overloaded_error" ||
      type === "api_error" ||
      type === "timeout_error" ||
      type === "rate_limit_error"
    );
  }
  return false;
}

/** Retry-After is a minimum delay; keep the local backoff when it is longer. */
function transportRetryDelayMs(err: unknown, localDelay: number): number {
  if (!(err instanceof APIError)) return localDelay;
  const raw = err.headers?.get("retry-after")?.trim();
  if (!raw) return localDelay;
  const seconds = /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : null;
  const delay = seconds === null ? Date.parse(raw) - Date.now() : seconds * 1_000;
  return Number.isFinite(delay) && delay >= 0
    ? Math.max(localDelay, delay)
    : localDelay;
}

/** Sleep between pass-level transport retries — injectable so tests don't wait. */
let transportRetrySleep: (ms: number) => Promise<void> = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** TEST-ONLY. Replace (or with no argument restore) the transport-retry sleep. */
export function _setTransportRetrySleepForTests(fn?: (ms: number) => Promise<void>): void {
  transportRetrySleep = fn ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
}

async function transportRetrySleepWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  // Honor even long Retry-After values without overflowing a Node timer or
  // retrying before the provider allows it. Each chunk remains cancellable.
  if (ms > 2_147_483_647) {
    await transportRetrySleepWithSignal(2_147_483_647, signal);
    await transportRetrySleepWithSignal(ms - 2_147_483_647, signal);
    return;
  }
  if (signal === undefined) {
    await transportRetrySleep(ms);
    return;
  }
  signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const onAbort = (): void => {
      cleanup();
      reject(signal.reason ?? new DOMException("aborted", "AbortError"));
    };
    const cleanup = (): void => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
    transportRetrySleep(ms).then(
      () => {
        cleanup();
        resolve();
      },
      (err: unknown) => {
        cleanup();
        reject(err);
      },
    );
  });
}

/**
 * Singleton Anthropic client from ANTHROPIC_API_KEY.
 * Returns `null` when no key is configured — callers then produce a
 * FetchResult gap ("no Anthropic key") instead of throwing.
 */
export function getClient(): Anthropic | null {
  if (clientOverride) return clientSingleton ?? null;
  const key = getConfig().anthropicApiKey;
  if (clientSingleton === undefined || key !== clientApiKey) {
    clientApiKey = key;
    autoResolution = null;
    clientSingleton = key
      ? new Anthropic({
          apiKey: key,
          maxRetries: CLIENT_MAX_RETRIES,
          timeout: REQUEST_TIMEOUT_MS,
          fetch: preSendClassifyingFetch(),
        })
      : null;
  }
  return clientSingleton;
}

/**
 * TEST-ONLY. Overrides the client singleton and clears the model-resolution
 * cache. Call with no argument to reset (env re-read on next getClient()),
 * `null` to force keyless mode, or a (fake) client instance to inject.
 */
export function _resetAnthropicForTests(client?: Anthropic | null): void {
  clientSingleton = client;
  clientOverride = client !== undefined;
  clientApiKey = undefined;
  autoResolution = null;
}

/* ------------------------------------------------------------------------ *
 * Model resolution
 * ------------------------------------------------------------------------ */

export interface ResolvedModel {
  model: string;
  resolvedFrom: "auto" | "explicit";
}

let autoResolution: { model: string; resolvedAt: number } | null = null;

/**
 * Pure preference selection: first PREFERENCE_ORDER entry present in the
 * available id list (a dated snapshot the registry lists matches its entry).
 * Unknown models are rejected because the scheduler cannot prove a spend
 * bound for them.
 */
export function pickPreferredModel(availableIds: readonly string[]): string {
  for (const preferred of PREFERENCE_ORDER) {
    const match = availableIds.find((id) => pricedModelAlias(id) === preferred);
    if (match) return match;
  }
  if (availableIds.length === 0) {
    throw new Error("pickPreferredModel: models.list() returned no models");
  }
  throw new Error("pickPreferredModel: models.list() returned no supported priced model");
}

/**
 * Resolve a model setting.
 * - Explicit ids pass through untouched (no network, works keyless).
 * - "auto" queries `client.models.list()` and picks the first available model
 *   in PREFERENCE_ORDER; the resolution is cached for 1 hour.
 * - "auto" with no key resolves deterministically to PREFERENCE_ORDER[0]
 *   without network (harmless: every actual call gaps out in dry-run mode).
 */
export async function resolveModel(setting: string): Promise<ResolvedModel> {
  if (setting !== "auto") {
    assertPricedModel(setting);
    return { model: setting, resolvedFrom: "explicit" };
  }

  // Refresh the client before consulting a model list cached under the previous key.
  const client = getClient();
  const now = Date.now();
  if (autoResolution && now - autoResolution.resolvedAt < MODEL_RESOLUTION_TTL_MS) {
    return { model: autoResolution.model, resolvedFrom: "auto" };
  }

  if (!client) {
    return { model: defaultAutoModel(), resolvedFrom: "auto" };
  }

  const availableIds: string[] = [];
  // PagePromise auto-paginates when iterated.
  for await (const info of client.models.list()) {
    availableIds.push(info.id);
  }
  const model = pickPreferredModel(availableIds);
  autoResolution = { model, resolvedAt: now };
  return { model, resolvedFrom: "auto" };
}

/* ------------------------------------------------------------------------ *
 * Request construction
 * ------------------------------------------------------------------------ */

export interface RunPassOptions {
  /** Model id: an active registry id or a dated snapshot the registry lists. */
  model: string;
  system: string | BetaTextBlockParam[];
  messages: BetaMessageParam[];
  /** Keep IDENTICAL across passes — tool-set changes invalidate the cache. */
  tools?: BetaToolUnion[];
  /**
   * JSON schema for structured output (`output_config.format`, GA — no beta
   * header). Every object in the schema must set `additionalProperties: false`.
   */
  outputSchema?: Record<string, unknown>;
  maxTokens: number;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  /**
   * Manifest dot-path used in gap entries when the pass fails,
   * e.g. "llm.bull". Defaults to "llm.pass".
   */
  field?: string;
  /** Job-level cancellation/deadline signal. */
  signal?: AbortSignal;
  /**
   * Per-request cost admission. When present, every provider request this
   * pass makes is reserved before it is sent and settled with its own usage
   * (DECISIONS D-10).
   */
  admission?: RequestAdmission;
  /** Reservation pass identity; sizes the per-request maximum. */
  reservationPass?: ReservationPass;
  /** Verify-pass capability, when `reservationPass` is "verify". */
  verifyCapability?: VerifyReservationCapability;
}

/** The per-request maximum for these options, from the registry. */
export function requestReservationUsd(opts: RunPassOptions): number {
  const pass: ReservationPass = opts.reservationPass
    ?? (opts.field === "llm.judge" || opts.field === "llm.synthesize"
      ? "synthesize"
      : opts.field === "llm.bear"
        ? "bear"
        : "bull");
  return maximumRequestCostUsd(opts.model, pass, opts.verifyCapability);
}

/**
 * Output ceiling for one request: the registry max output for the model.
 * The pass constants (ANALYST_MAX_TOKENS, JUDGE_MAX_TOKENS in stageC) stay at
 * or below it and apply at effort low/medium; at high and above
 * buildPassParams raises max_tokens to this ceiling (DECISIONS D-05).
 */
function requestOutputTokenLimit(opts: RunPassOptions): number {
  return modelMaxOutputTokens(opts.model);
}

/**
 * The max_tokens actually sent: the registry ceiling when the model accepts
 * effort and the requested effort is high, xhigh or max; otherwise the
 * pass constant the caller supplied. Exported for the request-shaping tests
 * and the generated pricing table.
 */
export function effectiveMaxTokens(
  opts: Pick<RunPassOptions, "model" | "maxTokens" | "effort">,
): number {
  const entry = registryEntryFor(opts.model);
  const effortApplies = entry.effort.supported && isHighOrAboveEffort(opts.effort);
  return effortApplies ? entry.maxOutputTokens : opts.maxTokens;
}

/**
 * Offline, deterministic upper bound for request-input tokens. Anthropic's
 * tokenizer is not available locally; every text token represents at least one
 * UTF-8 byte, while serializing the complete input also counts JSON framing.
 * Therefore serialized UTF-8 bytes are a deliberately conservative token
 * ceiling. It includes cache-controlled blocks, tools, and output schemas.
 * Context-window admission uses estimatedRequestInputTokens instead.
 */
export function requestInputTokenUpperBound(opts: RunPassOptions): number {
  let serialized: string;
  try {
    serialized = JSON.stringify({
      system: opts.system,
      messages: opts.messages,
      tools: opts.tools,
      outputSchema: opts.outputSchema,
    });
  } catch (error) {
    throw new Error(`provider request input is not serializable: ${error instanceof Error ? error.message : String(error)}`);
  }
  return new TextEncoder().encode(serialized).byteLength;
}

/**
 * Bytes per token used for the context-fit estimate (DECISIONS D-121).
 * Calibrated on Metis's billed NVDA requests (2.38 bytes/token on the newer
 * tokenizer) and Anthropic's note that the newer tokenizer gives about 30%
 * more tokens (about 23% fewer on the earlier one); rounded down so the
 * estimate over-counts. The estimate is
 * calibrated on Metis payloads, not a ceiling: it leaves about 11% margin on
 * the prior tokenizer and about 5% on the current one. The backstop for a
 * prompt it misses is the provider's own context-window 400, which settles
 * at $0 (D-121).
 */
export const CONTEXT_ESTIMATE_BYTES_PER_TOKEN: Readonly<{ current: number; prior: number }> = {
  current: 2.25,
  prior: 2.75,
};

/**
 * "prior" for registry generations below 4.7, "current" otherwise. A
 * generation is "major" or "major.minor" with integer parts, so "4.10" is
 * after "4.7" (a decimal comparison would put it before).
 */
export function tokenizerForGeneration(generation: string): "prior" | "current" {
  const [major = "0", minor = "0"] = generation.split(".");
  const m = Number.parseInt(major, 10);
  const n = Number.parseInt(minor, 10);
  return m < 4 || (m === 4 && n < 7) ? "prior" : "current";
}

/**
 * The tokenizer generation of a registry model (Claude Haiku 4.5 is "prior").
 * An unknown model id throws here, but validateRunPassOptions has already
 * refused it (assertPricedModel runs first), so that throw is unreachable on
 * the request path.
 */
export function tokenizerGeneration(model: string): "prior" | "current" {
  return tokenizerForGeneration(registryEntryFor(model).generation);
}

/**
 * Offline input-token estimate: serialized UTF-8 bytes divided by the model's
 * tokenizer constant. Admission refuses only an estimate above the context
 * window; an over-long prompt it misses is refused by the provider with a 400
 * that settles at $0.
 */
export function estimatedRequestInputTokens(opts: RunPassOptions): number {
  return Math.ceil(
    requestInputTokenUpperBound(opts) / CONTEXT_ESTIMATE_BYTES_PER_TOKEN[tokenizerGeneration(opts.model)],
  );
}

function boundedWebSearchUses(tools: RunPassOptions["tools"]): number {
  let total = 0;
  let count = 0;
  for (const tool of tools ?? []) {
    if (tool === null || typeof tool !== "object") continue;
    const candidate = tool as unknown as Record<string, unknown>;
    const isWebSearch = candidate.name === "web_search" ||
      (typeof candidate.type === "string" && candidate.type.startsWith("web_search_"));
    if (!isWebSearch) continue;
    count += 1;
    const maxUses = candidate.max_uses;
    if (!Number.isSafeInteger(maxUses) || (maxUses as number) <= 0) {
      throw new Error("provider request web-search max_uses must be a positive integer");
    }
    total += maxUses as number;
  }
  if (count > 1 || total > MAX_PROVIDER_WEB_SEARCHES) {
    throw new Error(
      `provider request web-search exposure exceeds the ${MAX_PROVIDER_WEB_SEARCHES}-use cap`,
    );
  }
  return total;
}

/** Fail closed before any Anthropic request is launched. */
export function validateRunPassOptions(opts: RunPassOptions): void {
  assertPricedModel(opts.model);
  const outputLimit = requestOutputTokenLimit(opts);
  if (!Number.isSafeInteger(opts.maxTokens) || opts.maxTokens <= 0 || opts.maxTokens > outputLimit) {
    throw new Error(
      `provider request max_tokens must be a positive integer no greater than ${outputLimit.toLocaleString("en-US")}`,
    );
  }
  const inputLimit = modelContextTokenLimit(opts.model);
  const inputEstimate = estimatedRequestInputTokens(opts);
  if (inputEstimate > inputLimit) {
    const k = CONTEXT_ESTIMATE_BYTES_PER_TOKEN[tokenizerGeneration(opts.model)];
    throw new Error(
      `provider request input estimate ${inputEstimate.toLocaleString("en-US")} tokens (UTF-8 bytes / ${k} for this model's tokenizer) exceeds the ${inputLimit.toLocaleString("en-US")}-token model context window`,
    );
  }
  const searchUses = boundedWebSearchUses(opts.tools);
  if ((opts.field === "llm.judge" || opts.field === "llm.synthesize") && searchUses > 0) {
    throw new Error("provider judge request cannot enable web search");
  }
}

/**
 * Thinking config from the `thinking` block of the registry entry:
 * - mode "always-on" (Fable family, Opus 5.5): OMIT the param to use the default.
 *   Fable 5.1 and Opus 5.5 accept adaptive explicitly but reject disabled/manual.
 * - mode "adaptive" with sendParam (Opus 4.8, Opus 5): `{type: "adaptive"}`.
 *   Opus 4.8 would run WITHOUT thinking if the param were omitted; Opus 5
 *   already runs adaptive by default, so the explicit param states intent.
 * - mode "adaptive" without sendParam (Sonnet 5/5.5) and mode "none" (Haiku 4.5):
 *   omit.
 *
 * Disabled/manual thinking is never produced. Effort is explicitly configured
 * by the run; Opus 5.5's provider default of medium does not override that setting.
 */
export function thinkingConfigFor(model: string): BetaThinkingConfigParam | undefined {
  const entry = registryEntryFor(model);
  return entry.thinking.mode === "adaptive" && entry.thinking.sendParam
    ? { type: "adaptive" }
    : undefined;
}

/**
 * Whether a model accepts `output_config.effort` (registry `effort.supported`).
 * Haiku 4.5 rejects it with 400 "This model does not support the effort
 * parameter" — sending it fails the whole pass, so buildPassParams drops
 * effort there instead.
 */
export function supportsEffort(model: string): boolean {
  return modelSupportsEffort(model);
}

export interface BuiltPassRequest {
  params: MessageCreateParamsNonStreaming;
  /** True when the request opts into the fable-5 server-side fallback beta. */
  usesFallbackBeta: boolean;
}

/**
 * Pure request builder (exported for tests). Applies the registry rules for
 * the model: an entry with `serverSideFallback` (the Fable family) carries
 * `betas: [beta]` + `fallbacks: [{model}]`; effort is sent only when the entry
 * supports it; thinking follows {@link thinkingConfigFor}; max_tokens follows
 * {@link effectiveMaxTokens}; sampling params are never sent.
 */
export function buildPassParams(opts: RunPassOptions): BuiltPassRequest {
  validateRunPassOptions(opts);
  const fallback = registryEntryFor(opts.model).serverSideFallback;

  const params: MessageCreateParamsNonStreaming = {
    model: opts.model,
    max_tokens: effectiveMaxTokens(opts),
    system: opts.system,
    messages: opts.messages,
  };
  if (opts.tools) params.tools = opts.tools;

  const thinking = thinkingConfigFor(opts.model);
  if (thinking) params.thinking = thinking;

  const effort = supportsEffort(opts.model) ? opts.effort : undefined;
  if (effort !== undefined || opts.outputSchema !== undefined) {
    params.output_config = {
      ...(effort !== undefined ? { effort } : {}),
      ...(opts.outputSchema !== undefined
        ? { format: { type: "json_schema" as const, schema: opts.outputSchema } }
        : {}),
    };
  }

  if (fallback !== null) {
    params.betas = [fallback.beta];
    params.fallbacks = [{ model: fallback.model }];
  }

  return { params, usesFallbackBeta: fallback !== null };
}

/**
 * Web search server tool (identical shape on every pass — cache discipline).
 * The variant comes from the target model's registry entry: haiku gets the
 * basic `web_search_20250305`, everything else the dynamic-filtering
 * `web_search_20260318`. `model` is required — a tool variant chosen without
 * a model would be a second, silent policy default beside the registry's.
 */
export function webSearchTool(
  maxUses: number,
  model: string,
): BetaWebSearchTool20260318 | BetaWebSearchTool20250305 {
  if (!Number.isSafeInteger(maxUses) || maxUses <= 0 || maxUses > MAX_PROVIDER_WEB_SEARCHES) {
    throw new Error(
      `web-search max_uses must be a positive integer no greater than ${MAX_PROVIDER_WEB_SEARCHES}`,
    );
  }
  const toolType = registryEntryFor(model).webSearchToolType;
  if (toolType === WEB_SEARCH_TOOL_TYPE_BASIC) {
    return { type: WEB_SEARCH_TOOL_TYPE_BASIC, name: "web_search", max_uses: maxUses };
  }
  if (toolType !== WEB_SEARCH_TOOL_TYPE) {
    throw new Error(`model registry: unsupported web-search tool type "${toolType}" for ${model}`);
  }
  return {
    type: WEB_SEARCH_TOOL_TYPE,
    name: "web_search",
    max_uses: maxUses,
    response_inclusion: "full",
  };
}

/* ------------------------------------------------------------------------ *
 * Response interpretation
 * ------------------------------------------------------------------------ */

/**
 * Detect whether a server-side fallback model served (part of) the response:
 * a `fallback` content block marks a switch point, and a `fallback_message`
 * entry in `usage.iterations` is the served-by signal (sticky-served turns
 * carry no block, so both signals are checked).
 */
export function detectFallbackUsed(message: {
  content?: ReadonlyArray<{ type: string }>;
  usage?: { iterations?: ReadonlyArray<{ type: string }> | null } | null;
}): boolean {
  const blockHit = (message.content ?? []).some((block) => block.type === "fallback");
  const iterationHit = (message.usage?.iterations ?? []).some(
    (entry) => entry.type === "fallback_message",
  );
  return blockHit || iterationHit;
}

function webSearchCount(message: BetaMessage): number {
  return message.usage.server_tool_use?.web_search_requests ?? 0;
}

function webFetchCount(message: BetaMessage): number {
  return message.usage.server_tool_use?.web_fetch_requests ?? 0;
}

/**
 * Extract exact successful web-search result URLs from a completed message.
 * Model-authored text and citation-shaped strings are intentionally ignored.
 */
export function collectFetchedUrls(message: BetaMessage): string[] {
  const urls = new Set<string>();
  for (const block of message.content) {
    if (block.type !== "web_search_tool_result" || !Array.isArray(block.content)) continue;
    for (const result of block.content) {
      if (result.type !== "web_search_result") continue;
      const canonical = canonicalizeFetchedUrl(result.url);
      if (canonical) urls.add(canonical);
    }
  }
  return [...urls].sort();
}

/** One hop of a multi-model response, as `usage.iterations` reports it. */
interface PricedIteration {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

function pricedIteration(entry: unknown): PricedIteration | null {
  if (typeof entry !== "object" || entry === null) return null;
  const e = entry as Record<string, unknown>;
  if (typeof e.model !== "string" || !findPricing(e.model)) return null;
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null);
  const input = num(e.input_tokens);
  const output = num(e.output_tokens);
  const cacheWrite = e.cache_creation_input_tokens == null ? 0 : num(e.cache_creation_input_tokens);
  const cacheRead = e.cache_read_input_tokens == null ? 0 : num(e.cache_read_input_tokens);
  if (input === null || output === null || cacheWrite === null || cacheRead === null) return null;
  return {
    model: e.model,
    input_tokens: input,
    output_tokens: output,
    cache_creation_input_tokens: cacheWrite,
    cache_read_input_tokens: cacheRead,
  };
}

type RefusalCategory = "cyber" | "general_harms" | "bio" | "frontier_llm" | "reasoning_extraction" | null;

function refusalCategory(details: unknown): RefusalCategory | undefined {
  if (typeof details !== "object" || details === null) return undefined;
  const category = (details as { category?: unknown }).category;
  return category === null || category === "cyber" || category === "general_harms" ||
    category === "bio" || category === "frontier_llm" || category === "reasoning_extraction"
    ? category : undefined;
}

/** Top-level usage is the final attempt only, not the sum of iterations. */
function messageIterations(message: BetaMessage): PricedIteration[] | null {
  // Ordinary server-tool loops also expose iterations. Their existing
  // top-level totals remain authoritative; this normalization is for fallback.
  if (!detectFallbackUsed(message)) return null;
  const entries = message.usage.iterations ?? [];
  if (entries.length === 0) return null;
  const hops: PricedIteration[] = [];
  for (const entry of entries) {
    if (entry.type !== "message" && entry.type !== "fallback_message") return null;
    const hop = pricedIteration(entry);
    if (hop === null) return null;
    hops.push(hop);
  }
  const final = hops[hops.length - 1];
  const u = message.usage;
  return final.input_tokens === u.input_tokens && final.output_tokens === u.output_tokens &&
    final.cache_creation_input_tokens === (u.cache_creation_input_tokens ?? 0) &&
    final.cache_read_input_tokens === (u.cache_read_input_tokens ?? 0) ? hops : null;
}

function actualModel(message: BetaMessage): string {
  if (!detectFallbackUsed(message)) return message.model;
  const entries = message.usage.iterations ?? [];
  const final = entries[entries.length - 1];
  if (final && (final.type === "message" || final.type === "fallback_message") && final.model) return final.model;
  const switches = message.content.filter((block) => block.type === "fallback");
  return switches[switches.length - 1]?.to?.model || message.model;
}

function withActualModel(message: BetaMessage): BetaMessage {
  const model = actualModel(message);
  return model === message.model ? message : { ...message, model };
}

/** Refusals before output are free only with an explicitly documented category. */
function refusalBilling(outputTokens: number, declined: boolean, details: unknown): { free: boolean; presumed: boolean } {
  if (!declined || outputTokens > 0) return { free: false, presumed: false };
  const category = refusalCategory(details);
  return {
    free: category === null || category === "cyber" || category === "general_harms",
    presumed: category === undefined,
  };
}

function billingForMessage(message: BetaMessage, opts: RunPassOptions): { costUsd: number; presumed: boolean } {
  const hops = messageIterations(message);
  const switches = message.content.filter((block) => block.type === "fallback");
  const toolsUsd = webSearchCount(message) * WEB_SEARCH_USD_PER_SEARCH;
  if (hops !== null) {
    let presumed = false;
    let nextBoundary = 0;
    const costUsd = hops.reduce((total, hop, index) => {
      const final = index === hops.length - 1;
      const transition = !final && hop.model !== hops[index + 1].model;
      // Server-tool sampling can add same-model iterations before a fallback.
      // Content has one boundary per model transition, not one per iteration.
      const boundaryIndex = transition ? switches.findIndex((boundary, i) =>
        i >= nextBoundary && boundary.from.model === hop.model && boundary.to.model === hops[index + 1].model,
      ) : -1;
      if (boundaryIndex >= 0) nextBoundary = boundaryIndex + 1;
      const details = final ? message.stop_details : switches[boundaryIndex]?.trigger;
      const billing = refusalBilling(hop.output_tokens, transition || (final && message.stop_reason === "refusal"), details);
      presumed ||= billing.presumed;
      return total + (billing.free ? 0 : computeCostUsd(hop, hop.model));
    }, toolsUsd);
    return { costUsd, presumed };
  }
  const model = actualModel(message);
  const knownModel = findPricing(model) !== undefined;
  const billing = refusalBilling(message.usage.output_tokens, message.stop_reason === "refusal", message.stop_details);
  const observed = (billing.free ? 0 : computeCostUsd(message.usage, knownModel ? model : opts.model)) + toolsUsd;
  const incomplete = detectFallbackUsed(message) || !knownModel;
  // Missing hops cannot be reconstructed. Retain the reserved upper bound,
  // visibly presumed, rather than presenting the final hop as the entire bill.
  return {
    costUsd: incomplete ? Math.max(observed, requestReservationUsd(opts)) : observed,
    presumed: incomplete || billing.presumed,
  };
}

function costForMessage(message: BetaMessage, opts: RunPassOptions): number {
  return billingForMessage(message, opts).costUsd;
}

function messageUsage(message: BetaMessage): BetaUsage {
  const hops = messageIterations(message);
  if (hops === null) return message.usage;
  return {
    ...message.usage,
    input_tokens: hops.reduce((sum, hop) => sum + hop.input_tokens, 0),
    output_tokens: hops.reduce((sum, hop) => sum + hop.output_tokens, 0),
    cache_creation_input_tokens: hops.reduce((sum, hop) => sum + hop.cache_creation_input_tokens, 0),
    cache_read_input_tokens: hops.reduce((sum, hop) => sum + hop.cache_read_input_tokens, 0),
  };
}

function aggregateUsage(messages: readonly BetaMessage[]): BetaUsage {
  const finalUsage = messages[messages.length - 1]?.usage;
  if (!finalUsage) {
    throw new Error("aggregateUsage: at least one message is required");
  }
  if (messages.length === 1) return messageUsage(messages[0]);

  const usages = messages.map(messageUsage);
  const inputTokens = usages.reduce((sum, usage) => sum + usage.input_tokens, 0);
  const outputTokens = usages.reduce((sum, usage) => sum + usage.output_tokens, 0);
  const cacheCreationTokens = usages.reduce(
    (sum, usage) => sum + (usage.cache_creation_input_tokens ?? 0),
    0,
  );
  const cacheReadTokens = usages.reduce(
    (sum, usage) => sum + (usage.cache_read_input_tokens ?? 0),
    0,
  );
  const webSearches = messages.reduce((sum, message) => sum + webSearchCount(message), 0);
  const webFetches = messages.reduce((sum, message) => sum + webFetchCount(message), 0);
  const iterations = messages.flatMap((message) => Array.from(message.usage.iterations ?? []));

  return {
    ...finalUsage,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_creation_input_tokens: cacheCreationTokens,
    cache_read_input_tokens: cacheReadTokens,
    iterations: iterations.length > 0 ? iterations : finalUsage.iterations,
    server_tool_use:
      finalUsage.server_tool_use || webSearches > 0 || webFetches > 0
        ? ({
            ...(finalUsage.server_tool_use ?? {}),
            web_search_requests: webSearches,
            web_fetch_requests: webFetches,
          } as NonNullable<BetaUsage["server_tool_use"]>)
        : finalUsage.server_tool_use,
  } as BetaUsage;
}

/**
 * Provider-produced kinds: no_key | refusal | max_tokens | context_window |
 * paused | transport. Stage C (src/pipeline/stageC/passes.ts) fabricates two
 * more so run forensics can tell a genuine safety refusal from a model that
 * produced malformed output (the 2026-07 audit found "refusal" covering both):
 *   parse     — output was not valid JSON
 *   schema    — JSON parsed but failed Zod validation
 *
 * "transport" is produced HERE (2026-07-10 incident fix) when a request/stream
 * fails after {@link PASS_TRANSPORT_MAX_ATTEMPTS}, carrying the billed usage
 * of every attempt so cost_log records real spend; Stage C's hardFailure
 * fabricates the same kind only as a safety net for unexpected rejections.
 */
export type PassErrorKind =
  | "no_key"
  | "refusal"
  | "max_tokens"
  | "context_window"
  | "paused"
  | "parse"
  | "schema"
  | "transport";

/**
 * Bound on automatic `stop_reason: "pause_turn"` resumption. Long search turns
 * can pause and resume when the assistant message is re-sent unchanged. Without
 * this bound,
 * interpretPassMessage previously fell through to its unconditional SUCCESS
 * branch on any unrecognized stop_reason — a paused message (whose content is
 * mid-search tool-result blocks, no final text) then failed JSON.parse and the
 * whole pass was discarded, burning its full sunk cost (cache write + searches
 * + output) for nothing. See resumeIfPaused.
 */
export const MAX_PAUSE_RESUMPTIONS = 5;

/**
 * SDK executions × transport executions × pause executions. With
 * CLIENT_MAX_RETRIES at 0 (D-10 owns the retry loop) this is 1 × 6 × 6 = 36.
 */
export const PASS_BILLING_EXPOSURE_MULTIPLIER =
  (CLIENT_MAX_RETRIES + 1) * PASS_TRANSPORT_MAX_ATTEMPTS * (MAX_PAUSE_RESUMPTIONS + 1);

/**
 * Most provider requests one pass can make: every transport attempt, each of
 * which can pause and resume up to the resumption bound. In request-reservation
 * mode this is REPORTED as the pass worst case but never reserved — each
 * request is admitted and settled on its own (DECISIONS D-10).
 */
export const PASS_MAX_REQUESTS = PASS_TRANSPORT_MAX_ATTEMPTS * (MAX_PAUSE_RESUMPTIONS + 1);

/**
 * Maximum a SINGLE provider request can bill, at standard prices:
 *
 *   input_cap x input_price x cache_mult x input_iterations
 * + output_cap x output_price
 * + search_cap x $0.01
 *
 * `cache_mult` is the dearest way an input token can bill for this request:
 * the 1-hour cache-write price when a 1-hour TTL could be requested, the
 * 5-minute price when only 5-minute blocks are sent (what Metis sends), and
 * the plain input price when caching is off. Prices come from the registry, so
 * a model's own cache economics are used rather than one global ratio. Search
 * requests reserve up to 10 sampling iterations of input per model attempt;
 * the output cap and web-search limit apply to the request as a whole.
 */
export function maximumRequestCostUsd(
  model: string,
  pass: ReservationPass,
  verifyCapability?: VerifyReservationCapability,
): number {
  if (pass === "verify") {
    if (verifyCapability?.billable === false) return 0;
    if (verifyCapability?.billable !== true) {
      throw new Error("maximum request cost: verify requires explicit billable capability metadata");
    }
  }
  const requested = registryEntryFor(model);
  const effectiveModel =
    pass === "synthesize" && requested.family === "haiku" ? judgeFloorModelId() : model;
  const effective = registryEntryFor(effectiveModel);
  const pricing = effective.pricing;

  const inputTokens = pass === "verify"
    ? boundedInteger(
        (verifyCapability as Extract<VerifyReservationCapability, { billable: true }>).maxInputTokens,
        "verify input",
        effective.contextWindowTokens,
      )
    : effective.contextWindowTokens;
  const outputTokens = pass === "verify"
    ? boundedInteger(
        (verifyCapability as Extract<VerifyReservationCapability, { billable: true }>).maxOutputTokens,
        "verify output",
        effective.maxOutputTokens,
      )
    : effective.maxOutputTokens;
  const searches = pass === "verify"
    ? boundedInteger(
        (verifyCapability as Extract<VerifyReservationCapability, { billable: true }>).maxWebSearches,
        "verify web-search",
        MAX_PROVIDER_WEB_SEARCHES,
      )
    : pass === "synthesize"
      ? 0
      : MAX_PROVIDER_WEB_SEARCHES;

  // One explicit server fallback can bill its own input/output attempt. The
  // request's server-tool counter is shared, so reserve its search cap once.
  const inputIterations = searches > 0 ? MAX_SERVER_TOOL_SAMPLING_ITERATIONS : 1;
  const fallback = effective.serverSideFallback === null ? null : registryEntryFor(effective.serverSideFallback.model);
  const fallbackQuarterMicroUsd = fallback === null ? 0 : (
    (pass === "verify" ? inputTokens : fallback.contextWindowTokens) * fallback.pricing.cacheWrite5mPerMTok * inputIterations * 4 +
    (pass === "verify" ? outputTokens : fallback.maxOutputTokens) * fallback.pricing.outputPerMTok * 4
  );
  // Quarter-micro-USD, as in maximumPassCostUsd: every registry cache-write
  // price is a quarter-dollar multiple, so the arithmetic stays exact.
  const quarterMicroUsd = Math.round(
    inputTokens * pricing.cacheWrite5mPerMTok * inputIterations * 4 +
    outputTokens * pricing.outputPerMTok * 4 +
    searches * 40_000 + fallbackQuarterMicroUsd,
  );
  return Math.ceil(quarterMicroUsd / 4) / 1_000_000;
}

/**
 * Worst case for a whole pass: every request it could make, at the per-request
 * maximum. Reported in the pricing table so the exposure stays visible after it
 * stops being reserved.
 *
 * `judgeRequestsPerPass` doubles the JUDGE figure under
 * `THESIS_JUDGE_ORDER=both`, which issues a mirrored second request per attempt
 * (D-20). Without it the published judge worst case understated the real one by
 * two times for anyone running that setting.
 */
export function passWorstCaseCostUsd(
  model: string,
  pass: ReservationPass,
  verifyCapability?: VerifyReservationCapability,
  judgeRequestsPerPass: JudgeRequestsPerPass = 1,
): number {
  const perRequest = maximumRequestCostUsd(model, pass, verifyCapability);
  return (
    Math.ceil(
      perRequest *
        1_000_000 *
        PASS_MAX_REQUESTS *
        judgeRequestMultiplier(pass, judgeRequestsPerPass),
    ) / 1_000_000
  );
}

/**
 * One admitted provider request. The scheduler issues these; the provider only
 * carries the token back to `settle`.
 */
export interface RequestPermit {
  readonly id: string;
  readonly maximumUsd: number;
}

/** Usage a single request actually billed. */
export interface RequestSettlement {
  usage?: UsageLike;
  costUsd: number;
  model: string;
  webSearches: number;
  fallbackUsed: boolean;
  /**
   * True when billing cannot be verified from the response: for example a
   * timeout, missing fallback usage, or an unknown pre-output refusal category.
   */
  presumed?: boolean;
}

/**
 * Per-request cost admission (DECISIONS D-10). The runner supplies this so
 * every provider request — first attempt, retry, or pause resumption — is
 * reserved against the durable spend caps before it is sent and settled with
 * its own usage afterwards. Omitted (tests, and the "pass" reservation mode)
 * the provider behaves exactly as before.
 */
export interface RequestAdmission {
  reserve(request: {
    attempt: number;
    kind: "stream" | "resume";
    maximumUsd: number;
  }): Promise<RequestPermit>;
  settle(permit: RequestPermit, settlement: RequestSettlement): Promise<void>;
  /** A request that never reached the provider: release without billing. */
  release(permit: RequestPermit): Promise<void>;
  /**
   * The request's settlement could not be recorded after every retry and its
   * permit stays held (the response was received and paid for). The admission
   * stops renewing that lease so it expires into the sweep's presumed row,
   * rather than counting against the cap and the capacity slot for as long
   * as the pass runs. Optional: a settlement that cannot be recorded has
   * nothing to abandon where nothing is renewed.
   */
  abandon?(permit: RequestPermit): void;
}

export interface PassError {
  kind: PassErrorKind;
  message: string;
  /** kind "refusal": policy category from stop_details (may be null). */
  refusalCategory?: RefusalCategory;
  /**
   * kind "max_tokens"/"context_window": the `max_tokens` the request actually
   * SENT ({@link effectiveMaxTokens}) — at effort `high` and above that is the
   * model's registry ceiling, not the pass constant.
   */
  maxTokens?: number;
  /** Usage/cost of the failed attempt(s) (mid-stream failures bill partial output). */
  usage?: BetaUsage;
  costUsd?: number;
  presumed?: boolean;
  fallbackUsed?: boolean;
  /** Original request settings, retained even when a fallback served the pass. */
  execution?: ProviderExecution;
  /** Model that served the billed attempt(s), when known (kind "transport"). */
  model?: string;
  /** Web searches billed across failed attempt(s) ($0.01 each, kind "transport"). */
  webSearches?: number;
  /**
   * kind "transport": the CALLER aborted the request (its signal fired); the
   * provider did not fail it. An orchestrator that stops a pass on purpose
   * uses this to tell its own abort from a provider fault that landed at the
   * same moment.
   */
  aborted?: true;
}

export interface PassOutcome {
  message: BetaMessage;
  /** Canonical URLs observed in successful web-search result blocks. */
  fetchedUrls: string[];
  usage: BetaUsage;
  costUsd: number;
  /** Billing evidence was incomplete; the cost includes a conservative estimate. */
  presumed?: boolean;
  /** True when the fable-5 server-side fallback chain served the response. */
  fallbackUsed: boolean;
  /** Model that actually produced the response (fallback model when one served it). */
  model: string;
  /** Original request settings, retained even when a fallback served the pass. */
  execution?: ProviderExecution;
}

/**
 * Structural superset of FetchResult<PassOutcome>: the failure branch also
 * carries the typed PassError so the pipeline can branch on refusal vs
 * max_tokens vs dry-run while still filing the ManifestEntry.
 */
export type RunPassResult =
  | { ok: true; value: Sourced<PassOutcome> }
  | { ok: false; gap: ManifestEntry; error: PassError };

// Compile-time check: RunPassResult must remain assignable to FetchResult.
const _assertFetchResultCompat = (r: RunPassResult): FetchResult<PassOutcome> => r;
void _assertFetchResultCompat;

function gapEntry(opts: RunPassOptions, reason: string): ManifestEntry {
  return {
    field: opts.field ?? "llm.pass",
    reason,
    severity: "critical",
    attemptedSources: ["anthropic"],
  };
}

/** Effort records what request construction sends, not a new model default. */
function passExecution(opts: RunPassOptions, dispatched = true): ProviderExecution {
  return {
    requestedModel: opts.model,
    requestedEffort: opts.effort ?? null,
    effectiveEffort: dispatched && supportsEffort(opts.model) ? opts.effort ?? null : null,
  };
}

function noKeyResult(opts: RunPassOptions): RunPassResult {
  return {
    ok: false,
    gap: gapEntry(opts, "no Anthropic key"),
    error: {
      kind: "no_key",
      message: "ANTHROPIC_API_KEY is not set — Anthropic calls are disabled (pipeline dry-run)",
      execution: passExecution(opts, false),
    },
  };
}

function interpretPassMessages(
  message: BetaMessage,
  opts: RunPassOptions,
  billableMessages: readonly BetaMessage[],
  failed: readonly FailedRequestCharge[] = [],
): RunPassResult {
  message = withActualModel(message);
  const passTotals = passAccounting(opts, billableMessages, failed);
  const { fallbackUsed, costUsd } = passTotals;
  // billableMessages is never empty here, so the aggregate usage exists.
  const usage = passTotals.usage as BetaUsage;
  const accounting = {
    model: message.model,
    execution: passExecution(opts),
    ...(passTotals.presumed ? { presumed: true } : {}),
  };
  const fetchedUrls = [
    ...new Set(billableMessages.flatMap((billedMessage) => collectFetchedUrls(billedMessage))),
  ].sort();

  if (message.stop_reason === "refusal") {
    const category = refusalCategory(message.stop_details);
    return {
      ok: false,
      gap: gapEntry(
        opts,
        `Anthropic declined the request (stop_reason "refusal"${category ? `, category "${category}"` : ""})${fallbackUsed ? " — fallback chain also declined" : ""}`,
      ),
      error: {
        kind: "refusal",
        message:
          message.stop_details?.explanation ??
          "Request declined by safety classifiers (stop_reason refusal). Discard any partial output.",
        refusalCategory: category,
        usage,
        costUsd,
        fallbackUsed,
        ...accounting,
      },
    };
  }

  // Both truncation gaps name the limit that was actually SENT: at effort
  // `high` and above buildPassParams raises max_tokens to the model's registry
  // ceiling, and a gap that quoted the pass constant told the reader to "retry
  // with a higher limit" when no higher limit existed for that model.
  const sentMaxTokens = effectiveMaxTokens(opts);
  if (message.stop_reason === "max_tokens") {
    const atCeiling = sentMaxTokens >= modelMaxOutputTokens(opts.model);
    return {
      ok: false,
      gap: gapEntry(
        opts,
        `Pass truncated at max_tokens=${sentMaxTokens} — output incomplete; ` +
          (atCeiling
            ? "that is the model's registry ceiling, so a retry needs a shorter prompt or a different model"
            : "retry at a higher effort, which raises max_tokens to the model's registry ceiling"),
      ),
      error: {
        kind: "max_tokens",
        message: atCeiling
          ? `Response hit max_tokens=${sentMaxTokens}, the model's registry ceiling, before completing.`
          : `Response hit max_tokens=${sentMaxTokens} before completing. Retry at a higher effort, which raises max_tokens to the model's registry ceiling.`,
        maxTokens: sentMaxTokens,
        usage,
        costUsd,
        fallbackUsed,
        ...accounting,
      },
    };
  }

  if (message.stop_reason === "model_context_window_exceeded") {
    return {
      ok: false,
      gap: gapEntry(
        opts,
        `Pass stopped at model context window (stop_reason "model_context_window_exceeded") with max_tokens=${sentMaxTokens} - reduce input payload or maxTokens`,
      ),
      error: {
        kind: "context_window",
        message: `Response stopped because input plus max_tokens exceeded the model context window. Reduce the prompt size or maxTokens=${sentMaxTokens}; partial output discarded.`,
        maxTokens: sentMaxTokens,
        usage,
        costUsd,
        fallbackUsed,
        ...accounting,
      },
    };
  }

  // Reachable only when resumeIfPaused (runPass/runPassStreaming) exhausted
  // MAX_PAUSE_RESUMPTIONS and the turn is STILL paused — an unusually long
  // chain of search iterations. A single pause_turn along the way is invisible
  // here: the caller already resumed it before this function ever saw the
  // message. Filed as a typed, honest error rather than silently succeeding
  // into a downstream "not valid JSON" failure (there is no final text yet).
  if (message.stop_reason === "pause_turn") {
    return {
      ok: false,
      gap: gapEntry(
        opts,
        `Pass still paused (stop_reason "pause_turn") after ${MAX_PAUSE_RESUMPTIONS} resumption attempt(s) — an unusually long search turn`,
      ),
      error: {
        kind: "paused",
        message: `Turn paused repeatedly and exceeded the resumption budget (${MAX_PAUSE_RESUMPTIONS}). Partial output discarded.`,
        usage,
        costUsd,
        fallbackUsed,
        ...accounting,
      },
    };
  }

  const now = new Date().toISOString();
  return {
    ok: true,
    value: {
      data: {
        message,
        fetchedUrls,
        usage,
        costUsd,
        fallbackUsed,
        ...accounting,
      },
      asOf: now,
      source: "anthropic",
      endpoint: "/v1/messages",
      fetchedAt: now,
    },
  };
}

/**
 * Interpret a completed BetaMessage into a RunPassResult (exported for tests
 * against synthetic response shapes). Handles stop_reason "refusal" and
 * "max_tokens" as typed errors; everything else is a success.
 */
export function interpretPassMessage(message: BetaMessage, opts: RunPassOptions): RunPassResult {
  return interpretPassMessages(message, opts, [message]);
}

/* ------------------------------------------------------------------------ *
 * Passes
 * ------------------------------------------------------------------------ */

interface ResumedMessage {
  final: BetaMessage;
  billableMessages: BetaMessage[];
}

/**
 * A pause-resumption request failed AFTER earlier messages of the same pass
 * attempt were fully received (and billed). Carries those messages so the
 * caller's transport accounting doesn't lose their real spend, plus the
 * resumption's own charge (what it was settled at, against its own permit,
 * before this was thrown; null when the resumption was released at $0).
 */
class ResumptionFailedError extends Error {
  constructor(
    readonly cause: unknown,
    readonly billableMessages: BetaMessage[],
    readonly charge: FailedRequestCharge | null = null,
  ) {
    super(errorMessageOf(cause));
    this.name = "ResumptionFailedError";
  }
}

/** A refused resumption has no new request to settle, but keeps earlier usage. */
class ResumptionAdmissionError extends Error {
  constructor(readonly cause: unknown, readonly billableMessages: BetaMessage[]) {
    super(errorMessageOf(cause));
    this.name = "ResumptionAdmissionError";
  }
}

function errorMessageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** The ledger write for a settled request did not commit and may be retried. */
export class RequestSettlementNotRecordedError extends Error {
  readonly name = "RequestSettlementNotRecordedError";
  constructor(readonly cause: unknown) {
    super(`request settlement was not recorded: ${errorMessageOf(cause)}`);
  }
}

/**
 * Waits before each retry of a contended ledger write (5.25 seconds in all, on
 * top of the database's own busy timeout on every try).
 */
export const LEDGER_SETTLE_RETRY_DELAYS_MS: readonly number[] = [250, 1_000, 4_000];

/**
 * Settle, retrying only {@link RequestSettlementNotRecordedError}; true when
 * the write committed. When every retry fails the permit is left held: the
 * response was received and paid for, so the caller keeps it and the lease is
 * presumed at expiry (D-07), and only the costs:reconcile script can lower
 * that row. The admission is told to stop renewing the lease
 * ({@link RequestAdmission.abandon}). Any other error propagates.
 */
async function settleWithLedgerRetry(
  admission: RequestAdmission,
  permit: RequestPermit,
  settlement: RequestSettlement,
  field: string,
): Promise<boolean> {
  for (let retry = 0; ; retry++) {
    try {
      await admission.settle(permit, settlement);
      return true;
    } catch (error) {
      if (!(error instanceof RequestSettlementNotRecordedError)) throw error;
      if (retry >= LEDGER_SETTLE_RETRY_DELAYS_MS.length) {
        console.error(
          `[anthropic] ${field}: request settlement could not be recorded (${errorMessageOf(error.cause)}); ` +
            "keeping the response and leaving the reservation to be presumed at expiry",
        );
        // Stop renewing the held lease: it must expire into the presumed row
        // (cap honoured, capacity slot freed), not outlive the pass's next
        // request.
        admission.abandon?.(permit);
        return false;
      }
      await transportRetrySleep(LEDGER_SETTLE_RETRY_DELAYS_MS[retry]!);
    }
  }
}

/** Settle one admitted request whose final message arrived, at what it billed. */
async function settleRequest(
  admission: RequestAdmission | undefined,
  permit: RequestPermit | null,
  opts: RunPassOptions,
  billed: BetaMessage,
): Promise<void> {
  if (admission === undefined || permit === null) return;
  const billing = billingForMessage(billed, opts);
  await settleWithLedgerRetry(admission, permit, {
    usage: messageUsage(billed),
    costUsd: billing.costUsd,
    model: actualModel(billed) || opts.model,
    webSearches: webSearchCount(billed),
    fallbackUsed: detectFallbackUsed(billed),
    ...(billing.presumed ? { presumed: true } : {}),
  }, opts.field ?? "llm.pass");
}

/**
 * Did this request reach the provider and then stop answering, or lose its
 * connection while the provider was answering? Either way generation may have
 * happened (and billed) with nobody listening, so an unanswered request of
 * this kind is presumed rather than released.
 */
function timedOutAfterSend(err: unknown): boolean {
  if (causeChain(err).some((entry) => entry instanceof PreSendConnectionError)) return false;
  if (err instanceof StreamIdleTimeoutError) return true;
  if (err instanceof APIConnectionTimeoutError) return true;
  if (isStreamConnectionFailure(err)) return true;
  const message = errorMessageOf(err).toLowerCase();
  return message.includes("timeout") || message.includes("timed out");
}

/** What one failed provider request is recorded at (DECISIONS D-09, D-10). */
interface FailedRequestCharge {
  /** The streamed snapshot as a message when the request reported usage; else null. */
  reported: BetaMessage | null;
  costUsd: number;
  presumed: boolean;
}

type FailedRequestOutcome = { kind: "release" } | { kind: "charge"; charge: FailedRequestCharge };

/**
 * Decide what a failed request is recorded at: the single rule both failure
 * catches (the first request and a pause resumption) share, so one wire state
 * settles one figure. In order:
 *  1. A stream the idle guard abandoned, or one that reported usage but ended
 *     before its final usage event (whatever the cause), is its reported usage
 *     plus the presumed remainder (the request maximum when no usage was
 *     reported).
 *  2. A stream whose final usage event arrived settles at that usage.
 *  3. With no usage reported, a request the provider had answered and the
 *     caller then cancelled, or one that went out and then timed out or lost
 *     its connection, is presumed at the request maximum.
 *  4. Anything else never reached the provider and is released at $0
 *     (DECISIONS D-10: "a request that times out after send is presumed
 *     spent until reconciled").
 */
function classifyFailedRequest(
  opts: RunPassOptions,
  snapshot: StreamedUsageSnapshot,
  cause: unknown,
  requestMaximumUsd: number,
): FailedRequestOutcome {
  const reported = billedMessageFromSnapshot(snapshot, opts);
  if (cause instanceof StreamIdleTimeoutError || (reported !== null && snapshot.finalUsage !== true)) {
    // Generation had started and nobody knows how far it got, whatever ended
    // the stream (the idle guard, the caller, a server error event, a dropped
    // connection): what was reported plus the presumed remainder (DECISIONS
    // D-09). Only the cumulative output count in the final delta is exact.
    return { kind: "charge", charge: { reported, costUsd: abandonedRequestCostUsd(opts, reported, requestMaximumUsd), presumed: true } };
  }
  if (reported !== null) {
    const billing = billingForMessage(reported, opts);
    return { kind: "charge", charge: { reported, costUsd: billing.costUsd, presumed: billing.presumed } };
  }
  // No usage was reported, so the input the provider may have billed is
  // unknown as well as the output: the whole request maximum (DECISIONS D-10).
  // A caller abort counts only once the provider answered (response headers
  // or any stream event); before that the request may never have left.
  if (timedOutAfterSend(cause) || (cause instanceof APIUserAbortError && snapshot.answered === true)) {
    return { kind: "charge", charge: { reported: null, costUsd: requestMaximumUsd, presumed: true } };
  }
  return { kind: "release" };
}

/** Record a failed request's outcome against its permit: release it, or settle the charge. */
async function settleFailedRequest(
  opts: RunPassOptions,
  permit: RequestPermit | null,
  outcome: FailedRequestOutcome,
): Promise<void> {
  if (opts.admission === undefined || permit === null) return;
  if (outcome.kind === "release") {
    await opts.admission.release(permit);
    return;
  }
  const { reported, costUsd, presumed } = outcome.charge;
  await settleWithLedgerRetry(opts.admission, permit, {
    ...(reported === null ? {} : { usage: messageUsage(reported) }),
    costUsd,
    model: reported === null ? opts.model : actualModel(reported) || opts.model,
    webSearches: reported === null ? 0 : webSearchCount(reported),
    fallbackUsed: reported === null ? false : detectFallbackUsed(reported),
    ...(presumed ? { presumed: true } : {}),
  }, opts.field ?? "llm.pass");
}

/**
 * A pass's accounting: the sum of what each of its requests settled, retries
 * and pause resumptions included. `completed` are the fully received
 * messages, `failed` the charges of requests that died; both reservation
 * modes report this one figure.
 */
function passAccounting(
  opts: RunPassOptions,
  completed: readonly BetaMessage[],
  failed: readonly FailedRequestCharge[],
): {
  usage?: BetaUsage;
  costUsd: number;
  presumed: boolean;
  fallbackUsed: boolean;
  webSearches: number;
  model?: string;
} {
  // Failed snapshots first so a completed message, when there is one, stays
  // the "final" message whose usage extras the aggregate carries.
  const messages = [...failed.flatMap((charge) => (charge.reported === null ? [] : [charge.reported])), ...completed];
  const completedBilling = completed.map((message) => billingForMessage(message, opts));
  return {
    ...(messages.length > 0 ? { usage: aggregateUsage(messages) } : {}),
    costUsd:
      completedBilling.reduce((sum, billing) => sum + billing.costUsd, 0) +
      failed.reduce((sum, charge) => sum + charge.costUsd, 0),
    presumed: completedBilling.some((billing) => billing.presumed) || failed.some((charge) => charge.presumed),
    fallbackUsed: messages.some(detectFallbackUsed),
    webSearches: messages.reduce((sum, message) => sum + webSearchCount(message), 0),
    ...(messages.length > 0 ? { model: messages[messages.length - 1].model } : {}),
  };
}

/**
 * Open one streaming request and wait for its final message under the idle
 * guard. `snapshot` is filled in as events arrive so the caller can settle
 * whatever the stream billed if it dies. On idle timeout the stream is aborted
 * (so it cannot keep generating, and billing, after nobody is reading) and a
 * {@link StreamIdleTimeoutError} is thrown; any other failure is rethrown as
 * the SDK raised it.
 */
async function streamFinalMessage(
  client: Anthropic,
  params: MessageCreateParamsNonStreaming,
  signal: AbortSignal | undefined,
  idleMs: number,
  snapshot: StreamedUsageSnapshot,
  onFirstEvent?: () => void,
): Promise<BetaMessage> {
  const stream = client.beta.messages.stream(params, { signal, timeout: REQUEST_TIMEOUT_MS });
  trackStreamedUsage(stream, snapshot);
  if (onFirstEvent !== undefined) stream.once("streamEvent", onFirstEvent);
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const clearIdle = (): void => {
    if (idleTimer !== undefined) clearTimeout(idleTimer);
    idleTimer = undefined;
  };
  // Idle guard: every stream event restarts the clock, and silence past the
  // limit abandons the attempt rather than holding the durable lease until the
  // transport timeout.
  let tripIdle: (() => void) | undefined;
  const idleGuard = new Promise<never>((_resolve, reject) => {
    tripIdle = (): void => reject(new StreamIdleTimeoutError(idleMs));
  });
  idleGuard.catch(() => {}); // raced below; never an unhandled rejection
  const resetIdle = (): void => {
    if (idleMs <= 0) return;
    clearIdle();
    idleTimer = setTimeout(() => tripIdle?.(), idleMs);
    idleTimer.unref?.();
  };
  stream.on("streamEvent", resetIdle);
  resetIdle();
  try {
    return withActualModel(await Promise.race([stream.finalMessage(), idleGuard]));
  } catch (err) {
    if (err instanceof StreamIdleTimeoutError) {
      (stream as { abort?: () => void } | undefined)?.abort?.();
    }
    throw err;
  } finally {
    clearIdle();
  }
}

/**
 * Resume a `stop_reason: "pause_turn"` message by re-sending the assistant's
 * paused content UNCHANGED as an appended assistant turn (explicitly NOT a new
 * "continue" user message), bounded by {@link MAX_PAUSE_RESUMPTIONS} so a turn
 * that keeps re-pausing can't loop forever.
 *
 * The resumption STREAMS, under the same idle guard as the first request
 * (DECISIONS D-09). It used to be a plain non-streaming `create()` with the
 * 600 s client timeout: the paused content is fully materialized, so there was
 * no cache-warming reason to stream — but the resumed turn is itself a full
 * generation, up to the registry output ceiling at high effort, and a
 * non-streaming request that outlives the client timeout is cut off client
 * side while the server keeps generating and billing, then presumed at the
 * request maximum and retried from scratch, which cannot succeed either.
 * Streaming gives the resumption the idle guard, the usage snapshot and the
 * same settlement rules as the request it continues.
 *
 * Returns the message unchanged if it never paused; returns the last (still
 * "pause_turn") message if the budget is exhausted — interpretPassMessage
 * files that as a typed "paused" error rather than misreading it as success.
 * Throws {@link ResumptionFailedError} (wrapping the cause, the messages
 * billed so far and the resumption's own charge) if a resumption fails; the
 * resumption settles its own permit before throwing.
 */
function continuationContent(message: BetaMessage): BetaMessage["content"] {
  const lastFallback = message.content.findLastIndex((block) => block.type === "fallback");
  if (lastFallback < 0) return message.content;
  const results = new Set(message.content.flatMap((block) =>
    "tool_use_id" in block && typeof block.tool_use_id === "string" ? [block.tool_use_id] : []));
  return message.content.filter((block, index) => {
    if (index >= lastFallback) return true;
    if (["thinking", "redacted_thinking", "connector_text", "tool_use"].includes(block.type)) return false;
    return block.type !== "server_tool_use" || results.has(block.id);
  });
}

async function resumeIfPausedWithUsage(
  client: Anthropic,
  params: MessageCreateParamsNonStreaming,
  message: BetaMessage,
  signal?: AbortSignal,
  opts?: RunPassOptions,
  attempt = 1,
  idleMs: number = opts === undefined
    ? streamIdleTimeoutMs()
    : streamIdleTimeoutMsFor(supportsEffort(opts.model) ? opts.effort : undefined),
): Promise<ResumedMessage> {
  let current = params;
  let msg = message;
  const billableMessages = [message];
  let resumptions = 0;
  const admission = opts?.admission;
  while (msg.stop_reason === "pause_turn" && resumptions < MAX_PAUSE_RESUMPTIONS) {
    current = {
      ...current,
      messages: [...current.messages, { role: "assistant", content: continuationContent(msg) }],
    };
    // A resumption is its own billable request, so it is admitted and settled
    // on its own rather than riding the first request's reservation.
    let permit: RequestPermit | null = null;
    if (admission !== undefined && opts !== undefined) {
      try {
        permit = await admission.reserve({
          attempt,
          kind: "resume",
          maximumUsd: requestReservationUsd(opts),
        });
      } catch (error) {
        throw new ResumptionAdmissionError(error, billableMessages);
      }
    }
    const snapshot: StreamedUsageSnapshot = { model: null, usage: null };
    try {
      msg = await streamFinalMessage(client, current, signal, idleMs, snapshot);
    } catch (err) {
      let charge: FailedRequestCharge | null = null;
      if (opts !== undefined) {
        const outcome = classifyFailedRequest(opts, snapshot, err, permit?.maximumUsd ?? requestReservationUsd(opts));
        await settleFailedRequest(opts, permit, outcome);
        if (outcome.kind === "charge") charge = outcome.charge;
      }
      throw new ResumptionFailedError(err, billableMessages, charge);
    }
    if (opts !== undefined) await settleRequest(admission, permit, opts, msg);
    billableMessages.push(msg);
    resumptions++;
  }
  return { final: msg, billableMessages };
}

export async function resumeIfPaused(
  client: Anthropic,
  params: MessageCreateParamsNonStreaming,
  message: BetaMessage,
): Promise<BetaMessage> {
  try {
    const { final } = await resumeIfPausedWithUsage(client, params, message);
    return final;
  } catch (err) {
    // Public wrapper keeps the raw cause (ResumptionFailedError is internal).
    throw err instanceof ResumptionFailedError ? err.cause : err;
  }
}

export interface StreamingPassHandle {
  /**
   * Settles when the first stream event arrives — the moment the prompt-cache
   * entry written by this request becomes readable by other requests. Fire the
   * next pass (bear after bull) only after this resolves with "streamEvent".
   * Never rejects: it also settles on terminal error/abort/end so callers
   * cannot hang (the failure itself surfaces via `result`). A retryable
   * pre-token failure does NOT settle it — the retry may still write the
   * cache, so "error" here means the pass is terminally dead without ever
   * having streamed.
   */
  firstToken: Promise<"streamEvent" | "error" | "abort" | "end">;
  /**
   * Resolves with the interpreted pass result. Transport failures (mid-stream
   * SSE errors, dropped connections, HTTP failures after SDK retries) resolve
   * as `ok:false, kind:"transport"` carrying the billed usage of every attempt
   * — they do NOT reject. Rejects only on programming errors.
   */
  result: Promise<RunPassResult>;
}

/* -- billed-usage tracking for in-flight streams --------------------------- */

/**
 * Last-known cumulative usage snapshot of an in-flight stream attempt, updated
 * from `message_start` (input + cache tokens, serving model) and
 * `message_delta` (cumulative output tokens, server tool use) events. When the
 * stream dies mid-generation, Anthropic has still billed everything streamed
 * so far — this snapshot is the best-effort record of that spend (the exact
 * failure mode of 2026-07-10: two ~8-minute passes billed, $0 recorded).
 */
interface StreamedUsageSnapshot {
  model: string | null;
  usage: BetaUsage | null;
  content?: BetaMessage["content"];
  stopReason?: BetaMessage["stop_reason"];
  stopDetails?: BetaMessage["stop_details"];
  /** True once the final `message_delta` (non-null stop reason, cumulative usage) arrived. */
  finalUsage?: boolean;
  /** True once the provider answered: response headers received (`connect`) or any stream event. */
  answered?: boolean;
}

function trackStreamedUsage(
  stream: {
    on(event: "streamEvent", listener: (event: BetaRawMessageStreamEvent) => void): unknown;
    on(event: "connect", listener: () => void): unknown;
  },
  snapshot: StreamedUsageSnapshot = { model: null, usage: null },
): StreamedUsageSnapshot {
  stream.on("connect", () => {
    snapshot.answered = true;
  });
  stream.on("streamEvent", (event: BetaRawMessageStreamEvent) => {
    snapshot.answered = true;
    if (event.type === "message_start") {
      snapshot.model = event.message.model;
      snapshot.usage = { ...event.message.usage };
      snapshot.content = (event.message.content ?? []).filter((block) => block.type === "fallback");
      snapshot.stopReason = event.message.stop_reason;
      snapshot.stopDetails = event.message.stop_details;
      return;
    }
    if (event.type === "content_block_start" && event.content_block.type === "fallback") {
      snapshot.content = [...(snapshot.content ?? []), event.content_block];
      snapshot.model = event.content_block.to.model;
      return;
    }
    if (event.type === "message_delta" && event.usage) {
      const u = event.usage as Partial<BetaUsage>;
      const base = snapshot.usage ?? ({} as BetaUsage);
      snapshot.usage = {
        ...base,
        ...(typeof u.input_tokens === "number" ? { input_tokens: u.input_tokens } : {}),
        ...(typeof u.output_tokens === "number" ? { output_tokens: u.output_tokens } : {}),
        ...(typeof u.cache_creation_input_tokens === "number"
          ? { cache_creation_input_tokens: u.cache_creation_input_tokens }
          : {}),
        ...(typeof u.cache_read_input_tokens === "number"
          ? { cache_read_input_tokens: u.cache_read_input_tokens }
          : {}),
        ...(u.server_tool_use ? { server_tool_use: u.server_tool_use } : {}),
        ...(u.iterations != null ? { iterations: u.iterations } : {}),
      };
      if (event.delta.stop_reason != null) {
        snapshot.stopReason = event.delta.stop_reason;
        snapshot.finalUsage = true;
      }
      if (event.delta.stop_details != null) snapshot.stopDetails = event.delta.stop_details;
      const final = u.iterations?.[u.iterations.length - 1];
      if (final && (final.type === "message" || final.type === "fallback_message") && final.model) snapshot.model = final.model;
    }
  });
  return snapshot;
}

/**
 * Materialize a failed attempt's streamed-usage snapshot as a minimal
 * BetaMessage so aggregateUsage/costForMessage treat it like any other billed
 * message. Returns null when nothing was billed (the stream died before
 * message_start — the request never reached generation).
 */
function billedMessageFromSnapshot(
  snapshot: StreamedUsageSnapshot,
  opts: RunPassOptions,
): BetaMessage | null {
  if (snapshot.usage === null) return null;
  // Normalize explicitly: a snapshot built only from message_delta events (no
  // message_start seen) can structurally lack the required numeric fields.
  const u = snapshot.usage;
  return {
    id: "msg_partial_failed_attempt",
    type: "message",
    role: "assistant",
    model: snapshot.model ?? opts.model,
    content: snapshot.content ?? [],
    stop_reason: snapshot.stopReason ?? null,
    stop_sequence: null,
    stop_details: snapshot.stopDetails ?? null,
    usage: {
      ...u,
      input_tokens: u.input_tokens ?? 0,
      output_tokens: u.output_tokens ?? 0,
      cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
    },
  } as unknown as BetaMessage;
}

/**
 * The cost of a stream that ended after generation started without its final
 * usage event, whatever the cause (DECISIONS D-09): what the provider reported
 * before the stream stopped being read, PLUS the worst case for the rest of the
 * response, priced at the model's output rate for the tokens the request could
 * still emit.
 *
 * Anthropic bills for generation, and an unfinished stream gives no way to know
 * how much of it happened, whether it stalled, the caller aborted it, the
 * server sent an error event or the connection dropped: the API reports
 * cumulative output tokens only in the final `message_delta`, so a stream cut
 * mid-generation has reported input tokens and ~1 output token. Recording only
 * the last reported usage would understate the charge exactly when nothing else
 * can correct it, so the remainder is presumed spent and named as presumed. The
 * whole figure stays inside the pass reservation, which already bounds the full
 * output ceiling.
 */
function abandonedRequestCostUsd(
  opts: RunPassOptions,
  reported: BetaMessage | null,
  requestMaximumUsd: number,
): number {
  // Nothing reported: the input the provider may have billed is unknown as
  // well as the output, so the whole request (the figure a lost connection
  // in the same wire state settles; DECISIONS D-10, B7 OD-2). The permit's
  // own maximum, like the answered or timed-out no-usage charge: one wire
  // state, one figure.
  if (reported === null) return requestMaximumUsd;
  const reportedUsd = costForMessage(reported, opts);
  if (boundedWebSearchUses(opts.tools) > 0 || registryEntryFor(opts.model).serverSideFallback !== null || detectFallbackUsed(reported)) {
    // Unseen tool rounds can bill more input/searches; fallback can add a full
    // model attempt. If incomplete usage retained the bound, do not add it again.
    return Math.max(reportedUsd, requestReservationUsd(opts));
  }
  const remaining = Math.max(0, effectiveMaxTokens(opts) - reported.usage.output_tokens);
  return reportedUsd + remaining / 1_000_000 * registryEntryFor(opts.model).pricing.outputPerMTok;
}

function presumedRemainderResult(
  opts: RunPassOptions,
  completed: readonly BetaMessage[],
  failed: readonly FailedRequestCharge[],
  attempts: number,
  headline: string,
  aborted: boolean,
): RunPassResult {
  // The request that was abandoned is the last failed charge, already settled
  // at its presumed figure; the pass total sums every request's settlement.
  const reported = failed[failed.length - 1]?.reported ?? null;
  const accounting = passAccounting(opts, completed, failed);
  const reportedOutputTokens = reported?.usage.output_tokens ?? 0;
  const remainingOutputTokens = Math.max(0, effectiveMaxTokens(opts) - reportedOutputTokens);
  const pricing = registryEntryFor(opts.model).pricing;
  const attemptNoun = `${attempts} attempt${attempts === 1 ? "" : "s"}`;
  const fallbackExposure = registryEntryFor(opts.model).serverSideFallback !== null || (reported !== null && detectFallbackUsed(reported));
  const searchExposure = boundedWebSearchUses(opts.tools) > 0;
  const detail = fallbackExposure || searchExposure
    ? `${headline}; retained the presumed request maximum, including ${[searchExposure ? "unreported search iterations" : null, fallbackExposure ? "the configured fallback attempt" : null].filter(Boolean).join(" and ")}`
    : reported === null
      ? `${headline}; retained the presumed request maximum (no usage was reported)`
      : `${headline}; settled reported usage ` +
        `plus a presumed ${remainingOutputTokens.toLocaleString("en-US")} remaining output tokens at $${pricing.outputPerMTok}/MTok`;
  return {
    ok: false,
    gap: gapEntry(opts, `LLM pass abandoned after ${attemptNoun}: ${detail}`),
    error: {
      kind: "transport",
      ...(aborted ? { aborted: true as const } : {}),
      message: `${aborted ? "request aborted by the caller" : "stream idle timeout"} after ${attemptNoun}: ${detail}`,
      usage: accounting.usage,
      costUsd: accounting.costUsd,
      presumed: true,
      fallbackUsed: accounting.fallbackUsed,
      model: accounting.model || opts.model,
      execution: passExecution(opts),
      webSearches: accounting.webSearches,
    },
  };
}

/** The idle-guard result: {@link presumedRemainderResult} under its own headline. */
function deadStreamResult(
  opts: RunPassOptions,
  completed: readonly BetaMessage[],
  failed: readonly FailedRequestCharge[],
  idleMs: number,
  attempts: number,
): RunPassResult {
  return presumedRemainderResult(
    opts,
    completed,
    failed,
    attempts,
    new StreamIdleTimeoutError(idleMs).message,
    false,
  );
}

/**
 * A request the spend caps refused. The pass stops at a request boundary with
 * whatever it had already billed disclosed, rather than being cut mid-request.
 */
function admissionRefusedResult(
  opts: RunPassOptions,
  error: unknown,
  completed: readonly BetaMessage[],
  attempts: number,
  failed: readonly FailedRequestCharge[] = [],
): RunPassResult {
  const raw = errorMessageOf(error);
  const billed = completed.length > 0 || failed.length > 0;
  const accounting = passAccounting(opts, completed, failed);
  return {
    ok: false,
    gap: gapEntry(opts, `LLM pass stopped at a request boundary: ${raw}`),
    error: {
      kind: "transport",
      message: `spend admission refused request ${attempts}: ${raw}`,
      execution: passExecution(opts, billed),
      ...(billed
        ? {
            usage: accounting.usage,
            costUsd: accounting.costUsd,
            ...(accounting.presumed ? { presumed: true } : {}),
            fallbackUsed: accounting.fallbackUsed,
            model: accounting.model || opts.model,
            webSearches: accounting.webSearches,
          }
        : {}),
    },
  };
}

/** Typed `ok:false` transport result carrying the billed usage of all attempts. */
function transportFailureResult(
  opts: RunPassOptions,
  err: unknown,
  completed: readonly BetaMessage[],
  attempts: number,
  failed: readonly FailedRequestCharge[] = [],
): RunPassResult {
  const raw = errorMessageOf(err);
  const billed = completed.length > 0 || failed.length > 0;
  const accounting = passAccounting(opts, completed, failed);
  const attemptNoun = `${attempts} attempt${attempts === 1 ? "" : "s"}`;
  return {
    ok: false,
    gap: gapEntry(opts, `LLM pass transport failure after ${attemptNoun} (incl. automatic retries): ${raw}`),
    error: {
      kind: "transport",
      // The caller aborted this request, rather than the provider failing it.
      // Callers that stop a pass on purpose (a doomed run abandoning its
      // sibling) need to tell their own abort apart from a real provider
      // failure that happened to land at the same moment.
      ...(err instanceof APIUserAbortError ? { aborted: true as const } : {}),
      message: `transport failure after ${attemptNoun}: ${raw}`,
      usage: accounting.usage,
      costUsd: billed ? accounting.costUsd : undefined,
      ...(accounting.presumed ? { presumed: true } : {}),
      fallbackUsed: billed ? accounting.fallbackUsed : undefined,
      model: billed ? (accounting.model || opts.model) : undefined,
      execution: passExecution(opts),
      webSearches: billed ? accounting.webSearches : undefined,
    },
  };
}

/**
 * Streaming pass. Always streams (use for maxTokens > 16K and for the
 * bull-first-then-bear cache-write sequencing — see module JSDoc).
 *
 * Retries retryable transport failures ({@link isRetryableTransportError}) up
 * to {@link PASS_TRANSPORT_MAX_ATTEMPTS} total attempts with
 * {@link PASS_TRANSPORT_RETRY_DELAYS_MS} backoff — the SDK cannot retry a
 * stream that dies mid-generation, and without this a single overload blip
 * discards the pass's full sunk cost. Terminal failures resolve as a typed
 * "transport" RunPassResult carrying the summed billed usage of every attempt;
 * a pass that eventually succeeds folds its failed attempts' billed usage into
 * the reported cost so cost_log reflects true spend.
 */
export function runPassStreaming(opts: RunPassOptions): StreamingPassHandle {
  const { params } = buildPassParams(opts);
  const client = getClient();
  if (!client) {
    return {
      firstToken: Promise.resolve("end"),
      result: Promise.resolve(noKeyResult(opts)),
    };
  }

  let firstSettled = false;
  let signalFirst!: (event: "streamEvent" | "error" | "abort" | "end") => void;
  const firstToken = new Promise<"streamEvent" | "error" | "abort" | "end">((resolve) => {
    signalFirst = (event) => {
      if (firstSettled) return;
      firstSettled = true;
      resolve(event);
    };
  });

  const result = (async (): Promise<RunPassResult> => {
    // Every message that arrived whole, and every failed request's charge,
    // across all attempts: the pass result sums what its requests settled.
    const completed: BetaMessage[] = [];
    const failed: FailedRequestCharge[] = [];
    // Scaled by effort: a deep-thinking request is legitimately silent for
    // longer than a shallow one, and the guard must not mistake that for a
    // dead provider (see STREAM_IDLE_EFFORT_MULTIPLIER).
    const idleMs = streamIdleTimeoutMsFor(supportsEffort(opts.model) ? opts.effort : undefined);
    for (let attempt = 1; attempt <= PASS_TRANSPORT_MAX_ATTEMPTS; attempt++) {
      // Opening the stream is inside the guarded block: a client that fails
      // at construction is a transport failure like any other, not a
      // rejection the runner would have to treat as a crash.
      const snapshot: StreamedUsageSnapshot = { model: null, usage: null };
      // Admit this exact request before it is sent. A refusal here is a spend
      // cap doing its job: the pass stops at a request boundary rather than
      // half-way through one.
      let permit: RequestPermit | null = null;
      if (opts.admission !== undefined) {
        try {
          permit = await opts.admission.reserve({
            attempt,
            kind: "stream",
            maximumUsd: requestReservationUsd(opts),
          });
        } catch (error) {
          signalFirst("error");
          return admissionRefusedResult(opts, error, completed, attempt, failed);
        }
      }
      // Set the instant the request goes out. A permit still held past that
      // point stands for a request the provider may have billed, and the
      // reservation policy (DECISIONS D-07) says such a request is presumed,
      // never released.
      let dispatched = false;
      try {
        dispatched = true;
        const message = await streamFinalMessage(client, params, opts.signal, idleMs, snapshot, () =>
          signalFirst("streamEvent"),
        );
        await settleRequest(opts.admission, permit, opts, message);
        // Recorded, or kept unrecorded after its retries (logged there): the
        // response is interpreted either way and the lease is not released.
        permit = null;
        const { final, billableMessages } = await resumeIfPausedWithUsage(
          client,
          params,
          message,
          opts.signal,
          opts,
          attempt,
          idleMs,
        );
        signalFirst("end"); // only reachable pre-signal if the stream emitted no events
        return interpretPassMessages(final, opts, [...completed, ...billableMessages], failed);
      } catch (err) {
        if (err instanceof ResumptionAdmissionError) {
          signalFirst("error");
          return admissionRefusedResult(
            opts, err.cause, [...completed, ...err.billableMessages], attempt, failed,
          );
        }
        // A failed resumption has already settled its own permit and carries
        // the attempt's completed messages (incl. the streamed first message,
        // whose permit settled when it arrived) plus its own charge; anything
        // else is this stream's failure, still holding its permit, which the
        // shared classifier settles (the same rule the resumption used).
        const resumption = err instanceof ResumptionFailedError ? err : null;
        const cause = resumption === null ? err : resumption.cause;
        let charge: FailedRequestCharge | null;
        if (resumption === null) {
          const outcome = classifyFailedRequest(opts, snapshot, err, permit?.maximumUsd ?? requestReservationUsd(opts));
          await settleFailedRequest(opts, permit, outcome);
          permit = null;
          charge = outcome.kind === "charge" ? outcome.charge : null;
        } else {
          completed.push(...resumption.billableMessages);
          charge = resumption.charge;
        }
        if (charge !== null) failed.push(charge);
        if (cause instanceof StreamIdleTimeoutError) {
          console.error(
            `[anthropic] ${opts.field ?? "llm.pass"}: ${cause.message}; abandoning the attempt and settling reported usage plus the presumed remainder`,
          );
          signalFirst("error");
          return deadStreamResult(opts, completed, failed, cause.idleMs, attempt);
        }
        if (cause instanceof APIUserAbortError && charge !== null) {
          // Aborted after the provider answered — a cancel, a stage deadline,
          // or a doomed run abandoning its sibling. The provider bills whatever
          // it generated up to the disconnect and reports none of it
          // (cumulative output tokens arrive only in the final message_delta),
          // so the request settles exactly like a dead stream: reported usage
          // plus the presumed remainder, or the request maximum when no usage
          // had arrived, flagged presumed (DECISIONS D-09, D-10).
          signalFirst("abort");
          // An abort after the final message_delta settled the reported usage
          // as actual (classifier rule 2): the result states the charge, not a
          // remainder nobody presumed.
          if (!charge.presumed) return transportFailureResult(opts, cause, completed, attempt, failed);
          return presumedRemainderResult(
            opts,
            completed,
            failed,
            attempt,
            charge.reported === null
              ? "request aborted by the caller after the provider answered"
              : "request aborted by the caller after generation started",
            true,
          );
        }
        if (isRetryableTransportError(cause) && attempt < PASS_TRANSPORT_MAX_ATTEMPTS) {
          // A failure after generation started means Anthropic shed load while
          // already serving the request; re-entering immediately mostly dies
          // again, and the retry re-bills the input either way.
          const midStream = charge?.reported != null || resumption !== null;
          const delays = midStream
            ? PASS_MID_STREAM_RETRY_DELAYS_MS
            : PASS_TRANSPORT_RETRY_DELAYS_MS;
          const delay = transportRetryDelayMs(cause, delays[Math.min(attempt - 1, delays.length - 1)]);
          // Server-log every retry — post-mortems must not depend on the
          // transient pipeline UI (2026-07-10: the only trace of two failed
          // ~8-minute passes was a step detail on one page).
          console.warn(
            `[anthropic] ${opts.field ?? "llm.pass"}: transport failure on attempt ${attempt}/${PASS_TRANSPORT_MAX_ATTEMPTS}, retrying in ${Math.round(delay / 1000)}s: ${errorMessageOf(cause)}`,
          );
          try {
            await transportRetrySleepWithSignal(delay, opts.signal);
          } catch {
            // The caller gave up during the backoff. Nothing is in flight, so
            // there is nothing to settle — but the contract still holds:
            // `firstToken` settles and `result` resolves a typed failure. A
            // rejection here left `await bullHandle.firstToken` waiting forever
            // on a cancel before the first token, and on a later attempt filed
            // the side as an anonymous transport failure with no `aborted`
            // flag and none of the usage its earlier attempts billed.
            signalFirst("abort");
            return transportFailureResult(opts, new APIUserAbortError(), completed, attempt, failed);
          }
          continue;
        }
        // A programming error is not a provider failure: keep it loud rather
        // than filing it as spend-bearing transport noise. It still has to
        // settle `firstToken` first — this function's contract is that the
        // promise "cannot hang", and a bug thrown before any stream event
        // otherwise left `await bullHandle.firstToken` waiting forever, with
        // bear never launched and the pass hanging until its deadline.
        if (!(cause instanceof APIError) && !isRetryableTransportError(cause)) {
          signalFirst("error");
          throw cause;
        }
        if (!(cause instanceof APIUserAbortError)) {
          console.error(
            `[anthropic] ${opts.field ?? "llm.pass"}: terminal transport failure after ${attempt} attempt(s): ${errorMessageOf(cause)}`,
          );
        }
        signalFirst(cause instanceof APIUserAbortError ? "abort" : "error");
        return transportFailureResult(opts, cause, completed, attempt, failed);
      } finally {
        if (permit !== null && opts.admission !== undefined) {
          if (dispatched) {
            // The request went out and its settlement write itself failed
            // with something other than a retried writer-lock contention
            // (that case keeps the response and clears the permit above).
            // Releasing here would return money the provider may already
            // have billed; leaving the reservation lets it expire into
            // presumed spend that a later measurement or the reported
            // totals can lower (D-07).
            console.error(
              `[anthropic] ${opts.field ?? "llm.pass"}: request settlement could not be recorded; ` +
                "leaving the reservation to be presumed at expiry rather than releasing it",
            );
          } else {
            // Never reached the provider: release so the reservation is not held.
            await opts.admission.release(permit);
          }
          permit = null;
        }
      }
    }
    throw new Error("unreachable: transport retry loop exited without returning");
  })();

  return { firstToken, result };
}

/**
 * Run one LLM pass. ALWAYS streams (DECISIONS D-09): a paid request can run
 * for many minutes at high effort, a non-streaming request has no signal
 * between "sent" and "answered", and only a stream lets the idle guard
 * abandon a provider that has gone silent while its durable lease and
 * reservation are held. Streaming also gives the usage snapshot that keeps a
 * failed attempt from being recorded as free.
 *
 * A `pause_turn` (long web-search turn) is auto-resumed via
 * {@link resumeIfPaused} before interpretation. Returns
 * `{message, usage, costUsd, fallbackUsed, model}` wrapped in Sourced<T>, or a
 * gap + typed error (no key / refusal / max_tokens / paused / transport).
 * Only programming errors reject.
 */
export async function runPass(opts: RunPassOptions): Promise<RunPassResult> {
  return runPassStreaming(opts).result;
}
