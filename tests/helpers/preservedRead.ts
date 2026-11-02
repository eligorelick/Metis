import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const hash = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
/** Audit a real read/render operation on a disposable stored-report copy. */
export function preservedRead(file: string, operation: () => void): boolean {
 const before = hash(file);
 operation();
 return hash(file) === before;
}
