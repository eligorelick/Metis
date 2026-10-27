import "server-only";
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { defaultDataDir } from "@/db/paths";
import { PassSettlementHookError } from "@/pipeline/jobArtifacts";
import type { SectionEvidence } from "@/pipeline/stageC/continuation";
import { ProviderExecutionSchema } from "@/report/schema";

const SectionEvidenceSchema = z.object({
  digest: z.string().regex(/^[0-9a-f]{64}$/),
  model: z.string().min(1).max(256).optional(),
  execution: ProviderExecutionSchema.optional(),
}).strict();

/** Local recovery only. Identity binds the job, evidence, model and run options. */
export function createSectionCheckpoint(identity: string, directory = path.join(defaultDataDir(), "recovery", "sections")) {
  const filename = (field: string) => path.join(directory, createHash("sha256").update(JSON.stringify([identity, field])).digest("hex") + ".json");
  const read = (field: string): { completed: Record<string, unknown>; evidence?: unknown } | null => {
    try {
      const file = filename(field);
      if (fs.statSync(file).size > 4_000_000) return null;
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      return data.version === 1 && data.identity === identity && data.field === field && data.completed && typeof data.completed === "object" && !Array.isArray(data.completed) ? data : null;
    } catch { return null; }
  };
  return {
    record(field: string, telemetry: unknown, owner?: { jobId: string; attemptId: string; runGeneration: number }): void {
      try {
        fs.mkdirSync(directory, { recursive: true });
        fs.appendFileSync(filename(field) + ".usage.jsonl", JSON.stringify({ requestId: randomUUID(), observedAt: new Date().toISOString(), identity, field, owner: owner ?? null, telemetry }) + "\n", { mode: 0o600, flush: true });
      } catch (cause) { throw new PassSettlementHookError("could not save section usage observation", { cause }); }
    },
    load(field: string): Record<string, unknown> {
      return read(field)?.completed ?? {};
    },
    /**
     * D-116: the saved evidence of each section's writer. A checkpoint saved
     * before D-116 has none, and an unreadable entry is dropped on its own.
     */
    loadEvidence(field: string): Record<string, SectionEvidence> {
      const data = read(field);
      if (data === null || data.evidence === null || typeof data.evidence !== "object" || Array.isArray(data.evidence)) return {};
      return Object.fromEntries(Object.entries(data.evidence as Record<string, unknown>).flatMap(([key, value]) => {
        const parsed = SectionEvidenceSchema.safeParse(value);
        return parsed.success && key in data.completed ? [[key, parsed.data]] : [];
      }));
    },
    save(field: string, completed: Record<string, unknown>, evidence: Record<string, SectionEvidence> = {}): void {
      const file = filename(field);
      const temporary = `${file}.${randomUUID()}.tmp`;
      try {
        const kept = Object.fromEntries(Object.entries(evidence).filter(([key]) => key in completed));
        const json = JSON.stringify({ version: 1, identity, field, completed, ...(Object.keys(kept).length > 0 ? { evidence: kept } : {}) });
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
