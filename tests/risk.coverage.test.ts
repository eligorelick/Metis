import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const VITEST_CLI = path.join(ROOT, "node_modules", "vitest", "vitest.mjs");

const EXPECTED_RISK_SOURCES = [
  "src/ai/analysisRoute.ts",
  "src/ai/browser.ts",
  "src/ai/chatgpt.ts",
  "src/ai/connections.ts",
  "src/ai/contracts.ts",
  "src/ai/fingerprint.ts",
  "src/ai/gemini.ts",
  "src/ai/mutex.ts",
  "src/ai/providerFailure.ts",
  "src/components/charts/plotData.ts",
  "src/components/report/evidenceIdentity.ts",
  "src/ai/store.ts",
  "src/ai/transport.ts",
  "src/app/api/ai/connections/route.ts",
  "src/providers/anthropic.ts",
  "src/providers/edgar.ts",
  "src/providers/finnhub.ts",
  "src/providers/finra.ts",
  "src/providers/fmp.ts",
  "src/providers/fmpAccess.ts",
  "src/providers/fred.ts",
  "src/providers/http.ts",
  "src/providers/yahoo.ts",
  "src/providers/treasury.ts",
  "src/providers/splitEvents.ts",
  // Decides how long a cached quote stays fresh, so a slip serves an old price.
  "src/providers/usSession.ts",
  "src/providers/historyCache.ts",
  "src/edgar/dividendFrequency.ts",
  "src/edgar/extract.ts",
  "src/edgar/xbrl.ts",
  "src/edgar/statements.ts",
  "src/edgar/filedPresentation.ts",
  "src/edgar/instanceFacts.ts",
  "src/edgar/retainedClassEconomics.ts",
  "src/edgar/cashInvestment.ts",
  // WS4 review N3: the versioned tag table and the successor hop were carved
  // out of statements.ts, and the reserved-symbol rule is a safety guard; all
  // three were audited logic with no coverage floor of their own.
  "src/edgar/tagSynonyms.ts",
  "src/edgar/synonymFloor.ts",
  "src/edgar/presentationLineage.ts",
  "src/edgar/successor.ts",
  "src/providers/reservedSymbols.ts",
  "src/edgar/splits.ts",
  "src/edgar/sic.ts",
  "src/cache/apiCache.ts",
  "src/cache/compression.ts",
  "src/cache/maintenance.ts",
  "src/symbol.ts",
  "src/pipeline/companyLoad.ts",
  "src/pipeline/dataBundle.ts",
  "src/pipeline/commonEarnings.ts",
  "src/pipeline/incomeBasis.ts",
  "src/pipeline/cashFlowBasis.ts",
  "src/pipeline/keyless.ts",
  "src/pipeline/riskFreeFallback.ts",
  "src/pipeline/riskFreeSeries.ts",
  "src/pipeline/fx.ts",
  "src/pipeline/foreignCurrency.ts",
  "src/pipeline/stageA/manifest.ts",
  "src/pipeline/stageA/validate.ts",
  "src/pipeline/stageC/citations.ts",
  "src/pipeline/stageC/continuation.ts",
  "src/pipeline/stageC/sectionCheckpoint.ts",
  "src/pipeline/stageC/entityValidation.ts",
  "src/pipeline/stageC/index.ts",
  "src/pipeline/stageC/passes.ts",
  "src/pipeline/stageC/payload.ts",
  "src/pipeline/stageC/prompts.ts",
  "src/pipeline/stageC/provenance.ts",
  "src/pipeline/companyJobIdentity.ts",
  "src/pipeline/jobArtifacts.ts",
  "src/pipeline/jobRunner.ts",
  "src/pipeline/sectionLimits.ts",
  "src/pipeline/jobStore.ts",
  "src/pipeline/jobScheduler.ts",
  "src/pipeline/jobSchedulerBootstrap.ts",
  "src/pipeline/jobState.ts",
  "src/pipeline/jobSteps.ts",
  "src/pipeline/events.ts",
  "src/pipeline/types.ts",
  "src/instrumentation.ts",
  "src/report/completeness.ts",
  "src/report/analysisCompletion.ts",
  "src/report/gapResolution.ts",
  "src/report/assessment.ts",
  "src/report/earningsReferences.ts",
  "src/report/earningsSchedule.ts",
  "src/report/evidenceTiming.ts",
  "src/report/estimateTiming.ts",
  "src/report/sourceFactPresentation.ts",
  "src/report/sourceFactSchema.ts",
  "src/report/sourceFacts.ts",
  "src/report/technicalTrend.ts",
  "src/types/periodContext.ts",
  "src/report/execution.ts",
  "src/report/modelEvidence.ts",
  "src/report/query.ts",
  "src/report/history.ts",
  "src/report/diff.ts",
  "src/report/diffPresentation.ts",
  "src/report/claimMatching.ts",
  "src/report/verificationMarks.ts",
  "src/report/legacyEntitySafety.ts",
  "src/report/principalAggregationSafety.ts",
  "src/report/enterpriseValueSafety.ts",
  "src/report/legacyPayloadRecordSafety.ts",
  "src/report/legacyEdgarDerivedLines.ts",
  "src/report/legacyBridgeMethod.ts",
  "src/report/legacyScopeQualifications.ts",
  "src/report/legacyImpliedReturnShareBasis.ts",
  "src/report/legacyValuationNotes.ts",
  "src/report/sectionManifest.ts",
  "src/report/surfaceManifest.ts",
  "src/report/export/correctedCli.ts",
  "src/report/export/markdown.ts",
  "src/report/export/markdownEscape.ts",
  "src/report/export/printHtml.ts",
  "src/report/format.ts",
  "src/report/cagrPresentation.ts",
  "src/report/scoreText.ts",
  "src/report/fairValueText.ts",
  "src/report/providerFallback.ts",
  "src/report/ownHistoryPresentation.ts",
  "src/settings/contracts.ts",
  "src/settings/settings.ts",
  "src/settings/writeQueue.ts",
  "src/app/requestSecurity.ts",
  "src/app/api/sameOrigin.ts",
  "src/app/api/export/[reportId]/route.ts",
  "src/app/api/jobs/resume/route.ts",
  "src/app/api/report/route.ts",
  "src/app/api/report/resolvePasses.ts",
  "src/app/api/report/[jobId]/route.ts",
  "src/app/api/report/[jobId]/cancel/route.ts",
  "src/app/api/report/[jobId]/retry/route.ts",
  "src/app/api/report/[jobId]/stream/route.ts",
  "src/app/api/report/view/[reportId]/route.ts",
  "src/app/api/settings/route.ts",
  "src/app/api/settings/credentials/route.ts",
  "src/settings/credentialContracts.ts",
  "src/settings/testCredential.ts",
  "src/app/api/watchlist/route.ts",
  "src/proxy.ts",
  "src/config/env.ts",
  "src/config/namespace.ts",
  "src/brand/identity.ts",
  "src/db/index.ts",
  "src/db/paths.ts",
  "src/db/schema.ts",
  "src/watchlist/watchlist.ts",
  "src/pipeline/compute.ts",
  "src/models/registry.ts",
  "src/pipeline/leaseTiming.ts",
  "src/pipeline/stageC/consistency.ts",
  "src/pipeline/stageC/dataOnlyReport.ts",
  "src/pipeline/stageC/judgeProtocol.ts",
  "src/pipeline/estimateCurrency.ts",
  "src/pipeline/stageC/excerptNumbers.ts",
  "src/pipeline/stageC/confidenceCeiling.ts",
  "src/pipeline/stageC/returnPathLanguage.ts",
  "src/edgar/financialEnrichment.ts",
  "src/edgar/incomeClassification.ts",
  "src/edgar/debtNoteCarrying.ts",
  "src/edgar/temporaryEquityEnrichment.ts",
  "src/edgar/debtCompleteness.ts",
  "src/edgar/vendorAgreement.ts",
  "src/edgar/debtPresentation.ts",
  "src/edgar/issuerFacts.ts",
  "src/edgar/receivables.ts",
  "src/edgar/equityStatementNci.ts",
  "src/providers/companyEvents.ts",
  "src/providers/companyIr.ts",
  "src/pipeline/runInputSnapshot.ts",
  "src/pipeline/runtimeArtifactIdentity.ts",
  "src/pipeline/stageC/gradeContract.ts",
  "src/pipeline/runInputSnapshotStore.ts",
  "src/pipeline/replayRunInput.ts",
  "src/pipeline/stageC/claimEvidence.ts",
  "src/pipeline/stageC/evidenceSelection.ts",
  "src/report/auditTables.ts",
  "src/report/financialDiagnostics.ts",
  "src/report/executiveAssessment.ts",
  "src/evaluation/evaluationContract.ts",
  "src/evaluation/evaluation.ts",
  "src/evaluation/targetDefinition.ts",
  "src/evaluation/artifactManifest.ts",
  "src/evaluation/pairedDiagnostics.ts",
  "src/evaluation/registry.ts",
  "src/evaluation/claimBenchmark.ts",
  "src/evaluation/claimBenchmarkCli.ts",
  "src/report/forecastAdapter.ts",
  "src/pipeline/peers.ts",
  "src/pipeline/peerProviderFailure.ts",
  "src/pipeline/peerFilings.ts",
  "src/report/evaluation.ts",
  "src/report/evaluationCli.ts",
  "src/report/evaluationStudy.ts",
  "src/report/evaluationStudyStore.ts",
  "src/report/gradeReliability.ts",
  "src/report/researchReview.ts",
  "src/report/scenarioPresentation.ts",
  "src/report/thesisTriggers.ts",
  "src/edgar/currentReports.ts",
  "src/edgar/filingFacts.ts",
  "src/edgar/segmentFacts.ts",
  "src/edgar/segmentPerformance.ts",
  "src/edgar/economicShares.ts",
  "src/edgar/guidanceTables.ts",
  "src/edgar/htmlHidden.ts",
  "src/edgar/annualGeography.ts",
  "src/pipeline/financialComposition.ts",
  "src/pipeline/stageB/leaseScope.ts",
  "src/providers/currentReports.ts",
  "src/pipeline/filingDisclosures.ts",
  "src/report/filingDisclosurePresentation.ts",
  "src/report/readerConventions.ts",
  "src/report/reconciliationPresentation.ts",
  "src/report/filingSupplementPresentation.ts",
  "src/report/presentation.ts",
  "src/report/export/auditMarkdown.ts",
  "src/pipeline/marketData.ts",
] as const;

/**
 * Source files deliberately outside both coverage manifests, each with the
 * reason. A file that is in neither list and not here fails the walk below,
 * so a new module has to be placed on purpose (audit 2026-09-06, F200).
 */
const COVERAGE_EXEMPT_SOURCES: Record<string, string> = {
  "src/app/company/[symbol]/GenerateReport.tsx": "Measured 79.24/84.44/96.25/83.68 statements/branches/functions/lines in tsx-targeted-measure, below the risk floor; UI behavior exercised by tests/api.routes.export.test.ts, tests/company.generateReport.persistence.test.ts, tests/company.generateReport.resume.test.ts, tests/company.generateReport.route.test.ts, tests/company.generateReport.stream.test.ts, tests/company.generateReport.unsupported.test.ts, tests/company.page.unsupported.test.ts, tests/company.report.presentation.test.ts, tests/currency.companyPage.test.ts, tests/report.dossier.test.ts, tests/report.surface.client.test.ts",
  "src/app/company/[symbol]/history/diff/diff-body.tsx": "UI behavior exercised by tests/report.history.export.test.ts",
  "src/app/company/[symbol]/history/diff/page.tsx": "UI behavior exercised by tests/company.routes.symbol.test.ts, tests/report.history.export.test.ts, tests/report.revisionDigest.test.ts",
  "src/app/company/[symbol]/history/HistoryCompare.tsx": "history selection navigation exercised by tests/report.history.export.test.ts",
  "src/app/company/[symbol]/history/page.tsx": "UI behavior exercised by tests/company.routes.symbol.test.ts, tests/report.history.export.test.ts, tests/report.revisionDigest.test.ts",
  "src/app/company/[symbol]/page.tsx": "Measured 79.71/66.84/60.29/80.42 statements/branches/functions/lines in tsx-targeted-measure, below the risk floor; UI behavior exercised by tests/company.page.unsupported.test.ts, tests/company.report.presentation.test.ts, tests/currency.companyPage.test.ts",
  "src/app/company/[symbol]/report/[reportId]/page.tsx": "UI behavior exercised by tests/company.report.presentation.test.ts, tests/company.routes.symbol.test.ts",
  "src/app/company/[symbol]/report/[reportId]/print/page.tsx": "UI behavior exercised by tests/company.report.presentation.test.ts, tests/company.routes.symbol.test.ts",
  "src/app/company/[symbol]/ReportTabs.tsx": "UI behavior exercised by tests/company.report.presentation.test.ts",
  "src/app/company/[symbol]/skeletons.tsx": "render only: React presentation; no research calculation or persisted report mutation",
  "src/app/layout.tsx": "UI behavior exercised by tests/ai.storeUnreadable.test.ts, tests/appearance.surfaces.test.ts, tests/ui.redesign.test.ts",
  "src/app/page.tsx": "UI behavior exercised by tests/home.aiRoute.test.ts, tests/report.surface.watchlist.test.ts",
  "src/app/report/sample/page.tsx": "render only: React presentation; no research calculation or persisted report mutation",
  "src/app/settings/AiConnections.tsx": "connection controls; requests use audited src/app/api/ai/connections/route.ts; exercised by tests/ai.connections.test.ts",
  "src/app/settings/AppearanceSettings.tsx": "UI behavior exercised by tests/appearance.surfaces.test.ts",
  "src/app/settings/page.tsx": "render only: React presentation; no research calculation or persisted report mutation",
  "src/app/settings/ProviderCredentials.tsx": "UI behavior exercised by tests/settings.credentials.ui.test.ts",
  "src/app/settings/ResumeQueueControl.tsx": "Measured 95/70.58/80/94.73 statements/branches/functions/lines in tsx-targeted-measure, below the risk floor; UI behavior exercised by tests/settings.resumeQueue.test.ts",
  "src/app/settings/SettingsPageView.tsx": "UI behavior exercised by tests/settings.page.test.ts, tests/settings.resumeQueue.test.ts",
  "src/appearance/UiDesignProvider.tsx": "UI behavior exercised by tests/appearance.density.test.ts, tests/appearance.surfaces.test.ts, tests/charts.evidenceSurfaces.test.ts, tests/charts.evidenceTable.test.ts, tests/commandPalette.test.ts, tests/company.generateReport.persistence.test.ts, tests/report.evidenceDrilldown.test.ts, tests/report.exportMenu.test.ts, tests/report.provenanceDetails.test.ts, tests/report.publicReadiness.test.ts",
  "src/brand/MetisLogo.tsx": "render only: React presentation; no research calculation or persisted report mutation",
  "src/components/charts/ChartDataDisclosure.tsx": "UI behavior exercised by tests/charts.evidenceTable.test.ts",
  "src/components/charts/FundamentalsCharts.tsx": "UI behavior exercised by tests/charts.fundamentals.currency.test.ts, tests/charts.missingObservations.test.ts",
  "src/components/charts/lazy.tsx": "UI behavior exercised by tests/company.report.presentation.test.ts, tests/currency.companyPage.test.ts",
  "src/components/charts/PriceChart.tsx": "UI behavior exercised by tests/appearance.surfaces.test.ts, tests/charts.evidenceBoundary.test.ts, tests/charts.evidenceSurfaces.test.ts, tests/charts.map.test.ts",
  "src/components/charts/ProjectionFanChart.tsx": "UI behavior exercised by tests/charts.missingObservations.test.ts, tests/charts.projectionAxes.test.ts, tests/report.format.shared.test.ts",
  "src/components/charts/RelativeStrengthChart.tsx": "UI behavior exercised by tests/appearance.surfaces.test.ts, tests/charts.evidenceBoundary.test.ts, tests/charts.evidenceSurfaces.test.ts, tests/charts.relativeStrengthRebase.test.ts",
  "src/components/charts/SensitivityHeatmap.tsx": "render only: React presentation; no research calculation or persisted report mutation",
  "src/components/charts/TechnicalsChartPanel.tsx": "render only: React presentation; no research calculation or persisted report mutation",
  "src/components/CommandLauncher.tsx": "UI behavior exercised by tests/commandPalette.test.ts",
  "src/components/CommandPalette.tsx": "search and keyboard navigation exercised by tests/commandPalette.test.ts",
  "src/components/report/AutoPrint.tsx": "render only: React presentation; no research calculation or persisted report mutation",
  "src/components/report/CapitalBridge.tsx": "render only: React presentation; no research calculation or persisted report mutation",
  "src/components/report/ClaimText.tsx": "UI behavior exercised by tests/report.evidenceDrilldown.test.ts, tests/report.inspector.test.ts",
  "src/components/report/DossierCover.tsx": "render only: React presentation; no research calculation or persisted report mutation",
  "src/components/report/EvidenceInspector.tsx": "UI behavior exercised by tests/commandPalette.test.ts, tests/report.inspector.test.ts",
  "src/components/report/ExportButtons.tsx": "UI behavior exercised by tests/report.exportMenu.test.ts",
  "src/components/report/FactorAttribution.tsx": "render only: React presentation; no research calculation or persisted report mutation",
  "src/components/report/PersistedReportView.tsx": "UI behavior exercised by tests/company.report.presentation.test.ts",
  "src/components/report/primitives.tsx": "UI behavior exercised by tests/commandPalette.test.ts, tests/report.assessment.test.ts, tests/report.claimMetricPresentation.test.ts, tests/report.evidenceDrilldown.test.ts, tests/report.fixture.test.ts, tests/report.inspector.test.ts, tests/report.legacyEntitySafety.test.ts, tests/report.periodStatusPresentation.test.ts, tests/report.presentation.d67.test.ts, tests/report.provenanceDetails.test.ts, tests/stageC.confidenceCeiling.test.ts, tests/stageC.gradeContract.test.ts",
  "src/components/report/RecordedAuditTable.tsx": "render only: React presentation; no research calculation or persisted report mutation",
  "src/components/report/RecordedSensitivity.tsx": "render only: React presentation; no research calculation or persisted report mutation",
  "src/components/report/RecordedSensitivityMatrix.tsx": "render only: React presentation; no research calculation or persisted report mutation",
  "src/components/report/ReportContents.tsx": "UI behavior exercised by tests/report.contents.test.ts",
  "src/components/report/ReportEvidenceRail.tsx": "UI behavior exercised by tests/report.dossier.test.ts, tests/report.refinement.view.test.ts",
  "src/components/report/ReportNotes.tsx": "UI behavior exercised by tests/company.report.presentation.test.ts, tests/report.notes.test.ts",
  "src/components/report/ReportSnapshotHeader.tsx": "UI behavior exercised by tests/analysisCompletion.test.ts, tests/report.providerFallback.test.ts, tests/report.refinement.view.test.ts, tests/report.snapshotResearch.test.ts",
  "src/components/report/ReportTrustSummary.tsx": "render only: React presentation; no research calculation or persisted report mutation",
  "src/components/report/ReportView.tsx": "UI behavior exercised by tests/appearance.surfaces.test.ts, tests/audit.scoringSensitivity.test.ts, tests/company.report.presentation.test.ts, tests/currency.dataOnlyCashFlow.test.ts, tests/currency.report.test.ts, tests/currentReports.materialEventScope.test.ts, tests/currentReports.newerResults.test.ts, tests/currentReports.principalAggregation.test.ts, tests/currentReports.retention.test.ts, tests/estimateTiming.integration.test.ts, tests/fairValue.degradedInputs.test.ts, tests/filingDisclosures.composition.test.ts, tests/filingDisclosures.newerFiling.test.ts, tests/lease.legacyScope.test.ts, tests/multiples.basisLabel.audit20261022.test.ts, tests/phaseOne.consumerRefusals.test.ts, tests/phaseOne.finalReview.test.ts, tests/projection.ownershipScope.test.ts, tests/report.amznPresentationNits.test.ts, tests/report.assessment.test.ts, tests/report.auditSurfaces.test.ts, tests/report.batchIntegration.test.ts, tests/report.capitalBridge.test.ts, tests/report.claimStatusMarks.test.ts, tests/report.claimSupport.test.ts, tests/report.commitmentPaymentTiming.test.ts, tests/report.companyStatements.test.ts, tests/report.computedMark.test.ts, tests/report.dossier.test.ts, tests/report.evaluationSurfaces.test.ts, tests/report.evidenceDrilldown.test.ts, tests/report.evidenceTiming.test.ts, tests/report.filingSupplements.presentation.test.ts, tests/report.format.shared.test.ts, tests/report.legacyBridgeMethod.test.ts, tests/report.legacyEdgarDerivedLines.test.ts, tests/report.legacyImpliedReturnShareBasis.test.ts, tests/report.legacyPayloadRecords.test.ts, tests/report.legacyScopeQualifications.test.ts, tests/report.markdown.integration.test.ts, tests/report.multipleBasis.test.ts, tests/report.officerDateSemantics.test.ts, tests/report.outputAudit.test.ts, tests/report.ownHistoryPercentileCell.test.ts, tests/report.periodStatusPresentation.test.ts, tests/report.presentation.d62.test.ts, tests/report.presentation.d67.test.ts, tests/report.providerFallback.test.ts, tests/report.publicReadiness.test.ts, tests/report.reconciliationScope.test.ts, tests/report.recordedSensitivity.test.ts, tests/report.refinement.view.test.ts, tests/report.researchReview.test.ts, tests/report.runDisclosure.test.ts, tests/report.scaledCurrencyPresentation.test.ts, tests/report.surface.completeness.test.ts, tests/report.surface.detail.test.ts, tests/report.templateAvailability.test.ts, tests/report.trustPresentation.test.ts, tests/report.uiParity.test.ts, tests/report.verificationHeadlineOrder.test.ts, tests/report.versionStamps.test.ts, tests/stageB.economicShareScope.test.ts, tests/stageB.lenderCashFlow.test.ts, tests/stageB.ptbvCurrency.audit20261027.test.ts, tests/stageB.recentIpoCostOfEquity.test.ts, tests/stageC.dataOnlyMacro.test.ts",
  "src/components/report/ResearchNavigation.tsx": "render only: React presentation; no research calculation or persisted report mutation",
  "src/components/report/RevisionDigest.tsx": "UI behavior exercised by tests/report.revisionDigest.test.ts",
  "src/components/report/RunNotices.tsx": "render only: React presentation; no research calculation or persisted report mutation",
  "src/components/report/sections.tsx": "UI behavior exercised by tests/audit.scoringSensitivity.test.ts, tests/dataBundle.annualGeography.test.ts, tests/report.assessment.test.ts, tests/report.capitalBridge.test.ts, tests/report.evidenceDrilldown.test.ts, tests/report.format.shared.test.ts, tests/report.gradeReliability.test.ts, tests/report.history.export.test.ts, tests/report.projectionAvailability.test.ts, tests/report.provenanceDetails.test.ts, tests/report.qualityAccrualClarification.test.ts, tests/report.reconciliationScope.reader.test.ts, tests/report.refinement.view.test.ts, tests/report.riskProbability.test.ts, tests/report.sourceFactPresentation.test.ts, tests/report.surface.completeness.test.ts, tests/report.trustPresentation.test.ts",
  "src/components/report/SourceEvidenceCatalog.tsx": "UI behavior exercised by tests/report.inspector.test.ts",
  "src/components/report/ThesisCheckpoints.tsx": "render only: React presentation; no research calculation or persisted report mutation",
  "src/components/report/ValuationReview.tsx": "render only: React presentation; no research calculation or persisted report mutation",
  "src/components/report/ValuationSensitivityTables.tsx": "render only: React presentation; no research calculation or persisted report mutation",
  "src/components/shell.tsx": "render only: React presentation; no research calculation or persisted report mutation",
  "src/components/SidebarNavigation.tsx": "UI behavior exercised by tests/sidebarNavigation.test.ts",
  "src/components/ui.tsx": "UI behavior exercised by tests/report.compositeEvidenceFloor.test.ts, tests/report.format.shared.test.ts",
  "src/components/watchlist/AddTicker.tsx": "UI behavior exercised by tests/home.aiRoute.test.ts, tests/report.surface.watchlist.test.ts",
  "src/components/watchlist/CoverageDesk.tsx": "UI behavior exercised by tests/ui.redesign.test.ts",
  "src/components/watchlist/RemoveButton.tsx": "UI behavior exercised by tests/home.aiRoute.test.ts, tests/report.surface.watchlist.test.ts, tests/watchlist.removeButton.test.ts",
  "src/components/watchlist/RunsDisclosure.tsx": "UI behavior exercised by tests/home.aiRoute.test.ts, tests/report.surface.watchlist.test.ts",
  "src/components/watchlist/Sidebar.tsx": "UI behavior exercised by tests/company.report.presentation.test.ts, tests/currency.companyPage.test.ts, tests/report.refinement.view.test.ts, tests/report.revisionDigest.test.ts, tests/report.surface.watchlist.test.ts",
  "src/components/WorkspaceToolbar.tsx": "UI behavior exercised by tests/appearance.density.test.ts, tests/appearance.surfaces.test.ts",
  "src/appearance/preference.ts": "nonsecret browser display cookie only; parsing/write-failure tests in appearance.preference.test.ts; never controls research, spend or DB state",
  "src/appearance/density.ts": "nonsecret spacing cookie only; parsing/write-failure and server/client alignment tests in appearance.density.test.ts and appearance.surfaces.test.ts; never changes research, spend or DB state",
  "src/components/charts/palette.ts": "display colors for optional workspace; never changes chart values, research, spend or persistence",
  "src/app/company/[symbol]/format.ts": "display formatting for the company page; exercised by the page tests, not risk-bearing",
  "src/components/charts/format.ts": "chart label formatting; covered by tests/charts.format.test.ts, a wrong label is visible, never persisted",
  "src/components/charts/map.ts": "chart data mapping; covered by tests/charts.map.test.ts, a wrong point is visible, never persisted",
  "src/components/charts/synthetic.ts": "the synthetic sample-report chart data; fixtures only",
  "src/components/watchlist/addTickerInput.ts": "input normalisation for the add-ticker box; covered by tests/watchlist.addTicker.test.ts",
  "src/types/core.ts": "type declarations only; no runtime code",
};

/** Every non-declaration TypeScript source under src/, repo-relative with forward slashes. */
function walkSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkSources(full));
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      out.push(path.relative(ROOT, full).split(path.sep).join("/"));
    }
  }
  return out;
}

interface SharedConfigModule {
  RISK_SOURCE_MANIFEST: readonly string[];
}

interface RiskConfigModule {
  default: {
    test?: { coverage?: { include?: readonly string[] } };
  };
}

async function loadSharedConfig(): Promise<SharedConfigModule> {
  const moduleUrl = pathToFileURL(path.join(ROOT, "vitest.shared.ts")).href;
  return (await import(moduleUrl)) as SharedConfigModule;
}

async function loadRiskConfig(): Promise<RiskConfigModule> {
  const moduleUrl = pathToFileURL(path.join(ROOT, "vitest.risk.config.ts")).href;
  return (await import(moduleUrl)) as RiskConfigModule;
}

function runCoverageMutation(options: {
  source: string | string[];
  testBody: string;
  thresholds: { statements: number; branches: number; functions: number; lines: number };
  perFile?: boolean;
  extraThresholds?: Record<string, {statements:number;branches:number;functions:number;lines:number}>;
}): { status: number | null; output: string } {
  const tempRoot = path.join(ROOT, "tmp");
  mkdirSync(tempRoot, { recursive: true });
  const tempDir = mkdtempSync(path.join(tempRoot, "coverage-contract-"));
  const relativeTempDir = path.relative(ROOT, tempDir).replaceAll("\\", "/");
  const testFile = path.join(tempDir, "mutation.test.ts");
  const configFile = path.join(tempDir, "vitest.mutation.config.mjs");
  try {
    writeFileSync(testFile, options.testBody, "utf8");
    writeFileSync(
      configFile,
      `export default ${JSON.stringify({
        root: ROOT,
        test: {
          globals: true,
          include: [`${relativeTempDir}/mutation.test.ts`],
          environment: "node",
          pool: "forks",
          isolate: true,
          coverage: {
            provider: "v8",
            include: Array.isArray(options.source) ? options.source : [options.source],
            reporter: ["text"],
            reportsDirectory: `${relativeTempDir}/coverage`,
            thresholds: {
              ...options.thresholds,
              ...options.extraThresholds,
              perFile: options.perFile ?? true,
              autoUpdate: false,
            },
          },
        },
      })};\n`,
      "utf8",
    );
    const result = spawnSync(
      process.execPath,
      [VITEST_CLI, "run", "--maxWorkers=2", "--config", configFile, "--coverage", "--reporter=dot"],
      { cwd: ROOT, encoding: "utf8" },
    );
    return {
      status: result.status,
      output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

describe("risk coverage contract", () => {
  it("keeps interrupted coverage temp TypeScript out of canonical compilation", () => {
    const tempRoot = path.join(ROOT, "tmp");
    mkdirSync(tempRoot, { recursive: true });
    const tempDir = mkdtempSync(path.join(tempRoot, "coverage-contract-stale-"));
    const staleTestFile = path.join(tempDir, "mutation.test.ts");

    try {
      writeFileSync(
        staleTestFile,
        'const interruptedCoveragePoison: number = "not-a-number";\n',
        "utf8",
      );
      const configPath = path.join(ROOT, "tsconfig.json");
      const loaded = ts.readConfigFile(configPath, ts.sys.readFile);
      expect(loaded.error).toBeUndefined();
      const parsed = ts.parseJsonConfigFileContent(loaded.config, ts.sys, ROOT);
      expect(parsed.errors).toEqual([]);
      expect(
        parsed.fileNames.map((file) => path.resolve(file).toLowerCase()),
      ).not.toContain(path.resolve(staleTestFile).toLowerCase());
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("uses the exact literal audited source manifest in both directions", async () => {
    const shared = await loadSharedConfig();
    const risk = await loadRiskConfig();

    expect(shared.RISK_SOURCE_MANIFEST).toEqual(EXPECTED_RISK_SOURCES);
    expect(risk.default.test?.coverage?.include).toBe(
      shared.RISK_SOURCE_MANIFEST,
    );
    expect(risk.default.test?.coverage?.include).toEqual(EXPECTED_RISK_SOURCES);
    expect(new Set(shared.RISK_SOURCE_MANIFEST).size).toBe(
      EXPECTED_RISK_SOURCES.length,
    );
    for (const source of EXPECTED_RISK_SOURCES) {
      expect(existsSync(path.join(ROOT, source)), source).toBe(true);
    }
  });

  it("places every source file in the risk manifest, the core include, or the named exemption list", () => {
    const core = (file: string): boolean =>
      file.startsWith("src/pipeline/stageB/") || file === "src/report/schema.ts";
    const sources = walkSources(path.join(ROOT, "src")).sort();
    const unplaced = sources.filter(
      (file) => !(EXPECTED_RISK_SOURCES as readonly string[]).includes(file) && !core(file) && !(file in COVERAGE_EXEMPT_SOURCES),
    );
    expect(unplaced, "add the file to RISK_SOURCE_MANIFEST or to COVERAGE_EXEMPT_SOURCES with a reason").toEqual([]);
    // An exemption for a file that no longer exists is stale, and a file
    // cannot be both exempt and audited.
    for (const file of Object.keys(COVERAGE_EXEMPT_SOURCES)) {
      expect(existsSync(path.join(ROOT, file)), file).toBe(true);
      expect(EXPECTED_RISK_SOURCES as readonly string[]).not.toContain(file);
    }
  });

  it("keeps the exact core and per-file risk thresholds without auto-update", () => {
    const core = readFileSync(path.join(ROOT, "vitest.config.ts"), "utf8");
    const risk = readFileSync(path.join(ROOT, "vitest.risk.config.ts"), "utf8");

    expect(core).toMatch(
      /statements:\s*90[\s\S]*branches:\s*84[\s\S]*functions:\s*95[\s\S]*lines:\s*93/,
    );
    expect(risk).toMatch(
      /statements:\s*85[\s\S]*branches:\s*75[\s\S]*functions:\s*85[\s\S]*lines:\s*85[\s\S]*perFile:\s*true[\s\S]*autoUpdate:\s*false/,
    );
    expect(core).toContain('reportsDirectory: "coverage/core"');
    expect(risk).toContain('reportsDirectory: "coverage/risk"');
    expect(risk).toContain("include: RISK_SOURCE_MANIFEST");
  });

  it("causally fails when an included source is never imported", () => {
    const result = runCoverageMutation({
      source: "src/report/export/correctedCli.ts",
      testBody: 'test("does not import the audited source", () => expect(true).toBe(true));\n',
      thresholds: { statements: 1, branches: 1, functions: 1, lines: 1 },
    });

    expect(result.status).not.toBe(0);
    expect(result.output).toMatch(/coverage.*correctedCli|correctedCli.*coverage/i);
  });

  it("causally enforces each file even when aggregate coverage passes", () => {
    const options = {
      source: ["src/symbol.ts", "src/report/execution.ts"],
      testBody:
        'import { normalizeSymbol } from "../../src/symbol";\n' +
        'test("covers only one symbol path", () => expect(normalizeSymbol("aapl")).toBe("AAPL"));\n',
      thresholds: { statements: 1, branches: 1, functions: 1, lines: 1 },
    };
    const aggregate = runCoverageMutation({ ...options, perFile: false });
    const perFile = runCoverageMutation({ ...options, perFile: true });

    expect(aggregate.status, aggregate.output).toBe(0);
    expect(perFile.status).not.toBe(0);
    expect(perFile.output).toMatch(/coverage.*execution|execution.*coverage/i);
  }, 30_000);
});

it("TEST-201 walks TSX sources as well as TS and refuses declarations",()=>{
 const sources=walkSources(path.join(ROOT,"src"));
 expect(sources).toContain("src/app/company/[symbol]/page.tsx");
 expect(sources.filter(f=>f.endsWith(".d.ts"))).toEqual([]);
});
it("TEST-201 applies a single-file floor to every core source",async()=>{
 const config=await import("../vitest.config");
 const thresholds=config.default.test!.coverage!.thresholds as Record<string,unknown>;
 expect(thresholds).toMatchObject({statements:90,branches:84,functions:95,lines:93});
 for(const f of [...walkSources(path.join(ROOT,"src/pipeline/stageB")),"src/report/schema.ts"])
  expect(thresholds[f],f).toEqual({statements:85,branches:75,functions:85,lines:85});
});

it("TEST-201 exemption test references exist",()=>{
 for(const reason of Object.values(COVERAGE_EXEMPT_SOURCES))
  for(const [f] of reason.matchAll(/tests\/[\w.-]+\.test\.ts/g)) expect(existsSync(path.join(ROOT,f)),f).toBe(true);
});

it("TEST-201 single-file glob fails while aggregate-only passes",()=>{
 const options={source:["src/symbol.ts","src/report/execution.ts"],testBody:'import { normalizeSymbol } from "../../src/symbol"; test("covers symbol",()=>expect(normalizeSymbol("demo")).toBe("DEMO"));',thresholds:{statements:1,branches:1,functions:1,lines:1},perFile:false};
 const base=runCoverageMutation(options);
 const guarded=runCoverageMutation({...options,extraThresholds:{"src/report/execution.ts":{statements:85,branches:75,functions:85,lines:85}}});
 expect(base.status,base.output).toBe(0);
 expect(guarded.status,guarded.output).not.toBe(0);
 expect(guarded.output).toContain('"src/report/execution.ts" threshold');
},30000);

it("TEST-201 refuses glob-unsafe core paths",async()=>{
 const {perFileFloorThresholds}=await import("../vitest.shared");
 const dir=mkdtempSync(path.join(ROOT,"tmp/floor-probe-"));
 try {
  mkdirSync(path.join(dir,"stageB"));
  writeFileSync(path.join(dir,"stageB/a.ts"),"export const a=1;");
  expect(Object.keys(perFileFloorThresholds(dir,["stageB"]))).toEqual(["stageB/a.ts"]);
  writeFileSync(path.join(dir,"stageB/[x].ts"),"export const b=1;");
  expect(()=>perFileFloorThresholds(dir,["stageB"])).toThrow(/glob-free path/);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
