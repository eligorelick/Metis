# P4 paid-work lifecycle disposition

This batch preserves accepted work and safe in-flight renewals.

| Finding | Disposition | Commit | Red / green receipts | Stored-report impact |
| --- | --- | --- | --- | --- |
| JOB-202 | Fixed: compatible accepted-work reuse loads frozen lineage inputs and Stage B configuration, preserving hash and capture time | Owning JOB-202 commit | JOB-202-red, JOB-202-real-red / JOB-202-green, JOB-202-real-green | No rewrite; newly resumed reports retain source input provenance |
| JOB-206 | Fixed: tolerate busy renewal only with proven lease slack | Owning JOB-206 commit | JOB-206-red / JOB-206-green2 | None |
| JOB-213 | Fixed: folded admission, Retry lookup, database constraint and client fences | Owning JOB-213 commit | JOB-213-red / JOB-213-green2, JOB-213-controls2 | None |
| DOC-203 | Fixed: commented canonical defaults and key-only startup warnings | Owning DOC-203 commit | DOC-203-red / DOC-203-green2 | None |
| AI-510 | Fixed: shared recovery with independent repair and plan resend allowances | Owning AI-510/JOB-201 commit | AI-510-JOB-201-red / AI-510-JOB-201-green4 | None |
| JOB-201 | Fixed: shared recovery with independent repair and plan resend allowances | Owning AI-510/JOB-201 commit | AI-510-JOB-201-red / AI-510-JOB-201-green4 | None |
| JOB-301 | Fixed after dynamic reproduction: read-only terminal discovery in both layouts | Owning JOB-301 commit | JOB-301-red / JOB-301-green | None |
| AI-110 | Fixed: rechecked deterministic fallback then fixed shell | Owning AI-110 commit | AI-110-red / AI-110-green | None |
| AI-115 | Fixed: lifetime native OS runtime ownership | Owning AI-115 commit | AI-115-red / AI-115-green | None |
| JOB-207 | Fixed: effective verification-generation provenance | Owning JOB-207 commit | JOB-207-red / JOB-207-green | Newly resumed reports only; no rewrite |
| JOB-205 | Not started | — | — | None |
| JOB-214 | Not started | — | — | None |
| JOB-215 | Not started | — | — | None |
| PERF-202 | Not started | — | — | None |

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

Residuals: all thirteen other assigned findings remain not started. In particular,
this item adds no repair or automatic paid replay and does not resolve the
separate resumed-side recovery, lease, or chained verification provenance issues.

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
