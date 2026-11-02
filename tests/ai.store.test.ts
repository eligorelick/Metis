import { fork } from "node:child_process";
import { holdProcessLifetimeLock, releaseProcessLifetimeLocksForTests } from "@/ai/mutex";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { aiDirectory, aiRuntimeLockPath, ensurePrivateDirectory, AI_RUNTIME_CONFLICT_MESSAGE, claimAiRuntime, claimAiRuntimeForRun, isAiRuntimeConflict, readAiStore, withAiStore, type AiStore } from "@/ai/store";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "thesis-ai-store-"));
beforeAll(() => { vi.stubEnv("LOCALAPPDATA", directory); vi.stubEnv("XDG_CONFIG_HOME", directory); });
afterAll(() => { releaseProcessLifetimeLocksForTests(); vi.unstubAllEnvs(); fs.rmSync(directory, { recursive: true, force: true }); });

// macOS uses a fixed OS support directory; this fixture never redirects or
// touches a real account there. Both supported CI hosts exercise their store.
describe.skipIf(process.platform === "darwin")("protected connection storage", () => {
  it("retains one host identity and serializes concurrent account updates", async () => {
    const host = await withAiStore((store) => store.hostId);
    await Promise.all([1, 2].map((n) => withAiStore(async (store) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      store.profiles.push({ id: `test-${n}`, clientId: `oaiapp_test${n}` });
    })));
    expect(readAiStore()?.hostId).toBe(host);
    expect(readAiStore()?.profiles).toHaveLength(2);
    expect(fs.existsSync(path.join(aiDirectory(), "connections.lock"))).toBe(true);
    if (process.platform !== "win32") {
      expect(fs.statSync(aiDirectory()).mode & 0o777).toBe(0o700);
      expect(fs.statSync(path.join(aiDirectory(), "connections.v1.json")).mode & 0o777).toBe(0o600);
      expect(fs.statSync(path.join(aiDirectory(), "connections.lock")).mode & 0o777).toBe(0o600);
    }
  }, 60_000);
  it("does not overwrite an unreadable credential file with an empty account list", async () => {
    await withAiStore(() => {});
    const file = path.join(aiDirectory(), "connections.v1.json");
    const saved = fs.readFileSync(file, "utf8");
    fs.writeFileSync(file, "corrupt-data");
    await expect(withAiStore(() => {})).rejects.toThrow("credentials were not replaced");
    expect(fs.readFileSync(file, "utf8")).toBe("corrupt-data");
    fs.writeFileSync(file, saved);
  }, 60_000);
  it("AI-115 ignores an unrelated live PID and EPERM when claiming runtime", () => {
    const store = { runtimeOwnerPid: process.pid + 1 } as AiStore;
    const probe = vi.spyOn(process, "kill").mockImplementation(() => {
      throw Object.assign(new Error("denied"), { code: "EPERM" });
    });
    try { expect(() => claimAiRuntime(store)).not.toThrow(); }
    finally { probe.mockRestore(); }
  });
  it("AI-115 holds reentrantly and ignores a reused live PID", () => {
    claimAiRuntime({ runtimeOwnerPid: process.ppid } as AiStore);
    expect(holdProcessLifetimeLock(aiRuntimeLockPath())).toBe(true);
    expect(holdProcessLifetimeLock(aiRuntimeLockPath())).toBe(true);
  });
  // AI-115 replaces the saved-PID pins: only an OS lock proves a live owner.
  it("claims only when saved data exists, refuses a live lock and recovers after crash (F-12)", async () => {
    releaseProcessLifetimeLocksForTests();
    const file = path.join(aiDirectory(), "connections.v1.json");
    const saved = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
    let child: ReturnType<typeof fork> | undefined;
    try {
      fs.rmSync(file, { force: true });
      await claimAiRuntimeForRun(); expect(fs.existsSync(file)).toBe(false);
      await withAiStore(store => { store.runtimeOwnerPid = process.ppid; });
      ensurePrivateDirectory(aiDirectory());
      child = fork(path.resolve("tests/fixtures/aiRuntimeOwnerWorker.mjs"), [aiRuntimeLockPath()], {
        execArgv: ["--import", "tsx", "--conditions=react-server"],
        stdio: ["ignore", "ignore", "pipe", "ipc"],
      });
      await new Promise<void>((resolve, reject) => {
        child!.once("message", () => resolve()); child!.once("error", reject);
        child!.once("exit", () => reject(new Error("owner exited before holding lock")));
      });
      const refused = await claimAiRuntimeForRun().then(() => null, (error: unknown) => error);
      expect(isAiRuntimeConflict(refused)).toBe(true);
      expect((refused as Error).message).toBe(AI_RUNTIME_CONFLICT_MESSAGE);
      expect(readAiStore()?.runtimeOwnerPid).toBe(process.ppid);
      const exited = new Promise<void>(resolve => child!.once("exit", () => resolve()));
      child.kill("SIGKILL"); await exited;
      await claimAiRuntimeForRun();
      expect(readAiStore()?.runtimeOwnerPid).toBe(process.pid);
    } finally {
      if (child && child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      releaseProcessLifetimeLocksForTests();
      if (saved === null) fs.rmSync(file, { force: true }); else fs.writeFileSync(file, saved);
    }
  }, 120000);

});
