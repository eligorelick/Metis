# R5 FIGR deterministic verifier false negatives

Implementation branch: `codex/r5-figr-verifier`, based on `b0f273bb`
("Accept the canonical derived quarter as a whole filed row (D-155 review)").
Implementation commit: `b8bfbf8013a757763c089aab5dc7d2e1739a5be5`.

| Finding | Root cause | Fix / disposition | Commit | Test |
| --- | --- | --- | --- | --- |
| R5-1: 30.12/100 moat, fundamentals, technicals and composite scores | Correct grade/band annotations were compared as metric words | Fixed: check house grade and neutral-band metadata before masking it | b8bfbf80 | `matches a score with its correct house grade annotation`; wrong grade/value/metric/period/unit controls |
| R5-2: 0.75 moat and other completeness fractions | Bare dimensionless values had no explicit unit; zero-completeness explanations polluted the metric | Fixed: require declared fraction provenance; accept zero-only producer explanation | b8bfbf80 | `reads a bare dimensionless fraction only from explicit fraction provenance`; wrong fraction, multiple, period and positive-completeness/no-score controls |
| R5-3: USD -4.45M tax benefit, USD -20.65M capex, USD -9.70M and zero buybacks | Sign descriptions and legacy `(negative)` legends were treated as metric definitions | Fixed: producer-bound sign readings; retain negative values, currencies, periods and metric identity | b8bfbf80 | `matches negative tax expense described as a benefit`; `matches signed cash flow without requiring the label's sign legend`; wrong sign/inflow/amount/period/metric controls |
| R5-4: financial Piotroski score 3 on 5/9 evaluable signals | Coverage metadata became two extra independent quantities; variant label differed from prose | Fixed: read evaluated/total coverage from the exact financial-variant producer label and check both counts | b8bfbf80 | `binds Piotroski coverage counts to the producer's declared financial variant`; wrong 3, 5, 9, variant, metric and period controls |
| R5-5: P/E, P/B, capex intensity, price target, combined cash, relative strength, insider transactions/dispositions and monthly sentiment | Closed producer vocabulary, scope lists, count/index units and YYYY-MM labels lacked equivalent readings | Fixed: producer-bound aliases, retain operand order and all disposition categories; establish an index month only from its explicit record label | b8bfbf80 | `matches the cited producer's equivalent name`; `does not erase a definition in an alias`; `does not drop disposition categories from the insider total` |
| R5-6: TTM CFO and insider count key numbers | Complete printed intervals did not equal a prefixed TTM period or a duration context plus end date | Fixed: prove both ordered endpoints before normalizing; context checks remain authoritative | b8bfbf80 | `accepts only the complete ordered registered interval on a traced figure`; reversed/start/end controls |
| R5-7: net take rate 3.6% vs 4.0% and its key number | Quarter/year header was not a dated column binding; two quantities in one clause stayed ambiguous | Fixed for explicit same-row columns: validate each dated level independently, prove direction with disjoint rounding intervals, preserve numeric-only scope | b8bfbf80 | `binds a net take rate to its explicit quarter/year table column`; `establishes a decline from two independently bound columns`; `keeps comparison binding conservative`; malformed header, wrong period/metric/unit/value/direction/precision controls |
| R5-8: excerpt support trace | Numerically matched excerpt prose retained the generic `source-cited` trace | Fixed: existing `excerpt-match` trace, overall prose `unverified`, support `numeric-only` | b8bfbf80 | `logs numeric-only excerpt support distinctly from a registry match` |
| R5-9: USD 717 vs USD 11,109 production-cost benchmark; other multi-metric/range/list excerpt paraphrases | Values exist, but the verifier cannot safely resolve each metric, period, comparison role or unit with its existing clause guarantees | Not fixed by a general fallback. Quantity presence or own-description matching alone would bypass existing rejection rules | No broad fallback | `keeps an ambiguous multi-metric benchmark sentence unchecked`, correct and reversed values; existing own-description, comparison-base, bounds, source-period and multi-quantity refusal tests |

## Frozen evidence and replay

Read only the supplied audit artifacts under
`codex-focused-audit-repairs-20261101/tmp/claude-2026-11-01`:
`live/FIGR-paid.md`, `live/FIGR-paid.audit.md`, `diag/paid-payload.txt`, and
`live/app-data-paid/live.db`. SQLite connections used `readonly: true` (Python
inspection used URI `mode=ro`). No owner's database was opened; no provider or
model API was called. All Node commands used the copied isolated Node 24.11.1
wrapper, with isolated data/config directories and API-key variables removed.

Copied and ran the supplied payload diagnostic with its supplied Vitest config.
The validation-step timestamp `2026-11-02T10:55:19.774Z` reproduced the stored
payload fingerprint **`1.60.0:8a00a422`** exactly. The replay passes the complete
stored report body to the real `runVerifyPass`, omitting the report-owned
appendix so its historical audit output is not reinterpreted as fresh claims.
No report text, source value, registry record or excerpt is changed by the replay.

The stored export contains 270 log rows, including three historical `removed`
earnings-date guard rows. Replaying its already-qualified prose yields 267 rows
on both revisions; those three historical removals are not regenerated. The
counts below compare the same replay input at the integration commit and after
the repair, not an edited or hand-selected set of claims.

| Verification status | Before | After |
| --- | ---: | ---: |
| Log rows | 267 | 267 |
| `validationStatus: validated` | 108 | 149 |
| `validationStatus: unchecked` | 116 | 75 |
| `validationStatus: cited` | 42 | 42 |
| No validation status (check entry) | 1 | 1 |
| Contradicted | 0 | 0 |
| `numericSupportStatus: validated` (prose, including judgments) | 29 | 67 |
| `numericSupportStatus: unchecked` | 111 | 73 |
| `numericSupportStatus: cited` | 42 | 42 |
| No numeric support status | 85 | 85 |
| Overall outcome `verified` (figures) | 79 | 82 |
| Overall outcome `unverified` | 188 | 185 |
| Trace `computed-derived` | 60 | 84 |
| Trace `payload-match` | 48 | 62 |
| Trace `excerpt-match` | 0 | 3 |
| Trace `source-cited` | 149 | 111 |
| Trace `untraced` (includes rejected claims/check entries) | 10 | 7 |
| Numeric figure coverage | 79 / 84 | 82 / 84 |
| Factual prose numeric validations (excludes judgments) | 29 / 138 | 58 / 138 |

Recovered **41 numeric validations: 38 prose entries and three figures**.
Every previously validated entry remains validated. No previously contradicted
or rejected claim is promoted. Prose's overall outcome deliberately remains
`unverified`: numeric-only support is not certification of an entire proposition.
Citation coverage remains 137/138 factual claims and 41/44 judgments.

Replay diagnostics and receipts are gitignored in this checkout under
`tmp/claude-2026-11-01/diag`: `paid-payload.diag.test.ts`,
`vitest.diag.config.ts`, `replay.diag.test.ts`, `replay.before.json` and
`replay.after.json`. Committed regression fixtures contain the cited real records
and the exact retained FIGR release, so normal tests do not need the external DB.

## Validation and integration

Test-first receipts: `r5-record-red` (8 failures), `r5-sweep-red` (12 failures),
`r5-excerpt-red` (3 failures), `r5-header-scope-red` (1 failure),
`r5-sweep-review-red` (3 failures), and `r5-comparison-suffix-red` (1 failure).
The final targeted gate `r5-targeted-final` passed **15 files / 2,463 tests**,
including the existing verifier refusals. `r5-typecheck` passed.
These receipts are UTF-16LE logs with JSON exit-code companions in the isolated
wrapper directory. The final committed revision is checked with:

```powershell
& tmp/claude-2026-11-01/run.ps1 -Name r5-verify -NpmScript verify
```

The final handback reports that full gate's exact result; targeted results alone
are not the full verification gate. No push or PR is part of this task.

The integrator renumbers the appended `D-next (R5)` decisions and applies the
single shared batch stamp bump. No payload/report/prompt/Stage B version changed.
Payload labels and registry ids are unchanged, so no intended-deltas fixture
group or golden was edited. Display-label work can integrate separately.

## Complete unchecked-log sweep

The following inventory covers all 75 remaining unchecked replay entries and the
additional deterministic check row without a validation status. It identifies retained refusal scope, not a
claim that every sentence is false. Correct material in mixed-metric excerpts
remains a documented recall limit; it is not promoted through a number-presence
heuristic. Citation-only qualitative entries and already numeric-matched prose
were also inspected and retain their existing support scope.

| Path | Cited source | Retained scope / root cause | Claim excerpt |
| --- | --- | --- | --- |
| `balanceSheet.debtProfile.numbers[2]` | `edgar:8-K 0000950103-26-010619` | Printed-specificity guard retained; the amount is only $600 million | 600 USD millions: principal amount of 8.500% Senior Notes due 2031 [edgar:8-K 0000950103-26-010619 · 2026-07-14] |
| `balanceSheet.coverage.numbers[2]` | `edgar:10-Q notes` | Metric/period/own-description binding remains unestablished in the cited excerpt | 2.9 USD billions: contingent commitments to repurchase loans [edgar:10-Q notes · 2026-06-30] |
| `verdict.executiveSummary[0]` | `computed.valuation.pettm-current` | Typed multiple alone does not establish the accompanying common-earnings/tax narrative | On this evidence the share price looks about right, not cheap. Two things decide it. First, the 24.3x multiple of market capitalisation to trailing common earnings rests on earn... |
| `verdict.executiveSummary[7]` | `fmp:earnings-calendar` | Provider date does not establish company confirmation | Three things would move the view. A Q3 2026 report (scheduled for 2026-11-12 (FMP calendar estimate; company confirmation not established)) showing revenue tracking volume at th... |
| `business.whatTheySell[1]` | `edgar:10-K item1` | Metric/period/own-description binding remains unestablished in the cited excerpt | The 10-K states the company facilitated about USD 8.3 billion of home equity lending in FY2025, up 62% from FY2024. |
| `business.concentrationRisks[0]` | `edgar:10-Q notes` | Metric/period/own-description binding remains unestablished in the cited excerpt | In the six months ended June 30, 2026, the top five loan purchasers bought 54.4% of the unpaid principal balance of loans sold. Gain on sale of loans to them was 27.0% of total ... |
| `business.concentrationRisks[1]` | `edgar:10-K item1A` | Multi-quantity clause or missing unit; no general number-presence fallback | The 10-K states the top three loan purchasers took 57% of 2025 loan sale volume, against about 38% in 2024. |
| `business.concentrationRisks[2]` | `edgar:10-Q notes` | Metric/period/own-description binding remains unestablished in the cited excerpt | At June 30, 2026, four customers each accounted for more than 10% of trade accounts receivable; the largest was 18.9%. |
| `fundamentals.commentary[6]` | `edgar:10-K item7` | Multi-quantity clause or missing unit; no general number-presence fallback | The 10-K puts the FY2025 effective tax rate at about (18.1)%. It attributes this mainly to a discrete benefit from reassessing whether deferred tax assets can be realized after ... |
| `fundamentals.commentary[8]` | `edgar:8-K EX-99.1` | Metric/period/own-description binding remains unestablished in the cited excerpt | The Q2 2026 release reports GAAP diluted EPS of USD 0.35 and non-GAAP Adjusted EBITDA of USD 119,379 thousand at a 54.6% margin. Adjusted EBITDA is the issuer's own measure; it ... |
| `fundamentals.commentary[9]` | `edgar:10-Q item2` | Multi-quantity clause or missing unit; no general number-presence fallback | The Q2 2026 reconciliation adds back USD 4,676 thousand of acquisition-related costs and USD 842 thousand of registration costs. Their tax effects are not disclosed, so no after... |
| `fundamentals.commentary[10]` | `edgar:10-Q item2` | Metric/period/own-description binding remains unestablished in the cited excerpt | In Q2 2026, changes in servicing-asset valuation inputs added a gain of USD 8,395 thousand to GAAP revenue, against a loss a year earlier. The issuer removes these changes from ... |
| `fundamentals.commentary[11]` | `edgar:8-K EX-99.1` | Multi-quantity clause or missing unit; no general number-presence fallback | The company issued Q3 2026 guidance for Consumer Loan Marketplace volume of USD 4.8–5.2 billion, above reported Q2 2026 volume of USD 4.3 billion. This guidance covers volume on... |
| `balanceSheet.debtProfile.commentary[2]` | `edgar:10-Q item2` | Multi-quantity clause or missing unit; no general number-presence fallback | Current debt owed to related parties was USD 424,640 thousand at June 30, 2026, up from USD 166,135 thousand at December 31, 2025. |
| `balanceSheet.debtProfile.commentary[3]` | `edgar:8-K 0000950103-26-010619` | Metric/period/own-description binding remains unestablished in the cited excerpt | On July 14, 2026 the company closed USD 600 million of 8.500% Senior Notes due 2031. Interest is payable semiannually from January 31, 2027. The notes are not in the June 30 deb... |
| `balanceSheet.debtProfile.commentary[4]` | `edgar:10-Q notes` | Metric/period/own-description binding remains unestablished in the cited excerpt | The REIT Warehouse was amended to a USD 200.0 million borrowing limit with maturity extended to December 2026, making it a near-term renewal point. |
| `balanceSheet.debtProfile.commentary[5]` | `edgar:10-K item7` | Metric/period/own-description binding remains unestablished in the cited excerpt | The 10-K reported about USD 1.8 billion of available Funding Debt capacity at December 31, 2025, excluding purchase commitments from third-party loan buyers. |
| `balanceSheet.debtProfile.commentary[7]` | `computed.capital.current` | Text disclosure has mixed formulas, windows or identifier-like numbers; no scalar binding | Owner FCF, P/FCF, FCF yield, FCF conversion/growth and cash runway are not applicable: SIC 6163 and the 10-Q cash-flow statement for 2026-06-30 place held-for-sale loan originat... |
| `balanceSheet.coverage.commentary[2]` | `edgar:10-Q notes` | Multi-quantity clause or missing unit; no general number-presence fallback | At June 30, 2026 the company had contingent commitments to repurchase loans with aggregate unpaid principal of up to USD 2.9 billion, up from USD 1.8 billion at year-end. Record... |
| `balanceSheet.coverage.commentary[3]` | `edgar:10-Q notes` | Metric/period/own-description binding remains unestablished in the cited excerpt | Maximum exposure to loss from unconsolidated securitization VIEs was USD 444,766 thousand at June 30, 2026. Weighted average delinquency was 1.1%, against 0.8% at year-end. |
| `balanceSheet.coverage.commentary[5]` | `computed.capital.current` | Text disclosure has mixed formulas, windows or identifier-like numbers; no scalar binding | Capital grading basis: ttm: 2025-07-01 to 2026-06-30. Complete TTM flows are used with the corresponding current balance; annual historical series remain separately labeled. Own... |
| `balanceSheet.capexTrajectory.commentary[2]` | `manifest.compute.ttmCashFlow.capitalExpenditure` | Gap citation supports a missing-data statement, not numeric quantities | The trailing-twelve-month capex total is suppressed because capex is present in only one of the four latest quarters. |
| `balanceSheet.capitalAllocation[0]` | `edgar:10-K item1` | Metric/period/own-description binding remains unestablished in the cited excerpt | On February 25, 2026 the Board authorized repurchases of up to USD 200 million of Class A and Blockchain common stock over 12 months. |
| `quality.graded.reasoning[5]` | `payload.statements.income-statement-quarterly.2026-06-30.net-income` | Single record does not establish the attached comparison, tax cause or trailing-window assertion | Net income for the quarter ended 2026-06-30 was USD 87.45 million, above pre-tax income because of a tax benefit. |
| `quality.graded.reasoning[6]` | `payload.statements.income-statement-quarterly.2025-09-30.income-tax-expense` | Single record does not establish the attached comparison, tax cause or trailing-window assertion | Income tax expense for the quarter ended 2025-09-30 was USD -31.46 million, a benefit inside the trailing four quarters. |
| `quality.graded.reasoning[7]` | `edgar:10-Q item2` | Single record does not establish the attached comparison, tax cause or trailing-window assertion | The 10-Q reconciliation shows stock-based compensation expense of USD 26,098 thousand for Q2 2026, against USD 2,847 thousand for Q2 2025. |
| `leadership.executives[0].reasoning[1]` | `edgar:8-K EX-99.1` | Metric/period/own-description binding remains unestablished in the cited excerpt | The Q2 2026 release quotes the CEO describing 132% year-over-year Consumer Loan Marketplace volume growth and the then-pending Kiavi acquisition. |
| `leadership.executives[0].reasoning[2]` | `edgar:8-K EX-99.1` | Multi-quantity clause or missing unit; no general number-presence fallback | The Q2 2026 release issued Q3 2026 Consumer Loan Marketplace volume guidance of USD 4.8–5.2 billion. Whether the reported Q3 result lands in that range will be known from the 20... |
| `leadership.executives[0].evidence.insiderActivity[0]` | `fmp:insider-trades` | Provider text citation has no admissible numeric record or filing excerpt binding | On 2026-10-22 Tannenbaum Michael Benjamin, Chief Executive Officer, had 132,862 shares withheld in kind at USD 24.04, a tax-withholding disposition rather than an open-market sale. |
| `leadership.executives[0].evidence.insiderActivity[1]` | `edgar:10-Q item5` | Multi-quantity clause or missing unit; no general number-presence fallback | On June 11, 2026 Michael Tannenbaum, Chief Executive Officer, entered a Rule 10b5-1 plan to sell up to 60,315 Class A shares until February 18, 2027. This is plan capacity, not ... |
| `leadership.executives[0].evidence.compensation[0]` | `fmp:key-executives` | Provider text citation has no admissible numeric record or filing excerpt binding | Michael Benjamin Tannenbaum, Chief Executive Officer & Director: pay shown in the key-executives roster was USD 1.43 million; the roster does not state the fiscal year. |
| `leadership.executives[1].evidence.insiderActivity[0]` | `fmp:insider-trades` | Provider text citation has no admissible numeric record or filing excerpt binding | On 2026-08-24 Kgil Minchung, Chief Financial Officer, sold 7,500 shares at USD 38.64 per share. |
| `leadership.executives[1].evidence.insiderActivity[1]` | `fmp:insider-trades` | Provider text citation has no admissible numeric record or filing excerpt binding | On 2026-09-11 Kgil Minchung, Chief Financial Officer, exercised 20,746 options at USD 4.82 per share. |
| `leadership.executives[1].evidence.compensation[0]` | `fmp:key-executives` | Provider text citation has no admissible numeric record or filing excerpt binding | Minchung Kgil, Chief Financial Officer: pay shown in the key-executives roster was USD 0.99 million; the roster does not state the fiscal year. |
| `leadership.insiderSummary[3]` | `payload.insiders.insider-shares-acquired-all-reported-acquisitions-incl-awards-option-exercises-and-gifts-received-four-calendar-quarters-ended-2026-09-30` | Relative same-period scope and acquisition categories not anchored by this record alone | Insiders acquired 764,604 shares in the same period, including awards, option exercises and gifts received. |
| `leadership.governanceNotes[1]` | `edgar:10-K item7` | Multi-quantity clause or missing unit; no general number-presence fallback | At the IPO, 39,393,047 Class A shares held by the Controlling Party and permitted transferees converted into Class B common stock. In our judgment this concentrates voting contr... |
| `leadership.governanceNotes[2]` | `edgar:10-Q item2` | Multi-quantity clause or missing unit; no general number-presence fallback | Current debt owed to related parties was USD 424,640 thousand at June 30, 2026, up from USD 166,135 thousand at December 31, 2025. The counterparties are not named in the retain... |
| `leadership.governanceNotes[3]` | `edgar:10-Q item5` | Multi-quantity clause or missing unit; no general number-presence fallback | On June 16, 2026 Horsley Capital Partners LLC, beneficially owned by director Adam Boyden, entered a Rule 10b5-1 plan to sell up to 57,780 Class A shares until September 13, 2027. |
| `leadership.governanceNotes[4]` | `fmp:key-executives` | Named-person/title restriction retained; no numeric exemption | The key-executives roster also lists Michael Scott Cagney as Co-Founder & Executive Chairman, Clare Hove as Chief Operating Officer, Arvind Mohan as Chief Business Officer, Bria... |
| `competitive.moatAssessment[0].reasoning[0]` | `edgar:10-K item1` | Multi-quantity clause or missing unit; no general number-presence fallback | The 10-K states the average production cost per loan was about USD 717 for FY2025, against an MBA mortgage industry average of USD 11,109 as of September 30, 2025. |
| `competitive.moatAssessment[0].reasoning[1]` | `edgar:8-K EX-99.1` | Multi-quantity clause or missing unit; no general number-presence fallback | The Q2 2026 release states operations and processing costs fell to about 67 basis points of Consumer Loan Marketplace volume, from 79 basis points in Q2 2025. |
| `competitive.moatAssessment[1].reasoning[0]` | `edgar:10-K item1` | Multi-quantity clause or missing unit; no general number-presence fallback | The 10-K states that about USD 3.9 billion of HELOC volume was transacted on Figure Connect by third parties, with 48 marketplace participants onboarded by December 31, 2025. |
| `competitive.moatAssessment[1].reasoning[1]` | `edgar:8-K EX-99.1` | Metric/period/own-description binding remains unestablished in the cited excerpt | The Q2 2026 release states Figure Connect reached 65% of Consumer Loan Marketplace volume and that the company added 102 origination partners, reaching 489 active partners. |
| `competitive.moatAssessment[1].reasoning[2]` | `edgar:10-Q notes` | Metric/period/own-description binding remains unestablished in the cited excerpt | In the six months ended June 30, 2026 the top five loan purchasers bought 54.4% of the unpaid principal balance of loans sold. In our judgment the buyer side of the marketplace ... |
| `competitive.moatAssessment[2].reasoning[0]` | `edgar:10-K item1` | Multi-quantity clause or missing unit; no general number-presence fallback | The 10-K states that 87% of loans originated through its loan origination system in FY2025 used the proprietary DART platform, against 2% in FY2024. |
| `catalystsRisks.catalysts[0].reasoning` | `fmp:earnings-calendar` | Provider date does not establish company confirmation | The provider earnings calendar schedules the Q3 2026 report for 2026-11-12 (FMP calendar estimate; company confirmation not established), and a company newswire release of 2026-... |
| `catalystsRisks.catalysts[1].reasoning` | `edgar:8-K 0001493152-26-040931` | Metric/period/own-description binding remains unestablished in the cited excerpt | On September 1, 2026 the company completed its acquisition of Kiavi, Inc., funded primarily from the net proceeds of its USD 600 million 8.500% Senior Notes due 2031. Kiavi's re... |
| `catalystsRisks.catalysts[2].reasoning` | `edgar:10-Q notes` | Several source values, periods or columns remain possible | In August 2025 the company amended the REIT Warehouse to a USD 200.0 million borrowing limit and extended its maturity to December 2026, making it a near-term funding renewal po... |
| `catalystsRisks.catalysts[3].reasoning` | `edgar:8-K 0000950103-26-010619` | Metric/period/own-description binding remains unestablished in the cited excerpt | The notes accrue interest at 8.500% a year, payable semiannually on January 31 and July 31, beginning January 31, 2027. |
| `catalystsRisks.catalysts[4].reasoning` | `edgar:10-K item1` | Metric/period/own-description binding remains unestablished in the cited excerpt | On February 25, 2026 the Board authorized repurchases of up to USD 200 million of Class A and Blockchain common stock over the next 12 months, subject to market conditions. Reco... |
| `catalystsRisks.catalysts[5].reasoning` | `edgar:10-Q item5` | Multi-quantity clause or missing unit; no general number-presence fallback | On June 11, 2026 the CEO entered a Rule 10b5-1 plan covering the sale of up to 60,315 Class A shares until February 18, 2027. This is plan capacity, not executed sales. |
| `catalystsRisks.risks[0].reasoning` | `edgar:10-K item7` | Multi-quantity clause or missing unit; no general number-presence fallback | The 10-K attributes the FY2025 effective tax rate of about (18.1)% mainly to a discrete benefit from reassessing deferred tax asset realizability after the Recombination, and a ... |
| `catalystsRisks.risks[1].reasoning` | `edgar:10-Q notes` | Metric/period/own-description binding remains unestablished in the cited excerpt | In the six months ended June 30, 2026, the top five loan purchasers bought 54.4% of the unpaid principal balance of loans sold, and gain on sale of loans to them was 27.0% of to... |
| `catalystsRisks.risks[2].reasoning` | `edgar:8-K EX-99.1` | Multi-quantity clause or missing unit; no general number-presence fallback | Net take rate fell to 3.6% in Q2 2026 from 4.0% in Q2 2025, while Figure Connect reached 65% of Consumer Loan Marketplace volume. In our judgment, an observed decline does not b... |
| `catalystsRisks.risks[3].reasoning` | `edgar:10-Q notes` | Multi-quantity clause or missing unit; no general number-presence fallback | At June 30, 2026 the company had contingent commitments to repurchase loans with aggregate unpaid principal of up to USD 2.9 billion, up from USD 1.8 billion at December 31, 202... |
| `catalystsRisks.risks[4].reasoning` | `edgar:8-K 0000950103-26-010619` | Metric/period/own-description binding remains unestablished in the cited excerpt | On July 14, 2026 the company closed USD 600 million of 8.500% Senior Notes due 2031, adding fixed-rate corporate debt on top of warehouse funding. In our judgment, how much stra... |
| `catalystsRisks.risks[5].reasoning` | `edgar:10-Q notes` | Metric/period/own-description binding remains unestablished in the cited excerpt | At June 30, 2026 maximum exposure to loss from unconsolidated securitization VIEs was USD 444,766 thousand, and weighted average delinquency was 1.1% against 0.8% at December 31... |
| `catalystsRisks.risks[7].reasoning` | `edgar:10-K item1A` | Metric/period/own-description binding remains unestablished in the cited excerpt | The 10-K lists dependence on digital-asset trading activity, volumes and prices among factors that can make results fluctuate. The 10-K also states that YLDS generated USD 1.1 m... |
| `outlook.segmentTrajectories[7]` | `fmp:news` | Provider text citation has no admissible numeric record or filing excerpt binding | The company reported that its small business financing vertical funded USD 135 million in the third quarter of 2026. That is volume, not revenue. |
| `outlook.tam[0]` | `edgar:10-K item1` | Metric/period/own-description binding remains unestablished in the cited excerpt | The 10-K describes the company's addressable markets as the approximately USD 2 trillion consumer credit market and the approximately USD 3 trillion cryptocurrency and digital a... |
| `outlook.tam[1]` | `edgar:10-K item1` | Metric/period/own-description binding remains unestablished in the cited excerpt | The 10-K cites third-party RWA.xyz data putting its share of tokenized private credit at approximately 75% as of December 31, 2025. |
| `outlook.estimateRevisionTrend[0]` | `payload.estimates.est-revenue-2026-12-31` | Consensus wording plus no issuer FY basis; forecast end date alone is insufficient | Provider consensus revenue for FY2026 is USD 886.33 million. |
| `outlook.estimateRevisionTrend[1]` | `payload.estimates.est-revenue-2027-12-31` | Consensus wording plus no issuer FY basis; forecast end date alone is insufficient | Provider consensus revenue for FY2027 is USD 1.17 billion. |
| `outlook.estimateRevisionTrend[2]` | `payload.estimates.est-revenue-2028-12-31` | Consensus wording plus no issuer FY basis; forecast end date alone is insufficient | Provider consensus revenue for FY2028 is USD 1.40 billion. |
| `outlook.estimateRevisionTrend[3]` | `edgar:10-Q item2` | Metric/period/own-description binding remains unestablished in the cited excerpt | Net revenue for the six months ended June 30, 2026 was USD 392,595 thousand. |
| `outlook.guidanceCredibility[0]` | `edgar:8-K EX-99.1` | Multi-quantity clause or missing unit; no general number-presence fallback | The Q2 2026 earnings release issued third-quarter 2026 guidance for Consumer Loan Marketplace volume of USD 4.8 billion to USD 5.2 billion. This is the company's projection, not... |
| `outlook.guidanceCredibility[1]` | `edgar:10-Q item2` | Metric/period/own-description binding remains unestablished in the cited excerpt | Consumer Loan Marketplace volume for the three months ended June 30, 2026 was USD 4,258,796 thousand. |
| `outlook.scenarioNarratives.y3[0]` | `edgar:10-K item1` | Qualitative horizon or number word; no numeric proposition inferred | On a three-year view the question is whether Figure Connect and the partner network keep growing fee revenue faster than the take rate falls, and whether the loan-buyer base div... |
| `outlook.scenarioNarratives.y3[1]` | `edgar:8-K 0000950103-26-010619` | Metric/period/own-description binding remains unestablished in the cited excerpt | Before July 31, 2028 the company may redeem up to 40% of the notes with proceeds from certain equity offerings. That is an optional path to reduce the 8.5% debt. |
| `outlook.scenarioNarratives.y5[0]` | `edgar:10-K item1A` | Qualitative horizon or number word; no numeric proposition inferred | On a five-year view, the senior notes mature in 2031. The company remains an emerging growth company until at most the end of the fiscal year after the fifth anniversary of its ... |
| `outlook.scenarioNarratives.y5[1]` | `computed.deterministic-aspect-scores.moat-score` | Qualitative horizon or number word; no numeric proposition inferred | In our judgment the long-run case depends on the blockchain-based marketplace becoming durable industry infrastructure. The current evidence shows rapid growth but not yet stabl... |
| `macro.sensitivityNotes[0]` | `edgar:10-K item7` | Metric/period/own-description binding remains unestablished in the cited excerpt | The 10-K attributes part of the FY2025 decline in interest expense to a USD 5.9 million decrease from lower average SOFR rates on warehouse facilities. |
| `macro.sensitivityNotes[1]` | `edgar:10-Q notes` | Multi-quantity clause or missing unit; no general number-presence fallback | The REIT Warehouse bears interest at SOFR plus a spread of 3.00% or 3.50%, depending on outstanding balances. |
| `macro.sensitivityNotes[3]` | `edgar:10-K item1A` | Qualitative horizon or number word; no numeric proposition inferred | In our judgment the company is exposed to rates in two ways: through warehouse funding costs and through HELOC demand and loan-sale pricing. Interest-rate sensitivity is not qua... |
| `macro.sensitivityNotes[4]` | `edgar:10-Q notes` | Metric/period/own-description binding remains unestablished in the cited excerpt | At June 30, 2026 the company held Treasury note futures with a notional amount of USD 790,000 thousand recorded as a liability, consistent with hedging the loan pipeline against... |
| `leadership.governanceNotes[4]` (check: named-individual) | `fmp:key-executives` | Named-person/title restriction retained; no numeric exemption | The key-executives roster also lists Michael Scott Cagney as Co-Founder & Executive Chairman, Clare Hove as Chief Operating Officer, Arvind Mohan as Chief Business Officer, Bria... |
