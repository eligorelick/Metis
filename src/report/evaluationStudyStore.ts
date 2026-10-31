import fs from "node:fs";
import path from "node:path";
import { hashArtifactBytes } from "@/evaluation/targetDefinition";
import { createStudy, evaluateStudy, registerStudyReport, verifyStudy, verifyStudyRegistration, type EvaluationStudy } from "./evaluationStudy";

/** Exclusive creation also refuses existing links. Keep failed writes for inspection. */
export function writeNewEvaluationJson(filename: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  let fd: number;
  try { fd = fs.openSync(filename, "wx", 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`Destination already exists: ${filename}`, { cause: error });
    throw error;
  }
  try { fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`, "utf8"); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
}
const read = (filename: string): unknown => JSON.parse(fs.readFileSync(filename, "utf8"));
// Fixed-length lowercase hashes avoid case-folding collisions and Windows device names.
const registrationPath = (directory: string, slotId: string) => path.join(directory, "registrations", `${hashArtifactBytes(slotId)}.json`);
export const readEvaluationStudy = (directory: string): EvaluationStudy => verifyStudy(read(path.join(directory, "protocol.json")));

export function initializeEvaluationStudy(directory: string, protocol: unknown, now = new Date().toISOString()): EvaluationStudy {
  const study = createStudy(protocol, now);
  // Never place a new protocol over somebody else's registration directory.
  fs.mkdirSync(path.dirname(directory), { recursive: true });
  fs.mkdirSync(directory);
  writeNewEvaluationJson(path.join(directory, "protocol.json"), study);
  return study;
}

export function enrollEvaluationStudyReport(directory: string, slotId: string, report: unknown, now = new Date().toISOString()) {
  const study = readEvaluationStudy(directory);
  const registration = registerStudyReport(study, slotId, report, now);
  const outputPath = registrationPath(directory, registration.slotId);
  writeNewEvaluationJson(outputPath, registration);
  return { registration, outputPath };
}

/** Always enumerate the protocol. Callers cannot choose a subset of registered issuers. */
export function evaluateStoredStudy(directory: string, outcomes: unknown, asOf: string) {
  const study = readEvaluationStudy(directory);
  const registrations = study.protocol.slots.flatMap(slot => {
    const filename = registrationPath(directory, slot.id);
    let content: unknown;
    try { content = read(filename); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const registration = verifyStudyRegistration(study, content);
    if (registration.slotId !== slot.id) throw new Error("Registration filename/slot mismatch");
    return [registration];
  });
  return evaluateStudy(study, registrations, outcomes, asOf);
}
