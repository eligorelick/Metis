# Claim verifier: periods and windows are actually compared Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** A factual claim is marked `[validated]` only when every period, window, comparison base and recency word it states is established by the record or excerpt clause it cites, and the consistency period check never fails a sentence the citation check correctly accepts.

**Architecture:** All changes sit in the deterministic, no-model verify pass of Stage C. `src/pipeline/stageC/claimEvidence.ts` gains one period reader for claims (windows named loosely, the fiscal year-end instant, comparison bases set apart, a one-figure claim read whole) and three new gates (period-less records, a TTM window's start date, "latest" against the newest registered period); excerpt bindings stop lending a reporting period to forward-looking clauses and to figures before a comparison word. `src/pipeline/stageC/consistency.ts` shares the comparison-base reader, checks a base against the cited growth figure's own base period, and compares fiscal-labelled records through `periodsAgree` before falling back to calendar-year sets. No payload, prompt, Stage B figure or stored report changes.

**Tech Stack:** TypeScript 5 (strict), Vitest 3 (`vitest.config.ts`, `vitest.risk.config.ts` with per-file 85/75/85/85 floors on `claimEvidence.ts`, `consistency.ts`, `provenance.ts`, `passes.ts`), Node 24, Next.js 16 app (no route, page or proxy file is touched by this batch).

**Spec:** `tmp/audit-2026-10-27/REPORT.md` (section 7, batch B1) and `tmp/audit-2026-10-27/findings.json` (both git-ignored); the owner decisions are recorded in this plan's "Owner decisions" section and, at merge, in the batch's `D-next` entry. (`docs/superpowers/specs/2026-10-27-audit-remediation-decisions.md` does not exist at `6542531`. B3, which merges first, commits and registers it. Its C-11 sets this batch's expected outcome for NVDA #48's latest-year claims: see OD-1, Task 3A and Task 13.)

**Branch:** `fix/claim-verifier-periods`, cut from an up-to-date `main` (`git fetch origin && git switch -c fix/claim-verifier-periods origin/main`). HEAD at planning time: `6542531` (== `origin/main`). B3 merges first (master plan slot 1, Task M2 Step 1), so its Task 8E labels and Task 8F withheld titles are on this branch's base; Tasks 3, 3A and 13 expect them.

**Findings (12):** AI-106, AI-302, AI-302-V1, AI-303, AI-303-V1, AI-303-V3, AI-303-V4, AI-402, AI-402-V1, AI-402-V2, AI-404, AI-405. AI-303-V2 (rejected at review as a duplicate of AI-303 / AI-303-V1) is covered by Task 3's excerpt-path test, as the review note on AI-303 requires.

## Global Constraints

- Failing test first for every finding; if a finding cannot be made to fail on HEAD, skip it and say so in the PR (all 12 were re-read against HEAD `6542531` and still read true; see "Findings re-read at HEAD" below).
- Smallest change that fixes the whole class: no ticker-, issuer- or report-specific code, no unrelated refactoring, no new source module (a new `src/**/*.ts` file would have to be placed in the coverage manifests, `tests/risk.coverage.test.ts`).
- One commit per task (Tasks 1-9), staging files by name: `git add <path> ...`; never `git add -A` or `git add .` (the git-ignored `tmp/` audit folder and the untracked `brag-output*` folders must stay out).
- Tests are hermetic: no live network (the shared `tests/setup` guard rejects non-loopback fetch), no market-data, SEC or AI-provider call, no paid call, never a report for a real ticker. Run `npx vitest run <file> -t "<name>"`; never the full suite while other planners/implementers share the machine, except the batch-level `npm run verify` in foreground chunks.
- **Verifier sweep.** Every task's Step 4 ends with this one targeted command (all 33 test files that call `runVerifyPass` or `validateClaimNumericSupport` at `6542531`, so a caller the per-task list forgot is still run): `npx vitest run tests/stageC.claimPeriods.audit20261027.test.ts tests/currency.analystEstimates.test.ts tests/currency.payload.test.ts tests/currentReports.test.ts tests/dataBundle.annualGeography.test.ts tests/edgar.debtCompleteness.test.ts tests/edgar.filingFacts.test.ts tests/evidenceSources.correctness.test.ts tests/filingDisclosures.composition.test.ts tests/jobRunner.test.ts tests/multiples.basisLabel.audit20261022.test.ts tests/report.sourceFacts.test.ts tests/risk.runtime.coverage.test.ts tests/stageB.reviewFinancials.test.ts tests/stageC.claimEvidence.d66.test.ts tests/stageC.claimEvidence.fraction.test.ts tests/stageC.claimEvidence.isoRange.test.ts tests/stageC.claimEvidence.perShareLabel.test.ts tests/stageC.contradictedValueOnly.test.ts tests/stageC.dividendUnits.test.ts tests/stageC.excerptCurrencyScale.test.ts tests/stageC.excerptNumbers.test.ts tests/stageC.factualValidation.test.ts tests/stageC.gapCitations.test.ts tests/stageC.index.test.ts tests/stageC.indicatorUnits.test.ts tests/stageC.judgeReferenceParity.test.ts tests/stageC.liveVerifier.test.ts tests/stageC.macdUnits.test.ts tests/stageC.metricContext.test.ts tests/stageC.payload.passes.test.ts tests/stageC.periodContext.test.ts tests/stageC.tableScale.test.ts tests/stageC.verifyChecks.test.ts` (before Task 10, `jobRunner.test.ts` and `stageC.payload.passes.test.ts` still pin the old stamps and must pass unchanged). A failure in a file the task's own list did not name is investigated like any other: an intended delta of this task gets a dated comment naming the finding, anything else is a regression. After rebasing on B3, regenerate the list (`grep -rlE --exclude='*.db*' 'runVerifyPass|validateClaimNumericSupport' tests`) and run the files B3 added too. These include at least `tests/stageC.latestFiscalLabels.test.ts`, to which Task 3A adds a fourth test, and `tests/stageC.releaseFiscalLabel.test.ts`.
- Fixtures: synthetic records shaped like the NVDA #50 / AMZN #43 registry rows, with values taken from public SEC text already committed (`fixtures/edgar/nvda-current-reports/q2fy27-ex99-1.txt`, `q2fy27-ex99-2.txt`; the AMZN EX-99.1 sentences quoted in `tests/currentReports.test.ts`) or round synthetic numbers. Never copy a row, value or label from `tmp/audit-2026-10-27/agents/m1-sweep-C1/payloads/*.registry.json`: those dumps mix 310 (#50) and 169 (#43) FMP-origin rows with EDGAR rows, and `docs/DATA-RIGHTS.md` forbids committing paid-vendor (FMP) data.
- Do not run the audit probes (`tmp/audit-2026-10-27/probes/*.probe.ts`): AI-302-V1, AI-402, AI-402-V1, AI-402-V2, AI-404 and AI-405 rewrite evidence logs under `tmp/audit-2026-10-27/agents/`. Their assertions are reproduced as hermetic tests below; the before/after replay (Task 13) is the probe-equivalent proof.
- Never open a `*.db`, `*.db-wal` or `*.db-shm` file; exclude `*.db*` from every recursive grep (`grep -r --exclude='*.db*'`).
- Never weaken a check or loosen an existing test to make it pass. A test that pins the old, wrong behaviour may only move when the move is one of the intended deltas listed in that task's Step 5, with a dated comment naming the finding.
- Version stamps: a change in what a `[validated]` mark means moves `REPORT_SPEC_VERSION` (`src/report/schema.ts:139`, now `1.44.0`) and `PIPELINE_VERSION` (`src/pipeline/jobRunner.ts:527`, now `stage-c-1.6.9`); `tests/report.versionStamps.test.ts:88,94` moves with them. `PAYLOAD_VERSION` (`1.48.0`), `STAGE_B_IMPLEMENTATION_VERSION` and `SCORE_BANDS_VERSION` do not move: no payload, prompt or figure changes. The payload golden (`tests/stageC.payload.passes.test.ts`) must NOT move; if it does, stop and find out why.
- Stored reports are never rewritten (D-67). Every finding in this batch has `storedReportImpact: none`: stored reports keep the statuses they were verified with; only reports verified after the merge use the new rules.
- `docs/METHODOLOGY.md` and `README.md` lines that describe the verifier move in the same commit as the behaviour they describe (owner rule "keep markdown accurate"). `CHANGELOG.md` records dated development batches, so the batch's one entry (a bullet per task, the stamps and the current-version line) is written in Task 12 on the same branch, before the PR.
- A disposition note `docs/audit/2026-10-27-audit-fix-01-claim-verifier-periods.md`, registered in `tests/repository.release.test.ts` (`ALLOWED_MARKDOWN`), together with this plan file. B3 commits and registers the decisions spec; do not register it twice. Committed markdown must carry no absolute home path (`unsafePublicDocument`): repo-relative paths only.
- `docs/audit/DECISIONS.md` entry headed `D-next` (the number is assigned at merge time; parallel batches renumber D-numbers, stamp numbers and the delta-group name, see the memory note on parallel batches).
- `npm run audit:deltas -- --write --group audit-b1-claim-verifier-periods-20261027` only after confirming the only moved leaf is `report.meta.specVersion`.
- Before/after proof by replaying stored run inputs with no provider or model calls (Task 13); `npm run verify` in foreground chunks; a fresh reviewer over the whole diff; a plain-English PR description.
- AGENTS.md: no file under `src/app`, no route handler and no proxy is touched, so no `node_modules/next/dist/docs/` guide is required. If an implementer finds they must touch one, stop and read `node_modules/next/dist/docs/01-app/` for the file kind first.

## Findings re-read at HEAD

Every finding still reads true at `6542531` (no source line cited by a B1 finding changed since the audit):

| finding | evidence at HEAD |
|---|---|
| AI-106 | `src/pipeline/stageC/provenance.ts:485` `if (supplied == null \|\| registered === null) return true;`, reached from `claimEvidence.ts:693`; the `record.period === null` branch at `:705` is reachable only for windows. `git show 2b77104` removed `record.period === null \|\|` from the gate. |
| AI-302 | `claimEvidence.ts:694` accepts `period.key === window.start` with no second date. |
| AI-302-V1 | `claimEvidence.ts:188` (`•` is a hard boundary), `:476-482` (title periods), `:583` (one `inherited` set per excerpt), `:775` (a period-less clause matches the inherited set); no forward-looking guard (`grep -n "expected to\|outlook" claimEvidence.ts` finds nothing). |
| AI-303, AI-303-V1, AI-303-V3 | `claimEvidence.ts:162-165` reads windows only after for/during/over (or annual/quarterly/full-year); `:236-237` lists `latest, recent, most, same, end, quarter, year, fiscal, year-end` as `PERIOD_DESCRIPTORS`; `:305` drops them. |
| AI-303-V4 | no recency comparison anywhere (`grep -n -i "latest\|most recent\|newest"` in `claimEvidence.ts` and `consistency.ts` finds only the descriptor list and comments). |
| AI-402, AI-402-V1 | `claimEvidence.ts:193` ends a clause only at `;`, newline, bullet, sentence end or while/whereas/versus/vs/but/and; `:217` `periods: periodLabels(ownText)`; `consistency.ts:1553` skips excerpt citations. |
| AI-402-V2 | `claimEvidence.ts:661` + `:217` include the base in `own.periods`; `consistency.ts:738-769` collects every year phrase, base included. |
| AI-404 | `claimEvidence.ts:217`, `:703`, `:741`, `:770-775` read each clause alone; `consistency.ts:1574` compares calendar-year sets. |
| AI-405 | `consistency.ts:1574` sends every non-FY phrase to `phraseNamesRecordYear` (`:711-730`); `provenance.ts:446-454` reads a 52/53-week end a week earlier; the module doc `consistency.ts:15-22` still says the check "only writes a log entry", but `passes.ts:3173-3182` demotes the claim. Same class, found at review: `PERIOD_PATTERNS` (`consistency.ts:692-699`) cannot read a spelled fiscal period ("the second quarter of fiscal 2027"), so only its "2027" is compared with the 2026-07-26 record and a claim the citation check validates (it reads "Q2 FY2027") is demoted (review run at HEAD: `unchecked/period-word-mismatch`, note `names "2027"`). |

No finding is skipped or disputed.

## Owner decisions

The owner delegated these calls ("Use your recommendation based on research to make this a professional accurate repository"). Each is recorded in the batch's `D-next` entry.

### OD-1. A period-less record establishes only what it carries (AI-106, AI-303, AI-303-V1)

- **Question.** When a claim names a fiscal year, quarter, date or window and cites a record whose `period` is null (181 of 940 rows in NVDA #50: `computed.growth-margins.*`, multiples, technicals, quote, forensics, segments, macro), or a dated record without fiscal metadata, should the claim stay unchecked, or should those records gain a fiscal label so they can establish the period?
- **Decision.** Verifier-only, no payload change. A record with no period establishes only its own `asOf` date, a date its `periodContext` declares (`at`, or a duration's `end`), and a fiscal label it declares (`fiscalPeriod` / `periodContext.fiscalLabel`, matched only when the claim's period reads as an FY label: "FY2026", "Q2 FY2027", or "the second quarter of fiscal 2027", which the claim reader already labels "Q2 FY2027"). Any other year, quarter, date or window named against it leaves the claim unverified (`period-mismatch`), never validated and never contradicted (F-22). A bare "fiscal 2026" is read by the claim reader as the year 2026 (the word "fiscal" is dropped), so it stays unverified against such a record, as it already does against a dated FY2026 row (review run at HEAD: "Revenue for fiscal 2026 was USD 215.94 billion." against NVDA's FY2026 annual row is `unchecked/period-mismatch`); teaching the claim reader "fiscal YYYY" is a recall gain left as a residual. A dated record without fiscal metadata establishes its date only; it does not establish an annual or quarterly window (no calendar inference, as D-66 requires). Windows a period-less record's own label names ("over TTM", "latest-quarter …") stay established (D-66): the label's window is part of the figure's definition, as the context is part of an XBRL fact. This is the orchestrator's default ("a claim that names a period or window and cites a record with no period stays unchecked") refined by the finding's own exception: a period the record itself carries (its as-of date, its declared context date or fiscal label, its label's window) is established; nothing else is.
- **Alternatives rejected.** (a) Give `(latest)` computed rows a fiscal label now: correct in principle, but it changes the payload (`PAYLOAD_VERSION`, the payload golden and the prompt bytes) and belongs with the payload-record batch (B3); it can follow without reopening this rule. B3 Task 8E now does it and merges first (decisions spec C-11). This batch still changes no payload, and its rule is unchanged. (b) Infer "annual" when a period-less row's `asOf` equals a registered fiscal-year-end statement row: an inference, not a statement, and wrong for a TTM-based row whose window happens to end at a year end.
- **Revises.** None recorded: this restores the intent of the F-22 owner decision (`DECISIONS.md:2250`, METHODOLOGY "a missing or null record period … unverified") that commit `2b77104` broke. Measured cost, restated for C-11 and master plan conflict row 55 (Task 13 confirms it):
  - At planning time (HEAD `6542531`, no B3), NVDA #48's "ROIC for the latest fiscal year was 149.8%." (period-less `ROIC (latest)`) and "The balance-sheet accrual ratio for the same year was 0.64x." (dated `2026-01-25`, no fiscal metadata) moved from validated to unverified.
  - B3 Task 8E merges first. It gives both records `fiscalPeriod: "FY2026"` and the period 2026-01-25, the annual statement cell's two fields. Under this rule the label establishes the fiscal year, and through `basisWindows` the annual window, so both claims stay validated. No stored claim loses its validation through OD-1.
  - "ROIC for FY2025 was 149.8%." (a constructed claim, not a stored one) is unverified after this batch. With B3 Task 8E as amended at B3's post-integration review, it is already unverified on this batch's base, because the record's period makes the consistency period check run (B3 Task 8E, Step 5).
- **Sources.**
  1. XBRL 2.1 Recommendation, §4.6.1: "All items MUST have a context."; §4.7.2: the period "MUST contain forever or a valid sequence of startDate and endDate" (duration) or an `instant` (point in time). A value carries the period its context states and no other. https://www.xbrl.org/Specification/XBRL-2.1/REC-2003-12-31/XBRL-2.1-REC-2003-12-31+corrected-errata-2013-02-20.html
  2. Rashkin et al., "Measuring Attribution in Natural Language Generation Models" (AIS). The definition: a pair is attributable to a source P iff a generic hearer would affirm "According to P, s"; the annotation instructions: "Annotators are instructed to only mark output as attributable if it is clear that all parts can be directly inferred from the source", and output "changing only slight details" is "not fully attributable" (checked against the arXiv PDF at review). A period the record does not carry is such a part. https://arxiv.org/abs/2112.12870
  3. SEC Regulation S-X Rule 10-01(c)(1): a 10-Q carries "An interim balance sheet as of the end of the most recent fiscal quarter" and "a balance sheet as of the end of the preceding fiscal year", so one filing registers several periods for the same line; the period a figure belongs to is data, not something prose can supply. https://www.law.cornell.edu/cfr/text/17/210.10-01

### OD-2. A trailing window's start date counts only inside the complete interval (AI-302)

- **Question.** May a TTM/YTD record ("ttm: 2025-07-27 to 2026-07-26") validate prose that names only its start date ("for the trailing twelve months ended 2025-07-27")?
- **Decision.** No. A lone date names the window's end. The start date agrees only when the claim also names the end date (a complete interval, "from 2025-07-27 to 2026-07-26"), the interval-proof principle of D-82.
- **Alternatives rejected.** Admit the start after "from/since/beginning": "since 2025-07-27" states no end, so it does not identify the window, and the window start is often also the prior-year quarter end that other payload rows carry (NVDA's Q2 FY2026 ended 2025-07-27), which is exactly the slip the check must catch.
- **Revises.** D-59's start-date allowance added in commit `149e18d` (`DECISIONS.md:444` records only "an exact date inside or at the end of a window"); extends D-82 (`DECISIONS.md:1928`), whose scope had left the TTM rule unchanged.
- **Sources.**
  1. XBRL 2.1 §4.7.2: a duration is "A period beginning and ending as specified" (startDate and endDate together). https://www.xbrl.org/Specification/XBRL-2.1/REC-2003-12-31/XBRL-2.1-REC-2003-12-31+corrected-errata-2013-02-20.html
  2. SEC Regulation S-X Rule 10-01(c)(2): interim statements of comprehensive income cover "the period between the end of the preceding fiscal year and the end of the most recent fiscal quarter", and "may also be presented for the cumulative twelve month period ended during the most recent fiscal quarter": a trailing twelve-month period is named by its end, and a start is meaningful only with its end. https://www.law.cornell.edu/cfr/text/17/210.10-01

### OD-3. A forward-looking clause is never read as a reported result (AI-302-V1)

- **Question.** Should an excerpt clause that states an expectation ("GAAP and non-GAAP gross margins are expected to be 74.0%, plus or minus 50 basis points.") inherit the excerpt's reporting period (D-63), and may it bind a claim that states a result?
- **Decision.** Two rules, both on the excerpt path. (1) A forward-looking source clause ("is/are expected to", "expects", "anticipates", "projected/forecast/estimated/guided to", "outlook", and management guidance: "guidance for/of/is/was/issued/range", "our/its/management's … guidance") inherits no period and no window from the excerpt's title: it binds only a claim naming the period the clause itself names, or none. (2) Modality must match: a forward-looking clause binds only a forward-looking claim, and a result clause only a result claim, the same way D-66 already refuses to bind a change magnitude to a level. This is the orchestrator's default ("forward-looking clauses (outlook, guidance, "expects") do not inherit the excerpt's reporting period") plus rule (2), which closes the remaining hole the verifier found ("GAAP and non-GAAP gross margins were 74.0%." with no period still validated against the guide). Guidance counts only as management's guidance, so accounting-standard "guidance" in a 10-K note ("under the new lease accounting guidance") does not make a result clause forward-looking. A result clause that also cites guidance ("above guidance of $91.0 billion") is read as forward-looking: its result figure then binds only a claim that also names the guidance, which is a recall cost in the fail-closed direction (no observed NVDA or AMZN result clause has that shape). It does not decide B2's AI-305 noun-phrase strictness; B2 may tighten binding further on top of it.
- **Alternatives rejected.** (a) Inheritance rule alone: leaves a guided figure stated as a past result without a period `[validated]`. (b) Carry an outlook lead's period across its bullets ("Outlook for the third quarter of fiscal 2027 is as follows: • …"): a recall gain only (it would let the correctly dated Q3 guide validate), needs heading and bullet-run detection, and is not needed to stop a wrong validation; left as a follow-up. (c) Leave the noun "guidance" out entirely (the plan's first draft): "Our guidance for third-quarter revenue is $108.0 billion." in a Q2 release would still inherit the Q2 period and validate "Revenue for Q2 FY2027 was USD 108.0 billion." (the AI-302-V1 defect in another spelling), and a claim saying "guidance" could never be recognised as forward-looking; rejected at review.
- **Revises.** D-63 (`DECISIONS.md:252`: "A clause naming no period takes the excerpt's own").
- **Sources.**
  1. 15 U.S.C. §78u-5(i)(1)(A): a forward-looking statement is "a statement containing a projection of revenues, income (including income loss), earnings (including earnings loss) per share, capital expenditures, dividends, capital structure, or other financial items". The law treats a projection as a different kind of statement from a reported result. https://www.law.cornell.edu/uscode/text/15/78u-5
  2. Saurí and Pustejovsky, "From structure to interpretation: A double-layered annotation for event factuality" (LREC 2008 workshop paper; the annotation scheme behind FactBank): systems must "recognize whether events are presented as corresponding to real situations in the world, situations that have not happened, or situations of uncertain status", and "Inferences derived from events that have not happened, or that are only possible, are different from those derived from events judged as factual in nature" (both checked against the PDF at review). https://www.cs.brandeis.edu/~roser/pubs/sauriPustejovsky_lrec08_2.pdf
  3. NVIDIA's own release (the committed SEC fixture `fixtures/edgar/nvda-current-reports/q2fy27-ex99-1.txt`) labels "outlook for the third quarter of fiscal 2027" as forward-looking statements "within the meaning of Section 27A of the Securities Act of 1933 … and Section 21E of the Securities Exchange Act of 1934".

### Calls made in this batch without a recorded owner decision

These findings carry `ownerDecisionNeeded: false`; the calls are stated here so the reviewer can check them.

- **C-1. Comparison-base grammar for the verifier (AI-402, AI-402-V1, AI-402-V2).** A period phrase that directly follows a comparison cue in its own clause, with only amounts and connecting words between them, is the comparison's base (D-98's rule). Cues: "compared with/to", "as compared with/to", "versus", "vs.", "relative to", "against", "than", "above", "below"; "from"/"over" after a change word with an optional magnitude ("up 23% from", "grew 20% over", "increased from"); and a bare "from" only when at least one amount stands between it and the period ("grew to $12.4 billion from $10.1 billion in the second quarter of fiscal 2025", D-98's own example shape). A period directly after a bare "from" or "over" is not a base: "from 2025-07-27 to 2026-07-26" is an interval (OD-2), "from the third quarter 2026 onward" a start, "capex over fiscal 2027" a window and "over $10 billion in fiscal 2027" means "more than" (the misreading recorded as known issue B1-3 against D-98's release parser, `src/edgar/currentReports.ts:175`). An amount range ("from $10.0 billion to $10.4 billion for the fourth quarter of 2026") is not a base either: "to" is not filler. Amounts in the filler may carry ISO currency codes ("compared with USD 10.1 billion"). This is narrower than D-98's cue list for the release parser (which takes any "from"/"over"); it does not revise D-98, and the release parser in `currentReports.ts` is not changed (B9 owns B1-3). Sources: D-98 (`DECISIONS.md:2081`); Amazon's public EX-99.1 (SEC filing 0001018724-26-000024) wording "AWS segment operating income was $16.6 billion, compared with $10.2 billion in second quarter 2025."
- **C-2. A base is checked as the base.** On an excerpt, a base the claim names must be a base the source clause names. On a record, the consistency period check compares a base with the cited growth figure's own base period (read from the record's id or label): year over year, the record's ISO period 12 months earlier and its fiscal label one fiscal year earlier ("Q2 FY2027" → "Q2 FY2026"); quarter over quarter, 3 months earlier and the previous fiscal quarter ("Q1 FY2027" → "Q4 FY2026"). The base is compared by the same rule C-5 gives own phrases: an FY-labelled base ("Q2 FY2026", "the second quarter of fiscal 2026") only against the shifted fiscal label (not checked when the record has none), any other base through `periodsAgree` against the shifted label first and then by calendar year of the shifted date. Comparing an FY-labelled base by calendar year (the first draft) would fail NVDA's correct "compared with Q2 FY2026" against the base quarter ended 2025-07-27 ({2026} against {2025}): the AI-405 error again (review run at HEAD shows that sentence already gets that false finding). For a record with no such basis the base is not checked (no finding). This keeps the fail-closed control (the year-ago record's 13.33% with "compared with second quarter 2025" stays unverified) that dropping bases outright would lose.
- **C-3. A one-figure claim is read whole (AI-404).** Its periods, bases, recency and modality come from the whole claim; a claim with several figures keeps per-clause reading. D-82 already reads the whole claim for intervals.
- **C-4. Fiscal-year-end instants and "latest" (AI-303-V3, AI-303-V4).** "At fiscal year-end", "at the end of the fiscal year" name the fiscal-year-end instant, established only by an FY or Q4 fiscal label or a fiscal-year basis. "Latest"/"most recent"/"newest" on a figure from a reported-period series (a registry id carrying exactly one ISO date equal to the record's own period and not after its as-of: statement, quarterly-trend and segment rows; never forecasts or estimates) requires that no later period of the same series is registered. Source: S-X Rule 10-01(c)(1) distinguishes "the end of the most recent fiscal quarter" from "the end of the preceding fiscal year" (link above).
- **C-5. The consistency period check is never stricter than the citation check (AI-405).** The check reads a spelled fiscal period as the citation check does: "the second quarter of fiscal 2027" is the phrase "Q2 FY2027" and "fiscal 2025" / "fiscal year 2025" the phrase "FY2025", both compared through `periodsAgree` against the issuer's fiscal label and not checked when the record has none (D-66: "explicit fiscal contradictions require an established fiscal basis"). For a phrase without an FY prefix it passes when `periodsAgree` accepts it against an issuer fiscal label, and otherwise falls back to the calendar-year sets (so it only removes false failures). An ISO date against a record registered only under a fiscal label ("Q2 FY2027") passes when it equals the record's `asOf` or `periodContext` end and is otherwise not checked. Source: 26 CFR §1.441-2(a)(1) defines a 52-53-week year that ends always on the same day of the week, on "Whatever date this same day of the week falls that is the nearest to the last day of the calendar month", and §1.441-2(c)(1) deems it "to end or close on the last day of the calendar month nearest to the last day of the 52-53-week taxable year", so "fiscal 2025" ending 2026-01-03 is the 2025 year. https://www.law.cornell.edu/cfr/text/26/1.441-2
- **C-6. Windows on the excerpt path are compared as periods.** A claim's window (however written) must be the source clause's own window or, when the clause names no period, the window the excerpt's own title states ("quarter ended …", a `Q<n> FY<yyyy>` label → quarter; "year ended …", an `FY<yyyy>` label → annual and the fiscal-year-end instant). Window words are therefore not required as metric words of the source clause. This extends D-63's inheritance to the window and is what lets the correct "AWS segment operating income in the quarter ended 2026-06-30 was USD 16.6 billion." validate once AI-402 stops lending the base period.

## Review Focus

Input classes no existing test exercises; each line is a test in the named task.

1. **An interval or start phrase after a bare "from" is not a comparison base** ("from 2025-07-27 to 2026-07-26", "from the third quarter 2026 onward"): the interval must keep validating (Task 2 control) and the start must not be moved out of the figure's periods (Task 6, test `AI-402: a bare "from" opens an interval, not a comparison base`).
2. **Words that are not windows**: "year-one", "five-year period", "a year ago", "prior-year quarter", "each fiscal year's", "per year", "half-year", "four quarters", "a quarter of revenue". Correct claims using them must stay validated (Task 3, test `AI-303: horizons, plurals and comparison words are not windows`).
3. **The TracedNumber path shares `validateClaimNumericSupport`** (`passes.ts:2984` builds `"<unit> <row label> <period>: <amount>"`): the D-63 inventory key number must still verify, and a key number dated to the reporting quarter but citing an outlook bullet must not (Task 8, test `AI-302-V1: a key number dated to the reported quarter does not verify against an outlook bullet`).
4. **Multi-figure claims keep per-clause reading**: "Operating margin was 31% in 2026; gross margin was 43% in 2025." still validates both figures against a source stating the same, so a two-figure claim whose clauses name different periods is not read whole (Task 7, test `AI-404: a claim with several figures still reads each clause`).
5. **A wrong base or a stale title**: a claim echoing the source with the wrong base year ("compared with second quarter 2024") is not validated on the excerpt path, and gets a period finding on the record path (Task 6); a claim matching only an excerpt title's fiscal label still validates under D-63. A stale title (AMZN #43's snapshot titles its Q2 2026 release "Q2 FY2025") is no longer this batch's residual: B3 Task 8F, which merges first, withholds a title label the run's own statement rows contradict, and B9 Task 21A does the same in the guidance tables (Task 6, test `AI-402: a figure before the comparison word reads the excerpt's own period`, which uses a correct title).
6. **Fiscal labels in the period check and in bases**: "the second quarter of fiscal 2027", "fiscal year 2025" and a base "compared with Q2 FY2026" against NVIDIA-style fiscal labels must not draw a calendar-year finding (Task 6, test `AI-402-V2: a fiscal-label base …`; Task 9, test `AI-405: a spelled fiscal quarter …`).
7. **"Guidance" in two senses**: management guidance is forward-looking, accounting-standard guidance in a 10-K note is not (Task 8, test `AI-302-V1: management guidance is forward-looking; accounting guidance is not`).

## Tasks

### Task 0: Baseline replay before any change

- [ ] **Step 1.** Cut the branch (`git fetch origin && git switch -c fix/claim-verifier-periods origin/main`) and confirm `git rev-parse HEAD` equals `origin/main`. Confirm B3 is on the base: `npx vitest run tests/stageC.latestFiscalLabels.test.ts tests/stageC.releaseFiscalLabel.test.ts` finds both files and passes. If not, stop. B1 ships after B3 (master plan Task M2), and Tasks 3A and 13 assume Task 8E.
- [ ] **Step 2.** Create the replay harness of Task 13 (it lives under the git-ignored `tmp/audit-2026-10-27/replay/b1/`, so it is never committed) and run it once with label `before` on the unchanged branch. Keep `tmp/audit-2026-10-27/replay/b1/before-{43,46,48,49,50}.json`. Nothing else in this plan may run before this baseline exists.

### Task 1: A period-less record establishes only what it carries (AI-106)

**Files:**
- Modify: `src/pipeline/stageC/claimEvidence.ts:690-708` (`fiscalPeriod`, `periodAgrees`, the gate's message)
- Test (create): `tests/stageC.claimPeriods.audit20261027.test.ts`

**Interfaces:**
- Consumes: `NumericProvenanceRecord` (`period: string | null`, `asOf: string | null`, `fiscalPeriod?: string`, `periodContext?: PeriodContext`), `periodsAgree(supplied, registered, issuerFiscalPeriod)` from `provenance.ts` (unchanged: `matchProvenanceRecord` and `passes.ts:3052` keep its null-period behaviour, which B2's AI-408 owns).
- Produces: inside `validateClaimNumericSupport`, a local `periodlessEstablishes(period: PeriodReference): boolean` used by `periodAgrees` when `record.period === null`; no exported signature changes.

- [ ] **Step 1: Write the failing test.** Create the test file with shared helpers that every later task reuses:

```ts
// tests/stageC.claimPeriods.audit20261027.test.ts
// Audit 2026-10-27 batch B1. Records are synthetic, shaped like NVDA #50 /
// AMZN #43 EDGAR registry rows; amounts come from the committed SEC fixtures
// (fixtures/edgar/nvda-current-reports/) or are round numbers. No provider,
// network, database or model call.
const NO_MODEL = { model: "must-not-call", runPass: async () => { throw new Error("no model call permitted"); } } as unknown as PassDeps;
function rec(fields: Partial<NumericProvenanceRecord> & Pick<NumericProvenanceRecord, "id" | "value">): NumericProvenanceRecord;
  // defaults: kind "provider", unit "currency", currency "USD", period null, asOf "2026-07-26",
  // origin "edgar:test", formulaVersion null, displayPrecision 4
async function cite(registry: NumericProvenanceRecord[], id: string, text: string): Promise<{
  entry: VerificationLogEntry; out: VerifyResult<object>; periodRow: VerificationLogEntry | undefined; manifest: string[] }>;
  // payload { provenanceRegistry: registry, citationRegistry: [], filings: [], companyName: "NVIDIA Corporation", symbol: "NVDA" };
  // claim { label: "FACT", text, source: id, asOf: record.asOf }; entry = the factual-claim row with no `check`;
  // periodRow = out.log.find(e => e.check === "period"); manifest = consistencyManifestEntries(out.checks).map(m => m.field)
async function citeExcerpt(excerpt: TextExcerpt, text: string): Promise<{ entry: VerificationLogEntry; out: VerifyResult<object> }>;
  // payload { provenanceRegistry: [USD_ROW], citationRegistry: [{ id: excerpt.source, asOf: excerpt.asOf, origin: excerpt.source, kind: "payload-text" }],
  //           filings: [excerpt], companyName: "NVIDIA Corporation", symbol: "NVDA" }; claim asOf = excerpt.asOf
// One USD statement row, so a printed "$" resolves to the issuer's reporting currency
// (D-45: passes.ts derives reportingCurrency from the payload.statements.* rows). Without it
// every "$" source figure is unchecked/currency-mismatch at HEAD and after (review run), so the
// excerpt defect rows would pass vacuously and the excerpt controls could never validate.
const USD_ROW = rec({ id: "payload.statements.balance-sheet-quarterly.2026-07-26.cash-and-equivalents", label: "cash and equivalents",
  value: 1e9, period: "2026-07-26", origin: "edgar:balance-sheet(quarter)" });
const ex = (source: string, asOf: string, title: string, text: string): TextExcerpt =>
  ({ source, asOf, title, text, truncated: false, originalChars: text.length });
```

`rec()` has no `label` default: every record below passes its `label` (a record without one has no metric reading, so every claim against it would be `text-context-mismatch`). Imports: `runVerifyPass`, `type PassDeps`, `type VerifyResult` from `@/pipeline/stageC/passes`; `validateClaimNumericSupport`, and (from Tasks 3 and 5) `windowsNamed`, `reportedSeriesLatest` from `@/pipeline/stageC/claimEvidence`; `consistencyManifestEntries` and (Task 6) `comparisonCueEnd` from `@/pipeline/stageC/consistency`; `type ContextPayload`, `type TextExcerpt` from `@/pipeline/stageC/payload`; `type NumericProvenanceRecord` from `@/pipeline/stageC/provenance`; `type VerificationLogEntry` from `@/report/schema`; `readFileSync` and `path` from node.

**Shared fixtures (exact literals; the task texts below summarise them).** These are the literals the review ran at `6542531` (`tmp/audit-2026-10-27/plans/b1-review/head.review.ts`, git-ignored); every "at HEAD" status this plan states for a Step 1 line was observed there.

```ts
const Q_REV = rec({ id: "payload.statements.income-statement-quarterly.2026-07-26.revenue", label: "revenue", value: 96_221_000_000, period: "2026-07-26",
  periodContext: { kind: "duration", start: "2026-04-27", end: "2026-07-26", basis: "fiscal-quarter", fiscalLabel: "Q2 FY2027" }, fiscalPeriod: "Q2 FY2027", origin: "edgar:income-statement(quarter)" });
const Q1_REV = rec({ id: "payload.statements.income-statement-quarterly.2026-04-26.revenue", label: "revenue", value: 81_615_000_000, period: "2026-04-26",
  periodContext: { kind: "duration", start: "2026-01-26", end: "2026-04-26", basis: "fiscal-quarter", fiscalLabel: "Q1 FY2027" }, fiscalPeriod: "Q1 FY2027", origin: "edgar:income-statement(quarter)" });
const FY_REV = rec({ id: "payload.statements.income-statement-annual.2026-01-25.revenue", label: "revenue", value: 215_938_000_000, period: "2026-01-25",
  periodContext: { kind: "duration", start: "2025-01-27", end: "2026-01-25", basis: "fiscal-year", fiscalLabel: "FY2026" }, fiscalPeriod: "FY2026", asOf: "2026-01-25", origin: "edgar:income-statement(annual)" });
const Q_DEBT = rec({ id: "payload.statements.balance-sheet-quarterly.2026-07-26.total-debt", label: "total debt", value: 30e9, period: "2026-07-26",
  periodContext: { kind: "instant", at: "2026-07-26", fiscalLabel: "Q2 FY2027" }, fiscalPeriod: "Q2 FY2027", origin: "edgar:balance-sheet(quarter)" });
const Q1_DEBT = rec({ id: "payload.statements.balance-sheet-quarterly.2026-04-26.total-debt", label: "total debt", value: 20e9, period: "2026-04-26",
  periodContext: { kind: "instant", at: "2026-04-26", fiscalLabel: "Q1 FY2027" }, fiscalPeriod: "Q1 FY2027", origin: "edgar:balance-sheet(quarter)" });
const FY_DEBT = rec({ id: "payload.statements.balance-sheet-annual.2026-01-25.total-debt", label: "total debt", value: 10e9, period: "2026-01-25",
  periodContext: { kind: "instant", at: "2026-01-25", fiscalLabel: "FY2026" }, fiscalPeriod: "FY2026", asOf: "2026-01-25", origin: "edgar:balance-sheet(annual)" });
const Q4_DEBT = rec({ id: "payload.statements.balance-sheet-quarterly.2026-01-25.total-debt", label: "total debt", value: 10e9, period: "2026-01-25",
  periodContext: { kind: "instant", at: "2026-01-25", fiscalLabel: "Q4 FY2026" }, fiscalPeriod: "Q4 FY2026", asOf: "2026-01-25", origin: "edgar:balance-sheet(quarter)" });
const CC_DEBT = rec({ id: "computed.current-capital.total-debt-including-leases", label: "total debt including leases", kind: "computed", value: 12e9, period: "2026-07-26", origin: "computed.capital.current.debtBridge.totalDebtIncludingLeases" });
const NV_YOY = rec({ id: "computed.quarterly-trend.revenue-growth-year-over-year-quarter-ended-2026-07-26", label: "revenue growth year over year, quarter ended 2026-07-26",
  kind: "computed", unit: "percent", currency: null, value: 105.85, period: "2026-07-26", fiscalPeriod: "Q2 FY2027", origin: "computed.quarterly-trend" });
const NV_QOQ = rec({ ...NV_YOY, id: "computed.quarterly-trend.revenue-growth-quarter-over-quarter-quarter-ended-2026-07-26", label: "revenue growth quarter over quarter, quarter ended 2026-07-26", value: 17.9 });
```

The remaining records (`GM`, `OM`, `FCF_AFTER_SBC`, `PE`, `GM_FY`, `TTM_OCF`, `ROIC`, `ACCRUAL`, `LQ_YOY`, `Y1`, `EST_A`/`EST_B`, `YOY_26`/`YOY_25`, `ANNUAL_53`/`QUARTER_53`, `GUIDE`) are written in full where their task introduces them; `YOY_25` is `YOY_26` with `id`/`label` dated 2025-06-30, `value: 13.3333`, `period: "2025-06-30"` and the same `asOf: "2026-06-30"`. `FY_REV` and `FY_DEBT` carry `asOf` 2026-01-25 (the review's choice; the plan's tests hold with either as-of).

Records for this task (synthetic values): `GM = rec({ id: "computed.growth-margins.gross-margin-latest", label: "gross margin (latest)", kind: "computed", unit: "percent", currency: null, value: 71.1, asOf: "2026-01-25", origin: "computed.growth.margins.gross", formulaVersion: "stage-b-v1" })`, `OM` the same with `operating-margin-latest`, `"operating margin (latest)"`, `60.4`; `FCF_AFTER_SBC = rec({ id: "computed.capital-cash.latest-fcf-after-sbc-house-default", label: "latest FCF (after SBC, house default)", kind: "computed", value: 90.29e9, asOf: "2026-01-25", origin: "computed.capital.fcf" })`; `PE = rec({ id: "computed.valuation.pettm-current", label: "peTtm (current)", kind: "computed", unit: "ratio", currency: null, value: 27.3, asOf: "2026-10-27", origin: "computed.valuation.multiples.peTtm" })`; `GM_FY = { ...GM, id: "computed.test.gross-margin-fy-labelled", fiscalPeriod: "FY2026" }`.

```ts
describe("AI-106 period-less records", () => {
  it.each([
    [GM, "Gross margin for FY2024 was 71.1%."],
    [GM, "Gross margin for Q2 FY2027 was 71.1%."],
    [OM, "Operating margin in fiscal 2023 was 60.4%."],
    [FCF_AFTER_SBC, "Latest FCF after SBC (house default) for FY2024 was USD 90.29 billion."],
    [PE, "Current TTM P/E as of 2025-01-26 was 27.3x."],
  ])("AI-106: a year, quarter or date a period-less record does not carry leaves the claim unverified (%#)", async (record, text) => {
    const { entry, out } = await cite([record], record.id, text);
    expect(entry).toMatchObject({ validationStatus: "unchecked", reason: "period-mismatch" });
    expect(out.coverage.factualValidation?.validated).toBe(0);
  });
  it("AI-106 control: the record's own as-of date and no period still validate", async () => {
    for (const [record, text] of [[GM, "Gross margin for the period ended 2026-01-25 was 71.1%."], [PE, "Current TTM P/E as of 2026-10-27 was 27.3x."], [GM, "Gross margin was 71.1%."]] as const)
      expect((await cite([record], record.id, text)).entry.validationStatus).toBe("validated");
  });
  it("AI-106: a declared fiscal label establishes that label only, named as fiscal", async () => {
    expect((await cite([GM_FY], GM_FY.id, "Gross margin for FY2026 was 71.1%.")).entry.validationStatus).toBe("validated");
    expect((await cite([GM_FY], GM_FY.id, "Gross margin for FY2025 was 71.1%.")).entry).toMatchObject({ validationStatus: "unchecked", reason: "period-mismatch" });
    expect((await cite([GM_FY], GM_FY.id, "Gross margin in 2026 was 71.1%.")).entry.validationStatus).toBe("unchecked");
    // OD-1 residual: the claim reader reads a bare "fiscal 2026" as the year 2026.
    expect((await cite([GM_FY], GM_FY.id, "Gross margin for fiscal 2026 was 71.1%.")).entry.validationStatus).toBe("unchecked");
  });
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/stageC.claimPeriods.audit20261027.test.ts -t "AI-106"`. Expected FAIL: the five `it.each` rows fail with a `toMatchObject` diff showing `validationStatus: "validated"`, `reason: "supported"`; the fiscal-label test fails on its FY2025 line (`"validated"`, the first failing assertion; its "in 2026" and "fiscal 2026" lines are also `validated` at HEAD). The control test passes. (All observed in the review run at HEAD.)
- [ ] **Step 3: Implement.** In `validateClaimNumericSupport`'s record branch, before `periodAgrees`: build `periodlessDates = new Set([record.asOf, record.periodContext?.kind === "instant" ? record.periodContext.at : record.periodContext?.kind === "duration" ? record.periodContext.end : undefined].filter(isIsoDate))`. In `periodAgrees`, for a non-window period when `record.period === null`, return `(period.kind === "date" && periodlessDates.has(period.key)) || (fiscalPeriod !== undefined && FY_LABEL.test(period.label) && periodsAgree(period.label, fiscalPeriod, fiscalPeriod))` with `const FY_LABEL = /^(?:Q[1-4]\s*)?FY\s*\d{4}$/i;` (the labels `periodLabels` gives "FY2026", "Q2 FY2027" and "the second quarter of fiscal 2027"). Do not use `/\b(?:FY|fiscal)\b/` (the first draft): there is no word boundary between "FY" and "2026", so it rejects "FY2026" and the fiscal-label test's validated line would fail after the fix (checked in node at review). Never call `periodsAgree(label, null, …)` (it returns true for any label). The existing branch at `:705` then gives its message, which now also covers years and dates. Update the comment at `:696-702` to say the period-less case is decided here, not by `periodsAgree`.
- [ ] **Step 4: Run it.** Same command: PASS (3 tests, 7 cases). Re-run the neighbours, then the verifier sweep (Global Constraints): `npx vitest run tests/stageC.factualValidation.test.ts tests/stageC.liveVerifier.test.ts tests/stageC.contradictedValueOnly.test.ts tests/currentReports.test.ts tests/stageC.verifyChecks.test.ts` — all pass unchanged; in particular `factualValidation.test.ts:115-131` (the window and month against a period-less record stay unverified, never contradicted) and `currentReports.test.ts:558` (the period-less track record with no period still validates).
- [ ] **Step 5: Benefit check.** The probe's five defect rows (`tmp/audit-2026-10-27/probes/AI-106.probe.ts`) are the five `it.each` rows and now hold; its two controls are the dated-record and window cases already pinned in `factualValidation.test.ts:104-131`, which still hold. In Task 13's replay, every stored claim that names a date against a period-less record must keep its status (the finding counted 6, 7 and 11 in #43, #46, #50, all naming the record's `asOf`); any validated → unverified move in this class must name a period other than the record's `asOf`. No existing pin moves.
- [ ] **Step 6: Docs.** `docs/METHODOLOGY.md`, section "Stage A checks and report verification", the F-22 paragraph (lines 2693-2711): after "That covers a missing or null record period," add the rule in words: "A record that carries no period establishes only its own as-of date, a date its period context declares, a fiscal label it declares (when the prose names it as an FY label, such as "FY2026" or "the second quarter of fiscal 2027") and a window its own label names; any other year, quarter, date or window named against it leaves the claim unverified." `README.md:154`: no change yet (Task 6 rewrites that sentence).
- [ ] **Step 7: Commit.** `git add src/pipeline/stageC/claimEvidence.ts tests/stageC.claimPeriods.audit20261027.test.ts docs/METHODOLOGY.md` then `git commit -m "Leave a period a period-less record does not carry unverified (AI-106)"` (end the message with the session's attribution trailer).

### Task 2: A trailing window's start date counts only inside the stated interval (AI-302)

**Files:**
- Modify: `src/pipeline/stageC/claimEvidence.ts:691-695` (`periodAgrees`, the `window.start` term)
- Test: `tests/stageC.claimPeriods.audit20261027.test.ts`

**Interfaces:**
- Consumes: `recordWindow(record): { key; start; end } | null` (`:409-412`, unchanged), `own.periods: PeriodReference[]`.
- Produces: no signature change; `periodAgrees` accepts `window.start` only when `own.periods.some((p) => p.kind === "date" && p.key === window.end)`.

- [ ] **Step 1: Write the failing test.** Record `TTM_OCF = rec({ id: "computed.current-capital.operating-cash-flow", label: "operating cash flow", kind: "computed", value: 134.36e9, period: "ttm: 2025-07-27 to 2026-07-26", asOf: "2026-07-26", origin: "computed.capital.current.cashBridge.operatingCashFlow", formulaVersion: "stage-b-v1" })` (the shape and value `tests/stageC.factualValidation.test.ts:317-325` already uses).

```ts
describe("AI-302 trailing-window start date", () => {
  it.each([
    "Operating cash flow for the trailing twelve months ended 2025-07-27 was USD 134.36 billion.",
    "Operating cash flow for the TTM ending 2025-07-27 was USD 134.36 billion.",
    "Operating cash flow for the trailing period ended 2025-07-27 was USD 134.36 billion.",
  ])("AI-302: a lone window start date is not the window's end: %s", async (text) => {
    const { entry, out } = await cite([TTM_OCF], TTM_OCF.id, text);
    expect(entry).toMatchObject({ validationStatus: "unchecked", reason: "period-mismatch" });
    expect(out.coverage.factualValidation?.validated).toBe(0);
  });
  it("AI-302 control: the end date and the complete interval validate; an interior date does not", async () => {
    const end = await cite([TTM_OCF], TTM_OCF.id, "Operating cash flow for the trailing twelve months ended 2026-07-26 was USD 134.36 billion.");
    expect(end.entry.validationStatus).toBe("validated");
    expect(end.out.checks.period.failed).toBe(0);
    expect((await cite([TTM_OCF], TTM_OCF.id, "Operating cash flow for the trailing twelve months from 2025-07-27 to 2026-07-26 was USD 134.36 billion.")).entry.validationStatus).toBe("validated");
    expect((await cite([TTM_OCF], TTM_OCF.id, "Operating cash flow for the trailing twelve months ended 2025-10-26 was USD 134.36 billion.")).entry.validationStatus).not.toBe("validated");
  });
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/stageC.claimPeriods.audit20261027.test.ts -t "AI-302 "` (trailing space keeps AI-302-V1 out). Expected FAIL: the three rows report `validationStatus: "validated"`; the control passes.
- [ ] **Step 3: Implement.** In `periodAgrees` replace `(period.key === window.end || period.key === window.start)` with `(period.key === window.end || (period.key === window.start && own.periods.some((other) => other.kind === "date" && other.key === window.end)))`. Comment: "A lone date names the window's end; its start counts only inside the complete stated interval (audit 2026-10-27 AI-302, D-82's interval proof)."
- [ ] **Step 4: Run it.** PASS. Neighbours, then the verifier sweep: `npx vitest run tests/stageC.factualValidation.test.ts tests/stageC.claimEvidence.isoRange.test.ts` — `factualValidation.test.ts:323-340` (end date validates; another end and one quarter do not) and the D-82/D-106 interval tests pass unchanged.
- [ ] **Step 5: Benefit check.** The probe's three defect rows now hold, its three controls (end date, full interval, interior date) still hold. Task 13: the 16 stored "trailing/TTM … ended <date>" claims in #43/#48/#49/#50 all name the window's end, so none may change status. No pin moves.
- [ ] **Step 6: Docs.** `docs/METHODOLOGY.md:2831` (section "META report audit improvements (October 2026)"): replace "an exact date names a window record's endpoint" with "an exact date names a window record's end; its start counts only inside the complete stated interval (both dates named)".
- [ ] **Step 7: Commit.** `git add src/pipeline/stageC/claimEvidence.ts tests/stageC.claimPeriods.audit20261027.test.ts docs/METHODOLOGY.md`; `git commit -m "Read a trailing window's start date only inside its complete interval (AI-302)"`.

### Task 3: A window is read however it is written (AI-303, AI-303-V1; covers AI-303-V2)

**Files:**
- Modify: `src/pipeline/stageC/claimEvidence.ts:139-187` (`periodLabels`), `:189-223` (`context`), `:277-306` (`metricTokens`), `:330-336` (`labelWindows`; new `labelLooseWindows`), `:476-482` (`excerptPeriods`; new `excerptWindows`), `:581-641` (`sourceBindings`: `inheritedWindows`), `:661-675` (record path: `established`, claim tokens), `:741-775` (excerpt path: claim tokens, `matchingPeriods`)
- Test: `tests/stageC.claimPeriods.audit20261027.test.ts`

**Interfaces:**
- `function periodLabels(text: string, options?: { loose?: boolean }): PeriodReference[]` — with `loose`, after every existing reader, the remaining text is read for window words written without for/during/over: `(fiscal|financial|calendar )?year('s)?` → `{ kind: "window", key: "annual", label: "annual" }`, `(fiscal )?quarter('s)?` → `{ kind: "window", key: "quarter", label: "quarter" }`; matched spans are blanked like every other reading. A match is skipped when the 24 characters before it end with `NOT_A_WINDOW_BEFORE` or the 16 after it start with `NOT_A_WINDOW_AFTER`:

```ts
const LOOSE_WINDOW = /\b(?:(?:fiscal|financial|calendar)[\s‐‑–—-]+)?(year|quarter)(?:['’]s)?\b/gi;
// Horizons, frequencies, fractions and the end of a period are not windows ("five-year", "per year",
// "each fiscal year's", "a quarter of", "end of the quarter").
const NOT_A_WINDOW_BEFORE = /\b(?:a|an|one|per|each|every|half|multi|several|\d+|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty)[\s‐‑–—-]+$|\bend\s+of\s+(?:the\s+|its\s+|our\s+|each\s+)?(?:(?:latest|most\s+recent|last|current|prior|previous)\s+)?$/i;
// A comparison or instant follows ("a year ago", "year-end", "quarter end", "year one", "prior-year quarter").
const NOT_A_WINDOW_AFTER = /^[\s‐‑–—-]*(?:ago|earlier|later|before|end|ends|one|two|three|[1-3])\b|^[\s‐‑–—-]+(?:quarter|period)\b/i;
```

- `function context(text: string, quantity: Quantity, all: Quantity[], source = false): Context` — unchanged signature; `periods: periodLabels(ownText, { loose: !source })`.
- `function metricTokens(label: string, ignore: readonly string[], options?: { loose?: boolean }): string[]` — passes `options` to its `periodLabels` call, so a loosely written window becomes the same `window<key>` token an explicit one does. Claim labels pass `{ loose: true }`; record labels, source labels and table leads do not.
- `function labelLooseWindows(record: NumericProvenanceRecord): Set<string>` — the windows `periodLabels(label after the LABEL_WINDOW rewrite, { loose: true })` reads that `labelWindows` does not; they join `established` (prose may name or omit them), e.g. `"latest-quarter revenue growth, year over year"` establishes `quarter`.
- `function excerptWindows(excerpt: TextExcerpt): Set<string>` — the windows the excerpt's title states: `periodLabels(title with the filed date and accession removed and LABEL_WINDOW rewritten, { loose: true })` windows, plus `quarter` for a `Q[1-4]…` period label and `annual` for an `FY…` label.
- `export function windowsNamed(text: string): string[]` — the window keys `periodLabels(text, { loose: true })` reads, in reading order; a test seam like `phraseNamesRecordYear` in `consistency.ts`.
- `SourceBinding` gains `inheritedWindows: ReadonlySet<string>` (empty for table cells).
- Excerpt path: the claim's metric tokens drop the `window<key>` tokens of the windows in `own.periods` (they are compared as periods, C-6); in `matchingPeriods`, a prose candidate whose clause names no period matches when `own.periods.every((p) => p.kind === "window" ? candidate.inheritedWindows.has(p.key) : candidate.inherited.some((s) => s.key === p.key))`.

- [ ] **Step 1: Write the failing test.** Records: `Q_REV = rec({ id: "payload.statements.income-statement-quarterly.2026-07-26.revenue", label: "revenue", value: 96_221_000_000, period: "2026-07-26", periodContext: { kind: "duration", start: "2026-04-27", end: "2026-07-26", basis: "fiscal-quarter", fiscalLabel: "Q2 FY2027" }, fiscalPeriod: "Q2 FY2027", asOf: "2026-07-26", origin: "edgar:income-statement(quarter)" })` (amount: `q2fy27-ex99-1.txt` summary table, "Revenue $96,221"); `FY_REV` the annual row `…income-statement-annual.2026-01-25.revenue`, `215_938_000_000` (from `nvda-20260125_htm.xml`, `Revenues … 215938000000`), period `2026-01-25`, duration `2025-01-27`–`2026-01-25`, basis `fiscal-year`, `FY2026`; `ROIC = rec({ id: "computed.returns.roic-latest", label: "ROIC (latest)", kind: "computed", unit: "percent", currency: null, value: 149.8, asOf: "2026-01-25", origin: "computed.returns.roic" })`; `ACCRUAL = rec({ id: "computed.forensics.accrual-ratio-balance-sheet", label: "accrual ratio (balance-sheet)", kind: "computed", unit: "ratio", currency: null, value: 0.64, period: "2026-01-25", asOf: "2026-01-25", origin: "computed.forensics.accruals.balanceSheetAccrualRatio" })`; `LQ_YOY = rec({ id: "computed.valuation.latest-quarter-revenue-growth-year-over-year", label: "latest-quarter revenue growth, year over year", kind: "computed", unit: "percent", currency: null, value: 105.85, asOf: "2026-07-26", origin: "computed.valuation.reverseDcfContext.latestQuarterYoy" })` (96,221 / 46,743 − 1 from the same table); `Y1 = rec({ id: "computed.valuation.consensus-year-one-revenue-growth-over-ttm", label: "consensus year-one revenue growth over TTM", kind: "computed", unit: "percent", currency: null, value: 73.7, asOf: "2026-07-26", origin: "computed.valuation.reverseDcfContext.consensusYearOne" })`. Excerpt `ITEM7 = { source: "edgar:10-K item7", asOf: "2026-01-25", title: "10-K Item 7 - Management's Discussion and Analysis (FY2026)", text: "We invested $17.5 billion in private companies and infrastructure funds.", truncated: false, originalChars: 71 }` (one sentence of NVIDIA's public FY2026 10-K MD&A, the AI-303-V2 probe's excerpt); `RELEASE_Q2 = { source: "edgar:8-K EX-99.1", asOf: "2026-08-26", title: "8-K EX-99.1 - earnings release, Q2 FY2027, quarter ended 2026-07-26 (8-K; filed 2026-08-26)", text: "Revenue was $96.2 billion.", truncated: false, originalChars: 26 }` (the figure of the release's first paragraph, without its "up 18%" tail so no direction word attaches).

```ts
describe("AI-303 windows written without for/during/over", () => {
  it.each([
    [Q_REV, "Revenue for the latest fiscal year was USD 96.22 billion."],
    [Q_REV, "Revenue for the most recent fiscal year was USD 96.22 billion."],
    [FY_REV, "Revenue for the most recent quarter was USD 215.94 billion."],
    [FY_REV, "This quarter's revenue was USD 215.94 billion."],
    [FY_REV, "Revenue this quarter was USD 215.94 billion."],
    [FY_REV, "The quarter's revenue was USD 215.94 billion."],
    [FY_REV, "Latest-quarter revenue was USD 215.94 billion."],
    [FY_REV, "Most recent quarter revenue was USD 215.94 billion."],
    [Q_REV, "Fiscal-year revenue was USD 96.22 billion."],
    [Q_REV, "Revenue this fiscal year was USD 96.22 billion."],
    [Q_REV, "The fiscal year's revenue was USD 96.22 billion."],
  ])("AI-303: a wrong window however written is not validated: %s", async (record, text) => {
    // the same reason the explicit "Revenue for the fiscal year was …" control gets today
    expect((await cite([Q_REV, FY_REV], record.id, text)).entry).toMatchObject({ validationStatus: "unchecked", reason: "text-context-mismatch" });
  });
  it("AI-303 control: the right window in the same spellings validates", async () => {
    for (const [record, text] of [[Q_REV, "Revenue for the latest quarter was USD 96.22 billion."], [FY_REV, "Revenue for the latest fiscal year was USD 215.94 billion."],
      [Q_REV, "This quarter's revenue was USD 96.22 billion."], [FY_REV, "Fiscal-year revenue was USD 215.94 billion."], [Q_REV, "Revenue for Q2 FY2027 was USD 96.22 billion."]] as const)
      expect((await cite([Q_REV, FY_REV], record.id, text)).entry.validationStatus).toBe("validated");
    for (const [record, text] of [[Q_REV, "Revenue for the fiscal year was USD 96.22 billion."], [FY_REV, "Quarterly revenue was USD 215.94 billion."], [Q_REV, "Annual revenue was USD 96.22 billion."]] as const)
      expect((await cite([Q_REV, FY_REV], record.id, text)).entry.validationStatus).not.toBe("validated");
  });
  it("AI-303: a window a record label names loosely is established; a period-less or unlabelled record establishes none (OD-1)", async () => {
    expect((await cite([LQ_YOY], LQ_YOY.id, "Latest-quarter revenue growth year over year was 105.85%.")).entry.validationStatus).toBe("validated");
    expect((await cite([LQ_YOY], LQ_YOY.id, "Revenue growth year over year was 105.85%.")).entry.validationStatus).toBe("validated");
    expect((await cite([LQ_YOY], LQ_YOY.id, "Annual revenue growth year over year was 105.85%.")).entry.validationStatus).not.toBe("validated");
    expect((await cite([ROIC], ROIC.id, "ROIC for the latest fiscal year was 149.8%.")).entry.validationStatus).toBe("unchecked");
    expect((await cite([ACCRUAL], ACCRUAL.id, "The balance-sheet accrual ratio for the same year was 0.64x.")).entry.validationStatus).toBe("unchecked");
  });
  it("AI-303: horizons, plurals and comparison words are not windows", async () => {
    expect(windowsNamed("Consensus year-one revenue growth over TTM revenue")).toEqual(["TTM"]);
    for (const text of ["a year ago", "the five-year period", "each fiscal year's average price", "10% per year", "the half-year", "the last four quarters",
      "about a quarter of revenue", "at the end of the quarter", "at the latest quarter end", "year over year", "a year earlier"])
      expect(windowsNamed(text), text).toEqual([]);
    expect(windowsNamed("the prior-year quarter")).toEqual(["quarter"]);
    expect(windowsNamed("this quarter's revenue")).toEqual(["quarter"]);
    expect(windowsNamed("the year ended 2026-01-25")).toEqual(["annual"]);
    expect(windowsNamed("year-to-date revenue")).toEqual(["YTD"]);
    expect(windowsNamed("at year-end")).toEqual([]); // Task 4 makes this ["FYE"]
    // end to end: a correct claim using such words keeps its status
    expect((await cite([Y1], Y1.id, "Consensus year-one revenue growth over TTM revenue is 73.7%.")).entry.validationStatus).toBe("validated");
    expect((await cite([Q_REV], Q_REV.id, "Revenue per year was USD 96.22 billion.")).entry.validationStatus).toBe("validated");
  });
  it("AI-303 (excerpt path, AI-303-V2): a quarter is not the 10-K's fiscal year; the excerpt's own window is", async () => {
    expect((await citeExcerpt(ITEM7, "NVIDIA invested USD 17.5 billion in private companies and infrastructure funds.")).entry.validationStatus).toBe("validated");
    for (const text of ["For the latest quarter, NVIDIA invested USD 17.5 billion in private companies and infrastructure funds.",
      "In the most recent quarter, NVIDIA invested USD 17.5 billion in private companies and infrastructure funds.",
      "This quarter NVIDIA invested USD 17.5 billion in private companies and infrastructure funds."])
      expect((await citeExcerpt(ITEM7, text)).entry.validationStatus).not.toBe("validated");
    expect((await citeExcerpt(ITEM7, "For the fiscal year, NVIDIA invested USD 17.5 billion in private companies and infrastructure funds.")).entry.validationStatus).toBe("validated");
    expect((await citeExcerpt(RELEASE_Q2, "Revenue for the quarter ended 2026-07-26 was USD 96.2 billion.")).entry.validationStatus).toBe("validated");
    expect((await citeExcerpt(RELEASE_Q2, "Revenue for the fiscal year was USD 96.2 billion.")).entry.validationStatus).not.toBe("validated");
  });
});
```

`windowsNamed` is tested directly because a wrong window read the same way in a claim and in a record label would cancel out end to end; "Revenue per year …" is odd prose on purpose: "per" and "year" are both dropped words, so a broken exclusion shows as an `annual` window the quarter record does not establish.

The `ROIC` and `ACCRUAL` records are the unlabelled shape B3 Task 8E leaves when the payload holds no annual fiscal label (its "adds no label the payload does not hold" test), so their two `unchecked` lines stay as written after B3. The labelled shape that B3 gives NVDA #48's records is checked in Task 3A and in Task 13's C-11 block.

- [ ] **Step 2: Run it.** `npx vitest run tests/stageC.claimPeriods.audit20261027.test.ts -t "AI-303"`. Expected FAIL: all 11 `it.each` rows (`validationStatus: "validated"`), the ROIC and accrual lines (`"validated"`), the excerpt test's three defect lines (`"validated"`) and its "For the fiscal year" and "quarter ended 2026-07-26" lines (`"unchecked"`, explicit windows never bind a period-less clause today). The horizons test fails with `TypeError: windowsNamed is not a function` (not exported yet). The right-window control passes on HEAD (the window words are dropped) and must keep passing. The excerpt test's first line (the plain ITEM7 claim) validates at HEAD only because `citeExcerpt` registers `USD_ROW` (without it: `unchecked/currency-mismatch`). The two explicit-window excerpt lines are `unchecked/text-context-mismatch` at HEAD because `metricTokens` already turns "quarter ended" / "for the fiscal year" into a `window…` token (its `LABEL_WINDOW` rewrite) that the source clause lacks; after this task the claim's window tokens on the excerpt path are dropped and compared as periods (C-6).
- [ ] **Step 3: Implement.** As in Interfaces. Keep `PERIOD_DESCRIPTORS` as it is (the words still drop when they are not a window: "latest", "most", "year" in "a year ago"); rewrite its comment to say the claim's window words are read as windows before the drop (so "The period itself is checked separately" becomes true). `basisWindows` is unchanged in this task. Collect the claim's window tokens as `new Set(own.periods.filter((p) => p.kind === "window").map((p) => \`window${p.key.toLowerCase()}\`))` on the excerpt path only; the record path keeps window tokens in the metric comparison as today (D-66: a window the record's label names must be named by the prose).
- [ ] **Step 4: Run it.** PASS. Neighbours, then the verifier sweep: `npx vitest run tests/stageC.factualValidation.test.ts tests/stageC.claimEvidence.d66.test.ts tests/stageC.metricContext.test.ts tests/stageC.periodContext.test.ts tests/stageC.liveVerifier.test.ts tests/stageC.tableScale.test.ts tests/stageC.excerptCurrencyScale.test.ts tests/stageC.dividendUnits.test.ts tests/currentReports.test.ts tests/edgar.filingFacts.test.ts tests/stageC.verifyChecks.test.ts`. All must pass; in particular `currentReports.test.ts:557-581` (the period-less track record "the share of the last one guided quarter …" still validates: `labelLooseWindows` reads "guided quarter" from the record's own label, so the claim's loose `quarter` window is established); in particular `factualValidation.test.ts:277-304` (source-side windows: YTD vs "for the year", QTD vs "for the quarter" stay unverified; YTD vs "YTD" validates), `:342-350` ("at the latest quarter end" against the current-capital bridge stays validated: "quarter end" is not a window) and `stageC.metricContext.test.ts` (the 17 NVDA metric-context cases).
- [ ] **Step 5: Benefit check.** The AI-303 probe's 4 rows, the AI-303-V1 probe's 8 rows and the AI-303-V2 probe's 4 rows are reproduced (on synthetic rows) and now hold; every control of the three probes still holds. Task 13: no validated → unverified move is expected from this task (C-11). The review scanned every validated factual claim of stored reports #30-#52 with the loose reader and its two exclusion patterns. #48's "ROIC for the latest fiscal year was 149.8%." and "The balance-sheet accrual ratio for the same year was 0.64x." are the only ones it reads a window from.
  - At planning time (no B3) both moved to unverified (`text-context-mismatch`): on the record path, the claim's new `windowannual` token is a metric word that a record without a fiscal basis does not establish.
  - With B3 Task 8E on `main`, both records carry `FY2026`, which `basisWindows` reads as the annual window, so both stay validated.
  - If either moves, first check that Task 8E is on the base: `computed.returns.roic-latest` should carry `fiscalPeriod: "FY2026"` in the rebuilt #48 payload. With the label present, a move is a regression, and so is any other validated → unverified move from this task.

  Also in Task 13: expected unverified → validated moves are excerpt claims with "for the quarter"/"in the quarter ended" against a release or commentary clause that names no period (C-6). Any other move must be explained before continuing. Pins that may move: none expected; if a `stageC.*` test pinned a claim with a loose window word as validated against a record that does not establish it, move the pin with a dated comment naming AI-303.
- [ ] **Step 6: Docs.** `docs/METHODOLOGY.md:2831`: replace 'with time words ("latest", "quarter end") and common abbreviations (FCF, SBC, capex) normalized; a named window must be the record's own' with 'with common abbreviations (FCF, SBC, capex) normalized; a window is read however it is written ("for the quarter", "this quarter", "the quarter's", "latest-quarter", "for the latest fiscal year", "fiscal-year"), and horizons, plurals and comparisons ("five-year", "four quarters", "a year ago", "year one") are not windows; a named window must be the record's own, and a record with no period or fiscal basis establishes none. On a filing excerpt, a claim's window must be the clause's own or, when the clause names no period, the window the excerpt's title states.'
- [ ] **Step 7: Commit.** `git add src/pipeline/stageC/claimEvidence.ts tests/stageC.claimPeriods.audit20261027.test.ts docs/METHODOLOGY.md`; `git commit -m "Read a window however the claim writes it, and the excerpt's own window from its title (AI-303, AI-303-V1)"`.

### Task 3A: Composition check with B3 Task 8E (C-11)

Decisions spec C-11 and master plan conflict row 55. B3 Task 8E merges first. It gives each `(latest)` computed row and each D-68 accrual-year row two fields, the issuer's label of the year it was computed over (`fiscalPeriod: "FY<yyyy>"`) and that year's period end, as the annual statement cell carries them.

Under this batch's rules (OD-1 and Task 1; the loose window reader, Task 3) the label establishes that fiscal year, and through `basisWindows` (`claimEvidence.ts:312-323`) the annual window. B3's plan holds the test that proves the composition and leaves it to this batch, because it "only proves anything once B1's rule is in". Before B1, its lines pass for the wrong reasons: AI-106's gap, and window words that are dropped. The test passes as soon as it is written, so its failing direction is shown with B3's labels removed (Step 2).

**Files:**
- Modify: `tests/stageC.latestFiscalLabels.test.ts` (B3's file). Append the fourth test inside its `describe`, using that file's `build`, `rec` and `verdict` helpers. Leave B3's first three tests unchanged.

- [ ] **Step 1: Write the test.** Copy it verbatim from B3 Task 8E (its "Merge-order case"):
  ```ts
  it("with B1's period rule: the label establishes FY2025 and the annual window, nothing else (B1 OD-1)", async () => {
    const p = build(completeCurrencyBundle({}));
    const v = Number((rec(p, "computed.returns.roic-latest")!.value as number).toFixed(2));
    for (const text of [`ROIC for FY2025 was ${v}%.`, `ROIC for the latest fiscal year was ${v}%.`])
      expect((await verdict(p, "computed.returns.roic-latest", text)).validationStatus, text).toBe("validated");
    for (const text of [`ROIC for FY2024 was ${v}%.`, `ROIC for the latest quarter was ${v}%.`])
      expect((await verdict(p, "computed.returns.roic-latest", text)).validationStatus, text).not.toBe("validated");
    const accrual = Number((rec(p, "computed.forensics.accrual-ratio-balance-sheet")!.value as number).toFixed(4));   // 0.1192
    expect((await verdict(p, "computed.forensics.accrual-ratio-balance-sheet", `The balance-sheet accrual ratio for the same year was ${accrual}x.`)).validationStatus).toBe("validated");
  });
  ```
- [ ] **Step 2: Show that it fails without the label.**
  - Locally make B3's `fiscalYearOf` (`src/pipeline/stageC/payload.ts`) return `{}`. Never commit this edit.
  - Run `npx vitest run tests/stageC.latestFiscalLabels.test.ts -t "with B1's period rule"`.
  - Expected FAIL, as B3 Task 8E states:
    - "ROIC for FY2025 was 41.83%." is `unchecked/period-mismatch`. Task 1: a period-less record establishes only a fiscal label it declares.
    - "ROIC for the latest fiscal year was 41.83%." is `unchecked/text-context-mismatch`. Task 3: the claim's `windowannual` token is a metric word a record without a fiscal basis does not establish.
    - The accrual line fails the same way: the dated accrual record without a label establishes its date only.
  - Record what you observe. If a positive line passes in this state, stop: the composition is not proven.
  - Restore the line, then confirm `git diff --exit-code src/pipeline/stageC/payload.ts`. B3's first three tests also fail while the edit is in, which is expected.
- [ ] **Step 3: Implement.** Nothing. The composition is B3's labels read by Tasks 1 and 3.
- [ ] **Step 4: Run it.** `npx vitest run tests/stageC.latestFiscalLabels.test.ts`: PASS, four tests. Then run the verifier sweep.
- [ ] **Step 5: Benefit check.** The recall that OD-1 removes on purpose comes back exactly where the payload holds the label:
  - FY2025 and "the latest fiscal year" validate;
  - FY2024 and "the latest quarter" do not;
  - the accrual claim for "the same year" validates.

  Task 13's C-11 block shows the same on NVDA #48.
- [ ] **Step 6: Docs.** None. B3 Task 8E's METHODOLOGY sentence describes the label, and Task 1's describes the rule.
- [ ] **Step 7: Commit.** `git add tests/stageC.latestFiscalLabels.test.ts`; `git commit -m "Prove a latest-year row's fiscal label establishes its year under the period rule (C-11)"`.

### Task 4: The fiscal year-end is an instant only a year-end record establishes (AI-303-V3)

**Files:**
- Modify: `src/pipeline/stageC/claimEvidence.ts` (`periodLabels` loose reader, `basisWindows` `:312-323`, `excerptWindows` from Task 3)
- Test: `tests/stageC.claimPeriods.audit20261027.test.ts`

**Interfaces:**
- `periodLabels(text, { loose: true })` reads, before the Task 3 window words, `FISCAL_YEAR_END = /\b(?:(?:fiscal|financial)[\s‐‑–—-]+)?year[\s‐‑–—-]*end\b|\bend\s+of\s+(?:the\s+|its\s+|our\s+)?(?:(?:latest|most\s+recent|last|current|prior|previous)\s+)?(?:fiscal\s+)?year\b/gi` as `{ kind: "window", key: "FYE", label: "fiscal year-end" }` ("year ended" does not match: `end\b` needs a word end). "Quarter end" stays a descriptor, as `factualValidation.test.ts:342-350` requires.
- `basisWindows(record)` adds `"FYE"` when the fiscal label is `FY<n>` or `Q4 …`, or the basis is `fiscal-year`; `excerptWindows` adds `"FYE"` for an `FY…` or `Q4…` title label.

- [ ] **Step 1: Write the failing test.** Records (synthetic amounts, NVDA #50 shapes): `Q_DEBT = rec({ id: "payload.statements.balance-sheet-quarterly.2026-07-26.total-debt", label: "total debt", value: 30e9, period: "2026-07-26", periodContext: { kind: "instant", at: "2026-07-26", fiscalLabel: "Q2 FY2027" }, fiscalPeriod: "Q2 FY2027", asOf: "2026-07-26", origin: "edgar:balance-sheet(quarter)" })`; `FY_DEBT` = `…balance-sheet-annual.2026-01-25.total-debt`, `10e9`, instant `2026-01-25`, `FY2026`, asOf `2026-01-25`; `Q4_DEBT` = `…balance-sheet-quarterly.2026-01-25.total-debt`, `10e9`, instant `2026-01-25`, `Q4 FY2026`; `CC_DEBT = rec({ id: "computed.current-capital.total-debt-including-leases", label: "total debt including leases", kind: "computed", value: 12e9, period: "2026-07-26", asOf: "2026-07-26", origin: "computed.capital.current.debtBridge.totalDebtIncludingLeases" })`. Excerpts: `ANNUAL_NOTE = { source: "edgar:10-K notes", asOf: "2026-01-25", title: "10-K notes (FY2026)", text: "Total debt was $10.0 billion.", truncated: false, originalChars: 29 }` and `QUARTER_NOTE` = the same text at `asOf: "2026-08-26"`, source `edgar:10-Q notes`, title `"10-Q notes, Q2 FY2027, quarter ended 2026-07-26"`.

```ts
describe("AI-303-V3 fiscal year-end", () => {
  it.each([
    "Total debt at fiscal year-end was USD 30.00 billion.",
    "Total debt at the end of the fiscal year was USD 30.00 billion.",
    "Total debt at the latest fiscal year-end was USD 30.00 billion.",
  ])("AI-303-V3: a mid-year quarter-end balance is not the fiscal year-end balance: %s", async (text) => {
    expect((await cite([Q_DEBT, FY_DEBT], Q_DEBT.id, text)).entry.validationStatus).toBe("unchecked");
  });
  it("AI-303-V3: an FY or Q4 instant establishes the year end; an undated-basis bridge figure does not", async () => {
    expect((await cite([Q_DEBT, FY_DEBT], FY_DEBT.id, "Total debt at fiscal year-end was USD 10.00 billion.")).entry.validationStatus).toBe("validated");
    expect((await cite([Q4_DEBT], Q4_DEBT.id, "Total debt at the end of the fiscal year was USD 10.00 billion.")).entry.validationStatus).toBe("validated");
    expect((await cite([CC_DEBT], CC_DEBT.id, "Total debt including leases was USD 12.00 billion at fiscal year-end.")).entry.validationStatus).toBe("unchecked");
    expect((await cite([Q_DEBT], Q_DEBT.id, "Total debt as of 2026-01-25 was USD 30.00 billion.")).entry).toMatchObject({ validationStatus: "unchecked", reason: "period-mismatch" });
    expect((await cite([Q_DEBT], Q_DEBT.id, "Total debt at the end of FY2026 was USD 30.00 billion.")).entry.validationStatus).toBe("unchecked");
    expect((await citeExcerpt(ANNUAL_NOTE, "Total debt at fiscal year-end was USD 10.0 billion.")).entry.validationStatus).toBe("validated");
    expect((await citeExcerpt(QUARTER_NOTE, "Total debt at fiscal year-end was USD 10.0 billion.")).entry.validationStatus).not.toBe("validated");
    expect(windowsNamed("at year-end")).toEqual(["FYE"]);
    expect(windowsNamed("at the end of the fiscal year")).toEqual(["FYE"]);
    expect(windowsNamed("at the latest quarter end")).toEqual([]);
  });
});
```

Change Task 3's `windowsNamed("at year-end")` expectation to `["FYE"]` in this commit.

- [ ] **Step 2: Run it.** `npx vitest run tests/stageC.claimPeriods.audit20261027.test.ts -t "AI-303-V3"`. Expected FAIL (on the branch after Task 3, where the year-end words are dropped as descriptors): the three `it.each` rows report `"validated"`; in the second test `CC_DEBT` and `QUARTER_NOTE` report `"validated"` and the two FYE `windowsNamed` lines return `[]`. The `FY_DEBT`, `Q4_DEBT`, `ANNUAL_NOTE` and both `Q_DEBT` date lines pass before and after (controls); if one of them fails before Step 3, stop and record which. Record the exact failing lines in the commit body.
- [ ] **Step 3: Implement.** As in Interfaces; the key `FYE` becomes the metric token `windowfye`, removed by `unestablished()` when the record establishes it, exactly like the other windows.
- [ ] **Step 4: Run it.** PASS. Neighbours, then the verifier sweep: `npx vitest run tests/stageC.factualValidation.test.ts tests/stageC.periodContext.test.ts tests/stageC.metricContext.test.ts` — `factualValidation.test.ts:342-350` ("at the latest quarter end") still validates.
- [ ] **Step 5: Benefit check.** The probe's three rows hold and its two controls hold. Task 13: stored claims use "year-end" with a year ("at FY2025 year-end", #20/#33/#36, outside the replay set); among #43-#50, any claim naming the fiscal year-end against a non-year-end record must move to unverified, and none naming it against an FY or Q4 row may move.
- [ ] **Step 6: Docs.** `docs/METHODOLOGY.md:2831`, after the window sentence of Task 3: '"At fiscal year-end" and "at the end of the fiscal year" name the fiscal year-end instant, which only a record with an FY or fourth-quarter fiscal label or a fiscal-year basis establishes.'
- [ ] **Step 7: Commit.** `git add src/pipeline/stageC/claimEvidence.ts tests/stageC.claimPeriods.audit20261027.test.ts docs/METHODOLOGY.md`; `git commit -m "Read the fiscal year-end as an instant only a year-end record establishes (AI-303-V3)"`.

### Task 5: "Latest" means the newest registered period of the cited series (AI-303-V4)

**Files:**
- Modify: `src/pipeline/stageC/claimEvidence.ts` (new `reportedSeries`, `reportedSeriesLatest`, `RECENCY`; options of `validateClaimNumericSupport` `:644-651`; record path after the metric check `:675`), `src/pipeline/stageC/passes.ts:2925` and `:3167`
- Test: `tests/stageC.claimPeriods.audit20261027.test.ts`

**Interfaces:**
- `export function reportedSeriesLatest(registry: readonly NumericProvenanceRecord[]): ReadonlyMap<string, string>` — key: the record id with its one ISO date replaced by `*`; value: the newest such date. Only reported periods count: the id carries exactly one ISO date, it equals `record.period`, and it is not after `record.asOf` (when set), so analyst estimates and projections are never a series.
- `function reportedSeries(record: NumericProvenanceRecord): { key: string; date: string } | null`.
- `const RECENCY = /\b(?:latest|most[\s‐‑–—-]+recent|newest)\b/i;`
- `validateClaimNumericSupport(claim, options: { …; seriesLatest?: ReadonlyMap<string, string> })` — on the record path, when `RECENCY.test(typedText)` (the whole claim; a record citation states one figure) and the record's series has a newer registered date, return `support("unchecked", "period-mismatch", "the prose calls the figure the latest, but a later period of the cited series is registered")`. Records outside a series (computed `(latest)` rows, current-capital rows) are untouched. The excerpt path has no series and is unchanged (residual, see the disposition note).
- `passes.ts`: `const seriesLatest = reportedSeriesLatest(registry);` next to `claimEvidenceIndex` (`:2925`); pass `seriesLatest` at `:3167` only (the TracedNumber call at `:2986` has no record).

- [ ] **Step 1: Write the failing test.** Records: `Q_REV`, `FY_REV` (Task 3), `Q1_REV = rec({ id: "payload.statements.income-statement-quarterly.2026-04-26.revenue", label: "revenue", value: 81_615_000_000, period: "2026-04-26", periodContext: { kind: "duration", start: "2026-01-26", end: "2026-04-26", basis: "fiscal-quarter", fiscalLabel: "Q1 FY2027" }, fiscalPeriod: "Q1 FY2027", asOf: "2026-07-26", origin: "edgar:income-statement(quarter)" })` (amount: `q2fy27-ex99-1.txt`, "Revenue … $81,615"); `Q_DEBT` (Task 4); `Q1_DEBT` = `…balance-sheet-quarterly.2026-04-26.total-debt`, `20e9`, instant `2026-04-26`, `Q1 FY2027`, asOf `2026-07-26`; estimates `EST_A = rec({ id: "payload.estimates.est-revenue-2027-01-31", label: "est revenue 2027-01-31", value: 300e9, period: "2027-01-31", asOf: "2026-07-26", origin: "test:estimates" })` and `EST_B` for `2028-01-30`; `GM`, `TTM_OCF` from earlier tasks.

```ts
describe("AI-303-V4 latest", () => {
  it("AI-303-V4: the newest registered period per reported series; forecasts are no series", () => {
    const latest = reportedSeriesLatest([Q1_REV, Q_REV, FY_REV, Q1_DEBT, Q_DEBT, EST_A, EST_B, TTM_OCF, GM]);
    expect(latest.get("payload.statements.income-statement-quarterly.*.revenue")).toBe("2026-07-26");
    expect(latest.get("payload.statements.balance-sheet-quarterly.*.total-debt")).toBe("2026-07-26");
    expect(latest.get("payload.statements.income-statement-annual.*.revenue")).toBe("2026-01-25");
    expect(latest.size).toBe(3);
  });
  it.each([
    [Q1_REV, "Revenue for the latest quarter was USD 81.62 billion."],
    [Q1_REV, "Latest quarterly revenue was USD 81.62 billion."],
    [Q1_DEBT, "Total debt at the latest quarter end was USD 20.00 billion."],
    [Q1_DEBT, "Total debt at the most recent quarter-end was USD 20.00 billion."],
  ])("AI-303-V4: an older period called the latest is not validated (%#)", async (record, text) => {
    expect((await cite([Q_REV, Q1_REV, Q_DEBT, Q1_DEBT], record.id, text)).entry).toMatchObject({ validationStatus: "unchecked", reason: "period-mismatch" });
  });
  it("AI-303-V4 control: the newest period called the latest, and an older one named exactly, validate", async () => {
    const registry = [Q_REV, Q1_REV, Q_DEBT, Q1_DEBT, GM];
    for (const [record, text] of [[Q_REV, "Revenue for the latest quarter was USD 96.22 billion."], [Q_DEBT, "Total debt at the latest quarter end was USD 30.00 billion."],
      [Q1_REV, "Revenue for Q1 FY2027 was USD 81.62 billion."], [GM, "Latest gross margin was 71.1%."]] as const)
      expect((await cite(registry, record.id, text)).entry.validationStatus).toBe("validated");
  });
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/stageC.claimPeriods.audit20261027.test.ts -t "AI-303-V4"`. Expected FAIL: the first test with `TypeError: reportedSeriesLatest is not a function`; the four rows report `validationStatus: "validated"`; the control passes.
- [ ] **Step 3: Implement.** As in Interfaces; the check runs after the metric check and before the period gate, so a wrong metric still reads `text-context-mismatch`.
- [ ] **Step 4: Run it.** PASS. Neighbours, then the verifier sweep: `npx vitest run tests/stageC.factualValidation.test.ts tests/stageC.payload.passes.test.ts tests/stageC.index.test.ts tests/currentReports.test.ts` — `factualValidation.test.ts:342-350` (current-capital, no date in its id) still validates; the payload golden does not move. Known fail-closed limit, recorded as a residual (not a test): "at the latest fiscal year-end" citing a fourth-quarter row of a quarterly series stays unverified once later quarters of that series are registered, because "latest" is compared with the whole series, not with its year-end rows.
- [ ] **Step 5: Benefit check.** The probe's four rows hold; its controls (an exact other date stays unverified; the newest record called latest validates) hold. Task 13: the stored-report scan found every "latest" FACT citing a computed `(latest)` row, so no stored claim may change status through this rule; a move here means a stored claim called an older series row the latest and must be listed.
- [ ] **Step 6: Docs.** `docs/METHODOLOGY.md:2831`: '"Latest" or "most recent" on a figure from a dated statement, quarterly-trend or segment series requires the newest period of that series the payload registers; on a filing excerpt it is not checked.'
- [ ] **Step 7: Commit.** `git add src/pipeline/stageC/claimEvidence.ts src/pipeline/stageC/passes.ts tests/stageC.claimPeriods.audit20261027.test.ts docs/METHODOLOGY.md`; `git commit -m "Check 'latest' against the newest registered period of the cited series (AI-303-V4)"`.

### Task 6: A comparison base is the base, on both sides and in the period check (AI-402, AI-402-V1, AI-402-V2)

**Files:**
- Modify: `src/pipeline/stageC/consistency.ts` (new `comparisonCueEnd`, `findComparisonBasePhrases`, `comparisonBaseEnd`; `findPeriodPhrases` `:738-769`; period block `:1562-1586`), `src/pipeline/stageC/claimEvidence.ts` (`PeriodReference` `:98` gains `start`, `end`; `periodLabels`' `take` records offsets; `Context` `:99` gains `bases`; `context()` `:189-223`; table cells `:612` set `bases: []`; excerpt `matchingPeriods` `:770-775`), `README.md:154`
- Test: `tests/stageC.claimPeriods.audit20261027.test.ts`; `tests/stageC.verifyChecks.test.ts` (re-run only)

**Interfaces:**
- `export function comparisonCueEnd(text: string, index: number): number | null` (consistency.ts) — reads up to 120 characters before `index`, cut at `;`, `•`, newline or a sentence end that is not "vs. ", and returns the end offset (in `text`) of the comparison cue when the phrase at `index` follows it with only filler between:

```ts
const BASE_WORD = String.raw`(?:the|a|an|or|per|diluted|basic|share|same|prior|prior-year|year-ago|year|ago|period|in|of|for|during|levels?|approximately|about|roughly|nearly|fiscal)[\s,]+`;
const BASE_AMOUNT = String.raw`(?:US\$|[$€£¥]|(?:${CURRENCY_CODES})\s*)?[-+−]?\d[\d,]*(?:\.\d+)?\s*(?:%|percent|billion|million|thousand|trillion|bn|mm|[bmk])?[\s,]+`;
const BASE_FILLER = String.raw`(?:${BASE_WORD}|${BASE_AMOUNT})*`;
const CHANGE_WORD = String.raw`(?:up|down|higher|lower|increas(?:e|ed|es|ing)|decreas(?:e|ed|es|ing)|rose|rise[sn]?|rising|fell|fall(?:s|en|ing)?|grew|grow(?:s|n|ing)?|growth|declin(?:e|ed|es|ing)|gain(?:ed|s)?|drops?|dropped|jump(?:ed|s)?)`;
const MAGNITUDE = String.raw`(?:\s+(?:of\s+|by\s+)?(?:approximately\s+|about\s+|roughly\s+)?[-+−]?\d[\d,]*(?:\.\d+)?\s*(?:%|percent|percentage\s+points?|basis\s+points?|bps|pp|x|times))?`;
const BASE_CUE = String.raw`(?:(?:as\s+)?compared\s+(?:with|to)|versus|vs\.?|relative\s+to|against|than|above|below|${CHANGE_WORD}${MAGNITUDE}\s+(?:from|over))`;
// A bare "from" governs a base only across at least one amount ("to $12.4 billion from
// $10.1 billion in the second quarter of fiscal 2025"); a period right after it is an
// interval or a start ("from 2025-07-27 to 2026-07-26", "from the third quarter 2026 onward").
const BASE_TAIL = new RegExp(String.raw`(?:\b(${BASE_CUE})\s+${BASE_FILLER}|\b(from)\s+(?:${BASE_WORD})*${BASE_AMOUNT}${BASE_FILLER})$`, "i");
```

`comparisonCueEnd` returns the offset just after whichever cue group matched (group 1, or group 2 for the bare "from").

- `export function findComparisonBasePhrases(sentence: string, numbers: readonly ParsedNumber[], located?: readonly ParsedNumber[]): string[]`; `findPeriodPhrases` keeps its signature and returns the other phrases. Both skip a phrase that starts inside an earlier-matched phrase (the ISO-date rule generalized, so the "2025" inside "second quarter 2025" is not a phrase of its own; the year set is the same, so no existing pass or failure changes).
- `function comparisonBase(record: NumericProvenanceRecord): { end: string; fiscal: string | null } | null` — when `record.period` is an ISO date and `${record.id} ${record.label}` names a basis: `/year[\s-]+over[\s-]+year|\byoy\b/i` → `end` = the date 12 months earlier and `fiscal` = the record's fiscal label (`fiscalPeriod ?? periodContext.fiscalLabel`) one fiscal year earlier (`Q2 FY2027` → `Q2 FY2026`, `FY2026` → `FY2025`); `/quarter[\s-]+over[\s-]+quarter|\bqoq\b/i` → 3 months earlier and the previous fiscal quarter (`Q1 FY2027` → `Q4 FY2026`; an `FY` label has none). UTC month arithmetic; `fiscal` is `null` when the record carries no fiscal label of those two shapes.
- `function baseAgrees(phrase: string, base: { end; fiscal }): boolean | null` — an FY-labelled phrase (`/^Q[1-4]\s*(?:of\s+)?FY|^FY/i`, plus the spelled forms Task 9 normalises): `base.fiscal === null ? null : periodsAgree(phrase, base.end, base.fiscal)`; any other phrase: `(base.fiscal !== null && periodsAgree(phrase, base.end, base.fiscal)) || phraseNamesRecordYear(phrase, base.end)`.
- Period block: own phrases as today (plus Task 9); base phrases pass when `baseAgrees` is `true` for every checked base, fail when it is `false` for any, and are not checked when `comparisonBase(record)` is null or every base is `null`. The sentence's period check passes when one side passes and neither fails, fails when either fails (one `period.fail()` and one finding per sentence), and is not counted when neither side was checked. A base failure's note: `The sentence names "<base>" as the comparison base, but the cited figure compares its period ${record.period} with the period ended about ${base.end}${base.fiscal ? ` (${base.fiscal})` : ""}.`
- `claimEvidence.ts`: `interface PeriodReference { key; label; raw; kind; start: number; end: number }` (offsets in the text read); `interface Context { …; bases: PeriodReference[] }`. In `context()`, a non-window period `p` with `cue = comparisonCueEnd(ownText, p.start)` is a base unless the figure sits between the cue and it (`cue <= figureStart && figureEnd <= p.start`, offsets relative to the clause); bases leave `periods` and go to `bases`. Excerpt path: a prose candidate also needs `own.bases.every((b) => candidate.context.bases.some((s) => s.key === b.key))`; a table cell needs `own.bases.length === 0`. Record path: `own.bases` do not enter the gate (C-2: the consistency check reads them).

- [ ] **Step 1: Write the failing test.** Excerpts, all with source `edgar:8-K EX-99.1`, asOf `2026-07-30`, title `NEUTRAL = "8-K EX-99.1 - earnings release, quarter ended 2026-06-30 (8-K 0001018724-26-000024; filed 2026-07-30)"`: `AMZN = ex("• AWS segment operating income was $16.6 billion, compared with $10.2 billion in second quarter 2025. • North America segment operating income was $9.1 billion, compared with $7.5 billion in second quarter 2025.")` and `FX = ex("Excluding the $0.1 billion favorable impact from year-over-year changes in foreign exchange rates throughout the quarter, net sales increased 20% compared with second quarter 2025.")` (sentences of Amazon's public Q2 2026 EX-99.1, SEC filing 0001018724-26-000024, as the AI-402 probes read them); `SYN(text) = ex(text)`. Records `YOY_26 = rec({ id: "computed.quarterly-trend.revenue-growth-year-over-year-quarter-ended-2026-06-30", label: "revenue growth year over year, quarter ended 2026-06-30", kind: "computed", unit: "percent", currency: null, value: 19.6205, period: "2026-06-30", asOf: "2026-06-30", origin: "computed.quarterly-trend" })` and `YOY_25` (same shape, `2025-06-30`, `13.3333`).

```ts
describe("AI-402 comparison bases", () => {
  const UP_FROM = SYN("Revenue was USD 12.4 billion, up 23% from the second quarter of fiscal 2025.");
  it.each([
    [AMZN, "AWS segment operating income in second quarter 2025 was USD 16.6 billion."],
    [SYN("Revenue was USD 12.4 billion, compared with USD 10.1 billion for the second quarter of fiscal 2025."), "Revenue in the second quarter of fiscal 2025 was USD 12.4 billion."],
    [UP_FROM, "Revenue in the second quarter of fiscal 2025 was USD 12.4 billion."],
    [SYN("Revenue was USD 12.4 billion, up 23% versus the second quarter of fiscal 2025."), "Revenue in the second quarter of fiscal 2025 was USD 12.4 billion."],
    [SYN("Net sales increased 20% compared with second quarter 2025."), "Net sales in second quarter 2025 increased 20%."],
    [FX, "Net sales in second quarter 2025 increased 20%."],
  ])("AI-402: a figure before the comparison word does not take the base's period (%#)", async (excerpt, text) => {
    expect((await citeExcerpt(excerpt, text)).entry.validationStatus).toBe("unchecked");
  });
  it.each([
    [AMZN, "AWS segment operating income in second quarter 2025 was USD 10.2 billion."],
    [AMZN, "North America segment operating income in second quarter 2025 was USD 7.5 billion."],
    [UP_FROM, "Revenue in the second quarter of fiscal 2025 was USD 10.1 billion."],
  ])("AI-402: a correct year-ago figure is never contradicted by the current one (%#)", async (excerpt, text) => {
    const { entry, out } = await citeExcerpt(excerpt, text);
    expect(entry.validationStatus).toBe("unchecked");
    expect(out.coverage.factualValidation?.contradicted).toBe(0);
  });
  it("AI-402: a figure before the comparison word reads the excerpt's own period", async () => {
    expect((await citeExcerpt(AMZN, "AWS segment operating income in the quarter ended 2026-06-30 was USD 16.6 billion.")).entry.validationStatus).toBe("validated");
    expect((await citeExcerpt(UP_FROM, "Revenue for the quarter ended 2026-06-30 was USD 12.4 billion.")).entry.validationStatus).toBe("validated");
  });
  it("AI-402: the echo of a source comparison validates; a wrong base does not", async () => {
    const growth = SYN("Net sales increased 20% compared with second quarter 2025.");
    expect((await citeExcerpt(growth, "Net sales increased 20% compared with second quarter 2025.")).entry.validationStatus).toBe("validated");
    expect((await citeExcerpt(growth, "Net sales increased 20% compared with second quarter 2024.")).entry.validationStatus).not.toBe("validated");
  });
  it('AI-402: a bare "from" opens an interval, not a comparison base', () => {
    const at = (text: string, phrase: string) => comparisonCueEnd(text, text.indexOf(phrase));
    expect(at("Operating cash flow from 2025-07-27 to 2026-07-26 was USD 134.36 billion.", "2025-07-27")).toBeNull();
    expect(at("Capex over fiscal 2027 is expected to be USD 25 billion.", "2027")).toBeNull();
    expect(at("Revenue from the third quarter 2026 onward is recognized ratably.", "third quarter 2026")).toBeNull();
    expect(at("Revenue actual versus the prior guidance midpoint for Q2 FY2027 was 5.7%.", "Q2 FY2027")).toBeNull();
    expect(at("AWS segment operating income was $16.6 billion, compared with $10.2 billion in second quarter 2025.", "second quarter 2025")).not.toBeNull();
    expect(at("Revenue was USD 12.4 billion, up 23% from the second quarter of fiscal 2025.", "second quarter of fiscal 2025")).not.toBeNull();
    expect(at("Revenue grew 20% over fiscal 2025.", "2025")).not.toBeNull();
    expect(at("Net sales are expected to be between $197.0 billion and $202.0 billion, or to grow between 9% and 12% compared with third quarter 2025.", "third quarter 2025")).not.toBeNull();
    // A bare "from" across an amount is D-98's base; "over" and an amount range are not.
    expect(at("Revenue grew to USD 12.4 billion from USD 10.1 billion in the second quarter of fiscal 2025.", "second quarter of fiscal 2025")).not.toBeNull();
    expect(at("Capex is expected to be over USD 10 billion in fiscal 2027.", "2027")).toBeNull();
    expect(at("Revenue is expected to range from USD 10.0 billion to USD 10.4 billion for the fourth quarter of 2026.", "fourth quarter of 2026")).toBeNull();
    expect(at("Revenue grew from $391.0 billion in FY2024 to $416.2 billion in FY2025.", "FY2024")).not.toBeNull();
    expect(at("Revenue grew from $391.0 billion in FY2024 to $416.2 billion in FY2025.", "FY2025")).toBeNull();
  });
  it("AI-402-V2: a fiscal-label base is compared with the figure's own base quarter, not a calendar year", async () => {
    for (const [record, text] of [[NV_YOY, "Revenue growth year over year for the quarter was 105.85%, compared with Q2 FY2026."],
      [NV_QOQ, "Revenue growth quarter over quarter for the quarter was 17.9%, compared with Q1 FY2027."]] as const) {
      const { entry, periodRow } = await cite([record], record.id, text);
      expect(periodRow, text).toBeUndefined();
      expect(entry.validationStatus, text).toBe("validated");
    }
    const wrong = await cite([NV_YOY], NV_YOY.id, "Revenue growth year over year for the quarter was 105.85%, compared with Q2 FY2025.");
    expect(wrong.entry.validationStatus).toBe("unchecked");
    expect(wrong.periodRow).toMatchObject({ reason: "period-word-mismatch" });
  });
  it("AI-402-V2: a correct YoY sentence naming its comparison base gets no period finding", async () => {
    for (const text of ["Revenue growth year over year for the quarter was 19.62%, compared with second quarter 2025.",
      "Revenue growth year over year for the quarter ended 2026-06-30 was 19.62%, compared with second quarter 2025."]) {
      const { entry, out, periodRow, manifest } = await cite([YOY_26, YOY_25], YOY_26.id, text);
      expect(entry).toMatchObject({ validationStatus: "validated", reason: "supported" });
      expect(periodRow).toBeUndefined();
      expect(manifest).not.toContain("verify.check.period");
      expect(out.checks.period).toEqual({ checked: 1, passed: 1, failed: 0, rate: 1 });
    }
  });
  it("AI-402-V2: the base is checked as the base", async () => {
    const wrongBase = await cite([YOY_26, YOY_25], YOY_26.id, "Revenue growth year over year for the quarter was 19.62%, compared with second quarter 2024.");
    expect(wrongBase.entry.validationStatus).toBe("unchecked");
    expect(wrongBase.periodRow).toMatchObject({ reason: "period-word-mismatch" });
    expect(wrongBase.periodRow?.note).toContain("comparison base");
    const yearAgoRecord = await cite([YOY_26, YOY_25], YOY_25.id, "Revenue growth year over year for the quarter was 13.33%, compared with second quarter 2025.");
    expect(yearAgoRecord.entry.validationStatus).not.toBe("validated");
    expect(yearAgoRecord.periodRow).toMatchObject({ reason: "period-word-mismatch" });
  });
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/stageC.claimPeriods.audit20261027.test.ts -t "AI-402"`. Expected FAIL: the six "does not take" rows report `"validated"`; the three year-ago rows report `"contradicted"` (the current figure takes the base's period and is compared with them; after the fix the year-ago amount has no metric label of its own in that clause, so the first two read `unchecked`, and the third, an amount the source never states, reads `unchecked` too); the "reads the excerpt's own period" test reports `"unchecked"` (`text-context-mismatch` at HEAD: `metricTokens` turns "quarter ended" into a `windowquarter` token the source clause lacks; on the branch after Task 3 it would read `period-mismatch` against the base-dated clause); the bare-"from" test fails with `TypeError: comparisonCueEnd is not a function`; the first V2 test reports `unchecked` / `period-word-mismatch` with a period row naming `"second quarter 2025", "2025"` and the manifest field, the own-and-base sentence `period-mismatch`; the fiscal-base V2 test reports `unchecked` (`period-mismatch` at the gate, and HEAD's period row names `"Q2 FY2026", "FY2026"`); in the last test the wrong-base note lacks "comparison base", and for the year-ago record `entry.validationStatus` is already `unchecked` at HEAD (`period-mismatch` at the gate) but `periodRow` is undefined (the year sets agree), so its `toMatchObject` line fails at HEAD and passes only once the base is checked against the figure's own base (C-2). The echo test passes on HEAD (control). (All observed in the review run at HEAD, with `USD_ROW` registered; without it every AMZN "$" row is `unchecked/currency-mismatch` and the year-ago rows would pass vacuously.)
- [ ] **Step 3: Implement.** As in Interfaces. `take` reads the match offset as the first numeric argument the `replace` callback receives after the match (capture groups are strings or undefined). Keep `src/edgar/currentReports.ts` untouched (its D-98 grammar and the B1-3 "over" cue belong to B9); name the difference in a comment beside `BASE_CUE`.
- [ ] **Step 4: Run it.** PASS. Neighbours, then the verifier sweep: `npx vitest run tests/stageC.verifyChecks.test.ts tests/stageC.factualValidation.test.ts tests/currentReports.test.ts tests/stageC.claimEvidence.d66.test.ts tests/stageC.claimEvidence.isoRange.test.ts tests/stageC.metricContext.test.ts tests/stageC.contradictedValueOnly.test.ts`. Must show: `verifyChecks.test.ts:301` ("Revenue grew from $391.0 billion in FY2024 to $416.2 billion in FY2025.": FY2024 is now a base, FY2025 passes, `failed` 0) and the other period-check tests (`:285-363`) unchanged; `factualValidation.test.ts:72-79` (two figures, two periods) validated with two spans; the D-98 release-parser tests in `currentReports.test.ts:583-` unchanged.
- [ ] **Step 5: Benefit check.** AI-402's four assertions, AI-402-V1's four and AI-402-V2's three now hold, with every control (split sentence, echo, own-period claim, fail-closed year-ago record). New coverage beyond the probes: the wrong-base echo and the bare-"from" grammar. Task 13: the finder's scans found 0 stored claims bound to a "compared with … <year>" span and 0 period-word-mismatch rows, so no stored status may change through this rule except a validated excerpt claim whose only period came from a comparison base (list any). No existing pin moves.
- [ ] **Step 6: Docs.** `docs/METHODOLOGY.md`, the consistency paragraph (lines 2685-2691): add after "year phrases against cited record years": 'A period that directly follows a comparison word ("compared with $10.2 billion in second quarter 2025", "up 23% from the second quarter of fiscal 2025") is the comparison's base: it belongs to the amount between the comparison word and it, never to a figure before the comparison word, which is read under its own clause or the excerpt's own period. "From" and "over" count as comparison words after a change word ("up 23% from", "grew 20% over"), and a bare "from" only across an amount ("from $10.1 billion in the second quarter of fiscal 2025"), never directly before a period ("from 2025-07-27 to 2026-07-26"); the release parser (D-98) reads them more widely. A base the claim names must be a base the source names; against a year-over-year or quarter-over-quarter figure, the period check compares the base with the period the figure is measured against: its fiscal label one year (or one quarter) earlier for an FY-labelled base, otherwise that label or the calendar year of the shifted date.' `README.md:154`: "a period naming a year must match the cited year" → "a period naming a year must match the cited year, and a comparison base the period of the figure's own base".
- [ ] **Step 7: Commit.** `git add src/pipeline/stageC/consistency.ts src/pipeline/stageC/claimEvidence.ts tests/stageC.claimPeriods.audit20261027.test.ts docs/METHODOLOGY.md README.md`; `git commit -m "Read a comparison base as the base on both sides and in the period check (AI-402, AI-402-V1, AI-402-V2)"`.

### Task 7: A one-figure claim is read whole (AI-404)

**Files:**
- Modify: `src/pipeline/stageC/claimEvidence.ts` (new `framePeriods`; `context()` uses it; record path `:661-664`, `:678`, `:703`; excerpt path `:741-744`)
- Test: `tests/stageC.claimPeriods.audit20261027.test.ts`

**Interfaces:**
- `function framePeriods(text: string, span: { start: number; end: number }, quantity: Quantity, all: readonly Quantity[], loose: boolean): { periods: PeriodReference[]; bases: PeriodReference[] }` — blanks every quantity span inside `span` (a figure's digits are never a year), reads `periodLabels(…, { loose })`, and splits bases off as in Task 6. `context()` calls it with the clause span.
- `validateClaimNumericSupport`: when `stated.length === 1`, `own.periods` and `own.bases` come from `framePeriods(text, { start: 0, end: text.length }, quantity, stated, true)` on both paths (`text` is `typedText` on the record path, `claim.text` on the excerpt path). Labels, direction and ambiguity stay per clause. With several figures, nothing changes.

- [ ] **Step 1: Write the failing test.** Records `Q_REV`, `Q1_REV`, `FY_REV`; excerpt `COMMENTARY = { source: "edgar:8-K EX-99.2", asOf: "2026-08-26", title: "8-K EX-99.2 — CFO commentary, Q2 FY2027, quarter ended 2026-07-26 (8-K; filed 2026-08-26)", text: <the sentence of fixtures/edgar/nvda-current-reports/q2fy27-ex99-2.txt starting "Inventory was $31.6 billion" and ending "in the third quarter.">, truncated: false, originalChars: text.length }`; `TWO = { source: "edgar:10-Q item2", asOf: "2026-06-30", title: "Quarterly review", text: "Operating margin was 31% in 2026; gross margin was 43% in 2025.", truncated: false, originalChars: 62 }`.

```ts
describe("AI-404 periods named outside the figure's clause", () => {
  it.each([
    [FY_REV, "For the quarter ended 2026-07-26, Data Center demand stayed strong; revenue was USD 215.94 billion."],
    [Q1_REV, "NVIDIA's quarter ended 2026-07-26 set a record. Revenue was USD 81.62 billion."],
  ])("AI-404: a one-figure claim's period in another clause or sentence is checked (record path, %#)", async (record, text) => {
    expect((await cite([Q_REV, Q1_REV, FY_REV], record.id, text)).entry).toMatchObject({ validationStatus: "unchecked", reason: "period-mismatch" });
  });
  it("AI-404: a one-figure claim's period in another clause is checked (excerpt path)", async () => {
    expect((await citeExcerpt(COMMENTARY, "In Q1 FY2027 NVIDIA kept building supply; inventory was USD 31.6 billion.")).entry.validationStatus).toBe("unchecked");
    expect((await citeExcerpt(COMMENTARY, "Inventory for Q2 FY2027 was USD 31.6 billion.")).entry.validationStatus).toBe("validated");
    expect((await citeExcerpt(COMMENTARY, "Inventory for Q1 FY2027 was USD 31.6 billion.")).entry.validationStatus).not.toBe("validated");
  });
  it("AI-404 control: the record's own period named in another clause validates", async () => {
    expect((await cite([Q_REV], Q_REV.id, "Revenue was USD 96.22 billion; that was NVIDIA's quarter ended 2026-07-26.")).entry.validationStatus).toBe("validated");
  });
  it("AI-404: a claim with several figures still reads each clause", async () => {
    const { entry } = await citeExcerpt(TWO, "Operating margin was 31% in 2026; gross margin was 43% in 2025.");
    expect(entry.validationStatus).toBe("validated");
    expect(entry.sourceSpans).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/stageC.claimPeriods.audit20261027.test.ts -t "AI-404"`. Expected FAIL: the two record rows and the first excerpt line report `"validated"` (the period sits outside the figure's clause, which is all that is read). The own-period control validates before and after: before this task its second clause is not read, after it the clause names the record's own period. The other two excerpt lines and the several-figures test pass before and after (controls).
- [ ] **Step 3: Implement.** As in Interfaces. The unestablished-date check (`:662`), the month check (`:678`) and the gate (`:703`) read the whole-claim periods; Task 5's `RECENCY` already reads the whole claim.
- [ ] **Step 4: Run it.** PASS. Neighbours, then the verifier sweep: `npx vitest run tests/stageC.factualValidation.test.ts tests/stageC.claimEvidence.d66.test.ts tests/stageC.claimEvidence.isoRange.test.ts tests/stageC.metricContext.test.ts tests/stageC.periodContext.test.ts tests/currentReports.test.ts tests/stageC.verifyChecks.test.ts`; the D-63/D-66 per-clause cases (`factualValidation.test.ts:58-79`, `metricContext` 17 cases) unchanged.
- [ ] **Step 5: Benefit check.** The probe's three rows hold; its controls (a wrong period in the figure's own clause; the right period) hold. Task 13: the finder counted 126 stored multi-clause factual claims in reports 30-52 and 0 with the only period outside the figure's clause; the replay must show no status change from this rule for #43-#50 other than one-figure claims whose other clause names a period the record does not carry (list each).
- [ ] **Step 6: Docs.** `docs/METHODOLOGY.md:2831`: "A claim that states one figure is read for its periods as a whole, whichever clause or sentence names them; a claim with several figures is read clause by clause."
- [ ] **Step 7: Commit.** `git add src/pipeline/stageC/claimEvidence.ts tests/stageC.claimPeriods.audit20261027.test.ts docs/METHODOLOGY.md`; `git commit -m "Read a one-figure claim's periods from the whole claim (AI-404)"`.

### Task 8: A forward-looking clause binds only a forward-looking claim, under no inherited period (AI-302-V1)

**Files:**
- Modify: `src/pipeline/stageC/claimEvidence.ts` (new `FORWARD_LOOKING`; `SourceBinding` `:100-125` gains `forwardLooking`; `sourceBindings` `:581-641`; excerpt candidate filter `:748-754`)
- Test: `tests/stageC.claimPeriods.audit20261027.test.ts`; `tests/currentReports.test.ts` (one new test after `:581`; the existing test at `:557-581` is unchanged)

**Interfaces:**
- `const FORWARD_LOOKING = /\b(?:(?:is|are|was|were|be|been|being|remains?|remained)\s+(?:now\s+|currently\s+|still\s+|also\s+)?(?:expected|projected|forecast(?:ed)?|anticipated|estimated|guided)\s+to|expects?|expecting|anticipates?|anticipating|forecasts?|outlook|guidance\s+(?:for|of|range|calls?\s+for|is|was|issued)|(?:our|its|management['’]s|the\s+company['’]s)\s+(?:[a-z-]+\s+){0,3}guidance)\b/i;` — management guidance is forward-looking (OD-3); accounting-standard guidance ("under the new lease accounting guidance, …") is not matched; a bare "expected" ("as expected") and "estimated" without "to" ("Estimated severance costs … were") are results.
- `SourceBinding.forwardLooking: boolean` = `FORWARD_LOOKING.test(own.text)` for prose figures, `false` for table cells; when true, `inherited = []` and `inheritedWindows = new Set()`.
- Excerpt path: `claimForward = FORWARD_LOOKING.test(stated.length === 1 ? claim.text : own.text)`; a binding is a candidate only when `binding.forwardLooking === claimForward`. The TracedNumber call (`passes.ts:2984`) builds a claim text with no forward wording, so it binds result clauses only (Review Focus 3).

- [ ] **Step 1: Write the failing test.** Excerpts built from the committed SEC fixtures (no network): `const EX991 = readFileSync(path.join(process.cwd(), "fixtures/edgar/nvda-current-reports/q2fy27-ex99-1.txt"), "utf8"); const start = EX991.indexOf("NVIDIA (NASDAQ: NVDA) today reported"); RELEASE = { source: "edgar:8-K EX-99.1", asOf: "2026-08-26", title: "8-K EX-99.1 - earnings release, Q2 FY2027, quarter ended 2026-07-26 (8-K; filed 2026-08-26)", text: EX991.slice(start, EX991.indexOf("Highlights", start)), … }` (the release paragraph through the outlook bullets); `COMMENTARY_FULL` = the EX-99.2 fixture's inventory sentence plus, after `"\n"`, its outlook bullets from "Revenue is expected to be $108.0 billion" up to "For the full year fiscal 2027", title as in Task 7. Assert both slices contain `"are expected to be 74.0%"` before the claims run.

```ts
describe("AI-302-V1 forward-looking clauses", () => {
  it.each([RELEASE, COMMENTARY_FULL])("AI-302-V1: the Q3 FY2027 guide is not validated as the Q2 FY2027 result (%#)", async (excerpt) => {
    const { entry, out } = await citeExcerpt(excerpt, "GAAP and non-GAAP gross margins for Q2 FY2027 were 74.0%.");
    expect(entry.validationStatus).toBe("unchecked");
    expect(out.coverage.factualValidation?.validated).toBe(0);
    expect((await citeExcerpt(excerpt, "GAAP and non-GAAP gross margins were 74.0%.")).entry.validationStatus).toBe("unchecked");
  });
  it("AI-302-V1: the guide dated by the quarter end is not validated, and the true result is not contradicted by the guide", async () => {
    expect((await citeExcerpt(RELEASE, "GAAP and non-GAAP gross margins in the period ended 2026-07-26 were 74.0%.")).entry.validationStatus).toBe("unchecked");
    const { entry } = await citeExcerpt(RELEASE, "GAAP and non-GAAP gross margins for Q2 FY2027 were 75.0%.");
    expect(entry.validationStatus).not.toBe("contradicted");
    expect((entry.sourceSpans ?? []).map((s) => s.text).join(" ")).not.toMatch(/expected to be 74\.0%/);
  });
  it("AI-302-V1 control: a forward-looking claim binds the guide; a result claim binds the result", async () => {
    expect((await citeExcerpt(RELEASE, "GAAP and non-GAAP gross margins are expected to be 74.0%.")).entry.validationStatus).toBe("validated");
    expect((await citeExcerpt(COMMENTARY_FULL, "Inventory for Q2 FY2027 was USD 31.6 billion.")).entry.validationStatus).toBe("validated");
    // OD-3 non-goal: an outlook lead's period is not carried to its bullets
    expect((await citeExcerpt(RELEASE, "Revenue for Q3 FY2027 is expected to be USD 108.0 billion.")).entry.validationStatus).toBe("unchecked");
  });
  it("AI-302-V1: management guidance is forward-looking; accounting guidance is not", async () => {
    const GUIDED = ex("edgar:8-K EX-99.1", "2026-08-26", RELEASE.title, "Our guidance for third-quarter revenue is $108.0 billion.");
    expect((await citeExcerpt(GUIDED, "Revenue for Q2 FY2027 was USD 108.0 billion.")).entry.validationStatus).toBe("unchecked");
    expect((await citeExcerpt(GUIDED, "Revenue guidance is USD 108.0 billion.")).entry.validationStatus).toBe("validated");
    const NOTE = ex("edgar:10-K notes", "2026-01-25", "10-K notes (FY2026)", "Under the new lease accounting guidance, operating lease liabilities were $2.5 billion.");
    expect((await citeExcerpt(NOTE, "Operating lease liabilities were USD 2.5 billion.")).entry.validationStatus).toBe("validated");
  });
});
```

The `GUIDED` sentence is synthetic (no committed filing states it); it is the spelling the first draft's regex missed. At HEAD its first line is `validated` (the clause names no period and inherits the title's Q2 FY2027), so the test fails before Step 3; its other two lines are controls that validate before and after.

In `tests/currentReports.test.ts`, inside the `describe("D-63 filing evidence", …)` block (where `nvdaBundle` and `payloadOf` are scoped), after the test that ends at `:581` and before the block's closing `});` at `:582` (the existing test is left unchanged), add Review Focus 3's test on the same committed NVDA fixtures:

```ts
it("AI-302-V1: a key number dated to the reported quarter does not verify against an outlook bullet", async () => {
  const payload = payloadOf(nvdaBundle());
  const keyNumbers = [
    { value: 31.6, unit: "USD billions: Inventory", currency: "USD", period: "2026-07-26", source: "edgar:8-K EX-99.2", asOf: "2026-08-26", verified: null },
    { value: 74.0, unit: "% GAAP and non-GAAP gross margins", currency: null, period: "2026-07-26", source: "edgar:8-K EX-99.2", asOf: "2026-08-26", verified: null },
  ];
  const result = await runVerifyPass({} as PassDeps, payload, { keyNumbers });
  expect(result.verifiedReport.keyNumbers.map((n) => n.verified)).toEqual([true, false]);
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/stageC.claimPeriods.audit20261027.test.ts -t "AI-302-V1"` and `npx vitest run tests/currentReports.test.ts -t "AI-302-V1"`. Expected FAIL: both `it.each` rows (`"validated"` for the Q2 claim and the period-less one); the period-ended line (`"validated"`) and the mirror (`"contradicted"`, bound to "…are expected to be 74.0%, plus or minus 50 basis points."); the key-number assertion `[true, true]` (observed in the review run at HEAD: the 74.0% key number is verified against "GAAP and non-GAAP gross margins are expected to be 74.0%, plus or minus 50 basis points."); the guidance test's first line (`"validated"`). The control test passes on HEAD. After Step 3 the 74.0% key number may log `contradicted` (bound to a 75.0% result clause) or `unchecked`; the test asserts only that it is not verified.
- [ ] **Step 3: Implement.** As in Interfaces.
- [ ] **Step 4: Run it.** PASS. Neighbours, then the verifier sweep: `npx vitest run tests/currentReports.test.ts tests/edgar.filingFacts.test.ts tests/stageC.excerptNumbers.test.ts tests/stageC.excerptCurrencyScale.test.ts tests/stageC.factualValidation.test.ts tests/stageC.metricContext.test.ts tests/phaseOne.finalReview.test.ts tests/filingDisclosures.composition.test.ts`; the inventory and aggregate-payment key numbers still verify ("is cumulatively capped at $105 billion" is not forward-looking).
- [ ] **Step 5: Benefit check.** The probe's four failing assertions hold; its setup and inventory control hold; its logged observations are now asserted (period-less guide unverified, Q3 guide unchanged). Task 13: no stored claim binds an outlook span today (finding evidence), so only claims that bound a result clause with a forward-looking verb, or the reverse, may move; list them. No pin moves except the key-number line above.
- [ ] **Step 6: Docs.** `docs/METHODOLOGY.md:2831`: 'A forward-looking clause of a filing ("is expected to be", "expects", "outlook", management's "guidance for …") is read under no period of the excerpt and binds only a claim that is itself forward-looking; a reported result binds only a claim stating a result (OD-3). Accounting-standard guidance is not forward-looking.'
- [ ] **Step 7: Commit.** `git add src/pipeline/stageC/claimEvidence.ts tests/stageC.claimPeriods.audit20261027.test.ts tests/currentReports.test.ts docs/METHODOLOGY.md`; `git commit -m "Keep a forward-looking clause from binding a reported result or inheriting the reporting period (AI-302-V1)"`.

### Task 9: The period check is never stricter than the citation check (AI-405)

**Files:**
- Modify: `src/pipeline/stageC/consistency.ts:15-22` (module doc), `:692-699` (`PERIOD_PATTERNS`, new `fiscalPhrase`), `:1562-1586` (period block; Task 6's `baseAgrees` reads `fiscalPhrase` too)
- Test: `tests/stageC.claimPeriods.audit20261027.test.ts`

**Interfaces:**
- `PERIOD_PATTERNS` gains, before the bare-year pattern, the spelled fiscal forms the claim reader already reads: `/\b(?:first|second|third|fourth)\s+quarter\s+of\s+fiscal(?:\s+year)?\s+(?:19|20)\d{2}\b/gi` and `/\bfiscal(?:\s+year)?\s+(?:19|20)\d{2}\b/gi` (with the Task 6 skip-inside rule, the "2027" inside them is no phrase of its own). `export function fiscalPhrase(phrase: string): string | null` normalises them ("the second quarter of fiscal 2027" → `"Q2 FY2027"`, "fiscal 2025" / "fiscal year 2025" → `"FY2025"`) and returns `null` for any other phrase; the normalised phrases join `fiscalQuarters` / `fiscalYears`, so they take the explicit-FY branch (`periodsAgree` against the issuer label; not checked when the record has none, D-66), and Task 6's `baseAgrees` treats them as FY-labelled bases. The finding note still quotes the phrase as written.
- In the period block, for the own (non-base) phrases, `agreesWith(phrase): boolean | null`: when `record.period` holds no ISO date (a fiscal-label period such as `"Q2 FY2027"`) and the phrase is an ISO date, `true` if it equals `record.asOf` or the `periodContext` end/at, else `null` (not checked); otherwise `true` if `fiscal !== undefined && periodsAgree(phrase, record.period, fiscal)`, else `phraseNamesRecordYear(phrase, record.period)`. The non-FY branch passes when any phrase is `true`, fails when none is `true` and one is `false`, and is not checked when all are `null`. The explicit-FY branch is otherwise unchanged.
- Module doc: replace the "deliberately looser … only writes a log entry" sentences with: the check never fails a phrase the citation check accepts (an issuer fiscal label is compared through `periodsAgree` first, then calendar-year sets); a failure demotes a validated claim to unverified (F-22, D-110) and adds a missing-data manifest entry; a comparison base is checked against the figure's own base (Task 6).

- [ ] **Step 1: Write the failing test.** Synthetic 52/53-week records (the AI-405 probe's, "Example Tools Inc"): `ANNUAL_53 = rec({ id: "payload.statements.income-statement-annual.2026-01-03.revenue", label: "revenue", value: 4_710_000_000, period: "2026-01-03", periodContext: { kind: "duration", start: "2024-12-29", end: "2026-01-03", basis: "fiscal-year", fiscalLabel: "FY2025" }, fiscalPeriod: "FY2025", asOf: "2026-01-03", origin: "edgar:income-statement(annual)" })`; `QUARTER_53` = `…quarterly.2026-01-03.revenue`, `1_230_000_000`, duration `2025-09-28`–`2026-01-03`, `fiscal-quarter`, `Q4 FY2025`; `GUIDE = rec({ id: "computed.quarterly-trend.q2-fy2027-revenue-actual-vs-prior-guidance-midpoint", label: "Q2 FY2027 revenue actual vs prior guidance midpoint", kind: "computed", unit: "percent", currency: null, value: 5.74, period: "Q2 FY2027", asOf: "2026-07-26", origin: "computed.quarterly-trend" })`.

```ts
describe("AI-405 period check on fiscal labels", () => {
  it.each([
    [ANNUAL_53, "Revenue for fiscal 2025 was USD 4.71 billion."],
    [ANNUAL_53, "Revenue for 2025 was USD 4.71 billion."],
    [QUARTER_53, "Revenue for Q4 2025 was USD 1.23 billion."],
  ])("AI-405: a sentence the citation check validates is not failed by the period check: %s", async (record, text) => {
    const gate = validateClaimNumericSupport({ label: "FACT", text, source: record.id, asOf: record.asOf }, { record, excerpts: [], sourceId: record.id, reportingCurrency: "USD" });
    expect(gate.status).toBe("validated"); // precondition
    const { entry, periodRow, manifest } = await cite([ANNUAL_53, QUARTER_53], record.id, text);
    expect(periodRow).toBeUndefined();
    expect(manifest).not.toContain("verify.check.period");
    expect(entry.validationStatus).toBe("validated");
  });
  it("AI-405 control: FY2025 and the ISO year end validate; calendar 2026 does not", async () => {
    for (const text of ["Revenue for FY2025 was USD 4.71 billion.", "Revenue for the fiscal year ended 2026-01-03 was USD 4.71 billion."])
      expect((await cite([ANNUAL_53], ANNUAL_53.id, text))).toMatchObject({ entry: { validationStatus: "validated" }, periodRow: undefined });
    expect((await cite([ANNUAL_53], ANNUAL_53.id, "Revenue for 2026 was USD 4.71 billion.")).entry.validationStatus).toBe("unchecked");
  });
  it("AI-405: a fiscal-label record named by its own quarter end gets no period finding; another date is not checked", async () => {
    const own = await cite([GUIDE], GUIDE.id, "Revenue actual versus the prior guidance midpoint for the quarter ended 2026-07-26 was 5.74%.");
    expect(own.periodRow).toBeUndefined();
    const other = await cite([GUIDE], GUIDE.id, "Revenue actual versus the prior guidance midpoint for the quarter ended 2026-04-26 was 5.74%.");
    expect(other.periodRow).toBeUndefined();
    expect(other.out.checks.period.checked).toBe(0);
  });
  it("AI-405: a spelled fiscal quarter the citation check accepts gets no period finding; a wrong one still does", async () => {
    const own = await cite([Q_REV], Q_REV.id, "Revenue for the second quarter of fiscal 2027 was USD 96.22 billion.");
    expect(own.periodRow).toBeUndefined();
    expect(own.entry.validationStatus).toBe("validated");
    const wrong = await cite([Q_REV], Q_REV.id, "Revenue for the second quarter of fiscal 2026 was USD 96.22 billion.");
    expect(wrong.entry.validationStatus).toBe("unchecked");
    expect(wrong.periodRow).toMatchObject({ reason: "period-word-mismatch" });
    // the same spelling as a comparison base (C-2): NVDA's Q2 FY2026 is the base quarter of Q2 FY2027
    const base = await cite([NV_YOY], NV_YOY.id, "Revenue growth year over year for the quarter was 105.85%, compared with the second quarter of fiscal 2026.");
    expect(base.periodRow).toBeUndefined();
    expect(base.entry.validationStatus).toBe("validated");
    expect((await cite([ANNUAL_53], ANNUAL_53.id, "Revenue for fiscal year 2025 was USD 4.71 billion.")).periodRow).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/stageC.claimPeriods.audit20261027.test.ts -t "AI-405"`. Expected FAIL: the three rows have a `period-word-mismatch` row ("The sentence names "2025" but the cited figure is registered for period 2026-01-03."), the `verify.check.period` manifest field and `entry.validationStatus` `"unchecked"`; the fiscal-label test has a `period-word-mismatch` row for both dates; in the spelled-fiscal test, the correct "second quarter of fiscal 2027" claim is `unchecked/period-word-mismatch` (note `names "2027"`), the wrong "fiscal 2026" one has no period row (its "2026" agrees by calendar year; the gate already rejects it), the base sentence is `unchecked/period-mismatch` with no row, and "fiscal year 2025" has a row (`names "2025"`). The control passes on HEAD. (All observed in the review run at HEAD.)
- [ ] **Step 3: Implement.** As in Interfaces; `periodsAgree` is already imported in `consistency.ts`.
- [ ] **Step 4: Run it.** PASS. Neighbours, then the verifier sweep: `npx vitest run tests/stageC.verifyChecks.test.ts tests/stageC.factualValidation.test.ts tests/stageC.liveVerifier.test.ts` — `verifyChecks.test.ts:285-363` unchanged ("FY2023" against FY2025 still fails; "fiscal 2025" (now read as FY2025, explicit), "Q4 2025", "in 2025" against the September FY2025 still pass; a bare quarter and a period-less record still not checked). A sweep pin that counted "fiscal YYYY" against a record with no fiscal label as checked moves to not checked (D-66); move it with a dated comment naming AI-405.
- [ ] **Step 5: Benefit check.** The probe's four failing assertions hold, its two controls hold. The change adds a failure only where the citation check already rejects the period ("fiscal 2026" against a record labelled FY2025: the gate gives `period-mismatch` already, so no status moves; the new finding is true): `periodsAgree` is consulted before the year sets, so a phrase that passed still passes, except that an exact date against a record registered only under a fiscal label, other than its as-of or end date, and a spelled "fiscal YYYY" against a record with no fiscal label, go from checked to not checked. Task 13: no stored report covers a 52/53-week issuer and none carries a `period-word-mismatch` row today, so the replay must show no new period finding; any removed finding is listed.
- [ ] **Step 6: Docs.** `docs/METHODOLOGY.md:2688-2689`: replace "The period-word check compares years only; it does not adjudicate fiscal quarters." with "The period-word check reads a spelled fiscal period as the citation check does ("the second quarter of fiscal 2027" is Q2 FY2027, "fiscal 2025" is FY2025) and compares a record that carries an issuer fiscal label through the citation check's own period rule first (so "fiscal 2025" agrees with a 52/53-week year ending 2026-01-03), then by calendar year; it never fails a phrase the citation check accepts. An exact date against a record registered only under a fiscal label is checked only against its as-of date or period end. A failure leaves the claim unverified and is listed in the missing-data manifest."
- [ ] **Step 7: Commit.** `git add src/pipeline/stageC/consistency.ts tests/stageC.claimPeriods.audit20261027.test.ts docs/METHODOLOGY.md`; `git commit -m "Compare the period check through the issuer's fiscal label before calendar years (AI-405)"`.

### Task 10: Version stamps (batch)

A `[validated]` mark now means more than it did under 1.44.0, and the verify pass's orchestration changed (`seriesLatest` is computed per pass), so the report spec and the pipeline stamp move once for the batch. The payload, Stage B and score-band stamps do not.

**Files:**
- Modify: `src/report/schema.ts:134-139`, `src/pipeline/jobRunner.ts:526-527`
- Test: `tests/report.versionStamps.test.ts:88,94`, `tests/jobRunner.test.ts:6197,6204`, `tests/stageC.payload.passes.test.ts:2738`

- [ ] **Step 1: Failing test.** Move the five pins: `REPORT_SPEC_VERSION` and `newReport().meta.specVersion` to `"1.45.0"` (`report.versionStamps.test.ts:88,94`), `repRow?.specVersion` to `"1.45.0"` and `meta.pipelineVersion` to `"stage-c-1.6.10"` (`jobRunner.test.ts:6197,6204`), `report.meta.specVersion` to `"1.45.0"` (`stageC.payload.passes.test.ts:2738`). The payload pins at `report.versionStamps.test.ts:89-99` (`1.48.0`) stay as they are.
- [ ] **Step 2: Run it.** `npx vitest run tests/report.versionStamps.test.ts -t "new version stamps"`, `npx vitest run tests/jobRunner.test.ts -t "runs all steps in order, logs cost, persists the report"` and `npx vitest run tests/stageC.payload.passes.test.ts -t "fills meta \+ appendix and passes ReportSchema"`. Expected FAIL: `expected '1.44.0' to be '1.45.0'` and `expected 'stage-c-1.6.9' to be 'stage-c-1.6.10'`.
- [ ] **Step 3: Implement.** `REPORT_SPEC_VERSION = "1.45.0"` with the comment line `// 1.45.0 (D-next): a [validated] claim's periods, windows, comparison base, "latest" and forward-looking wording are established by the record or excerpt clause it cites; the period check never fails a phrase the citation check accepts.` `PIPELINE_VERSION = "stage-c-1.6.10"`, appending to the doc comment ` 1.6.10 (D-next): the verify pass computes the newest registered period of every reported series once and passes it to the claim check.`
- [ ] **Step 4: Run it.** PASS. Then `grep -rn --exclude='*.db*' '"1\.44\.0"\|stage-c-1\.6\.9' src tests scripts README.md docs/METHODOLOGY.md docs/OPERATIONS.md docs/VALIDATION-STATUS.md`: expected hits are only the historical `schema.ts:138` comment, the payload-version list at `report.versionStamps.test.ts:102` and the `audit-intended-deltas.json` record of D-113 (left alone: history). Any other hit is a missed pin.
- [ ] **Step 5: Benefit check.** A report verified under the new rules is distinguishable from one verified under 1.44.0 by its stamp, so history and comparisons never mix the two silently.
- [ ] **Step 6: Docs.** None beyond the CHANGELOG line of Task 12 (the stamp list in `CHANGELOG.md:9` moves there).
- [ ] **Step 7: Commit.** `git add src/report/schema.ts src/pipeline/jobRunner.ts tests/report.versionStamps.test.ts tests/jobRunner.test.ts tests/stageC.payload.passes.test.ts`; `git commit -m "Move the report spec to 1.45.0 and the pipeline to stage-c-1.6.10 for the claim verifier's period rules"`.

### Task 11: Payload golden and the audited fixture comparison (batch)

**Files:**
- Modify: `tests/fixtures/audit-intended-deltas.json` (by the script only, then the group's reason and decision by hand)
- Test: `tests/stageC.payload.passes.test.ts`, `tests/audit.fixtureComparison.test.ts`

- [ ] **Step 1: The payload golden does not move.** `npx vitest run tests/stageC.payload.passes.test.ts`. Expected PASS with no golden or fingerprint edit (only line 2738 moved, in Task 10). A failure here means a task changed the payload; stop and find which.
- [ ] **Step 2: Dry run.** `npm run audit:deltas`. Expected: one already-classified path moved, `report.meta.specVersion` (`1.2.0` → `1.45.0`, blessed as `1.44.0` in `nvda48-report-issues-20261026`), and nothing else. If any other leaf moves (for example a verification status of the DEMO control's claims), stop: each must map to a finding of this batch and be named in the reason below, or it is a regression.
- [ ] **Step 3: Write.** `npm run audit:deltas -- --write --group audit-b1-claim-verifier-periods-20261027`. Then write the group's `decisions` as `["D-117"]` (`DECISION_PATTERN` in `tests/helpers/auditDeltaContract.ts:76` rejects `D-next`, so the group carries the next free number at planning time; at merge, every `D-next` and `D-117` this branch wrote becomes the number its DECISIONS entry is given) and its `reason` (at least 60 characters): "Claim verifier period rules (D-117), as they reach this provider-free DEMO control. Only the report stamp moves, to spec 1.45.0 (a validated claim's periods, windows, comparison base and recency are established by what it cites), out of nvda48-report-issues-20261026, whose record for 1.44.0 stands in D-113. No value, availability flag or order moves. See docs/audit/DECISIONS.md, D-117."
- [ ] **Step 4: Run it.** `npx vitest run tests/audit.fixtureComparison.test.ts tests/auditDeltaContract.test.ts`. PASS.
- [ ] **Step 5: Benefit check.** The written record of every leaf this tree moves against the audited commit stays complete, and says why the stamp moved.
- [ ] **Step 6: Docs.** None (the reason names its decision).
- [ ] **Step 7: Commit.** `git add tests/fixtures/audit-intended-deltas.json`; `git commit -m "Record the report stamp's move to 1.45.0 in the audited fixture comparison (D-117)"`.

### Task 12: CHANGELOG, decision record, disposition note and release-test registration (batch)

**Files:**
- Modify: `CHANGELOG.md` (lines 9-10, new entry above line 20), `docs/audit/DECISIONS.md` (append), `tests/repository.release.test.ts` (`ALLOWED_MARKDOWN`, after line 96)
- Create: `docs/audit/2026-10-27-audit-fix-01-claim-verifier-periods.md`
- Test: `tests/repository.release.test.ts`, `tests/docs.lint.test.ts`

- [ ] **Step 1: Failing test.** Add `"docs/audit/2026-10-27-audit-fix-01-claim-verifier-periods.md"` and `"docs/superpowers/plans/2026-10-27-audit-fix-01-claim-verifier-periods.md"` to `ALLOWED_MARKDOWN` (not the decisions spec: B3 commits and registers it, so it is already in the list on this base, and `git ls-files docs/superpowers/specs` shows it). Create the disposition note with its headings only and `git add` it and this plan (the release test partitions `git ls-files`, so an untracked file is invisible to it).
- [ ] **Step 2: Run it.** `npx vitest run tests/repository.release.test.ts tests/docs.lint.test.ts`. Expected FAIL only if a registered file is missing or a committed file is unregistered; with both files tracked and registered it passes, which is the point of writing the registration first.
- [ ] **Step 3: Write the records.**
  - `CHANGELOG.md`: line 9 reads "report spec **1.45.0** and payload **1.48.0** (claim verifier period rules, 2026-10-27)". New entry `## Unreleased - the claim verifier compares periods and windows (2026-10-27)` with one plain-English bullet per task:
    - A figure with no reporting period of its own (a ratio, a share count, a fair value) is no longer confirmed for a fiscal year or a date it does not carry (AI-106). Since B3, a figure that Stage B takes from one fiscal year (the latest ROIC, margins and accrual ratios) carries that year's label, so a sentence naming that year, or "the latest fiscal year", is still confirmed (C-11).
    - "From 2025-07-27" is not confirmed against a trailing-twelve-month figure unless the sentence also states the end date (AI-302).
    - "Annual revenue", "per year", "this quarter", "at fiscal year-end" and "the latest quarter" are now read and checked, on cited figures and on filing excerpts (AI-303 and its variants).
    - A figure before "compared with … second quarter 2025" is no longer read as a second-quarter-2025 figure, a correct year-ago figure is no longer marked contradicted, and a correct year-over-year sentence naming its base no longer gets a period finding (AI-402 and variants).
    - A period stated in another clause of a one-figure claim is checked (AI-404).
    - A company outlook or guidance ("gross margins are expected to be 74.0%", "our guidance for third-quarter revenue is $108.0 billion") no longer confirms a reported result (AI-302-V1).
    - The period check no longer fails "fiscal 2025" against a 52/53-week year that ends in January 2026, or "the second quarter of fiscal 2027" against NVIDIA's quarter ended 2026-07-26, and compares "compared with Q2 FY2026" with the growth figure's own base quarter (AI-405, AI-402-V2).
    - Report 1.45.0 and pipeline stage-c-1.6.10 (D-next); payload 1.48.0, Stage B and score bands unchanged; stored reports keep their bytes and statuses (D-67).
  - `docs/audit/DECISIONS.md`: `## D-next - The claim verifier compares the periods, windows, comparison bases and recency a claim states (2026-10-27)` in D-116's shape: **What happened** (the 12 findings by id, one line each); **Options** and **Choice** (OD-1, OD-2, OD-3 with their sources, and calls C-1 to C-6); **Limits** (the residuals below); **Validation** (the test file, the neighbour files, the replay table of Task 13). Residuals named there: "latest" is not checked on a filing excerpt; "at the latest fiscal year-end" citing a fourth-quarter row stays unverified once later quarters of its series are registered; an outlook lead's period is not carried to its bullets; a result clause that also cites guidance binds only a claim that names the guidance; the claim reader reads a bare "fiscal 2026" as the year 2026, so a correct "fiscal 2026" claim stays unverified (dated or period-less row alike); the period check does not adjudicate a comparison base against a figure that is not a year-over-year or quarter-over-quarter series (a level row cited with only a base phrase is not checked against it); a fiscal label on a `(latest)` row and a stale excerpt title were B3's and are fixed there (B3 Tasks 8E and 8F, merged first). The Choice section states OD-1's measured cost as C-11 gives it: with B3 Task 8E on `main`, NVDA #48's latest-year ROIC and accrual claims stay validated, and "ROIC for FY2025 was 149.8%." is unverified (Task 13's C-11 block). At planning time, before B3, the cost was the two latest-year claims.
  - The disposition note, in the shape of `docs/audit/2026-10-22-audit-batch5-trust-signals.md`: base commit; "no model calls, no paid provider calls"; a Disposition table (finding, disposition, commit, tests) with all 12 fixed and AI-303-V2 noted as covered by Task 3; Owner decisions (OD-1 to OD-3, calls C-1 to C-6); Stored reports (unchanged, D-67); the replay table of Task 13; Residuals as in DECISIONS; Verification (the Task 14 chunk results).
- [ ] **Step 4: Run it.** `npx vitest run tests/repository.release.test.ts tests/docs.lint.test.ts`. PASS: no absolute home path (`unsafePublicDocument`), every link resolves, every registered file exists.
- [ ] **Step 5: Benefit check.** A reader of `CHANGELOG.md`, `DECISIONS.md` or the note learns what changed, why, what stays residual and how it was proven, without the git-ignored audit folder.
- [ ] **Step 6: Docs.** This task is the docs.
- [ ] **Step 7: Commit.** `git add CHANGELOG.md docs/audit/DECISIONS.md docs/audit/2026-10-27-audit-fix-01-claim-verifier-periods.md docs/superpowers/plans/2026-10-27-audit-fix-01-claim-verifier-periods.md tests/repository.release.test.ts`; `git commit -m "Record the claim verifier's period rules: changelog, decision and disposition note (D-next)"`.

### Task 13: Before/after replay of stored run inputs (batch proof, never committed)

No provider or model call: the payload is rebuilt from each stored run-input snapshot exactly as the probes rebuild it, and the verify pass is deterministic. Both sides run the current tree's `runVerifyPass` over the same rebuilt payload and the same stored report object, so the diff isolates this batch even though the stored reports were verified under older code (#43 1.33.0 … #50 1.44.0).

The harness must run against the checkout that holds the branch: `vitest.replay.config.ts` resolves `root` from its own location, and `tmp/` is git-ignored, so a git worktree has no `tmp/audit-2026-10-27/`. When the branch lives in a worktree, copy the harness and the five `data/evidence/<n>/` folders plus `data/reports/{43,46,48,49,50}.json` into that worktree's own git-ignored `tmp/audit-2026-10-27/` (parallel sessions share the main checkout's `tmp/`; use your own copy) and run both labels there. Never run the `before` label in one checkout and `after` in another.

**Files (git-ignored, under `tmp/`):**
- Create: `tmp/audit-2026-10-27/replay/b1/vitest.replay.config.ts` — a copy of `tmp/audit-2026-10-27/probes/vitest.probe.config.ts` with `root: path.resolve(__dirname, "../../../..")`, the import `from "../../../../vitest.shared"`, and `include: ["tmp/audit-2026-10-27/replay/b1/**/*.replay.ts"]`; keep `SHARED_SETUP_FILES` (no live network, hermetic env).
- Create: `tmp/audit-2026-10-27/replay/b1/verify-replay.replay.ts`, `tmp/audit-2026-10-27/replay/b1/diff.cjs`

**Interfaces:**
- For each `n` of 43 (AMZN), 46 (MU), 48, 49, 50 (NVDA): `snap = verifyRunInputSnapshot(JSON.parse(read("tmp/audit-2026-10-27/data/evidence/<n>/run_input_snapshot.gen0.*.json")))`; `bundle = snap.content.bundle`; `validation = validateBundle(bundle, { now: new Date(bundle.builtAt) })`; `payload = assembleContextPayload(bundle, runStageB(bundle, snap.content.stageBConfig, validation), validation)`; `report = JSON.parse(read("tmp/audit-2026-10-27/data/reports/<n>.json"))`; with `vi.useFakeTimers({ now: new Date(report.meta.generatedAt), toFake: ["Date"] })`, `result = await runVerifyPass(NO_MODEL, payload, report, { fetchedUrls: [] })`.
- Output `tmp/audit-2026-10-27/replay/b1/<label>-<n>.json`, label from `process.env.B1_REPLAY_LABEL` (`before` or `after`): `{ payloadFingerprint, counts: result.coverage.factualValidation, checks: result.checks, rows: result.log.map(({ path, claim, validationStatus, reason, source, note }) => ...) }`.
- `node tmp/audit-2026-10-27/replay/b1/diff.cjs` joins `before-<n>` and `after-<n>` rows on `path` + `claim`, prints per report the counts (validated, unverified, contradicted, period checks passed/failed) on both sides, and lists every row whose status or reason changed with its source id, before and after; it exits non-zero if the two payload fingerprints differ.
- C-11 constructed claims, #48 only. After the stored-report pass, call `runVerifyPass(NO_MODEL, payload, { commentary })` on the same rebuilt payload, in B3 Task 8E's `verdict` shape: each claim cites its record with that record's `asOf`.
  - Citing `computed.returns.roic-latest`: "ROIC for the fiscal year was 149.8%.", "ROIC for the latest fiscal year was 149.8%.", "ROIC for FY2026 was 149.8%." and "ROIC for FY2025 was 149.8%.".
  - Citing `computed.forensics.accrual-ratio-balance-sheet`: "The balance-sheet accrual ratio for the same year was 0.64x.".
  - Write each claim's status and reason to `<label>-48-c11.json`, and have `diff.cjs` print both sides.
  - These are the C-11 cases, not stored claims; none is quoted from an FMP-origin row.

- [ ] **Step 1.** Run with label `before` on the unchanged branch (Task 0): `B1_REPLAY_LABEL=before npx vitest run --config tmp/audit-2026-10-27/replay/b1/vitest.replay.config.ts`. After Task 12: the same with `after`, then `node tmp/audit-2026-10-27/replay/b1/diff.cjs`.
- [ ] **Step 2: Expected.** Payload fingerprints equal on both sides for all five. Every changed row is assigned to one finding by its rule, and each class matches the expectation stated in that task's Step 5:

| Rule (task) | Expected movement in #43, #46, #48-#50 |
|---|---|
| Period-less record (1, OD-1) | validated → unverified (`period-mismatch`) for claims dating a period-less ratio with a date other than its as-of or a non-FY label; no other direction. After B3 Task 8E, the labelled `(latest)` and accrual-year rows are dated, not period-less; claims naming another year against them already moved in B3's replay |
| TTM start date (2) | validated → unverified only for a TTM claim stating the start date alone |
| Window words and fiscal year-end (3, 4) | record path: validated → unverified only where the window named is not the cited row's. The review's scan of #30-#52 found two claims that name a window, #48's "ROIC for the latest fiscal year was 149.8%." and "The balance-sheet accrual ratio for the same year was 0.64x."; both stay validated, because B3 Task 8E labels their records FY2026 (C-11); excerpt path: unverified → validated allowed only for a claim whose window now matches the clause's own window or the excerpt title's (C-6) |
| Latest (5) | none expected (every stored "latest" cites a computed `(latest)` row); any move is listed |
| Comparison base (6) | contradicted → unverified for a year-ago figure; a validated excerpt claim whose only period came from a base → unverified; unverified → validated allowed only for a claim whose period came from a base (record path) or whose figure now reads the excerpt's own period (excerpt path); period findings only removed, except a base that names the wrong base period |
| One-figure claim read whole (7) | validated → unverified only where another clause names a period the row does not carry |
| Forward-looking clause (8) | validated → unverified for a result claim (or a key number) bound to an outlook or guidance clause, or a forward-looking claim bound to a result clause; none expected in stored claims |
| Period check (9) | period findings only removed, except where the citation check already rejects the period (no status moves); unverified → validated only for a claim whose sole failure was such a removed finding |
| Key numbers (TracedNumber rows) | verified → unverified only through Task 3 (a window in the row label), Task 6 (a base period) or Task 8 (a forward-looking clause); list each |

  Every unverified/contradicted → validated move must be one of the allowed classes above and is listed with its bound source span, so the reviewer can read that the metric, value, period and window are the clause's own. Any other change in that direction, or any change no rule explains, is a regression: stop and fix it before Task 14.

  C-11 constructed claims on #48. Before is `main` with B3; after is this branch:

  | Claim | before | after |
  |---|---|---|
  | "ROIC for the fiscal year was 149.8%." | validated | validated |
  | "ROIC for the latest fiscal year was 149.8%." | validated | validated |
  | "ROIC for FY2026 was 149.8%." | validated | validated |
  | "The balance-sheet accrual ratio for the same year was 0.64x." | validated | validated |
  | "ROIC for FY2025 was 149.8%." | unverified (`period-word-mismatch`: B3 Task 8E's period makes the consistency period check run) | unverified (`period-mismatch` or `period-word-mismatch`) |

  - The before column is B3 Task 8E's own Step 5 measurement on #48.
  - If B3 merged Task 8E without the period (its pre-review draft), the FY2025 claim is validated before and unverified after. That is the move C-11 names ("still moves"); either way it is unverified after this batch.
  - A validated after-value for FY2025, or an unverified after-value for any of the first four, is a regression.
- [ ] **Step 3: Record.** Put the per-report counts and the changed rows (path, source id, before → after, rule) in the disposition note. Quote claim text only where the cited source is an `edgar:` excerpt or a record whose origin is EDGAR or computed; never a value from an FMP-origin row (`docs/DATA-RIGHTS.md`). Commit the note on its own: `git add docs/audit/2026-10-27-audit-fix-01-claim-verifier-periods.md`; `git commit -m "Add the claim verifier's before/after replay to the disposition note"`. The harness files stay uncommitted (`tmp/` is git-ignored).

### Task 14: `npm run verify` in foreground chunks (batch)

- [ ] **Step 1.** Run each chunk of `npm run verify` in the foreground, one at a time, with a 10-minute timeout: `npm run check:dependencies`, `npm run typecheck`, `npm run lint`, `npm run test:product`, `npm run test:integration`, `npm run test:coverage`, `npm run build`, `npm run audit:security`.
- [ ] **Step 2: Expected.** All green. `test:coverage` includes `vitest.risk.config.ts`: the per-file floors (85/75/85/85) on `claimEvidence.ts`, `consistency.ts`, `provenance.ts` and `passes.ts` must hold; a new branch without a covering test in `tests/stageC.claimPeriods.audit20261027.test.ts` is added there, never by lowering a floor.
- [ ] **Step 3: Known load flakes.** Under machine load these time out and pass alone: `tests/jobScheduler.test.ts`, `tests/report.recordedSensitivity.test.ts`, `tests/risk.coverage.test.ts`, `tests/runtimeArtifactIdentity.test.ts`, `tests/runtimeReplay.test.ts`, and on Windows `tests/db.cli.test.ts` (`ETIMEDOUT`). Rerun a failing file alone (`npx vitest run <file>`); a file that fails alone is a real failure. Record each chunk's result in the disposition note's Verification section.

### Task 15: Fresh reviewer (batch)

- [ ] **Step 1.** Dispatch a reviewer with no context from this work over `git diff origin/main...HEAD`, with this plan, `tmp/audit-2026-10-27/findings.json` (the 12 findings) and the replay table. Tell it to exclude `*.db*` from every grep and to check: every finding has a test that failed before its fix; no check was weakened and no existing assertion loosened; the seven Review Focus items each have a test; the excerpt tests register `USD_ROW` (a "$" excerpt test without it passes vacuously); the payload golden did not move; no FMP-origin value entered a committed file; no absolute home path in committed markdown.
- [ ] **Step 2.** Fix each confirmed issue in its own commit with a failing test first; dispute the rest in the PR with evidence.

### Task 16: PR description (batch)

- [ ] **Step 1.** Open the PR from `fix/claim-verifier-periods` to `main` with a plain-English description:
  - **What was wrong**, in one sentence per finding group: the verifier marked claims validated when the period, window, comparison base, recency or modality a claim states was never compared with what it cites; the period check failed correct fiscal-year sentences.
  - **What changed**: the eight rules of Tasks 1-9, each in a line a non-engineer can read.
  - **Decisions**: OD-1 to OD-3 and calls C-1 to C-6. State OD-1's measured cost as C-11 gives it: with B3 Task 8E on `main`, NVDA #48's "ROIC for the latest fiscal year" and "accrual ratio for the same year" claims stay validated, so no stored claim loses its validation through OD-1, and "ROIC for FY2025 was 149.8%." is unverified (Task 13's C-11 block). At planning time, before B3, the cost was those two claims.
  - **Proof**: the replay table of Task 13 and the verify chunk results of Task 14.
  - **Not changed**: stored reports (D-67), payload 1.48.0, Stage B, score bands, `src/edgar/currentReports.ts` (B9 owns the release parser's "over").
  - **Residuals** and **cross-batch**: as in the disposition note; stamps, D-number and delta-group name are renumbered at merge after B2.
- [ ] **Step 2.** Merge gate: green `full` and `windows-smoke` checks, resolved threads, branch up to date with `main`.


## Review notes

Independent review of this plan, 2026-10-27, against `findings.json`, the B1 probes (read, not run), the code at `6542531` and the cited sources. Every Step 1 line of the new test file was run at HEAD with the plan's own literals in a hermetic scratch test outside the repository's suites (`tmp/audit-2026-10-27/plans/b1-review/head.review.ts` and `keynum.review.ts`, git-ignored, outputs beside them); the "at HEAD" statuses this plan now states come from that run. No source, test or doc outside this plan was changed.

**Changes made to the plan**

1. **Blocking: excerpt tests had no reporting currency.** `citeExcerpt` registered no `payload.statements.*` row, so `passes.ts` derived no reporting currency and every "$" source figure was `unchecked/currency-mismatch` at HEAD and after. The AMZN year-ago rows and the ITEM7, AMZN and inventory defect rows would have passed vacuously at HEAD, and the ITEM7, ANNUAL_NOTE, AMZN own-period and inventory controls could never validate. Added `USD_ROW` to the helper (D-45) and said why.
2. **Blocking: Task 1's fiscal-label regex rejected its own case.** `/\b(?:FY|fiscal)\b/` is false for "FY2026" and "Q2 FY2027" (no word boundary before the digits; checked in node), so the test's validated FY2026 line would fail after the fix. Replaced with `FY_LABEL = /^(?:Q[1-4]\s*)?FY\s*\d{4}$/i` on the claim reader's label. OD-1 no longer promises "fiscal 2026" (the claim reader reads it as the year 2026, and a dated FY2026 row rejects it at HEAD too). That is now a named residual and a pinned test line.
3. **Fixtures made exact.** Several records were described only in prose ("FY_REV the annual row …", "Q1_DEBT = …") with no `label`. A record without a label has no metric reading, so every claim against it fails. Added a shared-fixtures block with the exact literals the review ran, and the imports.
4. **C-2 / Task 6: an FY-labelled base was compared by calendar year.** That reproduces AI-405 inside the new base check: NVDA's correct "compared with Q2 FY2026" against the Q2 FY2027 growth row gets a false finding ({2026} against {2025}; HEAD already does this). The base is now compared through the fiscal label shifted one year or one quarter, by C-5's rule (`comparisonBase`, `baseAgrees`). Added the test `AI-402-V2: a fiscal-label base …`.
5. **C-1 / Task 6: a bare "from" was never a cue.** "Revenue grew to $12.4 billion from $10.1 billion in the second quarter of fiscal 2025" is D-98's own example shape, and with no cue it lends the base period to both figures. A bare "from" is now a cue across at least one amount, and never directly before a period. "Over", and an amount range ("from $10.0 billion to $10.4 billion for …"), still are not. The regex was checked in node on all 17 cue cases and for backtracking. Added the cue-test lines.
6. **AI-405 class not fully covered (Task 9).** `PERIOD_PATTERNS` cannot read "the second quarter of fiscal 2027", so the period check compares only "2027" and demotes a claim the citation check validates (`unchecked/period-word-mismatch` at HEAD on NVDA's own wording). Task 9 now reads the spelled fiscal forms as FY phrases (`fiscalPhrase`), and Task 6's base check uses them. Added the test `AI-405: a spelled fiscal quarter …`, the docs wording and the Step 4/5 consequences: "fiscal YYYY" without a fiscal label becomes not checked (D-66). An added failure arises only where the gate already rejects the claim.
7. **OD-3 deviated from the default without good cause.** The first draft dropped the noun "guidance". At HEAD, "Our guidance for third-quarter revenue is $108.0 billion." in a Q2 release validates "Revenue for Q2 FY2027 was USD 108.0 billion.", the AI-302-V1 defect in another spelling. `FORWARD_LOOKING` now includes management guidance and excludes accounting-standard guidance. The regex was checked on 11 sentences, and the new test's HEAD statuses were observed. Recorded as alternative (c) rejected. The summary's `deviatesFromDefault` is now false: rule (2) is stricter than the default, not a departure from it.
8. **Step 2 descriptions corrected to the observed HEAD results.** Task 6: the own-period test is `text-context-mismatch` at HEAD, not `period-mismatch`. The "fail-closed half" was not a passing control: its `periodRow` line fails at HEAD. Task 8: the 74.0% key number is verified at HEAD (`[true, true]`), so the hedge was removed. Task 1: the FY-label test's first failing line is FY2025.
9. **Neighbour coverage.** The per-task neighbour lists missed 15 of the 33 test files that call the verifier. Added a single verifier-sweep command (Global Constraints) to every Step 4.
10. **Task 8 placement.** `nvdaBundle` and `payloadOf` are scoped to `describe("D-63 filing evidence")`, so the new test must go before that block's closing `});` at `:582`.
11. **Task 13 replay.** Added that a git worktree has no `tmp/`, so the harness and inputs must be copied there and both labels run in one checkout. The expectation table contradicted Task 3's and Task 6's intended unverified → validated moves (C-6, base exclusion, removed period findings). It now lists the allowed upward classes, each with its bound span. Also fixed the ROIC/accrual reason (`text-context-mismatch`) and added a key-number row.
12. **Sources checked.** All quotes were spot-checked: XBRL 2.1 §4.6.1/§4.7.2, S-X 10-01(c)(1)-(2), 15 U.S.C. 78u-5(i)(1)(A), 26 CFR 1.441-2(a)(1)/(c)(1), the Saurí-Pustejovsky PDF and the Rashkin et al. PDF. Corrections: the AIS "all parts" sentence is in the paper's annotation instructions, not its §3 definition. S-X (c)(2) concerns statements of comprehensive income and adds the "cumulative twelve month period ended …" sentence, which now supports OD-2. The LREC paper is described as the annotation scheme behind FactBank. The D-59, D-63, D-66, D-82, D-98 and F-22 line references match `DECISIONS.md`.
13. **Smaller fixes.** The cited spec file does not exist at HEAD. New residuals: "latest fiscal year-end" on a Q4 row of a quarterly series, a result clause that cites guidance, and a level row with only a base phrase. CHANGELOG bullets and Review Focus items 6-7 were added, and Task 15 checks `USD_ROW`.

**Checked and left as planned:** coverage (all 12 batch ids fixed; AI-303-V2, rejected as a duplicate, is covered by Task 3's excerpt test; AI-203 and AI-401-V2 are not B1's); OD-2; C-3, C-4 and C-6; the order Task 3 → 4 → 5 → 6 → 7 → 8 → 9 and the cross-task test interactions (re-traced: "latest" runs after the metric check; `labelLooseWindows` keeps `currentReports.test.ts:558` validating); stamps 1.45.0 / stage-c-1.6.10 with their five pins and the unchanged payload golden; the audit-deltas group carrying D-117 because `DECISION_PATTERN` rejects "D-next"; release-test registration; D-67 (no stored report rewritten; every finding is `storedReportImpact: none`, so no legacy display rule is needed); the AGENTS.md note (no Next.js file is touched).

**Left for the main session**

- Merge order and renumbering with B2 (same functions, same stamp moves), B3 (fiscal labels on `(latest)` rows; stale excerpt titles) and B9 (`currentReports.ts` "over"). Post-integration review (2026-10-28): B3 merges first. Its Tasks 8E and 8F are on this batch's base, and OD-1, Tasks 3, 3A, 12, 13 and 16 now state C-11's outcome.
- The recall residuals above, the bare "fiscal 2026" reader in particular, are follow-ups. They are not part of this batch.
- The probes still rewrite evidence logs. The review did not run them; it ran its own scratch tests under `tmp/audit-2026-10-27/plans/b1-review/`.

## Post-integration review (2026-10-28)

An independent review pass for decisions spec C-11 ("What B1 expects for NVDA #48's latest-year claims once B3 Task 8E exists") and master plan conflict row 55 and Task M2 Step 1. Only this file and `tmp/audit-2026-10-27/plans/B1.summary.json` were written. This plan's rule is unchanged (C-11: "B1's rule is unchanged; only its measured cost changes").

**What C-11 changes, traced against B3's plan as it now reads.**
- B3 merges first and gives NVDA #48's `computed.returns.roic-latest` and `computed.forensics.accrual-ratio-balance-sheet` records `fiscalPeriod: "FY2026"` and the period 2026-01-25. That is B3 Task 8E as amended at B3's own post-integration review: the label and the period, the annual statement cell's two fields.
- Under OD-1, a declared FY label establishes that fiscal year. Under Task 3, `basisWindows` reads an `FY<n>` label as the `annual` window, so the claim's `windowannual` token is established. "ROIC for the latest fiscal year was 149.8%." and "The balance-sheet accrual ratio for the same year was 0.64x." therefore stay validated. "same" is not in `NOT_A_WINDOW_BEFORE`, so "the same year" is read as an annual window, which the label establishes. Task 5's recency rule does not apply, because `computed.returns.roic-latest` carries no ISO date in its id.
- "ROIC for FY2025 was 149.8%." is a constructed claim (B3's NVDA #48 check), not a stored one. With B3 Task 8E as amended, the record's period makes the consistency period check run, and B3's Step 5 measures it unverified (`period-word-mismatch`) on B1's base. After this batch it stays unverified. It would move in this batch only if B3 had merged its pre-review draft (a label without a period). C-11's "still moves" is that case. Either way it is unverified after B1, which is what Task 13 checks.
- Task 3's synthetic `ROIC` and `ACCRUAL` records are the unlabelled shape B3 leaves when the payload holds no annual label. Their two `unchecked` lines stay correct after B3.

**Changes made.**

| # | Change | Where |
|---|---|---|
| 1 | The decisions spec is B3's to commit and register; B1 registers its own plan and note only | Spec line, Global Constraints (registration), Task 12 Step 1 |
| 2 | B1 is cut after B3 merges; Task 0 confirms B3's two test files are on the base | Branch line, Task 0 Step 1 |
| 3 | After rebasing on B3, regenerate the verifier sweep with `grep`, and run B3's `tests/stageC.latestFiscalLabels.test.ts` and `tests/stageC.releaseFiscalLabel.test.ts` | Global Constraints (verifier sweep) |
| 4 | Alternative (a) records that B3 Task 8E now does it. The measured cost is restated: the planning-time cost (two recall losses), and the cost with 8E on `main` (none on stored claims; FY2025 unverified) | OD-1 |
| 5 | The stale excerpt title is withheld by B3 Task 8F, and in the guidance tables by B9 Task 21A; it is no longer this batch's residual | Review Focus 5 |
| 6 | No validated → unverified move is expected from Task 3. Why the two #48 claims stay validated, what to check if they move, and a note on the unlabelled synthetic records | Task 3 Step 1 note, Step 5 |
| 7 | New Task 3A: B3 Task 8E's fourth test as the composition check, with its failing direction shown by locally removing B3's labels (never committed) | Task 3A |
| 8 | The table rows for the period-less and window rules restated, and a C-11 constructed-claims block on #48 with before and after columns | Task 13 Interfaces, Step 2 |
| 9 | The CHANGELOG bullet, the DECISIONS residuals and measured cost, and the PR's Decisions line state C-11's outcome | Tasks 12, 16 |
| 10 | Merge-order line updated | Left for the main session (Review notes) |

**Checked and left as planned.** Tasks 1, 2 and 4-9 are unaffected: their tests use synthetic records, and none reads a B3 label. The payload golden still must not move in this batch; B3 moved its `provenanceHash` for Task 8E before this branch was cut. The stamps stay 1.45.0 and stage-c-1.6.10, renumbered at merge after B3 and B2. The markdown checks, `tests/repository.release.test.ts`'s home-path and credential-value patterns and `tests/docs.lint.test.ts`'s relative-link check, were run read-only over this file after the edits: no match, and no relative link.

**Left for the main session.**
- C-11's note says "B1's plan was not edited in this pass". The plan now carries C-11's outcome. The spec's "Plan text" column for C-11 can say so when the spec is next refreshed.
- The FY2025 line's before value depends on which form of B3 Task 8E merges. Task 13's C-11 block accepts both forms and fails only on a validated after-value.
