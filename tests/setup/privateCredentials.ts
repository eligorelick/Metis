/** A user's saved provider keys must never affect fixture tests or enter test workers. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll } from "vitest";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "metis-test-credentials-"));
const keys = ["LOCALAPPDATA", "XDG_CONFIG_HOME", "HOME", "USERPROFILE"] as const;
const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
for (const key of keys) process.env[key] = directory;
afterAll(() => {
  for (const key of keys) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
  fs.rmSync(directory, { recursive: true, force: true });
});
