# Architecture

Metis turns filings, issuer disclosures and market data into inspectable equity
research on the user's computer. A local web app starts jobs, retains their
inputs and results in SQLite, and presents saved reports. Optional AI adds
arguments and synthesis to calculations that work without a model.

## From capture to report

```text
Capture sources -> Stage A: evidence checks and gap manifest
                -> Stage B: deterministic figures
                -> Stage C: context, analyst cases, judge, verification
                -> saved report -> app / Markdown / print
```

Capture gathers normalized provider responses and filing evidence, retaining
source identities, periods and acquisition dates. Before validation and
calculation, the pipeline saves an immutable, content-addressed input snapshot.
Stage A checks freshness and financial identities and builds a manifest of
missing, conflicting or qualified inputs. Source collection and job orchestration
live in `src/pipeline/`; Stage A owns validation and manifest handling rather
than every provider fetch.

Stage B applies evidence admission and sector eligibility rules, then computes
ratios, valuation, scenarios, technicals and scores in TypeScript. A missing or
refused operand stays a gap in dependent results. The calculation receives
explicit options and the captured analysis date; replay does not silently
substitute today's inputs.

Stage C builds a context payload from admitted evidence, computed figures and
disclosed gaps. With AI enabled, bull and bear analysts develop separate cases,
then a judge synthesizes them. Analysts can research; their structured writing
and the judge remain tool-free. Verification makes no model call: it traces
cited figures and checks supported prose for consistency with the cited record.
Citation coverage and checked claims remain separate measures. AI being off or
a failed pass can leave a data-only report with the limitation disclosed.

Assembly combines calculations, available analysis, provenance, verification
and the manifest into a report validated against `src/report/schema.ts`.
Saved reports feed three surfaces: the app reader, Markdown export, and
print-oriented HTML for the browser's PDF dialog. Shared rules in
`src/report/presentation.ts` keep figure wording and availability aligned;
`src/report/export/` implements exports. The audit export holds diagnostics.

## Where to work

Paths below are relative to the repository root.

| Folder | One job |
| --- | --- |
| `src/edgar/` | Extract and admit source-bound filing and XBRL evidence. |
| `src/providers/` | Fetch and normalize external data through provider adapters. |
| `src/pipeline/stageA/` | Validate acquired data and merge disclosed gaps. |
| `src/pipeline/stageB/` | Compute deterministic financial analysis under evidence rules. |
| `src/pipeline/stageC/` | Build model context, run analysis passes and verify claims. |
| `src/report/` | Define the report contract and shared saved-report presentation. |
| `src/ai/` | Manage AI connections, selected routes and subscription transports. |
| `src/models/` | Validate and resolve the checked-in API model registry. |
| `src/db/` | Define local database tables, paths and initialization. |
| `src/app/` | Serve pages and local HTTP request handlers. |
| `scripts/` | Provide development, replay, evaluation and release tooling. |
| `tests/` | Check behavior with offline fixtures and isolated test setup. |

## Rules and boundaries

Code computes every financial figure; models interpret supplied evidence rather
than supplying arithmetic. Unknown inputs become disclosed gaps instead of
guesses. Each figure retains provenance: its source record, period, unit and
established dates. Verification refuses to call an unsupported claim verified.
Saved report bytes are immutable; corrections use read-time views or labelled
replays. App, Markdown and print consume one presentation layer.

Before changing a rule, consult the P1–P27 principles and their **Owner** list in
`CLAUDE.md` in the maintainer checkout; that local working file is not shipped
in the public repository. Change the owning rule rather than adding another
definition at its caller. [Methodology](METHODOLOGY.md) explains the conventions;
[contributing](../CONTRIBUTING.md) describes change control.

The AI boundary is explicit. `src/ai/chatgpt.ts` handles plan OAuth sign-in;
`src/ai/claude.ts` connects to the user's installed official CLI, which keeps
its own authentication. `src/app/api/ai/connections/route.ts` exposes guarded
connection actions and sanitized status; sign-in itself runs no inference.
The separate API inference route uses `src/providers/anthropic.ts`.
`config/models.json`, read through `src/models/registry.ts`, owns API model
identities, capabilities, limits and pricing. Subscription model choices come
from their connection or CLI. Connection failures do not silently switch to
paid API use. `src/proxy.ts` and local request guards enforce the browser
boundary; see [operations](OPERATIONS.md#local-http-api) for its limits.

## Versions and checking a change

`src/report/versions.ts` defines report, payload, pipeline, calculation and
method stamps, with their consumers documented beside them. Report meaning
moves `REPORT_SPEC_VERSION`; model-context meaning moves `PAYLOAD_VERSION`;
orchestration moves `PIPELINE_VERSION`. Changed calculations on identical
inputs move `STAGE_B_IMPLEMENTATION_VERSION`; scoring and method changes move
their relevant stamps too. Update the affected stamps, methodology and
regressions together. Package version is separate. Documentation-only edits
do not move stamps, and historical display cutoffs remain frozen. Compatible
versions govern snapshot and pass reuse; saved reports keep their own stamps.

During development run `npm run typecheck`, `npm run lint`, and focused tests
with `npx vitest run --config vitest.config.ts tests/<affected>.test.ts`.
`npm run verify` runs dependency checks, typecheck, lint, database integration
tests, coverage, build and dependency audit. Tests use offline inputs; a green
suite does not establish live-source accuracy.

Before a refactor, run `npm run golden:run` for the base and changed code, then
`npm run golden:diff -- BEFORE_DIR AFTER_DIR` for the same-report check.
`npm run golden:value-check -- BEFORE_DIR AFTER_DIR` separately guards model
value changes, while `npm run accuracy:check -- RUN_DIR` compares headlines
with filed references and recorded expectations. Deliberate differences need
explicit reasons and the applicable approvals. These checks complement each
other: unchanged output can still be wrong. Panel inputs contain private vendor
data and retained model outputs; keep them and generated runs out of commits.
See [same-report checks](OPERATIONS.md#same-report-check-before-a-refactor) and
[accuracy checks](OPERATIONS.md#accuracy-check-beside-the-same-report-check)
for setup and interpretation.
