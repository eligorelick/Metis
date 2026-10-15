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

Format: `D-nn (WSn) Title` → Options / Risks / Choice / Why / Disclosure.

## D-59 (NVDA report 34 audit, WP4 + WP6, 2026-10-15) Make the peer and executive gates reachable and stop the verifier's false contradictions

- **Evidence**: report 34 (docs/audit/2026-10-15-nvda-report-34-audit.md) showed gates that could never pass. `PeerCandidate.economicEvidence` and `subjectEconomicEvidence` were read but never populated, so every peer of every issuer was excluded; one symbol's HTTP 402 (AVGO) stopped collection, so 2 of 10 candidates were evaluated. `assessExecutiveEvidence` required a `verified` log outcome that the verify pass never assigns to prose, so every executive was "not-assessed". The headline "0/90 validated; 1 contradicted" came from a year-set period rule ("ended 2026-07-26" against "ttm: 2025-07-27 to 2026-07-26"), a symmetric label match against internal key paths ("debt Bridge total Debt Including Leases"), and 60 figure-free claims counted as "unchecked". The earnings reconciliation was "unavailable" because FMP quarters carry no SEC start date.
- **Options**: (a) populate economic evidence from SEC filings; (b) replace the hard exclusion with a disclosed caveat; (c) remove executive grades; (d) accept the verify pass's own numeric validation as attributable evidence.
- **Choice**: (b) and (d). Absent comparability evidence is a caveat stated beside the median; supplied evidence that is invalid, unavailable or different from the subject's still excludes, and evidence that does not describe the observation is contrary, never absent. SIC equality establishes industry only for the SEC fallback used when FMP refuses a symbol. Candidates rise from 6 to 10 within 25 seconds. An executive grade survives when a FACT in that executive's own evidence names them and its figure matched the cited record with no failing check. The period check accepts an exact date inside or at the end of a window; the numeric matcher reads registry labels with time words and FCF/SBC/capex normalized, treats a bare "trailing" as twelve months, and requires a named window to be the record's own. A fully named person is attribution, not metric text. An FMP quarter without SEC dates is bounded by the issuer's consecutive preceding quarter (12-14 weeks apart).
- **Why**: (a) needs a business-model taxonomy and per-metric definitions no source supplies; SIC alone cannot certify accounting or metric comparability, so claiming it would overstate the evidence. (c) discards the design the prompt already describes (capital-allocation record over tenure). The changes only make existing rules reachable; contrary evidence, contradictions and named-individual restrictions are unchanged.
- **Disclosure**: peer methodology and multiples notes carry the caveat (`valuation.multiples.peers.<key>.comparabilityCaveat`); SEC-served peers are named in the peer notes; `factualValidation.qualitative` reports figure-free claims. Current-capital bridge labels and registry ids change (`computed.current-capital.total-debt-including-leases`); the `computed.capital.current.*` aliases do not. The audited delta group `peer-gates-verifier-2026-10-15` and the payload pin in tests/stageC.payload.passes.test.ts say what moved.

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
| D-21/D-22/D-27/D-32: local boundaries and tooling | [Request security](../../src/app/requestSecurity.ts), [environment](../../src/config/env.ts), [scripts](../../package.json) and the [Next lint adapter](../../scripts/next-eslint-glob/index.cjs) are authoritative. Node remains `>=22.18.0`; historical package targets and README line counts are not current dependency state. |
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


## D-51 META report accuracy, evidence and evaluation (2026-10-14)

- **Problem**: the META report audit exposed truncated material filing evidence, citation presence presented as validation, inconsistent forward/reverse growth paths and fiscal labels, lagged capital metrics, opaque financial bridges and unfunded share shrinkage. Unvalidated house-rule grades also lacked reproducible inputs and an honest outcome-evaluation contract.
- **Choice**: retain bounded section-aware evidence with explicit omissions; verify numeric content separately from citation presence; align growth curves, dates and scenarios; use complete compatible TTM capital flows; disclose accrual, cash, lease, debt and equity/share bridges; use conservative shares and show unfunded historical-trend sensitivity; record signal dates, precision, weights and overlapping factor families. Missing attributable executive assessments remain not assessed. Economically incompatible peer rows cannot determine medians.
- **Reproducibility**: persist immutable content-addressed acquired inputs and configuration, verify replay versions, and preserve resume lineage. Offline evaluation requires point-in-time availability, frozen baselines, chronological holdouts and explicit first-filing or total-return outcomes. Tests are synthetic unless separately labeled. Reconstructed META inputs are not original immutable acquisition and future forecasts remain pending.
- **Limits**: no production thresholds or scenario weights are claimed calibrated. No paid generation, publication or mutation of stored historical reports is required. The integration with research reliability uses report 1.12.0 and payload 1.17.0 to invalidate comparison/resume under either branch's earlier meanings; legacy reads remain supported.
