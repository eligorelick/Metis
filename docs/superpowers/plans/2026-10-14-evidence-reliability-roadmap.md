# Evidence and reliability roadmap Implementation Plan

> **Historical snapshot, reconciled 2026-10-17:** All task sequences, unchecked boxes and Create/Modify lists below are superseded as execution instructions. Preserve this record; write a new plan against current source and tracked regression fixtures before implementing any remaining gap. Do not recreate or overwrite existing modules from these lists.

**Goal:** Close demonstrated admission, comparability and output gaps without silently changing served research.

**Architecture:** Build small evidence/identity contracts at acquisition and evaluation boundaries, then thread eligibility and typed assumptions through consumers. Apply separately versioned fixes to new generation only; retain raw observations and legacy diagnostics.

**Tech Stack:** Current TypeScript, Zod, Vitest, Next.js16.3.8, SQLite/Drizzle; offline fixture tooling.

**Tracked context:** [Methodology](../../METHODOLOGY.md), [research](../../RESEARCH.md), [validation status](../../VALIDATION-STATUS.md), and [intended audit deltas](../../../tests/fixtures/audit-intended-deltas.json). The original local audit specification and coverage matrix were not published. They are historical provenance, not acceptance dependencies; this snapshot cannot reproduce that original audit. A refreshed plan must define its exact input, expected value, eligibility and surface assertions in tracked fixtures and tests.

## Global Constraints

Audit-only historical delivery: these tasks were proposed on 2026-10-14 and are not a current implementation-status checklist. Preserve all existing edits and stored reports; no automatic regrading/backfill. Keep grade weights/formulas unchanged except a separately versioned, demonstrated admission/rank defect fix. No paid AI tests. Use disposable DBs and isolated checkout at execution. Read relevant node_modules/next/dist/docs/ before changing app code. Node>=22.18.0, Next16.3.8, TypeScript6/Zod4/Vitest4 follow current package lock.

## Current implementation reconciliation

The following components already exist at the 2026-10-17 merge base. Their existence does not establish that every proposed behavior or research gate is complete. The historical instructions to create them or require their existing tests to fail must not be followed.

| Historical task | Existing implementation to preserve and assess |
| --- | --- |
| E02 | `src/evaluation/targetDefinition.ts`; `tests/evaluation.targetDefinition.test.ts` |
| E03 | `src/pipeline/stageB/marketAdmission.ts`; `tests/audit.marketAdmission.test.ts` |
| E05 | `src/pipeline/stageB/valuationAssumptions.ts` |
| E06 | `src/pipeline/stageB/securityBasis.ts` |
| E10 | `src/evaluation/registry.ts`, `src/evaluation/artifactManifest.ts`; `tests/evaluation.registry.test.ts` |
| E11 | `src/evaluation/pairedDiagnostics.ts`; `tests/evaluation.pairedDiagnostics.test.ts` |

For each task considered for new work, run the existing tests first, record completed and still-unproven behavior separately, and replace the historical file list and acceptance steps with a current scoped plan. A passing existing counterexample is evidence to retain, not a reason to delete an implementation or force a failure. Any new defect needs its own reproducible tracked case.

## Review Focus

- Future filing/market data must not enter a past analysis (E01/E03).
- ADR and preferred/NCI ownership must not silently use ordinary/total denominators (E06).
- Legitimate external IR hosts must remain supported while wrong issuer events are withheld (E09).
- Legacy schemas and retries must remain readable without retrospective certification (E02/E10).
- Partial outages/cancellation must retain disclosures and prevent duplicate paid settlement (E12).

---

## Priority and dependencies

P0: E01/E02/E03 independently, then E04. P1: E05 immediately for prose, E06/E07 after field evidence, E09/E10 after identity contracts. P2: E08 helper fix plus integrated trace, E11 after matured admissible outcomes, E12 operational matrix starting at highest-risk boundaries. E12 final release gate applies to every implementation wave. No task changes house weights.

## Contract glossary

All identifiers/dates/hashes/reason codes are strings; measured values are finite numbers or explicit null, never undefined-as-zero. Arrays use the named element types. New schemas validate these constraints at boundaries. Existing DataBundle comes from src/pipeline/types.ts; ValidationReport comes from src/pipeline/stageA/validate.ts.

- FactCompatibilityPolicy = {kind:"sum"|"ratio"|"growth"|"balance-average",allowedDefinitionPairs:Array<[string,string]>,fiscalCalendarId:string,requireOwnership:boolean}; FinancialFactEvidence.unit/currency/accountingBasis/ownershipBasis/periodStart may be null only with unknown eligibility; periodKind is"flow"|"instant".
- CommonMultipleInput = {marketCap:FinancialFactEvidence|null,price:FinancialFactEvidence|null,eps:FinancialFactEvidence|null,capital:CommonCapitalEvidence,security:SecurityBasisEvidence|null,asOf:string}. All CommonCapitalEvidence amounts are FinancialFactEvidence|null, except eligibility.
- RetainedSource = {id:string,hash:string,url:string,content:string,publishedAt:string|null,observedAt:string,issuerId:string|null}; SourceSpan = {sourceHash:string,start:number,end:number}; MaterialClaim = {claimId:string,text:string,propositions:Array<{id:string,text:string,materiality:"material"|"immaterial"}>}; AnnouncementInput = {url:string,content:string,publishedAt:string|null,observedAt:string,authorityEdges:SourceAuthorityEdge[]}.
- EvaluationRegistryStore = {append(record:{manifest:EvaluationArtifactManifest,target:TargetDefinitionV2}):Promise<RegistrationReceipt>,read(id:string):Promise<{manifest:EvaluationArtifactManifest,target:TargetDefinitionV2}|null>}; local append-only is explicitly not a trusted external clock.
- ComparableOutcome = {target:TargetDefinitionV2,actual:EvidenceObservationV2,baselinePredictions:Record<string,number>,registrationId:string,normalizationScale:number|null}; effect is baseline-minus-candidate loss; interval is [number,number]|null.
- Material source hashes/spans must resolve retained bytes; numeric parameter units are documented (ROE/CoE/excess and growth fractions, continuingValuePv monetary source currency). ValidationPlan guardrails is Record<string,number>, groupDimensions is string[],issuerWeighting is"equal"|"record",blockMonths/minEffectiveBlocks/seed are integers.

### E01 — Field evidence, unit, definition and availability contract (P0)

**Dependencies:** None; producer adapters precede consumers.

**Files:**

- Create src/pipeline/evidence/financialEvidence.ts
- Modify src/edgar/statements.ts, src/edgar/financialEnrichment.ts, src/pipeline/keyless.ts, src/pipeline/dataBundle.ts, src/pipeline/types.ts
- Test tests/financialEvidence.test.ts

**Interfaces:** FinancialFactEvidence = {id,issuerId,concept,definitionId,value,unit,currency,periodStart,periodEnd,periodKind,filingDate,availableAt,sourceHash,sourceIds,ownershipBasis,accountingBasis}. assessFactCompatibility(facts: FinancialFactEvidence[], policy: FactCompatibilityPolicy, asOf: string): EvidenceEligibility; EvidenceEligibility = {status:"eligible"|"ineligible"|"unknown",reasonCodes:string[],factIds:string[]}. Policies require same issuer, monetary currency/unit, compatible definition and exact flow window; balance/flow policies explicitly define adjacency. Unknown metadata must never become verified compatibility.

**Behavior:** Retain per-field units and source lineage. Reject future filings/availability before selection. Do not silently convert EUR/USD or gross/net bank revenue; normalized values require reconciled operands and a versioned definition. Preserve raw vendor/SEC observations alongside eligible selection. Existing positive same-currency windows stay numerically identical.

**Regression and acceptance:** All incompatible/future operands withheld from new eligible facts; raw values and exclusions inspectable. Same-definition positive fixtures unchanged. Source-byte hash and accession available for independent tieout.

- [ ] Write named failing cases in `tests/financialEvidence.test.ts`: revenue100USD/cost60EUR/income30EUR => no derived gross profit40 and explicit mixed_unit; asOf2026-10-14 with2027-filed comparative200 => retain admissible100 and future_filing reason; two insurer annual starts Jan1/Jan11 => period_mismatch; eligible exact dimensions => eligible. Multi-accession restatement and53-week annual periods require explicit policy, not blanket365-day matching.
- [ ] Run `node node_modules/vitest/vitest.mjs run --config vitest.config.ts tests/financialEvidence.test.ts`; in a refreshed plan, preserve passing existing coverage and add a failing case only for a reproduced unresolved defect.
- [ ] Implement the interfaces/behavior above, using existing patterns and additive schema compatibility; no unrelated refactor.
- [ ] Rerun the same command; require all cases pass and positive fixture invariants. Use the refreshed plan's tracked regression fixtures to compare its declared eligibility, numeric and surface expectations; do not require unpublished local audit probes.
- [ ] Review changed source/contracts against the linked research gate (R01,R07,R10,R11); run typecheck and relevant consumer/export tests.
- [ ] Commit only task files after review, with message `fix: field evidence, unit, definition and availability contract`; retain acceptance artifacts. Release only after E12 and `npm run verify` plus fresh Windows/Linux CI.

### E02 — Strict shared evaluation targets and observations (P0)

**Dependencies:** E01 identity/evidence vocabulary; usable independently of production scoring.

**Files:**

- Create src/evaluation/targetDefinition.ts
- Modify src/evaluation/evaluationContract.ts, src/evaluation/evaluation.ts, src/report/evaluation.ts, scripts/evaluate-research.ts
- Test tests/evaluation.targetDefinition.test.ts

**Interfaces:** TargetDefinitionV2 = {schemaVersion:2,targetId,issuerId,securityId,metric,accountingBasis,currency,unit,shareBasis,corporateActionBasis,periodStart,periodEnd,horizonMonths,forecastKind,createdAt,methodArtifactHash,benchmarkId?}. EvidenceObservationV2 = {targetId,issuerId,securityId,metric,accountingBasis,currency,unit,shareBasis,corporateActionBasis,periodStart,periodEnd,availableAt,accession?,concept?,sourceHash,value}. parseTargetV2(input: unknown): TargetDefinitionV2; matchObservation(target:TargetDefinitionV2,actual:EvidenceObservationV2): EvidenceEligibility. Both use strict Zod objects; unknown keys reject. EvidenceEligibility is E01 type.

**Behavior:** Share contract adapters between evaluators without weakening report gates. Version1 records remain diagnostic-only with legacy_dimensions_unverified when dimensions absent. Separate metric/accounting/method/lead/horizon/benchmark strata; distinguish nowcast versus forecast. Reject identical security and benchmark. Dereference stored source hashes or emit source_unbound. Do not retroactively bless earlier metadata.

**Regression and acceptance:** New research counterexamples explicitly rejected with reasons; report evaluator existing identity/action gates preserved; version1 output clearly nonadmissible for validation. Hand MAE/Brier calculations unchanged for valid records.

- [ ] Write named failing cases in `tests/evaluation.targetDefinition.test.ts`: wrong issuerOTHER/metricnetIncome for TESTrevenue => excluded; GAAP versusadjusted => excluded; identical security andbenchmark => rejected; unknown supplied accountingDefinition => parse failure, not strip;1year and6year leads => distinct groups; exact filed dimensions/source bytes => included; pre-release actual => future_outcome.
- [ ] Run `node node_modules/vitest/vitest.mjs run --config vitest.config.ts tests/evaluation.targetDefinition.test.ts`; in a refreshed plan, preserve passing existing coverage and add a failing case only for a reproduced unresolved defect.
- [ ] Implement the interfaces/behavior above, using existing patterns and additive schema compatibility; no unrelated refactor.
- [ ] Rerun the same command; require all cases pass and positive fixture invariants. Use the refreshed plan's tracked regression fixtures to compare its declared eligibility, numeric and surface expectations; do not require unpublished local audit probes.
- [ ] Review changed source/contracts against the linked research gate (R01,R02,R03,R11); run typecheck and relevant consumer/export tests.
- [ ] Commit only task files after review, with message `fix: strict shared evaluation targets and observations`; retain acceptance artifacts. Release only after E12 and `npm run verify` plus fresh Windows/Linux CI.

### E03 — Shared time and market-bar admission for calculations and charts (P0)

**Dependencies:** None; E01-compatible diagnostic reason strings.

**Files:**

- Create src/pipeline/stageB/marketAdmission.ts
- Modify src/pipeline/compute.ts, src/pipeline/stageB/technicals.ts, src/components/charts/plotData.ts, src/cache/apiCache.ts, src/pipeline/stageA/validate.ts
- Test tests/marketAdmission.test.ts

**Interfaces:** admitMarketBars(rows: FmpEodBarRow[], context:{analysisAt:string,priceBasis:string}): {rows:FmpEodBarRow[],excluded:Array<{date:string,reason:string}>,basis:string}; assessTimestamp(value:string,now:string): {valid:boolean,ageSeconds:number|null,reason:string|null}. Use current exported FmpEodBarRow from src/providers/fmp.ts. Technical and chart consumers accept the same admitted rows and cutoff diagnostics.

**Behavior:** Reject dates after analysis date, invalid/nonpositive OHLC, low>high, and close/open outside high/low where all operands available. Sort and deduplicate exact duplicates; conflicting same-date OHLC requires exclusion with conflict reason, not arbitrary last winner. Do not drop flat/single-observation series merely because variance is zero. Cache fresh requires finite age>=0 and age<=TTL; future quote/cachedAt emits diagnostic. Existing FMP adapter controls remain.

**Regression and acceptance:** Raw future data cannot alter new score/report; chart/calculation count and SMA agree. Cross-surface app/MD/print and StageC payload retain same admitted asOf and exclusions. Legacy stored reports unchanged.

- [ ] Write named failing cases in `tests/marketAdmission.test.ts`: July6 cleanB72.16 and insertedJan1,2027close1000 => same clean score and future_bar exclusion;200unique bars+identical last => SMA50=102 both plot and calculator; conflicting duplicate => explicit exclusion; high80/low120 => reject; at TTL/zero/negative/NaN age tested; market closure/year boundary valid dates accepted.
- [ ] Run `node node_modules/vitest/vitest.mjs run --config vitest.config.ts tests/marketAdmission.test.ts`; in a refreshed plan, preserve passing existing coverage and add a failing case only for a reproduced unresolved defect.
- [ ] Implement the interfaces/behavior above, using existing patterns and additive schema compatibility; no unrelated refactor.
- [ ] Rerun the same command; require all cases pass and positive fixture invariants. Use the refreshed plan's tracked regression fixtures to compare its declared eligibility, numeric and surface expectations; do not require unpublished local audit probes.
- [ ] Review changed source/contracts against the linked research gate (R05,R09); run typecheck and relevant consumer/export tests.
- [ ] Commit only task files after review, with message `fix: shared time and market-bar admission for calculations and charts`; retain acceptance artifacts. Release only after E12 and `npm run verify` plus fresh Windows/Linux CI.

### E04 — Metric eligibility from validation through scoring and displays (P0)

**Dependencies:** E01; consume E03 market exclusions where relevant.

**Files:**

- Modify src/pipeline/compute.ts, src/pipeline/stageB/scoringEvidence.ts, src/pipeline/stageB/grading.ts, src/pipeline/stageC/payload.ts, src/pipeline/stageC/dataOnlyReport.ts
- Modify src/report/schema.ts, src/components/report/primitives.tsx, src/report/export/markdown.ts, src/report/export/printHtml.ts
- Test tests/scoringEligibility.test.ts

**Interfaces:** MetricEligibility = EvidenceEligibility & {metricId:string,operandIds:string[],validationCheckIds:string[]}; buildMetricEligibility(bundle:DataBundle,validation:ValidationReport): Record<string,MetricEligibility>. Extend runStageB with optional eligibility context only for legacy compatibility; new generation must supply it. ScoringEvidence stores provenanceStatus and eligibility separately.

**Behavior:** Link materially failed semantic checks to affected operands, not blanket-disable an issuer for any warning. Ineligible/unknown-comparability signal contributes no observed evidence; existing declared missingness rule remains until research. Payload contains exclusion and replacement absence; all surfaces show eligibility separately from citation tracing. New pipeline version; no rewrite of stored reports or weight table.

**Regression and acceptance:** Adversarial incompatible growth not scored as full evidence; positives byte-equivalent in numeric score JSON except new metadata/version. No claim corrected JPM B/C grade until full annual+quarter reconciliation. Snapshot new version and downstream traces checked.

- [ ] Write named failing cases in `tests/scoringEligibility.test.ts`: JPM historicalnet/gross endpoints => CAGR ineligible even with citations; stale but semantically valid row follows existing freshness policy without unrelated metric suppression; fully comparable positive fixture retains exact current score; one invalid field suppresses only dependent signals; absent context explicitly legacy_not_assessed.
- [ ] Run `node node_modules/vitest/vitest.mjs run --config vitest.config.ts tests/scoringEligibility.test.ts`; in a refreshed plan, preserve passing existing coverage and add a failing case only for a reproduced unresolved defect.
- [ ] Implement the interfaces/behavior above, using existing patterns and additive schema compatibility; no unrelated refactor.
- [ ] Rerun the same command; require all cases pass and positive fixture invariants. Use the refreshed plan's tracked regression fixtures to compare its declared eligibility, numeric and surface expectations; do not require unpublished local audit probes.
- [ ] Review changed source/contracts against the linked research gate (R01,R02); run typecheck and relevant consumer/export tests.
- [ ] Commit only task files after review, with message `fix: metric eligibility from validation through scoring and displays`; retain acceptance artifacts. Release only after E12 and `npm run verify` plus fresh Windows/Linux CI.

### E05 — Typed valuation assumptions and consistent narrative/export basis (P1)

**Dependencies:** None for output contradiction; E01 improves source evidence.

**Files:**

- Create src/pipeline/stageB/valuationAssumptions.ts
- Modify src/pipeline/stageB/valuation.ts, src/pipeline/compute.ts, src/pipeline/stageC/payload.ts, src/pipeline/stageC/dataOnlyReport.ts, src/report/schema.ts, src/report/auditTables.ts
- Modify src/components/report/ValuationReview.tsx, src/report/export/markdown.ts, src/report/export/printHtml.ts
- Test tests/valuationAssumptions.test.ts

**Interfaces:** FinancialValuationAssumptions = {version,modelKind:"excess-return",horizonYears,costOfEquity,initialCommonBook,roePathBasis,terminalRoe,terminalGrowth,terminalExcessReturn,continuingValuePv,continuingValueSharePct,evidenceIds,limitations}. describeFinancialValuation(a:FinancialValuationAssumptions): string. Output prose derives only from this typed object.

**Behavior:** Carry actual financial forward assumptions into computed route metrics, prompt, report and exports. Distinguish finite cross-check from continuing forward model; eliminate hard-coded no-CV statement when CV>0. Include continuation share and source basis. Keep existing numeric model and weights exactly unchanged; legacy assumption absence prints unavailable, never inferred no continuation.

**Regression and acceptance:** Exact numeric parity with old model; no contradiction across payload/data-only/AI synthesis fields/app/MD/print. Generated prompt contains all material assumptions and no invented certainty.

- [ ] Write named failing cases in `tests/valuationAssumptions.test.ts`: JPM preservedmodelCV128918923285.23,terminalexcess0.05 => all surfaces state continuation; zeroexcessCV0 => no continuing value accurately; synthetic18%ROE10%CoE model keeps196.0652 value; missinglegacyassumptions => unavailable; near-zero numeric CV rounded display cannot change model semantics.
- [ ] Run `node node_modules/vitest/vitest.mjs run --config vitest.config.ts tests/valuationAssumptions.test.ts`; in a refreshed plan, preserve passing existing coverage and add a failing case only for a reproduced unresolved defect.
- [ ] Implement the interfaces/behavior above, using existing patterns and additive schema compatibility; no unrelated refactor.
- [ ] Rerun the same command; require all cases pass and positive fixture invariants. Use the refreshed plan's tracked regression fixtures to compare its declared eligibility, numeric and surface expectations; do not require unpublished local audit probes.
- [ ] Review changed source/contracts against the linked research gate (R07,R09); run typecheck and relevant consumer/export tests.
- [ ] Commit only task files after review, with message `fix: typed valuation assumptions and consistent narrative/export basis`; retain acceptance artifacts. Release only after E12 and `npm run verify` plus fresh Windows/Linux CI.

### E06 — Common ownership and effective-dated security/share basis (P1)

**Dependencies:** E01 facts and eligibility; E04 consumers.

**Files:**

- Create src/pipeline/stageB/securityBasis.ts
- Modify src/pipeline/commonEarnings.ts, src/pipeline/stageB/financialMetrics.ts, src/pipeline/stageB/valuation.ts, src/pipeline/stageB/sectorRouting.ts, src/pipeline/stageB/instrumentSupport.ts, src/edgar/splits.ts
- Test tests/securityBasis.test.ts

**Interfaces:** SecurityBasisEvidence = {issuerId,securityId,ordinaryClassId,quoteUnit:"ordinary"|"ADS",ordinarySharesPerQuotedUnit,effectiveFrom,effectiveTo,sourceHash,sourceIds}. CommonCapitalEvidence = {totalEquity,preferredEquity,noncontrollingEquity,commonEquity,totalNetIncome,preferredDividends,noncontrollingIncome,commonNetIncome,eligibility}. resolveSecurityBasis(evidence:SecurityBasisEvidence[],asOf:string): SecurityBasisEvidence|null; commonMultiples(input:CommonMultipleInput): {pe:number|null,pb:number|null,eligibility:EvidenceEligibility}. CommonMultipleInput binds price/marketcap and earnings/book to identity/date.

**Behavior:** Use common-holder denominator for common market-cap multiples. Any separate total-equity house convention must be separately named, not used as comparable common P/B. Missing preferred/NCI data is unknown when material, not assumed zero. Per-ADS EPS = ordinaryEPS*ordinarySharesPerQuotedUnit, only with verified dated basis; avoid double-adjusting provider ADS EPS. Ratio changes distinct from stock splits. Unknown security basis withholds affected per-share values. Maintain existing cash bridge; only extend reconciliation evidence where missing.

**Regression and acceptance:** Owner/security mismatches rejected; primary source and effective dates inspectable; eligible ordinary positive fixtures retain outputs. REIT approximate FFO remains explicitly approximate until common/JV/NCI reconciliation; no implication exact Nareit FFO.

- [ ] Write named failing cases in `tests/securityBasis.test.ts`: cap1000,totalEq200,pref100 => commonPB10; totalNI10,commonNI5 => PE200 when EPSabsent; ADS50,ordinaryEPS2,ratio5 => PE5; alreadyADS EPS10 => also5 without second adjustment; pre/postratio dates select correct event; conflicting/end-shareweighted-average basis => unknown; existing preferred-aware TBV unchanged.
- [ ] Run `node node_modules/vitest/vitest.mjs run --config vitest.config.ts tests/securityBasis.test.ts`; in a refreshed plan, preserve passing existing coverage and add a failing case only for a reproduced unresolved defect.
- [ ] Implement the interfaces/behavior above, using existing patterns and additive schema compatibility; no unrelated refactor.
- [ ] Rerun the same command; require all cases pass and positive fixture invariants. Use the refreshed plan's tracked regression fixtures to compare its declared eligibility, numeric and surface expectations; do not require unpublished local audit probes.
- [ ] Review changed source/contracts against the linked research gate (R05,R06,R07); run typecheck and relevant consumer/export tests.
- [ ] Commit only task files after review, with message `fix: common ownership and effective-dated security/share basis`; retain acceptance artifacts. Release only after E12 and `npm run verify` plus fresh Windows/Linux CI.

### E07 — Adjacent opening balances and shared liquidity conflicts (P1)

**Dependencies:** E01 compatibility; E06 ownership scope.

**Files:**

- Modify src/pipeline/stageB/financialMetrics.ts, src/pipeline/stageB/netDebt.ts, src/pipeline/stageB/sectorRouting.ts, src/pipeline/compute.ts
- Test tests/financialPeriodLiquidity.test.ts

**Interfaces:** resolveAverageBalance(input:{flow:FinancialFactEvidence,opening:FinancialFactEvidence|null,closing:FinancialFactEvidence,reportedAverage:FinancialFactEvidence|null}): {value:number|null,basis:string,eligibility:EvidenceEligibility}; resolveLiquidityComponents(input:LiquidityEvidence): {value:number|null,components:string[],eligibility:EvidenceEligibility}. LiquidityEvidence = {combined:FinancialFactEvidence|null,cash:FinancialFactEvidence|null,shortTermInvestments:FinancialFactEvidence|null,restrictedCash:FinancialFactEvidence|null}.

**Behavior:** Opening stock must align with flow start under documented fiscal calendar, not previous available annual row. Reported true averages may be used only on their own compatible definition. Reuse net-debt conflict logic for runway; never add combined and components twice. Restricted cash/commitments remain separate disclosed constraints, not invented adjustments.

**Regression and acceptance:** No silent nonadjacent balance averages or contradictory runway; compatible controls stable; exact dates/components and exclusions visible in three outputs.

- [ ] Write named failing cases in `tests/financialPeriodLiquidity.test.ts`: 2025flow with2023opening => no average13.333%; adjacent2024opening/2025closing => positive10% fixture; combined500 versuscomponents1000+0 => liquidity null/conflict and no10quarter point; consistent500/burn50 =>10quarters; missingcash orzero/nonpositiveburn follows explicit NA path.
- [ ] Run `node node_modules/vitest/vitest.mjs run --config vitest.config.ts tests/financialPeriodLiquidity.test.ts`; in a refreshed plan, preserve passing existing coverage and add a failing case only for a reproduced unresolved defect.
- [ ] Implement the interfaces/behavior above, using existing patterns and additive schema compatibility; no unrelated refactor.
- [ ] Rerun the same command; require all cases pass and positive fixture invariants. Use the refreshed plan's tracked regression fixtures to compare its declared eligibility, numeric and surface expectations; do not require unpublished local audit probes.
- [ ] Review changed source/contracts against the linked research gate (R07,R08); run typecheck and relevant consumer/export tests.
- [ ] Commit only task files after review, with message `fix: adjacent opening balances and shared liquidity conflicts`; retain acceptance artifacts. Release only after E12 and `npm run verify` plus fresh Windows/Linux CI.

### E08 — Stable and disclosed own-history rank ties (P2)

**Dependencies:** E01/E06 comparable history; independent helper fix can precede.

**Files:**

- Modify src/pipeline/stageB/valuation.ts, src/pipeline/stageB/grading.ts
- Test tests/valuation.rankTies.test.ts

**Interfaces:** rankComparableHistory(current:number,history:number[],options:{relativeTolerance:number,absoluteTolerance:number,minObservations:number}): {percentile:number|null,n:number,tiedN:number,degenerate:boolean,basis:string}. Proposed initial relativeTolerance1e-8,absoluteTolerance1e-8 for multiples; nondegenerate midrank =100*(less+0.5*equal)/n.

**Behavior:** All-equal/degenerate history is uninformative: percentile null and no grade contribution. For nondegenerate history use tolerance-aware midrank; do not promote neutral to empirically good. Preserve incomparable-window refusal. Version change because affected new scores change.

**Regression and acceptance:** Helper and integrated synthetic trace stable under epsilon; nondegenerate hand midranks correct; record live incidence before broader weight/ranking redesign.

- [ ] Write named failing cases in `tests/valuation.rankTies.test.ts`: eight20x,current20 or20+1e-10 => degenerate/null both; history10,20,20,30,current20 =>50; current10 =>12.5; incomparable/too-short =>null; integrated frozen StageB fixture verifies no cliff through report and grade.
- [ ] Run `node node_modules/vitest/vitest.mjs run --config vitest.config.ts tests/valuation.rankTies.test.ts`; in a refreshed plan, preserve passing existing coverage and add a failing case only for a reproduced unresolved defect.
- [ ] Implement the interfaces/behavior above, using existing patterns and additive schema compatibility; no unrelated refactor.
- [ ] Rerun the same command; require all cases pass and positive fixture invariants. Use the refreshed plan's tracked regression fixtures to compare its declared eligibility, numeric and surface expectations; do not require unpublished local audit probes.
- [ ] Review changed source/contracts against the linked research gate (R09); run typecheck and relevant consumer/export tests.
- [ ] Commit only task files after review, with message `fix: stable and disclosed own-history rank ties`; retain acceptance artifacts. Release only after E12 and `npm run verify` plus fresh Windows/Linux CI.

### E09 — Issuer-bound sources, atomic claims and event resolution (P1)

**Dependencies:** E01 source lineage, E02 evaluated target identity.

**Files:**

- Create src/pipeline/stageC/propositionEvidence.ts
- Modify src/providers/companyIr.ts, src/providers/companyEvents.ts, src/pipeline/dataBundle.ts, src/pipeline/stageC/claimEvidence.ts, src/pipeline/stageC/passes.ts, src/report/schema.ts
- Modify src/components/report/ClaimText.tsx, src/report/export/markdown.ts, src/report/export/printHtml.ts
- Test tests/issuerPropositionEvidence.test.ts

**Interfaces:** ConfirmedIssuerIdentity = {cik,canonicalName,validAliases,verifiedWebsite,websiteSource,websiteObservedAt}; SourceAuthorityEdge = {from,to,relation,evidenceHash,observedAt}; AnnouncementEvidence = {subjectIssuerId,documentIssuerId,publishedAt,observedAt,eventDate,sourceHash,span}; PropositionEvidence = {claimId,propositionId,contentHash,materiality,sourceSpans,status:"cited"|"numeric-match"|"partially-supported"|"supported"|"contradicted"|"unreviewed"}; bindAnnouncement(input:AnnouncementInput,issuer:ConfirmedIssuerIdentity): AnnouncementEvidence|null; assessPropositions(input:MaterialClaim,retainedSources:RetainedSource[]): PropositionEvidence[].

**Behavior:** Bind event sentence subject and document issuer through verified link authority, including legitimate external IR platforms. SEC host alone insufficient. Retain source content/publication/observation dates and exact spans. Matched numeric proposition cannot validate unrelated allegation. Event targets add immutable ID,horizon,resolution rule and resolution evidence; human labels retain reviewer/blind/adjudication and sampling manifest. Do not automatically assert semantic truth from URL or enum.

**Regression and acceptance:** New cross-issuer/compound-claim probes resolved without weakening network budgets. Matching proposition statuses in app/MD/print and evaluator labels. Legacy whole-claim statuses shown as legacy granularity, not retroactively certified.

- [ ] Write named failing cases in `tests/issuerPropositionEvidence.test.ts`: TEST→OTHER IR => no company_confirmed TEST event; legitimate external issuer-hosted release => confirmed with binding; parent/subsidiary ambiguous =>gap; supportedrevenue100+unsupportedallegation =>partially-supported, allegationunreviewed; changedsourcehash => exclusion; subjectless proven issuer-specific release remains auditable.
- [ ] Run `node node_modules/vitest/vitest.mjs run --config vitest.config.ts tests/issuerPropositionEvidence.test.ts`; in a refreshed plan, preserve passing existing coverage and add a failing case only for a reproduced unresolved defect.
- [ ] Implement the interfaces/behavior above, using existing patterns and additive schema compatibility; no unrelated refactor.
- [ ] Rerun the same command; require all cases pass and positive fixture invariants. Use the refreshed plan's tracked regression fixtures to compare its declared eligibility, numeric and surface expectations; do not require unpublished local audit probes.
- [ ] Review changed source/contracts against the linked research gate (R03,R04); run typecheck and relevant consumer/export tests.
- [ ] Commit only task files after review, with message `fix: issuer-bound sources, atomic claims and event resolution`; retain acceptance artifacts. Release only after E12 and `npm run verify` plus fresh Windows/Linux CI.

### E10 — Prospective registry and code/source/method custody (P1)

**Dependencies:** E02 targets and E01 hashes; additive DB migration in disposable workspace.

**Files:**

- Create src/evaluation/registry.ts, src/evaluation/artifactManifest.ts
- Modify src/pipeline/runInputSnapshot.ts, src/pipeline/runInputSnapshotStore.ts, src/pipeline/jobRunner.ts, src/db/schema.ts, src/db/index.ts, src/report/evaluation.ts
- Test tests/evaluation.registry.test.ts

**Interfaces:** EvaluationArtifactManifest = {inputHash,reportHash,targetHash,codeCommit,dirtyDiffHash,dependencyLockHash,pipelineVersion,promptHash,modelVersion,methodArtifactHash,acquiredAt,createdAt,frozenAt,registrationId}. registerForecast(manifest:EvaluationArtifactManifest,target:TargetDefinitionV2,store:EvaluationRegistryStore): Promise<RegistrationReceipt>; RegistrationReceipt = {id,sequence,recordHash,recordedAt,custodyStatus:"local-append-only"|"externally-timestamped"}. Store contract supports append/read, never update registered target.

**Behavior:** Register before outcomes and preserve separate cohorts for retries/version changes. Content hashes protect mutation but do not claim trusted time; optionally add externally witnessed append log later. Missing/cancelled/delisted records stay in denominator with reasons. Current older reports remain historical reconstruction unless original custody exists. Read-only CLI resolves raw bytes and method artifact, not regex hash format.

**Regression and acceptance:** Reproducible code/input/target artifacts with explicit custody class; no production report rewrites. Disposable DB migration round-trip and restore checked; snapshot replay values unchanged.

- [ ] Write named failing cases in `tests/evaluation.registry.test.ts`: changedtarget/source/report/method hash => reject; callerforgedpastcreatedAt => notexternallytimestamped; sameimmutable retry => idempotent; newgeneration => distinctrecord; deletedissuer stays denominator; legacy30 reports cannot silently join prospective validation.
- [ ] Run `node node_modules/vitest/vitest.mjs run --config vitest.config.ts tests/evaluation.registry.test.ts`; in a refreshed plan, preserve passing existing coverage and add a failing case only for a reproduced unresolved defect.
- [ ] Implement the interfaces/behavior above, using existing patterns and additive schema compatibility; no unrelated refactor.
- [ ] Rerun the same command; require all cases pass and positive fixture invariants. Use the refreshed plan's tracked regression fixtures to compare its declared eligibility, numeric and surface expectations; do not require unpublished local audit probes.
- [ ] Review changed source/contracts against the linked research gate (R01,R02,R11); run typecheck and relevant consumer/export tests.
- [ ] Commit only task files after review, with message `fix: prospective registry and code/source/method custody`; retain acceptance artifacts. Release only after E12 and `npm run verify` plus fresh Windows/Linux CI.

### E11 — Comparable evaluation groups and dependence-aware uncertainty (P2)

**Dependencies:** E02/E10 and matured admissible outcomes; no inferential output without them.

**Files:**

- Create src/evaluation/pairedDiagnostics.ts
- Modify src/evaluation/evaluation.ts, src/evaluation/evaluationContract.ts, src/report/evaluation.ts, src/report/evaluationCli.ts
- Test tests/evaluation.pairedDiagnostics.test.ts

**Interfaces:** comparePairedForecasts(records:ComparableOutcome[],plan:ValidationPlan,seed:number): PairedDiagnostics; ValidationPlan = {primaryMetric,groupDimensions,blockMonths,issuerWeighting,minEffectiveBlocks,minimumEffect,guardrails,holdoutManifestHash}; PairedDiagnostics = {matchedN,issuerN,dateBlockN,effect,interval,exclusions,readiness:"insufficient"|"diagnostic"|"heldout"}. ComparableOutcome is E02 target plus actual,baseline predictions and registration ID.

**Behavior:** Separate lead/method/basis; equal-issuer and size-normalized errors for monetary forecasts, pp for margins; avoid MAPE at zero. Resample date blocks with issuer clustering and horizon-overlap policy locked in manifest. Report nominal/effective breadth separately. Grade stability remains stability, realized benchmark return remains outcome, not model forecast error.

**Regression and acceptance:** No calibrated accuracy from pending/metadata-only cohorts; paired intervals and readiness reproducible from manifest; decisions reference predeclared thresholds, not best observed stratum.

- [ ] Write named failing cases in `tests/evaluation.pairedDiagnostics.test.ts`: sharedsame-date sixissuers => insufficient independentperiods, not20..20 skill interval; handtwo-record MAE/RMSE/bias and pairednormalizedeffect => exact; missingdelisting/futureactual excluded with attrition;1year/6year never pooled; bootstrap deterministicseed positivefixture.
- [ ] Run `node node_modules/vitest/vitest.mjs run --config vitest.config.ts tests/evaluation.pairedDiagnostics.test.ts`; in a refreshed plan, preserve passing existing coverage and add a failing case only for a reproduced unresolved defect.
- [ ] Implement the interfaces/behavior above, using existing patterns and additive schema compatibility; no unrelated refactor.
- [ ] Rerun the same command; require all cases pass and positive fixture invariants. Use the refreshed plan's tracked regression fixtures to compare its declared eligibility, numeric and surface expectations; do not require unpublished local audit probes.
- [ ] Review changed source/contracts against the linked research gate (R01,R02,R09,R11); run typecheck and relevant consumer/export tests.
- [ ] Commit only task files after review, with message `fix: comparable evaluation groups and dependence-aware uncertainty`; retain acceptance artifacts. Release only after E12 and `npm run verify` plus fresh Windows/Linux CI.

### E12 — Disposable operational and product verification harness (P2 operational; high-risk boundaries first)

**Dependencies:** Independent infrastructure; run after changed tasks for final release.

**Files:**

- Create tests/integration/reliability.boundaries.test.ts, scripts/verify-disposable-flow.mjs
- Modify tests/jobScheduler.test.ts, tests/api.routes.sameOrigin.test.ts, tests/degradation.outage.simulation.test.ts only as needed
- Modify tests/repository.release.test.ts together with the suite configuration: update tracked-test partition assertions and the loaded product-exclude/integration-include expectations to account for both the existing database CLI test and the new reliability integration test.
- Modify vitest.shared.ts integration include to add the new reliability test and exclude it from product selection; review src/pipeline/jobScheduler.ts, src/ai/transport.ts, src/cache/apiCache.ts, src/db/index.ts, src/app/api/*, .github/workflows/ci.yml

**Interfaces:** runDisposableFlow(config:{dbPath:string,providerMode:"offline-fixture",allowPaid:false,viewport:{width:number,height:number},fault:string|null}): Promise<FlowVerification>; FlowVerification = {requestId,inputHash,artifactHash,admittedCalls,settledMicroUsd,storedReportHash,visibleChecks,failures}. Reject production DB paths and any real paid transport in harness.

**Behavior:** Inject401/429/timeouts/poisonedcache/diskfailure/leaseexpiry/cancel/crash-at-settlement with mocked providers. Assert no stale-owner write, no duplicate settlement and no paid admission after refusal. Verify browser→API→bundle→stored report→app/export on disposable data, keyboard and430pxmobile plusdesktop; cover empty/missing/legacy/error SSE states. Read relevant local Next docs before app code. Preserve origin/auth/secret redaction/lease/budget safeguards.

**Regression and acceptance:** The integration config discovers tests/integration/reliability.boundaries.test.ts and the product config excludes it; offline fault matrix passes, screenshot/DOM assertions and source→output hashes retained; npm run verify plus freshWindows/LinuxCI before release. No live-provider accuracy or exhaustive security claim.

- [ ] Write named failing cases in `tests/integration/reliability.boundaries.test.ts`: forgedOrigin => nojob/nocharge; twoowners => onepublish; settledretry => exactonce microUSD; cancellation => nofollowoncall; corruptcachedbody => explicitrecovery; partialoutage => disclosedmissingdata; diskrestore => samepersistedhash; app/MD/print sameeligibility andvaluationbasis.
- [ ] Run `node node_modules/vitest/vitest.mjs run --config vitest.integration.config.ts tests/integration/reliability.boundaries.test.ts`; in a refreshed plan, preserve passing existing coverage and add a failing case only for a reproduced unresolved defect.
- [ ] Implement the interfaces/behavior above, using existing patterns and additive schema compatibility; no unrelated refactor.
- [ ] Rerun the same command; require all cases pass and positive fixture invariants. Use the refreshed plan's tracked regression fixtures to compare its declared eligibility, numeric and surface expectations; do not require unpublished local audit probes.
- [ ] Review changed source/contracts against the linked research gate (R04,R11); run typecheck and relevant consumer/export tests.
- [ ] Commit only task files after review, with message `fix: disposable operational and product verification harness`; retain acceptance artifacts. Release only after E12 and `npm run verify` plus fresh Windows/Linux CI.

## Migration and release policy

New reports receive a new pipeline/evidence schema version. Stored source observations remain immutable. Legacy fields may be unknown; do not fill with guessed evidence. Introduce comparison diagnostics before changing scores; compare eligible positive fixtures exactly and preserve controlled affected-case changes. Any report correction is a separate saved version with provenance, never an in-place rewrite. No production rollout is performed by this audit.
