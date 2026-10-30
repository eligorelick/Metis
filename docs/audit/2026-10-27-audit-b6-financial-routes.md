# B6: financial-route currency, routing and grading

Base: `222f92a082aa63e254783291ca21ee299a5dad9b`, current main when this worktree started, including B4a (PR #76). Scope: the 26 B6 findings, including FIN-503/504/505 from round 4 and FIN-506 moved from B5. Decision: D-136 in [DECISIONS](DECISIONS.md). The [implementation plan](../superpowers/plans/2026-10-27-audit-fix-06-financial-routes-currency-and-grading.md) is retained as planning history; the execution rulings here and in spec 4.7 record where its stale controls or later owner instructions change the outcome.

This change made no model calls and no paid provider calls. Saved bundles, checked-in SEC fixtures and synthetic inputs were replayed with empty process-only profiles, a dead proxy and a database guard. Original reports and snapshots were only read; their hashes are retained in the private evidence ledger. No live application or database was used. Public academic-source verification and repository infrastructure are separate from financial/provider testing.

Report 1.51.0, payload 1.53.0, Stage B ACCOUNTING_EVIDENCE_32 and SCORE_BANDS_2026_10_FINANCIAL_ROUTE_EVIDENCE are the next stamps after the starting main. B5a and B6 were built in parallel, so one must be renumbered at merge. B6 imports no B5 runtime changes. Neither PR is authorized to merge in this session.

## Disposition

Test names below are under `tests/`. Every behavior change has an observed failing regression before its implementation. Preserved controls also run on main by design.

| Finding | Disposition and task | Commit | Regression evidence |
|---|---|---|---|
| FIN-107 | Minor-unit quote comparisons refused; main WACC compatibility retained (1) | `58d04413` | `stageB.priceCurrency.minorUnit.audit20261027.test.ts` |
| FIN-105 | Financial P/TBV and premium require matching known currency; legacy display guard (2) | `448dcf06` | `stageB.ptbvCurrency.audit20261027.test.ts` |
| FIN-105-V1 | Dividend yield uses the price's own currency evidence (3) | `c07a3729` | `report.keyDataDividendCurrency.audit20261027.test.ts` |
| FIN-106 | Pairing date follows its tangible-book balance (4) | `01d0bb6b` | `stageB.routeMetricDates.audit20261027.test.ts` |
| FIN-310 | ROTE date/source follows the paired trailing or annual return (4) | `01d0bb6b` | Same date tests; insurer forward return pinned |
| FIN-309 | **Skipped:** Task 5 waits for B4b; no date-roll rewrite | None | Existing date factor preserved by Task 5A controls |
| FIN-506 | Fixed here, Task 5A; B5 Task 22 was struck. Reverse solve matches forward price/share/date mapping | `82388167` | `stageB.excessReturnReverseShareBasis.audit20261027.test.ts`, `report.legacyImpliedReturnShareBasis.test.ts` |
| FIN-112 | TTM capital EBIT uses complete operating income only (6) | `52e60c00`, `ae53d949` | `stageB.currentCapital.test.ts` |
| FIN-117 | Partial fiscal-window buyback proxies excluded (7) | `95ead6c4` | `stageB.buybackWindowCoverage.audit20261027.test.ts`, existing D-61/capital controls |
| FIN-122 | Whole-row annual restatement collapse for financial metrics and capital (8) | `be08da67` | `stageB.financialMetricsRestatement.audit20261027.test.ts` |
| FIN-120 | Bank forensic disclosures name actual capital/credit/funding grading (9) | `5dd098af` | `stageB.bankDisclosure.audit20261027.test.ts` |
| FIN-313 | Truthful ADR ratio and gross-dividend notes; dead static table removed (10) | `bc36d886` | `stageB.adrDisclosure.audit20261027.test.ts` |
| FIN-121 | FIN-OTHER negative OCF alone no longer means unprofitable; unsupported newly eligible DCF stays withheld (11) | `d889c1a3` | `stageB.finOtherOverlay.audit20261027.test.ts`, sector controls |
| FIN-124 | Unresolved eligibility withholds Altman without misclassifying the business (12) | `d7095598` | `stageB.unresolvedEligibilityForensics.audit20261027.test.ts` |
| FIN-123 | Unresolved valuation is applicable missing evidence (13) | `9709e823` | `stageB.ineligibleValuationGrade.audit20261027.test.ts` |
| FIN-306 | **Deferred:** plan's required grade-transition control contradicts the proposed Piotroski denominator (14) | `694c1558` | Existing grading checks unchanged; independent contradiction analysis retained |
| FIN-308 | **Deferred:** protected O/NNN controls are actually undetermined; preserve their figures (15) | `f42683ea` | Two numeric pins in `audit.issuerPipeline.test.ts` fail under the rejected change and pass with main behavior |
| FIN-307 | **Partial:** Altman scope refusal/book-equity alternative implemented; ADR WACC/DCF retained with warning (16) | `ac8972da` | `stageB.adrMarketEquityScope.audit20261027.test.ts`, `audit.dcfOwnership.test.ts` |
| FIN-312 | **Skipped:** Task 17 is an R1a tombstone, including its proposed stored-label change | None | Existing Altman period labels retained in replay |
| FIN-126 | Peer P/B uses admitted common equity; existing positive reported-equity gate retained (18) | `61ba514d` | `pipeline.peers.test.ts`, synthetic common-equity helper |
| FIN-125 | SEC-refined subject/profile-only peer mismatch described as unconfirmed (19) | `b830b258` | `pipeline.peers.test.ts`, including stronger pre-existing refusal |
| FIN-110 | Refused annual revenue masked from dependent forensic/projection/margin consumers (20) | `269d0649` | `audit.scoringEligibility.test.ts` |
| RPT-101 | Classic/dossier business summary obeys the existing 50% evidence floor (21) | `7e8bd3c8` | `report.assessment.test.ts`, including unrounded boundary and legacy controls |
| FIN-504 | Company peer figure and resolved size screen use issuer-common scope (22) | `71d1f5f0` | `pipeline.peers.test.ts`, payload reason assertion |
| FIN-503 | Shared greater-than-25% gain test on both earnings-comparison sides (23) | `aeb42fc4` | `pipeline.peers.test.ts`, including missing operand, exact threshold and combined refusal |
| FIN-505 | Rank P/E on its selected history's construction; displayed P/E unchanged (24) | `bfd5858a` | `stageB.peRankConstruction.audit20261027.test.ts`, scoring fallback tests |

Task 6 is the one commit-count exception: a TypeScript optional-list error was not inspected before its first commit. A separate corrective test commit asserts the list exists, preserves every assertion, and passes typecheck; no history was rewritten. The inaccurate intermediate ledger claim was corrected. All subsequent checks were inspected before committing.

## Owner decisions and execution judgments

The full rationale and source names are in D-136. These are the adopted choices and deviations:

1. **OD-1:** refuse minor units instead of inventing a scale; retain existing WACC/DCF compatibility where necessary.
2. **OD-2:** seven-day start tolerance, not a claim of complete daily trading coverage; do not fetch another year.
3. **OD-3:** Financial Services sector-wide OCF exemption, including fee-based firms; keep prior withholding and publication state when a newly eligible DCF lacks inputs.
4. **OD-4:** unresolved eligibility adds the missing valuation weight to the evidence denominator.
5. **OD-5:** defer FIN-306. The plan's permitted timing-only control cannot reach the required B score even at its maximum; independent Astra review confirmed this. Do not change weights, band cutoffs or the existing assertion.
6. **OD-6:** use calibrated Z-prime for structural market-equity refusal, but preserve an available ADR WACC/DCF with disclosure. Selected-capitalization evidence takes precedence; actual class and currency guards stay. The verified Altman source's 1.23/2.90 boundaries remain, despite its separate 1.21 footer. A short quotation replaces the requested long excerpts.
7. **OD-7:** defer FIN-308 because saved O/NNN are undetermined, contrary to the plan's description. Add pins; no ticker special case or speculative PP&E routing.
8. **OD-8:** relabel the actual annual/trailing pairing; do not change the insurer's independent forward model.
9. **OD-9:** mask the enumerated annual revenue consumers, including the confirmed margins; preserve independent capital/financial metrics and quarterly inputs.
10. **OD-10:** correct route wording and retain stronger earlier exclusions; no SEC peer expansion.
11. **OD-11:** skip Task 5 for B4b. Task 5A follows B4a's actual divisor and existing date factor, without changing the numerator or roll.
12. **OD-12:** retain statement-only justified value, unknown-currency refusal, strict TTM operating income, whole-row normalization, zero for undisclosed peer preferred, and the existing peer admission gate. Remove the unused ADR table. Apply the confirmed dossier floor but retain the deferred Piotroski denominator; skip the Task 17 legacy change.
13. **OD-13:** exclude gain-carried earnings comparisons; retain the stricter existing peer P/E construction gate and four-peer minimum. No item-level one-off adjustment is inferred.
14. **OD-14:** match the ranked construction while preserving B-20 display and B4a ownership guards. Stale planned movements are not imposed on MU #46 or NVDA #48's absent peer median.
15. **OD-15:** keep peer context beside a withheld Company cell; class-sum sizing only when resolved. This is a B-8 house convention.

FIN-506's display helper is separate from B5a's unmerged legacy helper. Its 1.51 cutoff and the frozen 1.50 equity-bridge cutoff are tested; B5a/B6 cutoff integration must be done at merge. The current golden has its own exact-byte pins, then an explicit counted restoration preserves all previous golden checks. Empty temporary profiles, dead proxies and guarded replay folders are used identically on main and the branch and deleted afterward. Test temporary folders live outside the repository to keep release-file checks meaningful.

The three reviewer extensions were confirmed in spec 4.3 on 2026-10-28: Task 20's margins and Task 21's dossier floor are implemented; Task 17's proposed stored Altman label rule is superseded by its R1a tombstone. No self-review substitutes for the required fresh reviewer.

## Saved-input replay

Each task's before/after output and full leaf attribution are retained outside the release tree. The corpus comprises 52 saved inputs (45 census, five keyed snapshots and two retained AMZN inputs), 44 route/currency/eligibility/keyless controls, 25 peer cases, six rank cases, and the NVDA #50 control plus a synthetic two-class sentence injected only in memory. The artificial scope case is not evidence that NVDA actually has those classes.

| Input / filed or synthetic operands | Before → after | Owning task and invariant |
|---|---|---|
| BAC census: $50.78 quote; $355.092B cap; 7.2942B diluted shares | Implied starting return 15.9021% → 17.2058%; composite 58.65 → 58.28 | 5A. Forward value $45.79235 unchanged; invert its diluted-share basis |
| PGR census: $221.35 quote; $128.687B cap; 584.2M diluted shares | Implied return 25.8997% → 26.0535%; composite 73.14 → 73.09 | 5A. Forward value $293.46743 unchanged |
| PGR checked-in keyless control | Implied return 29.9866% → 30.1404%; composite 72.32 → 72.24 | 5A. Forward value $254.78148 unchanged |
| Synthetic bank / insurer at model price, cap inflated 3% | Implied return 41.5149% → 40.4749% / 37.1716% → 36.1682% | 5A. Inflated-cap and control solves agree on price/diluted shares |
| HD census: $14.809B FY2022 repurchases, partial history | Timing 8.3427% → 1.0431%; coverage 100% → 50.8088%; leadership 67.80 → 59.34; composite 58.05 → 57.20 | 7. Exclude the partial fiscal-year proxy, retain filed spending |
| ORCL census: $16.248B FY2022 repurchases, partial history | Timing −3.4580% → unavailable; coverage 100% → 16.4412%; leadership 51.09 → 62.35; composite 47.82 → 48.27 | 7. Evidence floor, without a guessed full-year price |
| MU #46: $2.432B FY2022 repurchases | Average-paid proxy $86.3631 → $119.9468; price appreciation 916.1168% → 631.6161% | 7. Oldest year unpriced; composite 77.91 unchanged. Existing P/E construction/rank stays (24 control) |
| FCX keyless: $488M FY2021 repurchases | Proxy $50.1416 → $51.1444; appreciation 39.1061% → 36.3785% | 7. Composite 55.98 unchanged. SNOW's first repurchase year is covered and stays unchanged |
| Synthetic CAD statements / USD quote | Bank P/TBV 23.8095× and premium 17.4802× → unavailable; insurer 25× /19.1944× → unavailable | 2. Justified P/TBV and ROTE unchanged; 3 separately pins dividend currency |
| Synthetic pence versus pounds quote | P/E 5555.5556× → unavailable; major-unit control 55.5556× unchanged | 1. Levered WACC 8.345631% / DCF $29.556383 and unlevered DCF $33.071586 preserved |
| Synthetic insurer pairing | Date 2026-03-31 → 2025-12-31; 25× unchanged | 4. Annual ROTE pairing date; forward trailing model unchanged |
| Synthetic FIN-OTHER: $150M annual/$180M trailing income, −$220M OCF, $1.2B trailing revenue | Complete-input DCF unavailable → $34.594807; composite 63.76 → 55.91 | 11. Operating cash flow no longer declares a profitable financial issuer unprofitable; Piotroski evidence changes with overlay removal |
| FIN-OTHER missing operating income / currency proof / beta | DCF stays unavailable; composites 51.33 → 51.02 /63.76 → 61.15 /60.87 → 58.79 | 11. Prior publication state retained; missing-beta control was already Blocked |
| Unresolved hardware/credit control: industrial model conflicts with deposit/loan evidence | Altman 5.4895 safe → unavailable; evidence 34.3816% → 30.7146%; composite 55.08 → 54.53 | 12/13. Used evidence weight unchanged; valuation stays withheld |
| Synthetic ADR: $2B assets, $200M working capital, $300M retained earnings, $200M EBIT, $500M book equity, $1.5B liabilities, $1B revenue | Original Z 5.1595 safe → Z-prime 1.14845 distress; composite 63.79 → 62.39 | 16. Available WACC 8.066019% and DCF stay unchanged; scope warning added |
| Synthetic class-ambiguous manufacturer | Altman unavailable → Z-prime 1.14845; composite 60.58 → 60.19 | 16. Already Blocked with two critical gaps; existing class WACC refusal retained |
| Peer banks: $80B cap, $60B reported equity, $6B preferred | P/B median 1.333333× → 1.481481×; explicit $48B common-equity control → 1.666667× | 18. Positive reported-equity admission retained; other peer metrics unchanged |
| Synthetic refused annual revenues $700M/$800M/$900M/$1B, latest income $150M and OCF $220M | Beneish −2.544654 and SGI 1.111111 → unavailable; Piotroski 3/5 → 3/4; composite 58.92 → 58.12 | 20. Refused margin/dispersion/projection inputs removed; independent figures and report state unchanged |
| Low business-evidence controls | 36.0%, 42.6% and 35.2% summaries lose the letter; unrounded share added | 21. No existing number or stored band changes; exact 50% boundary tested |
| Synthetic class sum: (2B +0.4B) shares × $50, $6B common income | Company ratio 13.333333× → 20×, or unavailable if unresolved | 22. Resolved $120B cap drives size screen; already-trimmed small peer leaves without changing medians |
| NVDA #49/#50: MRVL trailing pre-tax $3.0586B, operating $1.5787B (48.4% non-operating) | Peer median 59.309639× over four → unavailable over three | 23. Company 26.988941×, P/B, P/TBV and all grades unchanged. #48 lacks this starting median and is preserved |
| AMZN retained #51: 46.4% non-operating share | Peer Company 20.299909× → unavailable | 23. Other valuation and grades unchanged |
| Synthetic five-peer control, $2B pre-tax/$1B operating for one peer | Median 20× over five → 17.5× over four; four-peer version → unavailable | 23. Balance-sheet peers remain; exactly 25% and missing-operand controls stay |
| NNN / PLD census P/E histories | Rank 25.0696 → 37.1241 /35.2581 → 34.8242 | 24. Displayed P/E 19.6715× /32.1411× and all scores unchanged |
| NVDA #48/#49/#50: $5.2056T cap and filed common income | Rank 1.685258 → 1.483758; ranked operand 26.988941× | 24. Displayed P/E 27.307206× and all scores unchanged |
| AMZN #43 /retained #51/#52 | Rank 2.723180 → 2.485863 /1.417176 → 1.248152 | 24. Displayed P/E and already gain-excluded valuation signal unchanged |
| Synthetic dilution control | Rank 60.5263 → 50; displayed P/E 26× unchanged | 24. Common-income operand 25× equals history median; missing common income withholds rank |
| NVDA #50 with an artificial two-class sentence | Company 26.988941× → unavailable; Altman unavailable → Z-prime 5.431377; composite 69.06 → 70.01 | 22/16. Peer median equals same-head uninjected control; critical class/WACC gaps already exist on main |
| O /NNN checked-in keyless controls | Composite 44.20 /50.73 and Beneish −2.596363 /−2.558958 unchanged | 15 deferred. Their actual undetermined routes cannot satisfy the proposed hold and preservation simultaneously |
| DEMO audited fixture | Ten records reclassified; no existing numeric value changes | 18/19/21/22/23/25. Only peer wording, optional evidence share and stamps; no Task 5/17 delta or methodology index shift |

Task comparisons were made on their own commits, not inferred from a final score alone. In particular Task 5A's forward values do not move; Task 7's downstream scoring is distinguished from Task 13's missing-evidence denominator and Task 16's forensic model choice. The synthetic class injection was also replayed across the intervening task commits.

## Stored reports

The read-only corpus contains 51 numbered audit files (1–52, without 4) plus two separately retained AMZN reports named retained51/retained52 here to avoid confusing them with audit DEMO #51 and NVDA #52. Parsing yields 41 strict and 12 legacy views. All 53 source hashes and serialized originals stay unchanged. Key data, assessment lines, route-metric views, score-driver tables and peer review views are compared before/after.

- JPM #21 alone receives the FIN-506 convention note; it retains its 1.1.0 stamp, recorded 22.63pp driver and grade. The two currency display rules affect no stored report.
- Structured `routeMetrics` occurs only on SCHW #40/#41, as the plan found. The bank-related “capital adequacy not computed” wording also occurs in JPM #21, which the plan's string count omitted; SCHW #39 carries an older route-evidence conflict. Issuer route membership cannot be reconstructed solely from a structured field absent on the other reports.
- No recorded `reitSubmap`, unresolved-eligibility label, ADR-ratio-map or `eps_local` label, financial-route currency-refusal field, or “valuation route differs” string is present. No stored structured record establishes an affected insurer/mortgage-REIT, ADR overlay or negative-OCF FIN-OTHER case; absence of those records is not a claim about every issuer's economic business model.
- MU #46's partly covered oldest buyback window is demonstrated by its saved input; the stored report is not recomputed. Stored NVDA #47/#49/#50/#52 retain the 59.31× peer median and four-peer count. There is no retained evidence sufficient to repair such a median at display time.
- “Market cap unavailable” occurs on audit #44–52 and the two retained AMZN reports. Task 17 is skipped, so these historical labels remain unchanged here. The earlier plan expected nine files before the two retained reports were included.
- Stored own-history ranks and grades remain as recorded, including AMZN #43's pre-D-98 grade, MU #46, NVDA #47–50/#52, and SCHW #39–41's rank without a recorded construction. The main replay's current D-98 fallback does not retroactively change the stored AMZN grade.
- No stored comparison row requires the new class-scope Company refusal. META #44/#45 have unresolved scope but no comparison row. Existing rows without `currentWithheldReason` render as before.

## Verification and remaining work

The local progress ledger records each RED/GREEN run, isolation, ruling, commit and replay attribution. Stamps are pinned in `report.versionStamps.test.ts`. The full Stage C file passes 232 tests; the new current-byte golden is `1.53.0:deaeac72` with 145,245 prompt bytes, 530 numeric records and 77 citations. Its explicitly restored predecessor remains `1.52.0:4257f13c`, and all older hashes remain asserted. Audit deltas were first run dry, traced recursively to their owning tasks, then written under `audit-b6-financial-routes-20261027`; the fixture/release checks pass. Final exact-head replay, the unchanged nine-gate script and the fresh independent review are required before push; their results are recorded in the PR and ledger rather than inferred from these targeted runs.

Left for later: FIN-306, FIN-308, Task 5/FIN-309 pending B4b, Task 17/FIN-312, the ADR WACC-refusal portion of FIN-307, and unsupported newly eligible financial DCFs. Also deferred are longer buyback history, calibrated PP&E evidence for specialty REITs, SEC evidence for peer routing, actual stub-dividend treatment, full peer P/TBV explicit-common/NCI alignment, tax-adjusted item-level peer gains, and a price/diluted-EPS own-history series once fourth-quarter EPS is supported. B5a/B6 stamp and legacy-note integration is a merge responsibility. Live provider/model testing is outside this batch and remains for Claude after merge.
