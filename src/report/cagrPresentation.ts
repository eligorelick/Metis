import type { TracedNumber } from "@/report/schema";

export { N4B_CAGR_DISPLAY_CUTOFF } from "@/report/versions";

/** Collapse only equal measured windows and observations; preserve distinct rates and periods. */
export function collapseMeasuredCagrValues<T extends { period?: string; value: TracedNumber }>(values: readonly T[]): T[] {
  const identity = (v: T): string | null => {
    const measured = /^\d+y CAGR \(measured over (\d+(?:\.\d+)?)y\)$/.exec(v.period ?? "")?.[1];
    return measured === undefined ? null : JSON.stringify([measured, v.value.value, v.value.asOf, v.value.source, v.value.currency, v.value.unit]);
  };
  const counts = new Map<string, number>();
  for (const value of values) { const key = identity(value); if (key !== null) counts.set(key, (counts.get(key) ?? 0) + 1); }
  const seen = new Set<string>();
  return values.flatMap(value => {
    const key = identity(value);
    if (key === null || counts.get(key) === 1) return [value];
    if (seen.has(key)) return [];
    seen.add(key);
    const measured = /measured over (\d+(?:\.\d+)?)y/.exec(value.period!)![1];
    return [{ ...value, period: `${measured}y CAGR (available history)`, value: { ...value.value, period: `${measured}y` } }];
  });
}
