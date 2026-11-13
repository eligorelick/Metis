/**
 * Every version stamp, format version and frozen spec cutoff in Metis (P27:
 * version stamps move together; P21: a change of meaning gets a stamp).
 *
 * This is the one file that DEFINES them. Each constant is still re-exported
 * from the module that used to define it, so importers are unchanged; a guard
 * test (tests/versions.oneFile.test.ts) fails if a stamp or cutoff is defined
 * anywhere else in src. Values, literal types and version-history comments are
 * exactly as they were where each constant used to live. The bump convention
 * is in docs/METHODOLOGY.md; nothing here bumps a stamp automatically.
 *
 * This module imports nothing, so the report readers, the CLI export tool, the
 * Stage B replay entry and tests can load it without any server-only module.
 *
 * Consumer inventory (what kind each constant is, and who reads it; grepped
 * 2026-11-12). Kinds:
 *   format gate   - a stored record or file is parsed or accepted only under
 *                   this exact value;
 *   method label  - stamped into a figure or block to name the rule that made
 *                   it; read for display, audit and identity checks;
 *   display cutoff - compared with a saved report's own stamp to choose a
 *                   read-time note or view (P21); frozen, never bumped;
 *   cache/resume key - part of a key that decides whether stored work is
 *                   reused;
 *   build label   - names the code that built a report; shown and diffed.
 *
 * | Constant | Kind | Read by |
 * |---|---|---|
 * | REPORT_SPEC_VERSION | build label; cache/resume key; display epoch | written to `meta.specVersion` and the `reports.specVersion` column by `pipeline/jobRunner.ts` and `pipeline/stageC/passes.ts` (also the default `pipelineVersion` there); part of `CURRENT_SNAPSHOT_VERSIONS` (`pipeline/runInputSnapshot.ts`), which gates input reuse (`pipeline/companyData.ts`), the frozen-snapshot check (`pipeline/jobRunner.ts`), replay (`pipeline/replayRunInput.ts`) and the analysis cache key (`components/report/companyAnalysis.ts`); a saved report's stamp is then read by the history diff (`report/diff.ts`, "spec-version-mismatch"), the UI and exports. Legacy readers compare saved stamps with the frozen cutoffs below, never with this constant. |
 * | PAYLOAD_VERSION | cache/resume key; prompt label | `payloadFingerprint` (`pipeline/stageC/payload.ts`) = version + content hash, stored as `jobs.payloadFingerprint` to decide pass resume; `payload.payloadVersion`; the prompt header "CONTEXT PAYLOAD (payloadVersion …)". |
 * | PIPELINE_VERSION | build label | `meta.pipelineVersion` written by `pipeline/jobRunner.ts` and `pipeline/stageC/index.ts`; shown by the UI and exports, compared by `report/diff.ts`, `report/forecastAdapter.ts` and `report/evaluation.ts` as stored metadata. |
 * | EVIDENCE_CONTRACT_VERSION | display cutoff (equality) | written to `meta.evidenceContract` by `pipeline/jobRunner.ts` and `pipeline/stageC/passes.ts`; `report/evidenceContract.ts` compares a saved stamp with it to choose the "figures as saved" notice. |
 * | STAGE_B_IMPLEMENTATION_VERSION | cache/resume key | `CURRENT_SNAPSHOT_VERSIONS.stageB` (`pipeline/runInputSnapshot.ts`): input reuse, replay refusal, frozen-snapshot check and analysis cache key (same readers as REPORT_SPEC_VERSION's snapshot use). |
 * | FAIR_VALUE_METHOD_VERSION | method label | `fairValue.methodVersion` (`pipeline/stageB/fairValue.ts`); registered into the payload (`pipeline/stageC/payload.ts`). |
 * | SCENARIO_TARGET_METHOD_VERSION | method label | `scenarioTargets.methodVersion` (`pipeline/stageB/scenarioTargets.ts`); registered into the payload. |
 * | SCENARIO_PATHS_METHOD_VERSION | method label; identity check | `scenarioAssumptions.methodVersion` (`pipeline/stageB/scenarioPaths.ts`); `pipeline/stageB/scenarioAlignment.ts` requires the projection fan and the target table to carry the same value. |
 * | SCORE_BANDS_VERSION | method label; cache/resume key | `scores.bandsVersion` (`pipeline/stageB/grading.ts`), printed in the payload and audit export, compared by `report/diff.ts`; `CURRENT_SNAPSHOT_VERSIONS.scoreBands`. |
 * | PROJECTION_WEIGHTS_VERSION | method label | `projections.weightsVersion` (`pipeline/stageB/projections.ts`); payload and audit export. |
 * | NET_DEBT_RESOLVER_VERSION | method label | the net-debt result's `version` (`pipeline/stageB/netDebt.ts`); quoted in the invested-capital basis text (`pipeline/stageB/returns.ts`). |
 * | EVIDENCE_SELECTION_VERSION, NOTES_RISK_SELECTION_VERSION, EVENT_SELECTION_VERSION | method label | excerpt `coverage.version` (`pipeline/stageC/evidenceSelection.ts`), quoted in the payload's omitted-characters reason (`pipeline/stageC/payload.ts`). |
 * | GRADE_OVERRIDE_VERSION | method label | `gradeContract.version` on a grade block (`pipeline/stageC/gradeContract.ts`). |
 * | CURRENT_REPORTS_VERSION | method label (provider record) | `data.version` on the 8-K read record (`providers/currentReports.ts`); no src reader compares it. |
 * | RUN_INPUT_SNAPSHOT_FORMAT | format gate | `formatVersion` literal in the snapshot parser (`pipeline/runInputSnapshot.ts`) and snapshot refs (`pipeline/runInputSnapshotStore.ts`). |
 * | PASS_ARTIFACT_ENVELOPE_VERSION | format gate | `artifactVersion` of durable pass artifacts (`pipeline/jobArtifacts.ts`); another value is refused on read. |
 * | EVALUATION_POLICY_VERSION | format gate | `policyVersion` of evaluation snapshots and results (`report/evaluation.ts`); another value is refused. |
 * | FORECAST_ADAPTER_VERSION | format gate | `adapterVersion` literal of selected-forecast records (`report/forecastAdapter.ts`). |
 * | PAYLOAD_RECORD_CORRECTION_SPEC | display cutoff | `report/legacyPayloadRecordSafety.ts`, via the saved-report view (`pipeline/stageB/valuation.ts` composes the legacy views; `report/storedReportView.ts`). |
 * | EDGAR_DERIVED_LINES_SINCE_SPEC_VERSION | display cutoff | `report/legacyEdgarDerivedLines.ts` (same read path). |
 * | BRIDGE_METHOD_SINCE_SPEC_VERSION, BRIDGE_READINGS_SINCE_SPEC_VERSION | display cutoff | `report/legacyBridgeMethod.ts` clause table and note wording (same read path). |
 * | ANNUALIZATION_CONVENTION_SPEC, DCF_INPUTS_CONVENTION_SPEC | display cutoff | `report/legacyValuationNotes.ts` (same read path). |
 * | IMPLIED_RETURN_SHARE_BASIS_SPEC | display cutoff | `report/legacyImpliedReturnShareBasis.ts` (same read path). |
 * | LEGACY_SCOPE_SINCE_SPEC, LEGACY_PLACEHOLDER_DISPLAY_CUTOFF | display cutoff | `report/legacyScopeQualifications.ts` (same read path). |
 * | INSIDER_ROLES_READ_FROM | display cutoff | `legacyCheckNote` (`report/claimMatching.ts`), used by the audit export (`report/export/auditMarkdown.ts`); read through `specVersionBefore` like every other display cutoff (D-249). |
 * | N4B_CAGR_DISPLAY_CUTOFF | display cutoff | no src reader (`report/cagrPresentation.ts` only re-exports it); pinned by tests/report.versionStamps.test.ts. |
 * | CORPORATE_ACTION_BRIDGE_WRITING_STAMPS | format gate (exact saved stamps) | `report/legacyRetiredFields.ts`, on the stored-report read (`report/storedReportRead.ts`, `report/legacyEntitySafety.ts`). |
 *
 * Reading a saved stamp against a display cutoff (P21, D-249). Every "display
 * cutoff" row above is compared with a saved report's `meta.specVersion` by
 * the one function at the end of this file, `specVersionBefore`, which reads
 * the stamp with `parseSpecStamp`. No reader parses or orders a spec stamp
 * itself (tests/report.savedStampOrder.oneOwner.test.ts). The comparison lives
 * here, not in the P21 owner `report/legacyEntitySafety.ts`, because that
 * module imports every legacy reader (a helper there would be a circular
 * import) and this one imports nothing and already defines every cutoff the
 * comparison reads. Stamps that are not ordered are read by equality and keep
 * their own readers: `meta.evidenceContract` (`report/evidenceContract.ts`:
 * absent, current or unrecognised), the exact writing stamps of
 * CORPORATE_ACTION_BRIDGE_WRITING_STAMPS, and the two stored stamps the
 * history diff compares (`report/diff.ts`).
 *
 * Deliberately not here: request/AI identity (`ai/fingerprint.ts` "ai-v1",
 * the `ai/mutex.ts` lock-file format), Anthropic tool types
 * (`providers/anthropic.ts`), the durable launch capability token
 * (`DURABLE_LAUNCH_AUTHORITY_CAPABILITY`, `pipeline/jobRunner.ts`), the derived
 * `CURRENT_SNAPSHOT_VERSIONS` object, method ids that are not versions
 * (`SCENARIO_TARGET_METHOD`), and inline per-record shape versions written as
 * object fields (for example `version: "1"` / `"1.0.0"` in evidence timing,
 * source facts and filing disclosures).
 */

/* ------------------------------------------------------------------------ *
 * Report, payload and pipeline stamps (written on every new report or pass)
 * ------------------------------------------------------------------------ */

/**
 * Bumped whenever the report shape changes in a persistence-visible way.
 *
 * 1.3.0 (2026-09-30, currency integrity): every money figure carries only a
 * currency established by its own evidence — never a legacy dollar default;
 * figures that combine statements or years exist only when those rows share
 * one established currency; analyst estimates count as money only in their
 * own currency; route metrics may carry an optional `currency`. Reports saved
 * under 1.2.0 are still read and rendered as stored (never rewritten); the
 * history diff marks a 1.2.0 → 1.3.0 comparison "spec-version-mismatch".
 *
 * 1.4.0 (2026-09-30, stock-split correctness): every share count and
 * per-share figure is stated on the share basis of the price it is compared
 * with, fixed from the price vendor's first split-adjusted session (never an
 * XBRL context date); a figure whose basis cannot be established is withheld —
 * EPS and share counts, the market values, EV, float and every per-share
 * valuation and grade built on them. Reports saved under 1.3.0 are read and
 * rendered as stored; a 1.3.0 → 1.4.0 comparison is "spec-version-mismatch".
 */
// 1.5.0 (2026-10-02): currency-safe own-history bands, dated ROE fallback,
// and explicit FFO/AFFO ownership-basis approximation. Older reports retain
// their stored stamp and are not compared as the same financial convention.
// 1.6.0 (D-34): financial common-equity basis, disclosed assessment coverage,
// and durable observed OAuth execution. Previously saved reports remain readable.
// 1.7.0 (audit 2026-10-03): calendar-adjacent monthly beta observations and
// inclusive reverse-DCF endpoint solutions. Saved reports keep their own stamps.
// 1.8.0 (audit follow-up 2026-10-04): require the actual three-year horizon
// for revenue acceleration; reject invalid freshness and future IPO evidence.
// Judge length metadata distinguishes attempted from actual shortening.
// 1.9.0 (recommendation review 2026-10-04): beta requires completed regular
// US month-end sessions; monthly/quarterly/annual FRED changes use calendar lags.
// 1.10.0 (D-39, 2026-10-05): a 3y/5y revenue CAGR enters the DCF growth anchor
// only when its measured span is its window; DCF, targets and notes can move.
// D-40 (same release): AI-report scenario horizon labels are set in code, not
// by the judge; the report shape is unchanged.
// 1.11.0: deterministic scenario inputs/display weights, sensitivity conclusions,
// measurable thesis triggers and explicit comparable-peer coverage.
// 1.12.0: audit remediation adds numeric factual validation, explicit periods,
// financial/valuation bridges and unassessed executive evidence. Legacy fields
// remain readable; new deterministic outputs carry the revised conventions.
// 1.14.0 (D-54): unknown REIT subtypes cannot publish equity-only FFO/AFFO
// multiples. Saved reports retain their original financial convention/version.
// 1.15.0 (D-55): shared cash/debt/lease admission guards and current cash-flow
// reconstruction; historical reports retain their original conventions.
// 1.17.0 (D-56 review): actual statement-provider attribution, qualifier-safe
// references, standalone parity and runner-owned final timing reconciliation.
// 1.18.0 (D-57, D-58): issuer-currency inheritance for single-currency provider
// rows; the DCF year-one revenue anchor, convergent fade, year-one margin and
// terminal tax floor. Saved reports keep their original conventions.
// 1.19.0 (D-65..D-68): consensus-covered forecast windows, quote-date DCF,
// non-operating investments, consistent EV and effective scenario inputs.
// Earlier reports retain their saved conventions and are not like-for-like.
// 1.19.1 (D-72): exhibit-bound disclosures, restatement/currency selection,
// conservative missing-interest EPS, acquisition cash and segment provenance.
// 1.19.2 (D-73): withhold incomplete debt carrying values and dependent metrics.
// 1.19.3 (D-74, D-75): source-scoped principal summaries, immutable legacy
// presentation corrections and source-bound preceding-table scale verification.
// 1.19.4 (D-76): distinguish explicit total/per-share dividend restatements;
// identify/refuse unsupported historical EV bridges and qualify partial EDGAR views.
// 1.20.0: scoped economic equity, NCI earnings reconciliation, historical
// observation provenance and explicitly unknown risk probabilities.
// 1.21.0: dated primary class inventories, explicit quote observation dates,
// matched guidance/operating evidence and source-preserving disclosure surfaces.
// 1.22.0: admission of complete debt and applicable class/geography scope;
// officer agreement/announcement/completion distinctions and per-share labels.
// 1.23.0 (D-81): pipeline-owned multiple bases, price-unit MACD evidence and
// projection availability presentation; legacy reports retain their own stamps.
// 1.23.1 (D-82): exact source-labeled ISO durations in deterministic claim verification.
// 1.24.0 (D-83): versioned grade contract and explicit quarter-sum EPS basis.
// 1.24.1 (D-84): preserve explicit common-cash payout refusals through valuation.
// 1.25.0 (D-86): optional sourced fiscal payment evidence and coverage disclosures.
// 1.25.1 (D-85): common earnings retain allocation, source availability and flow scope.
// 1.26.0 (D-87): source-bound accounting, evidence and metric presentation.
// 1.27.0 (D-88): exact acquisition resolution and separate accrual clarifications.
// 1.28.0 (D-89): CFO source admission and explicit fraction-scale claim support.
// 1.30.2 (D-94): source-bound issuer reconciliation and qualified arithmetic differences.
// IREN source-scope corrections: disjoint cash investment/FCF, historical share admission, EPS and class-scope refusals. Old stored reports/snapshots retain their original contracts.
// Company-model eligibility and independent AFFO comparison boundaries.
// D-97: withheld-debt EV/EBITDA marker and the single-signal evidence floor.
// D-98: P/E earnings caveat, report-level evidence-scope line and contradicted figures in the header count.
// D-99: segment nesting, failed-signal and scaler wording, buyback-timing sign, peer coverage counts, the EV bridge stated once and the verdict stance.
// D-100: the composite withheld below the evidence floor, neutral-band qualifiers, the band thresholds beside the composite and a derived market-cap origin.
// D-102: a DCF outside its domain, the excess-return start-return grid, the NCI deduction basis and the house DCF base rate.
// D-103: the newer-results notice and headline row, issuer-common capitalization withheld for an unresolved class scope, and the economic-weight basis.
// D-104: the retirement and environmental bridge lines, the regulated-utility balance-sheet basis, the sales-to-capital floor basis and the cost-of-equity row without a WACC.
// D-105: the EV/EBITDA lower-bound caveat, the stand-in and equity-statement NCI bases, the named debt and NCI gaps, the cash and charge-off bases, the managed-care route note and the composed-debt leverage basis.
// 1.40.1 (D-106): a dated interval claim citing a filing fact whose period is the whole span is checked against that span.
// 1.40.2 (D-107): the EV bridge note, the issuer-common equity headline and the grid guard note in reader terms.
// 1.40.3 (D-109): a per-share basis named in a claim's metric words reads as the per-share unit.
// 1.41.0 (D-110): "contradicted" reserved for a value conflict, per-claim verification marks, "computed" for a data-only report's figures and JUDGMENT for code-written method and data-gap notes.
// 1.42.0 (D-111): the degraded-inputs note beside the headline fair value, the run-level provider-fallback line and the risk-free stand-in named on the WACC line.
// 1.43.0 (D-112): the newer-filing notice, newer 10-Q facts merged into the statements, multiple labels named for their period and formula, a scenario fan that does not bracket its base withheld, continuing-operations EPS and a TTM across a re-presented reorganisation.
// 1.44.0 (D-113): an `info` EDGAR note (one derived reading withheld) no longer marks EDGAR missing or forensics provisional.
// 1.45.0 (D-124 to D-127): payload records carry the right label, unit, currency and period; reports before 1.45.0 are shown through `withLegacyPayloadRecordSafety`. The data-only FCF conversion label no longer says "graded ratio", and stored provider geography and that label are shown through rules 7 and 8 of the legacy view. A computed fiscal-year row's label and period, and a release fiscal label withheld unless the statement rows confirm it (a labelled row within 3 days, the newest labelled quarter's successor, or with only annual rows the next fiscal year at the days its quarter number fits), change which period claims validate.
// 1.46.0 (D-128): a [validated] claim's periods, windows, comparison base, "latest" and forward-looking wording are established by the record or excerpt clause it cites; the period check never fails a phrase the citation check accepts.
// 1.47.0 (D-129, D-130): an excerpt figure is read with its sign, scale, unit, relation and bound (a minus before the currency, whole-word scale and unit tokens, a table scale applied to amounts only, a hedge or "an increase of" keeping a change a change, an apposition not a change, a bound not a value); a figure binds to its own description, which can only leave a claim unchecked; a comparison base binds only a comparison base, and the end of a base-first move takes the move's metric.
// 1.48.0 (D-133): a noncurrent-only vendor lease line completed from its filing, the vendor path's stakes and the refusal-naming diagnostics change WACC, the DCF, fair value, grades and the debt profile on identical inputs; the key data withholds a provider EV whose debt was refused or recomposed.
// 1.49.0 (D-134, audit 2026-10-27 B13): `revenueGrowthNotes` joins the quarterly-trend row, and EDGAR-derived operating lines (derived EBIT, D&A, R&D, a bank's interest income, derived fourth quarters and year-to-date differences, growth cells and the FFO and one-time-items rules) mean the filer's total on one presentation, or a disclosed withholding; reports before 1.49.0 are shown through `withLegacyEdgarDerivedLines`.
// 1.50.0 (D-135, audit 2026-10-27 B4a): the equity bridge, the market EV and invested capital count each claim once (redeemable equity, after-tax debt-like obligations, the covered operating lease in sales-to-capital, the loss-period divisor named); reports before 1.50.0 are shown through `withLegacyBridgeMethod`.
// D136 / B5a Tasks 1-4, 3b and 17: comparable period lengths, guided season,
// weekday calendars, YoY context, issuer caveats and the frozen legacy cutoff.
// 1.52.0 (D-137, B6): financial-route currency/eligibility and reverse share basis, buyback coverage,
// revenue refusal, ADR Altman scope, peer comparisons and P/E ranks; optional business evidence share
// and Company withholding reason. Stored reports retain their own stamps and view-only safeguards.
// D-138 report-53 batch: comparable receivables and descriptive lease scope; legacy cutoffs stay frozen.
// D-140: source-compatible fiscal aliases, refused-CFO runway, and mandatory-stage outcome.
// FIN-401 / FIN-401-V1 (B4b): equity-method income and its stake are valued once; older reports keep their bytes.
// 1.57.0 (D-156 to D-161, FIGR paid-run audit): deal terms, the newest operating update, outlook and governance
// passages in evidence; filed operating-income, SBC, CFO and debt bases; usage over every recorded request; named
// earnings-date confirmers; verifier readings of producer-declared names, intervals and release tables. Stored reports keep their bytes.
// 1.58.0 (D-163 to D-167, FIGR extra-high audit): read-time labels for an unfinished session bar, executive assessment
// reasons, shared table qualifications stated once, parser diagnostics in the audit companion, and the evidence and
// deterministic bases that round added. Stored reports keep their bytes.
// 1.59.0 (D-168 to D-172, priority fixes): catalyst/risk reasoning may be a list of sourced claims, optional market-structure
// and competitor claims, the run-process table in the appendix, and no provider peer list when none is comparable.
// Stored reports keep their bytes.
// 1.60.0 (D-175 to D-181, Q round): optional dated recent developments in the verdict and management actions in the
// leadership section, and the fresh-filing caution in the key data. Stored reports keep their bytes.
// 1.61.0 (D-190): the meaning of an executive execution grade widens to an exactly quoted dated decision during an evidenced tenure, and cards show dated office context. Stored reports keep their bytes.
// 1.62.0 (D-192): an executive card may carry pipeline-owned filing evidence of office tenure. Stored reports keep their bytes.
// 1.63.0 (D-193): banks and insurers can carry scenario targets from the excess-return route. Stored reports keep their bytes.
// 1.64.0 (D-197): verification log records figure-check outcomes for reader prose; the model no longer writes executive tenure
// 1.65.0 (D-208): optional owned valuation dates, reference/audit diagnostics and grade qualification; stored bytes remain immutable.
// 1.66.0: preserve source-owned lease scope and specific debt refusals through enrichment.
// 1.67.0: recover source-proved share classes, statements, lease/cash and quarter SBC scopes.
// 1.68.0 (D-211): optional public evidence and observed/retained web research disclosures.
// 1.69.0 (D-212): scope-safe quarterly inputs, optional-research limits and complete source qualifications.
// 1.71.0 (D-214): preserve split-safe quarterly evidence across computation and model context, and expose referenced annual tables.
// 1.72.0 (D-215): corroborated revenue scope, capitalized-interest safety, annual guidance and accurate schedule/reconciliation disclosures.
// 1.73.0: source-bound primary cash and execution evidence, with existing grade thresholds.
// D-217 (P21): optional `meta.evidenceContract` on newly built reports (src/report/evidenceContract.ts).
// Like `presumedCostUsd`, an optional meta field with no figure change, so the spec stays 1.73.0. Stored
// reports keep their bytes; one without the stamp, or with an unrecognised one, shows a "figures as saved" note.
export const REPORT_SPEC_VERSION = "1.73.0" as const;

/**
 * Current payload format version.
 *
 * 1.4.0 (2026-09-30, currency integrity): each money figure is rendered with
 * its currency or "(currency unknown)", and the provenance registry holds a
 * money figure only when its own evidence establishes the currency (no
 * payload-wide listing-currency default; estimates only in their own).
 *
 * 1.5.0 (2026-09-30, stock-split correctness): EPS, share counts, market
 * values and per-share figures appear only where their split basis is
 * established, and read "n/a" otherwise; an analyst or judge pass stored under
 * 1.4.0 carries a 1.4.0 fingerprint and is never resumed under 1.5.0.
 */
// 1.6.0 (2026-10-02): currency-safe own-history bands, dated ROE and REIT
// approximation disclosures change the financial evidence sent to analysts.
// A pass stored under 1.5.0 must not resume with these changed conventions.
// 1.7.0 (D-34): bank evidence routing, common-equity/return pairing, and
// financial-route metric applicability. Older analyst work must be regenerated.
// Calendar-bounded beta and inclusive reverse-DCF roots change financial evidence.
// Partial analyst work from the prior conventions must not be reused.
// 1.9.0 (audit follow-up 2026-10-04): acceleration horizons and date validity
// change financial evidence; do not resume partial passes under prior rules.
// 1.10.0 (recommendation review 2026-10-04): completed-session beta and
// calendar-aligned FRED lags change evidence; prior partial passes cannot resume.
// 1.11.0 (D-39, 2026-10-05): growth-anchor CAGR span rule changes the DCF
// evidence sent to analysts; prior partial passes cannot resume.
// 1.12.0 (D-42..D-45, 2026-10-13): a bank's EDGAR tangible equity deducts its
// carrying-value preferred and all non-goodwill intangibles; every printed tag
// is citable (gap / unestablished kinds, manifest tags, the weights row); the
// next earnings date is shown; completeness and indicator units have their
// own rows. Analyst work written against the 1.11.0 evidence cannot resume.
// 1.13.0 (D-49, D-48, 2026-10-13): the aspect scores the analysts anchor to
// come from band table SCORE_BANDS_2026_10, which scores annualized weighted-average
// diluted common-share change and the SBC charge once each and grades technicals on 12-1 month
// relative strength; the technicals rows add that window and the displayed
// 6-month window vs SPY. Prior partial passes cannot resume.
// 1.14.0 (D-46, 2026-10-13): a bank's balance-sheet score is graded on capital,
// credit and funding, and a bank payload gains the section of route metrics it
// is computed from. Prior partial passes cannot resume. D-47 (same 1.14.0)
// adds the display-only HTM, reserve and loan-growth rows and the warning signs.
// 1.15.0 (review of D-46..D-50, 2026-10-13): the technicals score reads the
// distance below the 52-week high (driver pctFromHigh52w, not position52w); a
// bank's loan ratios divide by gross loans first; the bank capital note and
// tangible-leverage caveat no longer call the house cut point a regulatory
// line. Prior partial passes cannot resume.
// 1.17.0 combines both 1.16.0 branches: section-aware source spans and omissions,
// metric-labelled numeric prose evidence, current financial bridges, explicit
// accrual operands, flat-share/alternative EPS evidence, deterministic scenario
// interpretation, and comparable-peer evidence. Older passes cannot resume.
// 1.19.0 (D-54): equity-only FFO/AFFO comparisons are withheld when the REIT
// subtype is unknown; prior context cannot resume as the same convention.
// 1.20.0 (D-55): reconciled financial bridges, signed equity-method income,
// material filing context and distinct filing dates; prior passes cannot resume.
// 1.22.0 (D-56 review): actual envelope/row/field statement origins; passes
// built under normalized FMP-only origin labels cannot resume as equivalent.
// 1.23.0 (D-57, D-58): estimates, targets, peer caps and pay inherit the
// issuer currency when reporting and listing agree; the DCF evidence sent to
// analysts changes with the year-one anchor. Prior passes cannot resume.
// 1.23.0 (NVDA report #34 audit, work package 3): 8-K earnings-release and
// CFO-commentary evidence (guidance, issuer FCF, capital return), dated
// material-event 8-K excerpts, XBRL segment revenue by quarter and the
// eight-quarter trend. Passes built without that evidence cannot resume.
// The combined 1.23.0 carries both sets of evidence (NVDA audit integration).
// 1.24.0 (D-65..D-68): consensus/calendarization and equity-bridge conventions,
// typed filing facts and governance disclosures, bounded verifier matching,
// and corrected forensic notes. Prior analyst/judge artifacts cannot resume.
// 1.24.1 (D-72): revised financial evidence and source-bound filing facts.
// 1.24.2 (D-73): incomplete debt is withheld, including downstream valuation
// context. Analysts from earlier conventions cannot resume as equivalent.
// 1.25.0 (D-78): ownership-specific earnings rows, class/EV scope and current
// source form/exhibit context change analyst evidence; prior passes cannot resume.
// Primary disclosure composition and quote measurement dates change the
// admitted model context; earlier evidence fingerprints cannot resume.
// 1.28.0 (D-81): complete passage-level applicability, price-unit MACD and
// admitted per-multiple bases change the analyst context. Earlier reusable
// analyst/judge passes cannot resume as equivalent; completed reports stay readable.
// D-83: quarter-sum EPS basis and changed grade-override prompt contract.
// 1.29.1 (D-84): common-cash refusals cannot become zero-payout observations.
// 1.30.0 (D-86): retain source-bound fiscal payment buckets and unknown funding scope.
// 1.30.1 (D-85): distinguish earnings allocation from cash and retain actual source scope.
// 1.31.0 (D-87): source-bound accounting and retained critical filing context.
// 1.32.0 (D-88): preserve sourced duration intervals and final gap evidence.
// 1.33.0 (D-89): retain the declared unit-fraction scale in numeric provenance.
// 1.35.0: first-report audit cash admission, official-index discovery, EPS basis and disclosure context.
// 1.35.1: deterministic source attribution and present-but-refused accrual explanations.
// IREN source-scope corrections: disjoint cash investment/FCF, historical share admission, EPS and class-scope refusals. Old stored reports/snapshots retain their original contracts.
// Company-model eligibility and independently comparable AFFO alter admitted context.
// D-97: independently audited debt, lease-scope and NCI admission alter admitted context.
// D-98: investment tax, rate-limit degradation, guided YoY pace, margin fade and gain-inflated P/E alter admitted context.
// D-99: backlog and government-case evidence, the consensus-target reconciliation note and the deferred AMZN audit fixes alter admitted context.
// D-100: the composite's evidence floor, the neutral-band qualifier and the band thresholds alter admitted context.
// D-102: the trailing common return, the start-return x cost-of-equity grid, the trailing start and the NCI earnings key alter admitted context.
// D-103: regained WACC, debt, EBITDA and class-tagged market cap, the newer-results notice and 10-Q passages updating a 10-K operating figure alter admitted context.
// D-104: the retirement and environmental bridge lines, the regulated-utility balance sheet and the WACC and cost of debt withheld on equity-valued routes alter admitted context.
// D-105: regained diluted shares, per-share values, NCI, WACC, EBIT, cash, net charge-offs and managed-care routes, the EV/EBITDA lower-bound caveat and the quote section's class-scope caveat alter admitted context.
// D-107: the EV bridge note's amounts printed with grouped digits alter admitted context.
// 1.47.0 (D-111): the risk-free series actually used, the fair value's degraded-inputs note and the provider-fallback line alter admitted context.
// 1.48.0 (D-112): newer 10-Q facts, the newer-filing notice, each multiple's period and fiscal period, the P/E formula that ran, the withheld non-bracketing scenario fan, continuing-operations EPS and a TTM across a re-presented reorganisation alter admitted context.
// 1.49.0 (D-124 to D-127, audit 2026-10-27 B3): stock-peer caps only in an established currency, insider statistics as counts and share volumes over a named window, the share-count span, segment growth by date, FRED transform and basis wording, 8-K referents and the peer-screen envelope alter admitted context. Statement blocks collapse restated periods as Stage B does; a 10-Q older than the 10-K is marked; provider geography the issuer's XBRL contradicts is withheld and provider keys are no longer called as-reported; the fiscal-year FCF conversion is no longer called the graded ratio. Computed rows taken from one fiscal year's statement rows carry the issuer's fiscal label and period end of that year. A release fiscal label is printed in an excerpt title only when the statement rows confirm it (AI-512): a labelled income row within 3 days agrees (an annual row ending there agrees only with a Q4 label), or it is the successor of the newest labelled quarter (release end 80-100 days later), or, with only labelled annual rows, it is the next fiscal year after the newest one and its quarter number fits the days since that year's end (91n-11 to 91n+9 days, at most 366); otherwise it is withheld, and only a bundle with no labelled income row keeps it unchecked.
// 1.50.0 (D-133, audit 2026-10-29 AMZN #51): the current-capital composition note (a lease-inclusive total withheld with its refusal, or composed from a filing), the withheld provider EV note, the vendor path's filled stakes and the refusal wording of net debt, EV, the DCF gap, fair value and ROIC alter admitted context.
// 1.51.0 (D-134, audit 2026-10-27 B13): derived EBIT, D&A, R&D and bank interest income come from the filer's total on one presentation or are withheld with the reason named; derived and first-reported quarters, the quarterly-trend growth cells and their basis notes (`revenueGrowthNotes`), the vendor enrichment's one-presentation pairing and the forensic one-time-items gap alter admitted context.
// 1.52.0 (D-135, audit 2026-10-27 B4a): the equity bridge, the market EV basis and the invested-capital basis count redeemable equity, debt-like obligations and the covered operating lease once; the DCF per share, its scenarios and grids, and the EV-basis, lease and divisor wording alter admitted context.
// D136 / B5a Tasks 1-4 and 3b: quarter/year conventions, fiscal calendars,
// guided-quarter season, like-for-like context and issuer caveats. No old resume.
// 1.54.0 (D-137, B6): financial-route currency and evidence, buyback coverage, revenue refusals,
// common-equity/gain/scope peer comparisons and same-construction P/E ranking alter admitted context.
// D-138 report-53 batch: source-scope qualifications and neutral debt captions change model context.
// F-01/F-02/F-03: admitted facts, annual operands and numeric evidence semantics
// require fresh model/checkpoint identity; historical report bytes are unchanged.
// FIG report review: primary EPS/share refusals, dated guidance, estimate-period
// and Form 4 venue scope. Accepted model work from earlier payloads is incompatible.
// FIN-401 / FIN-401-V1 (B4b): corrected DCF operands and placement notes invalidate prior payload checkpoints.
// 1.61.0 (D-156, D-158, D-159, FIGR paid-run audit): transaction terms, the newest operating update, outlook statements,
// governance passages, insider coverage, the aggregate P/E construction and filed figure bases alter admitted context.
// 1.62.0 (D-163 to D-167, FIGR extra-high audit): the settled-session price history and the evidence and figure bases
// that round added alter admitted context.
// 1.63.0 (D-168 to D-172, priority fixes): a 20-F's unlettered Risk Factors sub-heading inside Item 3 reaches the payload,
// and the TTM cash-flow window gate changes current-capital operands.
// 1.64.0 (D-173, D-174): the newest fiscal year's closing balance fills a lagging annual balance feed, and a debt
// collapse no cash flow explains is withheld without interest, changing the debt, returns, forensic and valuation operands.
// 1.65.0 (D-175 to D-181, Q round): the fresh-filing caution, news sampled across 90 days, insider trades by person,
// a dated FX rate for foreign-currency valuation and the completed debt, WACC and NCI operands change admitted context.
// 1.66.0 (D-184): risk-factor, business and MD&A sections recovered from cross-reference tables, subordinate
// headings, linked page ranges and misbound table-of-contents links reach the analysts for the affected filers.
// 1.67.0 (D-186, D-188): new deterministic values, withholding reasons and calibrated revenue-estimate currency
// reach the analysts.
// 1.68.0 (D-189): financial companies open from the latest admitted quarterly book, so analysts receive newer book, value date and P/TBV.
// 1.69.0 (D-191): explicit annual-report page references recover shared 10-K ranges and labelled 20-F mapped-page excerpts, with partial coverage named in the excerpt title.
// 1.70.0 (D-192): bounded officer biographies from the annual filing supply filing-sourced officer tenure in the leadership context.
// 1.71.0 (D-194): financial-statement notes now reach the analysts from filings that index them, so admitted filing context changes.
// 1.72.0 (D-193): excess-return scenario targets reach the analysts as computed figures.
// 1.73.0 (D-195): valuation notes shown to readers use plain words; numbers unchanged
// 1.74.0 (D-196): fair values restored from reconciled debt and share evidence; refusals name their cause
// 1.75.0 (D-198): one-time operating sale gains, preferred capital and trailing bank returns change the computed figures
// 1.76.0 (D-200): filed earnings, share counts, native ADS earnings and same-filing cash replace conflicting vendor values
// 1.77.0 (D-199): filing notes have proved boundaries, combined items are labelled as such, and 20-F notes are read where provable
// 1.78.0 (D-204): regulated utilities carry no FCFF value, foreign financials convert on proved units, and beta may use a qualified regression
// 1.79.0 (D-202): debt and lease scope is reconciled from filed components beyond the test panel
// 1.80.0 (D-206): multi-class share evidence requires affirmative equal rights or a shared rate; a conversion ratio supports only a class under 0.5% of units; the caveat travels with the value
// 1.81.0 (D-207): vendor statement rows that lost their core breakdown and are not corroborated by a same-date filing are excluded from calculations, reports and peers
// 1.82.0 (D-203): scoped operating inputs, interior margin gaps and annual-base dates.
// 1.83.0 (D-203 round 2): complete primary operating proofs and forecast-cause transport.
// 1.84.0 (D-205/D-208): source-owned filing statements, current-use dates, separate references and deterministic grade qualification.
// 1.86.0 (D-210): source-proved class, statement, debt, cash and quarter SBC reconciliation.
// 1.87.0 (D-211): cited issuer documents and annual proxy excerpts.
// 1.88.0 (D-212): compatible quarterly ownership/cash inputs and qualified source presentation.
// 1.90.0 (D-214): quarterly release corrections and their source lineage agree with Stage B; unsafe split/inline numeric bases are refused.
// 1.91.0 (D-215): restored revenue and annual guidance, with separately scoped borrowing-cost evidence.
// 1.92.0: admitted primary cash, exact execution shares/cost and their definition/source reach the analysts.
export const PAYLOAD_VERSION = "1.92.0" as const;

/** pipelineVersion stamped into meta (bump when the orchestration changes). 1.6.5 (D-111): the plan-connection runtime claim before the data fetch (audit 2026-10-22 F-12), and the per-section schema check on sections carried from a cut-off response (D-3). 1.6.6 (D-113): a schema-valid analyst case with an empty thesis, drivers or risks list, or a price target without a positive value and a horizon, is repaired like a schema failure. 1.6.7 (D-114): a blank `sourceId` in an analyst or judge output is read as absent, and a side whose rejected output waits for its repair stays running under a plain note. 1.6.8 (D-115): every run-panel note and report missing-data reason gives a rejected output's issues in words, also when the stored detail was cut short; a failed repair closes its row the same way; a dropped connection is not queued as a repair. 1.6.9 (D-116): a section kept from an earlier attempt keeps the evidence of the request that wrote it, so a resumed plan pass names its model, effort and speed when every writer reported them; the run details say what a resumed pass's tokens cover, and a failed attempt whose sections were kept is not called thrown away. 1.6.10 (D-117..D-123): a failed paid request is recorded at what it may have billed and each pass, step and audit export states the ledger's cost; the mirrored judge pass is skipped and disclosed on a retry that keeps sections, and only section grades are compared. 1.6.11 (D-124, audit 2026-10-27 B3 AI-507): the analysts' and judge's reconciliation rule prefers the 10-Q or 10-K notes by reporting period, not the 10-Q by default. 1.6.12 (D-128): the verify pass computes the newest registered period of every reported series once and passes it to the claim check. 1.6.13 (D-132, audit batch 8a): an accepted Retry of a data-only fallback is dispatched and runs the judge and verify on the settled analyst passes instead of closing as done; if it fails again it links a new data-only report and stays resumable (DB-001). 1.6.19 (R1/R4, FIGR paid audit 2026-11-02): blank claim and number dates are read as no date, a FACT keeps only its sourced statement (an embedded "In our judgment" sentence becomes its own JUDGMENT), and the analysts and judge get the evidence-reading, valuation-stance, unassessed-grade, business-model, insider-motive and voting-control rules. 1.6.20 (D-163 to D-167, FIGR extra-high audit 2026-11-02): the analysts and judge get the accounting-scope, multiple-direction, return-basis, matched-window, share-of-total, met-versus-beat, post-transaction liquidity, attribution and specialist-term rules; a catalyst or risk reasoning is one claim; a rejected structured answer records how it ended; the verifier reads producer-bound metric paraphrases, complete table headers and footnotes (R7, D-167); filing excerpts keep qualifying context and the MD&A primary tables (R8, D-167). 1.6.21 (D-168 to D-172, priority fixes 2026-11-03): analysts research in plain text with web search, then write the case without tools; synthesis caches its prefix for one hour; catalyst and risk reasoning is a list of sourced claims; the judge writes market-structure and competitor claims and takes a price stance from the available multiples. 1.6.22 (D-175 to D-181, Q round 2026-11-02): the judge writes dated recent developments and management actions from the news, insider and leadership evidence, and states once that a fresh filing's figures are provisional when the manifest carries the fresh-filing caution. 1.6.23 (D-182, META paid test 2026-11-03): a valid month-only or year-only claim date is read as no date instead of costing a repair round; the judge lists each material dated development and management action without padding, and describes the industry from the filing when no market size is sourced; the verifier no longer reads "Motive is not established" as a person, accepts an issuer document on EDGAR's archive cited by URL and a payload gap row for a credibility statement naming nobody, and reads "trailing P/E" as the P/E (TTM) record (TSM paid test). 1.6.24 (D-183, 2026-11-03): a paid run whose largest remaining request reservation a job or rolling cap can never admit stops before its first paid request, at $0, with the pass, model, reservation, cap and smallest workable cap disclosed; the same check runs before a resumed run's first new paid request. 1.6.25 (D-185, 2026-11-03): the analyst request schema no longer requires `sourceId` beside `source` (its placeholder drew a one-claim skeleton case from Opus 5.5 on ASML); an analyst case rejected as incomplete is asked on its repair turn to write the missing sections from the payload and research, keeping its correct claims, instead of repairing in place with the same evidence (ASML Opus 5.5 paid run); expired leases count in the pre-launch budget check as admission's presumed spend dated at acquisition. 1.6.26 (D-187, 2026-11-03): headline claims bind to their producing records, and a statement buyback or capex amount may be stated as a positive magnitude. 1.6.27 (D-189): plain aspect-score, P/TBV, ROTE, P/E, excess-return, estimate and other headline wording binds to its producing record. 1.6.28 (D-190): executive cards admit exactly quoted dated decisions within an evidenced tenure and the judge is told both grade routes 1.6.29 (D-191): annual filing evidence now reaches the analysts through explicit page references, with honest coverage labels 1.6.30 (D-192): executive cards carry filing-sourced office tenure, which can open the dated decision route 1.6.31 (D-194): annual notes recovered from proved filing indexes reach the analysts 1.6.32 (D-193): bull, base and bear targets for banks and insurers 1.6.33 (D-198): computed valuation inputs changed for material sale gains and preferred capital 1.6.34 (D-197): figures in reader prose are checked deterministically; executive tenure is derived, not model-written 1.6.35 (D-204): unknown and malformed tickers end unsupported before any data, model or paid admission */
// 1.6.36 (D-203): repaired operating admission and dated qualifications reach reports.
// 1.6.37 (D-203 round 2): primary scope, standalone operands and absent fiscal slots.
// 1.6.38 (D-208): current-use admission, provisional grades and deterministic reference/qualification transport.
// 1.6.39: source-owned lease evidence and stable refusal qualifications survive enrichment.
// 1.6.40 (D-211): public evidence recovery and ChatGPT plan research.
// 1.6.44: primary repurchase evidence survives acquisition, calculation, analyst context and export.
export const PIPELINE_VERSION = "stage-c-1.6.44" as const;

/** The evidence-rules contract this build writes on new reports. */
export const EVIDENCE_CONTRACT_VERSION = "EVIDENCE_CONTRACT_1" as const;

/* ------------------------------------------------------------------------ *
 * Stage B calculation identity and method labels
 * ------------------------------------------------------------------------ */

// NVDA_AUDIT_2 (D-65..D-68): all eligible consensus windows, non-operating
// investment add-backs, quote-date discounting, consistent EV multiples and
// effective scenario shocks. Earlier snapshots require their original engine.
// D-72: missing interest, acquisition payments and segment-history safeguards.
// D-73: preserve debt refusals instead of using incomplete or older balances.
// D-83 adds explicit EPS-convention metadata; financial arithmetic is retained.
// D-84: common-payout history excludes explicit source refusals, including total zero.
// IREN source-scope corrections: disjoint cash investment/FCF, historical share admission, EPS and class-scope refusals. Old stored reports/snapshots retain their original contracts.
// Separate AFFO comparability and unresolved company/security-model admission.
// D-97: instrument-class financing debt, debt plausibility, operating-lease portion scope and zero/immaterial NCI.
// D-98: SEC-statement investment stakes and their tax, YoY guided pace, improving-margin fade, one-off margin seed and gain-inflated P/E.
// D-99: SBC beyond negative FCF, loss-year ROIC at the marginal-rate floor, recent buyback timing, bounded reverse DCF, scenario margin direction, seasonal consensus calendarization and lease-consistent leverage.
// D-100: noncurrent notes and inclusive long-term debt read once, a refused maturity bucket that no longer withholds an inclusive total or stands in beside a balance sheet with no current portion, debt plausibility on the average and collapse tests, bounded revenue guides and the depositary-share market cap withheld.
// D-102: the DCF domain tests, the trailing excess-return start, the start-return grid and NCI on the earnings key.
// D-103: annual or zero-shield WACC tax rates, principal-versus-carrying debt band, vendor-filed agreement at display precision, D&A composed from depreciation and amortization, and class-tagged issuer-economic market cap.
// D-104: filed retirement and environmental obligations in the DCF bridge, the regulated-utility overlay, the issuer's own sales-to-capital history and no WACC on equity-valued routes.
// D-105: a basic count for an untagged diluted count at equal EPS, the multi-class diluted count, equity-statement NCI, the average debt behind a refused balance, EBIT under a filed non-operating aggregate, restricted-cash restrictions and a narrower combined cash total, cash-flow recoveries, managed care on the general route and Piotroski leverage on a composed long-term debt.
// D-106: current debt securities tagged DebtSecuritiesCurrent read as short-term investments in the keyless statements.
// D-107: the EV bridge note's amounts printed with grouped digits, and the grid guard note says its cells are withheld.
// D-108: net income attributable to the parent derived as ProfitLoss less NCI income when NetIncomeLoss is not filed, and read as parent income.
// D-111: the risk-free rate from the bundle's riskFreeFallback (last cached DGS10, then the Treasury par curve) when DGS10 and FMP treasury have none, and a degraded-inputs entry in fairValue.reasons naming each substituted input.
// D-112: newer 10-Q instance facts merged into companyfacts, an undated release ordered by filing, a newer release's dollars bound to a single-currency history, each multiple's period, the non-bracketing scenario fan withheld, continuing-operations EPS and the economic issuer of a re-presented predecessor's rows.
// D-124 (audit 2026-10-27 B3): the discovery size screen compares an established or same-market listing only, the peer collection records each read profile's listing currency, and the capex/D&A average counts its years. Stage A records a `validation.providerGeography` gap when provider geography is withheld.
// D-133 (audit 2026-10-29, AMZN #51): a noncurrent-only vendor lease line completed from its filing, a vendor short-term debt of 0 beside filed current debt withheld, the vendor path's undisclosed stakes filled with the D-98 chain, and refusals named in net debt, EV, the DCF gap, fair value and ROIC.
// D-134 (audit 2026-10-27 B13): the EDGAR rows Stage B reads change meaning. A synonym below its own filed component is no longer the total (D&A, R&D, a bank's interest income); the derived EBIT removes the filer's other non-operating line and reads pretax through the filed chain; the interest and aggregate placement is keyed on the period; a quarter derived from a year or year-to-date figure is on one filed presentation or withheld; the vendor enrichment pairs on one presentation with a 1%-capped derived allowance (FIN-511-V2); the one-time-items rule discloses when it was not evaluated.
// D-135 (audit 2026-10-27 B4a): the equity bridge, the market EV and invested capital count each claim once. Redeemable equity, pension and OPEB deficits, loss contingencies and contingent consideration enter the bridge, debt-like lines are deducted after tax, the covered operating lease enters sales-to-capital, and the divisor in a loss period is named; a stored Stage B result is recomputed.
// D136 / B5a Tasks 1, 2, 3 and 3b: 13/52-week flow bases, filed weekday
// calendars, guided-quarter season and twelve-month floor, ex-item disclosure.
// D-137 (B6): financial-route currency/eligibility, admitted reverse-return share basis, buyback coverage,
// revenue refusal, ADR Altman scope, common-equity/gain/scope peer comparisons and same-construction P/E ranking.
// D-138 report-53 batch: receivables continuity and descriptive lease evidence on the retained debt basis.
// F-01/F-02: issuer admission and fiscal identity change deterministic operands.
// FIG live test: current cash-flow bridge discloses unestablished vendor capex
// scope instead of asserting the mixed series is cash PP&E only. Values unchanged.
// FIG report audit: source admission now withholds independently contradicted
// historical EPS/share fields and admits dated compact guidance. Older input
// snapshots require their original engine; do not relabel their materialized rows.
// FIN-401 / FIN-401-V1 (B4b): an old Stage B result used the earlier equity-method reading and must be recomputed.
// D-173: a lagging annual balance feed is filled with the fiscal-year-end quarterly balance of the same date.
// D-174: a debt collapse no disclosed debt cash flow explains is withheld when interest cannot judge it.
// D-178 / D-179: foreign-currency statements are valued at one dated FX rate, and same-filing debt completion, complete-balance
// WACC, the annual-EBIT synthetic rating and the NCI synonyms change which valuations compute.
// D-186 / D-188: evidence-backed coverage, calibrated foreign revenue consensus, proved operating income,
// corroborated filer share units and the immaterial stale NCI key change which values compute and what they are.
// D-210: source-scope corrections change admitted valuation and return inputs.
// D-211: preserve original vendor net debt when filed cash is reconciled.
// D-212: quarterly cash/earnings scope and actual WACC input dates.
// D-214: direct quarterly release EPS/shares require canonical, covered split-basis agreement.
// D-215: operating-revenue concept corroboration and capitalized-interest evidence change calculation inputs.
// Primary capital evidence is acquired before truncation and admitted on one shared source basis.
export const STAGE_B_IMPLEMENTATION_VERSION = "STAGE_B_2026_11_PRIMARY_CAPITAL_66" as const;

/** Versioned method prior — bump when the resolution changes. */
// D-102 (audit 2026-10-22): the outside-domain status, the NCI earnings key and the excess-return trailing start and payout fade.
// D-135 (audit 2026-10-27 B4a): the bridge every target re-runs counts redeemable equity and the debt-like obligations once, and the DCF reads the covered operating lease in sales-to-capital.
// FIN-401 / FIN-401-V1: the DCF bridge and its operating margin/capital inputs now share the stake reading.
// D-178 / D-179: the per-share value converts at one dated FX rate per ADS ratio; completed debt and WACC reach more issuers.
export const FAIR_VALUE_METHOD_VERSION = "FAIR_VALUE_2026_11_CURRENT_VALUATION_USE_58" as const;

/** Versioned method prior — bump when the construction changes. */
// D-99 (AMZN audit finding 11): the correlated margin shift applies only when it moves with its scenario.
// D-102 (audit 2026-10-22 B-29, E-5): a run outside the DCF's domain withholds the fan; the bridge applies the NCI earnings key.
// D-135 (audit 2026-10-27 B4a): the bridge each target re-runs changed (redeemable equity and debt-like obligations counted once, after tax), so every target is recomputed.
// FIN-401 / FIN-401-V1: every target re-runs the corrected stake/operating-income bridge.
// D-178 / D-179: every target re-runs the FX-converted, completed-debt bridge.
export const SCENARIO_TARGET_METHOD_VERSION = "SCENARIO_TARGETS_2026_11_CURRENT_VALUATION_USE_58" as const;

// D-99 (AMZN audit finding 11): the correlated margin shift applies only when it moves with its scenario.
export const SCENARIO_PATHS_METHOD_VERSION = "SHARED_SCENARIO_PATHS_2026_10_D99" as const;

/** Versioned band-table id, stamped into the report for auditability. */
// D-136: route evidence bookkeeping changes; numerical band thresholds do not.
export const SCORE_BANDS_VERSION = "SCORE_BANDS_2026_10_FINANCIAL_ROUTE_EVIDENCE" as const;

/** Versioned scenario-weight prior, stamped into the report. */
export const PROJECTION_WEIGHTS_VERSION = "UNBACKTESTED_SCENARIO_PRIOR_2026_07" as const;

/**
 * V3 (D-60): marketable equity securities that the filing places inside cash
 * and short-term investments are not cash. When their sourced fair value is
 * supplied, net debt nets only cash, cash equivalents and the remaining
 * short-term investments, and the equity securities are reported separately
 * as a non-operating asset. Without that input the result equals V2.
 */
export const NET_DEBT_RESOLVER_VERSION = "NET_DEBT_V3" as const;

/* ------------------------------------------------------------------------ *
 * Stage C evidence and grade labels
 * ------------------------------------------------------------------------ */

/** Its full description stays above the re-export in src/pipeline/stageC/evidenceSelection.ts. */
export const EVIDENCE_SELECTION_VERSION = "section-evidence-8";

/**
 * The notes and risk readings. section-evidence-4 (D-99, AMZN audit findings
 * 6 and 16): the performance-obligations family and the pending-case clauses
 * for government cases, their relief, fines and scheduled trials.
 */
export const NOTES_RISK_SELECTION_VERSION = "section-evidence-7";

/**
 * The 8-K event reading. section-evidence-5 (AI-101): a passage that refers to
 * a person by honorific and surname, or by a leading pronoun, is kept only
 * together with the sentence that introduces that person, and an award of
 * shares ranks like a dollar amount. Not -3: that numeral was the notes/risk
 * selector until D-99, and a version string must not change its method.
 * section-evidence-6 (FIGR paid audit R1): the operative passages are kept in
 * tiers, the dated lead first, then the amounts, then the passages that only
 * define a party; a dated lead may follow an item sub-heading ("Merger
 * Agreement On June 10, 2026"), a defined term may be printed with spaces inside
 * its quotes, and an amount may be written out in digits ("$532,426,000").
 */
export const EVENT_SELECTION_VERSION = "section-evidence-7";

export const GRADE_OVERRIDE_VERSION = "GRADE_OVERRIDE_1" as const;

// 1.3.0 (R1, FIGR paid audit): the newest operating update filed after the
// latest results release takes a fifth slot and keeps its release text. The
// same unreleased version ends an outlook block at a webcast notice (D-162).
// 1.4.0 (D-215): explicit annual guidance bullets retain their fiscal-year scope.
export const CURRENT_REPORTS_VERSION = "current-reports-1.4.0" as const;

/* ------------------------------------------------------------------------ *
 * Format versions (a stored record or file is parsed only under its own format)
 * ------------------------------------------------------------------------ */

export const RUN_INPUT_SNAPSHOT_FORMAT = "RUN_INPUT_SNAPSHOT_1" as const;

export const PASS_ARTIFACT_ENVELOPE_VERSION = 1 as const;

export const EVALUATION_POLICY_VERSION = "REPORT_EVALUATION_2026_10_V1" as const;

export const FORECAST_ADAPTER_VERSION = "SELECTED_FORECAST_V1" as const;

/* ------------------------------------------------------------------------ *
 * Frozen display cutoffs for saved reports (compared with a saved report's meta.specVersion; never move)
 * ------------------------------------------------------------------------ */

/** Its full description stays above the re-export in src/report/legacyPayloadRecordSafety.ts. */
export const PAYLOAD_RECORD_CORRECTION_SPEC = "1.45.0";

/** Its full description stays above the re-export in src/report/legacyEdgarDerivedLines.ts. */
export const EDGAR_DERIVED_LINES_SINCE_SPEC_VERSION = "1.49.0";

/** Its full description stays above the re-export in src/report/legacyBridgeMethod.ts. */
export const BRIDGE_METHOD_SINCE_SPEC_VERSION = "1.50.0";

/** Frozen at this convention's introduction, independent of later report stamps. */
export const ANNUALIZATION_CONVENTION_SPEC = "1.51.0";

// D-137 / FIN-506: frozen B6 cutoff, independent of B5a's parallel annualization changes.
export const IMPLIED_RETURN_SHARE_BASIS_SPEC = "1.52.0";

/** D-138: frozen independently from the bridge, annualization and share-basis cutoffs. */
export const LEGACY_SCOPE_SINCE_SPEC = "1.53.0";

/** Frozen at the FIN-401 / FIN-401-V1 repair, independently of later report stamps (D-67). */
export const BRIDGE_READINGS_SINCE_SPEC_VERSION = "1.56.0";

export const DCF_INPUTS_CONVENTION_SPEC = "1.56.0";

/** RPT-215: frozen display boundary, never tied to the current writer stamp. */
export const LEGACY_PLACEHOLDER_DISPLAY_CUTOFF = "1.56.0";

/** Frozen display boundary; explicit retained measured-window labels need no recalculation. */
export const N4B_CAGR_DISPLAY_CUTOFF = "1.56.0";

/** Frozen AI-116 display cutoff; never follow a later report stamp. */
export const INSIDER_ROLES_READ_FROM = "1.56.0";

/**
 * The exact spec stamps of the builds that wrote the field: the stash's base
 * is stamped 1.23.1 and its local edits went to 1.23.3; main never used 1.23.2
 * or 1.23.3. Any other stamp, including empty, malformed or pre-release, is refused.
 */
export const CORPORATE_ACTION_BRIDGE_WRITING_STAMPS: ReadonlySet<string> = new Set(["1.23.1", "1.23.2", "1.23.3"]);

/* ------------------------------------------------------------------------ *
 * Reading a saved report's spec stamp against a frozen cutoff (P21, D-249)
 * ------------------------------------------------------------------------ */

/**
 * A spec stamp's three numbers, or null when it cannot be read. A stamp is
 * text of exactly three dotted whole numbers once surrounding whitespace is
 * trimmed. Anything else is unreadable: a missing or non-text stamp, an empty
 * one, two parts ("1.56"), a pre-release or build suffix ("1.56.0-rc1"), a
 * prefix ("v1.56.0"). Numbers compare as numbers, so "1.9.0" precedes "1.10.0".
 */
export function parseSpecStamp(stamp: unknown): readonly [number, number, number] | null {
  if (typeof stamp !== "string") return null;
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(stamp.trim());
  return m === null ? null : [Number(m[1]), Number(m[2]), Number(m[3])];
}

/**
 * Whether a saved report was written before the rule a frozen cutoff names:
 * the ONE comparison of a saved `meta.specVersion` with a display cutoff.
 *
 * - A stamp that cannot be read (`parseSpecStamp`) is before every cutoff: the
 *   report cannot be shown to follow the newer rule, so it gets the legacy
 *   read-time view (P10: unproven is not treated as current).
 * - A stamp at or above the cutoff is not before it. That includes a stamp
 *   newer than this build's REPORT_SPEC_VERSION: a report from a newer build
 *   is never given an older rule's correction. (Whether this build recognises
 *   that report's evidence rules is a separate question, answered by the
 *   evidence-contract stamp's own reader, `report/evidenceContract.ts`.)
 * - A cutoff that cannot be read never fires. Cutoffs are the constants above,
 *   pinned by tests/report.versionStamps.test.ts.
 *
 * Stored bytes are never changed by this; it only chooses a read-time view.
 */
export function specVersionBefore(saved: unknown, cutoff: string): boolean {
  const a = parseSpecStamp(saved);
  const b = parseSpecStamp(cutoff);
  if (a === null) return true;
  if (b === null) return false;
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i]! < b[i]!;
  return false;
}
