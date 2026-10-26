# Audit batch 5: make the trust signals mean what they say (2026-10-26)

Base: `2f2aa3b` (origin/main), merged with origin/main at `6df9ed9` (readable note figures, D-107) and `c10bb4b` (parent net income, D-108). Scope: batch 5 of the independent audit of 2026-10-22, the findings where the report's trust signals overstated what had been checked: F-22, B-10, F-21, F-23 and F-20, with B-31 and the Batch 1 quote-label carry-over. Decision: D-109 in [DECISIONS](DECISIONS.md); report 1.41.0 and pipeline stage-c-1.6.3. This batch leaves the payload (1.46.0 after the merges) and Stage B (ACCOUNTING_EVIDENCE_25 after the merges) unchanged. The audit evidence folders stay out of the repository.

This change made no model calls and no paid provider calls. The only provider traffic was the keyless, data-only control panel below, served from the run cache behind a dead proxy. No fixture file was added; the new tests use the repository's existing report fixtures and synthetic bundles.

## Disposition

| Finding | Disposition | Commit | Tests |
|---|---|---|---|
| F-22 "Contradicted" counted period and unit gaps as value conflicts | Fixed (owner decision). Contradicted means a value conflict only: an amount outside its cited figure's rounding interval, or a direction word against the sign of its cited change. A period, unit or currency the cited record does not establish reads "unverified (period or unit not established)". The period-word and unit-word failures stay in the verification log and the missing-data manifest. A direction conflict stays contradicted when the same claim's period or unit word also fails. A stored report is read under the same rule: the audit export prints "unchecked (recorded contradicted; period or unit not established; value not rechecked)" for such an entry, and reads its numeric-support and prose-support columns the same way, because a legacy entry kept only its first failure. | `8355381`, `c099095`, `0d0c2f7`, `304e36c` | `tests/stageC.contradictedValueOnly.test.ts`, `tests/report.runDisclosure.test.ts`, `tests/report.claimSupport.test.ts` |
| B-10 The verification headline led with the citation-traced share | Fixed (owner decision). The line leads with numeric claims matched to a cited figure (n/N and a percentage), then contradicted and qualitative counts. Figures traced to a cited source and factual claims carrying a citation move to a separate Provenance line in the report, print and page headers. The Verification table lists the numeric row first. | `c048c80` | `tests/report.verificationHeadlineOrder.test.ts` |
| F-21 No per-claim validation status anywhere in the body | Fixed (owner decision). Each factual claim the verify pass logged carries `[validated]`, `[unverified]`, `[contradicted]` or `[qualitative]` after its citation in both page layouts, the Markdown and the print report, matched to its log entry by path and text. The header counts equal the marked claims: grade-strip reasoning, which no surface prints, stays in the log but out of the counts, and the audit export says how many were left out. A removed log entry marks and counts nothing: an earnings-reference guard row was never a counted claim, and a claim the legacy entity check withholds on read prints as an unmarked placeholder and leaves the counts at its recorded status. | `bc58553`, `0175be3` | `tests/report.claimStatusMarks.test.ts`, `tests/report.legacyEntitySafety.test.ts` |
| F-23 Data-only figures printed ✓ although no citation check ran | Fixed (owner decision). A data-only report's figures print "computed" under Cited and beside each figure, with a legend under the first table that uses the column; the figure detail and the audit export say "computed (no citation check ran)". A checked report keeps ✓ and no legend, even where its own cells read "computed" (a Sources row's provider). The stored `verified` value is unchanged, because the enterprise-value and debt checks read it. | `c27a596`, `8762416` | `tests/report.computedMark.test.ts` |
| F-20 Code-written method, heuristic and proxy text labelled FACT | Fixed (owner decision). The capital grading basis and the debt-bridge convention (every report), and on a data-only report the score-to-band and score-unavailable sentences, the net-debt method note, interest-coverage gap notes, the HEURISTIC maintenance-capex and buyback notes, an unavailable dilution overhang and the price-versus-repurchase-proxy comparison carry JUDGMENT. The repurchase total stays a FACT sentence of its own. Computed-figure sentences stay FACT. | `c309660` | `tests/report.templateLabels.test.ts`, `tests/degradation.report.test.ts` |
| B-31 WACC and cost of debt shown on financial routes | Already fixed on main by batch 2b (D-104, commits `dc73ff6`, `058bfc3`, `2475992`); skipped. | none | none |
| Batch 1 carry-over: the payload labels a keyless Yahoo quote `fmp:quote` | Skipped as out of scope. The label is part of the Stage C payload contract: changing it moves the payload version and its fingerprint pins, and the verifier and stored citations resolve it. No displayed figure is affected. It belongs with a payload batch. | none | none |
| F-24, C-2, C-4, F-2, F-33, F-32, F-31, D-1, F-29, F-25, F-30 | Postponed by owner scope 2026-10-26. | none | none |

Every new test failed before its fix, except the checks that a verified report keeps ✓ and no legend, which pass on both sides by design.

## Owner decisions

- **F-22 and B-10 (given).** "Contradicted" is a value conflict only; a metadata gap is "unverified (period or unit not established)". The headline leads with numeric claims validated (n/N); traced figures follow as a secondary provenance line.
- **F-21 (given).** Each factual bullet carries its status after its citation, and the header counts equal the marked bullets. Making them equal needed one judgment: the verify pass also logs the grade strip's reasoning, which no surface prints (META's are copies of the section's own claims), so those entries are left out of the displayed counts and named in the audit export rather than counted twice.
- **F-23 (given).** "computed" in place of ✓ on a data-only report, with a legend under the first table that uses the column.
- **F-20 (given).** JUDGMENT, not a new METHOD label: the label set is the model's structured-output schema (`ClaimLabelSchema`), so a new value would change the contract every pass and every stored report is validated against. That is neither cheap nor backward compatible. The repurchase sentence is split so that the cash total, a filed figure, stays FACT.

## Stored reports

The four deep-dive reports (`AUDIT/audit/companies/*/report/stored-record.json`) render under the new rules with their bytes unchanged. On each, the marks counted on the page (classic and dossier), the Markdown and the print report equal the header counts exactly.

| Report | Base verification line | Head verification line | Marks (validated / unverified / contradicted / qualitative) |
|---|---|---|---|
| COF | 80/85 figures traced; 106/106 factual claims cited; 16/79 numeric claims numerically matched; 0 contradicted | 16/72 (22.2%) numeric claims matched; 0 contradicted; 27 qualitative | 16 / 56 / 0 / 27 |
| META | 115/116 figures traced; 136/136 cited; 33 recorded numerical matches, denominator unknown; 8 contradicted | 28/101 (27.7%) numeric claims matched; 0 contradicted; 29 qualitative | 28 / 73 / 0 / 29 |
| RIVN | 93/113 figures traced; 108/108 cited; 42/79 numeric claims numerically matched; 0 contradicted | 37/73 (50.7%) numeric claims matched; 0 contradicted; 29 qualitative | 37 / 36 / 0 / 29 |
| SO | 125/131 figures traced; 105/105 cited; 31 recorded numerical matches, denominator unknown; 6 contradicted | 31/73 (42.5%) numeric claims matched; 0 contradicted; 25 qualitative | 31 / 42 / 0 / 25 |

META's 8 and SO's 6 "contradicted" were all period or unit gaps (F-22), so they read unverified, and the numeric denominator becomes known. The smaller numerators and denominators come from the grade-strip reasoning entries, which no surface prints (F-21). The provenance figures (traced figures and cited claims) are unchanged, apart from the same grade-strip entries leaving the claim counts.

## Control panel

Both sides (base `2f2aa3b`, head this branch before the merges of `6df9ed9` and `c10bb4b`, whose own controls cover their changes) ran the 45-company keyless panel data-only, behind a dead proxy, from copies of the census run cache, with the clock fixed at 2026-10-22T06:00:00Z. Both completed 45 of 45 at zero cost, with no cost-log rows and no FMP key.

| Output | Base → head |
|---|---|
| `census.csv` (every figure, grade, withheld count and gap family) | Identical in all 45 rows apart from elapsed time |
| Stage B results | Identical for all 45 |
| `report.json` | Differs only in claim labels (FACT → JUDGMENT on the capital grading basis, debt-bridge, capex, coverage and grade-strip reasoning notes), the capital-allocation repurchase split, the report and pipeline stamps, and run timestamps and snapshot hashes |
| ✓ cells in `report.md` | 5,824 → 0 |
| "computed" cells in `report.md` | 88 → 5,912 (the base's 88 are Sources-table provider cells) |
| Reports with the computed legend | 0 → 45 |
| `[FACT]` / `[JUDGMENT]` labels in `report.md` | 809 / 540 → 268 / 1,111 |

No figure moved: valuation, WACC, fair value, grades and every withheld count are equal on both sides. A data-only report logs no claims, so it carries no status marks. After the review fixes, the head side's 45 reports re-render to byte-identical Markdown and audit exports.

## Independent review

Two independent reviews ran on the five finding commits (the /code-review skill and a separate subagent), and a second round ran on the follow-up commits. Every confirmed finding was fixed test-first:

- **The legend could appear on a checked report** (`8762416`). The exporters had decided by searching their output for a "computed" cell, and a Sources row whose provider is "computed" matched it. Now they ask whether the report is data-only and has a computed figure.
- **A direction conflict was lost behind a period word** (`c099095`). The verify pass took a claim's first failed check, and the period check runs first. So "Revenue change rose 5% in 2024." against a −5% change for 2025 read unverified, not contradicted. The direction failure now takes precedence.
- **Removed log entries were counted or marked** (`0175be3`). An earnings-reference guard row, which no count includes, was subtracted from the header as an unprinted grade-strip claim. A claim the legacy entity check withheld printed its placeholder marked [contradicted], while the header still counted the original. Removed entries now mark and count nothing, and the read view takes a withheld claim out of the counts at its recorded status.
- **A legacy gap's other columns still said contradicted** (`0d0c2f7`, `304e36c`). The audit export relabelled the status column but not the numeric-support and prose-support columns, and its outcome column read "uncited" for any contradicted claim. Each now reads consistently, and a legacy entry says "value not rechecked", because it kept only its first failure.

Reviewed and left as they are:
- **Method notes that carry an amount stay JUDGMENT.** For example, "net debt excludes the operating-lease liability 12.3B, as enterprise value does". The sentence asserts the convention; the amount is the input it applies to.
- **Figure counts still include the grade strip's key numbers.** No figure carries a status mark, so there is nothing to equalise, and the contradicted-figure count is defined (AMZN audit finding 12) as the records the audit export lists.
- **The indexing design (WeakMap, WeakSet) and some duplication between the two exporters** are style, not defects.
- **Hypothetical edge cases kept as they are**, because no realistic input was found:
  - a log written before `validationStatus` existed is not adjusted when a claim is withheld;
  - a withheld figure entry whose own text names a conflicting entity counts as a contradicted figure (this predates the batch).
