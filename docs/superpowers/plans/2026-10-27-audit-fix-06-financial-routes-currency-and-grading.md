# Bank, Insurer, REIT and ADR Routes: Currency, Routing and Grading Implementation Plan

> Merge integration ruling (2026-10-30): B6 follows B5a at report 1.52.0, payload 1.54.0, Stage B ACCOUNTING_EVIDENCE_33 and D-137. The financial implied-return display cutoff is 1.52.0; B5a annualization remains frozen at 1.51.0 and the bridge at 1.50.0. The integration delta group is `audit-b6-financial-routes-d137-20261027`. Original stamp examples below describe the parallel build and are superseded by this ruling. Existing deferrals in spec 4.7 remain; the owner now authorizes merge after combined verification.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Make every figure, grade and disclosure on the bank, insurer, mortgage-REIT, undetermined-REIT, FIN-OTHER, unresolved-eligibility and ADR paths obey the rules the repository already states (one known currency for any quote comparison, one scope rule for market equity, route-withheld evidence is not missing evidence, a figure is dated by the period it covers, one construction on both sides of any comparison), fixing the 26 B6 findings of the 2026-10-27 audit: 22 from rounds 1-3; FIN-503, FIN-504 and FIN-505 from round 4 on the peer comparison and the own-history P/E rank; and FIN-506 (Low, the excess-return reverse solve's share basis), which the main session moved here from B5 on 2026-10-28 because Task 5 rewrites the same reverse solve (decisions spec 4.3). FIN-506 is Task 5A, the commit after Task 5; B5's Task 22 is a tombstone.

**Architecture:** Each root cause is fixed once, at the producer, so every consumer (route metrics, payload, key data, grades, exports) inherits the fix: the P/TBV pairing gains a currency withhold and its own dates; the forensic and WACC scope calls share the multiples' ADR-aware scope; grading gets one way to say "route-withheld" (`applicableFraction`) and one way to say "withheld but applicable" (`noDataReason`); routing and degradation text are rewritten to describe what runs; the peer comparison and the own-history P/E rank read the subject's figure on the same scope, earnings test and construction as the other side. Stored reports are never rewritten (D-67); display-only fixes read new optional fields and fall back for legacy reports.

**Tech Stack:** TypeScript (Next.js 16 app, but no task in this batch touches `src/app`, route handlers or the proxy), Vitest (hermetic: `tests/setup` blocks live network), Zod report schema, the keyless SEC-fixture pipeline harness (`tests/audit.issuerPipeline.test.ts`), `npm run audit:deltas`, `npm run research:replay`.

**Spec:** `tmp/audit-2026-10-27/REPORT.md` (section 7, "### B6: Bank, insurer, REIT and ADR routes: currency, routing and grading", `:1809` as of 2026-10-28), `tmp/audit-2026-10-27/findings.json`, `tmp/audit-2026-10-27/brief/batches.json`, `tmp/metis-fixes-prompt.md` (batch conventions), all git-ignored and read-only; and `docs/superpowers/specs/2026-10-27-audit-remediation-decisions.md`, whose section 4.3 ("Main-session resolutions (2026-10-28)") is binding for this plan. That spec exists in the working tree as an untracked file, not on main at HEAD 6542531 (Task 29 says how the batch treats it).

**Branch:** `fix/financial-routes-currency-and-grading`, cut from an up-to-date `main` (`git fetch origin && git switch -c fix/financial-routes-currency-and-grading origin/main`). Merge order (REPORT.md section 7): after B1-B5 and before B9; FIN-105-V1 here and RPT-201 (B9) edit the same key-data dividend-yield row, so B9 rebases on this branch's merge.

## Global Constraints

- Failing test first for every finding; if a finding cannot be made to fail at HEAD, skip it and say so in the PR (none expected: every probe below fails at HEAD 6542531, re-read in this plan).
- Smallest change that fixes the whole class; never ticker-specific code; no unrelated refactoring.
- One commit per task; stage files by name (`git add <path> ...`), never `git add -A` or `git add .` (tmp/ and the brag-output folders must stay uncommitted).
- Tests are hermetic: no live network, no FMP/SEC/Yahoo/FRED/AI calls, no paid calls, never a report for a real ticker. Fixtures are synthetic (`tests/helpers/currencyBundle.ts`, `tests/helpers/researchRoutePanel.ts`) or the committed SEC companyfacts fixtures under `fixtures/edgar/` (SEC public data, allowed by `docs/DATA-RIGHTS.md`); never commit FMP rows or anything from `tmp/`.
- The probes in `tmp/audit-2026-10-27/probes/` are seeds only: copy their logic into `tests/`, drop every `fs.writeFileSync` and every read of `tmp/` (several probes rewrite evidence logs in other agents' folders). No file of this batch is written under `tmp/audit-2026-10-27/probes/`: its config's glob would run it in the post-fix verification (master plan conflict row 50), so Task 31's replay harness lives in `tmp/audit-2026-10-27/replay/b6/` with its own config.
- Every behaviour change updates `docs/METHODOLOGY.md` (and any other markdown that describes it: README, `docs/RESEARCH.md`, `docs/OPERATIONS.md`, `docs/superpowers/specs/*`) in the same commit; grep the docs for the old wording before committing.
- Version stamps: a change in what a figure, prompt or payload means moves its stamp (`STAGE_B_IMPLEMENTATION_VERSION` in `src/pipeline/runInputSnapshot.ts:30`, `PAYLOAD_VERSION` in `src/pipeline/stageC/payload.ts:421`, `REPORT_SPEC_VERSION` in `src/report/schema.ts:139`, `SCORE_BANDS_VERSION` in `src/pipeline/stageB/grading.ts:51`), and `tests/report.versionStamps.test.ts` moves with it. Stamps move once, in the batch-level task, not per commit.
- A payload change moves the golden pin in `tests/stageC.payload.passes.test.ts` (fingerprint, promptBytes, financeHash/provenanceHash) with a dated comment saying why.
- Stored reports are never rewritten (D-67). `display-only` fixes change how stored reports show; `needs reinterpretation` fixes get a display-time rule (or an explicit "legacy reports keep their stored value" note) for reports without the new field.
- Never weaken a check or loosen a test to make it pass; a fixture that encoded the defect (an impossible bank Piotroski 8/9, a market-cap history that starts mid-window) is replaced by a realistic one and the commit says why.
- New `getConfig()` reads in Stage B are forbidden (`tests/jobRunner.test.ts` pins the count); pass values down from `runStageB`.
- Code comments cite `docs/METHODOLOGY.md "<heading>"` or D-numbers, never section numbers of retired documents.
- New tracked files are `git add`ed before `tests/repository.release.test.ts` runs (it partitions `git ls-files`).
- D-numbers are assigned at merge time: write "D-next" everywhere (DECISIONS, CHANGELOG, comments, disposition note) and renumber at merge, together with the stamp strings.
- No "D-next" in any string that reaches the payload or the report (peer methodology lines, exclusion reasons, basis sentences, gap reasons): a placeholder there moves the payload golden and the audited deltas again at merge-time renumbering (the B3 plan's rule). Cite an existing number (D-98, B-8, D-65) or none.
- `npm run audit:deltas -- --write --group <name>` only after confirming every changed leaf follows from a task in this plan.
- Never open `*.db`, `*.db-wal`, `*.db-shm`; exclude `*.db*` from recursive greps (reviewers too).
- `npm run verify` is run in foreground chunks (its steps one by one), never in the background; known load flakes are listed in the verify task.
- This plan file is committed with the batch, and no other planning document is (master plan, "Where the planning documents are committed": "each its own plan file only"). `tests/repository.release.test.ts` keeps an explicit `ALLOWED_MARKDOWN` allowlist of tracked Markdown, and an unregistered tracked plan fails it, so Task 30 registers this file there in the same commit that stages it. Never `git add` another file under `docs/superpowers/plans/` or `docs/superpowers/specs/`. (This replaces the first draft's "never `git add` this plan file", which the master plan revised.)
- AGENTS.md (Next.js 16): no task edits `src/app`, a route handler or the proxy. Task 2 edits a React component (`src/components/report/ReportView.tsx`) and Task 21 edits `src/components/report/DossierCover.tsx`; before touching either, read `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` and `node_modules/next/dist/docs/01-app/02-guides/server-and-client-boundary.md` (the presenters they import must stay free of Node-only modules). Task 22 edits `src/report/researchReview.ts`, a presenter that `src/components/report/ValuationReview.tsx` and `ThesisCheckpoints.tsx` import: the same two guides apply, and it may gain no import beyond `@/report/*` and type-only imports. Tasks 22 and 23 give `src/pipeline/peers.ts` runtime imports from `@/pipeline/stageB/securityBasis` and `@/pipeline/stageB/valuation`; `peers.ts` is imported only by `compute.ts`, `dataBundle.ts` and `stageC/payload.ts` at runtime (and type-only by `peerFilings.ts`, `types.ts` and `valuation.ts`). `compute.ts` and `payload.ts` already load `valuation.ts` at runtime (`payload.ts:48`); `dataBundle.ts`'s own graph does gain the two modules, but both of its importers (`src/app/company/[symbol]/page.tsx:31` and `src/pipeline/jobRunner.ts:90`) already import `compute.ts`, so no entry point gains a module. There is no cycle: `valuation.ts` and `securityBasis.ts` reach `peers.ts` only through type imports. `npm run build` (Task 32) confirms it. Task 5A edits `src/report/legacyValuationNotes.ts` (B5 Task 17's module, which `ReportView.tsx` and the exports compose): the same two guides apply, the row adds no import beyond `@/report/*` and type-only imports, and no `"use client"` boundary moves. Task 1 changes what `statementCurrencies(bundle).trading` returns for a minor-unit code, which `src/app/company/[symbol]/page.tsx:217,585-588,1046` reads without being edited: a pence quote then prints its price as "(currency unknown)" there instead of in pounds, which is the intended non-folding behaviour.

## Owner decisions

None of the nine batch-gating defaults in the brief (peer cap currency, period-less records, excerpt binding, insider statistics, annualising a quarter, the equity bridge, lease basis, failed paid streams, judge order "both") falls in B6. Peer cap currency (default 1, AI-301, B3) touches the same file as FIN-125/FIN-126 (`src/pipeline/peers.ts`) but a different mechanism; B6 neither relies on it nor changes it. The decisions below are the B6 findings marked `ownerDecisionNeeded`, plus the optional sub-choices the other findings name. OD-13 to OD-15 were added for the round-4 findings (FIN-503, FIN-505 and FIN-504's display sub-choice); none of them is one of the nine gating defaults or FIN-402. FIN-506 (Task 5A, moved here from B5) needs no owner decision (`ownerDecisionNeeded: false`: one share basis on both sides of the reverse solve is a consistency fix). The main session's resolutions for this plan (decisions spec 4.3, 2026-10-28) are applied where they bite: the three reviewer scope extensions are confirmed (OD-9, OD-12's FIN-312 and RPT-101 bullets), and the Altman (2000) passage is re-read and quoted before D-next (OD-6, Task 29). The owner delegated each call ("Use your recommendation based on research"); each is recorded as a D-next entry in `docs/audit/DECISIONS.md` (Task 29).

### OD-1 Minor-unit quote codes (FIN-107)

- **Question:** are non-US listings in scope with an FMP key, and should a minor-unit quote ("GBp", "GBX", "ZAc", "ILA") be scaled by 1/100 or refused?
- **Decision:** keep non-US listings reachable (no scope change), and refuse the comparison. `comparePriceCurrency` recognises the minor-unit codes before upper-casing and returns `{ comparable: false, mismatch: false, reason: "quote in GBp (pence, a minor unit of GBP), statements in GBP — minor-unit quotes are not rescaled, so no comparison is made" }`. `mismatch` is `false` on purpose: in this codebase `mismatch: true` means "two known ISO currencies, an FX rate would be needed", and five consumers print fixed "(ADR case) … FX conversion pending" text on it instead of the comparison's reason (`valuation.ts:4081`, `forensics.ts:541-547`, `returns.ts:876-887`, `capital.ts:1000`); a minor unit is an unproven unit, not an FX case, so it takes the "comparison unproven" path, every consumer prints the reason (which names the pence), and statement-currency per-share figures stand exactly as for an unknown quote currency. `normalizeReportedCurrency` returns null for a minor-unit code. It is also the trading-currency normaliser (`compute.ts:1477` → `statementCurrencies().trading`, read by `marketData.ts:56`, the payload's technicals figures and the company page), so a pence quote is labelled "(currency unknown)" everywhere instead of pounds. All-lower-case "gbp" stays GBP: case-folding is kept for ISO codes; only the mixed-case and non-ISO minor-unit spellings (`GBp`, `GBX`, `GBx`, `ZAc`, `ZAC`, `ILA`, `ILa`) are special (none is an active ISO 4217 code).
- **Rejected:** scaling by 1/100. It is not an FX conversion, but the provider's market-cap unit for the same listing is undocumented (FMP may serve the cap in pounds while the price is in pence), so a scaled price beside an unscaled cap would be a new silent 100x error. Refusing is the house's existing answer to an unproven comparison. Declaring non-US listings out of scope was also rejected: `SYMBOL_PATTERN` accepts them and nothing else gates them, so refusing the comparison is narrower and reversible.
- **Revises:** nothing recorded (DECISIONS has no minor-unit entry). It extends the one-known-currency rule of `src/pipeline/stageB/priceCurrency.ts` and `docs/METHODOLOGY.md` lines 206-214.
- **Sources:**
  1. FIX Trading Community forum, "GBP, GBp, GBX" (https://forum.fixtrading.org/t/gbp-gbp-gbx/4279; re-read by the plan reviewer 2026-10-27): "GBX is a sub-currency of GBP. GBP is ISO whereas GBX is not"; "the smaller currency units are not defined in ISO 4217"; "The LSE issues quotes in GBX and positions are reported in GBP"; participants report firms using both "GBp" and "GBX", which is why both spellings are refused.
  2. Wiktionary, "GBp" (https://en.wiktionary.com/wiki/GBp): an unofficial non-ISO 4217 code for penny sterling, "sometimes used for stock prices, which may be shown in pence rather than pound sterling".

### OD-2 A buyback year the market-cap history covers only in part (FIN-117)

- **Question:** withhold a partly covered fiscal year (and at what threshold), or extend the market-cap fetch window?
- **Decision:** withhold. A repurchase year is priced only when the market-cap history starts no later than its fiscal window's start plus `BUYBACK_WINDOW_START_TOLERANCE_DAYS = 7` calendar days (a weekend plus the year-end holidays). Otherwise the year is unpriced under D-68: `avgMarketCap` and `avgPriceProxy` are null; the row note says "market-cap history starts <first day>, inside the fiscal window <start> to <end>; a part-window average is not the fiscal year's average price"; the year leaves the timing numerator, the denominator and the covered dollars; and the D-68 timing note names it. The rule tests where the history starts, not a trading-day count: provider series are daily, and a day-count threshold would be a second unfitted number.
- **Rejected:** extending the fetch to the oldest window's start (latest FYE minus five years minus one day). It costs a sixth year of daily history from every provider (FMP chunks its market-cap history at five years, `src/providers/fmp.ts:1115`, so one more request per run). It cannot help any stored run input, because the replay reads the frozen history. And the brief's rule for this audit is no new provider calls. It remains the better long-run fix and is listed under "Left for later" in the PR.
- **Revises:** extends D-68 (an empty window is unpriced and named) to a partly covered window, and sharpens D-61's "each fiscal year's average price". D-99 finding 15's three-year recency window is unchanged.
- **Sources:**
  1. Dittmar, A. and L. Field (2015), "Can managers time the market? Evidence using repurchase price data", Journal of Financial Economics 115(2), 261-282 (https://econpapers.repec.org/RePEc:eee:jfinec:v:115:y:2015:i:2:p:261-282; abstract re-read 2026-10-27): the authors "compare the actual average price paid monthly in a repurchase with the average market price for the same stock over various horizons". The benchmark is an average over a defined horizon; the house horizon is the fiscal year (D-61), and an average over part of it is not that benchmark. The 7-day tolerance is a house rule (weekend plus year-end holidays), not a figure from the paper.
  2. D-61 (`docs/audit/DECISIONS.md` line 268) and the timing note in `src/pipeline/stageB/capital.ts:1104-1106`: "at each fiscal year's average price".

### OD-3 Negative operating cash flow on a profitable FIN-OTHER issuer (FIN-121)

- **Question:** the unprofitable-overlay trigger is reserved for an owner policy decision (D-97 item 12, SNOW-3). Should a profitable broker-dealer, lender or other "Financial Services" issuer on the general map be labelled unprofitable because its operating cash flow is negative?
- **Decision:** no. The OCF exemption that already covers the bank, insurer and mortgage-REIT routes extends to FIN-OTHER: base `general` with sector "Financial Services", the branch at `sectorRouting.ts:307-322` that writes the FIN-OTHER routing note (keyless SIC 60-64/67 profiles reach it through the sector string `src/edgar/sic.ts` assigns). Net income stays the trigger there, and the existing "unprofitable overlay not applied" note (`sectorRouting.ts:737-742`) is written with FIN-OTHER wording. The general rule for non-financial issuers (NI < 0 OR OCF < 0), and with it SNOW-3 / D-97 item 12, is untouched.
- **Rejected:** keeping the three-route scope. Its own stated reason ("loan, deposit, trading-asset and reserve flows") is an accounting-classification fact that holds for broker-dealers and originate-to-sell lenders too, so the scope contradicted its reason. Also rejected: a SIC-only predicate. A keyless FIN-OTHER profile always carries the sector string and an FMP profile always carries an industry, so a SIC test would add a second rule and no coverage.
- **Known cost, named in the PR:** the predicate is the sector string, so fee-based FIN-OTHER issuers (asset managers, exchanges, insurance brokers routed general at `sectorRouting.ts:283-293`) and a cash-burning fintech with positive GAAP income also lose the OCF trigger; net income remains their trigger. The ASC 230 classification facts below apply to the lenders, broker-dealers and consolidated-fund managers that dominate the class, and a negative OCF with positive net income on a fee-based issuer is rare.
- **Revises:** `docs/METHODOLOGY.md` lines 2143-2148 (the three-route scope). D-97 item 12 is not touched.
- **Sources:**
  1. FASB ASC 230-10-45-20, quoted in Deloitte, Roadmap: Statement of Cash Flows, 6.3 Operating Activities (https://dart.deloitte.com/USDART/home/codification/presentation/asc230-10/roadmap-statement-cash-flow/chapter-6-classification-cash-flows/6-3-operating-activities; both paragraphs re-read 2026-10-27): "Cash receipts and cash payments resulting from purchases and sales of other securities and other assets shall be classified as operating cash flows if those assets are acquired specifically for resale and are carried at fair value in a trading account."
  2. ASC 230-10-45-21, same page: "Cash receipts and cash payments resulting from acquisitions and sales of loans also shall be classified as operating cash flows if those loans are acquired specifically for resale and are carried at fair value or at the lower of amortized cost basis or fair value."
  3. The repository's own rationale for the three routes, `src/pipeline/stageB/sectorRouting.ts:708-715` (JPMorgan's negative OCF in record-profit years).

### OD-4 A valuation withheld for unresolved model eligibility (FIN-123)

- **Question:** D-96 withholds the valuation (`kind: "ineligible"`) but does not say how it is graded. Count it at the share of the valuation aspect the unresolved policy still treats as applicable (6 of 20 points), or at the full route weight (20)?
- **Decision:** the policy share. `computeScores` gives `"ineligible"` the same signal shape as `"dcf-suppressed"`: `dcfUpside` and `reverseImpliedVsAchievable` tagged `suppressedBy: "fcfDcf"` (which `metricPolicy` already suppresses under unresolved eligibility, `sectorRouting.ts:1274-1276`) and `peOwnHistoryRank` with `raw: null`. It also passes a `noDataReason` naming the hold. The aspect is then applicable but unscored (`applicableCompleteness` 0), enters the composite's completeness ceiling, and `confidenceCeilingFor` takes its existing "unscored" branch (low).
- **Rejected:** full weight. Under the same D-96 hold, `metricPolicy` already treats the DCF, reverse DCF, EV multiples, net debt and ROIC−WACC as route-suppressed (not missing) in every other aspect; counting the DCF legs as missing here alone would put two meanings of "applicable" in one report. Also rejected: leaving it route-inapplicable, which is what produced the false "no applicable signals for this route" and the medium ceiling (audit 2026-10-19 FCX-14: a data gap is not a route design choice).
- **Revises:** completes D-96 (grading of the hold, previously unrecorded), following the D-50 review amendment.
- **Sources:**
  1. D-50 review amendment (`docs/audit/DECISIONS.md` lines 713-729): `applicableCompleteness` is "null when the route cannot score the aspect"; withheld evidence on an applicable aspect is missing, not inapplicable.
  2. `src/pipeline/stageB/grading.ts:851-861`, the `"dcf-suppressed"` precedent this mirrors, and `grading.ts:221-224` ("Audit 2026-10-19 FCX-14: a data gap is not a route design choice").

### OD-5 Route-withheld Piotroski tests and completeness (FIN-306)

- **Question:** D-24/F84 count a financial route's reduced Piotroski battery against quality completeness; the later D-50 review says route-withheld evidence is not missing. Which rule governs the confidence ceiling and the composite shrink?
- **Decision:** both, each for what it was written for. D-24's `evidenceFraction = outOf/9` keeps scaling the signal's contribution and used weight, so a three-signal battery still moves the quality score a third as much as a nine-signal one. A new `Signal.applicableFraction` scales the signal's route-applicable weight by `(9 − routeWithheld)/9`, where `routeWithheld` is the count of tests the forensic layer withheld for route reasons: 6 on bank, insurer and mortgage REIT, 4 on FIN-OTHER and unresolved eligibility, 0 elsewhere, exposed by `computePiotroski`. Only data-withheld tests then count as missing. A fully observed bank reads `applicableCompleteness` 1, the ceiling reason becomes true, and so does the composite methodology sentence ("excluded, not counted as missing").
- **Rejected:** rewording the ceiling reason and the methodology sentence instead. That keeps a structural shrink of about 5% on every fully observed bank, insurer and mortgage REIT that no data can remove, which is exactly the outcome the D-50 review was written to prevent.
- **Revises:** D-24 (`docs/audit/DECISIONS.md` lines 1796-1801), narrowed to the score. D-41's "about 7% of its intended evidence" is unchanged; it describes the score's evidence.
- **Sources:**
  1. Piotroski, J. (2000), "Value Investing: The Use of Historical Financial Statement Information to Separate Winners from Losers", Journal of Accounting Research 38 (summarised at https://www.aaii.com/journal/article/simple-methods-to-improve-the-piotroski-f-score; re-read 2026-10-27: "the sum of the nine binary signals", "ranges from a low of zero to a high of nine"): the F-score sums nine binary signals, 0 to 9. A test the business model cannot define lies outside the battery; it is neither a failed nor a missing observation.
  2. D-50 review amendment (`docs/audit/DECISIONS.md` lines 713-729): "`dataCompleteness` counts route-suppressed signals as missing, so every fully observed bank had ... capped at medium with the false reason".

### OD-6 One scope rule for an ADR's market equity (FIN-307)

- **Question:** B-8 keeps an unresolved-scope ADR cap on the Key data page, labelled "scope unverified". Should Altman X4 and the WACC keep using that cap with a label, or withhold it?
- **Decision:** withhold, as D-78 already does for unresolved class scope. The forensic and WACC scope calls pass `isAdr` exactly as the multiples call does (`compute.ts:3538`), so an unverified ADR cap resolves `unresolved` for all three consumers.
  - Altman: market equity is withheld with a new `forensics.altman.marketEquityScope` gap, and the private-firm Z' (book equity) is substituted. The gate at `forensics.ts:2760-2790` now fires on any structural withholding of market equity (currency mismatch or unresolved scope), never on a merely missing cap.
  - WACC: with debt outstanding, the existing `returns.wacc.weights` path withholds the WACC and carries the cost of equity, and the existing `returns.wacc.economicClassBasis` gap names the ADR.
  - Key data keeps B-8's labelled provider cap (display only, unchanged).
- **Rejected:** keeping the cap with a scope label. The rule exists for a mis-scaled depositary cap; the audit probe shows such a cap moving the Z zone from safe to grey and the WACC by 40 basis points with no disclosure, and a label does not stop the number from grading. Also rejected: substituting the cost of equity for the WACC, which overstates a levered firm's discount rate and is not the house's existing answer to unknown weights.
- **Consequences, named in the PR:**
  - The Z' substitution also reaches class-ambiguous issuers whose scope D-78 leaves unresolved (today their original-variant Z is withheld outright; `tests/audit.dcfOwnership.test.ts:61-62` pins that and is re-pinned in Task 16). Same rule, same reason.
  - Every ADR with debt whose depositary scope is unverified loses its WACC, and with it the DCF itself (enterprise and equity value, sensitivity grids, reverse DCF): `compute.ts:3886` passes the nullable `wacc.waccPct` to `valueCompany`, which files "WACC unavailable — DCF suppressed" (`valuation.ts:6103-6106`) before it ever reads `dcfInputs.waccPct` (the `?? 0` at `compute.ts:3460` is not reached on that path, so no 0% WACC is used; traced by the plan reviewer). The per-share value and fair value of such an ADR are already withheld at HEAD without verified ADS share evidence (`valuation.ts:5841-5853`, B-19), so the reader-facing loss is the aggregate DCF and the ROIC − WACC spread in the quality aspect. This is the path class-ambiguous issuers already take under D-78.
- **Revises:** extends D-78 (`docs/audit/DECISIONS.md` line 1892) to ADR scope. B-8 (`DECISIONS.md` line 2163) is unchanged for display.
- **Sources:**
  1. Altman, E. (2000), "Predicting Financial Distress of Companies: Revisiting the Z-Score and ZETA Models" (http://pages.stern.nyu.edu/~ealtman/Zscores.pdf): the Z' model substitutes the book value of equity for the market value of equity in X4, with its own zones (1.23 / 2.90). The PDF returned HTTP 500 to the plan reviewer on 2026-10-27, and the Wikipedia summary the planner cited does not state Z''s X4 or zones; the zones are confirmed by a practitioner summary (https://valuebasedmanagement.net/methods_altman_z-score.html: "2.90 or above ... 1.23 or below") and by the repository's own evidence base, `docs/RESEARCH.md` §1.2 ("Distress below 1.23; safe above 2.90") and the X4 rule in RESEARCH §1 ("market value of equity in original, book value in the other three"), which `forensics.ts:332,340` implement and `forensics.ts:2760-2790` already uses as the FX substitute. **Re-read before D-next (decisions spec 4.3, binding: "The executor re-reads Altman (2000) and quotes the passage before writing D-next").** The primary URL still returned HTTP 500 to the integrator on 2026-10-28. A course-hosted copy of the same July 2000 working paper (https://moodle2.units.it/pluginfile.php/322514/mod_resource/content/0/Zscores.pdf, 54 pages, title page "PREDICTING FINANCIAL DISTRESS OF COMPANIES: REVISITING THE Z-SCORE AND ZETA® MODELS", Edward I. Altman, July 2000) was fetched and text-extracted. Its section "A Revised Z-Score Model" (pp. 25-26 of the extract) reads: "Rather than simply insert a proxy variable into an existing model to calculate z-scores, I advocate a complete reestimation of the model, substituting the book values of equity for the Market Value in X4"; gives "Z' = 0.717(X1) + 0.847(X2) + 3.107(X3) + 0.420(X4) + 0.998(X5)"; says "the lower boundary is now 1.23 as opposed to 1.81 for the original Z-Score model"; and Table 6's footer reads "Z'>2.90 = Zone II (no errors in nonbankruptcy classification)" and "gray area = 1.23 to 2.90". The same footer prints "Z'<1.21 = Zone I", which disagrees with the text's 1.23 by 0.02. The house uses 1.23, the text's boundary and the gray area's lower end. Task 29 says how the executor re-reads and quotes it.
  2. D-78 (`docs/audit/DECISIONS.md` line 1892): "unresolved known classes suppress aggregate equity-dependent metrics, including WACC, intrinsic per-share values and original Altman market equity."

### OD-7 Grading an undetermined REIT sub-map (FIN-308)

- **Question:** D-16 routes SIC 6798 with no evidence to base `reit`, sub-map `undetermined`. Withhold the signals on which the equity and mortgage maps disagree, or declare an equity-REIT default?
- **Decision:** withhold. Under `reitSubmap === "undetermined"`, `metricPolicy` also suppresses what the mortgage map treats as a category error and the equity/industrial map grades: `roicVsWacc`, `operatingMargin`, `fcfGrowth`, `grossMargin`, `netDebt`, `netDebtToEbitda` (the new `REIT_SUBMAP_UNDETERMINED_GRADE_SUPPRESSED` list), plus `altmanZ`, `beneishM`, `accrualsRatio` through `isFinancialForensicsSuppressed`. `roic` is deliberately NOT added to the policy: `grading.ts` keys the moat's ROTE-versus-ROIC choice on `policy.suppress.includes("roic")`, so suppressing it would switch an undetermined REIT's moat to the bank's ROTE signals; the ROIC level and floor leave the grade through the moat's explicit not-applicable reason instead. The balance-sheet and moat aspects get an explicit `notApplicableReason` quoting the `route.reitSubmap` reason (like the insurer branch), which also drops the interest-coverage signal. The `route.reitSubmap` gap names the grading consequence. Determined equity REITs are unchanged.
- **Rejected:** an equity-REIT default. About one REIT in five is a mortgage REIT (Nareit, December 2025: 32 mortgage REITs against 139 equity REITs), and the undetermined state is exactly where the evidence cannot tell them apart. METHODOLOGY already refuses to publish either metric family there, because "publishing either set would assert a business model the evidence does not support", and D-96 applies the same principle to unresolved model eligibility. In the probe, grading net debt/EBITDA and EBIT coverage on repo funding gave a mortgage REIT a D balance sheet.
- **Known cost, named in the PR:** keyless specialty equity REITs that tag PP&E rather than `RealEstateInvestmentProperty*` (towers, data centres) lose these signals while undetermined. Widening equity-REIT evidence to material PP&E needs a threshold calibrated on real tower and data-centre companyfacts, which this batch may not fetch; it is listed under "Left for later".
- **Revises:** D-16 (`docs/audit/DECISIONS.md` line 1753), which said what is withheld from display but not from grading.
- **Sources:**
  1. Nareit, REIT Industry Fact Sheet, data as of December 31, 2025 (https://www.reit.com/sites/default/files/2026-01/MediaFactSheet_Dec-2025.pdf; Exhibit 2 re-read by the plan reviewer 2026-10-27): FTSE Nareit Mortgage REITs, 32 constituents; FTSE Nareit All Equity REITs, 139.
  2. `docs/METHODOLOGY.md` lines 1404-1408 ("Publishing either set would assert a business model the evidence does not support") and D-96 (`docs/audit/DECISIONS.md` line 2054: conflicting evidence "does not establish either an industrial model or a replacement financial model").

### OD-8 Dating the insurer's P/TBV pairing (FIN-106, with FIN-310)

- **Question:** relabel the insurer pairing's date, or move its denominator to the trailing window's end?
- **Decision:** relabel. `PriceToTangibleBookVsRote` carries its own `asOf` (the balance its tangible equity comes from) and `roteAsOf` / `roteSource` (the period the paired ROTE covers). For a bank with a trailing start, both dates are the trailing window's end and the source is `computed.returns.commonReturnTtm`; in every other case they are the fiscal-year ROTE's date and `computed.returns.rote`. The route-metrics rows and the payload's P/TBV, ROTE and justified-P/TBV figures read those dates, and the basis names the tangible-equity date.
- **Rejected:** a trailing-end tangible equity for insurers. The insurer's trailing return is common ROE, not ROTE, so a trailing-end P/TBV would be read against a fiscal-year ROTE on a different denominator. That breaks the pairing the route-metrics row promises ("on the SAME tangible denominator", `compute.ts:2782`). The multiples table keeps its own latest-quarter P/TBV under its own date, so the two figures no longer disagree under one date.
- **Revises:** nothing recorded; D-102/C-10 is silent on the pairing's date.
- **Sources:**
  1. CFA Institute, Market-Based Valuation: Price and Enterprise Value Multiples (study summary at https://analystnotes.com/cfa-study-notes-price-to-book-value.html; re-read 2026-10-27): the justified P/B is "P0/B0 = (ROE - g) / (r-g)", with ROE earned on the same common book value; book value is "(Shareholders' equity) minus (the total value of equity claims that are senior to common stock)". The page does not discuss tangible book value; the tangible pairing rests on source 2.
  2. `src/pipeline/compute.ts:2777-2784`: the route-metrics basis ("the return the P/TBV multiple above is read against, on the SAME tangible denominator").

### OD-9 Refused annual revenue (FIN-110)

- **Question:** D-53 scoped the failed revenue cross-check to the growth signal. Widen the mask to the scenario dispersion, the projection history and the forensic inputs, or narrow the gap text?
- **Decision:** widen: one revenue-eligibility decision for every consumer of the refused annual revenue. When `revenueConflict` is set, `runStageB` builds one revenue-masked annual income row set and passes it to `projNorm` (scenario dispersion and projection history), to the `forensicContext` income (Beneish, Altman X5, Piotroski turnover and margin) and to the growth margin series (`compute.ts:2118`, which reads `incomeAnnualReported`), as it already does for valuation (`compute.ts:2327`) and the CAGRs (`compute.ts:2112`). Each consumer that loses revenue files a gap quoting `revenueEligibilityReason` (`projections.revenueEligibility`, `forensics.revenueEligibility`; the margins are named in the existing `eligibility.annual.revenue` gap). The margins are included because the planner's "D-53 carve-out" for them does not exist: D-53 (`DECISIONS.md` line 628) says nothing about margins, and the comment at `compute.ts:2108-2110` that keeps every reported year for margins is a currency rule. Keeping them would grade gross margin and operating-margin slope on the refused figure while Beneish's gross-margin index (GMI) is masked for the same reason, two answers to one question. **Confirmed (decisions spec 4.3, 2026-10-28):** the margins in the mask were a plan-reviewer scope extension; the main session said yes.
- **Rejected:** narrowing the gap text. A failed cross-check is evidence that the vendor's figure for that year is the superseded one (the realistic trigger is a 10-K/A restatement the vendor has not picked up), and a restatement is when forensic readings matter most. Computing Beneish SGI or the scenario band on the superseded figure while saying revenue is withheld would keep a known-wrong input. The trigger is rare at HEAD (an FMP key, a 10-K/A revenue restatement and a lagging vendor together), so the coverage cost is small.
- **Revises:** D-53 (`docs/audit/DECISIONS.md` line 628: "excludes the dependent growth signal ... Other semantic eligibility needs its own evidence"). A failed value cross-check is that evidence.
- **Sources:**
  1. FASB ASC 250-10-45-23, as summarised in PwC Viewpoint, Financial statement presentation guide, 30.7 (https://viewpoint.pwc.com/dt/us/en/pwc/accounting_guides/financial_statement_/financial_statement___18_US/chapter_30_accountin_US/307_correction_of_an_US.html; re-read 2026-10-27): the financial statements for each prior period presented "shall be adjusted to reflect correction of the period-specific effects of the error". The restated figure replaces the original for every use, margins included.
  2. Deloitte, Roadmap: Initial Public Offerings, 3.7 Restatements and Corrections of Accounting Errors (https://dart.deloitte.com/USDART/home/publications/deloitte/additional-deloitte-guidance/roadmap-initial-public-offerings/chapter-3-financial-statement-preparation-disclosure/3-7-restatements-corrections-accounting-errors): material errors require restating the prior-period statements.

### OD-10 Peer route screen (FIN-125)

- **Question:** spend SEC requests to route each peer on SIC and companyfacts evidence (option a), or correct the exclusion wording (option b)?
- **Decision:** (b). `comparePeerFundamentals` routes the subject's own profile the way it routes peers (profile only). When that profile-only route differs from the subject's resolved route and equals the candidate's route, the candidate is excluded as "valuation route unconfirmed: the subject's route rests on SEC routing evidence (SIC and XBRL facts) that the peer screen does not have for this peer", not "differs". A peer whose profile route differs from both still reads "differs". The peer methodology list gains one sentence saying so.
- **Rejected:** (a). It adds an EDGAR submissions and companyfacts request per peer (up to `PEER_CANDIDATE_LIMIT` of them) inside the 25-second peer budget, against SEC's 10-requests-per-second fair-access cap that the subject's own build already uses, for figures that by design change no grade or intrinsic value (`peers.ts:269`). It stays a later improvement.
- **Revises:** nothing recorded (no D-entry covers the peer route screen); consistent with D-34 and D-59.
- **Sources:**
  1. SEC, Accessing EDGAR Data (https://www.sec.gov/os/accessing-edgar-data; re-read 2026-10-27): "Current max request rate: 10 requests/second", and the SEC may limit request rates to keep access fair. (The page as fetched does not say "regardless of the number of machines"; the planner's paraphrase is dropped.)
  2. `src/pipeline/peers.ts:269` (peer methodology): "These peer observations do not change grades or intrinsic value."

### OD-11 Dating the excess-return value (FIN-309)

- **Question:** roll the excess-return value forward to the quote date gross of distributions (D-65's DCF convention), or net of the period's payout? Also move the reverse solve and the C-11 grid? Or only disclose?
- **Decision:** roll forward, gross, everything that meets the price.
  - `ExcessReturnInputs.valuationDate` is the quote's observation day, as the DCF receives it (`compute.ts:3527`).
  - The headline equity value and per-share are stated at the quote date by `(1 + CoE)^(elapsedDays/365.25)` when `0 < elapsedDays ≤ MAX_ROLL_FORWARD_DAYS` (200, `valuation.ts:1219`).
  - The fiscal-year start alternative and every C-11 grid cell roll from their own opening-book date at their own cost of equity.
  - The reverse solve compares the statement-date value with the market cap discounted back by the headline factor.
  - `ExcessReturnResult.valuationDate` carries `{ value, elapsedYears, basis }`, and a note reads "Valuation date: ... rolled forward ... to the quote date ... gross of distributions paid since the opening book (house rule D-65)". Beyond 200 days an info gap `valuation.excessReturn.valuationDate` says the value is not rolled.
  - Ratios that do not meet the price (implied P/BV0, continuing-value share) stay at the statement date.
- **Rejected:** net of payout. The model's payout ratio is dividends plus net buybacks (Audit L4), and buybacks at fair value do not reduce per-share value, so a payout-based deduction would understate it; the stub period's actual dividends are not in hand for most runs. Gross matches D-65, which puts the two routes' upsides on one basis. Its upward bias (about the dividend yield times the stub, under 1% at 96 days for a 3% yielder) is smaller than today's downward bias (the cost of equity times the stub, 2.2% at 96 days in the probe). Also rejected: disclosure only, which keeps the two routes on different bases.
- **Revises:** extends D-65 (`docs/audit/DECISIONS.md` line 121) from the DCF to the excess-return route. D-102/C-10's trailing start is unchanged.
- **Sources:**
  1. CFA Institute, Residual Income Valuation (refresher reading, https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/residual-income-valuation; re-read 2026-10-27): intrinsic value is book value per share plus the present value of expected per-share residual income, V₀ = B₀ + Σ RIₜ/(1 + r)ᵗ, a value at one date. The reading does NOT state a between-dates relation; the planner's attribution of V_t = V_{t−1}(1 + r) − D_t to it was wrong and is corrected here.
  2. The between-dates relation comes from the residual income model's equivalence with the dividend discount model under clean surplus (Ohlson, J. (1995), "Earnings, Book Values, and Dividends in Equity Valuation", Contemporary Accounting Research 11(2); derivation in Schütt, H., Financial Statement Analysis and Valuation, ch. 10, https://hschuett.github.io/fsav_book/chapters/11_residual_income_model.html: the RIM is "algebraically identical" to the DDM under the clean surplus relation and transversality). In the DDM, V_t(1 + r) = E[D_{t+1} + V_{t+1}], so a value rolled forward at r without deducting the stub's dividends is gross of distributions; that is the bias the decision accepts and sizes above.
  3. D-65 (`docs/audit/DECISIONS.md` line 121, P2-3) and `src/pipeline/stageB/valuation.ts:2205-2227`: the roll-forward at the discount rate, its 200-day limit, and the bridge kept at the statement date (no deduction for cash generated or paid out since).

### OD-12 Sub-choices of the non-gated findings

- **FIN-105:** justified P/TBV stays, because it uses only statement figures (ROTE, cost of equity, payout). P/TBV and the premium to justified are withheld with the currency reason whenever `comparePriceCurrency` is not comparable (mismatch or unknown). Both currency gaps lose the stale "(ADR case)" wording. Source: `src/pipeline/stageB/priceCurrency.ts:1-12`.
- **FIN-105-V1:** an unknown price currency also withholds the dividend yield ("an unknown currency on either side leaves the comparison unproven", `priceCurrency.ts:9-10`). The quote side of the comparison is the price's own currency evidence (`marketData.currency`, else the price trace's established currency), never the DCF model-currency fallback `keyDataRows` uses for the price label: the dividend's currency is the statements' (`filingDisclosures.ts:84`), so comparing it with the model currency would always pass. A stored report whose price currency is unknown loses the row on display (display-only); the plan reviewer checked stored reports 1-52: only 47-50 and 52 carry a dividend, all with `marketData.currency` USD and `filingDisclosures.currency` USD, so no stored report's display changes.
- **FIN-112:** withhold, with no annual fallback inside the TTM snapshot. The TTM EBIT, EBITDA, interest coverage and net debt/EBITDA are null when TTM operating income is incomplete, so a figure labelled "ttm" is never vendor EBIT and never annual (D-31, `DECISIONS.md` lines 1622-1627). The WACC keeps its own annual fallback.
- **FIN-122:** the restatement collapse also fixes the adjacent capital adapter (`toCapitalBalance` gains `acceptedDate`/`filingDate`): same rule, same class.
- **FIN-126:** undisclosed peer preferred stock reads as zero, exactly as the subject's `commonHolderCapital` reads it (`securityBasis.ts:467`). D-52 requires matching denominators, and matching the rule is what makes them match.
- **FIN-313:** the never-read `ADR_RATIOS` / `lookupAdrRatio` and their tests are deleted. B-19 forbids taking a ratio from the static table, and the disclosures advertised it.
- **RPT-101 (dossier-cover floor confirmed by the main session, decisions spec 4.3, 2026-10-28):** the business-quality letter follows the 50% floor through a new optional `assessments.businessQuality.evidenceCompleteness`, on every reader surface that prints it: the classic assessment line (`assessmentLine`) and the dossier cover's "Assessment dimensions" rows (`DossierCover.tsx:14-18`, which already overrides the price-attractiveness letter under limited evidence but not the business one). Stored reports without the field keep their recorded line; none of stored reports 43-52 is under the floor. The audit export (`auditTables.ts`) keeps the recorded band (it is the full record).
- **FIN-312 (legacy display rule confirmed by the main session, decisions spec 4.3, 2026-10-28):** the Altman driver's market-cap leg follows the variant: an original-variant X4 that consumed a cap with no observation date reads "market cap observation date unknown"; a book-equity variant (Z', Z'', Z''-EM: `private`, `z2`, `z2-em`) reads "book equity (no market cap)", because it never reads one; "market cap unavailable" stays only for an original variant whose X4 is null. Legacy stored reports get the same reading at display time from their stored forensic variant (an original-variant Z with a score cannot exist without X4: `computeAltman` returns no score when `components.x4 === null`, `forensics.ts:640`), because nine stored reports (44-52) print "market cap unavailable": NVDA and MU (46-50, 52, original) beside a consumed cap, META and DEMO (44, 45, 51, z2) beside a variant that has no market-cap input.

### OD-13 Peer earnings carried by gains (FIN-503)

- **Question:** D-98's 25% line keeps a gain-carried P/E out of the subject's own-history rank. Should the same line apply to each peer's trailing earnings, by excluding the peer or by caveating the median? And should a median the rule leaves with fewer than four peers still be shown with a caveat?
- **Decision:** one rule for both sides of the comparison. `comparePeerFundamentals` measures the D-98 share, (pre-tax income − operating income) / pre-tax income, on the same four normalized quarters `commonIncome` sums. It uses the subject's own threshold and test: `GAIN_INFLATED_NON_OPERATING_SHARE` = 0.25, strictly above, positive pre-tax income only, through a new `nonOperatingShareOfPretax` helper that `valuation.ts:4614-4626` also calls.
  - A peer above the line is left out of the common-earnings median and the peer P/E median, with the reason "common earnings: non-operating income N% of trailing pre-tax income (above 25%, house rule D-98) …". Its balance-sheet multiples (P/B, P/TBV) still count.
  - The four-peer minimum then applies unchanged. A median that the rule leaves with three peers is withheld, never shown with a caveat.
  - A subject above the line keeps its P/E in the multiples table with the D-98 caveat. The peer row's Company figure is withheld with the same reason (`currentWithheldReason`, Task 22), and the peer median stays as peer context (OD-15).
  - The subject's peer-row test reads the four quarters its own Company figure sums (`subjectIncomeQuarterly`, through the same `commonIncome` as each peer), so each side of the comparison is tested on the earnings it is divided by. The multiples table's D-98 flag reads `incomeTtm` (`valuation.ts:4614-4615`). On the FMP TTM path `incomeTtm` is the sum of those same four quarters, so the two agree. Where `incomeTtm` is the fiscal-year fallback (`basis: "annual"`) the two tests can differ, and each answers for the figure it sits beside. Both call the one helper and the one threshold.
  - Where any of the four quarters lacks pre-tax or operating income, the test cannot run and that side is kept. The subject's own test does the same (`valuation.ts:4615`).
  - Non-operating losses are not flagged. D-98 gives the reason: they make the P/E look dear, not cheap.
- **Rejected:**
  - A caveat beside a median that rests on a gain-carried peer. The reader and the analyst still read the number as the peers' valuation level (NVDA #50's narrative repeats "59.3x"), and D-52 already answers thin or incompatible evidence "with explicit exclusions rather than a median".
  - Adjusting each peer's earnings for the gain (the CFA "underlying earnings" route). That needs tax-effected, item-level one-off evidence for every peer, which the bounded peer fetch (four endpoints per candidate) does not have.
  - A separate peer-only threshold, which would give one question two answers.
- **Revises:** extends D-98's gain-inflated-earnings bullet (`docs/audit/DECISIONS.md` line 2083; the owner accepted the 25% line on 2026-10-20) from the subject's own-history rank to both sides of the peer comparison. It applies D-52's "denominator definitions must agree" (`DECISIONS.md` line 1840).
- **Sources:**
  1. Damodaran, A., *Investment Valuation*, 2nd ed., ch. 17 "Fundamental Principles of Relative Valuation" (https://pages.stern.nyu.edu/~adamodar/pdfiles/valn2ed/ch17.pdf; text extracted and read 2026-10-28). Earnings per share "can include or exclude extraordinary items"; under "Uniformity": "For this comparison to have any merit, the multiple has to be defined uniformly across all of the firms in the group."
  2. AnalystPrep, CFA Level II "Issues in Calculating EPS" (https://analystprep.com/study-notes/cfa-level-2/issues-in-calculating-eps/; read 2026-10-28). It says "Items that are expected not to recur in the future are removed from the earnings", lists "Gains/losses from the sale of assets" among nonrecurring items, and says "The P/E used in valuation should be calculated consistently among all stocks under review." This is a study summary of the CFA reading "Market-Based Valuation: Price and Enterprise Value Multiples", not the curriculum text.
  3. D-98 (`docs/audit/DECISIONS.md` line 2083) and `docs/METHODOLOGY.md` lines 1211-1217: the house line and its reason ("the earnings then rest on gains, not operations").

### OD-14 Ranking the P/E in its own history (FIN-505)

- **Question:** the current P/E is price / diluted EPS (`valuation.ts:4311-4315`), but for every single-class issuer its own history is built as market cap / common income (`valuation.ts:4383`, `deriveOwnHistory` construction `capitalization-common-income`). Should the rank use the history's construction, should the history be rebuilt on price / diluted EPS, or should the rank be withheld?
- **Decision:** rank like with like, on the history's construction. The change is in `multiplesFramework`:
  - When the current P/E is price / diluted EPS and the band is the derived `capitalization-common-income` history, the ranked value is the current market cap / common income. It uses the `mcap` and `capital.commonIncome` the framework already holds (`valuation.ts:4120`, `:4315`), and it is recorded on the band (`OwnHistoryBand.rankedCurrent`).
  - The P/E the report shows stays price / diluted EPS (B-20), and the history basis names the ranked figure.
  - With common income withheld, the P/E is not ranked, and the grade falls back to EV/EBITDA, then Price/FCF, as under D-98.
  - Two bands keep ranking price / EPS: a multi-class issuer whose history is price / quoted-unit EPS (B-8, construction `price-eps`), and a vendor P/E history, which is itself a price / EPS ratio.
- **Rejected:**
  - A price / diluted EPS history. Every window would need four quoted-unit quarterly diluted EPS and that day's price. Fourth-quarter EPS is never derived (known issue B4-4), and D-60's daily market-cap history (close × shares) carries no EPS pairing, so most windows would drop and many issuers would lose the rank.
  - Showing market cap / common income as the P/E. Convention and B-20 name P/E as price over diluted EPS, and every report's headline would move.
  - Withholding the rank. It would drop a graded signal from every general issuer to remove a bias of 1-3%.
- **Grade effect, named in the PR:** `peOwnHistoryRank` moves by the gap between the diluted count behind EPS and the outstanding count behind market cap. That gap is 1-3% for most large caps (NVDA #50: rank 1.685 → 1.484) and is worth up to about 10 rank points for heavy dilution. The rank also stops changing construction when a quarterly diluted EPS is missing (B4-4).
- **Revises:** nothing recorded directly. It applies D-52's "never silently combined" (`DECISIONS.md` line 1841; `docs/METHODOLOGY.md` lines 1260-1263) and the P/FCF same-basis rule (METHODOLOGY lines 766-768) to the P/E rank. B-20's basis rule is unchanged.
- **Sources:**
  1. Damodaran, ch. 17 (as in OD-13), "Definitional Tests": "earnings per share can be computed based upon primary shares outstanding or fully diluted shares", and "The first step when discussing a valuation based upon a multiple is to ensure that everyone in the discussion is using the same definition for that multiple."
  2. `docs/METHODOLOGY.md` lines 766-768. Price to free cash flow is computed on "the same basis as the own-history distribution it is ranked in"; this is the house precedent that the decision applies to the P/E.

### OD-15 The peer median beside a withheld Company figure (FIN-504; sub-choice, not owner-gated)

- **Question:** B-8 already withholds an unresolved issuer-common capitalization, so FIN-504 needs no owner decision on the scope. Two choices remain. Does the peer median stay visible when the subject's Company figure is withheld? Which capitalization does the comparison-time size screen use?
- **Decision:**
  - The median stays as peer context, and the Company cell reads "withheld" with the scope reason (`currentWithheldReason`).
  - A resolved class sum is the capitalization for both the Company figure and the comparison-time size screen. The provider cap is the Company figure only on the `unverified-vendor-scope` path, as in the framework.
  - Under an unresolved scope the size screen keeps the provider cap. The 100× band (D-65) is far wider than any one-class understatement, and the discovery screen (`peers.ts:123`) already uses the profile cap.
- **Rejected:** withholding the median too. The peers' own caps and earnings are not in question, and the framework already keeps peer statistics when the subject's figure is withheld (`valuation.ts:4058-4062`: "Peer stats describe other issuers and stay.").
- **Revises:** nothing. It applies B-8 (`DECISIONS.md` line 2163: "Otherwise the scope stays withheld.") to the last consumer of the quote cap. FIN-307 (Task 16) applies the same rule to Altman X4 and the WACC.
- **Sources:**
  1. B-8 owner decision (`docs/audit/DECISIONS.md` line 2163).
  2. Damodaran, ch. 17 (as in OD-13), "Consistency": "If the numerator for a multiple is an equity value, then the denominator should be an equity value as well." Here the denominator is all common earnings, so the numerator must be the whole common equity value.

## Review Focus

Five input classes or failure modes no existing test exercises, plus a sixth added in round 4 and a seventh that moved here from B5 with FIN-506 (B5's Review Focus item 9); each is a named test in the owning task.

1. **Currency-code spellings at the gate.** Lower-case ISO ("cad"), padded (" USD "), all-lower-case "gbp" (must stay GBP), mixed-case minor units ("GBp", "ZAc"), upper-case non-ISO minor units ("GBX", "ILA"), and the same code on both sides. A fix that refuses minor units must not refuse a same-currency report. Owner: Task 1, test "keeps case-folded ISO codes comparable and refuses every minor-unit spelling".
2. **Excess-return roll-forward boundaries.** A quote on BV0's date (0 days), before it (negative), at exactly 200 days, at 201 days, with no valuation date, and on the currency-guarded path (per-share already null must stay null and must not throw). Owner: Task 5, test "rolls only inside (0, 200] days and never on a withheld value".
3. **Legacy stored reports without the new optional fields.** A report parsed from bytes that lack `assessments.businessQuality.evidenceCompleteness`, with route-metric rows dated the old way and a stored mixed-currency P/TBV, must still parse and render, and only the FIN-105 and FIN-312 display rules may change what it shows. Owner: Task 2 ("a stored report that published a mixed-currency P/TBV shows it withheld"), Task 17 ("a stored report keeps its bytes but reads the leg from its stored variant") and Task 21 ("a legacy assessments block without the field keeps its recorded line"). Round 4 adds a peer comparison row without `currentWithheldReason`: it must render exactly as before (a null Company figure reads "n/m"). Owner: Task 22, test "the classic peer table prints 'withheld', the audit line names the reason, and a legacy row renders as before".
4. **ADR variants of the scope rule.** An ADR whose statements and quote differ in currency must keep today's FX-driven Z' substitution and its FX WACC gap; an ADR whose depositary basis is verified (`marketCapSecurityBasis: "issuer-common"`) must keep X4 and the WACC; a debt-free ADR keeps a 100% equity weight. Owner: Task 16, test "leaves FX-mismatched, verified-ADS and debt-free ADRs as they were".
5. **Thin and mixed Piotroski batteries.** A three-year bank (outOf 3, six route-withheld), a two-year bank whose ΔROA is data-missing on top of the route withholding (outOf 2 of a possible 3), and a fully observed FIN-OTHER issuer (four route-withheld, five evaluated) must read 1, 2/3 and 1 of the route's battery as observed; only the data gap counts as missing. Owner: Task 14, test "counts only data-withheld Piotroski tests as missing".
6. **One construction on both sides of a comparison (round 4).** Three cases must keep one construction on both sides:
   - The D-98 peer test at its boundaries. A share of exactly 25% is kept and 25.01% is excluded. A non-positive pre-tax income, a quarter without operating income and a non-operating loss are all kept, as the subject's own test keeps them. A subject that fails the test loses its Company figure, and the median still shows.
   - The subject's equity scope: resolved (the class sum is the capitalization), unresolved (the Company figure is withheld and the median shows) and unverified (the provider cap, as at HEAD).
   - The P/E rank when diluted EPS differs from the outstanding count, equals it, is absent, or the history comes from a vendor ratio.
   Owners: Task 22, test "uses the framework's issuer-common scope for the Company figure and the size screen"; Task 23, test "applies the D-98 line to peers at its boundaries"; Task 24, test "ranks the history's construction whatever the diluted count".
7. **A bank or insurer whose diluted share count differs from the count behind the quote's market cap** (dilution, a buyback since the latest quarter; moved from B5 with FIN-506). The reverse solve must read the price per diluted share, so a market cap built on another count cannot move it, and on a quote after the opening book it must divide the price, not the market cap, by Task 5's roll factor. Owner: Task 5A, tests "follows the price through runStageB, not a market cap on another share count" (quoted at the model value, so a root exists), "solves on the price when only the market cap is withheld" and "divides the price by the quote-date roll".

## Tasks

Order: tasks are independent unless a task names its dependency; run them in the listed order so shared files (`valuation.ts`, `compute.ts`, `grading.ts`, `sectorRouting.ts`, `forensics.ts`, and from round 4 `peers.ts`) change one concern per commit. Tasks 22-24 are the round-4 finding tasks; the batch-level tasks were renumbered 25-34 to follow them. Task 5A (FIN-506, moved from B5 on 2026-10-28, decisions spec 4.3) sits right after Task 5 because it rewrites the reverse solve Task 5 rolls; it is numbered 5A so that Tasks 6-34 keep the numbers the master plan and the other plans cite. Every task's Step 4 re-runs the neighbouring files named there; stamps, goldens and deltas are moved once, in Tasks 25-27.

### Task 1: Minor-unit quote codes are never one currency with the major unit (FIN-107)

**Files:**
- Modify: `src/pipeline/stageB/priceCurrency.ts:17-47` (the `iso` helper and `comparePriceCurrency`)
- Modify: `src/pipeline/stageB/sectorRouting.ts:211-215` (`normalizeReportedCurrency`)
- Modify: `src/pipeline/compute.ts:2437` (the price comparison reads the raw `str(profile?.currency)`, so its gap names the minor unit instead of "quote currency unknown")
- Modify: `src/pipeline/stageC/dataOnlyReport.ts:223-226` (`tradingCurrency` returns `statementCurrencies(bundle).trading`, so the data-only technicals do not fold a pence price into pounds)
- Modify: `docs/METHODOLOGY.md:206-214`
- Test: `tests/stageB.priceCurrency.minorUnit.audit20261027.test.ts` (new)

**Interfaces:**
- Consumes: nothing new.
- Produces: `export const MINOR_UNIT_QUOTE_CODES: Readonly<Record<string, { major: string; label: string }>>` (keys `GBp`, `GBX`, `GBx`, `ZAc`, `ZAC`, `ILA`, `ILa`; e.g. `GBp: { major: "GBP", label: "pence" }`, `ZAc: { major: "ZAR", label: "cents" }`, `ILA: { major: "ILS", label: "agorot" }`); `comparePriceCurrency(statements, quote): PriceComparison` unchanged in signature; a minor-unit side returns `{ comparable: false, mismatch: false, reason }` (OD-1: an unproven unit, not an FX mismatch).

- [ ] **Step 1: Write the failing test.** File `tests/stageB.priceCurrency.minorUnit.audit20261027.test.ts`, seeded from `probes/FIN-107.probe.ts` (synthetic `buildSyntheticRouteBundle("general")`, statements relabelled GBP, profile quote GBP at 100 versus GBp at 10000; no tmp reads, no file writes).
  ```ts
  it("refuses a pence quote against pound statements", () => {
    const cmp = comparePriceCurrency("GBP", "GBp");
    expect(cmp).toMatchObject({ comparable: false, mismatch: false });
    expect((cmp as { reason: string }).reason).toMatch(/GBp \(pence, a minor unit of GBP\)/);
  });
  it("never labels a pence quote as pounds: the trading currency is unknown, and the price-comparison gap names the pence", () => {
    const bundle = london("GBp");
    expect(statementCurrencies(bundle).trading).toBeNull();
    const pence = runResearchRoutePanel(bundle).computed;
    expect(pence.gaps.find((g) => g.field === "valuation.priceComparison.currency")?.reason).toMatch(/pence/);
  });
  it("keeps case-folded ISO codes comparable and refuses every minor-unit spelling", () => {
    expect(comparePriceCurrency("cad", " CAD ")).toEqual({ comparable: true, currency: "CAD" });
    expect(comparePriceCurrency("GBP", "gbp")).toEqual({ comparable: true, currency: "GBP" });
    for (const code of ["GBp", "GBX", "GBx", "ZAc", "ZAC", "ILA", "ILa"]) expect(comparePriceCurrency("GBP", code).comparable).toBe(false);
    expect(normalizeReportedCurrency("GBp")).toBeNull();
    expect(normalizeReportedCurrency("gbp")).toBe("GBP");
  });
  it("Stage B withholds P/E and upside on a pence quote instead of reading it in pounds", () => {
    const pence = runResearchRoutePanel(london("GBp")).computed;
    expect(pence.valuation.multiples?.multiples.find((m) => m.key === "peTtm")?.current ?? null).toBeNull();
    expect(pence.fairValue?.upsidePct ?? null).toBeNull();
    expect(pence.valuation.gaps.some((g) => g.field === "valuation.multiples.currency" && /pence/.test(g.reason))).toBe(true);
  });
  it("control: the same price in pounds keeps its P/E (55.56x at HEAD) and its upside", () => {
    const control = runResearchRoutePanel(london("GBP")).computed;
    expect(control.valuation.multiples?.multiples.find((m) => m.key === "peTtm")?.current).toBeCloseTo(55.5556, 3);
    expect(control.fairValue?.upsidePct).not.toBeNull();
  });
  ```
  (`london(code)` is copied from the probe; `statementCurrencies` is imported from `@/pipeline/compute`. If an earlier batch moved the control's P/E, assert only `not.toBeNull()` and record the new value in the commit message. The `/pence/` assertions hold only because the refusal is `mismatch: false`: the mismatch branch of the multiples gap, `valuation.ts:4081`, prints fixed "(ADR case) — FX conversion pending" text without the reason.)
- [ ] **Step 2: Run it.** `npx vitest run tests/stageB.priceCurrency.minorUnit.audit20261027.test.ts` → FAIL: `expected { comparable: true, currency: 'GBP' } to match object { comparable: false, mismatch: false }`, `expected 'GBP' to be null` (trading currency) and `expected 5555.555555555556 to be null`.
- [ ] **Step 3: Implement.** In `priceCurrency.ts`, look the raw trimmed code up in `MINOR_UNIT_QUOTE_CODES` before upper-casing; `comparePriceCurrency` returns the minor-unit refusal (`mismatch: false`) when either side is a minor unit (naming the code, its unit label and its major currency), else the existing logic; extend the header comment with one sentence saying a minor unit is an unproven unit, not an FX mismatch. In `sectorRouting.ts`, `normalizeReportedCurrency` returns null when the trimmed raw value is a minor-unit key (its JSDoc says it is also the trading-currency normaliser). In `compute.ts:2437`, `const quoteComparison = comparePriceCurrency(currencies.model, str(profile?.currency));` (identical result for every ISO spelling, since `comparePriceCurrency` normalises them itself; for a minor unit it now names the unit). In `dataOnlyReport.ts`, `tradingCurrency(bundle)` returns `statementCurrencies(bundle).trading` (identical for every ISO code). No scaling anywhere.
- [ ] **Step 4: Run it.** Same command → PASS. Re-run `npx vitest run tests/stageB.adrExcessReturn.test.ts tests/stageB.sectorRouting.test.ts tests/filingDisclosures.releaseCurrency.test.ts tests/stageB.currentCapital.test.ts tests/currency.priceComparison.test.ts tests/research.routePanel.test.ts tests/stageB.valuation.test.ts` → all PASS (no ISO fixture changes; `stageB.valuation.test.ts:1064` pins "ADR case" on the ISO mismatch path, which this task leaves alone).
- [ ] **Step 5: Benefit check.** The probe's failing assertions (`comparePriceCurrency('GBP','GBp')` comparable; P/E 5555.56x) now hold the correct way; its GBP control still computes 55.56x. Replays: no stored run input or committed fixture quotes in a minor unit (grep `"currency": "GB[pX]"` over `tmp/audit-2026-10-27/data/evidence/*/run_input_snapshot*.json` and `fixtures/` returns nothing), so Task 31's replay table must show zero movement from this task; the DEMO audited fixture must not move.
- [ ] **Step 6: Docs.** `docs/METHODOLOGY.md` after line 209 ("upside calculations."): add "A minor-unit quote code (GBp or GBX pence, ZAc cents, ILA agorot) is never treated as its major currency: the comparison is refused with that reason, as for an unknown quote currency, the price is shown with its currency unknown, and nothing is rescaled, because the provider's market-cap unit for the same listing is not documented."
- [ ] **Step 7: Commit.** `git add src/pipeline/stageB/priceCurrency.ts src/pipeline/stageB/sectorRouting.ts src/pipeline/compute.ts src/pipeline/stageC/dataOnlyReport.ts docs/METHODOLOGY.md tests/stageB.priceCurrency.minorUnit.audit20261027.test.ts` then `git commit -m "Refuse minor-unit quote codes instead of folding them into the major currency (FIN-107)"`.

### Task 2: P/TBV and its premium are withheld when the quote and statements are not in one known currency (FIN-105)

**Files:**
- Modify: `src/pipeline/stageB/valuation.ts:5918-5998` (both currency branches of the financial route in `valueCompany`; the mismatch test at 5922-5926 switches to `quoteComparison`)
- Modify: `src/report/presentation.ts` (new `routeMetricsForDisplay`)
- Modify: `src/report/export/markdown.ts:968`, `src/report/export/printHtml.ts:772`, `src/components/report/ReportView.tsx:213` (pass `routeMetricsForDisplay(report)` instead of `report.routeMetrics`)
- Modify: `docs/METHODOLOGY.md:206-214` and the "Valuing a financial company" section (P/TBV pairing paragraph)
- Test: `tests/stageB.ptbvCurrency.audit20261027.test.ts` (new)

**Interfaces:**
- Consumes: `comparePriceCurrency` (Task 1), `PriceToTangibleBookVsRote` (`valuation.ts:4753`).
- Produces: `function withholdPriceToTangibleBook(p: PriceToTangibleBookVsRote, reason: string): PriceToTangibleBookVsRote` (private, valuation.ts) returning `{ ...p, pTbv: null, premiumToJustified: null, withheldReason: `${reason} — P/TBV sets the quote-currency market cap against statement-currency tangible equity, so it and its premium are withheld; justified P/TBV uses statement figures only` }`; `export function routeMetricsForDisplay(report: Pick<Report, "routeMetrics" | "appendix">): RouteMetrics | undefined` (presentation.ts).

- [ ] **Step 1: Write the failing test.** Seeded from `probes/FIN-105.probe.ts` (synthetic `buildSyntheticRouteBundle("bank")` with every statement row relabelled CAD; profile and quote stay USD; not an ADR).
  ```ts
  it("withholds route-metric P/TBV and premium on a CAD/USD bank, keeps justified P/TBV and ROTE", () => {
    const control = runResearchRoutePanel(buildSyntheticRouteBundle("bank"));
    const { computed, report, surfaces } = runResearchRoutePanel(relabel(buildSyntheticRouteBundle("bank"), "CAD"));
    const rows = Object.fromEntries(report.routeMetrics!.metrics.map((m) => [m.key, m]));
    const ctl = Object.fromEntries(control.report.routeMetrics!.metrics.map((m) => [m.key, m]));
    expect(computed.route.overlays).not.toContain("adr");
    expect(rows.pTbv.value).toBeNull();
    expect(rows.pTbv.withheldReason).toMatch(/statements in CAD, quote in USD/);
    expect(rows.premiumToJustified.value).toBeNull();
    expect(rows.justifiedPTbv.value).toBeCloseTo(ctl.justifiedPTbv.value as number, 10);
    expect(rows.rote.value).toBeCloseTo(ctl.rote.value as number, 10);
    expect(surfaces.markdown).not.toMatch(/\| price \/ tangible book value \| 23\.8/);
    expect(computed.valuation.gaps.find((g) => g.field === "valuation.excessReturn.currency")?.reason).not.toMatch(/ADR case/);
  });
  it("hands the writer no mixed-currency P/TBV", () => {
    const bundle = relabel(buildSyntheticRouteBundle("bank"), "CAD");
    const { computed, validation } = runResearchRoutePanel(bundle);
    const figure = assembleContextPayload(bundle, computed, validation).computed.flatMap((s) => s.figures ?? []).find((f) => f.label === "P/TBV");
    expect(figure === undefined || figure.value === null).toBe(true);
  });
  it("withholds P/TBV when the statements' currency is unknown", () => {
    const { report } = runResearchRoutePanel(relabel(buildSyntheticRouteBundle("bank"), null));
    expect(report.routeMetrics!.metrics.find((m) => m.key === "pTbv")!.value).toBeNull();
  });
  it("a stored report that published a mixed-currency P/TBV shows it withheld", () => {
    const { report } = runResearchRoutePanel(relabel(buildSyntheticRouteBundle("bank"), "CAD"));
    const legacy = structuredClone(report);
    for (const m of legacy.routeMetrics!.metrics) if (m.key === "pTbv" || m.key === "premiumToJustified") Object.assign(m, { value: 23.81, withheldReason: null });
    expect(routeMetricsForDisplay(legacy)!.metrics.find((m) => m.key === "pTbv")!.value).toBeNull();
    expect(reportToMarkdown(legacy)).toMatch(/\| price \/ tangible book value \| withheld \|/);
  });
  it("control: a same-currency bank publishes P/TBV, premium and justified", () => {
    const rows = runResearchRoutePanel(buildSyntheticRouteBundle("bank")).report.routeMetrics!.metrics;
    for (const key of ["pTbv", "justifiedPTbv", "premiumToJustified"]) expect(typeof rows.find((m) => m.key === key)!.value).toBe("number");
  });
  ```
- [ ] **Step 2: Run it.** `npx vitest run tests/stageB.ptbvCurrency.audit20261027.test.ts` → FAIL: `expected 23.80952380952381 to be null` (first test), the payload figure `{ value: 23.81 }`, and the legacy markdown still printing `23.8×`.
- [ ] **Step 3: Implement.** In the financial branch of `valueCompany`, replace the ad-hoc `toUpperCase` comparison with `!quoteComparison.comparable && quoteComparison.mismatch` (a minor-unit quote, `mismatch: false` after Task 1, therefore takes the unknown branch: per-share stands in the statements' currency, the reverse solve and the P/TBV pairing are withheld, and the upside is already withheld by `compute.ts:2437-2438`; the DCF's own raw comparator at `valuation.ts:6080-6084` keeps its per-share for the same reason and its reverse DCF is withheld at `valuation.ts:6338`); in both the mismatch branch and the unknown branch set `priceToTangibleBookVsRote: withholdPriceToTangibleBook(er.priceToTangibleBookVsRote, quoteComparison.reason)` on the returned result. Reword the two gap reasons to "<quoteComparison.reason> — excess-return per-share suppressed rather than comparing a per-share value in one currency with a price in another" (no "ADR case"). `routeMetricsForDisplay` returns `report.routeMetrics` unchanged unless `report.appendix.missingData` has `valuation.excessReturn.currency` or `valuation.excessReturn.reverseSolve.currency`, in which case it returns a copy whose `pTbv` and `premiumToJustified` rows have `value: null` and `withheldReason` set to that gap's reason (stored bytes untouched).
- [ ] **Step 4: Run it.** PASS. Re-run `npx vitest run tests/stageB.adrExcessReturn.test.ts tests/stageC.excessReturnVisibility.audit20261022.test.ts tests/stageB.excessReturnStart.audit20261022.test.ts tests/report.presentation.d62.test.ts` → PASS (the ADR tests assert per-share and reverse solve only; their gap-text assertions, if any match "ADR case", move to the neutral wording and the commit says so).
- [ ] **Step 5: Benefit check.** The probe's two failing assertions (`rows.pTbv?.value` null; payload P/TBV null) now hold; its control (same-currency bank P/TBV is a number) still holds. Must NOT move: every same-currency report (DEMO fixture, PGR keyless replay in Task 31). Legitimately moves: only mismatch/unknown financial-route reports, none of which exists among stored reports 1-52 (the plan reviewer's grep of `valuation.excessReturn.currency` over `tmp/audit-2026-10-27/data/reports/[0-9]*.json` returned 0 files; re-run it and record the count in the disposition note). The only stored reports with route metrics are SCHW #40 and #41 (bank, same currency), so the display rule changes no stored report's output.
- [ ] **Step 6: Docs.** `docs/METHODOLOGY.md:209`: add "the P/TBV pairing on financial routes and its premium to justified P/TBV" to the list of withheld comparisons, and in the financial-company valuation section say that justified P/TBV stays because it uses statement figures only.
- [ ] **Step 7: Commit.** `git add src/pipeline/stageB/valuation.ts src/report/presentation.ts src/report/export/markdown.ts src/report/export/printHtml.ts src/components/report/ReportView.tsx docs/METHODOLOGY.md tests/stageB.ptbvCurrency.audit20261027.test.ts` then `git commit -m "Withhold the financial-route P/TBV and its premium across a currency mismatch (FIN-105)"`.

### Task 3: The key-data dividend yield needs the dividend and the price in one known currency (FIN-105-V1)

**Files:**
- Modify: `src/report/presentation.ts:812-819` (the dividend-yield row in `keyDataRows`)
- Modify: `docs/METHODOLOGY.md` (key-data paragraph that describes the dividend yield; grep "Dividend yield")
- Test: `tests/report.keyDataDividendCurrency.audit20261027.test.ts` (new)

**Interfaces:**
- Consumes: `comparePriceCurrency` (`@/pipeline/stageB/priceCurrency`; presentation.ts already imports from `@/pipeline/stageB/fairValue`, and `priceCurrency.ts` has no Node-only imports, so the client bundle is unaffected), `report.filingDisclosures.currency`, `md.currency` and the existing `priceTrace` local (not the `priceCurrency` local, whose last fallback is the model currency).
- Produces: the row `{ label: "Dividend yield", value: "withheld", note: "dividend in <CCY>, quote in <CCY> — no FX conversion is attempted" }` (or the unknown-currency reason) when not comparable.

- [ ] **Step 1: Write the failing test.** Seeded from `probes/FIN-105-V1.probe.ts` (synthetic general bundle, one synthetic 8-K EX-99.1 release text "quarterly cash dividend of $0.50 per share" built with `buildEarningsReleaseRecord`; statements relabelled CAD, quote USD).
  ```ts
  it("CAD statements, USD quote: the dividend yield is withheld and says why", () => {
    const cad = run("CAD");
    expect(cad.dps).toBe(0.5);
    expect(cad.dividendYield?.value).toBe("withheld");
    expect(cad.dividendYield?.note).toMatch(/dividend in CAD, quote in USD/);
    expect(cad.markdownDividendYield).toMatch(/withheld/);
  });
  it("unknown price currency withholds the yield too, even though the DCF model currency is USD", () => {
    const report = run("USD").report;
    // The price's own currency evidence is removed: marketData.currency and the
    // currency of every price trace keyDataRows reads (payload.quote.price,
    // computed.technicals.last-close), whose unit becomes "currency/share".
    // The DCF per-share stays in USD: keyDataRows' label fallback must not stand in for the quote.
    const unknown = stripPriceCurrency(structuredClone(report));
    expect(unknown.valuation.dcf.perShare?.currency ?? unknown.valuation.dcf.perShare?.unit).toMatch(/USD/);
    expect(keyDataRows(unknown).find((r) => r.label === "Dividend yield")?.value).toBe("withheld");
  });
  it("control: USD statements and quote keep the 2.00% yield", () => {
    expect(run("USD").dividendYield?.value).toBe("2.00%");
  });
  ```
  (`stripPriceCurrency(report)` is a test helper: it sets `report.marketData.currency = null` and, for each traced number whose `source` matches `/^payload\.quote\.price$|^computed\.technicals\.last-close$/` wherever `collectTraces` finds them, sets `currency = null` and `unit = "currency/share"`. If the synthetic report carries no such trace, the test asserts the price row still renders so the case is real.)
- [ ] **Step 2: Run it.** `npx vitest run tests/report.keyDataDividendCurrency.audit20261027.test.ts` → FAIL: `expected '2.00%' to be 'withheld'` (CAD test and unknown test).
- [ ] **Step 3: Implement.** In `keyDataRows`, take the quote side from the price's own evidence: `const quotedCurrency = md?.currency ?? (priceTrace ? establishedCurrency(priceTrace.unit, priceTrace.currency) : null)` (no `modelCurrency` fallback: the dividend is in the statements' currency, so comparing it with the model currency would always pass), then `const yieldCurrency = comparePriceCurrency(report.filingDisclosures?.currency, quotedCurrency)`; when `capitalReturn.dividendPerShare != null && price > 0`, push the computed yield only when `yieldCurrency.comparable`, else the "withheld" row whose note is `dividend in ${dividendCcy}, quote in ${quoteCcy} — no FX conversion is attempted` for a mismatch, or the comparison's own reason when a side is unknown. The price row's own label keeps its existing fallback. Leave the x4 frequency rule alone (RPT-201 is B9's).
- [ ] **Step 4: Run it.** PASS. Re-run `npx vitest run tests/report.presentation.d62.test.ts tests/adbeReportAudit.regressions.test.ts tests/audit.quoteObservation.test.ts tests/report.compositeEvidenceFloor.test.ts` → PASS; any USD/USD yield pin is unchanged.
- [ ] **Step 5: Benefit check.** The probe's failing test now passes; its USD control still prints 2.00%. Stored reports: render stored reports 1-52 (`tmp/audit-2026-10-27/data/reports/[0-9]*.json`) through `keyDataRows` before and after (script in Task 31): every row identical. Only 47-50 and 52 carry a dividend per share, all with `marketData.currency` and `filingDisclosures.currency` USD (checked by the plan reviewer), which proves the display-only change touches only mismatched or unknown-currency reports.
- [ ] **Step 6: Docs.** METHODOLOGY's key-data description: "The dividend yield is computed only when the dividend's currency and the quote's are one known currency; otherwise the row reads withheld with the reason."
- [ ] **Step 7: Commit.** `git add src/report/presentation.ts docs/METHODOLOGY.md tests/report.keyDataDividendCurrency.audit20261027.test.ts` then `git commit -m "Withhold the key-data dividend yield across a currency mismatch (FIN-105-V1)"`.

### Task 4: The P/TBV pairing and its ROTE row carry the dates of what they measure (FIN-106, FIN-310)

**Files:**
- Modify: `src/pipeline/stageB/valuation.ts:4672-4800` (`ExcessReturnInputs`, `PriceToTangibleBookVsRote`), `valuation.ts:4942-5034` (`priceToTangibleBookVsRote` sets the new fields and names the TCE date in `basis`)
- Modify: `src/pipeline/compute.ts:3818-3826` (inputs) and `compute.ts:2756-2811` (`routeMetricsBlock` rows)
- Modify: `src/pipeline/stageC/payload.ts:1057-1059` (figure `asOf`)
- Modify: `docs/METHODOLOGY.md` (financial-company valuation: the P/TBV pairing's dating)
- Test: `tests/stageB.routeMetricDates.audit20261027.test.ts` (new)

**Interfaces:**
- Consumes: Task 2's `withholdPriceToTangibleBook` (must spread the new fields through).
- Produces: `ExcessReturnInputs.tangibleCommonEquityAsOf?: string | null`, `ExcessReturnInputs.roteAsOf?: string | null`, `ExcessReturnInputs.roteSource?: "computed.returns.commonReturnTtm" | "computed.returns.rote"`; `PriceToTangibleBookVsRote.asOf?: string | null`, `.roteAsOf?: string | null`, `.roteSource?: string` (optional, so legacy objects type-check).

- [ ] **Step 1: Write the failing test.** Seeded from `probes/FIN-106.probe.ts` and `probes/FIN-310.probe.ts` (synthetic insurer and bank bundles from `buildSyntheticRouteBundle`).
  ```ts
  it("insurer: the P/TBV rows and the payload figure are dated at the balance their tangible equity comes from", () => {
    const bundle = buildSyntheticRouteBundle("insurer");
    const { computed, report, validation } = runResearchRoutePanel(bundle);
    const roteAsOf = computed.returns.rote!.asOf; // "2025-12-31" in the synthetic bundle
    for (const key of ["pTbv", "justifiedPTbv", "premiumToJustified"]) expect(report.routeMetrics!.metrics.find((m) => m.key === key)!.asOf).toBe(roteAsOf);
    const fig = assembleContextPayload(bundle, computed, validation).computed.flatMap((s) => s.figures ?? []).find((f) => f.label === "P/TBV");
    expect(fig?.asOf).toBe(roteAsOf);
    expect(report.routeMetrics!.metrics.find((m) => m.key === "pTbv")!.basis).toMatch(new RegExp(`tangible common equity at ${roteAsOf}`));
  });
  it("bank with a trailing start: the ROTE row is dated and sourced as the trailing window", () => {
    const { computed, report } = runResearchRoutePanel(buildSyntheticRouteBundle("bank"));
    const row = report.routeMetrics!.metrics.find((m) => m.key === "rote")!;
    expect(row.asOf).toBe(computed.returns.commonReturnTtm!.asOf); // "2026-03-31"
    expect(row.sources).toEqual(["computed.returns.commonReturnTtm"]);
  });
  it("control: the bank's P/TBV row still equals the multiples table's P/TBV and the block header date is unchanged", () => {
    const { computed, report } = runResearchRoutePanel(buildSyntheticRouteBundle("bank"));
    const mult = computed.valuation.multiples!.multiples.find((m) => m.key === "priceToTbv")!.current;
    expect(report.routeMetrics!.metrics.find((m) => m.key === "pTbv")!.value).toBeCloseTo(mult as number, 6);
    expect(report.routeMetrics!.asOf).toBe("2026-03-31");
  });
  ```
- [ ] **Step 2: Run it.** `npx vitest run tests/stageB.routeMetricDates.audit20261027.test.ts` → FAIL: `expected '2026-03-31' to be '2025-12-31'` (insurer rows) and `expected '2025-12-31' to be '2026-03-31'` (bank ROTE row).
- [ ] **Step 3: Implement.** In `compute.ts` set `tangibleCommonEquityAsOf` and `roteAsOf` to `route.base === "bank" && ttmStart !== null ? ttmStart.asOf : ctx.rote?.asOf ?? null`, and `roteSource` to `"computed.returns.commonReturnTtm"` in the trailing bank case, else `"computed.returns.rote"`. `priceToTangibleBookVsRote` copies them onto the result and appends "; tangible common equity at <date>" to every basis string that names P/TBV. `routeMetricsBlock` uses `p.asOf ?? er.asOf` for the three P/TBV rows, and `p.roteAsOf ?? computed.returns?.rote?.asOf ?? null` with `[p.roteSource ?? "computed.returns.rote"]` for the ROTE row. `payload.ts` uses the same fallbacks.
- [ ] **Step 4: Run it.** PASS. Re-run `npx vitest run tests/stageB.ttm.compute.test.ts tests/stageC.excessReturnVisibility.audit20261022.test.ts tests/stageB.ptbvCurrency.audit20261027.test.ts tests/stageB.excessReturnStart.audit20261022.test.ts` → PASS (`stageB.ttm.compute.test.ts:1503-1525` pins the bank pairing's value, which does not move).
- [ ] **Step 5: Benefit check.** FIN-106's probe (`datedAtDenominator` true) and FIN-310's probe (`row.asOf === trailing asOf`) now pass; their bank controls still pass. Values: no figure changes (only dates and sources); the rendered route-metrics header date stays 2026-03-31 for the bank and becomes the latest row date for the insurer. PGR keyless replay (Task 31): the P/TBV row's `asOf` moves from the trailing end to the fiscal year end, its value does not.
- [ ] **Step 6: Docs.** METHODOLOGY, financial-company valuation: "Each P/TBV row is dated at the balance its tangible equity comes from, and the ROTE row at the period its return covers: the trailing window's end for a bank valued from its trailing four quarters, else the fiscal year end."
- [ ] **Step 7: Commit.** `git add src/pipeline/stageB/valuation.ts src/pipeline/compute.ts src/pipeline/stageC/payload.ts docs/METHODOLOGY.md tests/stageB.routeMetricDates.audit20261027.test.ts` then `git commit -m "Date the P/TBV pairing and its ROTE row by what they measure (FIN-106, FIN-310)"`.

### Task 5: The excess-return value is stated at the quote date (FIN-309)

**Files:**
- Modify: `src/pipeline/stageB/valuation.ts:4672-4750` (`ExcessReturnInputs.valuationDate`), `valuation.ts:5040-5450` (`excessReturnModel`: headline, start alternative, C-11 grid, reverse solve), the `ExcessReturnResult` type (new `valuationDate`)
- Modify: `src/pipeline/compute.ts:3818` (pass `valuationDate: quotePriceObservationDay(quote)`)
- Modify: `docs/METHODOLOGY.md:622-631` and the excess-return section (~1438ff)
- Test: `tests/stageB.excessReturnValuationDate.audit20261027.test.ts` (new); add one PGR assertion to `tests/audit.issuerPipeline.test.ts`

**Interfaces:**
- Consumes: `MAX_ROLL_FORWARD_DAYS`, `DAYS_PER_YEAR`, `daysBetween` (`valuation.ts:1219` and the DCF roll-forward helpers).
- Produces: `ExcessReturnInputs.valuationDate?: string | null`; `ExcessReturnResult.valuationDate?: { value: string; elapsedYears: number; basis: string }`; `function rollForwardFactor(fromDay: string | null, toDay: string | null, ratePct: number): { factor: number; days: number } | null` (private; null outside `(0, MAX_ROLL_FORWARD_DAYS]`); `function growthFactor(fromDay: string, toDay: string, ratePct: number): number` (private; `(1 + ratePct/100)^(days/365.25)`, no limit, 1 when `days ≤ 0`).

- [ ] **Step 1: Write the failing test.** Seeded from `probes/FIN-309.probe.ts` (synthetic bank and insurer bundles, quote timestamp moved to 2026-04-01 versus 2026-07-05; BV0 2026-03-31).
  ```ts
  it("bank: a quote 96 days after BV0 states the value at the quote date", () => {
    const d1 = er("bank", "2026-04-01"), d96 = er("bank", "2026-07-05");
    expect(d96.perShare!).toBeCloseTo(d1.perShare! * Math.pow(1 + d1.coe! / 100, 95 / 365.25), 6);
    expect(d96.valuationDate?.value).toBe("2026-07-05");
    expect(d96.notes.join(" ")).toMatch(/rolled forward 96 days to the quote date 2026-07-05 .*gross of distributions/);
  });
  it("insurer: same rule", () => { /* as above with "insurer" */ });
  it("rolls only inside (0, 200] days and never on a withheld value", () => {
    expect(er("bank", "2026-03-31").valuationDate).toBeUndefined();          // 0 days
    expect(er("bank", "2026-10-17").valuationDate?.elapsedYears).toBeCloseTo(200 / 365.25, 10); // exactly 200
    const late = er("bank", "2026-10-18");                                   // 201 days
    expect(late.valuationDate).toBeUndefined();
    expect(late.gaps.some((g) => g.field === "valuation.excessReturn.valuationDate")).toBe(true);
    expect(erCad("bank", "2026-07-05").perShare).toBeNull();                 // currency-guarded path stays null
  });
  it("the start alternative and every grid cell roll from their own opening book; the reverse solve meets the discounted cap", () => {
    const d96 = er("bank", "2026-07-05"), d1 = er("bank", "2026-04-01");
    // fiscal-year alternative: BV0 2025-12-31, rolled 186 days at the headline CoE
    expect(d96.startAlternative!.perShare!).toBeCloseTo(d1.startAlternative!.perShare! * Math.pow(1 + d1.coe! / 100, 186 / 365.25) / Math.pow(1 + d1.coe! / 100, 91 / 365.25), 6);
    // The checked-in quote (price 100 against a model value of about 12.47 a share) has no reverse root on either
    // day ("implied ROE > 80%"), and toBeCloseTo on null throws. So quote both days at d1's value per share,
    // with the market cap = that price × the quote's 100M shares.
    const p = d1.perShare!;
    const q1 = er("bank", "2026-04-01", p), q96 = er("bank", "2026-07-05", p);
    expect(q1.reverseSolve.impliedCurrentRoePct).not.toBeNull();             // setup guard: a root exists
    expect(q96.reverseSolve.impliedCurrentRoePct!).toBeLessThan(q1.reverseSolve.impliedCurrentRoePct!); // HEAD: equal (no roll)
  });
  it("control: the general-route DCF roll-forward is unchanged", () => {
    expect(dcf("2026-07-05").valuationDate).toBe("2026-07-05");
  });
  ```
  (The alternative's BV0 is 2025-12-31: 91 days to the 2026-04-01 quote and 186 days to 2026-07-05, so the two runs differ by the 95-day factor, as the headline does. `er`, `erCad` and `dcf` are copied from the probe without its `writeFileSync`. `er(route, day, price?)` returns the run's `excessReturn` result with `coe` (its cost of equity) beside it. When `price` is given, it also sets the quote row's `price` and its `marketCap` (price × the checked-in quote's 100M shares, `marketCap / price`). `erCad` relabels every statement row CAD as `probes/FIN-105.probe.ts` does. The 1- and 96-day runs keep the fixture's `BUILT_AT` (2026-07-06), as the probe does; the 200- and 201-day quotes fall after it, so first assert `er(...).asOf === "2026-03-31"` and a non-null `perShare` for them, and if any Stage B rule refuses a quote dated after `builtAt`, set `bundle.builtAt` to the day after the quote for those two runs only and say so in a test comment.) In `tests/audit.issuerPipeline.test.ts`: `it("PGR: the excess-return value is stated at the quote date")` asserting `run("PGR").out.valuation.excessReturn.valuationDate.value === "2026-10-19"` and that the elapsed days equal the days from `excessReturn.asOf` (only when ≤ 200; else the info gap).
- [ ] **Step 2: Run it.** `npx vitest run tests/stageB.excessReturnValuationDate.audit20261027.test.ts` → FAIL: `expected 12.467587 to be close to 12.7378`, `expected undefined to be '2026-07-05'`. The fourth case fails on its start-alternative pin (not rolled at HEAD), and its reverse comparison would fail too (the two implied returns are equal at HEAD); its setup guard passes at HEAD.
- [ ] **Step 3: Implement.** `excessReturnModel` computes the statement-date `equityValue` as today, then `const roll = rollForwardFactor(inputs.asOf, inputs.valuationDate, coe)`. The 200-day limit is tested on the headline's elapsed days only; when the headline rolls, every other value rolls too, from its own opening-book date, through an unbounded `growthFactor(fromDay, toDay, ratePct)` (so a fiscal-year alternative 245 days old still meets the price on the same date as a headline 150 days old). With a roll: `equityValue` and `perShare` are multiplied by `roll.factor`; the start alternative by `growthFactor(alt.asOf, valuationDate, coe)`; each C-11 grid cell by `growthFactor(rowAsOf, valuationDate, costOfEquityPcts[column])`, where `rowAsOf` is `alt.asOf` for the row the fiscal-year alternative replaced (`rows[startAlternative.startRoePct < roeStart ? 0 : 2]`, `valuation.ts:5292-5298`) and `inputs.asOf` for every other row (`ExcessReturnGrid.rows` carries no date, so record the index when the row is replaced; the centre cell then equals the rolled headline exactly); the grid gains one note, "cells are stated at the quote date <d>, each rolled from its row's opening book at its column's cost of equity"; the reverse solve's target is `mcap / roll.factor`; `valuationDate` and a note are added. Without one and with `elapsedDays > 200`, add the info gap. `impliedPToBv` and `continuingValueSharePct` keep the statement-date value. **FIN-506 is the next commit (Task 5A; decisions spec 4.3 moved it here from B5).** This task keeps HEAD's market-cap target and discounts it (`mcap / roll.factor`). Task 5A then switches the target to the price per diluted share and keeps this roll on it (`price / roll.factor`). Write this task's reverse-solve assertion on the market-cap target; Task 5A re-pins it on the price basis.
- [ ] **Step 4: Run it.** PASS. Re-run `npx vitest run tests/stageB.excessReturnStart.audit20261022.test.ts tests/stageB.excessReturnPayoutFade.audit20261022.test.ts tests/stageB.adrExcessReturn.test.ts tests/stageC.excessReturnVisibility.audit20261022.test.ts tests/audit.issuerPipeline.test.ts tests/fairValue.degradedInputs.test.ts`. Pinned financial-route per-share values in these files move by exactly the roll factor of their fixture's quote date; re-pin each one with a comment "D-next: stated at the quote date, × (1 + CoE)^(days/365.25)" and never loosen a tolerance.
- [ ] **Step 5: Benefit check.** FIN-309's probe now reports `moved: true` for bank and insurer; its DCF control is unchanged. Synthetic bank: 12.4676 → 12.7378 at 96 days (+2.17%), equal to the probe's `bankPerShareIfRolledAtCoe96d`. PGR keyless replay (Task 31): excess-return per share before/after and the factor. Must NOT move: any general-route DCF figure, the DEMO fixture.
- [ ] **Step 6: Docs.** METHODOLOGY 622-631 (D-65 roll-forward): "The excess-return value on the bank, insurer and mortgage-REIT routes is rolled forward the same way, at the cost of equity, from each value's opening-book date; the reverse solve meets the market cap discounted back by the headline factor." Excess-return section: the valuation-date row.
- [ ] **Step 7: Commit.** `git add src/pipeline/stageB/valuation.ts src/pipeline/compute.ts docs/METHODOLOGY.md tests/stageB.excessReturnValuationDate.audit20261027.test.ts tests/audit.issuerPipeline.test.ts <any re-pinned test files by name>` then `git commit -m "State the excess-return value at the quote date, as the DCF is (FIN-309)"`.

### Task 5A: The excess-return reverse solve inverts the price per diluted share (FIN-506)

Moved here from B5 (its Task 22, now a tombstone) by the main session on 2026-10-28: decisions spec 4.3, "FIN-506. Moves from B5 to B6, because B6 rewrites the same function". It is the commit right after Task 5 and builds on Task 5's quote-date roll. The content is B5 Task 22 as amended and reviewed in B5's round 4: the price-basis target, the rewritten `runStageB` wiring test, the ADR case, and the guard and note wording. It is adapted in three ways: the target is divided by Task 5's roll factor; the stored-report note is keyed on this batch's spec; and the test file follows this plan's naming. No owner decision is needed (`ownerDecisionNeeded: false`; one share basis on both sides of the solve is a consistency fix). It depends on:
- Task 5 (`rollForwardFactor` and the rolled headline);
- B4 Task 11 (the convertible reading inside the excess-return per-share mapping, master plan conflict row 17: "FIN-506's reverse-solve divisor uses B4's divisor");
- B5 Task 17 (`src/report/legacyValuationNotes.ts`, composed in the five view chains).

All three are on this branch's base, because B4 and B5 merge before B6.

**Files** (line numbers at HEAD 6542531; B4, B5 and Task 5 move them, so find each by the name given):
- Modify: `src/pipeline/stageB/valuation.ts`:
  - `:4718-4722` (`ExcessReturnInputs.price?`);
  - `:4834` (`reverseSolve.basis?`);
  - `:5249-5250` (the headline per share through a local `perShareOf`);
  - `:5333-5381` (the reverse solve, its note, and the out-of-bracket notes at `:5371`/`:5373`);
  - `:5968` and `:5987` (the two currency guards' reverse-solve note and gap wording);
  - `:5911` (the FCFF-reverse gap text: "the starting ROE that reproduces the market cap" becomes "the starting ROE at which the model's value per share equals the price").
- Modify: `src/pipeline/compute.ts:3816-3817` (pass `price: currentPrice` (`:3241`) beside `marketCap`; Task 5 already passes `valuationDate` in the same object).
- Modify: `src/pipeline/stageB/sectorRouting.ts:1435-1436` (the same disclosure wording).
- Modify: `src/report/legacyValuationNotes.ts` (B5's module: the `impliedReturnShareBasis` row and its cutoff constant).
- Modify: `docs/METHODOLOGY.md`:
  - the excess-return reverse-solve sentence (`:1538-1544` at HEAD; find "reverse-solves the **starting** ROE that reproduces the current market cap");
  - Task 5's D-65 sentence on the reverse solve;
  - B5 Task 17's paragraph "Stored valuations read under the 13-week convention", which gains the note.
- Test: `tests/stageB.excessReturnReverseShareBasis.audit20261027.test.ts` (new); modify `tests/stageB.excessReturnValuationDate.audit20261027.test.ts` (Task 5's file: one case retitled and re-pinned) and `tests/report.legacyValuationNotes.test.ts` (B5's file: three cases).

**Interfaces:**
- Consumes:
  - Task 5's `rollForwardFactor(inputs.asOf, inputs.valuationDate, coe)` result `roll` (null when the headline does not roll);
  - B4 Task 11's per-share divisor, `(equityValue + restored.notes + restored.preferred) / (dilutedShares − sharesRemoved)`;
  - B5's `withLegacyValuationNotes` chain;
  - the one spec-version comparator B5's rows use (B3's `specVersionBefore`, master plan conflict row 5).
- Produces:
  - `ExcessReturnInputs.price?: number | null`: the quote price behind `marketCap`, from the same quote, under the same currency guard.
  - `ExcessReturnResult.reverseSolve.basis?: "price-per-diluted-share" | "market-cap"`. It names the target the solve was set against. It is set whenever a target was formed, whether a root was found or the price lay outside the bracket ("implied ROE > 80%"), and it is absent only when the solve was skipped. So Task 5's no-root synthetic bank still reports its basis.
  - Inside `excessReturnModel`, one local `perShareOf = (equity: number): number | null`. It wraps the divisor the headline already uses (B4's reading; at HEAD simply `shares !== null ? equity / shares : null`), and both the headline per share and the reverse solve call it, so the reverse follows B4's divisor without a second change.
  - `export const IMPLIED_RETURN_SHARE_BASIS_SPEC: string` in `legacyValuationNotes.ts`. It is a cutoff of its own, because a report built after B5 merged and before this batch merged still solved on the market cap; B5's `ANNUALIZATION_CONVENTION_SPEC` would miss it. It equals this batch's `REPORT_SPEC_VERSION`. This task writes it as that literal, the next minor above `main`'s `REPORT_SPEC_VERSION` at the branch base (for example "1.46.0" if B5 left "1.45.0"), never as a reference to the constant. At this commit `REPORT_SPEC_VERSION` is still B5's, equal to `ANNUALIZATION_CONVENTION_SPEC`, so a reference would make test (b) below impossible. Task 25 then moves `REPORT_SPEC_VERSION` to the same literal and pins the two equal. Between this commit and Task 25, the cutoff sits one minor above the report spec. So a stamp-test assertion that each cutoff is at most the current spec (decisions spec 2.15) fails until Task 25, as the payload golden fails until Task 26. A test that renders a freshly built bank or insurer report carrying the `roeImpliedVsAchievable` driver would also show the note in that window; none is expected (Step 4's re-runs check).
- Reverse target:
  - When `posOrNull(inputs.price)` and the divisor are both present, `f(roe) = perShareOf(excessReturnValue(bv0, fadePath(roe, endRoe, years), coe, payoutPath, continuing).equityValue)! − price / (roll?.factor ?? 1)`, bisected with `price` as the tolerance scale, `basis: "price-per-diluted-share"`. A rolled headline equals `perShareOf(statement-date value) × roll.factor`, so this is "the model value at the quote date equals the price".
  - Otherwise Task 5's `equityValue − mcap / (roll?.factor ?? 1)`, `basis: "market-cap"`.
  - Both are monotone in the starting return, so the bracket logic is unchanged. Never bring back the market cap as the target beside a price and a divisor.
- The guards upstream work on the new basis without new code (traced at HEAD by B5's round-4 review):
  - Where `valueCompany` nulls `excessReturn.dilutedShares`, `perShareOf` is null and the market-cap path runs with HEAD's inputs. That happens for an ADR whose diluted count is not established as quoted ADS (`valuation.ts:5852-5854`) and for an unresolved economic class basis (`:5870-5872`).
  - One case changes on purpose. Take an ADR whose diluted count is established as quoted ADS but whose market cap is not on the issuer-common basis: `marketCap` is nulled at `:5856-5858`, so HEAD skips the reverse ("market cap not provided"). With the price it now solves the price per ADS against the value per diluted ADS, the basis the forward per share and its upside already use.
  - The two currency guards (`:5942-5979` ADR mismatch, `:5980-5999` currency unknown) still clear the result after the model runs. Their texts change from "market cap is in …" to "the quote is in …" (`:5968`) and from "sets the market cap against book value" to "sets the quote against book value" (`:5987`).
  - The out-of-bracket notes at `:5371` and `:5373` name the quantity compared: "the price per diluted share" or "market cap".
  - No test pins any of these strings (`grep -rn "starting-ROE value\|reverse solve suppressed: market cap\|sets the market cap against book value" tests` is empty at HEAD; re-run the grep on the branch base).
- Note text:
  - On the price basis: `starting ROE fading to ${endBasis} over ${years} years (payout fading … → …) matching the price per diluted share (${price} on ${shares} shares, the count the value per share divides by${roll ? `; the price taken back ${roll.days} days to the opening book at the cost of equity, as the value is rolled forward` : ""}) — comparable to the current ROE, same dynamics as the forward path`.
  - On the fallback: Task 5's "… matching market cap …" text with " (price or diluted shares unavailable)". No "D-next" in either string (Global Constraints).
- The `impliedReturnShareBasis` row:
  - Detector: `specVersionBefore(report.meta.specVersion, IMPLIED_RETURN_SHARE_BASIS_SPEC)` and a `scores.aspects.valuation.drivers[]` entry with source `computed.scores.valuation.roeImpliedVsAchievable`. Its entry is `field: "presentation.legacyValuation.impliedReturnShareBasis"`, `severity: "info"`, `expected: true`, as B5's rows.
  - Note: "Built before spec S: the implied starting return behind this valuation signal was not solved on the share count the value per share divides by (the price times the diluted shares). Where buybacks or dilution separate that count from the one behind the market cap, the implied return is off by roughly 0.3pp per 1% gap at the price-to-book ratios tested: too low when the diluted count is the larger, too high when it is the smaller. Stored figures and scores are unchanged." S is `IMPLIED_RETURN_SHARE_BASIS_SPEC`. The direction sentence follows the sign of the gap, as B5's round-4 review corrected it.

- [ ] **Step 1: Write the failing test** in `tests/stageB.excessReturnReverseShareBasis.audit20261027.test.ts`, seeded from `probes/FIN-506.probe.ts`. `atModelValue(gapPct, roe = 16, over = {})` is copied from `probes/FIN-506.probe.ts:20-38` without its `writeFileSync`, and every value is synthetic:
  - tangible common equity 50,000, TTM ROTE `roe`, cost of equity 10%, payout 60%, risk-free 4.2%;
  - 1,000 shares at the quote, and `1000 × (1 + gapPct / 100)` diluted;
  - `price` is the model value per share from a first `excessReturnModel` run with no market cap;
  - the second run passes `marketCap: price × 1000` and, new, `price`, each replaced by `over.price` / `over.marketCap` when given;
  - `over.valuationDate` sets `valuationDate`; `asOf` is 2026-03-31.
  ```ts
  it("a price equal to the model value per share solves to the current starting return (FIN-506)", () => {
    for (const gap of [1, 3]) {
      const { er, current } = atModelValue(gap);
      expect(er.reverseSolve.impliedCurrentRoePct!).toBeCloseTo(current, 1);      // HEAD: 15.7117 (1% gap), 15.1477 (3% gap)
      expect(er.reverseSolve.basis).toBe("price-per-diluted-share");
      expect(er.reverseSolve.notes.join(" ")).toMatch(/matching the price per diluted share/);
    }
  });
  it("falls back to the market cap when the price is missing, and says so", () => {
    const { er } = atModelValue(1, 16, { price: null });
    expect(er.reverseSolve.impliedCurrentRoePct!).toBeCloseTo(15.7117, 2);         // HEAD's value on the market-cap basis
    expect(er.reverseSolve.basis).toBe("market-cap");
    expect(er.reverseSolve.notes.join(" ")).toMatch(/matching market cap \(price or diluted shares unavailable\)/);
  });
  it("divides the price by the quote-date roll", () => {
    // Task 5's roll on the price basis. First call: valuationDate 2026-07-05 (96 days after asOf), 3% gap, no price,
    // no market cap; its rolled perShare is the price. Second call: the same with that price.
    const { er, current } = atModelValue(3, 16, { valuationDate: "2026-07-05" });
    expect(er.valuationDate?.value).toBe("2026-07-05");                                // setup: the headline rolled
    expect(er.reverseSolve.basis).toBe("price-per-diluted-share");
    expect(Math.abs(er.reverseSolve.impliedCurrentRoePct! - current)).toBeLessThan(0.05);
    expect(er.reverseSolve.notes.join(" ")).toMatch(/the price taken back 96 days to the opening book at the cost of equity/);
  });
  it("follows the price through runStageB, not a market cap on another share count", () => {
    // buildSyntheticRouteBundle("bank") (tests/helpers/researchRoutePanel.ts:24) as checked in quotes 100 against a model
    // value of 12.4676 per share, so its reverse has no root before or after ("implied ROE > 80%"), and a comparison of two
    // nulls proves nothing. So the quote price is set to the model value per share from a first run (the excess-return
    // value reads the quote's date, which this leaves alone, and not its price), the market cap to that price × the quote's
    // 100M shares, and a second copy carries a market cap 3% higher at the same price. The checked-in quote's timestamp
    // (1751731200, 2025-07-05) precedes BV0 (2026-03-31), so Task 5 does not roll this value (elapsed days ≤ 0); the
    // rolled case is "divides the price by the quote-date roll" above.
    const first = runStageB(buildSyntheticRouteBundle("bank"));
    if (first.valuation.kind !== "excess-return") throw new Error("bank route expected");
    const p0 = first.valuation.excessReturn.perShare!;                                 // not rolled: the quote predates BV0
    const quotedAt = (mcapFactor: number) => {
      const bundle = buildSyntheticRouteBundle("bank");
      if (!bundle.quote.ok) throw new Error("quote expected");
      const row = bundle.quote.value.data.rows[0] as { price: number; marketCap: number };
      const quoteShares = row.marketCap / row.price;
      Object.assign(row, { price: p0, marketCap: p0 * quoteShares * mcapFactor });
      const c = runStageB(bundle);
      if (c.valuation.kind !== "excess-return") throw new Error("bank route expected");
      return c.valuation.excessReturn;
    };
    const a = quotedAt(1), b = quotedAt(1.03);
    expect(a.reverseSolve.impliedCurrentRoePct).not.toBeNull();                       // setup guard: a root exists
    expect(b.reverseSolve.impliedCurrentRoePct!).toBeCloseTo(a.reverseSolve.impliedCurrentRoePct!, 6); // HEAD (no roll): 41.5149 against 40.4749
    expect(Math.abs(b.reverseSolve.impliedCurrentRoePct! - b.roePathPct.value[0]!)).toBeLessThan(0.05); // HEAD: 1.04pp
    expect(b.reverseSolve.basis).toBe("price-per-diluted-share");
  });
  it("solves on the price when only the market cap is withheld (the ADR rule at valuation.ts:5856-5858)", () => {
    const { er, current } = atModelValue(1, 16, { marketCap: null });
    expect(er.reverseSolve.impliedCurrentRoePct!).toBeCloseTo(current, 1);                 // HEAD: null, "skipped: market cap not provided"
    expect(er.reverseSolve.basis).toBe("price-per-diluted-share");
  });
  it("control: no gap solves back to the current return (passes at HEAD)", () => {
    expect(Math.abs(atModelValue(0).er.reverseSolve.impliedCurrentRoePct! - 16)).toBeLessThan(0.05);
  });
  ```
  The existing reverse cases pass `marketCap` without `price`, so they run the fallback and pass unchanged: `tests/stageB.valuation.test.ts:1700-1780`, `tests/stageB.financialValuation.test.ts:150-160` and `tests/stageB.excessReturnPayoutFade.audit20261022.test.ts:80-91`.

  In `tests/report.legacyValuationNotes.test.ts` (B5's file; build each stored report from `fixtures/report/DEMO-sample.json` as its other cases do):
  - (a) A stored report at spec "1.1.0" whose `scores.aspects.valuation.drivers` holds `{ source: "computed.scores.valuation.roeImpliedVsAchievable", value: 22.63, unit: "pp" }` (the #21 shape) gains an `impliedReturnShareBasis` note matching `/was not solved on the share count the value per share divides by/`.
  - (b) The same driver at spec `ANNUALIZATION_CONVENTION_SPEC` (built after B5, before this batch) also gains it. This pins the separate cutoff.
  - (c) The same driver at `IMPLIED_RETURN_SHARE_BASIS_SPEC`, and a general-route report without the driver, gain none.
- [ ] **Step 2: Run it.** `npx vitest run tests/stageB.excessReturnReverseShareBasis.audit20261027.test.ts` → FAIL:
  - `expected 15.7116… to be close to 16` and `expected undefined to be 'price-per-diluted-share'`;
  - the roll case on its basis assertion;
  - the wiring case on `toBeCloseTo`. The 3% higher market cap moves the market-cap solve by about 1pp. B5's round-4 reviewer measured 41.5149 against 40.4749 at HEAD. On this task's base the checked-in quote predates BV0, so Task 5's factor does not apply and the same pair is expected. If it differs, B4's merged divisor or another merged batch moved it: trace that before going on. Record the measured pair in the commit message.

  The setup guards and the control pass. `npx vitest run tests/report.legacyValuationNotes.test.ts -t "impliedReturnShareBasis|share count"` fails on (a) and (b).
- [ ] **Step 3: Implement** per Interfaces, the legacy row included. The row rewrites no stored field: it only adds the `appendix.missingData` entry, as B5's notes do.
- [ ] **Step 4: Run it.** PASS. Then re-run, in four groups:
  - Task 5's file. Retitle its case "the start alternative and every grid cell roll from their own opening book; the reverse solve meets the discounted price". Add `expect(q96.reverseSolve.basis).toBe("price-per-diluted-share")` and the same for `q1`: its `er()` runs `runStageB`, which now passes the price. The `toBeLessThan` pin stays as it is. The synthetic bank's diluted count equals its quote shares (100M), so the price basis solves where the market-cap basis did, and only the basis is new. Then add `expect(d96.reverseSolve.basis).toBe("price-per-diluted-share")` on the no-root run, which pins the Interfaces rule that the basis is reported without a root. Run `npx vitest run tests/stageB.excessReturnValuationDate.audit20261027.test.ts`.
  - `npx vitest run tests/stageB.valuation.test.ts tests/stageB.financialValuation.test.ts tests/stageB.excessReturnPayoutFade.audit20261022.test.ts tests/stageB.excessReturnStart.audit20261022.test.ts tests/stageB.adrExcessReturn.test.ts tests/stageB.commonIncomeAdmission.test.ts tests/audit.valuationEvidence.test.ts tests/stageB.grading.test.ts tests/audit.issuerPipeline.test.ts tests/report.legacyValuationNotes.test.ts`.
  - The `buildSyntheticRouteBundle` consumers that run the bank and insurer routes through `runStageB`: `npx vitest run tests/research.routePanel.test.ts tests/stageB.commonIncomeConsumers.test.ts tests/stageB.commonIncomeTiming.test.ts tests/stageC.excessReturnVisibility.audit20261022.test.ts tests/edgar.parentNetIncome.test.ts tests/edgar.preferredPayoutSurfaces.test.ts tests/report.templateLabels.test.ts`. The checked-in synthetic bank has no root before or after, so it should not move.
  - The direct-call cases are unchanged (fallback basis). A `runStageB` bank or insurer case that pins an implied return or a valuation score re-pins with a "D-next: solved on the price per diluted share (FIN-506)" comment only where its fixture's diluted count differs from its quote share count, and the re-pin must equal the price-basis solve.
- [ ] **Step 5: Benefit check.**
  - The probe's two failing assertions now hold (|implied − current| < 0.05 at 1% and 3% gaps), and its control holds.
  - Task 31 records three replay rows: PGR keyless (fixture), the census JPM, BAC and PGR snapshots, and the synthetic bank.
  - Must not move: every general-route figure, the forward excess-return value and per share (Task 5's rolled value), and the P/TBV check (still on the market cap).
  - One intended move beyond the finding: the established-ADS ADR with a non-issuer-common cap now gets a reverse solve on the price per ADS. No stored or replayed issuer is such an ADR (JPM #21 and SCHW #39-#41 are not ADRs; snapshots 43-50 are general-route), and the disposition note says so.
  - Stored reports: the note fires on #21 only (JPM, spec 1.1.0; SCHW #39-#41 carry no implied-return driver).
- [ ] **Step 6: Docs.** `docs/METHODOLOGY.md`, the excess-return reverse solve: "the starting ROE at which the model's value per share equals the price, on the diluted share count the forward per share uses, with the market cap only as a disclosed fallback; on a quote after the opening book the price is taken back to it by the same roll-forward factor (D-65)". The identity "an issuer priced at book solves to exactly the cost of equity" still holds on that basis. Task 5's D-65 sentence becomes "the reverse solve meets the price discounted back by the headline factor (the market cap only on the fallback)". B5 Task 17's stored-valuations paragraph gains the `impliedReturnShareBasis` note and its cutoff.
- [ ] **Step 7: Commit.** `git add src/pipeline/stageB/valuation.ts src/pipeline/compute.ts src/pipeline/stageB/sectorRouting.ts src/report/legacyValuationNotes.ts docs/METHODOLOGY.md tests/stageB.excessReturnReverseShareBasis.audit20261027.test.ts tests/stageB.excessReturnValuationDate.audit20261027.test.ts tests/report.legacyValuationNotes.test.ts <any re-pinned test files by name>` then `git commit -m "Invert the excess-return model against the price per diluted share, as the forward value is stated (FIN-506)"`.

### Task 6: The TTM capital snapshot keeps the operating-income basis (FIN-112)

**Files:**
- Modify: `src/pipeline/compute.ts:2214` (the `income` passed to `attachCurrentCapital`)
- Modify: `docs/METHODOLOGY.md` (current-capital / coverage paragraph that cites D-31)
- Test: `tests/stageB.currentCapital.test.ts` (new `describe("TTM operating income incomplete")`)

**Interfaces:**
- Consumes: `TtmIncome.operatingIncome` (null when fewer than 4 quarters carry it, `compute.ts:1241-1255`).
- Produces: no new type; `attachCurrentCapital` receives `{ ...ttmInc, ebit: ttmInc.operatingIncome }`.

- [ ] **Step 1: Write the failing test.** Synthetic (not the probe's snapshots 43/50, which are tmp data): `completeCurrencyBundle({})` with every quarterly income row given `ebit = operatingIncome + 50 * M` (a non-operating gain), then `delete rows[1].operatingIncome`.
  ```ts
  it("an incomplete TTM operating income withholds TTM EBIT, EBITDA and coverage instead of using vendor EBIT", () => {
    const c = runStageB(bundleWithMissingQuarterOperatingIncome(), { evIncludeLeases: false });
    expect(c.capital.current!.basis).toBe("ttm");
    expect(c.capital.current!.ebit).toBeNull();
    expect(c.capital.current!.ebitda).toBeNull();
    expect(c.capital.current!.interestCoverage).toBeNull();
    expect(c.scores.aspects.balanceSheet.signals.find((s) => s.id === "interestCoverage")).toBeUndefined();
    expect(c.gaps.some((g) => g.field === "compute.ttmIncome.operatingIncome")).toBe(true);
  });
  it("control: complete TTM operating income keeps the operating basis, never vendor EBIT", () => {
    const c = runStageB(bundleWithVendorEbitAboveOperatingIncome(), { evIncludeLeases: false });
    expect(c.capital.current!.ebit).toBe(sumOperatingIncomeOfLatestFourQuarters);
  });
  ```
- [ ] **Step 2: Run it.** `npx vitest run tests/stageB.currentCapital.test.ts -t "TTM operating income incomplete"` → FAIL: `expected <vendor EBIT sum> to be null`.
- [ ] **Step 3: Implement.** `compute.ts:2214`: `income: ttmInc && currencies.ttmIncomeUsable ? { ...ttmInc, ebit: ttmInc.operatingIncome } : null`, with a comment citing D-31 (`toCapitalIncome` at `compute.ts:566-567` is the annual twin). No annual fallback inside the TTM snapshot (OD-12).
- [ ] **Step 4: Run it.** PASS. Re-run `npx vitest run tests/stageB.currentCapital.test.ts tests/stageB.growth.returns.capital.test.ts tests/report.capitalBridge.test.ts tests/stageB.ttm.compute.test.ts` → PASS (complete-TTM fixtures unchanged: `computeCapital` already prefers operating income).
- [ ] **Step 5: Benefit check.** The probe's assertion ("current.ebit is not the vendor EBIT sum") holds by construction. Replays of snapshots 43, 46, 48, 49, 50 (Task 31): `capital.current` identical before and after (the audit found 0 of 170 stored rows with the trigger), which proves the fix touches only the incomplete-operating-income branch. DEMO fixture: no leaf moves.
- [ ] **Step 6: Docs.** METHODOLOGY current-capital paragraph: "When the trailing four quarters' operating income is incomplete, the TTM EBIT, EBITDA, interest coverage and net debt/EBITDA are withheld; vendor EBIT, which can include non-operating gains, is never substituted (D-31)."
- [ ] **Step 7: Commit.** `git add src/pipeline/compute.ts docs/METHODOLOGY.md tests/stageB.currentCapital.test.ts` then `git commit -m "Keep the TTM capital snapshot on operating income, never vendor EBIT (FIN-112)"`.

### Task 7: A buyback year whose fiscal window the market-cap history covers only in part is unpriced (FIN-117)

**Files:**
- Modify: `src/pipeline/stageB/capital.ts:1004-1087` (window loop in `computeCapital`), new exported constant near the other buyback constants
- Modify: `tests/stageB.forensicsD61.test.ts:134` and `:175` (fixtures), and `tests/stageB.forensicsR3.test.ts` only if its history starts inside a priced window
- Modify: `docs/METHODOLOGY.md` (buyback timing paragraph; grep "fiscal year's average price")
- Test: `tests/stageB.buybackWindowCoverage.audit20261027.test.ts` (new)

**Interfaces:**
- Produces: `export const BUYBACK_WINDOW_START_TOLERANCE_DAYS = 7;` and the row note text "market-cap history starts <day>, inside the fiscal window <start> to <end>; a part-window average is not the fiscal year's average price".

- [ ] **Step 1: Write the failing test.** Seeded from `probes/FIN-117.probe.ts` part 1 (synthetic December-FYE issuer, run 2026-10-27, `eodFrom` computed with `EOD_YEARS` exactly as the probe does; price 10→20 through 2021 then flat 20; every year bought at its true average).
  ```ts
  it("leaves FY2021 unpriced when the history starts inside its window, and timing reads 0% at 84.2% coverage", () => {
    const r = computeCapital(income, cashFlow, [], caps, { price: 20 }, { reportedCurrency: "USD", quoteCurrency: "USD", repurchaseExecutions: executions });
    const fy21 = r.buybackPriceAnalysis.years.find((y) => y.date === "2021-12-31")!;
    expect(fy21.avgPriceProxy).toBeNull();
    expect(fy21.avgMarketCap).toBeNull();
    expect(fy21.note).toMatch(/market-cap history starts 2021-10-27, inside the fiscal window/);
    expect(r.buybackPriceAnalysis.timingPct).toBeCloseTo(0, 10);
    expect(r.buybackPriceAnalysis.timingCoveragePct).toBeCloseTo((800 / 950) * 100, 10);
    expect(r.notes.join(" ")).toMatch(/no year-average price for 2021-12-31/);
  });
  it("control: a window the history covers from its start (within 7 days) stays priced", () => {
    const fy22 = /* same run */ r.buybackPriceAnalysis.years.find((y) => y.date === "2022-12-31")!;
    expect(fy22.avgPriceProxy).toBeCloseTo(20, 10);
  });
  it("tolerates a history that starts on the first trading day after a holiday-straddled year end", () => {
    // window start 2022-12-31 (Saturday); history starts 2023-01-03 → priced
  });
  ```
- [ ] **Step 2: Run it.** `npx vitest run tests/stageB.buybackWindowCoverage.audit20261027.test.ts` → FAIL: `expected 19.117... to be null` and `expected 4.334 to be close to 0`.
- [ ] **Step 3: Implement.** Before the loop, `const historyStartMs = mcaps.length > 0 ? Date.parse(mcaps[mcaps.length - 1].date) : null;` (`mcaps` is newest first). Inside, after `inWindow`: `const partial = historyStartMs !== null && historyStartMs > startMs + BUYBACK_WINDOW_START_TOLERANCE_DAYS * DAY_MS;` (define `DAY_MS = 86_400_000` locally if `capital.ts` has none). When `partial && inWindow.length > 0`, push the note, set `avgMarketCap = null`, and take the existing unpriced path (so `avgPriceProxy` stays null, the year joins `unpricedExecutionYears` with its note in `unpricedReasons`). Price-proxy suppression keeps precedence. The D-68 naming today exists only in the NOT-measured branch (`capital.ts:1109-1131`); when coverage still clears `BUYBACK_TIMING_MIN_COVERAGE_PCT` (the probe's case, 84.2%), the measured note (`capital.ts:1101-1106`) must name the left-out years too, or the test's `/no year-average price for 2021-12-31/` fails after the fix: append `; no year-average price for ${unpricedExecutionYears.join(", ")} (${[...unpricedReasons].join("; ")}), so those years are left out` to the measured note whenever `unpricedExecutionYears.length > 0`. The "X% of repurchase dollars covered" wording stays.
- [ ] **Step 4: Run it.** PASS. Re-run `npx vitest run tests/stageB.forensicsD61.test.ts tests/stageB.forensicsR3.test.ts tests/stageB.growth.returns.capital.test.ts tests/stageB.grading.test.ts`. Expected: `forensicsD61` fails at HEAD fixtures because their one-point-per-year histories start mid-window. Fix only the fixtures, by adding one market-cap point dated before the oldest window (`{ date: "2023-12-29", marketCap: 1600 }` at line 134; `{ date: "2020-12-30", marketCap: 1000 }` at line 175) so every in-window average is unchanged and every assertion stays as written; the commit message says why ("the fixtures' histories started inside their oldest window, the shape FIN-117 fixes").
- [ ] **Step 5: Benefit check.** Probe part 1: `fy21.avgPriceProxy === null` and coverage < 100 now hold; probe part 2 (MU #46, replayed in Task 31): FY2022 (2021-09-02 to 2022-09-01, history from 2021-10-25) becomes unpriced; record `avgPricePaidProxy` (86.36 at HEAD) and `premiumDiscountPct` (916.1 at HEAD) after. FCX and SNOW keyless replays: their oldest repurchase year becomes unpriced; their leadership score and composite before/after go in the table. Must NOT move: years whose window starts after the history start; the DEMO fixture unless its oldest priced year starts before its history, or a measured timing note gains the "no year-average price for …" clause (then the moved leaves join the delta group with this reason). Stored reports: MU #46 is a stored report in this class (its FY2022 was averaged over a partial window); it keeps its bytes and its recorded timing, read under its own stamp, and the disposition note names it.
- [ ] **Step 6: Docs.** METHODOLOGY buyback timing: "A fiscal year is priced only when the market-cap history covers its whole window (it starts no more than 7 days after the window opens); a year the history covers in part is named as unpriced, like an empty window (D-68)."
- [ ] **Step 7: Commit.** `git add src/pipeline/stageB/capital.ts tests/stageB.forensicsD61.test.ts docs/METHODOLOGY.md tests/stageB.buybackWindowCoverage.audit20261027.test.ts` (plus `tests/stageB.forensicsR3.test.ts` only if edited) then `git commit -m "Leave a buyback year unpriced when the market-cap history covers only part of it (FIN-117)"`.

### Task 8: Bank route metrics read restatement-collapsed annual rows (FIN-122)

**Files:**
- Modify: `src/pipeline/compute.ts:2362-2383` (pass `acceptedDate`/`filingDate` on the `balance` and `income` rows given to `computeFinancialMetrics`)
- Modify: `src/pipeline/compute.ts:595-611` (`toCapitalBalance` gains `acceptedDate: str(r.acceptedDate), filingDate: str(r.filingDate)`)
- Modify: `src/pipeline/stageB/financialMetrics.ts:89-111` (row types), `financialMetrics.ts:2042-2060` (normalise at the top of `computeFinancialMetrics`)
- Modify: `docs/METHODOLOGY.md` (bank route-metrics section: one sentence on restatements)
- Test: `tests/stageB.financialMetricsRestatement.audit20261027.test.ts` (new)

**Interfaces:**
- Consumes: `normalizeQuarterRows` (`src/pipeline/stageB/quarterWindows.ts:101`).
- Produces: `FinancialMetricsBalanceRow.acceptedDate?: string | null`, `.filingDate?: string | null`, the same on `FinancialMetricsIncomeRow`; gaps `financialMetrics.balance.period` / `financialMetrics.income.period` (warn, "annual <statement> period <date> dropped: <reason>") and a note "<n> restated/duplicate annual <statement> period(s) collapsed to the latest filing" (the wording `capital.ts:463-480` and `returns.ts:1501-1525` already use).

- [ ] **Step 1: Write the failing test.** Copy `probes/FIN-122.probe.ts` (synthetic `completeCurrencyBundle({ bank: true, sic: "6021" })` plus synthetic companyfacts: deposits, gross loans and FY2025 net charge-offs; FY2025 served once as filed 2026-02-15 and once restated 2026-08-01).
  ```ts
  it("with FY2025 served twice, the bank metrics and grade equal the restated-only run", () => {
    const dup = bankRun(true), ref = bankRun(false);
    expect(metric(dup, "tangibleLeverage")!.value).toBeCloseTo(metric(ref, "tangibleLeverage")!.value as number, 6); // 6.5327 at HEAD's ref
    expect(metric(dup, "ncoToAverageLoans")!.value).toBeCloseTo(0.5, 6);
    expect(dup.scores.aspects.balanceSheet.score).toBeCloseTo(ref.scores.aspects.balanceSheet.score!, 6);
    expect(dup.financialMetrics!.notes.join(" ")).toMatch(/1 restated\/duplicate annual balance period collapsed to the latest filing/);
  });
  it("an ambiguous duplicate (no filing recency) is dropped and disclosed, never read positionally", () => {
    const amb = bankRun(true, { stripRecency: true });
    expect(amb.financialMetrics!.gaps.some((g) => g.field === "financialMetrics.balance.period" && /2025-12-31/.test(g.reason))).toBe(true);
  });
  it("the capital module collapses the same duplicate instead of failing closed", () => {
    const dup = bankRun(true);
    expect(dup.capital.gaps.some((g) => g.field === "capital.balance.period")).toBe(false);
    expect(dup.capital.notes.join(" ")).toMatch(/restated\/duplicate annual balance period collapsed/);
  });
  it("control: the restated-only run is unchanged", () => {
    const ref = bankRun(false);
    expect(ref.route.base).toBe("bank");
    expect(ref.financialMetrics!.gaps.some((g) => /period/.test(g.field))).toBe(false);
  });
  ```
- [ ] **Step 2: Run it.** `npx vitest run tests/stageB.financialMetricsRestatement.audit20261027.test.ts` → FAIL: `expected 4.522613065326634 to be close to 6.532663316582915`.
- [ ] **Step 3: Implement.** `computeFinancialMetrics` runs `normalizeQuarterRows` on `inputs.balance` and `inputs.income` before any metric, pushes each rejected period as a warn gap and the collapsed count as a note, and continues with `{ ...inputs, balance: normalized.balance, income: normalized.income }` (newest first, as the type already documents). `compute.ts` passes `acceptedDate: str(r.acceptedDate), filingDate: str(r.filingDate)` on both row maps; `toCapitalBalance` passes the same two fields.
- [ ] **Step 4: Run it.** PASS. Re-run `npx vitest run tests/stageB.financialMetrics.test.ts tests/stageB.growth.returns.capital.test.ts tests/stageB.currentCapital.test.ts tests/stageB.grading.test.ts tests/audit.issuerPipeline.test.ts` → PASS (no committed fixture has a duplicate annual period with distinct recency; any EDGAR-built fixture is deduplicated upstream by D-13).
- [ ] **Step 5: Benefit check.** The probe's failing assertion (tangible leverage from the superseded copy) holds; its two controls hold, except the second control's "capital fails closed" expectation, which this task deliberately turns into "capital collapses" (stated in the commit). Replays of 43-50 and the five keyless issuers: identical `financialMetrics` and `capital` (no duplicates in those inputs), proving the change is inert without duplicates.
- [ ] **Step 6: Docs.** METHODOLOGY bank route metrics: "A fiscal year served twice (original and restatement) is collapsed to the provably latest filing before any metric is read, as in the growth, returns and capital modules; an ambiguous duplicate is dropped with a stated reason."
- [ ] **Step 7: Commit.** `git add src/pipeline/compute.ts src/pipeline/stageB/financialMetrics.ts docs/METHODOLOGY.md tests/stageB.financialMetricsRestatement.audit20261027.test.ts` then `git commit -m "Collapse restated annual rows before the bank route metrics read them (FIN-122)"`.

### Task 9: The bank forensics disclosure says what is graded (FIN-120)

**Files:**
- Modify: `src/pipeline/stageB/sectorRouting.ts:1351-1364` (the bank `forensics` degradation item and the stale comment above it)
- Modify: `docs/METHODOLOGY.md` (if it quotes the old disclosure; grep "no replacement solvency screen")
- Test: `tests/stageB.bankDisclosure.audit20261027.test.ts` (new)

**Interfaces:**
- Consumes: `degradationDisclosures` (`src/pipeline/stageC/payload.ts`), `degradationPlan`.
- Produces: the disclosure string "Altman Z, Beneish M and the accrual ratios are not computed for financials (their models are estimated on non-financial firms). Capital, credit and funding are graded instead (D-46): tangible common equity / tangible assets, net charge-offs / average loans, nonperforming loans / loans where the filer tags them, and loans / deposits. CET1 is shown when the filer tags it and is never graded."

- [ ] **Step 1: Write the failing test.** Copy `probes/FIN-120.probe.ts` (synthetic bank with deposits and net loans facts).
  ```ts
  it("the bank forensics manifest row names what is graded, not 'NOT modelled'", () => {
    const r = bankRun();
    const row = degradationDisclosures(r.degradation).find((d) => d.field === "degradation.forensics")!;
    expect(row.reason).not.toMatch(/NOT modelled|no replacement solvency screen/);
    expect(row.reason).toMatch(/tangible common equity \/ tangible assets/);
    expect(row.reason).toMatch(/CET1 is shown when the filer tags it and is never graded/);
  });
  it("control: the same run grades the bank balance sheet on tceToTangibleAssets", () => {
    expect(bankRun().scores.aspects.balanceSheet.signals.map((s) => s.id)).toContain("tceToTangibleAssets");
  });
  it("control: the insurer route's text is unchanged", () => { /* degradationPlan("insurer", [], 8) has no 'degradation.forensics' change */ });
  ```
- [ ] **Step 2: Run it.** `npx vitest run tests/stageB.bankDisclosure.audit20261027.test.ts` → FAIL: `expected '[suppress] Altman Z, Beneish M and th…' not to match /NOT modelled|no replacement solvency screen/`.
- [ ] **Step 3: Implement.** Replace the disclosure string; rewrite the comment above it to say the item stays "suppress" because the forensic battery is withheld, while D-46 grades capital, credit and funding.
- [ ] **Step 4: Run it.** PASS. Re-run `npx vitest run tests/stageB.sectorRouting.test.ts tests/degradation.report.test.ts tests/stageC.payload.passes.test.ts` → `stageC.payload.passes` may move only if its fixture is a bank (it is a general fixture at HEAD: no move expected); the others PASS.
- [ ] **Step 5: Benefit check.** The probe's failing assertion holds; its control holds. Payload: bank-route prompts lose the false sentence (fingerprint moves for bank runs only; the golden fixture is general and must not move). Stored bank reports (SCHW 40/41, generated 2026-10-04 and 2026-10-05) keep their recorded manifest text, and no display rule is needed: they predate D-46 (2026-10-13), their balance sheet reads "capital adequacy not computed" (checked by the plan reviewer), so the old sentence was true when they were built (disposition note).
- [ ] **Step 6: Docs.** METHODOLOGY: replace any quotation of the old sentence; the bank balance-sheet paragraph (D-46) already describes the graded inputs.
- [ ] **Step 7: Commit.** `git add src/pipeline/stageB/sectorRouting.ts docs/METHODOLOGY.md tests/stageB.bankDisclosure.audit20261027.test.ts` then `git commit -m "Say what the bank balance sheet is graded on instead of 'not modelled' (FIN-120)"`.

### Task 10: The ADR disclosures describe what runs (FIN-313)

**Files:**
- Modify: `src/pipeline/stageB/sectorRouting.ts:867-873` (route note), `sectorRouting.ts:1312-1317` (`degradationPlan` gains an optional `currencies` argument), `sectorRouting.ts:1579-1601` (the two `annotate` items), `sectorRouting.ts:954-990` (delete `ADR_RATIOS`, `AdrRatioEntry`, `AdrRatioLookup`, `lookupAdrRatio`)
- Modify: `src/pipeline/compute.ts:2100-2105` (pass `{ statements: currencies.model, quote: str(profile?.currency) }`; `currencies` is resolved at `compute.ts:2005`, before this call)
- Modify: `tests/stageB.sectorRouting.test.ts:9,19,645-672` (remove the deleted exports' imports and their describe block)
- Modify: `docs/METHODOLOGY.md:3344` and any doc naming `ADR_RATIOS` (grep)
- Test: `tests/stageB.adrDisclosure.audit20261027.test.ts` (new)

**Interfaces:**
- Produces: `degradationPlan(route, overlays, availableQuarters, reitSubmap?, currencies?: { statements: string | null; quote: string | null } | null): DegradationPlan` (the five existing callers in `tests/` keep working: the argument is optional and absent means "no currency sentence"). Annotations: `header.dividendYield` → "Dividend yield is shown GROSS of foreign withholding tax and depositary pass-through fees; no withholding rate is applied." `fundamentals.currency`, only when `comparePriceCurrency(currencies.statements, currencies.quote)` is `{ comparable: false, mismatch: true }` (two known ISO codes that differ; `<S>` and `<Q>` are those normalised codes) → "Statements are in <S> while the ADR quotes in <Q>: per-ADS and per-share comparisons with the price are withheld; no depositary ratio or FX rate is applied." Route note → "adr overlay applied (profile.isAdr). No depositary ratio is applied: per-ADS figures need verified, effective-dated security evidence (B-19), otherwise they are withheld."

- [ ] **Step 1: Write the failing test.** Copy `probes/FIN-313.probe.ts` (synthetic `completeCurrencyBundle({ symbol: "ADRX" })`, USD statements and quote, `isAdr: true`, no companyfacts).
  ```ts
  it("manifest and prompt never claim a ratio map or an FX per-ADS conversion", () => {
    const { payload, prompt } = build("USD");
    expect((payload.missingData as { reason: string }[]).filter((m) => /ADR ratio|eps_local/.test(m.reason))).toEqual([]);
    expect(prompt).not.toMatch(/ADR ratio \/ FX|ADR ratio map|eps_local/);
  });
  it("USD/USD ADR: no statements-currency sentence", () => {
    expect((build("USD").payload.missingData as { reason: string }[]).some((m) => /Statements are in/.test(m.reason))).toBe(false);
  });
  it("EUR statements, USD ADR quote: the currency annotation names both codes", () => {
    expect((build("EUR").payload.missingData as { field: string; reason: string }[]).find((m) => m.field === "degradation.fundamentals.currency")?.reason).toMatch(/Statements are in EUR while the ADR quotes in USD/);
  });
  it("control: the per-share gap still says no depositary ratio is guessed, and no adr.ratio gap exists", () => { /* as the probe's control */ });
  ```
- [ ] **Step 2: Run it.** `npx vitest run tests/stageB.adrDisclosure.audit20261027.test.ts` → FAIL: `expected [ { …(3) }, { …(3) } ] to deeply equal []`.
- [ ] **Step 3: Implement.** As in Interfaces: `degradationPlan` imports `comparePriceCurrency` from `./priceCurrency` (no import cycle: `priceCurrency.ts` imports nothing) and emits `fundamentals.currency` only on a known mismatch, naming the two normalised codes; an unknown or minor-unit side emits no currency sentence (the valuation gaps already say why the comparison is withheld). Delete the dead ratio map and its tests (OD-12).
- [ ] **Step 4: Run it.** PASS. Re-run `npx vitest run tests/stageB.sectorRouting.test.ts tests/degradation.report.test.ts tests/stageC.payload.passes.test.ts tests/stageB.adrExcessReturn.test.ts` → PASS (the deleted describe block is gone with its subject; nothing else imported `lookupAdrRatio`: `grep -rn "lookupAdrRatio\|ADR_RATIOS" src tests` returns nothing).
- [ ] **Step 5: Benefit check.** The probe's two failing tests pass; its control passes. Only ADR runs' payload text moves (fingerprint for ADR runs; the general golden must not move). Stored ADR reports keep their recorded manifest text (disposition note lists them by grepping `"adr"` overlays over `tmp/audit-2026-10-27/data/reports/[0-9]*.json`; the plan reviewer found no stored report carrying "ADR ratio map" or "eps_local").
- [ ] **Step 6: Docs.** `docs/METHODOLOGY.md:3344` already says no ratio is taken from the static table; delete any remaining reference to an "ADR ratio map" (grep `ADR ratio map`, `ADR_RATIOS` across `docs/`, `README.md`).
- [ ] **Step 7: Commit.** `git add src/pipeline/stageB/sectorRouting.ts src/pipeline/compute.ts tests/stageB.sectorRouting.test.ts docs/METHODOLOGY.md tests/stageB.adrDisclosure.audit20261027.test.ts` then `git commit -m "Describe the ADR path as it runs and delete the unused ratio map (FIN-313)"`.

### Task 11: A profitable FIN-OTHER issuer is not labelled unprofitable on operating cash flow alone (FIN-121)

**Files:**
- Modify: `src/pipeline/stageB/sectorRouting.ts:708-743` (the OCF exemption and its notes), reading the FIN-OTHER classification decided at `sectorRouting.ts:307-322`
- Modify: `docs/METHODOLOGY.md:2143-2148`
- Test: `tests/stageB.sectorRouting.test.ts` (extend the describe that holds lines 225-245) and `tests/stageB.finOtherOverlay.audit20261027.test.ts` (new, end to end)

**Interfaces:**
- Produces: a local `finOther: boolean` (base `general` and sector "financial services"/"financial", the FIN-OTHER branch's own predicate); `ocfIsProfitSignal = !(base === "bank" || base === "insurer" || base === "reit-mortgage" || finOther)`; the not-applied note for FIN-OTHER reads "unprofitable overlay not applied: operating cash flow <v> (<basis>) is negative, but for a FIN-OTHER financial issuer (sector Financial Services on the general map) OCF carries trading-asset, loan and customer-balance flows and is not a profitability signal (house rule); net income <ni> (<basis>) is the only trigger there."

- [ ] **Step 1: Write the failing test.** Unit (in `stageB.sectorRouting.test.ts`):
  ```ts
  it("negative OCF alone does not trigger unprofitable on a FIN-OTHER issuer", () => {
    for (const industry of ["Financial - Capital Markets", "Capital Markets", "Credit Services", "Asset Management"]) {
      const r = route({ sector: "Financial Services", industry }, {
        incomeTtm: { date: "2026-06-30", revenue: 20_000_000_000, netIncome: 3_000_000_000, reportedCurrency: "USD" },
        cashflowTtm: { date: "2026-06-30", operatingCashFlow: -4_000_000_000 },
      });
      expect(r.base, industry).toBe("general");
      expect(r.overlays, industry).not.toContain("unprofitable");
      expect(r.notes.some((n) => /^unprofitable overlay not applied: .*FIN-OTHER/.test(n)), industry).toBe(true);
    }
  });
  it("a FIN-OTHER loss still triggers it, and a non-financial issuer with negative OCF still does", () => { /* NI −1 → overlay; sector Technology, NI +, OCF − → overlay */ });
  ```
  End to end (new file, copied from `probes/FIN-121.probe.ts`, `completeCurrencyBundle({ burning: true, sic: "6211" })` relabelled "Financial - Capital Markets"): overlays exclude "unprofitable"; `metricPolicy(r.route).suppress` excludes "pe" and "piotroskiF"; `r.valuation.kind` is not "dcf-suppressed"; control: the bank with identical flows keeps no overlay.
- [ ] **Step 2: Run it.** `npx vitest run tests/stageB.sectorRouting.test.ts -t "FIN-OTHER"` and `npx vitest run tests/stageB.finOtherOverlay.audit20261027.test.ts` → FAIL: `expected [ 'unprofitable' ] to not include 'unprofitable'`.
- [ ] **Step 3: Implement.** Compute `finOther` once base is decided; use it in `ocfIsProfitSignal` and in the two note branches (the applied note's trigger text says "(net income only for a FIN-OTHER issuer)").
- [ ] **Step 4: Run it.** PASS. Re-run `npx vitest run tests/stageB.sectorRouting.test.ts tests/stageB.routingEvidence.test.ts tests/stageB.grading.test.ts tests/audit.crossCompanyCoverage.test.ts tests/audit.issuerPipeline.test.ts` → PASS; SNOW keeps `["unprofitable"]` (Technology, not FIN-OTHER).
- [ ] **Step 5: Benefit check.** The probe's two failing tests pass; both controls pass. Must NOT move: any non-financial report (DEMO, FCX, SNOW, NVDA, MU, AMZN replays identical in `route.overlays`). Moves: FIN-OTHER issuers with NI > 0 and OCF < 0 (none in the stored replays; named in the disposition note).
- [ ] **Step 6: Docs.** METHODOLOGY 2145-2147: "For banks, insurers, mortgage REITs and FIN-OTHER issuers (sector Financial Services on the general map), negative OCF alone cannot trigger it: trading assets, loans held for sale and funding flows are operating cash flows on those balance sheets (ASC 230-10-45-20 and -21)."
- [ ] **Step 7: Commit.** `git add src/pipeline/stageB/sectorRouting.ts docs/METHODOLOGY.md tests/stageB.sectorRouting.test.ts tests/stageB.finOtherOverlay.audit20261027.test.ts` then `git commit -m "Exempt FIN-OTHER issuers' operating cash flow from the unprofitable trigger (FIN-121)"`.

### Task 12: Unresolved model eligibility withholds Altman Z and says why, without calling the issuer a financial company (FIN-124)

**Files:**
- Modify: `src/pipeline/stageB/forensics.ts:677-724` (`selectAltmanVariant`: an unresolved-eligibility guard first), `forensics.ts:2725-2729` (`eligibilityUnresolved` also true for `route.modelEligibility?.status === "unresolved"`; a basis string chooses the wording), `forensics.ts:2808-2885` and `forensics.ts:1600-1630, 1740-1760` (the SIC 6199 strings become templated on that basis)
- Modify: `docs/METHODOLOGY.md:22-27` and `:2922`
- Test: `tests/stageB.unresolvedEligibilityForensics.audit20261027.test.ts` (new)

**Interfaces:**
- Produces: `PiotroskiOptions.eligibilityBasis?: string` (default "broad SIC 6199 alone"); for D-96 holds the basis is "the filer's funding evidence conflicts with its classification (model applicability unresolved)". `selectAltmanVariant` returns `{ variant: null, notes: ["Altman Z eligibility unresolved: <route.modelEligibility.reason> The exclusion is not evidence of financial health."] }`.

- [ ] **Step 1: Write the failing test.** Copy `probes/FIN-124.probe.ts` (synthetic `completeCurrencyBundle({ symbol: "TECHBANK", sic: "3571" })` with working-capital and retained-earnings inputs, plus synthetic Deposits, loans and net interest income facts).
  ```ts
  it("withholds Altman Z with an eligibility reason and blanks the report cell", () => {
    const { computed, report } = run(true);
    expect(computed.route.modelEligibility?.status).toBe("unresolved");
    expect(computed.forensics.altman?.score ?? null).toBeNull();
    expect(computed.forensics.gaps.find((g) => g.field === "forensics.altmanZ")?.reason).toMatch(/Altman Z withheld: Altman Z eligibility unresolved/);
    const cell = (report as any).quality.forensicScores.altman;
    expect(cell.score).toBeNull(); expect(cell.zone).toBeNull();
    expect(reportToMarkdown(report)).not.toMatch(/\| Altman Z \| original \| 5\.49 \| safe/);
  });
  it("names unresolved eligibility on Beneish, accruals and Piotroski instead of 'a financial company'", () => {
    const { computed } = run(true);
    const fx = computed.forensics;
    expect(fx.gaps.find((g) => g.field === "forensics.beneishM")!.reason).toMatch(/model applicability unresolved/);
    expect(fx.gaps.find((g) => g.field === "forensics.beneishM")!.reason).not.toMatch(/for a financial company/);
    expect(fx.piotroski?.variant).toBe("eligibility-unresolved");
  });
  it("control: without bank facts Altman is computed; the SIC 6199 path keeps its wording", () => { /* run(false): altman.score not null; a SIC 6199 bundle with empty sector/industry: gap still says 'broad SIC 6199 alone' */ });
  ```
- [ ] **Step 2: Run it.** `npx vitest run tests/stageB.unresolvedEligibilityForensics.audit20261027.test.ts` → FAIL: `expected 5.4895000000000005 to be null`.
- [ ] **Step 3: Implement.** Guard at the top of `selectAltmanVariant`; widen `eligibilityUnresolved` in `runForensics`; replace the literal "broad SIC 6199 alone" in the six Beneish/accruals/Piotroski strings with the basis argument (SIC 6199 wording unchanged for that path).
- [ ] **Step 4: Run it.** PASS. Re-run `npx vitest run tests/stageB.forensics.test.ts tests/stageB.forensicsNotesAndX2.test.ts tests/stageB.routingEvidence.test.ts tests/audit.crossCompanyCoverage.test.ts tests/stageB.sectorRouting.test.ts` → PASS (SIC 6199 pins unchanged).
- [ ] **Step 5: Benefit check.** Every probe assertion holds; the control holds. Grades: Altman was already policy-suppressed for the grade, so no score moves; only the forensic table, the manifest and the payload's forensic figures change for unresolved-eligibility runs. DEMO and all replays: identical forensics.
- [ ] **Step 6: Docs.** METHODOLOGY 22-27: "Under unresolved model eligibility, Altman Z, Beneish M and the accrual ratios are withheld and Piotroski is reported on its eligibility-unresolved scale; the reasons name the unresolved eligibility, not a financial classification." Line 2922 keeps the SIC 6199 case.
- [ ] **Step 7: Commit.** `git add src/pipeline/stageB/forensics.ts docs/METHODOLOGY.md tests/stageB.unresolvedEligibilityForensics.audit20261027.test.ts` then `git commit -m "Withhold Altman Z under unresolved model eligibility and name the hold (FIN-124)"`.

### Task 13: A valuation withheld for unresolved eligibility counts as applicable but missing (FIN-123)

**Files:**
- Modify: `src/pipeline/stageB/grading.ts:817-877` (an `"ineligible"` branch mirroring `"dcf-suppressed"`, and the valuation `scoreAspect` call passes a `noDataReason`)
- Modify: `docs/METHODOLOGY.md` (scoring: how a withheld valuation is graded; grep "dcf-suppressed" or "route-inapplicable")
- Test: `tests/stageB.ineligibleValuationGrade.audit20261027.test.ts` (new)

**Interfaces:**
- Produces: valuation `noDataReason` = "Valuation withheld: model applicability unresolved (see valuation.modelEligibility) — counted as missing evidence, not as a route without valuation"; no digits (it can reach the confidence-cap surfaces).

- [ ] **Step 1: Write the failing test.** Copy `probes/FIN-123.probe.ts` (synthetic `completeCurrencyBundle({ symbol: "CREDIT" })` relabelled "Financial Services / Credit Services" plus synthetic Deposits and loans facts).
  ```ts
  it("grades the withheld valuation as applicable but unscored, with a true reason and a low ceiling", () => {
    const { computed, report } = run(true);
    const v = computed.scores.aspects.valuation;
    expect(computed.valuation.kind).toBe("ineligible");
    expect(v.notApplicableReason).toMatch(/model applicability unresolved/);
    expect(v.notApplicableReason).not.toMatch(/no applicable signals for this route/);
    expect(v.applicableCompleteness).toBe(0);
    expect(confidenceCeilingFor("valuation", report as never)).toEqual({ ceiling: "low", reason: "the deterministic valuation score is unscored" });
  });
  it("the composite's evidence share counts the withheld valuation at the share the hold leaves applicable", () => {
    const { computed } = run(true);
    const s = computed.scores;
    // recompute: ceiling grows by weights.valuation × 0.3 (peOwnHistoryRank's share of 1.0) — 6 points on a 20-point valuation
    expect(s.assessments!.evidenceCompleteness).toBeCloseTo(compWeight(s) / (ceilingWithoutValuation(s) + s.composite.weights.valuation * 0.3), 10);
  });
  it("control: an unconflicted credit company still scores its valuation", () => { expect(run(false).computed.scores.aspects.valuation.score).not.toBeNull(); });
  ```
  (`compWeight`/`ceilingWithoutValuation` are recovered from stored fields exactly as `probes/RPT-101.probe.ts` does.) HEAD measures 34.4%; the expected value at the batch base is about 30.7% (re-measure after rebasing on B1-B5).
- [ ] **Step 2: Run it.** `npx vitest run tests/stageB.ineligibleValuationGrade.audit20261027.test.ts` → FAIL: `expected 'no applicable signals for this route — aspect not scored' not to match …` and `expected null to be 0`.
- [ ] **Step 3: Implement.** Add `else if (valuation.kind === "ineligible")` pushing the same three signals as `"dcf-suppressed"` with `raw: null` for `peOwnHistoryRank` (no multiples exist under the hold), and pass `valuation.kind === "ineligible" ? INELIGIBLE_VALUATION_REASON : null` as `scoreAspect`'s `noDataReason`.
- [ ] **Step 4: Run it.** PASS. Re-run `npx vitest run tests/audit.crossCompanyCoverage.test.ts tests/stageC.confidenceCeiling.test.ts tests/stageB.grading.test.ts tests/report.compositeEvidenceFloor.test.ts` → PASS (`crossCompanyCoverage.test.ts:101` pins `score` null, unchanged).
- [ ] **Step 5: Benefit check.** All four probe assertions hold. Moves: evidence share and composite of unresolved-eligibility reports only (the conflicted-credit fixture 34.4% → ~30.7%, composite 55.08 → ~54.54 by the verifier's hand computation; record the measured values). Must NOT move: every resolved report (DEMO, all replays).
- [ ] **Step 6: Docs.** METHODOLOGY scoring: "A valuation withheld because model applicability is unresolved (D-96) is applicable but unscored: the signals the hold still treats as applicable count as missing evidence, and the section's confidence is capped low."
- [ ] **Step 7: Commit.** `git add src/pipeline/stageB/grading.ts docs/METHODOLOGY.md tests/stageB.ineligibleValuationGrade.audit20261027.test.ts` then `git commit -m "Grade a valuation withheld for unresolved eligibility as missing, not inapplicable (FIN-123)"`.

### Task 14: Piotroski tests a route withholds by design are not missing evidence (FIN-306)

**Files:**
- Modify: `src/pipeline/stageB/forensics.ts:1470-1486` (`PiotroskiResult.routeWithheld?: number`), `forensics.ts:1494-1760` (`computePiotroski` counts the gate-withheld tests: 4 when `financialsSuppressed`, plus 2 when `balanceSheetFunded`)
- Modify: `src/pipeline/stageB/grading.ts:107-125` (`Signal.applicableFraction?: number`), `grading.ts:186-190` (`applicableWeight += s.weight * clamp01(s.applicableFraction ?? 1)`), `grading.ts:915-927` (piotroskiF passes `applicableFraction: (9 − routeWithheld) / 9`)
- Modify: `tests/stageB.grading.test.ts:140` and `:835-900` (the fully observed bank gets a real 3/3 battery; the hand-derived 78.32 is re-derived)
- Modify: `docs/METHODOLOGY.md:1894-1904`, `:2456-2460`
- Test: `tests/stageB.piotroskiRouteApplicability.audit20261027.test.ts` (new)

**Interfaces:**
- Produces: `PiotroskiResult.routeWithheld?: number` (0-6; absent on legacy objects means 0); `Signal.applicableFraction?: number` (0-1, default 1).

- [ ] **Step 1: Write the failing test.** Copy `probes/FIN-306.probe.ts` (synthetic `currencyBundle({ bank: true })` with a third balance year so every bank-allowed test is evaluated).
  ```ts
  it("a fully observed bank's quality reads 1 and carries no 'under three quarters' cap", () => {
    const c = bankWithThreeYears();
    expect(c.forensics.piotroski.outOf).toBe(3);
    expect(c.forensics.piotroski.routeWithheld).toBe(6);
    expect(c.scores.aspects.quality.applicableCompleteness).toBe(1);
    expect(confidenceCeilingFor("quality", { scores: c.scores, fairValue: c.fairValue, scenarioTargets: c.scenarioTargets } as never).reason ?? "").not.toMatch(/inputs its route supports/);
  });
  it("the composite's completeness excludes the six route-withheld tests", () => {
    // relational form of the probe: reported = compWeight / (ceilingAtHead − w.quality × 0.22 × 6/9); 0.4656 at HEAD's base
    expect(c.scores.assessments!.evidenceCompleteness).toBeCloseTo(expectedFromProbeFormula, 10);
  });
  it("counts only data-withheld Piotroski tests as missing", () => {
    expect(qualityShare(bankTwoYears())).toBeCloseTo((0.35 + 0.22 * 2 / 9) / (0.35 + 0.22 * 3 / 9), 10); // ΔROA data-missing
    expect(finOtherPiotroskiFraction()).toEqual({ routeWithheld: 4, applicable: 5 / 9 });
  });
  it("control: a general issuer's quality completeness is unchanged", () => { /* routeWithheld 0, applicableCompleteness equals dataCompleteness ratio as at HEAD */ });
  ```
- [ ] **Step 2: Run it.** `npx vitest run tests/stageB.piotroskiRouteApplicability.audit20261027.test.ts` → FAIL: `expected 0.7426900584795323 to be 1` and `expected 0.4429071099142601 to be close to 0.4655755840437301`.
- [ ] **Step 3: Implement.** As in Files/Interfaces. The quality score itself does not change (`usedWeight` still uses `evidenceFraction`); only `applicableWeight` (and through it `applicableCompleteness`, the composite ceiling and the business ceiling) changes.
- [ ] **Step 4: Run it.** PASS. Then `npx vitest run tests/stageB.grading.test.ts` → the fully observed bank test (`:835-900`) still passes at first, because its default forensics fixture (`:140`) is Piotroski `score: 8, outOf: 9`: nine evaluated tests, `evidenceFraction` 1, which no bank can produce (that is why CI never saw FIN-306; the plan reviewer ran the test at HEAD: it passes). Give `fullyObservedBank()` a real bank battery, `forensics({ piotroski: { score: 3, outOf: 3, routeWithheld: 6, signals: {} as never, notes: [], gaps: [], asOf: { current: null, prior: null, prior2: null } } })` (the general-route default at `:140` stays as it is), and re-derive `compWeight` by hand in the comment: quality data completeness 0.35 + 0.22 × 3/9 = 0.4233 replaces 0.57, so `compWeight` = 78.32 − 26 × 0.22 × 6/9 = 74.51 (assert `toBe(74.51)`). Keep "every scored aspect reads 1" and the shrink-factor-1 assertion exactly as written: with `applicableFraction` 3/9 they hold; without Task 14's change the quality aspect reads 0.4233/0.57 = 0.743 and the test fails, which is the regression guard. If the "old denominator pushes the grade down a band" assertion no longer holds with the new fixture, change only the fixture's buyback `timingPct` until it does and say so in the comment; never delete the assertion. Re-run `tests/stageC.confidenceCeiling.test.ts tests/audit.issuerPipeline.test.ts tests/report.compositeEvidenceFloor.test.ts` → PASS.
- [ ] **Step 5: Benefit check.** Both probe assertions hold; its setup checks hold. Moves (intended): composite and evidence share of every bank, insurer, mortgage-REIT, FIN-OTHER and unresolved-eligibility issuer (PGR keyless: record before/after quality `applicableCompleteness`, evidence share, composite and band). Must NOT move: the quality aspect score of any issuer, and anything on a general issuer (DEMO, FCX, SNOW, NVDA, MU, AMZN identical).
- [ ] **Step 6: Docs.** METHODOLOGY 1894-1904 and 2456-2460: "Piotroski's weight in the score is scaled by the share of the nine tests evaluated (D-24); its weight in completeness is scaled by the share the route can evaluate, so only tests withheld for missing data count as missing evidence."
- [ ] **Step 7: Commit.** `git add src/pipeline/stageB/forensics.ts src/pipeline/stageB/grading.ts tests/stageB.grading.test.ts docs/METHODOLOGY.md tests/stageB.piotroskiRouteApplicability.audit20261027.test.ts` then `git commit -m "Count only data-withheld Piotroski tests as missing evidence (FIN-306)"`.

### Task 15: An undetermined REIT sub-map does not grade on the equity/industrial map (FIN-308)

Depends on Task 12 (the eligibility-basis wording).

**Files:**
- Modify: `src/pipeline/stageB/sectorRouting.ts:1225-1276` (`metricPolicy`: the undetermined branch adds `roicVsWacc`, `operatingMargin`, `fcfGrowth`, `grossMargin`, `netDebt`, `netDebtToEbitda`), `sectorRouting.ts:636-656` (the `route.reitSubmap` gap names the grading consequence)
- Modify: `src/pipeline/stageB/forensics.ts:2631-2648` (`isFinancialForensicsSuppressed` returns true for base `reit` with `"reitSubmap" in route && route.reitSubmap === "undetermined"`, the test `metricPolicy` already uses), `forensics.ts:677-724` (`selectAltmanVariant` gets the same guard as Task 12's, with the sub-map reason), `forensics.ts:2725-2729` (that case is an eligibility hold whose basis is "REIT sub-map undetermined: SIC 6798 covers both equity and mortgage REITs"; Piotroski then reports 4 route-withheld tests, Task 14)
- Modify: `src/pipeline/stageB/grading.ts:963-968` (balance sheet) and `grading.ts:1031-1047` (moat): `notApplicableReason` = the `route.reitSubmap` gap reason when the sub-map is undetermined
- Modify: `docs/METHODOLOGY.md:1404-1408`
- Test: `tests/stageB.reitUndeterminedGrading.audit20261027.test.ts` (new)

**Interfaces:**
- Consumes: `route.reitSubmap` (the `CompanyRouteResult` field `metricPolicy` already reads), Task 12's `eligibilityBasis`.
- Produces: `export const REIT_SUBMAP_UNDETERMINED_GRADE_SUPPRESSED = ["roicVsWacc", "operatingMargin", "fcfGrowth", "grossMargin", "netDebt", "netDebtToEbitda"] as const` beside `REIT_SUBMAP_UNDETERMINED_SUPPRESSED`.

- [ ] **Step 1: Write the failing test.** Copy `probes/FIN-308.probe.ts` (synthetic `currencyBundle({ reit: true, sic: "6798" })`, industry "REIT - Diversified", a repo-funded book, companyfacts with only generic AFS-securities and repo tags; control adds one MBS element).
  ```ts
  it("does not grade the signals the mortgage map withholds as category errors", () => {
    const und = run(GENERIC);
    expect(und.route.reitSubmap).toBe("undetermined");
    expect(ids(und, "quality")).not.toContain("roicVsWaccSpread");
    expect(ids(und, "quality")).not.toContain("beneishM");
    expect(ids(und, "quality")).not.toContain("accrualsRatioAbs");
    expect(und.scores.aspects.moat.score).toBeNull();
    expect(und.scores.aspects.moat.notApplicableReason).toMatch(/REIT sub-map undetermined/);
    expect(und.scores.aspects.balanceSheet.score).toBeNull();
    expect(und.scores.aspects.balanceSheet.notApplicableReason).toMatch(/REIT sub-map undetermined/);
    expect(und.route.gaps.find((g) => g.field === "route.reitSubmap")!.reason).toMatch(/not graded/);
    expect(und.forensics.altman?.score ?? null).toBeNull();
  });
  it("control: one MBS element routes it to the mortgage map, unchanged", () => { const mort = run({ ...GENERIC, MortgageBackedSecuritiesAvailableForSaleFairValueDisclosure: 9_000 * M }); expect(mort.route.base).toBe("reit-mortgage"); expect(mort.scores.aspects.balanceSheet.score).toBeNull(); });
  it("control: a determined equity REIT keeps its industrial balance sheet, ROIC and gross margin", () => { /* currencyBundle({ reit: true }) with RealEstateInvestmentPropertyNet: balanceSheet signals include netDebtToEbitda */ });
  ```
- [ ] **Step 2: Run it.** `npx vitest run tests/stageB.reitUndeterminedGrading.audit20261027.test.ts` → FAIL: `expected [ 'roicVsWaccSpread', …(3) ] to not include 'roicVsWaccSpread'`.
- [ ] **Step 3: Implement.** As in Files. The moat and balance-sheet aspects take the explicit not-applicable path (route-inapplicable, so the composite ceiling drops them rather than counting them missing), exactly as the insurer balance sheet does today; the policy additions remove the remaining disagreeing signals.
- [ ] **Step 4: Run it.** PASS. Re-run `npx vitest run tests/stageB.sectorRouting.test.ts tests/stageB.routingEvidence.test.ts tests/stageB.grading.test.ts tests/audit.issuerPipeline.test.ts tests/stageB.forensics.test.ts` → PASS; O and NNN (equity evidence) keep their routes, overlays and scores.
- [ ] **Step 5: Benefit check.** All probe assertions hold; its mortgage control holds. Must NOT move: O, NNN (determined equity REITs) and every non-REIT replay. Moves: undetermined REITs only; none among the stored replays (state it). The PR names the known cost (keyless towers and data centres while undetermined, OD-7).
- [ ] **Step 6: Docs.** METHODOLOGY 1404-1408: append "The grade does not commit to either map either: ROIC − WACC, operating-margin slope, FCF growth, the moat and balance-sheet aspects, Altman, Beneish and the accrual ratios are withheld with the same reason, because the two maps disagree about them."
- [ ] **Step 7: Commit.** `git add src/pipeline/stageB/sectorRouting.ts src/pipeline/stageB/forensics.ts src/pipeline/stageB/grading.ts docs/METHODOLOGY.md tests/stageB.reitUndeterminedGrading.audit20261027.test.ts` then `git commit -m "Withhold the grades the equity and mortgage REIT maps disagree on while the sub-map is undetermined (FIN-308)"`.

### Task 16: One scope rule for an ADR's market equity: Altman X4 and the WACC follow the multiples (FIN-307)

**Files:**
- Modify: `src/pipeline/compute.ts:2278-2284` and `compute.ts:2981-2986` (pass `isAdr: route.overlays.includes("adr") || profile?.isAdr === true`, the expression already used at `compute.ts:3538`; hoist it into one local `adrQuote`), `compute.ts:2286-2302` (pass `marketEquityWithheldReason`)
- Modify: `src/pipeline/stageB/forensics.ts:516-560` (`computeAltman` original variant: a new `marketEquityWithheldReason` input files `forensics.altman.marketEquityScope` and withholds X4 market equity), `forensics.ts:2760-2790` (the Z' substitution gate also fires on that gap)
- Modify: `src/pipeline/stageB/securityBasis.ts:95-99` (`unresolved()` basis adds "The quoted security is an ADR whose provider market cap is not established as issuer-common; no depositary ratio is guessed." when `quote.isAdr === true` and no other scope evidence)
- Modify: `docs/METHODOLOGY.md` (Altman variant selection; WACC weights; the ADR paragraph)
- Test: `tests/stageB.adrMarketEquityScope.audit20261027.test.ts` (new)

**Interfaces:**
- Produces: `ForensicsInputs.marketEquityWithheldReason?: string | null`; gap `forensics.altman.marketEquityScope` (warn) "original-variant X4 (market value of equity) withheld: <scope basis>".

- [ ] **Step 1: Write the failing test.** Copy `probes/FIN-307.probe.ts` (synthetic `currencyBundle({ sic: "3571" })`, USD statements and quote, only `isAdr` toggled; a second ADR run with the vendor cap at 1/5).
  ```ts
  it("ADR: X4 does not read the cap the multiples refuse; Z' is substituted with the scope reason", () => {
    const adr = run(true);
    expect(adr.forensics.altman.variant).toBe("private");
    expect(adr.forensics.gaps.some((g) => g.field === "forensics.altman.marketEquityScope")).toBe(true);
    expect(adr.forensics.gaps.some((g) => g.field === "forensics.economicClassBasis" && /ADR/.test(g.reason))).toBe(true);
    expect(run(true, 2_000e6).forensics.altman.score).toBeCloseTo(adr.forensics.altman.score, 10); // the mis-scaled cap no longer moves it
  });
  it("ADR: the WACC withholds unresolved-scope weights and files the scope gap", () => {
    const adr = run(true);
    expect(adr.returns.wacc.weightEquity).toBeNull();
    expect(adr.returns.wacc.waccPct).toBeNull();
    expect(adr.returns.wacc.costOfEquityPct).not.toBeNull();
    expect(adr.returns.wacc.gaps.some((g) => g.field === "returns.wacc.economicClassBasis" && /ADR/.test(g.reason))).toBe(true);
  });
  it("leaves FX-mismatched, verified-ADS and debt-free ADRs as they were", () => {
    // EUR statements + USD ADR quote: Z' via the FX gap (forensics.altman.currency), WACC withheld by the currency rule, as at HEAD.
    // resolveEconomicEquityScope({ ..., isAdr: true, marketCapSecurityBasis: "issuer-common" }, [], day).status === "unverified-vendor-scope"
    // currencyBundle({ sic: "3571", debt: 0 }) with isAdr: weightEquity 1, waccPct = cost of equity.
  });
  it("control: an ordinary listing keeps the original variant on the vendor cap and its WACC (8.066% at HEAD)", () => {
    const ord = run(false);
    expect(ord.forensics.altman.variant).toBe("original");
    expect(ord.forensics.altman.components.x4).toBeCloseTo(6.6667, 3);
    expect(ord.returns.wacc.waccPct).toBeCloseTo(8.066, 3);
  });
  ```
- [ ] **Step 2: Run it.** `npx vitest run tests/stageB.adrMarketEquityScope.audit20261027.test.ts` → FAIL: `expected 'original' to be 'private'` and `expected 0.970873786407767 to be null`.
- [ ] **Step 3: Implement.** As in Files. `computeAltman`: after the currency check passes, a non-null `marketEquityWithheldReason` sets `equityNumerator = null` and files the new gap instead of `forensics.altman.marketCap`. `runForensics`: `const structural = altman.gaps.some((g) => g.field === "forensics.altman.currency" || g.field === "forensics.altman.marketEquityScope")` replaces `fxSuppressed`; the substitution note keeps its wording. A merely missing cap still fails closed.
- [ ] **Step 4: Run it.** PASS. Re-run `npx vitest run tests/stageB.forensics.test.ts tests/stageB.adrExcessReturn.test.ts tests/multiples.basisLabel.audit20261022.test.ts tests/stageB.ttm.compute.test.ts tests/audit.quoteObservation.test.ts tests/stageC.payload.passes.test.ts tests/audit.dcfOwnership.test.ts tests/stageB.economicShareScope.test.ts` → PASS, except the one known pin on a class-ambiguous fixture whose original-variant Z was withheld at HEAD: `tests/audit.dcfOwnership.test.ts:61-62` ("withholds debt/equity weights when a retained filing proves unresolved economic classes": `altman.variant` "original", `score` null). It now shows Z' (OD-6 consequence). Re-pin it to the stronger statement, not a looser one: `expect(computed.forensics.altman?.variant).toBe("private")`, `expect(computed.forensics.altman?.score).not.toBeNull()`, `expect(computed.forensics.gaps.some(g => g.field === "forensics.altman.marketEquityScope")).toBe(true)`, keeping its WACC-null and `forensics.economicClassBasis` assertions, with the comment "D-next: market equity withheld for unresolved scope → Z' (book equity), OD-6". Any other moved pin is a surprise: find why before re-pinning.
- [ ] **Step 5: Benefit check.** Both probe failures pass; its control passes. Record for the synthetic ADR: Altman 5.1595 safe (original, vendor cap) → Z' value and zone; WACC 8.066% → withheld; and that the 1/5-cap run now equals the normal run. The ADR's DCF follows the existing withheld-WACC path used for class-ambiguous issuers: `compute.ts:3886` hands `valueCompany` the nullable `wacc.waccPct`, which files "WACC unavailable — DCF suppressed" (`valuation.ts:6103-6106`) before `dcfInputs.waccPct` (`compute.ts:3460`, `?? 0`) is read, so no 0% WACC can be used (the plan reviewer traced it; the planner's "possible pre-existing D-78 defect" is not one). Assert it in the ADR test: `adr.valuation.kind === "dcf"`, `adr.valuation.dcf ?? null` is null and a `valuation.dcf` gap reads /WACC unavailable/ (at HEAD the ADR carries a DCF object whose per-share is already withheld by the B-19 ADS guard); the ordinary-listing control keeps a non-null `valuation.dcf`. Must NOT move: non-ADR replays, FX-mismatched ADR behaviour.
- [ ] **Step 6: Docs.** METHODOLOGY: "One scope rule serves every consumer of market equity: when an ADR's or a multi-class issuer's capitalization is not established as issuer-common, the multiples, original-variant Altman X4 and the WACC weights all withhold it; Altman falls back to Z' (book equity), and the WACC is withheld with the cost of equity shown. Key data still shows the provider cap labelled scope unverified (B-8)."
- [ ] **Step 7: Commit.** `git add src/pipeline/compute.ts src/pipeline/stageB/forensics.ts src/pipeline/stageB/securityBasis.ts docs/METHODOLOGY.md tests/stageB.adrMarketEquityScope.audit20261027.test.ts <re-pinned test files by name>` then `git commit -m "Apply the ADR market-equity scope rule to Altman X4 and the WACC (FIN-307)"`.

### Task 17: The Altman driver never calls a consumed market cap unavailable (FIN-312)

> **Moved (2026-10-29).** This task moved to R1 Task 4 (R1a) in `docs/superpowers/plans/2026-10-29-amzn51-r1-vendor-path-and-grading.md`, which builds it as written here plus the Altman operand label (GRD-04). Do not build it in B6. Its text below is kept for reference. B6 Task 27's expected DEMO leaf ("book equity (no market cap)") is produced by R1a, so B6 must not move it again.

Scope confirmed (decisions spec 4.3, 2026-10-28: "Yes to all three scope extensions"): the legacy display rule for stored reports 44-52 (`scoresForDisplay`), which the plan reviewer added beyond the finding's sketch, is built here.

**Files:**
- Modify: `src/pipeline/stageB/scoringEvidence.ts:193-197`
- Modify: `src/report/presentation.ts` (new `scoresForDisplay(report)`, the legacy display rule; `scoreDriverTable` itself is unchanged)
- Modify: `src/components/report/sections.tsx:426-427`, `src/report/export/markdown.ts` (the `renderScores(report.scores)` call site), `src/report/export/printHtml.ts` (its scores-section call site): pass `scoresForDisplay(report)` where they pass `report.scores` to the scorecard / driver tables
- Modify: `docs/METHODOLOGY.md` (score-driver periods, if it quotes the string; grep "market cap unavailable")
- Test: `tests/stageB.scoringEvidence.test.ts` (extend)

**Interfaces:**
- Produces: the period string `Balance <d>; income <d>; <market-cap leg>`, where the leg depends on the variant (OD-12 FIN-312): original variant with `components.x4 !== null` → `market cap <d>` or `market cap observation date unknown` when `asOf.marketCap` is null; original variant with `x4 === null` → `market cap unavailable`; book-equity variants (`private`, `z2`, `z2-em`) → `book equity (no market cap)`, because their X4 never reads a market cap (`computeAltman` stamps `asOf.marketCap` whatever the variant, `forensics.ts:416-420`, so the date alone cannot decide). The planner's rule keyed on `x4 !== null` alone would print "observation date unknown" for every Z'' issuer, including DEMO and META.
- Produces: `export function scoresForDisplay(report: Pick<Report, "scores" | "quality">): Report["scores"]`: returns `report.scores` unchanged unless an `altmanZOriginalScale` signal or driver `period` ends with `; market cap unavailable`; then it returns a copy whose leg reads `market cap observation date unknown` when `report.quality.forensicScores.altman` is `{ variant: "original", score: non-null }` (an original Z with a score cannot exist without X4, `forensics.ts:640`), `book equity (no market cap)` when that variant is a book-equity one, and is left as stored otherwise. Stored bytes are untouched; the audit export (`auditTables.ts`, `auditMarkdown.ts`) keeps the recorded string (it is the full record).

- [ ] **Step 1: Write the failing test.** Synthetic, from `probes/FIN-312.probe.ts` part 3 (`currencyBundle({ sic: "3571" })` with working-capital inputs; the profile cap is undated, D-79).
  ```ts
  it("an X4 that consumed an undated cap says its observation date is unknown", () => {
    const c = runStageB(manufacturer(), { evIncludeLeases: false });
    const s = c.scores.aspects.quality.signals.find((x) => x.id === "altmanZOriginalScale")!;
    expect(c.forensics.altman!.variant).toBe("original");
    expect(c.forensics.altman!.components.x4).not.toBeNull();
    expect(s.period).toMatch(/market cap observation date unknown$/);
    expect(s.period).not.toMatch(/market cap unavailable/);
  });
  it("a book-equity variant names no market cap at all", () => {
    const c = runStageB(nonManufacturer(), { evIncludeLeases: false }); // currencyBundle({}) with the same working-capital inputs: Z''
    expect(c.forensics.altman!.variant).toMatch(/^z2/);
    expect(c.scores.aspects.quality.signals.find((x) => x.id === "altmanZOriginalScale")!.period).toMatch(/; book equity \(no market cap\)$/);
  });
  it("a stored report keeps its bytes but reads the leg from its stored variant", () => {
    const report = dataOnly(manufacturer()); // buildDataOnlyReport, as researchRoutePanel does
    const legacy = structuredClone(report);
    for (const s of legacy.scores!.aspects.quality.signals ?? []) if (s.id === "altmanZOriginalScale") s.period = s.period!.replace(/market cap .*$/, "market cap unavailable");
    expect(scoresForDisplay(legacy)!.aspects.quality.signals!.find((s) => s.id === "altmanZOriginalScale")!.period).toMatch(/market cap observation date unknown$/);
    expect(reportToMarkdown(legacy)).not.toMatch(/market cap unavailable/);
    expect(legacy.scores!.aspects.quality.signals!.find((s) => s.id === "altmanZOriginalScale")!.period).toMatch(/market cap unavailable$/); // not rewritten
  });
  it("control: an original-variant X4 with no market cap still says unavailable", () => { /* marketCap removed from profile and quote: X4 null, original Z null, period ends 'market cap unavailable', and scoresForDisplay leaves it */ });
  ```
- [ ] **Step 2: Run it.** `npx vitest run tests/stageB.scoringEvidence.test.ts -t "market cap"` → FAIL: `expected 'Balance 2025-12-31; income 2025-12-31; market cap unavailable' to match /market cap observation date unknown$/`, the Z'' period not matching `/book equity/`, and `scoresForDisplay` not exported.
- [ ] **Step 3: Implement.** Build the leg as in Interfaces in `scoringEvidence.ts`; add `scoresForDisplay` and pass it at the three render sites (the classic and cover score sections in `sections.tsx`, the Markdown and print scorecards). D-79's null date stays (no date is invented).
- [ ] **Step 4: Run it.** PASS. Re-run `npx vitest run tests/stageB.scoringEvidence.test.ts tests/audit.quoteObservation.test.ts tests/stageB.ttm.compute.test.ts tests/report.presentation.d67.test.ts tests/report.schema.test.ts` → PASS (D-79 pins on the null date unchanged).
- [ ] **Step 5: Benefit check.** Replays 46 (MU) and 48, 49, 50 (NVDA), all original variant: the driver period changes from "market cap unavailable" to "market cap observation date unknown"; no number moves. Stored reports 44-52 render through `scoresForDisplay` (Task 31): 46-50 and 52 (original) read "observation date unknown", 44, 45 and 51 (z2: META, META, DEMO) read "book equity (no market cap)"; the stored strings stay. DEMO's computed fixture is z2, so its `drivers.2.period` leaf moves to "Balance 2025-12-31; income 2025-12-31; book equity (no market cap)" (group it in Task 27; it is not "observation date unknown").
- [ ] **Step 6: Docs.** METHODOLOGY's score-driver paragraph (grep "Measured over"; if none describes the periods, the Altman variant-selection paragraph): "The Altman driver's period names its market-cap observation only for the original variant: 'observation date unknown' when the cap has no date of its own (D-79), and 'book equity (no market cap)' for the variants that do not read one. Stored reports are read the same way from their recorded variant."
- [ ] **Step 7: Commit.** `git add src/pipeline/stageB/scoringEvidence.ts src/report/presentation.ts src/components/report/sections.tsx src/report/export/markdown.ts src/report/export/printHtml.ts docs/METHODOLOGY.md tests/stageB.scoringEvidence.test.ts` then `git commit -m "Name the Altman driver's market-cap leg by what the variant read (FIN-312)"`.

### Task 18: Peer P/B divides by common equity, like the subject's (FIN-126)

**Files:**
- Modify: `src/pipeline/peers.ts:330-332` (peer P/B denominator), `peers.ts:268` (methodology line)
- Modify: `docs/METHODOLOGY.md` (peer comparison definitions; grep "total stockholders equity")
- Test: `tests/pipeline.peers.test.ts` (extend)

**Interfaces:**
- Produces: `priceToBook = mcap / (totalStockholdersEquity − (preferredStock ?? 0))` for the peer and the same rule on the subject side of the eligibility check; exclusion reason "priceToBook: positive common equity (stockholders' equity less preferred) required for both issuer and peer". Methodology: "P/B uses market cap / common equity (total stockholders' equity less preferred stock; undisclosed preferred reads as zero, as for the subject)".

- [ ] **Step 1: Write the failing test.** Copy `probes/FIN-126.probe.ts` (synthetic "Banks - Regional" subject and four identical peers, mcap 80B, equity 60B, preferred 10% of equity).
  ```ts
  it("an issuer identical to its peers sits at the peer P/B median when they carry preferred", () => {
    const { pb, ptbv } = run(0.1 * TSE);
    expect(ptbv!.current).toBeCloseTo(ptbv!.peers!.median!, 10);
    expect(pb!.peers!.median).toBeCloseTo(pb!.current!, 10); // 1.4815
  });
  it("control: with zero preferred nothing changes", () => { const { pb } = run(0); expect(pb!.current).toBeCloseTo(pb!.peers!.median!, 10); });
  it("a peer whose preferred exceeds its equity is excluded from P/B with the common-equity reason", () => { /* preferred 70B on one peer */ });
  ```
- [ ] **Step 2: Run it.** `npx vitest run tests/pipeline.peers.test.ts -t "peer P/B median"` → FAIL: `expected 1.3333333333333333 to be close to 1.4814814814814814`.
- [ ] **Step 3: Implement.** In the peer loop compute `const common = equity !== null ? equity - (number(bal.preferredStock) ?? 0) : null` and the subject's common the same way; set `priceToBook` only when both are positive.
- [ ] **Step 4: Run it.** PASS. Re-run `npx vitest run tests/pipeline.peers.test.ts tests/multiples.basisLabel.audit20261022.test.ts tests/stageC.payload.passes.test.ts` → PASS (the existing peers fixtures use `preferredStock: 0`; the golden fixture's peer medians do not move). Amended in round 4: the rewritten methodology string (`peers.ts:268`) reaches every payload, because `comparePeerFundamentals` runs on every report (`compute.ts:3738`) and its methodology lines are printed in the multiples notes (`valuation.ts:4331-4332`) and in the "Comparable peers (computed)" notes (`payload.ts:1159`). So `tests/stageC.payload.passes.test.ts` fails here on its fingerprint, promptBytes and hash pins only, and no other assertion may fail. It is re-pinned once, in Task 26; confirm by grepping the serialized golden prompt for "P/B uses market cap".
- [ ] **Step 5: Benefit check.** The probe's failing assertion holds; its P/TBV and zero-preferred controls hold. Peer medians move only for peers with preferred; grades and intrinsic value cannot move (`peers.ts:269`). No stored keyless replay has peers (peers need an FMP key): state it.
- [ ] **Step 6: Docs.** METHODOLOGY peer definitions: the new P/B sentence.
- [ ] **Step 7: Commit.** `git add src/pipeline/peers.ts docs/METHODOLOGY.md tests/pipeline.peers.test.ts` then `git commit -m "Divide peer P/B by common equity, as the subject's is (FIN-126)"`.

### Task 19: A peer whose route the screen cannot confirm is not called a different route (FIN-125)

**Files:**
- Modify: `src/pipeline/peers.ts:315-317` (exclusion reason), `peers.ts:262-272` (one methodology sentence)
- Modify: `docs/METHODOLOGY.md` (peer screen)
- Test: `tests/pipeline.peers.test.ts` (extend)

**Interfaces:**
- Produces: `const subjectProfileRoute = routeCompany({ ...profile-only inputs of opts.profile }, emptyStatements, { today }).base` computed once; exclusion "valuation route unconfirmed: the subject's route rests on SEC routing evidence (SIC and XBRL facts) that the peer screen does not have for this peer" when `subjectProfileRoute !== opts.route && candidateRoute === subjectProfileRoute`; else the existing "valuation route differs from subject's resolved route".

- [ ] **Step 1: Write the failing test.** Copy `probes/FIN-125.probe.ts` (synthetic "Financial - Capital Markets" subject routed `bank` by D-34 evidence; four same-label peers).
  ```ts
  it("same-label peers of an evidence-refined bank are 'unconfirmed', not 'differs'", () => {
    const result = compare("bank");
    expect(result.peerCoverage.exclusions.filter((e) => /valuation route differs/.test(e.reason))).toEqual([]);
    expect(result.peerCoverage.exclusions.filter((e) => /valuation route unconfirmed/.test(e.reason)).map((e) => e.symbol)).toEqual(["P2", "P3", "P4", "P5"]);
  });
  it("control: against a general subject the same peers are eligible", () => { expect(compare("general").peerCoverage.eligible).toEqual(["P2", "P3", "P4", "P5"]); });
  it("control: a peer whose own profile routes elsewhere still 'differs'", () => { /* one peer labelled 'Insurance - Life' against the bank subject */ });
  ```
- [ ] **Step 2: Run it.** `npx vitest run tests/pipeline.peers.test.ts -t "unconfirmed"` → FAIL: `expected [ 'P2', 'P3', 'P4', 'P5' ] to deeply equal []`.
- [ ] **Step 3: Implement.** As in Interfaces; no new request, no new field on `PeerFundamentals`. Round 4: append the methodology sentence to the existing route-screen string (`peers.ts:266`) rather than inserting a new array element, so the index of every later methodology line and every `stageB.valuation.multiples.notes.N` leaf of the DEMO fixture stays put (Task 27).
- [ ] **Step 4: Run it.** PASS. Re-run `npx vitest run tests/pipeline.peers.test.ts tests/stageB.routingEvidence.test.ts` → PASS. The payload golden moves with the methodology sentence, as in Task 18 Step 4 (fingerprint, promptBytes and hashes only; re-pinned in Task 26).
- [ ] **Step 5: Benefit check.** The probe's failing assertion holds; both controls hold. Only exclusion wording and the methodology list change; no median, grade or value moves (no peer becomes eligible).
- [ ] **Step 6: Docs.** METHODOLOGY peer screen: "A subject whose route rests on SEC evidence (D-34) is compared only with peers the profile screen routes the same way; a same-label peer whose own evidence was not fetched is excluded as unconfirmed."
- [ ] **Step 7: Commit.** `git add src/pipeline/peers.ts docs/METHODOLOGY.md tests/pipeline.peers.test.ts` then `git commit -m "Name an unconfirmed peer route as unconfirmed, not different (FIN-125)"`.

### Task 20: Refused annual revenue is refused for every consumer (FIN-110)

Scope confirmed (decisions spec 4.3, 2026-10-28: "Yes to all three scope extensions"): the growth margin series join the revenue mask (OD-9), as the plan reviewer extended it.

**Files:**
- Modify: `src/pipeline/compute.ts:1932-1934` (one `revenueMaskedAnnual` row set when `revenueConflict`, and the reason text), `compute.ts:2112` and `:2118` (growth CAGRs and margins), `compute.ts:2272-2274` (forensic context income), `compute.ts:2514` (`projNorm`), `compute.ts:2327` (valuation reuses the same set), plus the two gaps
- Modify: `docs/METHODOLOGY.md` (revenue eligibility; grep "growth-dependent valuation")
- Test: `tests/audit.scoringEligibility.test.ts` (extend)

**Interfaces:**
- Produces: gaps `projections.revenueEligibility` and `forensics.revenueEligibility` (warn), each quoting `revenueEligibilityReason`; the reason text itself changes to "... Revenue growth and margins, the scenario dispersion and projection history, the revenue-based forensic inputs and growth-dependent valuation are withheld; raw source observations are retained."

- [ ] **Step 1: Write the failing test.** Synthetic, the pattern `tests/audit.scoringEligibility.test.ts:7-13` already uses (`completeCurrencyBundle({})` and a supplied validation with `xbrlCrossCheck.revenue.FY.2025-12-31` failing); the probe's 10-K/A realism stays in the disposition note.
  ```ts
  it("a failed annual revenue cross-check reaches the scenarios, projections and forensics too", () => {
    const flagged = runStageB(bundle, { evIncludeLeases: false }, failing);
    const revenue = flagged.projections.series.find((s) => s.metric === "revenue");
    expect(revenue?.historical?.every((h) => h.value.value === null) ?? true).toBe(true);
    expect(flagged.scenarioTargets.dispersion === null || flagged.scenarioTargets.missingReasons.some((m) => /unreconciled/.test(m.reason))).toBe(true);
    expect(flagged.forensics.beneish?.indices?.sgi ?? null).toBeNull();
    expect(flagged.forensics.gaps.some((g) => g.field === "forensics.revenueEligibility" && /unreconciled/.test(g.reason))).toBe(true);
    expect(flagged.gaps.some((g) => g.field === "projections.revenueEligibility")).toBe(true);
    // No margin is computed on the refused revenue either (GMI above is masked for the same reason).
    expect(flagged.growth.margins.operating.series.filter((p) => p.pct !== null)).toEqual([]);
    expect(flagged.growth.margins.gross.series.filter((p) => p.pct !== null)).toEqual([]);
  });
  it("control: the clean run keeps revenue in every consumer", () => {
    const clean = runStageB(bundle, { evIncludeLeases: false }, { checks: [], flags: [], gaps: [] });
    expect(clean.forensics.beneish?.indices?.sgi ?? null).not.toBeNull();
    expect(clean.growth.margins.operating.series.some((p) => p.pct !== null)).toBe(true);
  });
  ```
  (If the fixture cannot produce a scenario dispersion even when clean, assert the projection history and forensics only and say so in the test comment.)
- [ ] **Step 2: Run it.** `npx vitest run tests/audit.scoringEligibility.test.ts` → FAIL on the forensic SGI (`expected 1.0x to be null`) and the missing gaps.
- [ ] **Step 3: Implement.** One `const incomeAnnualForRevenue = revenueConflict ? incomeAnnual.map((row) => ({ ...row, revenue: undefined })) : incomeAnnual;` used by growth, valuation, `projNorm` and the forensic context, and the margins read `revenueConflict ? incomeAnnualReported.map((row) => ({ ...row, revenue: undefined })) : incomeAnnualReported` (the margin series keeps its every-reported-year currency rule; only the refused revenue goes); push the two gaps when `revenueEligibilityReason` is set. (Check the shape of `growth.margins.*.series` points before writing the margin assertions: if a point without revenue is omitted rather than null, the `filter(...)` form above still holds.)
- [ ] **Step 4: Run it.** PASS. Re-run `npx vitest run tests/audit.scoringEligibility.test.ts tests/stageB.forensics.test.ts tests/stageB.scoringEvidence.test.ts tests/report.scenarioPresentation.test.ts` → PASS.
- [ ] **Step 5: Benefit check.** The probe's assertion ("scenario dispersion built on withheld annual revenue with no disclosure") holds; its control (upstream refusal of a plain definition difference) is untouched because no code upstream of `runStageB` changes. Must NOT move: every run without a failed FY revenue check (all replays and DEMO).
- [ ] **Step 6: Docs.** METHODOLOGY revenue eligibility: the new list of consumers.
- [ ] **Step 7: Commit.** `git add src/pipeline/compute.ts docs/METHODOLOGY.md tests/audit.scoringEligibility.test.ts` then `git commit -m "Withhold refused annual revenue from the scenarios, projections and forensics too (FIN-110)"`.

### Task 21: The business-quality summary shows no letter under the evidence floor (RPT-101)

Scope confirmed (decisions spec 4.3, 2026-10-28: "Yes to all three scope extensions"): the dossier cover's "Business quality" row gets the same floor (`DossierCover.tsx`), as the plan reviewer extended it.

**Files:**
- Modify: `src/pipeline/stageB/grading.ts:1200-1221` (`assessments.businessQuality.evidenceCompleteness = businessWeight / businessCeiling`)
- Modify: `src/report/schema.ts:1812` (`evidenceCompleteness: z.number().min(0).max(1).optional()` on `businessQuality`)
- Modify: `src/report/presentation.ts:1774-1783` (`assessmentLine`, through a new `businessQualityGraded(a)` helper)
- Modify: `src/components/report/DossierCover.tsx:14-18` (the "Business quality" dimension row gets the same floor override the "Price attractiveness" row already has; read the Next.js guides named in Global Constraints first)
- Modify: `docs/METHODOLOGY.md` (assessment split paragraph)
- Test: `tests/report.assessment.test.ts` (extend)

**Interfaces:**
- Consumes: `MIN_HEADLINE_EVIDENCE`, `evidencePercentText` (`src/report/assessment.ts`).
- Produces: `export function businessQualityGraded(a: NonNullable<Report["scores"]>["assessments"]): boolean` (false only when `a.businessQuality.evidenceCompleteness` is a number below `MIN_HEADLINE_EVIDENCE`); under the floor, `Business quality <score> (not graded: evidence <N.N>%)` on the assessment line and `<score> / not graded: evidence <N.N>%` in the dossier's dimension row; at or above it, or when the field is absent, both are unchanged.

- [ ] **Step 1: Write the failing test.** Copy `probes/RPT-101.probe.ts` (the synthetic conflicted credit bundle).
  ```ts
  it("prints no business-quality letter below the floor", () => {
    const { b, computed } = conflicted();
    expect(computed.scores.assessments!.businessQuality.evidenceCompleteness).toBeLessThan(MIN_HEADLINE_EVIDENCE);
    const line = assessmentLine(computed.scores)!;
    expect(line).not.toMatch(/Business quality [\d.]+ \([A-F]/);
    expect(line).toMatch(/Business quality [\d.]+ \(not graded: evidence \d+\.\d%\)/);
    expect(reportToMarkdown(dataOnly(b, computed)).split("\n").find((l) => l.includes("Business quality"))).not.toMatch(/\([A-F]/);
  });
  it("the dossier cover prints no business-quality letter below the floor either", () => {
    const { b, computed } = conflicted();
    const html = renderToStaticMarkup(createElement(ReportView, { report: dataOnly(b, computed), layout: "dossier" }));
    const row = html.slice(html.indexOf("Business quality"), html.indexOf("Price attractiveness"));
    expect(row).toMatch(/not graded: evidence \d+\.\d%/);
    expect(row).not.toMatch(/\/ [A-F]\b/);
  });
  it("a legacy assessments block without the field keeps its recorded line", () => {
    const legacy = structuredClone(conflicted().computed.scores);
    delete (legacy.assessments!.businessQuality as { evidenceCompleteness?: number }).evidenceCompleteness;
    expect(assessmentLine(legacy)).toMatch(/Business quality [\d.]+ \([A-F]/);
  });
  it("control: a fully observed general issuer keeps its letter", () => { /* completeCurrencyBundle({}) */ });
  ```
  (The dossier render follows `tests/audit.scoringSensitivity.test.ts:106`, `renderToStaticMarkup(createElement(ReportView, { report, layout: "dossier" }))`.)
- [ ] **Step 2: Run it.** `npx vitest run tests/report.assessment.test.ts` → FAIL: `expected undefined to be less than 0.5`, and the dossier row printing `/ C (neutral)`.
- [ ] **Step 3: Implement.** Store the share (rounded only for display, never in the stored number); `assessmentLine` and the dossier's dimension mapping read it through `businessQualityGraded` with the composite's floor rule. The audit table (`src/report/auditTables.ts:70`) keeps the recorded band, as it does for the valuation half (the audit export is the full record).
- [ ] **Step 4: Run it.** PASS. Re-run `npx vitest run tests/report.compositeEvidenceFloor.test.ts tests/report.schema.test.ts tests/report.presentation.d67.test.ts tests/report.versionStamps.test.ts` → PASS (the schema field is optional, so `fixtures/report/DEMO-sample.json` still parses).
- [ ] **Step 5: Benefit check.** The probe's assertions hold for both the live line and the Markdown. Stored reports 43-52 render the same line before and after (field absent; all above the floor anyway). DEMO gains one leaf (`scores.assessments.businessQuality.evidenceCompleteness`), grouped in Task 27.
- [ ] **Step 6: Docs.** METHODOLOGY assessment split: "Business quality shows its letter only when the business aspects carry at least half of their route-applicable evidence, the same floor as the composite."
- [ ] **Step 7: Commit.** `git add src/pipeline/stageB/grading.ts src/report/schema.ts src/report/presentation.ts src/components/report/DossierCover.tsx docs/METHODOLOGY.md tests/report.assessment.test.ts` then `git commit -m "Withhold the business-quality letter under the evidence floor (RPT-101)"`.

### Task 22: The peer row's Company figure uses the issuer-common capitalization the multiples use (FIN-504)

Round 4. Runs after Tasks 18 and 19 (the same `peers.ts` methodology strings).

**Files:**
- Modify: `src/pipeline/peers.ts:45-52` (`PeerCoverage.comparisons[]` gains `currentWithheldReason?: string`), `peers.ts:278` (resolve the subject's scope once, right after `currency`), `peers.ts:319` (comparison-time size screen), `peers.ts:391-393` (the Company figure), `peers.ts:268` (append one sentence to that methodology string; no new array element)
- Modify: `src/report/schema.ts:1181-1184` (`currentWithheldReason: z.string().optional()` on the strict comparison row; legacy reports parse unchanged)
- Modify: `src/report/researchReview.ts:69` (audit line) and `:113` (classic table cell)
- Modify: `src/pipeline/stageC/payload.ts:1159` (the comparison's note names the withheld reason)
- Modify: `docs/METHODOLOGY.md:1260-1265` (peer comparison definitions)
- Test: `tests/pipeline.peers.test.ts` (new `describe("subject capitalization scope in the peer row")`) and one new `it` in `tests/stageC.payload.passes.test.ts`'s "payload determinism + provenance" describe

**Interfaces:**
- Consumes:
  - `resolveEconomicEquityScope(quote, evidence, asOf): EconomicEquityScope` (`src/pipeline/stageB/securityBasis.ts:81`). It is called exactly as `multiplesFramework` calls it (`valuation.ts:4064`): `resolveEconomicEquityScope(subject.quote, subject.economicShareEvidence ?? [], subject.securityBasisAsOf ?? "")`.
  - The scope inputs `compute.ts` already puts on the inputs object before `comparePeerFundamentals` runs (`compute.ts:3532-3542`, `:3717-3718`). There is no new parameter and no new provider call.
- Produces:
  - `PeerCoverage["comparisons"][number].currentWithheldReason?: string` in `peers.ts` and `PeerCoverageSchema`.
  - Subject exclusion `{ symbol, reason: "Company figure withheld: <scope.basis>" }`.
  - Company figure `subjectCap / subjectCommon.value`, where `subjectCap` is `scope.marketCap` for `resolved` and `unverified-vendor-scope` and null for `unresolved`.
  - Size screen on `scope.status === "resolved" ? scope.marketCap : subject.quote.marketCap` (OD-15).

- [ ] **Step 1: Write the failing test.** The test is seeded from `probes/FIN-504.probe.ts`. The probe replays the NVDA #50 snapshot with a two-class 10-Q sentence injected; that is tmp data, so here it becomes the synthetic helpers of `tests/pipeline.peers.test.ts:9-47` (`subject()`, `candidate()`, `run()`; common earnings 4 × 25 = 100, quote cap 1,000). The test adds an `EconomicShareEvidence` built like `tests/stageB.economicShareScope.test.ts:28-37`.
  ```ts
  describe("subject capitalization scope in the peer row", () => {
    const four = () => ({ P2: candidate("P2", 1000), P3: candidate("P3", 1500), P4: candidate("P4", 2000), P5: candidate("P5", 2500) });
    const unresolvedTarget = () => { const t = subject(); t.quote = { ...t.quote, marketCapSecurityBasis: "unresolved",
      marketCapScopeEvidence: { reason: "The retained 10-Q names Class A and Class B common stock.", sourceIds: ["edgar:10-Q:capital"] } }; return t; };
    const twoClass = (): EconomicShareEvidence => ({ issuerId: "1", securityId: "ROOT", asOf: "2026-06-30", filed: "2026-08-01",
      effectiveFrom: "2026-06-30", effectiveTo: null, complete: true, sourceIds: ["filing:share-capital"], sourceHash: "synthetic-hash",
      classes: [
        { classId: "ROOT", shares: 100, countBasis: "outstanding", economicUnitsPerQuotedShare: 1, priceBasis: "quoted-market-price" },
        { classId: "ROOT-B", shares: 20, countBasis: "outstanding", economicUnitsPerQuotedShare: 1, priceBasis: "economic-equivalence-proxy" },
      ] });
    it("withholds the Company figure under an unresolved scope and keeps the peer median as context", () => {
      const target = unresolvedTarget();
      const result = run(four(), target);
      // precondition: the framework withholds every cap multiple on the same inputs
      expect(multiplesFramework("general", { ...target, ...result }).multiples.find((m) => m.key === "priceToBook")?.current ?? null).toBeNull();
      const row = result.peerCoverage.comparisons[0];
      expect(row.current).toBeNull();                                             // HEAD: 10
      expect(row.currentWithheldReason).toMatch(/^Issuer-common economic share scope unresolved.*Class A and Class B/);
      expect(row).toMatchObject({ peerMedian: 17.5, peerCount: 4 });
      expect(result.peerCoverage.exclusions).toContainEqual({ symbol: "ROOT", reason: expect.stringMatching(/^Company figure withheld: Issuer-common economic share scope unresolved/) });
    });
    it("uses the framework's issuer-common scope for the Company figure and the size screen", () => {
      const target = subject();
      target.quote = { ...target.quote, priceAsOf: "2026-10-13", issuerId: "1", securityId: "ROOT", marketCapSecurityBasis: "quoted-security" };
      target.securityBasisAsOf = "2026-10-13";
      target.economicShareEvidence = [twoClass()];                                // class sum 100 × 10 + 20 × 1 × 10 = 1,200
      const result = run({ ...four(), P6: candidate("P6", 11) }, target);
      expect(result.peerCoverage.comparisons[0].current).toBeCloseTo(12, 10);    // HEAD: 10 on the quote cap
      expect(result.peerCoverage.comparisons[0].currentWithheldReason).toBeUndefined();
      // 11 against 1,200 is outside the 100× band; against the quote cap 1,000 it was inside (HEAD admits P6)
      expect(result.peerCoverage.exclusions.find((e) => e.symbol === "P6")?.reason).toMatch(/^size screen: .*outside the 100× comparable-size band/);
    });
    it("control: an unverified vendor scope keeps the quote cap, as at HEAD", () => {
      expect(run(four()).peerCoverage.comparisons[0]).toMatchObject({ current: 10, peerMedian: 17.5, peerCount: 4 });
    });
    it("the classic peer table prints 'withheld', the audit line names the reason, and a legacy row renders as before", () => {
      const peers = run(four(), unresolvedTarget()).peerCoverage;
      const table = valuationReviewBlocks({ peerCoverage: peers, symbol: "ROOT" }).find((b) => b.title === "Peer comparison coverage")!.table!;
      expect(table.rows[0]).toEqual(["Market cap / TTM common earnings", "withheld", "17.5×", "4"]);
      expect(peerCoverageAuditLines(peers).join(" ")).toMatch(/company withheld \(Issuer-common economic share scope unresolved/);
      const legacy = { ...peers, comparisons: [{ name: "Market cap / TTM common earnings", current: null, peerMedian: 17.5, peerCount: 4, basis: "stored" }] };
      expect(valuationReviewBlocks({ peerCoverage: legacy, symbol: "ROOT" }).find((b) => b.title === "Peer comparison coverage")!.table!.rows[0][1]).toBe("n/m");
    });
  });
  ```
  In `tests/stageC.payload.passes.test.ts`, the new test `it("names a withheld peer Company figure beside its null figure")` copies the test at `:485-499`. It sets `comparisons: [{ name: "Market cap / TTM common earnings", current: null, currentWithheldReason: "Issuer-common economic share scope unresolved: synthetic.", peerMedian: 15, peerCount: 4, basis: "b" }]`, then expects the section's figure values to equal `[null, 15, 4]` and its notes to contain "Company figure withheld: Issuer-common economic share scope unresolved: synthetic.". **B3 rebase (review round 4).** B3's Task 2 (AI-102, merged before B6) moves every peer exclusion out of the "Comparable peers (computed)" notes into the untrusted `payload.peerScreen` envelope, and rewrites the `:485-499` test this one copies. So copy B3's version of that test, not HEAD's. Assert the "Company figure withheld" text in the computed section's notes, on the comparison line. Also assert that the subject's own exclusion ("ROOT: Company figure withheld: …", when the test supplies one) is in `payload.peerScreen?.notes` and not in the computed section. This is why the `payload.ts` comparison-line change is needed at all: after B3, the exclusion no longer sits beside the null figure. (`EconomicShareEvidence` is imported from `@/pipeline/stageB/securityBasis`; `valuationReviewBlocks` and `peerCoverageAuditLines` are imported from `@/report/researchReview`.)
- [ ] **Step 2: Run it.** `npx vitest run tests/pipeline.peers.test.ts -t "subject capitalization scope"` → FAIL with `expected 10 to be null`, `expected 10 to be close to 12`, and a `toMatch` failure on `undefined` for P6's reason (HEAD admits P6, because 11 is within 100× of the quote cap 1,000). Then `npx vitest run tests/stageC.payload.passes.test.ts -t "withheld peer Company figure"` → FAIL: notes do not contain "Company figure withheld". The type error for the unknown `currentWithheldReason` key is expected until Step 3.
- [ ] **Step 3: Implement.**
  - In `comparePeerFundamentals`, after `currency`, compute `const scope = resolveEconomicEquityScope(subject.quote, subject.economicShareEvidence ?? [], subject.securityBasisAsOf ?? "")`, `subjectCap`, `sizeCap` and `const scopeWithheld = scope.status === "unresolved" ? scope.basis : null`.
  - When `scopeWithheld` is set and `commonValid`, push the subject exclusion once.
  - `peerSizeExclusion(sizeCap, peerQuote.marketCap)` replaces `peerSizeExclusion(subject.quote.marketCap, …)`.
  - The comparison row's `current` is `commonValid && subjectCap !== null ? subjectCap / subjectCommon.value : null`, plus `...(commonValid && scopeWithheld ? { currentWithheldReason: scopeWithheld } : {})`. `peerMedian` and `peerCount` are unchanged.
  - Append to the methodology string at `:268`: " The company figure's market capitalization is the issuer-common one the multiples use: the class sum where the share classes are established, the provider's cap where its scope is only unverified, and none where the scope is unresolved; the peer median is then still shown as context (B-8)."
  - `researchReview.ts:113`: the cell is `row.current === null && row.currentWithheldReason ? "withheld" : formatMultiple(row.current)`. `:69` reads `company ${row.currentWithheldReason ? `withheld (${row.currentWithheldReason})` : formatMultiple(row.current)}`.
  - `payload.ts:1159` appends `${comparison.currentWithheldReason ? ` Company figure withheld: ${comparison.currentWithheldReason}` : ""}` to the comparison's note. After the B3 rebase this is the comparison line B3 leaves in the computed section (B3 Task 2 splits the notes), not the exclusion lines it moves to `peerScreen`.
- [ ] **Step 4: Run it.** Same commands → PASS. Re-run `npx vitest run tests/pipeline.peers.test.ts tests/stageB.economicShareScope.test.ts tests/multiples.basisLabel.audit20261022.test.ts tests/report.schema.test.ts tests/report.presentation.d62.test.ts` → PASS: every existing peers fixture has an unverified vendor scope, so its rows are unchanged. `tests/stageC.payload.passes.test.ts`: the new test passes, and the golden pins fail only on fingerprint, promptBytes and hashes, because the methodology sentence reaches every payload (re-pinned in Task 26).
- [ ] **Step 5: Benefit check.**
  - The probe's failing assertion (peer row Company figure null under the two-class scope) holds in Task 31's replay of the NVDA #50 snapshot with the probe's injected sentence (in memory only). Its control (stored scope `unverified-vendor-scope`, Company figure 26.989) holds on the plain snapshot.
  - Must NOT move: every single-class run's Company figure (NVDA #48-#50: 26.989), every peer median and count, and the DEMO fixture's comparisons (it has none; only its methodology leaf moves, Task 27).
  - Stored reports: none is affected (`storedReportImpact: none`). Stored META #44/#45 carry an unresolved scope but never reached the peer row ("subject balance: filing date unavailable"); the disposition note records the grep.
- [ ] **Step 6: Docs.** `docs/METHODOLOGY.md` after line 1263 ("never silently combined."): "The company's own figure uses the issuer-common market capitalization the multiples use (B-8): the class sum when the share classes are established, the provider's cap when its scope is unverified, and none when the scope is unresolved, when the row reads withheld with the reason and the peer median is still shown as context. The comparison's size screen uses the class sum when it is established, else the provider's cap."
- [ ] **Step 7: Commit.** `git add src/pipeline/peers.ts src/report/schema.ts src/report/researchReview.ts src/pipeline/stageC/payload.ts docs/METHODOLOGY.md tests/pipeline.peers.test.ts tests/stageC.payload.passes.test.ts` then `git commit -m "Use the issuer-common capitalization for the peer row's company figure (FIN-504)"`.

### Task 23: One gain test for both sides of the peer comparison (FIN-503)

Round 4. Depends on Task 22 (`currentWithheldReason`).

**Files:**
- Modify: `src/pipeline/stageB/valuation.ts:3691-3692` (new exported helper beside `GAIN_INFLATED_NON_OPERATING_SHARE`) and `valuation.ts:4614-4618` (the subject's test calls the helper; same result)
- Modify: `src/pipeline/peers.ts:237-255` (`commonIncome` also returns the four quarters' non-operating share), `peers.ts:299-304` (the subject's share), `peers.ts:344-352` (a failing peer is excluded before `commonValues.push` and `multiples.peTtm`), `peers.ts:391-394` (a failing subject's Company figure is withheld; the withheld-median line names the gain exclusions), `peers.ts:269` (append one sentence to that methodology string)
- Modify: `docs/METHODOLOGY.md:1211-1217` (the D-98 paragraph) and `:1260-1265` (peer comparison definitions)
- Test: `tests/pipeline.peers.test.ts` (new `describe("one gain test for both sides of the peer comparison")`)

**Interfaces:**
- Produces:
  - `export function nonOperatingShareOfPretax(pretax: unknown, operating: unknown): number | null`. It returns `(pretax − operating) / pretax` when both are finite and `pretax > 0`, else null.
  - `commonIncome(...)` returns `{ value; date; reason; nonOperatingShare: number | null }`. The share is null when any of the four quarters lacks a finite `incomeBeforeTax` or `operatingIncome`, or when the summed pre-tax income is not positive.
  - Peer exclusion reason: `common earnings: non-operating income <p>% of trailing pre-tax income (above 25%, house rule D-98): its trailing earnings rest on gains, not operations, so it is left out of the common-earnings and P/E medians`, with `<p>` at one decimal.
  - Subject `currentWithheldReason` and exclusion: `non-operating income <p>% of the subject's trailing pre-tax income (above 25%, house rule D-98): its earnings rest on gains, so its market cap / common earnings is not compared with peers, as its P/E is not ranked against its own history`. When Task 22's scope reason also applies, the two reasons are joined with "; ".
  - The withheld-median methodology line gains ` and the D-98 gain test (<symbol>: non-operating income <p>%, …)` only when a gain exclusion occurred, so every existing line keeps its text.
- Consumes: `GAIN_INFLATED_NON_OPERATING_SHARE` (`valuation.ts:3692`); Task 22's `currentWithheldReason`.

- [ ] **Step 1: Write the failing test.** The test is seeded from `probes/FIN-503.probe.ts`. The probe replays the real NVDA #50 snapshot (MRVL 48.4% non-operating), which is tmp data and is never copied into `tests/`; here it becomes synthetic peers in the `tests/pipeline.peers.test.ts:37-47` shape with per-quarter pre-tax and operating income added.
  ```ts
  describe("one gain test for both sides of the peer comparison", () => {
    const incomeRows = (c: PeerFundamentals) => (c.incomeQuarterly.ok ? c.incomeQuarterly.value.data.rows : []);
    const earning = (c: PeerFundamentals, pretax: number, operating?: number): PeerFundamentals => ({ ...c,
      incomeQuarterly: data(incomeRows(c).map((r) => ({ ...r, incomeBeforeTax: pretax, ...(operating === undefined ? {} : { operatingIncome: operating }) }))) });
    const clean = (s: string, mcap: number) => earning(candidate(s, mcap), 30, 28);            // 6.7% non-operating
    const runSubject = (subjectIncome: PeerFundamentals["incomeQuarterly"], candidates: Record<string, PeerFundamentals>) =>
      comparePeerFundamentals({ symbol: "ROOT", profile, quote, route: "general", subject: subject(), now: NOW,
        subjectIncomeQuarterly: subjectIncome, subjectBalanceQuarterly: candidate("ROOT").balanceQuarterly,
        collection: { candidates, candidateCount: Object.keys(candidates).length, exclusions: [], notes: [] } });
    it("leaves a gain-carried peer out of the common-earnings and P/E medians, with the reason", () => {
      const result = run({ P2: clean("P2", 1000), P3: clean("P3", 1500), P4: clean("P4", 2000), P5: clean("P5", 2500), P6: earning(candidate("P6", 3000), 30, 15) });
      expect(result.peerCoverage.comparisons[0]).toMatchObject({ current: 10, peerMedian: 17.5, peerCount: 4 }); // HEAD: 20 over five
      expect(result.peerCoverage.exclusions.find((e) => e.symbol === "P6")?.reason).toMatch(/^common earnings: non-operating income 50\.0% of trailing pre-tax income \(above 25%, house rule D-98\)/);
      const computed = multiplesFramework("general", { ...subject(), ...result });
      expect(computed.multiples.find((m) => m.key === "peTtm")?.peers?.median).toBe(17.5);       // HEAD: 20
      expect(computed.multiples.find((m) => m.key === "priceToBook")?.peers?.count).toBe(5);     // control: P/B still counts P6
    });
    it("withholds the median when the gain test leaves three peers (the NVDA #50 shape)", () => {
      const result = run({ P2: clean("P2", 1000), P3: clean("P3", 1500), P4: clean("P4", 2000), P5: earning(candidate("P5", 2500), 30, 15) });
      expect(result.peerCoverage.comparisons[0]).toMatchObject({ current: 10, peerMedian: null, peerCount: 3 }); // HEAD: 17.5 over four
      expect(result.peerCoverage.methodology.join(" ")).toMatch(/Common-earnings median withheld: 3 eligible peers .*D-98 gain test \(P5: non-operating income 50\.0%/);
    });
    it("withholds a gain-carried subject's Company figure and keeps the median as context", () => {
      const result = runSubject(earning(candidate("ROOT"), 30, 10).incomeQuarterly, { P2: clean("P2", 1000), P3: clean("P3", 1500), P4: clean("P4", 2000), P5: clean("P5", 2500) });
      const row = result.peerCoverage.comparisons[0];
      expect(row).toMatchObject({ current: null, peerMedian: 17.5, peerCount: 4 });              // HEAD: current 10
      expect(row.currentWithheldReason).toMatch(/^non-operating income 66\.7% of the subject's trailing pre-tax income \(above 25%, house rule D-98\)/);
    });
    it("applies the D-98 line to peers at its boundaries", () => {
      const count = (pretax: number, operating?: number) => run({ P2: clean("P2", 1000), P3: clean("P3", 1500), P4: clean("P4", 2000),
        P5: earning(candidate("P5", 2500), pretax, operating) }).peerCoverage.comparisons[0].peerCount;
      expect(count(40, 30)).toBe(4);         // exactly 25%: kept (strictly above excludes, as valuation.ts:4619)
      expect(count(40, 29.996)).toBe(3);     // 25.01%: excluded
      expect(count(-5, 10)).toBe(4);         // pre-tax not positive: the test does not run, kept
      expect(count(30)).toBe(4);             // no operating income in the quarters: the test does not run, kept, as for the subject
      expect(count(20, 30)).toBe(4);         // non-operating loss: kept (D-98 flags gains only)
      expect(nonOperatingShareOfPretax(100, 70)).toBeCloseTo(0.3, 12);
      expect(nonOperatingShareOfPretax(0, 10)).toBeNull();
      expect(nonOperatingShareOfPretax(100, null)).toBeNull();
    });
    it("control: peers whose rows carry no pre-tax or operating income keep today's medians", () => {
      expect(run({ P2: candidate("P2", 1000), P3: candidate("P3", 1500), P4: candidate("P4", 2000), P5: candidate("P5", 2500) }).peerCoverage.comparisons[0])
        .toMatchObject({ current: 10, peerMedian: 17.5, peerCount: 4 });
    });
  });
  ```
  (Five peers at 10, 15, 20, 25 and 30× pass the 1.5×IQR rule at HEAD: q1 15, q3 25, bounds 0 to 40. `nonOperatingShareOfPretax` is imported from `@/pipeline/stageB/valuation`.)
- [ ] **Step 2: Run it.** `npx vitest run tests/pipeline.peers.test.ts -t "one gain test"` → FAIL. The expected messages are `expected { …(5) } to match object { current: 10, peerMedian: 17.5, peerCount: 4 }` (HEAD median 20 over five peers), `expected 17.5 to be null` (the three-peer case), `expected 10 to be null` (the subject case) and `nonOperatingShareOfPretax is not a function`.
- [ ] **Step 3: Implement.**
  - Add the helper. Rewrite `valuation.ts:4614-4618` as `const share = nonOperatingShareOfPretax(pretaxTtm, operatingTtm); if (share !== null) { … }`, with the same branch body; the subject's result is unchanged for every input.
  - In `commonIncome`, sum `number(row.incomeBeforeTax)` and `number(row.operatingIncome)` over the same `inc` rows (any null makes the share null).
  - In the peer loop, insert `else if (commonEligible && common.value !== null && isGainInflated(common.nonOperatingShare)) exclude(peerSymbol, <reason>)` before the branch that pushes `commonValues` and sets `multiples.peTtm`. The peer is still pushed to `peers` for P/B and P/TBV.
  - For the subject, `const gainWithheld = isGainInflated(subjectCommon.nonOperatingShare) ? <reason> : null` feeds the Company figure exactly as Task 22's `scopeWithheld` does. Build one list, `const withheld = [scopeWithheld, gainWithheld].filter(Boolean)`. When it is non-empty and `commonValid`, the row's `current` is null, `currentWithheldReason` is `withheld.join("; ")`, and Task 22's single subject exclusion becomes `Company figure withheld: ${withheld.join("; ")}`. So a subject failing both tests gets one exclusion, not two.
  - Add one case to the subject test, giving `runSubject` an optional third argument `target = subject()` that it passes as `subject`. Task 22's `unresolvedTarget()` (hoist it from Task 22's `describe` to file scope) with the gain-carried quarters (`earning(candidate("ROOT"), 30, 10)`) gives `currentWithheldReason` matching `/^Issuer-common economic share scope unresolved.*; non-operating income 66\.7%/`, and exactly one ROOT exclusion that starts "Company figure withheld:".
  - Record the gain exclusions in a local list that the withheld-median line reads.
  - `isGainInflated = (s) => s !== null && s > GAIN_INFLATED_NON_OPERATING_SHARE` is local to `peers.ts`.
  - Append to the methodology string at `:269`: " A peer whose four trailing quarters' non-operating income (pre-tax less operating income) exceeds 25% of positive pre-tax income is left out of the common-earnings and P/E medians, and a subject that fails the same test gets no company figure (house rule D-98); the test runs only where every quarter carries pre-tax and operating income, as for the subject's own P/E."
- [ ] **Step 4: Run it.** PASS. Re-run `npx vitest run tests/pipeline.peers.test.ts tests/stageB.valuation.test.ts tests/multiples.basisLabel.audit20261022.test.ts tests/audit.valuationEvidence.test.ts tests/stageB.economicShareScope.test.ts` → PASS. The AMZN gain-inflated pins (D-98) are unchanged, because the helper returns the same share. The existing peers fixtures carry no `incomeBeforeTax`, so their medians are unchanged. The payload golden moves as in Task 22 (methodology text only; Task 26).
- [ ] **Step 5: Benefit check.**
  - The probe's failing assertion (`published.peerMedian` equals the median recomputed without the failing peers) holds in Task 31's replays of snapshots #48, #49 and #50. Both medians are null: MRVL is excluded at 48.4%, which leaves three peers. Its setup guards hold: the subject NVDA carries no gain flag, so its Company figure stays 26.989; AMD (14.2%), AVGO (−6.5%) and QCOM (8.9%) are kept.
  - Must NOT move: the P/B and P/TBV peer medians of those replays (MRVL still counts there), AMZN #43's peer row (its snapshot has one candidate, EBAY, and the stored row reads current null, median null, 0 peers), and every run whose peers pass the test.
  - Stored reports NVDA #47, #49, #50 and #52 keep "59.3×" over four peers. This needs reinterpretation, but no display-time rule is possible: a stored report keeps neither the peers' quarterly pre-tax income nor their operating income. These reports are read under their own spec stamp (`schema.ts:55-63`, the house mechanism), and the disposition note names the four reports and the replayed outcome (withheld).
- [ ] **Step 6: Docs.**
  - `docs/METHODOLOGY.md` after line 1217 ("(October 20, 2026)").") gets: "The same test is applied on both sides of the peer comparison: a peer whose four trailing quarters fail it is left out of the common-earnings and P/E medians with the share named, and a subject that fails it gets no company figure in the peer row. A median still needs four peers that pass; the test runs only where every quarter carries pre-tax and operating income, as for the subject."
  - At 1260-1265, after Task 22's sentence: "Peer earnings carried by gains are excluded, not adjusted: the bounded peer fetch has no item-level one-off evidence to adjust them with."
- [ ] **Step 7: Commit.** `git add src/pipeline/stageB/valuation.ts src/pipeline/peers.ts docs/METHODOLOGY.md tests/pipeline.peers.test.ts` then `git commit -m "Apply the gain-inflated earnings test to both sides of the peer comparison (FIN-503)"`.

### Task 24: The P/E is ranked on the construction of its own history (FIN-505)

Round 4. It is independent of Tasks 22 and 23, but runs after Tasks 2, 4 and 5 (also `valuation.ts`).

**Files:**
- Modify: `src/pipeline/stageB/valuation.ts:3618-3642` (`OwnHistoryBand.rankedCurrent?`), `valuation.ts:4377-4384` (hoist the construction passed to `deriveOwnHistory` into `const peHistoryConstruction`), `valuation.ts:4478-4498` (the history loop records which keys took the derived series, and the peTtm basis names the ranked figure), `valuation.ts:4604-4606` (rank the history's construction), `valuation.ts:4630-4635` (the "rank unavailable" note names a withheld common income)
- Modify: `src/pipeline/stageB/scoringEvidence.ts:216-236` (the `peOwnHistoryRank` driver's fallback reason names the ranked figure)
- Modify: `docs/METHODOLOGY.md:1190-1217` (own-history rank paragraph) and `:1260-1263`
- Test: `tests/stageB.peRankConstruction.audit20261027.test.ts` (new); one new `it` in `tests/stageB.scoringEvidence.test.ts`

**Interfaces:**
- Produces:
  - `OwnHistoryBand.rankedCurrent?: { value: number | null; construction: "capitalization-common-income" }`. It is set only on `peTtm`, when the current P/E is price / diluted EPS and the band is the derived `capitalization-common-income` history. It is absent on every other band and on legacy objects. It is not added to the report schema: the report reads the rank (`own5yPercentile`) and the basis (`ownHistoryBasis`), and both already exist.
  - Basis sentence with a value: ". Rank construction: the P/E shown is price / diluted EPS; it is ranked as market cap / common income (<fmtNum(v)>x), the construction of every window in this history, because the diluted share count behind EPS and the outstanding count behind market cap differ".
  - Basis sentence with null: ". Not ranked: common income is withheld (<capital.incomeWithheldReason>), and price / diluted EPS is a different construction from this market cap / common income history".
- Consumes: `capital.commonIncome` and `capital.incomeWithheldReason` (`valuation.ts:4120`), `mcap` (`valuation.ts:4066`), `safeDiv`, `posOrNull`, `fmtNum`.

- [ ] **Step 1: Write the failing test.** File `tests/stageB.peRankConstruction.audit20261027.test.ts`. It is seeded from `probes/FIN-505.probe.ts` part 2, a hand-built and wholly synthetic `MultiplesFrameworkInputs` issuer: 24 quarter ends to 2026-06-30, net income 5 a quarter (TTM 20), price 50, market cap 500 (25×), and 21 EV rows whose market cap / TTM income runs 29.75 down to 19.75, so the retained 20 have median 25. `issuer(dil, income = {})` sets `epsDiluted = 20 / (10 × dil)` and spreads `income` into `incomeTtm`. Part 1 (the NVDA #50 replay) is the benefit check in Task 31, not a committed test.
  ```ts
  const pe = (i: MultiplesFrameworkInputs) => multiplesFramework("general", i).multiples.find((m) => m.key === "peTtm")!;
  it("ranks the history's construction whatever the diluted count", () => {
    const p = pe(issuer(1.04));
    expect(p.basis).toMatch(/^price \/ epsDiluted/);
    expect(p.current).toBeCloseTo(26, 10);                                   // the P/E shown is unchanged
    expect(p.ownHistory!.p50).toBeCloseTo(25, 9);
    expect(p.ownHistory!.percentileRank).toBeCloseTo(50, 6);                 // HEAD: 60.526
    expect(p.ownHistory!.rankedCurrent).toEqual({ value: 25, construction: "capitalization-common-income" });
    expect(p.ownHistory!.basis).toMatch(/ranked as market cap \/ common income \(25x\)/);
  });
  it("with common income withheld the P/E is not ranked, and EV/EBITDA's band is untouched", () => {
    const withheld = issuer(1.04, { commonIncomeWithheldReason: "synthetic: common earnings allocation unavailable" });
    const p = pe(withheld);
    expect(p.current).toBeCloseTo(26, 10);
    expect(p.ownHistory!.percentileRank).toBeNull();
    expect(p.ownHistory!.rankedCurrent).toEqual({ value: null, construction: "capitalization-common-income" });
    expect(multiplesFramework("general", withheld).notes.join(" ")).toMatch(/peTtm: .*not ranked: common income is withheld/);
    const ev = (i: MultiplesFrameworkInputs) => multiplesFramework("general", i).multiples.find((m) => m.key === "evToEbitda")!.ownHistory;
    expect(ev(withheld)).toEqual(ev(issuer(1.04)));
  });
  it("controls: equal counts rank 50 as at HEAD; a P/E already on market cap / common income and a vendor P/E history carry no rankedCurrent", () => {
    expect(pe(issuer(1)).ownHistory!.percentileRank).toBeCloseTo(50, 6);
    const noEps = pe(issuer(1.04, { epsDiluted: null }));
    expect(noEps.basis).toMatch(/^marketCap \/ common income/);
    expect(noEps.ownHistory!.rankedCurrent).toBeUndefined();
    expect(noEps.ownHistory!.percentileRank).toBeCloseTo(50, 6);
    const vendorRows = Array.from({ length: 8 }, (_, i) => ({ date: `2025-0${i + 1}-28`, priceToEarningsRatio: 22 + i }));
    const vendor = pe({ ...issuer(1.04), quarterlyFundamentals: [], enterpriseValuesHistory: [], keyMetricsHistory: vendorRows as never });
    expect(vendor.ownHistory!.rankedCurrent).toBeUndefined();
    expect(vendor.ownHistory!.percentileRank).toBe(percentileRank(vendorRows.map((r) => r.priceToEarningsRatio), vendor.current!));
  });
  ```
  The new test in `tests/stageB.scoringEvidence.test.ts`, `it("names the figure a P/E own-history rank ranks")`, follows the pattern at `:81-94`. It sets `i.valuation.multiples.multiples = [{ key: "peTtm", current: 26, basis: "price / epsDiluted (TTM)", peers: null, ownHistory: { percentileRank: 50, observations: 20, basis: "test", p5: null, p25: null, p50: 25, p75: null, p95: null, rankedCurrent: { value: 25, construction: "capitalization-common-income" } } }]`. It expects `describeScoreEvidence(i, "valuation", "peOwnHistoryRank").fallbackReason` to match `/ranked as market cap \/ common income 25x, the construction of its history; the P\/E shown is price \/ diluted EPS/`, and `operand(result, "peTtm current multiple").value` to stay 26.
- [ ] **Step 2: Run it.** `npx vitest run tests/stageB.peRankConstruction.audit20261027.test.ts` → FAIL: `expected 60.52631578947371 to be close to 50` and `expected undefined to deeply equal { value: 25, construction: 'capitalization-common-income' }`. `npx vitest run tests/stageB.scoringEvidence.test.ts -t "names the figure"` → FAIL on the fallback reason.
- [ ] **Step 3: Implement.**
  ```ts
  const peHistoryConstruction = requiresHistoricalClassScope && price !== null && eps !== null ? "price-eps" : "capitalization-common-income";
  // deriveOwnHistory(..., peHistoryConstruction) as today; the history loop adds `derivedHistoryKeys.add(key)` in its derived branch.
  const peRankedCurrent = price !== null && eps !== null && peHistoryConstruction === "capitalization-common-income" && derivedHistoryKeys.has("peTtm")
    ? { value: safeDiv(mcap, posOrNull(capital.commonIncome)), construction: "capitalization-common-income" as const } : null;
  // band for peTtm: bandFor(history.peTtm, peRankedCurrent ? peRankedCurrent.value : cur, basis + sentence, details), then { ...band, rankedCurrent: peRankedCurrent }
  ```
  - The D-98 gain flag still reads `pe.current` (price / EPS), unchanged.
  - The note at `:4634` says "not ranked: common income is withheld" when `rankedCurrent.value` is null, instead of "current multiple is unavailable".
  - `scoringEvidence.ts`: when the selected stat is `peTtm` and its `ownHistory.rankedCurrent?.value` is a number, add "P/E ranked as market cap / common income <v>x, the construction of its history; the P/E shown is price / diluted EPS." to `fallbackReason`, formatted as the existing operands are.
- [ ] **Step 4: Run it.** PASS. Re-run `npx vitest run tests/stageB.valuation.test.ts tests/stageB.ownHistoryProvenance.test.ts tests/stageB.economicShareScope.test.ts tests/stageB.grading.test.ts tests/stageB.scoringEvidence.test.ts tests/audit.valuationEvidence.test.ts tests/valuationEvidence.test.ts tests/research.routePanel.test.ts tests/audit.scoringSensitivity.test.ts tests/audit.crossCompanyCoverage.test.ts tests/adbeReportAudit.regressions.test.ts tests/multiples.basisLabel.audit20261022.test.ts tests/audit.issuerPipeline.test.ts`.
  - A pinned P/E `percentileRank`, valuation score or composite moves only on a fixture whose price / diluted EPS differs from its market cap / common income. Re-pin each one to the same-construction value, with the comment "D-next (FIN-505): ranked as market cap / common income, the history's construction". Never loosen a tolerance.
  - A pin on a fixture where the two constructions are equal must not move. A keyless issuer whose P/E is on a four-quarter TTM must not move: no fourth-quarter EPS is derived (B4-4), so its current P/E is already market cap / common income. The exception (review round 4) is a run whose `incomeTtm` is the fiscal-year fallback (`basis: "annual"`). That row carries the 10-K's diluted EPS (`compute.ts:3597`, `epsDiluted: num(inc0.epsDiluted)`), so its P/E is price / FY diluted EPS in a TTM-window history. Its rank moves under this task, and that is intended. Name it in the re-pin comment, and treat it as a bug only if its price / EPS equals its market cap / common income.
  - A pin that moves without that difference is a bug.
- [ ] **Step 5: Benefit check.**
  - Probe part 2's failing assertion (rank 50) now holds and its preconditions (basis `price / epsDiluted`, p50 25) still hold.
  - Probe part 1, replayed in Task 31 on snapshots #48-#50: the NVDA P/E rank moves 1.685 → 1.484, equal to the probe's `rankSameConstruction`. Record the valuation aspect score and the composite before and after (the band at a rank this low may leave the score unchanged). MU #46: record the rank (24.33 at HEAD) before and after.
  - Reader-facing consequence, named in the PR: the multiples table shows the P/E as price / diluted EPS (26.0× in the synthetic case) beside history observations and a median built as market cap / common income (25×), so the shown P/E can sit above its history median while its rank reads 50. That gap is the bias this task stops grading. The basis sentence is the disclosure, and the rank row must carry it on every surface that prints `ownHistoryBasis`.
  - Must NOT move: the P/E value shown on every report; AMZN #43's graded signal in the HEAD replay (its P/E is gain-inflated and not ranked under D-98; record the band rank anyway); every keyless replay (FCX, PGR, O, SNOW, NNN) whose P/E is on a four-quarter TTM (an annual-basis fallback moves, Step 4); price-eps and vendor-history ranks; the DEMO fixture (its P/E has no own history: `ownHistory: null` in `tests/fixtures/audit-baseline-stageb-report.json`).
  - Stored reports with a P/E rank on price / diluted EPS in a derived history (AMZN #43, MU #46, NVDA #47-#50 and #52) keep their stored rank and grade. This needs reinterpretation, but no display rule applies: re-ranking at display time would contradict the stored valuation grade. They are read under their own stamps. SCHW #39-#41 carry a P/E rank but no recorded basis, so their construction is not determinable from their bytes, and the disposition note says so.
- [ ] **Step 6: Docs.**
  - `docs/METHODOLOGY.md` after line 1209 ("call it a percentile either.") gets: "The P/E is ranked on the construction of its history. For a single-class issuer every window is market cap / common income, so the current P/E, shown as price / diluted EPS, is ranked as the current market cap / common income: the two differ by the gap between the diluted share count and the outstanding count. The history basis names the ranked figure. With common income withheld the P/E is not ranked and the grade takes EV/EBITDA, then Price/FCF. A multi-class issuer whose history is price / quoted-unit EPS (B-8) and a vendor P/E history keep ranking price / EPS."
  - Line 1262 ("never silently combined"): add "in a peer median or an own-history rank".
- [ ] **Step 7: Commit.** `git add src/pipeline/stageB/valuation.ts src/pipeline/stageB/scoringEvidence.ts docs/METHODOLOGY.md tests/stageB.peRankConstruction.audit20261027.test.ts tests/stageB.scoringEvidence.test.ts <re-pinned test files by name>` then `git commit -m "Rank the P/E on the construction of its own history (FIN-505)"`.

### Task 25: Version stamps and the stamp test

**Files:**
- Modify: `src/pipeline/runInputSnapshot.ts:30` (`STAGE_B_IMPLEMENTATION_VERSION` → the next `STAGE_B_2026_10_ACCOUNTING_EVIDENCE_<n+1>` after main's value at rebase time; `_27` at HEAD, so `_28` unless main moved)
- Modify: `src/pipeline/stageC/payload.ts:421` (`PAYLOAD_VERSION` → next minor; `1.48.0` at HEAD, so `1.49.0` unless main moved) and the version comment block above it
- Modify: `src/report/schema.ts:139` (`REPORT_SPEC_VERSION` → next minor; `1.44.0` at HEAD, so `1.45.0` unless main moved)
- Modify: `src/pipeline/stageB/grading.ts:51` (`SCORE_BANDS_VERSION` → `SCORE_BANDS_2026_10_FINANCIAL_ROUTE_EVIDENCE`: FIN-306 and FIN-308 change what the composite counts on financial and undetermined-REIT routes; the bands themselves are unchanged)
- Modify: `tests/report.versionStamps.test.ts:1-35` (header comment: one paragraph naming what the new stamps mean), `:88-90` and `:94-99` (the report, payload and Stage B pins and the newly-built-report/payload checks), `:102` (append the superseded payload version to the never-resumed list), and one new assertion in the `:87` block, `expect(SCORE_BANDS_VERSION).toBe("SCORE_BANDS_2026_10_FINANCIAL_ROUTE_EVIDENCE")` (imported from `@/pipeline/stageB/grading`): no test pins the band-table name today except the payload golden's restoration table (`tests/stageC.payload.passes.test.ts:641`) and `stageB.grading.test.ts:300`, which compares against the constant itself, so a stamp move would otherwise be unpinned.
- `PIPELINE_VERSION` does not move: no Stage C prompt instruction changes; the manifest text that reaches the prompt moves with the payload stamp.
- Modify: `src/report/legacyValuationNotes.ts` (`IMPLIED_RETURN_SHARE_BASIS_SPEC` = the new `REPORT_SPEC_VERSION`, Task 5A; its comment names FIN-506 and D-next). Task 5A already wrote it as this literal. Here `REPORT_SPEC_VERSION` moves to meet it; if main moved since the branch base, both move to the renumbered value together. In `tests/report.versionStamps.test.ts`, beside B5's `ANNUALIZATION_CONVENTION_SPEC` pin, add `expect(IMPLIED_RETURN_SHARE_BASIS_SPEC).toBe(REPORT_SPEC_VERSION)` and `expect(specVersionBefore(ANNUALIZATION_CONVENTION_SPEC, IMPLIED_RETURN_SHARE_BASIS_SPEC)).toBe(true)` (B3's comparator). A renumbering that collapsed the two cutoffs would then fail, because a report built between B5's and this batch's merges would lose its note. It is "any a later plan adds" in the master plan's "Frozen cutoffs" step (`docs/superpowers/plans/2026-10-27-audit-remediation.md`, section "Merge serially: rebase and renumbering", which names B5's `ANNUALIZATION_CONVENTION_SPEC` but not this one): at renumbering it is set to this batch's renumbered spec, never to B5's, and the PR names it.
- FIN-506 (Task 5A) rides on `STAGE_B_IMPLEMENTATION_VERSION` (the implied starting return, and through it the financial-route valuation score, changes meaning) and on `REPORT_SPEC_VERSION` (the new display row keys on it). No band changes, so `SCORE_BANDS_VERSION` needs nothing more for it.
- Round 4 moves no further constant, but three changes ride on the stamps above:
  - FIN-503 and FIN-504 change the peer row and its methodology. That is a Stage B figure, a report field (`currentWithheldReason`) and payload text, so it rides on Stage B, report and payload.
  - FIN-505 changes a graded input (`peOwnHistoryRank`) on every route with a derived P/E history, which rides on Stage B and report.
  - `SCORE_BANDS_VERSION` needs nothing more for round 4. Its new name already moves for FIN-306 and FIN-308, and FIN-505 leaves the band table and the composite's counting unchanged: it changes which figure is ranked, which is what the Stage B stamp records.
  - The stamp test's header paragraph names all three.

- [ ] **Step 1: Write the failing test.** Update the three existing pins in `tests/report.versionStamps.test.ts` to the new values and add the score-band pin first.
- [ ] **Step 2: Run it.** `npx vitest run tests/report.versionStamps.test.ts` → FAIL: `expected '1.44.0' to be '1.45.0'` (and the payload, Stage B and score-band pins).
- [ ] **Step 3: Implement.** Move the four constants. Grep for every literal of the old values in `src/` and `tests/` (`grep -rn "1\.48\.0\|1\.44\.0\|ACCOUNTING_EVIDENCE_27\|SCORE_BANDS_2026_10_REGULATED_UTILITY" src tests --include=*.ts`) and move the ones that pin the current version (leave historical comments).
- [ ] **Step 4: Run it.** `npx vitest run tests/report.versionStamps.test.ts tests/report.schema.test.ts tests/runInputSnapshot*.test.ts` → PASS.
- [ ] **Step 5: Benefit check.** A pass stored under the old payload version is never resumed (the it.each case); a stored report keeps its own spec stamp and the history diff says "spec-version-mismatch" against the new one (`src/report/diff.ts:410`, the house mechanism of every earlier batch, `schema.ts:55-63`). For the "needs reinterpretation" findings (FIN-105, FIN-117, FIN-120, FIN-121, FIN-122, FIN-123, FIN-124, FIN-126, FIN-306, FIN-307, FIN-308) the rule is: legacy reports keep their stored values and texts, rendered as stored and compared as built under the older rules, with one active display rule where a stored figure mixes currencies (FIN-105, Task 2). The plan reviewer's grep of stored reports 1-52 found only two classes with members: SCHW #40/#41 (bank route, but built before D-46, so FIN-120's old sentence was true for them and FIN-306 does not apply: they graded no bank balance sheet) and MU #46 (FIN-117). The disposition note (Task 30) records these counts; no other stored report is on a bank, insurer, REIT, ADR, FIN-OTHER-negative-OCF or unresolved-eligibility path. The display-only findings whose fix lives in Stage B are covered the same way: FIN-312 by its legacy display rule (Task 17, stored reports 44-52), FIN-106, FIN-125 and FIN-313 by a grep showing no stored report carries the old text ("valuation route differs", "ADR ratio map", "eps_local": 0 files; no stored insurer report). Round 4 adds three findings:
  - FIN-503 (needs reinterpretation). NVDA #47, #49, #50 and #52 keep their recorded 59.31× common-earnings median over four peers (MRVL among them). No display-time rule is possible, because a stored report keeps neither the peers' quarterly pre-tax income nor their operating income, so these reports are read under their own spec stamp.
  - FIN-505 (needs reinterpretation). AMZN #43, MU #46 and NVDA #47-#50 and #52 rank price / diluted EPS in a market cap / common income history and keep their stored rank and grade. Re-ranking them at display time would contradict the valuation grade they recorded. SCHW #39-#41 carry a P/E rank with no recorded basis, so their construction is not determinable from their bytes.
  - FIN-504 (stored impact none). Stored META #44/#45 carry an unresolved scope but never reached the peer row.
  - FIN-506 (needs reinterpretation; moved here from B5 by decisions spec 4.3, Task 5A). It rides on the Stage B and report stamps here; its one new constant is the display cutoff `IMPLIED_RETURN_SHARE_BASIS_SPEC`. Its stored class is JPM #21 (spec 1.1.0, one `roeImpliedVsAchievable` driver, 22.63pp), which gets the `impliedReturnShareBasis` display note; no other stored report carries an excess-return reverse solve. Task 28 carries its CHANGELOG bullet and Task 29 its no-owner-decision line.
  - These counts were taken by this amendment from `tmp/audit-2026-10-27/data/reports/[0-9]*.json`; the disposition note re-takes them.
- [ ] **Step 6: Docs.** CHANGELOG's header paragraph ("Current source declares … report spec … payload …") gets the new values (Task 28).
- [ ] **Step 7: Commit.** `git add src/pipeline/runInputSnapshot.ts src/pipeline/stageC/payload.ts src/report/schema.ts src/pipeline/stageB/grading.ts src/report/legacyValuationNotes.ts tests/report.versionStamps.test.ts` then `git commit -m "Move the report, payload, Stage B and score-band stamps for the financial-route fixes (D-next)"`.

### Task 26: Payload golden

**Files:**
- Modify: `tests/stageC.payload.passes.test.ts:630-650` (restoration table, `:641` today maps `SCORE_BANDS_2026_10_REGULATED_UTILITY` back: add the new band name the same way), `:1030-1040` (fingerprint `"1.48.0:416db791"` at `:1038`, promptBytes and hashes, with a dated comment), `:1209` (`payloadVersion`), `:2738` (`report.meta.specVersion`)

- [ ] **Step 1: Run the golden.** `npx vitest run tests/stageC.payload.passes.test.ts` → FAIL on the fingerprint (`1.48.0:416db791` at HEAD) and the version pins.
- [ ] **Step 2: Attribute every byte.** The golden fixture is a general-route issuer, so B6 may move only the following (RPT-101 does not reach the payload):
  - the payload version header and the score-bands stamp;
  - any figure whose Stage B value changed for that fixture: FIN-117 if its oldest repurchase year starts before its history, and FIN-312's driver period;
  - (amended in round 4) the peer methodology strings. They are printed on every payload (the multiples notes and the "Comparable peers (computed)" notes, `payload.ts:1144-1162`), whatever the fixture's peers. Task 18 rewrites the P/B sentence, Task 19 appends the route-screen sentence, Task 22 appends the issuer-common capitalization sentence and Task 23 the D-98 sentence;
  - Task 22's "Company figure withheld" note, only if the fixture's comparison row has a withheld Company figure (it should not: confirm);
  - Task 24's P/E rank and its basis sentence, only if the fixture's P/E has a derived own-history band and a price / diluted EPS current value (check the fixture; if it has no band, nothing moves).
  - Nothing from Tasks 5 and 5A: the golden fixture is a general-route issuer, and the excess-return reverse solve is not serialized into the payload (B5's round-4 amendment checked `src/pipeline/stageC`).

  Add each moved string to the restoration table with a comment naming its task; the restored text must then equal the preceding pin. Any byte not attributable to a named task is a bug: stop and find it.
- [ ] **Step 3: Re-pin.** New fingerprint, promptBytes and hashes, with the comment "D-next (audit 2026-10-27 B6): payload <new> and SCORE_BANDS_2026_10_FINANCIAL_ROUTE_EVIDENCE; <list of moved figures and why>".
- [ ] **Step 4: Run it.** PASS.
- [ ] **Step 5: Commit.** `git add tests/stageC.payload.passes.test.ts` then `git commit -m "Re-pin the payload golden for the financial-route fixes (D-next)"`.

### Task 27: Audited-fixture deltas

- [ ] **Step 1:** `npm run audit:deltas` (report only). Expected leaves on the DEMO fixture (general route, Altman variant `z2`): `scores.assessments.businessQuality.evidenceCompleteness` (new, RPT-101), the Altman driver and signal `period` (FIN-312, "market cap unavailable" → "book equity (no market cap)", because DEMO's Z'' reads no market cap; the leaves at `tests/fixtures/audit-intended-deltas.json:7302/7381/7650/7729` move again), buyback-timing leaves if DEMO's oldest repurchase window starts after its history start or its measured timing note gains the "no year-average price for …" clause (FIN-117), and the stamp leaves. A DEMO leaf reading "market cap observation date unknown" would mean the variant test in Task 17 is wrong: fix the code.
  - Amended in round 4: the peer methodology strings DEMO carries even on its keyless path move too. They sit at `stageB.valuation.multiples.notes.1` (route screen, group `valuation-r3-2026-10-16`, `tests/fixtures/audit-intended-deltas.json:6843`), `.3` and `.4` (P/B and medians, group `audit-reliability-integration-2026-10-14`, `:4464-4472`), and in `report.valuation.peerCoverage.methodology[0]`, `[2]` and `[3]` (`:6420-6432`). Tasks 18, 19, 22 and 23 move them.
  - Because each of those tasks appends to an existing string, no `notes.N` index shifts. An index shift in the report means a task inserted an array element: fix the code, do not bless the shift.
  - DEMO's comparison rows are empty (its subject is excluded before any comparison), and its P/E has no own-history band (`ownHistory: null`), so Tasks 22-24 move no other DEMO leaf.
  - DEMO is a general-route issuer, so Task 5A (FIN-506) moves no DEMO leaf; a DEMO leaf it moves is a defect.
- [ ] **Step 2:** For each reported leaf, name the task that explains it. A leaf no task explains is a bug: fix the code, do not bless it.
- [ ] **Step 3:** `npm run audit:deltas -- --write --group audit-b6-financial-routes-20261027` (house form, as `audit-batch6-provider-failures-20261026`), then write the group's `reason` (one sentence per task that moved a leaf) and `decisions: ["D-next"]` in `tests/fixtures/audit-intended-deltas.json`.
- [ ] **Step 4:** `npx vitest run tests/audit.fixtureComparison.test.ts tests/repository.release.test.ts` (the two tests that read `audit-intended-deltas.json`) → PASS.
- [ ] **Step 5: Commit.** `git add tests/fixtures/audit-intended-deltas.json` then `git commit -m "Record the audited-fixture deltas of the financial-route fixes (D-next)"`.

### Task 28: CHANGELOG

- [ ] Add at the top of `CHANGELOG.md`, under the header paragraph (whose stamp sentence moves to the new values): `## Unreleased - bank, insurer, REIT and ADR routes: currency, routing and grading (2026-10-27)`, one bullet per task in plain English (what a reader saw before, what they see now), then a stamp bullet: "Report <new>, payload <new>, Stage B ACCOUNTING_EVIDENCE_<new> and score bands SCORE_BANDS_2026_10_FINANCIAL_ROUTE_EVIDENCE (D-next). Stored reports keep their bytes; a stored report that published a P/TBV across a currency mismatch shows it withheld, and a stored report's Altman driver reads its market-cap leg from its recorded variant ('observation date unknown' or 'book equity (no market cap)' instead of 'market cap unavailable')." The round-4 bullets (Tasks 22-24) and the FIN-506 bullet (Task 5A, moved from B5), in the same plain-English form:
  - **Peer company figure.** A company with more than one class of common stock no longer gets a peer-table company figure built from a market value the report itself refuses; it reads "withheld" and names why, and the peer median is still shown.
  - **Peer earnings carried by gains.** A peer whose trailing earnings rest mostly on one-off gains (more than 25% of pre-tax income, the rule already applied to the company's own P/E) is left out of the peer earnings median. NVDA's published 59.3× peer median rested on such a peer and would now be withheld (three peers remain, four are required). Stored reports keep their recorded figure.
  - **P/E rank.** The P/E's rank in its own history is taken on the same construction as the history (market cap / common income), so a company with many dilutive shares is no longer ranked dearer than it is; the P/E shown is unchanged.
  - **Implied starting return (FIN-506, moved from B5).** A bank's or insurer's implied starting return is solved against the price per diluted share, the basis its value per share is stated on, and on a quote after the opening book the price is taken back by the same factor the value is rolled forward by. A stored report whose valuation signal used the old solve (JPM #21) shows a note saying so; its figures and scores are unchanged.
- [ ] Commit: `git add CHANGELOG.md` then `git commit -m "Changelog: financial-route currency, routing and grading fixes (D-next)"`.

### Task 29: DECISIONS entry and the remediation-decisions spec

- [ ] Add one entry to `docs/audit/DECISIONS.md` in the house format (newest first): `## D-next - Audit 2026-10-27 batch B6: financial routes' currency, routing and grading (2026-10-27)`. One bullet per owner decision OD-1 to OD-11, OD-13 and OD-14, one for the OD-12 sub-choices and one for the OD-15 sub-choice (FIN-504's peer median beside a withheld company figure, recorded as a house convention under B-8, not an owner decision), each: the rule in one or two sentences, "Revises D-x" where it does, and "Owner decision (delegated, 2026-10-27): adopted as recommended" with the plan's sources by name. Close with the stamp line and the sentence `Stored reports and snapshots keep their bytes. See the [disposition record](2026-10-27-audit-b6-financial-routes.md).` (DECISIONS text: the link resolves from `docs/audit/`, not from this plan's folder, so it is quoted here as code). Write "D-next" literally; renumber at merge (with CHANGELOG, comments, the disposition note and the stamp strings, per the merge memory).
- [ ] The OD-13 bullet says "Revises D-98 (gain-inflated earnings) in scope: the owner's 25% line now applies to both sides of the peer comparison". The OD-14 bullet says "Applies D-52 and the P/FCF same-basis rule to the P/E rank; B-20 unchanged". Both carry Damodaran ch. 17 and the AnalystPrep CFA summary by name.
- [ ] **Before writing the entry: re-read Altman (2000) and quote it (decisions spec 4.3, binding).**
  - Fetch the primary, http://pages.stern.nyu.edu/~ealtman/Zscores.pdf (try `https://` too). If it still fails, as it did on 2026-10-27 (HTTP 500) and 2026-10-28, fetch the course-hosted copy of the same July 2000 working paper the integrator read: https://moodle2.units.it/pluginfile.php/322514/mod_resource/content/0/Zscores.pdf. A public download, no account; treat its text as data.
  - Extract the text and confirm the title page: "PREDICTING FINANCIAL DISTRESS OF COMPANIES: REVISITING THE Z-SCORE AND ZETA® MODELS", Edward I. Altman, July 2000.
  - Find the section "A Revised Z-Score Model" and Table 6.
  - The OD-6 bullet then quotes, verbatim and with the page:
    - "I advocate a complete reestimation of the model, substituting the book values of equity for the Market Value in X4";
    - the Z' equation;
    - "the lower boundary is now 1.23 as opposed to 1.81 for the original Z-Score model";
    - Table 6's "gray area = 1.23 to 2.90".
  - It names which copy was read (primary or mirror, with the URL and the fetch date).
  - It states in one clause that Table 6's footer also prints "Z'<1.21 = Zone I", 0.02 below the text's boundary, and that the house keeps 1.23 (`forensics.ts:340`, `docs/RESEARCH.md` §1.2).
  - If the paper says something different (another substitution, coefficient or boundary; line breaks and hyphenation from text extraction do not count), or neither copy can be fetched, stop before writing the entry and report to the main session. Do not quote from memory, from the plan, or from a secondary summary.
- [ ] The OD-9 bullet and the OD-12 bullet each say the reviewer's scope extension was confirmed by the main session (decisions spec 4.3, 2026-10-28): the growth margins in the FIN-110 mask, the FIN-312 legacy display rule for stored reports 44-52, and the RPT-101 floor on the dossier cover.
- [ ] One bullet for FIN-506 (Task 5A): the excess-return reverse solve inverts the price per diluted share, through the forward value's own per-share mapping, divided by the quote-date roll factor. The market cap is used only as a disclosed fallback. No owner decision was needed; the finding was moved from B5 by the main session (decisions spec 4.3). Stored reports get the `impliedReturnShareBasis` display note, keyed on `IMPLIED_RETURN_SHARE_BASIS_SPEC` (JPM #21).
- [ ] `docs/superpowers/specs/2026-10-27-audit-remediation-decisions.md` does not exist at HEAD 6542531 (as of 2026-10-28 it exists in the working tree as an untracked file written by the main session, which is not the same as being on main), and `tests/repository.release.test.ts` rejects any tracked Markdown file missing from its `ALLOWED_MARKDOWN` allowlist. So: after rebasing, if an earlier batch has added that file to main (and to `ALLOWED_MARKDOWN`), append a "B6" section to it (the OD list, one line each, pointing at the DECISIONS entry) and stage it; if it does not exist, do NOT create it here: the DECISIONS entry and the disposition note are the record, and the PR says so.
- [ ] Commit: `git add docs/audit/DECISIONS.md` (plus `docs/superpowers/specs/2026-10-27-audit-remediation-decisions.md` only if it already existed on main) then `git commit -m "Record the B6 owner decisions (D-next)"`.

### Task 30: Disposition note and release-test registration

**Files:**
- Create: `docs/audit/2026-10-27-audit-b6-financial-routes.md`
- Modify: `tests/repository.release.test.ts:96` (add the new path after `"docs/audit/2026-10-22-audit-batch6-provider-failures.md"`, the last audit note in the registered list) and `:124` (add this plan, `docs/superpowers/plans/2026-10-27-audit-fix-06-financial-routes-currency-and-grading.md`, after `"docs/superpowers/plans/2026-10-15-nvda-round3-recovery.md",` and after any plan an earlier batch appended; master plan, "Where the planning documents are committed")

- [ ] Write the note in the shape of `docs/audit/2026-10-22-audit-batch5-trust-signals.md`: Base commit; scope (26 findings, B6: 22 from rounds 1-3, FIN-503, FIN-504 and FIN-505 from round 4, and FIN-506, moved here from B5 by decisions spec 4.3); "This change made no model calls and no paid provider calls"; a Disposition table (finding → disposition, commit, tests) with all 26 rows; Owner decisions (OD-1 to OD-15, one line each); a "Stored reports" section listing, from a grep over `tmp/audit-2026-10-27/data/reports/[0-9]*.json` (exclude `*.db*` and `index.json`), which stored reports fall in each affected class (bank or insurer or mortgage-REIT route, ADR overlay, undetermined REIT sub-map, unresolved eligibility, FIN-OTHER with negative OCF, mixed currency, partly covered buyback year, undated Altman market cap), and stating that they keep their bytes and are read under their own stamps. Three display rules change what a stored report shows: FIN-105's (no stored report affected), FIN-312's (stored reports 44-52, the Altman driver's "Measured over" cell) and FIN-506's `impliedReturnShareBasis` note (stored report #21, Task 5A); FIN-105-V1's key-data change affects no stored report. The plan reviewer's counts, to re-verify: route metrics only on SCHW #40/#41 (pre-D-46, "capital adequacy not computed"); partly covered buyback year MU #46; "market cap unavailable" on 44-52; zero files for "valuation.excessReturn.currency", "valuation route differs", "ADR ratio map", "eps_local", "reitSubmap", "eligibility unresolved"; the replay table from Task 31; "Left for later": extending the market-cap fetch to the oldest window (OD-2), PP&E evidence for specialty equity REITs (OD-7), routing peers on SEC evidence (OD-10), the excess-return roll-forward net of actual stub dividends (OD-11).
  - Round-4 classes, with the counts this amendment took, to re-verify:
    - A common-earnings peer median resting on a peer that fails the D-98 test: NVDA #47, #49, #50 and #52 (59.31×, four peers, eligible AMD, AVGO, INTC, MRVL, QCOM). They are read under their own stamps; no display rule is possible (OD-13, Task 23).
    - A P/E ranked on price / diluted EPS in a market cap / common income history: AMZN #43, MU #46, and NVDA #47-#50 and #52. AMZN #43 was built at 07:25 on 2026-10-20, before D-98, so its stored valuation grade did use this rank (`peOwnHistoryRank` 2.72 over 15 quarters, no `earningsCaveat`); a HEAD replay does not grade it, because its earnings fail D-98 (review round 4 correction: an earlier draft said the stored #43 rank was not graded). They keep their stored rank and grade. SCHW #39-#41 carry a rank without a recorded basis (Task 24).
    - A multi-class subject in the peer row: none. META #44/#45 have an unresolved scope but no comparison row (Task 22).
  - "Left for later" adds adjusting peer earnings for item-level one-offs instead of excluding the peer (OD-13), and a price / diluted EPS own history once fourth-quarter EPS is derived (OD-14, known issue B4-4).
  - FIN-506 (Task 5A; moved from B5 by decisions spec 4.3). Its Disposition row reads "fixed here, Task 5A, commit …" and says B5's Task 22 was struck. Its stored class is JPM #21 alone (spec 1.1.0, one `roeImpliedVsAchievable` driver, 22.63pp), which gains the `impliedReturnShareBasis` display note; no other stored report carries an excess-return reverse solve. Its replay rows (Task 31: PGR keyless, census JPM, BAC and PGR, synthetic bank) go in the replay table. The intended ADR move (established quoted ADS, non-issuer-common cap) affects no stored or replayed issuer.
  - Scope confirmations (decisions spec 4.3): one line saying the three reviewer scope extensions (Task 20's margins, Task 17's legacy display rule, Task 21's dossier-cover floor) were confirmed by the main session on 2026-10-28.
- [ ] Before staging this plan, check that it still passes the release test's `unsafePublicDocument` patterns and `tests/docs.lint.test.ts`'s relative-link check: no absolute home path, no credential-shaped value, and every markdown link outside code resolving from `docs/superpowers/plans/`. The post-integration review checked it on 2026-10-28; recheck any line the executor edits.
- [ ] `git add -N docs/audit/2026-10-27-audit-b6-financial-routes.md docs/superpowers/plans/2026-10-27-audit-fix-06-financial-routes-currency-and-grading.md` before running `npx vitest run tests/repository.release.test.ts tests/docs.lint.test.ts` → PASS.
- [ ] Commit: `git add docs/audit/2026-10-27-audit-b6-financial-routes.md docs/superpowers/plans/2026-10-27-audit-fix-06-financial-routes-currency-and-grading.md tests/repository.release.test.ts` then `git commit -m "Disposition record for audit 2026-10-27 batch B6 (D-next)"`.

### Task 31: Before-and-after replay proof (no network, no provider or model calls)

`npm run research:replay` refuses a snapshot whose recorded implementation version differs from the current one (`src/pipeline/replayRunInput.ts:7-9`), so the proof calls `runStageB` on the frozen inputs directly, as the audit probes do.

- [ ] **Step 1: Write the replay harness (git-ignored) in its own folder with its own config.** Nothing of this batch goes in `tmp/audit-2026-10-27/probes/`: that folder's config includes `tmp/audit-2026-10-27/probes/**/*.probe.ts`, so a harness there would run in the post-fix verification's probe run (master plan conflict row 50; master plan Global Constraints: "No batch writes into `tmp/audit-2026-10-27/probes/`"). Create:
  - `tmp/audit-2026-10-27/replay/b6/vitest.replay.config.ts`: a copy of `tmp/audit-2026-10-27/probes/vitest.probe.config.ts` one folder deeper, `root: path.resolve(__dirname, "../../../..")`, `import { SHARED_RESOLVE_ALIAS, SHARED_SETUP_FILES, SHARED_TEST_RUNNER } from "../../../../vitest.shared"`, `include: ["tmp/audit-2026-10-27/replay/b6/*.replay.ts"]`, and the probe config's `setupFiles`, `runner`, `environment: "node"`, `pool: "forks"` and `isolate: true` unchanged (the setup files block the network). It is the shape of B5's `plans/b5-r4-review/vitest.review.config.ts`, which sits at the same depth.
  - `tmp/audit-2026-10-27/replay/b6/b6.replay.ts`, the harness, which reads:
    - (a) Stored run inputs: `tmp/audit-2026-10-27/data/evidence/{43,46,48,49,50}/run_input_snapshot.gen0.*.json` (AMZN #43, MU #46, NVDA #48-#50), each through `runStageB(snapshot.content.bundle, snapshot.content.stageBConfig)`.
    - (b) Committed SEC fixtures through the keyless harness copied from `tests/audit.issuerPipeline.test.ts:1-170` (`fixtures/edgar/{fcx,pgr,o,snow,nnn}_companyfacts_audit_20261019.json`, fake Yahoo, one DGS10 point).
    - (c) The synthetic route bundles (`tests/helpers/researchRoutePanel.ts`, `tests/helpers/currencyBundle.ts`) in the shapes Tasks 1-24 use.
    - (d) Stored reports: every `tmp/audit-2026-10-27/data/reports/[0-9]*.json`. That is 51 files, #1 to #52 without #4, which does not exist; skip `index.json`, and do not loop over 1 to 52. Each is read the way the app reads a stored report: `parseStoredReportWithSafety(json)` (`src/report/legacyEntitySafety.ts:53`, a pure function: strict parse, else the lenient legacy read). A bare `ReportSchema.parse` rejects legacy reports the app accepts. Record each file's `readMode`, and fail on a null. The parsed view then goes through `keyDataRows`, `assessmentLine`, `routeMetricsForDisplay`, `scoreDriverTable(scoresForDisplay(report))` and (round 4) `valuationReviewBlocks({ peerCoverage: report.valuation.peerCoverage, symbol })`. These are display-only checks. On the base commit, where the two presenters do not exist yet, the probe falls back to `report.routeMetrics` and `report.scores` via `typeof` checks on the imported module.
    - (e) Round 4, for each snapshot in (a), records:
      - the peer row `computed.valuation.multiples.peerCoverage.comparisons[0]` (current, median, count) and the peer exclusions whose reason matches /non-operating income/;
      - the P/E's `ownHistory.percentileRank` and `rankedCurrent`;
      - the valuation aspect score and the composite.
    - For the #50 snapshot it also runs a second, in-memory copy with the two-class capital sentence injected into `bundle.edgar.tenQNotes.value.data.statementsText`, exactly as `probes/FIN-504.probe.ts` does, and records the peer row's `current` and `currentWithheldReason`. The injected copy is never written anywhere.
    - (f) FIN-506 (Task 5A): for PGR (b), for the census snapshots `tmp/metis-audit-2026-10-22/scratch/snapshots/main/{JPM,BAC,PGR}.json` (keyless SEC and Yahoo data, shape `{ bundle, stageBConfig }`, each through `runStageB(bundle, stageBConfig)`), and for the synthetic bank and insurer bundles (c), it records:
      - `valuation.excessReturn.reverseSolve` (`impliedCurrentRoePct`, `basis` after, notes matching /matching/);
      - `roePathPct.value[0]`, `perShare`, `valuationDate`;
      - the diluted count and the quote's shares (market cap / price);
      - the valuation aspect score.
      It also passes stored reports (d) through `withLegacyValuationNotes` (B5's view, which Task 5A extends) and records which gain `presentation.legacyValuation.impliedReturnShareBasis`. `parseStoredReportWithSafety` already composes that view at `legacyEntitySafety.ts:71` once B5 Task 17 is merged; the view is idempotent, so applying it again changes nothing.
  - It always writes `tmp/audit-2026-10-27/replay/b6/latest.json` and nothing else: other folders under `tmp/` are off limits, and the census files are read, never copied. Keep the harness free of `process.env` switches: `SHARED_SETUP_FILES` builds a hermetic environment.
- [ ] **Step 2: Before.** On the branch's base commit, before Task 1, offline behind a dead proxy as the master plan's proof convention asks (PowerShell): `$env:NODE_USE_ENV_PROXY='1'; $env:HTTP_PROXY='http://127.0.0.1:9'; $env:HTTPS_PROXY='http://127.0.0.1:9'; $env:NO_PROXY='127.0.0.1,localhost'; npx vitest run --config tmp/audit-2026-10-27/replay/b6/vitest.replay.config.ts tmp/audit-2026-10-27/replay/b6/b6.replay.ts`, then `Move-Item tmp/audit-2026-10-27/replay/b6/latest.json tmp/audit-2026-10-27/replay/b6/before.json`. After Task 24 (the last finding task), the same two commands with `after.json`. On the base commit the (f) fields that do not exist yet (`reverseSolve.basis`, the `impliedReturnShareBasis` note) are recorded as absent through `typeof`/`in` checks, as (d) does for the presenters. The vitest run must report the harness file as passed with no network errors. A failing replay is investigated, never re-run until it passes. Before writing the harness, check that `tmp/audit-2026-10-27/replay/b6/` is empty or absent, because other sessions share `tmp/`.
- [ ] **Step 2a: The excess-return rows on their own commits.** Run the same two commands at the Task 4, Task 5 and Task 5A commits as well, renaming the outputs `t04.json`, `t05.json` and `t05a.json`. Check each commit out with `git switch --detach <sha>`; the untracked harness survives the switch. Return with `git switch fix/financial-routes-currency-and-grading`. The before-to-after diff spans Tasks 1–24. Task 8's restatement collapse (FIN-122, bank route metrics and `toCapitalBalance`) and Task 14's Piotroski change can move a bank's or insurer's book value, return or valuation score. So "per share moves only by Task 5's roll" and the FIN-506 rows cannot be read from it. The FIN-309 rows are read from `t04` to `t05`. The FIN-506 rows (PGR, census JPM, BAC and PGR, the synthetic bank) are read from `t05` to `t05a`. The full before-to-after diff is still recorded for the table.
- [ ] **Step 3: Table.** Build the table for the PR and the disposition note; every row names its task, and every row in "must not move" must be identical:

| Input | Figure | Task | Expected |
|---|---|---|---|
| MU #46 | buyback FY2022 avgPriceProxy (74.56), avgPricePaidProxy (86.36), premiumDiscountPct (916.1), timing coverage, leadership score, composite; Altman driver period | 7, 17 | FY2022 unpriced; proxy figures move; composite moves only through leadership; period "market cap observation date unknown" (original variant) |
| NVDA #48, #49, #50 | Altman driver period; oldest buyback year | 17, 7 | period "market cap observation date unknown" (original); values unchanged unless the market-cap history starts more than 7 days after the oldest repurchase year's window opens |
| Snapshots 43, 46, 48, 49, 50 | `gaps` for `valuation.priceComparison.currency`, every key-data row | 1, 3 | identical (ISO codes only) |
| AMZN #43 | capital.current; buyback years | 6, 7 | capital.current identical (FIN-112 trigger absent) |
| PGR (keyless) | excess-return per share; P/TBV row asOf; quality applicableCompleteness; evidence share; composite and band; quality confidence-cap reason | 5, 4, 14 | per share × (1 + CoE)^(days/365.25); P/TBV dated at FY end; quality 1; composite rises toward its raw mean |
| FCX, SNOW (keyless) | oldest buyback year; leadership; composite | 7 | oldest partly covered year unpriced; nothing else moves |
| O, NNN (keyless) | route, sub-map, every score | 15 | identical (determined equity REITs) |
| Synthetic CAD/USD bank | route-metric P/TBV 23.81x, premium 17.48x | 2 | withheld |
| Synthetic CAD/USD general | key-data dividend yield 2.00% | 3 | withheld |
| Synthetic GBp quote | P/E 5555.56x, upside −99.67% | 1 | withheld |
| Synthetic insurer | P/TBV row asOf 2026-03-31 | 4 | 2025-12-31, value 25x unchanged |
| Synthetic bank, quote +96 days | per share 12.4676 | 5 | 12.7378 |
| Synthetic ADR (SIC 3571) | Altman original 5.1595 safe; WACC 8.066% | 16 | Z' with its zone; WACC withheld, cost of equity shown |
| Synthetic conflicted credit | valuation reason; evidence 34.4%; business line letter | 13, 21 | "model applicability unresolved"; about 30.7%; no letter |
| Synthetic FIN-OTHER broker | overlays [unprofitable]; valuation dcf-suppressed | 11 | no overlay; P/E kept |
| Synthetic undetermined REIT | balance sheet 42.67 D, quality 49.45, moat 41.25 | 15 | balance sheet and moat not applicable; quality without ROIC−WACC, Beneish, accruals |
| Synthetic Z'' issuer (no SIC) | Altman driver period | 17 | "book equity (no market cap)" |
| Synthetic class-ambiguous manufacturer (`audit.dcfOwnership` shape) | Altman variant and score | 16 | original/null → private Z' with a score |
| Stored reports 1-52 | key-data rows, assessment line, route metrics | 2, 3, 21 | identical (must not move) |
| Stored reports 44-52 | score-driver "Measured over" for the Altman driver (display rule) | 17 | 46-50, 52: "market cap observation date unknown"; 44, 45, 51: "book equity (no market cap)"; stored strings unchanged |
| NVDA #48, #49, #50 | peer common-earnings row: Company 26.989×, median 59.31× over 4 peers; MRVL share 48.4% (AMD 14.2%, AVGO −6.5%, QCOM 8.9%) | 23 | median withheld (3 peers), MRVL excluded with "non-operating income 48.4% of trailing pre-tax income"; Company figure 26.989× unchanged (NVDA passes D-98); P/B and P/TBV peer medians identical. The probe measured #50 only. Stored #48 has an empty `comparisons` array although its snapshot holds the same five candidates, so take #48's (and #49's) before values from `before.json`; do not assume #50's |
| NVDA #50, two-class sentence injected in memory | peer row Company figure 26.989×; scope `unresolved` | 22 | Company figure withheld with the scope reason; median as at the same run without the injection |
| NVDA #48, #49, #50 | P/E `percentileRank` 1.685; valuation aspect score; composite | 24 | 1.484 (the probe's same-construction rank); score and composite recorded before/after (may be unchanged at a rank this low) |
| MU #46 | P/E `percentileRank` 24.33; valuation aspect score; composite | 24 | ranked as market cap / common income; values recorded |
| AMZN #43 | P/E band rank (gain-inflated, not graded); `peOwnHistoryRank` raw | 24 | graded signal identical (D-98 fallback); band rank recorded |
| Keyless FCX, PGR, O, SNOW, NNN | P/E `percentileRank`, `rankedCurrent`, peer row | 22, 23, 24 | identical: a fourth-quarter diluted EPS is never derived (known issue B4-4; B13 does not change it), so the current P/E is already market cap / common income; no peers on the keyless path. A keyless TTM that does carry four quarterly diluted EPS moves as NVDA does, and so does a fiscal-year-fallback P/E (`incomeTtm.basis === "annual"`, which carries the 10-K's diluted EPS, `compute.ts:3597`). Record it, and never bless it unexplained |
| PGR (keyless insurer) | `reverseSolve.impliedCurrentRoePct` and its basis | 5, 5A | Read from `t04` → `t05` (Task 5) → `t05a` (Task 5A), Step 2a. Task 5 rolls the market-cap target (`mcap / roll.factor`); Task 5A moves the solve to the price per diluted share (`price / roll.factor`), so after both the implied return equals the current starting return when price equals the model value, and otherwise moves by the gap between the weighted diluted count and the shares behind the keyless cap (`keyless.ts:1484`). Record before/after and the two share counts |
| Census JPM, BAC (banks) and PGR (insurer), keyless snapshots | `reverseSolve` implied return and basis; `roePathPct.value[0]`; diluted count against quote shares; per share; valuation aspect score | 5, 5A | Read from `t04` → `t05` → `t05a` (Step 2a). Basis `price-per-diluted-share` on each; implied return moves by the share-count gap (about 0.3pp per 1% at the price-to-book ratios the probe tested) and by Task 5's roll; per share moves only by Task 5's roll; record each |
| Synthetic bank (`buildSyntheticRouteBundle("bank")`, quoted at its model value per share; a second copy with a 3% higher market cap) | implied starting return of the two copies | 5A | equal (to 6 decimals) and within 0.05pp of `roePathPct.value[0]`; before: about 1pp apart |
| Stored reports 1-52 through `withLegacyValuationNotes` | `presentation.legacyValuation.impliedReturnShareBasis` | 5A | this entry on #21 only (JPM, spec 1.1.0, driver 22.63pp); B5's own notes stay as B5 Task 29 lists them; stored bytes unchanged |
| Synthetic five peers, one 50% non-operating | common-earnings median 20× (5 peers); peer P/E median 20× | 23 | 17.5× over 4; P/B count 5 unchanged |
| Synthetic two-class subject (class sum 1,200) | Company figure 10.0× | 22 | 12.0×; a 11-cap peer leaves on the size screen |
| Synthetic issuer at its history median, diluted 4% above outstanding | P/E rank 60.53 | 24 | 50; P/E shown 26.0× unchanged |
| Stored reports 47, 49, 50, 52 | classic peer table row (59.3×, 4 peers) | 22, 23 | identical (no display rule; rows without `currentWithheldReason` render as before) |
| DEMO audited fixture | every leaf | all | only the Task 27 group: Altman driver period → "book equity (no market cap)"; the peer methodology strings of Tasks 18, 19, 22 and 23 (`notes.1`, `.3`, `.4` and `peerCoverage.methodology[0]`, `[2]`, `[3]`, no index shift) |

- [ ] **Step 4:** Paste the table (with the measured before/after numbers) into the disposition note and the PR. Keep `before.json`/`after.json` under `tmp/audit-2026-10-27/replay/b6/` (git-ignored, never committed).

### Task 32: `npm run verify`, in foreground chunks

Run each step of `npm run verify` on its own, in the foreground, without `METIS_DATA_DIR` set, and fix anything this batch caused:

- [ ] `npm run check:dependencies`
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run test:product`
- [ ] `npm run test:integration`
- [ ] `npm run test:coverage` (the risk-coverage manifest must list any new source file; none is planned)
- [ ] `npm run build`
- [ ] `npm run audit:security`

Known flakes under load, rerun once before investigating: `tests/db.cli.test.ts` "bootstraps a Unicode/spaced SQLite path" (`spawnSync … ETIMEDOUT` on Windows); timeouts in `jobScheduler`, `recordedSensitivity`, `risk.coverage`, `runtimeArtifactIdentity` and `runtimeReplay` tests; `test:coverage:risk` can take 14-16 minutes when other sessions run dev servers. A failure that reproduces on rerun is real.

### Task 33: Fresh-reviewer pass

- [ ] Dispatch a fresh reviewer (superpowers:requesting-code-review) over `git diff origin/main...HEAD` with this plan, `tmp/audit-2026-10-27/findings.json` (the 26 B6 ids, FIN-503, FIN-504, FIN-505 and FIN-506 included) and the probes as context. The reviewer also checks the following. First, one gain test and one scope rule now serve both sides of the peer comparison, through the same helper and the same `resolveEconomicEquityScope` call as the framework, with no copy of either. Second, every methodology sentence was appended rather than inserted (no `notes.N` index shift in the deltas). Third, the P/E shown is still price / diluted EPS wherever it renders, while only its rank moved. Fourth, FIN-506 is built here as Task 5A (decisions spec 4.3), and `main` (B5's merge) carries no FIN-506 code: B5's Task 22 is a tombstone. Task 5A's reverse target divides the price by Task 5's roll factor (`price / roll.factor`) and never brings back the market-cap target beside a price and a divisor. `IMPLIED_RETURN_SHARE_BASIS_SPEC` equals this batch's spec, not B5's, and the `impliedReturnShareBasis` note fires on stored #21 only. Fifth, the three reviewer scope extensions confirmed by 4.3 (Task 20's margins, Task 17's legacy display rule, Task 21's dossier-cover floor) are built as planned. Sixth, the DECISIONS OD-6 bullet quotes Altman (2000) verbatim from a copy the executor fetched, and names it. A subject failing both the scope and the gain test must have one exclusion. Instructions to the reviewer: check each finding's probe assertion is now encoded in a committed test that fails on main; check no test was loosened (tolerances, deleted assertions other than the ADR ratio-map block); check every docs change matches the code; check stored-report handling (FIN-105 display rule, optional schema fields); exclude `*.db*` from every recursive grep and do not open files under `tmp/metis-audit-2026-10-22`.
- [ ] Fix only findings that affect correctness; record the rest in the PR's "left for later". Re-run the touched test files and `npm run typecheck`.

### Task 34: Pull request

- [ ] `git fetch origin` and rebase on `origin/main` immediately before pushing; renumber D-next, the stamps, the delta group and the CHANGELOG stamp sentence if main moved (merge memory: B1-B5 will have taken numbers first). Push `fix/financial-routes-currency-and-grading`, open one PR.
- [ ] PR description, plain English, for a non-technical owner:
  1. **What was wrong** (one line per finding group): a bank or insurer listed in another currency got a P/TBV mixing two currencies; the dividend yield did the same; London pence quotes read as pounds; several financial-company disclosures described checks that do not run or omitted checks that do; some grades counted evidence that is impossible on that route as missing, or graded a possible mortgage REIT like an industrial company; an ADR's market value was refused in one place and used in two others; a few dates and labels named the wrong period; a bank's or insurer's implied starting return was solved against a market cap built on a different share count from its value per share (FIN-506, moved from B5). Round 4 adds the peer table and the P/E rank. A peer whose earnings rested on a one-off gain set NVDA's peer median. A dual-class company got a peer-table figure from a market value the report refused. The P/E was ranked in a history built a slightly different way.
  2. **What changed**, grouped the same way, each with its owner decision in one sentence and the D-entry it revises.
  3. **Before and after**: the Task 31 table.
  4. **Stored reports**: kept byte for byte. These classes are read under their old stamps: SCHW #40/#41, MU #46, NVDA #47, #49, #50 and #52 (peer median), and AMZN #43, MU #46 and NVDA #47-#50 and #52 (P/E rank). The three display rules are FIN-105 (no stored report affected), FIN-312 (stored reports 44-52) and FIN-506's note (JPM #21). Say plainly that NVDA's stored 59.3× peer median would be withheld today and why no display rule can withhold it: the stored report does not keep the peers' earnings split.
  4a. **FIN-506** (moved here from B5 by the main session, Task 5A): one line saying it is fixed here, and how the reverse target meets Task 5's quote-date roll (the price is taken back by the same factor). Its stored class is JPM #21 alone, which now shows a note. Name the one intended ADR move.
  4c. **Decisions confirmed by the main session** (decisions spec 4.3): the three reviewer scope extensions, and the Altman (2000) passage re-read and quoted in the DECISIONS entry (with the 1.21/1.23 footnote discrepancy and which copy was read).
  4b. **P/E rank** (Task 24): say plainly that the P/E shown can sit above its own history median while its rank reads 50. The rank is taken on the history's construction, and the basis says so.
  5. **Left for later**: OD-2's longer fetch, OD-7's PP&E evidence, OD-10's evidence-routed peers, OD-11's net-of-dividends roll, OD-13's one-off-adjusted peer earnings, OD-14's price / diluted EPS history (after known issue B4-4), and anything the reviewer raised that does not affect correctness.
  6. The merge-order note: rebase B9 (RPT-201) on this PR's merge. For `peers.ts`, B3 merges first: it adds `peerDiscoveryScreen` and rewrites the route-screen methodology string at `peers.ts:266`, and Tasks 19, 22 and 23 append to the strings B3 leaves. B9 and B10 (RPT-214, `peers.ts:123-127`) rebase on this one.
  7. End with the attribution lines the session requires.

## Self-review

- **Coverage:** all 26 B6 findings have a task: FIN-107 (1), FIN-105 (2), FIN-105-V1 (3), FIN-106 and FIN-310 (4), FIN-309 (5), FIN-506 (5A, moved from B5 by decisions spec 4.3), FIN-112 (6), FIN-117 (7), FIN-122 (8), FIN-120 (9), FIN-313 (10), FIN-121 (11), FIN-124 (12), FIN-123 (13), FIN-306 (14), FIN-308 (15), FIN-307 (16), FIN-312 (17), FIN-126 (18), FIN-125 (19), FIN-110 (20), RPT-101 (21), and from round 4 FIN-504 (22), FIN-503 (23), FIN-505 (24). None is skipped. Each of the 22 was re-read at HEAD 6542531 and still reads true, and the three round-4 findings were traced to the code they cite at HEAD (amendment notes). FIN-506, the 26th id in B6's `brief/batches.json` entry, was planned in B5 Task 22 in round 4 and moved here by the main session (decisions spec 4.3); it is Task 5A, B5's Task 22 is a tombstone, and Tasks 25 and 28-34 carry it (Integration notes (2026-10-28)).
- **Owner decisions:** every `ownerDecisionNeeded` finding (FIN-107, FIN-117, FIN-121, FIN-123, FIN-306, FIN-307, FIN-308, FIN-106, FIN-110, FIN-125, FIN-309, and FIN-503 and FIN-505 from round 4) has an OD with sources. The optional sub-choices are in OD-12, and FIN-504's in OD-15.
- **Review focus:** each of the seven lines has a named test in Tasks 1, 2, 5, 5A, 14, 16, 21, 22, 23 and 24.
- **Type consistency:** `PriceToTangibleBookVsRote` gains `asOf`, `roteAsOf`, `roteSource` (Task 4) and is withheld by `withholdPriceToTangibleBook` (Task 2, spreads every field); `ExcessReturnInputs` gains `tangibleCommonEquityAsOf`, `roteAsOf`, `roteSource` (Task 4) and `valuationDate` (Task 5); `PiotroskiResult.routeWithheld` (Task 14) is read by Task 14 only, and Tasks 12 and 15 make it 4 for eligibility holds; `Signal.applicableFraction` (Task 14); `ForensicsInputs.marketEquityWithheldReason` (Task 16); `degradationPlan`'s fifth argument (Task 10); `assessments.businessQuality.evidenceCompleteness` (Task 21, optional in the schema). Round 4 adds:
  - `PeerCoverage["comparisons"][number].currentWithheldReason?: string`, added in Task 22 to both `peers.ts` and `PeerCoverageSchema` (optional), and written by Tasks 22 and 23;
  - `nonOperatingShareOfPretax(pretax, operating): number | null` and the `nonOperatingShare` field on `commonIncome`'s result (Task 23), read by `valuation.ts` and `peers.ts` against the one `GAIN_INFLATED_NON_OPERATING_SHARE`;
  - `OwnHistoryBand.rankedCurrent?: { value: number | null; construction: "capitalization-common-income" }` (Task 24), read by `scoringEvidence.ts` only and not added to the report schema.
- **Shared-file order:** `valuation.ts` (Tasks 2, 4, 5, 5A, 23, 24), `compute.ts` (1, 4, 5, 5A, 6, 8, 10, 16, 20), `grading.ts` (13, 14, 15, 21), `sectorRouting.ts` (1, 5A, 9, 10, 11, 15), `legacyValuationNotes.ts` (5A, 25; B5's module), `tests/report.legacyValuationNotes.test.ts` (5A; B5's file), `forensics.ts` (12, 14, 15, 16), `presentation.ts` (2, 3, 17, 21), `markdown.ts` / `printHtml.ts` (2, 17), `sections.tsx` (17), `ReportView.tsx` (2), `DossierCover.tsx` (21), `dataOnlyReport.ts` (1), `peers.ts` (18, 19, 22, 23), `schema.ts` (21, 22), `payload.ts` (4, 22), `researchReview.ts` (22), `scoringEvidence.ts` (17, 24), `tests/pipeline.peers.test.ts` (18, 19, 22, 23), `tests/stageB.scoringEvidence.test.ts` (17, 24): one concern per commit, in task order.
- **Type consistency (Task 5A, moved from B5):** `ExcessReturnInputs.price`, `ExcessReturnResult.reverseSolve.basis` (`"price-per-diluted-share" | "market-cap"`), the local `perShareOf` in `excessReturnModel`, and `IMPLIED_RETURN_SHARE_BASIS_SPEC` and the `impliedReturnShareBasis` row in B5's `legacyValuationNotes.ts` are named the same in Tasks 5A, 25, 28-31 and 33.
- **Presenters added (plan review):** `routeMetricsForDisplay` (Task 2), `scoresForDisplay` (Task 17) and `businessQualityGraded` (Task 21) in `presentation.ts`; each reads stored fields only and never rewrites the report.

## Review notes

Independent plan review, 2026-10-27, against HEAD 6542531, `tmp/audit-2026-10-27/findings.json`, the B6 probes (read, not run) and the code. One existing test was run (`npx vitest run tests/stageB.grading.test.ts -t "fully-observed bank composite"`: passes at HEAD). Sources were re-fetched where named below. Every change was made in this file; nothing else in the repository was touched.

### Coverage

All 22 B6 ids in `brief/batches.json` have a task (no merged ids apply to B6). No finding was skipped or disputed: each probe's failing assertion was traced to the code path it names, and each still fails at HEAD.

### Changes made to the plan

1. **Task 1 (FIN-107): the minor-unit refusal is `mismatch: false`, not `true`.** With `mismatch: true` the multiples gap takes its mismatch branch (`valuation.ts:4081`), which prints fixed "(ADR case) — FX conversion pending" text without the comparison's reason, so the plan's own `/pence/` assertion would fail after the fix; the forensics, WACC and DCF mismatch texts would likewise claim a pending FX conversion. `mismatch: false` routes a minor unit through the "comparison unproven" path everywhere (OD-1 rewritten with the reason). Also added: `compute.ts:2437` compares against the raw profile currency so `valuation.priceComparison.currency` names the pence instead of "quote currency unknown" (identical for every ISO spelling); `dataOnlyReport.tradingCurrency` uses `statementCurrencies().trading` so the data-only technicals stop folding pence into pounds; `normalizeReportedCurrency` is documented as the trading-currency normaliser too (marketData, payload, company page); a new test asserts the trading currency is null and the gap names the pence; `tests/currency.priceComparison.test.ts`, `tests/research.routePanel.test.ts` and `tests/stageB.valuation.test.ts` join the neighbour run.
2. **Task 2 (FIN-105):** states how a minor-unit quote now flows through the financial branch (the unknown branch); records the reviewer's grep (0 stored reports with `valuation.excessReturn.currency`; route metrics only on SCHW #40/#41); names the Next.js guides for the `ReportView.tsx` edit (Global Constraints).
3. **Task 3 (FIN-105-V1): the quote side of the comparison is the price's own currency evidence.** `keyDataRows`' `priceCurrency` local falls back to the DCF model currency, which equals the dividend's (statement) currency, so the planned "unknown price currency" test would have stayed comparable through that fallback and failed after the fix. The test helper is now specified, and the stored-report claim is verified (only 47-50 and 52 carry a dividend; all USD/USD).
4. **Task 5 (FIN-309):** the C-11 grid's per-row opening-book date is made concrete (`ExcessReturnGrid.rows` carries no date; the fiscal-year row is the one the alternative replaced); a grid note is added; the 200/201-day boundary runs (quotes after the fixture's `BUILT_AT`) get an explicit fallback. **OD-11 source corrected:** the CFA reading does not contain V_t = V_{t−1}(1 + r) − D_t (re-fetched); the between-dates relation is now sourced to the RIM/DDM equivalence (Ohlson 1995; Schütt, FSAV ch. 10, fetched).
5. **Task 7 (FIN-117):** D-68 names unpriced years only in the NOT-measured branch (`capital.ts:1109-1131`); in the probe's case coverage stays 84.2% (measured), so the plan's `/no year-average price for 2021-12-31/` assertion would fail after the fix. Step 3 now appends that clause to the measured note. MU #46 is named as the stored report in this class. **OD-2 source wording** corrected to the abstract's actual words ("over various horizons"); the 7-day tolerance is labelled a house rule.
6. **Task 9 (FIN-120):** stored SCHW #40/#41 predate D-46 (their balance sheet reads "capital adequacy not computed"), so the old sentence was true for them and no legacy display rule is needed. Recorded.
7. **Task 10 (FIN-313):** the open "pick whichever signature" choice is resolved: `currencies?: { statements; quote }`, compared inside `degradationPlan`.
8. **Task 14 (FIN-306): fixture arithmetic corrected.** The grading fixture is Piotroski `score: 8, outOf: 9` (evidence fraction 1, quality 0.57), not "8/9 of the weight"; the new bank battery (`outOf: 3, routeWithheld: 6`) gives `compWeight` 78.32 − 26 × 0.22 × 6/9 = 74.51. The override is scoped to `fullyObservedBank()`; the "band B → C" assertion may not be deleted.
9. **Task 15 / OD-7 (FIN-308):** `roic` removed from the policy list: `grading.ts` keys the moat's ROTE-versus-ROIC choice on `policy.suppress.includes("roic")`, and the moat's explicit not-applicable reason already removes ROIC level and floor. OD-7 and the Interfaces list now agree. Nareit counts (32 mortgage, 139 all-equity) verified in the fact sheet.
10. **Task 16 (FIN-307):** the planner's "possible pre-existing D-78 defect" (`waccPct ?? 0`) is not one: `compute.ts:3886` passes the nullable WACC to `valueCompany`, which suppresses the DCF before `dcfInputs.waccPct` is read. The consequence is restated accurately (the aggregate DCF and the ROIC − WACC spread are lost; ADR per-share and fair value were already withheld by the B-19 ADS guard). The known re-pin `tests/audit.dcfOwnership.test.ts:61-62` (class-ambiguous original Z withheld → Z') is named with a stronger replacement assertion. **OD-6 source:** the Altman PDF returned HTTP 500 and the cited Wikipedia page does not state Z''s X4 or zones; replaced with `docs/RESEARCH.md` §1-1.2 (already the code's evidence base) and a practitioner summary, with an instruction to re-read the primary.
11. **Task 17 (FIN-312): the market-cap leg is variant-aware, and stored reports get a display rule.** `computeAltman` stamps `asOf.marketCap` for every variant and Z'/Z'' have a non-null (book-equity) X4, so the planner's `x4 !== null` rule would have printed "observation date unknown" for every Z'' issuer. Stored reports 44, 45 and 51 (META, DEMO) are `z2`; 46-50 and 52 are `original`. The leg now reads "book equity (no market cap)" for book-equity variants, and `scoresForDisplay(report)` applies the same reading to stored reports from their recorded `quality.forensicScores.altman` (FIN-312 is display-only and nine stored reports print the false text). Task 27's expected DEMO leaf is corrected to "book equity (no market cap)".
12. **Task 20 (FIN-110) / OD-9: the growth margins join the revenue mask.** The planner's "D-53 carve-out" for margins does not exist in D-53 (line 628); the comment it leaned on is a currency rule. Keeping margins would grade gross margin on the refused figure while Beneish's GMI is masked for the same reason. Test assertions added for both margin series and the clean control.
13. **Task 21 (RPT-101): the dossier cover is covered too.** `DossierCover.tsx` prints the business band from the audit table and overrides only the price-attractiveness row under limited evidence; it gets the same floor through a shared `businessQualityGraded` helper and a dossier render test.
14. **Task 25:** the versionStamps test pins three stamps, not four; a `SCORE_BANDS_VERSION` pin is added (nothing pinned the band-table name). Step 5 now states the legacy rule for every needs-reinterpretation and display-only finding with the reviewer's stored-report counts.
15. **Task 29:** `docs/superpowers/specs/2026-10-27-audit-remediation-decisions.md` does not exist, and an unregistered tracked Markdown file fails `ALLOWED_MARKDOWN` in `tests/repository.release.test.ts`; the task now appends only if an earlier batch created and registered it. Global Constraints: never `git add` the plan file.
16. **Task 31:** concrete before/after file handling (`latest.json` then `Move-Item`, no env switches under the hermetic setup), stored reports widened to 1-52, new rows for FIN-312's display rule, the Z'' driver and the class-ambiguous Z'; the CHANGELOG, disposition note and PR outline name the second display rule.
17. **OD-3** gains its known cost (fee-based FIN-OTHER issuers and positive-NI fintechs lose the OCF trigger). **OD-10** drops a paraphrase the SEC page does not contain. **OD-1, OD-5, OD-8, OD-9** sources re-read; quotes adjusted to what the pages say.

### Owner decisions checked

OD-1 (FIX forum: GBX/GBp not ISO; refuse, not scale): supported, kept, `mismatch` semantics changed. OD-2 (withhold a partly covered year): supported in principle by Dittmar and Field's horizon benchmark; the threshold is a house rule. OD-3 (FIN-OTHER OCF exemption): ASC 230-10-45-20/-21 verified on Deloitte DART; kept with its cost named. OD-4 (policy share): consistent with the D-96 `metricPolicy` hold and the dcf-suppressed precedent; kept. OD-5 (applicableFraction): AAII summary verified; consistent with the D-50 review amendment (lines 713-729, read); kept. OD-6 (withhold the ADR cap from X4 and the WACC; Z'): consistent with D-78 (line 1892, read) and the FX Z' precedent; the primary Altman source was unreachable and is replaced. OD-7 (withhold the disagreeing signals): Nareit counts verified; kept, `roic` corrected. OD-8 (relabel dates): analystnotes justified-P/B verified; kept. OD-9 (widen the mask): PwC ASC 250-10-45-23 verified; widened further to margins. OD-10 (wording only): SEC 10 requests/second verified; kept. OD-11 (gross roll-forward): CFA citation corrected; gross kept for D-65 consistency, bias stated. OD-12 sub-choices: kept; FIN-105-V1 and FIN-312 refined as above.

### Left for the main session

- `tmp/audit-2026-10-27/plans/B6.summary.json` is the planner's and was not edited: it still says minor-unit refusals are `mismatch: true`, expects DEMO's Altman leaf to read "observation date unknown", lists the remediation-decisions spec as a touched file, and omits `src/pipeline/stageC/dataOnlyReport.ts`, `src/components/report/DossierCover.tsx`, `src/components/report/sections.tsx` and `tests/audit.dcfOwnership.test.ts` from `filesTouched`. Its `risks` line about a D-78 `waccPct ?? 0` defect is resolved (not a defect).
- Three scope extensions by the reviewer deserve an explicit yes from the main session: margins in the FIN-110 mask (Task 20), the FIN-312 legacy display rule (Task 17), and the dossier-cover floor (Task 21). Each follows from the finding's own class; none adds a provider or model call.
- The Altman (2000) PDF was unreachable (HTTP 500); the implementer re-reads it before the DECISIONS entry is written.
- Cross-batch: Tasks 17 and 21 add `sections.tsx`, `markdown.ts`, `printHtml.ts` and `DossierCover.tsx` edits that B10 and the readability phases also touch; Task 1 adds `dataOnlyReport.ts`. The rebase order in REPORT.md section 7 still holds (B6 before B9 and B10).
- Task 5's boundary runs use quote days after the synthetic `BUILT_AT`; if Stage B refuses such a quote, the test moves `builtAt` for those two runs only (instruction in the task).

## Amendment notes (round 4)

Amended 2026-10-28 for audit round 4. The amendment read:
- the findings in `tmp/audit-2026-10-27/findings.json` and this batch's entry in `brief/batches.json`;
- the probes `probes/FIN-503.probe.ts`, `FIN-504.probe.ts` and `FIN-505.probe.ts` (read, not run);
- the verdicts in `agents/r4-verify-4/verdicts.json`. No `agents/r4-vverify-*` folder covers these three ids;
- every file and line the findings cite, at HEAD 6542531;
- the B3 plan (`peers.ts` overlap) and the B13 plan (`docs/superpowers/plans/2026-10-27-audit-fix-14-edgar-derived-lines.md`).

No source, test or doc outside this file was changed, and no test, probe or server was run. Stored-report counts come from reading `tmp/audit-2026-10-27/data/reports/[0-9]*.json` with node (no `*.db*` file opened). Web sources were public pages only: Damodaran's ch. 17 PDF and AnalystPrep.

### New findings and where they are handled

| Finding | Severity / stored impact / owner decision | Handling | Why it is not covered by an existing task |
|---|---|---|---|
| FIN-503 | Medium / needs reinterpretation / yes | (b) Task 23; OD-13 | Tasks 18 and 19 change the peer P/B denominator and the route-screen wording, not the earnings test. At HEAD, `commonIncome` (`peers.ts:237-255`) sums filed common earnings or net income only, the median's only screens are nonpositive values and 1.5×IQR (`peers.ts:358-368`), and neither `peers.ts` nor `peerComparability.ts` has a gain test. |
| FIN-504 | Medium / none / no (display sub-choice in OD-15) | (b) Task 22 | Task 16 (FIN-307) passes `isAdr` into the forensic and WACC scope calls in `compute.ts`; it never reaches `comparePeerFundamentals`. At HEAD, `peers.ts:319` and `:391` read `subject.quote.marketCap` raw, though the framework's scope (`valuation.ts:4064-4066`) withholds it. |
| FIN-505 | Low / needs reinterpretation / yes | (b) Task 24; OD-14 | No task touches the P/E rank. At HEAD the current P/E is price / diluted EPS (`valuation.ts:4311-4315`), the history is `capitalization-common-income` unless `requiresHistoricalClassScope` (`:4383`), and the band ranks `cur` (`:4604-4606`). |
| FIN-506 (added by the round-4 review) | Low / needs reinterpretation / no | Planned in B5 Task 22, one-batch rule; Task 5 rebase rule here | Not planned by this amendment: its `batch` field moved from B5 to B6 at 00:21, and B5's plan was amended at 00:54 to plan it with a build-in-exactly-one-batch rule. Task 5 (FIN-309) rewrites the same reverse solve, so Task 5 now states how its roll divides the per-share target. |

None is disputed. Each probe's failing assertion traces to the HEAD code above, and the probes' setup guards match it: NVDA #50 MRVL 48.4% with no subject gain flag; scope `unverified-vendor-scope` → `unresolved` with the injected two-class sentence; basis `price / epsDiluted` with the history's latest value equal to the EV-row market cap / TTM net income. None needed (a), an extra step in an existing task: the three root causes are new code paths.

### Owner decisions taken (research summary)

- **OD-13 (FIN-503):** applies D-98's owner-accepted 25% line to both sides of the peer comparison, and excludes rather than caveats. Damodaran's uniformity test and the CFA "calculated consistently among all stocks" rule support one definition across the group. Adjusting peer earnings was rejected for lack of item-level evidence.
- **OD-14 (FIN-505):** ranks the history's construction (market cap / common income) and keeps the shown P/E as price / diluted EPS. Damodaran names basic-versus-diluted EPS as a definitional variant that must be held the same across a comparison. A price / EPS history was rejected because fourth-quarter EPS is never derived (known issue B4-4).
- **OD-15 (FIN-504 sub-choice):** keeps the peer median as context beside a withheld Company figure. This is the framework's own precedent (`valuation.ts:4058-4062`), and B-8 already decides the scope.

### Changes to existing parts of the plan, and why

1. **Renumbering.** The batch-level tasks moved from 22-31 to 25-34, so that the round-4 finding tasks (22-24) come before them as the plan format requires. Every cross-reference in the file was moved with them, including the Spec line, the Global Constraints, Self-review and the Review notes. Task 31's after-run now follows Task 24, the last finding task.
2. **Task 18 Step 4 and Task 19 Steps 3-4: the payload golden and DEMO move with the peer methodology text.** Tracing the methodology lines for FIN-503 and FIN-504 showed the following:
   - `comparePeerFundamentals` runs on every report (`compute.ts:3738`).
   - Its methodology lines go into the multiples notes (`valuation.ts:4331-4332`) and the payload's peer notes (`payload.ts:1159`), and DEMO's projection already carries them (`tests/fixtures/audit-intended-deltas.json:4464-4472`, `:6843`).
   - So Task 18's rewritten P/B sentence and Task 19's added sentence move the golden's fingerprint and DEMO leaves. Task 18 Step 4 had expected `tests/stageC.payload.passes.test.ts` to pass unchanged.

   What changed in the plan: the two steps now expect fingerprint-only failures until Task 26. Task 19 appends its sentence to the existing string rather than inserting an array element, which keeps `notes.N` indices stable. Tasks 26 and 27 list the moved strings. What Tasks 18 and 19 fix is unchanged.
3. **Global Constraints.**
   - No "D-next" in any string that reaches the payload or the report. This is the B3 plan's rule: a placeholder there moves the golden again at merge-time renumbering.
   - The AGENTS.md line names `researchReview.ts` (imported by client components) and the new runtime imports in `peers.ts`.
4. **Review Focus.** Item 6 (one construction on both sides of a comparison) was added, and item 3 gained the legacy peer row.
5. **Batch-level tasks extended for Tasks 22-24:**
   - stamps (Task 25: no new constant, and the legacy rules for FIN-503, FIN-504 and FIN-505);
   - the golden attribution list (Task 26);
   - the DEMO leaves (Task 27);
   - CHANGELOG bullets (Task 28), DECISIONS bullets for OD-13 to OD-15 (Task 29), and the 25-row disposition note with the round-4 stored-report classes (Task 30);
   - ten new replay rows, an extended DEMO row and the in-memory two-class replay (Task 31);
   - the reviewer brief (Task 33) and the PR outline (Task 34).

### Observations for the main session (not round-4 findings; nothing changed for them)

- **A FIN-107 gap in the peer screen.** `peers.ts:74` `normalize()` upper-cases currency codes. It is used for the subject and peer listing currencies (`:93`), the statement-currency check (`:217`) and the subject quote (`:278`), so a pence ("GBp") quote reads as GBP inside the peer screen. That is FIN-107's class (Task 1), and Task 1 does not list `peers.ts`. Either Task 1's implementer adds the minor-unit refusal there (subject or peer excluded: "quote in a minor unit"), or the reviewer confirms that a pence subject cannot reach the peer screen. It can: the peer screen needs only an FMP key, and OD-1 keeps non-US listings in scope.
- **The remediation-decisions spec.** `docs/superpowers/specs/2026-10-27-audit-remediation-decisions.md` now exists in the working tree, untracked, with a B6-OD-10 entry and no OD-13 to OD-15 entries. The main session may add them there. Task 29's rule stands: append only if main tracks and registers the file.
- **Cross-batch overlaps:**
  - B3 (merges before B6) rewrites `peers.ts:20-42`, `:112-125` and `:266` and the payload's `peersSection`. Tasks 19, 22 and 23 append to the strings B3 leaves, and Task 22's size-screen change is at the comparison-time call (`peers.ts:319`), which B3 does not touch.
  - B13 (merges before B6) changes EDGAR-derived `operatingIncome`, which feeds the D-98 share of SEC-fallback peers and keyless subjects. Task 23's tests use FMP-shaped synthetic rows and the NVDA replays use FMP rows, so neither depends on B13, but rerun Task 31 after the rebase.
  - B9 and B10 (RPT-214, `peers.ts:123-127`) edit `peers.ts` after B6.
- **The structured summary.** The round-4 summary is `tmp/audit-2026-10-27/plans/B6.r4.summary.json`. The earlier `B6.summary.json` is unchanged.

## Review notes (round 4)

This is an independent review of the round-4 amendment, done on 2026-10-28 against HEAD 6542531. It checked:

- `tmp/audit-2026-10-27/findings.json` and B6's entry in `brief/batches.json`;
- the probes `FIN-503`, `FIN-504`, `FIN-505` and `FIN-506.probe.ts` (read, not run);
- the verdicts in `agents/r4-verify-4/verdicts.json` and `agents/r4-verify-1/verdicts.json`;
- the code each finding and task cites (`peers.ts`, `valuation.ts`, `securityBasis.ts`, `compute.ts`, `researchReview.ts`, `schema.ts`, `payload.ts`, `grading.ts`, `scoringEvidence.ts`);
- the B3, B5 and B13 plans where they touch the same code.

The stored-report claims were re-taken with read-only node scripts over `tmp/audit-2026-10-27/data/reports/[0-9]*.json` and the five replay snapshots. No `*.db*` file was opened, and no test, probe or server was run. Two sources were re-fetched:

- Damodaran ch. 17 (PDF extracted locally). These quotes are verbatim: "defined uniformly across all of the firms in the group" (Uniformity); "primary shares outstanding or fully diluted shares and can include or exclude extraordinary items" and "the same definition for that multiple" (Definitional Tests); "If the numerator for a multiple is an equity value, then the denominator should be an equity value as well" (Consistency).
- AnalystPrep "Issues in Calculating EPS". All three quotes are verbatim.

Only this file was changed in the repository.

### Verdict on the three planned findings

- **FIN-503 (Task 23).** The fix holds. The traced change excludes a gain-carried peer before `commonValues.push` and `multiples.peTtm` (`peers.ts:344-352`). The peer stays in `peers` for P/B and P/TBV. The four-peer rule then withholds the median.
  - Step 1's arithmetic checks out at HEAD and after the fix:
    - five peers at 10/15/20/25/30x pass the IQR rule (q1 15, q3 25), so the HEAD median is 20, and 17.5 once P6 is excluded;
    - the exact-25% boundary is 40/160 = 0.25 in binary, and is kept;
    - 29.996 x 4 gives 25.01%, which is excluded;
    - the peer P/E median is set only because `subject()` has `epsDiluted: null` (`peers.ts:348`), and it moves 20 to 17.5.
  - The control (rows with no pre-tax income) passes at HEAD.
- **FIN-504 (Task 22).** The fix holds. `resolveEconomicEquityScope` resolves the test's two-class evidence to 1,200: ROOT 100 x 10, plus ROOT-B 20 x 1 x 10 on the economic-equivalence proxy, `securityBasis.ts:117-131`. The unresolved target's basis carries the injected reason (`securityBasis.ts:95-98`). P6 at 11 is inside 100x of the 1,000 quote cap and outside it against 1,200. `formatMultiple(17.5)` is "17.5×", and `formatMultiple(null)` is "n/m" for the legacy row. The schema row is `.strict()` (`schema.ts:1181-1184`), so the optional field is needed.
- **FIN-505 (Task 24).** The fix holds.
  - `capital.commonIncome` is the same construction as the derived history's `ttmCommonNi` and as HEAD's no-EPS fallback current (`valuation.ts:4315`, `:3929`).
  - `commonIncomeWithheldReason` is a real `MultiplesIncomeTtm` input (`securityBasis.ts:363`, `:430`).
  - A null rank falls through to EV/EBITDA, then P/FCF, in `multipleOwnHistoryRank` (`grading.ts:586-596`), and in the driver selection (`scoringEvidence.ts:221`).
  - The vendor control holds: `vendorHistory` keeps all eight ratios, and `MIN_HISTORY_OBS_FOR_BAND` is 8.
  - `fmtNum(25)` is "25", so the `(25x)` assertion matches.
- **Owner decisions.**
  - OD-13 (exclude, not caveat; one helper and one threshold) is supported by Damodaran's uniformity test and the CFA "calculated consistently among all stocks". It is consistent with D-52 ("explicit exclusions rather than a median") and D-98.
  - OD-14 (rank the history's construction) is FIN-505's first fix sketch. It is supported by Damodaran's same-definition test and the house P/FCF same-basis rule (METHODOLOGY 764-768, re-read).
  - OD-15 applies B-8 (DECISIONS.md:2163, re-read: "Otherwise the scope stays withheld.") and the framework's "Peer stats describe other issuers and stay" (`valuation.ts:4058-4062`).
  - No OD conflicts with OD-1 to OD-12.
- **B13 scope.** It is respected. Task 23 only reads `operatingIncome` and `incomeBeforeTax` (B13 corrects them for EDGAR rows), and Tasks 22 and 24 touch neither derived EBIT, D&A totals nor fourth-quarter lineage. B13 derives no fourth-quarter EPS, so Task 24's B4-4 reasoning stands.

### Changes made to the plan

1. **FIN-506 was uncovered by this plan.** `findings.json` (`batch: "B6"`) and B6's `brief/batches.json` entry list FIN-506 since 00:21. The round-4 amendment (summary 00:45) and the brief for this review named only FIN-503 to FIN-505. B5's plan, re-amended at 00:54, now plans it as B5 Task 22 with a build-in-exactly-one-batch rule. No task was duplicated here, because a second full copy would have to be reconciled. Instead:
   - the Goal line names FIN-506 and where it is planned;
   - Task 5 Step 3 gets a rebase rule. B6 Task 5 rewrites the same reverse solve (`mcap / roll.factor`), and after B5's Task 22 the roll must divide the per-share target (`price / roll.factor`) and keep `mcap / roll.factor` only on the fallback. One extra test case runs once FIN-506's code is on the branch;
   - Task 25 gets the conditional stamp, CHANGELOG and DECISIONS lines;
   - Task 30 gets a 26th disposition row (stored class JPM #21 alone, 22.63pp, spec 1.1.0, re-taken here; SCHW #39-#41 carry no implied-return driver);
   - Task 31 gets a PGR reverse-solve row;
   - Task 33 gets a reviewer check, and Task 34 a PR line;
   - the self-review and the amendment table are updated.
2. **Task 22 / B3 rebase.** B3's Task 2 (AI-102) moves every peer exclusion out of the "Comparable peers (computed)" notes into `payload.peerScreen` and rewrites the `stageC.payload.passes.test.ts:485-499` test that Task 22's new payload test copies. The new test now copies B3's version. It asserts the "Company figure withheld" text on the computed section's comparison line, and the subject exclusion in `peerScreen`. The `payload.ts` bullet names the line B3 leaves. Without this, the planned test would be written against a structure B3 removes.
3. **Task 23: one subject exclusion when both reasons apply.** Task 22 pushed "Company figure withheld: <scope>", and Task 23 a second "Company figure withheld: <gain>", while the text said the reasons are "joined". Step 3 now builds one `withheld` list, gives one row reason, and pushes one exclusion. A test case (scope and gain together) pins it.
4. **OD-13: which earnings the subject's peer-row test reads.** The peer-row test reads the four quarters its Company figure sums (`subjectIncomeQuarterly`). The multiples-table D-98 flag reads `incomeTtm`. They agree on the FMP TTM path and can differ on the fiscal-year fallback. This is now stated, so a reviewer does not read it as two rules.
5. **Task 24: the keyless "must not move" claim was too broad.** The fiscal-year fallback `incomeTtm` (`basis: "annual"`) carries the 10-K's diluted EPS (`compute.ts:3597`). Such a P/E is price / FY diluted EPS in a TTM-window history, and its rank moves under Task 24 as intended. Step 4, Step 5 and the Task 31 keyless row now say so.
6. **Task 24: the reader-facing juxtaposition.** The shown P/E (26.0x) can sit above its history median (25x) while its rank reads 50. This is named in Step 5 and in the PR outline (item 4b).
7. **Stored AMZN #43 correction.** Task 30 said stored #43's P/E rank "is not graded". Stored #43 was built at 07:25 on 2026-10-20, before D-98, and graded `peOwnHistoryRank` 2.72 over 15 quarters with no `earningsCaveat`. Only the HEAD replay withholds it. Corrected. Task 23's "AMZN #43's peer row (it has none)" now says what the row holds: one candidate (EBAY), and a null row with 0 peers.
8. **Task 31, NVDA #48.** Stored #48 has an empty `comparisons` array, though its snapshot holds the same five candidates (AMD, AVGO, INTC, MRVL, QCOM). The probe measured #50 only, so #48's and #49's before values are taken from `before.json`, not assumed.
9. **Global Constraints, module graph.** "No module graph gains a new member" was imprecise. `dataBundle.ts`'s own graph gains `valuation.ts` and `securityBasis.ts`. Its two importers (the company page and `jobRunner.ts`) already import `compute.ts`, and `payload.ts` already imports `valuation.ts` at runtime (`payload.ts:48`, and it imports `peerSizeExclusion` from `peers.ts` at `:47`). No cycle arises, because `valuation.ts` refers to `peers.ts` only by type.

### Left for the main session

- **Decide where FIN-506 is built**, B5 Task 22 or here, and strike the other copy's build step. B5's version depends on B5 Task 17's `legacyValuationNotes.ts` (`ANNUALIZATION_CONVENTION_SPEC`), which exists in B6's base either way, since B5 merges first. Building it in B5 keeps B6 Task 5's rebase rule as the only B6 change. Building it here makes it the commit right after Task 5. The master plan's row 95 ("no task") and B6 row ("+ FIN-506") should name the chosen task.
- `tmp/audit-2026-10-27/plans/B6.r4.summary.json` is the amender's and was not edited. It omits FIN-506, the B3 payload-test rebase, the single-exclusion rule, the keyless annual-basis exception and the AMZN #43 correction.
- `docs/superpowers/plans/2026-10-27-audit-fix-05-seasonality-calendars-and-dcf-inputs.md` was modified while this review ran (00:54). Its FIN-506 wording was read at that time.

## Integration notes (2026-10-28)

Integration of the main session's resolutions (`docs/superpowers/specs/2026-10-27-audit-remediation-decisions.md` section 4.3, "Main-session resolutions (2026-10-28)", binding) and the master plan's conflict row 50, at HEAD 6542531. The 4.3 lines that concern this plan:

- **L1, "FIN-506. Moves from B5 to B6, because B6 rewrites the same function."**
- **L2, "B6. Yes to all three scope extensions. The executor re-reads Altman (2000) and quotes the passage before writing D-next."**
- **Row 50** (master plan conflict table): "`tmp/audit-2026-10-27/probes/B6-replay.probe.ts` … The harness matches the probe config's `include` glob, so the post-fix verification's probe run would execute it. Put it under `tmp/audit-2026-10-27/replay/b6/` with its own config." Row 50 says "B6 T28" in the pre-round-4 numbering; the harness is Task 31 here.

The sections "Review notes", "Amendment notes (round 4)" and "Review notes (round 4)" are kept unchanged as the record. Where they say FIN-506 is planned in B5 or that the main session must decide where it is built, this section and the edited tasks supersede them.

**Changes made, and the line each implements.**

| # | Where | Change | Line |
|---|---|---|---|
| 1 | Goal | 26 findings; FIN-506 is Task 5A, moved from B5 | L1 |
| 2 | Spec line | It said the decisions spec "does not exist at HEAD 6542531". The spec exists in the working tree, untracked, and section 4.3 is now cited as binding. Added `brief/batches.json` and REPORT.md's B6 heading line (`:1809`) | brief (Spec line) |
| 3 | Global Constraints | AGENTS.md line: Task 5A edits B5's `legacyValuationNotes.ts` under the same two Next.js guides, with no new boundary. Probes line: no batch file under `probes/`, and the harness lives in `replay/b6/` | L1, row 50 |
| 4 | Owner decisions intro | FIN-506 needs no owner decision; where 4.3 bites in this plan | L1, L2 |
| 5 | OD-6 source 1 | The fallback "cites RESEARCH §1.2 if unreachable" is replaced by the binding re-read. It records what the integrator found in a course-hosted copy of the July 2000 paper: the X4 substitution passage, the Z' equation, the 1.23 lower boundary and "gray area = 1.23 to 2.90", and Table 6's "Z'<1.21" footer, which disagrees with the text by 0.02 (the house keeps 1.23) | L2 |
| 6 | OD-9; OD-12 FIN-312 and RPT-101 bullets; Tasks 17, 20, 21 | each reviewer scope extension marked "confirmed (decisions spec 4.3)" | L2 |
| 7 | Review Focus | item 7, the bank or insurer whose diluted count differs from the quote's count, moved from B5's item 9, owned by Task 5A | L1 |
| 8 | Tasks intro | why Task 5A sits after Task 5, and why it is numbered 5A: Tasks 6-34 keep the numbers the master plan and the other plans cite | L1 |
| 9 | Task 5 Step 3 | the "Rebase rule for FIN-506" paragraph and its conditional test case are replaced by one sentence: Task 5 keeps the discounted market-cap target, and Task 5A switches it to `price / roll.factor`. The rolled price-basis case moves into Task 5A's tests | L1 |
| 10 | **Task 5A (new)** | B5 Task 22 as amended and reviewed in B5's round 4, in this plan's format, with four adaptations: the target is divided by Task 5's roll factor; a test that the price is divided by the roll; Task 5's reverse case retitled and re-pinned on the price basis; and the stored-report row keyed on a new cutoff, `IMPLIED_RETURN_SHARE_BASIS_SPEC` (this batch's spec), with a test that a report built between B5's and this batch's merges still gets the note. The test file is named `.audit20261027.test.ts`, as this plan names its new tests | L1 |
| 11 | Task 25 | FIN-506 rides on the Stage B and report stamps, unconditionally. `legacyValuationNotes.ts` is added to the Files list and the commit, for the new cutoff, which is "any a later plan adds" in the master plan's frozen-cutoff step | L1 |
| 12 | Tasks 26, 27 | Tasks 5 and 5A move no golden byte and no DEMO leaf (general route; the reverse solve is not serialized) | L1 |
| 13 | Task 28 | FIN-506 CHANGELOG bullet | L1 |
| 14 | Task 29 | new steps: (a) re-read Altman (2000) from the primary, else the named mirror, and quote four passages verbatim with page and copy; stop if they differ or neither copy can be fetched; (b) the OD-9 and OD-12 bullets record the three confirmations; (c) a FIN-506 bullet | L1, L2 |
| 15 | Task 30 | 26-row disposition table; the FIN-506 row reads "fixed here, Task 5A"; three display rules, not two; a confirmations line | L1, L2 |
| 16 | Task 31 | The harness moves to `tmp/audit-2026-10-27/replay/b6/b6.replay.ts`, with `replay/b6/vitest.replay.config.ts` (root and `vitest.shared` import one level deeper; include `replay/b6/*.replay.ts`). Outputs move to `replay/b6/{latest,before,after}.json`, the run goes behind the dead proxy, and the step checks the folder is empty before starting. New input (f): census JPM, BAC and PGR, plus the stored-report `withLegacyValuationNotes` scan. New rows: PGR (5, 5A), census banks and insurer, synthetic bank wiring, stored #21 note | row 50, L1 |
| 17 | Tasks 33, 34 | the reviewer checks FIN-506 is built here and absent from `main`, the roll divides the price, the cutoff is this batch's, the three extensions are built, and the Altman quote was fetched. PR items 1, 4, 4a and a new 4c | L1, L2 |
| 18 | Self-review | 26 findings; seven Review Focus lines; Task 5A in the type and shared-file lists | L1 |

**Evidence the integrator gathered (read-only, no `*.db*` file opened, no market-data, SEC data API or AI call).**
- The Altman (2000) PDF at pages.stern.nyu.edu returned HTTP 500 again on 2026-10-28. The copy at moodle2.units.it (54 pages, 131.7 KB) was fetched and text-extracted locally. The quotes in OD-6 are from that extract (pp. 25-26). The executor still re-reads it (Task 29), as 4.3 requires.
- `forensics.ts:340` holds the Z' zones `{ distressBelow: 1.23, safeAbove: 2.9 }`, and `docs/RESEARCH.md:72` reads "Distress below 1.23; safe above 2.90", so the paper's text agrees with the code and its Table 6 footer differs by 0.02.
- `brief/batches.json` lists 26 ids for B6, FIN-506 included, and `findings.json` gives FIN-506 `batch: "B6"` and `ownerDecisionNeeded: false`.

**Not applied.** Nothing in 4.3's B6 or FIN-506 lines was left out. Three things outside this file are for the main session:
- the master plan's row 95 ("no task") and its B6 row should name B6 Task 5A for FIN-506;
- its "Frozen cutoffs" step should name `IMPLIED_RETURN_SHARE_BASIS_SPEC`;
- `tmp/audit-2026-10-27/plans/coverage.cjs` reads tasks from `### Task (\d+):` headings, so it does not see the `### Task 5A:` heading; through `B6.summary.json` it files FIN-506 under "B6 Task 5". Widening its pattern to `(\d+[A-Z]?)` would label it Task 5A.

All three are outside this planner's files. `tmp/audit-2026-10-27/plans/B6.summary.json` was regenerated from this plan, the authority. `B6.r4.summary.json` is left as the round-4 record.

## Post-integration review (2026-10-28)

Independent review, at HEAD 6542531, of three things: Task 5A (FIN-506, moved here from B5 by decisions spec 4.3), the replay harness Task 31 (moved to `tmp/audit-2026-10-27/replay/b6/` by master plan conflict row 50), and this plan's readiness to be committed. The reviewer read the FIN-506 finding and its probe (not run) and traced each step against the code at HEAD:
- `valuation.ts`: `:4672-4760`, `:5235-5260` and `:5325-5395` (the reverse solve), plus `:5909-5912`, `:5966-5969` and `:5985-5988`;
- `compute.ts:3225-3262` and `:3790-3830`;
- `sectorRouting.ts:1433-1437`;
- `src/providers/fmp.ts:1159-1165` (`quotePriceObservationDay`);
- `tests/helpers/researchRoutePanel.ts` and `currencyBundle.ts`;
- `legacyEntitySafety.ts:38-90`;
- B4 Task 11's divisor, B5 Task 17 and B3's `specVersionBefore`.

Stored-report counts were taken with read-only node scripts over `tmp/audit-2026-10-27/data/reports/[0-9]*.json`. The reviewer ran no probe, test, suite or server, made no network, provider or model call, and opened no `*.db*` file. It changed nothing in the repository except this file, and refreshed `tmp/audit-2026-10-27/plans/B6.summary.json`.

**Verdict on Task 5A.** The fix is sound and fixes the class. The reverse target is the model value per share at the quote date against the price (`perShareOf(V_stmt(roe)) = price / roll.factor`), on B4's divisor, with the market cap only as a disclosed fallback. It names no ticker, weakens no check and keeps D-67, since the stored-report row only adds an `appendix.missingData` entry. Step 1's HEAD figures match the probe's measured output: 15.7117 at a 1% gap and 15.1477 at a 3% gap, against a current return of 16 (−0.2883pp and −0.8523pp). Stored #21 (JPM, spec 1.1.0, one `computed.scores.valuation.roeImpliedVsAchievable` driver, 22.63pp) is the only stored report carrying the driver; re-taken on 2026-10-28. Four defects were found, and each is fixed below.

**Changes made.**

| # | Where | Change | Why |
|---|---|---|---|
| 1 | Task 5, Step 1 fourth case, the `er` helper note and Step 2 | The reverse-solve assertion now runs on copies of the synthetic bank quoted at d1's value per share (`er(route, day, price?)`), with a setup guard that a root exists. The assertion is now `toBeLessThan` (rolled target below the unrolled one). Step 2 names the case's HEAD failures. | The checked-in synthetic bank quotes 100 against a model value of about 12.47 a share, so its reverse has no root on either day. `toBeCloseTo` on `null` throws, so the case could neither fail for the defect nor pass after the fix. Task 5A re-pins this same case. |
| 2 | Task 5A Interfaces, `reverseSolve.basis` | The basis is set whenever a target was formed, root or not, and absent only when the solve was skipped. Step 4 adds a basis pin on the no-root run. | Without the rule, Task 5's no-root runs give the basis assertion Step 4 adds nothing to pin. |
| 3 | Task 5A Interfaces, `IMPLIED_RETURN_SHARE_BASIS_SPEC`; Task 25 | Task 5A writes the cutoff as the literal next minor above `main`'s spec at the branch base. Task 25 moves `REPORT_SPEC_VERSION` to the same literal. The stamp test pins the two equal and pins `ANNUALIZATION_CONVENTION_SPEC` strictly before it. The plan states that the "cutoff ≤ spec" assertion fails between Task 5A and Task 25, as the golden fails until Task 26. | Stamps move only in Task 25, so at Task 5A `REPORT_SPEC_VERSION` still equals B5's `ANNUALIZATION_CONVENTION_SPEC`. A cutoff equal to it would make test (b) ("a report at B5's spec still gets the note") fail at Step 4. |
| 4 | Task 5A, wiring test comment and Step 2 | The checked-in quote's timestamp (1751731200, 2025-07-05) precedes BV0 (2026-03-31), so Task 5 does not roll that value. The expected HEAD pair is therefore B5's measured 41.5149 against 40.4749, and a different pair is traced. | The comment said "stated at the quote date (Task 5)", and Step 2 said the pair differs "because the solve now meets the discounted cap"; neither holds for this fixture. |
| 5 | Task 31 (d) | The stored reports are the 51 files `[0-9]*.json` (#1 to #52 without #4, which does not exist), not a loop from 1 to 52. They are parsed through `parseStoredReportWithSafety` (strict, else the lenient legacy read, as the app reads them), with each `readMode` recorded and a null failing the run. | A `{1..52}` loop throws on #4. A bare `ReportSchema.parse` rejects legacy reports that the app reads through `withLenientLegacyRead`. |
| 6 | Task 31, new Step 2a, and the PGR and census rows | The harness also runs at the Task 4, Task 5 and Task 5A commits (`t04`, `t05`, `t05a`). The FIN-309 rows are read from `t04` to `t05`, the FIN-506 rows from `t05` to `t05a`. | The before-to-after diff spans Tasks 1–24. Task 8 (restatement collapse in bank metrics and `toCapitalBalance`) and Task 14 can move a financial issuer's book value, return or score, so "per share moves only by Task 5's roll" could not be read from that diff. |
| 7 | Global Constraints (planning documents); Task 30 | "Never `git add` this plan file" is replaced by the master plan's rule: this plan is committed with the batch and registered in `ALLOWED_MARKDOWN` (`tests/repository.release.test.ts:124`). Task 30 stages it, runs `tests/docs.lint.test.ts` too, and rechecks the two `unsafePublicDocument` patterns first. | The master plan ("Where the planning documents are committed") commits each batch's own plan. The old line contradicted it. |
| 8 | Task 29 (DECISIONS closing sentence) | The quoted entry text, whose `[disposition record](2026-10-27-audit-b6-financial-routes.md)` link resolves only from `docs/audit/`, is now in a code span. | Master plan commit trap: `docs.lint`'s link check excludes code spans, and the link does not resolve from `docs/superpowers/plans/`. |

**Checked and found sound (no change).**
- B5 builds no FIN-506 code. B5's Task 22 is a tombstone, and B5's post-integration review confirms that no B5 task touches the excess-return reverse solve. B5 Task 17's per-row cutoffs, together with its use of B3's `specVersionBefore` (added by B5's post-integration review), are what Task 5A's row needs.
- Task 5A's other test expectations:
  - the fallback 15.7117 (`toBeCloseTo(…, 2)` holds to 0.00003);
  - the roll case (96 days from 2026-03-31 to 2026-07-05);
  - the withheld-cap case (HEAD: "skipped: market cap not provided");
  - the control.
- The wiring test's premise holds. `valuationDilutedShares` comes from statement diluted counts (`compute.ts:3790`), not from the quote, so a 3% higher cap leaves the divisor and the value unchanged.
- The harness config depth is right. `replay/b6/` sits four levels below the root, so `root: "../../../.."` and the `vitest.shared` import resolve as in B5's `plans/b5-r4-review/` config. `tests/setup/hermeticEnv.ts` clears only `METIS_` and `THESIS_` variables. The harness writes only `latest.json` and its renamed copies under `replay/b6/`.
- Master plan conflict rows 17, 50 and 58 agree with Task 5A and Task 31 as amended.

**Committed-markdown check.** The reviewer ran the two `unsafePublicDocument` patterns and the `docs.lint` relative-link regex over this file after the edits, read-only, in node. They found no absolute home path and no credential-shaped value. The one link that did not resolve (Task 29's) is now inside a code span, and no other relative markdown link appears outside code.

**Left for the main session.**
- Task 5 itself (FIN-309) was outside this review's named scope except for the case Task 5A re-pins (row 1). Its other expectations (12.4676 → 12.7378, the 200/201-day boundary) were not re-measured.
