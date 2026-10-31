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
  "src/edgar/extract.ts",
  "src/edgar/xbrl.ts",
  "src/edgar/statements.ts",
  "src/edgar/instanceFacts.ts",
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
  "src/pipeline/keyless.ts",
  "src/pipeline/riskFreeFallback.ts",
  "src/pipeline/riskFreeSeries.ts",
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
  "src/report/gapResolution.ts",
  "src/report/assessment.ts",
  "src/report/earningsReferences.ts",
  "src/report/evidenceTiming.ts",
  "src/report/sourceFactPresentation.ts",
  "src/report/sourceFactSchema.ts",
  "src/report/sourceFacts.ts",
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
  "src/report/legacyImpliedReturnShareBasis.ts",
  "src/report/legacyValuationNotes.ts",
  "src/report/sectionManifest.ts",
  "src/report/surfaceManifest.ts",
  "src/report/export/correctedCli.ts",
  "src/report/export/markdown.ts",
  "src/report/export/markdownEscape.ts",
  "src/report/export/printHtml.ts",
  "src/report/format.ts",
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
  "src/report/researchReview.ts",
  "src/report/scenarioPresentation.ts",
  "src/report/thesisTriggers.ts",
  "src/edgar/currentReports.ts",
  "src/edgar/filingFacts.ts",
  "src/edgar/segmentFacts.ts",
  "src/edgar/segmentPerformance.ts",
  "src/edgar/economicShares.ts",
  "src/edgar/guidanceTables.ts",
  "src/edgar/annualGeography.ts",
  "src/pipeline/financialComposition.ts",
  "src/pipeline/stageB/leaseScope.ts",
  "src/providers/currentReports.ts",
  "src/pipeline/filingDisclosures.ts",
  "src/report/filingDisclosurePresentation.ts",
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
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
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
      [VITEST_CLI, "run", "--config", configFile, "--coverage", "--reporter=dot"],
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
