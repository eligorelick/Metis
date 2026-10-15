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
| Earnings bridge | The standardized source's signed equity-method result was absent from the compact statement context. | Carry optional `equityMethodIncomeLoss` as filed. Never infer a universally net-of-tax definition or manufacture a reconciliation residual. |
| Material filing context | The bounded quarterly MD&A selection retained a tax charge but omitted the nearby other-income explanation and subsequent funding context. | Generic earnings-quality and subsequent-liquidity categories retain adjacent context atomically, with exact offsets and unchanged character ceilings. The selector remains bounded, not comprehensive. |
| Money scale | The model copied 197 from a passage saying $197 billion while the numeric source parser compared base currency units. | A strict `USD billions: description` contract converts once in both excerpt and registry matching. Unknown/conflicting currency, compound scales and ambiguous legacy units remain unchecked. Renderers preserve the declared scale and small nonzero mantissas. |
| Verification presentation | A prose-only denominator appeared to describe all numeric verification, and exports omitted per-value status. | Distinguish factual-prose numeric support from numeric citation provenance; show citation-traced, uncited or not checked beside exported metric values. Neither is a whole-claim truth assessment. |

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

Final project gates on Windows / Node 24.16.0:

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
metadataBase warnings remain; no gate was relaxed or disabled for this audit.

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
