import { holdProcessLifetimeLock } from "../../src/ai/mutex.ts";
globalThis.fetch = () => { throw new Error("Network prohibited"); };
if (!holdProcessLifetimeLock(process.argv[2])) throw new Error("runtime lock unavailable");
process.send?.("held");
process.on("message", () => process.exit(0));
