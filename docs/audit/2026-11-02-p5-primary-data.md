# P5 primary-source data and freshness

| Finding | Disposition | Commit | Red / green receipts | Stored-report impact |
| --- | --- | --- | --- | --- |
| DATA-103 | Fixed | b0ed6bb9 | data103-red / data103-green | None; saved bytes unchanged |
| DATA-104 | Fixed | d0feb95f | data104-red / data104-green | None; saved bytes unchanged |
| AI-508 | Not started | - | - | Not assessed |
| AI-202-V1 | Not started | - | - | Not assessed |
| RPT-201 | Not started | - | - | Not assessed |
| DATA-114 | Not started | - | - | Not assessed |
| DATA-112 | Not started | - | - | Not assessed |
| DATA-113 | Not started | - | - | Not assessed |
| DATA-111 | Not started | - | - | Not assessed |
| AI-506 | Not started | - | - | Not assessed |
| DATA-107 | Not started | - | - | Not assessed |
| AI-512-V1 | Not started | - | - | Not assessed |
| DATA-101 | Not started | - | - | Not assessed |
| DATA-102 | Not started | - | - | Not assessed |
| DATA-106 | Not started | - | - | Not assessed |
| DATA-108 | Not started | - | - | Not assessed |
| DATA-109 | Not started | - | - | Not assessed |
| DATA-110 | Not started | - | - | Not assessed |
| DATA-115 | Not started | - | - | Not assessed |
| DATA-116 | Not started | - | - | Not assessed |
| PERF-101 | Not started | - | - | Not assessed |

## Evidence and residuals

DATA-103: the base loses $5,000,000,000 total net revenue against a $700,000,000 ASC-606 fee subset on both keyless and vendor rows. The repaired classification retains $5,000,000,000 and still refuses a disagreeing $4,000,000,000 vendor total. Industrial routing remains unchanged. No stamp changes; shared stamps already match the brief.

DATA-104: latest-only USD convenience data previously left one year; recurring USD convenience data left three years and 12.82% growth. Both now retain five CNY years and filed growth of 5.86%. Currency-switch and non-anchor debt-currency controls are included. Offline census receipt data104-prevalence: 50 cached companyfacts, one foreign annual filer, zero US-GAAP foreign annual filers, zero US-GAAP dual-unit anchor tags. The sole IFRS filer has convenience USD in all eight filings, outside this builder's namespaces. Severity remains Medium under the reviewed interpretation. No stamps or goldens changed. Existing FX guards withhold mixed-currency DCF and multiples.

Offline retained-input replay (p5-retained-replay) compares both classification and complete built statements against base 007f4fcd on inputs 43, 46, 48, 49 and 50: all five unchanged, all USD. The snapshot files were read in place; no retained artifact was written.

This is an incomplete batch: two findings fixed, nineteen not started. AI-508 was inspected but no regression or implementation was committed. Resume there in the requested order. No blocker or non-reproduction is claimed for unstarted findings.

Validation: data103-green (432 tests), data103-docs-controls (119), data104-green (508), p5-controls-3 (167), p5-retained-replay (5), p5-typecheck-2 and p5-lint-1 passed. The first typecheck caught an introduced fixture typing error, corrected in d0feb95f. The first p5-controls-2 run hit the tracked-file inventory gate before the new test was staged; p5-controls-3 passes after staging. Neither is a pre-existing failure. Existing Vite CommonJS configuration warnings remain.
