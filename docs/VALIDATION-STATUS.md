# Research validation status

Checked 2026-11-15 against build `3c0dbffe19cc418d53171ed156ecfa5c0e64c4b5`.

The release panel covers 25 companies: AMZN, META, MU, NVDA, QCOM, FIGR, JPM, PGR, O, DUK, TSM, RIVN, VKTX, LLY, WMT, XOM, CAT, KO, UNH, DIS, UNP, BAC, MET, PLD and NVO. Routes include banks (JPM, BAC), insurers (PGR, MET), REITs (O, PLD) and the general route for the others. Overlays include foreign shares (TSM, NVO), recent IPO (FIGR), unprofitable (RIVN, VKTX) and utility (DUK). Each has a data-only case. AMZN, META, MU, NVDA, JPM, LLY and TSM also have fixed-analyst cases (two for LLY), giving 33 same-report cases.

The same-report check rebuilds frozen inputs offline and compares outputs. It tests reproducibility and detects changed behavior; it does not prove correctness. On this build all 33 cases rebuilt offline with status ok.

Accuracy check on this build: **535 figures across 25 data-only cases: 331 match, 13 mismatch, 121 gap, 70 not-established**. Every figure met its checked-in expectation. Matches mean the checker established agreement on the defined filed basis; mismatches mean disagreement; gaps are withheld report figures; not-established means the checker lacks a proven reference. A passing accuracy gate means no unapproved regression against expectations. It does not mean zero mismatches or complete checker coverage.

Latest completed successful main CI when this page was prepared: [run 43736624588](https://github.com/eligorelick/Metis/actions/runs/43736624588), build `3c0dbffe`, 2026-11-15 UTC: the Linux product suite passed 19,911 tests with 10 skipped; the Windows job also ran the product suite, passing 19,917 tests with 4 skipped (816 test files each). Each platform additionally passed 4 integration tests. Synthetic offline tests establish software behavior, not investment performance or universal factual accuracy.

Real-company panel inputs are private local vendor data. A public clone cannot reproduce the same-report and accuracy panel checks without those inputs; CI uses synthetic fixtures. See [operations](OPERATIONS.md#accuracy-check-beside-the-same-report-check) for commands and interpretation, [known limitations](KNOWN-LIMITATIONS.md), and [report costs and times](REPORT-COSTS.md).

[Earlier validation milestones and research plans](archive/VALIDATION-HISTORY.md) are preserved as dated history. No predictive return or grade calibration has been established by these release checks.
