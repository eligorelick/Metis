# Derived Operating Lines from Filed Tags: EBIT Operands, Total D&A and One-Presentation Fourth Quarters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Make every operating line the SEC statement builder derives from filed tags (derived EBIT, D&A, R&D, a bank's interest income, FY-minus-nine-months and YTD-difference quarters, and the growth cells and FFO and forensic rules that read them) come from the filer's total on one presentation, or be withheld with the reason named, fixing the 11 B13 findings of the 2026-10-27 audit.

**Architecture:** The class is fixed where it starts, in the EDGAR resolver (`src/edgar/statements.ts`). A `first` synonym step gains component floors (`unlessBelow`), so a synonym below its own filed component is never the total. The derived-EBIT `sumAll` gains an optional interest part, a period-keyed nesting check and the filer's `OtherNonoperatingIncomeExpense`, and reads pretax income through the same chain as the `incomeBeforeTax` field. Derived quarters are paired through one new pure module, `src/edgar/presentationLineage.ts`, which both `statements.ts` and `financialEnrichment.ts` call. Consumers either read the corrected rows or call the same predicates: the REIT FFO stand-in, the forensic one-time-items rule, the quarterly-trend growth cells and the payload. Stored reports keep their bytes (D-67). One display-time rule marks legacy reports built from EDGAR statements.

**Tech Stack:** TypeScript on the Next.js 16 app. One task (Task 10) touches a React component rendered by Next.js (`src/components/report/ReportView.tsx`): read `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` before editing it. No task touches `src/app`, a route handler or `src/proxy.ts`. Tests use Vitest and are hermetic (`tests/setup` blocks live network). Fixtures are inline companyfacts trimmed from the public SEC facts the findings cite. Stage B fixtures use `tests/helpers/currencyBundle.ts` (`completeCurrencyBundle`), and stored-report fixtures use `tests/helpers/task28Report.ts`. Checks run through `npm run audit:deltas`.

**Spec:** `tmp/audit-2026-10-27/REPORT.md` (section 7, batch B13), `tmp/audit-2026-10-27/findings.json`, `docs/superpowers/specs/2026-10-27-audit-remediation-decisions.md` (section 2.7 lists this batch's decisions; section 3, conflict C-9, and section 4.3, "Main-session resolutions (2026-10-28)", are binding and are applied in this plan, see "Integration notes (2026-10-28)"). Where the spec's section 2.7 summary and this plan differ, this plan is the authority, except for the 4.3 resolutions, which this plan now follows.

**Branch:** `fix/edgar-derived-lines`, cut from an up-to-date `main` after B3 has merged (`git fetch origin && git switch -c fix/edgar-derived-lines origin/main`). REPORT.md section 7 sets the merge order B3, B13, B4: B13 goes before B4, because both change the derived-EBIT operands in `statements.ts`.

## Global Constraints

- Every finding gets a failing test first. If one cannot be made to fail at HEAD, skip it and say so in the PR. All 11 findings were re-read line by line against HEAD 6542531, which equals `origin/main`, and the code still reads as each finding describes. The probes were not re-run, because several of them rewrite evidence logs. Each task's Step 2 is therefore the first fresh confirmation, and a test that passes there unexpectedly means the finding is skipped and reported.
- Make the smallest change that fixes the whole class. No ticker-specific code: no CIK, symbol or company name in `src/`. No unrelated refactoring.
- One commit per task. Stage files by name (`git add <path> ...`), never with `git add -A` or `git add .`. The folders `tmp/`, `brag-output*/`, `docs/independent-audit-2026-10-19/` and the other plan files must stay uncommitted.
- Tests are hermetic: no live network, no FMP, SEC, Yahoo, FRED or AI calls, no paid calls, and never a report for a real ticker. Fixtures are synthetic, or inline companyfacts with the filed amounts the findings cite, copied from the public SEC facts (`docs/DATA-RIGHTS.md`: the SEC policy permits copying with attribution). Accession numbers in fixtures are synthetic. Never commit FMP rows, run-input snapshots or anything from `tmp/`.
- The probes in `tmp/audit-2026-10-27/probes/` are seeds only, so do not run them. Copy their logic into `tests/`, and drop every `fs` read of `tmp/` and every `fs.writeFileSync`.
- Every behaviour change updates `docs/METHODOLOGY.md` and any other markdown that describes it (`docs/RESEARCH.md`, `README.md`, `docs/superpowers/specs/2026-09-02-keyless-data-path-design.md`) in the same commit. Grep `docs/` and `README.md` for the old wording before committing.
- Version stamps move once, in Task 11: `STAGE_B_IMPLEMENTATION_VERSION` (`src/pipeline/runInputSnapshot.ts:30`), `PAYLOAD_VERSION` (`src/pipeline/stageC/payload.ts:421`) and `REPORT_SPEC_VERSION` (`src/report/schema.ts:139`). `tests/report.versionStamps.test.ts` moves with them. `PIPELINE_VERSION`, `SCORE_BANDS_VERSION`, `FAIR_VALUE_METHOD_VERSION` and `SCENARIO_TARGET_METHOD_VERSION` do not move: no Stage C pass, band table or valuation method changes, only the filed inputs they read.
- A payload change moves the golden pin in `tests/stageC.payload.passes.test.ts`, with a dated comment that says why (Task 12).
- Stored reports are never rewritten (D-67). The "needs reinterpretation" findings (FIN-507, FIN-508, FIN-509, FIN-509-V1, FIN-510, FIN-511-V1) get Task 10's display-time note.
- Never weaken a check or loosen a test to make it pass. A pin that encoded the defect is re-pinned in the owning task, with a comment naming the finding. That applies only to `tests/edgar.statements.test.ts:1378-1387`, the bank interest-income pin (Task 2), and to `:2476-2481`, the D-13 pin that kept a year-to-date copy a later filing re-filed by 6.67% (Task 7, OD-5 (a2′): it now expects a withholding, which is stricter). Two disclosure-text pins move because the disclosure says more, not less, and are re-pinned to the full new text in Task 5: `tests/edgar.statements.test.ts:2177-2179` (each subtracted item now carries its amount) and `:2197-2200` (the error band now also names `OtherNonoperatingIncomeExpense`).
- Every new `src/` file is added, in the commit that creates it, to `RISK_SOURCE_MANIFEST` (`vitest.shared.ts:31+`) and `EXPECTED_RISK_SOURCES` (`tests/risk.coverage.test.ts:19+`), after its neighbours (`src/edgar/synonymFloor.ts` and `src/edgar/presentationLineage.ts` after `src/edgar/tagSynonyms.ts`; `src/report/legacyEdgarDerivedLines.ts` after B3's `src/report/legacyPayloadRecordSafety.ts`). Without that, `tests/risk.coverage.test.ts` ("places every source file in the risk manifest, the core include, or the named exemption list") fails. The risk per-file floors (85/75/85/85) then apply to each new file.
- No new `getConfig()` read in Stage B: `tests/jobRunner.test.ts` pins the count, and no task here needs one.
- Code comments cite `docs/METHODOLOGY.md "<heading>"`, D-numbers or audit finding ids, never retired section numbers.
- New tracked files are `git add`ed before `tests/repository.release.test.ts` runs, because that test partitions `git ls-files`.
- D-numbers are assigned at merge time. Write "D-next" in DECISIONS, the CHANGELOG, code comments and the disposition note, and renumber at merge together with the stamp strings.
- Run `npm run audit:deltas -- --write --group b13-edgar-derived-lines-20261027` only after confirming that every changed leaf follows from a task here (Task 13).
- The before-and-after proof replays stored run inputs offline, behind a dead proxy, with no provider or model calls (Task 16).
- Never open `*.db`, `*.db-wal` or `*.db-shm`, and exclude `*.db*` from recursive greps. Reviewers follow the same rule.
- Run `npm run verify` in foreground chunks, one step at a time, never in the background (Task 17).

## Owner decisions

The owner delegated these calls: "Use your recommendation based on research to make this a professional accurate repository." Following the repository's one-entry-per-batch practice (D-110 to D-116), they are recorded together in one "D-next" entry in Task 15, with one bullet per decision. The brief's recommended defaults were checked against the sources below. Each subsection says whether the default was kept or refined, and why.

### OD-1. A period with the non-operating aggregate filed and no interest element (FIN-507)

- **Question.** A filer with no `OperatingIncomeLoss` may file pretax income and the `NonoperatingIncomeExpense` aggregate for a period while tagging no interest element and no cash-interest stand-in. LLY's 2026 10-Qs are the case. Should the derived EBIT extend B-39's convention to that period (pretax less the aggregate, interest not added back), or should the quarter be withheld with a note?
- **Decision.** Keep the brief's default and extend B-39.
  - Where the aggregate resolves for the period and no interest operand does, EBIT is pretax income less the aggregate.
  - It carries a B-39-style disclosure: no interest element is filed. The 2024 us-gaap calculation places nonoperating interest inside the aggregate. Where the filer's interest sits outside the aggregate on an untagged line, the figure understates EBIT by that interest.
  - Where neither the interest nor the aggregate is filed, the derivation is still refused. The refusal becomes a disclosed withholding of `operatingIncome` and `ebit` that names the missing operand. It is never a silent null, and it never uses the bank text "a bank-style filer" on the general route.
- **Alternatives rejected.**
  - Withholding the quarter with a note. It drops the two newest quarters of a large issuer for want of an operand that cannot change the B-39 result. TTM operating income is then suppressed and the DCF falls back to the 5-year median margin: LLY's value per share goes from $1,079.16 to $842.45 (−21.9%). The withholding would be honest, but it is less accurate than an identity the filing satisfies.
  - Adding back a zero interest. That invents a value (statements.ts invariant 1).
- **Revises.** D-105 (B-39). Its scope was a period that tags `InterestExpenseNonoperating` beside the aggregate, and it now also covers a period with the aggregate and no interest element. Also METHODOLOGY "Operating income when interest sits inside the non-operating total (B-39)" (`docs/METHODOLOGY.md:3875-3889`).
- **Sources.**
  - SEC Regulation S-X Rule 5-03 (https://www.law.cornell.edu/cfr/text/17/210.5-03), checked 2026-10-27. Captions 7 ("Non-operating income"), 8 ("Interest and amortization of debt discount and expense") and 9 ("Non-operating expenses") sit between the operating captions and caption 10 ("Income or loss before income tax expense"). Pretax income less the filer's total of captions 7-9 is therefore the operating result whenever interest is inside that total.
  - XBRL US Data Quality Committee rule DQC_0181 (https://xbrl.us/data-rule/dqc_0181). The rule flags `InterestExpense` or `InterestExpenseOperating` as a descendant of `NonoperatingIncomeExpense` and directs filers to "Select the nonoperating interest expense element InterestExpenseNonoperating instead". Under the 2024 taxonomy, nonoperating interest belongs inside the aggregate.
  - The repository's own LLY evidence (METHODOLOGY B-39): for LLY, pretax less the aggregate "is the operating result exactly". FY2025 comes out as 25,731 + 571 = 26,302 million.

### OD-2. A filer-tagged `OtherNonoperatingIncomeExpense` when the aggregate is absent (FIN-509)

- **Question.** Should the derived EBIT remove `OtherNonoperatingIncomeExpense` when the filer files no aggregate? At JNJ that line holds litigation charges and reversals. And how are filers whose "other" line contains interest guarded?
- **Decision.** Keep the brief's default and subtract it.
  - The element joins `EBIT_NON_OPERATING_ADJUSTMENTS` with `componentOf: "NonoperatingIncomeExpense"`, so it is subtracted only when the aggregate is absent (never twice).
  - Every derived-EBIT disclosure names it with its amount.
  - The guard is the taxonomy definition plus a disclosed error band, not a runtime arithmetic test. When the element is subtracted and an interest operand was added back, the disclosure adds a caveat: if the filer's "other" line already holds that interest, EBIT is overstated by the net interest added back (interest expense less investment income, stated in currency).
  - Refinement of the default: the brief asked for a guard "by the taxonomy calculation linkbase or by arithmetic against pretax".
    - The calculation linkbase is not in companyfacts (the existing caveat `EBIT_AGGREGATE_MAY_HOLD_INTEREST` already records this). Fetching each filing's `_cal.xml` would add a per-filing SEC request to the keyless path, so it is rejected.
    - The arithmetic test needs an independent operating subtotal, and a derived-EBIT filer files no `OperatingIncomeLoss`. Some filers tag `Revenues` and `CostsAndExpenses`, whose difference is an implied operating result (B4 Task 8 uses it for a Chevron-shaped placement test). But `CostsAndExpenses` has no fixed scope: ExxonMobil's "total costs and other deductions" includes interest expense. So it cannot serve as a general guard on the "other" line.
    - So the residual is disclosed with its amount, as B-39 already does for the aggregate.
- **Evidence (planner's offline scan of the 50 retained public companyfacts in `tmp/metis-audit-2026-10-22/scratch/sec-cache`, latest two 10-K years, no network).**
  - The test applied to each filer that files `OperatingIncomeLoss`, pretax income, `OtherNonoperatingIncomeExpense` and an interest element: does pretax − OI − other + interest − investment income come out at 0, or at the filed equity-method income?
  - It holds at BA (0, 0), PG (0, 0), VZ (0, −53 = equity method), TSLA (0, 0), SNOW (0, 0), KO (2,031 and 1,770 = equity method), AAPL, CSCO, AMZN, NVDA, EXPE and Rivian. At each of them the element excludes the separately tagged interest.
  - Counterexamples exist. NNN 2025 shows OI 589 + other −200 = net income 390, so its "other" holds the 204 of interest. eBay's 2014 10-K (SEC R82, below) tags an "Interest and other, net" total under the element.
  - Both counterexamples file `OperatingIncomeLoss`, so the derived EBIT never reaches them. The caveat covers the case where a non-OI filer does the same.
- **Alternatives rejected.**
  - Leaving the line inside EBIT with a note only. JNJ's 2026-09-27 EBIT stays at 65M (a 0.3% margin) instead of 5,845M. The DCF is 8.4% low, and the margin regime is misread as improving.
  - Subtracting only when the line is "small" next to interest. That heuristic has no basis in a standard.
- **Revises.** Commit 63e4fda's three-element adjustment list, which has no D-entry. `docs/METHODOLOGY.md:650-653` ("removes the non-operating results the filing discloses"), which now holds. The `describeDerivedEbit` wording for an absent aggregate.
- **Sources.**
  - SEC Regulation S-X Rule 5-03 (https://www.law.cornell.edu/cfr/text/17/210.5-03). Caption 7(d) "miscellaneous other income" and caption 9(b) "miscellaneous income deductions" are separate from caption 8, interest, so a residual "other" line is presented beside interest, not around it.
  - SEC R page, eBay FY2014 10-K, "Interest and Other, Net (Details)" (https://www.sec.gov/Archives/edgar/data/1065088/000106508815000054/R82.htm). The page shows `OtherNonoperatingIncomeExpense` used for an interest-inclusive total, which is the counterexample the caveat exists for.
  - DQC_0181 (https://xbrl.us/data-rule/dqc_0181). Nonoperating interest has its own element under the aggregate, a sibling of the "other" element.

### OD-3. A stand-in for the keyless one-time-items operand (FIN-509-V1)

- **Question.** Should the keyless `totalOtherIncomeExpensesNet` fall back to `OtherNonoperatingIncomeExpense` when the aggregate is absent, or should the rule report that it was not evaluated?
- **Decision.** The research supports the "not evaluated" disclosure, without a stand-in.
  - When no lookback year has both operands, `computeSupportFlags` pushes an info gap, `forensics.flags.oneTimeItems`, saying the rule was not evaluated and why. The classic section's sentence ("Unavailable or inapplicable checks are disclosed above and in the missing-data manifest", `sections.tsx:1266`) then becomes true.
  - RESEARCH 5.3 gains one sentence: the keyless route reads only the aggregate, and a missing aggregate is disclosed as an unevaluated check.
- **Alternatives rejected.**
  - The `OtherNonoperatingIncomeExpense` stand-in.
    - The element means two different things across filers (OD-2's scan). At NNN it is mostly recurring interest, so the stand-in would raise a false "serial one-time items" flag for interest expense.
    - It is narrower than the aggregate that RESEARCH 5.3 and its 10% threshold were set on.
  - Pretax − OI as the stand-in, which is FMP's field identity in the repository's own fixture `fixtures/fmp/incomeStatement/DEMO.json`, where operating income + other = pretax.
    - It would add interest-driven breaches for 12 panel filers (VZ, BA and the utilities) under an uncalibrated threshold.
    - It is a new method, beyond what the finding asks for.
- **Revises.** RESEARCH 5.3's "Missing operands are unevaluable" now also says the gap is disclosed. No D-entry existed for the rule.
- **Sources.**
  - `docs/RESEARCH.md:535-544` (5.3 house rule: "These flags use aggregate `totalOtherIncomeExpensesNet` ... Missing operands are unevaluable").
  - SEC R82 (eBay) and the NNN arithmetic above: the narrower element is not a reliable stand-in for the aggregate.
  - The module's own convention at `forensics.ts:2267-2269`, which says a check that cannot run should "emit a disclosed gap instead of being skipped silently".

### OD-4. Which first-hit synonym is the total (FIN-510, FIN-510-V1, FIN-510-V2)

- **Question.** How should the resolver stop publishing a subset figure from the first synonym that has the period? Examples: MCD D&A of 457M beside its own `Depreciation` of 1,600M, JNJ annual R&D of 109M beside its face R&D of 14,665M, and JPM interest income of 28.0B beside its total of 193.3B.
- **Decision.** Keep the brief's default, "fix the class in the synonym resolver, not per tag", and refine it into a rule that holds only where the taxonomy defines the order.
  - A `first` step gains `unlessBelow?: string[]`. A synonym whose value is below the same period's value of any listed component tag cannot be the total, so the step skips it with a note and tries the next synonym. If none passes, the chain falls to its next step.
  - Floors are declared only where a us-gaap definition puts the floor element inside the figure the line item stands for.
    - The field `depreciationAndAmortization` is the filer's total D&A. Total D&A contains total depreciation, which us-gaap `Depreciation` is by definition ("Includes production and non-production related depreciation"), and the amortization of intangibles (`AmortizationOfIntangibleAssets`). So no synonym below either can serve as the total.
      - `DepreciationDepletionAndAmortization` is by definition "the aggregate expense ... that allocates the cost of tangible assets, intangible assets, or depleting assets". A value below a component is a mis-tagged subset line, which is MCD's case.
      - `DepreciationAndAmortization` is by definition the NON-production charge ("long-lived, physical assets not used in production ..."). A value below `Depreciation` shows the filer tagged that non-production subset, which is also not the total.
      - `DepreciationAmortizationAndAccretionNet` is a net figure that includes accretion. A value below a component is likewise not the total.
      - So the floor holds for all three synonyms. It does not claim that each element is a taxonomy parent of `Depreciation`. A `DepreciationAndAmortization` at or above `Depreciation` that is still non-production-only cannot be detected from companyfacts. That residual is HEAD behaviour and is recorded in Task 14.
    - `ResearchAndDevelopmentExpense` must not be below `ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost`. The first is defined as "the aggregate costs incurred ... charged to research and development projects, including the costs of developing computer software ... and costs allocated in accounting for a business combination to in-process projects". The second is the same scope "excluding in-process research and development acquired in a business combination" and "excludes software research and development". The first therefore contains the second.
  - A house rounding tolerance keeps a total that differs from a component only by rounding: `SYNONYM_FLOOR_TOLERANCE = { relative: 0.005, absolute: 2_000_000 }`. A candidate fails only when it is below the component by more than `max(0.5% × component, 2,000,000)` in the row's currency.
    - Why an absolute term (review change): a derived quarter is the difference of two figures each rounded to the filer's reporting precision (±0.5 million for most large filers). Comparing two derived quarters can therefore differ by up to 2 million for rounding alone. That is 2% of a 100-million quarter, so the relative term alone would push such a quarter off its combined tag onto a lower-bound composition.
    - The absolute term only makes the floor more lenient, which means HEAD behaviour, and it is far below the subset gaps the floor exists for (MCD 457M against 1,600M; CSCO 700M against 916M).
    - B4's `EQUITY_METHOD_PLACEMENT_TOLERANCE` (relative + absolute) is the precedent for the shape.
  - When every combined D&A synonym is below a component and no `Depreciation` + amortization composition is filed (CSCO FY2026: combined 700M, amortization 916M, no `Depreciation`), D&A is withheld with the reason. It is not published as a lower bound, because METHODOLOGY B-7 says amortization alone is never D&A.
  - The REIT FFO stand-in (`computeNareitFfo`) applies the same floor through the same predicate.
  - A bank's `interestIncome` resolves with the operating total first (`InterestIncomeOperating`, then `InterestAndDividendIncomeOperating`, then the investment elements). That matches the vendor field's meaning for a bank. The non-bank order (investment interest first) is unchanged.
- **Alternatives rejected.**
  - The largest synonym. It can pick `DepreciationAmortizationAndAccretionNet`, which includes accretion, or a broader balance of another scope (FIN-510's own fix risk).
  - A floor at the sum of `Depreciation` and `AmortizationOfIntangibleAssets`. Filers' "Depreciation" scopes overlap with amortization of software and leases, and amounts are rounded differently across notes, so the sum floor would reject correct totals.
  - A lower-bound caveat on a figure known to be partial. A figure below its own component is not a lower bound on D&A, it is a different line.
  - A floor for HD-style deferred revenue (`ContractWithCustomerLiabilityCurrent` beside `DeferredRevenueCurrent`). The two elements are siblings with no definitional order, companyfacts does not say which one is the balance-sheet line, and nothing reads the field. The sub-case is left as it is and recorded (findingsSkippedOrDisputed).
- **Revises.**
  - METHODOLOGY "D&A from separate lines (B-7)" (`docs/METHODOLOGY.md:3647-3660`), which treated a combined tag as the complete figure.
  - The tagSynonyms header ("the first tag present for the period wins").
  - The bank interest-income pin at `tests/edgar.statements.test.ts:1378-1387`. Its non-operating premise holds for a non-bank, not for a bank.
  - No D-entry is revised for the FFO stand-in. D-31 (`docs/audit/DECISIONS.md:1612-1621`) says reconstructed FFO is "always approximate" with "no guaranteed error bound", and that stays true. What the fix restores is the stand-in's stated error direction in the code comment at `src/pipeline/stageB/financialMetrics.ts:327-331` ("adding it back puts FFO at or ABOVE the definition, the same direction the total-D&A stand-in errs in"), which a subset add-back contradicted.
- **Sources.**
  - The us-gaap element definitions, as reproduced in filers' XBRL viewers (checked 2026-10-28):
    - `DepreciationDepletionAndAmortization`: "The aggregate expense recognized in the current period that allocates the cost of tangible assets, intangible assets, or depleting assets to periods that benefit from use of the assets" (https://sec.gov/Archives/edgar/data/1547903/000154790321000055/R77.htm; also https://investor.columbia.com/sec-filings/quarterly-reports/xbrl_doc_only/3409).
    - `DepreciationAndAmortization`: "The current period expense charged against earnings on long-lived, physical assets not used in production, and which are not intended for resale, to allocate or recognize the cost of such assets over their useful lives; or to record the reduction in book value of an intangible asset over the benefit period of such asset; or to reflect consumption during the period of an asset that is not used in production" (https://ir.geegroup.com/annual-reports/xbrl_doc_only/1596).
    - `Depreciation`: "The amount of expense recognized in the current period that reflects the allocation of the cost of tangible assets over the assets' useful lives. Includes production and non-production related depreciation" (reproduced in filers' R pages, e.g. https://www.intc.com/filings-reports/quarterly-reports/xbrl_doc_only/4283).
    - `ResearchAndDevelopmentExpense` and `ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost`, as quoted above (https://www.stock-analysis-on.net/Knowledge-Base/Research-and-Development-Expense and https://www.stock-analysis-on.net/Knowledge-Base/Research-and-Development-Expense-Excluding-Acquired-in-Process-Cost, which reproduce the taxonomy definitions).
  - `docs/METHODOLOGY.md:3647-3660` (B-7): "Amortization alone is never taken as D&A."
  - `src/pipeline/stageB/financialMetrics.ts:327-331` and D-31, as above.

### OD-5. Derived fourth quarters and YTD differences on one presentation (FIN-511, FIN-511-V2)

- **Question.** D-13 says a derived Q4 uses "one filing lineage ... or discloses that it cannot". Lineage by filing date is not lineage by presentation. What happens when a 10-K recast or re-presented the year?
- **Decision.** Keep the brief's default with two sharpenings, and conflict C-9's resolution (decisions spec 4.3, binding). The same rule runs in the statement builder and in `financialEnrichment.filedFlow`, through one helper (`oneBasisPair`, Task 7).
  - (a) Suppose the dedup winner of the minuend (FY, or a prior-year YTD) was re-filed by a later filing, not an amendment, with any value different from its first-reported copy, AND the subtrahend its lineage nets it against did NOT move with it (that copy equals its own first-reported copy). What happens next depends on what the re-filing shows (C-9):
    - **(a1) Within `RESTATEMENT_THRESHOLD_PCT` (1%) of the first-reported copy** (a precision-only re-rounding, as LLY's and AEP's 2026 10-Ks show), **or a re-presentation the re-filing labels as such**: the quarter is derived from the first-reported minuend and the subtrahend that first filing's lineage saw. That is the quarter as first reported, on one basis by construction. If that lineage has no subtrahend, the quarter is withheld.
    - A re-filing **labels** a re-presentation when the same filing carries, for the same period (same start and end), a non-zero fact of a discontinued-operations element (`netIncomeFromDiscontinuedOperations`, `discontinuedOperationsIncome` and `epsDiscontinuedOperations` tags, `DISCONTINUED_LABEL_TAGS`, already parsed by the builder) that is new in that filing or moved by more than 1% from its first-reported copy. ASC 205-20-45-3 requires the statement that reports net income "for current and prior periods" to report the results of the discontinued operation, and ASC 205-20-45-3A requires them "as a separate component of income", so a re-presentation for a discontinued operation carries that line for the re-presented period (FRM 13210.1: "retrospective reclassification of all prior periods"). No other label reaches companyfacts: a retrospective change in accounting principle or a reclassification is labelled in dimensional facts (the restatement axis) or in text, and the SEC's XBRL APIs aggregate only facts that "Apply to the entire filing entity".
    - **(a2) Otherwise, a material change of a previously reported figure that is not shown to be a re-presentation**: the quarter is withheld, and the note names both filings (the first-reported copy's and the re-filing's). If the change corrects an error, the corrected figure replaces the original (ASC 250-10-45-23, as B6 OD-9 applies it: the prior periods "shall be adjusted to reflect correction of the period-specific effects of the error"), so the first-reported copy is a superseded figure; if it is an unlabelled re-presentation, companyfacts cannot show it. The re-filed figure has no subtrahend on its own basis. Either way no one-basis pair is on file. BAC Q4 2024 is this case: FY2024 revenue moved from 101,887M (10-K 2025-02-25) to 105,856M (10-K 2026-02-25), +3.90%, and the 2026 10-K files no discontinued-operations element for FY2024 (offline check of the retained companyfacts, 2026-10-28; no accounting-change element either). So Q4 2024 is withheld, not 25,347M (the first-reported pair) and not 29,316M (HEAD's mixed pair). FIN-511's probe accepts either the one-basis pair or a withholding.
    - **(a2′) The subtrahend side of the same rule (post-integration review).** C-9's line covers "a material change to a previously reported figure", and the subtrahend is one. Suppose a filing made after the minuend's re-filed a subtrahend the pair nets (the year to date, or a quarter of the FY − (Q1+Q2+Q3) fallback) by more than 1% and labels no re-presentation for that period. The quarter is then withheld, and the note names the subtrahend's filing, the re-filing and the move.
      - Example: FY 400 in the 10-K of 2026-02-13, nine months 300 in the 10-Q of 2025-10-30, the nine months re-filed as 280 in a 10-Q of 2026-05-01.
      - HEAD and the reviewed plan kept the lineage copy here (`tests/edgar.statements.test.ts:2476-2481`, D-13: "netting it against the 10-K FY figure would publish a quarter neither filing reported"). That is right about the later copy, which must not be netted against the 10-K. But it publishes the quarter from the copy that a correction supersedes (ASC 250-10-45-23), the case C-9 withholds on the minuend side.
      - A later copy within 1% (a re-rounding), or one its filing labels with a discontinued-operations line for that period, leaves the pair as first reported, as in (a1).
      - The rule applies to every pair `oneBasisPair` keeps, so the minuend side and the subtrahend side are one test.
      - Offline scan of the 45 census snapshots' own companyfacts on 2026-10-28, with no SEC call (`tmp/audit-2026-10-27/plans/B13-post-int/subtrahend-refiled.cjs`). It covered `Revenues`, `RevenueFromContractWithCustomerExcludingAssessedTax`, `SalesRevenueNet`, `OperatingIncomeLoss`, `NetIncomeLoss`, pretax and CFO, FY2023 on. No FY minuend that is not re-filed has a lineage nine-month subtrahend re-filed later by more than 1%. The later copies that exist, the Q3 2026 10-Qs of JNJ, T, NFLX, AAPL and DIS, re-file their nine months unchanged. So no census figure moves.
      - This also matches B9's segment rule (B9 OD-11 (a): a cross-filing fourth quarter is kept only when both operands' filings are on the current presentation).
    - The two review sharpenings below decide whether the minuend counts as re-filed at all, so they apply before (a1) and (a2) (`oneBasisPair` rules 1 and 2).
    - Review sharpening 1 (moved together). When the subtrahend in the winner's lineage was itself re-filed with a different value, the two moved together, so the winner pair is kept as today, subject to (b).
      - That is the usual discontinued-operations sequence under FRM 13110.4: the post-event Q3 10-Q re-presents the prior nine months, then the 10-K re-presents the prior year.
      - Switching that pair to the first-reported copies would put the prior-year Q4 back on the old basis, while the Q2 and Q3 beside it stay on the 10-Q re-presentation.
      - FIN-511-V2's evidence notes this one-basis case: LLY and BRK FY2022, "re-presented together with their nine months, so their pairs are one-basis".
    - Review sharpening 2 (amendments). A winner filed on an amendment (`form` ending `/A`) corrects its own report. It stays in the minuend's lineage as today, and is never replaced by the pre-correction copy it superseded.
  - (b) If the minuend's own filing re-presented this concept (it carries a copy of an earlier period that moved by more than `RESTATEMENT_THRESHOLD_PCT`, 1%, from that period's first-reported copy) and the subtrahend's filing did not, the quarter is withheld. The note names both filings. The 1% threshold keeps a precision-only re-rounding, which LLY's and AEP's 2026 10-Ks show, from withholding a quarter.
  - A later nine-month copy filed after the minuend is never used. That is D-13's lineage rule, so after the event a dash remains until the quarter leaves the window.
  - A withheld Q4 revenue already suppresses the TTM (`revenueCount < 4`, `compute.ts:1241-1255`), which then falls back to the audited annual statement. That annual is on one presentation.
- **Alternatives rejected.**
  - Netting a later re-presented nine-month copy against the 10-K. The copy can carry a further event, and nothing in companyfacts proves it does not.
  - Keeping the mixed pair for a small re-filing (a materiality threshold that switches to the first-reported pair only above it). AEP's 0.3M re-rounding then still mixes two copies, and the A-11 vendor tolerance (0.01%) rejects a correct vendor CFO (FIN-511-V2 (c)). (a1) switches below the threshold instead.
  - Keeping the first-reported pair for every material re-filing (this plan's reviewed rule before C-9). When the change corrects an error, ASC 250-10-45-23 makes the first-reported copy a superseded figure, and companyfacts cannot tell a correction from an unlabelled re-presentation (the `Restatement` doc comment in `statements.ts`: "companyfacts carries nothing that separates the two"). Publishing it would contradict B6 OD-9, which treats a restated figure as replacing the original for every use (decisions spec section 3, C-9).
  - Reading net-income invariance as a re-presentation label (BAC's FY2024: revenue +3.90%, net income −0.59%). A classification error also leaves net income unchanged. It is an inference, not something the filing labels.
  - Withholding every prior-year Q4 whose FY was re-filed. That drops quarters that have a one-basis first-reported pair on file (precision-only re-filings and labelled re-presentations).
  - The planner's first draft of (a): switch to the first-reported pair whenever the FY was re-filed with any different value. That puts a prior-year Q4 back on the old basis when the 10-Qs had already re-presented its nine months. It would also replace a 10-K/A's corrected FY with the uncorrected original. Both regress against HEAD, so the "moved together" and amendment conditions above replace it.
- **Revises.** D-13 ("one filing lineage" now means one presentation, with filing-date lineage as the minimum), statements.ts invariant 3 (`src/edgar/statements.ts:29-40`) and `tests/edgar.statements.test.ts:2446-2493`, which stay green unchanged except the one pin (a2′) revises: "keeps using that copy when a LATER filing restated the year-to-date figure" (`:2476-2481`) now expects a withholding that names both 10-Qs, not 400 − 300 = 100 (Task 7 Step 4). The other two tests in that block (no later copy; every copy younger than the 10-K) are unchanged. Agrees with B6 OD-9 (ASC 250: a restated figure replaces the original), which this plan does not edit: B13 never derives a quarter from a first-reported copy that a material, unlabelled re-filing may have superseded, and its annual rows keep the last-filed (restated) value, as today.
- **Sources.**
  - FASB ASC 250-10-45-23, as summarised in PwC Viewpoint, *Financial statement presentation guide* 30.7 (https://viewpoint.pwc.com/dt/us/en/pwc/accounting_guides/financial_statement_/financial_statement___18_US/chapter_30_accountin_US/307_correction_of_an_US.html), the source B6 OD-9 re-read on 2026-10-27: the financial statements for each prior period presented "shall be adjusted to reflect correction of the period-specific effects of the error".
  - FASB ASC 205-20-45-3 and 45-3A, as reproduced in Deloitte's Roadmap, *Impairments and Disposals of Long-Lived Assets and Discontinued Operations*, 7.3 (https://dart.deloitte.com/USDART/home/codification/presentation/asc205-20/roadmap-disposals-long-lived-assets-discontinued-operations/chapter-7-presentation-disclosure-requirements-for/7-3-income-statement-presentation-discontinued), checked 2026-10-28: "The statement in which net income of a business entity is reported … for current and prior periods shall report the results of operations of the discontinued operation"; "The results of all discontinued operations, less applicable income taxes (benefit), shall be reported as a separate component of income."
  - SEC, "EDGAR Application Programming Interfaces" (https://www.sec.gov/search-filings/edgar-application-programming-interfaces), checked 2026-10-28: the XBRL APIs aggregate facts that "Use a non-custom taxonomy" and "Apply to the entire filing entity". So a restatement-axis label, which is dimensional, does not reach companyfacts.
  - SEC Financial Reporting Manual, Topic 13 (https://www.sec.gov/corpfin/cf-manual/topic-13), checked 2026-10-27.
    - 13210.1: a discontinued operation requires "retrospective reclassification of all prior periods to report the results of that component in discontinued operations".
    - 13110.3: if the pre-event statements are not reissued, the "annual information does not need to be retrospectively revised until that information is included in the registrant's next Annual Report on Form 10-K".
    - 13110.4: "Retrospectively revised quarterly information is required in Form 10-Qs filed with post-event financial statements".
    - Together these mean a 10-K can present the year on a new basis while the 10-Q nine months filed before it stay on the old one, which is the mixed pair this rule refuses.
  - D-13 (`docs/audit/DECISIONS.md:1737`).

### OD-6. Quarterly growth across a re-presentation (FIN-511-V1)

- **Question.** Should a YoY or QoQ cell use first-reported-basis growth, or show a dash with a note, when a later 10-Q re-presented one of its two quarters?
- **Decision.** Refine the brief's default (a dash with a note). A cell is computed on the basis of the quarter it is printed beside.
  - Where the comparison quarter was re-presented after the printed quarter's own supplying filing, and its first-reported copy was filed on or before that filing, the cell divides by the first-reported copy, which is on the printed quarter's basis. A note names both filings. Example: BAC Q3 FY2025 QoQ is 28,088 / 26,463 = +6.14%, not +2.4%.
  - Where the printed quarter itself was re-presented after its comparison's supplying filing, and the comparison has no copy on the new basis, the cell is a dash with a note. Examples: BAC Q1 and Q2 FY2025 YoY.
  - Cells whose quarters were both re-presented, or neither was, are unchanged. Example: Q2 FY2025 QoQ −2.8%.
  - The payload follows: a dashed cell registers no figure, and the basis note travels in the section notes.
  - Why refine:
    - Under FRM 13110.4 no later 10-Q re-presents the prior-prior year, so "dash everywhere" would blank YoY cells for up to two years.
    - The refined rule keeps every cell that one filed presentation supports and never prints a growth rate on a different basis from the level beside it.
    - A rate that could be applied to the printed level to imply a quarter no filing reported is the inconsistency to avoid.
- **Alternatives rejected.**
  - First-reported growth everywhere. Q2 FY2025 YoY would then sit beside a re-presented level of 27,443 while being computed on 26,463, and the row would not reconcile.
  - A dash everywhere, for the reason above.
- **Revises.** D-13 (extended from the derived Q4 to the growth cells) and `src/report/filingDisclosurePresentation.ts:120` (the table note).
- **Sources.** SEC FRM 13110.4 (as above), D-13, and `docs/METHODOLOGY.md` "Quarterly trend" (Task 9 adds the paragraph).
- **Decided after C-9 (decisions spec 4.5, O-1).** The question the integration left open is decided: keep OD-6. A growth cell after a material, unlabelled re-presentation of its comparison quarter still divides by that quarter's first-reported copy when it is on the printed quarter's basis (BAC Q3 FY2025 QoQ +6.14%). A rate on the printed quarter's own filed basis publishes no superseded level. The post-fix audit (verification plan V7) checks for any cell that cannot be reconciled. OD-5 (a2′) concerns derived quarters only and does not change this.

### Recorded rules revised without an owner decision

- **FIN-508.** B-39 (D-105) was keyed on the serving interest tag. It is now keyed on the period: if the filer tags this period's interest as `InterestExpenseNonoperating` in any filing, the interest is inside the aggregate and is not added back (DQC_0181, OD-1).
- **FIN-507-V1.** The derived-EBIT pretax operand reads the same chain as the `incomeBeforeTax` field: the total, else the B-32 domestic + foreign composition. This is a mechanical extension of B-32 (DECISIONS.md:2159).
- **FIN-510-V2 and FIN-511-V2.** The FFO stand-in and the vendor-enrichment derivation share the statement builder's predicates. The enrichment conflict text says "derived ... (fiscal year less nine months)" for a derived SEC value.

## Review Focus

These are the input classes most likely to bite that no existing test exercises. Each line has a test in the named task.

1. **A presentation change first reported in a 10-Q, before the 10-K.** Both the nine-month subtrahend and the FY minuend are on the new basis, so the derived Q4 must be derived, not withheld (Task 7, `it("a re-presentation first filed in a 10-Q leaves the FY − YTD pair on one basis")`).
2. **Precision-only re-filing** (LLY FY2023 6,554.6 → 6,554.0; AEP CFO 6,804.3 → 6,804.0). It must not withhold any quarter or raise a restatement flag. It switches only a prior-year minuend to its first-reported copy (Task 7 `it("a precision-only re-filing switches to the first-reported pair and withholds nothing")`; Task 8 `(c)`).
3. **A floor skip followed by a later chain step that resolves.** MCD-like combined D&A below `Depreciation`, with no other combined synonym but `Depreciation` and amortization filed. The composition serves with its lower-bound disclosure and the field must NOT also carry a withholding. A component within the rounding allowance (the larger of 0.5% and 2 million) never trips the floor (Task 1).
4. **A derived EBIT with the interest part omitted beside filed components of the aggregate.** The aggregate filed, no interest, and `InvestmentIncomeInterest` and `OtherNonoperatingIncomeExpense` filed too. The `componentOf` skip must still apply, so nothing is subtracted twice and the interest is not invented (Task 3 and Task 5 tests).
5. **A quarterly-trend window with a withheld derived Q4 (null revenue) between re-presented quarters, and rows with no provenance (FMP route).** Growth is never computed against a null, a note is never duplicated, and FMP-route rows are unchanged (Task 9).
6. **A probe with side effects** (review addition). A floor tag (Task 1) or the period-keyed `InterestExpenseNonoperating` probe (Task 4) is resolved through the same `sameRowEvidence` / `quarterResolver` path. That path writes `period_mismatch` and `mixed_unit` withholdings and "not derived" notes for the field being resolved. A probe must write none of them, so it runs inside `notes.quietly(...)` (Task 1). Test: Task 1 `it("a floor probe that cannot resolve writes no note and no withholding")`.
7. **A prior-year minuend re-presented together with its nine months** (review addition): the winner pair stays (Task 7 `it("a re-presentation first filed in a 10-Q leaves the FY − YTD pair on one basis")`, Q4 2024 assertion). **A 10-K/A that corrects the FY** keeps the corrected pair (Task 7 `it("an amended 10-K keeps its corrected FY as the minuend")`).
8. **A presentation refusal on the first synonym of a line item** (review addition). For example, `Revenues` is withheld for a quarter while `RevenueFromContractWithCustomerExcludingAssessedTax` (a narrower subset) is filed and was never re-presented. A refusal ends that `first` step, so the subset never serves as the quarter's revenue (Task 7 `it("a presentation refusal is not bypassed by a narrower revenue synonym")`).
9. **A refusal inside a derived-EBIT part.** When pretax income itself is withheld for mixed presentation, the operating-income withholding quotes that reason. It must not say "not filed" (Task 3 interface; Task 7 `it("a derived EBIT whose pretax part is withheld for presentation quotes that reason")`). Likewise a filed operating income withheld for presentation is not re-derived (Task 7 `it("a filed operating income withheld for presentation is not re-derived from pretax income")`).
10. **A material re-filing of a prior-year minuend, labelled or not** (integration addition, C-9). The same 20% re-filing keeps the first-reported pair when the re-filing files a new discontinued-operations line for the period, and is withheld naming both filings when it files none, or files one unchanged since first reported (Task 7 `it("C-9: a re-presentation the re-filing labels with a discontinued-operations line keeps the first-reported pair")` and its control; BAC shape; Task 8 `(b)` and `(d)`).
11. **A subtrahend re-filed after the minuend's filing** (post-integration review, C-9 on the subtrahend side). The FY is filed once, and the nine months it is netted against are re-filed later by 6.67% with no label. The quarter is withheld naming both 10-Qs; a re-rounding within 1%, or a labelled re-filing, keeps 400 − 300; the later copy is never netted (Task 7 `it("C-9, subtrahend side: …")` and its controls; the D-13 pin at `tests/edgar.statements.test.ts:2476-2481` is re-pinned).

## Tasks

The task order follows the dependencies:
- Task 1 introduces the resolver mechanisms (`unlessBelow` and `NoteSink.refuse`) that Tasks 3, 4 and 7 reuse.
- Task 7 introduces `presentationLineage.ts`, which Task 8 reuses.
- Task 10 needs Tasks 1-9.

Shared test helpers live at the top of `tests/edgar.derivedLines.audit20261027.test.ts` (new):

```ts
const SPLITS = { status: "retrieved", source: "test", events: [], coverage: [{ from: "2000-01-01", to: "2026-12-31" }] } as const;
type Filing = { filed: string; form: string; fp: string; fy: number; accn: string };
const fact = (f: Filing, start: string | undefined, end: string, val: number) => ({ ...f, ...(start ? { start } : {}), end, val });
const companyFacts = (usGaap: Record<string, unknown[]>) => ({ cik: 99, entityName: "Synthetic Co",
  facts: { "us-gaap": Object.fromEntries(Object.entries(usGaap).map(([t, p]) => [t, { label: t, units: { USD: p } }])), dei: {} } });
const build = (usGaap: Record<string, unknown[]>, opts: Partial<StatementBuildOptions> = {}) =>
  buildStatementsFromCompanyFacts(companyFacts(usGaap) as never, { symbol: "SYN", cik: "0000000099", annualPeriods: 4,
    quarterlyPeriods: 8, asOf: "2026-10-22", factsObservedAt: "2026-10-22T00:00:00.000Z", vendorSplits: SPLITS as never, ...opts });
const M = 1_000_000;
const K25: Filing = { filed: "2026-02-24", form: "10-K", fp: "FY", fy: 2025, accn: "0000000099-26-000001" };
const fy25 = (val: number) => [fact(K25, "2025-01-01", "2025-12-31", val)];
```

### Task 1: A synonym below its own filed component is never the total (FIN-510, FIN-510-V1 R&D sub-case, FIN-510-V2)

**Files:**
- Create `src/edgar/synonymFloor.ts` (pure, no imports).
- Modify `src/edgar/tagSynonyms.ts`:
  - `:1-25`, the header: "within a line item the first tag present for the period wins, unless it is below a component the line item declares";
  - `:30-44`, `TagSynonymEntry` gains `unlessBelow?: readonly string[]`, and `entry()` takes it as an optional third argument;
  - `:229-232`, `researchAndDevelopmentExpenses` gets `unlessBelow: ["ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost"]`;
  - `:258-262`, `depreciationAndAmortization` gets `unlessBelow: DEPRECIATION_COMPONENT_TAGS`;
  - `:494-503`, add `export function floorsFor(item: LineItem): string[]`.
- Modify `src/edgar/statements.ts`:
  - `:402-447`, the `first` member of `ChainSpec` gains `unlessBelow?: readonly string[]`;
  - `:503-507`, `lineItemChain` copies `floorsFor(item)` onto its `first` step when non-empty;
  - `:1253-1270`, `collectTags` also adds each `first` step's `unlessBelow` tags. Only tags in `NEEDED_US_GAAP_TAGS` are parsed into the fact index (`:1273`), so an uncollected floor would never resolve. B13's floors are already collected through other chains, but B4's `EquityMethodInvestments` floor and any later one need this;
  - `:630-650`, `DEPRECIATION_SPEC`'s first step gets `unlessBelow: [...DEPRECIATION_COMPONENT_TAGS]`;
  - `:1507-1543`, `NoteSink` gains `readonly refusals: string[]`, `refuse(text: string): void` and `quietly<T>(fn: () => T): T`;
  - `:1615-1630`, the `first` case applies the floor;
  - `:2802-2807`, the field loop in `buildStatementRows` turns a refusal recorded during a field's own resolution into a withholding when that field ends null.
- Modify `src/pipeline/stageB/financialMetrics.ts:347-350` (the comment) and `:1820-1826` (`totalDa` resolution).
- Modify `vitest.shared.ts` (`RISK_SOURCE_MANIFEST`) and `tests/risk.coverage.test.ts` (`EXPECTED_RISK_SOURCES`): add `src/edgar/synonymFloor.ts` after `src/edgar/tagSynonyms.ts` (Global Constraints).
- Test: `tests/edgar.derivedLines.audit20261027.test.ts` (`describe("component floors")`) and `tests/stageB.reitFfoTotalDa.audit20261027.test.ts`.

**Interfaces:**
- Produces (`src/edgar/synonymFloor.ts`):
  ```ts
  /** House rounding allowance (D-next): a total below a component by no more than max(0.5% of the
   *  component, 2,000,000 in the row's currency) differs by rounding only; the absolute term covers
   *  two derived quarters compared with each other (each the difference of two rounded figures). */
  export const SYNONYM_FLOOR_TOLERANCE = { relative: 0.005, absolute: 2_000_000 } as const;
  /** The first component the candidate total sits below (beyond the tolerance), or null. Only a
   *  non-negative candidate and a positive component are compared; a negative or zero component is never a floor. */
  export function belowComponentFloor(candidate: number, components: readonly { tag: string; value: number }[]): { tag: string; value: number } | null;
  ```
- Produces (`ChainSpec`): `{ kind: "first"; tags: string[]; unit: UnitKind; sign?: -1; disclose?: string; unlessBelow?: readonly string[] }`. Semantics, which B4's Task 8 must reuse for its long-term-investments chain instead of adding its own field:
  - each synonym is checked on its own;
  - a synonym below a floor tag's same-period value is skipped with a note, and the next synonym is tried;
  - if every present synonym is skipped, the step returns null, records a refusal and lets the chain fall to its next step;
  - floor tags are resolved with the same `TagResolver`, only after a candidate is found, AND inside `notes.quietly(() => resolve(floorTag, spec.unit))`.
    - The resolver is `sameRowEvidence` → `slot.resolve` → `quarterResolver`. All three write into this same `NoteSink`: `period_mismatch` and `mixed_unit` withholdings for the field being resolved (`statements.ts:2776-2805`), and "not derived" notes (`:1990-1997`).
    - Unmuted, a floor that cannot resolve would put a withholding on a D&A figure that was published. It would also put a note on the row about a tag nothing used, the case the lazy-resolution rule at `statements.ts:1661-1664` exists to prevent.
    - A floor that resolves to null inside `quietly` is simply not a floor.
- Produces (`NoteSink`):
  - `refuse(text)` appends to `refusals`. `buildStatementRows` reads `notes.refusals.length` before and after each field's `resolveSpec`. If the field resolved to null and the length grew, it calls `notes.withhold(field, slot.date, <last new refusal>)`. If the field resolved (a later step served), the refusal stays a note only.
  - `quietly(fn)` runs `fn` with `add`, `substitute`, `withhold` and `refuse` turned into no-ops (a depth counter, so nested calls work) and returns its result. Tasks 1 and 4 use it for their probes and nothing else.
  - The local `refuse` closure inside `quarterResolver` (`statements.ts:1990`) is unrelated and keeps its name and its note-only behaviour.

- [ ] **Step 1: Write the failing tests.** Seeds: `probes/FIN-510.probe.ts`, `probes/FIN-510-V1.probe.ts`, `probes/FIN-510-V2.probe.ts`. Fixtures: inline companyfacts with the amounts the findings cite from MCD's FY2025 10-K, CSCO's FY2026 10-K and JNJ's 10-Ks, with synthetic accessions.
  ```ts
  const mcd = { Revenues: fy25(26_000 * M), NetIncomeLoss: fy25(8_563 * M), OperatingIncomeLoss: fy25(12_393 * M),
    NetCashProvidedByUsedInOperatingActivities: fy25(10_000 * M), PaymentsToAcquirePropertyPlantAndEquipment: fy25(3_365 * M),
    Assets: [fact(K25, undefined, "2025-12-31", 60_000 * M)],
    DepreciationDepletionAndAmortization: fy25(457 * M), DepreciationAndAmortization: fy25(2_199 * M), Depreciation: fy25(1_600 * M) };

  it("a combined D&A below the same period's Depreciation is not the total (FIN-510)", () => {
    const b = build(mcd);
    const inc = b.incomeAnnual.rows[0]!, cf = b.cashflowAnnual.rows[0]!;
    expect(inc.depreciationAndAmortization).toBe(2_199 * M);
    expect(inc.fieldProvenance?.depreciationAndAmortization?.tags).toEqual(["us-gaap/DepreciationAndAmortization"]);
    expect(inc.ebitda).toBe(14_592 * M);
    expect(cf.depreciationAndAmortization).toBe(2_199 * M);
    expect(b.incomeAnnual.notes.some((n) => /DepreciationDepletionAndAmortization 457000000 .*below .*Depreciation 1600000000/.test(n))).toBe(true);
    expect(b.incomeAnnual.withheld.filter((w) => w.field === "depreciationAndAmortization")).toEqual([]);
  });
  it("control: a combined D&A at or above its components keeps the first synonym", () => {
    const b = build({ ...mcd, DepreciationDepletionAndAmortization: fy25(3_000 * M) });
    expect(b.incomeAnnual.rows[0]!.depreciationAndAmortization).toBe(3_000 * M);
  });
  it("a total within rounding of a component is kept (0.5% house tolerance)", () => {
    const b = build({ ...mcd, DepreciationDepletionAndAmortization: fy25(1_595 * M) });
    expect(b.incomeAnnual.rows[0]!.depreciationAndAmortization).toBe(1_595 * M);
  });
  it("a small total within the absolute rounding allowance of a component is kept; beyond it, it is not", () => {
    const small = { ...mcd, DepreciationDepletionAndAmortization: fy25(99 * M), DepreciationAndAmortization: fy25(150 * M), Depreciation: fy25(100 * M) };
    expect(build(small).incomeAnnual.rows[0]!.depreciationAndAmortization).toBe(99 * M);          // 1M below: within max(0.5M, 2M)
    expect(build({ ...small, DepreciationDepletionAndAmortization: fy25(97 * M) }).incomeAnnual.rows[0]!.depreciationAndAmortization).toBe(150 * M); // 3M below
  });
  it("a floor probe that cannot resolve writes no note and no withholding", () => {
    // Depreciation filed in another currency: unmuted, sameRowEvidence would record a mixed_unit withholding on D&A.
    const facts = companyFacts({ ...mcd, Depreciation: [] }) as any;
    facts.facts["us-gaap"].Depreciation = { label: "Depreciation", units: { EUR: fy25(1_500 * M) } };
    const b = buildStatementsFromCompanyFacts(facts as never, { symbol: "SYN", cik: "0000000099", annualPeriods: 4, quarterlyPeriods: 8,
      asOf: "2026-10-22", factsObservedAt: "2026-10-22T00:00:00.000Z", vendorSplits: SPLITS as never });
    expect(b.incomeAnnual.rows[0]!.depreciationAndAmortization).toBe(457 * M);                    // no same-currency floor: the first synonym stands, as at HEAD
    expect(b.incomeAnnual.withheld.filter((w) => w.field === "depreciationAndAmortization")).toEqual([]);
    expect(b.incomeAnnual.notes.filter((n) => /^depreciationAndAmortization .*(mixed_unit|period_mismatch)/.test(n))).toEqual([]);
  });
  it("a floor skip followed by the component composition is a lower bound, not a withholding", () => {
    const { DepreciationAndAmortization: _drop, ...rest } = mcd;
    const b = build({ ...rest, AmortizationOfIntangibleAssets: fy25(300 * M) });
    expect(b.incomeAnnual.rows[0]!.depreciationAndAmortization).toBe(1_900 * M);
    expect(b.incomeAnnual.withheld.filter((w) => w.field === "depreciationAndAmortization")).toEqual([]);
    expect(lowerBoundDAndACaveat(b.incomeAnnual.rows)).toMatch(/2025-12-31/);
  });
  it("with every combined synonym below a component and no Depreciation, D&A is withheld with the reason (CSCO shape)", () => {
    const K26: Filing = { filed: "2026-09-10", form: "10-K", fp: "FY", fy: 2026, accn: "0000000099-26-000002" };
    const y = (v: number) => [fact(K26, "2025-07-27", "2026-07-25", v)];
    const b = build({ Revenues: y(60_000 * M), NetIncomeLoss: y(11_000 * M), OperatingIncomeLoss: y(15_368 * M),
      Assets: [fact(K26, undefined, "2026-07-25", 120_000 * M)],
      DepreciationDepletionAndAmortization: y(700 * M), AmortizationOfIntangibleAssets: y(916 * M) });
    expect(b.incomeAnnual.rows[0]!.depreciationAndAmortization).toBeNull();
    expect(b.incomeAnnual.rows[0]!.ebitda).toBeNull();
    expect(b.incomeAnnual.withheld).toContainEqual(expect.objectContaining({ field: "depreciationAndAmortization",
      periods: ["2026-07-25"], text: expect.stringMatching(/700000000 .*below .*AmortizationOfIntangibleAssets 916000000/) }));
  });
  it("annual R&D below the same period's R&D excluding acquired IPR&D is not the total (FIN-510-V1)", () => {
    const K: Filing = { filed: "2026-02-11", form: "10-K", fp: "FY", fy: 2025, accn: "0000000099-26-000003" };
    const y = (start: string, end: string, v: number) => [fact(K, start, end, v)];
    const b = build({ Revenues: [...y("2024-12-30", "2025-12-28", 94_000 * M), ...y("2022-01-03", "2023-01-01", 79_990 * M)],
      NetIncomeLoss: [...y("2024-12-30", "2025-12-28", 26_804 * M), ...y("2022-01-03", "2023-01-01", 17_941 * M)],
      ResearchAndDevelopmentExpense: [...y("2024-12-30", "2025-12-28", 109 * M), ...y("2022-01-03", "2023-01-01", 0)],
      ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost: [...y("2024-12-30", "2025-12-28", 14_665 * M), ...y("2022-01-03", "2023-01-01", 14_135 * M)] });
    const rd = Object.fromEntries(b.incomeAnnual.rows.map((r) => [r.date, r.researchAndDevelopmentExpenses]));
    expect(rd).toMatchObject({ "2025-12-28": 14_665 * M, "2023-01-01": 14_135 * M });
  });
  it("control: a filer that tags only ResearchAndDevelopmentExpense keeps it", () => {
    expect(build({ Revenues: fy25(40_000 * M), NetIncomeLoss: fy25(3_000 * M), ResearchAndDevelopmentExpense: fy25(5_000 * M) })
      .incomeAnnual.rows[0]!.researchAndDevelopmentExpenses).toBe(5_000 * M);
  });
  ```
  The second file, `tests/stageB.reitFfoTotalDa.audit20261027.test.ts`, calls `computeNareitFfo` directly on inline companyfacts wrapped as `{ ok: true, value: { data: facts, asOf: "2025-12-31", source: "edgar", endpoint: "fixture", fetchedAt: "2026-10-22T00:00:00.000Z" } }` (helper `wrap`), with `mcdFfo = { NetIncomeLoss: fy25(8_563 * M), DepreciationDepletionAndAmortization: fy25(457 * M), DepreciationAndAmortization: fy25(2_199 * M), Depreciation: fy25(1_600 * M) }`:
  ```ts
  it("the total-D&A stand-in is the filer's total, not a subset below its own Depreciation (FIN-510-V2)", () => {
    const r = computeNareitFfo({ companyFacts: wrap(mcdFfo), periodEnd: "2025-12-31", reportedCurrency: "USD", netIncome: null, depreciationAndAmortization: null });
    expect(r.ffo).toBe(10_762 * M);                       // 8,563 + 2,199
    expect(r.ffoBasis).toMatch(/total depreciation and amortization 2199000000/);
    expect(r.sources.join(" ")).toMatch(/DepreciationAndAmortization/);
  });
  it("control: a filed real-estate depreciation still comes first", () => {
    const r = computeNareitFfo({ companyFacts: wrap({ ...mcdFfo, [REAL_ESTATE_DEPRECIATION_TAGS[0]]: fy25(300 * M) }), periodEnd: "2025-12-31", reportedCurrency: "USD", netIncome: null, depreciationAndAmortization: null });
    expect(r.ffo).toBe(8_863 * M);
  });
  it("control: a combined D&A with no filed component is used as before", () => {
    const { DepreciationAndAmortization: _a, Depreciation: _b, ...ddaOnly } = mcdFfo;
    expect(computeNareitFfo({ companyFacts: wrap(ddaOnly), periodEnd: "2025-12-31", reportedCurrency: "USD", netIncome: null, depreciationAndAmortization: null }).ffo).toBe(9_020 * M);
  });
  ```
- [ ] **Step 2: Run them.** `npx vitest run tests/edgar.derivedLines.audit20261027.test.ts tests/stageB.reitFfoTotalDa.audit20261027.test.ts`. Expected FAIL:
  - `expected 457000000 to be 2199000000` (MCD);
  - `expected 700000000 to be null` (CSCO);
  - `expected { '2025-12-28': 109000000, '2023-01-01': 0 } to match object …` (R&D);
  - `expected 9020000000 to be 10762000000` (FFO).
  - `expected 97000000 to be 150000000` (the second half of the absolute-allowance test; its first half, 99M kept, passes at HEAD).
  The controls pass at HEAD, including the quiet floor probe, where HEAD never resolves `Depreciation` beside a combined tag. It guards the change rather than the defect.
- [ ] **Step 3: Implement.**
  - `synonymFloor.ts` as in Interfaces.
  - `NoteSink.quietly` and `refuse` as in Interfaces.
  - In `resolveSpec` `first`, for each tag: if `r` resolves and `spec.unlessBelow` is set, resolve each floor tag (skip the candidate tag itself) with `notes.quietly(() => resolve(floorTag, spec.unit))`, keep those whose unit equals `r.unit` and whose `value > 0`, and call `belowComponentFloor`. On a hit, add the note `${label}: ${tag} ${r.value} not used — below the same period's ${hit.tag} ${hit.value}, so it is not the total`, remember the text, and `continue`. After the loop, if a candidate was skipped, call `notes.refuse("<field> withheld: every combined synonym filed for the period is below a component it includes (<texts>), and no composition of its components is filed")` and return null.
  - In `computeNareitFfo`, replace `resolveTag(facts, DEPRECIATION_AMORTIZATION_TAGS, flow)` with a local `totalDaNotBelowComponents(facts, flow)`. It tries each tag of `DEPRECIATION_AMORTIZATION_TAGS` alone. It skips a hit when `belowComponentFloor(hit.value, [Depreciation, AmortizationOfIntangibleAssets] resolved for the same flow in the hit's unit)` is non-null. That is the same predicate and the same `SYNONYM_FLOOR_TOLERANCE`. The real-estate tags stay first.
  - Add `src/edgar/synonymFloor.ts` to both risk-manifest lists (Global Constraints).
- [ ] **Step 4: Run them.** Expected PASS. Re-run:
  - `npx vitest run tests/edgar.statements.test.ts`: green unchanged, including the B-7 composition tests and the `lowerBoundDAndACaveat` tests.
  - `npx vitest run tests/stageB.financialMetrics.test.ts`: green unchanged.
  - `npx vitest run tests/audit.financialCompatibility.test.ts tests/audit.crossCompanyCoverage.test.ts`: green. If a fixture's D&A moves, confirm its combined tag is below a filed component before accepting.
  - `npx vitest run tests/stageB.growth.returns.capital.test.ts`: green.
  - `npx vitest run tests/risk.coverage.test.ts -t "places every source file"`: green (the new file is placed).
- [ ] **Step 5: Benefit check.**
  - The probes' failing assertions now hold in synthetic form, and their controls hold.
  - Replay (Task 16) on the MCD census input, rebuilt from its companyfacts: FY2025 D&A 457M → 2,199M; net debt/EBITDA 3.352x → ≈2.952x; capex/D&A latest 7.363 → ≈1.530; 5-year average 6.212 → ≈1.230; implied growth capex 2,908M → ≈1,166M.
  - CSCO census: FY2026 D&A 700M → withheld. Its quarterly D&A is already null at HEAD, so EV/EBITDA stays n/m.
  - JNJ census: annual R&D 109M → 14,665M (no downstream consumer).
  - Must NOT move: every census issuer whose combined D&A tag is at or above its components (the other 42), and NVDA #50 and AMZN #43 (evidence run inputs).
- [ ] **Step 6: Docs.**
  - `docs/METHODOLOGY.md:3647-3660` (B-7): add a sentence. A combined tag is the D&A only when it is not below the same period's `Depreciation` or `AmortizationOfIntangibleAssets`, with a rounding allowance of the larger of 0.5% and 2 million. Say why: us-gaap `Depreciation` includes production and non-production depreciation, while `DepreciationAndAmortization` is defined as the non-production charge. Otherwise the next combined tag is tried, then the composition. With no combined tag that passes and no `Depreciation`, D&A is withheld, never published as a figure known to be partial. The same rule applies to R&D against R&D excluding acquired IPR&D (audit 2026-10-27 FIN-510, D-next).
  - `docs/METHODOLOGY.md:1765-1772` (FFO stand-ins): the total-D&A stand-in uses the same floor.
- [ ] **Step 7: Commit.** `git add src/edgar/synonymFloor.ts src/edgar/tagSynonyms.ts src/edgar/statements.ts src/pipeline/stageB/financialMetrics.ts vitest.shared.ts tests/risk.coverage.test.ts tests/edgar.derivedLines.audit20261027.test.ts tests/stageB.reitFfoTotalDa.audit20261027.test.ts docs/METHODOLOGY.md` then `git commit -m "Never publish a synonym below its own filed component as the total: D&A, R&D and the FFO stand-in (FIN-510, FIN-510-V1, FIN-510-V2)"`.

### Task 2: A bank's interest income is its operating total (FIN-510-V1, JPM sub-case)

**Files:**
- Modify `src/edgar/tagSynonyms.ts:239-245`: add `bankInterestIncome: entry(["InterestIncomeOperating", "InterestAndDividendIncomeOperating", "InvestmentIncomeInterestAndDividend", "InvestmentIncomeInterest"])` beside `interestIncome`, with a comment that a bank's interest income is its operating total, as the vendor field carries it.
- Modify `src/edgar/statements.ts:3187-3191`: the bank override in `INCOME_DEF` adds `interestIncome: lineItemChain("bankInterestIncome", "money")`. Hoist that chain to a named `BANK_INTEREST_INCOME_SPEC`, and add `collectTags(BANK_INTEREST_INCOME_SPEC, tags)` beside `collectTags(BANK_REVENUE_SPEC, tags)` (`:1282`). Its four tags are collected through `interestIncome` today, but the bank override is not walked by `NEEDED_US_GAAP_TAGS`, and a later tag added only to the bank entry would otherwise never be parsed.
- Modify `tests/edgar.statements.test.ts:1378-1387`. Re-pin `interestIncome: 900` to `193_300`, with the comment `// audit 2026-10-27 FIN-510-V1: on a bank-routed filer InvestmentIncomeInterest is securities interest inside total interest income; the non-bank order is pinned in tests/edgar.derivedLines.audit20261027.test.ts`. Keep `interestExpense: 4_100` unchanged: the interest-expense order is not part of this finding.
- Test: `tests/edgar.derivedLines.audit20261027.test.ts` (`describe("bank interest income")`).

**Interfaces:** Consumes `INCOME_DEF(bankRevenue)`. Produces the line item `bankInterestIncome`. No new exported function.

- [ ] **Step 1: Write the failing tests.**
  ```ts
  const bankFacts = { Revenues: fy25(182_000 * M), NetIncomeLoss: fy25(57_000 * M), InterestExpenseOperating: fy25(97_900 * M),
    InvestmentIncomeInterest: fy25(28_032 * M), InterestIncomeOperating: fy25(193_341 * M), Assets: [fact(K25, undefined, "2025-12-31", 4_000_000 * M)] };
  it("a bank's interest income is total operating interest income, not securities interest", () => {
    const row = build(bankFacts, { bankRevenue: true }).incomeAnnual.rows[0]!;
    expect(row.interestIncome).toBe(193_341 * M);
    expect(row.fieldProvenance?.interestIncome?.tags).toEqual(["us-gaap/InterestIncomeOperating"]);
  });
  it("control: a non-bank that tags both keeps the non-operating figure", () => {
    expect(build(bankFacts, { bankRevenue: false }).incomeAnnual.rows[0]!.interestIncome).toBe(28_032 * M);
  });
  ```
- [ ] **Step 2: Run it.** `npx vitest run tests/edgar.derivedLines.audit20261027.test.ts -t "interest income"`. Expected FAIL: `expected 28032000000 to be 193341000000`. The control passes.
- [ ] **Step 3: Implement** the entry and the override as listed in Files.
- [ ] **Step 4: Run it.** PASS. Then:
  - `npx vitest run tests/edgar.statements.test.ts`: the re-pinned bank test passes, and every other bank test (`describe("… bank interest tags")`, `"… bank cash tags"`, `"… bank preferred stock and intangibles (D-42)"`) is green unchanged.
  - `npx vitest run tests/stageB.financialMetrics.test.ts`: the mortgage-REIT spread fallback reads `INTEREST_INCOME_OPERATING_TAGS` facts-first and does not change.
- [ ] **Step 5: Benefit check.**
  - Replay: the JPM and BAC census rows' `interestIncome` moves to the total, for example JPM FY2025 28.0B → 193.3B.
  - No Stage B figure, grade, payload line or rendered cell moves, because the finding lists no consumer. Prove it with the replay diff: only the `interestIncome` statement leaf changes for JPM and BAC.
- [ ] **Step 6: Docs.** `docs/METHODOLOGY.md`, the bank revenue-chain paragraph (grep "bank revenue chain"): one sentence on the bank interest-income order.
- [ ] **Step 7: Commit.** `git add src/edgar/tagSynonyms.ts src/edgar/statements.ts tests/edgar.statements.test.ts tests/edgar.derivedLines.audit20261027.test.ts docs/METHODOLOGY.md` then `git commit -m "Resolve a bank's interest income to its operating total (FIN-510-V1)"`.

### Task 3: The derived EBIT reads pretax as the pretax field does, needs no interest beside a filed aggregate, and says why when it is refused (FIN-507, FIN-507-V1)

**Files:**
- Modify `src/edgar/tagSynonyms.ts:170-198`: add `EBIT_INTEREST_NOT_FILED_WITH_AGGREGATE = { adjustmentTag: "NonoperatingIncomeExpense", disclose: "no interest-expense element (or cash-interest stand-in) is filed for the period; with the NonoperatingIncomeExpense aggregate filed, pretax income less that aggregate is the EBIT (the us-gaap calculation places nonoperating interest, InterestExpenseNonoperating, inside the aggregate); where the filer's interest sits outside the aggregate on an untagged line, the figure understates EBIT by that interest" } as const`, beside `EBIT_INTEREST_INSIDE_AGGREGATE`.
- Modify `src/edgar/statements.ts`:
  - `:402-447`, a `sumAll` part gains `optionalWhenAdjustment?: { adjustmentTag: string; disclose: string }`;
  - `:711-737`, the `operatingIncome` chain: the pretax part's spec becomes the new `INCOME_BEFORE_TAX_SPEC`, and the interest part gets `optionalWhenAdjustment: EBIT_INTEREST_NOT_FILED_WITH_AGGREGATE`;
  - `:744-759`, extract the `incomeBeforeTax` chain into `const INCOME_BEFORE_TAX_SPEC: ChainSpec`, used by both;
  - `:786-825`, `describeDerivedEbit`: when the pretax part's tags are the two `INCOME_BEFORE_TAX_COMPONENT_TAGS`, add "the domestic + foreign composition is taken as the full pretax total, so equity-method results are subtracted as for that total";
  - `:1641-1712`, the `sumAll` case;
  - `:2104-2154` and `:3187-3197`, `computeIncome` gains a `route: "bank" | "general"` parameter, and `INCOME_DEF` passes it as `compute: (v, n, c, cc) => computeIncome(v, n, c, cc, bankRevenue ? "bank" : "general")`.
- Test: `tests/edgar.derivedLines.audit20261027.test.ts` (`describe("derived EBIT operands")`).

**Interfaces:**
- Consumes `NoteSink.refuse` (Task 1) and `EBIT_INTEREST_INSIDE_AGGREGATE`.
- Produces in the `sumAll` part type: `optionalWhenAdjustment?: { adjustmentTag: string; disclose: string }`.
  - A part that resolves null and carries it is deferred.
  - After the `minusAny` adjustments resolve, the part is skipped if one of them was served by `adjustmentTag`, and `disclose` is pushed to `notAdded`, so `describeDerivedEbit` prints it and does not print `EBIT_AGGREGATE_MAY_HOLD_INTEREST`.
  - Otherwise the step returns null and calls `notes.refuse("operatingIncome not derived: <part label> is not filed for the period (tags tried: <tags>)" + (optional ? ", and no NonoperatingIncomeExpense aggregate is filed that would make it unnecessary" : ""))`.
  - A required part (pretax) that resolves null refuses the same way, with no optional clause.
  - Two more null paths get their own reasons (review change).
    - If the part's own resolution recorded a refusal (`notes.refusals` grew while the part resolved), for example pretax withheld for mixed presentation by Task 7, the text is `operatingIncome not derived: <part label> for the period is withheld (<that refusal's text>)`, never "not filed".
    - A part that resolves in a different unit from the first part (`statements.ts:1643`) refuses with `operatingIncome not derived: <part label> is filed in <unit>, not <first part's unit>`.
- Produces `computeIncome(v, notes, ctx, cc, route)`.
  - The `bank` route keeps today's text.
  - The `general` route words the `ebit` withholding as "ebit WITHHELD: operating income could not be derived for this period (see the operatingIncome withholding); pretax income plus interest expense alone is not EBIT".
  - The `ebit` withholding is written whenever `operatingIncome` is null and `incomeBeforeTax` is present, not only when interest is also present, so a missing-interest refusal is never silent.

- [ ] **Step 1: Write the failing tests.** Seeds: `probes/FIN-507.probe.ts` (the LLY 2026 10-Q amounts, from companyfacts CIK 59478: 2026-04-01..2026-06-30 pretax 9,247M, aggregate +269M, revenue 22,974M; 2026-01-01..2026-03-31 pretax 8,850M, aggregate −65M, revenue 19,799M; no interest element) and `probes/FIN-507-V1.probe.ts` (synthetic).
  ```ts
  const Q1: Filing = { filed: "2026-04-30", form: "10-Q", fp: "Q1", fy: 2026, accn: "0000000099-26-000011" };
  const Q2: Filing = { filed: "2026-08-05", form: "10-Q", fp: "Q2", fy: 2026, accn: "0000000099-26-000012" };
  const PRETAX = "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest";
  const lly26 = {
    Revenues: [fact(Q1, "2026-01-01", "2026-03-31", 19_799 * M), fact(Q2, "2026-04-01", "2026-06-30", 22_974 * M)],
    NetIncomeLoss: [fact(Q1, "2026-01-01", "2026-03-31", 7_000 * M), fact(Q2, "2026-04-01", "2026-06-30", 7_500 * M)],
    [PRETAX]: [fact(Q1, "2026-01-01", "2026-03-31", 8_850 * M), fact(Q2, "2026-04-01", "2026-06-30", 9_247 * M)],
    NonoperatingIncomeExpense: [fact(Q1, "2026-01-01", "2026-03-31", -65 * M), fact(Q2, "2026-04-01", "2026-06-30", 269 * M)],
    // Quarter ends are discovered from 10-Q Assets instants (statements.ts:1829-1839): without them no quarterly row exists.
    Assets: [fact(Q1, undefined, "2026-03-31", 110_000 * M), fact(Q2, undefined, "2026-06-30", 112_000 * M)],
  };
  it("with the aggregate filed and no interest element, EBIT is pretax less the aggregate, disclosed (FIN-507)", () => {
    const q = build(lly26).incomeQuarterly;
    const row = (d: string) => q.rows.find((r) => r.date === d)!;
    expect(row("2026-06-30")).toMatchObject({ operatingIncome: 8_978 * M, ebit: 8_978 * M });
    expect(row("2026-03-31")).toMatchObject({ operatingIncome: 8_915 * M, ebit: 8_915 * M });
    const text = q.substitutions.filter((s) => s.field === "operatingIncome" && s.periods.includes("2026-06-30")).map((s) => s.text).join(" ");
    expect(text).toMatch(/no interest-expense element .* is filed for the period/);
    expect(text).toMatch(/understates EBIT by that interest/);
    expect(text).not.toMatch(/may ALREADY contain the interest expense added back/);
  });
  it("with neither interest nor the aggregate, operating income and EBIT are withheld with the missing operand named", () => {
    const { NonoperatingIncomeExpense: _drop, ...pretaxOnly } = lly26;
    const q = build(pretaxOnly).incomeQuarterly;
    expect(q.rows.find((r) => r.date === "2026-06-30")!.operatingIncome).toBeNull();
    expect(q.withheld).toContainEqual(expect.objectContaining({ field: "operatingIncome", text: expect.stringMatching(/interest expense .*not filed .*no NonoperatingIncomeExpense aggregate/) }));
    const ebitHeld = q.withheld.filter((w) => w.field === "ebit").map((w) => w.text).join(" ");
    expect(ebitHeld).toMatch(/operating income could not be derived/);
    expect(ebitHeld).not.toMatch(/bank-style filer/);
  });
  it("control: a filed interest element beside the aggregate keeps today's derivation and caveat", () => {
    const q = build({ ...lly26, InterestExpense: [fact(Q2, "2026-04-01", "2026-06-30", 150 * M)] }).incomeQuarterly;
    expect(q.rows.find((r) => r.date === "2026-06-30")!.operatingIncome).toBe((9_247 + 150 - 269) * M);
    expect(q.substitutions.some((s) => s.field === "operatingIncome" && /may ALREADY contain/.test(s.text))).toBe(true);
  });
  // FIN-507-V1 (synthetic, the probe's figures)
  const K: Filing = { form: "10-K", fp: "FY", fy: 2025, filed: "2026-02-13", accn: "0000000099-26-000001" };
  const a = (v: number) => [fact(K, "2025-01-01", "2025-12-31", v)];
  const common = { Revenues: a(40_000), NetIncomeLoss: a(3_000), Assets: [fact(K, undefined, "2025-12-31", 90_000)],
    InterestExpense: a(400), NonoperatingIncomeExpense: a(150), DepreciationDepletionAndAmortization: a(1_000) };
  it("pretax filed only as domestic + foreign still derives EBIT (FIN-507-V1)", () => {
    const b = build({ ...common, IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic: a(2_600), IncomeLossFromContinuingOperationsBeforeIncomeTaxesForeign: a(1_400) }).incomeAnnual;
    expect(b.rows[0]).toMatchObject({ incomeBeforeTax: 4_000, operatingIncome: 4_250, ebit: 4_250, ebitda: 5_250 });
    const text = b.substitutions.filter((s) => s.field === "operatingIncome").map((s) => s.text).join(" ");
    expect(text).toMatch(/IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic \+ IncomeLossFromContinuingOperationsBeforeIncomeTaxesForeign/);
    expect(text).toMatch(/taken as the full pretax total/);
    expect(b.withheld.filter((w) => /bank-style filer/.test(w.text))).toEqual([]);
  });
  it("control: with the pretax total filed, EBIT is 4,000 + 400 - 150 = 4,250 as before", () => {
    expect(build({ ...common, [PRETAX]: a(4_000) }).incomeAnnual.rows[0]).toMatchObject({ operatingIncome: 4_250, ebit: 4_250 });
  });
  ```
  A bank-route control stays in place unchanged: `tests/edgar.statements.test.ts` `it("does not derive an EBIT from pretax income plus interest on a bank-tagged filer")` must still show the `bank-style filer` text.
  The reviewer ran these fixtures against the HEAD builder in a scratch script (offline, no repository change). The `lly26` quarters build two rows with `operatingIncome: null` and no withholding. FIN-507-V1 gives `operatingIncome: null` and the single `bank-style filer` withholding. The control gives 9,128M. The first draft of `lly26` had no `Assets` instants and built no quarterly rows at all, so its assertions would have thrown on `undefined`, both at HEAD and after the fix.
- [ ] **Step 2: Run it.** `npx vitest run tests/edgar.derivedLines.audit20261027.test.ts -t "EBIT|pretax|operand"`. Expected FAIL:
  - `expected { operatingIncome: null, … } to match object { operatingIncome: 8978000000 }`;
  - the pretax-only case: no `operatingIncome` withholding (`expected [] to contain …`);
  - `expected null to be 4250` for FIN-507-V1;
  - `expected [ { field: 'ebit', text: '… bank-style filer …' } ] to deeply equal []`.
  The two controls pass.
- [ ] **Step 3: Implement.**
  - In the `sumAll` part loop, a null part with `optionalWhenAdjustment` is recorded as `deferred` instead of returning. A null required part calls `notes.refuse(...)` and returns null.
  - After `resolvedByLabel` is filled, each deferred part is checked: its `adjustmentTag` served → `notAdded.push(disclose)`, otherwise `notes.refuse(...)` and return null.
  - The `notAddedWhen` loop is unchanged here (Task 4 changes it).
  - `computeIncome` changes as in Interfaces.
- [ ] **Step 4: Run it.** Expected PASS. Re-run `npx vitest run tests/edgar.statements.test.ts`: the derived-EBIT suite (`describe("… derived EBIT subtracts non-operating items")`, `:2154-2314`, including the B-39 tests at `:2243-2290` and the bank test at `:2299-2312`) and the B-32 tests (`:1863-1895`) are green unchanged. Also re-run `tests/edgar.equityMethodIncome.test.ts` (the `notWhenBaseTag` gate is unchanged).
- [ ] **Step 5: Benefit check.**
  - The probe's assertions now hold in synthetic form, and its control (the 2025-12-31 B-39 quarter) holds.
  - Replay (Task 16) on the LLY census input, rebuilt from LLY's companyfacts with the branch builder:
    - the 2026-06-30 and 2026-03-31 operating income goes from null to 8,978M and 8,915M;
    - the gaps "operatingIncome present in only 2/4 latest quarters" and "valuation.dcf.ttmEbitMargin: TTM operatingIncome or revenue missing" disappear;
    - the DCF margin seed goes from 26.13% (5y median) to ≈42.22% (TTM), EV/EBITDA from null to ≈34.76x, and the DCF per share from $842.45 to ≈$1,079.16.
  - These are the finding's own measured numbers (agents/r4-verify-2/FIN-507.json). The script re-measures them, and the table records what it measures.
  - No retained issuer reaches FIN-507-V1, so it shows in tests only (finding: "no known report reaches it").
  - Must NOT move: every census issuer with a filed `OperatingIncomeLoss`.
- [ ] **Step 6: Docs.**
  - `docs/METHODOLOGY.md:650-658`: the derived EBIT's pretax operand is the same evidence as the pretax field (total, else the B-32 domestic + foreign composition). Where the derivation is refused, the operand it lacks is named.
  - `:3875-3889` (B-39): add "a period that files the aggregate and no interest element at all is derived the same way (audit 2026-10-27 FIN-507, D-next)".
  - `:259` and `:3601-3603` (B-32): the composition also serves the derived EBIT.
- [ ] **Step 7: Commit.** `git add src/edgar/tagSynonyms.ts src/edgar/statements.ts tests/edgar.derivedLines.audit20261027.test.ts docs/METHODOLOGY.md` then `git commit -m "Derive EBIT beside a filed aggregate without an interest element, from the same pretax evidence, and name what a refusal lacks (FIN-507, FIN-507-V1)"`.

### Task 4: The B-39 nesting is read from the period, not from the tag that served (FIN-508)

**Files:**
- Modify `src/edgar/tagSynonyms.ts:182-192`: `EBIT_INTEREST_INSIDE_AGGREGATE` gains `partLabel: "interest expense"` and `discloseRefiled: "interest expense is not added back: the filer also tags this period's interest as InterestExpenseNonoperating (in a later filing), the us-gaap component of the NonoperatingIncomeExpense aggregate subtracted here, so pretax income less that aggregate already excludes it; where the aggregate leaves its interest out, the figure understates EBIT by that interest"`.
- Modify `src/edgar/statements.ts`: `:425-431`, the `notAddedWhen` type gains `partLabel?: string; discloseRefiled?: string`; `:1675-1685`, the `notAddedWhen` loop.
- Test: `tests/edgar.derivedLines.audit20261027.test.ts` (`describe("B-39 keyed on the period")`).

**Interfaces:**
- Consumes `TagResolver` and `EBIT_INTEREST_INSIDE_AGGREGATE`.
- Produces: in the `notAddedWhen` loop, when no part was served by `partTag`, the aggregate resolved, and a part labelled `partLabel` was served by another tag, the loop resolves `partTag` for the period with `notes.quietly(() => resolve(partTag, spec.unit))` (Task 1). If that returns a fact in the parts' unit, from any filing, the part is removed and `discloseRefiled` is pushed to `notAdded`.
  - Resolution happens only in that case, which keeps the lazy-resolution rule. Running inside `quietly` means a probe that cannot resolve writes no `period_mismatch`, `mixed_unit` or "not derived" entry against `operatingIncome`.
  - The amounts need not agree. If the served `InterestExpense` is broader (it includes operating interest), the operating part is an operating cost and belongs inside EBIT. The nonoperating part is inside the aggregate. So pretax less the aggregate stays right either way.
  - Residual (Task 14): the rule is per period. A filer that re-tagged only its annual comparatives keeps the add-back on the quarters of those years whose own 10-Q facts still carry `InterestExpense`, so an old year's annual row and its quarters can differ by the interest. For LLY the eight-quarter window is unaffected: from FY2024 on, its quarters are served by `InterestExpenseNonoperating`.

- [ ] **Step 1: Write the failing test.** Seed `probes/FIN-508.probe.ts`. Fixture: LLY FY2022 amounts from companyfacts CIK 59478, verified in the retained cache:
  - pretax 6,806.4M in the 10-Ks of 2023-02-22, 2024-02-21 and 2025-02-19;
  - `NonoperatingIncomeExpense` −320.9M in the same three 10-Ks;
  - `InterestExpense` 331.6M in the 2023 and 2024 10-Ks only;
  - `InterestExpenseNonoperating` 331.6M in the 2025-02-19 10-K only.
  ```ts
  const k23 = { filed: "2023-02-22", form: "10-K", fp: "FY", fy: 2022, accn: "0000000099-23-000001" };
  const k24 = { filed: "2024-02-21", form: "10-K", fp: "FY", fy: 2023, accn: "0000000099-24-000001" };
  const k25b = { filed: "2025-02-19", form: "10-K", fp: "FY", fy: 2024, accn: "0000000099-25-000001" };
  const y22 = (f: Filing, v: number) => fact(f, "2022-01-01", "2022-12-31", v);
  const AS_OF_2025 = { asOf: "2025-03-01", factsObservedAt: "2025-03-01T00:00:00.000Z" };
  const lly22 = { Revenues: [y22(k23, 28_541.4 * M), y22(k24, 28_541.4 * M), y22(k25b, 28_541.4 * M)],
    NetIncomeLoss: [y22(k23, 6_244.8 * M)], Assets: [fact(k23, undefined, "2022-12-31", 49_490 * M)],
    [PRETAX]: [y22(k23, 6_806.4 * M), y22(k24, 6_806.4 * M), y22(k25b, 6_806.4 * M)],
    NonoperatingIncomeExpense: [y22(k23, -320.9 * M), y22(k24, -320.9 * M), y22(k25b, -320.9 * M)],
    InterestExpense: [y22(k23, 331.6 * M), y22(k24, 331.6 * M)], InterestExpenseNonoperating: [y22(k25b, 331.6 * M)] };
  it("interest the filer re-filed as the aggregate's child is not added back for that period (FIN-508)", () => {
    const b = build(lly22, AS_OF_2025).incomeAnnual;
    expect(b.rows.find((r) => r.date === "2022-12-31")!.operatingIncome).toBeCloseTo(7_127.3 * M, 0);
    const text = b.substitutions.filter((s) => s.field === "operatingIncome").map((s) => s.text).join(" ");
    expect(text).toMatch(/also tags this period's interest as InterestExpenseNonoperating/);
    expect(text).not.toMatch(/may ALREADY contain the interest expense added back/);
  });
  it("control: with no InterestExpenseNonoperating fact for the period, today's add-back and caveat stand", () => {
    const { InterestExpenseNonoperating: _drop, ...older } = lly22;
    const b = build(older, AS_OF_2025).incomeAnnual;
    expect(b.rows.find((r) => r.date === "2022-12-31")!.operatingIncome).toBeCloseTo(7_458.9 * M, 0);
    expect(b.substitutions.some((s) => s.field === "operatingIncome" && /may ALREADY contain/.test(s.text))).toBe(true);
  });
  it("control: the period check adds no 'not derived' note for a child tag filed annually only", () => {
    // Q1-Q3 2022 three-month revenue, pretax, aggregate and InterestExpense (10-Qs) so a Q4 2022 row is derived (FY − 9M);
    // InterestExpenseNonoperating exists only as the FY2022 comparative of the 2025 10-K.
    const q322: Filing = { filed: "2022-11-01", form: "10-Q", fp: "Q3", fy: 2022, accn: "0000000099-22-000003" };
    const b = build(withQuarters2022(lly22, q322), AS_OF_2025);
    expect(b.incomeQuarterly.rows.some((r) => r.date === "2022-12-31")).toBe(true);
    expect(b.incomeQuarterly.notes.filter((n) => /InterestExpenseNonoperating .* not derived/.test(n))).toEqual([]);
  });
  ```
  `withQuarters2022(facts, q3)` is a test helper (synthetic amounts) that adds:
  - three-month facts for 2022-01-01..03-31, 04-01..06-30 and 07-01..09-30: Revenues 7,000M each, pretax 1,700M each, aggregate −80M each, and `InterestExpense` 83M each, each filed by its own 10-Q (Q1 2022-05-03, Q2 2022-08-02, `q3`; synthetic accessions);
  - the 9M 2022 YTD copies of the same four tags, filed by `q3`;
  - `Assets` instants at 2022-03-31, 2022-06-30 and 2022-09-30, each filed by its own 10-Q. Quarter ends are discovered from 10-Q `Assets` instants (`statements.ts:1829-1839`), so without them no 2022 quarterly row exists.
  Every build in this describe uses `AS_OF_2025`. The reviewer's scratch run of `lly22` at HEAD with it gives FY2022 `operatingIncome` 7,458,900,000.
- [ ] **Step 2: Run it.** `npx vitest run tests/edgar.derivedLines.audit20261027.test.ts -t "re-filed|period check|today's add-back"`. Expected FAIL: `expected 7458900000 to be close to 7127300000`. The two controls pass.
- [ ] **Step 3: Implement** the loop change as in Interfaces.
- [ ] **Step 4: Run it.** PASS. Re-run `npx vitest run tests/edgar.statements.test.ts -t "derived EBIT"` (the B-39 tests at `:2243-2290` must pass unchanged), and Task 3's tests.
- [ ] **Step 5: Benefit check.**
  - Replay on LLY, rebuilt: FY2022 operating income 7,458.9M → 7,127.3M and FY2023 6,942.9M → 6,457.0M (overstatement 0).
  - The "cannot be checked" caveat leaves FY2022 and FY2023.
  - With Task 3 in place, LLY's DCF seed is the TTM, so its value per share does not move from this task (finding: "once FIN-507 is fixed the DCF is unaffected"). The history margins in the payload and the graded margin slope move by −1.2pp and −1.4pp in those years.
  - Must NOT move: census issuers whose interest is served by `InterestExpenseNonoperating` already (FY2024+ LLY, PFE).
- [ ] **Step 6: Docs.** `docs/METHODOLOGY.md:3875-3889` (B-39): add "The nesting is read from the period: when the filer tags the period's interest as `InterestExpenseNonoperating` in any filing (LLY re-filed FY2022 and FY2023 that way in its FY2024 10-K), the interest is not added back, whichever interest element serves the row (audit 2026-10-27 FIN-508)."
- [ ] **Step 7: Commit.** `git add src/edgar/tagSynonyms.ts src/edgar/statements.ts tests/edgar.derivedLines.audit20261027.test.ts docs/METHODOLOGY.md` then `git commit -m "Read the B-39 interest nesting from the period, not from the tag that served it (FIN-508)"`.

### Task 5: A filer-tagged other non-operating result leaves the derived EBIT, named with its amount (FIN-509)

**Files:**
- Modify `src/edgar/tagSynonyms.ts`:
  - `:144-168`: add `{ label: "OtherNonoperatingIncomeExpense", tags: ["OtherNonoperatingIncomeExpense"], componentOf: "NonoperatingIncomeExpense" }` after `InvestmentIncomeInterest`, and extend the comment (taxonomy sibling of interest under the aggregate; OD-2);
  - `:199-203`: add `EBIT_OTHER_MAY_HOLD_INTEREST(netInterestAddedBack: number): string`, which reads "caveat — OtherNonoperatingIncomeExpense is by definition the 'other' line beside separately tagged interest; where a filer tags an interest-inclusive total under it, the figure overstates EBIT by the net interest added back (<n>)". It is a function, because the text carries the amount.
- Modify `src/edgar/statements.ts`:
  - `:452-464`, the `discloseAdjusted` context gains `amounts: Record<string, number>` (each subtracted adjustment's value and each served part's value, by label);
  - `:1686-1712`, fill `amounts`;
  - `:786-825`, `describeDerivedEbit`:
    - name each subtracted item with its amount;
    - when `OtherNonoperatingIncomeExpense` was subtracted and an interest part was added, append `EBIT_OTHER_MAY_HOLD_INTEREST(interest − InvestmentIncomeInterest if subtracted)`;
    - when the aggregate is unavailable but any of its components was subtracted, add "the NonoperatingIncomeExpense aggregate is not filed; its components the filer tags were subtracted instead (<list>); any untagged non-operating item stays inside the figure".
      - In that case `NonoperatingIncomeExpense` and the subtracted components leave the "error band — the filer tags none of …" list.
      - Every other unavailable adjustment stays in that list, for example an untagged `IncomeLossFromEquityMethodInvestments`, or `OtherNonoperatingIncomeExpense` when only `InvestmentIncomeInterest` was tagged.
      - When nothing else is unavailable, the error-band clause is omitted.
    - The amount format is the raw resolved value in parentheses after the label, e.g. `NonoperatingIncomeExpense (900)`, `OtherNonoperatingIncomeExpense (-5780000000)`.
- Test: `tests/edgar.derivedLines.audit20261027.test.ts` (`describe("other non-operating result")`).

**Interfaces:**
- Consumes `EBIT_NON_OPERATING_ADJUSTMENTS` and the `componentOf` skip (`statements.ts:1693-1696`).
- Produces `EBIT_OTHER_MAY_HOLD_INTEREST(netInterestAddedBack: number): string`, and `amounts` in the `discloseAdjusted` context. B4's Task 8 reads that context for equity-method placement and must rebase on it (crossBatchDependencies).

- [ ] **Step 1: Write the failing test.** Seed `probes/FIN-509.probe.ts`. Fixture: the JNJ quarter ending 2026-09-27 (10-Q; quarter 2026-06-29..2026-09-27) from companyfacts CIK 200406: pretax 34M, `InterestExpenseNonoperating` 217M, `InvestmentIncomeInterest` 186M, `OtherNonoperatingIncomeExpense` −5,780M. No `OperatingIncomeLoss` and no aggregate.
  ```ts
  // JNJ filed this 10-Q on 2026-10-21 (retained companyfacts). A date after the build's asOf (2026-10-22)
  // drops every fact, and with no 10-Q Assets instant no quarter end is discovered: both made the first draft build no row.
  const Q3J: Filing = { filed: "2026-10-21", form: "10-Q", fp: "Q3", fy: 2026, accn: "0000000099-26-000021" };
  const jq = (v: number) => [fact(Q3J, "2026-06-29", "2026-09-27", v)];
  const jnj = { Revenues: jq(24_000 * M), NetIncomeLoss: jq(50 * M), [PRETAX]: jq(34 * M),
    InterestExpenseNonoperating: jq(217 * M), InvestmentIncomeInterest: jq(186 * M), OtherNonoperatingIncomeExpense: jq(-5_780 * M),
    Assets: [fact(Q3J, undefined, "2026-09-27", 190_000 * M)] };
  it("a filer-tagged OtherNonoperatingIncomeExpense leaves the derived EBIT and is named (FIN-509)", () => {
    const q = build(jnj).incomeQuarterly;
    expect(q.rows.find((r) => r.date === "2026-09-27")!.operatingIncome).toBe(5_845 * M);   // 34 + 217 - 186 + 5,780
    const text = q.substitutions.filter((s) => s.field === "operatingIncome").map((s) => s.text).join(" ");
    expect(text).toMatch(/OtherNonoperatingIncomeExpense \(-5780000000\)/);
    expect(text).toMatch(/aggregate is not filed; its components the filer tags were subtracted instead/);
    expect(text).toMatch(/overstates EBIT by the net interest added back \(31000000\)/);
  });
  it("control: beside a filed aggregate the other line is inside it and is not subtracted twice", () => {
    // B-39: InterestExpenseNonoperating is nested in the aggregate, so EBIT = pretax - aggregate.
    const q = build({ ...jnj, NonoperatingIncomeExpense: jq(-5_749 * M) }).incomeQuarterly;
    expect(q.rows.find((r) => r.date === "2026-09-27")!.operatingIncome).toBe((34 + 5_749) * M);
  });
  it("beside a filed aggregate the disclosure lists the other line as already inside it", () => {
    const q = build({ ...jnj, NonoperatingIncomeExpense: jq(-5_749 * M) }).incomeQuarterly;
    expect(q.substitutions.some((s) => s.field === "operatingIncome" && /already contains them: .*OtherNonoperatingIncomeExpense/.test(s.text))).toBe(true);
  });
  it("control: with the aggregate filed and no interest element (Task 3), the components do not change the figure", () => {
    const { InterestExpenseNonoperating: _i, ...noInterest } = jnj;
    const q = build({ ...noInterest, NonoperatingIncomeExpense: jq(-5_749 * M) }).incomeQuarterly;
    expect(q.rows.find((r) => r.date === "2026-09-27")!.operatingIncome).toBe((34 + 5_749) * M);
  });
  ```
- [ ] **Step 2: Run it.** `npx vitest run tests/edgar.derivedLines.audit20261027.test.ts -t "other"`. Expected FAIL:
  - `expected 65000000 to be 5845000000`;
  - the "already inside" assertion (`expected false to be true`: at HEAD only `InvestmentIncomeInterest` is listed).
  The first control passes at HEAD and after. The last control needs Task 3 (at HEAD it is null), and passes once Task 3 is in. The reviewer's scratch run at HEAD, with the corrected fixture, gives 65,000,000 for the 2026-09-27 quarter, and 5,783,000,000 beside the aggregate.
- [ ] **Step 3: Implement** as in Files.
- [ ] **Step 4: Run it.** PASS. Re-run:
  - `npx vitest run tests/edgar.statements.test.ts -t "derived EBIT"`. Exactly two pins move. Each is re-pinned to the full new text, never deleted or shortened, and each re-pin is named in the commit body:
    - `:2177-2179` (`it("removes the non-operating aggregate and equity-method results from the derivation")`) becomes `/non-operating items subtracted from the derivation: NonoperatingIncomeExpense \(900\), IncomeLossFromEquityMethodInvestments \(300\)/`;
    - `:2197-2200` (`it("names the unavailable adjustments as the error band when none is filed")`) becomes `/error band — the filer tags none of NonoperatingIncomeExpense, InvestmentIncomeInterest, OtherNonoperatingIncomeExpense, IncomeLossFromEquityMethodInvestments/`.
    Every other pin in `:2154-2314` (for example `:2186`, `:2233`, `:2240`, `:2266`) still matches unchanged. A third moving pin means the wording drifted beyond this task: stop and check.
  - `npx vitest run tests/edgar.equityMethodIncome.test.ts tests/stageB.unusualItems*.test.ts` (grep for the D-98 tests): green.
- [ ] **Step 5: Benefit check.**
  - Replay on JNJ, rebuilt:
    - 2026-09-27 EBIT goes from 65M to 5,845M;
    - annual margins: FY2023 17.11% → ≈24.90%, FY2024 18.14% → ≈23.42%, FY2025 34.50% → ≈26.85%;
    - the DCF margin seed goes from 18.86% to ≈25.79%, and the regime from "improving" to "stable";
    - EV/EBITDA goes from 24.98x to ≈19.74x, and the DCF per share from $129.37 to ≈$141.18.
  - Must NOT move:
    - the 12 panel filers that tag the element and also file `OperatingIncomeLoss` (BA, CAT, FCX, KO, NNN, O, ORCL, PG, SNOW, TSLA, VZ: the derived EBIT never runs for them);
    - filers with the aggregate (AAPL, CSCO, AMZN, NVDA, META, MSFT, GOOGL, INTC): the `componentOf` skip applies.
  - D-98 interaction, recorded for B5 (crossBatchDependencies): JNJ files `AssetImpairmentCharges`. If part of that charge sits inside the subtracted other line, the D-98 normaliser removes it from the TTM seed a second time. The replay prints JNJ's D-98 `unusualOperatingItems.value` beside the seed, so the reviewer can see the size of that overlap.
- [ ] **Step 6: Docs.** `docs/METHODOLOGY.md:650-658`: the derived EBIT subtracts the aggregate, else its tagged components (`InvestmentIncomeInterest`, `OtherNonoperatingIncomeExpense`), each named with its amount. Also the caveat on an interest-inclusive "other" line, with OD-2's evidence in one sentence and the D-next reference.
- [ ] **Step 7: Commit.** `git add src/edgar/tagSynonyms.ts src/edgar/statements.ts tests/edgar.derivedLines.audit20261027.test.ts tests/edgar.statements.test.ts docs/METHODOLOGY.md` then `git commit -m "Take a filer-tagged other non-operating result out of the derived EBIT and name it with its amount (FIN-509)"`.

### Task 6: The one-time-items rule says when it was not evaluated (FIN-509-V1)

**Files:**
- Modify `src/pipeline/stageB/forensics.ts:2400-2424`: add an `else` branch after `if (evaluated > 0) { … }`.
- Modify `docs/RESEARCH.md:535-544` (5.3).
- Test: create `tests/stageB.forensics.oneTimeGap.audit20261027.test.ts`.

**Interfaces:** Consumes `SupportFlagsInputs.income` and `FORENSICS_HOUSE_RULES.oneTimeLookbackYears`. Produces the gap `{ field: "forensics.flags.oneTimeItems", severity: "info", reason: "net other income/expense (totalOtherIncomeExpensesNet) is missing, or operating income is zero or missing, in every one of the last <n> fiscal years — one-time-items rule not evaluated (on SEC-built statements the field is the NonoperatingIncomeExpense aggregate only; a narrower OtherNonoperatingIncomeExpense is not used as a stand-in, RESEARCH 5.3)" }`.
  - It is emitted only when `evaluated === 0` and at least one lookback row is non-null.
  - The wording is route-neutral ("on SEC-built statements"), because the same gap also fires on an FMP-route run whose vendor rows lack the field. `computeSupportFlags` does not know the route.

- [ ] **Step 1: Write the failing test.** Seed `probes/FIN-509-V1.probe.ts`, part 1 (hand-built input).
  ```ts
  const years = ["2025", "2024", "2023", "2022", "2021"];
  it("when no lookback year can be evaluated, the rule says it was not evaluated", () => {
    const r = computeSupportFlags({ income: years.map((y) => ({ date: `${y}-12-31`, revenue: 1e9, operatingIncome: 100e6, totalOtherIncomeExpensesNet: null })), balance: [] });
    expect(r.gaps).toContainEqual(expect.objectContaining({ field: "forensics.flags.oneTimeItems", severity: "info", reason: expect.stringMatching(/one-time-items rule not evaluated/) }));
    expect(r.flags.filter((f) => /one-time-items/.test(f.id))).toEqual([]);
  });
  it("control: an evaluated lookback raises the flag as before and no gap", () => {
    const r = computeSupportFlags({ income: years.map((y) => ({ date: `${y}-12-31`, revenue: 1e9, operatingIncome: 100e6, totalOtherIncomeExpensesNet: -30e6 })), balance: [] });
    expect(r.flags.map((f) => f.id)).toContain("serial-one-time-items");
    expect(r.gaps.filter((g) => g.field === "forensics.flags.oneTimeItems")).toEqual([]);
  });
  it("control: no income rows at all adds no one-time-items gap (the growth gap already covers it)", () => {
    expect(computeSupportFlags({ income: [], balance: [] }).gaps.filter((g) => g.field === "forensics.flags.oneTimeItems")).toEqual([]);
  });
  ```
- [ ] **Step 2: Run it.** `npx vitest run tests/stageB.forensics.oneTimeGap.audit20261027.test.ts`. Expected FAIL: `expected [ { field: 'forensics.flags.growth', … } ] to contain …`. The controls pass.
- [ ] **Step 3: Implement** the `else` branch: `else if (lookback.some((row) => row !== null)) gaps.push(gapEntry("forensics.flags.oneTimeItems", <reason>, "info"))`.
- [ ] **Step 4: Run it.** PASS. Re-run `npx vitest run tests/stageB.forensics.test.ts` (`:1010-1095`, the one-time-items tests) and grep `tests/` for forensic gap counts (`gaps).toHaveLength` near forensics fixtures). Any count pin that moves must be on a fixture whose lookback has no evaluable year. Re-pin it with the reason, never by deleting the assertion.
- [ ] **Step 5: Benefit check.**
  - Replay: JNJ, BA and the other 10 keyless panel filers gain the info gap in the missing-data manifest. No flag, grade or figure moves (forensic flags do not feed grading, per the finding).
  - Must NOT move: AAPL (aggregate filed, rule evaluated) and every FMP-route evidence input (#43, #46, #48-#50, whose vendor field is populated).
  - The classic sentence "Unavailable or inapplicable checks are disclosed above and in the missing-data manifest" (`sections.tsx:1266`) is now true for this rule.
- [ ] **Step 6: Docs.** `docs/RESEARCH.md:535-544`: append "When no year in the lookback has both operands, the manifest records the rule as not evaluated (`forensics.flags.oneTimeItems`). On the SEC route the operand is the `NonoperatingIncomeExpense` aggregate only; a filer that tags just the narrower `OtherNonoperatingIncomeExpense` gets the not-evaluated entry rather than a stand-in, because that element holds interest at some filers and not at others (audit 2026-10-27 FIN-509-V1, D-next)."
- [ ] **Step 7: Commit.** `git add src/pipeline/stageB/forensics.ts tests/stageB.forensics.oneTimeGap.audit20261027.test.ts docs/RESEARCH.md` then `git commit -m "Disclose when the one-time-items rule could not be evaluated (FIN-509-V1)"`.

### Task 7: A derived quarter nets two figures on one presentation, or is withheld with both filings named (FIN-511)

**Files:**
- Create `src/edgar/presentationLineage.ts` (pure; imports only the `FactPoint` type from `@/edgar/xbrl`).
- Modify `src/edgar/statements.ts`:
  - `:29-40`: invariant 3 now says "one presentation": filing-date lineage is the minimum, and a re-filed minuend uses its first-reported copy only for a move within 1% or a re-presentation the re-filing labels; a material, unlabelled re-filing withholds the quarter (C-9);
  - export `DISCONTINUED_LABEL_TAGS` (beside `DISCONTINUED_ELEMENT_FIELDS`, `:682-686`);
  - `:1233-1250`: `buildReporters` uses `firstReportedOrder` from the new module (same order, one definition);
  - `:1970-2072`: `quarterResolver`'s three derivations (FY − YTD, FY − (Q1+Q2+Q3), YTD difference) choose their pair with `oneBasisPair`, which applies `presentationMixed`;
  - `:1615-1630` (`resolveSpec` `first`): a synonym whose resolution recorded a refusal ends the step (see "Refusal ends the step" below);
  - `:402-447` and `:1606-1612` (`ChainSpec` `chain` and its case): `stopOnRefusal?: true`; `:711-737`: `INCOME_CHAINS.operatingIncome` sets it (see "A refused filed operating income is not re-derived" below).
- Modify `vitest.shared.ts` and `tests/risk.coverage.test.ts`: add `src/edgar/presentationLineage.ts` to both risk-manifest lists (Global Constraints).
- Test: create `tests/edgar.presentationLineage.audit20261027.test.ts`.

**Interfaces (produced, `src/edgar/presentationLineage.ts`):**
```ts
export interface LineageCopy { start?: string; end: string; val: number; accn: string; filed: string; form: string }
/** A copy of a discontinued-operations element, with its tag and unit (C-9 labels). */
export interface LabelCopy extends LineageCopy { tag: string; unit: string }
/** Earliest filed first; on a same-day tie the original before an amendment, then the lower accession (buildReporters' order). */
export function firstReportedOrder(a: LineageCopy, b: LineageCopy): number;
/** The first-reported copy of `p`'s period (same start and end) among `copies`; `p` itself when it stands alone. */
export function firstReportedCopy<T extends LineageCopy>(copies: readonly T[], p: T): T;
/** |later − first| > thresholdPct/100 × |first|, so a first-reported 0 that became non-zero counts. The one
 *  materiality test of this module: `filingRepresented`, `representationLabelled` and rule 3 all call it. */
export function movedBeyond(first: LineageCopy, later: LineageCopy, thresholdPct: number): boolean;
/** True when the filing carries a copy of a period it did not first report that `movedBeyond` its first-reported
 *  copy: the filing re-presented this concept. */
export function filingRepresented(copies: readonly LineageCopy[], accn: string, thresholdPct: number): boolean;
/** C-9: the re-filing labels its copy of `refiled`'s period a re-presentation for a discontinued operation
 *  (ASC 205-20-45-3, 45-3A). Among `labelCopies` (every core copy of every DISCONTINUED_LABEL_TAGS element),
 *  some copy with `accn === refiled.accn`, the same start and end as `refiled`, and `val !== 0` either is its own
 *  (tag, unit, period)'s first-reported copy (the line is new in the re-filing) or `movedBeyond` that copy. */
export function representationLabelled(labelCopies: readonly LabelCopy[], refiled: LineageCopy, thresholdPct: number): boolean;
/** The reason a minuend/subtrahend pair nets two presentations, or null when they share one (FIN-511 (b)). */
export function presentationMixed(copies: readonly LineageCopy[], minuend: LineageCopy, subtrahends: readonly LineageCopy[], thresholdPct: number): string | null;
export type PairChoice<T> =
  | { kind: "pair"; minuend: T; subtrahends: readonly T[]; basis: "as-filed" | "first-reported"; refiledBy: T | null;
      /** Why the first-reported copy stands in (basis "first-reported" only): C-9's two admitted cases. */
      refiledAs: "precision" | "labelled-representation" | null }
  | { kind: "withheld"; reason: string }
  | { kind: "none" };
/** The pair a derivation may net (OD-5 (a) with the review's two sharpenings and C-9, (a2′) on the subtrahend side, then (b)). `subtrahendsFor(m)`
 *  returns the subtrahend copies minuend `m`'s filing lineage saw (today's lineagePoints lookup), or null.
 *  `labelled(m)` says whether `m`'s filing labels `m`'s period a re-presentation (callers pass
 *  `(m) => representationLabelled(labelCopies, m, thresholdPct)`). */
export function oneBasisPair<T extends LineageCopy>(copies: readonly T[], winner: T, subtrahendsFor: (minuend: T) => readonly T[] | null,
  thresholdPct: number, labelled: (refiled: T) => boolean): PairChoice<T>;
```
`presentationMixed` returns `presentation changed in <form> <filed> (<accn>): that filing re-presented earlier periods of this concept and the <form> of <filed> (<accn>) that supplies the subtrahend did not, so the difference would net two bases` when `filingRepresented(minuend)` holds and some subtrahend's filing does not. Callers pass `RESTATEMENT_THRESHOLD_PCT` (1).

`statements.ts` also exports `DISCONTINUED_LABEL_TAGS: readonly string[] = [...tagsFor("netIncomeFromDiscontinuedOperations"), ...tagsFor("discontinuedOperationsIncome"), ...tagsFor("epsDiscontinuedOperations")]`. Every one of them is already parsed into the fact index (`INCOME_CHAINS` holds `netIncomeFromDiscontinuedOperations` and the `DISCONTINUED_ELEMENT_FIELDS`, `statements.ts:682-686`, `:768`, `:778`), so no tag collection changes.

`oneBasisPair` rules, in order:
1. `first = firstReportedCopy(copies, winner)`. The winner counts as **re-filed** only when all three hold: `first !== winner`, `first.val !== winner.val`, and `!winner.form.trim().endsWith("/A")`. An amendment corrects its own report and stays in the lineage, as today.
2. `subs = subtrahendsFor(winner)`. Keep today's pair (`basis: "as-filed"`, `refiledAs: null`) when the winner is not re-filed, or when it is re-filed but `subs !== null` and every `s` in `subs` was itself re-filed (`s.val !== firstReportedCopy(copies, s).val`). In the second case the pair moved together, and both copies are the latest, which is what ASC 250 asks of a correction.
   - Here `subs === null` gives `{ kind: "none" }`: the caller keeps today's handling, which is the lineage note when a later copy exists, else null.
   - Otherwise `presentationMixed(copies, winner, subs, t)` gives `withheld`, or the pair.
3. Otherwise (re-filed, and its lineage's subtrahend did not move with it):
   - **3a (C-9).** If `movedBeyond(first, winner, t)` and `!labelled(winner)`, the result is `withheld`, with the reason `<period> first reported as <first.val> in <first.form> <first.filed> (<first.accn>) was re-filed as <winner.val> (<describeChangePct(pct)>) in <winner.form> <winner.filed> (<winner.accn>), and that filing labels no re-presentation for the period (it files no new or changed discontinued-operations line for it): a corrected figure replaces the original (ASC 250-10-45-23), so the first-reported copy cannot stand in, and no <subtrahend label> is filed on the re-filed basis`. `pct` is `(winner.val − first.val) / |first.val| × 100`, and `describeChangePct` is the builder's existing formatter, two decimals.
   - **3b.** Otherwise (the move is within `t`, or the re-filing labels it), `refiledAs` is `"precision"` when `!movedBeyond(first, winner, t)`, else `"labelled-representation"`. Then `subsF = subtrahendsFor(first)`.
     - `subsF === null` gives `withheld`, with the reason `<period> re-filed with a different value in <winner.form> <winner.filed> (<winner.accn>) while its subtrahend was not; the first-reported copy (<first.form> <first.filed>, <first.accn>) has no subtrahend filed on or before it`.
     - Else `presentationMixed(copies, first, subsF, t)` gives `withheld`, or `{ kind: "pair", minuend: first, subtrahends: subsF, basis: "first-reported", refiledBy: winner, refiledAs }`.
4. **(C-9, subtrahend side, OD-5 (a2′); post-integration review.)** Before any `pair` from rule 2 or 3b is returned, check each subtrahend `s` of that pair. Let `l` be the last copy, in `firstReportedOrder`, among `copies` with `s`'s start and end and `l.filed > pair.minuend.filed`: a copy the minuend's filing could not have seen. If `l` exists, `movedBeyond(s, l, t)` and `!labelled(l)`, the result is `withheld` with the reason `<subtrahend label> <s.start>..<s.end> netted as <s.val> (<s.form> <s.filed>, <s.accn>) was re-filed as <l.val> (<describeChangePct(pct)>) in <l.form> <l.filed> (<l.accn>), after the <minuend.form> of <minuend.filed> (<minuend.accn>), and that filing labels no re-presentation for the period: a corrected figure replaces the original (ASC 250-10-45-23), so the quarter cannot be derived on one basis`. Here `pct` is `(l.val − s.val) / |s.val| × 100`. Otherwise the pair is returned unchanged.
   - The later copy is never netted (D-13), whatever the check finds; the check only decides between the pair and a withholding.
   - `labelled(l)` is the same callback the minuend side uses, applied to the re-filing's own copy of the subtrahend period. A 10-Q that re-presents prior-year nine months for a discontinued operation carries that line for those nine months (FRM 13110.4), so it labels them.

Resolver change (statements.ts, every derivation branch):
```ts
// C-9 labels, from the same fact index quarterResolver receives (us-gaap keys carry no prefix, statements.ts:1375);
// computed once per index (a module-level WeakMap<FactIndex, LabelCopy[]> memo), not once per quarter:
const labelCopies: LabelCopy[] = DISCONTINUED_LABEL_TAGS.flatMap((t) => (index.get(t) ?? []).flatMap((u) => u.all.map((p) => ({ ...p, tag: t, unit: u.unit }))));
const labelled = (m: FactPoint) => representationLabelled(labelCopies, m, RESTATEMENT_THRESHOLD_PCT);
// FY branch: winner = today's fy; YTD lookup first, exactly today's order:
const ytdFor = (m: FactPoint) => { const y = ctx.previousEnd === null ? null : findDurationExact(lineagePoints(up, m.filed), m.start!, ctx.previousEnd); return y === null ? null : [y]; };
let choice = oneBasisPair(up.all, fy, ytdFor, RESTATEMENT_THRESHOLD_PCT, labelled);
// choice "none" and a YTD copy exists in a later filing → today's refuse(fy, "FY − YTD") note, return null (unchanged);
// choice "none" and no YTD copy at all → choice = oneBasisPair(up.all, fy, (m) => precedingQuarterPoints(lineagePoints(up, m.filed), ctx, quarterEnds), …, labelled),
//   whose own "none" keeps today's FY − (Q1+Q2+Q3) handling;
// YTD-difference branch: winner = today's ytd, subtrahendsFor = the prior YTD in lineagePoints(up, m.filed), the same `labelled`.
if (choice.kind === "withheld") { notes.add(`${tag} ${ctx.end}: ${what} not derived — ${choice.reason}`); notes.refuse(`${tag} ${ctx.end}: ${choice.reason}`); return null; }
// derive from (choice.minuend, choice.subtrahends); resolvedPoint(tag, up, choice.minuend, …), so provenance names the filing used;
// when choice.basis === "first-reported" add the note "<tag> <end>: derived from the first-reported <FY|year to date>
// (<form> <filed>), because <refiledBy.form> <refiledBy.filed> re-filed it <by a precision-only change of
// describeChangePct(pct, 4) | as a re-presentation it labels with a discontinued-operations line> and the
// <subtrahend> it would be netted against was not re-filed with it" (the middle clause by choice.refiledAs).
```
Today's `refuse()` closure (the lineage case where a subtrahend exists only in a later filing) is unchanged: a note, not a withholding. `tests/edgar.statements.test.ts:2446-2493` pins it.

Refusal ends the step (review addition). In `resolveSpec`'s `first` case, read `notes.refusals.length` before each `resolve(tag, …)`. If the call returned null and the length grew, return null at once, without trying later synonyms of that step. The enclosing `chain` still goes on to its next step (a composition, a stand-in).
- Without this rule, a quarter whose `Revenues` is withheld would fall through to `RevenueFromContractWithCustomerExcludingAssessedTax`, a narrower element. That is FIN-510's subset problem, created by the fix. If that element was never re-presented, its own derivation is not mixed, and the subset becomes the quarter's revenue.
- Task 1's floor skip is not a resolver refusal (it is recorded after the step's loop), so it still moves on to the next synonym.

A refused filed operating income is not re-derived (review addition). The `chain` member of `ChainSpec` gains `stopOnRefusal?: true`: when a step's resolution recorded a refusal, the chain returns null without trying later steps. Only `INCOME_CHAINS.operatingIncome` sets it.
- Without it, a quarter whose filed `OperatingIncomeLoss` is withheld for mixed presentation would fall to the derived-EBIT `sumAll`. That derivation's disclosure says "the filer reports no OperatingIncomeLoss line", which is false here.
- It would also be built from operands that a reclassification between operating and non-operating lines moved, for example the retrospective move of non-service pension cost out of operating income: pretax is unchanged, while the aggregate is re-presented.
- The D&A and revenue chains do not set the flag. Their later steps are compositions of the same concept and are checked on their own lineage.

- [ ] **Step 1: Write the failing tests.** Seed `probes/FIN-511.probe.ts`.
  - The synthetic case is copied from the probe: continuing 80 a quarter, plus a 20-a-quarter business discontinued and re-presented in the FY2025 10-K.
  - The BAC-shaped case uses the amounts the finding cites from BAC's companyfacts, CIK 70858:
    - Revenues FY2024: 101,887M in the 10-K of 2025-02-25 and 105,856M in the 10-K of 2026-02-25;
    - 9M 2024: 76,540M in the 10-Qs of 2024-10-29 and 2025-10-31;
    - 9M 2025: 81,917M in the 10-Q of 2025-10-31;
    - FY2025: 113,097M in the 10-K of 2026-02-25;
    - three-month facts: Q1, Q2 and Q3 2024 at 25,818M, 25,377M and 25,345M, and Q1, Q2 and Q3 2025 at 27,366M, 26,463M and 28,088M.
  - Accessions are synthetic. Assets instants are added for the balance anchors.
  ```ts
  it("synthetic: a Q4 netting a re-presented FY against old-basis nine months is withheld, naming both filings", () => {
    const b = build(syntheticFacts(), { annualPeriods: 3, quarterlyPeriods: 8, asOf: "2026-10-15" });
    const q = b.incomeQuarterly;
    expect(b.incomeAnnual.restatements.some((r) => r.date === "2024-12-31" && r.field === "revenue" && r.original === 400 && r.restated === 320)).toBe(true); // control
    expect(q.rows.find((r) => r.date === "2025-12-31")?.revenue ?? null).toBeNull();
    expect(q.withheld).toContainEqual(expect.objectContaining({ field: "revenue", periods: expect.arrayContaining(["2025-12-31"]),
      text: expect.stringMatching(/presentation changed in 10-K 2026-02-12 \(0000000009-26-000001\).*10-Q of 2025-11-03/) }));
    expect(ttmIncome(q.rows, [])?.revenue ?? null).toBeNull();     // falls back to the annual statement (revenueCount < 4)
  });
  it("BAC shape: a material re-filing the 10-K does not label withholds the prior-year Q4 naming both 10-Ks; the current-year Q4 is withheld (C-9)", () => {
    const q = build(bacFacts(), { annualPeriods: 3, quarterlyPeriods: 12 }).incomeQuarterly;
    // neither HEAD's mixed 29,316M nor the first-reported pair 25,347M, which ASC 250 supersedes if the change corrects an error
    expect(q.rows.find((r) => r.date === "2024-12-31")?.revenue ?? null).toBeNull();
    expect(q.withheld).toContainEqual(expect.objectContaining({ field: "revenue", periods: expect.arrayContaining(["2024-12-31"]),
      text: expect.stringMatching(/first reported as 101887000000 in 10-K 2025-02-25 .*re-filed as 105856000000 \(\+3\.90%\) in 10-K 2026-02-25 .*labels no re-presentation/) }));
    expect(q.rows.find((r) => r.date === "2025-12-31")?.revenue ?? null).toBeNull();
    expect(q.withheld.some((w) => w.field === "revenue" && w.periods.includes("2025-12-31"))).toBe(true);
  });
  it("C-9: a re-presentation the re-filing labels with a discontinued-operations line keeps the first-reported pair", () => {
    const q = build(labelledRepresentationFacts("new"), { annualPeriods: 3, quarterlyPeriods: 8, asOf: "2026-10-15" }).incomeQuarterly;
    const q424 = q.rows.find((r) => r.date === "2024-12-31")!;
    expect(q424.revenue).toBe(100);                                                          // FY2024 400 (10-K 2025-02-12) − 9M 2024 300 (10-Q 2024-11-05)
    expect(q424.fieldProvenance?.revenue?.filings.map((f) => f.filed)).toEqual(["2025-02-12", "2024-11-05"]);
    expect(q.notes.some((n) => /2024-12-31: derived from the first-reported FY \(10-K 2025-02-12\).*as a re-presentation it labels with a discontinued-operations line/.test(n))).toBe(true);
    expect(q.rows.find((r) => r.date === "2025-12-31")?.revenue ?? null).toBeNull();     // (b): new-basis FY2025 against the old-basis 9M 2025
  });
  it("C-9 control: the same re-filing with no discontinued-operations line, or with one unchanged since first reported, is withheld naming both filings", () => {
    for (const label of ["none", "unchanged"] as const) {
      const q = build(labelledRepresentationFacts(label), { annualPeriods: 3, quarterlyPeriods: 8, asOf: "2026-10-15" }).incomeQuarterly;
      expect(q.rows.find((r) => r.date === "2024-12-31")?.revenue ?? null).toBeNull();     // HEAD: 320 − 300 = 20
      expect(q.withheld).toContainEqual(expect.objectContaining({ field: "revenue", periods: expect.arrayContaining(["2024-12-31"]),
        text: expect.stringMatching(/first reported as 400 in 10-K 2025-02-12 .*re-filed as 320 \(-20\.00%\) in 10-K 2026-02-12 .*labels no re-presentation/) }));
    }
  });
  it("a re-presentation first filed in a 10-Q leaves the FY − YTD pair on one basis", () => {
    const q = build(representedInQ2Facts(), { annualPeriods: 3, quarterlyPeriods: 8, asOf: "2026-10-15" }).incomeQuarterly;
    expect(q.rows.find((r) => r.date === "2025-12-31")!.revenue).toBe(80);                   // 320 − 240, both filings re-presented
    expect(q.rows.find((r) => r.date === "2024-12-31")!.revenue).toBe(80);                   // 320 − 240: FY2024 and 9M 2024 moved together
    expect(q.withheld.filter((w) => w.periods.includes("2025-12-31") || w.periods.includes("2024-12-31"))).toEqual([]);
  });
  it("a precision-only re-filing switches to the first-reported pair and withholds nothing", () => {
    const b = build(precisionFacts(), { annualPeriods: 3, quarterlyPeriods: 8 });
    expect(b.incomeQuarterly.rows.find((r) => r.date === "2024-12-31")!.revenue).toBe(1_727.4 * M);
    expect(b.incomeQuarterly.rows.find((r) => r.date === "2025-12-31")!.revenue).toBe(1_800 * M);
    expect(b.incomeQuarterly.withheld).toEqual([]);
    expect(b.incomeAnnual.restatements).toEqual([]);                                         // 0.004% < 1%
  });
  it("an amended 10-K keeps its corrected FY as the minuend", () => {
    const b = build(amendedFacts(), { annualPeriods: 2, quarterlyPeriods: 4, asOf: "2025-06-01", factsObservedAt: "2025-06-01T00:00:00.000Z" });
    const q4 = b.incomeQuarterly.rows.find((r) => r.date === "2024-12-31")!;
    expect(q4.revenue).toBe(110);                                                            // 10-K/A 410 − 9M 300, as at HEAD
    expect(q4.fieldProvenance?.revenue?.filings.map((f) => f.form)).toContain("10-K/A");
  });
  it("a filed operating income withheld for presentation is not re-derived from pretax income", () => {
    // OperatingIncomeLoss FY2024 400 re-presented as 360 in the FY2025 10-K and FY2025 = 360 against the old-basis 9M 2025 = 300;
    // pretax (FY 500/500, 9M 2025 375) and InterestExpense (FY 40, 9M 30) are never re-presented.
    const b = build(reclassifiedOperatingIncomeFacts(), { annualPeriods: 3, quarterlyPeriods: 8, asOf: "2026-10-15" });
    const q = b.incomeQuarterly;
    expect(q.rows.find((r) => r.date === "2025-12-31")!.operatingIncome).toBeNull();         // HEAD: 360 − 300 = 60
    expect(q.withheld).toContainEqual(expect.objectContaining({ field: "operatingIncome", periods: expect.arrayContaining(["2025-12-31"]),
      text: expect.stringMatching(/presentation changed in 10-K 2026-02-12/) }));
    expect(q.substitutions.filter((s) => s.field === "operatingIncome" && s.periods.includes("2025-12-31"))).toEqual([]);
  });
  it("a derived EBIT whose pretax part is withheld for presentation quotes that reason", () => {
    const q = build(representedPretaxFacts(), { annualPeriods: 3, quarterlyPeriods: 8, asOf: "2026-10-15" }).incomeQuarterly;
    expect(q.rows.find((r) => r.date === "2025-12-31")!.operatingIncome).toBeNull();         // HEAD: pretax 20 + interest 10 = 30
    expect(q.withheld).toContainEqual(expect.objectContaining({ field: "operatingIncome",
      text: expect.stringMatching(/pretax income for the period is withheld \(.*presentation changed in 10-K 2026-02-12/) }));
  });
  it("a presentation refusal is not bypassed by a narrower revenue synonym", () => {
    const b = build(syntheticFactsWithSubsetTag(), { annualPeriods: 3, quarterlyPeriods: 8, asOf: "2026-10-15" });
    expect(b.incomeQuarterly.rows.find((r) => r.date === "2025-12-31")?.revenue ?? null).toBeNull();   // not 240 − 180 = 60
  });
  it("C-9, subtrahend side: nine months re-filed by more than 1% after the 10-K, with no label, withhold the quarter naming both 10-Qs", () => {
    const q = build(subtrahendRefiledFacts(280, false), { annualPeriods: 2, quarterlyPeriods: 4, asOf: "2026-10-15" }).incomeQuarterly;
    expect(q.rows.find((r) => r.date === "2025-12-31")?.revenue ?? null).toBeNull();            // HEAD: 400 − 300 = 100
    expect(q.withheld).toContainEqual(expect.objectContaining({ field: "revenue", periods: expect.arrayContaining(["2025-12-31"]),
      text: expect.stringMatching(/2025-01-01\.\.2025-09-30 netted as 300 \(10-Q 2025-10-30.*re-filed as 280 \(-6\.67%\) in 10-Q 2026-05-01 .*after the 10-K of 2026-02-13/) }));
  });
  it("C-9, subtrahend side, controls: a re-rounding, or a re-filing that labels the nine months, keeps the quarter as first reported", () => {
    for (const [later, label] of [[299, false], [280, true]] as const) {                     // −0.33%; −6.67% with a new discontinued-operations line
      const q = build(subtrahendRefiledFacts(later, label), { annualPeriods: 2, quarterlyPeriods: 4, asOf: "2026-10-15" }).incomeQuarterly;
      expect(q.rows.find((r) => r.date === "2025-12-31")!.revenue).toBe(100);                // 400 − 300: the later copy is never netted (D-13)
      expect(q.withheld.filter((w) => w.periods.includes("2025-12-31"))).toEqual([]);
    }
  });
  it("control: a 10-K that re-files the prior year unchanged derives Q4 exactly as before", () => {
    const q = build(unchangedFacts(), { annualPeriods: 3, quarterlyPeriods: 8 }).incomeQuarterly;
    expect(q.rows.find((r) => r.date === "2025-12-31")!.revenue).toBe(100);
    expect(q.rows.find((r) => r.date === "2025-12-31")!.derivation).toBe("fy-minus-ytd");
  });
  ```
  Each `*Facts()` is a small inline builder in the test file, using the probe's `Filing` record pattern. Every builder files an `Assets` instant at each quarter end in that quarter's own 10-Q and at each fiscal-year end in its 10-K, because quarter ends are discovered from 10-Q `Assets` instants (`statements.ts:1829-1839`). Accessions are synthetic.
  - `syntheticFacts` is the probe's, verbatim.
  - `unchangedFacts` is `syntheticFacts` with the FY2025 10-K carrying FY2024 = 400 and FY2025 = 400.
  - `representedInQ2Facts`, on an old basis of 100 a quarter and a new basis of 80, with the event in Q2 2025:
    - 10-Qs of 2024-05-02 (Q1 2024 = 100), 2024-08-02 (Q2 2024 = 100, 6M 2024 = 200) and 2024-11-05 (Q3 2024 = 100, 9M 2024 = 300);
    - 10-K of 2025-02-12 (FY2024 = 400, FY2023 = 400);
    - 10-Q of 2025-05-02 (Q1 2025 = 100, Q1 2024 = 100);
    - 10-Q of 2025-08-02 (Q2 2025 = 80, 6M 2025 = 160, Q2 2024 = 80, 6M 2024 = 160);
    - 10-Q of 2025-11-03 (Q3 2025 = 80, 9M 2025 = 240, Q3 2024 = 80, 9M 2024 = 240);
    - 10-K of 2026-02-12 (FY2025 = 320, FY2024 = 320).
    - Its 2024 10-Qs make the 2025 10-Qs' comparatives re-presentations, which is what lets `filingRepresented` see them. Without those 2024 10-Qs, the Q3 2025 10-Q would be the first reporter of 9M 2024 and the pair would be withheld.
    - At HEAD both Q4 rows are 80, so this test is a control that the fix keeps them. The planner's first rule (switch on any re-filing) would have made Q4 2024 = 400 − 300 = 100.
  - `precisionFacts`, revenue in AEP's amounts:
    - 10-Q of 2024-11-06 (Q3 2024 = 1,700M, 9M 2024 = 5,076.9M);
    - 10-K of 2025-02-13 (FY2024 = 6,804.3M);
    - 10-Q of 2025-10-29 (Q3 2025 = 1,750M, 9M 2025 = 5,300M, 9M 2024 = 5,076.9M);
    - 10-K of 2026-02-12 (FY2025 = 7,100M, FY2024 = 6,804.0M).
    - Q4 2024 = 6,804.3 − 5,076.9 = 1,727.4M (first-reported pair: the FY moved and its nine months did not). Q4 2025 = 7,100 − 5,300 = 1,800M (the 2026 10-K's 0.004% move is below 1%, so it re-presented nothing).
  - `amendedFacts`:
    - 10-Qs of 2024-05-02, 2024-08-02 and 2024-11-05 (Q1, Q2, Q3 2024 = 100 each; 9M 2024 = 300 in the last);
    - 10-K of 2025-02-12 (FY2024 = 400, FY2023 = 400);
    - 10-K/A of 2025-03-20 (`form: "10-K/A"`, `fp: "FY"`, `fy: 2024`; FY2024 = 410, FY2023 = 400).
    - At HEAD Q4 2024 = 410 − 300 = 110. The planner's first rule would have used the uncorrected 400 (100).
  - `reclassifiedOperatingIncomeFacts` is `syntheticFacts` (its Revenues and Assets) plus, filed in the same filings:
    - `OperatingIncomeLoss`: FY2024 = 400 (2025-02-12 10-K); 9M 2025 = 300 and 9M 2024 = 300 (2025-11-03 10-Q); FY2025 = 360 and FY2024 = 360 (2026-02-12 10-K);
    - pretax (`IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest`): FY2024 = 500, 9M 2025 = 375, FY2025 = 500, with FY2024 = 500 again in the 2026 10-K;
    - `InterestExpense`: FY2024 = 40, 9M 2025 = 30, FY2025 = 40;
    - `NetIncomeLoss`, never re-presented, so the quarter keeps its row anchor once revenue is withheld: FY2024 = 300 (2025-02-12 10-K), 9M 2025 = 225 (2025-11-03 10-Q), FY2025 = 300 and FY2024 = 300 (2026-02-12 10-K).
    - The reviewer's scratch run at HEAD gives the 2025-12-31 row revenue 20, net income 75 and operating income 60 (mixed). After the fix, operating income is withheld, the row stays (net income 75), and no derived-EBIT substitution is recorded for that quarter.
  - `representedPretaxFacts` is `syntheticFacts`, with no `OperatingIncomeLoss`, plus three more tags:
    - the pretax tag, carrying an exact copy of the `Revenues` points, so it is re-presented in the same filings;
    - `InterestExpense`: FY2024 = 40, 9M 2025 = 30, FY2025 = 40;
    - `reclassifiedOperatingIncomeFacts`' `NetIncomeLoss`, for the row anchor.
  - `labelledRepresentationFacts(label: "new" | "none" | "unchanged")` (C-9) is `syntheticFacts` (its Revenues and Assets; filings `k24` 2025-02-12, `q125`, `q225`, `q325` 2025-11-03, `k25` 2026-02-12, `q126`, `q226`) plus:
    - the 2024 10-Qs of `representedInQ2Facts` on the old basis: 2024-05-02 (Q1 2024 = 100), 2024-08-02 (Q2 2024 = 100, 6M 2024 = 200) and 2024-11-05 (Q3 2024 = 100, 9M 2024 = 300), each with its quarter-end `Assets` instant. They make the 10-Q of 2024-11-05 the first reporter of 9M 2024, so the first-reported FY2024 (10-K 2025-02-12) has a subtrahend filed before it;
    - `IncomeLossFromDiscontinuedOperationsNetOfTax`: for `"new"`, FY2024 = 15 and FY2025 = 12, both only in the 10-K of 2026-02-12 (the line is new for FY2024 in the re-filing); for `"unchanged"`, FY2024 = 15 in the 10-K of 2025-02-12 and again 15 in that of 2026-02-12, plus FY2025 = 12 (an older discontinued operation, so no label); for `"none"`, no such facts.
    - The revenue re-filing is FY2024 400 → 320 (−20%) in the 10-K of 2026-02-12, with 9M 2024 = 300 never re-filed. At HEAD Q4 2024 = 320 − 300 = 20 in all three variants.
  - `syntheticFactsWithSubsetTag` is `syntheticFacts` plus `RevenueFromContractWithCustomerExcludingAssessedTax`, which is never re-presented:
    - 60 a quarter in each 10-Q (three-month facts) and 9M 2025 = 180 (Q3 2025 10-Q);
    - FY2024 = 240 (2025-02-12 10-K) and FY2025 = 240 (2026-02-12 10-K), with no FY2024 comparative in the 2026 10-K.
    - At HEAD, Q4 2025 is served by `Revenues` at 20. Without "refusal ends the step", the fix would serve the subset at 60.
  - `subtrahendRefiledFacts(later: number, label: boolean)` (OD-5 (a2′)) is the HEAD fixture `lineage({ originalYtd: true, laterYtd: true })` of `tests/edgar.statements.test.ts:2448-2466`, with the later copy's value as a parameter:
    - `Revenues` FY2025 = 400 in the 10-K of 2026-02-13 (accession `0000000000-26-000001`), 9M 2025 = 300 in the 10-Q of 2025-10-30 (`0000000000-25-000003`), and 9M 2025 = `later` in a 10-Q of 2026-05-01 (`0000000000-26-000009`, `fp: "Q3"`, `fy: 2025`, as at HEAD);
    - `NetIncomeLoss` FY2025 = 100 (10-K), and `Assets` at 2025-12-31 (10-K) and 2025-09-30 (10-Q of 2025-10-30);
    - when `label` is true, `IncomeLossFromDiscontinuedOperationsNetOfTax` 2025-01-01..2025-09-30 = 5, filed only in the 10-Q of 2026-05-01 under its accession, so the line is new in the re-filing.
    - At HEAD all three variants give Q4 2025 = 400 − 300 = 100: the later copy is outside the 10-K's lineage. The fix withholds only the unlabelled −6.67% variant.
  The reviewer ran `syntheticFacts`, `syntheticFactsWithSubsetTag`, `representedInQ2Facts`, `precisionFacts` and `amendedFacts`, exactly as specified here, against the HEAD builder in a scratch script (offline, no repository change).
  - Synthetic: Q4 2025 = 20, Q4 2024 = 20, TTM 280.
  - Subset tag: Q4 2025 = 20, served by `Revenues`.
  - Q2-represented: both Q4 rows 80, nothing withheld.
  - Precision: Q4 2024 = 1,727.1M, Q4 2025 = 1,800M, no restatement flag.
  - Amended: Q4 2024 = 110, with the 10-K/A in its provenance.
  These match the Step 2 failures and the controls. `bacFacts` was not run, because the finding's probe output (`agents/r4-verify-5/FIN-511-bac.json`) already gives its HEAD values.
- [ ] **Step 2: Run them.** `npx vitest run tests/edgar.presentationLineage.audit20261027.test.ts`. Expected FAIL:
  - synthetic Q4: `expected 20 to be null`;
  - BAC Q4 2024: `expected 29316000000 to be null` (C-9);
  - BAC Q4 2025: `expected 31180000000 to be null`;
  - C-9 labelled: `expected 20 to be 100`;
  - C-9 control ("none" and "unchanged"): `expected 20 to be null`;
  - precision: `expected 1727100000 to be 1727400000`;
  - subset synonym: `expected 20 to be null`;
  - re-presented operating income: `expected 60 to be null`;
  - re-presented pretax: `expected 30 to be null`;
  - C-9 subtrahend side: `expected 100 to be null`.
  The controls pass at HEAD: the restatement flag, the Q2-represented pair (both Q4 rows), the unchanged re-filing, the amended 10-K and both subtrahend-side controls (100).
- [ ] **Step 3: Implement** the module and the resolver change as above.
  - When the withheld field is the row's only anchor (the probe's synthetic files no `NetIncomeLoss`), the row is omitted, as today for any unresolved anchor (`statements.ts:2843-2847`).
  - `ttmIncome`'s contiguity gate (`compute.ts:1186-1196`) then suppresses the TTM, just as `revenueCount < 4` does when the row stays with a null revenue (BAC files net income).
  - Both paths fall back to the annual statement. The tests read `?.revenue ?? null` so they hold either way.
- [ ] **Step 4: Run them.** PASS. Re-pin, in `tests/edgar.statements.test.ts`, the one D-13 pin rule 4 revises, with the comment `// C-9 (decisions spec 4.3), subtrahend side: the later copy is still never netted, and a 6.67% re-filing with no label supersedes the copy the 10-K's lineage saw, so the quarter is withheld (OD-5 (a2′); was 400 − 300 = 100)`:
  - "keeps using that copy when a LATER filing restated the year-to-date figure" (`:2476-2481`): `expect(out.value).toBeNull()` and `expect(out.notes.some((n) => /Revenues 2025-12-31: FY − YTD not derived — .*netted as 300 \(10-Q 2025-10-30.*re-filed as 280 \(-6\.67%\) in 10-Q 2026-05-01/.test(n))).toBe(true)`. Rename it "withholds the quarter when a LATER filing restated the year-to-date figure and labels no re-presentation".
  Then re-run:
  - `npx vitest run tests/edgar.statements.test.ts`: all green, with that one re-pin and nothing else changed, and especially `describe("… one filing lineage per derived quarter")` (`:2446-2493`; its other two tests are unchanged), `"… duplicate periods and restatements"` (`:2392-2445`) and `"… a derived quarter is never published with negative revenue"` (`:240-293`). Any other test that moves under rule 4 must show a subtrahend re-filed after its minuend by more than 1% with no discontinued-operations label. Re-pin it the same way and name it in the commit body.
  - `tests/edgar.successor.test.ts`, `tests/keyless.test.ts` and `tests/audit.dcfOwnership.test.ts` (ttmIncome): green.
  - `npx vitest run tests/audit.financialCompatibility.test.ts tests/audit.crossCompanyCoverage.test.ts`: any moved derived quarter must be on a fixture whose FY was re-filed with a different value or re-presented by its 10-K. Name it in the commit body.
- [ ] **Step 5: Benefit check.**
  - Replay on BAC, rebuilt with `bankRevenue: true` as `keyless.ts:868` sets for a bank:
    - Q4 2024 revenue (29,316M) and pretax (11,077M) are withheld under C-9, with notes naming the 10-Ks of 2025-02-25 and 2026-02-25: FY2024 revenue moved +3.90% and pretax +13.57% (29,254M → 33,223M), and the 2026 10-K files no discontinued-operations line for FY2024. BAC's reported Q4 2024 (25,347M) is not republished, because companyfacts cannot show the change is a re-presentation rather than a correction;
    - Q4 2025 revenue (31,180M) and pretax (12,435M) are withheld;
    - TTM revenue to 2026-06-30 is suppressed, and the annual FY2025 statement serves;
    - the effective tax rate basis is re-measured;
    - BAC's bank-route metrics, P/E and excess return do not move (the finding's own replay). Any move there is a misfire to investigate.
  - The other 44 census issuers: list each one whose derived quarter moved, and confirm the cause in its companyfacts (a re-filed FY copy with a different value, or a 10-K that re-presented the concept).
    - Precision re-rounding (LLY FY2023 6,554.6 → 6,554.0) moves a derived Q4 by the rounding amount only, and only where its nine months were not re-rounded with it.
    - A prior-year Q4 withheld under C-9 (rule 3a) is listed with both filings, the move and the fact that no discontinued-operations line labels it; one kept under 3b's labelled case is listed with the discontinued-operations tag that labels it.
    - Rule 4 (the subtrahend side) is expected to withhold nothing in the census. The post-integration review's offline scan (OD-5 (a2′)) found no FY minuend that is not re-filed with a lineage nine-month subtrahend re-filed later by more than 1%. Any rule-4 withholding the replay shows is listed with both filings and checked against the issuer's companyfacts before going on. FIN-511's 50-issuer scan found BAC as the only issuer in a mixed state at HEAD, so any other 3a withholding must be explained before going on.
    - A move larger than 1% of the quarter outside BAC must be explained before going on.
    - Any field whose serving tag changed between main and branch (the replay prints `fieldProvenance.<field>.tags`) must be a Task 1 floor skip or a Task 7 refusal named in the table. Any other tag change is a misfire.
- [ ] **Step 6: Docs.**
  - `docs/METHODOLOGY.md`: after the B-39 paragraph (`:3889`), add a paragraph "**Derived quarters on one presentation (audit 2026-10-27 FIN-511).**" It says:
    - a quarter derived by subtraction uses the first-reported copy of a year or year-to-date that a later filing re-filed, when the subtrahend it would be netted against was not re-filed with it, only if the re-filing moved it by no more than 1% (a precision-only re-rounding) or labels the period a re-presentation with a new or changed discontinued-operations line (ASC 205-20-45-3); a larger move that the re-filing does not label withholds the quarter, naming both filings, because a corrected figure replaces the original (ASC 250-10-45-23) and companyfacts cannot tell a correction from an unlabelled re-presentation (C-9); a pair that moved together keeps the later copies, and an amended 10-K keeps its corrected figure; the same test applies to the subtrahend: a year to date (or quarter) that a later filing re-filed by more than 1%, with no discontinued-operations line for it, withholds the quarter naming both filings, while the later copy itself is never netted against the older 10-K;
    - a line item whose first synonym is withheld for presentation does not fall through to a narrower synonym, and a filed operating income withheld that way is not replaced by a derived EBIT;
    - it is withheld, naming both filings, when the minuend's filing re-presented the concept by more than 1% and the subtrahend's filing did not;
    - a later re-presented nine months is not netted against an older 10-K;
    - TTM then falls back to the annual statement;
    - cite D-13, SEC FRM 13110.3/13110.4, ASC 250-10-45-23, ASC 205-20-45-3 and D-next.
  - `src/edgar/statements.ts:29-40` (invariant 3, code comment), and the `lineagePoints` doc comment (`:1211-1217`): a year to date restated after the annual fact is still never netted against it, and since C-9 a material, unlabelled restatement of it withholds the quarter.
- [ ] **Step 7: Commit.** `git add src/edgar/presentationLineage.ts src/edgar/statements.ts vitest.shared.ts tests/risk.coverage.test.ts tests/edgar.presentationLineage.audit20261027.test.ts tests/edgar.statements.test.ts docs/METHODOLOGY.md` then `git commit -m "Derive a quarter only from figures on one presentation, or withhold it naming both filings (FIN-511)"`.

### Task 8: The vendor-enrichment derivation uses the same pairing (FIN-511-V2)

**Files:**
- Modify `src/edgar/financialEnrichment.ts`:
  - `:58-77`, `filedFlow`'s derived branch: `oneBasisPair(ps, ytd, subtrahendsFor, RESTATEMENT_THRESHOLD_PCT, labelled)`. Here `ytd` is today's `unambiguousNewest` winner, and `ps` is all of the tag's dated core copies, which `filingRepresented` needs to see every period. `subtrahendsFor(m)` returns `[prior]`, where `prior` is today's `unambiguousNewest` of the copies with `start === m.start`, `end < end`, `filed <= m.filed` and the quarter-length gap, or null when there is none. `labelled(m)` is `representationLabelled(labelCopies, m, RESTATEMENT_THRESHOLD_PCT)`, where `labelCopies` holds every core-form copy (the same form filter `ps` uses) of each `DISCONTINUED_LABEL_TAGS` element in `facts.facts["us-gaap"][tag].units[unit]`, as `{ ...p, tag, unit }`, read once per `enrichFinancialFields` call (C-9: the same label rule as the statement builder).
    - A `withheld` or `none` result returns null: no SEC value, so no conflict and nothing written.
    - A `pair` result derives `minuend.val − prior.val`, with evidence filings `[minuend, prior]`.
    - The existing sign checks apply to the chosen pair. The direct-quarter branch is unchanged.
  - `:202-222`, `admitOperatingCashFlow`'s reason: when `sec.evidence.derivation === "ytd-difference"` it reads "derived <value> <currency> for <start> through <end> (fiscal year or year to date less the prior year to date, <filings>)" instead of "filed <value>".
  - `:489`, the enrichment info gap: "derived (… less …)" instead of "exact … period" for a derived value.
- Test: create `tests/edgar.financialEnrichment.q4Basis.audit20261027.test.ts`.

**Interfaces:** Consumes `oneBasisPair` and `representationLabelled` (Task 7), and `RESTATEMENT_THRESHOLD_PCT` and `DISCONTINUED_LABEL_TAGS` (exported from `src/edgar/statements.ts`, which does not import `financialEnrichment.ts`, so there is no cycle). The exported functions are unchanged.

- [ ] **Step 1: Write the failing test.** Seed `probes/FIN-511-V2.probe.ts` ((a), (b) synthetic verbatim; (c) re-expressed as synthetic facts with AEP's filed amounts, from companyfacts CIK 4904: FY2024 CFO 6,804.3M in the 10-K of 2025-02-13 and 6,804.0M in the 10-K of 2026-02-12; 9M 2024 5,076.9M in the 10-Qs of 2024-11-06 and 2025-10-29; the vendor value is the original pair, assumed as the probe did, with no FMP data):
  ```ts
  it("(a) a vendor Q4 CFO on the original pair is kept, not refused against a never-filed mixed figure", () => {
    const row = enrich(recastFacts("NetCashProvidedByUsedInOperatingActivities", recast(300, 400, 380, 330, 450, 360)), vendorQ4({ operatingCashFlow: 100, netCashProvidedByOperatingActivities: 100, capitalExpenditure: -10, freeCashFlow: 90 }));
    expect(row).toMatchObject({ operatingCashFlow: 100, freeCashFlow: 90 });
    expect(row.fieldConflicts?.operatingCashFlow).toBeUndefined();
  });
  it("(b) a vendor-missing finance-lease principal is not filled from a mixed pair (36 - 30) nor from a first-reported copy an unlabelled 10% re-filing superseded (C-9)", () => {
    const out = enrichOut(recastFacts("FinanceLeasePrincipalPayments", recast(30, 40, 38, 33, 45, 36)), vendorQ4({ operatingCashFlow: 100 }));
    expect(out.row.financeLeasePrincipalPayments ?? null).toBeNull();                    // HEAD writes 6
    expect(out.gaps.some((g) => /financeLeasePrincipalPayments enriched from SEC/.test(g.reason))).toBe(false);
  });
  it("(d) the same re-filing, labelled by a discontinued-operations line in the re-filing 10-K, fills it from the first-reported pair (40 - 30)", () => {
    const row = enrich(withDiscontinuedLabel(recastFacts("FinanceLeasePrincipalPayments", recast(30, 40, 38, 33, 45, 36))), vendorQ4({ operatingCashFlow: 100 }));
    expect(row.financeLeasePrincipalPayments).toBe(10);
  });
  it("(c) a precision-only re-filing (AEP shape) raises no conflict against the original-pair vendor CFO", () => {
    const row = enrich(aepFacts(), vendorQ4({ operatingCashFlow: 1_727.4 * M, netCashProvidedByOperatingActivities: 1_727.4 * M }));
    expect(row.operatingCashFlow).toBe(1_727.4 * M);
  });
  it("control: a genuine disagreement still withholds, and says the SEC value is derived", () => {
    const out = enrichOut(aepFacts(), vendorQ4({ operatingCashFlow: 1_900 * M, netCashProvidedByOperatingActivities: 1_900 * M }));
    expect(out.row.operatingCashFlow).toBeNull();
    expect(out.gaps.map((g) => g.reason).join(" ")).toMatch(/derived 1727400000 USD .*less the prior year to date/);
  });
  ```
  `enrich` and `enrichOut` wrap `enrichFinancialFields(src([]), src([vendor]), facts, "quarter", "2026-10-27T00:00:00.000Z")` exactly as the probe calls it.
  - `recastFacts(tag, points)` is the probe's facts object, and `recast(a, b, c, d, e, fy24new)` is the probe's helper, verbatim. In it the nine months 2024 (`a`) appear unchanged in both 10-Qs while the FY moves by 10% (400 → 360; 40 → 36), so under C-9 `oneBasisPair` withholds the derivation unless the re-filing is labelled: (a) the SEC side has no value, so no conflict is raised and the vendor's 100 is kept; (b) nothing is written; (d) with the label, the first-reported pair 40 − 30 = 10.
  - `withDiscontinuedLabel(facts)` adds `IncomeLossFromDiscontinuedOperationsNetOfTax` with one FY2024 copy (`2024-01-01..2024-12-31`, value 4) filed in the probe's `F.k25` (10-K 2026-02-12, accession `0000000009-26-000001`, the filing that carries `fy24new`), and no earlier copy, so the line is new in the re-filing. The first-reported pair is then `F.k24`'s FY2024 (40) less `F.q324`'s nine months (30).
  - `vendorQ4(fields)` is the probe's vendor row (`date: "2024-12-31"`, `period: "Q4"`, `fiscalYear: "2024"`, `reportedCurrency: "USD"`) with `fields` spread in.
  - `aepFacts()` carries `NetCashProvidedByUsedInOperatingActivities` with AEP's amounts:
    - 9M 2024 = 5,076.9M, in the 10-Qs of 2024-11-06 and 2025-10-29;
    - FY2024 = 6,804.3M (10-K of 2025-02-13) and 6,804.0M (10-K of 2026-02-12);
    - FY2025 = 7,000M (10-K of 2026-02-12).
    It uses synthetic accessions and `cik: 4904` set on the facts and on the vendor row, as the probe's AEP case had them.
- [ ] **Step 2: Run it.** `npx vitest run tests/edgar.financialEnrichment.q4Basis.audit20261027.test.ts`. Expected FAIL:
  - (a) `expected { operatingCashFlow: null, … } to match object { operatingCashFlow: 100, freeCashFlow: 90 }`;
  - (b) `expected 6 to be null`;
  - (d) `expected 6 to be 10`;
  - (c) `expected null to be 1727400000`;
  - the control's wording: `filed 1727100000`.
- [ ] **Step 3: Implement** as in Files.
- [ ] **Step 4: Run it.** PASS. Re-run `npx vitest run tests/edgar.financialEnrichment*.test.ts tests/dataBundle*.test.ts tests/edgar.cashInvestment.test.ts`. Conflict-count pins on Q4 rows may move only where the fixture's FY was re-filed with a different value. Name each.
- [ ] **Step 5: Benefit check.**
  - No stored keyless input reaches this path: it needs FMP vendor rows, which are never committed or fetched here.
  - The proof is the three synthetic cases plus the control. The replay table says so.
  - Must NOT move: the evidence inputs #43-#50. Their stored rows are replayed through Stage B only, so the enrichment does not run.
- [ ] **Step 6: Docs.** `docs/METHODOLOGY.md`, the vendor/SEC agreement paragraph (grep "A-11" / "two statements of one figure"): a derived SEC quarter is built from one presentation (FIN-511), so a mixed pair never raises a conflict, and the reason says the SEC value is derived.
- [ ] **Step 7: Commit.** `git add src/edgar/financialEnrichment.ts tests/edgar.financialEnrichment.q4Basis.audit20261027.test.ts docs/METHODOLOGY.md` then `git commit -m "Pair a vendor quarter with a one-presentation SEC derivation, and call it derived (FIN-511-V2)"`.

### Task 9: A quarterly growth cell divides two quarters on one presentation (FIN-511-V1)

**Files:**
- Modify `src/pipeline/filingDisclosures.ts:527-560`, the `quarterlyTrend` `growth()` and the row object.
- Modify `src/report/schema.ts:2282-2304`: the `quarterlyTrend` row gains `revenueGrowthNotes: z.array(z.string()).optional()`. It is optional, so stored reports without it still parse.
- Modify `src/report/filingDisclosurePresentation.ts:113-145` (`trendTables`): append each row's `revenueGrowthNotes` to the table note, de-duplicated.
- Modify `src/pipeline/stageC/payload.ts:2436-2447` and `:2480-2482` (`quarterlyTrendSection`): push each row's `revenueGrowthNotes` into the section `notes`. The figures already skip a null growth. B3's Task 6 edits the segment half of this same function (`:2453-2466`), so rebase on it.
- Test: create `tests/filingDisclosures.trendBasis.audit20261027.test.ts`.

**Interfaces:**
- Consumes on each income row: `restatement?: Restatement[]` (field `revenue`), `original?.revenue` (`OriginalValue`) and `fieldProvenance?.revenue?.filings`.
- Produces `function oneBasisGrowth(row: FmpIncomeStatementRow, prior: FmpIncomeStatementRow | undefined, label: "YoY" | "QoQ"): { pct: number | null; note: string | null }` (module-private). It works on `sA` (the newest `filed` among the printed row's revenue filings), `sB` (the same for the comparison row) and the revenue restatement flags `rA` and `rB`:
  ```ts
  // rB && !rA && rB.restatedFiling.filed > sA → divide by B.original.revenue when B.original.filed <= sA,
  //    note "<label> uses <B.periodEnd>'s first-reported revenue <v> (<form> <filed>): the <form> of <filed> re-presented it and <A.periodEnd> is still on the earlier presentation";
  //    when B.original.filed > sA (no copy of B on A's presentation) → pct null, note "<label> not shown: <B.periodEnd> was re-presented in <form> <filed> and has no copy on <A.periodEnd>'s presentation"
  // rA && !rB && rA.restatedFiling.filed > sB → pct null, note "<label> not shown: <A.periodEnd> was re-presented in <form> <filed> and no filing re-presents <B.periodEnd>, so the two quarters are on different presentations"
  // otherwise → today's arithmetic, note null
  ```
  - Rows without provenance or flags (the FMP route) always take the last branch.
  - `restatement` and `original` are not declared on `FmpIncomeStatementRow` (`src/providers/fmp.ts:188`): the builder adds them as extra row keys. Read them through a module-private structural guard that accepts only `restatement: Restatement[]` entries with `field === "revenue"`, a string `restatedFiling.filed`, and `original.revenue` with a finite `value` and a string `filed` (types `Restatement` and `OriginalValue` from `@/edgar/statements`). Anything else counts as absent, so a malformed stored row falls back to today's arithmetic.

- [ ] **Step 1: Write the failing test.** Seed `probes/FIN-511-V1.probe.ts`. Fixture: `completeCurrencyBundle({})` with `statements.incomeQuarterly` replaced by ten synthetic EDGAR-shaped rows carrying BAC's filed revenue (`source: "edgar"`, `reportedCurrency: "USD"`, `fieldProvenance.revenue` with `source: "edgar"`, `unit: "USD"` and the supplying filing):
  | periodEnd | label | revenue | supplying filing | re-presentation |
  |---|---|---|---|---|
  | 2026-06-30 | Q2 FY2026 | 31,558M | 10-Q 2026-07-31 | none |
  | 2026-03-31 | Q1 FY2026 | 32,100M | 10-Q 2026-05-01 | none |
  | 2025-12-31 | Q4 FY2025 | null | (withheld, Task 7) | none |
  | 2025-09-30 | Q3 FY2025 | 28,088M | 10-Q 2025-10-31 | none |
  | 2025-06-30 | Q2 FY2025 | 27,443M | 10-Q 2026-07-31 | first reported 26,463M in the 10-Q of 2025-07-31; restated in the 10-Q of 2026-07-31 |
  | 2025-03-31 | Q1 FY2025 | 28,247M | 10-Q 2026-05-01 | first reported 27,366M in the 10-Q of 2025-04-29; restated in the 10-Q of 2026-05-01 |
  | 2024-12-31 | Q4 FY2024 | null | (withheld, Task 7 rule 3a, C-9) | none |
  | 2024-09-30 | Q3 FY2024 | 25,345M | 10-Q 2025-10-31 | none |
  | 2024-06-30 | Q2 FY2024 | 25,377M | 10-Q 2025-07-31 | none |
  | 2024-03-31 | Q1 FY2024 | 25,818M | 10-Q 2025-04-29 | none |
  - Set the bundle's `builtAt` to `"2026-10-22T00:00:00.000Z"`, so that no supplying filing (the latest is 2026-07-31) postdates the build. `currencyBundle`'s `BUILT_AT` is 2026-07-06.
  - Define `const EMPTY_VALIDATION = { checks: [], flags: [], gaps: [] } as unknown as ValidationReport;` as `tests/stageC.plainSectionProviderText.test.ts:40` does.
  - `buildFilingDisclosures` returns `FilingDisclosures | undefined`, hence the `!` below.
  ```ts
  const t = (d: string) => buildFilingDisclosures(bundle)!.quarterlyTrend.find((r) => r.periodEnd === d)!;
  it("a QoQ against a later-re-presented quarter uses that quarter's first-reported copy (FIN-511-V1)", () => {
    expect(t("2025-09-30").revenueQoqPct).toBeCloseTo(6.1406, 3);                  // 28,088 / 26,463
    expect(t("2025-09-30").revenueGrowthNotes?.join(" ")).toMatch(/first-reported revenue 26463000000 \(10-Q 2025-07-31\).*2026-07-31/);
  });
  it("a YoY whose own quarter was re-presented, with no re-presented comparison, is a dash with a note", () => {
    expect(t("2025-06-30").revenueYoyPct).toBeNull();
    expect(t("2025-03-31").revenueYoyPct).toBeNull();
    expect(t("2025-03-31").revenueQoqPct).toBeNull();                              // against the withheld Q4 2024 (C-9): no growth on a null
    expect(t("2025-06-30").revenueGrowthNotes?.join(" ")).toMatch(/YoY not shown: 2025-06-30 was re-presented in 10-Q 2026-07-31/);
  });
  it("controls: cells on one presentation are unchanged", () => {
    expect(t("2026-06-30").revenueYoyPct).toBeCloseTo(14.9948, 3);                 // 31,558 / 27,443 (both new)
    expect(t("2025-06-30").revenueQoqPct).toBeCloseTo(-2.8463, 3);                 // 27,443 / 28,247 (both re-presented)
    expect(t("2025-09-30").revenueYoyPct).toBeCloseTo(10.8226, 3);                 // 28,088 / 25,345 (both earlier)
    expect(t("2026-03-31").revenueQoqPct).toBeNull();                              // against the withheld Q4: no growth on a null
  });
  it("the classic table prints the one-basis cell and the dash, and the note once", () => {
    const table = filingDisclosureTables(buildFilingDisclosures(bundle)! as never, "fundamentals").find((x) => x.heading.startsWith("Quarterly trend"))!;
    expect(table.rows.find((r) => r[0] === "2025-09-30")!.slice(3, 5)).toEqual(["+10.8%", "+6.1%"]);
    expect(table.rows.find((r) => r[0] === "2025-06-30")![3]).toBe("—");
    expect((table.note!.match(/YoY not shown: 2025-06-30/g) ?? []).length).toBe(1);
  });
  it("the payload registers the one-basis figure and no figure for a dashed cell", () => {
    const payload = assembleContextPayload(bundle, runStageB(bundle), EMPTY_VALIDATION);
    const fig = (l: string) => payload.quarterlyTrend!.figures.find((f) => f.label === l);
    expect(fig("revenue growth quarter over quarter, quarter ended 2025-09-30")?.value).toBeCloseTo(6.1406, 3);
    expect(fig("revenue growth year over year, quarter ended 2025-06-30")).toBeUndefined();
  });
  it("control: FMP-route rows without provenance or flags compute growth as before", () => {
    // the same revenues with fieldProvenance, restatement and original removed and source "fmp":
    expect(t2("2025-06-30").revenueYoyPct).toBeCloseTo(8.1412, 3);               // 27,443 / 25,377, today's arithmetic
  });
  ```
- [ ] **Step 2: Run it.** `npx vitest run tests/filingDisclosures.trendBasis.audit20261027.test.ts`. Expected FAIL:
  - `expected 2.3503 to be close to 6.1406`;
  - `expected 8.1412 to be null`;
  - the table cells `[ '+10.8%', '+2.4%' ]`;
  - the payload figure `2.3503`.
  The controls pass at HEAD.
- [ ] **Step 3: Implement** `oneBasisGrowth` and wire `revenueYoyPct`, `revenueQoqPct` and `revenueGrowthNotes` (the latter only when non-empty, so legacy-shaped rows are unchanged). Render the notes in `trendTables` and in the payload notes.
- [ ] **Step 4: Run it.** PASS. Re-run `npx vitest run tests/filingDisclosures.integrity.test.ts tests/currentReports.test.ts tests/edgar.operatingExpenseScope.test.ts tests/report.filingSupplements.presentation.test.ts tests/stageC.payload.passes.test.ts`. They must be green, except the golden fingerprint if the DEMO trend carries a flag; Task 12 handles that.
- [ ] **Step 5: Benefit check.**
  - Replay on BAC's census disclosures, rebuilt from the branch rows:
    - Q3 FY2025 QoQ +2.4% → +6.1%;
    - Q2 FY2025 YoY +8.1% → "—" (note);
    - Q1 FY2025 YoY +9.4% → "—" (note);
    - Q1 FY2025 QoQ (−3.6% at HEAD) → "—" (its comparison, Q4 FY2024, is withheld by Task 7 under C-9);
    - Q4 FY2025 → "—" (withheld level, Task 7);
    - Q4 FY2024 $29.32B → "—" (withheld level, Task 7 rule 3a, C-9), and its YoY and QoQ cells → "—".
  - Q2 FY2026 YoY +15.0% and Q2 FY2025 QoQ −2.8% are unchanged.
  - Every census issuer without a re-presentation flag on a quarterly revenue row has byte-identical trend cells.
- [ ] **Step 6: Docs.** `docs/METHODOLOGY.md`: add "**Quarterly trend growth on one presentation (audit 2026-10-27 FIN-511-V1).**" after Task 7's paragraph. It covers the three cases of `oneBasisGrowth` in prose, and why a dash replaces a rate that would sit beside a level on a different presentation (OD-6, D-next). Update `src/report/filingDisclosurePresentation.ts:120`'s table note so it says each growth cell is computed on one presentation.
- [ ] **Step 7: Commit.** `git add src/pipeline/filingDisclosures.ts src/report/schema.ts src/report/filingDisclosurePresentation.ts src/pipeline/stageC/payload.ts tests/filingDisclosures.trendBasis.audit20261027.test.ts docs/METHODOLOGY.md` then `git commit -m "Compute quarterly growth only between quarters on one presentation (FIN-511-V1)"`.

### Task 10: A legacy report built from EDGAR statements says which derivations changed (display-time; FIN-507, FIN-508, FIN-509, FIN-509-V1, FIN-510, FIN-511-V1)

`ReportView.tsx` is a React component rendered by the Next.js app. Read `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` before touching it. The change is a pure data transform applied before render: no hook, directive or data-fetching change.

**Files:**
- Create `src/report/legacyEdgarDerivedLines.ts`.
- Do NOT add a spec-version comparator. B3 (merged before this batch) exports `specVersionBefore(version: string, cutoff: string): boolean` from `src/report/legacyPayloadRecordSafety.ts`: a numeric semver compare, where an unparsable version counts as before. The integration plan (`docs/superpowers/plans/2026-10-27-audit-remediation.md`, shared-files row 5) makes it the one comparator for every legacy wrapper, and B13 and B4 import it. If the branch is cut before B3 has merged, stop: the merge order is wrong.
- Wire `withLegacyEdgarDerivedLines` right after B3's `withLegacyPayloadRecordSafety(...)`, which itself follows `withHistoricalEnterpriseValueSafety(...)`, at `src/components/report/ReportView.tsx:183`, `src/report/export/markdown.ts:950`, `src/report/export/printHtml.ts:764`, `src/report/export/auditMarkdown.ts:461` and `src/report/legacyEntitySafety.ts:71`. These are HEAD line numbers; re-locate the edits by the quoted call after B3's rebase.
- Modify `vitest.shared.ts` and `tests/risk.coverage.test.ts`: add `src/report/legacyEdgarDerivedLines.ts` to both risk-manifest lists, after B3's `src/report/legacyPayloadRecordSafety.ts` (Global Constraints).
- Test: create `tests/report.legacyEdgarDerivedLines.test.ts`.

**Interfaces:**
- Produces `export const EDGAR_DERIVED_LINES_SINCE_SPEC_VERSION = "<the REPORT_SPEC_VERSION Task 11 introduces>"`. It is frozen after the merge-time renumbering. It never compares against `REPORT_SPEC_VERSION` itself, because later batches move that constant.
- Produces `export function withLegacyEdgarDerivedLines(report: Report): Report`. Pure, idempotent, and never mutates its input.
  - It applies only when `specVersionBefore(report.meta.specVersion, EDGAR_DERIVED_LINES_SINCE_SPEC_VERSION)` holds and `report.appendix.missingData` holds an entry whose `field` is `keyless.incomeAnnual` or `keyless.incomeQuarterly`, or starts with either followed by `.`. That entry means the report's statements came from SEC filings: every keyless run files `keyless.<member>` "served by edgar (…)" (`src/pipeline/keyless.ts:673-691`).
  - (a) If `fairValue.status === "available"`, it appends one line to `fairValue.basis`: "Statement lines on this report were built from SEC filings before report spec {SINCE}. Since then, a derived operating income: no longer drops a period that files the non-operating aggregate without an interest element; removes a filer-tagged other non-operating result; does not add back interest the filer itself placed inside the aggregate. D&A and R&D are never a synonym below their own filed component, and derived quarters and growth cells net figures on one presentation only. Figures shown are as stored; re-run the report for the current derivation."
  - (b) If the manifest holds a `keyless.incomeQuarterly.restatements` or `keyless.incomeAnnual.restatements` entry whose reason names a ` revenue ` re-presentation, it adds a note to the display copy of `filingDisclosures.quarterlyTrend[0].revenueGrowthNotes`. The annual entry is included because the derived-Q4 case (FIN-511) shows as a re-presented FY on the annual rows, e.g. BAC's FY2024. The note reads: "YoY/QoQ cells and derived fourth quarters on this report were computed before report spec {SINCE} without checking whether a later filing re-presented one of the two quarters (see the restatements entry in the missing-data manifest); re-run for one-basis growth."
  - (c) Review addition, FIN-509-V1 and FIN-510's non-valuation consumers. It always appends one line to the display copy of `report.quality.notes` (rendered by `sections.tsx:1256`, `markdown.ts:665` and `printHtml.ts:587`), because (a) needs an available fair value and MCD's DCF, for one, is n/m. The line reads: "Statement-derived screens on this report were computed before report spec {SINCE}: where the filer tags no NonoperatingIncomeExpense aggregate, the one-time-items screen was skipped without notice, so 'no flags were raised' may mean it was not evaluated; and D&A could be a sub-line below the filer's own Depreciation, which moves EBITDA, net debt/EBITDA and capex/D&A. Re-run the report for the current derivation."
  - No figure is changed (D-67).

- [ ] **Step 1: Write the failing test.** Fixture: `loadTask28Fixture()` from `tests/helpers/task28Report.ts`, cloned with `cloneTask28`, `meta.specVersion: "1.44.0"`, an available DCF fair value, and a `keyless.incomeAnnual.substitutions` manifest entry. A second clone adds `keyless.incomeQuarterly.restatements` with the BAC-shaped reason text (synthetic) and a `filingDisclosures.quarterlyTrend` of two rows.
  - `it("a legacy EDGAR-built report carries the derivation note once on every surface")`: `reportToMarkdown(report)`, the print body and the rendered `ReportView` each contain `/built from SEC filings before report spec .*re-run the report for the current derivation/` exactly once.
  - `it("the trend note appears only when the stored manifest shows a quarterly revenue re-presentation")`: the second clone's classic trend table note matches `/computed before report spec .* without checking whether a later filing re-presented/`. The first clone's note does not.
  - `it("applying the rule twice adds the notes once")`: `withLegacyEdgarDerivedLines(withLegacyEdgarDerivedLines(r))` deep-equals `withLegacyEdgarDerivedLines(r)`.
  - `it("a report at or after the batch's spec, or an FMP-route report, carries no note")`: `specVersion` equal to the since-version, `"9.0.0"`, and a 1.44.0 report with no `keyless.*` entries all carry no note. Control: `"1.9.0"` (numeric, not string, comparison) carries it.
  - `it("the quality notes say a legacy EDGAR-built report's screens may not have been evaluated, with or without a fair value")`: on the first clone, and on a third clone with `fairValue.status: "suppressed"`, `reportToMarkdown`, the print body and the rendered `ReportView` each contain `/one-time-items screen was skipped without notice/` exactly once. The suppressed clone carries no `fairValue.basis` line.
  - `it("composes with B3's wrapper")`: a 1.44.0 clone that triggers B3's correction as well (a `payload.insiders.insider-total-purchases` number in `shares`) shows both corrections exactly once on each surface.
  - `it("stored bytes are never rewritten")`: `JSON.stringify(report)` is identical before and after.
- [ ] **Step 2: Run it.** `npx vitest run tests/report.legacyEdgarDerivedLines.test.ts`. Expected FAIL: import error for `@/report/legacyEdgarDerivedLines`.
- [ ] **Step 3: Implement** as specified, and wire it at the five sites.
- [ ] **Step 4: Run it.** PASS. Re-run `tests/report.versionStamps.test.ts`, `npx vitest run tests/report.export*`, `npx vitest run tests/*ReportView*` and the stored-report safety tests (grep `parseStoredReportWithSafety` in `tests/`): green, or each changed snapshot shows only the new note on a legacy keyless fixture. Re-pin only such snapshots, with the reason.
- [ ] **Step 5: Benefit check.**
  - Render each retained stored report through `reportToMarkdown` in a scratch script under `tmp/b13-replay/` (read-only inputs; never commit). The reports are `tmp/audit-2026-10-27/data/reports/{38,43,44,45,46,47,48,49,50,51,52}.json`.
  - Record which ones carry the note: only those whose manifest has `keyless.income*` entries.
  - Diff the numeric leaves before and after: the diff must be empty.
- [ ] **Step 6: Docs.** `docs/METHODOLOGY.md` has no single "never rewritten" paragraph at HEAD; grep finds only the D-67 score sentence at `:2990`. Put the B13 display rule beside the paragraph B3 adds for its own display correction (grep "Deterministic presentation correction" or `PAYLOAD_RECORD_CORRECTION_SPEC` after rebasing on B3), as a short paragraph "**Legacy reports built from SEC statements (audit 2026-10-27 B13).**". It names the three notes (a)-(c), the frozen since-version, and that stored bytes are never rewritten (D-67).
- [ ] **Step 7: Commit.** `git add src/report/legacyEdgarDerivedLines.ts src/components/report/ReportView.tsx src/report/export/markdown.ts src/report/export/printHtml.ts src/report/export/auditMarkdown.ts src/report/legacyEntitySafety.ts vitest.shared.ts tests/risk.coverage.test.ts tests/report.legacyEdgarDerivedLines.test.ts docs/METHODOLOGY.md` (only the files actually touched) then `git commit -m "Mark legacy EDGAR-built reports with the B13 derivation changes on display (D-67)"`.

### Task 11: Version stamps

**Files:**
- `src/pipeline/runInputSnapshot.ts:30`, `src/pipeline/stageC/payload.ts:421`, `src/report/schema.ts:139` (and Task 10's `EDGAR_DERIVED_LINES_SINCE_SPEC_VERSION`), `tests/report.versionStamps.test.ts`.
- Every test that pins those strings: grep the old strings in `tests/` (for example `tests/fairValue.degradedInputs.test.ts` and `tests/stageB.dcfDomain.audit20261022.test.ts`). `tests/fixtures/audit-intended-deltas.json` is regenerated (Task 13), never hand-edited.
- Grep `docs/` and `README.md` for every old stamp string and update the docs in the same commit.

- [ ] **Step 1:** Move each stamp to the next value above main's at branch time. After B3 has merged, main's values may already be above these HEAD values; renumber at merge.
  - `STAGE_B_IMPLEMENTATION_VERSION`: today `STAGE_B_2026_10_ACCOUNTING_EVIDENCE_27`. The EDGAR rows that Stage B reads changed meaning (Tasks 1-5, 7), and so did the forensic gap (Task 6).
  - `PAYLOAD_VERSION`: today `1.48.0`, next minor. The trend figures and notes changed (Task 9), and so did the derived EBIT and D&A figures the payload carries.
  - `REPORT_SPEC_VERSION`: today `1.44.0`, next minor. `revenueGrowthNotes` is added to the schema, and the meaning of EDGAR-derived lines changed. Set `EDGAR_DERIVED_LINES_SINCE_SPEC_VERSION` to the same string.
  - Each moved constant gets its one-line history comment in the existing style (`// 1.4x.0 (D-next): ...`).
  - `PIPELINE_VERSION`, `SCORE_BANDS_VERSION`, `FAIR_VALUE_METHOD_VERSION`, `SCENARIO_TARGET_METHOD_VERSION`, `SCENARIO_PATHS_METHOD_VERSION` and `NET_DEBT_RESOLVER_VERSION` do not move. Say why in the commit body: no Stage C pass logic, band table, valuation method, path construction or net-debt resolver changed, only the filed inputs.
- [ ] **Step 2:** Update the stamp test's header comment and pins, one paragraph per stamp saying what a pass or report stored under the old stamp cannot claim. Add the assertion `expect(specVersionBefore(REPORT_SPEC_VERSION, EDGAR_DERIVED_LINES_SINCE_SPEC_VERSION)).toBe(false)`, with B3's comparator from `@/report/legacyPayloadRecordSafety`. Pin the since-version string.
- [ ] **Step 3:** `npx vitest run tests/report.versionStamps.test.ts tests/fairValue.degradedInputs.test.ts tests/stageB.dcfDomain.audit20261022.test.ts`: PASS.
- [ ] **Step 4:** Commit: `git add src/pipeline/runInputSnapshot.ts src/pipeline/stageC/payload.ts src/report/schema.ts src/report/legacyEdgarDerivedLines.ts tests/report.versionStamps.test.ts` plus each re-pinned test and doc file by name, then `git commit -m "Move the Stage B, payload and report stamps for the B13 EDGAR derivations (D-next)"`.

### Task 12: Payload golden

**Files:** `tests/stageC.payload.passes.test.ts`.

- [ ] **Step 1:** `npx vitest run tests/stageC.payload.passes.test.ts`. Expected FAIL on the fingerprint, promptBytes and hash pins, because `PAYLOAD_VERSION` moved.
- [ ] **Step 2:** Dump the serialized payload before and after with the test's own serializer, to `tmp/b13-payload/{before,after}.txt` (untracked), and diff them.
  - Every changed line must trace to a task. The expected changes are the version string, and a trend note or figure only if the golden fixture's quarterly rows carry a revenue re-presentation flag (Task 9).
  - The golden fixture is FMP-shaped DEMO data, with no EDGAR provenance and a filed `totalOtherIncomeExpensesNet`, so no other line should move.
  - The record count and citation count must not change.
- [ ] **Step 3:** Re-pin with a dated comment: "2026-10-27 B13 (D-next): payload <version>; <list of changed lines and why>".
- [ ] **Step 4:** Commit: `git add tests/stageC.payload.passes.test.ts` then `git commit -m "Re-pin the payload golden for the B13 EDGAR derivations"`.

### Task 13: Audited fixture deltas

- [ ] **Step 1:** `npm run audit:deltas` (dry run). List every changed DEMO leaf.
- [ ] **Step 2:** Attribute each leaf to a task.
  - The expected leaves are the stamp leaves only (`report.meta.specVersion`, the Stage B implementation version). DEMO is FMP-shaped: it has no EDGAR synonym resolution, no derived quarters and a filed `totalOtherIncomeExpensesNet`, so the forensics gap does not fire.
  - Any other leaf is a regression: stop and fix it in the owning task.
- [ ] **Step 3:** Only after every leaf is attributed: `npm run audit:deltas -- --write --group b13-edgar-derived-lines-20261027`. Then `npx vitest run tests/audit.intendedDeltas*.test.ts` (grep the test that reads the fixture): PASS.
- [ ] **Step 4:** Commit: `git add tests/fixtures/audit-intended-deltas.json` then `git commit -m "Record the B13 intended deltas (stamps only)"`.

### Task 14: CHANGELOG, disposition note and release-test registration

**Files:** `CHANGELOG.md` (new top entry), `docs/audit/2026-10-27-audit-batch-b13-edgar-derived-lines.md` (new), `tests/repository.release.test.ts` (register the note in the list beside `docs/audit/2026-10-22-audit-batch6-provider-failures.md`, `:96`).

- [ ] **Step 1:** Write the CHANGELOG entry "Unreleased - operating lines derived from filed tags are the filer's totals, on one presentation (2026-10-27)".
  - One plain-words bullet per task, each naming its finding ids.
  - Final bullet: "Report <version>, payload <version> and Stage B ACCOUNTING_EVIDENCE_<n> (D-next; renumbered at merge). Stored reports keep their bytes; legacy reports built from SEC statements carry a note on display."
- [ ] **Step 2:** Write the disposition note, using the structure of `docs/audit/2026-10-22-audit-batch3-complete-evidence.md`:
  - a table with one row per finding: id, severity, task, test file, stored-report impact;
  - the owner decisions OD-1 to OD-6 with their sources;
  - the replay table from Task 16;
  - "Not fixed / residual":
    - the HD deferred-revenue synonym order (FIN-510-V1 sub-case: sibling elements with no definitional order; no consumer);
    - an interest-inclusive `OtherNonoperatingIncomeExpense` at a filer with no `OperatingIncomeLoss` (disclosed by the caveat band; NNN and eBay-2014 show the tagging, but at filers with OI);
    - a quarter first reported on a new basis beside an old-basis neighbour with no restatement flag on either row (FIN-511-V1 "unprobed", not detectable from companyfacts);
    - a nine-month copy re-presented after the 10-K is not used (a dash until the quarter leaves the window);
    - the D-98 one-off normaliser can remove a charge that sat inside a subtracted other line a second time (owned by B5 FIN-402);
    - the bank `interestExpense` order is unchanged;
    - a `DepreciationAndAmortization` at or above `Depreciation` that is still the non-production charge only cannot be told apart from total D&A in companyfacts (HEAD behaviour; OD-4);
    - FIN-508's rule is per period: quarters of an old re-tagged year whose own 10-Q facts carry `InterestExpense` keep the add-back, so that year's annual row and its quarters can differ by the interest (outside the eight-quarter window for LLY);
    - a 10-K that corrects only an earlier year still marks itself as re-presenting this concept, so the current year's derived Q4 is withheld although both operands may be right. That is the conservative side of D-13's "or discloses that it cannot";
    - (C-9) a re-presentation labelled only in dimensional facts or in text (a retrospective change in accounting principle under ASC 250-10-45-5, a reclassification to the current presentation) reads as unlabelled, because companyfacts carries only non-dimensional facts. Its prior-year Q4 is withheld, although the first-reported pair would be right on the old basis. BAC's FY2024 re-filing (revenue +3.90%, net income −0.59%) is the census case. That is the conservative side (P1: what the filing does not establish is withheld);
    - (C-9) a discontinued-operations line that is new or changed in the re-filing labels the period a re-presentation, even if a correction was made in the same filing; the first-reported pair then stands. Companyfacts cannot separate the two causes within one filing;
    - a 10-K/A that corrects the FY keeps its corrected FY against the 10-Q nine months (review sharpening 2, HEAD behaviour). When the correction also touched the first three quarters, which the nine months filed before it cannot show, the derived Q4 carries that part of the correction too.
- [ ] **Step 3:** Register the note in `tests/repository.release.test.ts` (`ALLOWED_MARKDOWN`, beside the batch6 note), and register this plan file too, `docs/superpowers/plans/2026-10-27-audit-fix-14-edgar-derived-lines.md`, beside the existing `docs/superpowers/plans/…` entries. The master plan ("Where the planning documents are committed") commits each batch plan with its own PR, and `forbiddenReleaseFiles` rejects any tracked `docs/` markdown not listed. `git add -N` the note and the plan, then `npx vitest run tests/repository.release.test.ts tests/docs.lint.test.ts`: PASS (no absolute home path or credential-shaped value in either file, and every relative link resolves).
- [ ] **Step 4:** Commit: `git add CHANGELOG.md docs/audit/2026-10-27-audit-batch-b13-edgar-derived-lines.md docs/superpowers/plans/2026-10-27-audit-fix-14-edgar-derived-lines.md tests/repository.release.test.ts` then `git commit -m "Record the B13 EDGAR derived-lines batch in the changelog and its disposition note"`.

### Task 15: DECISIONS entry

**Files:** `docs/audit/DECISIONS.md` (a new entry at the end, after D-116; the D-number is assigned at merge).

- [ ] **Step 1:** Write one entry: "D-next - Audit 2026-10-27 batch B13: operating lines derived from filed tags are the filer's totals, on one presentation". It has one bullet per owner decision, each holding the decision, the alternatives rejected and the entries it revises:
  - OD-1: D-105/B-39 scope, with the no-interest-element period;
  - OD-2: the commit 63e4fda list and METHODOLOGY 650-653;
  - OD-3: RESEARCH 5.3;
  - OD-4: METHODOLOGY B-7, the tagSynonyms header, the FFO stand-in's stated error direction (`financialMetrics.ts:327-331`; D-31 itself is unchanged) and the bank interest-income pin;
  - OD-5: D-13 and statements.ts invariant 3, with the "moved together", amendment and refusal-ends-the-step rules, and conflict C-9's resolution (decided by the main session on the owner's delegation, decisions spec 4.3): the first-reported copy stands in only for a re-filing within 1% or a re-presentation the re-filing labels with a discontinued-operations line; a material, unlabelled re-filing withholds the quarter, naming both filings (ASC 250-10-45-23; agrees with B6 OD-9), and so does a material, unlabelled re-filing of the subtrahend made after the minuend's filing (OD-5 (a2′); it revises the D-13 pin `tests/edgar.statements.test.ts:2476-2481`, and the later copy is still never netted). Sources as in OD-5;
  - OD-6: D-13, extended to growth cells.
  Then:
  - one bullet each for FIN-508 (B-39 keyed on the period), FIN-507-V1 (B-32 extended to the derived EBIT), FIN-510-V2 and FIN-511-V2 (shared predicates);
  - a "House constants" line covering:
    - `SYNONYM_FLOOR_TOLERANCE` = the larger of 0.5% and 2,000,000;
    - the 1% `RESTATEMENT_THRESHOLD_PCT`, reused as the re-presentation threshold;
    - switching to the first-reported minuend only when the subtrahend did not move with it, the winner is not an amendment, and the re-filing moved it by at most the 1% threshold or labels the period a re-presentation (a new or changed non-zero `DISCONTINUED_LABEL_TAGS` fact for the period in the re-filing, moved by more than the same 1%); otherwise the quarter is withheld (C-9). The same threshold and label test is applied to every subtrahend of a kept pair against its copies filed after the minuend's filing (OD-5 (a2′));
    - a presentation refusal ends its synonym step;
  - the version line and the frozen `EDGAR_DERIVED_LINES_SINCE_SPEC_VERSION`;
  - a link to the disposition note.
- [ ] **Step 2:** Grep `DECISIONS.md` and `docs/METHODOLOGY.md` for every sentence the entry revises ("the first tag present for the period wins", "Whatever could not be subtracted is named", "this cannot be checked", "one filing lineage", "the combined tag", "Missing operands are unevaluable") and confirm that each now agrees with the code or points to the new entry.
- [ ] **Step 3:** Commit: `git add docs/audit/DECISIONS.md` then `git commit -m "Record the B13 owner decisions (D-next)"`.

### Task 16: Before-and-after replay proof (stored run inputs, no network)

**Inputs (read-only, all under the git-ignored `tmp/`):**
- `tmp/metis-audit-2026-10-22/scratch/snapshots/main/*.json`: the 45-issuer keyless census, shape `{ bundle, stageBConfig }`. It includes the affected issuers (LLY, JNJ, MCD, BAC, CSCO, JPM, BA) and the controls (NNN, KO, AAPL, MSFT, GOOGL, AMZN, NVDA, META and the other 30).
- `tmp/metis-audit-2026-10-22/scratch/sec-cache/data.sec.gov_api_xbrl_companyfacts_CIK*.json`: the retained public companyfacts for each census issuer. The replay REBUILDS the statement rows from these with each side's own builder, because the census bundles carry rows built at the 2026-10-22 HEAD.
- `tmp/audit-2026-10-27/data/evidence/{43,46,48,49,50}/run_input_snapshot.gen0.*.json` (AMZN #43, MU #46, NVDA #48/#49/#50; shape `{ content: { bundle, stageBConfig } }`). These are replayed through Stage B on their stored rows only, which shows that Tasks 6 and 1 (FFO) are the only Stage B logic changes that can reach them.
- `tmp/audit-2026-10-27/data/reports/{38,43,44,45,46,47,48,49,50,51,52}.json` for Task 10's display check.

**Procedure:**
- [ ] **Step 1:** Write `tmp/b13-replay/replay.ts` (untracked; never committed). It imports `buildStatementsFromCompanyFacts` from `${process.cwd()}/src/edgar/statements.ts`, plus `runStageB`, `ttmIncome`, `buildFilingDisclosures` and `filingDisclosureTables`, the same way, so one script serves both sides. It reads the files above with `fs` and never with a database: do NOT use `npm run research:replay -- --hash/--job`, which reads the run-input store in the live database. For each census issuer it:
  - builds statements exactly as the probes did: `annualPeriods` and `quarterlyPeriods` set to the snapshot's row counts, `asOf: "2026-10-22"`, `factsObservedAt` from the bundle's companyfacts `fetchedAt`, `vendorSplits` retrieved with no events, `basisDay: "2026-10-22"`, and `bankRevenue` exactly as `keyless.ts:868` sets it, by calling the exported `bankStatementRouting(registrant)` (`keyless.ts:2029`) on the bundle's SEC registrant (true for BAC and JPM);
  - replaces the six statement row arrays;
  - runs `runStageB(bundle, stageBConfig)`;
  - prints one JSON line with:
    - `symbol`;
    - per annual and latest-8 quarterly row: `revenue`, `operatingIncome`, `ebit`, `ebitda`, `depreciationAndAmortization`, `researchAndDevelopmentExpenses`, `interestIncome` and `incomeBeforeTax`;
    - the withheld entries;
    - TTM `revenue` and `operatingIncome`;
    - `dcf.perShare`, `assumptions.ebitMarginPath.value[0]` and its basis;
    - the EV/EBITDA current, `capital.netDebtToEbitda`, `capexToDALatest`, `capexToDA5yAvg`, `impliedGrowthCapex`;
    - `reit.ffo` where present;
    - the forensic flag ids and the `forensics.flags.oneTimeItems` gap;
    - D-98 `unusualOperatingItems.value`;
    - the classic trend table rows;
    - per row and field, `fieldProvenance.<field>.tags` and `.derivation`, so that every change of serving tag or derivation shows up in the diff (Task 7 Step 5).
- [ ] **Step 2:** Extract main once (`mkdir -p tmp/b13-main-src && git archive origin/main | tar -x -C tmp/b13-main-src`). Run each side from its own root, both offline:
  ```bash
  OFFLINE="NODE_USE_ENV_PROXY=1 HTTP_PROXY=http://127.0.0.1:9 HTTPS_PROXY=http://127.0.0.1:9 NO_PROXY=127.0.0.1,localhost"
  (cd tmp/b13-main-src && env $OFFLINE node --conditions=react-server --import tsx ../b13-replay/replay.ts > ../b13-replay/main.jsonl)
  env $OFFLINE node --conditions=react-server --import tsx tmp/b13-replay/replay.ts > tmp/b13-replay/branch.jsonl
  ```
  The replay is the pure builder plus Stage B on stored inputs: no provider, SEC or model call, which the dead proxy guarantees.
- [ ] **Step 3:** Diff the two files and build the table for the PR and the disposition note:

  | input | figure | main | branch | task | why it moved |
  |---|---|---|---|---|---|
  | LLY census | 2026-06-30 / 2026-03-31 operating income | null / null | ≈8,978M / ≈8,915M | 3 | aggregate filed, no interest element (FIN-507) |
  | LLY census | DCF margin seed; EV/EBITDA; DCF per share | 26.13% (5y median); n/m; $842.45 | ≈42.22% (TTM); ≈34.76x; ≈$1,079.16 | 3 | TTM operating income complete |
  | LLY census | FY2022 / FY2023 operating income | 7,458.9M / 6,942.9M | ≈7,127.3M / ≈6,457.0M | 4 | interest re-filed as the aggregate's child (FIN-508) |
  | JNJ census | 2026-09-27 EBIT; DCF per share; EV/EBITDA | 65M; $129.37; 24.98x | ≈5,845M; ≈$141.18; ≈19.74x | 5 | other non-operating result out of EBIT (FIN-509) |
  | JNJ census | annual R&D FY2025 | 109M | 14,665M | 1 | R&D below its own excl.-IPR&D part (FIN-510-V1) |
  | JNJ, BA (+10) | `forensics.flags.oneTimeItems` gap | absent | info gap | 6 | rule not evaluated, now disclosed (FIN-509-V1) |
  | MCD census | FY2025 D&A; net debt/EBITDA; capex/D&A | 457M; 3.352x; 7.363 | 2,199M; ≈2.952x; ≈1.530 | 1 | combined tag below Depreciation (FIN-510) |
  | CSCO census | FY2026 D&A | 700M | withheld | 1 | below its own amortization, no Depreciation |
  | JPM, BAC census | FY2025 interest income | 28.0B (JPM) | 193.3B (JPM) | 2 | bank operating total (FIN-510-V1) |
  | BAC census | Q4 2024 revenue; Q4 2025 revenue; TTM revenue | 29,316M; 31,180M; TTM | withheld; withheld; annual | 7 | one presentation (FIN-511); Q4 2024 by C-9 (a +3.90% FY2024 re-filing that no discontinued-operations line labels) |
  | BAC census | trend Q3 FY2025 QoQ; Q2/Q1 FY2025 YoY; Q1 FY2025 QoQ | +2.4%; +8.1% / +9.4%; −3.6% | +6.1%; — / —; — | 9, 7 | one presentation (FIN-511-V1); Q1 QoQ against the withheld Q4 2024 |
  | AMZN #43, NVDA #48-#50, MU #46 | every printed figure | x | unchanged | — | FMP-shaped stored rows; only Task 6 can reach them and their vendor field is filed |

  Every "≈" value is re-measured by the script, never copied from the findings. Every other census issuer must read "unchanged" or name its task and the filed figure that moved it. A precision-only re-filing moving a derived prior-year Q4 by its rounding amount (Task 7) is listed as one row per issuer.
- [ ] **Step 4:** Where replay cannot show a fix, the table says so and points to the test that proves it: FIN-507-V1 and FIN-510-V2 (no retained issuer has the trigger) and FIN-511-V2 (needs FMP vendor rows).
- [ ] **Step 5:** No commit: the table goes into the disposition note (Task 14) and the PR. If Task 14 is already pushed, make a follow-up commit `git add docs/audit/2026-10-27-audit-batch-b13-edgar-derived-lines.md`.

### Task 17: `npm run verify`, in foreground chunks

- [ ] **Step 1:** Run it in a clean worktree of the branch, not the main checkout. The owner's untracked `docs/independent-audit-2026-10-19/` holds `.ts` files that `tsconfig.json` (`include: **/*.ts`) type-checks; never delete or move that folder.
  - `git worktree add .worktrees/b13-verify fix/edgar-derived-lines`, then `npm ci` there.
  - With `METIS_DATA_DIR` unset, run the chain step by step in the foreground: `npm run check:dependencies`, `npm run typecheck`, `npm run lint`, `npm run test:product`, `npm run test:integration`, `npm run test:coverage:core`, `npm run test:coverage:risk`, `npm run build`, `npm run audit:security`.
- [ ] **Step 2:** These known load flakes pass on rerun and are not code failures:
  - timeouts in the jobScheduler, recordedSensitivity, risk.coverage, runtimeArtifactIdentity and runtimeReplay suites under load;
  - `tests/db.cli.test.ts` `spawnSync … ETIMEDOUT` on Windows.
  Rerun a flaking file alone before treating it as a failure. `test:coverage:risk` can take about 15 minutes under load.
- [ ] **Step 3:** Coverage. The new modules (`synonymFloor.ts`, `presentationLineage.ts`, `legacyEdgarDerivedLines.ts`) are risk-manifest sources (Global Constraints). The core config covers only `src/pipeline/stageB/**` and `src/report/schema.ts`, so `npm run test:coverage:risk` must show each new file at or above the risk per-file floors (statements 85, branches 75, functions 85, lines 85). The edited core files (`forensics.ts`, `financialMetrics.ts`) must keep the core floors. Add branch tests rather than exclusions.
- [ ] **Step 4:** Fix anything this batch caused, in the owning task's terms, as a new commit naming the task.

### Task 18: Fresh reviewer over the whole diff

- [ ] **Step 1:** Dispatch a fresh subagent (superpowers:requesting-code-review) with:
  - `git diff origin/main...HEAD`;
  - this plan;
  - the 11 B13 findings from `tmp/audit-2026-10-27/findings.json`;
  - the instruction to exclude `*.db*` from greps.
  The reviewer checks that:
  - every finding's failure scenario is now covered by a test that failed before;
  - the Review Focus items each have a test;
  - no synonym floor is declared without a us-gaap definition that puts the floor element inside what the line item stands for (OD-4);
  - the resolver's lazy-resolution rule still holds (no note about a tag nothing used), and every probe (floors, the period-keyed interest check) runs inside `notes.quietly`;
  - a refused synonym never lets a narrower synonym of the same step serve, and the "moved together" and amendment conditions of `oneBasisPair` are tested;
  - C-9: no derived quarter uses a first-reported copy, of its minuend or of any subtrahend, that a later re-filing moved by more than 1%, unless that re-filing files a new or changed discontinued-operations line for the period; the label is read from the re-filing's own accession and period, through `representationLabelled` in both `statements.ts` and `financialEnrichment.ts`, and `movedBeyond` is the one materiality test;
  - the three new `src/` files are in both risk-manifest lists;
  - no derived quarter mixes presentations;
  - there is no ticker-specific code;
  - the docs match the code (the METHODOLOGY B-7, B-39 and derived-EBIT paragraphs, the new quarter and trend paragraphs, RESEARCH 5.3);
  - the stamps moved once;
  - no test was weakened.
- [ ] **Step 2:** Fix only the correctness problems it finds. Record each one, with how it was resolved, in the disposition note.

### Task 19: PR description (plain English)

- [ ] **Step 1:** Rebase on `origin/main`. Rerun Task 11 (renumber the stamps and D-next) and Task 12 if B3 or another batch merged meanwhile. Push, then `gh pr create`. The outline:
  1. **What was wrong**, in four sentences:
     - Where a filer reports no operating income, the app derives it from pretax income. It could drop a quarter, keep a large non-operating charge inside "operating" income, or add interest back twice.
     - D&A and R&D could be a small sub-line instead of the total.
     - A fourth quarter or a growth rate could net figures from two different presentations of the same year.
     - Examples: Eli Lilly's two newest quarters had no operating income, Johnson & Johnson's last quarter showed a 0.3% margin, McDonald's D&A was a fifth of its real figure, and Bank of America's quarterly revenue table showed a spike that no filing reported.
  2. **What changed** (one line per task).
  3. **Decisions taken for the owner** (OD-1 to OD-6, one line each, with the main source). OD-5's line says that conflict C-9 was settled by the main session (decisions spec 4.3): a re-filed year that moved by more than 1% without a discontinued-operations label is not replaced by its first-reported copy, so Bank of America's Q4 2024 shows a dash with both filings named.
  4. **Proof**: the replay table, the tests that failed before and pass now, and verify green.
  5. **What did not change and why**: the residuals list.
  6. **Merge notes**:
     - B4 rebases on this branch: see "Cross-batch dependencies" in this plan's Review notes, which supersede the summary JSON (unlessBelow reuse with the quiet probe and the tolerance object, the derived-EBIT context, B3's `specVersionBefore`, the JNJ replay baseline);
     - B9's AI-508 shares this batch's threshold, rounding allowance and outcomes but not its helpers (C-10), and its test pins `RESTATEMENT_THRESHOLD_PCT`, which keeps its name and module;
     - the stamps and D-next are renumbered at merge;
     - review threads must be resolved, and `@codex review` re-run after each push.
  End with the attribution lines from the session's system reminder.

## Self-review against the spec

- **Coverage.** Each finding maps to a task:
  | finding | task |
  |---|---|
  | FIN-507 | 3 |
  | FIN-507-V1 | 3 |
  | FIN-508 | 4 |
  | FIN-509 | 5 |
  | FIN-509-V1 | 6 |
  | FIN-510 | 1 |
  | FIN-510-V1 | 1 (R&D) and 2 (bank interest income); the HD deferred-revenue sub-case is left as it is, with the reason (OD-4) |
  | FIN-510-V2 | 1 |
  | FIN-511 | 7 |
  | FIN-511-V1 | 9 |
  | FIN-511-V2 | 8 |
  The legacy display rule for the "needs reinterpretation" findings is Task 10. The stamps, golden, deltas, changelog, decisions, replay, verify, reviewer and PR are Tasks 11-19.
- **Step scan.** Every task has a failing test with exact values, the run command and its expected failure, an implementation, the re-runs, a benefit check, the docs and a commit with files named. There is no "TBD" and no unspecified validation.
- **Type consistency.**
  - `unlessBelow?: readonly string[]` is the same name in `TagSynonymEntry`, `ChainSpec` `first` and B4's planned use.
  - `NoteSink.refuse` is used by Tasks 1, 3 and 7.
  - `oneBasisPair` (which applies `presentationMixed`, and since C-9 takes a fifth argument `labelled`) is used by Tasks 7 and 8, both passing `representationLabelled` over `DISCONTINUED_LABEL_TAGS` copies. `movedBeyond` is the one materiality test inside the module.
  - `NoteSink.quietly` is used by Tasks 1 and 4.
  - `revenueGrowthNotes` is the same name in the schema, `filingDisclosures`, `trendTables`, the payload and Task 10.
  - No spec-version comparator is added: Tasks 10 and 11 import B3's `specVersionBefore`.
- **Review focus.** Items 1-11 each have a named test, in Tasks 7, 7/8, 1, 3/5, 9, 1, 7, 7, 7, 7/8 and 7.
- **Proportion.** The plan gives signatures, test names and assertions. Code blocks appear only for the floor semantics, the resolver pairing and the growth-basis rule, which the tests alone do not determine.

## Review notes

Independent review of 2026-10-28, checked against `findings.json` (the 11 B13 findings), the 11 probes (read, not run), the verifier outputs under `agents/r4-verify-*` and `agents/r4-vverify-*`, and the code at HEAD 6542531. The key source of each owner decision was fetched.

The reviewer also ran the plan's own fixtures through the HEAD builder `buildStatementsFromCompanyFacts`. This was a scratch script in the session scratchpad, run offline behind a dead proxy. No repository file changed, and no probe or test suite was run. Its purpose was to confirm that each Step 1 test fails at HEAD for the stated reason.

Coverage. All 11 findings are fixed by a task. FIN-510-V1's HD deferred-revenue sub-case is left as a recorded residual: the two elements have no definitional inclusion, and nothing reads the field. None is disputed. AI-203 and AI-401-V2 are not B13 ids.

Changes made to this plan:

1. **Fixtures that built no rows (Tasks 3, 4, 5).** Quarter ends are discovered only from fiscal-year ends and 10-Q `Assets` instants (`statements.ts:1829-1839`).
   - The FIN-507 `lly26` fixture and the FIN-509 JNJ fixture had no `Assets` instants. The JNJ 10-Q was also dated 2026-10-23, after the build's `asOf` (2026-10-22); JNJ actually filed on 2026-10-21. Both fixtures built no quarterly rows, so their tests would have thrown on `undefined`, both at HEAD and after the fix.
   - Both fixtures are corrected. The scratch run now reproduces the findings' HEAD values (LLY: null operating income with no withholding; JNJ: 65M; beside the aggregate: 5,783M).
   - Task 4's `withQuarters2022` gains its 10-Q `Assets` instants, and its builds use an explicit `AS_OF_2025`.
2. **Probes with side effects (Tasks 1 and 4).** Floor tags and the period-keyed `InterestExpenseNonoperating` probe resolve through `sameRowEvidence` and `quarterResolver`. Both write `period_mismatch` and `mixed_unit` withholdings and "not derived" notes for the field being resolved.
   - Unmuted, a floor would put a withholding on a published D&A, and a note about a tag nothing used. The plan's claim that "only after a candidate is found" keeps the lazy-resolution rule was not enough.
   - Added `NoteSink.quietly`, its use in both probes, and a control test (a floor filed in another currency writes nothing).
3. **OD-4 justification corrected.**
   - The plan called all three combined D&A elements "aggregates". But us-gaap defines `DepreciationAndAmortization` as the NON-production charge ("long-lived, physical assets not used in production"), and `Depreciation` as including "production and non-production related depreciation".
   - The floor still holds, and the outcome is unchanged: the field is total D&A, and total D&A contains total depreciation. The reason is restated, the definitions are cited verbatim (fetched), and the residual (a non-production `DepreciationAndAmortization` at or above `Depreciation`) is recorded.
   - The R&D floor was checked against both elements' definitions: the aggregate includes acquired IPR&D and software.
4. **D-31 citation corrected.** "At or ABOVE the definition" is the code comment at `financialMetrics.ts:327-331`, not D-31. D-31 says reconstructed FFO is always approximate with no guaranteed error bound, and it is not revised.
5. **Rounding allowance (house constant).** `SYNONYM_FLOOR_TOLERANCE` is now `max(0.5%, 2,000,000)`.
   - Two derived quarters, each the difference of two figures rounded to ±0.5M, can differ by 2M for rounding alone. Relative-only, that would push 100M quarters off their combined tag onto a lower-bound composition.
   - The absolute term only makes the floor more lenient. Added a test.
6. **OD-5 pairing rule (Task 7, Task 8).** The planner's "any re-filed minuend → first-reported pair" regressed against HEAD in two ordinary cases.
   - (i) A discontinued operation first re-presented in a 10-Q, then in the 10-K (FRM 13110.4). The FY and its nine months moved together, so the winner pair is already on one basis, and switching put the prior-year Q4 back on the old basis. The plan's own Review Focus 1 fixture would have given Q4 2024 = 100 instead of 80.
   - (ii) A 10-K/A that corrects the FY. The first-reported copy is the uncorrected one.
   - Replaced `oneBasisMinuend` with `oneBasisPair`, which switches only when the subtrahend did not move with the minuend and the winner is not an amendment. Two control tests were added. Both fixtures were run at HEAD, giving 80 and 110 (unchanged by the fix).
   - The plan's BAC, AEP-precision and synthetic expectations are unchanged under the new rule.
7. **Refusal ends the step (Task 7).** A presentation refusal on `Revenues` would have let `RevenueFromContractWithCustomerExcludingAssessedTax` (a narrower element, never re-presented) serve the quarter. That is FIN-510's subset problem, created by the fix: the scratch run shows 60 would have replaced the withheld figure. Added the rule and a test.
8. **A refused filed operating income is not re-derived (Task 7).** With a filed `OperatingIncomeLoss` withheld for presentation, the chain would have fallen to the derived EBIT. That derivation discloses "the filer reports no OperatingIncomeLoss line", which is false, and it is built from operands a reclassification moved.
   - Added `stopOnRefusal` on the `operatingIncome` chain only, and a test. HEAD gives 60; the fix withholds it.
   - Also added a test that a derived EBIT whose pretax part was refused quotes that refusal. HEAD gives 30. The Task 3 interface now words that reason, and the unit-mismatch reason.
9. **Pins the plan missed (Task 5).** Naming each subtracted item with its amount, and adding `OtherNonoperatingIncomeExpense` to the adjustment list, change two existing pins: `tests/edgar.statements.test.ts:2177-2179` and `:2197-2200`. Both are re-pinned to the full new text (more information, not less), and the Global Constraints now list them. The error-band wording for a partly available aggregate is made exact.
10. **Risk-coverage placement (Tasks 1, 7, 10, 17).** `tests/risk.coverage.test.ts` requires every `src/` file to be in `RISK_SOURCE_MANIFEST` and `EXPECTED_RISK_SOURCES`, so the three new modules would have failed `test:product`. Each task now adds its file. Task 17 named "core per-file floors", but core covers only `stageB/**` and `schema.ts`: corrected to the risk floors.
11. **Index collection (Tasks 1, 2).** Only `NEEDED_US_GAAP_TAGS` is parsed into the fact index.
    - `collectTags` now collects `unlessBelow` tags (B4's `EquityMethodInvestments` floor needs this).
    - The bank interest-income chain is hoisted and collected beside `BANK_REVENUE_SPEC`.
12. **Spec-version comparator (Tasks 10, 11).** The integration plan (`2026-10-27-audit-remediation.md`, shared-files row 5) makes B3's `specVersionBefore` the one comparator, and B13 and B4 import it. The plan's new `compareSpecVersion` in `schema.ts` is removed. The wrapper is wired after B3's, and a composition test was added.
13. **Legacy display rule (Task 10).**
    - Added (c), a `quality.notes` line for FIN-509-V1 and FIN-510's non-valuation consumers. The fair-value line (a) needs an available fair value, and MCD's DCF was n/m.
    - (b) now also triggers on annual revenue re-presentations (FIN-511's derived-Q4 case).
    - EDGAR-built detection is anchored on the `keyless.<member>` "served by edgar" entry.
    - `METHODOLOGY.md` has no "never rewritten" paragraph to grep, so the placement is now concrete (beside B3's display-correction paragraph).
14. **Task 6 gap wording.** `computeSupportFlags` does not know the route, so the reason is route-neutral ("on SEC-built statements").
15. **Task 9.**
    - `restatement` and `original` are not declared on `FmpIncomeStatementRow`: they are read through a structural guard.
    - Defined the missing branch (comparison has no copy on the printed quarter's basis gives a dash).
    - Added the Q1 FY2025 QoQ assertion (dash), set `builtAt` after the latest supplying filing, and added `EMPTY_VALIDATION` and the `!` on `buildFilingDisclosures`.
16. **OD-2.** "A derived-EBIT filer tags no operating subtotal by definition" was too strong. `Revenues − CostsAndExpenses` exists at some filers (B4 uses it), but its scope varies (XOM's total costs include interest), so it is not a guard. The decision stands.
17. **Task 4 interface.** Says why amounts need not agree. Records the per-period residual: quarters of an old re-tagged year keep the add-back.
18. **Task 8.** Fixture helpers spelled out (`recast`, `vendorQ4`, `aepFacts`).
19. **Tasks 14, 15, 16, 18.**
    - Residuals extended, house constants updated.
    - The replay prints serving tags and derivations, so every tag change is attributed.
    - Reviewer checklist matched to the new rules.

Owner decisions, checked against their sources (fetched 2026-10-28):
- **OD-1.** S-X 5-03 captions 7-10 and DQC_0181 ("Select the nonoperating interest expense element InterestExpenseNonoperating instead of InterestExpense") are quoted correctly. Kept.
- **OD-2.** S-X 5-03 (d) and (b) are verified. The eBay R page was not fetched, because the reviewer avoided sec.gov document fetches. The NNN arithmetic is local. Kept, with the wording fix above.
- **OD-3.** RESEARCH 5.3 is quoted correctly. Kept.
- **OD-4.** Kept, with the corrected justification (item 3).
- **OD-5.** FRM 13110.3, 13110.4 and 13210.1 are verified verbatim. Refined (item 6). FRM 13110.4 is exactly why the planner's first rule regressed.
- **OD-6.** Kept, as a deviation from the brief's default with its stated reason.

Cross-batch dependencies. They supersede `tmp/audit-2026-10-27/plans/B13.summary.json` where they differ; that summary predates this review.
- **B3 (merges first).** B13 imports B3's `specVersionBefore` (`src/report/legacyPayloadRecordSafety.ts`), wires its wrapper after B3's in all five chains, and places its risk-manifest entry after B3's file. Task 9 edits `quarterlyTrendSection`'s consolidated loop and notes, and B3 Task 6 edits its segment half: rebase.
- **B4 (merges after).**
  - Task 8 reuses `first.unlessBelow` with B13's semantics: per-synonym skip, `SYNONYM_FLOOR_TOLERANCE = { relative: 0.005, absolute: 2_000_000 }`, the floor probe inside `notes.quietly`, and a refusal that becomes a withholding only when the field ends null. Its `EquityMethodInvestments` floor is now collected by `collectTags`.
  - Re-check its "LongTermInvestments 271 vs EquityMethodInvestments 32653" test and the "a total of 40000 stays the total" control.
  - Its placement rule reads the derived-EBIT context, which now carries `amounts`, the optional interest part (FIN-507), the period-keyed nesting (FIN-508) and `OtherNonoperatingIncomeExpense` (FIN-509). The `sumAll` evaluation lines it cites (`:1690-1700`) move.
  - The pretax part may be the domestic + foreign composition. Classify it as a standard pretax.
  - A refused filed OI no longer reaches the derivation (`stopOnRefusal`).
  - Task 15 uses B3's `specVersionBefore` and composes after B13's wrapper.
  - Task 21's JNJ baseline moves with FIN-509 and must be re-measured on post-B13 main. XOM files no `OtherNonoperatingIncomeExpense` and no `Depreciation` (retained companyfacts), so its baseline moves only if a D&A floor fires (check). BA's D&A floor is `AmortizationOfIntangibleAssets` only.
- **B5.** FIN-402 owns D-98's possible second removal of a charge inside the subtracted "other" line. Task 1 keeps `ttmIncome`'s contiguity gate and the `revenueCount < 4` suppression, which B13 relies on for a withheld Q4. B5 Task 3 edits `src/pipeline/filingDisclosures.ts` (the guided quarter end) in the same file as B13 Task 9 (integration row 12): rerun each other's tests.
- **B6.** It edits TTM operating income (`compute.ts:1241-1255`); B13 relies on it being null when fewer than four quarters carry it.
- **B9.** Different functions in `statements.ts`, `financialEnrichment.ts` and `filingDisclosures.ts`.
  - DATA-104's unit reordering must keep `UnitPoints.all` per unit, which `oneBasisPair` reads. Its extra `mixed_unit` cases are exactly what the quiet probe protects against.
  - B9's addendum AI-508 (segment cells across presentations, B9 OD-11 and Task 21) does **not** reuse `presentationMixed` / `oneBasisPair` (decisions spec section 3, C-10, settled: B9 OD-11 stands). Those helpers compare stated companyfacts copies of one period in two filings, and segment instances seldom state a window twice. On the AI-508 probe's case-(a) filing set, no stated copy of Q1 2025 exists before the new 10-Q, so the helpers would not see the recast. B9 instead compares the windows each segment filing states or implies on its own.
    - What the two batches share is the rule, not the code: B13's 1% threshold (B9's `SEGMENT_RECAST_THRESHOLD_PCT`, pinned by a B9 test to equal `RESTATEMENT_THRESHOLD_PCT` exported from `src/edgar/statements.ts`), the 2,000,000 rounding allowance (B9's `SEGMENT_ROUNDING_FLOOR`, the absolute term of `SYNONYM_FLOOR_TOLERANCE`), and the outcomes: a pair that moved together is kept, and a pair that nets two presentations, or a superseded copy (OD-5 (a2) and (a2′)), is withheld.
    - B9 has no first-reported-copy path, so C-9's `labelled` split has nothing to apply to there.
    - This plan adds no export for B9 and implements nothing on B9's side. It keeps `RESTATEMENT_THRESHOLD_PCT` exported under that name from `src/edgar/statements.ts`, because B9's equality pin imports it.
    - The previous wording of this line, which asked B9 to reuse the helpers with the `labelled` argument, is superseded (master plan conflict row 11 and open item 3).
  - DATA-103's classification rebuild routes bank interest income through `BANK_INTEREST_INCOME_SPEC`; add a bank interest-income assertion.
- **B12 and R3.** B12 must keep B13's METHODOLOGY paragraphs (B-7, B-39, the derived EBIT, derived quarters, trend growth, legacy display) and the RESEARCH 5.3 sentence. R3 Task 25 edits the trend table note at `filingDisclosurePresentation.ts:120`, which Task 9 also changes; keep one note.
- **B1/B2.** Dashed trend cells register no payload figure, so claims citing them become unchecked (intended).
- Stamps, the D-number and `EDGAR_DERIVED_LINES_SINCE_SPEC_VERSION` are renumbered together at merge.

Left for the main session:
- `docs/superpowers/specs/2026-10-27-audit-remediation-decisions.md` still does not exist. Write it, or drop the reference from every plan.
- Items 6-8 go beyond the findings' minimal fix sketches. Without them the fix would regress HEAD on ordinary filings: a re-presentation sequenced through the 10-Qs, a 10-K/A, a narrower synonym taking over, and a mis-described derived EBIT. Confirm the house rules in the D-next entry.
- The 2,000,000 absolute floor allowance is a house constant recorded in D-next. Revisit it if a census replay shows a floor that should have fired staying silent.
- The census replay (Task 16) is where the class-wide reach of Task 7 shows. Any precision re-filing move or serving-tag change outside BAC must be explained before merge.

## Integration notes (2026-10-28)

Applied by the integration pass from `docs/superpowers/specs/2026-10-27-audit-remediation-decisions.md` section 4.3 ("Main-session resolutions (2026-10-28)", binding), C-9 line: "Keep B13's first-reported-copy derivation for re-filings within `RESTATEMENT_THRESHOLD_PCT` and for re-presentations the filing labels as such. For a material change to a previously reported figure that is not shown to be a re-presentation, withhold the derived quarter and name both filings (ASC 250: a restatement replaces the original)." B6's plan (`2026-10-27-audit-fix-06-financial-routes-currency-and-grading.md`, OD-9) was read and not edited. The "Review notes" above are kept as history; their "Left for the main session" item on the spec file is settled (the spec exists). Each change and what it implements:

1. **Spec line.** The decisions spec exists; the Spec line points to its sections 2.7, 3 (C-9) and 4.3 and drops "does not exist at HEAD". Implements the brief's "fix the plan's Spec line".
2. **OD-5 decision (C-9).** Rule (a) is split. (a1) keeps the first-reported pair for a re-filing within 1% (precision-only: LLY, AEP) and for a re-presentation the re-filing labels. (a2) withholds the quarter, naming both filings, for a material change that is not shown to be a re-presentation. "Labels" is defined concretely from what companyfacts can carry: a non-zero discontinued-operations fact (`DISCONTINUED_LABEL_TAGS`, already parsed) for the same period in the re-filing, new there or moved by more than 1% (ASC 205-20-45-3 and 45-3A). The OD-5 text says why no other label reaches companyfacts (dimensional restatement-axis facts; SEC API documentation "Apply to the entire filing entity"). BAC's Q4 2024 is now withheld: FY2024 revenue moved +3.90% in the 10-K of 2026-02-25, and an offline check of the retained companyfacts on 2026-10-28 found no discontinued-operations or accounting-change element filed for FY2024 in that 10-K. Alternatives rejected gain "first-reported pair for every material re-filing" (the reviewed rule) and "net-income invariance as a label"; two existing rejections are reworded so they stay true. Sources added: ASC 250-10-45-23 (PwC Viewpoint 30.7, B6 OD-9's source), ASC 205-20-45-3/45-3A (Deloitte Roadmap 7.3, checked 2026-10-28), and SEC's EDGAR API page (checked 2026-10-28).
3. **Agreement with B6 OD-9.** B6 applies ASC 250-10-45-23 ("the restated figure replaces the original for every use") to a refused annual revenue. After C-9, B13 never derives a quarter from a first-reported copy that a material, unlabelled re-filing may have superseded, and its annual rows keep the last-filed (restated) value, as at HEAD. The two plans therefore apply one rule. A precision-only re-filing (a1) is not a correction under either plan, and B13 Task 8 then derives the vendor-comparison quarter from the first-reported pair, so B6's revenue cross-check sees no false conflict. The OD-5 Revises line records this.
4. **Task 7 interfaces and rules (C-9).** New pure helpers `movedBeyond` (the one materiality test, also used by `filingRepresented`) and `representationLabelled`, plus the `LabelCopy` type. `oneBasisPair` takes a fifth argument `labelled`. `PairChoice`'s `pair` gains `refiledAs` ("precision" | "labelled-representation" | null). Rule 3 is split into 3a (material and unlabelled: withheld, with the reason text naming both filings, the move and ASC 250) and 3b (today's first-reported path). `statements.ts` exports `DISCONTINUED_LABEL_TAGS`, and the resolver builds the label copies once per fact index from the index it already reads. The first-reported note names why the copy stands in.
5. **Task 7 tests (C-9).** The BAC test now expects Q4 2024 withheld, with the reason naming the 10-Ks of 2025-02-25 and 2026-02-25 and "+3.90%". New `labelledRepresentationFacts("new" | "none" | "unchanged")` fixture and two tests: a new discontinued-operations line keeps the first-reported pair (100, provenance 10-K 2025-02-12 and 10-Q 2024-11-05); no line, or a line unchanged since first reported, withholds it with both filings named ("-20.00%"). Step 2 lists the new HEAD failures (20 for the three variants, by the same arithmetic as `syntheticFacts`: HEAD nets the 320 winner against the 300 nine-month copy of the 10-Q of 2025-11-03; these fixtures were not run in a scratch build). Unchanged: the precision (AEP), moved-together (Q2-represented), amended 10-K/A, unchanged re-filing and synthetic tests; the synthetic Q4 2024 was already withheld and now carries the C-9 reason. Review Focus item 10 is added.
6. **Task 7 benefit check and docs (C-9).** BAC Q4 2024 revenue and pretax are withheld (pretax FY2024 moved +13.57%), not 25,347M / ≈7,108M. The census list must name every 3a withholding and every labelled 3b pair. The METHODOLOGY paragraph states the C-9 rule and cites ASC 250-10-45-23 and ASC 205-20-45-3.
7. **Task 8 (same helper, C-9).** `filedFlow` passes the same `labelled` callback, built from the same tags in the facts it already reads. Test (b) now expects no fill (the finance-lease principal FY moved 10%, unlabelled), not 10. New test (d) adds a discontinued-operations line in the probe's re-filing 10-K and expects the first-reported 40 − 30 = 10. Test (a) still keeps the vendor CFO, now because the SEC side is withheld. (c) AEP precision is unchanged. Step 2 lists the new failures.
8. **Task 9 fixture (follows Task 7).** The synthetic BAC trend row for Q4 FY2024 is null (withheld) instead of 25,347M; the Q1 FY2025 QoQ assertion stays null, with its reason now the withheld comparison. The benefit check says Q4 FY2024 prints a dash. OD-6 itself is not changed: C-9's line concerns the derived quarter, and OD-6's growth cell divides two filed quarterly figures, each the value its own supplying filing reported, without publishing a superseded level. Whether a material, unlabelled re-presentation of the comparison quarter should also dash the growth cell (instead of dividing by its first-reported copy, as OD-6's BAC Q3 FY2025 QoQ does) is left for the main session, because 4.3 does not decide it. (Since decided: decisions spec 4.5, O-1, keeps OD-6; see OD-6.)
9. **Tasks 14, 15, 16, 18, 19 (C-9).** The residuals add three items: a re-presentation labelled only dimensionally or in text reads as unlabelled (withheld; BAC is the census case); a correction made in the same filing as a new discontinued-operations line keeps the first-reported pair; and a 10-K/A that corrects the whole year keeps the 10-Q nine months. The DECISIONS bullet and house-constants line state the C-9 rule. The replay table's BAC rows are updated. The reviewer checklist checks the C-9 rule in both callers. The PR names the decision.
10. **Cross-batch notes confirmed against B4's plan.** B4's plan was edited in the same pass to agree (see its "Integration notes (2026-10-28)", items 8-12): it reuses `first.unlessBelow` with this plan's semantics (declared on the `longTermInvestments` synonym entry), reads the derived-EBIT `amounts` and classifies the B-32 composition as a standard pretax, imports B3's `specVersionBefore` (no `compareSpecVersion`), wires its wrapper after `withLegacyEdgarDerivedLines`, rebuilds census rows in its replay and re-measures JNJ, XOM and BA on post-B13 `main`. No change to this plan's cross-batch section was needed except one addition: B9's addendum AI-508, which reuses `presentationMixed` / `oneBasisPair`, must pass the `labelled` argument (`representationLabelled` over `DISCONTINUED_LABEL_TAGS`) so segment cells follow the same C-9 rule. (That addition is superseded by conflict C-10: B9 does not reuse the helpers. See the rewritten B9 line in "Cross-batch dependencies" and "Post-integration review (2026-10-28)", item 2.) Order stays B3 → B13 → B4: this branch is cut after B3 merges and merges before B4.

The B13 planner summary (`tmp/audit-2026-10-27/plans/B13.summary.json`) predated this plan's review. It was rewritten to match this plan (review changes and C-9); where they differ, this plan is the authority.

## Post-integration review (2026-10-28)

An independent review of C-9 as this plan applies it (OD-5, Task 7 and the tests and rules that carry it into Tasks 8, 14, 15 and 18), and of the open lines the decisions spec gives this plan (C-10, and O-1, which 4.5 decided). The rule was traced through `quarterResolver`, `lineagePoints` and the fact index's `all` copies at HEAD 6542531 (`src/edgar/statements.ts:1196-1219`, `:1350-1372`) and through the HEAD tests it touches (`tests/edgar.statements.test.ts:2392-2493`). The expected values were recomputed:
- BAC: 105,856 − 76,540 = 29,316 at HEAD; the first-reported pair 25,347; +3.8955%, printed "+3.90%"; Q4 2025 113,097 − 81,917 = 31,180.
- The labelled fixture: 400 − 300 = 100, and 20 at HEAD.
- Precision: 6,804.3 − 5,076.9 = 1,727.4.
- `describeChangePct` prints "+3.90%" and "-20.00%" as the regexes expect.

The census was scanned read-only from the snapshots' own companyfacts, with no SEC call and no database; no test suite was run. Changes made to this plan:

1. **C-9 extended to the subtrahend side (OD-5 (a2′), `oneBasisPair` rule 4).** 4.3's C-9 line withholds a derived quarter for "a material change to a previously reported figure that is not shown to be a re-presentation". Decisions spec section 3 says that after C-9 "B13 never derives from a copy a material, unlabelled re-filing may have superseded". The plan applied the test to the minuend only.
   - The gap: when the FY is filed once and the nine months it is netted against are re-filed later by a filing the 10-K could not see, rule 2 kept the lineage copy. HEAD pins exactly that case (`tests/edgar.statements.test.ts:2476-2481`: 400 − 300 = 100 beside a later 280, −6.67%, unlabelled). If the later copy corrects an error, ASC 250-10-45-23 supersedes the copy used.
   - The fix: every pair `oneBasisPair` keeps is checked against the copies of its subtrahends filed after its minuend's filing, with the same `movedBeyond` and `labelled` tests. A material, unlabelled re-filing withholds the quarter, naming both filings. The later copy is still never netted (D-13).
   - Tests: a new failing test and two controls (re-rounding; labelled re-filing). The D-13 pin is re-pinned with a comment naming C-9; that is stricter, not looser. OD-5, the Global Constraints' re-pin list, Task 7's interface, Steps 1-7, Review Focus 11, and Tasks 15 and 18 now say so.
   - Census effect: none. An offline scan (`tmp/audit-2026-10-27/plans/B13-post-int/`) finds no such case for revenue, operating income, net income, pretax or CFO from FY2023 on. The Q3 2026 10-Qs that already re-file their nine months (JNJ, T, NFLX, AAPL, DIS) do so unchanged.
   - Task 8 inherits the rule through the same helper. Its fixtures re-file no subtrahend, so its expectations are unchanged.
   - Every existing Task 7 expectation was re-traced under rule 4 and is unchanged: BAC, labelled, "none"/"unchanged", Q2-represented, precision, amended, re-presented operating income and pretax, subset synonym, and the unchanged control. In each, no subtrahend copy filed after the pair's minuend differs from the copy used. The 2026 10-Qs of `syntheticFacts` re-file Q1 2025 and 6M 2025, which no derivation nets.
2. **C-10 settled: the cross-batch line asking B9 to reuse this plan's helpers is rewritten** ("Cross-batch dependencies", B9). B9 OD-11 stands: `presentationMixed` / `oneBasisPair` compare stated companyfacts copies, and on the AI-508 probe's case-(a) filing set no stated copy of Q1 2025 exists before the new 10-Q, so they would miss the recast.
   - The line now says what the batches share: the 1% threshold, the 2,000,000 allowance and the outcomes, including (a2′), which matches B9 OD-11 (a). It also says what this plan must not break: `RESTATEMENT_THRESHOLD_PCT` keeps its name and module, because B9 pins its own constant to it.
   - Integration notes item 10's addition is marked superseded, and Task 19's merge notes name C-10.
3. **O-1 recorded as decided (decisions spec 4.5).** OD-6 now says the growth-cell question is closed (OD-6 kept, V7 checks it), and Integration notes item 8 points to it. No rule changed.
4. **Committed-markdown checks (Task 14).** The master plan commits this plan with the B13 PR, so Task 14 now adds it to `ALLOWED_MARKDOWN`, stages it by name and runs `tests/docs.lint.test.ts` beside the release test. The plan was checked read-only against `unsafePublicDocument`'s two patterns and `docs.lint`'s relative-link rule, before and after these edits: no home path, no credential-shaped value, no unresolved link.

Left for the main session:
- Item 1 goes beyond the plan's reviewed rule and revises a HEAD pin, although the C-9 resolution's own wording asks for it. Confirm it when writing D-next. Decisions spec 2.7 (B13-OD-5), which describes C-9 as a rule about the minuend, and section 3's C-9 row should gain the subtrahend side when the spec is next refreshed. This plan cannot edit them.
- `tmp/audit-2026-10-27/plans/B13.summary.json` was updated to match this review; where they differ, this plan is the authority.
