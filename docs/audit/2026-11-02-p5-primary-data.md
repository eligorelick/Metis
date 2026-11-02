# P5 primary-source data and freshness

| Finding | Disposition | Commit | Red / green receipts | Stored-report impact |
| --- | --- | --- | --- | --- |
| DATA-103 | Fixed | b0ed6bb9 | data103-red / data103-green | None; saved bytes unchanged |
| DATA-104 | Fixed | d0feb95f | data104-red / data104-green | None; saved bytes unchanged |
| AI-508 | Fixed | 68fd3767 + 9e789e2e + c1b45f9f | ai508-detail-red, ai508-repeat-red / p5-final-consumers | Legacy business tables unchanged in retained replay |
| AI-202-V1 | Fixed | 749d7a5a | ai202-red / ai202-green-2 | None |
| RPT-201 | Fixed | 2c4c240c | rpt201-red-2 / rpt201-green-3 | Yield retained with explicit legacy assumption note |
| DATA-114 | Fixed | e5de3480 | data114-red / data114-green-2 | None |
| DATA-112 | Fixed | fff5f42f | data112-red / data112-green-3 | None |
| DATA-113 | Fixed | 88f5029f | data113-red / data113-green-2 | None |
| DATA-111 | Fixed | 096f45c9 | data111-red / data111-green | Saved bytes unchanged; recomputation corrected east of UTC |
| AI-506 | Fixed | aa596390 | ai506-red / ai506-green-3 | Update-only legacy narrative excluded on payload rebuild |
| DATA-107 | Fixed | 0d612e11 + 4277b837 | data107-red / data107-scope-green-2; data108-green | Existing saved scope semantics retained |
| AI-512-V1 | Fixed | cb552f6f + 9a64b870 | ai512-red, ai512-notice-red / ai512-notice-green, p5-complete-retained | Disputed labels withheld at display; bytes unchanged |
| DATA-101 | Fixed | 2d007083 | data101-final-red-2 / p5-final-consumers, p5-complete-retained | Legacy groups 30 -> 6; metadata and bytes unchanged |
| DATA-102 | Not started | - | - | Not assessed |
| DATA-106 | Not started | - | - | Not assessed |
| DATA-108 | Fixed | 4bf2fc26 | data108-red / data108-green | None |
| DATA-109 | Fixed | 88896889 | data109-red / data109-green | Display removes page-only summary fragments |
| DATA-110 | Not started | - | - | Not assessed |
| DATA-115 | Not started | - | - | Not assessed |
| DATA-116 | Not started | - | - | Not assessed |
| PERF-101 | Not started | - | - | Not assessed |

## Evidence and residuals

DATA-103: the base loses $5,000,000,000 total net revenue against a $700,000,000 ASC-606 fee subset on both keyless and vendor rows. The repaired classification retains $5,000,000,000 and still refuses a disagreeing $4,000,000,000 vendor total. Industrial routing remains unchanged. No stamp changes; shared stamps already match the brief.

DATA-104: latest-only USD convenience data previously left one year; recurring USD convenience data left three years and 12.82% growth. Both now retain five CNY years and filed growth of 5.86%. Currency-switch and non-anchor debt-currency controls are included. Offline census receipt data104-prevalence: 50 cached companyfacts, one foreign annual filer, zero US-GAAP foreign annual filers, zero US-GAAP dual-unit anchor tags. The sole IFRS filer has convenience USD in all eight filings, outside this builder's namespaces. Severity remains Medium under the reviewed interpretation. No stamps or goldens changed. Existing FX guards withhold mixed-currency DCF and multiples.

Offline retained-input replay (p5-retained-replay) compares both classification and complete built statements against base 007f4fcd on inputs 43, 46, 48, 49 and 50: all five unchanged, all USD. The snapshot files were read in place; no retained artifact was written.

Continuation: ten requested findings fixed, AI-508 partially fixed, AI-512-V1 and DATA-101 not started. The six Low items assigned elsewhere remain untouched. Earlier DATA-103/104 records are retained.

Validation: data103-green (432 tests), data103-docs-controls (119), data104-green (508), p5-controls-3 (167), p5-retained-replay (5), p5-typecheck-2 and p5-lint-1 passed. The first typecheck caught an introduced fixture typing error, corrected in d0feb95f. The first p5-controls-2 run hit the tracked-file inventory gate before the new test was staged; p5-controls-3 passes after staging. Neither is a pre-existing failure. Existing Vite CommonJS configuration warnings remain.

AI-508: synthetic Devices [57,66,64,62,48] becomes [57,null,64,62,48] after a proven recast. The unproven annual-minus-nine-months case retains 18 (not invented 54 or 66), explicitly computed and disclosed under OD-11. Earlier-presentation levels are excluded from analysts; growth across presentations is withheld. No stamps, prompts or goldens change.

AI-202-V1: +40M expense -> -40M, EPS loss 0.10..0.12 -> -0.12..-0.10, zero-crossing EPS -0.05..0.05 -> midpoint 0. A control caught an overly wide negative-value refusal of operating-margin percentages; it is restricted to money metrics.

RPT-201: annual $3.60 at $216 moves 6.67% -> 1.67%; monthly $0.50 moves 0.93% -> 2.78%; special and unknown yields are withheld. Special $1 before regular quarterly $0.35 selects $0.35. Frequency-free stored reports retain x4 with an explicit assumption. The first red yield fixture lacked marketData; rpt201-red-2 reproduces all nine trigger failures with valid input.

DATA-114: both provider adapters previously threw after the UTC-window rollover on a 429; now retain yesterday's identical rows, stale=true, reason=window-fallback, with original fetchedAt. Refusals, different symbols/spans, eight-day acquisitions and successful fresh fetches are controls. No provider traffic.

DATA-112: both adapters returned cached 14:00 close 104.5 after the close; now await 110. Failed refresh and empty refresh preserve 104.5 only with explicit stale metadata. The common adapter owns this policy, adapting the older client-level plan.

DATA-113: meta returning 150 then 165 previously produced two prices; both now retain the first 150 and stale=true with one successful meta read. The independent quote retry is preserved after meta failure to retain the existing thrown-source control.

DATA-111: Berlin/Tokyo lost 24.55B remaining authorization as of 2026-08-28; all four explicit zones now retain it and the EPS basis. Announcement dateline matching also uses calendar arithmetic, including controls one day before/after publication.

AI-506: newer monthly sales update lost Q4 narrative and $1.30 dividend; the retained Q4 results now supply both. Retention/order unchanged. No prompt text edited.

DATA-107: six newly admitted item codes; 3.02 already admitted at this HEAD. Uses existing materialEventItems scope and legacy disclosure rather than the older plan's duplicate field.

DATA-108: Election, Appointment and 5.02(e) Compensatory headings previously yielded no section; now retain the operative body. DATA-107 scope correction: expanded schema and intended ten-to-sixteen scope pins are verified by data107-scope-green-2 (230 pass); original ten-document fixture remains intact.

DATA-109: synthetic sections [3, operative body] -> [operative body]. Replayed old sections are filtered before analyst excerpt budgeting and summary construction; legacy summaries strip only isolated Item/page fragments.

Continuation limits: AI-508 implements the arithmetic, analyst exclusion and computed-source guards, but its presentation-change note does not yet name the exact change filing/window and affected quarter ends prescribed by OD-11. Its expanded moved-together/repeated-change tests and retained-report replay remain outstanding. Therefore its disposition is partially fixed. The other new fixes have focused synthetic/offline fixture evidence; no new whole retained-report replay was performed in this continuation. DATA-107 required a follow-up schema commit; the intermediate failed scope receipts are introduced failures, corrected by the 230-test scope gate and 380-test downstream gate. No pre-existing failing test observed. Session capacity ends this continuation; no blocker claimed for the two unstarted findings.


AI-508 completion: detailed filing/window/quarter-end notes and moved-together/repeated-change controls. ai508-detail-red: 2 failures, 5 passes; ai508-detail-green verifies corrected notes and controls. Retained inputs contain no recast trigger; stored-series replay is a must-not-move control.


Correction (P5-B F1): AI-506 introduced 20 failures in five result-free release fixtures; these were not pre-existing at 007f4fcd. The earlier ai512-baseline-controls used modules from a commit already containing AI-506 and did not establish a base failure. The fix-round adds one GAAP results sentence per fixture, changes no assertion, and verifies OD-10 no-results withholding. Historical receipts remain available.


DATA-101 fixed: data101-final-red-2 reproduces the historical-zero and legacy-grouping defects (2 failures, 60 controls pass). New-format refusals stay separate. The different-period refusal fixture now includes an actual filed amount at that period, so it tests a refusal rather than the absence intentionally silenced by OD-8. Retained MU #46: grouped count 6 and no absent-period warnings. p5-final-retained-3 passes 7 checks with SHA-256 byte preservation for reports 43, 46, 48, 49 and 50. Intermediate replay failures were harness argument mistakes, corrected; typecheck caught introduced unknown-point typing, corrected using the XBRL parser. No source data, stamps, prompts or goldens changed.


AI-508 repeated-change completion: ai508-repeat-red fails on comparing two flagged older cells; p5-final-consumers passes 241 tests after conservatively withholding growth involving either older cell. p5-final-retained-4 verifies business tables against starting-HEAD presentation code on stored reports 43, 46, 48, 49 and 50; all unchanged. Its AMZN payload claim checks reject Q3 FY2025 guidance and keep the period-free 199.5 billion claim.


AI-512-V1 direct-consumer completion: ai512-notice-red proves the Stage B newer-results manifest still reused the raw label after the display fix. The shared newer-results selector now supplies the withheld label to both consumers.


## Final three-item completion

The completion supersedes the earlier continuation-limit paragraphs above. All three assigned items are fixed; none blocked or not reproduced. The six Low findings handled elsewhere are outside this continuation.

Final consumer evidence: p5-final-focused (17 files, 648 tests), p5-final-consumers (14 files, 241 tests), p5-final-delta-docs (7 files, 186 tests), ai512-notice-green (6 files, 143 tests), and p5-complete-retained (2 files, 7 tests). All passed with maxWorkers=2. The final retained replay includes unchanged business tables versus starting-HEAD display code, unchanged stored hashes, AMZN period-mismatch/no-period claim controls, and MU enrichment/grouping.

Correction (P5-B F1): AI-506 introduced 20 failures in five result-free release fixtures; these were not pre-existing at 007f4fcd. The earlier ai512-baseline-controls used modules from a commit already containing AI-506 and did not establish a base failure. The fix-round adds one GAAP results sentence per fixture, changes no assertion, and verifies OD-10 no-results withholding. Historical receipts remain available.

Residual methodology limits: a recast first seen in a 10-K remains unproven until a later shared window; the cross-filing estimate remains explicitly computed under OD-11. Historical levels remain visible but their growth is withheld when their individual prior bases cannot be established. No owner questions.


| Review item | Disposition | Commit | Evidence | Stored impact |
| --- | --- | --- | --- | --- |
| Step 1 (DATA-114/115/116) | Fixed: Non-JSON FMP 5xx carries HTTP status so transient history fallback applies; cancellation remains non-transient and active joiners retry for fresh data. | This commit | fixround-step1-red2 / fixround-step1-green; risk inventory red in fixround-step1-red | No persisted rewrite |


| Review item | Disposition | Commit | Evidence | Stored impact |
| --- | --- | --- | --- | --- |
| A-F1 (RPT-201) | Fixed: Use schema-valid null guidance in the dividend-yield display fixture. | This commit | fixround-step1-red / fixround-a1-green | No persisted rewrite |


| Review item | Disposition | Commit | Evidence | Stored impact |
| --- | --- | --- | --- | --- |
| A-F2 (AI-202-V1) | Fixed: Sort only a single signed range; respectively pairs preserve GAAP and non-GAAP order. | This commit | fixround-a2-red / fixround-a2-green | No persisted rewrite |


| Review item | Disposition | Commit | Evidence | Stored impact |
| --- | --- | --- | --- | --- |
| A-F3 (AI-508) | Fixed: Refuse residual fills from a filing outside the missing member current presentation. | This commit | fixround-a3-red / fixround-a3-green | No persisted rewrite |


| Review item | Disposition | Commit | Evidence | Stored impact |
| --- | --- | --- | --- | --- |
| A-F4 (DATA-103) | Fixed: Keep industrial revenue tags separate from the bank-extended revenue comparison list. | This commit | fixround-a4-red2 / fixround-a4-green | No persisted rewrite |


| Review item | Disposition | Commit | Evidence | Stored impact |
| --- | --- | --- | --- | --- |
| A-F5 (DATA-114) | Fixed: Truncate merged FMP history at the earliest last bar of any accepted window-fallback chunk, preserving stale metadata and disclosure. | This commit | fixround-a5-red / fixround-a5-green | No persisted rewrite |


| Review item | Disposition | Commit | Evidence | Stored impact |
| --- | --- | --- | --- | --- |
| A-F6 (RPT-201) | Fixed: Dividend pay-date notes use the established frequency word, or Next dividend payable when unknown. | This commit | fixround-a6-red2 / fixround-a6-green | No persisted rewrite |


| Review item | Disposition | Commit | Evidence | Stored impact |
| --- | --- | --- | --- | --- |
| A-F7 (AI-508/DATA-112) | Fixed: Commit Q3/10-K recast, rounding, NVIDIA no-change, weekend, DST and after-settle controls. | This commit | fixround-a7-controls | No persisted rewrite |


| Review item | Disposition | Commit | Evidence | Stored impact |
| --- | --- | --- | --- | --- |
| A-F8 (AI-508) | Fixed: Presentation-change notes name the actual disagreeing shared stated/implied window and the earlier filing. | This commit | fixround-a8-red / fixround-a8-green | No persisted rewrite |


| Review item | Disposition | Commit | Evidence | Stored impact |
| --- | --- | --- | --- | --- |
| B-F1/B-F5 (AI-506) | Fixed: Keep OD-10 results selection; repair the five result-free fixtures without changing assertions, hedge classifier-miss notes, and recognize USD/EUR/GBP/JPY/CNY/RMB and their currency signs. | This commit | fixround-b1-b5-red / fixround-b1-b5-green | No persisted rewrite |


| Review item | Disposition | Commit | Evidence | Stored impact |
| --- | --- | --- | --- | --- |
| B-F2/B-F3 (DATA-108) | Fixed: Clause-only event headings require a terminator or standalone heading evidence, and consume consecutive clauses of the same official title. | This commit | fixround-b2-b3-red / fixround-b2-b3-green | No persisted rewrite |


| Review item | Disposition | Commit | Evidence | Stored impact |
| --- | --- | --- | --- | --- |
| B-F4 (AI-512-V1) | Fixed: Use one shared completed-release contradiction rule for excerpt titles and tables; outlook fiscal order must follow the newest labelled statement ending by filing date. | This commit | fixround-b4-red / fixround-b4-green | No persisted rewrite |


| Review item | Disposition | Commit | Evidence | Stored impact |
| --- | --- | --- | --- | --- |
| B-F6 (DATA-107) | Fixed: Priority selects the capped filing set only; read and output the chosen set by filing date, newest first. | This commit | fixround-b6-red / fixround-b6-green | No persisted rewrite |


| Review item | Disposition | Commit | Evidence | Stored impact |
| --- | --- | --- | --- | --- |
| B-F7 (DATA-110) | Fixed: Disclose partial prose-plan parsing, and retain terminations with unknown expiration as expires null. | This commit | fixround-b7-red / fixround-b7-green | No persisted rewrite |


| Review item | Disposition | Commit | Evidence | Stored impact |
| --- | --- | --- | --- | --- |
| B-F8 (DATA-102) | Fixed: The SEC-fallback peer profile depends on its own submissions freshness only. | This commit | fixround-b8-red / fixround-b8-green | No persisted rewrite |
