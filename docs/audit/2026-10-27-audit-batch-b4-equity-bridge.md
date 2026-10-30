# Audit batch B4: the equity bridge, EV and invested capital count every claim once (2026-10-27)

Base: `55dc846` (main after batch B13, PR 75). Scope: part A of batch B4 of the independent audit of 2026-10-27, "B4a": the DCF equity bridge, the market and REIT enterprise values, invested capital (ROIC, sales-to-capital and its filed history) and the per-share divisor. Decision: D-135 in [DECISIONS](DECISIONS.md) (next after B13's D-134; renumbered at merge if another batch lands first). Stamps: report 1.50.0, payload 1.52.0, Stage B `STAGE_B_2026_10_ACCOUNTING_EVIDENCE_31`, `FAIR_VALUE_2026_10_D135` and `SCENARIO_TARGETS_2026_10_D135`, and the frozen `BRIDGE_METHOD_SINCE_SPEC_VERSION` "1.50.0" (all next after the preceding merge; renumbered at merge together). The plan is [the B4 plan](../superpowers/plans/2026-10-27-audit-fix-04-equity-bridge-and-invested-capital.md); it holds both parts, and part B (B4b: convertibles, equity-method stakes and fair-value financial assets) is a separate pull request. The audit evidence folders stay out of the repository.

This change made no model calls and no paid provider calls. The before-and-after proof below replays stored run inputs offline, behind a dead proxy, with no database opened. Every test builds its inputs inline from the tags and figures of public SEC filings or from synthetic bundles.

## Part A (B4a)

### Disposition

Every finding was made to fail by a test first, then fixed in its own commit. A finding whose test could not be made to fail at the base would have been skipped and reported; none was.

| Finding | Severity | Fixed in | Test file | Stored-report impact |
|---|---|---|---|---|
| FIN-103 The DCF bridge read the newest quarter while an annual base was rolled forward | Low | Task 1 | `tests/stageB.bridgeBalance.audit20261027.test.ts` | none |
| FIN-119 Redeemable (temporary) equity never reached the bridge or any EV | High | Task 2, and the replay regression fix below | `tests/stageB.temporaryEquity.audit20261027.test.ts`, `tests/stageB.redeemableNciCashOwnership.test.ts` | needs reinterpretation (display note) |
| FIN-119-V1 Invested capital left out the temporary equity whose cash it nets | Medium | Task 3 | `tests/stageB.temporaryEquityCapital.audit20261027.test.ts`, `tests/stageB.temporaryEquity.audit20261027.test.ts` | needs reinterpretation |
| FIN-119-V2 The REIT block's own EV left out temporary equity | Low | Task 12 | `tests/stageB.reitOneMarketCap.audit20261027.test.ts` | none |
| FIN-303 Sales-to-capital kept the operating lease inside invested capital while the bridge removed it | High | Task 4 | `tests/stageB.leaseBasisCapital.audit20261027.test.ts` | needs reinterpretation |
| FIN-303-V1 ROIC removed an enriched lease without the CODE-1 proof | Medium | Task 4 | same, and the re-pin in `tests/stageB.growth.returns.capital.test.ts` | needs reinterpretation |
| FIN-108 The REIT EV removed the lease without the CODE-1 proof | Low | Task 12 | `tests/stageB.reitOneMarketCap.audit20261027.test.ts` | none |
| FIN-304 A holding larger than invested capital was valued at zero | Medium | Task 5 | `tests/stageB.investmentsAboveCapital.audit20261027.test.ts` | none |
| FIN-305 Pension and OPEB deficits never reached the bridge | High | Task 6 | `tests/stageB.debtLikeObligations.audit20261027.test.ts` | needs reinterpretation |
| FIN-305-V1 Litigation and loss-contingency accruals never reached the bridge | Medium | Task 6 | same | needs reinterpretation |
| FIN-305-V2 Contingent consideration (earn-outs) never reached the bridge | Low | Task 6 | same | needs reinterpretation |
| FIN-403 A successor registrant did not read its predecessor's retirement obligations | Medium | Task 7 | `tests/stageB.successorObligations.audit20261027.test.ts` | needs reinterpretation |
| FIN-404 A loss quarter divided by a count with no option or RSU dilution | Medium | Task 9 | `tests/stageB.lossPeriodDivisor.audit20261027.test.ts`, `tests/stageB.issuerEconomicDilutedShares.audit20261022.test.ts` | needs reinterpretation |
| FIN-109 A finance-lease-only total was called a combined operating and finance figure | Low | Task 13 | `tests/stageB.financeLeaseOnly.audit20261027.test.ts` | display-only |
| FIN-311 The REIT block priced the company on price times the diluted count | Low | Task 12 | `tests/stageB.reitOneMarketCap.audit20261027.test.ts` | display-only |

Batch tasks: Task 14 pins the cross-consumer invariants (`tests/stageB.countEveryClaimOnce.audit20261027.test.ts`); Task 15 marks legacy DCF, excess-return and REIT values on display (`src/report/legacyBridgeMethod.ts`, `tests/report.legacyBridgeMethod.test.ts`); Task 16 moves the stamps (`tests/report.versionStamps.test.ts`); Task 17 re-pins the payload golden (`tests/stageC.payload.passes.test.ts`); Task 18 records the intended deltas on the audited DEMO fixture (`tests/fixtures/audit-intended-deltas.json`).

Re-pins, each naming its finding in the test: the five E-7 pins in `tests/stageB.debtLikeObligations.audit20261022.test.ts` (before tax to after tax at the D-98 rate, FIN-305; for example -586 to -498.1); the REIT P/FFO pin in `tests/stageB.financialValuation.test.ts` and the REIT lease pins in `tests/stageB.valuation.test.ts` (FIN-311, FIN-108); the lease fixture in `tests/stageB.growth.returns.capital.test.ts` (FIN-303-V1); the stamps in `tests/jobRunner.test.ts`, `tests/report.versionStamps.test.ts`, `tests/stageB.dcfDomain.audit20261022.test.ts`, `tests/fairValue.degradedInputs.test.ts`, `tests/stageB.dcfDisplay.test.ts` and `tests/stageB.fairValue.test.ts`; the payload golden (payload 1.52.0).

A replay regression found after the figure code was final was fixed before this note: Tesla's P/FCF was withheld by a 54M redeemable noncontrolling interest, a claim 0.004% of its market cap, because the P/FCF cash-ownership guard gave redeemable NCI no materiality test while book NCI had one (audit SNOW-2). A redeemable NCI is the same claim as book NCI, so inside that guard it now takes the same floor: it withholds unless the book NCI is known and the book and redeemable NCI together, and the NCI income, are each at most 1% of consolidated equity. A redeemable preferred, an unsplit amount or a refused operand withholds at any size, as permanent preferred does. With no redeemable NCI the behaviour is the one at main, byte for byte. Test: `tests/stageB.redeemableNciCashOwnership.test.ts` (red at the previous head, green now; its controls cover book NCI under and over the floor).

### Owner decisions

The owner delegated these calls ("Use your recommendation based on research to make this a professional accurate repository"). Each has its sources, rejected alternatives and revised entries in D-135; the sources below are as the plan recorded them on 2026-10-27 and 2026-10-28, and were not re-fetched when this note was written (no network). OD-2, OD-5 and OD-9 are B4b's.

| Decision | What it rules | Sources |
|---|---|---|
| OD-1 Redeemable (temporary) equity | One house definition of claims senior to common: permanent and redeemable preferred, and book and redeemable NCI. The bridge deducts redeemable preferred beside preferred; redeemable NCI joins book NCI as the book floor of the E-5 test, so it is never deducted twice. The market, own-history and REIT EVs add both. Invested capital adds the admitted total. The claims reach the forecast-EPS, P/FCF and own-history ownership guards. | Deloitte Roadmap, *Noncontrolling Interests* 9.4 and *SEC Comment Letter Considerations* 2.16; Koller, Goedhart and Wessels, *Valuation*, 7th ed., ch. 16 |
| OD-3 Lease basis for invested capital | Extends D-25 and D-97 item 3: on the default switch every invested-capital consumer removes the operating-lease slice exactly when the bridge does (positive, at most total debt, CODE-1 proof), through one shared predicate. | CBIZ on ASC 842 and valuation; D-25 |
| OD-4 Debt-like obligations beyond E-7 | Pension and OPEB deficits, loss-contingency accruals and contingent consideration join E-7's lines. All five families are deducted after tax at the D-98 marginal rate (`net x (1 - rate)`), which revises E-7's before-tax choice (decided by the main session on the owner's delegation, decisions spec 4.3). A rate-regulated utility's pension and OPEB deficit is disclosed, not deducted (ASC 980). | Hexion FY2017 10-K (ASU 2017-07); FE Training, "Pensions and OPEBs" and "Debt Equivalents"; IB Interview Questions on pensions; 26 U.S.C. sections 404(a), 461(h) and 162(f)(1); Porte Brown on earn-out basis; Hectelion glossary; Feldstein, "Private Pensions as Corporate Debt" (NBER, 1982, pp. 75-90), cited by its citation and not re-checked here |
| OD-6 A holding above invested capital | Always add the holding back at carrying value less the D-98 tax; when removing it leaves no positive operating capital, sales-to-capital takes the house cap 5.0. | D-65's principle; Damodaran, "Holdings in Other Firms" |
| OD-7 The divisor in a loss period | The loss row's basic count plus the newest award-dilution increment from a profitable period (dated and disclosed). | Deloitte Roadmap, *Earnings per Share* 8.7; ASC 260-10-45-17 to 45-20 |
| OD-8 One REIT market cap and EV | The REIT block takes its market cap and EV from the multiples framework; P/FFO and P/AFFO are market cap over FFO at both sites. | Deloitte Roadmap 9.4; `docs/METHODOLOGY.md` ("a report carries one EV") |

Pre-flight rulings these decisions took (the plan's "Pre-flight amendments"):

- I1: temporary equity is present at main for UNH, WMT, TSLA, T and CMCSA (all redeemable NCI) and, in history years, NEE, DIS and CVX, so the movers are expected and measured.
- I2: a null book NCI is never read as 0 plus the redeemable NCI. When book NCI is null and a redeemable NCI is filed, the per share is withheld under E-5 and the reason names the redeemable NCI.
- I3: a refused temporary-equity year is a non-debt refusal in ROIC's existing refusal list, so it never turns R0's WACC-balance critical rule on.
- I6: when the lease leaves debt and invested capital is not positive, sales-to-capital takes the issuer's own history on the same basis (at least three usable years) or the DCF is withheld; it never falls back to the mixed basis.
- I7: pension and OPEB deficits of a rate-regulated utility are disclosed, not deducted. The six SIC codes are 4911, 4923, 4924, 4931, 4932 and 4941, exactly those the repository's SIC map sends to a regulated or diversified utility; an unknown SIC is read as not a utility, with an info gap when a pension line is deducted.
- One lease basis per A-2 median: a history year whose scope is unproven cannot be put on the lease-excluded basis and is left out of the median with a note, never kept lease-inclusive beside lease-excluded years.
- The pension look-back runs date first: candidate dates newest first, and at each date the families (a), (b), (c) in order; the first date with any family filed gives the reading, and a family filed as zero ends the look-back.

### Before and after

Measured on stored run inputs, offline: `main` is `55dc846` (post-B13); the branch is the head with the stamps and the replay regression fix. Census rows are rebuilt from each snapshot's own companyfacts with that side's builder, then enriched (a fresh run's shape); the evidence inputs (AMZN #43, NVDA #48 to #50, MU #46, Realty Income 2026-10-19) are replayed on their stored rows, and AMZN #51 through the final admitted snapshot. 149 Stage B runs per side. **Where the plan's estimates differ from these measurements, the measured value is the one stated.**

| Input | Measured main to branch | Task | Why it moved |
|---|---|---|---|
| AMZN #51 | sales-to-capital 1.4148 to 1.7163; DCF per share 116.1225 to 124.1426 (+6.91%) | 4 | covered operating lease left invested capital |
| AMZN #43 | 1.1561 to 1.3499; 83.4044 to 86.3772 (+3.56%) | 4 | same |
| AMZN census | 1.4148 to 1.7163; 98.8137 to 101.8115 (+3.03%) | 4 | same |
| NVDA #48 (#49, #50 identical) | 2.5825 to 2.7093; 229.5236 to 230.2319 (+0.31%) | 4 | same |
| HD | 2.1943 to 2.509; 212.0405 to 214.7853 (+1.29%) | 4 | same |
| WMT | 4.4133 to 4.8889; 42.6711 to 43.2402 (+1.33%); NCI claim 6.27B to 6.56B | 4, 2 | lease slice; 0.293B redeemable NCI at 2026-07-31 (equity -$0.037 a share) |
| NFLX | 1.2936 to 1.374; 38.4891 to 38.7598 (+0.70%) | 4 | lease slice |
| MSFT | 0.7245 to 0.761; 312.9395 to 315.0518 (+0.67%) | 4, 6 | lease slice; loss accrual 0.553B (after tax 0.437B) |
| GOOGL | 1.1511 to 1.2073; 215.4254 to 215.5926 (+0.08%) | 4, 6 | lease slice; current-only loss accrual 17.356B (after tax 13.711B) |
| VZ | 0.5 to 0.5183; 64.5267 to 62.6106 (-2.97%) | 4, 6 | pension deficit 11.758B at 2026-06-30 (after tax 9.289B); EV +1.297B |
| NVDA census | 1.8546 to 1.9192; 434.0011 to 435.5766 (+0.36%) | 4 | lease slice |
| CAT | 1.349 to 1.367; 245.6686 to 239.9938 (-2.31%) | 4, 6, 1 | pension family (a) 3.838B at 2025-12-31 (the 2026-06-30 10-Q tags no total debt, so the bridge uses that balance; info gap `valuation.dcf.bridgeBalanceDate`), after tax 3.032B |
| BA | 33.7013 to 27.7411 (-17.69%); divisor 790.6M to 793.1M | 6, 9 | pension and OPEB 6.135B at 2026-06-30 (after tax 4.847B); environmental accrual 0.971B now after tax; the loss quarter's divisor takes +2.5M of award dilution from the fiscal year ending 2025-12-31 (-$0.09 of the move) |
| JNJ (post-B13 baseline) | 141.1801 to 136.9259 (-3.01%) | 6 | pension 6.957B at 2025-12-28, loss accrual 5.500B and earn-out 0.729B at 2026-09-27: 13.186B, 10.417B after the 21% relief |
| FCX | 17.0968 to 17.3209 (+1.31%) | 6 | ARO 3.836B and environmental 2.018B now after tax (+1.2B relief), pension 0.918B (after tax 0.725B); the relief raises consolidated equity, so the earnings-share NCI claim rises 0.181B |
| DUK | 36.6371 to 36.6627 (+0.07%) | 6 | environmental accrual 0.095B now after tax; pension 0.384B disclosed, not deducted (SIC 4931; info gap `valuation.dcf.debtLikeObligations.rateRegulated`) |
| XOM | equity value 817.37B to 800.32B (-2.09%) | 6, 7 | the two lines below |
| CVX | 195.2069 to 195.3115 (+0.05%) | 6, 3 | ARO and environmental now after tax (+3.15B), pension 3.932B (after tax 3.106B); FY2023 redeemable NCI 0.166B enters ROIC history |
| PEP | 133.9472 to 133.9403 (-0.01%) | 6 | earn-out 0.012B |
| UNH | 395.2499 to 393.637 (-0.41%); ROIC 11.15 to 10.9313 | 2, 3 | 1.436B redeemable NCI at 2026-06-30: equity -$1.585 a share and capital -$0.028 |
| TSLA | DCF equity 36.13B to 43.94B; market EV 1492.81B to 1492.86B; sales-to-capital 1.7264 to 1.9427; per share null on both; **P/FCF 264.90 unchanged from main** | 4, 2 | lease slice; 0.054B redeemable NCI joins the NCI claim and the market EV. After the replay regression fix P/FCF publishes as at main with no `cashOwnership` gap (it was withheld before the fix) |
| MCD | equity value +4.158B (+2.56%); sales-to-capital 0.525 to 0.729 | 4 | lease slice (not in the plan's table) |
| CSCO | 47.6050 to 47.7796 (+0.37%) | 4 | lease slice (not in the plan's table) |
| NEE | equity value -29.71B to -29.64B; fails the DCF domain on both sides | 3, 4 | history-year redeemable NCI (not in the plan's table) |
| MU #46 | EV basis text names the finance-lease total as a finance lease; copies of "operating slice is not" in the Stage B object 5 to 0 | 13 | no number moves |
| O, AMT, NNN, PLD | P/FFO 13.3455 to 13.5105, 17.3613 to 17.35, 12.0911 to 12.2384, 20.5206 to 19.98; REIT EV equals the multiples EV: +0.77%, -0.04%, +0.74%, -2.01% | 12 | one market cap in the REIT block. Differs from the plan: PLD's multiples EV is 157.28B on rebuilt rows, not null |
| Unchanged bit for bit | AAPL, BAC, BRK.B, INTC, JPM, KO, LLY, MA, META, PG, PGR, SNOW, TSM, V | none | |
| COST, EXPE | headline figures unchanged; COST's clamp-note raw ratio 12.28x to 13.73x (text only, Task 4); EXPE's ROIC history moves by 0.01 (Task 3) | 4, 3 | owned, though the plan listed them as unchanged |

XOM, line by line (equity value, because the stored diluted count is null on the 2026-06-30 row): main 817.371B, branch 800.318B, change -17.0529B. The asset-retirement obligation is the predecessor's `AssetRetirementObligation` of 12.518B at 2025-12-31 (10-K filed 2026-02-18), after tax 9.889B (Task 7); the pension and OPEB deficit is the successor's own `PensionAndOtherPostretirementDefinedBenefitPlansLiabilitiesNoncurrent` of 9.068B at 2026-06-30, after tax 7.164B (Task 6). The two lines sum to the measured change exactly. Every DCF mover's equity change closes to a zero residual against the five bridge terms (EV, net debt, preferred, NCI claim, non-operating assets).

Task 9 (FIN-404): only BA's divisor moves, and its first forecast-EPS value is withheld on both sides by the NCI ownership guard. Task 12 (FIN-311, FIN-108, FIN-119-V2): the four REITs above. No stored REIT carries the redeemable-OP-unit trigger; it is proved by `tests/stageB.reitOneMarketCap.audit20261027.test.ts`.

**Band moves** (59 runs): no composite band moves. Aspect bands: VZ valuation B (71.11) to C (69.62); NVDA #48, #49 and #50 valuation C (69.91) to B (70.17). The plan expected nine movers to sit at the valuation floor of 15.0; only BA does (CAT and JNJ 16.50, the others higher), and no grade moves for any of them.

**Gaps.** New info gaps: BA `valuation.perShare.lossPeriodDivisor`, CAT `valuation.dcf.bridgeBalanceDate`, DUK `valuation.dcf.debtLikeObligations.rateRegulated`. AMZN's warn gap `valuation.reverseDcf.growthBracket` is gone because the higher DCF value lets the reverse DCF solve. No issuer gains or loses a DCF-domain failure (only NEE and TSLA fail it, on both sides).

**The replay re-run after the P/FCF fix** (branch before and after, same inputs): TSLA's P/FCF returns to 264.90 and its `cashOwnership` gap is gone; CMCSA's `cashOwnership` gap is gone too and its P/FCF stays null for the reasons it was null at main. The P/FCF history gap counts fall in the same guard before and after that fix (retained windows excluded for outside ownership: CVX 18 to 4, TSLA 14 to 12, CMCSA 19 to 9). Against main, which is the comparison that matters, the counts are CVX 4 to 4, TSLA 9 to 12 and CMCSA 6 to 9: TSLA's three newly excluded windows (2025-06-30, 2025-09-30 and 2025-12-31) all contain the 2025-03-31 quarter, where book NCI 0.703B plus redeemable NCI 0.062B is 0.765B, above the 1% floor of 0.754B while book alone (main) passed. This follows the combined-floor rule and moves no figure or score (neither issuer has a P/FCF own history on either side). The matching warn texts change with it. No other figure, score or band changes; the only other difference is the method stamps.

**Not shown by replay.** FIN-304's holding above invested capital (`tests/stageB.investmentsAboveCapital.audit20261027.test.ts`), FIN-404's divisor beyond BA, and FIN-119-V2's OP units are proved by their tests. AMZN #52 was not measured: the evidence backup holds only #51's run-input snapshot. MCD's rebuilt row carries a diluted count of 711.1 instead of 711.1M on both sides, so only its equity value is usable (pre-existing, not from this batch).

### Lost evidence

The post-integration scripts and outputs (`B4-post-int/`: `debt-like-families`, `conversion-prices`, and the Feldstein page images) were lost in the deletion of 2026-10-28. Feldstein's chapter is cited by its citation and was not re-checked; no figure in this note rests on a recollection of it. Every figure above was re-measured from this plan's own steps, on the branch.

### Not fixed / residual

- The WACC capital-structure weights ignore temporary equity.
- The debt-like lines' tax relief is the D-98 marginal-rate floor (21% US federal, state and local taxes excluded; 15% elsewhere) applied as if each claim were deductible against taxable income when paid. A payment that is not deductible (government fines and penalties, 26 U.S.C. section 162(f)), one that only adds to tax basis (contingent consideration: the acquired assets' basis, amortised over 15 years for intangibles, or the acquired shares' basis, recovered only on a sale) or one made by an issuer with no taxable income to absorb it is understated by up to rate times amount, and the omitted state tax understates the relief. Known issue B2b-1 is otherwise resolved: the lines are after tax.
- A pension deficit's `net x (1 - rate)` is its after-tax cost if funded at once (Feldstein, "Private Pensions as Corporate Debt", NBER 1982: unverified, evidence lost 2026-10-28); the bridge does not model a slower funding schedule, which costs more in present value.
- A rate-regulated utility (SIC 4911, 4923, 4924, 4931, 4932 or 4941) has its pension and OPEB deficit disclosed, not deducted, on the assumption that it is recovered through rates (ASC 980), because the offsetting regulatory asset is reported only in dimensional XBRL, which companyfacts does not carry (DUK keeps main's treatment; a utility that cannot recover its deficit is overstated by it). The note states the reading, not the recovery: SIC 4911 also files merchant generators (Constellation, Vistra, NRG), which do not recover pension costs through rates, and whose figure equals main's (no pension deducted) but is overstated by the deficit after tax. Netting the deficit against the pension regulatory asset once dimensional XBRL is available is routed to the free-data-source batch (pre-flight I7).
- Parent temporary equity that is redeemable COMMON stock already in the diluted count (ESOP puts, SPAC Class A) would be counted twice, because companyfacts do not separate it from redeemable preferred (disclosed in the bridge note, Task 2).
- Pension and the other new obligations are not added to the market EV.
- Mezzanine preferred overlap at unequal amounts: when `PreferredStockValue` and the temporary parent part describe the same series at different amounts, both are deducted (B4b's overlap territory, OD-2). An equal pair is deducted once, inside the temporary-equity reader, with every balance row left as filed (final review M-9, round 2).
- Where a provider-route run's temporary-equity enrichment was withheld at the bridge date, a redeemable claim may be missing from the bridge and the EVs, which keep main's figures with a warn gap. A vendor row whose CIK differs from the confirmed companyfacts skips the enrichment with a gap that fires for every issuer, so it is not read as a sign of a missing claim (`financialEnrichment.ts:903`).
- Unproven or refused history years can drop an issuer below three usable years, onto the 0.5 A-2 sales-to-capital floor (not worse than main on the census).
- A-2's 0.1 cutoff step (pre-existing).
- The even-count I6 median step (as the plan specifies).
- A bridge-date loss accrual is not netted against an environmental accrual found only at an earlier date (OD-4's same-date rule), so that amount can count twice.
- An issuer whose convertibles carry no carrying-value tag and no donor-period conversion increment can still have a restored award increment that holds conversion shares (ASC 260's reconciliation normally tags the increment).
- A REIT whose quote has a price but no market cap now withholds P/FFO and EV with a warn gap (OD-8). The population is near empty: the dei cover tag is required, and a dimensioned multi-class cover already nulls the weighted counts at base.

The convertible and equity-method residuals are B4b's.

### Final whole-branch review, fix round 1

The merge rule: no report that main publishes becomes Blocked, and no figure is worse than main. Each item below was written test first.

- I-1: lease-emptied invested capital (the I6 case) withholds the DCF at warn, not critical, as D-135 OD-3 records; the fair value and scenario targets quote the reason through the exported `LEASE_EMPTIED_CAPITAL_LEAD`. Main's own `ic <= 0` case keeps its critical gap.
- I-2: the statement-date bridge row is refused for a lease conflict, a lease-scope refusal (on the run's own switch) and a refused temporary-equity operand, as well as the parser refusals and the ownership test, so a refused statement-date row or a refused anchor keeps main's row, never cured by another date.
- M-1: a row with a refused temporary-equity operand and a lease defect keeps main's critical lease gap. The bridge lease checks are raised in `buildDcfAssumptions`, beside the warn, before it returns.
- M-7: a null book NCI beside a redeemable NCI takes the P/FCF 1% floor on the redeemable NCI alone; with no redeemable NCI the guard is main's.
- M-8: the rate-regulated note states the reading and the merchant-generator caveat.
- M-9: an equal `PreferredStockValue` and temporary parent part is one series tagged twice. Round 1 zeroed `preferredStock` at the entry of `runStageB`, which leaked into the financial-route key data (basis text "preferred 0", TCE, ROTE, P/TBV); round 2 removes that and applies the rule inside `temporaryEquityClaims`, so every row stays as filed and main's figure stands. The info gap `valuation.preferredOverlap` appears once per date.
- Replay (branch2 to branch3, 149 runs): no figure, score or band moves; the only difference is DUK's `rateRegulated` info text (M-8). Against main no run went from no critical gap to a critical one.

### What a reader will notice beyond the figures

- Forecast EPS is withheld for issuers with temporary equity, as for permanent preferred (already withheld for UNH and WMT by their book NCI). P/FCF is withheld for a redeemable preferred, an unsplit amount or a refused operand at any size, but a redeemable NCI takes the book-NCI materiality floor: small beside a smaller book NCI, or beside a null book NCI, it does not withhold P/FCF (the floor above).
- A redeemable NCI with no profit key, or beside a null book NCI (I2), withholds the per share under E-5.
- Temporary equity now lowers UNH's and WMT's DCF values (UNH about -$1.61 with its capital effect; WMT's redeemable NCI alone about -$0.04, netted against its lease gain) and UNH's ROIC (11.15 to 10.93).
- Every retirement and environmental line (E-7) is now deducted after tax, so each issuer that tags one has a higher DCF value than before by the relief.
- A covered operating lease leaves sales-to-capital's invested capital, which raises lessees' values (AMZN #51 +6.91%).
- Issuers with a large recognised pension and OPEB deficit fall the most: in the census, CAT by $5.67 and BA by $5.96 a share (Task 6 alone is $5.87 of BA's, its divisor $0.09), JNJ by $4.25 and VZ by $1.92 net of its lease gain, as measured above.
- Reports saved before this batch show a method note on their DCF, excess-return and REIT values; stored bytes are unchanged (D-67).

## Part B (B4b)

Added by Task 19b in the B4b pull request: convertibles (OD-2), equity-method stakes (OD-5) and fair-value financial assets (OD-9).
