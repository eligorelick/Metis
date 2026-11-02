# P9 methodology decisions (2026-11-02)

The owner delegated these methodology decisions to the coordinator on 2026-11-01.
Base: ae4b656e. Replays are offline; stored reports and snapshots are immutable.

| Item | Disposition | Commit | Red / green receipts | Stored-report impact |
| --- | --- | --- | --- | --- |
| FIN-306 | Fixed: route-withheld Piotroski tests leave the applicable ceiling; missing supported tests still reduce evidence | See commit titled Correct Piotroski route applicability | fin306-red / fin306-green, fin306-fixtures | New computations only; historical scores remain as stored |
| FIN-307 | Confirmed: retain D-137 OD-6 | See commit titled Confirm ADR capitalization disclosure | fin307-surfaces (6 passing; no defect reproduced) | No calculation change; stored reports retained |
| FIN-308 | Fixed: filed majority, then common grading | See commit titled Classify REITs from filed asset majorities | fin308-red, fin308-provenance-red / fin308-consumers | New computations only; historical bytes retained |
| FIN-510-V1 | Fixed: refuse ambiguous sibling value | See commit titled Withhold ambiguous deferred revenue | fin510v1-red / fin510v1-green | New statement builds only; historical bytes retained |
| Cash-capex | Confirmed: retained cash-capex field and mixed-basis disclosure | See commit titled Confirm retained cash-capex convention | cash-capex-records | No calculation change |

## FIN-306 measurements

The real fully observed bank battery is 3/3, with six tests excluded by route.
Its composite supporting weight and ceiling are both 74.51 (rounded); applicable
completeness is 1. The old 8/9 bank fixture and B-to-C transition encoded an
impossible battery and the wrong denominator. The replacement pins absence of
shrinkage at full applicable evidence and shrinkage when supported data is missing.
The quality aspect's 3/9 evidence weighting is retained.

| Census issuer | Before composite / band | After composite / band | Reason |
| --- | --- | --- | --- |
| BAC | 58.28 C | 58.71 C | Six route-withheld tests leave ceiling |
| BRK.B | 52.02 D | 52.14 D | Six route-withheld tests leave ceiling |
| JPM | 55.10 C | 55.36 C | Six route-withheld tests leave ceiling |
| PGR | 73.09 B | 74.45 B | Six route-withheld tests leave ceiling |
| UNH | 57.11 C | 57.22 C | Four route-withheld tests leave ceiling |
| PGR fixture | 72.24 B | 73.56 B | Six route-withheld tests leave ceiling |

Replay receipts: census-base and census-fin306 (45 census snapshots plus five
retained report snapshots). Other composite scores and bands are unchanged.

## Residuals

No live acquisition or inference is authorized. Missing source evidence stays
missing. Shared stamps remain report 1.56.0, payload 1.60.0, Stage B
STAGE_B_2026_11_CLAUDE_REPAIRS_39 and pipeline stage-c-1.6.18.


## FIN-307 verification

The exact scope warning reaches report HTML, reader Markdown, print, audit
Markdown and the serialized AI payload. Six controls pass, including retained
WACC/DCF, Altman Z-prime (1.14845, distress), cap-source selection and existing
currency/missing-cap refusals. Aggregate ADR DCF EV remains 3,200,131,788.7891836;
per-ADS value stays withheld. No red receipt is appropriate for this confirmed
no-change decision; the new surface assertions passed before production edits.


## FIN-308 measurements and calibration

The trimmed O and NNN fixtures omit every net/gross investment-property asset
tag; SIC-derived `REIT - Diversified` cannot supply a subtype. They remain
undetermined without invented evidence. Their raw Beneish scores stay
-2.596362634549579 and -2.5589578643944697. Only map-specific grading is removed.
The full census inputs carry these matched net property / Assets values:

| REIT | Net property | Total assets | Share | Result |
| --- | --- | --- | --- | --- |
| O census | 55,112,439,000 | 76,441,475,000 | 72.10% | Property; unchanged composite |
| NNN census | 9,463,681,000 | 9,606,523,000 | 98.51% | Property; unchanged composite |
| PLD census | 79,943,092,000 | 98,133,451,000 | 81.46% | Property; unchanged composite |
| AMT census | No qualifying property net/cost tags | 63,300,100,000 | Unknown | Undetermined; old tag presence was insufficient |
| O / NNN trimmed fixtures | No property tags | Filed Assets available | Unknown | Undetermined; common grading only |

| Issuer / input | Before composite / band | After composite / band | Reason |
| --- | --- | --- | --- |
| AMT census | 52.77 D | 56.18 C | No qualifying filed property majority; common grading |
| O fixture | 44.20 D | 46.50 D | Unknown subtype; common grading |
| NNN fixture | 50.73 D | 50.28 D | Unknown subtype; common grading |

All other census and retained-report scores stay unchanged from FIN-306.
Mortgage controls include MBS majority, direct loans plus MBS, aliases that
must not double count, property/mortgage 50/50 ambiguity, and token-property
holdings. Boundary tests accept exactly 50%, reject 49%, gross cost without
depreciation and different-period evidence. No census input is a mortgage
REIT; the explicit mortgage controls remain required regression coverage.


## FIN-510-V1 statement-producer replay

45 retained census companyfacts were rebuilt with the same statement options
before and after (producer-base / producer-fin510v1). These are the only
field movers; each now carries the conflict gap naming both siblings. The full
period-level amounts and gaps are retained in the two receipt JSON artifacts.

| Issuer | Changed annual / quarterly rows | Most recent affected value before -> after |
| --- | --- | --- |
| HD | 7 / 23 | FY2025 2026-02-01: 1,500,000,000 -> withheld; sibling 2,575,000,000 |
| DIS | 7 / 24 | FY2025 2025-09-27: 5,689,000,000 -> withheld |
| AAPL | 1 / 0 | FY2018: 5,966,000,000 -> withheld |
| META | 1 / 0 | FY2017: 98,000,000 -> withheld |
| ORCL | 1 / 0 | FY2018: 8,341,000,000 -> withheld |

The remaining 40 issuer producers are unchanged in these fields. JNJ FY2025
R&D stays 14,665,000,000; JPM FY2025 interest income stays 193,341,000,000.
There is no current deferred-revenue consumer in FCF, DCF or composite grades;
all census and fixture financial outputs retain their prior P9 values.


## Cash-capex confirmation

No arithmetic or runtime disclosure changed. The convention is stated in
METHODOLOGY and recorded as owner-delegated. FIG: retained vendor capex
18.238M versus PP&E-only 16.936M; the difference 1.302M is 0.6% of retained
231.012M FCF. A PP&E-plus-software basis would be another convention, requiring
comparable period evidence and dependent FCF/P/FCF/DCF-seed review across issuers.
