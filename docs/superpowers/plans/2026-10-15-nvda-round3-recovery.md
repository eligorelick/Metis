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
- [x] Recompute frozen NVDA inputs, generate a fresh live NVDA report, audit values/disclosures and inspect browser/export surfaces.
- [x] Obtain a fresh branch review, resolve material findings, record validation and remaining limits.
- [x] Resolve PR #20's additional D-72 review findings, verify the combined
  source and obtain fresh required CI on the revised head.
- [x] Commit, push and integrate the original recovery release via GitHub with fresh required CI.
- [x] Release the D-74/D-75 follow-up through PR #24 after its revised-head CI passes.
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
- Final corrected replay at application source `ca533a8` preserves the original
  report and accounting, adds 13 sourced facts (43 total), and validates 85/91
  numeric claims with zero contradictions. Six numeric and 14 qualitative claims
  remain unvalidated. One exact source-bound Rubin wording correction is
  editorially disclosed. Independent review confirmed hashes, source periods,
  qualifications and unchanged valuation/scores/assumptions. Final artifacts are
  under ignored `tmp/nvda-round3-live/corrected-deterministic-replay-editorial`.
  Browser review confirmed desktop/mobile layout and readable print HTML.
- Final application source `ca533a8` passed the entire `npm run verify` gate
  (exit 0): 6,188 product tests, three existing skips, four integration tests,
  typecheck, lint, core coverage, enforced risk-file floors, production build
  and security audit (zero vulnerabilities). Aggregate risk coverage is
  94.73% statements, 87.79% branches, 97.50% functions and 96.94% lines.
  `npm run audit:deltas` also passes. Log: ignored
  `tmp/nvda-final-release-verify.log`. The original release's subsequent remote
  CI closure is recorded below.

## Remaining research and presentation limits

The PR review follow-up (D-72) is implemented and independently rechecked.
Source `47a43dd` passed the complete `npm run verify` gate, exit 0, with 6,256
product tests (three existing skips), four integration tests, dependency shape,
typecheck, lint, both coverage gates, production build and zero-vulnerability
audit. Aggregate risk coverage is 94.77/87.99/97.52/96.99%; audited deltas pass.
The frozen candidate comparison retains 43 filing facts and identical DCF/EPS
and scores. It now labels $1.535B as classified acquisition cash plus $13B
unallocated with overlap unresolved; this replaces the unsupported additive
total without changing the original D-71 artifact. Inputs were already parsed,
so this comparison does not establish new exhibit-ingestion behavior. Fresh
required CI subsequently passed; the requested normal-history run task remains
pending. Log: ignored `tmp/d72-final-release-verify.log`.

PR #20 through PR #23 merged after the required full and Windows checks passed,
closing D-72 and the original recovery release, including the subsequent
test-only Windows timing follow-ups. D-74/D-75's PR #24 corrects deterministic
principal summaries and source-bound table-scale verification while preserving
original analyses and payloads. Its final revised source passed the full local
gate: 6,418 product tests (three existing skips), four integration tests, both
coverage gates, build and zero-vulnerability security audit. PR #24 subsequently
merged after both required full and Windows checks passed. The separate normal-history run checkbox
stays open until both final reports and execution-setting checks are complete.

The original audit's feature requests for a consolidated five-year financial
summary and displayed historical multiple percentile bands remain open; current
reports show annual growth/margin/return measures, quarterly trends and available
history ranks. Peer medians require enough eligible comparable observations.
Risk likelihood labels and scenario weights are judgmental, not calibrated
probabilities. Same-family model review and bounded case truncation are disclosed.
The round-three source-selection replay retains China export/shipment context,
Rubin production status, the customer recast, Taiwan end-customer geography and
customer concentration; final analyst prose still requires an output audit.

D-76 follows the final output audit with an explicit dividend-unit pair repair,
historical internal-EV evidence guards and partial EDGAR coverage wording.
Original analyst contexts remain exact; no paid rerun or stored-input rewrite
is involved. Combined source `eaefea32` passed the full local gate: 6,447 product
tests (three existing skips), four integration tests, both coverage gates, build
and zero-vulnerability security audit. Independent combined-source/export review
cleared the intended corrections. Fresh release CI is pending. The final normal
run audit and execution-setting acceptance remain separate from these checks.
