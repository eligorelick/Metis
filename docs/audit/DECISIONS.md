# Decisions

Entries are dated design history, not a single current configuration. Later
decisions and the [current audit](2026-10-03-repository-audit.md) supersede earlier
choices. In particular, the current registry prefers Opus 5.5 for `auto` and
uses Sonnet 5.5 for Haiku's judge; D-03/D-06 record their earlier defaults.

This log records selected behavior, cost, data and security design choices,
including revisions after implementation evidence. Each entry lists the options
considered, the risks across
correctness, user cost, data integrity, security, backward compatibility and
reversibility, the choice, and why. Reversible and disclosed beats clever.

## D-73 (debt completeness, 2026-10-16) Withhold partial debt instead of publishing an understated enterprise value

- **Evidence:** A current quarterly EDGAR balance selected a maturity-schedule amount as short-term debt while long-term carrying debt was absent. Adding leases produced a partial total that understated financing debt. The filing's debt note and aggregate XBRL debt evidence conflicted with that construction. Gross principal, maturity schedules and carrying values are different measures and cannot substitute for one another without reconciliation.
- **Choice:** Preserve a refusal when the available debt components do not establish a complete carrying-value balance. Do not fill the refused amount from a partial vendor row or an older balance sheet. Withhold dependent metrics through the existing missing-data path. Complete balances and evidenced zero debt remain eligible. Extension-tag carrying-value extraction is outside this bounded correction; missing data remains visible.
- **Filed debt presentation:** QCOM's [June 2026 10-Q](https://www.sec.gov/Archives/edgar/data/804328/000080432826000086/qcom-20260628.htm) places $12.781B of long-term debt below current liabilities, alongside $2.489B of current debt. Subtracting current maturities again understates the $15.270B carrying total. Bind the exact issuer, accession, dates, currency, scale and columns, and reconcile both current-liability subtotals and full liability totals before applying the filed noncurrent scope. Genuinely inclusive tags retain the subtraction. The supported two-column USD grammar is deliberately narrow; unsupported statements establish no override. Normal acquisition and immutable Stage B/payload admission share the same rule.
- **Versions and preservation:** Report `1.19.2`, payload `1.24.2`, Stage B `STAGE_B_2026_10_DEBT_COMPLETENESS_1`. Prior saved reports, snapshots and analyst artifacts retain their original meaning and cannot resume as equivalent. The complete-debt DEMO projection changes its report-version leaf and adds the float measurement date; all financial values remain pinned. Original analysis and recovery artifacts are retained. New paid analyses require the corrected input context, rather than relabeling old-context work.
- **Float scope:** A dated public-float estimate must not be divided by a differently dated outstanding count or rendered as an impossible percentage above 100%. Keep the measurement and its date visible, withhold the incompatible percentage and its use as a current short-interest denominator, and leave valuation shares unchanged. Legacy reports remain readable; the optional float date preserves new reports' source context.
- **Review boundaries:** Late balance and payload admission require the requested ticker's independently confirmed SEC identity and matching numeric, padded and company-facts CIKs; an FMP-supplied CIK alone does not establish the issuer. An unusable debt or lease component cannot prove a total complete, and a rejected fiscal maturity bucket cannot reduce long-term debt. Normal annual Item 8/15 acquisition retains the bounded pre-notes statements alongside its notes, allowing the advertised 10-K presentation proof to operate. Regression controls retain valid mappings, explicit current/noncurrent carrying debt, raw rejected observations, source periods and the existing text cap.
- **Release gates:** Focused debt/refusal regressions, complete and zero-debt controls, the combined local verify gate, independent review and fresh required remote CI remain gates. The preceding Windows export-test follow-up changes only explicit I/O test deadlines, preserving assertions and application source.

Format: `D-nn (WSn) Title` → Options / Risks / Choice / Why / Disclosure.

## D-72 (PR review, 2026-10-16) Preserve the source and withhold unsupported financial history

- **Status:** Implementation, targeted independent rechecks and the complete local gate are finished. Fresh required remote CI remains the release gate.
- **Evidence:** PR #20 identified nine reproducible boundary issues: merged EX-99.2 financial values lost their originating exhibit, zero-padded exhibits and earnings amendments were omitted, quarterly disclosures bypassed whole-row restatement selection, old reporting currencies suppressed current release facts, missing analyst buckets became zeros, undisclosed interest became zero forecast expense, tagged acquisition cash could be counted twice, and a historical residual could be renamed as a new segment. An earlier push's Windows job also exceeded a five-second test deadline while starting two independently bounded real CLI processes; the PR-triggered rerun passed.
- **Choice:** Preserve per-fact filing provenance, include canonical exhibit spellings and corresponding amendments, reuse whole-row period selection, require established current disclosure currency, and withhold incomplete analyst distributions. Implicit dollars bind to their own release or periodic-filing reporting period; prior currencies cannot be relabeled current. Forecast EPS needs evidenced interest or a matching debt-free balance without contradictory financing components. Keep existing financial grades and thresholds.
- **Amendment boundaries:** Linked Item 9.01 amendments require an exact nonempty SEC event date and inspected earnings scope. Readable unrelated or explicitly non-changing amendments retain the original; unknown/unreadable relevant scope withholds stale substitution. Reporting-period order controls current releases and narratives, including legacy arrays; amendments of older quarters cannot displace the latest quarter. Outlooks for a completed fiscal year are not current guidance.
- **Financial boundaries:** A matching generic acquisition tag can be an aggregate containing a tagged second business payment; it does not prove additivity. A competing nonzero classified acquisitions line leaves the second payment unallocated, with a separate numeric record and partial-coverage warning. Segment residuals require same-presentation filing evidence; cross-filing duration subtraction cannot satisfy that requirement. Unknown interest and unsupported historical residuals remain withheld.
- **Versions:** Report `1.19.1`, payload `1.24.1`, Stage B `STAGE_B_2026_10_NVDA_AUDIT_3`. Prior saved reports and payload artifacts retain their original meaning and cannot resume as equivalent. The audited DEMO comparison changes only the report-version leaf and disclosure currency-basis wording; every financial value remains pinned.
- **Frozen NVDA comparison:** With the original snapshot unchanged, the candidate engine retains all 43 source facts and exactly reproduces the $217.039943 DCF and five EPS values. Acquisition context is now $1.535B on the classified vendor line plus a $13B filed payment whose overlap remains unresolved, rather than an unsupported $14.535B total. The known Groq payment stays visible. This is a candidate calculation comparison over retained parsed inputs, not a rerun of exhibit ingestion or a replacement of the original D-71 model output. No provider calls or historical-report writes were made.
- **CI test boundary:** Keep each CLI subprocess's 20-second hard limit and give the enclosing test the sum of its child limits plus five seconds of overhead. This leaves production deadlines and global unit-test timeouts unchanged. The focused Windows test and typecheck pass locally; fresh full release and remote CI remain gates.
- **Final combined local gate:** `47a43dd` passed `npm run verify`, exit 0: 6,256 product tests (three existing skips), four database integration tests, dependency shape, typecheck, lint, core coverage, enforced per-file risk coverage, production build and zero-vulnerability security audit. Core statement/branch/function/line coverage is 96.33/90.21/98.23/97.56%; risk aggregate is 94.77/87.99/97.52/96.99%. Audited fixture deltas pass. Log: ignored `tmp/d72-final-release-verify.log`. The original checkout's staged patch hash remains `F95A9485D3D224A7E24DC477C879AF6F70E3180F778DAEF7E8C41AC3D17D8DCD`.

## D-71 (live output audit, 2026-10-16) Correct source-bound disclosures without discarding saved analysis

- **Live evidence:** NVDA job `0cf239de-24d5-43c3-9c25-0a030a3bd262` completed as isolated report 3 at 2026-10-16T07:46:29.701Z, on GPT-6.1 Sol, medium reasoning and standard speed. Its snapshot is `6e1f43a73b4d8af967160b3f4ea378b3d6896599179683fa68ef42bf3ae0008d`. Independent arithmetic, without valuation-engine calls, reproduced base/bull/bear $217.039943/$365.939972/$120.491218 and composite 75.19. Market EV, the investment bridge, years 1-4 consensus coverage, sensitivity crossings and leadership presentation reconcile.
- **Corrections:** Preceding per-share units and explicit issuer fiscal labels remove eight false contradictions. Unknown fiscal basis stays unchecked. Fifteen equivalent metric contexts validate under exact producer contracts, retaining wrong-date, definition, entity, formula and currency controls. Officer packages retain recipient and amount boundaries. Deterministic disclosures add 13 source-bound facts to the original 30, with separate concentration periods and qualifications; undated subsequent guarantees no longer borrow July 26 from the commitments table. Exact issuer production wording remains visible.
- **Preservation:** The completed model calls were not repeated. Original report JSON, artifacts, accounting and frozen input remain unchanged. A separate corrected replay binds the original job, snapshot, successful pass artifacts and exact original payload (`1.24.0:aceb7317`), then uses the corrected verification payload (`1.24.0:60cb5f4f`). Export metadata lists changed fields and hashes, and explains that the saved analysts did not see the corrected verification payload. Provider boundaries are disabled for replay.
- **Editorial correction:** The reviewed export changes one identified Vera Rubin sentence from "ramping into full production" to the source's "now in full production". Exact original sentence, source identity/date, quote and hashes are required; wrong source/date/before-text or missing quote reject the edit. Metadata and the report explicitly identify this as an editorial source correction, not new model-authored analysis. No grade, value or assumption changes. Independent review confirmed the original raw database hash and the correction's source truth.
- **Result and limits:** The corrected export has 240/240 registered figures traced, 105/105 factual claims cited, 85/91 numeric claims validated, six numeric claims unchecked, zero contradictions and 14 qualitative claims not machine-validated. These are bounded provenance/consistency results, not exhaustive proposition verification, predictive accuracy or institutional readiness. Existing calibration and presentation limitations remain documented. Full final-source verification and required remote CI remain release gates in the recovery plan.
- **Final local gate:** Application source `ca533a8` passed `npm run verify`, exit 0: 6,188 product tests (three existing skips), four integration tests, typecheck, lint, core and enforced risk coverage, build and zero-vulnerability security audit. Aggregate risk coverage is 94.73/87.79/97.50/96.94% (statements/branches/functions/lines). Audited fixture deltas pass; required remote CI remains a separate release gate.

## D-70 (subscription recovery, 2026-10-16) Preserve selected run settings and reduce section batches

- **Evidence:** The subscription endpoint closes a response at about 15 minutes. The previous judge retry lowered captured reasoning effort after a long cutoff (Max became XHigh), and retries with no completed section repeated the original section batch. Sectioned passes also inherited execution metadata from their last request, which could hide different or missing effort/speed observations in earlier parts.
- **Options:** Lower reasoning effort; repeat the same request; or keep the captured model, effort and speed and reduce the number of sections per request.
- **Choice:** Preserve the captured subscription settings on every attempt, including callers carrying the old effort-step-down hint. A cutoff increments a section-retry count. Analyst transport retries also carry that count when no section completed. Each retry doubles the number of section groups, bounded at one top-level section per request; six doublings bound malformed or excessive retry counts. Existing retry-count and job-deadline limits still apply. A single oversized section may still time out; this is not a completion guarantee.
- **Recovery:** Integrate the existing staged transport/checkpoint package separately from the valuation fixes. Keep bounded final-answer text and complete JSON sections in local atomic checkpoints, keyed by job, payload, selected settings and the exact request; mirror and schema-repair requests remain separate. Record request usage with its launch-attempt owner. A stream without its completion event still fails; a recovered assembly must pass the same final schema validation, and invalid completed assemblies clear their checkpoint.
- **Execution evidence:** Aggregate observed models, effort and service tier across section requests on success, transport failure and repeated invalid JSON, retaining earlier observations beside the final request's usage. An effective effort or speed is stated only when those observations agree and none is missing. A checkpoint contains content, not its original provider execution evidence: if any section is recovered, whole-pass model/effort/speed and complete usage attribution remain unestablished. Requested settings remain distinct from observed settings. Do not certify a recovered report as entirely observed Max/Standard from its last request alone. An output item already excluded as commentary remains excluded from recovery even if its completed-item event omits the phase.
- **Risks and limits:** Smaller requests repeat input context and may consume more plan allowance or wall-clock time. Usage journals preserve observations for manual audit but are not automatically reconciled after a worker dies before settlement. No new live-provider or model run validates provider timing or guarantees that requested settings are honored. Checkpoints are local recovery artifacts, not independently authenticated provider receipts.
- **Validation:** Nine regression cases fail against the staged recovery package before these corrections; all ten selected regression/control cases pass afterward. Additional failing-first cases cover excluded commentary recovery and mixed execution evidence on transport and invalid-JSON failures. Tests cover analyst retry counts with no completed sections, bounded analyst/judge batches, unchanged captured model/Max/Standard, matching/different/missing provider effort and speed, checkpoint recovery, and continued schema validation. Fresh typecheck, lint, 6,157 product tests (3 skipped), 4 integration tests and the exact audited-delta comparison pass. Independent review found no remaining material issue in the reviewed corrections. Primary checkout staged blobs and active jobs are preserved; integrated coverage/build/security verification remains a separate gate.

## D-69 (NVDA recovery integration, 2026-10-15 PDT) Preserve interrupted work and separate calculation conventions

- **Evidence:** Claude's original final-report audit and round-three assignments were recovered from its local session, then checked against the open "NVDA report audit and fixes" app. D-68 was already merged at `bcdeba7`; D-65 and D-67 survived uncommitted; D-66 had a committed verifier fix plus unfinished filing extraction.
- **Choice:** Complete the recovered work in its existing worktrees, merge all four domains, and preserve the main checkout's unrelated staged transport/checkpoint changes. Do not reset or overwrite historical reports.
- **Versions:** Report `1.19.0`, payload `1.24.0`, Stage B `STAGE_B_2026_10_NVDA_AUDIT_2`. Score bands stay unchanged. Older payload artifacts cannot resume as equivalent, older snapshots require their original engine, and report comparisons disclose the convention mismatch.
- **Integration:** Keep both D-68 forensic notes and D-67 grade-context handling in print output. Re-pin the combined payload for D-65's financial changes, D-68's +80 label bytes and D-66's +15 technical-tag bytes: 132,882 prompt bytes, 531 numeric records, 74 citations. The version bump changes only its fingerprint afterward. Audited delta groups retain their individual rationales; this group's only financial-fixture leaf is the report version.
- **Review correction:** Projected interest expense must use a quarter in the model's established currency and no later than the DCF statement anchor; otherwise retain the compatible annual fallback. Two rejected-quarter regression cases failed before the correction and passed afterward, with a valid USD TTM control retained.
- **Final review corrections (2026-10-16):** Executive evidence categories are derived from the validated metric contract; compensation cannot unlock a performance grade. Multi-party transaction notes withhold ambiguous attribution. Figure deduplication requires the same metric and period/unit/currency basis, preserving equal-valued cash and debt. Data-only DCF tables inherit the established model currency. A read-only reviewer reproduced these boundaries and the retained credit-support clauses and dated Groq accrual at `bb73f2b`, finding no remaining material issue within that code-review scope; generated-prose review remains a separate release gate.
- **Frozen calculation:** The integrated engine reproduces base/bull/bear $217.04/$365.94/$120.49 on the original acquired inputs, versus $296.32/$501.15/$163.44 under `6e5367a`. This is a calculation comparison with fixed inputs, not a new forecast backdated to the original run.
- **Limits:** Consensus breadth/dispersion and peer-size gates are disclosed house rules. Unreported fiscal revenue is calendarized evenly. Dimension-only locked-up equity is not guessed into the bridge. Same-family model review is disclosed; software tests and numeric matches establish bounded consistency, not forecast accuracy or institutional readiness.
- **Release gates:** Full combined verification, a fresh live NVDA run, report/export review and fresh required CI are tracked in `docs/superpowers/plans/2026-10-15-nvda-round3-recovery.md`. The interrupted baseline run passed product/integration/core coverage and was stopped during risk coverage to validate the combined source instead; it is not claimed as a full gate pass.

## D-68 (NVDA final-report audit, forensics round 3, 2026-10-16) Name what is missing, what was bought, and what is a note

- **Evidence** (final live run, report 1, run-input snapshot `041924526ebb…` captured 2026-10-16T04:20Z, a US evening):
  - **Leadership** printed "Repurchase timing is unavailable", evidence 45%, score 61 (C), shown as "Not assessed — limited evidence". The D-61 replay of an earlier snapshot had measured +5.2% with 100% of buyback dollars covered.
  - **Accrual growth note** said revenue and NOA grew "over the same two years"; the comparison is one fiscal year against the prior.
  - **Unexplained drivers.** Nothing said that NVDA's NOA growth, AQI 1.57 and GMI 1.06 carry an acquisition (goodwill $5.19B → $20.83B, $13.0B tagged `PaymentsToAcquireBusinessTwoNetOfCashAcquired`), strategic investments (long-term investments $3.39B → $22.25B) and inventory write-downs, so the forensic text read the growth as unexplained operating-asset expansion.
  - **Flags table.** Four methodology notes were "low" severity rows in the Flags table, beside the findings.
- **Root cause of the missing timing**, reproduced offline on a copy of the frozen snapshot (`runStageB` only):
  - **Executions were found.** `repurchaseExecutions.ts` was not the cause: its share-basis check passed for all five years with repurchase tags (basis day 2026-10-15, which the split list covers).
  - **The year-average price was missing.** It is market cap over the fiscal window ÷ basic weighted shares, and the market-cap history was empty. FMP refused the endpoint (HTTP 402), and the keyless derivation withheld all 1,254 days: before afbed58 the closes were dated by the fetch's UTC day, 2026-10-16, which no split list could cover.
  - **The note blamed the tags.** It fell through to "no tagged repurchase share count and cost on a known share basis matches the fiscal years".
  - **afbed58 restores it.** Re-deriving the keyless market caps with its basis session (the newest bar, 2026-10-15) restores all 1,254 days and timing +5.18% at 100% coverage. With the fetch day, every day is still withheld.
- **Options**:
  - Timing: (a) a fallback year-average price from the daily closes when market caps are missing; (b) keep one measure and name the missing input.
  - Notes: (a) keep them as "low" flags; (b) a pipeline-owned `quality.notes` list under the forensic table.
  - Drivers: (a) a generic caveat; (b) the statement figures behind each driver.
- **Risks**:
  - Timing (a) needs the closes' basis session, which only the keyless layer knows; the keyless market caps already carry that guard. With afbed58 the case that emptied the history no longer occurs, so (a) would rarely trigger and would mix two price proxies across years.
  - Drivers (b) needs data the vendor rows lack: inventory write-downs, and a second acquisition that FMP folds into other investing. These come from the filer's tags. The acquisition payment is attributed only when the row's other investing outflow holds it, so it is never counted twice.
- **Choice**:
  - **Timing (b).** When timing is not measured, `computeCapital` says which side is missing: the years whose tagged price has no year-average price and why, the years outside the plausibility band, or no tagged pair. A fixture trimmed from the frozen snapshot pins the chain on NVDA's real inputs: the keyless market caps derived on the newest session, the executions, and timing +5.18% at 100% coverage.
  - **Growth note.** The note says "in the fiscal year ended …". The payload's two growth rows say "in the accrual fiscal year (year over year)".
  - **Acquisition note.** The note is written when the increase in goodwill and other intangibles, or the cash paid for acquisitions, is at least 10% of the NOA increase (house rule). It gives goodwill and intangibles at both year ends, the cash paid, and the acquired share of the NOA increase. With that note or the growth note, a composition note splits the NOA increase by line.
  - **Beneish context.** When M is above the "unlikely" band, AQI above 1 is decomposed into goodwill, other intangibles, long-term investments and the remaining non-current assets, with AQI recomputed without the first three. GMI above 1 is explained by the margins and the inventory write-downs the filer tags (`InventoryWriteDown`), recomputed with them added back. Context, never graded.
  - **Notes, not flags.** The definition, house-band, growth and context notes become `report.quality.notes`. That field is pipeline-owned and removed from the judge request schema. The Flags table keeps findings. The renderer's duplicate definition string is no longer added; a pre-D-61 result, which records no definition, still gets the broad-screen explanation.
  - **Wording.** "Capex, acquisitions stay in" now reads "Capex and acquisitions stay in" when nothing is unclassified.
- **Why**:
  - A missing input should be named where it is missing. The tags were present, and saying otherwise sends the reader to the wrong source.
  - An acquirer's goodwill and a strategic investor's stakes raise AQI as capitalised costs would, and an inventory charge lowers gross margin as pricing pressure would. The statement lines can tell them apart; the index alone cannot.
- **NVDA, frozen inputs** (offline replay; scores do not depend on the D-68 text):

  | Item | Live run (pre-afbed58 market caps) | afbed58 market caps + D-68 |
  | --- | --- | --- |
  | Market-cap days | 0 of 1,254 | 1,254 |
  | Repurchase timing | unavailable; note blamed the tags | +5.18%, 100% of dollars covered |
  | Timing note | "no tagged repurchase share count and cost … matches" | (D-68 text when missing: "tagged repurchase prices were found for 4 of 4 fiscal years … but no year-average price … (no market-cap history inside the fiscal window)") |
  | Leadership | 60.83 C, evidence 45% | 61.64 C, evidence 100% |
  | Valuation | 85.96 A, evidence 70% | 86.57 A, evidence 100% |
  | Composite | 76.59 B | 79.54 B |
  | Business quality | 77.91 | 78.80 |
  | Quality | 60.03 C | 60.03 C |
  | NOA increase | unexplained | $40.90B: goodwill and intangibles +$18.14B (44%), receivables +$15.40B, inventory +$11.32B, PP&E +$5.17B, other +$6.95B, operating liabilities +$16.09B; $14.54B paid for acquisitions ($1.54B acquisitions line + $13.00B tagged business acquisition) |
  | AQI 1.57 | no decomposition | soft assets $23.40B (21.0% of TA) → $67.95B (32.9%); without goodwill, intangibles and long-term investments 0.83 |
  | GMI 1.06 | no decomposition | margin 75.0% → 71.1%; tagged write-downs $4.00B vs $1.60B; added back 76.2% → 72.9% (GMI 1.05), 0.6pp of the 3.9pp decline |

  - **Write-downs vs the H20 charge.** The tagged write-downs explain 0.6pp of the 3.9pp margin decline. The 10-K's "$4.5 billion charge … associated with H20 for excess inventory and purchase obligations" also covers purchase obligations, which are not inventory write-downs. The note states only what is tagged; the H20 charge reaches the analysis through the filing excerpts.
- **Disclosure**:
  - **Tests.** `tests/stageB.forensicsR3.test.ts` covers the NVDA timing chain on `fixtures/financial/nvda-buyback-timing-20261016.json`, the missing-side note, the forensic notes, and notes vs flags.
  - **Payload.** The payload golden moves +80 prompt bytes for the two relabelled growth rows (no new record on that fixture). The new forensic payload rows (goodwill, the acquired share, cash paid, AQI and GMI recomputed, tagged write-downs) appear only when their note does.
  - **Audit deltas.** The group `forensics-r3-2026-10-16` records DEMO's notes moving to `report.quality.notes` and its acquisition and composition notes (DEMO pays 100M for acquisitions with goodwill unchanged).
  - **Versions.** `PAYLOAD_VERSION`, `REPORT_SPEC_VERSION` and `SCORE_BANDS_VERSION` are unchanged, as instructed: no score, band or ratio moves, and the new report field is optional.

## D-65 (independent audit of the NVDA report built on metis-final.db, report 1, 2026-10-16) Consensus where it exists, one net cash in every EV, robustness on both grids, a dated value

- **Evidence**: the audit of the live NVDA report (spec 1.18.0; frozen inputs replayed offline through `runStageB` on a copy of `metis-final.db`, which reproduces bull $501.15 / base $296.32 / bear $163.44 at `6e5367a`) found:
  - **P0, consensus beyond year two.** The base path was called "consensus-anchored", but only years 1–2 used consensus. The D-58 fade from year two's 46.9% put years 3–5 9–45% above the FY+3…FY+5 consensus the same cached FMP response held (FY ending 2029-01 $924.4B from 38 analysts, 2030-01 $1,106.5B from 30, 2031-01 $1,161.0B from 35). The auditor's rebuild with years 1–4 on consensus and the same fade gave about $208.
  - **P2-2.** Year one spread FY2027 consensus evenly over its days although H1 FY2027 ($177.84B) was already reported.
  - **P1, enterprise values.** The key-data EV ($5.21T, D-60 net cash −$23.22B), the EV multiples (25.7× EBITDA and 17.1× sales, which reconcile only to $5.17T: `multiplesFramework` resolved net debt without the $42.78B equity securities), the provider's $4.77T and the DCF's $7.13T all printed as "Enterprise value".
  - **P1, robustness.** "All valid cells remain above the current price" read only the WACC × g grid; four year-one growth × margin cells sat below $217.23.
  - **P2-1.** The $51.16B of long-term investments left invested capital (D-60) but never entered the equity bridge.
  - **P2-3.** Flows were discounted to 2026-07-26 and compared with the 2026-10-15 price; the diluted-vs-outstanding share basis was a payload note only.
  - **P2-4.** The bull's +10.12pp margin shock was removed entirely by the scenario cap but still printed, so the 62.95% weighted margin did not reconcile to ±10.12pp.
  - **P2-8.** Forecast EPS deducted FY2026 interest ($0.26B, flat) although $25B of notes were issued in Q2 FY2027 (Q2 interest $227M).
  - **P2-9.** An unused "near-term growth 25.0% (range …)" row, and an "analyst-consensus case 76.11%" whose legs were not printed.
  - **Presentation.** The scenario-decay paragraph printed three times and the flat-share paragraph twice; "shaded band" named a chart the export does not have; the FCF heading promised history the table does not show; projected "Diluted EPS" and the page-1 forward P/E were operating EPS.
  - **Triggers.** The $105.84B and 73.5% thresholds cited `sec:8-K EX-99.1 …`, which no registry record carries (both "untraced").
  - **Peers.** The peer list showed a customer (CoreWeave) and listings of $265M and $29M beside a $5.24T issuer.
- **Options**: (a) disclose the D-60 path's gap to consensus and keep it; (b) anchor every year consensus covers, with no quality gate; (c) anchor every year consensus covers **with adequate breadth and agreement**, fade after the last; plus, for each finding, the narrowest change that makes the printed figure true.
- **Choice**: (c), and:
  1. *Consensus path* (`buildRevenueAnchor`, `calendarizeConsensusWindow`). Every explicit window is calendarized against the fiscal-year estimates. A year takes consensus growth (window over window; the level itself when consensus set year one) while every estimate behind it has at least `MIN_CONSENSUS_ANALYSTS` = 3 analysts and an implied dispersion (high − low) ÷ (d2(n) × mean) of at most `MAX_CONSENSUS_CV_PCT` = 25%, and its growth stays within [−10%, max(25%, the prior year)]. Rows without a count or range keep the D-60 rule for years 1–2 and are refused beyond. The stretch is contiguous, and the final year is always the fade's. The fiscal year the first window starts in contributes its consensus less the revenue already reported in it (`FiscalYearToDate`, built from the quarters after the latest annual statement). Disclosure: a "consensus-anchored years" row, a "DCF path vs consensus" table (`dcf.consensusPath`), the anchor basis naming each anchored year and why the next is not, and a payload note telling the analysis to name those years. Projection and growth-path text say "years 1–4" instead of "consensus-anchored".
  2. *Enterprise values.* `MultiplesBalance` and the own-history rows carry the filed `marketableEquitySecurities`, so `resolveNetDebt` gives the multiples the same net cash as the bridge. The labels are "Enterprise value (market)" (key data), "Intrinsic enterprise value (DCF, operating assets)" (bridge) and "Provider enterprise value (vendor definition, period end)".
  3. *Robustness.* `summarizeSensitivity` reads both grids. "Robust" needs every valid cell of both on one side of the price; otherwise it counts each grid's cells at or below the price and names the growth × margin cells.
  4. *Long-term investments.* `DcfAssumptions.nonOperatingInvestments` records what sales-to-capital removed, and the bridge adds exactly that back at its filed carrying value, citing the XBRL non-marketable carrying value when present (`nonMarketableEquityCarrying`). Bridge rows list each non-operating asset.
  5. *Valuation date.* `DcfAssumptions.valuationDate` moves every discount exponent back by the years from the statement date to the quote date (at most 200 days). The bridge keeps the statement-date balance. The bridge prints the date and factor, plus the shares outstanding at the quote beside the diluted divisor, which is kept.
  6. *Scenario margins.* `effectiveMarginDeltaPp` records the shift that survives the cap. The construction table, the target basis and each scenario's inputs print it beside the request, and the weighted margin reconciles.
  7. *EPS interest.* `interestRunRate`: the latest quarter's interest over its average debt (operating leases excluded), applied to the closing debt; else the quarter × 4; else the fiscal year.
  8. *P2-9.* The near-term row prints only when it set year one, and the consensus method prints both legs (35.26% over 183 days annualized to 82.73%; 69.50%).
  9. *Presentation.* The decay paragraph is the scenario-construction table's note alone (the target basis points to it); the flat-share paragraph is the capital-return table's note alone (the payload still carries it). "Bull-to-bear spread" replaces "shaded band". Forecast-only tables are headed "Free cash flow to the firm (FCFF)" and "Operating EPS (diluted shares)", the chart's EPS label says "historical GAAP diluted; forecast operating", and the key-data row is "Forward P/E (model base-case operating EPS)".
  10. *Triggers.* `guidanceLowCitation` returns the guidance-table record's id (`payload.issuer-filings.q3-fy2027-revenue-guidance-low`, `…-gross-margin-gaap-guidance-low`).
  11. *Peers.* `peerSizeExclusion`: candidates more than `PEER_SIZE_RATIO_LIMIT` = 100× smaller or larger than the subject by market cap are excluded at discovery and at comparison, and are named in a payload note rather than listed as peers.
- **Why**:
  - **Consensus.** It is the only forward evidence of the level that the provider response carries. Once it covers a year, a mechanical fade has no better claim to that year.
  - **Breadth gate.** A mean of one or two forecasts is not a consensus. Dispersion needs two or more estimates (Diether, Malloy and Scherbina 2002), and three give the range an interior point.
  - **Agreement gate.** The raw range grows with the number of analysts, so it is normalised by d2(n), the expected range of n normal draws (Tippett 1925; Harter 1960 tables), into an implied standard deviation. Dispersion measures uncertainty about the level (Barron, Kim, Lim and Stevens 1998), and above 25% one standard deviation spans half of it.
  - **Growth band.** It is D-58's year-two bound, applied to every later year.
  - **Reported half.** Subtracting H1 uses the issuer's own reported fact instead of an even-spread assumption.
  - **Enterprise values and investments.** The EV, bridge and investment changes put each figure on the definition its label states.
  - **Roll-forward.** The value and the price it is compared with now share a date. The bridge stays at the statement-date balance because cash generated since then is already in the first window's flows.
  - **Size screen.** Size is a priced risk characteristic (Fama and French 1992). Industry, not size, is the decisive comparable screen (Alford 1992), so the bound is two orders of magnitude.
- **NVDA, frozen 2026-10-15 inputs** (offline `runStageB` on a copy of `metis-final.db`):

  | Item | Before | After |
  | --- | --- | --- |
  | Base / bull / bear per share | $296.32 / $501.15 / $163.44 | $217.04 / $365.94 / $120.49 |
  | Upside vs $217.23 | +36.4% | −0.1% |
  | Years on consensus | 1–2 | 1–4 (FY2032 has no estimate) |
  | Revenue, years 1–5 | $551.8B, $810.5B, $1.10T, $1.40T, $1.69T | $578.3B, $810.5B, $1.01T, $1.13T, $1.24T |
  | DCF vs calendarized consensus, years 3–4 | +8.7%, +23.9% | 0.0%, 0.0% (year five not covered) |
  | Intrinsic EV (bridge) | $7.13T | $5.15T, stated at 2026-10-15 (× 1.0279) |
  | Non-operating assets added | $42.78B | $42.78B + $51.16B |
  | Market EV / EV/EBITDA / EV/Sales | $5.21T (box), multiples on $5.17T: 25.7× / 17.1× | $5.21T everywhere: 25.9× / 17.2× |
  | Sensitivity conclusion | robust: all valid cells above | sensitive: 13 of 25 WACC × g cells and 9 of 15 growth × margin cells at or below the price |
  | Operating EPS, year one / year five; interest | $12.34 / $36.91; $0.26B | $12.89 / $26.97; $1.45B (4.34% on $33.4B) |
  | Reverse-DCF implied year-one growth | 68.0% | 90.9% (base 90.9%) |
  | Valuation score / composite | 86 A / 77 B | 55 D / 72 B |

  - **One-at-a-time reverts** from the after state: the D-60 two-year path +$89.59, the roll-forward −$5.76, the investments add-back −$2.11, the even-spread year one −$0.53. The auditor's rebuild (years 1–4, even spread, no roll-forward or investments) reproduces at $208.66.
  - **Before-state check.** On the before state the new robustness rule reads: all 25 WACC × g cells above, and four growth × margin cells below (growth −20pp at margin −10pp to 0pp; growth −10pp at −10pp) (tests/stageB.valuationD65.test.ts).
- **Risks**:
  - Consensus can herd and goes stale: the gates measure breadth and agreement, not accuracy. Long-horizon sell-side growth is optimistic on average (Chan, Karceski and Lakonishok 2003), though here consensus lies below the house fade.
  - The 3-analyst, 25% and 100× thresholds are unbacktested house conventions (RESEARCH §8).
  - The fiscal year after the reported part is still spread evenly, which for a fast grower overstates its early quarters. For NVDA, half of FY2028 is $346B, against about $302B if FY2028's quarters grew at a constant rate from Q4 FY2027's implied $124B (H2 consensus $231.96B less the $108B guided Q3).
    - On that shape year one would be about $534B. That is 7.6% below the $578.3B used, and 3.2% below D-60's even-spread $551.8B. The H1 subtraction alone therefore moves year one away from the shaped estimate.
    - Value barely moves (+$0.53 a share), because year two is anchored at the consensus level either way.
    - The printed year-one growth (90.9%) and the shocks and reverse DCF measured from it are high by about that gap.
    - No within-year shape is assumed, because no source supplies one.
  - The roll-forward compounds at the WACC and ignores distributions since the statement date (NVDA paid dividends and bought back shares in the interim, roughly value-neutral at the quote).
  - The size screen removes Cerebras, a direct competitor, alongside the micro-caps. It cannot recognise a customer: CoreWeave leaves on size alone.
- **Not fixed**:
  - NVDA's $4.96B long-term portion of locked-up public equity sits in other assets and is tagged only with a dimension that companyfacts omit, so it stays in operating capital and outside the bridge ($0.20 a share).
  - LLM-written prose that says "consensus-anchored" is steered by the payload note, not rewritten. No live run was made to confirm it.
  - Year one and the anchored years still assume the base margin path; consensus EBIT (also in the response) is not used.
- **Disclosure**:
  - Assumption rows "consensus-anchored years" and "valuation date"; the "DCF path vs consensus" table; bridge rows for each non-operating asset, the quote date and factor, and shares outstanding; the scenario-construction column "Margin shift after the cap".
  - Payload notes for consensus anchoring and peer size exclusions; peer methodology text.
  - Tests: `tests/stageB.valuationD65.test.ts` (9 tests, all failing on `6e5367a`). Re-pins, each with its reason: `tests/stageC.payload.passes.test.ts` (+1,045 prompt bytes, same 531 records and 73 citations), the projection-label pins, and two WACC-grid-only sensitivity tests that now null the second grid.
  - Audited delta group `valuation-r3-2026-10-16` (163 DEMO leaves: consensus years 1–5, the $0.5B investments add-back, per share 146.23 → 154.97).
  - `REPORT_SPEC_VERSION`, `PAYLOAD_VERSION`, `SCORE_BANDS_VERSION` and `STAGE_B_IMPLEMENTATION_VERSION` are left for the integrator. All new report fields are optional.
  - Recovery validation: the frozen snapshot replayed offline against archived `6e5367a` and the recovered tree reproduces both sides of the table above. The nine D-65 tests fail against that archived source and pass against the recovered source. Fresh typecheck, lint, 6,052 product tests (3 skipped), 4 integration tests, core coverage and the exact audited-delta comparison pass; risk coverage is checked separately before integration. These checks establish implementation consistency, not forecast accuracy.
## D-67 (NVDA final rerun audit, presentation round 3, 2026-10-16) One display rule per figure, label and gap; count a data gap once

- **Evidence**: the final NVDA rerun (report 1, `metis-final.db`, 147,674 bytes / 1,510 lines of Markdown) re-rendered byte-identically on `claude/nvda-audit-integration` and showed: 11 ".00M" amounts ("$959.00M", "−$175.00M", "$438.00M") and 21 ".00B" ("$279.00B" for the release's "$279 billion"); FCF conversion printed three ways (65.8% in the drivers, 0.7× in key numbers, "0.6585x" in a claim) and the accrual ratio four ways (59.8%, 0.6×, 0.60, "0.5977x"); 28 claim or basis figures at four or more decimals ("USD 296.3179 per share", "426.7365x", SMA "223.1738", Beneish "1.5671x", WACC "13.2142%"); scores "85.96"/"60.03" beside an integer scorecard; 59 raw ids in the body (registry ids, manifest fields and `edgar:`/`sec:`/`fred:` citations: multi-citation brackets such as `[computed.valuation.reverse-dcf-… · d; computed.valuation.consensus-… · d]`, `edgar:10-K item1`, the source-fact "Source identity" column, `computed.valuation.*`, `sec:8-K …`, `fred:DGS10`) and mechanical labels ("Pricetobook current", "Timing %", "Weighted epsdiluted", "… guidance 4", "Product market platform data center share of revenue quarter ended …"); the FMP annual segment tables beside the quarterly XBRL tables (with "Other Americas" for the filing's "Other"); 56 lines of peer methodology; six identical "not-assessed" executive cards printing the raw enum; Leadership "Not assessed — limited evidence" in the strip and header while the scorecard printed "61 C" and counted it, beside "Fundamentals confidence: high" under a Degraded data state; an EPS bridge mixing $/share and $B rows without its adjustment line; "9 warnings" that were one market-cap gap three times, three LLM process disclosures, a verification finding, an FMP filing-search 402 that EDGAR made moot and an FY2019 lease `period_mismatch` at the ASC 842 adoption date; and "The shaded band is the scenario range" where no chart is drawn.
- **Options**: (a) fix the pipeline strings and severities at their source; (b) display rules in the shared presentation layer, applied by all three surfaces to stored and new reports alike; (c) both.
- **Risks**: (a) leaves every stored report as it is, and re-emitting manifest severities changes the persisted `dataCompleteness` counts, so stored reports would stop confirming against their manifest. (b) rewrites how stored LLM prose prints (rounding, labels); the stored bytes, the verification log and the audit export keep the original text. Rounding prose at display could in principle change a figure the verifier read; the rule only rounds a figure stated more precisely than the prose-precision prompt rule (6e5367a) asks for, and the verifier compares at the stated precision.
- **Choice**: (b). Prompts, computations, payloads and version stamps are unchanged; `src/pipeline/stageB/projections.ts` (the "shaded band" sentence) is left to the valuation work.
  1. *Numbers.* Report money prints a whole amount at its scale without decimals ("$959M", "$279B"); a rounded amount keeps them ("$29.00M" for 28,995,200; "$113.00B" for 112,998,066,176), and charts and share counts keep the fixed digits. FCF conversion and the accrual ratios print in whole percent everywhere (driver, key number, claim, forensic table: 66%, 60%). Stored prose figures are shown at reader precision only where over-stated: per-share amounts to cents, multiples to one decimal (two below 10×, two significant digits below 0.1), percentages with four or more decimals to one, percentage points to one, trillions/billions with four or more decimals to two, other numbers with four or more decimals to two, "N.NN on the 0–100 scale" to an integer, "$432.00B" to "$432B". A three-decimal coupon ("4.250% Notes"), an exact-to-the-million amount ("USD 7.771 billion"), versions and timestamps are untouched.
  2. *Ids and labels.* Every citation in a bracket is labelled (several per bracket), bare ids in pipeline prose read under their labels (a wildcard as "valuation model outputs", `sec:`/`fred:` prefixes as the filing or "FRED DGS10"), new exact and pattern labels cover the ids the rerun cited, a trailing period phrase is parenthesised ("(quarter ended …)"), and the source-fact identity column moves to the audit export. The data-gap tables name gaps by label ("Market-cap history", "Legacy entity validation"); manifest fields stay in the audit export.
  3. *Segments.* Beside the quarterly XBRL tables the annual FMP tables leave the body; the audit export keeps them as served. A segment axis's own filing note ("total less the other rows") moves from the guidance track record to its segment table.
  4. *Peers.* The body keeps two lines (candidates evaluated, eligible issuers, screen exclusions, the comparability caveat) and the comparison table; the screen rules, per-metric notes and each exclusion are in the audit export.
  5. *Executives and Leadership.* Officers with neither grade assessed are named on one line per distinct reason, with their cited facts beneath; the raw enum is never printed. One rule for an aspect under the 50% evidence floor: no surface shows its letter (strip, header, scorecard band cell, live chip; history, watchlist and diff already withheld it), and every surface shows the same deterministic score with the marker and the evidence share ("Not assessed — limited evidence (score 61/100 on 45% of signals)"). The composite is unchanged: it already weights each aspect by its evidence share, and the scorecard note says Leadership enters at 4.5% rather than 10%. The judge's "retain the proxy grade" text is shown as written. Displayed section confidence is capped by the data state, as D-50 caps it by an aspect's coverage: at most medium beside a data warning or unconfirmed completeness, low beside a critical gap ("medium — capped from high: 1 data warning"); stored labels are unchanged.
  6. *EPS bridge.* One per-share table that foots (GAAP EPS, the adjustment as non-GAAP less GAAP, non-GAAP EPS) and a separate table of the itemized amounts, labelled as the lines captured rather than a bridge.
  7. *Completeness.* `classifyManifest` reads the manifest as a reader counts it: one row per underlying dataset (`fmp.historicalMarketCap`, `keyless.marketCapHistory` and `.shareBasis` are one gap); `llm.*` and `verify.*` entries are analysis-process disclosures, counted apart; an FMP filing search when EDGAR is available is shown as information with the reason. Lease period mismatches remain actionable: a date alone does not establish issuer adoption or distinguish operating from finance leases. Critical entries are never downgraded. The header, the appendix sentence, the gap tables, the family table ("highest severity as shown"), the job panel and the evidence rail use these counts. The persisted `dataCompleteness` keeps its meaning (warn-level entries), so stored reports still confirm.
  8. *Charts.* The Markdown and print exports, which draw no chart, drop a sentence pointing at the "shaded band"; the live view keeps it beside its fan chart, and its "(computed.projections.*)" caption loses the id.
- **NVDA re-render (frozen report 1)**: Markdown 147,674 → 137,749 bytes, 1,511 → 1,418 lines; raw ids in the body 59 → 0 (print and visible live text 0; the live view keeps ids only inside its collapsed provenance details); ".00M" 11 → 1 (the rounded $29.00M), ".00B" 21 → 2 (rounded DCF-path cells); four-or-more-decimal figures 28 → 0; data warnings 9 → 2 (market-cap history and the unresolved lease mismatch), with 4 process disclosures and 1 entry shown as information. Fresh recovery verification also rendered print at 188,754 bytes; print and visible live text each had zero raw ids and zero four-or-more-decimal figures (collapsed provenance retains the originals).
- **Recovered filing supplements**: the optional D-66 typed filing facts, management commentary outlook, officer changes, say-on-pay vote and Rule 10b5-1 arrangements have deterministic tables shared by Markdown, print and live views. They render independently of analyst prose, retain issuer qualifiers, dates and derivations, keep anticipated departures unconfirmed, and distinguish plan capacity from executed sales. The audit export retains their raw records. The presentation adapter accepts the optional structural contract without changing the schema or pipeline in this branch; D-66 supplies parsing and persistence.
- **Why**: one shared rule per figure, label and gap keeps the three surfaces from drifting, applies to stored reports without rewriting them, and makes the header count name what is actually missing.
- **Disclosure**: tests in `tests/report.presentation.d67.test.ts`; re-pinned assertions name D-67 (whole amounts, gap labels in the body, the peer summary, the data-warning wording). The audit export gains "How the report body reads this record" (the classification table, the annual provider segments, the peer screen and the source-fact table with ids). `npm run audit:deltas` moves no leaf.
## D-66 (NVDA final audit 2026-10-16) Bind prose conservatively and retain the filing evidence behind it

- **Evidence**: the final NVDA rerun left 65 numeric FACT claims unmatched, mostly verifier false negatives. Score scales, 12M window labels, equivalent metric heads, comma-scoped executive titles and quarter/year-to-date table columns were not read correctly. Concentration passages, annual business-combination notes, interim financing payments and trading-plan disclosures were omitted or lacked typed records.
- **Choice**: retain explicit metric synonyms while requiring definition-changing modifiers, units, sign, period and window. Only the three known segment axes may be omitted from a label; arbitrary colon prefixes remain required. A table's declared scale always applies, including amounts stated without a scale word. Explicit `USD millions:` TracedNumber declarations remain supported. Quarter and year-to-date date runs bind separately with or without change columns; ambiguous dates/columns stay unchecked. GAAP and net modifiers stay required in excerpt matches. DSO is checked in days.
- **Evidence carried**: read 10-K notes from Item 8 or Item 15, 10-Q Part II Item 5, and bounded interim statements. Register investment balances and lock-ups, equity-method/VIE exposure, investment cash flows, Groq consideration/goodwill/intangible and financing payment, supply commitments, financing-platform lower bound, and the two latest CFO commentaries' DSO/outlook. Carry officer transitions, disclosed appointment packages, say-on-pay and trading arrangements as optional typed disclosure fields. Periodic evidence is retained even without an 8-K or quarterly trend.
- **Budgets**: 10-Q notes 14,000 characters (was 12,000), with a quarter reserved for concentration and deal passages; 10-K notes 10,000; 10-Q Other Information 2,500; condensed interim statements retained for parsing up to 12,000. The maximum added raw prompt-excerpt budget is 14,500 characters, plus typed fact rows. Coverage and truncation remain disclosed. No version constant changes.
- **Prompt guidance**: distinguish methodology/data-gap judgments from issuer facts, require real source IDs, keep dated product status and material geography/reclassification explanations, justify risk likelihood separately from impact, compare DSO outlook with later results, describe departed officers as transitions, and distinguish plan capacity from executed sales. Avoid repetitive unsupported executive cards and irrelevant normalization boilerplate.
- **Validation boundary**: saved SEC fixtures exercise extraction, schema, prompt registry and conservative counterexamples. These checks establish source/metric consistency, not investment correctness, predictive accuracy, live-provider behavior or future LLM compliance. No live model run was made. Annual notes of Form 20-F remain an explicitly disclosed unsupported extraction path.
- **Review safeguards**: validated compensation cannot unlock execution or credibility merely by appearing in the model's chosen evidence bucket. The verifier records a pipeline-owned metric classification for eligible typed guidance track records and realized statement outcomes; the final executive gate consumes that classification across buckets. Unknown or excerpt-only metric semantics remain unassessed. Business-combination facts are withheld when a note names multiple transaction parties, until amount-to-transaction scope can be established.
- **Acquisition replay follow-up**: the frozen round-3 snapshot acquired the OpenAI reimbursement/indemnity clause and discretionary additional 3.8 GW option, but neither survived retained excerpts. Credit-support clauses now receive event priority and whole-clause deterministic event context; only these events receive an 1,800-character cap (ordinary events remain 1,200), with the combined cap raised by 600 to 8,600. On that snapshot all nine event excerpts remain, total 8,580 characters, and serialized prompt size increases from 309,009 to 309,840 characters. The current $986 million Groq accrued consideration is registered from the July 26, 2026 liabilities table only when its row number matches the Groq footnote; absent/mismatched dates or footnotes withhold it. The older $4 billion consideration and $2.944 billion cash payment retain their separate dates and meanings.
- **Saved-report metric-context follow-up**: the original round-3 payload (`1.24.0:aceb7317`) and saved report reproduce 15 equivalent typed-record names that stayed unchecked. Read producer-bound quantitative scores, standardized quarterly FCF, appointment-package metadata, forward FCFF/operating EPS and the exact say-on-pay formula; distinguish a guidance issuance date matching its filing record from the guided fiscal period. Preserve current trailing P/E and the explicit six-month relative-strength horizon, and read lock-up as a restriction rather than an upward change. Before/after replay of all 175 saved prose claims changes exactly those 15 from unchecked to validated. Wrong accounting basis, date, window, entity, award basis, formula numerator/denominator, currency and direction remain rejected. The Beneish claim's unstated annual source scope, vague SPY horizon and ambiguous filing passages remain unchecked; this establishes source consistency only.
- **Saved report-three verification**: leading "per share is/was USD" and an explicit numeric "score" suffix carry their stated units. DSO fiscal labels propagate from exact issuer commentary periods; explicit fiscal contradictions require an established fiscal basis, never a calendar-year guess. Unknown fiscal basis remains unchecked. Gawel's combined RSU target value is currency, not a share count. A full officer filing's restricted numbers remain restricted: the parsed package supplies an exception only for its exact recipient as the claim subject and one exact package amount, followed by the usual source metric/unit/period checks. Robertson/Parker substitutions, compound recipients, negation and share-unit controls remain unvalidated.
- **Saved report-three deterministic disclosures**: quarter/H1 direct-customer revenue shares and dated receivables shares retain unnamed reporting positions, separate qualified indirect-customer demand and extended-payment-term context. The annual Taiwan 76% estimate requires an explicitly established FY2026 source scope. No common customer identity is inferred across rows or periods. Guarantee dates are rebuilt from the matching retained source table even for previously parsed bundles; the July 26 commitments date cannot date guarantees signed in August. Exact dated production statements and guarantee table scope remain visible as issuer notes. These supplements can be regenerated beside the same saved model output; original artifacts are preserved and a corrected replay must disclose that no model was rerun.
- **Focused evidence**: six test files pass (166 tests), with typecheck and changed-file ESLint passing. Targeted filing-facts coverage passes its risk floors: 97.76% statements, 83.05% branches, 100% functions/lines (36 tests). Read-only deterministic verification against snapshot `6e1f43a73b4d8af967160b3f4ea378b3d6896599179683fa68ef42bf3ae0008d` and the saved 07:46:29Z report yields 105 cited factual claims, 70 numeric validations, 35 unchecked and zero contradictions. This is narrower than whole-proposition verification; original model prose is unchanged, and full combined coverage/build validation belongs to the integration gate.

## D-64 (NVDA rerun audit 2026-10-15) A fourth-quarter EPS is never FY EPS minus nine-month EPS

- **Evidence**: the integration rerun showed Q4 FY2025 diluted EPS $0.90; NVIDIA reported $0.89. The EDGAR backfill derived it as FY $2.94 − nine-month $2.04, but per-share amounts are not additive when the weighted share count moves between quarters.
- **Options**: (a) keep FY − YTD (the former "FMP convention"); (b) withhold every untagged Q4 EPS; (c) rebuild it from Q4 net income over a Q4 share count backed out of the day-weighted identity FY shares × FY days = Σ quarter shares × quarter days.
- **Choice**: (c) when the annual and all three earlier quarterly weighted counts are tagged, else (b). The backed-out count is used only for the ratio and never reported as a share fact.
- **Why**: the identity is exact for weighted averages over contiguous periods, so the result matches the issuer's own Q4 EPS up to rounding (NVDA Q4 FY2025 0.894 → $0.89; Q4 FY2026 1.758 → $1.76).
- **Disclosure**: field provenance `derivation: "fy-share-identity"` and a statement note naming the backed-out count; a withheld figure carries a note saying why.

## D-63 (NVDA report 34 audit P1-8, P1-9, P1-10, P1-14, P0-10, P0-11, P2-10 and the 2026-10-15 rerun findings) Read the business, the 10-Q notes and the release tables; give the CEO and CFO a citable outlook record

- **Evidence**: the integration rerun (`data/recovery/nvda-integration-20261015`) never named CUDA, TSMC or OpenAI. No 10-K Item 1 or 10-Q note was read; section-evidence-2 kept 11% of the 114,916-char Item 1A, 19% of the 10-Q MD&A, 58% of the Q2 release and 59% of the CFO commentary, and its 1,200-char cut of the residual-value-guarantee 8-K dropped "An affiliate of OpenAI Group PBC … will be the tenant". The report then said evidence it held was "not in the filings": the $59M principal payments between issuer FCF and OCF less capex, the non-GAAP reconciliation, the Hugging Face price, and the DSO and inventory build behind the OCF drop. All 30 FACT claims stated no figure (numeric validation 0/30). Every executive was "not-assessed", although the report printed revenue above the guided range three quarters running, and no pay was stated although D-57 registered the compensation rows. Six figures the excerpts printed were untraced. The "Other" geography and Edge Computing showed dashes where the total less the other rows was known. An 18-month-old charge was the only "high" flag, and "$6.1 billion" against "$6.042 billion" was called a discrepancy. The next earnings date was printed beside a past date: the earnings envelope's newest reported row.
- **Options**: (a) raise every budget; (b) read new sources with family profiles suited to each, under bounded budgets, and register the release tables as typed records; (c) attribute company guidance to no individual, and print the executive cards once as not assessed.
- **Choice**: (b), plus attribution for the CEO and CFO only.
  - New sources: 10-K Item 1 (or 20-F Item 4) from the already-parsed annual document, and 10-Q Part I Item 1 cut at its notes heading. Both are optional bundle members `edgar.business` and `edgar.tenQNotes`; they need no new SEC request.
  - Selector profiles: `business` (platform and software, roadmap, customers, suppliers and manufacturing, competition, export regulation, officers), `notes` (investments and lock-ups, commitments and guarantees, customer concentration, debt, capital return, contingencies, tax) and `risk` (business and financial families) for Item 1A. Prose profiles skip abbreviations when splitting, break a flattened table from the next sentence and from its footnotes, never give a table a family's turn, and score named entities. The `event` profile keeps an 8-K item's dated lead, every passage that introduces a named party, and every amount.
  - The `financial` profile is section-evidence-2 unchanged, except that an inventory-type charge is now an exceptional item.
  - Budgets: Item 1 12,000; notes 12,000; Item 1A 20% of its length between 14,000 and 24,000; 10-Q MD&A 12,000 (was 8,000); release narrative 9,000 (was 5,000); CFO commentary 11,000 (was 7,000).
  - Release tables become records. The GAAP-to-non-GAAP reconciliation gives OCF, capital purchases, principal payments, the tax effect and GAAP EPS by quarter. Equity-securities gains and non-GAAP EPS join the quarterly trend. The commitments and guarantees tables become records, and the "no longer exclude stock-based compensation" basis note is kept.
  - A notes offering's 8-K summary states its series' aggregate principal, marked computed, and never cuts a sentence mid-list. Item 5.07 (shareholder votes) is a material event.
  - Guidance track record: per metric, the share of the guided quarters above (and below) the prior range, with the count written as a word so a sentence carries one figure. The prompt asks for it on the CEO and CFO cards as a FACT naming them; the existing verify pass validates it and the D-59 gate admits it.
  - Pay is stated with its registered currency ("comp" reads as total compensation). Cards are written only for officers with evidence; officers without evidence are named once in the governance notes.
  - Excerpt-cited figures: the claim's words must appear in the clause, and a definition-changing modifier the clause states must appear in the claim. A clause naming no period takes the excerpt's own (reporting period, fiscal quarter, event date). "X, up from Y" is a level. A two-or-more-date table header binds its rows' cells column by column.
  - Prompt rules: rounding-aware agreement, a figure in every FACT a record supports, age-decayed flag severity, a whole-payload search before "not in the filings", implied growth compared with guidance, consensus and the latest quarter, and dated catalysts.
  - Segments: a quarter's one missing top-level cell is the total less the other rows, when the rows are shown to be exhaustive.
  - The derived next-earnings row is dated by its fetch day.
- **Why**: (a) would have cost the same prompt growth without reaching the business or notes passages, which carry few figures and lose to numeric MD&A sentences under the financial families. The CEO and CFO publish the quarterly outlook, so the company's results against it are their credibility record; other officers' function-specific evidence is still required, and (c) would have discarded an admissible record the payload already held.
- **Disclosure**: each excerpt's coverage names its profile (`section-evidence-2/business`, `/notes`, `/risk`, `/event`). A residual segment cell is labelled "(total less the other rows)" with source `computed:xbrl segment residual` and a note. Computed 8-K totals are bracketed `[computed: …]`. Track-record rows cite `computed.guidance-track-record`. For NVDA the cached payload grows by about 51,000 characters: Item 1 and the notes +27,700, Item 1A +9,000, the two release narratives +6,800, records about +8,000. The shared rules grow by about 1,900 characters and the judge framing by about 4,000. `PAYLOAD_VERSION` and `REPORT_SPEC_VERSION` are unchanged as instructed; the new `FilingDisclosures` fields are optional. `tests/stageC.payload.passes.test.ts` re-pins the golden (Item 1A's risk-profile joins, −1,119 prompt bytes). `npm run audit:deltas` moves no leaf: the audited DEMO fixture is reserved, so the filing reads never run.
- **Revised by D-129 (OD-1, audit 2026-10-27 AI-305)**: an excerpt-cited figure also binds only to its own description; the clause-wide word test above stays and the own-description test is added to it. See docs/METHODOLOGY.md "A figure is read with its own description".
- **Extended by D-130 (round-4 conventions: comparison bases)**: a figure the source introduces with "from", "compared with", "versus", "vs." or "against" is a comparison base, and the end of a base-first move takes the move's metric. See the entry "Audit batch B2: comparison bases and the end of a base-first move".
- **Revised by D-128 (B1 OD-3, audit 2026-10-27 AI-302-V1)**: a clause naming no period takes the excerpt's own only when it is not forward-looking. A forward-looking clause (management's expectation, outlook or guidance) inherits no period or window from the excerpt and binds only a forward-looking claim, and a result clause binds only a result claim. See the entry "The claim verifier compares the periods, windows, comparison bases and recency a claim states".

## D-62 (NVDA report 34 audit, WP10 / P3 + P1-12 + P0-7 headline, 2026-10-15) Write the report for a reader; move the audit trail to its own export

- **Evidence**: the live NVDA rerun (report 2, `data/recovery/nvda-integration-20261015/`) was 367 KB and 2,118 lines with 1,728 "n/a" cells. 220 KB of it was the verification log, the 70-row missing-data manifest, four 17-column projection-series tables and raw score-driver traces. The header led with "Factual prose claims (numeric support): 0/30 validated" although all 30 factual claims were qualitative and 286/292 figures traced. Registry ids served as metric names (`computed.deterministic-aspect-scores.fundamentals-score`); every claim carried "`source id: X` `src: X`"; values printed as 66.89858183148777, 24285000000, "$11,063.00 millions", "95.00 0-100", "-1.1 score", "40.25 index" and "$-7.35B". The peer table was a 10×10 diagonal of dashes. Guidance, issuer FCF and results-vs-guidance appeared in three to six places, Q1 FY27 revenue printed $81.61B in one table and $81.62B in the next (`toFixed` on the binary 81.61499…), "$26.00B" stood for the release's "approximately $26.0 billion", and consensus was used in the DCF but never shown.
- **Options**: (a) trim text inside the existing renderers; (b) a shared presentation layer used by all three surfaces plus a separate audit export carrying every raw leaf; (c) drop the audit material.
- **Risks**: (a) leaves the three surfaces drifting and the 0/N headline in place. (b) the "every leaf on every surface" contract becomes "every leaf in the report or its audit export", so a reader of the report alone no longer sees registry ids or the log. (c) loses the trust record.
- **Choice**: (b). `src/report/presentation.ts` holds the reader rules (labels from registry ids and units, one claim source marker, figure de-duplication across the two capital registries, empty-table and empty-column pruning, the trust rows, the key-data box, consensus tables, the methodology notes, geography and moat labels, last-close versus intraday price naming). `reportToAuditMarkdown` (GET `/api/export/[id]?format=audit`, "Audit trail" button) carries the run execution record and cost ledger, the full validation partition, the deterministic checks and verification log, the raw score tables, a figure registry, evidence timing, the projection audit trail and series, the full manifest, sources and the as-of map. The report body states the limitations once in a methodology box; the header is six rows (model in one line, tokens for plan-allowance runs, data state, verification, versions); the key-data box and the bull/bear debate sit on page 1; warnings and critical gaps stay in the body with their reasons, informational gaps as family counts. Formatting: decimal-safe rounding in every shared formatter, "−$7.35B", "$11.06B (label)", "95/100", plain index and score readings, compact share counts, "≈$26B" when the release says approximately. Pipeline: `report.marketData` (optional) copies the provider quote, shares, period-end EV, FY+1/FY+2 consensus, price-target and grade counts (no rating words) and FINRA short interest from the bundle; `capitalReturn.returnedApproximate` / `authorizationRemainingApproximate` carry the release qualifier. Figures that a deterministic filing table shows (guidance, issuer FCF, results against guidance) are left to that table with a cross-reference. The D-63 filing fields render in their home sections when present: equity-securities gains and non-GAAP diluted EPS as quarterly-trend columns (with the issuer's non-GAAP basis note), the release's FCF and EPS reconciliations under Fundamentals, the commitments and guarantees tables under Balance Sheet, and a company-level guidance track record (counts and mean difference from the results-against-guidance rows) under Outlook.
- **Why**: the audit's P3 and P1-12 findings are presentation, and the trust signal has to say what was checked without understating it or overclaiming. A separate export keeps every raw value one click away without asking an institutional reader to page through it.
- **Disclosure**: no computation, grade, prompt or payload changes; `REPORT_SPEC_VERSION` and `PAYLOAD_VERSION` are unchanged (both new fields are optional). The audited delta group `presentation-d62-2026-10-15` records `report.marketData`. Renderer tests that pinned raw leaves on the body now pin them in the audit export, with the reason in each test.

## D-61 (NVDA report #34 audit, WP5, 2026-10-15) Forensic and grading signals that measured the wrong thing

- **Evidence**: report 34 and the 2026-10-15 integration rerun
  (docs/audit/2026-10-15-nvda-report-34-audit.md, P0-6, P2-1…P2-5):
  - **Accruals 0.91, "red".** NI − CFO − CFI over average NOA charged all of
    NVDA's FY2026 investing cash flow (−$52.2B) as accruals. Of that, $58.1B was
    purchases of investments: $40.6B of debt securities and $17.5B of equity
    stakes (XBRL `PaymentsToAcquireAvailableForSaleSecuritiesDebt`,
    `PaymentsToAcquireEquitySecuritiesFvNi`), against $26.5B of sales and
    maturities. NOA removed short-term investments but not the $22.3B of
    long-term ones.
  - **ROIC stability, subscore 12.** The population SD of 68.8 → 23.4 → 124.9
    → 198.2 → 149.8% ROIC was 61pp, so a rise read as instability. That pulled
    Moat to C beside the judge's "scale (wide)".
  - **Beneish M = −1.13, "flag", with no decomposition.**
  - **ROIC − WACC (136.5pp) scored twice**: as quality's `roicVsWaccSpread` and
    leadership's `capitalDeployment`, with the same band.
  - **Buyback "discipline" 214.9% → 90.** This was today's quote over the proxy
    paid price, i.e. appreciation since the buybacks.
  - **Leadership B grade justified by "guidance execution"**, which is not a
    score input, while every executive was "not-assessed".
  - **Piotroski 4/9 with no signal named.**
- **Options**:
  - Accruals: (a) keep the broad measure with a caveat; (b) operating accruals
    NI − CFO everywhere; (c) the Richardson et al. (2005) financial-asset
    adjustment, falling back to (b) when the statements do not separate the
    flows.
  - Durability: (a) SD of residuals around a linear trend; (b) downside
    deviation below WACC; (c) years with ROIC > WACC; (d) the minimum ROIC
    over the window.
  - Buyback: (a) rename the appreciation measure; (b) a cross-year timing
    measure from the annual price proxies; (c) the price actually paid
    (tagged repurchase cost ÷ tagged shares) against the same year's average
    price.
  - Leadership's second ROIC read: (a) replace it with incremental ROIC; (b)
    drop it and renormalise.
- **Risks**:
  - Accruals (b) also removes capex and acquisitions, which are operating
    investment in Richardson's ΔNCO. (c) depends on FMP's
    `purchasesOfInvestments` / `salesMaturitiesOfInvestments` /
    `longTermInvestments`. Statements built from companyfacts carry none of
    them, so those issuers get (b).
  - Durability (a) still scores NVDA 12: the residual SD is 38.5pp, because
    FY2023's 23% was a real dip. (b) and (c) bring the contested current WACC
    into moat. (d) reacts to a single bad year, which is the intent.
  - Buyback (b) is dominated by dollar-cost averaging on a trending stock: a
    constant-dollar programme would read about +97% for NVDA. Within a year the
    proxy price equals the average price by construction, so (b) cannot
    measure timing. (c) needs share-count tags and a split basis.
  - Leadership (a) stays in the capital-returns family the audit asked to
    de-duplicate.
- **Choice**:
  - **Accruals (c).** In `computeAccruals`, NOA = total assets − cash and
    short-term investments − long-term investments − (total liabilities −
    total debt). The numerator is NI − CFO − operating CFI, where operating CFI
    is CFI minus (purchases + sales/maturities of investments). Capex,
    acquisitions and unclassified investing flows stay in. The fallback
    (operating accruals NI − CFO) is used unless both halves are available,
    and `definition` records which one was used.
  - **Accrual growth note.** Above 30% revenue growth a note gives revenue and
    NOA growth (Fairfield, Whisenant & Yohn 2003). It is disclosed, not
    graded, and the bands are unchanged.
  - **Durability (d)** (`roicFloor` / `roteFloor`), banded on the level band.
  - **Beneish.** The result carries `sgiNeutralScore` (M with SGI = 1.0) and
    `growthLed` (flagged, but not with SGI neutral). When growth-led, the
    quality signal is graded on the SGI-neutral M under its own name
    (`beneishMSgiNeutral`). The forensic table's variant string prints all
    eight indices.
  - **Leadership (b).** `capitalDeployment` is removed and the aspect weight is
    unchanged. `buybackTiming` (weight 0.30) is the cost of the shares
    actually bought at each fiscal year's average price over the cost paid,
    minus one. It comes from `StockRepurchased[AndRetired]DuringPeriodShares`
    and `…Value` (or the treasury-stock pair) from the one filing that tags
    both for the year, with the count put on the current share basis by the
    split resolution (`repurchaseExecutions.ts`).
    - A year whose paid price is more than 1.6× from the year's average is
      left out as a basis mismatch.
    - Timing is graded only when at least 50% of repurchase dollars are
      covered.
    - A company with no repurchases has no timing signal (not missing
      evidence).
    - The appreciation figure is still shown, labelled as appreciation, and
      not graded.
  - **Leadership label.** The score is labelled "Leadership (capital
    stewardship)". Its note and the payload say that management quality,
    guidance execution and governance are not inputs. The analyst grade
    surface keeps "Leadership".
  - **Piotroski.** The forensic zone names the failed signals
    (`piotroskiSignalOutcomes`), and the payload carries all nine.
- **Why**:
  - **Accruals.** Richardson, Sloan, Soliman & Tuna (2005, *JAE* 39) treat
    short- and long-term investments as financial assets, outside operating
    accruals. Sloan (1996) and Hribar & Collins (2002) measure operating
    accruals. Buying a Treasury bill is not an accrual.
  - **Durability.** A moat is persistence of returns above the cost of capital
    (Fama & French 2000 on the mean reversion of profitability). How low
    returns fell is evidence of that; how much they moved is not.
  - **Beneish.** Beneish (1999) includes SGI as a pressure proxy: growth is
    not manipulation.
  - **Buyback timing.** Dittmar & Field (2015, *JFE* 115) measure timing as
    the price actually paid against the same-period market price. The
    proxies alone cannot do that.
  - **Leadership.** Dropping the duplicate is the smallest change that scores
    ROIC − WACC once. `roicLevel` (moat) and `roicVsWaccSpread` (quality)
    remain, as level reads in different aspects.
- **NVDA, frozen inputs** (`npm run research:replay` on a copy of the
  integration database, report 2):

  | Item | Before | After |
  | --- | --- | --- |
  | Accrual ratio (cash-flow) | 0.912, red, broad | 0.598, red, financial-asset-adjusted |
  | Accrual detail | — | operating CFI −$20.6B; NOA $106.1B / $46.4B → $83.9B / $43.0B; CF vs BS divergence 12.9pp → 4.7pp |
  | Accrual subscore | 16 | 16 |
  | Moat durability | SD 61.2pp → 12 | floor 23.4% → 79.3 |
  | Beneish M | −1.13, flag | −1.13, flag; SGI-neutral −1.72, still above −1.78, so not growth-led; subscore 25.9 |
  | Buyback | appreciation 214.9% → 90 | timing +5.2% (100% of dollars covered) → 62.3 |
  | Quality | 60.03 C | 60.03 C |
  | Moat | 68.36 C | 88.54 A |
  | Leadership | 81.51 B | 61.64 C |
  | Composite | 73.3 B | 74.34 B |
  | Business quality | 77.56 | 78.95 |

  - **Accruals stay red** because NVDA's operating assets really grew 95%:
    receivables, inventory, and a $13.0B acquisition
    (`PaymentsToAcquireBusinessTwoNetOfCashAcquired`). Revenue grew 65.5%.
    The growth note says so.
  - **Beneish stays flagged** because AQI (1.57) and TATA (0.084) carry it as
    well as SGI.
  - **Timing.** NVDA paid $15.93, $46.41, $109.73 and $143.22 against year
    averages of $17.95, $39.33, $113.97 and $156.62.
- **Disclosure**:
  - **Forensic notes, payload and prompt.** The accrual definition, operands,
    growth rates and notes are in the forensic notes and the payload. The
    Beneish indices, the SGI-neutral M, the growth-led flag and the nine
    Piotroski outcomes are payload rows. The prompt's reconciliation rule
    names both accrual constructions. The pipeline's accrual explanation flag
    names the construction used.
  - **Score drivers.** They are `roicFloor` / `roteFloor`, `buybackTiming` and
    `beneishMSgiNeutral`. The `capitalDeployment`, `roicStability` and
    `buybackDiscipline` drivers no longer exist.
  - **Capital notes.** They say when timing is not measurable, and why.
  - **Tests.** `tests/stageB.forensicsD61.test.ts` and the D-61 block in
    `tests/stageB.grading.test.ts`. The audited delta group
    `forensics-d61-2026-10-15` and the payload pin in
    `tests/stageC.payload.passes.test.ts` say what moved.
  - **Version stamps.** `REPORT_SPEC_VERSION` and `PAYLOAD_VERSION` are
    unchanged. The band tables changed (timing band; durability on the
    level bands), so the integration merge stamps `SCORE_BANDS_VERSION`
    `SCORE_BANDS_2026_10_NVDA_AUDIT` and the Stage B implementation
    `STAGE_B_2026_10_NVDA_AUDIT_1`.
  - **Not changed.**
    - AQI still counts long-term strategic investments as non-current
      assets. That is Beneish's definition: assets whose future benefits are
      less certain.
    - Statements built from companyfacts carry no investment-flow
      components, so their accruals use the operating fallback.

## D-60 (NVDA report 34 audit, WP2/WP7/WP8 remainder, 2026-10-15) Mean-reverting scenarios, one net-cash figure, evidence-led year one, a disclosed discount rate

- **Evidence**: the live NVDA rerun on `claude/nvda-audit-integration` (frozen inputs replayed offline through `runStageB`) showed bull $1,233 / base $235.21 / bear $52.31 per share. Bull held +25pp growth for ten years (revenue to about $7.9T) at a 72.5% operating margin, above the 71.1% FY2026 gross margin; bear declined for six straight years. Each target printed a 25/50/25 "display weight" whose implied weighted value the report never showed. The EV bridge netted $99.37B of "cash and short-term investments", of which $42.78B is publicly-held equity (10-Q Note 5; $36.9B under lock-up), and the report printed three net-debt figures as facts (−$66.0B, −$60.5B and the vendor's cash-only +$16.4B). The independent review added: year one carried guidance $108B × 4 at the clamped 25% rather than the guided pace, year two applied consensus growth to that lower base (both years ~15% below consensus, undisclosed), EPS used a 10-year NI/EBIT median of 0.9525, the margin target was capped at FY2025's 62.42% while every recent quarter ran 63.2-66.2%, sales-to-capital counted $51.2B of non-operating stakes as invested capital, and the review conditions restated the base path.
- **Choices** (each disclosed where the number is printed):
  1. *Scenarios (P0-5).* Bull/bear shocks are full size in year one and decay on the base path's convergent weights (3-year half-life, zero by year 10), so terminal growth and margin equal the base case. Growth beyond one or two years is not persistent (Chan, Karceski and Lakonishok 2003) and profitability mean-reverts (Fama and French 2000); the weights reuse D-58's fade rather than adding a parameter. Scenario margins are capped at gross margin less the leanest operating-expense ratio the issuer has run (TTM and five fiscal years), never below the base path. Price targets carry no weight; the 25/50/25 prior stays on the weighted operating projections, and the "not a calibrated probability" disclosure is stated once, in the weight basis.
  2. *Net cash (P0-9).* `NET_DEBT_V3`: marketable equity securities are excluded from cash only when the issuer's own fair-value XBRL fact (`EquitySecuritiesFvNi[Current]`) reconciles with cash and current debt securities to the combined total at the balance date. The DCF bridge adds them back as a separately disclosed non-operating asset at that filed fair value (no marketability discount: the lock-up terms are not structured data). Leverage metrics use the same net debt; invested capital still subtracts the securities (they are non-operating). The vendor cash-only `netDebt` row leaves the prose-facing statement extracts.
  3. *Year one (P0-A, P0-B).* Calendarized consensus levels set years one and two when consensus is consistent with guidance (at or above the guided quarter's low end × 4); otherwise guidance × 4 is carried at the guided sequential pace, then the run-rate at the near-term rate. The broken-input guard widens from [−10%, +25%] of the run-rate to the evidenced pace (guided pace and latest-quarter YoY). Consensus covers four quarters, guidance one, and an issuer above its own range each quarter makes the guided run-rate a floor. The basis states the gap to consensus whenever a used level differs, and the near-term rate says when it does not set year one.
  4. *Discount rate (P2-0).* FRED DGS10 is the current risk-free rate (the per-year history already used it); FMP is the fallback. The WACC basis discloses the beta regression on the bundle's own prices (monthly returns vs SPY: window, observation count, R², standard error) beside the vendor beta, which the WACC keeps (no bottom-up beta without a data source), and labels the vendor ERP date as acquisition with the dated Damodaran reference beside it. Debt weight uses the latest balance the bridge nets; the effective cost of debt keeps the average. The WACC axis widens to ±200bp, and a year-one growth × sustained margin grid joins it.
  5. *Terminal discounting (P2-8).* Kept at N − 0.5 and stated as an assumption row: a perpetuity-growth terminal value of flows that arrive through each year takes the mid-year factor (Rosenbaum and Pearl, *Investment Banking*, ch. 3; Koller, Goedhart and Wessels apply the half-year adjustment to the whole value). Discounting it at N would mix conventions. The terminal FCFF step (reinvestment g/RONIC vs growth/sales-to-capital) is disclosed.
  6. *Other inputs.* The margin ceiling counts a full four-quarter TTM as earned; sales-to-capital excludes long-term investments; guided GAAP tax sets year one; forecast EPS is (EBIT − latest interest) × (1 − DCF tax), excluding non-operating gains; the capital-return text names the remaining authorization and the share change it would fund; own-history multiple bands take older quarter-end market caps from the bundle's five-year market-cap history; the SBC row uses the TTM cash bridge; review conditions are observable (price-implied year-one revenue, guided-quarter revenue and gross-margin low ends).
  7. *FCF basis (P2-9).* The projection series labels history as levered FCF after SBC (the forecast FCFF is after SBC too); the FCF CAGR row says "before SBC".
- **NVDA (frozen 2026-10-15 inputs)**: base $235.21 → $296.32; bull $1,233 → $501.15; bear $52.31 → $163.44; bridge net debt −$66.0B → −$23.22B plus $42.78B non-operating equity (same equity value); WACC 13.25% → 13.21%. One-at-a-time reverts: consensus anchor +$43.0, TTM margin cap +$11.9, operating sales-to-capital +$9.5, WACC inputs +$1.3, guided tax −$1.0.
- **Risks**: consensus can be stale or herd; the consistency test only rejects a consensus below the guided run-rate. Decaying shocks narrow the band (NVDA bull +69% / bear −45% around base, rather than +424% / −78%). Equity securities are excluded only when the filing reconciles, so an issuer with differently tagged stakes keeps the V2 basis. None of these rules is backtested (RESEARCH §8).
- **Disclosure**: version strings `NET_DEBT_V3`, `SHARED_SCENARIO_PATHS_2026_10_D60`, `SCENARIO_TARGETS_2026_10_D60`; the delta group `valuation-d60-2026-10-15`; re-pinned tests name D-60. `REPORT_SPEC_VERSION` and `PAYLOAD_VERSION` are left for the integrator.

## D-59 (NVDA report 34 audit, WP4 + WP6, 2026-10-15) Make the peer and executive gates reachable and stop the verifier's false contradictions

- **Evidence**: report 34 (docs/audit/2026-10-15-nvda-report-34-audit.md) showed gates that could never pass. `PeerCandidate.economicEvidence` and `subjectEconomicEvidence` were read but never populated, so every peer of every issuer was excluded; one symbol's HTTP 402 (AVGO) stopped collection, so 2 of 10 candidates were evaluated. `assessExecutiveEvidence` required a `verified` log outcome that the verify pass never assigns to prose, so every executive was "not-assessed". The headline "0/90 validated; 1 contradicted" came from a year-set period rule ("ended 2026-07-26" against "ttm: 2025-07-27 to 2026-07-26"), a symmetric label match against internal key paths ("debt Bridge total Debt Including Leases"), and 60 figure-free claims counted as "unchecked". The earnings reconciliation was "unavailable" because FMP quarters carry no SEC start date.
- **Options**: (a) populate economic evidence from SEC filings; (b) replace the hard exclusion with a disclosed caveat; (c) remove executive grades; (d) accept the verify pass's own numeric validation as attributable evidence.
- **Choice**: (b) and (d). Absent comparability evidence is a caveat stated beside the median; supplied evidence that is invalid, unavailable or different from the subject's still excludes, and evidence that does not describe the observation is contrary, never absent. SIC equality establishes industry only for the SEC fallback used when FMP refuses a symbol. Candidates rise from 6 to 10 within 25 seconds. An executive grade survives when a FACT in that executive's own evidence names them and its figure matched the cited record with no failing check. The period check accepts an exact date inside or at the end of a window; the numeric matcher reads registry labels with time words and FCF/SBC/capex normalized, treats a bare "trailing" as twelve months, and requires a named window to be the record's own. A fully named person is attribution, not metric text. An FMP quarter without SEC dates is bounded by the issuer's consecutive preceding quarter (12-14 weeks apart).
- **Why**: (a) needs a business-model taxonomy and per-metric definitions no source supplies; SIC alone cannot certify accounting or metric comparability, so claiming it would overstate the evidence. (c) discards the design the prompt already describes (capital-allocation record over tenure). The changes only make existing rules reachable; contrary evidence, contradictions and named-individual restrictions are unchanged.
- **Disclosure**: peer methodology and multiples notes carry the caveat (`valuation.multiples.peers.<key>.comparabilityCaveat`); SEC-served peers are named in the peer notes; `factualValidation.qualitative` reports figure-free claims. Current-capital bridge labels and registry ids change (`computed.current-capital.total-debt-including-leases`); the `computed.capital.current.*` aliases do not. The audited delta group `peer-gates-verifier-2026-10-15` and the payload pin in tests/stageC.payload.passes.test.ts say what moved.
- **Revised by D-128 (B1 OD-2, audit 2026-10-27 AI-302)**: in the claim verifier a trailing window's start date no longer agrees on its own: a lone date names the window's end, and the start agrees only when the claim also names the end date (the complete interval, D-82). See the entry "The claim verifier compares the periods, windows, comparison bases and recency a claim states".

## D-57 (NVDA report #34 audit 2026-10-15) Single-currency provider rows inherit the issuer currency when nothing conflicts

- **Options**: (a) keep D-28: an analyst estimate, price target, peer market
  cap or compensation total is money only in a currency its own row states;
  (b) inherit the listing currency for every such row; (c) inherit the
  issuer's currency only when the statements' reporting currency and the
  listing currency agree and the issuer is not an ADR, and withhold otherwise.
- **Risks**: (a) discarded USD consensus, every peer size and all executive pay
  for a USD-reporting, USD-listed issuer (NVDA report #34). Losing consensus
  removed the only forward anchor for the DCF growth clamp. (b) mislabels an
  ADR's per-receipt or per-ordinary-share figures. (c) can still be wrong if a
  provider ever states a single-currency issuer's rows in a third currency;
  no such case has been observed.
- **Choice**: (c). `inheritedIssuerCurrency` and `providerRowCurrency` in
  `src/pipeline/estimateCurrency.ts` are the one rule. Stage B's
  analyst-consensus growth case, the year-one revenue anchor and the payload's
  estimate, target, peer and compensation rows all use it. A row's own currency
  always wins, and a row in another currency than the model's is still
  excluded.
- **Why**: the conflict D-28 guarded against is real only for ADRs and for
  issuers whose reporting and listing currencies differ. For the rest, all
  available evidence names one currency.
- **Disclosure**: the payload renders inherited money as "(USD, inherited)"
  with a section note naming the basis, and the registry record carries
  `currencyBasis: "inherited"`. The info entry `valuation.analystEstimates.currency`
  says the estimates were inherited, or why not. `PAYLOAD_VERSION` moves to
  1.23.0 and `REPORT_SPEC_VERSION` to 1.18.0.

## D-58 (NVDA report #34 audit 2026-10-15) Anchor the DCF's first years on evidence of the level; fade convergently; floor the terminal tax rate

- **Problem** (audit P0-1, P0-3, P0-4, P2-7). NVDA's base case had four
  defects:
  - Year-one revenue was TTM × (1 + clamped 25%) = $378.7B, below the latest
    quarter × 4 ($384.9B) and Q3 guidance × 4 ($432B).
  - A linear fade from a consensus year one would have kept growth above 50%
    for four years.
  - The year-one margin was cut from the 65.2% TTM to the 62.4% best fiscal
    year, under a basis text written before the cap ("held flat at current
    65.21%").
  - Terminal NOPAT was taxed at the 8.9% historical median, while the issuer
    guides 16–18%.
- **Options**: (a) keep the rules and add disclosure; (b) raise the clamp;
  (c) take the year-one (and two) level from guidance, then consensus, then a
  seasonally neutral run-rate, with the clamp measured against the run-rate.
  Later years fade convergently from the last anchored year. The margin cap
  binds the target, and the terminal tax is floored at max(statutory, 15%).
- **Choice**: (c), in `buildDcfAssumptions`:
  - **Run-rate**: the TTM carried 4.5 months at the latest quarter's
    year-over-year growth, bounded by the TTM and the quarter × 4.
  - **Consensus**: calendarized by day overlap.
  - **Year two**: consensus growth bounded to [−10%, max(25%, year one)].
  - **Fade**: the gap to terminal halves every 3 years.
  - **Reverse DCF**: solves on the `convergent-shift-to-terminal` family,
    which contains the base path.
  - **Terminal tax**: the company median floored at
    `max(STATUTORY_MARGINAL_TAX_PCT[domicile], 15%)` (US 21%).
  - **Guidance**: `DcfAssumptionInputs.guidance` exists, but compute passes
    null until 8-K outlooks are ingested.
- **Why**: (b) moves the arbitrary number without fixing the level/slope
  coupling. On report #34's inputs (tests/stageB.dcfAnchoring.test.ts and the
  audit's replication), the old rules give $143.98. The new rules give $175.8
  on the run-rate alone, $215.3 with Q3 guidance and $213–234 with consensus,
  all including the 21% tax floor, which alone costs about 10%.
- **Risks**: the three-year half-life and the run-rate clamp are unbacktested
  house conventions (RESEARCH §8.7). The convergent fade lowers values for
  steady growers whose year one equals their history by roughly 4–5% of
  year-10 revenue against the linear fade. The tax floor raises taxes only
  for issuers below it. Issuers with no year-ago quarter keep the pre-D-58
  year one exactly.
- **Disclosure**: a "year-one revenue anchor" assumption row (source, value,
  the clamp when it binds) and notes when the clamp, the margin target cap or
  the tax floor binds. The margin and tax bases name the values the paths
  hold. Version stamps as D-57.

## D-56 (source evidence 2026-10-15) Preserve source periods and separate facts from opinion

- **Research**: [XBRL](https://www.xbrl.org/dates-in-xbrl/) distinguishes instant
  and duration facts; [SEC API guidance](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)
  warns that issuer calendars and reporting windows vary. [CFA V(B)](https://www.cfainstitute.org/standards/professionals/code-ethics-standards/standards-of-practice-v-b)
  separates facts, opinions and limitations, while [V(A)](https://www.cfainstitute.org/standards/professionals/code-ethics-standards/standards-of-practice-v-a)
  supports adequate evidence and testing. These inform implementation boundaries,
  not certification or investment-performance claims.
- **Choice**: optional strict source period metadata precedes legacy aliases
  when supplied; absence preserves compatibility. Structured periods remain
  source-owned, outside provider request schemas. Exact statement registry
  bindings support deterministic reported facts; a reported earnings arithmetic
  identity needs compatible operands and retains its residual. It does not
  establish recurring earnings, tax allocation or a universal equity-method rule.
- **References and timing**: an earnings pointer requires its actual rendered
  reconciliation, not a cash/debt bridge. Unsupported references are withheld
  with original text logged; valid positional pointers use a fixed section.
  Separate observation, filing, publication, acquisition, financial-period and
  calculation-basis disclosures. Reject future live quote observations before
  caching and after retrieval against original and injected client cutoffs.
- **Risks and compatibility**: strictness can leave evidence unavailable. Missing
  source boundaries are never inferred from an end date. Optional report1.17.0
  and payload1.22.0 fields preserve historical reports. Model grammar limits,
  numerical finance, factor weights, grades and scenario priors stay unchanged.
  Synthetic regressions and a controlled frozen-input check are not prospective
  predictive validation; broad qualitative prose remains unchecked.
- **Review corrections**: regressions reproduced provider-origin misattribution
  on EDGAR fallback/backfill, qualifier loss in positional rewriting, an
  unavailable-destination claim on standalone judge verification despite a
  valid reconciliation, and provisional versus final generation timestamps.
  Preserve established envelope/row/field origins, retain the intervening text,
  derive destination availability from the trusted payload on both paths, and
  reconcile final generation/cutoff timestamps without changing input dates.
  Bump both current stamps so the prior evidence conventions cannot resume or
  compare as equivalent. These corrections add no new financial assumptions.

## D-55 (financial integrity 2026-10-15) Reject contradictory operands and preserve source meaning

- **Evidence**: counterexamples reproduced unchecked EV cash components,
  impossible lease composition in leverage/ROIC/REIT/WACC paths, invalid debt
  substituted as missing, and a quarterly rolling annual context hiding current
  cash-flow periods. Filing selection omitted material earnings-quality and
  funding context, while monetary scale and export labels could mislead.
- **Choice**: share NET_DEBT_V2 admission across dependent consumers, preserve
  zero and genuine missing-data fallbacks, use annual reporters for fiscal
  anchors, carry signed equity-method income as filed, retain adjacent material
  filing context inside existing budgets and distinguish filing/report dates.
  Monetary scale is explicit and normalized once; citation provenance remains
  separate from whole-claim factual validation.
- **Compatibility**: report spec 1.15.0, payload 1.20.0 and the financial-integrity
  Stage B implementation identity prevent old calculations/partial passes from
  claiming equivalence. Stored reports retain their bytes. The compatible DEMO
  fixture changes five version/disclosure leaves, without numeric regrading.
- **Limits**: bounded passages are not comprehensive coverage; source gaps,
  ambiguous periods, unvalidated prose and uncalibrated forecasts remain visible.
  See the [audit record](2026-10-15-amzn-integrity.md) for reproductions and checks.

## D-54 (research validation 2026-10-14) Add offline checks before changing research methods

The next work after D-53 is broader validation. Benefit and residual
implementation risk below use a 1–5 engineering judgment scale (5 highest).

| Addition | Benefit | Risk | Evidence and boundary |
| --- | ---: | ---: | --- |
| Seven-route synthetic report integration panel | 5 | 1 | Real validation, computation, data-only assembly, strict parsing and all three renderers exercise hand-derived general/bank/insurer/REIT/ADR/burn/runway controls. Controlled inputs are not live-provider, model-prose or forecast validation. |
| Unknown REIT subtype multiple admission | 5 | 1 | A reproduced SIC-only unknown subtype withheld its REIT valuation but still emitted equity-only P/FFO and P/AFFO. The shared multiples boundary now withholds current, own-history and peer comparisons; equity positive controls retain their values and mortgage REITs retain common-book treatment. |
| Versioned selected-forecast adapter boundary | 3 | 1 | Exact selected values/windows/sources bind internally compatible retained structured basis/method records. Output remains an upstream-declared candidate with production admission disabled. Existing strict report registration stays withheld until upstream acquisition establishes the missing dimensions. |
| Offline claim-review benchmark and CLI | 4 | 2 | Source/claim/span/case identity, independent declared review and complete denominators constrain descriptive checker evaluation. The seed is synthetic; human identities are not authenticated and no whole-prose checker is enabled in reports. |
| Failed evaluation-output preservation | 4 | 1 | Reproduced replacement-after-write-failure cases could delete another operation's file during cleanup. Both claim and report evaluation writers retain failed destinations, close their descriptors and surface the failure; successful writes remain exclusive. |

The current projection path lacks complete typed security, accounting, share and
corporate-action metadata. Copying those fields from an operator sidecar would
repeat the defect closed in D-53. The standalone adapter therefore defines and
tests a candidate boundary while current reports remain excluded from strict V2
registration. Validated metadata acquisition is a separate remaining prerequisite.

Human-reviewed claim references require actual independent review; machine or
agent-created synthetic labels are not presented as human judgments. The offline
benchmark makes incomplete, corrupt, ambiguous and unassessed cases visible. It
does not promote numeric matching or citations to whole-claim factual support.

The panel reproduced an existing eligibility defect: an unknown REIT subtype
could publish P/FFO and P/AFFO through a separate multiples path even though the
REIT valuation correctly withheld them. That boundary is corrected and disclosed
in missing-data output. Applicable formulas, grade weights and scenario priors
are unchanged; unsupported observations no longer enter the affected outputs.
New reports use spec 1.14.0, payload 1.19.0, pipeline stage-c-1.1.1 and the revised
Stage B implementation identity. Stored report bytes retain their original
versions. New offline admission/evaluation modules carry the existing per-file
risk coverage floors.
Prospective outcome collection, calibration and any production claim checker
remain deferred until their evidence requirements are met. Usage and limitations
are documented in [report evaluation](../REPORT-EVALUATION.md).

## D-53 (evidence reliability 2026-10-14) Admit compatible observations and disclose the scope of verification

The audit proposals were assessed against reproduced counterexamples and positive
controls. Benefit and residual implementation risk use a 1–5 scale (5 highest).
The accepted scope below improves evidence integrity without changing weights,
grade bands, scenario priors or the forward valuation assumptions.

| Improvement implemented | Benefit | Risk | Evidence and boundary |
| --- | ---: | ---: | --- |
| SEC filing cutoff, monetary units and exact flow windows | 5 | 2 | Future facts, mixed currencies and mismatched weighted-share windows are excluded; field evidence retains actual acquisition time, including predecessor facts. |
| Financial-route operand compatibility and liquidity contradictions | 5 | 2 | Exact current/prior averaging operands and credit warning operands are checked; compatible statement fallbacks and unused AFFO observations retain their prior behavior. |
| Shared market observation admission and cache freshness | 5 | 1 | Invalid/future/conflicting bars cannot enter technicals, price or relative-strength charts; identical duplicates remain usable. Future cache timestamps force reacquisition. |
| Failed revenue validation propagates to dependent growth inputs | 5 | 2 | A material annual revenue cross-check failure excludes the dependent growth signal; unrelated stale warnings do not blanket-disable scoring. Other semantic eligibility needs its own evidence. |
| Actual financial valuation assumptions in the payload and explanation | 5 | 1 | Continuing value and terminal excess returns are described from the computed model; its forward arithmetic is unchanged. |
| Common-holder earnings/equity and dated security basis | 5 | 3 | Known preferred/NCI allocations are reconciled and filed common earnings carry field evidence; unknown ADS scope withholds affected comparisons rather than guessing a conversion. |
| Issuer-bound earnings announcements | 4 | 2 | Confirmed issuer, website/SEC CIK binding and reporting subject are required; nearby competitor/parent names cannot confirm an event. Ambiguous prose remains unavailable. |
| Tied and degenerate history ranks | 3 | 1 | Ties use midranks and flat histories carry no rank evidence; untied interpolation remains unchanged. |
| Numeric support separate from prose support | 5 | 2 | Numeric matches remain measured, while unchecked surrounding prose is labeled consistently in app, Markdown and print. This does not adjudicate whole-claim truth. |
| Report-review date and executive-scope corrections | 4 | 1 | Current mixed-input WACC uses calculation day; individual input observation dates remain. Only a full contiguous role/scope phrase in a cited, date-matched executive title suppresses a false person match; known people and incorrect titles still fail their existing checks. Cited prose displays its unchecked status. |
| Evaluation target identity, retained outcome evidence and replay custody | 5 | 2 | V2 definitions bind exact windows/concepts/units/security/accounting and retained bytes; replay checks actual method, lock, commit and dirty-diff identity when supplied. Legacy inputs remain diagnostic only. |
| Paired diagnostic grouping and readiness | 4 | 2 | Exact fiscal windows/concepts and method dimensions cannot pool; calendar blocks/readiness are disclosed without unsupported inferential intervals or predictive-accuracy claims. |
| Adversarial regressions, preservation and release verification | 5 | 1 | Negative cases and compatible controls accompany each boundary; historical report bytes and existing user edits are preserved. |
| Report V2 registration fails on unavailable forecast dimensions | 5 | 1 | Current report points lack typed security/accounting/share/action identity; a sidecar cannot certify the selected value. Strict report freezing is withheld pending a versioned adapter; target-free diagnostics remain available. |
| Registry lock contention and unresolved ownership | 4 | 2 | Contenders wait within a five-second bound. An active or stale lock with unknown ownership fails explicitly and leaves registry bytes and the lock intact. No unsafe automatic lock deletion. |
| Reconstructed quarter provenance | 4 | 1 | All actual derivation labels are retained, including FY minus YTD and FY minus the first three quarters. Financial arithmetic is unchanged. |
| Recognized release datelines | 4 | 2 | Known conventional location prefixes can precede the bound issuer subject; competitor, wire-attribution and ambiguous-date controls still reject unsupported announcements. |
| Citation-log entry count | 3 | 1 | The summary counts entries rather than treating the legacy numeric outcome enum as a whole-prose citation count. Per-row support dimensions and separate coverage metrics remain explicit. |

The local evaluation registry is append-only with locks, fsync and hash chaining;
it establishes local content custody, not an externally trusted timestamp or
tamper-proof publication. Method/lock byte identity is opt-in at acquisition and
replay; ordinary jobs retain the existing normalized-input snapshot until actual
deployed artifacts can be acquired reliably. Forecast semantics and partial-year
labels remain operator-declared diagnostic metadata. Calibration, persistence,
grade-weight and scenario-prior redesigns stay deferred pending prospective,
point-in-time outcome validation. These boundaries are not completion claims for
those research proposals.

New outputs use report spec 1.13.0, payload 1.18.0 and pipeline stage-c-1.1.0.
Stored reports retain their original bytes and versions. The audited fixture
comparison changes only the version stamp and three common-holder basis labels;
numeric finance outputs, provenance registries and citation registries remain pinned.

One full live MSFT job used GPT-6.1 Sol at high effort for bull, bear and synthesis,
with the requested model and effort observed and no fallback. Report review found
the three bounded presentation/verification issues above. A separate deterministic
offline recheck uses the retained judge output and immutable input snapshot;
all financial values and original execution/protocol metadata are unchanged.
It traces 313/313 numeric values and passes 18/18 named-person checks. All 62 cited
factual prose claims remain machine-unchecked; these counts establish provenance
and consistency, not predictive accuracy or whole-report factual correctness.
Original report bytes and production report history are preserved.

## D-50 (report assembly 2026-10-13) Section confidence is capped by measured data coverage; the model can lower but not raise it

- **Problem**: each graded section's confidence (high / medium / low) was
  chosen by the judge and never audited. Verbalised LLM confidence clusters
  high and is overconfident (Xiong et al. 2024, ICLR, "Can LLMs Express Their
  Uncertainty?"; Tian et al. 2023, EMNLP, finds it better than token
  probabilities for RLHF models but still miscalibrated); overprecision is the
  most robust form of overconfidence (Moore & Healy 2008, Psychological
  Review 115). A "high" label on a section whose score covered two fifths of
  its inputs was possible.
- **Options**: (a) leave the label to the model; (b) compute the label
  deterministically; (c) let the model choose, but cap it at a ceiling set
  from Stage B data coverage, and show the cap.
- **Risks**: the thresholds are conventions, not fitted, until a track record
  exists; too many caps could make every report read as uncertain, so the
  rules are few and each cap states its reason. The plan's
  verification-rate rule (rate < 0.9 → medium) is not applied: the ceiling
  runs before verification on the object verification measures, so the rule
  would be circular. The plan's annual-period-count rule is not applied:
  Stage B does not record how many annual periods each aspect's inputs span,
  and a count derived here would be unmeasured. The plan's unverified-estimate-
  currency rule is likewise not applied (owner-approved Stage-B-only scope).
- **Choice**: (c), owner-approved Stage-B-only form.
  `src/pipeline/stageC/confidenceCeiling.ts` computes, per aspect, the minimum
  of: unscored aspect → low; `dataCompleteness` < 0.5 → low, < 0.75 → medium;
  valuation only, fair value (DCF / excess-return) withheld or the scenario
  fan suppressed on the general DCF route → medium. `assembleReport` applies
  it to each section's grade block and its grade-strip twin after the judge
  pass and before verification. A label above the ceiling is lowered to it
  and `GradeBlock.confidenceCap = {from, to, reason}` records it; a lower
  model label is kept; a re-assembly keeps the original `from`. The field is
  optional (stored reports parse unchanged), pipeline-owned (removed from the
  judge request schema; any model-emitted value is recomputed), and the
  report renders "Confidence capped at <x>: <reason>" under the section's
  one-line why. Reasons carry no numerals, so nothing uncitable enters the
  report. The judge prompt says the cap exists and that it may only go lower.
- **Why**: the decision in one line: section confidence is capped by measured
  data coverage; the model can lower but not raise it. The thresholds are
  conventions.
- **Disclosure**: no payload, score or band change. The audited-fixture
  group `d-50-confidence-ceiling` covers DEMO's leadership section (completeness
  0.63 since D-49): high → medium on the section and its strip twin. Test:
  `tests/stageC.confidenceCeiling.test.ts` (rule table, application,
  idempotence, legacy parse, rendered line).
- **Amended on review (2026-10-13)**: `dataCompleteness` counts
  route-suppressed signals as missing, so every fully observed bank had
  fundamentals (0.55), quality (0.57) and leadership (0.69) capped at medium
  with the false reason "under three quarters of its intended inputs", and a
  route-inapplicable aspect read as "unscored". `AspectScore` gains optional
  `applicableCompleteness` (used weight / route-applicable weight; null when
  the route cannot score the aspect). The ceiling reads it (stored reports
  fall back to `dataCompleteness`), a route-inapplicable aspect caps at
  medium with "no deterministic <aspect> score applies to this company's
  route", and the completeness reasons say "the inputs its route supports".
  The field is a registered optional surface field (audit scorecard table,
  exports), and `confidenceCeiling.ts` joins the risk-coverage manifest.
  Audited-fixture group `review-d46-d50` (DEMO is general: each value equals
  its `dataCompleteness`, no ceiling moves, the leadership reason is
  reworded). Tests: `tests/stageC.confidenceCeiling.test.ts`,
  `tests/stageB.grading.test.ts` (the fully observed bank reads 1 on every
  scored aspect).

## D-47 (bank disclosures 2026-10-13) HTM unrealised loss, marked TCE, ACL / loans and three-year loan growth are disclosed with warning signs, not graded

- **Problem**: nothing in the bundle showed unrealised losses on
  held-to-maturity securities, which are missing from book and regulatory
  capital and were the central post-SVB blind spot (Jiang, Matvos, Piskorski
  & Seru 2024, JFE 159: marking to market cut bank asset values by about 10%
  in 2022Q1-2023Q1; Fed Board review of SVB, Apr 2023). Fast loan growth
  predicts later poor bank performance (Fahlenbrach, Prilmeier & Stulz 2018,
  RFS), and nothing measured it. Both inputs are reliably tagged.
- **Options**: (a) leave them out; (b) grade them; (c) disclose them, with
  deterministic warning signs, and grade none of them.
- **Risks**: (b) has no fitted bands, and the deposit franchise hedges asset
  duration (Drechsler, Savov & Schnabl 2021, J. Finance 76), so an HTM loss
  is not a solvency verdict. Under (c) the HTM sign fires on BAC (30.5% of TCE
  at FY2025; both HTM signs at FY2024, marked TCE 3.82%), a large, sound bank: accurate as an exposure, wrong as a
  distress reading, so the wording must carry the caveat. The 21% tax is an
  assumption; the loss is point-in-time and pulls to par; uninsured-deposit
  data is text-only, so the run-risk half of the Jiang et al. test is absent.
- **Choice**: (c).
  - `src/pipeline/stageB/financialMetrics.ts` (bank route, display only):
    `htmUnrealizedLossNet` (loss − gain, else amortised cost − fair value;
    a pair at different dates or units withholds), `htmLossAfterTax` (× (1 −
    21%), stated as an assumption), `htmLossToTce`, `markedTceRatio` ((TCE −
    after-tax loss) / (tangible assets − pre-tax loss); AFS losses are
    already in TCE through AOCI, so no double deduction; a loss whose date or
    currency differs from the balance sheet's withholds), `aclToLoans`
    (direction ambiguous) and `loanCagr3y` (same loan element at four FY
    ends). `bankRiskFlags` evaluates, each a heuristic threshold, not
    validated: tangible leverage < 5%, HTM loss / TCE > 25%, marked TCE
    < 4%, loan growth > 15%/yr, loans / deposits > 110%, and provisions <
    net charge-offs while NPL rose (only when every input is tagged).
    Triggered signs become route-metrics notes in the report, with the
    public-filing CAMELS-style proxy note.
  - `src/pipeline/stageC/payload.ts`: the bank section adds the six metrics,
    the assumed tax rate as a row, and for each evaluated sign its value,
    threshold and status as citable rows; caveats are digit-free notes.
  - `src/pipeline/stageC/prompts.ts`: the judge discusses every triggered
    sign, presents HTM losses as conditional on deposits having to be funded
    by selling the securities, says loan growth includes acquisitions, never
    presents a count of signs as a probability, and calls the figures
    public-filing proxies with no supervisory rating. Digit-free.
- **Why**: the decision in one line: bank rate-risk (HTM unrealised loss,
  marked TCE) and credit-cycle (loan growth, reserves) measures are disclosed
  and flagged, not graded; HTM losses are presented as conditional on
  funding, not as realised.
- **Disclosure**: payload 1.14.0 (shared with D-46); no score or band moves.
  The one-off SVB FY2022 check (RESEARCH §6.3) fires the HTM and marked-TCE
  signs; thresholds were not tuned to it. Test:
  `tests/stageB.financialMetrics.test.ts` (HTM loss and marked TCE
  arithmetic, the fallback pair, and the instant-mismatch withholding).
- **Amended on review (2026-10-13)**: the large-bank comparison in RESEARCH
  §6.3 came from a scratch formula that did not deduct preferred stock; it is
  recomputed with `computeFinancialMetrics` (BAC FY2025 30.5% / 4.44%, about
  0.4pp above the marked-TCE line; FY2024 fires both HTM signs). Thresholds
  kept, not re-tuned after the fact. ACL / loans, the charge-off rate, NPL,
  provisions / loans, loans / deposits and loan growth now divide by gross
  loans first (`LOANS_TAGS` order: before-allowance, gross carrying amount,
  then the net elements), the FDIC QBP basis; ACL over net loans divided the
  allowance by loans it was already taken from. The tangible-leverage sign's
  caveat says the ratio excludes preferred stock and is a house threshold,
  not a regulatory minimum. Payload 1.15.0.

## D-46 (bank grading 2026-10-13) The bank balance sheet is scored on capital, credit and funding

- **Problem**: a bank's balance-sheet aspect was a placeholder
  (`scoreAspect('balanceSheet', [], …)`, "capital adequacy not computed"),
  so 10 of the financial route's 100 weight points dropped out and bank
  grades rested on earnings and valuation. The evidence on bank failure and
  bank stock losses is clearest on exactly what was missing. The simple
  leverage ratio predicted failure about as well as risk-weighted ratios
  (Estrella, Park & Peristiani 2000, FRBNY EPR 6(2)) and out-predicted them
  in the crisis (Haldane & Madouros 2012). Better-capitalised, more
  deposit-funded banks had better 2007-08 returns (Beltratti & Stulz 2012,
  JFE 105). CAMELS-style capital, asset-quality and liquidity proxies explain
  the 2009 failures (Cole & White 2012, JFSR 42).
- **Options**: (a) keep the placeholder; (b) grade on CET1; (c) grade on
  tangible leverage, the net charge-off rate, the NPL ratio and loans /
  deposits, with CET1 displayed only.
- **Risks**: (b) is impossible: none of JPM, BAC, WFC, C or PNC tags a CET1
  ratio after 2013. (c)'s bands are not fitted, and a leverage ratio is not
  comparable across business models (custody banks look thin by design).
  Filers that tag loans only by class (WFC after 2021) lose the loan-based
  inputs. Bank composites move, which the band version covers.
- **Choice**: (c).
  - `src/pipeline/stageB/financialMetrics.ts`: `tangibleLeverage` is always
    computed on the bank route (a stand-in only when CET1 is untagged).
    `ncoToAverageLoans` is the fiscal year's net charge-offs (the
    after-recovery element, else write-offs − recoveries from one tag family,
    10-K FY durations, a pair whose periods differ fails closed) over the
    average of the SAME loan element at the two year ends; a missing prior
    balance withholds. `loansToDeposits` is loans / `Deposits` at one date;
    different dates withhold.
  - `src/pipeline/stageB/grading.ts`: on the bank route the aspect is
    `tceToTangibleAssets` 0.40 (4% → 20, 5% → 35, 6% → 50, 8% → 70, 10% → 85,
    ≥ 12% → 90), `ncoToAverageLoans` 0.25 (≤ 0.25% → 85 … ≥ 3% → 10),
    `nplRatio` 0.15 (≤ 0.25% → 85 … ≥ 4% → 15) and `loansToDeposits` 0.20
    (≤ 80% → 80 … ≥ 125% → 15, no penalty for low ratios). All conventions,
    not fitted; capital is anchored to the PCA 5% "well capitalized" Tier 1
    leverage line and the Basel III 3% leverage minimum, the charge-off rate
    to the FDIC Quarterly Banking Profile definition. It is graded only with
    tangible leverage plus one other input; otherwise it is unscored with
    the reason and counts as missing evidence (a new `noDataReason`, not a
    route-inapplicable reason). A withheld NPL ratio drops out and the other
    weights renormalise, with completeness 0.85. Insurers and mortgage REITs
    keep the placeholder. `WEIGHTS_FINANCIAL.balanceSheet` stays 10.
  - `src/pipeline/stageC/payload.ts`: a bank payload gains "Bank capital,
    credit and funding", with the four inputs and CET1 as registered rows
    and digit-free notes (public-filing proxies, leverage not comparable
    across business models, CET1 never graded). The graded values are also
    the `computed.scores.balanceSheet.*` driver records.
- **Why**: the aspect most supported by the bank-failure evidence was the one
  left empty. The decision in one line: the bank balance-sheet aspect is
  scored on tangible common equity/tangible assets, net charge-offs/average
  loans, NPL where tagged, and loans/deposits; the bands are conventions
  anchored to the PCA/Basel leverage lines, not fitted; CET1 is displayed but
  not graded, because the largest filers do not tag it.
- **Disclosure**: `SCORE_BANDS_2026_10` (shared with D-48/D-49) and payload
  1.14.0. The aspect note states the conventions, the comparability caveat,
  that CET1 is never graded and that no supervisory rating is used. The
  audited fixture is a general company and does not move. Tests:
  `tests/stageB.grading.test.ts` (scored and renormalised with NPL withheld;
  unscored with only tangible leverage; the fully observed bank's ceiling
  66.15 → 76.15).
- **Amended on review (2026-10-13)**: "anchored to the PCA 5% well
  capitalized line" overstated the link. TCE / tangible assets is a
  holding-company GAAP ratio that excludes preferred stock (in Tier 1) and
  uses period-end assets, so it runs below Tier 1 leverage; a bank at the PCA
  line can read near 4.5% and score in the 20s, and the GSIBs score in the low
  50s. The cut points are unchanged (no fitted basis for a shift) but are now
  described as house cut points that echo the regulatory lines in scale only,
  in the band comment, the aspect note, RESEARCH §5/§6.3 and METHODOLOGY. The
  judge prompt adds a digit-free line: never say a bank is below, near or
  above a regulatory minimum or capital category on the strength of this
  ratio. Payload 1.15.0.

## D-48 (grading 2026-10-13) Technicals score 12-1 relative momentum, 52-week-high proximity and the SMA gap; RSI is display-only

- **Problem**: RSI-14 carried 0.2 of the technicals aspect, but there is no
  peer-reviewed evidence that it predicts returns on its own. Technical-rule
  profits largely vanish after about 1990 (Park & Irwin 2007, J. Economic
  Surveys). The momentum signal was a 6-month window ending at the latest
  bar. That window includes the latest month, which tends to reverse
  (Jegadeesh 1990, J. Finance; Lehmann 1990, QJE), and it is not the horizon
  the effect is published at (Jegadeesh & Titman 1993, J. Finance 48: 3-12
  months).
- **Options**: (a) keep the weights; (b) drop RSI and keep the 6-month
  window; (c) score 12-1 month relative strength, give 52-week-high
  proximity more weight (George & Hwang 2004, J. Finance 59) and keep RSI
  and the 6-month window as display-only.
- **Risks**: momentum crashes when the market rebounds (Daniel & Moskowitz
  2016, JFE 122), and the effect is weaker among large caps (Hou, Xue & Zhang
  2020, RFS; Fama & French 2008, J. Finance 63, still find it in every size
  group). The aspect's 5% composite weight limits both risks. Grades on
  existing reports shift slightly, which the band-version stamp covers.
- **Choice**: (c).
  - `src/pipeline/stageB/technicals.ts`: `alignSkipMonthWindow` uses the
    common end the 3/6/12-month windows use. The start is the latest exact
    common date on or before `shiftMonths(end, −12)` and the end the latest
    on or before `shiftMonths(end, −1)`, each within the same seven days.
    `RelativeStrengthSet.momentum12m1m` carries the issuer and SPY returns
    and their difference. A window that cannot be aligned is all null, with
    an info gap `…<benchmark>.12m1m` giving the reason.
  - It uses the same split-adjusted close price basis as the other windows
    (dividends excluded). The technicals rows do not carry adjusted closes,
    so it is a price return, not a total return.
  - `src/pipeline/stageB/grading.ts`: technicals are graded on
    `relStrength12m1m` 0.45 (new band −30pp → 15, 0 → 50, +20pp → 75,
    ≥ +40pp → 90; a convention, not fitted, anchored on Jegadeesh–Titman's
    roughly 1%-a-month spread), `position52w` 0.35 and `smaGap` 0.20. The
    12-1 window is never substituted by the 6- or 12-month window. The
    unused RSI and 6-month bands are deleted. The aspect weight stays at 5.
  - The aspect note, and a digit-free line in the judge prompt, say that
    momentum is a 3-12 month tilt that has reversed sharply after market
    rebounds and is not an entry-timing signal, and that RSI is shown for
    context and not scored.
  - `src/pipeline/stageC/payload.ts`: the technicals section prints
    "relative strength vs SPY, 12-1 month (latest month skipped)", dated at
    its window end, and the 6-month window. Both are registered records the
    analysts can cite; a withheld window prints n/a and registers a
    payload-gap citation. The scored value is also the
    `computed.scores.technicals.relStrength12m1m` driver record.
- **Disclosure**: `SCORE_BANDS_2026_10` and payload 1.13.0, both shared with
  D-49. The audited-fixture group `technicals-momentum-12-1` covers the DEMO
  leaves. DEMO has no SPY history, so its 12-1 window is withheld and
  technicals completeness falls 0.7 → 0.55. Stored reports keep their
  `rsi14` and `relStrength6m` drivers; new reports have no such records.
  Tests: `tests/stageB.technicals.test.ts` (window dates, and withholding
  past the 7-day tolerance) and `tests/stageB.grading.test.ts` (no
  substitution; RSI and the 6-month window are not drivers).
- **Amended on review (2026-10-13)**: (1) the 0.35 signal was range
  position, (close − low) / (high − low), not the price / 52-week high ratio
  George & Hwang rank on, and the two order stocks differently. It is now
  `pctFromHigh52w`, (close / high − 1) × 100, on `HIGH_PROXIMITY_BAND`
  (−50% → 15, −30% → 30, −15% → 50, −5% → 70, 0 → 85; convention, not
  fitted); the range position stays displayed. (2) The 12-1 band's "anchored
  on Jegadeesh–Titman's 1%-a-month spread" confused the next-period payoff
  with the formation-period return the signal measures; it is described as
  an unfitted monotone mapping, JT cited for direction only. (3) The verifier
  read "12-1 month" in the row's own label as the numbers 12 and 1, so an
  honest absence statement on the withheld row failed as gap-source-number;
  `consistency.ts` strips that window name (only it) as a non-quantity.
  Audited-fixture group `review-d46-d50` (DEMO technicals 83.92 → 81.25,
  composite 77.6 → 77.53). Payload 1.15.0. Tests:
  `tests/stageB.grading.test.ts` (a stock near the top of a narrow range
  outranks one at half its high), `tests/stageC.gapCitations.test.ts`.

## D-49 (grading 2026-10-13) Net share-count change is scored once (leadership) and the SBC charge once (balance sheet, % of FCF); both remain displayed elsewhere

- **Problem**: `shareCountTrend` was a driver of both the balance-sheet
  (0.15) and the leadership (0.25) aspects. Leadership also scored
  `sbcPctOfRevenue` (0.2), although the balance-sheet note said "the SBC
  charge itself is scored exactly once" (by `sbcPctOfFcf`). Net issuance and
  stock-based compensation were each weighted twice, and the code broke its
  own stated rule.
- **Options**: (a) leave both double counts; (b) halve each duplicate's
  weight; (c) score each signal in one aspect only.
- **Risks**: (a) quietly over-weights one family of signals. Net issuance is
  among the best-replicated return predictors (Pontiff & Woodford 2008,
  J. Finance 63; Daniel & Titman 2006, J. Finance 61, whose composite
  issuance includes SBC; Fama & French 2008, J. Finance 63; Hou, Xue & Zhang
  2020, RFS). That is a reason to show it once, clearly, not to count it
  twice. (b) keeps two drivers for one fact. (c) moves composites a little
  for issuers with heavy SBC.
- **Choice**: (c), in `src/pipeline/stageB/grading.ts`.
  - The balance sheet (general and equity-REIT routes; financial routes do
    not score it) drops `shareCountTrend` and is scored on net debt/EBITDA
    0.3, interest coverage 0.2, before-SBC FCF conversion 0.2 and SBC/FCF
    0.15. The existing weighted-mean machinery renormalises them. Its note
    no longer says "dilution".
  - Leadership drops `sbcPctOfRevenue` and is scored on buyback discipline
    0.3, capital deployment 0.25 and share-count trend 0.25. Dilution from
    SBC already shows in the share count net of buybacks, and the SBC cost
    is in SBC/FCF. The unused `SBC_REV_BAND` is deleted.
  - Both SBC ratios still appear in the capital payload rows and the
    data-only report. The band table is now `SCORE_BANDS_2026_10`.
- **Disclosure**: both aspect notes say where each signal is scored. The
  audited-fixture group `score-once-dilution-sbc` lists the DEMO leaves that
  moved. A bank's leadership completeness drops from 0.75 to 0.69, because
  the 0.55 of available weight is now read against 0.8
  (`tests/stageB.grading.test.ts`). `PAYLOAD_VERSION` moves to 1.13.0, so an
  analyst pass that anchored to the old band table is never resumed; the DEMO
  pin loses the two driver records (372 → 370).

## D-45 (verification 2026-10-13) A number cited to a filing excerpt is read against that excerpt, beside its own description

- **Problem**: a TracedNumber citing `edgar:10-K item7` or a transcript could
  never verify. The verifier knew only numeric registry records and never read
  the excerpt text it already had. JPM report 26 logged 25 numbers as
  `text-source`, and META report 25 logged 5, although the excerpts print most
  of them ("$915 billion", "14.2 %", a "95,640" cell in an "(in millions"
  table). A FACT claim citing the same excerpt already counts as verified on
  the citation alone, so reading the number is stricter than the existing bar.
- **Options**: (a) the finding's matcher: value, unit, scale, table and
  specificity rules over the cited excerpt; (b) (a) plus a rule that the
  number's own description must name the printed figure; (c) a quote anchor
  (an optional `quote` on TracedNumber); (d) leave excerpt numbers
  unverifiable.
- **Risks**: (a) proves only that the value is printed somewhere in the
  section, not what it means. keyNumbers carry no label, so a right value
  could verify under the wrong meaning. Measured on report 26's excerpts, (a)
  accepted every deliberate swap to another specific figure of the same unit
  in the same excerpt (795 of 795). (c) changes a strict, shared
  structured-output schema and adds output tokens after the 15-minute-limit
  work. (d) leaves true, printed figures unverified.
- **Choice**: (b), in `src/pipeline/stageC/excerptNumbers.ts`, with the
  verify-pass hook in `passes.ts`.
  - Only the excerpt with the cited (source, as-of) is read, and only its body
    (`excerptBodyForVerification` drops the truncation marker). Other sections
    of the same filing, and other excerpts, are never searched.
  - Unit and currency: a percent needs a printed "%"/"percent". Money needs a
    printed "$", read as the reporting currency only when the issuer's
    statement records agree on one dollar currency; a claim in another
    currency fails. A count needs neither. Per-share and every other unit
    fail as `unit-mismatch`, and "people" never canonicalizes.
  - Table scale: an "(in millions" header applies only to a comma-grouped
    whole-number cell in a money table. A decimal cell never takes it (the
    prototype read "$ 126.99" book value per share as $126.99m), and no "$"
    cell takes it under an "except per share" header.
  - Precision: within half a printed step and an exact multiple of it, so
    915.3e9 does not match "$915 billion". Specificity: three significant
    digits, or two with a decimal or a scale word; otherwise the reason is
    `text-ambiguous`.
  - Description (new, beyond the finding): the number's description is its
    unit text beyond the bare unit plus the label of the metric row it sits
    in. Stopwords, unit, period and label words, and the issuer's name are
    ignored. More than half of the distinctive words must appear within 250
    characters of the printed figure and inside its sentence or bullet, or,
    for a table cell, in that row's own label. A number with no description
    words fails (`text-context-mismatch`, fail-closed).
  - The minimum asked for was one word within ±250 characters. Measured, it
    accepted 126/795 swaps, every one a table cell or a figure near a common
    word ("provision" for "pre-provision profit"). The majority rule, the row
    label and the sentence clip are each stricter than that minimum.
  - A match logs traceKind `excerpt-match` with the note `value printed in
    the cited excerpt as "<raw>" beside "<words>"; period not machine-checked`,
    and fills an omitted currency. A miss keeps `text-source`, with the note
    "value not printed in the cited excerpt".
  - The prompt's shared system block (which the judge also receives) gains an
    EXCERPT NUMBERS rule: copy the figure exactly as printed; the unit is
    "%", "currency", "count" or "shares" followed by the excerpt's own words
    for the figure. It names what cannot be checked (bare table cells, whole
    percents of one or two digits, per-share amounts).
- **Review amendments (2026-10-13)**, each with a regression test in
  `tests/stageC.excerptNumbers.test.ts`:
  - A named row's name is part of its numbers' description. A segment
    `{name, revenue}`, a peer `{name, metrics[]}` or a macro series
    `{name, latest}` renders its number under that name, yet the description
    read only the unit text: "currency eligible HQLA" verified $915 billion as
    Consumer & Community Banking's revenue.
  - A bare decimal with no scale word is never a count. Only a flattened
    table's first row prints its "%" or "$", so "Tier 1 capital 15.1" (a
    percent) and "Tangible book value per share 113.35" read as counts.
  - "count …" and "shares …" units now canonicalize like "% …" and
    "currency …". Before, the EXCERPT NUMBERS rule's own shape ("count daily
    active people") failed as unit-mismatch, so no excerpt count could
    verify.
  - `src/pipeline/stageC/excerptNumbers.ts` joins the risk coverage manifest
    (`vitest.shared.ts`): it is an acceptance path of the verifier.
- **Not done**: the quote anchor (c), which needs a schema change and its own
  decision; a check of the period against the printed column; spoken
  transcript forms ("$4.6B", "twelve percent"); non-dollar filers.
- **Evidence** (2026-10-13; a throwaway script rebuilt report 26's excerpts
  from the cached JPM 10-K and 10-Q with `extractSection` and
  `truncateWithDisclosure`, byte-identical to the investigator's copies, and
  ran the real matcher):
  - Report 26's 25 text-source numbers, as stored: 20 verify without the
    description rule (the finding's A–D), 4 with it. The 4 are the
    marginTrend cells, whose rows are labelled "Annual pre-provision profit"
    and "Annual noninterest expense". 16 are printed but carry the bare unit
    "%" or "currency" and nothing saying what they are. 3 are ambiguous
    (20%, 29%, 7%), and 2 are not printed as percents (the bare "4" cells).
  - With the description the new prompt asks for (hand-written from the
    excerpt: "Standardized CET1 ratio", "eligible HQLA", "Investment Banking
    fees wallet share", …), the same 20 verify.
  - Deliberately wrong values, keeping each claim's own description: ±1 in
    the last printed digit, 0/50 accepted with or without the rule. Every
    other specific figure of the same unit in the same excerpt: 795/795 with
    no rule, 5/795 (0.6%) with it as stored, and 26/795 (3.3%) with the
    hand-written descriptions.
  - The 3.3% left are the other column of the same table row (the prior
    year: a period, not a meaning, error) and figures that share the
    description's words in one sentence: "Standardized and Advanced CET1
    ratios were 14.6% and 14.1%", and the HQLA sentence's $548 billion and
    $1.5 trillion.
- **Compatibility**: additive. The log reason enum gains `text-ambiguous` and
  `text-context-mismatch`, and traceKind gains `excerpt-match` ("filing/
  transcript text match"); old reports still parse. Stored reports keep their
  entries, since no registry or payload is persisted to re-verify against.
  The system block grows, so the cached prefix is rebuilt once. No numeric
  record moves, and `npm run audit:deltas` records no delta.
- **Revised by D-129 (B2 OD-1, audit 2026-10-27 AI-305)**: on the second gate an excerpt figure also binds only to its own description, which narrows the same-sentence residual accepted above: a figure the sentence gives to another noun no longer verifies a number or claim that names a different metric. Figures that share every description word ("Standardized and Advanced CET1 ratios were 14.6% and 14.1%") still cannot be told apart. See the entry "Audit batch B2: an excerpt figure binds only to its own description".

## D-44 (verification 2026-10-13) Every numeric row prints a unit, and an indicator's name is read only on its own record

- **Problem**: reports 25/26 logged 10 unit-mismatch key numbers.
  - "RSI" and "RSI index" (5): the bare-ISO-code branch of
    `canonicalizeTracedUnit` ran before the indicator spellings and read "RSI"
    as a currency.
  - "MACD histogram" (3): the payload row printed no unit at all (`unit: ""`),
    and the judge, which writes every graded key number, never received the
    analysts' bare-unit rule.
  - "evidence-completeness fraction" 0.4 / 0.45 (2): these cited the quality
    and leadership SCORE records. Completeness was shown only inside the score
    row's unit qualifier, which no record carries.
  - Simulating the finding's first fix showed that indicator spellings
    accepted on id, value and as-of alone would verify "-4.8154 RSI" on the
    MACD record. Lowercase "rsi" already did. The report prints the unit
    verbatim beside a verified number.
- **Options**: (a) map the spellings to `index` only; (b) (a) plus binding a
  spelling that names an indicator to that indicator's record; (c) read
  "<description> <unit>" for completeness.
- **Risks**: (a) renders verified numbers under the wrong indicator's name.
  (c) would make the two genuine mis-citations verify against a record whose
  value (79.11, 72.35) they do not state.
- **Choice**: (b), and no (c).
  - The indicator spellings (rank, pctile, z, m, rsi, "rsi index", "macd
    histogram") are read as index before the ISO branch. "RSI %" and "RSI
    P/E" fail closed rather than reading "RSI" as an ISO head.
  - `namedUnitMatchesRecord`: "RSI"/"RSI index"/"rsi" verify only on a
    record whose last id segment starts with "rsi" (rsi-14, the rsi14
    driver), and "MACD histogram" only on macd-histogram.
  - RSI-14, MACD histogram and the MSPR rows print "index", their unchanged
    registry unit. The excess-return horizon prints "years", so its record
    moves from index to years, its true dimension.
  - Each aspect's completeness is its own row and record (`<aspect> evidence
    completeness`, fraction → ratio), and leaves the score row's qualifier.
  - The bare-unit rule is one constant, `TRACED_NUMBER_UNIT_RULE`, given to
    the judge as well as the analysts, with a line that indicator readings
    use "index".
- **Evidence**: `tests/stageC.indicatorUnits.test.ts` builds the real bank
  payload, whose quality and leadership completeness are 0.4 and 0.45 as in
  report 26.
  - Report 25/26's spellings verify on their own records.
  - The cross-indicator pairs, including lowercase "rsi" on MACD, fail.
  - Report 26's completeness-on-score citation still fails, and 0.4 on the
    new completeness record verifies.
  - No numeric row in any section prints without a unit.
- **Compatibility**: tightening only, except the 8 indicator spellings now
  accepted on their own records. The DEMO pin moves by +7 records, +829
  prompt bytes and the fingerprint. The MACD histogram's "index" is the
  existing bucket, not a price-point dimension. Stored reports keep their
  entries (no re-verify path).

## D-43 (verification 2026-10-13) Every printed tag is citable, and a citation supports only what its row shows

- **Problem**: the prompt says "Every figure below is tagged [source · as-of].
  Cite that tag", but the verifier registered a tag only when it became a
  numeric record or was a text row. Three kinds of printed tag were in
  neither registry. (1) n/a rows, such as `net debt/EBITDA: n/a
  [computed.capital.netDebtToEbitda · 2025-12-31]` on a bank. (2) Money rows
  of unknown currency: peer market caps, executive-compensation totals, and
  the consensus price target and analyst estimates. (3) Missing-data manifest
  lines, which had no tag at all, while the prompt told the model to
  "preserve an explicit unsupported state". So in reports 25 (META) and 26
  (JPM) every claim citing these rows failed as unknown-source. That included
  true gap statements ("EBIT interest coverage is not meaningful for this
  bank") and ten named-officer FACTs taken from the proxy rows. Gap
  statements were written with the source "unsupported". Separately, a claim
  naming a person passed on the person-row TAG alone. The rows were never
  read, so "Tim Cook has led the company since 2011" passed with no row at
  all. Registering the compensation tag without a content check would also
  have let "Sheryl Sandberg is CEO" pass.
- **Options**: (a) register the printed tags as ordinary text citations, the
  investigator's first proposal; (b) register them by what they are, and
  guard what each can support; (c) leave them unregistered and tell the model
  not to cite them.
- **Risks**: (a) loosens verification. A text citation gets no prose-number
  check (`consistency.ts`: the numeric checks need a numeric record). In a
  simulation, "Net debt/EBITDA is 1.2x" citing the n/a row verified, and so
  did "consensus target $781" citing a target of unknown currency. (c) keeps
  true claims unverified and contradicts the prompt.
- **Choice**: (b), as one change.
  - `CitationProvenanceRecord.kind` is now `payload-text`, `payload-gap` (an
    n/a row, a manifest entry) or `payload-unestablished` (a row printed with
    a number whose unit, currency or date is not established). When one tag
    and date carry several kinds, unestablished outranks text, and text
    outranks gap. A money row of unknown currency also carries
    `currencyUnknown`.
  - Each manifest line renders `[manifest.<field>]`. The tag is omitted when
    the field cannot be written as one source id. Each tagged line is
    registered as a gap.
  - The general route prints the projection weights as a citable row
    (`computed.projections.scenarioWeights`, "25/50/25"). A text row whose
    value shows numbers supports only those numbers (`allowedNumbers`; a
    different number fails as value-mismatch). The bank route, where nothing
    is weighted, prints a `weighted projections: n/a [computed.projections]`
    gap row and no weights.
  - Guard, in `claimSourceMatch`: a claim citing a gap or unestablished
    record with no numeric record fails as `gap-source-number` if it states a
    number. Before the sentence is parsed, the guard sets aside tags, ISO
    dates, filing forms, "Form/Item/Tier/Rule/Basel n", identifiers (CET1,
    Q3, FY2025, 7A, 10b5-1), "n-year" and bare years. "The CET1 ratio is
    withheld" therefore passes, while "1.2x", "$4.5 billion", "is 3" and
    "25 bps" fail. A structured number citing such a row logs
    `gap-source-number` rather than `text-source`.
  - Guard, in the unit check: a sentence that puts a currency on a number
    citing a `currencyUnknown` row is rejected as `currency-not-established`.
    The check looks for a $ € £ ¥ ₩ ₹ symbol, a deliberate ISO-code list
    (not a generic [A-Z]{3}, which would catch tickers), or "dollars"/"usd".
  - Person rows: `fmp:executive-compensation` joins the person-row tags. A
    claim naming a person that cites a person row passes only when that tag's
    rows (at the claim's as-of) list the person and any title the claim
    states. This branch runs before a numeric record could accept the claim.
    - A name passes if the claim writes the row's first and last names, with
      every written token present in order. So "Mark Zuckerberg" passes for
      "Mark Elliot Zuckerberg", while "Chris Cox", "Susan J. Li" against
      "Susan Li", and "Mary Callahan" fail. Insider names match in any order.
    - A title passes only as one whole role of the row, keeping its modifiers
      and scope. "CEO" fails for "Co-CEO, Commercial & Investment Bank", and
      "Chairman" fails for "Vice Chairman". "Former" must agree. Ambiguous
      abbreviations (CIO, CMO, CAO, CPO) do not expand.
    - The new failure reasons are `named-individual-not-in-source` and
      `named-individual-title-mismatch`.
    - A credibility-path claim that names nobody and cites a person row is
      still accepted, as before. Comp rows render as payload figures, which
      the credibility rule admits.
  - A rejected claim's coverage entry now carries the check's reason, not a
    blanket unknown-source.
  - The prompt names the manifest and n/a tags for data-gap statements,
    forbids "unsupported" as a source and any number in a gap sentence, says
    "not in the evidence reviewed" rather than "the company does not
    disclose", names the compensation rows with the spell-as-the-row rule,
    and drops the literal "25/50/25" from the style example.
- **Review amendments (2026-10-13)**: an adversarial pass over the new
  acceptance paths found claims that verified without support. Each is now
  rejected, with a regression test in `tests/stageC.verifyChecks.test.ts` or
  `tests/stageC.gapCitations.test.ts`.
  - Unlisted names: a name no known-name list or role pattern finds was
    invisible, so "Sheryl Sandberg is CEO" citing JPM's compensation rows
    named nobody and passed on the tag. A claim citing a person row is now
    also read for capitalized word runs. Runs are split at function, title
    and document words and at the person rows' title words; organisations,
    initials-only runs and one word opening a sentence (unless a verb such as
    "received" follows it) are skipped. What is left must be a name the rows
    list. A capitalized word that is no name fails closed.
  - Titles: only "as", ", the" and "(" introduced a title, so "Jeremy Barnum
    is the CEO" (his row says CFO) and "CFO James Dimon" passed as name-only
    claims. "is", "was", "serves as", "remains", "became" and "has been" now
    introduce a title, and a role written before a known name is read with its
    modifiers ("Co-CEO Troy Rohrbaugh").
  - Numbers on a gap or unestablished row: "two times" / "twice" (written in
    words) and "EUR5bn" (a currency code glued to the number, which the
    identifier strip removed) stated no number. Both now count.
  - The weights row: membership let "the bull scenario carries a 50% weight"
    verify against bull/base/bear 25/50/25. A row's `allowedNumbers` now
    supports only the full sequence in the row's order.
  - The next-earnings note (D-42) was a plain text citation, so "reports on
    2027-02-14" verified against a note saying 2027-01-14. The note's date is
    registered as `allowedDates`: a sentence citing it may state that date
    (ISO, "January 14, 2027", "14 Jan", "January 2027") and no other number.
  - `PAYLOAD_VERSION` moves 1.11.0 → 1.12.0 once for D-42..D-45. The
    fingerprint already hashes the prompt, so no stored pass could resume
    across the change; the version names the new evidence conventions.
- **Not done (deferred)**: compensation currency from the proxy's Item 402
  accession, and peer currencies from each peer's profile. Until they land,
  peer market caps and compensation amounts stay non-verifiable as numbers.
  A bare year-like number without a unit ("employs 2050 people") is still
  read as a year and set aside; a single first name ("Sheryl is CEO") is not
  read as a person.
- **Evidence** (reports 25 and 26 replayed through the new checks, in
  `tests/stageC.verifyChecks.test.ts` and `tests/stageC.gapCitations.test.ts`):
  - All ten compensation-row officer FACTs pass the content check.
  - The number-free judgments citing peers, the target and compensation, and
    the bank gap statements ("EBIT interest coverage is not meaningful…",
    "No quantitative balance-sheet score is available…"), verify.
  - "Net debt/EBITDA is 1.2x." on the n/a row, "The consensus target is
    $781.", a peer cap as a number, "Douglas Petno as CEO", and "Sheryl
    Sandberg, the CEO" all fail.
  - The stored peer and compensation NUMBERS stay unverified (now
    `gap-source-number`), as do the "unsupported"-sourced claims, until a
    report is regenerated under the new prompt.
- **Compatibility**: the log reason enum gains four additive values
  (`gap-source-number`, `named-individual-not-in-source`,
  `named-individual-title-mismatch`, `currency-not-established`). The prompt
  grows by the manifest tags and the weights row (DEMO fixture +872 bytes, 11
  → 48 citation records), so the fingerprint moves and no stored pass
  resumes. No numeric record or finance figure moves, and `npm run
  audit:deltas` records no delta. Person-row citations are stricter, which is
  fail-closed: a true claim that respells a name or shortens a title is now
  rejected.

## D-42 (EDGAR bank equity 2026-10-13) Tangible common equity deducts the carrying value of preferred and every non-goodwill intangible

- **Problem**: JPM report 26 was served by EDGAR (FMP returned 429), and its
  tangible common equity kept about 20B of preferred stock in it. The
  `preferredStock` chain read only `PreferredStockValue`, which JPM last
  tagged in 2009. Since then it files the carrying value as
  `PreferredStockIncludingAdditionalPaidInCapitalNetOfDiscount` (20,045M
  FY2025, 20,050M FY2024; FMP's figure). `tangibleCommonEquity` treats an
  unresolved line as zero, while the tangible-leverage basis still printed
  "− preferred". Separately, `intangibleAssets` fell back to
  `FiniteLivedIntangibleAssetsNet` alone, which dropped JPM's indefinite-lived
  intangibles (1.3B FY2025, 1.2B FY2024). Seventeen "verified" figures were
  numerically wrong as a result (ROTE, P/TBV, justified P/TBV,
  excess-return per share, fair value and the moat return drivers).
- **Options**: (a) leave the chains; (b) add the APIC-inclusive preferred
  elements, and sum the finite- and indefinite-lived intangible pieces when
  the filer tags no total; (c) also deduct mortgage servicing rights, as
  FMP's `intangibleAssets` does.
- **Choice**: (b). `preferredStock` reads the carrying value first, then the
  par value. `intangibleAssets` is a chain: the tagged
  `IntangibleAssetsNetExcludingGoodwill` total, else the sum of whichever
  pieces are tagged. The pieces are disjoint by taxonomy definition and run
  only when the total misses, and an absent piece is named in the notes. MSRs
  are not deducted, because the TCE convention (JPM's included) keeps them in
  TCE. So for a mortgage servicer the EDGAR and FMP intangibles legitimately
  differ (JPM FY2025: 2.6B vs 11.73B). When no preferred line is tagged, the
  tangible-leverage basis now says "preferred (none tagged, assumed zero)"
  instead of claiming a deduction.
- **Open, not changed: common dividends beside outstanding preferred.** The
  aggregate-dividend guard in `buildStatementsFromCompanyFacts` still reads
  `PreferredStockValue` alone. Widening it to the chain withholds JPM's common
  dividends for 2023-2025, and the whole excess-return valuation with them
  (CRITICAL gap). JPM tags no cash common-dividend element
  (`PaymentsOfDividendsCommonStock`, `PaymentsOfDividendsPreferredStockAndPreferenceStock`
  and `DividendsCommonStockCash` are all absent from its companyfacts), so the
  common payout cannot be established from a direct cash tag. JPM's payout
  therefore still includes about 1.1B a year of preferred dividends
  (`DividendsPreferredStock` 1,099M FY2025, inside `PaymentsOfDividends`
  16,625M). Withholding the valuation, or approving a disclosed stand-in
  (aggregate less preferred dividends declared, which the code currently
  rejects as non-cash evidence), is an owner decision.
- **Evidence** (2026-10-13, JPM, live bundle served by EDGAR): balance rows
  carry preferred 20,045M / 20,050M / 27,404M (FY2025/24/23) and intangibles
  2.6B / 2.9B / 3.2B. TCE 308,407M -> 287,062M (FY2025) and
  290,493M -> 269,243M (FY2024). ROTE 18.59% -> 20.02%, P/TBV 2.904x ->
  3.120x, justified P/TBV 2.222x -> 2.418x, tangible leverage 7.06% ->
  6.57%.
- **Compatibility**: no report shape or payload change. `npm run
  audit:deltas` records no delta, because the DEMO/DBNK fixtures are not
  built from companyfacts. Any filer tagging only the APIC-inclusive
  preferred element now has preferred resolved. That lowers its TCE and adds
  the preferred to every EV bridge, and where neither filed common earnings
  nor a cash preferred dividend exists, ROTE is withheld (fail-closed).
  `TAG_SYNONYMS_REVIEWED_ON` moves to 2026-10-13.

## D-41 (financial grading 2026-10-12) Banks get the DCF's evidenced-excess rule and an equity value-creation signal

- **Problem**: a live sweep of JPM, BAC, WFC and C graded every one F on
  valuation and scattered quality from A to F. Two causes. (1) The excess-return
  model always faded ROE to the cost of equity with no continuing value. The
  DCF had already replaced that default with an evidenced-excess convention
  (`terminalRoic`, after the 2026-09-02 sweep graded 19 of 21 large caps D/F),
  but the equity model was never moved with it, so JPM's price "required" a
  53.8% starting ROTE against 20.7% earned. (2) Financial routes suppress
  ROIC − WACC and name return on equity against the cost of equity as the
  value-creation measure, but nothing scored it: quality rested on a 3-5
  signal Piotroski battery, about 7% of its intended evidence.
- **Options**: (a) leave both; (b) re-band the valuation and quality aspects
  for financials; (c) apply the existing house conventions to the equity side.
  (b) would need an outcome backtest this tree does not have.
- **Choice**: (c). `excessReturnModel` reads a per-year return history against
  each year's own cost of equity through `terminalRoic` (same constants: 4+
  years, half the median spread, 5pp cap, 0.5pp floor); a carried spread is
  valued past the horizon as residual income growing at
  min(2.5%, risk-free), behind the DCF's 2pp CoE − g guard, and the reverse
  solve uses the same terminal. On excess-return valuations the quality
  aspect's ROIC − WACC slot (weight 0.35, `SPREAD_BAND`) is filled by
  current return minus cost of equity. No band table moves.
- **Evidence** (data and compute only, 2026-10-12): JPM value per share
  144.61 -> 209.07, implied starting ROTE 53.8% -> 39.5%, quality F -> B;
  WFC quality A -> B; BAC C -> C; C quality C -> D (it earns below its cost of
  equity and carries no excess). AAPL (general route) unchanged. Valuation
  stays F for all four: they also trade near the top of their own P/TBV
  history, which is half the aspect.
- **Compatibility**: no report shape change. Without a return history the
  model behaves exactly as before. The DEMO/DBNK fixtures lack the history, so
  only the quality-aspect note moves (`bank-equity-value-creation` group).

## D-40 (scenario horizon 2026-10-05) The horizon beside a computed target is set in code

- **Problem**: AI reports replaced each scenario's price target with the
  deterministic Stage B target but kept the judge's free-text `horizon`, so a
  present-value DCF sensitivity could print as "12 months" (DEMO's sample
  judge output does, beside three suppressed targets).
- **Options**: (a) keep judge text; (b) set the label in `applyScenarioTargets`
  from one constant, matching the data-only report; (c) drop the field, which
  changes the report shape.
- **Choice**: (b). `SCENARIO_TARGET_HORIZON` ("explicit DCF horizon") when the
  scenario's computed per-share target is non-null, "n/a" otherwise, including
  a null target inside an available block. The data-only path
  now takes the label from the same function. Probability, assumptions and
  conditions stay the judge's.
- **Compatibility**: no shape or payload change; the AI payload never carried
  the label. Ships with report 1.10.0 (D-39); saved reports keep their stored
  text. The three DEMO horizons are recorded in the `scenario-horizon-label`
  delta group.

## D-39 (growth-anchor span 2026-10-05) A CAGR method counts only over its own window

- **Problem**: the DCF growth anchor read the 3y and 5y revenue CAGRs without
  checking the span each actually measured. With two annual years of history,
  one two-year rate entered the median twice, labelled "3y" and "5y"; with
  four, a four-year rate entered as "5y". Grading and the data-only
  achievable-growth comparison already rejected such windows (±0.25 years).
- **Options**: (a) keep the degraded rates as anchor methods and rely on the
  growth-series horizon notes; (b) exclude a window whose measured span is not
  the window, with grading's tolerance; (c) relabel a degraded rate as an
  N-year method. (a) double-counts one measurement under two names; (c) would
  change the method set D-18 defines.
- **Risks**: the anchor can rest on fewer methods (DEMO: the regression alone,
  no range), and the fair value moves slightly when the regression and the
  degraded CAGR differ (DEMO 152.09 → 152.06). Short histories already show the
  regression's n and R².
- **Choice**: (b). One helper, `windowCagr` in `growth.ts`, holds the rule and
  `CAGR_SPAN_TOLERANCE_YEARS` (0.25) for grading, the DCF anchor and the
  data-only comparison. An excluded window is listed as unavailable with its
  measured span and named in the `valuation.dcf.growthAnchor` gap. The degraded
  CAGR series stays displayed with its span (D-37), and the acceleration
  benchmark keeps its own ±0.05-year rule.
- **Compatibility**: report 1.10.0 and payload 1.11.0 identify the convention;
  saved reports keep their stamps and bytes, and partial AI passes stored under
  1.10.0 do not resume. Intended DEMO deltas are recorded in the
  `growth-anchor-span-window` group.

## D-38 (recommendation review 2026-10-04) Evidence-qualified improvements

Follow-up to the merged repository audit: assess all seven recommendations,
implement independently justified changes sequentially, and retain explicit
deferrals where outcome evidence or an end-to-end contract is missing. The
[critical review and verification ledger](2026-10-04-recommendations.md) records
alternatives, acceptance evidence and limitations. Regular final-session dates,
conservative current-day withholding for keyless beta, and
calendar-aligned monthly/quarterly/annual FRED lags require report 1.9.0 and
payload 1.10.0; saved reports remain unchanged and older partial AI passes do
not resume under the new financial conventions. No forecast probability or AI
accuracy gain is inferred merely from passing regression tests.
## Current implementation crosswalk — 2026-10-05

Source and test definitions checked on 2026-10-05, through the D-39/D-40
changes that set report 1.10.0 / payload 1.11.0; this is a status crosswalk,
not a fresh verification of historical runs or external account permissions.

| Decision group | Current disposition and authoritative source |
| --- | --- |
| D-01–D-06: Claude model/request registry | Implemented in [registry](../../src/models/registry.ts), [JSON snapshot](../../config/models.json) and [Claude provider](../../src/providers/anthropic.ts). `autoPreference` starts with Opus 5.5 and `judgeFloorModelId` is Sonnet 5.5; the Opus 5/Sonnet 5 choices below are historical. [Registry tests](../../tests/modelRegistry.test.ts) and [request-shaping tests](../../tests/anthropic.requestShaping.test.ts) cover the local rules. |
| D-07–D-10: lease, presumed spend and admission | Implemented by [scheduler](../../src/pipeline/jobScheduler.ts), [runner](../../src/pipeline/jobRunner.ts) and [lease timing](../../src/pipeline/leaseTiming.ts). Default admission is per request; `pass` compatibility mode still exists despite the original “one release” intention. [Admission](../../tests/requestAdmission.test.ts) and [presumed-spend tests](../../tests/scheduler.presumedSpend.test.ts) cover the invariants. |
| D-11–D-17 and D-34: sources and financial routes | [Bundle](../../src/pipeline/dataBundle.ts), [keyless](../../src/pipeline/keyless.ts), [successor](../../src/edgar/successor.ts) and [routing](../../src/pipeline/stageB/sectorRouting.ts) implement reserved fixtures, issuer-gated fallback, predecessor history, beta and corroborated financial classification. Recorded `fixtures/edgar/xom_successor_*` headers supersede the original deferred synthetic-only fixture choice. Keyless Form 4 trade reconstruction remains deferred. |
| D-18/D-19/D-24–D-26/D-28–D-31/D-35/D-37–D-39: financial conventions | [Compute](../../src/pipeline/compute.ts), [Stage B](../../src/pipeline/stageB) and [split resolution](../../src/edgar/splits.ts) implement the evolving growth, capital, currency, common-ownership, share-basis and calendar rules. Report spec 1.10.0 and payload 1.11.0 identify the latest conventions; older version stamps below describe their individual batches. See [METHODOLOGY](../METHODOLOGY.md) for a coherent current formula description. |
| D-20/D-40: judge protocol | [Judge protocol](../../src/pipeline/stageC/judgeProtocol.ts) and [Stage C](../../src/pipeline/stageC/index.ts) implement selected order, protected-content-aware shortening, exact excess and reconstructed-resume disclosure. Persisting the original complete protocol on the synthesize artifact remains unimplemented; a resumed protocol can re-derive order using the current setting, with unknown lengths disclosed. [Protocol tests](../../tests/stageC.judgeProtocol.test.ts) cover the recorded metadata. Scenario horizon labels are set by `applyScenarioTargets` in [passes](../../src/pipeline/stageC/passes.ts), not the judge (D-40); [pass tests](../../tests/stageC.payload.passes.test.ts) cover null and suppressed targets. |
| D-21/D-22/D-27/D-32: local boundaries and tooling | [Request security](../../src/app/requestSecurity.ts), [environment](../../src/config/env.ts), [scripts](../../package.json) and the [Next lint adapter](../../scripts/next-eslint-glob/index.cjs) are authoritative. Node is now `>=24` (2026-10-22 audit, F-10); historical package targets and README line counts are not current dependency state. |
| D-33/D-36/D-37/D-38: connections and display | [AI connections](../../src/ai/connections.ts), [credential store](../../src/ai/store.ts), [native mutex](../../src/ai/mutex.ts) and [appearance](../../src/appearance/preference.ts) implement explicit connections and browser appearance persistence. Current is the default; Research workspace is optional and Decision brief remains a prototype. The permanent SQLite mutex replaces the F08 stale-PID protocol; stopped-server upgrades and local-filesystem requirements remain. Recorded grade/DCF evidence and paginated chart tables are implemented; see the [recommendations ledger](2026-10-04-recommendations.md). |

Live OAuth approval, current account access, macOS credential behavior, empirical
model calibration and provider-rights interpretation are not established by
this crosswalk. Source and regression definitions establish implemented local
behavior; historical measured costs remain the observations recorded below.

## D-37 (audit follow-up 2026-10-04) Validate evidence before presenting or rewriting it

- **Financial evidence**: the acceleration diagnostic requires an actual
  three-year benchmark (±0.05-year fiscal-calendar tolerance). Other disclosed
  CAGR windows remain available. Invalid full observation timestamps fail
  freshness checks; future/invalid IPO dates do not establish a recent listing.
  Preserve the existing written-calendar-day age basis and balance/runway parser.
- **Compatibility**: report 1.8.0 and payload 1.9.0 distinguish these conventions.
  Stored report bytes and the immutable audit baseline remain unchanged. The
  intended-delta group records DEMO's withheld acceleration and new gap; other
  manifest entries merely shift positions, confirmed by comparing their fields.
- **Credentials**: reject malformed fields consumed by v1 connection code before
  callbacks can rewrite them. Preserve unknown metadata, historical valid model
  identifiers and signed-out/expired registrations. No migration or silent reset.
  Clean acquired descriptors and owned locks on PID write/close failures;
  secondary cleanup errors must not replace the primary failure.
- **Disclosure**: judge metadata records actual shortening, not just an attempt.
  Show exact remaining excess while preserving protected content. Partially
  recorded historical metadata retains the known side and identifies the missing
  side. UI target provenance and catalyst/risk labels show only recorded evidence.
- **Deferred**: a reproduced stale-recovery race requires an atomic cross-process
  locking design; a stat/PID recheck alone cannot fix it. No cache decompression
  cap is imposed without evidence for a compatible serialized-payload limit.

## D-36 (UI selection 2026-10-03) Keep current default; offer Research workspace

- **Options**: replace the default with one of the two interactive concepts,
  retain only the current UI, or offer Research workspace as a saved option.
- **Choice**: the owner explicitly selected the current default plus Research
  workspace in Settings. Decision brief remains a demonstration.
- **Architecture**: store an enumerated, non-secret browser appearance cookie;
  read it for server rendering and update the selected presentation immediately.
  Keep financial data, analysis model/effort settings and credentials independent.
- **Risks and reversibility**: browser storage may be refused or cleared; show a
  save failure rather than claiming persistence. Cookie reads make app pages
  dynamic. Current remains the fallback and can be selected again. The workspace
  consumes the same report, retains missing-data disclosures and adds evidence
  context; print and downloadable report formats keep their existing rendering.
- **Disclosure**: Settings and privacy guidance identify browser-local storage.
  Verification and usability limitations belong in the current audit.

## D-35 (repository audit 2026-10-03) Preserve evidence at calculation and file boundaries

- **Choice**: count beta returns only between adjacent completed calendar months
  inside the five-year window; include reverse-DCF search endpoints as possible
  roots. Preserve missing FRED periods before applying calendar lags. Require
  adjacent annual balances for return-ratio averaging; otherwise disclose the
  existing single-period fallback. Keep the estimator, bounds and financial models.
- **Compatibility**: report 1.7.0 and payload 1.8.0 identify these conventions;
  legacy reports remain readable and their stored bytes remain unchanged.
- **Persistence**: latest-report bodies must agree with their row's issuer,
  including supported share-class aliases. Corrected exports create both output
  files exclusively, refuse existing destinations and clean only their own new
  files on a handled failure (best effort if the filesystem refuses cleanup).
  Choose a new output name to repeat an export.
- **Runtime**: retain received billing evidence on failed continuations and
  presumed settlement metadata; advance snapshots after reconciliation; decode
  streamed UTF-8 across chunk boundaries. No added provider request or paid API
  fallback. Full evidence and remaining limits are in the current audit.
- **Presentation**: narrative comparison preserves financial punctuation;
  reserved fixtures cannot imply EDGAR/XBRL success. Charts retain gaps and
  isolated points; failed watchlist operations remain visible and retryable.
- **Cleanup**: remove the unused direct `@eslint/eslintrc` declaration after
  checking source references and native flat-config use. ESLint still requires
  the same resolved version transitively. Only the comparison-lock metadata
  changes; historical source hashes and the financial baseline projection stay
  pinned. No user data, credentials, settings or compatibility readers are deleted.

## D-34 (financial correctness 2026-10-03) Match common ownership and financial operating models

- **Evidence**: a cached SCHW filing reported deposits and net interest income,
  but the broad capital-markets label selected the industrial route. Its FY2025
  income available to common was $8.417 billion and tangible common equity
  $23.478 billion. The prior extraction ignored common earnings, withholding
  ROTE while displaying tangible book value without deducting preferred stock.
- **Options**: special-case the ticker, infer industrial EBIT, retain broad
  industry labels unconditionally, or refine broad financial classifications
  using corroborated, recent SEC facts and align the ownership basis.
- **Choice**: corroborated deposit-funded evidence may refine broad financial
  labels. Explicit industry and insurance-broker SIC safeguards remain. Extract
  filed common earnings independently of total net income. Banks use annual
  tangible common equity and matching ROTE for excess-return valuation; insurers
  and mortgage REITs use common equity and common-equity returns. Payout uses
  common earnings. Unknown preferred adjustments withhold the return/model.
  Aggregate cash dividends cannot substitute for common dividends when preferred
  stock is outstanding; preferred earnings allocations are not cash payments.
  Industrial FCF, EV, debt/EBITDA, EBIT coverage and ROIC outputs are withheld
  before scoring and report payload construction; share/dilution data remain.
- **Integrity and disclosure**: EDGAR-derived statements checked against the
  same companyfacts source are identities, not independent verification. Mark
  those checks skipped with an information gap. EDGAR availability reflects
  positive filing evidence instead of an unrelated individual-feed gap. No
  identity, currency, split or missing-value safeguards are relaxed.
- **Compatibility**: new runs use explicitly dated common-equity assumptions;
  report spec 1.6.0 and payload 1.7.0 invalidate earlier calculation conventions;
  historical reports retain their original values. The nonfinancial DEMO audit
  fixture changes only EDGAR readiness and the ROTE/P-TBV explanatory text; its
  numerical values and preserved fixture bytes do not change.
- **Validation**: provider-free regression tests cover broad-label routing and
  broker safeguards, common earnings, preferred-adjusted book/return/payout,
  missing-common-income withholding, industrial suppression, currency gates
  and SEC identity status. Cached filings were inspected read-only; no live AI
  call was used to establish these financial calculations.

## D-33 (AI connections 2026-10-03) Explicit account allowance, no billing fallback

- **Options**: support only API keys; imitate private subscription endpoints;
  or use documented authorization paths and a shared injected pass contract.
- **Choice**: official ChatGPT public OAuth registration, PKCE and verified
  OIDC identity, with protected account records, serialized refresh and
  revocation. Gemini delegates authentication and inference to the official
  installed CLI, with an isolated home and tools disabled. Claude API remains
  available explicitly; no Claude subscription login is offered without the
  provider's required approval. No OpenRouter or hidden API fallback is added.
- **Boundaries**: connection routes require loopback and the existing browser
  origin guard. Tokens never cross into the UI, reports or logs. A run captures
  its connection and binds the provider/account/model to durable payload
  fingerprints. Existing deterministic calculations and verification are shared.
- **Lifecycle and CLI isolation**: pending sign-ins are cancelable before any
  storage wait. One live Metis process owns connections under the serialized
  store lock. Gemini 0.36.x runs without its wrapper relaunch; disconnect waits
  for exit before deleting its directory. An empty work `.env` stops ancestor
  discovery. The official CLI's post-admin MCP allowlist admits only a fresh
  unconfigured name; `--extensions none`, disabled skills/agents, and deny-tool
  policy prevent external capabilities. Local `admin` flags are deliberately
  not used: this CLI overwrites them during remote admin merging. The storage
  override isolates CLI state while preserving the real browser profile.
- **Usage**: subscription adapters cannot accept API keys. Their zero API cost
  does not claim zero subscription usage. Provider allowance/credit settings
  apply; Metis cannot read remaining quota or impose its API USD cap on it.
  Requests have deadlines and size limits. Subscription passes use only supplied
  evidence, with no extra web search. Effort controls remain Claude-specific.
- **Why**: implement supported multi-provider sign-in without treating OAuth as
  unlimited usage or turning a failed connection into a surprise API charge.
- **Validation limit**: offline regression cases cover callback state, identity
  validation, refresh/sign-out, origin guards, interrupted streams, account
  binding and API-key isolation. No live OAuth inference was run; provider
  eligibility, model access and quota must be established on the user's account.
- **References**: [ChatGPT registration](https://developers.openai.com/siwc/token-sharing-open-source/sign-in),
  [sessions](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions),
  [inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference),
  [Gemini ACP](https://geminicli.com/docs/cli/acp-mode/),
  [Gemini headless](https://geminicli.com/docs/cli/headless/), and
  [Claude developer authentication](https://code.claude.com/docs/en/agent-sdk/overview).

## D-32 (release tooling 2026-10-02) Remove the vulnerable lint glob dependency

- **Evidence**: the unchanged development-inclusive dependency audit identified
  [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) in
  `braces` through 3.0.3, with no published fixed version. The only installed
  path is Next's ESLint plugin, through `fast-glob` and `micromatch`.
- **Options**: wait for an upstream release; weaken the audit; substitute an
  apparently compatible glob package; or remove the dependency through an
  explicit, limited adapter. A direct `tinyglobby` alias was rejected after
  comparing literal, absolute and terminal-globstar directory results.
- **Choice**: a local adapter scoped to the pinned Next ESLint plugin supports
  its directory-only synchronous call for a tested subset of root patterns.
  Unsupported APIs, options and complex patterns throw actionable errors.
  The repository uses default project roots, and retains every existing lint
  rule. No vulnerable source is renamed or copied into the adapter.
  An explicit root development link, referenced by the scoped override,
  keeps `npm ci` resolution consistent across npm 10/11 and both CI hosts.
- **Why**: this removes the vulnerable dependency chain without downgrading
  the framework, claiming full glob compatibility, or suppressing the audit.
  Tests must exercise the real internal-link lint rule: an empty root match
  can otherwise silently disable its checks.
- **Compatibility and validation**: customized `settings.next.rootDir` values
  are limited to the adapter's documented subset. New Next plugin consumers
  or options require explicit review. Clean install, dependency shape, lint,
  security audit, and Linux/Windows tests remain release requirements. The
  lockfile provenance changes; financial fixture and baseline bytes do not.

---

## D-31 (release review 2026-10-02) Preserve period, currency and ownership evidence

- **Options**: retain plausible vendor fallbacks and exact-sounding labels, or
  apply the same evidence rules to history, TTM fallbacks and REIT adjustments
  that the current-period calculations already require.
- **Choice**: quarterly income and cash-flow history enter own-history bands
  only through `rowsInModelCurrency`; annual vendor ROE cannot stand in for TTM
  and the existing dated statement-derived fallback remains. Reconstructed
  FFO is always approximate until affiliate and ownership adjustments are
  reconciled; AFFO inherits that limit. Neither has a guaranteed error bound.
- **Operating-income basis**: operating margins, projection/scenario history,
  operating-return and capital adapters, and current/prior WACC coverage use
  reported operating income. Broader vendor EBIT may include non-operating
  gains and is not a substitute when operating income is missing. MSFT FY2026
  exposed the distinction: 155,237 / 331,839 gives 46.78%, whereas the vendor's
  168,985 EBIT incorrectly produced a 50.92% "operating" margin. Raw vendor
  statement fields and explicitly forensic EBIT formulas remain as reported.
- **Why**: independently reproduced mixed-currency historical bands, a stale
  annual ROE overriding the later statement basis, and Realty Income's issuer
  reconciliation contradicting the claimed FFO upper bound. These affect
  computed evidence and how a reader interprets it.
- **Disclosure and compatibility**: currency-break gaps identify excluded
  history; `valuation.reit.ffo.ownershipReconciliation` and
  `valuation.reit.affo.ffoBasis` state the approximation. Report spec 1.5.0 and
  payload 1.6.0 separate new reports and analyst passes from prior conventions;
  saved reports retain their original bytes. The DEMO audit projection moves
  only its spec stamp for this step; all existing finance hashes stay pinned.
- **Operational corrections**: CLIs load Next environment files before keys
  or database paths are read. Pricing maintenance parses named table columns
  and fails closed on malformed/incomplete data. No registry rates changed.
  The exact `@next/env` direct dependency changes the comparison lock blob,
  not the historical audited baseline or dependency resolutions.
- **Validation limit**: the authorized USD 2 live AI cap admitted two analyst
  passes (USD 0.253761 settled total) but correctly rejected the judge's larger
  reservation. This release does not describe that run as a completed live
  synthesis or weaken spend enforcement to make a smoke test pass.

---

## D-01 (WS1) Model registry as a checked-in JSON file

- **Options**: (a) keep the hard-coded `PRICING` map in `src/providers/anthropic.ts`; (b) a checked-in `config/models.json` plus a typed loader, refreshed by an explicit script; (c) fetch `GET /v1/models` at runtime.
- **Risks**: (a) drifts silently and cannot carry lifecycle or cache prices; (c) makes cost bounds depend on a live call and breaks offline tests; (b) can go stale, but staleness is visible (snapshot date) and the refresh is one command.
- **Choice**: (b). `config/models.json` with id, family, generation, context window, max output, effort support and levels, sampling support, prices (input, output, cache write 5-min/1-h, cache read), snapshot date, lifecycle. Loader `src/models/registry.ts`. `npm run models:refresh` rebuilds from `GET /v1/models` plus a pricing table checked against the pricing page; it is never run by tests and never by my session (paid/live call rule).
- **Why**: deterministic, offline, reviewable diffs, and the registry is the single source for request shaping, reservations and the README allow-list.
- **Disclosure**: report execution metadata carries the registry snapshot date.

## D-02 (WS1) Dated model IDs

- **Options**: (a) keep accepting `alias-YYYYMMDD` for every alias; (b) reject dated IDs for 4.6+ families, accept the dated Haiku 4.5 ID and its alias; (c) reject all dated IDs.
- **Risks**: (a) sends IDs that do not exist and 404s at the provider after a reservation was taken; (c) breaks the one real dated ID (`claude-haiku-4-5-20251001`); (b) needs a migration path for stored settings that hold a dated value.
- **Choice**: (b). Validation at settings write and at model resolution, with a message naming the accepted forms. A stored dated value for a 4.6+ family is treated as invalid at resolution: the run degrades to a data-only report with the reason named, exactly like any other rejected value today, and the settings page shows the message on load.
- **Why**: verified fact: from 4.6 onward the dateless ID is the pinned snapshot; dated variants do not exist.
- **Disclosure**: execution metadata adjustment `model-rejected` with the message; `tests/jobScheduler.test.ts:2527` is changed because it pinned the wrong behavior.

## D-03 (WS1) `auto` policy

- **Options**: (a) keep opus-5 → opus-4-8 → sonnet-5 → fable-5; (b) same order with `claude-fable-5-1` inserted before `claude-fable-5` at the end; (c) prefer Fable 5.1 first.
- **Risks**: (c) changes the default away from Opus 5 and multiplies cost by two; owner decision required. (b) keeps the documented default.
- **Choice**: (b). Order: `claude-opus-5`, `claude-opus-4-8`, `claude-sonnet-5`, `claude-fable-5-1`, `claude-fable-5`. Fable models are last because they are the most expensive and the policy already ranked Fable behind Sonnet 5.
- **Why**: the brief requires `auto` to include Fable 5.1 and forbids changing the Opus 5 default without the owner.

## D-04 (WS1) Cache multipliers from the registry

- **Choice**: per-model cache-write (1.25 × for the 5-minute `ephemeral` blocks the code sends; 2.0 × only if a 1-hour TTL is ever requested) and cache-read prices come from the registry. The flat `CACHE_READ_MULTIPLIER = 0.1` is retired.
- **Why**: Fable 5.1 cache read is $0.25/MTok (0.025 ×), not 0.1 ×.
- **Reversibility**: the registry can carry the old ratio per model.

## D-05 (WS1) `max_tokens` shaping

- **Options**: (a) keep 64k analyst / 96k judge constants; (b) at effort `high`, `xhigh`, `max` set `max_tokens` to the registry's max-output for the model, otherwise keep the pass constants (still bounded by the registry); (c) always registry max.
- **Risks**: (b) raises the per-request output cap and therefore the reservation at high+; (c) raises it for every effort.
- **Choice**: (b), bounded above by the registry max output in every case.
- **Why**: the brief; a higher effort is the case where truncation is most likely and most expensive to repair.
- **Disclosure**: the pricing table names the caps used per effort.

## D-06 (WS1) Haiku route

- **Choice**: analyst passes on `claude-haiku-4-5` never send effort (registry says unsupported) and ignore `ANALYSIS_EFFORT`; the judge floors to `claude-sonnet-5` and honors `ANALYSIS_EFFORT`. The `model-floor` disclosure names requested and effective models and says which effort applied to each pass.
- **Why**: brief; matches current behavior, adds the naming.

## D-07 (WS2) Lease expiry without settlement is presumed spent

- **Options**: (a) keep deleting expired `job_llm_leases` rows (reservation vanishes); (b) convert an expired unsettled reservation into a `cost_log` row of kind `presumed` at the reserved maximum, reconciled downward only from a later `usage` block or the Admin Usage & Cost API; (c) keep the lease row forever.
- **Risks**: (a) spend can be lost from the caps after a crash; (b) over-counts until reconciled, which is the safe direction; needs an additive schema column; (c) blocks capacity forever.
- **Choice**: (b). `cost_log` gains nullable `settlementKind` (`actual` | `presumed`) and `reconciledAt`. Additive migration; existing rows read as `actual`. Reconciliation from `usage` happens when the owning process reports late; Admin API reconciliation is a scheduler task that runs only when `ANTHROPIC_ADMIN_KEY` is set.
- **Why**: brief; caps must hold across crash and restart.
- **Disclosure**: report cost metadata and the manifest entry `cost.presumed` list presumed rows.

## D-08 (WS2) Lease invariants validated at startup

- **Choice**: fail fast at config parse when any of these fails: `THESIS_PAID_PASS_LEASE_SECONDS ≥ 2 × paid heartbeat` (heartbeat = TTL / 4, so this holds by construction and is asserted); `THESIS_JOB_LEASE_SECONDS ≥ THESIS_PAID_PASS_LEASE_SECONDS` (a job claim must outlive any single paid attempt's lease so that job reconciliation never precedes paid-lease expiry); `THESIS_PAID_PASS_LEASE_SECONDS > provider request timeout + idle margin`.
- **Why**: brief; today only the provider-timeout relation is pinned by a test.
- **Backward compat**: defaults (900/900) satisfy all three.

## D-09 (WS2) Streaming with idle timeout

- **Choice**: every paid pass streams (the 16k-token threshold is removed); an idle timeout (default 120 s without an event, `THESIS_STREAM_IDLE_SECONDS`) aborts the stream. A dead stream settles the usage reported so far plus the worst case for the remainder as `presumed` until reconciled.
- **Why**: brief; SDK requires streaming for long requests anyway.
- **Revised 2026-09-03** (CHANGELOG, *per-request admission restored, effort-aware idle guard*): the default is 300 s — undici's own body-timeout window, so the transport's ping-aware detection fires first — scaled by effort (×1 low/medium, ×2 high, ×3 xhigh, ×4 max) and bounded by the model stage deadline rather than by `ANTHROPIC_REQUEST_TIMEOUT_MS`. The SDK discards the provider's SSE pings before any listener runs, so the flat 120 s guard abandoned healthy passes mid-reasoning. Zero still disables it.

## D-10 (WS3) Per-request admission

- **Options**: (a) keep the 108 × per-pass reservation; (b) `maxRetries: 0`, own retry loop, each attempt reserved and settled separately, feature flag `THESIS_RESERVATION_MODE=request|pass` for one release.
- **Risks**: (b) more scheduler transactions per pass; retry timing moves into our loop (same delays as today); a request that times out after send is presumed spent until reconciled.
- **Choice**: (b), default `request`. Reserve `input_cap × input_price × cache_mult + output_cap × output_price + search_cap × 0.01`. Admission: `settled + live reservations + this request ≤ caps`; live exposure ≤ `THESIS_MAX_ACTIVE_LLM_CALLS × one request max`. Pass-level worst case is reported, not reserved.
- **Why**: brief; makes `THESIS_MAX_JOB_COST_USD=5` usable.
- **Reversibility**: `pass` mode keeps the old bound for one release.

## D-11 (WS4) Reserved fixture symbols

- **Options**: (a) keep DEMO/DBNK as fixtures only without a key and live symbols with one; (b) reserve `DEMO` and `DBNK`: always served from fixtures, never sent to FMP, EDGAR, Yahoo, FRED, Finnhub or FINRA, whatever the key state; (c) rename fixtures to an impossible ticker shape.
- **Risks**: (a) a fixture run makes SEC requests with a synthetic CIK and, with a key, sends the names to FMP; (c) breaks bookmarks and tests; (b) changes the with-key behavior the README documents.
- **Choice**: (b). A reserved-symbol list in one module; the data bundle short-circuits every provider for them and records `fixture.reserved` in the manifest. EDGAR filings for fixture symbols come from `fixtures/edgar` or are disclosed as absent.
- **Why**: brief ("no network request at all"; "cannot collide with real tickers"). Reservation makes collision impossible by construction.

## D-12 (WS4) `THESIS_STATEMENT_SOURCE`

- **Choice**: `auto` (default): FMP first; when FMP's plan truncates history, older periods are backfilled from EDGAR companyfacts with per-row `source: "edgar"` provenance and a manifest entry naming the depth served by each source. `fmp`: never backfill. `edgar`: EDGAR only, FMP statements ignored.
- **Why**: no statement row mixes fields from the two sources. Backfill is
  chosen independently for each statement family; different families for one
  fiscal period can still come from different providers.

## D-13 (WS4) Duplicate periods, restatements, short-term debt order

- **Choice**: duplicate-period rule: last-filed wins (max `filed`, then max accession); the superseded value is retained as `original` on the row; a `restatement` forensic flag fires when a material line (revenue, net income, total assets, equity, operating cash flow) moves by more than 1% of its prior value. Derived Q4 uses one filing lineage (the 10-K's FY fact minus that lineage's YTD facts) or discloses that it cannot. Short-term debt: `ShortTermBorrowings`, `CommercialPaper`, `DebtCurrent`, `LongTermDebtCurrent` resolved first (existing overlap rules kept); the maturity-schedule figure is used only when all four miss, and the note says it is current maturities only and may be annual-only.
- **Why**: brief; the overlap handling already in `resolveDebtOverlaps` stays.
- **Revised by D-134 (B13 OD-5 and OD-6, audit 2026-10-27 FIN-511 and FIN-511-V1)**: "one filing lineage" now means one presentation, filing-date lineage being the minimum. A derived quarter whose two operands sit on two presentations, or whose copy a material re-filing that labels no re-presentation superseded, is withheld naming both filings, and the quarterly trend's growth cells follow the same rule. See docs/METHODOLOGY.md "Derived quarters on one presentation (audit 2026-10-27 FIN-511)".

## D-14 (WS4) Successor registrants and offline fixtures

- **Choice**: when submissions show an 8-K12B and no annual report, resolve the predecessor CIK from a co-registrant list, pull its companyfacts, and emit rows tagged `predecessor` with the predecessor CIK in provenance. The test uses a hand-built fixture shaped like the SEC index for CIK 2115436, marked `synthetic-structure` in its header; recording the live payload is deferred to an owner-approved fetch.
- **Why**: the no-live-network rule applies to my session and to tests.
- **Revised 2026-09-03, after the owner approved the fetch**: the recorded payloads disprove the mechanism this decision assumed. ExxonMobil Holdings' own 8-K12B (0001193125-26-291990) carries a SINGLE filer block — itself — so reading that one filing resolved nothing for the issuer the feature was built for, and the hand-built fixture had encoded the shape the code expected rather than the shape SEC serves. The co-registration is on the filings the two entities made jointly afterwards: the 10-Q 0000034088-26-000093 and the POSASR 0001193125-26-292453 each name both CIKs. The 8-K12B is now the trigger only; `predecessorCandidates` ranks the headers worth reading (8-K12B, then periodic reports newest first, then filings carrying a co-registrant file number, employee-plan amendments last) and `resolvePredecessor` reads them in order, capped at four, until one names exactly one other party that has filed history of its own. Four recorded payloads are committed under `fixtures/edgar/xom_successor_*`; the synthetic fixture stays, now covering the branch where an 8-K12B does co-register.

## D-15 (WS4) Beta

- **Choice**: monthly total returns from dividend-adjusted closes (Yahoo `adjclose` when present, else disclosed as price-only); minimum 24 observations else withheld and disclosed; report OLS standard error and R²; Blume-adjusted shown beside raw; WACC keeps using the Blume beta as today.
- **Why**: brief.

## D-16 (WS5) Sector routing with XBRL evidence

- **Choice**: routing combines SIC/industry with tag evidence from companyfacts (deposits, loans, net interest income → bank; premiums, loss reserves → insurer; MBS/loan assets and no investment property → mortgage REIT; `RealEstateInvestmentPropertyNet` plus REIT status → equity REIT). SIC 6798 with no evidence routes to `reit` with sub-map `undetermined`, which withholds both FFO-based and book-value-based metrics with a reason. The routing note lists the evidence used.
- **Why**: brief; SIC 6798 covers both REIT types.

## D-17 (WS5) Financial-route metrics and forensics

- **Choice**: equity model value = book equity + Σ discounted (ROE − CoE) × prior book with ROE faded to CoE over the horizon; P/TBV vs ROTE; route metrics computed from statements where tags allow, withheld with reason otherwise. Piotroski on financial routes: ΔLEVER and ΔTURN withheld with reason; the score is reported over the remaining signals with its own denominator. Altman Z and Beneish M stay withheld on financial routes. Nothing is removed; every withheld metric carries a reason.
- **Why**: brief; removal would need an owner decision.

## D-18 (WS6) Growth anchor

- **Choice**: methods: log-linear regression slope over all available years, 3y and 5y CAGR, consensus-anchored growth when FMP estimates exist. Point estimate = median of available methods; range shown. Linear fade to terminal over the explicit 10-year horizon. "Lower of 3y/5y" retired. Sign-disagreement rule retired in favor of the regression slope, whose fit statistics are shown.
- **Why**: brief.

## D-19 (WS6) WACC disclosure, terminal rule, SBC, EV bridge, labels

- **Choice**: assumption block lists the FRED risk-free series and date, ERP source and date, cost-of-debt method, tax-rate choice, market-value weights; terminal growth ≤ rf by default (already `min(2.5, rf)`). Terminal ROIC rule kept and labeled "house convention"; ROIC-vs-WACC history uses each year's WACC when a FRED rf for that year is available, otherwise the note says the current WACC was used. FCF subtracts SBC by default; dilution from outstanding awards shown. EV bridge keeps debt, cash, NCI, preferred; operating lease liability is an off-by-default disclosed option (`THESIS_EV_INCLUDE_LEASES=1`) applied consistently to EV/EBITDA. `own5yPercentile` relabeled "rank among N quarters" in the schema label and UI. Disclaimer names grades and scenario targets.
- **Why**: brief.

## D-20 (WS7) Bull/bear order and judge inputs

- **Choice**: `THESIS_JUDGE_ORDER=random|bull-first|bear-first|both`, default `random`, seeded from the job id so it is reproducible and recorded in report metadata. `both` runs the judge twice with swapped order and reconciles (documented as twice the judge cost). Bull and bear are length-capped (registry-bounded output tokens plus a word cap in the prompt) and the judge is told both lengths. Analyst schema gains `case_strength` (1-5) and the judge may discount a weak side. Verify adds deterministic direction/period/unit checks and reports coverage and checked separately. Claims about named individuals are restricted to filings and transcripts. Metadata notes when judge and analysts share a model family.
- **Why**: brief; `random` is the cheaper default.
- **Revised 2026-09-06** (audit §8.15): the named-individual rule as enforced admits a filing, a transcript, a registry figure, or the payload's own key-executive and insider-trade rows as support; any other source, or none, fails the claim. The judge's copy of the leadership guidance says the judge pass has no web search.

## D-21 (WS8) CSRF, resume-on-start, settings reset

- **Choice**: keep the existing guard; add route-level tests for a cross-site form POST (navigate mode) and a cross-site fetch. When both Fetch Metadata and Origin are missing, require a token: minted at startup into `<data dir>/csrf-token` and accepted via `X-Thesis-Token`; browsers never need it. `THESIS_RESUME_ON_START` (default `1`); when `0`, bootstrap does not kick the scheduler and queued paid work waits for `POST /api/jobs/resume` or the Settings page. `npm run settings:reset -- --yes` deletes stored settings rows.
- **Why**: brief; token path only touches header-less clients.

## D-22 (WS9) Node requirement and generated docs

- **Choice**: `engines.node = ">=22.18.0"`; CI stays on 24 and the README says so. `npm run docs:config`, `docs:commands`, `docs:pricing` regenerate marked README sections; a doc-lint test compares the generated output to the checked-in README. `CHANGELOG.md` with migration notes.
- **Why**: brief; nothing in the harness needs 24.
- **Revised 2026-09-06** (audit §6): there is no `docs:commands` script and never was one wired; `npm run docs:config` regenerates both the configuration and the commands tables, `npm run docs:pricing` the cost table.

## D-23 (integration) The audited fixture comparison's delta contract

- **Options**: (a) regenerate `tests/fixtures/audit-baseline-stageb-report.json` against a new audited commit, retiring the link to 524d09e; (b) keep the baseline and extend the contract so it can express what the remediation did; (c) relax the comparison to ignore the two gap manifests.
- **Choice**: (b). `afterMissing` was added for a leaf the audited projection has and this one does not, without which a removed key or a shortened array cannot be expressed at all. The list moved to `tests/fixtures/audit-intended-deltas.json` and is grouped: every group names the decision records that caused it and carries a reason, and `npm run audit:deltas` refuses to classify a newly differing leaf on its own. A `manifestIdentity` block pins the two gap manifests by entry name as well as by position.
- **Why**: (a) throws away the evidence the comparison exists to provide, which is that this tree still computes what the audited commit computed apart from changes somebody wrote down. (c) is the failure mode the test was built to prevent. The remediation legitimately moves 709 leaves; without grouping and an identity view nobody would read them, and a contract nobody reads is a rubber stamp.
- **Risk**: the list is long enough that a real regression could hide inside a group. Mitigated by the identity view, by the per-group reason, and by the fresh-context review of each workstream's diff.
- **Also fixed**: dotted paths could not address an object key containing a dot (`asOfMap["edgar.cik"]`), reading as absent on both sides and slipping past the value checks. Keys now escape their dots and backslashes.

## D-24 (audit 2026-09-06) Evidence-weighted graded signals and forensic disclosures

- **Options**: (a) keep grading every signal at its full weight even when the number behind it was built on fewer tests than its scale implies (a Piotroski 6/8 graded as if it were 6/9); (b) drop a partially evidenced signal from the aspect entirely; (c) let a signal declare how much of its evidence base it actually has and scale both its contribution and its weight by that fraction.
- **Choice**: (c). `Signal.evidenceFraction` (default 1) multiplies the signal's weight in `scoreAspect`; the Piotroski signal passes `outOf / 9`, so a score reported out of eight enters quality at eight-ninths of its weight and the aspect's data completeness falls accordingly. The Beneish computation withholds itself below the house revenue floor instead of scoring a toy-sized issuer, states on the number when DEPI was built on combined depreciation and amortisation, and treats a missing equity-issuance flow as "not evaluable" rather than as "no issuance". The Altman driver is named `altmanZOriginalScale` because it is the original-scale Z that the quality band grades, not the route-selected variant. The two-year notes interpolate the true denominator and follow the tally they describe.
- **Why**: (a) lets a withheld test raise or lower a grade it never contributed to; (b) throws away seven or eight good tests because one was withheld. (c) keeps the evidence that exists at the weight the evidence supports, and the report can say so. The Altman driver rename and the Beneish disclosures are the finder findings F84, F86, F88, F92, F93, F96 and F101 of the 2026-09-06 audit; none changes a published number apart from the quality score's completeness weighting.
- **Disclosure**: the composite methodology sentence already prints the completeness percentage, so the effect is visible on every report; the audited-fixture delta group `forensics-and-grading-audit-2026-09-06` lists the fourteen leaves that moved.

## D-25 (audit 2026-09-06) One lease basis, one statement basis, one Blume constant

- **Options**: (a) leave invested capital and the WACC's debt leg on the provider's lease-inclusive `totalDebt` while the EV bridge removes the operating-lease slice; (b) capitalise operating leases everywhere and add the imputed lease interest back to operating income (Damodaran's full treatment); (c) remove the operating-lease slice from invested capital and from the debt behind the effective cost of debt and the E/D weights, where the balance sheet discloses it, on the same `THESIS_EV_INCLUDE_LEASES` switch the EV bridge uses.
- **Choice**: (c). Under ASC 842 NOPAT and interest expense are already after operating-lease cost, so a lease-inclusive denominator understated ROIC for every lease-heavy issuer and could push the effective rate below the acceptance band; (b) is a larger model change with an imputed figure in it, and (a) leaves the discount rate, the return on capital and the enterprise value on three different bases. The FMP route publishes no split and stays unadjusted, and the ROIC notes say so. Alongside: the interest expense and EBIT behind the coverage ratio come from ONE statement basis (TTM when both are available, else the annual statement for both legs; a mixed pair is the labelled last resort), the average debt behind a TTM interest figure is the pair of quarter-end balances at the TTM window's ends, and the Blume weighting is the single 2/3–1/3 constant pair `betaEstimate.ts` owns (the WACC carried a rounded 0.67/0.33 copy, so a keyless report printed two unequal adjusted betas).
- **Why**: the finder findings F103, F112, F114, F120, F122 and F123 of the 2026-09-06 audit; each is a numerator and a denominator measured on different bases and labelled as one. The rest of the same remediation (restatement collapse in the returns and capital series, tolerant statement joins, the ROTE zero-preferred rule, the beta partial-month rule, the net-debt conflict check, the EBITDA gate, the AFFO recurring-capex tag, the financial-route gap severities, the CAGR spacing tolerance) needed no new convention — each restores a rule the code already stated elsewhere.
- **Disclosure**: the WACC notes and disclosure block print the debt basis and the coverage basis; the ROIC notes print the lease basis and whether a split was disclosed; the audited-fixture delta group `returns-capital-audit-2026-09-06` lists the leaves the Blume constant moved (WACC 9.2559 → 9.2545 and every discount factor and sensitivity column with it).

## D-26 (audit 2026-09-06) One equity bridge for every DCF re-run, and the grid's terminal excess

- **Options**: (a) keep passing a separate net debt, share count, minority interest and preferred to the scenario-target and projection re-runs (the raw figures compute.ts holds) while valueCompany bridges the base per-share on net debt less the operating-lease liability; (b) apply the same lease subtraction in compute.ts before handing the figures over; (c) carry the bridge the base DCF actually used on the result itself (`DcfResult.bridge`) and have every re-run read it from there, removing the separate inputs.
- **Choice**: (c). A bridge that lives in two places drifts: the finder reproduced a published bull target below the base fair value for a lease-heavy issuer. With the bridge on the result, bull, base and bear cannot bridge on different net debt whatever compute.ts holds, and the projection fan shares it. Alongside: the sensitivity grid keeps the base case's terminal excess (terminal ROIC − WACC) fixed in every cell instead of the terminal ROIC's level, because the terminal-value house convention defines that ROIC relative to the WACC — at a fixed level a −1pp WACC row earned a phantom +1pp excess and the g-axis reversed sign across rows under the default rule; the EBIT-margin ceiling is 45% or the issuer's own five-year maximum, whichever is higher, so a broken-input guard never removes a third of a payments network's DCF; the REIT implied cap rate uses the house enterprise value; a DCF that values the equity below zero publishes 0 under limited liability with the reason; the own-history P/FFO band is withheld when the current FFO is a different construction from the history.
- **Why**: the finder findings F134, F135, F138, F141, F142, F143, F147, F148 and F150 of the 2026-09-06 audit; each is a definition used in two places with two meanings.
- **Disclosure**: `DcfResult.bridge` is persisted (a new leaf on the audited fixture), the grid note states the excess held, the margin clamp note says when the ceiling was raised and why, the REIT note prints the EV components, and the delta group `valuation-routing-audit-2026-09-06` lists the leaves that moved.

## D-27 (audit 2026-09-06) Report-facing text cites living documents or none

- **Options**: (a) keep the section numbers of the retired design documents (a specification, a data map, provider and API "contracts") that an earlier pass had reduced to generic phrases — "SPEC §6", "DATA_MAP §1.1", "the application contract §8" — in the 130+ comments and the twenty-odd notes, manifest reasons, prompt lines and error messages that carried them; (b) delete every such reference outright; (c) point each one at a heading that exists (docs/METHODOLOGY.md, docs/RESEARCH.md) where one does, and drop the dead number where none does, in comments and in report-facing text alike.
- **Choice**: (c). A report note that says "(house rule per SPEC §6)" sends a reader to a document that is not in the repository; the same rule is stated under METHODOLOGY "Financial-company routes", so the note says that. Where no living heading states the rule (the pre-revenue floor, the identity tolerance) the note keeps "house rule" and loses the citation. The analyst prompt loses "SPEC §1 rule #1" for "rule #1", the rule it already quotes verbatim.
- **Why**: the directive that every document be accurate to the code reaches the text the code emits; (a) leaves readers a citation nobody can follow and (b) throws away the pointer where a living one exists.
- **Disclosure**: the audited-fixture delta group `docs-references-audit-2026-09-06` lists the two Stage B notes that moved (the revenue-acceleration note and the sensitivity grid's guard note; no number changed); the payload pin in tests/stageC.payload.passes.test.ts moved by −46 prompt bytes and says why.

## D-28 (currency integrity 2026-09-30) An analyst estimate is money only in its own currency

- **Options**: (a) keep treating an estimate or price target as being in the listing currency whenever the listing and the statements share one; (b) take the listing currency, or the reporting currency, as the provider's convention; (c) establish an estimate's currency only from its own row (a `reportedCurrency` or `currency` field) or a documented provider convention, and otherwise leave it unknown in every consumer.
- **Choice**: (c), the product owner's decision. FMP's analyst-estimate and price-target rows carry no currency and FMP documents no convention; (a) is a guess that happens to look consistent, and (b) names a convention nobody documented. `src/pipeline/estimateCurrency.ts` holds the one rule and the empty `ANALYST_ESTIMATE_PROVIDER_CONVENTION` where a documented convention would go.
- **Why**: an estimate labelled "currency unknown" and kept out of the numeric evidence registry still moved the valuation, because the DCF growth anchor's analyst-consensus case divides FY1 estimated revenue by statement revenue. The rule now governs that calculation, the AI context payload, its registry and so verification alike: the analyst-consensus case is used only when the estimates' own currency is the model's.
- **Disclosure**: `valuation.analystEstimates.currency` says why the case was not used; the payload renders such estimates as "(currency unknown)" and registers none of them. The audited-fixture delta group `analyst-estimate-currency-2026-09-30` lists the DEMO leaves that moved (DEMO's estimate rows carry no currency, like FMP's); the payload pin in tests/stageC.payload.passes.test.ts says why its values moved.

## D-29 (currency integrity 2026-09-30) Combine statements or years only in one established currency, and stamp the change

- **Options**: (a) combine any rows (income with balance sheet or cash flow, one year with another) and label the result in the income statement's currency; (b) convert with an exchange rate; (c) combine only rows whose currency is established (own label or a statement of the same filing) as the model currency, and withhold what depends on the rest.
- **Choice**: (c). `rowsInModelCurrency` in src/pipeline/compute.ts gives every calculation that combines rows the history back to the first row that is not established in the model currency; margins, which never leave one row, keep every year. The data-only report states each year's cash-flow figures in that row's own currency and never across a break. `REPORT_SPEC_VERSION` moves to 1.3.0 and `PAYLOAD_VERSION` to 1.4.0 so a stored report or cached payload from before the change is never read as like-for-like.
- **Why**: (a) produced a 5% cost of debt from 15 USD of interest over 300 JPY of debt, and ROIC, net debt and the DCF on the same mix; (b) invents a rate the product does not source; missing evidence establishing compatibility would be (a) again.
- **Disclosure**: each break is a `compute.<family>.currency` manifest entry naming the row and its currency state. Saved 1.2.0 reports are read and rendered as stored; the history diff reports `spec-version-mismatch` against 1.3.0. The DEMO fixtures label every row USD, so the audited fixture comparison moved only for D-28.

## D-52 (research reliability 2026-10-13) Comparable evidence and coherent scenarios before new scoring rules

- **Choice**: preserve valuation/scoring formulas while adding screened, bounded peer collection; deterministic scenario assumptions and uncalibrated display weights; grid-derived sensitivity conclusions; and sourced, conditional thesis review triggers. Keep AI commentary separate from computed inputs. Align operating path labels with available value-ordered targets without changing the base or weighted path.
- **Evidence gates**: peer issuer identity, currency, filing availability, recency and denominator definitions must agree. Market-cap/common-earnings comparisons remain separate from price/weighted-EPS ratios. Thin or incompatible evidence produces explicit exclusions rather than a median. Display weights and sensitivity grids are not calibrated probabilities or future-price intervals.
- **Evaluation**: D-51 infrastructure freezes explicit comparison definitions and report content before outcomes where possible; retrospective registrations are labeled. Date, identity and accounting-basis compatibility are required for operating errors. Realized benchmark-relative returns do not measure the accuracy of today's intrinsic-value estimate. See REPORT-EVALUATION.md and RESEARCH.md.
- **Validation contract**: the `research-reliability-2026-10-13` audited delta group covers new fields, version stamps and evidence notes. Existing numeric grading and intrinsic-value results stay pinned. New risk-bearing modules carry the existing coverage floors; app, Markdown and print share review wording. Prospective predictive accuracy still requires matured observations.
- **Review correction**: a degenerate-dispersion case previously zeroed the targets' margin shock while the projection fan retained it. Both now use the target's existing rule. This can change affected perturbed/weighted operating paths, with a disclosure; it leaves the base DCF and targets unchanged. Explicit model-window dates also prevent comparing rolling annual forecasts with unrelated fiscal years.
- **Security gate**: the required audit identified vulnerable Next.js 16.3.6 and source-map-js 1.2.1 dependencies. Next/env/ESLint are pinned to the patched 16.3.8 family and source-map-js to 1.2.2. The [Next advisory](https://github.com/advisories/GHSA-f87g-xv8r-7p7x) and [source-map-js advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) identify those patched versions. Regenerating the financial comparison after the update produced no additional deltas; only its comparison-lock pin moved.

## D-30 (stock-split correctness 2026-09-30) One share basis per price, from the vendor's first split-adjusted session, or no figure

- **Options**: (a) apply every tagged split to every share count filed before its XBRL context date; (b) the same, but only for splits dated on or before the analysis date (the first cut of this batch, commit 7f73608); (c) fix each split's timing from the price vendor's own split event, reconcile the vendor's list with the filer's tags, put every share count and per-share figure on the share basis of the price it meets, and withhold what cannot be put there — at the source, so nothing downstream rebuilds it.
- **Choice**: (c). The XBRL context date is accounting context: NVIDIA tagged its 10-for-1 of 2024 for both 2024-06-07 (legally effective 4:01 p.m. Eastern) and 2024-06-10 (the first split-adjusted session). `discoverStockSplits(facts, { asOf, vendor })` in src/edgar/splits.ts takes the first split-adjusted session from Yahoo's split events (`src/providers/splitEvents.ts`; the full list, the daily history's and the quote's), applies a split both sources describe once, applies a split only the vendor lists, and leaves unresolved a tag the vendor's covering list contradicts, and vendor descriptions of one split (events within 7 days) that disagree; they are never compounded. Coverage is exact: a day no retrieved answer spans is uncovered, and a Yahoo event with an invalid ratio makes that answer's list unavailable. Without a vendor event the first session is bounded (7 days before to 60 days after the context dates); legal effectiveness is bounded below by the earliest context date and by the first session less 7 days. A figure whose side of a split falls inside a bound is withheld. A vendor list that was not retrieved, or does not cover the span from a count's filing to the price's session, establishes nothing: the count is withheld. The statements put every share and per-share fact on the basis of the quote's session; the keyless market values put each series count on the basis of the price it meets; a vendor income row for a period before a known split keeps each EPS and share-count field only when that field matches the filer's own on that basis (a matching diluted count vouches for nothing else) (FMP's FAQ documents split-adjusted prices and shares outstanding, not the income statement's per-share fields); the mortgage-REIT book value per share reads its raw period-end count only through the same resolution.
- **Why**: (a) turned a 4-for-1 announced for 2027-01-15 into a 40M share count on 2026-09-30 while the market still priced 10M shares at $100 ($4B for a $1B company). (b) still applied a board approval tagged before the first split-adjusted session ($4B again) and ignored a split the market had priced but companyfacts did not yet carry ($250M). A warning beside either number leaves the number in every multiple, grade and AI input.
- **2026-10-02 review corrections**: merged vendor lists retain each original answer's source, events and coverage, including through nested merges. An event omitted by another answer covering its session is disputed regardless of date distance; disagreements name both sources. Non-overlapping or unavailable answers cannot contradict it. Vendor EPS uses the same 3% relative comparison as share counts, with exact agreement at zero and no absolute one-cent allowance: a fourfold error in a small EPS is still a split-basis error. Legitimate rounding beyond the relative tolerance leaves the field withheld because its basis is unestablished.
- **Disclosure**: each split is a `keyless.stockSplits(<date>)` entry naming its context dates, first filing, first split-adjusted session and source (`info`), or why it was not applied (`warn`). Withheld figures are `warn` entries: `keyless.statements.shareBasis`, `keyless.incomeAnnual.shareBasis` / `keyless.incomeQuarterly.shareBasis`, `keyless.profile.marketCap`, `keyless.quote.marketCap`, `keyless.marketCapHistory.shareBasis`, `keyless.enterpriseValues.shareBasis`, `keyless.sharesFloat.publicFloat`, `keyless.sharesFloat`. `REPORT_SPEC_VERSION` moves to 1.4.0 and `PAYLOAD_VERSION` to 1.5.0, so a report or a stored analyst pass computed under the earlier split rules is never read as like-for-like. The provider conventions, and which of them is documented rather than tested, are tabled in docs/METHODOLOGY.md, "Stock splits and the share basis". The DEMO fixtures carry no split: the audited fixture comparison moves only the spec-version leaf.


## D-74 Principal-summary scope and immutable presentation corrections (2026-10-16)

- **Problem**: CoreWeave's September 22, 2026 Item 1.01 states $4.2 billion of notes including a $500 million purchasers' option. Summing both mentions produced a false $4.7 billion annotation in a deterministic event summary. The analysts received raw issuer text and correctly described $4.2 billion.
- **Choice**: admit a computed principal sum only for one affirmative completed offering/issuance sentence listing distinct coupon/maturity note tranches. Every principal mention in the retained section must be accounted for; duplicated, overlapping, conditional, option, negated, exchange, repurchase, redemption and unmatched currency/amount contexts withhold the sum. The label states its scope to the listed named issuance tranches. The actual retained 3,047-character NVIDIA Item 8.01 remains an admitted seven-tranche $25 billion control. This is bounded grammar, not general financing interpretation; unsupported wording retains issuer text without a computed sum.
- **Preservation**: re-derive only exact legacy-marker cached summaries immutably from retained raw section text; when raw text is unavailable, withhold only the annotation. Preserve unaffected cached summaries, whose selected full-source sentences may extend beyond the retained text boundary. Shared read/render/export safety strips only the exact legacy generated annotation, leaving analyst prose intact. Output-only correction metadata and an expected informational appendix/process disclosure explain the deterministic correction and that no analyst or judge rerun occurred. Original stored reports, source snapshots, usage, financial values, grades, weights and analysis conventions remain unchanged. Corrected CLI exports reserve new files exclusively and emit original/corrected hashes and before/after text in a sidecar.
- **Payload evidence**: the frozen CRWV snapshot's actual serialized analyst input remains byte-identical: fingerprint `1.24.2:71b55ac7`, 246,293 characters, SHA-256 `97d0bd69f426816622882ddd29fffe6879ea2b8313ebb1308bedc1a62a2b84a5`. Correction notices do not enter disclosure notes consumed by the prompt. Payload 1.24.2 and the Stage B convention remain unchanged; new reports use report 1.19.3, while presentation copies preserve their original report stamp. The audited fixture delta permits only the report-spec stamp; all financial leaves remain pinned.
- **Final review correction**: a completed-offering suffix governed by a counterfactual modal, prior expectation, hypothetical transaction or planning/assumption prefix is not affirmative completion evidence. Contracted negative prefixes ending in straight or curly `n't` also withhold the sum. True completed-offering and retained NVIDIA controls remain admitted. This narrows the documented admission contract without changing payload, financial, scoring or version conventions.
- **Validation limits**: focused source, negative-scope, immutability, completeness, export and exact-input checks establish deterministic behavior, not forecast accuracy. Full validation results are recorded with the release evidence.

## D-75 Preceding table scales and corrected deterministic verification (2026-10-16)

- **Problem**: CRWV's retained June 30, 2026 liquidity table declares `(in millions)` immediately before its date columns. The verifier recognized scales only after the header and falsely contradicted the unchanged source amount of $15,553 million and its rounded $15.55 billion expression.
- **Choice**: bind a plain scale declaration only through a bounded adjacent chain of parentheticals immediately preceding explicit date columns, or through the existing header-to-row context. Intervening prose or another table breaks the preceding binding. Conflicting scales, unsupported unit/currency qualifiers and differently scaled candidate tables remain unchecked rather than choosing a convenient declaration. Genuine wrong amount, scale, currency, date and column controls remain rejected. Source spans retain their original offsets.
- **Exact correction**: provider-free replay changes only `balanceSheet.coverage.numbers[2]` and `balanceSheet.coverage.commentary[2]` in the original CRWV verification log. Both numeric supports become validated; the commentary remains `numeric-only`, without claiming semantic validation of qualitative assertions. Original report, snapshot and computed-file hashes remain unchanged. The original analyst payload retains fingerprint `1.24.2:71b55ac7` and SHA-256 `97d0bd69f426816622882ddd29fffe6879ea2b8313ebb1308bedc1a62a2b84a5`.
- **Preservation and versions**: this is a deterministic output correction with no paid analyst or judge rerun. Original stored reports, model strings, usage and analysis conventions remain preserved. Corrected verification exports retain their original report 1.19.2 convention; they must not be reassembled or relabeled as new analyses. New reports share report 1.19.3 with D-74; payload 1.24.2 and Stage B `STAGE_B_2026_10_DEBT_COMPLETENESS_1` remain unchanged. D-74's audited fixture delta still permits only the report-spec stamp; financial leaves, grades and weights remain pinned.
- **Limits**: the preceding-scale admission is deliberately narrow. Tests and frozen-source replay establish supported numeric matching and preservation, not forecast accuracy or calibrated grades. Combined local and remote verification evidence is recorded separately from the original analyses.

## D-76 Explicit dividend unit pairs and source-preserving verification (2026-10-16)

- **Problem**: a retained earnings-release clause states a cash-dividend total followed by its per-share restatement: `$973 million, or $0.92 per share, of cash dividends paid`. The source metric-label boundary stopped at the next quantity, hiding the trailing dividend metric from the total. The verifier bound the total claim to the nearby per-share amount and reported a false unit contradiction.
- **Choice**: recognize only an adjacent printed currency total, `, or` a printed currency-per-share amount, and the exact shared trailing metric `, of cash dividends paid`, within one source clause and in the same printed currency/symbol. Share that metric with the total while retaining each quantity's unit, value, precision, source offsets and period. Unit disambiguation applies only when every metric/period candidate belongs to that exact proved pair. Another candidate retains ambiguity; a matching claim value never selects a source amount. Unknown currencies, wrong units, amounts, periods, dates and unsupported appositives keep their existing conservative checks.
- **Frozen evidence**: whole-report offline comparison corrects only the intended dividend verification entry. Its factual support remains numeric-only; the previously unchecked numeric entries are unchanged. The other frozen report retains only its already reviewed D-75 corrections. Both original analyst payload fingerprints and serialized hashes remain unchanged. Original reports, source inputs and usage records are preserved; no provider or model calls are made.
- **Output evidence**: internally derived historical EV is admitted against compatible same-date carrying-debt evidence, with unusable/conflicting operands withheld and an explicit reason; no substitute EV is inferred. Known stored derivations can be refused immutably when same-date verified debt disproves the operand. Different dates/currencies do not establish a contradiction. True provider values retain their source definition. Retained EDGAR sources with an unavailable requested member render as partial coverage, preserving recorded gap counts, XBRL state and provisional forensics. The audited DEMO fixture adds only `report.marketData.enterpriseValueOrigin: provider` within its existing market-data object, plus the report-spec stamp; every numeric leaf remains unchanged.
- **Versions and limits**: new reports use report 1.19.4. Payload 1.24.2, the Stage B convention, financial formulas, grades and weights remain unchanged. Corrected copies retain their original report convention and are not reassembled or represented as new analyses. This bounded numeric-source repair does not establish semantic validation of qualitative claims, forecast accuracy or calibrated grades. Final combined local and remote gates are recorded separately.
- **Compact view follow-up**: PR review found that the report-ready panel lacked the retained-source identity used by other report surfaces. The compact endpoint now sends only provider/endpoint pairs; its client decoder validates these pairs and passes them to the same completeness rule. Older responses without this field remain supported without inferring retained evidence; unavailable report content keeps unknown completeness. Stored completeness, gaps and reports are unchanged. Handler-to-panel regressions preserve partial/missing distinctions, unknown-content handling and persisted bytes. This completes the same output contract without changing report, payload or computation versions. Independent review cleared the compact fix; its fresh final local gate and required CI are separate from the prior counts below. Final outcomes are recorded in PR #25 and the local release manifest, pending at this documentation freeze.
- **Validation**: combined source `eaefea32` passed the full local `npm run verify` gate, exit 0: 6,447 product tests (three existing skips), four database integration tests, core coverage 96.33/90.21/98.23/97.56% and risk coverage 94.85/88.16/97.58/97.05% (statements/branches/functions/lines), production build and zero-vulnerability security audit. Independent combined proof/export review cleared the intended path changes and original-input preservation. Exact actual-context and whole-report proofs plus the gate log are retained locally under exclusive D-76 filenames. Fresh required remote CI is pending.

## D-77 Saved research navigation and provider quota cooldown (2026-10-16)

- **Problem**: opening a ticker rebuilt its live acquisition/computation tree before showing an existing report. Historical views also awaited provider-backed watchlist enrichment. Missing cached responses and quota failures could therefore cause repeated external requests during routine navigation, while compact `n/a` grades did not explain their evidence floor.
- **Choice**: read usable saved reports before constructing live analysis. The explicit `?view=live` navigation starts the existing pipeline and is not prefetched. New tickers without a readable saved report retain the existing live flow. Historical/report navigation uses a read-only watchlist cache bridge with no loader, refresh, eviction or write; provider schema, identity and acquisition-time admission remain in effect, including the hard stale ceiling. Quotes expose their measurement date and stale state; grade labels explain the unchanged 50% weighted-evidence floor.
- **Quota boundary**: only FMP HTTP 429 or anchored explicit quota error phrases establish a separate credential/base-URL-scoped process-local cooldown. Retry-After is honored within one second to fifteen minutes, with a fifteen-minute fallback. FMP does not retry an observed 429; queued attempts recheck the cooldown after limiter waits. Generic provider retry defaults and explicit endpoint/symbol subscription restrictions remain separate. Successful cached responses bypass the live-request gate; quota failures never become financial cache data or expose arbitrary provider error text.
- **Preservation and validation**: no model calls, grade/formula/weight changes, convention changes, or rewrites of saved reports. Deterministic regressions prove zero provider work on saved navigation and watchlist cache failures, immutable stored reports/cache rows, conservative stale/source admission, explicit live navigation and credential-isolated cooldown behavior. Independent review, full local verification, production smoke evidence and required full/Windows CI are recorded in the release PR and local manifest.

## D-78 EXPE ownership scope, freshness and source fallback (2026-10-17)

- **Decision:** use consolidated equity for consolidated operating returns, preserve signed parent/NCI earnings and prevent equity-method plugs for known ownership gaps. Explicit total equity is authoritative, including zero and negative totals. Distinguish current/noncurrent lease completeness and the exact CFS SBC-addback sensitivity.
- **Economic claims:** retain dated, sourced all-class evidence and explicit unquoted-class proxies; unresolved known classes suppress aggregate equity-dependent metrics, including WACC, intrinsic per-share values and original Altman market equity. Book NCI remains a labeled proxy, never a silently corrected market value. Unknown nonoperating holdings remain unresolved.
- **Research integrity:** stale margin eligibility reduces coverage; comparative historical growth windows remain context rather than invented normalized forecasts. Preserve composite arithmetic. Primary fallback retains actual form/exhibit/accession and bounded omitted-event disclosures. Unknown risk likelihood remains unknown, unused scenario priors disappear, and single-order shared-model adjudication disclaims independent factual/order validation.
- **Reviewed fixture deltas:** `expe-ownership-and-evidence` in the exact delta contract initially contained 30 reviewed changed leaves (24 retained here after overlapping version/disclosure leaves moved into D-79): capital/SBC/accrual/ownership definitions, growth operands and contextual notes, source-fact metadata, unused-prior wording and version stamps. The ordinary no-NCI fixture's underlying financial values and composite formula are preserved. Source/notes changes are not wholesale golden-output acceptance. Page-one values use the admitted capitalization and EV; raw provider counts and capitalization retain explicit unverified-scope labels.
- **Limits:** see `2026-10-17-expe-issue-disposition.md` for all 35 findings and unfinished issuer research. These choices do not certify market NCI, normalized EPS/FCF, comprehensive guidance/events/governance/legal coverage, calibrated scores or error-free future reports. Exact final checks, independent review and controlled-run evidence are recorded separately.

## D-79 EXPE follow-up source admission and refusal integrity (2026-10-17)

- **Ownership and dates:** prevent current consolidated-only equity and restricted-cash refusals from falling back to older complete balances. Treat signed negative NCI as outside ownership when earnings scope is unknown. Class inventories require actual outstanding units, complete cover coverage, current dividend/liquidation rights, issuer/document identity and filing availability. Contradictory, conditional, fragmented or competing unresolved disclosures fail closed. Independent class prices share the admitted primary quote day; retrieval dates never supply price observation. Historical all-class numerators require their own dated price, currency and then-available inventory; current counts are never applied backwards.
- **Primary evidence:** reuse already-fetched annual/interim primary documents for class and geographic evidence. Geography retains its disclosed allocation definition and exceptions. Match segment reported adjusted EBITDA with the same segment, period, units and revenue. Retain prior/current guidance, percentage-point changes, issuer EPS and FCF bridges separately from model forecasts. SBC expense and capitalization remain non-additive without the missing amortization allocation; working-capital components remain an explicitly partial subtotal. Current officer terms and bounded official statements carry their source identity and limits.
- **Sensitivity:** longest retained growth is historical context; factor-neutral contribution diagnostics neither reweight nor regrade the model. A quarter's revenue outlook does not by itself establish an annual management forecast. An annual-guidance comparability guard is a disclosed model-admission policy, not an accounting fact or substitute NTM forecast.
- **Versions and reviewed fixture changes:** report 1.21.0, payload 1.26.0, Stage B `STAGE_B_2026_10_OWNERSHIP_FRESHNESS_2`; score weights and composite arithmetic stay unchanged. The `expe-primary-evidence-followup` delta group records the exact changed leaves: version, actual/unknown observation-date metadata, longest-history operands/context, P/book qualification, quarterly-guidance extrapolation wording, entity/per-share availability and conditional disclaimer. At commit `2260719` the group has 17 leaves (16 after its version leaf moves to D-80); the seven final reclassifications alter disclosure/date metadata only, including those descriptions inside unchanged quality-signal arrays. Existing ordinary-fixture financial values remain pinned. The Stage C synthetic quote timestamp was corrected from 2025 to its explicitly intended 2026 date; dedicated mismatched/unknown-date tests retain the refusal behavior instead of hiding it in that fixture.
- **Rendered-output review:** withhold unprovenanced legacy SEC operating-expense subtotals; preserve partial lease maturity and bridge labels; disclose raw/applied sales-to-capital policy transformations; withhold parent-common P/FCF when NCI cash attribution is unknown. Entity paths, per-share targets and analyst narratives have distinct availability text. Undisclosed outside claims state the zero modeling assumption; conditional disclaimers and geography basis stay with their actual outputs.
- **Verification status:** final-head testing and whole-branch independent review are recorded in the remediation plan. Initial commit `5cd330e` checks do not certify later source changes. Frozen-input and bounded source-enriched diagnostics are distinct from completed analyst research. The 35-item disposition retains unresolved evidence, calibration, normalization and methodology limits.

## D-80 EXPE adversarial source scope and numerical lease admission (2026-10-17)

- **Problem:** targeted review after D-79 reproduced historical/superseded rights admitted as current economics, untagged outstanding classes omitted from a complete inventory, segment geography promoted to consolidated geography, and known incomplete lease debt still entering numerical consumers despite partial display labels. A subsequent model-output review also distinguished officer agreement dates from announcements and required explicit per-share scenario headings and registry-bound geography provenance.
- **Decision:** source admission must establish the relevant economic and entity scope, rather than merely matching numbers or prose. Unsupported class-rights assertions and incomplete class rows remain ambiguity. Geography requires SEC issuer identity, compatible annual durations, geographic-only detail and a dimension-free company total; narrower business scope is unavailable as company geography. A source URL does not establish verification: exact payload identity/value/unit/currency/period/date matching precedes the normal verifier.
- **Lease convention:** incomplete finance coverage cannot support financing-debt outputs. An operating-inclusive policy also needs complete operating leases. The default operating-excluded policy can preserve a disclosed partial operating portion only when compatible, complete financing components prove the same embedded amount cancels once. Unsupported current/long-term or cross-filing assumptions must not restore EV, WACC, capital returns, reinvestment or DCF. This is a scope guard, not a new financing convention or a forced valuation.
- **Presentation:** agreement, public announcement, filing and specified effective dates are separate. An elapsed specified date does not establish completion. Entity forecasts and per-share target availability remain distinct across reader and export surfaces. Historical reports and model output stay immutable; separately reviewed corrections cannot be relabeled as a fresh analyst run.
- **Versions:** new reports use 1.22.0, payload 1.27.0, Stage B `STAGE_B_2026_10_OWNERSHIP_FRESHNESS_3`, pipeline `stage-c-1.1.3`. Earlier payloads cannot resume under these meanings. Score bands, weights and composite arithmetic are unchanged. The exact fixture delta reclassifies only `report.meta.specVersion` into `expe-adversarial-admission-review`; all 1,180 assertions and ordinary-fixture financial/disclosure leaves remain pinned. The Stage C complete-debt fixture changes only its payload version/fingerprint, retaining prompt byte count, all registry hashes and its finance hash. Final verification is recorded separately; preceding checkpoint passes do not certify later edits.
- **Limits:** parsers deliberately withhold unfamiliar or ambiguous layouts. Actual retained filing checks and negative synthetic regressions support these bounded routes, not universal source coverage, calibrated economic values or error-free prose. The 35-item disposition retains unfinished research and model work.

## D-81 Complete evidence passages and report basis propagation (2026-10-17)

- **Problem:** the subsequent bounded review of `c5d600c` found that adjacent applicability sentences and classless references could be discarded from rights evidence, and a second geography sentence or an exception could narrow the underlying revenue population. A completed controlled report also exposed unused projection priors, an incorrect dimensionless MACD unit and lost per-multiple limitations.
- **Decision:** admission uses a bounded complete local passage, including governing qualifications before and after the selected assertion. Unknown, conflicting, historical, conditional or prospective context remains unresolved; finding a favorable sentence does not override it. Geographic allocation exceptions require supported location-allocation grammar; a population exclusion cannot disappear after an exception marker. Duplicate XBRL context identities are ambiguous and cannot overwrite established scope. These are conservative source-admission rules, not universal natural-language interpretation.
- **Output integrity:** deterministic per-multiple bases are optional legacy-compatible report fields, copied from Stage B and excluded from the judge's requested fields. They accompany the numerical row in the reader and exports. Empty projection series do not advertise an unused horizon or weights. Neither change alters multiple values or scenario calculations.
- **Units and judgments:** RSI remains dimensionless. MACD is a difference of price moving averages and their signal, retaining the admitted price currency/share; unknown currency withholds the numeric quotation rather than inventing USD or index units. The numeric technical algorithm is unchanged. See [Fidelity's MACD calculation](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/macd); retaining price units follows by dimensional arithmetic. Observed expenses or margin pressure alone do not establish the likelihood of a future adverse outcome; the prompt requires a distinct forward-likelihood basis or unknown probability.
- **Resume and provenance:** report `1.23.0`, payload `1.28.0`, Stage B `STAGE_B_2026_10_OWNERSHIP_FRESHNESS_4`, pipeline `stage-c-1.1.4`. The implementation stamp rejects older input-snapshot replay; payload version/fingerprint rejects reusable earlier analyst/judge artifacts. These guards do not revoke already completed verified artifacts or rewrite historical reports. Rendering-only replays retain the original analyst-generation boundary. Changed prompts or admitted evidence must not be labeled equivalent merely because core financial numbers are unchanged.
- **Verification boundary:** c5's completed analyst run and passing CI are retained before-change evidence. Its report review identified three output findings and separately recorded two source P1 holds. Final checks and their exact source/report boundary are recorded in the remediation plan and PR; a preceding checkpoint is not clearance of subsequent edits. Unfinished issuer research and calibration remain explicitly open in the 35-item disposition.

## D-82 Explicit ISO-duration claim verification (2026-10-17)

- **Problem:** the completed controlled `9f75f61` report correctly states the H1 receivables cash-flow contribution, but the deterministic checker flags its start date against a registry period containing only the endpoint. The pipeline-owned metric label already carries the complete sourced interval. The raw report, flag and original counts remain immutable before-change evidence.
- **Decision:** a complete, valid, ordered ISO interval is admitted only from a terminal `, START to END` numeric-record label, with `period == END`, an identical ordered interval in the whole claim, exactly those two source/claim period references, and no conflicting supplied duration or fiscal metadata. Extra dates after a clause boundary cannot disappear. Missing, reversed, invalid or conflicting proof never grants the new start-date allowance. Metric, unit, sign, value, source and as-of admission remain separate. The global period parser and existing excerpt/fiscal/TTM rules are unchanged. Existing endpoint-only or undated claim behavior is retained; an unsupported explicit interval with no period stays unchecked rather than validated.
- **Version and replay boundary:** newly compiled reports use `1.23.1`, pipeline `stage-c-1.1.5`; payload `1.28.0` and Stage B implementation 4 stay unchanged. The ordinary model-input golden and financial numeric leaves are not repinned. The report-spec patch mechanically changes the exact input-snapshot version map; it does not establish new financial inputs or revoke already completed historical reports. The original model ran at `9f75f61` with report `1.23.0` / pipeline `stage-c-1.1.4`. A separately labeled deterministic replay records the new verifier identity while preserving those generation stamps and every financial/narrative field; it is not a fresh analyst run.
- **Verification:** synthetic duration/metadata and normal source/as-of refusal controls accompany the fix. The diagnostic replay invokes the normal verification core and reproduces the historical verifier's complete log/counts before comparing the new verifier. Recorded payload fingerprint plus deterministic reconstruction supports equivalence; literal generation-time serialized payload bytes were not separately retained and are not claimed directly compared. Final full gates, committed-head CI and independent replay review remain separate evidence. Counts and human source reconciliation are not factual-accuracy percentages or an institutional-completeness guarantee.
- **Extended by D-128 (B1 OD-2, audit 2026-10-27 AI-302):** the interval proof also decides a trailing window's start date in a claim: the start agrees with a window record only inside the complete stated interval, and a lone date names the window's end. See the entry "The claim verifier compares the periods, windows, comparison bases and recency a claim states".
## D-51 META report accuracy, evidence and evaluation (2026-10-14)

- **Problem**: the META report audit exposed truncated material filing evidence, citation presence presented as validation, inconsistent forward/reverse growth paths and fiscal labels, lagged capital metrics, opaque financial bridges and unfunded share shrinkage. Unvalidated house-rule grades also lacked reproducible inputs and an honest outcome-evaluation contract.
- **Choice**: retain bounded section-aware evidence with explicit omissions; verify numeric content separately from citation presence; align growth curves, dates and scenarios; use complete compatible TTM capital flows; disclose accrual, cash, lease, debt and equity/share bridges; use conservative shares and show unfunded historical-trend sensitivity; record signal dates, precision, weights and overlapping factor families. Missing attributable executive assessments remain not assessed. Economically incompatible peer rows cannot determine medians.
- **Reproducibility**: persist immutable content-addressed acquired inputs and configuration, verify replay versions, and preserve resume lineage. Offline evaluation requires point-in-time availability, frozen baselines, chronological holdouts and explicit first-filing or total-return outcomes. Tests are synthetic unless separately labeled. Reconstructed META inputs are not original immutable acquisition and future forecasts remain pending.
- **Limits**: no production thresholds or scenario weights are claimed calibrated. No paid generation, publication or mutation of stored historical reports is required. The integration with research reliability uses report 1.12.0 and payload 1.17.0 to invalidate comparison/resume under either branch's earlier meanings; legacy reads remain supported.

## D-83 Research safeguard contracts (2026-10-17)

- **Scope:** Complete the first bounded stage of the book-to-code review after reconciling D-01 through D-82. Existing analytical routes, scoring weights and scenario conventions remain unchanged. The [disposition](2026-10-17-book-to-code-disposition.md) separates existing features from future accounting, liquidity, impairment and evidence-model work; writing a disposition does not implement those models.
- **Grade contract:** The existing judge rule permits at most one step on A/B/C/D/F, with an explicit evidence-based reason. Enforce it in ordinary assembly, final deterministic verification, fallback assembly and immutable stored-report views. Retain raw proposed letters and structured rationale. Invalid distance, inconsistent strip/section proposals or missing/unadmitted rationale withhold both headline grades and publish a versioned reason. A one-step change needs cited qualitative reasoning or matched numeric evidence with no known contradiction; unchecked numeric support cannot authorize it. This validates structural and citation conditions, not the semantic truth of an investment thesis. Independent evidence floors still apply to accepted proposals.
- **Artifact custody:** D-53 deliberately deferred reliable ordinary-run artifact acquisition. A production build now retains compiled-artifact and captured method/lock identities, bound to its build token; ordinary capture uses those identities, never current source bytes as a substitute for the executing build. Missing, inconsistent or unsupported evidence remains unverified. Content identity is not external attestation, installed-dependency attestation or proof that source facts are true. Legacy snapshots are not backfilled. Frozen deterministic replay must use compatible retained artifacts, not relabel current source as a historical engine.
- **EPS convention:** Keep the existing complete-quarter sum of diluted EPS. Label it in the calculation and P/E basis; it is not reconstructed full-period diluted EPS. The [accounting note](2026-10-17-ttm-eps-convention.md) cites IAS 33 paragraphs 19-20, 31-37, 41-43 and 64 and limits the synthetic share-change/loss/split fixtures. No anti-dilution, income-attributable-to-common or split assumptions are invented.
- **Versions and preservation:** New report `1.24.0`, payload `1.29.0`, pipeline `stage-c-1.2.0` and Stage B `STAGE_B_2026_10_TTM_EPS_BASIS_5`. Metadata and changed prompt contracts invalidate old-context resume even where financial arithmetic is unchanged. Saved-view grade validation preserves original generation metadata and stored bytes; it is not a new analyst run. Frozen fixtures separately pin financial values, source registries and intended display/audit deltas.
- **Evidence and remaining gates:** The [verification record](2026-10-17-safeguard-verification.md) owns fresh baseline/candidate results and review findings. Larger analytical extensions and empirical calibration remain gated on sourced accounting/security definitions and independent tests. In particular, the narrow common/preferred-dividend boundary in D-42 needs a separate accounting decision. No paid provider/model validation, deployment, automatic merge or return prediction is authorized by this decision.

## D-84 Common-cash dividend admission and refusal custody (2026-10-18)

- **Problem:** D-42's par-only guard admitted aggregate dividends as common despite APIC-inclusive preferred claims. Invalid cash components could create a positive common inflow or fall back to aggregate cash. Explicit source refusals were then lost downstream when the aggregate was zero.
- **Choice:** Inspect monetary preferred existence over the actual payment window, preserve directly sourced common cash, and admit total-minus-preferred only on compatible cash scopes and consistent signs. Carry explicit refusal in the existing statement `fieldConflicts` contract; payout estimators must not replace it with zero. Preserve genuine sourced zero and raw totals/provenance. Insufficient common payout history withholds dependent valuation while separately supported capital and returns remain available.
- **Evidence:** The [accounting and regression note](2026-10-17-preferred-payout-admission.md) distinguishes cash payments from declared/deemed dividends and earnings allocations. Synthetic parser-to-serialized-input/report/export tests exercise both zero and nonzero aggregates. This is not a new JPM estimate, payout target, scoring calibration or return forecast.
- **Versions:** Report `1.24.1`, payload `1.29.1`, pipeline `stage-c-1.2.1`, Stage B `STAGE_B_2026_10_COMMON_CASH_REFUSAL_6`; earlier contexts and artifact identities cannot resume as equivalent implementations. The general-route audit's economic leaves remain unchanged; only its report-spec expectation moves to this version.
- **Separate follow-ons:** Preferred cash is not an earnings-allocation bridge; common-income selection and annual-flow matching require their own guarded investigation and fixtures. No new TCE convention or rewriting of saved reports is included.

## D-85 Common-earnings allocation and flow admission (2026-10-18)

- **Problem:** Preferred cash paid was subtracted as if it were the current earnings allocation. Nearby statement dates also discarded actual flow intervals, field currencies and ownership, allowing incompatible annual flows or duplicated/missing actual quarters to enter common-holder metrics.
- **Choice:** Share deterministic common-income selection across returns, payout and multiples. Preserve admitted common numerators including zero/losses; otherwise withhold when known preferred claims lack an earnings bridge. Carry actual field scopes through joins and validate rolling coverage before summation. Preserve signed consolidated NCI allocations; refuse known nonzero allocations with unknown ownership instead of guessing a second deduction.
- **Convention:** Admitted filed Basic numerators retain the current house return convention and are explicitly labeled where provenance establishes it. Two-class allocation can differ from issuer common-equity income, but that distinction alone is not a convention redesign. No allocation, entitlement, accretion or participating-security bridge is reconstructed. TCE is unchanged. Duration/candidate bounds are disclosed engineering admission conventions; absent vendor starts and the documented annual zero-closing-NCI inference remain limitations.
- **Evidence:** The [source and regression record](2026-10-18-common-earnings-admission.md) cites SEC SAB 6.B and ASC 260-10-45-60B, distinguishes derived arithmetic controls from printed examples, and records red/green and positive controls. Test fixtures establish correctness properties, not investment performance.
- **Versions:** Report `1.25.1`, payload `1.30.1`, pipeline `stage-c-1.3.1`, Stage B `STAGE_B_2026_10_COMMON_EARNINGS_SCOPE_7`. Previous contexts cannot resume as equivalent implementations. Historical reports retain their own bytes and version stamps.

## D-86 Source-bound fiscal payment evidence (2026-10-18)

- **Problem:** Existing commitment tables retained totals but discarded reported fiscal payment buckets. A total alone cannot locate cash requirements or establish funding capacity.
- **Choice:** Retain optional original fiscal labels, normalized source-table tokens, printed scale/currency, category/table identity, supplying exhibit and exact decimal reconciliation. Unsupported structure, unexplained dashes, source/currency/date disagreement and ambiguous unit-like label tokens remain incomplete or unavailable. Preserve independently supported aggregates and legacy absence. Only complete, currency-supported non-Total category buckets enter the numeric payload.
- **Evidence:** The [methodology and verification note](2026-10-18-commitment-payment-evidence.md) cites the source exhibit's two separate schedules and later guarantee exposure, and Item 303's distinction between cash requirements and funding resources. Retained-text reproduction is internal consistency, not external authentication. No exact maturity date, funding gap, default probability or issuer-wide completeness is inferred.
- **Versions:** Report `1.25.0`, payload `1.30.0`, pipeline `stage-c-1.3.0`, current-reports adapter `current-reports-1.1.0`. Stage B implementation and scoring defaults are not changed by this disclosure. Existing reports retain their original stamps and bytes.
- **Deferred:** A financing bridge still requires obligor-level resources, contractual conditions, transfer restrictions, covenants and reconciled debt/lease overlap. This disclosure is a prerequisite, not that model.

## D-87 Accounting scope and retained filing evidence (2026-10-18)

- **Problem:** A source-backed report audit reproduced omitted temporary equity, incomplete cash restriction scope, withheld debt carrying values despite a reconciled note, age-based technical suppression despite sufficient observations, and misleading metric labels. Bounded filing excerpts also omitted material control, litigation and officer evidence available in the retrieved document.
- **Choice:** Extend existing accounting and evidence contracts with conservative source admission, explicit refusals and reproducible arithmetic. Missing components remain unknown; a derived identity operand cannot independently validate that identity. Carrying debt, principal, recognized leases, restricted cash and transaction proceeds retain their distinct meanings. Neither a financing subtotal nor historical cash runway establishes current funding capacity.
- **Presentation and method:** Preserve model prose and saved-report bytes. Typed metric comparisons need compatible source, period and metric context. Leadership remains a capital-stewardship proxy; weighted-average diluted shares are not net economic dilution. Existing sample/window rules govern technical eligibility while financial-history restrictions remain. No score-band, weight, forecast-model or probability calibration is introduced.
- **Versions:** Report `1.26.0`, payload `1.31.0`, pipeline `stage-c-1.4.0`, Stage B `STAGE_B_2026_10_ACCOUNTING_EVIDENCE_8`. Changed source admission and context must not resume as equivalent to older methods. Earlier saved inputs are not backfilled with newly captured full-document evidence.
- **Evidence and gates:** The [implementation record](2026-10-18-accounting-evidence-remediation.md) distinguishes primary-source facts, completed-book-review locators, deterministic frozen comparisons and fresh end-to-end validation. Independent adversarial review and full relevant tests precede integration. Financing capacity, normalized earnings, permanent impairment, replacement investment and empirical scoring studies remain separate gated work.

## D-88 Exact final evidence and interval presentation (2026-10-18)

- **Problem:** A frozen report retained failed acquisition warnings after later source admission, discarded a filing fact's explicit duration in its typed registry, and showed rounded accrual prose without a separately bound precise measure.
- **Choice:** Preserve each failed attempt verbatim and attach optional, narrowly validated final-field resolution evidence. Only the exact supported field and period leave the active warning set. Recovered debt does not complete every lease, temporary-equity or NCI category. A retained SEC parent category can resolve that category's earlier failed supplement while preserving the same-filing supplement refusal; it does not prove the accounting identity or absent aggregates.
- **Verification and presentation:** Preserve an explicit valid source duration without inventing fiscal classifications or changing amount, currency, filing as-of date or matcher tolerance. Add structured accrual clarifications only for unique, verified canonical metric identities and exact valid as-of dates. These notes preserve raw model prose, do not validate its wording or unstated window, and do not rewrite persisted reports.
- **Versions:** Report `1.27.0`, payload `1.32.0`, pipeline `stage-c-1.4.1`; Stage B remains `STAGE_B_2026_10_ACCOUNTING_EVIDENCE_8`. No scoring, deterministic valuation, probabilities or model-selection defaults change.
- **Evidence and gates:** See the [bounded follow-up record](2026-10-18-accounting-evidence-remediation.md#bounded-final-evidence-follow-up). Tests use synthetic cases and a private immutable retained-input replay, without another model generation. Funding capacity, broader semantic verification and the existing analyst-summary cap remain unresolved limitations.

## D-89 Filed CFO conflicts and explicit fraction units (2026-10-18)

- **Problem:** A subsequent acceptance audit found vendor quarterly CFO inconsistent with compatible filed cumulative cash flows. The difference entered current standardized FCF and cash-conversion ratios. Separately, numeric prose correctly expressing a declared fraction as a percentage was classified as a unit contradiction because canonicalization had discarded the fraction declaration.
- **Cash-flow admission:** Compare only compatible currency, issuer, date and duration evidence available by the observation cutoff. A signed quarter can come from a direct filed quarter or compatible same-start cumulative operands; negative CFO is valid. Ambiguous direct facts must not be bypassed by a different derivation. Preserve original vendor data and conflict records, withhold processed CFO aliases and dependent standardized FCF, and retain independent capital/valuation evidence. Do not silently select the more favorable observation or overwrite an earlier explicit refusal.
- **Fraction semantics:** Retain an optional explicit unit-fraction declaration in numeric provenance. It permits percentage prose to be compared after scaling both its value and rounding quantum. Ordinary ratios/multiples, legacy records without that declaration, percentage-point changes, wrong values and hundredfold errors retain their existing refusals. No metric-name heuristic establishes the scale.
- **Versions:** Report `1.28.0`, payload `1.33.0`, pipeline `stage-c-1.4.2`. Stage B remains `STAGE_B_2026_10_ACCOUNTING_EVIDENCE_8`: its calculation engine is unchanged for identical admitted inputs. Changed input admission/context must not resume old narrative as if equivalent. Saved reports retain their bytes and historical stamps.
- **Evidence and limitations:** See the [acceptance safeguards and phased plan](2026-10-18-accounting-evidence-remediation.md#subsequent-acceptance-safeguards). Source tracing is not proof of accounting truth. A deterministic replay can demonstrate withheld claims and rendering; it does not regenerate stale analyst prose or establish investment performance. Integration still requires fresh gates and independent review.

## D-90 Exact cash/classification refusals and issuer completion (2026-10-19)

- **Choice:** Share the exact direct/derived quarter interval contract; select latest principal evidence before sign rejection. Preserve cash/repurchase and income-classification refusals through payout, liquidity, buyback coverage and forensic consumers. Recompute a refused margin only from independently compatible filed operands. Recognized uppercase title boundaries retain strict source/recipient matching.
- **Issuer evidence:** Bind the reviewed Adobe alias to its exact CIK/legal-name/official-site identity; support its actual publication metadata and bounded introductory grammar. Official news/blog discovery remains bounded and cannot prove absence or transaction economics.
- **Versions:** Report `1.29.0`, payload `1.34.0`, pipeline `stage-c-1.5.0`, Stage B `STAGE_B_2026_10_ACCOUNTING_EVIDENCE_9`. Unlike admission-only changes, consumer behavior changes on identical retained inputs. Earlier engine snapshots cannot replay as equivalent. Existing reports retain bytes/stamps; score bands, weights and FCFF methodology are unchanged.
- **Evidence and limits:** [Implementation/source record](2026-10-19-phase-one-evidence-completion.md). Adobe cash controls are six-month YTD, its cited income controls three-month; neither proves missing vendor observations. Exact FMP 402 cause remains unknown without sanitized original evidence. Tests and review are gates, not universal accuracy claims. No live report, push or merge is authorized by this record; phase two remains gated.

## D-91 Canonical gross-profit scope and disclosure refusal continuity (2026-10-19)

- **Problem:** Independent review reproduced partial-service costs becoming a canonical gross-profit subtotal, EDGAR admission skipped by envelope, raw refused rows reappearing in disclosures, and a Unicode dateline regression.
- **Choice:** Require full compatible same-filing industrial operands for canonical GP arithmetic; preserve directly filed GP and serialize explicit unknown/refusal state. Revalidate EDGAR and mixed backfill rows. Propagate new canonical refusals only with source evidence compatible with the vendor row's currency, explicit interval and filing; retain existing refusals. Share immutable refusal-aware reads across Stage B and disclosures, including dependent CFO aliases/standardized FCF. Restore hyphen/en-dash/em-dash boundaries with Unicode escapes without loosening issuer matching.
- **Versions:** Report `1.29.1`, payload `1.34.1`, pipeline `stage-c-1.5.1`, Stage B `STAGE_B_2026_10_ACCOUNTING_EVIDENCE_10`. Consumer results change on identical retained inputs. Keep old reports immutable and old engines distinct; score bands/weights remain unchanged.
- **Evidence/gates:** [Review-correction record](2026-10-19-phase-one-review-corrections.md). Red/green source, serialization, actual report/read/export and Unicode controls precede new exact-head full gates. Independent final review and ADBE source/narrative acceptance remain pending; no live run/push/merge is authorized by this note.


## D-92 First-report source reconciliation and disclosure (2026-10-19)

- **Problem:** Independent audit of the immutable first ADBE acceptance report found investment-component scope, admitted cash conflicts, stale corporate-event status, unverified consensus EPS basis, a mislabeled history fallback, dropped sensitivity conventions and missed dated repurchase authority.
- **Choice:** Refuse unreconciled source classifications and dependent values, retain a separately disclosed operating-only accrual definition, repair the bounded official index/body reader, retain dated authority with its own primary source, and qualify unsupported EPS comparability. Keep original report/input bytes and model arithmetic where no defect was found.
- **Disclosure convention:** Preserve computed grid notes and explicitly state the existing zero reinvestment floor and cell-relative terminal ROIC. In the historical fixture these changes add explanatory leaves and advance the report stamp; no numeric model, score or provenance value is blessed by this note. Deterministic sensitivity notes are excluded from judge-authored schema fields, preserving the existing complexity budget.
- **Evidence/gates:** [Source, regression and acceptance record](2026-10-19-first-report-remediation.md). Exact revised-code gates and independent review precede the controlled rerun; report acceptance remains pending its source/narrative audit. No push or merge.
- **Versions:** Report `1.30.0`, payload `1.35.0`, pipeline `stage-c-1.6.0`, Stage B `STAGE_B_2026_10_ACCOUNTING_EVIDENCE_11`; earlier reusable contexts remain distinct.

## D-93 Deterministic disclosure attribution and refusal wording (2026-10-19)

- **Problem:** The controlled second ADBE report retained two deterministic wording defects: a projection note prefixed a correctly cited 10-Q authority amount with "latest earnings release", and accrual/score explanations described reported but refused investment operands as not reported. Analyst prose correctly distinguished the source and unreconciled inputs.
- **Choice:** Use a neutral retained-issuer-disclosure prefix with the admitted source label and make positive dilution conditional on the observed trend. Describe unavailable compatible admitted inputs, including refusals, without asserting that raw or filed observations were absent. The same rule applies to long-term-investment availability in the two-period explanation. Scope failed guidance extraction to structured rows without denying separately sourced narrative guidance. Generate target conditions from actual recorded growth/effective-margin shifts, including caps, and fixed base inputs; retain analyst conditions separately with an explicit qualitative, unmodeled label. Preserve all calculations and conservative share policy.
- **Versions:** Report `1.30.1`, payload `1.35.1`, pipeline `stage-c-1.6.1`, Stage B `STAGE_B_2026_10_ACCOUNTING_EVIDENCE_12`. These identify changed deterministic/context text; no finance methodology or score band changes.
- **Custody and validation:** Preserve both original reports and their snapshots/exports. Any corrected render is a separately labeled derived artifact with exact changed paths, original/revised code stamps and unchanged numeric leaves. Original analyst conditions are retained verbatim inside explicitly labeled qualitative commentary rather than silently rewritten as model inputs; all other model prose remains unchanged. It is not a fresh model run or a retroactive re-stamp of the saved report. Targeted red/green regressions, exact-head full gates and independent code/report clearance precede integration; no automatic additional LLM run, push or merge.

## D-94 Source-bound issuer reconciliation presentation (2026-10-19)

- **Problem:** Period-only grouping and first-value selection could mix supplying documents, misattribute tax observations, or join an issuer FCF amount across a nearby date. A reported EPS difference was labeled like an independently allocated net-of-tax adjustment.
- **Choice:** Partition tables by the complete retained filing reference. Require exact duration/end date, established currency, compatible units, known common document and unique finite operands for derived EPS arithmetic. Retain conflicting observations, wrong-unit rows and unknown legacy document scope without choosing a favorable bridge. Join issuer FCF only within the exact source/period; preserve its independent reported row when the join is unavailable. Keep the issuer basis note without inventing note-level provenance.
- **Meaning:** The reported EPS difference is rounded per-share arithmetic, including denominator effects; it does not establish item-level taxes or recurring earning power. Retained FCF rows do not establish discretionary cash or usable funding. No reported amount, score, valuation path, source fact or historical report is rewritten.
- **Versions and gates:** Report `1.30.2`; payload `1.35.1`, pipeline `stage-c-1.6.1` and Stage B12 unchanged. [Research, scope and remaining contracts](2026-10-19-phase-two-evidence-foundations.md). Exact-head tests, frozen accepted-report comparisons and independent review precede publication; the independent earnings ledger, usable funding/reinvestment model and longitudinal thesis history remain separate work.

- **Pre-release review correction:** Require the observation's period end to be no later than the supplying filing date before deriving EPS differences or joining issuer FCF. Retain future-period raw observations with an explicit qualification and keep independently valid historical columns. Same-day chronology remains eligible. This is a date-level guard, not an intraday availability claim. The basis-note provenance qualification is limited to the separately displayed note when quarterly trends are absent; existing trend-note text is retained without claiming uniform qualification.

- **PR37 retention and reader correction:** Expand the previously presentation-only boundary to preserve source/value-distinct parsed reconciliation and FCF observations through provider/adapter ingestion (`current-reports-1.2.1`). Collapse only identical observations, withhold ambiguous/incompatible/future quarterly issuer selections and a non-common FCF definition, and provide stable complete-source/table reader keys. New input bundles/disclosures/context may differ; historical report/input bytes, scoring and valuation formulas remain untouched. Parser completeness and the broader analytical backlog are not claimed. Fresh regression/full gates, frozen-report comparisons and independent review precede a PR update or discussion resolution.

## D-95 — Source-scope admission before a corrected IREN run (2026-10-19)

The reviewed IREN FY26 primary presentation separates cash PPE excluding computer hardware from cash hardware payments. Admit their disjoint gross cash total only with exact issuer/document identity, namespace, consolidated period and USD/scale evidence. Recompute or refuse existing FCF and aliases; preserve valid CFO when a quarter is refused for lack of compatible cash-investment scope. An annual or nine-month CFO must never be compared to quarter CFO. Withhold recent-quarter burn extrapolation when investment scope is explicitly refused. Other investing flows and cross-filing quarter reconstructions are outside this complete-scope admission.

Noncurrent convertible carrying debt is a completeness lower bound, not an automatic addition to a potentially inclusive aggregate. Preserve the June carrying total. Historical EV independently requires exact-date complete compatible quoted-class outstanding shares and split evidence; EPS averages and later cover counts cannot fill history. The $3,687.832m March omitted-debt comparison is an isolated sensitivity, not corrected EV. Retain differently dated class observations without assuming common economic rights or a class sum. Preserve direct EPS; derived basic EPS requires common earnings and complete compatible weighted-share lineage with currency-per-share provenance. Diluted EPS needs quarter-specific numerator/denominator and antidilution proof. Broad SIC 6199 stays disclosed while its economic sector/methodology is unresolved. Segment member continuity and geography allocation basis remain conservative.

Sources: [IREN FY2026 10-K](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000052/iren-20260630.htm), F-10, pages 122–123 and cover; [March 2026 10-Q](https://www.sec.gov/Archives/edgar/data/1878848/000187884826000026/iren-20260331.htm), balance sheet and convertible note. The frozen provider-free DEMO comparison changes only the report-spec stamp from the previously accepted convention to 1.31.0; numerical values, grades, weights, provenance registries and manifest identity remain pinned. Payload 1.36.0 and Stage B accounting evidence 13 prevent resuming old conventions as the new method. Existing reports/snapshots are preserved.

Pre-acceptance review correction: resolve cash observations within the requested actual interval before applying filing priority. Cumulative evidence cannot displace a compatible direct quarter; ambiguous eligible intervals and conflicting latest exact-period observations are refused. A newer exact-period refusal or currency mismatch cannot reveal older favorable evidence. For a general-route issuer with broad SIC 6199 and unresolved sector/industry, retain the same conservative numerical battery while marking Beneish, accrual and reduced Piotroski notes, signals, manifest reasons and labels as eligibility unresolved. Established financial routes retain their financial rationale. These corrections replace the unaccepted private candidate, preserve its evidence and all historical reports, and require new exact-commit gates and independent acceptance before publication or a report run.

PR review correction: distinguish an exact historical observation date from its later filing availability and the prospective current-capitalization interval. The filing must be available by the acquisition cutoff, the observation must still match the balance date, and complete compatible outstanding-class/split evidence remains required. Resolve both optional CFO aliases, refuse their contradictions and compare every populated alias against compatible filed CFO before FCF publication; cumulative CFO remains ineligible for quarter comparison. Label unresolved Piotroski eligibility in the live company panel as well as forensic details, retaining its actual denominator and all existing numerical suppression. New focused and exact-commit full gates and independent review precede a PR update/merge or corrected report run.

## D-96 - Company admission, unresolved model applicability and AFFO comparability (2026-10-19)

Cross-company audit A1-A4 reproduced four admission/comparability defects. Current approximate AFFO cannot inherit historical comparability from FFO: recurring-capex/rent and adjusted FFO constructions do not match the historical NI + total income D&A - all-capex series. Require an explicit independently compatible AFFO construction for historical P/AFFO ranks; retain current approximate values and independently compatible FFO.

Company admission requires an explicit equity type or both fund flags false when no explicit type is supplied. True fund flags take priority; unfamiliar or explicit non-equity types stay unresolved/unsupported. A confirmed issuer's incomplete vendor profile may gain only missing public instrument-type metadata with field-level provenance, without overwriting vendor fields. Fully empty bundles retain source-only output without company computation or paid preflight.

Strong bank/insurer or corroborated mortgage-REIT evidence conflicting with the selected label does not establish either an industrial model or a replacement financial model. Retain the route and observations, withhold route-dependent valuation, industrial debt/WACC/ROIC and scenarios, and require consolidated operating/financing-scope reconciliation. Weak property evidence and ordinary vendor financing do not trigger this hold. This is a conservative project policy; it does not reconcile every conglomerate or establish issuer FFO/AFFO truth.

Report 1.32.0, payload 1.37.0 and Stage B ACCOUNTING_EVIDENCE_14 distinguish these conventions. The classified industrial DEMO control changes only report.meta.specVersion; financial values, grades, registries and manifest identity remain pinned. Existing report bytes are immutable. Primary research, controlled and issuer-derived fixtures, coverage limits and validation boundary: [bounded implementation record](2026-10-19-company-eligibility-affo.md). No new model bands, rating quotas, paid model runs or deployment. Full gates and independent final-candidate review precede handoff.

## D-97 - Independent audit fixes: cutoff, debt composition and plausibility, lease portions, NCI inference, evidence floor (2026-10-20)

The independent audit of 2026-10-19 reproduced its findings on four live runs: FCX, PGR, O and SNOW. This decision covers recommendation items 1-6 and 9. Items 7, 8, 10, 11 and 13-18 are deferred. Item 12, the unprofitable-overlay trigger, needs an owner policy decision and is untouched.

- **Item 1 (PGR-1, PGR-2): analysis cutoff.** The bundle's cutoff is the end of acquisition, and never earlier than this build's newest fetch stamp. Filings fetched by the same build are therefore never refused as unavailable.
- **Item 2 (O-1, O-2, SNOW-1, SNOW-10): financing debt.**
  - When no long-term-debt aggregate is tagged, noncurrent financing debt comes from the filer's combined debt amount or from one figure per instrument class. The result is disclosed as a substitution, and a possible double count is withheld.
  - On non-financial routes, total and net debt are withheld when a year's interest implies more than 25% on the larger of opening and closing resolved debt. The 25% threshold is a project choice: no investment-grade or high-yield financing costs that much. Interest below 0.25% of total assets, and zero debt, are not judged.
- **Item 3 (FCX-1, FCX-14, CODE-1): partial lease maturity.** A missing operating-lease maturity keeps the tagged portion. Only a missing finance-lease maturity still withholds total debt. Consumers remove the operating portion only when total debt is shown to contain it.
- **Item 4 (O-3): withheld leverage.** Withheld debt leaves no leverage signal and no EV multiple. Key data marks EV/EBITDA "withheld". Interest coverage stays scored, because it is EBIT over interest expense and does not read the withheld balance.
- **Item 5 (SNOW-2, DOC-1): zero NCI.** NCI is inferred zero only from the filing. That needs no NCI balance at the date, NCI income of exactly zero for the period ending there, and a zero NCI balance at the latest earlier date within about a year. Parent P/FCF is withheld for outside ownership only above 1% of consolidated equity.
- **Item 6 (PGR-4): evidence floor.** No surface shows a letter for an aspect whose score rests on one signal with only part of its intended evidence. Scores and the composite are unchanged. A P/TBV rank that fell back to P/B is labelled as a P/B rank.
- **Item 9 (GATE-21): fixtures.** Trimmed SEC companyfacts for FCX, PGR, O, SNOW and NNN are committed as fixtures, with no vendor data. Builder and keyless-pipeline tests pin the shapes above.

Report 1.33.0, payload 1.38.0 and Stage B ACCOUNTING_EVIDENCE_15 mark these conventions. The provider-free DEMO control changes only `report.meta.specVersion`. Stored reports and snapshots keep their bytes. See the [disposition record](2026-10-20-independent-audit-fixes.md).

## D-98 - AMZN audit fixes: rate-limit retry, investment stakes and their tax, guided YoY pace, improving-margin fade, gain-inflated P/E, report-level disclosure (2026-10-20)

The audit of the AMZN report of 2026-10-20 traced its −72% fair value to a run degraded by FMP rate limits and four model defects. This decision covers that audit's fixes 1-5 with its findings 12, 14 and 17, and recommendation items 7 and 15 of the independent audit of 2026-10-19. Every rule is class-wide; none names a ticker.

- **Rate limits (finding 2).** Analyst estimates and the annual and quarterly income statement, balance sheet and cash flow each wait out an HTTP 429 once: the vendor's `Retry-After`, or one 60-second rate window when none is named. No request takes more than 90 seconds of wall-clock time in total, counted from before the first attempt; a pause that would end at the bound is not waited for, and the retry is one attempt timed out at the bound. A request still refused does not stop the run. The report is published with a `fmp.rateLimit` warning that names the refused members and says the valuation is degraded. When the analyst estimates are refused, the DCF's analyst-growth record is a warning naming the rate limit. Both bounds and the choice to publish degraded rather than stop are project choices.
- **Investment stakes (finding 1).** The SEC statements fill `longTermInvestments` from the filed `LongTermInvestments` total, else from non-current debt securities plus `OtherLongTermInvestments`, else non-marketable equity securities plus equity-method investments, without adding a total to its parts. The undivided `AvailableForSaleSecuritiesDebtSecurities` total is never used, because most filers include current and cash-equivalent securities in it. Amazon's $97.9B of Anthropic notes, tagged only there, therefore still count as zero. This is a known understatement.
- **Tax on investments.** The bridge subtracts an estimated tax on every non-operating asset it adds: the D-60 marketable equity securities and the long-term investments. The rate is the marginal-rate floor (D-58; 21% in the US, 15% where no statutory rate is sourced), and the basis is assumed to be zero. That is the most the tax could be.
- **Guided quarters (findings 3 and 14).** A quarter-and-year phrase that directly follows a comparison word in its own clause ("compared with", "versus", "vs.", "relative to", "against", "from"), with nothing between them but amounts and connecting words ("compared with $18.2 billion, or $1.68 per diluted share, in second quarter 2025"), is not taken as the reported or guided period. A comparison word earlier in the clause that governs something else ("the impact from foreign currency, revenue for the fourth quarter of 2026") does not skip the period. "From" could in principle skip a period written as "from the third quarter 2026 onward"; no observed release uses that wording. A phrase heading an outlook, with the heading word after it or before it ("Third Quarter 2026 Guidance", "Outlook for Second Quarter 2026"), is never taken as the reported quarter. Guided revenue carries at the guided quarter's year-over-year pace, a year-ago quarter 350-380 days earlier in the model currency. Without that quarter the sequential pace is the fallback.
- **Improving margins (finding 4).** Under a dated improving regime the margin target is the lower of current + 0.5 × dated slope × 5 years and the scenario margin ceiling (today's gross margin less the leanest operating-expense ratio among the TTM and the last five fiscal years). It is never below the current margin or the median. The DCF notes state the per-share value with the margin held flat. The 0.5 share and the ceiling as the bound are project choices.
- **Gain-inflated earnings (finding 5, recommendation 15).** When non-operating income exceeds 25% of positive pre-tax income, the P/E is not ranked against its own history, and the rank falls back to EV/EBITDA, then Price/FCF. Key data caveats the P/E, and the multiples table shows no own-history rank for it. The DCF margin seed leaves out tagged one-offs inside operating income, in both directions: `InsuredEventGainLoss`, and `AssetImpairmentCharges` or else the goodwill, long-lived-asset and intangible impairment tags. Restructuring is not treated as a one-off. A tag whose fiscal-year amount has no filed prior year to date, or the reverse, is withheld rather than split at the window's start by assumption, and the DCF notes name it. The 25% line and the tag list are project choices.
- **Report-level disclosure (findings 12 and 17, recommendation 7).** Passes run on a subscription plan with only the supplied evidence add an Evidence line to the report header and run details, the print header and the live view. The line is not shown for API passes, whose web-search use is not recorded in the execution metadata, nor for a failed attempt or a refused model that a data-only report lists. The header's contradicted count adds cited figures the verification log marks contradicted to the prose-claim count, and names the split.

The Codex review of PR #41 found the four gaps these rules now close: the one-off split, the P/E rank on display, the retry's wall-clock bound and failed passes in the Evidence line.

**Owner decision (2026-10-20).** The owner accepted the choices in this entry as recorded: the 90-second bound and publishing degraded, the 21% tax on the whole carrying value, leaving the undivided available-for-sale total out, the improving-margin bound, the 25% line and tag list, the Evidence line's wording and scope, and the guided year-over-year pace with its sequential fallback. Recommendation item 12 of the independent audit stays open.

Report 1.34.0, payload 1.39.0 and Stage B ACCOUNTING_EVIDENCE_16 mark these conventions. In the provider-free DEMO control, only the investment-tax leaves and `report.meta.specVersion` change. Stored reports and snapshots keep their bytes. See the [disposition record](2026-10-20-amzn-audit-fixes.md).

## D-99 - Deferred AMZN audit fixes: SBC beyond negative FCF, loss-year ROIC, recent buyback timing, bounded reverse DCF, scenario margin direction, seasonal consensus, lease-consistent leverage, evidence families, peer counts and the verdict stance (2026-10-20)

The AMZN report audit of 2026-10-20 left findings 6-11, 13, 15, 16 and 18-21 for later (D-98). This decision covers them. Every rule is class-wide; none names a ticker.

- **SBC beyond all FCF (finding 8).** When free cash flow before SBC is not positive and SBC is positive, the SBC/FCF signal scores at its band floor; the ratio itself stays undefined and the note says so. It stays unscored when SBC is unknown or a credit.
- **Loss-year ROIC (finding 9).** A year with non-positive pre-tax income but positive operating income taxes that income at the D-58 marginal-rate floor (21% US, 15% unsourced) instead of being skipped. An operating loss still leaves the year out, and the ROIC floor's label names any year inside its window without a return. The terminal excess-return rule then reads the restored year like any other.
- **Buyback timing (finding 15).** The label states the sign ("year-average cost vs cost paid; negative = paid above average"). Timing is graded only when a priced year falls within the issuer's last three fiscal years, counted back by date from the latest annual cash-flow row; older timing is named as stale. With no repurchase in those three years the signal is absent; a recent repurchase without a priced recent year counts as missing evidence. The three-year window is a project choice.
- **Reverse DCF beyond the range (finding 10).** When every prescan value lies on one side of the price, the result carries `growthOutsideRange` and the reverse signal is graded at that end of the range: a price above every value scores the band floor. An implied growth beyond the range is stated only when value rises with growth across the range. Thesis triggers point away from the base case.
- **Scenario margins (finding 11).** The correlated margin shift is applied only when it moves with its scenario; otherwise that scenario's margin stays at base. The bull carries lower growth only when growth destroys value, and the ordering disclosure says so.
- **Consensus calendarization (finding 19).** Fiscal-year estimates are spread by the issuer's own quarterly shape from its last complete fiscal year (four reported quarters ending on the year end, each of the last three 84-98 days after the one before, in the model currency), applied to fiscal years ending within 10 days of that year's anniversaries; otherwise evenly, with the reason stated. The windows are project choices.
- **Leverage basis (finding 20b).** Net debt/EBITDA uses the enterprise value's lease basis, so under the house default it removes the operating-lease liability exactly where EV does.
- **Not changed: financing obligations (finding 20a).** Amazon's $9.3B of financing obligations carry only its own XBRL elements, which companyfacts omits; no standard us-gaap tag carries them, so net debt is unchanged rather than composed from custom tags.
- **Segment nesting (finding 13).** A revenue row nests under another only when the sum holds in every quarter where parent and children are all tagged, and in at least two of them. Members renamed between filings are still not joined (D-63).
- **Report wording (finding 20).** Failed Piotroski signals state what their figures did; the accrual scaler is labelled "average NOA or total assets"; the remaining repurchase authorization is also read from the 10-Q notes; only cited facts appear under an officer the gate did not assess; the EV bridge is stated once and names the lease setting as the house default. The earnings-date wording is unchanged: no company confirmation reached the run.
- **Evidence families (findings 6 and 16).** Notes evidence gains a remaining-performance-obligations family that keeps amount and timing sentences first. The pending-case reservation also holds government cases, antitrust or monopolization claims actually alleged (not a risk the issuer may face), relief in the billions or structural relief beside a legal proceeding, regulators' fines and trials scheduled in a legal proceeding (never a clinical or commercial trial). The list of government plaintiffs (FTC, DOJ, attorneys general, the European Commission, the CMA, the SEC and named competition authorities) is a project choice.
- **Peers (finding 7).** The audit's cause was not the screen: the vendor's rate limit stopped peer collection. The peer summary counts candidates the provider never served, and candidates past the house's own candidate limit, apart from those the screen excluded, and leaves out the subject. Segment-aware peers would need a peer source per segment and are not built.
- **Verdict stance (finding 18).** The judge's executive summary opens with a stance on the price ("undemanding", "about right" or "demanding") and the evidence that decides it, as a valuation judgment rather than a rating. The analyst-estimates section states the consensus target's and the model value's implied moves when they share the listing currency; a gap above 20 points of the price (a project convention) must be reconciled in the summary.

Report 1.35.0, payload 1.40.0 and Stage B ACCOUNTING_EVIDENCE_17 mark these conventions, with the scenario method stamps SHARED_SCENARIO_PATHS_2026_10_D99 and SCENARIO_TARGETS_2026_10_D99 and the notes and risk selection version section-evidence-4. In the provider-free DEMO control the reverse DCF now carries its bound (DEMO's price is below its value at every growth in the range), so its reverse signal is graded again: valuation completeness returns from 0.4 to 0.7 and the composite moves from 73.97 to 76.37. The EV bridge is stated once, and the spec version moves. Stored reports and snapshots keep their bytes. See the [disposition record](2026-10-20-amzn-deferred-fixes.md).

## D-100 - Audit batch 1: headline numbers: guidance ranges, depositary-share market cap, debt chains and plausibility, and the composite's evidence floor (2026-10-22)

The independent audit of 2026-10-22 found reports publishing wrong headline figures with no warning. Batch 1 covers findings B-25, B-19, B-14, B-15, B-17, B-16, B-40, A-10 and F-19. Every rule is class-wide; none names a ticker.

- **Guidance ranges (B-25).** A money range shares the scale printed after its high end; a percent range shares its %; a hyphen after a number or % is never a sign. A range with one readable end is left unread, and an amount the guide is compared with is not the guide. An outlook naming its year without "full year" guides that fiscal year; a quarter named only as a comparison base does not make it quarterly. A revenue guide must lie within 0.2–5× the revenue of the latest quarter its release could see (four quarters for a full-year guide), or it is left out of the DCF anchor, the outlook table and the checks. The band is a project choice.
- **Depositary-share market cap (B-19).** A 20-F or 40-F filer is flagged as an ADR even when no statement row is built. Without a filed depositary ratio, a 20-F filer's keyless market cap, quote market cap and market-cap history are withheld; a 40-F filer (a Canadian issuer listing its common shares) keeps them, and a 20-F filer listing its ordinary shares directly loses them too; the ratio is never guessed or taken from the static ADR table. A market cap computed from a quote and a filed count is labelled derived.
- **Debt chains (B-14, B-15, B-17).** Long-term debt reads `LongTermNotesAndLoans` with its current portion and `LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities`, each netted against a current-debt line that already carries its current part. A composition more than 1% away from the inclusive total plus short-term borrowings is recomposed from them, or withheld when no borrowings are tagged. A same-period tagged debt total exceeding the composed debt by more than 1% withholds total and net debt, in the statements builder and in Stage B's debt admission for vendor rows. The 1% tolerance is a project choice.
- **Debt plausibility (B-16).** The interest check uses the average of the year's balances, opening to closing. Debt that fell more than 60% to a balance on which the year's interest implies over 25% is withheld unless the cash flow shows net repayment of at least half the fall, or, with no net issuance disclosed, repayments of at least half the fall. The thresholds are project choices. These checks run after the chains above and do not re-withhold debt the chains compose correctly.
- **Maturity buckets (B-40, A-10).** A refused next-twelve-months bucket withholds only the split of an inclusive `LongTermDebt` total, never the total, when the bucket was the only current component. Any tagged remainder-of-year bucket, zero included, refuses the bucket; a balance sheet whose `LongTermDebt` equals its `LongTermDebtNoncurrent` declines it first.
- **Composite evidence floor and neutral band (F-19).** Below evidence for 50% of the route-applicable signal weight the composite shows "Not graded: evidence N%" with its score and no letter, on every reader-facing surface (the audit export keeps the stored band as a raw field) and in the judge payload. A deterministic band letter for a score that rounds to 45 through 55 carries "neutral"; an analyst letter that differs from the band does not. Key data prints the evidence share and the band thresholds. A printed score never rounds up across a band threshold; it is cut to one more decimal instead (54.6, not 55, beside D). The band table itself is unchanged; the neutral range is a project choice.

Report 1.36.0, payload 1.41.0 and Stage B ACCOUNTING_EVIDENCE_18 mark these conventions. In the provider-free DEMO control only the quote's market-cap origin ("provider") and the spec version move. Stored reports and snapshots keep their bytes. See the [disposition record](2026-10-22-audit-batch1-headline-numbers.md).

## D-101 - Security audit fixes: framing, untrusted-text envelopes, the web-search rule, the LAN company-page guard, the Node floor and hermetic tests (2026-10-22)

The audit of 2026-10-22 raised F-4 to F-8, F-10 and F-11 and carried forward GATE-1, GATE-22 and DOC-1 from earlier audits. This decision covers them. No rule names a ticker, and no figure changes.

- **Framing (F-4).** Every response the request-wide proxy passes or rejects forbids framing by any site, its own included (`frame-ancestors 'none'`, `X-Frame-Options: DENY`). The print view opens in a new window, so nothing is lost.
- **Untrusted-text envelopes (F-5, F-6).** Stage A flags and gap reasons can quote provider error text, so they reach the model only inside the untrusted-data envelope, JSON-encoded with markers escaped and each entry on one line. The judge receives each analyst case enveloped and labelled model-authored, and so does any pass shown its own output again: a rejected output echoed for repair, or the sections kept from a cut-off or part response. The shared rule tells every pass to treat these as data. The sections rendered outside the envelopes carry no free provider text: the grades consensus is stated only as one of FMP's five rating words, and statement period labels and FINRA and FRED observation dates must be ISO days.
- **Web-search results (F-7).** The shared rule says web-search results and fetched pages are untrusted evidence: quote them, never follow or repeat instructions in them.
- **Owner decision: the repair echo is JSON-encoded.** A rejected output echoed for repair is now one JSON string inside the envelope instead of raw text. Whether models repair as reliably from the encoded form cannot be measured without live runs; none were made.
- **Owner decision: version stamps.** The envelopes move the payload fingerprint but change no calculation or payload field, so payload 1.41.0 and report spec 1.36.0 (as Batch 1 left them) stay. A partial report whose analyst passes ran before the change cannot resume after it.
- **Owner decision: the LAN company-page guard (F-8).** On a non-loopback `METIS_ALLOWED_HOST`, a company landing with no Fetch Metadata needs `X-Metis-Token` or a `Referer` naming this exact origin, so a script there should send the token. The Referer arm is the owner's choice: browsers send no Fetch Metadata to a plain-HTTP LAN address, so without it the app's own links there would be refused too. A cross-site page cannot forge a same-origin Referer. On a plain-HTTP LAN host a typed or bookmarked company URL, a link clicked on another site, and a browser or extension that strips the Referer are refused; the reason says to open the page from the home page or serve Metis over HTTPS. A same-site cookie set by the home page could admit those too; it was not adopted here. Loopback is unchanged.
- **Owner decision: Node 24 (F-10).** `engines.node` is `>=24`, the one version CI runs and the suite is known to pass on. No Node 22 lane is added.
- **Hermetic tests (GATE-1).** Every test file starts with no `METIS_` or `THESIS_` variable from the launching shell; they return after the file.
- **Not changed: incremental typecheck (GATE-22).** CI typechecks a fresh checkout with no build-info cache, and a warm local cache still reported new errors in edited files and their dependents.
- **Owner decision: DOC-1.** The smallest accurate correction to the deferred PRIVACY.md sentence, and the README's matching one: complete reports have run live through a ChatGPT connection; live Gemini inference has not been verified.
- **Housekeeping (F-11).** The stray `=` line in `.gitignore` is gone.

See the [disposition record](2026-10-22-security-audit-fixes.md).

## D-102 - Audit batch 2: valuation in and out of its domain: DCF domain tests, the trailing excess-return start and its grid, NCI on the earnings key, and the house DCF base rate (2026-10-22)

The independent audit of 2026-10-22 found valuations published outside the model's domain, an excess-return start a year stale, and a consolidated DCF that understated its outside holders' claim. Batch 2 covers findings C-10, B-29, C-11, E-5 and B-30. The owner narrowed the batch to these five and deferred E-7, B-13, A-3, A-2, B-3, B-33 and the financial-route WACC carry-over to a follow-up batch. Every rule is class-wide; none names a ticker.

- **DCF domain (B-29).** When the base DCF's equity value is at or below zero, or its terminal value exceeds 100% of enterprise value (explicit-period present value below zero), the fair value has the status "outside-domain" with a critical `valuation.dcf.domain` gap naming the failed test. No per-share value, sensitivity grid, growth × margin grid, reverse DCF or scenario targets are published from it, and the valuation grade treats the DCF signals as missing. The year rows and the bridge stay visible.
- **Trailing excess-return start (C-10).** The excess-return fade starts from the trailing four-quarter return (ROTE for banks, common-equity ROE otherwise) when that window is complete and ends after the latest fiscal year; otherwise from the fiscal year. The fiscal-year start is valued beside it and printed when the two are more than 5pp apart. The terminal carry is evidenced when the return beat its cost of equity in at least 4 of the last 5 fiscal years. A business-combination year (goodwill step-up or filed acquisition facts at least 10% of opening common equity) below the cost of equity is set aside rather than counted as a miss; at most one year is set aside, so set-aside years never stand in for the evidence. The 4-of-5 rule, the 10% threshold and the 5pp gap are project choices. Owner follow-through: the explicit-period payout fades linearly from the three-year average in year 1 to the steady state `1 − g / ROE_T` in year `N` (clamped to 0–100%; `ROE_T` the cost of equity plus any carry, `g` the continuing growth), so it converges to the payout the continuing value assumes (Damodaran's stable-growth consistency); holding the average flat compounded PGR's book 6.5× before the carry applied. The fiscal-year start, the grid and the reverse solve use the same path.
- **What the reader sees of the start (C-11).** The trailing return is a row in the returns block and a payload figure. A 3×3 grid of per-share values crosses the start (headline ±5pp, the fiscal-year start replacing the shifted row on its side) with the cost of equity ±1pp, holding the carried excess and dropping it where the 2pp `CoE − g` guard fails. A Stage C check warns, without rewriting, when base-case text has returns recovering toward the cost of equity while the trailing return already exceeds the terminal target. The step sizes are project choices.
- **NCI on the earnings key (E-5).** The DCF bridge deducts noncontrolling interest at its share of trailing four-quarter consolidated profit times consolidated equity value (EV less net debt and preferred equity plus non-operating assets) when that share is above 10% and above book NCI ÷ consolidated equity value; otherwise at book. The grids, the reverse DCF and the scenario paths apply the same rule. The key falls back to the latest fiscal year when the trailing four quarters cannot size it, and a net income of unknown ownership is not read as parent income. When a noncontrolling interest exists and the share cannot be established (including NCI income above consolidated profit), the DCF runs on book NCI for its domain test only, and the per-share value is then withheld with a `valuation.dcf.noncontrollingEarningsKey` warning, unless an earlier gate had already withheld it. Owner decision: the trigger compares the profit share with book NCI ÷ consolidated equity value, superseding the audit notes' literal "NCI book ÷ total book equity", which would have kept FCX at book. The 10% materiality is a project choice. Market EV and the EV multiples still use book NCI.
- **House DCF base rate (B-30).** Beside a general-route DCF headline, Key data states that 16 of 18 general-route DCFs in the 2026-10-22 audit census were below price (median −53%; 15 of 18 more than 30% below). It is a dated panel, changed only by a new census, and not shown on the excess-return or REIT routes.

Report 1.37.0, payload 1.42.0 and Stage B ACCOUNTING_EVIDENCE_19 mark these conventions, with the method stamps FAIR_VALUE_2026_10_D102 and SCENARIO_TARGETS_2026_10_D102. In the provider-free DEMO control only the new trailing-return field (null on that general-route issuer), the spec version and those two stamps move. Stored reports and snapshots keep their bytes. See the [disposition record](2026-10-22-audit-batch2-valuation-domain.md).

## D-103 - Audit batch 3a: the remaining high-severity findings: tax rate fallback, principal-versus-carrying debt, vendor rounding, composed D&A, class-tagged market cap, newer results and 10-Q supersession (2026-10-22)

The independent audit of 2026-10-22 found figures withheld although the filed evidence was complete, reports that did not say a newer quarter had been published, and a 10-K operating figure argued from after a newer 10-Q had replaced it. Batch 3a covers findings B-32, B-5, A-11, B-7, B-8 (with B-37 as far as B-8 needs it), B-24 (with B-26 as far as B-24 needs it) and C-16. Every rule is class-wide; none names a ticker.

- **Owner decision: WACC tax rate (B-32).** Without a trailing rate, the latest annual effective rate (tax expense over pre-tax income) is used, with the basis stated. A trailing pre-tax loss, or an annual one when it is the basis, gets a 0% shield, disclosed. The existing 0–35% clamp still applies and is disclosed when it moves the rate. With neither a trailing nor an annual pair, the levered WACC is still withheld. On the SEC path, pre-tax income is the sum of its domestic and foreign components when no total is tagged, with the composition disclosed.
- **Owner decision: principal beside carrying debt (B-5).** A filed debt aggregate above the carrying components by up to 2% of them, or 50 million in the reporting currency, whichever is larger, is read as unamortized discount and issuance cost, and the components are admitted. The band is measured on the financing components (leases excluded), and the 50 million floor reaches at most 10% of them, so a small issuer's notes are never read as mostly discount. Beyond that band total and net debt are withheld with a gap naming both figures. Batch 1's 1% rule for a tagged carrying total (`uncomposedDebtReason`) is unchanged: that total is on the components' own basis, so only rounding can separate them, whereas a principal aggregate is on another basis.
- **Owner decision: vendor against filed figures (A-11).** A vendor figure and the filed figure for the same period agree when they differ by no more than one reporting unit (the largest power of ten up to a million dividing both) or 0.01% of the larger, whichever is wider. The reporting-unit allowance applies only when the larger figure is at least 100 units, so it never exceeds 1% of it. A zero against a nonzero figure gets no reporting-unit allowance. This judges two statements of one figure, so it is far narrower than the debt band.
- **Owner decision: D&A from separate lines (B-7).** With no combined tag for a period, D&A is `Depreciation` + `AmortizationOfIntangibleAssets`, else `Depreciation` alone, disclosed as a lower bound for the period. Amortization alone is never D&A. `Depreciation` alone is kept, not withheld: the two-line sum is itself a lower bound (a combined line can hold other amortization), and Alphabet tags amortization in some quarters only, so withholding the one-line form would drop its EBITDA for the quarters that lack it. The disclosure is in the data gaps and audit appendix; carrying it onto the EV/EBITDA row is left for a later batch.
- **Owner decision: market cap across share classes (B-8).** A cover that tags each class's count with a class member, every class at one date, establishes issuer-economic scope when the trading symbol is bound to one class and the filing states every class's economic relation (identical liquidation and dividend rights, or a stated fraction); an unparsed sentence stating a relative entitlement (a percent, multiple, fraction or priority) withholds it. Market cap is the sum over classes of count x economic units per quoted share x the quoted price, an approximation named in the basis; P/E, EV/EBITDA, P/B and the WACC weights use it. When a class in force on the price day carries a different weight, P/E is market cap over common income, not price over EPS. Otherwise the scope stays withheld. When it is withheld because the issuer has more than one common class on evidence in force on the price day, the Key data table shows issuer-common capitalization as withheld instead of the quote's market cap, and the market data table labels the quote's figure as possibly covering one share class; a scope unresolved for another reason (an ADR, a vendor cap on the quoted security) keeps the provider market cap labelled scope unverified. Per-share intrinsic value for weighted classes (B-37) is left for a later batch.
- **Owner decision: newer results (B-24).** When a results release was filed after the newest statement period and reports a later quarter (its latest stated quarter end more than 45 days later, or, with no end date or one exactly four quarters before its fiscal label's quarter, a later fiscal label), every surface shows a banner and the data gaps carry a warn entry. Its headline revenue and diluted EPS appear in Key data, labelled "unaudited, from the results release", only when every statement of each in its opening text agrees, revenue is the sentence-opening total (never a segment's), the figure's sentence names no adjusted or other non-GAAP basis, no loss and no full-year or year-to-date amount, and their currency is established: "US$", or "$" while the statements report in US dollars. They never enter statements, the TTM or valuation. Only a release stating a results amount counts; a deliveries or operational update, a dividend per share or an outlook (an outlook word before the amount or within 60 characters after it) does not. The notice cites the exhibit that states the results. Compact titles ("3Q26", "Q3 2026 Update") now date a release that has no ordinal title for its reported quarter (a guidance heading is not one) and no "quarter ended" sentence, and a hyphenated ordinal title ("second-quarter 2026") is read as a title (the part of B-26 this needs); ordering releases that state no period is left for a later batch. The 45-day margin is a project choice.
- **Owner decision: 10-Q supersession (C-16).** When the 10-Q is newer than the selected 10-K excerpts, the operating measures they state with a count (gigawatts, megawatts, backlog, customers, subscribers or paid members, physical units) are read, and the 10-Q MD&A passages stating the same measure are kept first within 15% of the unchanged 12,000-character budget; the excerpt title names the measures whose passages that step kept. A count ends in a digit or is a number word and is never a bare year; megawatt-hours and units of account are not operating counts. The 15% share is a project choice. The passages are selected, not compared.
- **Revised by D-134 (audit 2026-10-27 B13)**: A-11, for a derived SEC value only (Ruling B, FIN-511-V2): a vendor figure also agrees within its operands' rounding, capped at 1% of the larger figure; a directly filed value keeps the rule above. B-7 (OD-4, FIN-510): a combined D&A tag below the same period's `Depreciation` or `AmortizationOfIntangibleAssets` is not the D&A, so the next combined tag or the composition above serves, and D&A is withheld when no combined tag passes and no `Depreciation` is filed. See docs/METHODOLOGY.md "Vendor figure against the filed figure (A-11)" and "D&A from separate lines (B-7)".

Report 1.38.0, payload 1.43.0 and Stage B ACCOUNTING_EVIDENCE_20 mark these conventions. In the provider-free DEMO control only the spec version moves. Stored reports and snapshots keep their bytes. See the [disposition record](2026-10-22-audit-batch3a-priority-highs.md).

## D-104 - Audit batch 2b: the deferred valuation items: retirement and environmental obligations, the regulated-utility overlay, the issuer's own sales-to-capital, no WACC on equity-valued routes, KO's DCF and the composite's spread (2026-10-22)

The independent audit of 2026-10-22 found a DCF bridge without debt-like obligations, regulated utilities graded as distressed industrials, a sales-to-capital floor that doubled a utility's DCF, and a WACC and cost of debt printed on routes that never use them. Batch 2 deferred these Medium findings to this batch: E-7, B-13 with A-3, A-2, the financial-route cost of debt and WACC carried over from batch 1 (B-31), B-3 and B-33. Every rule is class-wide; none names a ticker.

- **Owner decision: retirement and environmental obligations (E-7).** The DCF equity bridge deducts filed asset-retirement obligations (`AssetRetirementObligation`, else noncurrent plus current) and environmental remediation accruals (`AccrualForEnvironmentalLossContingencies`, else noncurrent plus current) when they are tagged, and discloses each deduction; untagged issuers are unchanged. House conventions beside it: each is read at the bridge's balance date, else at the latest date in the year before it, with that date named on the bridge line, because many filers (FCX) tag them in the 10-K only; a current portion alone is not the obligation, and a balance filed as zero or an annual balance sheet that no longer tags it ends the look-back; funds legally restricted to settle the retirement obligations offset them, read at the same date and only beyond the long-term investments and marketable equity securities the bridge already adds, never below zero; the deduction is before tax and the retirement obligations' accretion already lowers NOPAT, both of which the bridge says overstate the claim. The undiscounted gross environmental tag is never read.
- **Owner decision: regulated utilities (B-13, A-3).** A regulated-utility overlay applies on the general route for SIC 4911, 4924, 4931, 4932 or 4941 with rate-regulated revenue or regulatory assets filed by the run date and ending within 24 months of it; the SIC alone does not apply it, and no base route moves. Its balance sheet is scored on the Standard Grid ranges of Moody's "Regulated Electric and Gas Utilities" (6 August 2024) for CFO before working capital / debt and debt / book capitalization, weighted two to one as Moody's weights them; the Moody's-grade-to-letter mapping is a house convention. Altman Z is withheld from quality and the forensic table with a route reason, and net debt / EBITDA, coverage, FCF conversion and SBC / FCF are not graded on that overlay.
- **Owner decision: the issuer's own sales-to-capital (A-2).** The 0.5 floor applies only when the issuer's own history does not establish a lower ratio: with at least three fiscal years of filed revenue and positive operating invested capital at the same date, the median of the newest five is the lower bound when it is below 0.5. The basis lists the years and ratios, or says why the house floor stands. The three-year minimum, the median and a 0.1 lower bound on the established ratio (below it, a scale error is assumed and the house floor stands) are project choices.
- **Owner decision: no WACC on equity-valued routes (B-31).** On the bank, insurer and mortgage-REIT routes, which value equity at the cost of equity, the WACC and the pre-tax cost of debt are withheld with an info gap saying why, and no per-fiscal-year WACC history is computed; the cost of equity is kept. The returns table's cost-of-equity row carries the reason, and neither withheld figure reaches the LLM payload, the exports or the company page. Fair values on those routes are unchanged.
- **KO's DCF (B-3).** Diagnosed, not changed. KO's −57% is the house calibration B-30 describes (risk-free 5.12% and ERP 4.18% with a 0.60 beta floor, a 2.5% terminal growth cap, a margin fading from 29.3% to its five-year median of 25.4%), not a defect: every cell of its WACC ± 2pp × terminal growth ± 1pp grid is below the price, and the reverse DCF needs 36.7% year-one growth. Batch 2's house base-rate line already states that pattern beside the headline.
- **The composite's spread (B-33).** Reported, not changed. On the 45-company panel the composite is D 17, C 26, B 2 (scores 40.3 to 80.8, median 56.3). A recalibration is proposed for the owner in the pull request and the disposition record; the bands stay 85/70/55/40.

Report 1.39.0, payload 1.44.0, Stage B ACCOUNTING_EVIDENCE_21 and score bands SCORE_BANDS_2026_10_REGULATED_UTILITY mark these conventions. In the provider-free DEMO control only the spec version and the score-bands stamp move. Stored reports and snapshots keep their bytes. See the [disposition record](2026-10-22-audit-batch2b-valuation-mediums.md).

## D-105 - Audit batch 3: stop withholding where the filed evidence is complete: a basic count for an untagged diluted count, the multi-class diluted count, equity-statement NCI, the average debt behind a refused balance, EBIT under a filed non-operating total, the cash chains, cash-flow recoveries, managed care and composed-debt leverage (2026-10-26)

The independent audit of 2026-10-22 found figures withheld although the filed evidence was complete. Batch 3a fixed the high-severity ones (B-32, B-5, A-11, the D&A composition of B-7, B-8 and the batch 1 carry-over); this batch fixes the rest of the list on the same code paths: B-35, the parts of B-7, B-8 and B-37 that 3a left, C-15, C-1, B-39, B-34 with B-43, C-13, E-6 and E-8. Every rule is class-wide; none names a ticker. Each withholds with a specific reason where its evidence is incomplete.

- **Owner decision: the average debt behind a refused balance (C-1).** A lease-scope refusal withholds only what it touches. On the newest balance outside the averaged pair, the debt weight uses the clean average, and the basis says why; on the TTM window's quarter-end pair, the average falls back to the latest two fiscal-year-end balances when both are present, carry total debt and are clean, and the basis names the pair not used; otherwise the quarter pair's refusal stands. The refused balance is never used, so the EV bridge at its date stays withheld, and a refused debt carrying total still withholds the WACC. When no average is established, the critical gap names the balance date and the cause. The lease test that pinned the whole WACC as withheld behind a refused newest balance now pins the WACC on the clean average, with the EV still withheld.
- **Owner decision: managed care (E-6).** SIC 6324 goes to the general map whatever its industry string or insurer-like tags say, with a note; the keyless label is Healthcare / Medical - Healthcare Plans. The forensic financial band (SIC 6000 to 6499 and 6700 to 6799) still includes 6324, unchanged, so a health plan's Altman Z, Beneish M-score and accruals ratio stay withheld and its Piotroski score uses the financial variant; whether managed care leaves that band is left for a later decision.
- **Owner decision: multi-class issuers (B-8, finished here).** Batch 3a computes issuer-economic market cap where the class relation is established and withholds it otherwise. The AI context's quote section now carries the report's caveat when the scope is unresolved.
- **House convention: a basic count for an untagged diluted count (B-35).** The combined basic-and-diluted share and EPS elements are read for both bases. When a period has no diluted weighted count but its basic and diluted EPS are filed, equal and for the basic count's interval, the basic count stands in, disclosed per period: dilution too small to move EPS at its reported rounding is not reflected, or, in a loss from continuing operations (the control number; net EPS only when no discontinued result is filed), potential shares are antidilutive and excluded.
- **House convention: the multi-class diluted count (B-37).** The filed diluted count is issuer-economic when the class scope is resolved, the same row's basic count matches the all-class economic total on one class's unit basis within 3% and within half the smallest class's share, and the row ends within 120 days of the class inventory. ADRs stay out of scope.
- **House convention: NCI from the quarter's equity statement (C-15).** The NCI column on `StatementEquityComponentsAxis` in the fetched primary document is admitted for a balance row with consolidated equity only when the filing's undimensioned consolidated total at that date equals the row's; another member's column, a disagreeing instant or an untied total is refused with a warning, a nil fact leaves its instant unread, and nothing is carried forward or inferred as zero.
- **House convention: EBIT under a filed non-operating total (B-39).** When the interest tag is a taxonomy child of the `NonoperatingIncomeExpense` aggregate the filer also tags, EBIT is pretax income less that aggregate, with the interest not added back. The nesting is taken as the filer's presentation, and the disclosure says that where an aggregate leaves its interest out the figure understates EBIT by that interest.
- **House convention: the cash chains (B-43, B-34).** `RestrictedCashCurrent` and `RestrictedCashNoncurrent` are read as the restrictions that turn a combined restricted-plus-unrestricted total into cash, both sides still required from one filing. A combined cash-and-short-term-investments total below the same filing's cash plus short-term investments is a narrower schedule, so the component sum is used, disclosed; a combined total above the components, or from another filing, or below them by no more than display rounding (one shared rounding unit or 0.01%), stands.
- **House convention: cash-flow recoveries (C-13).** With no roll-forward recovery pair, write-offs pair with `ProceedsFromRecoveriesOfLoanPreviouslyChargedOff` for the same fiscal year, unit and filing, and the basis says the recoveries come from the cash-flow statement.
- **House convention: composed-debt leverage (E-8).** Piotroski ΔLEVER compares a long-term debt composed from classes that may hold current notes when both years compose it from the same tags, and is withheld with both tag sets named when they differ; the comparison is by tag set because the provenance carries no value for each class. Beneish LVGI is unchanged.
- **The EV/EBITDA lower-bound caveat (B-7, finished here).** When any period behind the multiple's EBITDA has a composed D&A, the row's basis and its Key data line name those periods and say the multiple may read high; the own-history rank stays, because the history uses the same D&A.
- **Revised by D-134 (B13 OD-1 and FIN-508, audit 2026-10-27 FIN-507 and FIN-508)**: the B-39 convention also covers a period that files the aggregate and no interest element (pretax income less the aggregate, disclosed), and the nesting is read from the period: interest that any filing tags as `InterestExpenseNonoperating` for the period is not added back, whichever interest tag served the row. See docs/METHODOLOGY.md "Operating income when interest sits inside the non-operating total (B-39)".

Report 1.40.0, payload 1.45.0 and Stage B ACCOUNTING_EVIDENCE_22 mark these conventions. In the provider-free DEMO control only the spec version moves. Stored reports and snapshots keep their bytes. See the [disposition record](2026-10-22-audit-batch3-complete-evidence.md).

## D-106 - Fixes from the live five-company check: current debt securities in the keyless statements, and dated interval claims citing a filing fact (2026-10-26)

A live NVDA report run on merged main (GPT-6.1-Sol, high effort, 2026-10-26) and the live company page beside it surfaced two defects. Neither is ticker-specific.

- **Current debt securities (data).** NVIDIA's FY2026 10-K moved its marketable securities line from `MarketableSecuritiesCurrent` to `DebtSecuritiesCurrent`. The keyless statements did not read that element, so when FMP refused the statements (it rate-limited the key during the run) cash and short-term investments fell to cash alone. Invested capital rose by the whole securities balance (34,143 million at 2026-07-26), and sales-to-capital fell from the vendor path's 2.58 to 1.53 for the same balance sheet. `DebtSecuritiesCurrent` is now read last among the short-term investment elements, so a period that tags an element above it keeps that element. Equity securities are not added: the undivided `EquitySecuritiesFvNi` does not say whether a stake is current, so the remaining keyless difference (NVIDIA's 42,783 million of marketable equity stays in invested capital, where the vendor's combined total lets D-60 carry it as non-operating) is recorded, not guessed.
- **Dated interval claims citing a filing fact (verification).** D-82 admits an explicit `START to END` claim interval only when the cited record's period is `END`. Since D-88 (exact final evidence and interval presentation) the payload registers a filing-fact duration with the whole span as its period and a matching duration context, so every correct interval claim on such a record was counted as contradicted. NVDA report #1 had one: "Accounts receivable cash-flow contribution for 2026-01-26 to 2026-07-26 was negative USD 24.59 billion." against a record of −24.59 billion for exactly that span. The record's period may now be `END` or the whole span; the label span, the claim's single interval, the duration context and every other D-82 condition are unchanged. Rebuilding that run's payload from its stored input snapshot turns the claim from contradicted to validated.

Stage B ACCOUNTING_EVIDENCE_23, report 1.40.1 and pipeline stage-c-1.6.2 mark these conventions; payload 1.45.0 is unchanged. Stored reports and snapshots keep their bytes.

## D-107 - Readable figures in the reader notes (2026-10-26)

The live NVDA check (D-106) also found reader text that printed raw source units: the EV bridge note read "excluding 42783000000 of marketable equity securities ... EV excluding the operating-lease liability 5156250780000; EV as reported 5161744780000", the multiples note's issuer-common headline printed "119996000 economic shares ... capitalization 34672844200 USD", and the sensitivity grid's guard note said its cells were "rendered null".

- **Grouped digits, not rounding.** Those amounts and counts now print with grouped digits ("42,783,000,000", "119,996,000"), at the same two-decimal precision as before. A compact form ("42.78B", "120M") was tried and rejected: it rounded 119,996,000 economic shares to 120M, and the exact figures are what the share-class and bridge tests pin. Every value is unchanged; only its digits are grouped.
- **The grid guard note** says the cells are "withheld and shown as —", which is what the grid shows.
- **The EV bridge note reaches the model's payload** (the valuation notes and each EV multiple's basis), so payload 1.46.0 marks it; in the pinned Stage C fixture the prompt grows by the sixteen grouping commas of one EV printed four times, and no provenance record, citation or value moves. Stage B ACCOUNTING_EVIDENCE_24 and report 1.40.2 mark the wording.
- **Not changed: keyless marketable equity (D-106).** Treating `EquitySecuritiesFvNi` as non-operating on the keyless path was considered and left out: companyfacts does not say whether an undivided stake is current or already inside a long-term investments line, so a rule could count it twice. The difference to the vendor path stays disclosed in METHODOLOGY.

Stored reports and snapshots keep their bytes.

## D-108 - Net income attributable to the parent when NetIncomeLoss is not filed (2026-10-26)

Audit 2026-10-22 B-18 (Medium). The keyless netIncome chain is `NetIncomeLoss`, then consolidated `ProfitLoss`, then the amount available to common. Freeport-McMoRan files no `NetIncomeLoss` in its 10-K/10-Q facts, so every annual row from 2016 and most quarters resolved to `ProfitLoss`, which includes the noncontrolling interests' share. Net income, net margin and the DuPont ROE carried it: FY2025 4,152 million against 2,204 million to the parent, and ROE 22.8% against about 12%, set against a parent-only equity denominator and beside the report's own 12.4% return on tangible common equity. The TTM mixed one `NetIncomeLoss` quarter with three `ProfitLoss` quarters, so P/E was withheld as an inconsistent ownership basis.

- **The parent figure is derived by the taxonomy's calculation.** After `NetIncomeLoss`, the chain takes `ProfitLoss` less `NetIncomeLossAttributableToNoncontrollingInterest` for the same period, each resolved (and, for a quarter, derived) on its own tag. The step is disclosed as a substitution for every period it serves. Without an NCI tag for the period the chain falls to consolidated profit as before, whose basis stays "consolidated" and whose NCI deduction Stage B already makes.
- **Stage B reads it as parent income.** The ownership basis was inferred from the netIncome tags, and `ProfitLoss` among them meant "consolidated", which would have deducted the NCI share a second time. A figure whose tags carry both `ProfitLoss` and the NCI tag is now "parent".
- **Unchanged:** the consolidated-profit field, the cash-flow statement's net income (it starts from consolidated profit), the vendor path, and REIT FFO's own net-income read.
- Stage B ACCOUNTING_EVIDENCE_25 marks the change; the report spec and payload do not move.
- **Control panel** (45 audited companies, keyless and offline against the audit's cached data behind a dead proxy, clock pinned to 2026-10-22T06:00Z; base `7f5221d`, head this change; both sides 45 of 45 done). Every moved figure is intended:
  - FCX: TTM net income 4,183 million → 2,945 million (the oracle's parent figure); FY2025 DuPont ROE 22.76% → 12.08% and net margin 16.02% → 8.50% (the audit's parent figures); P/E (TTM) is now produced, 33.6× on parent income, where it was withheld as a mixed ownership basis, so that warning is gone; composite 54.47 → 53.63.
  - AMT: composite 52.77 → 52.84 (parent income on the quarters that lacked NetIncomeLoss).
  - MA: the P/E basis now reads "parent income"; its NCI income is a few million, and the withheld P/E is unchanged.
  - No other company, column or gap family moves; no new withhold or gap.

Stored reports and snapshots keep their bytes.

## D-109 - A per-share basis named in a claim's metric words (2026-10-26)

The live MSFT check of 2026-10-26 (report #47, ChatGPT 6.1 Sol High, keyless) traced 270 of 270 figures and counted one claim as contradicted: "Our DCF per share as of 2026-10-26 is USD 320.63." It cites the DCF per-share record, whose value is USD 320.63 per share, so the claim is right. The verifier reads "USD 320.63" as a currency amount because "per share" is not written after the figure, and a currency amount set against a per-share record was a unit contradiction. The D-66 rule already treats "per share" as the record's unit, not a metric word, but only where it follows the figure.

- **The per-share basis may be named in the metric words.** When the record is per share, the prose figure is a currency amount and the claim's metric words say "per share", the figure is read in the record's per-share unit, and its value is then checked as usual: USD 320.63 validates, and USD 330.63 or a total in billions is still contradicted.
- **Unchanged:** a currency figure whose words do not say "per share" is still not read as per share, and a total record never takes the per-share reading.
- Report spec 1.40.3 and pipeline stage-c-1.6.3 mark the verifier change; Stage B and the payload do not move.

Stored reports and snapshots keep their bytes.

## D-110 - Audit batch 5: make the trust signals mean what they say: "contradicted" for value conflicts only, the numeric validation share first, a status mark on each claim, "computed" for a data-only report's figures, and JUDGMENT for code-written method notes (2026-10-26)

The 2026-10-22 audit found that the report's trust signals overstated what had been checked. The owner set each convention below on 2026-10-26.

- **Contradicted means a value conflict (F-22).** A stated amount outside its cited figure's rounding interval, or a direction word against the sign of its cited change, is contradicted. A period, unit or currency the cited record does not establish is a metadata gap: the claim or figure is "unverified (period or unit not established)", never contradicted. A direction conflict outranks a period or unit failure on the same claim. The period-word and unit-word failures stay in the verification log and the missing-data manifest. A stored report is read under the same rule; its bytes do not change. A legacy entry kept only its first failure, so whether its value also conflicted cannot be rechecked: it reads unverified, the reading that claims no more than was checked, and the audit export says "value not rechecked".
- **Lead with the numeric validation share (B-10).** The verification line opens with numeric claims matched to a cited figure (n/N and a percentage), then contradicted and qualitative counts. The share of figures traced to a cited source and of factual claims carrying a citation moves to a separate Provenance line, because a citation is provenance, not validation.
- **A status on every factual claim (F-21).** Each FACT or ESTIMATE claim the verify pass logged carries `[validated]`, `[unverified]`, `[contradicted]` or `[qualitative]` after its citation in the page (both layouts), the Markdown and the print report. The header counts are counts of those marked claims: grade-strip reasoning, which no surface prints, stays in the log but out of the counts, and the audit export says how many were left out. A removed log entry marks and counts nothing; a claim the legacy entity check withholds on read leaves the counts at the status it was recorded with.
- **"computed", not ✓, on a data-only report (F-23).** No citation-check pass runs on a data-only report, so its figures print "computed" under Cited and beside each figure, with a legend under the first table that uses the column. The stored `verified` value is unchanged, because the enterprise-value and debt checks read it.
- **Code-written method notes are JUDGMENT (F-20).** The capital grading basis, the debt-bridge convention, the HEURISTIC maintenance-capex and buyback-price notes, the price-versus-repurchase-proxy comparison, each aspect's score-to-band sentence and the data-gap notes carry JUDGMENT, the label the shared prompt rule gives methodology, data-gap and coverage statements. Computed-figure sentences stay FACT. A METHOD label was not added: the label set is the model's structured-output schema, so a new value would change the contract every pass and stored report is validated against.

No figure changes. Report 1.41.0 and pipeline stage-c-1.6.4 mark these conventions; payload 1.46.0 and Stage B ACCOUNTING_EVIDENCE_25 (D-108) are unchanged by this batch. Stored reports and snapshots keep their bytes.

## D-111 - Audit batch 6: degrade visibly when providers fail: a FRED HTML page as an outage, the risk-free rate's fallback order, the degraded-inputs note, the provider-fallback line, a plan connection held by another server, and kept sections checked before they are kept (2026-10-26)

The independent audit of 2026-10-22 found that a provider failure could change a report without the reader being told, or could cost a run more than it needed to. This batch fixes B-1, B-4, F-13, F-1, F-12 and D-3. The Low items on the same code paths (D-4, F-16, F-15, F-18, F-17 and F-14) are postponed by the owner. Every rule is class-wide; none names a ticker.

- **A FRED HTML page is an outage (B-1).** Neither the FRED API nor `fredgraph.csv` returns HTML as data, so an HTTP 200 whose body opens with `<` is retried like a 503. The body decides, not the content type, so a good CSV that an edge labels `text/html` is still read as data. After the retries, the keyed API falls back to `fredgraph.csv`. The gap says "returned a maintenance/HTML page (HTTP 200)", or names the St. Louis Fed site-maintenance page, and never quotes the page.
- **Owner decision: the risk-free rate's fallback order (B-4).**
  1. FRED `DGS10`, keyed, then `fredgraph.csv`.
  2. FMP treasury rates, `year10`.
  3. The last good cached `DGS10` observation, if it is at most 10 business days old.
  4. The 10 Yr point of the U.S. Treasury daily par yield curve (`home.treasury.gov`; no key or identity is sent). The previous year's file is read only in January, when the current year's can still be missing or empty; at other times its last rate would be months old.

  The WACC line names the source and its observation date, and a `riskFree.substitution` entry says which source stood in and why. The AI context cites the series actually used. With every source down, the WACC is withheld as before. The two fallback sources run only when the first two gave no value.
- **Owner decision: the degraded-inputs note (F-13).** `fairValue.reasons` carries one "Degraded inputs: …" entry beside the headline value when any of these holds:
  - the risk-free rate is not FRED `DGS10`;
  - on the DCF route, the ROIC-vs-WACC history had no `DGS10` observation at all, so every fiscal year was compared to the current WACC, and the terminal ROIC rule read that comparison;
  - the keyless layer served a statement, the quote or prices the value reads after an FMP refusal (the sector ETF prices and the shares float feed no fair value and are not named here);
  - the analyst-consensus growth method was dropped because the estimates were refused.

  It prints under the headline in both layouts, in the Key data note, the Markdown and print exports, the data-only verdict and the AI context. A keyless-by-configuration run carries none, because its substitutions are the plan's design. Neither does a member the key's subscription never serves: FMP already marks that refusal `expected`, and its keyless stand-in is now `expected` too, so an entry-tier key's healthy run shows no outage. A quota or outage refusal stays unexpected. Peers do not feed the headline value, so a dropped peer set is not named there.
- **Owner decision: the provider-fallback line (F-1).** One "Provider fallback · …" line names each FMP member that SEC EDGAR, Yahoo or filed-fact computation served after an FMP refusal, and the risk-free rate's stand-in with its observation date, in a fixed order. It appears:
  - in the saved-snapshot header, in both layouts;
  - under the classic header;
  - at the head of the Markdown, audit and print exports;
  - in the AI context, which is told never to attribute a substituted figure to FMP or FRED `DGS10`.

  A keyless-by-configuration run shows none, nor does a member the key's subscription never serves.
- **A plan connection held by another server (F-12).** A job on a ChatGPT or Gemini plan connection claims the AI runtime at the start of the fetch step. If another Metis server owns it, the job ends in that one attempt, before any data is fetched. A pass refused mid-run gives the same reason and is not retried as a dropped connection. Both name the OPERATIONS troubleshooting row "AI store is held by another server". A signed-out connection runs no pass, so it claims nothing and still ends in a data-only report. A busy credentials lock is unchanged.
- **Kept sections are checked before they are kept (D-3).** When a bull, bear or judge response is cut off, each top-level section it finished is normalized as the whole parse normalizes it. It is then checked alone against its own sub-schema and the rating-safety walk; a key the schema lacks also fails. A failing section is dropped, the retry is asked to write it again, and the step detail names it. On a plan connection that writes in parts, sections reloaded from the run's section checkpoint get the same check. Before, a kept section that parsed but did not match its schema made the merged output fail whatever the retry returned.

Report 1.42.0, payload 1.47.0, pipeline stage-c-1.6.5 and Stage B ACCOUNTING_EVIDENCE_26 mark these conventions. In the provider-free DEMO control, `fairValue.reasons` gains the degraded-inputs entry for its FMP treasury rate and its current-WACC-only ROIC-vs-WACC history, and the spec version moves; no figure moves. Stored reports and snapshots keep their bytes. See the [disposition record](2026-10-22-audit-batch6-provider-failures.md).

## D-112 - Audit batch 4: freshness and the earnings window: undated releases, a newer release's currency, 10-Qs companyfacts lags, multiple labels by period, continuing-operations EPS and a TTM across a reorganisation (2026-10-26)

The independent audit of 2026-10-22 found reports that ended a quarter or two before what the issuer had already filed, or that read its newest results release wrongly. Batch 3a fixed B-24 (the newer-results notice) and C-16 (the 10-Q supersession pass); this batch fixes the rest: B-26, B-27, B-23, B-9 with B-20, B-36 in part and FCX-4. Every rule is class-wide; none names a ticker. Each withholds with a specific reason where its evidence is incomplete.

- **Owner decision: 10-Qs that companyfacts lags (B-23).** When the newer 10-Q's XBRL instance is already fetched, its consolidated, undimensioned facts in the taxonomies companyfacts publishes (us-gaap, srt, dei, ifrs-full), for the filer's own CIK, are merged into the companyfacts payload before the statements are built, each point carrying the 10-Q's accession, form, filing date and fiscal focus. A filing companyfacts already carries, or one filed no later than its newest periodic report, is never merged, so a row never mixes bases; a fact stated twice at one precision with different values is dropped. Where a newer 10-Q, 10-K, 20-F or 40-F was filed but its facts could not be read, a "Newer filing not reflected" banner and a warn gap name the filing and its date, with the newer-results notice's 45-day allowance.
- **Owner decision: multiple labels by period (B-9, B-20).** Each multiple records the period its earnings cover ("TTM to 2026-06-30" or "FY2025"); the label follows it in the multiples table, Key data and the exports ("P/E (FY2025)"), and TTM labels are unchanged; in the AI payload a fiscal-year multiple names its year in its label ("P/E (current, FY2025)"), and a TTM record is unchanged. EBITDA adds the cash-flow statement's D&A only on the operating income's own period (beside a fiscal-year operating income, the annual cash-flow row of that year, even when the cash-flow slice is TTM); otherwise EV/EBITDA is withheld with both periods named. The P/E basis names only the formula that produced the figure, and when it is market cap over common income it says why diluted EPS was not used; Key data notes "market cap / common income, not price / diluted EPS" beside such a P/E.
- **Owner decision: release ordering (B-26).** A results release that states no period goes before the first dated release filed no later than it; dated releases keep period order. For the four releases kept, a results release outranks an operational update, so the kept set covers a year of results when enough were read. This can change which 8-K is newest among those kept (Freeport-McMoRan's 2026-10-02 operational update is no longer kept).
- **Owner decision: a newer release's currency (B-27).** A release reporting a quarter no statement row covers, or stating no quarter end, reports in the statements' currency when every income row since before its period is established in that one currency. A history in more than one currency, or an unlabelled row at the release's own quarter, still withholds, and the note says the currency is not established.
- **Owner decision: a scenario fan that does not bracket its base.** Where faster growth needs reinvestment that earns less than it costs and slower growth releases none (reinvestment floors at zero), bull and bear both land below the base. Such a fan, judged on the two-decimal values the report shows, is withheld with both values named, rather than publishing a "bear – bull" range that excludes the fair value.
- **Owner decision: continuing-operations EPS (FCX-4).** When no net-income EPS is tagged for a period and no discontinued result is filed for it, in dollars or per share, the filer's EPS from continuing operations stands in (net EPS is continuing plus discontinued EPS, ASC 260-10-45-3), with its own provenance and a substitution disclosure. A discontinued result filed under any of the elements filers use, each read on its own, even one withheld from the row, keeps EPS empty. A fourth-quarter diluted EPS is still never derived from it.
- **Owner decision: a TTM across a reorganisation (B-36).** When a successor's own filing re-presents at least one predecessor net income and at least one per-share figure, and every re-presented net-income and per-share comparative agrees with the predecessor's (within 0.5 and 0.005; EPS compared by role, basic and diluted, so a combined basic-and-diluted tag meets separate tags), the two are one reporting entity on one share basis: the predecessor rows name the successor as their economic issuer and the TTM may span the reorganisation, with the matched periods named in the predecessor disclosure. Without that evidence the TTM is still refused. A successor's no-annual-report gaps name a resolved predecessor. Reading the predecessor's 10-K for Item 1A, MD&A and notes is left for later: it needs live SEC requests and an identity design for the 10-K parsers, which bind their evidence to the registrant's own CIK.

Report 1.43.0, payload 1.48.0 and Stage B ACCOUNTING_EVIDENCE_27 mark these conventions; pipeline stage-c-1.6.5 is unchanged. Stored reports and snapshots keep their bytes. See the [disposition record](2026-10-22-audit-batch4-freshness.md).

## D-113 - Fixes from the NVDA report review: an empty analyst case repaired, the projection fan in time order, a repaired step's cost, quote freshness between sessions and EDGAR notes (2026-10-26)

A review of NVDA report #48 (Opus 5.5, medium effort, 2026-10-26) found five defects. Each fix is class-wide; none names a ticker.

- **An empty analyst case is repaired.** The bull returned one thesis claim, no drivers, risks, catalysts or evidence, and a price target of 0 with no horizon (2,410 output tokens). The schema checks shape only, so the case was stored as a success and every debate card read "Not addressed by the bull case". Options: a minimum size in the Zod schema (stored artifacts and old reports would stop parsing, and the request grammar would change), validation against the source registry at parse time (web-fetched URLs are only known after the run, and every invented ID would cost a repair), or a content check at the pass parse. Choice: the pass parse rejects a case with an empty `thesis`, `keyDrivers` or `risksToCase`, or a price target without a positive value and a horizon, as a schema failure, so the existing single repair runs with a reason naming each gap. Catalysts and evidence may be empty. A section kept from a cut-off response that is empty in the same way is asked for again. Stored artifacts and reports parse as before. Of the 15 analyst cases in the owner's database, only this one fails the check. A placeholder `sourceId` in an otherwise complete case is still dropped by verification as an unknown source.
- **The projection fan is drawn in time order.** Rows were sorted as strings, and "12M ending 2027-07-26" sorts before "FY2023", so history sat to the right of the forecast and the x labels ran together. Periods now sort by the date they end (a bare fiscal year at its year's end, `Y+n` after every dated period). The axis prints short labels with the full period in the tooltip, thinned to every second or third one when the set would not fit a two-column or phone chart (Recharts measures tick text without its font family, so its own collision check missed the monospace labels), steps the value axis by 1, 2, 2.5 or 5 × 10ⁿ, and labels each tick exactly; whole units had printed 1.5T and 2T both as "2T". The payload and the report bytes are unchanged: forward-only point lists were already in order.
- **A repaired step states its whole cost.** The step row carries the cost of every settled attempt ($0.5784 for NVDA's bear), but its detail named only the last attempt's ($0.2817). When more than one attempt of a step has settled, the settlement now writes the detail from the step's summed cost and attempt count, in the same transaction that sums them.
- **A quote stays fresh between sessions.** Six quotes fetched at 22:44 UTC were reused at 23:06 and marked "served past cache TTL", although the market closed at 20:00 UTC and no newer price existed. Quote-priced rows keep the 15-minute TTL during the US regular session; between sessions a row fetched at least 30 minutes after the last 16:00 New York close stays fresh until the next open, with daylight saving followed. Exchange holidays and early closes are not modelled, so those days fall back to the plain TTL, never a longer one. The app quotes US listings, so one session clock serves every symbol.
- **An EDGAR note is not an EDGAR outage.** The report's only EDGAR entry was an info note, "No unique matched annual geography revenue table", yet it recorded `edgar: "missing"` and provisional forensics beside 15 retained EDGAR sources, and the page read "EDGAR partial" (D-76). Only warn and critical EDGAR entries now mark EDGAR missing. A stored report is confirmed against the rule it was written under and never rewritten, so its display is unchanged.

Report 1.44.0 and pipeline stage-c-1.6.6 mark these conventions; payload 1.48.0 and Stage B ACCOUNTING_EVIDENCE_27 are unchanged. The DEMO control moves only its report stamp (group `nvda48-report-issues-20261026`). Stored reports and snapshots keep their bytes.

## D-114 - A blank source ID is read as absent, and a side waiting for its repair is not shown as an error (2026-10-26)

All four Claude first attempts of NVDA reports #48 and #49 (2026-10-26) were rejected because claims or numbers carried `sourceId: ""`. Run #49 paid $0.47 for the two rejected attempts, and its run panel showed the bear as ERROR while its repair was still to come, with the raw Zod issue array printed on the bull row.

- **A blank `sourceId`.** The request schema lists `sourceId` as required while the report schema requires at least one character, so the model filled the field with "" whenever it had no registry ID. Options: make the field nullable in the request (changes the request grammar and every stored artifact's parse), tell the model in the prompt (it already says to copy the exact source ID into `source`/`sourceId`, and four of four attempts still sent ""), or drop a blank value before the parse. Choice: `dropBlankSourceIds` removes a blank or whitespace `sourceId` before the analyst and judge parses, so the claim cites its `source`, as `citationSourceId` already does for a claim without the field. A claim whose `source` is blank too still fails, and a non-blank invented ID is still dropped by verification as an unknown source.
- **The run panel while a repair waits.** A pass settles its rejected output before the runner knows whether the sibling can continue, and the settlement marked the step "error". Choice: a first attempt whose output was received and rejected settles with its step kept "running" (no finish time) under a plain note ending "repair queued". The repair's start replaces it. A run that gives up closes the step as an error with the reason in place of "repair queued". `plainRejectionNote` lists up to three failing fields in words; the full error stays the model's repair feedback and stays on the pass artifact. Transport retries are unchanged.

Pipeline stage-c-1.6.7 marks these conventions; report 1.44.0, payload 1.48.0 and Stage B ACCOUNTING_EVIDENCE_27 are unchanged. Stored reports and artifacts keep their bytes.

## D-115 - Repair note follow-ups: cut details, failed repairs, the judge, report reasons and dropped connections (2026-10-27)

An audit of PR #64 (D-114), run against its head with probe tests, found that the change only partly met its goal of no Zod array on the run panel. Verifying its findings turned up the same array in two more places.

- **A cut detail.** `serializePassFailure` stores at most 4,096 characters of a failure's detail, and the queued note read that copy. A rejection with about 15 or more issues no longer parsed as a whole, so the note printed the first 200 characters of raw JSON. Choice: `zodIssueList` reads the list object by object up to its own closing bracket. A cut list yields "N or more fields failed the schema: …". Text after the list no longer defeats the read (it had used the last `]` in the text).
- **A repair rejected again** closed its row with the pass's own message ("schema-invalid structured output for llm.bull"), naming no field. A recovery attempt's settlement now writes "<side> attempt 2/2 rejected (…)". The runner's fallback settlement of a thrown attempt keeps the error's kind, so its discarded-attempt disclosure names the right reason.
- **The judge and the report.** The judge's retry and final rows printed the full validation text, array included. A failed bull, bear or judge pass wrote it into a data-only report's missing-data reason. `withPlainIssueList` keeps the text around the array and puts the array in words. A custom rule's message appears only on the run panel: the date rule quotes the rejected value, and the rating rule names the words the report's own gate bans. The model's repair feedback keeps the full text.
- **A dropped connection** is retryable too, and the runner's fallback settlement marked it so. Its waiting row read "rejected …; repair queued" with a count of 1/2 where a plan connection makes four tries. Only failure kinds "schema" and "parse" are queued; a dropped connection keeps its retry wording, as D-114 intended.
- **Smaller items.** A null `sourceId` is dropped like a blank one, since the judge's schema is not enforced as a grammar. The request-schema comment on `sourceId` now says a blank value is read as absent. A retry that kept no sections no longer prints "(kept: )". A gap-list note is capped at 200 characters like the others.

Not changed: a blank ID still falls back to the claim's `source` instead of costing a repair (D-114). The audit's alternative, a repair that might produce a registry ID, costs a paid attempt to fix what verification already handles. A display-style `source` is still flagged by verification as an unknown source. The unreachable `repaired === null` guard stays, because it narrows the type.

Pipeline stage-c-1.6.8 marks these conventions; report 1.44.0, payload 1.48.0 and Stage B ACCOUNTING_EVIDENCE_27 are unchanged. Stored reports and artifacts keep their bytes.

## D-116 - A kept section keeps its writer: a resumed plan pass names its model, and an attempt whose sections were kept is not called thrown away (2026-10-27)

NVDA report #50 (GPT-6.1 Sol, max reasoning, ChatGPT plan, 2026-10-27).

- **What happened.** The judge's first attempt sent one request. The plan endpoint closed its stream at 15 minutes, after the verdict section was complete.
  - The attempt's artifact records the observed model gpt-6.1-sol and max reasoning. It has no usage or service tier, since those arrive with the completion event.
  - The retry kept the verdict word for word and wrote the other twelve sections in five requests. Each reported gpt-6.1-sol, max reasoning, the default speed and its usage: 744,102 input and 99,406 output tokens in all.
- **What the report said.** D-70 treats a reused section as having no known writer. So the run details named synthesis's model "unknown" and left out its tokens. They said "the provider did not report which model executed the request" and "Provider usage was not reported", and both were false.
  - With the judge's family unknown, the same-family sentence (D-20) was missing.
  - The cost breakdown read "unknown (requested chatgpt/gpt-6.1-sol)".
  - The first attempt's missing-data entry said its "rejected output is excluded from this report", although its verdict was in the report. Its reason only restated the failure ("because the attempt did not produce a usable result").
- **Options.**
  - (a) Keep D-70's rule and only reword the notes. The model stays unknown although the evidence exists.
  - (b) Take an earlier attempt's artifact as the writer of every kept section. But a kept section can come from any earlier attempt or a restarted worker, and an artifact does not say which sections its requests wrote.
  - (c) Save the writer's evidence beside each section in the checkpoint, bound to the section's text, and fold it into the pass's evidence.
- **Choice: (c).**
  - **What the checkpoint saves.** Beside each completed section it saves the model and execution evidence of the request that wrote it, and the SHA-256 of the section's JSON.
    - A section streamed before its request ends gets that request's evidence when the request finishes or fails. A worker that dies mid-stream leaves it without evidence.
    - A section the job runner carries in uses the evidence saved for exactly its text.
  - **Model, effort and speed.** These are established across this attempt's requests and every kept section's writer, the way D-70 aggregates section requests. A kept section with no saved evidence, or whose writer reported no model, leaves them unestablished for the whole pass, as before. Requested settings stay the attempt's own.
  - **Usage.** Usage stays the attempt's own: the tokens and `usageReported` cover the requests this attempt sent. A kept section's request is recorded with its own attempt.
  - **Run details.** They name the kept sections and say the token counts cover only this attempt's requests. When the writer's evidence records no usage, they say so. A model withheld because of a kept section names that section, not the provider.
  - **Storage.** `carriedSections` on the execution evidence keeps all of this through storage: the section, its digest, and the writer's observed-model and usage flags when they were saved.
  - **Discarded-attempt disclosure.** It joins a failed attempt to the final output by digest. When the attempt's sections reached the report, it says so: "The completed section it held when it stopped (verdict) was kept and appears in this report; the remaining sections were requested again." The attempt's cost row is then not marked discarded.
  - **Transport failures.** The reason now reads "the provider request failed before a usable response arrived".
  - **Compatibility.** Checkpoints and artifacts written before this change carry no evidence, so they keep D-70's withholding. An older build still reads a checkpoint saved by this one, because the evidence is an extra field.
- **Limits.**
  - The evidence is local recovery data, not a provider receipt (D-70).
  - A digest match proves the text is the same, not which attempt wrote it, so the disclosure says the attempt "held" the section.
  - With `THESIS_JUDGE_ORDER=both`, the mirrored request carries the same kept sections but loads no evidence for them from the primary's checkpoint. Such a pass stays unestablished, and its note says the model "could not be established" instead of blaming the provider.
- **Validation.** Failing-first tests cover:
  - the checkpoint evidence;
  - #50's sequence: a cut-off first request, then a resumed attempt;
  - a carried section with matching and with altered text;
  - the run-detail notes and the same-family sentence;
  - the discarded-attempt disclosure and cost rows.

Pipeline stage-c-1.6.9 marks these conventions. Report 1.44.0, payload 1.48.0 and Stage B ACCOUNTING_EVIDENCE_27 are unchanged. Stored reports and artifacts keep their bytes, #50's included.

## D-117 - A failed paid request settles at the worst case given what it reported, and a request that never left the machine settles at nothing (2026-10-28)

Audit 2026-10-27, batch B7 (AI-113, AI-113-V1, AI-114, AI-307).

- **What happened.** The two failure catches in the Claude adapter (the first request and a `pause_turn` resumption) each decided what a failed request cost, and they decided differently.
  - A stream that died after `message_start` was recorded as an `actual` row at about one output token, because the cumulative output count arrives only in the final `message_delta`. The idle guard presumed the remainder for the same wire state.
  - A request the provider had answered and the caller then cancelled was released at $0, while a socket death in the same state was presumed.
  - A pass result left out the settlement of a failed pause resumption.
  - A connect timeout was read by the SDK as a request that was sent and then lost, so it was presumed at the request maximum on every attempt. The audit's probe measured $315.84 presumed on one Opus 5.5 bull pass (six attempts at $52.64) for requests Anthropic never received.
- **Options.**
  - (a) Keep two catches and fix each case where it stands. The same wire state then settles different figures depending on which catch saw it.
  - (b) One classifier for both catches, ordered by what the request is known to have reached.
- **Choice: (b).**
  - A stream the idle guard abandoned, or one that reported usage but ended before its final usage event (whatever ended it), settles at its reported usage plus the presumed remainder: the unreported output at the model's output price, or the request maximum when the request carries web-search or server-fallback exposure. It is marked `presumed`.
  - A stream whose final usage event arrived settles at that usage, `actual`, and the pass result says the same: a caller abort after that event is reported as an abort with an actual charge, not as a presumed remainder.
  - With no usage reported, a request the provider had answered and the caller then cancelled, or one that went out and then timed out or lost its connection, is presumed at the request maximum.
  - A request that never reached the provider (connect timeout, refused connection, name lookup failure, an unreachable host or network at connect) is released at $0. A fetch wrapper installed with the client tags these failures before the SDK can read them as a timeout.
  - A pass result is the sum of its requests' settlements, failed pause resumptions included, in both reservation modes.
  - The idle guard's no-usage figure rises from the output remainder to the request maximum, so one wire state settles one figure whichever of the idle guard, the caller or the network ended it. This follows the rule that a paid cost is overstated rather than understated: an overstated presumption is visible and lowered by `costs:reconcile`, an understated one breaks the caps. The main session confirmed the raise on 2026-10-28 (decisions spec 4.3, B7). It is reversed by making `abandonedRequestCostUsd` return the output remainder again when nothing was reported (its `reported === null` branch).
- **Revises.** D-09 ("a dead stream settles the usage reported so far plus the worst case for the remainder") now covers every cause, not only the idle guard. It extends D-10 ("a request that times out after send is presumed spent until reconciled") and applies D-07's rule that presumed spend over-counts until reconciled.
- **Limits.**
  - A non-timeout connection failure before the response headers (for example ECONNRESET on an established socket) is released at $0, as it was before this batch. Only a request that timed out after it was sent, a stream lost after the headers, or a request answered and then cancelled is presumed. This is AI-307's purpose: a network blip must not book a presumed request maximum. `costs:reconcile` lowers presumed rows only, so a provider charge for such a request would be under-recorded until noticed.
  - An abort in the microtask gap between the connection opening and the response headers is released; a timer-driven abort (a stage deadline, a cancel) is unlikely to land there. Node's `fetch` does not report when the request body finished sending.
  - A server `error` event after HTTP 200 but before `message_start` is released, as an HTTP error status is: no response had started. The classifier reads the error text for one case: an error whose message contains "timeout" or "timed out" is read as a timeout after send and presumed at the request maximum, so the same wire state can settle $0 or the maximum depending on the provider's wording.
  - The stream-idle timer starts before the connection opens, so an idle limit below the connect timeout (about 10 seconds) presumes a hung connect at the request maximum. The idle limit is `METIS_STREAM_IDLE_SECONDS` (default 300) times the effort multiplier: 1 at low and medium, 2 at high, 3 at xhigh, 4 at max, and 1 for a model without effort.
  - Two rare cases are carried to batch 8, which changes the same adapter. (a) When the charge at the final usage event is itself presumed (a reported model the registry does not know, or a refusal with no output and no category), the pass detail still describes a presumed remainder; the flag and the figure are right. (b) With a reported model the registry does not know, an abandoned stream adds the output remainder to a figure already at the request maximum, so it over-counts by up to one output remainder (an over-count, never an under-count).
  - EHOSTUNREACH and ENETUNREACH count as never sent only from the connect syscall. ETIMEDOUT counts only from the connect or name-lookup syscalls. The same codes from another syscall happen after the send and are not tagged; they fall under the first limit above.
  - The SDK maps its own request timer to a timeout error; a test through the real client pins that a timer abort stays presumed.
- **Validation.** Failing-first tests in `tests/anthropic.test.ts` and `tests/requestAdmission.test.ts` use the real SDK with an in-memory `fetch` and a temporary scheduler database:
  - a stream cut after `message_start` is presumed, including inside a `pause_turn` resumption, and a search-capable request keeps the request maximum;
  - a final usage event followed by a dead socket settles the reported usage;
  - an idle stream with no reported usage is presumed at the request maximum;
  - a pass result counts a failed pause resumption in request mode and settles the same figures in pass mode, with a control that a single clean request equals its one settlement;
  - an abort after the provider answered but before `message_start` is presumed, with controls that a socket death in the same state settles the same figure and an abort before dispatch is released;
  - every connect-phase failure is released on every attempt, with controls for a headers timeout and the SDK request timeout (presumed), a connect-syscall route failure carrying a timeout-shaped message (released) and the connect-syscall rule of the tagging predicate.

## D-118 - A contended ledger write keeps the completed response (2026-10-28)

Audit 2026-10-27, batch B7 (AI-308).

- **What happened.** A finished paid response whose cost record met another process's database writer lock (SQLITE_BUSY) threw the whole pass away, although the provider had already billed it.
- **Options.**
  - (a) Let the error propagate, as before.
  - (b) Retry the write briefly, then keep the response and let the lease be presumed at expiry (D-07).
- **Choice: (b).**
  - The runner maps writer-lock contention to `RequestSettlementNotRecordedError`. Only the SQLITE_BUSY family (`isTransientWriterLock`: SQLITE_BUSY and its extended codes, searched along the cause chain) is retried.
  - The provider retries the write three times, waiting 250, 1,000 and 4,000 ms (5.25 seconds in all) on top of the database's own busy timeout on each try. Every request settlement, a completed request's and a failed one's, goes through this retry. If every retry fails, the response is returned and the permit stays held. The provider then tells the admission to abandon the permit: the runner stops renewing that lease, so it expires into the expiry sweep's presumed row at its reserved maximum (the cap stays honoured and the capacity slot frees, rather than blocking the pass's next request while the pass runs). Only `costs:reconcile` can lower that row.
  - `SQLITE_LOCKED` (a conflict inside one connection, which waiting does not clear) and every other settle error stay loud. Source for the codes: https://www.sqlite.org/rescode.html.
- **Revises.** Applies D-07 ("lease expiry without settlement is presumed spent") to a response that was received but not recorded.
- **Limits.** A write that never commits leaves a presumed row at the reserved maximum, which over-counts until reconciled. The pass waits the retry delays plus the database's busy timeout on each try before it keeps the response. If the lock then clears and the report is published before the lease expires, the published report's cost total and breakdown, which are read from the ledger, leave that request out. The expiry sweep later records it in the ledger, but the stored report is not updated. Before this batch the same request was thrown away and also reached the ledger only through the sweep, so this is not new; it needs about twenty seconds of continuous writer-lock contention. Carried to batch 8 (job lifecycle), which owns the publish path.
- **Validation.** `tests/requestAdmission.test.ts` holds BEGIN IMMEDIATE on the same temporary database from a second connection, as a second process would. It covers a settle that is recorded on a retry (the response is returned), one that outlasts every retry (the response is returned and the lease is left to be presumed), and a control that a settle failure that is not lock contention still rejects the pass. Unit tests pin that only the SQLITE_BUSY family counts and that the cause-chain walk is bounded and cycle-safe.

## D-119 - A presumed row is dated at its request's authorization (2026-10-28)

Audit 2026-10-27, batch B7 (JOB-203).

- **What happened.** The expiry sweep dated a presumed row at its lease's acquisition, but the settlement paths dated it when it settled. The audit's probe showed a $12.50 presumption lowered to $0 against the next day, because `costs:reconcile` never fetched the day that held the charge.
- **Options.**
  - (a) Keep settlement dating for presumed rows.
  - (b) Date every presumed row at its lease's acquisition and leave actual rows at their settlement instant.
  - (c) Date actual rows at acquisition too.
  - (d) Reconcile against two-day windows.
- **Choice: (b).** Request settlement and the pass-level presumed row use the lease's `acquiredAt`, like the sweep. An actual row is a measurement that is never lowered, so it keeps its settlement instant. Anthropic's documentation does not say which instant assigns a request to a day, so the repository keeps its recorded premise (D-07's revision: a call bills on a day bounded by its authorization) and applies it to every row the reconciler can lower. (c) would drop settled spend from a rolling window shorter than one request at the moment it is written. (d) changes the per-day allocation for every row to hedge one boundary case.
- **Revises.** Extends D-07's 2026-09-06 revision (F68/F76, sweep only) to the settlement paths. D-09 and D-10 are unchanged.
- **Limits.** The three residuals of OD-5:
  - Anthropic documents neither attribution instant (start or completion of a request). If a request measured across 00:00 UTC is bucketed by its start, its actual row sits in the later day's accounted total and can lower a presumed row on that day by at most that request's measured cost.
  - If Anthropic instead buckets by completion, a presumed row for a request that spanned midnight is compared with the earlier day, whose total may not hold the charge, and can be lowered too far. The same exposure has applied to every swept row since 782a853, and is limited to presumed requests that span 00:00 UTC.
  - A backdated presumed row leaves the rolling-cap window sooner. Dating at acquisition moves a presumed row into the window up to one request duration earlier, so with a rolling window shorter than a request it can leave the window sooner. The sweep has done the same since 782a853; until it settled, the request counted as a live reservation.
- **Validation.** `tests/scheduler.presumedSpend.test.ts` covers a presumed request settlement and a pass-level presumed row (pass reservation mode) dated at their lease's acquisition across UTC midnight, with controls that an actual request row and an actual pass-level row keep the instant they settled.

## D-120 - Paid work is admitted against the lower of the recorded and the configured job cap (2026-10-28)

Audit 2026-10-27, batch B7 (JOB-209).

- **What happened.** `METIS_MAX_JOB_COST_USD` is copied onto the job row when the job is created, so an operator who lowered the cap and restarted was not obeyed for a job still queued or resumed afterwards.
- **Options.**
  - (a) Apply the configured cap alone. Raising it would loosen a job created under a stricter cap.
  - (b) Keep the snapshot and document it.
  - (c) Apply the lower of the two.
- **Choice: (c).** `effectiveJobCapUsd` returns the smaller of the cap recorded on the job row and the cap configured now (`SchedulerLimits.maxJobCostUsd`, read with the other limits), null when neither is set. Paid admission uses it. Setting or lowering the cap and restarting binds a job that has not finished. Raising it does not loosen a job created under a lower cap, and a new report records the cap in force when it is created. The row snapshot stays.
- **Revises.** D-10's admission wording ("`settled + live reservations + this request ≤ caps`") now names which cap applies.
- **Limits.** The recorded cap of an existing job never rises. To run under a higher cap, start a new report.
- **Validation.** `tests/requestAdmission.test.ts` ("per-job cap") covers a job queued before a restart that set the cap, a control that a job queued after the cap is refused, a recorded cap kept when the configured cap is raised, the recorded cap used when none is configured now, a live cap below the recorded one with a reservation filling it, admission when neither cap is set, a zero reservation under a zero cap, the smaller of two non-null caps, and rejection of a configured cap that is not null or a finite nonnegative number.

## D-121 - Context fit is an estimate per tokenizer, and Claude Haiku 4.5 stays (2026-10-28)

Audit 2026-10-27, batch B7 (AI-309).

- **What happened.** The offline input bound counted each UTF-8 byte as a token, so every current payload (323,567 to 383,847 bytes) was refused on Haiku 4.5's 200,000-token window although Anthropic billed the same NVDA request at 159,327 input tokens on the newer tokenizer.
- **Options.**
  - (a) Call `count_tokens` before launch. The endpoint returns `invalid_request_error` for requests with server tools such as web search, which every analyst pass carries, and it would turn the synchronous preflight into a network call.
  - (b) Withdraw Haiku 4.5 from Settings and the README.
  - (c) Estimate the input offline per tokenizer and refuse only an estimate above the window.
- **Choice: (c).** Input tokens are estimated as ceil(serialized UTF-8 bytes / k), with k = 2.25 for the tokenizer introduced with Claude 4.7 and k = 2.75 for the earlier one (Haiku 4.5). Tokenizer generations are compared as integers: "4.10" is after "4.7", where a decimal comparison would put it before. The strict byte bound (`requestInputTokenUpperBound`) stays exported.
  - Calibration: Metis's own billed NVDA request (report #48: 379,563 bytes, 159,327 billed input tokens) is 2.38 bytes per token on the newer tokenizer. Anthropic documents the newer tokenizer as approximately 30 percent more tokens for the same text, depending on content, which puts the earlier one near 3.1 bytes per token. Both constants are rounded down so the estimate over-counts Metis payloads.
- **Limits.**
  - The estimate is calibrated on Metis payloads: it leaves about 11% margin on the prior tokenizer and about 5% on the current one. It is not a ceiling.
  - It is backstopped by the provider's context-window refusal: a prompt the estimate admits wrongly is refused with a 400 that the transport settles at $0 (`tests/requestAdmission.test.ts`, "settles a request that never reached the provider at zero"). A refusal the estimate should not have made would publish a data-only report for nothing, so an estimate close to the truth is the better design.
  - The paid-request reservation is sized from the context window, not from this estimate (D-10).
- **Validation.** `tests/anthropic.test.ts` covers a Haiku request whose estimate is at the window (admitted) and one above it (refused), a Haiku request the size of a current NVDA payload (admitted), a control that the same payload passes on a 1M-window model, the numeric ordering of registry generations, and the tokenizer of every active registry model. The batch's local replay of stored NVDA inputs (reports 43, 46, 48 and 49; not committed) found no Haiku refusal.

## D-122 - `both` compares section grades only, and an anchored retry skips its mirror (2026-10-28)

Audit 2026-10-27, batch B7 (AI-108, AI-109).

- **What happened.** With `METIS_JUDGE_ORDER=both`, two things made the order check read as agreement when it measured nothing.
  - It compared the three scenario probabilities, which the judge no longer writes (D-52 nulls them), so it reported agreement on a field neither pass produced and counted it in the denominator.
  - On a retry that carried sections kept from a cut-off response, the mirrored request received the same kept sections, so the compared grades were compared with themselves.
- **Options.**
  - (a) Run a fresh mirror without the kept sections. It doubles the time that caused the cut-off, can be cut off again, and spends money or plan allowance the owner did not ask for.
  - (b) Skip the mirror only when `verdict` is carried. A mirror that writes its own grades while told to stay consistent with the primary's other kept sections is still anchored.
  - (c) Skip and disclose the mirror on every retry that carries any kept section.
- **Choice: (c).**
  - The reconciliation compares the seven section grades only.
  - A retry that carries any kept section sends no mirrored request. The reconciliation is disclosed as not performed: "No order-sensitivity check was made: ..." with a reason that names the kept sections. The standalone judge path states its missing mirror the same way. No second paid call is made.
  - The kept sections were written under the seeded order and the retry is told to stay consistent with them, so a mirror built on them is not an independent draw. This is the reason the repair-turn branch already gave.
- **Revises.** D-20 ("`both` runs the judge twice with swapped order and reconciles") now compares grades and has a stated exception for anchored retries. Consistent with D-52 and D-70. It supersedes the D-116 Limits bullet "With `THESIS_JUDGE_ORDER=both`, the mirrored request carries the same kept sections ...": no mirrored request is sent with kept sections any more. D-116 stays as written.
- **Limits.** A judge pass retried after a cut-off response has no order-sensitivity check. The report says so rather than reporting agreement.
- **Validation.** `tests/stageC.judgeProtocol.test.ts` covers the grade-only comparison (prose differences are not disagreement, only grade fields are in the denominator), a control that a retry with no kept section still runs the mirror and discloses a disagreement, no mirror when a retry keeps a verdict or other sections, the API path, and a control that a mirror that ran and failed keeps the "did not produce a comparable output" wording. `tests/stageC.payload.passes.test.ts` pins the skip wording. The batch's local replay of report #50's retry (three kept sections: verdict, business, fundamentals; not committed) sends no mirrored request.

## D-123 - Discarded attempts and step costs read the ledger, and the audit export prints the mark (2026-10-28)

Audit 2026-10-27, batch B7 (AI-112, JOB-204, RPT-210).

- **What happened.**
  - A judge output that parsed but failed report assembly was retried up to the limit even when the failure repeated unchanged, and was not marked discarded.
  - A run-panel step's detail stated the last attempt's telemetry rather than the step's summed cost, and did not say how much of it was presumed.
  - The audit export's charge breakdown did not print the discarded mark that stored reports already carried, and durable verify recovery built its rows without the marks.
- **Options.**
  - (a) Classify which report paths the judge writes. The report tree mixes judge text and pipeline figures under the same keys, and a wrong map would either re-buy forever or refuse a repairable retry.
  - (b) Retry an assembly failure once and stop when the next attempt fails with the same issue list.
- **Choice: (b).**
  - A judge attempt whose output failed assembly is marked discarded with the fixed reason "the report could not be assembled from its output", the same fixed-phrase convention as every discarded reason (the stored #48 and #49 marks read "its output did not satisfy the report schema"). It is never quoted from the error. A reused durable artifact is never marked, since it was not bought in this run.
  - The retry stops when the issue list (sorted path and code) equals the previous attempt's.
  - A step's detail states the summed step cost. When the step has several attempts, a presumed part, or a cost that differs from the telemetry, the detail says so and names the presumed part. Only unreconciled presumed rows count as presumed.
  - The audit export's charge breakdown has a fourth Note column that prints each discarded charge's mark and reason. Normal assembly and durable verify recovery build their rows through one shared join, so recovery keeps the discarded marks it can read from the stored pass artifacts and the per-attempt fallback flag.
- **Revises.** Extends D-113 ("a repaired step states its whole cost") and commit 35fa83b (failure artifacts disclosed as discarded) to a success artifact rejected at assembly.
- **Limits.**
  - The assembly-rejection record lives in the running process, so a crash-recovery rebuild does not mark an assembly rejection. Durable recovery keeps the marks it reads from stored pass artifacts.
  - The rule retries once and stops on an identical repeat; it does not decide whether the failing field belongs to the judge.
- **Validation.** `tests/jobRunner.test.ts` covers the assembly mark and disclosure, the stop on an identical second assembly failure, a control that a different second failure still re-buys the judge, a reused repaired side's summed cost after a resume, a step's presumed request in its detail, a control that a reconciled presumed row is not called presumed, and a durable verify recovery that keeps a rejected bull row's mark. `tests/report.markdownCostTotal.test.ts` covers the Note column and a control that an undiscarded row has an empty Note and an unchanged total. The batch's local replay of stored reports (not committed) prints #48's bear $0.296630 and #49's bear $0.045210 and bull $0.428250 as discarded; every other line and both totals are unchanged.

Pipeline stage-c-1.6.10 marks these conventions (D-117..D-123). Report 1.44.0, payload 1.48.0 and Stage B ACCOUNTING_EVIDENCE_27 are unchanged. The audit listed `REPORT_SPEC_VERSION` for RPT-210; it is not moved because the audit export now prints a flag that every stored report already carried, and no field, grade, label or schema meaning changed. D-62 left the report spec and payload unchanged when it moved the cost breakdown into the audit export, and D-116 moved only the pipeline stamp for run-metadata changes. A bump would make every earlier report "not comparable" in the history diff. Stored reports and artifacts keep their bytes.

## D-124 - A peer market cap is money only in a currency the peer's own data establishes (2026-10-28)

The independent audit of 2026-10-27 (batch B3, payload records) found that the AI context gave every stock-peer market cap the subject's currency (D-57), so a Taiwan, Hong Kong or Tokyo listing in a NASDAQ subject's peer list verified as US dollars (AI-301, Critical), and that the size screen compared a local-currency cap with the subject's dollars before any currency was known (AI-301-V1). The owner confirmed the decision on 2026-10-28 with its coverage trade (`docs/superpowers/specs/2026-10-27-audit-remediation-decisions.md`, section 4.3). This entry also carries the batch's mechanical fixes under "Also in this batch" below. Every rule is class-wide; none names a ticker.

- **Options**: (a) keep D-57 for peers: inherit the subject's currency for every peer cap; (b) inherit only for same-exchange listings, which is FMP's documented premise; (c) fetch every peer's profile for its currency (D-43's deferred item); (d) a peer cap is money only in a currency the run already holds for that peer, and otherwise "(currency unknown)".
- **Risks**: (a) and (b) rest on the provider's "same exchange" premise, which the provider's own answer contradicts: the stored list for a NASDAQ subject held `.T`, `.TW`, `.HK` and `.SS` symbols with no currency field. A foreign cap was verified as dollars. (c) is a paid read per peer, and on the owner's entry-tier key every foreign symbol was refused (HTTP 402), so it adds calls and still leaves them unknown. (d) loses coverage: on the entry-tier key most peer profiles are refused, so many US peer caps will read "(currency unknown)". The peer table's metrics for that peer stay empty.
- **Choice**: (d). `peerListingCurrency` takes the row's own ISO `currency`/`reportedCurrency` (`ownRowCurrency`, never a provider convention), else the listing currency of a profile the peer collection read for that symbol, admitted or excluded (`PeerCollection.listingCurrencies`). Otherwise the cap is rendered "(currency unknown)" and not registered, so no citation of it verifies as money. One screen rule (`peerDiscoveryScreen`) serves Stage B discovery and the payload: caps are compared only when both currencies are established and equal or, when the row states none, when the peer symbol is on the subject's listing market (the same exchange-suffix form). That presumption only decides whether a discovery name is size-screened and never registers money. A name on another or unknown market is "size not compared", with the reason stated, and goes to the profile read inside the existing 10-candidate, 25-second budget.
- **Why**: D-28's own-row principle is restored for peers; D-57's inheritance stays for the subject's own estimate, price-target and compensation rows. An honest unknown is better than a cap in the wrong currency, and the only new request is the profile read a wrongly size-excluded name now gets (AI-301-V1).
- **Disclosure**: "(currency unknown)" and the "size not compared" note in the payload's Peers notes; METHODOLOGY (the D-57 paragraph and the size screen). A stored report from before spec 1.45.0 shows a peer cap whose symbol is on another listing market than the subject's without a currency or check mark, with a presentation-correction entry; a same-market cap is left as stored. Known limit: a stored peer with no symbol keeps its stored currency, because its listing cannot be known without a symbol.
- **Revises**: D-57 for stock-peer rows; D-65 (the screen compares on an established or same-market basis); closes part of D-43's deferral without new reads.
- **Sources**: FMP, Stock Peer Comparison API (https://site.financialmodelingprep.com/developer/docs/stable/peers), which describes peers as "companies that trade on the same exchange"; Yahoo Finance, "Exchanges and data providers" (https://help.yahoo.com/kb/SLN2310.html), for the exchange suffixes; D-28 and D-57's own risk note ("can still be wrong if a provider ever states a single-currency issuer's rows in a third currency").

**Also in this batch** (mechanical fixes, no owner question; each failing test first):

- **AI-306 and AI-410.** A figure's label names the span actually measured. The diluted share-count change reads "(4y total)" for four years of rows, with a capital note when the window fell short of five years or the spacing was irregular. The capex/D&A average reads "capex / D&A, 3y average" from `capexToDAAvgYears`, the count of ratios averaged. A five-year span keeps today's label.
- **AI-406.** One date rule for prior-quarter columns, the windows the payload's own note states: quarter over quarter against a column 80 to 100 days earlier, year over year against one 350 to 380 days earlier (so a 14-week quarter and a 53-week year still count). A series with only a year-ago column gives no QoQ figure in the payload or the classic table.
- **AI-310.** FRED native units: APU000072610 in USD per kilowatt-hour, PCE, PCEND and PCEDG in USD billions at a seasonally adjusted annual rate, and a `chg` series (PAYEMS) named as the change from the prior observation.
- **AI-101.** An 8-K event excerpt keeps the sentence that names whose amount it is: an honorific-and-surname passage is added with the nearest earlier passage naming that surname in full, a pronoun passage with the one before it (up to three hops, all or nothing within the budget), and an award of shares ranks with the dollar amounts. Coverage version `section-evidence-5/event`; other profiles keep `section-evidence-2`.
- **AI-505.** Each statement block holds one column per fiscal period, the row Stage B uses (`normalizeQuarterRows`, D-13 "last-filed wins"); a period served twice with no provable order is left out and a note says so, for periods inside the block's window only. A row with an invalid date keeps its "unknown", never-citable column.
- **AI-507.** The reconciliation rule reads the notes by reporting period, never filing date, and a 10-Q excerpt older than the newest 10-K says so in its title. Reading the 10-K's Item 9B is coverage, not a defect fix, and is left for later. This is a pass-prompt text change, so `PIPELINE_VERSION` moves to stage-c-1.6.11.
- **AI-511.** Only the figure the balance-sheet score graded is called graded: the fiscal-year FCF conversion row reads "latest fiscal year, before SBC", and a note in "Current capital (computed)" names the graded basis and window. The current-capital label keeps its text, so its ids and the D-62 alias group are unchanged.
- **AI-512.** A release's fiscal label that the run's own income rows do not support is withheld from the excerpt title, not replaced: a labelled income row within three days of the quarter end that disagrees withholds it (an annual row ending there makes that quarter the fiscal fourth, so it agrees with "Q4" of its year only and contradicts any "Q1" to "Q3" label; B3 final review); with none that near, it is kept only as the successor of the newest labelled quarter (80 to 100 days later) or, when only annual rows are labelled, as the next fiscal year within that quarter's day window; a bundle with no labelled income row keeps it unchecked. Alternatives rejected: preferring the statement row's label (picks a winner with no proof of which source is right), re-parsing the stored text at assembly (a parser-version policy that belongs to the current-reports batch), and withholding every release label (loses the correct labels D-66 relies on). Basis: D-66, "explicit fiscal contradictions require an established fiscal basis". The guidance rows' and track record's labels are the same root on another surface and are left for the current-reports batch.
- **Residual (a).** A latest-year computed row (latest margins, ROIC, DuPont ROE, free cash flow, FCF conversion, capex) and the accrual-year rows carry the fiscal-year label the statement data carries (`fiscalPeriod`, "FY<yyyy>"; the provider's or the keyless builder's, not necessarily the company's own) and that year's period end, taken from the annual income row of the date Stage B's own result states, and only when that date equals the as-of the figure prints and the label is plausible for the period end (its year is the end's calendar year, or that year minus one when the end falls in January to March; B3 final review, because a keyless row can carry a wrong year, as FCX's 2024-12-31 row carried "2023"). This is option (a) of the fiscal-label decision in the claim-verifier batch, done here; it is never inferred from a calendar year (that batch's rejected option (b)). The period is set beside the label because a label alone, with a null period, skipped the consistency period check and let wrong-year claims validate under the verifier `main` has before that batch merges. Multi-year, mixed-input, current-capital and non-latest single-year figures get no label.
- **Limits.** AI-101's stored reports keep their figures as stored. The condition, a kept amount whose recipient is named only in a cut sentence, cannot be detected from a stored report: it keeps neither the excerpt nor the omitted sentence. Its only trace, the evidence-coverage line "N of M source chars omitted by section-evidence-2/event", is on every cut 8-K event excerpt in six stored reports (#43, #45, #48, #49, #50 and #52), so a rule keyed on it would mark correct citations, and a rule keyed on words such as "salary" would be an issuer-text heuristic. #43's two affected items are already unverified and a judgment note hedges them.

Report 1.45.0, payload 1.49.0, Stage B ACCOUNTING_EVIDENCE_28 and pipeline stage-c-1.6.11 mark these conventions. In the provider-free DEMO control, the report stamp, the capex/D&A years count, a share-count window note and the shifted later capital notes move, and the peer-coverage methodology sentence changes; no figure moves. Stored reports and snapshots keep their bytes (D-67). See the [disposition record](2026-10-27-audit-fix-03-payload-records.md).

## D-125 - Insider statistics are open-market transaction counts and share volumes over the trailing four complete calendar quarters (2026-10-28)

FMP's insider statistics are calendar-quarter rows. The payload registered `totalPurchases` and `totalSales`, which are counts of transactions, as "shares", took them from the first row only (FMP's newest calendar quarter, which may have been the quarter in progress at the fetch date), and gave the acquired/disposed figure a bare label (AI-117, High; AI-117-V1).

- **Options**: (a) the latest complete quarter only; (b) quarter to date; (c) the trailing four complete calendar quarters before the quarter in progress, with counts and share volumes registered apart.
- **Risks**: (a) one quarter is dominated by when annual awards vest, and the leadership prompt already asks for "insider net activity trailing 12 months". (b) a partial window presented as the insider total is the defect itself. (c) FMP may not serve the newest complete quarter, so "trailing" could be untrue unless the end date is stated; fewer than four consecutive quarters must be labelled as what they are.
- **Choice**: (c). The label states the window end ("four calendar quarters ended 2026-06-30"), the record's `period` is the window end and its `periodContext` is a duration (`basis: "rolling-12-month"` when four quarters are summed). Five figures are registered: open-market purchase and sale counts (Form 4 codes P and S, unit `count`), shares acquired and shares disposed (unit `shares`, covering every reported acquisition or disposition, awards, exercises, gifts and tax withholding included), and the acquired/disposed transaction-count ratio. The quarter in progress is left out of the sums (its Form 4 rows are still listed one by one). A missing quarter ends the window, a repeated quarter keeps its first row, a sum with a missing value is withheld, and with no complete quarter there is no statistics figure and a note says which quarter is in progress.
- **Why**: a count must not be a share volume, and a window must be as long as the label says. Keeping purchases and sales apart from award-driven acquisitions follows the finding that purchases carry the informative signal.
- **Disclosure**: reader labels for the five figures; METHODOLOGY "Insider statistics". A stored report from before spec 1.45.0 shows the two figures as unverified transaction counts, with a presentation-correction entry; a log entry for a corrected figure moves from validated to unchecked and the displayed coverage counts exclude it (D-67).
- **Sources**: SEC, "Ownership Form Codes" (https://www.sec.gov/edgar/searchedgar/ownershipformcodes.html): P and S as open-market purchase and sale, A, F and M under Rule 16b-3, G a bona fide gift. OpenBB Platform reference for FMP insider statistics (https://docs.openbb.co/odp/python/reference/equity/ownership/insider_trading): `total_purchases` and `total_sales` as transaction counts. Lakonishok and Lee (2001), "Are Insider Trades Informative?", Review of Financial Studies 14(1) (https://ideas.repec.org/a/oup/rfinst/v14y2001i1p79-111.html).

## D-126 - Peer screen reasons travel enveloped; an envelope change alone does not move the payload version (2026-10-28)

A peer exclusion reason can quote a provider's error body verbatim (a 402 or a quota message), and the payload printed it, with the collection notes, in "Comparable peers (computed)" outside every envelope (AI-102). D-101 had enveloped gap reasons and data-quality flags, with the guarantee that sections rendered outside the envelopes carry no free provider text.

- **Options**: (a) rewrite each reason into fixed assembler wording; (b) move the reasons and notes into their own enveloped block; (c) (b) plus a separate `PAYLOAD_VERSION` bump for the envelope alone.
- **Risks**: (a) loses the exact refusal text the audit export and the analysts rely on (402, quota, an industry mismatch) and adds a classifier that can mislabel. (c) doubles the batch's stamp movement for no resume-safety gain: `payloadFingerprint` hashes the prompt, so no stored pass resumes across the change.
- **Choice**: (b). "Peer screen exclusions and collection notes (untrusted provider data)" is rendered with `renderUntrustedLines` like the data-quality flags and the missing-data manifest: JSON-encoded, markers escaped, each entry folded onto one line (the form D-101 and METHODOLOGY require for gap reasons). The fixed method lines and comparison bases stay in "Comparable peers (computed)". The registry is unchanged. This batch moves `PAYLOAD_VERSION` once for the record changes, and that one bump covers the envelope.
- **Why**: it extends D-101's guarantee to the peer path without losing information.
- **Disclosure**: METHODOLOGY (the F-5 paragraph, now true for peers). No stored report changes.
- **Sources**: OWASP Top 10 for LLM Applications, LLM01 Prompt Injection (https://genai.owasp.org/llmrisk/llm01-prompt-injection/), mitigation "Segregate and identify external content"; D-101.
- **Extends**: D-101.

## D-127 - A provider's geographic rows are company geography only where the issuer's own XBRL does not contradict them (2026-10-28)

The provider's annual "geographic" segmentation was passed to the AI as the company's as-reported geography whenever it held a finite row (AI-509). For AMZN it held the issuer's three business segments ("North America Segment", "International Segment", "Amazon Web Services Segment"), for NVDA region names the issuer does not use ("Other Americas", "TAIWAN, PROVINCE OF CHINA"), and the shares computed against that total were verified.

- **Options**: (a) a caveat only; (b) strict D-80 for every provider row; (c) a value cross-check against the issuer's XBRL; (d) a gazetteer of country names; (e) withhold whenever the issuer tags a geographic axis; (f) withhold only where the issuer's own XBRL contradicts the rows, with a caveat otherwise.
- **Risks**: (a) leaves the AWS segment as an 18% region and fails D-80's "geographic-only detail". (b) withholds geography for issuers with no XBRL segment tags, where the provider rows are the only geography and nothing contradicts them. (c) needs an annual issuer figure the bundle does not carry, and a derived fourth quarter belongs to another batch. (d) is brittle and still cannot tell that "Other Americas" is the issuer's "Other". (e) would withhold an issuer whose labels the provider repeats exactly (META) while admitting an issuer that tags nothing. (f) fails closed on a spelling the issuer does not use, so an NVDA-like issuer loses the provider's annual geography in the AI's input.
- **Choice**: (f). One predicate (`providerGeographyContradiction`, with `admittedGeography`, in `src/edgar/segmentFacts.ts`) withholds the provider's whole row set when any key names a reportable business segment tagged in the same bundle's XBRL segment revenue (`us-gaap:StatementBusinessSegmentsAxis`; generic residual rows such as "Other" or "Total" never match), or when the issuer tags its own geographic revenue (`srt:StatementGeographicalAxis`, at least one row) and any provider key, normalised as for the first test, is neither a label nor a member name on that axis. Otherwise the rows are shown with a note that their keys are FMP's normalised names, not read from the filing's XBRL, and that FMP's assignment of revenue to them is not checked against the filing; the section no longer calls them "as-reported". SEC-parsed geography is unchanged. The same predicate serves the payload, the segment-share basis (`applySegmentShares`), the data-only report, a Stage A info gap (`validation.providerGeography`, which reaches both report manifests) and the stored-report view. No new provider or SEC request.
- **Why**: segment revenue (the AWS segment, the North America segment) is not entity-wide geographic revenue under ASC 280, and geography needs a stated attribution basis that a provider row does not carry. The issuer's quarterly XBRL tables already take precedence over the annual provider tables (D-67 point 3) and now do so in the AI's input too.
- **Disclosure**: the info gap, the caveat note and METHODOLOGY "Provider geography". A stored report from before spec 1.45.0 keeps the provider rows as served, marked unverified with the reason and no share, when its own XBRL tables contradict them; stored NVDA reports #47, #48, #50 and #52 show their provider rows unverified, AMZN #43 shows its three, and META #44 and #45 and NVDA #49 are unchanged (D-67).
- **Extends**: D-80, whose geography admission scope was enforced only on the SEC-parser path, to provider rows; applies D-67 point 3 to the AI's input.
- **Sources**: Deloitte, Roadmap: Segment Reporting, section 5.5 (https://dart.deloitte.com/USDART/home/codification/presentation/asc280-10/roadmap-segment-reporting/chapter-5-entity-wide-disclosures/5-5-information-about-geographic-areas), quoting ASC 280-10-55-21 and 280-10-50-41 and the SEC staff's Current Accounting and Disclosure Issues (30 November 2006). FMP's Revenue Geographic Segments API page (https://site.financialmodelingprep.com/developer/docs/stable/revenue-geographic-segments) was read through search excerpts only, a weak citation; the decision rests on ASC 280 and D-80.

## D-128 - The claim verifier compares the periods, windows, comparison bases and recency a claim states (2026-10-28)

Audit 2026-10-27, batch B1 (AI-106, AI-302, AI-302-V1, AI-303, AI-303-V1, AI-303-V3, AI-303-V4, AI-402, AI-402-V1, AI-402-V2, AI-404, AI-405). AI-303-V2 was rejected at review as a duplicate of AI-303 and AI-303-V1; the excerpt-path test for AI-303 covers it.

- **What happened.** All of it sits in the deterministic, no-model verify pass of Stage C, where a `[validated]` mark means the cited record or excerpt clause established the claim's figure, metric and period.
  - AI-106: a claim naming a fiscal year, quarter, date or window validated against a record whose period is null (181 of 940 rows in NVDA #50), because a 2026 commit dropped the null-period test from the gate.
  - AI-302: a trailing-twelve-month record validated prose that named only the window's start date.
  - AI-302-V1: an excerpt clause stating an expectation ("gross margins are expected to be 74.0%") took the excerpt's reporting period (D-63) and validated a claim stating a reported result.
  - AI-303, AI-303-V1: a window was read only after "for", "during" or "over", so "annual revenue", "per year" and "this quarter" were dropped and never compared.
  - AI-303-V3: "at fiscal year-end" named no instant.
  - AI-303-V4: "latest", "most recent" and "newest" were compared with nothing, so an older period called the latest validated.
  - AI-402, AI-402-V1: the period after "compared with ..." (the comparison base) was lent to the figure before it, so a correct year-ago figure validated against the wrong period and a correct current figure could be marked contradicted.
  - AI-402-V2: a correct year-over-year sentence naming its base drew a period finding, because the consistency check read the base as the figure's own period.
  - AI-404: each clause of a one-figure claim was read alone, so a period stated in a neighbouring clause was never compared.
  - AI-405: the consistency period check compared calendar years only, so "fiscal 2025" against a 52/53-week year ending 2026-01-03, and "the second quarter of fiscal 2027" against NVIDIA's quarter ended 2026-07-26, demoted claims the citation check validates.
- **Options and Choice.** The owner delegated these calls (research-backed); each is recorded with its sources in the plan and summarised here.
  - **OD-1. A period-less record establishes only what it carries.** (Verifier only, no payload change; AI-106, AI-303, AI-303-V1.)
    - Chosen: a record with no period establishes its own as-of date, a date its period context declares, and a fiscal label it declares (matched only when the claim's period reads as an FY label). Any other year, quarter, date or window named against it leaves the claim unverified, never validated and never contradicted (F-22). A dated record without fiscal metadata establishes its date only. Windows a period-less record's own label names ("over TTM", "latest-quarter ...") stay established (D-66).
    - Rejected: (a) give `(latest)` rows a fiscal label in this batch (a payload change, done by B3 Task 8E, which merged first); (b) infer "annual" when a period-less row's as-of equals a registered fiscal-year end (an inference, wrong for a TTM row that ends at a year end).
    - Sources: XBRL 2.1 sections 4.6.1 and 4.7.2 (a value carries the period its context states and no other); Rashkin et al., "Measuring Attribution in Natural Language Generation Models" (AIS); SEC Regulation S-X Rule 10-01(c)(1).
    - Measured cost, with B3 Task 8E on `main`: none on a stored claim. NVDA #48's "ROIC for the latest fiscal year was 149.8%." and "The balance-sheet accrual ratio for the same year was 0.64x." stay validated, because the rows now carry `fiscalPeriod: "FY2026"` and the period 2026-01-25, which establish the fiscal year and, through the annual window, the "latest fiscal year". "ROIC for FY2025 was 149.8%." (a constructed claim, not a stored one) is unverified (`period-word-mismatch`). At planning time, before B3, the cost was the two latest-year claims moving from validated to unverified (C-11).
  - **OD-2. A trailing window's start date counts only inside the complete interval.** (AI-302.)
    - Chosen: a lone date names the window's end. The start agrees only when the claim also names the end date ("from 2025-07-27 to 2026-07-26"), the interval-proof principle of D-82.
    - Rejected: admit the start after "from", "since" or "beginning". "Since 2025-07-27" states no end, and the start is often also the prior-year quarter end that other rows carry.
    - Revises D-59's start-date allowance; extends D-82. Sources: XBRL 2.1 section 4.7.2; S-X Rule 10-01(c)(2).
  - **OD-3. A forward-looking clause is never read as a reported result.** (AI-302-V1.)
    - Chosen: (1) a forward-looking source clause (the wording listed under Limits) inherits no period or window from the excerpt's title and binds only a claim naming the period the clause itself names, or none; (2) modality must match: a forward-looking clause binds only a forward-looking claim and a result clause only a result claim. Modality is judged from the clause of the figure the claim states, so a result figure beside a forward-looking clause binds no forward-looking span.
    - Rejected: (a) the inheritance rule alone (a guided figure stated as a past result without a period still validates); (b) carry an outlook lead's period across its bullets (a recall gain only); (c) leave the noun "guidance" out ("Our guidance for third-quarter revenue is $108.0 billion." in a Q2 release would still validate "Revenue for Q2 FY2027 was USD 108.0 billion.").
    - Revises D-63 ("a clause naming no period takes the excerpt's own"). Sources: 15 U.S.C. 78u-5(i)(1)(A); Sauri and Pustejovsky, event factuality annotation (the scheme behind FactBank); the forward-looking statement wording of NVIDIA's own release.
  - **C-1. Comparison-base grammar (AI-402, AI-402-V1, AI-402-V2).** A period phrase directly after a comparison cue in its own clause, with only amounts and connecting words between, is the comparison's base (D-98's rule). Cues: "compared with/to", "as compared with/to", "versus", "vs.", "relative to", "against", "than", "above", "below"; "from" or "over" after a change word with an optional magnitude; a bare "from" only across at least one amount. A period directly after a bare "from" or "over" is not a base ("from 2025-07-27 to 2026-07-26" is an interval, "over $10 billion in fiscal 2027" means "more than"), and an amount range is not a base. This is narrower than D-98's cue list for the release parser, which is not changed (B9 owns known issue B1-3).
  - **C-2. A base is checked as the base.** On an excerpt a base the claim names must be a base the source clause names. On a record the consistency check compares the base with the cited growth figure's own base period: one year earlier for year over year, one quarter earlier for quarter over quarter, compared by fiscal label first (never an FY-labelled base by calendar year, which would reproduce AI-405). Ruled at review: a stated base that the cited evidence does not establish leaves the claim unverified (`period-mismatch`). Established means the record's own comparison basis, or a cited record whose own period is the base. A period-less or level record that establishes no base leaves a base-bearing claim unverified, as before.
  - **C-3. A one-figure claim is read whole (AI-404).** Its periods, bases, recency and modality come from the whole claim; several figures keep per-clause reading. A period named only in a forward-looking clause is not lent to a figure whose own clause is not forward-looking.
  - **C-4. Fiscal-year-end instants and "latest" (AI-303-V3, AI-303-V4).** "At fiscal year-end" names the fiscal-year-end instant, established only by an FY or Q4 fiscal label, a fiscal-year basis, or the source clause's or an annual excerpt's own date. "Latest", "most recent" and "newest" on a figure from a reported-period series require that no later period of the same series is registered. The check applies only where the word modifies a period or a filing ("the latest quarter", "the latest 10-Q"), not "the latest guidance", and also reads hyphenated and labelled forms ("latest-quarter", "the latest FY2026").
  - **C-5. The consistency period check is never stricter than the citation check (AI-405).** A spelled fiscal period ("the second quarter of fiscal 2027", "fiscal year 2025") is read as the phrase "Q2 FY2027" or "FY2025" and compared through `periodsAgree` against the issuer's fiscal label, and not checked when the record has none (D-66). A phrase without an FY prefix passes when `periodsAgree` accepts it or the calendar-year sets agree, so the change only removes false failures. Source: 26 CFR 1.441-2 (a 52/53-week year ends on the day nearest a calendar-month end).
  - **C-6. Windows on the excerpt path are compared as periods.** A claim's window must be the source clause's window or, when the clause names none, the window the excerpt's own title states (D-63 inheritance, extended to the window).
- **Limits.**
  - "Latest" is not checked on a filing excerpt.
  - "At the latest fiscal year-end" citing a fourth-quarter row stays unverified once later quarters of its series are registered.
  - An outlook lead's period is not carried to its bullets.
  - A result clause that also cites guidance binds only a claim that names the guidance.
  - The wording read as forward-looking is exactly: "is/are/was/were/be/been/being/remains/remained" (optionally "now", "currently", "still" or "also") followed by expected, projected, forecast(ed), anticipated, estimated or guided "to"; "expect(s)", "expecting", "anticipate(s)", "anticipating", "forecast(s)", "outlook"; "guidance" followed by for, of, range, calls for, is, was or issued; and "our", "its", "management's" or "the company's" followed by up to three words and "guidance". So "Under the accounting guidance for leases", "Under guidance issued by the FASB" and "our new lease accounting guidance" are also read as forward-looking. The recall cost: a result clause with a forward tail ("... approximately $4.18 billion for the acquisition of property, plant, and equipment, substantially all of which is expected to be paid within one year") binds only a forward-looking claim. In the replay this moved one row, the purchase-obligations commentary of stored run #46, from validated to unverified.
  - A forward-looking claim whose verb sits outside the figure's own clause is unverified (recall lost, never precision), and a guided figure restated with a subject and verb the source clause lacks is a metric-word mismatch.
  - The claim reader reads a bare "fiscal 2026" as the year 2026, so a correct "fiscal 2026" claim stays unverified against a dated or a period-less row alike.
  - The period check does not adjudicate a comparison base against a figure that is not a year-over-year or quarter-over-quarter series: a level row cited with only a base phrase is not checked against it.
  - A fiscal label on a `(latest)` row and a stale excerpt title were B3's and are fixed there (B3 Tasks 8E and 8F, merged first).
  - **Interaction with B2.** At this batch's head, AI-503-V2's control (ctl-real-noperiod: the true claim "Operating income increased from USD 19.2 billion.") is read as having a comparison base and is contradicted. B2 Task 16 fixes it. B1 and B2 merge as a pair; B1 alone is not to be released without B2.
- **Validation.**
  - `tests/stageC.claimPeriods.audit20261027.test.ts` (126 tests, each finding failing first), the composition test in `tests/stageC.latestFiscalLabels.test.ts` (B3's labels read by this batch's rules; it fails when the labels are removed), a key-number test in `tests/currentReports.test.ts`, and every other test that calls the verifier (38 files, 1386 tests green at the stamp commit).
  - The replay over the stored run inputs of NVDA #48, #49 and #50, AMZN #43 and run #46, with no provider or model call, from main after B3 (`a636315`) to this branch: #43 two key numbers unverified to validated (15.9 net discrete tax expense, correct per the filing) and five rows whose reason code only changed; #46 one row validated to unverified (the purchase-obligations row above); #48, #49 and #50 no row changed; every period check passed on every run; none moved toward contradicted. On #48 the C-11 constructed claims are validated for the fiscal year, the latest fiscal year, FY2026 and the accrual ratio, and FY2025 is unverified (`period-word-mismatch`) before and after. The table is in the [disposition record](2026-10-27-audit-fix-01-claim-verifier-periods.md).

Report 1.46.0 and pipeline stage-c-1.6.12 mark these conventions. Payload 1.49.0, Stage B ACCOUNTING_EVIDENCE_28 and the score bands are unchanged, and the payload golden did not move. Stored reports keep their bytes and statuses (D-67); only reports verified after the merge use the new rules.

## D-129 - Audit batch B2: an excerpt figure binds only to its own description (2026-10-28)

Audit 2026-10-27, batch B2, owner decision OD-1 (AI-305, AI-305-V1). This applies the audit's recommended default 3 (a figure is read with its own description). Default 3's second half, that a forward-looking clause does not inherit the excerpt's reporting period, is B1's AI-302-V1 and is not changed here. The batch's other number readings (AI-202, AI-304 and variants, AI-401 and variants, AI-403, AI-409, SEC-203) are house conventions described in the CHANGELOG and METHODOLOGY, not decided here.

- **Evidence.** D-63 let an excerpt clause validate a claim when every claim word appeared somewhere in the clause and the clause's definition modifiers were in the claim, a lexical-overlap test. It validated four wrong metrics on the real excerpts of reports #43, #46 and #50, two of them visible as green key-number checks: a figure the sentence gives to another noun ("a record of nearly $26.0 billion to shareholders" validated a free-cash-flow claim; "benefiting our diluted earnings per share by $1.93"; "a $169 billion annualized revenue run rate"; "cash, marketable investments, and restricted cash of $73.48 billion"). The clause-wide test also left some correct claims ambiguous: "Revenue as of 2026-01-25" matched both the Revenue row and "Cost of revenue"; that claim stays ambiguous, because the own-description test below never resolves an ambiguity.
- **Options.** (a) Keep D-63's clause-wide subset test. (b) A syntactic noun-phrase parser (a parsing dependency and a probabilistic output that is hard to pin). (c) A symmetric whole-clause test with only a context-word list (trailing explanations such as ", driven by ..." would fail almost every correct figure). (d) Chosen below.
- **Choice.** (d): keep D-63's clause test and add an own-description test, computed the same way for every excerpt figure.
  - A prose figure's description is the source words from the clause start, the previous figure or the last "(", ":" or ";" before it, up to the figure, and the words after it up to the first ",", ";", ":", "(", ")", em dash or en dash or the next figure. A table cell's description is its row lead: the table scale declaration blanked, and then only the text after the last colon. Every content word of the description must be named by the claim; grammar words, a closed list of context words, ordinal period phrases and the issuer name are not content words, and a noun, adjective, comparator, definition modifier or direction word is never on the list.
  - **Structural guard (judged twice).** Each excerpt claim is judged by one closure over the clause-rule candidates and again over the own-filtered candidates. The final status is the own-filtered result when that is unchecked; the clause result when both agree; the clause result when it is unchecked; otherwise unchecked / text-ambiguous. So the own description can only leave a claim unchecked. It never validates or contradicts a claim and never resolves an ambiguity, in prose or in a table, so it moves nothing toward validated. The "Current assets: Cash and cash equivalents" row of a balance-sheet table was already validated at base and stays validated.
- **Why.** McCoy, Pavlick and Linzen, "Right for the Wrong Reasons", ACL 2019 (https://aclanthology.org/P19-1334/), name the lexical overlap heuristic as fallible: "Assume that a premise entails all hypotheses constructed from words in the premise." Harper et al., SemEval-2021 Task 8 MeasEval (https://aclanthology.org/2021.semeval-1.38/), read a quantity with its own measured entity, property and qualifier, not every noun of its sentence. Rashkin et al., "Measuring Attribution in Natural Language Generation Models", Computational Linguistics 49(4), 2023 (https://aclanthology.org/2023.cl-4.2/): a statement is attributable when a generic hearer would affirm "According to P, s".
- **Accepted recall losses.** Five stored traced numbers (two key numbers and three balance-sheet table numbers) lose their check mark because the claim leaves out nouns of the figure's own sentence: #43 15.9 net discrete tax expense (two key numbers), #43 17.5 delayed draw term loan facility, #43 21.3 Commitment Amount, #50 25 senior unsecured notes. The short label of NVIDIA's $105 billion aggregate payment obligation now needs its full description. The first Revenue row under a "($ in millions, except per share data)" declaration and the colon-row tables stay text-ambiguous, as at base, and a statement sub-row under a heading binds only the row whose lead carries the heading (the Diluted row of NVDA's Note 3 stays unchecked).
- **Revises.** D-63 (the recall-over-precision choice for excerpt clause binding) and D-45's accepted same-sentence residual for the second number gate. D-66's requirement that GAAP and net modifiers stay required is kept.
- **Versions.** Report 1.47.0 (the batch's single stamp move). Pipeline stage-c-1.6.12, payload 1.49.0 and Stage B ACCOUNTING_EVIDENCE_28 are unchanged.
- **Preservation.** Stored reports keep their bytes and statuses (D-67); only reports verified after the merge use the rule. The replay of #43, #46, #48, #49 and #50 moved no row toward validated or contradicted through this rule; the five traced numbers above moved from validated to unverified.
- **Validation.** `tests/stageC.claimEvidence.ownDescription.test.ts` (including a 66-case property table that pins the structural guard). The verification plan's Task V7 probes the guard on fresh inputs.

## D-130 - Audit batch B2: comparison bases and the end of a base-first move (2026-10-28)

Audit 2026-10-27, batch B2, round 4 (AI-503, AI-503-V1, AI-503-V2). These are house conventions, not owner decisions (findings.json `ownerDecisionNeeded: false`); they are recorded because they revise recorded scope. The record-path conventions of the same round (a record label's direction words, operand order, percentage-point changes; AI-501, AI-504, AI-502) are deferred to the follow-up batch B2b and are not recorded here.

- **Evidence.** NVIDIA's CFO commentary says "Our commitments increased from $119 billion last quarter to $279 billion". The verifier read $119 billion as the commitments' level, so the true "Our commitments increased to USD 279 billion." was contradicted and the false "increased to USD 119 billion" validated (AI-503). The 10-Q MD&A sentence "significantly increased our supply and capacity commitments from $119 billion ... to $279 billion" did the same through a distant verb (AI-503-V1). A claim "increased from USD 19.2 billion" was read as a level and contradicted by the move's end (AI-503-V2); at B1's head this showed on a true claim. Measured on the CFO commentary and 10-Q sentences that reports #48 to #50 carry.
- **Options.** (a) Any figure governed by "from" binds nothing (rejected: the true end level would stay unvalidated). (b) Key the base on the direction word and the 40-character window (rejected: AI-503-V1's verb sits beyond the window). (c) Chosen below.
- **Choice.** (c).
  - A figure directly after "from", "compared with", "compared to", "versus", "vs." or "against" is a comparison base. It supports only a claim figure introduced the same way, and a claim figure introduced that way binds only a source base. A base takes no excerpt period. This extends D-63's postposed-only `levelBeforeComparison` ("up from Y" is a level).
  - In "<direction word> from $A ... to $B" the move's metric belongs to $B. $B's description is the move's head (from where $A's own description starts) plus only $B's own after-text. The words between $A and "to" describe $A and never $B, and so do the periods, windows and fiscal year-end they state: $B keeps only its clause's periods before $A's start or from its own start (final review, 2026-10-28). The head is given only when a direction word governs "from $A", $A and $B share a clause, and only time words (`MOVE_TIME_WORDS`) sit between $A and "to"; a range, "went from", a comma or dash, a second direction word or a new subject leave $B without the head and the claim unchecked.
- **Why.** A base is a different statement from the level (Rashkin et al. 2023, as in the own-description entry). A false claim validating on a base figure is the worst outcome a verifier can produce, so each doubt resolves to unchecked.
- **Revises.** D-63's postposed-only comparison rule (extended). A review ruling limited the move end's head to time words, which replaced the plan's first reading.
- **Versions.** Report 1.47.0. Pipeline, payload and Stage B stamps unchanged.
- **Preservation.** Stored reports keep their bytes and statuses (D-67). No stored report holds one of these shapes; the replayed probe claims moved only toward unchecked, plus the listed true move ends toward validated and false move starts toward contradicted.
- **Validation.** `tests/stageC.claimEvidence.comparisonBase.test.ts` (65 tests). The verification plan's Task V7 probes the move-end head on fresh inputs.

## D-131 - Audit batch B2: known residuals of the claim-verifier number fixes (2026-10-28)

Audit 2026-10-27, batch B2 (main-session resolution, decisions spec 4.3, B2). These are readings that stay as they are. They are not owner decisions and not findings of this audit; they have their own entry so the post-fix audit (verification plan Task V7) can find and probe them instead of treating them as settled. Each fails closed (unchecked, never validated) on the shapes the tests cover, except r5, r9, r10 and r11, which predate this batch, and NVDA's Note 3 Diluted row, which reads as money as on main; r8, which also predates it, is fixed by the final review and stays listed so the post-fix audit can confirm it.

- **Evidence.**
  - *Spaced-dash range sign.* `readProseQuantities("Guidance is USD 1.0 - 1.2 billion.")` returns `[1, -1.2e9]` at base and after this batch (AI-202's documented reading): the after-prefix sign group reads a dash followed by a space as a minus. No test pins it.
  - *"EPS" as a per-share basis.* `perShareInWords` keeps D-109's expression `/\bper\s+share\b/i` on the excerpt path and the record path. Under "($ in billions, except per share data)", "Diluted EPS as of 2026-01-25 was USD 4.90." moves from contradicted (base: 4.9e9 against 4.90) to `unchecked / unit-mismatch`, never validated. NVDA's Note 3 Diluted row is a different case: its lead is "Diluted (2)", so "Diluted EPS" and "diluted net income per share" claims bind none of its cells and stay `unchecked / text-context-mismatch`. Its label names no per-share basis, so since the pull-request review it keeps the table's money scale, as on main: a claim whose only metric word is "Diluted" reads it in millions ("USD 2.46 million" validates; "USD 2.46" is contradicted).
  - *r1.* ASCII ">=" and "<=" are read as point figures, not bounds (AI-409 reads the words and the symbols "≥", "≤", ">" and "<").
  - *r5.* A base-time phrase after $B ("... to $31.6 billion compared with the prior quarter", "versus a year ago") lets a false claim that names that time validate. The plain-figure analogue already validates at base.
  - *r6.* A claim that names a second metric of the same clause can bind when that metric's words reach the label. The shape is contrived.
  - *r8 (fixed by the final review).* A year-end window after a comparison cue was given to the level figure. "Inventory was USD 31.6 billion at fiscal year-end." against the 10-Q sentence "Inventory was $31.6 billion, compared with $25.8 billion at fiscal year-end." validated at main, at B1's head and before the final review, because a window was never read as a comparison base, so the base's "at fiscal year-end" counted as the clause's own window. This predates the batch. A fix after the final review's re-review reads the fiscal year-end and a prior fiscal year-end as instants, which a comparison cue gives to the base as it does a date (`e420448`), so the claim is now unchecked. Validation: verification plan Task V7 probes it with this input to confirm that it stays unchecked.
  - *r9.* A prior quarter-end is not read as an instant, so the figure takes the 10-Q title's quarter. Against the 10-Q source "Inventory was $25.8 billion at the end of the prior quarter.", the false "Inventory was USD 25.8 billion this quarter." and "Inventory was USD 25.8 billion." validate, and against "Inventory was $25.8 billion at the previous quarter-end." the false "Inventory was USD 25.8 billion in Q2 FY2027." validates, on main and at `d783e37` alike ("at the end of last quarter" is unchecked at `d783e37`, where main validated it). This predates the batch. B2b takes it first, reading a prior quarter-end as an instant the way this batch reads a prior fiscal year-end. Validation: verification plan Task V7 probes it with these inputs.
  - *r10.* A period between two figures with no comparison cue goes to the first figure. Against the 10-Q source "Inventory was $31.6 billion, at the end of the prior fiscal year $25.8 billion.", the false "Inventory was USD 31.6 billion at the end of the prior fiscal year." validates and the true "Inventory was USD 25.8 billion at the end of the prior fiscal year." is contradicted, on main and at `d783e37` alike. This predates the batch. Validation: verification plan Task V7 probes it with this input.
  - *r11.* A parenthetical can hold a relative time that the period reader does not read, where the figure's own description, which stops at "(", does not reach it. Against the 10-Q sources "Inventory was $25.8 billion (last year, up from $20.0 billion two years ago)." and "Inventory was $25.8 billion (a year ago, up 29%).", the false "Inventory was USD 25.8 billion in Q2 FY2027." validates, on main and at `d783e37` alike; the plain "Inventory was $25.8 billion last year." and "... a year ago." leave it unchecked at `d783e37` (main validated both), because their own description holds those words. This predates the batch. Validation: verification plan Task V7 probes it with these inputs.
  - *r7.* Verify time on one excerpt still grows with the square of a whitespace run, though the number scanners are linear (SEC-203). Re-measured after the final review: an 80,000-character run of spaces takes about 3.3 s to verify where no move is near it, and in a base-first move about 10 s when the run sits between the direction word and "from" and 13 s when it sits between $A and "to" ("increased from $10 billion <run> to $12 billion"); each doubling of the run multiplies the time by about 4. The move rule makes those two shapes about 1.3 to 1.5 times slower than before it (6.7 s and 9.9 s at 80,000 characters at Task 9's head). This predates the batch. A different cost, found by the final review, is fixed and no longer part of r7: B1's comparison-base reader backtracked exponentially on comma-grouped table rows (about 1,000 characters of rows took 33.6 s); it now reads each amount one way. Validation: verification plan Task V7 probes the whitespace run with these inputs.
- **Options.** (a) Fix each now: the dash group also reads table change cells such as "75.0 % -3.9 pts" as signed changes, so changing it flips those cells outside AI-202's scope; widening the per-share words to "EPS" changes the record path (D-109) outside AI-403; r5 needs a rule that a claim's time words must be a time the source figure states for itself, not a comparison base. (b) Keep the readings, fail closed where they apply, and name them for the post-fix audit.
- **Choice.** (b); r9 is B2b's first task, and r5 is a candidate task for B2b.
- **Why.** The batch rule is the smallest change that fixes the whole class, no unrelated change; each fix moves verdicts outside the finding it would ride on.
- **Revises.** None.
- **Versions.** Unchanged by this entry.
- **Preservation.** Stored bytes unchanged.
- **Validation.** The post-fix audit (verification plan Task V7) is given every residual above as a named probe target, with its input; a confirmed defect becomes a follow-up finding.

## D-132 - Audit batch 8a: an accepted Retry of a data-only fallback runs (DB-001) (2026-10-29)

Audit 2026-10-27, batch B8, finding DB-001 (High), owner decision OD-5. The owner ruled on 2026-10-28 that this finding ships first as batch 8a; the rest of batch 8 follows as B8b.

- **Evidence.** A job whose judge failed ends `done` with a data-only fallback report linked. Retry is offered and the route admits it, because admission reads `linkedReportBlocksResume` (a data-only link does not block a resume). Dispatch then recovered the linked report before running and closed the queued retry as `done` with that same data-only report, so nothing ran, nothing was billed, and Retry came back unchanged.
- **Choice.** A queued retry is closed before dispatch only when `linkedReportBlocksResume` says the linked report blocks a resume. A data-only link falls through to dispatch. The retry then runs the judge and verify on the settled analyst passes (verify makes no model call, so only the judge is billed again). If it fails again, the runner writes its own data-only report and links it; the first stays in the history. If the dispatch itself fails, the job ends in `error` with a fixed, sanitized message (for example "scheduler pass resolution failed before execution"), keeps the fallback linked, and a later Retry from `error` is admitted. `recordQueuedResumeDispatchFailure` is a test seam with no production caller; the scheduler terminalizes its own claims.
- **Why.** Admission and dispatch now read one rule, so a Retry that is offered is a Retry that runs.
- **Not changed.** The payload fingerprint guard; the revision fence; D-67 (stored reports are never rewritten: a new attempt gets a new row); the recovery of a full linked report before dispatch (a full report still closes the queued retry as `done` with "covered by linked persisted report recovered before dispatch").
- **Versions.** Pipeline stage-c-1.6.13. Report spec, payload and Stage B are unchanged.
- **Preservation.** Stored reports keep their bytes.
- **Validation.** The DB-001 tests in `tests/jobRunner.test.ts`, with the `'{}'` control in `tests/jobScheduler.test.ts`; `tests/stageC.payload.passes.test.ts`, `tests/audit.fixtureComparison.test.ts` and `tests/audit.issuerFixtures.test.ts` pass unchanged, and `npm run audit:deltas` (dry run) shows no change.
- **Residuals.** A double-click on Retry, or a Retry while the job is active, is covered by the existing `claimPreparedJobResume` and `prepareJobResume` fences and is not separately tested. The rest of batch 8 follows as B8b.

## D-133 - A noncurrent-only vendor lease line is completed from its filing; stakes are filled on the vendor path (2026-10-29)

Audit of AMZN report #51 (2026-10-29): VAL-1 to VAL-4, VAL-10, FIG-1, FIG-2, FIG-4, GRD-01, KNW-03 and KNW-04. Extends D-98 (the stakes chain) to the provider path. The [disposition record](2026-10-29-amzn51-lease-scope.md) lists each finding, its commit and the replay.

- **Evidence.**
  - Report #51 ran on FMP statements. Its `capitalLeaseObligations` at 2026-06-30 was 94,338M, the 10-Q's `OperatingLeaseLiabilityNoncurrent` 82,575M plus `FinanceLeaseLiabilityNoncurrent` 11,763M, with no current portion. The SEC enrichment wrote `OperatingLeaseLiability` 96,320M and `FinanceLeaseLiability` 13,451M beside it, so the lease guard refused every balance (operating slice above the lease line): no WACC, DCF, fair value or scenario targets; balance sheet 42.73 (D), composite 54.34 (D).
  - The vendor total 223,232M also left out `LongTermDebtCurrent` 3,330M and `ShortTermBorrowings` 325M, and 15,433M of current lease liabilities; the filing composes 242,320M. The tagged-total backstop did not catch it because it counts finance leases against `LongTermDebt`.
  - The vendor's `longTermInvestments` was 0 with no source while the 10-Q tags `EquitySecuritiesWithoutReadilyDeterminableFairValueAmount` 122,300M and `EquityMethodInvestments` 395M, so the DCF bridge added no stake and net operating assets kept them, while the accrual note said they were excluded.
  - Diagnostics said "average total debt missing", "EV components missing (marketCap/totalDebt/cash)" beside all three, "EV is reported as-is" beside a null EV, a fair-value reason that listed possible causes, and "missing net debt input"; ROIC was withheld for every year with no manifest entry.
- **Options.**
  - (a) Keep refusing (the status quo): it withholds a WACC the filing establishes.
  - (b) Use the vendor total as served: it understates debt by 19.1B.
  - (c) Rebuild the whole balance from the SEC statements: that is the keyless path, and it would discard the provider row's other fields.
  - (d) Chosen: complete the row from one filing, only when every part is filed there, and refuse with the exact cause otherwise.
- **Choice.**
  - **Completion.** The trigger is a vendor lease line equal (within the lease guard's tolerance) to one filing's noncurrent operating plus noncurrent finance lease liabilities at the row's date, with no vendor current portion and no SEC provenance on the line. "No finance lease" is read only when every recognised finance-lease synonym (the synonym entry's `FinanceLeaseLiability` and `CapitalLeaseObligations`, with their current and noncurrent forms) is absent; any of them without `FinanceLeaseLiabilityNoncurrent` refuses the completion, naming the tag and amount (review round 5). The lease line becomes the filing's lease totals; a zero or absent vendor short-term debt becomes `LongTermDebtCurrent` plus `ShortTermBorrowings` and `CommercialPaper` where tagged (cross-checked against `DebtCurrent`), with `CommercialPaper` left out as a component of `ShortTermBorrowings` when both are tagged, the statements builder's rule through one shared helper (review round 4); total debt is that plus the vendor long-term debt (which must agree with `LongTermDebtNoncurrent`) plus the leases; net debt is recomputed. A filing whose `LongTermDebtNoncurrent` equals its `LongTermDebtAndCapitalLeaseObligations` while it tags noncurrent finance leases (Duke Energy, 2019 to 2021) is refused, since its noncurrent debt may already hold them (review m1). The guard also refuses Alphabet's 2023-12-31, 2024-12-31 and 2025-03-31 filings, which carry the finance leases outside noncurrent debt (the FY2023 10-K tagged `LongTermDebtAndCapitalLeaseObligations` 13,253 = 11,870 + 1,383), so it can withhold a correct completion; it is fail-closed, and for Alphabet, as filed, history-only at warn level (a filer whose latest filing had this shape would lose its latest balance and the WACC) (fix round 2, I-2b). A nonzero vendor short-term debt is kept, never added to: when the filing tags a current debt (`LongTermDebtCurrent` with `ShortTermBorrowings` and `CommercialPaper` where tagged; else `DebtCurrent`; else `ShortTermBorrowings` plus `CommercialPaper`, a 0 included; commercial paper beside the borrowings left out in either sum) it must agree with it, and when the only current-debt evidence is `LongTermDebtAndCapitalLeaseObligationsCurrent` it must equal that figure less `FinanceLeaseLiabilityCurrent` (the figure itself when no finance lease is filed; a refusal when finance leases are filed without that tag); filed without `LongTermDebtCurrent` beside `DebtCurrent`, `ShortTermBorrowings` or `CommercialPaper`, the combined tag refuses the completion, naming the tags and amounts, since it holds current maturities no checked tag names (review round 6), and when the filing tags none of these five it must not equal a current lease amount (fix round 2, I-1; review round 5). The texts name the tags and amounts checked. Filings are tried newest first. Provenance and the raw vendor total are kept; one info entry lists every completed date (review m6). The lease guard's tests are unchanged; its messages name the values and each operand's scope.
  - **Current debt.** A vendor short-term debt of 0 beside a positive filed current-debt tag withholds total and net debt. It is kept when the vendor folded its current maturities into long-term debt: the vendor long-term debt equals the same filing's `LongTermDebtNoncurrent` plus `LongTermDebtCurrent` (within max(1, 1e-6 of the sum)) and the filing tags no other current debt (`ShortTermBorrowings` and `CommercialPaper` absent or 0, `DebtCurrent` absent or equal to `LongTermDebtCurrent` within that tolerance) (review m4). A `DebtCurrent` of 0 beside positive current maturities contradicts the filing and withholds (fix round 2, I-2a). A `DebtCurrent` above the current maturities may hold current finance leases, so it still withholds: fail-closed, and recorded as a residual.
  - **Bridge and EV.** The current-capital "total debt including leases" is withheld, with the refusal, when the guard or the admission refused the row, and a composed total is described as composed. A provider EV is withheld at a date whose debt was refused or recomposed to another total.
  - **Stakes.** A provider `longTermInvestments` of 0 or absent is undisclosed when the same-period filing shows noncurrent investments, and is filled with D-98's chain (same tags, period and currency), at enrichment and in Stage B's balance admission; one info entry lists every filled date. A nonzero, refused or SEC-built value is left alone. The accrual note claims long-term investments are removed from net operating assets only when some are.
  - **Truthful diagnostics.** A value that exists but was refused is named as withheld, with its refusal, in net debt, EV ("EV withheld: <reason>"), invested capital and net debt/EBITDA; "missing" is kept for an absent value. The DCF gap quotes why the WACC is unavailable and a suppressed fair value quotes the DCF or bridge gap. ROIC years withheld by a refused input get one `returns.roic` entry. It is critical only when the latest fiscal year's ROIC is withheld by the same balance's debt refusal that withholds the WACC, and a warning otherwise (review ruling I-1: severity raises the critical count, the banner and the manifest order, and grades nothing). The operating-lease scope note says what it compared. A market cap withheld on share scope is named as withheld, with its reason, in the WACC, DCF and fair-value lines and the multiples' market-cap entry (fix round 2, M4), and the net-debt entry mentions FMP's cash-only `netDebt` field only for a balance from FMP (review m5); the vendor-convention diagnostic keeps the vendor's own net debt (review m8).
- **Not applied.** The audit brief's rule that a debt-only aggregate is compared without finance leases. Alphabet files its finance leases inside `LongTermDebt` (2019-12-31: `LongTermDebt` 4,685M against `LongTermDebtNoncurrent` 3,958M plus `FinanceLeaseLiability` 711M), so the rule withheld its 2019 to 2022 and 2025 debt: net debt null, DCF 215.43 to 203.91, composite 61.36 to 54.28 and latest ROIC 36.73% to withheld, on no defect. No alternative rule is guessed; the current-debt check catches the Amazon shape.
- **Why.** Under ASC 842 a classified balance sheet carries each lease liability as a current and a noncurrent part (Amazon's 10-Q tags both), so a line equal to the noncurrent parts is a scope, not a total, and the filing that tags both parts is the evidence that completes it. D-73 (keep a debt refusal rather than publish a partial or older balance) and D-98 (count the stakes a filing tags, never estimate the rest) carry over.
- **Revises.** D-98 (stakes now also on the provider path). The CODE-1 scope note (audit 2026-10-19) keeps its rule and changes its wording.
- **Versions.** Report 1.48.0, payload 1.50.0 and Stage B ACCOUNTING_EVIDENCE_29 mark these conventions; pipeline stage-c-1.6.12 and the score bands are unchanged. The DEMO control moves only its report stamp (group `amzn51-lease-scope-20261029`), and the payload golden moves only its versioned header.
- **Preservation.** Stored reports and snapshots keep their bytes (D-67). Report #51 is not rewritten.
- **Validation.**
  - `tests/edgar.noncurrentLeaseLine.amzn51.test.ts`, `tests/stageB.incompleteDebtTotal.amzn51.test.ts`, `tests/edgar.vendorStakes.amzn51.test.ts` and `tests/stageB.truthfulRefusals.amzn51.test.ts` (each new test failed first, except the controls).
  - Replay of report #51's frozen inputs with no provider or model call: WACC 10.47%, DCF and fair value $116.12 (scenarios $100.33 / $116.12 / $136.37), net debt/EBITDA -0.29, total debt including leases 242.32B, ROIC 20.63%, valuation 34.44 (F), quality 74.52 (B), balance sheet 56.11 (C), moat 63.53 (C), composite 56.11 (C), no critical gap; every figure equals the audit's counterfactual with the composition and the stakes. The 45 census snapshots move no figure; NVDA runs #48 to #50 gain two EV own-history quarters (2022-07-31 and 2022-10-30) and keep their headline figures.

## D-134 - Audit 2026-10-27 batch B13: operating lines derived from filed tags are the filer's totals, on one presentation (2026-10-29)

Audit 2026-10-27, batch B13: FIN-507, FIN-507-V1, FIN-508, FIN-509, FIN-509-V1, FIN-510, FIN-510-V1, FIN-510-V2, FIN-511, FIN-511-V1 and FIN-511-V2, with two tasks added during the batch (10b, from the R1 pre-flight review, I3; 9b, from the replay). GRD-03 is not in this batch: it moved to batch R1c. The owner delegated the calls ("use your recommendation based on research to make this a professional accurate repository"); following the one-entry-per-batch practice, OD-1 to OD-6 are recorded here, one bullet each, with their full sources in the batch plan (`docs/superpowers/plans/2026-10-27-audit-fix-14-edgar-derived-lines.md`) and the [disposition record](2026-10-27-audit-batch-b13-edgar-derived-lines.md). Conflict C-9 and open item O-1 were decided by the main session on the owner's delegation (decisions spec, sections 4.3 and 4.5). Every rule is class-wide; none names a ticker. Where the plan's text and a later review differ, the rules below are the code's.

- **Evidence.**
  - FIN-510 (High): D&A took the first combined tag with the period, so McDonald's FY2025 D&A was 457M (`DepreciationDepletionAndAmortization`, a subset line) beside its own `Depreciation` of 1,600M and `DepreciationAndAmortization` of 2,199M. FIN-510-V1 (Low): the same first-hit rule gave Johnson & Johnson's annual R&D as 109M against 14,665M on the face, JPMorgan's interest income as 28.0B against 193.3B and Home Depot's deferred revenue as 1,500M against 2,575M. FIN-510-V2 (Low): the REIT FFO stand-in for total D&A had its own first-hit chain.
  - FIN-507 (High): the derived EBIT required an interest operand even where B-39 would drop it, so Eli Lilly's 2026 quarters (pretax income and the `NonoperatingIncomeExpense` aggregate filed, no interest element) had no operating income, silently, and its DCF seeded from the five-year median margin ($842.45 a share instead of $1,079.16). FIN-507-V1 (Low): the derived EBIT read pretax income without the B-32 domestic + foreign composition and called such a filer "a bank-style filer".
  - FIN-508 (Medium): B-39 was keyed on the interest tag that served, so Lilly's FY2022 and FY2023, whose interest the filer re-tagged as `InterestExpenseNonoperating`, kept the older tag and counted the interest twice (+331.6M, +485.9M) under a caveat saying this cannot be checked.
  - FIN-509 (High): with no aggregate filed, the derived EBIT kept a filer-tagged `OtherNonoperatingIncomeExpense` inside operating income, unnamed: J&J's quarter ended 2026-09-27 was 65M instead of 5,845M. FIN-509-V1 (Medium): the keyless one-time-items rule reads only the aggregate, so it never ran for filers tagging only the "other" line, and nothing said so.
  - FIN-511 (High): a derived fourth quarter netted a year that a later 10-K re-presented against nine months on the old basis: Bank of America's Q4 FY2024 revenue printed $29.32B. FIN-511-V1 (Medium): trend growth cells divided quarters on two presentations (BAC Q3 FY2025 QoQ +2.4%, +6.1% on one basis). FIN-511-V2 (Low): the vendor enrichment kept its own date-lineage derivation, so it refused a one-basis vendor operating cash flow against a mixed quarter and filled a missing finance-lease principal with one.
- **OD-1. A period with the non-operating aggregate and no interest element (FIN-507).** Chosen: extend B-39. EBIT is pretax income less the `NonoperatingIncomeExpense` aggregate, disclosed: no interest element is filed, and an interest line outside the aggregate would leave the figure understating EBIT by that interest. With neither the interest nor the aggregate, the derivation is refused and `operatingIncome` and `ebit` are withheld naming the missing operand: never a silent null, and never the bank text on the general route. Rejected: withholding the quarter (it drops Lilly's two newest quarters for an operand that cannot change the B-39 result, and its DCF falls to $842.45); adding back a zero interest (it invents a value). Revises D-105 (B-39), whose scope now also covers a period with the aggregate and no interest element, and METHODOLOGY "Operating income when interest sits inside the non-operating total (B-39)". Sources: SEC Regulation S-X Rule 5-03, captions 7 to 10; XBRL US rule DQC_0181.
- **OD-2. A filer-tagged `OtherNonoperatingIncomeExpense` when the aggregate is absent (FIN-509).** Chosen: subtract it. It joins `EBIT_NON_OPERATING_ADJUSTMENTS` with `componentOf: "NonoperatingIncomeExpense"`, so it is subtracted only when the aggregate is not filed, never twice. Every derived-EBIT disclosure names each subtracted item with its amount, and when the "other" line is subtracted and an interest expense was added back, a caveat states the net interest added back (interest expense less the investment income subtracted) as the amount by which EBIT is overstated if the "other" line already holds that interest. The guard is the taxonomy definition plus that disclosed band, not a runtime test: companyfacts carries no calculation linkbase, and a filer with no `OperatingIncomeLoss` has no independent operating subtotal to test against. Rejected: a note only (J&J's EBIT stays 65M, a 0.3% margin); subtracting only a "small" line (no basis in a standard). Revises the three-element adjustment list of commit 63e4fda (no D-entry) and the derived-EBIT wording for an absent aggregate; METHODOLOGY's "removes the non-operating results the filing discloses" now holds. Sources: S-X Rule 5-03 captions 7(d), 8 and 9(b); DQC_0181; eBay's FY2014 10-K R page "Interest and Other, Net (Details)", the interest-inclusive counterexample.
- **OD-3. No stand-in for the keyless one-time-items operand (FIN-509-V1).** Chosen: when no lookback year has both operands, `computeSupportFlags` adds an info gap `forensics.flags.oneTimeItems` saying the rule was not evaluated and why; no stand-in. Rejected: `OtherNonoperatingIncomeExpense` as the operand (it holds recurring interest at some filers, NNN among them, which would raise false serial-one-time-items flags, and it is narrower than the aggregate the 10% threshold was set on); pretax income less operating income (a new method, with interest-driven breaches at 12 panel filers). Revises RESEARCH "5.3 One-time items", whose "Missing operands are unevaluable" now says the gap is disclosed; no D-entry existed for the rule. Sources: RESEARCH 5.3; the eBay R page and the NNN arithmetic; the forensic module's own rule that a check that cannot run emits a disclosed gap.
- **OD-4. Which first-hit synonym is the total (FIN-510, FIN-510-V1, FIN-510-V2).** Chosen: fix the class in the synonym resolver. A `first` step gains component floors (`unlessBelow`, with `unlessBelowTag` for one synonym): a synonym below the same period's value of a listed component, beyond the rounding allowance, is skipped with a note and the next synonym is tried; if none passes, the chain falls to its next step. Floors are declared only where a us-gaap definition puts the component inside the figure: D&A (`DepreciationDepletionAndAmortization`, `DepreciationAndAmortization`, `DepreciationAmortizationAndAccretionNet`) against `Depreciation` and `AmortizationOfIntangibleAssets`, and `DepreciationDepletionAndAmortization` also against `DepreciationAndAmortization`, never the reverse (McDonald's quarters); `ResearchAndDevelopmentExpense` against `ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost`. A floor compares the same period only. With no combined tag that passes and no `Depreciation` filed, D&A is withheld with the reason (B-7: amortization alone is never D&A). The REIT FFO stand-in applies the same predicate. A bank-routed filer's `interestIncome` resolves to `InterestIncomeOperating`, then `InterestAndDividendIncomeOperating`, then the investment-income elements; the non-bank order is unchanged. Rejected: the largest synonym (it can pick accretion or another scope); a floor at the sum of depreciation and amortization (overlapping scopes and rounding reject correct totals); a lower-bound caveat on a figure known to be partial; a floor for HD's sibling deferred-revenue elements (no definitional order, no consumer). Revises METHODOLOGY "D&A from separate lines (B-7)", the tagSynonyms header ("the first tag present for the period wins", now "unless it is below a component the line item declares"), the FFO stand-in's stated error direction (the comment on `GENERIC_IMPAIRMENT_TAGS` in `src/pipeline/stageB/financialMetrics.ts`; D-31 itself, "always approximate" with no guaranteed error bound, is unchanged) and the bank interest-income pin in `tests/edgar.statements.test.ts`. Sources: the us-gaap definitions of `DepreciationDepletionAndAmortization`, `DepreciationAndAmortization`, `Depreciation` and the two R&D elements, as the plan quotes them.
- **OD-5. Derived fourth quarters and year-to-date differences on one presentation (FIN-511, FIN-511-V2), with conflict C-9.** Chosen: every quarter derived by subtraction (the year less the nine-month year to date, a year to date less the previous one, the year less three quarters) is paired by one helper, `oneBasisPair` (`src/edgar/presentationLineage.ts`), which the statement builder and `financialEnrichment.filedFlow` both call:
  - The newest copy of the minuend counts as re-filed only when it is not the first-reported copy, carries a different value and is not an amendment (review sharpening 2: an amended 10-K keeps its corrected figure). A minuend that is not re-filed, or whose subtrahend moved with it (review sharpening 1: a re-presentation sequenced through a 10-Q and then the 10-K, SEC FRM 13110.4), keeps today's pair.
  - C-9: a re-filed minuend whose subtrahend did not move with it gives the quarter as first reported only for a re-filing within 1% or a re-presentation the re-filing labels with a discontinued-operations line. A material, unlabelled re-filing withholds the quarter, naming both filings and the move, because a corrected figure replaces the original (ASC 250-10-45-23; this agrees with B6 OD-9) and companyfacts cannot tell a correction from an unlabelled re-presentation. A first-reported copy with no subtrahend filed on or before it is withheld too.
  - OD-5 (a2′): a material, unlabelled re-filing of a subtrahend made after the minuend's filing withholds the quarter in the same way; the later copy is still never netted (D-13). This revises the D-13 pin in `tests/edgar.statements.test.ts` (now "withholds the quarter when a LATER filing restated the year-to-date figure and labels no re-presentation"). The plan expected no census figure to move; in the replay this rule withholds 5 census cells (American Tower's common and net dividends for Q2 2024, Alphabet's buybacks for Q3 2025, Oracle's common and net stock issuance for Q2 FY2026) and AEP's income taxes paid for Q2 2025 among the filers without a snapshot, none in a Stage B window.
  - Rule (b): a quarter is also withheld when the minuend's filing re-presented earlier periods of the concept (a copy moved by more than 1% from the copy filed just before it; only an amendment is excused for its own year) and a filing that supplies a subtrahend did not.
  - A presentation withholding ends the field in every chain: no narrower synonym, stand-in (cash interest paid for interest expense) or derivation (consolidated profit for profit attributable to the parent, derived EBIT for a filed operating income) serves it. The exception is a combined synonym that the component floor would skip as a subset line: it gives way to the next synonym (B13 final review M-6). It is judged against each floor tag by the filings that carry both tags for the periods the quarter nets, as a withheld floor tag is, and by its as-filed derived quarter only against a floor tag no filing carries beside it (final re-review N-1).
  - A derived EBIT whose adjustment or optional interest part is withheld for presentation is itself withheld, quoting that reason, when the derivation uses that operand. An operand it does not use never refuses the EBIT (B13 final review I-1), and is resolved quietly for its disclosure only: a component inside a `NonoperatingIncomeExpense` aggregate that served, a not-in-base tag (an equity-method result beside a pretax element measured before it), or interest the B-39/FIN-508 nesting leaves out beside a served aggregate (the withheld tag is `InterestExpenseNonoperating`, or another filing tags the period's interest that way). An adjustment filed in another currency or period never becomes a withholding beside a published EBIT: beside the aggregate it is named as already inside it, and otherwise it is not subtracted and is named in the error band with why (M-3).
  - Rejected: netting a later re-presented nine-month copy (it can carry a further event); keeping the mixed pair for a small re-filing; the first-reported pair for every material re-filing (the reviewed rule before C-9: a correction supersedes that copy); reading net-income invariance as a label (a classification error leaves net income unchanged too); withholding every quarter whose year was re-filed; the planner's first draft (switch on any re-filing, which regressed a 10-Q-sequenced re-presentation and a 10-K/A).
  - Revises D-13 ("one filing lineage" now means one presentation, filing-date lineage being the minimum) and `src/edgar/statements.ts` invariant 3. Sources: ASC 250-10-45-23 (PwC Viewpoint 30.7); ASC 205-20-45-3 and 45-3A (Deloitte Roadmap 7.3); the SEC's EDGAR API documentation (companyfacts carries only facts that apply to the entire filing entity, so a restatement-axis label does not reach it); SEC FRM 13110.3, 13110.4 and 13210.1; D-13.
- **OD-6. Quarterly growth across a re-presentation (FIN-511-V1).** Chosen: a cell is computed on the basis of the quarter it is printed beside. Where the comparison quarter was re-presented by a filing newer than the printed quarter's own and the printed quarter was not, the cell divides by the comparison's first-reported copy when that copy was filed on or before the printed quarter's filing and is positive, with a note naming it and the re-presenting filing (Bank of America Q3 FY2025 QoQ: 28,088 / 26,463 = +6.1%); otherwise it is a dash. Where the printed quarter was re-presented and its comparison has no copy on the new basis, the cell is a dash with a note. Where the printed quarter's own filing re-presented earlier periods and the filing supplying the comparison did not (rule (b) on the pair, read from the row's `revenuePresentation` marker), the cell is a dash with a note. Every other cell is unchanged, FMP-route rows keep plain arithmetic, and a dashed cell registers no payload figure. O-1 keeps this after C-9: a rate on the printed quarter's own filed basis publishes no superseded level. Rejected: first-reported growth everywhere (the row would not reconcile); a dash everywhere (it would blank year-over-year cells for up to two years under FRM 13110.4). Revises D-13 (extended from the derived quarter to the growth cells) and the trend-table note, whose one-presentation sentence appears only where the check ran (`quarterlyTrendPresentationChecked`, Task 9b). Sources: FRM 13110.4; D-13.
- **FIN-508 (no owner decision).** B-39 is keyed on the period, not on the interest tag that served: when any filing tags the period's interest as `InterestExpenseNonoperating`, the interest is inside the aggregate and is not added back (DQC_0181), even when that tag's quarter is itself withheld for presentation. The "this cannot be checked" caveat (`EBIT_AGGREGATE_MAY_HOLD_INTEREST`) is now carried only where interest is added back beside the aggregate, that is where no filing tags the period's interest that way.
- **FIN-507-V1 (no owner decision).** The derived EBIT's pretax operand reads the same chain as `incomeBeforeTax` (`INCOME_BEFORE_TAX_SPEC`): the filed total, else the B-32 domestic + foreign composition, a mechanical extension of B-32; the disclosure says when the composition was taken as the full total.
- **FIN-510-V2 and FIN-511-V2: shared predicates (no owner decision).** The FFO stand-in calls the builder's floor predicate (`belowComponentFloor`) with the same allowance, and the vendor enrichment calls the builder's pairing helper with the same label test, so a derived value means the same thing on both paths. The enrichment's texts call a derived SEC value "derived", with its period and its two filings, and a vendor figure that a withheld pair leaves unverified is disclosed in one info entry per field.
- **Ruling B: the vendor allowance for a derived SEC value (FIN-511-V2; controller ruling of 2026-10-29, revising A-11 for derived values only).** For a derived SEC value, a vendor figure agrees within max(A-11's allowance, min(the sum over the operands of half each operand's rounding unit, 1% of the larger figure)). An operand's rounding unit is the largest power of ten up to 1,000,000 that divides it exactly; a zero gives 1 and a figure with a fraction gives 0. The operands are the filed copies the compared figure nets: two, or four for short-term sales plus maturities, which can reach 2,000,000 before the cap. A directly filed value keeps A-11 unchanged. AEP's FY2024 operating cash flow, re-rounded from 6,804.3M to 6,804.0M, less nine months of 5,076.9M gives 1,727.1M, which a vendor 1,727.4M now matches (0.55M of operand rounding). The rule covers the enrichment's cash-flow and lease comparisons; the income-classification check still uses A-11 alone (routed to R1a Task 25). Why: a figure the filing states only to the million is uncertain by half a million, and the 1% cap keeps A-11's bound, so 2M against 1M, a zero against a nonzero figure and a sign change stay conflicts.
- **Bank of America's fair value.** Task 7 withholds BAC's Q4 2025 revenue, pretax income and tax under rule (b), because the 10-K of 2026-02-25 re-presented earlier periods and the 10-Q of 2025-10-31 that supplies the nine months did not. Main's existing whole-row TTM revenue gate (`revenueCount < 4` in `src/pipeline/compute.ts`) then drops the trailing twelve months, so the excess-return model uses audited FY2025: fair value $45.79 to $41.40 a share, composite 58.65 to 57.87 (C). The fallback is disclosed ("revenue present in only 3/4 latest quarters — TTM basis suppressed ...; latest annual statement used instead"). The gate is not changed here, because it serves every TTM consumer; per-field TTM net income and ROTE that survive a revenue quarter withheld for presentation are routed to B5.
- **House constants.**
  - `SYNONYM_FLOOR_TOLERANCE` = { relative: 0.005, absolute: 2,000,000 }: a non-negative candidate is below a positive component only when it is below it by more than the larger of 0.5% of the component and 2,000,000 in the row's currency. Revisit it if a census replay shows a floor that should have fired staying silent.
  - `RESTATEMENT_THRESHOLD_PCT` (1%), reused as the re-presentation threshold: for a re-filed minuend or subtrahend, for a filing that re-presented earlier periods and for a moved discontinued-operations line.
  - `ROUNDING_UNIT` (1,000,000) and `ROUNDING_ALLOWANCE` (500,000): a later money copy that is a whole multiple of a million and within half a million of the earlier copy only re-rounds it and is not a move (Task 7 review, I2), so such a re-filing keeps the as-filed pair.
  - The first-reported minuend stands in only when the subtrahend did not move with the minuend, the winner is not an amendment, and the re-filing moved it by at most 1% or labels the period a re-presentation (a non-zero `DISCONTINUED_LABEL_TAGS` fact for the period in the re-filing that is new there or moved by more than 1% from its first-reported copy); otherwise the quarter is withheld (C-9). The same threshold and label test is applied to every subtrahend of a kept pair against its newest copy filed after the minuend's filing (OD-5 (a2′)).
  - A presentation refusal ends the field: no later synonym, stand-in or derivation of any chain serves it (the plan said it ends its synonym step; the Task 7 review made it the whole field), except the M-6 subset skip above.
- **Versions.** Report 1.49.0, payload 1.51.0 and Stage B ACCOUNTING_EVIDENCE_30 mark these conventions; pipeline stage-c-1.6.13, the score bands and `FAIR_VALUE_METHOD_VERSION`, `SCENARIO_TARGET_METHOD_VERSION`, `SCENARIO_PATHS_METHOD_VERSION` and `NET_DEBT_RESOLVER_VERSION` are unchanged: no Stage C pass, band table, valuation method or resolver changed, only the filed inputs they read. `EDGAR_DERIVED_LINES_SINCE_SPEC_VERSION` is frozen at "1.49.0" and is never compared with `REPORT_SPEC_VERSION` itself. The DEMO delta group `b13-edgar-derived-lines-20261029` holds only the report stamp; the payload golden moves its version header and gains the FIN-509-V1 entry and its citation (+429 bytes).
- **Preservation.** Stored reports and snapshots keep their bytes (D-67). A report before spec 1.49.0 whose income statements were built from SEC filings, in full (an exact `keyless.incomeAnnual` or `keyless.incomeQuarterly` entry starting "served by edgar") or for older backfilled periods, is shown through `withLegacyEdgarDerivedLines` with fixed notes on its fair-value basis, its quality notes and, when an income restatements entry names revenue or ends "and N more", its quarterly trend; a provider-route report is returned unchanged (Task 10b).
- **Validation.**
  - `tests/edgar.derivedLines.audit20261027.test.ts`, `tests/edgar.presentationLineage.audit20261027.test.ts`, `tests/edgar.financialEnrichment.q4Basis.audit20261027.test.ts`, `tests/filingDisclosures.trendBasis.audit20261027.test.ts`, `tests/stageB.reitFfoTotalDa.audit20261027.test.ts`, `tests/stageB.forensics.oneTimeGap.audit20261027.test.ts` and `tests/report.legacyEdgarDerivedLines.test.ts`; each new test failed first, except the controls.
  - Replay of the 45 census snapshots and the stored provider runs, main `ca3726b` against the branch at `61b2841`, offline with no provider, SEC or model call: 625 census cells move, every one attributed to a task and a filed figure; no forensic flag moves; Task 8 moves no value. The only band moves are Eli Lilly's (business quality C to B, 69.79 to 70.91; balance sheet ungraded to C, 68.57), with its DCF $842.45 to $1,079.16. Other headline moves: J&J DCF $129.37 to $141.18 and EV/EBITDA 24.98x to 19.74x; BAC fair value $45.79 to $41.40; McDonald's FY2025 D&A 457M to 2,199M and net debt/EBITDA 3.352x to 2.952x; Cisco's FY2025 and FY2026 D&A withheld; JPMorgan's FY2025 interest income 28,032M to 193,341M; composites of J&J, Realty Income, ExxonMobil, Chevron and Cisco within 0.1 of their main values. The table is in the disposition record.
- **Limits.** The residual list in the disposition record names where each is routed: B5 (the BAC TTM, and FIN-402's possible second removal of a charge inside a subtracted "other" line), R1a Task 25 (income classification against a derived quarter), R1a Task 12 (`millionsPair` for R0's texts), R1 addendum 3 (the pre-existing keyless enrichment self-conflicts at McDonald's and Walmart), B4 (its XOM and JNJ baselines move with FIN-509), and the post-fix audit (verification plan Task V7) for the rest.

## D-135 - Audit 2026-10-27 batch B4a: the equity bridge, EV and invested capital count every claim once (2026-10-29)

Audit 2026-10-27, batch B4, part A (B4a): FIN-103, FIN-119, FIN-119-V1, FIN-119-V2, FIN-303, FIN-303-V1, FIN-108, FIN-304, FIN-305, FIN-305-V1, FIN-305-V2, FIN-403, FIN-404, FIN-109 and FIN-311, three of them High (FIN-119, FIN-303, FIN-305). Part B (B4b: convertibles, equity-method stakes, fair-value financial assets) is a separate batch with its own entry. The owner delegated the calls ("use your recommendation based on research to make this a professional accurate repository"); following the one-entry-per-batch practice, OD-1, OD-3, OD-4, OD-6, OD-7 and OD-8 are recorded here, one bullet each, with their full sources in the batch plan (`docs/superpowers/plans/2026-10-27-audit-fix-04-equity-bridge-and-invested-capital.md`) and the [disposition record](2026-10-27-audit-batch-b4-equity-bridge.md). The after-tax convention of OD-4 was decided by the main session on the owner's delegation (decisions spec, section 4.3). Every rule is class-wide; none names a ticker. The number D-135 is next after B13's D-134 and is renumbered at merge, with the stamps below, if another batch lands first.

- **OD-1: redeemable (temporary) equity is a claim senior to common.**
  - Decision: one house definition of claims senior to common: permanent preferred plus redeemable preferred (`TemporaryEquityCarryingAmountAttributableToParent`), and book NCI plus redeemable NCI (`RedeemableNoncontrollingInterestEquityCarryingAmount`). The DCF bridge deducts the redeemable preferred beside preferred; the redeemable NCI joins book NCI as the book floor of E-5's `max(book, profit share x consolidated equity value)`, so it is never deducted twice. The market EV, the own-history EV and the REIT EV add both. Invested capital (ROIC, sales-to-capital, the A-2 history) adds the admitted total, because the cash it raised is already netted. The claims reach every guard that asks whether preferred or NCI exists: forecast operating EPS, the P/FCF cash-ownership guard and the own-history common-allocation checks.
  - A null book NCI is never read as 0 plus the redeemable NCI (pre-flight I2): the per share stays withheld under E-5 and the reason names the redeemable NCI. A total with no parent/NCI split is deducted beside preferred, and withholds the per share when E-5's earnings-share basis would apply (`valuation.dcf.temporaryEquityAllocation`). An operand Stage A refuses (a conflict, a non-finite value) withholds what it touches, at warn severity, and is never zero-filled (D-87); a refused year is a non-debt refusal in ROIC's existing refusal list, so it never turns R0's WACC-balance critical rule on (I3).
  - In the P/FCF guard a redeemable NCI takes the book-NCI materiality floor (SNOW-2): it withholds unless the book NCI is known and the book and redeemable NCI together, and the NCI income, are each at most 1% of consolidated equity; a redeemable preferred, an unsplit amount or a refused operand withholds at any size. The replay found the missing floor withholding Tesla's P/FCF for a claim 0.004% of its market cap.
  - Residual: the parent part can also hold redeemable common stock (ESOP puts, SPAC Class A) that the diluted count already holds, which companyfacts cannot separate; the bridge note says so in the report itself.
  - Measured at main (I1): temporary equity is present for UNH, WMT, TSLA, T and CMCSA, and in history years for NEE, DIS and CVX.
  - Rejected: disclose only (it leaves a known, sourced claim inside common equity); deduct redeemable NCI outside E-5 (it double counts whenever the earnings key applies); zero-fill a refused allocation (D-87).
  - Revises: D-87's scope note (this entry is the admission basis it asked for); extends E-5 (D-102) with the redeemable floor.
  - Sources: Deloitte Roadmap, *Noncontrolling Interests* 9.4, and *SEC Comment Letter Considerations* 2.16 (redeemable equity "should not be included in any total or subtotal captioned 'total equity'"); Koller, Goedhart and Wessels, *Valuation*, 7th ed., ch. 16.
- **OD-3: one lease basis for invested capital.**
  - Decision: extend D-25 and D-97 item 3. On the default switch every invested-capital consumer (DCF sales-to-capital, the A-2 history row by row, ROIC) removes the operating-lease slice from total debt exactly when the bridge does: the slice is positive, at most total debt, and `operatingLeaseScopeUnproven` is null (the CODE-1 proof). One shared predicate, `operatingLeaseOutOfDebt`, replaces the per-consumer copies. With the lease-inclusive switch set every consumer keeps the slice; an unproven row keeps total debt as reported, and its note says the scope is unproven.
  - One lease basis per A-2 median: the history is measured on the current balance's basis, and a year whose scope is unproven cannot be put on the lease-excluded basis, so it is left out of the median with a note, never kept lease-inclusive beside lease-excluded years.
  - Lease-emptied capital (I6): when the lease leaves debt and invested capital is not positive, sales-to-capital takes the issuer's own history on the same basis (at least three usable years, `S2C_HISTORY_MIN_YEARS`, within the house cap); otherwise the DCF is withheld with a warn gap naming the invested capital and the lease basis (lead `LEASE_EMPTIED_CAPITAL_LEAD`; warn, not critical, because main published a DCF on the lease-inclusive capital and a critical gap would block the report; the fair value and scenario targets quote it). It never falls back to the mixed basis.
  - Rejected: a lease-inclusive sales-to-capital on purpose (it charges leased capacity twice); capitalising leases everywhere (D-25 option b).
  - Revises: nothing; it applies D-25 and D-97 item 3 to omitted consumers. It supersedes the batch-2b review row that treated leases as capital for the A-2 history without a D-entry (`docs/audit/2026-10-22-audit-batch2b-valuation-mediums.md`, left as history).
  - Sources: CBIZ, "What changes to the lease accounting standards means for business valuation" (ASC 842 expense stays above EBITDA; mixing the two bases diminishes value); D-25.
- **OD-4: debt-like obligations beyond E-7, all deducted after tax.**
  - Decision: pension and OPEB deficits, loss-contingency accruals and contingent consideration join E-7's reader and bridge lines. Read at the bridge date, else the latest filed balance within a year (no further back than an annual balance sheet that no longer tags it); a balance filed as zero ends the look-back. Pension takes the broadest recognised family at the date, never summed across families, in the order (a) `PensionAndOtherPostretirementAndPostemploymentBenefitPlansLiabilities`, (b) `PensionAndOtherPostretirementDefinedBenefitPlansLiabilities`, (c) the defined-benefit pension plus the other postretirement liability; the look-back is date first (each date newest first, the families in order at each date). Overfunded plans are not credited, and postemployment benefits count only inside family (a). A current-only loss-contingency accrual or earn-out counts as the whole, and only the amount above any same-date environmental accrual is deducted for loss contingencies. None joins the market EV, and the EV basis says so.
  - Tax: all five families (asset-retirement, environmental, pension and OPEB, loss contingencies, contingent consideration) are deducted at `net x (1 - rate)`, with `rate` the D-98 marginal-rate floor the bridge already uses for its investment tax (21% for a US domicile, 15% elsewhere; no new rate). `net` is the amount E-7 deducted before (after a settlement-fund offset), so the relief never applies to the offset; each claim stays one netted line labelled "(filed, after tax at {rate}%...)". The closing note says the relief is approximate: state and local taxes are omitted, the deduction is assumed taken against taxable income when paid, and a payment that is not deductible (a government fine or penalty, 26 U.S.C. section 162(f)) or that only adds to tax basis (contingent consideration: the acquired assets' basis, amortised over 15 years for intangibles, or the acquired shares' basis, recovered only on a sale) is credited a relief it will not earn, or not for years. With no resolved rate the full amount is deducted and E-7's before-tax sentence is kept. This revises E-7's before-tax choice (D-104) and resolves known issue B2b-1; it was decided by the main session on the owner's delegation (decisions spec 4.3). For a pension deficit, `net x (1 - rate)` is the after-tax cost of funding it at once; the bridge does not model a slower schedule, which costs more in present value.
  - Rate-regulated utilities (I7): a filer whose SIC is 4911, 4923, 4924, 4931, 4932 or 4941 (the codes `src/edgar/sic.ts` maps to a regulated electric, gas or water utility or a diversified utility; the first ruling's range 4900-4991 was withdrawn because it caught waste haulers, pipelines and cogenerators) is read as a rate-regulated utility (ASC 980) and has its pension and OPEB deficit disclosed, not deducted (a filer under 4911 whose rates do not recover the deficit, such as a merchant generator, is overstated by it after tax, and the note says so), because the offsetting regulatory asset is reported only in dimensional XBRL, which companyfacts does not carry. An unknown SIC is read as not a utility, with an info gap raised only when a pension line is actually deducted. Loss contingencies and earn-outs are still deducted at a utility. Residual, routed to the free-data-source batch: net the deficit against the pension regulatory asset once dimensional XBRL is available.
  - Rejected: disclose only; before tax for all five (E-7's convention and this plan's first version: practitioner and academic sources measure a pension deficit net of tax); after tax for pension alone (two tax conventions in one bridge); the filer's own deferred-tax asset per obligation (not tagged consistently, batch 2b's reason); a separate positive "tax relief" line (the bridge surfaces read only a component's sign); crediting overfunded plans (a US employer reversion pays a 20% excise tax, 50% unless a replacement plan, IRC 4980); adding pension to the market EV (the own-history EV ranks would compare two definitions).
  - Revises: E-7 (D-104): scope from two tag families to five, the tax convention from before tax to after tax for all five, and "a current portion alone is not the obligation" for the loss-contingency and contingent-consideration families only; it also revises `docs/audit/2026-10-17-book-to-code-disposition.md` (pensions listed as future liquidity work only). D-104's text and `docs/audit/2026-10-22-audit-batch2b-valuation-mediums.md` are history and stay as written; this entry supersedes their before-tax sentences ("the deduction is before tax" and "(filed, before tax"), which remain only as the no-rate branch and as the legacy-report detector in `src/report/legacyBridgeMethod.ts`.
  - Sources, as the plan recorded them (checked 2026-10-27 and 2026-10-28; not re-fetched when this entry was written, since no network was available): ASU 2017-07 as applied in Hexion's FY2017 10-K (other components of net benefit cost are outside income from operations); ASC 715 funded-status presentation; FE Training, "Pensions and OPEBs" ("subtract the pension or OPEB deficit net of any tax liability") and "Debt Equivalents"; IB Interview Questions, "Pensions and off-balance-sheet hidden liabilities" (Pension Adjustment = Unfunded Pension x (1 - Tax Rate)); 26 U.S.C. section 404(a) (contributions are deductible), section 461(h)(2)(C) (a tort liability's economic performance occurs as payments are made) and section 162(f)(1); Porte Brown, "Tax issues when buying a business with an earnout"; Hectelion glossary, "Debt-like items"; Law Insider, "Debt-Like Items"; D-98 "Tax on investments". Feldstein, "Private Pensions as Corporate Debt", in *The Changing Roles of Debt and Equity in Financing U.S. Capital Formation* (NBER, 1982, pp. 75-90, chapter c11396), is cited for the net-of-tax principle by its citation only: its page images, read offline on 2026-10-28, were lost the same day, so it was not re-checked and nothing is quoted from it. The decision does not rest on it.
- **OD-6: a holding above invested capital is added back.**
  - Decision: a filed non-operating holding is added in the bridge at carrying value less the D-98 tax whether or not removing it leaves positive operating capital. When removing it leaves none, the operating ratio is unbounded and sales-to-capital takes the house cap `S2C_CLAMP[1]` (5.0), the limit the ratio approaches from below; the clamp note names the reason, and the A-2 history counts such a year at the cap. On the current-capital rule DCF equity value does not fall when investments rise; the A-2 history median's 0.1 cutoff predates this and can still step when the bridge row is also a history row.
  - Rejected: keeping the D-58 fallback (the holding valued at zero, a discontinuity of up to 4.8% a share for 1B more investments); withholding the DCF at the boundary.
  - Revises: the D-58 fallback in METHODOLOGY and the code note "When removing them would leave no operating capital the D-58 basis stands" (both rewritten); D-65 item 4 stays true and now also covers what sales-to-capital could not remove.
  - Sources: D-65's own principle ("an asset left out of operating capital is never left out of value too"); Damodaran, "Holdings in Other Firms".
- **OD-7: the divisor in a loss period.**
  - Decision: a loss row's filed diluted count equals basic, so the divisor is the loss row's basic count plus the newest award-dilution increment from a profitable period among the latest four quarters and the latest fiscal year (that period's diluted count less its basic count, less any filed conversion increment). The substitution is dated and disclosed (info gap `valuation.perShare.lossPeriodDivisor`) and reaches the DCF, excess-return and REIT per share and forecast EPS. With no profitable donor, the basic count stands and the D-60 note and METHODOLOGY say it carries no option or RSU dilution. Detection (`dilutedDivisor.ts`): both counts are positive, the diluted count is at most basic plus 1 (`diluted <= basic + 1`), and the row's income from continuing operations (net income when that is not filed) is below zero. The conversion subtraction: the donor's filed if-converted share increment (debt and preferred) is taken out of its increment, because the bridge deducts those claims. The not-restored case: when the issuer has a convertible instrument filed with a nonzero balance within 366 days and the donor period files no conversion increment, the award increment could hold conversion shares, so it is not restored, the filed count divides, and an info note says so (`loss-period-withheld`).
  - Rejected: the newest profitable period's diluted count (it carries that period's older basic count); disclose only.
  - Revises: D-65 item 5 and the D-60 divisor disclosure; METHODOLOGY "Share basis".
  - Sources: Deloitte Roadmap, *Earnings per Share* 8.7 (with a loss from continuing operations, diluted EPS is computed as basic EPS); ASC 260-10-45-17 to 45-20.
- **OD-8: one REIT market cap and EV.**
  - Decision: the REIT block takes its market cap and its EV from the multiples framework: the quote's admitted market cap and the house EV, which after OD-1 holds preferred, redeemable preferred, book NCI and redeemable NCI. P/FFO and P/AFFO are market cap over FFO at both sites; FFO and AFFO per share stay on the diluted count. A quote with a price but no market cap withholds P/FFO and EV with a warn gap. OP units, permanent or redeemable, are not common shares, so adding them as NCI never double counts.
  - Rejected: price times weighted diluted shares (two P/FFOs and two EVs per report, and OP units counted twice once redeemable NCI joins the EV); moving the multiples to price over FFO per diluted share (it touches peer and own-history P/FFO, not in this batch).
  - Revises: D-26's sentence "the REIT implied cap rate uses the house enterprise value", made true by construction instead of by a parallel formula.
  - Sources: Deloitte Roadmap 9.4 (that OP units redeemable for cash are such an NCI is filer practice, not the roadmap's); METHODOLOGY ("a report carries one EV").
- **FIN-403: a successor reads its predecessor's retirement obligations.** A holding-company successor whose own companyfacts carry no retirement obligation reads the predecessor's, as one reporting entity under B-36, until the successor's own annual report; a family the successor files, including a zero, ends the predecessor read for that family, and a family both file is read once, from the successor. Extends E-7 and B-36.
- **FIN-103: the DCF bridge reads the statement-date balance.** When an annual base is rolled forward, D-65's promise that the bridge stays at the statement-date balance is now checked: the bridge row follows the DCF's basis with one refusal rule (a newer quarter with no debt line falls back to the older complete balance), and the bridge note and an info gap `valuation.dcf.bridgeBalanceDate` name the date used. The refusal rule is the one the DCF reads on the row: a parser refusal, unresolved ownership, a lease conflict, a lease-scope refusal (on the run's own lease switch) or a refused temporary-equity operand. A refused statement-date row, or a refused anchor, keeps main's row (the anchor), never cured by another date, so no report main publishes is blocked by the choice (final review I-2).
- **Final whole-branch review (fix round 1), the merge rule: no report main publishes becomes Blocked, and no figure is worse than main.** (I-1) Lease-emptied invested capital withholds the DCF at warn (OD-3). (M-1) A row with a refused temporary-equity operand and a lease conflict or lease-scope refusal keeps main's critical lease gap beside the warn. (M-7) A null book NCI beside a redeemable NCI takes the P/FCF 1% floor on the redeemable NCI alone; with no redeemable NCI the guard is main's. (M-9) A positive `preferredStock` equal to the admitted redeemable preferred within max(1, 1e-6 x amount) at the same date (the filer tagged one mezzanine series `PreferredStockValue` and `TemporaryEquityCarryingAmountAttributableToParent`) is deducted once, as temporary equity, with an info gap `valuation.preferredOverlap`; unequal amounts are both deducted (B4b's overlap territory, OD-2). (M-8) The rate-regulated note states the reading, not rate recovery.
- **House constants.**
  - The pension family order (a), (b), (c) and its date-first look-back.
  - The six SIC codes read as rate-regulated: 4911, 4923, 4924, 4931, 4932, 4941.
  - The house cap `S2C_CLAMP[1]` (5.0) taken when operating capital is not positive (FIN-304).
  - The three-year minimum reused for lease-emptied capital (`S2C_HISTORY_MIN_YEARS`; no new constant).
  - D-98's marginal-rate floor reused as the debt-like lines' tax rate (no new rate).
  - The 1% share of consolidated equity (`IMMATERIAL_NCI_SHARE_OF_EQUITY`) reused as the redeemable-NCI floor in the P/FCF guard.
- **Versions.** Report 1.50.0, payload 1.52.0, Stage B `STAGE_B_2026_10_ACCOUNTING_EVIDENCE_31`, `FAIR_VALUE_2026_10_D135` and `SCENARIO_TARGETS_2026_10_D135`, each next after the preceding merge; pipeline stage-c-1.6.13 and the score bands are unchanged. `BRIDGE_METHOD_SINCE_SPEC_VERSION` is frozen at "1.50.0" and is never compared with `REPORT_SPEC_VERSION` itself. Stored reports keep their bytes (D-67); a report before 1.50.0 shows a fixed method note on its DCF, excess-return and REIT values through `withLegacyBridgeMethod`.
- **Validation.** Each finding's test failed first. The replay of the 45 census snapshots and the stored provider runs (main `55dc846` against the branch, offline, no provider, SEC or model call) attributes every moved figure to a task and a filed amount, and no composite band moves. The table, XOM line by line and the band moves are in the [disposition record](2026-10-27-audit-batch-b4-equity-bridge.md), which also lists the residuals (WACC weights and temporary equity, the approximation of the tax relief, the utility pension netting, redeemable common stock in parent temporary equity, and the rest).
