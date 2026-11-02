# P9 methodology decisions (2026-11-02)

The owner delegated these methodology decisions to the coordinator on 2026-11-01.
Base: ae4b656e. Replays are offline; stored reports and snapshots are immutable.

| Item | Disposition | Commit | Red / green receipts | Stored-report impact |
| --- | --- | --- | --- | --- |
| FIN-306 | Fixed: route-withheld Piotroski tests leave the applicable ceiling; missing supported tests still reduce evidence | See commit titled Correct Piotroski route applicability | fin306-red / fin306-green, fin306-fixtures | New computations only; historical scores remain as stored |
| FIN-307 | Confirmed: retain D-137 OD-6 | See commit titled Confirm ADR capitalization disclosure | fin307-surfaces (6 passing; no defect reproduced) | No calculation change; stored reports retained |
| FIN-308 | Pending | Pending | Pending | Historical bytes retained |
| FIN-510-V1 | Pending | Pending | Pending | Historical bytes retained |
| Cash-capex | Pending convention confirmation | Pending | Documentation gate | No calculation change |

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
