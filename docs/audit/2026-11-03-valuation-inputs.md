# Valuation inputs: D-188 frozen replay (2026-11-03)

This report supersedes the NVO, NKE and related input-dependent values in
[D-186's coverage report](2026-11-03-valuation-coverage.md). It implements
[D-188](DECISIONS.md#d-188---calibrated-foreign-revenue-proved-operating-income-and-corroborated-units-2026-11-03).
These are conditional model outputs, not investment conclusions.

The implementation branch is `t3/fix-valuation-inputs`. Its starting baseline
is `f26c786c`, after the required fast-forward of
`claude/verifier-valuation-polish`. Both replays use the same 33 frozen census
snapshots, full precision and saved configuration, through `runStageB` and
`validateBundle`. The database was opened only with `readonly: true` and
`fileMustExist: true`. No production data directory, provider, model, paid
service or external network was used. Dependencies came from the local npm
cache under Node 24.11.1. No market price was used to choose a forecast,
margin, discount rate, admission tolerance or resulting value. Market cap /
price is used only for the explicitly required share-unit corroboration and
the existing security-identity check; price comparisons and reverse solves
are diagnostics.

## Implemented rules and fail-first evidence

- **A, foreign analyst revenue totals.** Inheritance remains withheld under
  D-57 for ADRs and different reporting/listing currencies. When foreign
  valuation FX/security evidence is admitted, rows without their own currency
  may establish reporting-currency **total revenue** by comparison to filed
  annual revenue available at the snapshot cutoff. The latest overlap must
  agree within 3%; its listing-currency interpretation must disagree beyond
  6%, and FX must separate the readings beyond 6%. Every other overlap in
  the last three filed fiscal years must agree within 10%. Ordered revenue
  synonyms, core forms, issuer identity, acquisition cutoff and same-currency
  filed facts are required. Own-row currency wins. EPS, other per-share rows
  and targets gain no currency from this proof. The existing single FX
  translation, D-65 count/dispersion gates, D-60 precedence, calendarization
  and clamps remain the only valuation path. The year, estimate, filed amount
  and tolerances appear in notes and the manifest. Stage C applies the same
  helper to revenue only, retaining reporting-currency source amounts and
  explicitly leaving EPS unknown. The positive regression in
  `valuation.inputs.foreignConsensus.test.ts` failed first; controls cover
  listing-currency estimates, no overlap, future-only overlap, near-one FX,
  contradictory years, the 3% limit, explicit row currency and absent admitted
  foreign basis. Existing domestic currency tests remain authoritative.
- **B, operating-income basis and margin fallback.** Read D-164, D-179, the
  FIG/FIGR share/basis tests and the R2 expense review before changing the
  mixed-source guard. A provider numerator is admitted when it agrees with
  the existing SEC-derived numerator on the exact filed revenue basis, or
  when the retained original provider row pairs that exact numerator with
  revenue agreeing with filed revenue, for the same issuer, currency, fiscal
  period and filing date. An explicit revenue/operating-income refusal,
  mismatched interval, absent proof or contrary directly tagged operating
  numerator still refuses. Direct filed operating income remains first
  choice; FIGR's pre-interest provider numerator is never restored. Agreement
  with a retained provider revenue row proves that provider's operating
  presentation, not its expense classification. In particular JNJ's refused
  gross-profit cells remain refused. An exact gross-profit/SG&A bridge was
  evaluated (NKE's 4,798M - 3,910M = 888M), but no new inference of expense
  completeness from a partial expense line was needed or added.

  Guidance and the admitted trailing pair still lead. If unavailable, the
  latest admitted annual margin whose year ended within 15 calendar months
  of cutoff now precedes the five-year median. A median seed is explicitly
  historical rather than "current". The new admission, retained-row,
  annual-first and historical-median regressions failed first in
  `valuation.inputs.operatingBasis.test.ts`; controls retain different-basis,
  different-period, field-conflict, raw-revenue/raw-numerator mismatches,
  absent proof and refused-gross-profit cases. No existing pinned fallback
  expectation needed changing. One initial synthetic EBIT fixture used the
  wrong interest-tag spelling and aggregate sign; it was corrected to a real
  SEC-derived 200M observation before the passing run.
- **C, filer share-unit errors.** Only an existing, exact-period SEC share
  refusal is repaired in the calculation view. A direct fact multiplied by
  exactly 1,000 or 1,000,000 must match the retained provider count within
  0.1%, a filed DEI cover within 100 days of period end within 3%, and market
  cap / price within 3%. The direct fact, unit, accession, newest filed value,
  issuer, observed cutoff, period, single ordinary listing, currency and
  split history are checked. No correctly scaled fact is multiplied, no
  provider EPS is reconstructed, and stored statements/raw responses remain
  unchanged. Each repair has a manifest entry and valuation note. MCD's
  positive regression failed first in `valuation.inputs.shareUnits.test.ts`;
  wrong factors, conflicting/stale/future cover counts, capitalization
  disagreement and correctly scaled facts remain refused. An added future
  quote control also failed first before its cutoff guard.
- **D, stale immaterial NCI earnings key.** First read the latest same-period,
  same-currency filed IFRS consolidated profit and NCI allocation, or derive
  the allocation as consolidated profit less profit attributable to owners
  of the parent from one filing. A current key runs ordinary E-5. TSM's
  retained facts stop in FY2024 for both profit and parent allocation, so no
  FY2025 key can be derived. A last filed annual key may then size the test
  only within 24 calendar months of cutoff, with positive consolidated
  profit, absolute NCI profit share below 1% and book NCI below 1% of the
  computed consolidated equity value. Book NCI is deducted; missing
  allocations are never zero. Redeemable NCI and larger/older/invalid claims
  retain withholding. Both the stale-key regression in
  `stageB.nciEarningsKey.audit20261022.test.ts` and the current derived-key
  and stale integration regressions in `valuation.inputs.nci.test.ts` failed
  first. Controls cover mixed filings, age, future dates, large profit share,
  large book NCI, loss denominators and missing allocations. A further
  fail-first control prevents a contradictory newer allocation from being
  rescued with an older key (`red-nci-contradiction.log`).
- **E, optional issued-share cover.** Implemented. Only a nonstandard cover /
  quoted ratio whose cover equals filed issued shares in the same filing,
  period and unit within 0.1% may defer to an independently matched annual
  weighted-average construction establishing a standard ratio within 1%.
  Issued shares are explicitly not substituted for outstanding shares. Split,
  identity, acquisition, cap/price and other security gates remain in force.
  The positive test in `foreignCurrency.basis.test.ts` failed first; controls
  retain issued-count disagreement, mixed filings and absent/nonstandard
  weighted counts. SAP consequently resolves 1:1 and is valued. Its eight
  refused historical debt dates remain refused; the existing selection of
  complete current/bridge balances means none blocks this frozen current
  value. No debt-plausibility tolerance was changed.

Fail-first logs are retained under `tmp/int/panel/`: `red-ab.log` (four
failures), `red-retained.log` (retained-row and then-corrected derived fixture),
`red-cd.log` (two failures), `red-nci-derived.log` (two failures), `red-e.log`
(one failure), and `red-c-cutoff.log` (one failure). All new fixtures are
synthetic; the frozen provider bundles were not copied into tracked tests.

## Full before/after replay

Each cell shows **before → after**. Headline FV is the application's rounded
fair-value record; DCF/share retains full precision. WACC is percent, composite
is the application score. `—` means withheld. Existing values must be compared
to this fresh `f26c786c` baseline, not D-186's older baseline.

| Company | Headline FV, USD | WACC % | DCF/share, USD (full precision) | Composite |
| --- | --- | --- | --- | --- |
| AAPL | — → — | 9.528280114041308 → 9.528280114041308 | — → — | 60.06 C → 60.01 C |
| MSFT | 451.02 → 451.02 | 9.549742302058368 → 9.549742302058368 | 451.02339944998494 → 451.02339944998494 | 61.86 C → 61.86 C |
| NVDA | 232.05 → 232.05 | 12.95885083258794 → 12.95885083258794 | 232.0460530984197 → 232.0460530984197 | 76.84 B → 76.84 B |
| GOOGL | 248.77 → 248.77 | 9.81955733337749 → 9.81955733337749 | 248.76534450162427 → 248.76534450162427 | 60.36 C → 60.33 C |
| AMZN | 129.01 → 129.01 | 10.312353619112093 → 10.312353619112093 | 129.00715705057846 → 129.00715705057846 | 56.19 C → 56.19 C |
| META | 608.57 → 608.57 | 9.969854748260286 → 9.969854748260286 | 608.5738564955899 → 608.5738564955899 | 60.53 C → 60.23 C |
| JNJ | 153.25 → 154.12 | 7.436363468015166 → 7.436363468015166 | 153.25016843747767 → 154.12076758255077 | 49.37 D → 52.21 D |
| PG | 109.69 → 109.69 | 7.29803671884858 → 7.29803671884858 | 109.68849582015956 → 109.68849582015956 | 60.07 C → 60.07 C |
| KO | 42.48 → 42.48 | 7.3205855899739785 → 7.3205855899739785 | 42.47797485585954 → 42.47797485585954 | 56.44 C → 56.44 C |
| PEP | 109.84 → 109.84 | 6.89132816509964 → 6.89132816509964 | 109.84440801683365 → 109.84440801683365 | 55.93 C → 55.93 C |
| WMT | 43.62 → 43.62 | 7.769651061681092 → 7.769651061681092 | 43.624428024559144 → 43.624428024559144 | 53 D → 53 D |
| COST | 325 → 334.63 | 8.931592723228366 → 8.931592723228366 | 324.99677080730805 → 334.6288174360531 | 61.3 C → 61.64 C |
| HD | 197.42 → 197.42 | 8.44900749925144 → 8.44900749925144 | 197.41819679767607 → 197.41819679767607 | 54.96 D → 54.96 D |
| MCD | — → 182.45 | 6.9034307426760115 → 6.9034307426760115 | — → 182.4498771125117 | 62.18 C → 58.77 C |
| XOM | 94.76 → 94.76 | 7.455506213794611 → 7.455506213794611 | 94.76281303551492 → 94.76281303551492 | 52.61 D → 52.61 D |
| CAT | 290.52 → 290.52 | 10.175015150940576 → 10.175015150940576 | 290.5207121365569 → 290.5207121365569 | 55.71 C → 55.53 C |
| UNH | 360.63 → 360.63 | 7.565680277785453 → 7.565680277785453 | 360.63419622768913 → 360.63419622768913 | 54.03 D → 54.03 D |
| LLY | 595.71 → 769.86 | 7.647009830753421 → 7.647009830753421 | 595.7102104657257 → 769.8592617260745 | 57.8 C → 61.17 C |
| ORCL | — → — | 9.588647695219302 → 9.588647695219302 | — → — | 50.86 D → 50.84 D |
| NKE | 41.09 → 28.05 | 9.02809166297445 → 9.02809166297445 | 41.09429026490767 → 28.050635524407898 | 51.35 D → 53.8 D |
| DIS | 66.78 → 66.78 | 9.37546037514886 → 9.37546037514886 | 66.77967123099265 → 66.77967123099265 | 58.17 C → 58.17 C |
| INTC | — → — | 12.05959923537297 → 12.05959923537297 | — → — | 40.22 D → 40.22 D |
| VZ | 57.15 → 57.15 | 6 → 6 | 57.148453613631766 → 57.148453613631766 | 56.48 C → 56.48 C |
| TSLA | — → — | 12.075553882745574 → 12.075553882745574 | — → — | 58.71 C → 58.71 C |
| BA | 149.58 → 149.58 | 8.848327557252786 → 8.848327557252786 | 149.5752488428927 → 149.5752488428927 | 44.82 D → 44.82 D |
| EXPE | 257.8 → 257.8 | 9.75779687715621 → 9.75779687715621 | 257.79684427514513 → 257.79684427514513 | 63.11 C → 63.11 C |
| TSM | — → 408.42 | 11.330692169311364 → 11.330692169311364 | — → 408.42442643326206 | 73.02 B → 73.91 B |
| ASML | 962.15 → 882.67 | 10.065876860295035 → 10.065876860295035 | 962.1478841467142 → 882.6658770983291 | 67.47 C → 66.98 C |
| TM | — → — | — → — | — → — | 49.04 D → 49.02 D |
| NVO | 93.39 → 76.85 | 7.033602930834064 → 7.033602930834064 | 93.38750042770081 → 76.84979780857702 | 69.11 C → 68.51 C |
| SAP | — → 105.75 | — → 8.564138377532657 | — → 105.75029277139562 | 59.81 C → 56.5 C |
| SONY | — → — | — → — | — → — | 56.91 C → 56.91 C |
| BABA | — → — | — → — | — → — | 49.39 D → 49.39 D |

Coverage is **23 → 26 of 33**. Every existing numeric WACC is unchanged; SAP alone gains WACC. Exactly these 15 companies change at least one requested metric:

- **AAPL:** Additional admitted annual operating-margin history changes the fundamentals margin slope from 0.9338425922042694 to 0.8818609101546494pp/year; its debt refusal and value remain unchanged.
- **GOOGL:** Additional admitted historical operating income changes the annual margin slope from 1.0918771126876667 to 1.0410369882548374pp/year; current DCF and WACC are unchanged.
- **META:** Additional admitted annual operating-margin observations change the slope from -0.5783832207455926 to -0.9685610686633751pp/year; current DCF and WACC are unchanged.
- **JNJ:** Admitted trailing operating income replaces the five-year-median seed with the existing one-off-normalized trailing margin and unlocks EBITDA/leverage/coverage observations, while admitted annual history changes the margin trend.
- **COST:** Additional admitted annual operating-income history raises the DCF median margin target from 3.5413697062064298% to 3.6490039417888567%, and expands historical EV/EBITDA from 12 to 15 quarters, changing both DCF and valuation rank.
- **MCD:** Independent exact-million share-unit proof restores diluted denominators and current per-share valuation, while the restored annual count history changes the leadership share trend.
- **CAT:** Newly admitted historical operating income expands EV/EBITDA history from 15 to 17 quarters and changes its valuation percentile from 79.30379270388605 to 81.89081861590029; current DCF and WACC are unchanged.
- **LLY:** Admitted trailing operating income replaces the median margin seed with 46.06694270315283% TTM and unlocks EBITDA/leverage/coverage plus annual margin-history observations.
- **ORCL:** Additional admitted annual operating-margin history changes the slope from -0.6740323116432091 to -0.7027746247224144pp/year; its DCF remains outside the existing domain.
- **NKE:** Admitted trailing and annual operating income replaces the 11.9181% median seed with the existing normalized 8.306639646117976% TTM seed, and unlocks EBITDA, latest annual ROIC, quality/moat and coverage observations.
- **TSM:** Calibrated reporting-currency revenue supplies the existing consensus growth path, while the immaterial FY2024 filed allocation authorizes the book NCI deduction and restores per-ADS valuation.
- **ASML:** Calibrated reporting-currency revenue replaces historical extrapolation with the existing calendarized consensus path; WACC and margin inputs are unchanged.
- **TM:** Additional admitted annual operating-margin history changes the fundamentals slope from 0.2086107892637932 to 0.19434869765538082pp/year; its current security-basis refusal remains.
- **NVO:** Calibrated DKK revenue replaces historical extrapolation with the existing consensus path, including its -10% year-one clamp; WACC and operating margins are unchanged.
- **SAP:** Same-filing issued-cover proof plus the independent 1:1 weighted count establishes the foreign valuation basis, enabling USD WACC, calibrated revenue consensus and current DCF; historical debt refusals remain excluded.

The other 18 companies are identical in headline fair value, numeric WACC, full-precision DCF/share and composite. No company errored in either replay.

## Sanity checks at the frozen quotes

Values and sensitivity figures below use unrounded DCF/share; upside is
recomputed from that figure (the UI headline upside uses rounded headline
FV). All eight first-year growth sources are the existing calendarized
consensus path. Terminal share is discounted terminal value / EV. A positive
1pp shock holds every other input fixed. Re-running `runDcf` from each saved
assumption/bridge pair reproduced base DCF/share to at least nine decimal
places before the shocks. No sensitivity changes the stored base case.

| Company | Quote USD | DCF/share USD | Upside % | WACC % | Year-one growth % / source | Seed margin % | Terminal share % | Reverse growth % / base % | Value at WACC +1pp / -1pp |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| NVO | 40.105 | 76.849798 | 91.621488 | 7.033603 | -10.000000 / consensus | 43.134071 | 64.470617 | < -20 (no bracket) / -10.000000 | 62.902408 / 98.645233 |
| NKE | 38.22 | 28.050636 | -26.607442 | 9.028092 | -7.382774 / consensus | 8.306640 | 54.539949 | 5.952148 / -7.382774 | 24.482796 / 32.911407 |
| LLY | 1418.12 | 769.859262 | -45.712686 | 7.647010 | 13.157213 / consensus | 46.066943 | 58.979226 | 36.284180 / 13.157213 | 642.612396 / 957.251008 |
| JNJ | 267.5 | 154.120768 | -42.384760 | 7.436363 | 5.053894 / consensus | 26.583782 | 60.160655 | 27.739258 / 5.053894 | 126.892730 / 194.976114 |
| ASML | 1548.6 | 882.665877 | -43.002333 | 10.065877 | 38.835791 / consensus | 38.551940 | 48.730911 | 62.706100 / 38.835791 | 787.212568 / 1006.808627 |
| TSM | 403.42 | 408.424426 | 1.240500 | 11.330692 | 43.427839 / consensus | 57.966462 | 51.382765 | 42.891840 / 43.427839 | 364.781845 / 463.384585 |
| MCD | 263.29501 | 182.449877 | -30.705152 | 6.903431 | 2.035543 / consensus | 46.218821 | 55.973616 | 13.774414 / 2.035543 | 145.065872 / 241.153200 |
| SAP | 230.64 | 105.750293 | -54.149197 | 8.564138 | 12.880317 / consensus | 27.414093 | 62.918730 | 54.965820 / 12.880317 | 90.619670 / 126.938971 |

Margin bases and individual assessments:

- **NVO:** fade current 43.13% (TTM) -> 42.28% by year 5 under stable dated-margin regime (5y median 42.28%, slope 0.12pp/year), flat thereafter. **Flagged.** Arithmetic and currency/security bridges are consistent, but this is defensible only as a heavily qualified historical-economics case, not a persuasive central forecast: -10% year-one growth still leads to about 42% terminal margin at 7.03% WACC, +91.62% upside, and reverse growth below the -20% search range (the fallback implied terminal margin is 21.749267578125%); an independently supported outlook and downside analysis remain necessary.
- **NKE:** held flat at current 8.31% (TTM, excluding tagged one-off items) under declining dated-margin regime (5y median 11.55%, slope -1.58pp/year). **Defensible as a conditional model output.** Consensus contraction and a normalized trailing margin replace the obsolete median seed; the model still assumes its existing consensus recovery path and cash reinvestment convention.
- **LLY:** held flat at current 46.07% (TTM) under improving dated-margin regime (5y median 31.61%, slope 4.26pp/year); the target 46.15% is capped at the issuer's highest sustained margin (the last five fiscal years and the TTM), 46.07% (TTM ending 2026-09-30) (house broken-input guard; it binds year 5 onward, not year one). **Defensible as a conditional model output.** The 46.07% seed now reflects admitted trailing earnings; holding that unusually high margin and fading the consensus growth path remain material assumptions, with a wide WACC sensitivity.
- **JNJ:** fade current 26.58% (TTM, excluding tagged one-off items) -> 26.6% by year 5 under stable dated-margin regime (5y median 26.6%, slope -0.02pp/year), flat thereafter. **Defensible as a conditional model output.** Its 26.58% seed includes existing tagged one-off normalization, and the provider presentation is proved by the retained revenue pair while expense-classification refusals remain; the -42.38% quote gap is reported without changing assumptions.
- **ASML:** fade current 38.55% (TTM) -> 32.81% by year 5 under stable dated-margin regime (5y median 32.81%, slope 0.02pp/year), flat thereafter. **Defensible as a conditional model output.** Currency-calibrated consensus supports the first-year level, but 38.84% initial growth, fade to 32.81% margins and the existing reinvestment cap are substantive conditions; reverse growth is 62.71% in the same path family.
- **TSM:** held flat at current 57.97% (TTM) under improving dated-margin regime (5y median 45.68%, slope 1.59pp/year); the target 57.97% is capped at the issuer's highest sustained margin (the last five fiscal years and the TTM), 57.97% (TTM ending 2026-09-30) (house broken-input guard; it binds year 5 onward, not year one). **Defensible as a conditional model output.** The 5:1 ADS basis, single FX rate and book NCI bridge reconcile; 43.43% growth and 57.97% sustained margin remain demanding conditions, and the NCI allocation is explicitly stale rather than a new current-year measurement.
- **MCD:** held flat at current 46.22% (TTM) under improving dated-margin regime (5y median 45.19%, slope 0.78pp/year); the target 47.83% is capped at the issuer's highest sustained margin (the last five fiscal years and the TTM), 46.22% (TTM ending 2026-06-30) (house broken-input guard; it binds year 5 onward, not year one). **Defensible as a conditional model output.** The independently corroborated unit correction establishes the denominator; the existing 46.22% margin and 6.90% WACC drive value, with material sensitivity to a 1pp rate shock.
- **SAP:** fade current 27.41% (TTM) -> 20.03% by year 5 under stable dated-margin regime (5y median 20.03%, slope -0.09pp/year), flat thereafter. **Defensible as a qualified conditional model output.** Issued-share cover treatment is explicit and the current model uses complete admitted balances; eight historical debt dates remain refused, and the 14.252612154593237% effective cost of debt, 27.41% trailing margin fading to 20.03% and consensus growth remain material conditions.

## Downstream propagation and limits

| Company | Current EV/EBITDA before → after | Latest annual ROIC % before → after | WACC coverage ratio before → after |
| --- | --- | --- | --- |
| NKE | — → 12.448806599818665 | — → 23.46797653679241 | 78.84 → 19.155778894472363 |
| JNJ | — → 21.314279696339565 | — → — | 26.25231719876416 → 33.09147869674185 |
| LLY | — → 32.82316081480141 | — → — | 33.07179680623664 → 33.81188455008489 |

Operating-income admission propagates to TTM EV/EBITDA, leverage and interest
coverage, annual ROIC and historical margin points through their existing
consumers. NKE gains latest annual ROIC and quality/moat observations. JNJ and
LLY still lack a complete admitted capital basis for latest annual ROIC;
their annual filed operating leases exceed the vendor's zero lease line, so
those debt/capital inputs remain refused. Income admission does not
manufacture them. Historical EV/EBITDA sample changes
and annual margin slopes explain the other composite changes listed above.
No downstream score was suppressed to make the replay look smaller.

TSM's retained FY2024 allocation is -TWD 856.3M / TWD 1.1575239T, an
absolute earnings share of 0.073977%; translated book NCI is 0.065467% of
the computed consolidated equity value. Both are below the separate 1%
fallback limits. This is a disclosed stale sizing test, not a claim to have
measured the latest fiscal year's allocation.

NKE's raw TTM margin is approximately 8.20%; its 8.3066% model seed excludes
existing tagged one-off items. JNJ's raw margin is approximately 25.70%; its
26.5838% model seed likewise uses the existing one-off normalization. LLY's
46.0669% seed is admitted TTM. Those are existing normalization rules, not new
margin forecasts. NVO's first year hits the existing -10% clamp; admitting
currency does not remove that clamp or establish consensus quality beyond
the existing gates. The retained long-term path, approximately 42% margins
and 7.03% WACC still produce a large price gap.

No alternative model was added for ORCL/TSLA's DCF-domain refusal, INTC/SONY's
loss overlay, or unresolved debt/security evidence for AAPL, TM and BABA.
SAP's historical debt refusals are retained. No version constants or stored
report bytes changed.

## Verification and release stamps

The broader focused verification passed **13 files, 639 tests** before the
additional NCI contradiction/split controls. The expanded five-file input
suite then passed **59 tests**, including per-file risk coverage for all new
helpers: share-unit fact proof 91.42% statements / 86.88% branches / 100%
functions / 95.23% lines; calculation-view share admission 96.87% / 88.88% /
100% / 100%; filed NCI key 100% / 96% / 100% / 100%. Earlier broader checks
found an optional-field compatibility error in the share helper on legacy
synthetic bundles; it was fixed, and the affected 67 tests passed. No old
numerical golden or fallback-order expectation was repinned.

The first complete-command attempt passed dependency checks, typecheck and
lint, then stopped at the source-inventory test: 15,253 product tests passed,
one failed and three were skipped. The three new helpers had not yet been
placed in the risk manifest. All three were added to both explicit inventories
and their existing per-file coverage floors were verified without relaxing
any threshold. That incomplete command is not reported as a verification pass
(`verify-inventory-failure.log` / `.exit`).

**Full `npm run verify`: passed, exit 0**, under Node 24.11.1, with the
installed npm CLI as `npm_execpath`, offline npm, disabled Next telemetry,
and scratch `METIS_DATA_DIR` / `METIS_DB_PATH`. The tree was not edited while
the command ran. Dependency shape, typecheck and lint passed. Product tests:
**673 files, 15,261 tests passed, 3 skipped**. Integration: **4 tests passed**.
Both coverage runs repeated all 15,261 product tests successfully and met
every aggregate and per-file floor. Core: **97.63% statements / 93.22%
branches / 99.09% functions / 98.71% lines**. Risk: **96.07% / 91.30% /
98.27% / 98.06%**. Production build passed. The security audit returned
**0 vulnerabilities with `npm_config_offline=true`**; this is an offline
result, not a newly fetched registry-advisory assessment. No known timing
flake or timeout retry occurred in the final full run.

The final NCI contradiction guard was followed by another complete
33-company replay (`final-audit.json`), identical to the reported after
replay at full precision in every compared metric. The eight base-value
reproductions and fixed-input ±1pp WACC reruns passed. Full command logs and
exit code remain in `tmp/int/panel/verify-complete.log` / `.exit`; all replay,
sanity and fail-first evidence remains under that scratch directory.

Required integration stamps: **Stage B, fair-value method, scenario-target
method and PAYLOAD_VERSION**. Numeric outputs, score drivers and deterministic
payload currency/disclosures change. No additional report-spec or
PIPELINE_VERSION bump is required by D-188 because orchestration, schema and
prompts are unchanged. D-187 independently requires a pipeline stamp for its
verifier changes; the integrator should include that requirement. All
constants were deliberately left untouched here.
