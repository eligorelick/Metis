# Financial and evidence integrity audit, 2026-10-15

This audit followed a full AMZN run on the exact public main snapshot
`15b3010b484afe5894d201fae4073bb0c887bea8`. The original report and acquired
inputs were preserved. Corrections are generic boundaries with counterexamples
and positive controls, without issuer-specific arithmetic or changes to scoring
formulas, weights or scenario priors. Corrected inputs can change results.

## Confirmed defects and corrections

| Boundary | Reproduction | Correction and control |
| --- | --- | --- |
| Cash, debt and lease composition | EV could use a combined cash figure after the net-debt resolver rejected its components; other consumers accepted impossible lease totals. | Shared NET_DEBT_V2 admission reaches EV/history, DCF/REIT bridges, leverage, ROIC and both WACC debt paths. Negative liabilities, oversized components and conflicting totals are refused. Explicit zero, valid net cash and genuine missing-opening fallbacks survive. |
| Fiscal cash-flow windows | Rolling annual NetIncomeLoss reported on Form 10-Q was selected as a fiscal-year anchor, removing current year-to-date cash-flow quarters. | Only original annual reporters establish annual anchors; valid annual comparatives later repeated in quarterly filings remain eligible. Calendar and 52/53-week controls cover current and prior-year differences. |
| Earnings-bridge operands | The standardized source's signed equity-method result was absent from the compact statement context. | Carry optional `equityMethodIncomeLoss` as filed. Never infer a universally net-of-tax definition or manufacture a reconciliation residual. This alone does not guarantee a bridge is displayed in generated prose. |
| Material filing context | The bounded quarterly MD&A selection retained a tax charge but omitted the nearby other-income explanation and subsequent funding context. | Generic earnings-quality and subsequent-liquidity categories retain adjacent context atomically, with exact offsets and unchanged character ceilings. The selector remains bounded, not comprehensive. |
| Money scale | The model copied 197 from a passage saying $197 billion while the numeric source parser compared base currency units. | A strict `USD billions: description` contract converts once in both excerpt and registry matching. Unknown/conflicting currency, compound scales and ambiguous legacy units remain unchecked. Renderers preserve the declared scale and small nonzero mantissas. |
| Verification presentation | A prose-only denominator appeared to describe all numeric verification, exports omitted per-value status, and failed numeric matches were called uncited even when a citation existed. | Distinguish factual-prose numeric support from numeric citation provenance; show citation-traced, untraced or not checked beside cited metric values. Neither is a whole-claim truth assessment. |
| Numeric observation periods | Generic metric tables omitted a supplied `period`, so quarter, half-year and TTM observations could share an as-of date without their different windows being shown. | Preserve the supplied period separately from as-of date in live/Markdown/print; explicitly mark an absent period rather than inferring one from the date. |

The original selection already retained guidance, current issuer cash-flow
tables, negative trailing issuer FCF, annual FCF and annual FTC/severance
charges. Their possible omission from model prose is not an extractor finding.
Category `retained` means some passages survived; it does not establish adequate
material coverage. Precise investment adjustments and quarterly equity-method
residuals outside Item 2 remain outside an MD&A-only selector's scope.

## Frozen-source comparison

Controlled reconstruction from the full original companyfacts acquisition,
using the original split evidence and quote basis day, recovers June 2026
quarterly CFO 45.387bn and gross capex 54.208bn: standardized FCF −8.821bn.
March CFO 26.032bn and gross capex 44.203bn give FCF −18.171bn.
The prior implementation stopped quarterly cash flows at December 2025.
June pretax 80.857bn minus tax 18.199bn plus the signed equity-method
result −0.011bn reconciles to net income 62.647bn. These are observed public-source examples,
not invented adjusted earnings or a future forecast.

Issuer MD&A net capex and issuer FCF can differ from standardized gross-capex
definitions; the audit does not force them to agree. The source envelope's
quarterly reporting period is June 30, 2026 and SEC filing date July 31, 2026.
An earnings publication on another date needs its own source. The payload
retains both supplied dates without inferring one from the other.

This comparison rebuilds statements under changed code; it is not an exact
historical replay, fresh acquisition or AI rerun. Existing report bytes are
unchanged. The corrected code still withholds intrinsic value where other
required observations, currencies or share bases are unavailable.

## Compatibility and verification

Report spec 1.15.0, payload 1.20.0, NET_DEBT_V2, section-evidence-2 and the Stage B
financial-integrity implementation identity prevent older calculations or
partial passes from being presented as the same convention. Existing reports
remain readable. The frozen general-company comparison moves only five
version/disclosure leaves; financial values, grades, registries and projection
periods stay pinned. Its payload adds explicit equity-method rows, including
unavailable entries where no figure is sourced.

Test-first reproductions preceded production fixes. Targeted financial review
passed 1,165 tests across 42 files, including rejected opening balances, genuine
missing-data fallbacks, zero/negative leases and valid controls. Fresh independent review reproduced
two follow-up scale defects: registry matching ignored the scale and display
rounded small nonzero amounts to zero. Both were corrected with failing-first
tests. The reviewer then independently verified both fixes with 241 focused
tests and found no further material issue in the reviewed scope.

Initial corrected-implementation gates (`a78a6cf`) on Windows / Node 24.16.0:

| Gate | Result |
| --- | --- |
| Dependency shape, TypeScript and ESLint | Passed |
| Product suite | 261 files; 5,697 passed, 3 skipped |
| Database CLI integration | 4 passed |
| Core coverage | Passed; statements 96.54%, branches 90.95%, functions 98.70%, lines 97.62% |
| Risk coverage | All per-file floors passed; aggregate statements 94.46%, branches 88.23%, functions 97.32%, lines 96.58% |
| Production build | Passed with Next.js 16.3.8 |
| Dependency security audit | Zero vulnerabilities reported |
| Windows production smoke | Separate empty database and credential directory; data-only DEMO saved; report/print/Markdown/HTML routes returned 200; headerless report mutation returned 403; dedicated Chrome rendering inspected |

The first full product run found one exact prompt-wording assertion; restoring
the existing wording produced the clean full rerun above. Coverage runs also
reran the full product inventory. The three skipped tests are retained rather
than being presented as executed. Existing Vite future-loader and local
metadataBase warnings remain; no semantic assertion, coverage threshold or
security gate was relaxed or disabled for this audit. An initial push-triggered
Windows run timed out in the existing destination-preservation test at its
generic five-second deadline; the observed case took 5.5 seconds. The later
PR-triggered Windows run passed on the same implementation. This native
filesystem/SQLite case now has a scoped 15-second budget with every original
preservation assertion intact.

The final presentation follow-up preserves numeric periods and distinguishes
untraced numbers from missing citations across live/Markdown/print. It changes
no financial formula, acquired input, model output or stored report bytes.
Fresh review found no material issue in that diff. The existing detailed-source
"not recorded" fallback is retained for legacy provenance; inline metric periods
use "not supplied" when absent. Both contexts still disclose missing evidence.
The follow-up full product run passed 5,706 tests across 262 files, with three
retained skips; its production build passed. The latest public head's product,
coverage, build, security and Windows results
are recorded by the accompanying pull request's CI checks.

The next Windows PR run exposed a separate existing settings-serialization
test deadline: its outer five-second timeout equalled SQLite's own five-second
busy budget, leaving no allowance for native worker startup and cleanup. The
same-head Windows push run passed. Only that test's outer deadline is now 15
seconds; its 500ms lock hold, 5000ms SQLite busy timeout, stale-ETag rejection,
complete external state and persisted-pair assertions are unchanged. No
production timeout or global test deadline is relaxed.

## Final artifact review and release disposition

The post-fix live AMZN pipeline completed all three requested subscription
model passes and deterministic verification. An independent artifact review
found no new material arithmetic blocker. In USD billions, the reviewed TTM
cash bridge is 161.403 minus 173.028 = -11.625; subtracting 1.599 of lease
principal gives -13.224, while the separate SBC adjustment gives -30.939.
These are different disclosed definitions, not interchangeable FCF measures.

The bounded corrective release is supported by the reproduced financial and
evidence defects, valid controls, project gates and review. It is not a
certification of professional investment-readiness. The final generated
artifact still has the following unresolved output limitations:

- A prose sentence promises a numerical earnings bridge "below", but the
  expected pretax/tax/net-income table is absent. Exact quarterly equity-method
  reconciliation prose cites MD&A Item 2 where the exact signed operand is in
  the statements. This is unsupported cross-reference/source attribution,
  not demonstrated false arithmetic. Whole-prose support is not machine-validated.
- Several monetary observations share the June 30 as-of date while measuring
  quarter, half-year or trailing periods. Supplied typed periods must remain
  visible; missing periods must be marked missing, never inferred from a date.
  Quote observation time and calculation time are distinct and remain important.
- Fifteen of 106 numeric figures remain untraced, mainly because conservative
  metric/period context matching cannot establish their support. An existing
  citation does not turn such a figure into a validated match. Do not relax
  verification merely to raise coverage.
- The rerun discusses subsequent funding qualitatively and omits the 21.3bn
  amount and numerical guidance. Their absence does not establish absence of
  disclosure, and this rerun is not live validation of those figures' scale
  normalization; focused regressions separately cover the strict scale contract.
- The reference quote remains stale, valuation/forecast probabilities are
  unavailable, 50 factual prose claims remain unchecked, and the analysts and
  synthesis share one model family. Forecast performance is uncalibrated.

Historical report bytes and original Library exports are preserved. Presentation
corrections are distinguished from AI regeneration; a reformatted export does
not establish new source acquisition, new financial computation or a new model
opinion. No stored report is manually rewritten to hide these findings.

## Reliance limits

- This is engineering verification of specific boundaries, not certification
  that the application has no bugs or that generated investment conclusions
  are validated advice.
- Vendor entitlement/rate limits, stale prices, missing split data and absent
  market inputs remain visible gaps. Tests do not create those observations.
- Citation presence and deterministic numeric matches do not validate all
  surrounding prose, tax interpretation or investment judgment.
- Flattened ambiguous tables and some multi-token period labels remain
  conservatively unchecked. Bounded excerpts can still omit relevant evidence.
- Grade bands, scenario weights and forecasts remain uncalibrated; synthetic
  regressions and one issuer run do not establish prospective accuracy.
