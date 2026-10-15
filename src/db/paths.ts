import "server-only";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { metisEnv } from "@/config/namespace";

/** Discover legacy data in place. Even an empty existing directory may belong to an older install. */
export function defaultDataDir(): string {
  const fromEnv = metisEnv("DATA_DIR")?.trim();
  if (fromEnv) return fromEnv;

  let base: string;
  let legacyName = "Thesis";
  let canonicalName = "Metis";
  if (process.platform === "win32" && (process.env.LOCALAPPDATA?.trim() || process.env.APPDATA?.trim())) {
    base = (process.env.LOCALAPPDATA?.trim() || process.env.APPDATA?.trim())!;
  } else if (process.platform === "darwin") {
    base = path.join(os.homedir(), "Library", "Application Support");
  } else {
    base = process.env.XDG_DATA_HOME?.trim() || path.join(os.homedir(), ".local", "share");
    legacyName = "thesis";
    canonicalName = "metis";
  }
  const legacy = path.join(base, legacyName);
  return fs.existsSync(legacy) ? legacy : path.join(base, canonicalName);
}

export function hasExplicitDbPath(): boolean {
  return Boolean(metisEnv("DB_PATH")?.trim());
}

/** Never migrate or overwrite an existing database. Explicit file overrides remain authoritative. */
export function defaultDbPath(): string {
  const fromEnv = metisEnv("DB_PATH")?.trim();
  if (fromEnv) return fromEnv;
  const directory = defaultDataDir();
  const legacy = path.join(directory, "thesis.db");
  return ["", "-wal", "-shm"].some((suffix) => fs.existsSync(`${legacy}${suffix}`))
    ? legacy : path.join(directory, "metis.db");
}
