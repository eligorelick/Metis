# R1/R4 FIGR paid-run audit: evidence, run accounting and analysis rules

The paid FIGR report of 2026-11-02 (job 4576ba50, claude-opus-5-5, high effort, $4.712836 recorded across eight requests) was audited three ways:

- a section-by-section read checked against the exact model input rebuilt from the frozen snapshot (payload fingerprint 1.60.0:8a00a422);
- an independent facts review;
- an independent reasoning and presentation review.

This record covers the fixes in this branch. Wrong figures from mixed sources (R2), report readability (R3) and verifier false negatives (R5) have their own records.

| Finding | Disposition | Root cause | Test | Stored-report impact |
| --- | --- | --- | --- | --- |
| Kiavi consideration "not established" (completion 8-K: approximately $590 million cash, net of cash acquired) | Fixed | Event excerpt priority passages taken in source order. A defined-term passage ("Kiavi (the "Merger")") used the 990 usable characters before the consideration. The agreement 8-K's dated lead went unrecognised behind a sub-heading and spaced quotes. Digit-written amounts did not rank. | `tests/evidenceSelection.eventTransaction.test.ts` | None; coverage `section-evidence-6/event` on new payloads |
| Preliminary Q3 2026 operating data ($5,119 million marketplace volume) read only as a news headline; "first filed check" in November | Fixed | Four results releases filled the four retained slots, so the October 7 operating update was dropped before any narrative rule applied (OD-10/AI-506). On live data the first fix still dropped it: the update states only its period end and the results release only its fiscal label, and release order put the labelled release first; "after" is now decided by filing | `tests/currentReports.resultsNarrative.test.ts` (R1 slot, R1 excerpt, R1 filing-date case, AI-506/OD-10 cases) | None; fetch-time change, visible on the next data refresh |
| Guidance record "cannot be graded" (Q2 guide $3.8–4.1B vs Q2 result $4,259M) | Fixed (evidence) | The May release's unparsed outlook statement was the seventh current-report note under a six-note cap | `tests/currentReports.resultsNarrative.test.ts` (outlook statements) | None |
| Bear first attempt rejected for two blank `asOf` values ($0.37, 15,653 output tokens) | Fixed | A blank date failed the ISO-date check, although null is the schema's "no date" | `tests/stageC.payload.passes.test.ts` (blank asOf) | None |
| Earnings date "company confirmation not established" beside the model's own newswire mention | Fixed (wording) | The qualifier did not name the confirming sources; a newswire copy confirms nothing under the existing rule | `tests/report.earningsSchedule.test.ts` | None; applies to new reports |
| Usage "134,019 input / 29,782 output tokens" beside $4.71 across eight requests | Fixed | Tokens summed only each pass's accepted attempt; the cost summed every ledger row | `tests/report.usageAccounting.test.ts`, `tests/jobRunner.test.ts` | Reports without token-bearing rows keep the earlier wording |
| FACT claims carrying "In our judgment …" (AUDIT-B B-17) | Fixed | No structural separation of fact and interpretation | `tests/stageC.embeddedJudgment.test.ts` | None |
| Price "about right" without a suited valuation measure (B-01); unscored aspects called "neutral D" (B-02, F09) | Rule added | The opening-stance instruction offered no "cannot be judged" option; nothing said an unscored aspect has no band | Prompt text in `src/pipeline/stageC/prompts.ts` | Effect observable only in a later paid run |
| Revenue growth called pre-tax growth (B-10, F12); net take rate read as price (F11); "most of revenue" at 42% (F22); notional read as a recorded liability (F18); post-June commitment chronology (F17); deconsolidated REIT warehouse as a current renewal (F03); third-party cash omitted (F06); market-share direction (F13); consensus "needs Kiavi" (B-11, F14); annual concentration conflict (F20); citation binding (F25); guidance record (F07) | Rules added | Reasoning slips the instructions did not guard against | Prompt text (`READING THE EVIDENCE ACCURATELY`) | As above |
| Business model never explained (B-06); insider sales softened as withholding/plan (B-07); voting control unexplained (B-05) | Rules added | No instruction | Prompt text | As above |

## Evidence and residuals

- **Kiavi.** The completion 8-K is replayed from the paid snapshot. At 1,200 characters the old selection kept 899 of 2,818 source characters and lost the consideration. The tiered selection keeps it at 1,200. At the transaction budget it keeps the lead, the consideration and the funding.
- **Operating update.** The paid snapshot holds four results releases (2026-08-13, 05-12, 02-26, 02-13) and none of the operating updates (10-07, 07-07, 04-03). The new slot applies at fetch time. A replay of the frozen snapshot cannot show it; a data-only refresh does. The first data-only refresh (2026-11-02) still dropped the October 7 update: rebuilt from that run's cached EDGAR documents, its record states only a period end (2026-09-30) while the August 13 results release states only "Q2 FY2026", and release order put the labelled release first. The filing-date rule fixes it.
- **Not addressed here.** These need either a paid run or other packages:
  - Governance control facts beyond the instruction (B-05).
  - The common-earnings bridge display (B-09).
  - Form 144 coverage (B-21).
  - Cross-section coherence after retries, beyond the FACT split and the stance rules (B-19).
- **Pipeline version.** stage-c-1.6.19. Report spec and payload version bumps are applied once at batch integration.
