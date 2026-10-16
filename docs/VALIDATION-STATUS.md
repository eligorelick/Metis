# Research validation status

Updated 2026-10-16 for report 1.19.3 / payload 1.24.2.

D-74 corrects deterministic principal summaries: an included financing option
cannot be added to its offering total. Computed sums require proven distinct
named issuance tranches; unsupported wording withholds the sum. Legacy views
and exports remove the exact earlier generated annotation with an informational
correction disclosure. Original stored reports, model output, usage and analysis
conventions remain preserved; no paid analyst or judge rerun is involved. The
actual frozen CRWV analyst payload is byte-identical (fingerprint
`1.24.2:71b55ac7`; exact SHA-256 recorded in D-74), so only the report convention
stamp changes.

D-75 additionally binds plain table scales immediately preceding explicit date
columns. Conflicting declarations and unsupported qualifiers remain unchecked.
Frozen CRWV replay corrects only `balanceSheet.coverage.numbers[2]` and
`balanceSheet.coverage.commentary[2]`; commentary remains numeric-only support.
The original report, snapshot, computation and analyst payload are unchanged,
with no paid rerun. Corrected exports preserve the original report 1.19.2
convention; new reports use 1.19.3, while payload and Stage B remain unchanged.
The complete combined D-74/D-75 local `npm run verify` passed: 6,377 product
tests (three skipped), four database integration tests, both configured coverage
gates, production build and zero-vulnerability security audit. Independent source
review found no remaining reviewed blocker. Fresh required CI remains pending;
these checks do not establish forecast accuracy or calibrated grades.

The NVDA audit recovery (D-65 through D-72) changes consensus calendarization,
the non-operating investment bridge and valuation date. The subsequent debt
completeness correction (D-73) stamps Stage B
`STAGE_B_2026_10_DEBT_COMPLETENESS_1`. Older snapshots require their original engine;
saved reports retain their original conventions. The recovery also adds typed
filing and governance disclosures and conservative numeric-claim matching.
These changes have implementation and frozen-input regression evidence; they
do not establish institutional readiness, forecast accuracy or an independent
model-family review. Release verification and live-run results are recorded
in the recovery plan and decisions log.

D-72 follows the PR review with exhibit-bound financial facts, amended-release
collection, whole-row quarterly selection, current reporting-currency evidence,
and guards against unsupported EPS, acquisition double counting, segment-history
relabeling and incomplete analyst distributions. Source `47a43dd` passed its fresh
complete local gate: 6,256 product tests, four database tests, coverage floors,
build and zero-vulnerability security audit. PR #20 merged after required full
and Windows CI passed. A post-merge Windows export I/O test exceeded its implicit
five-second deadline; PR #21 then aligned the direct I/O cases to explicit
15-second deadlines and merged after both push and PR full/Windows checks passed.

D-73 follows source-data preflight with conservative debt completeness and
filing-presentation reconciliation. Its changed context cannot resume earlier
analyst artifacts as equivalent. Cross-date or impossible free-float percentages
are withheld while the float measurement retains its own date; valuation share
counts are unchanged. The subsequent test-only Windows SQLite timing policy in
PR #23 passed both required full and Windows checks on main. D-74's source and
presentation correction requires its own local gate and fresh CI.

The fresh NVDA output and its explicitly labeled corrected replay are recorded
in D-71. Independent arithmetic reconciled the valuation and score; the source
review repaired omitted disclosures and verifier false positives. The corrected
artifact leaves six numeric and 14 qualitative claims unvalidated. Its one
source-bound editorial wording correction is disclosed, with the original
model output retained. This is reviewed consistency evidence, not a measured
forecasting track record.

The META audit repairs evidence handling, numerical consistency, period identity,
and reproducibility. Passing implementation tests does not establish predictive
accuracy. Production grade cutoffs, factor weights, and scenario display weights
remain uncalibrated.

## Available historical evidence

The local finishing audit inventoried 30 saved reports completed October 12–14,
2026. None had an original immutable acquired-input snapshot. The audited
long-horizon forecasts have not matured. Reconstructing their inputs from a
mutable current cache would not establish the historical information set, and
the newly corrected model cannot be backdated as a forecast produced then.
Consequently this inventory supports no accuracy estimate or threshold change.

The individual report content and acquisition snapshots remain local. The
inventory describes the available local evidence, rather than every dataset a
future user could supply.

## Prospective monitoring started

On October 14, 2026, fresh inputs were frozen for META, AAPL, MSFT, JPM, XOM and
COST. The evaluator accepted 25 exact-window revenue forecasts from the five
general-route issuers; all 25 have pending outcomes, with no rejected samples
and no observed performance groups. JPM's bank route contributes an input
snapshot but no invented industrial DCF forecast. The baseline is unchanged
latest-12-month revenue, fixed at forecast capture. The model's raw operating
errors will remain separate from grading/return evaluation.

The local artifacts are preserved under
`data/evaluations/meta-audit-20261014-1945/`, which is ignored by Git. The cohort
manifest SHA-256 is
`eb759fe8027826db3ea3fb199b244a1beb416abef6885654963a00c3a26f4a35`.
This is a deliberately selected monitoring cohort, with future delistings to be
retained. It is not historical validation or evidence of representative skill.
The fresh META acquisition snapshot also reproduced identical Stage B outputs
through the offline replay CLI.

## Evaluation workflow

1. Freeze acquired inputs with the normal report pipeline. Preserve its input
   hash, calculation versions and capture time; use `research:replay` for a
   deterministic calculation check.
2. Register the final report's exact forecast windows, issuer identity and
   accounting basis using `reports:evaluate freeze`. Preserve initial report
   values and register benchmark/security identities before observing returns.
3. Define a dated cohort independently of outcomes. Retain exclusions and any
   delisted members; do not select only today's successful companies. A small
   convenience cohort is useful for monitoring, not population validation.
4. Supply first-reported SEC outcomes for the exact forecast periods. For stock
   results use independently sourced security and benchmark total returns,
   including distributions and delistings. DCF present values are not future
   stock-price predictions, and a grade is not a numerical return forecast.
5. Use `research:evaluate` for paired comparisons against baselines frozen at
   prediction time, chronological holdouts, issuer-cluster uncertainty, and
   missingness/ablation diagnostics. Its five-issuer bootstrap minimum is a
   software guard, not evidence of adequate statistical power.

## Gate before changing production grades

Pre-register the proposed grade interpretation, outcome horizon, cohort,
baseline, candidate weights, and decision criterion. Separate operating forecast
errors, grade/return associations and narrative factual errors. Evaluate
candidates with only training labels available at each cutoff; keep a final
chronological holdout untouched. Preserve sector, currency and accounting-basis
comparability and report adverse as well as favorable results.

Only consider a production change after repeatable out-of-sample evidence
supports it, its uncertainty and stability are acceptable, and the candidate
passes the software release gate. The current evaluators provide measurement
infrastructure; they do not automatically tune or approve production grades.
