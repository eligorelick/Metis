# P3 verifier and trust labels - bounded implementation

All 16 P3 findings are implemented, including the previously approved AI-407. Each remaining finding has a red receipt and focused passing controls.

| Finding | Disposition | Commit | Red / green receipts | Stored-report impact |
| --- | --- | --- | --- | --- |
| AI-407 | Fixed | ef1aff54; f20a8185 | AI-407-red / AI-407-final-green; AI-407-empty-red | None: stored reports are never rewritten |
| AI-408 | Fixed | b5d262cf; 4c2b7ea5 | AI-408-red; AI-408-context-red / AI-408-final-green; AI-408-context-green; AI-408-replay | No stored writes; zero replay numeric status deltas |
| AI-501 | Fixed | 43dd2545 | AI-501-red / AI-501-green; AI-501-controls; AI-501-replay-final | No stored writes; zero numeric replay status deltas |
| AI-502 | Fixed | 44b1a6ee; a04eb460 | AI-502-red / AI-502-green; AI-502-controls; AI-502-replay | No stored writes; zero numeric replay deltas |
| AI-504 | Fixed | ce90ab94 | AI-504-red / AI-504-green; AI-504-controls; AI-504-replay | No stored writes; zero numeric replay deltas |
| AI-116 | Fixed | 4f934756; 24476f58 | AI-116-red; AI-116-legacy-red / AI-116-green; AI-116-controls; AI-116-replay | Display-only note before frozen 1.56.0; no stored writes |
| AI-103 | Fixed | b0758a3b; 24476f58 | AI-103-red; AI-103-judge-red / AI-103-green; AI-103-controls; AI-103-replay (verify only); RF7-final-green (judge claims) | No stored writes; real #38 claims replayed with reconstructed source membership |
| AI-104 | Fixed | b10c4358 | AI-104-red / AI-104-green; AI-104-controls; AI-104-replay | No stored writes or replay manifest deltas |
| AI-111 | Fixed | 79551c91 | AI-111-red / AI-111-final-green; AI-111-replay | No stored writes; rating outcomes unchanged on replay strings |
| RPT-504 | Fixed | e337b1d8; 79f702b8 | RPT-504-red; RPT-504-job-panel-red / RPT-504-green; P3-job-panel-final-green | Reader shares hidden for data-only; raw audit counts retained |
| DB-004 | Fixed | 89f10750 | DB-004-RPT-209-red / DB-004-RPT-209-green; DB-004-RPT-209-controls | Carry recorded convention; no stored writes |
| RPT-209 | Fixed | 89f10750 | DB-004-RPT-209-red / DB-004-RPT-209-green; DB-004-RPT-209-controls | Carry recorded convention; no stored writes |
| RPT-212 | Fixed | c22b8d14; 24476f58; 7075b347 | RPT-212-red / RPT-212-green; RPT-212-controls | Display-only placement; stored notices unchanged |
| RPT-206 | Fixed | 8b396c3c; 79f702b8 | RPT-206-red; RPT-206-job-panel-red / RPT-206-green; RPT-206-job-panel-final-green | Display-only counts and state; recorded metadata unchanged |
| RPT-207 | Fixed | dbcec214; 350d5ca2 | RPT-207-red / RPT-207-green; RPT-207-controls | Display-only dataset grouping; raw manifest unchanged |
| RPT-211 | Fixed | b7b0576e | RPT-211-red / RPT-211-green | Additional raw figure registry rows; body unchanged |

## Evidence and intended deltas

- AI-408 refuses wrong readable columns and conflicting supplied periods; valid dates, fiscal labels, typed duration endpoints and unparsed windows have controls. The old FY1999 acceptance pin changes from 100% to 50% for its paired valid/invalid cells.
- AI-501 keeps defining direction nouns. Asset-level claims against an increase become unchecked. Noun-form increase and net-gains controls remain supported. Verb-change recall against increase-named records remains deliberately withheld.
- AI-502 leaves spread rise/fall prose unchecked instead of validated/contradicted. Slopes and temporal-change records retain direction checks. A census pins all 11 percentage-point records in the synthetic helper payload.
- AI-504 refuses reversed spread, leverage, capex, price/book and buyback operands; source-order controls pass. No reciprocal or negated replacement value is computed.
- AI-116 restores listed insider roles and qualifies historical dropped-role judgments before frozen 1.56.0. Stored marks are not upgraded.
- AI-103 admits registered issuer-origin payload evidence in the judge; news and absent/third-party records remain non-primary. The analyst default stays unchanged.
- AI-104 removes four false fade/new-clause warnings and retains continued-recovery warnings. AI-111 permits contextual honorific/initial surnames while preserving explicit rating refusals.
- RPT-504 hides legacy data-only shares and the job-panel citation rate on reader surfaces and retains qualified raw audit counts. DB-004/RPT-209 preserve absent, confirmed-old, confirmed-current and unconfirmable completeness conventions. Corrected copies of stored 43/48 retain the original metadata.
- RPT-212 gives headerless bodies both run notices; bodies beneath a snapshot header suppress duplicate notices. RPT-206 separates data gaps from notes/process disclosures. Stored banner counts: 42: 12 -> 1; 44: 48 -> 33; 47: 14 -> 4; 51: 31 -> 15 (including RPT-207's dataset split).
- RPT-207 splits price histories and statement periods without changing raw manifest or persisted counts. Same-manifest controls retain keyless/market-cap merges and keep peers/unknown issuers separate. Stored grouping changes include report 1: +1; 2/3: +4 each; 13-20: +2 each; 51: +1.
- RPT-211 registers the previously omitted body-table figure groups, preserving raw IDs, periods and stored values with the existing serializer.

## Replay and conventions

Paired assembled-report replay uses the production facade over frozen inputs 43, 46, 48, 49 and 50 with network/model calls blocked. Comparing all log statuses to ef1aff54 finds zero numeric-status changes and one intended AI-116 reason change at report 48's insider activity path: the dropped-title refusal is removed, but numeric attribution still leaves the claim unchecked. It is not upgraded to verified. All other log statuses are unchanged. Individual replay receipts also cover AI-408, AI-501, AI-502, AI-504, AI-116, AI-103, AI-104 and AI-111.

A separate stored-reader replay parses all 51 archived reports, checks SHA256 before and after real read/render on disposable copies, asserts no parsed-report mutation and detects a deliberate write, verifies absent completeness on 38 and qualified historical audit notes on 39/48. Corrected-export replay writes disposable copies of 43/48 and preserves original completeness and source bytes.

The existing report 1.56.0, payload 1.60.0 and Stage B CLAUDE_REPAIRS_39 stamps do not move again. Only the AI-103 judge instruction moves pipeline stage-c-1.6.17 -> stage-c-1.6.18. Historical financial/payload hashes and audit-intended-deltas are unchanged; no financial value, score, grade denominator or stored report is rewritten. The previously missed AI-407 job-runner spec pin is corrected from 1.55.0 to the already-shipped 1.56.0.

## Limits and validation

AI-407 still detects conflicts rather than requiring full paraphrase agreement. Segment shares remain computed before number verification. The verifier deliberately withholds uncertain metric, period, operand and comparative attribution instead of inferring another figure. AI-502 does not infer the standard meant by a comparative. AI-111's closed mask retains fail-closed ambiguous initial continuations and whole-sentence ratings. No claim of full historical re-verification is made.

Final focused consumer, typecheck and lint receipt names and results are in tmp/claude-impl/HANDOFF.md. No full verify, provider call, push, PR, merge, stash or history rewrite was performed. Concurrent earningsSchedule.ts and the schedule-qualified support line were not edited.

Validation at the final source: P3-acceptance-consumers passed 34 files / 1504 tests. The subsequent job-panel correction passed 58 direct reader-consumer tests (P3-job-panel-final-green). P3-finish-typecheck passed. P3-finish-lint passed with zero warnings. P3-final-replays passed 7/7 and P3-final-docs passed 99/99. Receipts are recorded in the hand-off.

## Review fixes

All seven independent-review findings are fixed. Recorded JSON, financial figures,
stamps and payload goldens are unchanged.

| Review finding | Status / commit | Red receipt | Green receipt | Intended delta |
| --- | --- | --- | --- | --- |
| 1 RPT-206 | Fixed / 55896e56 | RF1-red | RF1-green | Research complete -> recorded degraded for process-only warning |
| 2 AI-111 | Fixed / f511cb7e | RF2-red | RF2-green | Two comma rating directives accepted -> refused; appositive names pass |
| 3 AI-104 | Fixed / 8753fb81 | RF3-red | RF3-controls | Two origin-decline recoveries unflagged -> flagged; fade controls pass |
| 4 AI-116 | Fixed / 7596b793 | RF4-red | RF4-green | No-evidence/single-role notes removed; officer-first multi-role note added |
| 5 RPT-207 | Fixed / 8f94c4fe | RF5-red | RF5-green | Six groups -> four for issuer + SPY + sector ETF + annual income and fallbacks |
| 6 Records | Fixed / 155dd559 | RF6-red | RF6-final-green | Duplicate paragraph, heading, stored-share wording and test BOM corrected |
| 7 Evidence | Fixed / this commit | RF7-red | RF7-judge-final; RF7-stored-replay | Preservation negative control fails before repair; real #38 judge claims replayed |

The only Research slot is in ReportSnapshotHeader, shared by classic and dossier
saved routes. It retains c.state; no classified Data slot was added. Job-panel
completeness and Markdown/print/audit data summaries keep qualified data counts
and process disclosures, through their existing shared helpers.

RF6-green initially found the release test's tracked-file partition mismatch:
the new test had not yet been staged. RF6-final-green passes after staging it.
RF7-green exposed an incorrect replay expectation that the curated entity
registry enumerated historical misspellings. It does not; that speculative
expectation was corrected without changing production entity validation.

AI-103 evidence is now partly real: the read-only archived LLY report #38 was
available under Downloads/Thesis-AI-equity-research/tmp/audit-2026-10-27/data/reports/38.json.
Its 14 recorded press-release/transcript claims (verbatim source spelling and
text, source SHA256 in tests/fixtures/p3-stored38-issuer-claims.json) run through
runJudgePass with MockRunPass and network guards. The historical context payload
was not retained for #38; only source membership is reconstructed from its
recorded citations/asOfMap. This is a real-claim judge-path replay, not a full
historical payload replay or re-verification. No primary-source-required error
remains for those carried sources. The ACHIEVE/retatrutide relationship conflict
still refuses. Unknown legacy spellings (Syntessa, Colonia, Koundeo) are outside
the curated alias inventory and are not inferred as errors by this check.
The old AI-103-replay receipt covered only verify; it was not judge evidence.

The corrected 51-report reader replay hashes disposable copies before and after
actual parsing and audit rendering, asserts parsed objects are unchanged, then
asserts a deliberate file write is detected. A normal-suite negative control
also proves the preservation helper can fail. Original archived files are read
only; the production reader remains unchanged.

Review acceptance: RF-final-consumers passed 23 files / 666 tests (including
payload goldens); RF-final-consumers-extra passed six files / 377 tests;
RF7-judge-final passed three files / 81 tests after adding an absent-membership
refusal control using the real acquisition claim. RF7-stored-replay passed both
51-report reader and corrected-copy tests. RF-final-typecheck and RF-final-lint
exited zero without diagnostics. RF-final-docs covers the three required docs
and stamp gates after these records changes. No full verify was run.
