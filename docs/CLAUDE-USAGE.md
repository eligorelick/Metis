# Claude models and AI usage

This page describes the checked-in implementation. The Claude registry in
[`config/models.json`](../config/models.json) is stamped **2026-10-03**; its
entries are the app's configured capabilities and cost assumptions, not a
guarantee of current provider availability, account access, or invoice prices.
See [Anthropic's pricing](https://platform.claude.com/docs/en/about-claude/pricing)
and [model documentation](https://platform.claude.com/docs/en/models/overview)
when reviewing that snapshot.

## Select the report connection first

**Settings → AI connections** chooses AI off, Claude API, ChatGPT, or Claude
through the local Claude Code CLI. Connecting an account does not generate a
report. Save the desired report connection after selecting its model and, for
ChatGPT, effort and speed, or for Claude Code, an optional effort.

| Connection | Implementation | Cost recorded by Metis |
| --- | --- | --- |
| AI off | Fetch, validate and calculate locally; save a data-only report | No inference charge |
| Claude API | `ANTHROPIC_API_KEY`; Anthropic Messages API | USD estimated from provider usage and the registry, or conservative presumed spend |
| ChatGPT | Browser OAuth; OpenAI Responses API through the connected account | `$0` API cost; reported input/output tokens and execution evidence |
| Claude Code | Your installed, unmodified Claude Code CLI 2.1.319+, signed in to your Claude subscription with `claude auth login`; Metis runs it locally with tools, hooks, MCP servers and session saving turned off, uses supplied evidence only (no web search), and never reads the CLI's OAuth tokens | `$0` API cost; the input tokens (cache reads and writes included) and output tokens the CLI reports, the model or models it reports, and the requested effort (the CLI does not report the effort it used). One complete report has run live through this route (2026-11-12; see the limits section) |

A subscription report's `$0` means Metis records no API dollar charge. It does
not mean free or unlimited provider usage, and Metis cannot read remaining
account allowance. Provider credit settings still apply. The app's USD caps
do not cap subscription tokens or provider credits. There is no automatic
switch to paid Claude API usage after a subscription connection fails.

An implicit default, before or after a connection store exists, follows the
saved or environment Claude key: Claude when present, AI off otherwise. An
explicitly saved selection is authoritative, including AI off. Creating a store
for credentials or account setup alone does not make the default explicit.
Claude's analysis model/effort settings are separate from this connection store.

The saved connection selection outranks the Claude model setting. The home page
("Reports run on"), the company page ("Runs on", beside the generate control)
and Settings all show the route the next report will use, for example
`ChatGPT plan · gpt-6.1-sol · max effort` or `Claude API · Opus 5.5 · max effort`,
with `sign-in needed` or `key needed` when it is not connected. A Claude model
that does not accept an effort setting (Haiku 4.5) is shown without one, because
the request does not send it; `auto` shows the saved effort when every model it
may pick accepts one. When the
selection is not Claude, the Settings Claude model and effort panels say
"Not in use". The label never includes an account email, token or key. A
resumed job that reuses its completed analysis keeps the model that analysis
ran on, whatever the current label says.

The selection is captured when a job executes. Subscription account, model,
effort and speed form part of the partial-work fingerprint; incompatible saved
work cannot be reused. Changing Settings does not rewrite saved reports.

## Claude model and effort settings

The selector accepts `auto` and active registry IDs. Explicit IDs are validated
offline against the registry; an API request can still fail for lack of access.
Unknown IDs and unlisted dated or `-latest` aliases are rejected. A listed dated
snapshot can be retained when already selected, but is not offered as a new
Settings choice.

`auto` queries the account's Models API and follows the registry preference
order, beginning with `claude-opus-5-5`. The result is cached in memory for one
hour. A failed catalog lookup is disclosed; it does not establish that another
model is available. Without a key, resolution uses the first registry preference
without a network request, and inference remains unavailable.

These are representative **registry values**, in USD per million tokens:

| Registry model | Input | Output | Five-minute cache write | Cache read |
| --- | ---: | ---: | ---: | ---: |
| `claude-opus-5-5` | 4 | 20 | 5 | 0.20 |
| `claude-sonnet-5-5` | 2 | 10 | 2.50 | 0.10 |
| `claude-fable-5-1` | 10 | 50 | 12.50 | 0.25 |
| `claude-haiku-4-5` | 1 | 5 | 1.25 | 0.10 |

The registry also retains Fable 5, Opus 5, Opus 4.8 and Sonnet 5. This list
describes selectable implementation entries, not measured research-quality
rankings. The registry's judge floor is `claude-sonnet-5-5`: Haiku analyst
requests use Haiku, while synthesis is raised to that floor and disclosed.
Before launch Metis estimates a request's input tokens from its size, at 2.25
bytes per token for the tokenizer Anthropic introduced with Claude 4.7 and 2.75
for Haiku 4.5's earlier one, and refuses only an estimate above the model's
context window. The constants are calibrated on Metis payloads (about 11% margin
on the earlier tokenizer, about 5% on the current one), so the estimate is not a
ceiling; an over-long prompt it misses is refused by Anthropic before any
charge. The estimate counts the input only: a request whose input fits the
window but whose input plus the output ceiling does not is launched, and
Anthropic stops it with `model_context_window_exceeded`, a paid stop that
discards the partial output and records what was billed.

Claude effort resolves in this order: database setting, `ANALYSIS_EFFORT`,
then `high`. Model resolves similarly: database setting, `ANALYSIS_MODEL`,
then `auto`. Saved choices continue to override environment changes until
changed in Settings or cleared by `npm run settings:reset -- --yes`.
Without `--yes`, that reset prints what it would remove. It preserves the cache
maintenance stamp and settings revision, and does not clear AI connections.

Supported effort choices are `low`, `medium`, `high`, `xhigh` and `max`.
The adapter sends effort only when the registry says the model supports it;
Haiku ignores the configured effort and reports the adjustment. Thinking
parameters follow each entry's request policy; the adapter does not send
sampling parameters or manual thinking budgets. Selecting a different model
does not silently reset effort.

## What a report runs

The paid research path runs a bull analyst, a bear analyst, and a judge that
synthesizes their cases. Financial calculations precede these requests.
Verification afterwards is deterministic citation/provenance tracing with
**no model call and no inference cost**; `VERIFY_MODEL` is ignored. Coverage
measures whether claims trace to admitted evidence, not whether sources or
financial conclusions are independently correct.

Claude analyst requests expose server-side web search, capped at **eight uses
per request**. The judge has no web search. Retries and paused-turn resumptions
are separate requests, so eight is not a whole-report cap. The supplied payload
and model-returned successful search-result URLs define the citation evidence;
Metis does not browse arbitrary URLs written in model prose. See
[Privacy](PRIVACY.md#what-the-ai-provider-receives) for payload contents.

Analyst JSON uses Anthropic structured output. The judge's larger schema is
included in its prompt and validated locally, rather than sent as a strict
structured-output grammar. Invalid judge/report output can receive up to two
additional repair attempts; completed rejected requests still incur usage.
A report-assembly failure that repeats unchanged after a repair ends the
retries, and each judge attempt whose output could not be assembled into the
report is marked discarded, with a fixed reason, in the stored report's cost
breakdown. The audit export prints each discarded charge with its reason in a
Note column. Durable verify recovery keeps the marks it can read from the
stored pass artifacts; an assembly rejection is recorded only in the running
process, so a crash-recovery rebuild does not mark it.
A rejected bull or bear case gets one repair attempt, including a schema-valid
case that is empty (no drivers or risks, or no positive price target with a
horizon). A blank `sourceId` is read as absent rather than rejected, so it no
longer costs a repair. Entity-validation repairs can also add analyst work.

`METIS_JUDGE_ORDER` defaults to `random`, deterministically seeded by job ID.
`bull-first` and `bear-first` fix the presentation order. `both` requests a
second judge assessment with the cases swapped, then reconciles the pair;
on a retry that repairs a rejected output or keeps sections from a cut-off
response, the mirrored request would not be an independent draw, so it is not
run and the report says the comparison was not performed;
this can roughly double judge work before any repairs. Order and reconciliation
are disclosed in the report. Bull, bear and judge can share a model family;
their adversarial roles do not establish independent model judgments.

With Claude streaming, bull starts first and bear waits for its first stream
event, allowing the evidence prefix cache to become reusable. Requests may
then overlap. If bull fails before that event, bear is not launched; when a
side's terminal failure makes synthesis impossible, the other request is
aborted and its incurred or presumed spend is retained. A request the
provider has already answered is presumed even when it is cancelled before
any usage arrives, at the whole request maximum when no usage was reported.
A stream that goes silent before any usage arrives is presumed at the same
figure. A cancel before the provider answers is not charged. Non-streaming
and subscription paths run the analysts sequentially.

AI off, missing authorization, unsupported model selection and some terminal
analysis failures produce disclosed data-only reports. A data-only result may
still contain charges from work already attempted. Cancellation does not undo
remote usage. A saved successful analyst checkpoint can support an explicit
retry if its evidence and execution fingerprint still match.

Retrying a data-only report reuses the analyst passes that already finished and
replaces the fallback with the new run's report. If that run fails again, it
saves a new data-only report and Retry stays available.
When snapshot versions match, reused analysts or synthesis use their lineage's
frozen inputs and Stage B configuration with the original capture time. The
payload fingerprint still has to match; validation runs against the retry's
clock. Legacy or version-incompatible snapshots require fetching inputs again.

## Request ceilings, caching and retries

The analyst pass constant is **64,000 output tokens** and the judge constant is
**96,000**. For an effort-capable Claude model at `high`, `xhigh` or `max`, the
adapter raises `max_tokens` to that model's registry ceiling (currently 128,000
for the listed larger models). Reasoning consumes output allowance. This is a
maximum request setting, not an expected report length or cost. Truncated,
refused, repeatedly paused or incomplete responses are not accepted as complete
research output.

Analyst requests mark a shared evidence prefix for five-minute caching; synthesis
requests use a one-hour cache breakpoint. Cache
eligibility and hits are provider decisions, and differing request schemas can
invalidate reuse. Recorded cache read/write tokens determine charges using
each model's own registry rates; there is no universal cache-price ratio.
The adapter does not request Batch, Claude Fast mode or a
region-specific pricing tier. Anthropic offers fast mode (`speed: "fast"`) on
Opus 5.5 at premium rates ($8/$40 per MTok against Opus 5.5's standard
rates); Metis does not request it, so every Claude cost and cap in this guide
is at standard speed.

The Anthropic SDK's own retries are disabled. Metis owns a bounded transport
loop of up to **six attempts**, including retryable rate/transport failures,
and up to **five `pause_turn` resumptions** within an execution. Retryable
rate-limit responses honor provider retry delays; enforced spend-limit errors
stop. Request timeout and effort-scaled stream-idle limits can abort stalled
work. These paths can create billable requests even when no report completes.
A request whose connection could not be opened (a connect timeout, a refused
connection, an unreachable host or network at connect, or a failed name lookup)
never reached Anthropic and is not charged; a timeout after the request was
sent is presumed. A server error event after the response started (HTTP 200)
but before `message_start` is released, as an HTTP error status is, except that
an error whose text contains "timeout" or "timed out" is read as a timeout after
send and presumed at the request maximum. The stream-idle timer starts before
the connection opens, so an idle limit below the connect timeout (about 10
seconds) presumes a hung connect at the request maximum. The idle limit is
`METIS_STREAM_IDLE_SECONDS` times the effort multiplier (1 at low and medium,
2 at high, 3 at xhigh, 4 at max; 1 for a model without effort).
A pass's recorded cost, tokens and presumed flag are the sum of what each of
its requests settled, retries and pause resumptions included, in both
reservation modes. A request that ends after it started reporting usage but
before its final usage event (a mid-stream server error, a dropped connection,
a stall or a cancel) is recorded as its reported usage plus the most it could
still have generated, marked presumed until `npm run costs:reconcile` lowers
it; with web search or a server fallback the whole request maximum is kept.

The two Fable registry entries configure an explicit server-side refusal
fallback to `claude-opus-4-8`. Other entries have no such fallback. Requests
with fallback exposure reserve for both models, and the ledger uses separate
per-attempt provider billing evidence when available. Missing search/fallback
billing evidence remains conservative presumed spend. This is distinct from
subscription adapters, which do not invoke Claude fallbacks.

## Spend controls and reconciliation

`METIS_MAX_JOB_COST_USD` and `METIS_MAX_ROLLING_COST_USD` are optional;
both are **uncapped by default**. `METIS_ROLLING_COST_WINDOW_MINUTES` defaults
to **1,440**. Default concurrency is one active job and two positive-USD Claude
permits (requests in request mode, whole passes in pass mode). Subscription
calls reserve no USD and do not occupy this paid-capacity limit; active-job
limits and provider allowances still apply.
Limits use persisted costs plus live reservations across workers sharing the
database; they do not cover usage in other apps, other databases, market-data
subscriptions, provider credits, taxes or an independently changed price sheet.

`METIS_RESERVATION_MODE=request` is the default. Every transport retry,
resumption and mirrored judge request must acquire its own reservation before
launch. `pass` retains the larger whole-pass bound covering retry/resumption
exposure. Bounds use conservative input/output ceilings, up to ten server-tool
sampling inputs per search-enabled model and configured fallback exposure.
These are implementation assumptions, not an invoice guarantee. A small cap
can refuse a request whose typical actual cost would have fit. Completed usage
remains recorded when later admission fails.

A job is admitted against the lower of the per-job cap recorded when it was
queued and the cap configured now, so setting or lowering
`METIS_MAX_JOB_COST_USD` and restarting also binds a job that is still queued
or that resumes after the restart or by Retry (a resume keeps the same job row
and its recorded cap). Raising the cap does not loosen an older job; a new
report records the cap in force when it is created.

### Worst-case reservations and the smallest workable cap

A paid request is admitted only if what its job has already spent, plus the
job's reservations in flight, plus the request's worst-case reservation fits
`METIS_MAX_JOB_COST_USD`; `METIS_MAX_ROLLING_COST_USD` is checked the same way
against everything spent in the window and every reservation in flight. The
worst case is the model's whole context window at the cache-write price (ten
sampling inputs for a request that can search), its whole output ceiling and
eight $0.01 searches. It is far above what a request usually costs (compare
the README's estimated run), and it does not vary with effort.

Before a run sends its first paid request, and before a Retry sends its first
new one, Metis prices every reservation the rest of the run will ask for with
the functions admission uses: each pass's lease, each analyst's research and
writing requests, each synthesize section request and any billable verify
request. Repairs, retries, further sections and the mirrored judge order
reserve the same amounts as the requests they repeat. If the largest of these
cannot fit the per-job cap (counting what the job has already spent and has
in flight) or the room left under the rolling cap (counting the window's spend
and every reservation in flight), nothing is sent: the run ends as a data-only
report that adds no cost, and the report and the step details name the pass,
the model, the reservation, the cap that refused it and the smallest cap that
would admit it. A subscription connection reserves nothing and is never
refused this way.

The check is necessary, not sufficient. Requests admitted earlier in a run
spend real money before the largest one is reached, so a workable cap is the
largest single reservation **plus whatever the run spends before that request
is admitted**. A run that passes the check can still be refused later: a
Haiku 4.5 run under a $5.50 cap whose analysts spend more than $0.22 cannot
admit its first $5.28 synthesize section, and that analyst spend is kept in
the ledger. Because a Retry keeps the cap the job was created with, raise the
cap and start a new report in that case.

In practice, leave room above the largest single reservation for the run's
earlier requests. Complete runs on 2026-11-03 cost $1.62 (Haiku 4.5 analysts
at medium effort with the Sonnet 5.5 judge) and $2.28 (Sonnet 5.5 at high).
The earlier Opus 5.5 FIGR runs cost $4.71 at high effort and $12.27 at extra
high. A per-job cap of about the largest reservation plus $10 therefore
leaves a wide margin: about $15 for Haiku 4.5, $40 for Sonnet 5.5 and $65 for
Opus 5.5. The rolling cap needs the same room on top of the window's spend.
The cap bounds the worst case; it is not what a run costs.

Default request reservation mode, registry snapshot 2026-10-03:

| Analysis model | Analyst research request | Analyst writing request | Synthesize section request | Largest single reservation |
| --- | ---: | ---: | ---: | ---: |
| Claude Fable 5.1 | $197.18 | $28.35 | $39.60 | $197.18 |
| Claude Fable 5 | $197.18 | $28.35 | $39.60 | $197.18 |
| Claude Opus 5.5 | $52.64 | $7.56 | $10.56 | $52.64 |
| Claude Opus 5 | $65.78 | $9.45 | $13.20 | $65.78 |
| Claude Opus 4.8 | $65.78 | $9.45 | $13.20 | $65.78 |
| Claude Sonnet 5.5 | $26.36 | $3.78 | $5.28 | $26.36 |
| Claude Sonnet 5 | $26.36 | $3.78 | $5.28 | $26.36 |
| Claude Haiku 4.5 | $2.90 | $0.57 | $5.28 (on Claude Sonnet 5.5) | $5.28 |

The last column is the smallest per-job cap that can ever admit a run, and the
room a run needs under the rolling cap. For every model except Haiku 4.5 it
is an analyst's research request, so the cap must also cover what the other
analyst spends before its own research request is admitted; a request that
does not fit beside one already in flight waits for it to settle. For Haiku
4.5 it is a synthesize section on the Claude Sonnet 5.5 judge floor, so the cap
must also cover both analysts and any earlier sections. The 2026-11-03 Haiku
run under a $3 cap is refused before it starts.

`METIS_RESERVATION_MODE=pass` reserves a whole pass at once, so its largest
reservation is the synthesize pass: six transport attempts, each able to
pause and resume five times, for each of six section requests. That is
$1,140.48 for Sonnet 5.5, Sonnet 5 and Haiku 4.5 (whose judge runs on Sonnet
5.5), $2,280.96 for Opus 5.5, $2,851.20 for Opus 5 and Opus 4.8 and $8,553.60
for Fable 5.1 and Fable 5, doubled under `METIS_JUDGE_ORDER=both`. Analyst
passes reserve less ($107.82 on Haiku 4.5, $971.64 on Sonnet 5.5).

Settlements and validated pass output are stored as durable artifacts with
generation/attempt identity. An expired unsettled paid lease is counted at its
full reserved amount as **presumed spend**. A late settlement can replace that
presumption automatically, except for a request (completed or failed) whose
cost record stayed locked through every retry: that lease is no longer renewed, so it
expires into the presumed row, and only `npm run costs:reconcile` lowers it. A ledger amount based on usage still uses local
registry prices; it is not a provider invoice.

For abandoned requests that never settle, run:

```sh
npm run costs:reconcile
npm run costs:reconcile -- --write
```

The command requires the separate `ANTHROPIC_ADMIN_KEY` when there are rows to
compare. It reads the organization's daily Cost API totals from the oldest
unreconciled presumption through tomorrow, following pagination (maximum 24
pages of 31 buckets). The first command reads remote totals but makes no
reconciliation writes; `--write` lowers qualifying presumed ledger rows.
Ordinary database opening can still perform schema/cache maintenance.
The comparison bounds presumed spend by bucket totals minus recorded
settlements; it cannot attribute an organization total to an exact request.
A presumed row is compared with the UTC day its request was authorized.
Anthropic's documentation does not say which day a request that spans midnight
is reported on, so a request measured across midnight can still be counted in
the later day.
Other organization usage can prevent a reduction. Changes refresh job progress
costs but leave saved report cost figures as persisted. The corrected export
CLI can reconstruct an export's cost from the current job ledger.

Queued paid work normally resumes on server start. Set
`METIS_RESUME_ON_START=0` before startup to hold it for explicit queue resume
in Settings. Updating registry or pricing files does not itself launch work;
starting the application with its normal resume setting can.

## Registry maintenance and validation limits

```sh
npm run models:refresh
npm run models:refresh -- --write
npm run docs:pricing
npm run docs:pricing -- --write
```

`models:refresh` reads Anthropic's Models API using `ANTHROPIC_API_KEY` and the
public pricing page without sending inference. Its default is a registry
dry run; `--write` updates known entries and the snapshot. New models, missing
prices, capability policy and lifecycle changes still require manual review.
`docs:pricing` prints the pricing section from local registry/request policy;
`--write` regenerates that README section. The documentation tests check its
consistency with the generator. Check
[deprecations](https://platform.claude.com/docs/en/about-claude/model-deprecations)
and account access before relying on retained entries.

Offline regression coverage and static request checks do not demonstrate live
model access, quota, current billing terms or research quality. No live paid
inference was run as part of this documentation audit.

One complete report has run live through the Claude Code route. On 2026-11-12
a report for one company ran end to end, on a copy of the database, through
Claude Code 2.1.322 signed in with a Claude subscription. The model was left at
the `default` alias, which the CLI reported as `claude-opus-5-5` for both
analyst passes and the judge, so the judge shared the analysts' model family.
Effort was left at the CLI default, and the CLI did not report the effort it
used. Every pass finished on its first attempt, the report saved and exported,
no paid API fallback occurred, and Metis recorded $0 API cost. The CLI reported
about 1.29 million input tokens (cache reads and writes included) and 118
thousand output tokens; the run took about 17 minutes. Metis runs the CLI with
its tools turned off, so the passes used only the supplied evidence and did no
web research. One run is not a guarantee. It does not show how subscription
usage limits apply on other accounts and plans (Metis cannot read remaining
allowance), nor results with other models, efforts or companies, nor research
quality.
