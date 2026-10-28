# Audit batch B1: the claim verifier compares periods and windows (2026-10-28)

Base: `6542531` (main, after pull request #67) for the plan; the branch was then merged with main at `a636315` (after B3, payload records, and B7, paid-spend accounting; merge commit `eb52c4f`), so B3's fiscal labels (Tasks 8E and 8F) are on the base. Scope: batch B1 of the independent audit of 2026-10-27, the findings where the Stage C verify pass marks a factual claim `[validated]` without comparing the period, window, comparison base or recency it states: AI-106, AI-302, AI-302-V1, AI-303, AI-303-V1, AI-303-V3, AI-303-V4, AI-402, AI-402-V1, AI-402-V2, AI-404 and AI-405. The decision is `D-next` in [DECISIONS](DECISIONS.md) (renumbered at merge; the audited-fixture record carries the provisional number D-128).

This change made no model calls and no paid provider calls. Every test builds synthetic records shaped like the registry rows of the stored runs, with values from committed SEC text or round numbers; no live network is reached and no provider row (FMP or other) is committed. The replay over stored run inputs read them only and called no provider or model.

## Disposition

All twelve findings were re-read against the base and still read true; none is skipped or disputed. AI-303-V2 was rejected at review as a duplicate of AI-303 and AI-303-V1 and is covered by the excerpt-path test for AI-303. Every new test failed before its fix, except the controls that pass on both sides by design. The tests are in `tests/stageC.claimPeriods.audit20261027.test.ts` unless another file is named.

| Finding | Disposition | Commit | Tests |
|---|---|---|---|
| AI-106: a claim naming a period validated against a record with no period | Fixed (OD-1). A period-less record establishes only its own as-of date, a date its period context declares and a fiscal label it declares; a dated record without fiscal metadata establishes its date only. | `16c2283` | the AI-106 tests |
| AI-302: a trailing-twelve-month record validated prose naming only the window's start | Fixed (OD-2). The start counts only inside the complete interval. | `7eb83df` | the AI-302 tests |
| AI-303, AI-303-V1: windows read only after "for", "during" or "over" | Fixed. A window is read however written ("annual", "per year", "this quarter"), and on an excerpt the title's own window is the default (C-6); horizons, plurals and comparison words are not windows. | `16e655c`, `858d4ce` | the AI-303 tests, including the excerpt path |
| AI-303-V3: "at fiscal year-end" named no instant | Fixed (C-4). The fiscal-year-end instant is established by an FY or Q4 label, a fiscal-year basis, or the source clause's or an annual excerpt's own date. | `c684f24`, `fea5e74` | the AI-303-V3 tests |
| AI-303-V4: "latest" was compared with nothing | Fixed (C-4). An older period of a reported series called the latest stays unverified; applied only where the word modifies a period or a filing, including hyphenated and labelled forms. | `18d4159`, `e6accd1`, `e18970c` | the AI-303-V4 tests |
| AI-402, AI-402-V1, AI-402-V2: the comparison base was lent to the figure before it, and a correct year-over-year sentence drew a period finding | Fixed (C-1, C-2). The base is read as the base on both paths and compared with the cited figure's own base period; a base the cited evidence does not establish leaves the claim unverified. | `c67becb`, `17a9c12`, `4674061`, `eb4d24a` | the AI-402 tests |
| AI-404: each clause of a one-figure claim was read alone | Fixed (C-3). A one-figure claim is read whole; several figures keep per-clause reading; a period only in a forward-looking clause is not lent to a non-forward figure. | `ab48c92`, `4abc641` | the AI-404 tests |
| AI-302-V1: an expectation clause inherited the reporting period and validated a result | Fixed (OD-3). A forward-looking clause inherits no period and binds only a forward-looking claim; a result clause binds only a result claim. | `0a137c5`, `5ea5866` | the AI-302-V1 tests; the key-number test in `tests/currentReports.test.ts` |
| AI-405: the consistency period check was stricter than the citation check | Fixed (C-5). A spelled fiscal period is compared through the issuer's fiscal label before calendar years; a 52/53-week year is read by `periodsAgree`. | `6baf29f` | the AI-405 tests |
| Composition with B3 Task 8E (C-11): a latest-year row carries the fiscal label that the period rule reads | Test only. The label establishes FY2025 and the annual window and nothing else; the test fails when the labels are removed. | `5a96043` | `tests/stageC.latestFiscalLabels.test.ts` |
| Review minors of Task 9: the OD-3 pin comment and the consistency module doc | Fixed in comments only. | `af8998a` | none (comments) |
| Stamps and the audited fixture comparison | Report 1.46.0 and pipeline stage-c-1.6.12; the one moved leaf (`report.meta.specVersion`) was recorded in its own group, which B2 absorbed into `claim-verifier-numbers-20261027` (provisional decision ids D-128 and D-129) because B1 and B2 ship as one pull request. | `ff4a3fb`, `36e3ed0` | `tests/report.versionStamps.test.ts`, `tests/jobRunner.test.ts`, `tests/stageC.payload.passes.test.ts`, `tests/audit.fixtureComparison.test.ts` |

Re-pins: each carries a dated comment naming its finding. Two Task 6 pins moved with AI-405 (a right spelled-fiscal base now validates; a wrong spelled base stays unverified and its reason changes from `period-mismatch` to `period-word-mismatch`), and the stamp pins moved with the stamps. The payload golden did not move.

## Owner decisions

The owner delegated these calls (research-backed). Each is recorded with its sources in D-next.

- **OD-1.** A period-less record establishes only what it carries. Measured cost with B3 Task 8E on `main`: none on a stored claim (see the C-11 block below).
- **OD-2.** A trailing window's start date counts only inside the complete interval.
- **OD-3.** A forward-looking clause is never read as a reported result, and modality must match.
- **C-1 to C-6.** The comparison-base grammar; a base is checked as the base; a one-figure claim is read whole; the fiscal-year-end instant and "latest"; the period check is never stricter than the citation check; windows on the excerpt path are compared as periods.

## Stored reports

Unchanged (D-67). Every finding is `storedReportImpact: none`: stored reports keep the statuses they were verified with, and only reports verified after the merge use the new rules. No stored report is rewritten and no snapshot changes.

## Replay

The stored run inputs of NVDA #48, #49 and #50, AMZN #43 and run #46 were replayed through the verify pass with no provider or model call: main after B3 (`a636315`) against this branch at `eb52c4f` (main merged over Tasks 1 to 9, before the stamps, which change no figure). The earlier baseline taken before B3 is superseded.

| Run | Validated before | Validated after | Unverified before | Unverified after | Contradicted | Rows changed | Period checks |
|---|---|---|---|---|---|---|---|
| #43 | 60 | 60 | 99 | 99 | 0 / 0 | 7 of 621 | 54/54 passed, 0 failed |
| #46 | 36 | 35 | 104 | 105 | 0 / 0 | 1 of 524 | 55/55 passed, 0 failed |
| #48 | 65 | 65 | 100 | 100 | 0 / 0 | 0 of 502 | 78/78 passed, 0 failed |
| #49 | 5 | 5 | 16 | 16 | 0 / 0 | 0 of 233 | 8/8 passed, 0 failed |
| #50 | 106 | 106 | 114 | 114 | 0 / 0 | 0 of 700 | 117/117 passed, 0 failed |

The validated, unverified and contradicted totals count the report's prose claims (the factual-claim entries of the verification log, JUDGMENT claims excluded). Traced numbers (key numbers and table cells) are not in them, while "Rows changed" counts log rows of both kinds, so the two #43 key numbers that moved from unverified to validated leave #43 at 60 and 60.

Every changed row is explained by a finding of this batch:

- **#43, two key numbers, unverified to validated** (the 15.9 net discrete tax expense in the fundamentals and quality sections). The claim states the filing's amount and period and no longer fails on a base or window word. These are correct claims. The rows changed in their reason code only: five other rows, `text-context-mismatch` to `text-ambiguous` (the increase in depreciation and amortization expense, the reduction in net income, and the net discrete tax expense sentences); none changed status.
- **#46, one row, validated to unverified**: "Purchase obligations for the acquisition of property, plant and equipment as of 2026-09-03 were approximately USD 4.18 billion." The source clause ends "substantially all of which is expected to be paid within one year". "Is expected to" is forward-looking wording (OD-3), so the clause binds only a forward-looking claim. This is the stated recall cost of OD-3 (fail-closed), not a wrong validation (see Residuals).
- **#48, #49, #50: no row changed.**
- Nothing moved toward contradicted on any run.

### C-11: NVDA #48's latest-year claims with B3 Task 8E on `main`

Constructed claims against the stored #48 registry (the label and period B3 Task 8E attaches to the `(latest)` and accrual rows):

| Claim | Before (main after B3) | After (this branch) |
|---|---|---|
| ROIC for the fiscal year was 149.8%. | validated/supported | validated/supported |
| ROIC for the latest fiscal year was 149.8%. | validated/supported | validated/supported |
| ROIC for FY2026 was 149.8%. | validated/supported | validated/supported |
| ROIC for FY2025 was 149.8%. | unchecked/period-word-mismatch | unchecked/period-word-mismatch |
| The balance-sheet accrual ratio for the same year was 0.64x. | validated/supported | validated/supported |

So the two stored latest-year claims keep their validation, and the wrong year stays unverified, as B3 Task 8E's plan expects. `tests/stageC.latestFiscalLabels.test.ts` proves the same on a synthetic bundle, and fails when the labels are removed.

### AI-503-V2 and B2

At this branch's head, B2's control for AI-503-V2 (ctl-real-noperiod: the true claim "Operating income increased from USD 19.2 billion." citing a period-less record) is read as having a comparison base ("from" after a change word with a magnitude) and is contradicted. B2 Task 16 fixes it. B1 and B2 therefore merge as a pair, B2 immediately after B1.

## Residuals

- "Latest" is not checked on a filing excerpt.
- "At the latest fiscal year-end" citing a fourth-quarter row stays unverified once later quarters of its series are registered.
- An outlook lead's period is not carried to its bullets ("Outlook for the third quarter of fiscal 2027 is as follows: ..."), so the correctly dated Q3 guide does not validate a claim naming Q3 through the lead.
- A result clause that also cites guidance ("above guidance of $91.0 billion") binds only a claim that names the guidance.
- **The FORWARD_LOOKING recall class (Task 8 review).** The wording read as forward-looking is: "is/are/was/were/be/been/being/remains/remained" (optionally "now", "currently", "still" or "also") followed by expected, projected, forecast(ed), anticipated, estimated or guided "to"; "expect(s)", "expecting", "anticipate(s)", "anticipating", "forecast(s)", "outlook"; "guidance" followed by for, of, range, calls for, is, was or issued; and "our", "its", "management's" or "the company's" followed by up to three words and "guidance". The matched shapes include payment-timing and recognition tails ("expected to be paid", "expected to be recognized", "expected to be settled"), "estimated to be", "we expect to", the nouns "outlook" and "forecasts", and accounting-standard wording that fits the guidance shapes ("Under the accounting guidance for leases", "Under guidance issued by the FASB", "our new lease accounting guidance"). Wording that does not match is a result ("under the new lease accounting guidance", a bare "as expected", "estimated useful lives"). A result figure in a clause with such wording binds only a forward-looking claim, so a correct result claim citing it stays unverified. The one observed instance is run #46's purchase-obligations row above. The regex follows the plan verbatim; whether a payment-timing tail should count is for the owner or a later batch.
- A forward-looking claim whose verb sits outside the figure's own clause is unverified (recall only), and a guided figure restated with a subject and verb the source clause lacks is a metric-word mismatch.
- The claim reader reads a bare "fiscal 2026" as the year 2026, so a correct "fiscal 2026" claim stays unverified against a dated or a period-less row alike.
- The period check does not adjudicate a comparison base against a figure that is not a year-over-year or quarter-over-quarter series: a level row cited with only a base phrase is not checked against it.
- A fiscal label on a `(latest)` row and a stale excerpt title were B3's and are fixed there (B3 Tasks 8E and 8F, merged first).

## Verification

- The verifier sweep (every test file that calls `runVerifyPass` or `validateClaimNumericSupport`, found by `grep`): 38 files, 1386 tests green at the stamp commit, including `tests/stageC.latestFiscalLabels.test.ts` and `tests/stageC.releaseFiscalLabel.test.ts`.
- `tests/stageC.payload.passes.test.ts`: the payload golden did not move (payload 1.49.0, fingerprint `1.49.0:c74b6cd9`); only the report stamp pin moved.
- `npm run audit:deltas`: exactly one already-classified leaf moved, `report.meta.specVersion` (`1.2.0` to `1.46.0`), recorded at B1's stamp commit in its own group; nothing else moved. B2 absorbed that group into `claim-verifier-numbers-20261027`, which takes the leaf on to `1.47.0`.
- The product suite passed on the merge base (479 files, 9502 tests); the batch-level `npm run verify` chunks, the fresh review over the whole diff and the paired B2 results are recorded in the pull request.
