/**
 * Pass request building, split out of passes.ts: token and web-search limits, the judge model
 * floor and retry feedback, the cached payload user turn and the analyst (and analyst repair)
 * request arguments (P25, P26).
 */

import { analystCaseToJsonSchema } from "@/report/schema";
import { serializePayloadForPrompt, isIncompleteAnalystCase, previousOutputBlock, type ContextPayload } from "@/pipeline/stageC/payload";
import { judgeFloorModelId, resolveRegistryModel } from "@/models/registry";
import { SHARED_RULES_BLOCK, buildBullFraming, buildBearFraming } from "@/pipeline/stageC/prompts";
import type { PassDeps, RunPassArgs, RunPassContentBlock } from "./passTypes";

/* ------------------------------------------------------------------------ *
 * Constants
 * ------------------------------------------------------------------------ */

/** Web-search cap per analyst pass (design budget ~8). */
export const ANALYST_MAX_WEB_SEARCHES = 8;
/**
 * maxTokens for the analyst passes (adaptive thinking billed as output).
 * 64K, not 32K: live sonnet-5 runs (cost_log, 2026-07-09) averaged ~29K output
 * tokens per bear pass against the old 32K cap — thinking is ~80% of that, the
 * case JSON only ~4–6K. A clipped pass fails typed (`max_tokens`), discarding
 * the pass's full sunk cost (cache write + searches + thinking). max_tokens is
 * a free ceiling: OTPM rate limits count actual generated tokens only, and
 * every paid pass streams unconditionally (DECISIONS D-09 removed the old
 * token threshold). 64K is also exactly Haiku 4.5's output ceiling, so the cap
 * stays valid on every model.
 */
export const ANALYST_MAX_TOKENS = 64_000;
/**
 * maxTokens for the judge pass. 96K, not 64K: live sonnet-5 judges emit ~43K
 * output tokens on average (max seen 51.8K — 81% of the old cap), of which
 * ~25–30K is the 1.1.0 report JSON itself; a section-heavy ticker plus a long
 * adjudication would clip 64K and burn the whole pass. Same free-ceiling
 * reasoning as ANALYST_MAX_TOKENS; the judge floor (Sonnet 5.5) and every other
 * eligible judge model support 128K output.
 */
export const JUDGE_MAX_TOKENS = 96_000;

/**
 * Cheapest model that reliably emits the judge's ~13KB strict-keyed JSON.
 * The judge schema exceeds the API's compiled-grammar ceiling on EVERY model
 * (no `output_config.format` enforcement possible), so schema fidelity is
 * pure model capability. Haiku 4.5 structurally cannot do it — live runs
 * (2026-07-09) showed misplaced sections, invented keys, and dropped required
 * objects across every repair retry. Bull/bear stay on the selected model
 * (that is where the web-search/token bulk is); only the judge is floored.
 * Per-pass cost logging and the pipeline UI report the ACTUAL serving model,
 * so the substitution is visible, not silent.
 *
 * The id itself belongs to the registry (`judgeFloorModelId`), which is also
 * where the provider's two reservation bounds read it — the three used to
 * spell the same literal out independently.
 */
export const JUDGE_MODEL_FLOOR = judgeFloorModelId();

/** Model the judge/synthesis pass should run on for a given analysis model. */
export function judgeModelFor(analysisModel: string): string {
  return resolveRegistryModel(analysisModel)?.entry.family === "haiku" ? JUDGE_MODEL_FLOOR : analysisModel;
}

/**
 * Cap on how much of a failed judge output is echoed back on retry. Sized
 * from MEASURED output: 1.1.0 judge JSON runs ~100–120K chars on sonnet-5
 * (reports table, 2026-07-09) — the previous 60K cap, premised on a stale
 * "~15–25K chars" estimate, truncated every realistic echo mid-document while
 * telling the model to "repair this JSON in place", which forces it to
 * regenerate the missing half from scratch (the exact failure mode the echo
 * exists to avoid). 200K covers observed sizes ~1.7× over and still bounds a
 * genuine runaway; the echo is only ever paid on a retry (~30K input tokens
 * for a full echo — cheap next to re-rolling a judge pass).
 * Keep in sync with jobRunner's JUDGE_RETRY_RAW_OUTPUT_CAP.
 */
export const JUDGE_RETRY_PREVIOUS_OUTPUT_CAP = 200_000;

/**
 * Build the retry feedback message for a judge attempt that failed schema
 * validation. When the failed attempt's raw output is available it is echoed
 * back so the model REPAIRS its previous JSON instead of regenerating the
 * whole document from scratch — regeneration re-rolls the dice and weaker
 * models (haiku) rarely converge that way.
 */
export function judgeRetryFeedback(zodError: string, previousOutput?: string): string {
  const prev =
    previousOutput && previousOutput.length > 0
      ? `\n\n${previousOutputBlock(
          previousOutput.length > JUDGE_RETRY_PREVIOUS_OUTPUT_CAP
            ? `${previousOutput.slice(0, JUDGE_RETRY_PREVIOUS_OUTPUT_CAP)}\n[...truncated]`
            : previousOutput,
        )}`
      : "";
  return `Your previous output FAILED report-schema validation with this error. Fix EXACTLY these issues and re-emit the full JUDGE_OUTPUT schema:\n${zodError}${prev}`;
}

/* ------------------------------------------------------------------------ *
 * Payload -> user turn
 * ------------------------------------------------------------------------ */

/**
 * The user turn carrying the serialized payload. Identical text across all
 * passes so it sits behind the same cache breakpoint. The volatile per-pass
 * framing is NOT appended here — see {@link buildCachedUserMessage}.
 */
export function payloadUserTurn(payload: ContextPayload): string {
  return serializePayloadForPrompt(payload);
}

/**
 * Build the single user message every analyst/judge pass sends: the
 * byte-identical payload as the FIRST content block, carrying the
 * `cache_control` breakpoint (a cache entry
 * covers everything in the prefix up to and including this block, so `tools`
 * and `system` being identical is what lets the two research requests share a
 * prefix, separately from tool-free writing), followed by the pass-specific
 * volatile framing as a SECOND block, positioned after the breakpoint so it
 * never perturbs the cached prefix.
 */
export function buildCachedUserMessage(
  payload: ContextPayload,
  framing: string,
  ttl: "5m" | "1h" = "5m",
): { role: "user"; content: RunPassContentBlock[] } {
  return {
    role: "user",
    content: [
      { type: "text", text: payloadUserTurn(payload), cache_control: { type: "ephemeral", ...(ttl === "1h" ? { ttl } : {}) } },
      { type: "text", text: framing },
    ],
  };
}

/**
 * Identical research tools preserve bull/bear research-prefix parity. Writing,
 * judge and verify have no tools; strict JSON never constrains search iterations.
 */
export function toolsFor(deps: PassDeps, useWebSearch: boolean, model: string): unknown[] | undefined {
  if (!deps.webSearchTool || !useWebSearch) return undefined;
  return [deps.webSearchTool(ANALYST_MAX_WEB_SEARCHES, model)];
}

/** Exact provider request used by either analyst side. */
export function buildAnalystRunPassArgs(
  deps: PassDeps,
  payload: ContextPayload,
  side: "bull" | "bear",
): RunPassArgs {
  return {
    model: deps.model,
    system: SHARED_RULES_BLOCK,
    messages: [
      buildCachedUserMessage(
        payload,
        side === "bull" ? buildBullFraming() : buildBearFraming(),
      ),
    ],
    // Writing is tool-free. Research uses a separate request without a grammar.
    outputSchema: analystCaseToJsonSchema(),
    maxTokens: ANALYST_MAX_TOKENS,
    effort: deps.effort ?? "high",
    field: `llm.${side}`,
    signal: deps.signal,
    admission: deps.admissionFor?.(side),
    reservationPass: side,
  };
}

/**
 * The feedback turn of an analyst REPAIR attempt: the side's first output was
 * received but rejected by the ANALYST_CASE schema (a haiku bull pass wrote
 * "2026-Q1" for `asOf` on 2026-09-02 and the pair was lost). The runner
 * drives the attempt under its own settlement checkpoint; here the cached
 * payload turn and schema stay byte-identical to the first writing attempt;
 * successful research is reused and the error plus rejected output ride in a second user
 * turn, exactly as the judge's repair turn does.
 */
export function analystRepairFeedback(validationFeedback: string): string {
  // D-185 (ASML Opus 5.5 paid run, 2026-11-03): a skeleton case (one thesis
  // claim, every other section empty) was repaired under "same evidence, same
  // citations, corrected fields only" and came back as the same skeleton. An
  // empty section cannot be fixed without new claims, so an incomplete case is
  // asked to write its missing sections; a format error is still fixed in place.
  if (isIncompleteAnalystCase(validationFeedback)) {
    return (
      "Your previous output was rejected as an INCOMPLETE case, not for its format: a schema-valid outline with empty " +
      "sections is not a case. Write the complete ANALYST_CASE JSON now. Fill every section named below with sourced " +
      "claims drawn from the payload and the supplied research, as your case instructions require, and keep each correct " +
      "claim you already wrote. Where the evidence for a section is limited, state that specific limitation with its " +
      `disclosed gap source instead of leaving the section empty:\n${validationFeedback}`
    );
  }
  return (
    "Your previous output FAILED the ANALYST_CASE schema validation with this error. Fix EXACTLY these issues and " +
    `re-emit the full ANALYST_CASE JSON — same evidence, same citations, corrected fields only:\n${validationFeedback}`
  );
}

/** Exact provider request of an analyst repair attempt. */
export function buildAnalystRepairRunPassArgs(
  deps: PassDeps,
  payload: ContextPayload,
  side: "bull" | "bear",
  validationFeedback: string,
): RunPassArgs {
  const base = buildAnalystRunPassArgs(deps, payload, side);
  return {
    ...base,
    messages: [...base.messages, { role: "user", content: analystRepairFeedback(validationFeedback) }],
  };
}
