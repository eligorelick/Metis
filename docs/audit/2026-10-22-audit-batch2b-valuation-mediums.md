# Audit batch 2b: the deferred valuation items (2026-10-22)

Base: `f9658f7` (main, with batches 2 and 3a and the dossier layout). Scope: batch 2b of the independent audit of 2026-10-22, the Medium valuation findings batch 2 deferred: E-7, B-13 with A-3, A-2, the financial-route cost of debt and WACC carried over from batch 1 (B-31), B-3 and B-33. Decision: D-104 in [DECISIONS](DECISIONS.md) (batch 3a took D-103); report 1.39.0, payload 1.44.0, Stage B ACCOUNTING_EVIDENCE_21 and score bands SCORE_BANDS_2026_10_REGULATED_UTILITY, the stamps after batch 3a's. The audit evidence folders stay out of the repository.

This change made no model calls and no paid provider calls. The only provider traffic was the keyless, data-only control panel below, served from the run cache behind a dead proxy, and one keyless data-only run of Southern Co. (SO), which the panel does not hold. No fixture file was added; the new tests build their inputs inline from the tags and figures of public SEC filings.

## Disposition

| Finding | Disposition | Commit | Tests |
|---|---|---|---|
| E-7 Retirement and environmental obligations missing from the bridge | Fixed. The DCF equity bridge deducts filed asset-retirement obligations and environmental remediation accruals when tagged (the total tag, else noncurrent plus current), and names each deduction; untagged issuers are unchanged. Each is read at the bridge's balance date, else at the latest date in the year before it, with that date named on the bridge line, because many filers (FCX) tag them in the 10-K only. A current portion alone is not the obligation, and a balance filed as zero or an annual balance sheet that no longer tags it ends the look-back. Funds legally restricted to settle the retirement obligations offset them at the same date, only beyond the long-term investments and marketable equity securities the bridge already adds, and never below zero. The deduction is before tax, and the bridge says so, and says that the retirement obligations' accretion already lowers NOPAT. | `cdc7a16`, `9e32b9d`, `ed57f75`, `bd1e1b9` | `tests/stageB.debtLikeObligations.audit20261022.test.ts` |
| B-13 Regulated utilities on general-industrial balance-sheet bands | Fixed. A regulated-utility overlay applies on the general route for SIC 4911, 4924, 4931, 4932 or 4941 with rate-regulated revenue or regulatory assets filed by the run date and ending within 24 months of it; the SIC alone does not apply it, and no base route moves. Its balance sheet is scored on the Standard Grid ranges of Moody's "Regulated Electric and Gas Utilities" (6 August 2024) for CFO before working capital / debt and debt / book capitalization, weighted two to one as Moody's weights them. Net debt / EBITDA, coverage, FCF conversion and SBC / FCF are not graded on that overlay. | `b4662cd`, `88309a7` | `tests/stageB.regulatedUtility.audit20261022.test.ts`, `tests/stageB.grading.test.ts` |
| A-3 Altman Z'' applied to utilities | Fixed with B-13: Altman Z is withheld from quality and the forensic table on the overlay, with a route reason. | `b4662cd` | as B-13 |
| A-2 Sales-to-capital floor over genuine capital intensity | Fixed. The 0.5 floor applies only when the issuer's own history does not establish a lower ratio: with at least three fiscal years of filed revenue and positive operating invested capital at the same date, the median of the newest five is the lower bound when it is below 0.5 and at least 0.1 (lower is read as a scale error). The basis lists the years and ratios, or says why the house floor stands. | `ba60a2a`, `cce3d69` | `tests/stageB.salesToCapitalHistory.audit20261022.test.ts` |
| B-31 WACC and cost of debt shown on financial routes | Fixed. On the bank, insurer and mortgage-REIT routes the WACC and pre-tax cost of debt are withheld with an info gap saying the route values equity at the cost of equity; the cost of equity is kept, and no per-fiscal-year WACC history is computed. No surface shows either figure: the returns table, the LLM payload, the Markdown, audit and print exports, and the company page in both layouts, whose WACC build also shows its weights and tax rate as not used. Fair values on those routes are unchanged. | `dc73ff6`, `058bfc3`, `2475992` | `tests/stageB.financialRouteWacc.audit20261022.test.ts`, `tests/stageB.ttm.compute.test.ts`, `tests/currency.companyPage.test.ts` |
| B-3 KO's DCF at −57% of price | Diagnosed; no defect, so no code change. See [KO's DCF](#kos-dcf-b-3). | none | none |
| B-33 The composite barely discriminates | Reported; a recalibration is proposed for the owner and not applied. See [The composite's spread](#the-composites-spread-b-33). | none | none |

Every new test failed before its fix, except the negative cases (an untagged issuer, a non-utility with a utility SIC, a history above the floor, a general-route WACC), which pass on both sides by design.

## Independent review

A fresh reviewer read the batch's diff without the author's reasoning, and an automated code review (`/code-review`, high effort) read it too. Both ran twice, the second time after the first round's fixes. Each finding was checked against the code; each confirmed one was fixed test first in its own commit. The author's own check of the exports found the first finding below.

| Finding | Disposition | Commit |
|---|---|---|
| E-7: an obligation read from the 10-K printed under the bridge's quarter date ("Balance sheet in the bridge: 2026-06-30"), with no date of its own outside the notes | Fixed: the line reads "(filed, before tax; balance at 2025-12-31, the latest filed)", and the scenario paths' fixed bridge keeps the date | `ed57f75`, `bd1e1b9` |
| E-7: a current portion tagged alone at the bridge date was taken for the whole obligation (0.19B for 3.84B) | Fixed: the noncurrent part must be among the parts, else the look-back continues | `bd1e1b9` |
| E-7: an annual balance sheet that no longer tags an obligation (settled or sold) still reached back to last year's | Fixed: no look-back past an annual report's balance sheet | `bd1e1b9` |
| E-7: a decommissioning trust added as marketable equity securities was credited again against the obligation | Fixed: the fund is credited only beyond the long-term investments and marketable equity securities already added | `bd1e1b9` |
| E-7: a fully offset obligation was described as subtracted | Fixed | `bd1e1b9` |
| E-7: ARO accretion inside EBIT already lowers NOPAT, so the time value is counted twice | Disclosed in the bridge notes and METHODOLOGY; no adjustment (left for later) | `bd1e1b9` |
| E-7: the fund is under-credited when the investments already added are unrelated to it, and a trust inside long-term investments bears the investment tax | Kept as a conservative choice, disclosed in METHODOLOGY | none |
| A-2: a history median replaced the floor however small, so a scale error repeated every year would collapse the DCF | Fixed: a median below 0.1 does not establish the issuer's ratio | `cce3d69` |
| A-2: the median was reimplemented beside the shared `medianOf` | Fixed | `cce3d69` |
| B-31: a missing risk-free rate, ERP or beta returned before the WACC was marked withheld, so surfaces fell back to "WACC n/a" rows | Fixed | `2475992` |
| B-31: the per-fiscal-year cost-of-equity history never ran in production (the route's ROIC series is empty), though the docs said it was kept | Removed, and the docs corrected; the excess-return evidence compares each year with the current cost of equity, as on main | `2475992` |
| B-31: the company page's WACC build still showed the tax rate the WACC shield uses | Fixed: "not used" | `2475992` |
| B-13: utility evidence did not check the filing date against the run date (replays) | Fixed | `88309a7` |
| B-13: SIC 4923 (natural gas transmission and distribution, under which some gas distributors file) is not in the overlay's list | Not changed: the SIC list is the owner's decision; left for the owner | none |
| B-31: a tax-rate clamp note can still sit in the WACC notes on these routes | Not changed: a note on an input, no WACC or cost-of-debt figure | none |
| Second round, E-7: the look-back walked past an annual balance sheet between the bridge's quarter and the balance it found | Fixed: it stops at the latest annual balance sheet on or before the bridge date | `19f88bb` |
| Second round, E-7: a year-end balance date read as a quarter once a later 10-Q re-filed its `Assets` as the comparative column | Fixed: any annual-form `Assets` fact at the date makes it annual | `19f88bb` |
| Second round, E-7: a balance filed as zero was skipped and an older positive balance deducted | Fixed: a filed zero ends the look-back | `19f88bb` |
| Second round, B-13: in a replay, a period re-filed after the run date was dropped instead of read as first filed | Fixed: the filed-by filter runs before the deduplication | `b52786a` |
| Second round, B-13: the two Moody's ratios had no operands, the industrial snapshot's dates and the label "Cfo pre wc to debt" in the score evidence | Fixed: their own operands, dates and names | `b52786a` |
| Second round, A-2: with the history floor active, a clamp left no note | Fixed | `ac83a35` |
| Second round, B-31: withholding the WACC history was said to drop each year's own cost of equity from the excess-return evidence | Not a defect: a financial route has no ROIC series (`compute.ts`), so no year had a cost of equity of its own on main either; the base panel shows the same "CURRENT cost of equity" note on all four excess-return issuers. The stale comment is corrected | none |
| Second round, A-2: the history's invested capital skips the current balance's lease-coverage checks | Not changed: debt missing lease liabilities understates capital and raises the ratio, so it can keep the house floor but cannot establish a spurious lower one | none |
| Second round, B-13: the utility block builds consolidated equity inline rather than through the DCF's resolver | Not changed: the same definition (total equity, else parent equity plus noncontrolling interests); merging the two is a refactor for later | none |
| Second round, E-7: the scenario text reads the balance date back out of the line's label | Not changed: the exact text is pinned by a test, so a reworded label fails it | none |

## Left for later

- E-7: the deduction is before tax. A tax-effected deduction needs the deferred-tax asset on each obligation, which issuers do not tag consistently.
- B-13: the overlay grades leverage only. Moody's other factors (regulatory framework, cost recovery, diversification) are qualitative and not read.
- SO's DCF is withheld on both sides (its noncontrolling-interest split is unresolved, a pre-existing gap), so E-7 and A-2 cannot be shown on it.
- B-33: the recalibration itself, once the owner chooses.
- E-7: the double count of the retirement obligations' time value (their accretion sits in EBIT); adjusting NOPAT needs the accretion line, which filers tag inconsistently.
- B-13: whether SIC 4923 joins the overlay's list (owner decision; the evidence gate would still keep out unregulated pipelines).
- B-31: a per-fiscal-year cost of equity for the excess-return evidence on bank and insurer routes. It would move their fair values, so it is outside this batch.

## Control panel

Base is `f9658f7` (origin/main) and head is the final code commit of this branch (`88309a7`). Head was run again after the review fixes, and every field in the census matched the run before them. Both sides ran the 45-ticker panel keylessly, offline behind a dead proxy, with a pinned clock (`PANEL_NOW=2026-10-22T06:00:00Z`), cost caps of 0 and a copy of the audit's cached `metis.db`. Each side finished 45 of 45 with no errors. The background-refresh failures in the logs are expected behind the dead proxy and changed nothing. Each side was extracted with `extract-census.mjs` and diffed field by field; the figures the oracle (`oracle-compare.csv`) holds (revenue, net income, EPS, debt, market cap, P/E) did not move on any ticker.

| Figure | Base produced | Head produced | Gained | Lost | Changed value |
|---|---|---|---|---|---|
| Overlay | 3 | 5 | DUK, NEE (regulated utility) | none | none |
| WACC | 37 | 32 | none | BAC, BRK.B, JPM, PGR, UNH (withheld by B-31) | none |
| Fair value | 21 | 21 | none | none | BA, DUK, FCX |
| Balance-sheet letter | 40 | 40 | none | none | DUK F → D, NEE F → D |
| Quality letter | 44 | 44 | none | none | NEE D → C |
| Composite score | 45 | 45 | none | none | DUK 47.26 → 51.98, NEE 49.24 → 52.50 (both stay D) |
| Total debt, net debt, market cap, P/E, EV/EBITDA, P/B, every other letter, composite band | unchanged | unchanged | none | none | none |

No company changed base route, and no figure other than the WACC on the five equity-valued routes was lost.

**WACC withheld (B-31).** BAC (WACC 13.53%, cost of debt 22.68%) and JPM (11.49%, 19.30%) are on the bank route; PGR (7.43%, 5.52%), BRK.B (8.21%) and UNH (7.24%, 5.11%) are on the insurer route, which UNH already took on main. Each keeps its cost of equity unchanged (BAC 9.81%, JPM 9.40%, PGR 7.63%, BRK.B 8.21%, UNH 7.81%), and no fair value on these routes moved.

**Fair values, each with its cause:**

| Ticker | Base | Head | Cause | Decomposition |
|---|---|---|---|---|
| BA | 34.93 | 33.70 | E-7 | Environmental remediation accrual of $0.971B at 2026-06-30 (10-Q), before tax, over 0.79B diluted shares: −$1.23. No retirement obligation is tagged. |
| DUK | 71.92 | 36.64 | A-2 and E-7 | Sales-to-capital 0.5 → 0.2254, its own TTM ratio, which the 0.5 floor had replaced. The issuer's FY2021–25 ratios (0.205 to 0.227, median 0.2200) establish that a ratio below 0.5 is genuine. More reinvestment per dollar of growth lowers each year's free cash flow. E-7 deducts the $0.095B environmental accrual (−$0.12). The $9.61B retirement obligation is fully offset by the $12.64B nuclear decommissioning trust, so nothing is deducted for it. |
| FCX | 19.70 | 17.10 | E-7 | Retirement obligations $3.836B and environmental accruals $2.018B at 2025-12-31 (10-K filed 2026-02-13; the 2026-06-30 10-Q does not tag them). The noncontrolling owners bear their 35.8% earnings share of the deduction, so the per-share effect is $5.854B × 0.642 / 1.443B = −$2.60. |

Hand checks, independent of the code:

- **DUK.** The explicit-period present value is 20.54B and the terminal present value 97.96B, so EV is 118.50B. Equity is 118.50 − 88.11 net debt − 2.02 NCI + 0.16 non-operating = 28.54B, and over 0.779B shares that is $36.64. The audit's own no-floor replay gave $36.76; less the $0.12 E-7 deduction, that is $36.64.
- **FCX.** EV of 49.611B less 5.306B net debt and 5.854B of obligations is 38.451B. The NCI deduction is 0.3584 × 38.451 = 13.780B (base: 0.3584 × 44.305 = 15.878B), so equity is 24.671B, which over 1.443B shares is $17.10.

NEE keeps no fair value on either side (outside the DCF domain). Its $3.73B retirement obligation is offset by the $10.71B decommissioning fund beyond the $6.65B of long-term investments the bridge already adds, so E-7 would deduct nothing.

**Southern Co. (SO), outside the panel.** One keyless data-only run per side, both offline on the same pinned clock (`2026-10-26T05:45:00Z`, after the cache's fetch). Head applies the regulated-utility overlay. The balance sheet goes from F (22.2) to D (48.6), quality from D (51.9) to C (56.7), and the composite from 45.59 to 49.49 (both D). The WACC is unchanged at 6.0%. The DCF is withheld on both sides (pre-existing: the noncontrolling-interest split is unresolved).

## KO's DCF (B-3)

KO's fair value is $39.86 against a price of $92.68 (−57%). The decomposition, from the run's own figures:

- **WACC 7.33%.**
  - Risk-free 5.12% (DGS10), ERP 4.18%, beta 0.60: the floor, over a raw 0.30.
  - Cost of equity 7.63%.
  - Pre-tax cost of debt 5.52% (synthetic AAA).
  - Equity / debt 90 / 10.
- **Growth and margin.** Revenue growth fades from 3.54% to the 2.5% terminal cap. The EBIT margin fades from 29.34% TTM to its five-year median of 25.37% by year 5.
- **Reinvestment.** Sales-to-capital 1.026 (the issuer's own figure, above the floor); terminal ROIC 12.31%.
- **Value.** Explicit-period PV is 77.31B. The terminal value of 221.82B has a PV of 113.31B (59% of EV). EV is 190.62B.
- **Bridge.** Net debt 32.73B, NCI 2.10B, non-operating +16.15B (long-term investments of 20.45B less 4.29B tax). Equity is 171.95B, which over 4.314B shares is $39.86 (hand-checked).
- **Sensitivity.** The highest cell of the WACC ± 2pp × terminal growth ± 1pp grid (WACC 5.33%, growth 3.5%) gives $84.64, still below the price. The reverse DCF needs 36.7% year-one growth.

No single input is wrong. The gap is the house calibration audit finding B-30 describes: a high risk-free rate, a 2.5% growth cap, and a margin fading to its median. It is not a defect, so nothing was changed. Batch 2's house base-rate line already states this pattern beside the headline.

## The composite's spread (B-33)

On the head panel the composite letters are D 17, C 26, B 2, with no A and no F: 43 of 45 companies sit in C or D. The scores run from 40.27 to 80.75:

| Percentile | 10th | 20th | 25th | 40th | 50th | 60th | 75th | 80th | 90th |
|---|---|---|---|---|---|---|---|---|---|
| Score | 49.83 | 52.08 | 52.77 | 55.12 | 56.30 | 57.90 | 62.65 | 63.43 | 66.52 |

The aspects spread more than the composite does. For example, valuation is F on 18 companies and withheld on 10; the balance sheet is B 18, C 10, F 7, D 4, A 1; technicals are F on 14. Averaging seven aspects pulls the composite toward the middle.

**Owner decision (proposed, not applied).**

- **Option 1 (recommended).** Keep the absolute bands (85 / 70 / 55 / 40) and show the score's percentile within the dated panel beside the letter. The letter keeps its fixed meaning, and the percentile adds the discrimination.
- **Option 2.** Recalibrate the cut points to the panel's quintiles (A ≥ 63.4, B ≥ 57.9, C ≥ 55.1, D ≥ 52.1). The letters would spread evenly, but they would grade on a curve: a letter would then depend on the panel, and B to D would span about 6 points.

The bands stay 85 / 70 / 55 / 40 until the owner chooses.
