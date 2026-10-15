import { runClaimBenchmarkCli } from "../src/evaluation/claimBenchmarkCli";
import { isEntryPoint } from "./lib/entrypoint.mjs";
if (isEntryPoint(import.meta.url)) {
  try { runClaimBenchmarkCli(process.argv.slice(2)); }
  catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
}
