// Same-report harness preload (scripts/golden). Loaded with --import before the
// worker, after tsx. Two jobs:
//   1. Refuse every network capability. The suite's own guard
//      (tests/setup/noLiveNetwork.ts) is installed first; it allows loopback and
//      the EDGAR live-smoke opt-in, so this then blocks fetch, sockets, TLS and
//      DNS outright. A harness run has no reason to open any connection.
//   2. Map "server-only" to an empty module, as vitest's alias does
//      (tests/server-only.mock.ts), so server modules load outside Next.
import dns from "node:dns";
import dnsPromises from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import Module, { createRequire, register, syncBuiltinESMExports } from "node:module";

await import("../../tests/setup/noLiveNetwork.ts");

const blocked = (what) => function blockedNetwork() {
  throw new Error(`golden harness: network blocked (${what})`);
};
globalThis.fetch = async (input) => {
  throw new Error(`golden harness: network blocked (fetch ${String(input?.url ?? input)})`);
};
if (typeof globalThis.WebSocket === "function") globalThis.WebSocket = blocked("WebSocket");
for (const [label, transport] of [["http", http], ["https", https]]) {
  transport.request = blocked(`${label}.request`);
  transport.get = blocked(`${label}.get`);
}
net.connect = blocked("net.connect");
net.createConnection = blocked("net.createConnection");
tls.connect = blocked("tls.connect");
for (const [label, resolver] of [["dns", dns], ["dns/promises", dnsPromises]]) {
  for (const key of ["lookup", "resolve", "resolve4", "resolve6", "resolveAny"]) {
    if (typeof resolver[key] === "function") {
      Object.defineProperty(resolver, key, { value: blocked(`${label}.${key}`), writable: true, configurable: true });
    }
  }
}
syncBuiltinESMExports();

// tsx compiles the TypeScript sources to CommonJS, so "server-only" usually
// arrives through require(): seed the require cache with an empty module.
const requireFromHere = createRequire(import.meta.url);
const serverOnly = requireFromHere.resolve("server-only");
const emptyModule = new Module(serverOnly);
emptyModule.filename = serverOnly;
emptyModule.loaded = true;
emptyModule.exports = {};
requireFromHere.cache[serverOnly] = emptyModule;
// An ES module import of it goes through the resolver instead.
register("data:text/javascript," + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier === "server-only") return { url: "data:text/javascript,export%20%7B%7D", shortCircuit: true };
  return next(specifier, context);
}`));
