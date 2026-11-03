# Q4 DCF bias study: frozen-input diagnosis

Base: `62af738b`. Scope: the supplied 33-company frozen-input panel, replayed
offline after all 33 jobs completed. Twenty-six issuers are US companies; seven
foreign issuers belong to a separate task. No valuation inputs or guards changed.
The full working study, per-company paths, bridges, snapshot hashes and isolated
sensitivities are in the worktree's gitignored `tmp/q4-study.md` and
`tmp/q4-diagnostics.json`.

## Result and population

The current code publishes ten US general-route DCFs. Nine are below the frozen
quote, with a median gap of **−27.46%**; five are more than 30% below. Fifteen US
issuers are suppressed and TSLA is outside-domain. All seven foreign issuers are
suppressed. Before and after values, statuses and guards are identical.

| Issuer | Frozen price | DCF before / after | Gap | Terminal share of EV | WACC |
| --- | --- | --- | --- | --- | --- |
| MSFT | $507.12 | $451.92 / same | −10.88% | 65.71% | 9.55% |
| NVDA | $202.06 | $232.00 / same | +14.82% | 42.26% | 12.96% |
| AMZN | $245.63 | $127.99 / same | −47.89% | 65.03% | 10.30% |
| PG | $163.56 | $109.61 / same | −32.98% | 61.64% | 7.30% |
| KO | $95.83 | $42.46 / same | −55.69% | 59.93% | 7.32% |
| PEP | $140.42 | $109.61 / same | −21.94% | 56.73% | 6.90% |
| WMT | $127.69 | $42.58 / same | −66.65% | 60.00% | 7.89% |
| UNH | $400.44 | $360.71 / same | −9.92% | 57.18% | 7.56% |
| DIS | $113.11 | $67.08 / same | −40.69% | 59.09% | 9.35% |
| BA | $175.40 | $149.45 / same | −14.79% | 53.05% | 8.86% |

AAPL's earlier approximately $162 value cannot be reproduced from this panel
under this revision: its frozen debt inputs fail the carrying-value guard, so
WACC and DCF are withheld. MCD lacks a diluted divisor; XOM and CAT lack an NCI
earnings key. TSLA's explicit PV is negative and its terminal share is 555.88%.
These exclusions remain exclusions, not zero-valued observations.

The October 22 census of 18 is a different population with different inputs.
Its dated 16/18, median −53%, 15/18 more than 30% below disclosure is retained.
This study is not evidence that the old census improved by 25.54pp: sample
selection and data changes prevent that comparison.

## Isolated sensitivities

Each row uses the same ten published DCFs. Gap changes are percentage points of
the frozen price. The median paired change and the change in panel median can
differ because companies change rank. These are diagnostic alternatives, not
additive attributions or proposed defaults. WACC alternatives preserve terminal
excess returns over WACC; unknown historical ROIC leaves that company's base
assumption unchanged.

| Alternative | Panel median gap | Median paired gap change |
| --- | --- | --- |
| Baseline | −27.46% | 0.00pp |
| WACC −1pp | −10.28% | +13.48pp |
| Terminal RONIC at historical median where known | −21.63% | +4.96pp |
| Terminal RONIC at final NOPAT margin × sales-to-capital, at least WACC | −16.95% | +4.99pp |
| EBIT margin +1pp | −22.04% | +5.29pp |
| Sales-to-capital doubled | −24.00% | +3.94pp |
| Explicit horizon 15 years, with a longer growth and tax fade | −25.19% | +3.39pp |
| ERP 4.18% instead of frozen vendor 4.46% | −25.39% | +2.40pp |
| Linear growth fade after admitted consensus | −27.54% | +0.66pp |
| Terminal growth 3% instead of 2.5% | −25.86% | +0.64pp |
| Quote-implied shares instead of diluted divisor | −26.05% | +0.50pp |
| Current EBIT margin held flat | −23.36% | +0.21pp |
| Improving margin trend without the gross-minus-opex bound (approximate) | −16.41% | 0.00pp |
| Remove only the 5pp terminal excess-return cap | −26.66% | 0.00pp |
| Remove scenario margin cap from base rerun | −27.46% | 0.00pp |
| Remove sales-to-capital bounds | −27.46% | 0.00pp |
| Year-end rather than mid-year discounting | −30.36% | −3.23pp |
| No statement-to-quote roll-forward | −28.22% | −0.74pp |

All these alternatives remain below 3× price and introduce no domain failure
in the ten-company population. That safety screen alone does not justify them.

## Interpretation and decision

The model already uses ten explicit years, 2.5% terminal growth, the
`NOPAT × (1 − g / RONIC) / (WACC − g)` value-driver formula, mid-year discounting
and a quote-date roll-forward. Nine of the ten published DCFs admit consensus
through year four; DIS through year three. No sales-to-capital bound binds.
Removing a scenario ceiling after assumptions are built leaves the base
unchanged. The improving base margin target also uses that gross-minus-opex
bound during construction. A separate diagnostic, reconstructed from disclosed
rounded slopes while retaining the 45%/observed-margin guard, lifts AMZN by
14.92pp of price, DIS by 36.27pp and BA by 19.36pp; seven other values stay
unchanged. This is a material sensitivity for those three, not a common
correction. It assumes operating efficiency beyond the best observed ratio.
The frozen fiscal EBIT estimates do not establish a consistent GAAP/SBC basis;
BA's 2030 estimate margin is about 8.55%, below its current modeled 10.40%,
which also argues against a blanket trend extension.

SBC is expensed once inside EBIT;
the reported after-SBC FCF metric is not subtracted again from projected FCFF.

MSFT, NVDA, PG, KO and WMT already receive evidenced terminal excess returns.
The terminal input is **RONIC on new investment**, not an immediate reset of
returns on existing assets. The prior methodology wording confused those two;
the documentation now explains the distinction. [McKinsey's continuing-value
guidance](https://www.linkedin.com/pulse/dont-only-use-multiples-your-continuing-mbmtc)
supports both sustained excess RONIC and convergence to WACC, depending on
competitive advantage. [Damodaran, Investment Valuation, chapter 12](https://pages.stern.nyu.edu/~adamodar/pdfiles/valn2ed/ch12.pdf)
links stable growth to reinvestment and allows gradual transitions.

WACC is the largest sensitivity, but the frozen FRED DGS10 observation is
4.94% (October 30) and vendor US ERP is 4.46% (acquired November 3; vendor vintage
unknown). A lower rate needs independent evidence. Full historical average ROIC
is not automatically a sustainable marginal return. Raising all margins or
capital efficiency also needs issuer-specific evidence. The current growth
fade is a disclosed house assumption; standard practice does not prescribe a
single alternative fade shape. Five-to-ten-year forecasts and mature terminal
growth of 2–3% encompass the current settings.

No numerical replacement satisfies all four requested conditions. Retain the
calculations and clarify the documentation. This does not prove that market
prices are optimistic, or that the model is unbiased: only ten of 26 US issuers
publish, and that selection materially limits the conclusion. Missing debt,
lease, share and ownership evidence remains a separate coverage concern.

## Verification and pinning

The copied offline replay passed for all 33 snapshots. Supplemental checks
passed for exact base rerun identity, unchanged base values without scenario
caps or sales-to-capital bounds, and TSLA's retained domain failure. Focused
product tests passed: four files, 162 tests (base-rate disclosure, DCF valuation,
DCF domain, documentation lint). No production behavior changed, no fixture was
re-pinned, and no failing-first behavior test was needed. Full repository
verification is recorded in the worktree's completed study and final handoff.
