# P1 / B4b: equity-method stake disposition (2026-11-02)

This batch continues all assigned B4b items from `eecd2703`.
The family commit is **Value equity-method stakes once from their income placement
(FIN-401, FIN-401-V1)**; its full SHA is recorded in the implementation handoff.
The FIN-401 family is preserved at `3b775ac7`; later item records follow below.

## Findings and receipts

Receipts are under the worktree's ignored `tmp/claude-impl/` directory. The
wrapper ran `npm ci` using Node 24; the lockfile was not changed.

| Finding | Disposition | Commit | Red / green receipts | Stored-report impact |
|---|---|---|---|---|
| FIN-401 | Fixed | Family commit named above | `fin401-red-confirmed` / `fin401-green-final` | Conditional display-time method note; figures and bytes retained |
| FIN-401-V1 | Fixed | Same family commit | `fin401-red-confirmed` / `fin401-green-final` | Same note, including filed operating subtotals |
| FIN-302 | Fixed | FIN-302 family commit (handoff) | `fin302-red-confirmed` / `fin302-green-final` | Conditional pre-1.56.0 note; saved figures retained |
| FIN-302-V1 | Fixed | Same family commit | Same receipts | Same note for excess-return values |
| FIN-302-V2 | Fixed | EPS commit (handoff) | `fin302v2-red-confirmed` / `fin302v2-green` | Earlier figures stay; conditional convertible note applies |
| FIN-407 | Fixed | Multi-class EPS commit (handoff) | `fin407-red`, `fin407-stored-red` / `fin407-green-final` | Explain old admission sentence; saved EPS unchanged |
| VAL-14 | Blocked at OD-9 Step 0 | Admission-gate evidence commit (handoff) | `val14-census`, `val14-existing-controls` | No change to stored or new figures |
| FIN-309 | Not started | None | None | Task 11 has not landed; book-date treatment remains |

The first red run includes the existing six B4a invariants passing. The confirmed
red has 15 defect failures and two controls passing. Separate stored-report and
stamp red receipts are `fin401-stored-red` and `fin401-stamps-red`.
Typecheck found that the plan's proposed stored DCF-notes field does not exist;
the corrected actual-schema fixture fails in `fin401-stored-schema-red` and is
covered by the final report receipt. No assertion is removed: the absence
control now removes the actual stored assumption basis, not an invented field.
`fin401-regressions-a` initially found two provider-fill wording regressions;
the implementation now preserves those assertions unchanged, as verified in
`fin401-regressions-b`. The legacy views are checked in classic, dossier,
Markdown and print, including idempotence and unchanged stored bytes.

## Current mechanisms and decisions

OD-5 is applied using the actual derived-EBIT subtraction metadata or filed
pretax/component arithmetic. A nonoperating aggregate can hold equity-method
income, so a zero residual on that path stays undetermined (C1). The tolerance
is the project choice max(0.1% of absolute pretax, 1M source monetary units).
Inside measured income is removed from the DCF seed and measured annual margin
history, and the stake is added once. Inside unmeasured income leaves its stake
in operating capital, including the sales-to-capital history; there is no
separate stake add-back or sale-tax deduction. Immaterial/filed-zero quarters
take the other quarters' measured placement; an all-immaterial window does not
establish inclusion. Q4 operands reuse B13's one-presentation resolver, and a
refused operand is never silently zero (I4).

The equity-method stake is the whole LTI only when its provenance consists
solely of equity-method investments. Otherwise it is bounded by the same-date,
same-currency filed stake and LTI; no amount is estimated. Provider rows without
placement, mixed windows and ambiguous arithmetic retain the prior treatment
and explicitly state the S-X Rule 5-03 assumption. The LTI total's component
floor uses B13's existing `unlessBelow` rule, max(0.5%, 2M). The provider fill
evaluates that same builder chain, with identical value/tags and its prior
missing-piece/provenance disclosures (I5). See **D-next (P1/B4b)** in DECISIONS.

## Rebuilt census evidence

The census snapshots and retained SEC cache were read from their external
reference location; none was copied into the repository. All six statement
members were rebuilt separately by the base archive's builder and this branch's
builder, using the retained split evidence, analytical/basis dates, acquisition
cutoffs and predecessor continuity. Frozen market inputs and Stage B settings
were preserved. Every measured issuer already satisfied current SEC identity
admission; no identity adaptation was used. These are offline census shapes,
not newly acquired live reports.

Harness: `tmp/claude-impl/replay.mts`; base: a `git archive eecd2703` inside
ignored scratch. Successful receipts: `fin401-replay-before-v3` and
`fin401-replay-after`; measurements: `replay-before.json` and `replay-after.json`.
The first two replay attempts rejected an incomplete legacy split-evidence
shape; the successful harness reconstructs the vendor event envelope from its
retained sessions, ratios and coverage on both sides.

| Census shape | Before DCF/share | After DCF/share | Delta | Finding |
|---|---:|---:|---:|---|
| XOM | 191.7389267225 | 178.0877966043 | -13.6511301182 | FIN-401 |
| BA | 27.7411147513 | 27.1152067083 | -0.6259080430 | FIN-401-V1 |
| GOOGL | 215.5926213765 | 215.5926213765 | 0 | Control for this family; convertibles unstarted |
| AMZN | 102.9741501793 | 102.9741501793 | 0 | Control for this family; VAL-14 unstarted |
| KO | 41.0870765940 | 41.0870765940 | 0 | Below-operating component path |
| DUK | 36.6627397809 | 36.6627397809 | 0 | Aggregate path stays undetermined |
| T | Withheld | Withheld | None | Existing sales-to-capital refusal |
| DIS | Withheld | Withheld | None | Existing WACC interest-expense refusal |
| CMCSA | Withheld | Withheld | None | Existing WACC weights refusal |
| NEE | Withheld | Withheld | None | Existing DCF domain refusal; computed equity unchanged |

XOM's base and final equity values are 800.3182801397B and 743.3384630263B;
its unchanged divisor is 4.174B. The whole 56.9798171134B reduction reconciles:

| XOM equity bridge change | Amount, B | Attribution |
|---|---:|---|
| Operating enterprise value, 829.5562601397 to 798.9024030263 | -30.6538571134 | FIN-401: sales-to-capital 1.3938132874 to 1.2378923835 with the stake kept in operating capital |
| Remove the separately added equity-method stake | -33.3240000000 | FIN-401: no second valuation |
| Remove the sale-tax line on that removed add-back | +6.9980400000 | FIN-401: no sale of the operating-treated stake |
| Total equity change | -56.9798171134 | Sum of the three lines |

The base already deducts 7.1637200000B of successor pension/OPEB and
9.8892200000B of predecessor asset-retirement obligations, both after tax.
They are unchanged here. Adding those existing bridge lines back reconstructs
817.3712201397B before those B4a deductions; subtracting them and this family's
56.9798171134B gives 743.3384630263B with no residual (I10).

BA's TTM affiliate result is 35M: Q3 17M, derived Q4 -14M, filed-zero Q1 0M,
and Q2 32M. Its margin seed falls from 4.9289855843% to 4.8917495611%; its
1.117B stake remains added once. Equity falls 0.4964076689B. Sales-to-capital
stays 3.0442738697. This is the measured income-removal reading, not the
different counterfactual that keeps the whole stake in operating capital.

No band moves. XOM valuation score changes 44.38/D to 40.00/D, composite
56.43/C to 55.75/C. BA remains valuation 15/F and composite 40.27/D. GOOGL
and AMZN keep their scores, denominators and bands.

## Stamps, goldens and downstream handling

- Report 1.56.0, payload 1.60.0, Stage B
  `STAGE_B_2026_11_CLAUDE_REPAIRS_39`. The fair-value and scenario-target method
  identifiers use `2026_11_CLAUDE_REPAIRS_39`. Prompt rule text is unchanged;
  the Stage C pipeline version stays at its base value.
- `BRIDGE_READINGS_SINCE_SPEC_VERSION` is frozen at 1.56.0, independently of
  B4a's 1.50.0 cutoff. The stored LTI component and the sales-to-capital basis's
  non-operating LTI treatment must both be present. Ruling: adapt Task 15b's
  proposed stored-note detector because Stage B valuation notes were payload-only
  and DcfSchema has no notes field. The actual basis establishes the earlier
  treatment; the note is conditional about actual income
  placement and changes no number or saved byte. No future-family note is added.
- Existing DCF assumptions, bridge components, tax, grids, reverse valuation,
  scenario targets, grades and forecast consumers use the repaired Stage B
  inputs. `computeDcfDisplay` and the existing report adapters preserve the
  corrected numbers and margin basis. Payload rule text needs no edit.
- The no-stake payload golden preserves all earlier finance, byte and registry
  pins by restoring only the new header and explicitly counted method stamps.
  The audited fixture re-pins six owned leaves: five method/report stamps and
  the LTI note's disclosed assumption. No monetary fixture leaf is re-pinned.
- Raw `audit:deltas` already differs at two capex descriptions on `eecd2703`
  (`report.balanceSheet.coverage.commentary.1`, `stageB.capital.current`). The
  exact fixture test explicitly restores those reviewed descriptions. Those
  pins are retained; `fin401-delta-contract` passes. The raw command still
  reports those same two differences; it is not used to bless them here.

## Residuals and remaining work

Final verification receipts (Node 24, at most three Vitest workers per command):

| Receipt | Result |
|---|---|
| `fin401-green-final` | 568 tests, 15 files passed: equity-method regressions, B4a invariants, statement/placement, lease/capital and DCF consumers |
| `fin401-baseline-controls` | Same 224 existing controls passed on the base archive |
| `fin401-invariant-base-red` | New stake invariant failed on the base; all six B4a invariants passed |
| `fin401-report-final` | 448 tests, 8 files passed: report/stamps, payload, audited fixture, fair value, scenario targets and domain/degradation controls |
| `fin401-stored-schema-green` | 14 stored-report tests passed after the schema adaptation |
| `fin401-jobrunner-final` | 278 tests passed, including the existing Stage B config-read guard |
| `fin401-docs-release-v2` | 68 tests, 5 files passed, including actual-schema legacy views, public-doc registration and stakes-fill controls |
| `fin401-typecheck-final-v2` | Exit 0 |
| `fin401-lint-final-v2` | Exit 0, no warnings |

The first typecheck caught the invalid stored DCF-notes field, and the first
lint caught the now-unused copied `firstInstant` helper. Both are corrected.
The first documentation gate caught the new changelog entry preceding the
shared version header; the entry now follows that header. These were introduced
failures, not pre-existing defects. No full `npm run verify` was run, per the
implementation brief; release verification remains with the integrator.

Stop after this complete family. FIN-302, FIN-302-V1, FIN-302-V2, FIN-407,
VAL-14 and FIN-309 are **not started**. Their mechanisms, outputs, tests and
owner decisions have not been changed. FIN-309 must still wait for Task 11.
In particular, no OD-2 conversion-edge rule or OD-9 asset admission is claimed.

OD-5's known evidence limits remain: partial inclusion and aggregate ambiguity,
provider rows without placement, mixed windows, unavailable same-date stake
breakouts and untagged income amounts. No amount is estimated to fill a gap.
The integrator must assign D-next, merge the remaining tracks, and run the full
release verification. This implementation does not push, open a PR or merge.

## FIN-302 / FIN-302-V1 continuation

The corrected normal-suite fixture fails all seven assertions at `3b775ac7`
(`fin302-red-confirmed`) and passes on the repair. `fin302-stored-red` proves
the missing stored note. `fin302-green-final` passes 112 tests in eight files,
including B4a loss divisors, financial start/payout, D-65 and legacy controls.
The older legacy tests now explicitly expect the added B4b note while preserving
their B4a cutoff, number and idempotence assertions (basis length 2 -> 3).
Optional stored convertible readings survive the strict schema and reach the
shared audit tables used by classic/dossier, Markdown and print; absent arrays
remain optional. No prompt text, method stamp or numeric golden changes.

The reader measures core-form facts filed by acquisition, exact bridge-date
claims, exact-period increments (80-100 / 350-380 days), inclusive notes totals,
and independently proven preferred-series totals. No SEC/model/provider calls.
`conversion-census.json` records all 45 issuers: no recent K; historical K only
NVDA 2019-01-27, PLD 2014-06-30 and TSLA 2014-03-31; TSM out of scope. DUK
has a current 1M note increment but no K; EXPE's current increment is zero;
GOOGL 16M quarterly preferred shares (8M YTD rejected); PG 68.3M annual.
GOOGL files only convertible-preferred carrying value, no permanent preferred
carrying tag at 2026-06-30. There is no evidence for two preferred series there.
W-rare wording therefore applies. Reviewed OD-2 sources are retained as owner
instructions, not re-fetched under the offline restriction.

The continuous M6 rule uses triangular adjustment weight across the band;
full two-reading comparison at N=C/K, zero adjustment at 95%/105%, unchanged
conservative value outside. Tests verify both edges, unknown claims, cash
principal, wrong currency, future filings, old K, YTD rejection, inclusive debt,
all four combinations and preferred overlap. It ignores option time value.

The rebuilt census (`fin302-replay-before-v3`, `fin302-replay-after`) moves
GOOGL DCF/share 215.592621376525 -> 214.40710782751535 (-1.18551354900965,
-0.5499%). Its 18.023B claim is deducted once and 16M shares leave the divisor.
Valuation 22.14 -> 21.94; composite 63.88/C -> 63.84/C. Forecast EPS
[11.23,13.08,14.81,16.39,17.81] becomes withheld on the senior preferred claim,
as required by OD-1. XOM, BA, AMZN, NVDA, DUK, KO and all tested refusals
retain per-share figures and grades. PG remains withheld; SNOW is disclosure
only. More injected-shape receipts are recorded in the handoff.

Injected shapes use the same rebuilt census harness (TSX aliases explicitly
point to each side), receipts `fin302-shapes-before-v3` / `fin302-shapes-after`.
Synthetic financial shapes retain the finding's route fixtures; model quote and
all existing controls are unchanged. Valuation score is unavailable on these
synthetic financial fixtures on both sides; their composite score is retained.

| Injected shape | Before/share | After/share | Composite before -> after |
|---|---:|---:|---|
| NVDA-notes-50B | 305.517459307272 | 307.5613571077288 | 80.04 -> 80.13 |
| NVDA-preferred-50B | 312.38397491189676 | 314.4278727123535 | 80.41 -> 80.45 |
| NVDA-preferred-400B | None | None | 75.41 -> 75.41 |
| bank-control | 12.467587163860598 | 12.467587163860598 | 63.88 -> 63.88 |
| bank-notes | 11.71652769615815 | 12.18640721423044 | 63.87 -> 63.87 |
| bank-preferred | 11.33417014896418 | 11.788715603509635 | 63.86 -> 63.86 |
| insurer-control | 12.30951084413699 | 12.30951084413699 | 65.92 -> 65.92 |
| insurer-notes | 11.567974046297412 | 12.0378535643697 | 65.9 -> 65.9 |
| insurer-preferred | 11.190464403760899 | 11.645009858306354 | 65.89 -> 65.89 |
| mreit-control | 13.066900267444916 | 13.066900267444916 | 65.92 -> 65.92 |
| mreit-notes | 12.279737600731366 | 12.749617118803656 | 65.9 -> 65.9 |
| mreit-preferred | 11.879000243131742 | 11.191334135837607 | 65.89 -> 65.89 |

The 400B preferred scale input remains outside the DCF domain on both sides;
no per-share or EPS value is published. The mortgage-REIT preferred fixture
had no preferred carrying claim in its original row: the new 50M claim is
therefore first deducted from common book, explaining its conservative decline.
The bank and insurer rows already deducted their 50M preferred claim. No
assertion, grade threshold, coverage floor or refusal is loosened.

## FIN-302-V2 continuation

`fin302v2-red-confirmed` reproduces four defects with the unresolved-note
control passing; the initial fixture lacked the three-year projection history
and was corrected before production changes. `fin302v2-green` passes all 61
tests across four files (EPS, projection, D-65 and convertible controls). The
selected bridge divisor anchors all EPS variants. Converted-note interest is
removed only on the restored claim, at the evidenced effective rate, capped
at total interest. With no rate, interest is retained and disclosed: this is
the conservative option under OD-2 rather than an invented coupon. No prompt,
stamp, stored value, numeric golden or grade threshold changes.

The same rebuilt/injected harness at `71e58818` versus EPS repair
(`fin302-shapes-after` / `fin302v2-replay-after`) gives injected NVDA 50B-note
base EPS [11.04,16.49,22.70,29.15,35.30] ->
[11.07,16.52,22.73,29.18,35.34]. DCF/share remains 307.5613571077288;
valuation 87.35 and composite 80.13/A stay. Unmodified NVDA EPS
[11.12,16.61,22.87,29.37,35.57] and AMZN
[6.69,7.38,8.04,8.68,9.29] stay. Preferred GOOGL and injected preferred
EPS remain withheld. All census/injected valuation figures and grades stay.

## FIN-407 continuation

`fin407-red`: three defect assertions fail and two setup/refusal controls pass.
`fin407-stored-red` reproduces the missing legacy explanation. Equal-economics
and 1,500-to-1 class-unit fixtures both now publish EPS
[1.91,2.05,2.17,2.28,2.37] instead of []; their admitted 100M quoted-share
DCF divisor and per-share value remain identical to the single-class control.
An actual warn-level class refusal retains empty forward EPS. Non-info scope
entries alone are refusals. `fin407-green-final` passes 116 tests in six files.
The existing missing-count test now removes both authoritative bridge count
and fallback count, preserving its assertions; before it removed only fallback
while leaving a valid 100-share bridge. No assertion or threshold is weakened.
The legacy sentence suffix is idempotent, optional-projections safe and changes
no numeric leaf or stored byte. All report surfaces use the existing adapter.
No prompt text, stamp or golden changes.

`fin407-replay-after` compared with `fin302v2-replay-after` changes no census
per-share, EPS, grade or injected control. META stays withheld (DCF and EPS),
valuation unavailable, composite 63.67/C. EXPE stays 271.56684754798755/share,
EPS withheld for ownership, valuation 50.47, composite 65.85/C. The benefit is
the synthetic admitted-class pair; neither refused census issuer gains EPS.
`fin407-typecheck` passes. Shared versions and goldens remain unchanged.

## VAL-14: OD-9 admission gate blocked before Step 1

The finding is the reviewed plan's pre-flight AMZN #52 claim-audit addendum;
`VAL-14` is absent from the supplied original findings JSON and all supplied
G* triage JSONs. The binding OD-9 and Task 25 therefore supply its trigger.
`tmp/claude-impl/val14-census.py` reads all 45 snapshots in place, with core-form,
exact-date and acquisition cutoffs. `val14-census.tsv` and its result receipt
retain the complete fields (cash, current investments, marketable/current debt,
LTI, equity-method and AFS totals/components). No raw snapshot was copied.

AMZN has 97.9B on `AvailableForSaleSecuritiesDebtSecurities`, no current or
noncurrent AFS split, 78.213B cash, 44.775B current marketable securities and
284.132B other noncurrent assets. The latter total is not proof the 97.9B sits
outside cash/current investments. Maturity bands describe contractual maturity,
not balance-sheet placement. No company name or trusted filing-note placement
is a substitute for a class-wide structured evidence rule. The naive full-total
rule would also admit 46.9B NVDA, 71.084B MSFT, 99.5B GOOGL, 50.285B UNH and
92.413B PGR. NVDA already has 34.143B on `DebtSecuritiesCurrent`; that does not
make the undivided 46.9B wholly outside cash. The current-date TSLA total is
absent (the plan's older 41.6B observation is not reused as a fresh fact).
SNOW has a 1.984482B noncurrent split, which alone still needs reconciliation
against existing LTI; it does not establish AMZN's placement.

OD-9 says: "If the rule would add ... an amount whose placement the filing does
not establish, Task 25 stops and reports to the controller before Step 1."
The gate is triggered. No admission implementation or red test is attempted:
Step 1 is explicitly downstream of this gate. This is a blocked item, not a
claim that the omission disappeared. Offline restrictions also prevent fresh
research/source access; the plan's Damodaran/FASB/S-X citations are unverified
in this run and are not the basis for a new admission. A safe future repair
needs structured filed placement and overlap evidence, not a ticker exception.

| Census issuer | Undivided AFS at anchor, B | AFS noncurrent component, B | Candidate disposition |
|---|---:|---:|---|
| AAPL | not filed | not filed | no new admission |
| AMT | not filed | not filed | no new admission |
| AMZN | 97.9 | not filed | no new admission |
| BA | 0.542 | not filed | no new admission |
| BAC | not filed | not filed | no new admission |
| BRK.B | 17.034 | not filed | no new admission |
| CAT | 3.956 | not filed | no new admission |
| CMCSA | not filed | not filed | no new admission |
| COST | 0.796 | not filed | no new admission |
| CSCO | not filed | not filed | no new admission |
| CVX | not filed | not filed | no new admission |
| DIS | not filed | not filed | no new admission |
| DUK | 5.418 | not filed | no new admission |
| EXPE | not filed | not filed | no new admission |
| FCX | not filed | not filed | no new admission |
| GOOGL | 99.5 | not filed | no new admission |
| HD | not filed | not filed | no new admission |
| INTC | 22.163 | not filed | no new admission |
| JNJ | 3.456 | not filed | no new admission |
| JPM | not filed | not filed | no new admission |
| KO | 2.581 | not filed | no new admission |
| LLY | not filed | not filed | no new admission |
| MA | 0.318 | not filed | no new admission |
| MCD | not filed | not filed | no new admission |
| META | not filed | not filed | no new admission |
| MSFT | 71.084 | not filed | no new admission |
| NEE | not filed | not filed | no new admission |
| NFLX | 8.226455 | not filed | no new admission |
| NNN | not filed | not filed | no new admission |
| NVDA | 46.9 | not filed | no new admission |
| O | not filed | not filed | no new admission |
| ORCL | not filed | not filed | no new admission |
| PEP | not filed | not filed | no new admission |
| PG | not filed | not filed | no new admission |
| PGR | 92.413 | not filed | no new admission |
| PLD | not filed | not filed | no new admission |
| SNOW | 2.62199 | 1.984482 | no new admission |
| T | 0.518 | not filed | no new admission |
| TSLA | not filed | not filed | no new admission |
| TSM | not filed | not filed | no new admission |
| UNH | 50.285 | not filed | no new admission |
| V | 1.393 | not filed | no new admission |
| VZ | not filed | not filed | no new admission |
| WMT | not filed | not filed | no new admission |
| XOM | not filed | not filed | no new admission |

`val14-existing-controls`: 31 tests in four files pass (vendor stakes, D-65,
equity-method stakes and capital-bridge consumers). No production code, stamp,
prompt, golden, fair-value-asset label or legacy rule changes. Rebuilt AMZN
remains 102.97415017927976/share, valuation31.62/F, composite55.48/C; controls
remain as `fin407-after.json`. Intended delta is exactly zero while blocked,
not the conditional 97.9B x 79% / 10.903B = about +7.09/share in the plan.
