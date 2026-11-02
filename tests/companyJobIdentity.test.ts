import { afterEach, describe, expect, it, vi } from "vitest";

// The page's initial job observation (JOB-301): it only reads job identity and
// never queues, claims or dispatches work.
async function identityWith(jobRunner: Record<string, unknown>) {
  vi.resetModules();
  vi.doMock("@/pipeline/jobRunner", () => jobRunner);
  const { activeRunIdentity } = await import("@/pipeline/companyJobIdentity");
  return activeRunIdentity;
}

afterEach(() => {
  vi.doUnmock("@/pipeline/jobRunner");
  vi.resetModules();
});

describe("activeRunIdentity", () => {
  it("prefers the active job for the symbol", async () => {
    const getLatestResumableJobForSymbol = vi.fn(() => "job-resumable");
    const activeRunIdentity = await identityWith({ getReusableActiveJobForSymbol: () => ({ jobId: "job-active" }), getLatestResumableJobForSymbol });
    await expect(activeRunIdentity("FIG")).resolves.toBe("job-active");
    expect(getLatestResumableJobForSymbol).not.toHaveBeenCalled();
  });

  it("falls back to the newest resumable job when none is active", async () => {
    const activeRunIdentity = await identityWith({ getReusableActiveJobForSymbol: () => null, getLatestResumableJobForSymbol: (symbol: string) => `resumable-${symbol}` });
    await expect(activeRunIdentity("FIG")).resolves.toBe("resumable-FIG");
  });

  it("returns null when the symbol has neither", async () => {
    const activeRunIdentity = await identityWith({ getReusableActiveJobForSymbol: () => undefined, getLatestResumableJobForSymbol: () => null });
    await expect(activeRunIdentity("FIG")).resolves.toBeNull();
  });

  it("returns null instead of failing the page when the job store cannot be read", async () => {
    const activeRunIdentity = await identityWith({ getReusableActiveJobForSymbol: () => { throw new Error("database is locked"); }, getLatestResumableJobForSymbol: () => "unused" });
    await expect(activeRunIdentity("FIG")).resolves.toBeNull();
  });
});
