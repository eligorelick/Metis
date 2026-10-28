# Every Paid Request Is Settled and Shown at Its Real Cost (B7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every paid Claude request settles at a figure that is never below what it may have billed and never charges a request that never left the machine; each pass result, run-panel step and audit export states the same cost as the ledger; and the judge-order check says only what it measured.

**Architecture:** In `src/providers/anthropic.ts` the two failure catches (first request and `pause_turn` resumption) share one classifier that decides release, reported or presumed for a failed request, and one per-pass list of failed-request charges that feeds every pass result builder; a connect-phase fetch wrapper tags requests that never left the machine, and a ledger-lock retry keeps a completed response when its settlement write is contended. In the scheduler, presumed request rows take their lease's acquisition date and paid admission applies the lower of the recorded and the configured per-job cap. In the runner and report layer, step details read the summed step cost, judge attempts rejected at report assembly join the discarded-attempt join (shared by normal assembly and durable recovery), the audit export prints the mark, and the judge's mirrored request is skipped and disclosed whenever it could not be an independent draw.

**Tech Stack:** TypeScript 5, Next.js 16 app (no `src/app` file changes in this batch), `@anthropic-ai/sdk` 0.112.4, Node 24 `fetch` (undici), better-sqlite3 + drizzle-orm, vitest.

**Spec:** `tmp/audit-2026-10-27/REPORT.md` (section 7, batch B7), `tmp/audit-2026-10-27/findings.json` (AI-113, AI-108, AI-307, AI-308, AI-309, JOB-203, JOB-209, AI-109, AI-112, AI-113-V1, AI-114, JOB-204, RPT-210). `docs/superpowers/specs/2026-10-27-audit-remediation-decisions.md` (written by the main session after this plan; untracked at HEAD `6542531`): section 2.9 holds B7-OD-1..OD-7 as summaries, and section 4.3, "Main-session resolutions (2026-10-28)", confirms the one call this plan's review left open (OD-2's idle-guard figure). Where the spec's summary and this plan differ, this plan's "Owner decisions" section is the authority.

**Branch:** `fix/paid-spend-accounting`, cut from an up-to-date `main` (HEAD at planning time: `6542531`, equal to `origin/main`).

All 13 findings were re-read against the code at HEAD on 2026-10-27; every cited line still reads as the finding describes (see "Findings check" at the end). None is skipped.

---

## Global Constraints

- Failing test first for every task. If a finding cannot be made to fail, skip it and say so in the PR (none expected: every probe fails at HEAD).
- Smallest change that fixes the whole class. No ticker-specific code, no unrelated refactoring. The one structural change (Task 1's shared failed-request classifier) exists only because the two duplicated catch blocks are the root cause of AI-113, AI-113-V1 and AI-114.
- One commit per task. Stage files by name (`git add <path> ...`); never `git add -A` or `git add .` (the audit folder, `brag-output*` and `tmp/` must stay uncommitted).
- Fixtures are synthetic or trimmed. Do not commit anything from `tmp/audit-2026-10-27/data/` (run-input snapshots carry FMP data; see `docs/DATA-RIGHTS.md` "Financial Modeling Prep"). Stored data is used only for the local before/after replay (Task 21).
- Tests are hermetic: no live network, no market-data, SEC, FRED or AI-provider calls, no paid calls, never a report for a real ticker. Real-SDK tests use an in-memory `fetch` and an offline placeholder key: in test files declare `const OFFLINE_KEY = "sk-" + "ant-api03-offline-test";` and use `OFFLINE_KEY` (this plan writes it that way because `tests/repository.release.test.ts` "keeps approved public docs free of home paths and credential values" rejects a literal provider-key prefix, or `API_KEY = <12+ characters>`, in any committed Markdown: the disposition note, DECISIONS, CHANGELOG and this plan if committed must follow the same rule, and must not contain absolute home paths).
- README.md is at its line cap: 270 lines, the maximum `tests/docs.lint.test.ts` "stays short enough to be read" allows. No README edit in this batch may add a line. README lines 57-94 (configuration table, from `.env.example`) and 164-201 (pricing block, from `scripts/docs-pricing.mjs`) are generated and compared byte-for-byte by `tests/docs.lint.test.ts`: change their source and regenerate with `npm run docs:config` / `npm run docs:pricing`, never hand-edit them. The configuration table takes the first non-indented sentence of each key's adjacent `.env.example` comment block, so `.env.example` edits keep that first sentence and the indented sub-lines' indentation, and add no blank line inside a key's block.
- `src/providers/anthropic.ts`, `src/pipeline/jobScheduler.ts` and `src/pipeline/jobRunner.ts` are in the per-file risk coverage manifest (`vitest.shared.ts` RISK_SOURCE_MANIFEST; `npm run test:coverage:risk`: 85% statements/lines/functions, 75% branches per file). Every new branch (classifier rules, fetch wrapper, ledger retry, cap helper) needs a test in this plan; do not add untested defensive branches.
- Never weaken a check or loosen a test to make it pass. A presumed figure that rises, or a reconciliation that becomes "not performed", is intended. Every re-pinned existing test is named in its task with the reason it moves.
- Every behaviour change updates the markdown that describes it in the same commit (`docs/CLAUDE-USAGE.md`, `README.md`, `.env.example`, `docs/OPERATIONS.md`; `docs/METHODOLOGY.md` has no cost-settlement or judge-order text and is not touched).
- Version stamps: only `PIPELINE_VERSION` moves (Task 15); `tests/jobRunner.test.ts:6204` moves with it. `REPORT_SPEC_VERSION`, `PAYLOAD_VERSION`, `STAGE_B_IMPLEMENTATION_VERSION` and `SCORE_BANDS_VERSION` do not move (reasons in Task 15).
- Stored reports are never rewritten (D-67). RPT-210 is display-only: stored reports #48 and #49 gain the discarded mark in their audit export from their own stored flag. No other finding changes how a stored report reads.
- CHANGELOG entry, one DECISIONS entry per decision taken (written `D-next-1` .. `D-next-7`; numbers are assigned at merge time and renumbered then), a disposition note in `docs/audit/` registered in `tests/repository.release.test.ts`.
- `npm run audit:deltas -- --write` only if a Stage B leaf moves, and only after confirming the move follows from these fixes (none is expected: B7 changes no Stage B output).
- Before/after proof by replaying stored inputs with no provider or model calls (Task 21). Never open a `.db`, `.db-wal` or `.db-shm` file; exclude `*.db*` from recursive greps.
- `npm run verify` in foreground chunks (Task 22), then a fresh reviewer over the whole diff (Task 23), then a plain-English PR description (Task 24).
- AGENTS.md (Next.js 16): no task modifies `src/app`, a route handler or `src/proxy.ts`. If an implementer finds one must (for example to surface a cap on Retry), read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` first and heed its deprecation notices.
- Keep git attribution lines from the session's system reminder on every commit and the PR body.

---

## Owner decisions

The owner delegated these calls ("Use your recommendation based on research to make this a professional accurate repository"). Each was checked against Anthropic's documentation, the repository's recorded decisions (D-07, D-09, D-10, D-20, D-70, D-113, D-116) and, where relevant, practitioner and academic sources.

### OD-1 (AI-113, High): what a paid stream presumes when it dies after `message_start`

- **Question.** A stream that has emitted `message_start` and then ends without its final `message_delta` (a mid-stream `overloaded_error`/`api_error` SSE event, a socket or body death after the headers) is today settled as an `actual` row at the `message_start` snapshot (about one output token). Should it be presumed at the worst-case remainder like a lost connection, or bounded more narrowly?
- **Decision.** Presume it, exactly as the idle guard and a caller abort already do in the same wire state: reported usage plus the unreported output remainder at the model's output price, or the request maximum when the request carries web-search or server-fallback exposure (`abandonedRequestCostUsd`), flagged `presumed` so `costs:reconcile` can lower it. A stream whose final `message_delta` (one with a non-null `stop_reason`) arrived settles `actual` at the reported usage, even if the socket then dies before `message_stop`. The pass result carries the presumed figure and the `presumed` flag. One rule for every cause: the same snapshot settles the same figure whether the idle guard, the caller, the server or the network ended it.
- **Alternatives rejected.** (a) Keep the snapshot-only `actual` row: it understates spend exactly when nothing else can correct it, hides the row from reconciliation and from cap admission, and records less than the same death one event earlier. (b) A narrower estimate such as elapsed time times a generation rate: Anthropic publishes no generation rate, and an estimate that is low is the unsafe direction for the caps (D-07: "over-counts until reconciled, which is the safe direction").
- **Revises.** No recorded decision covers a post-`message_start` server or connection death (DECISIONS has no `message_start` entry). Extends D-09 ("A dead stream settles the usage reported so far plus the worst case for the remainder as `presumed`") from the idle guard to every cause, and the 2026-09-06 F154/F46 fix (abort after `message_start`).
- **Sources.**
  - Anthropic, Streaming messages, https://platform.claude.com/docs/en/build-with-claude/streaming : "The token counts shown in the `usage` field of the `message_delta` event are *cumulative*." and, under Error events, "The API might occasionally send errors in the event stream. For example, during periods of high usage, you might receive an `overloaded_error`". The only cumulative output count arrives in the final delta, so a stream cut before it reports about one output token.
  - Anthropic, Claude API errors, https://platform.claude.com/docs/en/api/errors : "When receiving a streaming response over server-sent events (SSE), an error can occur after the API returns a 200 response." The page states no billing rule for such a response, so the charge is unknown, not zero.
  - OpenRouter, Streaming (stream cancellation), https://openrouter.ai/docs/api/reference/streaming : for supported providers ("OpenAI, Azure, Anthropic"), aborting "immediately stops model processing and billing". This is a third-party router describing its own pass-through billing, and the page does not say that work before the cut is billed (that is implied, not stated); it supports the direction (a cut can only stop further charges, so the remainder presumption over-counts), not a figure.
  - D-07 (`docs/audit/DECISIONS.md:1693`): presumed spend "over-counts until reconciled, which is the safe direction".

### OD-2 (AI-113-V1, Low): a caller abort after the provider answered but before `message_start`

- **Question.** The provider has answered (HTTP 200 and SSE headers) but no event has arrived when the job signal aborts. Today the permit is released at $0 while a socket death in the same state is presumed. Presume the remainder, the request maximum, or an input-only estimate?
- **Decision.** Presume it at the request maximum: the figure D-10 already settles for a request that was sent and then lost with no usage reported (`settleRequest(..., presumeOnNoUsage)`, `anthropic.ts:1703-1714`, which a socket death in this same state takes today). With no usage reported, the input Anthropic may have billed is unknown as well as the output, so the worst case is the whole request. The idle guard's no-usage case (`abandonedRequestCostUsd(opts, null)`, today output-only) moves to the same figure, so one wire state settles one figure whichever of the idle guard, the caller or the network ended it. "Answered" means the SDK stream emitted `connect` (response headers received, `node_modules/@anthropic-ai/sdk/lib/BetaMessageStream.js:167-173`) or any stream event arrived. An abort before the response headers is still released at $0.
- **Alternatives rejected.** (a) Input-only estimate: Metis has no offline token count for the input (see OD-4), and a figure below the socket-death figure for the identical wire state recreates the cause-dependent ledger this batch removes. (b) Output remainder only (the idle guard's figure today): it prices none of the input, which may have been processed and billed. (c) Presume every abort after `fetch` was called: an abort while the TCP connection is still opening would presume requests that never reached Anthropic, the error class AI-307 removes. Residual, recorded in the DECISIONS entry: an abort after the request body was written but before the headers arrive is released, because Node's `fetch` does not report when the body finished sending.
- **Revises.** Applies D-07's dispatch rule (`anthropic.ts:2270-2273`, "presumed, never released") and the 2026-09-06 F7 disposition ("a post-headers failure is presumed, not released") to the caller-abort cause.
- **Sources.**
  - OpenRouter stream cancellation, as in OD-1: cancellation stops further billing; work done before it is billed.
  - D-10 (`DECISIONS.md:1713`): "a request that times out after send is presumed spent until reconciled".
- **Confirmed (main session, 2026-10-28; decisions spec 4.3, B7).** Raising the idle guard's no-usage figure from the output remainder to the request maximum is confirmed. It is the conservative unification of one wire state, consistent with recommended default 8 and principle P4 ("overstate, never understate, a paid cost": an overstated presumption is visible and lowered by `costs:reconcile`; an understated one breaks the caps). Reversible by restoring the output-only branch of `abandonedRequestCostUsd(opts, null)`; the D-next-1 entry says so.

### OD-3 (AI-108, High): `METIS_JUDGE_ORDER=both` after a cut-off retry

- **Question.** When a judge retry carries sections kept from a cut-off response, the mirrored request receives the same kept sections, so the compared grades are compared with themselves and the report says both passes agreed. Disclose the mirror as not performed, or run a fresh mirror without the kept sections?
- **Decision.** Disclose it as not performed and run no mirrored request, on every retry that carries any kept section (not only `verdict`). Kept sections were written under the seeded order and the retry is told to stay consistent with them, so a mirror built on them is anchored on the primary's draw: the same reason the repair-turn branch already gives (`passes.ts:2406-2420`). The reason names the kept sections. No extra paid call or plan allowance is spent.
- **Alternatives rejected.** (a) Fresh full mirror without kept sections: it doubles the plan time that caused the cut-off, can be cut off again, and spends money or allowance the owner did not ask for. (b) Skip only when `verdict` is carried: a mirror that writes its own grades while told to stay consistent with the primary's business and fundamentals sections is still anchored.
- **Revises.** D-20 ("`both` runs the judge twice with swapped order and reconciles") gains a stated exception for anchored retries; consistent with D-70 (mirror and repair requests are separate draws) and D-116's Limits bullet on mirrored requests.
- **Sources.**
  - Zheng et al., "Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena", section 3.4, https://arxiv.org/html/2306.05685v4 : "A conservative approach is to call a judge twice by swapping the order of two answers." ... "If the results are inconsistent after swapping, we can call it a tie." The check measures order sensitivity only when each ordering is judged on its own.
  - The repository's own repair-turn rule, `src/pipeline/stageC/passes.ts:2406-2420`: "a mirror anchored on the previous output is not an independent draw".

### OD-4 (AI-309, Medium): keep Claude Haiku 4.5 as an analyst model

- **Question.** The offline input bound counts UTF-8 bytes as tokens, so every current payload (323,567-383,847 bytes) is refused on Haiku's 200,000-token window although Anthropic billed the same NVDA request at 159,327 input tokens on the larger, newer tokenizer. Keep Haiku with a better bound (estimate or `count_tokens`), or withdraw it?
- **Decision.** Keep Haiku 4.5. Replace the context-window refusal with an offline estimate calibrated per tokenizer and refuse only an estimate above the window: input tokens = ceil(serialized UTF-8 bytes / k), with k = 2.25 bytes per token for the tokenizer Anthropic introduced with Claude 4.7 (every active entry except Haiku) and k = 2.75 for the earlier tokenizer (Haiku 4.5, registry generation below 4.7). Calibration: Metis's own billed NVDA requests measured 2.38 bytes per token on the newer tokenizer (report #48: 379,563 bytes, 159,327 tokens; #49: 383,847 bytes, 161,000 tokens), and Anthropic documents the earlier tokenizer at about 30% fewer tokens for the same text (about 3.1 bytes per token); both constants are rounded down so the estimate over-counts Metis payloads. A wrong "fits" costs nothing: an over-long prompt is refused by the API with a 400 that the transport already settles at $0 (`tests/requestAdmission.test.ts:471` "settles a request that never reached the provider at zero").
- **Alternatives rejected.** (a) `count_tokens` before launch: the endpoint "returns an `invalid_request_error`" for requests with server tools such as web search, which every analyst pass carries; it would also turn the synchronous preflight contract (pinned in `tests/risk.providers.coverage.test.ts:1349-1410`) into a network call. (b) Withdraw Haiku from Settings and the README: it is the cheapest advertised configuration ($0.69 estimated run) and the payloads fit with room to spare. (c) A single divisor of 2: still refuses NVDA once the payload grows about 4%.
- **Revises.** No recorded decision covers the byte bound (it entered with `fbbd532`). Consistent with D-06 (Haiku route) and D-10 (the reservation is sized from the context window, not from this bound).
- **Sources.**
  - Anthropic, Token counting, https://platform.claude.com/docs/en/build-with-claude/token-counting : "Claude 4.7 and later models and Claude Mythos Preview use a newer tokenizer. The same input text produces approximately 30 percent more tokens than on earlier models." and "This endpoint returns an `invalid_request_error` for a few inputs that the Messages API accepts: Server tools such as web search ...". The same note adds "The exact increase depends on the content and workload shape", which is why the 2.75 constant sits about 11% below the 3.1 bytes per token the 30% figure implies, and why the decision rests on the $0 provider refusal as the backstop rather than on the estimate being exact (re-checked 2026-10-27 by the plan reviewer).
  - Direction of error: a refusal the estimate should not have made publishes a data-only report for nothing; an admission it should not have made ends in a provider 400 that the transport releases at $0 with the same data-only outcome. An estimate close to the truth is therefore the better design than a strict ceiling, and keeping the strict byte count (`requestInputTokenUpperBound`) exported keeps it available where a strict bound is needed. This replaces a check by decision with recorded evidence; it is not a test loosened to pass.
  - Anthropic, same page: "Token counting is **free to use** but subject to requests per minute rate limits" (the alternative was viable on cost; it fails on server tools and contract shape).
  - Stored billing evidence, `tmp/audit-2026-10-27/data/evidence/48/cost_log.json` (bull: 5,720 input + 153,607 cache write, no searches) and the probe log `tmp/audit-2026-10-27/agents/r2-verify-10/AI-309.out.txt`.

### OD-5 (JOB-203, Medium): which instant dates a presumed request row

- **Question.** Presumed rows written by the settlement paths are dated when they settle, while the expiry sweep dates them at the lease's acquisition. Which day does Anthropic's Cost API assign to a request that spans UTC midnight, and should actual rows follow the same convention?
- **Decision.** Every presumed row is dated at its lease's acquisition: the request-settlement path (`settleRequestCost`), the pass-level presumed row (`jobArtifacts.ts:1022`, pass mode) and, as today, the sweep. Actual rows keep their settlement instant. Anthropic's documentation does not state which instant buckets a request, so the repository keeps its recorded premise (D-07 revision F68/F76, `jobScheduler.ts:309-318`: "a call bills on a day bounded by its authorization") and applies it to every row the reconciler can lower; actual rows are measurements that are never lowered, and for the rolling cap a later date is the conservative side. Residuals, recorded in the DECISIONS entry and `docs/CLAUDE-USAGE.md`: (1) if a measured request spans midnight and Anthropic buckets by start, its actual row sits in the later day's "accounted" total and can lower a presumed row on that day by at most that request's measured cost; (2) if Anthropic instead buckets by completion, a presumed row for a request that spanned midnight is compared with the earlier day, whose total may not hold the charge, and can be lowered too far; the same exposure has applied to every swept row since 782a853, and is limited to presumed requests that span 00:00 UTC; (3) dating at acquisition moves a presumed row into the rolling-cap window up to one request duration earlier, so with a rolling window shorter than a request it can leave the window sooner (the sweep has done the same since 782a853; the request was counted as a live reservation until it settled).
- **Alternatives rejected.** (a) Date actual rows at acquisition too: a rolling window shorter than one request (`METIS_ROLLING_COST_WINDOW_MINUTES` accepts 1) would drop settled spend from the cap at the moment it is written. (b) Keep settlement dating for presumed rows: the probe shows a $12.50 presumption lowered to $0 against the next day, and `costs:reconcile` never fetches the day that holds the charge. (c) Reconcile against two-day windows: changes D-07's per-bucket allocation for every row to hedge one boundary case.
- **Revises.** Extends D-07's 2026-09-06 revision (F68/F76, commit `782a853`, sweep only) to the settlement paths. Does not change D-09 or D-10.
- **Sources.**
  - Anthropic, Usage and Cost API, https://platform.claude.com/docs/en/manage-claude/usage-cost-api : Cost API "Time buckets: Only daily granularity (`1d`) is available." and "Usage and cost data typically appears within 5 minutes of API request completion". Neither passage says which instant assigns a request to a bucket.
  - Anthropic, Get Cost Report reference, https://platform.claude.com/docs/en/api/admin/cost_report/retrieve : buckets are snapped to the start of the day in UTC, start inclusive and end exclusive.
  - `src/pipeline/jobScheduler.ts:309-318` (the recorded premise and the $12.50 incident it was written for).

### OD-6 (JOB-209, Medium): per-job cap fixed at creation or applied live

- **Question.** `METIS_MAX_JOB_COST_USD` is copied onto the job row at enqueue, so queued or retried work runs under the cap in force when it was first queued (null means uncapped). Should the cap apply live?
- **Decision.** Paid admission applies the lower of the job's recorded cap and the cap configured now (`SchedulerLimits.maxJobCostUsd`, read by `configuredSchedulerLimits()` alongside the rolling cap, so no new `getConfig()` call). Lowering or setting the cap and restarting binds every job that has not finished; raising it does not loosen a job queued under a lower cap (fail-closed; start a new report to run under the higher cap). The row snapshot stays (pinned by `tests/jobRunner.test.ts:5855`).
- **Alternatives rejected.** (a) Live cap only: raising the cap would loosen jobs created under a stricter one, which an operator did not ask for. (b) Keep the snapshot and only document it: an operator who lowers the cap to stop spend is not obeyed for queued and retried work.
- **Revises.** D-10's cap admission ("`settled + live reservations + this request ≤ caps`") now names which cap: the lower of the two. Introduced by `fbbd532`; no D-entry recorded the snapshot.
- **Sources.**
  - Anthropic, Rate limits, https://platform.claude.com/docs/en/api/rate-limits : "Organization-wide limits always apply, even if Workspace limits add up to more." and "When usage reaches a spend limit you set, requests return HTTP 400 ... Raise or remove the limit to restore access sooner." The provider's own spend controls apply the most restrictive limit live.
  - `docs/CLAUDE-USAGE.md:161-171` ("Spend controls and reconciliation"), which promises the caps bound paid work and is updated in the same commit.

### OD-7 (AI-112, design choice the runner owns): when an assembly failure re-buys the judge

- **Question.** A judge output that fails report assembly is retried up to the limit even when the failure is in pipeline-owned data the judge cannot change.
- **Decision.** Retry a report-assembly failure once; if the next attempt fails assembly with the same issue list, stop retrying the judge. This needs no map of which report paths the judge writes, and caps the waste at one extra pass. Every judge attempt whose output failed assembly is marked discarded with the reason "the report could not be assembled from its output (...)" and gets its own `llm.synthesize.discardedAttempt` entry (35fa83b's contract).
- **Alternatives rejected.** Classify issue paths as judge-owned or pipeline-owned: the report tree mixes judge text and pipeline figures under the same top-level keys, and a wrong map would either re-buy forever or refuse a repairable retry.
- **Revises.** Extends 35fa83b / REM-paid-repaired (failure artifacts) to success artifacts rejected at assembly. No D-entry exists for assembly retries.
- **Sources.**
  - Amazon Builders' Library, "Timeouts, retries and backoff with jitter", section "Retries and backoff", https://builder.aws.com/content/3EumjoZascWd1oZiEgL8ORlv3qE/timeouts-retries-and-backoff-with-jitter : "client errors should not be retried with the same request because they aren't going to succeed later." An assembly failure that repeats unchanged after a repair behaves like such an error.
  - The repository's own contract text in `src/pipeline/jobRunner.ts:4803-4831` ("appears in the cost breakdown marked `discarded`") and D-113 ("A repaired step states its whole cost").

### Findings that need no owner decision

- AI-307: the code and D-10 already state the rule ("A request the provider never answered settles at $0 unless it was sent and then timed out", `anthropic.ts:1687-1694`). Source for the error classes: undici Errors, https://raw.githubusercontent.com/nodejs/undici/main/docs/docs/api/Errors.md : `UND_ERR_CONNECT_TIMEOUT` "A connection could not be established before the connection timeout elapsed"; `UND_ERR_HEADERS_TIMEOUT` "The full response headers were not received before the headers timeout elapsed" (post-send, stays presumed).
- AI-308: S1 (the retry settle committed) returns the response; S2 (never committed) keeps D-07's documented presume-at-expiry and now also returns the response.
- AI-109, AI-114, JOB-204, RPT-210: corrections to stated contracts (D-20 compared fields, D-09 accounting, D-113, 35fa83b).

---

## Review Focus

Five input classes no existing or probe test exercises; each has a test in its owning task.

1. A final `message_delta` (non-null `stop_reason`, cumulative usage) arrives and then the socket dies before `message_stop`: must settle `actual` at the reported usage, not presumed (over-correction guard). Owner: Task 2, test "settles reported usage when the final message_delta arrived before the socket died".
2. A `pause_turn` resumption dies after its own `message_start` with a server error and a later transport attempt succeeds: the resumption is presumed exactly once, the pass cost equals the sum of settlements, and nothing is counted twice. Owner: Task 2, test "presumes a resumption that dies after message_start once, and the pass result counts it once".
3. Web-search or server-fallback exposure (a bull pass with `webSearchTool(8, model)`; a Fable model) dying after `message_start`: must settle at the request maximum, not the output remainder. Owner: Task 2, test "keeps the request maximum for a search-capable request that dies after message_start".
4. Post-send timeouts must stay presumed after the pre-send tag lands: `UND_ERR_HEADERS_TIMEOUT` and the SDK's own request-timeout abort; and an OS-level `ETIMEDOUT` with `syscall: "connect"` is released. Owner: Task 4, tests "keeps a headers timeout presumed", "keeps the SDK request timeout presumed", "releases an OS connect ETIMEDOUT".
5. `METIS_JUDGE_ORDER=both` on the Anthropic API path (not sectioned), where kept sections ride a continuation turn: the mirror must be skipped there too. Owner: Task 10, test "skips the mirror on the API path when a continuation carries kept sections".

---

## Tasks

Order: provider settlement (Tasks 1-5), scheduler (6-7), context bound (8), judge protocol (9-10), runner display (11-13), then batch tasks (14-24). Dependencies: Tasks 2 and 3 change rules inside Task 1's classifier, and Task 5 wraps Task 1's settle sites; Task 13 consumes Task 11's `AssemblyRejectedAttempt`; Task 9 lands before Task 10 (both edit the judge reconciliation). Every other task is independent and can be reviewed alone.

### Task 0: Capture the before-replay baseline (batch, run first)

Run this on the freshly cut branch, before Task 1, so the "before" column of Task 21 comes from HEAD `6542531` with no source change.

**Files:**
- Create (git-ignored, never committed): `tmp/audit-2026-10-27/plans/replay/vitest.replay.config.ts`, adapted from `tmp/audit-2026-10-27/probes/vitest.probe.config.ts`. The replay folder is one level deeper than `probes/`, so a literal copy breaks: use `import { SHARED_RESOLVE_ALIAS, SHARED_SETUP_FILES, SHARED_TEST_RUNNER } from "../../../../vitest.shared";`, `root: path.resolve(__dirname, "../../../..")`, `include: ["tmp/audit-2026-10-27/plans/replay/**/*.replay.ts"]`, and keep `setupFiles: SHARED_SETUP_FILES` (live network stays blocked), `runner`, `pool: "forks"`, `isolate: true` and the alias.
- Create (git-ignored): `tmp/audit-2026-10-27/plans/replay/B7.replay.ts` with three read-only cases. Import the provider as a namespace (`import * as anthropic from "@/providers/anthropic"`) so the same file runs before Task 8 exists and after it.
  1. AI-309: for each of `tmp/audit-2026-10-27/data/evidence/{43,46,48,49}/run_input_snapshot.gen0.*.json`, rebuild the payload exactly as `probes/AI-309.probe.ts` `payloadFor` does (`verifyRunInputSnapshot` -> `validateBundle(bundle, { now: new Date(bundle.builtAt) })` -> `runStageB(bundle, snap.content.stageBConfig, validation)` -> `assembleContextPayload`), build `args = buildAnalystRunPassArgs({ model: "claude-haiku-4-5", webSearchTool: anthropic.webSearchTool } as never, payload, "bull")` as that probe does, then call `pipelinePasses.preflightPass!({ analysisModel, payload, effort: "high" }, { pass: "bull" })` for `claude-haiku-4-5` and `claude-sonnet-5-5`; print `{ id, byteBound: anthropic.requestInputTokenUpperBound(args), haikuRefusal, sonnetRefusal }` and, when `typeof (anthropic as Record<string, unknown>).estimatedRequestInputTokens === "function"`, the estimate for `args`.
  2. AI-108: replicate the "#50 replay" case of `probes/AI-108.probe.ts` exactly (failed synthesize attempt `58883147-381f-4806-919f-9298d9c0fc67` from `tmp/audit-2026-10-27/data/evidence/50/job_pass_artifacts.json`; `checkCarriedJudgeSections(completedTopLevelFields(partialText)).kept`; its `provider(primary)` and `deps`, fixture imports from `../../probes/m1-sweep-C2/fixture`; continuation `{ completed: carried, sectionRetryCount: 1 }`). Print the carried keys, the number of provider calls whose `order` is the mirror's (the probe's `log`), and `{ performed, agreed, note }`.
  3. RPT-210: for `tmp/audit-2026-10-27/data/reports/{48,49}.json`, read the stored report exactly as `probes/RPT-210.probe.ts` does and print the "Recorded API charge breakdown" table and total line of `reportToAuditMarkdown`.
- No `.db` file is opened. No provider client is constructed (`ANTHROPIC_API_KEY` unset; the shared setup blocks network).

- [ ] **Step 1:** `npx vitest run --config tmp/audit-2026-10-27/plans/replay/vitest.replay.config.ts > tmp/audit-2026-10-27/plans/replay/B7.before.txt 2>&1`
- [ ] **Step 2:** Confirm the file shows: Haiku refused for all four ids with byte bounds 342,680 (#43), 323,567 (#46), 379,563 (#48), 383,847 (#49); Sonnet 5.5 admitted; #50 carried keys `verdict, business, fundamentals`, a non-zero mirror request count (record the number printed; the probe logged 6 only for a carried verdict alone, and #50 carries three sections, so do not assume 6) and `performed: true, agreed: true`; #48 and #49 breakdown rows with no "discarded" text. If any line differs from the audit's figures, stop and reconcile before Task 1.
- [ ] **Step 3:** No commit (the files are git-ignored).

---

### Task 1: Count every failed request's settlement in its pass result (AI-114)

Root cause: `runPassStreaming` and `resumeIfPausedWithUsage` each decide release, actual or presumed for a failed request in their own catch, and only completed messages reach the pass result. A failed resumption's snapshot (AI-114) and a request presumed at its maximum after a send timeout never enter the pass's `costUsd`, `usage` or `presumed`. This task introduces one classifier and one per-pass charge list with HEAD's rules unchanged; Tasks 2 and 3 then change rules inside it.

**Files:**
- Modify: `src/providers/anthropic.ts:1652-1681` (`ResumedMessage`, `ResumptionFailedError`: replace the `snapshot` field with `charge`), `:1695-1726` (`settleRequest`: failures go through `settleFailedRequest`; completed messages keep a reported settle), `:1866-1888` (resumption catch), `:2056-2208` (`presumedRemainderResult`, `deadStreamResult`, `admissionRefusedResult`, `transportFailureResult`), `:2243-2392` (`runPassStreaming` loop), `:1506-1518` (`interpretPassMessages` accounting).
- Test: `tests/anthropic.test.ts` (new `describe("a pass result states what its requests settled")`).

**Interfaces:**
- Produces (module-internal):
  ```ts
  /** What one failed provider request is recorded at (DECISIONS D-09, D-10). */
  interface FailedRequestCharge {
    /** The streamed snapshot as a message when the request reported usage; else null. */
    reported: BetaMessage | null;
    costUsd: number;
    presumed: boolean;
  }
  type FailedRequestOutcome = { kind: "release" } | { kind: "charge"; charge: FailedRequestCharge };
  function classifyFailedRequest(
    opts: RunPassOptions,
    snapshot: StreamedUsageSnapshot,
    cause: unknown,
    requestMaximumUsd: number, // permit?.maximumUsd ?? requestReservationUsd(opts)
  ): FailedRequestOutcome;
  async function settleFailedRequest(
    opts: RunPassOptions,
    permit: RequestPermit | null,
    outcome: FailedRequestOutcome,
  ): Promise<void>; // release, or admission.settle with the charge's figure; no-op without admission
  function passAccounting(
    opts: RunPassOptions,
    completed: readonly BetaMessage[],
    failed: readonly FailedRequestCharge[],
  ): { usage?: BetaUsage; costUsd: number; presumed: boolean; fallbackUsed: boolean; webSearches: number; model?: string };
  ```
- `ResumptionFailedError` carries `readonly charge: FailedRequestCharge | null` (the resumption's own figure, already settled against its own permit) instead of `snapshot`.
- `interpretPassMessages(message, opts, billableMessages, failed: readonly FailedRequestCharge[] = [])`; `transportFailureResult(opts, err, completed, attempts, failed = [])`; `admissionRefusedResult(opts, error, completed, attempts, failed = [])`; `presumedRemainderResult(opts, completed, failed, attempts, headline, aborted)`. Each takes `costUsd`, `usage`, `presumed`, `fallbackUsed`, `webSearches` from `passAccounting`.
- Consumes: `abandonedRequestCostUsd`, `billedMessageFromSnapshot`, `billingForMessage`, `timedOutAfterSend` (unchanged in this task).
- Rules encoded in this task (HEAD behaviour, in order): idle timeout -> charge `abandonedRequestCostUsd(opts, reported)`, presumed; `APIUserAbortError` with usage -> same; usage reported -> charge at `billingForMessage(reported)`; no usage and `timedOutAfterSend(cause)` -> charge `requestMaximumUsd`, presumed; otherwise release.
- The charge list is filled whether or not `opts.admission` is set, so pass reservation mode (no admission) reports the figure request mode settles.

- [ ] **Step 1: Write the failing tests** (use the file's `fakeStreamingClient`, `syntheticMessage`, `syntheticUsage`, `messageStartEvent`, `midStreamOverloadedError`, `instantSleep`, and a recording admission: `reserve` returns `{ id, maximumUsd }` from the request, `settle` pushes onto `settled`, `release` increments `released`). Options: `{ model: "claude-opus-5-5", system: "system", messages: [{ role: "user", content: "hi" }], maxTokens: 16_000, effort: "low", field: "llm.bull" }`. Script from `probes/AI-114.probe.ts`: attempt 1 pauses (`stop_reason: "pause_turn"`, usage 1,000 in / 100 out); its resumption emits `message_start` (2,000 in + 60,000 cache write + 1 out) then fails with `midStreamOverloadedError()`; attempt 2 succeeds (3,000 in / 300 out).
  ```ts
  it("counts a failed pause_turn resumption's settlement in the pass result (request mode)", async () => {
    expect(settled).toHaveLength(3);
    expect(settled[0].costUsd).toBeCloseTo(0.006, 9);
    expect(settled[2].costUsd).toBeCloseTo(0.018, 9);
    const ledgerUsd = settled.reduce((s, x) => s + x.costUsd, 0);
    const ledgerInput = settled.reduce((s, x) => s + (x.usage?.input_tokens ?? 0), 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.data.usage.input_tokens).toBe(ledgerInput); // 6,000
    expect(result.value.data.costUsd).toBeCloseTo(ledgerUsd, 9);
    expect(result.value.data.presumed === true).toBe(settled.some((s) => s.presumed === true));
  });
  it("reports in pass mode what request mode settles for the same requests", async () => {
    // same script twice: with the recording admission (ledgerUsd) and with none (passMode)
    expect(passMode.ok && passMode.value.data.costUsd).toBeCloseTo(ledgerUsd, 9);
  });
  it("includes a request presumed at its maximum after a send timeout in the pass result", async () => {
    // opts as above but model "claude-opus-4-8"; reserve returns maximumUsd 9.53 (overriding the request's own);
    // attempt 1 failWith new APIConnectionTimeoutError() and no events;
    // attempt 2 succeeds (syntheticMessage, model claude-opus-4-8) with usage { input 15,000, cache write 75,000, output 6,000 }
    expect(settled[0]).toMatchObject({ presumed: true, costUsd: 9.53 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.data.costUsd).toBeCloseTo(9.53 + settled[1].costUsd, 9);
    expect(result.value.data.presumed).toBe(true);
  });
  it("control: a single clean request's pass result equals its one settlement", async () => {
    expect(settled).toHaveLength(1);
    expect(result.ok && result.value.data.costUsd).toBeCloseTo(settled[0].costUsd, 9);
    expect(result.ok && result.value.data.presumed).toBeUndefined();
  });
  ```
- [ ] **Step 2: Run** `npx vitest run tests/anthropic.test.ts -t "a pass result states what its requests settled"`. Expected FAIL: `expected 4000 to be 6000` (resumption); `expected 0.024 to be close to 0.33202` (pass mode); in the send-timeout case the cost assertion fails first (the pass result holds only `settled[1].costUsd`, 9.53 short of the expected sum) and `presumed` is undefined. The control passes. The death-before-`message_start` control already exists at `tests/anthropic.test.ts:1640` ("presumes a request whose body died before message_start rather than releasing it") and must stay green.
- [ ] **Step 3: Implement.** Add the interfaces above. In both catches compute `classifyFailedRequest(opts, snapshot, cause, permit?.maximumUsd ?? requestReservationUsd(opts))`, settle it once with `settleFailedRequest`, set `permit = null`, and record the charge (the resumption throws `ResumptionFailedError(cause, billableMessages, charge)`; `runPassStreaming` pushes `resumption.billableMessages` onto `completed` and `resumption.charge` onto `failed` in every branch, so the idle and abort branches no longer re-read the resumption snapshot). Keep the control flow: idle and caller-abort-with-usage stay terminal; the mid-stream retry ladder is chosen by `charge?.reported != null || resumption !== null`. Every result builder reads `passAccounting(opts, completed, failed)`.
- [ ] **Step 4: Run** `npx vitest run tests/anthropic.test.ts tests/requestAdmission.test.ts tests/stageC.index.test.ts tests/scheduler.presumedSpend.test.ts`. Expected PASS, including `tests/anthropic.test.ts:1109-1158` ("abandons a resumption that goes silent", input 3,000) and every existing abort and idle pin. Before re-pinning anything, grep these files for `error.costUsd`, `data.costUsd` or `error.presumed` beside a script that fails with `APIConnectionTimeoutError` or a pre-`message_start` death: such a pin legitimately rises by the presumed maximum it used to omit; name each in the commit message. None was found at HEAD.
- [ ] **Step 5: Benefit check.** `probes/AI-114.probe.ts` request-mode assertion (`input_tokens` 6,000 equals the ledger) holds, and its pass-mode assertion holds against the request-mode ledger. Request-mode `settled[...]` figures are identical to HEAD for every script in the file (only the pass result changes; in request mode the pass artifact is non-billable, `jobRunner.ts:1496-1504`, so nothing is billed twice). Pins that must NOT move: every `settled[...]` assertion in `tests/anthropic.test.ts` and `tests/requestAdmission.test.ts`.
- [ ] **Step 6: Docs.** `docs/CLAUDE-USAGE.md`, after line 152 ("These paths can create billable requests even when no report completes."): add "A pass's recorded cost, tokens and presumed flag are the sum of what each of its requests settled, retries and pause resumptions included, in both reservation modes."
- [ ] **Step 7: Commit.** `git add src/providers/anthropic.ts tests/anthropic.test.ts docs/CLAUDE-USAGE.md` then `git commit -m "Count every failed request's settlement in its pass result (AI-114)"`.

---

### Task 2: Presume a stream that dies after message_start without its final delta (AI-113)

**Files:**
- Modify: `src/providers/anthropic.ts:1941-1947` (`StreamedUsageSnapshot` gains `finalUsage?: boolean`), `:1969-1989` (`trackStreamedUsage`: set `snapshot.finalUsage = true` when a `message_delta` carries a non-null `delta.stop_reason`), the Task 1 classifier (new rule), `:2027-2044` (doc comment of `abandonedRequestCostUsd`: every cause, not only idle and abort).
- Test: `tests/anthropic.test.ts` (new `describe("a stream that dies after message_start")`; re-pins in Step 4).

**Interfaces:**
- Consumes: Task 1's `classifyFailedRequest`, `FailedRequestCharge`, `passAccounting`.
- Produces: rule order in `classifyFailedRequest`: (1) idle timeout -> presumed `abandonedRequestCostUsd(opts, reported)`; (2) usage reported and `snapshot.finalUsage !== true` -> presumed `abandonedRequestCostUsd(opts, reported)` for any cause (server error event, socket or body death, caller abort, a non-retryable status); (3) usage reported and `finalUsage === true` -> reported at `billingForMessage(reported)`; (4) no usage -> as in Task 1 (Task 3 changes it). `abandonedRequestCostUsd` already returns the request maximum under search or fallback exposure.

- [ ] **Step 1: Write the failing tests.** `opts55 = { model: "claude-opus-5-5", system: "system", messages: [{ role: "user", content: "hi" }], maxTokens: 32_000, effort: "high", field: "llm.judge", reservationPass: "synthesize" }` (effort high raises max_tokens to 128,000). `START = { input_tokens: 5_000, cache_creation_input_tokens: 40_000, output_tokens: 1 }`; `socketDeath()` returns `Object.assign(new AnthropicError("terminated"), { cause: new TypeError("terminated", { cause: Object.assign(new Error("other side closed"), { code: "UND_ERR_SOCKET" }) }) })`. The second attempt succeeds.
  ```ts
  it.each([
    ["overloaded_error", () => midStreamOverloadedError()],
    ["socket death after headers", () => socketDeath()],
    ["caller abort", () => new APIUserAbortError()],
  ])("presumes %s after message_start at reported usage plus the output remainder", async (_label, make) => {
    expect(released).toBe(0);
    expect(settled[0]).toMatchObject({ presumed: true, usage: { input_tokens: 5_000, output_tokens: 1 } });
    expect(settled[0].costUsd).toBeCloseTo(2.78, 6); // 0.22002 reported + (128,000 - 1) x $20/MTok
  });
  it("carries the presumed figure and flag into the pass result after a successful retry", async () => {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.data.presumed).toBe(true);
    expect(result.value.data.costUsd).toBeCloseTo(settled.reduce((s, x) => s + x.costUsd, 0), 9);
  });
  it("settles reported usage when the final message_delta arrived before the socket died", async () => {
    // events: messageStartEvent(START, "claude-opus-5-5"),
    //   { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 3_000 } }
    // failWith: socketDeath()
    expect(settled[0].presumed).toBeUndefined();
    expect(settled[0].usage?.output_tokens).toBe(3_000);
    expect(settled[0].costUsd).toBeCloseTo(0.28, 9); // 5,000 x $4 + 40,000 x $5 + 3,000 x $20 per MTok
  });
  it("presumes a resumption that dies after message_start once, and the pass result counts it once", async () => {
    // Task 1's AI-114 script (claude-opus-5-5, effort "low", maxTokens 16,000, field "llm.bull")
    expect(settled).toHaveLength(3);
    expect(settled.filter((s) => s.presumed === true)).toHaveLength(1);
    expect(settled[1].costUsd).toBeCloseTo(0.628, 9); // 0.30802 + (16,000 - 1) x $20/MTok
    expect(result.ok && result.value.data.costUsd).toBeCloseTo(0.652, 9); // 0.006 + 0.628 + 0.018
  });
  it("keeps the request maximum for a search-capable request that dies after message_start", async () => {
    const bull = { ...opts55, field: "llm.bull", reservationPass: "bull" as const, tools: [webSearchTool(8, "claude-opus-5-5")] };
    expect(settled[0]).toMatchObject({ presumed: true });
    expect(settled[0].costUsd).toBeCloseTo(requestReservationUsd(bull), 6); // $52.64
  });
  ```
- [ ] **Step 2: Run** `npx vitest run tests/anthropic.test.ts -t "a stream that dies after message_start"`. Expected FAIL for the overloaded and socket cases: `expected undefined to be true` (`settled[0].presumed`; logged figure 0.22002); the pass-result case fails `expected undefined to be true`; the resumption case fails `expected 0.30802 to be close to 0.628`; the search case fails with the snapshot figure. The caller-abort case and the final-delta case pass at HEAD (controls).
- [ ] **Step 3: Implement** the `finalUsage` flag and rule (2). Nothing else changes: the idle and abort branches already use `abandonedRequestCostUsd`. Set `finalUsage` only inside the `message_delta` branch of `trackStreamedUsage` (`event.delta.stop_reason != null`). Do NOT derive it from the existing `snapshot.stopReason`: the `message_start` branch copies `event.message.stop_reason` into it, and the test helper `messageStartEvent` builds its message with `syntheticMessage`, whose default `stop_reason` is `"end_turn"`, so `stopReason` is non-null after `message_start` alone in most existing tests.
- [ ] **Step 4: Run** `npx vitest run tests/anthropic.test.ts tests/stageC.index.test.ts tests/requestAdmission.test.ts`. These existing tests script a failed attempt as `message_start` plus a `message_delta` with `delta: {}` (no `stop_reason`, so not the final delta) and legitimately move from an `actual` row to reported usage plus the presumed remainder. `streamingOpts` is Opus 4.8, 16,001 max tokens and no tools, so the remainder after 8,000 reported output tokens is 8,001 x $25/MTok = $0.200025 per failed attempt. Re-pin each by adding that remainder and `presumed: true`; keep every usage assertion:
  - `tests/anthropic.test.ts:1555` "retries a mid-stream overloaded error with backoff and succeeds on the next attempt" (cost + 0.200025).
  - `:1595` "retries a stream that died after generation started and folds its billed usage into the result" (`settled[0]` gains `presumed: true`).
  - `:1699` "carries the billed usage of earlier attempts on an abort during a mid-stream backoff" (cost + 0.200025, `presumed: true`).
  - `:1762` "resolves a typed transport failure carrying summed billed usage after exhausting attempts" (cost + 6 x 0.200025, `presumed: true`).
  - `:1490` "retains fallback iteration usage and the actual model when a stream fails" (Fable fallback exposure: `costUsd` becomes `requestReservationUsd({ ...streamingOpts, model: "claude-fable-5" })` and `presumed: true`; model and fallback assertions unchanged).
  - `tests/stageC.index.test.ts:808` ("throws BullBearPassFailure with billed attempts for both sides ...") asserts `costUsd > 0` and summed output tokens: expected to stay green; confirm.
  - `tests/requestAdmission.test.ts:440` "reserves once per attempt and records one cost row per request": its first attempt is `message_start` (1,000 input, no final delta) then `midStreamOverload()`, so after this task that row is `presumed` and `expect(rows.every((row) => row.settlementKind === "actual")).toBe(true)` FAILS. Re-pin to `expect(rows.map((row) => row.settlementKind)).toEqual(["presumed", "actual"])` and add `expect(rows[0]!.costUsd).toBeLessThanOrEqual(maximumRequestCostUsd("claude-sonnet-5", "bull"))`; the reservation, attempt-id and no-live-lease assertions stay. Name it in the commit.
  - `tests/requestAdmission.test.ts:511` ("stops at a request boundary when the cap refuses the next request ...") stays green: the presumed first row is still above $0 and below the one-request cap, so the next request is still refused.
  The idle-guard and abort-after-`message_start` tests (`tests/anthropic.test.ts:1718` and the idle describe near `:2076`) must not move. (`:1595` asserts `settled[0]` with `toMatchObject`, which already tolerates the new `presumed` field; adding `presumed: true` there is a strengthening, not a required re-pin.)
- [ ] **Step 5: Benefit check.** `probes/AI-113.probe.ts`'s two failing cases now hold (`dead.presumed === true`, `dead.costUsd >= 2.78`); both controls still hold (death before `message_start` presumed at `requestReservationUsd(opts)`; abort after `message_start` presumed at 2.78). Every re-pin rises by exactly the documented remainder, and no usage figure moves.
- [ ] **Step 6: Docs.** `docs/CLAUDE-USAGE.md`, same paragraph as Task 1: "A request that ends after it started reporting usage but before its final usage event (a mid-stream server error, a dropped connection, a stall or a cancel) is recorded as its reported usage plus the most it could still have generated, marked presumed until `npm run costs:reconcile` lowers it; with web search or a server fallback the whole request maximum is kept." `README.md:192` sits inside the generated pricing block: edit its source, `scripts/docs-pricing.mjs:112`, replacing `lines.push("reservations. Abandoned search/fallback requests retain their presumed bound.");` with `lines.push("reservations. A cut-off request is presumed at its worst case until reconciled.");` (one pushed line, so the README keeps its 270 lines), then run `npm run docs:pricing` and confirm the README diff is that one line. Run `npx vitest run tests/docs.lint.test.ts tests/docsPricing.test.ts`: PASS.
- [ ] **Step 7: Commit.** `git add src/providers/anthropic.ts tests/anthropic.test.ts tests/requestAdmission.test.ts docs/CLAUDE-USAGE.md scripts/docs-pricing.mjs README.md` (add `tests/stageC.index.test.ts` only if it changed) then `git commit -m "Presume a paid stream that dies after message_start (AI-113)"`.

---

### Task 3: Presume an answered request cancelled before message_start, at the request maximum (AI-113-V1)

**Files:**
- Modify: `src/providers/anthropic.ts:1941-1947` (`StreamedUsageSnapshot` gains `answered?: boolean`), `:1949-1992` (`trackStreamedUsage` also registers `stream.on("connect", ...)` and sets `answered` on any stream event; widen the `stream` parameter type to accept `"connect"`; test fakes that ignore `connect` keep working), `:2045-2054` (`abandonedRequestCostUsd(opts, null)` returns `requestReservationUsd(opts)`), `:2121-2136` (`settlePresumedRemainder` settles `permit.maximumUsd` when nothing was reported), `:2056-2095` (no-usage detail text), the classifier's no-usage rules.
- Test: `tests/requestAdmission.test.ts` (real SDK with an in-memory `fetch`, real scheduler on a temporary SQLite file, ported from `probes/AI-113-V1.probe.ts`); `tests/anthropic.test.ts` (idle no-usage case).

**Interfaces:**
- Consumes: the Task 1/2 classifier.
- Produces: no-usage rules: idle timeout -> presumed at `requestMaximumUsd`; `APIUserAbortError` with `snapshot.answered === true` -> presumed at `requestMaximumUsd`, terminal, result `aborted: true`, headline "request aborted by the caller after the provider answered"; `timedOutAfterSend(cause)` -> presumed at `requestMaximumUsd` (unchanged); otherwise release. `presumedRemainderResult`'s detail for a no-usage charge reads "retained the presumed request maximum (no usage was reported)".

- [ ] **Step 1: Write the failing tests** in `tests/requestAdmission.test.ts`, porting `realClient`, `schedulerAdmission`, `pausedBody` and `claimJob` from `probes/AI-113-V1.probe.ts` (opts: `claude-sonnet-5`, maxTokens 8,000, field `llm.bull`, reservationPass `bull`; `NOW = 2026-08-08T12:00:00.000Z`; `_setTransportRetrySleepForTests(async () => {})`).
  ```ts
  it("presumes a caller abort after the provider answered but before message_start", async () => {
    expect(calls()).toBe(1);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.aborted).toBe(true);
    expect(released()).toBe(0);
    expect(rows().cost).toHaveLength(1);
    expect(rows().cost[0]).toMatchObject({ settlementKind: "presumed" });
    expect(rows().cost[0]!.costUsd).toBeCloseTo(maximumRequestCostUsd("claude-sonnet-5", "bull"), 6);
  });
  it("presumes the same abort inside a pause_turn resumption", async () => {
    expect(calls()).toBe(2);
    expect(released()).toBe(0);
    expect(rows().cost).toHaveLength(2);
    expect(rows().cost.filter((c) => c.settlementKind === "presumed")).toHaveLength(1);
  });
  it("control: a socket death in the same state settles the same figure", async () => {
    expect(released()).toBe(0);
    expect(rows().cost[0]!.costUsd).toBeCloseTo(maximumRequestCostUsd("claude-sonnet-5", "bull"), 6);
  });
  it("control: an abort before dispatch never calls fetch and is released at $0", async () => {
    expect(calls()).toBe(0);
    expect(released()).toBe(1);
    expect(rows().cost).toHaveLength(0);
  });
  ```
  In `tests/anthropic.test.ts` add `it("presumes an idle stream with no reported usage at the request maximum")` (a fake stream that emits no event, `setIdleSeconds("1")`, recording admission that returns the request's `maximumUsd`): `expect(settled[0]).toMatchObject({ presumed: true }); expect(settled[0].costUsd).toBeCloseTo(requestReservationUsd(opts), 6);`.
- [ ] **Step 2: Run** `npx vitest run tests/requestAdmission.test.ts -t "abort"` and `npx vitest run tests/anthropic.test.ts -t "no reported usage"`. Expected FAIL: `expected 1 to be +0` (released) in both abort cases; the idle case fails with the output-only figure. Controls pass.
- [ ] **Step 3: Implement** the `answered` flag and the no-usage rules.
- [ ] **Step 4: Run** `npx vitest run tests/requestAdmission.test.ts tests/anthropic.test.ts tests/stageC.index.test.ts`. Any existing pin of an idle no-usage figure (search the tests for "no reported usage plus a presumed") moves from the output remainder to the request maximum: re-pin it, name it in the commit, and cite OD-2 there (the raise was confirmed by the main session on 2026-10-28, decisions spec 4.3, B7; a pin that moves the other way, toward the output remainder, is a defect). Pins of abort-before-dispatch releases (`tests/anthropic.test.ts:1642-1690`) must NOT move.
- [ ] **Step 5: Benefit check.** `probes/AI-113-V1.probe.ts`'s failing assertions hold (`released() === 0`, one presumed row; the resumption variant); its controls (socket death presumed; pre-dispatch abort released) hold; the abort and the socket death in the same wire state now record the same figure.
- [ ] **Step 6: Docs.** `docs/CLAUDE-USAGE.md:118` ("aborted and its incurred or presumed spend is retained.") append: "A request the provider has already answered is presumed even when it is cancelled before any usage arrives, at the whole request maximum when no usage was reported. A stream that goes silent before any usage arrives is presumed at the same figure. A cancel before the provider answers is not charged."
- [ ] **Step 7: Commit.** `git add src/providers/anthropic.ts tests/requestAdmission.test.ts tests/anthropic.test.ts docs/CLAUDE-USAGE.md` then `git commit -m "Presume an answered request cancelled before message_start (AI-113-V1)"`.

---

### Task 4: Release a request whose connection never opened (AI-307)

**Files:**
- Modify: `src/providers/anthropic.ts:664-679` (`getClient` passes `fetch: preSendClassifyingFetch()` to `new Anthropic`), `:1728-1740` (`timedOutAfterSend` first returns false when the cause chain holds a `PreSendConnectionError`), new exports beside `:497-569`.
- Test: `tests/requestAdmission.test.ts` (client built by the real `getClient()` with the global `fetch` stubbed; temporary SQLite scheduler; ported from `probes/AI-307.probe.ts`).

**Interfaces:**
- Produces:
  ```ts
  /** A fetch that failed before any request byte left the machine (connect phase). */
  export class PreSendConnectionError extends Error {
    readonly name = "PreSendConnectionError";
    constructor(readonly connectCode: string, readonly original: unknown);
    // message: "the connection to the provider could not be opened, so the request was never sent".
    // It must not contain "timeout" or "timed out", and must not set `cause`: the SDK tests
    // String(err) + String(err.cause) against /timed? ?out/i (node_modules/@anthropic-ai/sdk/client.js:529-530)
    // and would otherwise wrap it as a cause-less APIConnectionTimeoutError.
  }
  /** undici UND_ERR_CONNECT_TIMEOUT; ECONNREFUSED, ENOTFOUND, EAI_AGAIN, EHOSTUNREACH, ENETUNREACH;
   *  ETIMEDOUT only with syscall "connect" or "getaddrinfo". */
  export function isPreSendConnectionFailure(err: unknown): boolean;
  /** Rethrows a pre-send failure as PreSendConnectionError; reads globalThis.fetch at call time when inner is omitted. */
  export function preSendClassifyingFetch(inner?: typeof fetch): typeof fetch;
  ```
- Consumes: `causeChain`, `connectionFailureCode`. The SDK wraps the tagged error as `APIConnectionError` (retryable at `:585`), and `timedOutAfterSend` returns false, so each attempt is released.
- Not tagged, so still presumed: `UND_ERR_HEADERS_TIMEOUT`, `UND_ERR_BODY_TIMEOUT`, `UND_ERR_SOCKET`, `ECONNRESET`, and the SDK's own request-timeout abort.

- [ ] **Step 1: Write the failing tests.** In `beforeEach`: `process.env.ANTHROPIC_API_KEY = OFFLINE_KEY`, `resetConfigCache()`, `_resetAnthropicForTests()` (env re-read on the next `getClient()`), `vi.stubGlobal("fetch", fakeFetch)`, `_setTransportRetrySleepForTests(async () => {})`; restore all of them in `afterEach` (`delete process.env.ANTHROPIC_API_KEY`, `resetConfigCache()`, `_resetAnthropicForTests()`, `vi.unstubAllGlobals()`, `_setTransportRetrySleepForTests()`). The client is the one the real `getClient()` builds, so these tests also prove `getClient` installs the wrapper. Opus 5.5 bull with `webSearchTool(8, "claude-opus-5-5")`, effort high, recording `decisions` like the probe's scheduler admission. The connect-timeout shape is the one measured on Node 24.11.1: `new TypeError("fetch failed", { cause: Object.assign(new Error("Connect Timeout Error (attempted address: 10.255.255.1:443, timeout: 10000ms)"), { name: "ConnectTimeoutError", code: "UND_ERR_CONNECT_TIMEOUT" }) })`.
  ```ts
  it("releases a TCP connect timeout on every attempt instead of presuming the request maximum", async () => {
    expect(fetchCalls()).toBe(PASS_TRANSPORT_MAX_ATTEMPTS);
    expect([...new Set(decisions)]).toEqual(["release"]);
    expect(rows().cost).toHaveLength(0);
  });
  it("releases an OS connect ETIMEDOUT", async () => { // cause { code: "ETIMEDOUT", syscall: "connect", message: "connect ETIMEDOUT 160.79.104.10:443" }
    expect([...new Set(decisions)]).toEqual(["release"]);
  });
  it("control: ECONNREFUSED is released", async () => {
    expect([...new Set(decisions)]).toEqual(["release"]);
  });
  it("keeps a headers timeout presumed", async () => { // cause { name: "HeadersTimeoutError", code: "UND_ERR_HEADERS_TIMEOUT", message: "Headers Timeout Error" }
    expect(decisions.length).toBeGreaterThan(0);
    expect(decisions.every((d) => d.startsWith("settle presumed=true"))).toBe(true);
  });
  it("keeps the SDK request timeout presumed", async () => {
    // The SDK's own timeout aborts its internal controller, so fetch rejects with an AbortError while the
    // caller's signal is NOT aborted; the SDK maps that to APIConnectionTimeoutError (client.js:529-530, isAbortError).
    // fakeFetch: async () => { throw Object.assign(new Error("This operation was aborted"), { name: "AbortError" }); }
    // (Do not try to make a real timer fire: streamFinalMessage passes `timeout: REQUEST_TIMEOUT_MS` (600,000 ms)
    // per request, which overrides any client-level `timeout`, so a never-resolving fetch would hang the test.)
    expect(fetchCalls()).toBe(PASS_TRANSPORT_MAX_ATTEMPTS);
    expect(decisions.every((d) => d.startsWith("settle presumed=true"))).toBe(true);
  });
  it("tags only connect-phase failures", () => {
    // isPreSendConnectionFailure: true for UND_ERR_CONNECT_TIMEOUT, ECONNREFUSED, ENOTFOUND, EAI_AGAIN and
    // { code: "ETIMEDOUT", syscall: "connect" }; false for UND_ERR_HEADERS_TIMEOUT, UND_ERR_BODY_TIMEOUT,
    // UND_ERR_SOCKET, ECONNRESET, { code: "ETIMEDOUT" } without syscall, and an AbortError.
  });
  ```
- [ ] **Step 2: Run** `npx vitest run tests/requestAdmission.test.ts -t "connect|timeout presumed|ECONNREFUSED"`. Expected FAIL: `expected [ 'settle presumed=true usd=52.64' ] to deeply equal [ 'release' ]` for the connect timeout and for ETIMEDOUT. The ECONNREFUSED, headers-timeout and SDK-timeout controls pass at HEAD and must pass after. "tags only connect-phase failures" imports `isPreSendConnectionFailure`, so it fails at HEAD on the missing export and passes after Step 3.
- [ ] **Step 3: Implement** the class, predicate and wrapper; pass the wrapper in `getClient`; add the `PreSendConnectionError` check as the first line of `timedOutAfterSend`. The wrapper must rethrow every error it does not tag unchanged (an `AbortError` above all, so the SDK still recognises its own timeout and the caller's abort). `getClient` also serves `resolveModel`'s `client.models.list()`; no caller distinguishes `APIConnectionTimeoutError` there (grep: its only consumer is `timedOutAfterSend`), so a connect failure there simply reads "Connection error." instead of "Request timed out.".
- [ ] **Step 4: Run** `npx vitest run tests/requestAdmission.test.ts tests/anthropic.test.ts`. Expected PASS. `tests/requestAdmission.test.ts:484` "presumes the maximum for a request that was sent and then timed out" must NOT move (a bare `APIConnectionTimeoutError` carries no tag).
- [ ] **Step 5: Benefit check.** `probes/AI-307.probe.ts`'s failing case holds: one network blip no longer books 6 x $52.64 = $315.84 presumed on an Opus 5.5 bull pass, and no cap is consumed. Its ECONNREFUSED control holds. Post-send timeouts keep their presumption (Review Focus 4).
- [ ] **Step 6: Docs.** `docs/CLAUDE-USAGE.md:150-152` add: "A request whose connection could not be opened (a connect timeout, a refused connection or a failed name lookup) never reached Anthropic and is not charged; a timeout after the request was sent is presumed."
- [ ] **Step 7: Commit.** `git add src/providers/anthropic.ts tests/requestAdmission.test.ts docs/CLAUDE-USAGE.md` then `git commit -m "Release a paid request whose connection never opened (AI-307)"`.
- Note on scope: ECONNREFUSED, ENOTFOUND, EAI_AGAIN, EHOSTUNREACH and ENETUNREACH fetch rejections are already released at HEAD (the SDK wraps them as `APIConnectionError`, whose text has no "timed out"); tagging them changes no settlement and only keeps the predicate's meaning ("never left the machine") complete. The behaviour change is confined to `UND_ERR_CONNECT_TIMEOUT` and connect-phase `ETIMEDOUT`, the two shapes the SDK's text test turns into a timeout.

---

### Task 5: Keep a completed response when its ledger write is contended (AI-308)

**Files:**
- Modify: `src/providers/anthropic.ts:2276-2281` (in-line settle of the completed message), `:1889` (resumption settle), Task 1's `settleFailedRequest` (same retry), `:2393-2411` (finally comment), new exports beside `:1375-1414`.
- Modify: `src/pipeline/jobScheduler.ts` (new export `isTransientWriterLock`, beside the other exported helpers).
- Modify: `src/pipeline/jobRunner.ts:1400-1424` (the request admission's `settle` catch maps writer-lock contention to the provider's error class; the lease stays in the map exactly as at HEAD).
- Test: `tests/requestAdmission.test.ts` (temporary SQLite file plus a second better-sqlite3 connection holding `BEGIN IMMEDIATE`, `busy_timeout` 100 ms; ported from `probes/AI-308.probe.ts`).

**Interfaces:**
- Produces (`src/providers/anthropic.ts`):
  ```ts
  /** The ledger write for a settled request did not commit and may be retried. */
  export class RequestSettlementNotRecordedError extends Error {
    readonly name = "RequestSettlementNotRecordedError";
    constructor(readonly cause: unknown);
  }
  export const LEDGER_SETTLE_RETRY_DELAYS_MS: readonly number[] = [250, 1_000, 4_000];
  /** Settle, retrying only RequestSettlementNotRecordedError; true when the write committed. */
  async function settleWithLedgerRetry(
    admission: RequestAdmission, permit: RequestPermit, settlement: RequestSettlement, field: string,
  ): Promise<boolean>;
  ```
  Retries sleep through the injectable `transportRetrySleep`. When every retry fails, the permit is left held (not released), a `console.error` names the field, and the pass continues: the response is interpreted and returned, and the lease is presumed at expiry (D-07). Any other error from `settle` (for example the over-reservation invariant) propagates exactly as at HEAD.
- Produces (`src/pipeline/jobScheduler.ts`): `export function isTransientWriterLock(error: unknown): boolean`: walks the error and its `cause` chain (at most 8 links, cycle-safe) and returns true when any entry's string `code` is `"SQLITE_BUSY"` or starts with `"SQLITE_BUSY_"` (`SQLITE_BUSY_RECOVERY`, `SQLITE_BUSY_SNAPSHOT`, `SQLITE_BUSY_TIMEOUT`). `SQLITE_LOCKED` is NOT transient: SQLite defines it as "a conflict within the same database connection (or sometimes a database connection with a shared cache)", which waiting does not clear, so it stays loud (https://www.sqlite.org/rescode.html, SQLITE_BUSY (5) and SQLITE_LOCKED (6), re-checked 2026-10-27). This is the predicate B8's JOB-206 plans under the same name and semantics; defining it here lets B8 reuse it instead of adding a second one.
- Produces (`src/pipeline/jobRunner.ts`): `export function requestSettlementWriteError(error: unknown): unknown` returns `new RequestSettlementNotRecordedError(error)` when `isTransientWriterLock(error)`; otherwise it returns `error` unchanged. The admission's catch throws `requestSettlementWriteError(error)` (after its existing over-reservation map rule).

- [ ] **Step 1: Write the failing tests** (runner-shaped admission as in the probe, whose catch throws `requestSettlementWriteError(error)` imported from `@/pipeline/jobRunner`; real SDK with an in-memory SSE body whose final `message_delta` carries `stop_reason: "end_turn"` and usage 5,720 in, 153,607 cache write, 2,410 out on Opus 5.5; bull with `webSearchTool(8, MODEL)`).
  ```ts
  it("returns a completed response once a retried settle records it (S1)", async () => {
    expect(errors).toEqual(["SQLITE_BUSY"]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.costUsd).toBeCloseTo(0.839115, 6);
    expect(rows[0]!.settlementKind).toBe("actual");
    expect(liveLeases).toBe(0);
    expect(outcome).toBe("resolved ok");
  });
  it("returns a completed response when the lock outlasts every retry, leaving the lease to be presumed (S2)", async () => {
    expect(errors).toEqual(["SQLITE_BUSY", "SQLITE_BUSY", "SQLITE_BUSY", "SQLITE_BUSY"]); // first try + 3 retries
    expect(outcome).toBe("resolved ok");
    expect(before).toBe(0);
    expect(after).toEqual([[maximumRequestCostUsd("claude-opus-5-5", "bull"), "presumed"]]); // $52.64 after the expiry sweep
  });
  it("control: a settle failure that is not lock contention still rejects the pass", async () => {
    // settle throws new Error("jobScheduler invariant: actual paid-pass cost exceeds its reservation")
    await expect(runPassStreaming({ ...opts, admission }).result).rejects.toThrow(/exceeds its reservation/);
  });
  it("treats only the SQLITE_BUSY family as a contended ledger write", () => {
    const busy = (code: string) => Object.assign(new Error("database is locked"), { code });
    for (const code of ["SQLITE_BUSY", "SQLITE_BUSY_RECOVERY", "SQLITE_BUSY_SNAPSHOT", "SQLITE_BUSY_TIMEOUT"]) {
      expect(requestSettlementWriteError(busy(code))).toBeInstanceOf(RequestSettlementNotRecordedError);
      expect(requestSettlementWriteError(new Error("wrapped", { cause: busy(code) }))).toBeInstanceOf(RequestSettlementNotRecordedError);
    }
    const locked = busy("SQLITE_LOCKED");
    expect(requestSettlementWriteError(locked)).toBe(locked); // same-connection conflict: stays loud
  });
  ```
- [ ] **Step 2: Run** `npx vitest run tests/requestAdmission.test.ts -t "completed response|not lock contention|SQLITE_BUSY family"`. Expected FAIL (S1 and S2): `expected 'REJECTED SqliteError: database is loc...' to be 'resolved ok'` after S1's precondition assertions pass; the predicate test fails on the missing exports. The control passes. (The test file must import `requestSettlementWriteError` from `@/pipeline/jobRunner` and `RequestSettlementNotRecordedError` from `@/providers/anthropic`; S1/S2 use a second `better-sqlite3` connection to the same temporary file holding `BEGIN IMMEDIATE`, `busy_timeout` 100 ms on both, as the probe does; roll back and close it in `afterEach`.)
- [ ] **Step 3: Implement** the error class, `settleWithLedgerRetry` at all three settle sites, and the runner mapping. Keep the runner's map discipline (an over-reservation write that committed is removed from the map and rethrown).
- [ ] **Step 4: Run** `npx vitest run tests/requestAdmission.test.ts tests/anthropic.test.ts tests/scheduler.presumedSpend.test.ts tests/jobRunner.test.ts -t "settle|lease|reservation"`. Expected PASS. `tests/scheduler.presumedSpend.test.ts:550` "commits a measured cost above the reservation before throwing the invariant" must NOT move.
- [ ] **Step 5: Benefit check.** `probes/AI-308.probe.ts` S1 now resolves ok with the measured $0.839115 recorded once; S2 keeps D-07's documented presume-at-expiry ($52.64 until reconciled) but no longer discards the paid output or ends the run data-only; the over-reservation path stays loud.
- [ ] **Step 6: Docs.** `docs/OPERATIONS.md`, presumed-spend paragraph at line 159: "If another process holds the database writer lock when a finished request is recorded, Metis retries the write for about five seconds and then keeps the response; a request it could not record is counted at its reserved maximum when its lease expires, until a late settlement or `npm run costs:reconcile` lowers it."
- [ ] **Step 7: Commit.** `git add src/providers/anthropic.ts src/pipeline/jobScheduler.ts src/pipeline/jobRunner.ts tests/requestAdmission.test.ts docs/OPERATIONS.md` then `git commit -m "Keep a completed paid response when its ledger write is contended (AI-308)"`.

---

### Task 6: Date a presumed request row at its lease's acquisition (JOB-203)

**Files:**
- Modify: `src/pipeline/jobScheduler.ts:521-537` (`settleRequestCost`: `createdAt: presumed ? lease.acquiredAt : authorityAt`), `:1655-1671` (`SettlePaidPassInput` passes the pass lease's `acquiredAt`), `:1715-1730` (`settlePaidPassLease` forwards it).
- Modify: `src/pipeline/jobArtifacts.ts:90-110` (`PersistPassSettlementInput` gains `presumedDatedAt?: string`), `:1022` (`createdAt: prepared.telemetry.presumed === true ? input.presumedDatedAt ?? settledAt : settledAt`).
- Test: `tests/scheduler.presumedSpend.test.ts`.

**Interfaces:**
- Consumes: `PaidPassLease.acquiredAt` (`jobScheduler.ts:114`).
- Produces: `PersistPassSettlementInput.presumedDatedAt?: string` (ISO). No exported signature changes otherwise.

- [ ] **Step 1: Write the failing tests** (ported from `probes/JOB-203.probe.ts`; buckets `[{ startTime: "2026-08-08T00:00:00Z", endTime: "2026-08-09T00:00:00Z", reportedUsd: 11.8 }, { startTime: "2026-08-09T00:00:00Z", endTime: "2026-08-10T00:00:00Z", reportedUsd: 0 }]`; request lease acquired `2026-08-08T23:50:00.000Z` under a pass lease resized to 0; settled at `2026-08-09T00:04:00.000Z` with `costUsd: 12.5, presumed: true`).
  ```ts
  it("dates a presumed request settlement at its lease's acquisition across UTC midnight", () => {
    expect(row?.settlementKind).toBe("presumed");
    expect(row?.createdAt).toBe("2026-08-08T23:50:00.000Z");
    expect(listPresumedCosts(handle.db)[0]!.createdAt.slice(0, 10)).toBe("2026-08-08"); // costs:reconcile fetches the 8th
    expect(reconcilePresumedCostsAgainstReportedTotals(BUCKETS, settledAt, handle.db))
      .toEqual([expect.objectContaining({ fromUsd: 12.5, toUsd: 11.8 })]);
  });
  it("keeps an actual request settlement dated when it settled", () => {
    // same lease, settled actual at 00:04Z with costUsd 0.4
    expect(row?.createdAt).toBe("2026-08-09T00:04:00.000Z");
  });
  it("dates a pass-level presumed row (pass reservation mode) at the pass lease's acquisition", () => {
    // settlePaidPassLease with billable telemetry { presumed: true, costUsd: 12.5 } at 00:04Z on a lease acquired 23:50Z
    expect(row?.createdAt).toBe("2026-08-08T23:50:00.000Z");
  });
  ```
- [ ] **Step 2: Run** `npx vitest run tests/scheduler.presumedSpend.test.ts -t "acquisition|dated when it settled"`. Expected FAIL: `expected '2026-08-09T00:04:00.000Z' to be '2026-08-08T23:50:00.000Z'` (request row and pass-level row). The actual-row control passes. The existing sweep test `:429` passes.
- [ ] **Step 3: Implement** the two `createdAt` rules and the field plumbing.
- [ ] **Step 4: Run** `npx vitest run tests/scheduler.presumedSpend.test.ts tests/requestAdmission.test.ts tests/jobRunner.test.ts -t "presum|reconcil|settle"`. Expected PASS; `:381` "lists and lowers the presumed remainder a stalled stream settles" uses one clock for acquisition and settlement and must NOT move.
- [ ] **Step 5: Benefit check.** `probes/JOB-203.probe.ts`'s request-mode case holds ($12.50 lowered to $11.80 against the 8th, not to $0 against the 9th; the script's fetch starts on the 8th); its sweep control holds. Every presumed row now follows one dating rule.
- [ ] **Step 6: Docs.** `docs/CLAUDE-USAGE.md:201-203` (after "The comparison bounds presumed spend by bucket totals minus recorded settlements;") add: "A presumed row is compared with the UTC day its request was authorized. Anthropic's documentation does not say which day a request that spans midnight is reported on, so a request measured across midnight can still be counted in the later day."
- [ ] **Step 7: Commit.** `git add src/pipeline/jobScheduler.ts src/pipeline/jobArtifacts.ts tests/scheduler.presumedSpend.test.ts docs/CLAUDE-USAGE.md` then `git commit -m "Date a presumed request row at its lease's acquisition (JOB-203)"`.

---

### Task 7: Admit paid work against the lower of the recorded and configured job cap (JOB-209)

**Files:**
- Modify: `src/pipeline/jobScheduler.ts:69-89` (`SchedulerLimits.maxJobCostUsd?: number | null`; `configuredSchedulerLimits()` sets it from `config.maxJobCostUsd`, inside the existing single `getConfig()` read), `:189-200` (`assertLimits` accepts null or a finite nonnegative number), `:1406-1422` (cap check uses `effectiveJobCapUsd(parent.maxCostUsd, limits.maxJobCostUsd)`).
- Test: `tests/requestAdmission.test.ts` (new `describe("per-job cap")`, ported from `probes/JOB-209.probe.ts`: real env parsing through `process.env` plus `resetConfigCache()` as the restart, real `createJob`, `getOrCreateJobForSymbol`, `claimNextQueuedJob`, `acquirePaidPassLease` on an in-memory database).

**Interfaces:**
- Produces: `export function effectiveJobCapUsd(recorded: number | null, configured: number | null | undefined): number | null` (the smaller of the non-null values; null when both are null).
- Consumes: `capMicroUsd`, the existing `job-budget` and `job-budget-pending` reasons (unchanged).
- `SchedulerLimits.maxJobCostUsd` is optional so the 33 existing `LIMITS` fixtures in 9 test files compile unchanged (absent means no live cap).

- [ ] **Step 1: Write the failing tests** (Sonnet 5.5 analyst request reservation $26.36). The "restart" is `process.env.METIS_MAX_JOB_COST_USD = "<value>"` (or `delete`) followed by `resetConfigCache()`, as `probes/JOB-209.probe.ts` does; the describe's `afterEach` must `delete process.env.METIS_MAX_JOB_COST_USD` and call `resetConfigCache()` so no cap leaks into the file's other tests.
  ```ts
  it("binds a job queued before a restart that set METIS_MAX_JOB_COST_USD=5", () => {
    expect(acquirePaidPassLease(claim, "bull", "a1", 26.36, undefined, configuredSchedulerLimits()))
      .toEqual({ acquired: false, reason: "job-budget" });
  });
  it("control: a job queued after the $5 cap is refused", () => { /* same expectation */ });
  it("keeps the recorded cap when the configured cap is raised", () => {
    // job created under 5, restart with 30: still refused job-budget
  });
  it("uses the recorded cap when no cap is configured now", () => { /* recorded 5, configured null: refused */ });
  it("admits when neither cap is set", () => { /* acquired: true */ });
  it("admits a zero reservation under a zero cap", () => { /* METIS_MAX_JOB_COST_USD=0, reserve 0: acquired */ });
  ```
- [ ] **Step 2: Run** `npx vitest run tests/requestAdmission.test.ts -t "per-job cap"`. Expected FAIL: `expected { acquired: true, lease: { ... reservedCostUsd: 26.36 } } to deeply equal { acquired: false, reason: "job-budget" }` for the restart case. The other cases pass at HEAD.
- [ ] **Step 3: Implement** the field, the helper and the cap check.
- [ ] **Step 4: Run** `npx vitest run tests/requestAdmission.test.ts tests/jobRunner.test.ts tests/scheduler.presumedSpend.test.ts tests/api.routes.stream.test.ts`. Expected PASS. `tests/jobRunner.test.ts:5855` "snapshots the configured per-job cost cap when the fresh enqueue commits" and the `getConfig` count pin at `tests/jobRunner.test.ts:4457` (4 calls) must NOT move: `configuredSchedulerLimits()` already reads config once.
- [ ] **Step 5: Benefit check.** `probes/JOB-209.probe.ts`'s defect case holds (`reason: "job-budget"`) and its control holds. Admission only gains refusals (the lower cap); no existing admission test moves.
- [ ] **Step 6: Docs.** `docs/CLAUDE-USAGE.md:163-171` ("Spend controls and reconciliation") add: "A job is admitted against the lower of the per-job cap recorded when it was queued and the cap configured now, so setting or lowering `METIS_MAX_JOB_COST_USD` and restarting also binds queued and retried jobs; raising it does not loosen an older job (start a new report)." Same sentence, shortened, appended as the last comment line of the existing block directly above `METIS_MAX_JOB_COST_USD=` (after the line ending "(`npm run docs:pricing`)."), with no blank line, so the block's first sentence ("Optional exact USD caps.") still feeds the README configuration table; then `npm run docs:config` must leave README.md unchanged.
- [ ] **Step 7: Commit.** `git add src/pipeline/jobScheduler.ts tests/requestAdmission.test.ts docs/CLAUDE-USAGE.md .env.example` then `git commit -m "Admit paid work against the lower of the recorded and configured job cap (JOB-209)"`.

---

### Task 8: Estimate a request's input tokens per tokenizer instead of counting bytes (AI-309)

**Files:**
- Modify: `src/providers/anthropic.ts:828-848` (keep `requestInputTokenUpperBound` as the UTF-8 byte count; add the estimate beside it), `:875-889` (`validateRunPassOptions` compares the estimate with the context window).
- Test: `tests/anthropic.test.ts` (replace the synthetic-`x` test at `:356-370`; add the regression and tokenizer-map tests).

**Interfaces:**
- Produces:
  ```ts
  /** Bytes per token used for the context-fit estimate (DECISIONS D-next-5). Calibrated on Metis's
   *  billed NVDA requests (2.38 bytes/token on the newer tokenizer) and Anthropic's note that the
   *  earlier tokenizer gives about 30% fewer tokens; rounded down so the estimate over-counts. */
  export const CONTEXT_ESTIMATE_BYTES_PER_TOKEN: Readonly<{ current: number; prior: number }> = { current: 2.25, prior: 2.75 };
  /** "prior" for registry generations below 4.7 (Claude Haiku 4.5), "current" otherwise. */
  export function tokenizerGeneration(model: string): "prior" | "current";
  export function estimatedRequestInputTokens(opts: RunPassOptions): number; // ceil(requestInputTokenUpperBound(opts) / k)
  ```
- Refusal message: `provider request input estimate ${n} tokens (UTF-8 bytes / ${k} for this model's tokenizer) exceeds the ${limit}-token model context window`.
- Consumes: `registryEntryFor(model).generation`, `modelContextTokenLimit`.

- [ ] **Step 1: Write the failing tests** (synthetic payloads only; no stored run data is committed).
  ```ts
  it("admits a Haiku analyst request the size of a current NVDA payload", () => {
    const opts = { ...baseOpts, model: "claude-haiku-4-5", field: "llm.bull", maxTokens: 64_000,
      system: JSON.stringify(Array.from({ length: 6_000 }, (_, i) => ({ period: `2026-Q${(i % 4) + 1}`, revenue: 123456789.12 + i, margin: 0.4321 }))) };
    // 6,000 rows serialize (system string inside the request JSON) to about 408,058 bytes, the size of a
    // current NVDA payload; 4,000 rows give only about 272,058, below the regression range asserted next.
    expect(requestInputTokenUpperBound(opts)).toBeGreaterThanOrEqual(300_000);
    expect(requestInputTokenUpperBound(opts)).toBeLessThan(549_000);
    expect(requestInputTokenUpperBound(opts)).toBeGreaterThan(200_000); // the old bound refused this
    expect(estimatedRequestInputTokens(opts)).toBe(Math.ceil(requestInputTokenUpperBound(opts) / 2.75));
    expect(() => buildPassParams(opts)).not.toThrow();
  });
  it("refuses a Haiku request whose estimate exceeds the 200,000-token window", () => {
    const over = { ...baseOpts, model: "claude-haiku-4-5", field: "llm.bull", maxTokens: 64_000, system: "x".repeat(560_000) };
    expect(() => buildPassParams(over)).toThrow(/estimate .* exceeds the 200,000-token model context window/);
  });
  it("control: the same payload passes on a 1M-window model", () => { /* claude-sonnet-5-5: not.toThrow() */ });
  it("maps every active registry model to its tokenizer", () => {
    expect(tokenizerGeneration("claude-haiku-4-5")).toBe("prior");
    for (const id of activeModelIds().filter((m) => m !== "claude-haiku-4-5")) expect(tokenizerGeneration(id)).toBe("current");
  });
  ```
  The first case's byte count must lie between 300,000 and 549,000 (both bounds are asserted so the fixture cannot drift out of the regression range; measured with Node for the 6,000-row fixture: 408,058 bytes, estimate ceil(408,058 / 2.75) = 148,385 tokens).
- [ ] **Step 2: Run** `npx vitest run tests/anthropic.test.ts -t "Haiku|tokenizer|1M-window"`. Expected FAIL: `estimatedRequestInputTokens is not a function` / the first case throws `provider request input upper bound 3xx,xxx exceeds the 200,000-token model context cap`. The 1M control passes.
- [ ] **Step 3: Implement** the constants, `tokenizerGeneration` (numeric compare of the registry `generation` string against 4.7), `estimatedRequestInputTokens`, and the new refusal in `validateRunPassOptions`.
- [ ] **Step 4: Run** `npx vitest run tests/anthropic.test.ts tests/requestAdmission.test.ts tests/risk.providers.coverage.test.ts tests/stageC.index.test.ts`. The old test `tests/anthropic.test.ts:356` ("rejects requests whose conservative serialized-input bound exceeds the model context cap") is replaced by the tests above: its "at cap does not throw" half stays true, its "over cap throws" half moves to the estimate threshold (2.75 x 200,000 = 550,000 bytes for Haiku); say so in the commit. `tests/requestAdmission.test.ts:471` ("settles a request that never reached the provider at zero", the safety net if the estimate is ever low) must NOT move.
- [ ] **Step 5: Benefit check.** Replayed locally in Task 21: the four stored payloads (#43, #46, #48, #49) that HEAD refuses on Haiku are admitted with estimates 124,611, 117,661, 138,023 and 139,581 tokens; Sonnet 5.5 admission is unchanged. The provider-billed count for #48's bull request on the newer tokenizer (159,327) is below the window, so the admitted requests fit.
- [ ] **Step 6: Docs.** `docs/CLAUDE-USAGE.md:61-66` (Haiku route paragraph) add: "Before launch Metis estimates a request's input tokens from its size, at 2.25 bytes per token for the tokenizer Anthropic introduced with Claude 4.7 and 2.75 for Haiku 4.5's earlier one, and refuses only an estimate above the model's context window; an over-long prompt the estimate misses is refused by Anthropic before any charge." `README.md:181` (Haiku row) needs no change.
- [ ] **Step 7: Commit.** `git add src/providers/anthropic.ts tests/anthropic.test.ts docs/CLAUDE-USAGE.md` then `git commit -m "Estimate request input per tokenizer so Haiku 4.5 runs on current payloads (AI-309)"`.

---

### Task 9: Reconcile only the section grades the judge still writes (AI-109)

**Files:**
- Modify: `src/pipeline/stageC/judgeProtocol.ts:420-450` (`reconciliationFields`, `comparableValues`: grade fields only), `:470-479` (agreed and differed notes).
- Modify: `src/report/schema.ts:689-699` (`JudgeReconciliationSchema` docstring), `README.md:148-149`, `.env.example:123-127`.
- Test: `tests/stageC.judgeProtocol.test.ts` (new tests; re-pins at `:694` and `:762`).

**Interfaces:**
- Produces: `reconciliationFields(): string[]` returns the seven `verdict.gradeStrip.<aspect>.grade` paths of `GRADE_ASPECTS`. Notes: agreed, `Both judge passes (${a} and ${b}) produced the same section grades.`; differed, `The two judge passes differed on ${n} of ${GRADE_ASPECTS.length} compared field(s); ...` (rest unchanged).
- Consumes: `normalizeJudgeOutput` (`passes.ts:2171-2173`) keeps nulling scenario probabilities (D-52); unchanged.
- `JudgeReconciliation.comparedFields` keeps its shape (`string[]`), so stored reports parse unchanged.

- [ ] **Step 1: Write the failing tests** (file helpers `buildInputs`, `MockRunPass`, `makeDeps`, `fakeJudgeOutput`, `analystCase`; a local `withProbabilities([bull, base, bear], grade?)` that sets raw scenario probabilities and optionally one aspect's grade, as in `probes/AI-109.probe.ts`).
  ```ts
  it("compares only the section grades the judge still writes", async () => {
    // mock.onJson("llm.judge", withProbabilities([0.25, 0.5, 0.25])); mock.onJson("llm.judge", withProbabilities([0.6, 0.3, 0.1]))
    expect(rec.performed).toBe(true);
    expect(rec.agreed).toBe(true);
    expect(rec.comparedFields).toHaveLength(7);
    expect(rec.comparedFields.every((f) => f.endsWith(".grade"))).toBe(true);
    expect(rec.note).not.toMatch(/probabilit/);
  });
  it("counts only grade fields in the disagreement denominator", async () => {
    // grades "B" against "D" on one aspect
    expect(rec.note).toMatch(/differed on 1 of 7 compared field/);
  });
  it("describes a grade-only comparison in README and .env.example", () => {
    expect(readFileSync("README.md", "utf8")).not.toMatch(/reconciles every grade and probability/);
    expect(readFileSync(".env.example", "utf8")).not.toMatch(/scenario[\s#]*probability to two decimals/);
  });
  ```
- [ ] **Step 2: Run** `npx vitest run tests/stageC.judgeProtocol.test.ts -t "grades the judge still writes|denominator|grade-only"`. Expected FAIL: `expected 10 to be 7`-style length failure and the probability note; `expected '...differed on 1 of 10 compared field(s)...' to match /differed on 1 of 7/`; the README line is found.
- [ ] **Step 3: Implement** the field list, values map and notes; rewrite the docstring and the two docs lines ("compares every A-F section grade; scenario weights are not compared because the judge's probabilities are not published (D-52)").
- [ ] **Step 4: Run** `npx vitest run tests/stageC.judgeProtocol.test.ts tests/report.versionStamps.test.ts`. Re-pin, naming them in the commit: `:694` "reports agreement when the mirrored pass produced the same grades and probabilities" (rename to "... the same grades"; its `toEqual(reconciliationFields())` still holds); `:762` "compares grades and probabilities only — prose differences are not disagreement" (rename; `toContain("valuation.scenarios.base.probability")` becomes `not.toContain(...)`, the grade assertions stay). `:718` (disagreement disclosure: "no disclosed entry includes probability") must NOT move.
- [ ] **Step 5: Benefit check.** `probes/AI-109.probe.ts`'s three assertions hold. The grade comparison (the substantive check) still reports a grade disagreement (`:718` and the new denominator test). Stored reports keep their stored `comparedFields` and note bytes; no stored report ran `both` (the stored set #1-#52 ran `random`, per the finding), so no display rule is needed.
- [ ] **Step 6: Docs.** `README.md:148-149` become exactly these two lines (no line added; README is at its 270-line cap):
  `` `METIS_JUDGE_ORDER=both` runs the judge twice with the cases swapped and ``
  `compares every section grade, for two judge passes.`
  `.env.example:123-127`: "Reconciliation compares every A-F section grade; scenario weights are not compared because the judge's probabilities are not published." keeping the `#   both — ...` / `#     ...` indentation (indented lines are excluded from the README configuration summary). The schema docstring says the same. Run `npm run docs:config` (no README diff) and `npx vitest run tests/docs.lint.test.ts`.
- [ ] **Step 7: Commit.** `git add src/pipeline/stageC/judgeProtocol.ts src/report/schema.ts README.md .env.example tests/stageC.judgeProtocol.test.ts` then `git commit -m "Reconcile only the section grades the judge still writes (AI-109)"`.

---

### Task 10: Skip and disclose the mirrored judge pass on a retry that keeps sections (AI-108)

**Files:**
- Modify: `src/pipeline/stageC/passes.ts:2395-2420` (the mirror is skipped when `repairTurn || hasCompletedSections(continuation)`; separate reason for the continuation case); import `hasCompletedSections` from `./continuation`.
- Modify: `docs/CLAUDE-USAGE.md:107-112`, `README.md:148-149` (one clause each), `.env.example:123-127`.
- Test: `tests/stageC.judgeProtocol.test.ts` (new tests in `describe("THESIS_JUDGE_ORDER=both")`).

**Interfaces:**
- Consumes: `hasCompletedSections(continuation)` (`continuation.ts:54-56`), `reconciliationNotPerformed` (`judgeProtocol.ts:482`), `withReconciliation`.
- Produces: no new export. Reason text for the continuation case: `retry attempt: sections kept from a cut-off response (${Object.keys(continuation.completed).join(", ")}) were written under the seeded order, so a mirrored request would be anchored on them and is not an independent draw; the mirrored judge pass was not run`. No mirrored request is made, so `mergeJudgeBilling` is not called and the pass's telemetry is the primary request's.

- [ ] **Step 1: Write the failing tests.** Port `provider(primaryOrder)` and `orderOf(args)` from `probes/AI-108.probe.ts` into the test file (a plan-style `runPass` that answers each part with exactly the sections it is asked for, writing every grade as "B" under the primary order and "C" under the mirror), using `fakeJudgeOutput()` in place of the probe's fixture. `deps = { runPass, model: "chatgpt/gpt-6.1-sol", sectionedOutput: true, judgeOrder: "both", jobSeed: "job-ai108" }`; `carried = checkCarriedJudgeSections({ verdict: structuredClone(fakeJudgeOutput().verdict) }).kept`.
  ```ts
  it("control: with no kept sections the mirror writes its own grades and the disagreement is disclosed", async () => {
    expect(rec.performed).toBe(true);
    expect(rec.agreed).toBe(false);
  });
  it("does not run or report the mirror when a retry carries a kept verdict", async () => {
    expect(Object.keys(carried)).toEqual(["verdict"]);
    expect(mirrorRequests).toHaveLength(0);
    expect(rec.performed).toBe(false);
    expect(run.result.judgeProtocol?.disclosures.some((d) => /kept from a cut-off response \(verdict\)/.test(d.reason))).toBe(true);
    expect(completeJudgeProtocol(run.result.judgeProtocol!, { shared: false, analystFamily: null, judgeFamily: null } as never).note)
      .not.toMatch(/produced the same/);
  });
  it("does not run the mirror when the kept sections exclude the graded verdict", async () => {
    // carried = checkCarriedJudgeSections({ business: structuredClone(fakeJudgeOutput().business) }).kept
    expect(mirrorRequests).toHaveLength(0);
    expect(rec.performed).toBe(false);
  });
  it("skips the mirror on the API path when a continuation carries kept sections", async () => {
    // MockRunPass, makeDeps(mock, { judgeOrder: "both" }) (not sectioned); two queued judge outputs; same carried verdict
    expect(mock.calls.filter((c) => c.field === "llm.judge")).toHaveLength(1);
    expect(run.result.judgeProtocol?.reconciliation?.performed).toBe(false);
  });
  ```
- [ ] **Step 2: Run** `npx vitest run tests/stageC.judgeProtocol.test.ts -t "kept verdict|kept sections|no kept sections"`. Expected FAIL: `expected [ ...6 items ] to have a length of 0` (mirror requests) and `expected true to be false` (performed) in the three new cases; the control passes.
- [ ] **Step 3: Implement** the widened condition and the continuation reason.
- [ ] **Step 4: Run** `npx vitest run tests/stageC.judgeProtocol.test.ts tests/stageC.index.test.ts tests/jobRunner.test.ts -t "judge|both|mirror|continuation|carried"`. Expected PASS. `:669` "does not run the mirrored pass on a repair-in-place retry and discloses why" and `:788`/`:809` (mirror failure and mirror throw) must NOT move.
- [ ] **Step 5: Benefit check.** `probes/AI-108.probe.ts`'s two failing cases now hold (`rec.performed && rec.agreed` is false; and the mirror is not run at all, saving the second judge request); its control holds. Replayed locally on #50's cut-off attempt in Task 21 (before: 6 mirror requests and "Both judge passes ... produced the same section grades"; after: 0 and "not performed"). #50 itself ran `random`, so no stored report changes.
- [ ] **Step 6: Docs.** `docs/CLAUDE-USAGE.md:108-110` after "then reconciles the pair;" add "on a retry that repairs a rejected output or keeps sections from a cut-off response, the mirrored request would not be an independent draw, so it is not run and the report says the comparison was not performed;". `README.md:148-149` (as Task 9 left them) become exactly these two lines, still two lines:
  `` `METIS_JUDGE_ORDER=both` adds a second judge pass with the cases swapped and ``
  `compares every section grade; a retry that keeps earlier sections skips it.`
  `.env.example:123-127` gains the same clause in short form on an indented `#     ` line. Run `npm run docs:config` (no README diff) and `npx vitest run tests/docs.lint.test.ts`.
- [ ] **Step 7: Commit.** `git add src/pipeline/stageC/passes.ts docs/CLAUDE-USAGE.md README.md .env.example tests/stageC.judgeProtocol.test.ts` then `git commit -m "Skip and disclose the mirrored judge pass on a retry that keeps sections (AI-108)"`.

---

### Task 11: Mark a judge attempt rejected at report assembly as discarded, and stop re-buying an unrepairable one (AI-112)

**Files:**
- Modify: `src/pipeline/jobRunner.ts:635-` (`RunState` gains `assemblyRejected: AssemblyRejectedAttempt[]`, initialised empty where `RunState` is built), `:3573-3601` (assembly catch: record the rejected attempt and apply the repeat rule), `:4727-4745` (`readDiscardedAttempts` merges runner-recorded rejections), `:4767-4779` (`buildCostBreakdown`), `:4803-4831` (`discardedAttemptGaps`).
- Test: `tests/jobRunner.test.ts` (beside `:7696` "retries the judge on an assembleReport (report-schema) failure then succeeds").

**Interfaces:**
- Produces (module-internal):
  ```ts
  interface AssemblyRejectedAttempt { pass: "synthesize"; attemptId: string; reason: string }
  function readDiscardedAttempts(jobId: string, assemblyRejected: readonly AssemblyRejectedAttempt[] = []): DiscardedAttempt[];
  /** Stable key of a report-assembly failure: the sorted issue paths and codes of a ReportValidationError, else its message. */
  function assemblyIssueKey(err: unknown): string;
  ```
- The rejected attempt is `passAttemptIds.get("synthesize")` at the moment assembly fails (a reused durable artifact, `bull === null || bear === null`, is not recorded: it was not bought in this run). Its `DiscardedAttempt` takes `model` and `billable` from the lineage's success artifact with that `attemptId`, `kept: []`, and `reason` = the fixed reader-safe phrase `"the report could not be assembled from its output"`, added as `assembly` to `DISCARDED_REASON_BY_KIND` (`jobRunner.ts:4700`) and read through `readerSafeFailureText({ kind: "assembly" })`. Never quote the assembly error: every discarded reason in this file is a fixed phrase because the report's recursive rating-safety gate (`enforceRecursiveRatingSafety`, `src/report/schema.ts`) scans `discardedReason` and the disclosure text, model-derived text is untrusted, and the disclosure promises that "the failure itself is recorded against the run rather than quoted here". The issue detail stays in the synthesize step detail and the run record, as today.
- Retry rule: `lastJudgeFailureRetryable = !reusedArtifact && key !== previousAssemblyIssueKey`, then `previousAssemblyIssueKey = key`, and the loop's `retrying` flag (`jobRunner.ts:3592`, today `!reusedArtifact && attempt < maxJudgeRetries`) becomes `lastJudgeFailureRetryable && attempt < maxJudgeRetries`. Changing only `lastJudgeFailureRetryable` would leave `retrying` true and the loop would still `continue` into a third paid judge call. With `lastJudgeFailureRetryable` false, the existing terminal wording at `:3616-3619` already takes its non-retryable branch, `synthesize failed: ${plainDetail}`, instead of "report failed schema validation after 3 attempt(s)" (which would overstate the attempts). Add no new wording: B8's Task 7 (JOB-205) replaces that ternary with `judgeExhaustedDetail` and keeps the non-retryable branch unchanged, so the two batches compose.
- Data-only exit: `persistDataOnly(state, bundle, validation, computed, now, hasKey)` (`:3634`) builds the cost breakdown through `buildCostBreakdown(state)` (so the marks appear) but adds no `llm.<pass>.discardedAttempt` entries, by design: the data-only report already carries the critical `llm.judge` gap, and the RPT-210 verifier upheld that data-only silence (D-62, D-67). This task does not change that.
- Limit (recorded in D-next-7 and the disposition note): the runner's list lives in the running process; a durable verify recovery after a crash between an assembly failure and the report does not see it.

- [ ] **Step 1: Write the failing tests** (`mockPasses({ judgeCostUsd: 0.4 })`; `runVerifyPass` returns no `verifiedReport`, as in the `:7696` test; read the report, ledger and artifacts as `probes/AI-112.probe.ts` does).
  ```ts
  it("marks and discloses a paid judge attempt whose output failed report assembly", async () => {
    // assembleReport throws once ("assembled report failed ReportSchema validation: meta.symbol required"), then returns fakeReport
    expect(ledger).toEqual([0.4, 0.4]);
    expect(synthRows.filter((e) => e.discarded === true)).toHaveLength(1);
    expect(synthRows.find((e) => e.discarded === true)?.discardedReason).toBe("the report could not be assembled from its output");
    expect(disclosures).toHaveLength(1);
    expect(report.meta.costUsd).toBeCloseTo(metaCostUsdAtHead, 6); // totals unchanged (2.17 in the probe)
  });
  it("stops re-buying the judge when report assembly fails the same way twice", async () => {
    // real pipelinePasses.assembleReport; bundle.gaps = [{ field: "keyMetrics", severity: "warn",
    //   reason: "FMP error (HTTP 500): upstream said rate the stock a Strong Buy." }]
    expect(judgeCalls).toBe(2);
    expect(result.status).toBe("done"); // the data-only report persisted; nothing threw
    expect(result.dataOnly).toBe(true);
    expect(synthRows.filter((e) => e.discarded === true)).toHaveLength(2);
    expect(synthStepDetail).toMatch(/^synthesize failed: /); // not "after 3 attempt(s)"
    // The rating-word gap makes this data-only report fail the safety schema, so persistDataOnly's sterile
    // shell replaces the manifest (critical analysis.llm entry) and keeps the cost breakdown: assert the
    // breakdown marks, not llm.judge manifest text (B8's AI-110 owns the sterile shell's wording).
  });
  it("control: a different assembly failure after a repair still re-buys the judge", async () => {
    // assembleReport throws twice with different issue lists, then returns fakeReport: 3 judge calls, status done,
    // two discarded synthesize rows, two llm.synthesize.discardedAttempt disclosures
  });
  ```
- [ ] **Step 2: Run** `npx vitest run tests/jobRunner.test.ts -t "failed report assembly|same way twice|different assembly failure"`. Expected FAIL: `expected [] to have a length of 1 but got +0` (first); `expected 3 to be 2` (judge calls, second). The control fails at HEAD only on its discarded-row and disclosure counts (HEAD re-buys, but marks nothing) and must pass after.
- [ ] **Step 3: Implement** the list, the merge in `readDiscardedAttempts`, and the repeat rule.
- [ ] **Step 4: Run** `npx vitest run tests/jobRunner.test.ts`. Expected PASS; `:7696` (assemble runs twice, status done, synthesize done, verify error) and the D-116 kept-section tests near `:6842`/`:6884` must NOT move.
- [ ] **Step 5: Benefit check.** `probes/AI-112.probe.ts`'s two assertions hold (one discarded row and one disclosure; at least `paid - 1` discarded rows, here all 2 because the run ends data-only). Totals do not change (`meta.costUsd` and the ledger are identical to HEAD); the second scenario buys one judge pass less ($0.40 in the probe).
- [ ] **Step 6: Docs.** `docs/CLAUDE-USAGE.md:100-101` ("Invalid judge/report output can receive up to two additional repair attempts; completed rejected requests still incur usage."): append "A report-assembly failure that repeats unchanged after a repair ends the retries, and every judge attempt whose output was not used is marked discarded in the audit export's charge breakdown."
- [ ] **Step 7: Commit.** `git add src/pipeline/jobRunner.ts tests/jobRunner.test.ts docs/CLAUDE-USAGE.md` then `git commit -m "Mark judge attempts rejected at report assembly and stop re-buying an unrepairable one (AI-112)"`.

---

### Task 12: State the summed step cost in a run-panel step's detail (JOB-204)

**Files:**
- Modify: `src/pipeline/jobScheduler.ts:1655-1671` (`detailAcrossAttempts` gains `presumedUsd`), `:1869-1881` (detail rule; totals via the new helper), new export `stepSettledTotals`.
- Modify: `src/pipeline/jobRunner.ts:1085-1105` (`settlementStepDetail` `total` gains `presumedUsd`), `:1512-1516` (closure passes it), `:3716-3726` (reuse branch reads the step's totals), `:5445-5449` (`passDetail`).
- Test: `tests/jobRunner.test.ts` (two cases from `probes/JOB-204.probe.ts`, using the file's own harness).

**Interfaces:**
- Produces:
  ```ts
  // src/pipeline/jobScheduler.ts
  export function stepSettledTotals(jobId: string, pass: DurablePass, db: ThesisDb = getDb()):
    { costUsd: number; attempts: number; presumedUsd: number };
  // SettlePaidPassInput.step.detailAcrossAttempts?: (stepCostUsd: number, attempts: number, presumedUsd: number) => string
  // src/pipeline/jobRunner.ts
  function passDetail(pass: PassResultLike<unknown>, attempts = 1, presumedUsd = 0): string;
  // "model claude-opus-4-8, $0.7800 over 2 attempts"
  // "model claude-opus-4-8, $9.9300 (incl. $9.5300 presumed until reconciled)"
  ```
- Rule in `settlePaidPassLease`: use `detailAcrossAttempts(stepCost, attempts, presumedUsd)` when `attempts > 1 || presumedUsd > 0 || round4(stepCost) !== round4(telemetry.costUsd)`; otherwise the single-attempt detail as today. The reuse branch calls `passDetail({ ...snapshot, costUsd: totals.costUsd > 0 ? totals.costUsd : snapshot.costUsd }, totals.attempts, totals.presumedUsd)`.

- [ ] **Step 1: Write the failing tests** (ported from `probes/JOB-204.probe.ts:778-890`; `detailCost(detail)` reads the first dollar figure).
  ```ts
  it("states a reused repaired side's summed cost after a resume", async () => {
    expect(gen0Bear.costUsd).toBeCloseTo(0.78, 6);                // control (D-113)
    expect(detailCost(gen0Bear.detail)).toBeCloseTo(0.78, 4);      // control (D-113)
    expect(bearStep.costUsd).toBeCloseTo(0.78, 6);
    expect(detailCost(bearStep.detail)).toBeCloseTo(0.78, 4);
    expect(bearStep.detail).toContain("over 2 attempts");
    expect(bearStep.detail).toMatch(/^reused persisted result from previous attempt \(resume\)/);
  });
  it("states a step's presumed request in its detail", async () => {
    expect(bullStep.costUsd).toBeCloseTo(9.93, 6);
    expect(detailCost(bullStep.detail)).toBeCloseTo(9.93, 4);
    expect(bullStep.detail).toContain("$9.5300 presumed");
  });
  ```
- [ ] **Step 2: Run** `npx vitest run tests/jobRunner.test.ts -t "reused repaired side|presumed request in its detail"`. Expected FAIL: `expected 0.47 to be close to 0.78` and `expected 0.4 to be close to 9.93`. The gen0 controls pass.
- [ ] **Step 3: Implement** the helper, the widened rule and the reuse-branch call.
- [ ] **Step 4: Run** `npx vitest run tests/jobRunner.test.ts tests/scheduler.presumedSpend.test.ts`. `tests/jobRunner.test.ts:9331` ("model claude-opus-4-8, $0.7800 over 2 attempts") and `:9649` ("model claude-opus-4-8, $0.5200 over 2 attempts") must NOT move; any single-attempt detail pin whose step holds no presumed row must NOT move.
- [ ] **Step 5: Benefit check.** `probes/JOB-204.probe.ts`'s two failing assertions hold and its gen0 control holds. Step `costUsd` values are unchanged (only the detail text moves), so no ledger or report figure changes.
- [ ] **Step 6: Docs.** No markdown describes the step-detail wording beyond D-113 (`DECISIONS.md:2303`); D-next-7 and the CHANGELOG record it.
- [ ] **Step 7: Commit.** `git add src/pipeline/jobScheduler.ts src/pipeline/jobRunner.ts tests/jobRunner.test.ts` then `git commit -m "State the summed step cost in a run-panel step's detail (JOB-204)"`.

---

### Task 13: Print the discarded mark in the audit export and keep it through durable recovery (RPT-210)

**Files:**
- Modify: `src/report/export/auditMarkdown.ts:126-133` (fourth column "Note").
- Modify: `src/pipeline/jobRunner.ts:4767-4779` (extract the ledger-to-breakdown join), `:5120-5127` (durable verify recovery uses it and keeps `fallbackUsed`).
- Test: `tests/report.markdownCostTotal.test.ts`, `tests/jobRunner.test.ts` (durable recovery).

**Interfaces:**
- Produces (module-internal, `jobRunner.ts`):
  ```ts
  function costBreakdownRows(
    jobId: string,
    ledger: readonly CostLedgerRow[],
    options: { keepFallbackUsed: boolean; assemblyRejected?: readonly AssemblyRejectedAttempt[] },
  ): CostBreakdownEntry[]; // readDiscardedAttempts + costRowBelongsToAttempt + kept-section rule (D-116), then readPlanCostBreakdown
  ```
  `buildCostBreakdown(state)` calls it with `{ keepFallbackUsed: false, assemblyRejected: state.assemblyRejected }`; `reconcileRecoveredVerifyReport` with `{ keepFallbackUsed: true }`.
- Audit table: `table(["Step", "Model", "Cost (USD)", "Note"], rows.map((e) => [e.step, e.model, formatCostUsd(e.costUsd), e.discarded === true ? `discarded: ${e.discardedReason ?? "its output was not used"}` : ""]))`. `markdownTable` (`src/report/export/markdownEscape.ts`) escapes cell text.

- [ ] **Step 1: Write the failing tests.**
  ```ts
  // tests/report.markdownCostTotal.test.ts (synthetic report via the file's reportWithCosts)
  it("marks a discarded charge in the audit breakdown with its reason", () => {
    // costs [0.045210, 0.428250, 0.4]; entry 0: { step: "bear", discarded: true, discardedReason: "the output was not valid JSON | twice" }
    const lines = reportToAuditMarkdown(report).split("\n").filter((l) => l.startsWith("| bear |"));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("discarded: the output was not valid JSON");
    // the reason's pipe stays inside the Note cell: the row has exactly 4 cells on unescaped pipes
  });
  it("control: an undiscarded row has an empty Note and the total line is unchanged", () => { /* total equals HEAD's text */ });
  // tests/jobRunner.test.ts (durable verify recovery, from probes/RPT-210.probe.ts)
  it("keeps the discarded mark on a rejected bull row when durable recovery builds the report", async () => {
    expect(rows.find((r) => r.step === "bull" && r.costUsd === 0.42825)).toMatchObject({ discarded: true });
    expect(rows.every((r) => typeof r.fallbackUsed === "boolean")).toBe(true);
  });
  ```
- [ ] **Step 2: Run** `npx vitest run tests/report.markdownCostTotal.test.ts -t "discarded"` and `npx vitest run tests/jobRunner.test.ts -t "durable recovery builds the report"`. Expected FAIL: `expected '| bear | claude-sonnet-5-5 | $0.045210 |' to contain 'discarded: ...'`; `expected false to be true` (recovery).
- [ ] **Step 3: Implement** the column and the shared join.
- [ ] **Step 4: Run** `npx vitest run tests/report.markdownCostTotal.test.ts tests/jobRunner.test.ts tests/phaseOne.finalReview.test.ts tests/report.providerFallback.test.ts tests/company.report.presentation.test.ts`. Any test that pins the three-column header line `| Step | Model | Cost (USD) |` moves to four columns (search `Cost (USD)` in tests); name each in the commit. The durable-recovery `getConfig` count pin (`tests/jobRunner.test.ts:4457`, 4 calls) must NOT move.
- [ ] **Step 5: Benefit check.** `probes/RPT-210.probe.ts`'s three failures hold: #49's audit export marks bear $0.045210 and bull $0.428250, #48's marks bear $0.296630, and recovery keeps `discarded: true`. Display-only for stored reports: their stored `discarded` flags now print (Task 21 replay); totals and every other line of the export are unchanged.
- [ ] **Step 6: Docs.** None describes the breakdown's columns (D-62 is a dated record and stays as written); D-next-7 and the CHANGELOG record the column.
- [ ] **Step 7: Commit.** `git add src/report/export/auditMarkdown.ts src/pipeline/jobRunner.ts tests/report.markdownCostTotal.test.ts tests/jobRunner.test.ts` then `git commit -m "Print the discarded mark in the audit export and keep it through durable recovery (RPT-210)"`.

---

## Batch-level tasks

### Task 14: Confirm the payload golden and the Stage B fixture do not move

No task changes the context payload, a prompt's text or a Stage B figure: Task 10 removes a request rather than changing what any request says, and Task 9 changes reconciliation metadata only.

- [ ] **Step 1:** `npx vitest run tests/stageC.payload.passes.test.ts`. Expected PASS with no re-pin (fingerprint, promptBytes, financeHash and provenanceHash unchanged). If it fails, stop: something changed prompt or payload text and must be found before going on.
- [ ] **Step 2:** `npm run audit:deltas` (dry run, no `--write`). Expected: no newly differing leaf. Do not run `--write`; if a leaf moves, investigate it as a defect of this batch.
- [ ] **Step 3:** No commit.

### Task 15: Version stamps

- [ ] **Step 1:** `src/pipeline/jobRunner.ts:527`: `PIPELINE_VERSION = "stage-c-1.6.10"`; append to its doc comment: "1.6.10 (D-next-1..7): a failed paid request is recorded at what it may have billed and each pass, step and audit export states the ledger's cost; the mirrored judge pass is skipped and disclosed on a retry that keeps sections, and only section grades are compared."
- [ ] **Step 2:** `tests/jobRunner.test.ts:6204`: pin `"stage-c-1.6.10"`.
- [ ] **Step 3:** Unchanged, with reasons for the PR: `REPORT_SPEC_VERSION` 1.44.0 (no figure, grade, label or schema field changes meaning; a bump would make every earlier report "not comparable" in the history diff, `tests/report.versionStamps.test.ts:116-129`, although no financial convention changed; precedents: D-62 moved the whole cost breakdown into the audit export and reshaped both exports with "`REPORT_SPEC_VERSION` and `PAYLOAD_VERSION` ... unchanged", and D-116 moved only the pipeline stamp for run-metadata changes). This deviates from the audit's stamp list (REPORT.md section 7, B7: "PIPELINE_VERSION, REPORT_SPEC_VERSION", from RPT-210's `versionStampsAffected`): RPT-210 prints a flag every stored report already carries and is display-only, so it changes how reports are shown, not what any field means. State the deviation and this reason in the PR and the disposition note; `PAYLOAD_VERSION` 1.48.0 (Task 14); `STAGE_B_IMPLEMENTATION_VERSION` ACCOUNTING_EVIDENCE_27 and `SCORE_BANDS_VERSION` (no Stage B change).
- [ ] **Step 4:** `npx vitest run tests/jobRunner.test.ts -t "pipelineVersion|stage-c"` and `npx vitest run tests/report.versionStamps.test.ts`. Expected PASS.
- [ ] **Step 5:** `git add src/pipeline/jobRunner.ts tests/jobRunner.test.ts` then `git commit -m "Stamp pipeline stage-c-1.6.10 for paid-spend accounting (D-next)"`. Note in the PR that B1, B2, B8, B9 and B10 also move this stamp: renumber at merge.

### Task 16: CHANGELOG

- [ ] **Step 1:** Add a top entry `## Unreleased - every paid request settled and shown at its real cost (2026-10-27)` (date of merge), plain English, one bullet per change:
  - A paid request that fails after it started generating is recorded at its reported usage plus the most it could still have generated, marked presumed, whatever ended it (AI-113); one the provider had answered and the caller cancelled is presumed instead of dropped (AI-113-V1); one that never opened a connection is not charged (AI-307: one network blip used to book $315.84 presumed on an Opus 5.5 bull pass).
  - A pass's recorded cost and tokens equal the sum of its requests' settlements, failed pause resumptions included (AI-114).
  - A finished response is kept when the database writer lock delays its cost record (AI-308).
  - Presumed rows are dated on the day their request was authorized, so `costs:reconcile` compares them with the right day (JOB-203).
  - Paid work is admitted against the lower of the job's recorded cap and the cap configured now (JOB-209).
  - Claude Haiku 4.5 runs on current payloads: the context check estimates tokens per tokenizer instead of counting bytes (AI-309).
  - `METIS_JUDGE_ORDER=both` compares section grades only (AI-109), and skips and discloses the mirrored pass on a retry that keeps sections (AI-108).
  - A judge attempt whose output could not be assembled into a report is marked discarded, and an identical second failure stops the retries (AI-112); a step's detail states the step's whole cost, presumed part included (JOB-204); the audit export prints the discarded mark and durable recovery keeps it (RPT-210).
  - Pipeline stage-c-1.6.10 (D-next-1..7). Report 1.44.0, payload 1.48.0 and Stage B ACCOUNTING_EVIDENCE_27 are unchanged. Stored reports keep their bytes; #48's and #49's audit exports now print their stored discarded marks.
- [ ] **Step 2:** `git add CHANGELOG.md` then `git commit -m "Changelog: paid-spend accounting batch"`.

### Task 17: DECISIONS entries

- [ ] **Step 1:** Append to `docs/audit/DECISIONS.md`, in the D-116 format (context, options, choice, limits, validation, stamps). Write the numbers as `D-next-1` .. `D-next-7`; they are assigned at merge time, renumbered then together with every reference (`jobRunner.ts` stamp comment, CHANGELOG, disposition note, plan).
  - **D-next-1 - A failed paid request settles at the worst case given what it reported** (AI-113, AI-113-V1, AI-114, AI-307; OD-1, OD-2): one classifier for both catches; usage reported without a final delta -> reported plus remainder (request maximum with search or fallback exposure); no usage but answered or sent -> request maximum; never answered and never sent (connect phase, refused, name lookup, abort before headers) -> released; the pass result is the sum of its settlements in both reservation modes. Revises D-09 (every cause, not only idle), extends D-10. The idle guard's no-usage figure rises from the output remainder to the request maximum, so one wire state settles one figure (OD-2; confirmed by the main session on 2026-10-28, decisions spec 4.3, consistent with default 8: overstate, never understate, a paid cost); reversed by restoring the output-only branch of `abandonedRequestCostUsd(opts, null)`. Limits: an abort after the body was written but before headers is released; the SDK's string-based timeout detection is pinned by a real-SDK test.
  - **D-next-2 - A contended ledger write keeps the completed response** (AI-308): only the SQLITE_BUSY family (`isTransientWriterLock`; SQLite result codes 5, 261, 517, 773) is retried, for about five seconds; afterwards the response is returned and the lease presumed at expiry (D-07). `SQLITE_LOCKED` (a same-connection conflict) and every other settle error stay loud. Source: https://www.sqlite.org/rescode.html.
  - **D-next-3 - Presumed rows are dated at authorization** (JOB-203; OD-5): request settlement and pass-level presumed rows use the lease's `acquiredAt`, like the sweep; actual rows keep the settlement instant. Extends D-07's F68/F76 revision. Limits: the three OD-5 residuals (Anthropic documents neither attribution instant; a midnight-spanning presumed row can be compared with the wrong day in either convention; a backdated presumed row leaves a short rolling window sooner).
  - **D-next-4 - The lower of the recorded and the configured job cap** (JOB-209; OD-6): revises D-10's admission wording.
  - **D-next-5 - Context fit is an estimate per tokenizer; Haiku 4.5 stays** (AI-309; OD-4): constants, calibration and the $0 provider backstop.
  - **D-next-6 - `both` compares grades only and skips anchored mirrors** (AI-108, AI-109; OD-3): revises D-20 (fields compared; exception for anchored retries), consistent with D-52 and D-70. Supersedes the D-116 Limits bullet "With `THESIS_JUDGE_ORDER=both`, the mirrored request carries the same kept sections ...": no mirrored request is sent with kept sections any more (D-116 stays as written; this entry says so).
  - **D-next-7 - Discarded attempts and step costs read the ledger** (AI-112, JOB-204, RPT-210; OD-7): assembly rejections are discarded under the fixed reason "the report could not be assembled from its output", an identical second assembly failure stops retries, step details use the summed step cost with the presumed part named, the audit export prints the mark, recovery shares the join. Limit: the runner's assembly-rejection list is not durable across a crash. Extends D-113 and 35fa83b. Stamps: pipeline only; report spec unchanged on the D-62 precedent (the audit listed REPORT_SPEC_VERSION for RPT-210; say why not).
  - No entry may contain a provider-key prefix, an `API_KEY = <value>` pair or an absolute home path (`tests/repository.release.test.ts` scans DECISIONS.md).
- [ ] **Step 2:** `npx vitest run tests/docs.lint.test.ts tests/repository.release.test.ts`. Expected PASS.
- [ ] **Step 3:** `git add docs/audit/DECISIONS.md` then `git commit -m "Record the paid-spend accounting decisions (D-next-1..7)"`.

### Task 18: Disposition note and release registration

- [ ] **Step 1:** Create `docs/audit/2026-10-27-audit-batch7-paid-spend-accounting.md`: one row per finding (id, severity, status "fixed", task, commit, regression test name, residual), the owner decisions with their D-next numbers, the before/after table from Task 21, and the limits (OD-2 residual, OD-5 residual, AI-112 durability, AI-309 paid context-window stop when input fits but input plus output does not). No section-number citations of retired documents.
- [ ] **Step 2:** Register it in the `ALLOWED_MARKDOWN` set of `tests/repository.release.test.ts` beside the other `docs/audit/2026-10-22-audit-batch*` entries, and register this plan file (`docs/superpowers/plans/2026-10-27-audit-fix-07-paid-spend-accounting.md`) in the same set beside the other `docs/superpowers/plans/` entries if the plan is committed with the batch (the plan has been scrubbed of literal key prefixes and home paths so it passes "keeps approved public docs free of home paths and credential values"; re-check before committing either file by running the release test, which applies the exact patterns). Run `git add -N` on both new files first: the release test partitions `git ls-files`.
- [ ] **Step 3:** `npx vitest run tests/repository.release.test.ts tests/docs.lint.test.ts`. Expected PASS.
- [ ] **Step 4:** `git add docs/audit/2026-10-27-audit-batch7-paid-spend-accounting.md tests/repository.release.test.ts docs/superpowers/plans/2026-10-27-audit-fix-07-paid-spend-accounting.md` then `git commit -m "Disposition note for the paid-spend accounting batch"`.

### Task 19: Documentation consistency sweep

- [ ] **Step 1:** Grep `README.md`, `docs/CLAUDE-USAGE.md`, `docs/OPERATIONS.md`, `docs/PRIVACY.md` and `.env.example` for statements this batch made untrue: `reconciles every grade and probability`, `scenario probability`, `presumed bound`, `never reached`, `context cap`, `input upper bound`, `released`, `METIS_MAX_JOB_COST_USD`, `costs:reconcile`. Every hit must match the code after Tasks 1-13.
- [ ] **Step 2:** `npm run docs:config` and `npm run docs:pricing` must now leave `README.md` unchanged (Task 2 already regenerated the pricing block from `scripts/docs-pricing.mjs`; no configuration key or price changed, and the `.env.example` edits kept every key's first sentence); `wc -l README.md` still 270 or fewer; `npx vitest run tests/docs.lint.test.ts tests/docsPricing.test.ts`.
- [ ] **Step 3:** Commit only if Step 1 found something: `git add <files by name>` then `git commit -m "Docs: match the paid-spend accounting rules"`.

### Task 20: Run every touched test file together

- [ ] **Step 1:** `npx vitest run tests/anthropic.test.ts tests/requestAdmission.test.ts tests/scheduler.presumedSpend.test.ts tests/stageC.index.test.ts tests/stageC.judgeProtocol.test.ts tests/jobRunner.test.ts tests/report.markdownCostTotal.test.ts tests/report.versionStamps.test.ts tests/stageC.payload.passes.test.ts tests/risk.providers.coverage.test.ts tests/api.routes.stream.test.ts tests/docs.lint.test.ts tests/docsPricing.test.ts tests/repository.release.test.ts`. Expected PASS. Any failure is fixed in the owning task's commit (amend only an unpushed commit of this branch; otherwise a follow-up commit naming the task).

### Task 21: Before/after replay proof (no provider or model calls)

- [ ] **Step 1:** On the branch tip, `npx vitest run --config tmp/audit-2026-10-27/plans/replay/vitest.replay.config.ts > tmp/audit-2026-10-27/plans/replay/B7.after.txt 2>&1` (the Task 0 harness; `ANTHROPIC_API_KEY` unset; shared setup blocks network; no `.db` opened).
- [ ] **Step 2:** Fill the table for the PR and the disposition note:

| Finding | Stored input (read-only) | Before (HEAD 6542531, `B7.before.txt`) | After (`B7.after.txt`) |
|---|---|---|---|
| AI-309 | `tmp/audit-2026-10-27/data/evidence/{43,46,48,49}/run_input_snapshot.gen0.*.json` | Haiku 4.5 refused: byte bounds 342,680 / 323,567 / 379,563 / 383,847 > 200,000 | Haiku 4.5 admitted: estimates 124,611 / 117,661 / 138,023 / 139,581 tokens; Sonnet 5.5 admitted before and after |
| AI-108 | `tmp/audit-2026-10-27/data/evidence/50/job_pass_artifacts.json`, attempt `58883147-381f-4806-919f-9298d9c0fc67` (kept: verdict, business, fundamentals) | the mirror request count printed in `B7.before.txt` (non-zero); reconciliation performed and agreed ("Both judge passes ... produced the same ...") | 0 mirror requests; reconciliation not performed, reason names the kept sections |
| RPT-210 | `tmp/audit-2026-10-27/data/reports/48.json`, `49.json` | breakdown rows unmarked | #49: bear $0.045210 and bull $0.428250 marked `discarded: ...`; #48: bear $0.296630 marked; totals identical |
| AI-113, AI-113-V1, AI-114, AI-307, AI-308, JOB-203, JOB-209, AI-112, JOB-204 | none: no stored run contains a stream death, a midnight presumption, a cap change or an assembly retry | figures from the failing tests at Step 2 of each task | figures from the same tests passing: AI-113 settled $0.22002 actual -> $2.78 presumed; AI-307 6 x $52.64 presumed -> $0; AI-114 pass $0.024 -> sum of settlements ($0.652 after Task 2); JOB-203 $12.50 lowered to $0 -> to $11.80; JOB-209 $26.36 admitted -> refused; AI-112 0 -> 1 marked and 3 -> 2 judge calls; JOB-204 detail $0.47 -> $0.78 and $0.40 -> $9.93 |

- [ ] **Step 3:** Confirm stored bytes are untouched: `git status --porcelain tmp/` lists nothing new besides `tmp/audit-2026-10-27/plans/replay/` (git-ignored anyway), and the stored `cost_log.json` files are unchanged (`sha256sum` before and after).
- [ ] **Step 4:** No commit (the proof lives in the PR description and the disposition note).

### Task 22: `npm run verify` in foreground chunks

Run each gate in the foreground (a background verify is reaped when idle), in a normal environment without `METIS_DATA_DIR`:

- [ ] `npm run check:dependencies`
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run test:product`
- [ ] `npm run test:integration`
- [ ] `npm run test:coverage`
- [ ] `npm run build`
- [ ] `npm run audit:security`

Known load flakes, rerun before investigating: `tests/db.cli.test.ts` (`spawnSync ... ETIMEDOUT` on Windows), and timeouts in `jobScheduler`, `recordedSensitivity`, `risk.coverage`, `runtimeArtifactIdentity` and `runtimeReplay` suites while other sessions run servers. Fix anything this batch caused, in the owning task's commit or a follow-up commit that names it.

### Task 23: Fresh reviewer over the whole diff

- [ ] **Step 1:** Dispatch a fresh reviewer (superpowers:requesting-code-review) with `git diff main...fix/paid-spend-accounting`, the 13 findings from `tmp/audit-2026-10-27/findings.json`, this plan's Owner decisions and Review Focus. Ask specifically: does any path now settle a request twice or not at all; can any post-send failure still be released; can any pre-send failure still be presumed; does any pass result differ from the sum of its settlements; does the mirror run anywhere it is anchored; do the docs match the code.
- [ ] **Step 2:** Fix only correctness findings; re-run the affected test files and Task 20.

### Task 24: PR description (plain English)

- [ ] Title: "Every paid request is settled and shown at its real cost (audit batch 7)".
- [ ] **What was wrong:** some failed Claude requests were recorded at almost nothing (a stream that broke mid-answer) or dropped (a cancel after Anthropic answered), others were charged although they never left the machine (a connection that could not open); a pass's own cost could disagree with the ledger; a finished answer could be thrown away because the database was busy; presumed charges could be compared with the wrong day; a lowered job cap did not bind queued work; Haiku 4.5 could not run at all; the judge-order check could claim an agreement nobody measured; some wasted charges were not marked, and a step's note could name a different cost than its own column.
- [ ] **What changed:** one short paragraph per area (provider settlement, ledger dates and caps, Haiku, judge order, run panel and audit export).
- [ ] **Decisions made for you:** OD-1 to OD-7, one line each, with how to reverse each. Under OD-2 say in plain words that a paid stream which goes silent before reporting any usage is now presumed at the whole request's maximum (it was the output part only), that the main session confirmed this on 2026-10-28 because an overstated presumption is visible and reconciled while an understated one breaks the caps, and how to reverse it.
- [ ] **Before and after:** the Task 21 table.
- [ ] **Not changed / limits:** the residuals listed in D-next-1, -3, -5 and -7; stored reports keep their bytes; no money was spent and no report was generated to test this.
- [ ] **Version stamps and renumbering:** pipeline stage-c-1.6.10 and D-next numbers, to be renumbered at merge.
- [ ] **How it was checked:** failing-first tests per finding, the replay, `npm run verify`, the fresh review.
- [ ] End with the attribution lines from the session's system reminder.

---

## Cross-batch dependencies

- **B8 (`fix/job-retry-lifecycle`)** shares `src/providers/anthropic.ts`, `src/pipeline/jobScheduler.ts`, `src/pipeline/jobRunner.ts`, `src/db/index.ts`, `src/cache/maintenance.ts`, `src/app/company/[symbol]/GenerateReport.tsx` and `docs/CLAUDE-USAGE.md`. JOB-206 (B8) is the same SQLITE_BUSY family at the lease-renewal site, and B8's plan defines `isTransientWriterLock` in `src/pipeline/jobScheduler.ts` with the same semantics as Task 5's: B7 merges first and defines it, so B8 reuses it instead of adding a second one. B8's Task 7 (JOB-205) rewrites the judge's terminal wording at `jobRunner.ts:3616-3619`; Task 11 deliberately adds no wording there (its repeat stop reaches the existing non-retryable branch, which B8 keeps). AI-110 (B8) is the sterile data-only fallback that AI-112's unrepairable case reaches: after Task 11 it is reached after two judge attempts, not three, so B8's AI-110 tests must expect that. JOB-208 (B8, 429 handling) edits `isRetryableTransportError`, next to Task 4's code: rebase carefully.
- **B2** shares `src/pipeline/stageC/passes.ts` and `src/report/schema.ts`; Task 10 touches only `runJudgePass` and Task 9 only the reconciliation docstring.
- **B10** shares `src/report/export/auditMarkdown.ts`, `src/report/completeness.ts` and `src/components/report/sections.tsx` (which prints the judge note AI-108 corrects; no change there in B7).
- **B11** shares `README.md` and `.env.example` (Tasks 7, 9, 10 edit lines 148-149 and 123-127, 165-177; Task 2 edits `scripts/docs-pricing.mjs` and regenerates the README pricing block). README is at its 270-line cap, so whichever batch merges second must keep it there.
- **B12** shares `tests/jobRunner.test.ts` and docs.
- **B4, B6** share `docs/audit/DECISIONS.md`. **B1, B2, B8, B9, B10** also move `PIPELINE_VERSION`: renumber the stamp and D-numbers at merge, one batch at a time (REPORT.md section 7).

## Findings check at HEAD 6542531

| Finding | Re-read at | Still true |
|---|---|---|
| AI-113 | `anthropic.ts:2340-2345` generic catch settles `billedMessageFromSnapshot` as actual; `:1866-1885` resumption catch the same | yes |
| AI-108 | `passes.ts:2367-2377` and `:2433` pass one `continuation` to both orders; `:2407` guards only the repair turn; `continuation.ts:157` merges carried sections over raw | yes |
| AI-307 | `anthropic.ts:1736` presumes every `APIConnectionTimeoutError`; SDK `client.js:529-530, 564-566` maps any `/timed? ?out/` fetch failure to it | yes |
| AI-308 | `anthropic.ts:2280` in-line settle inside the try; `:2382-2385` rethrows a non-API error | yes |
| AI-309 | `anthropic.ts:835-848` byte count; `:883-889` refusal; registry Haiku 4.5 window 200,000 | yes |
| JOB-203 | `jobScheduler.ts:536` `createdAt: authorityAt`; `:365` sweep uses `lease.acquiredAt`; `jobArtifacts.ts:1022` | yes |
| JOB-209 | `jobRunner.ts:1723, 1770` sole writers of `maxCostUsd`; `jobScheduler.ts:1372, 1410-1422` reads the row | yes |
| AI-109 | `judgeProtocol.ts:424-450` lists and compares probabilities; notes at `:476-478` | yes |
| AI-112 | `jobRunner.ts:3573-3601` retries without recording; `:4731` reads failure artifacts only | yes |
| AI-113-V1 | `anthropic.ts:2319` requires `failedSnapshot.usage !== null`; `:1703-1707` releases | yes |
| AI-114 | `anthropic.ts:2340-2345` adds a snapshot only when `resumption === null` | yes |
| JOB-204 | `jobRunner.ts:3720-3726` reuse detail from `passDetail(snapshot)`; `jobScheduler.ts:1875` summed detail only when `attempts > 1` | yes |
| RPT-210 | `auditMarkdown.ts:130` three columns; `jobRunner.ts:5120-5127` rebuilds rows without the discarded join | yes |

## Self-review

- **Coverage.** All 13 findings map to Tasks 1-13 (AI-114: 1; AI-113: 2; AI-113-V1: 3; AI-307: 4; AI-308: 5; JOB-203: 6; JOB-209: 7; AI-309: 8; AI-109: 9; AI-108: 10; AI-112: 11; JOB-204: 12; RPT-210: 13). Batch tasks cover stamps, golden, deltas, CHANGELOG, DECISIONS, disposition, docs, replay, verify, review and PR.
- **Every task** has a failing test with exact values taken from its probe, a control that must keep passing, the exact run command and expected failure, the neighbouring files to re-run, the pins that may and may not move, the markdown lines that change and a by-name commit.
- **Type consistency.** `FailedRequestCharge`, `classifyFailedRequest`, `settleFailedRequest` and `passAccounting` (Task 1) are the names Tasks 2, 3 and 5 extend; `AssemblyRejectedAttempt` (Task 11) is the type Task 13's `costBreakdownRows` consumes; `stepSettledTotals` and the three-argument `detailAcrossAttempts` (Task 12) are used on both sides of the runner/scheduler boundary; `RequestSettlementNotRecordedError` is exported by the provider and produced by the runner (Task 5).
- **Review focus.** Each of the five lines has a named test in Tasks 2, 4 and 10.
- **Proportion.** Signatures, rules, test names and assertions; no function bodies beyond the interface sketches.

## Review notes

Independent review of this plan on 2026-10-27, against `tmp/audit-2026-10-27/findings.json`, the 13 B7 probes (read, not run), the code at HEAD `6542531` and the cited sources. All 13 findings are covered and none needs to be skipped: every probe's failing assertion traces to the defect in the code path the plan changes. The owner decisions OD-1..OD-7 hold up against their sources (spot-checked with WebFetch: Anthropic Streaming, Errors, Token counting, Usage and Cost API, Cost Report reference, Rate limits; Zheng et al. section 3.4; the Amazon Builders' Library article; undici Errors; SQLite result codes; OpenRouter streaming) and match recommended defaults 8 and 9.

Changes made to this plan:

1. **Spec line.** `docs/superpowers/specs/2026-10-27-audit-remediation-decisions.md` does not exist at HEAD; the plan now says its own Owner decisions section is the record until the main session writes that file.
2. **Global constraints.** Added three constraints the plan missed: (a) committed Markdown must not contain a literal provider-key prefix or `API_KEY = <12+ chars>` (`tests/repository.release.test.ts` scans every approved doc); the plan's own two literal test keys were replaced by an `OFFLINE_KEY` constant; (b) README.md is at its 270-line cap and its configuration and pricing blocks are generated and byte-compared by `tests/docs.lint.test.ts`; (c) `anthropic.ts`, `jobScheduler.ts` and `jobRunner.ts` are under per-file risk coverage thresholds.
3. **OD-1 source.** The OpenRouter page does not say that work before a cancel is billed; the plan's paraphrase was corrected and the source's weight stated (a third-party router; it supports the direction, not a figure).
4. **OD-4 source.** Added Anthropic's caveat "The exact increase depends on the content and workload shape", and the reasoning that a near-true estimate is the better design given the $0 provider refusal (a decision with evidence, not a test loosened to pass).
5. **OD-5 residuals.** Added the completion-attribution residual (a midnight-spanning presumed row can be compared with the wrong day in either convention) and the rolling-window effect of backdating presumed rows; both already apply to the sweep since 782a853. D-next-3's limits now name all three.
6. **Task 0.** The replay config is one directory deeper than the probe config, so a literal copy would import `vitest.shared` from the wrong place and set the wrong root; exact paths given. The AI-309 case now builds `args` with `buildAnalystRunPassArgs` as the probe does and imports the provider as a namespace, so the same harness runs before and after Task 8. The AI-108 case follows the probe's #50 replay (`sectionRetryCount: 1`), and the expected "6 mirror requests" was removed: the probe measured 6 only for a carried verdict alone, and #50 carries three sections.
7. **Task 1.** The send-timeout test now names its model and permit maximum, and its expected-failure text no longer quotes JOB-204's 9.93 figure. Named the existing death-before-`message_start` control (`tests/anthropic.test.ts:1640`).
8. **Task 2.** (a) Missed re-pin: `tests/requestAdmission.test.ts:440` asserts every row is `actual` after a `message_start` plus mid-stream overload, which becomes `presumed`; re-pin specified, and `:511` stays green. (b) README.md:192 is inside the generated pricing block: the edit moves to `scripts/docs-pricing.mjs:112` plus `npm run docs:pricing`, as one line (the README is at its cap). (c) `finalUsage` must be set only in the `message_delta` branch: the existing `snapshot.stopReason` is already non-null after `message_start` in the test fixtures (`syntheticMessage` defaults to `"end_turn"`).
9. **Task 4.** The "keeps the SDK request timeout presumed" test as written would hang: `streamFinalMessage` passes `timeout: REQUEST_TIMEOUT_MS` (600,000 ms) per request, which overrides a client-level `timeout: 20` (`client.js`: `options.timeout ?? this.timeout`). Replaced by a fetch that rejects with an `AbortError` while the caller's signal is live (what the SDK's own timer produces; `isAbortError` at `client.js:529-530`), through the real `getClient()`; it is now a control that passes before and after. Added a unit test of the predicate, env and stub restoration, and a note that the behaviour change is confined to the two timeout-shaped connect failures.
10. **Task 5.** The lock predicate included `SQLITE_LOCKED` (a same-connection conflict that waiting does not clear) and missed `SQLITE_BUSY_RECOVERY`. It is now `isTransientWriterLock` in `jobScheduler.ts` (the SQLITE_BUSY family over the cause chain), matching B8's JOB-206 helper of the same name, with a unit test that SQLITE_LOCKED stays loud.
11. **Task 7.** Env restoration after the "restart" tests; the `.env.example` sentence is appended inside the existing comment block so the README configuration table does not change.
12. **Task 8.** The Haiku regression fixture of 4,000 rows serializes to about 272,058 bytes, below the 300,000 floor the step itself requires; changed to 6,000 rows (about 408,058 bytes, estimate 148,385 tokens, measured with Node) with both bounds asserted.
13. **Tasks 9 and 10.** Exact two-line README replacements so the README stays at 270 lines; `.env.example` edits keep indentation so `npm run docs:config` produces no README diff.
14. **Task 11.** (a) The loop's `retrying` flag (`jobRunner.ts:3592`) must follow the new rule, otherwise a third paid judge call still happens. (b) The discarded reason quoted the raw assembly error; every discarded reason in the runner is a fixed reader-safe phrase because the report's recursive rating-safety gate scans `discardedReason` and the disclosure promises the failure is not quoted. It is now a fixed `assembly` phrase in `DISCARDED_REASON_BY_KIND`. (c) The unrepairable-case test expected two `llm.synthesize.discardedAttempt` disclosures in a data-only report, which the data-only exit never writes (and, with a rating-word gap, the sterile shell replaces the manifest); it now asserts the breakdown marks, the persisted report and the step detail. (d) No new terminal wording, so B8's JOB-205 rewrite composes. (e) Added a control: a different second assembly failure still re-buys the judge.
15. **Task 15.** Leaving `REPORT_SPEC_VERSION` unchanged deviates from REPORT.md's B7 stamp list (taken from RPT-210); kept, and backed with the D-62 precedent (moving the cost breakdown into the audit export left the report spec unchanged). The PR and disposition note must state the deviation.
16. **Task 17.** D-next-2 names the SQLite codes and source; D-next-3 the three residuals; D-next-6 supersedes D-116's Limits bullet on `both` mirrors; no credential-like strings.
17. **Tasks 18-21.** `ALLOWED_MARKDOWN` named as the registration set; docs regeneration expectations corrected; `tests/docs.lint.test.ts`, `tests/docsPricing.test.ts` and `tests/repository.release.test.ts` added to the touched-file run; the replay table's AI-108 "before" figure is now the recorded count.
18. **Cross-batch.** B8 reuses `isTransientWriterLock`; B8's JOB-205 owns the judge terminal wording; B11 inherits the README line cap.

Left for the main session:

- Write `docs/superpowers/specs/2026-10-27-audit-remediation-decisions.md` if it is wanted, copying OD-1..OD-7 unchanged.
- Confirm the `REPORT_SPEC_VERSION` deviation (Task 15) when reconciling stamps across batches; other batches move that stamp for their own reasons, so B7 not moving it changes nothing at merge.
- `tmp/audit-2026-10-27/plans/B7.summary.json` was updated by the reviewer to list `scripts/docs-pricing.mjs` (Task 2), `src/pipeline/jobScheduler.ts` for Task 5 and the tests added in Tasks 4, 5 and 11; its `ownerDecisions` text predates notes 3-5 and 10 above, so read the plan's Owner decisions section and D-next entries as authoritative.
- OD-2 and Task 3 raise the idle guard's no-usage figure from the output remainder to the request maximum (the figure a socket death in the same state already settles). This is the conservative unification; it adds presumed spend only when a stream goes silent before any usage event, and is reversed by restoring the output-only branch of `abandonedRequestCostUsd(opts, null)`.

## Integration notes (2026-10-28)

Applied by the final integration step from `docs/superpowers/specs/2026-10-27-audit-remediation-decisions.md` section 4.3, "Main-session resolutions (2026-10-28)", line **B7**: "Confirm raising the idle guard's no-usage figure to the request maximum, consistent with default 8 (overstate, never understate, a paid cost)." It closes the last item under "Left for the main session" above. No task was added, removed or renumbered; no behaviour in the plan changed.

| # | Change | Where | 4.3 B7 clause it implements |
|---|---|---|---|
| 1 | A "Confirmed" bullet: the raise is the conservative unification of one wire state, how it is reversed | OD-2 | "Confirm raising the idle guard's no-usage figure to the request maximum" |
| 2 | The idle no-usage re-pin cites OD-2 and the confirmation in its commit; a pin moving toward the output remainder is named a defect | Task 3 Step 4 | same, "overstate, never understate" |
| 3 | CLAUDE-USAGE's appended sentence also states the idle no-usage figure, so the doc matches the code | Task 3 Step 6 | same (docs follow the confirmed behaviour) |
| 4 | D-next-1 records the raise, the confirmation, the default-8 rationale and the reversal | Task 17 Step 1 | same |
| 5 | The PR explains the raise in plain words with its reason and reversal | Task 24 | same (owner-facing record) |
| 6 | Spec line: the decisions spec exists (untracked); section 2.9 summarises OD-1..OD-7, section 4.3 confirms OD-2; this plan stays the authority | header | (brief: fix the Spec line) |

`tmp/audit-2026-10-27/plans/B7.summary.json` was regenerated from this plan (25 tasks, Tasks 0-24; OD-1 to OD-7, OD-2 marked confirmed).
