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

Independent reviewers checked the code diff and the frozen EXPE report. Repairs from review include retained annual class evidence, signed NCI labels, Altman/WACC scope and currency propagation, unknown-NCI EV suppression including the separate REIT sketch, neutral other-income labels and admitted page-one market values with separate class-price dates. No critical or important finding remains in the reviewed changes. This is a review result, not certification of institutional readiness or future report accuracy.

One controlled run through the existing approved ChatGPT connection was attempted in a separate task database. Job `c496a455-2545-406d-8895-043eaa44ea89` fell back to data-only after transport failure; it is not a successful analyst verification. Read-only diagnosis found an expired existing token, the required plan scope present and another live Metis runtime owning the profile. Its owner guard was preserved. No runtime was killed, profile lock stolen, credentials copied, new grant requested or paid fallback used. Fresh analyst/research verification remains blocked until legitimate ownership release and a supported refresh succeed. Source-dependent research rows in the disposition remain open.

Earlier in-progress aggregate runs exposed expected version/fixture updates, review corrections and one default-11-worker 30-second SQLite stress timeout. They are retained as diagnostic logs and are not the final release-gate result. The same stress assertions passed in a focused run. Final release gates use four workers to bound contention; assertions, thresholds and timeouts are not relaxed. Final results follow.

Synthetic report-generation checks additionally exercised ordinary, unresolved-multiclass, NCI, negative-capital, bank and REIT-with-unknown-NCI bundles through Stage B, validation, strict report schema, Markdown and print HTML. All six passed their expected value/suppression assertions without NaN/Infinity output. SEC facts are explicitly absent in these synthetic fixtures; these checks do not establish live acquisition or filing accuracy. The route results and generated files are saved under task `verification/route-reports/`, with the harness saved separately for reproducibility.

## Final local verification

The final frozen-source release-gate command completed with exit 0. Each test script was invoked with `--maxWorkers=4`; this changes concurrency only, with no threshold, assertion or timeout relaxation. Exact output is retained in task `verification/final-frozen-release-gates.log`.

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
| Independent final code review | No critical or important finding remaining in reviewed diff |
| Independent frozen EXPE review | No material finding remaining; explicitly not certification of fresh research |
| Synthetic report generation | All 6 route cases passed schema / Markdown / print-HTML and expected suppression checks |
| Production HTTP smoke | 8 routes returned 200; saved report stayed byte-identical; 0 jobs started |

The three product skips are two opt-in live EDGAR tests (live smoke not enabled) and one POSIX-only native case on Windows. Existing Vite future-config and Next metadataBase warnings remain. Zero audit findings is the package scanner's result, not a security guarantee. GitHub CI is separate from these local checks and must be read from the PR's actual run state.

The production smoke used only a newly created task database, the frozen data-only EXPE report and loopback port 3127, with automatic job resumption held in that test process. Dashboard, saved company/report, print page, Markdown/audit/print exports and report JSON passed. The initial Node-fetch client sent incomplete Fetch Metadata and was correctly rejected; the harness was corrected to the documented header-free local HTTP client path, without changing any security guard. It did not call live analysis, refresh the AI profile or touch the user's queued jobs. Server and generated responses are recorded under task `verification/production-smoke/`; the test server was stopped afterward. HTTP rendering does not certify every browser interaction or live provider path.

No result guarantees 100% functionality, absence of regressions or mistake-free prose. Fresh analyst verification and the source-dependent research limits above remain unresolved. The full 35-item disposition is the acceptance record for this focused repair.
