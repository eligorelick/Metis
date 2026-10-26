# Audit batch 5: make the trust signals mean what they say (2026-10-26)

Base: `2f2aa3b` (origin/main). Scope: batch 5 of the independent audit of 2026-10-22, the findings where the report's trust signals overstated what had been checked: F-22, B-10, F-21, F-23 and F-20, with B-31 and the Batch 1 quote-label carry-over. Decision: D-107 in [DECISIONS](DECISIONS.md); report 1.41.0 and pipeline stage-c-1.6.3. Payload 1.45.0 and Stage B ACCOUNTING_EVIDENCE_23 are unchanged. The audit evidence folders stay out of the repository.

This change made no model calls and no paid provider calls. The only provider traffic was the keyless, data-only control panel below, served from the run cache behind a dead proxy. No fixture file was added; the new tests use the repository's existing report fixtures and synthetic bundles.

## Disposition

| Finding | Disposition | Commit | Tests |
|---|---|---|---|
| F-22 "Contradicted" counted period and unit gaps as value conflicts | Fixed (owner decision). Contradicted means a value conflict only: an amount outside its cited figure's rounding interval, or a direction word against the sign of its cited change. A period, unit or currency the cited record does not establish reads "unverified (period or unit not established)". The period-word and unit-word failures stay in the verification log and the missing-data manifest. A stored report is read under the same rule, and the audit export prints "unchecked (recorded contradicted; period or unit not established)" for such an entry. | `8355381` | `tests/stageC.contradictedValueOnly.test.ts`, `tests/report.runDisclosure.test.ts` |
| B-10 The verification headline led with the citation-traced share | Fixed (owner decision). The line leads with numeric claims matched to a cited figure (n/N and a percentage), then contradicted and qualitative counts. Figures traced to a cited source and factual claims carrying a citation move to a separate Provenance line in the report, print and page headers. The Verification table lists the numeric row first. | `c048c80` | `tests/report.verificationHeadlineOrder.test.ts` |
| F-21 No per-claim validation status anywhere in the body | Fixed (owner decision). Each factual claim the verify pass logged carries `[validated]`, `[unverified]`, `[contradicted]` or `[qualitative]` after its citation in both page layouts, the Markdown and the print report, matched to its log entry by path and text. The header counts equal the marked claims: grade-strip reasoning, which no surface prints, stays in the log but out of the counts, and the audit export says how many were left out. | `bc58553` | `tests/report.claimStatusMarks.test.ts` |
| F-23 Data-only figures printed ✓ although no citation check ran | Fixed (owner decision). A data-only report's figures print "computed" under Cited and beside each figure, with a legend under the first table that uses the column; the figure detail and the audit export say "computed (no citation check ran)". A checked report keeps ✓. The stored `verified` value is unchanged, because the enterprise-value and debt checks read it. | `c27a596` | `tests/report.computedMark.test.ts` |
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

PANEL_TBD

## Independent review

REVIEW_TBD
