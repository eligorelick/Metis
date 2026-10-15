/** Offline CLI: read inputs, evaluate in memory, create a new output exclusively. */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ClaimCorpusSchema, ClaimPredictionsSchema, evaluateClaimBenchmark } from "./claimBenchmark";

const HELP = `Offline claim benchmark (no database/provider/model calls)
  claims:evaluate schema [--out schema.json]
  claims:evaluate evaluate --corpus corpus.json --predictions predictions.json --out result.json
Inputs are preserved; existing output files and symlinks are refused.
Write failures may leave partial output for manual review; use a new output filename.
Synthetic seeds are not human-reviewed corpus evidence or real-report accuracy.
`;
function options(args: readonly string[], allowed: string[]) {
  const result = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]; const value = args[i + 1];
    if (!allowed.includes(key)) throw new Error(`Unknown option: ${key}`);
    if (result.has(key)) throw new Error(`Duplicate option: ${key}`);
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${key}`);
    result.set(key, value);
  }
  return result;
}
function writeExclusive(filename: string, value: unknown) {
  // Fully serialize before touching the destination. wx atomically refuses files and dangling symlinks.
  const content = `${JSON.stringify(value, null, 2)}\n`;
  const descriptor = fs.openSync(filename, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, content, "utf8");
    fs.closeSync(descriptor);
  } catch (error) {
    try { fs.closeSync(descriptor); } catch { /* Preserve original failure. */ }
    // The pathname could now belong to another operation. Never unlink it on failure.
    throw new Error(`Output write/close failed: ${String(error)}. Partial output may remain at ${filename}; inspect it and use a new output filename.`, { cause: error });
  }
}
export function runClaimBenchmarkCli(argv: readonly string[], io: { writeStdout(text: string): void } = { writeStdout: text => { process.stdout.write(text); } }, cwd = process.cwd()) {
  const [command, ...args] = argv;
  if (!command || command === "help" || command === "--help") {
    if (args.length) throw new Error("Help accepts no arguments");
    io.writeStdout(HELP); return { command: "help" };
  }
  if (command === "schema") {
    const opts = options(args, ["--out"]);
    const schemas = { corpus: z.toJSONSchema(ClaimCorpusSchema), predictions: z.toJSONSchema(ClaimPredictionsSchema) };
    if (opts.has("--out")) writeExclusive(path.resolve(cwd, opts.get("--out")!), schemas);
    else io.writeStdout(`${JSON.stringify(schemas, null, 2)}\n`);
    return { command: "schema" };
  }
  if (command !== "evaluate") throw new Error(`Unknown command: ${command}`);
  const opts = options(args, ["--corpus", "--predictions", "--out"]);
  for (const name of ["--corpus", "--predictions", "--out"]) if (!opts.has(name)) throw new Error(`Missing ${name}`);
  const read = (name: string): unknown => {
    const bytes = fs.readFileSync(path.resolve(cwd, opts.get(name)!));
    const text = bytes.toString("utf8");
    if (!Buffer.from(text, "utf8").equals(bytes)) throw new Error(`Input must be valid UTF8: ${name}`);
    return JSON.parse(text);
  };
  const result = evaluateClaimBenchmark(read("--corpus"), read("--predictions"));
  const outputPath = path.resolve(cwd, opts.get("--out")!);
  writeExclusive(outputPath, result);
  io.writeStdout(`${JSON.stringify({ outputPath, corpusKind: result.corpusKind, eligibleCases: result.eligibleCases, metrics: result.metrics })}\n`);
  return { command: "evaluate", outputPath, metrics: result.metrics };
}
