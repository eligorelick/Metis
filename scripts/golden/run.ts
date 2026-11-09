/**
 * golden:run — rebuild the same-report cases with one commit's code, offline.
 *
 *   npm run golden:run                         # the working tree
 *   npm run golden:run -- --ref main           # any commit, extracted with git archive
 *   options: --out DIR  --db FILE  --cases FILE  --only id,id  --jobs N
 *
 * Inputs (frozen run-input snapshots and stored synthesize outputs) are read
 * read-only from the local application database the first time, checked
 * against the SHA-256 list in scripts/golden/cases.json, and cached under
 * tmp/golden/inputs (gitignored; they contain vendor data and are never
 * committed). Each case runs in its own Node process with the network blocked,
 * no provider keys in its environment, a fixed clock and TZ, and a scratch
 * database and data directory inside the output folder. No model is called.
 *
 * Output: DIR/<case>/{stageB.json, payload.txt, report.json, report.md,
 * print.html, audit.md, web-classic.html, web-dossier.html} and DIR/manifest.json
 * with the SHA-256 of each. Compare two runs with golden:diff.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import type { GoldenWorkerJob, GoldenWorkerResult } from "./worker";

const REPO = path.resolve(__dirname, "..", "..");
const GOLDEN_TMP = path.join(REPO, "tmp", "golden");
const HARNESS_DIR = path.join("scripts", "golden");

export interface GoldenCase {
  id: string;
  snapshot: string;
  analystOutput?: { jobId: string; runGeneration: number; attemptId: string; sha256: string };
}

export interface GoldenCaseEntry {
  snapshot: string;
  analystOutput: string | null;
  status: "ok" | "error";
  error?: string;
  route?: string | null;
  overlays?: string[];
  clock?: string;
  payloadFingerprint?: string;
  reportPath?: string;
  reportSchema?: string;
  readMode?: string | null;
  notes?: string[];
  files?: Record<string, string>;
}

export interface GoldenManifest {
  harness: 1;
  code: {
    ref: string;
    commit: string;
    dirtyDiffHash: string | null;
    harnessFrom: "tree" | "current-checkout";
    packageLockSha256: string | null;
  };
  environment: { node: string; installedLockSha256: string | null };
  cases: Record<string, GoldenCaseEntry>;
  timingsMs: Record<string, number>;
}

function sha256(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function git(args: string[], cwd = REPO): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 1 << 30 }).trim();
}

function parseArgs(argv: string[]): Map<string, string> {
  const allowed = new Set(["--ref", "--out", "--db", "--cases", "--only", "--jobs"]);
  const options = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]!;
    const value = argv[i + 1];
    if (!allowed.has(key) || value === undefined || options.has(key)) {
      throw new Error("usage: golden:run [--ref REF] [--out DIR] [--db FILE] [--cases FILE] [--only id,id] [--jobs N]");
    }
    options.set(key, value);
  }
  return options;
}

function fileSha(file: string): string | null {
  return fs.existsSync(file) ? sha256(fs.readFileSync(file)) : null;
}

/** Extract `commit` into tmp/golden/trees/<commit> once; reuse it afterwards. */
function materializeCommit(commit: string): string {
  const dir = path.join(GOLDEN_TMP, "trees", commit);
  const marker = path.join(dir, ".golden-extracted");
  if (fs.existsSync(marker)) return dir;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const archive = execFileSync("git", ["archive", "--format=tar", commit], { cwd: REPO, maxBuffer: 1 << 30 });
  // Relative "-" input and cwd keep GNU tar and Windows bsdtar both away from drive-letter parsing.
  const untar = spawnSync("tar", ["-xf", "-"], { cwd: dir, input: archive, maxBuffer: 1 << 30 });
  if (untar.status !== 0) throw new Error(`could not extract ${commit}: ${untar.stderr?.toString() ?? untar.error}`);
  fs.writeFileSync(marker, `${commit}\n`);
  return dir;
}

function defaultDbPath(): string {
  const explicit = process.env.METIS_DB_PATH?.trim() || process.env.THESIS_DB_PATH?.trim();
  if (explicit) return explicit;
  const dataDir = process.env.METIS_DATA_DIR?.trim() || process.env.THESIS_DATA_DIR?.trim() || (() => {
    const base = process.platform === "win32"
      ? (process.env.LOCALAPPDATA?.trim() || process.env.APPDATA?.trim() || os.homedir())
      : process.platform === "darwin" ? path.join(os.homedir(), "Library", "Application Support")
        : (process.env.XDG_DATA_HOME?.trim() || path.join(os.homedir(), ".local", "share"));
    const legacy = path.join(base, process.platform === "win32" || process.platform === "darwin" ? "Thesis" : "thesis");
    return fs.existsSync(legacy) ? legacy : path.join(base, process.platform === "win32" || process.platform === "darwin" ? "Metis" : "metis");
  })();
  const legacyDb = path.join(dataDir, "thesis.db");
  return fs.existsSync(legacyDb) ? legacyDb : path.join(dataDir, "metis.db");
}

type ReadOnlyDb = { prepare(sql: string): { get(...params: unknown[]): unknown } };

/** Cache each case's inputs under tmp/golden/inputs, reading the database read-only only when needed. */
async function exportInputs(cases: GoldenCase[], dbPath: string): Promise<Map<string, { snapshotFile: string; analystFile?: string }>> {
  const inputsDir = path.join(GOLDEN_TMP, "inputs");
  fs.mkdirSync(inputsDir, { recursive: true });
  let db: ReadOnlyDb | null = null;
  const openDb = async (): Promise<ReadOnlyDb> => {
    if (db) return db;
    if (!fs.existsSync(dbPath)) throw new Error(`inputs are not cached and the database ${dbPath} does not exist; pass --db FILE`);
    const { DatabaseSync } = await import("node:sqlite");
    db = new DatabaseSync(dbPath, { readOnly: true }) as unknown as ReadOnlyDb;
    return db;
  };
  const result = new Map<string, { snapshotFile: string; analystFile?: string }>();
  for (const golden of cases) {
    const snapshotFile = path.join(inputsDir, `snapshot-${golden.snapshot}.json`);
    if (!fs.existsSync(snapshotFile)) {
      const row = (await openDb()).prepare(`SELECT snapshotJson FROM run_input_snapshots WHERE hash = ?`).get(golden.snapshot) as { snapshotJson?: string } | undefined;
      if (typeof row?.snapshotJson !== "string") throw new Error(`${golden.id}: snapshot ${golden.snapshot} is not in ${dbPath}`);
      fs.writeFileSync(snapshotFile, row.snapshotJson, { flag: "wx" });
    }
    const stored = JSON.parse(fs.readFileSync(snapshotFile, "utf8")) as { hash?: unknown };
    if (stored.hash !== golden.snapshot) throw new Error(`${golden.id}: cached snapshot does not carry hash ${golden.snapshot}`);
    const entry: { snapshotFile: string; analystFile?: string } = { snapshotFile };
    if (golden.analystOutput) {
      const a = golden.analystOutput;
      const analystFile = path.join(inputsDir, `synthesize-${a.sha256}.json`);
      if (!fs.existsSync(analystFile)) {
        const row = (await openDb()).prepare(
          `SELECT outcomeJson FROM job_pass_artifacts WHERE jobId = ? AND runGeneration = ? AND attemptId = ? AND pass = 'synthesize'`,
        ).get(a.jobId, a.runGeneration, a.attemptId) as { outcomeJson?: string } | undefined;
        if (typeof row?.outcomeJson !== "string") throw new Error(`${golden.id}: synthesize artifact ${a.jobId}/${a.attemptId} is not in ${dbPath}`);
        fs.writeFileSync(analystFile, row.outcomeJson, { flag: "wx" });
      }
      if (sha256(fs.readFileSync(analystFile, "utf8")) !== a.sha256) throw new Error(`${golden.id}: stored analyst output does not match sha256 ${a.sha256}`);
      entry.analystFile = analystFile;
    }
    result.set(golden.id, entry);
  }
  return result;
}

/** Only what Node, tsx and Windows need; no provider keys, no METIS_/THESIS_ settings. */
function workerEnv(scratch: string): NodeJS.ProcessEnv {
  const keep = ["PATH", "Path", "PATHEXT", "SystemRoot", "SYSTEMROOT", "windir", "ComSpec", "COMSPEC", "SystemDrive"];
  const env: NodeJS.ProcessEnv = { NODE_ENV: "production" };
  for (const key of keep) if (process.env[key] !== undefined) env[key] = process.env[key];
  const temp = path.join(GOLDEN_TMP, "tmp");
  fs.mkdirSync(temp, { recursive: true });
  Object.assign(env, {
    TEMP: temp,
    TMP: temp,
    TMPDIR: temp,
    TZ: "UTC",
    METIS_DB_PATH: path.join(scratch, "metis.db"),
    METIS_DATA_DIR: path.join(scratch, "data"),
    HOME: scratch,
    USERPROFILE: scratch,
    LOCALAPPDATA: path.join(scratch, "localappdata"),
    APPDATA: path.join(scratch, "appdata"),
  });
  return env;
}

function runWorker(root: string, harnessRoot: string, job: GoldenWorkerJob, jobFile: string, scratch: string): Promise<GoldenWorkerResult> {
  fs.writeFileSync(jobFile, JSON.stringify(job, null, 2), { flag: "wx" });
  const preload = pathToFileURL(path.join(harnessRoot, HARNESS_DIR, "offline-preload.mjs")).href;
  const worker = path.join(harnessRoot, HARNESS_DIR, "worker.ts");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--no-warnings", "--import", "tsx", "--import", preload, worker, jobFile], {
      cwd: root, env: workerEnv(scratch), stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      const line = stdout.trim().split("\n").pop() ?? "";
      if (code === 0 && line.startsWith("{")) resolve(JSON.parse(line) as GoldenWorkerResult);
      else reject(new Error(stderr.trim().split("\n").slice(0, 6).join("\n") || `worker exited ${code}`));
    });
  });
}

async function main(argv: string[]): Promise<void> {
  const options = parseArgs(argv);
  const casesFile = path.resolve(options.get("--cases") ?? path.join(REPO, HARNESS_DIR, "cases.json"));
  let cases = (JSON.parse(fs.readFileSync(casesFile, "utf8")) as { cases: GoldenCase[] }).cases;
  if (options.has("--only")) {
    const only = new Set(options.get("--only")!.split(","));
    cases = cases.filter((golden) => only.has(golden.id));
    if (cases.length !== only.size) throw new Error(`--only names unknown cases: ${[...only].filter((id) => !cases.some((c) => c.id === id)).join(", ")}`);
  }
  const jobs = Math.max(1, Number(options.get("--jobs") ?? Math.min(4, Math.max(1, os.availableParallelism() - 1))));

  const ref = options.get("--ref") ?? "WORKTREE";
  let root: string;
  let commit: string;
  let dirtyDiffHash: string | null = null;
  if (options.has("--ref")) {
    commit = git(["rev-parse", "--verify", `${ref}^{commit}`]);
    root = materializeCommit(commit);
  } else {
    root = REPO;
    commit = git(["rev-parse", "HEAD"]);
    const dirty = git(["status", "--porcelain", "--untracked-files=all", "--", "src", "scripts", "config", "package.json", "package-lock.json", "tsconfig.json"]);
    if (dirty.length > 0) {
      const untracked = git(["ls-files", "--others", "--exclude-standard", "--", "src", "scripts", "config"]).split("\n").filter(Boolean);
      dirtyDiffHash = sha256([git(["diff", "HEAD", "--binary"]), ...untracked.map((file) => `${file}\0${fileSha(path.join(REPO, file))}`)].join("\n"));
    }
  }
  const harnessFrom: GoldenManifest["code"]["harnessFrom"] = fs.existsSync(path.join(root, HARNESS_DIR, "worker.ts")) ? "tree" : "current-checkout";
  const harnessRoot = harnessFrom === "tree" ? root : REPO;

  const label = `${commit.slice(0, 12)}${dirtyDiffHash ? `-dirty${dirtyDiffHash.slice(0, 8)}` : ""}`;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  const outDir = path.resolve(options.get("--out") ?? path.join(GOLDEN_TMP, "runs", `${label}-${stamp}`));
  if (fs.existsSync(outDir) && fs.readdirSync(outDir).length > 0) throw new Error(`output folder ${outDir} is not empty`);
  fs.mkdirSync(outDir, { recursive: true });

  const inputs = await exportInputs(cases, path.resolve(options.get("--db") ?? defaultDbPath()));
  process.stderr.write(`golden:run ${ref} @ ${commit.slice(0, 12)}${dirtyDiffHash ? " (with uncommitted changes)" : ""}: ${cases.length} cases, ${jobs} at a time, harness from ${harnessFrom}\n`);

  const manifest: GoldenManifest = {
    harness: 1,
    code: { ref, commit, dirtyDiffHash, harnessFrom, packageLockSha256: fileSha(path.join(root, "package-lock.json")) },
    environment: { node: process.version, installedLockSha256: fileSha(path.join(REPO, "node_modules", ".package-lock.json")) },
    cases: {},
    timingsMs: {},
  };
  const queue = [...cases];
  let failures = 0;
  const work = async (): Promise<void> => {
    for (let golden = queue.shift(); golden !== undefined; golden = queue.shift()) {
      const input = inputs.get(golden.id)!;
      const scratch = path.join(outDir, ".scratch", golden.id);
      fs.mkdirSync(scratch, { recursive: true });
      const entry: GoldenCaseEntry = { snapshot: golden.snapshot, analystOutput: golden.analystOutput?.sha256 ?? null, status: "ok" };
      try {
        const result = await runWorker(root, harnessRoot, {
          root, caseId: golden.id, snapshotFile: input.snapshotFile,
          ...(input.analystFile ? { analystFile: input.analystFile, analystJobId: golden.analystOutput!.jobId } : {}),
          outDir: path.join(outDir, golden.id),
        }, path.join(scratch, "job.json"), scratch);
        Object.assign(entry, {
          route: result.route, overlays: result.overlays, clock: result.clock, payloadFingerprint: result.payloadFingerprint,
          reportPath: result.reportPath, reportSchema: result.reportSchema, readMode: result.readMode, notes: result.notes, files: result.files,
        });
        manifest.timingsMs[golden.id] = result.ms;
        process.stderr.write(`  ${golden.id}: ${result.route}${result.overlays.length ? `+${result.overlays.join("+")}` : ""} ${result.reportPath} payload ${result.payloadFingerprint} ${(result.ms / 1000).toFixed(1)}s${result.notes.length ? ` (${result.notes.join("; ")})` : ""}\n`);
      } catch (error) {
        failures++;
        entry.status = "error";
        entry.error = error instanceof Error ? error.message : String(error);
        process.stderr.write(`  ${golden.id}: ERROR ${entry.error}\n`);
      }
      manifest.cases[golden.id] = entry;
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, cases.length) }, work));
  manifest.cases = Object.fromEntries(cases.map((golden) => [golden.id, manifest.cases[golden.id]!]));
  fs.rmSync(path.join(outDir, ".scratch"), { recursive: true, force: true });
  fs.writeFileSync(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  process.stderr.write(`golden:run wrote ${outDir}${failures ? ` — ${failures} case(s) failed` : ""}\n`);
  process.stdout.write(`${outDir}\n`);
  if (failures > 0) process.exitCode = 1;
}

main(process.argv.slice(2)).catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
