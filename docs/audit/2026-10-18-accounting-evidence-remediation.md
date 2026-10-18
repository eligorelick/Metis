# Accounting evidence and report consistency remediation

Baseline code: `646658a9822a6e9adbacdae8c4d8fa177148dc5b`. This document records the plan and, separately, verified execution evidence. It does not establish improved forecasts or investment returns. Private saved reports and input snapshots remain outside the repository.

## Scope and acceptance plan

1. **Temporary equity and balance identities.** Extend the existing normalized accounting categories and validator to recognize sourced redeemable/temporary equity outside permanent equity. Reproduce the missing-category warning first. Verify exact identity reconciliation, parent versus consolidated scope, absent components, invalid source units/dates and genuine residuals. Do not use the residual as an invented balance or alter valuation claims without a separate admission basis.
2. **Restricted cash.** Add the noncurrent component to existing filing-composition facts, label current restricted cash explicitly, and reconcile only compatible observed components. Test missing, inconsistent, overlapping, other-issuer and future-filed inputs. No restricted balance becomes available cash, and historical runway is not updated from these disclosures. Replace issuer-inappropriate merchant terminology in universal partial-working-capital notes.
3. **Technical eligibility.** Let admitted unique observations and actual-window coverage decide SMA200 and full-year range eligibility. A first-ever observation does not establish coverage inside the trailing window. Compare the issuer with independently covered observed benchmark sessions, withholding unsupported ranges when that reference is sparse or unavailable. Preserve financial-history restrictions and all scoring bands/weights. Test N-1/N samples, sparse interior histories, duplicate/future/invalid rows, window span and the existing split-adjusted-close convention. This observed-session guard is not an independently authenticated exchange calendar and may conservatively reduce availability when benchmark data is missing.
4. **Metric presentation.** Preserve original model wording and audit evidence. Eliminate source-name-only ratio-to-percentage rewriting; permit concise comparison only with an unambiguous compatible typed cited measure. Test sign, scale, variant, date, missing and ambiguous bindings. Label leadership as a capital-stewardship proxy and distinguish annualized weighted-average diluted shares from net economic dilution. Names and biographies do not change scores.
5. **Retained filing evidence.** Extend existing evidence-selection contracts for affirmative internal-control weaknesses and named pending litigation, preserving their limiting/countervailing statements and source offsets. Recover bounded officer-signature evidence from the already retrieved periodic filing. A named CFO does not establish executive performance.
6. **Debt and financing evidence.** Admit an explicitly dated carrying-value schedule only after issuer, document, period, scale and accounting identities agree. Preserve explicit conflicting observations and unresolved lease/class scope. Parse completed financing facts before excerpt truncation, retaining principal, proceeds, costs and their distinct measurement bases. A transaction subtotal is neither current cash nor a runway update.

Each implementation starts with a failing behavior regression, then the smallest repair and focused positive/negative controls. Changes are reviewed independently before integration. Tests use small public-source or synthetic fixtures, not private retained report payloads.

## Primary-source basis

- [CoreWeave Q1 2025 Form 10-Q](https://www.sec.gov/Archives/edgar/data/1769628/000176962825000014/crwv-20250331.htm), comparative condensed consolidated balance sheet: redeemable preferred equity is outside permanent stockholders' equity. The validator must recognize this presentation instead of treating its omission as a failed issuer identity.
- [CoreWeave Q2 2026 Form 10-Q](https://www.sec.gov/Archives/edgar/data/1769628/000176962826000366/crwv-20260630.htm), cash-flow cash reconciliation, Note 10, and Item 4: current/noncurrent restrictions, carrying debt versus principal maturities, and continuing control weaknesses are separately disclosed. Their dates and scope must survive extraction.
- [September 2026 completed-financing Form 8-K](https://www.sec.gov/Archives/edgar/data/1769628/000176962826000432/crwv-20260917.htm), Item 1.01, proceeds and capped-call subsections: transaction principal, proceeds before estimated issuer expenses, and capped-call costs are distinct. Their arithmetic cannot establish subsequent cash balances.

## Book-method disposition

The locators below come from the completed delegated reading review recorded in [the book-to-code disposition](2026-10-17-book-to-code-disposition.md). This implementer does not claim a new independent reading. Pages are 1-based supplied-PDF pages; no copyrighted files or extended excerpts are distributed.

- *The Intelligent Investor*, PDF 501-503 (printed 487-489), *Quantitative Value*, PDF 178 (printed 171), and QIA4e, PDF 70-71 support clear limits on management proxies and accounting inputs. They do not calibrate this project's scores.
- *Quantitative Value*, PDF 79-80 motivates explicit accrual variants and consistent sign/measurement conventions. Existing grading conventions remain unchanged.
- QIA4e, PDF 71-72, 107-110 and 267-269 motivates checking actual observation and window compatibility rather than substituting an issuer-age label.
- *Investment Valuation*, third edition, PDF 613, 621-622 and 651-654 informs separation of funding, claims and cash-use evidence. It supplies no permission to infer current liquidity from transaction principal.

New normalized earnings models, replacement-capex estimates, AI valuation premiums, calibrated probabilities and score/weight changes remain deferred under the existing evidence gates.

### Current disposition of the original eleven recommendations

This candidate is based on the unmerged `646658a` implementation stack. The older disposition's source baseline and historical CI checkpoint are not a claim that these branches have merged or deployed.

| Recommendation | Disposition against this candidate |
| --- | --- |
| 1. Grade overrides | Preserve the implemented [grade contract](../../src/pipeline/stageC/gradeContract.ts), evidence floors and raw proposals. No exception for severe risk or improved coverage. |
| 2. Runtime identity | Preserve [ordinary snapshot identity](../../src/pipeline/runInputSnapshot.ts) and retained-build replay. Advance method/context versions; do not relabel historical inputs or promise identical LLM prose. |
| 3. Normalized earning power | Deferred. Reported reconciliations and the present accounting fixes are not the independent signed tax/recurrence adjustment ledger. |
| 4. Economic comparability | Deferred. Better retained source evidence is not a structural-break model or a new historical averaging rule. |
| 5. Liquidity/refinancing | Partial prerequisite: sourced carrying debt, cash restrictions and existing fiscal payment evidence. No complete obligor/covenant/resources bridge or solvency assertion. |
| 6. Permanent impairment | Deferred. Preserve the separately disclosed scope of existing cyclical sensitivities; no invented case probabilities or common-holder funding outcome. |
| 7. Reinvestment alternatives | Deferred. No replacement-capex, intangible-capital or alternative FCFF/FCFE model is activated. Existing unsupported routes still abstain. |
| 8. Assumption resilience | Preserve existing reverse DCF and separate quality/value summaries. The broader decision record is deferred; conditional inference is not proof of market beliefs. |
| 9. Claim/contradiction ledger | Partial evidence improvement: retain material controls, litigation, officer and transaction context. A cited number and supported parser grammar still do not establish complete semantic verification, longitudinal tracking or active monitoring. |
| 10. TTM EPS invariants | Preserve the labelled quarterly-sum diluted-EPS convention and existing ownership/split/flow safeguards. No blind replacement with earnings divided by average shares. |
| 11. Dependence/management proxies | Clarify the existing capital-stewardship and weighted-average share labels. Thresholds and weights remain frozen; empirical calibration, return studies and management-delivery scoring remain deferred. |

## Verification record

- Initial existing baseline: `npm test -- --maxWorkers=2 tests/stageA.validate.test.ts tests/filingDisclosures.composition.test.ts tests/stageB.sectorRouting.test.ts` — 3 files, 199 tests passed before implementation.
- Focused fail-first regressions reproduced the accounting, presentation and evidence omissions before repair. Independent follow-up reviews passed 109 accounting cases, 243 technical cases, and 21 adversarial evidence/context cases; these overlap the implementation suites and are not added into a claimed unique total.
- The final reviewed production diff has SHA-256 `efda83600d2a372112247f34c87828c3d374e45b6b3c954bd4d65a503440488b` against the stated baseline. Its final independent amendment review passed 63 isolated checks for source-zero, period/currency, UTC-day availability, normalization provenance and immutability; unchanged source files retain the earlier independent review.
- An isolated install of the unchanged lockfile passes dependency shape. Fresh typecheck and full ESLint pass. Native SQLite CLI integration passes all four tests; dependency security audit reports zero vulnerabilities. Both complete coverage runs pass 7,815 tests across 362 files, with three pre-existing skips and no failures. Core coverage is 96.63% statements, 91.15% branches, 98.10% functions and 97.87% lines. Risk coverage is 95.08%, 89.03%, 97.75% and 97.32%, respectively; all unchanged per-file thresholds pass. The isolated keyless production build passes. Linux/Windows CI and a clean committed-build replay are separate release gates.
- Read-only acquisition checks on the actual cached public Q2 and September filings recover the dated CFO signature, controls weaknesses with the no-material-misstatement limitation, and all four completed-financing facts. These checks do not modify the earlier saved report or infer subsequent cash balances.
- The frozen comparison uses both unchanged normalized inputs and a reconstruction from the same retained raw facts. The old reconstructed calculation matches the old normalized calculation and retained production build, controlling for reconstruction differences. Original saved report, snapshot and export hashes remain unchanged.
- Public carrying-debt fixture: `7,513 + 27,555 = 35,068` million USD; `35,551 - 483 = 35,068` principal-to-carrying reconciliation. Recognized leases are admitted separately and once. The date is June 30, 2026; this is not a current financing-capacity or default-probability model.
- Raw reconstruction recovers sourced parent temporary equity that the older normalized input omitted. The unchanged normalized replay correctly cannot invent that missing field. Reported residuals remain visible under the existing tolerance rather than being replaced with a balancing plug.
- Five frozen control routes retain every existing numeric and boolean value. Four gain three actual-window observation counts as new metadata. The sparse-reference audit fixture intentionally withholds its range and moves composite `74.53` to `73.97`; the complete explicit delta ledger retains the original baseline and identifies each changed path. Score weights, bands, valuation and forecast arithmetic are unchanged.
- The full payload pin restores exactly seven asserted explanatory fields to reproduce the preceding financial hash `666a1ab0`; it does not normalize numbers, availability, dates or ordering. Candidate provenance/label hashes and the changed prompt bytes are pinned separately.

### Adversarial cases added during review

- Missing unrestricted cash must not leave noncurrent restricted cash in the available balance. The complete public-source control is `6,904 - 873 - 507 = 5,524` million USD; missing components cannot establish that bridge.
- Nonfinite temporary-equity disclosures, conflicting duplicate observations and incompatible vendor/SEC operands must refuse admission. A liability inferred from the accounting identity cannot independently validate the same identity.
- Explicitly sourced equity zero is an observed operand; a conflicting zero must not be discarded as a vendor placeholder. Known operand unit, instant period and filing availability must agree. Acquisition can normally follow the run-start timestamp, so the existing availability convention is checked on parsed UTC days, with original timestamps retained. Future-day observations and filings before the balance date are refused. This does not establish intraday first-public availability.
- Ratio annotations must reject unrelated named entities and quarters, even when a reused citation identifier, date or scalar happens to match.
- Negated completion, coherent third-party financing, incompatible note currency, explicitly narrower debt scope, lease inclusion and conflicting observed net debt must not become issuer financing or consolidated debt facts.
- Hypothetical risk boilerplate must not displace asserted weaknesses, case specifics or limiting statements within the bounded evidence budget.
- Two widely separated price observations must not establish full-year range coverage or restore a technical grade merely because the oldest observation predates the trailing window.

The range coverage convention reuses the existing 200-observation long-window floor and seven-calendar-day boundary allowance for the reference, also bounding interior gaps. The issuer must cover its reference sessions. These are disclosed engineering admission rules, not empirically calibrated investment thresholds. Shared issuer/reference omissions can still pass; independently sourced exchange-calendar completeness is unvalidated. Foreign-market holiday differences can conservatively withhold the range. No price, currency or adjustment basis is borrowed from the benchmark.

SPY supplies separately acquired observed session dates to detect holes that an earliest-ever issuer date cannot establish. This is the current implementation's availability guard, not an economic requirement that absolute price indicators need benchmark returns. SMA, RSI, MACD and observed drawdown still use issuer prices alone. A supported independent exchange-session calendar could replace this reference in separately reviewed work; missing benchmark coverage is not silently waived.

The same two-bar case also exposed a pre-existing drawdown labeling problem. Drawdowns retain the decline observed inside their actual window, including an observed zero, while incomplete windows carry an explicit partial-sample qualifier and row count. The house coverage check uses at least 200 admitted observations per labelled year and the seven-day start/interior allowance. It does not depend on benchmark availability, does not turn partial zero into established absence of drawdown, and does not alter scoring weights.

## Frozen and live validation boundaries

Compare both the unchanged normalized-input path and a reconstruction from the same raw public facts. This distinguishes calculation changes from newly admitted extraction evidence. Reuse retained model outputs only to test deterministic assembly/presentation; they do not establish a causal improvement in model prose.

After the candidate passes deterministic tests, full relevant checks and independent review, one separately authorized CRWV subscription run may validate changed end-to-end behavior. Preserve the original saved report and inputs; use an isolated candidate data copy. Record model/effort, inputs, call counts and elapsed time without treating variable model output as a controlled performance or forecasting experiment. No paid API fallback or automatic merge is authorized.
