# Audit 2026-10-27 Remediation: Master Plan

> **For agentic workers:** this plan sequences fourteen batch plans; it does not replace them. For each batch, use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans on that batch's own plan, inside its own worktree (superpowers:using-git-worktrees), and finish with superpowers:finishing-a-development-branch. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every confirmed finding of the 2026-10-27 audit (229 in `tmp/audit-2026-10-27/findings.json`: 1 Critical, 33 High, 96 Medium, 99 Low, of which 3 are plausible rather than confirmed; AI-512 was added on 2026-10-28) and ship the four readability phases, so that Metis's figures, verification statuses and report text are accurate, each fix is proven by a test that failed first and an offline before-and-after replay, and `main` stays green after every merge.

**Architecture:** Fourteen batch plans (B1–B13 and the readability phases R1–R4), each grouped by mechanism and code path. The 24 findings added in audit round 4 are planned inside their batch plans ("Amendment notes (round 4)" and the tasks they added), and AI-512 in B3 Task 8F. Each batch is one branch and one PR, built in its own worktree. Batches whose code is disjoint are built in parallel; every merge is serial, onto the newest `main`, with stamps, D-numbers, the CHANGELOG top entry, the payload golden and the audit-delta groups renumbered at that moment. The owner decisions the batches rest on are recorded once in `docs/superpowers/specs/2026-10-27-audit-remediation-decisions.md`. After the last merge, `docs/superpowers/plans/2026-10-27-audit-post-fix-verification.md` proves the whole result.

**Tech Stack:** Next.js 16.4.2 app (TypeScript), Vitest 4.1.12 (repository configs; probes under `tmp/audit-2026-10-27/probes/vitest.probe.config.ts`), better-sqlite3 + drizzle, GitHub Actions (`full` and `windows-smoke`), Windows 11 development machine shared with other sessions.

**Spec:**
- `docs/superpowers/specs/2026-10-27-audit-remediation-decisions.md` (every owner decision, the conflicts between plans and how they were resolved; section 4.3, the main session's resolutions of 2026-10-28, is binding; section 4.4 lists what is still open);
- `tmp/audit-2026-10-27/REPORT.md` section 7 (batch order, rules, shared-files table) and section 4 (readability review);
- `tmp/audit-2026-10-27/findings.json`, `tmp/audit-2026-10-27/brief/batches.json`;
- the owner's instruction (2026-10-27): "Use your recommendation based on research to make this a professional accurate repository. Ensure to properly plan out all the fixes and test/ verify each fix as beneficial."

**Base:** `main` = `origin/main` = `6542531` at planning time. Current stamps: `REPORT_SPEC_VERSION` 1.44.0 (`src/report/schema.ts:139`), `PAYLOAD_VERSION` 1.48.0 (`src/pipeline/stageC/payload.ts:421`), `PIPELINE_VERSION` stage-c-1.6.9 (`src/pipeline/jobRunner.ts:527`), `STAGE_B_IMPLEMENTATION_VERSION` STAGE_B_2026_10_ACCOUNTING_EVIDENCE_27 (`src/pipeline/runInputSnapshot.ts:30`), `SCORE_BANDS_VERSION` SCORE_BANDS_2026_10_REGULATED_UTILITY (`src/pipeline/stageB/grading.ts:51`). Newest decision: D-116. The next free D-number is D-117.

---

## The batch plans and their state (refreshed 2026-10-28, after the round-4 amendments and the 4.3 resolutions)

Tasks are the plan's `### Task` headings, counted by `coverage.cjs` (lettered tasks such as B3 Task 8A–8F and B6 Task 5A count; B5's struck Task 22 counts as a heading but has no steps). "Reviewed" means an independent plan review with "Review notes" in the plan; "round 4" means the round-4 amendment had its own review. Every plan also has "Integration notes (2026-10-28)" mapping each 4.3 change to its line.

| Batch | Plan file (`docs/superpowers/plans/`) | Branch | Tasks | Findings planned / in batch | Reviewed | Notes |
|---|---|---|---|---|---|---|
| B1 | `2026-10-27-audit-fix-01-claim-verifier-periods.md` | `fix/claim-verifier-periods` | 17 | 12 / 12 | yes | Not edited at integration. Its expected outcome for two NVDA #48 claims is superseded by B3 Task 8E (conflict row 55, decisions spec C-11). |
| B2 | `…-02-claim-verifier-numbers.md` | `fix/claim-verifier-numbers` | 30 | 24 / 24 | yes, and round 4 | Round-4 Tasks 16–19 (AI-503 family, AI-501, AI-504, AI-502); batch tasks are 20–29. AI-502 is classified in the verifier (OD-6), so B2 does not move PAYLOAD_VERSION. 4.3 confirmations and the two known residuals (DECISIONS entry 8, for V7) applied. Edited by the integration (C-2). |
| B3 | `…-03-payload-records.md` | `fix/payload-records` | 25 | 15 / 15 | yes, and round 4 | Holds the only Critical (AI-301). Round-4 Tasks 8A–8D (AI-505, AI-507, AI-511, AI-509). Integration Tasks 8E (`(latest)` rows carry `fiscalPeriod: "FY<yyyy>"`, residual (a)) and 8F (AI-512) have had no independent plan review. AI-101 is a recorded known limitation (no display rule). Moves PIPELINE_VERSION for AI-507. |
| B4 | `…-04-equity-bridge-and-invested-capital.md` | `fix/equity-bridge-and-invested-capital` | 24 | 21 / 21 | yes | OD-4 revised by 4.3: all five debt-like families deducted after tax at the D-98 marginal rate (E-7 re-pins recomputed). Task 11 Step 0 measures undimensioned conversion prices (expected wording W-rare). Cut after B13 merges; reuses B13's `unlessBelow` and B3's `specVersionBefore`. |
| B5 | `…-05-seasonality-calendars-and-dcf-inputs.md` | `fix/seasonality-calendars-and-dcf-inputs` | 32 | 25 / 25 | yes, and round 4 | Round-4 Tasks 18–21 (FIN-501, FIN-502, FIN-512, RPT-502). FIN-506 moved to B6 (Task 22 struck). Task 29 Steps C and D (replay evidence E1–E4 for the four scope extensions, offline threshold backtest) gate its D-next entry. Moves PIPELINE_VERSION for FIN-512's judge-prompt line. |
| B6 | `…-06-financial-routes-currency-and-grading.md` | `fix/financial-routes-currency-and-grading` | 35 | 26 / 26 | yes, and round 4 | Round-4 Tasks 22–24 (FIN-504, FIN-503, FIN-505) and Task 5A (FIN-506, adapted from B5's reviewed task, new cutoff `IMPLIED_RETURN_SHARE_BASIS_SPEC`). Three scope extensions confirmed. Replay harness moved to `tmp/audit-2026-10-27/replay/b6/` (row 50 settled). Altman (2000) re-read before D-next (Task 29). |
| B7 | `…-07-paid-spend-accounting.md` | `fix/paid-spend-accounting` | 25 | 13 / 13 | yes | OD-2 (idle guard's no-usage figure raised to the request maximum) confirmed. |
| B8 | `…-08-job-retry-lifecycle.md` | `fix/job-retry-lifecycle` | 25 | 15 / 15 | yes, and round 4 | Round-4 Task 15 (AI-510, OD-9). Integration Task 16 (OD-10: busy-or-unavailable retry wording; Retry-After a residual) has had no independent plan review. Batch tasks are 17–25. |
| B9 | `…-09-edgar-and-provider-data.md` | `fix/edgar-and-provider-data` | 30 | 21 / 21 | yes, and round 4 | Round-4 Tasks 20–21 (AI-506, AI-508). Task 4 Step 0: offline DATA-104 count, severity kept Medium (see open items). AI-508 does not reuse B13's `oneBasisPair` (decisions spec C-10). |
| B10 | `…-10-report-display-and-history.md` | `fix/report-display-and-history` | 33 | 26 / 26 | yes, and round 4 | Round-4 Tasks 23–25 (RPT-501, RPT-503, RPT-504). OD-2 confirmed; OD-6's Damodaran quote verified against the primary PDF. Edited by the integration (C-1). |
| B11 | `…-11-local-security-and-settings.md` | `fix/local-security-and-settings` | 17 | 8 / 8 | yes | OD-1 and OD-3 variants confirmed. Integration Task 9 (PRIVACY names the existing density cookie; a class test) has had no independent plan review. Batch tasks are 10–17. |
| B12 | `…-12-methodology-and-test-guards.md` | `docs/methodology-and-test-guards` | 23 | 12 / 12 | yes | Runs last. OD-4 (METHODOLOGY header pinned to the stamps) confirmed; TEST-204's live confirmation skipped. |
| B13 | `…-14-edgar-derived-lines.md` | `fix/edgar-derived-lines` | 19 | 11 / 11 | yes (2026-10-28) | C-9 applied to OD-5 (Task 7): a material, unlabelled re-filing withholds the derived quarter; BAC Q4 2024 is now withheld. FIN-510-V1's HD deferred-revenue sub-case is left by design. The OD-6 growth-cell question is open (decisions spec 4.4). |
| R1–R4 | `…-13-readability-r1-r4.md` | `feat/report-legible-classic`, `feat/report-one-marker`, `feat/report-say-it-once`, `feat/report-reader-first` | 40 | no findings assigned (targets T1–T11) | yes | R4's PR states the T8 `[data-summary]` gate change; R4 Task 33 meets B11 Task 9's cookie test. Edited by the integration (C-1). |

Planner summaries (`tmp/audit-2026-10-27/plans/*.summary.json`) were regenerated from their plans on 2026-10-28; the `*.r4.summary.json` files are the round-4 record and are now stale. B1's summary predates the integration but its plan was not edited. B3's summary groups Tasks 11–15 and 16–19 into two entries (18 entries for 25 headings). Where a summary and its plan differ, the plan is the authority.

**Integration-added tasks without an independent plan review.** B3 Tasks 8E and 8F, B8 Task 16, B11 Task 9, B5 Task 29 Steps C and D, B6 Task 5A's four adaptations, B4's after-tax re-pins (Tasks 6, 7, 15, 21) and B13's C-9 rule (Tasks 7–9) were written by the integration step. Each finding task among them has a failing test first. Their writers checked them against HEAD where they could: AI-512's probe and Task 8F's fixture were run, Task 8E's two HEAD values were measured, and B13's new labelled fixtures were not run, so their HEAD value of 20 is worked out by hand. No second reader has gone over them. Task M0 Step 3a asks for that review before the batch builds; failing that, the batch's fresh-diff reviewer must be told to cover these tasks by name.

---

## Global Constraints (every batch)

These are the conventions the owner approved for the earlier fix batch (`tmp/metis-fixes-prompt.md`), the audit's batch rules (REPORT.md section 7), and the repository's recorded traps. Each batch plan restates them; this list is the authority when a plan is silent.

**Method**
- **Failing test first.** Each finding gets a test that fails at the batch's base because of the defect, and a control case that passes before and after. If a finding cannot be made to fail, it may be wrong: skip it, say so in the PR, and do not fix it blind. The audit probes (`tmp/audit-2026-10-27/probes/<ID>.probe.ts`) are seeds: copy their logic into `tests/`, drop every read of `tmp/` and every file write. **Never run the probes**: several rewrite evidence logs under `tmp/audit-2026-10-27/agents/`.
- **Smallest change that fixes the whole class.** No ticker-specific code (no CIK, symbol or company name in `src/`), no unrelated refactoring.
- **One commit per item**, with a clear message; stage files by name. Never `git add -A` or `git add .` (`tmp/`, `brag-output*/`, `docs/independent-audit-2026-10-19/` and the other plan files stay uncommitted). Never force-push, merge without the gate, or rewrite history.
- **Never weaken a check or loosen a test to make it pass.** A stricter verifier that marks more claims unchecked is intended (decisions spec P2). A pin that encoded the defect is re-pinned in the owning task with a comment naming the finding.
- **Hermetic tests.** No live network; no market-data, SEC, AI-provider or paid calls; never a report for a real ticker. Fixtures are synthetic, or trimmed from SEC data and run inputs already saved under `tmp/` (check `docs/DATA-RIGHTS.md`; never commit FMP or other paid-vendor data, run-input snapshots or anything from `tmp/`).
- **No new `getConfig()` read in Stage B** (`tests/jobRunner.test.ts` pins the count).
- **Code comments** cite `docs/METHODOLOGY.md "<heading>"`, D-numbers or finding ids, never retired section numbers.

**Records**
- **CHANGELOG.md**: one entry per batch at the top.
- **METHODOLOGY.md and every other markdown that describes the behaviour** (README, RESEARCH, OPERATIONS, PRIVACY, CLAUDE-USAGE, specs) change in the same commit as the behaviour. Grep `docs/` and `README.md` for the old wording first. README stays within its 270-line cap.
- **Disposition note** in `docs/audit/`, registered in `tests/repository.release.test.ts` (`REQUIRED_RELEASE_FILES` / `ALLOWED_MARKDOWN`); new tracked files are `git add`ed before that test runs, because it partitions `git ls-files`.
- **DECISIONS.md**: entries written as "D-next" (and the audit-delta group's provisional numeric id), renumbered at merge. Copy the decision text from the decisions spec, including the rejected alternatives and sources.
- **Owner-facing items** that a batch could not settle go in the PR description, in plain English.

**Version stamps and stored reports**
- A change in what a figure, prompt or payload means moves its stamp (`REPORT_SPEC_VERSION`, `PAYLOAD_VERSION`, `STAGE_B_IMPLEMENTATION_VERSION`, `PIPELINE_VERSION`, `SCORE_BANDS_VERSION`, and the method stamps a plan names), and `tests/report.versionStamps.test.ts` moves with it. Prompt text moves `PIPELINE_VERSION`; payload data or layout moves `PAYLOAD_VERSION` (decisions spec 2.15).
- A payload change moves the golden (`tests/stageC.payload.passes.test.ts`) with a dated comment that names the finding, and the PR says so.
- Stored reports are never rewritten (D-67). "display-only" fixes change how stored reports show; "needs reinterpretation" fixes get a display-time rule keyed on a **frozen** cutoff constant equal to the batch's `REPORT_SPEC_VERSION` at merge (decisions spec 2.15).
- `npm run audit:deltas -- --write --group <batch group>` only after confirming that every changed output follows from the batch's fixes.

**Proof and gates**
- **Before-and-after proof** by replaying stored run inputs (`tmp/audit-2026-10-27/data/evidence/{43,46,48,49,50}/run_input_snapshot*.json`, the 45-issuer census snapshots, the 51 stored reports under `tmp/audit-2026-10-27/data/reports/`) offline, behind a dead proxy (`HTTPS_PROXY=http://127.0.0.1:9`, `NODE_USE_ENV_PROXY=1`), with no provider or model calls and no database opened. Base = `main` at the batch's merge base; head = the branch. Every changed leaf is attributed to a finding, or the batch stops.
- **`npm run verify`** in a normal environment (without `METIS_DATA_DIR` set), in foreground chunks, one step at a time. Known load flakes (rerun alone before judging): `db.cli` ETIMEDOUT on Windows, `jobScheduler`, `report.recordedSensitivity`, `risk.coverage`, `runtimeArtifactIdentity`, `runtimeReplay`; `dependencyShape` in junctioned worktrees.
- **Fresh reviewer**: a new agent that did not write the batch reviews the whole diff against the cited findings; fix the correctness problems it finds.
- **Never open `*.db`, `*.db-wal` or `*.db-shm`**, and exclude `*.db*` from recursive greps. Never run `costs:reconcile`, `settings:reset` or `db:push` against the live database.

**Machine and session**
- Other sessions share this machine and `tmp/`: each batch keeps its scratch under `tmp/audit-2026-10-27/replay/<batch>/` (or the path its plan names), uses its own preview ports, and checks ports are free first. No batch writes into `tmp/audit-2026-10-27/probes/` (B6's harness, now Task 31, lives in `tmp/audit-2026-10-27/replay/b6/`; conflict row 50).
- Owner rule (memory, "pause without losing work"): start no task that cannot finish before the usage limit unless it can pause losslessly; run large plans (B4, B5, B6, B9) in task-sized chunks; never stop running agents without offering the no-loss options.
- Worktrees: `next dev` from a junctioned worktree needs a temporary `turbopack.root`; tests that read the session-aware quote TTL (B9 DATA-112) must fake the clock.
- Never regenerate `package-lock.json` on Windows (npm prunes optional wasm entries). No batch here adds a dependency; R1 only adds an npm script.
- Write/Edit turn a typed `<` escape into `<`; grep the bytes before committing any file that needs one.

**Next.js (AGENTS.md).** Any task that touches `src/app`, a route handler or `src/proxy.ts` reads the named local guide (`node_modules/next/dist/docs/`) first:

| Batch | Next.js code touched | Guides to read first |
|---|---|---|
| B3, B4, B5, B13 | `src/components/report/ReportView.tsx` (one pure call each) | `01-app/01-getting-started/05-server-and-client-components.md` |
| B6 | `ReportView.tsx` (Task 2), `DossierCover.tsx` (Task 21), the presenter `src/report/researchReview.ts` (Task 22), `peers.ts` runtime imports reaching the page's graph (Tasks 22–23) | `05-server-and-client-components.md`; `01-app/02-guides/server-and-client-boundary.md` |
| B8 | `src/app/company/[symbol]/page.tsx`, `GenerateReport.tsx`, `src/app/api/report/[jobId]/stream/route.ts`, `…/retry/route.ts` | `05-server-and-client-components.md`; `01-app/01-getting-started/15-route-handlers.md`; `01-app/03-api-reference/03-file-conventions/route.md`; `01-app/03-api-reference/04-functions/use-router.md`; `…/04-functions/refresh.md` |
| B9 | `src/app/api/settings/credentials/route.ts` (Task 19) | `15-route-handlers.md`; `01-app/03-api-reference/03-file-conventions/route.md` |
| B10 | print page `src/app/company/[symbol]/report/[reportId]/print/page.tsx`, the saved-route pages | `01-app/03-api-reference/03-file-conventions/page.md`; `01-app/03-api-reference/04-functions/generate-metadata.md`; `05-server-and-client-components.md` |
| B10 round-4 Task 23 (RPT-501) | `src/app/company/[symbol]/page.tsx` | `05-server-and-client-components.md`; `page.md` |
| B11 (Task 9 is docs only and needs no guide) | `src/proxy.ts`, `src/app/api/settings/credentials/route.ts`, the AI-connection route, `src/app/settings/AiConnections.tsx`, `src/app/layout.tsx` (test only) | `01-app/01-getting-started/16-proxy.md`; `01-app/03-api-reference/03-file-conventions/proxy.md`; `15-route-handlers.md`; `route.md`; `01-app/02-guides/environment-variables.md`; `01-app/02-guides/upgrading/version-15.md` (NextRequest `ip` removed) |
| B12 | `tsconfig.json` (Next appends `.next` type globs) | `01-app/03-api-reference/05-config/02-typescript.md` |
| R1–R4 | `page.tsx` (saved and live), `report/[reportId]/page.tsx`, report components; R4's reading cookie | `page.md`; `05-server-and-client-components.md`; `01-app/03-api-reference/04-functions/cookies.md` |

---

## Batch order

REPORT.md section 7 suggests: B1 and B2; B3, B13 and B4; B5 and B6; B7 and B8; B9, B10 and B11; B12 last; the readability phases joining the same queue.

**Confirmed order (2026-10-28, after the amendments):** B3, B1, B2, B13, B4, B5, B6, B7, B8, B9, B10, R1, B11, R2/R3, R4, B12, then the post-fix verification plan. The amendments made two of the old soft links hard: B1 now waits on B3 (AI-512 and Task 8E), and R1 waits on B10 (C-1 and the audit-export golden).

**Why B3 goes first.** B3 holds the only Critical (AI-301: peer market caps published in the wrong currency), and B1, B13 and B4 now build on it:
- B3 edits `payload.ts`, `peers.ts`, `fred.ts`, `evidenceSelection.ts`, `capital.ts`, `dataOnlyReport.ts`, `segmentFacts.ts` (Task 8D), `prompts.ts` (a comment, and one prompt sentence for AI-507) and the stored-report view chain. B1 and B2 edit `claimEvidence.ts`, `consistency.ts`, `provenance.ts`, `passes.ts` and `schema.ts`. The computed overlap (`tmp/audit-2026-10-27/plans/overlaps.md`) finds no B1/B3 code overlap. B2/B3 meet only at `prompts.ts` (row 56) and the stamp lines and payload golden, which are merge-order bookkeeping.
- **B1 now depends on B3.** AI-512 (a stale excerpt title can validate a wrong-period claim under D-63) is fixed by B3 Task 8F, and the Task M0 rule was that B1 must not ship before it is fixed or disclosed. B3 Task 8E also gives the `(latest)` rows the fiscal label that B1's period-less rule reads, so B1's measured cost changes (conflict row 55).
- B13's plan is cut after B3 merges, and B13 and B4 import B3's `specVersionBefore` comparator.

**Default merge queue.** A batch never merges before its hard predecessors. Soft predecessors (in brackets) only mean the later batch rebases over the earlier one's text.

| Slot | Batch | Hard predecessors | Dependency behind the slot |
|---|---|---|---|
| 1 | B3 | — | The Critical. It defines `specVersionBefore`, which B13 and B4 import, and its legacy view `withLegacyPayloadRecordSafety` is the first wrapper in the five-site chain (row 5). It fixes AI-512 before B1 ships, and Task 8E's labels are what B1's rule reads. |
| 2 | B1 | B3 | AI-512 must be fixed first (Task M0 rule). With Task 8E on `main`, B1's expected NVDA #48 outcome changes and B1 writes 8E's fourth test (row 55). |
| 3 | B2 | B1 | Same functions in `claimEvidence.ts` and `consistency.ts` (rows 1–3). B2-OD-3 follows B1-OD-1 (C-2). B2 Task 16 builds on B1's comparison-base grammar and Task 9's `Context.own`. |
| 4 | B13 | B3 | Its plan is cut after B3. It imports `specVersionBefore` and wires its wrapper after B3's. `quarterlyTrendSection` is shared with B3 Task 6 (row 52). |
| 5 | B4 | B13 | B4 Task 8 declares its floor through B13's `unlessBelow` and reads B13's derived-EBIT `amounts`. Its wrapper follows B13's, and its JNJ, XOM and BA baselines are measured on post-B13 `main` (row 10). |
| 6 | B5 | B4 | Same functions (`compute.ts:3309-3391`, `valuation.ts:668-860` and the tax seed at `:2104-2170`, `projections.ts`, `returns.ts`, `scenarioPresentation.ts`; rows 14–20, 57). |
| 7 | B6 | B4, B5 | The excess-return route (`valuation.ts:4672-4800`, B4 Task 11). Task 5A divides by B4's divisor (`compute.ts:3227-3259`) and adds a row with its own cutoff to B5's `legacyValuationNotes.ts` (rows 17, 58). B6 Task 6 builds on B5's current-capital window (row 21). |
| 8 | B7 | — (B2 soft) | Paid-spend Highs on independent code. It rebases over B2's judge-prompt line (row 4). |
| 9 | B8 | B7 | Consumes B7's `isTransientWriterLock` and re-locates edits beside B7's `jobRunner.ts` code (rows 25–28). |
| 10 | B9 | B6, B13 | The dividend-yield row runs after B6's currency guard (row 23). Its `statements.ts`, `filingDisclosures.ts` and quarterly-segment edits follow B13 and B3 (rows 11–13, 52, 59). |
| 11 | B10 | B3 (B6, B9 soft) | RPT-214 counts B3's screen output (row 7). `gapDatasetKey` follows B9 (row 24). It sits beside B6's dossier-cover floor and `researchReview.ts` line (rows 40, 60). |
| 12 | R1 | B10 | R1 Task 7 shrinks to its tests only once B10 Task 16's `RunNotices` contract is on `main` (C-1, row 33), and the audit-export golden is pinned on B10's output. |
| 13 | B11 | B8 (B9, B7 soft) | Keeps B8's `holdProcessLifetimeLock` in `src/ai/store.ts` (row 29). The credentials route and `.env.example` follow B9 and B7 (rows 30–31). |
| 14 | R2, then R3 (either order) | R1 | Built in parallel after R1 and merged one at a time. |
| 15 | R4 | R2, R3 (B11 soft) | R4's reader view sits on R2's markers and R3's notes. R4 Task 33's reading cookie must pass B11 Task 9's cookie test (row 61); its plan carries both the merged and the unmerged form. |
| 16 | B12 | all | Docs and gates pin the final constants, payload budgets and coverage floors (rows 44–47). It keeps B11 Task 9's PRIVACY sentences. |
| then | Post-fix verification (V0–V9) | all sixteen slots | It proves the merged result. V0 is built before slot 1 (Task M0 Step 4). |

**Promotion rule.** If the next batch in the queue is not ready, any finished batch whose hard predecessors have all merged may take the slot. In practice B7, B8 and B11 form an independent track and can merge between the valuation batches, which ships the two paid-spend Highs sooner.

---

## What can be built in parallel

Building in a worktree is cheap; rebasing over another batch's edits to the same function is not. The overlap computation (`node tmp/audit-2026-10-27/plans/overlaps.cjs`, re-run 2026-10-28 over all fourteen plans with lettered task headings read: 1,208 planned edits, 115 overlapping file-and-batch-pair groups, 67 files edited by more than one batch) gives these tracks:

| Track | Batches | Build rule |
|---|---|---|
| Payload | B3 | Independent: build now. It merges first. |
| Verifier | B1 → B2 | B1 can build in parallel with B3 but rebases on B3 before merging (row 55: 8E's fourth test and the NVDA #48 expectations). B2 overlaps B1 in `claimEvidence.ts:40-125` and `:690-715` and in `consistency.ts`: build B2 stacked on B1's branch (cut from B1's head after B1's Task 9), or after B1 merges. |
| Valuation | B13 → B4 → B5 → B6 | Strictly serial in the same functions. Each builds after its predecessor merges, or stacked on the predecessor's finished branch, re-running the predecessor's replay before its own. |
| Spend and jobs | B7 → B8 → B11 | B8 stacks on B7 (`jobRunner.ts`, `jobScheduler.ts`); B11 after B8 (`src/ai/store.ts`). Independent of the valuation track: build in parallel with it. |
| Data | B9 | Disjoint functions from B4–B6 except `presentation.ts:812-819` (B6 Task 3), `statements.ts` (B13) and, through AI-508 (Task 21), the quarterly segment code B3 Task 6/8D and B13 Task 9 also edit (row 59): build in parallel with the valuation track; merge after B6. |
| Display | B10, R1 | B10 can build in parallel with B9; R1 in parallel with B10 (their `RunNotices` contract now matches, C-1), but R1 merges only after B10. |
| Readability | R2 ∥ R3 → R4 | R2 and R3 after R1 merges, in parallel; R4 after both. |
| Docs and gates | B12 | Builds last: its tests pin the final constants, payload budgets and coverage floors. |

Run at most three worktrees at once on this machine (other sessions share it), and size each batch's chunks against the usage limit.

---

## Merge serially: rebase and renumbering

Merge one batch at a time. Before each merge, rebase the batch on the newest `main` and do the following in one commit named "Renumber for merge after <previous batch>":

- [ ] **D-numbers.** Replace every "D-next" (DECISIONS.md headings, CHANGELOG, code comments, disposition note, test comments, the audit-delta group's `decisions` list) with the next free numbers, in the order the entries appear. Start at D-117 for the first batch merged.
- [ ] **Stamps.** Give each stamp the batch moves the next free value after the one on `main`, with its history comment, and update `tests/report.versionStamps.test.ts` and every other pin the plan lists (`tests/jobRunner.test.ts`, `tests/stageC.payload.passes.test.ts`, the audit-delta DEMO leaf `report.meta.specVersion`).
- [ ] **Frozen cutoffs.** Set the batch's cutoff constant (`INSIDER_ROLES_READ_FROM` B2, `PAYLOAD_RECORD_CORRECTION_SPEC` B3, `BRIDGE_METHOD_SINCE_SPEC_VERSION` B4, `ANNUALIZATION_CONVENTION_SPEC` B5, `IMPLIED_RETURN_SHARE_BASIS_SPEC` B6 (Task 5A, in B5's `legacyValuationNotes.ts`), `EDGAR_DERIVED_LINES_SINCE_SPEC_VERSION` B13, and any a later plan adds) to the batch's renumbered `REPORT_SPEC_VERSION`; never touch an earlier batch's cutoff.
- [ ] **CHANGELOG.** Put the batch's entry above the previous batch's; fix the stamp sentence.
- [ ] **Payload golden.** Re-pin `tests/stageC.payload.passes.test.ts` on top of the previous batch's pin, with this batch's dated comment; never delete the earlier comment.
- [ ] **Audit deltas.** Rename the group, renumber its decision id, re-run `npm run audit:deltas` (dry), attribute every leaf that now differs, then `-- --write --group <name>`.
- [ ] **Registries.** Re-append the disposition note to `tests/repository.release.test.ts` and any new module to `RISK_SOURCE_MANIFEST` (`vitest.shared.ts`) and `EXPECTED_RISK_SOURCES` (`tests/risk.coverage.test.ts`), keeping every earlier batch's entries.
- [ ] **Re-run** the batch's own failing-test files, its replay (base = the new `main`), and `npm run verify`; push; wait for CI.

**Provisional stamp sequence** under the default queue, from each plan's stamp list after the round-4 amendments and the integration (planner summaries' `stampsMoved`, checked against the plans). It is illustrative only: values are set at merge.

| Stamp (now) | B3 | B1 | B2 | B13 | B4 | B5 | B6 | B7 | B8 | B9 | B10 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| REPORT_SPEC 1.44.0 | 1.45.0 | 1.46.0 | 1.47.0 | 1.48.0 | 1.49.0 | 1.50.0 | 1.51.0 | — | — | 1.52.0 | 1.53.0 |
| PAYLOAD 1.48.0 | 1.49.0 | — | — | 1.50.0 | 1.51.0 | 1.52.0 | 1.53.0 | — | — | 1.54.0 | — |
| PIPELINE stage-c-1.6.9 | 1.6.10* | 1.6.11 | 1.6.12 | — | — | 1.6.13* | — | 1.6.14 | 1.6.15 | 1.6.16 | 1.6.17 |
| STAGE_B …_27 | _28 | — | — | _29 | _30 | _31 | _32 | — | — | _33 | _34 |
| SCORE_BANDS | — | — | — | — | — | — | moves | — | — | — | — |
| Method stamps | EVENT_SELECTION | — | — | — | FAIR_VALUE, SCENARIO_TARGET | FAIR_VALUE, SCENARIO_PATHS | — | — | — | CURRENT_REPORTS | — |

\* Prompt-text moves (decisions spec 2.15): B3's AI-507 rewords the reconciliation rule (Task 8B) and B5's FIN-512 adds one judge-prompt line (Task 20). B2's AI-502 no longer moves PAYLOAD_VERSION: OD-6 classifies percentage-point records in the verifier, with no payload field. B6 moves no PIPELINE_VERSION. Several plans write `stage-c-1.6.10` or `1.45.0` as their own next value; the renumber step at merge replaces them. R1–R4, B11 and B12 move no stamp. B7 does not move REPORT_SPEC_VERSION although the audit's batch table listed it (confirmed by its plan; no effect on others).

---

## Where the planning documents are committed

None of the seventeen planning documents is tracked at `6542531`: the fourteen batch plans, this master plan, `docs/superpowers/plans/2026-10-27-audit-post-fix-verification.md` and `docs/superpowers/specs/2026-10-27-audit-remediation-decisions.md`. They are committed with the work they describe, staged by name, never with `git add -A`.

| PR | Commits |
|---|---|
| B3 (slot 1, the first to merge) | its plan `2026-10-27-audit-fix-03-payload-records.md`, **and** this master plan, the decisions spec and the post-fix verification plan |
| B1, B2, B13, B4, B5, B6, B7, B8, B9, B10, B11, B12 | each its own plan file only (B13's is `…-fix-14-edgar-derived-lines.md`) |
| R1 (the first readability PR) | the readability plan `…-fix-13-readability-r1-r4.md`; R2, R3 and R4 commit it again only if they change it |
| Any later PR that changes a committed planning document (a ticked box, a corrected row) | that change, in the PR whose work caused it |

Each committed document is a tracked markdown file, so `tests/repository.release.test.ts` must accept it in the same commit:
- add its path to `ALLOWED_MARKDOWN` beside the existing `docs/superpowers/plans/…` entries (`:117-124`) or the spec entries (`:58-61`); `forbiddenReleaseFiles` rejects any tracked `docs/` markdown not listed there;
- it must pass `unsafePublicDocument` (no absolute home path, no credential-shaped value) and `tests/docs.lint.test.ts`'s link check (every relative markdown link outside code resolves from the file).

Checked on 2026-10-28 over all seventeen documents (the two patterns of `unsafePublicDocument` and the link-check regex of `docs.lint`, run read-only). Three need a one-line rewording when their batch commits them, in that batch's own commit:
- **B6 plan, Task 29** (`See the [disposition record](2026-10-27-audit-b6-financial-routes.md).`): the link is DECISIONS text meant for `docs/audit/` and does not resolve from the plan's folder. Put the quoted entry text in a code span. While the plan sits untracked in a working tree, `docs.lint` (which walks `docs/` on disk) also fails there, so run `npm run verify` only in the batch worktrees, which do not hold the untracked plans.
- **B8 plan, Task 21** (the registration step's "no personal paths" reminder): it writes out a Windows home-folder prefix as its example, which matches the home-path pattern. Reword it as "never an absolute home path".
- **B11 plan, Task 2** (the test snippet that seeds `providerCredentials`): the saved Anthropic key's twelve-character stand-in value matches the credential-value pattern (twelve or more characters after an `API_KEY` name and a colon). Use a value the pattern exempts, such as one beginning with "example", in the plan and in the test it describes.

This master plan and the decisions spec pass all three checks as written.

---

## Cross-batch conflict table

Same file and same function or lines changed by two plans (computed by `tmp/audit-2026-10-27/plans/overlaps.cjs` from the plans' "Modify" lines at HEAD line numbers, then read), plus the semantic dependencies the plans name. "First" follows the default queue. Line numbers are HEAD's: the second batch re-locates edits by the quoted code, never by number.

| # | File : region (HEAD) | First (task) | Second (task) | What the second must re-check |
|---|---|---|---|---|
| 1 | `src/pipeline/stageC/claimEvidence.ts:40-125` (quantity regex, context) and `:690-715` (`periodAgrees`, hedges) | B1 T1, T2, T6–T8 | B2 T2, T6, T7, T9, T16 | Re-run B2's Task 0 replay (and its Step 2a for the round-4 claims); own-description binding (T9) composes with B1's forward-looking and comparison-base rules; B2's round-4 Task 16 (AI-503 family: `Context.base` beside B1's `Context.bases`) rides on B1's comparison-cue grammar. |
| 2 | `src/pipeline/stageC/consistency.ts` (`DELTA_BREAKERS` `:576`, period block `:692-699`, `isDeltaRecord` `:646-677`) | B1 T6, T9 | B2 T4, T6, T16, T17, T19 (AI-503 family, AI-501, AI-502) | The base-period check (B1 C-2) and the delta/level reading (B2 OD-6) on the same record; rerun B1's period tests. B2 T19's pin test over every percentage-point record must still pass on B1's rows. |
| 3 | `src/pipeline/stageC/passes.ts` verify loop (`:2602-2652`, `:2984`, `:3027-3043`) | B1 T8 | B2 T10, T11 | Rerun B1's new currentReports TracedNumber test; `cellPeriodCheck` uses B1's established set (C-2). |
| 4 | `src/pipeline/stageC/passes.ts` judge path (`:2058-2105` entity conflicts; `:2395-2420` mirror) and `prompts.ts:513-516` | B2 T13 | B7 T10 | Neighbouring functions: rerun `tests/stageC.judgeProtocol.test.ts` (both batches add cases there); B7's skipped mirror keeps B2's entity framing. |
| 5 | Stored-report view chain: `ReportView.tsx:183`, `export/markdown.ts:950`, `export/printHtml.ts:764`, `export/auditMarkdown.ts:461`, `legacyEntitySafety.ts:71` | B3 T10 | B13 T10, B4 T15, B5 T17, B10 T19 (in queue order) | Each wrapper composes after the previous one in all five chains; one spec-version comparator (B3's `specVersionBefore`; B13 and B4 now import it, and B4 Task 15 stops if it is missing); one test renders a legacy report that triggers every wrapper and asserts each correction prints once per surface (B4 Task 15 has the B3 + B13 + B4 composition test). B3 T10 gains rules 7 and 8 (AI-509 provider geography, AI-511 label) and AI-101's known-limitation sentence (Step I1), but no rule for AI-101. |
| 6 | `src/pipeline/peers.ts` (`peerDiscoveryScreen`, `listingCurrencies` `:20-60`; methodology sentence `:266`) | B3 T1 | B6 T18, T19, T22 (FIN-504, `:45-52`), T23 (FIN-503, `:237-255`) | Peer P/B and route wording on top of B3's screen; minor-unit codes (B6 T1) are not "equal currencies" in B3's screen (add a GBp/GBP peer control). T22's comparison-time size screen and T23's D-98 peer test read B3's established-currency rows. |
| 7 | `peers.ts` exclusions → peer-coverage sentence | B3 T1, T2 | B10 T18 (RPT-214) | Recount: B3 adds "size not compared" and "(currency unknown)" states; the sentence must still add up to the candidate count. |
| 8 | `src/pipeline/stageC/payload.ts:1134-1163` (peer notes, reverse-DCF context note) | B3 T2 | B5 T4; B6 T22 (`:1159`) | B5's new context row sits outside B3's untrusted envelope. B6 T22's withheld-reason note on the peer comparison stays in the computed section, not in B3's envelope. |
| 9 | `src/providers/fred.ts` labels; `dataOnlyReport.ts:702-740` | B3 T7 (units, labels), T10 rule 5 | B10 T9 (one row per series) | B10's transform-matched label uses B3's units; B3's legacy FRED-sentence rule must not fire on reports at or after B3's cutoff. |
| 10 | `src/edgar/statements.ts` derived EBIT (`:711-737`, `:1615-1703`), `tagSynonyms.ts` | B13 T1–T5 | B4 T8, T21 | B4's `equityMethodIncomePlacement` reads derivation provenance that B13 changes (`OtherNonoperatingIncomeExpense` now subtracted, interest part optional, pretax may be the domestic + foreign composition): re-derive its arithmetic test on B13's rows; KO/T/CMCSA/DUK/NEE must still replay unchanged. Settled in B4's plan (Integration notes 8–11): the floor is declared on the `longTermInvestments` synonym entry through B13's `unlessBelow` (`SYNONYM_FLOOR_TOLERANCE = { relative: 0.005, absolute: 2_000_000 }`), the placement reads B13's `discloseAdjusted` `amounts`, a rebase-check test covers a B13-shaped derived EBIT, and Task 21 rebuilds census rows with each side's builder; JNJ, XOM and BA are re-measured on post-B13 `main`. Overlap computed at `statements.ts:1675-1700` (B13 T4, B4 T8). |
| 11 | `statements.ts`, `financialEnrichment.ts` (quarter derivation, presentation currency, temporary equity) | B13 T7, T8 | B9 T2, T4 | DATA-104's presentation-currency choice runs on B13's one-presentation pairing. B9's AI-508 (Task 21) does **not** reuse B13's `presentationMixed` / `oneBasisPair` (B9 OD-11; decisions spec C-10): it compares the windows each segment filing states or implies, and shares B13's 1% threshold, the 2,000,000 rounding allowance and B13's outcomes. B13's cross-batch line asking for reuse with the `labelled` argument is superseded. |
| 12 | `src/pipeline/filingDisclosures.ts` (quarterly trend, guided quarter end, dates) | B13 T9 | B5 T3, then B9 T1 | One file, three regions; rerun each predecessor's tests. |
| 13 | `src/edgar/incomeClassification.ts` / `INCOME_DEF(bankRevenue)` | B13 T2 (`bankInterestIncome`) | B9 T3 (DATA-103) | B9's classification rebuild now also routes bank interest income through B13's chain: add a bank interest-income assertion. |
| 14 | `src/pipeline/compute.ts:3309-3391` (bridge row, EBIT seed, quarter lengths) | B4 T1, T3, T8 | B5 T1, T3, T7, T12 | Re-measure B5's replay (Task 29; Task 24 before round 4 renumbered it): coverage EBIT includes B4's equity-method removal; quarter lengths read B4's bridge row. |
| 15 | `compute.ts:2505-2591` (loss-period divisor) | B4 T9, T10 | B5 T1, T12 | Divisor and stub handling on the same rows. |
| 16 | `src/pipeline/stageB/valuation.ts:668-860`, `:2203-2235` (year one, DCF assumptions, valuation-date basis) | B4 T1, T2, T4, T8 | B5 T1, T2, T3, T7 (and T19, row 57) | B5's year-one level and one-off removal on top of B4's lease basis and EBIT seed. |
| 17 | `valuation.ts:4672-4800` (excess-return route) | B4 T11 (one convertible reading) | B6 T4, T5, T5A (FIN-506, moved from B5) | Keep `oneReading` on the start/CoE grid and in the reverse solve; T5A divides the price by T5's roll factor and inverts it per diluted share on B4's divisor (row 58). |
| 18 | `valuation.ts:5918-6043` (financial route, REIT block) | B4 T12 | B6 T2 | Currency branches of the financial route around B4's REIT market cap. |
| 19 | `src/pipeline/stageB/projections.ts:154-180`, `:679-740` | B4 T10, T11 | B5 T1, T14 | Forecast EPS dilution and converted interest beside the new history labels. |
| 20 | `src/pipeline/stageB/returns.ts` WACC debt leg | B4 T4 (`operatingLeaseOutOfDebt`) | B5 T8 (FIN-116) | The latest balance is lease-excluded under CODE-1: a lease-only issuer has no debt leg and must not be worded "repaid" (add a control). |
| 21 | `compute.ts:2210-2225` (current-capital window) | B5 T5 | B6 T6 | TTM capital basis on B5's filed-start window. |
| 22 | `payload.ts:1032-1059` | B5 T4 | B6 T4 | Adjacent rows; re-pin the golden once per batch. |
| 23 | `src/report/presentation.ts:812-819` (Key data dividend yield) | B6 T3 (currency) | B9 T9 (frequency) | B6's currency guard runs before RPT-201's frequency rule. |
| 24 | `src/report/completeness.ts:129-212` (`gapDatasetKey`) | B9 T2 | B10 T1 | Re-apply B10's issuer-aware keys on B9's temporary-equity grouping; both key by dataset. |
| 25 | `src/pipeline/jobScheduler.ts` `isTransientWriterLock` | B7 T5 (defines it) | B8 T5 | Consume B7's export; do not define a second one (C-3). Keep B8's tolerance tests. |
| 26 | `src/pipeline/jobRunner.ts:1259-1424` (paid renewal, AI-308 write) | B7 T5 | B8 T5 | Re-locate B8's renewal edits next to B7's AI-308 code. |
| 27 | `jobRunner.ts:3573-3633` (assembly catch, judge terminal wording) | B7 T11 | B8 T7 | Keep B7's repeat-stop rule; B8 owns the wording. B8's AI-110 sterile fallback is now reached after two judge attempts. |
| 28 | `jobRunner.ts:3711-3798` (partial-resume branch) | B7 T12 (step-cost totals) | B8 T2 (lift into a shared closure) | The lifted closure carries B7's step-cost totals; every existing repair/retry test passes unedited. |
| 29 | `src/ai/store.ts:71-186`, `src/ai/chatgpt.ts` | B8 T9 (lifetime lock) | B11 T2, T8 | Keep `holdProcessLifetimeLock`; re-run B11 Task 8's warm-up case. |
| 30 | `src/app/api/settings/credentials/route.ts` | B9 T19 (`:24`, `:51-55`) | B11 T2, T6 (`:13-18`, `:29-33`, `:59-61`) | Rerun the settings route tests. |
| 31 | `.env.example`, `README.md` (`:148-154`) | B1 T6, B7 T7/T9/T10 | B11 T5 | Re-run `npm run docs:config`; README stays at 270 lines. |
| 32 | `src/app/company/[symbol]/page.tsx:939-950`, `:1080-1091` | B8 T11, T13 | B10 T16, then R1 T7, R4 T35 | Saved-view controls, the `headerNotices` prop and the Reader view on the same lines. |
| 33 | `ReportView.tsx:240-241`, `ReportSnapshotHeader.tsx:43-44`, `PersistedReportView.tsx:7-10`, `report/[reportId]/page.tsx:91` | B10 T16 | R1 T7 | Same contract after C-1: R1 Task 7 shrinks to its tests; one D-entry for D-111 F-1. |
| 34 | `ReportView.tsx:199-248` | B6 T2 | R1 T6, R4 T34 | Grade strip and summary-first block around B6's P/TBV pass-through. |
| 35 | `src/components/report/sections.tsx:426-427` (scorecard) | B6 T17 | R1 T4, R3 T26, R4 T35 | Restyle keeps B6's Altman driver wording. |
| 36 | `sections.tsx:1046-1064` (valuation labels, method notes) | B10 T17 (method-aware labels) | R3 T24 | R3's plain-word notes keep "Excess-return · model value / share" for excess-return reports. |
| 37 | `sections.tsx:2112-2179` (meta strip) | B10 T2 | R4 T35 | Reader collapse keeps B10's data-state colour rule. |
| 38 | `src/components/report/DossierCover.tsx:14-29` | B6 T21 | B10 T11, R3 T27, R4 T34 | Cover floor (B6), reader-precision scores (B10), degraded-inputs qualifier and summary (R). |
| 39 | `export/markdown.ts:528-544`, `:843-849`; `export/printHtml.ts:483-496` | B10 T9, T17 | R2 T19, R3 T24 | Footnotes and plain-word notes on B10's macro rows and method headings. |
| 40 | `presentation.ts:1204-1309`, `:1774-1823` (and `:1121-1133`, `:1419-1430`) | B10 T10, T24, T25; B6 T21 | R2 T15; R3 T24, T25, T26 | Token-returning prose and once-per-surface rules on B10's score rounding, Model line (RPT-503) and data-only coverage helper (RPT-504), and B6's driver table. |
| 41 | `src/report/filingDisclosurePresentation.ts:113-162`, `:251-283` | B3 T6; B13 T9; B9 T9, T21 | R3 T25 | Segment tables and the re-presentation note stay single. B9 T21 adds the presentation-change and "derived across two filings" notes beside B13's re-presentation note: one note per table. |
| 42 | `src/pipeline/stageC/dataOnlyReport.ts:445-458` | B3 T5 | R3 T24 | Capex/D&A label. |
| 43 | Degraded-inputs note (`fairValue.reasons`) | B5 T16 (members) | R3 T27 (placements) | R3 tests on post-B5 members; its qualifier names none (C-5). |
| 44 | `scripts/check-report-reading.mjs:1-49` | R1 T2, R2 T18 | B12 T5 | B12's TEST-204 fix applies to R's committed reading instruments. |
| 45 | `docs/METHODOLOGY.md:444-481` (window one, guidance) | B5 | B12 T10 | Re-derive DOC-301's worked example from the post-B5 test (`tests/stageB.dcfAnchoring.test.ts:288-315`); if B5 removed the sentence, Task 10 reduces to the example. |
| 46 | `METHODOLOGY.md` header `:6-27` | B6 T12 | B12 T8 | B12 pins the header to the final constants. |
| 47 | `tests/risk.coverage.test.ts`, `vitest.shared.ts` | B3 T10; new modules from B4 (`seniorClaims.ts`, `legacyBridgeMethod.ts` after B13's file), B5 (`fiscalCalendar.ts`), B10 (`legacyPlaceholderSafety.ts`), B13 (`presentationLineage.ts`), R T5/T13/T24/T33 | B12 T3, T4 | B12's per-file floor is measured at its rebased head; any module below it gets tests in B12, never a lower floor; every R `.tsx` is placed by name. |
| 48 | `tests/repository.release.test.ts:55-124` | every batch (disposition notes; the plan files and planning documents, see "Where the planning documents are committed") | next batch | Append; keep every earlier entry. |
| 49 | `tests/stageC.payload.passes.test.ts` golden | B3 (Tasks 1–4, 8C, 8D, 8E `provenanceHash` only, 9) | B2 (prompt bytes), B13, B4, B5, B6, B9; B1 and B10 move only the spec pin at `:2738` | Re-pin on top with a dated, finding-cited comment; keep each earlier batch's exact restorations. B2 Task 19 must not move `provenanceHash` (OD-6 adds no payload field). |
| 50 | `tmp/audit-2026-10-27/probes/B6-replay.probe.ts` | — | B6 T31 | **Settled in B6's plan:** the harness is `tmp/audit-2026-10-27/replay/b6/b6.replay.ts` with its own `vitest.replay.config.ts`, behind the dead proxy, so the post-fix probe run (V2) cannot execute it. |
| 51 | `src/edgar/currentReports.ts` comparison cues | B1 C-1 (verifier grammar) | B9 (known issue B1-3) | Do not "align" the two grammars in either batch; B9 fixes "over" in the release parser only. |
| 52 | `payload.ts` `quarterlyTrendSection` (`:2383-2428` segment rows, `:2436-2447` consolidated loop and notes; `:2450-2482` segment half) | B3 T6 | B13 T9, then B9 T21 (AI-508) | Same function, adjacent halves: rebase B13 on B3 and rerun both tests; B9 T21 then withholds cross-presentation segment cells on top of both and reruns B3's and B13's tests. |
| 53 | The DCF's TTM operating-income seed (`compute.ts:1157-1290` `ttmIncome`) and D-98 one-off removal | B13 T5 (subtracts `OtherNonoperatingIncomeExpense`) | B5 T1, T7 (FIN-402) | A D-98-tagged charge filed inside the "other" line (JNJ's `AssetImpairmentCharges`) is already out of B13's derived EBIT: B5 must not remove it a second time. Add a derived-EBIT row to B5 Task 7's tests. B5 keeps the contiguity gate and the `revenueCount < 4` suppression B13 relies on for a withheld Q4. |
| 54 | `compute.ts:1241-1255` (TTM operating income null when fewer than four quarters carry it) | B13 T7 (relies on it) | B6 T6 (FIN-112) | B6's TTM snapshot withholding must keep the null for a withheld derived Q4. After C-9 more Q4s are withheld (BAC Q4 2024), so B6's census rows for BAC read the annual fallback. |

**Rows added at the integration refresh (2026-10-28).** Rows 55–64 come from the round-4 amendments and the 4.3 resolutions: `overlaps.cjs` re-run over all fourteen plans (B13 included and lettered task headings read), then each new pair read. Renumbered batch tasks (B2 20–29, B8 17–25, B11 10–17) only relabel the stamp, golden and release-test overlaps already covered by rows 48–49 and the merge checklist, so they get no row.

| # | File : region (HEAD) | First (task) | Second (task) | What the second must re-check |
|---|---|---|---|---|
| 55 | Semantic: B1 OD-1's period-less rule reads `fiscalPeriod` on `(latest)` computed rows | B3 T8E (labels `FY<yyyy>` on the latest margin, ROIC, DuPont ROE, FCF, FCF conversion, capex and D-68 accrual-year rows) | B1 T3 (Step 5), T13, OD-1 "measured cost" | With 8E on `main`, NVDA #48's "ROIC for the latest fiscal year" and "accrual ratio for the same year" stay **validated**, not unverified as B1's plan expects; "ROIC for FY2025 was 149.8%." still moves. The B1 executor re-states B1's measured cost in its CHANGELOG, DECISIONS entry and PR, and writes 8E's fourth, post-B1 test (it only proves anything once B1's rule is in). Decisions spec C-11. |
| 56 | `src/pipeline/stageC/prompts.ts:331-336`, `:500` (reconciliation bullet in the analyst and judge framings) and `:513-516` (judge entity instruction) | B3 T8B (AI-507; PIPELINE_VERSION) | B2 T13, then B7 T10 (row 4) | Neighbouring prompt lines: each batch re-pins `promptBytes` once on top of the previous pin and takes the next PIPELINE_VERSION at merge (B3 and B2 both plan `stage-c-1.6.10`). |
| 57 | `valuation.ts:2104-2170` (year-one tax seed beside the DCF lease basis); `src/report/scenarioPresentation.ts:155-201` | B4 T4 (`:2120-2170`); B4 T2 (redeemable labels `:195`), T6 (`name()` keeps "after tax") | B5 T19 (FIN-502 tax seed `:2104-2112`); B5 T21 (RPT-502 target line `:197-201`) | B5's re-read tax rate sits beside B4's lease basis: rerun B4's lease-basis tests. B5's new scenario-target line keeps B4's "after tax" and redeemable labels. |
| 58 | `compute.ts:3227-3259` (divisor, loss-period divisor); `src/report/legacyValuationNotes.ts` | B4 T1, T9; B5 T17 (creates the module, per-row cutoffs, no module-wide early return) | B6 T5A (FIN-506: `price / roll.factor`, `impliedReturnShareBasis` row) | T5A's reverse solve uses B4's divisor. Its stored-report row keys on its own frozen cutoff `IMPLIED_RETURN_SHARE_BASIS_SPEC`, and a report built between B5's and B6's merges still gets the note (T5A's test). |
| 59 | `src/edgar/segmentFacts.ts:264-406`; `payload.ts:2383-2468`; `filingDisclosurePresentation.ts:252-283`; `src/report/schema.ts:2251-2304` | B3 T6, T8D (`:298-309`); B13 T9 (schema `:2282-2304`) | B9 T21 (AI-508) | B9's presentation-change detection runs on B3's segment rows and B3 T8D's geography predicate (`providerGeographyContradiction` lives in `segmentFacts.ts`), and its schema fields sit beside B13's. Does not reuse B13's `oneBasisPair` (row 11, C-10). |
| 60 | `src/report/researchReview.ts:41-69`, `:113`; `presentation.ts:1774-1794` | B6 T22 (FIN-504: audit line `:69`, classic cell `:113`); B6 T21 (cover floor `:1774-1783`) | B10 T18 (RPT-214 peer-coverage sentence `:41-60`); B10 T24 (RPT-503 Model line `:1786-1794`) | Adjacent edits in one presenter and one module: rerun B6's withheld-Company-figure and cover-floor tests after B10's edits. A withheld Company figure (`currentWithheldReason`) is not an exclusion, so RPT-214's sentence must not count it. |
| 61 | `docs/PRIVACY.md` (local data, deleting local data), `tests/docs.lint.test.ts` (cookie class test), `src/appearance/` | B11 T9 (names `metis-ui-density-v1`; every `UI_*_COOKIE` must be named in both places) | R4 T33 (`UI_READING_COOKIE`, `metis-ui-reading-v1`); B12 T11 | R4 exports its cookie in the form B11's test reads and adds its PRIVACY sentences; B12 keeps B11's sentences. If R4 builds before B11 merges, it uses the unmerged form its plan gives. |
| 62 | `src/report/export/auditMarkdown.ts:126-183` | B2 T12 (verification-log line `:160-183`); B7 T13 (fourth column "Note" `:126-133`) | B10 T25 (RPT-504 evidence-class table `:137-146`) | Adjacent blocks of one export: rerun the audit-export golden after each. |
| 63 | `src/components/report/ReportTrustSummary.tsx:8-23`; `sections.tsx:2127-2128` | B10 T25 (`displayedProvenanceCoverage`) | R3 T26, R4 T35 | R3's and R4's restyles read coverage only through B10's helper, so a data-only report shows no traced or cited share on any surface. |
| 64 | `payload.ts:960-986` ("Current capital (computed)") | B3 T8C (AI-511: "the graded ratio" removed, graded-window note) | B5 T5 ("exact window" only when the start is filed) | Same section: B5 rewords the window text beside B3's note; keep B3's ids and the D-62 alias group. |
| 65 | `payload.ts` (B3 Task 8F's release-label helpers) | B3 T8F (AI-512: withhold a release fiscal label the run's own statement rows contradict; wider contradiction test, decisions spec 4.6) | B9 T21A/T21B (AI-512-V1: the same rule on guidance, "issued with" and track-record rows; moves 8F's helpers) | B9 imports and moves B3's predicate without changing its behaviour. B3's Task 8F tests must still pass after B9 merges. |

---

## Round-4 additions: where each landed (done 2026-10-28)

The batch planners worked from the 193 findings that existed when planning began. Round 4 added 35: B13's eleven have their own plan, and the other 24 are now planned inside their batch plans, each with a failing test from its probe, a control, its decisions researched and an independent round-4 review ("Amendment notes (round 4)" and "Review notes (round 4)" in each plan). The integration added AI-512 to B3. The six owner questions of the old decisions spec 4.1 are decided: see decisions spec section 2 (entries named below) and 4.1.

| Batch | Findings (severity; * owner decision) | Tasks | Decision |
|---|---|---|---|
| B2 | **AI-503 (H)**, **AI-503-V1 (H)**, AI-503-V2 (M), AI-501 (M), AI-502* (M), AI-504 (L) | 16 (AI-503 family), 17 (AI-501), 18 (AI-504), 19 (AI-502) | B2-OD-6 (AI-502: a percentage-point record is a signed change only when it measures a change over time; verifier-side, no payload field). The others are house conventions (B2 DECISIONS entry 6). |
| B3 | AI-505 (M), AI-511 (M), AI-507 (L), AI-509* (L); AI-512 (M, integration) | 8A, 8C, 8B, 8D; 8F (and 8E for residual (a)) | B3-OD-5 (AI-509, the plan's OD-4); B3 calls for AI-505, AI-507, AI-511, AI-512 and residual (a). |
| B5 | FIN-501* (M), FIN-502* (M), FIN-512 (L), RPT-502 (L) | 18, 19, 20, 21 | B5-OD-11 (FIN-501), B5-OD-12 (FIN-502); FIN-512 and RPT-502 need none. |
| B6 | FIN-503* (M), FIN-504 (M), FIN-505* (L), FIN-506 (L, moved from B5 by 4.3) | 23, 22, 24, 5A | B6-OD-13 (FIN-503), B6-OD-14 (FIN-505), B6-OD-15 (FIN-504 sub-choice); FIN-506 needs none. |
| B8 | AI-510 (M) | 15 | B8-OD-9. |
| B9 | AI-506 (M), AI-508 (M) | 20, 21 | B9-OD-10, B9-OD-11 (no reuse of B13's helpers: C-10). |
| B10 | RPT-501 (M), RPT-503 (L), RPT-504 (L) | 23, 24, 25 | B10-OD-9, OD-10, OD-11. |

---

## Per-batch exit gate

A batch merges only when every box is ticked. Record the evidence (command and output) in the PR.

- [ ] **Every finding task:** its test failed at the base for the stated reason (Step 2 output recorded), and passes now; its control passed before and after. Any finding skipped is named in the PR with the reason.
- [ ] **Benefit shown:** each task's "benefit check" ran (the probe-shaped case, the stored-report or replay value before and after).
- [ ] **Replay proof table** in the PR: issuer or report, figure, before, after, finding. Base = the batch's merge base on `main`; head = the branch tip after the renumber commit. Every changed leaf is attributed; none unexplained. The V0 census harness (post-fix verification plan) covers the 45 issuers; the batch's own harness covers its surfaces.
- [ ] **Stamps, cutoffs, golden and deltas** moved exactly as planned and renumbered (merge checklist above); `npm run audit:deltas` dry run clean after the write.
- [ ] **Records:** CHANGELOG entry; METHODOLOGY and every other affected markdown updated in the same commits; disposition note in `docs/audit/` registered in `tests/repository.release.test.ts`; DECISIONS entries renumbered, with the decisions spec's text and sources.
- [ ] **`npm run verify`** green in foreground chunks, without `METIS_DATA_DIR` set; flakes rerun alone and noted.
- [ ] **Fresh review** of the whole diff by an agent that did not write it; every correctness finding fixed or answered in the PR.
- [ ] **PR:** plain-English description for a non-technical owner (what was wrong, what changed, the before-and-after table, anything skipped, anything needing the owner's decision); branch up to date with `main`.
- [ ] **CI green** on `full` and `windows-smoke`; every review thread resolved; after any fix pushed in response to Codex, request a re-pass with `@codex review`.

---

## Tasks

### Task M0: Prerequisites (before the first batch builds)

**Files:** none in the repository; scratch under `tmp/audit-2026-10-27/`.

- [x] **Step 1: Review B13's plan.** Done 2026-10-28: "Review notes" are in the plan, and C-9 is settled (decisions spec 4.3 and section 3). B13 now imports B3's `specVersionBefore` (row 5).
- [x] **Step 2: Round-4 findings planned.** Done 2026-10-28: each affected plan has "Amendment notes (round 4)" and "Review notes (round 4)", and the six owner questions are decided (decisions spec 4.1 and section 2). FIN-506 moved to B6 Task 5A.
- [x] **Step 3: The two unowned residuals have a home.** Done 2026-10-28. (b) was proved by `tmp/audit-2026-10-27/probes/AI-512.probe.ts` (1 failed, 5 passed at HEAD). It is now finding AI-512 (Medium), in `findings.json` and `brief/batches.json` under B3 and fixed by B3 Task 8F. (a) is B3 Task 8E.
- [ ] **Step 3a: Review the integration-added tasks.** These are B3 Tasks 8E and 8F, B8 Task 16, B11 Task 9, B5 Task 29 Steps C and D, B6 Task 5A, B4's after-tax re-pins and B13's C-9 rule (see "Integration-added tasks" above). A reviewer who did not write them appends "Review notes (integration)" to each plan, as for B1–B12. The main session may skip this step if it accepts the batch's fresh-diff review instead; the batch's reviewer brief then names these tasks.
- [ ] **Step 4: Build the replay harness V0** from the post-fix verification plan (`tmp/audit-2026-10-27/tools/replay-census.ts`, `diff-replays.cjs`), run it on a worktree at `6542531`, keep the output as `tmp/audit-2026-10-27/replay/base-6542531/`, and prove it deterministic (two runs, zero differences).
- [x] **Step 5: Regenerate the planner summaries.** Done 2026-10-28 for B2–B13 and R. B1's plan was not edited. The `*.r4.summary.json` files are stale history.
- [x] **Step 6: Recompute coverage.** Done 2026-10-28 (`coverage.cjs` now reads lettered task headings): 229 findings, 229 planned, 0 without a task. The table below is its output. Re-run it after any plan edit: `node tmp/audit-2026-10-27/plans/coverage.cjs && node tmp/audit-2026-10-27/plans/coverage-table.cjs && node tmp/audit-2026-10-27/plans/splice-coverage.cjs`.
- [ ] **Step 7: Settle the open decisions** in decisions spec 4.4 before the batch they touch builds: B13 (growth cells), B5 (stub line), B9 (DATA-104 severity reading), B4 (the Feldstein quote, needed before its D-next), and the home of AI-512's guidance-row surface (B9) (O-1 to O-5). O-6, the capital-date observation, needs a probe before it is a decision.

### Task M1: B3 (slot 1)

- [ ] **Step 1:** `git fetch origin && git worktree add ../metis-b3 -b fix/payload-records origin/main`.
- [ ] **Step 2:** Execute `2026-10-27-audit-fix-03-payload-records.md` task by task (1–8, 8A–8F, 9–19). Commit the planning documents as "Where the planning documents are committed" says.
- [ ] **Step 3:** Run the exit gate. Open the PR; merge when the gate is complete.

### Task M2: B1 (slot 2) and B2 (slot 3)

- [ ] **Step 1:** Cut `fix/claim-verifier-periods` from the newest `main`, after B3 has merged. Execute B1 with conflict row 55: NVDA #48's latest-year ROIC and accrual claims stay validated because of B3 Task 8E. Re-state B1's measured cost in its CHANGELOG, DECISIONS entry and PR, and add Task 8E's fourth test. Then run the exit gate and merge.
- [ ] **Step 2:** Cut `fix/claim-verifier-numbers` from B1's head (stacked) or from `main` after B1 merges. Execute B2 (with the C-2 edit and round-4 Tasks 16–19) and conflict rows 1–3 and 56. Then run the exit gate and merge.

### Task M3: B13 (slot 4), B4 (slot 5), B5 (slot 6), B6 (slot 7)

- [ ] **Step 1:** After B3 merges, cut `fix/edgar-derived-lines` and execute B13 with the C-9 rule (OD-5 (a1)/(a2)), conflict rows 5, 52 and 54. Then run the exit gate and merge.
- [ ] **Step 2:** Cut B4 from the newest `main`. Execute it with the after-tax OD-4, Task 11 Step 0 and conflict rows 5, 10, 14–20 and 57. Then run the exit gate and merge.
- [ ] **Step 3:** Cut B5 and execute it with round-4 Tasks 18–21. Re-measure its replay (Task 29) on B4's code; Task 29 Steps C and D must pass before D-next. Work through conflict rows 12, 14–16, 19–20, 53, 57, 58 and 64, then run the exit gate and merge.
- [ ] **Step 4:** Cut B6 and execute it with Task 5A (FIN-506) and round-4 Tasks 22–24. The Altman (2000) re-read in Task 29 comes before D-next. Work through conflict rows 6, 8, 17–18, 21–23, 50, 54 and 58, then run the exit gate and merge.

### Task M4: B7 (slot 8), B8 (slot 9), B11 (slot 13) — may be promoted

- [ ] **Step 1:** Cut B7 from `main` at any time and build it in parallel with M3. Run the exit gate, and merge when its slot or a promotion opens.
- [ ] **Step 2:** Cut B8 stacked on B7, or from `main` after B7 merges. Execute it with round-4 Task 15 (AI-510) and Task 16 (OD-10 wording), and conflict rows 25–28. Then run the exit gate and merge.
- [ ] **Step 3:** Cut B11 after B8 merges. Execute it with Task 9 (the density-cookie PRIVACY gap) and conflict rows 29–31 and 61. Run the exit gate. Merge after B9 if B9 is ready; otherwise promote.

### Task M5: B9 (slot 10) and B10 (slot 11)

- [ ] **Step 1:** Build B9 in parallel with M3 and rebase it after B6 and B13. Execute it with round-4 Tasks 20–21 and Task 4 Step 0, and conflict rows 11–13, 23–24, 51, 52 and 59 (C-10: no reuse of `oneBasisPair`). Then run the exit gate and merge.
- [ ] **Step 2:** Build B10 in parallel with B9. Execute it with the C-1 edit and round-4 Tasks 23–25, and conflict rows 7, 9, 24, 32–33, 36–40, 60, 62 and 63. Then run the exit gate and merge.

### Task M6: R1 (slot 12), R2 and R3 (slot 14), R4 (slot 15)

- [ ] **Step 1:** Cut R1 after B10 merges. R1 Task 7 shrinks to its tests (C-1), and the audit-export golden is pinned on B10's output. Execute it, run the measurement gate (R plan) on isolated ports, then run the exit gate and merge.
- [ ] **Step 2:** Cut R2 and R3 from `main` after R1 and build them in parallel. Merge one, rebase the other, and merge it (rows 39–41, 63).
- [ ] **Step 3:** Cut R4 after both. State the T8 `[data-summary]` gate change in the PR ("Gate change" paragraph), and meet B11 Task 9's cookie test (row 61). Then run the exit gate and merge.

### Task M7: B12 (slot 16)

- [ ] **Step 1:** Cut B12 from the final `main`; re-derive every number its plan quotes from the merged constants (stamps, `PAYLOAD_BUDGETS`, `SCORE_BANDS_VERSION` and its D-number); conflict rows 44–47 and 61 (keep B11 Task 9's PRIVACY sentences); the METHODOLOGY header pin (OD-4, confirmed) is stated in the PR.
- [ ] **Step 2:** Execute; any module below the new per-file floor gets tests here; exit gate; merge.

### Task M8: Post-fix verification

- [ ] **Step 1:** Run `docs/superpowers/plans/2026-10-27-audit-post-fix-verification.md` (V1–V9; V10 and V11 only with the owner's approval) on the merged `main`. Back up and checksum `tmp/audit-2026-10-27/agents/` before the probe run (V2), because probes rewrite evidence logs.
- [ ] **Step 2:** Every failed gate becomes a finding in a follow-up batch; repeat until every gate passes.

---

## Coverage: every finding mapped to a batch and task

Computed, not eyeballed: `tmp/audit-2026-10-27/plans/coverage.cjs` reads `findings.json`, every task heading of the fourteen plan files (lettered headings such as `### Task 8F:` included since the 2026-10-28 refresh) and the planner summaries' task→finding lists; `coverage-table.cjs` renders this table and `splice-coverage.cjs` writes it here. A finding counts as planned when a task in its own batch's plan names it in its heading (or, failing that, in the summary's task list). The "task(s)" column lists the fix tasks; every finding is also carried by its batch's stamp, golden, CHANGELOG, DECISIONS, disposition, replay, verify and review tasks.

**Counts at the integration refresh (2026-10-28):** 229 findings (228 plus AI-512, added on 2026-10-28 by `tools/aggregate.cjs` and `tools/build-findings.cjs`, 0 bad references and no unbatched id; `tools/build-report.cjs` 0 bad references); **229 planned, 0 without a task**. Every finding is named in a task heading of its own batch's plan (none relies on a summary alone), and none is planned only in another batch. 193 were planned in the first round, 11 in B13's plan, 24 in the round-4 amendments and 1 (AI-512) at integration. No finding is skipped or disputed by any plan, so there is no exception list. Thirteen rows carry a note: a probe assertion restated, a sub-case left, a placement or mechanism changed, or a severity call. Merged duplicates, not rows here: AI-105 → AI-202, AI-203 → AI-403, AI-401-V2 → AI-401 (the last two are still listed in `brief/batches.json` for B2 and are skipped), JOB-210 → AI-115, DOC-103 → SEC-207. FIN-506 counts under B6 Task 5A only; B5's struck Task 22 names no finding. The readability phases cover the readability targets (T1–T11), not findings.

<!-- COVERAGE-TABLE:BEGIN (generated by tmp/audit-2026-10-27/plans/coverage-table.cjs) -->
| # | id | sev | batch | task(s) in the batch plan | status |
|---|---|---|---|---|---|
| 1 | AI-106 | H | B1 | B1 Task 1 | planned |
| 2 | AI-302 | H | B1 | B1 Task 2 | planned |
| 3 | AI-302-V1 | H | B1 | B1 Task 8 | planned |
| 4 | AI-303 | H | B1 | B1 Task 3 | planned |
| 5 | AI-303-V1 | H | B1 | B1 Task 3 | planned |
| 6 | AI-303-V3 | H | B1 | B1 Task 4 | planned |
| 7 | AI-303-V4 | H | B1 | B1 Task 5 | planned |
| 8 | AI-402 | H | B1 | B1 Task 6 | planned |
| 9 | AI-402-V1 | M | B1 | B1 Task 6 | planned |
| 10 | AI-402-V2 | L | B1 | B1 Task 6 | planned |
| 11 | AI-404 | M | B1 | B1 Task 7 | planned |
| 12 | AI-405 | M | B1 | B1 Task 9 | planned |
| 13 | AI-103 | M | B2 | B2 Task 13 | planned |
| 14 | AI-104 | L | B2 | B2 Task 14 | planned |
| 15 | AI-111 | L | B2 | B2 Task 15 | planned |
| 16 | AI-116 | M | B2 | B2 Task 12 | planned |
| 17 | AI-202 | H | B2 | B2 Task 2 | planned |
| 18 | AI-304 | H | B2 | B2 Task 3 | planned |
| 19 | AI-304-V1 | M | B2 | B2 Task 3 | planned |
| 20 | AI-304-V2 | M | B2 | B2 Task 4 | planned |
| 21 | AI-304-V3 | L | B2 | B2 Task 3 | planned |
| 22 | AI-305 | H | B2 | B2 Task 9 | planned |
| 23 | AI-305-V1 | M | B2 | B2 Task 9 | planned |
| 24 | AI-401 | H | B2 | B2 Task 6 | planned |
| 25 | AI-401-V1 | H | B2 | B2 Task 7 | planned |
| 26 | AI-403 | M | B2 | B2 Task 5 | planned |
| 27 | AI-407 | M | B2 | B2 Task 10 | planned |
| 28 | AI-408 | M | B2 | B2 Task 11 | planned |
| 29 | AI-409 | L | B2 | B2 Task 8 | planned |
| 30 | AI-501 | M | B2 | B2 Task 17 | planned (round 4) |
| 31 | AI-502 | M | B2 | B2 Task 19 | planned (round 4); verifier-side classification (B2 OD-6), not the payload kind field the fix sketch names; PAYLOAD_VERSION does not move |
| 32 | AI-503 | H | B2 | B2 Task 16 | planned (round 4) |
| 33 | AI-503-V1 | H | B2 | B2 Task 16 | planned (round 4) |
| 34 | AI-503-V2 | M | B2 | B2 Task 16 | planned (round 4) |
| 35 | AI-504 | L | B2 | B2 Task 18 | planned (round 4) |
| 36 | SEC-203 | M | B2 | B2 Task 1 | planned |
| 37 | AI-101 | M | B3 | B3 Task 8 | planned; stored AMZN #43 gets no display rule (not detectable from the stored bytes); recorded as a known limitation (4.3) |
| 38 | AI-102 | L | B3 | B3 Task 2 | planned |
| 39 | AI-117 | H | B3 | B3 Task 3; B3 Task 10 | planned |
| 40 | AI-117-V1 | L | B3 | B3 Task 3 | planned |
| 41 | AI-301 | C | B3 | B3 Task 1; B3 Task 10 | planned |
| 42 | AI-301-V1 | L | B3 | B3 Task 1 | planned |
| 43 | AI-306 | M | B3 | B3 Task 4 | planned |
| 44 | AI-310 | M | B3 | B3 Task 7; B3 Task 10 | planned |
| 45 | AI-406 | M | B3 | B3 Task 6 | planned |
| 46 | AI-410 | L | B3 | B3 Task 5; B3 Task 10 | planned |
| 47 | AI-505 | M | B3 | B3 Task 8A | planned (round 4) |
| 48 | AI-507 | L | B3 | B3 Task 8B | planned (round 4) |
| 49 | AI-509 | L | B3 | B3 Task 8D; B3 Task 10 | planned (round 4) |
| 50 | AI-511 | M | B3 | B3 Task 8C; B3 Task 10 | planned (round 4) |
| 51 | AI-512 | M | B3 | B3 Task 8F | planned (integration); new finding (residual (b), proved by probe 2026-10-28); the same stale labels on the guidance rows (filingDisclosures.ts) are left for later, recommended home B9 |
| 52 | FIN-103 | L | B4 | B4 Task 1 | planned |
| 53 | FIN-108 | L | B4 | B4 Task 12 | planned |
| 54 | FIN-109 | L | B4 | B4 Task 13; B4 Task 15 | planned |
| 55 | FIN-119 | H | B4 | B4 Task 2 | planned |
| 56 | FIN-119-V1 | M | B4 | B4 Task 3 | planned |
| 57 | FIN-119-V2 | L | B4 | B4 Task 2; B4 Task 12 | planned |
| 58 | FIN-302 | H | B4 | B4 Task 11 | planned |
| 59 | FIN-302-V1 | H | B4 | B4 Task 11 | planned |
| 60 | FIN-302-V2 | L | B4 | B4 Task 11 | planned |
| 61 | FIN-303 | H | B4 | B4 Task 4 | planned |
| 62 | FIN-303-V1 | M | B4 | B4 Task 4 | planned |
| 63 | FIN-304 | M | B4 | B4 Task 5 | planned |
| 64 | FIN-305 | H | B4 | B4 Task 6 | planned |
| 65 | FIN-305-V1 | M | B4 | B4 Task 6 | planned |
| 66 | FIN-305-V2 | L | B4 | B4 Task 6 | planned |
| 67 | FIN-311 | L | B4 | B4 Task 12 | planned |
| 68 | FIN-401 | H | B4 | B4 Task 8 | planned |
| 69 | FIN-401-V1 | M | B4 | B4 Task 8 | planned |
| 70 | FIN-403 | M | B4 | B4 Task 7 | planned |
| 71 | FIN-404 | M | B4 | B4 Task 9 | planned |
| 72 | FIN-407 | L | B4 | B4 Task 10; B4 Task 15 | planned |
| 73 | FIN-101 | H | B5 | B5 Task 3; B5 Task 17 | planned |
| 74 | FIN-101-V1 | M | B5 | B5 Task 4 | planned |
| 75 | FIN-101-V2 | L (plausible) | B5 | B5 Task 3 | planned |
| 76 | FIN-102 | M | B5 | B5 Task 6; B5 Task 17 | planned |
| 77 | FIN-104 | L | B5 | B5 Task 15; B5 Task 17 | planned |
| 78 | FIN-111 | M | B5 | B5 Task 12 | planned |
| 79 | FIN-113 | L | B5 | B5 Task 5; B5 Task 17 | planned |
| 80 | FIN-114 | M | B5 | B5 Task 10; B5 Task 17 | planned |
| 81 | FIN-115 | L | B5 | B5 Task 9 | planned |
| 82 | FIN-116 | M | B5 | B5 Task 8; B5 Task 17 | planned |
| 83 | FIN-118 | L | B5 | B5 Task 16; B5 Task 17 | planned |
| 84 | FIN-127 | M | B5 | B5 Task 14 | planned |
| 85 | FIN-301 | H | B5 | B5 Task 1; B5 Task 17 | planned |
| 86 | FIN-301-V1 | H | B5 | B5 Task 3 | planned |
| 87 | FIN-301-V2 | L | B5 | B5 Task 3 | planned |
| 88 | FIN-301-V3 | L | B5 | B5 Task 2; B5 Task 17 | planned |
| 89 | FIN-402 | M | B5 | B5 Task 7 | planned |
| 90 | FIN-402-V1 | M | B5 | B5 Task 7 | planned |
| 91 | FIN-402-V2 | M | B5 | B5 Task 7 | planned |
| 92 | FIN-405 | M | B5 | B5 Task 13 | planned |
| 93 | FIN-406 | L | B5 | B5 Task 11 | planned |
| 94 | FIN-501 | M | B5 | B5 Task 18 | planned (round 4) |
| 95 | FIN-502 | M | B5 | B5 Task 19 | planned (round 4) |
| 96 | FIN-512 | L | B5 | B5 Task 20 | planned (round 4) |
| 97 | RPT-502 | L | B5 | B5 Task 21 | planned (round 4) |
| 98 | FIN-105 | H | B6 | B6 Task 2 | planned |
| 99 | FIN-105-V1 | M | B6 | B6 Task 3 | planned |
| 100 | FIN-106 | L | B6 | B6 Task 4 | planned |
| 101 | FIN-107 | M (plausible) | B6 | B6 Task 1 | planned |
| 102 | FIN-110 | L | B6 | B6 Task 20 | planned |
| 103 | FIN-112 | M | B6 | B6 Task 6 | planned |
| 104 | FIN-117 | M | B6 | B6 Task 7 | planned |
| 105 | FIN-120 | M | B6 | B6 Task 9 | planned |
| 106 | FIN-121 | M | B6 | B6 Task 11 | planned |
| 107 | FIN-122 | M | B6 | B6 Task 8 | planned |
| 108 | FIN-123 | M | B6 | B6 Task 13 | planned |
| 109 | FIN-124 | M | B6 | B6 Task 12 | planned |
| 110 | FIN-125 | L | B6 | B6 Task 19 | planned |
| 111 | FIN-126 | M | B6 | B6 Task 18 | planned |
| 112 | FIN-306 | M | B6 | B6 Task 14 | planned |
| 113 | FIN-307 | M | B6 | B6 Task 16 | planned |
| 114 | FIN-308 | M | B6 | B6 Task 15 | planned |
| 115 | FIN-309 | L | B6 | B6 Task 5 | planned |
| 116 | FIN-310 | L | B6 | B6 Task 4 | planned |
| 117 | FIN-312 | L | B6 | B6 Task 17 | planned |
| 118 | FIN-313 | L | B6 | B6 Task 10 | planned |
| 119 | FIN-503 | M | B6 | B6 Task 23 | planned (round 4) |
| 120 | FIN-504 | M | B6 | B6 Task 22 | planned (round 4) |
| 121 | FIN-505 | L | B6 | B6 Task 24 | planned (round 4) |
| 122 | FIN-506 | L | B6 | B6 Task 5A | planned (round 4); moved from B5 (decisions spec 4.3); B5 Task 22 is a struck tombstone |
| 123 | RPT-101 | L | B6 | B6 Task 21 | planned |
| 124 | AI-108 | H | B7 | B7 Task 10 | planned |
| 125 | AI-109 | L | B7 | B7 Task 9 | planned |
| 126 | AI-112 | L | B7 | B7 Task 11 | planned |
| 127 | AI-113 | H | B7 | B7 Task 2 | planned |
| 128 | AI-113-V1 | L | B7 | B7 Task 3 | planned |
| 129 | AI-114 | L | B7 | B7 Task 1 | planned |
| 130 | AI-307 | M | B7 | B7 Task 4 | planned |
| 131 | AI-308 | M | B7 | B7 Task 5 | planned |
| 132 | AI-309 | M | B7 | B7 Task 8 | planned |
| 133 | JOB-203 | M | B7 | B7 Task 6 | planned |
| 134 | JOB-204 | L | B7 | B7 Task 12 | planned |
| 135 | JOB-209 | M | B7 | B7 Task 7 | planned |
| 136 | RPT-210 | L | B7 | B7 Task 13 | planned |
| 137 | AI-110 | M | B8 | B8 Task 8 | planned |
| 138 | AI-115 | M | B8 | B8 Task 9 | planned |
| 139 | AI-510 | M | B8 | B8 Task 15 | planned (round 4) |
| 140 | DB-001 | H | B8 | B8 Task 1 | planned |
| 141 | JOB-201 | M | B8 | B8 Task 2 | planned |
| 142 | JOB-202 | M | B8 | B8 Task 3 | planned |
| 143 | JOB-205 | L | B8 | B8 Task 7 | planned |
| 144 | JOB-206 | M | B8 | B8 Task 5 | planned; probe's 20 s paid-TTL case not ported (below the configurable minimum) |
| 145 | JOB-207 | L | B8 | B8 Task 4 | planned |
| 146 | JOB-208 | M | B8 | B8 Task 6 | planned |
| 147 | JOB-213 | M | B8 | B8 Task 10 | planned |
| 148 | JOB-214 | L | B8 | B8 Task 12 | planned |
| 149 | JOB-215 | L | B8 | B8 Task 13 | planned; probe's literal assertion not adopted: the second render is removed instead of caching |
| 150 | JOB-301 | M | B8 | B8 Task 11 | planned; probe's literal expectation not adopted: Generate still starts a new run (OD-4) |
| 151 | PERF-202 | L | B8 | B8 Task 14 | planned |
| 152 | AI-202-V1 | M | B9 | B9 Task 8 | planned |
| 153 | AI-506 | M | B9 | B9 Task 20 | planned (round 4) |
| 154 | AI-508 | M | B9 | B9 Task 21 | planned (round 4) |
| 155 | AI-512-V1 | M | B9 | B9 Task 21A; B9 Task 21B | planned |
| 156 | DATA-101 | M | B9 | B9 Task 2 | planned; probe's stored-report count restated |
| 157 | DATA-102 | L | B9 | B9 Task 18 | planned |
| 158 | DATA-103 | M | B9 | B9 Task 3 | planned |
| 159 | DATA-104 | M | B9 | B9 Task 4 | planned; severity kept Medium after the offline prevalence count (TSM's USD series is IFRS-only); its reading of 4.3 is open (decisions spec 4.4) |
| 160 | DATA-106 | L | B9 | B9 Task 19 | planned; probe asserted an implementation; behaviour restated |
| 161 | DATA-107 | M | B9 | B9 Task 5 | planned |
| 162 | DATA-108 | L | B9 | B9 Task 6 | planned |
| 163 | DATA-109 | L | B9 | B9 Task 7 | planned |
| 164 | DATA-110 | L | B9 | B9 Task 11 | planned |
| 165 | DATA-111 | M | B9 | B9 Task 1 | planned |
| 166 | DATA-112 | M | B9 | B9 Task 15 | planned |
| 167 | DATA-113 | M | B9 | B9 Task 17 | planned |
| 168 | DATA-114 | M | B9 | B9 Task 16 | planned |
| 169 | DATA-115 | L | B9 | B9 Task 13 | planned |
| 170 | DATA-116 | L | B9 | B9 Task 12 | planned |
| 171 | PERF-101 | L | B9 | B9 Task 14 | planned |
| 172 | RPT-201 | M | B9 | B9 Task 9 | planned |
| 173 | RPT-202 | M | B9 | B9 Task 10 | planned; probe asserted an implementation; behaviour restated |
| 174 | AI-201 | M | B10 | B10 Task 9 | planned |
| 175 | DB-002 | M | B10 | B10 Task 4 | planned |
| 176 | DB-003 | L | B10 | B10 Task 7 | planned |
| 177 | DB-004 | L | B10 | B10 Task 3 | planned |
| 178 | DB-005 | L | B10 | B10 Task 5 | planned |
| 179 | DB-006 | L | B10 | B10 Task 6 | planned |
| 180 | RPT-001 | L | B10 | B10 Task 8 | planned |
| 181 | RPT-102 | L | B10 | B10 Task 22 | planned |
| 182 | RPT-103 | L | B10 | B10 Task 13 | planned |
| 183 | RPT-203 | L | B10 | B10 Task 10 | planned |
| 184 | RPT-204 | L | B10 | B10 Task 12 | planned |
| 185 | RPT-205 | L | B10 | B10 Task 14 | planned |
| 186 | RPT-206 | M | B10 | B10 Task 2 | planned |
| 187 | RPT-207 | L | B10 | B10 Task 1 | planned |
| 188 | RPT-208 | L | B10 | B10 Task 11 | planned |
| 189 | RPT-209 | L | B10 | B10 Task 3 | planned |
| 190 | RPT-211 | L | B10 | B10 Task 15 | planned |
| 191 | RPT-212 | L | B10 | B10 Task 16 | planned |
| 192 | RPT-213 | L | B10 | B10 Task 17 | planned |
| 193 | RPT-214 | L | B10 | B10 Task 18 | planned |
| 194 | RPT-215 | L | B10 | B10 Task 19 | planned |
| 195 | RPT-216 | L | B10 | B10 Task 20 | planned |
| 196 | RPT-217 | L | B10 | B10 Task 21 | planned |
| 197 | RPT-501 | M | B10 | B10 Task 23 | planned (round 4) |
| 198 | RPT-503 | L | B10 | B10 Task 24 | planned (round 4) |
| 199 | RPT-504 | L | B10 | B10 Task 25 | planned (round 4) |
| 200 | DOC-203 | M | B11 | B11 Task 5 | planned |
| 201 | PERF-201 | L | B11 | B11 Task 8 | planned |
| 202 | SEC-201 | M | B11 | B11 Task 1 | planned |
| 203 | SEC-202 | M | B11 | B11 Task 6 | planned |
| 204 | SEC-204 | M | B11 | B11 Task 2 | planned |
| 205 | SEC-205 | L | B11 | B11 Task 7 | planned |
| 206 | SEC-206 | M | B11 | B11 Task 3 | planned |
| 207 | SEC-207 | M | B11 | B11 Task 4 | planned |
| 208 | DOC-101 | L | B12 | B12 Task 6 | planned |
| 209 | DOC-102 | L | B12 | B12 Task 7 | planned |
| 210 | DOC-201 | L | B12 | B12 Task 9 | planned |
| 211 | DOC-202 | L | B12 | B12 Task 8; B12 Task 9 | planned |
| 212 | DOC-204 | L | B12 | B12 Task 11 | planned |
| 213 | DOC-205 | L | B12 | B12 Task 12 | planned |
| 214 | DOC-301 | L | B12 | B12 Task 10 | planned |
| 215 | JOB-212 | L | B12 | B12 Task 13 | planned |
| 216 | TEST-201 | L | B12 | B12 Task 3; B12 Task 4 | planned |
| 217 | TEST-202 | L | B12 | B12 Task 1 | planned |
| 218 | TEST-203 | L | B12 | B12 Task 2 | planned |
| 219 | TEST-204 | L | B12 | B12 Task 5 | planned |
| 220 | FIN-507 | H | B13 | B13 Task 3; B13 Task 10 | planned |
| 221 | FIN-507-V1 | L | B13 | B13 Task 3 | planned |
| 222 | FIN-508 | M | B13 | B13 Task 4; B13 Task 10 | planned |
| 223 | FIN-509 | H | B13 | B13 Task 5; B13 Task 10 | planned |
| 224 | FIN-509-V1 | M | B13 | B13 Task 6; B13 Task 10 | planned |
| 225 | FIN-510 | H | B13 | B13 Task 1; B13 Task 10 | planned |
| 226 | FIN-510-V1 | L | B13 | B13 Task 1; B13 Task 2 | planned; HD deferred-revenue sub-case left (sibling elements, no definitional order); recorded |
| 227 | FIN-510-V2 | L (plausible) | B13 | B13 Task 1 | planned |
| 228 | FIN-511 | H | B13 | B13 Task 7 | planned; C-9 rule: a material, unlabelled re-filing withholds the derived quarter (BAC Q4 2024) |
| 229 | FIN-511-V1 | M | B13 | B13 Task 9; B13 Task 10 | planned |
| 230 | FIN-511-V2 | L | B13 | B13 Task 8 | planned |
<!-- COVERAGE-TABLE:END -->

---

## Open items for the main session

Closed at the 2026-10-28 refresh: B13's review and C-9; the round-4 tasks and the six owner questions (decisions spec 4.1); both unowned residuals (AI-512 in B3 Task 8F, residual (a) in B3 Task 8E); every reviewer call in decisions spec 4.2 (resolved by 4.3 and applied in the plans' "Integration notes"); the stale summaries; the B6 harness path (row 50); the findings count (229).

Still open:

1. **Decisions not yet taken** (decisions spec 4.4). They are B13's growth cells after a material, unlabelled re-presentation, B5's 0.9-year stub line against an eleven-month transition period, the literal reading of 4.3's DATA-104 rule (TSM), the Feldstein quote B4 cites, and the home of AI-512's guidance-row surface. Each must be settled before its batch builds (Task M0 Step 7).
2. **B1's plan was not edited.** Its OD-1 "measured cost", Task 3 Step 5 and Task 13 still expect NVDA #48's two latest-year claims to become unverified. With B3 Task 8E merged first they stay validated (row 55, decisions spec C-11). The B1 executor follows row 55; editing B1's plan to match before it builds is cleaner.
3. **B13's cross-batch line** asks B9's AI-508 to reuse `oneBasisPair` with the `labelled` argument (B13 plan, cross-batch notes and Integration notes item 10). B9 OD-11 rejects the reuse, and C-10 sides with B9. Edit B13's line when its plan is next touched; the B13 executor does not implement B9's side, so nothing breaks meanwhile.
4. **Verification plan** (`2026-10-27-audit-post-fix-verification.md`, not edited here):
   - V7 should name B2's disposition-note section "Residuals for the post-fix audit" (the spaced-dash range sign and "EPS" as a per-share basis) as probe targets, not as known findings. 4.3 says V7 checks both.
   - V2's "239 files" is now 240 top-level probes, AI-512 included.
   - V2's expected-fail rule has no recorded skip or dispute to allow.
   - AI-101 is a known limitation of stored #43, so V5 should expect no display rule for it.
5. **Not yet findings, recorded for triage:**
   - The capital "latest" rows print the newest income year's date (`cap.asOf`, `capital.ts:529`) while their values can come from a newer or older cash-flow or capex year (B3 integration item 9). A synthetic bundle shows it; NVDA #48's data align; the other snapshots are unchecked. B3 Task 8E only declines to label such rows. Write a probe at HEAD before deciding whether it is a finding.
   - AI-512's guidance-row surface (`src/pipeline/filingDisclosures.ts:238`, `:433`, `:622`) is the same root on another surface. It is named "left for later" in B3's PR and in the AI-512 verdict, but no B9 task fixes it yet (decisions spec 4.4).
6. **Integration-added tasks have no independent plan review** (Task M0 Step 3a).
7. **Commit traps** in three plan files (B6, B8, B11), listed under "Where the planning documents are committed". Fix each in its batch's commit.
8. **Generated audit records refreshed** on 2026-10-28: `tmp/audit-2026-10-27/agents/aggregate/all-verdicts.json`, `findings.json`, `brief/batches.json` (AI-512 under B3) and `REPORT.md` (the shared-files table now lists `claimEvidence.ts` under B1, B2 and B3, because AI-512 cites it; B3's fix is in `payload.ts`). Rebuild them only with the tools, never by hand.

**Update 2026-10-28 (post-integration review).** Task M0 Step 3a is done: five independent reviewers checked every task the integration added, and each plan ends with a "Post-integration review (2026-10-28)" section. AI-513 was cleared, with no finding. AI-512-V1 was confirmed and planned in B9 (conflict row 65). Coverage is 230 of 230 findings planned (table above, regenerated by `coverage.cjs`). Decisions spec 4.5 and 4.6 settle every item listed above as open, so nothing is left open before B3 builds.
