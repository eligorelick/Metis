import "server-only";
import { createHash } from "node:crypto";
import { getConfig } from "@/config/env";
import { runStageB, type ComputedMetrics } from "@/pipeline/compute";
import { canonicalSnapshotJson, CURRENT_SNAPSHOT_VERSIONS } from "@/pipeline/runInputSnapshot";
import type { DataBundle } from "@/pipeline/types";
import { balanceIntegrityView } from "@/pipeline/balanceIntegrity";
import { fundamentalsChartDataFromBundle } from "@/components/charts/map";
import type { FundamentalsChartData } from "@/components/charts/FundamentalsCharts";

interface CompanyAnalysis { computed: ComputedMetrics; fundamentals: FundamentalsChartData }

// Keep derived display results only, not the much larger source bundles. This
// cache is process-local; input snapshots remain the durable source of truth.
const metricsCache = new Map<string, CompanyAnalysis>();
const MAX_CACHED_RESULTS = 8;

/** Reuse unchanged ticker calculations without sharing mutable results. */
export function getCompanyAnalysis(bundle: DataBundle): CompanyAnalysis {
  const config = { evIncludeLeases: getConfig().evIncludeLeases };
  // Include every input value: a corrected quote with the same collected-at
  // date must invalidate the result, as must a setting or version change.
  // Canonical ordering also matches fresh inputs to their persisted recall.
  const key = createHash("sha256").update(canonicalSnapshotJson([CURRENT_SNAPSHOT_VERSIONS, config, bundle])).digest("hex");
  const cached = metricsCache.get(key);
  if (cached) {
    metricsCache.delete(key);
    metricsCache.set(key, cached);
    return structuredClone(cached);
  }
  const computed = runStageB(bundle, config);
  const analysis = { computed, fundamentals: fundamentalsChartDataFromBundle(balanceIntegrityView(bundle), computed) };
  metricsCache.set(key, structuredClone(analysis));
  if (metricsCache.size > MAX_CACHED_RESULTS) metricsCache.delete(metricsCache.keys().next().value!);
  return analysis;
}
