# SQLite integration failure diagnostics — 2026-10-18

The [first Windows attempt](https://github.com/eligorelick/Metis/actions/runs/39085891027/job/117552248331) passed 7,349 product tests but failed the database bootstrap integration test. Its outer cleanup raised `EPERM` after 12.121 seconds, masking the original body result. The configured child timeout was 12 seconds; the available log does not establish that a timeout occurred. No original child status, signal, or output can be reconstructed from that cleanup exception.

One [unchanged-head retry](https://github.com/eligorelick/Metis/actions/runs/39085891027/job/117555656857) passed 7,349 product tests and all four integration tests. Integration took 2.17 seconds, including a 1.665-second bootstrap. This demonstrates a passing retry, not the first failure's cause or freedom from recurrence.

## Bounded test-only change

The bootstrap test still attempts mandatory cleanup after its body. A sole failure is rethrown unchanged. If both fail, an `AggregateError` retains both original objects and the body as its cause. Fixed-field summaries retain child status, signal, and bounded output tails; the locked Vitest serializer is tested to avoid traversing unrelated properties or unbounded streams on this dual-failure path. Existing sole-failure reporting is unchanged.

All database, credential-stripping, and cleanup assertions remain. The 12-second child timeout and 15-second test timeout remain. There are no production, dependency, runtime, methodology, or version-stamp changes.

[Node 24.16.0, `execFileSync`](https://nodejs.org/download/release/v24.16.0/docs/api/child_process.html#child_processexecfilesyncfile-args-options) describes waiting for the directly spawned child and returning its result in a thrown error on failure. This patch preserves that result if cleanup also fails. It does not establish that every npm/Windows shell descendant has terminated before cleanup, implement a process-tree wait, or resolve the original CI failure. That would require separate ownership-aware process lifecycle evidence and tests.

## Verification

The extracted original `try/finally` behavior produced five expected failures among eight helper tests. After the change, all eight pass, including all four body/cleanup outcomes, thrown `undefined`, original object identity/cause, bounded output, and actual Vitest serialization. The real Windows npm/Drizzle/SQLite integration suite passes all four tests. Typecheck, lint, dependency-shape and diff checks pass. Exact-head platform CI is reported on the pull request; no financial or live-provider correctness claim follows from these tests.
