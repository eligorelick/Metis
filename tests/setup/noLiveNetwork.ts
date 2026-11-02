import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import dnsPromises from "node:dns/promises";
import { syncBuiltinESMExports } from "node:module";

/**
 * Global test guard: no test may reach the live network.
 *
 * The suite's freedom from live provider traffic used to rest on fixture
 * content — `buildDataBundle` builds a real `YahooClient` when `opts.yahoo` is
 * absent, and the only thing stopping the keyless layer from calling it in nine
 * degradation scenarios was that their FMP profile fixtures happen to omit
 * `cik`. Adding a `cik` to one of those fixtures would have opened a live
 * socket with nothing failing loudly. This guard replaces `globalThis.fetch`
 * for every test file so that reaching a non-loopback host is a test failure
 * with the offending method and URL in the message.
 *
 * Loopback (`127.0.0.1`, `localhost`, `::1`) passes through to the real fetch
 * so tests that stand up a local server keep working. `EDGAR_LIVE_SMOKE=1`
 * — the existing opt-in for the two-request live smoke in
 * `tests/edgar.client.test.ts` — lets requests to `sec.gov` hosts through and
 * NOTHING ELSE: the smoke needs two SEC URLs, and every other test in the
 * same run keeps the guard (before the 2026-09-06 audit, F203, the opt-in
 * disabled the guard for the whole suite).
 *
 * Scope: this guard replaces `fetch` in the vitest process it is installed in.
 * The TypeScript worker fixtures under `tests/fixtures/` import it themselves;
 * child processes spawned by tests (the CLI tests) are separate processes with
 * their own `fetch`, and nothing here reaches them (F204).
 *
 * Tests that install their own `globalThis.fetch` and restore the previous
 * value (`tests/helpers/auditFixtureComparison.ts`) keep working: the value
 * they save and put back is this guard, not a raw fetch.
 */

type FetchFn = typeof globalThis.fetch;
type FetchInput = Parameters<FetchFn>[0];
type FetchInit = Parameters<FetchFn>[1];

const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "::1"]);

const GUARD_MARKER = Symbol.for("thesis.tests.noLiveNetworkGuard");

/** `Request` carries its own resolved URL; everything else stringifies. */
function urlOf(input: FetchInput): string {
  if (typeof Request !== "undefined" && input instanceof Request) return input.url;
  return String(input);
}

function methodOf(input: FetchInput, init: FetchInit): string {
  const fromInit = init?.method;
  if (typeof fromInit === "string" && fromInit.length > 0) return fromInit.toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request) return input.method.toUpperCase();
  return "GET";
}

/**
 * True only for loopback literals. An unparseable URL is treated as non-local
 * so the guard fails closed rather than waving through something it cannot
 * classify.
 */
export function isLoopbackUrl(url: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return false;
  }
  // `new URL("http://[::1]/").hostname` keeps the brackets.
  const bare = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
  return LOOPBACK_HOSTNAMES.has(bare.toLowerCase());
}

/**
 * Wrap `realFetch` so non-loopback requests reject. Exported for the guard's
 * own test, which observes the pass-through without opening a socket.
 */
/** The only hosts the EDGAR live smoke opt-in may reach. */
export function isLiveSmokeUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "sec.gov" || host.endsWith(".sec.gov");
  } catch {
    return false;
  }
}

export function createNoLiveNetworkFetch(realFetch: FetchFn): FetchFn {
  const guarded: FetchFn = (input, init) => {
    const url = urlOf(input);
    if (process.env.EDGAR_LIVE_SMOKE === "1" && isLiveSmokeUrl(url)) return realFetch(input, init);
    if (isLoopbackUrl(url)) return realFetch(input, init);
    return Promise.reject(
      new Error(`live network is disabled in the test suite: ${methodOf(input, init)} ${url}`),
    );
  };
  Object.defineProperty(guarded, GUARD_MARKER, { value: true });
  return guarded;
}

function requireAllowedDestination(url: string): void {
  if (isLoopbackUrl(url) || (process.env.EDGAR_LIVE_SMOKE === "1" && isLiveSmokeUrl(url))) return;
  throw new Error(`live network is disabled in the test suite: ${url}`);
}

/** Idempotent: a second call leaves the already-installed guard in place. */
export function installNoLiveNetworkGuard(): void {
  const current = globalThis.fetch as (FetchFn & { [GUARD_MARKER]?: boolean }) | undefined;
  if (typeof current === "function" && current[GUARD_MARKER] !== true)
    globalThis.fetch = createNoLiveNetworkFetch(current);
  for (const transport of [http, https]) {
    for (const key of ["request", "get"] as const) {
      const original = transport[key];
      if (Reflect.get(original, GUARD_MARKER)) continue;
      const guarded = new Proxy(original, { apply(target, receiver, args) {
        const input = args[0];
        const options = typeof input === "object" && !(input instanceof URL) ? input : args[1];
        const host = options?.hostname ?? options?.host;
        // Options override a URL in Node's request overloads. Refuse sockets
        // without an established loopback/SEC destination (including socketPath).
        const destination = options?.socketPath ? "invalid:" : host !== undefined
          ? `${options?.protocol ?? "http:"}//${host}/`
          : typeof input === "string" || input instanceof URL ? String(input) : "http://localhost/";
        requireAllowedDestination(destination);
        return Reflect.apply(target, receiver, args);
      }});
      Object.defineProperty(guarded, GUARD_MARKER, { value: true });
      transport[key] = guarded;
    }
  }
  for (const resolver of [dns, dnsPromises]) {
    const original = resolver.lookup;
    if (Reflect.get(original, GUARD_MARKER)) continue;
    const guarded = new Proxy(original, { apply(target, receiver, args) {
      const host = String(args[0]);
      const bare = host.replace(/^\[|\]$/g, "");
      const destination = `http://${bare.includes(":") ? `[${bare}]` : bare}/`;
      try { requireAllowedDestination(destination); }
      catch (error) {
        if (resolver === dnsPromises) return Promise.reject(error);
        throw error;
      }
      return Reflect.apply(target, receiver, args);
    }});
    Object.defineProperty(guarded, GUARD_MARKER, { value: true });
    Object.defineProperty(resolver, "lookup", { value: guarded, writable: true, configurable: true });
  }
  syncBuiltinESMExports();
}

installNoLiveNetworkGuard();
