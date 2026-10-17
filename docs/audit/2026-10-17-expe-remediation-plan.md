# EXPE independent-audit remediation

## Intent and boundaries

Improve generic accounting scope, evidence retrieval and report honesty in Metis against the 35-item independent audit of EXPE report 38. Start from public main `bd917835b68008f6f9406a3959f44ad28dc1fa62`, not old PR 17. Preserve the original laptop checkout, its staged changes and existing credentials. No trading, releases or merge. Open a draft PR only after the tested changes and independent review are ready.

The audit is an issue inventory, not authoritative implementation instructions. Its all-class and NCI calculations are otherwise-unchanged sensitivities, not complete market valuations or normalized ROIC. Never fabricate missing operating assumptions or market-value NCI. Never double-count equity already containing NCI. Preserve the correct composite formula and suppress unsupported outputs honestly.

## Implementation sequence

1. Preserve current state, inspect current main and applicable instructions, retain audit identity and run baseline checks. Record environmental failures separately from product failures.
2. Map all 35 findings to current paths. Distinguish confirmed current defects, already repaired behavior, evidence gaps, methodological improvements and limits requiring additional source support.
3. Add failing regression tests, then narrow generic repairs in independent areas: economic share classes; consolidated capital and earnings; freshness and evidence presentation; primary-source event retrieval; report/scenario integrity. Keep interfaces compatible and avoid unrelated refactoring.
4. Wire accounting fields through Stage B. Exercise ordinary, multiclass, NCI, negative-capital and financial-sector routes. Preserve existing simple-issuer calculations where their meaning is unchanged.
5. Run product/integration/type/lint/build/dependency/security and required coverage checks. Generate/replay deterministic report evidence. Attempt one controlled EXPE run through the existing approved ChatGPT connection when safely available, without new grants or keys.
6. Have a fresh reviewer inspect the final diff and report evidence. Repair recoverable findings and rerun affected checks. Record actual pass/fail/not-run status and remaining limits.
7. Commit documented tested changes and open a draft PR. Return branch/commit/PR/CI references and the per-issue disposition.

## Acceptance invariants

- Outstanding economic classes are distinct from issued treasury counts, ADR representations and diluted weighted averages. Unquoted-class price assumptions are explicit; EPS ratios keep their own scope.
- Consolidated operating returns use consistently scoped capital. Parent earnings reconcile using the signed NCI allocation. Unknown NCI cash flow or market value is never inferred from NCI income or book equity.
- Current and noncurrent leases retain completeness and dates. FCF less the disclosed CFS SBC addback is a narrowly defined sensitivity, not a complete service-cost valuation.
- Reporting period, publication/filing and retrieval time remain distinct. Later restatements cannot enter historical-as-known analyses.
- Coverage, freshness, citations and factual validation are different measurements. Zero eligible checks is not success. Stale evidence cannot become fresh through retrieval time.
- No universal pandemic adjustment, operating-cash reserve, peer minimum or scenario probability is promoted as accounting fact or empirically validated policy.

## Review focus

Single-class/no-NCI invariance; total-equity double counting; signed minority losses; share-class/date/ADR ambiguity; negative-capital and sector-specific suppression; publication cutoff and unavailable-primary fallbacks; stale scoring coverage and zero-check labels. New tests must assert public behavior and identities, not merely mirror implementation.

## Initial environment findings

- Original checkout has unrelated staged/unstaged changes and remains untouched.
- Native managed-worktree tool is unavailable for this delegated task. An explicitly authorized Git worktree was created in this task workspace.
- Initial dependency reuse was replaced with independent exact-lockfile installs (`npm ci --ignore-scripts`, then native SQLite rebuild) in both worktrees. No dependency or lockfile change. Node 24.16.0 / npm 11.13.0.
- Sandbox baseline produced 305 Vitest temporary-rename EPERM errors and ran zero tests. With a permitted temporary directory and clean dependencies, public-main baseline passed 305 files / 6,512 tests, with three documented skips. The environment-failed attempts are not counted as product results.

## Retained-input EXPE diagnostic

The immutable snapshot has SHA-256 identity `e3a976ab2064c0c8d66d1d22d0258f30a3f179ad1df25f8f8a841ebd81a58c22`. It was read from the existing local database without modifying it. Its report/Stage B conventions predate public main, so the version gate correctly prevents an exact historical replay claim. The before comparison uses current public-main methods over the retained normalized rows; the after uses this branch and re-normalizes only consolidated earnings, signed NCI earnings and NCI equity from the exact retained SEC companyfacts. All 102 row-field assignments and their filing provenance are logged separately. No market data, class prices, source text, operating assumptions or current share counts were invented.

| Measurement | Public-main recomputation | Audit-branch recomputation |
|---|---:|---:|
| Latest annual ROIC | 60.568603% | 40.491277% |
| Composite | 71.62 | 65.12 |
| WACC | 9.850581% | Withheld: unresolved economic class scope |
| Current EV | $31.40897335 billion | Withheld: unresolved economic class scope |
| DCF per share | Unavailable | Unavailable |

These are current-method frozen-input diagnostics, not before/after completed analyst reports. The original report's score was 71.89; that historical result must not be confused with the public-main comparison. The changed composite reflects affected ownership/freshness inputs and coverage, while the composite formula is preserved. The corrected quarterly earnings bridge is `1,027 - 152 = 875; 875 - (-3) = 878` million, with zero residual. ROIC remains an otherwise-unchanged accounting-scope sensitivity, not normalized economic return. The explicit Class B fixture reproduces $34.6728442 billion as a partial same-price sensitivity; the generated EXPE diagnostic does not promote it to a fully established market value.

Before/after reports, computations, after-normalization log, input-version stamps and SHA-256 manifest are saved in the task sibling `verification/` directory as `EXPE-current-main.*`, `EXPE-final-frozen.*` and `EXPE-before-after-manifest.json`. Raw provider inputs and generated report files are deliberately outside the public repository. The after report displays actual generation/calculation times separately from its frozen source cutoff and explicitly says that no multi-pass analysis completed.

## Review and controlled-run limits

Initial reviewers checked the first code diff and frozen EXPE report. Subsequent independent review of commit `5cd330e` identified four additional gaps: incompatible historical class scope, consolidated equity substituted for parent equity, stale separate-class prices and negative NCI with unknown earnings scope. Follow-up repairs and fresh final-head review are in progress. The earlier review does not certify the revised branch or institutional readiness.

One controlled run through the existing approved ChatGPT connection was attempted in a separate task database. It fell back to data-only after transport failure and is not successful analyst verification. Fresh analyst verification has not completed; private runtime diagnostics are retained outside the repository. Existing ownership and credential guards were preserved, with no credential copies, new grants or paid fallback. Independent primary-source collection can proceed separately and has retained the cited annual filing, quarterly filing and quarterly earnings release through the normal rate-limited SEC client. Source-dependent research rows remain open until their specific evidence and behavior are verified.

Earlier in-progress aggregate runs exposed expected version/fixture updates, review corrections and one default-11-worker 30-second SQLite stress timeout. They are retained as diagnostic logs and are not the final release-gate result. The same stress assertions passed in a focused run. Final release gates use four workers to bound contention; assertions, thresholds and timeouts are not relaxed. Final results follow.

Synthetic report-generation checks additionally exercised ordinary, unresolved-multiclass, NCI, negative-capital, bank and REIT-with-unknown-NCI bundles through Stage B, validation, strict report schema, Markdown and print HTML. All six passed their expected value/suppression assertions without NaN/Infinity output. SEC facts are explicitly absent in these synthetic fixtures; these checks do not establish live acquisition or filing accuracy. The route results and generated files are saved under task `verification/route-reports/`, with the harness saved separately for reproducibility.

## First-commit local verification (superseded for follow-up changes)

At commit `5cd330e`, the frozen-source release-gate command completed with exit 0. Each test script was invoked with `--maxWorkers=4`; this changes concurrency only, with no threshold, assertion or timeout relaxation. Exact output is retained privately in task `verification/final-frozen-release-gates.log`. The public fixtures and commands are reproducible; private logs and original issuer inputs are supporting task evidence, not public artifacts. Both Linux full verification and Windows smoke also passed in [CI run 39004924744](https://github.com/eligorelick/Metis/actions/runs/39004924744). These checks do not cover subsequent uncommitted changes, which require fresh verification and review.

| Gate | Actual result |
|---|---|
| Exact dependency shape | Passed |
| TypeScript | Passed separately; Next's configured typecheck skip is not used as evidence |
| ESLint | Passed |
| Product | 314 files; 6,598 passed, 3 skipped |
| Integration | 1 file; 4 passed |
| Core coverage | 6,598 passed / 3 skipped; statements 96.36%, branches 90.33%, functions 98.17%, lines 97.61%; gates passed |
| Risk coverage | 6,598 passed / 3 skipped; statements 94.89%, branches 88.23%, functions 97.62%, lines 97.07%; all configured per-file gates passed |
| Next production build | Passed |
| Security audit | Passed; 0 reported vulnerabilities |
| Initial code/report reviews | Superseded by four later review findings; final-head review pending |
| Synthetic report generation | All 6 route cases passed schema / Markdown / print-HTML and expected suppression checks |
| Production HTTP smoke | 8 routes returned 200; saved report stayed byte-identical; 0 jobs started |

The three product skips are two opt-in live EDGAR tests (live smoke not enabled) and one POSIX-only native case on Windows. Existing Vite future-config and Next metadataBase warnings remain. Zero audit findings is the package scanner's result, not a security guarantee. GitHub CI is separate from these local checks and must be read from the PR's actual run state.

The production smoke used only a newly created task database, the frozen data-only EXPE report and loopback port 3127, with automatic job resumption held in that test process. Dashboard, saved company/report, print page, Markdown/audit/print exports and report JSON passed. The initial Node-fetch client sent incomplete Fetch Metadata and was correctly rejected; the harness was corrected to the documented header-free local HTTP client path, without changing any security guard. It did not call live analysis, refresh the AI profile or touch the user's queued jobs. Server and generated responses are recorded under task `verification/production-smoke/`; the test server was stopped afterward. HTTP rendering does not certify every browser interaction or live provider path.

No result guarantees 100% functionality, absence of regressions or mistake-free prose. Fresh analyst verification and the source-dependent research limits above remain unresolved. The full 35-item disposition is the acceptance record for this focused repair.

## Follow-up source evidence and behavior

The normal SEC client retained the annual filing, quarterly filing, earnings release, relevant current reports and proxy with declared existing contact configuration and a one-request-per-second limiter. No environment file or subscription credentials were copied. Direct IR access failures are retained as failures; manual public-source research and mocked discovery fixtures are not represented as a successful live IR discovery run.

| Retained primary document | SHA-256 |
|---|---|
| [FY2025 10-K](https://www.sec.gov/Archives/edgar/data/1324424/000132442426000008/expe-20251231.htm), filed February 13, 2026 | `c37c9f93e4e4125165c2fec2b307e0471d39411db129b558e941663379a8f460` |
| [Q2 2026 10-Q](https://www.sec.gov/Archives/edgar/data/1324424/000132442426000053/expe-20260630.htm), filed August 6, 2026 | `69ac332c88473121129b0eeaf16a3523a81c69fbe9be4ee0691a11d2e177840b` |
| [Q2 earnings release](https://www.sec.gov/Archives/edgar/data/1324424/000132442426000051/earningsrelease-q22026.htm), August 5, 2026 | `820e1717c49df6215e002b76a25deb6d2b90effb425339b15dac9f239b9d4e58` |

The bounded source-enriched diagnostic is separate from the frozen-input comparison above: it preserves the original quote/statements and adds only the logged new primary evidence. The original acquired-input snapshot and original report are unchanged. Its dated July 24 inventory is 114,495,891 common plus 5,523,452 Class B shares, or 120,019,343 units; at the frozen $288.95 quote its same-price capitalization is $34,679,589,159.85. This differs from the audit's June-count sensitivity ($34,672,844,200) because the count dates differ. Book NCI/nonoperating-holdings limitations remain explicit. ROIC is still 40.491277%; the bounded enriched composite is 67.32 versus 65.12 for the frozen-source diagnostic, with unchanged scoring arithmetic. The additional source evidence, rather than a fresh analyst judgment, explains that comparison.

Actual retained-source checks reproduce the B2C/B2B adjusted-margin changes (+384.2136/-266.2660 basis points), Q2 issuer FCF ($1,478m - $199m = $1,279m), six-month issuer FCF ($5,409m - $383m = $5,026m), GAAP/issuer-adjusted diluted EPS ($7.16/$5.76) and gross cash reconciliation ($6,682m + $2,402m = $9,084m). The four-component H1 working-capital subtotal is -$1,614m and is explicitly incomplete. Annual SBC recognized expense/amortization ($398m) and capitalized awards ($99m) remain separate. Geography is U.S. $8.710bn/other $6.023bn under the disclosed website/point-of-sale allocation with its headquarters exception. These are sourced facts and defined sensitivities, not normalized earnings, traveler geography or a valuation conclusion.

Management's Q3/FY guidance is retained separately from model forecasts. When the same-source quarterly range multiplied by four lies wholly outside its same-year annual revenue range, the new comparability guard withholds that quarterly extrapolation, floor and sequential pace. It does not substitute fiscal-year guidance for NTM revenue. The existing run-rate fallback gives $17.31bn instead of the prior $21.37bn model extrapolation; neither figure is management's annual guide. Unsupported future common-holder EPS and model forward P/E are withheld when diluted-class basis or forecast allocation beside NCI/preferred claims is unresolved. Reported historical EPS and independently sourced consensus remain available. DCF per share remains unavailable.

## Reproducible follow-up regressions and status

Public focused fixtures cover `edgar.economicShares`, `stageB.economicShareScope`, `stageB.ownHistoryProvenance`, `edgar.ownershipTags`, `edgar.balanceAnchorRefusal`, `edgar.cashScope`, `filingDisclosures.composition`, `filingDisclosures.segmentPerformance`, `currentReports.guidanceTables`, `currentReports.compactFreeCashFlow`, `stageB.guidanceComparability`, `projection.ownershipScope`, `dataBundle.annualGeography`, `companyIr.materialEvents` and `report.companyStatements`. Tests use synthetic/minimal source excerpts and do not require private credentials or report files. Full source documents and original issuer inputs remain private task evidence; the URLs/hashes and calculation identities above make the findings assessable without claiming those private files are public artifacts.

Run `npm run test:product -- --maxWorkers=4`, `npm run test:integration -- --maxWorkers=4`, `npm run test:coverage:core -- --maxWorkers=4`, `npm run test:coverage:risk -- --maxWorkers=4`, plus dependency, typecheck, lint, build and security scripts. No thresholds, timeouts or assertions are relaxed. The first follow-up aggregate attempt passed dependency/type checks and was deliberately interrupted before product tests when fresh independent review found recoverable issues; it is not a successful final gate. Repaired findings include scaled compensation amounts, primary segment admission, acquisition denials and projected EPS scope. Fresh whole-branch local gates now pass as recorded below; committed-head CI is a separate result tracked on the draft PR.

New source reads add a bounded official-news path (up to six requests/twelve seconds); unavailable or index-unlinked statements remain gaps. Ordinary saved-report navigation remains covered by the existing zero-provider-work regressions. The annual notes extractor can still fail on an incorporated/cross-reference layout; annual numeric composition then uses exact admitted filing metadata and same-accession XBRL, without claiming the notes text was retrieved. No automated proxy annual-compensation parser, complete legal-response ledger, calibrated factor reweighting or alternative explicit-driver valuation engine is claimed.

## Final-source local verification checkpoint

At 06:21:32 UTC on October 17, all nine local gates completed with exit 0 against frozen final production source. Tests ran with four workers without relaxed assertions, timeouts, coverage thresholds or exemptions. Failed/interrupted earlier attempts are retained separately; they are not counted as final passes. Release-contract repairs update explicit versions, retain the exact 44-file referenced EDGAR boundary, replace retrieval-time expectations with unknown observation dates, and use an ordinary no-outside-claims fixture for share-count EPS arithmetic while retaining separate NCI/preferred bridge/refusal tests. Independent review found no numeric golden-value changes or removed assertions in the seven final reclassifications.

| Gate | Actual final-source result |
|---|---|
| Dependency shape, TypeScript, ESLint | Passed separately |
| Product | 337 files; 6,905 passed, 3 skipped |
| Integration | 1 file; 4 passed |
| Core coverage | Statements 96.49%, branches 90.63%, functions 97.99%, lines 97.69%; gates passed |
| Risk coverage | Statements 94.98%, branches 88.67%, functions 97.62%, lines 97.19%; all per-file gates passed |
| Production build | Next 16.3.8 passed; independent TypeScript gate also passed |
| Security scanner | Passed; 0 reported vulnerabilities |
| Independent code and deterministic-output review | No remaining critical/important findings within reviewed scope; preferred-only, historical cash scope and observation-date controls reconfirmed |
| Synthetic report generation | All 6 ordinary/multiclass/NCI/negative-capital/bank/REIT cases passed schema, Markdown, print and expected suppression checks |
| Production HTTP smoke | 14 read routes returned 200; legacy/current saved bytes immutable; 0 jobs started |

The smoke used a new isolated database and private test token file, held startup job resumption, and retained normal security guards. An initial sandbox client was blocked before HTTP by local-network permissions; the approved loopback test then passed. Only the task-owned test server was stopped. This checks production reader/export routes, not every browser interaction or live provider path. The same two opt-in EDGAR cases and one Windows-inapplicable POSIX test remain skipped; existing Vite/Next metadata warnings remain.

Normal refresh of the existing approved ChatGPT connection succeeded without new grants or credential copies. At 06:24 UTC the controlled gpt-6.1-sol/high source-enriched run had completed analyst and adjudication stages and was in verification. Its process began before the later preferred-only guard extension; that exact source patch is retained privately. Final-source EXPE recomputation shows zero numeric differences because its unsupported common EPS and P/FCF were already withheld on NCI/class evidence. Treat this controlled run separately from final-head whole-pipeline verification. Its final result and the committed-head CI state are recorded on the draft PR and in retained task evidence, rather than assumed successful here. No fresh market/macro collection or comprehensive research closure is claimed.
