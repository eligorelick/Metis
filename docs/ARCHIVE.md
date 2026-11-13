# Archived documents

Some working documents have been taken out of the working tree because the work they describe is finished. They are
not deleted. Each one is kept, byte for byte, in the repository's history, and the links below open it at the last
commit on `main` that still contained it. A link to a commit never changes or breaks, so these documents stay readable
and citable.

Archived documents are history. They are not current instructions, and their unticked boxes are not open work. The
current rules are in [METHODOLOGY](METHODOLOGY.md), [OPERATIONS](OPERATIONS.md), [CONTRIBUTING](../CONTRIBUTING.md) and
the decision record [DECISIONS](audit/DECISIONS.md); the dated audit records still in [docs/audit/](audit/) say what
each piece of work fixed and what it left open.

To restore a file locally: `git show <commit>:<path>`, with the commit named in its section below.

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
| [Enterprise-value integrity audit plan (2026-10-15)](https://github.com/eligorelick/Metis/blob/d4bf240068ff1faa3d57fe84a0359488602dd6d6/docs/internal/superpowers/plans/2026-10-15-amzn-integrity-audit.md) | AMZN-driven net-debt and lease/debt reconciliation fixes; all tasks ticked. | [AMZN integrity audit](https://github.com/eligorelick/Metis/blob/bda87e4c0b575fdf4af2a4e31a66854c9c42337b/docs/audit/2026-10-15-amzn-integrity.md) |
| [Evidence and reporting follow-up (2026-10-15)](https://github.com/eligorelick/Metis/blob/d4bf240068ff1faa3d57fe84a0359488602dd6d6/docs/internal/superpowers/plans/2026-10-15-evidence-methodology-followup.md) | Follow-up after PR 16 making evidence harder to misread. | [DECISIONS](audit/DECISIONS.md) D-55/D-56, [book-to-code disposition](audit/2026-10-17-book-to-code-disposition.md) |
| [NVDA audit recovery plan (2026-10-15)](https://github.com/eligorelick/Metis/blob/d4bf240068ff1faa3d57fe84a0359488602dd6d6/docs/internal/superpowers/plans/2026-10-15-nvda-round3-recovery.md) | Recovery and release of D-65 to D-68 (PRs #20 and #24). Its one open box, the CRWV/QCOM live runs, is recorded as a separate live gap in the disposition. | [NVDA audit](https://github.com/eligorelick/Metis/blob/bda87e4c0b575fdf4af2a4e31a66854c9c42337b/docs/audit/2026-10-15-nvda-report-34-audit.md), [book-to-code disposition](audit/2026-10-17-book-to-code-disposition.md), [DECISIONS](audit/DECISIONS.md) D-58–D-69 |
| [Production UI integration plan (2026-10-24)](https://github.com/eligorelick/Metis/blob/d4bf240068ff1faa3d57fe84a0359488602dd6d6/docs/internal/superpowers/plans/2026-10-24-production-ui-integration.md) | Bringing the redesigned research workspace (dossier layout) into the app; all tasks ticked. | `tests/report.uiParity.test.ts`, [CHANGELOG](../CHANGELOG.md) |
| [UI refinement plan (2026-10-25)](https://github.com/eligorelick/Metis/blob/d4bf240068ff1faa3d57fe84a0359488602dd6d6/docs/internal/superpowers/plans/2026-10-25-ui-refinement.md) | Readability and report-identity refinements to the workspace; all tasks ticked. | [CHANGELOG](../CHANGELOG.md) |
| [B1: claim verifier periods and windows (2026-10-27)](https://github.com/eligorelick/Metis/blob/d4bf240068ff1faa3d57fe84a0359488602dd6d6/docs/internal/superpowers/plans/2026-10-27-audit-fix-01-claim-verifier-periods.md) | Batch plan for the 2026-10-27 audit. | [B1 record](audit/2026-10-27-audit-fix-01-claim-verifier-periods.md); every finding is reconciled in [DECISIONS](audit/DECISIONS.md) D-208 |
| [B2: claim verifier sign, scale, unit and metric (2026-10-27)](https://github.com/eligorelick/Metis/blob/d4bf240068ff1faa3d57fe84a0359488602dd6d6/docs/internal/superpowers/plans/2026-10-27-audit-fix-02-claim-verifier-numbers.md) | Batch plan for the 2026-10-27 audit. | [B2 record](audit/2026-10-27-audit-fix-02-claim-verifier-numbers.md), DECISIONS D-208 |
| [B3: payload records (2026-10-27)](https://github.com/eligorelick/Metis/blob/d4bf240068ff1faa3d57fe84a0359488602dd6d6/docs/internal/superpowers/plans/2026-10-27-audit-fix-03-payload-records.md) | Batch plan for the 2026-10-27 audit. | [B3 record](audit/2026-10-27-audit-fix-03-payload-records.md), DECISIONS D-208 |
| [B4a/B4b: equity bridge, EV and invested capital (2026-10-27)](https://github.com/eligorelick/Metis/blob/d4bf240068ff1faa3d57fe84a0359488602dd6d6/docs/internal/superpowers/plans/2026-10-27-audit-fix-04-equity-bridge-and-invested-capital.md) | Batch plan for the 2026-10-27 audit, both parts. | [B4a record](audit/2026-10-27-audit-batch-b4-equity-bridge.md), [B4b record](https://github.com/eligorelick/Metis/blob/bda87e4c0b575fdf4af2a4e31a66854c9c42337b/docs/audit/2026-11-02-b4b-equity-bridge.md), DECISIONS D-208 |
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
| [DHI report audit and repair plan (2026-11-08)](https://github.com/eligorelick/Metis/blob/d4bf240068ff1faa3d57fe84a0359488602dd6d6/docs/internal/superpowers/plans/2026-11-08-dhi-report-audit.md) | Missing DHI grades and related report defects. | [DHI record](https://github.com/eligorelick/Metis/blob/bda87e4c0b575fdf4af2a4e31a66854c9c42337b/docs/audit/2026-11-08-dhi-report-4.md) |

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

## Dated audit records (archived 2026-11-12)

Last present in commit
[`bda87e4c0b575fdf4af2a4e31a66854c9c42337b`](https://github.com/eligorelick/Metis/tree/bda87e4c0b575fdf4af2a4e31a66854c9c42337b)
(merge of pull request #153). 30 files from `docs/audit/`: 4,677 lines, 391 KB.

Each record describes finished work whose outcome is written in a live document, usually its own entry in
[DECISIONS](audit/DECISIONS.md); every finding of the 2026-10-27 audit is reconciled in D-208's per-ID table. Where a
record held a residual or limit written nowhere else, that text was first quoted word for word into its decision
entry (D-142, D-144, D-145, D-147, D-148 and D-152).

The other dated records stay in `docs/audit/`: those [METHODOLOGY](METHODOLOGY.md) links to, and those that still hold
open items, deferred work, owner choices or known limits recorded nowhere else.

| Document | What it was | Where the outcome is recorded |
| --- | --- | --- |
| [Financial and evidence integrity audit (2026-10-15)](https://github.com/eligorelick/Metis/blob/bda87e4c0b575fdf4af2a4e31a66854c9c42337b/docs/audit/2026-10-15-amzn-integrity.md) | AMZN-driven net-debt, lease/debt and evidence-integrity fixes, and the limits of that one regenerated report. | [DECISIONS](audit/DECISIONS.md) D-55, [book-to-code disposition](audit/2026-10-17-book-to-code-disposition.md) |
| [NVDA report #34 audit (2026-10-15)](https://github.com/eligorelick/Metis/blob/bda87e4c0b575fdf4af2a4e31a66854c9c42337b/docs/audit/2026-10-15-nvda-report-34-audit.md) | The findings that led to D-57 to D-69; its CRWV/QCOM live-run checklist is recorded as a separate live gap. | [Book-to-code disposition](audit/2026-10-17-book-to-code-disposition.md), DECISIONS D-57–D-69 |
| [EXPE independent-audit remediation (2026-10-17)](https://github.com/eligorelick/Metis/blob/bda87e4c0b575fdf4af2a4e31a66854c9c42337b/docs/audit/2026-10-17-expe-remediation-plan.md) | The working plan and progress notes for the EXPE repairs. | [EXPE issue disposition](audit/2026-10-17-expe-issue-disposition.md) (kept: it holds the open research tasks), DECISIONS D-80–D-82 |
| [Research safeguard implementation plan (2026-10-17)](https://github.com/eligorelick/Metis/blob/bda87e4c0b575fdf4af2a4e31a66854c9c42337b/docs/audit/2026-10-17-safeguard-plan.md) | A seven-step plan; its one open box (a draft pull request, not merged) was done. | [Safeguard verification](audit/2026-10-17-safeguard-verification.md) |
| [SQLite integration failure diagnostics (2026-10-18)](https://github.com/eligorelick/Metis/blob/bda87e4c0b575fdf4af2a4e31a66854c9c42337b/docs/audit/2026-10-18-sqlite-test-diagnostics.md) | Why one Windows CI run failed the database bootstrap test, and the test-only cleanup change. | `tests/helpers/requiredCleanup.ts` and its tests |
| [Independent phase-one review corrections (2026-10-19)](https://github.com/eligorelick/Metis/blob/bda87e4c0b575fdf4af2a4e31a66854c9c42337b/docs/audit/2026-10-19-phase-one-review-corrections.md) | Three review findings fixed: gross-profit scope, immutable disclosure reads, Unicode datelines. | DECISIONS D-91, [CHANGELOG](../CHANGELOG.md) |
| [Audit batch 8a: Retry of a data-only fallback (2026-10-29)](https://github.com/eligorelick/Metis/blob/bda87e4c0b575fdf4af2a4e31a66854c9c42337b/docs/audit/2026-10-29-audit-fix-08a-retry-data-only-fallback.md) | One fix; the rest of batch 8 followed as B8b. | DECISIONS D-132, D-208 per-ID reconciliation |
| [Current-main integration checkpoint (2026-11-01)](https://github.com/eligorelick/Metis/blob/bda87e4c0b575fdf4af2a4e31a66854c9c42337b/docs/audit/2026-11-01-current-main-integration.md) | Bringing earlier QCOM/FIGR work onto current main. | DECISIONS D-140 (including its limits) |
| [P0 review fixes (2026-11-02)](https://github.com/eligorelick/Metis/blob/bda87e4c0b575fdf4af2a4e31a66854c9c42337b/docs/audit/2026-11-02-p0-review-fixes.md) | Review findings M-1, M-2, L-1 to L-4, with the integration corrections. | DECISIONS D-142 (its residuals are now quoted there) |
| [P2 DCF inputs and seasonality (2026-11-02)](https://github.com/eligorelick/Metis/blob/bda87e4c0b575fdf4af2a4e31a66854c9c42337b/docs/audit/2026-11-02-p2-dcf-inputs.md) | Disposition of the P2 DCF-input findings. | DECISIONS D-153, D-208 per-ID reconciliation |
| [P5 primary-source data and freshness (2026-11-02)](https://github.com/eligorelick/Metis/blob/bda87e4c0b575fdf4af2a4e31a66854c9c42337b/docs/audit/2026-11-02-p5-primary-data.md) | Disposition of the P5 data findings, including AI-508's completion. | DECISIONS D-148 (its residual limits are now quoted there), D-208 |
| [P5 low-severity items (2026-11-02)](https://github.com/eligorelick/Metis/blob/bda87e4c0b575fdf4af2a4e31a66854c9c42337b/docs/audit/2026-11-02-p5-primary-data-lows.md) | The low-severity P5 findings. | DECISIONS D-148 (its residuals are now quoted there), D-208 |
| [P6 local security repairs (2026-11-02)](https://github.com/eligorelick/Metis/blob/bda87e4c0b575fdf4af2a4e31a66854c9c42337b/docs/audit/2026-11-02-p6-local-security.md) | Local-security findings. | DECISIONS D-145 (its residual is now quoted there), D-208 |
| [P7 display and history (2026-11-02)](https://github.com/eligorelick/Metis/blob/bda87e4c0b575fdf4af2a4e31a66854c9c42337b/docs/audit/2026-11-02-p7-display.md) | Display and history findings. | DECISIONS D-146, D-208 per-ID reconciliation |
| [P8 documentation and test guards (2026-11-02)](https://github.com/eligorelick/Metis/blob/bda87e4c0b575fdf4af2a4e31a66854c9c42337b/docs/audit/2026-11-02-p8-docs-tests.md) | Documentation and test-guard findings. | DECISIONS D-152 (its residuals are now quoted there), D-208 |
| [P9 methodology decisions (2026-11-02)](https://github.com/eligorelick/Metis/blob/bda87e4c0b575fdf4af2a4e31a66854c9c42337b/docs/audit/2026-11-02-p9-methodology.md) | Methodology findings and their follow-up replay; it records that no owner question remained. | DECISIONS D-150, D-208 per-ID reconciliation |
| [P4 paid-work lifecycle (2026-11-02)](https://github.com/eligorelick/Metis/blob/bda87e4c0b575fdf4af2a4e31a66854c9c42337b/docs/audit/2026-11-02-paid-work-lifecycle.md) | Paid-job lifecycle findings; its residuals (upgrade order, deferred Retry-After parsing) are in OPERATIONS and D-143. | DECISIONS D-143, D-208, [OPERATIONS](OPERATIONS.md) |
| [P3 verifier and trust labels (2026-11-02)](https://github.com/eligorelick/Metis/blob/bda87e4c0b575fdf4af2a4e31a66854c9c42337b/docs/audit/2026-11-02-verifier-and-trust-labels.md) | Verifier identity and trust/completeness label findings. | DECISIONS D-144 (its limits are now quoted there), D-208 |
| [P1 / B4b: equity bridge and invested capital (2026-11-02)](https://github.com/eligorelick/Metis/blob/bda87e4c0b575fdf4af2a4e31a66854c9c42337b/docs/audit/2026-11-02-b4b-equity-bridge.md) | Convertible, equity-method and invested-capital findings, with review corrections. | DECISIONS D-147 (its OD-5 limits are now quoted there; VAL-14's block is recorded there), D-208 |
| [N2 FIGR lender and share-class readiness (2026-11-02)](https://github.com/eligorelick/Metis/blob/bda87e4c0b575fdf4af2a4e31a66854c9c42337b/docs/audit/2026-11-02-n2-figr-readiness.md) | FIGR share classes, lender applicability and the recent-IPO discount rate. | DECISIONS D-149 |
| [N3 SEC-built rows on a filed-total conflict (2026-11-02)](https://github.com/eligorelick/Metis/blob/bda87e4c0b575fdf4af2a4e31a66854c9c42337b/docs/audit/2026-11-02-n3-sec-rows.md) | When a vendor row is replaced by the SEC-built row. | DECISIONS D-151 |
| [N4a FIGR issuer capitalization and aggregate P/E (2026-11-02)](https://github.com/eligorelick/Metis/blob/bda87e4c0b575fdf4af2a4e31a66854c9c42337b/docs/audit/2026-11-02-n4a-figr-cap.md) | Issuer capitalization, aggregate P/E, lender peers and gaps. | DECISIONS D-154 |
| [N4b FIGR filed quarterly series (2026-11-02)](https://github.com/eligorelick/Metis/blob/bda87e4c0b575fdf4af2a4e31a66854c9c42337b/docs/audit/2026-11-02-n4b-figr-qtr.md) | Filed quarterly series, operating cash flow and lender display. | DECISIONS D-155 |
| [R2 FIGR figure fixes (2026-11-02)](https://github.com/eligorelick/Metis/blob/bda87e4c0b575fdf4af2a4e31a66854c9c42337b/docs/audit/2026-11-02-r2-figr-figures.md) | Figure bases and timing. | DECISIONS D-159 |
| [R3 FIGR report readability (2026-11-02)](https://github.com/eligorelick/Metis/blob/bda87e4c0b575fdf4af2a4e31a66854c9c42337b/docs/audit/2026-11-02-r3-figr-readability.md) | Readability findings. | DECISIONS D-161, [CHANGELOG](../CHANGELOG.md) |
| [R6 FIGR governance bridge (2026-11-02)](https://github.com/eligorelick/Metis/blob/bda87e4c0b575fdf4af2a4e31a66854c9c42337b/docs/audit/2026-11-02-r6-figr-governance-bridge.md) | Voting control (B-05), the aggregate P/E denominator (B-09) and insider coverage (B-21). | DECISIONS D-158, [CHANGELOG](../CHANGELOG.md) |
| [R8 FIGR filing evidence selection (2026-11-02)](https://github.com/eligorelick/Metis/blob/bda87e4c0b575fdf4af2a4e31a66854c9c42337b/docs/audit/2026-11-02-r8-figr-evidence-selection.md) | Source context kept within the existing payload caps. | DECISIONS D-165, [CHANGELOG](../CHANGELOG.md) |
| [R9 FIGR deterministic fixes (2026-11-02)](https://github.com/eligorelick/Metis/blob/bda87e4c0b575fdf4af2a4e31a66854c9c42337b/docs/audit/2026-11-02-r9-figr-deterministic-fixes.md) | Source, period and accounting-basis repairs. | DECISIONS D-164, [CHANGELOG](../CHANGELOG.md) |
| [Foreign annual report section recovery (2026-11-04)](https://github.com/eligorelick/Metis/blob/bda87e4c0b575fdf4af2a4e31a66854c9c42337b/docs/audit/2026-11-04-foreign-sections.md) | 20-F/40-F page-reference recovery and its limits. | DECISIONS D-191, [CHANGELOG](../CHANGELOG.md) |
| [D R Horton report audit and repairs (2026-11-08)](https://github.com/eligorelick/Metis/blob/bda87e4c0b575fdf4af2a4e31a66854c9c42337b/docs/audit/2026-11-08-dhi-report-4.md) | Report #4's defects, fixes and the limits of that report. | DECISIONS D-215, [CHANGELOG](../CHANGELOG.md) |

## Earlier retirements

The executed plans, earlier audit records and handover notes retired by the
[2026-09-06 codebase audit](internal/superpowers/audits/2026-09-06-full-codebase-audit.md) were removed before this
index existed; they remain in the repository's git history.
