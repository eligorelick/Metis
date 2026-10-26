# Audit batch 3: stop withholding where the filed evidence is complete (2026-10-26)

Base: `2f0772c` (`audit/batch2b-valuation-mediums`, pull request #53, which waits for the owner; this batch is stacked on it). Scope: batch 3 of the independent audit of 2026-10-22, the findings where a figure was withheld although the filed evidence establishes it: B-7, B-35, B-32, B-8, B-37, C-15, C-1, B-5, B-39, B-34 with B-43, A-11, C-13, E-6 and E-8. Batch 3a (D-103) already fixed B-32, B-5, A-11, the D&A composition of B-7, B-8 and the batch 1 carry-over; this batch fixes the rest and the parts 3a left. Decision: D-105 in [DECISIONS](DECISIONS.md); report 1.40.0, payload 1.45.0 and Stage B ACCOUNTING_EVIDENCE_22, the stamps after batch 2b's. The audit evidence folders stay out of the repository.

This change made no model calls and no paid provider calls. The only provider traffic was the keyless, data-only control panel below, served from the run cache behind a dead proxy. No fixture file was added; the new tests build their inputs inline from the tags and figures of public SEC filings.

## Disposition

| Finding | Disposition | Commit | Tests |
|---|---|---|---|
| B-7 EBITDA unavailable when D&A is tagged as `Depreciation` plus `AmortizationOfIntangibleAssets` | D&A composition fixed by batch 3a. This batch carries 3a's lower-bound caveat onto the EV/EBITDA row and its Key data line, naming the composed periods; the own-history rank stays, because the history uses the same D&A. | `72d1673` | `tests/edgar.statements.test.ts`, `tests/report.multipleBasis.test.ts`, `tests/stageB.valuation.test.ts` |
| B-35 Diluted weighted shares map only to `WeightedAverageNumberOfDilutedSharesOutstanding` | Fixed. The combined basic-and-diluted share and EPS elements are read for both bases, and the basic weighted count stands in for an untagged diluted count when the filer's basic and diluted EPS are equal for the same interval, disclosed per period (in a loss from continuing operations, as antidilution). | `2d0a08d`, `74158a4` | `tests/edgar.statements.test.ts` |
| B-32 WACC and DCF withheld with no TTM tax rate | Fixed by batch 3a (annual or zero-shield rate); nothing left for this batch. | (3a) | (3a) |
| B-8 Unresolved multi-class scope withholds market cap, P/E, EV/EBITDA and P/B | Fixed by batch 3a. This batch adds the report's one-class caveat to the AI context's quote section, which stated the figure bare, so every surface is consistent. | `e99c101` | `tests/stageB.economicShareScope.test.ts` |
| B-37 `dilutedShareSecurityBasis` has no producer | Fixed for multi-class issuers: the filed diluted count is marked issuer-economic when the class scope is resolved and the same row's basic count matches the all-class economic total on one class's unit basis (within 3% and within half the smallest class's share) at a row ending within 120 days of the class inventory; otherwise the warning names the failed test. ADRs are skipped: their per-share bridge needs a depositary ratio and dated security evidence that no data path supplies. | `2ea9008` | `tests/stageB.issuerEconomicDilutedShares.audit20261022.test.ts` |
| C-15 The quarterly NCI gate withholds the DCF and every EV and book multiple although the filing discloses NCI | Fixed. The fetched 10-Q or 10-K primary document is read for the NCI column on `StatementEquityComponentsAxis`, admitted only when the filing's undimensioned consolidated total ties to the row; the critical DCF gap names the ownership gate. A self-closing nil fact is read as no value. | `2a01af7`, `013f1f7`, `4d9db5d` | `tests/edgar.equityStatementNci.audit20261022.test.ts` |
| C-1 WACC and DCF lost to "average total debt missing", the gap naming no cause | Fixed (owner decision). A lease-scope refusal on the newest balance outside the averaged pair withholds only the debt weight, which uses the clean average; a refusal on the TTM pair falls back to the fiscal-year-end pair; the fallback needs both fiscal-year balances with total debt; the gap names the balance date and cause. | `f9ab1bb`, `25bd6ca`, `13109d3` | `tests/stageB.debtPairFallback.audit20261022.test.ts`, `tests/lease.numericConsumers.test.ts` |
| B-5 Principal above carrying withholds total debt | Fixed by batch 3a (the 2% or 50 million band); nothing left for this batch. | (3a) | (3a) |
| B-39 Operating income and EBIT withheld when interest sits inside a filed non-operating line | Fixed. EBIT is pretax income less the filed `NonoperatingIncomeExpense` aggregate when the interest tag is its taxonomy child, with the interest not added back and the reason disclosed. | `2209976` | `tests/edgar.statements.test.ts` |
| B-34 Note-scope combined cash overrides the balance-sheet cash | Fixed. A combined cash-and-short-term-investments total below the same filing's cash plus short-term investments yields to the component sum, disclosed, unless the gap is display rounding. | `ceaecab`, `242a822` | `tests/edgar.cashChains.audit20261022.test.ts` |
| B-43 The restricted-cash tags are not read | Fixed. `RestrictedCashCurrent` and `RestrictedCashNoncurrent` are read as the restrictions; both sides are still required from one filing. | `ceaecab` | `tests/edgar.cashChains.audit20261022.test.ts` |
| A-11 Vendor-versus-SEC equality at 1e-10 | Fixed by batch 3a (display-rounding tolerance); nothing left for this batch. | (3a) | (3a) |
| C-13 Bank net charge-off rate withheld for an incomplete recovery-tag list | Fixed. With no roll-forward recovery pair, write-offs pair with the same filing's `ProceedsFromRecoveriesOfLoanPreviouslyChargedOff` for the same fiscal year and unit, and the basis says so. | `f4274e7` | `tests/stageB.chargeOffRecoveries.audit20261022.test.ts` |
| E-6 Managed care labelled "Insurance - Life" and routed to the insurer map | Fixed (owner decision). SIC 6324 goes to the general map with a note; the keyless label is Healthcare / Medical - Healthcare Plans. | `0000b7e`, `ab5e048`, `0d1feb2`, `13e9845` | `tests/stageB.managedCareRouting.audit20261022.test.ts` |
| E-8 Current notes kept out of forensic long-term debt null the Piotroski leverage signal | Fixed where the evidence allows. ΔLEVER compares the composed long-term debt when both years compose it from the same tags (O regains its signal), and is withheld with both tag sets named when they differ. NNN stays withheld: its FY2025 figure carries a `LoansPayable` tag, at zero, that FY2024's lacks, and the provenance carries no value for each class to show it is zero. | `0bf16b1` | `tests/stageB.piotroskiComposedDebt.audit20261022.test.ts`, `tests/audit.issuerPipeline.test.ts` |
| Batch 1 carry-over: the uncomposed-total guard in Stage B's debt admission | Already on the base (`admitDebtFields` applies `uncomposedDebtReason`); skipped. | none | none |

Every new test failed before its fix, except the negative cases (another filing, a combined total above its components, differing tags, a life insurer's SIC), which pass on both sides by design.

## Owner decisions

- **C-1 (given).** The fallback above. The lease test that pinned the whole WACC as withheld behind a refused newest balance (`tests/lease.numericConsumers.test.ts`) now pins the WACC on the clean average, with a basis note, and the EV at the refused date still withheld.
- **E-6 (given).** The general route for SIC 6324. The forensic financial band (SIC 6000 to 6499 and 6700 to 6799) still includes 6324, unchanged, so UNH's Altman Z, Beneish M-score and accruals ratio stay withheld as for a financial company and its Piotroski score uses the financial variant.
- **B-8 (given).** Computed where the relation is established (3a), consistently withheld otherwise, now including the AI context's quote section.
- **B-35.** Equal basic and diluted EPS is taken as evidence that dilution does not move EPS at the reported rounding, or, in a loss from continuing operations, that potential shares are antidilutive; the stand-in is disclosed per period.
- **B-37.** The 3%, half-the-smallest-class and 120-day tests are house thresholds.
- **C-15.** The equity-statement column is admitted only on a tied consolidated total; no zero is inferred and nothing is carried forward.
- **B-39.** The taxonomy nesting is taken as the filer's presentation, as the withholding rule already did, with the understatement caveat disclosed.
- **B-34.** The component sum wins only when the combined total is below it by more than display rounding (one shared rounding unit or the A-11 0.01%) and from the same filing.
- **B-43.** `RestrictedCashCurrent` and `RestrictedCashNoncurrent` are read as restrictions on the combined total.
- **C-13.** Cash-flow recoveries are used only from the same filing, fiscal year and unit as the write-offs.
- **E-8.** The comparison is by tag set.

## Left for later

- B-37: ADRs (a depositary ratio and dated security evidence).
- E-8: per-class values in the statement provenance, which would let a zero-valued class (NNN's `LoansPayable`) count as no change in composition.
- E-6: whether managed care (SIC 6324) leaves the forensic financial band, which still withholds UNH's Altman Z, Beneish M-score and accruals ratio and puts its Piotroski score on the financial variant.
- B-34: the face-line cross-check the audit suggested is not built; the same-filing rule is the only scope guard, so a combined total whose components come from a schedule rather than the face is not detected.
- B-43: an issuer that tags only a `RestrictedCash` total, without the current and noncurrent split, is not read.

## Control panel

All 45 control-panel tickers ran keyless on copies of the census data, with every cost cap at 0, behind a dead proxy so that only the run cache served provider data. Base is `2f0772c` and head is this branch. No ticker errored and no company lost a figure.

| Figure | Base | Head | Change |
|---|---|---|---|
| Route | 45 | 45 | UNH insurer → general (E-6) |
| Fair value per share | 21 | 27 | gained CSCO 47.61 (B-34), CVX 195.21 (B-43), EXPE 271.57 and META 585.54 (B-37), LLY 842.45 (B-39), XOM 195.82 (B-35); UNH 215.52 excess-return → 395.25 FCFF DCF (E-6) |
| WACC | 32 | 35 | gained LLY 7.55% (B-39), T 6.24% (C-1), UNH 7.24% (E-6) |
| Total debt excluding leases | 35 | 36 | gained UNH 73.328B, equal to the oracle |
| Net debt | 34 | 37 | gained CSCO 13.615B (29.533 − 15.918), CVX 28.548B (37.075, equal to the oracle, less cash 8.527), UNH 41.86B |
| EV/EBITDA | 30 | 32 | gained CVX 8.67, UNH 16.26 |
| Market cap, P/E, P/B | 41, 36, 40 | 41, 36, 40 | unchanged |
| Critical gaps | | | CVX 3 → 2, LLY 3 → 1, T 3 → 2 |

What moved the bands and composites:

- **Valuation band.** EXPE gains D and META gains F from their new fair values. LLY goes from B to D and XOM from F to D, because a fair value now joins the multiples.
- **Quality band.**
  - CVX goes from B to C and LLY from C to B, because the ROIC-versus-WACC spread is now scored. CVX's ROIC is computable on the restored cash (B-43); LLY's ROIC and WACC are computable on the restored operating income (B-39).
  - O goes from D to C: the Piotroski leverage signal is restored (E-8).
- **Balance-sheet band.** UNH gains B. CVX goes from A to B, because net debt/EBITDA (0.51x) is now scored and the band's completeness rises from 0.47 to 0.82.
- **Moat band.** UNH gains C. The ROIC level is now scored for CVX and LLY: CVX goes from C to D on its 2025 ROIC of 6.85%, and LLY goes from B to A.
- **Leadership band.** XOM gains C.
- **Composite band.** CSCO goes from C to D and UNH from D to C.
- **Composite scores** moved for CSCO, CVX, EXPE, LLY, META, O, T, UNH and XOM.

Text-only changes:

- **V.** Its critical DCF gap now names the NCI ownership gate ("noncontrolling ownership unresolved at …") instead of "DCF inputs not provided by caller" (C-15). The figure stays withheld because Visa's NCI is still unresolved.
- **TSM.** Its debt gap now names its cause. The first head run worded a missing balance badly; `25bd6ca` fixed that wording.
- **T.** Its DCF is still withheld, now by the existing sales-to-capital gate (lease-excluded debt unavailable) rather than by WACC.

Cache-miss and provider-error rows were identical on both sides:

- BRK.B: insider sentiment, short interest and the data fallback.
- PGR and TSM: the data fallback.
- AMT: valuation maintenance.
- Each side had 40 background-refresh failures, as expected behind the dead proxy.

Watch-for tickers:

- MSFT, GOOGL, INTC and TSLA keep their EV/EBITDA. MSFT's row and its Key data line now carry the lower-bound D&A caveat (B-7).
- PG, COST and ORCL keep their WACC, and COST keeps its fair value.
- ORCL's fair value is suppressed on both sides by batch 2b's NCI earnings gate (E-5), and PG's by its balance-sheet sales-to-capital gate. Neither is in this batch.
- XOM's P/E stays withheld on both sides ("common earnings unavailable").
- V, MA and CMCSA stay consistently withheld on the multi-class scope (B-8).

The classic page and the `METIS_UI_REDESIGN=1` dossier page both render the new figures for UNH, MSFT, O and XOM. So do the Markdown, audit and print exports.
