# Prospective evaluation and research reliability

Make prospective report evaluation operational and qualify attribute grades and
valuation conclusions using retained evidence. Prompt guidance alone cannot
establish empirical forecast accuracy.

## Intent and approach

Extend existing report evaluation rather than invent new financial calculations.
Record a study protocol before reports exist, freeze selected forecasts before
their registration deadlines, and account for every planned report when outcomes
are evaluated. Publish errors with the exact comparison definitions, sector,
forecast horizon, and failures/missing outcomes. Registration is local custody,
not externally witnessed proof of time or independently certified accounting.

The alternative of changing grade weights or calling the existing tests evidence
of accuracy would be unsupported. The chosen approach adds usable measurement and
exposes sensitivity without claiming results that have not been observed.

## Deliverables

1. Extend `reports:evaluate` with `study-init`, `study-register`, and
   `study-evaluate`. The immutable protocol predeclares issuer/sector membership,
   report dates, registration deadlines, complete existing evaluation definitions,
   and optional baseline forecasts with dated sources. Each planned slot is
   unique. Registrations retain the complete existing report snapshot, so values
   come from the report. Study evaluation iterates the protocol, never a selected
   subset of winners. Missing registrations and pending/invalid outcomes stay
   visible. Duplicate outcome packets are errors. Late registrations and future
   data are rejected. Operating errors are grouped only on compatible dimensions;
   market observations remain separate. The workflow preserves current strict V2
   admission refusals and openly labels remaining operator-declared dimensions.
2. Add per-attribute grade reliability derived from recorded score and applicable
   evidence coverage. Show the mathematical range if unobserved applicable signal
   weight scored between 0 and 100: `low = score * completeness`,
   `high = low + 100 * (1 - completeness)`. This is a missing-input sensitivity,
   not a probability interval. Route-inapplicable inputs are excluded. Unknown
   coverage and unscored aspects produce unavailable results. Preserve numeric
   scores, weights, stored reports and existing grade admission floors. Present
   the same interpretation in the app, Markdown and print exports.
3. Make valuation robustness claims require complete, well-formed grids across
   every included axis. Missing/nonfinite/duplicate/degenerate grid observations
   must not support a robust-above/below conclusion. Crossing observed values may
   establish sensitivity even when the remaining grid is incomplete. Add concise
   analysis-time limitations using existing evidence timing, without pretending
   that retrieval dates prove historical availability.

## Constraints and verification

No paid model calls, live portfolio actions, historical report rewriting, or
unvalidated calibration. No new dependencies. Keep current report formats readable.
Use meaningful hand-calculated regression tests for study admission, full cohort
accounting, exact dimensions, errors/baselines, grade ranges and incomplete grids.
Test all changed rendering surfaces and run TypeScript/lint and the product suite.
Finish with an independent review and resolve material findings. Prospective
forecast accuracy still requires future actuals; report that limit explicitly.
