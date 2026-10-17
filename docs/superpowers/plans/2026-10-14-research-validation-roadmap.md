# Research validation roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax.

**Goal:** Establish admissible, independent evidence for methods before production modeling or grading changes.

**Architecture:** Lock target, universe, baseline, version and decision manifests before reading final outcomes. Separate accounting/security reconciliation from predictive tests; use prospective custody, rolling origin and dependence-aware paired diagnostics.

**Tech Stack:** Current TypeScript, Zod, Vitest, Next.js16.3.8, SQLite/Drizzle; offline fixture tooling.

**Spec:** ../../../tmp/coverage-gap-20261014/audit-spec.md; evidence ../../../tmp/coverage-gap-20261014/coverage-matrix.json.

## Global Constraints

Audit-only delivery: these are proposed future tasks; nothing below was implemented. Preserve all existing edits and stored reports; no automatic regrading/backfill. Keep grade weights/formulas unchanged except a separately versioned, demonstrated admission/rank defect fix. No paid AI tests. Use disposable DBs and isolated checkout at execution. Read relevant node_modules/next/dist/docs/ before changing app code. Node>=22.18.0, Next16.3.8, TypeScript6/Zod4/Vitest4 follow current package lock.

## Review Focus

- Future filing/market data must not enter a past analysis (E01/E03).
- ADR and preferred/NCI ownership must not silently use ordinary/total denominators (E06).
- Legitimate external IR hosts must remain supported while wrong issuer events are withheld (E09).
- Legacy schemas and retries must remain readable without retrospective certification (E02/E10).
- Partial outages/cancellation must retain disclosures and prevent duplicate paid settlement (E12).

---

## Locked decisions before data inspection

Thresholds below are proposed preregistration choices, not measured achievements. Freeze them in the study manifest before final outcomes; if amended, start a new candidate/version and reserve a new holdout. No current test count or pending forecast count establishes power. Missingness, delisting and unknown labels remain explicit attrition, not selectively removed. Historical reconstruction is separate from prospective validation.

### R01 — Operating forecasts improve out-of-sample error over simple point-in-time baselines. (P1 prerequisite)

**Target outcomes:** Initial-filed annual/quarter revenue, margin in percentage points, diluted EPS and FCFF only on explicitly reconciled ownership/accounting/security/fiscal basis. Separate nowcasts, partial-year and1–5year leads.

**Baselines:** Unchanged last comparable annual amount, seasonal prior-year quarter; archived contemporaneous consensus when available. Do not use revised consensus retrospectively.

**Required dataset:** Prospective E10 records; SEC original filing bytes/accession/concept/unit/start/end; provider and consensus vintages; issuer/sector/size/missingness universe including failures/delistings. Existing25 pending forecasts provide reproducibility only.

**Holdout:** Rolling origin, all training outcomes available before fitting cutoff; nested tuning on older periods; final chronological test remains unopened. Purge/embargo overlapping learned target windows. Secondary issuer-held-out diagnostic, never substitute for time holdout.

**Uncertainty:** Paired normalized absolute error reduction, equal-issuer weighting, pp margins; date-block/issuer bootstrap with overlap blocks and effective independent dates. No MAPE nearzero.

**Decision criteria:** Proposed locked gate before outcomes: lower95% paired improvement interval>0 and point normalized-MAE reduction>=5% versus strongest baseline; worst prespecified material route error deterioration<=5%. Simulate dependence/power for80% power at5% effect before final holdout; insufficient breadth => no method/weight change.

**Dependencies:** E01,E02,E04,E10,E11

**Deliverable:** Versioned universe/target/baseline/training manifest, source-bound outcome table, attrition and held-out diagnostic report.

- [ ] Save a versioned study manifest with the exact target, eligibility, baseline, hypotheses, holdout IDs/cutoffs, method hashes, seed, loss, missingness, power simulation and decision thresholds above.
- [ ] Build the required primary/source-bound dataset and independently reconcile a random plus adversarial sample; fail closed on unresolved dimensions.
- [ ] Freeze development/tuning/final separation and verify no source/training label was available after its analysis cutoff.
- [ ] Execute paired development diagnostics, then one untouched final evaluation after power/readiness gates. Report all prespecified strata, exclusions and null/negative results.
- [ ] Apply the locked decision; if inadequate, retain production method and document missing requirements. If positive, produce reproducible candidate artifacts and controlled implementation acceptance evidence before a separate release.

### R02 — Each grade aspect predicts its explicitly defined future outcome; redundant families may add little. (P1)

**Target outcomes:** Predeclare aspect-specific direction: market valuation/technical may target3/6/12/24month benchmark-relative common-currency total return; quality/forensic may target deterioration/restatement. Composite target must be declared, not inferred from grade labels.

**Baselines:** Zero excess/benchmark-only plus size,value,momentum,quality factors on same investable universe. Aspect removal and factor-family consolidation paired ablations; neutral50 versus observed-only missingness kept as candidates.

**Required dataset:** Versioned grades, cutoffs and weights; original report/input records; security/benchmark identities; dividends/splits/mergers/delisting cash flows; point-in-time universe and macro/regime vintages.

**Holdout:** Walk-forward chronological; purge overlapping horizons during any fitting, final test untouched; prespecified route/regime/missingness strata and issuer diagnostic holdout.

**Uncertainty:** Date-block/issuer dependence, paired errors or monotonic outcome association as target requires; multiplicity correction for secondary aspects. Nominal report count not power.

**Decision criteria:** Primary gate: locked direction and minimum economically material effect assessed before holdout; lower95% paired improvement>0, >=5% error reduction where error is primary, and no prespecified severe stratum harm. For returns choose effect net of realistic costs before observations; no threshold tuning on final results.

**Dependencies:** E02,E04,E10,E11

**Deliverable:** Grade target dictionary, frozen candidate weight sets and ablation/power report. Keep current production weights pending evidence.

- [ ] Save a versioned study manifest with the exact target, eligibility, baseline, hypotheses, holdout IDs/cutoffs, method hashes, seed, loss, missingness, power simulation and decision thresholds above.
- [ ] Build the required primary/source-bound dataset and independently reconcile a random plus adversarial sample; fail closed on unresolved dimensions.
- [ ] Freeze development/tuning/final separation and verify no source/training label was available after its analysis cutoff.
- [ ] Execute paired development diagnostics, then one untouched final evaluation after power/readiness gates. Report all prespecified strata, exclusions and null/negative results.
- [ ] Apply the locked decision; if inadequate, retain production method and document missing requirements. If positive, produce reproducible candidate artifacts and controlled implementation acceptance evidence before a separate release.

### R03 — Issuer/atomic proposition controls reduce material false validation while retaining supported evidence. (P1)

**Target outcomes:** Blind human-supported/contradicted/unknown status per material proposition; correct issuer/date/event subject and source span. Defined earnings-event resolution and lead time.

**Baselines:** Current frozen controls versus E09 candidates on same retained inputs; no paid rerun initially. Include adversarial OTHER IR and supported-number/unsupported-clause cases.

**Required dataset:** Stratified reports by issuer,route,source,claim type,materiality and missingness; retained source bytes/publication/effective dates; independently assigned reviewers,blind labels, sampling weights and adjudication record. Double-review20% with third reviewer for disagreement.

**Holdout:** Separate issuer/source templates and final report-date batches; tuning source rules on development gold only. Human reviewers blinded to engine labels.

**Uncertainty:** Weighted material false-validation and missed-support rates with issuer/date clusters; agreement and unknowns reported, not discarded. Harm severity recorded separately.

**Decision criteria:** Proposed predeclared gold-set gate: upper95% material false-validation rate<=1%, missed-support increase<=2pp versus baseline, and both new counterexamples resolved. Determine sample/power to substantiate1% bound; insufficient sample => diagnostic only. Citation coverage cannot satisfy gate.

**Dependencies:** E02,E09

**Deliverable:** Immutable adjudication rubric/corpus and paired held-out control report; no whole-report truth claim.

- [ ] Save a versioned study manifest with the exact target, eligibility, baseline, hypotheses, holdout IDs/cutoffs, method hashes, seed, loss, missingness, power simulation and decision thresholds above.
- [ ] Build the required primary/source-bound dataset and independently reconcile a random plus adversarial sample; fail closed on unresolved dimensions.
- [ ] Freeze development/tuning/final separation and verify no source/training label was available after its analysis cutoff.
- [ ] Execute paired development diagnostics, then one untouched final evaluation after power/readiness gates. Report all prespecified strata, exclusions and null/negative results.
- [ ] Apply the locked decision; if inadequate, retain production method and document missing requirements. If positive, produce reproducible candidate artifacts and controlled implementation acceptance evidence before a separate release.

### R04 — Judge/model order and family dependence do not materially change supported conclusions. (P2 separately budgeted later)

**Target outcomes:** Grade/score movements, omitted material evidence and proposition-level factual errors; compare narratives as well as section/scenario numbers.

**Baselines:** Current seeded/random and deterministic two-pass protocol; swapped orders and independent-family or blinded human judge on identical cases.

**Required dataset:** Frozen payload, prompts,model/version,transport,temperature and seed/run metadata; order permutations, repeated stochastic runs and human gold labels. Initial phase uses stored outputs only. Paid experiments not performed in this audit.

**Holdout:** Issuer/route/adverse/missingness cases separated into tuning and final source-date batches. Holdout prompts remain untouched.

**Uncertainty:** Paired order/family effect and between-run variability; issuer clusters and model-family strata. Precompute repeated-run power/cost outside production.

**Decision criteria:** Proposed locked stability gate:95% interval for median order effect within±2score points and no material error-rate deterioration>1pp, with no severe unsupported claim added. These tolerances are proposed operational targets, not established calibration.

**Dependencies:** E09,E10,E12

**Deliverable:** Offline stored-output study now; later explicit experiment budget, model-version manifest and independent adjudication.

- [ ] Save a versioned study manifest with the exact target, eligibility, baseline, hypotheses, holdout IDs/cutoffs, method hashes, seed, loss, missingness, power simulation and decision thresholds above.
- [ ] Build the required primary/source-bound dataset and independently reconcile a random plus adversarial sample; fail closed on unresolved dimensions.
- [ ] Freeze development/tuning/final separation and verify no source/training label was available after its analysis cutoff.
- [ ] Execute paired development diagnostics, then one untouched final evaluation after power/readiness gates. Report all prespecified strata, exclusions and null/negative results.
- [ ] Apply the locked decision; if inadequate, retain production method and document missing requirements. If positive, produce reproducible candidate artifacts and controlled implementation acceptance evidence before a separate release.

### R05 — Security/action normalization reconstructs comparable per-share and total-return quantities. (P1)

**Target outcomes:** ADS/ordinary/class EPS/book, marketcap and total returns through ratio changes,splits,dividends,mergers/delistings; quote/session availability.

**Baselines:** Independent depositary/issuer/action ledger and direct hand arithmetic; compare existing provider convention versus evidence-normalized candidate.

**Required dataset:** Primary depositary/issuer filings with effective-dated representation; provider EPS/security metadata; raw/adjusted prices and distributions. NuCana ratio changes are a primary example, not an evaluated pipeline result. Include same-currency ADRs and1:1 controls.

**Holdout:** Hold out issuers and action types/effective-date batches; before/after-event windows plus no-event controls. No forward action may alter pre-event freeze.

**Uncertainty:** Reconciliation coverage/error rates by action/security; dollar/per-share arithmetic tolerance reflects source precision. Return-series differences at event dates and attrition.

**Decision criteria:** Engineering acceptance: all reconciled fixtures within source rounding and no guessed conversion; unresolved basis withheld. Broader production scope only after provider convention/effective-date coverage measured; unknown ratio not treated as1.

**Dependencies:** E01,E02,E03,E06

**Deliverable:** Security-action oracle corpus and provider field convention map with unresolved exclusions.

- [ ] Save a versioned study manifest with the exact target, eligibility, baseline, hypotheses, holdout IDs/cutoffs, method hashes, seed, loss, missingness, power simulation and decision thresholds above.
- [ ] Build the required primary/source-bound dataset and independently reconcile a random plus adversarial sample; fail closed on unresolved dimensions.
- [ ] Freeze development/tuning/final separation and verify no source/training label was available after its analysis cutoff.
- [ ] Execute paired development diagnostics, then one untouched final evaluation after power/readiness gates. Report all prespecified strata, exclusions and null/negative results.
- [ ] Apply the locked decision; if inadequate, retain production method and document missing requirements. If positive, produce reproducible candidate artifacts and controlled implementation acceptance evidence before a separate release.

### R06 — Issuer-defined cash/common-holder FFO bridges prevent false comparison without pretending one convention is universally correct. (P1)

**Target outcomes:** Standardized/issuer/lease-adjusted/after-SBC FCF; common-holder Nareit FFO and issuer AFFO,preferred/NCI/JV and maintenance-capex scope.

**Baselines:** Primary statement/release reconciliation against existing cash bridge and clearly disclosed approximate REIT reconstruction.

**Required dataset:** META-like lease-heavy issuers plus diverse general businesses and real equity REITs; issuer FFO/AFFO reconciliation schedules,JV ownership,real-estate depreciation,dispositions/impairments and common distributions.

**Holdout:** Hold out issuer families and release periods; annual/TTM windows exactly aligned. IFRS lease cases handled in R10, not assumed ASC842.

**Uncertainty:** Reconciliation residual and eligible coverage by convention. Arithmetic correctness does not imply terminal-value or return accuracy.

**Decision criteria:** No duplicate bridge implementation. Accept exact reconciled common/issuer labels only if residual within disclosed rounding; otherwise retain approximation/unknown. Any predictive convention preference tested separately with R01/R02 before changing valuation inputs.

**Dependencies:** E01,E06

**Deliverable:** Primary definition/ownership bridge ledger and candidate eligibility corpus.

- [ ] Save a versioned study manifest with the exact target, eligibility, baseline, hypotheses, holdout IDs/cutoffs, method hashes, seed, loss, missingness, power simulation and decision thresholds above.
- [ ] Build the required primary/source-bound dataset and independently reconcile a random plus adversarial sample; fail closed on unresolved dimensions.
- [ ] Freeze development/tuning/final separation and verify no source/training label was available after its analysis cutoff.
- [ ] Execute paired development diagnostics, then one untouched final evaluation after power/readiness gates. Report all prespecified strata, exclusions and null/negative results.
- [ ] Apply the locked decision; if inadequate, retain production method and document missing requirements. If positive, produce reproducible candidate artifacts and controlled implementation acceptance evidence before a separate release.

### R07 — Route subtype and common-capital definitions determine whether selected metrics and valuation models are applicable. (P1)

**Target outcomes:** Bank NIM/commonROE, insurer earned/written premiums/combined ratio/AOCI/reserves/CSM/statutory capital, mREIT funding/hedge spread/commonbook; financial-other cash-flow applicability and hybridREIT classification.

**Baselines:** Independent primary issuer/accounting definition adjudication; current routes and disclosed proxies; no presumed universal financial metric.

**Required dataset:** Diversified bank subtypes,P&C/life/health/IFRS17 insurers,agency/nonagency/hybridmREITs,fee and balance-sheet financial-other firms; segment/funding/average-balance primary records. Current audit no real insurer/mREIT/REIT corpus.

**Holdout:** Issuer/subtype and stress-cycle holds; classify before outcome labels. Prospective outcomes only after E01 ownership/unit/period eligibility.

**Uncertainty:** Metric eligibility/misrouting confusion and primary residuals first; later forecast valuation errors/returns with independent-date blocks.

**Decision criteria:** Unknown segment economics => explicit undetermined/applicability gap. Expand or rewrite routes only after gold applicability corpus and held-out no-regression evidence; terminal excess-return choice tested R09 rather than inferred from arithmetic.

**Dependencies:** E01,E04,E06,E07

**Deliverable:** Subtype applicability spec, adjudicated routing corpus and eligible financial metric oracle tables.

- [ ] Save a versioned study manifest with the exact target, eligibility, baseline, hypotheses, holdout IDs/cutoffs, method hashes, seed, loss, missingness, power simulation and decision thresholds above.
- [ ] Build the required primary/source-bound dataset and independently reconcile a random plus adversarial sample; fail closed on unresolved dimensions.
- [ ] Freeze development/tuning/final separation and verify no source/training label was available after its analysis cutoff.
- [ ] Execute paired development diagnostics, then one untouched final evaluation after power/readiness gates. Report all prespecified strata, exclusions and null/negative results.
- [ ] Apply the locked decision; if inadequate, retain production method and document missing requirements. If positive, produce reproducible candidate artifacts and controlled implementation acceptance evidence before a separate release.

### R08 — Cash runway/loss-stage indicators predict financing or exhaustion events beyond simple burn ratios. (P2)

**Target outcomes:** Quarter/month cash exhaustion,financing/restructuring/dilution and operating milestone dates; separate temporary losses from persistent burn. Restricted cash/commitments/maturities distinct.

**Baselines:** Unchanged latest cash/burn ratio and last4quarter mean burn with explicit zero-burn/unknown outputs. CurrentUSD10m pre-revenue floor is house policy.

**Required dataset:** Pre-revenue and unprofitable issuers including failures/financings; exact liquidity/burn windows,commitments,debtmaturities,restrictedcash,clinical/commercial milestone primary events and currency metadata.

**Holdout:** Event-time rolling origins before financing announcements; complete failure cohort,sector/milestone-stage and currency strata. No postevent liquidity backfill.

**Uncertainty:** Censored survival/time-to-event,interval runway forecasts and Brier only for locked probabilities; false-alarm and missed-event rates with issuer/time dependence.

**Decision criteria:** Resolve contradictory cash before testing. Candidate stage/runway methods must beat locked naive baseline with uncertainty and no severe missed-liquidity-risk deterioration. Preserve current thresholds until prospective target evidence exists.

**Dependencies:** E01,E02,E07,E09,E10

**Deliverable:** Liquidity/event cohort,competing-risk rules and candidate stage calibration study.

- [ ] Save a versioned study manifest with the exact target, eligibility, baseline, hypotheses, holdout IDs/cutoffs, method hashes, seed, loss, missingness, power simulation and decision thresholds above.
- [ ] Build the required primary/source-bound dataset and independently reconcile a random plus adversarial sample; fail closed on unresolved dimensions.
- [ ] Freeze development/tuning/final separation and verify no source/training label was available after its analysis cutoff.
- [ ] Execute paired development diagnostics, then one untouched final evaluation after power/readiness gates. Report all prespecified strata, exclusions and null/negative results.
- [ ] Apply the locked decision; if inadequate, retain production method and document missing requirements. If positive, produce reproducible candidate artifacts and controlled implementation acceptance evidence before a separate release.

### R09 — Valuation persistence, factor dependence and cycle normalization add held-out decision value. (P2)

**Target outcomes:** Model assumptions and resulting valuation/forecast error, grade discrimination or returns as explicitly chosen; bank terminalexcess,FCFF terminalgrowth,reinvestment,beta,own-history ties,commodity cycle normalization.

**Baselines:** Zero terminal excess/finite model versus historical persistence; naive growth/sector or cycle baselines; current correlated families versus deduplicated candidates. Do not choose assumptions by observed market price fit alone.

**Required dataset:** Long boom/bust panel with failures/delistings; primaryROE/book/distributions,production/reserves/commodityprices,capex,margins and macro vintages; model source/assumption versions.

**Holdout:** Whole cycles and final chronological regimes held out; paired candidate assumptions on identical eligible frozen inputs; no scenario tuning to finaloutcomes.

**Uncertainty:** Sensitivity and model-error decomposition first; paired issuer/date-block outcomes and effective cycles, not many firms in one commonshock. Coverage of candidate intervals checked on matured targets.

**Decision criteria:** Proposed primary>=5%normalizederror improvement and lower95%pairedCI>0 plus no severe routeharm. Terminal assumptions remain explicit scenarios if no robust advantage. Fixed25/50/25 is a display prior; only a defined outcome probability earns calibration claims.

**Dependencies:** E03,E05,E08,E10,E11

**Deliverable:** Assumption library,candidate ablation manifest,full-cycle outcome study and decision memo.

- [ ] Save a versioned study manifest with the exact target, eligibility, baseline, hypotheses, holdout IDs/cutoffs, method hashes, seed, loss, missingness, power simulation and decision thresholds above.
- [ ] Build the required primary/source-bound dataset and independently reconcile a random plus adversarial sample; fail closed on unresolved dimensions.
- [ ] Freeze development/tuning/final separation and verify no source/training label was available after its analysis cutoff.
- [ ] Execute paired development diagnostics, then one untouched final evaluation after power/readiness gates. Report all prespecified strata, exclusions and null/negative results.
- [ ] Apply the locked decision; if inadequate, retain production method and document missing requirements. If positive, produce reproducible candidate artifacts and controlled implementation acceptance evidence before a separate release.

### R10 — Explicit accounting-basis handling supports comparable financial quantities across GAAP/IFRS. (P2 before IFRS expansion)

**Target outcomes:** IFRS16lease cash/debt/EBITDA andIFRS17insurance/CSM definitions; presentation currency and taxonomy availability.

**Baselines:** Primary accounting/issuer oracle per basis, not unadjusted USGAAP formulas; current safe withholding.

**Required dataset:** Matched IFRS/USGAAP industries with provider mapping and issuer note reconciliations; dated standards and original filings; full source unit/period/ownership metadata.

**Holdout:** Issuer and accounting-transition period holds; no fabricated matching taxonomy; validated subtype applicability fromR07.

**Uncertainty:** Reconciliation residual/eligible coverage by basis; predictive errors only after accounting oracle passes.

**Decision criteria:** No claim currentIFRS valuations proven wrong from taxonomy gap alone. Withhold unsupported definitions and expand only with independent primary mapping,positive/negative corpus and no mislabeled ASC842 assumptions.

**Dependencies:** E01,E06; R07

**Deliverable:** Accounting-basis mapping spec and primary oracle corpus; unsupported cases explicit.

- [ ] Save a versioned study manifest with the exact target, eligibility, baseline, hypotheses, holdout IDs/cutoffs, method hashes, seed, loss, missingness, power simulation and decision thresholds above.
- [ ] Build the required primary/source-bound dataset and independently reconcile a random plus adversarial sample; fail closed on unresolved dimensions.
- [ ] Freeze development/tuning/final separation and verify no source/training label was available after its analysis cutoff.
- [ ] Execute paired development diagnostics, then one untouched final evaluation after power/readiness gates. Report all prespecified strata, exclusions and null/negative results.
- [ ] Apply the locked decision; if inadequate, retain production method and document missing requirements. If positive, produce reproducible candidate artifacts and controlled implementation acceptance evidence before a separate release.

### R11 — Frozen registration and historical vintages prevent hindsight contamination. (P1 validity prerequisite)

**Target outcomes:** Admissibility of analysis inputs,first-filed/revised observations,macro data and method training/cutoff; immutable prospective registration before availability.

**Baselines:** Original preserved bytes and externally/locally witnessed registration versus retrospective reconstructed metadata. Distinguish custody tiers.

**Required dataset:** E10source/code/target manifests,SEC filing/acceptance histories,FRED realtime vintages,archivedconsensus and universe records; old30reports without snapshots excluded from prospective claims.

**Holdout:** Independent custody sample and future finaloutcome period; code/method training hashes and tuning cutoffs locked before targets.

**Uncertainty:** Admissibility error/attrition and missing evidence per source; no timestamp confidence from content hashes. Audit random plus adversarial future/revision records.

**Decision criteria:** Unknown historical availability => reconstruction/diagnostic only. Any later filing/macrovintage admitted before its availability blocks historical validation claim. Trust limitations visible even if integrity hashes match.

**Dependencies:** E01,E02,E10,E11

**Deliverable:** Point-in-time admissibility manifest and independent custody report.

- [ ] Save a versioned study manifest with the exact target, eligibility, baseline, hypotheses, holdout IDs/cutoffs, method hashes, seed, loss, missingness, power simulation and decision thresholds above.
- [ ] Build the required primary/source-bound dataset and independently reconcile a random plus adversarial sample; fail closed on unresolved dimensions.
- [ ] Freeze development/tuning/final separation and verify no source/training label was available after its analysis cutoff.
- [ ] Execute paired development diagnostics, then one untouched final evaluation after power/readiness gates. Report all prespecified strata, exclusions and null/negative results.
- [ ] Apply the locked decision; if inadequate, retain production method and document missing requirements. If positive, produce reproducible candidate artifacts and controlled implementation acceptance evidence before a separate release.

## Shared inferential specification

Use paired outcomes on identical targets; normalization scale must be available at forecast creation. Primary effects and losses selected before holdout. Block size at least overlapping forecast horizon for market-return studies; select alternative dependence blocks using development autocorrelation only, then lock. Issuer clustering must also preserve shared date shocks. Record independent blocks/issuers and bootstrap stability; if too few independent blocks for a defensible interval, report descriptive distributions and readiness insufficient. Simulate80% power at proposed minimum effect with development dependence estimates; nominal sample counts never substitute. Preserve one final chronological holdout and record any peeking. Correct secondary hypothesis multiplicity; route safety guardrails are prespecified rather than chosen from best strata.

Confidence labels measure evidence completeness today; study conditional error/interval coverage separately before giving probabilistic meaning. The25/50/25 scenario display prior remains fixed unless a declared probabilistic outcome and held-out calibration study support a change. No live provider/model correctness or zero-defect claim follows from source/hash parity.
