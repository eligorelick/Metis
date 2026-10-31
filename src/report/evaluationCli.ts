/** Read-only inputs, no database/provider access; exclusively creates outputs. */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { EvaluationStudyProtocolSchema, StudyOutcomesSchema } from "./evaluationStudy";
import { initializeEvaluationStudy, enrollEvaluationStudyReport, evaluateStoredStudy, writeNewEvaluationJson } from "./evaluationStudyStore";

import {
  createEvaluationSnapshot,
  evaluateReportSnapshot,
  EvaluationDefinitionSchema,
  EvaluationOutcomeSchema,
  EvaluationOutcomesSchema,
} from "./evaluation";

const HELP = `Offline report evaluation (no provider calls or database writes)

  reports:evaluate freeze --report report.json --definition definition.json [--out-dir directory]
  reports:evaluate evaluate --snapshot snapshot.json --outcomes outcomes.json --as-of YYYY-MM-DD [--out result.json]
  reports:evaluate schema
  reports:evaluate study-init --protocol protocol.json --dir study-directory
  reports:evaluate study-register --dir study-directory --slot slot-id --report report.json
  reports:evaluate study-evaluate --dir study-directory --outcomes study-outcomes.json --as-of YYYY-MM-DD [--out result.json]

Snapshots default to data/evaluations/snapshots/<content-hash>.json.
Results default to data/evaluations/results/<snapshot-hash>-<as-of>-<outcomes-hash>.json.
Existing files are never overwritten. Input JSON is never modified.
Run schema for the complete definition and outcome JSON contracts.

Operating selections identify metric, scenario and exact periodLabel in report.projections.
Explicit fiscal dates are required; FY labels alone do not establish dates.
FCF basis must be "unlevered-FCFF". EPS basis must be "diluted-EPS;share-basis=<basis>".
Actual outcome metadata must match the registered identity, period, unit, currency and basis.
Market startDate must follow report asOf; choose the actual session dates explicitly.
Price returns and total-return indices must use consistent adjustments for both legs.
DCF present values are never registered as future price forecasts.
Studies predeclare every report slot and optional baseline before report generation.
Study registration uses the local clock, rejects late or retrospective reports, and is never overwritten.
Study evaluation includes missing registrations and pending outcomes. Local custody and matched
operator-declared dimensions do not certify historical inputs or forecasting accuracy.
`;

export interface EvaluationCliSummary {
  command: "freeze" | "evaluate" | "schema" | "help" | "study-init" | "study-register" | "study-evaluate";
  outputPath?: string;
  snapshotHash?: string;
  counts?: ReturnType<typeof evaluateReportSnapshot>["counts"];
  studyHash?: string;
  registrationHash?: string;
  studyCounts?: ReturnType<typeof evaluateStoredStudy>["counts"];
}

function parseOptions(args: readonly string[], allowed: readonly string[]): Map<string, string> {
  const options = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i];
    const value = args[i + 1];
    if (!allowed.includes(name)) throw new Error(`Unknown option: ${name}`);
    if (options.has(name)) throw new Error(`Duplicate option: ${name}`);
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}`);
    options.set(name, value);
  }
  return options;
}

function required(options: Map<string, string>, name: string): string {
  const value = options.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function readJson(filename: string): unknown {
  return JSON.parse(fs.readFileSync(filename, "utf8"));
}

/** wx also refuses existing hard links/symlinks, preventing input truncation. */
function writeNewJson(filename: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  let descriptor: number;
  try {
    descriptor = fs.openSync(filename, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`Destination already exists: ${filename}`, { cause: error });
    throw error;
  }
  try {
    fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fs.closeSync(descriptor);
  } catch (error) {
    try { fs.closeSync(descriptor); } catch { /* Preserve the write failure. */ }
    // Another operation can rename our file and replace this pathname while
    // the descriptor is open. Never unlink a pathname after a failed write.
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${detail}; output may be incomplete and its destination was retained: ${filename}`, { cause: error });
  }
}

export function runEvaluationCli(
  argv: readonly string[],
  io: { writeStdout(value: string): void } = { writeStdout: (value) => process.stdout.write(value) },
  cwd = process.cwd(),
  now = new Date().toISOString(),
): EvaluationCliSummary {
  const [command, ...args] = argv;
  if (command === undefined || command === "help" || command === "--help") {
    if (args.length) throw new Error("Help accepts no options");
    io.writeStdout(HELP);
    return { command: "help" };
  }
  if (command === "schema") {
    if (args.length) throw new Error("Schema accepts no options");
    io.writeStdout(`${JSON.stringify({
      definition: z.toJSONSchema(EvaluationDefinitionSchema),
      outcomes: z.toJSONSchema(EvaluationOutcomesSchema.extend({ outcomes: z.array(EvaluationOutcomeSchema) })),
      studyProtocol: z.toJSONSchema(EvaluationStudyProtocolSchema),
      studyOutcomes: z.toJSONSchema(StudyOutcomesSchema),
    }, null, 2)}\n`);
    return { command: "schema" };
  }
  if (command === "study-init") {
    const options = parseOptions(args, ["--protocol", "--dir"]);
    const directory = path.resolve(cwd, required(options, "--dir"));
    const study = initializeEvaluationStudy(directory, readJson(path.resolve(cwd, required(options, "--protocol"))), now);
    const summary: EvaluationCliSummary = { command, outputPath: path.join(directory, "protocol.json"), studyHash: study.studyHash };
    io.writeStdout(`${JSON.stringify(summary, null, 2)}\n`);
    return summary;
  }
  if (command === "study-register") {
    const options = parseOptions(args, ["--dir", "--slot", "--report"]);
    const { registration, outputPath } = enrollEvaluationStudyReport(path.resolve(cwd, required(options, "--dir")),
      required(options, "--slot"), readJson(path.resolve(cwd, required(options, "--report"))), now);
    const summary: EvaluationCliSummary = { command, outputPath, studyHash: registration.studyHash, registrationHash: registration.registrationHash };
    io.writeStdout(`${JSON.stringify(summary, null, 2)}\n`);
    return summary;
  }
  if (command === "study-evaluate") {
    const options = parseOptions(args, ["--dir", "--outcomes", "--as-of", "--out"]);
    const directory = path.resolve(cwd, required(options, "--dir"));
    const result = evaluateStoredStudy(directory, readJson(path.resolve(cwd, required(options, "--outcomes"))), required(options, "--as-of"));
    // Identity includes the registration set and evaluation instant: today's deadlines can still be open.
    const outputPath = path.resolve(cwd, options.get("--out") ?? path.join(directory, "results", `${result.asOf}-${result.evaluationHash}.json`));
    writeNewEvaluationJson(outputPath, result);
    const summary: EvaluationCliSummary = { command, outputPath, studyHash: result.studyHash, studyCounts: result.counts };
    io.writeStdout(`${JSON.stringify(summary, null, 2)}\n`);
    return summary;
  }
  if (command === "freeze") {
    const options = parseOptions(args, ["--report", "--definition", "--out-dir"]);
    const reportFile = path.resolve(cwd, required(options, "--report"));
    const definitionFile = path.resolve(cwd, required(options, "--definition"));
    const directory = path.resolve(cwd, options.get("--out-dir") ?? "data/evaluations/snapshots");
    const snapshot = createEvaluationSnapshot(readJson(reportFile), readJson(definitionFile), now);
    const outputPath = path.join(directory, `${snapshot.snapshotHash}.json`);
    writeNewJson(outputPath, snapshot);
    const summary: EvaluationCliSummary = { command, outputPath, snapshotHash: snapshot.snapshotHash };
    io.writeStdout(`${JSON.stringify(summary, null, 2)}\n`);
    return summary;
  }
  if (command === "evaluate") {
    const options = parseOptions(args, ["--snapshot", "--outcomes", "--as-of", "--out"]);
    const snapshotFile = path.resolve(cwd, required(options, "--snapshot"));
    const outcomesFile = path.resolve(cwd, required(options, "--outcomes"));
    const asOf = required(options, "--as-of");
    const result = evaluateReportSnapshot(readJson(snapshotFile), readJson(outcomesFile), asOf);
    const outputPath = path.resolve(cwd, options.get("--out") ?? `data/evaluations/results/${result.snapshotHash}-${asOf}-${result.outcomesHash}.json`);
    writeNewJson(outputPath, result);
    const summary: EvaluationCliSummary = { command, outputPath, snapshotHash: result.snapshotHash, counts: result.counts };
    io.writeStdout(`${JSON.stringify(summary, null, 2)}\n`);
    return summary;
  }
  throw new Error(`Unknown command: ${command}. Use --help.`);
}
