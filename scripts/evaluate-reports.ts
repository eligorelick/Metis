import { runEvaluationCli } from "../src/report/evaluationCli";
import { isEntryPoint } from "./lib/entrypoint.mjs";

if (isEntryPoint(import.meta.url)) {
  try {
    runEvaluationCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
