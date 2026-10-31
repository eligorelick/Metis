# QCOM report 53 remediation plan

> **For agentic workers:** execute tasks test-first; use superpowers:subagent-driven-development for delegated implementation or superpowers:executing-plans for native execution. Record rulings and observed results in this plan's ledger. The owner selected autonomous execution without additional design approval.

**Goal:** correct demonstrated report/source handling defects while preserving valid financial figures, strict analysis validation and truthful historical snapshots.

**Architecture:** generic source-aware pair selection and parser admission, pure presentation helpers and bounded validation diagnostics. No issuer-specific overrides, live fetches during tests or raw-history rewrites.

**Tech stack:** TypeScript, Zod, Vitest, React/Next 16.4.2; use installed Next guides before edits.

**Spec:** `docs/superpowers/specs/2026-10-30-qcom-report-53-audit-design.md` (binding).

**Global constraints:** work only in the isolated QCOM worktree; exclude database/environment files from every search; never read real databases, settings or credentials, call paid providers, run forbidden maintenance commands, or touch port 3000/main checkout. Empty profiles/dead proxy/throwaway guards are approved. Named staging only, no history rewrite. One task commit, test-first with observed RED/GREEN. Fix code rather than weakening checks. Retain main figures when evidence is unknown; no new Blocked report. Preserve earlier cutoffs and all golden/replay provenance. Keep methodology/change/decision records exact. Independent final review is mandatory.

**Review focus:** fabricated source comparability, unsupported lease-zero claims, date/filing look-ahead, parser overcapture, failed-response acceptance, misleading model attribution, incomplete legacy-reader coverage and unowned numerical deltas.

## Task 0: Register the specification and execution plan

- [ ] Add this plan and its binding spec; stage only those named documents.
- [ ] Run `tests/repository.release.test.ts` under isolated profiles and observe the unregistered-document refusal.
- [ ] Register these two exact document paths in `ALLOWED_MARKDOWN`; preserve the document safety checks and forbidden-file rules.
- [ ] Re-run the contract test and typecheck; record results and commit `docs: plan QCOM report integrity remediation`.

## Task 1: Separate saved model evidence from next-run settings

**Files:** new `src/report/modelEvidence.ts`, `tests/report.modelEvidence.test.ts`; `src/report/presentation.ts`; `src/components/report/ReportEvidenceRail.tsx`; `src/app/company/[symbol]/GenerateReport.tsx`; `tests/report.executionMetadata.test.ts`; `tests/report.dossier.test.ts`.

- [ ] Read existing execution types/formatters and the installed server/client, use-client and Vitest guides. Define a pure `deriveReportModelEvidence(report: Report)` with separately represented requested configuration, recorded attempt evidence and completion/unknown state. Preserve legacy model-label uncertainty.
- [ ] Write RED regressions: saved data-only `unavailable` meta with failed bull attempts 1/2 and bear Sonnet execution, while future settings select a different model; rail must identify saved evidence, not call the sentinel requested. The generator must label its prospective route `Next run`.
- [ ] Add controls for completed, absent/legacy, API/subscription/mixed, deterministic, `none`, pre-call `model-rejected`, failed and unobserved-model evidence. No current setting may backfill missing saved metadata.
- [ ] Implement shared presentation; do not use the subscription-only model helper for API calls or claim an attempted configuration is an observed model. Preserve all existing failed/completed semantics and numerical values.
- [ ] Run targeted execution/dossier/generation tests and typecheck, log RED/GREEN, commit `fix: distinguish saved model attempts from next run`.

## Task 2: Explain known schema rejections without relaxing them

**Files:** `src/report/schema.ts`; `src/pipeline/jobRunner.ts`; `tests/jobRunner.test.ts`; existing analyst pass/schema tests.

- [ ] Write RED for a controlled investment-rating safety violation currently displayed as generic invalid, alongside an empty mandatory evidence source. Keep an arbitrary custom-message control that must remain redacted.
- [ ] Give the known validator a stable safe rule identifier/params and map only that identifier to a bounded diagnostic. Never echo rejected prose or reinterpret historical generic errors without the identifier.
- [ ] Prove two invalid bull attempts remain rejected/data-only with recorded usage, no synth/verifier and no extra retries; prove a valid repair is accepted and independent bear output is retained. Preserve native structured-output compatibility.
- [ ] Run targeted tests/typecheck; log and commit `fix: retain safe reasons for known analyst schema failures`.

## Task 3: Enforce one comparable receivables pair for forensic consumers

**Files:** new `src/edgar/receivables.ts`, `src/pipeline/stageB/receivables.ts`, `tests/edgar.receivables.test.ts`, `tests/stageB.receivablesComparability.test.ts`; `src/pipeline/compute.ts`; `src/pipeline/stageB/forensics.ts`; narrow compute integration regression.

- [ ] Define `filedReceivablesCandidates(facts, { periods, asOf, observedAt })` using existing tags/fact-point parsing, and `selectReceivablesPair(current, prior, { filedCandidates })`. Results distinguish selected same-concept/vendor-unverified/filed-pair from local unavailable, retaining evidence and notes.
- [ ] Write RED for current 4,315M/prior 2,347M with differing evidenced concepts, revenues 44,284M/38,962M. A complete admitted total-basis pair 4,315M/3,929M must produce growth `100*(4315/3929-1)` and DSRI `(4315/44284)/(3929/38962)`, consistently in both consumers.
- [ ] Controls: a selected consistent trade pair 2,855M/2,347M stays selected; genuinely adverse same-concept 200M/100M on revenue 1,100M/1,000M keeps DSRI 1.81818 and the adverse flag; unknown vendor behavior stays main's. Without a complete repair, an evidenced concept switch uses disclosed existing DSRI neutralization and no unsupported growth accusation.
- [ ] Test wrong issuer/currency/instant/form/date/cutoff, one-day endpoint mismatch, ambiguous and superseding conflicting copies, alias conflicts, incomplete pair, zero prior and input permutations. Do not label test QNames as actual QCOM mappings without retained proof.
- [ ] Preserve provenance/conflicts/currency/CIK in `toForensicsBalance`; use issuer-confirmed already-acquired facts and exact selected annual endpoints. A forensic-only pair substitution must not mutate raw rows, capital inputs or source selection. Deep-freeze controls and assert unrelated outputs stay unchanged.
- [ ] Run extraction/pair/forensic/compute tests and typecheck; log any original-run evidence limit and commit `fix: require comparable receivables bases in forensic ratios`.

## Task 4: Qualify unknown lease coverage without inventing debt adjustments

**Files:** `src/pipeline/stageB/leaseScope.ts`, `currentCapital.ts`, `valuation.ts`; `src/pipeline/compute.ts`; optional report schema evidence marker; lease/current-capital/valuation numeric-consumer tests.

- [ ] Write RED for a current provider zero with no complete filed lease facts and older 102M/730M balances. Keep current recorded debt 15,270M and net debt 6,970M, import no earlier amounts, and remove unsupported disclosed-zero/all-inclusive/WACC assertions.
- [ ] Controls: complete same-period evidence including verified zero, complete nonzero and partial/conflicting provenance preserve existing calculations/refusals. Unknown nonzero values do not become fabricated disclosed totals either.
- [ ] Add a shared evidence classification consumed by capital labels and DCF/WACC notes; make zero verification require complete supporting evidence. Preserve main's accepted recorded-basis numbers when coverage is unknown and do not newly Block reports.
- [ ] Run lease-scope/numeric-consumer/current-capital/valuation tests and typecheck; log and commit `fix: distinguish unknown lease scope from disclosed zero`.

## Task 5: Admit bounded single-column guidance tables

**Files:** `src/edgar/guidanceTables.ts`, `src/edgar/currentReports.ts`; `tests/currentReports.guidanceTables.test.ts`; provider release integration and B5 calendar controls as needed.

- [ ] Write RED using a minimal source-derived release table headed Q4 FY26 Estimates, Revenues 9.7B–10.5B, GAAP diluted EPS 1.22–1.42 and non-GAAP 2.05–2.25; run through document parsing and release construction. Expected midpoints 10.1B, 1.32 and 2.15 are distinct source-bound observations.
- [ ] Support explicit endpoint scales/plural metric labels/current-column headers without converting segment rows or adjustments into consolidated guidance. Preserve accounting basis, currency, fiscal period, source row bounds and conflict/refusal rules.
- [ ] Controls: renamed issuer, old compact formats, ambiguous/duplicate/conflicting columns, reversed endpoints, wrong year/currency/scale and unsupported rows. Q4 remains usable while Q3 is latest reported and retires after Q4 is reported; reuse B5 logic unchanged. The 10.202B consensus Q4 implied by this report lies inside the filed range, so do not force an anchor override.
- [ ] Run guidance/parser/provider/comparability tests and typecheck; log and commit `fix: parse source-bound quarterly guidance tables`.

## Task 6: Cover Item 3.02 and match the coverage disclosure

**Files:** `src/edgar/currentReports.ts`, `src/providers/currentReports.ts`, `src/report/filingDisclosurePresentation.ts`; current-report/provider/material-event/presentation tests.

- [ ] Write RED for a 3.02-only filing with a real singular `Unregistered Sale` heading; prove candidate fetch and section retention, plus plural and renamed-issuer controls.
- [ ] Add 3.02 to the admitted material-item set and bounded singular/plural heading recognition. Embedded cross-references are not headings. Derive the reader's scope note from the actual admitted set, including existing 5.07.
- [ ] Keep conditional warrant conditions, exercise terms and source bounds; no automatic dilution, warrant value or backlog. Preserve filing window/cutoff, document-count limits and unread-filing errors.
- [ ] Run collector/section/payload/presentation tests and typecheck; log and commit `fix: include unregistered-sale filings in event coverage`.

## Task 7: Follow validated annual-note appendix redirects

**Files:** `src/edgar/extract.ts`, `src/pipeline/dataBundle.ts`; `tests/edgar.extract.test.ts`; annual-notes data-bundle regression.

- [ ] Write RED for a source-derived structure: short Item 8 pointer, Item 15 index with fragmented F-/8 and S-/1 labels, Item 16/signatures before real appendix, expected notes heading, Note 1 body, later note sentinels and uppercase SCHEDULE II.
- [ ] Resolve notes through an unambiguous same-document index/anchor relationship to the next schedule boundary. Preserve page namespaces, source identity/diagnostics, short-pointer refusal and normal next-item boundaries. Support boundary case variants without stopping on embedded references.
- [ ] Controls: broken/duplicate/ambiguous anchors, wrong title, earlier references, missing next boundary, repeated page headers and existing ordinary/JPM note structures. Exclude signatures, schedules and exhibit lists; keep statement-prefix bounds. Do not bypass the original Item 8 refusal or promote an unvalidated whole-document scan.
- [ ] Run extraction/data-bundle tests and typecheck; log actual structural-fixture versus raw-markup limits and commit `fix: follow validated financial-note appendix anchors`.

## Task 8: Distinguish an unknown market-cap date from a missing value

**Files:** `src/pipeline/stageB/scoringEvidence.ts`; `tests/stageB.scoringEvidence.test.ts`.

- [ ] Write RED for a successfully computed original Altman score whose market-cap observation date is absent: the caption must say `market-cap observation date unavailable`, not imply the value was absent.
- [ ] Controls: a recorded market-cap date remains displayed, another Altman variant is unaffected, and a genuinely missing market-cap value continues to refuse the original variant. Keep score values, variant admission, own-row source dating and FIN312 behavior unchanged.
- [ ] Implement only the bounded presentation correction; run scoring-evidence/forensics tests and typecheck, log and commit `fix: clarify missing Altman market-cap observation dates`.

## Task 9: Align legacy readers, methodology and release evidence

**Files:** new pure legacy scope-note adapter only if required; all five existing legacy-reader boundaries and tests; `docs/METHODOLOGY.md`, `CHANGELOG.md`, `docs/audit/DECISIONS.md`; new `docs/audit/2026-10-30-qcom-report-53-integrity.md`; version/payload/Stage B constants, golden fixtures and exact document/risk registrations.

- [ ] Write RED for old snapshots lacking new scope proof: no unsupported historical figure is silently recomputed or relabeled verified. Show the qualification consistently in classic/dossier/Markdown/print/audit readers. Preserve raw bytes, stored read modes and prior bridge/annualization/financial-return notes.
- [ ] Implement the smallest shared immutable read adaptation needed; no new report blocking. Keep earlier convention cutoffs 1.50/1.51/1.52 frozen. Recheck actual main before taking the next stamps; initial reservation is report 1.53.0, payload 1.55.0, Stage B 34, D138.
- [ ] Update methodology/changes/decision/disposition with only implemented behavior and every judgment/deferred issue. Register exact public documents and new risk modules without lowering floors. Preserve the whole counted payload-golden restoration chain; attribute every changed canonical leaf.
- [ ] Run offline main-to-branch replay with identical fresh empty profiles/dead proxy/throwaway guards; use retained saved/supplemental/peer/stored fixtures and new filed-figure QCOM regressions. No original-run claim without retained unrounded inputs. Require zero unowned leaves, zero new Blocked reports and unchanged stored snapshots/read modes.
- [ ] Run `npm run audit:deltas` dry; trace every changed leaf to a task and filed evidence, then write group `qcom53-report-integrity-d138-20261030` only after attribution passes.
- [ ] Run relevant contracts/goldens/types, log and commit `fix: publish consistent report scope and audit conventions`.

## Task 10: Independently verify and deliver

- [ ] With no other job in this worktree, run the unchanged nine-gate script on the final commit and confirm 9/9, including both coverage suites, full product/integration, build and security. Fix failures with test-first code changes; never weaken checks.
- [ ] Obtain independent task and whole-branch review. Push the branch/open the PR, request remote Codex review, address all real findings and rerun affected replay/final gates until the new head is clean with zero open threads and required CI passed.
- [ ] Produce the full source-linked independent QC artifact with confirmed facts, hypotheses, conditional grade/DCF assessment, judgment calls and remaining limits. Verify desktop/mobile rendering offline. Keep the original export unchanged and never claim absence of every possible defect.
- [ ] Integrate only within the owner's merge authorization after all checks/review pass. Report the PR, material report changes, biggest justified moves, judgments and what remains unverified/unfixed in short plain English.
