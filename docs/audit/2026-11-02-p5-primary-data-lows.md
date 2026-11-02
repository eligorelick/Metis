# P5 primary-source data: low-severity items

| Finding | Disposition | Commit | Red / green receipts | Stored-report impact |
| --- | --- | --- | --- | --- |
| DATA-106 | Fixed | 06f00227 | data106-red / data106-green | None |
| DATA-116 | Fixed | 5d44e143 | data116-red / data116-green | None; old manifest wording retained |
| PERF-101 | Fixed | 92a7c730 | perf101-red / perf101-green | None |
| DATA-115 | Fixed | 532435b5 | data115-red / data115-green-2 | None |
| DATA-102 | Fixed | a8dd537a | data102-red / data102-green | None |
| DATA-110 | Fixed | This commit | data110-red / data110-consumers-final | None |

## Evidence and intended deltas

DATA-106: two non-Latin-1 contact cases previously passed admission; now refused before save or credential test. ASCII and Latin-1 controls remain accepted. Environment status uses the same validator.

DATA-116: plain-text and JSON parameter refusals now use fixed wording and expected=true per B9-OD-7. Each such new gap reduces warning count by one; 503/429 remain unexpected. The parameter refusal remains unlearned, so a second request can try another value.

PERF-101: cold same-endpoint failure waves had peak concurrency 1; after the first inconclusive discovery, the two waiting symbols overlap (peak 2). Refusal controls unchanged. Only the waiting wave bypasses endpoint discovery; no access observation is invented.

DATA-115: active joiner changed from rejected to fulfilled after leader cancellation; a canceled joiner remains rejected. A two-client durable-cache integration confirms that the page succeeds while the peer fails. Signal state handles both raw access-gate reasons and transport-wrapped aborts. Only one replacement fetch is attempted. Ordinary failures are shared.

DATA-102: four stale input cases lost flags before repair; now each output preserves stale=true and reason. Fresh peer admission remains covered. Quote market capitalization also carries companyfacts freshness because its share count comes from those facts. The existing stale gate remains in place per B9-OD-6; postponed F-14 is unchanged.

DATA-110: retained public report-43 Item 5 text previously yielded zero rows; now yields four with capacities 63,743; 783; 13,361; 6,172. The new rows reach filing disclosures, deterministic presentation and payload provenance. Existing table controls, including future-award distinctions, remain unchanged. Missing capacity remains null. Ambiguous plan mentions with no parsed rows get a limitation note. Only the public SEC excerpt is committed; stored vendor snapshots are read-only.

## Residuals and validation

Shared report 1.56.0, payload 1.60.0 and Stage B repair-39 stamps remain unchanged. No prompt edits, golden repins, persisted report rewrites or live provider calls. Existing reports keep their saved disclosures; prose-plan improvements apply to new builds.

DATA-115 deliberately retries based on the leader's aborted caller signal, as the reviewed plan specifies. A transport timeout without caller cancellation is still an ordinary shared failure. The new prose reader is conservative and does not promise complete coverage of every Item 408(a) prose format.

Receipts live under tmp/claude-impl. Initial data106-docs failed because a local README rewrite introduced CRLF differences in generated blocks; restoring exact HEAD bytes resolved all three failures in p5lows-docs-final (112 tests). This was introduced during this task, not a pre-existing failure. Initial data115-green exposed an overbroad signal insertion in unrelated adapters; data115-green-2 passes after limiting it to FMP/Yahoo. Initial typecheck found a test-fixture narrowing error; p5lows-typecheck-2 passes after correction. No pre-existing test failures identified; existing Vite CommonJS configuration warnings remain.
