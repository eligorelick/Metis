# AMZN report #51: the noncurrent-only lease line, current debt and stakes (2026-10-29)

Base: `6b97298` (main, after pull request #71). Scope: the audit of AMZN report #51 of 2026-10-29, findings VAL-1, VAL-2, VAL-3, VAL-4 and VAL-10, FIG-1, FIG-2 and FIG-4, GRD-01, and from the fifth audit KNW-03 and KNW-04. Decision: D-132 in [DECISIONS](DECISIONS.md). Stamps: report 1.48.0, payload 1.50.0 and Stage B ACCOUNTING_EVIDENCE_29, each the next after those of D-129 to D-131 and D-124 to D-127; pipeline stage-c-1.6.12 is unchanged. The audit evidence folders stay out of the repository.

This change made no model calls, no provider calls and no network requests. The tests build their inputs inline: the Amazon cases use SEC-filed amounts from Amazon's Q2 2026 10-Q and its 2025-12-31 comparatives under a synthetic issuer, CIK and accession, and the Stage B fixtures use round synthetic numbers. No provider row (FMP or other) is committed.

## Disposition

| Finding | Disposition | Commit | Tests |
|---|---|---|---|
| VAL-1, FIG-1, GRD-01: a provider lease line holding only the noncurrent lease liabilities made the lease guard refuse every balance, so WACC, DCF, fair value and three grades were lost | Fixed. The admission completes the row from the one filing that tags every part (lease totals, current debt where the provider has none, total and net debt), and refuses with the exact cause otherwise. The lease guard's tests are unchanged; its messages name the values and scopes, and the WACC says "withheld:" for a refused debt. | `f6718bb` | `tests/edgar.noncurrentLeaseLine.amzn51.test.ts` |
| VAL-2, FIG-2: the provider total left out current debt; "total debt including leases" printed the partial 223.23B; the provider EV used it | Fixed in part. A provider short-term debt of 0 beside filed current debt withholds the total; the current-capital bridge withholds a refused total with its reason and labels a composed one; a provider EV whose debt was refused or recomposed is withheld. The proposed debt-only comparison of the tagged-total backstop is **not applied** (below). | `5f4b5e3` | `tests/stageB.incompleteDebtTotal.amzn51.test.ts` |
| VAL-3, FIG-4: the provider's `longTermInvestments` of 0 left Amazon's stakes out of the DCF bridge and inside net operating assets, while the accrual note said they were excluded | Fixed. A provider 0 or absence is undisclosed when the filing tags noncurrent investments, and is filled with D-98's chain at enrichment and in Stage B's admission. The accrual note claims the exclusion only when an investment was removed. | `0e5f863` | `tests/edgar.vendorStakes.amzn51.test.ts` |
| VAL-4, VAL-10, KNW-03, KNW-04: refusals called missing, "EV is reported as-is" beside a null EV, a fair-value reason listing possible causes, ROIC withheld with no manifest entry | Fixed. "EV withheld: <reason>", "total debt withheld (<reason>)", the WACC reason in the DCF gap, the DCF or bridge gap in the fair value, one `returns.roic` entry (critical only when the WACC's own balance refusal withholds the latest year), and a scope note that says what it compared. | `8f05787` | `tests/stageB.truthfulRefusals.amzn51.test.ts` |
| Stamps and records | Report 1.48.0, payload 1.50.0, Stage B ACCOUNTING_EVIDENCE_29; the payload golden moves only its versioned header; the DEMO delta group `amzn51-lease-scope-20261029` holds the spec stamp; METHODOLOGY, CHANGELOG, DECISIONS and this record. | the records commit | `tests/report.versionStamps.test.ts`, `tests/stageC.payload.passes.test.ts`, `tests/jobRunner.test.ts`, `tests/audit.fixtureComparison.test.ts` |

Every new test failed before its fix, except the controls that pass on both sides by design.

### Review fix round 1

The whole-branch review upheld every figure, grade and census result and the stopped rule, and asked for one Important item and eight Minors. Each item's test failed first (except its controls).

| Item | Change | Commit | Tests |
|---|---|---|---|
| I-1 | The `returns.roic` entry is critical only when the latest fiscal year's ROIC is withheld by the same balance's debt refusal that withholds the WACC; a warning otherwise. META and PLD go back to their base critical counts. | `df11ba9` | `tests/stageB.truthfulRefusals.amzn51.test.ts` |
| m1 | A filing whose `LongTermDebtNoncurrent` equals its `LongTermDebtAndCapitalLeaseObligations` while it tags noncurrent finance leases (Duke Energy's 2019 to 2021 10-Ks) is not used to complete a row; the refusal names the three facts. | `b47cca3` | `tests/edgar.noncurrentLeaseLine.amzn51.test.ts` |
| m2 | A refused completion states only what was checked: a current debt the filing does not establish, a vendor short-term debt equal to the current leases with no filed current debt, or otherwise that the row is not completed. | `76eb15d` | `tests/edgar.noncurrentLeaseLine.amzn51.test.ts` |
| m3 | A quoted reason that ends a sentence is not given a second period in the EV basis or the bridge note. | `d49870f` | `tests/stageB.incompleteDebtTotal.amzn51.test.ts` |
| m5 | A market cap withheld on share scope is called withheld, with its reason, in the WACC, DCF and fair-value lines; the net-debt entry cites FMP's cash-only `netDebt` field only on the FMP route. | `9a2bbda` | `tests/stageB.truthfulRefusals.amzn51.test.ts` |
| m4 | A provider short-term debt of 0 is kept when its long-term debt equals the same filing's `LongTermDebtNoncurrent` plus `LongTermDebtCurrent` and the filing tags no other current debt. | `d49883e` | `tests/stageB.incompleteDebtTotal.amzn51.test.ts` |
| m6 | One manifest entry per kind lists the completed and the filled dates (report #51: 51 entries and 24,779 reason characters become 2 entries and 3,486). | `9512e6f` | `tests/edgar.noncurrentLeaseLine.amzn51.test.ts`, `tests/edgar.vendorStakes.amzn51.test.ts` |
| m8 | The vendor-convention diagnostic keeps the provider's own net debt (66,177M on report #51, as at base). | `bcca403` | `tests/edgar.noncurrentLeaseLine.amzn51.test.ts` |
| m7 | METHODOLOGY, D-132, CHANGELOG, this record and a test comment made to match the code. | the records commit | |

The payload golden does not move in this round. m1 and m4 move no replayed row: no census or run row has the Duke shape, and the only provider row the zero-current check withholds, Amazon's 2017-12-31, keeps its withholding because its provider long-term debt is the 10-K's noncurrent $24,743M alone, without the $100M of `LongTermDebtCurrent`.

## The rule that was not applied

The brief asked the tagged-total backstop (`uncomposedDebtReason`, audit 2026-10-22 B-14) to compare a debt-only aggregate (`LongTermDebt`, `LongTermDebtNoncurrent`, `LongTermNotesAndLoans`, `DebtLongtermAndShorttermCombinedAmount`) with the financing debt alone, counting finance leases only against an aggregate whose name holds them. Against the filed data that is wrong for Alphabet, which files its finance leases inside `LongTermDebt`: at 2019-12-31 `LongTermDebt` is 4,685M against `LongTermDebtNoncurrent` 3,958M plus `FinanceLeaseLiability` 711M, and its 2020 to 2022 keyless long-term debt (13,932M, 14,817M, 14,701M) sits below `LongTermDebt` (15,319M, 15,440M, 15,312M) by about its finance leases. With the rule the census replay withheld Alphabet's 2019 to 2022 and 2025 debt: net debt null, DCF 215.43 to 203.91, composite 61.36 to 54.28, and its latest ROIC (2025-12-31, 36.73%) withheld. It also moved the keyless AMZN census snapshot and run #43. No alternative rule was guessed; the backstop is unchanged and pinned as it stands, and the Amazon shape is caught by the current-debt check.

## Replay

`scripts/replay-run-inputs.ts --snapshot` refuses report #51's snapshot ("Snapshot calculation implementation version is unavailable; refusing an inexact historical replay": it was captured under report 1.45.0, and the version check is by design). The replay therefore ran each tree's own `runStageB` on the identical frozen bundle and Stage B configuration, base `6b97298` against this branch, with no provider, database, model or network. A second base run gave byte-identical output.

**Report #51** (before, after):

| Figure | Base | After |
|---|---|---|
| WACC | withheld | 10.47% |
| DCF and fair value per share | withheld | $116.12 (upside -54.39%) |
| Scenario targets | withheld | $100.33 / $116.12 / $136.37 |
| Total debt including leases (current) | 223.23B, no net debt | 242.32B; net 119.33B; excluding operating leases 23.01B |
| Net debt / EBITDA (annual) | withheld | -0.29 |
| Enterprise value | withheld | 2,769.20B |
| ROIC (latest) | withheld | 20.63% (spread over WACC 10.16pp) |
| Fundamentals | 61.28 (C) | 61.28 (C) |
| Valuation | not assessed | 34.44 (F) |
| Quality | 67.34 (C) | 74.52 (B) |
| Balance sheet | 42.73 (D) | 56.11 (C) |
| Moat | 70.27 (B) | 63.53 (C) |
| Leadership | 50.80 (D) | 50.80 (D) |
| Technicals | 55.26 (C) | 55.26 (C) |
| Composite | 54.34 (D) | 56.11 (C) |
| Critical gaps | 2 (WACC weights, DCF) | none |

Every figure equals the audit's counterfactual with the composition and the stakes (`cf-composition-stakes.json`). No other numeric leaf differs from it: the vendor-convention diagnostic `vendorNetDebt` keeps the provider's own 66,177M, as at base, because the completion records the provider's net debt before it recomposes the row's (review m8; before that fix it read the composed 170,389M less cash 86,810M = 83,579M). The brief's ≈58 (C) is the counterfactual without the stakes (58.23 (C), fair value $97.02, valuation 42.78 (D)), reproduced after the first commit. The stakes raise the fair value to $116.12 and make the reverse DCF's implied-versus-achievable signal computable, which scores low and takes the valuation grade to 34.44 (F), as the audit predicted. Quality rises on the ROIC-versus-WACC spread; the balance sheet on net debt/EBITDA; the moat moves because it now reads the ROIC series instead of 25% of its evidence. The balance-sheet accrual ratio is 0.29 (0.33 at base): only the D-98 stakes (16.86B and 2.19B at the two year ends) leave net operating assets, not FIG-4's undivided Anthropic notes. One more provider year end is withheld, 2017-12-31, whose 10-K tags 100M of current long-term debt the provider row left out; no figure uses it.

**Census** (45 snapshots, all built from SEC statements): no figure, grade, band or critical count moves. Wording only, from the refusal-naming changes:

- CVX, MCD, META, ORCL and PLD: the WACC gap says "withheld:" with the admission's refusal instead of "missing — cannot distinguish ...", the bridge note names the refusal, and net debt and EV say "total debt withheld (...)". META and PLD gain a warning `returns.roic` entry for the years their debt refusals withhold; it is a warning because each latest fiscal year's ROIC is computed (META 29.96% and PLD 4.58% at 2025-12-31).
- CSCO and NFLX: a warning `returns.roic` entry for years withheld on a cash-component conflict; for CSCO the EV and net debt/EBITDA name that conflict.
- GOOGL: a warning `returns.roic` entry for 2023-12-31, whose debt the B-14 backstop already withheld.
- CMCSA, MA, V, T and PG: the EV entry names its gate (the share scope, the lease-scope refusal or the cash components). For CMCSA, MA and V the WACC weights entry, and with it the DCF and fair-value lines, says the market cap is withheld on the share scope, with that reason, instead of missing.
- DIS, LLY and TSM: the DCF gap quotes the WACC reason.
- The fair-value line quotes the DCF or bridge gap instead of the generic list of possible causes for 14 issuers: CMCSA, CSCO, CVX, DIS, LLY, MA, MCD, META, ORCL, PG, T, TSM, V and XOM (for XOM, its diluted-share gap).
- Net debt/EBITDA: CSCO and ORCL say "net debt withheld:" with the refusal; CVX and PG give the resolver's reason (no combined cash-and-short-term-investments, a cash component missing, the cash-only net debt rejected) instead of "missing net debt input" alone.
- CSCO, CVX, MCD, META, ORCL, PG and PLD: the net-debt entry no longer says the bridge passed over "FMP's incompatible cash-only netDebt field", which a keyless report does not have.

The AMZN census snapshot, run #43 (AMZN, SEC statements) and run #46 (MU) do not change at all.

**NVIDIA provider runs #48, #49 and #50.** Headline figures do not move (WACC 13.02%, DCF $229.52, composite 76.25 (B)). The 10-Qs show the provider lease line was the noncurrent operating lease liability at three quarter ends, with no finance lease filed:

- 2022-07-31 completes from 10-Q 0001045810-22-000147: leases 888M (`OperatingLeaseLiability`), the provider's 1,249M short-term debt kept (it equals `LongTermDebtCurrent` and `DebtCurrent`), total 1,249 + 9,700 + 888 = 11,837M (provider 11,692M).
- 2022-10-30 completes from 10-Q 0001045810-22-000166: 1,249 + 9,701 + 954 = 11,904M (provider 11,748M).
- 2022-05-01 stays refused, with a new reason: the provider's 147M short-term debt equals that 10-Q's `OperatingLeaseLiabilityCurrent` and the filing tags no current debt, so it cannot be kept beside the completed lease total.

The two completed quarters add two EV own-history observations (18 to 20) to EV/EBITDA and EV/sales. At 2022-10-30 and 2022-07-31 they read 45.22 and 48.67 (EV/EBITDA) and 11.66 and 15.27 (EV/sales), on the provider's market capitalization and the completed debt, and the current percentile ranks move from 2.17 to 1.94 and from 4.87 to 14.88. NVIDIA's graded valuation signals are the DCF upside, the reverse DCF and the P/E rank, so no score moves.

## Residuals

- The completion keeps a nonzero provider short-term debt that it cannot check, when the filing tags none of `LongTermDebtCurrent`, `DebtCurrent`, `ShortTermBorrowings` or `CommercialPaper`, provided it is not a current lease amount.
- A filer that tags only `DebtCurrent` (no `LongTermDebtCurrent`) is refused by the completion rather than completed.
- The zero-current-debt check keeps a provider row that folds its current maturities into long-term debt only when the filing tags no other current debt (review m4). A `DebtCurrent` above `LongTermDebtCurrent` may hold current finance leases rather than more debt; the check cannot tell, so it withholds such a row (fail-closed) with a reason naming the filed tags.
- The provider EV check reads the bundle's rows: in a report rebuilt from a bundle frozen before the completion, it names the lease refusal rather than the composed total; both withhold.
- Amazon's Anthropic convertible notes (tagged only with the undivided `AvailableForSaleSecuritiesDebtSecurities`) stay out of the stakes on both paths (D-98).
