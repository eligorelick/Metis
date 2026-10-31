# Offline report evaluation

`reports:evaluate` freezes existing report JSON and evaluates explicitly supplied outcomes. It makes no network or model calls and does not open or modify the database. Inputs remain unchanged. Every output is a new JSON file; an existing file, including a linked file, is never overwritten.

This is measurement infrastructure, not evidence that the report model has been validated. A single report's operating forecast errors and the stock's benchmark-relative realized returns are separate results. Current DCF fair values are **not future stock-price forecasts** and cannot be selected as such.

## Commands

Run these commands from the repository root. Store local report and outcome inputs under the ignored `data/` directory.

```sh
npm run reports:evaluate -- --help
npm run reports:evaluate -- schema
npm run reports:evaluate -- freeze --report data/report.json --definition data/definition.json
npm run reports:evaluate -- evaluate --snapshot data/evaluations/snapshots/SNAPSHOT_HASH.json --outcomes data/outcomes.json --as-of 2026-03-01
```

`freeze` prints its output path and snapshot hash. Its default directory is `data/evaluations/snapshots`; override it with `--out-dir`. `evaluate` prints its output path and included/excluded counts. Its default directory is `data/evaluations/results`; override the result filename with `--out`. Both commands refuse an occupied destination. Supply a new filename for a repeated evaluation, or read the existing result.

The CLI entry point is `node --import tsx scripts/evaluate-reports.ts`. `schema` prints the complete JSON Schemas for definitions and outcome files. Unknown, repeated, or incomplete arguments fail before output creation. The CLI does not allow a user-selected freeze timestamp.

If an output write fails, its destination may contain incomplete data and is
retained for inspection. The writer never deletes a pathname after failure:
another operation could have replaced it. Inspect the failed output and choose
a new destination for a retry.

For cohorts across reports, `npm run research:evaluate -- frozen-evaluation.json result.json` adds paired baselines, chronological holdouts, issuer-cluster uncertainty, missingness and ablation diagnostics. Its separate contract is described in [methodology](METHODOLOGY.md#offline-outcome-evaluation). `research:replay` reproduces deterministic calculations from the acquired-input snapshot; `reports:evaluate` freezes the final report and its explicit comparison definitions. These snapshots serve different purposes and neither supplies missing historical outcomes.

## Prospective report studies

Use the study commands to predeclare the cohort and comparisons **before generating
reports**, then register each report before its fixed deadline. This extends the
same snapshot/evaluation engine. It does not lift the strict V2 admission guard.

```sh
npm run reports:evaluate -- schema
npm run reports:evaluate -- study-init --protocol data/study-protocol.json --dir data/evaluations/studies/my-study
npm run reports:evaluate -- study-register --dir data/evaluations/studies/my-study --slot test-nov --report data/report.json
npm run reports:evaluate -- study-evaluate --dir data/evaluations/studies/my-study --outcomes data/study-outcomes.json --as-of 2026-11-02
```

The last command can run before horizons mature: it reports pending observations.
Repeat with a later evaluation date and actual outcome evidence when available.
The CLI uses its own clock for creation and registration; there is no backdating
option. An occupied study directory or registration file is never overwritten.
Incomplete writes are retained for inspection, not silently discarded. Protocol
and registration hashes are checked on every evaluation.
Registration filenames use SHA-256 hashes of slot IDs, preserving distinct IDs
on case-insensitive filesystems and avoiding Windows reserved filenames. The
original slot ID remains in the protocol and registration record.

A protocol looks like this (synthetic names and numbers; choose future report
dates, deadlines, exact model windows and a real predeclared universe):

```json
{
  "schemaVersion": 1,
  "id": "operating-forecasts-2026",
  "description": "Predeclared revenue forecast study",
  "universe": {
    "source": "Dated retained membership list and inclusion rules",
    "selection": "point_in_time",
    "includesDelisted": true
  },
  "slots": [{
    "id": "test-nov",
    "sector": "Technology",
    "registerBy": "2026-11-01T23:00:00.000Z",
    "definition": {
      "schemaVersion": 1,
      "issuer": { "scheme": "cik", "id": "0000000123", "symbol": "TEST" },
      "identitySource": "Retained issuer filing",
      "asOf": "2026-11-01",
      "methodVersion": "predeclared-model-version",
      "operating": [{
        "id": "revenue-year1",
        "metric": "revenue",
        "scenario": "base",
        "periodLabel": "12M ending 2027-09-30",
        "periodStart": "2026-10-01",
        "periodEnd": "2027-09-30",
        "unit": "USD",
        "currency": "USD",
        "basis": "US-GAAP-consolidated-as-reported"
      }],
      "market": []
    },
    "baselines": [{
      "selectionId": "revenue-year1",
      "name": "flat prior twelve months",
      "value": 100,
      "unit": "USD",
      "currency": "USD",
      "basis": "US-GAAP-consolidated-as-reported",
      "availableAt": "2026-10-30T12:00:00.000Z",
      "source": "Retained source supporting this illustrative baseline"
    }]
  }]
}
```

All intended issuers, report dates, selection definitions and optional baselines
must be declared up front. Only one report slot per issuer/date is allowed.
Baselines must already be available when the study is initialized and must match
the selected forecast's unit, currency and measurement basis. A flat baseline's
value is a *forecast* of the target period made from earlier data, not an actual
for that future period. The report's saved dates must match the definition
exactly; changing a target after seeing a report requires a new disclosed study.

Registration freezes the whole report through the existing snapshot API. It
rejects reports predating study creation, reports generated after registration,
late submissions, mismatched issuer symbols, unknown periods and incompatible
units. Operating periods must end after the registration deadline; daily market
windows must start after it. No DCF current fair value is a future-price forecast.
Projected operating EPS is withheld from study enrollment because it is not a
GAAP diluted-EPS forecast. Revenue, operating margin and unlevered FCFF use the
existing exact-definition comparisons; conventional CFO minus capex cannot stand
in for unlevered FCFF. Rolling windows may not match fiscal actuals, and those
unavailable comparisons must remain missing rather than interpolated.

The outcome packet uses the existing outcome format inside each slot:

```json
{
  "schemaVersion": 1,
  "slots": [{
    "slotId": "test-nov",
    "outcomes": { "schemaVersion": 1, "outcomes": [] }
  }]
}
```

An empty array means no actuals supplied. Add matching operating or market
outcomes using the contracts below when they become available. Duplicate or
unplanned slot packets are rejected. Malformed or dimension-mismatched actuals
remain explicitly excluded. Individual unmatched outcome rows remain in the
per-report audit output. Outcome files and stored reports are never modified.

Study evaluation reads **every planned slot** from its directory. Results retain
missing registrations, pending outcomes, missing matured outcomes and excluded
comparisons. A failed or delisted issuer remains in the denominator. Market
observations include zero ending wealth when supported; distributions, corporate
actions and delisting proceeds must already be incorporated in the supplied basis.
Declared delisting coverage is not independent verification of lifecycle data.

Operating errors are grouped separately by sector, exact days from report to
period end, exact days from registration to period end, period length, full versus
partial-year forecast, metric, scenario, unit, currency, accounting basis, method
version, pipeline version and baseline name. Each group reports observation and
issuer counts, MAE, RMSE, signed bias (`forecast - actual`), issuer-balanced MAE,
and mean absolute percentage error with its own usable count. Actual zero has no
percentage error. Paired baseline improvement is `baseline MAE - model MAE` on
the same observations; a negative value means the model did worse. Baseline
comparisons never mix paired and unpaired sample sets. Raw currency errors depend
on issuer size; percentages can be unstable near zero. Market returns remain
separate from forecast errors.

These are descriptive results. Outputs explicitly carry
`predictiveValidation: false`, `measurementStatus: "operator-declared-dimensions"`
and `custodyStatus: "local-unwitnessed"`. The workflow fixes predeclaration and
cohort accounting within the local application; files can still be deleted or
reconstructed by someone controlling the machine. Hashes cannot attest time,
source truth, accounting semantics or omitted historical revisions. No cohort is
automatically enrolled, no actuals are fabricated, and no grades or scenario
weights are fitted from these results. Independently sourced outcomes, complete
input retention, appropriate sample size and a prespecified held-out study are
still needed before claiming improved predictive accuracy.

## Snapshot definition

The report input is the saved report object itself, including its `meta` object. This example registers one revenue projection and one market-return window. The examples are synthetic and do not claim actual results for a real issuer.

```json
{
  "schemaVersion": 1,
  "issuer": { "scheme": "cik", "id": "0000000123", "symbol": "TEST" },
  "identitySource": "Local issuer filing establishing TEST and CIK 0000000123",
  "asOf": "2025-01-15",
  "methodVersion": "pipeline-version-recorded-with-this-report",
  "operating": [
    {
      "id": "revenue-fy2025-base",
      "metric": "revenue",
      "scenario": "base",
      "periodLabel": "FY2025",
      "periodStart": "2025-01-01",
      "periodEnd": "2025-12-31",
      "unit": "USD",
      "currency": "USD",
      "basis": "US-GAAP-consolidated-as-reported"
    }
  ],
  "market": [
    {
      "id": "one-year-return",
      "startDate": "2025-01-16",
      "endDate": "2026-01-16",
      "securityId": "isin:US0000000001",
      "benchmarkId": "index:test-market",
      "currency": "USD",
      "basis": "split-adjusted-price"
    }
  ]
}
```

The `asOf` date must equal the UTC date of `report.meta.generatedAt`; it cannot move an old report to a new decision date. `generatedAt` must be an ISO UTC timestamp. Snapshotting requires nonempty `meta.specVersion` and `meta.pipelineVersion`. Earlier report schemas remain usable if these fields exist; the entire report is retained without migrating or rewriting it. Only fields needed for the registered evaluation are structurally validated.

Issuer schemes are `cik`, `lei`, or `isin`. The report symbol must exactly match the definition symbol. Outcome issuer scheme, identifier and symbol must all match. Identity evidence is supplied by the operator and is not independently verified. Market `securityId` must additionally identify the specific security/share class; issuer identity alone cannot distinguish share classes. Register the intended benchmark before reviewing outcomes whenever possible.

Operating selections use `report.projections.series` and require exactly one metric and one matching `periodLabel`. Allowed metrics are `revenue`, `operatingMargin`, `fcf`, and `epsDiluted`; allowed scenarios are `base`, `bull`, `bear`, and `weighted`. The value and its provenance come from the saved report, never from the definition. Accepted provenance is either the data-only `computed.projections.<metric>.<scenario>` tag or the AI assembly's exact `payload.computed.projections.<metric>.<scenario>.<period>` identifier, whose components are lowercase canonical slugs. A source for another metric, scenario or period is rejected. A suppressed projection, a missing/nonfinite value, a duplicate selection, or a source as-of date later than the report is rejected.

The definition's period dates must exactly match `periodStart` and `periodEnd` saved on the selected forecast point. A label such as `FY2025` does not establish an exact window. Legacy points without both dates, invalid saved dates, and unsupported saved windows produce `unverified-period` exclusions. Differently dated annual windows produce `forecast-period-mismatch` exclusions, even when the outcome matches the operator's sidecar. The snapshot can still be saved, but an unverified or mismatched forecast never produces a comparable error.

New Stage B forecasts save modeled 12-month windows after the DCF's explicit statement/TTM anchor. For example, a rolling anchor of `2026-03-31` produces a first window of `2026-04-01` through `2027-03-31`, labeled `12M ending 2027-03-31`; that label does **not** make calendar-year 2027 actuals comparable. Each subsequent window starts the day after the prior calendar anniversary. Leap-day anniversaries clamp to February end. These model windows need not match the issuer's fiscal calendar or its future 52/53-week schedule. Actuals must cover the exact saved dates; the evaluator does not interpolate or reassign an issuer's fiscal statements. If the explicit statement anchor is absent, invalid or future-dated, new points retain no period metadata and carry an unverified-period disclosure; annual-history dates are not substituted. Exact dates appear in the app, Markdown and print projection audit trails.

Stage B labels a rolling anchor's forecasts `12M ending yyyy-mm-dd`; the end date in that label must exactly match the registered window. Fiscal `FYyyyy` labels remain supported and their supplied end date must fall in the named year. The inclusive period must span 364–371 days, allowing documented calendar and 52/53-week annual windows. Quarterly, multiyear, and transition-year stub periods are unsupported; they cannot be silently substituted for an annual forecast. Periods must end after the report date. Current-year forecasts may include already elapsed months, so distinguish these horizons in downstream analysis. Choose a consistent accounting basis for revenue. Margin values must be percentages with currency `null`. Monetary forecasts must already carry an exact ISO currency unit such as `USD`, or `USD/share` for EPS; a generic `currency` unit cannot be repaired by guessing.

The projected `fcf` metric is **unlevered FCFF**, so its basis must be exactly `unlevered-FCFF`. Conventional cash from operations minus capital expenditures is not an interchangeable actual. EPS basis must have the form `diluted-EPS;share-basis=<basis>`, for example `diluted-EPS;share-basis=2025-01-15`. The operator must establish that the supplied actual uses the report's share basis; the evaluator neither derives split adjustments nor verifies that assertion.

Market windows use exact observation dates. The start must be later than the report's UTC date because daily data cannot establish whether a same-day observation preceded publication. Choose actual market sessions explicitly; there is no nearest-date substitution. The end must follow the start. Both the security and benchmark must use the registered currency and adjustment basis: `split-adjusted-price` or `total-return-index`. A security cannot serve as its own benchmark.

All registration IDs must be unique across operating and market definitions. Either array can be empty, allowing a legacy report without projections to be frozen for market observations only.

## Outcomes

Strict V2 operating target definitions are available through
`src/evaluation/targetDefinition.ts`. They bind exact fiscal dates, concept, unit,
issuer/security/share/action and accounting definitions, lead and method identity
to retained source/method bytes. Supply actual-observation source bytes separately
in `outcomes.retainedArtifacts`; a frozen forecast's method artifacts cannot bind
evidence acquired after the forecast. V1 registrations remain readable and their
hand calculations remain available, labeled `legacy_dimensions_unverified` and
diagnostic only. Operator-declared forecast kind or partial-year semantics are not
independently certified by the evaluator.

Current report projection points do not retain complete typed security,
accounting, share and corporate-action dimensions. Report freezing therefore
rejects a strict V2 target rather than accepting a contradictory sidecar basis.
Target-free report snapshots remain legacy diagnostics. A versioned adapter that
binds those dimensions to the selected forecast is required before strict report
registration can be enabled; retained hashes alone cannot establish them.

Paired diagnostics separate those exact dimensions and fiscal windows. Calendar
blocks and issuer-balanced descriptive errors do not establish independent
regimes, statistical power or predictive validity; unsupported inferential
intervals are withheld. The optional local `FileEvaluationRegistryStore` retains
hash-chained registrations with lock/fsync/idempotent retry semantics. Its receipt
time is local append time, without externally witnessed or deletion-proof custody.
Contending appends wait up to five seconds for the exclusive lock. An unreleased
lock fails explicitly without changing registry bytes. A lock may be active or
stale; ownership must be established before recovery, so the store never deletes
an unknown writer's lock automatically.

Each outcome ID refers to a registered definition. The following values deliberately produce a revenue error of 20 USD and a security return of 10%, benchmark return of 5%, and excess return of 5 percentage points.

```json
{
  "schemaVersion": 1,
  "outcomes": [
    {
      "kind": "operating",
      "id": "revenue-fy2025-base",
      "issuer": { "scheme": "cik", "id": "0000000123", "symbol": "TEST" },
      "metric": "revenue",
      "periodStart": "2025-01-01",
      "periodEnd": "2025-12-31",
      "unit": "USD",
      "currency": "USD",
      "basis": "US-GAAP-consolidated-as-reported",
      "value": 100,
      "availableDate": "2026-02-15",
      "source": "Local audited annual statement"
    },
    {
      "kind": "market",
      "id": "one-year-return",
      "issuer": { "scheme": "cik", "id": "0000000123", "symbol": "TEST" },
      "availableDate": "2026-01-16",
      "source": "Local adjusted market-level export",
      "security": {
        "id": "isin:US0000000001",
        "startDate": "2025-01-16",
        "endDate": "2026-01-16",
        "currency": "USD",
        "basis": "split-adjusted-price",
        "startValue": 100,
        "endValue": 110
      },
      "benchmark": {
        "id": "index:test-market",
        "startDate": "2025-01-16",
        "endDate": "2026-01-16",
        "currency": "USD",
        "basis": "split-adjusted-price",
        "startValue": 200,
        "endValue": 210
      }
    }
  ]
}
```

For that operating example the report's selected revenue forecast must be 120 USD and its point must save `periodStart: "2025-01-01"` and `periodEnd: "2025-12-31"`. `availableDate` is the date the outcome became observable, not merely the fiscal period end. It must be on/after the registered period end and on/before the evaluation date. The evaluator rejects a future evaluation date. Retain first-release or restated basis information in `basis` and `source`; do not silently substitute later restatements when claiming a historical information set.

Operating dates, metric, unit, currency, and basis must exactly match the frozen definition. Each market leg must independently match identity, dates, currency and adjustment basis. Market starting levels must be positive; ending levels may be zero to preserve a total loss. No FX, split, dividend or other adjustments are performed. Total-return inputs must already include distributions consistently for both legs. Split-adjusted price returns exclude dividends.

Malformed rows, missing rows, duplicate IDs, immature horizons, unpublished outcomes and incompatible metadata are explicitly excluded, never replaced with zero. A malformed top-level file fails the command. Unregistered outcome IDs and rows lacking IDs appear in `unmatchedOutcomes`. Two outcomes for one definition are both excluded as ambiguous; first/last wins is not allowed.

## Output and interpretation

Snapshots contain the complete parsed report, original report/pipeline versions, operator method version, frozen evaluation definition, selected source paths/values/dates, creation timestamp, policy version, canonical report hash and canonical snapshot hash. Hashing sorts object keys while preserving array order. It preserves JSON content, not input whitespace. Evaluation rebuilds and validates the snapshot before using it. A changed report, definition, forecast value, policy or timestamp fails integrity validation unless a new snapshot is deliberately constructed.

Evaluation results carry the snapshot hash, canonical outcome-file hash, policy version, explicit evaluation date, registration timing, included/excluded rows, counts and limitations. Keep the original outcome file beside the result: the result references it by hash rather than copying the whole file. Snapshot hashes are tamper evidence, not signatures, trusted timestamps or protection against an operator deliberately rebuilding history.

Operating results report `signedError = forecast - actual`, its absolute value, and `absolutePercentageError = abs(forecast - actual) / abs(actual) * 100`. An actual zero remains valid but has percentage error `null`. Errors retain each observation's units, dates, scenario and accounting basis. Arithmetic overflow is excluded.

Market results report `(end / start - 1) * 100` for each leg and their arithmetic difference in percentage points. That difference is not a forecast error, risk-adjusted alpha, a geometric relative return or a simulated portfolio result. Neither output aggregates across currencies, metrics or time horizons.

Snapshots created on the report's date are labeled `same-day-snapshot`; later registrations are labeled `retrospective-snapshot`. Neither label proves prospective registration. Backfilled definitions, selective reports, survivorship, benchmark selection and outcome restatements can bias an evaluation. An independently defined cohort and historical information set are still required before making empirical model-quality claims. This tool does not produce calibrated scenario probabilities, prediction intervals, interval coverage, a general accuracy score or evidence of guaranteed investment performance.

## Programmatic interface

`src/report/evaluation.ts` exports `createEvaluationSnapshot(report, definition, frozenAt?)`, `verifyEvaluationSnapshot(snapshot)`, `evaluateReportSnapshot(snapshot, outcomes, asOf)`, the definition/outcome schemas and TypeScript result types. It has no filesystem or provider dependencies. The optional timestamp supports controlled tests; production callers should retain the default current time.

`src/report/evaluationCli.ts` owns argument parsing and exclusive file creation. Tests exercise arithmetic with hand-derived values, identity/period/currency/basis/maturity exclusions, invalid values, snapshot integrity, input preservation and the executable schema command. No test requires live data.

## Accounting-route regression panel

```sh
npm run test:product -- tests/research.routePanel.test.ts --maxWorkers=1
```

The panel exercises seven explicitly synthetic cases: general, bank, insurer,
equity REIT, ADR, loss-making and pre-revenue companies. Each normalized bundle
passes through the real Stage A validation, Stage B computation, data-only report
builder, strict report parser and web/Markdown/print renderers. The tests check
hand-derived financial values, applicable valuation and share bases, unavailable
inputs, suppression, immutable inputs and repeatability. Network access fails the
test; no analyst or synthesis pass runs.

These are integration regressions on controlled inputs. They do not establish
live-provider ingestion correctness, model prose quality, forecast accuracy or
representativeness across real issuers. The computed burn/runway controls also do
not imply that data-only reports expose a dedicated runway table.

The panel caught and reproduces a separate multiples-path defect: an unknown
REIT subtype could emit equity-only P/FFO and P/AFFO despite withholding the REIT
valuation. The shared multiples boundary now suppresses those current,
own-history and peer comparisons with an explicit gap. Supported equity-REIT
values and the mortgage-REIT common-book route retain their own conventions.

## Selected forecast adapter candidates

`src/report/forecastAdapter.ts` supplies the standalone
`adaptSelectedForecastV1(report, metadata, artifacts, requestedTarget?)` boundary.
Its versioned metadata record names an exact deterministic projection path,
value, source, observation day and annual window. Separate retained structured
basis and method records must agree on metric, currency, unit, accounting, share
and corporate-action definitions. Security/ADS identity and ratio, effective
dates and declared availability are checked. An optional requested V2 target
cannot replace missing dimensions or contradict the resulting candidate.

The result explicitly carries `productionAdmission: false` and
`evidenceStatus: "upstream-declared"`. It checks content identity and internal
compatibility of declared records; it does not verify the semantics of their
source documents or establish a trusted historical timestamp. It is a
programmatic candidate-construction boundary, not a report-schema extension.

Ordinary report generation does not acquire these complete metadata records, and
`reports:evaluate freeze` continues to reject strict V2 registrations for current
reports. Adding arbitrary fields or a copied target to an old report does not
enable admission. Validated upstream acquisition and retention alongside the
selected forecast remain prerequisites for production registration.

## Offline claim-review benchmark

```sh
npm run claims:evaluate -- schema
npm run claims:evaluate -- evaluate --corpus data/claim-corpus.json --predictions data/claim-predictions.json --out data/claim-results.json
```

This separate workflow compares supplied checker outputs with explicit reference
labels. It makes no provider/model calls or database writes, preserves input
files, and refuses occupied output paths, including linked files. The schema
command prints both JSON contracts without requiring input data.
Failed writes likewise retain the destination and report the error; an incomplete
output is never treated as a successful benchmark result.

A corpus declares either synthetic reference cases or human-reviewed cases.
Every case retains the claim text, issuer, information cutoff, source text and
metadata, exact source spans and content hashes. Reference reviews bind the
entire case, so editing a claim, source, span or metadata invalidates an old
review. Human references require two distinct independently declared whole-claim
reviewers agreeing, or a distinct adjudicator resolving their disagreement.
Reviewer identities and independence are operator declarations; this tool does
not authenticate reviewers or certify their judgment.

The shipped corpus is explicitly synthetic. It contains adversarial examples
for wrong amounts/directions, issuer/period/availability conflicts, share bases
and compound prose. It supplies no real human-reviewed report corpus and no
empirical evidence of report factual accuracy. A retained citation or numeric
match alone never establishes support for an entire compound claim.

Predictions bind a checker identifier/version, corpus hash and per-case hash.
Results separately report coverage, agreement over all eligible cases, agreement
among attempted whole-claim assessments, false support and support precision.
Missing, abstained, duplicate, changed-hash and numeric-only outputs remain
explicit and stay in the eligible-case denominator. Invalid reference evidence
is excluded with reasons; unknown checker case IDs are disclosed. Eligible
foreign-issuer/future/other-period negative challenges remain in the benchmark
rather than being silently removed. These are descriptive corpus results, with
no confidence interval or general accuracy claim.

The benchmark does not change the production verifier, confidence labels,
grades or report text. A real independently adjudicated corpus and measured
performance are required before any whole-claim checker can affect reports.
