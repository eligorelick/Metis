/** Initial page observation never queues, claims or dispatches work. */
export async function activeRunIdentity(symbol: string): Promise<string | null> {
  try {
    const { getReusableActiveJobForSymbol, getLatestResumableJobForSymbol } = await import("@/pipeline/jobRunner");
    return getReusableActiveJobForSymbol(symbol)?.jobId ?? getLatestResumableJobForSymbol(symbol);
  } catch { return null; }
}
