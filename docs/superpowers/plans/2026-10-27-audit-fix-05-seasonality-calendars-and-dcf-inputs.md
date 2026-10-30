# Seasonality, 52/53-week calendars and DCF inputs on one basis Implementation Plan (B5a and B5b)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Make every DCF input in audit batch B5 read one period basis: a quarter is never annualised across its season or its week count, a fiscal year is never a stub or mislabelled, and the WACC, terminal rule, margin path, tax seed and reverse DCF read the same operating income, the same debt balance, the same tax rule and the same base paths as the rest of the DCF, and the scenario text says the rule the code applies.

**Two parts, two PRs (pre-flight split, 2026-10-29).** One plan file holds both, as B4's does.
- **Part A, B5a (PR 1, next after B4a).**
  - Tasks, in this order: 1, 2, 3 (amended, R1), 4 (amended, R2) and 3b (new, R4). Task 3b extends Task 4's context helper, so it runs after Task 4. Then Task 17 (the display module, with rows `quarterLength`, `guidedTimesFour`, `fiscalYearEnd` and `guidedFloorTimesFour`), then B5a's batch tasks 23-32.
  - Findings: FIN-301, FIN-301-V1 and FIN-101 (the three High findings), and FIN-101-V1, FIN-101-V2, FIN-301-V2 and FIN-301-V3.
  - Evidence: census rows E1 and E5 (Task 29 Step C) and Step D checks 3-5.
  - Expected stamps, each next after the preceding merge (B4a's): report 1.51.0, payload 1.53.0, Stage B `…_32`, D-136 and `ANNUALIZATION_CONVENTION_SPEC` "1.51.0". FAIR_VALUE_METHOD_VERSION, SCENARIO_PATHS_METHOD_VERSION and PIPELINE_VERSION do not move: no B5a task names them.
- **Part B, B5b (PR 2, cut directly after B5a merges).**
  - Tasks: 5-16 and 18-21; new Task 7b (the reinvestment front-load, R6); new Task 10b (the ERP refresh, R7); Task 17b (B5b's display rows under their own cutoff, `DCF_INPUTS_CONVENTION_SPEC`). Then B5b's batch tasks 23b-32b, each written as a delta on its B5a counterpart.
  - Findings: FIN-113, FIN-102, FIN-402, FIN-402-V1, FIN-402-V2, FIN-116, FIN-115, FIN-114, FIN-406, FIN-111, FIN-405, FIN-127, FIN-104, FIN-118, FIN-501, FIN-502, FIN-512 and RPT-502.
  - Evidence: census rows E2-E4 and E6, and Step D checks 1-2.
  - Expected stamps, each next after the preceding merge (B5a's): report 1.52.0, payload 1.54.0, Stage B `…_33`, D-137, `FAIR_VALUE_2026_10_D137` and `SHARED_SCENARIO_PATHS_2026_10_D137`, PIPELINE_VERSION "stage-c-1.6.14", and `DCF_INPUTS_CONVENTION_SPEC` "1.52.0".
- B5b follows B5a directly. It is the same plan with the same pre-flight, and Task 5 uses Task 1's `ttmInc.periodStart`; running it later would cost a full re-take of its references.
- Moved tasks keep their numbers, and their old places carry a stub. Every expected stamp is re-taken at execution (pre-flight P3; Global Constraints, numbering at merge).

**Architecture:** One small new pure module (`src/pipeline/stageB/fiscalCalendar.ts`) gives week counts, 13-week/52-week scaling and the issuer's weekday fiscal-year rule. `compute.ts` carries quarter lengths, the TTM window start and per-fiscal-year tagged one-offs into Stage B. `valuation.ts`, `returns.ts`, `growth.ts`, `currentCapital.ts`, `projections.ts`, `scenarioTargets.ts` and `fairValue.ts` then apply one rule each, `scenarioPresentation.ts` and `thesisTriggers.ts` state it, and the payload and stored-report display layer state what changed. No provider is called; nothing new is fetched. The pre-flight (2026-10-29) adds five rules. The guided quarter is taken out of its own growth-adjusted season before × 4 (Task 3). Issuer caveats ride on the growth rows they qualify (Task 3b). A recurring tagged family is not added back (Task 7). Year one's reinvestment is front-loaded to the trailing net capital spending (Task 7b). The ERP fallback constant is refreshed by hand (Task 10b; its fetch is routed to D2).

**Tech Stack:** TypeScript (strict), Vitest (`npx vitest run`), Next.js 16 (one client component touched in Task 14), Node 24, tsx.

**Spec:** `tmp/audit-2026-10-27/REPORT.md` section 7, "### B5: Seasonality, 52/53-week calendars and DCF inputs on one basis" (`:1799` as of 2026-10-28; REPORT.md grew after the first draft cited `:1584`), and each finding's entry in REPORT.md; `tmp/audit-2026-10-27/findings.json` (evidence, probe paths, stamps, stored-report class); `tmp/audit-2026-10-27/brief/batches.json`. All are git-ignored audit records, read-only. Cross-plan conventions, the round-4 leans and the binding main-session resolutions: `docs/superpowers/specs/2026-10-27-audit-remediation-decisions.md` (sections 2.15 and 4.1, and section 4.3 "Main-session resolutions (2026-10-28)"; the file is untracked in the working tree, not on main at HEAD 6542531). The pre-flight review (`.superpowers/sdd/2026-10-27-audit-fix-05-seasonality-calendars-and-dcf-inputs/preflight-review.md`, measured at B13's `3ca1c6b`) and the controller's rulings on it (`preflight-rulings.md`, same folder, binding) are applied in "Pre-flight amendments (2026-10-29)" below.

**Branches.**
- **B5a:** `fix/seasonality-calendars-and-dcf-inputs`, cut from an up-to-date `main` after B13 (PR #75) and B4a have merged (`git fetch origin && git switch -c fix/seasonality-calendars-and-dcf-inputs origin/main`). REPORT.md section 7 orders B5 after B1–B4; B4b now runs after B5 (pre-flight P9). Rebase on the last merged batch before starting, and again before pushing.
- **B5b:** `fix/dcf-inputs-on-one-basis`, cut from `main` directly after B5a merges (Part B setup).
- Each part works in a worktree, never with a junction to shared data: copy harnesses and inputs.

**Findings (21):** FIN-101 (High), FIN-301 (High), FIN-301-V1 (High), FIN-101-V1, FIN-102, FIN-111, FIN-114, FIN-116, FIN-127, FIN-402, FIN-402-V1, FIN-402-V2, FIN-405, FIN-101-V2, FIN-301-V2, FIN-301-V3, FIN-104, FIN-113, FIN-115, FIN-118, FIN-406. Each was re-read against HEAD 6542531 while planning; every one still reads true in the code (cited lines below are at HEAD). None is skipped or disputed. Pre-flight split: Part A carries FIN-301, FIN-301-V1, FIN-101, FIN-101-V1, FIN-101-V2, FIN-301-V2 and FIN-301-V3; Part B carries the other fourteen. Cited lines are at `6542531` and are re-taken at execution (Global Constraints, line numbers).

**Round-4 findings (4 more, amended 2026-10-28):** FIN-501 (Medium, Task 18), FIN-502 (Medium, Task 19), FIN-512 (Low, Task 20), RPT-502 (Low, Task 21), each re-read at HEAD 6542531 against its probe and verdict file (`tmp/audit-2026-10-27/agents/r4-verify-1/verdicts.json`, `agents/r4-verify-3/verdicts.json`). The batch covers 25 findings, the 25 ids B5's `brief/batches.json` entry lists. FIN-506 (Low), which the round-4 amendment planned here as Task 22, was moved to B6 by the main session (decisions spec 4.3: "FIN-506. Moves from B5 to B6, because B6 rewrites the same function"); B6 builds it as its Task 5A. Task 22 below is kept as a numbered tombstone with no steps, so Tasks 23–32 keep the numbers other plans cite. All four are Part B's.

## Pre-flight amendments (2026-10-29)

A pre-flight review (opus, CHANGES REQUIRED; `preflight-review.md`) checked this plan, written at `6542531`, against B13's `3ca1c6b` (PR #75), `main` `ca3726b` and Part A of B4's plan. It measured the plan's effects offline over the 45 census snapshots and seven keyed snapshots. The controller ruled on each finding (`preflight-rulings.md`, binding). The governing rule is the merge gate: no planned rule may make a published figure worse than main for a realistic filer, and a figure that moves must be explained by name in the replay. Where each ruling is applied:

| ruling | applied in |
|---|---|
| Split (B5a, B5b) | header ("Two parts, two PRs"), Branches; Part A and Part B, each with its setup steps; stubs for Tasks 5-16 and 18-21; Task 17 keeps B5a's rows, and Task 17b (new, Part B) takes B5b's under their own cutoff, `DCF_INPUTS_CONVENTION_SPEC`, which Tasks 18-21's rows now also use; batch tasks 23-32 for B5a and 23b-32b (deltas) for B5b; Task 29 Steps C and D divided (E1, E5 and checks 3-5 in B5a; E2-E4, E6 and checks 1-2 in B5b); the batch-task references in Tasks 5, 12, 14, 15, 16 and 18-21 renumbered to the b tasks; Global Constraints (two parts, numbering at merge) |
| R1 (Task 3, OD-1: the guided quarter deseasonalized by its own growth-adjusted share) | OD-1 decision 1, alternatives (a) and (e) with their measured numbers, the trade-off; Task 3 (Files, Interfaces, Step 1 with the review's four tests and a wiring test, Steps 2-7); Task 17's `guidedTimesFour` note wording; Task 29 Step B rows and Step C row E5 (new); Tasks 27, 28, 31 and 32; Self-review |
| R2 (Task 4: only the like-for-like guided pace) | OD-1 point 6; Task 4 (rows, labels, ids, tests, `thesisTriggers.ts:70`); Task 3 Files (the thesis-trigger line points to Task 4); Task 17 row `guidedFloorTimesFour` (new); Task 17 Step 5 and Task 29's stored-report lists; Task 29b |
| R3 (Task 7: the recurrence guard and the ceiling rule) | OD-7 (the house rule, measured numbers, CAT condition); Task 7 (intro, Files, Interfaces, Step 1 with four new tests, Steps 2, 3, 5 and 6); Task 29 Step C row E6 (new, run in Task 29b); Tasks 27b (D-next house rule with threshold and source), 28b and 31b; Global Constraints (cross-batch, B5c) |
| R4 (new Task 3b: calendar-shifted events disclosed, no figure moves) | OD-1 point 7; Task 3b (new); Task 24 (golden); Task 28 (AMZN's 869.44B option size); Task 29 Step B |
| R5 / P1 (line numbers) | Global Constraints (the line-number rule, the review's stale-reference table, the re-take rule); Part A and Part B setup steps; references the pre-flight added are marked "at B13" |
| R5 / P2 ("before" values) | Global Constraints ("before" values are provenance); Task 3 Steps 5-6; Task 20 Step 5; Task 24 Step 4; Task 29 Step B ("before (branch base)" column); Task 29b |
| R5 / P3 (stamps, cutoffs, restoration rows) | header; Global Constraints (numbering at merge); Task 17 and Task 17b (cutoffs); Task 23 (the B5a table, the rebuilt grep, the pins at B13 lines, the since-version assertions, `docs/METHODOLOGY.md:6-7`); Task 23b; Task 24 (restoration rows untouched) and Task 24b (B4a's rows edited) |
| R5 / P4 (Task 17 wiring, risk manifest) | Global Constraints (risk manifest); Task 17 Files, Step 1 (full-chain idempotency), Step 3, Step 4 (`tests/risk.coverage.test.ts`); Task 21 Step 3 (the floor line re-checked after B4a) |
| R5 / P5 (out-of-repo proof harness) | Global Constraints (proof harness); Task 29 Steps A-D; Task 29b; Tasks 19 and 20 Step 2, 28 and 28b (evidence paths); Part B setup Step 5 |
| R5 / P6 (lost evidence) | Global Constraints (lost evidence); Task 19 Step 2; Task 20 Step 2 |
| R5 / P7 (live #51/#52 in the stored-report scan) | Task 17 Step 5; Task 17b Step 5; Task 20 Step 5; Task 21 Step 5; Task 29 (inputs, Step B); Task 29b |
| R5 / P8 (D-number, release-test, METHODOLOGY-header and CHANGELOG anchors) | Task 23 (METHODOLOGY header); Task 26 (CHANGELOG header at B13); Task 27 (after B4a's D-135); Task 28 (release-test anchors) |
| R5 / P9 (the B4 plan's order note) | Global Constraints, cross-batch (B4b rebases on B5's `interestRunRate`; the B4 plan's owner fixes its `:97`) |
| R5 / P10 (plan line 550) | Task 4 Step 3 (`payload.ts:1190` at B13 is the context note, not the test file) |
| R5 / P11 (SDD briefs void) | Global Constraints (SDD briefs); Part A setup; Part B setup Step 4 |
| R6 (new Task 7b: year-one reinvestment front-loaded to trailing net capex) | Task 7b (new, Part B); Tasks 24b, 25b, 26b, 27b, 28b, 29b and 31b; Global Constraints (cross-batch, guided capex); Self-review |
| R7 (new Task 10b: the ERP fallback refreshed; the fetch to D2) | Task 10b (new, Part B; the 2027-01-15 deadline); Part B setup Step 7; Tasks 24b, 26b, 27b, 28b and 29b; Global Constraints (cross-batch, D2) |
| R8 (e) (BAC's trailing return when only revenue is withheld) | Global Constraints, cross-batch: routed to B6 with the review's rule, test and expected replay |
| R8 VAL-6 (the margin ceiling) | Global Constraints, cross-batch: B5c, its own research-and-decision batch after D1, which reads B5b's Task 7 ceiling rule; OD-7 |

**Review points without a ruling (left for the controller, not applied).** The review's section 2 asks two things no ruling takes. Task 6 should state, with one test, that a year B4a refuses (invested capital unknown) stays "missing", not an operating loss. Task 12's test should call `establishedSalesToCapital` with B4a's lease argument. **Controller ruling (2026-10-29): both are taken.** Task 6 gains the test below its control. Task 12 calls `establishedSalesToCapital` with B4a's third argument, the lease object `{ fcx1Excluded, includeLeasesInEv, currentRowExcludesLease }` (B4a Task 4): B4a changes that signature, so without it Task 12 would not compile. Global Constraints (cross-batch) records that both build on B4a's values.

## Global Constraints

- Failing test first, from the finding's probe (`tmp/audit-2026-10-27/probes/<ID>.probe.ts`), made hermetic: synthetic inputs or SEC-only trimmed data; keep the probe's control case. A finding whose test cannot be made to fail is skipped and said so in the PR.
- Never run the audit probes themselves: several rewrite evidence logs in other agents' folders. Copy their shapes into new tests.
- Tests are hermetic: no live network, no market-data, SEC or AI provider calls, no paid calls, never a report for a real ticker. The `data/evidence/<id>` snapshots under `tmp/` hold FMP rows (reports 43, 48, 49, 50): read them only in the local proof scripts (Tasks 29 and 29b), never in a committed test or fixture. The same holds for the 45-issuer keyless census snapshots (`tmp/metis-audit-2026-10-22/scratch/snapshots/main/<SYMBOL>.json`, shape `{ bundle, stageBConfig }`, SEC and Yahoo data), which Task 29's census replay and threshold backtest read (both parts), and for the AMZN #51 and #52 run inputs the pre-flight read (FMP rows).
- Fixtures: synthetic numbers, or quarter dates and revenues trimmed from SEC filings already saved under `tmp/` (check `docs/DATA-RIGHTS.md`); never FMP data.
- The smallest change that fixes the whole class; no ticker-specific code; no unrelated refactoring.
- One commit per task, staging files by name (never `git add -A` or `git add .`); `tmp/` and `brag-output*/` stay uncommitted.
- Each behaviour change updates `docs/METHODOLOGY.md` (and any README/spec line describing it) in the same commit.
- A change in what a figure, prompt or payload means moves its stamp (REPORT_SPEC_VERSION, PAYLOAD_VERSION, STAGE_B_IMPLEMENTATION_VERSION, plus the method stamps FAIR_VALUE_METHOD_VERSION and SCENARIO_PATHS_METHOD_VERSION where named); a change to a system or pass prompt's text moves PIPELINE_VERSION (decisions spec section 2.15, C-8; Task 20's judge-prompt line); `tests/report.versionStamps.test.ts` and the literal pins Tasks 23 and 23b list move with them (Task 23 for B5a, Task 23b for B5b).
- A payload change moves the golden in `tests/stageC.payload.passes.test.ts` and says why in a dated comment (Tasks 24 and 24b).
- Stored reports are never rewritten (D-67). "Needs reinterpretation" and "display-only" findings get a display-time rule on an immutable view (Tasks 17 and 17b).
- Never weaken a check or loosen a test to make it pass. A rule that withholds more is intended.
- `npm run audit:deltas -- --write --group <name>` only after confirming every changed leaf follows from a task here (Tasks 25 and 25b).
- DECISIONS entries are written as "D-next"; numbers, stamps and the CHANGELOG stamp bullets are renumbered at merge time (parallel batches race for them; "Numbering at merge" below).
- New tracked files must be `git add`ed (at least `git add -N`) before `tests/repository.release.test.ts` passes; register the disposition note and this plan file in its list (Task 28).
- Stage B must not add a `getConfig()` read (`tests/jobRunner.test.ts` pins the count at 4): read config once in `runStageB` and pass values down.
- Code comments cite `docs/METHODOLOGY.md "<heading>"`, DECISIONS numbers or finding ids, never section numbers of retired documents.
- `npm run verify` in foreground chunks (load flakes listed in Task 30); a fresh reviewer over the whole diff (Tasks 31 and 31b); a plain-English PR description (Tasks 32 and 32b).
- AGENTS.md: Task 14 (Part B) touches `src/components/charts/ProjectionFanChart.tsx` (a `"use client"` component) and Task 17 (Part A) touches `src/components/report/ReportView.tsx` (rendered by app routes). Their implementers read `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` and `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md` first, and must not add or move a `"use client"` boundary. No task touches `src/app`, a route handler or the proxy. Tasks 18–21 touch no React component either: the implied terminal margin the live page prints (`src/app/company/[symbol]/page.tsx:643`) changes value only, and that line's label is RPT-501 in B10.
- **Two parts (pre-flight split).** Part A (B5a) is one PR and Part B (B5b) the next. Each has its own stamps, since-version, D-number, golden, deltas group, replay, verify, review and PR. No Part A task depends on a Part B task: Part A reads only `main` (B13 and B4a) and its own exports. Part B reads B5a's exports from `main` after B5a merges: Task 1's `fiscalCalendar.ts` and `TtmIncome.periodStart`/`periodStartBasis`/`days`, and Task 17's `legacyValuationNotes.ts` module.
- **Line numbers (pre-flight P1).** Line numbers in this plan are at `6542531`; re-take each at the branch base (main after B13 and B4a, and after B5a for B5b) before editing. A reference that no longer lands on its construct is a stop.
  - References the pre-flight added are marked "at B13" (`3ca1c6b`) and are re-taken the same way.
  - The review's stale-reference table (below) is the starting point. It maps the 115 ranges (140 plan references) that moved or changed from `6542531` to `3ca1c6b`; its "plan line(s)" column is this file's line before the 2026-10-29 amendment.
  - B4a then edits `valuation.ts` at `:186-232`, `:681-700`, `:724`, `:2128-2175`, `:2208-2220`, `:2288`, `:2340-2346`, `:2394-2416`, `:2665-2695`, `:3389-3450`, `:4230`, `:4275`, `:5477-5640`, `:5650-5715`, `:5807`, `:6146-6182`, `:6229-6265` and `:6340-6355`.
  - It edits `compute.ts` at `:529-557`, `:2159`, `:2527`, `:3261-3263`, `:3278-3285`, `:3368-3384`, `:3646-3673`, `:3880-3906`, `:3925-3926` and `:3966-3968`.
  - It edits `returns.ts` at `:1269-1310`, `:1419-1519`, `:1463-1479` and `:1567`, plus `netDebt.ts:126`, and `scenarioPresentation.ts` at `:155-166` and `:195` (all B13 numbers).
  - So every `valuation.ts` reference from `:194` on, and most `compute.ts` and `returns.ts` references, shift again. The table is re-taken, never trusted.
- **"Before" values (pre-flight P2).** Every "before" value this plan states was measured at `6542531` or B13: the Step 5 benefit checks, Task 29's tables, Task 20's targets, Task 24's comment and the docs text. Each stays only as provenance ("at `6542531`" / "at B13"), never as an assertion. Each is re-taken at the branch base after B4a (after B5a for B5b), and those values go in the tables.
  - B4a's plan (`:527-528`, `:931-934`) expects these moves: #43 sales-to-capital 1.1561 → ≈1.3499 and per share 83.40 → ≈86.38; NVDA #48–#50 2.5825 → ≈2.7093 and 229.52 → ≈230.23; AMZN #51 1.4148 → ≈1.7163 and 116.12 → ≈124.14 (#52 is the same input).
  - Census lessees with complete coverage move the same way, and so do the scenario targets (B4a moves `SCENARIO_TARGET_METHOD_VERSION`).
  - Task 20 asserts its targets and shocks against a run, not a literal.
- **Numbering at merge (pre-flight P3).** Every stamp, since-version and D-number is "next after the preceding merge", and every stamp line, history comment, CHANGELOG line and DECISIONS heading says so; write "D-next" until merge. The values below are the expected ones, re-taken at execution:
  - **After B4a (the B5a base; B4a Task 16):** report 1.50.0, payload 1.52.0, Stage B `STAGE_B_2026_10_ACCOUNTING_EVIDENCE_31`, `FAIR_VALUE_2026_10_D135`, `SCENARIO_TARGETS_2026_10_D135`, `SHARED_SCENARIO_PATHS_2026_10_D99`, PIPELINE `stage-c-1.6.13`, the last DECISIONS entry D-135, and the frozen `BRIDGE_METHOD_SINCE_SPEC_VERSION` "1.50.0".
  - **B5a (Task 23):** report 1.51.0, payload 1.53.0, Stage B `…_32`, D-136, and `ANNUALIZATION_CONVENTION_SPEC` "1.51.0" (frozen). FAIR_VALUE, SHARED_SCENARIO_PATHS and PIPELINE do not move: no B5a task names them.
  - **B5b (Task 23b):** report 1.52.0, payload 1.54.0, Stage B `…_33`, D-137, `FAIR_VALUE_2026_10_D137` and `SHARED_SCENARIO_PATHS_2026_10_D137`, PIPELINE `stage-c-1.6.14`, and `DCF_INPUTS_CONVENTION_SPEC` "1.52.0" (frozen).
  - `SCENARIO_TARGET_METHOD_VERSION` (B4a's `…_D135`) and `SCORE_BANDS_VERSION` move in neither part. Each since-version sits above B4a's `BRIDGE_METHOD_SINCE_SPEC_VERSION` "1.50.0", B13's `EDGAR_DERIVED_LINES_SINCE_SPEC_VERSION` "1.49.0" and B3's `PAYLOAD_RECORD_CORRECTION_SPEC` "1.45.0". If another batch merges first, each value is the next after it.
- **Risk manifest (pre-flight P4).** Every new `src/` file outside `src/pipeline/stageB/` is added, in the commit that creates it, to `RISK_SOURCE_MANIFEST` (`vitest.shared.ts`) and `EXPECTED_RISK_SOURCES` (`tests/risk.coverage.test.ts`).
  - In this plan that is only `src/report/legacyValuationNotes.ts` (Task 17). It is registered after B4a's `src/report/legacyBridgeMethod.ts`, which follows B13's `src/report/legacyEdgarDerivedLines.ts` (`vitest.shared.ts:125`, `tests/risk.coverage.test.ts:112` at B13).
  - Otherwise `tests/risk.coverage.test.ts:364` ("places every source file in the risk manifest, the core include, or the named exemption list") fails; only `src/pipeline/stageB/` and `schema.ts` are core, so `src/pipeline/stageB/fiscalCalendar.ts` needs no entry.
  - Part B adds no file outside `src/pipeline/stageB/`: Task 17b extends the module.
- **Proof harness (pre-flight P5).** The before/after proofs (Tasks 29 and 29b) use B13's and B4a's out-of-repo pattern (`b4-evidence\b13-replay\run.sh`).
  - Scripts and outputs live in `%USERPROFILE%\metis-backups\fix-state\b5-evidence\`. The path is written with `%USERPROFILE%` because `tests/repository.release.test.ts` rejects a home path in this file once Task 28 registers it.
  - `run.sh` `cd`s into the checkout under test and runs `node --conditions=react-server --import tsx <script>.mts`. It sets `METIS_DATA_DIR`/`METIS_DB_PATH` to an empty guard folder (asserted still empty after each run) and uses a dead proxy, with `fetch` stubbed to throw.
  - Inputs are read by absolute path from the main checkout, read-only. Nothing is written into `tmp/audit-2026-10-27/`, the read-only audit record, and no junction ever links it into a worktree: that is what wiped it on 2026-10-28.
  - Each side runs from its own tree, never through vitest's setup: `tests/setup/hermeticEnv.ts` deletes every `METIS_`/`THESIS_` variable, so the guard folder could not be set.
  - No `*.db*` file is opened, and every recursive grep excludes `*.db*`.
  - The pre-flight review's own scripts are the starting point: `%USERPROFILE%\metis-backups\fix-state\b5-preflight\` holds `run.sh`, `replay.mts`, `seasontest.cjs`, `capexfloor.cjs`, `task7margin.cjs` and `analyze.cjs`.
- **Lost evidence (pre-flight P6).** `tmp/audit-2026-10-27/plans/b5-r4-review/r4.review.out.json` is absent; that folder holds only `r4.review.ts` and `vitest.review.config.ts`. Wherever this plan cites it (Task 19 Step 2, Task 20 Step 2, "Review notes (round 4)"), the value is "unverified (evidence lost)". The task's own branch-base run is the evidence, written to `b5-evidence\`. A value from the lost file is never quoted as measured.
- **SDD briefs (pre-flight P11).** `.superpowers/sdd/2026-10-27-audit-fix-05-seasonality-calendars-and-dcf-inputs/task-{1,2,3,17}-brief.md` were generated at `6542531` (each says "HEAD 6542531") and are void. Every brief, in both parts, is regenerated from this amended plan at its part's branch base before its task is dispatched.
- **Cross-batch (pre-flight review section 2; P9; R6-R8).**
  - **B4a.** B5 is cut after B13 (PR #75) and B4a, takes their signatures and stamps, and re-takes every reference. Tasks 6, 7, 7b and 12 read B4a's invested capital and sales-to-capital: `establishedSalesToCapital` with B4a Task 4's lease argument, and `computeRoic` with B4a Task 3's refusal channel. Their tests and Task 29b's rows use B4a's values, not B13's.
  - **B4b** now runs after B5 and rebases on B5's `interestRunRate` (with `days`, Task 1). B5 Task 1 does not wait for B4b Task 11's `ratePct`. The B4 plan's `:97` order note ("B5 … takes B4's signatures, including Task 11's `interestRunRate` return (`ratePct`)") is stale; the B4 plan's owner fixes it, and B4b's stamps there renumber after B5.
  - **R1** (`docs/superpowers/plans/2026-10-29-amzn51-r1-vendor-path-and-grading.md`) runs after B5 and rebuilds `salesToCapitalUsableDates` on B4a Task 4's `establishedSalesToCapital` signature. B5 changes only that function's input rows (Task 12) and their type (Task 7), so R1 is not blocked.
  - **(e) goes to B6 (pre-flight R8).** This is BAC's trailing return when only one window quarter's revenue is withheld. B6 (financial routes) takes it, with the review's section 4(e) as its brief.
    - Rule: extract the earnings part of `ttmIncomeFromNormalized` into `ttmCommonEarningsWindow`, keeping its gates but not the whole-row revenue gate, and read `commonIncomeTtm` from it on financial routes only. TTM revenue stays withheld, with its gap.
    - Test: beside `tests/stageB.ttm.compute.test.ts:1177` (B13).
    - Expected replay: BAC 41.40 → 45.79, TTM ROTE 14.06%; JPM, BRK.B and PGR unchanged.
    - It is not built here; B6's plan owner adds it.
  - **VAL-6 / F-01, the margin ceiling (pre-flight R8), is not B5.** It stays its own research-and-decision batch after D1, renamed **B5c**. B5c reads B5b's Task 7 ceiling rule (OD-7, R3): the ceiling's history reads the normalised rows, and a recurring tag family is not added back.
  - **D2, the free-data batch, gets the ERP fetch (pre-flight R7).** Task 10b refreshes the constant by hand; the monthly fetch and its tests, designed in the review's section 4(d), are D2's.
  - **The data batch gets guided capex parsing (pre-flight R6).** It is the input Task 7b would read once it exists.

### Stale references, `6542531` → `3ca1c6b` (pre-flight P1; the starting point, re-taken at execution)

The table is the pre-flight review's (section 1). A note in parentheses in the "at 3ca1c6b" column marks where B4a also edits the same region; such rows move again after B4a. Its "plan line(s)" column is this file's line before the 2026-10-29 amendment.

| file | plan line(s) before 2026-10-29 | at 6542531 | at 3ca1c6b | shift |
|---|---|---|---|---|
| `docs/audit/DECISIONS.md` | 154 | 500 | 504 | 4 |
| `docs/audit/DECISIONS.md` | 158 | 2083 | 2090 | 7 |
| `docs/audit/DECISIONS.md` | 115 | 2273 | 2282 | 9 |
| `docs/METHODOLOGY.md` | 815 | 255 | 302 | 47 |
| `docs/METHODOLOGY.md` | 707 | 258 | 305 | 47 |
| `docs/METHODOLOGY.md` | 133, 137, 846 | 259 | 306 (row text extended; the vendor-first sentence OD-9 revises is still there) | - |
| `docs/METHODOLOGY.md` | 919, 948 | 389 | 447 | 58 |
| `docs/METHODOLOGY.md` | 511 | 433-458 | 491-516 | 58 |
| `docs/METHODOLOGY.md` | 511 | 436 | 494 | 58 |
| `docs/METHODOLOGY.md` | 384 | 444-452 | 502-510 | 58 |
| `docs/METHODOLOGY.md` | 511 | 456-457 | 514-515 | 58 |
| `docs/METHODOLOGY.md` | 511 | 460-473 | 518-531 | 58 |
| `docs/METHODOLOGY.md` | 313 | 477-484 | 535-542 | 58 |
| `docs/METHODOLOGY.md` | 511 | 486-489 | 544-547 | 58 |
| `docs/METHODOLOGY.md` | 511 | 537 | 595 | 58 |
| `docs/METHODOLOGY.md` | 707 | 584-597 | 642-655 | 58 |
| `docs/METHODOLOGY.md` | 1299 | 599-611 | 657-669 | 58 |
| `docs/METHODOLOGY.md` | 707 | 680-690 | 791-801 | 111 |
| `docs/METHODOLOGY.md` | 634 | 684-687 | 795-798 | 111 |
| `docs/METHODOLOGY.md` | 919, 1867 | 1157-1159 | 1301-1303 | 144 |
| `docs/METHODOLOGY.md` | 154 | 2120-2122 | 2280-2282 | 160 |
| `docs/METHODOLOGY.md` | 145, 1238 | 2126-2129 | 2286-2289 | 160 |
| `docs/METHODOLOGY.md` | 1144 | 2187 | 2347 | 160 |
| `docs/METHODOLOGY.md` | 313 | 2194-2199 | 2354-2359 | 160 |
| `docs/METHODOLOGY.md` | 995 | 2206-2207 | 2366-2367 | 160 |
| `docs/METHODOLOGY.md` | 1365 | 2224 | 2384 | 160 |
| `docs/METHODOLOGY.md` | 313 | 2235 | 2395 | 160 |
| `docs/METHODOLOGY.md` | 1420 | 2280-2284 | 2440-2444 | 160 |
| `docs/METHODOLOGY.md` | 518, 552 | 2327-2330 | 2487-2490 | 160 |
| `docs/METHODOLOGY.md` | 1238 | 2829 | 3297 | 468 |
| `docs/METHODOLOGY.md` | 511 | 3090-3100 | 3571-3581 | 481 |
| `docs/METHODOLOGY.md` | 707, 1299 | 3138-3146 | 3619-3627 | 481 |
| `docs/METHODOLOGY.md` | 634 | 3200-3205 | 3681-3686 | 481 |
| `docs/METHODOLOGY.md` | (Task 23 omits) | 6-7 header stamps | 6-7 (names 1.49.0 / 1.51.0 / `_30`; B4a edits) | - |
| `CHANGELOG.md` | 1467 | 9-10 quoted as 1.44.0 / 1.48.0 | 9-10 says 1.49.0 / 1.51.0 | - |
| `src/app/company/[symbol]/page.tsx` | 38 | 643 | 644 | 1 |
| `src/components/report/ReportView.tsx` | 1077 | 183 | 185 (chain is now four views deep; B4a adds a fifth) | - |
| `src/pipeline/compute.ts` | 199 | 1157-1290 | 1161-1294 | 4 |
| `src/pipeline/compute.ts` | 1860 | 1157-1200 | 1161-1204 | 4 |
| `src/pipeline/compute.ts` | 641 | 1674-1707 | 1678-1711 | 4 |
| `src/pipeline/compute.ts` | 559 | 2210-2225 | 2229-2244 | 19 |
| `src/pipeline/compute.ts` | 853 | 2514-2538 | 2533-2557 (B4a edits `:2527`) | 19 |
| `src/pipeline/compute.ts` | 957 | 2526-2538 | 2545-2557 (B4a edits `:2527`) | 19 |
| `src/pipeline/compute.ts` | 1860 | 2562-2587 | 2581-2606 | 19 |
| `src/pipeline/compute.ts` | 312, 1508, 1542, 1871 | 2577 | 2596 | 19 |
| `src/pipeline/compute.ts` | 199 | 2578-2587 | 2597-2606 | 19 |
| `src/pipeline/compute.ts` | 1042 | 2636-2649 | 2655-2668 | 19 |
| `src/pipeline/compute.ts` | 641 | 2917-2966 | 2936-2985 | 19 |
| `src/pipeline/compute.ts` | 650, 1668 | 2945-2963 | 2964-2982 | 19 |
| `src/pipeline/compute.ts` | 821 | 2989-2993 | 3008-3012 | 19 |
| `src/pipeline/compute.ts` | 792 | 2995-3047 | 3014-3069 | 19 |
| `src/pipeline/compute.ts` | 641 | 3013-3016 | 3032-3035 | 19 |
| `src/pipeline/compute.ts` | 717 | 3020 | 3040 | 20 |
| `src/pipeline/compute.ts` | 821 | 3029-3036 | 3051-3058 | 22 |
| `src/pipeline/compute.ts` | 392 | 3202-3219 | 3227-3244 | 25 |
| `src/pipeline/compute.ts` | 1860 | 3225-3262 | 3250-3287 (B4a edits `:3261-3263`) | 25 |
| `src/pipeline/compute.ts` | 199 | 3310-3329 | 3335-3354 | 25 |
| `src/pipeline/compute.ts` | 641, 853 | 3334-3341 | 3359-3366 | 25 |
| `src/pipeline/compute.ts` | 199, 392, 1654 | 3361-3391 | 3386-3416 (`dcfQuarterRevenue` at `:3404`; B4a edits `:3368-3384` just above) | 25 |
| `src/pipeline/compute.ts` | 321 | 3443-3528 | 3468-3553 (B4a passes `evIncludeLeases` into the same `dcfInputs`) | 25 |
| `src/pipeline/compute.ts` | 604, 641 | 3501-3513 | 3526-3538 | 25 |
| `src/pipeline/compute.ts` | 1860 | 3790-3830 | 3816-3856 | 26 |
| `src/pipeline/compute.ts` | 1877 | 3816-3817 | 3842-3843 | 26 |
| `src/pipeline/filingDisclosures.ts` | 391 | 270-305 | 272-307 | 2 |
| `src/pipeline/filingDisclosures.ts` | 391 | 346 | 348 | 2 |
| `src/pipeline/jobRunner.ts` | 1429, 1734 | 527 | 531 (value "stage-c-1.6.13") | - |
| `src/pipeline/runInputSnapshot.ts` | 1429 | 30 | 33 (value `_30`) | - |
| `src/pipeline/stageB/currentCapital.ts` | 566 | 31 | 38 | 7 |
| `src/pipeline/stageB/currentCapital.ts` | 558 | 84-93 | 108-117 | 24 |
| `src/pipeline/stageB/currentCapital.ts` | 558 | 96-136 | 120-160 | 24 |
| `src/pipeline/stageB/fairValue.ts` | 1041 | 65-111 | 80-126 | 15 |
| `src/pipeline/stageB/returns.ts` | 713 | 598-657 | 610-671 | 12 |
| `src/pipeline/stageB/returns.ts` | 713 | 672-685 | 686-699 | 14 |
| `src/pipeline/stageB/returns.ts` | 713 | 687-745 | 701-759 | 14 |
| `src/pipeline/stageB/returns.ts` | 755 | 700-717 | 714-731 | 14 |
| `src/pipeline/stageB/returns.ts` | 713 | 763-768 | 777-782 | 14 |
| `src/pipeline/stageB/returns.ts` | 755 | 776-781 | 790-795 | 14 |
| `src/pipeline/stageB/returns.ts` | 642 | 795-813 | 809-827 | 14 |
| `src/pipeline/stageB/returns.ts` | 755 | 795-833 | 809-847 | 14 |
| `src/pipeline/stageB/returns.ts` | 713 | 841-846 | 855-860 | 14 |
| `src/pipeline/stageB/returns.ts` | 793 | 1019-1024 | 1035-1040 | 16 |
| `src/pipeline/stageB/returns.ts` | 602, 642 | 1718-1808 | 1753-1858 (computeRoic grew R0's refusal channel; B4a edits `:1419-1519`, `:1463-1479` and `:1567`) | 35 |
| `src/pipeline/stageB/returns.ts` | (item d) | ERP_FALLBACK | 125-132 (4.18%, 2026-07-01, "semiannual", 210 days) | - |
| `src/pipeline/stageB/valuation.ts` | 1877 | 5333-5381 | 5350-5398 (B4a edits `:5477-5715` below) | 17 |
| `src/pipeline/stageB/valuation.ts` | all refs from 194 on | unchanged at B13 | move after B4a (P1) | - |
| `src/pipeline/stageC/dataOnlyReport.ts` | 926 | 372-373 | 373-374 | 1 |
| `src/pipeline/stageC/dataOnlyReport.ts` | 1154 | 570-571 | 571-572 | 1 |
| `src/pipeline/stageC/payload.ts` | 1429 | 421 | 433 (value 1.51.0) | - |
| `src/pipeline/stageC/payload.ts` | 926 | 663 | 704 | 41 |
| `src/pipeline/stageC/payload.ts` | 926 | 701-702 | 742-743 | 41 |
| `src/pipeline/stageC/payload.ts` | 560 | 964-985 | 1012-1033 | 48 |
| `src/pipeline/stageC/payload.ts` | 517 | 1032-1046 | 1087-1101 | 55 |
| `src/pipeline/stageC/payload.ts` | 523 | 1040 | 1095 | 55 |
| `src/pipeline/stageC/payload.ts` | 517 | 1134-1136 | 1189-1191 | 55 |
| `src/pipeline/stageC/payload.ts` | 550 (written beside the test file) | 1135 | 1190 | 55 |
| `src/pipeline/stageC/payload.ts` | 525 | 2564 | 2946 | 382 |
| `src/pipeline/stageC/prompts.ts` | 1310 | 573 | 577 | 4 |
| `src/report/export/auditMarkdown.ts` | 1077 | 461 | 463 (four views) | - |
| `src/report/export/markdown.ts` | 1417 | 611 | 613 | 2 |
| `src/report/export/markdown.ts` | 1077 | 950 | 952 (four views) | - |
| `src/report/export/printHtml.ts` | 1417 | 546 | 548 | 2 |
| `src/report/export/printHtml.ts` | 1077 | 764 | 766 (four views) | - |
| `src/report/legacyEntitySafety.ts` | 1860 | 38-90 | 40-92 | 2 |
| `src/report/legacyEntitySafety.ts` | 1077 | 71 | 73 (four views) | - |
| `src/report/scenarioPresentation.ts` | 1373 | 197-201 | 197-199 the floor line (B4a edits `:195` and `:155-166`) | 0 |
| `src/report/schema.ts` | 1429 | 139 | 144 (value 1.49.0) | - |
| `src/report/schema.ts` | 1309 | 1973-1981 | 1986-1994 | 13 |
| `tests/fixtures/audit-intended-deltas.json` | 1460 | 8967 | 8894 | -73 |
| `tests/jobRunner.test.ts` | 1432, 1437 | 6197 | 6350 (pins "1.49.0") | - |
| `tests/jobRunner.test.ts` | 1432, 1437, 1724, 1734, 1806 | 6204 | 6357 (pins "stage-c-1.6.13") | - |
| `tests/report.versionStamps.test.ts` | 1429 | 88-98 | 114-128 | - |
| `tests/report.versionStamps.test.ts` | 1429 | 102 | 133 | - |
| `tests/report.versionStamps.test.ts` | 1429 | 110 | 141 | 31 |
| `tests/repository.release.test.ts` | 1481 | 96 | 97 (B13 note at 98) | 1 |
| `tests/repository.release.test.ts` | 1481 | 124 (plans) | the audit-fix plans group is 126-133 | - |
| `tests/risk.coverage.test.ts` / `vitest.shared.ts` | (Task 17 omits) | — | 112 / 125 (`legacyEdgarDerivedLines.ts`); add the new module after B4a's | - |
| `tests/stageC.payload.passes.test.ts` | 382 | 148-300 | 157-309 (only the insider rows changed; statements and estimates unchanged) | 9 |
| `tests/stageC.payload.passes.test.ts` | 1447 | 623-645 | 636-658 | 13 |
| `tests/stageC.payload.passes.test.ts` | 1435 | 630-632 | 643-645 | 13 |
| `tests/stageC.payload.passes.test.ts` | 1435 | 634-635 | 647-648 (with SCENARIO_TARGETS at 646; B4a rewrites two) | 13 |
| `tests/stageC.payload.passes.test.ts` | 1435, 1447 | 1209 | 1410 (pins "1.51.0") | - |
| `tests/stageC.payload.passes.test.ts` | 1435, 1447 | 2738 | 2939 (pins "1.49.0") | - |
| `tmp/audit-2026-10-27/plans/b5-r4-review/r4.review.out.json` | 1361 | cited | absent | - |

## Owner decisions

The owner delegated these calls ("Use your recommendation based on research to make this a professional accurate repository"). Each is taken here, with the recorded decision it revises. Sources were read on 2026-10-27; quotes are short excerpts.

### OD-1. Annualising a quarter: season and week count (FIN-101, FIN-301, FIN-301-V1, FIN-101-V2, FIN-301-V2; revises D-58, D-60 choice 3 and D-98 "guided quarters"; decision 1 amended by pre-flight R1, points 6 and 7 added by R2 and R4)

**Question.** Guided quarter × 4 sets the year-one level and the consensus-consistency floor (D-60), the run-rate takes latest quarter × 4 as its upper bound (D-58), and no rate reads a quarter's length. Should the house length-scale, use the trailing twelve months, or withhold; when does consensus count as consistent; is a 53-week TTM normalised; does stored MU #46 get a note?

**Decision.**
1. *Guidance sets year one from the guided quarter taken out of its own season (pre-flight R1).* Year one = carry(4 × Q_g × f_G ÷ s_g, 4.5/12, g). This is main's carry of the guided quarter × 4 (`valuation.ts:1504` at B13: `raw = carry(4 * guide.revenue, GUIDED_QUARTER_TO_YEAR_ONE_YEARS, rate)`), run at the guided year-over-year pace g = Q_g·f_G ÷ (YA_g·f_YA) − 1. The guided quarter Q_g is first divided by s_g, its growth-adjusted seasonal share. YA_g is the same fiscal quarter a year earlier, and each f is Task 1's 13-week factor for its quarter.
   - s_g = (YA_g ÷ TTM ending YA_g) ÷ (ρ³ ÷ (1 + ρ + ρ² + ρ³)), with ρ = (TTM ending YA_g ÷ the TTM a year earlier)^(1/4): the year-ago quarter's share of its own trailing year, divided by the share constant growth would give it.
   - s_g is the mean of up to three such yearly factors for the same fiscal quarter (the pre-flight measured one), every quarter on Task 1's 13-week basis.
   - Under constant growth and a stable season the level equals TTM × (1 + g) to within 4ρ^1.5 ÷ (1 + ρ + ρ² + ρ³): 0.999 at +11% a year, 0.985 at +87%. It starts from the guided quarter, which already shows any deceleration, so it does not import last year's sequential acceleration into year one (alternative (e)). The growth adjustment removes exactly what made the share-of-fiscal-year factor fail (alternative (a)), and a peak-quarter guide's season comes out, which is FIN-101's intent.
   - *Fallback.* When fewer than eight contiguous quarters end at YA_g, year one is the trailing twelve months carried twelve months at the guided pace, TTM × (1 + g), both quarters on a 13-week basis. That is D-58's own run-rate construction (TTM carried at a year-over-year rate, which has no seasonal component) applied to the guided quarter, and this decision's first-planned rule.
   - *Evidence.* `evidence.guidedRunRate` is 4 × Q_g × f_G ÷ s_g, a seasonally adjusted run-rate at the guided quarter (in the fallback, TTM × (1 + g)^(7.5/12)). A new `evidence.guidedSeasonalFactor` carries s_g (null in the fallback). No unadjusted guided × 4 remains.
2. *Consensus is consistent with the outlook when it is at least the twelve-month floor the outlook implies:* the guided quarter at its low end plus the window's other three quarters at their year-ago level (or, when the guide itself is a year-over-year decline, at the guided low pace): floor = low + (TTM − guided year-ago quarter) × min(1, low ÷ guided year-ago quarter). Twelve months against twelve months, on the issuer's own fiscal quarters, with no season in either side. This floor and the broken-input guard are unchanged by the pre-flight (R1).
3. *Without the same quarter a year earlier, guidance does not set a level* (the D-98 sequential fallback is retired, and so is the HEAD path that carried guidance × 4 at the near-term rate when no latest quarter existed). The sequential pace stays as evidence only, on a 13-week basis, labelled as carrying the season, and no longer widens the broken-input guard. Year one then comes from consensus or the run-rate, and the basis says why guidance was not used. On an annual base period (no TTM), compute.ts now supplies the guided year-ago quarter under the same 350–380-day and currency rules (Task 3), so guidance over an annual base keeps a twelve-month basis instead of silently losing its level.
4. *Week counts:* a quarter of exactly w ≠ 13 weeks (12-, 14-, 16- or 17-week quarters: 84, 98, 112 or 119 days; a length that is not a whole number of weeks is not rescaled, Task 1) is put on a 13-week basis (× 13/w) wherever it is annualised or compared year over year: the run-rate, the guided pace, the sequential pace, the comparability guard's quarter range × 4 (Task 3) and the D-65 interest run-rate (`interestRunRate`, the quarter × 4 or its effective rate × 4; FIN-301's own fix sketch names it; Task 1). A TTM or annual base period of 53 weeks is put on a 52-week basis (× 52/53) as the DCF start revenue and operating income (the margin is unchanged). Calendar quarters (90–92 days, 13 weeks after rounding) are untouched. Lengths come from the filed period start, else the gap to the previous quarter end; a length that cannot be established is read as 13 weeks and the basis says so. A guided fourth quarter takes its length from the issuer's weekday fiscal-year rule (OD-1a, Task 2).
5. *Stored reports* (D-67): MU #46 and every stored report whose run-rate took a non-13-week quarter × 4, or whose year one is "model extrapolation of quarterly guidance … × 4", or whose anchor basis tested consensus against the guided quarter × 4 (pre-flight R2), get a display-time note (Task 17); bytes unchanged.
6. *Reverse-DCF context and thesis trigger (pre-flight R2; Task 4).* The reverse-DCF context sends only the like-for-like guided pace, "guided-quarter revenue growth, year over year" (g: 10.73% for AMZN #52, 199.5B over 180.17B), with the issuer's caveats (point 7). It sends no run-rate or sequential row, because a level at the guided quarter is not a twelve-month growth. That is the defect behind live #52's "management's Q3 FY2026 guidance annualized at 2.9%". Its row "guided run-rate growth over TTM (next-quarter guidance × 4)" was 798 / 775.68 − 1 = 2.88%. That figure is the 10.73% like-for-like pace, cut to 6.58% on the run-rate's 7.5-month horizon (1.1073^0.625 − 1), less 3.70pp of the Prime Day shift magnified × 4. The first-planned row, "guided run-rate growth over TTM (TTM at the guided year-over-year pace)", would still have given 6.58%. The old ids keep their D-67 labels. The thesis trigger's year-one window line (`thesisTriggers.ts:70`) never prints a level dated at the guided quarter.
7. *Calendar-shifted events (pre-flight R4; Task 3b): disclosed, and no figure moves.* The guided-quarter growth row carries the outlook caveats of the release that issued the guide. The latest-quarter year-over-year row carries those of the earlier release whose guided period is the latest reported quarter, the pairing `disclosures.guidanceChecks` already makes. A caveat that quantifies an ex-item effect ("excluding X, … year-over-year growth would be N basis points higher|lower") also sets `evidence.guidedYoyIssuerEffectPp`, and the anchor basis states it; year one uses the reported guidance. A regex miss keeps today's behaviour. The issuer's ex-event pace does not move the level. An "excluding X" sentence covers timing items, but also persistent ones (FX, a divestiture), and adding the latter back would overstate year one. So it first needs a timing-versus-persistent classifier, routed to R2 or a later batch. The option's size, measured on AMZN keyless, is 869.44B / 105.95 (+7.22% against main), within 0.8% of the keyed consensus 876.36B; the disposition note records it (Task 28).

**Alternatives rejected.** (a) Divide the guided quarter by its share of the last fiscal year (the finding's first sketch): the share mixes growth into the season, so a fast grower's fourth quarter (NVDA FY2026: 31.5% of the year, mostly growth) would be read as a seasonal peak and understated by about a fifth. The amended decision 1 divides by a growth-adjusted share, which removes exactly that growth (pre-flight R1). (b) Compare consensus's own guided quarter with the guide: exact only when the guided quarter is the fiscal year's last; otherwise it depends on how the remaining fiscal year is split. On NVDA-shaped inputs (FY2027 consensus less the reported half, split by the FY2026 quarterly shape, against a 108B guide at ±2%) the split lands within a fraction of a percent of the guided low end, so the headline anchor would flip on a calendarization artifact. (c) Keep × 4 and withhold whenever the issuer is seasonal: needs a seasonality test the data cannot give from one year, and still mis-scales 14-week quarters. (d) 364/days scaling for every quarter: moves every calendar-quarter issuer by ±1% for no gain. (e) *Task 3 as first planned (pre-flight R1): year one = TTM × (1 + g) whenever a guided year-ago quarter exists.* It applies the guided quarter's year-over-year pace to all four year-ago quarters, so for a decelerating grower it imports last year's sequential acceleration into year one. The pre-flight measured it offline at B13 by scaling the admitted guide so main's level formula hit the rule's target (guidance-branch runs only).
   - Census NVDA keyless is a guidance issuer with no material season (growth-adjusted factor s = 1.019 for its guided quarter). Its year-over-year growth decelerates into the guided quarter: 105.85% in the latest quarter, 89.45% guided, with sequential growth falling from about 19% to 12.3%. The rule takes its year one from 548.97B (81.20%) to 573.99B (89.45%) and its per share from 434.00 to 515.94 (+18.88%). That is 9.0% above the keyed consensus year one of 526.40B (#48–#50), against main's 4.3%: a published figure worse than main for a realistic filer.
   - Census AMZN keyless moves 829.09B / 98.81 → 858.91B / 104.00 (+5.25%), and AMZN #43 829.09B / 83.40 → 858.91B / 86.53 (+3.75%).
   - The amended rule gives NVDA 538.57B / 403.46, 2.3% above consensus and so better than main; AMZN keyless 828.03B / 98.64; #43 828.03B / 83.30.
   - The consensus-anchored runs (AMZN #51/#52, NVDA #48–#50) move under neither rule: the new floors, 792.51B and 351.80B, sit below consensus, as the old 788.00B and 423.36B did.
   - The rule is kept only as the fallback below eight quarters.

**Trade-off stated.** The new floor is looser than D-60's × 4 for a fast grower: a stale consensus that still implies year-over-year growth is no longer rejected. It is exact about the season both ways (AMZN's October guide no longer overrides a consensus that holds the guided quarter at the midpoint; its January guide no longer passes a consensus below last year's level). The D-58 run-rate keeps its [TTM, latest quarter × 4 on a 13-week basis] bound: at a seasonal trough a growing issuer's seasonally neutral run-rate is capped at the TTM (understated by at most (1 + YoY)^0.375 − 1, 3.6% at +10%), which is conservative and is the IAS 34.21 twelve-month view; the bound is not removed because for a fast, decelerating grower it is what stops the 4.5-month YoY carry overshooting the latest observed level (MU #46: 233.1B neutral against 201.4B observed). The amended level has its own weak shapes (pre-flight R1). A guidance issuer whose year-ago window holds a one-off quarter (an acquisition closing, a commodity spike) reads it as season; averaging up to three yearly factors limits this. A calendar-shifted event sits inside the year's factor, which point 7 discloses. Keyed bundles with fewer than eleven quarters (eight ending at the year-ago quarter) fall back to TTM × (1 + g).

**Sources.**
- Hyndman and Athanasopoulos, *Forecasting: Principles and Practice* (3rd ed.), "Some simple forecasting methods", https://otexts.com/fpp3/simple-methods.html (fetched 2026-10-27): the seasonal naïve method sets "each forecast to be equal to the last observed value from the same season". Year one's fallback, TTM × guided YoY, is the seasonal naïve forecast of each quarter scaled by the guided quarter's growth; the main rule divides the guided quarter by its own growth-adjusted share first.
- IAS 34.21 (summary at https://www.iasplus.com/standard/ias34.htm; that page did not render for the reviewer on 2026-10-27, and the passage was confirmed from published copies of the standard found by search): for a highly seasonal business, financial information for the twelve months up to the end of the interim period, with comparatives, may be useful, i.e. the trailing twelve months, not one quarter, is the full-year view.
- The Home Depot 10-K for fiscal 2025, https://www.sec.gov/Archives/edgar/data/354950/000162828026019436/hd-20260201.htm (fetched 2026-10-27), "Commonly Used or Defined Terms": fiscal 2024 is "Fiscal year ended February 2, 2025 (includes 53 weeks)", and its guidance compares sales "for the comparable 52-week period" (https://ir.homedepot.com/%7E/media/Files/H/HomeDepot-IR/press-release/reaffirms-fiscal-2025-guidance-press-release.pdf, not re-fetched). Issuers themselves put a 53-week year on a 52-week basis.
- Silicon Graphics International 10-Q, https://www.sec.gov/Archives/edgar/data/0001316625/000131662513000021/a10q2013q3.htm (fetched 2026-10-27): "When a 53-week year occurs, the Company includes the additional week in the first fiscal quarter." The extra week is not always in Q4, so a length must come from the filed period, not an assumption.

#### OD-1a. Weekday fiscal-year rule for future year ends (FIN-301-V3, and the guided quarter's length in FIN-301-V1; no recorded decision revised; D-99 finding 19 windows unchanged)

**Decision.** When the issuer's consecutive annual period ends (every filed end chained 364 or 371 days apart, newest first, at least three) all follow exactly one of the two weekday rules ("last <weekday> of <month>" or "<weekday> nearest the last day of <month>"), the vendor's future fiscal-year estimate dates within 10 days of that rule's year end are moved to it before calendarization, and a guided fourth quarter ends on the rule's year end (98 days for a 53-week year). When the ends fit both rules (every end within the last three days of the month, so the two rules can disagree on a future year) or neither, or the newest annual end breaks the chain (a fiscal-year change), no rule applies, dates are kept, and the basis says window boundaries are approximate by up to a week.

**Alternatives rejected.** (a) Keep the vendor's dates (today): NVDA's FY2027 estimate is dated 2027-01-25, six days before the year end the filings imply (2027-01-31), so the window takes six days too much of the larger FY2028 and year one carries about 1.7% more revenue than the filed calendar gives (531.14B against 522.07B in Task 2's test) for a dating artifact. (b) Snap every future date to a month end: wrong for every 52/53-week issuer, whose year ends drift through a week. (c) Snap without requiring three filed year ends on one rule: a fiscal-year change would be snapped onto the old calendar. (d) Pick one rule when both fit: the two rules give different dates seven days apart in some years, so a guess could move the boundary the wrong way.

**Sources.** 26 CFR 1.441-2(a)(1), https://www.law.cornell.edu/cfr/text/26/1.441-2 (fetched 2026-10-27): a 52-53-week year "Ends always on the same day of the week" and ends on "Whatever date this same day of the week last occurs in a calendar month" or "Whatever date this same day of the week falls that is the nearest to the last day of the calendar month" — exactly the two rules above. Chart House 10-K, https://www.sec.gov/Archives/edgar/data/0000820757/000095013101500098/dex13.txt (fetched 2026-10-27): quarters end on "the last specified day in the quarter, or a specified day closest to the calendar quarter end". NVDA's own filing in the report-50 snapshot states "Fiscal year 2027 will be a 53-week year with the fourth quarter consisting of 14 weeks".

### OD-2. An operating-loss year in the terminal excess-return rule (FIN-102; revises D-99 "loss-year ROIC": "An operating loss still leaves the year out")

**Decision.** For the FCFF terminal every-year rule only, a fiscal year with operating income at or below zero counts as a below-WACC year: its return is operating income ÷ average invested capital at a 0% tax rate, printed in the terminal note as "operating loss". The reported ROIC series, the moat grade and the D-99 floor label are unchanged (they keep leaving the year out), so no graded score moves.

**Alternatives rejected.** Keep D-99 (an issuer that lost money earns a +5pp perpetual carry a thinly profitable twin is denied: probe +8.7% per share); report a negative ROIC everywhere (moves the moat grade and the ROIC floor, outside this batch's scope).

**Sources.** Damodaran, "Answer to Question 3", https://pages.stern.nyu.edu/~adamodar/New_Home_Page/valquestions/a3.htm (fetched 2026-10-27): "In the year of the operating loss, the tax rate used in computing the after-tax operating income … should be zero." NOPAT is then the operating loss itself, below any positive WACC.

### OD-3. A fiscal-year-change stub in the annual series (FIN-111; revises the 2026-09-06 F109 rule, commit 782a853, "compounded over its real span")

**Decision.** An annual income or cash-flow row whose period is under 357 days (51 weeks; filed period start, else the gap to the next-older row) is a transition period, not a fiscal year. It is left out of every annual flow use (revenue, EPS and FCF CAGRs, the log-linear fit, the latest YoY, the DCF history with the issuer's sales-to-capital, the scenario history and the ROIC series) with a `growth.incomeStatement.transitionPeriod` warn gap naming it. Display margins (ratios) in the growth section keep it. `latestYoyPct` also needs a span of at least 0.75 year. No live FMP check is run (none is allowed); the rule fails closed whatever the vendor serves.

**The line, and the gate that sets it (decisions spec 4.5, O-2, binding).** The first draft's line was 0.9 year (under 329 days). 4.5 raises it to under 357 days, provided the backtest finds no census fiscal year below 357 days; if one is found, the line stays at 329 days and the result is recorded. The gate is Task 29 Step D check 1a. It runs as Task 12 Step 0, before Task 12's test is written, because its result fixes the literal Task 12 codes and tests. The reviewer's read-only pre-scan (2026-10-28) found no fiscal year under 357 days among the census's 434 filed-start income rows, 2 gap-measured income rows, 393 gap-measured cash-flow rows and 779 annual-form companyfacts periods, nor among the five keyed snapshots' annual rows. Every one is 364 to 371 days, and no 10-KT is filed. So the gate is expected to pass and this plan is written at 357. OD-3, Task 12's interface and tests, and METHODOLOGY's sentence change together (4.5); on a failed gate all three read 329.

**Alternatives rejected.** (a) Keep F109's compounding: a six-month flow set against a twelve-month flow measures duration, not growth (probe: −69.48% "latest YoY", a +118.75% graded CAGR). (b) Keep the 0.9-year (329-day) line: a transition period of 329 to 356 days (about 10.8 to 11.7 months) would pass as a fiscal year. 17 CFR 240.13a-10 allows a transition period of up to just under twelve months, and Regulation S-X Rule 3-06 lets nine to twelve months of statements stand for a year after a fiscal-year change, so such a period can sit in the annual series. The gate shows the wider line costs no census year. (c) Under 364 days (52 weeks), one day below the shortest fiscal year: this leaves no slack for a vendor year-end date a few days off, which the gap measure reads directly (NVDA's vendor estimate date sits six days off its year end, OD-1a). 357 days keeps one week of slack below the 52-week floor.

**Scope of the class.** A transition period's revenue and operating income are flows; every annual use that divides or compounds a flow treats the row as a year. So the row is withheld from every annual flow use, not only growth: the growth CAGRs, fit and latest YoY (`computeGrowth`), the projection and scenario history (`projNorm`), the DCF history (`dcfIncomeHistory`: its revenue feeds the issuer's own sales-to-capital, `establishedSalesToCapital`, and the margin fade's dated slope) and the ROIC series (`computeRoic`: a six-month NOPAT over a year-end invested capital reads as half a return, which the terminal every-year rule and the moat floor would count). Display margins in the growth section keep it (ratios of one period).

**Sources.** 17 CFR 240.13a-10, https://www.law.cornell.edu/cfr/text/17/240.13a-10 (fetched 2026-10-27): an issuer that changes its fiscal year "shall file a report covering the resulting transition period"; "In no event shall the transition report cover a period of 12 or more months"; if the transition period "covers a period of less than six months", "a report may be filed for the transition period on Form 10-Q". A transition period is its own short period, not a fiscal year. 17 CFR 210.3-06 (Regulation S-X Rule 3-06), https://www.law.cornell.edu/cfr/text/17/210.3-06 (fetched 2026-10-28): "Financial statements covering a period of nine to twelve months" satisfy a requirement for one year where "(1) The issuer has changed its fiscal year". So a period of nine to twelve months can stand in a filed annual series. 26 CFR 1.441-2(a)(1), https://www.law.cornell.edu/cfr/text/26/1.441-2 (fetched 2026-10-28): a 52-53-week fiscal year "Varies from 52 to 53 weeks", so no fiscal year is shorter than 364 days, and a calendar-month fiscal year is 365 or 366. Decisions spec 4.5, O-2 (binding): "raise the stub line to 'under 357 days', provided B5 Task 29 Step D's backtest shows no census year below 357 days".

### OD-4. New borrower and repaid debt (FIN-116; extends D-60 "Debt weight uses the latest balance the bridge nets; the effective cost of debt keeps the average"; C-1 not revised)

**Decision.** When a latest balance is supplied, the debt leg exists exactly when that balance is above zero. A positive latest balance over a zero average has no effective rate to measure (the interest window held no debt), so the effective rate is not established: the synthetic rating prices it when positive interest exists, otherwise the existing critical `returns.wacc.interestExpense` gap withholds the WACC (fail closed). The de-minimis test ("debt < 1% of total assets — effective Rd treated as noise") reads the average, so it runs only when the average is above zero; it is not printed for a new borrower whose latest balance is large. A zero latest balance over a positive average gives a debt weight of 0, and the interest and tax-shield gaps become info, because nothing consumes them.

**Alternatives rejected.** Divide interest by the latest balance (understates the rate of debt held for part of the year); publish the all-equity WACC (the bridge nets the debt the WACC ignores).

**Sources.** Damodaran, cost of capital session slides, https://pages.stern.nyu.edu/~adamodar/pdfiles/valonlineslides/session6.pdf (fetched and text-extracted 2026-10-27): "Weights should be market value weights". D-60 already chose the latest balance, the one the EV bridge nets, as the market-value proxy, so the debt leg must follow it.

### OD-5. Projection history labels (FIN-127; no recorded decision revised; D-113's sort-by-period-end stays)

**Decision.** Each historical projection point is labelled with its statement row's own fiscal year (`FY<fiscalYear>`, the issuer's naming, as the valuation period text and the payload's `issuerFiscalLabel` already do). When no four-digit fiscal year is carried, or two historical rows would share a label, both take the dated form `FY ending <YYYY-MM-DD>`, which the D-113 sort key already orders by date. One more case takes the dated form for every history row of the series: the forward periods are on the fiscal-year basis (`forecastYearPeriod` labels them `FY<end year> ending <date>`, the calendar year of the end) and some history row's issuer fiscal year differs from its end year (a start-year-named issuer such as Home Depot). Without this the fan would read FY2024, FY2025 and then FY2027 for the issuer's fiscal 2026, a gap the old end-year labels did not have. The forward label convention itself (`forecastYearPeriod`, D-65) is not changed in this batch; it is recorded as a residual for the owner.

**Alternatives rejected.** Calendar year of the period end (today: drops two plotted actuals for early-January year ends and labels Home Depot's fiscal 2025 as FY2026); dated labels everywhere (long ticks, and the rest of the report says FY2025); relabel the forward fiscal-year windows by the issuer's naming (touches every consensus-path, assumption and payload label that `forecastYearPeriod` writes; outside FIN-127's scope).

**Sources.** Home Depot 10-K, https://www.sec.gov/Archives/edgar/data/354950/000162828026019436/hd-20260201.htm (fetched 2026-10-27), "Commonly Used or Defined Terms": fiscal 2025 is "Fiscal year ended February 1, 2026 (includes 52 weeks)". Issuers name fiscal years by their own convention; the label must follow the filing. The fundamentals charts (`src/components/charts/format.ts:139`, `fiscalYear()`) print the bare end year ("2026"), a date, not a fiscal-year name, so they do not contradict an `FY2025` fan label; they are left unchanged.

### OD-6. Members named in the degraded-inputs note (FIN-118; amends the D-111 F-13 member list, not its rule)

**Decision.** D-111 says the note names a substitution of "a statement, the quote or prices the value reads". The market-cap history and enterprise values never feed the fair value, so they join the sector ETF and the float as not named; the SPY and daily prices are named only when the WACC beta is the keyless profile regression on them. The run-level "Provider fallback" line (F-1) still names every substitution. This restores D-111's own scope (`docs/audit/DECISIONS.md`, D-111, "the degraded-inputs note").

**Alternatives rejected.** (a) Keep naming every substitution in the fair-value note (today): the note then tells the reader the value rests on inputs it never reads, and repeats F-1's run-level line. (b) Name SPY and daily prices always: on a vendor-beta run they feed nothing the value reads.

**Sources.** The primary authority is D-111's own text (`docs/audit/DECISIONS.md:2273`): the note names a substitution when "the keyless layer served a statement, the quote or prices the value reads". External support: SR 11-7 has been superseded; the Federal Reserve's SR 26-2, "Revised Guidance on Model Risk Management" (https://www.federalreserve.gov/supervisionreg/srletters/SR2602.pdf, fetched and text-extracted 2026-10-27), "supersedes and replaces SR letter 11-7", and says validating conceptual soundness "involves assessing and documenting model design (including key modeling choices, assumptions, qualitative judgments, and data selection)". A note that names data the model never selected misdocuments its data selection. (The SR 11-7 URL the first draft cited now returns 404.)

### OD-7. One operating income in the DCF: tagged one-offs in the coverage ratio, the terminal evidence and the margin fade (FIN-402, FIN-402-V1, FIN-402-V2; extends D-98's tag list from the margin seed; D-87's general normalised-earnings deferral is not reopened)

**Decision.** The D-98 tagged one-offs (`InsuredEventGainLoss`; `AssetImpairmentCharges`, else the goodwill, long-lived and intangible impairment tags; withheld tags left in) are removed in both directions from (a) the operating income scored for the synthetic rating's interest coverage, TTM or annual basis and the prior-year pair alike; (b) each fiscal year's NOPAT in the ROIC history handed to the terminal rule (invested capital as reported); (c) each fiscal year's margin in the fade's median, slope and regime, and the TTM row handed to the scenario margin ceiling. The reported ROIC series, the moat grade and the returns section stay on the GAAP basis. Each adjustment is named where its figure is printed. The tag list is unchanged.

**Recurrence guard and the ceiling's history (pre-flight R3; a house rule, recorded in B5b's D-next, Task 27b).** A D-98 tag family present in 3 or more of the last 5 fiscal years is a recurring operating cost. It is not added back in (c)'s history margins or (b)'s terminal evidence, and the basis names the family and its years. The count is per family (the tag a component is filed under), not "any tag". The scenario margin ceiling's history reads the same normalised rows (one operating income, this decision's own principle), with the same guard. A year whose one-off cannot be named (its tag and filed amount) keeps main's row in the ceiling's history, and the residual is recorded.
- *Measured at B13 without the guard.* The pre-flight's census emulation added each fiscal year's D-98 tags back to that year's operating income and left TTM rows untouched.
  - JNJ, tagged 5 of 5 years: 141.18 → 149.63 (+5.99%; fade median 24.95% → 26.45%, stable regime).
  - PEP, 3 of 5: 133.95 → 142.30 (+6.24%; regime stable → declining, target 13.33% → 14.04%).
  - CVX, 5 of 5: 195.21 → 201.55 (+3.25%; target 13.86% → 14.10%, terminal ROIC 9.37% → 9.46%).
  - Tags recur in 3 or more of 5 years at AMT, BA, CVX, INTC, JNJ (5/5), KO, EXPE (4/5), CSCO, DIS, META and PEP (3/5).
- *With the guard.* Counted by years with any tag (what was measured), JNJ, PEP and CVX return to no move and CAT stays. The per-family count is re-measured in census evidence row E6 (Task 29b). If it lets JNJ, PEP or CVX move again, E6 names the family and its years, and the move is explained before merge.
- *CAT* (tagged 1 of 5 years) moves 245.67 → 269.07 (+9.53%) only through the normalised ceiling history: its FY2022 leanest opex ratio goes 16.82% → 15.56% and the ceiling 17.52% → 18.78%. That is an intended move only if E6 shows its FY2022 tag is a one-off (one year of five) and names it with its filed amount. If the tag cannot be named, the ceiling's history keeps main's row for that year, and the residual is recorded.
- *Threshold and source* (D-next records both): 3 or more of the last 5 fiscal years. The threshold is a house rule set on the pre-flight's census measurement. Its principle is McKinsey's "infrequent or unusual charges … not expected to recur" (Sources below): a charge that recurs most years is an operating cost, and adding it back raises margins every year.
- B5c (VAL-6, the margin ceiling itself; Global Constraints, cross-batch) reads this rule.

**Alternatives rejected.** Seed-only (today): one DCF reads two operating incomes, and a solvent issuer is rated Caa/CCC on a non-cash charge its own margin basis says was removed.

**Sources.** Damodaran, Corporate Finance session 11 slides, "Synthetic versus Actual Ratings: Rated Firms", https://pages.stern.nyu.edu/~adamodar/podcasts/cfspr22/session11slides.pdf (fetched and text-extracted 2026-10-27): a gap between a synthetic and an actual rating arises because the "Synthetic rating was based on 2013 operating income whereas actual rating reflects normalized earnings" — the method's author treats normalised operating income as the correct coverage basis. S&P Global Ratings, "Credit FAQ: Calculating Leverage For Large U.S. Media Companies" (https://www.spglobal.com/ratings/en/research/articles/230313-credit-faq-calculating-leverage-for-large-u-s-media-companies-2023-update-12666386; the page returned HTTP 403 to automated reading on 2026-10-27, quoted from its indexed text, sector-specific): adjusted EBITDA is revenue minus operating expenses "excluding depreciation, amortization, and noncurrent asset impairment and impairment reversals". McKinsey, *Valuation* 7th ed., ch. 21 (https://www.oreilly.com/library/view/valuation-7th-edition/9781119610885/c21.xhtml; HTTP 403 on 2026-10-27, not re-verified): goodwill impairments sit with restructuring and litigation among nonoperating items, "infrequent or unusual charges … not expected to recur".

### OD-8. "Latest revenue YoY" when the newest year's revenue is refused (FIN-405; no recorded decision revised)

**Decision.** Withhold. `latestYoyPct` is published only when its endpoint is the newest annual row; otherwise it is null and the acceleration note says which year was refused. The 1y CAGR row keeps its own date, so the prior year's growth stays visible under its own period.

**Alternatives rejected.** Re-date the YoY to the prior year: it would duplicate the dated 1y CAGR row under a "latest" label.

**Sources.** XBRL International, "Dates in XBRL", https://www.xbrl.org/dates-in-xbrl/ (cited by D-56; fetched 2026-10-27): "All reported facts in XBRL must carry a date as part of their metadata"; a figure labelled "latest" must be the newest period's.

### OD-9. A vendor tax ratio on a pre-tax loss (FIN-406; revises the vendor-first precedence at METHODOLOGY.md:259; confirms D-103 B-32)

**Decision.** The vendor's effective tax ratio is admitted only when the same window's pre-tax income is not established as non-positive (TTM for ratios-ttm, the latest fiscal year for the annual ratios fallback). On an established pre-tax loss the B-32 0% shield and its basis gap apply, whichever source divided the numbers, so keyed and keyless runs give one WACC for one set of filings.

**Alternatives rejected.** (a) Keep vendor-first (METHODOLOGY.md:259): the same filings give a tax shield on the keyed path and none on the keyless one. (b) Ignore the vendor ratio everywhere and always divide filed figures: it moves every keyed WACC, including profitable issuers where the two sources agree, for no gain in this batch.

**Sources.** Damodaran, "Answer to Question 3", https://pages.stern.nyu.edu/~adamodar/New_Home_Page/valquestions/a3.htm (fetched 2026-10-27): in the year of the operating loss "the after-tax rate cost of debt should be zero".

### OD-10. Readability (R1–R4): not in this batch

No B5 task changes report layout; R1–R4 are planned separately (REPORT.md section 4.5). Task 17 adds notes only through the existing appendix missing-data list. Task 21 drops a clause rather than restating the withhold rule beside the basis that already states it, which is R3's "each disclosure said once" applied to one line, not a layout change.

### OD-11. The reverse DCF's terminal-margin family (FIN-501; extends D-58's "the family contains the base path" to the margin solve; revises the METHODOLOGY.md:2126-2129 convention "a margin fade over the full explicit horizon", which has no D-number)

**Question.** The margin fallback searches `fadePath(m0, m, n)`, a straight line that reaches `m` only in year `n` = 10 (`valuation.ts:3256`), while the base margin path fades to its target over `MARGIN_FADE_YEARS` = 5 and is then held (`valuation.ts:1975`, `:2029-2030`). Should the solve search candidate paths with the base path's shape, or the base path itself shifted?

**Decision.** The shifted base path: candidate(m) = base path + (m − base terminal margin) × wᵢ, with wᵢ = 0 in year one, rising linearly to 1 in year min(5, n), and 1 after (`fy = Math.min(MARGIN_FADE_YEARS, n)`; `fy = 1` gives w = [1]). The base path is the family member at the base terminal margin, so a price at the model value solves to the base terminal margin and a price below it solves below it. On every path `buildDcfAssumptions` builds (`fadePath(m0, target, 5)` then flat) the candidate equals the decisions spec's lean, the base-shape family `fadePath(m0, m, 5)` then flat, value for value; the shifted form is chosen because it keeps the property by construction for any base path, the way D-58 defines the growth family on the base path itself (`shiftedPath`, `valuation.ts:3193-3195`) rather than on a rebuilt shape. The reverse note, the "Supported terminal operating margin" trigger's horizon text and the data-only sentence name the family; `ReverseDcfResult` gains `marginPathFamily: "base-shift-to-terminal"` and `impliedMarginPathPct`.

**Alternatives rejected.** (a) Rebuild the base shape, `fadePath(m0, m, 5)` then flat: identical today, but a base path not built that way (the 10-year linear base in `tests/stageB.valuation.test.ts:454-488`, or any later margin rule) would fall outside the family again with no test noticing. (b) Keep the 10-year line and relabel: a price at the model value still reads as needing 21.71% against a 20% base (probe), and from the model value to about 10% below it the trigger tells the reader the market needs a margin "above" the threshold. (c) Solve the year-one margin: year one is the observed margin, not an assumption the price can move.

**Sources.**
- `docs/audit/DECISIONS.md:500` (D-58): "Reverse DCF: solves on the `convergent-shift-to-terminal` family, which contains the base path"; `docs/METHODOLOGY.md:2120-2122`: "The base path is the family member at base year-one growth, so implied minus base year-one growth … compares like with like."
- Mauboussin and Rappaport, interview in The Motley Fool, 2022-01-19, https://www.fool.com/investing/2022/01/19/expectations-investing-qanda-mauboussin-rappaport (fetched 2026-10-28): expectations investing "starts with what we know, the stock price", and a variant perception exists when "your expectations and the expectations implied by the market are different and noteworthy". A solve that returns a different margin at the model's own value reports a difference that does not exist.
- Probe output `tmp/audit-2026-10-27/agents/r4-verify-1/FIN-501.out.json`: a real builder's stable-regime path is 30, 29, 28, 27, 26, then 26 flat; the 10-year family member at the base terminal margin is worth 27.07 per share against the base 30.195.

### OD-12. The DCF tax seed when the margin seed removes a tagged one-off (FIN-502; extends D-98, `docs/audit/DECISIONS.md:2083`, from the margin seed to the tax seed; D-58's tax path and D-60's tax guidance unchanged)

**Question.** The margin seed leaves tagged one-offs out (D-98), but year one's tax rate is tax ÷ pre-tax income on the raw TTM row, which still holds the one-off (`valuation.ts:2046-2051`, `:2088`, `:2114`). The tags do not say whether a charge was deductible. Add back at zero tax, take the historical median for year one, or something else?

**Decision.** Re-read the rate without the one-off, inside the range its unknown tax effect allows, and let the issuer's own history choose the point. With u the net tagged amount (gains positive, charges negative, the value the margin seed removes) and t the marginal floor the terminal rate already uses (`marginalTaxFloor(domicile)`: max(statutory, 15%), US 21%):
- r0 = tax ÷ (pre-tax − u): the one-off carried no tax effect (non-deductible goodwill);
- r1 = (tax − t × u) ÷ (pre-tax − u): the one-off was taxed at the marginal rate (a deductible impairment whose deferred-tax benefit was booked, or a taxable gain);
- year one = the company historical median effective rate held within [min(r0, r1), max(r0, r1)], or r1 when there is no historical median; r0 and r1 are each clamped to [0%, 35%] as the TTM rate is today.

It applies exactly when the margin seed removes a one-off (`normalizeUnusual`), on the TTM and the annual base period alike, including when raw pre-tax income is not positive but pre-tax − u is; with pre-tax − u ≤ 0, or a negative tax expense (HEAD's own guard), HEAD's "not computable" path stands. Guided tax (D-60) still sets year one. The basis names both readings and the point taken. This refines the decisions spec's lean (the plain historical median): when the median lies inside the range, as in the probe (21.05% inside [21%, 29.4%]), the result is the lean's; the bound adds continuity, because the range shrinks to the raw TTM rate as the one-off shrinks, so a tiny tagged gain cannot swap MU #46's 14.81% TTM rate for its 9.39% median, and the rate never leaves what the TTM supports whichever way the charge was taxed.

**Alternatives rejected.** (a) Add back at zero tax (r0 always): exact for non-deductible goodwill, but a deductible impairment is under-taxed: on the probe's issuer with the charge tax-effected at 21% (tax 31.5 on pre-tax 150), r0 = 12.6% against a clean 21%, so value is overstated. (b) The plain median whenever a one-off is removed: deductibility-agnostic but discontinuous, since any tagged amount, however small, replaces the TTM rate. (c) Marginal-rate removal alone (r1 always, McKinsey's general method): 29.4% against a clean 21% on the finding's own non-deductible goodwill case.

**Sources.**
- BDO, "Income Tax Accounting Hot Topics: Year End 2020", https://www.bdo.com/insights/tax/income-tax-accounting-hot-topics-year-end-2020 (fetched 2026-10-28): "The tax accounting for the impairment depends on whether the goodwill is nondeductible ("Component 2 excess book goodwill") or deductible ("Component 1 tax goodwill")"; for component 2 "no deferred taxes are recorded on Component 2 book over tax goodwill", while its component-1 example has a "$127 impairment charge … partially offset by a $27 deferred tax benefit" (21%). The tax effect lies between none and the marginal rate, and the tag alone does not say which.
- Damodaran, "More on effective tax rates", https://pages.stern.nyu.edu/adamodar/New_Home_Page/valquestions/taxrate.htm (fetched 2026-10-28): the first year may use the effective rate, but "It is critical that the tax rate used in perpetuity to compute the terminal value be the marginal tax rate", and the marginal rate is the safer single choice (r1 when there is no history).
- Damodaran, Brazil 2008 valuation slides, https://pages.stern.nyu.edu/~adamodar/pdfiles/country/Brazil2008.pdf (fetched and text-extracted 2026-10-28), "Measuring Return on Capital": "Adjust EBIT for a. Extraordinary or one-time expenses or income … Use a marginal tax rate to be safe."
- Koller, Goedhart and Wessels, *Valuation* (McKinsey), 7th ed., ch. 20 "Taxes", https://www.oreilly.com/library/view/valuation-7th-edition/9781119610885/ (HTTP 403 on 2026-10-28; summarised from course slides found by search, not re-verified): operating taxes start from reported taxes and remove nonoperating items "at the appropriate marginal tax rate", a matching it calls "a very difficult achievement in practice". That is the r1 end of the range.

## Review Focus

Input classes no task's tests exercised before this plan; each now has a named test in its owning task.

1. **A 52/53-week issuer that puts the extra week in the first quarter** (Silicon Graphics style), not the fourth. Lengths must come from the filed period, and a guided first quarter must not be dated by the fourth-quarter rule. Test: Task 1 "reads a 14-week first quarter from its filed start" and Task 3 "dates a guided fourth quarter by the weekday rule and a guided first quarter 13 weeks after its base" (whose basis says the quarter's length is assumed, not established).
2. **A fiscal-year change (10-KT filer)** meeting the weekday rule and the stub filter at once: the rule must return null when the newest year end breaks the pattern, and the stub row must be withheld, not snapped. Test: Task 2 "finds no rule for a calendar year end or across a fiscal-year change" and Task 12 "withholds a transition period whose year end also breaks the weekday rule".
3. **A 12-12-12-16-week calendar** (Costco style): a 16-week latest quarter over a 16-week year-ago quarter keeps its YoY, a 12-week one is scaled up, and the D-58 bound stops capping the run-rate at the TTM. Test: Task 1 "annualises a 12-week quarter to 52 weeks" and "keeps the year-over-year of two 16-week quarters".
4. **Guidance over an annual base period** (no TTM, the latest fiscal year is the base): the guided year-ago quarter is the fiscal year's first quarter, and year one is the fiscal year at the guided pace with no run-rate. Test: Task 3 "carries an annual base period at the guided year-over-year pace".
5. **A legacy stored report with no `periodContext` or with a basis string from an older spec**: every display-time rule must be a no-op that does not throw. Test: Task 17 "adds no note and does not throw on a report without quarter period contexts".

Round 4 adds three input classes (amended 2026-10-28; a fourth, item 9, moved to B6 with FIN-506 on 2026-10-28):

6. **A margin-method reverse DCF on a non-flat base margin path** (the builder's ordinary output: a 5-year fade, then flat), at the model value and just below it. The solve must return the base terminal margin at the model value, a lower one below it, and the trigger must read "below". Tests: Task 18 "solves a price at the model value to the base terminal margin" and "solves a price 3% below the model value below the base terminal margin".
7. **A tagged one-off whose tax effect the tags do not give**: non-deductible goodwill, a deductible impairment with its deferred-tax benefit, a one-off too small to matter, and a negative tax expense beside a tagged item. Tests: Task 19 "re-reads year one without a non-deductible goodwill charge", "does not under-tax a deductible charge", "leaves the TTM rate when the one-off is tiny" and "control: a negative tax expense keeps HEAD's not-computable path, with or without a tagged item".
8. **A stored report built while the zero floor was the rule** (#43, spec 1.33.0, whose basis says the runs were floored) beside reports built after D-102 (#46–#52): the display correction must change only the latter. Test: Task 21 "keeps the floor sentence where the stored basis states the floor rule".
9. *(Moved to B6, 2026-10-28.)* The bank or insurer whose diluted share count differs from the count behind the quote's market cap is FIN-506's input class; it is B6's Review Focus item 7, tested in B6 Task 5A. No B5 task tests it.

## Part A: B5a (PR 1)

Branch `fix/seasonality-calendars-and-dcf-inputs`, cut from `main` after B13 and B4a merge.
- **Order:** the setup below, then Tasks 1, 2, 3, 4 and 3b (Task 3b extends Task 4's context helper, so it runs after it), then 17, then B5a's batch tasks 23-32.
- **Findings:** FIN-301, FIN-301-V1, FIN-101, FIN-101-V1, FIN-101-V2, FIN-301-V2 and FIN-301-V3.
- **Census evidence:** rows E1 and E5 (Task 29 Step C) and Step D checks 3-5.
- **Stamps:** Task 23.
- No Part A task reads a Part B export.

**Setup (no commit).**
- [ ] **Step 1:** Re-take every `file:line` reference in Part A's tasks on the branch base (B13 and B4a merged), and re-locate each edit by its quoted code (Global Constraints, line numbers). A reference that no longer lands on its construct is a stop.
- [ ] **Step 2 (pre-flight P11):** Regenerate `.superpowers/sdd/2026-10-27-audit-fix-05-seasonality-calendars-and-dcf-inputs/task-{1,2,3,17}-brief.md` from this amended plan at the branch base; the copies that say "HEAD 6542531" are void. Write the briefs for Tasks 4 and 3b the same way.
- [ ] **Step 3:** Confirm the B4a and B3 exports Part A builds on. If one is missing, B4a has not merged: stop.
  - `withLegacyBridgeMethod` and `BRIDGE_METHOD_SINCE_SPEC_VERSION` (Task 17 composes outside the first, and its cutoff sits above the second).
  - B4a's `src/report/legacyBridgeMethod.ts` entry in both risk lists (Task 17 registers after it).
  - B3's `specVersionBefore` (`src/report/legacyPayloadRecordSafety.ts`).
- [ ] **Step 4 (pre-flight P5):** Set up Task 29 Step A's out-of-repo harness, and take its `base` run on the branch base before any code change.

### Task 1: Week counts: the run-rate on a 13-week basis and a 53-week base period on a 52-week basis (FIN-301)

**Files:**
- Create `src/pipeline/stageB/fiscalCalendar.ts`.
- Modify `src/pipeline/stageB/valuation.ts:401-426` (`revenueRunRate`), `:668-678` (`DcfIncomeRow`), `:827-833` (`DcfQuarterRevenue`), `:862-872` (`RevenueRunRate`), `:1405-1411` (level text), `:1701-1710` (start revenue), `:2235` (start-revenue basis).
- Modify `src/pipeline/compute.ts:1157-1290` (`ttmIncome`/`ttmIncomeFromNormalized`: window start and length), `:3310-3329` (`dcfIncomeTtm` carries `days` on both branches: the TTM's, and on the annual branch `inc0`'s filed `fieldProvenance.revenue.periodStart`, else the gap to the next-older annual row's end), `:3361-3391` (quarter lengths on `dcfQuarterRevenue`), `:2578-2587` (`interestRunRate` receives the latest income quarter's `days`).
- Modify `src/pipeline/stageB/projections.ts:154-176` (`interestRunRate`: the quarter on a 13-week basis before × 4; FIN-301's fix sketch names this sibling).
- Test: create `tests/stageB.periodLength.test.ts`.

**Interfaces:**
- Produces (`fiscalCalendar.ts`):
  - `export function periodDays(start: string | null | undefined, end: string): number | null` — inclusive days, null when either date is not a strict ISO day or start > end.
  - `export function weeksOf(days: number | null): number | null` — 13 when `|days − 91| ≤ 1` (a calendar quarter of 90 to 92 days reads 13 weeks); for any other `w`, only when `days === 7w` exactly; else null. A 52/53-week issuer's periods always span whole weeks, because each one ends on the same weekday (26 CFR 1.441-2(a)(1)), so the filed start and the gap to the previous end both give exactly 7w. A ±1-day match for `w ≠ 13` would misread a calendar-year issuer's odd-length quarter as a week-based one. The census has such a quarter: KO's fourth quarter of 2020, 2020-09-26 to 2020-12-31, 97 days, would read as 14 weeks and be scaled by 13/14 (Task 29 Step D check 5; changed by the post-integration review, 2026-10-28).
  - `export function thirteenWeekFactor(days: number | null): number` — `13 / w` for a week-based quarter with `w ≠ 13`, else 1.
  - `export function fiftyTwoWeekFactor(days: number | null): number` — `52 / 53` when `weeksOf(days) === 53`, else 1.
- Produces (`compute.ts`): `TtmIncome.periodStart: string | null` (the oldest quarter's filed `fieldProvenance.revenue.periodStart`, else the day after the fifth-newest quarter's end, else null), `TtmIncome.periodStartBasis: "filed" | "prior-quarter-end" | null` (which of the two set it; Task 5 reads it) and `TtmIncome.days: number | null`.
- Produces (`valuation.ts`): `DcfQuarterRevenue.latest.days?`, `.yearAgo.days?`, `.guidedYearAgo.days?: number | null`; `DcfIncomeRow.days?: number | null`; `RevenueRunRate.latestQuarterWeeks: number | null`, `RevenueRunRate.lengthNote: string | null`.
- Produces (`projections.ts`): `interestRunRate(quarter: { date; interestExpense; interestExpenseDisclosed?; days?: number | null }, closing, opening)` — both branches scale the quarter's interest by `thirteenWeekFactor(quarter.days)` before × 4, and the basis names a scaled quarter ("the 14-week quarter ending … on a 13-week basis (× 13/14)").
- Consumes: incomeQuarterly rows' `fieldProvenance.revenue.periodStart` (EDGAR rows; FMP rows enriched by SEC, as report 50's are).

- [ ] **Step 1: Write the failing test** in `tests/stageB.periodLength.test.ts`. Fixtures are synthetic; the MU dates and revenues are MU's SEC-filed FY2026 Q4 and FY2025 Q4 (`2026-05-29..2026-09-03`, $54.229B; `2025-05-30..2025-08-28`, $11.315B; TTM $133.19B), already in the report-46 SEC snapshot.

```ts
describe("week counts (FIN-301)", () => {
  it("reads 12-, 14-, 16- and 17-week quarters and leaves calendar quarters alone", () => {
    expect(thirteenWeekFactor(98)).toBe(13 / 14);
    expect(thirteenWeekFactor(84)).toBe(13 / 12);
    expect(thirteenWeekFactor(112)).toBe(13 / 16);
    expect(thirteenWeekFactor(119)).toBe(13 / 17);
    for (const d of [89, 90, 91, 92, null]) expect(thirteenWeekFactor(d)).toBe(1);
    // A calendar-year issuer whose quarters end on a weekday but whose year ends on 31 December (KO-shaped SEC
    // periods: 2020-09-26..2020-12-31 is 97 days, 2025-01-01..2025-03-28 is 87): not a whole number of weeks, so no scaling.
    for (const d of [85, 87, 93, 96, 97, 99]) { expect(weeksOf(d)).toBeNull(); expect(thirteenWeekFactor(d)).toBe(1); }
    expect(weeksOf(98)).toBe(14);
    expect(fiftyTwoWeekFactor(371)).toBe(52 / 53);
    for (const d of [370, 372]) expect(fiftyTwoWeekFactor(d)).toBe(1);
    for (const d of [364, 365, 366, null]) expect(fiftyTwoWeekFactor(d)).toBe(1);
    expect(periodDays("2026-05-29", "2026-09-03")).toBe(98);
  });
  it("annualises a 14-week latest quarter on a 13-week basis (MU FY2026 Q4)", () => {
    const rr = revenueRunRate(133.19e9, "2026-09-03", {
      latest: { date: "2026-09-03", revenue: 54.229e9, days: 98 },
      yearAgo: { date: "2025-08-28", revenue: 11.315e9, days: 91 },
    })!;
    expect(rr.latestQuarterAnnualized).toBeCloseTo(201.422e9, -6);
    expect(rr.yoyPct).toBeCloseTo(345.03, 2);
    expect(rr.value).toBeCloseTo(201.422e9, -6);
    expect(rr.latestQuarterWeeks).toBe(14);
  });
  it("annualises a 12-week quarter to 52 weeks (12-12-12-16 calendar)", () => {
    const rr = revenueRunRate(268.78e9, "2026-05-10", {
      latest: { date: "2026-05-10", revenue: 63.21e9, days: 84 },
      yearAgo: { date: "2025-05-11", revenue: 58.5e9, days: 84 },
    })!;
    expect(rr.latestQuarterAnnualized).toBeCloseTo(273.91e9, -6); // HEAD: 252.84e9
    expect(rr.value).toBeCloseTo(273.91e9, -6);                    // HEAD: capped at the TTM, 268.78e9
    expect(rr.yoyPct).toBeCloseTo(8.0513, 3);                      // equal lengths: unchanged
  });
  it("keeps the year-over-year of two 16-week quarters", () => {
    const rr = revenueRunRate(270e9, "2025-08-31", {
      latest: { date: "2025-08-31", revenue: 86e9, days: 112 },
      yearAgo: { date: "2024-09-01", revenue: 80e9, days: 112 },
    })!;
    expect(rr.yoyPct).toBeCloseTo(7.5, 9);
    expect(rr.latestQuarterAnnualized).toBeCloseTo(86e9 * 4 * 13 / 16, -3);
  });
  it("reads a 14-week first quarter from its filed start", () => {
    // Extra week in Q1 (Silicon Graphics style): the length comes from the filed period, not a Q4 assumption.
    const rr = revenueRunRate(400e9, "2025-09-27", {
      latest: { date: "2025-09-27", revenue: 107.7e9, days: 98 },
      yearAgo: { date: "2024-09-28", revenue: 92e9, days: 91 },
    })!;
    expect(rr.yoyPct).toBeCloseTo((107.7 * 13 / 14 / 92 - 1) * 100, 6);
  });
  it("reads an unestablished length as 13 weeks and says so", () => {
    const rr = revenueRunRate(1000, "2026-01-31", { latest: { date: "2026-01-31", revenue: 350 }, yearAgo: { date: "2025-02-01", revenue: 350 / 1.04 } })!;
    expect(rr.latestQuarterAnnualized).toBe(1400); // control: dcfAnchoring's seasonal-peak case is unchanged
    expect(rr.lengthNote).toMatch(/length not established; read as 13 weeks/);
  });
  it("puts a 53-week TTM on a 52-week basis as the DCF start revenue, margins unchanged", () => {
    // `base` is a verbatim copy of tests/stageB.dcfAnchoring.test.ts's nvda() inputs (TTM 302.97B ending
    // 2026-07-26, HISTORY, quarterRevenue latest 96.22B / year-ago 46.743B), defined in this file.
    const a53 = buildDcfAssumptions({ ...base, incomeTtm: { ...base.incomeTtm!, days: 371 } }).assumptions!;
    const a52 = buildDcfAssumptions({ ...base, incomeTtm: { ...base.incomeTtm!, days: 364 } }).assumptions!;
    expect(a53.startRevenue.value).toBeCloseTo(302.97e9 * 52 / 53, -3);
    expect(a53.startRevenue.basis).toMatch(/53-week .* on a 52-week basis \(× 52\/53\)/);
    expect(a52.startRevenue.value).toBe(302.97e9);                    // control
    expect(a53.ebitMarginPath.value[0]).toBeCloseTo(a52.ebitMarginPath.value[0], 9); // ratios unchanged
  });
  it("carries quarter lengths and the TTM window from the filed starts (compute wiring)", () => {
    // completeCurrencyBundle({}) (tests/helpers/currencyBundle.ts) with its incomeQuarterly rows replaced by
    // five synthetic rows on MU's SEC calendar, newest first, each with
    // fieldProvenance.revenue = { source: "edgar", periodStart, periodEnd: date, … } copied from an existing
    // EDGAR-provenance fixture row:
    //   2026-09-03 (start 2026-05-29, revenue LATEST = 54e9), 2026-05-28 (2026-02-27, 40e9),
    //   2026-02-26 (2025-11-28, 30e9), 2025-11-27 (2025-08-29, 20e9), 2025-08-28 (2025-05-30, YEAR_AGO = 11e9).
    const computed = runStageB(bundle);
    const anchor = (computed.valuation as { assumptions: DcfAssumptions }).assumptions.revenueAnchor!;
    expect(anchor.runRate!.latestQuarterWeeks).toBe(14);
    expect(anchor.runRate!.latestQuarterAnnualized).toBeCloseTo(4 * LATEST * 13 / 14, -3);
    expect(anchor.runRate!.yoyPct).toBeCloseTo((LATEST * 13 / 14 / YEAR_AGO - 1) * 100, 6);
  });
  it("annualises a 14-week quarter's interest on a 13-week basis (interestRunRate)", () => {
    expect(interestRunRate({ date: "2026-09-03", interestExpense: 1.4e9, days: 98 }, null, null)!.value).toBeCloseTo(1.4e9 * 4 * 13 / 14, 0); // HEAD: 5.6e9
    const withDebt = interestRunRate({ date: "2026-09-03", interestExpense: 1.4e9, days: 98 },
      { date: "2026-09-03", debt: 40e9 }, { date: "2026-05-28", debt: 30e9 })!;
    expect(withDebt.value).toBeCloseTo((1.4e9 * 13 / 14 / 35e9) * 4 * 40e9, 0);
    expect(withDebt.basis).toMatch(/14-week quarter ending 2026-09-03 on a 13-week basis \(× 13\/14\)/);
    // control: a 91-day quarter and an unknown length are unchanged
    expect(interestRunRate({ date: "2026-06-30", interestExpense: 1e9, days: 91 }, null, null)!.value).toBe(4e9);
    expect(interestRunRate({ date: "2026-06-30", interestExpense: 1e9 }, null, null)!.value).toBe(4e9);
  });
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/stageB.periodLength.test.ts` — expected FAIL: `Cannot find module '@/pipeline/stageB/fiscalCalendar'`; after a stub module, `expected 216916000000 to be close to 201422000000`, `expected 379.27 to be close to 345.03`, `expected 252840000000 to be close to 273910000000`, and `expected 5600000000 to be close to 5200000000` (interest); the two `interestRunRate` controls pass at HEAD.
- [ ] **Step 3: Implement.** `fiscalCalendar.ts` as the interface above. In `revenueRunRate`, `fL = thirteenWeekFactor(latest.days)`, `fY = thirteenWeekFactor(yearAgo.days)`; `annualized = 4 × latest × fL`; `yoy = (latest × fL) / (yearAgo × fY) − 1`; the seasonally neutral carry and the `[TTM, annualized]` bound use these; `lengthNote` names a scaled quarter ("the 14-week quarter ending … on a 13-week basis (× 13/14)") or an unestablished length. "Not established" is for `days === null` only. An established length that is not a whole number of weeks (an 87- or 97-day quarter of a calendar-year issuer) is used unscaled and adds no note. In `buildDcfAssumptions`, a base row with `fiftyTwoWeekFactor(ttm.days) !== 1` has every flow field (revenue, operating income, gross profit, pre-tax income, tax) and the margin seed's one-off amount scaled by 52/53 before use, and `startRevenue.basis` says so. In `compute.ts`, `ttmIncomeFromNormalized` sets `periodStart`/`periodStartBasis`/`days` from the oldest quarter's filed start (`"filed"`), else the day after `normalized.rows[4]`'s end (`"prior-quarter-end"`), else null; the run-rate quarters and the `interestRunRate` quarter carry `days` from their own filed start, else the gap to the previous quarter row, else null. `lengthNote` is appended to the run-rate's level text only (a `toMatch` on the anchor basis still matches; check that no test pins the whole basis with `toBe` before relying on that: `grep -n "basis).toBe(" tests/stageB.dcfAnchoring.test.ts tests/stageB.valuation.test.ts`).
- [ ] **Step 4: Run it.** Expected PASS. Re-run `npx vitest run tests/stageB.dcfAnchoring.test.ts tests/stageB.ttm.compute.test.ts tests/stageB.valuation.test.ts tests/stageB.projections.test.ts tests/projection.operatingIncome.test.ts`: all pass unchanged (their fixtures carry no `days`, and calendar quarters keep factor 1). Then `grep -rln "interestRunRate" tests` and run each file found: a fixture whose latest quarter is 98 days re-pins its interest with a D-next comment; any other move is a defect.
- [ ] **Step 5: Benefit check.** The FIN-301 probe's failing assertions now hold in the new test (201.42B, 345.03%) and its control (13-week quarters unchanged) holds. Replay (Task 29): MU #46 run-rate 216.92B → 201.42B, year one 249.38B → 231.57B, DCF per share 5000.09 → about 4086.65 (the finder's length-neutral counterfactual with the 52-week TTM). Must not move: AMZN #43 and NVDA #48–50 run-rates (all four TTM quarters are 13 weeks or calendar quarters); DEMO audit fixtures. **Scope extension E1, `interestRunRate` (confirmed by the main session only with its replay evidence, decisions spec 4.3):** the extension stays in this commit only if Task 29's evidence row E1 holds: on the five snapshots and the 45 census snapshots, the EPS projection's interest run-rate moves exactly where `interestRunRate` is reached (a quarter newer than the latest annual row, `compute.ts:2577`) with a quarter that reads w ≠ 13 weeks, by exactly × 13/w, and nowhere else. The post-integration review's pre-scan expects one such input, census PEP (a 12-week third quarter ending 2026-09-05, × 13/12). COST's 16-week and MU #46's 14-week latest quarters close their fiscal years, so the run-rate is not reached, and KO's 93-day quarter has no whole-week count. If E1 shows any other move, the extension is not confirmed: stop before Task 27 and report the failing rows to the main session; do not drop or re-tune it on your own.
- [ ] **Step 6: Docs.** `docs/METHODOLOGY.md:477-484` ("The run-rate is the latest quarter annualized…"): add that a 12-, 14-, 16- or 17-week quarter is put on a 13-week basis (× 13/w) before it is annualised or compared year over year, that an unestablished length is read as 13 weeks and said so, and that a 53-week TTM or fiscal year is put on a 52-week basis as the start revenue. Same sentence in the "DCF start revenue" text near `:2235`'s basis if METHODOLOGY quotes it. `docs/METHODOLOGY.md:2194-2199` (D-65 interest run-rate, "without both balances, the quarter × 4"): the quarter is first put on a 13-week basis.
- [ ] **Step 7: Commit.** `git add src/pipeline/stageB/fiscalCalendar.ts src/pipeline/stageB/valuation.ts src/pipeline/stageB/projections.ts src/pipeline/compute.ts tests/stageB.periodLength.test.ts docs/METHODOLOGY.md` then `git commit -m "Annualise 14-week and 12-week quarters on a 13-week basis and a 53-week base on 52 weeks (FIN-301)"`.

### Task 2: The issuer's weekday fiscal-year rule for future year ends (FIN-301-V3)

**Files:**
- Modify `src/pipeline/stageB/fiscalCalendar.ts` (rule functions).
- Modify `src/pipeline/stageB/valuation.ts:485-572` (`calendarizeConsensusWindow`: snap vendor dates; D-65 comment at `:488-492`), `:724-825` (`DcfAssumptionInputs.fiscalCalendar`), `:1423` (pass it), `:1440-1447` (spread text: approximate boundaries note).
- Modify `src/pipeline/compute.ts:3443-3528` (`fiscalCalendar: fiscalYearRule(...)` from the deduped `normalizeQuarterRows(incomeAnnual).rows` dates, the same rows `dcfIncomeHistory` uses).
- Test: create `tests/stageB.fiscalCalendar.test.ts`.

**Interfaces:**
- Produces:
  - `export interface FiscalYearRule { kind: "last-weekday" | "nearest-weekday"; weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6; month: number }` (month 1–12; for "nearest", the month whose last day the year end is nearest to).
  - `export function fiscalYearRule(annualEnds: readonly string[]): FiscalYearRule | null` — sorts and dedupes its input; takes the newest end and every older end chained to it 364 or 371 days apart (stopping at the first break); needs at least three; returns the rule only when exactly one of the two kinds (26 CFR 1.441-2(a)(1)) fits every chained end; null for calendar month-end issuers, across a fiscal-year change, and when both kinds fit every end (ambiguous: every end within the month's last three days, e.g. Saturdays 2022-12-31, 2023-12-30, 2024-12-28, after which the two kinds give 2025-12-27 and 2026-01-03).
  - `export function fiscalYearEndFor(rule: FiscalYearRule, year: number): string` — the rule's year end that falls nearest to the end of `month` in `year`.
  - `export function snapToFiscalYearEnd(rule: FiscalYearRule | null, date: string, toleranceDays?: number): string` — the rule's year end within `toleranceDays` (default 10) of `date`, else `date`.
- `calendarizeConsensusWindow(rows, window, reported?, seasonality?, calendar?: FiscalYearRule | null)`.

- [ ] **Step 1: Write the failing test** in `tests/stageB.fiscalCalendar.test.ts` (dates are NVDA's and MU's SEC-filed fiscal year ends; revenues synthetic):

```ts
it("detects NVDA's last-Sunday-of-January rule and its 53-week FY2027", () => {
  const rule = fiscalYearRule(["2026-01-25", "2025-01-26", "2024-01-28", "2023-01-29"]);
  expect(rule).toEqual({ kind: "last-weekday", weekday: 0, month: 1 });
  expect(fiscalYearEndFor(rule!, 2027)).toBe("2027-01-31");
  expect(fiscalYearEndFor(rule!, 2028)).toBe("2028-01-30");
});
it("detects MU's Thursday-nearest-August-31 rule", () => {
  const rule = fiscalYearRule(["2026-09-03", "2025-08-28", "2024-08-29", "2023-08-31"]);
  expect(rule).toEqual({ kind: "nearest-weekday", weekday: 4, month: 8 });
  expect(fiscalYearEndFor(rule!, 2027)).toBe("2027-09-02");
});
it("finds no rule for a calendar year end or across a fiscal-year change", () => {
  expect(fiscalYearRule(["2025-12-31", "2024-12-31", "2023-12-31"])).toBeNull();
  expect(fiscalYearRule(["2025-12-28", "2024-06-30", "2023-07-02", "2022-07-03"])).toBeNull();
});
it("finds no rule when both kinds fit every end (ambiguous)", () => {
  // Saturdays within the last three days of December: last-Saturday and nearest-Saturday both fit,
  // and the two rules disagree on the next year (2025-12-27 against 2026-01-03).
  expect(fiscalYearRule(["2024-12-28", "2023-12-30", "2022-12-31"])).toBeNull();
  // control: one older end that only the nearest rule fits settles it
  expect(fiscalYearRule(["2024-12-28", "2023-12-30", "2022-12-31", "2022-01-01"])).toEqual({ kind: "nearest-weekday", weekday: 6, month: 12 });
});
it("reads Apple-shaped last-Saturday-of-September ends (the payload golden fixture's calendar)", () => {
  const rule = fiscalYearRule(["2025-09-27", "2024-09-28", "2023-09-30", "2022-09-24", "2021-09-25"]);
  expect(rule).toEqual({ kind: "last-weekday", weekday: 6, month: 9 });
  expect(snapToFiscalYearEnd(rule, "2026-09-30")).toBe("2026-09-26");
  expect(snapToFiscalYearEnd(rule, "2027-09-30")).toBe("2027-09-25");
  expect(snapToFiscalYearEnd(rule, "2027-12-31")).toBe("2027-12-31"); // control: outside the 10-day tolerance
});
it("moves a vendor anniversary date to the 53-week year end, so no day is counted twice", () => {
  const rule = fiscalYearRule(["2026-01-25", "2025-01-26", "2024-01-28"]);
  const rows = [
    { date: "2027-01-25", revenueAvg: 409.8e9, analysts: 50, revenueLow: 400e9, revenueHigh: 420e9 },
    { date: "2028-01-25", revenueAvg: 600e9, analysts: 45, revenueLow: 570e9, revenueHigh: 630e9 },
  ];
  const window = { startDate: "2026-07-27", endDate: "2027-07-26" };
  const reported = { priorFiscalYearEnd: "2026-01-25", through: "2026-07-26", revenue: 177.84e9, quarters: 2 };
  const snapped = calendarizeConsensusWindow(rows, window, reported, null, rule);
  const vendor = calendarizeConsensusWindow(rows, window, reported, null, null); // control: HEAD behaviour
  expect(snapped.fiscalYears.map((f) => [f.date, f.days])).toEqual([["2027-01-31", 189], ["2028-01-30", 176]]);
  expect(snapped.value).toBeCloseTo(522.0699e9, -5);
  expect(vendor.value).toBeCloseTo(531.1381e9, -5);
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/stageB.fiscalCalendar.test.ts` — expected FAIL: `fiscalYearRule is not a function` (then, once exported, `expected [["2027-01-25",183],…] to equal [["2027-01-31",189],…]`).
- [ ] **Step 3: Implement.** Rule detection tries both kinds against the newest ends (descending, each 364 or 371 days after the next-older one) and keeps the first kind every end fits; the "nearest" kind compares the weekday within ±3 days of the month's last day. In `calendarizeConsensusWindow`, each row's date is passed through `snapToFiscalYearEnd(calendar, date)` before `forecastYearPeriod` and the chaining; the shaped spread's anniversary test keeps reading the original `seasonality.fiscalYearEnd`. When the issuer's annual ends all share one weekday but `fiscalYearRule` returns null (ambiguous or broken chain), the spread text adds "fiscal-year boundaries are the provider's dates, approximate by up to a week". `compute.ts` passes `fiscalCalendar: fiscalYearRule(normalizeQuarterRows(incomeAnnual).rows.map(rowDate))`.
- [ ] **Step 4: Run it.** PASS. Re-run `npx vitest run tests/stageB.dcfAnchoring.test.ts` (its "consensus calendarization by the issuer's quarterly shape" block uses calendar month ends and calls `buildDcfAssumptions` without `fiscalCalendar`: unchanged). Then run the runStageB-based files whose fixtures pair 52/53-week annual ends with consensus rows: `npx vitest run tests/stageC.payload.passes.test.ts tests/currency.payload.test.ts tests/currency.stageB.test.ts tests/currentReports.test.ts tests/stageC.deterministicInjection.test.ts tests/stageC.factualValidation.test.ts tests/degradation.report.test.ts`. **Expected move:** the payload golden's AAPL-shaped `fixtureBundle` (`tests/stageC.payload.passes.test.ts:148-300`: annual ends 2025-09-27 … 2021-09-25, the last Saturday of September; estimates dated 2026-09-30 and 2027-09-30; TTM end 2026-03-28) now calendarizes FY2026 to 2026-09-26 and FY2027 to 2027-09-25. FY2026's remainder after the 219B reported stays wholly inside window 1; FY2027's share becomes 470B × 183/364 instead of 470B × 179/365, so window 1 moves from about 451.49B to about 457.29B, and with it the year-one level and growth, the DCF, scenarios, reverse DCF, the basis text ("the fiscal year ending 2026-09-26 contributes …") and the finance hash. Record the before/after values; the golden is re-pinned in Task 24 with this cause. Any other file that moves must show the same mechanism (a vendor date snapped to a filed weekday year end) before its pin is updated with a D-next comment; otherwise stop and trace.
- [ ] **Step 5: Benefit check.** FIN-301-V3's probe assertion holds on its shape (window 1 no longer counts 2027-01-26..2027-01-31 twice). Replay (Task 29) on NVDA #50: year one 526.40B → 516.34B, year-one growth 73.75% → 70.43%, year-two growth 50.56% → 53.27%, per share 229.52 → 229.41; the basis names "the fiscal year ending 2027-01-31". Must not move: AMZN #43 (calendar year end, rule null), MU #46 (keyless, no consensus).
- [ ] **Step 6: Docs.** `docs/METHODOLOGY.md:444-452`: replace "A 52/53-week year starts the day after the previous estimate's year end" with the weekday-rule sentence (OD-1a) and correct the NVDA example to "2026-07-27..2027-01-31"; the D-65 comment at `valuation.ts:488-492` likewise.
- [ ] **Step 7: Commit.** `git add src/pipeline/stageB/fiscalCalendar.ts src/pipeline/stageB/valuation.ts src/pipeline/compute.ts tests/stageB.fiscalCalendar.test.ts docs/METHODOLOGY.md` (plus any test file re-pinned in Step 4 other than the payload golden, which moves in Task 24; until then `tests/stageC.payload.passes.test.ts` is expected to fail on its pins) then `git commit -m "Calendarize consensus on the issuer's own 52/53-week year ends (FIN-301-V3)"`.

### Task 3: Guidance taken out of its own season on a 13-week basis; no sequential fallback (FIN-101, FIN-301-V1, FIN-101-V2, FIN-301-V2)

Amended by pre-flight R1 (OD-1 decision 1). Year one from guidance is the guided quarter divided by its growth-adjusted seasonal share (the mean of up to three yearly factors), × 4 and carried at the guided year-over-year pace. Below eight contiguous quarters ending at the guided year-ago quarter, it falls back to this task's first-planned rule, TTM × (1 + g). The floor and the guard are unchanged.

**Files:**
- Modify `src/pipeline/stageB/valuation.ts:827-833` (`DcfQuarterRevenue.guidedYearAgoWindow?`), `:835-860` (`DcfGuidance.periodStart?`), `:900-914` (`evidence.guidedFloor`, `evidence.guidedSeasonalFactor`), `:1357-1364` (`nextQuarterGuidance`), `:1366-1394` (doc comment), `:1448-1514` (seasonal factor, pace, level, floor, guard, texts; the same block at B13, with `:1477` `guidedRunRate = 4 * guide.revenue`, `:1478` `guidedFloor = 4 * low`, `:1479` `consensusConsistent` and `:1504` the carry), `:1546-1552` (status text), `:1630-1632` (evidence).
- Modify `src/pipeline/filingDisclosures.ts:270-305` (`guidedQuarterEnd` reads the weekday rule), `:346` (call), `RevenueGuidanceAnchor.periodEndBasis` union.
- Modify `src/pipeline/compute.ts:3202-3219` (`dcfGuidance`: `periodStart` = base + 1 day), `:3361-3391` (`guidedYearAgo.days`; `guidedYearAgoWindow`, the contiguous quarters ending at the guided year-ago quarter on the 13-week basis, supplied at `dcfQuarterRevenue`, `:3404` at B13; and on the annual base period, where `ttmInc` is null, build `dcfQuarterRevenue` too: `latest` = the quarterly row ending on `inc0`'s date when one exists, else `{ date: inc0 date, revenue: null }`; `yearAgo` and `guidedYearAgo` by the same 350–380-day and `establishedCurrencyOn` rules as the TTM branch). Without this the new rule would silently drop guidance on every annual-base run, because HEAD builds `dcfQuarterRevenue` only when `ttmInc` exists.
- Modify `src/pipeline/stageB/valuation.ts:1449-1463` (comparability guard: the quarter range × 4 is put on a 13-week basis, × `fG`, with "on a 13-week basis" in its text when `fG ≠ 1`; refuse/admit logic otherwise unchanged).
- Modify `tests/stageB.dcfAnchoring.test.ts:72-101`, `:195-224` and `tests/stageB.guidanceComparability.test.ts:22-28`, `:53-68` (re-pins below).
- `src/report/thesisTriggers.ts:70` prints `evidence.guidedRunRate` as "the guided run-rate" beside the year-one window. It changes in Task 4 (pre-flight R2: never print a level dated at the guided quarter), not here; `tests/report.thesisTriggers.test.ts:114` builds its own evidence object.
- Test: create `tests/stageB.seasonalGuidance.test.ts`.

**Interfaces:**
- Consumes: Task 1's `thirteenWeekFactor`, `periodDays`; Task 2's `fiscalYearRule`, `fiscalYearEndFor`.
- Produces:
  - `DcfGuidance.periodStart?: string`.
  - `DcfQuarterRevenue.guidedYearAgoWindow?: Array<{ date: string; revenue: number; days?: number | null }>`: the contiguous quarters ending at the guided year-ago quarter, newest first. Eight give one yearly factor; each further four give one more, up to sixteen for three.
  - `RevenueAnchor.evidence.guidedFloor?: number | null`.
  - `RevenueAnchor.evidence.guidedSeasonalFactor?: number | null`: s_g, null in the fallback.
  - `evidence.guidedRunRate`, redefined as 4 × Q_g × f_G ÷ s_g: TTM × (1 + g)^(7.5/12) in the fallback, and null without a guided year-ago quarter.
  - `RevenueGuidanceAnchor.periodEndBasis: "calendar-quarter" | "13-week-quarter" | "fiscal-year-end-rule" | null`.
- A fixture without `guidedYearAgoWindow`, or with fewer than eight contiguous quarters ending at the guided year-ago quarter, takes the fallback.

- [ ] **Step 1: Write the failing test** in `tests/stageB.seasonalGuidance.test.ts`, copying `scenario()`, `SEASONAL` and `FLAT` from `tmp/audit-2026-10-27/probes/FIN-101.probe.ts:20-75` (synthetic AMZN-shaped quarters) and the NVDA next-report shape from `FIN-301-V1.probe.ts:41-86` (NVDA's SEC-filed FY2017–FY2026 annual figures and Q4 FY2026–Q2 FY2027 quarters; the Q3 and Q4 FY2027 figures are hypothetical). The first-planned cases below build `quarterRevenue` without `guidedYearAgoWindow`, so they exercise the fallback, and their values (TTM × (1 + g)) hold under the amended rule; the pre-flight's cases after them build the window:

```ts
it("keeps a consensus that holds the guided peak quarter at the midpoint (FIN-101 a)", () => {
  const s = scenario(SEASONAL);
  const a = build({ ...s.inputs, guidance: s.guide }).revenueAnchor!;
  expect(a.source).toBe("consensus");                                  // HEAD: "guidance"
  expect(a.evidence!.guidedFloor).toBeCloseTo(784.006e9, -6);           // HEAD floor: 4 × low = 920.02B
  expect(a.basis).toMatch(/at or above the twelve-month floor the guidance implies/);
});
it("gives consecutive releases at the same guided pace the same year-one growth (FIN-101 b)", () => {
  // oct: Q4 guide 234.7B over 213.4B; jan: Q1 guide = 1.1 × 171.3B, as in the probe.
  expect(oct.revenueAnchor!.source).toBe("guidance");
  expect(oct.growthPath.value[0]).toBeCloseTo(9.98, 2);                 // HEAD: 26.78
  expect(jan.growthPath.value[0]).toBeCloseTo(10.0, 2);                 // HEAD: -0.96
  expect(oct.revenueAnchor!.evidence!.guidedRunRate).toBeCloseTo(814.415e9, -6);
});
it("control: a flat-season issuer keeps consensus (FIN-101 c)", () => {
  expect(build({ ...scenario(FLAT).inputs, guidance: scenario(FLAT).guide }).revenueAnchor!.source).toBe("consensus");
});
it("does not set a level from guidance without the same quarter a year earlier (FIN-101-V2)", () => {
  const s = scenario(SEASONAL);
  const { guidedYearAgo: _drop, ...qr } = s.inputs.quarterRevenue!;
  const a = build({ ...s.inputs, analystEstimates: null, quarterRevenue: qr, guidance: s.guide }).revenueAnchor!;
  expect(a.source).toBe("run-rate");                                    // HEAD: "guidance" at the seasonal pace
  expect(a.basis).toMatch(/guidance .* not used for year one: no same fiscal quarter a year earlier/);
  expect(a.evidence!.guidedRunRate).toBeNull();
  expect(a.evidence!.guidedPacePct).not.toBeNull();                     // kept as evidence only
});
it("compares a 14-week guided quarter with a 13-week year-ago quarter on a 13-week basis (FIN-301-V1)", () => {
  const g14 = (108e9 / 91) * 98;
  const a = run(inputs({ revenue: g14, periodEnd: "2027-01-31", periodStart: "2026-10-26" }, { date: "2026-01-25", revenue: 68.127e9, days: 91 }));
  expect(a.guidedYoyPct).toBeCloseTo(58.53, 2);                          // HEAD: 70.72
  expect(a.yearOne).toBeCloseTo(561.13e9, -7);
  // Reverse, as the probe builds it: a 13-week guide (2026-10-26..2027-01-24) at +20% revenue a day
  // over a 98-day year-ago quarter dated 2026-01-25.
  const rev = run(inputs({ revenue: 68.127e9 * 1.2, periodEnd: "2027-01-24", periodStart: "2026-10-26" },
    { date: "2026-01-25", revenue: (68.127e9 / 91) * 98, days: 98 }));
  expect(rev.guidedYoyPct).toBeCloseTo(20, 6);                            // HEAD: 11.43
});
it("puts the sequential pace on a 13-week basis (FIN-301-V2)", () => {
  // paceFor(guide, guideDays, latest, latestDays) builds FIN-301-V1's inputs() with the latest quarter
  // { date: TTM_END, revenue: latest, days: latestDays }, no guidedYearAgo, a guide whose periodStart makes
  // periodDays(periodStart, periodEnd) === guideDays, and returns
  // buildDcfAssumptions(...).assumptions!.revenueAnchor!.evidence!.guidedPacePct (the real code path).
  // Flat revenue per day: a 14-week guide over the 13-week latest quarter, and the reverse.
  expect(paceFor(108e9 / 91 * 98, 98, 108e9, 91)).toBeCloseTo(0, 6);     // HEAD: 34.51
  expect(paceFor(54.229e9 / 98 * 91, 91, 54.229e9, 98)).toBeCloseTo(0, 6); // HEAD: -25.65
});
it("carries an annual base period at the guided year-over-year pace (unit)", () => {
  // incomeTtm { basis: "annual", date: "2025-12-31", revenue: FY = 1000e9 }, guidance GUIDE = 270e9 for the
  // quarter 2026-01-01..2026-03-31, quarterRevenue { latest: { date: "2025-12-31", revenue: 280e9 },
  // yearAgo: null, guidedYearAgo: { date: "2025-03-31", revenue: Q1_2025 = 250e9, days: 90 } }, no consensus.
  expect(a.source).toBe("guidance");
  expect(a.yearOneRevenue).toBeCloseTo(FY * (GUIDE / Q1_2025), -3);       // 1080e9; HEAD: 4 × 270e9 × 1.08^0.375 = 1111.6e9
  expect(a.runRate).toBeNull();
});
it("wires the guided year-ago quarter on an annual base period (compute)", () => {
  // runStageB on completeCurrencyBundle({}) with the TTM made unavailable the way tests/stageB.ttm.compute.test.ts
  // already does it (an irregular or rejected quarter in the window), an 8-K guide for the quarter after the
  // latest fiscal year end (the guidanceComparability fixture's record shape, re-dated), and the same fiscal
  // quarter a year earlier present in incomeQuarterly. Precondition, asserted first:
  expect(assumptions.forecastPeriod?.basis).toBe("fiscal-year");            // the base period is annual
  expect(assumptions.revenueAnchor!.source).toBe("guidance");                // HEAD too ("guidance" × 4 at gMid)
  expect(assumptions.revenueAnchor!.evidence!.guidedYoyPct).not.toBeNull();  // HEAD: absent
});
it("dates a guided fourth quarter by the weekday rule and a guided first quarter 13 weeks after its base", () => {
  // nextPeriodRevenueGuidance on completeCurrencyBundle({}) with incomeAnnual dates replaced by NVDA's SEC year
  // ends (2026-01-25, 2025-01-26, 2024-01-28, 2023-01-29: last Sunday of January) and one earnings-release record
  // (buildEarningsReleaseRecord, as tests/stageB.guidanceComparability.test.ts:12-19 builds it, synthetic text).
  const q4 = nextPeriodRevenueGuidance(withRelease({ reportedPeriodEnd: "2026-10-25", guidedQuarter: "Q4 FY2027" }))!;
  expect(q4).toMatchObject({ periodEnd: "2027-01-31", periodEndBasis: "fiscal-year-end-rule" });   // HEAD: 2027-01-24, "13-week-quarter"
  const q1 = nextPeriodRevenueGuidance(withRelease({ reportedPeriodEnd: "2027-01-31", guidedQuarter: "Q1 FY2028" }))!;
  expect(q1).toMatchObject({ periodEnd: "2027-05-02", periodEndBasis: "13-week-quarter" });        // base + 91, unchanged
  // A guided Q1-Q3 of a 53-week fiscal year (by the rule) is dated base + 91 and the anchor basis says the
  // length is assumed: run buildDcfAssumptions on a guide dated by the rule inside the 53-week FY2027.
  expect(anchorBasisFor({ base: "2026-04-26", guidedEnd: "2026-07-26" })).toMatch(/length assumed to be 13 weeks: the fiscal year ending 2027-01-31 has 53 weeks/);
});
```

The pre-flight's cases (R1), in the same file `tests/stageB.seasonalGuidance.test.ts`. Quarters Q_k = 100e9 × 1.05^k, k = 0..11 (k = 11 latest), each 13 weeks; the first nine (k = 0..8, newest first, ending at the guided year-ago quarter) are passed as `guidedYearAgoWindow`. The guide is Q_g = 100e9 × 1.05^12 = 179.5856e9.

```ts
it("deseasonalizes the guided quarter by its growth-adjusted share and keeps the guided level (OD-1 amended)", () => {
  expect(a.evidence!.guidedSeasonalFactor).toBeCloseTo(1, 12);                       // no season in a constant-growth series
  expect(a.yearOneRevenue).toBeCloseTo(4 * 179.5856e9 * Math.pow(1.05 ** 4, 0.375), -6); // 772.886e9; Task 3 as planned: 774.037e9
});
it("takes the issuer's season out of a peak-quarter guide", () => {
  // same series with the guide's own fiscal quarter boosted: k ≡ 0 mod 4 (k = 0, 4, 8, and the guide k = 12) × 1.15 (controller ruling 2026-10-29);
  // on the window k = 0..8: s ≈ 1.1055, year one ÷ (TTM × (1 + g)) ≈ 1.0038, so toBeCloseTo(1, 2) passes by 0.0012 and fails on a wrong window
  expect(a.evidence!.guidedSeasonalFactor).toBeGreaterThan(1.10);
  expect(a.yearOneRevenue / ttmTimesYoy).toBeCloseTo(1, 2);                           // agrees with TTM × (1 + g) under a stable season
});
it("does not import last year's sequential acceleration for a decelerating grower", () => {
  // NVDA-shaped, synthetic, each quarter 13 weeks. Quarters in billions, oldest first (k = 0..11):
  //   20, 21, 22.5, 24.5, 27, 30, 34, 40, 48, 57.36, 68.72, 81.02
  //   (sequential +5.0% rising to +20.0% into the year-ago quarter k = 8, then +19.5%, +19.8%, +17.9%); guide G = 90.99 (+12.3% sequential).
  // guidedYearAgoWindow = k = 0..8, newest first. YA = 48, TTM = 255.1, G / YA = 1.895625.
  // One yearly factor: share = 48 / 152, ρ = (152 / 95)^(1/4), s = share ÷ (ρ³ ÷ (1 + ρ + ρ² + ρ³)) ≈ 1.0682.
  // Year one = 4 × 90.99 ÷ s × 1.895625^0.375 ≈ 433.07B; TTM × (1 + g) = 255.1 × 1.895625 ≈ 483.57B; ratio ≈ 0.8956.
  expect(a.evidence!.guidedSeasonalFactor).toBeCloseTo(1.0682, 4);
  expect(a.yearOneRevenue).toBeLessThan(0.95 * ttmTimesYoy);                          // Task 3 as planned: = ttmTimesYoy
  expect(a.yearOneRevenue / ttmTimesYoy).toBeCloseTo(0.8956, 4);
  expect(a.yearOneRevenue).toBeCloseTo(4 * G / s * Math.pow(G / YA, 0.375), -6);
});
it("falls back to the TTM at the guided year-over-year pace with fewer than eight quarters ending at the year-ago quarter", () => {
  expect(a.evidence!.guidedSeasonalFactor).toBeNull();
  expect(a.yearOneRevenue).toBeCloseTo(ttm * (G / YA), -6);
});
```

Peak-quarter case (controller ruling 2026-10-29). The review's comment boosted "k ≡ 3 mod 4, and the guide", but the guide (k = 12) and its year-ago quarter (k = 8) are k ≡ 0 mod 4, so as written the season is not stable and s ≈ 0.963. The case boosts the guide's own fiscal quarter, k ≡ 0 mod 4, which gives s ≈ 1.105 and a year-one ratio of ≈ 1.0038 against TTM × (1 + g). The assertions are unchanged.

Compute wiring, in the same file:

```ts
it("supplies the quarters ending at the guided year-ago quarter on a 13-week basis (compute wiring)", () => {
  // runStageB on completeCurrencyBundle({}) with its incomeQuarterly rows replaced by eleven contiguous synthetic quarters
  // (EDGAR provenance with filed starts, as Task 1's wiring case builds them), an 8-K guide for the next quarter, no consensus.
  expect(assumptions.revenueAnchor!.source).toBe("guidance");
  expect(assumptions.revenueAnchor!.evidence!.guidedSeasonalFactor).not.toBeNull();          // HEAD: absent
  // control: the same bundle with its four oldest quarters removed (seven left): fewer than eight end at the year-ago quarter, the fallback
  const seven = runStageB(sevenQuarterBundle).valuation.assumptions!;
  expect(seven.revenueAnchor!.source).toBe("guidance");
  expect(seven.revenueAnchor!.evidence!.guidedSeasonalFactor).toBeNull();
});
```

These re-pinned fixtures carry no `guidedYearAgoWindow`, so they pin the fallback, and their values hold under the amended rule.

Re-pins in `tests/stageB.dcfAnchoring.test.ts` (each with a dated comment citing D-next):
- `:72-101`: add `guidedYearAgo: { date: "2025-10-26", revenue: 57.006 * B }` to `nvda()`'s guided cases; `evidence.guidedRunRate` 432B → `451.689e9` (`toBeCloseTo(451.689 * B, -7)`); guidance alone: year one 513.71B → `573.988 * B`, `guidedYoyPct` 89.45, `guidedPacePct` stays 58.72; the "contradicted" case uses `[{ 2027-01-31, 250B }, { 2028-01-30, 350B }]` (window 298.68B, below the 353.96B floor) and matches `/below the twelve-month floor the guidance implies/`; the "other quarter" case stays "run-rate".
- `:207-217`: year one 829.04B → `858.78 * B`; `guidedYoyPct` 10.71 and `guidedPacePct` −2.18 unchanged; title "carries the TTM at the guided quarter's growth over the same quarter a year earlier".
- `:219-223`: title "does not take a level from guidance without a year-ago quarter"; both cases `source` "run-rate" (no number pinned; the basis names why).

Re-pins in `tests/stageB.guidanceComparability.test.ts` (each with a dated comment citing D-next and OD-1). Its `inputs()` (`:22-28`) gives the quarter revenue no `guidedYearAgo`, so under OD-1 the four "preserves existing D60 extrapolation when annual context is %s" cases (`:53-63`) and the two "does not apply comparison evidence from a different %s" cases (`:64-69`) would fall to the run-rate and no longer exercise the comparability guard's admit path, which is what they test. Keep that intent:
- `:27` `quarterRevenue` gains `guidedYearAgo: { date: "2025-09-30", revenue: 4.41 * B }` (the release guides +5% to +8%; 4.7 / 4.41 − 1 = 6.58%).
- `:60-62` keep `source` "guidance" and `guidedPacePct` not null; the basis match becomes `/trailing twelve months carried twelve months at the guided year-over-year pace 6\.58%/` (was `/model extrapolation of quarterly guidance/`).
- `:68` keeps `source` "guidance".
- `:31-45` (the refused seasonal quarter) and `:74-80` (the below-range quarter) are unchanged: a 92-day calendar quarter has factor 1, so the guard refuses exactly as before.

- [ ] **Step 2: Run it.** `npx vitest run tests/stageB.seasonalGuidance.test.ts -t "FIN-101"` — expected FAIL: `expected 'guidance' to be 'consensus'`, `expected 26.78… to be close to 9.98`; `-t "FIN-301-V1"`: `expected 70.72… to be close to 58.53`. The pre-flight's cases, `-t "growth-adjusted|peak-quarter|decelerating|fewer than eight|compute wiring"`, fail on the absent `guidedSeasonalFactor` (undefined, so `toBeCloseTo` and `toBeNull` fail). The decelerating-grower case also guards against the first-planned rule, on which its ratio assertions fail (year one = TTM × (1 + g), ratio 1).
- [ ] **Step 3: Implement.** In `buildRevenueAnchor`: `gDays = periodDays(guide.periodStart, guide.periodEnd)`; `fG = thirteenWeekFactor(gDays)`, `fYA = thirteenWeekFactor(guidedYearAgo.days)`, `fL = thirteenWeekFactor(latest.days)`. A guided year-ago quarter counts only when it ends 250–300 days before the base period's end (it is the base period's oldest quarter). Then:

```ts
const g = guidedYearAgo === null ? null : (guide.revenue * fG) / (guidedYearAgo.revenue * fYA) - 1;   // guidedYoyPct = g × 100
const gLow = guidedYearAgo === null ? null : ((guide.revenueLow ?? guide.revenue) * fG) / (guidedYearAgo.revenue * fYA) - 1;
// sG (OD-1 decision 1, pre-flight R1): for each yearly factor k = 0, 1, 2 whose eight contiguous quarters exist in
// guidedYearAgoWindow (k years before the guided year-ago quarter), every quarter × its thirteenWeekFactor:
//   share_k = YA_k ÷ TTM ending YA_k;  ρ_k = (TTM ending YA_k ÷ the TTM a year earlier)^(1/4);
//   factor_k = share_k ÷ (ρ_k³ ÷ (1 + ρ_k + ρ_k² + ρ_k³));  sG = the mean of the factor_k, null below eight quarters
const guidedRunRate = g === null ? null
  : sG === null ? startRev * Math.pow(1 + g, 7.5 / 12)                  // fallback: TTM × (1 + g)^(7.5/12)
  : (4 * guide.revenue * fG) / sG;                                       // seasonally adjusted run-rate at the guided quarter
const guidedFloor = gLow === null ? null
  : (guide.revenueLow ?? guide.revenue) * fG + (startRev - guidedYearAgo.revenue * fYA) * Math.min(1, 1 + gLow);
const guidedPacePct = latest === null ? null : (Math.pow((guide.revenue * fG) / (latest * fL), 4) - 1) * 100; // evidence only
// guidance level (only when g !== null): raw = carry(guidedRunRate, 4.5 / 12, g × 100), main's carry (valuation.ts:1504 at B13);
//   in the fallback it equals startRev × (1 + g)
// consensusConsistent = ntm1 !== null && (guidedFloor === null || ntm1 >= guidedFloor)
// guard pace = [g × 100, runRate.yoyPct] (the sequential pace no longer widens it)
```

Texts: the consensus branch says "at or above the twelve-month floor the guidance implies (low end … plus the window's other three quarters at their year-ago level = …)"; the guidance branch says "the guided quarter … taken out of its season (÷ s = S, its share of its own trailing year against the share constant growth gives, the mean of N yearly factors) × 4 = L, carried 4.5 months at the guided year-over-year pace X% (guided quarter … over the quarter ending …, both on a 13-week basis)", and in the fallback "the trailing twelve months carried twelve months at the guided year-over-year pace X% (guided quarter … over the quarter ending …, both on a 13-week basis; fewer than eight quarters end at the year-ago quarter, so no seasonal factor)"; a withheld guide says "guidance … not used for year one: no same fiscal quarter a year earlier to put it on a twelve-month basis". The independent comparability guard (`:1449-1463`, quarter range × 4 against the same release's fiscal-year range) keeps its refuse/admit rule and only puts the quarter range on a 13-week basis (`4 × quarterLow × fG`, `4 × quarterHigh × fG`), so a 14-week fourth quarter is not refused for its extra week; it is a parse-plausibility check that only ever withholds guidance, and making it seasonally neutral is outside these findings (residual risk: a seasonal issuer guiding both a peak quarter and its year can still have its guidance withheld, which is conservative). When the guide's `periodEndBasis` is "13-week-quarter" and the issuer's rule (Task 2) gives the guided quarter's fiscal year 53 weeks, the guidance text adds "the guided quarter's length assumed to be 13 weeks: the fiscal year ending <rule year end> has 53 weeks and the release does not say which quarter holds the extra week" (Silicon Graphics put it in Q1). `guidedQuarterEnd(base, fiscalQuarter, rule)`: a fourth quarter whose rule year end lies 84–105 days after a non-month-end base ends there ("fiscal-year-end-rule"); otherwise unchanged. `nextPeriodRevenueGuidance` builds the rule from the deduped `bundle.statements.incomeAnnual` dates. The `path[0].status` text "(consensus is below the guided run-rate floor)" becomes "(consensus is below the twelve-month floor the guidance implies)". The `RevenueAnchor.evidence.guidedRunRate` doc comment ("Next-quarter guidance × 4") is rewritten to the new definition.
- [ ] **Step 4: Run it.** PASS. Re-run `npx vitest run tests/stageB.dcfAnchoring.test.ts tests/stageB.periodLength.test.ts tests/stageB.guidanceComparability.test.ts tests/filingDisclosures.integrity.test.ts tests/filingDisclosures.releaseCurrency.test.ts tests/currentReports.test.ts tests/currentReports.guidanceRanges.test.ts tests/report.thesisTriggers.test.ts`: the re-pinned values above (including the `stageB.guidanceComparability` re-pins, without which `:61` and `:68` fail with `expected 'run-rate' to be 'guidance'`), everything else unchanged (a calendar-quarter or non-fourth-quarter guide keeps its date; every refuse/admit outcome the comparability file pins stays). `grep -rn "model extrapolation of quarterly guidance\|low end × 4\|below the guided run-rate" tests src` must then find only the new wording or the D-60 house-rule sentence ("then model extrapolation of quarterly guidance, then the run-rate"), which still names the source order correctly.
- [ ] **Step 5: Benefit check.**
  - The FIN-101 probe's (a) and (b) assertions hold: on the probe's shape through the fallback, and under a stable season through the amended level, which agrees with TTM × (1 + g) (the peak-quarter case).
  - (c) holds, as do the FIN-301-V1 and FIN-301-V2 assertions. FIN-101-V2's seasonal swing (27.7pp, 88.9pp without the year-ago row) is gone (0.02pp; no guidance level without it).
  - The merge gate (pre-flight R1): the decelerating-grower case holds.
  - Replay (Task 29; the values at B13 are provenance, re-taken on B4a's base):
    - census NVDA keyless (guidance anchor): year one 548.97B → ≈538.57B and per share 434.00 → ≈403.46. That is 2.3% above the keyed consensus year one 526.40B, against main's 4.3% (Task 3 as first planned: 573.99B / 515.94);
    - census AMZN keyless: 829.09B / 98.81 → ≈828.03B / ≈98.64;
    - AMZN #43: year one moves from "model extrapolation of quarterly guidance … × 4" to the guided quarter taken out of its season, and per share from 83.40 to ≈83.30 at B13 (B4a's base is ≈86.38 before). Record both.
  - Must not move:
    - the consensus-anchored runs (AMZN #51/#52 and NVDA #48–#50): the new floors, 792.51B and 351.80B, sit below consensus, as the old 788.00B and 423.36B did. Their year one, WACC and per share move only by Task 2's calendar fix;
    - MU #46 (no admitted guidance) and DEMO.
  - No other census issuer has an admitted guidance anchor.
  - Census evidence row E5 (Task 29 Step C, `t02` against `t03`) records year one, per share and the guidance source on all 50 inputs. Any per share that moves by more than 10% stops for a named explanation; stop before Task 27 and report it to the main session.
- [ ] **Step 6: Docs.** In `docs/METHODOLOGY.md`, the anchor items (`:433-489`; `:491-547` at B13):
  - item 1: "at or above the guided quarter's low end × 4" (`:436`; `:494` at B13) and "A consensus below the guided run-rate predates or contradicts the outlook" (`:456-457`; `:514-515`) become the twelve-month floor;
  - item 2 (`:460-473`; `:518-531`), the guidance paragraph: the guided quarter taken out of its growth-adjusted season (the mean of up to three yearly factors), × 4 and carried at the guided pace, with TTM × (1 + g) below eight quarters; the retired sequential fallback; and the annual base period;
  - `:486-489` (`:544-547`): the guard widened by the guided year-over-year pace only, and the comparability guard on a 13-week basis;
  - `:537` (`:595`), "On NVDA's 2026-10-15 inputs, consensus sits above guidance × 4 ($432B)": the floor is now 353.96B on those inputs with the year-ago quarter, or no floor without one;
  - the "AMZN audit fixes (October 20, 2026)" paragraph (`:3090-3100`; `:3571-3581` at B13; "That puts year one at about $829B … The sequential pace is used only when the statements lack that quarter"): year one is now about $828B (the guided quarter taken out of its season, × 4 and carried), not the first-planned $858.8B, and from D-next guidance without that quarter sets no level;
  - `README.md`, if it mentions "guidance × 4" (`grep -n "× 4\|x 4" README.md docs/*.md`; at HEAD only METHODOLOGY matches).
- [ ] **Step 7: Commit.** `git add src/pipeline/stageB/valuation.ts src/pipeline/filingDisclosures.ts src/pipeline/compute.ts tests/stageB.seasonalGuidance.test.ts tests/stageB.dcfAnchoring.test.ts tests/stageB.guidanceComparability.test.ts docs/METHODOLOGY.md` then `git commit -m "Take guidance out of its own season on a 13-week basis, and test consensus against a seasonally neutral floor (FIN-101, FIN-301-V1, FIN-101-V2, FIN-301-V2)"`.

### Task 4: The reverse-DCF context gives only the like-for-like guided pace (FIN-101-V1)

Amended by pre-flight R2 (OD-1 point 6). The context sends only "guided-quarter revenue growth, year over year" (g; 10.73% for AMZN #52), with the issuer's caveats (Task 3b). It sends no run-rate or sequential row, because a level at the guided quarter is not a twelve-month growth; that defect is behind live #52's "annualized at 2.9%". The first draft's "guided run-rate growth over TTM (TTM at the guided year-over-year pace)" row would still have given AMZN 6.58%, a level 7.5 months out set against twelve-month growth. D-67 labels stay for the old ids. `thesisTriggers.ts:70` never prints a level dated at the guided quarter (the review's rule 5).

**Files:**
- Modify `src/pipeline/stageC/payload.ts:1032-1046` (`:1087-1101` at B13; extract the rows into an exported helper) and `:1134-1136` (`:1189-1191` at B13; the context note).
- Modify `docs/METHODOLOGY.md:2327-2330` (`:2487-2490` at B13).
- Modify `src/report/presentation.ts:200-205` (`EXACT_LABELS`): add the reader label for the one new registry id below. Keep the two D-67 entries for the old ids: stored reports 48, 50 and 52 cite `computed.valuation.guided-run-rate-growth-over-ttm-next-quarter-guidance-4` and `computed.valuation.guided-sequential-pace-annualized`, and they must keep their labels.
- Modify `src/report/thesisTriggers.ts:70`: the year-one window line drops "and the guided run-rate X", or prints the guidance branch's own level for that window. Either way it never prints a level dated at the guided quarter: `evidence.guidedRunRate`, which Task 3 makes a seasonally adjusted run-rate at the guided quarter.
- Modify `tests/report.thesisTriggers.test.ts` (one case beside `:114`, which builds its own evidence object).
- Test: create `tests/stageC.reverseDcfContext.test.ts`.

**Interfaces:**
- Produces: `export function reverseDcfContextFigures(anchor: RevenueAnchor | undefined, startRevenue: number | null, asOf: string | null): PayloadFigureInput[]` in `payload.ts`, called at `:1040` (`:1095` at B13). Task 3b, the next commit, adds a fourth argument (the caveats) and widens the return to `{ figures, notes }`.
- Rows (labels exact):
  - "DCF base-case year-one revenue growth over TTM" (unchanged).
  - "guided-quarter revenue growth, year over year", from `evidence.guidedYoyPct`, with the new source id `computed.valuation.reverseDcfContext.guidedYoy`. Task 3b attaches the issuer's caveats.
  - The consensus and latest-quarter rows, unchanged.
  - No run-rate row and no sequential row, with or without a year-ago quarter. HEAD's "guided run-rate growth over TTM (next-quarter guidance × 4)" (source id `computed.valuation.reverseDcfContext.guidedRunRate`) and "guided sequential pace, annualized" are no longer sent.
- Registry ids follow the label (`computed.valuation.<semanticSlug(label)>`, `payload.ts:2564`; `:2946` at B13). So the new label gives `computed.valuation.guided-quarter-revenue-growth-year-over-year` for new reports, and `EXACT_LABELS` gets "Guided-quarter revenue growth, year over year". The first draft's run-rate and "carries the season" labels and ids are not added.

- [ ] **Step 1: Write the failing test** in `tests/stageC.reverseDcfContext.test.ts`:

```ts
it("gives the like-for-like guided pace and no run-rate or sequential row", () => {
  const rows = reverseDcfContextFigures(anchorWith({ guidedYoyPct: 10.7294, guidedPacePct: -2.1871, guidedRunRate: 800e9 }), 767.4e9, "2026-09-30");
  expect(rows.find((r) => r.source === "computed.valuation.reverseDcfContext.guidedYoy")?.value).toBeCloseTo(10.7294, 4);
  expect(rows.find((r) => r.source === "computed.valuation.reverseDcfContext.guidedRunRate")).toBeUndefined(); // HEAD: 4.2481
  expect(rows.some((r) => /run-rate|sequential|× 4/.test(r.label))).toBe(false);
});
it("sends no sequential row when no year-ago quarter exists", () => {
  const rows = reverseDcfContextFigures(anchorWith({ guidedPacePct: 58.72, guidedRunRate: null }), 302.97e9, "2026-07-26");
  expect(rows.some((r) => /run-rate|sequential|× 4/.test(r.label))).toBe(false);  // HEAD: "guided sequential pace, annualized" = 58.72
  expect(rows.find((r) => r.source === "computed.valuation.reverseDcfContext.guidedYoy")).toBeUndefined();
});
it("names the guided year-over-year row in the context note", () => {
  // assembleContextPayload on a synthetic guidance-anchored DCF bundle whose reverse DCF has an implied growth (so the note is sent)
  const notes = assembleContextPayload(bundle, runStageB(bundle), { checks: [], flags: [], gaps: [] })
    .computed.find((s) => s.title === "Valuation (computed)")!.notes.join(" ");
  expect(notes).toMatch(/the guided quarter's year-over-year growth/);
  expect(notes).not.toMatch(/guided run-rate/);                                     // HEAD: "… the base-case year one, the guided run-rate, …"
});
it("gives the new registry id a reader label and keeps the stored reports' old ones", () => {
  expect(metricLabel("computed.valuation.guided-quarter-revenue-growth-year-over-year")).toBe("Guided-quarter revenue growth, year over year");
  expect(metricLabel("computed.valuation.guided-run-rate-growth-over-ttm-next-quarter-guidance-4")).toBe("Guided run-rate growth over TTM (next-quarter guidance × 4)"); // control (D-67)
});
```

In `tests/report.thesisTriggers.test.ts`, beside `:114`:

```ts
it("never prints a level dated at the guided quarter in the year-one window line (pre-flight R2)", () => {
  // fixture114(...) = the :114 case's computed() + Object.assign fixture, with revenueAnchor.source and evidence.guidedRunRate set per call
  const horizon = (source: "guidance" | "consensus", guidedRunRate: number | null) =>
    buildThesisTriggers(fixture114({ source, guidedRunRate })).find((t) => t.id === "reverse-growth")!.horizon;
  expect(horizon("guidance", 432e9)).not.toMatch(/guided run-rate/);                // HEAD: "… and the guided run-rate $432.00B"
  expect(horizon("guidance", 432e9)).not.toMatch(/\$432(\.00)?B/);                   // the level itself is not printed either
  expect(horizon("consensus", 432e9)).toEqual(horizon("consensus", null));          // the line no longer depends on the guided run-rate
  expect(horizon("consensus", null)).toMatch(/consensus \$551\.81B/);               // control: the consensus clause stays, as at HEAD
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/stageC.reverseDcfContext.test.ts tests/report.thesisTriggers.test.ts` — expected FAIL: `reverseDcfContextFigures is not a function`, then the run-rate row found (HEAD: 4.2481) and `expected true to be false` on the sequential row; the note case fails on HEAD's "the guided run-rate" wording; the thesis-trigger case fails on HEAD's "and the guided run-rate" clause (its consensus control passes).
- [ ] **Step 3: Implement** the helper and rows as above. The context note lists "the base-case year one, the guided quarter's year-over-year growth, consensus year one and the latest quarter's year-over-year growth". The note sits at `payload.ts:1135` at `6542531` and `:1190` at B13; that line is the note, not the test file (pre-flight P10). `thesisTriggers.ts:70` drops the guided run-rate clause, or prints the guidance branch's own year-one level, per Files.
- [ ] **Step 4: Run it.** PASS. Re-run `npx vitest run tests/report.presentation.d67.test.ts`: unchanged, since the old ids keep their labels. Re-run `tests/stageC.payload.passes.test.ts`: its golden is expected to move on the note's wording whenever the fixture's reverse DCF has an implied growth, and on the rows only if the fixture carries guidance; re-pin in Task 24, not here.
- [ ] **Step 5: Benefit check.** FIN-101-V1 probe (a)'s assertion ("a payload figure carries guidedYoyPct") holds on report 43 in the replay (Task 29): the AMZN payload carries 10.7294 under the new row, with no −2.1871 row and no run-rate row. Probe (b)'s swing (+96.6% vs −58.5%) no longer reaches the payload. AMZN #51/#52: the context gives 10.73% instead of 2.88%, and no figure moves (consensus anchor). Stored reports 48, 50 and 52 keep quoting their stored row (bytes unchanged), and their citations still resolve against their own snapshots. Live #52's stored prose stays (D-67); Task 17's `guidedFloorTimesFour` row covers its consistency-test text.
- [ ] **Step 6: Docs.** `docs/METHODOLOGY.md:2327-2330` (`:2487-2490` at B13): list the rows actually sent. Each is growth over the same TTM start revenue, except the guided year-over-year row, which is the guided quarter over its year-ago quarter. State that no run-rate or sequential row is sent, and why.
- [ ] **Step 7: Commit.** `git add src/pipeline/stageC/payload.ts src/report/presentation.ts src/report/thesisTriggers.ts tests/stageC.reverseDcfContext.test.ts tests/report.thesisTriggers.test.ts docs/METHODOLOGY.md` then `git commit -m "Give the analyst only the like-for-like guided pace in the reverse-DCF context (FIN-101-V1)"`.

### Task 3b: Calendar-shifted events are disclosed beside the guided pace, and no figure moves (pre-flight R4; REPORT52 item 4, F-03)

New (pre-flight R4; OD-1 point 7). It runs after Task 4, whose context helper it extends.

The payload already prints each outlook qualifier in the guidance section ("Outlook caveat (issuer text)", `payload.ts:2594` at B13). Yet live #52's verdict still used 2.9% one-sidedly, because nothing tied the caveat to the growth rows. The parser already keeps the sentences: `parseGuidance` (`src/edgar/currentReports.ts:431-438` at B13) keeps at most four per release. AMZN #52's bundle holds both releases:
- 2026-07-30: "Excluding the impact of Prime Day in both 2025 and 2026, third quarter 2026 year-over-year growth would be nearly 400 basis points higher."
- 2026-04-29: "This guidance assumes that Prime Day occurs in second quarter 2026."

A generic level rule is not safe today. An "excluding X, growth would be N bp higher" sentence covers timing items, but also persistent ones (FX, a divestiture), and adding the latter back would overstate year one. So this task discloses the effect and does not move the level.

**Rule.**
1. The guided-quarter growth row carries the qualifiers of the release that issued the guide, as `Outlook caveat on <row label>: …` entries in the valuation section's notes (never a figure field). A qualifier matching `/\bexcluding\b[^.]*\byear-over-year growth would be (?:nearly |approximately |about |roughly )?(\d+(?:\.\d+)?) basis points (higher|lower)\b/i` also sets `evidence.guidedYoyIssuerEffectPp` (signed, bp ÷ 100), and the anchor basis states it. The regex runs on the raw parsed sentence, before the rating-language filter (`filingDisclosures.ts:712`), which applies only to displayed text.
2. The latest-quarter YoY row carries the qualifiers of the earlier release whose guided period is the latest reported quarter, as the same kind of note. That is the pairing `disclosures.guidanceChecks` already makes.
3. No figure moves; year one uses the reported guidance. A regex miss keeps today's behaviour.

**Files:**
- Modify `src/edgar/currentReports.ts`: export `parseIssuerGrowthEffect` beside `parseGuidance`.
- Modify `src/pipeline/filingDisclosures.ts`:
  - `RevenueGuidanceAnchor.qualifiers?: readonly string[]`, set in `nextPeriodRevenueGuidance` (`:309-348` at B13) from `release.guidance.qualifiers`, raw, as `parseGuidance` keeps them (`currentReports.ts:431-438`, at most four);
  - export `outlookCaveats` (Interfaces): one release's qualifiers through the same rating-language filter as `:712` (`safeText`, `:134`).
- Modify `src/pipeline/compute.ts`, `dcfGuidance` (`:3227-3244` at B13; `:3202-3219` at `6542531`): copy `outlook.qualifiers` onto `DcfGuidance.qualifiers`.
- Modify `src/pipeline/stageB/valuation.ts`: `DcfGuidance.qualifiers?`, the evidence field and the basis text.
- Modify `src/pipeline/stageC/payload.ts`:
  - Task 4's helper gains the fourth argument and returns its caveat notes;
  - `computedSections` (`:697`) receives the caveats, which `assembleContextPayload` (`:3422`; the call at `:3485`) builds from `disclosures` and the bundle;
  - the caveat notes join the valuation section's notes after the context note (`:1189-1191` at B13).
- Modify `docs/METHODOLOGY.md`.
- Tests: create `tests/currentReports.issuerGrowthEffect.test.ts`; modify `tests/stageB.seasonalGuidance.test.ts` (Task 3's file) and `tests/stageC.reverseDcfContext.test.ts` (Task 4's file).
- Payload stamp and golden: in B5a with Task 4 (Tasks 23 and 24).

**Interfaces:**
- `export function parseIssuerGrowthEffect(sentence: string): { pp: number } | null`, built on the Rule's regex: `pp` = +bp ÷ 100 for "higher" and −bp ÷ 100 for "lower"; null on no match.
- `RevenueGuidanceAnchor.qualifiers?: readonly string[]` (`filingDisclosures.ts`): the issuing release's outlook caveats, raw.
- `DcfGuidance.qualifiers?: readonly string[]`: copied by `dcfGuidance`, raw. `buildRevenueAnchor` runs `parseIssuerGrowthEffect` on each raw sentence, before (and independent of) the rating-language filter; the first match sets the evidence.
- `RevenueAnchor.evidence.guidedYoyIssuerEffectPp?: number | null` (signed).
- Basis, when the effect is parsed: "the issuer states that, excluding an item it names, the guided quarter's year-over-year growth would be about X.XXpp higher|lower; year one uses the reported guidance".
- `export function outlookCaveats(bundle: DataBundle, accession: string | null): readonly string[]` in `filingDisclosures.ts`.
  - It returns the qualifiers of the retained release with that accession, each as `safeText(q, "An issuer outlook caveat is withheld from display by the rating-language filter; see the release.")`, the text `:712` displays.
  - It returns `[]` when the accession is null or no release matches.
- Task 4's helper becomes `reverseDcfContextFigures(anchor, startRevenue, asOf, caveats: { guided: readonly string[]; latestQuarter: readonly string[] } = { guided: [], latestQuarter: [] }): { figures: PayloadFigureInput[]; notes: string[] }`.
  - `figures` are Task 4's rows, unchanged by the caveats.
  - `notes` holds one `Outlook caveat on <row label>: <text>` entry per caveat whose row is sent. `guided` goes on "guided-quarter revenue growth, year over year" and `latestQuarter` on "latest-quarter revenue growth, year over year". A caveat whose row is not sent is dropped.
  - Task 4's helper tests read `.figures` from this commit on.
- The caller is `assembleContextPayload`.
  - `caveats.guided = outlookCaveats(bundle, <the guide's accession>)`, the accession in `evidence.guidedQuarter.source` ("sec:8-K EX-99.1 <accession>").
  - `caveats.latestQuarter = outlookCaveats(bundle, check.guidance.accession)`, for the newest revenue entry of `disclosures.guidanceChecks` whose `periodEnd` is within 3 days of `anchor.runRate.latestQuarterEnd` (the pairing `guidanceChecks` makes, `filingDisclosures.ts:424-462`; the same 3-day tolerance it uses).
  - Both reach the helper through `computedSections`. The helper's notes are pushed into the valuation section's notes after the context note.

- [ ] **Step 1: Write the failing tests.** In `tests/currentReports.issuerGrowthEffect.test.ts`:

```ts
it("parses an issuer-quantified ex-item growth effect and nothing else", () => {
  expect(parseIssuerGrowthEffect("Excluding the impact of the annual sales event in both 2025 and 2026, third quarter 2026 year-over-year growth would be nearly 400 basis points higher.")).toEqual({ pp: 4 });
  expect(parseIssuerGrowthEffect("Excluding the divested unit, fourth quarter year-over-year growth would be approximately 150 basis points lower.")).toEqual({ pp: -1.5 });
  expect(parseIssuerGrowthEffect("This guidance anticipates an unfavorable impact of approximately 30 basis points from foreign exchange rates.")).toBeNull();
  expect(parseIssuerGrowthEffect("This guidance assumes that the annual sales event occurs in second quarter 2026.")).toBeNull();
});
it("carries the issuing release's raw qualifiers on the guidance anchor, and only filtered text to display", () => {
  // bundle = bundleWith([...]) as tests/currentReports.guidanceRanges.test.ts:158 builds it: one release (releaseText, accession
  // "0000000001-26-000010") whose outlook guides next-quarter revenue and carries the 400bp sentence above as a qualifier
  const anchor = nextPeriodRevenueGuidance(bundle)!;
  expect(anchor.qualifiers).toEqual(parseGuidance(releaseText)!.qualifiers);              // raw, exactly as parseGuidance keeps them
  expect(anchor.qualifiers!.map(parseIssuerGrowthEffect)).toContainEqual({ pp: 4 });      // the regex reads the raw sentence
  expect(dcfGuidance(bundle, anchor.currency)!.qualifiers).toEqual(anchor.qualifiers);     // compute passes them on unfiltered
  expect(outlookCaveats(bundle, anchor.accession)).toEqual(anchor.qualifiers!.map((q) =>
    noBuySellHold(q) ? q : "An issuer outlook caveat is withheld from display by the rating-language filter; see the release."));
  expect(outlookCaveats(bundle, null)).toEqual([]);
  expect(outlookCaveats(bundle, "0000000000-00-000000")).toEqual([]);                    // no release with that accession
});
```

In `tests/stageB.seasonalGuidance.test.ts`:

```ts
it("states the issuer's ex-item effect beside the guided pace without moving year one", () => {
  expect(withQualifier.yearOneRevenue).toBe(withoutQualifier.yearOneRevenue);
  expect(withQualifier.evidence!.guidedYoyIssuerEffectPp).toBe(4);
  expect(withQualifier.basis).toMatch(/the issuer states that, excluding an item it names, the guided quarter's year-over-year growth would be about 4\.00pp higher; year one uses the reported guidance/);
});
```

In `tests/stageC.reverseDcfContext.test.ts`:

```ts
const GUIDED = "Excluding the impact of the annual sales event in both 2025 and 2026, third quarter 2026 year-over-year growth would be nearly 400 basis points higher.";
const LATEST = "This guidance assumes that the annual sales event occurs in second quarter 2026.";
it("carries each outlook caveat to the growth row it qualifies, as a context note", () => {
  // anchorWith: Task 4's fixture builder; its anchor carries a runRate, so the latest-quarter row is sent
  const anchor = anchorWith({ guidedYoyPct: 10.7294, guidedPacePct: -2.1871, guidedRunRate: 800e9 });
  const plain = reverseDcfContextFigures(anchor, 767.4e9, "2026-09-30");
  const withCaveats = reverseDcfContextFigures(anchor, 767.4e9, "2026-09-30", { guided: [GUIDED], latestQuarter: [LATEST] });
  expect(withCaveats.notes).toEqual([
    `Outlook caveat on guided-quarter revenue growth, year over year: ${GUIDED}`,
    `Outlook caveat on latest-quarter revenue growth, year over year: ${LATEST}`,
  ]);
  expect(withCaveats.figures).toEqual(plain.figures);                                     // no figure moves
  expect(withCaveats.figures.find((r) => r.source === "computed.valuation.reverseDcfContext.guidedYoy")?.value).toBeCloseTo(10.7294, 4);
  expect(withCaveats.figures.some((r) => "caveats" in r)).toBe(false);                    // never a figure field
  expect(plain.notes).toEqual([]);                                                       // control: no caveats, no notes
  // a caveat whose row is not sent is dropped: no year-ago quarter → no guided row → no guided caveat note
  const noGuidedRow = reverseDcfContextFigures(anchorWith({ guidedPacePct: 58.72, guidedRunRate: null }), 302.97e9, "2026-07-26", { guided: [GUIDED], latestQuarter: [] });
  expect(noGuidedRow.notes).toEqual([]);
});
it("builds the caveats from the issuing release and the release guidanceChecks pairs with the latest quarter (wiring)", () => {
  // twoReleaseBundle: the note case's synthetic DCF bundle with two releases, built as tests/currentReports.guidanceRanges.test.ts:158
  // builds them. The earlier release guided the latest reported quarter and carries LATEST; the newer one issued the guide and carries GUIDED.
  const notes = assembleContextPayload(twoReleaseBundle, runStageB(twoReleaseBundle), { checks: [], flags: [], gaps: [] })
    .computed.find((s) => s.title === "Valuation (computed)")!.notes;
  expect(notes).toContain(`Outlook caveat on guided-quarter revenue growth, year over year: ${GUIDED}`);
  expect(notes).toContain(`Outlook caveat on latest-quarter revenue growth, year over year: ${LATEST}`);
  expect(notes.filter((n) => n.startsWith("Outlook caveat on "))).toHaveLength(2);
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/currentReports.issuerGrowthEffect.test.ts tests/stageB.seasonalGuidance.test.ts tests/stageC.reverseDcfContext.test.ts` — expected FAIL:
  - `parseIssuerGrowthEffect is not a function` and `outlookCaveats is not a function`;
  - `expected undefined to equal [...]` on `anchor.qualifiers`;
  - `expected undefined to be 4`;
  - on the helper, `withCaveats.notes` and `plain.notes` are undefined (Task 4's helper returns an array);
  - the wiring case finds no `Outlook caveat on` note.
- [ ] **Step 3: Implement** per the Rule and Interfaces.
  - `nextPeriodRevenueGuidance` copies the release's raw qualifiers, `dcfGuidance` passes them on, and `buildRevenueAnchor` runs `parseIssuerGrowthEffect` on the raw sentences.
  - `assembleContextPayload` builds the two caveat lists with `outlookCaveats`: the guided release by the guide's accession, and the latest quarter's through the `guidanceChecks` pairing. It passes them through `computedSections` to the helper, whose notes join the valuation section's notes after the context note.
  - Task 4's three helper cases switch to `.figures`, with no assertion changed.
  - The year-one level and every figure are untouched.
- [ ] **Step 4: Run it.** PASS. Re-run `npx vitest run tests/currentReports.test.ts tests/currentReports.guidanceRanges.test.ts tests/stageB.dcfAnchoring.test.ts tests/stageB.guidanceComparability.test.ts tests/filingDisclosures.integrity.test.ts`: unchanged. `tests/stageC.payload.passes.test.ts` moves only if its fixture's release carries an outlook qualifier; re-pin in Task 24.
- [ ] **Step 5: Benefit check.**
  - No figure moves anywhere: year one is equal with and without the qualifier.
  - Replay (Task 29): AMZN #51/#52 (snapshot52), #43 and census AMZN gain the two caveats on their rows. NVDA's releases carry no quantified effect, so they gain caveats only if their releases carry qualifiers.
  - Shapes hurt: none numerically. A regex miss leaves today's behaviour, so the rule fails safe.
  - Residual (not in B5). Applying g plus the effect for a timing item only needs a timing-versus-persistent classifier first; it is routed to R2 or a later batch. Measured on AMZN keyless: with Task 3's amended rule, 869.44B / 105.95 (+7.22% against main), within 0.8% of the keyed consensus 876.36B; with Task 3 as first planned, 889.93B / 109.94 (+11.26%).
  - On the error: the TTM holds two Prime Days, so the reported pace on the TTM misses by about 3E and the ex-event pace on the TTM by about 1E, where E is the event's revenue.
  - The disposition note records 869.44B as the option's size (Task 28).
- [ ] **Step 6: Docs.** In `docs/METHODOLOGY.md`, anchor item 2 (the guidance paragraph) and the reverse-DCF context paragraph (`:2487-2490` at B13) gain the rule. The guided-quarter row carries the issuing release's caveats, and the latest-quarter row the earlier release's. A quantified ex-item effect is stated beside the guided pace and does not move year one.
- [ ] **Step 7: Commit.** `git add src/edgar/currentReports.ts src/pipeline/filingDisclosures.ts src/pipeline/compute.ts src/pipeline/stageB/valuation.ts src/pipeline/stageC/payload.ts tests/currentReports.issuerGrowthEffect.test.ts tests/stageB.seasonalGuidance.test.ts tests/stageC.reverseDcfContext.test.ts docs/METHODOLOGY.md` then `git commit -m "State the issuer's calendar-shifted event beside the guided pace without moving year one (pre-flight R4)"`.

### Tasks 5-16: in Part B (B5b)

Moved to Part B with their numbers (pre-flight split); Part B also holds the new Tasks 7b and 10b beside them.

### Task 17: Stored reports: display-time notes, B5a rows (needs reinterpretation: FIN-101, FIN-301, FIN-301-V3; FIN-101-V1's stored consistency text)

Read first (AGENTS.md): the two Next.js guides named in Global Constraints (this task edits `ReportView.tsx`'s composition line only).

Amended by the pre-flight (split, P3, P4, R2). This task builds the module and its B5a rows only. B5b's rows are Task 17b's (Part B), under their own cutoff: `terminalYearSkipped`, `newBorrower`, `reverseRangeEnd`, `currentCapitalStart` and `degradedInputs`, and Tasks 18-21's four.

**Files:**
- Create `src/report/legacyValuationNotes.ts`.
- Modify the five composition sites: `src/report/legacyEntitySafety.ts:71`, `src/report/export/markdown.ts:950`, `src/report/export/auditMarkdown.ts:461`, `src/report/export/printHtml.ts:764` and `src/components/report/ReportView.tsx:183` (`:73`, `:952`, `:463`, `:766` and `:185` at B13).
  - Compose `withLegacyValuationNotes` outermost, `withLegacyValuationNotes(withLegacyBridgeMethod(withLegacyEdgarDerivedLines(…)))`, outside B4a Task 15's `withLegacyBridgeMethod` (pre-flight P4).
  - At B13 each site composes four views, `withLegacyEdgarDerivedLines(withLegacyPayloadRecordSafety(withHistoricalEnterpriseValueSafety(withPrincipalSummarySafety(x))))`, and B4a adds a fifth. The first draft's "beside `withPrincipalSummarySafety`" no longer names a position.
- Modify `vitest.shared.ts`: add `src/report/legacyValuationNotes.ts` to `RISK_SOURCE_MANIFEST`, after B4a's `src/report/legacyBridgeMethod.ts`, which follows `:125` `legacyEdgarDerivedLines.ts` at B13.
- Modify `tests/risk.coverage.test.ts`: add it to `EXPECTED_RISK_SOURCES`, after `:112` (B13) and B4a's entry. Otherwise `:364` fails (Global Constraints, risk manifest).
- Test: create `tests/report.legacyValuationNotes.test.ts`.

**Interfaces:**
- `export const LEGACY_VALUATION_NOTE_FIELD = "presentation.legacyValuation"` (each entry `field: \`${LEGACY_VALUATION_NOTE_FIELD}.${key}\``, `severity: "info"`, `expected: true`).
- `export const ANNUALIZATION_CONVENTION_SPEC = "1.51.0"` (expected: the REPORT_SPEC_VERSION Task 23 sets, next after B4a's merge; renumbered at merge, then FROZEN).
  - It sits above B4a's `BRIDGE_METHOD_SINCE_SPEC_VERSION` "1.50.0" (pre-flight P3).
  - A B5a row applies only to a report whose `meta.specVersion` is lower. The comparison is B3's `specVersionBefore(report.meta.specVersion ?? "", ANNUALIZATION_CONVENTION_SPEC)`, imported from `src/report/legacyPayloadRecordSafety.ts` (numeric semver; an unparsable or missing version counts as before).
  - Master plan conflict row 5 and decisions spec 2.15 allow one comparator; write no second one here. B5b's rows and B6 Task 5A's use the same import.
  - If B3's export is missing on the branch base, stop: B3 merges first.
- `export function withLegacyValuationNotes(report: Report): Report`: an immutable view.
  - It returns the same object when nothing applies, and is idempotent: an already-present entry is not added twice, as `withPrincipalSummarySafety` does.
  - Each row compares the report's spec with its own cutoff: B5a's rows with `ANNUALIZATION_CONVENTION_SPEC`, B5b's (Task 17b and Tasks 18-21) with `DCF_INPUTS_CONVENTION_SPEC`, and B6 Task 5A's (FIN-506's `impliedReturnShareBasis`) with B6's own spec.
  - Write no module-wide early return keyed to any of them: a report built between two merges must still reach the later rows.

Rules, each reading stored bytes only (`valuation.dcf.assumptions[]` rows `{ name, value, basis }`, figure `periodContext`s, `appendix.missingData`, `fairValue.reasons`, key-number and score `period`s). The detectors below were checked by the reviewer against all 51 stored reports in `tmp/audit-2026-10-27/data/reports/` (2026-10-27): stored reports carry few `periodContext`s (#49 and #47 one each, #50/#52 three, #48 six, #46 four), so no detector may depend on a run of annual contexts, and the generic D-60 house-rule sentence "(house rule D-60: consensus levels when consistent with admitted guidance extrapolation, then model extrapolation of quarterly guidance, then the run-rate)" sits in every anchor basis since D-60, so a detector must match the guidance branch's own wording.

| key | finding | detector (all must hold) | note text (shape) | stored reports it fires on |
|---|---|---|---|---|
| `quarterLength` | FIN-301 | "year-one revenue anchor" basis has `latest quarter ending D × 4 = X`; a stored `fiscal-quarter` `periodContext` ends on D and `weeksOf(periodDays(start, end)) ∉ {13, null}` | "Built before spec S: the run-rate annualised the w-week quarter ending D × 4 (X). From S a w-week quarter is put on a 13-week basis (× 13/w): X × 13/w. Stored figures are unchanged." | #46 (Q4 FY2026 2026-05-29..2026-09-03, 98 days) |
| `guidedTimesFour` | FIN-101 | the same basis contains `model extrapolation of quarterly guidance:` (with the colon: the guidance branch's text) or `sits below the guided run-rate and is not used for year one` | "Built before S: year one annualised the guided quarter × 4, which carries that quarter's season; from S the guided quarter is first taken out of its own season (divided by its growth-adjusted share of its trailing year) before × 4, with the trailing twelve months at the guided year-over-year pace only below eight quarters, and consensus is tested against a twelve-month floor." | #43 only (without the colon the detector would also fire on #46–#52, whose anchors are run-rate or consensus) |
| `fiscalYearEnd` | FIN-301-V3 | the basis names `the fiscal year ending D contributes`; some stored `fiscal-quarter` or `fiscal-year` `periodContext` is a whole number of weeks (91/98 or 364/371 days) and does not end on a month's last day (a 52/53-week filer, whose periods all end on one weekday: 26 CFR 1.441-2); D falls on a different weekday from that context's end (so D cannot be the issuer's year end) | "The consensus window used the provider's fiscal-year date D (a <weekday of D>); this issuer's fiscal periods end on <weekday of the context end>s, so its year end is a different day up to six days away, and year one and year two may each carry a few days' revenue of the other year. Stored figures are unchanged." (The view does not name the issuer's year end: one stored period cannot establish which weekday rule applies, Task 2.) | #47, #48, #49, #50, #52 (D 2027-01-25 is a Monday; their stored periods end on Sundays) |
| `guidedFloorTimesFour` (pre-flight R2) | FIN-101, FIN-101-V1 | spec before `ANNUALIZATION_CONVENTION_SPEC`, and the anchor basis contains `at or above the guided run-rate (management guidance` … `× 4 =` | "Built before spec S: consensus was tested against the guided quarter × 4 (X; low end Y), which carries that quarter's season and timing. From S it is tested against the twelve-month floor the guidance implies, and the reverse-DCF context gives the guided quarter's year-over-year growth. Stored figures and prose are unchanged." | stored #47, #48, #49, #50 and #52 (NVDA, specs 1.43.0–1.44.0: "× 4 = 432B; low end × 4 = 423.36B") and live AMZN #52 (spec 1.48.0: "management guidance 199.5B … × 4 = 798B; low end × 4 = 788B"); no other report. #43 keeps `guidedTimesFour`, and #46's run-rate "× 4" does not match |

Task 17b (Part B) adds B5b's five rows, `terminalYearSkipped`, `newBorrower`, `reverseRangeEnd`, `currentCapitalStart` and `degradedInputs`, with FIN-114's no-rule note. Tasks 18-21 then each add one row in their own commit: `reverseMarginFamily` (FIN-501), `taxSeedOneOff` (FIN-502), `sigmaCap` (FIN-512) and the display-only correction `scenarioFloorSentence` (RPT-502). FIN-506's `impliedReturnShareBasis` row moved to B6 Task 5A with its finding (decisions spec 4.3). Step 5's expected list is for this task's rows; the final per-report list, with Part B's rows, is in Task 29b.

- [ ] **Step 1: Write the failing test** in `tests/report.legacyValuationNotes.test.ts`. Build each stored report from `fixtures/report/DEMO-sample.json` (checked in), with the detector's strings and period contexts copied in (MU's and NVDA's SEC quarter dates; no FMP values):

```ts
it("notes a stored 14-week quarter × 4 run-rate and leaves the stored bytes alone", () => {
  const stored = demoWith({ specVersion: "1.38.0", anchorBasis: "… latest quarter ending 2026-09-03 × 4 = 216.92B …", quarter: { start: "2026-05-29", end: "2026-09-03" } });
  const before = JSON.stringify(stored);
  const view = withLegacyValuationNotes(stored);
  expect(view.appendix.missingData.find((g) => g.field === "presentation.legacyValuation.quarterLength")!.reason)
    .toMatch(/14-week quarter ending 2026-09-03 × 4 \(216\.92B\).*× 13\/14\): 201\.42B/);
  expect(JSON.stringify(stored)).toBe(before);
});
const HOUSE_RULE = "(house rule D-60: consensus levels when consistent with admitted guidance extrapolation, then model extrapolation of quarterly guidance, then the run-rate)";
const noteFor = (r: Report, key: string) => withLegacyValuationNotes(r).appendix.missingData.find((g) => g.field === `presentation.legacyValuation.${key}`);
it("notes the provider's off-weekday date for a 52/53-week filer, without naming a year end it cannot establish", () => {
  // the #49 shape: one fiscal-quarter context 2026-04-27..2026-07-26, ending on a Sunday
  const basis = "… the fiscal year ending 2027-01-25 contributes …";
  expect(noteFor(demoWith({ specVersion: "1.44.0", anchorBasis: basis, quarter: { start: "2026-04-27", end: "2026-07-26" } }), "fiscalYearEnd")!.reason)
    .toMatch(/fiscal-year date 2027-01-25 \(a Monday\); this issuer's fiscal periods end on Sundays/);
  // control: the same basis with a calendar-quarter context
  expect(noteFor(demoWith({ specVersion: "1.44.0", anchorBasis: basis, quarter: { start: "2026-04-01", end: "2026-06-30" } }), "fiscalYearEnd")).toBeUndefined();
  // control: D on the context's weekday (2027-01-24, a Sunday)
  expect(noteFor(demoWith({ specVersion: "1.44.0", anchorBasis: "… the fiscal year ending 2027-01-24 contributes …", quarter: { start: "2026-04-27", end: "2026-07-26" } }), "fiscalYearEnd")).toBeUndefined();
});
it("does not take the D-60 house-rule sentence for the guidance branch", () => {
  expect(noteFor(demoWith({ specVersion: "1.44.0", anchorBasis: `run-rate: … ${HOUSE_RULE}` }), "guidedTimesFour")).toBeUndefined();
});
it("notes a stored consensus test against the guided quarter × 4 (pre-flight R2)", () => {
  const stored = demoWith({ specVersion: "1.44.0", anchorBasis: "… at or above the guided run-rate (management guidance 108B … × 4 = 432B; low end × 4 = 423.36B) …" });
  expect(noteFor(stored, "guidedFloorTimesFour")!.reason).toMatch(/tested against the guided quarter × 4 \(432B; low end 423\.36B\)/);
  // control: a run-rate anchor basis carrying the D-60 house-rule sentence gains none
  expect(noteFor(demoWith({ specVersion: "1.44.0", anchorBasis: `run-rate: … ${HOUSE_RULE}` }), "guidedFloorTimesFour")).toBeUndefined();
});
it("adds no note to a report built at or after the convention spec", () => {
  const stored = demoWith({ specVersion: ANNUALIZATION_CONVENTION_SPEC, anchorBasis: "… latest quarter ending 2026-09-03 × 4 = 216.92B …", quarter: { start: "2026-05-29", end: "2026-09-03" } });
  expect(withLegacyValuationNotes(stored)).toBe(stored);                                  // the same object
});
it("adds no note and does not throw on a report without quarter period contexts", () => {
  const noContext = demoWith({ specVersion: "1.38.0", anchorBasis: "… latest quarter ending 2026-09-03 × 4 = 216.92B …" });   // no quarter context
  expect(noteFor(noContext, "quarterLength")).toBeUndefined();
  const sample = demoSample();                     // fixtures/report/DEMO-sample.json as checked in (spec 1.2.0), the base demoWith builds on
  expect(withLegacyValuationNotes(sample)).toBe(sample);
});
it("is idempotent", () => { expect(withLegacyValuationNotes(withLegacyValuationNotes(stored))).toEqual(withLegacyValuationNotes(stored)); });
it("is idempotent through the full composed view chain (pre-flight P4)", () => {
  const chain = (r: Report) => withLegacyValuationNotes(withLegacyBridgeMethod(withLegacyEdgarDerivedLines(
    withLegacyPayloadRecordSafety(withHistoricalEnterpriseValueSafety(withPrincipalSummarySafety(r))))));
  expect(chain(chain(stored))).toEqual(chain(stored));
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/report.legacyValuationNotes.test.ts` — expected FAIL: `Cannot find module '@/report/legacyValuationNotes'`.
- [ ] **Step 3: Implement** the module per the table, compose it outermost at the five call sites, and add it to both risk lists (Files).
  - No rule rewrites model-authored prose or any claim text a verification-log entry names. B5a's rows only add `appendix.missingData` notes.
  - The view is applied before `indexVerificationMarks` runs, as the existing views are.
  - A `periodContext` without a strict ISO `start` and `end`, or without a `basis`, is skipped (stored #48, #50 and #52 carry such contexts).
- [ ] **Step 4: Run it.** PASS. Re-run `npx vitest run tests/risk.coverage.test.ts tests/report.versionStamps.test.ts tests/report.runDisclosure.test.ts`. Then re-run the tests that already exercise the composed view chain: `npx vitest run tests/currentReports.principalAggregation.test.ts tests/report.dossier.test.ts tests/report.outputAudit.test.ts tests/report.uiParity.test.ts tests/report.presentation.d67.test.ts tests/report.legacyBridgeMethod.test.ts`. The legacy 1.2.0 sample still renders and its stored bytes are unchanged.
- [ ] **Step 5: Benefit check.** Read **all 51** stored reports through the view, plus the live AMZN #51 and #52 report extracts (pre-flight P7). The extracts are `report-previous.json` and `report-newest.json` in `%USERPROFILE%\metis-backups\fix-state\b4-evidence\amzn-review\out-1029d\`, read-only. Use Task 29's `stored.mts`, with no network, and record which notes each report gains. The reviewers' read-only scans expect exactly these B5a rows:
  - #43: `guidedTimesFour`;
  - #46: `quarterLength` (216.92B → 201.42B stated);
  - #47, #48, #49, #50 and #52: `fiscalYearEnd` and `guidedFloorTimesFour`;
  - live AMZN #52: `guidedFloorTimesFour` only (calendar quarters, so no `fiscalYearEnd`; a consensus anchor, so no `guidedTimesFour`);
  - live #51: recorded (the pre-flight's scan found `guidedFloorTimesFour` on no other report);
  - every other report: nothing.

  Any other note is a false positive to fix before merging, and no view may throw. Stored files' bytes compare equal before and after: `git status` is clean for `data/`, and the `tmp/` reports and the two extracts are byte-identical.
- [ ] **Step 6: Docs.** In `docs/METHODOLOGY.md`, section "## Projections, scenario targets and intrinsic-value display" (`:2187` at `6542531`, `:2347` at B13), add a paragraph "**Stored valuations read under the 13-week convention (D-next).**". It lists B5a's notes, the spec they key on (`ANNUALIZATION_CONVENTION_SPEC`), and that stored figures are never recomputed; Task 17b adds B5b's.
- [ ] **Step 7: Commit.** `git add src/report/legacyValuationNotes.ts src/report/legacyEntitySafety.ts src/report/export/markdown.ts src/report/export/auditMarkdown.ts src/report/export/printHtml.ts src/components/report/ReportView.tsx vitest.shared.ts tests/risk.coverage.test.ts tests/report.legacyValuationNotes.test.ts docs/METHODOLOGY.md` then `git commit -m "Tell readers of stored reports how B5a reads their valuation (display-time notes)"`.

### Tasks 18-21: in Part B (B5b)

Moved to Part B with their numbers (pre-flight split), after Task 17b, whose cutoff their rows use.

### Task 22: Struck; its finding moved to B6 Task 5A

FIN-506 was planned here in round 4. Struck on 2026-10-28 by the main session's resolution (decisions spec 4.3: "FIN-506. Moves from B5 to B6, because B6 rewrites the same function"). This batch builds nothing for FIN-506: no step, no test, no commit, no `legacyValuationNotes.ts` row, no stamp, CHANGELOG or DECISIONS line. B6 builds it as Task 5A, the commit after its Task 5 quote-date roll of the same excess-return reverse solve, carrying the round-4 amendment and review of this task (the price-basis target, the rewritten `runStageB` wiring test, the ADR case, the guard and note wording and the `impliedReturnShareBasis` stored-report row, which B6 keys on its own spec). The heading is kept so Tasks 23–32 keep the numbers the master plan and the other plans cite. What this task planned is summarised in "Amendment notes (round 4)" and "Review notes (round 4)" below (kept as the record); its full text, adapted to sit on Task 5's roll, is B6 Task 5A.

### Task 23: Version stamps (B5a)

**Files** (pre-flight P3; lines at B13, re-taken after B4a; values expected, each next after the preceding merge):

| constant (B13 line; `6542531` line) | after B4a (the branch base) | B5a |
|---|---|---|
| `REPORT_SPEC_VERSION` (`src/report/schema.ts:144`; `:139`) | 1.50.0 | 1.51.0 |
| `PAYLOAD_VERSION` (`src/pipeline/stageC/payload.ts:433`; `:421`) | 1.52.0 | 1.53.0 |
| `STAGE_B_IMPLEMENTATION_VERSION` (`src/pipeline/runInputSnapshot.ts:33`; `:30`) | `STAGE_B_2026_10_ACCOUNTING_EVIDENCE_31` | `…_32` |
| `ANNUALIZATION_CONVENTION_SPEC` (new, `src/report/legacyValuationNotes.ts`) | — | "1.51.0", frozen; above `BRIDGE_METHOD_SINCE_SPEC_VERSION` "1.50.0" |
| `FAIR_VALUE_METHOD_VERSION` (`src/pipeline/stageB/fairValue.ts:36`) | `FAIR_VALUE_2026_10_D135` | unchanged (Task 16 is B5b's: Task 23b) |
| `SCENARIO_PATHS_METHOD_VERSION` (`src/pipeline/stageB/scenarioPaths.ts:26`) | `SHARED_SCENARIO_PATHS_2026_10_D99` | unchanged (Task 7 is B5b's: Task 23b) |
| `SCENARIO_TARGET_METHOD_VERSION` (`src/pipeline/stageB/scenarioTargets.ts:50`) | `…_D135` | does not move |
| `PIPELINE_VERSION` (`src/pipeline/jobRunner.ts:531`; `:527`) | "stage-c-1.6.13" | unchanged (Task 20 is B5b's: Task 23b) |
| DECISIONS | last entry D-135 | D-136 (Task 27) |

- Each moved constant's comment names D-next and the B5a tasks it carries (Tasks 1, 2, 3, 3b and 4, and Task 17's cutoff).
- `docs/METHODOLOGY.md:6-7` names the current stamps (B4a Task 16 edits it) and moves with them.
- `tests/report.versionStamps.test.ts` moves at three places (B13 lines): `:114-128` (new pins), `:133` (the old payload version joins the never-resume list) and `:141` (the old spec version joins the not-comparable list).
- `SCORE_BANDS_VERSION` does not move.

Other tests pin these literals and move with them. The first draft's grep is void: every literal it named is gone (pre-flight P3). Rebuild it from the values the branch base actually holds; with the expected values that is `grep -rn "\"1\.50\.0\"\|\"1\.52\.0\"\|STAGE_B_2026_10_ACCOUNTING_EVIDENCE_31" tests --include=*.ts`. Known pins (B13 lines):
- `tests/jobRunner.test.ts:6350` (`:6197` at `6542531`; `specVersion` of a newly stored report) → the new spec. `:6357` (`pipelineVersion` "stage-c-1.6.13") does not move in B5a.
- `tests/stageC.payload.passes.test.ts:1410` and `:2939` (payload and spec version) → the new values. They move in Task 24 with the rest of that file. Its restoration rows (`:647-649`) are untouched in B5a, because no method stamp moves.
- `tests/stageB.dcfDomain.audit20261022.test.ts:117` (`fairValue.methodVersion`) and `tests/fairValue.degradedInputs.test.ts:48` do not move in B5a.

- [ ] **Step 1: Write the failing test:** edit the pins in `tests/report.versionStamps.test.ts` and `tests/jobRunner.test.ts:6350` to the new values, and add four assertions, as B4a's stamp test does:
  - `specVersionBefore(BRIDGE_METHOD_SINCE_SPEC_VERSION, ANNUALIZATION_CONVENTION_SPEC) === true`;
  - the same against `EDGAR_DERIVED_LINES_SINCE_SPEC_VERSION` and against `PAYLOAD_RECORD_CORRECTION_SPEC`;
  - `specVersionBefore(REPORT_SPEC_VERSION, ANNUALIZATION_CONVENTION_SPEC) === false`;
  - a pin `ANNUALIZATION_CONVENTION_SPEC === "1.51.0"`.
- [ ] **Step 2: Run it.** `npx vitest run tests/report.versionStamps.test.ts` and `npx vitest run tests/jobRunner.test.ts -t "runs all steps in order, logs cost, persists the report"` (foreground; it is slow under load). Expected FAIL: `expected '1.50.0' to be '1.51.0'`, and the payload and Stage B pins, with the branch-base values in place of these.
- [ ] **Step 3: Implement:** move the constants and the METHODOLOGY header.
- [ ] **Step 4: Run it.** PASS; re-run `npx vitest run tests/stageC.payload.passes.test.ts` (fails until Task 24). Keep `tests/jobRunner.test.ts`'s `getConfig` count at 4.
- [ ] **Step 5: Benefit check:** a pass stored under the old payload is never resumed; a report under the old spec is "not-comparable" in the history diff.
- [ ] **Step 6: Docs:** the METHODOLOGY header (`:6-7`) and the constants' comments (CHANGELOG in Task 26).
- [ ] **Step 7: Commit.** `git add src/report/schema.ts src/pipeline/stageC/payload.ts src/pipeline/runInputSnapshot.ts src/report/legacyValuationNotes.ts docs/METHODOLOGY.md tests/report.versionStamps.test.ts tests/jobRunner.test.ts` then `git commit -m "Move report, payload and Stage B stamps for B5a (D-next)"`.

### Task 24: Payload golden (B5a)

**Files:** `tests/stageC.payload.passes.test.ts`: the fingerprint, promptBytes, financeHash, provenanceHash and the other matrix pins, and the version pins at `:1209` and `:2738` (`:1410` and `:2939` at B13). The restoration rows (`:623-645`; `:636-658` at B13, stamp rows at `:647-649`) are untouched in B5a, because no method stamp moves; Task 24b edits B4a's rows.

The golden's fixture is not DEMO: it is `buildInputs()` → `fixtureBundle("AAPL")` (`:148-383`), an Apple-shaped keyed bundle with annual ends on the last Saturday of September and consensus rows dated 2026-09-30 and 2027-09-30. So Task 2's weekday rule reaches it (Task 2 Step 4 records the move). B4a Task 17 re-pinned this golden, so every "before" figure is the branch base's (pre-flight P2).

- [ ] **Step 1–2:** `npx vitest run tests/stageC.payload.passes.test.ts` — expected FAIL on the pins after Tasks 2, 3, 4, 3b and 23.
- [ ] **Step 3:** Diff the serialized golden payload and its finance block before and after: write the `serializePayloadForPrompt` output and `JSON.stringify(finance)` to `b5-evidence\`, at the branch base and now.
  - Every changed line must be one of these:
    - the payload version string;
    - the consensus calendarization (Task 2): "the fiscal year ending 2026-09-26 contributes …"; the window-one level, about 451.49B → 457.29B at `6542531` and re-taken at the branch base; and every figure downstream of year one (growth path, DCF, scenarios, reverse DCF, grids, targets);
    - the year-one level (Task 3), only if the fixture is guidance-anchored;
    - the caveats on the context rows (Task 3b), only if the fixture's release carries an outlook qualifier;
    - the reverse-DCF context rows and note (Task 4: the like-for-like guided pace only).
  - Record which of Tasks 3 and 3b the fixture triggers.
  - Anything else is a defect: stop and trace it.
  - Part B's moves (Tasks 5, 7b, 10b, 13 and 18-20, and the method stamps) are Task 24b's.
- [ ] **Step 4:** Follow the file's own convention.
  - For each moved string, add a restoration row (`[now, before, count]`, asserting the exact count first, as `d99Restorations` and `f19Restorations` do), so that restoring the B5a wording reproduces the branch-base pins byte for byte.
  - Task 2's numeric moves cannot be restored by wording. So re-pin `financeHash`, `provenanceHash`, `promptBytes`, `fingerprint` and any matrix hash they move, with a dated comment: "2026-10-29 B5a (D-next): payload 1.53.0, next after the preceding merge; consensus calendarized on the issuer's last-Saturday-of-September year ends (FIN-301-V3: FY2026 2026-09-26, FY2027 2027-09-25, window one <before> → <after>, and the figures that follow year one); reverse-DCF context: only the like-for-like guided pace (FIN-101-V1, pre-flight R2)."
  - Follow it with the clauses Step 3 found: "guided quarter taken out of its season (FIN-101, pre-flight R1)" and "issuer caveats on the growth rows (pre-flight R4)".
  - State the exact before/after year-one level and DCF per share, both from the branch-base run, never this plan's numbers.
- [ ] **Step 5:** PASS; `npx vitest run tests/currency.payload.test.ts tests/stageC.reverseDcfContext.test.ts tests/report.versionStamps.test.ts` pass.
- [ ] **Step 6:** `docs/METHODOLOGY.md` already updated in Tasks 4 and 3b.
- [ ] **Step 7: Commit.** `git add tests/stageC.payload.passes.test.ts` then `git commit -m "Re-pin the payload golden for B5a's calendar and context rows (payload 1.53.0)"`.

### Task 25: Audited fixture deltas (B5a)

- [ ] Run `npm run audit:deltas` (compare only), on B4a's `tests/fixtures/audit-intended-deltas.json`.
  - The audited control is the provider-free DEMO bundle (`fixtures/fmp/*/DEMO.json`, `tests/helpers/auditFixtureComparison.ts:217`). Its calendar years end 12-31 and its consensus is dated 12-31, so Task 2's rule is null and Task 1's factors are 1.
  - Expected changed leaves: `report.meta.specVersion`, the payload version, the reverse-DCF context labels (Task 4), and additive leaves from new fields: `runRate.latestQuarterWeeks` / `lengthNote` where DEMO has a run-rate, and `revenueAnchor.evidence.guidedFloor`, `guidedSeasonalFactor` and `guidedYoyIssuerEffectPp` only if DEMO is guided.
  - A moved valuation figure on this calendar-quarter, unguided fixture is not expected: trace it to a task or stop. Part B's leaves are Task 25b's.
- [ ] Then `npm run audit:deltas -- --write --group audit-b5a-seasonality-calendars-20261027` (the file's naming convention, e.g. `audit-batch6-provider-failures-20261026`). Fill the group's `reason` ("B5a: 13-week and 52-week bases, guidance taken out of its own season, weekday fiscal-year ends, the like-for-like guided pace in the reverse-DCF context, calendar-shifted events disclosed") and `decisions: ["D-next"]`.
- [ ] `npx vitest run tests/auditDeltaContract.test.ts` passes.
- [ ] Commit: `git add tests/fixtures/audit-intended-deltas.json` then `git commit -m "Record B5a's intended fixture deltas"`.

### Task 26: CHANGELOG (B5a)

- [ ] Add at the top of `CHANGELOG.md`'s entries: `## Unreleased - seasonality, 52/53-week calendars and the guided quarter on one basis (B5a, 2026-10-27)`.
  - Write plain-English bullets per B5a task (Tasks 1, 2, 3, 4, 3b and 17): what a reader of a report now sees differently.
  - End with a stamp bullet: "Report 1.51.0, payload 1.53.0 and Stage B ACCOUNTING_EVIDENCE_32 (next after the preceding merge; D-next; renumbered at merge). Stored reports keep their bytes; legacy valuations carry a note on display."
  - Also update the header sentence at `CHANGELOG.md:9-10` to the new spec, payload and this batch (pre-flight P8). At B13 it names report spec 1.49.0 and payload 1.51.0, and B4a edits it; the first draft quoted 1.44.0 / 1.48.0. No test pins it; the keep-markdown-accurate rule does.
- [ ] Commit with Task 27.

### Task 27: DECISIONS entry (B5a)

- [ ] Add `## D-next - Audit B5a (2026-10-27): seasonality, 52/53-week calendars and the guided quarter on one basis` to `docs/audit/DECISIONS.md`, after B4a's D-135 (expected D-136, next after the preceding merge; pre-flight P8: the first draft's "after D-116" is stale).
  - **Gate (decisions spec 4.3):** write it only after Task 29's census rows E1 and E5 (Step C) and Step D checks 3-5 have run and passed. If either stopped, the entry waits for the main session.
  - **OD-1:** the choice, the alternatives rejected, the sources (URLs above) and the recorded decisions it revises: D-58's run-rate and guidance level, D-60 choice 3's consistency floor, and D-98's sequential fallback, retired.
    - It records pre-flight R1's amended level: the guided quarter divided by its growth-adjusted share (the mean of up to three yearly factors), × 4 and carried, with TTM × (1 + g) below eight quarters.
    - It records R1's two rejected alternatives with their measured numbers. Task 3 as first planned: census NVDA keyless 434.00 → 515.94 (+18.88%), 9.0% above consensus against main's 4.3%; AMZN keyless +5.25%; #43 +3.75%. The share-of-fiscal-year factor: it read NVDA's growth as a 31.5% seasonal peak.
    - It records R2's like-for-like context row and the thesis-trigger rule, and R4's disclosure with its residual: the ex-event level needs a timing-versus-persistent classifier first; AMZN's option size is 869.44B.
  - **OD-1a** (the weekday fiscal-year rule), with its sources.
  - **Scope extension E1**, "confirmed by the main session (decisions spec 4.3, 2026-10-28) on its replay evidence", with that evidence in one clause (Task 29 row E1): the D-65 interest run-rate on a 13-week basis (OD-1 point 4, Task 1).
  - **Census evidence E5** (pre-flight R1), in one clause: year one, per share and guidance source on all 50 inputs, on Task 3's commit pair, with every per-share move over 10% named.
  - **The house-threshold backtest for B5a's thresholds** (Task 29 Step D checks 3-5).
    - For the 10-day snap and the three-chained-year-end rule, give the sample (issuers, periods), the distribution measured (min / max, counts in each band) and the result "misclassifies none of the 45 census issuers".
    - Put the two by-products, week rounding (exact whole weeks for w ≠ 13, Task 1) and the 250–300-day year-ago position, in one clause, with a pointer to the disposition note's table.
    - The stub line and the 0.75-year span are B5b's (Task 27b).
  - **The version line:** report 1.51.0, payload 1.53.0, Stage B `…_32`, each next after the preceding merge, and the frozen `ANNUALIZATION_CONVENTION_SPEC` "1.51.0".
  - **State:** no rule names a ticker; stored reports keep their bytes (D-67) and get Task 17's notes.
- [ ] Commit: `git add CHANGELOG.md docs/audit/DECISIONS.md` then `git commit -m "Record B5a's decisions (D-next) and changelog"`.

### Task 28: Disposition note and release-test registration (B5a)

- [ ] Create `docs/audit/2026-10-27-audit-b5-seasonality-calendars-dcf-inputs.md` (date it the merge day), with its B5a part; Task 28b adds the B5b part after it. The B5a part holds:
  - a table of B5a's seven findings (FIN-301, FIN-301-V1, FIN-101, FIN-101-V1, FIN-101-V2, FIN-301-V2, FIN-301-V3), with id, severity and disposition (fixed in Task N, with the commit);
  - the replay table from Task 29, and the owner decisions by reference to D-next;
  - **Pre-flight amendments:**
    - R1's amended level, with the rejected first-planned rule and its measured numbers;
    - R2's context row;
    - R4's disclosure and, as the residual option's size, AMZN keyless 869.44B / 105.95 (+7.22% against main, within 0.8% of the keyed consensus 876.36B). It needs a timing-versus-persistent classifier first, and is routed to R2 or a later batch;
    - Task 3's peak-quarter case boosts the guide's own fiscal quarter (k ≡ 0 mod 4; controller ruling 2026-10-29): s ≈ 1.105, year-one ratio ≈ 1.0038;
  - **Scope extensions:**
    - row E1 (Task 1): what it adds beyond the finding's sketch; the Task 29 evidence (where it fired, the measured before/after, where it was expected not to fire and did not); and "confirmed by the main session on this evidence (decisions spec 4.3, 2026-10-28)";
    - row E5 (pre-flight R1);
  - **House-threshold backtest (B5a part):** Task 29 Step D checks 3-5, copied from `b5-evidence\out\thresholds.json`. One row per threshold (the 10-day snap, the three-year-end rule, the two by-products), each with its sample, distribution and result. The note names the census as 45 keyless snapshots built 2026-10-21 (SEC filings and Yahoo prices) and says the backtest made no network call;
  - residual risks (Risks in the summary).
- [ ] Register the note in `tests/repository.release.test.ts` among the audit notes (pre-flight P8; lines at B13, re-take them): after `:97` (`"docs/audit/2026-10-22-audit-batch6-provider-failures.md",`), the B13 note at `:98` and B4a's note. Register this plan file `docs/superpowers/plans/2026-10-27-audit-fix-05-seasonality-calendars-and-dcf-inputs.md` in the audit-fix plans group (`:126-133` at B13), after B4a's entry; the first draft's "after `:124` nvda-round3" is stale. `git add -N` both before running the test.
- [ ] `npx vitest run tests/repository.release.test.ts tests/docs.lint.test.ts` pass. This plan names the evidence folder through `%USERPROFILE%`, so its home-path check holds.
- [ ] Commit: `git add docs/audit/2026-10-27-audit-b5-seasonality-calendars-dcf-inputs.md docs/superpowers/plans/2026-10-27-audit-fix-05-seasonality-calendars-and-dcf-inputs.md tests/repository.release.test.ts` then `git commit -m "Add B5a's disposition note and register it"`.

### Task 29: Before/after replay proof (B5a; no network, no model calls)

`npm run research:replay` refuses these snapshots (`replayRunInputSnapshot` requires the snapshot's calculation versions to equal the current ones). So the proof calls `runStageB(snapshot.content.bundle, snapshot.content.stageBConfig)` directly, as the audit probes and the pre-flight did. Under pre-flight P5 the scripts and their outputs live outside the repository, in `%USERPROFILE%\metis-backups\fix-state\b5-evidence\` (Global Constraints, proof harness). Nothing is written into `tmp/audit-2026-10-27/`, and nothing is committed: reports 43, 48, 49 and 50 and the #51/#52 inputs hold FMP rows.

**Inputs** (read by absolute path from the main checkout or the backup, read-only):
- the five keyed snapshots `tmp/audit-2026-10-27/data/evidence/{43,46,48,49,50}/run_input_snapshot.gen0.*.json`;
- the 45 census snapshots `tmp/metis-audit-2026-10-22/scratch/snapshots/main/*.json` (`{ bundle, stageBConfig }`);
- the AMZN #51 and #52 run inputs the pre-flight read: `snapshot51.json` in `%USERPROFILE%\metis-backups\fix-state\b4-evidence\amzn-review\work-valuation\` and `snapshot52.json` in `…\amzn-review\out-1029d\`;
- the 51 stored reports `tmp/audit-2026-10-27/data/reports/<n>.json` (skip `index.json`), and the live #51/#52 extracts `report-previous.json` and `report-newest.json` in `…\amzn-review\out-1029d\` (pre-flight P7).

"All 50 inputs" below means the 45 census snapshots and the five keyed ones.

- [ ] **Step A: Before any code change** (on the B5a branch base: main after B13 and B4a). Set up the harness in `b5-evidence\`:
  - Copy B13's `run.sh` (`b4-evidence\b13-replay\run.sh`; the pre-flight's `b5-preflight\run.sh` is the same wrapper). It `cd`s into the checkout under test and sets `METIS_DATA_DIR` and `METIS_DB_PATH` to the empty guard folder `b5-evidence\guard-data\`, asserting it is still empty after each run.
  - It sets the dead proxy (`NODE_USE_ENV_PROXY=1 HTTP_PROXY=http://127.0.0.1:9 HTTPS_PROXY=http://127.0.0.1:9 NO_PROXY=127.0.0.1,localhost`) and runs `node --conditions=react-server --import tsx <script>.mts` with `B5_PROOF_LABEL=<label>`.
  - Write four scripts there:
    - `replay.mts`: the keyed snapshots and #51/#52;
    - `census.mts`: Step C;
    - `thresholds.mts`: Step D;
    - `stored.mts`: every stored report and the two live extracts through `withLegacyValuationNotes`, after only. It records the notes each gains and fails on any throw.
  - Each script replaces `globalThis.fetch` with a function that throws, before it imports app code. It reads new exports and fields through `typeof` and optional-chaining checks, so it runs at every commit. It writes only into `b5-evidence\out\<label>\`, and records `git rev-parse HEAD` of the checkout it ran in.
  - Run `replay.mts` and `census.mts` with label `base`.
- [ ] **Step B:** After Task 17, run again with `after` and fill the table in the disposition note. These are B5a's rows; Part B's are Task 29b's. Every "before" cell is the branch-base run's; the B13 values shown are the pre-flight's provenance (Global Constraints, "before" values):

| report (snapshot) | figure | stored | before (branch base, after B4a) | after (expected; values at B13 re-taken) | expected cause |
|---|---|---|---|---|---|
| MU #46 (`46/run_input_snapshot.gen0.a4a0eb9aae30.json`, keyless SEC + Yahoo) | run-rate | 216.92B | (record; 216.92B at B13) | 201.42B | Task 1 |
| MU #46 | year-one revenue | 249.38B | (record; 249.38B at B13) | ≈231.6B | Task 1 |
| MU #46 | DCF per share | 5000.09 | (record; 5000.09 at B13) | ≈4086.65 at B13 | Task 1 (13-week quarter, 52-week TTM) |
| MU #46, AMZN #43, NVDA #48–50 | interest run-rate (EPS projections) | (record) | (record) | none moves. MU #46's 98-day latest quarter (2026-09-03) is the fourth quarter of its latest fiscal year, and `compute.ts:2577` uses a quarter's run-rate only when it is newer than the latest annual row, so MU's EPS keeps the annual interest. AMZN's and NVDA's latest quarters are 91 days | Task 1 (`interestRunRate`) |
| NVDA #50 (`50/…3f82c82d13d7.json`) | year one / growth | 526.40B / 73.75% | (record) | 516.34B / 70.43% at B13 | Task 2 |
| NVDA #50 | DCF per share | 229.52 | (record; ≈230.23 expected after B4a) | 229.41 at B13, re-taken | Task 2 |
| NVDA #48, #49 | year one, per share | (record) | (record) | (record) | Task 2 |
| AMZN #43 (`43/…d101e15faa98.json`) | year-one source / level | guidance × 4 | (record; 829.09B at B13) | the guided quarter taken out of its season (≈828.03B at B13) | Task 3 (R1) |
| AMZN #43 | DCF per share | (record) | (record; 83.40 at B13, ≈86.38 expected after B4a) | ≈83.30 at B13 (−0.13%) | Task 3 (R1) |
| census NVDA (keyless, guidance anchor) | year one / DCF per share | — | (record; 548.97B / 434.00 at B13) | ≈538.57B / ≈403.46 at B13, 2.3% above the keyed consensus 526.40B | Task 3 (R1; E5) |
| census AMZN (keyless, Q3 guide) | year one / DCF per share | — | (record; 829.09B / 98.81 at B13) | ≈828.03B / ≈98.64 at B13 | Task 3 (R1; E5) |
| AMZN #51, #52 (consensus anchor) | year one, DCF per share | (record) | (record; 116.12 at B13, ≈124.14 expected after B4a) | unchanged (the new floor, 792.51B, sits below consensus) | Task 3 (no move) |
| AMZN #52, #43 | reverse-DCF context guided row | "guided run-rate growth over TTM (next-quarter guidance × 4)" (#52: 2.88%) | (record) | "guided-quarter revenue growth, year over year": 10.73% on #52, 10.7294 on #43; no run-rate or sequential row | Task 4 (R2) |
| AMZN #51/#52, #43, census AMZN | caveats on the context's growth rows | none | none | the two Prime Day caveats: the 2026-07-30 400bp sentence on the guided row, the 2026-04-29 sentence on the latest-quarter row; `guidedYoyIssuerEffectPp` 4 where the guide is the 2026-07-30 release's; no figure moves | Task 3b (R4) |
| NVDA #48–#50, census NVDA | caveats | none | none | only if their releases carry qualifiers (no quantified effect expected) | Task 3b |
| every keyed input | WACC, rating, ERP, terminal ROIC, ROIC series, sales-to-capital, current-capital start, degraded-inputs reason, scenario shocks | (record) | (record) | unchanged: these are Part B's figures | none in B5a |

The scan of the 51 stored reports and the two live extracts through `withLegacyValuationNotes` (`stored.mts`) must give exactly Task 17 Step 5's list:
- #43: `guidedTimesFour`;
- #46: `quarterLength`;
- #47, #48, #49, #50 and #52: `fiscalYearEnd` and `guidedFloorTimesFour`;
- live AMZN #52: `guidedFloorTimesFour`;
- live #51: recorded;
- every other report: nothing.

Must not move (assert in the proof script): every WACC, synthetic rating, ERP and its label; terminal ROIC; the ROIC series and sales-to-capital; the current-capital start; the degraded-inputs reason; every scenario shock; DEMO's valuation figures. Any other moved figure is traced to Task 1, 2, 3, 4 or 3b before Task 25 is written, or it is a defect. The payload golden's AAPL-shaped fixture is not a replay input; its Task 2 move is recorded in Task 24.

- [ ] **Step C: Census replay for the four scope extensions and the pre-flight's evidence rows (decisions spec 4.3: "Confirm all four scope extensions, each only with its replay evidence"; pre-flight R1 and R3).** B5a runs rows E1 and E5 here; B5b runs E2, E3, E4 and E6 in Task 29b with the same script. `census.mts` (Step A's harness) reads each of the 45 files in `tmp/metis-audit-2026-10-22/scratch/snapshots/main/*.json` (shape `{ bundle, stageBConfig }`; read by absolute path, read-only; never copied into the repository). For each it runs `runStageB(bundle, stageBConfig)` and writes `b5-evidence\out\<label>\census.json`, recording per symbol:
  - **(E1)** every call to `interestRunRate`: its `quarter` argument (date, interest, and `days` once Task 1 adds it) and the exact `{ value, basis }` it returns. The first draft captured them with a `vi.mock` pass-through. The harness runs outside vitest (pre-flight P5), so instead it reproduces each call. For each input it takes the quarter `compute.ts` hands `interestRunRate`: the latest income quarter when it is newer than the latest annual row (`compute.ts:2577` at `6542531`, `:2596` at B13), with its `days`. It then calls the exported `interestRunRate` on that quarter and on the closing and opening balance rows `compute.ts` passes, on each tree, and records the exact return. If the harness can wrap the module export instead (a Node/tsx module hook), it does, and it records which capture ran. The EPS assumption line prints the value rounded to 0.01B, too coarse for the 1e-9 check below. Also record the latest income quarter's date, its `periodDays` from the filed `fieldProvenance.revenue.periodStart`, and the EPS series' assumption line matching `/latest quarter's run-rate/` (the `computed.projections.series` entry with metric "eps").
  - **(E2)** the `withoutTransitionPeriods` withheld list for `incomeAnnual` and `cashflowAnnual` (null where the export does not exist yet), `returns.roic.series` (date, `roicPct`) and `valuation.assumptions.salesToCapital` (value, basis).
  - **(E3)** `valuation.reverseDcf` method, `impliedRevenueGrowthPct`, `impliedTerminalMarginPct`, `growthOutsideRange` (with `domainEdgePct` once it exists) and the notes matching `/domain/`.
  - **(E4)** `valuation.assumptions.forecastPeriod.basis`, each series' `historical[].period` and `base[0].period`, and whether any history row's `fiscalYear` differs from its end year.
  - **(E5, pre-flight R1)** `valuation.assumptions.revenueAnchor.source`, year one, `evidence.guidedRunRate`, `evidence.guidedSeasonalFactor` (once it exists) and the DCF per share.
  - **(E6, pre-flight R3)** the DCF per share; the margin fade's regime, median, slope and target; `scenarioMarginCeiling`; the terminal ROIC; and each fiscal year's tagged one-off families (tag, years, filed amount), with the recurring ones the guard leaves in (once `withoutRecurringFamilies` exists).

  For E4 (B5b), it also runs one in-memory copy of `HD.json` with `bundle.statements.incomeQuarterly` replaced by `{ ok: false, gap: { field: "statements.incomeQuarterly", severity: "warn", reason: "B5 proof: quarterly rows removed in memory to force the annual base period", attemptedSources: [] } }`. That is the gap shape the snapshot's other gaps use; check one before writing it (TSM's `incomeQuarterly` in the same folder is `{ ok: false, gap: { attemptedSources, field, reason, severity } }`). With the quarterly rows gone, the base period is the fiscal year and the forward windows are fiscal-year labelled; the copy's revenue-series labels are recorded as `HD-annual-base`. It first asserts the copy's `forecastPeriod.basis` is "fiscal-year". If it is not, the copy did not reach the case: report that to the main session rather than reading it as an E4 failure. The copy is never written anywhere.

  **When it runs: on each extension's own commit pair.** The census moves for reasons other than the four extensions. Task 1 changes PEP's run-rate, and Tasks 3, 7, 18 and 19 move reverse-DCF figures on in-domain inputs (guidance, tagged impairments, the margin family, the tax seed). A diff of the branch base against Task 21 therefore cannot show that an extension moved only what it should; E3's "in-domain inputs are identical" would fail on it for causes that are not Task 15's. So each row compares the commit before its task with that task's own commit (one commit per task, Global Constraints).
- B5a's rows: E1 the branch base against Task 1, and E5 Task 2 against Task 3 (the tree without Task 3 against Task 3). Runs `base`, `t01`, `t02` and `t03`.
- B5b's rows (Task 29b, on B5b's branch): E6 Task 6 against Task 7, E2 Task 11 against Task 12, E4 Task 13 against Task 14, and E3 Task 14 against Task 15. Runs `t06`, `t07`, `t11`, `t12`, `t13`, `t14` and `t15`.

Check each commit out with `git switch --detach <sha>` in the checkout under test (the scripts live outside the repository, so they survive the switch). Record `git rev-parse HEAD` of the checkout actually run, then return with `git switch <the part's branch>`. A final run labelled `after` feeds the disposition table: after Task 17 in B5a, after Task 21 in B5b. Every run is offline behind the same dead proxy, with fetch stubbed to throw. The script reads new exports and fields through `typeof` and optional-chaining checks, so it runs at every commit. The five keyed snapshots' values for the same fields come from `replay.mts`, run at the same commits; add the E1–E6 fields and the same `interestRunRate` capture to it. Then check, and copy the result into Step B's table (Task 29b's for B5b's rows):

| row | extension (task) | evidence | confirms when |
|---|---|---|---|
| E1 (B5a) | `interestRunRate` on a 13-week basis (Task 1) | `base` against `t01`: on all 50 inputs, every `interestRunRate` call, its quarter's length and the exact returned value | every call whose quarter reads w ≠ 13 weeks (`weeksOf`, Task 1) moves by after ÷ before = 13/w within 1e-9 relative, and every other input is identical (a 13-week, calendar or non-whole-week quarter, or no call at all). The post-integration review's pre-scan expects one mover, census PEP (an 84-day third quarter ending 2026-09-05, × 13/12). COST (112 days) and MU #46 (98 days) do not move: their latest quarter is the fourth quarter of their latest fiscal year, and `compute.ts:2577` uses the run-rate only for a quarter newer than the latest annual row. KO (93 days, no whole-week count) does not move either. Record any other mover and trace it |
| E5 (B5a; pre-flight R1) | Task 3's amended level (the guided quarter taken out of its own season) | `t02` against `t03`: revenue-anchor source, year one, `guidedSeasonalFactor` and DCF per share on all 50 inputs | only guidance-anchored inputs move. Expected at B13, re-taken on B4a's base: census NVDA 434.00 → ≈403.46 (year one 548.97B → ≈538.57B), census AMZN 98.81 → ≈98.64, AMZN #43 83.40 → ≈83.30; no other census issuer has an admitted guidance anchor. Consensus-anchored inputs (NVDA #48–#50) and every input without admitted guidance are identical. Any per share that moves by more than 10% stops for a named explanation |
| E2 (B5b) | transition filter on the DCF history, sales-to-capital and ROIC series (Task 12) | `t11` against `t12`: withheld lists; ROIC series and sales-to-capital on all 50 inputs | no input has a withheld row and nothing moves; if a row is withheld, only that issuer moves and only by losing that row. The planner's 2026-10-28 scan found 434 census income rows with a filed start, all 364–371 days, and no 10-KT form. The post-integration re-scan adds the gap-measured rows (2 income and 393 cash-flow rows) and the five keyed snapshots: also all 364–371, nothing under the 357-day line |
| E3 (B5b) | in-domain restriction on the root and the margin solve (Task 15) | `t14` against `t15`: reverse-DCF fields on all 50 inputs | every changed reverse figure sits beside a non-null `domainEdgePct` or a domain-edge note on the same input, and every input whose scan stays in domain is identical |
| E4 | forward-label rule (Task 14) | `t13` against `t14`: label lists on all 50 inputs and on `HD-annual-base` | the rule fires on `HD-annual-base` (every history label `FY ending <date>`, forward labels `FY<end year> ending <date>`, no FY2025-then-FY2027 gap), and on no input whose forward basis is rolling-12-month or whose history fiscal years equal their end years. FIN-127's own label rule also moves the census inputs whose fiscal year differs from the end year: HD (start-year naming), JNJ (early-January year ends) and FCX. FCX's keyless 2024-12-31 row carries `fiscalYear` "2023" and collides with 2023-12-31, so both are dated. All three have a rolling-12-month forward basis, so these moves are Task 14's base rule, not the forward-label rule firing |
| E6 (B5b; pre-flight R3) | the recurrence guard and the ceiling rule (Task 7) | `t06` against `t07`: per share and margin-fade regime (with median, target and ceiling) on all 50 inputs, and each moved issuer's tag families with their years and filed amounts | every move is on an issuer whose added-back family is filed in at most 2 of its last 5 fiscal years and is named with its years and filed amount; every family filed in 3 or more of 5 is left in and named. Expected at B13, re-taken on B4a's base: CAT ≈ +9.53% (245.67 → 269.07) through the normalised ceiling history, intended only if its FY2022 tag is one year of five and is named with its filed amount (otherwise CAT's FY2022 ceiling row stays at main's and the residual is recorded). JNJ, PEP and CVX are unchanged (their families recur) unless the per-family count lets one move; E6 then names the family and its years, and the move is explained before merge. AMZN, EXPE, KO, VZ, DUK, CSCO, FCX, MCD, TSLA and BA are unchanged |

A row that does not hold leaves its extension or rule unconfirmed: stop before Task 27 (Task 27b for B5b's rows) and report the row to the main session (Tasks 1, 3, 7, 12, 14 and 15 say the same). Copy the rows, with the issuers each fired on, into the disposition note's "Scope extensions" section (Task 28 for E1 and E5, Task 28b for E2, E3, E4 and E6).
- [ ] **Step D: House-threshold backtest (decisions spec 4.3: "Before D-next, backtest the house thresholds (0.9-year stub, 0.75-year span, 10-day snap, three-year-end rule) offline over the 45 census snapshots, and record the distribution in the disposition note"; and 4.5, O-2, whose stub-line gate is check 1a).** Checks 3-5 are B5a's: they run after Task 3 and before Task 27, because they read Tasks 1 and 2's exports and Task 3's year-ago window. Checks 1 and 2 are B5b's (Task 29b). Check 1a runs as Task 12 Step 0, before Task 12's test is written, and checks 1b and 2 run after Task 12 and before Task 27b, from the same script. The script is `thresholds.mts` (Step A's harness): same dead proxy and fetch stub, no `runStageB` call. It always imports `periodDays` and `weeksOf` from `@/pipeline/stageB/fiscalCalendar` (Task 1). It reads `fiscalYearRule`, `fiscalYearEndFor` and `snapToFiscalYearEnd` (Task 2) and `withoutTransitionPeriods` (Task 12, from `@/pipeline/stageB/growth`) through `typeof` checks, so check 1a runs before Task 12 exists. It reads the same 45 census files and the five keyed snapshots (`content.bundle`; FMP rows, read only in this local script) and writes `b5-evidence\out\thresholds-gate.json` (check 1a) and `b5-evidence\out\thresholds.json` (every check run so far). Per issuer it builds two period sets:
  - **Statement rows.** `bundle.statements.incomeAnnual` and `cashflowAnnual` rows, deduped by date, newest first. Each row's length is `periodDays(fieldProvenance.revenue.periodStart, date)` when a filed start exists, else the gap to the next-older row; cash-flow rows carry no revenue provenance, so they always take the gap, as Task 12 measures them. The oldest row with neither has no length and is counted as such. `incomeQuarterly` rows are measured the same way, for check 5.
  - **Companyfacts annual facts.** `bundle.edgar.companyFacts.value.data.facts["us-gaap"]`, tags `Revenues`, `RevenueFromContractWithCustomerExcludingAssessedTax`, `SalesRevenueNet` and `NetIncomeLoss`, unit USD (a 20-F filer reporting in another currency uses its own unit). Keep durations of 250–380 days from forms matching `/^(10-K|20-F|40-F)/`, deduped by start and end. That pattern also matches `10-KT`, so list a 10-KT period separately as a transition period; none is expected.

  Then:
  1. **Stub line (B5b; Task 29b).**
     - **1a. Gate (decisions spec 4.5, O-2; run as Task 12 Step 0).** Write a histogram of annual lengths in the bands < 250, 250–328, 329–356, 357–363, 364–371 and > 371 days, kept per set: census statement rows by basis (filed, gap), census facts, keyed statement rows, keyed facts. A "census year" is a census statement annual row, or a census annual-form period of 250–380 days that is not a 10-KT. The gate passes when no census year measures under 357 days; the stub line is then 357 days. If one does, the line stays at 329 days (4.5), and the failing rows and the line kept are recorded. The keyed snapshots' FMP rows are measured too: they are the only vendor-dated annual rows the proof can read, and the gap measure reads a vendor's dates. A keyed fiscal year under 357 days does not change 4.5's census condition, but it is a stop: report it to the main session before Task 12 commits. Post-integration pre-scan (read-only node over the same files, 2026-10-28): census income rows 434 by filed start and 2 by the gap, cash-flow rows 393 by the gap, and 45 oldest rows with no length; 779 census facts; the keyed snapshots' rows and facts. Every measured length is 364–371 days, no 10-KT is filed, and nothing is under 357 days. `thresholds-gate.json` records the line taken; Task 12 Step 0 reads it.
     - **1b. Confirmation (after Task 12).** List the rows `withoutTransitionPeriods` withholds in each set. It passes when no row of 364 days or more is withheld and, consistent with 1a, nothing at all is withheld on the census and keyed inputs.
  2. **0.75-year latest-YoY span (B5b; Task 29b).** For each issuer, the span in years between its two newest kept annual rows (`actualYears` as `computeGrowth` measures it). Passes when every span is at least 0.75 (none withheld) and the minimum is recorded (expected about 364/365.25 = 0.997).
  3. **Three-year-end rule (B5a).** The issuer's annual ends (union of statement row dates and annual-form fact ends, deduped). Held-out test: for every end E with at least three chained older ends, fit `fiscalYearRule` on E's older ends only, (a) with exactly the three nearest and (b) with all of them. Compare `fiscalYearEndFor(rule, y)` with E, where y is the year whose last day of `rule.month` lies nearest E: E's own year or the one before, since a nearest-weekday December rule can end on 2 January. Record per issuer the rule (kind, weekday, month), or null and why (calendar month end, ambiguous, broken chain), and the counts of held-out predictions exact / wrong / no rule. Passes when no prediction is wrong under (a) or (b). A null is not a failure (the dates are then kept and disclosed). The post-integration review simulated the rule as Task 2 specifies it (read-only node, same ends). Nine issuers get a rule: AAPL, CSCO, INTC, NVDA and PEP on the last-weekday kind; COST, DIS, HD and JNJ on the nearest-weekday kind. Under (a) and (b) together, 231 held-out predictions were exact and none wrong, with 31 nulls for ambiguity. Every other issuer gets no rule (calendar month ends, a chain of one; TSM files no us-gaap annual ends). The run measures the real counts.
  4. **10-day snap (B5a).** For each held-out end E whose rule exists, measure the distance in days from E to two vendor-style dates. One is the anniversary of the previous end (same month and day one year later). The other is the last day of `rule.month` nearest E: Thursday-nearest-31-August MU ends on 2026-09-03, three days after 31 August, so the last day of September would be the wrong reference. Also measure the distance from either vendor-style date to the nearest *other* date the rule produces (the adjacent fiscal year's end). Passes when every E lies within 10 days of both vendor-style dates and no other rule date lies within 10 days of either (the snap has one target). The same simulation found every held-out end within 10 days of both. Also record, from the five keyed snapshots (FMP consensus rows, read only in this local script), each estimate row's date against the rule's year end for that fiscal year (NVDA's 2027-01-25 against 2027-01-31 is the known case); those dates are the real vendor convention.
  5. **By-products (B5a; not named in 4.3; measured because the same rows are read).**
     - **Week rounding.** A histogram of `periodDays` over the quarterly rows, with `weeksOf` of each. Passes when every quarter read as w ≠ 13 spans exactly 7w days and every 90–92-day quarter reads 13. List the quarters read as null: KO's 87–97-day quarters and SNOW's and WMT's 89-day first quarters, all established lengths that are not whole weeks, used unscaled (Task 1). Post-integration pre-scan of the census's filed quarters: 84 days ×36, 87 ×1, 89 ×11, 90 ×162, 91 ×401, 92 ×422, 93 ×2, 95, 96 and 97 ×1 each, 98 ×7, 112 ×10, 119 ×2. The keyed rows add MU #46's and NVDA #48–#50's 98-day quarters. The first draft's ±1-day rule read KO's 97-day fourth quarter of 2020 as 14 weeks; the exact rule (Task 1, post-integration review) reads it as null.
     - **Year-ago position.** For each issuer, take every run of four consecutive quarterly rows that `quarterWindowViolation` accepts: it is the TTM's own contiguity gate (`src/pipeline/stageB/quarterWindows.ts`, 70–135-day gaps). Measure the days from the run's newest end back to its oldest end. Passes when every accepted run lies in Task 3's 250–300-day window. A run the gate rejects is listed with the gate's reason and does not count, because no TTM is built from it. For example, NNN's latest four rows skip 2026-03-31 and span 365 days; a check on "the latest four" rows alone would fail on that data gap. Post-integration pre-scan: 1,029 accepted runs across the census and keyed inputs, all 252–287 days.

  Every threshold that passes is recorded with its distribution; none is re-tuned to the census (a line fitted on these 45 issuers would no longer be backtested on them). Check 1a is the one result that changes code, and only as 4.5 provides: through Task 12 Step 0, choosing 357 or 329 days. If any other check fails, stop before Task 27 (Task 27b for checks 1b and 2) and report the failing rows to the main session; the plan's thresholds change only by the main session's call. Copy `thresholds.json`'s summary table into the disposition note (Task 28 for checks 3-5, Task 28b for checks 1-2), and its one-line results into the D-next bullets (Tasks 27 and 27b).

### Task 30: npm run verify (foreground chunks; B5a)

- [ ] Without `METIS_DATA_DIR` set, run in order, each in the foreground: `npm run check:dependencies`, `npm run typecheck`, `npm run lint`, `npm run test:product`, `npm run test:integration`, `npm run test:coverage:core`, `npm run test:coverage:risk`, `npm run build`, `npm run audit:security`.
- [ ] Known load flakes (rerun the single file before investigating): timeouts in `tests/jobScheduler*`, `recordedSensitivity`, `risk.coverage`, `runtimeArtifactIdentity`, `runtimeReplay`; on CI only, `tests/db.cli.test.ts` "bootstraps a Unicode/spaced SQLite path" (`spawnSync … ETIMEDOUT`, Windows). `tests/jobRunner.test.ts`'s `getConfig` count must stay 4.
- [ ] A coverage floor that drops because of new modules is met with tests, never by lowering the floor. `src/pipeline/stageB/fiscalCalendar.ts` meets the core per-file floors, and `src/report/legacyValuationNotes.ts` the risk floors.
- [ ] Before the chunks, run B5a's new and re-pinned files on their own: `npx vitest run tests/stageB.periodLength.test.ts tests/stageB.fiscalCalendar.test.ts tests/stageB.seasonalGuidance.test.ts tests/currentReports.issuerGrowthEffect.test.ts tests/stageC.reverseDcfContext.test.ts tests/report.thesisTriggers.test.ts tests/report.legacyValuationNotes.test.ts tests/risk.coverage.test.ts`. The round-4 files and the `pipelineVersion` case run in Task 30b.

### Task 31: Fresh-reviewer pass (B5a)

- [ ] Dispatch a reviewer with no context from this work. Give it `git diff origin/main...HEAD`, B5a's seven findings in `tmp/audit-2026-10-27/findings.json` (FIN-301, FIN-301-V1, FIN-101, FIN-101-V1, FIN-101-V2, FIN-301-V2, FIN-301-V3), this plan, the D-next entry and the disposition note. Ask:
  - does each change fix the finding's whole class without ticker-specific code;
  - does any test assert less than the probe did;
  - does any changed pin lack a cause in this plan;
  - is every METHODOLOGY line true to the code, and are stored-report bytes untouched;
  - are Review Focus items 1, 3, 4 and 5, and item 2's Task 2 half, tested (the rest are Part B's);
  - is E1 backed by its Task 29 Step C row, taken on its own commit pair;
  - does the disposition note carry Step D checks 3-5, with no threshold re-tuned to the census;
  - does `weeksOf` read a week count other than 13 only for exact multiples of seven days.

  And the pre-flight's merge gate:
  - does the amended level stay below TTM × (1 + g) for a decelerating grower (R1's third case) and agree with it under a stable season;
  - does E5 name every per-share move over 10%;
  - does the reverse-DCF context carry no run-rate or sequential row, and the thesis trigger no level dated at the guided quarter (R2);
  - does Task 3b move no figure (R4);
  - is `legacyValuationNotes.ts` composed outermost and listed in both risk lists (P4).

  Tell the reviewer to exclude `*.db*` from every recursive grep.
- [ ] Fix only findings that affect correctness; record the rest in the PR.

### Task 32: Pull request (B5a)

- [ ] `git fetch origin` and rebase on `origin/main`. Renumber D-next, the stamps, the CHANGELOG stamp bullet, the disposition note's date and title, and the delta group (rebuild `audit-intended-deltas.json` from main's copy plus this group and rerun `--write --group`). Rerun Task 30's typecheck, product tests and `tests/report.versionStamps.test.ts`.
- [ ] Push and open the PR. Description outline, plain English for a non-technical owner:
  1. What was wrong: a quarter was turned into a year by multiplying by four even when it was a holiday quarter or had an extra week (Micron's report valued the extra week as growth); the app's fiscal calendar for Nvidia was off by six days; and the reverse-DCF context set a guided quarter's level against twelve-month growth (Amazon's "annualized at 2.9%").
  2. What changed, one line per task, and the owner decisions taken on your behalf (OD-1 as amended by the pre-flight, and OD-1a), with one source each. Say why Task 3's first plan was replaced: it would have raised Nvidia's keyless value by about 19%, further from consensus than today.
  3. The before/after table from Task 29, the E1 and E5 evidence, and Step D checks 3-5 in one line per threshold.
  4. Stored reports: unchanged bytes; what notes now appear on them.
  5. Left for later / residual risks: the ex-event level (Amazon's Prime Day option, 869.44B, needs a timing-versus-persistent classifier first), and the shapes the seasonal factor can misread.
  6. Merge notes: merge after B4a; B5b follows directly; B4b rebases on B5's `interestRunRate`.
  7. The attribution lines from the session reminder.

## Part B: B5b (PR 2)

Branch `fix/dcf-inputs-on-one-basis`, cut from `main` directly after B5a merges. It is the same plan with the same pre-flight; Task 5 uses Task 1's `ttmInc.periodStart`, and running B5b later would cost a full re-take of its references.
- **Order:** the setup below, then Tasks 5, 6, 7, 7b, 8, 9, 10, 10b, 11, 12, 13, 14, 15, 16, 17b, 18, 19, 20 and 21, then B5b's batch tasks 23b-32b. Each batch task is its B5a counterpart with the deltas it states; read the B5a task first.
- **Findings:** FIN-113, FIN-102, FIN-402, FIN-402-V1, FIN-402-V2, FIN-116, FIN-115, FIN-114, FIN-406, FIN-111, FIN-405, FIN-127, FIN-104, FIN-118, FIN-501, FIN-502, FIN-512 and RPT-502.
- **Census evidence:** rows E2-E4 and E6, and Step D checks 1-2 (Task 29b).
- Its stamps, since-version, D-number and replay are its own (Tasks 23b-29b).

**Setup (no commit).**
- [ ] **Step 1:** After B5a merges: `git fetch origin && git switch -c fix/dcf-inputs-on-one-basis origin/main`, in a worktree (no junction to shared data).
- [ ] **Step 2 (pre-flight P1):** Re-take every `file:line` reference in Part B's tasks on that `main` (B13, B4a and B5a merged), and re-locate each edit by its quoted code. B4a and B5a moved `valuation.ts`, `compute.ts`, `returns.ts`, `projections.ts` and the display chain. A reference that no longer lands on its construct is a stop.
- [ ] **Step 3:** Confirm the exports Part B builds on. If one is missing, B5a or B4a has not merged: stop.
  - From B5a: `src/pipeline/stageB/fiscalCalendar.ts` (`periodDays`, `weeksOf`, `thirteenWeekFactor`, `fiftyTwoWeekFactor`, `fiscalYearRule`); `TtmIncome.periodStart`, `periodStartBasis` and `days` (Task 1; Task 5 reads them); `withLegacyValuationNotes` with `ANNUALIZATION_CONVENTION_SPEC` (Task 17; Task 17b and Tasks 18-21 extend it).
  - From B4a: `establishedSalesToCapital` with its lease argument, and `includeLeasesInEv` (Task 4); `computeRoic`'s refusal channel (Task 3).
- [ ] **Step 4 (pre-flight P11):** Regenerate every Part B task brief from this amended plan at this base, before its task is dispatched.
- [ ] **Step 5 (pre-flight P5):** Reuse Task 29's harness in `b5-evidence\` (copied, never junctioned). B5b's outputs go in `b5-evidence\out-b5b\<label>\`. Take Task 29b Step A's "before" run on this base before any code change.
- [ ] **Step 6:** Check whether another batch merged between B5a and this branch. If one did, B5b's stamps and D-number are the next after that merge (Task 23b), and Part B's tasks edit that batch's code as their base.
- [ ] **Step 7 (pre-flight R7, deadline):** The ERP fallback constant expires on 2027-01-27 (`returns.ts:125-132` at B13: as of 2026-07-01, with a 210-day window). If B5b has not merged by 2027-01-15, ship Task 10b alone as a small PR from `main`, with the stamp its figures need (Global Constraints), and drop it from this branch.

### Task 5: The current-capital window starts at the filed start of its oldest quarter (FIN-113)

**Files:**
- Modify `src/pipeline/stageB/currentCapital.ts:84-93` (`yearStart` becomes the fallback), `:96-136` (`attachCurrentCapital` input and `periodStart`).
- Modify `src/pipeline/compute.ts:2210-2225` (pass `ttmInc.periodStart`, and the annual row's filed start for the annual basis).
- Modify `src/pipeline/stageC/payload.ts:964-985` ("exact window" only when the start is filed).
- Modify `src/report/financialDiagnostics.ts:76`, `:89` (period text unchanged in form; reads the new start).
- Modify `tests/stageB.currentCapital.test.ts:17`, `:44` (keep as the fallback cases; add the filed-start cases).

**Interfaces:**
- Consumes: Task 1's `TtmIncome.periodStart` and `TtmIncome.periodStartBasis`.
- Produces: `attachCurrentCapital(annual, { …, periodStart?: string | null, periodStartBasis?: "filed" | "prior-quarter-end" | null })`; `CurrentCapitalSnapshot.periodStartBasis: "filed" | "prior-quarter-end" | "calendar-year-before"` (`CurrentCapitalSnapshot` is a Stage B type, `currentCapital.ts:31`, not part of `ReportSchema`, so no schema change). "prior-quarter-end" is the day after the fifth-newest quarter's end, the start the TTM contiguity gate already checks (FIN-113's expected text), and counts as exact.

- [ ] **Step 1: Write the failing test** in `tests/stageB.currentCapital.test.ts` (dates are MU's, NVDA's and AMZN's SEC-filed quarter starts; figures synthetic):

```ts
it("starts a 53-week TTM at the filed start of its oldest quarter (MU calendar)", () => {
  const c = attachCurrentCapital(annual, { ...ttmInputs("2026-09-03"), periodStart: "2025-08-29" }).current!;
  expect(c.periodStart).toBe("2025-08-29");          // HEAD: 2025-09-04
  expect(c.periodStartBasis).toBe("filed");
});
it("starts a 52-week TTM on the Monday after the prior quarter end (NVDA calendar)", () => {
  expect(attachCurrentCapital(annual, { ...ttmInputs("2026-07-26"), periodStart: "2025-07-28" }).current!.periodStart).toBe("2025-07-28"); // HEAD: 2025-07-27
});
it("control: a calendar-quarter TTM is unchanged", () => {
  expect(attachCurrentCapital(annual, { ...ttmInputs("2026-06-30"), periodStart: "2025-07-01" }).current!.periodStart).toBe("2025-07-01");
});
it("falls back to the calendar year before, and the payload stops calling it exact", () => {
  const c = attachCurrentCapital(annual, ttmInputs("2026-09-03")).current!;
  expect(c.periodStart).toBe("2025-09-04");
  expect(c.periodStartBasis).toBe("calendar-year-before");
  // payload note (assembleContextPayload on the synthetic bundle without filed starts):
  expect(note).toMatch(/window 2025-09-04 through 2026-09-03 \(start approximate: twelve calendar months\)/);
  expect(note).not.toMatch(/exact window/);
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/stageB.currentCapital.test.ts -t "filed start"` — expected FAIL: `expected '2025-09-04' to be '2025-08-29'`.
- [ ] **Step 3: Implement.** `periodStart = input.periodStart` when it is a strict ISO day no later than `asOf`, else `yearStart(asOf)`; `periodStartBasis` records which (`input.periodStartBasis ?? "filed"` when a valid start is supplied, else "calendar-year-before"). `compute.ts` passes `ttmInc.periodStart`/`periodStartBasis` (TTM basis) or the latest annual row's filed `fieldProvenance.revenue.periodStart` with "filed" (annual basis). The payload note says "exact window A through B" only for "filed" and "prior-quarter-end". Add a fifth case to the Step 1 test: `{ ...ttmInputs("2026-07-26"), periodStart: "2025-07-28", periodStartBasis: "prior-quarter-end" }` gives start 2025-07-28 and the payload keeps "exact window".
- [ ] **Step 4: Run it.** PASS. Re-run `npx vitest run tests/stageB.currentCapital.test.ts tests/stageB.ttm.compute.test.ts tests/stageC.payload.passes.test.ts` (golden: DEMO's start text may move from the calendar rule to its filed start; re-pin in Task 24b).
- [ ] **Step 5: Benefit check.** FIN-113's probe assertions hold (MU 2025-08-29, NVDA 2025-07-28) and its AMZN control holds. Replay: MU #46 `capital.current.periodStart` 2025-09-04 → 2025-08-29; NVDA #50 2025-07-27 → 2025-07-28; AMZN #43 unchanged. No figure or grade moves (labels only).
- [ ] **Step 6: Docs.** `docs/METHODOLOGY.md`, the current-capital paragraph (`grep -n "twelve calendar months\|current capital" docs/METHODOLOGY.md`): the window starts at the filed start of its oldest quarter; twelve calendar months only as a disclosed fallback.
- [ ] **Step 7: Commit.** `git add src/pipeline/stageB/currentCapital.ts src/pipeline/compute.ts src/pipeline/stageC/payload.ts src/report/financialDiagnostics.ts tests/stageB.currentCapital.test.ts docs/METHODOLOGY.md` then `git commit -m "Start the current-capital window at its oldest quarter's filed start (FIN-113)"`.

### Task 6: An operating-loss year counts against the terminal every-year rule (FIN-102)

**Files:**
- Modify `src/pipeline/stageB/returns.ts:1718-1808` (`computeRoic`: record the year's terminal-evidence return), the `RoicYear` type.
- Modify `src/pipeline/stageB/valuation.ts:917-935` (`DcfRoicYear.operatingLoss?`), `:1074-1081` (miss text names "operating loss").
- Modify `src/pipeline/compute.ts:3501-3513` (`roicHistory` maps the terminal-evidence return).
- Test: create `tests/stageB.terminalOperatingLoss.test.ts`.

**Interfaces:**
- Produces: `RoicYear.terminalEvidenceRoicPct?: number | null` (for every year: `roicPct` when established; for a year with operating income ≤ 0 and a positive average invested capital, operating income ÷ average invested capital × 100 at a 0% tax rate, with `RoicYear.operatingLoss = true`); `DcfRoicYear.operatingLoss?: boolean`.
- `roicHistory` entries: `roicPct: y.terminalEvidenceRoicPct ?? y.roicPct`, `operatingLoss: y.operatingLoss === true`.
- Unchanged: `RoicYear.roicPct` (stays null for the loss year: D-99's reported series, moat grade and ROIC-floor label).

- [ ] **Step 1: Write the failing test**, from `tmp/audit-2026-10-27/probes/FIN-102.probe.ts:14-58` (synthetic):

```ts
it("holds the terminal ROIC at WACC when a year in the window was an operating loss", () => {
  const sLoss = computeRoic(LOSS, balance, { domicileCountry: "US" }).series;
  const loss2023 = sLoss.find((y) => y.date === "2023-12-31")!;
  expect(loss2023.roicPct).toBeNull();                                   // control: D-99 reported series unchanged
  expect(loss2023.terminalEvidenceRoicPct).toBeCloseTo(-6.8182, 3);       // −3B over average capital 44B, 0% tax
  const aLoss = buildDcfAssumptions(inputs(history(sLoss))).assumptions!;
  expect(aLoss.terminal.roicTermPct.value).toBe(8.5);                     // HEAD: 13.5
  expect(aLoss.terminal.roicTermPct.basis + (aLoss.terminal.note ?? "")).toMatch(/2023-12-31: ROIC -6\.82% \(operating loss\) vs WACC 8\.5%/);
  expect(runDcf(aLoss, bridge).perShare!).toBeLessThanOrEqual(runDcf(aThin, bridge).perShare!); // HEAD: 134.48 > 123.67
});
// Controller ruling 2026-10-29 (pre-flight section 2): a year whose ROIC B4a refuses (invested capital unknown: a refused temporary-equity or lease-scope year) is "missing" for the every-year rule, never an operating loss.
it("a year B4a refuses stays missing, not a loss year", () => {
  // ALL_GOOD with its 2024-12-31 balance given a refused temporary-equity operand (B4a Task 3: fieldConflicts.temporaryEquity.usable === false), so that year has no invested capital
  const sRefused = computeRoic(ALL_GOOD, balanceWithRefused2024, { domicileCountry: "US" }).series;
  const y2024 = sRefused.find((y) => y.date === "2024-12-31")!;
  expect(y2024.roicPct).toBeNull();
  expect(y2024.operatingLoss ?? false).toBe(false);                      // refused, not a loss
  expect(y2024.terminalEvidenceRoicPct ?? null).toBeNull();               // no evidence value is invented for it
  const aRefused = buildDcfAssumptions(inputs(history(sRefused))).assumptions!;
  expect(aRefused.terminal.roicTermPct.basis + (aRefused.terminal.note ?? "")).not.toMatch(/2024-12-31: ROIC .*(operating loss)/);
  // the every-year rule treats it exactly as a year with no balance today
  const sMissing = computeRoic(ALL_GOOD, balanceWithout2024, { domicileCountry: "US" }).series;
  expect(aRefused.terminal.roicTermPct.value).toBe(buildDcfAssumptions(inputs(history(sMissing))).assumptions!.terminal.roicTermPct.value);
});
it("control: five profitable years above WACC keep the carry", () => {
  const good = buildDcfAssumptions(inputs(history(computeRoic(ALL_GOOD, balance, { domicileCountry: "US" }).series))).assumptions!;
  expect(good.terminal.roicTermPct.value).toBeGreaterThan(8.5);
  expect(good.terminal.roicTermPct.basis + (good.terminal.note ?? "")).not.toMatch(/operating loss/);   // no year is read as a loss
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/stageB.terminalOperatingLoss.test.ts` — expected FAIL: `expected undefined to be close to -6.8182`, then `expected 13.5 to be 8.5`.
- [ ] **Step 3: Implement.** In `computeRoic`, a year whose operating income is ≤ 0 still computes average invested capital (the balance lookup moves above the tax step for that branch only) and sets `terminalEvidenceRoicPct = ebit / icAvg × 100`, `operatingLoss = true`; every other year sets `terminalEvidenceRoicPct = roicPct`. `terminalRoic`'s miss text for such a year reads `<date>: ROIC <x>% (operating loss) vs WACC <y>%`. The excess-return four-of-five rule (financial routes) is untouched.
- [ ] **Step 4: Run it.** PASS. Re-run `npx vitest run tests/stageB.growth.returns.capital.test.ts tests/stageB.valuation.test.ts tests/stageB.dcfAnchoring.test.ts`: unchanged (no operating-loss year in their windows; if one has one, its terminal re-pin cites D-next and OD-2).
- [ ] **Step 5: Benefit check.** The probe's assertion (13.5 ≤ 8.5) now holds and the issuer that lost money no longer earns the higher value; the THIN control (8.5) holds. Replay: none of reports 43–50 has an operating-loss year in its window (record terminal ROIC unchanged for each). Grades and the ROIC series in the returns section do not move.
- [ ] **Step 6: Docs.** `docs/METHODOLOGY.md:684-687` ("Terminal value house convention"): an operating-loss year is a below-WACC year for the every-year rule (0% tax, named "operating loss"); `:3200-3205` (the D-99 loss-year paragraph): the reported ROIC still leaves it out.
- [ ] **Step 7: Commit.** `git add src/pipeline/stageB/returns.ts src/pipeline/stageB/valuation.ts src/pipeline/compute.ts tests/stageB.terminalOperatingLoss.test.ts docs/METHODOLOGY.md` then `git commit -m "Count an operating-loss year as a miss in the terminal excess-return rule (FIN-102)"`.

### Task 7: One operating income across the coverage ratio, the terminal evidence and the margin fade (FIN-402, FIN-402-V1, FIN-402-V2)

Amended by pre-flight R3 (OD-7). A D-98 tag family filed in 3 or more of the last 5 fiscal years is a recurring operating cost: it is not added back in the history margins, the scenario ceiling's history or the terminal evidence, and the basis names it. The ceiling's history reads the same normalised rows, and a year whose one-off cannot be named keeps main's row. Census evidence row E6 (Task 29b) measures it. Built on B4a's invested capital (Global Constraints, cross-batch).

**Files:**
- Modify `src/pipeline/stageB/unusualItems.ts:83-115` (add a per-fiscal-year wrapper and the recurrence guard, `withoutRecurringFamilies`).
- Modify `src/pipeline/compute.ts:2917-2966` (coverage EBIT and its label), `:3013-3016` and `:1674-1707` (`priorYearCostOfDebt` EBIT), `:3334-3341` (`dcfIncomeHistory` rows carry the year's one-offs), `:3501-3513` (`roicHistory` evidence on normalised NOPAT).
- Modify `src/pipeline/stageB/returns.ts:1718-1808` (`computeRoic` option `unusualByYear`), `:795-813` (note text comes from the label).
- Modify `src/pipeline/stageB/valuation.ts:668-678` (`DcfIncomeRow.unusualOperatingItems?`), `:1900-1917` (history margins), `:1996-1997` and `:2203` (scenario ceiling reads the normalised TTM row and the normalised history rows; `scenarioMarginCeiling` is `:1644-1680`, `:1644-1667` at B13), `:2012-2014` (regime note names adjusted years and recurring families).
- Test: create `tests/stageB.oneOperatingIncome.test.ts`.

**Interfaces:**
- Produces: `export function unusualOperatingItemsByFiscalYear(facts: CompanyFacts | null | undefined, q: { fiscalYearEnds: readonly string[]; unit: string | null; observedAt: string }): Map<string, UnusualOperatingItems>` (each year's FY fact, same total-else-components rule; calls `unusualOperatingItemsTtm` with `ttmEnd = fiscalYearEnd`, which `tagTtm` already resolves to the fiscal-year fact when the two ends are within 7 days; the wrapper rewrites the returned `basis` to "tagged one-off items inside operating income for the fiscal year ending X (…)" so it does not claim a TTM).
- `export function withoutRecurringFamilies(byYear: ReadonlyMap<string, UnusualOperatingItems>, lastFiveFiscalYearEnds: readonly string[]): { byYear: Map<string, UnusualOperatingItems>; recurring: Array<{ tag: string; years: string[] }> }` in `unusualItems.ts` (pre-flight R3).
  - A family is the tag a component is filed under (`UnusualOperatingItems.components[].tag`), counted per family, not "any tag".
  - A family filed in 3 or more of `lastFiveFiscalYearEnds` is recurring. Its components leave `byYear` (each year's `value` is re-summed from the components left, and a year left with none drops out), and it is listed with its years, newest first.
  - The per-year map handed to `computeRoic` (`unusualByYear`) and the `dcfIncomeHistory` rows' `unusualOperatingItems` come from the guarded map. The coverage ratio and `priorYearCostOfDebt` keep the unguarded amounts: R3 names only the history margins (with the ceiling's history) and the terminal evidence.
- `computeRoic(inc, bal, { …, unusualByYear?: ReadonlyMap<string, number> })`: `terminalEvidenceRoicPct` uses operating income less that year's net one-offs (charges added back, gains removed) at the year's tax rate (the D-58 floor when pre-tax is not positive but normalised EBIT is), invested capital as reported. `roicPct` is unchanged.
- `DcfIncomeRow.unusualOperatingItems?: number | null` (net, gains positive).
- Coverage: `ebitTtm` passed to `computeWacc` = `ebitForWacc − unusual.value` when the basis window's one-offs are resolved; the window is the EBIT leg's own basis (TTM EBIT: the TTM one-offs; FY EBIT, including the mixed-basis branch at `compute.ts:2945-2963` where interest is TTM and EBIT annual: that fiscal year's amount); `currentCoverageBasis` becomes e.g. `"TTM operating income excluding tagged one-off items of −89.7B (us-gaap/AssetImpairmentCharges)"`.
- Margin ceiling: `scenarioMarginCeiling(ttm, history)` (`valuation.ts:1644-1680`) reads the leanest operating-expense ratio across the TTM **and the last five fiscal years**, so both arguments are normalised: the TTM row with `operatingIncome = baseOperatingIncome − unusual.value`, and each history row with `operatingIncome − unusualOperatingItems` (at both call sites, `:1997` and `:2203`). Under the recurrence guard (pre-flight R3), a recurring family stays in each history row, and a year whose one-off cannot be named keeps main's row: withheld means no tag and filed amount, and `unusualOperatingItems` is then null. So the ceiling's history reads the same rows as the fade (one operating income), and B5c (VAL-6) reads this rule.

- [ ] **Step 1: Write the failing test** in `tests/stageB.oneOperatingIncome.test.ts` (synthetic; shapes from `tmp/audit-2026-10-27/probes/FIN-402.probe.ts`, `FIN-402-V1.probe.ts` unit B and `FIN-402-V2.probe.ts:30-91`; the companyfacts builder is `tests/stageB.unusualItems.test.ts:17-18`'s `facts()`):

```ts
it("control (passes at HEAD; computeWacc itself is unchanged): the levered unit's rating on raw and normalised EBIT", () => {
  // Levered unit from the finding: EBIT 3.5B before a 2.3B goodwill impairment, interest 1.0B on 30B debt, D/V 40%.
  const adjusted = computeWacc({ ...LEVERED, ebitTtm: 3.5e9, currentCoverageBasis: "TTM operating income excluding tagged one-off items of −2.3B" });
  const raw = computeWacc({ ...LEVERED, ebitTtm: 1.2e9 });
  expect(raw.syntheticRating).toBe("Caa/CCC");
  expect(adjusted.syntheticRating).toBe("A3/A-");
  expect(adjusted.notes.join(" ")).toMatch(/ICR 3\.5 on TTM operating income excluding tagged one-off items/);
});
it("wires the TTM one-offs into the coverage ratio through runStageB (FIN-402, the failing case)", () => {
  // completeCurrencyBundle + bundle.edgar.companyFacts carrying us-gaap/AssetImpairmentCharges inside the TTM,
  // built as tests/audit.issuerPipeline.test.ts:342-356 builds its InsuredEventGainLoss / AssetImpairmentCharges
  // facts (confirmedIssuerFacts must accept the CIK); consistent bundle (operating income, pre-tax, tax at the TTM
  // rate and net income all lowered by the charge; pre-tax stays positive). noCharge is the same bundle with
  // the charge added back and no fact.
  expect(withCharge.returns.wacc.syntheticRating).toBe(noCharge.returns.wacc.syntheticRating);      // HEAD: re-rated lower
  expect(withCharge.returns.wacc.interestCoverageRatio).toBeCloseTo(noCharge.returns.wacc.interestCoverageRatio!, 6);
  expect(withCharge.returns.wacc.notes.join(" ")).toMatch(/excluding tagged one-off items of −/);
});
it("an operating loss made only by a tagged impairment counts on its normalised operating income (Tasks 6 and 7 together)", () => {
  // FIN-402-V1 measurement C: FY2025 EBIT 170 cut to −10 by a 180 impairment. After Task 6 alone it would be an
  // operating-loss miss (terminal held at WACC); with the one-off added back it is 17.57% > 9% and the carry stays.
  const series = computeRoic(UNIT_C_INCOME, UNIT_B_BALANCE, { domicileCountry: "US", unusualByYear: new Map([["2025-12-31", -180]]) }).series;
  const fy25 = series.find((y) => y.date === "2025-12-31")!;
  expect(fy25.roicPct).toBeNull();                                          // reported GAAP ROIC: operating loss, left out (D-99)
  expect(fy25.operatingLoss).not.toBe(true);                                // normalised EBIT is positive
  expect(fy25.terminalEvidenceRoicPct).toBeCloseTo(17.57, 2);
  expect(buildDcfAssumptions(unitBInputs(series)).assumptions!.terminal.roicTermPct.value).toBeCloseTo(12.89375, 4);
});
it("reads the terminal evidence on the normalised operating income (FIN-402-V1)", () => {
  const series = computeRoic(UNIT_B_INCOME, UNIT_B_BALANCE, { domicileCountry: "US", unusualByYear: new Map([["2025-12-31", -90]]) }).series;
  const fy25 = series.find((y) => y.date === "2025-12-31")!;
  expect(fy25.roicPct).toBeCloseTo(8.27, 2);                                // control: reported GAAP ROIC unchanged
  expect(fy25.terminalEvidenceRoicPct).toBeCloseTo(17.57, 2);
  expect(buildDcfAssumptions(unitBInputs(series)).assumptions!.terminal.roicTermPct.value).toBeCloseTo(12.89375, 4); // HEAD: 9
});
it("fades the margin from a history read without the one-off its seed removes (FIN-402-V2 A)", () => {
  const raw = buildDcfAssumptions({ ...common, incomeTtm: { ...histRaw[4], basis: "annual" }, incomeHistory: histRaw.map(withYearOneOff), unusualOperatingItems: unusual }).assumptions!;
  const norm = buildDcfAssumptions({ ...common, incomeTtm: { ...histRaw[4], basis: "annual" }, incomeHistory: histNorm, unusualOperatingItems: unusual }).assumptions!;
  expect(raw.ebitMarginPath.value).toEqual(norm.ebitMarginPath.value);      // HEAD: 18, 16.5, 15, … vs 18 flat
});
it("caps the improving target at a ceiling read without the TTM gain (FIN-402-V2 B)", () => {
  expect(raw.scenarioMarginCeiling?.pct).toBeCloseTo(20, 9);                // HEAD: 30
  expect(raw.ebitMarginPath.value).toEqual(normRow.ebitMarginPath.value);
});
it("control: withheld tags stay in, and an issuer with no tagged items is unchanged", () => {
  // withheldUnusual: the V2 A `unusual` with only a withheld component (no tag and filed amount; unusual.withheld set, no value)
  const withheld = buildDcfAssumptions({ ...common, incomeTtm: { ...histRaw[4], basis: "annual" }, incomeHistory: histRaw, unusualOperatingItems: withheldUnusual }).assumptions!;
  const none = buildDcfAssumptions({ ...common, incomeTtm: { ...histRaw[4], basis: "annual" }, incomeHistory: histRaw }).assumptions!;
  expect(withheld.ebitMarginPath.value).toEqual(none.ebitMarginPath.value);               // history margins as filed
  expect(withheld.scenarioMarginCeiling).toEqual(none.scenarioMarginCeiling);             // ceiling as filed
  // coverage: the wiring case's bundle with its impairment fact withheld, against the same bundle with no fact
  expect(withheldFact.returns.wacc.interestCoverageRatio).toBe(noFact.returns.wacc.interestCoverageRatio);
  expect(withheldFact.returns.wacc.notes.join(" ")).not.toMatch(/excluding tagged one-off items/);
});
it("treats a tag family filed in 3 or more of the last 5 fiscal years as a recurring operating cost (pre-flight R3)", () => {
  // Synthetic per-year map: GoodwillImpairmentLoss in FY2021, FY2023 and FY2025; InsuredEventGainLoss in FY2024 only.
  const r = withoutRecurringFamilies(byYear, ["2025-12-31", "2024-12-31", "2023-12-31", "2022-12-31", "2021-12-31"]);
  expect(r.recurring).toEqual([{ tag: "GoodwillImpairmentLoss", years: ["2025-12-31", "2023-12-31", "2021-12-31"] }]);
  expect([...r.byYear.keys()]).toEqual(["2024-12-31"]);                     // only the one-off family is added back
});
it("control: a family filed in 2 of the last 5 fiscal years is added back", () => {
  // twoOfFive: GoodwillImpairmentLoss in FY2025 and FY2023 only, built newest first
  const r = withoutRecurringFamilies(twoOfFive, ["2025-12-31", "2024-12-31", "2023-12-31", "2022-12-31", "2021-12-31"]);
  expect(r.recurring).toEqual([]);
  expect([...r.byYear.keys()]).toEqual(["2025-12-31", "2023-12-31"]);
  expect(r.byYear.get("2025-12-31")).toEqual(twoOfFive.get("2025-12-31"));               // amounts kept
  expect(r.byYear.get("2023-12-31")).toEqual(twoOfFive.get("2023-12-31"));
});
it("keeps a recurring family in the history margins, the ceiling's history and the terminal evidence, and names it (wiring)", () => {
  // recurring = runStageB on the wiring case's bundle with GoodwillImpairmentLoss tagged in FY2025, FY2023 and FY2021 of its five
  // fiscal years; untagged = the same bundle with no tags. The equalities pass at HEAD (main adds nothing back), and each fails
  // on an unguarded add-back, which moves the margin path, the ceiling and the terminal evidence.
  const v = recurring.valuation.assumptions!, u = untagged.valuation.assumptions!;
  expect(v.ebitMarginPath.value).toEqual(u.ebitMarginPath.value);
  expect(v.scenarioMarginCeiling).toEqual(u.scenarioMarginCeiling);
  expect(v.terminal.roicTermPct.value).toBe(u.terminal.roicTermPct.value);
  expect(recurring.returns.roic.series.map((y) => y.terminalEvidenceRoicPct)).toEqual(untagged.returns.roic.series.map((y) => y.terminalEvidenceRoicPct));
  const text = [...recurring.valuation.notes, v.ebitMarginPath.basis, v.terminal.roicTermPct.basis, v.terminal.note ?? ""].join(" ");
  expect(text).toMatch(/GoodwillImpairmentLoss[^.]*in 3 of the last 5 fiscal years[^.]*2025-12-31[^.]*2023-12-31[^.]*2021-12-31[^.]*not added back/);
});
it("reads the scenario ceiling's history on the normalised rows, and keeps main's row for a one-off it cannot name (pre-flight R3)", () => {
  // histNamed: the V2 inputs with FY2023 carrying a named charge (unusualOperatingItems −X) that lowers its operating income, chosen
  // so FY2023's normalised margin is the leanest of the five; histAddedBack: the same rows with FY2023's operatingIncome + X and no field
  const build = (incomeHistory: DcfIncomeRow[]) => buildDcfAssumptions({ ...common, incomeTtm: { ...histRaw[4], basis: "annual" }, incomeHistory }).assumptions!;
  expect(build(histNamed).scenarioMarginCeiling).toEqual(build(histAddedBack).scenarioMarginCeiling);
  const main = build(histNamed.map(({ unusualOperatingItems, ...row }) => row));          // main's rows: no one-off field
  expect(build(histNamed).scenarioMarginCeiling).not.toEqual(main.scenarioMarginCeiling); // the named one-off moves the ceiling
  // control: the same year with the amount withheld (unusualOperatingItems null) keeps main's row
  expect(build(histNamed.map((row) => ({ ...row, unusualOperatingItems: null }))).scenarioMarginCeiling).toEqual(main.scenarioMarginCeiling);
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/stageB.oneOperatingIncome.test.ts` — expected FAIL: `unusualOperatingItemsByFiscalYear is not a function` (import); then the wiring case `expected 'Caa/CCC' to be 'Aaa/AAA'`-style; V1 `expected 9 to be close to 12.89375`; measurement C `expected undefined to be close to 17.57`; V2 A `toEqual` mismatch; V2 B `expected 30 to be close to 20`; `withoutRecurringFamilies is not a function` (the R3 case and the two-of-five control); the named-one-off ceiling case on main's ceiling; the recurring-family wiring case on its naming assertion only (`expected '…' to match /GoodwillImpairmentLoss…/`), since its equalities hold at HEAD (main adds nothing back). The levered-unit control, the withheld-tags control and the withheld ceiling assertion pass at HEAD.
- [ ] **Step 3: Implement.** In `computeReturnsBlock` resolve the coverage window's one-offs on the EBIT leg's basis (TTM EBIT: `unusualOperatingItemsTtm` over the TTM, as `dcfIncomeTtm` does; FY EBIT, mixed basis included: the year's FY amount) and subtract `unusual.value` from `ebitForWacc` only when it is non-zero and not withheld; append the label. `priorYearCostOfDebt` subtracts that fiscal year's amount from its `ebit` and says so in its label. `computeRoic` receives `unusualByYear` from the same per-year map; for a year whose raw EBIT ≤ 0 but normalised EBIT > 0 it sets `terminalEvidenceRoicPct` from the normalised NOPAT (D-58 floor when pre-tax ≤ 0) and leaves `operatingLoss` unset, so Task 6's rule applies only to a loss that survives the add-back. `dcfIncomeHistory` rows carry `unusualOperatingItems`; `histMarginPoints` use `(operatingIncome − unusual) / revenue`; `scenarioMarginCeiling` receives the normalised TTM row and the normalised history rows whenever any one-off was removed, at both call sites; the regime note names each adjusted year. Recurrence guard (pre-flight R3): `compute.ts` builds the per-year map over the last five fiscal years and passes it through `withoutRecurringFamilies`. It sets `unusualByYear` and the history rows' `unusualOperatingItems` from the guarded map, so the fade, the ceiling's history and the terminal evidence share one set of rows. The regime note and the terminal note name each recurring family, its count and its years ("… in N of the last 5 fiscal years (…); not added back").
- [ ] **Step 4: Run it.** PASS. Re-run `npx vitest run tests/stageB.unusualItems.test.ts tests/stageB.waccPriorYearCostOfDebt.test.ts tests/stageB.dcfAnchoring.test.ts tests/stageB.growth.returns.capital.test.ts tests/stageB.terminalOperatingLoss.test.ts`: unchanged except where a fixture tags a one-off (re-pin with D-next).
- [ ] **Step 5: Benefit check.** FIN-402's probe assertion (rating unchanged by a tagged non-cash charge) holds; FIN-402-V1's A and B and FIN-402-V2's A, B and C assertions hold on their synthetic shapes. Replay: reports 43–50 tag no one-off in their windows except as recorded by `unusualOperatingItemsTtm` today; record WACC, rating, terminal ROIC and margin target before/after for each and confirm every move traces to a tagged item named in the new labels (none expected on AMZN #43 as stored). **Census evidence row E6 (pre-flight R3; Task 29b Step C, the Task 6 → Task 7 commit pair, per share and regime on all 50 inputs).** The expected values are the pre-flight's at B13, re-taken on B4a's base.
  - CAT ≈ +9.53% (245.67 → 269.07), through the normalised ceiling history. It is an intended move only if E6 shows its FY2022 tag is one year of five and names it with its filed amount. Otherwise CAT's FY2022 ceiling row stays at main's and the residual is recorded.
  - JNJ, PEP and CVX do not move (their families recur), unless the per-family count lets one move. E6 then names the family and its years, and the move is explained before merge.
  - AMZN, EXPE, KO, VZ, DUK, CSCO, FCX, MCD, TSLA and BA do not move.

  Any other move is traced to a named, non-recurring one-off before merge.
- [ ] **Step 6: Docs.** `docs/METHODOLOGY.md:258` (coverage basis: tagged one-offs removed, named in the note), `:584-597` (margin fade: the history and the scenario ceiling read the seed's operating income), `:680-690` (terminal evidence on normalised NOPAT; reported ROIC stays GAAP), `:3138-3146` (D-98 paragraph: scope now seed, coverage, terminal evidence and fade). The recurrence rule (pre-flight R3) goes into `:584-597` and `:680-690`: a tag family filed in 3 or more of the last 5 fiscal years is a recurring operating cost, counted per family, left in and named. The margin-fade paragraph adds that the scenario ceiling's history reads the same normalised rows, and that a one-off that cannot be named keeps the filed row.
- [ ] **Step 7: Commit.** `git add src/pipeline/stageB/unusualItems.ts src/pipeline/compute.ts src/pipeline/stageB/returns.ts src/pipeline/stageB/valuation.ts tests/stageB.oneOperatingIncome.test.ts docs/METHODOLOGY.md` then `git commit -m "Read one operating income across coverage, terminal evidence and the margin fade (FIN-402, FIN-402-V1, FIN-402-V2)"`.

### Task 7b: Year-one reinvestment is front-loaded to the trailing net capital spending (pre-flight R6; REPORT52 F-06)

New (pre-flight R6). It runs after Task 7, on B4a's lease-excluded invested capital and sales-to-capital.

**Rule (front-load, not add).**
- In `runDcf` (`valuation.ts:2587` at B13: `Math.max(0, (rev - prev) / s2c)`), year one's reinvestment = max(ΔRev₁ ÷ S2C, NC) when ΔRev₁ > 0 and NC = TTM capex − TTM D&A is established. NC comes from the cash-flow quarters of the start-revenue window, in the model currency; on the annual base period it is the fiscal year's.
- The excess X = NC − ΔRev₁ ÷ S2C is recovered from later years: R_t = max(0, ΔRev_t ÷ S2C − remaining X) until X is used.
- Explicit-horizon capital is then Σ ΔRev_t ÷ S2C, as the sales-to-capital method states, and any unrecovered rest is stated. Terminal reinvestment (g ÷ ROIC) and the terminal value are unchanged.
- Capital already being spent ahead of revenue is timing. The additive floor is rejected: it would count that capital twice, once now and again when the revenue it builds arrives.
- Guided capex is not parsed today (EX-99.1 rarely carries it); its parsing goes to the data batch (Global Constraints, cross-batch).

**Interaction with B4a.**
- B4a's lease-excluded invested capital raises sales-to-capital (#51/#52: 1.4148 → ≈1.7163). The year-one need falls from 71.16B to ≈58.66B, and X grows from 26.67B to ≈39.17B. The front-load's cost on #52 rises from −0.23 to ≈−0.34 a share; the additive floor's would rise from −2.40 to ≈−3.52.
- NC is cash capex, which excludes right-of-use leases, so it matches B4a's lease-excluded capital. Under `includeLeasesInEv` (lease-included capital), cash capex omits lease additions, so NC is a lower bound and binds less; the basis says so.
- B4a Task 5's sales-to-capital clamp at 5 (AAPL, COST, EXPE, UNH) makes the need smallest, but all four have NC below their need at B13.

**Files:**
- Modify `src/pipeline/stageB/valuation.ts`: `DcfAssumptions` and `DcfAssumptionInputs` (`trailingNetCapex`), `runDcf` (`:2587` at B13), and the reinvestment basis.
- Modify `src/pipeline/compute.ts`: TTM capex and D&A on the start-revenue window (the fiscal year on the annual base period), passed via `dcfInputs`. That is the literal B4a also extends with `evIncludeLeases`; there is no new `getConfig` read, and the count stays 4.
- Modify `src/pipeline/stageB/projections.ts` only if the FCF chart mirrors the DCF's reinvestment.
- Modify `docs/METHODOLOGY.md` (D-58 reinvestment).
- Test: create `tests/stageB.reinvestmentFrontLoad.test.ts`.
- Stamps: B5b's (Task 23b).

**Interfaces:**
- `DcfAssumptionInputs.trailingNetCapex?: number | null` and `DcfAssumptions.trailingNetCapex?: number | null`: NC in the model currency, null when TTM capex or D&A is not established on the window.
- `runDcf`: year one's reinvestment and the recovery follow the Rule. Every year's row equals HEAD's when NC is null, when NC is at or below the need, or when ΔRev₁ ≤ 0.
- Basis: it contains "at least the trailing net capital spending (capex less D&A) <NC>" when the front-load binds, and names the amount recovered from later years and any unrecovered rest. Under `includeLeasesInEv` it says NC is a lower bound, because cash capex omits lease additions.

- [ ] **Step 1: Write the failing test** in `tests/stageB.reinvestmentFrontLoad.test.ts`:

```ts
it("front-loads year-one reinvestment to the trailing net capital spending and recovers it later (F-06)", () => {
  // runDcf on synthetic assumptions: start revenue 1000, growth [10, 8, …], S2C 2, trailingNetCapex 80 (capex 120, D&A 40)
  expect(r.yearRows[0]!.reinvestment).toBeCloseTo(80, 9);   // HEAD: 50
  expect(r.yearRows[1]!.reinvestment).toBeCloseTo(14, 9);   // HEAD: 44 (1188 − 1100 = 88, ÷ 2); 30 recovered
  expect(r.yearRows.slice(2).map((y) => y.reinvestment)).toEqual(head.yearRows.slice(2).map((y) => y.reinvestment));
  expect(sum(r.yearRows.map((y) => y.reinvestment))).toBeCloseTo(sum(head.yearRows.map((y) => y.reinvestment)), 9);
  expect(r.terminalValue).toBe(head.terminalValue);
  expect(basis).toContain("at least the trailing net capital spending (capex less D&A) 80");
});
it("controls: every year's row equals HEAD's when net capex is below the need, year-one growth is negative, or net capex is not established", () => {
  // synthetic(o): the first case's assumptions with overrides; HEAD's rows are the same assumptions with trailingNetCapex absent
  const headRows = (a: DcfAssumptions) => runDcf({ ...a, trailingNetCapex: undefined }).yearRows;
  for (const a of [synthetic({ trailingNetCapex: 40 }), synthetic({ yearOneGrowthPct: -5, trailingNetCapex: 80 }), synthetic({ trailingNetCapex: null })]) {
    expect(runDcf(a).yearRows).toEqual(headRows(a));
  }
});
it("says the trailing net capital spending is a lower bound when leases are inside invested capital", () => {
  // the first case's assumptions built with includeLeasesInEv: true; basis and leasedBasis are each run's reinvestment basis
  const leased = runDcf(synthetic({ trailingNetCapex: 80, includeLeasesInEv: true }));
  expect(leased.yearRows.map((y) => y.reinvestment)).toEqual(r.yearRows.map((y) => y.reinvestment)); // the front-load still binds: 80, 14, …
  expect(leasedBasis).toMatch(/lower bound/);
  expect(leasedBasis).toMatch(/cash capex omits lease additions/);
  expect(basis).not.toMatch(/lower bound/);                                                  // control: lease-excluded capital
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/stageB.reinvestmentFrontLoad.test.ts` — expected FAIL: `expected 50 to be close to 80`, then `expected 44 to be close to 14`, then the basis `toContain`; the lease case on its reinvestment rows and `/lower bound/`. The three controls pass at HEAD.
- [ ] **Step 3: Implement** per the Rule and Interfaces. `compute.ts` builds NC from the cash-flow quarters of the start-revenue window, in the model currency, under the currency gates the window already uses. On the annual base period it uses the fiscal year's capex and D&A.
- [ ] **Step 4: Run it.** PASS. Re-run `npx vitest run tests/stageB.valuation.test.ts tests/stageB.dcfAnchoring.test.ts tests/stageB.dcfDomain.audit20261022.test.ts tests/stageB.projections.test.ts`: unchanged, because their fixtures carry no `trailingNetCapex`. `tests/stageC.payload.passes.test.ts` moves only if its fixture's NC binds; re-pin in Task 24b.
- [ ] **Step 5: Benefit check.**
  - Expected replay: the pre-flight's analytic emulation at B13 (`capexfloor.txt`), re-taken on B4a's base in Task 29b. It binds on 7 of 31 published DCFs, from −0.02% to −0.71%:
    - #43: −0.52 (−0.62%);
    - AMZN keyless: −0.70 (−0.71%);
    - AMZN #51 and #52: −0.23 (−0.20%) at B13, ≈ −0.34 a share after B4a. Their year-one FCFF goes from +10.74B to about −15.9B, in line with the issuer's TTM FCF of −7.6B (REPORT52's checked list);
    - GOOGL: −0.24 (−0.11%); WMT: −0.05 (−0.11%); MSFT: −0.05 (−0.02%).
  - Not binding: NVDA (NC 3.67B against a 132.64B need), AAPL, CAT, CVX, MU #46 and the rest.
  - Total explicit-horizon reinvestment and the terminal value are unchanged on every input (asserted in Task 29b).
  - Shapes hurt: a one-off capex spike, or D&A below economic depreciation, moves capital earlier (at most −0.71% in the census). For a shrinking issuer the rule is off.
- [ ] **Step 6: Docs.** In `docs/METHODOLOGY.md`, the D-58 reinvestment paragraph gains the rule: the front-load, its recovery from later years, the unchanged total and terminal, the `includeLeasesInEv` lower bound, and that the additive floor was rejected.
- [ ] **Step 7: Commit.** `git add src/pipeline/stageB/valuation.ts src/pipeline/compute.ts tests/stageB.reinvestmentFrontLoad.test.ts docs/METHODOLOGY.md` (plus `src/pipeline/stageB/projections.ts` if changed) then `git commit -m "Front-load year-one reinvestment to the trailing net capital spending and recover it later (REPORT52 F-06)"`.

### Task 8: The debt leg follows the balance that is weighted (FIN-116)

**Files:**
- Modify `src/pipeline/stageB/returns.ts:598-657` (`hasDebt`), `:672-685` and `:687-745` (gaps keyed to the weighted balance), `:763-768` (no effective rate over a zero average), `:841-846` (no-debt note).
- Test: modify `tests/stageB.growth.returns.capital.test.ts` (WACC block) or create `tests/stageB.waccDebtLeg.test.ts`.

**Interfaces:**
- `computeWacc` (unchanged signature). Internals: `const latestDebt = isFiniteNumber(inputs.totalDebtLatest) && inputs.totalDebtLatest >= 0 ? inputs.totalDebtLatest : null; const hasDebt = (latestDebt ?? debtAvg ?? 0) > 0;` `rdEffective` is null when `debtAvg <= 0` (at HEAD `intExp / 0` is `Infinity`, which only the band rejects); `deMinimis` additionally requires `debtAvg > 0`, so a new borrower is never told "debt < 1% of total assets"; the `debtAvg === 0` note at `:655-657` is printed only when `hasDebt` is false, and a repaid issuer (latest 0, average > 0) gets "no debt at the latest balance (average <avg>) — WACC = cost of equity". The only producer of `totalDebtLatest` is `compute.ts:3020` (the current WACC); the per-fiscal-year WACC history does not pass it, so its debt leg is unchanged.

- [ ] **Step 1: Write the failing test** (synthetic; from `FIN-116.probe.ts:77-101`):

```ts
it("gives a new borrower a debt leg, and withholds the WACC when its cost cannot be established", () => {
  const res = computeWacc({ beta: 1.2, riskFreePct: 5, erpPct: 4.46, interestExpenseTtm: null, totalDebtAvg: 0, totalDebtLatest: 10e9,
    totalDebtLatestBasis: "the latest balance (2026-07-26)", marketCap: 40e9, effectiveTaxRate: 0.2, ebitTtm: 3e9,
    analysisDate: "2026-10-27", reportedCurrency: "USD", quoteCurrency: "USD" });
  expect(res.waccPct).toBeNull();                                            // HEAD: 10.0547 (all equity)
  expect(res.gaps.some((g) => g.field === "returns.wacc.interestExpense" && g.severity === "critical")).toBe(true);
});
it("prices a new borrower with positive interest by the synthetic rating, not interest over a zero average", () => {
  // NEW_BORROWER = the first case's inputs; totalAssets 500e9 so the de-minimis test would fire on the average.
  const res = computeWacc({ ...NEW_BORROWER, interestExpenseTtm: 0.2e9, totalAssets: 500e9 });
  expect(res.costOfDebtMethod).toBe("synthetic");
  expect(res.weightDebt!).toBeCloseTo(0.2, 9);
  expect(res.notes.join(" ")).not.toMatch(/outside acceptance band|effective Rd treated as noise/); // HEAD: Infinity% outside the band
});
it("publishes a repaid issuer's all-equity WACC without a critical cost-of-debt gap", () => {
  const res = computeWacc({ ...BASE, interestExpenseTtm: 0, totalDebtAvg: 5e9, totalDebtLatest: 0 });
  expect(res.waccPct).toBeCloseTo(res.costOfEquityPct!, 9);
  expect(res.gaps.filter((g) => g.severity === "critical")).toEqual([]);   // HEAD: critical returns.wacc.interestExpense
  expect(res.notes.join(" ")).toMatch(/no debt at the latest balance/);
});
it("control: average and latest both positive is unchanged", () => {
  // the rule changes only a zero average or a zero latest balance; with both positive the debt leg is HEAD's
  const res = computeWacc({ ...BASE, totalDebtAvg: 5e9, totalDebtLatest: 6e9 });
  expect(res.waccPct).not.toBeNull();
  expect(res.weightDebt!).toBeCloseTo(6e9 / (6e9 + BASE.marketCap!), 9);                   // weighted on the latest balance, as at HEAD
  expect(res.costOfDebtMethod).toBe(computeWacc({ ...BASE, totalDebtAvg: 5e9, totalDebtLatest: 5e9 }).costOfDebtMethod); // the latest balance does not pick the method
  expect(res.gaps.filter((g) => g.severity === "critical")).toEqual([]);
  expect(res.notes.join(" ")).not.toMatch(/no debt at the latest balance/);
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/stageB.waccDebtLeg.test.ts` — expected FAIL: `expected 10.0547… to be null`; `expected [ { severity: 'critical', … } ] to equal []`.
- [ ] **Step 3: Implement** as in Interfaces; with `latestDebt === 0 && debtAvg > 0` the interest, tax-rate and cost-of-debt gaps are pushed at `info` with "nothing consumes it: the debt weight is 0 at the latest balance".
- [ ] **Step 4: Run it.** PASS. Re-run `npx vitest run tests/stageB.growth.returns.capital.test.ts tests/stageB.waccPriorYearCostOfDebt.test.ts tests/stageB.financialRouteWacc.audit20261022.test.ts tests/stageB.ttm.compute.test.ts`: unchanged.
- [ ] **Step 5: Benefit check.** FIN-116's three probe assertions hold on the units; the control (both positive) is identical. Replay: reports 43–50 all have positive average and latest debt: WACC unchanged on every one (must not move).
- [ ] **Step 6: Docs.** `docs/METHODOLOGY.md`, the WACC weights paragraph (`grep -n "latest balance the bridge nets\|debt weight" docs/METHODOLOGY.md`): the debt leg exists when the weighted (latest) balance is positive; a new borrower with no interest history is withheld; a repaid issuer is all-equity with info gaps.
- [ ] **Step 7: Commit.** `git add src/pipeline/stageB/returns.ts tests/stageB.waccDebtLeg.test.ts docs/METHODOLOGY.md` then `git commit -m "Decide the WACC's debt leg on the balance it weights (FIN-116)"`.

### Task 9: The prior-year cost-of-debt path discloses the method that ran (FIN-115)

**Files:**
- Modify `src/pipeline/stageB/returns.ts:700-717` (move the note and gap after the method is set), `:776-781` (band-reject suffix), `:795-833` (synthetic and unavailable branches).
- Modify `tests/stageB.waccPriorYearCostOfDebt.test.ts` (add the three cases below after `:141`; the existing `:114-141` cases are expected to pass unchanged, Step 4).

**Interfaces:** none new; the `returns.wacc.interestExpense` gap text depends on `costOfDebtMethod`.

- [ ] **Step 1: Write the failing test** in `tests/stageB.waccPriorYearCostOfDebt.test.ts` (Apple's SEC-filed FY2023 figures: interest expense $3.933B, operating income $114.301B; risk-free 5.0%):

```ts
it("says a synthetic rating priced the debt when the last-disclosed rate fails the band", () => {
  // The file's own `base` (interestExpenseTtm 0, the FMP zero-for-undisclosed) and `prior` (FY 2023-09-30,
  // interest 3,933 on 115,600 average debt, EBIT 117,669); rf 5% puts the 3.4029% rate below the [4, 24] band.
  const res = computeWacc({ ...base, riskFreePct: 5, priorYearCostOfDebt: { ...prior, pct: 3.4029 } });
  expect(res.costOfDebtMethod).toBe("synthetic");
  const gap = res.gaps.find((g) => g.field === "returns.wacc.interestExpense")!;
  expect(gap.reason).not.toMatch(/cost of debt inferred from the FY 2023-09-30 effective rate/);      // HEAD matches
  expect(gap.reason).toMatch(/synthetic rating scored on FY 2023-09-30 coverage, priced off today's risk-free rate/);
  expect(res.notes.join(" ")).not.toMatch(/cost of debt taken from FY/);
});
it("never says 'synthetic rating used' when none ran", () => {
  const res = computeWacc({ ...base, riskFreePct: 5, priorYearCostOfDebt: { ...prior, pct: 3.4029, ebit: null } });
  expect(res.costOfDebtMethod).toBe("unavailable");
  expect(res.notes.join(" ")).not.toMatch(/synthetic rating used/);
  expect(res.gaps.find((g) => g.field === "returns.wacc.interestExpense")!.severity).toBe("critical");
});
it("control: an accepted historical rate keeps today's wording", () => {
  const res = computeWacc({ ...base, riskFreePct: 5, priorYearCostOfDebt: { ...prior, pct: 4.5 } });   // 4.5 inside [4, 24]
  expect(res.costOfDebtMethod).toBe("historical");
  expect([...res.notes, ...res.gaps.map((g) => g.reason)].join(" ")).toMatch(/cost of debt inferred from the FY 2023-09-30 effective rate/);
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/stageB.waccPriorYearCostOfDebt.test.ts` — expected FAIL on the first two cases with HEAD's texts.
- [ ] **Step 3: Implement.** Compute `priorUsable` and `rdEffective` as now; push the note and gap only after the branch resolves: "historical" keeps HEAD's texts; "synthetic" on the prior pair says the undisclosed interest was replaced by a synthetic rating scored on that year's coverage and priced off today's rf (warn); "unavailable" says the cost of debt is unavailable at `waccGapSeverity`. The band-reject note ends "— synthetic rating used" only when it ran, else "— no synthetic rating computable (…)".
- [ ] **Step 4: Run it.** PASS. Re-run the same file in full. The existing cases should pass without edits: `:114-129` asserts only the warn severity and `/historical cost of debt 2.*outside acceptance band/`, and `:131-141` asserts `unavailable`, a null WACC and `/historical cost of debt 40.*outside acceptance band/`, which the new suffix ("— no synthetic rating computable (…)") still matches. If either fails, the failure must be on wording the finding says is wrong; re-pin it to the new text with a D-next comment, never to a looser pattern.
- [ ] **Step 5: Benefit check.** FIN-115's four probe assertions hold on the units; the accepted-rate control is unchanged. Replay: no stored report has an undisclosed-interest year (record unchanged).
- [ ] **Step 6: Docs.** `docs/METHODOLOGY.md`, the prior-year cost-of-debt paragraph (`grep -n "last disclosed\|latest fiscal year that disclosed" docs/METHODOLOGY.md`): name the three outcomes.
- [ ] **Step 7: Commit.** `git add src/pipeline/stageB/returns.ts tests/stageB.waccPriorYearCostOfDebt.test.ts docs/METHODOLOGY.md` then `git commit -m "Disclose the cost-of-debt method the prior-year path actually ran (FIN-115)"`.

### Task 10: The ERP label names the row used (FIN-114)

**Files:**
- Modify `src/pipeline/compute.ts:349-393` (`selectEquityRiskPremium` also returns the matched row's country label and `countryRiskPremium`), `:2995-3047` (pass them to `computeWacc`).
- Modify `src/pipeline/stageB/returns.ts` (`WaccInputs.erpRow?`, `WaccResult.erpRow?`), `:1019-1024` (`waccDisclosure` label).
- Test: modify `tests/stageB.growth.returns.capital.test.ts` (beside `:1327`).

**Interfaces:** `WaccInputs.erpRow?: { basis: "domicile" | "us-fallback"; countryLabel: string | null; countryRiskPremiumPct: number | null }`, copied onto `WaccResult.erpRow`. Label: US domicile and us-fallback keep `"FMP market-risk-premium (US totalEquityRiskPremium)"`; a non-US domicile row prints `` `FMP market-risk-premium (${countryLabel} totalEquityRiskPremium${crp === null ? "" : `, including a ${crp}% country risk premium`})` ``.

- [ ] **Step 1: Write the failing test** (synthetic premium rows: United States 4.46, Ireland 5.01 with CRP 0.55, Switzerland 4.23):

```ts
it("names a non-US domicile's ERP row", () => {
  // waccBase: the file's existing WACC inputs used by the :1316 disclosure test.
  const d = waccDisclosure(computeWacc({ ...waccBase, erpPct: 5.01, erpRow: { basis: "domicile", countryLabel: "Ireland", countryRiskPremiumPct: 0.55 } }));
  expect(d.erp.source).toBe("FMP market-risk-premium (Ireland totalEquityRiskPremium, including a 0.55% country risk premium)"); // HEAD: "(US totalEquityRiskPremium)"
  expect(d.summary).toContain("ERP 5.01% (FMP market-risk-premium (Ireland totalEquityRiskPremium");
});
it("control: a US issuer and the us-fallback keep the US label", () => {
  // :1327's own assertion stays as it is
  for (const erpRow of [{ basis: "domicile" as const, countryLabel: "United States", countryRiskPremiumPct: null },
                        { basis: "us-fallback" as const, countryLabel: null, countryRiskPremiumPct: null }]) {
    expect(waccDisclosure(computeWacc({ ...waccBase, erpPct: 4.46, erpRow })).erp.source).toBe("FMP market-risk-premium (US totalEquityRiskPremium)");
  }
});
it("carries the domicile row through runStageB", () => {
  // completeCurrencyBundle with profile.country "IE" and the three synthetic premium rows above
  expect(runStageB(irishBundle).returns.waccInputs!.erp.source).toMatch(/Ireland totalEquityRiskPremium, including a 0\.55% country risk premium/);
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/stageB.growth.returns.capital.test.ts -t "ERP row"` — expected FAIL: `expected 'FMP market-risk-premium (US totalEquityRiskPremium)' to be 'FMP market-risk-premium (Ireland …)'`.
- [ ] **Step 3: Implement** per Interfaces.
- [ ] **Step 4: Run it.** PASS; the full file still passes (`:1327` unchanged).
- [ ] **Step 5: Benefit check.** FIN-114's IE and CH probe assertions hold on the synthetic rows; the US control holds. Replay: all stored keyed reports are US-domiciled, so the label must not move on 43, 48, 49, 50.
- [ ] **Step 6: Docs.** `docs/METHODOLOGY.md:255`: the label names the domicile row and its country risk premium.
- [ ] **Step 7: Commit.** `git add src/pipeline/compute.ts src/pipeline/stageB/returns.ts tests/stageB.growth.returns.capital.test.ts docs/METHODOLOGY.md` then `git commit -m "Name the domicile row the ERP was taken from (FIN-114)"`.

### Task 10b: The ERP fallback is refreshed to Damodaran's October 2026 value (pre-flight R7)

New (pre-flight R7). It is its own commit, after Task 10, which names the row an ERP came from. The keyless monthly fetch is D2's, the free-data batch (below).

**Deadline.** Today's constant (`returns.ts:125-132` at B13: 4.18%, as of 2026-07-01, labelled "semiannual", with a 210-day fail-closed window) expires on 2027-01-27. From 2027-01-28 every keyless run reports "cost of equity and WACC not computed" (`returns.ts:465-469` at B13). The refreshed constant expires on 2027-04-29. If B5b has not merged by 2027-01-15, ship this task alone as a small PR (Part B setup, Step 7).

**Files:**
- Modify `src/pipeline/stageB/returns.ts:125-132` (at B13).
  - The fallback becomes `{ pct: 4.20, asOf: "2026-10-01", source: "Damodaran implied ERP (trailing 12-month, adjusted payout), October 1, 2026" }`.
  - The `ERP_FALLBACK_MAX_AGE_DAYS` comment becomes "the source publishes monthly (ERPbymonth.xlsx); this constant is refreshed by hand, and 210 days is the hand-refresh window, not the source's cadence".
  - The 210 days stay, fail-closed.
- Modify `tests/stageB.growth.returns.capital.test.ts:416-417` (4.18 → 4.20) and `:1346` if that is the fallback date, and `tests/dataBundle.keyless.test.ts:621-622` (lines at B13).
- Modify `docs/METHODOLOGY.md:302` (at B13), and every other hit of `grep -rn "4\.18" docs tests` that is this constant.
- The payload golden moves only if its fixture prints the "dated reference … vintage" text (`returns.ts:1066` at B13): Task 24b.

**Interfaces:** none new.

**Source.** Damodaran's home page, https://pages.stern.nyu.edu/~adamodar/New_Home_Page/home.htm (read 2026-10-29 by the pre-flight): "Implied ERP on October 1, 2026 = 4.20%". `docs/RESEARCH.md` §0 item 4 and §1.14 agree.

- [ ] **Step 1: Write the failing test:** re-pin each test above to 4.20 and the 2026-10-01 date. Give each a dated comment: "2026-10-29 (D-next, pre-flight R7): Damodaran implied ERP refreshed to 4.20% as of 2026-10-01".
- [ ] **Step 2: Run it.** `npx vitest run tests/stageB.growth.returns.capital.test.ts tests/dataBundle.keyless.test.ts` — expected FAIL on the re-pinned value and date: the constant still reads 4.18 and 2026-07-01.
- [ ] **Step 3: Implement:** the constant, its source and the comment, as Files.
- [ ] **Step 4: Run it.** PASS. `grep -rn "4\.18" docs tests src` finds no remaining copy of this constant. `tests/stageC.payload.passes.test.ts` moves only on the reference text (Task 24b).
- [ ] **Step 5: Benefit check.** Every keyless cost of equity rises by 0.02pp × beta; the pre-flight's analytic estimate is about −0.2% to −0.4% per keyless DCF, measured in Task 29b. Keyed runs move only in the reference text. A keyless run dated 2027-01-28 to 2027-04-29 still computes a WACC.
- [ ] **Step 6: Docs.** `docs/METHODOLOGY.md:302` (at B13): the fallback's value, date and source, and the hand-refresh cadence.
- [ ] **Step 7: Commit.** `git add src/pipeline/stageB/returns.ts tests/stageB.growth.returns.capital.test.ts tests/dataBundle.keyless.test.ts docs/METHODOLOGY.md` then `git commit -m "Refresh the ERP fallback to Damodaran's 4.20% of October 1, 2026 (pre-flight R7)"`.

**The fetch, for D2 (not built here).**
- Source: `ERPbymonth.xlsx`, with the home page's dated "Implied ERP on <date> = x%" line as a second parse.
- Failure mode: any fetch or parse failure, a value outside [3, 8]%, or a month older than 62 days → the static constant, plus an info gap naming the failure.
- Tests: recorded fixtures of both sources, with no live network. They assert the parse (4.20, 2026-10-01), the bounds, the stale-month fallback, and that the row lands in `run_input_snapshot`.
- Why it is not in B5:
  - it adds network and an XLSX parser;
  - the source has no explicit redistribution licence (RESEARCH.md §1.14: "download at run time with attribution and a dated snapshot");
  - replays stay deterministic only if the fetched row is snapshotted into the run inputs (an open-network refresh moved WACC in 39 of 45 tickers before).

### Task 11: A vendor tax ratio on a pre-tax loss gets the 0% shield (FIN-406)

**Files:**
- Modify `src/pipeline/compute.ts:2989-2993` (gap keyed to the source chosen), `:3029-3036` (admit the vendor ratio only off an established loss).
- Test: modify `tests/stageB.ttm.compute.test.ts` (beside the B-32 cases).

**Interfaces:** `export function vendorTaxRateAdmissible(source: "ratios-ttm" | "ratios", ttmPretax: number | null, annualPretax: number | null): boolean` (false only when the matching window's pre-tax income is established ≤ 0).

- [ ] **Step 1: Write the failing test** (synthetic keyed bundle, FMP-shaped rows with synthetic numbers):

```ts
it("gives a keyed loss-maker the B-32 0% shield whatever divided the numbers", () => {
  // ratiosTtm effectiveTaxRateTTM 0.21; each TTM quarter pre-tax −5B, tax −1.05B.
  const c = runStageB(lossBundle);
  expect(c.returns.wacc.taxRateUsed).toBe(0);                                // HEAD: 0.21
  expect(c.returns.wacc.taxRateBasis).toMatch(/0% tax shield: TTM pre-tax income is not positive/);
  expect(c.returns.gaps.some((g) => g.field === "returns.wacc.effectiveTaxRate.basis")).toBe(true);
});
it("control: a profitable keyed issuer keeps the vendor ratio", () => {
  expect(runStageB(profitBundle).returns.wacc.taxRateBasis).toBe("FMP ratios-ttm effectiveTaxRateTTM (observed effective rate)");
});
it("keeps the vendor ratio when the window's pre-tax income is not established", () => {
  // lossBundle with its TTM pre-tax and tax pair suppressed, so the window's pre-tax income is not established
  const c = runStageB(lossBundleWithoutTaxPair);
  expect(c.returns.wacc.taxRateBasis).toBe("FMP ratios-ttm effectiveTaxRateTTM (observed effective rate)");   // as HEAD
  expect(c.returns.wacc.taxRateUsed).toBe(0.21);
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/stageB.ttm.compute.test.ts -t "0% shield"` — expected FAIL: `expected 0.21 to be 0`.
- [ ] **Step 3: Implement** per Interfaces at `:3029`; the basis falls to `statementTax.basis` and the `:2991` gap condition reads "vendor ratio not used".
- [ ] **Step 4: Run it.** PASS; re-run the full file and `tests/stageB.growth.returns.capital.test.ts`.
- [ ] **Step 5: Benefit check.** FIN-406's probe assertion holds; keyed and keyless loss runs now give one tax rate. Replay: no stored keyed report has a TTM pre-tax loss (record unchanged).
- [ ] **Step 6: Docs.** `docs/METHODOLOGY.md:259`: the vendor ratio is used unless the same window shows a pre-tax loss, which gets the B-32 0% shield.
- [ ] **Step 7: Commit.** `git add src/pipeline/compute.ts tests/stageB.ttm.compute.test.ts docs/METHODOLOGY.md` then `git commit -m "Apply the 0% shield to a vendor tax ratio on a pre-tax loss (FIN-406)"`.

### Task 12: A fiscal-year-change stub is not a fiscal year (FIN-111)

**Files:**
- Modify `src/pipeline/stageB/growth.ts:197-206` (comment on the tolerance), `:438-528` (`computeGrowth` drops transition periods before the flow series), `:605-611` (`latestYoyPct` needs ≥ 0.75 year).
- Modify `src/pipeline/compute.ts:2514-2538` (`projNorm` rows pass the same filter; its gaps join `projectionPeriodGaps`), `:3334-3341` (`dcfIncomeHistory` drops the withheld rows: their revenue feeds `establishedSalesToCapital`, `valuation.ts:193-215`, as a flow over a year-end capital, and the fade's dated slope), and the annual income rows handed to `computeRoic` (`:3083`; a six-month NOPAT over a year-end invested capital is half a return, which the terminal every-year rule and the moat's ROIC floor would read as a fiscal year). One `withoutTransitionPeriods(normalizeQuarterRows(incomeAnnual).rows)` call in `compute.ts` feeds all three, and its single `growth.incomeStatement.transitionPeriod` gap names every use.
- Read only: `src/pipeline/stageB/valuation.ts` `establishedSalesToCapital`, B4a Task 4's export with its third argument, the lease object `{ fcx1Excluded, includeLeasesInEv, currentRowExcludesLease }` (B4a plan `:501`). The new test calls it with that argument, so it compiles against B4a's signature; Task 12 changes only the rows it receives.
- Leave `tests/stageB.growth.returns.capital.test.ts:1698-1710` unchanged: it tests the `cagrForWindow` primitive directly, which still compounds an irregular span correctly; `computeGrowth` (its only caller) now withholds the stub before the primitive runs, so the case keeps passing and no re-pin is needed. The new behaviour is pinned in the new file.
- Test: create `tests/stageB.transitionPeriod.test.ts`.

**Interfaces:**
- `export const TRANSITION_PERIOD_UNDER_DAYS = 357` in `growth.ts`. Its comment cites OD-3 and decisions spec 4.5 (O-2) and gives the Step 0 gate result. It is 329 only if the gate failed.
- `export function withoutTransitionPeriods<T extends { date: string; fieldProvenance?: Record<string, { periodStart?: string } | undefined> }>(rowsNewestFirst: readonly T[]): { rows: T[]; withheld: Array<{ date: string; days: number }> }` in `growth.ts`. A row is withheld when its length is under `TRANSITION_PERIOD_UNDER_DAYS`. The length is the filed revenue period, inclusive (`periodDays`, Task 1), else the gap to the next-older row. The oldest row with no filed start is kept. Cash-flow rows carry no revenue provenance, so they are always measured by the gap, as the reviewer's census pre-scan assumed.
- `GrowthIncomeRow` and `GrowthCashFlowRow` gain the optional `fieldProvenance` they need (compute already passes the statement rows, which carry it).
- Consumes B4a Task 4's exported `establishedSalesToCapital` and its third argument: `dcfIncomeHistory`, which feeds it, is built from `withoutTransitionPeriods(...).rows`, so a withheld stub never reaches the sales-to-capital years.

- [ ] **Step 0: Run the stub-line gate (decisions spec 4.5, O-2).** Run Task 29 Step D check 1a now, before writing the test. It is date arithmetic with Task 1's `periodDays` and needs no Task 12 code. If it passes (expected), the line is 357 days and Steps 1–6 stand as written. If it fails, set `TRANSITION_PERIOD_UNDER_DAYS = 329` and make three edits: the eleven-month case below asserts "kept" with a comment naming the recorded residual; the boundary rows become 328 days (withheld) and 329 days (kept); and Step 6's sentence reads "under 329 days (0.9 year)". Record the gate's output (`thresholds-gate.json`) in the commit message either way. This is the one decision 4.5 left to evidence. Nothing else in the plan changes with it, except the residual lines in Tasks 27b, 28b and 32b, which name the line taken. (Check 1a's definition is in Task 29 Step D; B5b runs it through Task 29b's harness.)
- [ ] **Step 1: Write the failing test** (synthetic 10%/yr business, from `FIN-111.probe.ts:27-52`):

```ts
it("withholds a six-month stub at the newest end and takes the latest YoY from the last full year", () => {
  const g = computeGrowth([row("2024-12-31", 73.2, 0.73), row("2024-06-30", 133.1, 1.33), row("2023-06-30", 121, 1.21),
    row("2022-06-30", 110, 1.1), row("2021-06-30", 100, 1.0)], [], { period: "annual" });
  expect(g.revenueAcceleration.latestYoyPct).toBeCloseTo(10.0, 1);      // HEAD: -69.48 (half a year against a year)
  expect(g.asOf).toBe("2024-06-30");
  expect(g.revenueLogLinear.growthPct).toBeCloseTo(10.0, 0);              // HEAD: -3.03
  expect(g.gaps.some((x) => x.field === "growth.incomeStatement.transitionPeriod" && /2024-12-31/.test(x.reason))).toBe(true);
});
it("does not grade a full year over a six-month base (stub mid-series)", () => {
  const g = computeGrowth([row("2024-12-31", 140, 1.4), row("2023-12-31", 64, 0.64), row("2023-06-30", 121, 1.21),
    row("2022-06-30", 110, 1.1), row("2021-06-30", 100, 1.0)], [], { period: "annual" });
  const best = windowCagr(g.revenueCagrs, 5).cagrPct ?? windowCagr(g.revenueCagrs, 3).cagrPct ?? windowCagr(g.revenueCagrs, 1).cagrPct;
  expect(best === null || Math.abs(best - 10) < 5).toBe(true);           // HEAD: 118.75
});
it("withholds a transition period whose year end also breaks the weekday rule", () => {
  // A last-Sunday-of-June filer (2021-06-27, 2022-06-26, 2023-06-25, 2024-06-30) that moves to the Sunday
  // nearest December 31: a 26-week transition period ending 2024-12-29. Synthetic revenues.
  const rowsAcrossFiscalYearChange = ["2024-12-29", "2024-06-30", "2023-06-25", "2022-06-26", "2021-06-27"].map((date) => ({ date }));
  expect(withoutTransitionPeriods(rowsAcrossFiscalYearChange).withheld.map((w) => w.date)).toEqual(["2024-12-29"]);
  expect(fiscalYearRule(rowsAcrossFiscalYearChange.map((r) => r.date))).toBeNull(); // Task 2's rule does not snap across it
});
it("control: 52/53-week years, a first listed year and calendar years are kept", () => {
  const NVDA_ANNUAL_ENDS_364_371 = ["2026-01-25", "2025-01-26", "2024-01-28", "2023-01-29", "2022-01-30", "2021-01-31", "2020-01-26"].map((date) => ({ date }));
  const CALENDAR_YEARS = ["2025-12-31", "2024-12-31", "2023-12-31", "2022-12-31"].map((date) => ({ date }));
  expect(withoutTransitionPeriods(NVDA_ANNUAL_ENDS_364_371).withheld).toEqual([]);
  expect(withoutTransitionPeriods(CALENDAR_YEARS).withheld).toEqual([]);
});
it("withholds an eleven-month transition period and keeps every fiscal-year length (O-2: under 357 days)", () => {
  expect(TRANSITION_PERIOD_UNDER_DAYS).toBe(357);                         // decisions spec 4.5, after the Step 0 gate
  const filed = (date: string, periodStart: string) => ({ date, fieldProvenance: { revenue: { periodStart } } });
  // A calendar-year filer that moves to a November year end: 2025-01-01..2025-11-30 is 334 days (eleven months).
  expect(withoutTransitionPeriods([filed("2025-11-30", "2025-01-01"), filed("2024-12-31", "2024-01-01")]).withheld)
    .toEqual([{ date: "2025-11-30", days: 334 }]);                         // a 329-day line would keep it as a year
  // Boundaries, filed: 356 days withheld, 357 kept (2025-01-01..2025-12-22 and ..2025-12-23).
  expect(withoutTransitionPeriods([filed("2025-12-22", "2025-01-01")]).withheld).toEqual([{ date: "2025-12-22", days: 356 }]);
  expect(withoutTransitionPeriods([filed("2025-12-23", "2025-01-01")]).withheld).toEqual([]);
  // Boundaries by the gap (no filed start): 356 days after 2024-12-31 withheld, 357 kept.
  expect(withoutTransitionPeriods([{ date: "2025-12-22" }, { date: "2024-12-31" }]).withheld.map((w) => w.days)).toEqual([356]);
  expect(withoutTransitionPeriods([{ date: "2025-12-23" }, { date: "2024-12-31" }]).withheld).toEqual([]);
});
it("keeps a stub out of the ROIC series, the sales-to-capital years and the projection history (compute wiring)", () => {
  // runStageB on completeCurrencyBundle({}) with its annual income, balance and cash-flow rows replaced by a
  // synthetic June-year-end history plus a six-month stub ending 2025-12-31 (balance rows on the same dates).
  expect(computed.returns.roic.series.some((y) => y.date === "2025-12-31")).toBe(false);          // HEAD: a half-year ROIC
  expect(revenueSeries.historical.some((p) => p.period === "FY2025")).toBe(false);                 // projection history
  expect(computed.growth.gaps.some((g) => g.field === "growth.incomeStatement.transitionPeriod")).toBe(true);
});
it("feeds the sales-to-capital history without the stub year, under B4a's lease argument", () => {
  // FIN-111's 10%/yr shape as dcfIncomeHistory rows (date, revenue), newest first, with the six-month stub ending 2024-12-31.
  // capitalOn(dates): one annual capital row per date, all with the same positive invested capital on this lease basis, built as
  // B4a Task 4's "the A-2 history measures each year on the same lease basis" case builds its rows, and sized so every year's
  // ratio sits inside A-2's ratio rules. Each year's ratio is then its revenue over the same capital, and the stub's half-year
  // revenue lowers the median.
  const all = [inc("2024-12-31", 73.2), inc("2024-06-30", 133.1), inc("2023-06-30", 121), inc("2022-06-30", 110), inc("2021-06-30", 100)];
  const capital = capitalOn(all.map((r) => r.date));
  const lease = { fcx1Excluded: false, includeLeasesInEv: false, currentRowExcludesLease: true };   // B4a Task 4's third argument
  const kept = withoutTransitionPeriods(all).rows;                                                   // what compute builds dcfIncomeHistory from
  expect(kept.map((r) => r.date)).toEqual(all.slice(1).map((r) => r.date));
  const ratio = establishedSalesToCapital(kept, capital, lease).ratio;
  expect(ratio).not.toBeNull();
  expect(ratio).toBe(establishedSalesToCapital(all.slice(1), capital, lease).ratio);                 // the history with no stub row
  expect(ratio).not.toBe(establishedSalesToCapital(all, capital, lease).ratio);                      // the stub kept would move it
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/stageB.transitionPeriod.test.ts` — expected FAIL: `expected -69.48… to be close to 10`; the wiring case `expected true to be false` on the ROIC series; and the O-2 case `expected undefined to be 357` (neither export exists at HEAD, so the direct `withoutTransitionPeriods` cases fail with "is not a function"). The sales-to-capital case fails the same way, on `withoutTransitionPeriods`. `establishedSalesToCapital` is B4a's export: an import error or a type error on its third argument means B4a has not merged, so stop.
- [ ] **Step 3: Implement.** `computeGrowth` applies `withoutTransitionPeriods` to the normalised income and cash-flow rows before every flow series and `asOf`; display margins keep all rows; each withheld row adds a warn gap "annual period … covers N days, a transition period after a fiscal-year change, not a fiscal year: left out of growth, the log-linear fit, the projection history, the DCF history and the ROIC series". `latestYoyPct` additionally needs `actualYears ≥ 0.75`. In `compute.ts` one filtered row set feeds `projNorm`, `dcfIncomeHistory` and `computeRoic`.
- [ ] **Step 4: Run it.** PASS. Re-run `npx vitest run tests/stageB.growth.returns.capital.test.ts tests/stageB.growthAnchorSpan.test.ts tests/stageB.growthRestatement.test.ts tests/stageB.projections.test.ts tests/stageB.valuation.test.ts`: all unchanged, including the F109 `cagrForWindow` case at `:1698-1710` (a primitive test; see Files).
- [ ] **Step 5: Benefit check.** FIN-111's case A and B assertions hold; the 52/53-week and calendar controls hold. Replay: no stored report has a stub row (record growth, ROIC series and sales-to-capital unchanged on 43–50); the AMZN-rewritten case is shown through the test only (it needs FMP rows). **Scope extension E2, the transition filter on the DCF history, sales-to-capital and the ROIC series (confirmed by the main session only with its replay evidence, decisions spec 4.3):** the extension stays only if Task 29's evidence row E2 holds: on the five snapshots and the 45 census snapshots, `returns.roic.series` and `valuation.assumptions.salesToCapital` change only for an issuer with a withheld transition period, by exactly removing that period. The planner's read-only scan (2026-10-28) found no annual period under 364 days in the census, so E2 is expected to show no move anywhere (the extension fires on none; its firing case is the Step 1 wiring test). The post-integration review's re-scan confirms this at the 357-day line, for the census and the five keyed snapshots alike. Any move on an issuer with no withheld row means the extension is not confirmed: stop before Task 27b and report the failing rows to the main session; do not drop or re-tune it on your own.
- [ ] **Step 6: Docs.** In `docs/METHODOLOGY.md`, the growth CAGR paragraph near `:389` ("Growth anchor") gets this rule. A period under 357 days (51 weeks) is a transition period after a fiscal-year change, not a fiscal year: one week short of the shortest 52-week year, and a transition report is always under twelve months (17 CFR 240.13a-10). It is withheld from every annual flow use (growth figures, projection and DCF history, the issuer's sales-to-capital and the ROIC series) and named in the gaps; display margins keep it. A transition period of 51 weeks or longer still reads as a year, and the sentence says so. On a failed Step 0 gate the sentence says "under 329 days (0.9 year)" instead, with the residual it leaves. The ROIC paragraph and the sales-to-capital paragraph get the same one-line exclusion. At HEAD, `docs/METHODOLOGY.md:1157-1159` says "A missing year or a shorter transition stub uses the existing single-period denominator". That sentence keeps only the missing year, and adds that a transition period is withheld from the ROIC series before any denominator is chosen. Also grep `docs/METHODOLOGY.md` and `README.md` for "0.9 year", "329" and "transition period", so no older line contradicts the new one.
- [ ] **Step 7: Commit.** `git add src/pipeline/stageB/growth.ts src/pipeline/compute.ts tests/stageB.transitionPeriod.test.ts docs/METHODOLOGY.md` then `git commit -m "Withhold fiscal-year-change stubs from growth and projection history (FIN-111)"`.

### Task 13: "Latest revenue YoY" only for the newest year (FIN-405)

**Files:**
- Modify `src/pipeline/stageB/growth.ts:604-635` (`RevenueAcceleration.latestYoyEndDate`, withhold when the endpoint moved).
- Modify `src/pipeline/stageC/payload.ts:663`, `:701-702`; `src/pipeline/stageC/dataOnlyReport.ts:372-373` (date the rows at `latestYoyEndDate`; nothing when null).
- Test: create `tests/stageB.latestYoy.test.ts`.

**Interfaces:** `RevenueAcceleration.latestYoyEndDate: string | null`.

- [ ] **Step 1: Write the failing test** (synthetic five-year series; the newest year's revenue null, as the enrichment's refusal leaves it):

```ts
it("withholds the latest revenue YoY when the newest year's revenue is refused", () => {
  const g = computeGrowth(fiveYears({ "2025-12-31": null }), [], { period: "annual" });
  expect(g.revenueAcceleration.latestYoyPct).toBeNull();                     // HEAD: FY2024's 10.99 dated 2025-12-31
  expect(g.revenueAcceleration.note).toMatch(/latest YoY withheld: the newest fiscal year \(2025-12-31\) has no revenue/);
  expect(g.revenueCagrs.find((c) => c.windowYears === 1)!.endDate).toBe("2024-12-31"); // control: the dated 1y row stays
});
it("registers no 'latest revenue YoY' payload record for it", () => {
  // refusedBundle: a synthetic bundle whose newest annual revenue is refused, as above
  const payload = assembleContextPayload(refusedBundle, runStageB(refusedBundle), { checks: [], flags: [], gaps: [] });
  expect(payload.computed.flatMap((s) => s.figures).some((f) => /latest revenue YoY/.test(f.label))).toBe(false);
});
it("control: a complete series keeps its latest YoY at the newest date", () => {
  const g = computeGrowth(fiveYears({}), [], { period: "annual" });
  expect(g.revenueAcceleration.latestYoyEndDate).toBe("2025-12-31");
  expect(g.revenueAcceleration.latestYoyPct).not.toBeNull();
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/stageB.latestYoy.test.ts` — expected FAIL: `expected 10.99… to be null`.
- [ ] **Step 3: Implement.** `latestYoyPct` is set only when `yoyPoint.endDate === asOf` (the newest row after Task 12's filter); `latestYoyEndDate` carries it; the acceleration note says which year was refused; the payload and data-only rows read their date from `latestYoyEndDate`.
- [ ] **Step 4: Run it.** PASS; re-run `npx vitest run tests/stageB.growth.returns.capital.test.ts tests/stageC.payload.passes.test.ts` (golden unaffected: DEMO's series is complete).
- [ ] **Step 5: Benefit check.** FIN-405's probe assertion (registry date) is now moot: no record is registered; the 1y row keeps the prior year at its own date. Replay: all stored reports have complete newest years (unchanged).
- [ ] **Step 6: Docs.** `docs/METHODOLOGY.md:389` area: the latest YoY is the newest fiscal year's or withheld.
- [ ] **Step 7: Commit.** `git add src/pipeline/stageB/growth.ts src/pipeline/stageC/payload.ts src/pipeline/stageC/dataOnlyReport.ts tests/stageB.latestYoy.test.ts docs/METHODOLOGY.md` then `git commit -m "Withhold the latest revenue YoY when the newest year is refused (FIN-405)"`.

### Task 14: Projection history labelled by the issuer's fiscal year, never twice (FIN-127)

Read first (AGENTS.md): `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`, `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md`.

**Files:**
- Modify `src/pipeline/stageB/projections.ts:196-200` (`fyLabel` → `historyLabels`), `:526`, `:538-540`, `:562`, `:679-680`, `:740`; `ProjectionIncomeRow` and the FCF history row types (`fiscalYear?: string | null`).
- Modify `src/pipeline/compute.ts:2526-2538` (`fiscalYear: str(r.fiscalYear)`) and the FCF history mapping beside it.
- Modify `src/report/surfaceManifest.ts:710-719` (comment: history may be `FY ending <date>`).
- Modify `src/components/charts/ProjectionFanChart.tsx:96-103` (`projectionTickLabel` prints `FYE Mon ’yy` for `FY ending <date>`).
- Test: create `tests/stageB.projectionHistoryLabels.test.ts`; modify `tests/charts.projectionAxes.test.ts` (tick label case).

**Interfaces:** `function historyLabels(rows: readonly { date: string; fiscalYear?: string | null }[], forwardBasis: "rolling-12-month" | "fiscal-year" | null): string[]` — `FY<fiscalYear>` when it is four digits, else `FY<end year>`; every label shared by two rows becomes `FY ending <date>` for each of them; and when `forwardBasis === "fiscal-year"` and any row's four-digit `fiscalYear` differs from its end year, every row becomes `FY ending <date>` (OD-5: the forward windows are labelled by end year, so mixing conventions would skip a year on the axis). `forwardBasis` is `assumptions.forecastPeriod?.basis` (the basis `fwdPeriod` already uses).

- [ ] **Step 1: Write the failing test** (synthetic values; the dates are Illumina-style and Home Depot-style SEC year ends; the valuation comes from `runStageB(completeCurrencyBundle({}))`):

```ts
it("keeps four labels and four plotted actuals when a 52/53-week year ends in early January", () => {
  const dates = ["2021-01-03", "2022-01-02", "2023-01-01", "2023-12-31", "2024-12-29", "2025-12-28"];
  const revenue = computeProjections({ ...base, incomeHistory: rows(dates), fcfHistory: [] }).series.find((s) => s.metric === "revenue")!;
  expect(revenue.historical.map((h) => h.period)).toEqual(["FY ending 2023-01-01", "FY ending 2023-12-31", "FY2024", "FY2025"]); // HEAD: FY2023, FY2023, FY2024, FY2025
  const plotted = projectionPeriodRows(revenue).map((r) => projectionCellPoint(r, "historical", revenue.unit)).filter(Boolean);
  expect(plotted.length).toBe(4);                                            // HEAD: 2
});
it("labels a start-year-named retail year by the issuer's fiscal year (TTM-basis forward windows)", () => {
  const dates = ["2021-01-31", "2022-01-30", "2023-01-29", "2024-01-28", "2025-02-02", "2026-02-01"];
  const revenue = computeProjections({ ...base, incomeHistory: rows(dates, ["2020", "2021", "2022", "2023", "2024", "2025"]), fcfHistory: [] }).series.find((s) => s.metric === "revenue")!;
  expect(revenue.historical.at(-1)!.period).toBe("FY2025");                  // HEAD: FY2026
});
it("dates the history when the forward windows are fiscal-year labelled by end year", () => {
  // Same rows, with `base`'s valuation assumptions given forecastPeriod { basis: "fiscal-year", anchorEndDate: "2026-02-01" }:
  // forward periods read "FY2027 ending 2027-02-01", so history labelled FY2025 would skip FY2026 on the axis.
  const revenue = computeProjections({ ...baseFiscalYearBasis, incomeHistory: rows(dates, ["2020", "2021", "2022", "2023", "2024", "2025"]), fcfHistory: [] }).series.find((s) => s.metric === "revenue")!;
  expect(revenue.historical.map((h) => h.period)).toEqual(["FY ending 2023-01-29", "FY ending 2024-01-28", "FY ending 2025-02-02", "FY ending 2026-02-01"]);
  expect(revenue.base[0]!.period).toMatch(/^FY2027 ending 2027-02-01$/);    // forward labels unchanged
});
it("control: calendar-year issuers keep FY<yyyy> labels", () => {
  const calendar = ["2022-12-31", "2023-12-31", "2024-12-31", "2025-12-31"];
  const revenue = computeProjections({ ...base, incomeHistory: rows(calendar, ["2022", "2023", "2024", "2025"]), fcfHistory: [] }).series.find((s) => s.metric === "revenue")!;
  expect(revenue.historical.map((h) => h.period)).toEqual(["FY2022", "FY2023", "FY2024", "FY2025"]);
});
```

In `tests/charts.projectionAxes.test.ts`: `expect(projectionTickLabel("FY ending 2023-01-01")).toBe("FYE Jan ’23")` and the existing `FY2025` / `12M ending …` cases unchanged.

- [ ] **Step 2: Run it.** `npx vitest run tests/stageB.projectionHistoryLabels.test.ts` — expected FAIL: labels `["FY2023","FY2023","FY2024","FY2025"]`, `expected 2 to be 4`, `expected 'FY2026' to be 'FY2025'`.
- [ ] **Step 3: Implement** `historyLabels` once per series and use it at the five history sites; `compute.ts` passes each statement row's `fiscalYear` (and the FCF row's, when its cash-flow row carries one). No other label (forecast windows, statement tables) changes.
- [ ] **Step 4: Run it.** PASS. Re-run `npx vitest run tests/charts.projectionAxes.test.ts tests/projection.operatingIncome.test.ts tests/stageB.projections.test.ts tests/report.projectionAvailability.test.ts tests/projection.ownershipScope.test.ts`: unchanged for calendar-year fixtures; a fixture whose rows carry a start-year `fiscalYear` re-pins with D-next.
- [ ] **Step 5: Benefit check.** FIN-127's two probe assertions hold; the calendar control holds. Projection provenance ids that embed the period change only for affected issuers. Replay: NVDA #50's history labels (FY2023…FY2026 by its own fiscal year, which equals the end year for NVDA) must not move; record the label list for 43–50. **Scope extension E4, the forward-label rule (`historyLabels`' `forwardBasis === "fiscal-year"` branch; confirmed by the main session only with its replay evidence, decisions spec 4.3):** the extension stays only if Task 29's evidence row E4 holds: the rule fires on no snapshot whose forward basis is rolling-12-month or whose history fiscal years equal their end years, and on the in-memory annual-base copy of the census HD snapshot (Home Depot names fiscal 2025 the year ending 2026-02-01; its census rows carry `fiscalYear` "2025" for that end) it dates every history label (`FY ending 2026-02-01`, …) so the axis never reads FY2025 then FY2027. If E4 fails, the extension is not confirmed: stop before Task 27b and report the failing rows to the main session; do not drop or re-tune it on your own.
- [ ] **Step 6: Docs.** `docs/METHODOLOGY.md:2206-2207`: history is labelled by the issuer's fiscal year, dated when two would collide or when the forward fiscal-year windows (labelled by end year) would otherwise mix conventions; D-113's period-end sort is unchanged. Update the `projectionPeriodSortKey` doc comment (`surfaceManifest.ts:710-719`): a bare `FY<yyyy>` label is now the issuer's fiscal year, which for a start-year-named issuer sorts at 12-31 of the start year; history order is still monotonic because only one convention appears per series.
- [ ] **Step 7: Commit.** `git add src/pipeline/stageB/projections.ts src/pipeline/compute.ts src/report/surfaceManifest.ts src/components/charts/ProjectionFanChart.tsx tests/stageB.projectionHistoryLabels.test.ts tests/charts.projectionAxes.test.ts docs/METHODOLOGY.md` then `git commit -m "Label projection history by the issuer's fiscal year and never twice (FIN-127)"`.

### Task 15: The reverse-DCF range end comes from an in-domain DCF (FIN-104)

**Files:**
- Modify `src/pipeline/stageB/valuation.ts:3172-3185` (`perShareAt` also reports `outsideDomain` through `gridCellOutsideDomain`), `:3197-3232` (scan restricted to the in-domain prefix), `:2867-2874` (reuse).
- Read only: `src/pipeline/stageB/grading.ts:835-838`, `src/pipeline/stageB/scoringEvidence.ts:256-260` (they read `boundPct`/`perShareAtBound`; values may move, logic does not).
- Test: modify `tests/stageB.valuation.test.ts` (reverse-DCF block beside its `growthOutsideRange` cases).

**Interfaces:** `ReverseDcfResult.growthOutsideRange.domainEdgePct?: number | null` — the first scan growth whose rerun is outside the domain, when the scan was cut there. The scan's usable points are the contiguous run of in-domain points (`gridCellOutsideDomain` false) that contains the base growth `baseG1` (the base DCF is in domain under B-29; the domain can be left at either end: high growth with low sales-to-capital drives `pvExplicit` below zero, low growth with heavy debt drives equity to zero or below). Both `findBrackets` and the outside-range inference read only that run, so neither a root nor a range end is published from an out-of-domain DCF (the finding's "also consider applying the same test to a bracketed root": adopted, same class).

- [ ] **Step 1: Write the failing test** (synthetic: take `buildDcfAssumptions` output from the existing file's fixture, set `salesToCapital.value` to 0.6 so that high growth reinvests more than NOPAT, and a price above every in-domain value):

```ts
it("infers the range end only from scan points inside the DCF's domain", () => {
  // Setup guard (passes at HEAD): on lowS2c the 60% scan point's rerun has pvExplicit < 0 and the base point's ≥ 0.
  expect(rerunAt(lowS2c, 60).pvExplicit).toBeLessThan(0);
  expect(rerunAt(lowS2c, lowS2c.growthPath.value[0]).pvExplicit).toBeGreaterThanOrEqual(0);
  const r = reverseDcf(price, lowS2c, opts);
  const at = rerunAt(lowS2c, r.growthOutsideRange!.boundPct);              // runDcf on the shifted path
  expect(at.pvExplicit).toBeGreaterThanOrEqual(0);                         // HEAD: negative at the 60% bound
  expect(r.growthOutsideRange!.domainEdgePct).not.toBeNull();
  expect(r.gaps.find((g) => g.field === "valuation.reverseDcf.growthBracket")!.reason).toMatch(/leaves the DCF's domain beyond/);
});
it("publishes no root from a bracket beyond the domain edge", () => {
  // Same lowS2c; a price between the last in-domain value and the 60% value, so HEAD brackets a root out of domain.
  const r = reverseDcf(priceBeyondEdge, lowS2c, opts);
  expect(r.impliedRevenueGrowthPct === null || rerunAt(lowS2c, r.impliedRevenueGrowthPct).pvExplicit >= 0).toBe(true); // HEAD: root at an out-of-domain growth
  expect(r.growthOutsideRange?.domainEdgePct ?? null).not.toBeNull();
});
it("control: a scan wholly inside the domain keeps its 60% bound and wording", () => {
  expect(reverseDcf(price, highS2c, opts).growthOutsideRange).toMatchObject({ boundPct: 60, domainEdgePct: null });
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/stageB.valuation.test.ts -t "domain"` — expected FAIL: `expected -… to be greater than or equal to 0`.
- [ ] **Step 3: Implement.** Evaluate `dcfCore` once per scan point (`perShareAt` returns `{ perShare, outsideDomain }` via `gridCellOutsideDomain`); restrict `xs`/`fs` to the contiguous in-domain run containing `baseG1` before `findBrackets` and before the outside-range inference; the basis adds "the scan leaves the DCF's domain beyond X% (explicit-period value below zero, or equity at or below zero), so the range end is the last in-domain point". The margin solve (`solveMargin`) applies the same restriction around the base terminal margin.
- [ ] **Step 4: Run it.** PASS; re-run `npx vitest run tests/stageB.valuation.test.ts tests/stageB.grading.test.ts tests/stageB.dcfDomain.audit20261022.test.ts tests/report.thesisTriggers.test.ts`.
- [ ] **Step 5: Benefit check.** FIN-104's probe assertion holds on the synthetic shape. Replay on AMZN #43 (HEAD replay, not the stored report: stored #43, spec 1.33.0, inferred no outside range): `boundPct` 60 → 35, `perShareAtBound` 165.41 → 114.73, the gap text names the domain edge; the reverse signal's grade stays at its band floor (28pp and 53pp both score 15) — verify `scores` unchanged. Record, for each of 43–50, whether the reverse method or root moved because a bracket lay outside the domain; any such move is traced to this task. **Scope extension E3, the in-domain restriction on the bracketed root and the margin solve (beyond the finding's range-end sketch; confirmed by the main session only with its replay evidence, decisions spec 4.3):** the extension stays only if Task 29's evidence row E3 holds: on the five snapshots and the 45 census snapshots, every change to `reverseDcf.method`, `impliedRevenueGrowthPct`, `impliedTerminalMarginPct` or `growthOutsideRange` comes with a non-null `growthOutsideRange.domainEdgePct` (or a margin-solve note naming the domain edge) on that snapshot, and no snapshot whose scan stays in domain moves. If E3 shows an unexplained move, the extension is not confirmed: stop before Task 27b and report the failing rows to the main session (Task 18 builds on this restriction, so it is never reverted piecemeal); do not drop or re-tune it on your own.
- [ ] **Step 6: Docs.** `docs/METHODOLOGY.md`, the reverse-DCF "beyond the range" paragraph (D-99 finding 10 text): the bound is the last in-domain scan point.
- [ ] **Step 7: Commit.** `git add src/pipeline/stageB/valuation.ts tests/stageB.valuation.test.ts docs/METHODOLOGY.md` then `git commit -m "Take the reverse-DCF range end from in-domain scan points only (FIN-104)"`.

### Task 16: The degraded-inputs note names only inputs the value reads (FIN-118)

**Files:**
- Modify `src/pipeline/stageB/fairValue.ts:65-111` (`DegradedInputs.betaFromRegression`, member filter).
- Modify `src/pipeline/compute.ts:2636-2649` (pass `betaFromRegression: returns.wacc.betaSource === "keyless profile regression on monthly returns"`).
- Modify `tests/fairValue.degradedInputs.test.ts:87-106`.

**Interfaces:** `DegradedInputs.betaFromRegression?: boolean`; `NOT_VALUE_INPUTS` gains `keyless.marketCapHistory` and `keyless.enterpriseValues`; `keyless.spy` and `keyless.eodPrices` are named only when `betaFromRegression` is true.

- [ ] **Step 1: Write the failing test** in `tests/fairValue.degradedInputs.test.ts`:

```ts
it("names no degradation for a SPY substitution when the WACC beta is the vendor's", () => {
  expect(degradedInputsReason({ riskFree: DGS10, bundleGaps: [served("spy", "yahoo")], valuationGaps: [], betaFromRegression: false })).toBeNull(); // HEAD: names SPY
});
it("never names the market-cap history or enterprise values", () => {
  expect(degradedInputsReason({ riskFree: DGS10, bundleGaps: [served("marketCapHistory", "computed"), served("enterpriseValues", "computed")], valuationGaps: [] })).toBeNull();
});
it("names SPY and daily prices when the beta is the keyless regression on them", () => {
  expect(degradedInputsReason({ riskFree: DGS10, bundleGaps: [served("spy", "yahoo")], valuationGaps: [], betaFromRegression: true })!.reason).toMatch(/SPY benchmark prices are from Yahoo/);
});
it("control: a substituted statement is still named", () => {
  expect(degradedInputsReason({ riskFree: DGS10, bundleGaps: [served("incomeAnnual", "edgar")], valuationGaps: [] })!.reason).toMatch(/annual income statement/);
});
```

The `:87-106` case that pinned "the enterprise values are computed from filed facts and prices" is re-pinned to exclude it (comment: D-next, OD-6).

- [ ] **Step 2: Run it.** `npx vitest run tests/fairValue.degradedInputs.test.ts` — expected FAIL: `expected { field: 'fairValue.degradedInputs', … } to be null`.
- [ ] **Step 3: Implement** per Interfaces; `FAIR_VALUE_METHOD_VERSION` moves in Task 23b.
- [ ] **Step 4: Run it.** PASS; re-run `npx vitest run tests/report.runDisclosure.test.ts` (the F-1 "Provider fallback" line must not change).
- [ ] **Step 5: Benefit check.** FIN-118's two probe assertions hold. Replay: NVDA #50 with no substitution has no reason (unchanged); AMZN #43's HEAD-replay reason ("Degraded inputs: the SPY benchmark prices are from Yahoo and the market-cap history is computed from filed facts and prices …", FIN-118's evidence) disappears if, as FIN-118's evidence reads, those are the only members it names (record the before/after reason text; a statement member that remains named is correct and stays), and its fair value stays 83.4. The stored #43 (spec 1.33.0) predates the D-111 reason and carries none.
- [ ] **Step 6: Docs.** `docs/METHODOLOGY.md`, the degraded-inputs paragraph (`grep -n "Degraded inputs" docs/METHODOLOGY.md`): the excluded members and the beta condition.
- [ ] **Step 7: Commit.** `git add src/pipeline/stageB/fairValue.ts src/pipeline/compute.ts tests/fairValue.degradedInputs.test.ts docs/METHODOLOGY.md` then `git commit -m "Name only inputs the fair value reads in the degraded-inputs note (FIN-118)"`.

### Task 17b: Display-time notes and corrections for B5b's rules (delta on Task 17; needs reinterpretation: FIN-102, FIN-116; display-only: FIN-113, FIN-118, FIN-104; FIN-114 by evidence needs none)

New (pre-flight split; P3). B5b's display rows, under their own cutoff. It runs after Task 16, because the `degradedInputs` row re-derives the reason with Task 16's `degradedInputsReason`. It runs before Tasks 18-21, whose rows use its cutoff.

**Files:** modify `src/report/legacyValuationNotes.ts` (B5a's module, already in both risk lists and composed at the five sites; no new wiring) and `tests/report.legacyValuationNotes.test.ts`.

**Interfaces:**
- Produces `export const DCF_INPUTS_CONVENTION_SPEC = "1.52.0"` (expected: the REPORT_SPEC_VERSION Task 23b introduces, next after B5a's merge; renumbered at merge, then FROZEN; above `ANNUALIZATION_CONVENTION_SPEC`).
  - Every B5b row compares with it: these five, and Tasks 18-21's four.
  - B5a's rows keep `ANNUALIZATION_CONVENTION_SPEC`, and there is no module-wide early return.
  - "S" in the notes below is this constant.
- The rows read stored bytes only (Task 17's rules paragraph applies):

| key | finding | detector (all must hold) | note text (shape) | stored reports it fires on |
|---|---|---|---|---|
| `terminalYearSkipped` | FIN-102 | "terminal ROIC" basis says `in each of the last N fiscal years (A to B`, and the fiscal years spanned, `round(daysBetween(A, B) / 365.25) + 1`, exceed N (a day count, so 52/53-week year ends that straddle a calendar year are not miscounted) | "The terminal ROIC rule read N of the fiscal years from A to B; the year without a return was left out (see the returns.roic gaps). Current rules count an operating-loss year as below WACC (D-next) and tax a pre-tax-loss year with positive operating income at the marginal-rate floor (D-99), so this stored terminal ROIC may be higher than current rules give." | #43 (4 of the 5 years 2021-12-31 to 2025-12-31; FY2022 had a pre-tax loss and no ROIC at spec 1.33.0) |
| `newBorrower` | FIN-116 | the WACC basis prints `E 100% / D 0%` and the stored `computed.capital.current.debtBridge.totalDebtIncludingLeases` less `…operatingLeases` is above zero | "The WACC was all-equity although the latest balance carried debt; from S that WACC is withheld until its cost of debt is established." | none (every stored WACC carries a debt weight); tested on a synthetic stored report |
| `reverseRangeEnd` | FIN-104 | an `appendix.missingData` entry `valuation.reverseDcf.growthBracket` says `the price implies year-one growth (above|below) P%` | "The range end may rest on scan points outside the DCF's domain; from S it is the last in-domain point." | none (stored #43 at spec 1.33.0 reads "no outside-range growth is inferred because value may be non-monotone"); tested on a synthetic stored report |
| `currentCapitalStart` (display-only correction) | FIN-113 | stored key-number periods read `ttm: A to B`; the oldest-quarter start F is established from stored contexts, in this order: a `fiscal-year` `periodContext` ending on B (the TTM is that fiscal year), else four chained `fiscal-quarter` contexts ending on B (each starting the day after the previous one ends); F ≠ A. Otherwise no correction. | the view's `balanceSheet.coverage.numbers[].period`, `scores.aspects.balanceSheet.drivers[].period`, `scores.aspects.balanceSheet.signals[].period` and `.startDate` read F; the code-written commentary claim "Capital grading basis: ttm: A to B" keeps its stored text, because `indexVerificationMarks` (`src/report/verificationMarks.ts:58-70`) marks a claim only while its text equals the verification-log entry, and rewriting it would drop its stored status; the note says "Presentation correction: the current-capital window starts on F, the filed start of its oldest quarter, not A (the 'Capital grading basis' line keeps its stored wording). No figure changed." | #46 (2025-09-04 → 2025-08-29, from the FY2026 context), #48 (2025-07-27 → 2025-07-28, from four quarter contexts); not #47, #49, #50, #52 (their contexts do not establish the oldest quarter's start), not #43 (A is already the filed start) |
| `degradedInputs` (display-only correction) | FIN-118 | `fairValue.reasons` has a `Degraded inputs:` entry | the view re-derives it with Task 16's `degradedInputsReason` from the stored `appendix.missingData` keyless gaps (`keylessSubstitutions` reads `field`, `expected`, `severity` and the "served by" reason, all stored) and `betaFromRegression` read from the WACC basis (`keyless profile regression`), keeping the stored risk-free and WACC-history clauses; a reason that becomes empty is removed; note "Presentation correction: members the fair value does not read are no longer named." | none changes: the only stored degraded-inputs reason (#51 DEMO) names the risk-free rate and the WACC history, no keyless member; tested on a synthetic stored report |

FIN-114 gets no rule: a stored report carries no domicile field, so no detector is possible, and none is needed. Every stored report that prints the label (`grep -o "ERP [0-9.]*% ([^)]*)" tmp/audit-2026-10-27/data/reports/*.json`: #42–#52) is for a US issuer (META, AMZN, MU, NVDA, and the DEMO fixture at 5%). SCHW #39–#41 name only the endpoint. So the hard-coded "US totalEquityRiskPremium" label was true for every stored report. The disposition note says so.

- The corrections write only code-written, non-claim fields: key-number and score `period`/`startDate`, `fairValue.reasons` and `appendix.missingData`. Task 21 adds `valuation.scenarios[].assumptions`.

- [ ] **Step 1: Write the failing tests** in Task 17's file, built the same way from `fixtures/report/DEMO-sample.json`:

```ts
it("corrects a stored current-capital start to the filed start of its oldest quarter, and keeps the claim's mark", () => {
  // key numbers and score periods "ttm: 2025-09-04 to 2026-09-03"; a fiscal-year periodContext 2025-08-29..2026-09-03;
  // the commentary claim "Capital grading basis: ttm: 2025-09-04 to 2026-09-03. …" with a validated verificationLog entry.
  const view = withLegacyValuationNotes(stored);
  expect(view.balanceSheet.coverage.numbers.every((n) => !n.period?.includes("2025-09-04"))).toBe(true);
  expect(view.scores.aspects.balanceSheet.signals[0]!.startDate).toBe("2025-08-29");
  indexVerificationMarks(view);
  expect(claimStatusMark(view.balanceSheet.coverage.commentary.find((c) => c.text.startsWith("Capital grading basis"))!)).toBe("validated"); // text untouched
});
it("does not correct the start when the stored contexts do not establish it", () => {
  // oneQuarter: key-number periods "ttm: <A> to 2026-07-26" with only one fiscal-quarter context 2026-04-27..2026-07-26 (the #49 shape)
  const view = withLegacyValuationNotes(oneQuarter);
  expect(view.balanceSheet.coverage.numbers.map((n) => n.period)).toEqual(oneQuarter.balanceSheet.coverage.numbers.map((n) => n.period));
  expect(view.scores.aspects.balanceSheet.signals.map((s) => s.startDate)).toEqual(oneQuarter.scores.aspects.balanceSheet.signals.map((s) => s.startDate));
  expect(noteFor(oneQuarter, "currentCapitalStart")).toBeUndefined();
});
it("names a skipped terminal year by day count, not calendar years", () => {
  const skipped = (basis: string) => noteFor(demoWith({ specVersion: "1.33.0", terminalRoicBasis: basis }), "terminalYearSkipped");
  expect(skipped("… in each of the last 4 fiscal years (2021-12-31 to 2025-12-31 …")!.reason)
    .toMatch(/read 4 of the fiscal years from 2021-12-31 to 2025-12-31/);                  // round(1461 / 365.25) + 1 = 5 > 4
  expect(skipped("… in each of the last 5 fiscal years (2022-01-30 to 2026-01-25 …")).toBeUndefined(); // NVDA: round(1456 / 365.25) + 1 = 5
});
it("re-derives a stored degraded-inputs reason without the market-cap history and SPY", () => {
  // spyAndMarketCap: fairValue.reasons with a "Degraded inputs:" entry naming SPY and the market-cap history, the matching keyless
  // appendix.missingData gaps, and a vendor beta (the WACC basis has no "keyless profile regression")
  expect(JSON.stringify(withLegacyValuationNotes(spyAndMarketCap).fairValue.reasons)).not.toMatch(/Degraded inputs:/);   // the reason is removed
  // withEdgarIncome: the same, plus a served-by-edgar incomeAnnual gap that is not `expected`
  expect(JSON.stringify(withLegacyValuationNotes(withEdgarIncome).fairValue.reasons)).toMatch(/Degraded inputs:[^"]*annual income statement/);
  // the #51 shape: risk-free and WACC-history clauses only
  expect(withLegacyValuationNotes(shape51).fairValue.reasons).toEqual(shape51.fairValue.reasons);
});
it("each part's rows use their own cutoff (pre-flight split)", () => {
  // one stored body that fires a B5a row (quarterLength) and a B5b row (terminalYearSkipped)
  const both = { anchorBasis: "… latest quarter ending 2026-09-03 × 4 = 216.92B …", quarter: { start: "2026-05-29", end: "2026-09-03" },
    terminalRoicBasis: "… in each of the last 4 fiscal years (2021-12-31 to 2025-12-31 …" };
  const keys = (specVersion: string) => ["quarterLength", "terminalYearSkipped"].filter((k) =>
    withLegacyValuationNotes(demoWith({ specVersion, ...both })).appendix.missingData.filter((g) => g.field === `presentation.legacyValuation.${k}`).length === 1);
  expect(keys(ANNUALIZATION_CONVENTION_SPEC)).toEqual(["terminalYearSkipped"]);           // built under B5a, before B5b
  expect(keys("1.44.0")).toEqual(["quarterLength", "terminalYearSkipped"]);              // both parts' rows, once each
  expect(keys(DCF_INPUTS_CONVENTION_SPEC)).toEqual([]);
  expect(keys("9.0.0")).toEqual([]);
});
```

- [ ] **Step 2-4:** As Task 17: the import error first (`DCF_INPUTS_CONVENTION_SPEC` is not exported), then PASS, with the same re-runs.
- [ ] **Step 5: Benefit check.** Read the 51 stored reports and the live #51/#52 extracts through the view (Task 29b's `stored.mts`). This task's rows should fire on:
  - #43: `terminalYearSkipped`;
  - #46: `currentCapitalStart` (2025-09-04 → 2025-08-29, from the FY2026 context);
  - #48: `currentCapitalStart` (2025-07-27 → 2025-07-28, from four quarter contexts).

  They should not fire on #47, #49, #50 or #52 (their contexts do not establish the oldest quarter's start), and #43 gets no start correction (A is already the filed start). `newBorrower`, `reverseRangeEnd` and `degradedInputs` fire on none. Live #51/#52: recorded. No view throws, and stored bytes compare equal.
- [ ] **Step 6: Docs.** Task 17's METHODOLOGY paragraph gains B5b's notes and corrections, their cutoff and the per-part cutoffs.
- [ ] **Step 7: Commit.** `git add src/report/legacyValuationNotes.ts tests/report.legacyValuationNotes.test.ts docs/METHODOLOGY.md` then `git commit -m "Tell readers of stored reports how B5b reads their valuation (display-time notes and corrections)"`.

### Task 18: The reverse DCF's terminal-margin solve shifts the base margin path (FIN-501)

Round 4 (amended 2026-10-28). Runs after Task 15, whose in-domain restriction in `solveMargin` it keeps.

**Files:**
- Modify `src/pipeline/stageB/valuation.ts:254-262` (beside `fadePath`: add `marginShiftWeights` and `reverseMarginPath`), `:3041-3061` (`ReverseDcfResult`: `marginPathFamily?`, `baseTerminalMarginPct?`, `impliedMarginPathPct?`), `:3251-3289` (`solveMargin`: candidates from `reverseMarginPath`; the bracket anchor stays the base terminal margin; the note at `:3283`; the result fields).
- Modify `src/report/thesisTriggers.ts:84-93` (the `reverse-margin` trigger's `horizon` and `fixedAssumptions` when `marginPathFamily === "base-shift-to-terminal"`; HEAD's text otherwise, for computed objects without the field).
- Modify `src/pipeline/stageC/dataOnlyReport.ts:570-571` (the margin sentence names the family when the field is set).
- Modify `src/report/legacyValuationNotes.ts` (Task 17's module: row `reverseMarginFamily`).
- Modify `tests/stageB.valuation.test.ts:476-481` (the "negative base-FCFF -> falls back" price check rebuilds the solved path with `reverseMarginPath(a.ebitMarginPath.value, impliedM)` instead of `fadePath(m0, impliedM, 10)`; same tolerance `0.005 * price + 0.02`; dated comment citing D-next and FIN-501).
- Test: create `tests/stageB.reverseMarginFamily.test.ts`; modify `tests/report.legacyValuationNotes.test.ts`.

**Interfaces:**
- Produces (`valuation.ts`):
  - `export function marginShiftWeights(years: number): number[]`: `[]` for `years <= 0`, `[1]` for `years === 1`, else `wᵢ = Math.min(1, i / (fy − 1))` with `fy = Math.min(MARGIN_FADE_YEARS, years)` (0 in year one, 1 from year `fy`).
  - `export function reverseMarginPath(basePath: readonly number[], terminalPct: number): number[]`: `basePath[i] + (terminalPct − basePath[basePath.length − 1]) × marginShiftWeights(basePath.length)[i]`. At `terminalPct` equal to the base terminal margin it returns the base path; on the builder's shape it equals `fadePath(m0, terminalPct, 5)` then flat.
  - `export type MarginPathFamily = "base-shift-to-terminal"`; `ReverseDcfResult.marginPathFamily?: MarginPathFamily`, `.baseTerminalMarginPct?: number | null`, `.impliedMarginPathPct?: number[] | null` (set by the margin method only).
- Consumes: Task 15's contiguous in-domain run around the base terminal margin; on this family that run contains the base path itself, which is in domain under B-29.
- Text (exact):
  - reverse note: `market-implied steady-state (terminal) EBIT margin on the base margin path shifted to it: year one stays at ${m0}%, the shift reaches full size by year ${fy} and is held, so a price at the model value solves to the base terminal margin ${baseTerminal}%; growth path frozen at base case`;
  - trigger horizon: `The base case's margin path shifted so it reaches the terminal level by year ${fy} and holds it, with year one unchanged, across ${years} explicit forecast years`;
  - trigger fixed assumption: `The revenue growth path remains at the base case; the operating-margin path is the base path shifted to the price-implied terminal level.`;
  - data-only: `… terminal EBIT margin, on the base margin path shifted to it (year one unchanged, the full shift by year ${fy}), with growth held at its base path (margin-solve fallback). …`.

- [ ] **Step 1: Write the failing test** in `tests/stageB.reverseMarginFamily.test.ts`. `synthetic(marginPath)` is copied from `tmp/audit-2026-10-27/probes/FIN-501.probe.ts:36-53` (synthetic: start revenue 1000, growth `convergentFadePath(30, 2.5, 10)`, tax 21%, sales-to-capital 1.0, WACC 9%, terminal growth 2.5%, terminal ROIC 9%, mid-year on).

```ts
const baseShape = (m0: number, target: number, years = 10) => {
  const fade = fadePath(m0, target, Math.min(MARGIN_FADE_YEARS, years));
  return Array.from({ length: years }, (_, i) => (i < fade.length ? fade[i] : target));
};
const opts: DcfRunOptions = { waccPct: 9, netDebt: 0, dilutedShares: 100 };

describe("reverse DCF margin family contains the base margin path (FIN-501)", () => {
  it("is the base path at the base terminal margin, for the builder's shape and for any other", () => {
    expect(reverseMarginPath(baseShape(10, 20), 20)).toEqual(baseShape(10, 20));
    expect(reverseMarginPath(fadePath(-10, 10, 10), 10)).toEqual(fadePath(-10, 10, 10));
    reverseMarginPath(baseShape(10, 20), 25).forEach((v, i) => expect(v).toBeCloseTo(baseShape(10, 25)[i]!, 9)); // the builder's shape, reaching 25 by year 5
    expect(reverseMarginPath([-10, 10], 60)).toEqual([-10, 60]);                // two-year horizon (tests/stageB.valuation.test.ts:369)
  });
  it("solves a price at the model value to the base terminal margin", () => {
    const a = synthetic(baseShape(10, 20));
    const base = runDcf(a, opts);
    expect(base.yearRows[0]!.fcff).toBeLessThan(0);                              // setup: fallback A, as in the probe
    const r = reverseDcf(base.perShare!, a, opts);
    expect(r.method).toBe("margin");
    expect(r.impliedTerminalMarginPct!).toBeCloseTo(20, 1);                      // HEAD: 21.712646484375
    expect(r.marginPathFamily).toBe("base-shift-to-terminal");
    expect(r.impliedMarginPathPct).toEqual(reverseMarginPath(a.ebitMarginPath.value, r.impliedTerminalMarginPct!));
    expect(r.notes.join(" ")).toMatch(/on the base margin path shifted to it: year one stays at 10%, the shift reaches full size by year 5 and is held/);
  });
  it("solves a price 3% below the model value below the base terminal margin", () => {
    const a = synthetic(baseShape(10, 20));
    const dcf = runDcf(a, opts);
    const r = reverseDcf(dcf.perShare! * 0.97, a, opts);
    expect(r.impliedTerminalMarginPct!).toBeLessThan(20);                        // HEAD: 21.214599609375
    const trigger = buildThesisTriggers({ valuation: { kind: "dcf", assumptions: a, dcf, reverseDcf: r }, projections: { series: [] } } as never)
      .find((t) => t.id === "reverse-margin")!;
    expect(trigger.comparator).toBe("below");                                    // HEAD: "above"
    expect(trigger.horizon).toMatch(/base case's margin path shifted so it reaches the terminal level by year 5/);
  });
  it("reproduces the price on the family it reports", () => {
    const a = synthetic(baseShape(10, 20));
    const r = reverseDcf(25, a, opts);
    const check = runDcf({ ...a, ebitMarginPath: { ...a.ebitMarginPath, value: r.impliedMarginPathPct! } }, opts).perShare!;
    expect(Math.abs(check - 25)).toBeLessThan(0.005 * 25 + 0.02);
  });
  it("control: a flat base path solves back to its own margin (passes at HEAD)", () => {
    const a = synthetic(Array.from({ length: 10 }, () => 15));
    expect(reverseDcf(runDcf(a, opts).perShare!, a, opts).impliedTerminalMarginPct!).toBeCloseTo(15, 1);
  });
});
```

In `tests/report.legacyValuationNotes.test.ts`, built like Task 17's cases from `fixtures/report/DEMO-sample.json`:

```ts
it("notes a margin-method reverse DCF solved on the straight-line family over a non-flat base margin path (FIN-501)", () => {
  // specVersion "1.44.0"; valuation.reverseDcf { impliedMetric: "terminal EBIT margin", impliedValue: 48.68 };
  // assumption row { name: "EBIT margin (yr1 → yrN)", value: "12.1% → 14.0%", basis: "fade current 12.08% … by year 5 …, flat thereafter" }
  expect(view.appendix.missingData.find((g) => g.field === "presentation.legacyValuation.reverseMarginFamily")!.reason)
    .toMatch(/does not contain this report's base margin path \(12\.1% → 14\.0%/);
  // controls: the #43 shape (row value "12.1% → 12.1%", a flat base the straight-line family contains) and a
  // growth-method reverse ("starting revenue growth (fades to terminal rate)") gain no note
  for (const control of [flatBase43Shape, growthMethodShape]) expect(noteFor(control, "reverseMarginFamily")).toBeUndefined();
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/stageB.reverseMarginFamily.test.ts` — expected FAIL: `reverseMarginPath is not a function`; with a stub export, `expected 21.712646484375 to be close to 20`, `expected 21.214599609375 to be less than 20`, `expected 'above' to be 'below'`. The flat control passes at HEAD. `npx vitest run tests/report.legacyValuationNotes.test.ts -t "FIN-501"` fails on the missing note.
- [ ] **Step 3: Implement.** `marginShiftWeights` and `reverseMarginPath` per Interfaces. In `solveMargin`: `const basePath = assumptions.ebitMarginPath.value; const baseTerminal = basePath[n - 1]; const fM = (m: number) => { const v = perShareAt({ ebitMarginPathPct: reverseMarginPath(basePath, m) }); return v === null ? null : v - price; };` the prescan range, the in-domain run (Task 15) and the nearest-bracket anchor (`baseTerminal`) are unchanged; the note and the result fields per Interfaces. `thesisTriggers.ts` and `dataOnlyReport.ts` print the new text only when `marginPathFamily === "base-shift-to-terminal"`. The `reverseMarginFamily` row: detector `meta.specVersion < DCF_INPUTS_CONVENTION_SPEC` (B5b's cutoff, Task 17b), `valuation.reverseDcf.impliedMetric` matches `/terminal (EBIT|operating) margin/i`, and the assumption row named `EBIT margin (yr1 → yrN)` has a value `a% → b%` with `a ≠ b`; note: "Built before spec S: the price-implied terminal margin was solved on margin paths fading in a straight line over every explicit year, a family that does not contain this report's base margin path (a% → b%, reached by year 5 and then held), so it can overstate the margin the price needs. From S the solve shifts the base margin path itself. Stored figures are unchanged."
- [ ] **Step 4: Run it.** PASS. Re-run `npx vitest run tests/stageB.valuation.test.ts tests/report.thesisTriggers.test.ts tests/stageB.grading.test.ts tests/stageC.deterministicInjection.test.ts tests/degradation.report.test.ts tests/stageB.dcfDomain.audit20261022.test.ts tests/report.legacyValuationNotes.test.ts`: the `:369` boundary case passes unchanged (two years: w = [0, 1], so the family at 60% is `[−10, 60]`, its target); the `:454` fallback case passes after its re-pin (it still accepts "margin" or "none"); thesis-trigger fixtures without `marginPathFamily` keep HEAD's horizon text; no grade moves (`grading.ts` reads only the growth solve).
- [ ] **Step 5: Benefit check.** The probe's three failing assertions now hold in the new test (family at the base terminal = base path by construction; 21.71% → 20%; 21.21% → below 20% with the trigger "below"), and its two controls hold (the builder's path is non-flat; a flat path solves to 15%). Replay (Task 29b): AMZN #43 at HEAD takes the margin fallback on a non-flat path (12.08% → 14.03% by year 5) and publishes 48.68% where the like-for-like solve is 42.09% (probe); after all tasks record the figure (Tasks 3 and 15 also move #43's base path and in-domain run), and the proof asserts on every snapshot whose reverse takes the margin method that the solve at price = its own model value returns its base terminal margin within 0.05pp. Must not move: every growth-method reverse figure (MU #46, NVDA #48–#50), every grade. Stored reports: no note fires on the 51 (stored #43's margin-method report has a flat base, "12.1% → 12.1%", which the straight-line family contains, so its 52.30% was like for like; #35 at spec 1.1.0 has no margin row).
- [ ] **Step 6: Docs.** `docs/METHODOLOGY.md:2126-2129`: "with a margin fade over the full explicit horizon and the base growth path held" becomes "on the base margin path shifted by (m − base terminal margin) times its fade weight (0 in year one, rising linearly to 1 by year 5 and held), so the base path is the family member at the base terminal margin and a price at the model value solves to it (D-next; the property D-58 gives the growth solve), with the base growth path held". `:2829`: "Forward and reverse DCF use the same growth-path family" becomes "the same growth-path and margin-path families". Task 17's METHODOLOGY paragraph on stored valuations gains the `reverseMarginFamily` note.
- [ ] **Step 7: Commit.** `git add src/pipeline/stageB/valuation.ts src/report/thesisTriggers.ts src/pipeline/stageC/dataOnlyReport.ts src/report/legacyValuationNotes.ts tests/stageB.reverseMarginFamily.test.ts tests/stageB.valuation.test.ts tests/report.legacyValuationNotes.test.ts docs/METHODOLOGY.md` then `git commit -m "Solve the reverse DCF's terminal margin on the base margin path shifted, so the model value solves to the base (FIN-501)"`.

### Task 19: The tax seed is read without the one-off the margin seed removes (FIN-502)

Round 4 (amended 2026-10-28). Sits next to Task 7 (same tagged one-offs, another consumer) and after Task 1 (which scales the base row's pre-tax income, tax and one-off by 52/53 together, so the ratios below are unchanged by it).

**Files:**
- Modify `src/pipeline/stageB/valuation.ts:308` (add `taxRateWithoutOneOffs` beside `marginalTaxFloor`), `:1886-1896` (reuse `normalizeUnusual` and `unusual.value`; no change there), `:2045-2051` (`currentTaxRate`: when `normalizeUnusual`, the re-read rate), `:2075` (the `marginalTaxFloor` call moves above `currentTaxRate`, which now needs it; pure, no behaviour change), `:2104-2112` (`taxBasis` names both readings and the point taken).
- Modify `src/report/legacyValuationNotes.ts` (row `taxSeedOneOff`).
- Test: create `tests/stageB.taxSeedOneOff.test.ts`; modify `tests/report.legacyValuationNotes.test.ts`.

**Interfaces:**
- Produces: `export function taxRateWithoutOneOffs(i: { pretax: number | null; taxExpense: number | null; oneOff: number; marginalPct: number; historicalMedianPct: number | null }): { pct: number; noTaxEffectPct: number; marginalEffectPct: number; source: "historical-median-inside" | "historical-median-held" | "marginal-reading" } | null`. Null when `pretax` or `taxExpense` is not finite, when `taxExpense < 0` (HEAD's own guard, `valuation.ts:2049`: a negative tax expense is "not computable" with or without a one-off; without this guard a tagged item of any size would turn HEAD's company-median fallback into a 0% year one, the discontinuity OD-12 rejects; review round 4), or when `pretax − oneOff ≤ 0`. Otherwise `noTaxEffectPct = clamp(taxExpense / (pretax − oneOff) × 100, 0, 35)`, `marginalEffectPct = clamp((taxExpense − marginalPct / 100 × oneOff) / (pretax − oneOff) × 100, 0, 35)`, and `pct` = `historicalMedianPct` held within `[min, max]` of the two (`"…-inside"` when it already lies there, `"…-held"` when clamped), else `marginalEffectPct` (`"marginal-reading"`). `oneOff` is the net tagged amount, gains positive (`unusual.value`).
- `buildDcfAssumptions`: when `normalizeUnusual` and the helper returns a value, `currentTaxRate = result.pct` (then the existing `[0, 35]` `clampWithNote`); `companyTerminalTax = historicalMedianTax ?? currentTaxRate` is unchanged and so reads the re-read rate when there is no history. Guided tax (D-60) still wins (`tEff = guidedTax ?? currentTaxRate ?? taxTerminal`). With no tagged one-off, or with the helper returning null, HEAD's path runs.
- Basis (exact head; HEAD's "fading to … / held flat …" tail follows): `${periodBasis} effective rate re-read without tagged one-off items of ${u}: ${r0}% with no tax effect on them, ${r1}% taxed at the ${t}% marginal rate; year one ${pct}% (${"the company historical median, inside that range" | "the company historical median ${median}% held to the range's nearer end" | "no historical median: the marginal-rate reading"})`. On the guided branch (D-60) the clause "against the ${periodBasis} observed ${currentTaxRate}%" (`valuation.ts:2107`) would then print the re-read rate as observed; when the re-read ran it reads "against the ${periodBasis} rate re-read without tagged one-off items, ${pct}%" instead (review round 4). With no history, `companyTaxText` (`:2078`, "${periodBasis} effective rate") names the terminal source; when the re-read ran it reads "${periodBasis} effective rate re-read without tagged one-off items", so the terminal text does not call the re-read rate the raw TTM rate.

- [ ] **Step 1: Write the failing test** in `tests/stageB.taxSeedOneOff.test.ts`. `build(charge, over?)` is the FIN-502 probe's builder (`tmp/audit-2026-10-27/probes/FIN-502.probe.ts:17-46`, synthetic): five fiscal years 2021–2025 whose rates are 21.14%, 21.05%, 21.26%, 20.89% and 20.83% (median 21.0526%), a TTM to 2026-06-30 with revenue 1000, operating income 260 − charge, pre-tax 250 − charge and tax `over.tax ?? 52.5`, `unusualOperatingItems` `{ value: −charge, components: [{ tag: "GoodwillImpairmentLoss", value: −charge }], withheld: [] }` (null when charge is 0), US domicile; `over.historyTax === null` sets every history row's `incomeTaxExpense` to null; `over.guidedTaxPct` adds `guidance: { revenue: 270, periodStart: "2026-07-01", periodEnd: "2026-09-30", asOf: "2026-08-01", source: "synthetic 8-K", taxRatePct }`.

```ts
const opts = { waccPct: 9, netDebt: -100, dilutedShares: 100 };
it("re-reads year one without a non-deductible goodwill charge (FIN-502)", () => {
  const clean = build(0), charged = build(100);
  expect(charged.ebitMarginPath.value[0]).toBeCloseTo(clean.ebitMarginPath.value[0]!, 9);    // setup: the margin seed already removes it
  expect(charged.taxRatePath.value[0]).toBeCloseTo(21.0526, 3);                               // HEAD: 35 (52.5 / 150, clamped)
  expect(charged.taxRatePath.basis).toMatch(/TTM effective rate re-read without tagged one-off items of -100: 21% with no tax effect on them, 29\.4% taxed at the 21% marginal rate; year one 21\.05% \(the company historical median, inside that range\)/);
  expect(runDcf(charged, opts).perShare!).toBeCloseTo(runDcf(clean, opts).perShare!, 1);    // HEAD: 31.83 against 33.63
});
it("does not under-tax a deductible charge", () => {
  // Tax 31.5: the charge carried its 21% deferred-tax benefit. Readings 12.6% and 21%; the 21.05% median is held at 21%.
  const a = build(100, { tax: 31.5 });
  expect(a.taxRatePath.value[0]).toBeCloseTo(21, 9);                                          // HEAD 21 too (31.5 / 150); add-back at zero tax would give 12.6
  expect(a.taxRatePath.basis).toMatch(/year one 21% \(the company historical median 21\.05% held to the range's nearer end\)/);
});
it("leaves the TTM rate when the one-off is tiny", () => {
  expect(build(0.1).taxRatePath.value[0]).toBeCloseTo((52.5 / 249.9) * 100, 4);              // 21.0084 (the range end 52.521 / 250, within 0.00001pp of HEAD); a plain median would give 21.0526
});
it("takes the marginal-rate reading when the issuer has no historical rate", () => {
  const a = build(100, { historyTax: null });
  expect(a.taxRatePath.value[0]).toBeCloseTo(29.4, 6);                                        // HEAD: 35
  expect(a.taxRatePath.basis).toMatch(/year one 29\.4% \(no historical median: the marginal-rate reading\)/);
});
it("control: guided tax still sets year one, and an issuer with no tagged item is unchanged", () => {
  expect(build(100, { guidedTaxPct: 17 }).taxRatePath.value[0]).toBe(17);
  expect(build(0).taxRatePath.value[0]).toBe(21);                                             // 52.5 / 250
  expect(build(0).taxRatePath.basis).toMatch(/^TTM effective rate 21% fading to 21\.05% by year 10/); // HEAD wording
});
it("control: a negative tax expense keeps HEAD's not-computable path, with or without a tagged item", () => {
  // HEAD (measured 2026-10-28): both 21.0526, the company median held for all ten years. A helper without the
  // taxExpense ≥ 0 guard would give 0% here (both readings clamp to 0), so this pins the guard.
  expect(build(0.1, { tax: -10 }).taxRatePath.value[0]).toBeCloseTo(build(0, { tax: -10 }).taxRatePath.value[0]!, 9);
  expect(build(0.1, { tax: -10 }).taxRatePath.basis).toMatch(/^TTM effective rate not computable/);
});
```

In `tests/report.legacyValuationNotes.test.ts`: a stored report (spec "1.44.0") whose `EBIT margin (yr1 → yrN)` row basis contains "(TTM, excluding tagged one-off items)" and whose `forecast tax rate (yr1 → yrN)` row basis begins "TTM effective rate 35% fading" gains a `taxSeedOneOff` note matching `/year one's tax rate \(35%\) was measured on pre-tax income that still held the tagged one-off items the margin seed removed/`; controls: the same margin row with a basis beginning "guided GAAP effective rate", and a margin basis without the one-off phrase (every stored report), gain none.

- [ ] **Step 2: Run it.** `npx vitest run tests/stageB.taxSeedOneOff.test.ts` — expected FAIL: `expected 35 to be close to 21.0526`, the basis regex, `expected 31.83… to be close to 33.63…`, and `expected 35 to be close to 29.4`; the deductible case's rate (21%), the tiny case, the guided/no-item control and the negative-tax control pass at HEAD (they pin that the rule does not move those rates). The round-4 reviewer's HEAD values came from `tmp/audit-2026-10-27/plans/b5-r4-review/r4.review.out.json`, which is lost: they are unverified (evidence lost; pre-flight P6). This step's own branch-base run, written to `b5-evidence\`, is the evidence. The deductible case's basis assertion fails at HEAD (no re-read text yet).
- [ ] **Step 3: Implement** per Interfaces. A note is pushed when the re-read runs ("year-one tax rate re-read without tagged one-off items …", the basis head). The `taxSeedOneOff` row: detector `meta.specVersion < DCF_INPUTS_CONVENTION_SPEC` (Task 17b), the margin row basis contains "excluding tagged one-off items", and the tax row basis matches `/^(TTM|latest annual FY \S+) effective rate \d/`; note: "Built before spec S: year one's tax rate (Y%) was measured on pre-tax income that still held the tagged one-off items the margin seed removed. From S it is re-read without them, between the rate with no tax effect on them and the rate taxed at the marginal rate. Stored figures are unchanged."
- [ ] **Step 4: Run it.** PASS. Re-run `npx vitest run tests/stageB.dcfAnchoring.test.ts tests/stageB.unusualItems.test.ts tests/stageB.valuation.test.ts tests/stageB.oneOperatingIncome.test.ts tests/stageB.periodLength.test.ts tests/audit.issuerPipeline.test.ts`: unchanged except a fixture that tags a TTM one-off with a tax rate (its year-one tax re-pins with a D-next comment, and the re-pin must equal `taxRateWithoutOneOffs` on that fixture's own numbers).
- [ ] **Step 5: Benefit check.** The probe's per-share assertion holds (the charged issuer is valued within 0.05 of the clean one). Its tax-rate assertion pins the clean TTM rate, 21%, at one decimal; the decision gives 21.0526%, 0.0026pp outside that tolerance, because a rule that does not assume the charge was non-deductible takes the issuer's five-year median, not its clean TTM rate. The disposition note records this as fixed with that difference (OD-12). Replay (Task 29b): record year one's tax rate on 43–50 before and after; it moves only on a snapshot whose margin seed removes a tagged one-off (Task 29b lists them), and MU #46's 14.81% TTM rate and NVDA's guided 17% must not move otherwise. Stored reports: no note fires on the 51 (no stored margin basis says "excluding tagged one-off items").
- [ ] **Step 6: Docs.** `docs/METHODOLOGY.md:599-611` ("Tax path (D-58)"): add that when the margin seed leaves tagged one-offs out, year one's rate is re-read without them, between the no-tax-effect and marginal-rate readings, at the company median held to that range (else the marginal-rate reading), and the basis names both. `:3138-3146` (the D-98 paragraph): the tagged one-offs now leave the margin seed and the tax seed. Task 17's paragraph on stored valuations gains the `taxSeedOneOff` note.
- [ ] **Step 7: Commit.** `git add src/pipeline/stageB/valuation.ts src/report/legacyValuationNotes.ts tests/stageB.taxSeedOneOff.test.ts tests/report.legacyValuationNotes.test.ts docs/METHODOLOGY.md` then `git commit -m "Re-read the DCF tax seed without the tagged one-off the margin seed removes (FIN-502)"`.

### Task 20: The scenario text names a binding σ bound (FIN-512)

Round 4 (amended 2026-10-28). No figure moves: the shocks are the capped σ as at HEAD.

**Files:**
- Modify `src/pipeline/stageB/projections.ts:62-64` (export `SIGMA_GROWTH_MAX`, `SIGMA_MARGIN_MAX`), `:248-262` (`ScenarioDispersion` gains four fields), `:337-350` (`scenarioDispersion` returns them), `:506` (the "Bull/bear shift" assumption line), and a new `sigmaCapPhrases` beside `scenarioDispersion`.
- Modify `src/pipeline/stageB/scenarioTargets.ts:204-208` and `:340-368` (basis line 1 and the dispersion record).
- Modify `src/report/schema.ts:1973-1981` (`ScenarioTargetsSchema.dispersion`: two optional fields; `sigmaSource` comment).
- Modify `src/pipeline/stageC/prompts.ts:573` (the judge framing's "±1σ of the company's own history" line; prompt text, so PIPELINE_VERSION moves in Task 23b under decisions spec section 2.15).
- Modify `src/report/legacyValuationNotes.ts` (row `sigmaCap`).
- Test: create `tests/stageB.scenarioSigmaCap.test.ts`; modify `tests/report.legacyValuationNotes.test.ts`.

**Interfaces:**
- `export const SIGMA_GROWTH_MAX = 25`, `export const SIGMA_MARGIN_MAX = 12` (values unchanged since the initial release, f0d77ef).
- `ScenarioDispersion.rawSigmaGrowth: number | null`, `.rawSigmaMargin: number | null` (the sample σ before the bound), `.growthCapped: boolean` (`rawSigmaGrowth > SIGMA_GROWTH_MAX`), `.marginCapped: boolean`.
- `export function sigmaCapPhrases(d: ScenarioDispersion): { growth: string; marginBasis: string; marginLine: string }`: `growth` = `" (σ capped at the house 25pp bound; sample σ ${round2(raw)}pp)"` when `growthCapped`, else `""` (inserted right after `±${dg}pp` in both texts); `marginBasis` = `"margin σ, capped at the house 12pp bound (sample σ ${round2(raw)}pp), is scaled by"` when `marginCapped`, else HEAD's `"margin sample σ is scaled by"`; `marginLine` = `"the margin shift is σ capped at the house 12pp bound (sample σ ${round2(raw)}pp) scaled by"`, else HEAD's `"the margin shift is sample σ scaled by"`.
- `ScenarioTargetsSchema.dispersion` gains `uncappedGrowthSigmaPp: z.number().optional()` and `uncappedMarginSigmaPp: z.number().optional()`, each present only when that bound binds (`round2`); `sigmaSource` stays `"own-history"` (the σ is measured on the issuer's own history; the new fields say a bound was applied), so no enum value is added and no stored report fails to parse.
- Judge framing line 573 becomes `"  with growth + operating margin shifted ±1σ of the company's own history, at most 25pp of growth and 12pp of margin; the scenario basis says when a bound binds) and injected AFTER your"` (one line; the surrounding lines unchanged).

- [ ] **Step 1: Write the failing test** in `tests/stageB.scenarioSigmaCap.test.ts`. `NVDA_SEC` is NVDA's SEC-filed FY2017–FY2026 annual revenue and operating income (the `HISTORY` rows of `tests/stageB.dcfAnchoring.test.ts`, also in `probes/FIN-301-V1.probe.ts:41-49`), mapped to `ProjectionIncomeRow` `{ date, revenue, ebit: operatingIncome, netIncome: null, epsDiluted: null }`; on them the sample σ is 46.117pp (growth, nine annual steps) and 15.883pp (margin, ten levels), the probe's values from run 50. `makeTargetInputs` and `makeProjectionInputs` are the `makeInputs` builders of `tests/stageB.scenarioTargets.test.ts:98-109` and `tests/stageB.projections.test.ts:90-110`, copied (synthetic DCF), with `incomeHistory` overridden.

```ts
it("reports the sample σ and which house bound binds (FIN-512)", () => {
  const d = scenarioDispersion(NVDA_SEC);
  expect([d.sigmaGrowth, d.sigmaMargin]).toEqual([25, 12]);                                     // shocks unchanged
  expect(d.rawSigmaGrowth!).toBeCloseTo(46.117, 3);
  expect(d.rawSigmaMargin!).toBeCloseTo(15.883, 3);
  expect([d.growthCapped, d.marginCapped]).toEqual([true, true]);
});
it("names the binding bound in the projection line", () => {
  const line = computeProjections(makeProjectionInputs({ incomeHistory: NVDA_SEC })).series.find((s) => s.metric === "revenue")!
    .assumptions.find((t) => t.startsWith("Bull/bear shift"))!;
  expect(line).toContain("by ±25pp (σ capped at the house 25pp bound; sample σ 46.12pp)");
  expect(line).toContain("the margin shift is σ capped at the house 12pp bound (sample σ 15.88pp) scaled by the company's observed growth/margin correlation");
  expect(line).not.toMatch(/margin shift is sample σ/);                                         // HEAD: "the margin shift is sample σ scaled by …"
});
it("names the binding bound in the scenario basis and records the sample σ", () => {
  const r = computeScenarioTargets(makeTargetInputs({ incomeHistory: NVDA_SEC }));
  expect(r.status).toBe("available");                                                           // setup guard (Step 2 confirms it at HEAD)
  expect(r.basis[1]).toContain("year-one growth shifted ±25pp (σ capped at the house 25pp bound; sample σ 46.12pp)");
  expect(r.basis[1]).toContain("margin σ, capped at the house 12pp bound (sample σ 15.88pp), is scaled by observed growth/margin correlation");
  expect(r.dispersion).toMatchObject({ growthSigmaPp: 25, marginSigmaPp: 12, uncappedGrowthSigmaPp: 46.12, uncappedMarginSigmaPp: 15.88, sigmaSource: "own-history" });
  expect(ScenarioTargetsSchema.safeParse(r).success).toBe(true);
});
it("tells the judge the shocks are bounded, at the bounds the code applies", () => {
  expect(buildJudgeFraming()).toContain("shifted ±1σ of the company's own history, at most 25pp of growth and 12pp of margin");
  // prompts.ts keeps the literal (it imports nothing from Stage B); this pins it to the exported constants so the two cannot drift.
  expect(buildJudgeFraming()).toContain(`at most ${SIGMA_GROWTH_MAX}pp of growth and ${SIGMA_MARGIN_MAX}pp of margin`);
});
it("control: an issuer inside both bounds keeps HEAD's wording and carries no uncapped fields", () => {
  const r = computeScenarioTargets(makeTargetInputs());                                       // the file's INCOME_HISTORY, σ far inside both bounds
  expect(r.basis[1]).toContain("margin sample σ is scaled by observed growth/margin correlation");
  expect(r.dispersion).not.toHaveProperty("uncappedGrowthSigmaPp");
  expect(r.dispersion).not.toHaveProperty("uncappedMarginSigmaPp");
});
```

In `tests/report.legacyValuationNotes.test.ts`: a stored report (spec "1.44.0") with `scenarioTargets.dispersion { growthSigmaPp: 25, marginSigmaPp: 12, sigmaSource: "own-history", growthMarginCorrelation: 0.843 }` (the #46–#52 shape) gains a `sigmaCap` note matching `/growth σ of 25pp and the margin σ of 12pp are the house upper bounds, not this issuer's sample σ/`; one with `{ 25, 3.09 }` names only the growth bound and does not match `/calls the margin shift/`; the #43 shape `{ 10.38, 3.09 }` gains none.

- [ ] **Step 2: Run it.** `npx vitest run tests/stageB.scenarioSigmaCap.test.ts` — expected FAIL: `expected undefined to be close to 46.117` (no raw field), the three `toContain` cases on HEAD's wording, `expected … to match object { uncappedGrowthSigmaPp: 46.12, … }`, and the judge-framing `toContain`; the `status` guard and the control pass at HEAD. The round-4 reviewer reported these fixtures' HEAD values: status "available", basis line 1 and the projection line in HEAD's "sample σ" wording, dispersion 25 / 12 with correlation 0.8433. They came from `tmp/audit-2026-10-27/plans/b5-r4-review/r4.review.out.json`, which is lost, so they are unverified (evidence lost; pre-flight P6). This step's own branch-base run of the status guard is the evidence; write its output to `b5-evidence\`. The reasoning the amendment gave: on the file's synthetic DCF (start revenue 1000, sales-to-capital about 1.43, net cash 100) the bear run's −13% year-one growth releases no capital and keeps FCFF and equity positive, and the bull run's NOPAT (about 1370 × 40% × 79% ≈ 433) exceeds its reinvestment (370 ÷ 1.43 ≈ 259). If it fails at HEAD, stop and record it: a different DCF fixture is a reviewer's call, not this task's.
- [ ] **Step 3: Implement** per Interfaces; `effectiveScenarioShocks` and every shock are untouched. The `sigmaCap` row: detector `meta.specVersion < DCF_INPUTS_CONVENTION_SPEC` (Task 17b), `scenarioTargets.dispersion.sigmaSource === "own-history"`, and `growthSigmaPp === 25` or `marginSigmaPp === 12`; note: "The growth σ of 25pp and the margin σ of 12pp are the house upper bounds, not this issuer's sample σ, which was larger; the scenario record labels them own-history σ and the scenario text calls the margin shift 'sample σ'. Reports from spec S state the bound and the sample σ. Stored figures are unchanged." (naming only the bound or bounds that equal the cap; the clause "and the scenario text calls the margin shift 'sample σ'" only when the margin bound is one of them, because the stored texts call only the margin shift "sample σ": stored #43–#52 read "margin sample σ is scaled by …" and "the margin shift is sample σ scaled by …", and say "growth shifted ±Xpp" without the word; review round 4).
- [ ] **Step 4: Run it.** PASS. Re-run `npx vitest run tests/stageB.scenarioTargets.test.ts tests/stageB.projections.test.ts tests/stageB.auditScenarios.test.ts tests/report.history.export.test.ts tests/stageC.judgeProtocol.test.ts tests/stageC.indicatorUnits.test.ts tests/report.legacyValuationNotes.test.ts`: unchanged where a fixture's history sits inside both bounds (`report.history.export.test.ts:357` builds its own dispersion without the new optional fields, which still parses); a case whose history binds a bound and pins basis line 1 or the projection line re-pins to the new wording with a D-next comment, and its shocks and targets must not move.
- [ ] **Step 5: Benefit check.** The probe's assertion (`disclosesSigmaCap || marginShiftIsSampleSigmaTimesCorr`) now holds through `disclosesSigmaCap` on its own regex ("σ capped at the house 25pp bound" matches `(σ|sigma)[^;]{0,80}\b(capped|…)`); its preconditions (raw 46.12 > 25, raw 15.88 > 12, published 25 and 12) still hold. Replay (Task 29b): on MU #46 and NVDA #48–#50 the basis and projection line gain the clause and the record the two uncapped fields. The targets, shocks and every other figure must not move, asserted against a run, never a literal (pre-flight P2). The shocks equal the branch-base run's. The targets and every other figure equal the run on the commit before this task, because Part B's earlier tasks move the targets first (Tasks 7, 7b, 10b, 15, 18 and 19). NVDA #50's 389.96 / 229.52 / 126.14 is `6542531` provenance only. Stored reports: the note fires on #46, #47, #48, #49, #50 and #52 (all store 25 / 12), on none other; live AMZN #52 (σ 10.38 / 3.07, inside both bounds) gains none.
- [ ] **Step 6: Docs.** `docs/METHODOLOGY.md:2224` ("Growth sigma is capped at 25pp and margin sigma at 12pp"): add that when a bound binds, the scenario basis and the projection line say so beside the shock and give the sample σ, and the report's dispersion record carries the uncapped value. Task 17's paragraph on stored valuations gains the `sigmaCap` note.
- [ ] **Step 7: Commit.** `git add src/pipeline/stageB/projections.ts src/pipeline/stageB/scenarioTargets.ts src/report/schema.ts src/pipeline/stageC/prompts.ts src/report/legacyValuationNotes.ts tests/stageB.scenarioSigmaCap.test.ts tests/report.legacyValuationNotes.test.ts docs/METHODOLOGY.md` then `git commit -m "Say when a scenario σ is the house bound, not the sample σ (FIN-512)"`.

### Task 21: The scenario target line drops the zero floor D-102 retired (RPT-502)

Round 4 (amended 2026-10-28). Text only; no figure moves.

**Files:**
- Modify `src/report/scenarioPresentation.ts:197-201` (export `SCENARIO_TARGET_LABEL_LINE` and `LEGACY_SCENARIO_FLOOR_LINE`; the available-target branch returns the new line).
- Modify `src/report/legacyValuationNotes.ts` (display-only correction row `scenarioFloorSentence`; Task 17's allowed-field list gains `valuation.scenarios[].assumptions`).
- Test: modify `tests/report.scenarioPresentation.test.ts` (two cases), `tests/report.legacyValuationNotes.test.ts` (two cases).

**Interfaces:**
- `export const SCENARIO_TARGET_LABEL_LINE = "Targets are labeled by per-share value. No scenario is a future-price forecast."` (the finding's expected text: the withhold rule is already stated once, in the scenario basis, `scenarioTargets.ts:350`, so it is not repeated; R3's "each disclosure said once").
- `export const LEGACY_SCENARIO_FLOOR_LINE = "Targets are labeled by per-share value; a negative perturbed equity value is floored at zero. No scenario is a future-price forecast."` (read only by the display correction).
- `scenarioFloorSentence` correction: when `meta.specVersion < DCF_INPUTS_CONVENTION_SPEC` (Task 17b), some `scenarioTargets.basis` entry contains "a fan with either run outside the DCF's domain is withheld", and a scenario's `assumptions` holds `LEGACY_SCENARIO_FLOOR_LINE`, the view replaces that line with `SCENARIO_TARGET_LABEL_LINE` in every scenario and adds the note "Presentation correction: each scenario's last line said a negative perturbed equity value is floored at zero. This report's targets were built under the rule its scenario basis states (a fan with either run outside the DCF's domain is withheld), so no target was floored. No figure changed."

- [ ] **Step 1: Write the failing test.** In `tests/report.scenarioPresentation.test.ts`, on the file's `computedFixture()` (available targets from `runStageB(completeCurrencyBundle({}))`) and `narrativeValuation()`:

```ts
it("does not tell the reader a perturbed equity value is floored at zero (RPT-502)", () => {
  const last = applyScenarioPresentation(narrativeValuation(), computedFixture()).scenarios.map((s) => s.assumptions.at(-1));
  expect(last).toEqual([SCENARIO_TARGET_LABEL_LINE, SCENARIO_TARGET_LABEL_LINE, SCENARIO_TARGET_LABEL_LINE]); // HEAD: "…; a negative perturbed equity value is floored at zero. …"
  expect(last.some((line) => /floored/.test(line ?? ""))).toBe(false);
});
it("control: withheld per-share targets keep the operating-scenario line", () => {
  const computed = computedFixture();
  expect(computed.projections?.scenarioAssumptions).toBeTruthy();                            // setup: the operating paths exist
  computed.scenarioTargets.targets.forEach((target) => { target.perShare = null; });
  expect(applyScenarioPresentation(narrativeValuation(), computed).scenarios[0]!.assumptions.at(-1))
    .toBe("Operating scenarios use the recorded enterprise-value ordering. Per-share targets and qualitative narratives may be withheld independently; no operating path is a future-price forecast.");
});
```

In `tests/report.legacyValuationNotes.test.ts` (stored reports built from `fixtures/report/DEMO-sample.json` with three scenarios and a `scenarioTargets.basis`, strings copied from stored #50 and #43):

```ts
it("replaces a stored floor sentence when the stored basis states the withhold rule (the #46–#52 shape)", () => {
  // spec "1.44.0"; basis[1] ends "… so the higher scenario is always bull; a fan with either run outside the DCF's domain is withheld.";
  // each scenario's last assumption is LEGACY_SCENARIO_FLOOR_LINE
  const before = JSON.stringify(stored);
  const view = withLegacyValuationNotes(stored);
  expect(view.valuation.scenarios.map((s) => s.assumptions.at(-1))).toEqual([SCENARIO_TARGET_LABEL_LINE, SCENARIO_TARGET_LABEL_LINE, SCENARIO_TARGET_LABEL_LINE]);
  expect(view.appendix.missingData.find((g) => g.field === "presentation.legacyValuation.scenarioFloorSentence")!.reason).toMatch(/^Presentation correction: /);
  expect(JSON.stringify(stored)).toBe(before);
});
it("keeps the floor sentence where the stored basis states the floor rule (the #43 shape)", () => {
  // shape43: spec "1.33.0"; basis[1] ends "… so the higher scenario is always bull and per-share is floored at 0."
  const view = withLegacyValuationNotes(shape43);
  expect(view.valuation.scenarios.map((s) => s.assumptions)).toEqual(shape43.valuation.scenarios.map((s) => s.assumptions));
  expect(view.appendix.missingData.some((g) => g.field === "presentation.legacyValuation.scenarioFloorSentence")).toBe(false);
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/report.scenarioPresentation.test.ts -t "floored|operating-scenario line"` (the pattern is a regular expression; `-t "floored"` alone would not run the control) — expected FAIL: `SCENARIO_TARGET_LABEL_LINE` is undefined, then `expected [ 'Targets are labeled by per-share value; a negative perturbed equity value is floored at zero. …', … ] to equal [ 'Targets are labeled by per-share value. No scenario is a future-price forecast.', … ]`. The withheld-target control passes at HEAD. `npx vitest run tests/report.legacyValuationNotes.test.ts -t "floor sentence"` fails on the first case.
- [ ] **Step 3: Implement** per Interfaces. First re-check `LEGACY_SCENARIO_FLOOR_LINE` against the exact line on the branch base (pre-flight P4). B4a Task 2 edits `scenarioPresentation.ts:195`, two lines above the floor line at `:197-199` (B13), so the exact-string match is taken from the base, never from this plan. The correction touches only that string in `valuation.scenarios[].assumptions` (code-written; no verification-log entry names it), so `splitCommonLines` still finds it common to the three scenarios on every surface (`sections.tsx:1085`, `markdown.ts:611`, `printHtml.ts:546`).
- [ ] **Step 4: Run it.** PASS. Re-run `npx vitest run tests/report.scenarioPresentation.test.ts tests/report.projectionAvailability.test.ts tests/report.researchReview.test.ts tests/report.templateAvailability.test.ts tests/degradation.report.test.ts tests/stageB.valuationD60.test.ts tests/report.legacyValuationNotes.test.ts tests/report.uiParity.test.ts`: unchanged (no test pins the old line; `grep -rn "floored at zero" tests src` then finds only the reinvestment-floor note, `valuation.ts:2901`/`:2993`, its payload pins and `LEGACY_SCENARIO_FLOOR_LINE`).
- [ ] **Step 5: Benefit check.** The probe's assertion (no published scenario line claims a zero floor) holds on the NVDA #50 replay (Task 29b applies `applyScenarioPresentation` to the stored #50 valuation with the after-run computed and counts lines matching `/floored at zero/`: 3 before, 0 after); its context assertion (the basis states the withhold rule) still holds. Stored reports: the correction applies to #46, #47, #48, #49, #50 and #52 (three lines each), and to live AMZN #52 (three floor lines; its basis states the withhold rule; pre-flight P7); not to #43, #42 or #38, whose bases say per-share was floored at 0, as it was when they were built (D-102, commit d2542f3, landed before spec 1.38.0). No figure, payload leaf or Stage B output moves (the line is written after the passes).
- [ ] **Step 6: Docs.** `docs/METHODOLOGY.md:2280-2284`: after "a perturbed target is withheld, not floored at zero", add that each scenario's assumption list ends with the per-share labelling line only, and that stored reports built from spec 1.38.0 whose line still mentions a floor are corrected at display. Task 17's paragraph on stored valuations gains the `scenarioFloorSentence` correction.
- [ ] **Step 7: Commit.** `git add src/report/scenarioPresentation.ts src/report/legacyValuationNotes.ts tests/report.scenarioPresentation.test.ts tests/report.legacyValuationNotes.test.ts docs/METHODOLOGY.md` then `git commit -m "Drop the zero-floor clause D-102 retired from the scenario target line (RPT-502)"`.

### Task 23b: Version stamps (B5b; delta on Task 23)

- [ ] **Step 1:** As Task 23, each stamp next after the preceding merge (B5a's, unless another batch merged between: Part B setup Step 6). Expected (pre-flight P3):

  | constant | after B5a (the branch base) | B5b | moved by |
  |---|---|---|---|
  | `REPORT_SPEC_VERSION` | 1.51.0 | 1.52.0 | — |
  | `PAYLOAD_VERSION` | 1.53.0 | 1.54.0 | — |
  | `STAGE_B_IMPLEMENTATION_VERSION` | `…_32` | `…_33` | — |
  | `FAIR_VALUE_METHOD_VERSION` | `FAIR_VALUE_2026_10_D135` | `FAIR_VALUE_2026_10_D137` | Task 16 changes a fair-value reason |
  | `SCENARIO_PATHS_METHOD_VERSION` | `SHARED_SCENARIO_PATHS_2026_10_D99` | `SHARED_SCENARIO_PATHS_2026_10_D137` | Task 7 changes the ceiling's input |
  | `PIPELINE_VERSION` | "stage-c-1.6.13" | "stage-c-1.6.14" | Task 20's judge-prompt line (decisions spec 2.15, C-8) |
  | `DCF_INPUTS_CONVENTION_SPEC` | — | "1.52.0", frozen | Task 17b |
  | `ANNUALIZATION_CONVENTION_SPEC` | "1.51.0" | stays | — |

  - `SCENARIO_TARGET_METHOD_VERSION` (B4a's `…_D135`) and `SCORE_BANDS_VERSION` do not move.
  - Each constant's comment names D-next and the B5b tasks.
  - The round-4 moves ride on these stamps, as the first draft recorded: Task 18 (STAGE_B_IMPLEMENTATION_VERSION, REPORT_SPEC_VERSION), Task 19 (STAGE_B_IMPLEMENTATION_VERSION), Task 20 (STAGE_B_IMPLEMENTATION_VERSION; PAYLOAD_VERSION for the projection line when a bound binds; REPORT_SPEC_VERSION for the two optional dispersion fields) and Task 21 (REPORT_SPEC_VERSION). Tasks 7b and 10b ride on STAGE_B_IMPLEMENTATION_VERSION.
  - FIN-506 moved to B6 (decisions spec 4.3): no stamp moves for it, and no constant comment names it.
  - The METHODOLOGY header (`:6-7`) moves the same way.
- [ ] **Step 2: Pins.**
  - `tests/report.versionStamps.test.ts`: as Task 23, plus `specVersionBefore(ANNUALIZATION_CONVENTION_SPEC, DCF_INPUTS_CONVENTION_SPEC) === true`, `specVersionBefore(REPORT_SPEC_VERSION, DCF_INPUTS_CONVENTION_SPEC) === false` and a pin `DCF_INPUTS_CONVENTION_SPEC === "1.52.0"`. B5a's assertions stay.
  - `tests/jobRunner.test.ts:6350` (spec) and `:6357` (`pipelineVersion` → "stage-c-1.6.14"), lines at B13. Re-check with `grep -rn "stage-c-1.6.13" tests src` that no other pin holds the old pipeline string.
  - `tests/stageB.dcfDomain.audit20261022.test.ts:117` (`fairValue.methodVersion`) → the new fair-value stamp.
  - `tests/fairValue.degradedInputs.test.ts:48`: leave as is, unless an assertion compares it with the constant (it is fixture data describing a D-102 fair value).
  - The payload pins and the restoration rows move in Task 24b.
  - Run as Task 23 Step 2, plus `npx vitest run tests/stageB.dcfDomain.audit20261022.test.ts`. Expected FAIL: the B5a values in place of the new ones.
- [ ] **Step 3-4:** As Task 23. Commit: `git add src/report/schema.ts src/pipeline/stageC/payload.ts src/pipeline/runInputSnapshot.ts src/pipeline/stageB/fairValue.ts src/pipeline/stageB/scenarioPaths.ts src/pipeline/jobRunner.ts src/report/legacyValuationNotes.ts docs/METHODOLOGY.md tests/report.versionStamps.test.ts tests/jobRunner.test.ts tests/stageB.dcfDomain.audit20261022.test.ts` then `git commit -m "Move report, payload, Stage B, pipeline, fair-value and scenario-path stamps for B5b (D-next)"`.

### Task 24b: Payload golden (B5b; delta on Task 24)

- [ ] As Task 24, with these deltas.
  - **Restoration rows (pre-flight P3).** The stamp rows (`:647-649` at B13) hold SCENARIO_TARGETS, FAIR_VALUE and SHARED_SCENARIO_PATHS, and B4a rewrote two of them to D135. B5b edits B4a's rows:
    - the FAIR_VALUE row's "now" string becomes `FAIR_VALUE_2026_10_D137`, restored to `FAIR_VALUE_2026_07`;
    - the SHARED_SCENARIO_PATHS row's becomes `SHARED_SCENARIO_PATHS_2026_10_D137`, restored to `SHARED_SCENARIO_PATHS_2026_10_D60` (the convention D-102 followed);
    - the SCENARIO_TARGETS row is untouched.
  - **Changed lines allowed.** Each is allowed only where the fixture triggers it; record which.
    - the payload version string and the two method stamps;
    - the current-capital window wording (Task 5);
    - a withheld latest-YoY row (Task 13, only if the fixture's newest year lacks revenue);
    - the year-one reinvestment, FCFF and every figure after them (Task 7b, only if the fixture's trailing net capex binds);
    - the ERP's "dated reference … vintage" text (Task 10b, `returns.ts:1066` at B13, only if the fixture prints it);
    - round 4's items, as the first draft listed them:
      - the reverse note's margin-family wording and the "reverse-DCF implied terminal margin" figure (Task 18, only if the fixture's reverse DCF takes the margin method);
      - the year-one tax rate, its basis and the figures after it (Task 19, only if the fixture's TTM carries a tagged one-off the margin seed removes);
      - the "Bull/bear shift" projection note, scenario basis line 1 and the dispersion record's two uncapped fields (Task 20, only if a σ bound binds on the fixture's history).
  - Task 21's line is written after the passes and does not reach the payload. Task 20's judge-framing line is not part of `serializePayloadForPrompt`'s output, so `promptBytes` does not move for it. Anything else is a defect.
  - Re-pin comment: "2026-10-29 B5b (D-next): payload 1.54.0, next after the preceding merge; method stamps FAIR_VALUE and SHARED_SCENARIO_PATHS D137; current-capital window start (FIN-113)". Follow it with the clauses Step 3 found: "year-one reinvestment front-loaded (pre-flight R6)", "ERP fallback refreshed (pre-flight R7)", "reverse margin solve on the shifted base margin path (FIN-501)", "tax seed re-read without the tagged one-off (FIN-502)" and "σ bound named beside the shock (FIN-512)". Give the exact before/after from the branch-base run.
- [ ] Commit: `git add tests/stageC.payload.passes.test.ts` then `git commit -m "Re-pin the payload golden for B5b's DCF inputs (payload 1.54.0)"`.

### Task 25b: Audited fixture deltas (B5b; delta on Task 25)

- [ ] As Task 25, on B5a's `audit-intended-deltas.json`, with group `audit-b5b-dcf-inputs-one-basis-20261027`.
  - Expected leaves:
    - the spec and payload versions, and the `FAIR_VALUE_*` and `SHARED_SCENARIO_PATHS_*` stamps;
    - additive leaves from new fields: `capital.current.periodStartBasis`, `growth.revenueAcceleration.latestYoyEndDate`, `roicHistory` / `RoicYear.terminalEvidenceRoicPct` and `trailingNetCapex`.
  - The current-capital `periodStart` should equal the base's for DEMO's calendar quarters (the day after the fifth quarter's end is the calendar-year-before date).
  - Task 7b moves DEMO's year-one reinvestment only if its trailing net capex binds. Task 10b moves DEMO's figures only if DEMO's ERP is the static fallback. Record and trace either.
  - Round 4 (amended 2026-10-28): Tasks 18–21 are expected to move no DEMO leaf. DEMO computes no reverse DCF (stored #51: "Reverse DCF not computed"), tags no one-off, publishes no scenario dispersion (stored #51: `dispersion` null) and withholds its per-share targets, so it prints the operating-scenario line, not the one Task 21 changes (the audited fixture's scenario interpretation already reads "per-share scenario targets are withheld", `tests/fixtures/audit-intended-deltas.json:8967`, `:8894` at B13). A DEMO leaf moved by Tasks 18–21 is a defect.
  - Reason: "B5b: one operating income and tax seed (with the recurrence guard), the debt leg on the weighted balance, the terminal operating-loss rule, the transition-period filter, the reverse margin family and domain, the year-one reinvestment front-load, the refreshed ERP fallback, label and disclosure corrections".
- [ ] Commit: `git add tests/fixtures/audit-intended-deltas.json` then `git commit -m "Record B5b's intended fixture deltas"`.

### Task 26b: CHANGELOG (B5b; delta on Task 26)

- [ ] Entry `## Unreleased - DCF inputs on one basis (B5b, 2026-10-27)`, with plain-English bullets per Part B task.
  - Task 7b: year one's reinvestment is at least the capital the company already spends, recovered later; the total is unchanged.
  - Task 10b: the ERP fallback is Damodaran's 4.20% of October 1, 2026.
  - The round-4 bullets (amended 2026-10-28): the reverse DCF's price-implied terminal margin is solved on the base margin path itself, so a price at the model value reads as the base margin and the margin trigger points the right way (Task 18); a tagged one-off the margin seed leaves out no longer sets year one's tax rate (Task 19); the scenario text says when a growth or margin shock is the house bound rather than the issuer's own sample σ, and gives the sample σ (Task 20); the scenario line no longer says a negative perturbed value is floored at zero, a rule D-102 retired (Task 21); stored reports gain the matching notes and one display correction.
  - No FIN-506 bullet: it moved to B6 (decisions spec 4.3), whose CHANGELOG entry carries it.
  - Final bullet: "Report 1.52.0, payload 1.54.0, Stage B ACCOUNTING_EVIDENCE_33, fair-value and scenario-path stamps D137, pipeline stage-c-1.6.14 (next after the preceding merge; D-next; renumbered at merge)."
  - The header sentence at `CHANGELOG.md:9-10` moves again.
- [ ] Commit with Task 27b.

### Task 27b: DECISIONS entry (B5b; delta on Task 27)

- [ ] **Step 1:** One entry after B5a's (expected D-137, next after the preceding merge): `## D-next - Audit B5b (2026-10-27): DCF inputs on one basis`.
  - **Gate:** write it only after Task 29b's rows E2, E3, E4 and E6 and Step D checks 1 and 2 have run and passed; otherwise it waits for the main session.
  - **Owner decisions:** one bullet per OD-2 to OD-9, with the choice, the alternatives rejected, the sources (URLs above) and the recorded decision each revises: D-99 finding 9 (operating-loss year, terminal rule only); the 2026-09-06 F109 stub rule; D-60's debt leg, extended; D-111 F-13's member list; D-98's tag list, extended to coverage, terminal evidence and fade; METHODOLOGY:259's vendor-first precedence on a loss.
  - **The recurrence rule (pre-flight R3), as a house rule.** A D-98 tag family present in 3 or more of the last 5 fiscal years is a recurring operating cost. It is not added back in the history margins (and the ceiling's history) or the terminal evidence, it is counted per family, and the basis names it.
    - Its threshold: 3 or more of the last 5 fiscal years.
    - Its source: McKinsey's "not expected to recur" (OD-7) and the pre-flight's census measurement.
    - E6's result: the families and years it found, and CAT's named FY2022 tag with its filed amount, or the recorded residual.
  - **Year-one reinvestment (pre-flight R6).** The front-load to the trailing net capital spending, recovered later, with the total and terminal unchanged and the `includeLeasesInEv` lower bound. The additive floor is rejected (it counts capital twice), and guided capex parsing is routed to the data batch.
  - **ERP fallback (pre-flight R7).** Refreshed to 4.20% as of 2026-10-01 (Damodaran's home page), with 210 days kept as the hand-refresh window; the monthly fetch is routed to D2.
  - **Scope extensions E2-E4,** each "confirmed by the main session (decisions spec 4.3, 2026-10-28) on its replay evidence", with that evidence in one clause (Task 29 rows E2-E4):
    - E2: the transition period withheld from the DCF history, sales-to-capital and ROIC series (OD-3, Task 12);
    - E3: the reverse-DCF root and margin solve restricted to the in-domain scan run (FIN-104, Task 15);
    - E4: the forward-label rule (OD-5, Task 14).
  - **The house-threshold backtest for the stub line and the 0.75-year latest-YoY span** (Task 29 Step D checks 1-2), with the sample, distribution and result, as Task 27's bullet does. The stub line is under 357 days after the Step 0 gate (decisions spec 4.5, O-2), or 329 days if the gate failed.
  - **O-2,** as the first draft wrote it: The stub line was raised from the first draft's 0.9 year (329 days) to 357 days under decisions spec 4.5, on the gate's evidence (no census or keyed-snapshot fiscal year under 357 days; the counts from `thresholds-gate.json`). It revises this plan's OD-3 line, with 17 CFR 240.13a-10, Regulation S-X Rule 3-06 and 26 CFR 1.441-2(a)(1) as sources. On a failed gate, this bullet instead records the line kept at 329 days and the census year that kept it. State the residual the backtest cannot remove. The census files no transition period, so the line is tested only against full years. 17 CFR 240.13a-10 allows a transition period of up to just under twelve months, so one of 51 weeks or more (357 to about 364 days) still passes the 357-day line as a fiscal year. At 329 days, if the gate failed, that range would run from about 10.8 months.
  - **Round 4:** a bullet for OD-11 (FIN-501: the reverse margin solve on the base margin path shifted by (m − base terminal) × the base fade weights; extends D-58's "the family contains the base path"; revises METHODOLOGY's "margin fade over the full explicit horizon"; the base-shape family rejected only as a construction, being numerically identical on every builder path) and one for OD-12 (FIN-502: the tax seed re-read without the tagged one-off, the company median held between the no-tax-effect and marginal-rate readings, else the marginal-rate reading; extends D-98 to the tax seed; the plain median and the zero-tax add-back rejected), each with its sources. Record that FIN-512 and RPT-502 needed no owner decision; that PIPELINE_VERSION moves for one judge-prompt line (decisions spec section 2.15); and that FIN-506, planned here in round 4, moved to B6 (decisions spec 4.3) and is recorded in B6's D-next entry, not this one.
  - **State:** no rule names a ticker; stored reports keep their bytes (D-67) and get Task 17b's and Tasks 18-21's notes; SR 11-7 is cited as superseded by SR 26-2 (April 2026).
  - **The version line:** report 1.52.0, payload 1.54.0, Stage B `…_33`, FAIR_VALUE and SHARED_SCENARIO_PATHS `…_D137` and PIPELINE `stage-c-1.6.14`, each next after the preceding merge, and the frozen `DCF_INPUTS_CONVENTION_SPEC` "1.52.0".
- [ ] **Step 2:** Commit: `git add CHANGELOG.md docs/audit/DECISIONS.md` then `git commit -m "Record B5b's decisions (D-next) and changelog"`.

### Task 28b: The disposition note's B5b part (delta on Task 28)

- [ ] **Step 1:** Add the B5b part to `docs/audit/2026-10-27-audit-b5-seasonality-calendars-dcf-inputs.md`, after B5a's. It holds:
  - a table of B5b's 18 findings (the 14 first planned, and round 4's FIN-501, FIN-502, FIN-512 and RPT-502), with id, severity and disposition (fixed in Task N, with the commit);
  - one line saying FIN-506 was planned here in round 4 and moved to B6 by the main session (decisions spec 4.3), where it is fixed (B6 Task 5A; B6's disposition note);
  - FIN-502's recorded difference: the probe's one-decimal pin on the clean TTM rate is missed by 0.0026pp, by design (OD-12);
  - FIN-114's "no stored report affected" note;
  - Task 29b's replay table, with Task 7b's rows (it binds on 7 of 31 published DCFs) and Task 10b's keyless WACC moves;
  - **Scope extensions:** rows E2-E4 (Tasks 12, 15 and 14), as Task 28 describes E1; and row E6 (pre-flight R3), with the recurring families found and CAT's named FY2022 tag, or the residual;
  - **House-threshold backtest (B5b part):** Step D checks 1a, 1b and 2, copied from `b5-evidence\out\thresholds-gate.json` and `thresholds.json`. Then the line the gate set (357 days, or 329 if it failed) and the residual stated in Task 27b, with 17 CFR 240.13a-10 as its source: the census has no transition period, and one of 51 weeks or more would pass as a year;
  - residual risks: the recurrence threshold; a capex spike, or D&A below economic depreciation, moves capital earlier; the ERP deadline and D2's fetch; (e) routed to B6; VAL-6 routed to B5c.
- [ ] **Step 2:** Copy this plan again from the main checkout so the committed copy matches; both files are registered already (Task 28). `npx vitest run tests/repository.release.test.ts tests/docs.lint.test.ts`: PASS.
- [ ] **Step 3:** Commit: `git add docs/audit/2026-10-27-audit-b5-seasonality-calendars-dcf-inputs.md docs/superpowers/plans/2026-10-27-audit-fix-05-seasonality-calendars-and-dcf-inputs.md` then `git commit -m "Record B5b in the disposition note"`.

### Task 29b: Before/after replay proof (B5b; delta on Task 29)

- **Inputs:** Task 29's, with the same harness (`b5-evidence\`, Part B setup Step 5). Outputs go in `b5-evidence\out-b5b\<label>\`.
- [ ] **Step A:** As Task 29 Step A, on the B5b branch base (main after B5a), label `base`, before any code change.
- [ ] **Step B:** After Task 21, run `after` and fill the table. These are B5b's rows. Every "before" cell is the branch-base run's, and the values shown are provenance at `6542531` or B13:

| report (snapshot) | figure | stored | before (branch base, after B5a) | after (expected; re-taken) | expected cause |
|---|---|---|---|---|---|
| MU #46 | current-capital start | 2025-09-04 | (record) | 2025-08-29 | Task 5 |
| NVDA #50 | current-capital start | 2025-07-27 | (record) | 2025-07-28 | Task 5 |
| NVDA #48, #49 | current-capital start | (record) | (record) | (record) | Task 5 |
| BA, MU #46 (loss years) | terminal ROIC | — | (record) | unchanged: already held at WACC (the pre-flight found Task 6 moves nothing in the census) | Task 6 |
| keyed inputs and census issuers with a tagged one-off | WACC, rating, terminal ROIC, margin target, per share | (record) | (record) | moves only where a non-recurring tagged one-off is named (E6) | Task 7 (R3) |
| CAT census | DCF per share | — | (record; 245.67 at B13) | ≈269.07 at B13 (+9.53%), only if E6 names its FY2022 one-off; else main's FY2022 ceiling row and a recorded residual | Task 7 (R3) |
| JNJ, PEP, CVX census | DCF per share, regime | — | (record) | unchanged unless E6's per-family count lets one move (then named and explained before merge) | Task 7 (R3) |
| AMZN #43 | DCF per share | (record) | (record) | ≈ −0.52 (−0.62%) at B13 | Task 7b (R6) |
| AMZN keyless census | DCF per share | — | (record) | ≈ −0.70 (−0.71%) at B13 | Task 7b |
| AMZN #51, #52 | DCF per share; year-one FCFF | (record) | (record) | ≈ −0.34 a share after B4a (−0.23 at B13); FCFF +10.74B → about −15.9B (the issuer's TTM FCF is −7.6B) | Task 7b |
| GOOGL, WMT, MSFT census | DCF per share | — | (record) | ≈ −0.24 (−0.11%), −0.05 (−0.11%) and −0.05 (−0.02%) at B13 | Task 7b |
| NVDA, AAPL, CAT, CVX, MU #46 and every other published DCF | year-one reinvestment | (record) | (record) | unchanged: net capex below the need (NVDA 3.67B against 132.64B) | Task 7b |
| every input | total explicit-horizon reinvestment; terminal value | (record) | (record) | unchanged (asserted) | Task 7b |
| every keyless input | cost of equity; DCF per share | — | (record) | cost of equity +0.02pp × beta; per share about −0.2% to −0.4% (the pre-flight's analytic estimate) | Task 10b (R7) |
| keyed inputs | ERP and its reference text | (record) | (record) | figures unchanged; the reference text names the 2026-10-01 vintage where it is printed | Task 10b |
| AMZN #43 | reverse-DCF bound / per share at bound | none (spec 1.33.0 inferred no outside range) | (record; 60% / 165.41 at `6542531`) | (record; 35% / 114.73 at `6542531`) | Task 15 |
| AMZN #43 | degraded-inputs reason | none (predates D-111) | (record; SPY and market-cap history named at `6542531`) | (record; expected none) | Task 16 |
| all keyed inputs | reverse-DCF method / root | (record) | (record) | (record; a move only where a base-run bracket lay outside the domain) | Task 15 |
| AMZN #43 | reverse-DCF implied terminal margin (margin fallback) | 52.30% (flat base, like for like) | (record; 48.68% at `6542531`, on a non-flat base, 12.08% → 14.03% by year 5) | (record; on `6542531`'s assumptions the shifted family gives 42.09%) | Task 18 |
| every input whose reverse takes the margin method | solve at price = its own model value | — | (record) | its base terminal margin within 0.05pp (asserted) | Task 18 |
| all keyed inputs | year-one tax rate and basis | (record) | (record) | unchanged unless the margin seed removes a tagged one-off (then the re-read, named in the basis) | Task 19 |
| MU #46, NVDA #48–50 | scenario basis line 1, projection "Bull/bear shift" line, dispersion record | "sample σ"; 25 / 12, no uncapped fields | (record) | the cap clauses with the sample σ (NVDA 46.12pp / 15.88pp; MU recorded) and `uncapped…SigmaPp` present; shocks equal the branch-base run's, and targets the run before Task 20 (pre-flight P2: no literal) | Task 20 |
| NVDA #50 (stored valuation through `applyScenarioPresentation` with the after-run computed) | scenario lines matching `/floored at zero/` | 3 | 3 | 0 | Task 21 |

  The scan of the 51 stored reports and the two live extracts through `withLegacyValuationNotes` must then give exactly the list below. Both parts' rows count, since B5a is on `main`.
  - #43: `guidedTimesFour`, `terminalYearSkipped`.
  - #46: `quarterLength`, `currentCapitalStart`, `sigmaCap`, `scenarioFloorSentence`.
  - #47, #49, #50 and #52: `fiscalYearEnd`, `guidedFloorTimesFour`, `sigmaCap`, `scenarioFloorSentence`.
  - #48: `fiscalYearEnd`, `guidedFloorTimesFour`, `currentCapitalStart`, `sigmaCap`, `scenarioFloorSentence`.
  - Live AMZN #52: `guidedFloorTimesFour` and `scenarioFloorSentence`. Its σ (10.38 / 3.07) is inside both bounds, so it gets no `sigmaCap`.
  - Live #51: recorded.
  - Every other report: nothing, #21 included. `reverseMarginFamily` and `taxSeedOneOff` fire on none; #43, #42 and #38 keep their floor sentence, which their bases state; and #21's `impliedReturnShareBasis` note is B6 Task 5A's.

  Must not move (assert in the proof script): every WACC, synthetic rating, ERP and its label on 43–50, unless that snapshot carries a Task 7 tagged one-off, in which case the move is recorded and traced to Task 7; terminal ROIC on 43–50 (no operating-loss year, no tagged one-off in the window unless the new labels name one); scores and grades on 43–50 except through the reverse-DCF bound (which must stay at the band floor); the ROIC series and sales-to-capital on 43–50 (no transition period, Task 12); every growth-method reverse figure on 43–50 through Task 18; every scenario shock and target on 43–50 through Tasks 20–21; DEMO's valuation figures. Any other moved figure is traced to a task before Task 25 is written, or it is a defect. The payload golden's AAPL-shaped fixture is not a replay input; its Task 2 move is recorded in Task 24. In B5b two more causes are allowed, each recorded: a keyless cost of equity moves through Task 10b (+0.02pp × beta), and a per share moves through Task 7b's front-load where it binds. Here "Task 25" reads Task 25b.

  The script also records three things for the disposition note:
- which of 43–50 carry a Task 7 tagged one-off in the coverage, terminal or fade window, and the coverage ratio and synthetic rating before and after for each;
- each snapshot's `latestYoyEndDate` (Task 13) against its newest annual row;
- the WACC tax-rate source and value (Task 11), asserted unchanged on every snapshot;
- (round 4) which of 43–50 have a margin seed that removes a tagged one-off, with year one's tax rate before and after (Task 19), and which take the margin method in the reverse DCF (Task 18).
- [ ] **Step C:** Task 29 Step C's B5b rows, on B5b's branch, with the same harness, capture and pass conditions: E6 (`t06` against `t07`), E2 (`t11` against `t12`), E4 (`t13` against `t14`, with the in-memory `HD-annual-base` copy) and E3 (`t14` against `t15`). A row that does not hold leaves its extension or rule unconfirmed: stop before Task 27b and report it to the main session.
- [ ] **Step D:** Task 29 Step D's checks 1a (run as Task 12 Step 0, before Task 12's test), 1b and 2 (after Task 12, before Task 27b), from `thresholds.mts`, on the same period sets.
- [ ] **Step E:** No commit; the tables go into the disposition note (Task 28b) and the PR.

### Task 30b: npm run verify, in foreground chunks (B5b)

- [ ] As Task 30, in a clean worktree of `fix/dcf-inputs-on-one-basis`.
  - Before the chunks, run Part B's new files on their own, as the first draft's round-4 step did: `npx vitest run tests/stageB.terminalOperatingLoss.test.ts tests/stageB.oneOperatingIncome.test.ts tests/stageB.reinvestmentFrontLoad.test.ts tests/stageB.waccDebtLeg.test.ts tests/stageB.transitionPeriod.test.ts tests/stageB.latestYoy.test.ts tests/stageB.projectionHistoryLabels.test.ts tests/stageB.reverseMarginFamily.test.ts tests/stageB.taxSeedOneOff.test.ts tests/stageB.scenarioSigmaCap.test.ts tests/report.scenarioPresentation.test.ts tests/report.legacyValuationNotes.test.ts`. FIN-506's test file moved to B6 with its task.
  - Also run the `tests/jobRunner.test.ts` case that pins `pipelineVersion` (`-t "runs all steps in order, logs cost, persists the report"`, foreground; it is slow under load).
  - Coverage: `src/report/legacyValuationNotes.ts` keeps the risk floors after Task 17b and Tasks 18-21, and the edited `valuation.ts`, `returns.ts`, `growth.ts`, `unusualItems.ts` and `projections.ts` keep theirs.

### Task 31b: Fresh-reviewer pass (B5b)

- [ ] As Task 31, over B5b's diff and its 18 findings (the 14 first planned, and round 4's FIN-501, FIN-502, FIN-512 and RPT-502). Ask the first draft's questions:
  - does any test assert less than the probe did (FIN-502's recorded 0.0026pp difference is the one known case, OD-12);
  - are Review Focus items 2 (Task 12's half), 6, 7 and 8 tested (item 9 moved to B6);
  - does the diff contain no FIN-506 code: no `ExcessReturnInputs.price`, no `reverseSolve.basis` and no `impliedReturnShareBasis` row;
  - does the reverse margin family contain the base path for every base path the builder produces;
  - is PIPELINE_VERSION moved for the judge-prompt line;
  - are E2-E4 and E6 backed by Task 29b's rows, each on its own commit pair;
  - does the stub line in code, tests and METHODOLOGY equal the one `thresholds-gate.json` records (decisions spec 4.5, O-2).

  And the pre-flight's merge gate:
  - is a tag family filed in 3 or more of the last 5 fiscal years left in and named, and is every E6 move named (R3);
  - does Task 7b leave total explicit reinvestment and the terminal value unchanged on every input (R6);
  - does every B5b row use `DCF_INPUTS_CONVENTION_SPEC`;
  - does Task 10b keep the 210-day fail-closed window (R7).

  Tell the reviewer to exclude `*.db*` from every recursive grep.

### Task 32b: Pull request (B5b)

- [ ] As Task 32 (rebase on `origin/main`, renumber, rerun), titled for B5b. Description outline, plain English:
  1. What was wrong:
     - some DCF inputs read a different operating income, debt balance or tax rule than the rest of the DCF, and a few labels and notes said the wrong thing;
     - from round 4: the reverse DCF's "margin the price needs" was solved on a different margin path from the base case; a one-off impairment the margin left out still raised year one's tax rate; the scenario text called a capped shock "sample σ"; and every scenario said a negative value is floored at zero;
     - from the pre-flight: year one's reinvestment could sit far below the capital the company was already spending (Amazon's year-one cash flow read +10.7B against a TTM free cash flow of −7.6B), and the ERP fallback was about to expire.
  2. What changed, one line per task, and the owner decisions taken on your behalf (OD-2 to OD-9, OD-11 and OD-12, and the recurrence house rule), with one source each; and that FIN-506 moved to B6 (decisions spec 4.3).
  3. The before/after table from Task 29b, rows E2-E4 and E6, and Step D checks 1-2 in one line per threshold.
  4. Stored reports: unchanged bytes; what notes and corrections now appear on them.
  5. Left for later / residual risks, and that FIN-114 affects no stored report.
     - Include the stub line the Step 0 gate set (357 days under decisions spec 4.5, or 329), and the backtest's residual: the census has no transition period, and one of 51 weeks or more would still pass as a fiscal year.
     - Also say what was routed out: (e) to B6; VAL-6 to B5c, which reads Task 7's ceiling rule; the ERP fetch to D2; guided capex to the data batch.
  6. The attribution lines from the session reminder.

## Self-review against the spec

**Finding coverage (21 of 21; none skipped, none disputed; round 4 adds 4 of 4; FIN-506 moved to B6 on 2026-10-28, decisions spec 4.3).** Each was re-read at HEAD 6542531 against its probe's construction and the code it names; the probes were not run (several rewrite evidence logs). Pre-flight split (2026-10-29): Part A (B5a) covers FIN-301, FIN-301-V3, FIN-101, FIN-301-V1, FIN-101-V2, FIN-301-V2 and FIN-101-V1. Every other row is Part B (B5b). Display rules are Task 17's (B5a) or Task 17b's (B5b).

| finding | task(s) | stored reports |
|---|---|---|
| FIN-301 | 1 (and `interestRunRate`) | `quarterLength` note on #46 (17) |
| FIN-301-V3 | 2 | `fiscalYearEnd` note on #47, #48, #49, #50, #52 (17) |
| FIN-101, FIN-301-V1, FIN-101-V2, FIN-301-V2 | 3 (amended, pre-flight R1) | `guidedTimesFour` note on #43; `guidedFloorTimesFour` on #47, #48, #49, #50, #52 and live AMZN #52 (17) |
| FIN-101-V1 | 4 (amended, R2); 3b (R4) | `guidedFloorTimesFour` covers the stored consistency text (17); the context row and caveats reach new reports only |
| FIN-113 | 5 | display-only correction on #46 and #48 (17b); the capital-grading claim text keeps its stored wording so its verification mark survives |
| FIN-102 | 6 | `terminalYearSkipped` note on #43 (17b) |
| FIN-402, FIN-402-V1, FIN-402-V2 | 7 (with the recurrence guard and the ceiling rule, R3; census row E6) | no display rule: a stored report records neither the coverage EBIT nor the fade's yearly margins. Task 29 lists which of 43–50 carry a tagged one-off in their window, and the disposition note names them |
| FIN-116 | 8 | `newBorrower` rule (17b); fires on no stored report (every stored WACC carries a debt weight); tested on a synthetic report |
| FIN-115 | 9 | none (label only) |
| FIN-114 | 10 | none affected (every labelled stored report is a US issuer, Task 17b) |
| FIN-406 | 11 | none expected: every snapshot issuer had a positive TTM pre-tax income. Task 29 asserts the WACC's tax basis is unchanged on 43–50 |
| FIN-111 | 12 (projection base, DCF income history and sales-to-capital, ROIC series; the 357-day line set by the Step 0 gate, decisions spec 4.5 O-2) | none: no stored report's annual `periodContext` spans under 357 days. All 51 stored reports were scanned on 2026-10-27 for the 329-day line and re-scanned on 2026-10-28 for 357: 11 `fiscal-year` contexts, none shorter. Task 29 asserts the ROIC series and sales-to-capital unchanged on 43–50 |
| FIN-405 | 13 | none expected. Task 29 compares each snapshot's `latestYoyEndDate` with its newest annual row and lists any mismatch in the disposition note |
| FIN-127 | 14 | none: no stored issuer (AAPL, MSFT, GOOGL, INTU, JPM, PYPL, NOW, CCJ, TLN, VST, LEU, CEG, NVDA, META, LYFT, NRDS, SPCX, LLY, SCHW, AMZN, MU, DEMO) has an early-January year end or names its fiscal year by the start year |
| FIN-104 | 15 | `reverseRangeEnd` rule (17b); fires on no stored report (#43 at spec 1.33.0 inferred no outside range); tested on a synthetic report |
| FIN-118 | 16 | display-only correction rule (17b); changes no stored report (the only stored degraded-inputs reason, #51 DEMO, names no keyless member); tested on a synthetic report |
| FIN-501 (round 4) | 18 | `reverseMarginFamily` note (18); fires on no stored report (#43, the only stored margin-method report with a margin row, had a flat base the old family contains); tested on a synthetic report |
| FIN-502 (round 4) | 19 | `taxSeedOneOff` note (19); fires on no stored report (none removed a tagged one-off from its margin seed); tested on a synthetic report |
| FIN-512 (round 4) | 20 | `sigmaCap` note (20) on #46, #47, #48, #49, #50, #52 (all store 25 / 12) |
| RPT-502 (round 4) | 21 | display-only `scenarioFloorSentence` correction (21) on #46, #47, #48, #49, #50, #52; not #43, #42, #38, whose bases state the floor rule they were built under |
| FIN-506 (round 4; moved) | 22 (tombstone) | moved to B6 Task 5A by decisions spec 4.3; its `impliedReturnShareBasis` note (#21 only) is built there |

Pre-flight additions with no finding of their own (2026-10-29): Task 3b (calendar-shifted events disclosed beside the guided pace; REPORT52 item 4, F-03; B5a), Task 7b (year-one reinvestment front-loaded to the trailing net capital spending; REPORT52 F-06; B5b) and Task 10b (the ERP fallback refreshed by hand; B5b). Routed out: (e) BAC's trailing return to B6, VAL-6 to B5c, the ERP fetch to D2 and guided capex parsing to the data batch (Global Constraints, cross-batch).

**Recommended default 5, as applied.** Followed: 14-week quarters and 53-week periods go to 13-week and 52-week bases; consensus counts as consistent only on the issuer's own fiscal calendar (twelve months against twelve months, Task 3; windows dated by the weekday rule, Task 2); stored MU #46 gets a display-time note (Task 17). Refined: below eight quarters this plan uses the TTM at the guided pace; otherwise the guided quarter is taken out of its growth-adjusted season (Task 3, R1). "Withhold the guided pace when the quarter is not seasonally representative" becomes: guidance without the same quarter a year earlier sets no level, and the sequential pace is evidence only. The D-58 run-rate is kept, not withheld: its centre is already the TTM at the year-over-year pace (seasonally neutral), and its × 4 bound is put on a 13-week basis.

**FIN-402 decided by research.** D-98's tag list applies to the synthetic rating's interest coverage (OD-7, S&P and McKinsey sources), and by the same reasoning to the terminal evidence and the margin fade, so one DCF reads one operating income. The reported ROIC and the moat grade stay GAAP.

**Format.** Header (Goal, Architecture, Tech Stack, Spec, Branch); Global Constraints; owner decisions OD-1 to OD-9 each with question or decision, rejected alternatives, the recorded decision revised and 1–4 sources with URL and passage (OD-10 records the R1–R4 scope); Review Focus with five input classes, each tied to a named test in its owning task (Tasks 1, 2 and 12, 1, 3, 17), and three round-4 classes (Tasks 18, 19, 21; item 9 moved to B6 with FIN-506); Tasks 1–21 each with Files, Interfaces and Steps 1–7, Task 22 a tombstone for FIN-506's move; batch Tasks 23–32 as the spec lists them; owner decisions OD-11 and OD-12 for the round-4 findings that named one. The pre-flight (2026-10-29) splits the plan into Part A (B5a) and Part B (B5b), adds Tasks 3b, 7b, 10b and 17b, and writes Part B's batch tasks 23b-32b as deltas on 23-32.

**Conventions.**
- Every root-cause task starts from a failing test built from the finding's probe and keeps its control case.
- No rule keys on a ticker: lengths, weekday rules, tags and dates do. Ticker names appear only as fixture shapes.
- One commit per task, staged by name.
- Fixtures are synthetic or trimmed from SEC data; proof outputs stay in git-ignored `tmp/`.
- METHODOLOGY.md is staged in every task that changes a meaning.
- Re-pinned tests (`stageB.dcfAnchoring`, `stageB.guidanceComparability`, `fairValue.degradedInputs`, the literal stamp pins Task 23 lists, and the payload golden in Task 24; `stageB.waccPriorYearCostOfDebt` and `stageB.growth.returns.capital` only if a fixture carries a tagged one-off or a stub year) each assert the corrected value with its cause, and none is loosened.
- The Next.js guides are named for the two React files touched (Tasks 14 and 17).
- Stamps (Task 23) add `FAIR_VALUE_METHOD_VERSION` (Task 16 changes a fair-value reason) and `SCENARIO_PATHS_METHOD_VERSION` (Task 7 changes the ceiling's input) to REPORT.md's three. Round 4 adds `PIPELINE_VERSION` (Task 20 changes one line of the judge's prompt; decisions spec section 2.15). `SCORE_BANDS_VERSION` and `SCENARIO_TARGET_METHOD_VERSION` stay, because no band or target method changes.

**Open risks, carried to the PR.**
- The house thresholds are backtested only on the 45 census issuers' filed periods and the five keyed snapshots (Task 29 Step D; decisions spec 4.3). Under decisions spec 4.5 (O-2), the stub line is 357 days when the Step 0 gate passes, as the pre-scan expects. The census files no transition period, so the line is tested only against full years. A transition period of 51 weeks or more (357 days to just under twelve months, which 17 CFR 240.13a-10 allows) would still pass as a fiscal year; at 329 days, after a failed gate, that range would start at about 10.8 months. The 10-day snap is checked against two vendor-style date conventions and the five keyed snapshots' real FMP estimate dates, not against every vendor.
- The new consistency floor is looser for fast growers (stated in OD-1).
- REPORT.md suggests a fourth audit round on domain A before B1–B5 ship.
- B3, B4, B6, B9, B10 and B12 edit the same files; rebase and renumber at merge.
- The `≈` values in Tasks 29 and 29b are hand, probe and pre-flight computations, at `6542531` or B13. The run measures the real ones on the branch base, and any gap is traced before Task 25 (25b).
- (Pre-flight R1) The seasonal factor reads a one-off quarter in the year-ago window (an acquisition closing, a commodity spike) as season; the mean of up to three yearly factors limits this. A calendar-shifted event sits inside the factor, and Task 3b discloses it. Keyed bundles with fewer than eleven quarters take TTM × (1 + g).
- (Pre-flight R4) The issuer's ex-event pace is disclosed, not applied: a timing-versus-persistent classifier must come first (AMZN's option: 869.44B, +7.22%).
- (Pre-flight R3) The recurrence threshold (3 or more of the last 5 fiscal years, per family) is a house rule; E6 records the families it finds. CAT's ceiling move depends on naming its FY2022 tag.
- (Pre-flight R6) A one-off capex spike, or D&A below economic depreciation, moves capital earlier (at most −0.71% in the census). Under `includeLeasesInEv` the trailing net capital spending is a lower bound.
- (Pre-flight R7) The ERP fallback is refreshed by hand. If B5b slips past 2027-01-15, Task 10b ships alone; the monthly fetch is D2's.
- Two passages were confirmed from indexed text, not the page itself: S&P and McKinsey in OD-7 (both returned 403 to the reviewer). SR 11-7 is superseded by SR 26-2 (the reviewer's fetch of SR 11-7 returned 404); OD-6 now rests on D-111 and SR 26-2.
- A 53-week fiscal year still enters annual growth figures (revenue CAGR, the margin history) at its filed length; only the run-rate, the TTM and the base period are length-normalised.
- A guided-quarter operating margin still sets year one's margin seed with no seasonal check (Task 3 changes only the revenue level).
- The D-58 run-rate bound, now on a 13-week basis, still caps a trough-quarter run-rate at the TTM (OD-1 trade-off).
- (Round 4) OD-12's range assumes a deductible one-off was tax-effected at the marginal floor (statutory, else 15%); a foreign or state rate above it leaves the true rate slightly outside the range, and the median is then held at the nearer end. The McKinsey passage behind the r1 end was read through course slides, not the book (403).
- (Round 4) OD-11's family equals the base-shape family on every path the builder makes today; if a later margin rule builds a different base shape, the shifted family still contains it, but the reverse note's "by year 5" wording assumes the base fade's own length (`MARGIN_FADE_YEARS`).
- (Round 4) FIN-512's display note keys on stored σ values equal to the caps (25 and 12); a stored sample σ that happened to equal a cap exactly would get the note too.
- The guidance comparability guard (`valuation.ts:1449-1463`) is put on a 13-week basis but is still not seasonal: the guided quarter's range × 4 is compared with the same release's annual range, so a holiday quarter can trip the guard, or a trough quarter miss it, for reasons of season alone.
- Forward fiscal-year labels for an issuer that names its fiscal year by the start year still follow `forecastYearPeriod` (D-65); Task 14 only makes the history and forward labels agree in basis.

## Review notes

Independent review of this plan, 2026-10-27, at HEAD 6542531. The reviewer read every finding's probe and the code each task names and recomputed the plan's figures by hand and with node. It ran no probe, no server, no test suite and no market-data, EDGAR-data or AI-provider call, and opened no `*.db*` file. Sources were re-fetched where the page allowed; a passage the reviewer could not reach is marked. All 21 findings still hold at HEAD, and each has a task.

**Changes made (major).**
1. Task 3 would have broken `tests/stageB.guidanceComparability.test.ts`, which pins `guidedRunRate` and the anchor basis, and the plan did not list it. Its re-pins are now stated: `guidedYearAgo` `{ date: "2025-09-30", revenue: 4.41 * B }`, and the basis regex for the trailing twelve months carried at the guided year-over-year pace of 6.58%.
2. Guidance over an annual base period was dropped. `compute.ts:3361-3391` builds `dcfQuarterRevenue` only when there is both a TTM and a latest quarter, so a year-one anchor on the annual base never saw the guided year-ago quarter, and the guidance-midpoint × 4 path survived. OD-1 point 3 now retires that path too, and Task 3 gains the compute wiring and a wiring test. The unit case's HEAD figure was corrected to 1111.6e9.
3. `interestRunRate` (`projections.ts:154-176`) is the × 4 sibling that FIN-301's fix sketch names, and Task 1 omitted it. It was added with a 98-day test, a debt-scaled case and controls.
4. Task 17's detectors misfired against the 51 stored reports:
   - `guidedTimesFour` matched the generic D-60 house sentence, so it fired on #46–#52.
   - A calendar-anniversary `fiscalYearEnd` could not fire on #47 or #49, which carry one quarter context each.
   - `currentCapitalStart` rewrote claim text, which drops that claim's verification mark (`verificationMarks.ts:58-70`).

   The rules table now has a column for the stored reports each rule fires on. Step 5 lists the exact expected outcome for all 51 reports, and six tests were added.
5. Task 24 did not say that Task 2 moves the payload golden's AAPL-shaped fixture: its FY2027 window share changes from 179/365 to 183/364 days. Task 24 was rewritten on the golden's restoration-row convention.
6. Task 23 listed only the stamp constants. The tests that pin those stamps as literals are now listed with their files.
7. OD-6 cited SR 11-7, which the Federal Reserve has superseded (it returned 404). OD-6 now rests on D-111 and SR 26-2, which "supersedes and replaces SR letter 11-7".
8. OD-1a, the weekday rule, picked a kind even when both of 26 CFR 1.441-2(a)(1)'s rules fit every year end. The decision now uses the whole chain of year ends and returns null when the rule is ambiguous; this was added as alternative (d). Its sources are now the regulation's own text. The Chart House quote was corrected to the filing's words.
9. Task 7 had three problems:
   - Its first "failing" test was a control.
   - Interest coverage reads a mixed EBIT basis (`compute.ts:2945-2963`).
   - The margin ceiling read a history that was not normalised.

   The tests are restructured into a control, a wiring test and an interaction test with a −180 one-off (terminal evidence 17.57, terminal 12.89375). The ceiling now reads the normalised history.
10. Task 12 filtered the stub year only for growth. The projection base, the DCF income history and sales-to-capital, and the ROIC series still read it. OD-3 and Task 12 now cover each annual-flow use, with concrete rows and a wiring test.
11. Task 4's new payload ids had no `EXACT_LABELS` entries (`presentation.ts:200-205`). They would have rendered under the slug fallback. The entries were added with a `metricLabel` test; the old ids keep their labels.
12. Task 15 did not say which scan points count. It now uses the contiguous in-domain run around the base growth for the brackets, for the outside-range end and for the margin solve. It gains a setup guard and a test that no root is published from a bracket beyond the domain edge.
13. Task 29 had three errors:
    - The proof config sat one directory deeper than the probe config it copies, so its relative paths were wrong.
    - It read only six stored reports through the view.
    - Two AMZN #43 rows were wrong: at spec 1.33.0, #43 inferred no outside-range growth and predates D-111.

    All three are fixed. Rows were added for the interest run-rate and the reverse-DCF root on 43–50, and the must-not-move list gained the ROIC series and sales-to-capital.
14. Placeholder test bodies in Tasks 1, 2, 3, 9 and 12 were replaced with concrete rows, dates, figures and HEAD-failure messages.
15. In Task 5, `periodStartBasis` now has three values, `"filed" | "prior-quarter-end" | null`, and defaults to "filed" when a start is supplied. A fifth case was added.
16. Task 8 had three gaps:
    - `rdEffective` was not withheld at zero average debt: at HEAD it is `intExp / 0 = Infinity`, which only the band rejects.
    - The de-minimis test did not require `debtAvg > 0`.
    - No test covered a new borrower.

    All three were added, and the new-borrower test asserts that the band note is absent.
17. Task 14 had no rule for when a fiscal-year-basis forward label conflicts with the history labels. OD-5 and Task 14 now give `historyLabels(rows, forwardBasis)` a rule and a test.

**Changes made (minor).**
- Task 2's ambiguous example was wrong: 2025-12-27 fits only the last-weekday rule. It is now 2024-12-28, 2023-12-30, 2022-12-31, which gives null, and adding 2022-01-01 gives a nearest-weekday rule. The Apple case and its snaps were added.
- Task 16 Step 5's #43 expectation and Task 9's test variables (`base`/`prior`) were corrected, and Task 10's `waccBase` was named.
- Task 25 now names the DEMO calendar-year control and the group `audit-b5-seasonality-calendars-dcf-inputs-20261027`. Task 26's CHANGELOG header and Task 27's docs scope were updated.
- Sources now give fetch dates and exact quotes: Home Depot, SEC 13a-10, xbrl.org and Damodaran. The Damodaran session 11 slides were added for OD-7; S&P and McKinsey returned 403 and are marked indexed-only.
- In the Home Depot IR link, the tilde before `/media` is now percent-encoded as `%7E`. `tests/repository.release.test.ts`'s home-path check matches a tilde followed by a slash, and Task 28 registers this file there.
- The Self-review table now names the stored reports each rule fires on. The re-pinned test list and the open risks were updated: 53-week annual growth figures, the guided margin seed, the trough cap, the non-seasonal comparability guard, start-year forward labels and the sources.
- Review Focus item 1 names Task 3's test by its actual name.

**Left for the main session.**
- `tmp/audit-2026-10-27/plans/B5.summary.json` was not edited and is now stale. Its `filesTouched` lacks `src/report/presentation.ts`, `tests/stageB.guidanceComparability.test.ts`, `tests/jobRunner.test.ts` and `tests/stageB.dcfDomain.audit20261022.test.ts`, and still lists `tests/stageB.growth.returns.capital.test.ts`, which Task 12 now leaves unchanged. Its `replayProof` names six stored reports instead of all 51 and has the old AMZN #43 stored values.
- Rebase order: Tasks 6–7 touch the same functions as B4, and Task 4's registry ids may collide with ids that B1 or B2 add. Renumber D-next, the stamps and the delta group at merge (Task 32).
- The owner should know about four scope extensions beyond the findings' own sketches: `interestRunRate`; the transition filter on the ROIC series and sales-to-capital; the domain restriction on the reverse-DCF scan; and the forward-label rule.
- Every `≈` figure, and every "(record)" cell, must be measured by the Task 29 run before Task 25's deltas are written.

## Amendment notes (round 4)

Amended 2026-10-28 at HEAD 6542531 (= origin/main), after audit round 4. The planner read each new finding in `tmp/audit-2026-10-27/findings.json`, its probe (`probes/<ID>.probe.ts`, not run), its verdict file (`agents/r4-verify-1/verdicts.json` for FIN-501, FIN-502 and FIN-506; `agents/r4-verify-3/verdicts.json` for FIN-512 and RPT-502; no `r4-vverify-*` folder covers these five), the code each cites, the master plan's round-4 rows (`docs/superpowers/plans/2026-10-27-audit-remediation.md`, rows 93–97 and the "Round-4 addenda" table) and the decisions spec's leans (section 4.1). No source, test or doc outside this file was changed; no server, suite or probe was run; no `*.db*` file was opened.

**Where each round-4 finding is handled.**

| finding | severity | handling | owner decision |
|---|---|---|---|
| FIN-501 | Medium | (b) new Task 18: the margin solve searches the base margin path shifted by (m − base terminal) × the base fade weights, so the model value solves to the base terminal margin. Not (a): Task 15 restricts the margin scan to in-domain points but keeps the 10-year straight-line family. | OD-11 |
| FIN-502 | Medium | (b) new Task 19: the tax seed is re-read without the tagged one-off the margin seed removes. Not (a): Task 7 carries the one-offs into coverage, terminal evidence and the fade, not the tax seed. | OD-12 |
| FIN-512 | Low | (b) new Task 20: the scenario basis, the projection line and the judge prompt name a binding σ bound and give the sample σ; the dispersion record gains two optional fields. No existing task touches the dispersion text. | none needed |
| RPT-502 | Low | (b) new Task 21: the available-target scenario line drops the zero-floor clause; stored reports built after D-102 get a display correction. | none needed |
| FIN-506 | Low | (b) new Task 22: the excess-return reverse solve inverts the price per diluted share through the forward value's own per-share mapping. The brief assigned it to B5. While this amendment was being written, `findings.json` and `brief/batches.json` (rewritten 2026-10-28 00:21) moved it to B6, as the master plan recommends ("B6 Task 5 rewrites the same excess-return reverse solve"); but B6's round-4 addendum (`plans/B6.r4.summary.json`, 00:45) covers FIN-503, FIN-504 and FIN-505 only and B6's plan never names FIN-506. It is planned here so it is not lost, with a note that exactly one batch builds it. | none needed (the finding says so) |

**Owner decisions against the decisions spec's leans (section 4.1).** FIN-501's lean was the base-shape family; the plan takes the shifted base path, which equals the lean value for value on every path `buildDcfAssumptions` builds and keeps the property for any other base path (OD-11). FIN-502's lean was the historical median for year one, "verify against McKinsey's operating-tax guidance"; McKinsey's method removes nonoperating items at the marginal rate, which is right for a deductible charge and wrong for non-deductible goodwill (BDO), so the plan holds the median within the range those two readings give (OD-12). Where the median already lies inside that range, as in the finding's probe, the result is the lean's.

**Changes to existing parts of the plan, and why.**
1. The batch-level tasks are renumbered 18–27 → 23–32, so the five new finding tasks (18–22) sit after Task 17 and before them. Every "Task N" cross-reference in this file was renumbered with them, the Review notes included (so "Task 24" there is the payload golden).
2. Task 23 (stamps) now moves `PIPELINE_VERSION` and its pin at `tests/jobRunner.test.ts:6204`. The first draft said it did not move; Task 20 changes one line of the judge's prompt, and the decisions spec (section 2.15, C-8) assigns prompt text to PIPELINE_VERSION.
3. Task 17 keeps its rules and tests. A paragraph says Tasks 18–22 add five rows to its module, and that Task 21 adds one code-written field (`valuation.scenarios[].assumptions`) to the fields a display rule may rewrite. Its Step 5 list stays its own; the final 51-report list is in Task 29.
4. Task 29's "after" run follows Task 22, its table gains six rows, and its expected 51-report scan gains `sigmaCap` and `scenarioFloorSentence` on #46–#50 and #52, and `impliedReturnShareBasis` on #21. The planner ran the detectors read-only over the 51 stored reports to get that list.
5. Tasks 24 (golden: three conditional moves to record; Tasks 21 and 22 do not reach it), 25 (no DEMO leaf from Tasks 18–22), 26 (CHANGELOG bullets), 27 (D-next bullets for OD-11, OD-12 and the one-batch rule for FIN-506), 28 (26 findings), 30 (the round-4 files first), 31 (26 findings, Review Focus 1–9) and 32 (PR text) are extended, not rewritten.
6. One existing test is re-pinned by Task 18: `tests/stageB.valuation.test.ts:476-481` rebuilt the solved margin path with the old family to check the price; it now uses `reverseMarginPath` with the same tolerance.
7. The header (Goal, Architecture, Spec, a round-4 findings line), two Global Constraints lines (stamps, AGENTS.md) and Review Focus (items 6–9) are updated. No existing task's rule is proved wrong by a new finding; Task 15's in-domain restriction is kept and, on the new family, brackets a run that contains the base path.

**Facts checked while amending.**
- NVDA's SEC-filed FY2017–FY2026 history (`tests/stageB.dcfAnchoring.test.ts:22-31`) gives a growth sample σ of 46.117pp and a margin sample σ of 15.883pp (node, by the `scenarioDispersion` formulas), the probe's run-50 values, so Task 20's fixture is hermetic and SEC-only.
- D-102's withhold rule (commit d2542f3, 2026-10-22) is an ancestor of the commit that set spec 1.38.0. Stored #46–#52 state the withhold rule in their basis; #43, #42 and #38 state "per-share is floored at 0".
- No test pins the old scenario sentence or the judge-framing line; `stage-c-1.6.9` appears only at `jobRunner.ts:527` and `tests/jobRunner.test.ts:6204`; `SIGMA_GROWTH_MAX`/`SIGMA_MARGIN_MAX` have been 25/12 since f0d77ef.
- Stored #43's margin-method reverse (52.30%) ran on a flat base path (12.1% → 12.1%), which the old family contains, so FIN-501 gives it no note; the AMZN #43 HEAD replay runs on a non-flat path (12.08% → 14.03%) and is where the 48.68% against 42.09% gap shows.
- The excess-return `reverseSolve` is not serialized into the report or the payload (no match in `src/report` or `src/pipeline/stageC`); it reaches readers through the `roeImpliedVsAchievable` score driver, which only stored #21 (JPM, spec 1.1.0, 22.63pp) carries among the 51.

**Cross-batch.**
- B6: Task 5 rolls the excess-return value, grid and reverse solve to the quote date in the same function Task 22 edits; whichever merges second keeps both (the reverse compares the rolled value per share with the price). If the main session moves FIN-506 to B6, Task 22 moves verbatim and is struck here.
- B4 Task 11 puts its convertible reading into the excess-return per-share mapping; Task 22's `perShareOf` is that mapping, so the reverse follows it (master plan conflict row 17: "FIN-506's reverse-solve divisor uses B4's divisor").
- B13 (conflict row 53): Task 19 re-reads the tax seed when the margin seed removes a tagged one-off. If B13 merges first and its derived EBIT already leaves out a tagged charge filed in `OtherNonoperatingIncomeExpense`, the TTM pre-tax income still holds that charge, so the amount must reach Task 19's `oneOff` even though `normalizeUnusual` does not remove it again (the master plan's row 53 adds that derived-EBIT case to Task 7's tests). The second batch to merge wires it.
- B2 Task 16 also moves PIPELINE_VERSION: renumber at merge.
- B10 (RPT-501) relabels the live page's reverse-DCF line in `page.tsx`; Task 18 changes only the value that line prints for the margin method, and touches no `src/app` file.

**Self-review of the amendment.** Coverage: 5 of 5 round-4 findings have a task with a failing test built from their probe and a control (FIN-506 with its one-batch note). Step scan: no "TBD"; Task 20's one contingency is a stop condition. Type consistency: `marginShiftWeights`, `reverseMarginPath`, `MarginPathFamily`, `taxRateWithoutOneOffs`, `SIGMA_GROWTH_MAX`, `SIGMA_MARGIN_MAX`, `sigmaCapPhrases`, `SCENARIO_TARGET_LABEL_LINE`, `LEGACY_SCENARIO_FLOOR_LINE`, `perShareOf`, `reverseSolve.basis` and Task 17's `ANNUALIZATION_CONVENTION_SPEC` are named the same in every task that uses them. Review Focus: items 6–9 each name a test in Tasks 18, 19, 21 and 22. Proportion: signatures, exact strings and assertions; no function bodies beyond one-line formulas.

**Left for the main session.** Decide where FIN-506 is built (Task 22 here, or B6) and strike the other copy. `tmp/audit-2026-10-27/plans/B5.summary.json` describes the first draft only; the round-4 summary is `tmp/audit-2026-10-27/plans/B5.r4.summary.json`. The master plan's B5 row ("5 round-4 findings (FIN-506 recommended to move to B6)") and row 95 ("no task") should name Task 22.

## Review notes (round 4)

Independent review of the round-4 amendment, 2026-10-28, at HEAD 6542531 (= origin/main). The reviewer read the five findings in `tmp/audit-2026-10-27/findings.json` and their probes (`probes/FIN-501.probe.ts`, `FIN-502`, `FIN-506`, `FIN-512` and `RPT-502`; not run). It also read their verdicts and outputs (`agents/r4-verify-1/`, `agents/r4-verify-3/`; no `r4-vverify-*` folder names any of the five), the code each task cites, and the 51 stored reports (read-only node scans).

To check the HEAD behaviour each new Step 1 test relies on, it ran one read-only scratch file on synthetic inputs, offline behind a dead proxy. The file sits in the git-ignored `tmp/audit-2026-10-27/plans/b5-r4-review/`: `r4.review.ts`, with config `vitest.review.config.ts` and output `r4.review.out.json`. The reviewer ran no probe, no repository test, no suite and no server. It opened no `*.db*` file, made no provider or model call, and changed nothing in the repository except this file.

Sources spot-checked on 2026-10-28; all four read as the plan quotes them:
- BDO: the Component 1 and 2 goodwill passages and the $127 / $27 example.
- Damodaran, "More on effective tax rates": the marginal rate in perpetuity, and "the safer choice is the marginal tax rate".
- Damodaran's Brazil 2008 slides, downloaded and text-extracted: "Adjust EBIT for a. Extraordinary or one-time expenses or income … Use a marginal tax rate to be safe."
- The Motley Fool interview with Mauboussin and Rappaport: both quotes.

The McKinsey passage stays marked as unverified (403).

**Verdict on coverage.**
- Each of the five findings is fixed by its own task (18–22). None is disputed.
- The amendment claims no existing task already fixes one, and no such claim would hold: Task 15 keeps the 10-year straight-line margin family, and Task 7 does not touch the tax seed.
- The tasks fix the whole class without ticker-specific code and weaken no check.
- They respect D-67: every stored-report change is a display-time note or correction on an immutable view.
- None touches B13's scope (derived EBIT operands, D&A totals, fourth-quarter lineage). Task 19's dependency on B13 (conflict row 53) is recorded.
- OD-11 and OD-12 are supported by their sources and consistent with D-58, D-98 and OD-7.
- The batch-level Tasks 23–32 cover the new tasks.

**Changes made.**
1. *Task 22, Step 1 wiring test (major: the test could neither fail for the defect nor pass after the fix).*
   - The checked-in `buildSyntheticRouteBundle("bank")` quotes 100 against a model value of 12.4676 per share, so its reverse solve has no root at HEAD ("market cap above the 80% starting-ROE value", implied null; measured).
   - Market cap × 1 and × 1.03 both give null, before and after, so the test's `toBeCloseTo` on null throws in both states.
   - The rewritten test sets the quote price to the model value per share from a first run (the excess-return value does not read the price), and the market cap to that price × the quote's 100M shares. A second copy carries a market cap 3% higher. A setup guard checks that a root exists.
   - At HEAD the two copies give 40.4749 and 41.5149 against a current return of 40.4762 (measured), so the test fails by 1.04pp. After the change both solve on the price basis to the current return. Step 2's expected message now gives those numbers.
2. *Task 19, helper guard (major: the helper broke the continuity OD-12 claims).*
   - `taxRateWithoutOneOffs` as written accepted a negative tax expense. HEAD treats one as "not computable" (`valuation.ts:2049`) and holds the company median.
   - So a tagged item of any size beside a negative tax expense would turn year one from 21.05% into 0%, because both readings clamp to 0. HEAD was measured at 21.0526% on the probe's issuer with tax −10 and a 0.1 tagged charge.
   - The helper now returns null when `taxExpense < 0`, so HEAD's path runs, and OD-12's text says so.
   - A control test was added: "control: a negative tax expense keeps HEAD's not-computable path, with or without a tagged item". It passes at HEAD and pins the guard. Review Focus item 7 names it.
3. *Task 19, basis wording (minor).* When the re-read runs, two texts now say "re-read without tagged one-off items": the D-60 guided branch's "against the TTM observed X%" clause (`:2107`) and the no-history terminal text (`companyTaxText`, `:2078`). Without this they would call the re-read rate observed, or call it the raw TTM rate.
4. *Task 22, guards and wording (minor).*
   - The plan now traces how the existing guards work on the new basis. Where `dilutedShares` is nulled (an ADR without quoted-ADS evidence, an unresolved economic class basis), HEAD's market-cap path runs.
   - One behaviour change is intended. Take an ADR whose diluted count is established as quoted ADS but whose market cap is not issuer-common. HEAD skips its reverse solve because the market cap is nulled (`:5856-5858`). It now solves on the price per ADS, the basis its upside already uses. A direct-call test covers it ("solves on the price when only the market cap is withheld"; HEAD gives null), and Step 5 records it.
   - The currency guards' note and gap texts (`:5968`, `:5987`) and the out-of-bracket notes (`:5371`, `:5373`) now name the quantity compared. No test pins those strings. The Files list now includes those lines.
5. *Task 22, the stored-report note (minor).* `impliedReturnShareBasis` said the signal "reads about 0.3pp of return low per 1% gap". The direction follows the sign of the gap: the market cap is smaller than the price × the diluted shares only when the diluted count is the larger. The note now says "too low" or "too high" accordingly.
6. *Task 22, Step 4 (minor).* The re-run list gains the `buildSyntheticRouteBundle` consumers that put the bank and insurer routes through `runStageB`: the route-panel, common-income, preferred-payout, parent-net-income, excess-return visibility and template-label tests.
7. *Task 21, Step 2 (minor).* Step 2 says the withheld-target control passes at HEAD, but `-t "floored"` did not select it. The pattern is now `-t "floored|operating-scenario line"`.
8. *Task 20 (minor).*
   - The judge-framing test also asserts the line built from the exported `SIGMA_GROWTH_MAX` and `SIGMA_MARGIN_MAX`. `prompts.ts` imports nothing from Stage B, so this keeps its literal from drifting from the bounds.
   - The `sigmaCap` note now says "the scenario text calls the shift 'sample σ'" only when the margin bound binds. Stored #43–#52 call only the margin shift "sample σ" (checked with grep), so a growth-only cap note would have misquoted them. The legacy test asserts the clause is absent for `{ 25, 3.09 }`.
   - Step 2's setup guard is now measured, not reasoned: status "available", HEAD's "sample σ" wording on both lines, and dispersion 25 / 12 with correlation 0.8433.

**Checked and found sound (no change).**
- *Task 18 (FIN-501).*
  - On the builder's shape, `reverseMarginPath` equals `fadePath(m0, m, 5)` then flat, value for value, and the family member at the base terminal margin is the base path by construction.
  - The `:369` boundary case still solves exactly to 60 (`[−10, 60]`). The `:454` case's notes still contain "terminal EBIT margin" through the fallback-A note.
  - The prescan grid (0, 3.75, …) does not contain 20, so the 1bp bisection lands within 0.01 of it and `toBeCloseTo(20, 1)` holds.
  - `grading.ts` and `scoringEvidence.ts` read no margin solve.
  - No stored report gets the note. The only stored margin-method report with a margin row, #43, has a flat base. #35 has no margin row, and #27, #29 and #37 do not match the metric regex.
- *Task 19 (FIN-502).* Figures recomputed and measured at HEAD: clean 21% (exactly, so `toBe(21)` holds), charged 35%, deductible 21%, tiny 21.0084%, no history 35%, guided 17%. Under the decision the charged issuer is worth 33.6219 a share against 33.6287 clean (HEAD 31.8299), within the test's 0.05. The basis numbers format as the regexes expect (`fmtNum`, two decimals).
- *Task 20 (FIN-512).* NVDA's SEC history gives a sample σ of 46.117pp for growth and 15.883pp for margin (recomputed). The dispersion record does not reach the payload (`payload.ts` registers only the targets). The basis and projection lines do, through the finance block, as Task 24 says.
- *Task 21 (RPT-502).* The `computedFixture()` shape prints the floor line three times at HEAD and has `projections.scenarioAssumptions`. Stored #46–#50 and #52 hold `LEGACY_SCENARIO_FLOOR_LINE` in every scenario and the withhold sentence in `scenarioTargets.basis`. #43 holds the line with the floor basis; #38 and #42 hold neither.
- *Task 23.* `stage-c-1.6.9` is pinned only at `tests/jobRunner.test.ts:6204`, and no test pins the judge-framing line's text. Decisions spec 2.15 (C-8) assigns prompt text to PIPELINE_VERSION.
- *Task 29.* The expected list for the 51 stored reports matches the stored data for the round-4 detectors: `sigmaCap` and `scenarioFloorSentence` on #46–#50 and #52, `impliedReturnShareBasis` on #21 only, `reverseMarginFamily` and `taxSeedOneOff` on none.

**Left for the main session.**
- *FIN-506's batch is still contested.* `findings.json`, `brief/batches.json` and the master plan put it in B6 (Step 4: "Cut B6; execute it and its addendum (with FIN-506)"). But neither `docs/superpowers/plans/2026-10-27-audit-fix-06-financial-routes-currency-and-grading.md` nor `plans/B6.r4.summary.json` contains a FIN-506 task (grep). Strike one copy. If FIN-506 moves to B6, Task 22 moves as amended here, including the rewritten wiring test and the new ADR case.
- *`tmp/audit-2026-10-27/plans/B5.r4.summary.json` is stale on four points* (this review did not edit it):
  - its risk "Task 20's scenario-basis wiring test … reasoned, not run" is resolved (measured);
  - it lacks the Task 19 negative-tax guard and control;
  - it lacks the Task 22 wiring-test rewrite and the ADR case;
  - its Task 22 file list lacks the guard-note lines.
- *Scratch files.* The files under `tmp/audit-2026-10-27/plans/b5-r4-review/` are git-ignored evidence for the HEAD values measured above. They are not part of the plan's deliverables.

## Integration notes (2026-10-28)

Integration of the main session's resolutions (`docs/superpowers/specs/2026-10-27-audit-remediation-decisions.md` section 4.3, "Main-session resolutions (2026-10-28)", binding) at HEAD 6542531. Two lines of 4.3 concern this plan:

- **L1, "FIN-506. Moves from B5 to B6, because B6 rewrites the same function."**
- **L2, "B5. Confirm all four scope extensions, each only with its replay evidence. Before D-next, backtest the house thresholds (0.9-year stub, 0.75-year span, 10-day snap, three-year-end rule) offline over the 45 census snapshots, and record the distribution in the disposition note."**

The sections "Review notes", "Amendment notes (round 4)" and "Review notes (round 4)" are kept unchanged as the record. Where they say FIN-506 is built here or name Task 22's steps, this section and the edited tasks supersede them.

**Changes made, and the 4.3 line each implements.**

| # | Where | Change | 4.3 line |
|---|---|---|---|
| 1 | Header, round-4 findings line | 4 round-4 findings, 25 in all (the 25 ids `brief/batches.json` lists for B5); FIN-506 named as moved to B6 Task 5A | L1 |
| 2 | Spec line | REPORT.md's B5 heading is at `:1799` now (the line cited `:1584`, which no longer holds it); section 4.3 added as binding; the decisions spec noted as untracked, not on main | brief (Spec line) |
| 3 | Global Constraints | census snapshots named as proof-only inputs, like the keyed snapshots; "Tasks 18–22" → "Tasks 18–21" | L1, L2 |
| 4 | Review Focus | item 9 (bank/insurer share-count gap) struck with a pointer to B6 Review Focus item 7 and Task 5A; "four" → "three" round-4 classes | L1 |
| 5 | Task 17 | Interfaces: each row compares against its own cutoff and there is no module-wide early return on `ANNUALIZATION_CONVENTION_SPEC`, because B6 Task 5A adds `impliedReturnShareBasis` with B6's later cutoff; the round-4 rows paragraph lists four rows, not five | L1 |
| 6 | Task 22 | replaced by a tombstone with no steps, headed "Struck; its finding moved to B6 Task 5A" (no finding id in the heading, so `plans/coverage.cjs`, which reads ids from `### Task N:` headings, does not count FIN-506 as covered here); the full task is B6 Task 5A. Numbering of Tasks 23–32 unchanged (the master plan and B6 cite them). The pre-move text is reproduced in B6 Task 5A, adapted to sit on B6 Task 5's roll; "Amendment notes (round 4)" and "Review notes (round 4)" below keep the record of what was planned here | L1 |
| 7 | Tasks 23–26 | no stamp, golden, delta or CHANGELOG line for FIN-506; "Tasks 18–22" → "18–21" | L1 |
| 8 | Task 27 | FIN-506 recorded as moved, not covered by this D-next. Gate: the entry is written only after Task 29 Steps C and D pass. New bullets: the four scope extensions E1–E4, each "confirmed by the main session on its replay evidence"; the threshold backtest's results; its residual (no census period between 250 and 363 days; an eleven-month transition period would pass the 329-day line). The old sentence "none of the house thresholds … is backtested" is removed | L1, L2 |
| 9 | Task 28 | 25-row disposition table plus a FIN-506 "moved to B6" line; new sections "Scope extensions" (rows E1–E4) and "House-threshold backtest" (Step D's table and its residual) | L1, L2 |
| 10 | Task 29 | Steps A and B labelled; the after-run follows Task 21; #21 gets no note here (its note is B6's); new **Step C**, a census replay (45 keyless snapshots, before and after, plus an in-memory annual-base copy of HD) giving evidence rows E1–E4 with pass conditions; new **Step D**, the offline threshold backtest (two period sets per issuer, five checks with pass conditions, no re-tuning, a stop-and-report rule) | L2 |
| 11 | Tasks 1, 12, 14, 15 (Step 5) | each scope extension (E1 `interestRunRate`, E2 transition filter on the DCF history/sales-to-capital/ROIC, E4 forward-label rule, E3 in-domain root and margin solve) names its Task 29 evidence row and says that, if the row fails, the extension is unconfirmed: stop before Task 27 and report to the main session | L2 |
| 12 | Task 30 | FIN-506's test file removed from the round-4 run list | L1 |
| 13 | Task 31 | 25 findings; Review Focus 1–8; the reviewer checks the diff carries no FIN-506 code, that E1–E4 have their evidence rows and that no threshold was re-tuned | L1, L2 |
| 14 | Task 32 | PR text: FIN-506 moved to B6; the four extensions with their evidence; the backtest in one line per threshold; the residual | L1, L2 |
| 15 | Self-review | coverage line, the FIN-506 row, the format line and the open-risks line on the thresholds | L1, L2 |

**Evidence the integrator gathered (read-only, no network, no `*.db*` file opened).**
- Census pre-scan (node, over `tmp/metis-audit-2026-10-22/scratch/snapshots/main/*.json`). Annual income-statement rows with a filed start: 434, at 364 (75), 365 (245), 366 (100) and 371 (14) days. Annual-form companyfacts periods for `Revenues`, `RevenueFromContractWithCustomerExcludingAssessedTax`, `SalesRevenueNet` and `NetIncomeLoss` (forms 10-K, 20-F, 40-F; 250–380 days; deduped by start and end): 779, all 364 days or more. None lies between 250 and 363 days, and no 10-KT appears. So Step D is expected to pass the 0.9-year and 0.75-year checks. It cannot test the 0.9-year line against a long transition period, which the residual records.
- Home Depot's census rows carry `fiscalYear` "2025" for the year ending 2026-02-01 (start-year naming), which is why the HD copy is E4's firing case.
- The census is keyless: no consensus rows. So the 10-day snap is checked against two vendor-style conventions on filed ends, and against the five keyed snapshots' real FMP estimate dates inside the local proof only.

**Recommendation not applied (for the main session).** 17 CFR 240.13a-10 bounds a transition period below twelve months, and every full fiscal year in the census is at least 364 days. A stub line of "under 357 days" (51 weeks) would therefore withhold every transition period up to about 11.7 months and keep every census year. The current "under 329 days" (0.9 year) lets a 10.8–11.9-month transition period through as a fiscal year. 4.3 asks for this threshold to be backtested and recorded, not changed, so OD-3 and Task 12 keep 329 days. Task 27, Task 28 and Task 32 carry the gap as a named residual. Raising the line would change OD-3, Task 12's interface and METHODOLOGY's sentence; that is the main session's call.

**Not applied.** None of the 4.3 lines that concern B5 was left unapplied. `tmp/audit-2026-10-27/plans/B5.summary.json` was regenerated from this plan, the authority. It now includes the round-4 tasks and this integration. `B5.r4.summary.json` is left as the round-4 record.

## Post-integration review (2026-10-28)

Independent review, at HEAD 6542531, of Task 29 Steps C and D (the census replay and the threshold backtest). It also wires decisions spec 4.5's O-2, which is binding: "raise the stub line to 'under 357 days', provided B5 Task 29 Step D's backtest shows no census year below 357 days", with OD-3, Task 12's interface and METHODOLOGY's sentence changing together. The review also confirms that FIN-506 is no longer built here.

The reviewer traced each step through the code at HEAD: `growth.ts:438-640`, `compute.ts:1157-1200`, `:2562-2587`, `:3225-3262` and `:3790-3830`, `projections.ts:154-176` and `:700-720`, `quarterWindows.ts:171-215`, `legacyEntitySafety.ts:38-90`, and `hermeticEnv.ts`. It measured its claims with read-only node scripts, kept in this session's scratch folder, outside the repository. Those scripts read the 45 census snapshots, the five keyed snapshots `data/evidence/{43,46,48,49,50}` and the 51 stored reports. The reviewer ran no probe, test, suite or server, made no network, provider or model call, and opened no `*.db*` file. It changed nothing in the repository except this file, and refreshed `tmp/audit-2026-10-27/plans/B5.summary.json`. Three regulation texts were read on Cornell LII: 17 CFR 210.3-06 and 26 CFR 1.441-2 on 2026-10-28, and 17 CFR 240.13a-10 on 2026-10-27, as the plan already cited it.

**Changes made.**

| # | Where | Change | Why |
|---|---|---|---|
| 1 | OD-3 | The line becomes "under 357 days (51 weeks)", set by a gate (Task 29 Step D check 1a, run as Task 12 Step 0), with a stated fallback to 329 days. Two alternatives are added: (b) keep 329; (c) under 364. Two sources are added: Regulation S-X Rule 3-06 (nine to twelve months of statements can stand for a year after a fiscal-year change) and 26 CFR 1.441-2(a)(1) ("Varies from 52 to 53 weeks"). 4.5 is quoted. | 4.5 O-2. The supersession of the integration's "Recommendation not applied" paragraph is recorded here; that paragraph is kept as the record. |
| 2 | Task 12 | It now has an exported `TRANSITION_PERIOD_UNDER_DAYS = 357`. The Interfaces say that cash-flow rows are always measured by the gap. A new Step 0 (the gate) gives the fallback edits for a failed gate. A new test case pins the constant, withholds an eleven-month period (2025-01-01..2025-11-30, 334 days) and checks 356 against 357 days, both by filed start and by the gap. Step 2 lists the new failures. Step 6 gives the METHODOLOGY sentence at 357 and rewrites `METHODOLOGY.md:1157-1159` ("a shorter transition stub uses the existing single-period denominator"), which Task 12 makes untrue. | 4.5 O-2: the interface, the tests and METHODOLOGY move together. Day counts were computed with node. |
| 3 | Task 29 Step D check 1 | Split into 1a (the gate) and 1b (confirmation after Task 12). The bands become < 250 / 250–328 / 329–356 / 357–363 / 364–371 / > 371. A "census year" is defined. 10-KT periods are listed apart, because the plan's form pattern for 10-K, 20-F and 40-F also matches `10-KT`. The five keyed snapshots' FMP rows are measured, with a stop if one of their fiscal years is under 357 days. The pre-scan counts are added. | The old check backtested 329 only and could not set the 4.5 line. Without the exclusion, a 10-KT would have been counted as a fiscal year. |
| 4 | Task 29 Step D check 5 | The week-rounding by-product gains a pass condition: a count other than 13 only for exact multiples of seven days. The year-ago check now measures only the four-quarter runs that `quarterWindowViolation` accepts, and lists the rejected runs. | As written, the year-ago check failed on NNN: its latest four rows skip 2026-03-31 and span 365 days, a data gap the TTM gate already rejects. The week-rounding by-product had no pass condition. |
| 5 | Task 1 (`weeksOf`), OD-1 point 4 | `weeksOf` returns 13 for 90–92 days and any other `w` only when `days === 7w`. Test rows are added: 85, 87, 93, 96, 97 and 99 give null; 98 gives 14; 370 and 372 are not 53 weeks. "Not established" is for `days === null` only. | The census's KO fourth quarter of 2020 (2020-09-26..2020-12-31, 97 days; a calendar-year issuer) read as 14 weeks under ±1 and would have been scaled by 13/14. Every week-based quarter in the 50 inputs spans exactly 7w days: 84 ×36, 98 ×7 in the census plus the keyed ones, 112 ×10, 119 ×2. So the exact rule changes no correct reading. This rule follows from 26 CFR 1.441-2 (a 52/53-week period always ends on the same weekday); it is not a number fitted to the census. |
| 6 | Task 29 Step C | Each evidence row now compares its own task's commit pair (E1 base→Task 1, E2 Task 11→12, E4 Task 13→14, E3 Task 14→15), not base→Task 21. E1 captures `interestRunRate`'s exact arguments and return through a `vi.mock` pass-through. E1's expected movers are named (census PEP only). The E2 evidence is widened to the gap-measured and keyed rows. E4 notes HD, JNJ and FCX. The HD copy's gap shape example is TSM's. | Tasks 1, 3, 7, 18 and 19 move census reverse-DCF figures on in-domain inputs, so E3's "in-domain inputs are identical" would have failed for causes outside Task 15. The EPS line prints interest rounded to 0.01B, so it cannot carry E1's 1e-9 check. COST and MU #46 never reach `interestRunRate` (`compute.ts:2577` needs a quarter newer than the latest annual row). |
| 7 | Task 1 Step 5; Task 29 Step B row "interest run-rate" | E1's wording says where the run-rate is reached. MU #46's expected move is corrected to "none": its 98-day quarter closes its fiscal year. | Same trace as row 6. |
| 8 | Task 29 Step A | The command names `replay.proof.ts`. A note says `B5_PROOF_LABEL` survives the hermetic setup, which clears only `METIS_` and `THESIS_` variables. | A bare run under the shared `*.proof.ts` include would also start Steps C and D. |
| 9 | Task 17 Interfaces | `ANNUALIZATION_CONVENTION_SPEC` is compared through B3's `specVersionBefore` (`legacyPayloadRecordSafety.ts`). There is no second comparator, and the task stops if B3's export is missing. | Master plan row 5 and decisions spec 2.15 allow one comparator. B6 Task 5A's `impliedReturnShareBasis` row assumes B5's rows use B3's. |
| 10 | Tasks 27, 28, 31, 32 and Self-review | The O-2 D-next bullet is added. The residual is restated for the line taken: the census files no transition period, and one of 51 weeks or more passes as a year. The FIN-111 stored-report row is re-scanned at 357 (11 `fiscal-year` contexts, none shorter). The reviewer checks the gate, the line and `weeksOf`. | 4.5 O-2, and the keep-markdown-accurate rule. |

**FIN-506 is not built by B5 (confirmed).** Task 22 is a tombstone with no step, test or commit. No B5 task's Files list touches the excess-return reverse solve (`valuation.ts:5333-5381`), `ExcessReturnInputs`, `compute.ts:3816-3817` or `sectorRouting.ts:1435-1436`. The only mentions of `impliedReturnShareBasis`, `perShareOf` and `reverseSolve.basis` in this plan are records: Review Focus item 9, Task 17's no-early-return rule, the Task 22 tombstone, Task 31's absence check and the round-4 notes. Task 17's per-row cutoffs and its use of B3's comparator are what B6 Task 5A builds on.

**Committed-markdown check.** The reviewer ran the two `unsafePublicDocument` patterns and the `docs.lint` relative-link regex over this file after the edits, read-only, in node. They found no absolute home path, no credential-shaped value and no unresolved relative link (fenced blocks and code spans excluded, as the test excludes them). The Home Depot IR link's tilde stays percent-encoded. Task 28 registers this file in `ALLOWED_MARKDOWN`.

**Evidence (read-only, 2026-10-28).**
- Annual lengths. Census: income rows 434 by filed start and 2 by the gap, cash-flow rows 393 by the gap, 45 oldest rows with no length, and 779 annual-form companyfacts periods of 250–380 days. Every measured length is 364–371 days, and no `10-KT` form appears. The keyed snapshots 43–50 show the same. The stored reports carry 11 `fiscal-year` period contexts, none under 357 days. So the O-2 gate is expected to pass.
- The weekday rule, simulated as Task 2 specifies it: a rule on 9 issuers, 231 exact held-out predictions, none wrong, 31 ambiguous nulls. Every held-out end lies within 10 days of both vendor-style dates.
- Quarter windows the TTM gate accepts: 1,029, all 252–287 days. NNN's latest four rows are rejected (365 days).
- `interestRunRate` is reached with a quarter other than 13 weeks only on PEP (84 days). COST (latest quarter 2026-08-30 equals its latest annual row), MU #46 (2026-09-03 equals its latest annual row) and KO (93 days) do not move.

**Left for the main session.**
- Decisions spec section 2.5's B5-OD-3 sentence ("under 0.9 year (under 329 days)") and its "Backtest and residual" note still describe the 329-day line. Section 4.5 supersedes them, but the spec text should be updated where B3 commits it. The same holds for the master plan's open item 1 ("B5's 0.9-year stub line against an eleven-month transition period"), which 4.5 has now decided.
- Row 5 above changes Task 1, which was outside the review's named steps, on evidence from Step D's by-product. If the main session prefers the first draft's ±1-day rule, revert row 5. Step D check 5 would then fail on KO's 2020 fourth quarter, and the batch would stop before Task 27.
- FCX's keyless 2024-12-31 annual row carries `fiscalYear` "2023" in the census snapshot (its revenue provenance is the 10-K filed 2026-02-13), so it shares a label with 2023-12-31. Task 14's collision rule dates both labels, which is correct handling. The label itself looks like a keyless-builder defect in B9's area. It has no finding and no probe yet.
