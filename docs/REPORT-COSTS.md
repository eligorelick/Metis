# Report costs and elapsed time

Recorded 2026-11-14 (local date). These are observations of earlier builds, not a benchmark or a quote for the current build. No paid API run was made for this documentation.

## Claude sign-in

Reports #64 JPM, #65 LLY and #66 TSM were generated on build `17c791d2` (stored report inputs and pass artifacts measured 2026-11-14). Requested Opus 5.5/high; analyst telemetry observed Opus 5.5 and Haiku 5.5, synthesis Opus 5.5. Applied effort was not established. Each report recorded $0 API spend and consumed subscription usage, whose monetary value and remaining allowance Metis cannot measure.

Elapsed time runs from job creation to verify settlement. Pass intervals include overhead; the first includes data collection. LLY includes its failed synthesis and successful retry. Token totals are CLI telemetry, not an API invoice.

| Report/pass | Input tokens | Output tokens | Searches | Settle UTC | Interval seconds |
|---|---:|---:|---:|---|---:|
| LLY bull | 1,628,356 | 40,376 | 8 | 2026-11-14T21:17:43.341Z | 328.322 |
| LLY bear | 1,620,935 | 40,922 | 8 | 2026-11-14T21:23:27.758Z | 344.417 |
| LLY synthesize 1 (failed) | 946,618 | 132,553 | 0 | 2026-11-14T21:41:24.683Z | 1076.925 |
| LLY synthesize 2 (retry) | 1,254,247 | 92,171 | 0 | 2026-11-14T21:52:24.660Z | 659.977 |
| LLY verify | 0 | 0 | 0 | 2026-11-14T21:52:34.556Z | 9.896 |
| JPM bull | 1,605,978 | 40,593 | 8 | 2026-11-14T21:18:34.576Z | 379.302 |
| JPM bear | 1,408,649 | 39,054 | 8 | 2026-11-14T21:23:48.526Z | 313.950 |
| JPM synthesize | 1,117,818 | 154,052 | 0 | 2026-11-14T21:44:43.842Z | 1255.316 |
| JPM verify | 0 | 0 | 0 | 2026-11-14T21:44:53.681Z | 9.839 |
| TSM bull | 1,204,778 | 40,526 | 8 | 2026-11-14T21:51:58.760Z | 319.733 |
| TSM bear | 1,059,696 | 38,984 | 8 | 2026-11-14T21:56:49.978Z | 291.218 |
| TSM synthesize | 668,108 | 133,834 | 0 | 2026-11-14T22:14:34.148Z | 1064.170 |
| TSM verify | 0 | 0 | 0 | 2026-11-14T22:14:38.826Z | 4.678 |

| Report | Total input tokens | Total output tokens | Total minutes | Hypothetical Claude API estimate |
|---|---:|---:|---:|---:|
| JPM | 4,132,445 | 233,699 | 32.64 | $21.36 |
| LLY | 5,450,156 | 306,022 | 40.33 | $28.08 |
| TSM | 2,932,582 | 213,344 | 28.00 | $16.16 |

API estimates computed on 2026-11-15 for build `2602994b`, using registry snapshot 2026-11-13: all input tokens at Opus 5.5 $4/million, output at $20/million, plus 16 searches. Formula: (input tokens ? 4 + output tokens ? 20) / 1,000,000 + 16 ? 0.01. No caching discount assumed; failed-attempt tokens included. This reprices mixed-model CLI telemetry as all-Opus API traffic: actual API token accounting, cache usage, research and retries can differ. API elapsed time is not measured. The generated README table uses a separate synthetic fixture, not these measured reports.

## Data-only

Twelve panel captures on 2026-11-14 local date, build `c06ee7a5`, recorded $0 AI spend and skipped all AI passes. Times below run from job creation to the final job update, read from the check database; they include collection and computation. They are not estimates for other companies or machines.

| Company | Seconds |
|---|---:|
| BAC | 29.942 |
| CAT | 30.784 |
| DIS | 19.592 |
| KO | 39.125 |
| LLY | 22.290 |
| MET | 48.042 |
| NVO | 11.336 |
| PLD | 28.996 |
| UNH | 32.992 |
| UNP | 21.285 |
| WMT | 35.200 |
| XOM | 10.245 |

## ChatGPT sign-in

Cost and time per report: not measured for this release. Complete-run connectivity evidence alone does not establish representative timing or subscription cost.
