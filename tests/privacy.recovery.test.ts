import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { createSectionCheckpoint } from "@/pipeline/stageC/sectionCheckpoint";
it("documents independently retained section recovery in storage, retention and deletion (SEC-207)", () => {
  const privacy = fs.readFileSync("docs/PRIVACY.md", "utf8");
  for (const heading of ["Where local data is kept", "Retention", "Deleting local data"]) {
    const section = privacy.split(`## ${heading}`)[1]?.split("\n## ")[0] ?? "";
    expect(section).toContain("recovery/sections");
  }
  expect(fs.readFileSync("docs/OPERATIONS.md", "utf8")).toContain("recovery/sections");
});
it("retains plain section text, writer evidence and usage after DB deletion (SEC-207 control)", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "p6-recovery-"));
  try {
    const database = path.join(root, "test.db"); fs.writeFileSync(database, "synthetic");
    const directory = path.join(root, "recovery", "sections"); const checkpoint = createSectionCheckpoint("synthetic-job", directory);
    checkpoint.save("analyst", { overview: "synthetic section" }, { overview: { digest: "a".repeat(64), model: "example" } });
    checkpoint.record("analyst", { input: 1 }); fs.unlinkSync(database);
    expect(checkpoint.load("analyst")).toEqual({ overview: "synthetic section" }); expect(checkpoint.loadEvidence("analyst").overview.model).toBe("example");
    expect(fs.readdirSync(directory).some((file) => file.endsWith(".usage.jsonl"))).toBe(true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
