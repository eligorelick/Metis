import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseEnv, resetConfigCache } from "@/config/env";
import { createDatabase } from "@/db";
import { defaultDataDir, defaultDbPath, hasExplicitDbPath } from "@/db/paths";
import { judgeOrderSettingFor, type PassDeps } from "@/pipeline/stageC/passes";
import { aiDirectory } from "@/ai/store";
import { assertSameOrigin, ensureRequestToken, _resetRequestTokenForTests, REQUEST_TOKEN_HEADER } from "@/app/api/sameOrigin";

const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform")!;
let directory: string;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "metis-compat-"));
  vi.stubEnv("LOCALAPPDATA", directory); vi.stubEnv("APPDATA", directory);
  vi.stubEnv("XDG_DATA_HOME", directory); vi.stubEnv("XDG_CONFIG_HOME", directory);
  vi.spyOn(os, "homedir").mockReturnValue(directory);
  for (const key of Object.keys(process.env)) if (/^(METIS|THESIS)_/.test(key)) vi.stubEnv(key, undefined);
  resetConfigCache(); _resetRequestTokenForTests();
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); Object.defineProperty(process, "platform", platformDescriptor); resetConfigCache(); _resetRequestTokenForTests(); fs.rmSync(directory, { recursive: true, force: true }); });

const values = {
  MAX_ACTIVE_JOBS: "3", MAX_ACTIVE_LLM_CALLS: "4", MAX_JOB_COST_USD: "1.234567",
  MAX_ROLLING_COST_USD: "2.5", ROLLING_COST_WINDOW_MINUTES: "60", STATEMENT_SOURCE: "edgar",
  PAID_PASS_LEASE_SECONDS: "800", JOB_LEASE_SECONDS: "1100", STREAM_IDLE_SECONDS: "0",
  RESERVATION_MODE: "pass", RESUME_ON_START: "0", TOKEN_FILE: "custom-token", JUDGE_ORDER: "both", EV_INCLUDE_LEASES: "1",
};
describe("Metis configuration compatibility", () => {
  it("accepts every canonical setting with the exact legacy behavior", () => {
    const env = (prefix: string) => Object.fromEntries(Object.entries(values).map(([key, value]) => [prefix + key, value]));
    expect(parseEnv(env("METIS_"))).toEqual(parseEnv(env("THESIS_")));
    expect(parseEnv(env("METIS_")).maxActiveJobs).toBe(3);
  });
  it.each(Object.entries(values))("canonical %s wins over the legacy value, even blank", (key, value) => {
    expect(parseEnv({ [`METIS_${key}`]: value, [`THESIS_${key}`]: "invalid" })).toEqual(parseEnv({ [`THESIS_${key}`]: value }));
    expect(parseEnv({ [`METIS_${key}`]: "", [`THESIS_${key}`]: value })).toEqual(parseEnv({}));
  });
  it.each(["MAX_ACTIVE_JOBS", "MAX_ACTIVE_LLM_CALLS", "MAX_JOB_COST_USD", "MAX_ROLLING_COST_USD", "ROLLING_COST_WINDOW_MINUTES", "STATEMENT_SOURCE", "PAID_PASS_LEASE_SECONDS", "JOB_LEASE_SECONDS", "STREAM_IDLE_SECONDS", "RESERVATION_MODE", "RESUME_ON_START"])("invalid canonical %s cannot fall back around validation", (key) => {
    expect(() => parseEnv({ [`METIS_${key}`]: "invalid", [`THESIS_${key}`]: values[key as keyof typeof values] })).toThrow();
  });
  it("applies canonical precedence in the direct standalone judge-order reader", () => {
    vi.stubEnv("THESIS_JUDGE_ORDER", "both");
    expect(judgeOrderSettingFor({} as PassDeps)).toBe("both");
    vi.stubEnv("METIS_JUDGE_ORDER", "bear-first");
    expect(judgeOrderSettingFor({} as PassDeps)).toBe("bear-first");
    vi.stubEnv("METIS_JUDGE_ORDER", "invalid");
    expect(judgeOrderSettingFor({} as PassDeps)).toBe("random");
    vi.stubEnv("METIS_JUDGE_ORDER", "");
    expect(judgeOrderSettingFor({} as PassDeps)).toBe("random");
    expect(judgeOrderSettingFor({ judgeOrder: "bull-first" } as PassDeps)).toBe("bull-first");
  });
  it("retains lease relationships and spending precision guards in the canonical namespace", () => {
    expect(() => parseEnv({ METIS_PAID_PASS_LEASE_SECONDS: "1000", METIS_JOB_LEASE_SECONDS: "900" })).toThrow();
    expect(() => parseEnv({ METIS_MAX_JOB_COST_USD: "0.0000001" })).toThrow();
  });
});

describe("persistent path compatibility", () => {
  it.each(["win32", "darwin", "linux"])("creates fresh Metis paths and conservatively discovers existing data on %s", (platform) => {
    Object.defineProperty(process, "platform", { value: platform, configurable: true });
    const base = platform === "darwin" ? path.join(directory, "Library", "Application Support") : directory;
    const fresh = path.join(base, platform === "linux" ? "metis" : "Metis");
    const legacy = path.join(base, platform === "linux" ? "thesis" : "Thesis");
    expect(defaultDataDir()).toBe(fresh); expect(defaultDbPath()).toBe(path.join(fresh, "metis.db"));
    fs.mkdirSync(legacy, { recursive: true }); fs.writeFileSync(path.join(legacy, "thesis.db"), "preserved");
    fs.mkdirSync(fresh, { recursive: true }); fs.writeFileSync(path.join(fresh, "metis.db"), "separate");
    expect(defaultDataDir()).toBe(legacy); expect(defaultDbPath()).toBe(path.join(legacy, "thesis.db"));
    expect(fs.readFileSync(path.join(legacy, "thesis.db"), "utf8")).toBe("preserved");
  });
  it("preserves an old database in an explicitly selected directory and respects canonical blank overrides", () => {
    vi.stubEnv("METIS_DATA_DIR", directory); vi.stubEnv("THESIS_DATA_DIR", "ignored");
    fs.writeFileSync(path.join(directory, "thesis.db"), "old");
    expect(defaultDbPath()).toBe(path.join(directory, "thesis.db"));
    vi.stubEnv("METIS_DB_PATH", ""); vi.stubEnv("THESIS_DB_PATH", "ignored.db");
    expect(hasExplicitDbPath()).toBe(false); expect(defaultDbPath()).toBe(path.join(directory, "thesis.db"));
    vi.stubEnv("METIS_DB_PATH", " canonical.db "); expect(defaultDbPath()).toBe("canonical.db");
  });
  it("keeps legacy SQLite recovery companions discoverable even if the base file is missing", () => {
    vi.stubEnv("METIS_DATA_DIR", directory);
    const legacy = path.join(directory, "thesis.db");
    fs.writeFileSync(`${legacy}-wal`, "recovery bytes");
    expect(defaultDbPath()).toBe(legacy);
    expect(fs.readFileSync(`${legacy}-wal`, "utf8")).toBe("recovery bytes");
    expect(fs.existsSync(path.join(directory, "metis.db"))).toBe(false);
  });
  it.each(["METIS", "THESIS"])("%s legacy-import opt-in copies only isolated data while retaining the original", (namespace) => {
    const workspace = path.join(directory, "workspace");
    const source = path.join(workspace, "data", "thesis.db");
    const target = path.join(directory, "destination");
    const original = createDatabase(source);
    original.sqlite.prepare("INSERT INTO settings (key,value) VALUES ('preserved','research')").run();
    original.sqlite.close();
    const bytes = fs.readFileSync(source);
    vi.spyOn(process, "cwd").mockReturnValue(workspace);
    vi.stubEnv("METIS_DATA_DIR", target);
    vi.stubEnv(`${namespace}_IMPORT_LEGACY_DB`, "1");
    const copied = createDatabase();
    try { expect(copied.sqlite.prepare("SELECT value FROM settings WHERE key='preserved'").get()).toEqual({ value: "research" }); }
    finally { copied.sqlite.close(); }
    expect(fs.readFileSync(source)).toEqual(bytes);
  });
  it("canonical blank import control suppresses a legacy opt-in without mutating the original", () => {
    const workspace = path.join(directory, "workspace");
    const source = path.join(workspace, "data", "thesis.db");
    const original = createDatabase(source); original.sqlite.close();
    const bytes = fs.readFileSync(source);
    vi.spyOn(process, "cwd").mockReturnValue(workspace);
    vi.stubEnv("METIS_DATA_DIR", path.join(directory, "destination"));
    vi.stubEnv("METIS_IMPORT_LEGACY_DB", ""); vi.stubEnv("THESIS_IMPORT_LEGACY_DB", "1");
    const copy = vi.spyOn(fs, "copyFileSync");
    const fresh = createDatabase(); fresh.sqlite.close();
    expect(copy).not.toHaveBeenCalled(); expect(fs.readFileSync(source)).toEqual(bytes);
  });
  it("keeps the existing connection directory and creates no files during discovery", () => {
    const base = process.platform === "darwin" ? path.join(directory, "Library", "Application Support") : directory;
    expect(aiDirectory()).toBe(path.join(base, "Metis", "ai"));
    const old = path.join(base, "Thesis", "ai"); fs.mkdirSync(old, { recursive: true });
    fs.writeFileSync(path.join(old, "connections.v1.json"), "opaque credentials");
    expect(aiDirectory()).toBe(old); expect(fs.readFileSync(path.join(old, "connections.v1.json"), "utf8")).toBe("opaque credentials");
    expect(fs.existsSync(path.join(base, "Metis"))).toBe(false);
  });
});

describe("Metis script request security", () => {
  function request(headers: Record<string, string>) { return new Request("http://localhost:3000/api/report", { method: "POST", headers: { host: "localhost:3000", ...headers } }); }
  it("accepts either header, with explicit canonical values taking precedence", () => {
    vi.stubEnv("METIS_TOKEN_FILE", path.join(directory, "token"));
    const token = ensureRequestToken().token;
    expect(REQUEST_TOKEN_HEADER).toBe("x-metis-token");
    expect(assertSameOrigin(request({ "x-metis-token": token }))).toBeNull();
    expect(assertSameOrigin(request({ "x-thesis-token": token }))).toBeNull();
    expect(assertSameOrigin(request({ "x-metis-token": "", "x-thesis-token": token }))?.status).toBe(403);
    expect(assertSameOrigin(request({ "x-metis-token": "wrong", "x-thesis-token": token }))?.status).toBe(403);
    expect(assertSameOrigin(request({ "x-metis-token": token, "x-thesis-token": "wrong" }))).toBeNull();
  });
  it.each(["x-metis-token", "x-thesis-token"])("%s never bypasses origin, metadata or host guards", (header) => {
    vi.stubEnv("METIS_TOKEN_FILE", path.join(directory, "token")); const token = ensureRequestToken().token;
    expect(assertSameOrigin(request({ [header]: token, origin: "http://evil.example" }))?.status).toBe(403);
    expect(assertSameOrigin(request({ [header]: token, "sec-fetch-site": "cross-site" }))?.status).toBe(403);
    expect(assertSameOrigin(request({ [header]: token, host: "evil.example" }))?.status).toBe(403);
  });
  it("uses the canonical allowed host and a blank canonical does not allow the legacy host", () => {
    vi.stubEnv("METIS_ALLOWED_HOST", "metis.example:3000"); vi.stubEnv("THESIS_ALLOWED_HOST", "old.example:3000");
    expect(assertSameOrigin(request({ host: "metis.example:3000", origin: "http://metis.example:3000" }))).toBeNull();
    expect(assertSameOrigin(request({ host: "old.example:3000", origin: "http://old.example:3000" }))?.status).toBe(403);
    vi.stubEnv("METIS_ALLOWED_HOST", "");
    expect(assertSameOrigin(request({ host: "old.example:3000", origin: "http://old.example:3000" }))?.status).toBe(403);
  });
});
