# Audit batch 8a: an accepted Retry of a data-only fallback runs (2026-10-29)

Base: `b8d8e26` (main at `6b97298` plus the DB-001 fix). Scope: the one High finding of batch 8 of the independent audit of 2026-10-27, DB-001, which the owner ruled on 2026-10-28 ships early as 8a. The rest of batch 8 follows as B8b. Decision: D-132 in [DECISIONS](DECISIONS.md). Stamps: pipeline stage-c-1.6.13; report spec, payload and Stage B are unchanged.

This change made no model calls and no paid provider calls. The tests build their inputs inline with a synthetic ledger.

## Disposition

| Finding | Disposition | Commit | Tests |
|---|---|---|---|
| DB-001 Retry after a data-only report closes the job as done without running, and Retry keeps coming back | Fixed. A queued retry is closed before dispatch only when the linked report blocks a resume. A data-only link falls through to dispatch, which runs the judge and verify on the settled analyst passes. A second failure links a new data-only report. A dispatch failure ends `error` with a fixed, sanitized message (for example "scheduler pass resolution failed before execution"), keeps the fallback linked, and a later Retry is admitted. `recordQueuedResumeDispatchFailure` is a test seam with no production caller. | `b8d8e26`, `b2d6254`, `7064f71`, `90f8f5a` | `tests/jobRunner.test.ts` (DB-001 describe), `tests/jobScheduler.test.ts` |

The DB-001 tests failed before the fix (4 of 5; the precondition test is a control); the re-admission pin and the production dispatch-failure test pass at base and pin current behaviour.

The review minors are closed: the done-settle branch no longer parses the linked report a second time (no behaviour change), and one assertion pins that a later Retry from `error` is admitted after a data-only dispatch failure (it passes at base).

## Before and after

| Row | Input | Before | After |
|---|---|---|---|
| DB-001 | DB-001 test ledger (synthetic: bull $0.90, bear $0.47, judge $0.40, verify $0.20) | Retry closes as done and nothing runs | Only the judge is billed again (the verify pass makes no model call); the analyst passes are reused; a full report is linked. The synthetic ledger's mock bills the judge $0.40 and verify $0.20 ($0.60), while in production verify costs $0, so a Retry adds about the judge's cost only |

## Residuals

- A double-click on Retry, or a Retry while the job is active, is covered by the existing `claimPreparedJobResume` and `prepareJobResume` fences and is not separately tested.
- The rest of batch 8 follows as B8b.
