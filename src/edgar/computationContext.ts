/**
 * Per-run computation context: exact-input memoisation for pure derivations
 * that several readers in one run repeat on the same evidence (P13: a
 * definition used in several places is computed once and read everywhere).
 *
 * Scope. A context exists only while a synchronous run step executes inside
 * `withComputationContext` (Stage B's `runStageB` and the Stage C payload's
 * `assembleContextPayload`). Outside a scope nothing is cached and every call
 * computes exactly as before. The scope is cleared when the step returns, so no
 * entry can outlive the step, reach another run, or reach another company in
 * the same process. A synchronous step cannot interleave with any other code,
 * so a module-level slot is enough; a promise returned from the scope runs its
 * continuation after the scope has closed, uncached.
 *
 * Keys. An entry is found only by the exact inputs that produced it: the
 * identity of the input object (a WeakMap, so a caller that filters, rebuilds
 * or replaces the facts gets a different key) and a canonical, lossless
 * encoding of every other argument (`canonicalKey`). An argument the encoder
 * cannot represent exactly makes the call uncacheable instead of approximate.
 *
 * Sharing. `memoize` hands every caller its own deep copy (`structuredClone`),
 * so a caller that mutates what it receives cannot change what another caller
 * or a later hit sees. `memoizeShared` hands out the stored value itself and is
 * used only where every reader is proven read-only (see its call sites).
 */

interface ComputationContext {
  readonly byObject: Map<string, WeakMap<object, Map<string, unknown>>>;
  readonly byKey: Map<string, Map<string, unknown>>;
}

let active: ComputationContext | null = null;

/** Run `fn` with a fresh computation context, or inside the enclosing one when already in a scope. */
export function withComputationContext<T>(fn: () => T): T {
  if (active !== null) return fn();
  active = { byObject: new Map(), byKey: new Map() };
  try {
    return fn();
  } finally {
    active = null;
  }
}

/** True while a computation context is open (diagnostics and tests). */
export function computationContextActive(): boolean {
  return active !== null;
}

/**
 * A lossless canonical encoding: object keys sorted, `undefined` members kept
 * distinct from absent ones, and -0, NaN and ±Infinity spelled out. Returns
 * null for anything that is not plain data (functions, class instances, Maps,
 * symbols, cycles), which the caller must treat as "do not cache".
 */
export function canonicalKey(value: unknown): string | null {
  const seen = new Set<object>();
  const encode = (v: unknown): string | null => {
    if (v === null) return "null";
    switch (typeof v) {
      case "undefined": return "u";
      case "boolean": return v ? "t" : "f";
      case "string": return JSON.stringify(v);
      case "number": return Object.is(v, -0) ? "n-0" : Number.isNaN(v) ? "nNaN" : `n${String(v)}`;
      case "object": break;
      default: return null;
    }
    const object = v as object;
    if (seen.has(object)) return null;
    seen.add(object);
    let parts: string[] | null = [];
    let open = "{", close = "}";
    if (Array.isArray(object)) {
      open = "["; close = "]";
      if (Object.keys(object).length !== object.length) parts = null; // sparse or extra members
      else for (const item of object) { const part = encode(item); if (part === null) { parts = null; break; } parts.push(part); }
    } else if ((Object.getPrototypeOf(object) === Object.prototype || Object.getPrototypeOf(object) === null) && Object.getOwnPropertySymbols(object).length === 0) {
      for (const key of Object.keys(object).sort()) {
        const part = encode((object as Record<string, unknown>)[key]);
        if (part === null) { parts = null; break; }
        parts.push(`${JSON.stringify(key)}:${part}`);
      }
    } else parts = null;
    const out = parts === null ? null : `${open}${parts.join(",")}${close}`;
    seen.delete(object);
    return out;
  };
  return encode(value);
}

function slotFor(namespace: string, input: object | string, key: string): { get: () => { hit: boolean; value: unknown }; set: (value: unknown) => void } | null {
  if (active === null) return null;
  if (typeof input === "string") {
    let byKey = active.byKey.get(namespace);
    if (!byKey) active.byKey.set(namespace, byKey = new Map());
    const full = `${input.length}:${input}\u0000${key}`;
    return { get: () => ({ hit: byKey.has(full), value: byKey.get(full) }), set: (value) => { byKey.set(full, value); } };
  }
  let byObject = active.byObject.get(namespace);
  if (!byObject) active.byObject.set(namespace, byObject = new WeakMap());
  let map = byObject.get(input);
  if (!map) byObject.set(input, map = new Map());
  const entries = map;
  return { get: () => ({ hit: entries.has(key), value: entries.get(key) }), set: (value) => { entries.set(key, value); } };
}

/**
 * Compute once per (namespace, input identity or string, canonical args) within
 * the open context; every caller receives its own deep copy. Outside a context,
 * or when `args` cannot be encoded exactly, this is just `compute()`.
 */
export function memoize<T>(namespace: string, input: object | string, args: unknown, compute: () => T): T {
  const key = active === null ? null : canonicalKey(args);
  const slot = key === null ? null : slotFor(namespace, input, key);
  if (slot === null) return compute();
  const found = slot.get();
  if (found.hit) return structuredClone(found.value) as T;
  // The stored value is never handed out: the first caller also gets a copy,
  // so no caller holds a reference into the stored result or into its input.
  const value = compute();
  let copy: T;
  try {
    copy = structuredClone(value);
  } catch {
    // Not copyable (it holds a function or similar): hand the value to this
    // caller alone and keep nothing, so later callers compute their own.
    return value;
  }
  slot.set(value);
  return copy;
}

/**
 * As `memoize`, but every caller receives the same stored value. Only for
 * results whose readers are proven not to mutate them.
 */
export function memoizeShared<T>(namespace: string, input: object | string, args: unknown, compute: () => T): T {
  const key = active === null ? null : canonicalKey(args);
  const slot = key === null ? null : slotFor(namespace, input, key);
  if (slot === null) return compute();
  const found = slot.get();
  if (found.hit) return found.value as T;
  const value = compute();
  slot.set(value);
  return value;
}
