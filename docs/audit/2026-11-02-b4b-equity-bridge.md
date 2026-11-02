# P1 / B4b: equity-method stake disposition (2026-11-02)

This is a bounded first family of the requested B4b batch, based on `eecd2703`.
The family commit is **Value equity-method stakes once from their income placement
(FIN-401, FIN-401-V1)**; its full SHA is recorded in the implementation handoff.
No later item has been started. The assigned order and Task 11 dependency remain.

## Findings and receipts

Receipts are under the worktree's ignored `tmp/claude-impl/` directory. The
wrapper ran `npm ci` using Node 24; the lockfile was not changed.

| Finding | Disposition | Commit | Red / green receipts | Stored-report impact |
|---|---|---|---|---|
| FIN-401 | Fixed after review R-1/R-3/R-6: 191.7389267225 -> 196.0576271333/share | Family commit plus review corrections below | `fin401-red-confirmed` / `fin401-green-final` | Conditional display-time method note; figures and bytes retained |
| FIN-401-V1 | Fixed: measured income is removed when same-date or recent filing evidence places the stake inside added-back LTI; BA returns 27.7411147513 -> 27.1152067083 | Family and R-2 methodology correction; full SHA in HANDOFF | `r2-method-red-confirmed` / `r2-method-evidence-controls` | Same note, including filed operating subtotals; no saved figure or byte changes |
| FIN-302 | Not started | None | None | Earlier convertible treatment remains |
| FIN-302-V1 | Not started | None | None | Earlier financial-route treatment remains |
| FIN-302-V2 | Not started | None | None | Earlier EPS interest/divisor treatment remains |
| FIN-407 | Not started | None | None | Earlier multi-class EPS withholding remains |
| VAL-14 | Not started | None | None | No new fair-value financial-asset admission |
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

Stop after this complete family. FIN-302, FIN-302-V1, FIN-302-V2, FIN-407,
VAL-14 and FIN-309 are **not started**. Their mechanisms, outputs, tests and
owner decisions have not been changed. FIN-309 must still wait for Task 11.
In particular, no OD-2 conversion-edge rule or OD-9 asset admission is claimed.

OD-5's known evidence limits remain: partial inclusion and aggregate ambiguity,
provider rows without placement (prior note retained), other mixed windows,
unavailable same-date stake breakouts and untagged income amounts. No amount is estimated to fill a gap.
The integrator must assign D-next, merge the remaining tracks, and run the full
release verification. This implementation does not push, open a PR or merge.
