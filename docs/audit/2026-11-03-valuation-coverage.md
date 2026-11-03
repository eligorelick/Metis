# Valuation coverage: frozen 33-company replay, 2026-11-03

Coverage increases from **20 to 23 of 33**. EXPE, NKE and NVO have evidence-backed
coverage defects. Every previously valued company's fair value, WACC and
DCF/share is unchanged at full precision. COST's composite intentionally moves
61.97 to 61.30 as the generic lease repair restores historical EV multiples
and their valuation signal. No other company's compared numerical result
changes. **The new values remain conditional
model results:** NIKE depends on a historical-margin fallback; NVO's large
premium to the quote is an explicit assumption-risk flag, not a recommendation.

This is an offline implementation review of frozen inputs, not new company
research. Baseline: main `56886dade48b219f9e8576e5b8b20436bf93f1b4`.
The 2026-11-03 census's `run_input_snapshots.snapshotJson` supplied each
`content.bundle` and `content.stageBConfig`. The external census database was
opened only with `new Database(path, { readonly: true, fileMustExist: true })`.
No production application database, network endpoint, model or paid service was
used. Dependencies were installed with Node 24.11.1, `npm ci --offline
--no-audit --no-fund`. The supplied replay harness and all scratch outputs are
under ignored `tmp/int/panel/`.

Decision: [D-186](DECISIONS.md#d-186---evidence-backed-valuation-coverage-and-explicit-withholding-reasons-2026-11-03).
No version constants were changed.

## Disposition of the 13 withheld companies

Classes: **a** = genuinely missing/inconsistent admitted inputs; **b** = repaired
defect; **c** = deliberate DCF model boundary. A disclosure repair does not
convert a legitimate numerical refusal into a numerical defect.

| Company | Class | Exact rule and frozen input | Disposition and evidence |
| --- | --- | --- | --- |
| AAPL | a | `buildDcfAssumptions` requires known invested-capital operands; `totalDebt` is refused by D-174. Resolved financing debt falls from USD 84.307B at 2026-06-27 to 3.453B at 2026-09-26 (-95.9%), with net debt issuance -4.250B, liabilities **up** 16.709B and equity up 4.573B. Those movements do not explain the missing debt. | Keep withheld. Latest complete balances support WACC 9.53%, but cannot supply the newer valuation bridge. The fair-value reason now includes the underlying debt-collapse refusal instead of only `valuation.dcf.salesToCapital`. No stale balance is substituted. D-174/D-179 remain. |
| EXPE | b | The latest 2026-06-30 vendor lease line USD 226M equals only `OperatingLeaseLiabilityNoncurrent`; filing `0001324424-26-000053` has no current/total operating-lease fact. Full-lease completion therefore refuses total/net debt, preventing the existing partial-lease cancellation path from seeing the independently proved financing debt: `LongTermDebtCurrent` **0**, `LongTermDebtNoncurrent` **USD 5.459B** in that same filing. | Restore the reconciled **partial** calculation view: retained 5.685B = borrowings 5.459B + observed noncurrent operating portion 0.226B. The identical embedded portion cancels under the default lease-excluded convention; no operating maturity is invented. The lease-inclusive switch still refuses. Finance/extra borrowings, contradictory components, mixed/future sources and separate debt-collapse refusals remain binding. [Filed evidence](https://www.sec.gov/Archives/edgar/data/1324424/000132442426000053/expe-20260630.htm). DCF **USD 257.80** versus quote 286.63; this supersedes D-179's EXPE disposition for this proved case. |
| MCD | a | `keyless.incomeQuarterly.shareBasis` refuses provider 711,100,000 diluted shares versus SEC **711.1** `shares` for 2026-04-01–2026-06-30 (`0000063908-26-000073`). Annual shares similarly disagree: 716,400,000 versus **716.4** (`0000063908-26-000035`). Both share families arrive with the rejected counts absent. | Keep withheld. This is a million-fold unit inconsistency in the retained tagged facts, not missing economics. A cover count is outstanding shares, not a diluted weighted average. No undocumented factor-of-a-million repair or cap/price denominator is applied. The fair-value reason now quotes the actual share-unit dispute. D-179 explicitly recorded this refusal. |
| ORCL | c | `dcfDomainFailure` (D-102): terminal PV USD 431.57B exceeds EV 424.80B (101.59%); explicit PV is -6.77B. Independently, `leaseDebtConflict` finds operating leases USD 34.621B above the vendor lease line **0** at the bridge date. | Preserve outside-domain. The lease contradiction remains disclosed and would need reconciliation even under a different forecast. A longer explicitly funded investment cycle / normalized forward cash flows is standard practice, but the current model does not establish that forecast. Existing relative multiples remain the supported comparison where their own inputs qualify. |
| NKE | b | `retainedClassEconomicEvidence`/`identicalClassRights` missed the filed sentence: “There are no differences in the dividend and liquidation preferences or participation rights of the holders of Class A and Class B Common Stock.” Latest cover counts are 281,387,752 A + 1,203,921,077 B at 2026-09-28; unresolved capitalization prevented WACC and DCF. | Read the exact whole sentence; combine the complete same-date cover inventory with the same-filing balance-sheet class set and recent unchanged annual rights. Use the explicitly disclosed same-price approximation for equal economic units. No quoted-class guess is necessary. [Annual rights](https://www.sec.gov/Archives/edgar/data/320187/000032018726000088/nke-20260531.htm); [latest cover and balance](https://www.sec.gov/Archives/edgar/data/320187/000032018726000193/nke-20260831.htm). New fair value USD 41.09; see qualifications below. |
| INTC | c | `routeCompany` applies `unprofitable` because TTM net income is **-USD 12.032B** through 2026-09-26, despite positive operating cash flow **USD 17.472B**. `metricPolicy(...).suppress` contains `fcfDcf`; `valueCompanyCore` exits before building a DCF. | Keep the audited house boundary. MD&A is not read by this rule and its missing section is not the cause. Correct the misleading “structurally negative FCF” explanation to name the actual loss trigger and basis. Standard normalized/turnaround FCFF valuation needs a separately supported recovery and reinvestment forecast; the app currently supplies relative multiples and scenario/runway framing, not that model. |
| TSLA | c | D-102: explicit PV **-USD 15.653B**, terminal PV **USD 19.089B**, EV **USD 3.436B**; terminal share **555.55%**. Positive raw bridged equity does not cure the negative explicit-period PV. | Keep outside-domain. A scenario-weighted valuation of businesses/options or a longer evidenced investment cycle may be appropriate, but current relative multiples/scenario framing are the available tools. No optionality, segment SOTP or new model was built. |
| TM | a | D-178 outstanding-share ratio: filed 13,033,931,974 ordinary shares at 2026-03-31 versus provider quoted 1,184,184,620 = **11.0067**, not a supported standard ratio within 1%. | Keep withheld. FX is present: DEXJPUS 157.47 JPY/USD dated 2026-10-30. Even a hypothesized 10:1 ratio is independently disputed by the matched FY2025 weighted shares: 13.252456B / 1.3113093B = **10.1063**, just outside 1%. No tolerance widening or ticker ratio table. |
| NVO | b | D-178 looked only for DEI outstanding shares. The same retained filing instead has `ifrs-full:NumberOfSharesOutstanding` **4.444B**. Filed basic weighted shares **4.443B** and provider **4.447851B** corroborate 1:1; provider quoted **4.420890725B** matches cap/quote. | Add the IFRS outstanding-count synonym only when no eligible DEI count exists. Preserve the 400-day limit, both independent 1% checks, cutoff and split guards. [Filed FY2025 evidence](https://www.sec.gov/Archives/edgar/data/353278/000035327826000012/nvo-20251231.htm). DEXDNUS 6.6946 DKK/USD dated 2026-10-30 yields USD 93.39/ADS. Material assumption flag below. |
| SAP | a | DEI filed ordinary count 1,228,504,232 at 2025-12-31 / quoted 1,165,235,164 = **1.0543**, beyond 1%. `NumberOfSharesIssued` is 1.229B; `TreasuryShares` is **EUR 6.948B**, a monetary amount, not a count. | Keep withheld. DEXUSEU 1.1163 on 2026-10-30 is the same valid EUR/USD rate ASML uses; FX is not the failure. A matching annual weighted ratio alone does not resolve the independently disputed outstanding count. No invented treasury-share subtraction. Additional newer debt plausibility refusals also remain. |
| SONY | a (also c) | No ordinary cover count within D-178's 400 days; the latest eligible DEI count ends **2019-03-31**. The available IFRS count at **2025-03-31** is **582 days** old on the quote date. Independently the loss overlay sees TTM net income **-JPY 221.613B**, with positive CFO **JPY 2,043.564B** through 2026-06-30. | Keep currency/security refusal and loss-overlay suppression. DEXJPUS 157.47 is available, so fetching FX is not a solution. The loss disclosure now names the actual trigger rather than asserting negative FCF. Current share evidence and a separately evidenced post-disposal normalized forecast would be needed. |
| BABA | a | D-178 refuses unresolved split history: an 8:1 ordinary split in 2019 is tagged/restated in SEC facts but absent from the retained vendor's covered trading-session split history. Also, the current DEI count 1.858037427B at 2026-03-31 conflicts with the provider ADS count 2.380546378B and the filed receipt ratio **8**. | Keep withheld. DEXCHUS 6.6538 CNY/USD is present. Current weighted basic shares 18.568B / provider 2.321B = **8**, but that does not reconcile the contradictory cover count or unresolved split evidence under the audited rule. No explicit receipt ratio is allowed to erase contradictory unit evidence. |
| TSM | a | FX/security succeeds: DEXTAUS 32.59 TWD/USD, ratio **5**; WACC 11.330692%. DCF has positive book NCI **USD 1.387670512B** but `noncontrollingEarningsInput` cannot establish an NCI share of consolidated profit in either current TTM or latest FY2025. | Keep per-share withheld under D-102 E-5. The retained IFRS NCI earnings allocation ends in FY2024 (-TWD 856.3M); it is not the current window's allocation. Do not assume current zero, reuse a stale percentage or let a small book claim establish its earnings value. The existing detailed NCI fair-value reason already names this cause. |

`criticalGaps` is not an exhaustive explanation: MCD's share refusal and TSM's
NCI key are warnings; INTC/SONY's model suppression is information. The actual
fair-value reason and upstream manifest must be inspected together.

The deterministic call paths are:

| Cause | Owning code path |
| --- | --- |
| AAPL/EXPE debt and invested capital | [`runStageB` / `withMarketableEquity` / `computeValuation`](../../src/pipeline/compute.ts) → [`admitDebtFields`](../../src/edgar/financialEnrichment.ts), debt plausibility admission and [`restoreLeaseFinancingProvenance`](../../src/pipeline/stageB/leaseScope.ts) → [`buildDcfAssumptions`](../../src/pipeline/stageB/valuation.ts) (`balance.totalDebt`, equity, cash) → [`computeFairValue`](../../src/pipeline/stageB/fairValue.ts). |
| NKE capitalization / MCD divisor | [`retainedClassEconomicEvidence`](../../src/edgar/retainedClassEconomics.ts) → [`resolveEconomicEquityScope` / `issuerEconomicDilutedShares`](../../src/pipeline/stageB/securityBasis.ts); the separate `computeValuation` divisor path consumes admitted `weightedAverageShsOutDil` through `incomeDivisors`, then the DCF bridge. |
| Foreign quote/reporting currency | [`resolveForeignValuation`](../../src/pipeline/foreignCurrency.ts) → translated calculation views only on admitted FX/ADS evidence; otherwise [`computeWacc`](../../src/pipeline/stageB/returns.ts) emits `returns.wacc.weights.currency` and `valueCompanyCore` emits `valuation.dcf.currency`. |
| TSM ownership allocation | `computeValuation` → [`noncontrollingEarningsInput` / `valueCompanyCore`](../../src/pipeline/stageB/valuation.ts) → `dcf.noncontrollingKeyWithheld` → `computeFairValue`, `valuation.dcf.noncontrollingEarningsKey`. |
| ORCL/TSLA domain | [`dcfDomainFailure`](../../src/pipeline/stageB/valuation.ts) → `dcf.domain` → `computeFairValue`, `valuation.dcf.domain`. |
| INTC/SONY loss overlay | [`routeCompany` → `metricPolicy`](../../src/pipeline/stageB/sectorRouting.ts) → `valueCompanyCore` returns `dcf-suppressed` → `computeFairValue`. `edgar.mdna` is outside this dependency path. |

## Before and after: every company

All per-share amounts below are USD/share or USD/ADS as appropriate. WACC is in
percent. DCF/share is unrounded; headline fair value rounds to cents. A single
value with `=` means identical before and after at full precision (displayed
digits are abbreviated). `—` means unavailable; `outside` means the domain
withholds the value. Composite includes its existing band. The baseline replay
also reproduces the supplied `census2-main-56886dad.json` numerical fields.
ASML in these exact census snapshots is USD 962.147884147 (headline 962.15),
both before and after; D-185's separate paid report recorded 962.12. The latter
is not substituted for this replay's supplied baseline.

<!-- PANEL_TABLE -->
| Company | Headline fair value, before → after | WACC %, before → after | DCF/share, before → after | Composite, before → after |
| --- | --- | --- | --- | --- |
| AAPL | withheld = | 9.52828 = | — = | 60.06 C = |
| AMZN | 129.01 = | 10.312354 = | 129.007157051 = | 56.19 C = |
| ASML | 962.15 = | 10.065877 = | 962.147884147 = | 67.47 C = |
| BA | 149.58 = | 8.848328 = | 149.575248843 = | 44.82 D = |
| BABA | withheld = | — = | — = | 49.39 D = |
| CAT | 290.52 = | 10.175015 = | 290.520712137 = | 55.71 C = |
| COST | 325 = | 8.931593 = | 324.996770807 = | 61.97 C → **61.3 C** |
| DIS | 66.78 = | 9.37546 = | 66.779671231 = | 58.17 C = |
| EXPE | withheld → **257.8** | 9.607259 → **9.757797** | — → **257.796844275** | 61.77 C → **63.11 C** |
| GOOGL | 248.77 = | 9.819557 = | 248.765344502 = | 60.36 C = |
| HD | 197.42 = | 8.449007 = | 197.418196798 = | 54.96 D = |
| INTC | withheld = | 12.059599 = | — = | 40.22 D = |
| JNJ | 153.25 = | 7.436363 = | 153.250168437 = | 49.37 D = |
| KO | 42.48 = | 7.320586 = | 42.477974856 = | 56.44 C = |
| LLY | 595.71 = | 7.64701 = | 595.710210466 = | 57.8 C = |
| MCD | withheld = | 6.903431 = | — = | 62.18 C = |
| META | 608.57 = | 9.969855 = | 608.573856496 = | 60.53 C = |
| MSFT | 451.02 = | 9.549742 = | 451.02339945 = | 61.86 C = |
| NKE | withheld → **41.09** | — → **9.028092** | — → **41.094290265** | 48.97 D → **51.35 D** |
| NVDA | 232.05 = | 12.958851 = | 232.046053098 = | 76.84 B = |
| NVO | withheld → **93.39** | — → **7.033603** | — → **93.387500428** | 60.34 C → **69.11 C** |
| ORCL | outside = | 9.588648 = | — = | 50.86 D = |
| PEP | 109.84 = | 6.891328 = | 109.844408017 = | 55.93 C = |
| PG | 109.69 = | 7.298037 = | 109.68849582 = | 60.07 C = |
| SAP | withheld = | — = | — = | 59.81 C = |
| SONY | withheld = | — = | — = | 56.91 C = |
| TM | withheld = | — = | — = | 49.04 D = |
| TSLA | outside = | 12.075554 = | — = | 58.71 C = |
| TSM | withheld = | 11.330692 = | — = | 73.02 B = |
| UNH | 360.63 = | 7.56568 = | 360.634196228 = | 54.03 D = |
| VZ | 57.15 = | 6 = | 57.148453614 = | 56.48 C = |
| WMT | 43.62 = | 7.769651 = | 43.624428025 = | 53 D = |
| XOM | 94.76 = | 7.455506 = | 94.762813036 = | 52.61 D = |
<!-- END_PANEL_TABLE -->

EXPE, NKE and NVO gain values. EXPE's proved lease-excluded financing debt reaches
WACC, capital and valuation consumers. NKE/NVO's newly admitted equity capitalization also reaches
market-value WACC weights, valuation signals and dependent score consumers.
Those downstream composite changes are intended. No score thresholds or
valuation arithmetic were retuned.

The sole intended change among the original 20 valued companies is COST's
composite **61.97 C → 61.30 C**. Historical partial-lease debt can now enter
lease-excluded EV multiples, restoring the EV/EBITDA empirical percentile
rank **73.8691943** from **12 quarters** (formerly unavailable). The valuation
aspect rises **15 → 25.21**, with completeness **0.4 → 0.7**. More weight on
this below-neutral valuation observation lowers the overall composite even
though the aspect's own score rises. COST's current EV multiples, WACC, DCF
and fair value remain identical. This is an intended evidence-completeness
effect of the generic repair, not a score-band or valuation change.
For example, COST's 2025-11-23 retained composition is USD **8.172B =
0.070B current borrowings + 5.666B noncurrent borrowings + 2.436B observed
noncurrent operating leases**. The same proven operating portion leaves both
the retained composition and the EV bridge; the missing current operating
maturity is never included in the lease-excluded EV.

## Analyst sanity checks

EXPE's USD **257.796844275** per share is **10.06% below** its USD 286.63 quote.
Its WACC rises from **9.607259385% to 9.757796877%** because the latest
proved financing debt can now enter the lease-excluded weights. Enterprise
value is **USD 30.074551B**, common equity **USD 31.905711B**, on **123.763M**
filed diluted weighted shares. The bridge uses net cash **USD 1.668B**, book
NCI **USD 1.262B** (annual earnings share 0.538%, below the existing 10%
earnings-key materiality threshold) and net non-operating assets **USD 1.42516B**.
Explicit PV **USD 15.891611B** and terminal PV **USD 14.182940B** are positive;
terminal share is **47.16%**, growth **2.5%**, RONIC **9.7578%**. Starting
revenue is **USD 15.700B**, first-year consensus growth **4.87%**, and the
15.97% TTM margin is held flat. Reverse DCF implies **9.15%** initial growth
and reproduces the quote at **USD 286.64199** (error +0.0042%). A 1pp WACC
increase yields **USD 230.94**; using the retained 12.6994% annual operating
margin flat yields **USD 205.86**. These are plausible conditional outcomes.

EXPE qualifications: the 123.763M period-average diluted denominator is **8.09%
above** quote-implied outstanding shares 114.498625M; the difference is shown,
not erased by substituting cap/price. The existing sales-to-capital house cap
**5** applies because USD 1.804B long-term investments exceed the USD 0.803B
lease-excluded invested capital; the separate investment add-back is after tax.
First-year model FCFF **USD 1.856B** is below observed after-SBC FCF
**USD 4.047B**. The lease-inclusive valuation remains unavailable. The check
establishes arithmetic and scope coherence, not the cash availability or future
economics of customer booking float.

| Check | NKE | NVO |
| --- | --- | --- |
| Quote / fair value / upside | USD 38.22 / 41.09 / +7.51% | USD 40.105 / 93.39 / +132.86% |
| WACC / terminal growth / RONIC | 9.0281% / 2.5% / 14.0281% | 7.0336% / 2.5% / 12.0336% |
| EV / equity | USD 60.517B / 60.992B | USD 428.165B / 414.248B |
| PV explicit / PV terminal / terminal share | USD 28.310B / 32.207B / 53.22% | USD 149.221B / 278.943B / 65.15% |
| Diluted divisor | 1.4842B latest-quarter shares; 0.075% below dated cover total | 4.4358B latest-quarter ADS; no double application of the 1:1 ratio |
| Revenue seed / first-year growth | USD 45.891B / **-7.38%**, from calendarized consensus | USD 49.208B (= DKK 329.431B / 6.6946) / **+11.76%**, no admitted consensus |
| Operating margin | 11.92% five-year-median fallback throughout | 43.13% TTM, fading to 42.28% |
| Reverse DCF, same path family | Implied first-year growth **-10.06%**, versus base -7.38% | Implied first-year growth **-14.97%**, versus base +11.76% |
| Scope / bridge | Complete A/B economic units, all at the same-price approximation; net cash USD 0.475B | One constant USD/DKK conversion, source statements unchanged; net debt USD 14.212B less USD 0.296B net non-operating assets |

All three explicit PVs and equity values are positive; terminal value is below 100%
of EV, and terminal growth is below WACC. Independent bridge arithmetic
reproduces each unrounded per-share value. Re-running the same growth-family
DCF at each reverse-implied path reproduces its quote within the solver's
tolerance: reverse-path reruns return USD **38.22188** for NKE (error +0.0049%)
and USD **40.09907** for NVO (error -0.0148%). Increasing WACC by 1pp while
holding the other inputs fixed reduces value to USD **35.93** and **76.38**,
respectively. These are sensitivity reruns of the existing model, not new
forecasts or a recalibration.

**NKE needs a margin qualification.** The model's current TTM operating-income
pair is unavailable (`valuation.dcf.ttmEbitMargin`); the existing method uses
the 11.9181% five-year median. Its first-year FCFF is USD 4.018B against
reported after-SBC FCF of USD 1.417B. This is a normalized earnings forecast,
not a continuation of observed cash generation. The modest +7.5% base upside
does not make the margin assumption immaterial. Holding the retained latest
annual operating margin of **8.1900%** flat instead gives **USD 27.60**, with
the same revenue and bridge. That observation is a diagnostic alternative,
not an independently admitted TTM pair. No newly inferred current margin or
analyst margin was added in this fix. The base value requires explicit review
of margin normalization before release/use as an investment conclusion.

**NVO is a material assumption-risk flag.** USD 93.39 is more than twice the
quote. The unit/FX/ADS bridge is internally consistent, but +11.76% first-year
growth and roughly 42% terminal margins extrapolate historical operating
economics with a 7.03% WACC. Analyst rows lack established currency/share
basis and remain excluded. The reverse model's -14.97% initial growth shows
how different the price-supported path is when every other assumption is held
fixed; it is not an independent forecast. Publish this only as the disclosed
conditional model case. A fresh evidenced outlook and downside scenarios are
needed before interpreting it as investment opportunity. Do not tune the
model to the quote, or treat restored currency coverage as new outlook evidence.
Holding the retained FY2025 41.3047% operating margin flat gives USD 90.82:
the large quote gap survives that margin check, emphasizing growth/discount
assumptions and outlook risk rather than an obvious currency-factor error.

## Tests and verification

- New equal-class tests first failed because the whole equality sentence was
  unrecognized and no economic scope was admitted (2 failures). Split-after-cover
  and unobserved-extra-class controls were also observed failing before their
  guards (2 failures). The public SEC fixture retains the rights paragraph,
  balance-sheet class rows and dated class-cover observations only.
- The IFRS outstanding-share regression failed with no ratio before the
  synonym; afterward it resolves 1:1 under the existing checks.
- The partial-lease regression failed to establish EXPE's proved borrowings
  before the restoration. Independent debt-collapse/component refusals,
  mixed/future filings, extra borrowings and finance leases remain controls;
  additional legacy-finance and unrelated-refusal checks were observed failing
  before their guards. Existing partial-lease consumer tests also pass.
- Four disclosure regressions failed before their repairs: debt behind missing
  capital, ADS evidence behind currency refusal, the actual loss trigger, and
  the original share-unit disagreement.
- Final focused suite: **11 files, 164 tests passed**, including the borrowing-
  scope and class-count controls. The full replay again checks all 33 after
  the final admission guard.
- Full `npm run verify`: **passed, exit 0**, on final production code under
  Node 24.11.1 in PowerShell, with `npm_execpath` set to the installed npm CLI.
  Dependency shape, typecheck and lint passed. Product: **668 files, 15,155
  tests passed, 3 skipped**. Integration: **4 tests passed**. Both coverage
  runs repeated the full product suite successfully; every configured
  aggregate and per-file threshold passed. No timeout retry was needed on
  this final run.
- Core coverage: **97.61% statements / 93.23% branches / 99.09% functions /
  98.69% lines**. Risk coverage: **96.07% / 91.26% / 98.27% / 98.05%**.
- Production build passed. The security-audit command returned **0
  vulnerabilities** with `npm_config_offline=true`; this records the offline
  result and does not claim a newly fetched registry advisory assessment.
  No network access was enabled to refresh that data. Full log and exit code
  are retained in `tmp/int/panel/verify-complete.log` and `.exit`.

The first full attempt started before new tests were staged and before this
linked report existed; its repository partition/docs-link failures are setup
ordering failures, not ignored test results. The complete command was rerun
after those artifacts were present and passed as recorded above.
The new permanent audit report also required adding its exact path to the
existing release-document allowlist after that gate correctly refused it.
Earlier runs were stopped before build while the EXPE repair was being
completed, and to make build isolation/telemetry settings explicit. The final
complete run uses scratch `METIS_DATA_DIR`/`METIS_DB_PATH`,
`NEXT_TELEMETRY_DISABLED=1`, and offline npm; its result supersedes those
incomplete runs without claiming they passed.

## Required release stamps and remaining models

Keep constants unchanged in this implementation branch, as requested. Before
release advance **Stage B**, **fair-value method**, **scenario-target method**,
and **PAYLOAD_VERSION**: identical frozen inputs now admit new capitalizations,
values and derived grades, and analysts receive changed deterministic content
and withholding reasons. **PIPELINE_VERSION** and the report spec need no bump
because orchestration, prompts and schema are unchanged. Stored snapshots and
report bytes remain immutable. No pinned numerical golden required an update.

ORCL/TSLA should be researched with an explicitly supported investment-cycle
forecast and alternative relative valuations; the existing FCFF domain guard
should remain. INTC needs an evidenced turnaround/reinvestment forecast.
SONY additionally needs a current security basis and normalized post-disposal
earnings. Existing relative multiples and runway/scenario framing may support
that research subject to their own input gates. A segment SOTP, real-options
model, financing-aware turnaround DCF or longer explicit investment-cycle model
is a future modelling task, not a number supplied by this patch.
