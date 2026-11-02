# R6 FIGR paid-run audit disposition — 2026-11-02

Scope: B-05, B-09 and B-21 of the reasoning audit. Base `caa6f8c3` already
contains R1/R4. All research work was deterministic, without model calls or
research network requests. The only database opened was the provided isolated
paid-run database, in read-only mode. Original payload/report files were not
overwritten. Shared payload, report, Stage B and pipeline versions are unchanged
for the integrator's single coordinated bump.

| Finding | Disposition | Root cause | Test | Stored-report impact |
| --- | --- | --- | --- | --- |
| B-05 high: voting control omitted | Fixed evidence admission and leadership instruction. A separate bounded governance excerpt retains class voting rights, dated controller/ownership observations, controlled-company status and adjacent elected/available exemption qualifiers. | Financially scored risk/notes selection dropped voting/control passages even though the snapshot retained them. Equal economic rights and the IPO conversion sentence could not supply those facts. | `tests/stageC.governanceBridge.test.ts`: fictional long annual risk section, dated named controller, different class votes, elected versus future exemptions, no invented rights from IPO conversion. | Existing stored narrative is unchanged. A future generation/replay has the missing cited evidence; no paid model rerun was made. |
| B-09 medium: aggregate P/E denominator not shown | Fixed payload and deterministic multiple-basis display. Total and four quarter amounts are registered with their periods; basis text retains tags, derivation and filing identities/dates. | The common-income selector computed the right denominator but presentation carried only the formula and convention. | `tests/stageB.peDenominatorBridge.test.ts`: fictional filed common-income quarters, FY-minus-YTD provenance, participating-security/no-second-deduction caveats, citable total/components, Markdown/print/web surfaces. | Stored report bytes and old basis text remain unchanged. Newly built reports display the bridge through the existing basis field; no schema migration or normalization. |
| B-21 medium: insider period/Form 144 coverage unclear | Fixed coverage text, citable post-window reported-row counts/shares and leadership instruction. Latest explicit Form 4/4-A filing date is separate from transaction dates; Form 144 is disclosed uncollected/unreviewed. | Completed-quarter aggregates, later selected transaction rows and unavailable proposed-sale evidence had no explicit scope bridge. | `tests/stageC.insiderCoverage.test.ts`: fictional S/F codes, excluded Form 144 row, filing versus transaction dates, absent filing date, numeric/text citations. Existing insider-window regressions retained. | Stored narrative remains unchanged. New generations receive the bounded coverage and cannot treat proposed-sale notices or plan capacity as executed sales. |

## Paid snapshot replay

`tmp/claude-2026-11-01/diag/replay-payload.diag.test.ts` is a local copy of the
provided read-only diagnostic. `REPLAY_LABEL=r6` writes distinct
`diag/replay-r6.txt` and `.json` beside the original evidence. It rebuilds Stage B
and the payload at the paid run's matched validation time; it never calls a model.

The annual risk section (10-K `0002064124-26-000009`, filed 2026-03-16,
report end 2025-12-31) now appears as `edgar:10-K item1A governance`:

> Our Class B common stock has ten votes per share, our Class A common stock has one vote per share, and our Blockchain Stock has one vote per share.

It retains the dated 37,893,047 Class B shares held by Michael Cagney and
permitted transferees, and approximately 68% combined voting power for
Mr. Cagney, Ms. Ou and permitted transferees. It also retains the issuer's
election of the controlled-company exemption and its separate statement that
it could choose board/committee exemptions in the future. Those are filed
2025 observations, not November 2026 voting counts; the IPO conversion count
of 39,393,047 is never promoted to a current balance.

The selected P/E remains 24.3074x. The new basis says (reader form after the
integration review; the delegate's first form printed raw digits, tag names and
accessions in the reader's table cell):

> Common income 199.2M USD, TTM ended 2026-06-30 = 43.78M (quarter ended 2025-09-30; 10-Q filed 2025-11-13) + 23.03M (quarter ended 2025-12-31; fiscal year less nine months; 10-K filed 2026-03-16 and 10-Q filed 2025-11-13) + 44.95M (quarter ended 2026-03-31; 10-Q filed 2026-05-15) + 87.45M (quarter ended 2026-06-30; 10-Q filed 2026-08-14).

The integration review also narrowed the governance trigger: "voting power"
counts only as a holder's share of the vote or a class's voting power, so the
state-licensing threshold passage ("10% or more of the outstanding interests or
voting power of our Company") and its neighbours left the excerpt.

| Quarter interval | Common income (USD) | Filing basis |
| --- | ---: | --- |
| 2025-07-01 to 2025-09-30 | 43,784,000 | Direct filed flow; 10-Q `0002064124-25-000032`, filed 2025-11-13 |
| 2025-10-01 to 2025-12-31 | 23,027,000 | FY minus YTD; 10-K `0002064124-26-000009`, filed 2026-03-16, and the preceding 10-Q |
| 2026-01-01 to 2026-03-31 | 44,945,000 | Direct filed flow; 10-Q `0002064124-26-000029`, filed 2026-05-15 |
| 2026-04-01 to 2026-06-30 | 87,446,000 | Direct filed flow; 10-Q `0001628280-26-057061`, filed 2026-08-14 |

Each uses `us-gaap/NetIncomeLossAvailableToCommonStockholdersBasic`. The
snapshot's FY2025 filed Basic common numerator is $62.026M; the TTM uses its
four specified quarterly flows, not FY2025 parent net income. No second
preferred/NCI subtraction or normalized earnings measure was introduced.

Insider statistics still cover four calendar quarters ended 2026-09-30.
The latest inspected Form 4 filing date is 2026-10-26. After the window, the
selected rows have code F on four reported rows totaling 206,392 reported
shares; Cagney/Ou rows may overlap. This is neither unique shares sold nor a
complete October aggregate. Current `src/providers` has no Form 144 collection
path; proposed-sale notices remain unreviewed.

## RED/GREEN receipts

All commands use Node 24.11.1 through the copied `run.ps1`, stripping the
specified provider/application environment and directing data/config to this
checkout's own temporary directory. Logs are UTF-16LE; result JSON files retain
the exact command, UTC times, exit code and log path.

- `run.ps1 -Name r6-red -NodeArgs @('node_modules/vitest/vitest.mjs','run','tests/stageC.governanceBridge.test.ts','tests/stageB.peDenominatorBridge.test.ts','tests/stageC.insiderCoverage.test.ts')`:
  **RED**, 5 failed / 1 passed across 3 files, for missing governance admission,
  denominator/quarter records and insider filing/Form 144 coverage.
- Same test selection, `-Name r6-green-2`: **GREEN**, 6 passed / 3 files.
- `run.ps1 -Name r6-insider-citations-red -NodeArgs @('node_modules/vitest/vitest.mjs','run','tests/stageC.insiderCoverage.test.ts')`:
  **RED**, 1 failed / 2 passed, for missing citable post-window totals/coverage.
- Original three-file selection, `-Name r6-green-3`: **GREEN**, 7 passed / 3 files.
- `run.ps1 -Name r6-governance-identity-red -NodeArgs @('node_modules/vitest/vitest.mjs','run','tests/stageC.governanceBridge.test.ts')`:
  **RED**, 1 failed / 2 passed, for a foreign annual risk section labeled as
  domestic Item 1A. Governance citations now preserve 20-F Item 3.D/Item 4.

The first implementation check also caught an invalid period-basis enum and
a test using the numeric registry for a text citation; both were corrected
before the passing run. The adjacent six-file run had 490 passes and one
payload golden fingerprint failure (`1.56.0:730ce32f` versus pinned
`1.56.0:f9b1277c`); that pin is deliberately left to integration. Final gate
receipts are recorded with the final head.

## Final verification

- `run.ps1 -Name r6-typecheck-final -NpmScript typecheck`: exit 0.
- `run.ps1 -Name r6-lint-final -NpmScript lint`: exit 0, no new warnings.
  The two `_input`/`_output` unused-variable warnings in
  `tests/report.usageAccounting.test.ts:59` are present at base `caa6f8c3`.
- `run.ps1 -Name r6-targeted-final -NodeArgs @('node_modules/vitest/vitest.mjs','run','tests/stageC.governanceBridge.test.ts','tests/stageB.peDenominatorBridge.test.ts','tests/stageC.insiderCoverage.test.ts','tests/stageC.insiderStatistics.test.ts','tests/repository.release.test.ts','tests/audit.fixtureComparison.test.ts')`:
  **GREEN**, 33 passed / 6 files, including all 8 new R6 tests. The audited
  fixture comparison needs no intended-delta entries.
- `REPLAY_LABEL=r6`, `run.ps1 -Name r6-replay-final -NodeArgs @('node_modules/vitest/vitest.mjs','run','--config','tmp/claude-2026-11-01/diag/vitest.diag.config.ts')`:
  **GREEN**, 1 passed; payload fingerprint `1.60.0:1d4a29c8`, 332,931 characters.
  Original paid fingerprint: `1.60.0:8a00a422`.
- `run.ps1 -Name r6-product-final -NpmScript test:product`: 14,384 passed,
  6 failed, 3 skipped / 630 files. Five failures were unchanged process/CLI
  timing tests: the three simultaneous barrier races in `jobScheduler`, the
  offline replay CLI in `runInputSnapshot`, and the legacy diagnostic consumer
  in `minimatch.tooling`. The sixth was the intentionally retained payload pin.
- `run.ps1 -Name r6-timing-isolation -NodeArgs @('C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js','run','test:product','--','tests/jobScheduler.test.ts','tests/runInputSnapshot.test.ts','tests/minimatch.tooling.test.ts','--maxWorkers=1')`:
  **GREEN**, all 111 tests in those 3 files passed without application changes.
- `run.ps1 -Name r6-product-two-workers -NodeArgs @('C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js','run','test:product','--','--maxWorkers=2')`:
  full product suite through npm, **14,389 passed, 1 failed, 3 skipped**;
  **629 files passed, 1 failed** (630 total). No process timing failure recurred.
  The sole failure is `tests/stageC.payload.passes.test.ts:729`, at
  `tests/helpers/researchReliabilityPayloadGolden.ts:30`: expected
  `1.56.0:f9b1277c`, received `1.56.0:9278cd7c`. The added insider coverage
  changes the serialized payload; the historical pin and all shared versions
  are deliberately unchanged for integration, as requested.

The only remaining integration work is the coordinated version/fingerprint
update. No stored paid narrative was regenerated or rewritten; new model
wording cannot be demonstrated without a subsequent model run, excluded by
this task. Form 144 notice content and current voting power absent from the
retained evidence were not invented.
