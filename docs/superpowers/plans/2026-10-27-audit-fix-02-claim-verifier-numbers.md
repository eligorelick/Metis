# Claim verifier: sign, scale, unit and metric binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Make the deterministic claim verifier read each figure's sign, scale, unit, relation, bound, metric and column period correctly, so that a `[validated]` mark or a green citation-traced check is given only when the cited source states that figure for that metric, and a correct figure is never marked contradicted.

**Architecture:** The fixes stay inside Stage C's verify step. The prose quantity reader (`claimEvidence.quantities`), the consistency number scanner (`consistency.parseNumbers`) and the direction classifier (`consistency.quantityDirection`) get token-boundary, sign, relation and bound fixes. The excerpt binder (`excerptNamesMetric`, `sourceBindings`, `tableColumns`) gets an own-description rule and an amount-only table scale. The registry branch of `runVerifyPass` starts reading the printed row description and the MetricRow column period. Four smaller rules move with them: insider owner types, entity primary sources, return-path wording and the rating gate. Round 4 adds four more readings: a comparison-base figure ("from $A", "compared with $A") binds only a comparison-base claim, and the end of a "<direction word> from $A … to $B" move takes the move's metric (Task 16); on the record path a direction word in the record's own label is part of its metric (Task 17), a difference's or ratio's operands are read in order (Task 18), and a percentage-point record is a signed change only when it measures one (Task 19, OD-6). No Stage B value, payload data or stored report byte changes. The only prompt-text change is one judge instruction line (Task 13).

**Tech Stack:** TypeScript (strict), Vitest, Zod (report schema), Next.js 16 app (no route or `src/app` file is touched by this batch).

**Spec:** tmp/audit-2026-10-27/REPORT.md (section 7, batch B2), tmp/audit-2026-10-27/findings.json, docs/superpowers/specs/2026-10-27-audit-remediation-decisions.md (not tracked at HEAD 6542531; written at the master-plan integration and committed by the main session before execution. Its section 4.1 lists AI-502 as open; OD-6 below decides it. Until the spec records OD-6, this plan's "Owner decisions" section is the record. Its section 4.3, "Main-session resolutions (2026-10-28)", settles this plan's open calls; see "Integration notes (2026-10-28)" at the end).

**Branch:** `fix/claim-verifier-numbers`, cut from an up-to-date `main` (`git checkout main && git pull --ff-only && git checkout -b fix/claim-verifier-numbers`). Merge after B1 (`fix/claim-verifier-periods`) if B1 merges first: both change `claimEvidence.ts`, `consistency.ts`, `gradeContract.ts`-adjacent statuses and `verificationMarks.ts` (REPORT.md section 7 shared-files table), so rebase onto B1 and re-run Task 0's replay before pushing.

**Findings in scope (24):** AI-202 (High), AI-304 (High), AI-305 (High), AI-401 (High), AI-401-V1 (High), AI-503 (High), AI-503-V1 (High), AI-304-V1, AI-304-V2, AI-305-V1, AI-116, SEC-203, AI-103, AI-403, AI-407, AI-408, AI-501, AI-502, AI-503-V2 (Medium), AI-304-V3, AI-104, AI-111, AI-409, AI-504 (Low). AI-203 is merged into AI-403 and AI-401-V2 into AI-401; their probes are covered by those tasks and they get no task of their own. The six round-4 findings (AI-501 to AI-504) are handled by Tasks 16 to 19; see "Amendment notes (round 4)". Round 4's batch B13 (derived EBIT operands, D&A totals, fourth-quarter lineage) is planned in `docs/superpowers/plans/2026-10-27-audit-fix-14-edgar-derived-lines.md`, not here.

## Global Constraints

- Failing test first: every task's new test is run and seen to fail on the branch before its fix; a finding whose test cannot be made to fail is skipped and reported, not fixed blind.
- Smallest change that fixes the whole class; no ticker-specific code, no unrelated refactoring, no renaming of untouched code.
- One commit per task, staging files by name (`git add <path> ...`); never `git add -A` or `git add .` (tmp/ and the audit folder must stay uncommitted).
- Fixtures: committed tests use synthetic text, short quotations of public SEC filings, or the already-committed SEC fixtures under `fixtures/edgar/` (`nvda-current-reports/q2fy27-ex99-2.txt`, `nvda-periodic-sections/nvda-10q-q2fy27-notes.txt`, `nvda-periodic-sections/nvda-10k-fy2026-item1.txt`, and for Task 16 `nvda-periodic-sections/nvda-10q-q2fy27-item2.txt`). Never commit FMP or other paid-vendor data; the run-input snapshots under `tmp/audit-2026-10-27/data/evidence/` contain FMP data and are read only by the uncommitted replay (docs/DATA-RIGHTS.md).
- Tests are hermetic: no live network, no market-data, SEC, FMP or AI-provider call, no paid call, never a report for a real ticker. Judge tests use `MockRunPass`; verify tests pass deps whose `runPass` throws.
- Never weaken a check or loosen a test to make it pass. Existing tests are not edited unless the task says why the old expectation was the defect. A stricter verifier that marks more claims unchecked is intended.
- Stored reports are never rewritten (D-67). AI-116 is "needs reinterpretation": its legacy rule is display-time only (Task 12).
- Version stamps: REPORT_SPEC_VERSION 1.44.0 -> 1.45.0 and PIPELINE_VERSION stage-c-1.6.9 -> stage-c-1.6.10, moved once in Task 20 with their pins: `tests/report.versionStamps.test.ts:88,94`, `tests/jobRunner.test.ts:6197,6204` and `tests/stageC.payload.passes.test.ts:2738`. PAYLOAD_VERSION, STAGE_B_IMPLEMENTATION_VERSION and SCORE_BANDS_VERSION do not move: no payload, Stage B or band change. REPORT.md's B2 entry lists PAYLOAD_VERSION because AI-502's fix sketch put a kind field on registry records; OD-6 classifies percentage-point records in the verifier instead, so no payload byte changes (see OD-6, alternative b).
- The payload golden (`tests/stageC.payload.passes.test.ts` fingerprint/promptBytes/finance and provenance hashes) holds its data hashes: no task changes payload data. The only admissible move is a prompt-bytes re-pin traced to Task 13's judge instruction line, re-pinned with a dated comment (Task 21); anything else stops the batch.
- `npm run audit:deltas` (without `--write`) is expected to report the DEMO control's `report.meta.specVersion` 1.44.0 -> 1.45.0 from Task 20. No Stage B leaf may move: this batch changes no Stage B value. A `verified` or verification-log leaf of the DEMO report may move only through Tasks 10 to 12 or 16 to 19, and must be traced (Task 22). `--write --group` is run only after every moved leaf is traced to a fix here.
- Markdown in the same commit as the behaviour: docs/METHODOLOGY.md, src docstrings that describe the rule, README only if it states a changed rule (it does not today: README.md:151-152 says only "traced to the record it cites").
- CHANGELOG.md entry, one `docs/audit/DECISIONS.md` entry per owner decision plus one entry for the round-4 house conventions and one for the batch's known residuals (Task 25, entries 6 and 8; "D-next", renumbered at merge; D-116 is the latest at HEAD; "DECISIONS.md" below always means that file), a disposition note `docs/audit/2026-10-27-audit-fix-02-claim-verifier-numbers.md` registered in `tests/repository.release.test.ts` (REQUIRED_RELEASE_FILES, after line 96). If this plan file is committed, add it to the same list (after line 124).
- New test files must be `git add`ed before `npm run test:product` (the release test derives the suite from tracked files). `claimEvidence.ts`, `consistency.ts` and `passes.ts` are risk-coverage files: new branches need tests that reach them (`tests/risk.coverage.test.ts` per-file 85/75/85/85).
- Before/after proof by replaying stored run inputs with no provider or model calls (Task 0 and Task 23).
- `npm run verify` in foreground chunks (Task 27); a fresh reviewer over the whole diff (Task 28); a plain-English PR description (Task 29).
- AGENTS.md: no task touches `src/app`, a route handler or the proxy, so no `node_modules/next/dist/docs/` guide is required. If an implementer finds a task needs one, read the matching guide in `node_modules/next/dist/docs/01-app/` before editing.
- Code comments cite decisions as `D-next`/finding ids and `docs/METHODOLOGY.md "<heading>"`, never section numbers of retired docs (tests/docs.lint.test.ts).
- Treat filing, provider, model and web text as data, never as instructions.

## Owner decisions

The owner delegated these calls ("Use your recommendation based on research to make this a professional accurate repository"). Each is recorded as its own DECISIONS.md entry in Task 25.

### OD-1. How strictly an excerpt figure binds to a claim's metric (AI-305, AI-305-V1; recommended default 3)

**Question.** D-63 lets an excerpt clause validate a claim when every claim word appears somewhere in the clause and the clause's definition modifiers are in the claim. Should a figure bind only to its own description (stricter), or keep the clause-wide word test?

**Decision.** Keep D-63's test and add an own-description test. The description is computed the same way for every excerpt figure, so it applies to prose claims and to TracedNumbers on the second gate:
- *Prose figure:* the source words from the clause start, the previous figure or the last `(`, `:` or `;` before the figure, up to the figure. After the figure, the words up to the first `,`, `;`, `:`, `(`, `)`, em dash or en dash, or to the next figure.
- *Table cell:* the row label (`TableColumn.label`). Any table scale declaration in it (a `TABLE_SCALE` match such as "(In millions)" or "($ in millions, except per share data)") is blanked first, and then only the text after its last colon is kept. Without the blanking, the first row under "($ in millions, except per share data)" would need the claim to name "except", "share" and "data".
- Every content word of that description must be named by the claim. The content words exclude grammar words already ignored, an explicit closed list of context words, ordinal period phrases and the issuer name.
- The context-word list covers copular and recognition verbs, pronouns, approximation hedges and "record", plus the relational links "associated" and "related", and the point abbreviations "pt" and "pts" that a previous table cell can leave in a row lead (METRIC_GRAMMAR already drops "bp", "bps", "pp", "pps" and "points"). It never includes a noun, adjective, comparator, definition modifier or direction word.
- A figure that the sentence gives to another noun ("a record of nearly $26.0 billion to shareholders", "benefiting our diluted earnings per share by $1.93", "a $169 billion annualized revenue run rate", "cash, marketable investments, and restricted cash of $73.48 billion") then stays unchecked.

The rule is applied to each candidate together with HEAD's rule, so it never admits a candidate HEAD rejected. It can still move a claim from unchecked to validated. That happens when HEAD's subset rule also admitted a wrong-metric candidate beside the right one, so the claim was ambiguous, and the stricter rule removes the wrong one. Review check at HEAD: "Revenue as of 2026-01-25 was USD 215.938 billion." against "Year Ended Jan 25, 2026 Jan 26, 2025 ($ in millions, except per share data) Revenue $ 215,938 $ 130,497 Cost of revenue 62,475 32,639 …" is `unchecked / text-ambiguous`, because "Revenue" is also a subset of "Cost of revenue". After this rule, and the declaration blanking above, it binds only the Revenue row and validates. Task 9 lists and checks every such move. It does not forbid them.

**Scope note.** Default 3's second half, that forward-looking clauses do not inherit the excerpt's reporting period, is AI-302-V1 in B1. B2 does not change period inheritance.

**Alternatives rejected.**
- (a) *Keep D-63.* Its clause-wide subset test is the "lexical overlap" heuristic. It validated four wrong metrics on the real excerpts of reports #43, #46 and #50, and two of them are visible as green key-number checks (AI-305-V1).
- (b) *A syntactic noun-phrase parser.* It would add a parsing dependency, and its output would be probabilistic and hard to pin in tests.
- (c) *A symmetric whole-clause test with only a context-word list.* Trailing explanations (", driven by …", ", as we prepare for …") would fail almost every correct figure in an earnings release. Cutting the description at the first punctuation after the figure is what keeps the context list small and closed.

**Revises.** D-63 (recall-over-precision choice for excerpt clause binding, DECISIONS.md:252, code comment claimEvidence.ts:456-464) and D-45's accepted same-sentence residual for the second number gate (DECISIONS.md D-45; METHODOLOGY.md:2678-2681). D-66's requirement that GAAP and net modifiers stay required (DECISIONS.md:219) is kept.

**Sources.**
- McCoy, Pavlick and Linzen, "Right for the Wrong Reasons: Diagnosing Syntactic Heuristics in Natural Language Inference", ACL 2019, https://aclanthology.org/P19-1334/. The paper names the lexical overlap heuristic as fallible: "Assume that a premise entails all hypotheses constructed from words in the premise." Its counterexample is "The doctor was paid by the actor" ⇏ "The doctor paid the actor". This is D-63's subset test, and the $26.0 billion case is its financial analogue.
- Harper et al., "SemEval-2021 Task 8: MeasEval", https://aclanthology.org/2021.semeval-1.38/. A quantity is read with its own Measured Entity, Measured Property and Qualifier. Subtask 4 marks "any Qualifier … needed to record additional related context to either validate or understand each identified Quantity". A quantity's meaning is its own entity/property/qualifier, not every noun in its sentence.
- Rashkin et al., "Measuring Attribution in Natural Language Generation Models", Computational Linguistics 49(4), 2023, https://aclanthology.org/2023.cl-4.2/. A statement s is attributable to source P when "a generic hearer will … affirm … 'According to P, s'". "According to the CFO commentary, free cash flow was $26.0 billion" is not affirmed by the sentence.
- Review check (2026-10-27): the McCoy et al. abstract names "three fallible syntactic heuristics: the lexical overlap heuristic …". The MeasEval paper (section 2) asks systems to "Identify and mark the span of any Qualifier (e.g. after incubation) that is needed to record additional related context to either validate or understand each identified Quantity". The arXiv text of Rashkin et al. defines attribution: "A generic hearer will, with a chosen level of confidence, affirm the following statement: 'According to P, s'". Each passage quoted above was checked against its source.

### OD-2. A registry-cited figure printed under a description that names another metric (AI-407)

**Question.** Should such a figure fail closed (lose its check mark), or keep the check mark with the record's own label substituted?

**Decision.** Fail closed on a detected conflict, as `text-context-mismatch`. That is unverified, never contradicted (F-22).

The printed description depends on where the number sits:
- *Under a MetricRow:* the row label, with a leading FACT, ESTIMATE or JUDGMENT tag (followed by a colon or a dash) removed, plus the words of a worded unit (`unitLabel`, src/report/format.ts:237). Rules 1 to 3 and 5 below are read on it.
- *Under any other named row:* only rule 4 reads the row's name, and only when the cited record is a segment record. The worded unit is still read by rules 1 to 3 and 5. The walker (passes.ts:2634-2647) gives every named row's name to its numbers. That covers segments {name, revenue}, but also peers {name, metrics}, macro series {name, latest}, scenarios {name: "bull" | "base" | "bear", priceTarget}, scenario targets and executives. A peer's company name, a macro series' "FACT: Ten-year Treasury yield" or a scenario's "base" names an entity or a series, not a metric. Reading them as metric descriptions would unverify true rows. For example, macro records are labelled `${seriesId} (core)` (payload.ts:1837-1838), so "Ten-year Treasury yield" shares no word with "DGS10 (core)".
- *A key number with no row:* only the worded unit.

The description conflicts with the cited record's label when any one of these holds:
1. Both sides name a level from {gross, operating, net, pretax/pre-tax, ebit, ebitda} and the two sets differ.
2. Both sides name a share basis from {basic, diluted} and they differ.
3. Exactly one side names a non-default basis from {non-gaap, adjusted, core, underlying, organic, pro-forma, normalized}. A macro record's own section tag, a trailing " (core)" or " (sector)" on a `payload.macro.` record, is removed from the label first, because it is the payload's section name (payload.ts:1852-1857) and not a basis.
4. The record is a segment record, with an id starting `payload.segments.` or `payload.segment-revenue.`, and the description does not contain every token of the record's member. The member is the label after its first ": ". For a `payload.segment-revenue.` record it stops before the producer's own " revenue" suffix (payload.ts:2400: "<axis>: <member> revenue…, quarter ended <date>").
5. Both sides name a metric head from the closed list `METRIC_HEADS`, and the two sets of heads are disjoint. The heads are:
   - revenue: revenue, revenues, sales, turnover;
   - income: income, earnings, profit, profits;
   - eps;
   - margin;
   - cash;
   - debt;
   - equity;
   - assets;
   - capex: capex, expenditure, expenditures;
   - dividend: dividend, dividends;
   - ebitda;
   - roic, roe and roa;
   - price;
   - yield;
   - shares.

   The phrases "return on invested capital", "return on equity" and "return on assets" are read as roic, roe and roa on both sides first. Rule 5 is a detected conflict ("Revenue" printed over "net income"). Plain disagreement is not enough: a description with no head word ("Leverage", "Top line") passes.

An empty description passes, which is HEAD behaviour, and so does a record with no `label`. Stage B numbers registered by `registerStageBNumber` (projections, scenario targets, fair value; payload.ts:2781-2807) carry none.

A number whose `source` parses, through `parseCitationRef`, to the id of *another registry record* than its matched `sourceId` is also unverified. The printed label is built from `source`, while `sourceId` is what was checked. A `source` that is not a registry id is not read. The SEC Archives reader link that `bindDeterministicReportProvenance` keeps on primary geographic segment rows is one example (stageC/index.ts:468-483, `retainReaderSource`); "computed" is another.

**Alternatives rejected.**
- (a) *Substitute the record's label.* A MetricRow has one label for many cells, so a silent relabel would show text the judge never wrote. It would also hide the model error from the audit log.
- (b) *Require full symmetric agreement.* True paraphrases would lose check marks on every report: "Diluted EPS (annual, GAAP)" for the record "diluted EPS", "Latest annual ROIC" for "ROIC (latest)". The auditor's scan of 831 stored MetricRow cells found no real mismatch, so a conflict rule loses no true check mark there.
- (c) *"Shares no token" as rule 5 (this plan's first draft).* It is a weak agreement test, not a detected conflict. It would also unverify every macro row ("Ten-year Treasury yield" against "DGS10 (core)") and every row that paraphrases without a shared word ("Leverage" against "netDebtToEbitda"). Replaced by the closed head-word disjointness rule.

**Revises / extends.** Extends D-44 ("the report prints the unit verbatim beside a verified number", METHODOLOGY.md:2643-2649) from indicator names to every printed description. Amends the provenance.ts:278-283 design note ("the description cannot change what is verified").

**Sources.**
- Rashkin et al. 2023 (AIS), https://aclanthology.org/2023.cl-4.2/. "Gross margin 66.2% ✓" is the statement "gross margin was 66.2%", and "According to [operating-margin record], gross margin was 66.2%" is not affirmed.
- Internal precedent: D-44, `namedUnitMatchesRecord` (passes.ts:3022).

**Confirmed (main session, 2026-10-28; decisions spec 4.3, B2).** Rule 5 as redesigned in review (closed head-word disjointness over `METRIC_HEADS`, replacing the "shares no token" draft) and the registry-id-only printed-source test are confirmed. Both are stricter than HEAD (they can only move a check mark to unverified), and the plan reviewer checked both against the stored rows (Review notes, Task 10).

### OD-3. A MetricRow cell's column period, and supplied periods on period-less records (AI-408)

**Question.** Should a column label the verifier cannot read leave the cell unverified or only not period-checked? Should the 10aa8ab rule that erases every supplied period on a period-less record be revisited?

**Decision.**
- (1) *Readable column.* A readable column is one with an ISO date, or an explicit fiscal label such as "FY2026" or "Q2 FY2027". The cited record must establish it:
  - a date must equal the record's period, or, when the record has no period, a date the record itself carries: its as-of, or a date its `periodContext` declares (`at`, or a duration's `end`). This is the same set B1's OD-1 lets a period-less record establish (integration change, 2026-10-28; see Review notes);
  - a fiscal label must agree through `periodsAgree` with the record's fiscal label (`fiscalPeriod`, else `periodContext.fiscalLabel`, as in B1's OD-1).

  Otherwise the cell is unverified (`period-mismatch`, F-22). That includes a fiscal label against a record with no fiscal label, consistent with recommended default 2 in B1: a named period a record cannot establish is never validated.

  A date column against a record whose period is neither null nor a single ISO date is *not period-checked*. Examples are a window "ttm: 2025-07-01 to 2026-06-30" and a string "Q2 FY2027". Window agreement is B1's job.
- (2) *Unreadable column.* A column with no date or fiscal label ("current", "latest", "5y CAGR"), or with a window ("TTM to …", "12M ending …"), is *not period-checked*. The verification-log note says so explicitly, so the cell never passes silently. Window agreement stays B1's job.
- (3) *Supplied period on a period-less record.* It is erased only when it agrees with the record's as-of or fiscal label, which keeps the haiku case behind 10aa8ab. A decidable conflict is `period-mismatch`. An undecidable spelling is erased as today.

**Alternatives rejected.**
- *Fail every unreadable column.* Stored reports use "current", "TTM to 2026-07-26" and "12M ending 2027-06-30" on true cells (#43, #48), so this would unverify correct figures.
- *Copy the record's period into every number that omitted it.* It would add a "period …" line to every quarterly cell and work against the readability phases R1–R4. The log note gives the same disclosure.

**Revises.** 10aa8ab (2026-09-02) "adopt the record's null" for every supplied period (passes.ts:3027-3043 comment). It also corrects METHODOLOGY.md:2575-2576 and the runVerifyPass docstring (passes.ts:2823-2826), which say the period is matched although the column was never read.

**Sources.**
- XBRL 2.1 Specification (REC 2003-12-31 + errata 2013-02-20), section 1.4 glossary, "Context": contexts "document the entity, the period and the scenario that collectively give the appropriate context for understanding the values of items". https://www.xbrl.org/Specification/XBRL-2.1/REC-2003-12-31/XBRL-2.1-REC-2003-12-31+corrected-errata-2013-02-20.html. A value's period is part of its identity, so a figure placed under another period's column is a different statement. (Review 2026-10-27: the glossary wording was checked against the specification page.)
- Rashkin et al. 2023 (AIS), as above.

### OD-4. Which sources may support naming an issuer's own drugs, trials and deals (AI-103)

**Question.** Should only the nine hard-coded investor.lilly.com URLs count as primary? Should the entity check fail the judge or only be disclosed? How is the registry maintained?

**Decision.** A source counts as primary for a registered entity when it is either of these:
- one of the record's registered URLs;
- an *issuer-originated disclosure that the payload itself carries*:
  - an `edgar:` source that the payload registers as a citation or excerpt;
  - the issuer's earnings-call transcript, `fmp:earning-call-transcript`;
  - an issuer press release row, `fmp:press-release`;
  - a payload or computed registry record built from the issuer's own data: a `provenanceRegistry` id under `payload.statements.`, `payload.issuer-filings.`, `payload.filing-facts.`, `payload.segments.`, `payload.segment-revenue.`, `payload.leadership.`, `payload.insiders.`, `computed.` or `payload.computed.`. This is an allowlist, so a new prefix fails closed. Third-party rows are not issuer disclosures and stay non-primary: `payload.peers.` (other companies), `payload.estimates.` (analyst consensus), `payload.institutional.`, `payload.short-interest.`, `payload.macro.`, `payload.quote` and `payload.news.`. The finding's fix sketch suggested "payload.*/computed.*", and D-20 admits "payload rows". The allowlist keeps the decision's own rationale, issuer-originated disclosure.

Third-party news (`fmp:news`, `finnhub:news`) and web results that are not registered stay non-primary. They keep failing the judge as a retryable `llm.judge.entities` gap, because the guard exists to stop misattributed pipeline claims that come from secondary sources.

The judge framing now states the admissible classes, and the issue text names them, so a retry can comply. The registry stays hand-curated and date-bound; the rule no longer depends on its URL list being complete.

**Alternatives rejected.**
- (a) *Disclosure only.* It would drop the guard against news-sourced misattribution, which still has a compliable failure path.
- (b) *Keep IR-only.* Every LLY judge that names Foundayo or retatrutide from the 10-K or the call fails three paid attempts and degrades to data-only (stored judge costs about $0.48 to $1.99 per attempt).

**Revises.** No D-entry recorded the IR-only list (entityValidation.ts:66-156, commit e25fb3a). It aligns with D-20's revised named-individual rule (filings, transcripts and payload rows admitted). The analyst path, gradeContract and legacyEntitySafety already filter `primary-source-required`, and stay unchanged.

**Sources.**
- 17 CFR 243.101(e), Regulation FD, https://www.law.cornell.edu/cfr/text/17/243.101:
  - (e)(1): an issuer makes "public disclosure" by furnishing or filing a Form 8-K;
  - (e)(2): or "through another method (or combination of methods) of disclosure that is reasonably designed to provide broad, non-exclusionary distribution of the information to the public".

  Issuer 8-Ks, 10-Ks and wire press releases are the issuer's own public disclosures. (Review 2026-10-27: (e)(1) and (e)(2) were checked against the Cornell LII text.)
- SEC Release 33-7881 (Aug 15, 2000), *Selective Disclosure and Insider Trading*, https://www.sec.gov/rules/final/33-7881.htm. Its model for compliant disclosure is a press release plus an open, publicly noticed conference call, which makes the earnings call an issuer disclosure.
- Internal: DECISIONS.md D-20 (revised 2026-09-06) admits filings, transcripts and payload rows for named individuals.

**Confirmed (main session, 2026-10-28; decisions spec 4.3, B2).** The issuer-prefix allowlist (narrower than the finding's "payload.*/computed.*" sketch; a new prefix fails closed) is confirmed. It is stricter than the sketch and keeps the guard against news-sourced misattribution; the plan reviewer checked it (Review notes, Task 13).

### OD-5. How far the rule-#3 rating gate may be loosened for names and abbreviations (AI-111)

**Question.** Should the sentence-initial rating pattern at schema.ts:251 still read "Hold" in "William J. Hold" or "Ms. Hold" as a rating?

**Decision.** A period does not start a new sentence for the rating pattern in two closed cases. The match is case-sensitive, on a masked copy of the text.
- **Honorific.** The period ends one honorific from a closed list that is written *before* a surname: Mr, Ms, Mrs, Mx, Dr, Prof, Rev, Hon, Sen, Rep, Gov, Gen, Col, Capt, Lt. The next word must be capitalised and must not be a rating word that is the whole sentence. St, Jr and Sr are left out. Jr and Sr follow a surname, and St also abbreviates "Street" ("on Main St. Buy before earnings."). In both cases the next word is not the person's surname.
- **Initial.** The period ends a single capital initial written after a capitalised word ("William J.", "Mary B."). The next word must be a rating word that is itself followed by a dash, comma, opening parenthesis or possessive, as a surname in "William J. Hold — Chief Scientist", "William J. Hold, the CTO, said" or "William J. Hold's team" is. A rating word followed by any other word is not unmasked. "Plan B. Buy before earnings." and "Plan B. Buy NVDA now." stay caught, and so does the rarer "William J. Hold said margins expanded." (fail-closed, as "We met Ms. Hold." is). The text alone cannot tell "Plan B." from "Mary B.", so only the punctuation after the rating word decides.

"the U.S. Buy the dip" stays caught, through the existing "buy the dip" directive pattern and because no capitalised word precedes the initial. "Class B. Hold." stays caught, because a rating word that is a whole sentence is never unmasked. No rating pattern changes, and every existing rating test still fails closed.

**Alternatives rejected.**
- *A general abbreviation list.* An open-ended list would widen the hole in rule #3.
- *A name check against person rows.* Data-only reports and synthesis text have no row to check against.
- *Unmask any capitalised word after an initial (this plan's first draft).* It would stop catching "Plan B. Buy before earnings." and "Class A. Sell ahead of the print.", which HEAD catches. That weakens a non-negotiable check further than the finding needs. The data-only FACT "<name> — <title>." (dataOnlyReport.ts:662-675), which is the real trigger, is covered by the dash case.

**Revises.** None recorded (782a853 last shaped schema.ts:251).

**Sources.**
- Kiss and Strunk, "Unsupervised Multilingual Sentence Boundary Detection", Computational Linguistics 32(4), 2006, https://aclanthology.org/J06-4003/. The period also marks "abbreviations, initials, ordinal numbers", and abbreviations are a major share of ambiguous cases, so an initial's period is not evidence of a sentence boundary.
- FINRA Rule 2241(c)(2), https://www.finra.org/rules-guidance/rulebooks/finra-rules/2241. A member that uses a rating system "must clearly define in each research report the meaning of each rating". Buy, hold and sell are regulated recommendation signals, which is why the exception stays closed and minimal.
- Review check (2026-10-27): Kiss and Strunk (2006, section 1) say the period "is also used to mark abbreviations, initials, ordinal numbers, and ellipses". FINRA 2241(c)(2) reads "A member that employs a rating system must clearly define in each research report the meaning of each rating in the system". Both were checked against the source text. The paper treats initials as a separate, harder subclass, which supports deciding the initial case by its context and not by the period alone.

**Confirmed (main session, 2026-10-28; decisions spec 4.3, B2).** The tightened mask (a listed honorific before a non-whole-sentence rating word; a single initial only when the rating-word surname is followed by a dash, comma, opening parenthesis or possessive; St, Jr and Sr left out) is confirmed. It is stricter than the planner's draft, keeps every HEAD rating catch, and was checked by the plan reviewer (Review notes, Task 15).

### OD-6. Which percentage-point records are signed changes, and whether a signed difference keeps a comparative sign check (AI-502; round 4)

**Question.** `isDeltaRecord` treats every percentage-point record as a signed change (consistency.ts:665-670), so a movement verb is checked against the sign of a level difference. Should signed differences (relative strength vs SPY, actual vs prior guidance midpoint, revenue acceleration) keep a comparative sign check ("1.03 percentage points lower") while true levels (the ROIC − WACC spread, T10Y2Y and T10Y3M, the absolute accrual divergence) get none? And should the record kind come from the payload or from the verifier?

**Decision.** A percentage-point record is a signed change only when it measures a change over time:
- its unit is `percentage-points-per-year` (a slope: the margin slopes, the capex/revenue slope, the `operatingMarginSlope` score driver); or
- its unit is `percentage-points`, its final id segment names a change with the existing slug vocabulary (growth, cagr, change, delta, chg, yoy, qoq, expansion, contraction, revision; for example the guidance "adjusted EBITDA margin expansion" rows and a `…-operating-margin-change` row), and its label does not name two operands joined by a difference operator (" − ", " - ", "minus", "vs", "versus", "over"; `labelOperands`, Task 18).

Every other percentage-point record is a difference between two quantities measured at one date, or a magnitude. That covers the ROIC − WACC spread and its `roicVsWaccSpread` and `equityReturnVsCoeSpread` score drivers, T10Y2Y and T10Y3M, the terminal excess return over cost of equity, relative strength vs SPY and the `relStrength*` drivers, the actual-vs-prior-guidance-midpoint rows, the implied-vs-achievable drivers, the absolute accrual divergence and its `computed.forensics.accruals.divergence` alias, and revenue acceleration (YoY − 3y CAGR). Revenue acceleration is two growth rates measured now. Its slug contains "yoy" and "cagr" only because those name its operands, so the operator test is what keeps it out.

Against such a record no direction word is read, before or after the figure, signed or not. A claim that puts a movement verb or a comparative beside the figure stays unchecked (`text-context-mismatch`: the cited typed value does not establish the prose directional relation). It is never validated or contradicted, and the consistency direction check does not run on it. The sign of a signed difference is still checked through its value: "−1.03 percentage points" against +1.03 is a value conflict, as at HEAD.

The classification lives in the verifier (`isDeltaRecord`). A pin test over every percentage-point record in the test helper payload makes a new percentage-point row fail CI until it is classified (Task 19). The default for an unlisted row is "not a change". That is the fail-closed side: a new row can lose a direction check, never gain a wrong one.

**Alternatives rejected.**
- (a) *Keep a postposed comparative ("1.03 pp lower", "0.08 pp higher") as a sign check for "vs" differences.* HEAD does this by accident (the after-figure hit is read as a change) and gets two cases right: it validates "1.03 percentage points lower" and contradicts "1.03 percentage points higher" against relative strength −1.03. But the deterministic reader has no standard of comparison. "Lower" can mean lower than SPY (the record's second operand) or lower than before (a movement), and the movement reading is the defect AI-502 reports ("The ROIC − WACC spread was 136.76 percentage points higher" validates at HEAD). Reading the sign safely needs a "than <operand>" reader that checks the named standard against the record's second operand. No stored claim has this shape: a scan of all 52 stored verification logs found only figure-less `cited` entries with a direction word citing these records. So the loss is recall on a shape the writer has not produced, and it is recorded as a residual.
- (b) *A producer-set kind field on every registry record (the finding's fix sketch, and the lean in the decisions spec, section 4.1).* It would move PAYLOAD_VERSION and the payload golden's `provenanceHash` in a batch that changes no payload data. It would also add `payload.ts` to B2's files, which B3, B4, B5 and B13 already change. The record's unit, final slug and label already say what it measures. On every percentage-point row the payload registers today, the verifier rule gives the same classification the kind field would, and the pin test supplies the robustness the field would add. If a future change row cannot be named with a change word, the kind field is the follow-up, and the pin test is what forces that choice.
- (c) *Keep HEAD.* It validates movements no record measured ("T10Y2Y (core) rose 0.32 percentage points") and contradicts true level sentences ("Even as ROIC declined the ROIC − WACC spread was 136.76 percentage points."). F-22 reserves contradicted for a value conflict or a direction word against the sign of a cited change.

**Revises.** The percentage-point-unit shortcut in `isDeltaRecord` (D-20 WS7; audit 2026-09-06 F186 docstring at consistency.ts:646-663). It narrows what F-22 (DECISIONS.md:2250) counts as "its cited change". The lean recorded for AI-502 in `docs/superpowers/specs/2026-10-27-audit-remediation-decisions.md` section 4.1 is followed in outcome ("a direction word against a level leaves the claim unchecked, never validated") and replaced in mechanism (alternative b).

**Sources.**
- Eurostat, Statistics Explained, "Glossary: Percentage point", https://ec.europa.eu/eurostat/statistics-explained/index.php?title=Glossary:Percentage_point: "The term percentage point is used when comparing two different percentages. The abbreviation is pp." Its example ("A rate was 10% and it increased to 12%, then it increased by 2 percentage points") is a change over time, but the definition is any comparison of two percentages. So the unit alone does not say whether a record is a movement or a spread. (Checked 2026-10-28 against the printable page.)
- Federal Reserve Bank of St. Louis, FRED series T10Y2Y, https://fred.stlouisfed.org/series/T10Y2Y: "10-Year Treasury Constant Maturity Minus 2-Year Treasury Constant Maturity", units "Percent", frequency "Daily", and "Series is calculated as the spread between 10-Year Treasury Constant Maturity (BC_10YEAR) and 2-Year Treasury Constant Maturity (BC_2YEAR)". The spread is a daily level series in its own right. "Rose 0.32 points" would describe its change between two observations, which one registered observation does not establish. (Checked 2026-10-28.)
- Rashkin et al. 2023 (AIS), https://aclanthology.org/2023.cl-4.2/, as in OD-1. "According to [ROIC − WACC spread = 136.76 pp], the spread rose 136.76 pp" is not affirmed by a generic hearer.
- Internal: F-22 (DECISIONS.md:2250), "a direction word against the sign of its cited change, is contradicted"; `payload.ts:945` registers the divergence as `Math.abs(cashFlowAccrualRatio − balanceSheetAccrualRatio) × 100`, non-negative by construction.

### Decisions this batch does not need

Recommended defaults 1 and 4 to 9, FIN-402 and R1 to R4 do not touch B2's code paths. Default 2 (B1) is followed by OD-3, and default 3 by OD-1. AI-401's reading of "a gain of $X" as an unknown relation (Task 6) and AI-409's bound rule (Task 8) are house conventions, not owner decisions. The DECISIONS entries for OD-1 and OD-3 say so.

Round 4: AI-501, AI-503, AI-503-V1, AI-503-V2 and AI-504 need no owner decision (findings.json `ownerDecisionNeeded: false`). Their rules are also house conventions:
- a comparison base binds only a comparison base, and a move's end takes the move's metric (Task 16; extends D-63's postposed-only `levelBeforeComparison`);
- a record label's direction words are metric words (Task 17; narrows commit 30ccbad's label ignore set);
- operands are read in order (Task 18; makes D-66's "formula numerator/denominator … remain rejected" true for every record, not only the say-on-pay formula).

They revise recorded scope, so they get one DECISIONS entry together (Task 25, entry 6).

## Review Focus

The input classes or failure modes most likely to bite that no finding's probe exercises. Each line has a test added to the task named.

1. **Hyphenated ranges and year-dash-amount strings** ("$1.0-$1.2 billion", "$1.0 - $1.2 billion", "2025-$5 million", "FY2026-$3"). The new leading-sign reading must not turn a range's upper bound or a dashed year into a negative. A lookbehind alone does not cover the spaced range "$1.0 - $1.2 billion": a space precedes the dash, and HEAD reads it positive. Test: Task 2.
2. **Bare numbers followed by an m/b/k-initial word** ("6 months ended", "trailing 12 months", "5 key products", "3 brands"). AI-304's boundary fix must keep period phrases out of the quantity list, and a count word must not silently validate a two-figure clause. Test: Task 3.
3. **Correct excerpt sentences with intro or trailing clauses** ("Revenue for the second quarter was a record $46.7 billion, up 6% …", "Inventory was $31.6 billion, up from $25.8 billion sequentially, as we prepare …", the D-66 H200 charge sentence). The own-description rule must keep validating them. Test: Task 9.
4. **Statement tables whose row lead carries a heading or a scale declaration** ("Current assets: Cash and cash equivalents", "(In millions, except per share data) Numerator: Net income", "($ in millions, except per share data) Revenue"). The colon cut and the declaration blanking must keep the first row bindable. The per-share rule must bind the Basic row. The Diluted row of Note 3 binds nothing at HEAD and after: its lead is "Diluted (2)", and the "Net income per share:" heading sits only in the Basic row's lead. That is a recorded recall residual, not something this batch fixes. Test: Tasks 5 and 9.
5. **Registry row labels that paraphrase their record, and named rows that are not metric descriptions** ("Diluted EPS (annual, GAAP)" for "diluted EPS", "Latest annual ROIC" for "ROIC (latest)", "FACT — Quarterly operating margin"; a macro row "FACT: Ten-year Treasury yield" citing "DGS10 (core)"; a peer row "Advanced Micro Devices, Inc."; a scenario row "base"; a geographic segment row whose `source` is its SEC Archives reader link). AI-407's conflict rule must pass them all. Replays of the *assembled* reports #43, #46, #48, #49 and #50 (Task 0) must flip no stored check mark. Test: Task 10.

Round 4 adds four failure modes that no round-4 probe exercises:

6. **A "from" that does not open a comparison-base move.** Examples: an amount range ("expected to range from $4.0 billion to $4.2 billion"), a source "from" ("Proceeds from $5.0 billion of senior notes"), the to-first shape ("increased to $31.6 billion from $25.8 billion a year ago"), D-63's postposed ", up from", and the 10-Q's spaced dollar ("from $ 119 billion"). The base rule must not let a range's upper bound validate a level. It must keep the to-first and D-63 validations, and it must read the spaced dollar as a base. Test: Task 16.
7. **A record label whose direction word is part of the metric name, and a claim where that word is attached to the figure.** Examples: "net gains from equity securities, quarter ended …", "Q3 2026 adjusted EBITDA margin expansion (non-GAAP) guidance midpoint", "quarterly cash dividend per share before the increase". The label reading must keep the HEAD validations of correct claims, including "… margin expansion guidance midpoint is 1.625 percentage points", where "expansion" is the claim's attached direction. Test: Task 17.
8. **Operator words that do not separate two operands.** Examples: "to" inside "increased to" or between two dates of a label span ("…, 2025-07-27 to 2026-07-26"), a grammatical "subject to" ("investments subject to short-term lock-up restrictions"), an "over" before a window ("growth over trailing revenue") or inside a comparison basis ("revenue growth year over year"), an em dash that sets off a parenthetical ("before SBC — the graded ratio", "AMD — Advanced Micro Devices, Inc."), the "×" of the excess-return grid labels, an "absolute … versus …" magnitude, and camelCase "priceToBook". The order rule must keep every record-order and window paraphrase validated. Test: Task 18.
9. **Percentage-point records that are changes, and the label-less score-driver copies of the level rows.** The margin and capex slopes (pp/yr), `…-operating-margin-change`, `…-net-debt-to-ebitda-change` and the guidance "margin expansion" rows must keep their direction check. `computed.scores.quality.roicVsWaccSpread` and `computed.scores.valuation.reverseImpliedVsAchievable` must not have it. Test: Task 19 (classification pin).

## Task order and why

| # | Task | Findings | Stamp effect |
|---|------|----------|--------------|
| 0 | Replay harness (scratch, uncommitted) | none | none |
| 1 | Linear number scanners | SEC-203 | none |
| 2 | A leading minus before a currency | AI-202 | report |
| 3 | Whole-word scale and unit tokens in the prose reader | AI-304, AI-304-V1, AI-304-V3 | report |
| 4 | Whole-word tokens and currency codes in the unit check | AI-304-V2 | report |
| 5 | Table scale applies to amounts only | AI-403 (+AI-203) | report |
| 6 | Hedges and "an increase of" keep a change a change | AI-401 (+AI-401-V2) | report |
| 7 | An apposition after the figure is not a change | AI-401-V1 | report |
| 8 | A bound is not a value | AI-409 | report |
| 9 | A figure binds only to its own description (OD-1) | AI-305, AI-305-V1 | report |
| 10 | A registry number's printed description (OD-2) | AI-407 | report |
| 11 | A MetricRow cell's column period (OD-3) | AI-408 | report |
| 12 | Combined insider owner types | AI-116 | report |
| 13 | Issuer disclosures are primary for entities (OD-4) | AI-103 | pipeline |
| 14 | A described fade is not a return-path claim | AI-104 | report |
| 15 | An initial or honorific does not start a rating sentence (OD-5) | AI-111 | report |
| 16 | A comparison base binds only a comparison base; a move's end takes the move's metric | AI-503, AI-503-V1, AI-503-V2 | report |
| 17 | A direction word in a record's own label is part of its metric | AI-501 | report |
| 18 | A difference's or ratio's operands are read in order | AI-504 | report |
| 19 | A percentage-point record is a signed change only when it measures one (OD-6) | AI-502 | report |
| 20-29 | Stamps, golden, deltas, replay table, changelog, decisions, disposition note, verify, review, PR | all | |

Tasks 1 to 4 come first because the later tests rely on the scanners reading signs, scales and units correctly. Task 8 (bounds) comes before Task 9 so that the AI-305 probe's "nearly" and "over" cases fail for their own reason first. Tasks 10 and 11 both edit the registry branch of `runVerifyPass`; do them in that order.

The round-4 tasks come after Task 15 and in this order:
- Task 16 needs Task 9's `Context.own`, because it sets the own description of a move's end figure. Its Step 2 failures are stated for the branch after Task 15: Task 9 already leaves several AI-503 sentences unchecked, through the words "last" and "significantly" in the start figure's own description.
- Task 17 extends `metricTokens`, which Task 9 also calls. It must keep Task 9's file green.
- Task 18 adds `labelOperands`, which Task 19's change rule reads. So Task 18 comes before Task 19.

### Task 0: Before/after replay harness (scratch, never committed)

**Files:**
- Create: `tmp/b2-replay/vitest.replay.config.ts`. Copy `tmp/audit-2026-10-27/probes/vitest.probe.config.ts` with `root: path.resolve(__dirname, "../..")` and `include: ["tmp/b2-replay/**/*.replay.ts"]`. Keep SHARED_SETUP_FILES so the network stays blocked.
- Create: `tmp/b2-replay/verify.replay.ts` and `tmp/b2-replay/diff.mjs`.
- Never write into `tmp/audit-2026-10-27/`. The audit record is rebuilt only by its own tools, and some probes rewrite evidence logs.

**Interfaces:**
- Consumes: `verifyRunInputSnapshot` (`@/pipeline/runInputSnapshot`), `validateBundle(bundle, { now: new Date(bundle.builtAt) })`, `runStageB(bundle, snap.content.stageBConfig, validation)`, the production facade `pipelinePasses` (default export of `@/pipeline/stageC/index`): `pipelinePasses.assembleContextPayload(bundle, stageB, validation)` and `pipelinePasses.runVerifyPass(deps, judgeOutput)`. Also `collectTracedNumbers` (`@/pipeline/stageC/passes`), `returnPathLanguageManifestEntries`, `noBuySellHold` and `ReportSchema.safeParse`.
- Why the facade. Production does not verify the raw judge output. `pipelinePasses.runVerifyPass` (stageC/index.ts:688-735) first assembles the report: deterministic scores, projections, fair value, scenario targets and the primary geography are attached and bound by `bindDeterministicReportProvenance`. Only then does it run the verifier on that object. Tasks 10 and 11 change the registry branch that those pipeline-owned TracedNumbers go through, including scenario rows named "bull", "base" and "bear" and geographic rows with a reader-link `source`. A replay of the bare judge output would show "zero flips" for them without ever reading them. The facade must receive the payload object that `pipelinePasses.assembleContextPayload` returned, because it recovers bundle, computed and validation from a WeakMap keyed on that object.
- Produces: `tmp/b2-replay/out/<label>/<id>.json` with these fields:
  - `log`, a list of `{path, evidenceKind, check, validationStatus, reason, outcome, traceKind, note}`, taken from the facade's `log`;
  - `factualValidation` (`verifiedReport.meta.provenanceCoverage.factualValidation`);
  - `tracedCount`;
  - `numbers`, a list of `{path, verified, sourceId, unit}` over `collectTracedNumbers(verifiedReport)` paths;
  - `schemaParse`, a list of `{reportId, success, ratingHits}` covering every `tmp/audit-2026-10-27/data/reports/*.json`. `ratingHits` counts the prose strings that fail `noBuySellHold`;
  - `storedSha256`, the sha256 of every `tmp/audit-2026-10-27/data/reports/*.json`.

**Steps:**
- [ ] Step 1: For ids 43, 46, 48, 49 and 50, rebuild each payload from `tmp/audit-2026-10-27/data/evidence/<id>/run_input_snapshot.gen0.*.json`. Each id has exactly one snapshot file. Build it with `pipelinePasses.assembleContextPayload`.
  - The judge output is `JSON.parse(outcomeJson).data` of the last `pass === "synthesize"` artifact in `data/evidence/<id>/job_pass_artifacts.json` whose outcome has `data`. Each of the five ids has one.
  - Run `pipelinePasses.runVerifyPass({ payload, analysisModel: "replay-no-model", jobSeed: "b2-replay-<id>" } as unknown as PassDeps<ContextPayload>, judgeOutput)`. `PassDeps` comes from `@/pipeline/jobRunner`.
    - "replay-no-model" is not a `chatgpt/…` or `gemini/…` id, so `toPassDeps` takes the non-subscription path.
    - The verify pass is deterministic and never calls `runPass` (`verifyCapability: { billable: false }`, index.ts:545). The shared setup file blocks the network.
    - As a belt-and-braces check, `vi.mock("@/providers/anthropic", async (orig) => ({ ...(await orig()), runPass: vi.fn(() => { throw new Error("no model calls in replay"); }), runPassStreaming: vi.fn(() => { throw new Error("no model calls in replay"); }) }))`. This is the facade's only provider import (index.ts:51-57). Assert both mocks have zero calls at the end of each id.
- [ ] Step 2: Also run `ReportSchema.safeParse` on every stored report. Record the parse result and the count of rating-pattern hits (AI-111), which must not change for any stored report.
- [ ] Step 2a (round 4): The round-4 findings have no stored claim of their shape. The scan of all 52 stored verification logs found no validated or contradicted entry bound to a from/to span or citing the D-68 rows with a level claim, and only figure-less `cited` entries with a direction word citing a percentage-point level record. So the replay also checks the probes' own claims on the rebuilt payloads, without running the probes, which rewrite evidence logs.
  - Create `tmp/b2-replay/r4-claims.replay.ts`. Copy each claim text and cited id or excerpt from `tmp/audit-2026-10-27/probes/AI-501.probe.ts`, `AI-502.probe.ts`, `AI-503.probe.ts`, `AI-503-V1.probe.ts` and `AI-504.probe.ts` (payload #50) and `AI-503-V2.probe.ts` (payload #43). Include their "info" controls.
  - Run each claim through `runVerifyPass` from `@/pipeline/stageC/passes`, with the payload that `assembleContextPayload` rebuilt in Step 1 and a throwing `runPass`, exactly as the probes do. These are prose claims, not pipeline-owned rows, so the facade is not needed.
  - Write `tmp/b2-replay/out/<label>/r4-claims.json` as a list of `{finding, claim, source, validationStatus, reason, checks}`, where `checks` lists the `check:reason` rows.
  - `diff.mjs` diffs this file like the others.
  - Expected at `base`: the HEAD results in the probe logs `tmp/audit-2026-10-27/agents/r4-verify-6/AI-50{1,2,3,4}-log.txt` and `agents/r4-vverify-AI-503/AI-503-V{1,2}-log.txt`. A mismatch at `base` means the rebuild differs from the probe's, so stop and find out why.
  - Each row carries the probe's tag (`true-end`, `ctl-q2`, …), so Task 23's per-row expectations can be checked by tag. The probes' direct `validateClaimNumericSupport` rows (synthetic excerpts) are copied too.
- [ ] Step 3: Run `B2_LABEL=base npx vitest run --config tmp/b2-replay/vitest.replay.config.ts` (Git Bash; in PowerShell `$env:B2_LABEL='base'; npx vitest run --config tmp/b2-replay/vitest.replay.config.ts`) on the untouched branch. The harness reads the label from `process.env.B2_LABEL` and refuses to run without one. Expected: five payloads rebuild, there is no snapshot hash mismatch (`verifyRunInputSnapshot` throws on one), and the provider mocks have zero calls.
- [ ] Step 4: After each task, rerun with `B2_LABEL=t<N>`. Then run `node tmp/b2-replay/diff.mjs t<N-1> t<N>` for the step's own effect (with `base` as `t0`), and `node tmp/b2-replay/diff.mjs base t<N>` for the running total. Each prints every log row whose `validationStatus`, `reason`, `outcome` or `verified` changed. Rows are keyed by `path` plus `check`, because a path can hold a claim row and a check row.
  - Every changed row must be explained by that task's finding.
  - An unexplained flip stops the task. Find out why before going on, and never edit a test to absorb it.
- [ ] Step 5: Nothing in `tmp/` is staged. Check with `git status --porcelain tmp` after each commit: the folder is gitignored, so the output must be empty.

### Task 1: Linear number scanners (SEC-203)

**Files:**
- Modify: `src/pipeline/stageC/consistency.ts:214-219` (NUMBER_PATTERN), `:221-244` (parseNumbers start offset), `:199-210` (ParsedNumber doc).
- Modify: `src/pipeline/stageC/claimEvidence.ts:46` (the `quantities()` pattern's prefix and sign whitespace).
- Test: `tests/stageC.numberScanLinearity.test.ts` (new).

**Interfaces:**
- Consumes: `parseNumbers`, `proseNumbers`, `runConsistencyChecks`, `validateClaimNumericSupport`, `runVerifyPass`.
- Produces: no signature change.
- `ParsedNumber.start` now points at the first sign, currency symbol or digit, which is what its docstring already says. Today it can include leading whitespace.
- Consumers to re-test:
  - `findPeriodPhrases` valueSpans (consistency.ts:738-767);
  - the registry direction window (consistency.ts:1619-1621);
  - the period and unit checks in `tests/stageC.verifyChecks.test.ts`.

**Steps:**
- [ ] Step 1: Write the failing test. Use the probe's record `computed:revenueGrowthYoY` (105.8511 percent, period 2026-07-26) and the claim "Revenue growth year over year for the quarter ended 2026-07-26 was 105.9%.", padded with N newlines or N spaces. For N = 2000 and each of spaces and newlines:
  - `parseNumbers(padded).length === parseNumbers(base).length`, and it runs in under 250 ms;
  - `proseNumbers(padded)` runs in under 250 ms;
  - `runConsistencyChecks` on the padded claim gives `checks.unit.checked === 1` in under 250 ms;
  - `validateClaimNumericSupport` on the padded claim gives the unpadded status in under 250 ms;
  - `runVerifyPass` on one padded claim, with a throwing `runPass`, runs in under 1000 ms;
  - `parseNumbers("rose 5%")[0].start === 5` and `parseNumbers("rose  -5%")[0].start === 6`. The start is the sign, not the whitespace.
- [ ] Step 2: Run `npx vitest run --config vitest.config.ts tests/stageC.numberScanLinearity.test.ts`. Expected: FAIL. The timing cases take about 1.6 to 3.2 s at HEAD (findings.json SEC-203 measured 1665 ms for parseNumbers and 3243 ms for runVerifyPass). The start case gives 4 for "rose 5%" at HEAD: the match begins at the space, because the optional sign is skipped and the `\s*` takes the space. "rose  -5%" already gives 6 at HEAD and is the control.
- [ ] Step 3: Implement.
  - Each optional token consumes its own trailing whitespace, so that two whitespace loops are never adjacent:
    - NUMBER_PATTERN becomes `(?:([-+−])\s*)?(?:(\$|US\$)\s*)?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?…`, with the scale and unit groups unchanged here;
    - `quantities()` becomes `(?:(?<prefix>US\$|[$€£¥]|(?:CURRENCIES))\s*)?(?:(?<sign>[-+−])\s*)?(?<digits>…)`. The prefix is already `.trim()`med where it is read (claimEvidence.ts:70), so dropping its inner `\s*` changes nothing downstream.
  - Keep the capture-group numbers that `parseNumbers` reads. Use non-capturing wrappers so `match[1]` and onward are unchanged.
  - After the digits, the trailing `\s*(scale)?\s*(unit)?` stays as it is. It can only run from a digit, and it succeeds on its first greedy try, so it never backtracks across a run.
  - In `parseNumbers`, set `start` to `match.index` plus the offset of the first non-space character.
- [ ] Step 4: Run `npx vitest run --config vitest.config.ts tests/stageC.numberScanLinearity.test.ts tests/stageC.verifyChecks.test.ts tests/stageC.factualValidation.test.ts tests/stageC.claimEvidence.d66.test.ts tests/stageC.excerptCurrencyScale.test.ts`. Expected: PASS.
- [ ] Step 5: Benefit check. Replay `t1` against `base`; expect zero changed rows, because no stored string has a whitespace run of 20 or more characters. Write down one before/after timing line for the PR, such as "parseNumbers on 2,000 newlines: 1,665 ms -> under 5 ms".
- [ ] Step 6: Docs. Update the ParsedNumber docstring if the wording changes. Add one sentence to METHODOLOGY.md "Stage A checks and report verification" (consistency paragraph, about line 2685) saying that the scanners are linear in claim length.
- [ ] Step 7: Commit with `git add tests/stageC.numberScanLinearity.test.ts src/pipeline/stageC/consistency.ts src/pipeline/stageC/claimEvidence.ts docs/METHODOLOGY.md` and the message "Scan claim numbers in linear time on whitespace runs (SEC-203)". No stamp: no output changes.

### Task 2: A leading minus before a currency is a negative amount (AI-202)

**Files:**
- Modify: `src/pipeline/stageC/claimEvidence.ts:40-96`: pattern at :46, the SIGN_WORD start adjustment at :67-68, the value sign at :91-94. Export the reader for tests.
- Test: `tests/stageC.claimEvidence.d66.test.ts` (extend: a new `describe("AI-202 leading sign")`).

**Interfaces:**
- Consumes: the net-debt record shape that the d66 test already uses (value -23.22e9, `currency: "USD"`).
- Produces: `export function readProseQuantities(text: string): readonly Quantity[]`, an alias of `quantities` exported for tests. No other caller changes.
  - The prefix group (Task 1's form) becomes `(?:(?:(?<![A-Za-z0-9.])(?<lead>[-+−]))?(?<prefix>US\$|[$€£¥]|(?:CURRENCIES))\s*)?`.
  - The lead sign is read only *directly* before a currency, with no space between, as the app's own formatter writes it ("−$7.35B", format.ts:132-145; "−USD 5.23 billion", forensics.ts:242-249).
  - This keeps the spaced range "$1.0 - $1.2 billion" positive. HEAD reads it positive (review check), and a lookbehind alone would not, because a space precedes its dash.
  - It also adds no whitespace loop after the lead, so Task 1's linearity holds.
  - A value is negative when `lead` or `sign` is `-` or the Unicode minus sign.

**Steps:**
- [ ] Step 1: Write the failing tests. Use the d66 test's own record `computed.current-capital.net-debt-excluding-operating-leases` (label "net debt excluding operating leases", -23.22e9 USD, period and as-of 2026-07-26), and its `check` helper. The claims must name the record's whole label and its date: the record path's metric test is symmetric (namesMetric, claimEvidence.ts:437-444). Review check: "Net debt was -$23.220 billion." is `unchecked / text-context-mismatch` at HEAD for that reason, not for its sign. `L` below is "Net debt excluding operating leases as of 2026-07-26 was".
  - `` `${L} -$23.220 billion.` ``, `` `${L} −$23.220 billion.` `` (Unicode minus), `` `${L} -USD 23.220 billion.` `` and `` `${L} −USD 23.220 billion.` `` each give `"validated"` (HEAD: `"contradicted"`, review check and AI-202 probe).
  - Against a copy of the record with value +23.22e9, the same four claims each give `"contradicted"` (HEAD: `"validated"`).
  - Controls that keep their HEAD result:
    - `` `${L} negative USD 23.220 billion.` `` and `` `${L} USD -23.220 billion.` `` are validated against -23.22e9;
    - `` `${L} USD 23.220 billion.` `` is contradicted against -23.22e9, as the existing d66 test pins.
  - Review Focus 1 checks on `readProseQuantities`. Each passes at HEAD and must still pass (values from the review check at HEAD):
    - `readProseQuantities("Guidance is $1.0-$1.2 billion.")` returns values `[1, 1.2e9]`. Both are positive; the reader does not carry a range's scale word to its first figure.
    - `readProseQuantities("Guidance is $1.0 - $1.2 billion.")` returns `[1, 1.2e9]`, both positive;
    - `readProseQuantities("FY2025-$5 million")` returns `[5e6]`;
    - `readProseQuantities("a 3-$4 range")` returns `[3, 4]`, both positive.
  - Documented, not changed: `readProseQuantities("Guidance is USD 1.0 - 1.2 billion.")` returns `[1, -1.2e9]` at HEAD. The existing after-prefix `sign` group reads a spaced dash as a minus. Changing that would also flip table change cells such as "75.0 % -3.9 pts". It is recorded as a known residual in DECISIONS entry 8 (Task 25) and in the disposition note, where the post-fix audit (verification plan Task V7) is pointed at it (decisions spec 4.3, B2). No assertion pins it, so a later batch can fix it.
- [ ] Step 2: Run `npx vitest run --config vitest.config.ts tests/stageC.claimEvidence.d66.test.ts -t "AI-202"`. Expected: FAIL on the eight leading-sign cases (four contradicted against -23.22e9, four validated against +23.22e9). This matches the AI-202 probe. Controls and reader checks pass.
- [ ] Step 3: Implement the `lead` group. `negative = /^[-−]$/.test(groups.lead ?? groups.sign ?? "")`. The SIGN_WORD start adjustment becomes `!groups.sign && !groups.lead`. Do not touch consistency.ts here: `parseNumbers` already reads a leading sign before "$", its magnitudes are unsigned, and no consistency check compares sign.
- [ ] Step 4: Run Task 1's command plus `tests/stageC.claimEvidence.fraction.test.ts tests/stageC.claimEvidence.isoRange.test.ts tests/stageC.claimEvidence.perShareLabel.test.ts`. Expected: PASS.
- [ ] Step 5: Benefit check. Replay `t2`: expect no change on #43 to #50. Their stored claims spell negatives as "negative USD" or "USD -", so on these runs this is a latent-defect fix, and the test is the proof. Older stored reports #34 (claude-sonnet-5, "-$27.27B") and #37 (claude-haiku-4-5, "-$13.95B") did use the spelling (AI-105, merged into AI-202). They have no run-input snapshot, so they are named in the disposition note, not replayed. Record the eight synthetic flips in the replay table.
- [ ] Step 6: Docs. In METHODOLOGY.md, in the excerpt-numbers and claim-check paragraphs (about lines 2651-2683), add: "A minus written directly before the currency (-$5 billion, −USD 5 billion) negates the amount; a dash that follows a letter, digit or point ('$1.0-$1.2 billion', 'FY2025-$5 million'), or one followed by a space ('$1.0 - $1.2 billion'), is not read as that sign." Do not write that every dash between two amounts is a range: the "USD 1.0 - 1.2 billion" residual above would make that false.
- [ ] Step 7: Commit with `git add src/pipeline/stageC/claimEvidence.ts tests/stageC.claimEvidence.d66.test.ts docs/METHODOLOGY.md` and the message "Read a minus written before the currency as a negative amount (AI-202)".

### Task 3: Scale, unit and currency-code tokens are whole words in the prose reader (AI-304, AI-304-V1, AI-304-V3)

**Files:**
- Modify `src/pipeline/stageC/claimEvidence.ts`:
  - :36, add a `DURATION_MONTHS` mask beside `WINDOW_LABEL` and apply it at :41;
  - :46, the prefix, scale and unit groups;
  - :72-73, the unit map accepts `percentage[\s-]points?`.
- Test: `tests/stageC.claimEvidence.tokens.test.ts` (new).

**Interfaces:**
- Consumes: `validateClaimNumericSupport`, and `readProseQuantities` (from Task 2).
- Produces: no signature change. The pattern's tokens become whole words. Each lookahead sits *inside* its optional group, so a failed token falls back to the reading without it, and the match never has to backtrack across the preceding `\s*`:
  - Prefix code: `US\$|[$€£¥]|(?<![A-Za-z])(?:CURRENCIES)(?![A-Za-z])` inside Task 2's prefix group. "fraud 1,234" no longer reads AUD, and "oils 1,234" no longer reads ILS.
  - Scale: `\s*(?:(?<scale>thousands?|millions?|billions?|trillions?|bn|mm|k|m|b)(?![A-Za-z]))?`. The "M" of "Marketable" and the "b" of "basis" are no longer scales.
  - Unit: `\s*(?:(?<unit>%|(?:percentage[\s-]points?|percent|bps?|basis points?|pps?|dollars?|shares?|days?|people|users|subscribers|count|times|x|per share|score)(?![A-Za-z]|-[A-Za-z])))?`. "%" stays unbounded. A hyphen before a digit ("1.2x-1.5x") is still allowed, but a hyphenated compound ("Share-based", "percent-of") is not a unit.
  - `DURATION_MONTHS = /\b\d{1,2}\s+months?\b/gi` is masked to spaces, so "12 months" and "6 months ended" stay out of the quantity list. HEAD already dropped them by accident (the "m" was read as a scale and the figure then discarded). The hyphenated "12-month" is already masked (consistency.ts:277).

**Steps:**
- [ ] Step 1: Write the failing tests. The helpers mirror the probes:
  - `onRecord(text)` checks a claim against the 0.08 percentage-point record "gross margin actual versus prior guidance midpoint";
  - `onExcerpt(text, excerptText)` checks a claim against excerpt source `x:t`, as-of 2026-08-26, title "10-Q".

  Defects, each failing at HEAD:
  - AI-304 cash row: `onExcerpt("Cash and cash equivalents as of 2026-07-26 were USD 22.44 billion.", "Jul 26, 2026 Jan 25, 2026 (In millions) Cash and cash equivalents $ 22,443 $ 10,605 Marketable debt securities 34,143 39,065").status === "validated"`.
  - AI-304 basis points: on the record, "…was 8 basis points." and "…was 8 bps." are `validated`, and "…was 80 basis points." is `contradicted`.
  - AI-304-V1 percentage-point: on the record, "…was a 0.08 percentage-point beat." is `validated` and "…was a 0.80 percentage-point beat." is `contradicted`.
  - AI-304-V1 two rows: claim `"Total liabilities as of 2026-01-25 were USD 22.75 billion."` against `` `Jul 26, 2026 Jan 25, 2026 (In millions) Total liabilities $ 32,274 $ 22,750 Shareholders' equity 70,013 79,327` `` gives `validated`.
  - AI-304-V1 balance sheet: the same text plus `" Total liabilities and shareholders' equity $ 102,287 $ 102,077"` gives a status that is not `contradicted`.
  - AI-304-V1 "Percentages": "Total revenue as of 2026-01-25 was USD 25.11 billion." against `"Jul 26, 2026 Jan 25, 2026 (In millions) Total revenue $ 26,063 $ 25,111 Percentages of revenue 100 100"` gives the same status as the same text with "Percentages" replaced by "Ratios".
  - AI-304-V3, under `HDR = "Jul 26, 2026 Jan 25, 2026 ($ in millions)"`:
    - "Accrued liabilities for fraud as of 2026-07-26 were USD 1.23 billion." against `${HDR} Accrued liabilities for fraud 1,234 1,100 Other accrued liabilities 900 800` gives `validated`;
    - "Inventories of crude oils as of 2026-07-26 were USD 1.23 billion." against `${HDR} Inventories of crude oils 1,234 1,100 Other inventories 900 800` gives `validated`.

  Controls, which pass at HEAD and must keep passing:
  - the "Other debt securities" table;
  - "0.08 percentage points" on the record;
  - the "Stockholders'" two-row and sheet variants;
  - "Accrued fraud liabilities";
  - "crude oil";
  - "crude oilx".

  Token readings on `readProseQuantities`:
  - `"$5M"` is `5e6` currency;
  - `"$5B"` is `5e9`;
  - `"5 bn"` is `5e9`;
  - `"5%"` and `"5 percent"` are percent;
  - `"5 shares"` is shares;
  - `"1.2x-1.5x"` is two ratios;
  - `"10 days"` is days;
  - `"EUR5bn"` is `5e9` EUR;
  - `"AUD 5 million"` is `5e6` AUD;
  - `"1,234 Share-based compensation"` has `unit === null`.

  Review Focus 2 guards, which pass at HEAD and must still pass:
  - `readProseQuantities("Revenue for the trailing 12 months was $165.2 billion.")` has length 1;
  - `readProseQuantities("Revenue for the 6 months ended June 30, 2026 was $5.0 billion.")` has length 1.

  The documented new reading: `readProseQuantities("Revenue grew 12% across 5 key products.")` has length 2, with values 12 percent and 5 unitless. HEAD dropped the 5 only because it read "k" as a scale; "5 products" already gives two quantities at HEAD (review check at HEAD: `[12%]` and `[12%, 5]`, and "1,234 Share-based" reads unit "Share").
- [ ] Step 2: Run `npx vitest run --config vitest.config.ts tests/stageC.claimEvidence.tokens.test.ts`. Expected: FAIL on the eight defect cases, and on "1,234 Share-based" (unit "shares" at HEAD) and "5 key products" (length 1 at HEAD). Controls and guards pass.
- [ ] Step 3: Implement the three bounded groups, the unit-map spelling and `DURATION_MONTHS`. No other change.
- [ ] Step 4: Run `npx vitest run --config vitest.config.ts tests/stageC.claimEvidence.tokens.test.ts tests/stageC.claimEvidence.d66.test.ts tests/stageC.excerptCurrencyScale.test.ts tests/stageC.factualValidation.test.ts tests/stageC.excerptNumbers.test.ts tests/stageC.claimEvidence.perShareLabel.test.ts tests/stageC.claimEvidence.fraction.test.ts`. Expected: PASS.
- [ ] Step 5: Benefit check. Replay `t3` against `t2`.
  - Expect at most a few moves. AI-304 found no stored #48 or #50 claim that states NVDA's cash from these tables, and no stored FACT in bps. Any row that moves from contradicted to validated or unchecked must cite the 10-Q item2 or 10-K item7 liquidity tables, and no row may move toward validated without such a table cell in its span. The four MU #46 "Percentages …" cells that AI-304-V1 found come back as figures. MU's year-only headers do not bind columns, so those cells should move no status.
  - A row that flips because a new unitless count ("10 markets") now splits a source label is acceptable only if the new status is unchecked. List it in the replay table.
- [ ] Step 6: Docs. METHODOLOGY.md, excerpt-numbers paragraph: "Scale words, units and currency codes are read only as whole words (the M of 'Marketable' is not millions, the AUD in 'fraud' is not a currency); 'N months' is a period phrase, not a quantity." Update the claimEvidence.ts comment at :42-44 if it names the tokens.
- [ ] Step 7: Commit with `git add tests/stageC.claimEvidence.tokens.test.ts src/pipeline/stageC/claimEvidence.ts docs/METHODOLOGY.md` and the message "Read scale, unit and currency tokens as whole words (AI-304, AI-304-V1, AI-304-V3)".

### Task 4: The unit check reads whole-word tokens and a currency code before the figure (AI-304-V2)

**Files:**
- Modify `src/pipeline/stageC/consistency.ts`:
  - :199-210, ParsedNumber gains `hadCurrencyCode: boolean`;
  - :214-219, NUMBER_PATTERN's scale and unit groups get the Task 3 boundaries, and `percentage points?` becomes `percentage[\s-]points?`;
  - :221-244, parseNumbers sets `hadCurrencyCode` when the text before the figure's `start` ends with a whole-word code: `new RegExp(String.raw`(?<![A-Za-z])(?:${CURRENCY_CODES})\s?$`)` tested on `sentence.slice(Math.max(0, start - 8), start)`;
  - :493-505, unitFamilyOf.
- Test: `tests/stageC.verifyChecks.test.ts` (extend the unit-check `describe`, near line 370).

**Interfaces:**
- Consumes: `runConsistencyChecks`, `parseNumbers`.
- Produces: `unitFamilyOf` returns `"money"` first when `hadCurrencyPrefix || hadCurrencyCode`, and only then reads the unit token. Rationale: a figure with a currency in front is an amount of money, whatever noun follows it ("$99 billion share repurchase", "$45.32 share price").
- `ParsedNumber.hadCurrencyCode` is internal. The interface is not exported, so no other consumer changes.

**Steps:**
- [ ] Step 1: Write the failing tests. Use the probe's money record `payload.issuer-filings.share-repurchase-authorization-remaining` (99e9 USD, period 2026-07-26). `unitFindings(text)` returns the `check === "unit"` findings of `runConsistencyChecks`.
  - These three each give `[]`:
    - "NVIDIA had USD 99.00 billion share repurchase authorization remaining as of 2026-07-26.";
    - "NVIDIA had a $99.00 billion share repurchase authorization remaining as of 2026-07-26.";
    - "NVIDIA had USD 99.00 billion shareholder-return authorization remaining as of 2026-07-26.".
  - Per-share price record `fmp:quote` (45.32, currency-per-share): "The current $45.32 share price sits below the DCF value as of 2026-07-09." gives `[]`.
  - Controls, which give `[]` at HEAD: "…USD 99.00 billion of share repurchase authorization…" and "The share price was $45.32 as of 2026-07-09.".
  - Share-count record (label "diluted shares", 15.2e9 shares, period 2026-07-26):
    - "Diluted shares were 15.2 billion shares as of 2026-07-26." gives `[]` (control);
    - "Diluted shares were $15.2 billion as of 2026-07-26." gives one finding with reason `unit-word-mismatch` (control: HEAD already gives it);
    - "Diluted shares were $15.2 billion shares as of 2026-07-26." gives one `unit-word-mismatch` finding. This is stricter than HEAD, which gives `[]` because it read "shares" (review check), and it is documented: a currency in front is never a share count. Use the record's value. "$15 million shares" is not located against a 15.2e9 record (locateRecord, consistency.ts:426), so it gives `[]` before and after and would prove nothing.
- [ ] Step 2: Run `npx vitest run --config vitest.config.ts tests/stageC.verifyChecks.test.ts -t "unit"`. Expected: FAIL. The four defect cases each give one `unit-word-mismatch` finding at HEAD, and the "$15.2 billion shares" case gives `[]`.
- [ ] Step 3: Implement the boundaries, `hadCurrencyCode` and the new order in `unitFamilyOf`. The CODE_BEFORE_NUMBER regex at :379 is the model for the bounded code test.
- [ ] Step 4: Run `npx vitest run --config vitest.config.ts tests/stageC.verifyChecks.test.ts tests/stageC.numberScanLinearity.test.ts tests/stageC.factualValidation.test.ts`. Expected: PASS.
- [ ] Step 5: Benefit check. Replay `t4`. Expect unit-check rows only to move from fail to pass, for money figures followed by a share-noun. Any pass-to-fail row must be a currency-prefixed share count. List each in the table.
- [ ] Step 6: Docs. METHODOLOGY.md, consistency paragraph (about lines 2685-2691): "A figure written with a currency symbol or code is an amount of money, whatever noun follows it."
- [ ] Step 7: Commit with `git add tests/stageC.verifyChecks.test.ts src/pipeline/stageC/consistency.ts docs/METHODOLOGY.md` and the message "Read a currency-prefixed figure as money in the unit check (AI-304-V2)".

### Task 5: A table's scale declaration applies to amounts only (AI-403; covers AI-203)

**Files:**
- Modify `src/pipeline/stageC/claimEvidence.ts`:
  - TableColumn at :486 gains `exceptPerShare: boolean`;
  - :559-567, `exceptPerShare = declarations.some((m) => /except\s+per[\s-]+share/i.test(m[0]))`;
  - :604-622, the cell binding carries `column: { scale, aliases, exceptPerShare, label: column.label }` (the TableColumn's own row label, without the header window that :611 appends), and `SourceBinding.column` at :122 gains the two fields. A decimal per-share cell (the rule below) gets `unit: "currency-per-share"`;
  - :790-797 (distinct key) and :808-813 (scaling) use one helper;
  - the excerpt path reads the claim's per-share basis from its words, as the record path does at :720.
- Modify `src/pipeline/stageC/excerptNumbers.ts:35-36`, the stale docstring. The `tableScale` except-per-share rule at :111-121 and :155-166 is the existing model; do not change it.
- Test: `tests/stageC.excerptCurrencyScale.test.ts` (extend: `describe("AI-403 table scale applies to amounts only")`).

**Interfaces:**
- Consumes: the committed fixture `fixtures/edgar/nvda-periodic-sections/nvda-10q-q2fy27-notes.txt`, Note 3.
- Produces: `function tableScaleFor(quantity: Quantity, column: { scale: number | null; exceptPerShare: boolean; label: string } | undefined): number`. It replaces `bound.column?.scale ?? 1` at claimEvidence.ts:810, after the conflicting-declaration return at :805, so it never sees a `null` scale it must pass through. It returns 1 in four cases:
  - when `quantity.scaled`;
  - when `quantity.unit` is not one of `"currency"`, `"shares"` or `null`;
  - when the cell is a *per-share cell*: `column.exceptPerShare` is set, `quantity.step < 1` (a decimal), and either the declared scale is thousands or millions (`column.scale` is 1e3 or 1e6) or the row's own lead names a per-share basis. The test is `/\bper[\s-]+share\b|\beps\b/i` on `column.label` with every `TABLE_SCALE` match blanked first. The first row's lead contains the declaration itself ("($ in billions, except per share data) Revenue"), and without the blanking every first row would read as per-share. Put the blanking in one helper, `rowLead(label)`, which Task 9 reuses;
  - when there is no column.

  Otherwise it returns `column.scale ?? 1`. The `scale === null` early return at :805 is unchanged and still runs first. Why the billions split: under "($ in billions, except per share data)", a decimal is often an amount ("Revenue $ 216.0"; NVDA's "($ in billions)" outlook table prints "$ 9.2"). There only a row that names its per-share basis is read as per-share, and every other decimal keeps HEAD's scaling. Under thousands or millions, statement amounts are whole numbers, so a decimal is the per-share line, which is D-45's own rule (excerptNumbers.ts:150-166).
- A per-share cell also gets `unit: "currency-per-share"` (the cell was `currency` from its "$" or the "$" in the declaration, claimEvidence.ts:619).
- `perShareInWords(quantity, label)` is the record path's existing test moved into a helper unchanged: `quantity.unit === "currency" && /\bper\s+share\b/i.test(label)` (claimEvidence.ts:722). The record-side unit condition stays at the call site. Do not widen it to "EPS" or "per-share" here: that would change the record path (D-109) outside this finding. "EPS" not read as a per-share basis is a known residual on both paths, recorded in DECISIONS entry 8 (Task 25) for the post-fix audit (verification plan Task V7; decisions spec 4.3, B2).

**Steps:**
- [ ] Step 1: Write the failing tests. The new `synthetic(sourceText, claim, title)` helper builds a payload with one filing `edgar:10-K item7`, as-of 2026-01-25, registered in `citationRegistry` with kind `payload-text`. It then runs `runVerifyPass` with a throwing `runPass` on `{ commentary: [claim] }`. Model it on `payload()` and `verify()` in tests/stageC.factualValidation.test.ts:12-22. `TAX(decl)` is `` `Year Ended Jan 25, 2026 Jan 26, 2025 ${decl}Income before income tax 140,000 85,000 Effective tax rate 15.1 % 13.3 % Other matters follow.` ``.
  - For each `decl` in `["(In millions) ", "($ in millions) ", "($ in millions, except per share data) "]`, "Effective tax rate as of 2026-01-25 was 15.1%." gives `validationStatus === "validated"`. At HEAD it is `contradicted`, because 15.1 % is read as 15,100,000 %.
  - The NVDA summary rows, under the real title "10-K Item 7 — MD&A (… reporting period ended 2026-01-25 (FY2026); filed 2026-02-25)": "Gross margin for FY2026 was 71.1%." against `"Fiscal Year 2026 Summary Year Ended Jan 25, 2026 Jan 26, 2025 Change ($ in millions, except per share data) Revenue $ 215,938 $ 130,497 Up 65% Gross margin 71.1 % 75.0 % -3.9 pts Operating expenses $ 23,076 $ 16,405 Up 41% Other matters follow."` is not `contradicted`. This text is a short quotation of NVIDIA's FY2026 10-K MD&A table.
  - Note 3, built from the committed fixture: take the substring from "Note 3 - Net Income Per Share" through "(2) Net income divided by diluted weighted average shares." as an `edgar:10-Q notes` excerpt, title "10-Q notes", as-of 2026-07-26. HEAD results are from the review check:
    - "Net income for the three months ended July 26, 2026 was USD 59,688 million." is `validated` (control: an integer money cell is still scaled; HEAD validated);
    - "Basic net income per share for the three months ended July 26, 2026 was USD 2.47." is `validated` (HEAD: contradicted, bound "Net income per share: Basic (1) $ 2.47");
    - "Basic net income per share for the three months ended July 26, 2026 was USD 2.47 million." is not `validated` (HEAD: validated);
    - "Diluted net income per share for the three months ended July 26, 2026 was USD 2.46." is not `contradicted`. This is a control, `unchecked / text-context-mismatch` at HEAD and after. The Diluted row's lead is "Diluted (2)", so the claim's "net income per share" words bind no cell. That is a recall residual recorded in the disposition note, not part of AI-203;
    - "Basic weighted average shares for the three months ended July 26, 2026 were 24,190 million shares." is not `contradicted`. This is a control, `unchecked / text-ambiguous` at HEAD and after: a unitless cell under a declaration with no "$" has no established unit (claimEvidence.ts:822).
  - Billions declaration (synthetic). The table is `"Year Ended Jan 25, 2026 Jan 26, 2025 ($ in billions, except per share data) Revenue $ 216.0 $ 130.5 Diluted EPS $ 4.90 $ 2.94 Other matters follow."`.
    - "Revenue as of 2026-01-25 was USD 216.0 billion." is `validated`. This is a control: HEAD scales the decimal amount, and so does the fix, because the Revenue row names no per-share basis.
    - "Diluted EPS as of 2026-01-25 was USD 4.90 billion." is not `validated`. HEAD validates it, because it scales 4.90 to billions.
    - "Diluted EPS as of 2026-01-25 was USD 4.90." is not `contradicted`. HEAD contradicts it (4.9e9 against 4.90). After the fix it is unchecked (unit-mismatch), because "EPS" alone is not read as per-share on the claim side.
  - Controls, which pass at HEAD:
    - `TAX("")` with the tax-rate claim is `validated`;
    - `TAX("($ in millions) ")` with "Income before income tax as of 2026-01-25 was USD 140.0 billion." is `validated`;
    - "Gross margin as of 2025-01-26 was 75,000,000%." is not `validated`.
- [ ] Step 2: Run `npx vitest run --config vitest.config.ts tests/stageC.excerptCurrencyScale.test.ts -t "AI-403"`. Expected: FAIL on the following, and pass on the Diluted, share-count, Revenue-in-billions and other controls:
  - the three tax declarations and the NVDA gross-margin claim (contradicted at HEAD);
  - the Basic per-share claim (contradicted at HEAD);
  - the "USD 2.47 million" claim (validated at HEAD);
  - "Diluted EPS … USD 4.90 billion" (validated at HEAD);
  - "Diluted EPS … USD 4.90." (contradicted at HEAD).
- [ ] Step 3: Implement `tableScaleFor`, `exceptPerShare` and the per-share cell rule. The excerpt path also needs the record path's per-share-in-words reading. When the claim quantity is `currency`, the bound cell is `currency-per-share` and `perShareInWords(quantity, own.label)` holds, compare the claim as `currency-per-share` before the unit test at :823. `perShareInWords` is the record path's existing expression from :722, moved into one shared helper and called from both paths; it is not widened.
- [ ] Step 4: Run `npx vitest run --config vitest.config.ts tests/stageC.excerptCurrencyScale.test.ts tests/stageC.claimEvidence.d66.test.ts tests/stageC.excerptNumbers.test.ts tests/stageC.claimEvidence.perShareLabel.test.ts tests/stageC.factualValidation.test.ts`. Expected: PASS. The D-66 "Interest income 496" and D-63 liquidity-table tests must be unchanged.
- [ ] Step 5: Benefit check. Replay `t5`.
  - Expect any stored claim or key number on #50's 10-K item7 summary table (gross margin 75.0 / 71.1) to move from contradicted to validated or unchecked. AI-403 found no stored report with a contradicted percent entry, so this is mostly the synthetic proof.
  - The AI-203 reach checks found the stored #48 and #50 per-share tables bind no dated column ({validated:0, unchecked:1, contradicted:0}), so expect no per-share row to move.
  - Expect no row to move to contradicted.
- [ ] Step 6: Docs.
  - METHODOLOGY.md, the D-45 excerpt-numbers paragraph: "A table's '(In millions)' scales its amounts and share counts only; a percent, ratio or day count is never scaled. Under '(In thousands|millions, except per share data)' a decimal amount is a per-share figure; under '(In billions, except per share data)' only a decimal in a row that names a per-share basis (per share, EPS) is."
  - In the same paragraph, fix the stale period sentence at about lines 2678-2683. Since D-66 the second gate compares the claim's period with the column; the text must say so.
  - Fix the excerptNumbers.ts:35-36 docstring ("What it does not check: the period") to say that gate 2 checks it.
- [ ] Step 7: Commit with `git add tests/stageC.excerptCurrencyScale.test.ts src/pipeline/stageC/claimEvidence.ts src/pipeline/stageC/excerptNumbers.ts docs/METHODOLOGY.md` and the message "Apply a table's scale to amounts only, never to percents or per-share cells (AI-403, AI-203)".

### Task 6: A hedge, or "an increase of", keeps a change a change (AI-401; covers AI-401-V2)

**Files:**
- Modify `src/pipeline/stageC/consistency.ts`:
  - :618-622, `QuantityDirection.relation: "change" | "level" | "unknown"`;
  - :625-644, `quantityDirection`.
- Modify `src/pipeline/stageC/claimEvidence.ts:709-715`. This is only a type check: the record path already requires `relation === "change"`.
- Test: `tests/stageC.factualValidation.test.ts` (extend the direction pairs near lines 215-247).

**Interfaces:**
- Consumes: `quantityDirection(sentence, start, end, quantities)`, which is exported and used only by claimEvidence.ts (`grep -rn quantityDirection src` must show no other caller before you start).
- Produces: the same signature with a widened `relation`.
  - The hedge phrases are removed from `between` before the DELTA_BREAKERS test. They are about, around, approximately, approx., roughly, nearly, almost, some, close to, more than, less than, fewer than, at least, at most, just over, just under and in excess of.
  - A preposed noun from {increase(s), decrease(s), decline(s), drop(s), rise(s), fall(s), expansion, contraction} is `"change"` when the hedge-stripped `between` is exactly "of" (`/^\s*of\s*$/i`). So "an increase of about $X" is a change too. All of these nouns are already DIRECTION_WORDS (consistency.ts:554-568).
  - "gain(s) of" is `"unknown"`, because an accounting gain is a level. "gain" and "gains" are DIRECTION_WORDS at +1, and HEAD reads "a gain of $X" as `level` through the "of" breaker.
  - Hedges are stripped only from `between`. The negation test still reads the unstripped text.
  - DELTA_BREAKERS (:576) and the registry direction check (:1610-1640) are not changed.

**Steps:**
- [ ] Step 1: Write the failing tests. `dirOf(s, figure)` calls `quantityDirection` on the figure's span.
  - Mechanism (each fails at HEAD):
    - `dirOf("had an increase of $66.1 billion", "$66.1 billion").relation === "change"`;
    - `dirOf("increased by about $27.5 billion", "$27.5 billion").relation === "change"`;
    - `dirOf("revenue grew around 12%", "12%").relation === "change"`;
    - `dirOf("had an increase of about $66.1 billion", "$66.1 billion").relation === "change"`;
    - `dirOf("recorded a gain of $1.2 billion", "$1.2 billion").relation === "unknown"` (HEAD: `"level"`).
  - Mechanism control (passes at HEAD, because "approximately" is not a breaker):
    - `dirOf("increased by approximately $27.5 billion", "$27.5 billion").relation === "change"`.
  - Mechanism controls (pass at HEAD):
    - `dirOf("increased to $27.5 billion", …).relation === "level"`;
    - `dirOf("increased to about $27.5 billion", …).relation === "level"`;
    - `dirOf("Revenue was 31% lower.", "31%").relation === "change"`.
  - `verify(source, claim)` pairs (fail at HEAD):
    - source "Operating income had an increase of USD 27.5 billion." with claim "Operating income increased to USD 27.5 billion." is not `validated`;
    - source "Capital expenditures increased by about USD 27.5 billion." with claim "…increased to USD 27.5 billion." is not `validated`;
    - source "Capital expenditures increased to about USD 27.5 billion." with claim "…increased by about USD 27.5 billion." is not `validated`;
    - source "Capital expenditures increased more than USD 27.5 billion." with claim "…increased to more than USD 27.5 billion." is not `validated`;
    - the transcript source "Data center revenue grew around 12% sequentially." (`fmp:earning-call-transcript`) with claim "…grew to 12% sequentially." is not `validated`.
  - AMZN-shaped pair, from the public EX-99.1 sentence "Free cash flow decreased to an outflow of $7.6 billion for the trailing twelve months, driven primarily by a year-over-year increase of $66.1 billion in purchases of property and equipment, net of proceeds from sales and incentives.":
    - claim "Purchases of property and equipment, net of proceeds from sales and incentives, increased to USD 66.1 billion for the trailing twelve months." is not `validated`;
    - claim "Free cash flow had a decrease of USD 7.6 billion for the trailing twelve months." is not `validated`.
  - Controls (pass at HEAD):
    - "Free cash flow decreased to an outflow of USD 7.6 billion for the trailing twelve months." on the AMZN sentence is `validated`;
    - "increased by" vs "increased to" is not `validated`;
    - the same hedged wording on both sides is `validated`.
- [ ] Step 2: Run `npx vitest run --config vitest.config.ts tests/stageC.factualValidation.test.ts -t "relation"`. Expected: FAIL on the mechanism and pair cases. HEAD reads "of", "about", "around" and "than" as level breakers.
- [ ] Step 3: Implement the hedge strip, the "change noun + of" rule and the `"unknown"` relation. The excerpt path at :820 already marks differing relations unchecked. Equal `"unknown"` relations on both sides compare like any other pair.
- [ ] Step 4: Run `npx vitest run --config vitest.config.ts tests/stageC.factualValidation.test.ts tests/stageC.verifyChecks.test.ts tests/stageC.claimEvidence.d66.test.ts`. Expected: PASS, with every existing direction pair at 215-247 unchanged.
- [ ] Step 5: Benefit check. Replay `t6`. Expect no row to move toward validated. Rows moving from validated to unchecked must have "of", or a hedge, next to a direction word in their bound span. List them.
- [ ] Step 6: Docs. METHODOLOGY.md, excerpt-numbers paragraph: "'increased to (about) X' is a level and 'increased by (about) X' or 'an increase of X' a change; a hedge word does not change which; 'a gain of X' is read as neither."
- [ ] Step 7: Commit with `git add tests/stageC.factualValidation.test.ts src/pipeline/stageC/consistency.ts src/pipeline/stageC/claimEvidence.ts docs/METHODOLOGY.md` and the message "Keep a hedged or 'an increase of' change a change (AI-401, AI-401-V2)".

### Task 7: A direction word after an apposition comma does not make a level a change (AI-401-V1)

**Files:**
- Modify: `src/pipeline/stageC/consistency.ts:625-644` (`quantityDirection`, the postposed-hit filter).
- Test: `tests/stageC.factualValidation.test.ts` (extend), using the committed fixture `fixtures/edgar/nvda-current-reports/q2fy27-ex99-2.txt`.

**Interfaces:**
- Consumes: `quantityDirection`.
- Produces: no signature change. A direction hit *after* the figure is dropped when the gap between the figure's end and the hit's start contains `[,;:—–(]`. For example, in "16.5%, an increase from a year ago" the figure is a level with an apposition. A preposed hit is unaffected. D-63's `levelBeforeComparison` (claimEvidence.ts:638) stays as defence in depth.

**Steps:**
- [ ] Step 1: Write the failing tests. `TAX` is the fixture sentence "GAAP effective tax rate for the second quarter was 16.5%, an increase from a year ago, primarily due to higher revenue.", read from the fixture with `readFileSync` and asserted present. The fixture holds it exactly once; the next sentence is the non-GAAP 16.0% one.
  - `dirOf(TAX, "16.5%")` is `null` (at HEAD it is a change).
  - With TAX as an `edgar:8-K EX-99.2` excerpt, as-of 2026-07-26:
    - "GAAP effective tax rate for the second quarter increased by 16.5% from a year ago." is not `validated`;
    - "GAAP effective tax rate for the second quarter rose 16.5% from a year ago." is not `validated`;
    - "GAAP effective tax rate for the second quarter was 16.5%." is `validated`. This is the benefit: at HEAD the level claim is unchecked, because the source was read as a change.
  - Synthetic pairs, each not `validated` (both `validated` at HEAD, review check):
    - "Inventory was USD 31.6 billion, up sequentially from USD 25.8 billion." with "Inventory increased by USD 31.6 billion.";
    - "Inventory was USD 31.6 billion, down slightly from USD 35.0 billion." with "Inventory decreased by USD 31.6 billion.".
  - Controls, unchanged:
    - "Gross margin was 72.4%, a decrease from 75.1% a year ago." with "Gross margin decreased by 72.4%." is not `validated`. It is `unchecked / text-ambiguous` at HEAD (review check; the AI-401-V1 refutation attempt), because the second figure makes the clause a list.
    - "Revenue was 31% lower." is a change;
    - D-63 ", up from": "Inventory was USD 31.6 billion, up from USD 25.8 billion." does not validate "Inventory increased by USD 31.6 billion.", and does validate "Inventory was USD 31.6 billion.";
    - "Revenue was USD 46.7 billion, up 56% from a year ago." does not validate "Revenue increased by USD 46.7 billion.".
- [ ] Step 2: Run `npx vitest run --config vitest.config.ts tests/stageC.factualValidation.test.ts -t "apposition"`. Expected: FAIL on the mechanism, the two change claims, the level claim and the two synthetic Inventory pairs. Review check at HEAD on the fixture sentence: "…was 16.5%." is `unchecked / text-context-mismatch`, and "…increased by 16.5% from a year ago." is `validated`. The 72.4% control passes.
- [ ] Step 3: Implement the gap filter in the `hits` filter of `quantityDirection`.
- [ ] Step 4: Run Task 6's command. Expected: PASS.
- [ ] Step 5: Benefit check. Replay `t7`. Expect level claims on apposition sentences to move from unchecked to validated, and change claims on them to move from validated to unchecked. Look for the #50 tax-rate sentence in particular.
- [ ] Step 6: Docs. METHODOLOGY.md, the same paragraph as Task 6: "A direction word after the figure and across a comma, dash or parenthesis describes a comparison, not the figure."
- [ ] Step 7: Commit with `git add tests/stageC.factualValidation.test.ts src/pipeline/stageC/consistency.ts docs/METHODOLOGY.md` and the message "Read a figure before an apposition comma as a level (AI-401-V1)".

### Task 8: A bound is not a value (AI-409)

**Files:**
- Modify `src/pipeline/stageC/claimEvidence.ts`:
  - the `Quantity` type gains `bound: "upper" | "lower" | null`;
  - in `quantities()` at :40-96, read the comparator immediately before `start`, after the sign word;
  - the excerpt path, after the unit and currency checks and before the value check at :830.
- Test: `tests/stageC.claimEvidence.bounds.test.ts` (new).

**Interfaces:**
- Consumes: the committed fixtures `q2fy27-ex99-2.txt` ("…were less than 1% of Data Center revenue.") and `nvda-10k-fy2026-item1.txt` ("We have invested over $76.7 billion in research and development since our inception").
- Produces: `Quantity.bound`. It is read from the text before the figure, with only whitespace or a currency prefix between:
  - `upper`: `(?:less|fewer)\s+than|no\s+more\s+than|under|below|up\s+to|at\s+most|a\s+maximum\s+of|not\s+to\s+exceed`;
  - `lower`: `more\s+than|over|above|at\s+least|in\s+excess\s+of|exceed(?:s|ed|ing)?|a\s+minimum\s+of`.

  Test "no more than" before "more than". On the excerpt path, `bound` differing between claim and source gives `support("unchecked", "text-context-mismatch", "the source states only a bound, or the prose states a bound the source does not")`. The record path is not changed (see Risks).

**Steps:**
- [ ] Step 1: Write the failing tests.
  - On the Hopper sentence (excerpt `edgar:8-K EX-99.2`, as-of 2026-07-26):
    - "Shipments of Data Center Hopper products to China during the quarter were 1% of Data Center revenue." is not `validated` (HEAD: validated);
    - "…were less than 1% of Data Center revenue." is `validated`;
    - "…were more than 1% of Data Center revenue." is not `validated`.
  - On the R&D sentence (excerpt `edgar:10-K item1`, as-of 2026-01-25, `ignoreWords` ["NVIDIA"]):
    - "NVIDIA has invested USD 76.7 billion in research and development since its inception." is not `validated` (HEAD: validated);
    - "NVIDIA has invested over USD 76.7 billion in research and development since its inception." is `validated` (HEAD: validated; control);
    - "…more than USD 76.7 billion…" is not `validated`, at HEAD and after: `unchecked / text-context-mismatch` (review check). The bound kinds agree (both lower), but D-63's word test still needs the claim's "more" and "than" in the source clause, and the source says "over". The bound rule does not relax word matching.
  - Synthetic excerpts where the exact-figure claim is not `validated` (each `validated` at HEAD, review check):
    - "The program has more than USD 25 billion of commitments." with "The program has USD 25 billion of commitments.";
    - "Liquidity was at least USD 40 billion." with "Liquidity was USD 40 billion.";
    - "Churn was at most 5%." with "Churn was 5%.".
  - Synthetic control: "Severance costs will be no more than $110 million." with "Severance costs will be $110 million." is not `validated`. It is already `unchecked / text-context-mismatch` at HEAD, because "no" is a D-63 definition modifier (claimEvidence.ts:465-467) that the claim lacks, so it cannot fail first.

    The same-comparator claims are each `validated`, before and after, including "Severance costs will be no more than $110 million.". "up to $110 million" is not used as an excerpt case: "up" is a direction word (consistency.ts:560), so HEAD already leaves the exact claim unchecked for its direction, and the case would not fail first. It appears only in the reader checks.
  - Reader checks:
    - `readProseQuantities("up to $110 million")[0].bound === "upper"`;
    - `readProseQuantities("over $76.7 billion")[0].bound === "lower"`;
    - `readProseQuantities("no more than 5%")[0].bound === "upper"`;
    - `readProseQuantities("$5 billion")[0].bound === null`;
    - `readProseQuantities("increased over the quarter by 5%")[0].bound === null`, because "over" is not directly before the figure.
- [ ] Step 2: Run `npx vitest run --config vitest.config.ts tests/stageC.claimEvidence.bounds.test.ts`. Expected: FAIL on the reader checks (no `bound` field) and on five exact-figure cases (Hopper, R&D, more-than, at-least, at-most). The "no more than", "more than vs over", same-comparator and point controls pass.
- [ ] Step 3: Implement `bound` and the excerpt-path comparison. Add `bound` to the distinct key at :791 so that two source cells differing only by comparator stay ambiguous.
- [ ] Step 4: Run `npx vitest run --config vitest.config.ts tests/stageC.claimEvidence.bounds.test.ts tests/stageC.factualValidation.test.ts tests/stageC.claimEvidence.d66.test.ts tests/stageC.excerptCurrencyScale.test.ts tests/stageC.claimEvidence.tokens.test.ts`. Expected: PASS.
- [ ] Step 5: Benefit check. Replay `t8`. Any #50 claim or key number bound to "less than 1%" or "over $76.7 billion" moves from validated to unchecked. AI-409's scan found none stored, so zero moves is also an acceptable result. No row may move toward validated.
- [ ] Step 6: Docs. METHODOLOGY.md, excerpt-numbers paragraph: "A figure the source states as a bound ('less than 1%', 'over $76.7 billion') supports only a claim that states the same kind of bound."
- [ ] Step 7: Commit with `git add tests/stageC.claimEvidence.bounds.test.ts src/pipeline/stageC/claimEvidence.ts docs/METHODOLOGY.md` and the message "Read a source bound as a bound, not as the exact figure (AI-409)".

### Task 9: An excerpt figure binds only to its own description (AI-305, AI-305-V1; OD-1)

**Files:**
- Modify `src/pipeline/stageC/claimEvidence.ts`:
  - :189-223, `context()` returns `own: string`;
  - beside METRIC_GRAMMAR (:227), add the new `OWN_CONTEXT_WORDS` set and `ownDescriptionTokens(text, ignore)`;
  - :456-474, the D-63 comment and `excerptNamesMetric(claim, source, own)`;
  - :604-622, a table cell's `own` is its row lead after the last colon;
  - :752, the candidate filter passes `own`.
- Test: `tests/stageC.claimEvidence.ownDescription.test.ts` (new). The existing `tests/stageC.claimEvidence.d66.test.ts` and `tests/stageC.excerptCurrencyScale.test.ts` must pass unedited.

**Interfaces:**
- Consumes: `metricTokens(label, ignore)`, `excerptNamesMetric`, `sourceBindings`.
- Produces:
  - `Context.own: string`, the figure's own description:
    - *Prose figure, before side:* the text from the latest of the clause start, the preceding figure's end, and the last *unclosed* `(` or the last `:` or `;` before the figure, up to the figure.
    - *Prose figure, after side:* the text from the figure to the first `,`, `;`, `:`, `(`, `)`, em dash or en dash, or to the following figure or the clause end, whichever comes first. A comma inside a date that `periodLabels` reads ("September 3, 2026", "July 26, 2026") does not cut: the dated phrases are masked before the cut is searched. Without this, the control "Cash and marketable investments totaled USD 73.45 billion as of September 3, 2026." below would keep "september" in its own description and fail, and so would Task 16's dated move end (row 33). (Round-4 review, 2026-10-28.)
    - *Table cell:* `rowLead(TableColumn.label)` (Task 5's helper, with the `TABLE_SCALE` declarations blanked), after its last `:`. The header window's raw text, which sourceBindings appends to the label (claimEvidence.ts:611), is not part of it.
  - `ownDescriptionTokens(text: string, ignore: readonly string[]): string[]`.
    1. A pre-pass blanks ordinal period phrases (`\b(?:first|second|third|fourth)\s+(?:fiscal\s+)?(?:quarter|half)\b`) and comparison bases (`\b(?:prior|previous|preceding|same)\s+(?:quarter|year|period)\b`).
    2. It then calls `metricTokens`, and removes `OWN_CONTEXT_WORDS`.
  - `OWN_CONTEXT_WORDS` is closed and commented by class:
    - pronouns: we, us, they, them, their, there, which, who, whose;
    - recognition verbs: totaled, totalled, totaling, totalling, amounted, came, represented, posted, generated, delivered, achieved, incurred, recognized, recognised, booked;
    - relational links: associated, related, relating, attributable;
    - causal links: driven, due, primarily, mainly, largely, partly, partially, reflecting;
    - hedges: approximately, approx, about, around, nearly, almost, roughly, some;
    - emphasis: record;
    - point abbreviations a previous table cell leaves in a row lead: pt, pts.

    It never holds a noun, adjective, comparator, definition modifier or direction word. "reported" and "total" stay meaningful (the METRIC_GRAMMAR comment at :224-226 explains why).
  - `excerptNamesMetric(claim, source, own)` returns HEAD's result `&& own.every((word) => inClaim(word))`. It never admits a candidate HEAD rejected. Because it can remove a wrong candidate that made a claim ambiguous, it can still move a claim to validated (OD-1). Step 5 checks each such move.

**Steps:**
- [ ] Step 1: Write the failing tests. The `onExcerpt(claim, text, title, ignoreWords?)` helper calls `validateClaimNumericSupport` on one excerpt, with source `x:s`, as-of 2026-08-26 and reporting currency USD.

  Defects (fail at HEAD, where every one validates; each confirmed by the review check with the title given). The excerpt's title must state the claim's period. A clause that names no period is read under the title's periods (D-63), so with a title that names none the claim is `unchecked` at HEAD and the test would not fail first. Each claim is not `validated`:
  1. NVDA fixture `q2fy27-ex99-2.txt`, sentence "These changes were driven by higher free cash flow that was used to return a record of nearly $26.0 billion to shareholders in the second quarter through share repurchases and cash dividends.", title "8-K Q2 FY2027", claim "Free cash flow for Q2 FY2027 was USD 26.0 billion."
  2. Synthetic minimal pair: "Free cash flow funded the return of $26.0 billion to shareholders.", title "8-K Q2 FY2027", with the same claim.
  3. MU-shaped: "Our results reflect a net benefit from tax incentive arrangements for our tax provision of $2.21 billion (benefiting our diluted earnings per share by $1.93).", title "10-K Item 7 (reporting period ended 2026-09-03)", with claim "Diluted earnings per share as of 2026-09-03 was USD 1.93."
  4. AMZN-shaped: "AWS net sales increased 37%—its fastest growth in 18 quarters—to a $169 billion annualized revenue run rate.", title "8-K EX-99.1 (event 2026-07-30)", with claim "Revenue as of 2026-07-30 was USD 169 billion."
  5. MU combined cash: "Micron ended the year with cash, marketable investments, and restricted cash of $73.48 billion.", title "8-K EX-99.1 Q4 FY2026", with claim "Cash for Q4 FY2026 was USD 73.48 billion." and `ignoreWords: ["Micron"]`.
  6. NVDA fixture: the sentence that begins "Cash, cash equivalents, and marketable debt securities were $56.6 billion, up from $53.6 billion a year ago …", read from the fixture, with claim "Cash and cash equivalents were USD 56.6 billion." (no period, any title).

  Number path, through `runVerifyPass` on a synthetic payload holding sentence 1 as `edgar:8-K EX-99.2` (as-of 2026-08-26, title "8-K Q2 FY2027", registered as `payload-text`). The judge-output object is `{ fcf: [row] }`, as tests/stageC.excerptCurrencyScale.test.ts:18-28 passes `{ keyNumbers: [number] }`:
  - a MetricRow `{ label: "Free cash flow", values: [{ period: "2026-07-26", value: { value: 26.0, unit: "USD billions", sourceId: "edgar:8-K EX-99.2", source: "edgar:8-K EX-99.2", asOf: "2026-08-26", verified: null } }] }` ends with `verified === false`. At HEAD it is `true`, the green check that AI-305-V1 found.
  - The control MetricRow "Cash, marketable investments, and restricted cash" (73.48, on sentence 5's excerpt) ends `verified === true`.

  Controls (pass at HEAD and after; each `validated` at HEAD in the review check). Each is `validated`:
  - "Inventory was USD 31.6 billion." on the fixture's "Inventory was $31.6 billion, up from $25.8 billion sequentially, as we prepare for …", title "8-K Q2 FY2027";
  - "Free cash flow for Q2 FY2027 was USD 21.3 billion." on the synthetic "Free cash flow was $21.3 billion in the quarter.", title "8-K Q2 FY2027";
  - "Cash, marketable investments, and restricted cash were USD 73.48 billion." on sentence 5 (title as in 5);
  - "Cash and marketable investments totaled USD 73.45 billion as of September 3, 2026." on "Cash and marketable investments totaled $73.45 billion as of September 3, 2026.";
  - "As of September 3, 2026, we had purchase obligations of approximately USD 4.18 billion for the acquisition of property, plant, and equipment." on "As of September 3, 2026, we had purchase obligations of approximately $4.18 billion for the acquisition of property, plant, and equipment, of which most is due within a year.".

  Review Focus 3 (pass at HEAD and after). Each is `validated`:
  - "Revenue for the second quarter was USD 46.7 billion." on "Revenue for the second quarter was a record $46.7 billion, up 6% from the first quarter and up 56% from a year ago.";
  - "Data center revenue for the second quarter was USD 41.1 billion." on "In the second quarter, data center revenue was $41.1 billion.";
  - the existing D-66 H200 charge case, unchanged in `tests/stageC.claimEvidence.d66.test.ts`.

  Review Focus 4. Each is `validated` after:
  - "Cash and cash equivalents as of 2026-07-26 were USD 22.44 billion." on `"Jul 26, 2026 Jan 25, 2026 (In millions) Current assets: Cash and cash equivalents $ 22,443 $ 10,605 Other debt securities 34,143 39,065"`, title "10-Q". It passes at HEAD and after;
  - Task 5's Note 3 net-income and Basic per-share claims, which pass after Task 5. Task 5's Diluted control stays `unchecked`;
  - the first row under a declaration that the own description must not demand: "Revenue as of 2026-01-25 was USD 215.938 billion." on `"Year Ended Jan 25, 2026 Jan 26, 2025 ($ in millions, except per share data) Revenue $ 215,938 $ 130,497 Cost of revenue 62,475 32,639 Other matters follow."`, title "10-K Item 7 — MD&A (reporting period ended 2026-01-25 (FY2026); filed 2026-02-25)". This one is `unchecked / text-ambiguous` at HEAD (review check): HEAD's subset rule also binds "Cost of revenue". After the fix it is `validated`, the documented move toward validated (OD-1). It fails first, so count it with the defects in Step 2.
- [ ] Step 2: Run `npx vitest run --config vitest.config.ts tests/stageC.claimEvidence.ownDescription.test.ts`. Expected: FAIL on the six defects, the FCF MetricRow and the first-row Revenue case. Controls pass.
- [ ] Step 3: Implement `own`, `ownDescriptionTokens`, `OWN_CONTEXT_WORDS` and the third argument. Update the D-63 comment at :456-464: the clause still carries the verb and context, and the figure's own description must now be named by the claim. Cite D-next (OD-1) and AI-305.
- [ ] Step 4: Run every claim-evidence and verify test, including the new files of Tasks 1, 3 and 8: `npx vitest run --config vitest.config.ts tests/stageC.claimEvidence.ownDescription.test.ts tests/stageC.claimEvidence.d66.test.ts tests/stageC.claimEvidence.fraction.test.ts tests/stageC.claimEvidence.isoRange.test.ts tests/stageC.claimEvidence.perShareLabel.test.ts tests/stageC.claimEvidence.tokens.test.ts tests/stageC.claimEvidence.bounds.test.ts tests/stageC.numberScanLinearity.test.ts tests/stageC.excerptCurrencyScale.test.ts tests/stageC.excerptNumbers.test.ts tests/stageC.factualValidation.test.ts tests/stageC.verifyChecks.test.ts`. Expected: PASS.
  - If an existing test fails, find the word in the failing figure's own description that the claim does not name.
  - If it is a pronoun, a recognition, relational or causal verb, or a hedge, add it to `OWN_CONTEXT_WORDS` with a comment naming the test.
  - If it is a noun, adjective, modifier, comparator or direction word, the old expectation was the defect. Stop and report it in the disposition note. Do not edit the test or widen the list.
- [ ] Step 5: Benefit check. Replay `t9`.
  - Expect four stored excerpt claims or key numbers to move from validated to unchecked: #50 FCF 26.0, #46 EPS 1.93, #43 revenue 169 and #46 cash 73.48 (AI-305 and AI-305-V1). Check each against the finding text.
  - Every other validated-to-unchecked flip is listed with its own-description words, and must be a different-metric binding. A correct figure that flips is a defect in this task: fix it under the Step 4 rule.
  - Every unchecked-to-validated move is listed too. It is admissible only when HEAD's reason was `text-ambiguous`, HEAD's candidate set held a wrong-metric candidate that the own-description rule removed, and the one candidate left has an own description that the claim names in full. Any other move toward validated stops the task.
  - Also re-verify the stored excerpt FACT claims of #43, #46 and #50, as the AI-305 probe's "info" block does. Record validated-at-base and validated-at-t9 counts per report.
- [ ] Step 6: Docs.
  - METHODOLOGY.md: a new paragraph after the D-45 excerpt-numbers paragraph, "A figure is read with its own description".
    - It states the before and after cut points, the context-word classes, and the conjunction with D-63's clause rule.
    - It gives an example: "a record of nearly $26.0 billion to shareholders" is not a free-cash-flow figure.
  - Update DECISIONS.md D-63 with a one-line "Revised by D-next (OD-1)" pointer. Do not rewrite its text.
- [ ] Step 7: Commit with `git add tests/stageC.claimEvidence.ownDescription.test.ts src/pipeline/stageC/claimEvidence.ts docs/METHODOLOGY.md docs/audit/DECISIONS.md` and the message "Bind an excerpt figure only to its own description (AI-305, AI-305-V1)".

### Task 10: A registry number's printed description must not name another metric (AI-407; OD-2)

**Files:**
- Modify `src/pipeline/stageC/passes.ts`:
  - :2602-2611, TracedNumberRef gains `rowKind?: "metric-row" | "named-row"`, set by `collectTracedNumberRefs` (:2613-2652) from which branch supplied the label: `ownRowLabel` gives `"metric-row"`, `ownName` gives `"named-row"`, and an inherited label keeps its kind. The doc says `rowLabel` is now read by both branches;
  - :3014-3088, the registry branch: after the `namedUnitMatchesRecord` test at :3022, add the description conflict test and the source/sourceId test;
  - :2823-2826, the runVerifyPass docstring.
- Modify `src/pipeline/stageC/claimEvidence.ts`: add the exported `descriptionConflictsWithRecord` beside `metricTokens`, which stays private.
- Modify `src/pipeline/stageC/provenance.ts:278-283`, the design-note comment.
- Test: `tests/stageC.tracedNumberDescription.test.ts` (new).

**Interfaces:**
- Consumes: `NumericProvenanceRecord.label`, `TracedNumberRef.rowLabel`, `unitLabel` (`@/report/format`), `parseCitationRef` (`@/pipeline/stageC/citations`).
- Produces: `export function descriptionConflictsWithRecord(description: { metric: string; segment: string }, record: NumericProvenanceRecord, ignore: readonly string[]): string | null`. It returns the conflict in words, or null.
  - `description.metric` is read by rules 1, 2, 3 and 5. It is `unitLabel(number.unit) ?? ""`, plus, when `rowKind === "metric-row"`, the `rowLabel` with a leading `FACT`, `ESTIMATE` or `JUDGMENT` tag (followed by `:` or a dash) removed.
  - `description.segment` is read by rule 4 only. It is the `rowLabel` (any kind) plus `unitLabel(number.unit) ?? ""`.
  - It returns null when `record.label` is absent. Stage B records from `registerStageBNumber` carry no label. A side with no tokens never conflicts.
  - Otherwise it returns a conflict in any of the five cases of OD-2:
    1. levels differ;
    2. share bases differ;
    3. a one-sided non-default basis. A trailing " (core)" or " (sector)" is removed from a `payload.macro.` label first;
    4. a segment record (id prefix `payload.segments.` or `payload.segment-revenue.`) whose member tokens are not all in `description.segment`. The member is the label after the first ": ", cut before " revenue" for `payload.segment-revenue.`;
    5. disjoint `METRIC_HEADS` sets, as listed in OD-2. The phrases "return on invested capital", "return on equity" and "return on assets" are read as roic, roe and roa first. The head table and the phrase table are local to this function, so no other path changes.

    Tokens come from `metricTokens` (stems, METRIC_SYNONYMS and ABBREVIATIONS included).
  - In `runVerifyPass`:
    - A conflict sets `reason = "text-context-mismatch"` and `excerptNote = "the printed description names another metric: <conflict>"`. The number is unverified and logged `unchecked`, never contradicted (F-22).
    - Let `printed = typeof number.source === "string" ? parseCitationRef(number.source)?.sourceId ?? null : null`. When `printed !== null`, `printed !== sourceId` and `registry.some((entry) => entry.id === printed)`, the same reason applies with the note "the printed source names another record". A `source` that is not a registry id is not compared. Examples are the SEC Archives reader link that `bindDeterministicReportProvenance` keeps on primary geographic rows (stageC/index.ts:468-483), and a bare "computed".
  - No change to `matchProvenanceRecord`.

**Steps:**
- [ ] Step 1: Write the failing tests. Build a synthetic payload, cast `as unknown as ContextPayload` as tests/stageC.excerptCurrencyScale.test.ts:19-26 does. Its `provenanceRegistry` holds these records, each with the producer's own label shape:
  - operating margin: id `computed.quarterly-trend.operating-margin-quarter-ended-2026-07-26`, label "operating margin, quarter ended 2026-07-26", 58.1 percent, period 2026-07-26;
  - gross margin: same shape, label "gross margin, quarter ended 2026-07-26", 72.4 percent;
  - a Data Center segment record: id `payload.segments.product-data-center`, label "product: Data Center", 41.1e9 USD, the payload.ts:1797 shape seen in stored #50;
  - a segment-revenue record: id `payload.segment-revenue.product-market-platform-data-center-revenue-quarter-ended-2026-07-26`, label "Product / market platform: Data Center revenue, quarter ended 2026-07-26", 89.023e9 USD, the d66 test's record;
  - revenue (label "revenue") and net income (label "net income");
  - "diluted EPS" (currency-per-share);
  - "ROIC (latest)";
  - "roe";
  - a macro record: id `payload.macro.dgs10-core`, label "DGS10 (core)", 4.1 percent;
  - a peer record: id `payload.peers.amd-advanced-micro-devices-inc`, label "AMD — Advanced Micro Devices, Inc.", currency;
  - a Stage B record with no label: id `payload.computed.scenario-targets.base.per-share`, USD per share;
  - MACD (`computed.technicals.macd`).

  Run `runVerifyPass` with a throwing `runPass`. Defects (fail at HEAD, where each is `verified === true`, as in the AI-407 probe). Each gives `verified === false` and log reason `text-context-mismatch`:
  - a MetricRow `{ label: "FACT — Quarterly gross margin", values: [{ period: "2026-07-26", value: <58.1 % citing operating margin> }] }`, caught by rule 1;
  - a segment row `{ name: "Gaming", revenue: <41.1e9 citing payload.segments.product-data-center> }`, caught by rule 4;
  - a segment row `{ name: "Gaming", revenue: <89.023e9 citing the segment-revenue record> }`, caught by rule 4 with the member "Data Center" cut before " revenue";
  - a key number `{ value: 58.1, unit: "% gross margin", sourceId: <operating margin> }`, caught by rule 1;
  - a MetricRow `{ label: "Revenue", values: [{ period: "2026-07-26", value: <net income value citing net income> }] }`, caught by rule 5 (heads revenue against income);
  - a key number `{ source: <revenue id>, sourceId: <net income id>, value: <net income value> }`, caught by the printed-source test.

  Controls. Each gives `verified === true`:
  - "FACT — Quarterly gross margin" citing gross margin (72.4);
  - `{ name: "Data Center" }` citing either Data Center record;
  - `source === sourceId === revenue`;
  - "Diluted EPS (annual, GAAP)" citing "diluted EPS";
  - "Latest annual ROIC" citing "ROIC (latest)";
  - "Return on equity" citing "roe" (Review Focus 5);
  - "ESTIMATE: Weighted projected revenue" citing a record labelled "revenue weighted 12M ending 2027-06-30";
  - "Revenue (annual)" citing "revenue";
  - "Leverage" (a MetricRow label with no head word) citing a record labelled "netDebtToEbitda (latest)";
  - a macro row `{ seriesId: "DGS10", name: "FACT: Ten-year Treasury yield", latest: <4.1 % citing payload.macro.dgs10-core>, relevance: "…" }`. Named-row names are not metric descriptions, and " (core)" is not a basis;
  - a peer row `{ name: "Advanced Micro Devices, Inc.", symbol: "AMD", metrics: [<citing the peer record>] }`;
  - a scenario `{ name: "base", priceTarget: <citing the label-less scenario-target record> }`;
  - a geographic segment row `{ name: "CHINA", revenue: <number> }`, where the number's `source` is `"https://www.sec.gov/Archives/edgar/data/1045810/000104581026000012/nvda-20260125.htm"` and its `sourceId` is a record `payload.segments.geographic-china` (label "geographic: CHINA") of the same value. The reader link is not a registry id (stageC/index.ts:468-483), and the name covers the member.

  D-44 control: unit "RSI" on the MACD record still gives `unit-mismatch`.
- [ ] Step 2: Run `npx vitest run --config vitest.config.ts tests/stageC.tracedNumberDescription.test.ts`. Expected: FAIL on the six defects. Controls pass at HEAD.
- [ ] Step 3: Implement `descriptionConflictsWithRecord`, the `rowKind` threading in `collectTracedNumberRefs` and the two tests in the registry branch. Thread `rowLabel` and `rowKind` into the registry branch; `rowLabel` is already destructured at :2927.
- [ ] Step 4: Run `npx vitest run --config vitest.config.ts tests/stageC.tracedNumberDescription.test.ts tests/stageC.provenance.test.ts tests/stageC.payload.passes.test.ts tests/stageC.verifyChecks.test.ts tests/report.presentation.labels.test.ts`. Expected: PASS.
- [ ] Step 5: Benefit check. Replay `t10` through the facade (Task 0), so the pipeline-owned blocks are read too. Expect zero flips on #43, #46, #48, #49 and #50. The auditor's scan of 831 stored MetricRow cells and 96 product-segment rows found no real mismatch, and a review scan found `source === sourceId` on every TracedNumber of stored #43-#52.
  - A flip whose description is a true paraphrase is a defect in this task. Fix it with a head-word or phrase entry and a control test, never by loosening rules 1 to 4.
  - A flip whose description names another metric is a real catch. List it.
- [ ] Step 6: Docs.
  - METHODOLOGY.md, registry-match text (about lines 2575-2580): "A registry figure is also read against the description the report prints beside it (a metric row's label, a segment row's name or a worded unit; a peer's, macro series' or scenario's name is not a metric description). One that names another level, share basis, non-GAAP basis, segment or metric head is unverified, never contradicted, and so is a figure whose printed source is another registry record."
  - Fix provenance.ts:278-283 and the runVerifyPass docstring.
  - Add a "Revised by D-next (OD-2)" pointer to D-44.
- [ ] Step 7: Commit with `git add tests/stageC.tracedNumberDescription.test.ts src/pipeline/stageC/passes.ts src/pipeline/stageC/claimEvidence.ts src/pipeline/stageC/provenance.ts docs/METHODOLOGY.md docs/audit/DECISIONS.md` and the message "Unverify a registry figure printed under another metric's description (AI-407)".

### Task 11: A MetricRow cell's column period is read against its record (AI-408; OD-3)

**Files:**
- Modify `src/pipeline/stageC/passes.ts`:
  - :2602-2611, TracedNumberRef gains `cellPeriod?: string`;
  - :2613-2652, `collectTracedNumberRefs`: `walk` gains a fourth parameter, `cellPeriod: string | undefined`, which is reset to `undefined` on every call that does not set it. When the walker is inside a MetricRow's own `values` array (the branch where `childLabel` came from `ownRowLabel`), an element object with `typeof period === "string"` passes that `period` to its `value` key only. ProjectionPoint `{ period, value }` objects (schema.ts:1843) are not under a MetricRow's `values` and get no cell period;
  - :3027-3043, the period-erase rule;
  - after the Task 10 test, the column test;
  - :2823-2826, the docstring.
- Modify `src/pipeline/stageC/provenance.ts`, after :480-500 (`periodsAgree`): add the export `cellPeriodCheck`.
- Test: `tests/stageC.metricRowPeriod.test.ts` (new).

**Interfaces:**
- Consumes: `periodsAgree(a, b, fiscalPeriod)`, `NumericProvenanceRecord.period/asOf/fiscalPeriod`.
- Produces: `export function cellPeriodCheck(column: string, record: Pick<NumericProvenanceRecord, "period" | "asOf" | "fiscalPeriod" | "periodContext">): "agrees" | "conflicts" | "not-checked"`. Only two column shapes are decidable:
  - a bare ISO date, `/^\s*\d{4}-\d{2}-\d{2}\s*$/`. Its target is `record.period` when that is a single ISO date. When `record.period === null` the targets are the dates the record carries (B1 OD-1): `record.asOf`, and `record.periodContext.at` (instant) or `record.periodContext.end` (duration). It agrees when it equals any target. When `record.period` is neither null nor a single ISO date (a window "ttm: … to …", or a fiscal string), the column is `not-checked`. If B1 has merged first and exports its established-period helper for period-less records, call it instead of re-deriving the set, so the two paths cannot drift.
  - a bare explicit fiscal label, `/^\s*(?:Q[1-4]\s+)?FY\s?['’]?\d{2,4}\s*$/i`. Let `label = record.fiscalPeriod ?? record.periodContext?.fiscalLabel`. It agrees only when `label` is set and `periodsAgree(column, record.period ?? record.asOf, label)`. With no fiscal label on the record it `conflicts`, as recommended default 2 does.

  Every other column is `not-checked`. That includes "current", "latest", "TTM to …", "12M ending …", "FY ended 2026-01-25", ranges, month-name dates and bare years.
- In `runVerifyPass`, the cell check runs only when `ref.cellPeriod` is set:
  - `conflicts` gives `reason = "period-mismatch"` (unchecked, F-22);
  - `not-checked` appends `column "<label>" not period-checked` to `periodNote`.
- The 10aa8ab erase at :3043 becomes:
  - if `record.period === null && number.period != null` and `cellPeriodCheck(number.period, record) === "conflicts"`, the reason is `period-mismatch`;
  - otherwise the period is erased as before.

**Steps:**
- [ ] Step 1: Write the failing tests. The synthetic registry, mirroring the AI-408 probe, holds:
  - a Q1 FY2027 gross-margin record (period 2026-04-26, fiscalPeriod "Q1 FY2027", as-of 2026-05-28);
  - an FY2026 `roic (latest)` record (period null, as-of 2026-01-25, fiscalPeriod "FY2026");
  - an FY2025 revenue record (period 2025-01-26, as-of 2026-01-25).

  Each test puts one `{ label: <the record's own label>, values: [{ period: <column>, value: <traced> }] }` under `fundamentals.marginTrend`. Use the record's own label so that Task 10 passes.

  Defects (fail at HEAD). Each gives `verified === false` and reason `period-mismatch`:
  - (a) the Q1 record in column "2026-07-26", with the number's period omitted;
  - (b) roic-latest in column "2025-01-26", with number period "2025-01-26";
  - (c) FY2025 revenue in column "2026-01-25", with the number's period omitted;
  - (d) the Q1 record in column "Q2 FY2027".

  Controls. Each gives `verified === true`:
  - the Q1 record in column "2026-04-26";
  - the Q1 record in column "Q1 FY2027";
  - the haiku case: a period-less record (as-of 2026-07-26) with a supplied period "2026-07-26" in column "2026-07-26";
  - a period-less record whose `periodContext` is a duration 2025-07-28 to 2026-07-26 (as-of 2026-08-27) in column "2026-07-26", and the same record with `periodContext.fiscalLabel` "Q2 FY2027" (no `fiscalPeriod`) in column "Q2 FY2027" (integration change: B1 OD-1's established set);
  - a period-less record in column "current", whose log note contains `column "current" not period-checked`;
  - a record in column "TTM to 2026-07-26", whose note contains `not period-checked`;
  - a TTM record (period "ttm: 2025-07-01 to 2026-06-30") in column "2026-06-30", whose note contains `not period-checked` (window agreement is B1's).

  The control that is refused at HEAD stays refused: the Q1 record in column "2026-04-26", carrying its own wrong period 2026-07-26, gives `period-mismatch` (matchProvenanceRecord).
- [ ] Step 2: Run `npx vitest run --config vitest.config.ts tests/stageC.metricRowPeriod.test.ts`. Expected: FAIL on (a) to (d) and on the three note assertions. The other controls pass.
- [ ] Step 3: Implement `cellPeriodCheck`, `cellPeriod` threading, the column test and the narrowed erase. Rewrite the 10aa8ab comment at :3027-3042 so that it states the new rule and keeps the haiku evidence.
- [ ] Step 4: Run `npx vitest run --config vitest.config.ts tests/stageC.metricRowPeriod.test.ts tests/stageC.provenance.test.ts tests/stageC.payload.passes.test.ts tests/stageC.tracedNumberDescription.test.ts tests/stageC.verifyChecks.test.ts`. Expected: PASS.
- [ ] Step 5: Benefit check. Replay `t11`.
  - Most stored columns *are* decidable. A review scan of the stored reports' MetricRow columns found bare ISO dates in the majority (#43 16 of 28, #46 10 of 10, #48 20 of 27, #50 12 of 12) and no bare fiscal label. The column check really runs on them. The auditor's scan found 0 column/record mismatches among 831 cells, so expect few or no flips. Expect `not period-checked` notes on the rest ("current", windows, "FY ended …").
  - Every verified-to-unverified flip must be a column date that differs from the record's period or as-of. List each with its column and record.
  - Fallback: suppose the replay shows a period-less record whose as-of is a *filing* date while its true data date is the column. Do not loosen the date rule. Record the case in the disposition note as an honest unchecked; F-22 makes it unverified, not contradicted.
- [ ] Step 6: Docs.
  - METHODOLOGY.md :2575-2580: "A MetricRow cell is checked against its column when the column is a date or a fiscal label; other columns are logged 'not period-checked'."
  - Fix the runVerifyPass docstring.
  - Add a "Revised by D-next (OD-3)" pointer to the 10aa8ab text if DECISIONS.md records it. If it does not, the D-next entry carries it.
- [ ] Step 7: Commit with `git add tests/stageC.metricRowPeriod.test.ts src/pipeline/stageC/passes.ts src/pipeline/stageC/provenance.ts docs/METHODOLOGY.md` and the message "Check a MetricRow cell's column period against its record (AI-408)".

### Task 12: Read every role in a combined insider owner type (AI-116)

**Files:**
- Modify `src/pipeline/stageC/consistency.ts:1115-1123` (`collectPersonRows`, insider part).
- Modify `src/report/claimMatching.ts` (new `legacyCheckNote`) and `src/report/export/auditMarkdown.ts:160-183` (print it in the verification log).
- Test: `tests/stageC.verifyChecks.test.ts` (person-row describe near :781), and `tests/report.markdown.integration.test.ts` (one legacy case).

**Interfaces:**
- Consumes: the insider note format rendered by payload.ts:1688, `2026-09-17 HUANG JEN HSUN (director, officer: President and CEO): G-Gift 438000 @ 0 [fmp:insider-trades · 2026-09-17]`.
- Produces:
  - Roles are split on `owner.split(/,\s*(?=(?:director|officer|other|10\s*percent\s+owner|ten\s+percent\s+owner)\b)/i)`. A leading `^(?:officer|other)\s*:\s*` is stripped, and one PersonRow is pushed per role (same tag, as-of, name and `anyOrder`).
  - "officer: EVP, Operations" stays one role, "EVP, Operations". The comment at :1118 is corrected.
  - `export const INSIDER_ROLES_READ_FROM = "1.45.0"` and `export function legacyCheckNote(entry: VerificationLogEntry, log: readonly VerificationLogEntry[], reportSpecVersion: string): string | null`. It returns `"recorded before an insider owner type listing several roles was read role by role; this title was not rechecked"` when all four of these hold:
    - `reportSpecVersion` is below `INSIDER_ROLES_READ_FROM`, compared numerically part by part (no helper exists in src/report; write a three-part numeric compare beside the function);
    - `entry.reason === "named-individual-title-mismatch"` and `entry.source === "fmp:insider-trades"`;
    - the log holds a `check === "named-individual"` entry with the same `path`;
    - that check entry's note quotes the title (`calls <name> "<title>"`) as `director`, `10 percent owner`, `ten percent owner` or `other`, the roles HEAD's `split(":").pop()` dropped.

    It annotates both the claim row and the check row of that path. #48 stores two rows for its gift claim: the claim row's note only says "rejected by the named-individual restriction", and the check row's note quotes "director".

    The wording does not claim the row *was* combined. The stored log does not keep the row's owner type, so the note says only that the title was judged under the old reading and not rechecked.

    Otherwise it returns null. It is display-only: stored bytes are unchanged (D-67), and this is how the "needs reinterpretation" classification is handled. The audit Markdown is the only surface that prints log notes (markdown.ts and printHtml.ts print only the trust rows). The claim's UI mark reads "unverified", which stays true.
  - `INSIDER_ROLES_READ_FROM` must equal the REPORT_SPEC_VERSION this batch ships, and moves with it if B1 merges first (Task 29). Task 20's stamp test asserts the two are equal.

**Steps:**
- [ ] Step 1: Write the failing tests. Use the existing person-row harness (`"officer: Chief Financial Officer"` at :789 is the model). The run is `runConsistencyChecks({ claims, registry: [], citationRegistry: [{ id: "fmp:insider-trades", kind: "payload-text", asOf: "2026-09-17", origin: "fmp:insider-trades" }], fetchedUrls: new Set(), personNames: collectPersonNames({ insiderNotes }), personRows: collectPersonRows({ insiderNotes }) })`, with claims citing `fmp:insider-trades` as of 2026-09-17.

  The claims spell the name as the row does, "HUANG JEN HSUN", which is what #48's model wrote following prompts.ts:190-191. With only an insider note, "Jen-Hsun Huang" is `named-individual-not-in-source` at HEAD and after (review check), so it cannot prove this fix. Results below are from the review check at HEAD. With the insider note above:
  - "HUANG JEN HSUN (director, officer: President and CEO) recorded a gift of 438,000 shares at zero price on 2026-09-17." gives no named-individual finding (HEAD: `named-individual-title-mismatch`);
  - "Director HUANG JEN HSUN recorded a gift of 438,000 shares on 2026-09-17." gives none (HEAD: `named-individual-title-mismatch`);
  - "HUANG JEN HSUN (President and CEO) recorded a gift of 438,000 shares at zero price on 2026-09-17." gives none (control: none at HEAD);
  - "Chief Financial Officer HUANG JEN HSUN recorded a gift of 438,000 shares on 2026-09-17." gives `named-individual-title-mismatch` (control: also at HEAD).

  With the row `2026-09-17 SMITH JOHN A (director, 10 percent owner): S-Sale 1000 @ 180 [fmp:insider-trades · 2026-09-17]`:
  - "John A. Smith (director) sold 1,000 shares." gives none (HEAD: `named-individual-title-mismatch`, because the whole owner type was one title);
  - "Director John A. Smith sold 1,000 shares." gives none (HEAD: `named-individual-title-mismatch`);
  - "John A. Smith (10 percent owner) sold 1,000 shares." gives none. This is a control: none at HEAD and after, because "10 percent owner" does not open with a role word, so no title is read (opensWithRole, consistency.ts:1239).

  With a `(director)` row for SMITH JOHN A, "Chief Financial Officer John A. Smith sold 1,000 shares." still gives `named-individual-title-mismatch` (control).

  With the row `2026-09-17 SHOQUIST DEBORA (officer: EVP, Operations): S-Sale 1000 @ 180 [fmp:insider-trades · 2026-09-17]`, "Debora Shoquist, EVP of Finance, sold 1,000 shares." still gives `named-individual-title-mismatch`, and "Debora Shoquist, EVP, Operations, sold 1,000 shares." gives none (controls: the comma inside one role is kept).

  `collectPersonRows` on the combined note returns two rows for HUANG JEN HSUN, titles "director" and "President and CEO". Update the existing `toEqual` at :797-801 only if its insider row changes. It does not: "officer: Chief Financial Officer" stays one row.

  In the markdown test, a stored 1.44.0 report whose log holds #48's two entries for `leadership.executives[0].evidence.insiderActivity[0]` renders both verification-log rows containing "read role by role". The entries are the claim row (`reason: "named-individual-title-mismatch"`, `source: "fmp:insider-trades"`) and the check row (`check: "named-individual"`, note `The claim calls HUANG JEN HSUN "director", but no fmp:insider-trades row it cites gives that person that title …`). The same entries in a 1.45.0 report render without it. So does a 1.44.0 entry whose quoted title is "Chief Financial Officer".
- [ ] Step 2: Run `npx vitest run --config vitest.config.ts tests/stageC.verifyChecks.test.ts -t "person" tests/report.markdown.integration.test.ts -t "role by role"`. Expected: FAIL on the HUANG "(director, …)" and "Director HUANG" claims, the two SMITH director claims and the legacy rows. Controls pass.
- [ ] Step 3: Implement the split, `legacyCheckNote`, and its use in auditMarkdown beside the F-22 reread. Append the note to the row's `note` cell. The report version comes from `report.meta.specVersion` (schema.ts:829); `reportToAuditMarkdown` (auditMarkdown.ts:460) passes it, and the whole log, into the appendix renderer.
- [ ] Step 4: Run `npx vitest run --config vitest.config.ts tests/stageC.verifyChecks.test.ts tests/report.markdown.integration.test.ts tests/report.markdownEscape.test.ts`. Expected: PASS.
- [ ] Step 5: Benefit check.
  - Replay `t12`: #48's insider-trade title row moves from failed to passed, and its claim is no longer in `rejectedClaimPaths`.
  - Render #48's audit Markdown from its stored bytes in the replay harness. #48 is stored under spec 1.43.0. Both stored rows show the legacy note, and `sha256` of `data/reports/48.json` is unchanged.
- [ ] Step 6: Docs. METHODOLOGY.md, person rows (about lines 2620-2641): "An insider's owner type can list several roles ('director, officer: President and CEO'); each is a title of that row." Add the legacy-note sentence to the F-22 legacy-reread paragraph (about lines 2693-2716).
- [ ] Step 7: Commit with `git add tests/stageC.verifyChecks.test.ts tests/report.markdown.integration.test.ts src/pipeline/stageC/consistency.ts src/report/claimMatching.ts src/report/export/auditMarkdown.ts docs/METHODOLOGY.md` and the message "Read every role of a combined insider owner type (AI-116)".

### Task 13: Issuer disclosures in the payload are primary sources for registered entities (AI-103; OD-4)

**Files:**
- Modify `src/pipeline/stageC/entityValidation.ts:258-336` (`validateEntityText` gains an optional predicate; :276-285 the primary test and its issue text).
- Modify `src/pipeline/stageC/passes.ts:2058-2105` (`unresolvedJudgeEntityConflicts` builds and passes the predicate).
- Modify `src/pipeline/stageC/prompts.ts:513-516` (the judge entity instruction names the admissible classes).
- Test: `tests/stageC.entities.lly.test.ts` (unit) and `tests/stageC.judgeProtocol.test.ts` (judge pass, using its `fakeBundle("LLY")` / `buildInputs` / `makeDeps` helpers).

**Interfaces:**
- Consumes: `ContextPayload.filings`, `.transcript`, `.citationRegistry`, `.provenanceRegistry`.
- Produces:
  - `validateEntityText(text, registry, sourceId, isPrimary?: (sourceId: string) => boolean)`. With no predicate it keeps HEAD's registered-URL rule exactly, so the analyst path and `collectEntityConflicts` are unchanged.
  - The predicate built in `unresolvedJudgeEntityConflicts` admits:
    - a record's registered URL;
    - an `edgar:` id that appears in `payload.filings[].source` or in `payload.citationRegistry[].id`;
    - `fmp:earning-call-transcript` when `payload.transcript` is present;
    - `fmp:press-release` when the citation registry lists it;
    - a `payload.provenanceRegistry[].id` under the OD-4 allowlist of issuer-data prefixes: `payload.statements.`, `payload.issuer-filings.`, `payload.filing-facts.`, `payload.segments.`, `payload.segment-revenue.`, `payload.leadership.`, `payload.insiders.`, `computed.` and `payload.computed.`.

    It does not admit `fmp:news`, `finnhub:news`, unregistered `web:` URLs, or third-party registry rows. Those rows are `payload.peers.`, `payload.estimates.`, `payload.institutional.`, `payload.short-interest.`, `payload.macro.`, `payload.quote` and `payload.news.`.
  - The issue text becomes `${canonicalName} requires a primary source: the issuer's filings, call transcript or press releases in the payload, or a registered issuer page`.
  - The prompt line gains the same class list.
  - The multi-source case (sourceId null) is unchanged.

**Steps:**
- [ ] Step 1: Write the failing tests.
  - Unit tests:
    - `validateEntityText("Orforglipron …", LLY, "edgar:10-K item1", isPrimary)` gives no `primary-source-required` issue when `isPrimary` admits `edgar:10-K item1`;
    - with the 3-argument call it still gives one (control: the analyst path is unchanged);
    - `fmp:news` under the same predicate still gives one.
  - Judge tests: take `buildInputs()` with `fakeBundle("LLY")`, add an `edgar:10-K item1` filing excerpt, a transcript and their citation-registry rows, and run `runJudgePass` through `MockRunPass`.
    - A FACT "Lilly's 10-K describes orforglipron, an oral GLP-1 candidate." citing `edgar:10-K item1` gives `run.ok === true` (HEAD: fails `llm.judge.entities`);
    - a FACT naming retatrutide citing `fmp:earning-call-transcript` gives `run.ok === true`;
    - the same orforglipron FACT citing `fmp:news` gives `run.ok === false` with gap field `llm.judge.entities` (control);
    - the same orforglipron FACT citing a `payload.estimates.` registry id gives `run.ok === false` (control: third-party rows are outside the allowlist);
    - a FACT naming no entity gives `ok` (control).
  - The judge system or user framing contains "filings, call transcript or press releases". This replaces the probe's "the request names an admitted IR URL" check, which OD-4 makes moot.
- [ ] Step 2: Run `npx vitest run --config vitest.config.ts tests/stageC.entities.lly.test.ts tests/stageC.judgeProtocol.test.ts -t "entity"`. Expected: FAIL on the two admitted-source judge cases, the predicate unit case and the framing text.
- [ ] Step 3: Implement the predicate parameter, the predicate builder (a small named function `issuerPrimarySource(payload)` beside `unresolvedJudgeEntityConflicts`), the issue text and the prompt line.
- [ ] Step 4: Run `npx vitest run --config vitest.config.ts tests/stageC.entities.lly.test.ts tests/stageC.judgeProtocol.test.ts tests/stageC.payload.passes.test.ts`. Expected: PASS, and the payload golden is unchanged. If the golden's prompt bytes move, Task 21 re-pins them with a dated comment; if a data hash moves, stop.
- [ ] Step 5: Benefit check. This is a judge-path change, so the verify replay is unaffected; confirm that `t13` equals `t12`.
  - Also run the replay harness's entity scan over stored #38 (LLY, pre-registry; no run-input snapshot) with the new predicate. Use an LLY payload built from `fakeBundle("LLY")` plus a transcript excerpt and an `fmp:press-release` citation-registry row. Without those, the predicate has nothing to admit them by.
  - The AI-103 probe found two hits at HEAD: `balanceSheet.capitalAllocation[1]` (fmp:press-release; Orna, Ajax, AtaiBeckley) and `catalystsRisks.catalysts[0].reasoning` (fmp:earning-call-transcript; retatrutide, ACHIEVE). Expect zero `primary-source-required` hits for them.
- [ ] Step 6: Docs. METHODOLOGY.md has no entity-registry paragraph at HEAD; add one to "Stage A checks and report verification", beside the person-row paragraph (about lines 2620-2641). It says:
  - registered issuer entities (drugs, trials, deals) may be named from the issuer's filings, call transcript, press releases or payload records, and from a registered issuer page;
  - news and unregistered web results are not primary sources, and the judge is asked to fix such a claim;
  - this is consistent with D-20's person rule.
- [ ] Step 7: Commit with `git add tests/stageC.entities.lly.test.ts tests/stageC.judgeProtocol.test.ts src/pipeline/stageC/entityValidation.ts src/pipeline/stageC/passes.ts src/pipeline/stageC/prompts.ts docs/METHODOLOGY.md` and the message "Admit the issuer's own filings, call and releases as primary entity sources (AI-103)".

### Task 14: A described fade is not a return-path recovery (AI-104)

**Files:**
- Modify `src/pipeline/stageC/returnPathLanguage.ts`: :39-49 add `FADE` and a `governsHurdle(sentence)` test; :55-62 use it.
- Test: `tests/stageC.excessReturnVisibility.audit20261022.test.ts` (extend the C-11 language describe at :156).

**Interfaces:**
- Consumes: `RETURN_RECOVERY`, `TOWARD_HURDLE`.
- Produces: a sentence is flagged only when some `RETURN_RECOVERY` match governs the hurdle.
  - *Governed span:* the text from that match's end to the start of the hurdle noun ("cost of equity", "CoE" or "recovery path") inside the `TOWARD_HURDLE` match. It must not end at the `TOWARD_HURDLE` match's start: that match begins at the *first* "to". In "Trailing ROTE improved to 16.5% and the base path fades from there toward the cost of equity." it starts at the recovery's own "to 16.5% and …" (review check at HEAD), which would leave a one-space span and miss "fades". Find the noun with `/\b(?:cost of equity|CoE)\b|\brecovery path\b/i` run on the `TOWARD_HURDLE` match text, and add the match's index.
  - The span must not contain `FADE` = `\b(?:fad(?:e|es|ed|ing)|converg\w*|declin\w*|decreas\w*|fall(?:s|ing)?|fell|normali[sz]\w*|revert\w*|compress\w*|erod\w*|drift\w*|glid\w*|taper\w*|moderat\w*)\b`.
  - Nor may it end the recovery at a level and start a new clause with no recovery verb: `\bto\s+[-+−]?\d[\d.,]*\s*%` followed by `\b(?:and|but|then|while|before|after|with)\b`, where the rest of the span has no `RECOVERY` match.
  - A hurdle before the recovery match is evaluated as HEAD does.
  - The manifest function needs no change.

**Steps:**
- [ ] Step 1: Write the failing tests. Each of these gives `[]` from `returnPathLanguageFindings` on the existing above-target input (fail at HEAD):
  - "Trailing ROTE improved to 16.5% and the base path fades from there toward the cost of equity.";
  - "ROE rose to 16.5% over the trailing four quarters and is modelled to converge to the cost of equity by year ten.";
  - "ROTE improved to 16.5%, and the base case has it decline toward the cost of equity over the explicit period.";
  - "ROTE improved to 16.5% and the base path moves toward the cost of equity.".

  The manifest on the file's synthetic bank route (start above target) with the first sentence gives `[]`. Controls that stay flagged:
  - every positive at :156-219, including "Returns recover toward the 10.4% cost of equity by year five.", "Returns improved toward the cost of equity." and "ROTE rose toward the 10.4% cost of equity.";
  - the new "ROE improved to 16.5% and keeps rising toward the cost of equity." gives one finding;
  - "Returns recover toward the cost of equity along the model's explicit recovery path." gives one.
- [ ] Step 2: Run `npx vitest run --config vitest.config.ts tests/stageC.excessReturnVisibility.audit20261022.test.ts`. Expected: FAIL on the four fade or level sentences and the manifest case.
- [ ] Step 3: Implement `FADE` and `governsHurdle`.
- [ ] Step 4: Run the same file plus `tests/stageB.excessReturnPayoutFade.audit20261022.test.ts tests/stageB.excessReturnStart.audit20261022.test.ts`. Expected: PASS.
- [ ] Step 5: Benefit check. Run `returnPathLanguageManifestEntries(judgeOutput, stageB)` from the replay harness over stored #43 to #50, with each run's judge output and its replayed Stage B. Any return-path manifest entry that disappears must be a fade sentence; list it. No new entry may appear. None of these five runs is on the excess-return route, so zero entries before and after is the expected result. The synthetic tests are the proof.
- [ ] Step 6: Docs. METHODOLOGY.md, C-11 paragraph (about lines 1563-1576): "A sentence that describes returns fading, converging or declining toward the cost of equity is not recovery language, even after an earlier rise."
- [ ] Step 7: Commit with `git add tests/stageC.excessReturnVisibility.audit20261022.test.ts src/pipeline/stageC/returnPathLanguage.ts docs/METHODOLOGY.md` and the message "Do not flag a described fade toward the cost of equity as recovery language (AI-104)".

### Task 15: An initial or honorific does not open a rating sentence (AI-111; OD-5)

**Files:**
- Modify: `src/report/schema.ts:256-259` (`noBuySellHold`). Add a private `maskNamePeriods(text)` beside it. RATING_PATTERNS (:218-253), including the sentence-initial pattern at :251, are not changed.
- Test: `tests/report.schema.test.ts` (near the `noBuySellHold` tests at :540-556).

**Interfaces:**
- Consumes: `noBuySellHold(text): boolean`.
- Produces: no signature change. `noBuySellHold` tests RATING_PATTERNS against `maskNamePeriods(text)`. The patterns themselves carry the `i` flag; the masking regexes are case-sensitive, which is why the exception lives in a mask and not in a lookbehind. The mask deletes a period in two cases:
  - **Name initial.** `/\b([A-Z][a-z]+\s+(?:[A-Z]\.\s+)*[A-Z])\.(?=\s+(?:Buy|Sell|Hold)(?:\s*[—–,(]|['’]s\b))/g` is replaced with `"$1"`. Only a rating-word surname set off by a dash, comma, parenthesis or possessive is unmasked. A rating word that is the whole sentence ("Class B. Hold.") or one followed by another word ("Plan B. Buy before earnings.") keeps its period and stays caught.
  - **Listed honorific.** `/\b(Mr|Ms|Mrs|Mx|Dr|Prof|Rev|Hon|Sen|Rep|Gov|Gen|Col|Capt|Lt)\.(?=\s+[A-Z])(?!\s+(?:Strong\s+)?(?:Buy|Sell|Hold)\s*(?:[.!?]|$))/g` is replaced with `"$1"`. St, Jr and Sr are not listed (OD-5).

  The honorific's `(?!…)` keeps a rating word that is a whole sentence ("We met Ms. Hold.") caught. Both regexes are linear: each `\s+` is followed by a required capital letter or a literal, so no two loops can split one run.

**Steps:**
- [ ] Step 1: Write the failing tests.
  - `noBuySellHold` is `true` for each of these (fail at HEAD):
    - "William J. Hold — Chief Scientist & Senior Vice President of Research.";
    - "Mary B. Hold — Chief Financial Officer.";
    - "Ms. Hold said gross margin expanded.";
    - "Dr. Sell leads the research group.";
    - "Mr. Buy joined the board in 2021.".
  - It is `false` for each of these (controls that stay caught):
    - "Sell the stock.";
    - "We rate it a Buy.";
    - "Margins held. Hold.";
    - "Strong Buy";
    - "Revenue grew. Buy before earnings.";
    - "Class B. Hold." (the initial mask needs a dash, comma, parenthesis or possessive after the rating word);
    - "Plan B. Buy before earnings." and "Plan B. Buy NVDA now." (the same rule; both caught at HEAD, review check for the first);
    - "on Main St. Buy before earnings." (St is not a listed honorific);
    - "William J. Hold said margins expanded." This is documented as fail-closed: an initial's surname followed by a plain word is still read as a rating;
    - "We met Ms. Hold." This is documented as fail-closed: a bare rating word ending a sentence after an honorific is still read as a rating;
    - "Demand rose in the U.S. Buy the dip." (also caught by the "buy the dip" directive pattern).
  - "Mary Hold — Chief Financial Officer." and "Susan J. Li — Chief Financial Officer." are `true` (controls, true at HEAD).
  - "William J. Hold, the CTO, said margins expanded." and "William J. Hold's team leads research." are `true` (fail at HEAD).
  - `ReportSchema.safeParse` of the file's valid report with " Ms. Hold said margins expanded." appended to `verdict.synthesis` succeeds (fails at HEAD, as the AI-111 probe showed for #50).
- [ ] Step 2: Run `npx vitest run --config vitest.config.ts tests/report.schema.test.ts -t "rating"`. Expected: FAIL on the seven name cases and the parse case. Every `false` control passes at HEAD (each is caught at HEAD) and must still pass.
- [ ] Step 3: Implement `maskNamePeriods` and use it in `noBuySellHold`.
- [ ] Step 4: Run `npx vitest run --config vitest.config.ts tests/report.schema.test.ts tests/report.versionStamps.test.ts tests/stageC.judgeProtocol.test.ts`. Expected: PASS.
- [ ] Step 5: Benefit check. The replay's `schemaParse` over every stored report is unchanged: no stored report starts or stops parsing. Record the rating-pattern hit counts per report, before and after; they must be equal for every stored report.
- [ ] Step 6: Docs. METHODOLOGY.md, the no-recommendation text at about line 2817 ("buy, sell or hold recommendation"): "The gate reads a rating word at a sentence start. A period after a listed honorific (Mr, Ms, Dr, …) does not start a sentence unless the rating word is the whole sentence. A period after a single initial does not start one only when the rating word is a surname set off by a dash, comma, parenthesis or possessive ('William J. Hold — Chief Scientist'). Anything else stays caught."
- [ ] Step 7: Commit with `git add tests/report.schema.test.ts src/report/schema.ts docs/METHODOLOGY.md` and the message "Let a surname after an initial or honorific pass the rating gate (AI-111)".

### Task 16: A comparison base binds only a comparison base; the end of a "<direction word> from $A … to $B" move takes the move's metric (AI-503, AI-503-V1, AI-503-V2)

**Files:**
- Modify `src/pipeline/stageC/claimEvidence.ts`:
  - :99, `Context` gains `base: boolean`;
  - :189-223, `context()` sets `base` on claim and source text alike;
  - beside `COMPARATIVE_LEAD` (:477), add `COMPARISON_BASE_LEAD` and `moveHead`;
  - :604-622, a table cell's context sets `base: false`;
  - :624-638, the prose branch of `sourceBindings` (its `found.map` gains the index): a base binding inherits no excerpt period, and a move's end figure takes the move's head;
  - :752, the excerpt candidate filter compares `base`.
- Test: `tests/stageC.claimEvidence.comparisonBase.test.ts` (new).

**Interfaces:**
- Consumes:
  - `context()` and `sourceBindings`;
  - Task 9's `Context.own` (the figure's own description) and its two cuts. If Task 9 inlined them, factor them into `ownAfter(text, quantity, all, clauseEnd): string` and `ownBeforeStart(text, quantity, all, clauseStart): number` with no change in behaviour;
  - the committed fixtures `fixtures/edgar/nvda-current-reports/q2fy27-ex99-2.txt` (NVIDIA CFO commentary, Q2 FY2027) and `fixtures/edgar/nvda-periodic-sections/nvda-10q-q2fy27-item2.txt` (10-Q MD&A).
- Produces:
  - `const COMPARISON_BASE_LEAD = /\b(?:from|compared\s+(?:with|to)|versus|vs\.?|against)\s*$/i;`
  - `Context.base` = `COMPARISON_BASE_LEAD.test(text.slice(Math.max(0, quantity.start - 24), quantity.start))`. A figure the text introduces with "from", "compared with/to", "versus", "vs." or "against" is a comparison base. The test reads the raw text before the figure, not the clause: `context()` can start a clause at a "versus" connector, and the figure would then have nothing before it. A figure's start already includes its currency prefix, so "from $ 119 billion" (the 10-Q notes' spaced dollar) and "from USD 25.8 billion" are both bases.
  - `function moveHead(text: string, previous: Quantity, current: Quantity, all: readonly Quantity[], clause: { start: number; end: number }): string | null`. It returns `text.slice(ownBeforeStart(text, previous, all, clause.start), fromAt)`, where `fromAt` is the start of the "from" word just before `previous`, when all three of these hold; otherwise null. The head starts where Task 9 starts `previous`'s own description (the latest of the clause start, the preceding figure's end, and the last unclosed `(` or the last `:` or `;`), so a lead-in such as "Balance sheet:" is not made part of the move's metric (row 32):
    1. the 24 characters before `previous.start` end with `/\bfrom\s*$/i`;
    2. both figures lie inside `clause`;
    3. `text.slice(previous.end, current.start)` matches `/^[^\d$€£¥;•\n]*\bto\s*$/i`, so `current` is the next figure and "to" introduces it.
  - Bindings, in the prose branch of `sourceBindings`:
    - A binding whose `context.base` is true gets `inherited: []`: a comparison base never takes the excerpt's reporting period.
    - A binding is the move's end when `index > 0`, `head = moveHead(body.text, found[index - 1], quantity, found, own)` is not null, and the previous figure's source context direction (`context(body.text, found[index - 1], found, true).direction`, call it `start`) is not null. In other words, a DIRECTION_WORDS word governs "from $A".
    - Then ``own.label = `${head} ${own.label}` ``, ``own.own = `${head} ${ownAfter(…)}` `` and `own.direction = { ...start, relation: "level" }`. The words between $A and "to" ("last quarter", "a year ago") describe $A, not the end figure.
    - The head is not given when no direction word governs "from": a range ("expected to range from $4.0 billion to $4.2 billion"), a verb outside DIRECTION_WORDS ("went", "improved"), or a direction word beyond DIRECTION_WINDOW_CHARS (the 10-Q's "significantly increased our supply and capacity commitments from", 42 characters). Then the end figure keeps HEAD's label and binds nothing that names the metric. The base rule still keeps $A out of every level claim, so none of these is contradicted or validated through $A.
  - Excerpt candidate filter (:752): a binding is a candidate only when `binding.context.base === own.base` (the claim figure's own `base`) and `excerptNamesMetric(…)` holds.
    - On the claim side, "Inventory increased from USD 25.8 billion" is a base and binds only a source base (AI-503-V2).
    - On the source side, "$119 billion" in "increased from $119 billion … to $279 billion" binds no level claim (AI-503, AI-503-V1).
  - Not changed:
    - the record path: a claim figure after "<direction word> from" already reads `relation: "level"`, and the record gate (:710) leaves it unchecked;
    - `quantityDirection`, DELTA_BREAKERS and DIRECTION_WINDOW_CHARS;
    - `levelBeforeComparison` (D-63's ", up from");
    - table cells;
    - the consistency direction check.

**Steps:**
- [ ] Step 1: Write the failing test.
  - Helpers: `ex(text, title, source = "edgar:10-Q item2", asOf = "2026-07-26")` builds a `TextExcerpt`. `onExcerpt(claim, excerpt, ignoreWords = [])` returns `validateClaimNumericSupport({ label: "FACT", text: claim, source: excerpt.source, asOf: excerpt.asOf }, { excerpts: [excerpt], sourceId: excerpt.source, reportingCurrency: "USD", ignoreWords }).status`.
  - Fixture text is read with `readFileSync`, whitespace-normalized and cut from its first to its last quoted words. Each test asserts the sentence occurs exactly once.
  - The excerpts:
    - `CFO`: "Our commitments increased from $119 billion last quarter to $279 billion, primarily related to the procurement of memory." from `q2fy27-ex99-2.txt`, as `edgar:8-K EX-99.2`, as-of 2026-08-26, titled with the stored title "8-K EX-99.2 — CFO commentary, Q2 FY2027, quarter ended 2026-07-26 (8-K 0001045810-26-000073; filed 2026-08-26)".
    - `MDA`: "We have significantly increased our supply and capacity commitments from $119 billion last quarter to $279 billion as of July 26, 2026 to meet future demand." from `nvda-10q-q2fy27-item2.txt`, as `edgar:10-Q item2`, as-of 2026-07-26, title "10-Q Item 2 — MD&A (10-Q 0001045810-26-000075; reporting period ended 2026-07-26 (Q2 FY2027); filed 2026-08-26)".
    - Every synthetic excerpt uses `T = "10-Q Part I Item 2 — MD&A (reporting period ended 2026-07-26 (Q2 FY2027))"`.
  - The table gives three statuses for each case:
    - **HEAD** is from the scratch check of 2026-10-28 (`tmp/audit-2026-10-27/plans/B2-r4-review/r4.review.out.txt`, `r4b.review.out.txt`), which matches the probe logs where they overlap.
    - **After T15** is what Tasks 1 to 15 leave. Task 9's own description already rejects $A where a content word ("last", "ago", "significantly", "went", "improved") sits in it.
    - **Target** is the assertion.

  | # | Excerpt | Claim | HEAD | After T15 | Target |
  |---|---|---|---|---|---|
  | 1 | CFO | "Our commitments increased to USD 279 billion." | contradicted | unchecked | `validated` |
  | 2 | CFO (`ignoreWords: ["NVIDIA"]`) | "NVIDIA's commitments rose to USD 279 billion." | contradicted | unchecked | `validated` |
  | 3 | CFO | "Commitments increased to USD 279 billion in Q2 FY2027." | contradicted | unchecked | `validated` |
  | 4 | CFO | "Our commitments increased to USD 119 billion." | validated | unchecked | `contradicted` (a value conflict with the move's end) |
  | 5 | CFO | "Our commitments were USD 279 billion." | unchecked | unchecked | `unchecked` (control: a plain level against "increased … to $B" stays unchecked, as for to-first sources at HEAD) |
  | 6 | CFO | "Our commitments increased from USD 119 billion." | validated | unchecked | not `contradicted` ($A's own description holds "last") |
  | 7 | `ex("Our commitments increased from $ 119 billion last quarter to $ 279 billion, primarily related to the procurement of memory.", CFO title, "edgar:8-K EX-99.2", "2026-08-26")` | "Our commitments increased to USD 279 billion." | contradicted | unchecked | `validated` (Review Focus 6: spaced dollar) |
  | 8 | MDA | "Supply and capacity commitments as of 2026-07-26 were USD 279 billion." | contradicted | unchecked | `unchecked` (no head: "increased" is 42 characters from $119) |
  | 9 | MDA | "Supply and capacity commitments were USD 279 billion as of July 26, 2026." | contradicted | unchecked | `unchecked` |
  | 10 | MDA | "Supply and capacity commitments as of 2026-07-26 were USD 119 billion." | validated | unchecked | `unchecked` |
  | 11 | `ex("Inventory increased from $25.8 billion in the prior quarter to $31.6 billion, reflecting new product ramps.", T)` | "Inventory increased to USD 31.6 billion." | contradicted | contradicted | `validated` |
  | 12 | same | "Inventory increased to USD 25.8 billion." | validated | validated | `contradicted` |
  | 13 | same | "Inventory increased from USD 25.8 billion." | validated | validated | `validated` (control: a base claim binds the base) |
  | 14 | `ex("Our commitments increased from $119 billion at the end of the first quarter to $279 billion, primarily related to the procurement of memory.", T)` | "Our commitments increased to USD 279 billion." | contradicted | contradicted | `validated` |
  | 15 | same | "Our commitments increased to USD 119 billion." | validated | validated | `contradicted` |
  | 16 | `ex("Gross margin: from 72.7% in the prior quarter to 75.1% in the current quarter.", T)` | "Gross margin was 75.1%." | contradicted | contradicted | `unchecked` (AI-503-V1 mechanism: no direction word, $A's own description empty after the colon) |
  | 17 | same | "Gross margin was 72.7%." | validated | validated | `unchecked` |
  | 18 | `ex("Inventory increased from $25.8 billion to $31.6 billion, reflecting new product ramps.", T)` | "Inventory increased to USD 31.6 billion." | unchecked (text-ambiguous) | unchecked | `validated` |
  | 19 | same | "Inventory increased to USD 25.8 billion." | unchecked (text-ambiguous) | unchecked | `contradicted` |
  | 20 | `ex("Inventory increased from $25.8 billion a year ago to $31.6 billion, reflecting new product ramps.", T)` (the probe's pair) | "Inventory increased to USD 31.6 billion." | contradicted | unchecked | `validated` |
  | 21 | same | "Inventory increased to USD 25.8 billion." | validated | unchecked | `contradicted` |
  | 22 | `ex("Inventory went from $25.8 billion a year ago to $31.6 billion, reflecting new product ramps.", T)` | "Inventory was USD 31.6 billion." / "Inventory was USD 25.8 billion." | contradicted / validated | unchecked / unchecked | `unchecked` / `unchecked` |
  | 23 | `ex("Gross margin improved from 72.7% a year ago to 75.1%, reflecting a favorable mix.", T)` | "Gross margin was 75.1%." / "Gross margin was 72.7%." | contradicted / validated | unchecked / unchecked | `unchecked` / `unchecked` |
  | 24 | `ex("Inventory increased to $31.6 billion from $25.8 billion a year ago, reflecting new product ramps.", T)` | "Inventory increased from USD 25.8 billion." | contradicted | contradicted | `unchecked` (AI-503-V2) |
  | 25 | same | "Inventory increased from USD 31.6 billion." | validated | validated | `unchecked` |
  | 26 | same | "Inventory increased to USD 31.6 billion." / "Inventory was USD 31.6 billion." | validated / unchecked | validated / unchecked | `validated` / `unchecked` (controls: to-first) |
  | 27 | `ex("Inventory increased to $31.6 billion, compared with $25.8 billion a year ago.", T)` | "Inventory increased from USD 25.8 billion." / "Inventory increased to USD 31.6 billion." | contradicted / validated | contradicted / validated | `unchecked` / `validated` |
  | 28 | `ex("• Operating income increased to $27.5 billion in the second quarter, compared with $19.2 billion in second quarter 2025. •", "8-K EX-99.1 - earnings release, quarter ended 2026-06-30 (8-K 0001018724-26-000024; filed 2026-07-30)", "edgar:8-K EX-99.1", "2026-07-30")` (a short quotation of Amazon's public Q2 2026 EX-99.1) | "Operating income increased from USD 19.2 billion in second quarter 2025." / "Operating income increased from USD 27.5 billion in second quarter 2025." | contradicted / validated | contradicted / validated (both unchecked if B1's Task 6 has merged) | not `contradicted` / not `validated` |
  | 29 | `ex("Operating expenses are expected to range from $4.0 billion to $4.2 billion.", T)` | "Operating expenses are expected to be USD 4.0 billion." / "… USD 4.2 billion." | unchecked / unchecked | unchecked / unchecked | not `validated` / not `validated` (Review Focus 6: range) |
  | 30 | `ex("Operating income increased from $19.2 billion in Q2 2025 to $27.5 billion in Q2 2026, and increased from $37.6 billion for the six months ended June 30, 2025 to $51.3 billion for the six months ended June 30, 2026.", T)` (Amazon 10-Q MD&A shape) | "Operating income increased to USD 27.5 billion in Q2 2026." / "Operating income increased to USD 19.2 billion in Q2 2026." | unchecked / unchecked | unchecked / unchecked | not `contradicted` / not `validated` (B1's comparison-base periods may later validate the first) |
  | 31 | `ex("Proceeds from $5.0 billion of senior notes were used to repay debt.", T)` | "Proceeds were USD 5.0 billion." | validated | unchecked | `unchecked` (Review Focus 6: a source "from"; Task 9 already rejects it) |
  | 32 | `ex("Balance sheet: inventory increased from $25.8 billion in the prior quarter to $31.6 billion.", T)` | "Inventory increased to USD 31.6 billion." / "Inventory increased to USD 25.8 billion." | contradicted / validated | contradicted / validated | `validated` / `contradicted` (the head starts after the colon, as `previous`'s own description does) |
  | 33 | `ex("Our commitments increased from $119 billion last quarter to $279 billion as of July 26, 2026.", T)` (the AI-503-V1 probe's adjacent-verb control) | "Our commitments increased to USD 279 billion as of July 26, 2026." / "Our commitments were USD 279 billion as of July 26, 2026." | contradicted / unchecked | unchecked / unchecked | `validated` / `unchecked` (a dated move end; needs Task 9's date-safe after-side cut) |

  - Unit checks on the new field, through the exported test seam `readContextForTests` (an alias of `context` exported for tests, as Task 2 did with `readProseQuantities`). With `const q = readProseQuantities(text)`:
    - on CFO's text, `readContextForTests(text, q[0], q, true).base` ($119) is `true` and `readContextForTests(text, q[1], q, true).base` ($279) is `false`;
    - on row 24's text, `q[1]` ($25.8) is `true` and `q[0]` ($31.6) is `false`;
    - on the claim "Inventory increased from USD 25.8 billion.", `readContextForTests(claim, q[0], q).base` is `true`, and on "Inventory increased to USD 25.8 billion." it is `false`.
  - D-63 control: Task 9's "Inventory was USD 31.6 billion." on the fixture's "Inventory was $31.6 billion, up from $25.8 billion sequentially, …" stays `validated`. Step 4 reruns that file.
- [ ] Step 2: Run `npx vitest run --config vitest.config.ts tests/stageC.claimEvidence.comparisonBase.test.ts`.
  - Expected FAIL on rows 1-4, 7, 11, 12, 14-21, 24, 25, 27 (first claim), 32 (both claims) and 33 (first claim). Row 28 fails too, unless B1's Task 6 has merged. HEAD statuses of rows 32 and 33 come from the round-4 review's scratch check (`tmp/audit-2026-10-27/plans/B2-r4-rereview/rr.review.out.txt`) and the AI-503-V1 probe log.
  - The new-field checks fail too (`readContextForTests is not a function`).
  - The remaining rows already hold on the branch, because Task 9 rejects $A for its own-description words. They are regression assertions.
  - A row whose After-T15 status differs from the table means Task 9 behaves differently from this plan. Stop and reconcile before Step 3.
- [ ] Step 3: Implement `COMPARISON_BASE_LEAD`, `Context.base`, `moveHead`, the two binding rules and the candidate filter. Update the D-63 comment at :456-464 with one sentence: a comparison base binds only a comparison base, and a move's end takes the move's head (D-next, AI-503).
- [ ] Step 4: Run `npx vitest run --config vitest.config.ts tests/stageC.claimEvidence.comparisonBase.test.ts tests/stageC.claimEvidence.ownDescription.test.ts tests/stageC.claimEvidence.d66.test.ts tests/stageC.claimEvidence.bounds.test.ts tests/stageC.claimEvidence.tokens.test.ts tests/stageC.excerptCurrencyScale.test.ts tests/stageC.excerptNumbers.test.ts tests/stageC.factualValidation.test.ts tests/stageC.verifyChecks.test.ts`. Expected: PASS. Tasks 6 and 7's direction pairs (including ", up from" and "increased to … from") and Task 9's controls must be unchanged. If B1 has merged, add `tests/stageC.claimPeriods.audit20261027.test.ts`.
- [ ] Step 5: Benefit check. Replay `t16`.
  - `r4-claims.json`, rows for AI-503, AI-503-V1 and AI-503-V2:
    - every true claim the probes found contradicted is now `validated` or `unchecked`;
    - every start-as-level claim they found validated is now `unchecked` or `contradicted`;
    - the probes' fail-closed controls (no date, "in Q2 FY2027" period-mismatch, the bare form, to-first) hold.
  - Stored rows: the variant scan found no stored validated or contradicted entry bound to a from/to span, so expect zero moves on #43 to #50. Any moved row must be bound to a span with "from <figure>", "compared with <figure>", "versus <figure>" or "against <figure>":
    - a move toward `validated` must be a move end whose claim names the head, with matching direction;
    - a move toward `contradicted` must be a value conflict with a move end;
    - list each one. Any other move stops the task.
- [ ] Step 6: Docs. METHODOLOGY.md, after Task 9's paragraph "A figure is read with its own description", add: "A figure the source introduces with 'from', 'compared with', 'versus' or 'against' is a comparison base: it supports only a claim figure introduced the same way, and it does not take the excerpt's reporting period. In '<metric> increased from $A … to $B' the metric and the direction belong to $B, so 'commitments increased to USD 279 billion' is read against $279 billion, not the $119 billion the move started from. When no direction word governs 'from' (a range, 'went from', a verb far from the figure), $B is not given the metric and the claim stays unverified."
- [ ] Step 7: Commit with `git add tests/stageC.claimEvidence.comparisonBase.test.ts src/pipeline/stageC/claimEvidence.ts docs/METHODOLOGY.md` and the message "Read a comparison base as the base and give a move's end its metric (AI-503, AI-503-V1, AI-503-V2)".

### Task 17: A direction word in a record's own label is part of its metric (AI-501)

**Files:**
- Modify `src/pipeline/stageC/claimEvidence.ts`:
  - :281-306, `metricTokens` gains an options argument. If B1 has merged, add the field to B1's `{ loose?: boolean }` object;
  - :673-676, the record path's metric test.
- Test: `tests/stageC.claimEvidence.recordMetric.test.ts` (new; Tasks 18 and 19 extend it).

**Interfaces:**
- Consumes: `metricTokens`, `namesMetric`, `labelReadings`, `own.direction` (the claim figure's attached direction, computed before the metric test).
- Produces:
  - `metricTokens(label: string, ignore: readonly string[], options?: { keepDirectionWords?: boolean }): string[]`. With `keepDirectionWords: true`, the `findDirectionWords` hits are not added to `ignored`, and nothing else changes. The default (false) is HEAD's reading. Every other call site keeps it: excerpt labels, excerpt-path claim labels, Task 9's own descriptions and Task 10's printed descriptions.
  - Record path: the record's words are read with `keepDirectionWords: true`, and the claim is read twice:
    ```ts
    const recordWords = (label: string) => perShare(unestablished(metricTokens(`${label} ${record.period ?? ""}`, ignore, { keepDirectionWords: true })));
    const claimKept = perShare(unestablished(metricTokens(own.label, ignore, { keepDirectionWords: true })).filter(notEstablishedYoy));
    // claimTokens is HEAD's reading, with direction words removed
    const named = labels.some((label) => namesMetric(claimKept, recordWords(label)) ||
      (own.direction !== null && namesMetric(claimTokens, recordWords(label))));
    ```
    `notEstablishedYoy` is HEAD's existing `yoy` filter, unchanged.
  - The reading with direction words removed is admitted only when a direction word is attached to the figure. Only then is that word the claim's relation, which the direction gate at :710 reads, and not part of its metric. With no attached direction, a direction word in the claim ("the increase in goodwill …", 45 characters from its figure) is a metric word like any other. A direction word in a record's label ("increase in goodwill and other intangible assets", "… margin expansion … guidance midpoint", "net gains from equity securities") always is.
  - Not changed: `namesMetric`, `isDeltaRecord`, the direction gate, the excerpt path. A change claim against an "increase in …" row ("rose USD 18.14 billion") stays unchecked, as at HEAD. Validating it would need the record read as a signed change of its own noun. That is a recall residual recorded in Task 26.

**Steps:**
- [ ] Step 1: Write the failing test.
  - Helpers: `record` and `check` as in tests/stageC.claimEvidence.d66.test.ts:13-20, with `ignoreWords: ["NVIDIA Corporation", "NVDA", "NVIDIA"]` and `reportingCurrency: "USD"`.
  - Records, each with its producer's label (payload.ts:917-930, :2245, :2447, :2165):
    - `INC = record({ id: "computed.forensics.increase-in-goodwill-and-other-intangible-assets", label: "increase in goodwill and other intangible assets", value: 18_143_000_000, unit: "currency", currency: "USD", period: "2026-01-25", asOf: "2026-01-25" })`. These are #50's values from the AI-501 probe log; the same row's goodwill alone is 20,832,000,000;
    - `ALIAS = { ...INC, id: "computed.forensics.accruals.acquiredGoodwillAndIntangibles" }`;
    - `SHARE = record({ id: "computed.forensics.goodwill-and-intangibles-increase-as-a-share-of-the-net-operating-asset-increase", label: "goodwill and intangibles increase as a share of the net-operating-asset increase", value: 44.361582473470584, unit: "percent", period: "2026-01-25", asOf: "2026-01-25" })`;
    - `GAINS = record({ id: "payload.quarterly-trend.net-gains-from-equity-securities-quarter-ended-2026-07-26", label: "net gains from equity securities, quarter ended 2026-07-26", value: 2_100_000_000, unit: "currency", currency: "USD", period: "2026-07-26", asOf: "2026-07-26" })`;
    - `EXP = record({ id: "payload.issuer-filings.q3-2026-adjusted-ebitda-margin-expansion-non-gaap-guidance-midpoint", label: "Q3 2026 adjusted EBITDA margin expansion (non-GAAP) guidance midpoint", value: 1.625, unit: "percentage-points", period: "Q3 2026", asOf: "2026-08-06" })`;
    - `DIV = record({ id: "payload.issuer-filings.quarterly-cash-dividend-per-share-before-the-increase", label: "quarterly cash dividend per share before the increase", value: 0.01, unit: "currency-per-share", currency: "USD", asOf: "2026-08-26" })`.
  - Defects. Each is `"validated"` at HEAD (scratch check 2026-10-28, matching the AI-501 probe log). Each must give `"unchecked"`:
    - INC "Goodwill and other intangible assets as of 2026-01-25 were USD 18.14 billion.";
    - INC "Goodwill and other intangible assets were USD 18.14 billion.";
    - ALIAS "Goodwill and other intangible assets as of 2026-01-25 were USD 18.14 billion.";
    - SHARE "Goodwill and intangibles as a share of net operating assets as of 2026-01-25 was 44.36%.";
    - GAINS "Net equity securities for the quarter ended 2026-07-26 were USD 2.1 billion." The claim omits the label's "gains" (Review Focus 7).
  - Controls, which keep their HEAD status:
    - INC "The increase in goodwill and other intangible assets as of 2026-01-25 was USD 18.14 billion." and "The increase in goodwill and other intangible assets was USD 18.14 billion." are `validated`;
    - INC "Goodwill and other intangible assets rose USD 18.14 billion.", "… increased by USD 18.14 billion." and "… fell USD 18.14 billion." are `unchecked`, never contradicted;
    - SHARE "The goodwill and intangibles increase as a share of the net-operating-asset increase was 44.36%." and "Goodwill and intangibles were 44.36% of the increase in net operating assets." are `unchecked`;
    - GAINS "Net gains from equity securities for the quarter ended 2026-07-26 were USD 2.1 billion." and "… in the quarter ended 2026-07-26 were USD 2.1 billion." are `validated`, and "Net gains were USD 2.1 billion." is `unchecked`;
    - EXP "Q3 2026 non-GAAP adjusted EBITDA margin expansion guidance midpoint is 1.625 percentage points." is `validated`. "expansion" is the claim's attached direction and a label word; the kept reading matches it;
    - DIV "The quarterly cash dividend per share before the increase was USD 0.01." and "Before the increase, the quarterly cash dividend was USD 0.01 per share." are `unchecked`.
  - tests/stageC.claimEvidence.d66.test.ts passes unedited.
- [ ] Step 2: Run `npx vitest run --config vitest.config.ts tests/stageC.claimEvidence.recordMetric.test.ts -t "AI-501"`. Expected: FAIL on the five defects (`expected 'validated' to be 'unchecked'`). The controls pass.
- [ ] Step 3: Implement the option and the two-reading test. Correct the `metricTokens` comment: direction words are ignored for claim text, never for a record's own label.
- [ ] Step 4: Run `npx vitest run --config vitest.config.ts tests/stageC.claimEvidence.recordMetric.test.ts tests/stageC.claimEvidence.d66.test.ts tests/stageC.claimEvidence.perShareLabel.test.ts tests/stageC.claimEvidence.fraction.test.ts tests/stageC.claimEvidence.isoRange.test.ts tests/stageC.claimEvidence.ownDescription.test.ts tests/stageC.tracedNumberDescription.test.ts tests/stageC.factualValidation.test.ts tests/stageC.verifyChecks.test.ts tests/stageC.metricContext.test.ts`. Expected: PASS. `tests/stageC.metricContext.test.ts` replays the saved NVDA claims against their real records (the lock-up row, relative strength vs SPY, the say-on-pay formula) and must pass unedited. If an existing test fails, name the direction word that moved it: a word in the record's label that the claim leaves out is this task's intended change only when it changes the quantity (as "increase" and "gains" do); otherwise stop and report it, never edit the test.
- [ ] Step 5: Benefit check. Replay `t17`.
  - `r4-claims.json` (AI-501): the three level claims and the share-of-level claim move from validated to unchecked. The noun-form "The increase in …" claim stays validated, and the change claims stay unchecked.
  - Stored rows: first list every registry label containing a DIRECTION_WORDS entry, across the five rebuilt registries, with a one-off scan in the harness. Then every moved row:
    - a validated-to-unchecked move must be a claim that omits a direction word of its record's label;
    - any other move stops the task.
  - The AI-501 scan found no stored validated claim of the D-68 shape, so zero stored moves is the expected result.
- [ ] Step 6: Docs. METHODOLOGY.md, the typed-record sentence at about line 2831 ("A typed record's metric is its registry label, …"): "A direction word in the record's own label ('increase in goodwill and other intangible assets', 'margin expansion') is part of its metric, so a claim must name it; a direction word attached to the claim's own figure is read as the claim's direction instead."
- [ ] Step 7: Commit with `git add tests/stageC.claimEvidence.recordMetric.test.ts src/pipeline/stageC/claimEvidence.ts docs/METHODOLOGY.md` and the message "Read a direction word in a record's label as part of its metric (AI-501)".

### Task 18: A difference's or ratio's operands are read in order (AI-504)

**Files:**
- Modify `src/pipeline/stageC/consistency.ts`: add the export `labelOperands` beside `isDeltaRecord` (:664). It lives here because claimEvidence.ts already imports from consistency.ts, and Task 19's `isDeltaRecord` reads it.
- Modify `src/pipeline/stageC/claimEvidence.ts`: the record path (:673-676), after Task 17's metric test, gets the order test and a private `operandsInOrder`.
- Test: `tests/stageC.claimEvidence.recordMetric.test.ts` (extend: `describe("AI-504 operand order")`).

**Interfaces:**
- Consumes: `metricTokens` (first-occurrence order is kept by its `Set`), Task 17's claim readings, `labelReadings`.
- Produces:
  - `export interface LabelOperands { left: string; right: string; kind: "difference" | "ratio" }`.
  - `export function labelOperands(label: string): LabelOperands | null`. It reads `record.label` or one of its `labelReadings` forms, never the `${label} ${record.period}` string the metric test reads.
    - It first normalizes the label: a camelCase split (`([a-z])([A-Z])` → `$1 $2`), `\bP\s*\/\s*E\b` → `pe`, a comparison basis (`\b(?:year|quarter)[\s‐‑–—-]+over[\s‐‑–—-]+(?:year|quarter)\b`, the `COMPARISON_BASIS` pattern) → `yoy` / `qoq`, and the hyphen variants `[‐‑]` → `-`. An em dash (`—`) is a parenthetical dash, never an operator, so it is left as it is ("FCF conversion (latest, before SBC — the graded ratio)", payload.ts:753; a peer row "AMD — Advanced Micro Devices, Inc.", payload.ts:1660). "Year over year" names a growth's basis, not two operands ("revenue growth year over year, quarter ended …", payload.ts:2466).
    - It returns null when the label begins with "absolute " (|a − b| has no operand order).
    - Otherwise it splits at the first operator. Every operator pattern is case-insensitive (the camelCase split leaves "price To Book"):
      - difference operators: `\s+[−–]\s+`, `(?<=[A-Za-z)])\s+-\s+(?=[A-Za-z(])`, and `(?<=[A-Za-z)])\s+(?:minus|vs\.?|versus|over)\s+(?=[A-Za-z(])`;
      - ratio operators: `(?<=[A-Za-z&)])\s*\/\s*(?=[A-Za-z(])` and `(?<=[A-Za-z)])(?<!\b(?:attributable|related|relating|due|prior|subject|up|according))\s+to\s+(?=[A-Za-z(])`. The closed list keeps a grammatical "to" out ("investments subject to short-term lock-up restrictions as of …", src/edgar/filingFacts.ts:172, a row of the frozen NVDA metric-context fixture).
    - The lookarounds keep these out: a "to" between two dates ("…, 2025-07-27 to 2026-07-26"), a hyphen inside a word ("non-GAAP", "year-one"), and the "×" of grid labels.
  - `function operandsInOrder(claimWords: readonly string[], operands: LabelOperands, ignore: readonly string[]): boolean`.
    - Let `L = metricTokens(operands.left, ignore, { keepDirectionWords: true })` and `R = metricTokens(operands.right, ignore, { keepDirectionWords: true })`, the reading Task 17 gives a record label.
    - `leftHead` is the last word of L whose stem is not in R and that is not a `window…` token. `rightHead` is the first word of R whose stem is not in L and that is not a `window…` token.
    - It returns true (no order evidence) when either head is undefined or either is absent from `claimWords` (stem match). Otherwise it returns whether `leftHead`'s first index in `claimWords` is below `rightHead`'s.
    - The window rule keeps "growth over trailing revenue" from requiring "trailing" after "growth".
  - Record path: the claim names the record when some label reading passes Task 17's metric test and, with the claim reading that matched it, `operandsInOrder` (true when the reading's `labelOperands` is null). When some reading passes the metric test but none of those passes the order test, the claim gets `support("unchecked", "text-context-mismatch", "the prose names the operands of the cited difference or ratio in the reverse order")`. That is unverified, never contradicted (F-22). When no reading passes the metric test, HEAD's metric reason stands.
  - Not changed:
    - METRIC_GRAMMAR: "minus" and "over" stay metric words in a claim, so "The WACC minus ROIC spread" stays unchecked, as at HEAD;
    - `typedClaimContext` (the say-on-pay formula guard);
    - the excerpt path;
    - Task 10's printed-description rules.
  - Deliberately not done: reading a reversed ratio against the reciprocal, or a reversed difference against the negated value. A record carries one value; computing a second figure is outside the verifier.

**Steps:**
- [ ] Step 1: Write the failing test.
  - Records, with ids and labels as #50 registers them (AI-504 probe log) or the d66 test does:
    - `SPREAD = record({ id: "computed.returns.roic-wacc-spread", label: "ROIC − WACC spread", value: 136.7591102739076, unit: "percentage-points" })`;
    - `LEV = record({ id: "computed.current-capital.net-debt-to-ebitda", label: "net debt to ebitda", value: -0.11536970973736249, unit: "ratio", period: "ttm: 2025-07-27 to 2026-07-26" })`;
    - `CAPEX = record({ id: "computed.capital-cash.capex-d-a-latest", label: "capex/D&A (latest)", value: 2.1252198381990857, unit: "ratio" })`;
    - `TIMING = record({ id: "computed.capital-cash.buyback-timing-cost-of-the-repurchased-shares-at-each-year-s-average-price-vs-cost-paid", label: "buyback timing: cost of the repurchased shares at each year's average price vs cost paid", value: 5.002643006816365, unit: "percent" })`;
    - `PB = record({ id: "computed.valuation.pricetobook-current", label: "priceToBook (current)", value: 22.8629, unit: "ratio" })`;
    - `RS = record({ id: "computed.technicals.relative-strength-vs-spy-6-month", label: "relative strength vs SPY, 6-month", value: -1.0330038719392984, unit: "percentage-points", asOf: "2026-10-15" })`;
    - `DIVG = record({ id: "computed.forensics.absolute-cash-flow-versus-balance-sheet-accrual-divergence", label: "absolute cash-flow versus balance-sheet accrual divergence", value: 4.684076975208429, unit: "percentage-points", period: "2026-01-25", asOf: "2026-01-25" })`;
    - `GROWTHOVER = record({ id: "computed.valuation.dcf-base-case-year-one-revenue-growth-over-trailing-revenue", label: "DCF base-case year-one revenue growth over trailing revenue", value: 82.1353, unit: "percent" })`.
  - Defects. Each is `"validated"` at HEAD (scratch check 2026-10-28; the first four are the AI-504 probe's cases). Each must give `"unchecked"`:
    - SPREAD "The WACC − ROIC spread was 136.76 percentage points.";
    - LEV "EBITDA to net debt for the trailing twelve months was -0.12x.";
    - CAPEX "D&A/capex (latest) was 2.13x.";
    - TIMING "Buyback timing: cost paid vs cost of the repurchased shares at each year's average price was 5.00%.";
    - PB "Current book to price was 22.86x.";
    - RS "SPY vs relative strength, 6-month was -1.03 percentage points.".
  - Controls that are `validated` at HEAD and must stay so (Review Focus 8):
    - SPREAD "The ROIC − WACC spread was 136.76 percentage points.", "The ROIC-WACC spread was 136.76 percentage points." and "The ROIC to WACC spread was 136.76 percentage points.";
    - LEV "Net debt to EBITDA for the trailing twelve months was -0.12x.", "Net debt/EBITDA for the trailing twelve months was -0.12x." and "Net debt was -0.12x EBITDA for the trailing twelve months.";
    - CAPEX "Capex/D&A (latest) was 2.13x.", "Capital expenditure to D&A (latest) was 2.13x." and "Latest capex/D&A was 2.13x.";
    - TIMING in the record's order;
    - PB "Current price to book was 22.86x.";
    - RS "Relative strength vs SPY, 6-month was -1.03 percentage points.";
    - DIVG in both orders: "The absolute cash-flow versus balance-sheet accrual divergence as of 2026-01-25 was 4.68 percentage points." and "The absolute balance-sheet versus cash-flow accrual divergence as of 2026-01-25 was 4.68 percentage points.";
    - GROWTHOVER "DCF base-case year-one revenue growth over trailing revenue is 82.1353%.";
    - `FCFC = record({ id: "computed.capital-cash.fcf-conversion-latest-before-sbc-the-graded-ratio", label: "FCF conversion (latest, before SBC — the graded ratio)", value: 0.9512, unit: "ratio" })` (payload.ts:753's label) in the label's order and in the paraphrase "The graded FCF conversion ratio before SBC (latest) was 0.95x." (both `validated` at HEAD, round-4 review scratch check). The paraphrase is what an em-dash operator would wrongly unverify;
    - `YOYG = record({ id: "computed.quarterly-trend.revenue-growth-year-over-year-quarter-ended-2026-07-26", label: "revenue growth year over year, quarter ended 2026-07-26", value: 105.8511, unit: "percent", period: "2026-07-26" })` with "Year-over-year revenue growth for the quarter ended 2026-07-26 was 105.85%." (`validated` at HEAD, scratch check).
  - Controls that are `unchecked` at HEAD and stay so: SPREAD "The WACC minus ROIC spread was 136.76 percentage points." and "The spread of ROIC over WACC was 136.76 percentage points.".
  - `labelOperands` unit checks:
    - `labelOperands("ROIC − WACC spread")` is `{ left: "ROIC", right: "WACC spread", kind: "difference" }`;
    - `labelOperands("net debt to ebitda")` is `{ left: "net debt", right: "ebitda", kind: "ratio" }`;
    - `labelOperands("capex/D&A (latest)")` is `{ left: "capex", right: "D&A (latest)", kind: "ratio" }`;
    - `labelOperands("priceToBook (current)")` is `{ left: "price", right: "Book (current)", kind: "ratio" }`;
    - `labelOperands("revenue accel (YoY − 3y CAGR)")?.kind` is `"difference"`;
    - `labelOperands("relative strength vs SPY, 6-month")?.kind` is `"difference"`;
    - it is `null` for "absolute cash-flow versus balance-sheet accrual divergence", "Q3 2026 adjusted EBITDA margin expansion (non-GAAP) guidance midpoint", "revenue weighted 12M ending 2027-06-30", "excess-return per share, start 12.0% × cost of equity 9.5%", "free cash flow, 2025-07-27 to 2026-07-26", "P/E (ttm)", "T10Y2Y (core)", "FCF conversion (latest, before SBC — the graded ratio)", "AMD — Advanced Micro Devices, Inc.", "revenue growth year over year, quarter ended 2026-07-26", "net operating asset growth in the accrual fiscal year (year over year)" and "investments subject to short-term lock-up restrictions as of 2026-07-26";
    - `labelOperands("Net Debt To EBITDA")?.kind` is `"ratio"` (case-insensitive operators).
  - The d66 say-on-pay formula case ("… measured as votes for divided by votes for, against and abstentions") stays `validated`. Step 4 reruns that file.
- [ ] Step 2: Run `npx vitest run --config vitest.config.ts tests/stageC.claimEvidence.recordMetric.test.ts -t "AI-504"`. Expected: FAIL on the six defects (`expected 'validated' to be 'unchecked'`) and on the unit checks (`labelOperands is not a function`). The controls pass.
- [ ] Step 3: Implement `labelOperands`, `operandsInOrder` and the record-path test. Comment `labelOperands` with D-66's "formula numerator/denominator … remain rejected" (DECISIONS.md:226), which ee53896 implemented only for the say-on-pay formula.
- [ ] Step 4: Run Task 17's Step 4 command (it includes `tests/stageC.metricContext.test.ts`, whose relative-strength, say-on-pay and lock-up rows carry operator words). Expected: PASS.
- [ ] Step 5: Benefit check. Replay `t18`.
  - `r4-claims.json` (AI-504): the three probe defects and the D&A/capex swap move from validated to unchecked; the record-order controls stay validated.
  - Stored rows: list every validated record-path claim whose cited record's label has `labelOperands` non-null:
    - a flip must be a reversed-order claim;
    - a flip of a record-order or paraphrase claim stops the task. Fix it with a lookaround or a head rule and a control test, never by dropping the order test.
  - #43 and #48 copy the label order (AI-504 trigger), so zero stored flips is the expected result.
- [ ] Step 6: Docs. METHODOLOGY.md, the same typed-record sentence as Task 17: "A difference or ratio record ('ROIC − WACC spread', 'net debt to EBITDA', 'capex/D&A') is named only when the claim gives its operands in the record's order; 'WACC − ROIC' or 'EBITDA to net debt' names another figure and stays unverified."
- [ ] Step 7: Commit with `git add tests/stageC.claimEvidence.recordMetric.test.ts src/pipeline/stageC/consistency.ts src/pipeline/stageC/claimEvidence.ts docs/METHODOLOGY.md` and the message "Read a difference's or ratio's operands in order (AI-504)".

### Task 19: A percentage-point record is a signed change only when it measures one (AI-502; OD-6)

**Files:**
- Modify `src/pipeline/stageC/consistency.ts:646-677`: `isDeltaRecord` and its docstring.
- Test:
  - `tests/stageC.claimEvidence.recordMetric.test.ts` (extend: `describe("AI-502 percentage-point changes")`);
  - `tests/stageC.verifyChecks.test.ts` (one pin test beside the isDeltaRecord tests at :180-207).

**Interfaces:**
- Consumes: Task 18's `labelOperands`; `runVerifyPass` (passes.ts); `completeCurrencyBundle` (tests/helpers/currencyBundle.ts:226), `runStageB` and `assembleContextPayload`, as tests/stageC.factualValidation.test.ts:343-344 builds a payload.
- Produces: `isDeltaRecord(record)` keeps its signature. The new rule:
  - `percentage-points-per-year` gives true;
  - `percentage-points` gives true only when the final id segment matches the existing change vocabulary (`/(?:^|-)(growth|cagr|change|delta|chg|yoy|qoq|expansion|contraction|revision)(?:-|$)/`) and `labelOperands(record.label ?? "")?.kind !== "difference"`. The final segment is read exactly as HEAD reads it for the slug rule (lower-cased, a numeric uniqueId suffix such as ".2" popped first), so both rules share one helper;
  - any other unit gives the slug rule, unchanged.

  The callers are unchanged and now skip these records:
  - claimEvidence.ts:710 (a direction word against a non-change record leaves the claim unchecked);
  - consistency.ts:1610 (the direction check does not run).

  The docstring loses "its unit is a change in a percentage". It states OD-6's rule and cites D-next (OD-6) and AI-502, and it keeps the F186 slug paragraph.

**Steps:**
- [ ] Step 1: Write the failing test.
  - Helper `verifyRecord(record, text, label = "FACT")`: runs `runVerifyPass(deps, { provenanceRegistry: [record], citationRegistry: [], filings: [] } as unknown as ContextPayload, { commentary: [{ label, text, source: record.id, asOf: record.asOf }] })`, with `deps.runPass` throwing. It returns:
    - `entry`: the log row with no `check`;
    - `directionRows`: the rows with `check === "direction"`;
    - `checked`: `result.checks.direction.checked`.
  - Records (ids from the stored reports and the helper payload):
    - SPREAD, DIVG and RS as in Task 18;
    - `CURVE = record({ id: "payload.macro.t10y2y-core", kind: "provider", label: "T10Y2Y (core)", value: 0.32, unit: "percentage-points", asOf: "2026-10-23" })`;
    - `GUIDE = record({ id: "payload.issuer-filings.q2-fy2027-gross-margin-gaap-actual-vs-prior-guidance-midpoint", kind: "provider", label: "Q2 FY2027 gross margin (GAAP) actual vs prior guidance midpoint", value: 0.08, unit: "percentage-points", period: "Q2 FY2027" })`;
    - `ACCEL = record({ id: "computed.growth-margins.revenue-accel-yoy-3y-cagr", label: "revenue accel (YoY − 3y CAGR)", value: 12.3, unit: "percentage-points" })`;
    - `TERM = record({ id: "computed.valuation-assumptions.terminal-excess-return-over-cost-of-equity", label: "terminal excess return over cost of equity", value: 2.5, unit: "percentage-points" })`;
    - `CHANGE = record({ id: "computed.margins.operating-margin-change", label: "operating margin change", value: -1.2, unit: "percentage-points" })`;
    - `SLOPE = record({ id: "computed.growth-margins.operating-margin-slope", label: "operating margin slope", value: 3.5409141824832013, unit: "percentage-points-per-year" })`;
    - EXP as in Task 17.
  - Defects. HEAD statuses are from the scratch check of 2026-10-28, matching the AI-502 probe log. Each must give `entry.validationStatus === "unchecked"`, `entry.reason === "text-context-mismatch"`, `directionRows.length === 0` and `checked === 0`:
    - SPREAD:
      - "The ROIC − WACC spread rose 136.76 percentage points." (HEAD: validated);
      - "… fell 136.76 percentage points." (HEAD: contradicted / direction-mismatch with a direction row);
      - "Even as ROIC declined the ROIC − WACC spread was 136.76 percentage points.", as FACT and as JUDGMENT (HEAD: contradicted, both);
      - "The ROIC − WACC spread was 136.76 percentage points higher." (HEAD: validated);
    - DIVG "… as of 2026-01-25 declined 4.68 percentage points." (HEAD: contradicted) and "… increased 4.68 percentage points." (HEAD: validated);
    - CURVE "T10Y2Y (core) rose 0.32 percentage points." (HEAD: validated) and "… fell 0.32 percentage points." (HEAD: contradicted);
    - RS "Relative strength vs SPY, 6-month fell 1.03 percentage points." (HEAD: validated);
    - ACCEL "Revenue accel (YoY − 3y CAGR) rose 12.3 percentage points." (HEAD: validated);
    - TERM "The terminal excess return over cost of equity rose 2.5 percentage points." (HEAD: validated);
    - the OD-6 alternative (a) cases, which HEAD reads correctly by accident and which become unchecked by decision (name OD-6 in the test comment):
      - RS "Relative strength vs SPY, 6-month was 1.03 percentage points lower." (HEAD: validated) and "… was 1.03 percentage points higher." (HEAD: contradicted);
      - GUIDE "Q2 FY2027 gross margin (GAAP) actual vs prior guidance midpoint was 0.08 percentage points higher." (HEAD: validated).
  - Controls, which keep their HEAD status:
    - SPREAD "The ROIC − WACC spread was 136.76 percentage points." is `validated`, and "… was -136.76 percentage points." is `contradicted` / value-mismatch (the sign is still read from the value);
    - DIVG "… was 4.68 percentage points.", CURVE "T10Y2Y (core) was 0.32 percentage points.", RS "… was -1.03 percentage points.", GUIDE "… was 0.08 percentage points.", ACCEL "… was 12.3 percentage points." and TERM "… was 2.5 percentage points." are each `validated`;
    - CHANGE "Operating margin change was down 1.2 percentage points." is `validated`, and "Operating margin expanded 120 bps." is `contradicted` with one direction row (the existing test at tests/stageC.verifyChecks.test.ts:193-199 also pins this);
    - SLOPE "The operating margin slope rose 3.54 percentage points per year." gives `checked === 1` and no failure. Its status stays `unchecked / unit-mismatch`, as at HEAD: the prose reader has no per-year unit;
    - EXP "Q3 2026 non-GAAP adjusted EBITDA margin expansion guidance midpoint is 1.625 percentage points." is `validated`;
    - `YOYCHG = record({ id: "computed.margins.gross-margin-change-yoy", label: "gross margin change year over year", value: -1.2, unit: "percentage-points" })` (synthetic; no producer registers it today): "Gross margin change year over year was down 1.2 percentage points." is `validated`, and "Gross margin change year over year rose 1.2 percentage points." is `contradicted` with one direction row (both HEAD statuses from the round-4 review scratch check). Without Task 18's comparison-basis normalization, "over" would make this change a difference and drop both verdicts.
  - `isDeltaRecord` unit assertions:
    - false for SPREAD, DIVG, `{ ...DIVG, id: "computed.forensics.accruals.divergence" }`, CURVE, RS, GUIDE, ACCEL, TERM, `record({ id: "computed.scores.quality.roicVsWaccSpread", label: undefined, value: 136.76, unit: "percentage-points" })` and the same shape for `computed.scores.valuation.reverseImpliedVsAchievable`;
    - true for SLOPE, `record({ id: "computed.scores.fundamentals.operatingMarginSlope", label: undefined, value: 3.54, unit: "percentage-points-per-year" })`, CHANGE, EXP, the existing `computed.leverage.net-debt-to-ebitda-change` record of tests/stageC.verifyChecks.test.ts:235-240, `record({ id: "computed.leverage.net-debt-to-ebitda-change", label: "net debt to EBITDA change", value: -0.4, unit: "percentage-points" })` and YOYCHG. A ratio operator does not make a change a difference, and neither does a comparison basis.
  - The pin test in tests/stageC.verifyChecks.test.ts, "every percentage-point record in the helper payload is classified (OD-6)". It builds the payload with `completeCurrencyBundle({})`. For every registry record with unit `percentage-points` or `percentage-points-per-year`, it asserts `isDeltaRecord(record) === EXPECTED[record.id]`, and fails, naming the id, when `EXPECTED[record.id]` is undefined. `EXPECTED` comes from the 2026-10-28 enumeration of that payload's 11 such rows (`tmp/audit-2026-10-27/plans/B2-r4-review/pp.review.out.txt`):
    - true: `computed.growth-margins.gross-margin-slope`, `computed.growth-margins.operating-margin-slope`, `computed.growth-margins.net-margin-slope`, `computed.capital-cash.capex-revenue-slope`, `computed.scores.fundamentals.operatingMarginSlope`;
    - false: `computed.growth-margins.revenue-accel-yoy-3y-cagr`, `computed.returns.roic-wacc-spread`, `computed.forensics.absolute-cash-flow-versus-balance-sheet-accrual-divergence`, `computed.forensics.accruals.divergence`, `computed.scores.valuation.reverseImpliedVsAchievable`, `computed.scores.quality.roicVsWaccSpread`.
- [ ] Step 2: Run `npx vitest run --config vitest.config.ts tests/stageC.claimEvidence.recordMetric.test.ts -t "AI-502"`, then `npx vitest run --config vitest.config.ts tests/stageC.verifyChecks.test.ts -t "OD-6"`. Expected: FAIL on every defect, on the ten false `isDeltaRecord` assertions (all true at HEAD) and on the pin's six false rows. The controls pass.
- [ ] Step 3: Implement the rule and rewrite the docstring.
- [ ] Step 4: Run `npx vitest run --config vitest.config.ts tests/stageC.claimEvidence.recordMetric.test.ts tests/stageC.verifyChecks.test.ts tests/stageC.factualValidation.test.ts tests/stageC.claimEvidence.d66.test.ts tests/stageC.claimEvidence.tokens.test.ts tests/stageC.metricContext.test.ts tests/stageC.payload.passes.test.ts`. Expected: PASS.
  - Task 3's 0.08 percentage-point record "gross margin actual versus prior guidance midpoint" carries no direction-word claim, so its cases do not move.
  - The existing direction tests at tests/stageC.verifyChecks.test.ts:180-260 use change-named ids and must pass unedited.
- [ ] Step 5: Benefit check. Replay `t19`.
  - `r4-claims.json` (AI-502): the four probe defects and the stray-word sentences move to unchecked, with no direction row. The level controls stay validated.
  - Stored rows: record `checks.direction` per report, base -> t19. Every moved row or count must cite a percentage-point record that Task 19 reclassified. No row may move toward validated.
  - The stored-log scan found only figure-less `cited` entries with a direction word citing these records, so zero status moves is the expected result.
  - Task 22 traces any moved DEMO direction count.
- [ ] Step 6: Docs.
  - METHODOLOGY.md, the consistency paragraph ("direction words against signed changes", about lines 2685-2691) and the F-22 paragraph (about 2693-2699): "A percentage-point record is a change only when it measures one over time: a per-year slope, or a row named as a change, an expansion or a contraction and not as 'A − B' or 'A vs B'. A spread (ROIC − WACC, the Treasury curve), a gap between two quantities on one date (relative strength vs SPY, actual vs the guidance midpoint, revenue acceleration) and an absolute difference are not; a direction word beside such a figure leaves the claim unverified, never validated or contradicted, and the figure's sign is read from its value."
  - The `isDeltaRecord` docstring.
- [ ] Step 7: Commit with `git add tests/stageC.claimEvidence.recordMetric.test.ts tests/stageC.verifyChecks.test.ts src/pipeline/stageC/consistency.ts docs/METHODOLOGY.md` and the message "Treat a percentage-point record as a change only when it measures one (AI-502)".

### Task 20: Move the version stamps and their pins

**Files:**
- Modify `src/report/schema.ts:127-139`: add the history line `// 1.45.0 (D-next): …` and set `REPORT_SPEC_VERSION = "1.45.0"`.
- Modify `src/pipeline/jobRunner.ts:526-527`: append ` stage-c-1.6.10 (D-next): issuer filings, call and releases as primary entity sources, and the judge framing that names them.` to the docstring, and set `PIPELINE_VERSION = "stage-c-1.6.10"`.
- Test: `tests/report.versionStamps.test.ts:88,94`, `tests/jobRunner.test.ts:6197,6204` and `tests/stageC.payload.passes.test.ts:2738`.

**Interfaces:**
- Consumes: the meanings changed by Tasks 2 to 19.
- Produces: report `1.45.0` and pipeline `stage-c-1.6.10`. The 1.45.0 history line names seven changes:
  - the sign, scale, unit, relation and bound readings of excerpt figures;
  - the own-description binding;
  - comparison bases and the end of a base-first move on the excerpt path (Task 16);
  - on the record path, a label's direction words, operand order and the percentage-point change rule (Tasks 17 to 19);
  - a registry figure's printed description and its column period;
  - combined insider roles and their legacy note;
  - the return-path fade and the rating-gate name exception.

  PAYLOAD_VERSION 1.48.0, STAGE_B ACCOUNTING_EVIDENCE_27 and SCORE_BANDS are unchanged. Tasks 16 to 19 change verifier meaning only, so they move REPORT_SPEC_VERSION, already moving here, and nothing else: no prompt text (PIPELINE_VERSION is moved by Task 13 alone) and no payload byte (OD-6, alternative b).

**Steps:**
- [ ] Step 1: Change the five pins to the new values first. Add one new assertion to tests/report.versionStamps.test.ts: `expect(INSIDER_ROLES_READ_FROM).toBe(REPORT_SPEC_VERSION)` (Task 12's legacy threshold, imported from `@/report/claimMatching`). It keeps the legacy note's cut-off equal to the stamp this batch ships, including after a merge-time renumber.
- [ ] Step 2: Run `npx vitest run --config vitest.config.ts tests/report.versionStamps.test.ts tests/jobRunner.test.ts tests/stageC.payload.passes.test.ts`. Expected: FAIL on exactly the five pinned assertions ("1.44.0" and "stage-c-1.6.9") and the new equality assertion ("1.45.0" against "1.44.0").
- [ ] Step 3: Move the two constants and add the history lines.
- [ ] Step 4: Run the same command. Expected: PASS. jobRunner.test.ts is long, so run it alone in the foreground if the machine is loaded. Under load, its timeout flakes must pass when rerun alone.
- [ ] Step 5: Benefit check. `grep -rn "1\.44\.0\|stage-c-1\.6\.9" src tests --include=*.ts` returns only history comments and legacy-fixture inputs, never a current pin.
- [ ] Step 6: Docs. CHANGELOG gets its stamps bullet in Task 24. METHODOLOGY.md needs no version text.
- [ ] Step 7: Commit with `git add src/report/schema.ts src/pipeline/jobRunner.ts tests/report.versionStamps.test.ts tests/jobRunner.test.ts tests/stageC.payload.passes.test.ts` and the message "Report 1.45.0 and pipeline stage-c-1.6.10 for the claim-verifier fixes".

### Task 21: Payload golden

- [ ] Step 1: Run `npx vitest run --config vitest.config.ts tests/stageC.payload.passes.test.ts tests/stageC.judgeProtocol.test.ts`. Expected: PASS, with no change to the payload fingerprint, `promptBytes` or hashes. No task changes `payload.ts` or the serialized payload. Task 19 in particular classifies percentage-point records in `isDeltaRecord`, not with a registry field, so `provenanceHash` must not move (OD-6, alternative b). The golden's `promptBytes` measures `serializePayloadForPrompt(payload)` (tests/stageC.payload.passes.test.ts:706-708), not the judge system prompt, so Task 13's prompts.ts line cannot move it. A review grep found no test that pins the judge entity instruction's bytes.
- [ ] Step 2: If the golden moves, find the commit that moved it with `git bisect run` over the branch, using that test file. There are three cases:
  - If it is Task 13's judge entity-instruction line (prompts.ts:513-516), it is an intended prompt-text change. Re-pin the fingerprint and `promptBytes` with a dated comment: "2026-10-27 AI-103 (D-next): the judge entity rule names the admissible primary-source classes". This is the repo's rule for prompt-text changes. PAYLOAD_VERSION does not move, because the payload data is unchanged.
  - If `financeHash` or `provenanceHash` moved, the payload data changed. No task intends that: stop and revert the cause.
  - Anything else is unintended: stop.

  Never re-pin without naming the cause.
- [ ] Step 3: Commit a re-pin only for the Task 13 case, with `git add tests/stageC.payload.passes.test.ts` and the message "Re-pin the judge prompt bytes for the entity primary-source rule (AI-103)". Otherwise there is nothing to commit.

### Task 22: Audit deltas

- [ ] Step 1: Run `npm run audit:deltas` (no `--write`). Expected: the moved leaf `report.meta.specVersion`, from `1.44.0` to `1.45.0`, from Task 20 on the provider-free DEMO control. The D-113 group `nvda48-report-issues-20261026` in `tests/fixtures/audit-intended-deltas.json:10247-10260` is the precedent. No Stage B leaf may move: this batch changes no Stage B value.
- [ ] Step 2: The DEMO projection's `report` also carries `verified` flags (81 at HEAD) and an `appendix.verificationLog`. Tasks 10 to 12 change the registry branch they come from. Tasks 16 to 19 change the prose claim path and its direction-check counts.
  - If a `verified`, `verificationLog`, `provenanceCoverage` or direction-check (`checks.direction`) leaf moves, trace each one to Task 10, 11, 12, 16, 17, 18 or 19 with the replay rules of those tasks before writing anything, and name it in the group's `reason` and in the disposition note.
  - Any Stage B leaf, or any report leaf that is not traced, stops the batch.
- [ ] Step 3: When every moved leaf is traced, run `npm run audit:deltas -- --write --group claim-verifier-numbers-20261027`. Fill the new group's fields:
  - `decisions`: the D-next numbers;
  - `reason`, in the D-113 style. When only the stamp moved: "Claim-verifier fixes (D-next). Only the report stamp moves, to spec 1.45.0, on this provider-free DEMO control; no value, availability flag or order moves." Otherwise, name each traced verification leaf.

  Rerun `npm run audit:deltas`. Expected: clean.
- [ ] Step 4: Commit with `git add tests/fixtures/audit-intended-deltas.json` and the message "Record the report stamp delta for the claim-verifier fixes".

### Task 23: Before/after replay table (proof)

**Files:**
- Read only: `tmp/b2-replay/out/base/*.json` and `tmp/b2-replay/out/final/*.json`. Write `tmp/b2-replay/table.md`, which is never committed.

**Steps:**
- [ ] Step 1: Run the replay with `B2_LABEL=final`, then `node tmp/b2-replay/diff.mjs base final --table > tmp/b2-replay/table.md`.
- [ ] Step 2: The table has one row per report (#43, #46, #48, #49, #50), with these columns:
  - claims validated, cited, unchecked and contradicted, base -> final;
  - traced numbers verified, base -> final;
  - contradicted -> other;
  - validated -> unchecked;
  - unchecked -> validated.

  A second table lists every changed row: report, path, finding id and the one-line reason. A third lists the synthetic test flips per finding: test name, HEAD status and fixed status.

  A fourth table covers the round-4 probe claims from Task 0 Step 2a (`r4-claims.json`, payloads rebuilt from `tmp/audit-2026-10-27/data/evidence/50/run_input_snapshot.gen0.*.json` and `…/43/…`). It has one row per claim: finding, claim, cited source, base status and reason, final status and reason. A summary line per finding counts the probe assertions that held at final.
- [ ] Step 3: Acceptance.
  - Every changed row is attributed to a finding, and there is no unexplained move toward `validated`.
  - The stored-report `schemaParse` and rating-gate hit counts are equal before and after.
  - `sha256` of every `tmp/audit-2026-10-27/data/reports/*.json` is unchanged (D-67).
  - In the fourth table, every failing assertion of AI-501, AI-502, AI-503, AI-503-V1, AI-503-V2 and AI-504 now holds. A probe's "info" block mixes controls with further instances of its own finding, so "keep the base status" is not the rule. Each info row's final status must be the one listed here (the test row it maps to is named):
    - AI-501: `level-undated` → `unchecked` (Task 17 defect); `own-label` → `validated`; `change-by`, `change-rose`, `share-own-label`, `share-48-shape` → `unchecked` (Task 17 controls).
    - AI-502: `spread-level`, `divergence-level` → `validated`; `spread-rose-to`, `spread-48-wording` → `unchecked`; `spread-higher-after` → `unchecked` (OD-6, alternative a); `spread-stray-word` (FACT and JUDGMENT), `divergence-increased`, `curve-fell` → `unchecked` with no direction row (Task 19 defects); `slope-true-delta` → `unchecked / unit-mismatch` with `checks.direction.checked === 1` (Task 19 control).
    - AI-503: `supply-end`, `were-end` → `unchecked`; `plain-end` and `judgment-end` → `validated` (Task 16 rows 3 and 1); `from-start` → `unchecked` (row 6: a recall loss Task 9 causes through "last" in $A's own description); the `bare-from-to` pair → `validated` / `contradicted` (rows 18 and 19).
    - AI-503-V1: `ctl-r50-own-sentence`, `ctl-r49-own-sentence`, `ctl-judgment` → `unchecked` (rows 8 and 9); `ctl-nodate`, `ctl-q2`, `ctl-ai503-adjacent-were`, `ctl-bare` → `unchecked` (`ctl-q2`'s reason may move from period-mismatch to text-context-mismatch, because $A no longer binds); `ctl-ai503-adjacent-increased-to` → `validated` (row 33); `ctl-to-first` ("Inventory was USD 31.6 billion." on "Inventory went to $31.6 billion from …") → `unchecked` after Task 9, because "went" is a content word of $31.6's own description (a Task 9 recall loss, listed in Task 9 Step 5, not a Task 16 move).
    - AI-503-V2: `ctl-to-claim` → `validated`; `ctl-was-claim`, `ctl-by-claim`, `ctl-was-from-a-year-ago`, `ctl-two-figures`, `ctl-real-noperiod`, `ctl-real-two-figures` → `unchecked` (any reason); `ctl-compared` → `unchecked` (row 27).
    - AI-504: `spread-own`, `leverage-own`, `capex-da-own`, `timing-own` → `validated`; `spread-swapped-minus` → `unchecked`; `capex-da-swapped` → `unchecked` (Task 18 defect).

    On the real #50 and #43 excerpts, a `validated` target may instead read `unchecked / text-ambiguous` when another figure of the same excerpt also binds the claim. List each such row with the competing span; it is fail-closed and admissible. Any other final status, and any move toward `validated` or `contradicted` not listed here, stops the batch.
- [ ] Step 4: Copy the summary table (no FMP values, counts and paths only) into the disposition note (Task 26) and the PR (Task 29).

### Task 24: CHANGELOG

- [ ] Step 1: Add a new top section above line 21 of `CHANGELOG.md`: `## Unreleased - claim verifier reads signs, scales, units and each figure's own description (2026-10-27)`.
  - Write one plain-English bullet per task 1 to 19, in the house style. Each bullet says what a reader saw before and what they see now. It names the stored report the case was measured on, or says it was proved on fixture or synthetic text when no stored report holds it (AI-202, AI-304-V1, AI-304-V3, AI-401-V1, AI-409, AI-407, AI-408, AI-501, AI-502, AI-503-V2 and AI-504 found no stored occurrence). AI-503 and AI-503-V1 were measured on NVIDIA's real CFO commentary and 10-Q MD&A sentences, which #48 to #50 carry. Examples: "a figure the filing gives to another metric, such as the $26.0 billion NVIDIA returned to shareholders, no longer validates a free-cash-flow claim"; "'commitments increased to USD 279 billion', which NVIDIA's CFO commentary states, is no longer marked contradicted by the $119 billion the commitments started from"; "a spread such as ROIC − WACC is no longer checked as if it had risen or fallen".
  - End with the stamps bullet: "Report 1.45.0 and pipeline stage-c-1.6.10 (D-next). Payload 1.48.0, Stage B ACCOUNTING_EVIDENCE_27 and the score bands are unchanged. Stored reports keep their bytes; #48's insider title rows are annotated in the audit export, not rewritten."
  - Update the header paragraph (CHANGELOG.md:9-10, "Current source declares application **0.1.0**, report spec **1.44.0** and payload **1.48.0** (…)") to report spec **1.45.0** and this batch's name. The repository's docs must match the code.
- [ ] Step 2: Run `npx vitest run --config vitest.config.ts tests/docs.lint.test.ts tests/repository.release.test.ts`. Expected: PASS.
- [ ] Step 3: Commit with `git add CHANGELOG.md` and the message "Changelog for the claim-verifier fixes".

### Task 25: DECISIONS entries (one per owner decision)

- [ ] Step 1: Append eight entries to `docs/audit/DECISIONS.md` after D-116 (seven decisions and, as entry 8, the batch's known residuals). Use the D-110+ heading style, `## D-next - Audit batch B2: <title> (2026-10-27)`; they are renumbered at merge. Each entry has these bullets:
  - **Evidence** (finding ids and the stored reports measured);
  - **Options** (the alternatives in this plan's OD section);
  - **Choice**;
  - **Why** (the cited sources, with URL and passage);
  - **Revises** (D-63/D-45, D-44, 10aa8ab, the e25fb3a registry note, D-63/D-66/30ccbad, the `isDeltaRecord` pp shortcut and F-22's scope, none);
  - **Versions** (report 1.45.0, pipeline stage-c-1.6.10);
  - **Preservation** (stored bytes unchanged).

  The seven entries:
  1. OD-1, own-description binding (AI-305, AI-305-V1). It says it applies recommended default 3, and that default 3's forward-looking half is B1's AI-302-V1. It records that the rule can resolve a HEAD ambiguity into a validation, and that the table-cell description drops the scale declaration.
  2. OD-2, a registry figure's printed description (AI-407). It covers the scoping to metric-row labels and worded units, rule 4 for segment rows, the closed head list of rule 5, and the registry-id-only printed-source test. It also records the rejected "shares no token" draft and why.
  3. OD-3, a MetricRow column period, and supplied periods on period-less records (AI-408). It says it follows recommended default 2.
  4. OD-4, issuer disclosures as primary entity sources (AI-103), with the registry-prefix allowlist.
  5. OD-5, the rating gate's name exception (AI-111). It covers the honorific list without St, Jr and Sr, the initial case only before a dash, comma, parenthesis or possessive, and the cases kept fail-closed.
  6. Round-4 verifier conventions (AI-503, AI-503-V1, AI-503-V2, AI-501, AI-504). These are house conventions, not owner decisions, recorded because they revise recorded scope:
     - a comparison base binds only a comparison base and takes no excerpt period, and a "<direction word> from $A … to $B" move gives $B the move's head. This extends D-63's postposed-only `levelBeforeComparison`;
     - a record label's direction words are metric words. This narrows commit 30ccbad's label ignore set;
     - a difference's or ratio's operands are read in order. This makes D-66's "formula numerator/denominator … remain rejected" true for every record, not only the say-on-pay formula.

     **Evidence:** the probe logs and the real NVDA sentences of #48 to #50. **Options:** the finding sketches; for AI-503 the rejected variant "any figure governed by from binds nothing", which would leave the true end level unvalidated.
  7. OD-6, which percentage-point records are signed changes (AI-502). It covers the pp/yr and change-slug rule, the difference-operator exclusion, no comparative sign check on differences (alternative a), the verifier-side classification with its pin test (alternative b, and why the spec's lean was replaced in mechanism) and the sources.
  8. Known residuals of the claim-verifier batch (main-session resolution, decisions spec 4.3, B2). Heading `## D-next - Audit batch B2: two pre-existing readings kept as known residuals (2026-10-27)`. They are not owner decisions; they get their own entry so the post-fix audit (verification plan Task V7) can find and probe them, instead of treating them as settled. Bullets:
     - **Evidence.**
       - *Spaced-dash range sign.* `readProseQuantities("Guidance is USD 1.0 - 1.2 billion.")` returns `[1, -1.2e9]` at HEAD and after this batch (Task 2's documented reading): the after-prefix `sign` group reads a dash followed by a space as a minus. No test pins it.
       - *"EPS" as a per-share basis.* `perShareInWords` keeps D-109's expression `/\bper\s+share\b/i` (Task 5), on the excerpt path and the record path. Under "($ in billions, except per share data)", "Diluted EPS as of 2026-01-25 was USD 4.90." moves from contradicted (HEAD: 4.9e9 against 4.90) to `unchecked / unit-mismatch`, never validated; the Diluted row of NVDA's Note 3 stays unchecked for the same reason.
     - **Options.** (a) Fix the dash now: the same group reads table change cells such as "75.0 % -3.9 pts" as signed changes, so changing it flips those cells, outside AI-202's scope (a minus written before the currency). (b) Widen the per-share words to "EPS" now: that changes the record path (D-109) outside AI-403. (c) Keep both readings, fail closed where they apply, and name them for the post-fix audit.
     - **Choice.** (c).
     - **Why.** Neither reading is a finding of this audit; each fix moves verdicts outside the finding it would ride on, which the batch rule "smallest change that fixes the whole class, no unrelated change" forbids. Both readings now fail closed (unchecked, never validated) on the shapes the tests cover.
     - **Validation.** The post-fix audit (verification plan Task V7) is given both as named probe targets, with the two inputs above; a confirmed defect becomes a follow-up finding.
     - **Revises.** None. **Versions.** Unchanged by this entry. **Preservation.** Stored bytes unchanged.
- [ ] Step 2: Add the one-line "Revised by D-next" or "Extended by D-next" pointers to D-63, D-45 and D-44 that Tasks 9 and 10 call for, if not already added there. Also add:
  - to D-63: "Extended by D-next (round-4 conventions: comparison bases)";
  - to D-66: "Operand order generalized by D-next (round-4 conventions)";
  - to the entry that records F-22 (DECISIONS.md:2250): "What counts as a cited change for percentage-point records: D-next (OD-6)".
- [ ] Step 3: Run `npx vitest run --config vitest.config.ts tests/docs.lint.test.ts`. Expected: PASS. Every `D-` citation must resolve.
- [ ] Step 4: Commit with `git add docs/audit/DECISIONS.md` and the message "Record the seven claim-verifier decisions and the known residuals (D-next)".

### Task 26: Disposition note, registered in the release test

**Files:**
- Create `docs/audit/2026-10-27-audit-fix-02-claim-verifier-numbers.md`, in the format of `docs/audit/2026-10-22-audit-batch6-provider-failures.md`.
- Modify `tests/repository.release.test.ts`: add the note's path after line 96 in REQUIRED_RELEASE_FILES. If this plan file is committed, add `docs/superpowers/plans/2026-10-27-audit-fix-02-claim-verifier-numbers.md` after line 124.

**Steps:**
- [ ] Step 1: Write the failing test first. Add the path(s) to REQUIRED_RELEASE_FILES and run `npx vitest run --config vitest.config.ts tests/repository.release.test.ts`. Expected: FAIL, because the file is missing.
- [ ] Step 2: Write the note. It has:
  - one row per finding (all 24, with AI-203 and AI-401-V2 shown as covered by AI-403 and AI-401): disposition, the test that proves it, and the replay effect;
  - the seven decisions and the residuals entry (entry 8), by D-next;
  - a section "Residuals for the post-fix audit (verification plan Task V7)" that names the spaced-dash range sign and "EPS" as a per-share basis, each with the input that shows it (DECISIONS entry 8), and says V7 probes them rather than counting them as known (decisions spec 4.3, B2);
  - Task 23's summary table, and its fourth table (round-4 probe claims) in counts per finding;
  - the recorded residuals:
    - record-path claim bounds are not read (Task 8 scope);
    - the own-description rule has measured recall losses, if any were listed in Task 9, and the unchecked-to-validated moves Task 9 admitted;
    - AI-103's probe check "the judge request names an admitted IR URL" is replaced by "the framing names the admissible classes", because OD-4 makes the URL list non-binding;
    - the after-prefix sign group still reads "USD 1.0 - 1.2 billion" as -1.2e9 (pre-existing; changing it would flip table change cells such as "75.0 % -3.9 pts"), so a later batch must decide spaced-dash ranges (DECISIONS entry 8; checked by verification plan Task V7);
    - a statement sub-row under a heading ("Net income per share: Basic … Diluted …") binds only the row whose lead carries the heading. The Diluted row of NVDA's Note 3 stays unchecked;
    - a unitless share-count cell under a declaration with no "$" has no established unit and stays `text-ambiguous` (claimEvidence.ts:822);
    - "EPS" alone is not read as a per-share basis on either path (D-109's expression is unchanged; DECISIONS entry 8; checked by verification plan Task V7);
    - an excerpt-cited MetricRow cell's column is not compared with the excerpt (Task 11 checks registry cells only; D-45's "not done" stands for the excerpt path);
    - an initial's surname followed by a plain word ("William J. Hold said …") and a bare rating word after an honorific ("We met Ms. Hold.") still fail the rating gate, by design (OD-5);
    - older stored reports #34 and #37 used the "-$" spelling (AI-105). They are not replayed, because they have no run-input snapshot.
    - Round-4 residuals:
      - a base-first move whose "from" no direction word governs (a range, "went from", "improved from", or a direction word beyond 40 characters, as in NVIDIA's 10-Q "significantly increased our supply and capacity commitments from $119 billion …") gives its end figure no metric, so the true "Supply and capacity commitments as of 2026-07-26 were USD 279 billion" cited to the MD&A stays unchecked. It is no longer contradicted (Task 16);
      - a "from" that is not a comparison ("Proceeds from $5.0 billion of senior notes") is read as a base and binds no level claim (Task 16; Task 9 already rejects that case);
      - the Amazon 10-Q two-period form ("from $19.2 billion in Q2 2025 to $27.5 billion in Q2 2026") stays unchecked until B1's comparison-base periods remove Q2 2025 from the end figure's periods;
      - a change claim against an "increase in …" record ("Goodwill and other intangible assets rose USD 18.14 billion") stays unchecked: the record is not read as a signed change of its own noun (Task 17);
      - "WACC minus ROIC" and "spread of ROIC over WACC" stay unchecked, because "minus" and "over" are claim words. A reversed ratio is never read against its reciprocal (Task 18);
      - no comparative sign check on percentage-point differences ("1.03 percentage points lower" against relative strength −1.03 is unchecked, no longer validated; "… higher" is unchecked, no longer contradicted) (OD-6, alternative a);
      - the percentage-point change rule is verifier-side. A future change row must be per-year or carry a change word without a difference operator, or it loses its direction check. The pin test covers the helper payload's rows, and a row only another route registers (macro, guidance, excess return) is covered by the explicit unit assertions of Task 19.
- [ ] Step 3: Run the release test again. Expected: PASS. New files must be `git add`ed first, because the suite partitions tracked files.
- [ ] Step 4: Commit with `git add docs/audit/2026-10-27-audit-fix-02-claim-verifier-numbers.md tests/repository.release.test.ts` (and the plan file if registered) and the message "Disposition note for the claim-verifier audit batch".

### Task 27: `npm run verify`, in foreground chunks

- [ ] Step 1: Run each gate in the foreground, one at a time, and stop at the first real failure:
  1. `npm run check:dependencies`
  2. `npm run typecheck`
  3. `npm run lint`
  4. `npm run test:product`
  5. `npm run test:integration`
  6. `npm run test:coverage`
  7. `npm run build`
  8. `npm run audit:security`
- [ ] Step 2: Known load flakes are jobScheduler, recordedSensitivity, risk.coverage, runtimeArtifactIdentity and runtimeReplay timeouts, and db.cli on Windows. A failure in one of these counts as a flake only if both hold:
  - the file passes when rerun alone (`npx vitest run --config vitest.config.ts <file>`);
  - the file is not touched by this diff.

  `tests/risk.coverage.test.ts` is touched in effect, because claimEvidence.ts, consistency.ts and passes.ts are risk files. Its per-file thresholds must pass outright; add tests for uncovered new branches rather than lowering anything.
- [ ] Step 3: Record the eight gate results (pass, or flake rerun) for the PR.

### Task 28: Fresh reviewer over the whole diff

- [ ] Step 1: Dispatch a fresh reviewer with superpowers:requesting-code-review over `git diff main...fix/claim-verifier-numbers`. Give it this plan's Review Focus list and Global Constraints, and ask it specifically about the following (plus the rating-gate mask, the `rowKind` threading and the registry-prefix allowlist of OD-4):
  - the own-description cut points;
  - the new context-word list;
  - the conflict rule's false positives;
  - the ReDoS shape of every new regex (no two adjacent unbounded quantifiers over the same class);
  - tests that were edited rather than added;
  - round 4:
    - `COMPARISON_BASE_LEAD` and `moveHead`'s direction condition (Review Focus 6);
    - Task 17's two-reading metric test (Review Focus 7);
    - `labelOperands`' lookarounds and the window-head rule (Review Focus 8);
    - the `isDeltaRecord` percentage-point rule and its pin test (Review Focus 9).
- [ ] Step 2: Handle each finding with superpowers:receiving-code-review. A fix gets its own failing test and commit. A disagreement is answered with evidence in the PR.
- [ ] Step 3: Rerun Task 0's replay (`final2`) and Task 27's gates touched by any fix.

### Task 29: PR description (plain English)

- [ ] Step 1: Write the description:
  - **What was wrong.** In reader terms:
    - green checks on figures the source gave for something else;
    - correct figures marked contradicted, including NVIDIA's "commitments increased to $279 billion", read against the $119 billion they started from;
    - a goodwill-and-intangibles level checked against the year's increase;
    - a spread checked as if it had risen or fallen;
    - "WACC − ROIC" accepted for "ROIC − WACC";
    - a CEO's own title rejected;
    - a Lilly drug named from the 10-K failing the judge;
    - an accurate fade sentence flagged;
    - a surname "Hold" blocking a report.
  - **What changed.** One line per task.
  - **How we know it helped.** Task 23's tables (including the round-4 probe claims on the rebuilt #43 and #50 payloads) and the synthetic flip counts.
  - **What is stricter now.** More unchecked claims, with the main classes named, including OD-6's comparatives on percentage-point differences.
  - **Decisions.** OD-1 to OD-6, one line each, with their D-next numbers, plus the round-4 conventions entry. Say that OD-2's rule 5, OD-4's issuer-prefix allowlist and OD-5's tighter mask were redesigned in plan review and confirmed by the main session on 2026-10-28 (decisions spec 4.3), because each is stricter.
  - **Known residuals.** The spaced-dash range sign ("USD 1.0 - 1.2 billion" reads its upper figure as negative) and "EPS" not read as a per-share basis stay as they are, recorded in DECISIONS entry 8; the post-fix audit (verification plan Task V7) checks both.
  - **Stamps.**
  - **Gates.** Task 27's results.
  - **Not changed.** Payload, Stage B, stored bytes.

  End with the attribution lines the session's system reminder gives.
- [ ] Step 2: Push and open the PR against `main`. Before merging, the branch must be up to date, with green full and windows-smoke checks and every review thread resolved. Ask the Codex bot for a re-pass by commenting `@codex review` after each push that changes code. If B1 merged first, rebase, renumber the D-next entries and the stamps (1.45.0 may become 1.46.0), set `INSIDER_ROLES_READ_FROM` (Task 12) to the renumbered report spec version, update every D-next cross-reference in the CHANGELOG, docs and disposition note, and rerun Tasks 0, 20 to 23 and 26. Round-4 merge points with B1:
  - Task 16's `Context.base` (a figure's base flag) sits beside B1 Task 6's `Context.bases` (base periods). Both edit `context()` and the excerpt candidate filter. Keep both conditions.
  - Task 17's `keepDirectionWords` joins B1's `metricTokens` options object `{ loose?: boolean }`.
  - Rerun `tests/stageC.claimPeriods.audit20261027.test.ts` with Task 16's file. Rows 28 and 30 may then read `unchecked` or `validated` through B1's periods, which their assertions allow.

## Self-review

**Spec coverage.** Every B2 finding in `brief/batches.json` has a task. AI-203 and AI-401-V2 are merged findings, covered by their parent tasks.

| Finding | Sev | Task | Proof test |
|---|---|---|---|
| AI-202 | High | 2 | `tests/stageC.claimEvidence.d66.test.ts` "AI-202 leading sign" |
| AI-304 | High | 3 | `tests/stageC.claimEvidence.tokens.test.ts` |
| AI-305 | High | 9 | `tests/stageC.claimEvidence.ownDescription.test.ts` |
| AI-401 | High | 6 | `tests/stageC.factualValidation.test.ts` "relation" |
| AI-401-V1 | High | 7 | `tests/stageC.factualValidation.test.ts` "apposition" |
| AI-304-V1 | Medium | 3 | `tests/stageC.claimEvidence.tokens.test.ts` |
| AI-304-V2 | Medium | 4 | `tests/stageC.verifyChecks.test.ts` unit check |
| AI-305-V1 | Medium | 9 | `tests/stageC.claimEvidence.ownDescription.test.ts` (MetricRow case) |
| AI-116 | Medium | 12 | `tests/stageC.verifyChecks.test.ts` person rows; `tests/report.markdown.integration.test.ts` |
| SEC-203 | Medium | 1 | `tests/stageC.numberScanLinearity.test.ts` |
| AI-103 | Medium | 13 | `tests/stageC.entities.lly.test.ts`; `tests/stageC.judgeProtocol.test.ts` |
| AI-403 (+AI-203) | Medium | 5 | `tests/stageC.excerptCurrencyScale.test.ts` "AI-403" |
| AI-407 | Medium | 10 | `tests/stageC.tracedNumberDescription.test.ts` |
| AI-408 | Medium | 11 | `tests/stageC.metricRowPeriod.test.ts` |
| AI-304-V3 | Low | 3 | `tests/stageC.claimEvidence.tokens.test.ts` |
| AI-104 | Low | 14 | `tests/stageC.excessReturnVisibility.audit20261022.test.ts` |
| AI-111 | Low | 15 | `tests/report.schema.test.ts` |
| AI-409 | Low | 8 | `tests/stageC.claimEvidence.bounds.test.ts` |
| AI-401-V2 (merged into AI-401) | n/a | 6 | the hedged pairs in Task 6 |
| AI-203 (merged into AI-403) | n/a | 5 | the Note 3 per-share cases in Task 5 |
| AI-503 | High | 16 | `tests/stageC.claimEvidence.comparisonBase.test.ts` rows 1-7, 11-15, 18-21, 32-33 |
| AI-503-V1 | High | 16 | `tests/stageC.claimEvidence.comparisonBase.test.ts` rows 8-10, 16-17, 22-23 |
| AI-503-V2 | Medium | 16 | `tests/stageC.claimEvidence.comparisonBase.test.ts` rows 24-28 |
| AI-501 | Medium | 17 | `tests/stageC.claimEvidence.recordMetric.test.ts` "AI-501" |
| AI-502 | Medium | 19 | `tests/stageC.claimEvidence.recordMetric.test.ts` "AI-502"; `tests/stageC.verifyChecks.test.ts` "OD-6" pin |
| AI-504 | Low | 18 | `tests/stageC.claimEvidence.recordMetric.test.ts` "AI-504" |

**Every finding can be made to fail first.** Each task's Step 2 names the HEAD result the new test sees, taken from the probe logs or from the code at 6542531. No finding is skipped.

The round-4 HEAD results were taken from a hermetic scratch check run under a copy of the probe config, with synthetic inputs and committed fixtures only (`tmp/audit-2026-10-27/plans/B2-r4-review/*.review.ts` and their `.out.txt`). Task 16 also states each row's status after Tasks 1 to 15. Task 9 alone already makes the real NVDA AI-503 and AI-503-V1 sentences fail closed (unchecked), through the content words "last" and "significantly" in the start figure's own description. So Task 16's failing-first rows are:
- the shapes Task 9 does not reach: grammar-only base qualifiers ("in the prior quarter", "at the end of the first quarter"), a colon summary with no verb, and the claim side (AI-503-V2);
- the move-end validations that only Task 16 provides. One probe check is replaced rather than ported: AI-103's "the judge request names an admitted IR URL". OD-4 makes the URL list non-binding, so the framing test checks the class list instead. This is recorded in the disposition note.

**Placeholder scan.** There is no TBD or "similar to Task N". "D-next" is the repository's merge-time numbering convention. Line numbers are those at HEAD 6542531, and each task names the function, so a drifted line is easy to find.

**Type consistency across tasks.**
- `readProseQuantities` (Task 2) is used by Tasks 3 and 8.
- `Quantity.bound` (Task 8) joins the distinct key that Task 5 rewrote.
- `SourceBinding.column` gains `exceptPerShare` and `label` (Task 5). `tableScaleFor(quantity, column): number` and `rowLead(label)` are internal helpers; Task 9 reuses `rowLead` for a table cell's own description.
- `QuantityDirection.relation` gains `"unknown"` (Task 6). Its only consumer is claimEvidence.ts: the record path already demands `"change"`, and the excerpt path compares relations.
- `ParsedNumber.hadCurrencyCode` (Task 4) is internal.
- `Context.own` and `excerptNamesMetric(…, own)` (Task 9) are internal.
- `TracedNumberRef` gains `rowKind?: "metric-row" | "named-row"` (Task 10) and `cellPeriod?: string` (Task 11). Both are set only by `collectTracedNumberRefs` and read only by the registry branch of `runVerifyPass`.
- `descriptionConflictsWithRecord(description: { metric, segment }, record, ignore)` (Task 10) and `cellPeriodCheck` (Task 11) are the new stageC exports besides `readProseQuantities`. `validateEntityText` gains an optional fourth parameter (Task 13). Its default keeps HEAD's behaviour for the analyst path, `collectEntityConflicts`, gradeContract and legacyEntitySafety.
- `INSIDER_ROLES_READ_FROM` and `legacyCheckNote(entry, log, reportSpecVersion)` (Task 12) are exported from `src/report/claimMatching.ts` and are display-only. Task 20's stamp test pins the constant to REPORT_SPEC_VERSION.
- Round 4:
  - `Context.base: boolean`, `COMPARISON_BASE_LEAD`, `moveHead(text, previous, current, all, clause): string | null` and the test seam `readContextForTests` (Task 16) are claimEvidence.ts internals. Task 16 sets Task 9's `Context.own` of a move's end through Task 9's two cuts (`ownBeforeStart` for the head's start, `ownAfter` for the after side).
  - `metricTokens(label, ignore, options?: { keepDirectionWords?: boolean })` (Task 17) defaults to HEAD's reading at every call site except the record path.
  - `LabelOperands { left; right; kind: "difference" | "ratio" }` and `labelOperands(label)` (Task 18) are new consistency.ts exports. claimEvidence.ts's private `operandsInOrder` reads them, and so does `isDeltaRecord` (Task 19). `labelOperands` normalizes a comparison basis to "yoy"/"qoq" before splitting, never treats an em dash as an operator, and reads its operators case-insensitively; claimEvidence.ts's `COMPARISON_BASIS` is the pattern it copies (consistency.ts cannot import it from claimEvidence.ts, which imports consistency.ts, so the pattern is moved to consistency.ts and imported back, with no change in behaviour).
  - `isDeltaRecord` keeps its signature (Task 19).

**Ordering hazards.**
- Task 9 tightens every excerpt binding. After it, rerun the Task 3, 5 and 8 test files (Task 9 Step 4 includes them).
- Tasks 10 and 11 both touch the registry branch. Task 11's tests use each record's own label so that Task 10 cannot fail them.
- Task 16 runs after Task 9 (it overrides a move end's own description) and after Tasks 6 and 7 (their direction pairs must stay unchanged; Task 16's Step 4 reruns them).
- Task 17's option must not reach Task 9's or Task 10's calls of `metricTokens`.
- Task 18 runs before Task 19 (`labelOperands`).
- Task 20 moves the stamps once, after all meaning changes. Task 22 then has the stamp leaf to record, plus any traced verification or direction-count leaf of Tasks 10 to 12 and 16 to 19.

**Not touched.** No task touches `src/app`, a route handler or the proxy, so AGENTS.md's Next.js guide rule does not apply. There is no Stage B change, no payload data change and no stored-report rewrite. DELTA_BREAKERS, DIRECTION_WINDOW_CHARS, `quantityDirection` and the registry direction check's code (consistency.ts:576, :578, :625-644, :1610-1640) are unchanged. Task 19 changes only which records that check reads, through `isDeltaRecord`. Round 4's B13 findings (derived EBIT operands, D&A totals, fourth-quarter lineage) are not planned here.

**Residual risks.**
- **Recall.** OD-1 marks some correct excerpt claims unchecked. One example is "NVIDIA returned nearly USD 26.0 billion to shareholders", where the source sentence's subject is "These changes … free cash flow". This is accepted as stricter. It is measured in Task 9 Step 5 and listed in the disposition note.
- **New counts in prose.** Task 3 makes counts after m/b/k-initial nouns ("5 key products") real quantities. This can make a one-record claim ambiguous (unchecked).
- **Columns that cannot be read.** In Task 11, unreadable columns are disclosed, not checked. Window agreement stays with B1.
- **Record path.** A record-path claim bound ("more than USD 46 billion" against 46.7) is still read as a value. That is outside AI-409's excerpt scope, and is recorded for a later batch.
- **Ambiguity resolution can validate.** Task 9's own-description rule only removes candidates, but removing a wrong candidate can turn a HEAD `text-ambiguous` claim into `validated`. Task 9 Step 5 lists every such move, and each one is read against its source before the batch ships.
- **Pre-existing readings left as they are.** The spaced-dash range sign ("USD 1.0 - 1.2 billion"), the Note 3 Diluted row's binding, unitless share cells, "EPS" as a per-share basis and excerpt-cited MetricRow columns are all unchanged. Each is listed in Task 26's disposition note. The spaced-dash sign and "EPS" also get DECISIONS entry 8 and are named for the post-fix audit (verification plan Task V7), per decisions spec 4.3.
- **Rating gate.** OD-5 masks the period after a listed honorific, unless the rating word is the whole sentence. After a single initial, it masks the period only when the rating-word surname is set off by a dash, comma, parenthesis or possessive. "William J. Hold said …" and "We met Ms. Hold." still fail closed, by design.
- **Merge order.** Shared files with B1, B3 and B10 mean that whichever batch merges second must rebase. It then reruns Tasks 0, 20, 22, 23 and 26, and renumbers the stamps, the D-entries and `INSIDER_ROLES_READ_FROM`.
- **Round 4.**
  - **Comparison bases.** Task 16 reads every figure after "from", "compared with/to", "versus", "vs." or "against" as a base. A rare non-comparison "from" ("proceeds from $5.0 billion of notes") then binds no level claim, a recall cost that the replay lists.
  - **Move-end validations.** A move end now validates its correct claim, a move toward validated in the bare "from $A to $B" form that HEAD left text-ambiguous. A false "increased to <start figure>" now reads contradicted, a value conflict with the move's end, where HEAD validated it.
  - **Label direction words.** Task 17 can unverify a correct claim whose record label holds a direction word the claim leaves out. Task 17 Step 5 lists every such label first.
  - **Operand order.** Task 18's order test could misfire on a label whose "to" or "over" is not an operator. The lookarounds, the grammatical-"to" list, the comparison-basis normalization, the em-dash exclusion, the window-head rule and the "absolute" exemption cover the known labels, and Step 5 lists every validated operand-label claim.
  - **Percentage-point changes.** Task 19 removes correct verdicts on comparatives ("1.03 pp lower") by decision (OD-6, alternative a).

## Review notes

Independent review of this plan at HEAD 6542531. Every Step 1 HEAD result quoted in the plan was checked with a scratch test (tmp/audit-2026-10-27/plans/B2-review/*.review.ts, run under a copy of the probe config with the network blocked). No source, test or doc outside this plan was changed. Owner-decision sources were spot-checked: McCoy et al. 2019, Rashkin et al. 2023 (attribution to identified sources), the MeasEval qualifier guideline, the XBRL 2.1 context definition, 17 CFR 243.101(e), Kiss and Strunk 2006 and FINRA Rule 2241(c)(2). Each supports the use the plan makes of it.

**Changes made to the plan**

- Task 0. The replay drove the bare judge output through `runVerifyPass`. Production verifies the assembled report (`pipelinePasses.runVerifyPass`, stageC/index.ts:688-735), so pipeline-owned rows (scenarios, geography, scores) would never have been read. The replay now uses the facade and its payload, mocks the facade's only provider import, and keys diff rows by path plus check.
- Task 2. The claims lacked the record's full label, so HEAD's result was unchecked for the wrong reason; they now carry it. The range assertion expected [1.0e9, 1.2e9]; HEAD gives [1, 1.2e9], and the test now says so. A lookbehind-only sign lead would have turned "$1.0 - $1.2 billion" negative, so the lead must sit directly before the currency. "USD 1.0 - 1.2 billion" is recorded as a pre-existing residual.
- Task 3. Where the whole-word lookahead goes in the pattern is now stated exactly.
- Task 4. "$15 million shares" is never located, so it could not fail first. It is replaced by "$15.2 billion shares".
- Task 5. The Diluted and share-count claims neither bind nor validate, at HEAD or after the fix, so they are now controls. Billions "except per share" decimals are handled by the row-lead per-share rule. The first row's lead holds the declaration itself, so it is blanked through `rowLead`. `perShareInWords` is not widened. The binding carries the column's own label. `tableScaleFor` returns `number`, not `number | null`.
- Task 6. "approximately" is not a DELTA_BREAKER, so that case moved to the controls. Tests were added for "an increase of about" and "a gain of".
- Task 7. The 72.4% case is already `text-ambiguous` at HEAD, so it moved to the controls.
- Task 8. "more than" against "over" cannot validate (D-63 words), and "no more than" is unchecked at HEAD ("no" is a definition modifier). Both are now controls.
- Task 9:
  - the MU, AMZN and Micron cases needed titles that state the claim's period, or they are unchecked at HEAD;
  - the plan's claim that the conjunction "never validates" was false, because removing a wrong candidate can resolve ambiguity. Acceptance now admits only listed, justified unchecked-to-validated moves;
  - a table cell's own description blanks the declarations (`rowLead`);
  - pt and pts were added to the context words;
  - Step 4 now lists the token, bounds and linearity test files.
- Task 10:
  - "shares no token with the record label" would have flipped macro rows ("DGS10 (core)") and paraphrases. It is replaced by disjointness over METRIC_HEADS;
  - named rows (peers, macro, scenarios, executives) are not metric descriptions, so a `rowKind` is threaded through;
  - the "(core)" and "(sector)" suffixes are stripped;
  - the source/sourceId test now applies to registry ids only, because geographic rows keep an SEC Archives URL in `source`;
  - segment-revenue labels need the member cut.
- Task 11. The walk threading is now precise, window records are `not-checked`, and the expectation was corrected: stored columns are mostly ISO dates.
- Task 12:
  - the "Jen-Hsun Huang" spelling gives not-in-source at HEAD, so the test uses "HUANG JEN HSUN";
  - "10 percent owner" yields no title at HEAD, so it is a control;
  - the legacy note's wording is now honest, it annotates both log rows, and its threshold constant `INSIDER_ROLES_READ_FROM` is pinned to the stamp.
- Task 13. "Any provenanceRegistry id" would have admitted third-party rows as primary sources; it is now an allowlist of issuer registry prefixes. The #38 scan setup is spelled out.
- Task 14. The governed span ended at the first "to" (it matched from "to 16.5% and…"). It now ends at the hurdle noun.
- Task 15. The planner's mask widened the rule-#3 hole: "Plan B. Buy before earnings." would have passed. The mask is tightened to a dash, comma, parenthesis or possessive after an initial's rating-word surname, and to a non-whole-sentence rating word after a listed honorific. St, Jr and Sr are dropped.
- Task 17. The payload golden measures `serializePayloadForPrompt` only, so a prompts.ts change cannot move it; the step now says so.
- Task 18. The DEMO verified and log leaves may move, and the step now records them.
- Task 20. The CHANGELOG's header version ("report spec **1.44.0**") must move with the stamp.
- Task 22. The residual list is complete: the range sign, the Note 3 Diluted row, unitless share cells, "EPS", the excerpt MetricRow column, the OD-5 fail-closed cases and #34/#37.
- Task 24. The reviewer is also asked about the rating mask, `rowKind` and the OD-4 allowlist.
- Task 25. The merge-time renumber now covers `INSIDER_ROLES_READ_FROM`, the D-next cross-references and reruns of Tasks 0 and 22.
- Self-review. The type list is complete (`rowKind`, `cellPeriod`, `rowLead`, `tableScaleFor`, `legacyCheckNote`, `INSIDER_ROLES_READ_FROM`), the "never validates" claim is gone, and the residual risks are updated.

**Left for the main session**

- `docs/superpowers/specs/2026-10-27-audit-remediation-decisions.md` is not present at HEAD. Write it, with OD-1 to OD-5 as revised here, before execution.
- OD-2 rule 5 (the source test) and OD-4 (an issuer-prefix allowlist, narrower than the finding's sketch) were redesigned in review. OD-5 is tighter than the planner's version. Confirm all three with the owner.
- Merge order with B1, B3 and B10: renumber the D-next entries, the stamps and `INSIDER_ROLES_READ_FROM` at merge.
- Confirm that the Task 0 facade replay runs under the probe config's environment (`getConfig` is read inside the facade) before Task 1 starts. Stop if it needs a key or a network.
- Two readings were left as they are: the spaced-dash range sign and "EPS" as a per-share basis on both paths. Decide whether a later batch takes them.

**Integration change (2026-10-28, master-plan integration)**

Recorded in `docs/superpowers/specs/2026-10-27-audit-remediation-decisions.md`, conflict C-2.
- **OD-3 / Task 11: what a period-less record establishes.** B1's OD-1 decides that a record with no period establishes its as-of date, a date its `periodContext` declares (`at`, or a duration's `end`), and a fiscal label it declares (`fiscalPeriod` or `periodContext.fiscalLabel`). This plan's OD-3 said "consistent with recommended default 2 in B1" but its `cellPeriodCheck` read only `asOf` and `fiscalPeriod`, so a MetricRow cell under a period-less record's own context date or context fiscal label would have been marked `period-mismatch` while the same date in prose validated on B1's path. That is the same question answered two ways. Resolved to B1's set, the better-supported option: the XBRL 2.1 context is part of a fact's identity (§4.6.1 "All items MUST have a context"; §4.7.2 the period is an instant or a start/end duration), so a date the record's own context states is carried by the record, not inferred. Edited: OD-3 decision (1), Task 11 Interfaces (`periodContext` added to the `Pick`, the target set and the fiscal-label fallback), and two new controls in Step 1. The rule stays fail-closed for everything the record does not carry; no existing defect case changes.
- **Round-5 findings not in this plan.** AI-501, AI-502, AI-503, AI-503-V1, AI-503-V2 and AI-504 were added to B2 after this plan was written and have no task here. The master plan lists them as a B2 addendum; AI-503 and AI-503-V1 are High.

## Amendment notes (round 4)

Audit round 4 confirmed six findings for B2 after this plan was written and reviewed. This amendment (2026-10-28) adds them. The bullet above that calls them "Round-5 findings not in this plan" is superseded: they are round-4 findings, and they are planned below. Round 4's batch B13 (derived EBIT operands, D&A totals, fourth-quarter lineage; `docs/superpowers/plans/2026-10-27-audit-fix-14-edgar-derived-lines.md`) is not planned here.

**Where each new finding is handled**

| Finding | Sev | Disposition | Task | Owner decision |
|---|---|---|---|---|
| AI-503 | High | needs its own task. Task 9 already makes the two real NVDA sentences fail closed ("last" in the start figure's own description) but leaves the grammar-only base qualifiers open, and validates no true move end | 16 | none (house convention, DECISIONS entry 6) |
| AI-503-V1 | High | with its parent in Task 16. The base rule keys on "from", not on DIRECTION_WORDS or the 40-character window, as the finding requires. The move-end head needs a governing direction word, so V1's real MD&A sentence becomes unchecked, not validated (residual) | 16 | none |
| AI-503-V2 | Medium | with its parent in Task 16 (claim side: a base claim binds only a source base) | 16 | none |
| AI-501 | Medium | needs its own task | 17 | none |
| AI-504 | Low | needs its own task. It provides `labelOperands`, which Task 19 reuses | 18 | none |
| AI-502 | Medium | needs its own task | 19 | OD-6 (new) |

No round-4 finding is disputed. Each probe's failing assertion was reproduced at HEAD by a hermetic scratch check with synthetic inputs and committed fixtures (`tmp/audit-2026-10-27/plans/B2-r4-review/`). The probes were read, not run.

**What changed in existing parts of the plan, and why**

- **Batch-level tasks renumbered.** The new finding tasks are numbered after Task 15, so the old Tasks 16 to 25 are now Tasks 20 to 29. Every cross-reference above the Review notes was renumbered. The Review notes keep the numbers they had when written: an old Task N there is today's Task N+4 for N ≥ 16.
- **Header and Global Constraints.**
  - The architecture paragraph and the findings count (18 to 24) are updated.
  - The spec reference now says the decisions spec exists, untracked, and that OD-6 decides its open AI-502 row.
  - The fixture list adds the committed `nvda-10q-q2fy27-item2.txt`.
  - The stamps line explains why PAYLOAD_VERSION still does not move although REPORT.md's B2 entry lists it: OD-6 takes the verifier-side classification, not the payload field.
- **Owner decisions.** OD-6 (AI-502) is added. "Decisions this batch does not need" now names the round-4 house conventions.
- **Review Focus.** Items 6 to 9 are added: non-comparison "from", label direction words, non-operator "to" and "over", and percentage-point change rows. Each has a test in Tasks 16 to 19.
- **Task order table.** Rows 16 to 19 are added, with the order constraints: Task 16 after Task 9, Task 18 before Task 19.
- **Task 0.** Step 2a is added: the probes' own claims run on the rebuilt #50 and #43 payloads through `runVerifyPass`, as the probes do, without running the probes, which rewrite evidence logs. No stored report holds a round-4 claim shape, so this is the stored-input proof for these findings. The existing steps are unchanged.
- **Task 20 (stamps).** The 1.45.0 history line names seven changes, not five, and states that Tasks 16 to 19 move only REPORT_SPEC_VERSION.
- **Task 21 (golden).** It states that Task 19 must not move `provenanceHash`.
- **Task 22 (deltas).** DEMO verification leaves and direction counts may also move through Tasks 16 to 19, traced by those tasks' replay rules.
- **Task 23 (replay table).** A fourth table (round-4 probe claims) and its acceptance rule are added.
- **Task 24 (CHANGELOG).** It has bullets for Tasks 1 to 19, and names the stored-occurrence status of the new findings.
- **Task 25 (DECISIONS).** There are seven entries, not five: entry 6 records the round-4 conventions, and entry 7 is OD-6. New pointers go on D-63, D-66 and the F-22 entry.
- **Task 26 (disposition note).** It has all 24 findings and the round-4 residuals.
- **Task 28 (review).** It names the four new review points.
- **Task 29 (PR).** It has the new reader-facing defects, OD-6, and the B1 merge points (`Context.base` beside B1's `Context.bases`; `keepDirectionWords` beside B1's `loose`).
- **Self-review.** The coverage rows, the fail-first note, types, ordering hazards, "not touched" and residual risks are extended.

No existing finding task (1 to 15) is changed: no round-4 finding proves one wrong. Two interactions are recorded instead:
- Task 9's own-description rule already closes the real NVDA AI-503 and AI-503-V1 sentences. Task 16 builds on Task 9's `Context.own` rather than replacing it.
- Task 3's percentage-point record and Tasks 6 and 7's direction pairs are rerun in Tasks 16 and 19 and must not move.

## Review notes (round 4)

Independent review of the round-4 amendment (2026-10-28) at HEAD 6542531. I checked it against findings.json (AI-501, AI-502, AI-503, AI-503-V1, AI-503-V2, AI-504), the six probes (read, not run), the verdict logs in `agents/r4-verify-6/` and `agents/r4-vverify-AI-503/`, the amending agent's scratch outputs in `tmp/audit-2026-10-27/plans/B2-r4-review/`, and the code (`claimEvidence.ts`, `consistency.ts`, `passes.ts:3155-3200`, the percentage-point producers in `payload.ts`, `stageB/grading.ts`, `providers/fred.ts`, `edgar/guidanceTables.ts`). I traced each new task's planned change through that code for every probe assertion and every info row. New HEAD readings come from one hermetic scratch file: synthetic inputs only, the network blocked by SHARED_SETUP_FILES, no provider, model or DB call (`tmp/audit-2026-10-27/plans/B2-r4-rereview/rr.review.ts` and `rr.review.out.txt`). No source, test or doc outside this plan was changed.

**Coverage.** All six findings are fixed by real tasks. None is disputed, and none should be.
- AI-503, AI-503-V1 and AI-503-V2 are fixed by Task 16:
  - the base flag keeps $A out of every level claim, whatever the verb or its distance, as V1 requires;
  - the claim-side base flag closes V2;
  - the governed move end gives the true "increased to $B" its metric.
- AI-501 is fixed by Task 17.
- AI-504 is fixed by Task 18.
- AI-502 is fixed by Task 19 under OD-6.

Every probe's failing assertion was traced to the planned target and holds.

**Step 1 tests.** The amending agent's scratch outputs confirm the HEAD statuses of the new tables. By my trace, the "After T15" column and the targets are consistent with Task 9's own-description rule as planned. Every new test has controls, is hermetic and fails first for its defect.

**OD-6 sources.** I spot-checked the two key sources with WebFetch on 2026-10-28:
- Eurostat glossary: "The term percentage point is used when comparing two different percentages. The abbreviation is pp."
- FRED T10Y2Y: "Series is calculated as the spread between 10-Year Treasury Constant Maturity (BC_10YEAR) and 2-Year Treasury Constant Maturity (BC_2YEAR)", units Percent, frequency Daily.

Both support the use the plan makes of them. Rashkin et al. was checked in the first review. OD-6 is consistent with F-22 and with OD-1's fail-closed direction.

I enumerated every percentage-point producer and Task 19's rule classifies each as OD-6 says. The producers are:
- payload.ts:698-755, :945, :1010-1011, :1065, :2189-2203 and :2476;
- the grading.ts score drivers;
- FRED T10Y2Y and T10Y3M;
- the guidance "margin expansion" rows.

**Changes made to the plan**

- **Task 9.** This is a clarification Task 16 relies on.
  - The after-side cut stops at the first comma, so it would split "as of September 3, 2026" and leave "september" in the own description.
  - Task 9's own control ("Cash and marketable investments totaled USD 73.45 billion as of September 3, 2026." → validated) would then fail, and no rule said what to do.
  - Dated phrases are now masked before the cut. Task 16's move-end figures followed by "as of July 26, 2026" depend on it.
- **Task 16.**
  - The move head now starts at Task 9's before-side cut for $A (`ownBeforeStart`), not at the clause start. A lead-in such as "Balance sheet:" is no longer made part of the move's metric. `moveHead` gains the `all` argument.
  - Row 32 is added. At HEAD the true claim is contradicted and the false one validated (scratch check).
  - Row 33 is added: the AI-503-V1 probe's dated control with the verb next to "from". HEAD gives contradicted / unchecked (probe log), and the target is `validated` / `unchecked`.
  - The Step 2 fail list and the Self-review coverage row are updated.
- **Task 17.**
  - Step 4 now runs `tests/stageC.metricContext.test.ts`, the frozen saved NVDA claims against their real records (lock-up, relative strength vs SPY, say-on-pay). Task 18 reuses the command.
  - A stop rule covers an existing test that moves.
- **Task 18 (`labelOperands`).**
  - The plan mapped `—` to `-`, which made the em dash an operator.
    - The real label "FCF conversion (latest, before SBC — the graded ratio)" (payload.ts:753) would have read as a difference.
    - Its correct paraphrase "The graded FCF conversion ratio before SBC (latest) was 0.95x." validates at HEAD (scratch check) and would have become unchecked.
    - Peer rows "AMD — Advanced Micro Devices, Inc." would also have been split.

    The em dash is now never an operator.
  - "Year over year" and "quarter over quarter" are normalized to yoy and qoq before splitting.
    - Without this, "over" in a comparison basis is a difference. Segment and accrual labels carry it (payload.ts:915-916, :2465-2466).
    - Task 19 would also misclassify a percentage-point change row named "… year over year". The scratch check shows such a row's "was down 1.2 percentage points" validates at HEAD and "rose" contradicts.
  - A grammatical "to" is no longer a ratio operator: "subject to", "attributable to", "related to", "relating to", "due to", "prior to", "up to" and "according to". The real label "investments subject to short-term lock-up restrictions as of …" (filingFacts.ts:172) is in the frozen fixture.
  - Operators are case-insensitive. The plan's own `priceToBook` unit check already required this.
  - `labelOperands` reads the label reading, not the label-plus-period string.
  - Operands are tokenized with Task 17's label reading.
  - The record-path rule now says which reading's order is tested and which reason is reported.
  - New controls: FCFC in both orders, and YOYG. New null unit checks for five real labels, plus one case-insensitivity check.
- **Task 19.**
  - The final id segment shares HEAD's numeric-suffix pop.
  - A synthetic `…-change-yoy` percentage-point row is added. It has an `isDeltaRecord` true assertion and controls whose direction verdicts must survive.
- **Review Focus 8.** It now names the em dash, "subject to" and the comparison-basis "over".
- **Task 0 Step 2a and Task 23 Step 3.** The fourth table's acceptance rule is replaced.
  - The old rule: each probe's "info" rows keep their base status, except OD-6's comparatives and Task 16's move-end validations.
  - Why it fails: the info blocks mix controls with further instances of each finding. Intended fixes would have stopped the batch under it:
    - AI-501 `level-undated`;
    - the AI-502 stray-word, divergence-increased and curve-fell rows;
    - AI-503-V1's stored-sentence rows;
    - AI-504 `capex-da-swapped`.

    So would the recall moves Task 9 causes: AI-503 `from-start`, and AI-503-V1 `ctl-to-first` ("went").
  - The new rule:
    - each info row now has its expected final status and the test row it maps to;
    - on the real excerpts, a `validated` target may read `unchecked / text-ambiguous` when a competing figure binds. Each such row is listed with its span;
    - rows are keyed by the probe's tag.
- **Self-review.** The types are updated: `moveHead`, `ownBeforeStart`, the `labelOperands` normalization and the `COMPARISON_BASIS` move into consistency.ts. So is the operand-order residual.

**Checked and left as they are**

- Task 16's base rule reads the raw 24 characters before a figure, and its candidate filter compares claim and source base flags. This holds up:
  - two-figure claims are already `text-ambiguous` at :745, so the claim-side flag only acts on one-figure claims;
  - table cells are never bases;
  - no existing stageC test claim puts a figure after from/compared/versus/against (grep of tests/);
  - a claim that copies a source's "range from $X" still binds, because both figures are bases.
- Task 17's `keepDirectionWords` runs after `metricTokens` lower-cases the label. So a proper noun such as "Advanced" in a peer label is now kept on the label side. It is also kept in the claim's kept reading, and the claim's attached direction (read in original case) skips proper nouns. The readings stay symmetric.
- No round-4 task touches B13's scope: statements, tag synonyms, Q4 derivation, FFO D&A or the quarterly-trend basis.
- No round-4 task touches `src/app`, a route handler or the proxy, so no Next.js guide applies.
- PAYLOAD_VERSION stays where it is (OD-6, alternative b).
- The B1 merge points are recorded in Task 29: `Context.base` beside B1's `Context.bases`, and `keepDirectionWords` beside B1's `loose`. B1's Task 6 does not conflict. It expects a year-ago figure cited as a level to stay `unchecked`, and Task 16's base filter gives the same result.

**Left for the main session**

- The Task 9 date-comma clarification changes the wording of an already-reviewed task. The behaviour is one Task 9's own control already required. Confirm it with the B2 implementer before Task 9 starts.
- `docs/superpowers/specs/2026-10-27-audit-remediation-decisions.md` section 4.1 should record OD-6: the verifier-side classification replaces the lean's payload kind field. The amending agent's note stands.
- `tmp/audit-2026-10-27/plans/B2.r4.summary.json` predates this review. Its Task 16 row count (31) and its Task 18 description do not include the changes above. This plan is the record.
- OD-6, alternative a drops HEAD's verdicts on comparatives for relative strength and actual-vs-guidance ("1.03 percentage points lower"). HEAD reaches them by accident, but they are correct. This review finds the fail-closed choice supported. A "than <operand>" reader is a follow-up candidate if the owner wants those verdicts back.

## Integration notes (2026-10-28)

Applied by the final integration step from `docs/superpowers/specs/2026-10-27-audit-remediation-decisions.md` section 4.3, "Main-session resolutions (2026-10-28)", line **B2**: "Confirm OD-2 rule 5, OD-4's issuer-prefix allowlist and OD-5's tighter mask: each is stricter, and each was checked by the reviewer. The spaced-dash range sign and "EPS" as a per-share basis are known residuals, recorded in B2's DECISIONS entry. The post-fix audit (verification plan V7) checks both." The review notes above are history and keep their wording; the two "Left for the main session" items they list for these calls are closed by the changes below. No task was added, removed or renumbered.

| # | Change | Where | 4.3 B2 clause it implements |
|---|---|---|---|
| 1 | A "Confirmed" paragraph: rule 5 (closed head-word disjointness) and the registry-id-only printed-source test | OD-2, after Sources | "Confirm OD-2 rule 5 … each is stricter, and each was checked by the reviewer" |
| 2 | A "Confirmed" paragraph: the issuer-prefix allowlist | OD-4, after Sources | "Confirm … OD-4's issuer-prefix allowlist" |
| 3 | A "Confirmed" paragraph: the tightened rating-gate mask | OD-5, after Sources | "Confirm … OD-5's tighter mask" |
| 4 | Task 25 writes eight entries; new entry 8 records the spaced-dash range sign and "EPS" as a per-share basis as known residuals (evidence, options, choice, validation by V7); commit message updated | Task 25 Steps 1 and 4 | "known residuals, recorded in B2's DECISIONS entry" |
| 5 | The disposition note gets a "Residuals for the post-fix audit (verification plan Task V7)" section naming both readings with their inputs; the two residual bullets point at entry 8 and V7 | Task 26 Step 2 | "The post-fix audit (verification plan V7) checks both" |
| 6 | Pointers from the tasks where the readings arise (Task 2's documented dash reading; Task 5's `perShareInWords` note) and from Self-review "Residual risks" to entry 8 and V7 | Task 2 Step 1, Task 5 Interfaces, Self-review | same |
| 7 | The PR states the three confirmations and the two known residuals in plain words | Task 29 Step 1 | whole B2 line (owner-facing record) |
| 8 | Global Constraints' DECISIONS line counts the conventions entry (6) and the residuals entry (8) besides the per-decision entries | Global Constraints | "recorded in B2's DECISIONS entry" |
| 9 | Spec line names section 4.3 as the settlement of this plan's open calls; the spec file exists (untracked), so the path is valid | header | (brief: fix the Spec line) |

**Not applied here, for the main session.** `docs/superpowers/plans/2026-10-27-audit-post-fix-verification.md` Task V7 is not owned by this step and was not edited. V7 says prior files "include every earlier merged file, so known findings are not re-reported"; to make 4.3's "V7 checks both" hold, V7's brief should name the B2 disposition note's "Residuals for the post-fix audit" section as probe targets, not as known findings.

`tmp/audit-2026-10-27/plans/B2.summary.json` was regenerated from this plan (30 tasks, Tasks 0-29; OD-1 to OD-6; the confirmations and the residuals entry).
