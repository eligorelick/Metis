import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { companyData, jobRunInputs, jobs } from "@/db/schema";
import { canonicalEntitySymbol, sameEntitySymbol } from "@/symbol";
import { getConfig } from "@/config/env";
import { captureRunInputSnapshot, canonicalSnapshotJson, verifyRunInputSnapshot } from "./runInputSnapshot";
import { readRunInputSnapshot } from "./runInputSnapshotStore";
import type { DataBundle } from "./types";

function usableProfile(bundle: DataBundle): boolean {
  return bundle.profile?.ok === true && bundle.profile.value.data.rows.length > 0;
}

/** Durable recall, with no provider calls, expiry or background revalidation. */
export function readCompanyData(symbol: string): DataBundle | null {
  const canonical = canonicalEntitySymbol(symbol);
  if (!canonical) return null;
  const db = getDb();
  const row = db.select().from(companyData).where(eq(companyData.symbol, canonical)).get();
  let bundle: DataBundle | null = null;
  if (row) {
    try {
      const candidate = verifyRunInputSnapshot(JSON.parse(row.snapshotJson)).content.bundle;
      if (usableProfile(candidate)) bundle = candidate;
    } catch { /* Try the independently retained run input. */ }
  }
  const runs = db.select({ hash: jobRunInputs.snapshotHash, capturedAt: jobRunInputs.capturedAt }).from(jobRunInputs)
    .innerJoin(jobs, eq(jobs.id, jobRunInputs.jobId))
    .where(sql`upper(replace(${jobs.symbol}, '-', '.')) = ${canonical}`)
    .orderBy(desc(jobRunInputs.capturedAt), desc(jobRunInputs.runGeneration)).all();
  for (const run of runs) {
    if (bundle && run.capturedAt <= bundle.builtAt) break;
    try {
      const candidate = readRunInputSnapshot(run.hash)?.content.bundle;
      if (candidate && usableProfile(candidate) && sameEntitySymbol(candidate.symbol, symbol) && (!bundle || candidate.builtAt > bundle.builtAt)) bundle = candidate;
    } catch { /* Retain the last readable ticker snapshot. */ }
  }
  return bundle && sameEntitySymbol(bundle.symbol, symbol) ? bundle : null;
}

export function retainCompanyData(bundle: DataBundle): void {
  const symbol = canonicalEntitySymbol(bundle.symbol);
  if (!symbol) throw new Error("Invalid ticker");
  const snapshot = captureRunInputSnapshot(bundle, { evIncludeLeases: getConfig().evIncludeLeases });
  const values = { symbol, snapshotJson: canonicalSnapshotJson(snapshot), builtAt: bundle.builtAt };
  getDb().insert(companyData).values(values).onConflictDoUpdate({ target: companyData.symbol, set: values,
    setWhere: sql`${companyData.builtAt} <= ${bundle.builtAt}` }).run();
}

export async function loadCompanyData(symbol: string, fetcher: (symbol: string) => Promise<DataBundle>, refresh = false): Promise<DataBundle> {
  if (!refresh) {
    const stored = readCompanyData(symbol);
    if (stored) return stored;
  }
  const bundle = await fetcher(symbol);
  if (!usableProfile(bundle)) throw new Error("Company data is unavailable; retained inputs were not replaced.");
  retainCompanyData(bundle);
  return bundle;
}
