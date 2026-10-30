# B5a: seasonality, calendars and the guided quarter

Prepared 2026-10-29 for review; merge date is pending. This is Part A of the
[B5 plan](../superpowers/plans/2026-10-27-audit-fix-05-seasonality-calendars-and-dcf-inputs.md),
after B4a main `222f92a082aa63e254783291ca21ee299a5dad9b`.
[D-136](DECISIONS.md#d-136---audit-b5a-2026-10-27-seasonality-5253-week-calendars-and-the-guided-quarter-on-one-basis)
records the choices; [METHODOLOGY](../METHODOLOGY.md) describes the implemented rules.
Report 1.51.0, payload 1.53.0 and Stage B ACCOUNTING_EVIDENCE_32 are next after
B4a. Numbering must be rechecked if another batch merges first. B5b is not part
of this change. No merge or live-provider acceptance is claimed here.

## Findings and implementation

| Finding | Severity | Disposition and task commit |
|---|---|---|
| FIN-301 | High | Task 1, `e069b1af`: revenue and interest annualisation use the filed quarter length; the DCF base flows use 52 weeks for a 371-day period. Task 29, `e392b3b4`, preserves filed ratios and scenario shocks exactly. |
| FIN-301-V1 | High | Tasks 1–3, `e069b1af`, `21265dfd`, `2ab443de`: guided and year-ago quarters use their own lengths; an evidenced weekday calendar dates Q4, with unknown future extra-week placement disclosed. |
| FIN-101 | High | Task 3, `2ab443de`: take guidance out of its own season and use a quarter-plus-other-three-quarters consistency floor. |
| FIN-101-V1 | Medium | Task 4, `27f4d3fe`: reverse-DCF context publishes guided YoY, removing annualised run-rate and sequential comparisons; the twelve-month trigger no longer uses a next-quarter level. |
| FIN-101-V2 | Low | Task 3, `2ab443de`: no sequential fallback or sequential widening of the guard without a usable guided year-ago comparison. Keep the existing run-rate/TTM and explain the missing comparison. |
| FIN-301-V2 | Low | Task 3, `2ab443de`: both quarters' lengths enter the sequential evidence calculation. Task 4 removes that evidence from comparable growth context. |
| FIN-301-V3 | Low | Task 2, `21265dfd`: infer a unique filed weekday calendar before snapping nearby estimate dates and calendarising consensus. |

Task 3b (`e2ee9923`) adds R4's release-specific outlook caveats without changing
guidance or valuation. Task 17 (`f8e6de41`) adds immutable display notes to older
reports. Tasks 23/24 (`3100587f`, `01b0546e`) advance the stamps and explain each
golden change. Task 25 (`4dcfff80`) records the sole DEMO delta. Tasks 26/27
(`c7270190`, `0066e706`) update the changelog and decision record.
Each behavior change has an observed failing test followed by a passing test;
the execution ledger keeps the logs and exact commit identities.

## Offline replay

Inputs are the 45 keyless census snapshots built 2026-10-21 from SEC filings
and Yahoo prices; keyed audit snapshots #43, #46 and #48–#50; and the retained
AMZN #51/#52 run inputs. All 52 keep their own saved Stage B configuration,
including the lease switch. Each side is extracted with `git archive`, not
linked to another checkout. The same empty temporary Local/Roaming profile,
empty database guard, dead proxy, throwing fetch and protected-path guards
apply to main and branch. Guards stay empty and profiles are deleted on exit.
There is no network, provider or model call in this replay.

Evidence stays outside the repository in
`%USERPROFILE%\metis-backups\fix-state\b5-evidence`. The unified replay covers
both the census and keyed inputs; its per-input computed results, context,
captured interest calls and `census.json` retain full precision. The verifier
records **2,342 changed numeric leaves**, including added explanatory metadata,
with an owning task, the source snapshot's SHA-256 and the filed periods and
amounts behind it. No unexplained numeric leaf remains. Source fixtures are
read only, never committed. The PR and execution ledger record the final head
used for the final replay and nine-gate run.

### Report-facing figures

Money is USD; B means billion. “Stored” is historical evidence, not the current
main baseline. In particular, AMZN #43 predates several earlier fixes.

| Input and figure | Stored | Main after B4a | B5a | Cause and filed evidence |
|---|---:|---:|---:|---|
| MU #46 revenue run-rate | 216.92B | 216.916B | 201.422B | Task 1: filed 54.229B over 2026-05-29–09-03, 98 days; 4 × 54.229 × 13/14. |
| MU #46 DCF starting revenue | 133.19B | 133.188B | 130.675019B | Task 1: the four filed quarters span 2025-08-29–2026-09-03, 371 days; × 52/53. |
| MU #46 year-one revenue | 249.38B | 249.379268B | 231.566463B | Task 1: the corrected quarter run-rate feeds the existing carry. |
| MU #46 DCF per share | 5,000.09 | 5,000.089349 | 3,981.130838 (−20.38%) | Task 1: shorter annualised quarter and 52-week starting base; the model's cyclical extrapolation is unchanged. |
| NVDA #48/#49/#50 year one | 526.40B | 526.398990B | 516.335229B | Task 2: the vendor's FY2027 2027-01-25 estimate is six days before the filed last-Sunday rule's 2027-01-31. |
| NVDA #48/#49/#50 year-one growth | 73.75% | 73.746816% | 70.425103% | Task 2: the same corrected forecast window. |
| NVDA #48/#49/#50 DCF per share | 229.52 | 230.231861 | 230.114033 (−0.0512%) | Task 2; B4a explains why stored and main differ. |
| Census NVDA year one / DCF per share | — | 548.968521B / 424.380063 | 499.224121B / 297.517973 (−29.89%) | Task 3: 108B guided midpoint, same-quarter filed revenues, and the required mean of three growth-adjusted factors. Named explanation below. |
| Census AMZN year one / DCF per share | — | 829.089573B / 101.811471 | 834.597121B / 102.974150 (+1.14%) | Task 3: 199.5B guided midpoint and three factors averaging 0.9934009499710115. |
| AMZN #43 year one / DCF per share | 791.409691B / 72.49 | 829.089573B / 86.377176 | 834.597121B / 87.172750 (+0.92%) | Task 3; the stored report used a sequential carry, while current main already uses YoY. |
| AMZN #51/#52 year one / DCF per share | #51 extract has no DCF; #52: 876.360262B / 116.12 | 876.360262B / 124.142628 | Identical | Consensus remains above the new 792.511B floor; no B5a valuation move. |
| COST census year one / DCF per share | — | 333.048833B / 329.064286 | 328.545282B / 321.903102 (−2.18%) | Task 1: filed latest-quarter revenue 95.723B over 112 days becomes a 311.099750B annual run-rate ceiling. |
| KO census starting revenue / DCF per share | — | 49.284B / 39.857982 | 48.354113B / 41.087077 (+3.08%) | Task 1: its filed TTM spans 371 days. Year one stays 51.030410B; the lower comparable starting base changes the growth fade. Filed ratios and shocks are exact main values. |
| PEP census forecast interest run-rate | — | 0.941390093B | 1.019839268B | Task 1 / E1: its 84-day quarter's 242M interest, average debt 53.3475B and closing debt 51.881B; × 13/12. DCF per share is unchanged. |
| AMZN #52 reverse-DCF guided context | annualised run-rate comparison, 2.88% | same incompatible comparison | guided-quarter YoY, 10.729371% | Task 4: guided 199.5B versus the same fiscal quarter's 180.169B; no annualised or sequential context row. |
| AMZN #43/#51/#52 and census AMZN caveats | none | none | two Prime Day caveats; guided issuer effect +4pp | Task 3b: 2026-07-30 guide qualifier and 2026-04-29 latest-quarter qualifier, each on its own row. Valuations are unchanged by this disclosure. |

Nine inputs change DCF per share; the other 43 do not. WACC, synthetic rating,
ERP and its label, terminal ROIC, the ROIC series, sales-to-capital,
current-capital start, degraded-inputs reasons and every scenario shock are
exactly unchanged on all 52. Fair-value states/reasons and critical-gap lists
also match main: no main-publishable input becomes Blocked. Margin and tax
vectors retain main's values; their appended valuation sensitivities describe
the newly computed DCF where revenue legitimately changes it.

DEMO's complete fresh-main/branch projection differs only at
`report.meta.specVersion`, 1.50.0 → 1.51.0 (Task 23). Its valuation leaves are
identical. `audit:deltas` ran dry, that leaf was independently traced, and only
then was `--write --group audit-b5a-seasonality-calendars-20261027` run. The
historical fixture baseline is 1.2.0, so that path moves from B4a's group into
B5a's group with its reason and D-136 reference.

The separate payload golden is an AAPL-shaped synthetic fixture, not a replay
input. Task 1 moves none of its leaves. Task 2 owns 187 payload changes
(182 numeric) and 271 finance changes (257 numeric): year one
451.493151B → 457.291209B, DCF/share 120.656870 → 125.542162. Beyond Task 2,
the final payload changes only its version and Task 4's one context note;
finance is identical. The resulting payload hash is `1.53.0:e5c9eae4`.

### E1 and E5, on their own commit pairs

**E1:** base `222f92a` against Task 1 `e069b1af`. A pass-through wrapper captures
the actual `interestRunRate` arguments and exact result; every full computed
result is also compared with the uninstrumented module. Across 52 inputs there
are 26 calls, only PEP moves, and its after/before ratio is 13/12 within 1e-9
relative. COST (112 days) and MU #46 (98 days) close their fiscal year, so their
latest quarters do not enter this path. KO's 93-day quarter is not rescaled.
EPS assumption lines are retained alongside the full-precision calls. This
extension was **confirmed by the main session on this evidence (decisions spec
4.3, 2026-10-28)**; the current exact-commit replay confirms the expected case.

**E5:** Task 2 `21265dfd` against Task 3 `2ab443de`. Only guidance-led census
NVDA, census AMZN and AMZN #43 move year one or per share. Consensus-led inputs,
including #48–#50 and AMZN #51/#52, are identical in this pair.

NVDA is the named over-10% move. R1 requires the mean of up to three factors;
the pre-flight illustration measured one. Filed quarter/TTM comparisons give
1.0193048814079904, 0.9050296941259413 and 1.3745956935570887, mean
**1.09964342303034**. Following that binding formula gives the −29.89% move
above. Against each side's dated keyed consensus, the year-one gap improves
from +4.29% to −3.31%; the per-share gap also shrinks (424.38 versus 230.23 →
297.52 versus 230.11). The older growth regime can still look seasonal; that
cost is disclosed for review, not calibrated away.

## Pre-flight amendments and residual choices

- **R1:** the initial TTM-times-guided-growth rule would have raised B13 NVDA
  from 434.00 to 515.94 (+18.88%), putting year one 9.0% above consensus versus
  4.3% on main; census AMZN rose 5.25% and #43 rose 3.75%. Those are rejected
  pre-flight counterfactuals, not current branch-baseline figures. A share of
  the fiscal year also misread NVDA's growth as a 31.5% seasonal peak. The
  implementation uses the growth-adjusted mean, keeping the TTM rule only
  below eight usable quarters. The controller's peak-quarter test boosts the
  guide's own fiscal quarter (k mod 4 = 0), giving a factor about 1.105 and a
  year-one/TTM-times-YoY ratio about 1.0038. The deceleration case is 0.8956,
  below the TTM-times-YoY alternative; stable growth without season gives 1.
- **R2:** only guided YoY joins comparable reverse-DCF growth context; no
  next-quarter level becomes a twelve-month trigger.
- **R4:** qualifiers explain shifted events without changing reported guidance.
  The pre-flight AMZN ex-event option was 869.44B / 105.95 a share (+7.22% versus
  B13 main; within 0.8% of keyed consensus 876.36B). It needs a
  timing-versus-persistent classifier and remains for a later batch.

## House-threshold backtest

The 45-issuer census and five keyed inputs are read offline. No threshold was
retuned to make this sample pass. Full samples and rejection reasons are in
the external `thresholds.json` evidence.

| Rule | Sample and measured distribution | Result |
|---|---|---|
| Three chained year ends; unique last/nearest weekday | 45 issuers. Nine unambiguous rules: AAPL, CSCO, INTC, NVDA, PEP use last weekday; COST, DIS, HD, JNJ use nearest weekday. Withhold 131 eligible ends and fit nearest three/all older: 262 trials, 231 exact, 31 no-rule, zero wrong. | Misclassifies none of the 45 census issuers; ambiguous or broken patterns remain unsnapped. |
| Ten-day snap | 462 held-out anniversary/month-end trials: distances 0/1/2/3/4/5/6 days have 36/208/91/40/11/32/44 observations. Every competing year end is 359–367 days away. Thirty actual keyed estimate dates are also checked. | Every admitted snap is unique; no threshold changed. |
| Whole-week by-product | 1,057 known census quarters: day counts 84:36, 87:1, 89:11, 90:162, 91:401, 92:422, 93:2, 95:1, 96:1, 97:1, 98:7, 112:10, 119:2. With keyed inputs: 1,174 known lengths, 3 unknown. | Non-13 counts require exact multiples of seven; 90–92 days read as 13. KO's non-whole-week lengths and SNOW/WMT's 89-day quarters remain unscaled. |
| Guided year-ago position, 250–300 days before base end | 1,029 windows admitted by the existing quarter-contiguity gate: spans 252:11, 269:1, 271:1, 272:1, 273:542, 274:212, 275:199, 276:10, 277:1, 278:1, 280:44, 287:6 days. | All fit. One NNN window is rejected for an existing 181-day gap; it is not made admissible for this batch. |

The transition-stub cutoff and 0.75-year growth span are B5b's checks, not B5a's.

## Stored-report compatibility

All 51 retained audit reports and the two AMZN live extracts were passed
through the immutable display adapter. Their original JSON and file hashes
remain unchanged; repeated application is identity-idempotent. Exactly these
notes are added:

| Stored report | New note keys |
|---|---|
| #43 | `guidedTimesFour` |
| #46 | `quarterLength` |
| #47, #48, #49, #50, #52 | `fiscalYearEnd`, `guidedFloorTimesFour` |
| AMZN live #52 extract | `guidedFloorTimesFour` |
| AMZN live #51 extract and every other retained report | none |

The quarter-length illustration prefers matching stored filed revenue:
54.229B × 4 × 13/14 = 201.422B, printed 201.42B. Scaling the already-rounded
216.92B instead gives 201.43B. With no matching raw amount, the latter is
explicitly approximate. Neither replaces a stored valuation. Parenthesized
filing citations in an old basis are tested, as are missing period contexts.
The adapter is outermost in all five display/export compositions and appears
in both risk-coverage inventories.

## Judgments and what remains

The owner's defaults settle these choices without a new permission step:

1. Keep sales-to-capital on main's filed revenue (explicit owner ruling and
   Task 29's must-not-move list). Normalise only DCF starting flows.
2. Follow R1's required mean of up to three factors, not its one-factor
   illustrations. Name NVDA's material move and retain the prescribed formula.
3. Keep an established weekday calendar weekly even when the preceding end
   happens to be month end: the plan's Q1 test requires 2027-05-02.
4. Use a matching stored filed amount before rounding the legacy illustration;
   disclose an approximation when only the rounded printed amount is present.
5. Preserve main's unguided evidence shape. A failing golden regression caught
   new empty guidance fields; Task 24 conditions them on a stated guide.
6. Preserve exact filed margin, tax and gross/opex ratios after the replay
   caught KO's capped bull shock changing by 1.0658e-14pp. Three failing
   regressions pin the no-one-off, charge and gain cases; no tolerance is added.
7. Keep the unchanged margin vector separate from its legitimately changed DCF
   sensitivity text in the proof: assert the vector is exact and the printed
   sensitivity equals the actual DCF on both sides. The plan's invariants stay
   strict, and each changed valuation leaf retains its task attribution.
8. Use separate Task 26/27 commits under the user's one-commit-per-task rule.
   Date this note as prepared, with merge pending, because the handoff forbids
   merging. D-136 is the handoff's specified next number after B4a.

The release check initially rejected the new documentation test's literal
reference to a retired root-document name. The identical decision-reference
assertions now live with the existing release-file contract, which owns the
current audit-document paths. The check and assertions were not weakened.

No B5a finding is abandoned. Not fixed here: B5b's DCF-input findings,
transition filtering, terminal returns, WACC/ERP refresh, tax/margin rules and
reverse-DCF bounds; B4b's remaining claim/ownership work; or an ex-event
guidance model. The seasonal estimator can misread acquisitions, commodity
spikes, shifted events or changing growth regimes as season. The new floor is
looser for a fast grower and can admit stale consensus. The retained bounded
run-rate can understate a growing seasonal trough. Unknown future extra-week
placement is disclosed, not guessed. Live API testing is deferred to Claude
after merge; no real database, credentials or running application were used.

The final acceptance requires the unchanged nine-gate script, the final-head
offline replay and a fresh independent reviewer. Their exact results and head
identity are recorded in the execution ledger and PR, rather than claiming a
merge in this document.
