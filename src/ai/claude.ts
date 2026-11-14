import "server-only";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { aiDirectory, claimAiRuntime, ensurePrivateDirectory, readAiStore, withAiStore } from "./store";
import { CHATGPT_EFFORTS, validModelId, type ChatGptEffort } from "./contracts";
import type { ProviderFailure } from "./providerFailure";
import { canonicalizeFetchedUrl } from "@/pipeline/stageC/provenance";

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

/** The CLI's own built-in web tools; the only tools an analyst research request may have (D-269). */
export const CLAUDE_RESEARCH_TOOLS = ["WebSearch", "WebFetch"] as const;
type ClaudeResearchTool = typeof CLAUDE_RESEARCH_TOOLS[number];
const RESEARCH_TOOL_SET: ReadonlySet<string> = new Set(CLAUDE_RESEARCH_TOOLS);
/** Same local research deadline as the ChatGPT route (D-269). */
export const CLAUDE_RESEARCH_TIMEOUT_MS = 10 * 60_000;
const MAX_OUTPUT_CHARS = 8_000_000;
/**
 * Hosts WebFetch must never reach, as the CLI's own permission globs (`*` spans
 * dots; live-checked on 2.1.323). They become deny rules the CLI checks before
 * a fetch runs, and the same list drives the stream observer's check (D-269, P26).
 * Private and reserved IPv4 blocks, IPv6 literals, local-use names and public
 * wildcard-DNS services that map names onto private addresses.
 */
export const NON_PUBLIC_WEBFETCH_HOSTS: readonly string[] = [
  "localhost", "*.localhost", "*.local", "*.localdomain", "*.internal", "*.intranet", "*.lan", "*.home", "*.corp", "*.home.arpa",
  "0.*.*.*", "10.*.*.*", "100.*.*.*", "127.*.*.*", "169.254.*.*", "192.168.*.*", "198.18.*.*", "198.19.*.*",
  ...Array.from({ length: 16 }, (_, index) => `172.${16 + index}.*.*`), "*:*", "[*",
  ...["nip.io", "sslip.io", "xip.io", "localtest.me", "lvh.me", "traefik.me", "vcap.me"].flatMap(service => [service, `*.${service}`]),
];
const NON_PUBLIC_HOST = new RegExp(`^(?:${NON_PUBLIC_WEBFETCH_HOSTS.map(glob => glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")).join("|")})$`);

/**
 * Print-mode arguments for the unmodified CLI. Writing, judge and verify are
 * tool-free. Analyst research (D-269) gets only the CLI's built-in WebSearch and
 * WebFetch, streamed as typed events so the action count and provenance come
 * from tool events, never prose; every other isolation flag is kept.
 */
export function claudeRunArgs(model: string, effort?: ChatGptEffort, research = false): string[] {
  if (!validModelId(model)) throw new Error("Invalid Claude model");
  if (effort && !CHATGPT_EFFORTS.includes(effort)) throw new Error("Invalid Claude effort");
  return ["--print", ...(research ? ["--output-format", "stream-json", "--verbose"] : ["--output-format", "json"]),
    "--safe-mode", "--setting-sources", "",
    "--settings", JSON.stringify({ disableAllHooks: true, autoMemoryEnabled: false }),
    ...(research ? ["--tools", CLAUDE_RESEARCH_TOOLS.join(","), "--allowedTools", ...CLAUDE_RESEARCH_TOOLS] : ["--tools", ""]),
    "--disallowedTools", "mcp__*", ...(research ? NON_PUBLIC_WEBFETCH_HOSTS.map(host => `WebFetch(domain:${host})`) : []),
    "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}',
    "--no-session-persistence", "--permission-mode", "dontAsk",
    "--model", model, ...(effort ? ["--effort", effort] : [])];
}

const failure = "Claude could not complete this pass. Check Claude Code sign-in, model access and usage limits. No paid API fallback was attempted.";
type ClaudeResult = { text: string; model: string; input: number; output: number; observedModels: string[] };
export function parseClaudeResult(output: string): ClaudeResult {
  return parseClaudeResultEvent(JSON.parse(output));
}
function parseClaudeResultEvent(value: unknown): ClaudeResult {
  const result = (value && typeof value === "object" ? value : {}) as { type?: unknown; subtype?: unknown; is_error?: unknown; result?: unknown; modelUsage?: unknown };
  const text = result.result;
  if (result.type !== "result" || result.subtype !== "success" || result.is_error || typeof text !== "string" || !text.trim() ||
      !result.modelUsage || typeof result.modelUsage !== "object" || Array.isArray(result.modelUsage)) throw new Error(failure);
  const entries = Object.entries(result.modelUsage) as [string, { inputTokens?: number; outputTokens?: number; cacheReadInputTokens?: number; cacheCreationInputTokens?: number }][];
  const count = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0;
  if (!entries.length || entries.some(([model, usage]) => !validModelId(model) || !usage || !count(usage.inputTokens) || !count(usage.outputTokens) ||
    (usage.cacheReadInputTokens !== undefined && !count(usage.cacheReadInputTokens)) || (usage.cacheCreationInputTokens !== undefined && !count(usage.cacheCreationInputTokens)))) throw new Error(failure);
  const input = entries.reduce((sum, [, usage]) => sum + usage.inputTokens! + (usage.cacheReadInputTokens ?? 0) + (usage.cacheCreationInputTokens ?? 0), 0);
  const tokensOut = entries.reduce((sum, [, usage]) => sum + usage.outputTokens!, 0);
  if (!count(input) || !count(tokensOut)) throw new Error(failure);
  const observedModels = entries.map(([model]) => model);
  return { text, model: observedModels.length === 1 ? observedModels[0] : "multiple-models", input, output: tokensOut, observedModels };
}

/** A research request the local boundary rejected; never accepted as evidence, never replayed (D-269). */
export class ClaudeResearchError extends Error {
  readonly providerFailure: ProviderFailure;
  constructor(message: string, code: "local_web_action_limit" | "local_web_time_limit" | "local_web_research_boundary", readonly webSearches: number) {
    super(message);
    this.providerFailure = { disposition: "terminal", code, bodyShape: code === "local_web_time_limit" ? "transport" : "stream-error" };
  }
}
export interface ClaudeResearchResult extends ClaudeResult {
  /** Observed WebSearch searches plus WebFetch fetches, not a billing estimate. */
  webSearches: number;
  fetchedUrls: string[];
  fetchedSources: { url: string; title: string; pageAge: null }[];
  researchText: string;
}
/**
 * A public web address by its name: http(s), no credentials, a dotted DNS name
 * that is not an IP literal and not on {@link NON_PUBLIC_WEBFETCH_HOSTS}. This
 * is a name check, not a network boundary: a public name that resolves to a
 * private address is not detected (D-269 records that residual risk).
 */
export function publicWebUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 8_192) return null;
  const url = canonicalizeFetchedUrl(raw);
  if (!url) return null;
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (parsed.username || parsed.password || !host.includes(".") || /^[\d.]+$/.test(host) || NON_PUBLIC_HOST.test(host)) return null;
  return url;
}
const UNCOMPLETED = "Claude did not complete the requested web research. No searched evidence was accepted and no paid fallback was attempted.";
const INVALID_EVENT = "Claude returned invalid web-research event metadata. No paid fallback was attempted.";

/**
 * Reads the CLI's stream-json events for one research request (D-269). This is
 * a LOCAL observation boundary, as on the ChatGPT route: the first observed
 * action beyond the limit stops the CLI; it cannot undo work already run
 * remotely. Counts and provenance come only from typed tool events: a
 * WebSearch's result links and a WebFetch's input URL when the fetch returned
 * HTTP 2xx. URLs in the model's prose never create provenance.
 */
export function claudeResearchObserver(maxActions: number) {
  const actions = new Map<string, { tool: ClaudeResearchTool; url?: string; weight: number; done: boolean }>();
  const sources = new Map<string, { url: string; title: string; pageAge: null }>();
  let final: ClaudeResult | undefined;
  let serverSearches = 0;
  const count = () => Math.max([...actions.values()].reduce((sum, action) => sum + action.weight, 0),
    serverSearches + [...actions.values()].filter(action => action.tool === "WebFetch").length);
  const completed = () => [...actions.values()].filter(action => action.done).reduce((sum, action) => sum + action.weight, 0);
  const reject = (message: string, code: "local_web_action_limit" | "local_web_research_boundary" = "local_web_research_boundary"): never => {
    throw new ClaudeResearchError(message, code, code === "local_web_action_limit" ? count() : completed());
  };
  const enforceLimit = () => {
    if (count() > maxActions) reject(`Claude web research exceeded the local observed-action limit (${maxActions}). The CLI was stopped; remote work may already have run. No paid fallback was attempted.`, "local_web_action_limit");
  };
  const addSource = (raw: unknown, title: unknown = "") => {
    const url = publicWebUrl(raw);
    if (!url || !sources.has(url) && sources.size >= 200) return;
    const existing = sources.get(url);
    sources.set(url, { url, title: typeof title === "string" && title.trim() ? title.slice(0, 500) : existing?.title ?? "", pageAge: null });
  };
  const blocks = (event: Record<string, unknown>): unknown[] => {
    const message = event.message as { content?: unknown } | undefined;
    if (event.parent_tool_use_id !== undefined && event.parent_tool_use_id !== null) reject("Claude ran a nested agent during web research. No paid fallback was attempted.");
    return Array.isArray(message?.content) ? message.content : [];
  };
  return {
    line(raw: string): void {
      if (!raw.trim()) return;
      if (final) reject(INVALID_EVENT);
      let event: unknown;
      try { event = JSON.parse(raw); } catch { reject(INVALID_EVENT); }
      if (!event || typeof event !== "object" || Array.isArray(event)) reject(INVALID_EVENT);
      const item = event as Record<string, unknown>;
      if (item.type === "system" && item.subtype === "init") {
        const tools = item.tools;
        if (!Array.isArray(tools) || tools.some(tool => typeof tool !== "string" || !RESEARCH_TOOL_SET.has(tool)) ||
            item.mcp_servers !== undefined && (!Array.isArray(item.mcp_servers) || item.mcp_servers.length > 0)) {
          reject("Claude Code offered tools outside WebSearch and WebFetch. No paid fallback was attempted.");
        }
      } else if (item.type === "assistant") {
        for (const block of blocks(item)) {
          const type = block && typeof block === "object" ? (block as { type?: unknown }).type : undefined;
          if (typeof type === "string" && type !== "tool_use" && /tool/.test(type)) reject("Claude returned an unrequested tool action. No paid fallback was attempted.");
          if (type !== "tool_use") continue;
          const { id, name, input } = block as { id?: unknown; name?: unknown; input?: unknown };
          if (typeof name !== "string" || !RESEARCH_TOOL_SET.has(name)) reject("Claude returned an unrequested tool action. No paid fallback was attempted.");
          if (typeof id !== "string" || !id || id.length > 256 || !input || typeof input !== "object") reject(INVALID_EVENT);
          const args = input as { query?: unknown; url?: unknown };
          if (name === "WebSearch" ? typeof args.query !== "string" : typeof args.url !== "string") reject(INVALID_EVENT);
          // Stop the CLI the moment it is asked to fetch a non-public address.
          if (name === "WebFetch" && !publicWebUrl(args.url)) reject("Claude asked to fetch a local, private or non-web address during web research. The CLI was stopped and no research was accepted. No paid fallback was attempted.");
          if (!actions.has(id as string)) actions.set(id as string, { tool: name as ClaudeResearchTool, weight: 1, done: false, ...(name === "WebFetch" ? { url: args.url as string } : {}) });
          enforceLimit();
        }
      } else if (item.type === "user") {
        const results = blocks(item).filter(block => block && typeof block === "object" && (block as { type?: unknown }).type === "tool_result") as { tool_use_id?: unknown; is_error?: unknown }[];
        for (const result of results) {
          const action = typeof result.tool_use_id === "string" ? actions.get(result.tool_use_id) : undefined;
          if (!action || action.done) reject(INVALID_EVENT);
          action!.done = true;
          // A typed result is attributed only when this event carries one tool result.
          const typed = results.length === 1 && result.is_error !== true && item.tool_use_result && typeof item.tool_use_result === "object"
            ? item.tool_use_result as { code?: unknown; results?: unknown; searchCount?: unknown } : undefined;
          if (!typed) continue;
          if (action!.tool === "WebFetch") {
            if (Number.isSafeInteger(typed.code) && (typed.code as number) >= 200 && (typed.code as number) < 300) addSource(action!.url);
            continue;
          }
          if (Number.isSafeInteger(typed.searchCount) && (typed.searchCount as number) > 1) action!.weight = typed.searchCount as number;
          for (const entry of Array.isArray(typed.results) ? typed.results : []) {
            const links = entry && typeof entry === "object" ? (entry as { content?: unknown }).content : undefined;
            for (const link of Array.isArray(links) ? links : []) {
              if (link && typeof link === "object") addSource((link as { url?: unknown }).url, (link as { title?: unknown }).title);
            }
          }
          enforceLimit();
        }
      } else if (item.type === "result") {
        try { final = parseClaudeResultEvent(item); } catch { reject(UNCOMPLETED); }
        if (Array.isArray(item.permission_denials) && item.permission_denials.length > 0) reject("Claude Code denied a requested tool action during web research. No paid fallback was attempted.");
        const usage = item.modelUsage as Record<string, { webSearchRequests?: unknown }>;
        serverSearches = Object.values(usage).reduce((sum, entry) => sum + (Number.isSafeInteger(entry?.webSearchRequests) && (entry.webSearchRequests as number) > 0 ? entry.webSearchRequests as number : 0), 0);
        enforceLimit();
      }
    },
    finish(): ClaudeResearchResult {
      if (!final || [...actions.values()].some(action => !action.done)) reject(UNCOMPLETED);
      const fetchedSources = [...sources.values()].sort((a, b) => a.url.localeCompare(b.url));
      return { ...final!, webSearches: count(), fetchedSources, fetchedUrls: fetchedSources.map(source => source.url), researchText: final!.text };
    },
    observed: completed,
  };
}

export function claudeIdentity(value: unknown): string {
  const status = value as { loggedIn?: boolean; authMethod?: string; email?: string; orgId?: string } | null;
  if (!status?.loggedIn || status.authMethod !== "claude.ai" || !status.email) {
    throw new Error("Claude subscription sign-in is needed. Run claude auth login in your terminal, then connect again in Settings. Claude API keys remain available as a separate connection.");
  }
  return createHash("sha256").update(JSON.stringify([status.email, status.orgId ?? ""])).digest("hex");
}

/**
 * With `research`, each stdout line goes to its observer as it arrives; an
 * observer rejection stops the CLI at once, and any other failure, including
 * the local deadline, is a typed research rejection (never a replayable one).
 */
async function invoke(args: string[], input = "", signal?: AbortSignal, timeoutMs = 30_000,
  research?: { line: (line: string) => void; observed: () => number }): Promise<string> {
  signal?.throwIfAborted();
  if (runtime().disconnecting) throw new Error("Claude is disconnecting; retry shortly.");
  const executable = claudeExecutable();
  if (!executable) throw new Error("Install the official Claude Code CLI, then restart Metis.");
  const cwd = path.join(aiDirectory(), "claude-work"); ensurePrivateDirectory(cwd);
  const child = spawn(/* turbopackIgnore: true */ executable.command, [...executable.prefix, ...args], { cwd, env: claudeEnvironment(), windowsHide: true, shell: false, stdio: "pipe" });
  runtime().children.add(child);
  child.stderr.resume(); // Never surface CLI diagnostics or account details.
  child.stdin.on("error", () => {});
  return new Promise((resolve, reject) => {
    let output = ""; let canceled = false; let received = 0; let timedOut = false;
    let rejected: Error | undefined;
    const decoder = new StringDecoder("utf8");
    const abort = () => { canceled = true; child.kill("SIGKILL"); };
    const timer = setTimeout(() => { timedOut = true; abort(); }, timeoutMs); timer.unref();
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); runtime().children.delete(child); };
    signal?.addEventListener("abort", abort, { once: true });
    const observe = (text: string, end: boolean) => {
      output += text;
      if (!research || rejected) return;
      try {
        let newline: number;
        while ((newline = output.indexOf("\n")) >= 0) { const line = output.slice(0, newline); output = output.slice(newline + 1); research.line(line); }
        if (end && output) { const line = output; output = ""; research.line(line); }
      } catch (error) { rejected = error instanceof ClaudeResearchError ? error : new ClaudeResearchError(INVALID_EVENT, "local_web_research_boundary", research.observed()); abort(); }
    };
    child.stdout.on("data", (data: Buffer) => {
      const text = decoder.write(data); received += text.length;
      if (received > MAX_OUTPUT_CHARS) {
        if (research && !rejected) rejected = new ClaudeResearchError("Claude response exceeded the local size limit. No paid fallback was attempted.", "local_web_research_boundary", research.observed());
        abort(); return;
      }
      observe(text, false);
    });
    child.once("error", () => { cleanup(); reject(new Error("Claude Code could not start. Check the CLI installation.")); });
    child.once("close", code => {
      cleanup();
      if (!canceled && code === 0) observe(decoder.end(), true);
      if (!research) { if (canceled || code !== 0) reject(new Error(failure)); else resolve(output); return; }
      if (rejected) reject(rejected);
      else if (timedOut) reject(new ClaudeResearchError("Claude web research reached the local time limit. No research was accepted and no paid fallback was attempted.", "local_web_time_limit", research.observed()));
      else if (canceled || code !== 0) reject(new ClaudeResearchError("Claude web research ended before completion. No searched evidence was accepted and no paid fallback was attempted.", "local_web_research_boundary", research.observed()));
      else resolve("");
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

export async function runClaude(id: string, model: string, prompt: string, signal?: AbortSignal, effort?: ChatGptEffort): Promise<ClaudeResult>;
export async function runClaude(id: string, model: string, prompt: string, signal: AbortSignal | undefined, effort: ChatGptEffort | undefined, research: { maxActions: number }): Promise<ClaudeResearchResult>;
export async function runClaude(id: string, model: string, prompt: string, signal?: AbortSignal, effort?: ChatGptEffort, research?: { maxActions: number }): Promise<ClaudeResult | ClaudeResearchResult> {
  const generation = runtime().generation;
  const identity = await withAiStore(store => {
    claimAiRuntime(store);
    if (store.claude?.id !== id || !store.claude.connected) throw new Error("Claude connection is disconnected. Connect it in Settings.");
    return store.claude.identity;
  });
  const currentIdentity = claudeIdentity(JSON.parse(await invoke(["auth", "status"], "", signal)));
  if (identity !== currentIdentity) throw new Error("Claude Code's account changed. Reconnect in Settings before running a report.");
  if (runtime().generation !== generation || readAiStore()?.claude?.id !== id) throw new Error("Claude connection was canceled.");
  if (!research) return parseClaudeResult(await invoke(claudeRunArgs(model, effort), prompt, signal, 45 * 60_000));
  if (!Number.isSafeInteger(research.maxActions) || research.maxActions < 1) throw new Error("Invalid Claude research limit");
  const observer = claudeResearchObserver(research.maxActions);
  await invoke(claudeRunArgs(model, effort, true), prompt, signal, CLAUDE_RESEARCH_TIMEOUT_MS, observer);
  return observer.finish();
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
