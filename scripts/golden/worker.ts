/**
 * Same-report harness worker: one case, one process (spawned by scripts/golden/run.ts).
 *
 * Rebuilds a report from frozen local inputs with the code under ROOT, which may
 * be the working tree or an extracted commit, and writes every output the
 * comparison pins. Nothing here fetches, calls a model or opens the application
 * database: the network is blocked by offline-preload.mjs, the parent passes a
 * scratch METIS_DB_PATH/METIS_DATA_DIR inside the output folder, and inputs
 * arrive as files the parent exported read-only.
 *
 * The chain follows the job runner's order (src/pipeline/jobRunner.ts):
 * validate (fixed clock) -> Stage B with the validation report -> balance
 * integrity view -> Stage C payload -> either the data-only report (no analyst
 * output) or the stored synthesize output through the deterministic verify pass
 * -> the saved-report reader -> Markdown, print, audit Markdown and both web
 * layouts. The clock is pinned to the case's evidence time so a rerun is exact.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

/** The parent's instructions for one case. */
export interface GoldenWorkerJob {
  root: string;
  caseId: string;
  snapshotFile: string;
  analystFile?: string;
  analystJobId?: string;
  outDir: string;
}

/** What the worker reports back on stdout (one JSON line). */
export interface GoldenWorkerResult {
  caseId: string;
  route: string | null;
  overlays: string[];
  clock: string;
  payloadFingerprint: string;
  reportPath: "data-only" | "fixed-analyst";
  reportSchema: "ok" | "failed";
  readMode: string | null;
  files: Record<string, string>;
  notes: string[];
  ms: number;
}

/** Every output file a case writes, in manifest order. */
export const GOLDEN_FILES = [
  "stageB.json",
  "payload.txt",
  "report.json",
  "report.md",
  "print.html",
  "audit.md",
  "web-classic.html",
  "web-dossier.html",
] as const;

/** The report id the renderers are told they show; fixed so it never varies. */
const PRESENTED_REPORT_ID = 1;
const ANALYST_MODEL_LABEL = "golden-fixed-analyst";

/**
 * Pin `Date.now()` and argument-less `new Date()` to one instant. Explicit
 * dates are untouched. Installed before any product module is imported.
 */
function installFixedClock(iso: string): void {
  const fixed = Date.parse(iso);
  if (!Number.isFinite(fixed)) throw new Error(`golden worker: unusable clock ${iso}`);
  const RealDate = Date;
  const FixedDate = new Proxy(RealDate, {
    construct(target, args, newTarget) {
      return Reflect.construct(target, args.length === 0 ? [fixed] : args, newTarget);
    },
    apply() {
      return new RealDate(fixed).toString();
    },
    get(target, key, receiver) {
      if (key === "now") return () => fixed;
      return Reflect.get(target, key, receiver);
    },
  });
  globalThis.Date = FixedDate;
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

async function main(jobFile: string): Promise<void> {
  const started = performance.now();
  const job = JSON.parse(fs.readFileSync(jobFile, "utf8")) as GoldenWorkerJob;
  const rawSnapshot = JSON.parse(fs.readFileSync(job.snapshotFile, "utf8")) as { content?: { bundle?: { builtAt?: unknown } } };
  const clock = rawSnapshot.content?.bundle?.builtAt;
  if (typeof clock !== "string") throw new Error(`${job.caseId}: snapshot has no bundle.builtAt`);
  installFixedClock(clock);

  const load = <T>(rel: string): Promise<T> => import(pathToFileURL(path.join(job.root, rel)).href) as Promise<T>;
  const snapshots = await load<typeof import("../../src/pipeline/runInputSnapshot")>("src/pipeline/runInputSnapshot.ts");
  const { runStageB } = await load<typeof import("../../src/pipeline/compute")>("src/pipeline/compute.ts");
  const { validateBundle } = await load<typeof import("../../src/pipeline/stageA/validate")>("src/pipeline/stageA/validate.ts");
  const { balanceIntegrityView } = await load<typeof import("../../src/pipeline/balanceIntegrity")>("src/pipeline/balanceIntegrity.ts");
  const stageC = await load<typeof import("../../src/pipeline/stageC/index")>("src/pipeline/stageC/index.ts");
  const { payloadFingerprint, serializePayloadForPrompt } = await load<typeof import("../../src/pipeline/stageC/payload")>("src/pipeline/stageC/payload.ts");
  const { JUDGE_OUTPUT_SCHEMA, ReportSchema } = await load<typeof import("../../src/report/schema")>("src/report/schema.ts");
  const { buildDataOnlyReport, NO_KEY_SKIP_REASON } = await load<typeof import("../../src/pipeline/jobRunner")>("src/pipeline/jobRunner.ts");
  const { parseStoredReportWithSafety } = await load<typeof import("../../src/report/legacyEntitySafety")>("src/report/legacyEntitySafety.ts");
  const { reportToMarkdown } = await load<typeof import("../../src/report/export/markdown")>("src/report/export/markdown.ts");
  const { reportToPrintHtml } = await load<typeof import("../../src/report/export/printHtml")>("src/report/export/printHtml.ts");
  const { reportToAuditMarkdown } = await load<typeof import("../../src/report/export/auditMarkdown")>("src/report/export/auditMarkdown.ts");
  const { ReportView } = await load<typeof import("../../src/components/report/ReportView")>("src/components/report/ReportView.tsx");
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");

  const notes: string[] = [];
  const snapshot = snapshots.verifyRunInputSnapshot(rawSnapshot);
  const config = snapshot.content.stageBConfig;
  let bundle = structuredClone(snapshot.content.bundle) as typeof snapshot.content.bundle;
  const validation = validateBundle(bundle, { now: new Date() });
  const computed = runStageB(bundle, config, validation);
  bundle = balanceIntegrityView(bundle);
  const payload = stageC.pipelinePasses.assembleContextPayload(bundle, computed, validation);

  let report: unknown;
  let reportPath: GoldenWorkerResult["reportPath"];
  if (job.analystFile === undefined) {
    reportPath = "data-only";
    const profile = bundle.profile.ok ? bundle.profile.value.data.rows[0] : undefined;
    const companyName = typeof profile?.companyName === "string" && profile.companyName.length > 0 ? profile.companyName : bundle.symbol;
    report = buildDataOnlyReport({
      symbol: bundle.symbol,
      companyName,
      generatedAt: new Date().toISOString(),
      model: "none (no ANTHROPIC_API_KEY)",
      costUsd: 0,
      bundle,
      validation,
      computed,
      costBreakdown: [],
      execution: [],
      reason: NO_KEY_SKIP_REASON,
    });
  } else {
    reportPath = "fixed-analyst";
    const artifact = JSON.parse(fs.readFileSync(job.analystFile, "utf8")) as { outcome?: unknown; data?: unknown };
    if (artifact.outcome !== "success") throw new Error(`${job.caseId}: analyst artifact is not a success outcome`);
    const judge = JUDGE_OUTPUT_SCHEMA.safeParse(artifact.data);
    if (!judge.success) {
      const issues = judge.error.issues.slice(0, 3).map((issue) => `${issue.path.join(".")}:${issue.code}`).join(", ");
      throw new Error(`${job.caseId}: stored analyst output fails this commit's judge schema (${judge.error.issues.length} issues: ${issues})`);
    }
    const verified = await stageC.pipelinePasses.runVerifyPass(
      { analysisModel: ANALYST_MODEL_LABEL, payload, jobSeed: job.analystJobId, runGeneration: 0 },
      judge.data,
      { fetchedUrls: [] },
    );
    report = verified.verifiedReport;
  }
  const strict = ReportSchema.safeParse(report);
  if (!strict.success) notes.push(`report failed ReportSchema: ${strict.error.issues.length} issue(s)`);
  const reportJson = JSON.stringify(report);

  const outputs: Record<string, string> = {
    "stageB.json": `${snapshots.canonicalSnapshotJson(computed)}\n`,
    "payload.txt": serializePayloadForPrompt(payload),
    "report.json": `${JSON.stringify(report, null, 2)}\n`,
  };
  // Render what a reader sees: the stored JSON through the saved-report reader.
  const stored = parseStoredReportWithSafety(reportJson);
  if (stored === null) {
    notes.push("saved-report reader rejected the report; nothing rendered");
  } else {
    const context = { selectedReportId: PRESENTED_REPORT_ID };
    outputs["report.md"] = reportToMarkdown(stored.report, context);
    outputs["print.html"] = reportToPrintHtml(stored.report, context);
    outputs["audit.md"] = reportToAuditMarkdown(stored.report, context);
    for (const layout of ["classic", "dossier"] as const) {
      outputs[`web-${layout}.html`] = renderToStaticMarkup(React.createElement(ReportView, {
        report: stored.report,
        layout,
        headerNotices: true,
        selectedReportId: PRESENTED_REPORT_ID,
        selectedReportStatus: "done",
      }));
    }
  }

  fs.mkdirSync(job.outDir, { recursive: true });
  const files: Record<string, string> = {};
  for (const name of GOLDEN_FILES) {
    const text = outputs[name];
    if (text === undefined) continue;
    fs.writeFileSync(path.join(job.outDir, name), text, { flag: "wx" });
    files[name] = sha256(text);
  }
  const result: GoldenWorkerResult = {
    caseId: job.caseId,
    route: computed.route?.base ?? null,
    overlays: [...(computed.route?.overlays ?? [])],
    clock,
    payloadFingerprint: payloadFingerprint(payload),
    reportPath,
    reportSchema: strict.success ? "ok" : "failed",
    readMode: stored?.readMode ?? null,
    files,
    notes,
    ms: Math.round(performance.now() - started),
  };
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main(process.argv[2] ?? "").catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
