# P0 review fixes (2026-11-02)

Independent review: integration branch at eecd2703. Scope is the local REVIEW.md, rather than a new repair of the original 230-finding audit. No issuer-specific production rules, provider calls, dependency installs, or model-registry changes.

| Finding | Disposition | Commit | Red receipt | Green receipt | Stored-report impact |
| --- | --- | --- | --- | --- | --- |
| M-1 | Fixed | e786cb36 | m1-red (3 failures) | m1-green (32 pass), l2-green (36 pass) | New admission only; ambiguous multi-class units retain vendor fields without conflicts. |
| M-2 | Fixed | 26e50008 | m2-l1-red | m2-l1-focused-green | New verify/assembly only; dividend and registered filing dates remain unchanged. |
| L-1 | Fixed | 26e50008 | l1-original-behavior-red | p0-final-consumer-green, l1-green | Qualification rows use removed, which existing claimMatching and legacyEntitySafety recounters exclude. Stored bytes unchanged. |
| L-2 | Fixed | e786cb36 | l2-red (3 failures) | l2-green (36 pass) | New admission only; three cent-rounded pairs retained; 0.04 vs 0.06 still refused. |
| L-3 | Fixed | ffa8ce0a | l3-red (1 failure) | l3-green (37 pass) | New conflict text only; latest filing still wins. Methodology recorded in the following M-2 commit. |
| L-4 | Fixed | a2f11f0a | l4-red (2 failures) | l4-green (4 pass), l4-accounting-green (2 pass) | New artifacts only; rejectedText cannot credit carried sections. Historical partialText artifacts are not rewritten. |

Report spec 1.55.0 to 1.56.0; payload 1.59.0 to 1.60.0; Stage B source-reconciliation 38 to the shared CLAUDE_REPAIRS_39. No prompt changed, so pipeline remains stage-c-1.6.17. No display-time reinterpretation or new frozen cutoff. The payload golden restores only the new stamp before all existing byte/hash/financial assertions; the intended-deltas fixture changes only the report stamp. The integrator must repin the merged fixture.

Direct downstream checks include the bundle producer, Stage B values/grades, payload provenance, data-only reports and Markdown exports in keyless.shareReconciliation; split-basis controls; earnings verifier/assembly; legacy claim readers; and durable cost-breakdown recovery. All refusal behavior outside these comparisons remains unchanged.

Residuals: optional technicalTrendText equality wording was deferred. Multi-class vendor conventions were reproduced synthetically, not verified against live FMP data. Previously written complete rejections in partialText retain their historical cost labels. Older strict readers still cannot read rejectedText artifacts (review L-5); rollback requires the compatible artifact reader. Final gate receipts and owner questions are recorded in tmp/claude-impl/HANDOFF.md.

Final focused gates: p0-final-focused (469 passed), p0-release-green (31 passed), p0-final-consumer-green (19 selected passed), p0-typecheck-green and p0-final-lint-green. L-1 red was rerun with only the original unverified audit outcome restored after correcting the test callback; the original combined red did not reliably measure that assertion.

## Integration review corrections (Claude, 2026-11-02)

The integrating reviewer found three defects in the commits above and corrected them before integration:

- **M-2 clause binding.** The committed splitter treated every comma as a clause boundary, and its dash alternative held two literal question marks instead of em/en dashes (the characters were lost to file encoding). Two consequences: "On 2026-11-04, Figma will report third-quarter results." was no longer qualified, and "Earnings rose 5% year over year — the special dividend is payable 2026-11-04." was qualified. Now sentence ends, semicolons and spaced em/en dashes (written as `—`/`–` escapes) are hard boundaries. A comma splits the clause, but a bare date phrase set off by a comma ("On <date>,", "…on Wednesday, <date>") reads with the piece beside it. Only the comma piece that states the event is amended, so a second use of the same date nearby is left alone. Tests in `tests/report.earningsSchedule.test.ts`: two dash cases and two bare-date-phrase cases were red before the correction; a same-date-twice control was added. All existing boundary cases are unchanged.
- **Verify-pass crash.** The M-2 change read `payload.filings.filter(...)` in `runVerifyPass` and in assembly; a payload without `filings` threw a TypeError (two `tests/stageC.verifyChecks.test.ts` cases failed). The read now falls back to an empty list, matching the neighbouring optional payload reads.
- **Lost characters.** This note's heading and stamp line, and the CHANGELOG heading, carried "?" where the author's dash and arrows were lost to file encoding. Restored, using the CHANGELOG's own heading convention.

Gates after the correction: `tests/report.earningsSchedule.test.ts`, `tests/stageC.payload.passes.test.ts`, `tests/stageC.verifyChecks.test.ts`, `tests/stageC.sectionCheckpoint.test.ts` and `tests/report.forensicObservationContext.test.ts`: 407 passed (receipt `m2b-clauses-green-2`).

**Open, decided for the next commit: the M-1 rule is too broad.** `e786cb36` treats any registrant with more than one SEC ticker as not comparable. That includes FIGR (`FIGR`, `FGRS`), the owner's target issuer, and registrants whose SEC ticker list carries preferred-stock symbols. For them, the FIG-A01 protection against contradicted vendor EPS and share fields is switched off. The replacement rule keeps single-ticker behaviour unchanged. For a multi-ticker registrant, it compares only after the share unit is established empirically: at least one comparable period where the vendor's weighted-average share count agrees with the filer's within the existing tolerance. A Berkshire-shaped class-unit difference never agrees, so it is still not compared.
