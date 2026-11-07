import "server-only";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { aiDirectory, claimAiRuntime, ensurePrivateDirectory, readAiStore, withAiStore } from "./store";
import { CHATGPT_EFFORTS, validModelId, type ChatGptEffort } from "./contracts";

const KEY = Symbol.for("metis.claude.runtime.v1");
type Runtime = { generation: number; disconnecting: boolean; children: Set<ChildProcessWithoutNullStreams> };
function runtime(): Runtime {
  const root = globalThis as typeof globalThis & { [KEY]?: Runtime };
  return root[KEY] ??= { generation: 0, disconnecting: false, children: new Set() };
}

/** Run the user's installed, unmodified official CLI. Never read its credential files. */
export function claudeExecutable(): { command: string; prefix: string[] } | null {
  const directories = [path.join(os.homedir(), ".local", "bin"), ...(process.env.PATH ?? "").split(path.delimiter)];
  for (const directory of directories) {
    if (!path.isAbsolute(directory)) continue;
    const native = path.join(directory, process.platform === "win32" ? "claude.exe" : "claude");
    try { if (fs.statSync(native).isFile()) return { command: native, prefix: [] }; } catch { /* Next location. */ }
    const pkg = path.join(directory, "node_modules", "@anthropic-ai", "claude-code");
    try {
      if (JSON.parse(fs.readFileSync(path.join(pkg, "package.json"), "utf8")).name === "@anthropic-ai/claude-code" && fs.existsSync(path.join(pkg, "cli.js"))) {
        return { command: process.execPath, prefix: [path.join(pkg, "cli.js")] };
      }
    } catch { /* Not an official npm installation. */ }
  }
  return null;
}

export function claudeEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { NODE_ENV: "production" };
  for (const key of ["PATH", "Path", "SYSTEMROOT", "SystemRoot", "WINDIR", "COMSPEC", "TEMP", "TMP", "LANG", "LC_ALL", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "CLAUDE_CONFIG_DIR"]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return env;
}

export function claudeRunArgs(model: string, effort?: ChatGptEffort): string[] {
  if (!validModelId(model)) throw new Error("Invalid Claude model");
  if (effort && !CHATGPT_EFFORTS.includes(effort)) throw new Error("Invalid Claude effort");
  return ["--print", "--output-format", "json", "--safe-mode", "--setting-sources", "",
    "--settings", JSON.stringify({ disableAllHooks: true, autoMemoryEnabled: false }),
    "--tools", "", "--disallowedTools", "mcp__*", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}',
    "--no-session-persistence", "--permission-mode", "dontAsk",
    "--model", model, ...(effort ? ["--effort", effort] : [])];
}

const failure = "Claude could not complete this pass. Check Claude Code sign-in, model access and usage limits. No paid API fallback was attempted.";
export function parseClaudeResult(output: string): { text: string; model: string; input: number; output: number; observedModels: string[] } {
  const result = JSON.parse(output);
  if (result.type !== "result" || result.subtype !== "success" || result.is_error || typeof result.result !== "string" || !result.result.trim() ||
      !result.modelUsage || typeof result.modelUsage !== "object" || Array.isArray(result.modelUsage)) throw new Error(failure);
  const entries = Object.entries(result.modelUsage) as [string, { inputTokens?: number; outputTokens?: number; cacheReadInputTokens?: number; cacheCreationInputTokens?: number }][];
  const count = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0;
  if (!entries.length || entries.some(([model, usage]) => !validModelId(model) || !usage || !count(usage.inputTokens) || !count(usage.outputTokens) ||
    (usage.cacheReadInputTokens !== undefined && !count(usage.cacheReadInputTokens)) || (usage.cacheCreationInputTokens !== undefined && !count(usage.cacheCreationInputTokens)))) throw new Error(failure);
  const input = entries.reduce((sum, [, usage]) => sum + usage.inputTokens! + (usage.cacheReadInputTokens ?? 0) + (usage.cacheCreationInputTokens ?? 0), 0);
  const tokensOut = entries.reduce((sum, [, usage]) => sum + usage.outputTokens!, 0);
  if (!count(input) || !count(tokensOut)) throw new Error(failure);
  const observedModels = entries.map(([model]) => model);
  return { text: result.result, model: observedModels.length === 1 ? observedModels[0] : "multiple-models", input, output: tokensOut, observedModels };
}

export function claudeIdentity(value: unknown): string {
  const status = value as { loggedIn?: boolean; authMethod?: string; email?: string; orgId?: string } | null;
  if (!status?.loggedIn || status.authMethod !== "claude.ai" || !status.email) {
    throw new Error("Claude subscription sign-in is needed. Run claude auth login in your terminal, then connect again in Settings. Claude API keys remain available as a separate connection.");
  }
  return createHash("sha256").update(JSON.stringify([status.email, status.orgId ?? ""])).digest("hex");
}

async function invoke(args: string[], input = "", signal?: AbortSignal, timeoutMs = 30_000): Promise<string> {
  signal?.throwIfAborted();
  if (runtime().disconnecting) throw new Error("Claude is disconnecting; retry shortly.");
  const executable = claudeExecutable();
  if (!executable) throw new Error("Install the official Claude Code CLI, then restart Metis.");
  const cwd = path.join(aiDirectory(), "claude-work"); ensurePrivateDirectory(cwd);
  const child = spawn(executable.command, [...executable.prefix, ...args], { cwd, env: claudeEnvironment(), windowsHide: true, shell: false, stdio: "pipe" });
  runtime().children.add(child);
  child.stderr.resume(); // Never surface CLI diagnostics or account details.
  child.stdin.on("error", () => {});
  return new Promise((resolve, reject) => {
    let output = ""; let canceled = false;
    const decoder = new StringDecoder("utf8");
    const abort = () => { canceled = true; child.kill("SIGKILL"); };
    const timer = setTimeout(abort, timeoutMs); timer.unref();
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); runtime().children.delete(child); };
    signal?.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (data: Buffer) => { output += decoder.write(data); if (output.length > 8_000_000) abort(); });
    child.once("error", () => { cleanup(); reject(new Error("Claude Code could not start. Check the CLI installation.")); });
    child.once("close", code => {
      cleanup(); output += decoder.end();
      if (canceled || code !== 0) reject(new Error(failure)); else resolve(output);
    });
    if (signal?.aborted) abort(); else child.stdin.end(input);
  });
}

export async function connectClaude(): Promise<void> {
  const generation = runtime().generation;
  await withAiStore(store => { claimAiRuntime(store); });
  const version = await invoke(["--version"]);
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match || Number(match[1]) < 2 || (Number(match[1]) === 2 && (Number(match[2]) < 1 || (Number(match[2]) === 1 && Number(match[3]) < 319)))) {
    throw new Error("Install Claude Code 2.1.319 or newer for this integration (claude update).");
  }
  const identity = claudeIdentity(JSON.parse(await invoke(["auth", "status"])));
  await withAiStore(store => {
    if (runtime().disconnecting || runtime().generation !== generation) throw new Error("Claude connection was canceled.");
    const id = store.claude?.identity === identity ? store.claude.id : randomUUID();
    store.claude = { id, identity, connected: true };
  });
}

export async function runClaude(id: string, model: string, prompt: string, signal?: AbortSignal, effort?: ChatGptEffort) {
  const generation = runtime().generation;
  const identity = await withAiStore(store => {
    claimAiRuntime(store);
    if (store.claude?.id !== id || !store.claude.connected) throw new Error("Claude connection is disconnected. Connect it in Settings.");
    return store.claude.identity;
  });
  const currentIdentity = claudeIdentity(JSON.parse(await invoke(["auth", "status"], "", signal)));
  if (identity !== currentIdentity) throw new Error("Claude Code's account changed. Reconnect in Settings before running a report.");
  if (runtime().generation !== generation || readAiStore()?.claude?.id !== id) throw new Error("Claude connection was canceled.");
  return parseClaudeResult(await invoke(claudeRunArgs(model, effort), prompt, signal, 45 * 60_000));
}

export async function disconnectClaude(): Promise<string> {
  if (runtime().disconnecting) throw new Error("Claude is already disconnecting.");
  runtime().disconnecting = true; runtime().generation++;
  try {
    await Promise.all([...runtime().children].map(child => new Promise<void>((resolve, reject) => {
      if (child.exitCode !== null || child.signalCode !== null) { resolve(); return; }
      const timer = setTimeout(() => reject(new Error("Claude process did not stop. Stop Metis before disconnecting again.")), 10_000); timer.unref();
      child.once("close", () => { clearTimeout(timer); resolve(); }); child.kill("SIGKILL");
    })));
    await withAiStore(store => { claimAiRuntime(store); store.claude = null; if (store.selection.provider === "claude") store.selection = { provider: "none" }; });
    return "Disconnected from Metis. Your Claude Code sign-in remains available in your terminal.";
  } finally { runtime().disconnecting = false; }
}
