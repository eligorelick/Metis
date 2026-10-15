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

For cohorts across reports, `npm run research:evaluate -- frozen-evaluation.json result.json` adds paired baselines, chronological holdouts, issuer-cluster uncertainty, missingness and ablation diagnostics. Its separate contract is described in [methodology](METHODOLOGY.md#offline-outcome-evaluation). `research:replay` reproduces deterministic calculations from the acquired-input snapshot; `reports:evaluate` freezes the final report and its explicit comparison definitions. These snapshots serve different purposes and neither supplies missing historical outcomes.

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

Paired diagnostics separate those exact dimensions and fiscal windows. Calendar
blocks and issuer-balanced descriptive errors do not establish independent
regimes, statistical power or predictive validity; unsupported inferential
intervals are withheld. The optional local `FileEvaluationRegistryStore` retains
hash-chained registrations with lock/fsync/idempotent retry semantics. Its receipt
time is local append time, without externally witnessed or deletion-proof custody.

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
