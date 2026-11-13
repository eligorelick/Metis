import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PER_FILE_FLOOR, RISK_SOURCE_MANIFEST, perFileFloorThresholds } from "../vitest.shared";

export const CORE_THRESHOLDS = { statements: 90, branches: 84, functions: 95, lines: 93 };
type Metric = keyof typeof CORE_THRESHOLDS;
type Summary = Record<Metric, { total: number; covered: number; skipped: number; pct: number }>;
type Report = Record<string, Summary>;
const metrics = Object.keys(CORE_THRESHOLDS) as Metric[];

/** Same truncation and empty-file convention as istanbul-lib-coverage/lib/percent.js. */
export function aggregate(summaries: Summary[]): Summary {
  return Object.fromEntries(metrics.map(metric => {
    const count = summaries.reduce((sum, file) => ({
      total: sum.total + file[metric].total,
      covered: sum.covered + file[metric].covered,
      skipped: sum.skipped + file[metric].skipped,
    }), { total: 0, covered: 0, skipped: 0 });
    return [metric, { ...count, pct: count.total > 0 ? Math.floor((1000 * 100 * count.covered / count.total) / 10) / 100 : 100 }];
  })) as Summary;
}

export function checkCoverage(report: Report, root: string, core: string[], risk: readonly string[]) {
  const files = new Map(Object.entries(report).filter(([file]) => file !== "total")
    .map(([file, summary]) => [path.relative(root, file).replaceAll("\\", "/"), summary]));
  const errors: string[] = [];
  const check = (name: string, summary: Summary, thresholds: typeof CORE_THRESHOLDS) => {
    for (const metric of metrics) {
      const value = summary[metric]?.pct;
      if (!Number.isFinite(value) || value < thresholds[metric]) errors.push(`${name}: ${metric} ${value}% < ${thresholds[metric]}%`);
    }
  };
  for (const file of new Set([...core, ...risk])) {
    const summary = files.get(file);
    if (!summary) errors.push(`Missing coverage: ${file}`);
    else check(file, summary, PER_FILE_FLOOR);
  }
  const coreSummary = aggregate(core.flatMap(file => files.has(file) ? [files.get(file)!] : []));
  check("core aggregate", coreSummary, CORE_THRESHOLDS);
  return { errors, core: coreSummary, risk: aggregate(risk.flatMap(file => files.has(file) ? [files.get(file)!] : [])) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = process.cwd();
  const report = JSON.parse(readFileSync(process.argv[2] ?? "coverage/product/coverage-summary.json", "utf8")) as Report;
  const result = checkCoverage(report, root, Object.keys(perFileFloorThresholds(root)), RISK_SOURCE_MANIFEST);
  console.log(JSON.stringify(result, null, 2));
  if (result.errors.length) process.exitCode = 1;
}
