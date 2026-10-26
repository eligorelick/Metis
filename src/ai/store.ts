import "server-only";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { z } from "zod";
import { CHATGPT_EFFORTS, validModelId, type AiSelection } from "./contracts";
import { withAiMutex } from "./mutex";
import { PROVIDER_CREDENTIAL_KEYS, type ProviderCredentialKey } from "@/settings/credentialContracts";

export interface ChatGptProfile {
  id: string;
  clientId: string;
  subject?: string;
  email?: string;
  tokens?: { access: string; refresh: string; id: string; expiresAt: number; scopes: string[] };
}
export interface AiStore {
  version: 1;
  hostId: string;
  profiles: ChatGptProfile[];
  gemini: { id: string; connected: boolean } | null;
  selection: AiSelection;
  /** Credential/account writes must not turn the implicit provider default into a user choice. */
  selectionIsDefault?: boolean;
  runtimeOwnerPid?: number;
  providerCredentials?: Partial<Record<ProviderCredentialKey, string>>;
}

// Validate the v1 fields consumed by connection/runtime code before any
// callback can rewrite the file. Unknown metadata is retained, and signed-out
// registrations/selections and historical model IDs remain valid.
const aiStoreSchema = z.object({
  version: z.literal(1),
  hostId: z.string().startsWith("urn:uuid:"),
  profiles: z.array(z.object({
    id: z.string().min(1),
    clientId: z.string().min(1),
    subject: z.string().optional(),
    email: z.string().optional(),
    tokens: z.object({
      access: z.string().min(1), refresh: z.string().min(1), id: z.string().min(1),
      expiresAt: z.number(), scopes: z.array(z.string()),
    }).passthrough().optional(),
  }).passthrough()),
  gemini: z.object({ id: z.string().min(1), connected: z.boolean() }).passthrough().nullable(),
  selection: z.union([
    z.object({ provider: z.enum(["none", "anthropic"]) }).passthrough(),
    z.object({
      provider: z.enum(["chatgpt", "gemini"]),
      connectionId: z.string().min(1), model: z.string().refine(validModelId),
      effort: z.enum(CHATGPT_EFFORTS).optional(),
      serviceTier: z.enum(["default", "fast"]).optional(),
    }).passthrough(),
  ]),
  runtimeOwnerPid: z.number().int().positive().optional(),
  selectionIsDefault: z.boolean().optional(),
  providerCredentials: z.partialRecord(z.enum(PROVIDER_CREDENTIAL_KEYS), z.string().min(1).max(2048)).optional(),
}).passthrough();

export const AI_RUNTIME_CONFLICT_MESSAGE = "AI connections are active in another Metis server. Use that server or stop it before connecting here.";
/** Where the operator is sent: the OPERATIONS.md troubleshooting row for this refusal (audit 2026-10-22 F-12). */
export const AI_RUNTIME_CONFLICT_HELP = 'See "AI store is held by another server" in the troubleshooting table of docs/OPERATIONS.md.';

export function isAiRuntimeConflict(error: unknown): boolean {
  return error instanceof Error && error.message === AI_RUNTIME_CONFLICT_MESSAGE;
}

/** Call under withAiStore: one local server owns connection lifecycles at a time. */
export function claimAiRuntime(store: AiStore): void {
  const owner = store.runtimeOwnerPid;
  if (owner && owner !== process.pid) {
    let alive = true;
    try { process.kill(owner, 0); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") alive = false; }
    if (alive) throw new Error(AI_RUNTIME_CONFLICT_MESSAGE);
  }
  store.runtimeOwnerPid = process.pid;
}

/**
 * Audit 2026-10-22 F-12: claim the runtime before a plan-connection job
 * fetches any data, so a connection owned by another Metis server stops the
 * job at once instead of after the data stage. Without a saved store there is
 * no connection to own, and the pass reports that itself. Throws the same
 * errors `claimAiRuntime` and `withAiStore` throw.
 */
export async function claimAiRuntimeForRun(): Promise<void> {
  if (!fs.existsSync(filePath())) return;
  await withAiStore((store) => claimAiRuntime(store));
}

/** Credentials deliberately ignore database/repository paths and live under the OS user profile. */
export function aiDirectory(): string {
  const base = process.platform === "win32"
    ? process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local")
    : process.platform === "darwin" ? path.join(os.homedir(), "Library", "Application Support")
      : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  const legacy = path.join(base, "Thesis", "ai");
  return fs.existsSync(legacy) ? legacy : path.join(base, "Metis", "ai");
}

export function ensurePrivateDirectory(dir: string): void {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") fs.chmodSync(dir, 0o700);
}

function windowsProtect(input: string, decrypt: boolean): string {
  // Secrets are piped on stdin, never command-line arguments, environment or logs.
  const operation = decrypt ? "Unprotect" : "Protect";
  const script = `Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $r=[Security.Cryptography.ProtectedData]::${operation}($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($r))`;
  try {
    return execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      // First PowerShell startup on a cold Windows host can exceed 15 seconds.
      input, encoding: "utf8", windowsHide: true, timeout: 30_000, maxBuffer: 2_000_000,
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ETIMEDOUT") throw new Error("AI credentials: Windows protection timed out; retry shortly.");
    throw new Error("Unable to access Windows protected AI credentials");
  }
}

function filePath(): string { return path.join(aiDirectory(), "connections.v1.json"); }

let providerCache: { signature: string; values: Readonly<Partial<Record<ProviderCredentialKey, string>>> } | undefined;

/** Reuse the protected store; decrypt only when its atomically replaced file changes. */
export function readProviderCredentials(): Readonly<Partial<Record<ProviderCredentialKey, string>>> {
  const file = filePath();
  let stat: fs.Stats;
  try { stat = fs.statSync(file); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    providerCache = undefined;
    return {};
  }
  const signature = `${file}:${stat.ino}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`;
  if (providerCache?.signature !== signature) {
    providerCache = { signature, values: Object.freeze({ ...readAiStore()?.providerCredentials }) };
  }
  return providerCache.values;
}

export function getProviderCredential(key: ProviderCredentialKey): string | undefined {
  return readProviderCredentials()[key] ?? (process.env[key]?.trim() || undefined);
}

export function readAiStore(): AiStore | null {
  if (!fs.existsSync(filePath())) return null;
  try {
    const envelope = JSON.parse(fs.readFileSync(filePath(), "utf8"));
    const decoded = envelope.protection === "windows-dpapi"
      ? Buffer.from(windowsProtect(envelope.data, true), "base64").toString("utf8")
      : process.platform !== "win32" && envelope.protection === "owner-only" ? envelope.data : null;
    if (decoded === null) throw new Error();
    const value: unknown = JSON.parse(decoded);
    if (!aiStoreSchema.safeParse(value).success) throw new Error();
    return value as AiStore;
  } catch { throw new Error("AI connection storage cannot be read; credentials were not replaced"); }
}

function writeAiStore(store: AiStore): void {
  const data = JSON.stringify(store);
  const envelope = process.platform === "win32"
    ? { protection: "windows-dpapi", data: windowsProtect(Buffer.from(data).toString("base64"), false) }
    : { protection: "owner-only", data };
  const temporary = `${filePath()}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(envelope), { mode: 0o600, flag: "wx" });
    fs.renameSync(temporary, filePath());
    if (process.platform !== "win32") fs.chmodSync(filePath(), 0o600);
  } finally { fs.rmSync(temporary, { force: true }); }
}

/** Cross-process exclusion protects rotating refresh tokens as well as settings writes. */
export async function withAiStore<T>(fn: (store: AiStore) => Promise<T> | T): Promise<T> {
  ensurePrivateDirectory(aiDirectory());
  return withAiMutex(path.join(aiDirectory(), "connections.lock"), async () => {
    const store = readAiStore() ?? { version: 1, hostId: `urn:uuid:${randomUUID()}`, profiles: [], gemini: null, selection: { provider: process.env.ANTHROPIC_API_KEY?.trim() ? "anthropic" : "none" }, selectionIsDefault: true };
    const result = await fn(store);
    writeAiStore(store);
    return result;
  });
}
