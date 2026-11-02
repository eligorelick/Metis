# P1 / B4b: equity bridge and invested capital (2026-11-02)

This batch continues all assigned B4b items from `eecd2703`.
The family commit is **Value equity-method stakes once from their income placement
(FIN-401, FIN-401-V1)**; its full SHA is recorded in the implementation handoff.
The FIN-401 family is preserved at `3b775ac7`; later item records follow below.

## Findings and receipts

Receipts are under the worktree's ignored `tmp/claude-impl/` directory. The
wrapper ran `npm ci` using Node 24; the lockfile was not changed.

| Finding | Disposition | Commit | Red / green receipts | Stored-report impact |
|---|---|---|---|---|
| FIN-401 | Fixed after review R-1/R-3/R-6: 191.7389267225 -> 196.0576271333/share | Family commit plus review corrections below | `fin401-red-confirmed` / `fin401-green-final` | Conditional display-time method note; figures and bytes retained |
| FIN-401-V1 | Fixed: measured income is removed when same-date or recent filing evidence places the stake inside added-back LTI; BA returns 27.7411147513 -> 27.1152067083 | Family and R-2 methodology correction; full SHA in HANDOFF | `r2-method-red-confirmed` / `r2-method-evidence-controls` | Same note, including filed operating subtotals; no saved figure or byte changes |
| FIN-302 | Fixed | `71e58818` | `fin302-red-confirmed` / `fin302-green-final` | Conditional pre-1.56.0 note; saved figures retained |
| FIN-302-V1 | Fixed | `71e58818` | Same receipts | Same note for excess-return values |
| FIN-302-V2 | Fixed | `956c5b0d` | `fin302v2-red-confirmed` / `fin302v2-green` | Earlier figures stay; conditional convertible note applies |
| FIN-407 | Fixed | `991238bb` | `fin407-red`, `fin407-stored-red` / `fin407-green-final` | Explain old admission sentence; saved EPS unchanged |
| VAL-14 | Blocked at OD-9 Step 0 | `5b00696d` | `val14-census`, `val14-existing-controls` | No change to stored or new figures |
| FIN-309 | Fixed | Financial-date commit (handoff) | `fin309-red`, `fin309-pgr-red`, `fin309-stored-red`, `fin309-citation-red` / `fin309-green-final`, `fin309-citation-green` | Explain earlier date mismatch; saved numbers/dates retained |

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
history when the bridge adds positive LTI that holds the stake. A same-date
stake fact establishes placement directly. Otherwise use the confirmed issuer's
most recent stake-breakout filing: its balance date must be within 12 months
before the bridge, its same-date/same-currency LTI must be at least the stake,
and bridge-date LTI must also be at least that stake. Both prior facts must be
from the same filing available by the acquisition cutoff. Notes identify that
filing, filing date and balance date. The older breakout is placement evidence,
never an amount carried forward; all valuation amounts remain filed bridge-date
values. Null/zero LTI, a smaller bridge LTI, a stake outside prior LTI, or no
qualifying breakout within 12 months leaves income in EBIT, valuing the stake
through its income and preserving the reviewer's dropPath control.
Inside unmeasured income with a positive located stake makes the whole window
operating: each seed quarter and history year restores measured income previously
subtracted from EBIT and keeps its stake in operating capital, including the
sales-to-capital history; there is no
separate stake add-back or sale-tax deduction. Immaterial/filed-zero quarters
take the other quarters' measured placement; an all-immaterial window does not
establish inclusion. Q4 operands reuse B13's one-presentation resolver, and a
refused operand is never silently zero (I4).

The equity-method stake is the whole LTI only when its provenance consists
solely of equity-method investments. Otherwise it is bounded by the same-date,
same-currency filed stake and LTI; no amount is estimated. Operating treatment
and partial-composition splits still require a same-date stake amount (R-4).
Older placement evidence cannot size them. Other mixed windows
and ambiguous arithmetic retain the prior treatment
and explicitly state the S-X Rule 5-03 assumption. Windows with no placement
on any row keep the prior note without an undetermined-placement claim (R-5).
The LTI total's component floor uses B13's existing `unlessBelow` rule, max(0.5%, 2M). The provider fill
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
| XOM | 191.7389267225 | 196.0576271333 | +4.3187004108 | FIN-401, including review R-1/R-3/R-6 |
| BA | 27.7411147513 | 27.1152067083 | -0.6259080430 | FIN-401-V1: recent same-issuer filing places the stake inside added-back LTI |
| GOOGL | 215.5926213765 | 215.5926213765 | 0 | Control for this family; convertibles unstarted |
| AMZN | 102.9741501793 | 102.9741501793 | 0 | Control for this family; VAL-14 unstarted |
| KO | 41.0870765940 | 41.0870765940 | 0 | Below-operating component path |
| DUK | 36.6627397809 | 36.6627397809 | 0 | Aggregate path stays undetermined |
| T | Withheld | Withheld | None | Existing sales-to-capital refusal |
| DIS | Withheld | Withheld | None | Existing WACC interest-expense refusal |
| CMCSA | Withheld | Withheld | None | Existing WACC weights refusal |
| NEE | Withheld | Withheld | None | Existing DCF domain refusal; computed equity unchanged |

XOM's base and corrected final equity values are 800.3182801397B and
818.3445356544B; its unchanged divisor is 4.174B. The whole 18.0262555147B
increase reconciles (the former 743.3384630263B used mixed margin history):

| XOM equity bridge change | Amount, B | Attribution |
|---|---:|---|
| Operating enterprise value, 829.5562601397 to 873.9084756544 | +44.3522155147 | FIN-401: sales-to-capital 1.3938132874 to 1.2378923835, with seed and history on the operating basis (review R-1/R-3/R-6) |
| Remove the separately added equity-method stake | -33.3240000000 | FIN-401: no second valuation |
| Remove the sale-tax line on that removed add-back | +6.9980400000 | FIN-401: no sale of the operating-treated stake |
| Total equity change | +18.0262555147 | Sum of the three lines |

The base already deducts 7.1637200000B of successor pension/OPEB and
9.8892200000B of predecessor asset-retirement obligations, both after tax.
They are unchanged here. Adding those existing bridge lines back reconstructs
817.3712201397B before those B4a deductions; subtracting them and adding this
family's +18.0262555147B gives 818.3445356544B with no residual (I10).

BA's TTM affiliate result is 35M: Q3 17M, derived Q4 -14M, filed-zero Q1 0M,
and Q2 32M. Removing it lowers the seed from 4.9289855843% to 4.8917495611%
and per-share value from 27.7411147513 to 27.1152067083. The prior strict R-2
guard incorrectly reversed FIN-401-V1 by demanding a same-date stake amount:
BA has 1.117B LTI at 2026-06-30 but no same-date `EquityMethodInvestments` fact.
The integrator replaces that methodology on its merits. The latest breakout
is 997M inside 1.048B LTI at 2025-12-31 (10-K accession
0001628280-26-004357, filed 2026-01-30), within 12 months, and bridge LTI
exceeds that stake. It establishes placement, so the measured 35M leaves EBIT
and the stake is valued once within the unchanged 1.117B LTI add-back and
234.57M tax. No older amount is carried forward. Sales-to-capital stays
3.0442738697; equity moves 22.0014781092B -> 21.5050704404B. Notes cite the
prior filing, filing date and balance date, and explain its limited use.

No band moves. XOM valuation score changes 44.38/D to 45.77/D, composite
56.43/C to 56.56/C. BA remains valuation 15/F and composite 40.27/D. GOOGL
and AMZN keep their scores, denominators and bands.

## Review corrections (FIN-401)

The independent review covers base `3b775ac7`. The audit's XOM benchmark
($182.17 at audit time and $178.0877966043 at this base) used the same mixed
history; the corrected figure is expected to differ from it. Only DCF inputs
are normalized here; source statements and historical ROIC remain as filed. The
real composite is 56.56/C, versus the reviewer emulation's 56.73/C: the emulation
also changed source EBIT before Stage B and therefore historical ROIC. The
valuation score and per-share value match that emulation exactly.
Stored-report figures and bytes are unchanged under D-67.

| Review finding | Change / disposition | Commit | Red / green receipts | Measured evidence |
|---|---|---|---|---|
| R-1 (High) | Fixed: window treatment governs every margin-history year | `c1a87830` | `r1-r3-r6-red-confirmed` / `r1-r3-r6-green-confirmed` | XOM 178.0877966043 -> 196.0576271333/share; equity 743.3384630263B -> 818.3445356544B; valuation 40/D -> 45.77/D; composite 55.75/C -> 56.56/C |
| R-2 (Medium) | Fixed with revised methodology: measured income leaves EBIT when added-back LTI holds the stake, established by same-date or bounded recent-filing evidence | Correction atop `9fd13a22`; full SHA in HANDOFF | `r2-method-red-confirmed` / `r2-method-evidence-controls` | BA 27.7411147513 -> 27.1152067083; null/zero LTI dropPath, smaller LTI, stale breakout and outside-LTI controls keep income; no older amount carried forward |
| R-3 (Low) | Fixed with R-1: keep each history year's located stake in capital under the operating window | `c1a87830` | Same receipts; five-year 0.2000x capital-history regression | XOM applied sales-to-capital stays 1.2378923835; records now describe actual history |
| R-4 (Low) | Fixed: zero located value cannot select operating treatment; disclose unlocated stake with undetermined placement | `0765df9f` | `r2-r4-red` / `r2-r4-green` | Existing 300M LTI add-back and -63M tax retained; false 0M operating-stake claim removed |
| R-5 (Low) | Fixed under confirmed rule and census exceptions: no placements keep prior note; explicit ambiguity keeps its assumption. Requested AMZN reversal does not meet that trigger (see below) | `07ff60d0` | `r5-red` / `r5-green` | GOOGL/DEMO note-only reversal; AMZN has explicit measured/undetermined placements and keeps its note; all numeric leaves unchanged; only intended-delta leaf `stageB.valuation.notes.7` re-pinned, naming R-5 |
| R-6 (Low) | Fixed with R-1: mixed unmeasured-inside/measured-below quarters use the operating basis throughout, including the seed | `c1a87830` | Same receipts; mixed-quarter test 18.75% -> 20% | BA, GOOGL, AMZN, KO, DUK and T/DIS/CMCSA/NEE controls unchanged in `r1-replay-after` |
| R-7 (Low) | Fixed: first CHANGELOG heading is `Unreleased - P1/B4b equity bridge (2026-11-02)`, below the preamble | `501e4eb5` | `r7-red` / `r7-green`; `r7-docs-green` | Heading-only change; no figure or stamp changes |

The first green attempt exposed a test-fixture currency omission: the bridge
correctly selected the annual balance, so the hand-computed quarterly 0.2x
expectation was inapplicable. Explicit USD quarterly balances now exercise the
floor; the red receipt already independently shows the wrong 0.2162x history
median versus 0.2000x. No existing assertion or monetary pin was weakened.
The real-code census uses `replay-fin401.mts`, adapted from the copied original
and reviewer harness, with all variants/emulation removed. `review-replay-before`
and `r1-replay-after` write `replay-before.json` and `replay-basis-fixed.json`.
Every identity was admitted without adaptation; reference inputs stay external.

### Final real-code census versus reviewed commit

Before is `3b775ac7`; after includes R-1 through R-7 and the revised R-2 rule.
Receipts: `review-replay-before` / `r2-method-replay-after`; derived measurements
are `replay-before.json` / `r2-method-after.json`. Every issuer already passes
identity admission, so no adaptation was used.

| Census | DCF/share before -> after | Valuation score/band before -> after | Composite score/band before -> after |
|---|---:|---|---|
| XOM | 178.0877966043 -> 196.0576271333 | 40.00/D -> 45.77/D | 55.75/C -> 56.56/C |
| BA | 27.1152067083 -> 27.1152067083 | 15.00/F -> 15.00/F | 40.27/D -> 40.27/D |
| GOOGL | 215.5926213765 -> 215.5926213765 | 22.14/F -> 22.14/F | 63.88/C -> 63.88/C |
| AMZN | 102.9741501793 -> 102.9741501793 | 31.62/F -> 31.62/F | 55.48/C -> 55.48/C |
| KO | 41.0870765940 -> 41.0870765940 | 16.50/F -> 16.50/F | 55.37/C -> 55.37/C |
| DUK | 36.6627397809 -> 36.6627397809 | 46.29/D -> 46.29/D | 51.98/D -> 51.98/D |
| T | Withheld -> Withheld | 42.96/D -> 42.96/D | 52.52/D -> 52.52/D |
| DIS | Withheld -> Withheld | 71.34/B -> 71.34/B | 57.86/C -> 57.86/C |
| CMCSA | Withheld -> Withheld | Withheld -> Withheld | 54.34/D -> 54.34/D |
| NEE | Withheld -> Withheld | 77.99/B -> 77.99/B | 52.50/D -> 52.50/D |

XOM's +75.0060726282B equity change from the reviewed commit is entirely
operating EV; bridge stake and sale-tax lines were already removed there.
Its margin target moves 13.24% -> 14.27%, improving -> stable. Real-code
composite is 56.56/C rather than the emulation's 56.73/C because source EBIT
and ROIC history are not changed. No bands change. Refused controls retain
both their per-share refusal and their numeric/evidence/score inputs; NEE's
computed negative equity stays -29.6433276266B.

The integrator's prior confirmation to retain both BA and AMZN deviations is
replaced for BA by the placement-evidence rule above. The correction replay
against immediate base `9fd13a22` is `r2-method-replay-before` /
`r2-method-replay-after`, producing `r2-method-before.json` /
`r2-method-after.json`. BA alone changes: 27.7411147513 -> 27.1152067083;
its valuation remains 15.00/F and composite 40.27/D. XOM remains
196.0576271333 with 45.77/D valuation and 56.56/C composite. Every measured
output for GOOGL, AMZN, KO, DUK and T/DIS/CMCSA/NEE is identical; refusal
evidence and NEE's -29.6433276266B computed equity are preserved. No band moves.

AMZN's confirmed note outcome remains:

- R-5's no-placement trigger is false. Q2/Q1 2026 have filed immaterial
  income -11M/-19M; derived Q4 2025 has -467M and Q3 has -73M, both explicitly
  undetermined on the aggregate path. Its note therefore retains the Rule 5-03
  assumption. GOOGL has no placements and its note is restored; DEMO's same
  note reversal is the only re-pinned fixture leaf. A ticker exception would
  contradict the class-wide rule. This accepted evidence outcome is unchanged
  by the R-2 correction. All seven review findings remain fixed.

The final nine-test regression file is also replayed against an archive of
`3b775ac7`, using the corrected explicit-USD quarterly fixture:
`review-base-red-final` has eight defect failures and one control passing;
`r2-dated-stake-control-green` has all nine passing on the repaired code.
The earlier failed dated-stake control read a nonexistent bridge date field;
its corrected assertion uses the actual sales-to-capital basis and does not
change production behavior.

### Review verification receipts

All financial replays and tests use offline retained inputs and Node 24 through
the isolated wrapper. Vitest commands use at most two workers; no provider or
model calls were made. The final evidence/control commit is listed in HANDOFF.

| Receipt | Result / scope |
|---|---|
| `review-green-related-final` | 414 tests in 19 files passed; all 16 reviewer files plus new regression, fair-value and scenario-target consumers |
| `r5-green` | 324 tests in 5 files passed, including `stageC.payload.passes`, exact intended deltas and D-65 |
| `review-green-consumers-final` | 472 tests in 7 files passed, including jobRunner, reverse-DCF context, audit surfaces, print/HTML/history exports and degraded fair value |
| `r2-dated-stake-control-green` | All 9 final regressions passed; `review-base-red-final` gives 8 defect failures and 1 passing control at `3b775ac7` |
| `r7-docs-green` | 113 tests in docs lint, release and version stamps passed; final record edits are covered by `review-docs-complete` in HANDOFF |
| `review-typecheck-complete` | Exit 0 after the final dated-stake control |
| `review-lint-complete` | Exit 0, no lint warnings after the final dated-stake control |
| `review-audit-deltas-final` | Exit 1 at only the same pre-existing `report.balanceSheet.coverage.commentary.1` and `stageB.capital.current` paths; no new raw mismatch was accepted |
| `review-replay-before` / `review-replay-final` | Historical pre-correction review census; BA strict-rule outcome is superseded by the R-2 correction above |

R-2 methodology correction receipts (all at most two Vitest workers):

| Receipt | Result / scope |
|---|---|
| `r2-method-red-confirmed` | 2 expected failures (recent breakout and exact 12-month boundary), 16 controls passing before production edits |
| `r2-method-evidence-controls` | 29 tests in 2 files pass: R-1/R-2/R-4, partial composition, five fallback cases, exact boundary, latest breakout, issuer/currency/filing/cutoff/form/instant controls |
| `r2-method-review-gates` | 424 tests in 19 files pass: reviewer list plus fair-value/scenario consumers; six added evidence controls pass in the receipt above |
| `r2-method-payload` | 302 tests in 2 files pass: payload golden and exact intended deltas; no fixture regeneration or intended-delta edits |
| `r2-method-consumers` | 472 tests in 7 files pass: jobRunner, reverse-DCF context, audit surfaces, print/HTML/history exports, output audit and degraded fair value |
| `r2-method-docs` | 113 tests in 3 files pass: docs lint, repository release and version stamps; final receipt after these result records is `r2-method-docs-final` |
| `r2-method-typecheck` / `r2-method-lint` | Both exit 0; lint has no warnings |
| `r2-method-audit-deltas` | Exit 1 at only the two independently confirmed pre-existing paths: `report.balanceSheet.coverage.commentary.1` and `stageB.capital.current`; exact intended-delta comparison passes |
| `r2-method-replay-before` / `r2-method-replay-after` | Real-code census at `9fd13a22` and corrected code; BA-only delta above |

The first review docs run failed because the new test was not yet in Git's
tracked-file inventory; staging the explicit test path resolved it in
`r1-docs-green-tracked`. Existing Vite CommonJS/config-loader notices remain
unchanged. No full `npm run verify` was run, as the brief reserves it for the
integrator. Stamps, all monetary golden leaves, stored-report figures/bytes,
coverage floors and existing assertions remain unchanged by these review fixes.

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
  the LTI note (restored to its prior wording by review R-5). No monetary
  fixture leaf is re-pinned.
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

The continuation below completes FIN-302, FIN-302-V1, FIN-302-V2, FIN-407
and FIN-309. Task 11 and the continuous OD-2 rule are implemented. VAL-14
is blocked by OD-9 before admission Step 1. Final counts: seven fixed, one
blocked, zero not reproduced, zero partially fixed, zero not started.

OD-5's known evidence limits remain: partial inclusion and aggregate ambiguity,
provider rows without placement (prior note retained), other mixed windows,
unavailable same-date stake breakouts and untagged income amounts. No amount is estimated to fill a gap.
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

The original continuous M6 rule used triangular adjustment weight across the band
(superseded by round-2 F6 below);
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
therefore first deducted from common book. Review F1 identified the subsequent
face-value add-back as inconsistent, not conservative; round 2 restores the
book before valuing conversion. Its consistent minimum is 11.810467549421368;
11.879000243131742 is the converted-only reading, not the minimum.
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
valuation 87.35 and composite 80.13/B stay. Unmodified NVDA EPS
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

## FIN-309 continuation and final verification

Task 11 is complete at `71e58818`. `fin309-red` reproduces five date/roll
failures with the DCF control passing. `fin309-pgr-red` proves the retained
PGR input lacks the quote-date field at `5b00696d`; `fin309-stored-red` proves
the missing legacy explanation. `fin309-green-final` passes 135 tests in ten
files, including the PGR pipeline, financial routes, previous reverse-solve
controls and legacy views. `fin309-citation-red` catches book/absent dates on
rolled headline/grid payload citations; `fin309-citation-green` passes 27
tests including all eight date controls and all financial visibility tests.

The roll is (1 + CoE)^(days/365.25) for headline ages 1-200 days. The 0, 200,
201-day boundaries, backward quote, missing CoE, currency refusal, own-date
alternative/grid, 240-day alternative under a 150-day headline, convertible
reverse round-trip, withheld unknown alternative date and DCF control are
covered. It is gross of distributions, explicitly disclosed. Beyond the limit
fair-value asOf stays book, with an info gap; raw book/return diagnostics retain
their original dates. P/TBV and continuing-value share use their book bases.
The reverse solve discounts its quote target by the headline factor and keeps
the chosen convertible claim/divisor. Classic/dossier, Markdown and print use
the existing shared legacy adapters; saved dates, figures and bytes stay.

Replays `fin309-replay-before` / `fin309-replay-after` rebuild all six statement
members on each side (before `5b00696d`), retain acquired evidence and use
side-specific TSX aliases. No network, provider or model calls.

| Shape | Before/share | After/share | Valuation score | Composite |
|---|---:|---:|---|---|
| Bank quote 2026-04-01 (1 day) | 12.467587163860598 | 12.470372158232475 | unavailable -> unavailable | 63.88/C -> 63.88/C |
| Bank quote 2026-07-05 (96 days) | 12.467587163860598 | 12.737803397932037 | unavailable -> unavailable | 63.88/C -> 63.88/C |
| Insurer quote 2026-04-01 | 12.30951084413699 | 12.312260527613907 | unavailable -> unavailable | 65.92/C -> 65.92/C |
| Insurer quote 2026-07-05 | 12.30951084413699 | 12.576301011299876 | unavailable -> unavailable | 65.92/C -> 65.92/C |
| Retained PGR, quote 2026-10-21 (113 days) | 293.4674325041842 | 300.2180924804883 | 81.96 -> 82.66 | 73.09/B -> 73.31/B |
| BAC (outside roll limit) | 41.396348578171214 | 41.396348578171214 | 44.13 -> 44.13 | 57.49/C -> 57.49/C |
| JPM | withheld | withheld | 20 -> 20 | 55.10/C -> 55.10/C |
| General quote 2026-04-01 | 33.43339975109757 | 33.43339975109757 | 15 -> 15 | 58.93/C -> 58.93/C |
| General quote 2026-07-05 | 34.12465562909289 | 34.12465562909289 | 15 -> 15 | 58.93/C -> 58.93/C |

The separate checked-in PGR issuer pipeline uses the retained 2026-10-19 quote
and asserts that date and its exact opening-book elapsed period. XOM, BA,
GOOGL, AMZN, NVDA, DUK, EXPE and META retain their figures/grades from the
prior item. No new band moves. No prompt or numeric golden changes; the shared
report/payload/Stage B/fair-value/scenario stamps stay as FIN-401 set them.

Self-review was performed by the implementation sub-agent, without spawning a
reviewer (the task requires the implementer to work directly). It checked exact
period/date admission, restore caps, cash-principal/unknown settlement, preferred
overlap, chosen re-run arithmetic, EPS interest/divisor, optional schema arrays,
legacy cutoffs/idempotence, date boundaries and downstream payload provenance.
The citation date defect found in this review was verified red then green above.
A fresh independent integration review remains the integrator's responsibility.
The only unresolved item is VAL-14's explicit owner admission gate; no other
owner-level methodology question is needed. No push, PR, merge, stash, history
rewrite, live run or full `npm run verify` was performed.

Final successful receipts, all offline through Node24 wrapper and Vitest
`--maxWorkers=2` in this continuation:

| Receipt | Result |
|---|---|
| `b4b-final-consumers` | 822 tests / 17 files; bridge, claims, EPS, schema, fair value, scenarios, payload and job-runner consumers |
| `b4b-final-payload-export` | 511 tests / 7 files; final payload dates, export/print, assessments and audit fixture/delta contracts |
| `fin309-green-final` | 135 tests / 10 files; financial routes, PGR pipeline, reverse solve and legacy adapters |
| `fin309-citation-green` | 27 tests / 2 files; final date controls and per-share payload citation dates |
| `b4b-final-records` | 113 docs/release/stamp tests |
| `b4b-final-typecheck-v2` | exit 0 after final production/date tests |
| `b4b-final-lint` | exit 0, no warnings from ESLint |

The pre-existing Vite CommonJS/configLoader notice remains. The two raw
`audit:deltas` description mismatches recorded before this continuation
(`report.balanceSheet.coverage.commentary.1`, `stageB.capital.current`) remain
unpinned; the exact fixture/contract tests preserve their reviewed normalization
and pass. No unrelated fix, assertion deletion, coverage floor change or full
verify run was introduced. Diff checks found no added replacement characters,
non-ASCII code/test lines, ticker-specific source rule or Stage B config read.


## Review round 2: F1/F7

Excess-return variants restore converted notes and preferred into opening common book before residual-income valuation. The selected book, book path, continuing value, fiscal-year alternative, grid and reverse solve agree; no face-value claim is added after valuation. Route tests exercise actual bank, insurer and mortgage-REIT bundles with notes and tagged-only preferred. The ROE 15% and 6% examples publish the lower of V(BV0-C)/(D-N) and V(BV0)/D; the retained mortgage-REIT preferred case returns from 11.191334135837607 to the consistent minimum 11.810467549421368 (the converted-only reading is 11.879000243131742). The earlier decline was inconsistent, not conservative.

| Finding | Disposition | Commit | Red / green receipts | Stored-report impact |
|---|---|---|---|---|
| F1/F7 | Fixed | Same commit as this record; full SHA in HANDOFF-FIXROUND-2 | `f1-f7-red` / `f1-f7-green-final` | Saved figures/bytes retained; re-run uses corrected method |

The requested 11.879000243131742 mortgage-REIT pin conflicts with the specified
minimum rule: BV0=520M, C=50M, D=110M, N=10M and V(BV0)=1306.690026744M.
The claim reading is V(470M)/100M=11.810467549421368; the converted reading
is V(520M)/110M=11.879000243131742. Keep the mathematical minimum and flag
this conflict to the coordinator. Initial green runs caught the old 950-book
alternative-row lookup (now selected-reading book) and an over-precise new
reverse-solve assertion; the inverse now equals the consistent control exactly.


## Review round 2: F2

Market EV folds the exact-date convertible-preferred carrying claim under the same larger-on-ambiguous-overlap or distinct-series sum rule as the DCF. Each own-history quarter folds its own dated claim before EV/Sales and EV/EBITDA observations and ranks; no current claim is backfilled into an earlier date. A 500M tagged-only preferred raises market EV by exactly 500M; permanent-preferred overlap controls prevent a second claim.

| Finding | Disposition | Commit | Red / green receipts | Stored-report impact |
|---|---|---|---|---|
| F2 | Fixed | Same commit as this record; full SHA in HANDOFF-FIXROUND-2 | `f2-red` / `f2-green-initial` | Saved figures/bytes retained; re-run uses corrected method |


## Review round 2: F3

The bridge audit table labels each convertible reading as a memo inside the preceding arithmetic lines. Its Value cell is a dash, so the claim is not displayed as a second amount to deduct. Instrument reading, removed shares and restored claim remain in the memo text; optional absent arrays remain safe for stored reports.

| Finding | Disposition | Commit | Red / green receipts | Stored-report impact |
|---|---|---|---|---|
| F3 | Fixed | Same commit as this record; full SHA in HANDOFF-FIXROUND-2 | `f3-red-confirmed` / `f3-green` | Saved figures/bytes retained; re-run uses corrected method |


## Review round 2: F4

The fiscal-year alternative reads convertible preferred through the same exact-date at() reader at startAlternative.asOf, not the later headline balance date. Missing or filed-zero preferred at that date is zero. Fold and overlap evidence belong to that date; any selected preferred conversion restores only the alternative-date claim. The alternative and its grid row share that book, so a later issuance changes neither earlier book nor its value.

| Finding | Disposition | Commit | Red / green receipts | Stored-report impact |
|---|---|---|---|---|
| F4 | Fixed | Same commit as this record; full SHA in HANDOFF-FIXROUND-2 | `f4-red` / `f4-green` | Saved figures/bytes retained; re-run uses corrected method |


## Review round 2: F5

Converted-note EPS uses the issuer's blended effective debt rate (not the note's coupon; may overstate the add-back). The assumption names that limitation beside the rate and restored claim. The interest cap, unavailable-rate refusal and all EPS amounts are unchanged; a tagged instrument-specific effective rate remains future work.

| Finding | Disposition | Commit | Red / green receipts | Stored-report impact |
|---|---|---|---|---|
| F5 | Fixed | Same commit as this record; full SHA in HANDOFF-FIXROUND-2 | `f5-red` / `f5-green` | Saved figures/bytes retained; re-run uses corrected method |


## Review round 2: F6

The coordinator-delegated choice is a flat-top conversion weight: full weight for abs(r-1) <= 3%, linear taper to zero at 5%, r=N/(C/K). Both claim-share removal and converted-claim restoration use that weight. Tests cover both 3% edges, both 5% edges and continuity across each. This replaces the triangular blend because ordinary carrying discounts should still receive full correction; option time value remains excluded.

| Finding | Disposition | Commit | Red / green receipts | Stored-report impact |
|---|---|---|---|---|
| F6 | Fixed | Same commit as this record; full SHA in HANDOFF-FIXROUND-2 | `f6-red` / `f6-green` | Saved figures/bytes retained; re-run uses corrected method |
