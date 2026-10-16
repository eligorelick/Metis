# NVDA audit recovery implementation plan

> **For agentic workers:** Execute recovered domain fixes in their existing isolated worktrees, then integrate and verify the complete branch.

**Goal:** Finish the interrupted NVDA audit remediation, preserving unrelated work and requiring fresh evidence before release.

**Architecture:** Recover D-65 valuation, D-66 evidence and D-67 presentation edits independently; integrate with the existing D-68 forensic work. Deterministic financial outputs and source-bound disclosure tables own figures; prose verification remains a bounded provenance and consistency check.

**Tech Stack:** Next.js 16.3.8, TypeScript, Vitest, SQLite.

**Spec:** User-provided final-report findings and `docs/audit/2026-10-15-nvda-report-34-audit.md`.

## Constraints and review focus

- Preserve the main checkout's pre-existing staged/unstaged edits.
- Preserve financial applicability, currency, identity, provenance and production request guards.
- Consensus anchors must respect the actual forecast periods, with deviations disclosed.
- EV multiples and valuation bridges must use the same disclosed cash/debt convention.
- A numeric match cannot validate a different metric, period, entity or sign.
- Missing disclosure extraction remains a visible limitation, never an invented fact.
- Recovered fixtures must reflect intended changes, not conceal unrelated regressions.

## Tasks

- [x] Recover and validate D-65 valuation changes; commit in valuation worktree.
- [x] Recover and validate D-66 verifier and filing facts; commit in evidence worktree.
- [x] Recover and validate D-67 presentation/completeness; commit in presentation worktree.
- [x] Merge into `claude/nvda-audit-integration`, resolving shared surfaces without losing fixes.
- [x] Run the complete `npm run verify` gate and investigate failures.
- [ ] Recompute frozen NVDA inputs, generate a fresh live NVDA report, audit values/disclosures and inspect browser/export surfaces.
- [ ] Obtain a fresh branch review, resolve material findings, record validation and remaining limits.
- [ ] Commit, push and integrate via GitHub with fresh required CI, if release gates pass.
- [x] Validate the preserved transport/checkpoint package and prevent timeout
  recovery from lowering explicitly selected reasoning or speed settings.
- [ ] After release verification, run CRWV and QCOM as separate normal-history
  Metis analyses using GPT-6 Astra, max reasoning and standard speed; confirm
  saved reports and requested/observed execution settings.

## Recovery evidence

- Integration started at `bcdeba7`; 8-K coverage commit `a56c901` is already an ancestor.
- D-65 and D-67 changes survived uncommitted in their original worktrees.
- D-66 commit `8548e62` survived with additional uncommitted filing-disclosure work.
- Main checkout is on `main` with unrelated staged pipeline checkpoint/transport changes; left untouched.
- Baseline `npm run verify` started with output in ignored `tmp/resume-baseline-verify.log`.
- Final combined source at `bb73f2b` passed `npm run verify` (exit 0,
  2026-10-16): 6,137 product tests and four database integration tests;
  three existing product skips. Typecheck, lint, core coverage, enforced
  risk-file coverage floors, production build and the zero-vulnerability
  security audit pass. Core statement/branch/function/line coverage is
  96.31/90.10/98.22/97.55%; aggregate risk coverage is
  94.68/87.64/97.50/96.92%. Log: ignored `tmp/round3-release-verify.log`.
- Independent code review reproduced the repaired currency, executive-evidence,
  transaction-attribution, figure-deduplication and filing-clause boundaries.
  This does not replace the fresh generated-report audit.
- The combined D-70 recovery source (`64cdd6a`, integrated as `3ca810e`)
  passed the complete `npm run verify` gate, exit 0, in its isolated checkout:
  6,157 product tests, three existing skips, four integration tests, coverage
  floors, build and zero-vulnerability audit. Its application/test sources
  match the integration checkout exactly; the isolated build preserved the
  active NVDA server. Log: ignored `tmp/selected-settings-release-verify.log`
  in the valuation recovery checkout.
- Fresh NVDA run `0cf239de-24d5-43c3-9c25-0a030a3bd262` completed as
  report 3 at 2026-10-16T07:46:29.701Z, with bull/bear/judge observed on
  GPT-6.1 Sol, medium reasoning, standard speed. Its original snapshot is
  `6e1f43a73b4d8af967160b3f4ea378b3d6896599179683fa68ef42bf3ae0008d`.
  Independent arithmetic reproduced $217.039943/$365.939972/$120.491218
  scenarios and composite 75.19. Output audit found remaining per-share/fiscal
  period verifier false positives, omitted concentration context and misdated
  subsequent guarantees; these require correction before release. Reuse the
  saved model output in an explicitly labeled deterministic corrected replay,
  retaining the original report and exact original payload binding.

## Remaining research and presentation limits

The original audit's feature requests for a consolidated five-year financial
summary and displayed historical multiple percentile bands remain open; current
reports show annual growth/margin/return measures, quarterly trends and available
history ranks. Peer medians require enough eligible comparable observations.
Risk likelihood labels and scenario weights are judgmental, not calibrated
probabilities. Same-family model review and bounded case truncation are disclosed.
The round-three source-selection replay retains China export/shipment context,
Rubin production status, the customer recast, Taiwan end-customer geography and
customer concentration; final analyst prose still requires an output audit.
