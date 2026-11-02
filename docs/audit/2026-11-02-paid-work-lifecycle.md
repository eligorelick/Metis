# P4 paid-work lifecycle disposition

This batch preserves accepted work and safe in-flight renewals.

## Independent review follow-up (2026-11-02)

At reviewed HEAD 94a15e36, JOB-301 was partial and JOB-215 regressed terminal
attachments. The follow-up fixes both; all eight review findings are now fixed.
The earlier receipts below describe the pre-review implementation, not acceptance
of the reviewed defects.

| Review finding | Status / correction | Commit | Red / green receipts |
| --- | --- | --- | --- |
| 1 | Fixed: Live/saved terminal attachment stays put; observed running completion navigates once | f0585211 | P4-R1-red / P4-R1-green |
| 2 | Fixed: Both exact owner-required spend/resume disclosures | e53b6cd8 | P4-R2-red / P4-R2-green |
| 3 | Fixed: Dedicated resume label and failure text | ab2ea3b4 | P4-R3-red / P4-R3-green |
| 4 | Fixed: Provider attribution survives a blocked repair | 79dc74b6 | P4-R4-red-valid / P4-R4-green-valid |
| 5 | Fixed: Damaged runtime ownership names runtime.lock | ce22ce0c | P4-R5-red / P4-R5-green |
| 6 | Fixed: Legacy index only while duplicate aliases drain | 7ba9c00b | P4-R6-red / P4-R6-green |
| 7 | Fixed: Five delayed reopens then one fenced GET and lost message | 7501c9f1 | P4-R7-red / P4-R7-green-final |
| 8 | Fixed: Records placement, JSDoc ownership and escaped dash | this commit (P4-R8) | P4-R8-red / P4-R8-green2 |

Stored reports are unchanged. Newly persisted resumed-side gaps say "resumed side
failed"; gaps retain the provider if any attempt for that side reached it.
No financial formula, prompt, payload, version stamp or golden changes.
Read-only terminal attachment navigation/refresh count changes from 1 to 0;
observed live completion remains exactly 1. CLOSED-stream retries change from
unbounded to 5 delayed reopens plus 1 GET, with 0 POSTs. Repeated database
bootstrap schema-version changes from +2 to +0; duplicate jobs remain preserved.
Paid recovery allowances, request admission and settlement identities are unchanged.

Verification: P4-review-focused-final passes 686 tests in 16 files, including
runner, scheduler, both client suites, presentation, unsupported page, mutex,
AI store, migration, report API, SSE, resume/state, and all three docs gates.
P4-review-typecheck exits 0. P4-review-final-docs passes 202 tests in four files after final placement and
JSDoc edits. P4-review-lint exits 0. Final typecheck/lint receipts are P4-review-typecheck-final and
P4-review-lint-final after the last source edits. Offline only; full merged verify belongs
to the integrator. No push, PR, merge or history rewrite. No owner questions.


| Finding | Disposition | Commit | Red / green receipts | Stored-report impact |
| --- | --- | --- | --- | --- |
| JOB-202 | Fixed: compatible accepted-work reuse loads frozen lineage inputs and Stage B configuration, preserving hash and capture time | 261d0f4d | JOB-202-red, JOB-202-real-red / JOB-202-green, JOB-202-real-green | No rewrite; newly resumed reports retain source input provenance |
| JOB-206 | Fixed: tolerate busy renewal only with proven lease slack | 63b4e9f3 | JOB-206-red / JOB-206-green2 | None |
| JOB-213 | Fixed: folded admission, Retry lookup, database constraint and client fences | 11fb6642 | JOB-213-red / JOB-213-green2, JOB-213-controls2 | None |
| DOC-203 | Fixed: commented canonical defaults and key-only startup warnings | f37a948b | DOC-203-red / DOC-203-green2 | None |
| AI-510 | Fixed: shared recovery with independent repair and plan resend allowances | 2247d65c | AI-510-JOB-201-red / AI-510-JOB-201-green4 | None |
| JOB-201 | Fixed: shared recovery with independent repair and plan resend allowances | 2247d65c | AI-510-JOB-201-red / AI-510-JOB-201-green4 | None |
| JOB-301 | Fixed after review follow-up: terminal discovery, reachable Retry, exact cost and classic saved-view disclosures | c6c7e7e9; f0585211; e53b6cd8 | JOB-301-red / JOB-301-green | None |
| AI-110 | Fixed: rechecked deterministic fallback then fixed shell | a6993fd1 | AI-110-red / AI-110-green | None |
| AI-115 | Fixed: lifetime native OS runtime ownership | d26076d6 | AI-115-red / AI-115-green | None |
| JOB-207 | Fixed: effective verification-generation provenance | 6f53eca2 | JOB-207-red / JOB-207-green | Newly resumed reports only; no rewrite |
| JOB-205 | Fixed: distinguish transport exhaustion from schema rejection | 1093976b | JOB-205-red / JOB-205-green | Newly persisted wording only |
| JOB-214 | Fixed: open recovery and fenced CLOSED stream reopening | 7fb6a7a8 | JOB-214-red / JOB-214-green2 | None |
| JOB-215 | Fixed: once-per-job refresh; live completion opens saved route | ba8dd156 | JOB-215-red / JOB-215-green2 | None |
| PERF-202 | Fixed: revision-first polling and terminal-only resume fold | 600a496d | PERF-202-red / PERF-202-green | None |

The regression uses the repository runner harness, real Stage C payload assembly
and fingerprint, synthetic quote 200 then 201, and hermetic mock model passes.
Before the fix, Retry fetches the moved quote and refuses reuse. After the fix,
Retry makes zero acquisition calls and only judge and verification model calls;
the original run made one analyst-pair call and one failed judge call. The final
cost ledger has exactly one row each for bull (0.90 USD), bear (0.47 USD),
synthesis (0.40 USD) and verification (0.20 USD): 1.97 USD total. Legacy and old
snapshot-version controls still fetch once, refuse changed payloads before model
dispatch, and retain exactly the two original analyst rows (1.37 USD).

No payload/prompt bytes, formula meanings, stamps, goldens or intended deltas
change. Current-clock validation and unchanged fingerprint checks can still
refuse reuse when staleness or execution compatibility changes. Corrupt snapshots
remain fail-closed. Data-only, report persistence and downstream views/exports
continue to consume the same report schema and original snapshot association.

The continuation completes all thirteen remaining findings; JOB-202 evidence
above is retained. No automatic replay of billed or uncertain requests is added.

JOB-206: injected SQLITE_BUSY on either renewal beat aborted 2/2 runs before
the fix; both now retain one analyst launch and exactly one bull ledger row.
Six focused tests pass, including expiry boundaries, non-busy errors and lost
owner controls. No accounting, schema, prompt, stamp or stored-report change.

JOB-213: alias admission changes from two queued jobs to one; no provider
requests or ledger rows are added by attachment. Existing duplicate aliases
are preserved during bootstrap until the new index can be safely installed.

AI-510/JOB-201: fresh and resumed drop-to-rejection cases changed from data-only
to complete analysis; mirror repair-to-drop preserves feedback byte for byte.
Plan analyst ledger remains zero dollars; accepted siblings are called zero
additional times. All 289 runner tests pass, including paid repair, refused
passes, launch authority, synthesis allowance and exact-ledger controls. No
prompt or schema change; stored reports and stamps are unchanged.

Final controls additionally prove real SQLite contention across both renewals
(one bull request, one 0.90 USD row); a five-request plan recovery ceiling;
unchanged repair feedback; both layouts reopening CLOSED observation streams;
manifest rejection with internally consistent completeness and synthesis counts;
and runtime-lock marker rejection and crash release. Fresh-page discovery never
resurrects an older lineage when the newest attempt is ineligible. Temporary
provider busy/unavailable failures share backoff classification and accurate
wording; no retry count is increased by that classification.

Residuals: legacy/version drift and current-clock fingerprint mismatches remain
fail-closed. Existing duplicate active alias rows defer the stronger index until
they drain and the next bootstrap runs. Stop all older servers before upgrading
the runtime-lock protocol. Retry-After parsing remains deferred by B8-OD-10.
This batch changes orchestration, safe degraded-path construction and provenance,
not financial formulas, prompt/payload definitions or golden bytes. Version
stamps, payload golden and intended-delta fixture remain unchanged. Full merged
verify and release acceptance belong to the integrator.

Verification: P4-continuation-focused-final passes 1,133 tests in 28 files with
one existing skip. The final affected-source rerun P4-accepted-focus passes 421
tests in nine files. P4-typecheck-accepted and P4-lint-accepted exit zero. No full
verify, live provider call, dependency reinstall, lockfile regeneration, push,
PR, merge, stash or history rewrite was performed by this continuation.
