import path from "node:path";

export const DB_CLI_TEST = "tests/db.cli.test.ts";
export const PRODUCT_TEST_INCLUDE = ["tests/**/*.test.ts"];
export const PRODUCT_TEST_EXCLUDE = [DB_CLI_TEST];
export const INTEGRATION_TEST_INCLUDE = [DB_CLI_TEST];

/**
 * Installed for every test file in every config: replaces `globalThis.fetch`
 * with a guard that rejects any non-loopback request, so a test can never reach
 * a live provider. See `tests/setup/noLiveNetwork.ts`.
 */
export const SHARED_SETUP_FILES = ["./tests/setup/noLiveNetwork.ts", "./tests/setup/privateCredentials.ts"];

export const SHARED_RESOLVE_ALIAS = {
  "@": path.resolve(__dirname, "src"),
  "server-only": path.resolve(__dirname, "tests", "server-only.mock.ts"),
};

/**
 * Literal risk inventory. Keep this deliberately explicit: adding or removing
 * an audited source is a reviewable coverage-policy change.
 */
export const RISK_SOURCE_MANIFEST = [
  "src/ai/browser.ts",
  "src/ai/chatgpt.ts",
  "src/ai/connections.ts",
  "src/ai/contracts.ts",
  "src/ai/fingerprint.ts",
  "src/ai/gemini.ts",
  "src/ai/mutex.ts",
  "src/components/charts/plotData.ts",
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
  "src/providers/splitEvents.ts",
  "src/edgar/extract.ts",
  "src/edgar/xbrl.ts",
  "src/edgar/statements.ts",
  // The element names and the successor hop moved OUT of the audited
  // statements.ts, taking logic with them; the reserved-symbol rule is the
  // guard that keeps a demo report from reaching a provider at all. All three
  // need the same coverage floor as the module they were carved from.
  "src/edgar/tagSynonyms.ts",
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
  "src/pipeline/keyless.ts",
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
  "src/pipeline/jobArtifacts.ts",
  "src/pipeline/jobRunner.ts",
  "src/pipeline/jobStore.ts",
  "src/pipeline/jobScheduler.ts",
  "src/pipeline/jobSchedulerBootstrap.ts",
  "src/pipeline/jobState.ts",
  "src/pipeline/jobSteps.ts",
  "src/pipeline/events.ts",
  "src/pipeline/types.ts",
  "src/instrumentation.ts",
  "src/report/completeness.ts",
  "src/report/assessment.ts",
  "src/report/earningsReferences.ts",
  "src/report/evidenceTiming.ts",
  "src/report/sourceFactPresentation.ts",
  "src/report/sourceFactSchema.ts",
  "src/report/sourceFacts.ts",
  "src/types/periodContext.ts",
  "src/report/execution.ts",
  "src/report/query.ts",
  "src/report/history.ts",
  "src/report/diff.ts",
  "src/report/legacyEntitySafety.ts",
  "src/report/sectionManifest.ts",
  "src/report/surfaceManifest.ts",
  "src/report/export/correctedCli.ts",
  "src/report/export/markdown.ts",
  "src/report/export/markdownEscape.ts",
  "src/report/export/printHtml.ts",
  "src/report/format.ts",
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
  // Added 2026-09-06 (audit F200): risk-bearing modules that sat outside both
  // coverage manifests. compute.ts is the Stage B orchestrator the audit
  // baseline pins; registry.ts is the model policy (D-01..D-06); leaseTiming.ts
  // owns the model-stage deadline; consistency.ts, dataOnlyReport.ts and
  // judgeProtocol.ts are Stage C logic added on 2026-09-01/02 after the
  // manifest's last edit. tests/risk.coverage.test.ts now walks src/ so a new
  // module cannot be left out silently again.
  "src/pipeline/compute.ts",
  "src/models/registry.ts",
  "src/pipeline/leaseTiming.ts",
  "src/pipeline/stageC/consistency.ts",
  "src/pipeline/stageC/dataOnlyReport.ts",
  "src/pipeline/stageC/judgeProtocol.ts",
  // Added 2026-09-30: the one rule for an analyst estimate's or price
  // target's currency, read by both the Stage B valuation and the Stage C
  // payload registry (tests/currency.analystEstimates.test.ts).
  "src/pipeline/estimateCurrency.ts",
  // Added 2026-10-13 (D-45): the filing/transcript text matcher. It is an
  // acceptance path of the verifier — a number it matches is marked verified
  // — so it carries the verifier's per-file coverage floor.
  "src/pipeline/stageC/excerptNumbers.ts",
  // Added 2026-10-13 (review of D-50): the section-confidence ceiling, which
  // rewrites a model label at assembly; it was left out when D-50 added it.
  "src/pipeline/stageC/confidenceCeiling.ts",
  "src/edgar/financialEnrichment.ts",
  "src/edgar/debtCompleteness.ts",
  "src/edgar/debtPresentation.ts",
  "src/providers/companyEvents.ts",
  "src/providers/companyIr.ts",
  "src/pipeline/runInputSnapshot.ts",
  "src/pipeline/runInputSnapshotStore.ts",
  "src/pipeline/replayRunInput.ts",
  "src/pipeline/stageC/claimEvidence.ts",
  "src/pipeline/stageC/evidenceSelection.ts",
  "src/report/auditTables.ts",
  "src/report/financialDiagnostics.ts",
  "src/evaluation/evaluationContract.ts",
  "src/evaluation/evaluation.ts",
  "src/evaluation/targetDefinition.ts",
  "src/evaluation/artifactManifest.ts",
  "src/evaluation/pairedDiagnostics.ts",
  "src/evaluation/registry.ts",
  // Offline validation boundaries retain the same per-file evidence gate.
  "src/evaluation/claimBenchmark.ts",
  "src/evaluation/claimBenchmarkCli.ts",
  "src/report/forecastAdapter.ts",
  // Research reliability: eligibility, snapshot comparisons and deterministic
  // report claims carry the same per-file coverage floors as existing logic.
  "src/pipeline/peers.ts",
  "src/pipeline/peerFilings.ts",
  "src/report/evaluation.ts",
  "src/report/evaluationCli.ts",
  "src/report/researchReview.ts",
  "src/report/scenarioPresentation.ts",
  "src/report/thesisTriggers.ts",
  // Added 2026-10-15 (NVDA report #34 audit, work package 3): 8-K guidance,
  // issuer FCF, capital return, material events and XBRL segment revenue feed
  // registered payload numbers and the report, so they carry the same floor.
  "src/edgar/currentReports.ts",
  "src/edgar/filingFacts.ts",
  "src/edgar/segmentFacts.ts",
  "src/providers/currentReports.ts",
  "src/pipeline/filingDisclosures.ts",
  "src/report/filingDisclosurePresentation.ts",
  "src/report/filingSupplementPresentation.ts",
  // Added 2026-10-15 (D-62): the shared presentation rules, the audit export
  // and the provider market-data block feed every report surface.
  "src/report/presentation.ts",
  "src/report/export/auditMarkdown.ts",
  "src/pipeline/marketData.ts",
];
