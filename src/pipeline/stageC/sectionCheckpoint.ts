import "server-only";
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { defaultDataDir } from "@/db/paths";
import { PassSettlementHookError } from "@/pipeline/jobArtifacts";

/** Local recovery only. Identity binds the job, evidence, model and run options. */
export function createSectionCheckpoint(identity: string, directory = path.join(defaultDataDir(), "recovery", "sections")) {
  const filename = (field: string) => path.join(directory, createHash("sha256").update(JSON.stringify([identity, field])).digest("hex") + ".json");
  return {
    record(field: string, telemetry: unknown, owner?: { jobId: string; attemptId: string; runGeneration: number }): void {
      try {
        fs.mkdirSync(directory, { recursive: true });
        fs.appendFileSync(filename(field) + ".usage.jsonl", JSON.stringify({ requestId: randomUUID(), observedAt: new Date().toISOString(), identity, field, owner: owner ?? null, telemetry }) + "\n", { mode: 0o600, flush: true });
      } catch (cause) { throw new PassSettlementHookError("could not save section usage observation", { cause }); }
    },
    load(field: string): Record<string, unknown> {
      try {
        const file = filename(field);
        if (fs.statSync(file).size > 4_000_000) return {};
        const data = JSON.parse(fs.readFileSync(file, "utf8"));
        return data.version === 1 && data.identity === identity && data.field === field && data.completed && typeof data.completed === "object" && !Array.isArray(data.completed) ? data.completed : {};
      } catch { return {}; }
    },
    save(field: string, completed: Record<string, unknown>): void {
      const file = filename(field);
      const temporary = `${file}.${randomUUID()}.tmp`;
      try {
        const json = JSON.stringify({ version: 1, identity, field, completed });
        if (Buffer.byteLength(json) > 4_000_000) throw new Error("section checkpoint exceeded recovery size limit");
        fs.mkdirSync(directory, { recursive: true });
        fs.writeFileSync(temporary, json, { mode: 0o600, flush: true });
        fs.renameSync(temporary, file);
      } catch (cause) {
        throw new PassSettlementHookError("could not save section recovery checkpoint", { cause });
      } finally {
        if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
      }
    },
  };
}
