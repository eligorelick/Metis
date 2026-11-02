# P8 methodology documentation and test guards

Base: b64e0433. All ten findings reproduced at this base: docs-red (six doc contracts), test201-red, test202-red, test203-red and test204-red retain the failing receipts. No product financial computation, prompt, payload golden, shared version stamp or stored report changed. DOC-301 was deferred until B5 and was applied after the P2 merge (see the DOC-301 row).

| Finding | Disposition | Commit | Red / green receipt | Stored report impact |
| --- | --- | --- | --- | --- |
| DOC-101 | Fixed: bank rows are contiguous; component-only provision totals remain withheld | 275da35f | docs-red / docs-green-4 | none |
| JOB-212 | Fixed: cancellation is error; explicit Retry can resume compatible work | 275da35f | docs-red / docs-green-4 | none |
| DOC-102 | Fixed: signed forensic bands; absolute grade limitation remains disclosed | 275da35f | docs-red / docs-green-4 | none |
| DOC-201 | Fixed: conditional disclaimer quoted verbatim | 275da35f | docs-red / docs-green-4 | none |
| DOC-202 | Fixed: stamps pinned to source; EPS inheritance and continuing value corrected | 275da35f | docs-red / docs-green-4 | none |
| DOC-204 | Fixed: excerpt families, adaptive budgets and issuer website disclosed | 275da35f | docs-red / docs-green-4 | none |
| TEST-201 | Fixed: named TSX placement, core per-file floors plus aggregate, characterization tests | f2fe4f56 | test201-red / test201-focused-green, test201-measure-2 | none |
| TEST-202 | Fixed: declared compiler/lint roots; tracked inputs remain admitted | 056275db | test202-red / test202-green | none |
| TEST-203 | Fixed: Node transports guarded; XDG_DATA_HOME and APPDATA isolated | 5f180338 | test203-red / test203-green | none |
| TEST-204 | Fixed: recorded overflow and no-op jump refused | 53ab708e | test204-red / test204-green | none |
| DOC-301 | Fixed after P2 (B12-OD-8): the next fiscal year takes the quarterly shape; the worked example is the synthetic D-99 fixture recomputed by tests/docs.p8Agreement.test.ts (570 shaped, 627.53 even) | this branch | doc301-red / doc301-green | none |

TEST-204 is unit-tested on recorded measurements only; live confirmation skipped by decision (decisions spec 4.3). No preview, server or live reading run was started.

## For later stamp-moving PRs

A PR moving the report spec, payload, Stage B or score-band constant must edit the current-source sentence in METHODOLOGY in the same commit; tests/docs.p8Agreement.test.ts fails until it does. This intentionally changes methodArtifactHash for later builds. Cross-commit custody replay already refuses mismatched commits; direct offline Stage B/payload invocation remains available. Historical saved reports retain their original bytes.

## Coverage evidence

The unchanged base test files were replayed from git into isolated scratch against unchanged production code (test201-base-measure). The targeted before/after figures (statements/branches/functions/lines) are:

| Source | Before | After | Lift in percentage points |
| --- | --- | --- | --- |
| commonClassScope.ts | 87.23/84/64.28/97.14 | 100/96/100/100 | +12.77/+12/+35.72/+2.86 |
| repurchaseExecutions.ts | 84.28/68.96/100/91.07 | 94.28/86.20/100/100 | +10/+17.24/0/+8.93 |

These are comparable targeted runs, not claims about the full base suite. Named TSX exemptions document rendering or their existing test coverage; three logic candidates are measured separately with the complete risk suite. The core single-file glob mechanism is causally tested against an uncovered source while the aggregate control passes.

## Residuals

No calibration or forecast-accuracy evidence is claimed. The manual reading script retains 48px slack based on the recorded samples; broader live-layout confirmation remains future manual work. Fresh-head full product, risk and core receipt results are recorded in the implementation handoff.

## Base details and scope measurements

The base already declared the shared report, payload and Stage B stamps correctly, and CHANGELOG already matched them: those DOC-202 subclaims were not reproduced. The stale score-band name, missing header score-band clause, EPS row and continuing-value prose still reproduced. All six documentation contracts failed before the edits.

Read-only owner-checkout measurements (owner-scope-measure and owner-lint-measure) show compiler inputs 939 -> 925: exactly the 14 untracked independent-audit scripts drop, with no tracked file lost. Lint drops 211 untracked code inputs to zero, with no tracked input lost. The 66 current TSX files each have a named placement. Three logic candidates remain exempt with their measured targeted figures and owning tests; full-suite candidate measurements are retained with the handoff.

The coverage-instrumented inventory test exceeded its original five-second timeout while enumerating every tracked lint input. A 30-second timeout permits the same complete assertions; scope-risk-repro is red and scope-risk-green passes. No assertion or coverage floor was relaxed. ESM transport, loopback, SEC opt-in and inherited foreign directory controls pass in test203-esm-controls. Review also caught and removed duplicate bank definitions; docs-review-red/green retain that correction.
