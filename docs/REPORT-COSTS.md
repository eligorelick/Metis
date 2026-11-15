# Report costs and elapsed time

Recorded 2026-11-14 and 2026-11-15 (local dates). These are observations of earlier builds, not a benchmark or a quote for the current build. No paid API run was made for this documentation.

## Claude sign-in, release check (2026-11-15)

Reports #64 MSFT, #65 SAP and #66 PNC were generated on build `e6b67839` on 2026-11-15 through a Claude sign-in, requested Opus 5.5/high, on an isolated copy of the database (its report numbers are unrelated to the earlier measurement's). The three ran at the same time on one machine, so their elapsed times include contention. Each recorded $0 API spend and consumed subscription usage. Analyst telemetry reports several Claude models (the CLI's own subtasks); synthesis ran on Opus 5.5. Applied effort was not established. Token totals are CLI telemetry and combine uncached input, cache reads and cache writes.

| Report/pass | Input tokens (incl. cache reads/writes) | Output tokens | Searches | Settle UTC | Interval seconds |
|---|---:|---:|---:|---|---:|
| MSFT bull | 1,416,231 | 39,292 | 8 | 2026-11-15T17:43:09.022Z | 392.593 |
| MSFT bear | 1,408,170 | 35,316 | 8 | 2026-11-15T17:48:08.402Z | 299.380 |
| MSFT synthesize | 854,637 | 142,904 | 0 | 2026-11-15T18:06:57.725Z | 1129.323 |
| MSFT verify | 0 | 0 | 0 | 2026-11-15T18:07:07.835Z | 10.110 |
| PNC bull | 1,628,924 | 39,979 | 8 | 2026-11-15T17:43:53.316Z | 436.709 |
| PNC bear | 1,430,531 | 36,312 | 8 | 2026-11-15T17:49:05.056Z | 311.740 |
| PNC synthesize | 1,089,768 | 200,901 | 0 | 2026-11-15T18:15:55.154Z | 1610.098 |
| PNC verify | 0 | 0 | 0 | 2026-11-15T18:16:07.360Z | 12.206 |
| SAP bull | 1,634,135 | 42,539 | 8 | 2026-11-15T17:42:57.738Z | 380.875 |
| SAP bear | 1,445,800 | 38,388 | 8 | 2026-11-15T17:48:53.462Z | 355.724 |
| SAP synthesize | 702,889 | 138,916 | 0 | 2026-11-15T18:07:58.234Z | 1144.772 |
| SAP verify | 0 | 0 | 0 | 2026-11-15T18:08:08.512Z | 10.278 |

| Report | Total input tokens (incl. cache reads/writes) | Total output tokens | Total minutes | Hypothetical Claude API estimate |
|---|---:|---:|---:|---:|
| MSFT | 3,679,038 | 217,512 | 30.52 | $19.23 |
| PNC | 4,149,223 | 277,192 | 39.51 | $22.30 |
| SAP | 3,782,824 | 219,843 | 31.53 | $19.69 |

API estimates use the formula and registry prices stated in the next section (all input at the uncached Opus 5.5 rate of $4/million, output $20/million, plus 16 searches at $0.01); the same caveats apply.

## Claude sign-in, earlier measurement (2026-11-14)

Reports #64 JPM, #65 LLY and #66 TSM were generated on build `17c791d2` (stored report inputs and pass artifacts measured 2026-11-14). Requested Opus 5.5/high; analyst telemetry observed Opus 5.5 and Haiku 5.5, synthesis Opus 5.5. Applied effort was not established. Each report recorded $0 API spend and consumed subscription usage, whose monetary value and remaining allowance Metis cannot measure.

Elapsed time runs from job creation to verify settlement. Pass intervals include overhead; the first includes data collection. LLY includes its failed synthesis and successful retry. Token totals are CLI telemetry, not an API invoice. The CLI total combines uncached input, cache reads and cache writes; the recorded total does not split these categories.

| Report/pass | Input tokens (incl. cache reads/writes) | Output tokens | Searches | Settle UTC | Interval seconds |
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

| Report | Total input tokens (incl. cache reads/writes) | Total output tokens | Total minutes | Hypothetical Claude API estimate |
|---|---:|---:|---:|---:|
| JPM | 4,132,445 | 233,699 | 32.64 | $21.36 |
| LLY | 5,450,156 | 306,022 | 40.33 | $28.08 |
| TSM | 2,932,582 | 213,344 | 28.00 | $16.16 |

API estimates computed on 2026-11-15 for build `2602994b`, using registry snapshot 2026-11-13: all input tokens at Opus 5.5 $4/million, output at $20/million, plus 16 searches. Formula: (input tokens × 4 + output tokens × 20) / 1,000,000 + 16 × 0.01. All combined input is priced at the uncached rate; failed-attempt tokens are included. This estimate is neither an upper nor a lower bound and likely overstates cache-heavy passes. This reprices mixed-model CLI telemetry as all-Opus API traffic: actual API token accounting, cache usage, research and retries can differ. API elapsed time is not measured. The generated README table uses a separate synthetic fixture, not these measured reports.

## Data-only

The twelve companies below were added to the panel on 2026-11-14 and captured one at a time on one machine; cache state was not controlled. Twelve panel captures on 2026-11-14 local date, build `c06ee7a5`, recorded $0 AI spend and skipped all AI passes. Times below run from job creation to the final job update, read from the check database; they include collection and computation. They are not estimates for other companies or machines.

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
