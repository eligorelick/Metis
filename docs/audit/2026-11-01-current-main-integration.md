# Current-main integration checkpoint

This record supersedes readiness claims made against the older local checkout.
The integration starts at upstream `4ec0368ae8b17a8d4c8dc6fc1d2a862c2b92bddc`.
The original checkout and its pending changes are preserved separately; none of
its older source files are wholesale replacements for current main.

## Baseline and disposition

- [x] Current-main baseline on Node 24.11.1: 553 product test files passed;
  13,309 tests passed and 3 skipped. Type checking passed.
- [x] Initial Node 26 baseline exposed browser-storage failures and a test timeout;
  rerunning with the CI runtime family and four workers passed without code edits.
- [x] Preserve current source-bound receivables pair selection, analyst minimum
  content checks, positive targets, section-writer provenance, financial conflict
  handling, and provider settlement accounting. Older replacements are superseded.
- [x] Reproduce and integrate the scoped material defects on current main; final review corrections and release acceptance are recorded below.
- [x] Complete integrated local release gates and independent review.
- [ ] Verify hosted PR checks before the authorized merge.

## Verified batch 1: data-provider request handling

- [x] Reproduced nine failing assertions on current main before changing production
  code: final transport failure hidden by an earlier HTTP response; cancellation
  during a queued rate limit; abandoned redirect response bodies; FINRA/Finnhub
  JSON-body cancellation; and missing bounded FRED fallback diagnostics.
- [x] Ported the focused request-handling fixes. Kept current main's FRED HTML and
  malformed-payload fallback handling, cache separation, stale retention and retry
  limits. Diagnostic messages do not contain provider bodies, request URLs or keys.
- [x] `tests/fmp.http.test.ts`, `tests/finra.fred.test.ts`, and
  `tests/dataBundle.providerCache.test.ts`: all 103 tests passed after the fix.

## Verified batch 2: billed-request failure handling

- [x] Ten targeted assertions reproduced cancellation, replay and checkpoint
  failures against current main before production changes.
- [x] Preserve current main's shared settlement classifier, final-delta accounting,
  actual permit maximum, ledger-write recovery, proven pre-send classification,
  and tokenizer-estimate policy. Billed/uncertain failures and failed resumptions
  now stop without replay. Initial/resumed cancellation before dispatch stays free;
  cancellation after dispatch without usage remains explicitly presumed.
- [x] Checkpoint errors retain their identity after settlement, including during
  resumption. Expanded paused context is revalidated before admission. Text-only
  partial output survives for downstream validation; thinking is not checkpointed.
- [x] Capability-based advisory synthesis pacing is distinct from hard token and
  cost limits. Current model/effort shaping remains intact.
- [x] Full `anthropic.test.ts` and `requestAdmission.test.ts`: 244 tests passed,
  including current-main ledger controls and added regression cases. End-to-end
  section recovery and presentation checks remain pending.

## Verified batch 3: source scope and generation guards

- [x] Reproduced the share-price prose unit false positive, inherited-key schema
  exceptions, accepted placeholder cases, empty target assumptions, and empty
  generation sections on current main. Explicit share-price language supplies the
  price unit; wrong currency/date/value cases remain unverified or contradicted.
- [x] Reproduced cash-runway substitution of older periods when recent cash-flow
  inputs are unavailable or refused. Limit the calculation to the recent window
  and withhold it when either recent CFO alias has an unresolved source conflict.
- [x] Preserve current main's historical report schema and financial enrichment.
  New generation checks apply before synthesis and when reusing sections.
- [x] Twelve targeted test files: 786 tests passed, including the existing
  claim-evidence scope, comparison, and unit controls.

## Verified batch 4: bounded recovery and persisted outcomes

- [x] Paid synthesis uses matching subset prompts and a six-launch allowance per
  case order and explicit run generation. Automatic retries/restarts share that
  allowance; an explicit user retry gets a new one. Reduced recovery groups never
  widen to fit the remaining allowance. The existing monetary caps still apply.
- [x] Validated sections retain their original text and digest-bound writer
  evidence across feedback and restart. Received extra known sections are checked
  and retained; previously accepted sections win. Unknown fields still fail.
- [x] Later preflight failures retain previous costs/work. Empty paid cutoffs stop.
  Received malformed outputs retain bounded repair feedback. Complete checkpoints
  rejected by downstream validation cannot silently replay as a repair.
- [x] Mandatory-stage completion is recorded separately from process termination
  and the scope of verification. Failed verification keeps accepted durable
  artifacts and persists a qualified deterministic snapshot. A final-validation
  failure stays data-only even if all step statuses had already reached done.
- [x] Cost metadata joins the exact saved attempt; older attempts do not inherit
  the successful retry's settings. Distinct rejected attempts retain references.
- [x] Ten targeted files passed: 905 tests, including provider accounting, real
  runner orchestration with mocked providers, durable section provenance and
  current-main source/refusal controls. No live provider success is claimed.

## Verified batch 5: fiscal aliases and retained FIGR evidence

- [x] Nearby dates combine only with matching explicit issuer/currency/fiscal
  scope and compatible filing metadata. Existing recency selection still chooses
  a later restatement; ambiguous ties are withheld. SEC backfill does not append
  a compatible calendar alias as an older period. Input order does not decide it.
- [x] Retained FIGR inputs independently establish Q2 2026 CFO of -35.151M
  (-72.969M YTD minus -37.818M Q1) and Q4 2025 CFO of +13.271M
  (62.568M annual minus 49.297M nine months). Current-main admission correctly
  refuses conflicting vendor fields. That refusal now suppresses runway rather
  than allowing older burn periods to substitute. The source fixture identifies
  each accession and the captured snapshot hash.
- [x] The retained FIGR test is a controlled enrichment/Stage B regression; it is
  not a replay of a complete historical report. Eighteen fiscal-alias controls and
  the keyless backfill regression pass as part of the 905-test batch above.

| Audit issue | Current-main fix and regression evidence |
| --- | --- |
| Request replay, cancellation, lost failure cost | [Provider](../../src/providers/anthropic.ts), [accounting tests](../../tests/requestAdmission.test.ts) |
| Token cutoff and accepted-work loss | [Section recovery](../../src/pipeline/stageC/passes.ts), [pass tests](../../tests/stageC.payload.passes.test.ts) |
| False completion and mixed attempt provenance | [Runner](../../src/pipeline/jobRunner.ts), [runner tests](../../tests/jobRunner.test.ts) |
| Quote-unit false positive | [Claim parser](../../src/pipeline/stageC/claimEvidence.ts), [verifier tests](../../tests/stageC.liveVerifier.test.ts) |
| Fiscal duplication and misleading runway | [Period scope](../../src/pipeline/stageB/quarterWindows.ts), [alias tests](../../tests/statementFiscalAliases.test.ts), [retained FIGR test](../../tests/figr.retainedCashflow.test.ts) |

## Deferred or superseded

- The old receivables overwrite and cash-flow replacement patches are superseded
  by current main's stronger source-bound reconciliation/refusal behavior.
- Full earnings normalization, corporate-action capital reconciliation and broad
  grading changes remain deferred. The older proposed partial bridges require
  additional issuer, filing, cutoff and cross-section consistency work before
  they are safe to integrate; they are not asserted as current-main fixes here.
- No new live QCOM/FIGR run, model comparison, historical report rewrite, or
  recovery import is part of this integration. Earlier live receipts from the
  outdated checkout do not establish completion on the integrated version.

All tests above are offline/mocked. No paid model calls, live report generation,
database migration, or historical report rewrite has been performed by this
integration. Successful live report generation remains unverified.

## Review corrections and merge-history check

- [x] Financial review's field-recency and incompatible alias-member findings:
  five regressions failed first, then 143 tests across five files passed.
- [x] Recent rejected fiscal aliases could hide a refused CFO period from runway.
  Two controls reproduced a misleading $65M burn / 1.84615-quarter estimate.
  Reuse the existing rejected-period window guard; older rejected periods leave
  the established current runway unchanged. Final focused results follow below.
- [x] Data-only attempt disclosures must say accepted artifacts remain saved for
  recovery, not that their analysis appears in the snapshot. Both the kept plan
  output and failed paid-repair cases reproduced before the wording correction.
- [x] Cutoff feedback must not invalidate an already complete checkpoint. The
  final-part cutoff reproduced three paid requests followed by an unnecessary
  recovery refusal. An explicit downstream rejection marker now separates that
  continuation from report-schema and entity-reconciliation repairs. The marker
  travels through the real Stage C facade; six-launch and monetary caps remain.
- [x] Dependency-shape check, four database integration tests and the unchanged
  security audit passed (zero vulnerabilities). No runtime dependencies changed.
- [x] Final full product, coverage, type/lint/build and exact-candidate review.

The history audit inspected all 81 two-parent first-parent merges reachable from
current main. Sixty-nine heads already contained their preceding main commit;
twelve were concurrent-branch integrations. The latter showed no exact whole-file
reversion to their older merge base. This structural check cannot certify every
historical line's correctness or identify unrecorded model authorship.

For the recent GPT-associated changes, the actual Git objects establish:

| PR | Pre-merge code preservation | Hosted evidence checked |
| --- | --- | --- |
| [77](https://github.com/eligorelick/Metis/pull/77) | Head `d0eb9dbc` includes preceding main `222f92a0`; merged tree equals head | [CI 457](https://github.com/eligorelick/Metis/actions/runs/41137537676) successful; its one review thread resolved |
| [78](https://github.com/eligorelick/Metis/pull/78) | Head `64469c08` contains all of PR77's `d0eb9dbc` code; missing `b2297b9e` is a tree-identical merge record; merged tree equals head | [CI 459](https://github.com/eligorelick/Metis/actions/runs/41145453352) successful; zero review threads |
| [79](https://github.com/eligorelick/Metis/pull/79) | Head `f5a5c78f` includes preceding main `3176360a`; merged tree equals head | [CI 463](https://github.com/eligorelick/Metis/actions/runs/41185103155) successful; zero review threads |
| [81](https://github.com/eligorelick/Metis/pull/81) | Head `255194b7` includes preceding main `3786c45d`; merged tree equals head | [CI 469](https://github.com/eligorelick/Metis/actions/runs/41237235359) successful; zero review threads |

PR77/78/79 contain GPT coauthor records; PR81 is included as the current baseline,
without inferring model authorship from its human Git author. PR78 explicitly
integrated and retested PR77 before merging. The earlier PRs' archived-replay
claims are their recorded evidence, not a fresh historical replay in this pass.
No stale-baseline replacement was found in these merges. The stale original
checkout in this session remains a separate, acknowledged baseline error.

## Verified review batch

- [x] Seven focused files: 663 tests passed, including the reviewed runway,
  cutoff-versus-semantic-rejection, exact-attempt disclosure and actual Stage C
  facade paths. Provider calls are mocked; accepted report parsing is real.
- [x] Server-rendered snapshot-header plus Markdown, print HTML and audit smoke
  checks agree for complete, data-only and unstamped historical records. These
  tests round-trip a stored report fixture; they are not a live browser check or
  a recovered QCOM database import.
- [x] Financial and provider reviewers approved their bounded scopes. Workflow
  review approved the explicit rejection-marker path and final local completion
  correction described below. No remaining findings in their bounded reviews.

## Verified final recovery boundary

- [x] A further regression reproduced cutoffs on requests 1, 4 and 6: all thirteen
  synthesis sections were valid on the third outer attempt, but another outer
  retry was unavailable. Finalize that complete output locally after accounting
  and checkpointing; normal schema, entity and settlement checks still execute.
- [x] The exact three-attempt regression now succeeds with six mocked provider
  calls and $0.60 settled cost. Checkpoint-only replay costs $0 and makes no calls.
  A complete cutoff containing unresolved entity conflicts still fails; a repair
  that cannot fit the remaining narrower request allowance launches no request.
- [x] Three focused files passed: 555 tests. Independent workflow review repeated
  the boundary probe and approved this correction. All provider calls were mocked.
- [x] Type checking, lint and isolated production build passed after the source
  correction. Dependencies and lockfile remain unchanged.
- [x] The preceding candidate's full product run passed 13,449 tests with three
  existing skips. Its interrupted coverage run is not counted. Full coverage gates
  on the final candidate passed as recorded below.
- [x] Fresh upstream fetch still matches the integration base exactly. All 1,601
  original snapshot file hashes remain unchanged, and the original checkout's
  HEAD is still `65ed563850849269cea7f4f020a4f9412146750b`.

## Final release checks

- [x] Final full product suite under core coverage: 556 files passed;
  13,452 tests passed, three existing skips. Core coverage passed its unchanged
  floors: statements 97.46%, branches 92.90%, functions 98.83%, lines 98.57%.
- [x] Final per-file risk coverage gate passed every unchanged file floor. The
  full suite again passed 13,452 tests in 556 files, with the same three skips.
  Aggregate risk coverage: statements 95.79%, branches 90.59%, functions 98.28%,
  lines 97.81%.
- [x] Final source type check, lint and isolated production build passed.
- [x] Dependency-shape check, four database integration tests and security audit
  passed; zero vulnerabilities. The final correction does not change dependencies,
  database schema or integration code. Hosted CI will rerun all release gates.
- [x] Final diff preserves financial goldens, existing coverage thresholds, DCF
  formulas and grade bands. No historical report, credential or user database was
  changed. Existing historical payload pins are retained behind the new stamp.
- [x] Final preservation recheck: all 1,601 original files and all 56 changed
  source/config/test files match their respective saved hashes. Final upstream
  fetch still matches the integration base; no newer main commits are omitted.
- [ ] Publish the reviewed candidate and verify hosted CI before the authorized
  merge. Publication/merge evidence will be linked in the PR and thread checkpoint.
