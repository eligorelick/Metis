/** node --conditions=react-server --import tsx scripts/replay-run-inputs.ts --snapshot FILE [--output FILE] */
import fs from "node:fs";
import { replayRunInputSnapshot } from "../src/pipeline/replayRunInput";
import { canonicalSnapshotJson } from "../src/pipeline/runInputSnapshot";

async function main(args: string[]): Promise<void> {
  const allowed = new Set(["--snapshot", "--hash", "--job", "--generation", "--output", "--export-snapshot"]);
  const options = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    if (!allowed.has(args[i]!) || !args[i + 1] || options.has(args[i]!)) throw new Error("Expected unique --snapshot FILE, --hash HASH, or --job ID --generation N; optional --output FILE and --export-snapshot FILE");
    options.set(args[i]!, args[i + 1]!);
  }
  if (["--snapshot", "--hash", "--job"].filter(key => options.has(key)).length !== 1) throw new Error("Choose exactly one snapshot input: --snapshot FILE, --hash HASH, or --job ID --generation N");
  let snapshot: unknown;
  if (options.has("--snapshot")) snapshot = JSON.parse(fs.readFileSync(options.get("--snapshot")!, "utf8"));
  else {
    const store = await import("../src/pipeline/runInputSnapshotStore");
    let hash = options.get("--hash");
    if (!hash) {
      const generation = Number(options.get("--generation"));
      if (!options.has("--generation") || !Number.isSafeInteger(generation) || generation < 0) throw new Error("Job replay requires an explicit nonnegative --generation");
      hash = store.readJobRunSnapshotRef(options.get("--job")!, generation)?.hash;
    }
    if (!hash) throw new Error("No immutable snapshot associated with that run");
    snapshot = store.readRunInputSnapshot(hash);
    if (!snapshot) throw new Error("Immutable snapshot not found");
  }
  const result = replayRunInputSnapshot(snapshot);
  const json = canonicalSnapshotJson(result);
  if (options.has("--output")) fs.writeFileSync(options.get("--output")!, `${json}\n`, { flag: "wx" });
  else process.stdout.write(`${json}\n`);
  if (options.has("--export-snapshot")) fs.writeFileSync(options.get("--export-snapshot")!, `${canonicalSnapshotJson(snapshot)}\n`, { flag: "wx" });
}

main(process.argv.slice(2)).catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
