# Research Reliability Implementation Plan

> Use superpowers:executing-plans and focused independent implementation/review where useful.

**Goal:** Make forecast evaluation operational and make grade/valuation uncertainty visible.
**Architecture:** Extend existing offline report snapshots and shared presentation functions. Keep forecasts and actuals separate and immutable; use recorded scores for presentation-only diagnostics.
**Tech stack:** Existing TypeScript, Zod, Node filesystem, React and Vitest.
**Spec:** `docs/superpowers/specs/2026-10-31-research-reliability-design.md`.

## Global constraints

No new dependencies, paid model tests, live investment actions, historical report mutations, or automatic grade-weight calibration. Preserve strict V2 admission. Continue in the current isolated worktree and preserve the previous prompt patch.

## Review focus

- Missing or failed issuers must remain in the study denominator.
- Rehashed files do not establish truthful time or accounting semantics.
- Do not pool different metrics, units, bases, scenarios or forecast horizons.
- Unknown legacy coverage is not perfect coverage; route suppressions are not missing data.
- An incomplete grid cannot support robustness, even when all visible cells agree.

### Task 1: Prospective study workflow

Files: new `src/report/evaluationStudy.ts`, `src/report/evaluationStudyStore.ts`, tests; extend `src/report/evaluationCli.ts` and `docs/REPORT-EVALUATION.md`.

- [x] Add failing tests for protocol uniqueness, deadlines, no retrospective reports, immutable registration, complete cohort accounting, exact operating comparisons and paired baselines.
- [x] Implement pure study contracts, sealed protocol and registration validation using existing snapshot APIs.
- [x] Add exclusive-write filesystem storage and CLI subcommands. Evaluation reads every expected slot from its study directory. Output never overwrites input.
- [x] Group descriptive operating errors by sector, lead horizon, scenario, metric/unit/currency/basis and method version. Report pending, missing and excluded observations separately and retain market results separately.
- [x] Document runnable protocol, registration and outcome examples and all custody/measurement limitations.
- [x] Run focused study/evaluation tests, lint and typecheck.

### Task 2: Attribute grade reliability

Files: new `src/report/gradeReliability.ts`, tests; shared scorecard presentation and app/Markdown/print rendering.

- [x] Add failing tests with hand-calculated 80 at 50% coverage => range 40–90, full coverage => fixed range, unknown coverage => unavailable, and route-inapplicable => unavailable.
- [x] Implement shared diagnostics with band endpoints and an explicit missing-input sensitivity label; never return a probabilistic confidence interval.
- [x] Wire one consistent table into app, Markdown and print scorecards, keeping compact reader text and existing grades/weights unchanged.
- [x] Verify rendering parity and old reports; run targeted tests and lint.

### Task 3: Valuation and timing reliability

Files: `src/report/scenarioPresentation.ts`, `src/report/evidenceTiming.ts`, associated tests and shared presentation if needed.

- [x] Add failing incomplete/malformed/duplicate grid tests.
- [x] Require complete unique Cartesian coverage for robustness in both DCF and excess-return grids. Preserve sensitivity conclusions supported by actual crossing observations.
- [x] Expose a concise analysis mode/timing limitation through existing shared timing rows.
- [x] Run relevant report and export tests.

### Task 4: Integrated verification and review

- [x] Run product tests, TypeScript and targeted lint; record any unrelated failures.
- [x] Obtain independent review of all changes and fix material findings.
- [x] Update this ledger and README with actual capabilities and limitations.

## Progress and rulings

- Planning: a local prospective study is useful without claiming strict source certification. Existing strict V2 refusals remain effective; a missing upstream metadata producer must never be replaced with guessed metadata.
- Planning: author the study and grid changes in the main agent; delegate grade presentation as an independent task with exclusive file ownership. Final review covers the combined changes.
- Implemented: all three deliverables use existing report/evaluation contracts. A current-day evaluation is capped at the actual clock instant; later same-day deadlines remain open. Result identity includes that evaluated instant.
- Review corrections: use hashed registration filenames to distinguish case-sensitive IDs on Windows; preserve actual growth/margin crossings without WACC; describe only validated coordinates; qualify old saved robustness claims at read time; stabilize machine-precision grade endpoints without promoting genuine subthreshold scores. Each issue has a failing-before/passing-after regression.
- Preservation evidence: the historical comparison moves only `report.scenarioPresentation`, changing unsupported robustness to unavailable for a 40/50-cell grid. The payload golden restores one exact 29-byte wording delta before the unchanged complete financial/provenance pins. D-139 records this scope.
- Verification environment: use Node 24, matching the installed native SQLite module. The default Node 26 binary cannot load that ABI; no dependency or global runtime setting was changed. Focused tests, TypeScript and modified-file lint pass. The new grade helper has 100% coverage; both new study modules meet the repository's per-file risk thresholds. Final integrated coverage/build receipts follow below.
- Final verification (2026-10-31): the complete risk-coverage run passed all 553 product test files: 13,309 passed and three existing skips. All configured per-file thresholds passed; aggregate statement/branch/function/line coverage was 95.75/90.54/98.27/97.76%. TypeScript, modified-file ESLint, the four database integration tests, production build, CLI help smoke and whitespace checks passed. The earlier README wording regression was corrected and passed its focused check and the complete coverage run. The scheduler race test also passed in both its focused and complete serial runs; no remaining failure is being waived.
- Verification limits: this is implementation and retained-fixture evidence. No new live cohort, matured actual outcomes, paid model evaluation, predictive-accuracy estimate or grade calibration is claimed. No production deployment or remote branch update was performed.
