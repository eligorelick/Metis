# P5 primary-source data: low-severity items

| Finding | Disposition | Commit | Red / green receipts | Stored-report impact |
| --- | --- | --- | --- | --- |
| DATA-106 | Fixed | owning commit | data106-red / data106-green | None |

DATA-106: non-Latin-1 contacts previously passed admission; now refused before save or credential test. ASCII and Latin-1 controls remain accepted. Environment status uses the same validator. Shared stamps unchanged. No stored reports rewritten.
