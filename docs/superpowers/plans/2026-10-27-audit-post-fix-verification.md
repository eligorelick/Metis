# Post-Remediation Verification Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to run this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After every remediation batch (B1–B13, R1–R4) has merged, prove that Metis's figures, statuses and report text are accurate and professional, and that the fixes caused no regression. Anything that fails goes into a follow-up batch, and this plan runs again until every gate passes.

**Architecture:** Several independent lines of evidence, each with its own gate:
- the repository's own checks;
- the audit's probes, which were written to pass once their defect is fixed;
- exact offline replays of 45 stored census run inputs, comparing the audited commit with the merged tree;
- rendering of every stored report;
- data-only end-to-end runs on fixture symbols;
- a fresh audit of the fixed code;
- an expert review of method and wording.

No gate relies on another gate's reasoning.

**Tech Stack:** Node/TypeScript, vitest (repo configs plus `tmp/audit-2026-10-27/probes/vitest.probe.config.ts`), Next.js 16 preview servers (`next dev`) on a copied database, the Workflow tool for the post-fix audit.

**Spec:**
- the owner's requirement (2026-10-27): "Once all the fixes are finished, I need a thorough verification and tests to ensure there are no issues with the professionalism or accuracy of the stock research and analysis software/code";
- `tmp/audit-2026-10-27/REPORT.md` and `findings.json`;
- `docs/superpowers/plans/2026-10-27-audit-remediation.md`.

## Global Constraints

- No paid calls and no AI-provider calls. Never generate an AI report for a real ticker. Saved keys in `aiDirectory()` override environment keys, so every run that could reach Stage C sets an isolated profile with no saved connections, or uses the data-only path.
- Never open the live database. Never run `costs:reconcile`, `settings:reset` or `db:push` against it. Previews use a copy (`tmp/audit-2026-10-27/data/measure.pristine.db` copied to a fresh path), with `METIS_DATA_DIR` and `METIS_DB_PATH` set in the same command.
- Market-data and SEC live calls only in V10, and only after the owner approves it.
- Never weaken a check to make a gate pass. A failing gate becomes a finding.
- Probes rewrite some evidence logs under `tmp/audit-2026-10-27/agents/`. Back up and checksum that tree before V2 and compare after.
- Every claim in the sign-off cites a command and its output.

## Review Focus

1. Changes that move other figures. A fix in one valuation route can move another route's figures through shared helpers such as `quarterWindows`, `statements.ts` or `securityBasis`. V4's diff covers all 45 issuers across every route, not only the audited ones.
2. Stored reports. Legacy reports must still render, keep their bytes (D-67), and show the new display-time notes, such as MU #46's note and AI-301's peer caps. V5 checks all 51 stored reports (`tmp/audit-2026-10-27/data/reports/index.json`).
3. The stricter claim checker. It must lose no true validation that a filing supports. V6 counts statuses on the replayed evidence of reports 43, 46, 48, 49 and 50, and V8's verification reviewer samples them.
4. Text quality. Grammar, units, rounding, currency symbols and repeated or contradictory sentences across templates, which unit tests rarely pin. V6's lint and V8's editor review cover them.
5. Windows-specific failures: EPERM on database teardown, path separators and the CI lockfile. V1 runs on Windows and in CI.

---

### Task V0: Replay harness (build before batch 1, so every batch uses it)

**Files:**
- Create: `tmp/audit-2026-10-27/tools/replay-census.ts` (git-ignored; never committed).
- Create: `tmp/audit-2026-10-27/tools/diff-replays.cjs`.

**Interfaces:**
- Produces:
  - `replay-census.ts --tree <worktree path> --out <dir>` writes one Stage B projection JSON per snapshot in `tmp/metis-audit-2026-10-22/scratch/snapshots/main/*.json` (45 issuers). It uses the tree's own `runStageB` on the stored run input, with no network.
  - `diff-replays.cjs <beforeDir> <afterDir> --findings tmp/audit-2026-10-27/findings.json` writes `replay-diff.md` and `replay-diff.json`. Each row holds the issuer, the leaf path, before, after, and the finding id(s) whose planned change explains it, or `UNEXPLAINED`.

- [ ] Write the harness. It imports `runStageB` from the given tree and is run with `npx tsx` from inside that tree, so each side runs its own code.
- [ ] Run it on a worktree at `6542531` (the audited base) and keep the output as `tmp/audit-2026-10-27/replay/base-6542531/`.
- [ ] Run it twice on the same tree and diff the outputs. Expected: zero differences. This proves the replay is deterministic, with no clock or network dependence.

### Task V1: Repository gates on merged main

- [ ] `git fetch origin && git status` shows a clean tree on `main` at the last batch merge.
- [ ] Run `npm run verify` steps in foreground chunks:
  - `npm run check:dependencies`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test:product`
  - `npm run test:integration`
  - `npm run test:coverage:core`
  - `npm run test:coverage:risk`
  - `npm run build`
  - then the rest of `verify`.

  Expected: each exits 0. A known load flake (memory: jobScheduler, recordedSensitivity, risk.coverage, runtimeArtifactIdentity, runtimeReplay, the `db.cli` Windows timeout) passes on rerun; anything else is a finding.
- [ ] `npm run docs:config` and `npm run docs:pricing` without `--write`. Expected: no drift.
- [ ] `npm run audit:deltas`. Expected: no unclassified path. Every group carries a written reason.
- [ ] GitHub CI on the last merge commit: `full` and `windows-smoke` both green.

### Task V2: Audit probe regression suite

- [ ] Back up `tmp/audit-2026-10-27/agents/`. Write its checksums with `find ... -not -name "*.db*" -exec md5sum`.
- [ ] Run every finding probe (top-level `tmp/audit-2026-10-27/probes/<ID>.probe.ts`: one per finding, 240 files on 2026-10-28; the sweep-exploration probes in subfolders are excluded) against merged main:
  `npx vitest run --config tmp/audit-2026-10-27/probes/vitest.probe.config.ts tmp/audit-2026-10-27/probes/*.probe.ts > tmp/audit-2026-10-27/logs/post-fix-probes.log 2>&1`
- [ ] Classify every probe:
  - **pass:** the fix holds;
  - **fail on an assertion:** a regression or an incomplete fix, so it becomes a finding;
  - **fail on an import or setup error:** the probe reached into internals that the fix renamed. Re-point it to the new API and rerun it. It counts only once it runs.
  - **expected fail:** allowed only for a finding a plan recorded as skipped or disputed, with that reason.

  Expected: 100% of non-skipped findings pass.
- [ ] Compare the evidence checksums with the backup. Restore any file a probe rewrote.

### Task V3: Committed-test coverage of every fixed finding

- [ ] Map each finding to its committed regression test with a script: grep `tests/` for each finding id (the plans name the test files), and cross-check against each batch's disposition note in `docs/audit/`.

  Expected: every finding not skipped or disputed has at least one committed test that the full suite runs. List any that don't.
- [ ] Mutation spot-check, one per batch (13 plus R): revert the fix's core line in a scratch worktree and run its test. Expected: the test fails. This proves the test guards the fix.

### Task V4: Exact before/after replay of the 45-issuer census

- [ ] Run `replay-census.ts` on merged main into `tmp/audit-2026-10-27/replay/after-<sha>/`.
- [ ] Run `diff-replays.cjs` from the base folder to the after folder.

  Expected: every changed leaf maps to a finding's planned change and to an `audit-intended-deltas.json` group. `UNEXPLAINED` rows: 0.
- [ ] Sanity bands on every after-value:
  - no `NaN`, `Infinity` or `undefined`;
  - currency matches its record;
  - shares and per-share values on one date and basis;
  - WACC between 4% and 20% unless disclosed;
  - terminal growth no higher than the risk-free rate (house rule);
  - fair-value range contains its point estimate.

  Each breach is a finding, unless an existing D-entry documents it.
- [ ] Hand-check one issuer per valuation route (general DCF, excess-return, REIT, insurer) by independent recalculation from the disclosed inputs. Use a separate script that does not import `src/`, as the 2026-10-22 batch-2 note did. Expected: agreement within 1e-9 relative.
- [ ] Spot-check the audit's headline cases in the after-replay:
  - MU #46 fair value back in the 3779–4087 band, or withheld with a note (FIN-301);
  - XOM per-share value without the equity-method double count (FIN-401);
  - MCD D&A at the filer's total (FIN-510);
  - BAC Q4 2025 on one presentation basis, or withheld (FIN-511);
  - LLY 2026 quarters carrying operating income or a note (FIN-507).

### Task V5: Every stored report renders correctly

- [ ] Copy `tmp/audit-2026-10-27/data/measure.pristine.db` to a fresh scratch path.
- [ ] Start classic and dossier previews (`METIS_UI_REDESIGN=1`) on free ports, with the isolation env set in the same command.
- [ ] For each of the 51 stored reports in `index.json`, GET:
  - `/company/<SYMBOL>/report/<id>`;
  - its `/print`;
  - `/api/export/<id>`.

  Expected: HTTP 200, no error boundary, and no console errors (Playwright).
- [ ] The audit export bytes match the golden hash added in R1, for every report whose stored bytes no fix touches.
- [ ] Planned display-time notes are present, such as MU #46's annualisation note and AI-301's peer caps (not available / own currency). Plans that mark a fix `display-only` or `needs reinterpretation` list the rest.
- [ ] Readability: `measure.mjs`, `parity.mjs` and `markers.mjs` on reports 50 and 52, in both layouts. Expected: the targets each R phase claimed (T1–T11), and evidence parity passes.
- [ ] Stop the servers and kill their process trees.
- [ ] Restore `next-env.d.ts` if it changed.

### Task V6: Data-only end-to-end runs and a report-text lint

- [ ] Generate data-only reports, with no AI passes, for every fixture symbol in an isolated profile (empty `aiDirectory`, `METIS_DATA_DIR` and `METIS_DB_PATH` in scratch). Expected: each completes. Every published figure carries a source and period. No unit or currency mismatch.
- [ ] Re-run the claim checker over the stored evidence of reports 43, 46, 48, 49 and 50. Tabulate validated, contradicted and unchecked counts before and after. Expected: every status change maps to a B1, B2 or B13 finding. Sample 30 claims that moved from validated to unchecked, and confirm each lacked proof.
- [ ] Text lint over all stored reports rendered through the merged display code, and over the fixture data-only reports. Zero hits allowed for:
  - `NaN`, `undefined`, `null`, `Infinity`, `[object`, `TBD`, `TODO`;
  - a doubled currency symbol, or a figure with no unit where its record has one;
  - a percent printed as a fraction;
  - repeated sentences (more than the targets);
  - jargon list matches above target;
  - contradictory status words in one claim;
  - a missing "Not investment advice" disclaimer.

### Task V7: Independent post-fix audit (round 5, until dry)

- [ ] Run the sweep, verify and variant workflow (`metis-audit-sweep-verify` script, new run id `r5`, ids 601–699) over merged main across all domains A–L. Use fresh slices, not the round 1–4 slices. Prior files include every earlier merged file, so known findings are not re-reported.

  Size it to the 5-hour window; it pauses without loss at a limit.
- [ ] Give the first round these known targets from the remediation, each to be proven or cleared with a probe:
  - B2's two recorded residuals: a range sign written with a spaced dash, and "EPS" read as a per-share basis;
  - B13's growth cells after a material, unlabelled re-presentation (decisions spec 4.5, O-1);
  - FCX's keyless 2024-12-31 row carrying fiscal year "2023" (decisions spec 4.6);
  - the residuals each batch's disposition note lists.
- [ ] Repeat with new slices until a round confirms no new Critical or High (dry).
- [ ] Every confirmed finding goes into a follow-up batch plan in the same format, and this plan reruns V1–V6 after it merges.

### Task V8: Method and professionalism review

- [ ] Four fresh reviewers, each with one lens and the code, docs and replay outputs (not this plan's conclusions):
  1. **Valuation practitioner:** DCF, excess-return, REIT and insurer methods against standard texts (Damodaran, McKinsey *Valuation*, CFA Institute curriculum).
  2. **Financial-reporting accountant:** XBRL tag use, S-X 5-03 captions, ASC 842 leases, ASC 205-20 re-presentation, 52/53-week calendars.
  3. **Verification and NLP:** what each claim status actually proves; checks for overstated trust.
  4. **Editor:** tone, clarity, consistency of terms, disclaimers, number formatting.

  Each checks that `docs/METHODOLOGY.md`, `README.md`, `docs/superpowers/specs/*` and `DECISIONS.md` match the code exactly (owner rule: docs stay 100% accurate), and that the report never states more certainty than its checks support.
- [ ] Each issue is verified by a second agent before it becomes a finding for the follow-up batch.

### Task V9: Sign-off

- [ ] Write `tmp/audit-2026-10-27/VERIFICATION.md`:
  - each gate with its command and result;
  - the probe classification table;
  - the replay diff summary with no unexplained rows;
  - the stored-report render table;
  - the status before/after table;
  - V7 and V8 outcomes;
  - every open item.
- [ ] Update the project memory note for the audit with the outcome.
- [ ] Send the owner a plain-English summary: what was verified, what was found and fixed in follow-ups, and anything left with the reason.

### Task V10 (owner approval required): live free-data run

- [ ] With approval only: a fresh keyless data-only run of the 45-ticker census. It uses free SEC EDGAR and Yahoo data and no AI passes, in an isolated profile, as the 2026-10-22 batch-2 note did. Expected: statuses and values agree with the V4 replay, within data drift that the run explains.

### Task V11 (owner approval and spend required): one paid end-to-end report

- [ ] With explicit approval only, about $1.43 per report (memory: thesis-testing-setup): one full report on one real ticker, so the AI passes, the claim checker and the display run together live. Compare its claim statuses with V6's expectations.
