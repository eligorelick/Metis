import "server-only";
import { eq, inArray, and } from "drizzle-orm";
import { getDb } from "@/db";
import { jobs, reports } from "@/db/schema";
import { sameEntitySymbol } from "@/symbol";

/** Keep jobs, source snapshots and cost records for accounting; remove the saved report only. */
export function deleteSavedReport(id: number, symbol: string): "deleted" | "missing" | "active" {
  return getDb().transaction(tx => {
    const row = tx.select().from(reports).where(eq(reports.id, id)).get();
    if (!row || !sameEntitySymbol(row.symbol, symbol)) return "missing";
    if (["queued", "running"].includes(row.status) || tx.select({ id: jobs.id }).from(jobs)
      .where(and(eq(jobs.reportId, id), inArray(jobs.status, ["queued", "running"]))).get()) return "active";
    tx.delete(reports).where(eq(reports.id, id)).run();
    return "deleted";
  });
}
