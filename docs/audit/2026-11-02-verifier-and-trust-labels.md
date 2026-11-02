# P3 verifier and trust labels - bounded implementation

All 16 P3 findings are implemented, including the previously approved AI-407. Each remaining finding has a red receipt and focused passing controls.

| Finding | Disposition | Commit | Red / green receipts | Stored-report impact |
| --- | --- | --- | --- | --- |
| AI-407 | Fixed | Owning AI-407 commit | AI-407-red / AI-407-final-green; AI-407-empty-red | None: stored reports are never rewritten |
| AI-408 | Fixed | Owning AI-408 commit | AI-408-red; AI-408-context-red / AI-408-final-green; AI-408-context-green; AI-408-replay | No stored writes; zero replay numeric status deltas |
| AI-501 | Fixed | Owning AI-501 commit | AI-501-red / AI-501-green; AI-501-controls; AI-501-replay-final | No stored writes; zero numeric replay status deltas |
| AI-502 | Fixed | Owning AI-502 commit | AI-502-red / AI-502-green; AI-502-controls; AI-502-replay | No stored writes; zero numeric replay deltas |
| AI-504 | Fixed | Owning AI-504 commit | AI-504-red / AI-504-green; AI-504-controls; AI-504-replay | No stored writes; zero numeric replay deltas |
| AI-116 | Fixed | Owning AI-116 commit | AI-116-red; AI-116-legacy-red / AI-116-green; AI-116-controls; AI-116-replay | Display-only note before frozen 1.56.0; no stored writes |
| AI-103 | Fixed | Owning AI-103 commit | AI-103-red; AI-103-judge-red / AI-103-green; AI-103-controls; AI-103-replay | No stored writes; verify replay unchanged |
| AI-104 | Fixed | Owning AI-104 commit | AI-104-red / AI-104-green; AI-104-controls; AI-104-replay | No stored writes or replay manifest deltas |
| AI-111 | Fixed | Owning AI-111 commit | AI-111-red / AI-111-final-green; AI-111-replay | No stored writes; rating outcomes unchanged on replay strings |
| RPT-504 | Fixed | Owning RPT-504 commit | RPT-504-red / RPT-504-green | Reader shares hidden for data-only; raw audit counts retained |
| DB-004 | Fixed | Owning completeness commit | DB-004-RPT-209-red / DB-004-RPT-209-green; DB-004-RPT-209-controls | Carry recorded convention; no stored writes |
| RPT-209 | Fixed | Owning completeness commit | DB-004-RPT-209-red / DB-004-RPT-209-green; DB-004-RPT-209-controls | Carry recorded convention; no stored writes |
| RPT-212 | Fixed | Owning RPT-212 commit | RPT-212-red / RPT-212-green; RPT-212-controls | Display-only placement; stored notices unchanged |
| RPT-206 | Fixed | Owning RPT-206 commit | RPT-206-red / RPT-206-green | Display-only counts and state; recorded metadata unchanged |
| RPT-207 | Fixed | Owning RPT-207 commit | RPT-207-red / RPT-207-green; RPT-207-controls | Display-only dataset grouping; raw manifest unchanged |
| RPT-211 | Fixed | Owning RPT-211 commit | RPT-211-red / RPT-211-green | Additional raw figure registry rows; body unchanged |

## Evidence and intended deltas

- AI-408 refuses wrong readable columns and conflicting supplied periods; valid dates, fiscal labels, typed duration endpoints and unparsed windows have controls. The old FY1999 acceptance pin changes from 100% to 50% for its paired valid/invalid cells.
- AI-501 keeps defining direction nouns. Asset-level claims against an increase become unchecked. Noun-form increase and net-gains controls remain supported. Verb-change recall against increase-named records remains deliberately withheld.
- AI-502 leaves spread rise/fall prose unchecked instead of validated/contradicted. Slopes and temporal-change records retain direction checks. A census pins all 11 percentage-point records in the synthetic helper payload.
- AI-504 refuses reversed spread, leverage, capex, price/book and buyback operands; source-order controls pass. No reciprocal or negated replacement value is computed.
- AI-116 restores listed insider roles and qualifies historical dropped-role judgments before frozen 1.56.0. Stored marks are not upgraded.
- AI-103 admits registered issuer-origin payload evidence in the judge; news and absent/third-party records remain non-primary. The analyst default stays unchanged.
- AI-104 removes four false fade/new-clause warnings and retains continued-recovery warnings. AI-111 permits contextual honorific/initial surnames while preserving explicit rating refusals.
- RPT-504 hides legacy data-only shares on reader surfaces and retains qualified raw audit counts. DB-004/RPT-209 preserve absent, confirmed-old, confirmed-current and unconfirmable completeness conventions. Corrected copies of stored 43/48 retain the original metadata.
- RPT-212 gives headerless bodies both run notices; bodies beneath a snapshot header suppress duplicate notices. RPT-206 separates data gaps from notes/process disclosures. Stored banner counts: 42: 12 -> 1; 44: 48 -> 33; 47: 14 -> 4; 51: 31 -> 15 (including RPT-207's dataset split).
- RPT-207 splits price histories and statement periods without changing raw manifest or persisted counts. Same-manifest controls retain keyless/market-cap merges and keep peers/unknown issuers separate. Stored grouping changes include report 1: +1; 2/3: +4 each; 13-20: +2 each; 51: +1.
- RPT-211 registers the previously omitted body-table figure groups, preserving raw IDs, periods and stored values with the existing serializer.

## Replay and conventions

Paired assembled-report replay uses the production facade over frozen inputs 43, 46, 48, 49 and 50 with network/model calls blocked. Comparing all log statuses to ef1aff54 finds zero numeric-status changes and one intended AI-116 reason change at report 48's insider activity path: the dropped-title refusal is removed, but numeric attribution still leaves the claim unchecked. It is not upgraded to verified. All other log statuses are unchanged. Individual replay receipts also cover AI-408, AI-501, AI-502, AI-504, AI-116, AI-103, AI-104 and AI-111.

A separate stored-reader replay parses all 51 archived reports, checks source SHA256 preservation, verifies absent completeness on 38 and qualified historical audit notes on 39/48. Corrected-export replay writes disposable copies of 43/48 and preserves original completeness and source bytes.

The existing report 1.56.0, payload 1.60.0 and Stage B CLAUDE_REPAIRS_39 stamps do not move again. Only the AI-103 judge instruction moves pipeline stage-c-1.6.17 -> stage-c-1.6.18. Historical financial/payload hashes and audit-intended-deltas are unchanged; no financial value, score, grade denominator or stored report is rewritten. The previously missed AI-407 job-runner spec pin is corrected from 1.55.0 to the already-shipped 1.56.0.

## Limits and validation

AI-407 still detects conflicts rather than requiring full paraphrase agreement. Segment shares remain computed before number verification. The verifier deliberately withholds uncertain metric, period, operand and comparative attribution instead of inferring another figure. AI-502 does not infer the standard meant by a comparative. AI-111's closed mask retains fail-closed ambiguous initial continuations and whole-sentence ratings. No claim of full historical re-verification is made.

Final focused consumer, typecheck and lint receipt names and results are in tmp/claude-impl/HANDOFF.md. No full verify, provider call, push, PR, merge, stash or history rewrite was performed. Concurrent earningsSchedule.ts and the schedule-qualified support line were not edited.
