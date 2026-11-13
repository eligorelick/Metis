import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const read = (name: string) => readFileSync(path.join(ROOT, name), "utf8");
const trackedFiles = (root = ROOT) =>
  execFileSync("git", ["ls-files", "--cached", "-z"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\0")
    .filter((file) => file.length > 0)
    .sort();
const publicFiles = () => trackedFiles();

const REQUIRED_RELEASE_FILES = [
  "docs/audit/2026-11-08-grading-evidence-recovery.md",
  "docs/internal/superpowers/specs/2026-11-07-evidence-backed-report-remediation.md",
  "docs/audit/2026-11-07-evidence-backed-report-remediation.md",
  "docs/audit/2026-11-06-expe-report-1.md",
  "CODE_OF_CONDUCT.md",
  "docs/internal/README.md",
  "docs/ARCHIVE.md",
  "docs/audit/2026-11-03-valuation-inputs.md",
  "docs/audit/2026-11-03-valuation-coverage.md",
  "docs/audit/2026-11-03-q4-dcf-bias-study.md",
  "docs/audit/2026-11-02-r7-figr-xhigh-verifier.md",
  "docs/audit/2026-11-02-r1-figr-paid-audit.md",
  "docs/audit/2026-11-02-r5-figr-verifier.md",
  ".github/workflows/ci.yml",
  "docs/internal/superpowers/specs/2026-08-07-audit-remediation-design.md",
  "docs/audit/2026-10-27-audit-fix-03-payload-records.md",
  "docs/audit/2026-10-27-audit-b5-seasonality-calendars-dcf-inputs.md",
  "config/models.json",
  "scripts/build-sample-report.ts",
  "fixtures/report/DEMO-current.json",
  "fixtures/report/DEMO-current-charts.json",
  "scripts/check-dependency-shape.mjs",
  "scripts/models-refresh.mjs",
  "scripts/reconcile-presumed-costs.mjs",
  "scripts/docs-pricing.mjs",
  "scripts/docs-config.mjs",
  "scripts/freeze-refresh.mjs",
  "tests/fixtures/frozen/refresh-log.json",
  "scripts/run-security-audit.mjs",
  "tests/dependencyShape.test.ts",
  "tests/report.correctedCli.test.ts",
  "tests/risk.coverage.test.ts",
  "tests/risk.providers.coverage.test.ts",
  "tests/risk.runtime.coverage.test.ts",
  "tests/securityAudit.test.ts",
  "vitest.integration.config.ts",
  "vitest.risk.config.ts",
  "vitest.shared.ts",
] as const;
/**
 * Every tracked Markdown document. The design specs are kept as the record of
 * intent (each carries its deviations); the executed plans, the earlier audit
 * records, the README handover notes, the Phase 0 reconciliation and the
 * remediation progress board were retired by the audit of 2026-09-06, whose
 * record supersedes them.
 */
const ALLOWED_MARKDOWN = new Set([
  "docs/audit/2026-11-08-grading-evidence-recovery.md",
  "docs/internal/superpowers/specs/2026-11-07-evidence-backed-report-remediation.md",
  "docs/audit/2026-11-07-evidence-backed-report-remediation.md",
  "docs/audit/2026-11-06-expe-report-1.md",
  "CODE_OF_CONDUCT.md",
  "docs/internal/README.md",
  "docs/ARCHIVE.md",
  "docs/audit/2026-11-03-valuation-inputs.md",
  "docs/audit/2026-11-03-valuation-coverage.md",
  // R9's requested audit record is part of the tracked release documentation.
  "docs/audit/2026-11-03-q4-dcf-bias-study.md",
  "docs/audit/2026-11-02-r7-figr-xhigh-verifier.md",
  "docs/audit/2026-11-02-r1-figr-paid-audit.md",
  "docs/audit/2026-11-02-r5-figr-verifier.md",
  "README.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  ".github/PULL_REQUEST_TEMPLATE.md",
  "CHANGELOG.md",
  "docs/internal/superpowers/specs/2026-08-07-audit-remediation-design.md",
  "docs/internal/superpowers/specs/2026-08-09-provider-temporal-integrity-design.md",
  "docs/internal/superpowers/specs/2026-09-02-keyless-data-path-design.md",
  "docs/internal/superpowers/specs/2026-09-02-analysis-quality-design.md",
  "docs/internal/superpowers/audits/2026-09-06-full-codebase-audit.md",
  "docs/audit/DECISIONS.md",
  "docs/audit/REMEDIATION-REPORT.md",
  "docs/audit/2026-10-03-repository-audit.md",
  "docs/audit/2026-10-04-recommendations.md",
  "docs/audit/2026-10-17-expe-issue-disposition.md",
  "docs/audit/2026-10-17-safeguard-verification.md",
  "docs/audit/2026-10-17-book-to-code-disposition.md",
  "docs/audit/2026-10-17-ttm-eps-convention.md",
  "docs/audit/2026-10-17-preferred-payout-admission.md",
  "docs/audit/2026-10-18-common-earnings-admission.md",
  "docs/audit/2026-10-18-commitment-payment-evidence.md",
  "docs/audit/2026-10-18-accounting-evidence-remediation.md",
  "docs/audit/2026-10-19-phase-one-evidence-completion.md",
  "docs/audit/2026-10-19-first-report-remediation.md",
  "docs/audit/2026-10-19-phase-two-evidence-foundations.md",
  "docs/audit/2026-10-19-company-eligibility-affo.md",
  "docs/audit/2026-10-20-independent-audit-fixes.md",
  "docs/audit/2026-10-20-amzn-audit-fixes.md",
  "docs/audit/2026-10-20-amzn-deferred-fixes.md",
  "docs/audit/2026-10-22-audit-batch1-headline-numbers.md",
  "docs/audit/2026-10-22-audit-batch3a-priority-highs.md",
  "docs/audit/2026-10-22-security-audit-fixes.md",
  "docs/audit/2026-10-22-audit-batch2-valuation-domain.md",
  "docs/audit/2026-10-22-audit-batch2b-valuation-mediums.md",
  "docs/audit/2026-10-22-audit-batch3-complete-evidence.md",
  "docs/audit/2026-10-22-audit-batch4-freshness.md",
  "docs/audit/2026-10-22-audit-batch5-trust-signals.md",
  "docs/audit/2026-10-22-audit-batch6-provider-failures.md",
  "docs/audit/2026-10-27-audit-b6-financial-routes.md",
  "docs/audit/2026-10-27-audit-batch-b4-equity-bridge.md",
  "docs/audit/2026-10-27-audit-b5-seasonality-calendars-dcf-inputs.md",
  "docs/audit/2026-10-27-audit-batch-b13-edgar-derived-lines.md",
  "docs/audit/2026-10-27-audit-batch7-paid-spend-accounting.md",
  "docs/audit/2026-10-27-audit-fix-03-payload-records.md",
  "docs/audit/2026-10-27-audit-fix-01-claim-verifier-periods.md",
  "docs/audit/2026-10-27-audit-fix-02-claim-verifier-numbers.md",
  "docs/audit/2026-10-29-amzn51-lease-scope.md",
  "docs/audit/2026-10-30-qcom-report-53-integrity.md",
  "docs/PRIVACY.md",
  "docs/BRAND.md",
  "docs/CLAUDE-USAGE.md",
  "docs/DATA-RIGHTS.md",
  "docs/METHODOLOGY.md",
  "docs/OPERATIONS.md",
  // The evidence base the forensic code cites by section. `research §N` was
  // cited from three source files for months with no such document in the
  // repository; docs.lint now asserts every citation resolves to a heading.
  "docs/RESEARCH.md",
  "docs/REPORT-EVALUATION.md",
  "docs/VALIDATION-STATUS.md",
  "docs/internal/superpowers/specs/2026-10-27-audit-remediation-decisions.md",
  "docs/internal/superpowers/specs/2026-10-30-qcom-report-53-audit-design.md",
  "docs/internal/superpowers/specs/2026-10-31-research-reliability-design.md",
]);
const ALLOWED_GITHUB_FILES = new Set([
  ".github/workflows/ci.yml",
  ".github/PULL_REQUEST_TEMPLATE.md",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/feature_request.yml",
  ".github/ISSUE_TEMPLATE/data_issue.yml",
  ".github/ISSUE_TEMPLATE/config.yml",
]);
const VERIFY_GATES = [
  "npm run check:dependencies",
  "npm run typecheck",
  "npm run lint",
  // Not test:product: the core coverage run below is the same suite.
  "npm run test:integration",
  "npm run test:coverage",
  "npm run build",
  "npm run audit:security",
] as const;

function forbiddenReleaseFiles(files: readonly string[]): string[] {
  return files.filter((file) => {
    const lower = file.toLowerCase();
    if (file === ".env.example") return false;
    // Request-handler source, not a credential file or exported secret directory.
    if (file === "src/app/api/settings/credentials/route.ts") return false;
    // Ignore rules protect ordinary staging; the release boundary also rejects
    // force-added local sessions, credentials and generated launch artifacts.
    if (/(^|\/)(?:tmp|brag-output[^/]*|\.codex|\.t3)\//.test(lower) ||
      /(^|\/)(?:connections\.v1\.json(?:\..*)?|connections\.lock|runtime\.lock|csrf-token)$/.test(lower)) return true;
    if (lower.endsWith(".md") && !ALLOWED_MARKDOWN.has(file)) return true;
    if (lower.startsWith("docs/") && !ALLOWED_MARKDOWN.has(file)) return true;
    if (lower.startsWith(".github/") && !ALLOWED_GITHUB_FILES.has(file)) {
      return true;
    }
    return /(^|\/)(audit_prompt(?:\.md)?|credentials(?:\.json)?|id_rsa|\.npmrc|\.netrc|research\/|\.env($|\.)|data\/|\.next\/|build\/|out\/|dist\/|node_modules\/|coverage\/|\.claude\/|\.superpowers\/|\.playwright-mcp\/|\.worktrees\/)|\.(?:(?:db3?|sqlite3?)(?:$|-)|tsbuildinfo$|pem$|key$|p12$|pfx$)/i.test(
      file,
    );
  });
}

function unsafePublicDocument(document: string): string[] {
  const findings: string[] = [];
  if (
    /(?:[A-Z]:[\\/]Users[\\/][^\\/\s"']+|(?:^|[\s"'`=(])\/(?:Users|home)\/[^/\s"']+|~[\\/])/i.test(
      document,
    )
  ) {
    findings.push("absolute home path");
  }
  if (
    /(?:sk-ant-|ghp_|github_pat_|Bearer\s+[A-Za-z0-9._-]{12,}|(?:API_KEY|TOKEN|PASSWORD)["']?\s*[:=]\s*["']?(?!<|\$|your-|example|placeholder)[A-Za-z0-9._-]{12,})/i.test(
      document,
    )
  ) {
    findings.push("credential value");
  }
  return findings;
}

function listedTests(config: string): string[] {
  const raw = execFileSync(
    process.execPath,
    [
      path.join(ROOT, "node_modules", "vitest", "vitest.mjs"),
      "list",
      "--config",
      config,
      "--filesOnly",
      "--json",
      "--staticParse",
    ],
    { cwd: ROOT, encoding: "utf8" },
  );
  const listed = JSON.parse(raw) as Array<{ file: string }>;
  return listed
    .map(({ file }) => path.relative(ROOT, file).replaceAll("\\", "/"))
    .sort();
}

interface LoadedVitestConfig {
  test?: {
    include?: string[];
    exclude?: string[];
    pool?: string;
    isolate?: boolean;
    fileParallelism?: boolean;
    maxWorkers?: number | string;
    testTimeout?: number;
    retry?: number;
    coverage?: {
      provider?: string;
      include?: string[];
      reportsDirectory?: string;
      thresholds?: Record<string, number | boolean>;
    };
  };
  resolve?: { alias?: Record<string, string> };
}

interface LoadedSharedVitestConfig {
  DB_CLI_TEST: string;
  PRODUCT_TEST_INCLUDE: string[];
  PRODUCT_TEST_EXCLUDE: string[];
  INTEGRATION_TEST_INCLUDE: string[];
  SHARED_RESOLVE_ALIAS: Record<string, string>;
}

async function loadVitestConfig(config: string): Promise<LoadedVitestConfig> {
  const moduleUrl = pathToFileURL(path.join(ROOT, config)).href;
  const loaded = (await import(moduleUrl)) as { default: LoadedVitestConfig };
  return loaded.default;
}

async function loadSharedVitestConfig(): Promise<LoadedSharedVitestConfig> {
  const moduleUrl = pathToFileURL(path.join(ROOT, "vitest.shared.ts")).href;
  return (await import(moduleUrl)) as LoadedSharedVitestConfig;
}

interface WorkflowStep {
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
  shell?: string;
  if?: unknown;
}

interface WorkflowJob {
  needs?: string[];
  if?: string;
  "runs-on"?: string;
  "timeout-minutes"?: number;
  permissions?: unknown;
  steps?: WorkflowStep[];
}

interface ParsedWorkflow {
  name?: string;
  on?: unknown;
  permissions?: unknown;
  concurrency?: unknown;
  jobs?: Record<string, WorkflowJob>;
}

async function parseWorkflow(source: string): Promise<ParsedWorkflow> {
  const moduleName = "js-yaml";
  const yaml = (await import(moduleName)) as {
    load(value: string): unknown;
  };
  return yaml.load(source) as ParsedWorkflow;
}

describe("public release contract", () => {
  it("uses canonical GitHub metadata and loopback-only server scripts", () => {
    const pkg = JSON.parse(read("package.json")) as {
      name: string;
      homepage: string;
      repository: { url: string };
      bugs: { url: string };
      scripts: Record<string, string>;
    };

    expect(pkg.name).toBe("metis");
    expect(pkg.homepage).toBe(
      "https://metis.eligorelick.com",
    );
    expect(pkg.repository.url).toBe(
      "git+https://github.com/eligorelick/Metis.git",
    );
    expect(pkg.bugs.url).toBe(
      "https://github.com/eligorelick/Metis/issues",
    );
    expect(pkg.scripts.dev).toBe("next dev -H 127.0.0.1");
    expect(pkg.scripts.start).toBe("next start -H 127.0.0.1");
    expect(pkg.scripts["export:corrected"]).toBe(
      "tsx src/report/export/correctedCli.ts",
    );
    expect(pkg.scripts).not.toHaveProperty("verify:live");
    expect(pkg.scripts).not.toHaveProperty("verify:tickers");
  });

  it("defines the exact fail-closed local CI gate order", () => {
    const pkg = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
    };

    expect(pkg.scripts).toMatchObject({
      "check:dependencies": "node scripts/check-dependency-shape.mjs",
      "test:product": "vitest run --config vitest.config.ts",
      "test:changed": "vitest run --config vitest.config.ts --changed origin/main --passWithNoTests",
      "test:integration": "vitest run --config vitest.integration.config.ts",
      "test:coverage:core":
        "vitest run --config vitest.config.ts --coverage",
      "test:coverage:risk":
        "vitest run --config vitest.risk.config.ts --coverage",
      "test:coverage":
        "vitest run --config vitest.coverage.config.ts --coverage && node --import tsx scripts/check-coverage.ts",
      "audit:security": "node scripts/run-security-audit.mjs",
    });
    expect(pkg.scripts.verify).toBe(VERIFY_GATES.join(" && "));
    expect(pkg.scripts["audit:security"]).not.toMatch(
      /\|\||continue-on-error|--omit=dev/i,
    );
  });

  it("partitions every tracked test through the real static Vitest CLI", () => {
    for (const config of [
      "vitest.config.ts",
      "vitest.risk.config.ts",
      "vitest.integration.config.ts",
    ]) {
      expect(existsSync(path.join(ROOT, config)), `${config} must exist`).toBe(
        true,
      );
    }

    const tracked = publicFiles().filter((file) =>
      /^tests\/.+\.test\.ts$/.test(file),
    );
    const dbCli = "tests/db.cli.test.ts";
    const expectedProduct = tracked.filter((file) => file !== dbCli);
    const product = listedTests("vitest.config.ts");
    const risk = listedTests("vitest.risk.config.ts");
    const integration = listedTests("vitest.integration.config.ts");

    expect(product).toEqual(expectedProduct);
    expect(risk).toEqual(expectedProduct);
    expect(integration).toEqual([dbCli]);
    expect(product.filter((file) => integration.includes(file))).toEqual([]);
    expect([...new Set([...product, ...integration])].sort()).toEqual(tracked);
  }, 30_000);

  it("uses isolated forks, shared aliases, and deterministic coverage artifacts", async () => {
    const shared = await loadSharedVitestConfig();
    const product = await loadVitestConfig("vitest.config.ts");
    const risk = await loadVitestConfig("vitest.risk.config.ts");
    const integration = await loadVitestConfig("vitest.integration.config.ts");

    for (const config of [product, risk, integration]) {
      expect(config.test?.pool).toBe("forks");
      expect(config.test?.isolate).toBe(true);
    }
    expect(shared.DB_CLI_TEST).toBe("tests/db.cli.test.ts");
    expect(product.test?.include).toBe(shared.PRODUCT_TEST_INCLUDE);
    expect(risk.test?.include).toBe(shared.PRODUCT_TEST_INCLUDE);
    expect(product.test?.exclude).toBe(shared.PRODUCT_TEST_EXCLUDE);
    expect(risk.test?.exclude).toBe(shared.PRODUCT_TEST_EXCLUDE);
    expect(integration.test?.include).toBe(shared.INTEGRATION_TEST_INCLUDE);
    expect(product.test?.maxWorkers).toBe("50%");
    expect(risk.test?.maxWorkers).toBe("50%");
    expect(product.resolve?.alias).toBe(shared.SHARED_RESOLVE_ALIAS);
    expect(risk.resolve?.alias).toBe(shared.SHARED_RESOLVE_ALIAS);
    expect(integration.resolve?.alias).toBe(shared.SHARED_RESOLVE_ALIAS);
    expect(product.test?.exclude).toEqual(["tests/db.cli.test.ts"]);
    expect(risk.test?.exclude).toEqual(["tests/db.cli.test.ts"]);
    expect(integration.test).toMatchObject({
      include: ["tests/db.cli.test.ts"],
      fileParallelism: false,
      maxWorkers: 1,
      testTimeout: 15_000,
      retry: 0,
    });
    expect(risk.resolve?.alias).toEqual(product.resolve?.alias);
    expect(integration.resolve?.alias).toEqual(product.resolve?.alias);
    expect(product.resolve?.alias).toEqual({
      "@": path.join(ROOT, "src"),
      "server-only": path.join(ROOT, "tests", "server-only.mock.ts"),
    });
    expect(product.test?.coverage).toMatchObject({
      provider: "v8",
      include: ["src/pipeline/stageB/**/*.ts", "src/report/schema.ts"],
      reportsDirectory: "coverage/core",
      thresholds: {
        statements: 90,
        branches: 84,
        functions: 95,
        lines: 93,
      },
    });
    expect(risk.test?.coverage).toMatchObject({
      provider: "v8",
      reportsDirectory: "coverage/risk",
      thresholds: {
        statements: 85,
        branches: 75,
        functions: 85,
        lines: 85,
        perFile: true,
        autoUpdate: false,
      },
    });
  });

  it("keeps the workflow in exact verify parity across supported lanes", async () => {
    const workflowSource = read(".github/workflows/ci.yml");
    const workflow = await parseWorkflow(workflowSource);
    const full = workflow.jobs?.full;
    const checks = workflow.jobs?.checks;
    const product = workflow.jobs?.product;
    const windows = workflow.jobs?.["windows-smoke"];
    // @v5 as of 2026-09-03. The v4 actions target the Node 20 runtime, which
    // GitHub deprecated; every run was printing a warning and being forced onto
    // Node 24 anyway. Pinning the major version here is deliberate — a silent
    // bump is how a supply chain moves under you — so this line is the record
    // that the change was made and why.
    const expectedSteps = (nodeVersion: number, commands: readonly string[]) => [
      { uses: "actions/checkout@v5" },
      {
        uses: "actions/setup-node@v5",
        with: { "node-version": nodeVersion, cache: "npm" },
      },
      ...commands.map((run) => ({ run })),
    ];

    expect(workflow.name).toBe("CI");
    expect(workflow.on).toEqual({ push: { branches: ["main"] }, pull_request: null });
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(workflow.concurrency).toEqual({
      group: "${{ github.workflow }}-${{ github.ref }}",
      "cancel-in-progress": true,
    });
    // Node 20 reached end-of-life in April 2026 and its lane was retired on
    // 2026-09-01: the test harness spawns TypeScript workers and eval scripts
    // that depend on Node 24's native type stripping, so the lane could never
    // pass and no longer describes a supported runtime.
    expect(Object.keys(workflow.jobs ?? {}).sort()).toEqual(["checks", "full", "product", "windows-smoke"]);
    expect(full).toMatchObject({ "runs-on": "ubuntu-latest", needs: ["checks", "product"], if: "always()" });
    expect(full?.steps).toEqual([{ run: "test '${{ needs.checks.result }}' = success && test '${{ needs.product.result }}' = success" }]);
    expect(windows).toMatchObject({
      "runs-on": "windows-latest",
      "timeout-minutes": 45,
    });
    for (const job of [checks, product, windows]) {
      expect(job?.permissions).toBeUndefined();
      for (const step of job?.steps ?? []) {
        expect(step.if).toBeUndefined();
        expect(step.shell).toBeUndefined();
      }
    }
    const testGates = ["npm run test:integration", "npm run test:coverage"];
    expect(checks?.steps).toEqual(expectedSteps(24, ["npm ci", ...VERIFY_GATES.filter(command => !testGates.includes(command))]));
    expect(product?.steps).toEqual(expectedSteps(24, ["npm ci", ...testGates]));
    expect(workflowSource).not.toMatch(/node-version:\s*20\b/);
    expect(windows?.steps).toEqual(
      expectedSteps(24, [
        "npm ci",
        "npm run test:product",
        "npm run test:integration",
      ]),
    );
    expect(workflowSource).not.toMatch(
      /continue-on-error|:\s*write(?:-all)?\b|\$\{\{\s*secrets\.|^\s*(?:env|defaults|shell):\s*|ANTHROPIC_API_KEY|FMP_API_KEY|FINNHUB_API_KEY|FRED_API_KEY|EDGAR_CONTACT|verify:live|node_modules|\|\|\s*true|;\s*exit\s+0/im,
    );
  });

  it("keeps approved public docs free of home paths and credential values", () => {
    const approvedDocs = publicFiles().filter((file) => ALLOWED_MARKDOWN.has(file));
    for (const file of approvedDocs) {
      expect(unsafePublicDocument(read(file)), file).toEqual([]);
    }

    expect(unsafePublicDocument("home: C:\\Users\\alice\\private\\file.md")).toEqual([
      "absolute home path",
    ]);
    expect(unsafePublicDocument("watchlist/home/history")).toEqual([]);
    expect(unsafePublicDocument("path: /home/alice/private")).toEqual([
      "absolute home path",
    ]);
    expect(unsafePublicDocument("token: ghp_1234567890abcdef")).toEqual([
      "credential value",
    ]);
    expect(
      unsafePublicDocument('{"ANTHROPIC_API_KEY":"abcdefghijklmnop"}'),
    ).toEqual(["credential value"]);
    expect(unsafePublicDocument("PASSWORD: abcdefghijklmnop")).toEqual([
      "credential value",
    ]);
  });

  // The engines floor was 22.18 (WS9, D-22) while the suite was only known to
  // pass on Node 24, the one version CI runs; the floor is now 24 so the
  // supported range is the tested one (2026-10-22 audit, F-10). The facts that
  // matter are pinned: the package engine floor equals every CI lane's Node,
  // the README states it, and branch protection is a human step.
  it("documents the supported Node versions and branch protection", async () => {
    const readme = read("README.md");
    const pkg = JSON.parse(read("package.json")) as { engines: { node: string } };
    const lock = JSON.parse(read("package-lock.json")) as { packages: Record<string, { engines?: { node: string } }> };
    expect(pkg.engines.node).toBe(">=24");
    expect(lock.packages[""]?.engines?.node).toBe(pkg.engines.node);
    const workflow = await parseWorkflow(read(".github/workflows/ci.yml"));
    // Jobs without setup-node (lint-only helpers) have no lane; a setup-node
    // step without an explicit node-version fails the comparison below.
    const lanes = Object.values(workflow.jobs ?? {})
      .map((job) => job.steps?.find((step) => step.uses?.startsWith("actions/setup-node")))
      .filter((step) => step !== undefined)
      .map((step) => step.with?.["node-version"]);
    expect(lanes.length).toBeGreaterThan(0);
    for (const lane of lanes) expect(`>=${lane}`).toBe(pkg.engines.node);
    expect(readme).toContain(`Node.js ${pkg.engines.node.slice(2)} or newer`);
    expect(readme).not.toMatch(/Node(?:.js)? 22/);
    expect(readme).toMatch(/CI tests Node 24/);
    expect(readme).not.toContain("compatibility lane");
    expect(readme).toMatch(/Protect `main` by requiring\s+the `full` and `windows-smoke` checks/);
  });

  it("publishes only the exact tracked release allowlist", () => {
    const files = publicFiles();

    for (const required of REQUIRED_RELEASE_FILES) {
      expect(files).toContain(required);
    }
    expect(forbiddenReleaseFiles(files)).toEqual([]);
  });

  // A stray `=` line (a pasted-in fragment) silently ignored any file named
  // "=" (2026-10-22 audit, F-11). Every pattern must name something.
  it("keeps every .gitignore line a comment, a blank, or a real pattern", () => {
    const stray = read(".gitignore")
      .split(/\r?\n/)
      .filter((line) => line.trim() !== "" && !line.startsWith("#"))
      .filter((line) => !/[A-Za-z0-9*.]/.test(line));
    expect(stray).toEqual([]);
  });

  it("ignores unrelated untracked files but rejects the same paths if tracked", () => {
    const tempRepo = mkdtempSync(path.join(os.tmpdir(), "metis-release-index-"));
    try {
      execFileSync("git", ["init", "--quiet"], { cwd: tempRepo });
      writeFileSync(path.join(tempRepo, ".gitignore"), "*.md\n", "utf8");
      writeFileSync(
        path.join(tempRepo, "user-owned.md"),
        "user-owned and intentionally untracked\n",
        "utf8",
      );
      expect(trackedFiles(tempRepo)).not.toContain("user-owned.md");

      execFileSync("git", ["add", "-f", "user-owned.md"], { cwd: tempRepo });
      const forceTracked = trackedFiles(tempRepo);
      expect(forceTracked).toContain("user-owned.md");
      expect(forbiddenReleaseFiles(forceTracked)).toContain("user-owned.md");
    } finally {
      rmSync(tempRepo, { recursive: true, force: true });
    }

    expect(
      forbiddenReleaseFiles([
        "AUDIT_PROMPT.md",
        "docs/unknown.md",
        "Docs/case-variant.MD",
        ".github/workflows/unknown.yml",
        ".GITHUB/workflows/case-variant.yml",
        ".superpowers/private.md",
        "data/local.db",
        "local.sqlite",
        "local.sqlite3",
        "local.db3",
        "local.db3-wal",
        "local.sqlite-journal",
        "local.sqlite3-shm",
        "build/output.js",
        "coverage/risk/coverage-summary.json",
        "tmp/live-report.json",
        "brag-output/brag.mp4",
        "brag-output-2026-10-23-105933/share-copy.txt",
        ".codex/session.json",
        ".t3/session.json",
        "connections.v1.json",
        "connections.v1.json.pending.tmp",
        "connections.lock",
        "runtime.lock",
        "csrf-token",
        "credentials.json",
        "certs/private.pem",
        "certs/private.key",
        "certs/private.p12",
        "certs/private.pfx",
        ".npmrc",
        ".netrc",
        "ssh/id_rsa",
      ]),
    ).toEqual([
      "AUDIT_PROMPT.md",
      "docs/unknown.md",
      "Docs/case-variant.MD",
      ".github/workflows/unknown.yml",
      ".GITHUB/workflows/case-variant.yml",
      ".superpowers/private.md",
      "data/local.db",
      "local.sqlite",
      "local.sqlite3",
      "local.db3",
      "local.db3-wal",
      "local.sqlite-journal",
      "local.sqlite3-shm",
      "build/output.js",
      "coverage/risk/coverage-summary.json",
      "tmp/live-report.json",
      "brag-output/brag.mp4",
      "brag-output-2026-10-23-105933/share-copy.txt",
      ".codex/session.json",
      ".t3/session.json",
      "connections.v1.json",
      "connections.v1.json.pending.tmp",
      "connections.lock",
      "runtime.lock",
      "csrf-token",
      "credentials.json",
      "certs/private.pem",
      "certs/private.key",
      "certs/private.p12",
      "certs/private.pfx",
      ".npmrc",
      ".netrc",
      "ssh/id_rsa",
    ]);
  });

  it("keeps only referenced EDGAR test samples in the fixtures boundary", () => {
    const files = publicFiles();
    const edgarFixtures = files.filter((file) =>
      file.startsWith("fixtures/edgar/"),
    );
    const edgarTests = [
      read("tests/edgar.client.test.ts"),
      read("tests/edgar.extract.test.ts"),
      read("tests/edgar.sectionRecovery.test.ts"),
      read("tests/edgar.xbrl.test.ts"),
      // WS4: the hand-built three-class companyfacts payload the multi-class
      // share-count tests read.
      read("tests/edgar.statements.test.ts"),
      // WS4: the hand-built 8-K12B submission header the successor-registrant
      // tests read.
      read("tests/edgar.successor.test.ts"),
      // WS4 follow-up: the four RECORDED xom_successor_* payloads, and the
      // end-to-end scan that reads them.
      read("tests/dataBundle.successor.test.ts"),
      // NVDA report #34 audit, WP3: the nine recorded NVDA 8-K exhibit, 8-K
      // item and XBRL instance/label samples the current-report parsers read.
      // D-63 adds three: the Q2 FY2027 CFO commentary (EX-99.2) and the
      // extracted 10-K Item 1 and 10-Q notes text (nvda-periodic-sections).
      read("tests/currentReports.test.ts"),
      // D-74: the overlapping CRWV option clause and full retained NVDA issuance section.
      read("tests/currentReports.principalAggregation.test.ts"),
      // D-66: extracted annual notes, interim statements/Item 2/Item 5 and governance/commentary samples.
      read("tests/edgar.filingFacts.test.ts"),
      read("tests/edgar.debtPresentation.test.ts"),
      // D-87: public restriction and debt-carrying reconciliations.
      read("tests/financialComposition.cashScope.test.ts"),
      read("tests/edgar.debtNoteCarrying.test.ts"),
      // R8: the public acquisition-closing item exercises bounded lifecycle context.
      read("tests/stageC.eventContextBudget.test.ts"),
        // D-79: thirteen recorded EXPE facts prove a partial subtotal is not total operating expenses.
        read("tests/edgar.operatingExpenseScope.test.ts"),
      // Independent audit 2026-10-19: five trimmed live-run companyfacts payloads.
      read("tests/audit.issuerFixtures.test.ts"),
      // D-236: TSMC's fiscal 2025 Form 20-F XBRL instance, trimmed, and SEC's
      // companyfacts for TSMC as stored on 2026-11-12, reduced to the same concepts.
      read("tests/edgar.instanceFallback.test.ts"),
      // D-257: JPMorgan's revenue lines from SEC companyfacts (five tags, fiscal 2019 to the 2026 third quarter).
      read("tests/financialIncomeClassification.bankRevenue.test.ts"),
    ].join("\n");

    // D-87 adds only the referenced public cash and carrying-debt fixtures;
    // the 2026-10-19 independent audit adds five issuer companyfacts.
    // R8 adds one referenced public 8-K item; D-171 one trimmed public TSMC 20-F
    // excerpt (unlettered Risk Factors); Q6 adds eight trimmed public annual
    // section layouts; D-236 two public SEC extracts for one TSMC 20-F; D-257
    // one public SEC companyfacts extract for JPMorgan's revenue lines. No
    // private run artifact is shipped.
    expect(edgarFixtures).toHaveLength(64);
    for (const fixture of edgarFixtures) {
      expect(edgarTests).toContain(path.basename(fixture));
    }
  });

  it("contains no source or test references to deleted internal documents", () => {
    const files = publicFiles().filter(
      (file) =>
        /^(src|tests)\/.+\.(?:ts|tsx)$/.test(file) &&
        file !== "tests/repository.release.test.ts",
    );
    const implementationText = files.map((file) => read(file)).join("\n");
    const removedDocNames = [
      "AGENTS",
      "CLAUDE",
      "COST",
      "DATA_MAP",
      "SPEC",
    ]
      .map((name) => `${name}\\.md`)
      .join("|");

    expect(implementationText).not.toMatch(new RegExp(removedDocNames));
    expect(implementationText).not.toMatch(/research[\\/]/);
  });

  it("records every methodology and frozen-record refresh decision in the decisions ledger", () => {
    const decisions = readFileSync(path.join(ROOT, "docs/audit/DECISIONS.md"), "utf8");
    const recorded = new Set([...decisions.matchAll(/^## D-(\d+)\b/gm)].map(match => Number(match[1])));
    for (const file of ["docs/METHODOLOGY.md", "tests/fixtures/frozen/refresh-log.json"]) {
      const text = readFileSync(path.join(ROOT, file), "utf8");
      for (const match of text.matchAll(/\bD-(\d+)\b/g)) {
        expect(recorded.has(Number(match[1])), `${file} cites unrecorded ${match[0]}`).toBe(true);
      }
    }
  });

  // Both documents said no live ChatGPT or Gemini inference had been verified,
  // after complete reports had run live through a ChatGPT connection (reports
  // #40 to #45, October 2026; audit DOC-1, deferred under D-97 item 17,
  // corrected on 2026-10-22). The Gemini route was removed on 2026-11-09.
  // One complete report ran live through the local Claude Code route on
  // 2026-11-12; both documents say so, and no more than that.
  it("states which subscription connection has run live inference", () => {
    for (const name of ["README.md", "docs/PRIVACY.md"]) {
      const prose = read(name).replace(/\s+/g, " ");
      expect(prose, name).not.toMatch(/live inference has not been verified/);
      expect(prose, name).not.toMatch(/ChatGPT or Gemini account has not been verified/);
      expect(prose, name).toContain("run live through a ChatGPT connection");
      expect(prose, name).not.toMatch(/live Claude Code[^.]* has not been verified/);
      expect(prose, name).toContain("One complete report has run live through a Claude Code subscription connection");
      expect(prose, name).toContain("2026-11-12, Claude Code 2.1.322");
      expect(prose, name).toContain("One run is not a guarantee");
      expect(prose, name).not.toMatch(/Claude Code[^.]* has been verified/);
    }
  });

  // docs/CLAUDE-USAGE.md listed every report connection except Claude Code.
  // Its row now names the one live run (2026-11-12) and the limits section
  // keeps that run's honest limits.
  it("lists the Claude Code connection in the usage guide with its one live run and limits", () => {
    const row = read("docs/CLAUDE-USAGE.md").split("\n").find((line) => line.startsWith("| Claude Code |")) ?? "";
    expect(row).toContain("`$0` API cost");
    expect(row).toContain("`claude auth login`");
    expect(row).toContain("One complete report has run live through this route (2026-11-12");
    expect(row).toContain("the CLI does not report the effort it used");
    expect(row).not.toMatch(/\bhas been verified\b/);
    const prose = read("docs/CLAUDE-USAGE.md").replace(/\s+/g, " ");
    expect(prose).toContain("One complete report has run live through the Claude Code route.");
    expect(prose).toContain("Claude Code 2.1.322");
    expect(prose).toContain("reported as `claude-opus-5-5`");
    expect(prose).toContain("Metis recorded $0 API cost");
    expect(prose).toContain("did no web research");
    expect(prose).toContain("One run is not a guarantee.");
    expect(prose).toContain("Metis cannot read remaining allowance");
  });

  // src/ai/store.ts aiDirectory() reads LOCALAPPDATA on Windows and ignores
  // METIS_DATA_DIR, so a test on a database copy must redirect it as well.
  it("tells testers on a copy to redirect the AI store", () => {
    const store = read("src/ai/store.ts");
    expect(store).toContain("process.env.LOCALAPPDATA");
    expect(store).not.toContain("METIS_DATA_DIR");
    const operations = read("docs/OPERATIONS.md").replace(/\s+/g, " ");
    expect(operations).toContain("A test on a copy must redirect that store too: on Windows it follows `LOCALAPPDATA`");
  });

  // The simulated demo page kept a Gemini provider option after the Gemini
  // route was removed (#123); it lists only the providers the app offers.
  it("lists no removed provider on the simulated demo page", () => {
    const page = read("public/audit-ui/app.js");
    expect(page).not.toMatch(/gemini/i);
    const select = /<select id="ai">(.*?)<\/select>/.exec(page)?.[1] ?? "";
    expect([...select.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1])).toEqual(["none", "chatgpt", "claude"]);
  });

  it("documents setup, privacy, safety, and verification in README", () => {
    const readme = read("README.md");
    const prose = readme.replace(/\s+/g, " ");

    for (const required of [
      "/report/sample",
      "/company/DEMO",
      "reserved strings",
      "not investment advice",
      "127.0.0.1",
      "providers you configure",
      "npm ci",
      "npm run verify",
    ]) {
      expect(prose).toContain(required);
    }
    // The rewrite moved the egress and key-handling detail into the document
    // that now owns it, and the README links there rather than paraphrasing.
    // The guarantee itself is still pinned, just where it is now stated.
    expect(prose).toContain("docs/PRIVACY.md");
    expect(read("docs/PRIVACY.md")).toContain("never reach the browser");

    expect(readme).not.toMatch(
      /verify:live|verify:tickers|\.github\/|(?:^|[\s`(])research\//im,
    );
  });

  it("labels keyless data as synthetic and keeps synthetic artifacts fictional", () => {
    const home = read("src/app/page.tsx");
    const settings = [
      read("src/app/settings/page.tsx"),
      read("src/app/settings/SettingsPageView.tsx"),
      read("src/app/settings/ProviderCredentials.tsx"),
    ].join("\n");
    const company = read("src/app/company/[symbol]/page.tsx");
    const implementationNotes = [
      read("src/pipeline/dataBundle.ts"),
      read("src/providers/fmp.ts"),
    ].join("\n");

    for (const copy of [home, settings]) {
      expect(copy.toLowerCase()).toContain("synthetic fixture mode");
      expect(copy).toContain("/company/DEMO");
      expect(copy).toContain("DBNK");
      expect(copy.toLowerCase()).toContain("no current market data");
    }
    expect(company).toContain("/company/DEMO");
    expect(company).not.toContain("/company/AAPL");
    expect(implementationNotes).toContain("synthetic contract fixtures");

    const syntheticFiles = publicFiles().filter(
      (file) => file.startsWith("fixtures/fmp/") || file.startsWith("fixtures/report/"),
    );
    const syntheticText = syntheticFiles.map((file) => read(file)).join("\n");
    expect(syntheticText).not.toMatch(
      /Apple Inc\.|\bAAPL\b|Timothy D\. Cook|Cupertino|0000320193|416[,.]?161|182[,.]?447|232\.8|verbatim (sample|response)/i,
    );
  });

  it("publishes only the explicitly synthetic report fixture", () => {
    const reportFixtures = publicFiles().filter((file) =>
      file.startsWith("fixtures/report/"),
    );

    expect(reportFixtures).toEqual(["fixtures/report/DEMO-current-charts.json", "fixtures/report/DEMO-current.json", "fixtures/report/DEMO-sample.json"]);
  });
});

it("P4-8 keeps lifecycle decisions and operating notes under their owning headings", () => {
  const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");
  const blockBetween = (text: string, start: string, end: string) => text.slice(text.indexOf(start), text.indexOf(end, text.indexOf(start)));
  const decisions = read("docs/audit/DECISIONS.md");
  expect(decisions.indexOf("Entries are dated design history")).toBeLessThan(decisions.indexOf("## D-143 - P4:"));
  expect(decisions).toMatch(/## D-143 - P4:.*2026-11-02/);
  const ops = read("docs/OPERATIONS.md");
  expect(blockBetween(ops, "## Report lifecycle and recovery", "## Local HTTP API")).toContain("Fresh pages observe active work first.");
  expect(blockBetween(ops, "## Verification and troubleshooting", "## Immutable run inputs")).toContain("runtime.lock");
  const privacy = read("docs/PRIVACY.md");
  expect(privacy.indexOf("AI-115:")).toBeLessThan(privacy.indexOf("## Limited FMP access"));
  const methodology = read("docs/METHODOLOGY.md");
  expect(blockBetween(methodology, "## Stage A checks and report verification", "## Disclaimer scope")).toContain("AI-110:");
  const scheduler = read("src/pipeline/jobScheduler.ts");
  expect(scheduler).toMatch(/transient[^]*?\*\/\s*export function isTransientWriterLock/);
  const frozenLine = read("src/pipeline/jobRunner.ts").split("\n").find(line => line.includes("frozenInputDetail = `reused frozen inputs"));
  expect(frozenLine).not.toContain("\u2014");
  expect(frozenLine).toContain("\\u2014");
});
