import { readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { evaluateResearch } from "../src/evaluation/evaluation";

const [inputPath, outputPath, ...extra] = process.argv.slice(2);
try {
  if (!inputPath || extra.length) throw new Error("usage: node --import tsx scripts/evaluate-research.ts <frozen-dataset.json> [report.json]");
  if (outputPath && path.resolve(inputPath) === path.resolve(outputPath)) throw new Error("output must not overwrite frozen input");
  if (statSync(inputPath).size > 64 * 1024 * 1024) throw new Error("frozen input exceeds 64 MiB budget");
  const report = evaluateResearch(JSON.parse(readFileSync(inputPath, "utf8").replace(/^\uFEFF/, "")));
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (outputPath) writeFileSync(outputPath, json, { flag: "wx" }); else process.stdout.write(json);
  if (report.rejected.length) { process.stderr.write(`Evaluation rejected ${report.rejected.length} inadmissible sample(s); see report reasons\n`); process.exitCode = 2; }
} catch (error) {
  process.stderr.write(`Evaluation failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
