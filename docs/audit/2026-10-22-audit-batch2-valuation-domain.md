# Audit batch 2: valuation in and out of its domain (2026-10-22)

Base: `fd06eee` (main), rebased onto `dd9c61b` (the security batch, which moves no figure). Scope: batch 2 of the independent audit of 2026-10-22. The owner narrowed it to findings C-10 (Critical), B-29, C-11, E-5 and B-30 (High). These are reports that published a valuation outside the model's domain, started a bank's model from a stale year, or understated an outside holder's claim. Decision: D-102 in [DECISIONS](DECISIONS.md). The audit evidence folders stay out of the repository.

This change made no model calls and no paid provider calls. The only provider traffic was the keyless, data-only control panel below. No fixture was added.

## Disposition

| Finding | Disposition | Commit | Tests |
|---|---|---|---|
| B-29 DCF outside its domain | Fixed. NEE published $0.00 from a DCF whose equity value was below zero. TSLA published $10.19 from one whose explicit-period present value was negative (terminal value 1,234% of enterprise value). Now, when the equity value is at or below zero or the terminal value exceeds the enterprise value, the fair value is "outside-domain", with a critical `valuation.dcf.domain` gap naming the test. No per-share value, grid, reverse DCF or scenario target is published from it, and the valuation grade treats its signals as missing. Key data, the valuation section, both exports and the data-only verdict say "Model outside its domain" and why. | `9cdc6d0` | `tests/stageB.dcfDomain.audit20261022.test.ts` |
| C-10 Excess-return start | Fixed. COF's acquisition-depressed FY2025 ROTE of 4.2% set the fade although the trailing four quarters earned about 17%, and that one year also vetoed the terminal carry. The model now starts from the trailing four quarters when that window is complete and newer than the fiscal year, values the fiscal-year start beside it, and prints that value when the two differ by more than 5pp. The terminal carry needs 4 of the last 5 years above the cost of equity. One below-hurdle business-combination year (at least 10% of opening common equity) is set aside and annotated; any other counts as a miss. Replay of the audit's COF snapshot: $81.38 → $155.43 (+91.0%; the finding expected +51–94%), with the fiscal-year start at $111.06 beside it ($153.65 and $109.99 before the payout fade). | `7e7be89`, `a1431c6` | `tests/stageB.excessReturnStart.audit20261022.test.ts` |
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
| BAC | excess-return | $42.82 | $45.79 | C-10: the opening book moves to the trailing window's end, 2026-06-30, and the trailing ROTE start is 0.25pp lower ($47.36). The payout fade, 48.0% → 79.3% by year 10, then lowers it. The carry is unchanged. |
| PGR | excess-return | $189.83 | $293.09 | C-10's 4-of-5 terminal carry ($390.23), then the payout fade, 13.1% → 80.2% by year 10. The trailing start lowers the value; see "PGR" below. |
| UNH | excess-return | $194.47 | $215.29 | C-10: trailing start 14.62% against the fiscal-year 12.91%, from the newer opening book ($211.58). The payout fade, 88.9% → 80.5% by year 10, retains more. The carry is unchanged. |

Composite scores move only where those values or the trailing-return signals do: NEE 44.33 → 49.23 and TSLA 51.75 → 54.55 (DCF signals now missing), BAC 58.21 → 58.65, PGR 68.04 → 73.12, UNH 52.50 → 53.05, and BRK.B 50.79 → 52.02 (its excess-return value stays suppressed; the trailing return is new evidence).

Every other issuer that carries NCI keeps the book deduction, with values unchanged. Each is below the 10% threshold: BA 0.4%, DUK 2.0%, EXPE 0.1%, KO 0.5%, PEP 0.6%, VZ 2.6%, WMT 1.9% and XOM 2.9% of trailing profit. EXPE and XOM stay suppressed for their earlier reasons. No issuer is newly withheld for an unestablished NCI key.

The first panel run caught an ordering defect, fixed in `d32fb34` with its own failing tests. The NCI-key withhold ran before every other gate, so INTC (structurally negative FCF) and ORCL (no WACC) were reported under the NCI reason. NEE, which is outside the domain, was reported as an NCI gap. NEE's trailing NCI income is not established. That no longer decides its status, because a domain failure on book NCI holds under any key.

DUK and NEE stay on the general route; the utility route change (B-13/A-3) is deferred.

### PGR: what moves the value

The trailing start does not explain PGR's move; on its own it lowers the value. The terminal carry, which the 4-of-5 rule admits, adds it, and the owner's payout fade (below) takes back almost half of that. The columns are the base tree, this branch before the fade (`17a72f5`) and this branch, each from the replay's own Stage B output.

| | Base | Branch before the fade | Branch |
|---|---|---|---|
| Price | $221.35 | $221.35 | $221.35 |
| Opening common book (per share) | $30.32B at 2025-12-31 ($51.91) | $34.33B at 2026-06-30 ($58.77) | $34.33B at 2026-06-30 ($58.77) |
| Fiscal-year common ROE (FY2025) | 40.45%, the start | 40.45%, valued beside the headline at $417.60 | 40.45%, valued beside the headline at $305.85 |
| Trailing common ROE (to 2026-06-30) | not computed | 34.94%, the start: income to common $11.70B / average common equity $33.47B | 34.94%, the start |
| Cost of equity | 7.64% | 7.64% | 7.64% |
| Fade (linear, years 1–10) | 40.45% → 7.64% | 34.94% → 12.64% | 34.94% → 12.64% |
| Terminal carry | none: the every-year rule; 2022 (4.07%) vetoed it | 5pp. Above the cost of equity in 4 of 2021–2025; the miss is 2022 at 4.07%. Half the 13.73pp median spread over all five years is 6.87pp, capped at 5pp. | 5pp, as before the fade |
| Terminal growth of residual income | none | 2.5% | 2.5% |
| Payout | 13.14% (3-year average), held for 10 years | 13.14%, held for 10 years | 13.14% in year 1, fading linearly to 80.22% in year 10 (1 − 2.5% / 12.64%) |
| Book at year 10 | $196.4B (6.48× opening) | $221.7B (6.46×) | $125.7B (3.66×) |
| Value: opening book | $51.91 | $58.77 | $58.77 |
| Value: explicit-period excess returns | $137.92 | $154.54 | $133.98 |
| Value: terminal (continuing value) | $0 | $176.92 (45.3% of the value) | $100.33 (34.2%) |
| **Per-share value** | **$189.83** | **$390.23** | **$293.09** |
| Implied P/B on opening book | 3.66× | 6.64× | 4.99× |

**Waterfall.**
- Base: $189.83.
- The trailing start on the newer book, with no carry and the flat payout: $176.50 (−$13.33).
- Adding the 5pp carry: $390.23 (+$213.73).
- Fading the payout to the steady state: $293.09 (−$97.14).
- With the fiscal-year start, the carry and the fade: $305.85, beside the headline.

Without the carry, the fade alone moves the trailing-start value from $176.50 to $167.96.

**Hand check.** An independent recalculation reproduces every figure above, and both sides of BAC and UNH before and after the fade, to within 1e-12 per share. It uses only the disclosed inputs:
- year-1 to year-10 ROE on the linear fade;
- the payout on its linear path from the three-year average to 1 − g / terminal ROE (flat before the fade);
- the excess on the prior year's book, discounted at the cost of equity;
- book compounding at ROE × (1 − that year's payout);
- continuing value of 5% × book at year 10 / (7.64% − 2.5%), discounted 10 years.

**Suspected defects ruled out.**
- **No 30% return in perpetuity.** The terminal ROE is 12.64% (the cost of equity + 5pp).
- **No basis mismatch.** The start return, the opening book and the year-10 book are all common equity, against a CAPM cost of equity. PGR's tangible and common equity are equal at FY2025.
- **Growth applied once.** Residual income beyond year 10 grows at 2.5% from the year-10 book. At the horizon the continuing value is 1.97× book, which is (12.64 − 2.5) / (7.64 − 2.5), the steady-state formula.

**The inconsistency the fade removes.** The continuing value grows residual income at g, which needs book growing at g. Held at 13% for ten years, the payout retained 87% of earnings at the faded ROE, so book compounded 6.5×, and the 5pp carry applied to that larger book. The owner's decision fades the payout to 1 − g / ROE_T, the steady state the continuing value assumes (Damodaran's stable-growth consistency). Year-10 book is now 3.66× opening, and year-10 book growth is exactly g: 12.64% × (1 − 80.22%) = 2.5%.

**Why $293.09 is credible, and what drives it.** It is 4.99× opening book: 1.00 book, 2.28 explicit-period excess returns and 1.71 continuing value. It is above a steady-state 3–4× because the explicit decade starts at a 34.9% return and stays above the cost of equity throughout. The continuing value then prices year-10 book at the steady-state 1.97×. The remaining house convention is the 4-of-5 carry (the owner's C-10 decision), which is 34% of the value. The report keeps its implied-P/B flag (4.99 outside the [0.3, 3] sanity band).

### Payout fade (owner decision, C-10 follow-through)

The explicit-period payout now fades linearly from the three-year average in year 1 to the steady state 1 − g / ROE_T in year 10, clamped to 0–100%. ROE_T is the terminal return: the cost of equity plus any carry, or the cost of equity. g is the continuing growth, min(2.5%, risk-free). Book then grows at g when the continuing value starts. The fiscal-year start, every grid cell (to its own column's ROE_T) and the reverse solve use the same path. Only the excess-return route moves: every DCF value, status and NCI basis in the replay is unchanged.

| Issuer | Payout, year 1 → year 10 | Before the fade | After | Change |
|---|---|---|---|---|
| BAC | 48.01% → 79.27% | $47.36 | $45.79 | −3.3% |
| PGR | 13.14% → 80.22% | $390.23 | $293.09 | −24.9% |
| UNH | 88.89% → 80.49% | $211.58 | $215.29 | +1.8% |
| COF (audit snapshot) | 90.00% (the payout clamp) → 80.47% | $153.65 | $155.43 | +1.2% |

- UNH and COF rise because their payout falls toward the steady state, so they retain more.
- The fiscal-year values beside the headline move: BAC $42.82 → $41.40, PGR $417.60 → $305.85, UNH $194.47 → $197.80 and COF $109.99 → $111.06.
- COF against the base tree: $81.38 → $155.43 (+91.0%; the finding expected +51–94%).
- JPM and BRK.B stay suppressed.
- Composites: BAC 58.94 → 58.65 and PGR 75.06 → 73.12; UNH stays at 53.05.

### Live run

A fresh keyless run of the 45 tickers on this branch (before the review fixes, which the replay above shows move no value) published the expected statuses: NEE and TSLA outside the domain, FCX $19.78, BAC $47.30, PGR $390.23 and UNH $211.58. These are within price drift of the replay before the payout fade; the live run predates the fade, whose effect the replay shows. INTC, ORCL, BRK.B, EXPE and XOM stay suppressed for their earlier reasons.

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

A second independent review of those fixes found three more, fixed test-first in the next commit:

| Finding | Fix |
|---|---|
| When a set-aside year completed the four, the carried basis read "exceeded in 3 of the last 5 fiscal years, at least 4 of the last 5 being required". | It says the set-aside business-combination year counts toward the four. |
| A trailing window with both figures but no usable key (consolidated loss, or NCI income above consolidated profit) did not fall back to the fiscal year. | The fiscal year is used whenever the trailing window cannot size the key. |
| The withhold reason named only the trailing window's gap. | It says neither period could size the key. |

A second `/code-review` pass then found four more, also fixed test-first:

| Finding | Fix |
|---|---|
| The return-path check flagged "ROTE is expected to rise to about 17%, well above the cost of equity", because "to … cost of equity" fell within its reach. | "above", "over", "beyond", "exceeding", "surpassing" and "topping" end the reach. |
| The start × cost-of-equity grid was not floored at 0 like the headline, and its centre cell skipped the finite-value guard. | Every cell is floored at 0 and guarded. |
| The trailing return's balance lookup took the first of two rows with the same date (a 10-Q and the 10-K, or a restatement). | The latest filing wins a same-date tie. |
| A floored excess-return value was explained as "enterprise value at or below net debt", the DCF's wording. | It reads "book value plus the present value of the excess returns is at or below zero". The B-29 domain test now withholds every DCF whose equity value is at or below zero first, so the floor is reached only on the excess-return route. |

Not changed from that pass:

- **Withholding the DCF for any unsized NCI, however small.** This follows the owner's E-5 decision: withhold when the key cannot be established. Small book NCI does not bound the profit share. The replay withholds no issuer, and every NCI issuer in the panel has a key. NCI income tagged only under `MinorityInterestInNetIncomeLossOfConsolidatedEntities` or `NetIncomeLossAttributableToNonredeemableNoncontrollingInterest` is not read today. Adding those synonyms changes extraction for every consumer, so it is left for later.
- **One withhold field on `DcfResult` in place of `domain` and `noncontrollingKeyWithheld`.** A design refactor with no behaviour change. Projections publish no value from either withheld DCF, and forecast EPS is already withheld whenever NCI is present.
- **Efficiency and duplication notes:** the per-year tag parse, the copied grid-label pattern, and the excess-return grid summary beside the DCF one. None affects a figure.

Not changed: the review noted that `businessCombinationYears` reads each tag once per year. That is at most 5 years × 4 tags on the financial route, too small to matter.

The Codex review of the pushed branch found six more, all valid, fixed test-first in the next commit:

| Finding | Fix |
|---|---|
| (P1) A zero NCI income was read as an established 0% share. The vendor feed can report an omitted figure as 0, so book NCI could be deducted with no evidence of the profit share. | A zero counts only when a filing reports it: EDGAR field provenance on every quarter of the trailing window, or on the fiscal year. Otherwise that period cannot size the key, and the fiscal-year fallback and the withhold apply as before. A nonzero figure is unchanged. |
| Acquisition facts were read only from 10-K forms, so a 20-F or 40-F filer's business-combination year was never found. | They are read from the annual forms the extractor trusts: 10-K, 20-F and 40-F, with amendments. |
| A restated acquisition figure was read as the largest value for the period, so an original 400 restated to 40 still flagged the year. | The period's latest filing wins (the extractor's dedup rule, then the accession number on a same-day tie). |
| The return-path check read the legacy assumptions even when the report keeps the commentary, which replaces them. | It reads the commentary, else the assumptions, under the commentary's name (as presentation does), and what would have to be true. |
| The check compared the language with the trailing return even when the model started from the fiscal year (the trailing window not newer), and did not run without a trailing return. | It compares with the model's first-year return and names it: the trailing window when the model started there, else "the model's fiscal-year start". |
| Past-tense verbs (improved, rose, climbed, rebuilt, risen) were not recognized. | They are. |

The replay was rerun on the fix: no figure, status or NCI basis moved, and no DCF is newly withheld.

## Owner decisions

- Scope: C-10, B-29, C-11, E-5 and B-30, in the order B-29, C-10, C-11, E-5, B-30. B-30 is the base-rate disclosure only.
- E-5 trigger: the profit share must exceed 10% and NCI book ÷ consolidated equity value (EV less net debt and the other claims). This is the same as deducting the larger of book NCI and the profit share × consolidated equity value whenever the share is above 10%. It supersedes the notes' literal "NCI book ÷ total book equity", under which FCX's 37.6% book ratio would have kept it at book ($22.27).
- E-5: when the earnings key cannot be established, withhold the per-share value with an NCI-scope reason.
- B-30: state the base rate from the 2026-10-22 census beside the DCF headline and in METHODOLOGY.md.
- C-10: the equity model's 4-of-5 carry rule and the business-combination set-aside.
- C-10 follow-through: the explicit-period payout fades linearly from the three-year average in year 1 to the steady state 1 − g / ROE_T in year 10, clamped to 0–100%, so it converges to the payout the continuing value assumes (Damodaran's stable-growth consistency). ROE_T is the cost of equity plus any carry.
- House conventions introduced here:
  - the 5pp start gap, the 4-of-5 rule and the 10% business-combination threshold (C-10);
  - the ±5pp and ±1pp grid steps (C-11);
  - the 10% NCI materiality (E-5);
  - the dated base rate (B-30).

## Left for later

- NEE's trailing NCI income is not established in the keyless data. That is harmless while its DCF is outside the domain, but it will withhold the DCF once the utility route (B-13/A-3) gives it a domain-valid value.
- The E-5 key is the trailing four quarters. A one-off gain or impairment inside a subsidiary moves the NCI share for a year.
- NCI income tagged only as `MinorityInterestInNetIncomeLossOfConsolidatedEntities` or `NetIncomeLossAttributableToNonredeemableNoncontrollingInterest` is not read, so such an issuer's DCF would be withheld. No panel issuer is affected. Adding the synonyms changes extraction for every consumer of the NCI-income field.
- The payout fade starts from the three-year average (capped at 90%) and is linear. An insurer's capital needs do not bound retention. The P/TBV stable-growth cross-check keeps its own g, from the current return × the three-year retention.
- The base rate is a fixed 2026-10-22 panel. A new census is needed to update it, and its calibration (B-3) and the valuation band (B-33) are deferred.
