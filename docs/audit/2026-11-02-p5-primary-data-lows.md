# P5 primary-source data: low-severity items

| Finding | Disposition | Commit | Red / green receipts | Stored-report impact |
| --- | --- | --- | --- | --- |
| DATA-106 | Fixed | owning commit | data106-red / data106-green | None |

DATA-106: non-Latin-1 contacts previously passed admission; now refused before save or credential test. ASCII and Latin-1 controls remain accepted. Environment status uses the same validator. Shared stamps unchanged. No stored reports rewritten.

| DATA-116 | Fixed | owning commit | data116-red / data116-green | None; old manifest text retained |

DATA-116: plain-text and JSON parameter refusals now use fixed wording and expected=true. Each such new gap reduces warning count by one; 503/429 remain unexpected. No stamps or golden changes.


| PERF-101 | Fixed | owning commit | perf101-red / perf101-green | None |

PERF-101: cold same-endpoint failure waves had peak concurrency 1; after the first inconclusive discovery, the two waiting symbols overlap (peak 2). Refusal controls unchanged. No figure or stamp changes.


| DATA-115 | Fixed | owning commit | data115-red / data115-green | None |

DATA-115: active joiner changed from rejected to fulfilled after leader cancellation; canceled joiner remains rejected. Signal forwarded by FMP/Yahoo cache adapters. No stamps changed.


| DATA-102 | Fixed | owning commit | data102-red / data102-green | None |

DATA-102: four stale input cases lost flags before repair; now each output preserves stale=true and reason. Fresh peer admission remains covered. Stamps unchanged; existing gate excludes stale fallback peers uniformly.
