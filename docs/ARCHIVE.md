# Archived documents

Some working documents have been taken out of the working tree because the work they describe is finished. They are
not deleted. Each one is kept, byte for byte, in the repository's history, and the links below open it at the last
commit on `main` that still contained it. A link to a commit never changes or breaks, so these documents stay readable
and citable.

Archived documents are history. They are not current instructions, and their unticked boxes are not open work. The
current rules are in [METHODOLOGY](METHODOLOGY.md), [OPERATIONS](OPERATIONS.md), [CONTRIBUTING](../CONTRIBUTING.md) and
the decision record [DECISIONS](audit/DECISIONS.md); the dated audit records in [docs/audit/](audit/) say what each
piece of work fixed and what it left open.

To restore a file locally: `git show d4bf240068ff1faa3d57fe84a0359488602dd6d6:<path>`.

## Executed plans and the finished UI redesign (archived 2026-11-12)

Last present in commit
[`d4bf240068ff1faa3d57fe84a0359488602dd6d6`](https://github.com/eligorelick/Metis/tree/d4bf240068ff1faa3d57fe84a0359488602dd6d6)
(merge of pull request #143). 29 files: 17,486 lines, 2.7 MB. The design specs in
`docs/internal/superpowers/specs/` and the 2026-09-06 codebase audit were kept in the tree.

### Implementation plans (`docs/internal/superpowers/plans/`)

| Document | What it was | Where the outcome is recorded |
| --- | --- | --- |
| [Research reliability implementation plan (2026-10-13)](https://github.com/eligorelick/Metis/blob/d4bf240068ff1faa3d57fe84a0359488602dd6d6/docs/internal/superpowers/plans/2026-10-13-research-reliability.md) | Evaluation infrastructure, thesis revision triggers, scenario presentation and peer valuation; all tasks ticked. | [CHANGELOG](../CHANGELOG.md), [DECISIONS](audit/DECISIONS.md) |
| [Evidence and reliability roadmap (2026-10-14)](https://github.com/eligorelick/Metis/blob/d4bf240068ff1faa3d57fe84a0359488602dd6d6/docs/internal/superpowers/plans/2026-10-14-evidence-reliability-roadmap.md) | Roadmap E01–E12 for evidence admission and comparability; marked a superseded historical snapshot on 2026-10-17. | [Book-to-code disposition](audit/2026-10-17-book-to-code-disposition.md) |
| [Research validation roadmap (2026-10-14)](https://github.com/eligorelick/Metis/blob/d4bf240068ff1faa3d57fe84a0359488602dd6d6/docs/internal/superpowers/plans/2026-10-14-research-validation-roadmap.md) | Study inventory R01–R11 for validating methods; marked a superseded historical snapshot on 2026-10-17. | [Book-to-code disposition](audit/2026-10-17-book-to-code-disposition.md) |
| [Enterprise-value integrity audit plan (2026-10-15)](https://github.com/eligorelick/Metis/blob/d4bf240068ff1faa3d57fe84a0359488602dd6d6/docs/internal/superpowers/plans/2026-10-15-amzn-integrity-audit.md) | AMZN-driven net-debt and lease/debt reconciliation fixes; all tasks ticked. | [AMZN integrity audit](audit/2026-10-15-amzn-integrity.md) |
| [Evidence and reporting follow-up (2026-10-15)](https://github.com/eligorelick/Metis/blob/d4bf240068ff1faa3d57fe84a0359488602dd6d6/docs/internal/superpowers/plans/2026-10-15-evidence-methodology-followup.md) | Follow-up after PR 16 making evidence harder to misread. | [DECISIONS](audit/DECISIONS.md) D-55/D-56, [book-to-code disposition](audit/2026-10-17-book-to-code-disposition.md) |
| [NVDA audit recovery plan (2026-10-15)](https://github.com/eligorelick/Metis/blob/d4bf240068ff1faa3d57fe84a0359488602dd6d6/docs/internal/superpowers/plans/2026-10-15-nvda-round3-recovery.md) | Recovery and release of D-65 to D-68 (PRs #20 and #24). Its one open box, the CRWV/QCOM live runs, is recorded as a separate live gap in the disposition. | [NVDA audit](audit/2026-10-15-nvda-report-34-audit.md), [book-to-code disposition](audit/2026-10-17-book-to-code-disposition.md), [DECISIONS](audit/DECISIONS.md) D-58–D-69 |
| [Production UI integration plan (2026-10-24)](https://github.com/eligorelick/Metis/blob/d4bf240068ff1faa3d57fe84a0359488602dd6d6/docs/internal/superpowers/plans/2026-10-24-production-ui-integration.md) | Bringing the redesigned research workspace (dossier layout) into the app; all tasks ticked. | `tests/report.uiParity.test.ts`, [CHANGELOG](../CHANGELOG.md) |
| [UI refinement plan (2026-10-25)](https://github.com/eligorelick/Metis/blob/d4bf240068ff1faa3d57fe84a0359488602dd6d6/docs/internal/superpowers/plans/2026-10-25-ui-refinement.md) | Readability and report-identity refinements to the workspace; all tasks ticked. | [CHANGELOG](../CHANGELOG.md) |
| [B1: claim verifier periods and windows (2026-10-27)](https://github.com/eligorelick/Metis/blob/d4bf240068ff1faa3d57fe84a0359488602dd6d6/docs/internal/superpowers/plans/2026-10-27-audit-fix-01-claim-verifier-periods.md) | Batch plan for the 2026-10-27 audit. | [B1 record](audit/2026-10-27-audit-fix-01-claim-verifier-periods.md); every finding is reconciled in [DECISIONS](audit/DECISIONS.md) D-208 |
| [B2: claim verifier sign, scale, unit and metric (2026-10-27)](https://github.com/eligorelick/Metis/blob/d4bf240068ff1faa3d57fe84a0359488602dd6d6/docs/internal/superpowers/plans/2026-10-27-audit-fix-02-claim-verifier-numbers.md) | Batch plan for the 2026-10-27 audit. | [B2 record](audit/2026-10-27-audit-fix-02-claim-verifier-numbers.md), DECISIONS D-208 |
| [B3: payload records (2026-10-27)](https://github.com/eligorelick/Metis/blob/d4bf240068ff1faa3d57fe84a0359488602dd6d6/docs/internal/superpowers/plans/2026-10-27-audit-fix-03-payload-records.md) | Batch plan for the 2026-10-27 audit. | [B3 record](audit/2026-10-27-audit-fix-03-payload-records.md), DECISIONS D-208 |
| [B4a/B4b: equity bridge, EV and invested capital (2026-10-27)](https://github.com/eligorelick/Metis/blob/d4bf240068ff1faa3d57fe84a0359488602dd6d6/docs/internal/superpowers/plans/2026-10-27-audit-fix-04-equity-bridge-and-invested-capital.md) | Batch plan for the 2026-10-27 audit, both parts. | [B4a record](audit/2026-10-27-audit-batch-b4-equity-bridge.md), [B4b record](audit/2026-11-02-b4b-equity-bridge.md), DECISIONS D-208 |
| [B5a/B5b: seasonality, 52/53-week calendars and DCF inputs (2026-10-27)](https://github.com/eligorelick/Metis/blob/d4bf240068ff1faa3d57fe84a0359488602dd6d6/docs/internal/superpowers/plans/2026-10-27-audit-fix-05-seasonality-calendars-and-dcf-inputs.md) | Batch plan for the 2026-10-27 audit, both parts. | [B5a record](audit/2026-10-27-audit-b5-seasonality-calendars-dcf-inputs.md), DECISIONS D-208 |
| [B6: bank, insurer, REIT and ADR routes (2026-10-27)](https://github.com/eligorelick/Metis/blob/d4bf240068ff1faa3d57fe84a0359488602dd6d6/docs/internal/superpowers/plans/2026-10-27-audit-fix-06-financial-routes-currency-and-grading.md) | Batch plan for the 2026-10-27 audit. | [B6 record](audit/2026-10-27-audit-b6-financial-routes.md), DECISIONS D-208 |
| [B7: paid spend accounting (2026-10-27)](https://github.com/eligorelick/Metis/blob/d4bf240068ff1faa3d57fe84a0359488602dd6d6/docs/internal/superpowers/plans/2026-10-27-audit-fix-07-paid-spend-accounting.md) | Batch plan for the 2026-10-27 audit. | [B7 record](audit/2026-10-27-audit-batch7-paid-spend-accounting.md), DECISIONS D-208 |
| [B13: EDGAR derived operating lines (2026-10-27)](https://github.com/eligorelick/Metis/blob/d4bf240068ff1faa3d57fe84a0359488602dd6d6/docs/internal/superpowers/plans/2026-10-27-audit-fix-14-edgar-derived-lines.md) | Batch plan for the 2026-10-27 audit (file numbered 14). | [B13 record](audit/2026-10-27-audit-batch-b13-edgar-derived-lines.md), DECISIONS D-208 |
| [Post-remediation verification plan (2026-10-27)](https://github.com/eligorelick/Metis/blob/d4bf240068ff1faa3d57fe84a0359488602dd6d6/docs/internal/superpowers/plans/2026-10-27-audit-post-fix-verification.md) | Gates to run after all 2026-10-27 batches merged. | DECISIONS D-208 per-ID reconciliation (every finding fixed and verified, or superseded) |
| [2026-10-27 audit remediation master plan](https://github.com/eligorelick/Metis/blob/d4bf240068ff1faa3d57fe84a0359488602dd6d6/docs/internal/superpowers/plans/2026-10-27-audit-remediation.md) | Sequencing and shared constraints for the batch plans. Its standing contributor rules are now in [CONTRIBUTING](../CONTRIBUTING.md). | DECISIONS D-208, [decisions spec](internal/superpowers/specs/2026-10-27-audit-remediation-decisions.md) |
| [QCOM report 53 remediation plan (2026-10-30)](https://github.com/eligorelick/Metis/blob/d4bf240068ff1faa3d57fe84a0359488602dd6d6/docs/internal/superpowers/plans/2026-10-30-qcom-report-53-audit.md) | Report 53 evidence and convention fixes, with its implementation ledger (merged in PR #79). | [Report 53 record](audit/2026-10-30-qcom-report-53-integrity.md), DECISIONS D-138, [design spec](internal/superpowers/specs/2026-10-30-qcom-report-53-audit-design.md) |
| [Research reliability implementation plan (2026-10-31)](https://github.com/eligorelick/Metis/blob/d4bf240068ff1faa3d57fe84a0359488602dd6d6/docs/internal/superpowers/plans/2026-10-31-research-reliability.md) | Forecast evaluation and visible grade/valuation uncertainty; all tasks ticked. | [Design spec](internal/superpowers/specs/2026-10-31-research-reliability-design.md), [CHANGELOG](../CHANGELOG.md) |
| [EXPE report #1 repair plan (2026-11-06)](https://github.com/eligorelick/Metis/blob/d4bf240068ff1faa3d57fe84a0359488602dd6d6/docs/internal/superpowers/plans/2026-11-06-expe-report-1-repairs.md) | Repairs for EXPE report #1; its last two boxes (merge PR #111, report back) were done when PR #111 merged. | [EXPE record](audit/2026-11-06-expe-report-1.md), DECISIONS D-212 |
| [Optional APIs and public evidence plan (2026-11-06)](https://github.com/eligorelick/Metis/blob/d4bf240068ff1faa3d57fe84a0359488602dd6d6/docs/internal/superpowers/plans/2026-11-06-public-evidence-fallbacks.md) | Making financial-data subscriptions optional with public-evidence fallbacks; all tasks ticked. | DECISIONS D-211 |
| [Evidence-backed report remediation plan (2026-11-07)](https://github.com/eligorelick/Metis/blob/d4bf240068ff1faa3d57fe84a0359488602dd6d6/docs/internal/superpowers/plans/2026-11-07-evidence-backed-report-remediation.md) | Remediation and post-merge follow-up for the evidence-backed report work. | [Remediation record](audit/2026-11-07-evidence-backed-report-remediation.md), [spec](internal/superpowers/specs/2026-11-07-evidence-backed-report-remediation.md) |
| [DHI report audit and repair plan (2026-11-08)](https://github.com/eligorelick/Metis/blob/d4bf240068ff1faa3d57fe84a0359488602dd6d6/docs/internal/superpowers/plans/2026-11-08-dhi-report-audit.md) | Missing DHI grades and related report defects. | [DHI record](audit/2026-11-08-dhi-report-4.md) |

### UI redesign working material (`docs/internal/`)

The redesign is complete: its execution record marks every task done, including the whole-branch review and the
follow-up audit. The layout's preservation contract is enforced by `tests/report.uiParity.test.ts`.

| Document | What it was |
| --- | --- |
| [Research workspace design and implementation plan](https://github.com/eligorelick/Metis/blob/d4bf240068ff1faa3d57fe84a0359488602dd6d6/docs/internal/redesign-plan.md) | The design rationale and guardrails for the interactive prototype. |
| [UI implementation goal for Codex](https://github.com/eligorelick/Metis/blob/d4bf240068ff1faa3d57fe84a0359488602dd6d6/docs/internal/metis-ui-codex-goal.md) | The prompt used to run the production UI integration plan. |
| [UI redesign execution record](https://github.com/eligorelick/Metis/blob/d4bf240068ff1faa3d57fe84a0359488602dd6d6/docs/internal/ui-redesign-execution.md) | Task-by-task record of the integration, its verification and review. |
| [UI redesign preservation ledger](https://github.com/eligorelick/Metis/blob/d4bf240068ff1faa3d57fe84a0359488602dd6d6/docs/internal/ui-redesign-parity.md) | Which stored report semantics each surface preserves, and how the parity test proves it. |
| [Persisted research UI refinement](https://github.com/eligorelick/Metis/blob/d4bf240068ff1faa3d57fe84a0359488602dd6d6/docs/internal/ui-refinement-review.md) | Change and source map of the refinement branch, with its review rulings. |

## Earlier retirements

The executed plans, earlier audit records and handover notes retired by the
[2026-09-06 codebase audit](internal/superpowers/audits/2026-09-06-full-codebase-audit.md) were removed before this
index existed; they remain in the repository's git history.
