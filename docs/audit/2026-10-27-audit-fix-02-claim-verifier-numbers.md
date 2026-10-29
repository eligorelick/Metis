# Audit batch B2: the claim verifier reads signs, scales, units and each figure's own description (2026-10-28)

Base: `6baf29f` (B1 head) for the batch, then merged with the closed B1 and main at `5486230` (B1's period rules and stamps; B3 payload records and B7 paid-spend accounting through main). Scope: batch B2 of the independent audit of 2026-10-27, the findings where the Stage C verify pass marks a claim `[validated]` or `contradicted` because it misread a figure of the filing excerpt it cites: its sign, scale, unit, relation, bound, comparison base or own description. This is the scope ruled for this pull request: tasks 1 to 9 and 16 of the plan, which cover all seven of B2's High findings. Tasks 10 to 15 and 17 to 19 (nine Medium and Low findings) are deferred to a follow-up batch, B2b, and are not dropped.

This change made no model calls and no paid provider calls. Every test builds synthetic text, short quotations of public SEC filings, or the committed SEC fixtures under `fixtures/edgar/`; no live network is reached and no provider row (FMP or other) is committed. The replay over stored run inputs read them only and called no provider or model.

## Disposition

Every new test failed before its fix, except the controls that pass on both sides by design. Tests are in the file named in each row.

| Finding | Disposition | Commits | Tests |
|---|---|---|---|
| SEC-203 (Medium): the number scanners were quadratic on whitespace runs | Fixed. The scanners run in linear time: verifying 2,000 padded characters took about 2.9 s and takes about 5 ms. | `58b27d7`, `08d276f` | `tests/stageC.numberScanLinearity.test.ts` |
| AI-202 (High): a minus before the currency read as a positive figure | Fixed. A minus directly before the currency makes the value negative; a dash after a digit and one space, a range's upper bound and a dashed year do not turn negative. | `f08dfc7`, `de17339` | `tests/stageC.claimEvidence.d66.test.ts` ("AI-202 leading sign"); `tests/stageC.numberScanLinearity.test.ts` |
| AI-304 (High), AI-304-V1, AI-304-V3: a word that only began like a scale or unit was read as one | Fixed. Prose scale, unit and currency tokens are whole words; mn, mln, mil, mio and bln are scales; basis and percentage points are units; "N months" is masked as a duration. | `349d849`, `f3cc239`, `4c29509` | `tests/stageC.claimEvidence.tokens.test.ts` |
| AI-304-V2 (Medium): a currency code before a money word failed the unit check | Fixed. A figure with a currency symbol or an uppercase ISO code directly before it is money in the unit check. | `a513b23`, `9924183` | `tests/stageC.verifyChecks.test.ts` (unit check) |
| AI-403 (Medium), covering AI-203: a table's scale declaration was applied to percents and per-share cells | Fixed. The declaration scales money amounts, share counts and unit-less cells only; under "except per share" a decimal cell is per share only when its own row names a per-share basis ("per share", "per basic share", "per diluted share", "per common share", "per ordinary share", up to two of those qualifiers, or "EPS"), and a per-share claim takes only such a row. The pull-request review found that decimal precision alone had made "Revenue $ 5.0" under "($ in millions, except per share data)" per share; such a row now keeps the money scale. | `7c14b1a`, `c706956`, `1682157`, and the commit that adds the row-label sentence | `tests/stageC.excerptCurrencyScale.test.ts` ("AI-403 table scale applies to amounts only") |
| AI-401 (High), covering AI-401-V2: a hedge or "an increase of" made a change read as a level | Fixed. A hedge before the figure and a change noun plus "of" keep a change a change; "a gain of" is unknown. | `31bb9e5`, `1e85b60` | `tests/stageC.factualValidation.test.ts` ("relation") |
| AI-401-V1 (High): a figure before an apposition comma was read as a change | Fixed. A postposed direction word separated from the figure by `,` `;` `:` an em or en dash or `(` leaves the figure a level. | `2572dd1`, `c40c1c7` | `tests/stageC.factualValidation.test.ts` ("apposition") |
| AI-409 (Low): a source bound was read as the exact figure | Fixed. A prose or source comparator before the figure makes it a bound (strict or inclusive); an exact claim never validates against a bound, and a bound claim at another figure is unchecked, never contradicted (final review). | `b9ff182`, `e504402`, `029facb`, `2b5a350`, `fbb031b` | `tests/stageC.claimEvidence.bounds.test.ts` |
| AI-305 (High), AI-305-V1 (Medium): a figure validated a claim for a metric the sentence gives to another noun | Fixed (OD-1, D-129). A figure binds only to its own description, judged twice so the description can only leave a claim unchecked. | `903b2cd`, `b7780b2`, `9a727aa`, `6c32375`, `9eb7325`, `350088f` | `tests/stageC.claimEvidence.ownDescription.test.ts` (including the 66-case property table) |
| AI-503 (High), AI-503-V1 (High), AI-503-V2 (Medium): a comparison base was read as the level | Fixed (round-4 conventions, D-130). A figure after "from", "compared with/to", "versus", "vs." or "against" is a base and binds only a base; the end of a "<direction> from $A to $B" move takes the move's metric, with the head withheld unless only time words sit between the figures; the end keeps none of the periods, windows or fiscal year-end stated between the figures (final review). | `e44bae3`, `18ecf27`, `4880263` | `tests/stageC.claimEvidence.comparisonBase.test.ts` |
| AI-116, AI-103, AI-407, AI-408, AI-104, AI-111, AI-501, AI-502, AI-504 (Medium and Low) | Deferred to B2b, not built and not dropped. Each is independent of the built tasks; their plan tasks (10 to 15, 17 to 19) remain valid. AI-501, AI-502 and AI-504 probe rows keep their base status (Table 4). | none | none |
| Stamps | Report 1.47.0 only. | `19b64bd` | `tests/report.versionStamps.test.ts`, `tests/jobRunner.test.ts`, `tests/stageC.payload.passes.test.ts` |
| Audited fixture comparison | One moved leaf, `report.meta.specVersion`, in the group `claim-verifier-numbers-20261027`, which absorbed B1's single-leaf group because B1 and B2 ship as one pull request (decision ids D-128 for B1, D-129 and D-130 for B2). | `6eb1e02`, `7826339` | `tests/audit.fixtureComparison.test.ts` |
| CHANGELOG and decisions | Changelog section; decision entries D-129, D-130 and D-131. | `30544fd`, `0896012` | `tests/docs.lint.test.ts` |
| Plan | The executed plan, `docs/superpowers/plans/2026-10-27-audit-fix-02-claim-verifier-numbers.md`, committed byte-identical to the planning copy. | `5eeafa2` | `tests/repository.release.test.ts` |

Re-pins: two existing tests named less than the figure's own description, which OD-1 now requires. Each claim was lengthened to name the description in full (still validated) and the short form is pinned unchecked: the "aggregate payment obligation" key number in `tests/currentReports.test.ts` and the Gawel equity-grant claim in `tests/edgar.filingFacts.test.ts`. The lease-accounting note claim in `tests/stageC.claimPeriods.audit20261027.test.ts` was re-pinned by the first OD-1 commit and restored (validated, with a control that stays unchecked) by its review fix. The payload golden did not move; the stamp pins moved with the stamp.

Final review (2026-10-28). The fresh review of the whole B1 and B2 diff found three code defects, fixed test-first with no re-pin: the end of a base-first move kept the periods, windows and fiscal year-end stated for its start, so "Total debt decreased to USD 8.5 billion at fiscal year-end" validated against a quarterly filing's "decreased from $10.0 billion at fiscal year-end to $8.5 billion" (`4880263`); B1's comparison-base reader backtracked exponentially on comma-grouped table rows (`934498d`, recorded in B1's note); and a bound claim at another figure was contradicted, as NVIDIA's 10-K "over $76.7 billion" did to the true "over USD 70 billion" (`fbb031b`). The records that described superseded states were corrected with them (`7826339`, `5eeafa2` and the records commit that adds this paragraph). A ruling on the fix report then closed one B1 reading these fixes left in place: under an FY title a claim's "at the end of the prior year" was read as the 10-K's own year-end. A claim's prior/last year-end is now established only by the same phrase in the source figure's own clause (recorded in B1's note). A scoped re-review found that this reading still gave a year-end after a comparison word to the level figure in two-figure sentences. A year-end after a comparison word is now the base's, and one after "from" or "since" is a start (`e420448`). That also fixes r8. No record establishes a prior year-end (`d58b6c9`), and a period inside a parenthetical that holds another figure is that figure's (recorded in B1's note).

## Owner decisions and conventions

Recorded in `docs/audit/DECISIONS.md` as D-129 (OD-1), D-130 (the round-4 conventions) and D-131 (the known residuals):

- **OD-1**, an excerpt figure binds only to its own description (AI-305, AI-305-V1). It states the structural guard: each claim is judged twice, and the own description can only leave a claim unchecked; it never validates or contradicts a claim and never resolves an ambiguity in prose.
- **Round-4 conventions** for AI-503, AI-503-V1 and AI-503-V2: comparison bases and the end of a base-first move. These are house conventions, not owner decisions.
- **Known residuals** (r1, r5, r6, r7, r9, r10, r11 and the two readings below), so the post-fix audit can probe them; r8, fixed by the final review, stays listed so the audit can confirm it stays fixed.

OD-2 to OD-6 are written by B2b with their tasks.

## Stored reports

Unchanged (D-67). Every built finding is `storedReportImpact: none` for the stored text: stored reports keep the statuses they were verified with, and only reports verified after the merge use the new rules. No stored report is rewritten and no snapshot changes. `sha256` of all 51 stored report files is identical before and after the replay.

## Replay

The stored run inputs of NVDA #48, #49 and #50, AMZN #43 and run #46 were rebuilt and replayed through the production verify pass (`runVerifyPass` of the Stage C facade) with no provider or model call (a provider mock counts zero calls). Two comparisons were taken: `base` (B1 head `6baf29f`'s verifier), and `mbase` (the merged tree `e0a90ff`, which is B1 closed plus main, with this batch's three verifier files restored from it), against `final` (this branch). `base` against `final` also carries the merged B3 and B7 effects (payload-record label and source changes); `mbase` against `final` is this batch alone.

### Table 1: claim counts and moves

"Validated", "cited", "unchecked" and "contradicted" count the report's prose claims (factual-claim log entries, JUDGMENT claims excluded). Traced numbers (key numbers and table cells) are not in those counts; the last columns count verification-log rows of both kinds.

This batch alone (`mbase` to `final`):

| Run | Validated | Cited | Unchecked | Contradicted | Traced numbers verified | Contradicted to other | Validated to unchecked | Unchecked to validated |
|---|---|---|---|---|---|---|---|---|
| #43 | 60 to 60 | 156 to 156 | 97 to 97 | 0 to 0 | 302 to 298 of 354 | 0 | 4 | 0 |
| #46 | 35 to 35 | 138 to 138 | 103 to 103 | 0 to 0 | 257 to 257 of 271 | 0 | 0 | 0 |
| #48 | 65 to 65 | 163 to 163 | 100 to 100 | 0 to 0 | 284 to 284 of 289 | 0 | 0 | 0 |
| #49 | 5 to 5 | 20 to 20 | 16 to 16 | 0 to 0 | 206 to 206 of 207 | 0 | 0 | 0 |
| #50 | 106 to 106 | 218 to 218 | 114 to 114 | 0 to 0 | 353 to 352 of 365 | 0 | 1 | 0 |

These totals are not comparable with the replay table of B1's disposition note, which ends at 60 validated and 99 unverified for #43 and 35 and 105 for #46, against 60 and 97 and 35 and 103 here. Both harnesses rebuild the payload from the stored run-input snapshot, but they verify different claim sets. B1's harness replays each stored report file, and on #43 and #46 that file still carries two code-written method notes ("Capital grading basis: ..." and "The debt bridge distinguishes ...") with the FACT label they were stored with. This note's harness replays the run's last synthesize-pass output through the production verify facade, which writes those two notes as JUDGMENT (audit 2026-10-22 F-20). So B1's counts hold two more qualitative factual claims on #43 and on #46, each cited and counted as unverified; #48, #49 and #50 count the same in both.

Against `base` (B1 head), including the merged main:

| Run | Validated | Cited | Unchecked | Contradicted | Traced numbers verified | Contradicted to other | Validated to unchecked | Unchecked to validated | Other |
|---|---|---|---|---|---|---|---|---|---|
| #43 | 57 to 60 | 156 to 156 | 100 to 97 | 0 to 0 | 311 to 298 of 354 | 0 | 13 | 3 | 0 |
| #46 | 35 to 35 | 138 to 138 | 103 to 103 | 0 to 0 | 267 to 257 of 271 | 0 | 10 | 0 | 1 |
| #48 | 63 to 65 | 164 to 163 | 102 to 100 | 0 to 0 | 289 to 284 of 289 | 0 | 6 | 3 | 0 |
| #49 | 5 to 5 | 20 to 20 | 16 to 16 | 0 to 0 | 207 to 206 of 207 | 0 | 1 | 0 | 0 |
| #50 | 101 to 106 | 220 to 218 | 119 to 114 | 0 to 0 | 360 to 352 of 365 | 0 | 8 | 5 | 1 |

### Table 2: every changed stored row

Rows moved by this batch (`mbase` to `final`), all in the fail-closed direction and all attributed to AI-305 / OD-1:

| Run | Path | Move | Finding and reason |
|---|---|---|---|
| #43 | `fundamentals.graded.keyNumbers[10]`, `quality.graded.keyNumbers[13]` | validated to unchecked (text-context-mismatch); the two number flags go true to false | AI-305: the 15.9 net discrete tax expense sentence continues without a comma ("... attributable to upward adjustments to our investments"); the claim leaves out those words. Correct figure, recall cost |
| #43 | `balanceSheet.debtProfile.numbers[9]` | validated to unchecked; flag true to false | AI-305: 17.5 delayed draw term loan facility; the sentence's subject words are not in the claim. Recall cost |
| #43 | `balanceSheet.capexTrajectory.numbers[5]` | validated to unchecked; flag true to false | AI-305: 21.3 "Commitment Amount" is the remaining commitment invested in Series C shares, which the bare label does not name. Defensible |
| #50 | `balanceSheet.debtProfile.numbers[8]` | validated to unchecked; flag true to false | AI-305: 25 senior unsecured notes; "issued", "aggregate", "tranches" are not in the claim. Recall cost |
| #43 | `fundamentals.graded.keyNumbers[15]`, `quality.graded.keyNumbers[14]`, `fundamentals.commentary[13]`, `balanceSheet.debtProfile.commentary[9]`, `balanceSheet.capitalAllocation[1]`, `quality.graded.reasoning[19]` | reason only, text-ambiguous to text-context-mismatch; still unchecked | AI-305: the own description names a word the claim lacks, which decides the reason |
| #46 | `balanceSheet.capitalAllocation[3]` | reason only, same | AI-305 |
| #50 | `balanceSheet.debtProfile.commentary[9]`, `balanceSheet.debtProfile.commentary[10]` | reason only, same | AI-305 |

Nothing else in the five replayed reports moved from this batch. The 83 further rows that differ between `base` and `mbase` come from the merged main (B3 payload-record source and label changes: geographic, peer and insider rows now `unknown-source` where a record is not an issuer fact; accrual-operand and latest-year rows that B3's fiscal labels now validate). They are not this batch's.

### Table 3: synthetic test flips per finding

The HEAD result is the base result; the fixed result is the result with the fix. Counts are the new tests that failed before the fix.

| Finding | Test | HEAD result | Fixed result |
|---|---|---|---|
| SEC-203 | `numberScanLinearity` (15 tests) | 14 failed (e.g. `runVerifyPass` 2,889 ms against a 1,000 ms limit) | pass in under 10 ms |
| AI-202 | "reads a minus written directly before the currency" | contradicted (the minus lost) | validated |
| AI-304, AI-304-V1, AI-304-V3 | 14 failed at the first fix; 13 more at the review fix | "8 basis points", "0.08 percentage points", "5 key products", "1,234 Share-based" and similar read as a scale or unit | read as the whole word they are |
| AI-304-V2 | `verifyChecks` unit check (5 failed) | a currency code or symbol before "share repurchase" gave one `unit-word-mismatch` | none; "$15.2 billion shares" now gives one |
| AI-403 | `excerptCurrencyScale` (8 failed) | a 71.1% gross margin and the Basic per-share 2.47 contradicted; "USD 2.47 million" and "Diluted EPS ... 4.90 billion" validated | unchecked, or validated for the correct figure |
| AI-401, AI-401-V2 | `factualValidation` "relation" (12 failed) | a hedged or "an increase of" change read as a level; pairs compared equal to a level claim | a change stays a change |
| AI-401-V1 | `factualValidation` "apposition" (9 failed) | "X was $5.0 billion, up sequentially" read as a change | a level |
| AI-409 | `bounds` (23 failed in total, then 5 of 7 new tests at the final review) | an exact claim validated against "more than", "at least", "at most"; a bound claim at another figure ("over USD 70 billion" against NVIDIA's "over $76.7 billion") contradicted | unchecked |
| AI-305, AI-305-V1 | `ownDescription` (8 failed) | the $26.0 billion shareholder return validated a free-cash-flow claim; Micron EPS $1.93, an AMZN run rate, Micron combined cash and an NVDA debt-securities sentence validated | unchecked |
| AI-503, AI-503-V1, AI-503-V2 | `comparisonBase` (22 failed of 45, then 17 of 20 new pins at the review fix, then 5 of 8 at the final review) | the true "increased to USD 279 billion" contradicted by the $119 billion start; the false start validated; "decreased to USD 8.5 billion at fiscal year-end" validated by $A's year-end | validated end, contradicted false start, unchecked base claims and year-end claims naming $A's time |

### Table 4: round-4 probe claims (counts per finding)

The probes' claims were run on payloads rebuilt from the stored #50 and #43 run inputs, without running the probes. Rows are keyed by the probe's tag. Only AI-503, AI-503-V1 and AI-503-V2 are built here.

| Finding | Rows | Unchanged | Moved | Matching the expected final status |
|---|---|---|---|---|
| AI-501 | 11 | 11 | 0 | deferred to B2b, status unchanged |
| AI-502 | 14 | 14 | 0 | deferred to B2b, status unchanged |
| AI-503 | 13 | 2 | 11 | 13 of 13 |
| AI-503-V1 | 15 | 4 | 11 | 15 of 15 |
| AI-503-V2 | 12 | 8 | 4 | 12 of 12 |
| AI-504 | 9 | 9 | 0 | deferred to B2b, status unchanged |

Rows beyond the plan's list that moved, with the reason:

- Toward validated, each a true claim: `AI-503/true-end`, `true-end-3p`, `plain-end`, `judgment-end`, `synthetic-end`, `bare-from-to-end`, and `AI-503-V1/ctl-ai503-adjacent-increased-to`. The end figure of "increased from $A to $B" takes the move's metric.
- Toward contradicted, each a false claim that puts the move's start figure as its end: `AI-503/false-start`, `false-start-q`, `synthetic-start`, `bare-from-to-start`.
- Toward unchecked: `AI-503/from-start` (a recall loss: Task 9's own description contains "last"), `AI-503-V1/ctl-to-first`, `syn-went-true`, `syn-went-false`, `syn-improved-true`, `real-true-template`, `real-true-filing-date` and `real-false-start` (the head is withheld: "went"/"improved" are not governing direction words, or a direction word sits beyond the time words, as in NVIDIA's 10-Q), `ctl-r49-own-sentence`, `ctl-r50-own-sentence` and `ctl-judgment` (own description), `AI-503-V2/syn-true-start`, `syn-false-start`, `ctl-compared` and `ctl-real-noperiod` (a claim figure after "from" binds only a base; the true `ctl-real-noperiod` claim is no longer contradicted).
- Reason only: `AI-503-V1/ctl-q2` (period-mismatch to text-context-mismatch, because $A no longer binds) and `ctl-bare` (text-ambiguous to text-context-mismatch).

Where a row's final status differs from the plan's expectation: none in the AI-503 family. Task 16's review-driven rules explain the head being withheld: the end label is the head plus only $B's own after-text, and `MOVE_TIME_WORDS` gates the head.

After the final review's fixes (the move end's periods, the comparison-base reader's speed and the bound value rule) the replay was rerun as `final2`: it equals `final` row for row (0 changed rows, stored-report hashes, `schemaParse` and rating-gate counts equal), because no stored claim or round-4 probe claim has one of those shapes.

Acceptance: every change is attributed to a finding; no stored row moved toward `validated` or `contradicted` in this batch (the validated-to-unchecked rows above are recall losses); the stored-report `schemaParse` and rating-gate hit counts are equal before and after; `sha256` of every stored report file is unchanged.

## Residuals

Recorded as known, not fixed:

- Record-path claim bounds are not read ("more than USD 46 billion" against 46.7 is still read as a value; AI-409's scope is the excerpt path).
- The own-description rule has measured recall losses, accepted as inherent to OD-1: #43 15.9 net discrete tax expense (two key numbers), #43 17.5 delayed draw term loan facility, #43 21.3 Commitment Amount, #50 25 senior unsecured notes, and the short label of NVIDIA's $105 billion aggregate payment obligation. The check moves nothing toward validated: it can only leave a claim unchecked. The first Revenue row under a "($ in millions, except per share data)" declaration and the colon-row tables stay text-ambiguous, as at base, and the "Current assets: Cash and cash equivalents" row was already validated at base.
- A statement sub-row under a heading ("Net income per share: Basic ... Diluted ...") takes the heading's words only in the row whose lead carries it, so only the Basic row of NVDA's Note 3 is a per-share row. Claims naming "diluted net income per share" or "Diluted EPS" bind no cell of the Diluted row ("Diluted (2)") and stay unchecked. Since the pull-request review that row keeps the table's money scale, as on main, so a claim whose only metric word is "Diluted" reads it in millions ("USD 2.46 million" validates, "USD 2.46" is contradicted).
- A unitless share-count cell under a declaration with no "$" has no established unit and stays `text-ambiguous`.
- An excerpt-cited MetricRow cell's column is not compared with the excerpt (D-45's "not done" stands for the excerpt path).
- Older stored reports #34 and #37 used the "-$" spelling (AI-105). They are not replayed, because they have no run-input snapshot.
- Round-4 residuals:
  - A base-first move whose "from" no direction word governs (a range, "went from", "improved from", or a direction word beyond 40 characters, as in NVIDIA's 10-Q "significantly increased our supply and capacity commitments from $119 billion ...") gives its end figure no metric, so the true "Supply and capacity commitments as of 2026-07-26 were USD 279 billion" cited to the MD&A stays unchecked. It is no longer contradicted.
  - A "from" that is not a comparison ("Proceeds from $5.0 billion of senior notes") is read as a base and binds no level claim (Task 9 already rejects that case).
  - The Amazon 10-Q two-period form ("from $19.2 billion in Q2 2025 to $27.5 billion in Q2 2026") stays unchecked until B1's comparison-base periods remove Q2 2025 from the end figure's periods.
  - A true "due to" move end ("Data Center revenue increased to USD 41.1 billion", where the source reads "... due to Data Center revenue growing to $41.1 billion") may drop to unchecked, and so may "at last year's end".
- The deferred round-4 findings (AI-501, AI-502, AI-504) leave these residuals for B2b: a change claim against an "increase in ..." record stays unchecked; "WACC minus ROIC" and "spread of ROIC over WACC" stay unchecked; there is no comparative sign check on percentage-point differences (OD-6, alternative a).

### Residuals for the post-fix audit (verification plan Task V7)

These readings are kept (D-131) and V7 probes them rather than counting them as known (decisions spec 4.3, B2):

- **Spaced-dash range sign.** `readProseQuantities("Guidance is USD 1.0 - 1.2 billion.")` returns `[1, -1.2e9]` at base and after this batch. Changing it would flip table change cells such as "75.0 % -3.9 pts", outside AI-202's scope, so a later batch must decide spaced-dash ranges.
- **"EPS" as a per-share basis.** The per-share words keep D-109's `per share` expression on both paths. "Diluted EPS as of 2026-01-25 was USD 4.90." under "($ in billions, except per share data)" moves from contradicted to `unchecked / unit-mismatch`, never validated.
- r1, r5, r6, r7, r8, r9, r10 and r11 of D-131: ASCII ">=" and "<=" read as point figures; a base-time phrase after $B lets a false claim that names that time validate (predates this batch); a claim that names a second metric of the same clause can bind (contrived); verify time on one excerpt grows with the square of a whitespace run (re-measured after the final review: an 80,000-character run takes about 3.3 s with no move near it and about 10 to 13 s inside a base-first move, about 1.3 to 1.5 times its time before Task 16; predates this batch, and the comma-row backtracking the final review found is fixed); and r8, a year-end window after a comparison cue given to the level figure ("Inventory was USD 31.6 billion at fiscal year-end." validated against "Inventory was $31.6 billion, compared with $25.8 billion at fiscal year-end." at main, at B1's head and before the final review; predates this batch), is fixed by the final review (`e420448`) and is now unchecked; r9, a prior quarter-end that is not read, so "Inventory was USD 25.8 billion this quarter." validates against "Inventory was $25.8 billion at the end of the prior quarter." (B2b takes it first); r10, a period between two figures with no cue that goes to the first figure ("Inventory was $31.6 billion, at the end of the prior fiscal year $25.8 billion." validates the false $31.6 billion claim at that year-end and contradicts the true $25.8 billion one); and r11, a relative time in a parenthetical out of the own description's reach ("Inventory was $25.8 billion (a year ago, up 29%)." validates the false "USD 25.8 billion in Q2 FY2027"). r9 to r11 predate this batch and behave alike on main and at `d783e37`.

## Verification

- Focused files of the built tasks (comparisonBase, ownDescription, d66, bounds, tokens, excerptCurrencyScale, excerptNumbers, factualValidation, verifyChecks, numberScanLinearity, claimPeriods, metricContext): 764 tests green at Task 16's review fix.
- `tests/stageC.payload.passes.test.ts` and `tests/stageC.judgeProtocol.test.ts`: the payload golden did not move (payload 1.49.0); only the report stamp pin moved.
- `npm run audit:deltas`: exactly one already-classified leaf moved, `report.meta.specVersion` (`1.2.0` to `1.47.0`), now recorded in `claim-verifier-numbers-20261027`, which absorbed B1's group; no `verified`, verification-log, coverage or Stage B leaf of the DEMO control moved.
- After the final review's fixes: the focused files above with the new final-review tests, plus docs.lint, repository.release, audit.fixtureComparison and the version stamps, 22 files and 979 tests green; `npm run test:product` 484 files, 9,948 passed and 3 skipped, with one load timeout (`tests/report.recordedSensitivity.test.ts`, 5 s) that passes alone; typecheck and eslint clean; `npm run audit:deltas` (report only) unchanged.
- The product suite passed on the merge of the closed B1 (484 files, 9931 tests); the batch-level `npm run verify` chunks, the fresh review over the whole diff and the pull request description follow this note.
