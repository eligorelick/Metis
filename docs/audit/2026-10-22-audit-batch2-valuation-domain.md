# Audit batch 2: valuation in and out of its domain (2026-10-22)

Base: `fd06eee` (main), rebased onto `dd9c61b` (the security batch, which moves no figure). Scope: batch 2 of the independent audit of 2026-10-22. The owner narrowed it to findings C-10 (Critical), B-29, C-11, E-5 and B-30 (High). These are reports that published a valuation outside the model's domain, started a bank's model from a stale year, or understated an outside holder's claim. Decision: D-102 in [DECISIONS](DECISIONS.md). The audit evidence folders stay out of the repository.

This change made no model calls and no paid provider calls. The only provider traffic was the keyless, data-only control panel below. No fixture was added.

## Disposition

| Finding | Disposition | Commit | Tests |
|---|---|---|---|
| B-29 DCF outside its domain | Fixed. NEE published $0.00 from a DCF whose equity value was below zero. TSLA published $10.19 from one whose explicit-period present value was negative (terminal value 1,234% of enterprise value). Now, when the equity value is at or below zero or the terminal value exceeds the enterprise value, the fair value is "outside-domain", with a critical `valuation.dcf.domain` gap naming the test. No per-share value, grid, reverse DCF or scenario target is published from it, and the valuation grade treats its signals as missing. Key data, the valuation section, both exports and the data-only verdict say "Model outside its domain" and why. | `9cdc6d0` | `tests/stageB.dcfDomain.audit20261022.test.ts` |
| C-10 Excess-return start | Fixed. COF's acquisition-depressed FY2025 ROTE of 4.2% set the fade although the trailing four quarters earned about 17%, and that one year also vetoed the terminal carry. The model now starts from the trailing four quarters when that window is complete and newer than the fiscal year, values the fiscal-year start beside it, and prints that value when the two differ by more than 5pp. The terminal carry needs 4 of the last 5 years above the cost of equity. One below-hurdle business-combination year (at least 10% of opening common equity) is set aside and annotated; any other counts as a miss. Replay of the audit's COF snapshot: $81.38 → $153.65 (+88.8%; the finding expected +51–94%), with the fiscal-year start at $109.99 beside it. | `7e7be89`, `a1431c6` | `tests/stageB.excessReturnStart.audit20261022.test.ts` |
| C-11 Trailing return and start sensitivity | Fixed. The trailing ROTE (common-equity ROE for insurers) is a row in the returns block and a payload figure. A 3×3 start-return × cost-of-equity grid of per-share values renders in the valuation tables on every surface, each cell a citeable payload figure, and the scenario sensitivity conclusion reads it. A Stage C check names, in a `verify.check.returnPath` warning, base-case sentences about returns recovering toward the cost of equity when the trailing return already exceeds the terminal target. | `51b4e96` | `tests/stageC.excessReturnVisibility.audit20261022.test.ts` |
| E-5 NCI on the earnings key | Fixed, on the owner's trigger (below). FCX's DCF values consolidated free cash flow but deducted NCI at its $12.11B book value. NCI earned 35.8% of trailing consolidated profit, a claim of about $15.9B. The bridge now deducts NCI at its profit share of consolidated equity value when that share is above 10% and above book NCI ÷ consolidated equity value; otherwise at book. The key is the trailing four quarters, or the latest fiscal year when they cannot size it (the DCF's own income falls back the same way). The sensitivity grid, the growth × margin grid, the reverse DCF and the scenario paths apply the same rule. The bridge table shows the amount, its basis and the book figure. When NCI exists and the share cannot be established (including NCI income above consolidated profit), the DCF runs on book NCI for its domain test only, and the per-share value is withheld with a `valuation.dcf.noncontrollingEarningsKey` warning; an earlier gate's reason still leads. Panel: FCX $22.27 → $19.67. | `b16a775`, `d32fb34`, `a1431c6` | `tests/stageB.nciEarningsKey.audit20261022.test.ts` |
| B-30 House DCF base rate | Fixed, as scoped by the owner: disclosure only. The Key data note under a general-route "Model fair value (DCF)" states "house base rate: 16 of 18 general-route DCFs in the 2026-10-22 audit census were below price (median −53%; 15 of 18 more than 30% below)". METHODOLOGY.md records it. The excess-return and REIT routes do not carry it. | `a422693` | `tests/report.dcfBaseRate.audit20261022.test.ts` |

Every new test failed before its fix.

## Deferred to the follow-up batch by owner priority

E-7, B-13/A-3, A-2, B-3, B-33 and the financial-route WACC carry-over were not started. No High fix here needed part of one.

## Control panel

45 tickers, keyless and data-only (no FMP key, no model). The comparison was made two ways:

- **Exact replay.** Each base report's own run-input snapshot (base `fd06eee`) was replayed through this branch's `runStageB`, so every difference is a code change and none is data drift. It was rerun after the review fixes below, with the same result.
- **Live run.** A fresh run on this branch, compared with the audit's oracle (`oracle-compare.csv`); see "Live run" below.

Replay, every fair value or status that moved:

| Ticker | Route | Before | After | Cause |
|---|---|---|---|---|
| NEE | DCF | $0.00 | outside-domain (equity value ≤ 0) | B-29 |
| TSLA | DCF | $10.19 | outside-domain (terminal value > EV) | B-29 |
| FCX | DCF | $22.27 | $19.67 (NCI 35.8% of trailing profit; $15.86B deducted against $12.11B book) | E-5 |
| BAC | excess-return | $42.82 | $47.36 | C-10 trailing start |
| PGR | excess-return | $189.83 | $390.23 | C-10 trailing start (insurer common ROE) |
| UNH | excess-return | $194.47 | $211.58 | C-10 trailing start |

Composite scores move only where those values or the trailing-return signals do: NEE 44.33 → 49.23 and TSLA 51.75 → 54.55 (DCF signals now missing), BAC 58.21 → 58.94, PGR 68.04 → 75.06, UNH 52.50 → 53.05, and BRK.B 50.79 → 52.02 (its excess-return value stays suppressed; the trailing return is new evidence).

Every other issuer that carries NCI keeps the book deduction, with values unchanged. Each is below the 10% threshold: BA 0.4%, DUK 2.0%, EXPE 0.1%, KO 0.5%, PEP 0.6%, VZ 2.6%, WMT 1.9% and XOM 2.9% of trailing profit. EXPE and XOM stay suppressed for their earlier reasons. No issuer is newly withheld for an unestablished NCI key.

The first panel run caught an ordering defect, fixed in `d32fb34` with its own failing tests. The NCI-key withhold ran before every other gate, so INTC (structurally negative FCF) and ORCL (no WACC) were reported under the NCI reason. NEE, which is outside the domain, was reported as an NCI gap. NEE's trailing NCI income is not established. That no longer decides its status, because a domain failure on book NCI holds under any key.

DUK and NEE stay on the general route; the utility route change (B-13/A-3) is deferred.

### Live run

A fresh keyless run of the 45 tickers on this branch (before the review fixes, which the replay above shows move no value) published the expected statuses: NEE and TSLA outside the domain, FCX $19.78, BAC $47.30, PGR $390.23 and UNH $211.58. These are within price drift of the replay. INTC, ORCL, BRK.B, EXPE and XOM stay suppressed for their earlier reasons.

Against the audit's oracle (`oracle-compare.csv`), the branch changes no input it checks (TTM revenue, net income, EPS, debt, market cap, P/E). A base-code run made earlier the same day matches the audit's agreement counts: revenue 37 agree, net income 35, debt 19 agree with 4 definitional, market cap 39, P/E 25. Every difference between that run and this branch's run is data that arrived in between:

- market caps on a later closing price (26 now outside the 2.5% band against the oracle's 2026-10-21 close);
- a third-quarter 10-Q filed by PG, CMCSA, TSLA and META, which moves their TTM window to 2026-09-30 ("differs" against the oracle's June window).

## Review fixes

Two reviews of the branch (`/code-review` at high effort and an independent reviewer) found these. Each was fixed test-first in `a1431c6`, and the new tests are in the files named above.

| Finding | Fix |
|---|---|
| NCI income above consolidated profit (the parent's share negative) gave a profit share above 1, so the bridge deducted more than the whole equity value and the DCF was reported outside its domain for the wrong reason. | Treated as an unestablished key: the per-share value is withheld with that reason. |
| The NCI reason replaced an earlier gate's reason (diluted shares, net debt) when the per-share value was already withheld. | The withhold is now a structured `dcf.noncontrollingKeyWithheld`, set only when no earlier gate withheld the value. The fair value and scenario targets read it instead of matching a gap string. |
| With no complete trailing window (annual-only filers), or with trailing quarters that do not tag NCI income, any NCI withheld the DCF, although the DCF itself falls back to the fiscal year. | The key falls back to the latest fiscal year and says so ("fiscal-year consolidated profit to …"). |
| A trailing net income of unknown ownership was treated as parent income and NCI income was added to it, which can double-count NCI. | Only a net income known to be the parent's is grossed up; otherwise that period does not size the key. |
| The bridge row said a share at or below 10% "would not deduct more" when it would. | It now says the share "is not above the 10% house threshold", as the DCF note already did. |
| The scenario inputs described the minority interest as book whenever the base path used book, although a richer path can switch to the earnings key. | Above 10% the text names both bases ("the larger of …") for every path. |
| Under 4-of-5, any number of set-aside combination years counted toward the four, so two above-hurdle years could carry a terminal excess. | At most one combination year (the latest) is set aside; any other counts as a miss. This also keeps the median spread from running over an empty set. |
| The excess-return note said the model started "from FY …" when it started from the trailing window. | The note names the start actually used. |
| The TTM return said there was no balance sheet four quarters earlier when one existed without an equity figure. | It names that balance sheet and the missing figure. |
| The return-path check's pattern could not cross a decimal ("toward the 10.4% cost of equity"). | It now reads to the end of the sentence. |
| The fair-value basis line hard-coded "5pp", and `excessReturnStart.ts` re-exported the gap constant for one test. | The line reads `EXCESS_RETURN_START_GAP_PP`, and the test imports the constant from `valuation.ts`. |

Not changed: the review noted that `businessCombinationYears` reads each tag once per year. That is at most 5 years × 4 tags on the financial route, too small to matter.

## Owner decisions

- Scope: C-10, B-29, C-11, E-5 and B-30, in the order B-29, C-10, C-11, E-5, B-30. B-30 is the base-rate disclosure only.
- E-5 trigger: the profit share must exceed 10% and NCI book ÷ consolidated equity value (EV less net debt and the other claims). This is the same as deducting the larger of book NCI and the profit share × consolidated equity value whenever the share is above 10%. It supersedes the notes' literal "NCI book ÷ total book equity", under which FCX's 37.6% book ratio would have kept it at book ($22.27).
- E-5: when the earnings key cannot be established, withhold the per-share value with an NCI-scope reason.
- B-30: state the base rate from the 2026-10-22 census beside the DCF headline and in METHODOLOGY.md.
- C-10: the equity model's 4-of-5 carry rule and the business-combination set-aside.
- House conventions introduced here:
  - the 5pp start gap, the 4-of-5 rule and the 10% business-combination threshold (C-10);
  - the ±5pp and ±1pp grid steps (C-11);
  - the 10% NCI materiality (E-5);
  - the dated base rate (B-30).

## Left for later

- NEE's trailing NCI income is not established in the keyless data. That is harmless while its DCF is outside the domain, but it will withhold the DCF once the utility route (B-13/A-3) gives it a domain-valid value.
- The E-5 key is the trailing four quarters. A one-off gain or impairment inside a subsidiary moves the NCI share for a year.
- The base rate is a fixed 2026-10-22 panel. A new census is needed to update it, and its calibration (B-3) and the valuation band (B-33) are deferred.
