import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NATIVE_SQLITE_IO_TESTS, nativeSqliteTestTimeout } from "./helpers/nativeSqliteTiming";

describe("Windows native SQLite test timing policy", () => {
  it.each(NATIVE_SQLITE_IO_TESTS)("gives %s the bounded native-I/O default on Windows", (file) => {
    expect(nativeSqliteTestTimeout(file, "win32", 5_000)).toBe(15_000);
    expect(nativeSqliteTestTimeout(`C:\\repo\\${file.replaceAll("/", "\\")}`, "win32", 5_000)).toBe(15_000);
    expect(nativeSqliteTestTimeout(`/repo/${file}`, "linux", 5_000)).toBe(5_000);
  });

  it.each([undefined, "tests/compute.test.ts", "tests/jobState.test.ts.copy", "fixtures/jobState.test.ts", "tests/report.query.test.ts"])("preserves the default for unrelated or missing test path %s", (file) => {
    expect(nativeSqliteTestTimeout(file, "win32", 5_000)).toBe(5_000);
  });

  it("preserves larger caller budgets and an explicitly disabled timeout", () => {
    expect(nativeSqliteTestTimeout("tests/jobState.test.ts", "win32", 20_000)).toBe(20_000);
    expect(nativeSqliteTestTimeout("tests/jobState.test.ts", "win32", 0)).toBe(0);
  });

  it("preserves an explicit collected deadline in this CPU-only suite", ({ task }) => {
    expect(task.timeout).toBe(1_234);
  }, 1_234);

  it("resets per file in execution order, preserves 30s defaults and explicit test deadlines", () => {
    const root = path.resolve(__dirname, "..");
    const temporaryRoot = path.join(root, "tmp");
    mkdirSync(temporaryRoot, { recursive: true });
    const directory = mkdtempSync(path.join(temporaryRoot, "native-sqlite-timing-"));
    try {
      mkdirSync(path.join(directory, "tests"));
      const names = ["jobState", "ordinary", "jobScheduler"];
      for (const name of names) writeFileSync(path.join(directory, "tests", `${name}.test.ts`), `
        import { appendFileSync } from "node:fs";
        import { expect, it } from "vitest";
        it("records its actual collected default", ({ task }) => {
          appendFileSync(${JSON.stringify(path.join(directory, "order.jsonl"))}, JSON.stringify({ name: ${JSON.stringify(name)}, timeout: task.timeout }) + "\\n");
        });
        it("preserves an explicit test deadline", ({ task }) => expect(task.timeout).toBe(1234), 1234);
      `);
      const configPath = path.join(directory, "vitest.config.mjs");
      for (const configuredTimeout of [5_000, 30_000]) {
        writeFileSync(path.join(directory, "order.jsonl"), "");
        writeFileSync(configPath, `
          import { defineConfig } from "vitest/config";
          import { BaseSequencer } from "vitest/node";
          const names = ${JSON.stringify(names.map((name) => `${name}.test.ts`))};
          class Ordered extends BaseSequencer {
            async sort(files) { return files.sort((a, b) => names.indexOf(a.moduleId.replaceAll("\\\\", "/").split("/").at(-1)) - names.indexOf(b.moduleId.replaceAll("\\\\", "/").split("/").at(-1))); }
          }
          export default defineConfig({ test: {
            root: ${JSON.stringify(directory)}, include: ["tests/*.test.ts"],
            runner: ${JSON.stringify(path.join(root, "tests/helpers/nativeSqliteRunner.ts"))},
            setupFiles: [${JSON.stringify(path.join(root, "tests/setup/noLiveNetwork.ts"))}],
            testTimeout: ${configuredTimeout}, pool: "forks", maxWorkers: 1,
            isolate: false, fileParallelism: false, sequence: { sequencer: Ordered },
          } });
        `);
        const result = spawnSync(process.execPath, [path.join(root, "node_modules/vitest/vitest.mjs"), "run", "--config", configPath], {
          cwd: root, encoding: "utf8", timeout: 15_000, shell: false,
        });
        expect(result.status, `${result.error ?? ""}\n${result.stdout}\n${result.stderr}`).toBe(0);
        const observed = readFileSync(path.join(directory, "order.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
        expect(observed).toEqual(names.map((name) => ({
          name, timeout: name === "ordinary" || process.platform !== "win32" ? configuredTimeout : Math.max(configuredTimeout, 15_000),
        })));
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 35_000);
});
