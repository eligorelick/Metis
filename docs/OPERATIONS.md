# Application operations and API

This guide describes the checked-in implementation including the Metis compatibility update of 2026-10-14.
It covers application behavior; provider access, prices and account allowances
can change independently. See [methodology](METHODOLOGY.md),
[privacy](PRIVACY.md) and [Claude usage](CLAUDE-USAGE.md) for their respective
contracts. Dated files under `audit/` and `internal/superpowers/` preserve historical
findings and design proposals; they are not substitutes for current guides.

## Installation and startup

The Node engine is `>=24`; the CI workflow uses Node 24 on Linux and
Windows. Install the lockfile with `npm ci`, copy `.env.example` to `.env`,
then run `npm run dev`. Production needs `npm run build` before `npm start`.
Both npm server commands bind to `127.0.0.1`; the usual URL is
`http://127.0.0.1:3000`. No separate database migration command is required for
normal startup: `src/db/index.ts` creates tables and applies guarded compatibility
updates when it opens the database. `npm run db:push` is an explicit Drizzle
schema-management tool, not a quick-start prerequisite. It leaves out the
active-job identity index (one queued or running job per share class, so
`BRK.B` and `BRK-B` cannot both run), which Drizzle cannot express; the app
recreates that index the next time it opens the database.

Some existing Windows installations have local-only `./Start-Thesis.ps1` and
`./Stop-Thesis.ps1` launchers; these legacy filenames are retained compatibility
references, not shipped scripts. Where installed, the start launcher runs an already-built production installation
in a hidden process on port 3000 and opens Chrome at its standard installation
path, or the default browser. `-SkipBrowser` suppresses browser launch. The
legacy launcher sets `THESIS_RESUME_ON_START=0` (accepted as an alias of
`METIS_RESUME_ON_START`), `NEXT_TELEMETRY_DISABLED=1` and
`NODE_ENV=production` in the child process, records its PID and start time in
`.local/server.json`, and writes `.local/server.log` and
`.local/server-error.log`. It reuses the matching recorded process and rejects
an occupied port when no matching process is recorded. `./Stop-Thesis.ps1`
stops only the process whose PID and start time match that record, then removes
the record. The launcher does not install dependencies or build the app.

## Pages and saved research

| Path | Behavior |
| --- | --- |
| `/` | Watchlist and research entry point. |
| `/settings` | Provider capability flags, Claude model/effort, AI connections, appearance, and a queue-resume control when startup is held. |
| `/company/[symbol]` | Opens a usable saved report directly from the database. If none exists, loads live analysis. `?view=live` explicitly requests current data and the existing live analysis/new-report controls. |
| `/company/[symbol]/history` | Saved runs for the issuer and selection of reports to compare. |
| `/company/[symbol]/history/diff?a=1&b=2` | Compares two saved reports belonging to the route issuer; orders them older to newer and discloses version differences. |
| `/company/[symbol]/report/[reportId]` | Loads a specific saved report under the requested issuer identity. |
| `/company/[symbol]/report/[reportId]/print` | Dedicated report print view; the browser produces the PDF. |
| `/report/sample` | Synthetic saved-shape demonstration, without running a report job. |
| `/audit-ui/index.html` | Standalone synthetic UI comparison lab: Current, Research workspace and Decision brief prototypes, with simulated data conditions. |

The comparison lab in `public/audit-ui/` makes no provider requests or account
connections and saves no browser/application settings. Its simulated runs and
exports use fixed fictional data; reload resets the lab. Decision brief remains
a prototype there, while the production Settings page offers Metis Ink and
Metis Ivory.

Both production designs expose recorded grade-input and DCF provenance through
keyboard-accessible expandable details. Price and relative-strength charts have
optional data tables using the exact prepared chart values, paginated at 30 rows
with the newest page first in live company analysis and the synthetic sample;
saved report pages do not inject live charts. Missing values remain distinct from zero; relative
strength series can have different baseline dates. These controls expose saved
evidence, not independently verified accuracy or calibrated forecast probabilities.

Symbols are trimmed, validated as 1–12 ASCII characters with alphanumeric ends
and internal dots/hyphens, then uppercased. Dot/hyphen share-class spellings are
treated as issuer aliases for relevant watchlist/report lookups. Lexical validity
does not establish that a ticker exists. `DEMO` and `DBNK` are reserved fictional
fixtures and never request market data from providers, regardless of keys.
**Generating a report for either symbol can still call the selected AI provider.**
Use the sample page or select Data only for a demonstration without inference.

Company analysis rejects instruments whose profile flags identify an ETF or
fund. A report job then ends as `unsupported`, with its reason and without a
company report or AI analysis. Benchmark/sector ETF prices are still inputs to
company technical analysis. Missing instrument flags are not proof of a company's
classification; the gate acts on affirmative provider flags.

## Configuration and settings

Saved report headers expose **Rerun ticker** directly in both designs. History rows, expanded sidebar runs and saved report headers expose **Delete**, followed by confirmation. Deletion removes only the selected report; jobs, source snapshots and cost accounting remain. Active runs cannot be deleted. The deletion API is `DELETE /api/report/view/[reportId]?symbol=TICKER`, protected by the same-origin and local-host guards.

If deletion reports that it is unavailable on this server, restart Metis and reload the page. A running development server can retain the previous route's supported methods after an update, returning an empty HTTP 405 even when the new button is visible. Production servers need a fresh build before restart. Failed deletions keep the run visible and can be retried.

**Ticker data** recalls a compatible local `company_data` snapshot or newer retained run inputs. Revisiting it does not call providers while compatible inputs exist. Inputs from different calculation, report-spec or score-band versions are skipped; after an upgrade, the first visit rebuilds inputs if no compatible snapshot remains. Source timestamps remain visible. **Update ticker data** sends `POST /api/company/[symbol]/refresh`; concurrent updates are bounded and coalesced. The update waits for expired API data but reuses unexpired responses and immutable filings. A transport failure leaves the existing snapshot available. New report runs still acquire source data through the normal provider caches and retain their input snapshots. These recalls are display inputs, not replacements for a historical report's saved calculations.

Ticker calculations and fundamentals chart data are reused within the running server when the complete inputs, calculation settings and implementation versions match. The display cache retains up to eight results. Verified run inputs are also reused, with limits of eight snapshots and 16 million serialized characters per database handle; each read still checks the current stored bytes. Restarting the server clears these memory caches, so the first visit can still take longer. Saved reports and local input snapshots remain on disk. Deletion still refreshes the browser's route cache so Back/Forward navigation does not restore deleted report data.

For Claude account access, install Claude Code 2.1.319 or later, use `claude auth login`, then **Connect local Claude Code** in Settings. Select a CLI alias (default, opus, sonnet, haiku, fable, best) or full model ID and optional effort. The app checks account identity before each pass, records returned models/usage, and never copies CLI OAuth tokens. **Disconnect** stops Metis's CLI processes while retaining the user's terminal login. The separate Claude API route and its model/effort settings are unchanged.

The README configuration table is generated from `.env.example`; the long
comments explain source policies, reservations, timing and paths. Most parsed
server configuration is cached for the process lifetime, so restart after changing
keys or scheduling settings. Next's environment-file loading also retains shell
variable precedence. Maintenance commands that need configuration use
`scripts/lib/load-env.mjs` to load the applicable Next environment files before
using config or database paths. `export:corrected` takes an explicit database path.

| Statement policy | Current behavior |
| --- | --- |
| `auto` | Keeps available FMP members, replaces missing members where eligible, and appends older EDGAR rows separately for each statement family. |
| `fmp` | Keeps available FMP members and disables older-row/predecessor backfill. A missing member can still use issuer-gated EDGAR replacement; this is not a strict vendor-only mode. |
| `edgar` | Rebuilds statement members from eligible EDGAR facts and withholds vendor rows when a filed-facts reconstruction fails. |

EDGAR replacement requires issuer confirmation. Each statement row is served
whole from one source; income, balance sheet and cash-flow rows for the same
period can have different sources. Selecting EDGAR statements still allows other
vendor endpoints for market/profile/estimates and does not disable AI.

Claude's model/effort pair resolves SQLite settings → environment → defaults
(`auto`, `high`). The Settings page saves that pair without restarting. Its writer
uses versioned compare-and-swap, so an older browser tab cannot silently overwrite
a newer save. `npm run settings:reset` previews stored rows;
`npm run settings:reset -- --yes` deletes them, preserving the cache-maintenance
stamp and settings revision counter. `--db <path>` targets another database.
This command does not reset the separate AI connection store or appearance.

AI selection is independently persisted in the connection store. Until an explicit
choice is saved, the default follows the saved or environment Anthropic key:
Claude API when a key is configured, Data only otherwise. Beginning account
setup preserves that implicit default. A saved
unavailable selection does not fall back to paid Claude when authorization fails;
explicitly disconnecting its selected account resets the choice to Data only.
ChatGPT and local Claude CLI model choices are separate from `ANALYSIS_MODEL`; ChatGPT has
its own effort/speed choices. Selection is captured for an execution rather than
re-read in each pass. Credential availability and model access can still fail.
See [AI setup](PRIVACY.md#ai-connection-setup) for the implemented connections
and the live-inference verification limitation.

Appearance is a per-browser `thesis-ui-design` cookie (`current` or `workspace`),
with a 180-day maximum age and `SameSite=Lax`; HTTPS adds `Secure`. It changes
presentation independently of stored research/model settings.

The shipped `.env.example` comments out canonical `METIS_*` settings to preserve
legacy shell and launcher values. Uncomment only intentional overrides: even a
blank canonical assignment wins. Startup warns about conflicting aliases using
key names only, never their values.

## Report lifecycle and recovery

Generation runs fetch → validate → compute → bull → bear → synthesize → verify.
Neither analyst sees the other's output; they share payload/model context and
are not statistically independent. The runner can overlap their requests;
paid Claude work must fit durable permit and budget limits. The active-LLM-call
limit counts positive-USD Claude reservations; ChatGPT and local Claude CLI calls reserve no
USD and are constrained by active jobs and provider allowances instead.
Verification is deterministic and makes no
model call. Missing/disabled AI or certain computation/pass failures can produce
a saved data-only report, with gaps and any incurred costs disclosed. A `done`
job therefore means a saved result, not necessarily completed AI analysis.

SQLite owns job claims, generations, paid permits, pass artifacts and cost
settlements. Starting the same issuer while compatible queued/running work
exists returns the existing job. Terminal statuses include `done`, `error`,
`unsupported`. Canceling writes `error` with `job canceled by user`; Retry may resume compatible durable work. A stopped process is reconciled through lease
expiry by scheduling/write surfaces; status polling and SSE do not reconcile
expired claims or start model work. Reading a company page can fetch provider
data and update caches even though status reads do not mutate job state.

`METIS_RESUME_ON_START=1` starts the scheduler at server initialization;
`0` holds queued work until an explicit resume or a report/retry/cancel request
wakes it. Holding startup does not disable report generation. Canceling makes
the job terminal and aborts local execution where possible; remote usage and
late settlements may still arrive. It is not a refund mechanism.

Retry uses the same job ID and validates durable artifacts, generation lineage,
payload/model compatibility and paid settlement evidence before reusing work.
It may reuse a verified result, reuse synthesis and rerun verification, or reuse
compatible analyst sides and run the missing tail. Analyst or synthesis reuse
uses the lineage's frozen acquired inputs and Stage B configuration when their
versions match, retaining the original capture time. Legacy or version-mismatched
snapshots require a fetch; the payload fingerprint must still match before any
resumed model request. Validation uses the current run clock, so changed
staleness checks can still refuse reuse. New requests remain billable;
earlier spend remains in the ledger. Retry rejects queued/running and
unsupported jobs, active same-issuer conflicts and incompatible/unresumable
terminal work. Start a new report when no compatible tail can be resumed.

Retry of a data-only fallback reuses the settled analyst passes and replaces the
fallback with the resumed run's report; if the resumed run fails again it links a
new data-only report and stays resumable.

Claude USD caps apply to reservations plus settled spend, not estimated typical
run cost. Plan-based usage is not measured by those dollar caps. Abandoned paid
leases preserve conservative presumed spend until a late settlement or explicit
reconciliation lowers it. If another process holds the database writer lock when
a finished request is recorded, Metis retries the write, waiting 0.25, 1 and 4
seconds between its tries (5.25 seconds in all) on top of the database's own
five-second busy timeout on each try, and then keeps the response; a request it
could not record is no longer renewed and is counted at its reserved maximum
when its lease expires, until `npm run costs:reconcile` lowers it. See
[usage controls](CLAUDE-USAGE.md) before sizing caps.

A transient SQLite writer lock during job or paid-request lease renewal waits
for the next renewal beat only while the known lease expiry leaves room for
that beat and the connection busy timeout. Lost authority, insufficient slack
or another error still aborts; this never replays the provider request.

Active-job admission and Retry treat dot/hyphen share-class aliases as one
issuer. Existing duplicate active aliases are preserved; the stronger unique
issuer index is installed at a later startup after those jobs drain.

A resumed missing analyst side receives the same recovery as a fresh side:
one rejected-output repair and, on plan connections, up to three zero-cost
dropped-request resends. Repair feedback is preserved across a dropped repair;
a newly rejected output starts a whole-case repair without continuation.

Fresh pages observe active work first. Otherwise, the newest job is
offered only when terminal and eligible for Retry. Discovery is read-only and
never resurrects an older lineage or starts work.

A verify-reuse Retry carries the frozen snapshot of the effective
successful verification artifact, including its original capture time. It does
not substitute lineage-root inputs when that artifact has no snapshot.

Exhausted judge transport attempts are disclosed as cut-off requests,
with the actual attempt count, rather than report-schema validation failures.
Received-invalid-output controls retain schema wording and unchanged costs.

Successful stream opens clear reconnect warnings. CLOSED streams
reopen after 1, 2, 5, 10 and 30 seconds. After those attempts fail, the client
stops reopening, reads job status once with GET and shows Live connection lost.
Observation never posts work. Replacement streams retain
monotonic revision checks; cancellation and unmount clear pending timers.

Completion observed after a running frame or an explicit start/Retry updates surrounding research once per job. A live-view
completion navigates to saved research instead of rebuilding live inputs;
subsequent settlement revisions still update progress without another refresh.
Attaching to a job already done on load does not navigate or refresh.

Temporary provider rate limits, 5xx, overload and unavailable responses share
the bounded backoff classification and are described as busy or unavailable.
Cut-off streams keep their own wording. Retry-After parsing remains deferred.

Generate starts a new run that runs every pass again, at full cost on a paid connection. The classic saved view points to Live analysis when reusable analyst work is available.

## Local HTTP API

All paths below pass the request-wide direct-Host allowlist. Mutations also
require accepted browser metadata/matching Origin or the startup
`X-Metis-Token` (`X-Thesis-Token` is accepted only when the primary header is absent); cross-site or mismatched Origin requests remain rejected even
with a token. This is a browser-CSRF boundary, not authentication of local
processes. Heavy company GET/HEAD requests additionally filter cross-origin
embeds and speculation. AI connection GET/POST requires the mutation guard
and loopback access. Configured non-loopback LAN mode disables credential and
AI connection management regardless of the supplied Host; stop LAN mode and
restart on loopback to manage keys, while saved credentials still work for runs.
Company landing pages accept only GET and HEAD; other methods return 405 with
`Allow: GET, HEAD`.

| Method and path | Request / successful response | Material error behavior |
| --- | --- | --- |
| `GET /api/watchlist` | `{ watchlist }`, raw stored rows. | Request Host guard applies. |
| `POST` / `DELETE /api/watchlist` | `{ symbol }`; returns updated `{ watchlist }`. | `400` malformed symbol/body; `403` request guard. |
| `GET /api/settings` | Model/effort, choices, sources, revision and capability flags; strong `ETag`, `no-store`. | `500` storage failure; no keys/contact returned. |
| `POST /api/settings` | Exactly `{ analysisModel, analysisEffort }` and current strong `If-Match`; returns authority and new `ETag`. | `428` missing/invalid strong validator; `412` stale validator with current authority; `400` invalid body/selection; `500` storage failure. |
| `POST /api/report` | `{ symbol }`; `202 { jobId }` or `{ jobId, existing: true }`. | `400` invalid JSON/symbol. Provider/instrument failures occur asynchronously. |
| `GET /api/report/[jobId]` | Coherent durable snapshot with revision, steps, costs, terminal details and report linkage. | `404` unknown job. |
| `GET /api/report/[jobId]/stream` | SSE `snapshot` events; event ID is snapshot revision. | `404` unknown job. Reconnect reads current state, not an event history. |
| `HEAD /api/report/[jobId]/stream` | Same existence/status/stream headers with no body/subscription. | `404` unknown job. |
| `POST /api/report/[jobId]/cancel` | No body needed; `202 { jobId, canceled: true }`. | `404` unknown; `409` terminal job or changed execution state. |
| `POST /api/report/[jobId]/retry` | No body needed; `202 { jobId, resumed: true }`. | `404` unknown; `409` active/unsupported/conflicting/incompatible work. |
| `POST /api/jobs/resume` | No body needed; `202 { resumed: true, queued }`. | Guard runs before scheduler; queued count is read before resuming. |
| `GET /api/report/view/[reportId]` | Compact persisted synthesis/grades/verification/cost/completeness summary, not full report JSON. | `400` malformed ID; `404` absent row; unreadable content yields a friendly `200` summary with unknown content fields. |
| `GET /api/export/[reportId]?format=md` | Markdown attachment; default format is `md`. | `400` malformed ID/format; `404` absent; `422` unreadable saved content. |
| `GET /api/export/[reportId]?format=pdf` | Print-optimized HTML and browser print dialog, `text/html`; no PDF bytes from the server. | Same validation as Markdown. |
| `GET /api/ai/connections` | Sanitized connection status, selected route and pending sign-in; `no-store`. | `403` nonlocal/unguarded access; `500` storage failure. |
| `POST /api/ai/connections` | Actions: `connect-chatgpt`, `connect-claude`, `disconnect-chatgpt`, `disconnect-claude`, `models`, `select`. | `413` body over 8,192 characters; `400` invalid action/selection or connection failure; `403` guard. |

The SSE endpoint reads on subscription, polls once per second for other-process
commits, emits only advancing revisions, and sends heartbeat comments every
15 seconds. It closes after a terminal snapshot has no pending settlements.
Read failures retry after 250/500/1,000 ms before closing. Browser reconnects
receive a fresh current snapshot; the endpoint does not implement replay from
`Last-Event-ID`. Polling is the fallback for clients without a persistent stream.

For a script, read the server's printed token-file path and send its trimmed
contents in the header; do not print the token. Use the printed path to account
for overrides and legacy data discovery:

```powershell
$metisToken = (Get-Content -LiteralPath '<printed token-file path>' -Raw).Trim()
Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/report' -Method Post `
  -Headers @{ 'X-Metis-Token' = $metisToken } -ContentType 'application/json' `
  -Body '{"symbol":"AAPL"}'
```

SSE polls read the canonical revision before building a full snapshot.
Unchanged revisions skip artifact and report work; nonterminal snapshots omit
resume-plan folding. Settlement revisions still emit through the same fences.

## Persistence, exports and maintenance

Fresh installations use `<data directory>/metis.db`. Windows uses
`%LOCALAPPDATA%/Metis`, falling back to `%APPDATA%/Metis`; macOS uses
`$HOME/Library/Application Support/Metis`; Linux uses `$XDG_DATA_HOME/metis` or
`$HOME/.local/share/metis`. Existing legacy `Thesis` directories (`thesis` on
Linux) and `thesis.db` (including SQLite recovery companions when the base file
is missing) remain discoverable and preferred when present; the rebrand never
moves or overwrites them. `METIS_DB_PATH` overrides the database file;
`METIS_DATA_DIR` changes the default directory and token location. Neither
redirects AI credentials, which have their own OS-profile store and legacy
directory discovery. A test on a copy must redirect that store too: on Windows
it follows `LOCALAPPDATA` (`%LOCALAPPDATA%/Metis/ai`, or a legacy
`%LOCALAPPDATA%/Thesis/ai` when present), so start the test server with
`LOCALAPPDATA` set to a scratch folder or it uses the real AI connections. Canonical `METIS_*` keys take precedence whenever present,
including blank/invalid values; `THESIS_*` aliases remain supported. See
[compatibility](BRAND.md#compatibility) for the complete naming contract. SQLite data,
API cache, saved reports and `.env` have no application-level encryption.

Credential mutations use the separate permanent `connections.lock` SQLite
mutex in the AI directory, holding native ownership across the read, async
mutation and save. Process exit releases ownership without deleting the file.
Stop every Metis server before upgrading or downgrading this protocol; migrate
only an incompatible lock when instructed, preserving credentials. Never delete a live lock. See [migration and filesystem limits](PRIVACY.md)
and the [native process verification record](audit/2026-10-04-recommendations.md).

Plan-run recovery files live in `<data dir>/recovery/sections` (they follow
`METIS_DATA_DIR`, not `METIS_DB_PATH`). `*.json` files keep completed analyst
and judge sections with writer evidence; `*.usage.jsonl` files keep per-request
usage. Nothing purges them and deleting the database does not remove them:
delete the directory with Metis stopped. A later retry then requests those
sections again and uses plan allowance.

Back up a stopped database with any remaining `-wal`/`-shm` sidecars, or use a
SQLite-aware backup while running. A copied DB without its uncheckpointed WAL
may omit committed data. Legacy import is opt-in with
`METIS_IMPORT_LEGACY_DB=1`, copies `data/thesis.db` and sidecars, and never
overwrites an existing target or applies with an explicit `METIS_DB_PATH`.

Cache freshness uses each caller's TTL and optional stale limit. Eligible stale
rows can return immediately while revalidation runs; bounded stale policies
force a refresh once that limit is exceeded. Quote-priced rows (FMP quote,
batch quote and market cap, and Yahoo's quote) keep their 15-minute TTL during
the US regular session, 09:30 to 16:00 New York on weekdays. Between sessions
a row fetched at least 30 minutes after the last close stays fresh until the
next open, because no newer price exists ([usSession](../src/providers/usSession.ts)).
Exchange holidays and early closes are not modelled, so on those days the plain
TTL applies. Cache admission validates provider
payloads, and selected empty-refresh guards retain a previously nonempty row.
On opening the DB, maintenance runs at most once per 24 hours: compress large
plain cache rows, purge rows older than stored TTL plus 30 days, and VACUUM
after actual work. It does not purge reports, watchlists, jobs or cost history.

Correct an older saved report into new files without rewriting its DB row:

```powershell
npm run export:corrected -- --db 'C:\path\metis.db' --report 1 --out 'C:\exports\report-1.html'
```

The CLI reads SQLite read-only, validates issuer identity/schema, applies legacy
entity safety, adds recorded execution/cost/source disclosures, and writes HTML
plus a JSON sibling. `.html`/`.htm` is replaced with `.json`; otherwise `.json`
is appended. Both destinations must be new. It does not refetch data, recompute
the financial analysis or run inference. A supported legacy read does not make
unknown historic effort or missing source evidence recoverable.

Documentation generators print by default; use explicit writes after review:

```powershell
npm run docs:config -- --write
npm run docs:pricing -- --write
```

`models:refresh` queries Anthropic model availability and published pricing,
prints a diff, and only writes the registry with `--write`; existing capability
and request policies still require review. `costs:reconcile` previews presumed
spend and can read the admin cost report; `--write` applies conservative downward
reconciliation, not a new report. `audit:deltas` compares offline fixtures;
`--write --group <name>` records newly classified changes, whose reason must be
reviewed. Regenerating deltas is not evidence that a financial change is correct.

## Verification and troubleshooting

`npm run test` and `test:product` run the same product suite; `test:changed` runs
only the tests related to files changed against `origin/main`. `test:integration`
isolates the database CLI test. `test:coverage` runs both core and risk coverage
contracts, each of which runs the whole product suite, so `npm run verify` and the
CI `full` job do not also run `test:product`. Shared setup rejects external `fetch` by default, while loopback
test servers are allowed. `EDGAR_LIVE_SMOKE=1` allows SEC hosts only, with a
truthful `EDGAR_CONTACT`; it does not permit other providers. The fetch guard
is process-local, not a sandbox for arbitrary subprocess traffic.

`npm run verify` matches the Linux release sequence: dependency shape, types,
lint, integration tests, both coverage contracts (which run the product suite), build and
security audit. The audit invokes npm with production/dev dependencies and
`--audit-level=low`, so it requires registry access and fails on any listed
severity. Windows CI runs product tests with one worker and the CLI integration
suite. A historical audit's passing counts do not prove the current checkout.

| Symptom | Check |
| --- | --- |
| Environment edit has no effect | Restart the server, check shell precedence and stored model/effort overrides. AI selection is separate. |
| Live SEC evidence absent | Set a truthful nonplaceholder contact; verify ticker/CIK and supported US-GAAP facts. No contact or extension-only/IFRS facts produce disclosed gaps. |
| Run is data-only | Read `analysis.llm`, computation and pass disclosures; check selected connection, Claude registry support and reservations. A run whose largest worst-case reservation cannot fit the per-job or rolling cap is refused before any paid request, and `analysis.llm` names the cap and the minimum needed ([smallest workable cap](CLAUDE-USAGE.md#worst-case-reservations-and-the-smallest-workable-cap)). A key alone does not override a saved Data only choice. |
| Queued work waits after launch | Windows launcher holds startup; resume explicitly. Budget/concurrency gates can also defer admission. |
| Mutation returns `403` | Use the direct allowed authority and matching browser Origin/metadata or current startup token. Restart replaces the token. |
| Settings save returns `412` | Refresh current authority/ETag and reconcile intended edits before saving. |
| Retry returns `409` | Reload durable state; active/conflicting/unsupported or incompatible work needs a different action or new run. |
| PDF download is HTML | Open the print view and use browser Print → Save as PDF. |
| Corrected export refuses a path | Choose new HTML and JSON destinations; existing files are never overwritten. |
| WACC line names a cached or Treasury risk-free rate, or a FRED gap names an HTML page | FRED served a maintenance/outage page (HTTP 200) on both its API and `fredgraph.csv`. The run used the last cached `DGS10` observation (at most 10 business days old) or the Treasury par yield curve, as its `riskFree.substitution` entry says; rerun once FRED is back for a `DGS10` rate. |
| AI store is held by another server | A plan-connection job stops at the start of its fetch step, in one attempt and before any data is fetched, with "AI connections are active in another Metis server"; a pass refused mid-run says the same and is not retried. Use the owning local server or stop it before connecting here; changing DB paths does not isolate AI credentials. |
| AI connection storage cannot be read | Saved reports stay readable and data keys from the environment still work, but the Claude API and admin keys the store holds are withheld, new jobs do not start and nothing is written to the store. An unchanged file is retried after 30 seconds and a changed one at once. For a timeout, retry shortly; after a downgrade, return to the newer build. Otherwise stop Metis, move `connections.v1.json` aside as a backup and reconnect. Metis never resets or overwrites the unreadable file. |

AI-115: A lifetime native SQLite lock in `runtime.lock` proves AI runtime
ownership. A reused PID or EPERM does not block sign-in. Exit or crash releases
the lock automatically; never delete it while servers run. Stop all servers
before upgrading: older binaries use only the saved PID protocol.

Implementation references: `src/app/api/`, `src/app/requestSecurity.ts`,
`src/pipeline/jobRunner.ts`, `jobStore.ts`, `jobScheduler.ts`, `events.ts`,
`src/settings/`, `src/appearance/preference.ts`, `src/db/`, `src/cache/`,
`src/report/history.ts`, `src/report/export/`, `src/ai/`, `scripts/`,
`vitest.shared.ts` and
`.github/workflows/ci.yml`.


## Immutable run inputs and offline Stage B replay

New report runs save a content-addressed snapshot after acquisition and before validation/computation. It contains the normalized full `DataBundle`, its build timestamp, provider envelopes, source excerpts, calculation/report/score-band versions, and the explicit `evIncludeLeases` calculation option. The snapshot used by Stage B is the same frozen normalized object that was saved. API credentials are excluded and credential-bearing query strings/authorization values are redacted, with affected paths recorded.

`run_input_snapshots` stores the immutable JSON by SHA-256 digest. `job_run_inputs` associates each job ID and execution generation with one digest and capture timestamp. Different generations can retain different inputs. Repeated persistence of the same run is idempotent; replacing its inputs or encountering different content at the same digest fails. Capture time is association metadata, so identical input content can be shared by independent jobs. Every read checks the stored content against its digest. Deleting a job association does not delete the content blob.

Saved reports expose `meta.runSnapshot` with the digest, format and capture time. A durable verification resume retains its source generation's frozen inputs and original capture time. Legacy reports without a snapshot remain readable, but the application does not invent immutable historical inputs from today's mutable API cache.

Run from the repository directory using the existing local Node/tsx runtime:

```powershell
node --conditions=react-server --import tsx scripts/replay-run-inputs.ts --job JOB_ID --generation 0 --export-snapshot frozen-inputs.json --output replayed-stageb.json
node --conditions=react-server --import tsx scripts/replay-run-inputs.ts --hash SHA256_DIGEST --output replayed-stageb.json
node --conditions=react-server --import tsx scripts/replay-run-inputs.ts --snapshot frozen-inputs.json --output replayed-stageb.json
```

The first two forms read the local application database (`METIS_DB_PATH` may select an explicit database). The third reads only the exported file. The CLI never fetches a provider or calls a model. Output files use exclusive creation and fail if the destination already exists. Omit `--output` to write the replay JSON to standard output. The output includes `offline: true`, `snapshotHash`, and deterministic `computed` Stage B results.

Replay uses the snapshot's build date and explicit calculation options, independent of the present clock, cache or lease configuration. It checks digest integrity and requires the installed calculation/report/score-band versions to match. An unavailable historical implementation fails explicitly; running today's changed rules on yesterday's input is not labeled an exact replay. These version stamps must be bumped when their calculation meanings change.

`npm run build` retains a frozen offline Stage B replay bundle and writes
`.next/runtime-artifact-identity.json` after compilation. The manifest binds the
compiled server module/manifest file set, captured methodology bytes, dependency
lock digest and available Git metadata to a build token embedded in the server.
Source, method or lock changes during compilation fail identity generation.
Ordinary jobs validate these retained artifacts before attaching local content
identity to their snapshots. A later checkout change does not identify an older
build. Missing, changed or symlinked build evidence leaves identity incomplete;
legacy snapshots remain readable and replay output labels them `legacy-unverified`.

For a snapshot captured by an ordinary built runtime, preserve its `.next` build
and replay with the retained engine:

```powershell
node --conditions=react-server --import tsx scripts/replay-run-inputs.ts --snapshot frozen-inputs.json --runtime-build .next --trust-local-build yes --output replayed-stageb.json
```

`--runtime-build DIR` requires explicit `--trust-local-build yes`: it executes
code from a local build that you trust. Never use it with an untrusted or
downloaded artifact. The snapshot file never selects an executable path. The
CLI validates snapshot integrity, the manifest and the exact compiled file set
before importing the retained bundle. Importing evaluates its module code;
the exported build token is checked after that evaluation, followed by its
version checks and Stage B calculation. Content hashes are not signatures or
authentication and cannot make an untrusted build safe to execute.

The frozen compiler specializes the same Stage B functions to require explicit
captured calculation options. It omits evaluation effects of unused live
provider imports and refuses emitted credential-store, database, cache, ambient
configuration and external I/O dependencies. The retained bundle may import only
Node's cryptographic hashing module; it does not reproduce provider/environment
side effects. Parity tests compare complete computed outputs across synthetic
general, bank, REIT and cash-burning inputs with ambient lease settings reversed.
Preserve `BUILD_ID`, `runtime-artifact-identity.json` and `server/` together.
Git metadata may be unavailable in a packaged build. These are local content
hashes, not attestation of provider provenance or the installed application.
The build uses the explicitly pinned development dependency `esbuild` to freeze
the replay graph; this adds no new resolved dependency package.

An acquisition adapter can still supply actual method/dependency bytes through
`createSnapshotArtifactIdentity` and the fourth `captureRunInputSnapshot` argument.
For those identities, use matching `--method-artifact FILE` and
`--dependency-lock FILE`, plus the recorded `--code-commit SHA` and
`--dirty-diff FILE` when present. These checks include recorded null values and
verify supplied byte identities; they do not attest an executing dependency graph.
Raw artifact flags cannot be combined with `--runtime-build`.

Trusted server embeddings may set `RunJobOptions.aiSelection` for a single run.
The runner copies that selection once and uses the existing connection, admission,
fingerprint and execution telemetry paths. It does not change stored preferences;
the public report endpoint continues to use the user's selected connection.

This contract reproduces Stage B calculations and preserves the evidence acquired for the run. It does not reproduce nondeterministic model prose or turn a recently acquired restatement into point-in-time historical evidence. Information availability and historical outcome evaluation require the separate evaluation contracts.

Complete schema-rejected answers persist only as rejectedText. partialText remains reserved for partial/truncated section recovery, so identical later carried sections cannot credit a rejected complete attempt in the cost breakdown.

Corrected exports retain recorded completeness. An absent record stays absent when no legacy EDGAR/XBRL entry is added. Added legacy entries recount under a confirmed original convention, or use the current count when no convention is confirmable. The summary includes recordedDataCompleteness beside dataCompleteness.

History comparisons distinguish a withheld grade (became unavailable or available) from an added or removed section (DB-002).

History names recorded effective API and account models and identifies passes with unknown actual models (DB-003).

Printable saved-report browser titles identify the symbol, company and report id (RPT-001).

Price-history window fallback: transient transport failures, 429, 500, 502, 503 or 504 may use a cached window for the same provider, symbol and endpoint whose start and end precede the requested window by at most seven days. Acquisition age is capped at seven days. Endpoint and manifest disclosures mark the fallback stale and name its source window and original fetch time. Explicit refusals, schema and identity errors are not covered (DATA-114).

Current-date history tails refresh in the foreground on the session-aware 15-minute policy; failed refreshes are disclosed as refresh-failed. Older history keeps the normal 24-hour TTL (DATA-112).

EDGAR contacts must use printable ASCII or Latin-1 letters. If Settings refuses a character in a declared name, transliterate it before saving; the contact is sent as an HTTP header.

DATA-114: when a merged FMP history uses a window fallback, the series ends at the earliest last bar of its accepted fallback chunks. Later successful bars are withheld to avoid a gap; endpoint text and stale metadata disclose the truncation.

Core coverage holds every Stage B and report-schema file to 85/75/85/85 (statements/branches/functions/lines), alongside the unchanged 90/84/95/93 aggregate. Risk coverage retains its 85/75/85/85 per-file gate. Every TS and TSX source has a named placement.

## Same-report check before a refactor

`npm run golden:run` and `npm run golden:diff` show whether a code change leaves reports identical. They rebuild seventeen stored cases offline and compare two commits' output byte for byte: thirteen companies with saved run inputs. Each company gets a data-only report, and AMZN, META, MU and NVDA also get a report from their stored analyst output. For every case the harness pins the Stage B output, the Stage C payload and its fingerprint, the report JSON, the Markdown, print and audit Markdown exports, and both web layouts (classic and dossier) rendered from the saved-report reader. `scripts/golden/cases.json` lists the inputs by SHA-256 only.

```powershell
npm run golden:run -- --ref main --out tmp/golden/before
npm run golden:run -- --out tmp/golden/after
npm run golden:diff -- tmp/golden/before tmp/golden/after
```

- `--ref REF` extracts that commit with `git archive` into `tmp/golden/trees/` and runs its code. Without `--ref`, the run uses the working tree and records a hash of any uncommitted changes. Both use the installed `node_modules`; the diff notes when the two commits' `package-lock.json` differ.
- The first run reads the inputs from a database in read-only mode (`--db FILE` or `METIS_DB_PATH` chooses it) and caches them under `tmp/golden/inputs`. They contain vendor data, so they stay local and are never committed. Pass the check database (below) with `--db "%USERPROFILE%\metis-check\check.db"`.
- Each case runs in its own Node process. Fetch, sockets, TLS and DNS are blocked. Provider keys and `METIS_*`/`THESIS_*` settings are removed from its environment. The clock is fixed to the inputs' build time, and the time zone is UTC. A scratch database and data directory sit inside the output folder. No model is called and nothing is spent.
- `golden:diff` exits 0 only when every case, field and file matches. Otherwise it lists each changed file, with JSON leaf paths or the start of a text diff. An intended change passes only when listed in `--approved FILE`, with its before and after hash and a reason; a file that only one run produced uses `missing` as the hash on the other side.
- A run takes about 1–2 minutes on four processes (`--jobs N` changes the count; `--only id,id` picks cases). Run it twice on one commit to confirm the output repeats exactly.
- Limits: the analyst-output cases cover only the general route. The verify step uses no fetched URLs, and the cost table is empty.

Which company covers which kind of report (the route and overlays are the ones `golden:run` writes to `manifest.json`):

| Case | Kind | Route and overlays |
| --- | --- | --- |
| AMZN, META, MU, NVDA, QCOM | Ordinary US companies | general |
| FIGR | Recent IPO | general + recent-ipo |
| JPM | Bank | bank |
| PGR | Insurer | insurer |
| O | Equity REIT | reit |
| DUK | Regulated utility | general + regulated-utility |
| TSM | Foreign filer (Form 20-F, ADR) | general + adr |
| RIVN | Loss-making company with revenue | general + unprofitable |
| VKTX | Pre-revenue company (no revenue in any period) | general + unprofitable + pre-revenue |

**The check database.** The seven newer cases (JPM to VKTX) were captured on 2026-11-12 into the check database at `%USERPROFILE%\metis-check\check.db`. It is a copy of a backup of the app database, kept only for this check. Captures never open or write the app's real database (under `%LOCALAPPDATA%`). Without `--db`, `golden:run` reads that real database (read-only) for any input not yet cached, so pass `--db` to use the check database instead. The older ten cases' inputs are in it too, so `--db "%USERPROFILE%\metis-check\check.db"` exports all seventeen.

To add a case:

1. Pick a company and run it as a data-only report (AI off) against the check database: start the app or the job runner with `METIS_DB_PATH` set to the check database and `METIS_DATA_DIR` set to a fresh folder such as `%USERPROFILE%\metis-check\data`, with no Anthropic key and no AI connection. Live financial-data calls are needed for this one capture. Check that the job finished as data-only with no model step run and zero cost.
2. The run freezes its inputs in the `run_input_snapshots` table. Read the run's snapshot hash from `job_run_inputs.snapshotHash` for that job.
3. Add `{ "id": "<ticker>-data-only", "snapshot": "<hash>" }` to `scripts/golden/cases.json`.
4. Run `golden:run` with `--db` twice into two output folders and confirm `golden:diff` reports no changes, every case has status `ok` and `reportSchema` `ok`, and the route in `manifest.json` is the one you meant to cover.
5. Add the company to `scripts/accuracy/companies.json` and rebuild the filed reference (next section).

## Accuracy check beside the same-report check

The same-report check proves a change left reports *unchanged*; it does not prove they are *correct*. `npm run accuracy:check` compares the headline figures of every data-only case in a `golden:run` folder with the values the company filed with the SEC, and fails when a change makes any figure less accurate.

```powershell
npm run golden:run -- --out tmp/golden/after
npm run accuracy:check -- tmp/golden/after
npm run accuracy:check -- tmp/golden/after --report tmp/accuracy/BASELINE.md --json tmp/accuracy/baseline.json
```

- **What it compares.** One mapping (`scripts/accuracy/figures.ts`) reads each case's `stageB.json` and `report.json`: the latest fiscal year's revenue, operating income, net income, diluted EPS, diluted shares, capital spending and free cash flow; the TTM operating income, net income, operating cash flow, capital spending and free cash flow; cash and short-term investments, total debt and lease lines at the latest balance; and every fair-value input that comes from filings (the DCF's base revenue, tax rate, share divisor, net debt, NCI, preferred and long-term investments; the excess-return opening book, income to common, divisor and payout; the REIT's FFO parts and divisor; runway cash). Value, period, unit and currency come from the stored output. Market inputs (price, beta, risk-free rate, consensus, FX spot rates) are not filed values and are only listed.
- **What it compares with.** `scripts/accuracy/reference.json` holds the filed value for each figure's period with its filing (form, accession, filing date, concept or composition). Only filings dated on or before the report's evidence cutoff count, and the newest wins (P2), compared across every equivalent concept a recipe lists (concept order only breaks a tie on the filing date). The check reuses the reference only for the cutoff it was built for: when a run's cutoff falls on another day than `reference.json` records for the case, or any operand was filed after the run's cutoff, it stops with an error naming the case and both cutoffs; rebuild the reference for that run. TTM flows are the fiscal year plus the year to date less the prior year to date, both year-to-date figures from one filing (P1); per-share values are never built that way. A figure that shows an older fiscal year than the report's own latest is a period mismatch.
- **Same value** is the rulebook's P8 owner (`src/edgar/vendorAgreement.ts`); the check adds no tolerance of its own. Before the value is compared, the reference's unit (amount, per share, shares or percent) and comparison currency, which `reference.json` records for every filed value (after the report's own stated translation, as for TSM's USD DCF inputs), must equal the figure's; any disagreement is a mismatch, never a match (P3, P4).
- **A line the filing does not present.** Non-controlling interest and preferred stock count as a filed zero only when the filing that carries the balance sheet at that instant was filed on or before the cutoff, tags none of the value's concepts, and its own XBRL instance (read by the fetch, since companyfacts drops dimensional facts) shows no other NCI or preferred element, dimensional member (such as `NoncontrollingInterestMember` on the equity statement) or, for NCI, a gap between total and parent equity. Otherwise the reference is not established (P7, P10).
- **Status per figure:** match; mismatch (with a cause in the expectation: Metis error, definition, or vendor value shown); gap (Metis withholds the figure; the Markdown says whether the value is in the filings); not established (no filed value could be proven; never counted as a match).
- **Pass or fail.** `scripts/accuracy/expectation.json` records each figure's status and, for anything that is not a match, a 16-character SHA-256 prefix of Metis's value (the value itself is not committed: it can carry vendor data). The check exits 0 only when every status equals the expectation and every non-match value is unchanged. Otherwise it lists each difference as better, worse, changed value, new or missing figure. A figure that stays a match may change value freely, because it is still proven against the filing.
- **A deliberate change.** Update the expectation in the same change, with a reason: `npm run accuracy:check -- tmp/golden/after --update-expectation --reason "D-nnn: ..."`. Every changed entry gets that reason as `changeReason`; review the diff of `expectation.json` like code. A number may move only when the new value is proven against the filing: a mismatch that becomes a match, or a wrong value that becomes a disclosed gap, is better; anything else needs a decision entry that says why.
- **Rebuilding the reference.** `npm run accuracy:fetch -- --network --run tmp/golden/after` downloads SEC XBRL company facts (cached under `tmp/accuracy/edgar`; `--refresh` downloads again), reads from the golden run only each figure's period and the report's cutoff, and rewrites `reference.json`. It is the only part that uses the network and refuses to run without `--network`. Set `EDGAR_CONTACT` (a name and email; SEC requires it in the User-Agent) in the environment first. Where SEC's company facts lack a filing, `companies.json` names it under `instanceFilings` and the fetch reads that filing's own XBRL instance. Where an issuer files a line under another concept, `companies.json` overrides the recipe for that figure and says why.
- **Limits.** Values in filings without XBRL (8-K earnings releases, Form 6-K quarterly reports) are not read, so those figures stay not established. The causes in `expectation.json` are a reviewer's reading of each mismatch, not computed. CI cannot run the real check because the golden inputs are local; `tests/accuracyCheck.test.ts` covers its logic on synthetic data.
