# P4 paid-work lifecycle disposition

This batch preserves accepted work and safe in-flight renewals.

| Finding | Disposition | Commit | Red / green receipts | Stored-report impact |
| --- | --- | --- | --- | --- |
| JOB-202 | Fixed: compatible accepted-work reuse loads frozen lineage inputs and Stage B configuration, preserving hash and capture time | 261d0f4d | JOB-202-red, JOB-202-real-red / JOB-202-green, JOB-202-real-green | No rewrite; newly resumed reports retain source input provenance |
| JOB-206 | Fixed: tolerate busy renewal only with proven lease slack | 63b4e9f3 | JOB-206-red / JOB-206-green2 | None |
| JOB-213 | Fixed: folded admission, Retry lookup, database constraint and client fences | 11fb6642 | JOB-213-red / JOB-213-green2, JOB-213-controls2 | None |
| DOC-203 | Fixed: commented canonical defaults and key-only startup warnings | f37a948b | DOC-203-red / DOC-203-green2 | None |
| AI-510 | Fixed: shared recovery with independent repair and plan resend allowances | 2247d65c | AI-510-JOB-201-red / AI-510-JOB-201-green4 | None |
| JOB-201 | Fixed: shared recovery with independent repair and plan resend allowances | 2247d65c | AI-510-JOB-201-red / AI-510-JOB-201-green4 | None |
| JOB-301 | Fixed after dynamic reproduction: read-only terminal discovery in both layouts | c6c7e7e9 | JOB-301-red / JOB-301-green | None |
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
