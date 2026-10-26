import { describe, expect, it, vi } from "vitest";

import { series } from "@/providers/fred";

/**
 * Audit 2026-10-22 B-1: FRED can answer HTTP 200 with an HTML page (the St.
 * Louis Fed's site-maintenance page, or any outage page an edge serves). Neither
 * endpoint ever returns HTML as data, so the page is a transient outage: the
 * request is retried with backoff, the keyed path then tries fredgraph.csv, and
 * the gap names an HTML page rather than an unknown series id.
 */
const NO_THROTTLE = { minRequestIntervalMs: 0, timeoutMs: 0 } as const;

const html = (body = "<!DOCTYPE html><html><head><title>Down</title></head></html>", contentType = "text/html; charset=utf-8") =>
  new Response(body, { status: 200, headers: { "content-type": contentType } });
const csv = (body: string) => new Response(body, { status: 200, headers: { "content-type": "text/csv" } });

describe("FRED HTTP 200 HTML outage pages (B-1)", () => {
  it("returns the fredgraph.csv data when the keyed API serves HTML", async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (input: unknown) => {
      const url = String(input);
      urls.push(url);
      return url.includes("api.stlouisfed.org") ? html() : csv("observation_date,DGS10\n2026-10-20,4.01\n2026-10-21,4.02\n");
    });
    const result = await series("DGS10", {}, { ...NO_THROTTLE, apiKey: "k".repeat(32), retryDelaysMs: [0, 0], fetchImpl });
    expect(result).toMatchObject({ ok: true, value: { data: [{ date: "2026-10-20", value: 4.01 }, { date: "2026-10-21", value: 4.02 }] } });
    // The API is retried (one try + two backoffs) before the CSV fallback.
    expect(urls.filter((u) => u.includes("api.stlouisfed.org"))).toHaveLength(3);
    expect(urls.at(-1)).toContain("fredgraph.csv");
  });

  it("retries the keyed API with backoff and recovers when the page clears", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      return calls === 1 ? html() : new Response(JSON.stringify({ observations: [{ date: "2026-10-21", value: "4.02" }] }), { status: 200 });
    });
    const result = await series("DGS10", {}, { ...NO_THROTTLE, apiKey: "k".repeat(32), retryDelaysMs: [0], fetchImpl });
    expect(result).toMatchObject({ ok: true, value: { data: [{ date: "2026-10-21", value: 4.02 }] } });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("makes more than one attempt when both endpoints serve HTML and names the HTML page in the gap", async () => {
    const fetchImpl = vi.fn(async () => html("<html><body>private upstream text</body></html>", "text/html"));
    const result = await series("DGS10", {}, { ...NO_THROTTLE, apiKey: "k".repeat(32), retryDelaysMs: [0, 0], fetchImpl });
    expect(result.ok).toBe(false);
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(1);
    if (!result.ok) {
      expect(result.gap.reason).toMatch(/FRED API returned a maintenance\/HTML page \(HTTP 200\)/);
      expect(result.gap.reason).toMatch(/fredgraph\.csv returned a maintenance\/HTML page \(HTTP 200\)/);
      expect(result.gap.reason).not.toMatch(/unknown series id|unrecognized payload/);
    }
    expect(JSON.stringify(result)).not.toContain("private");
  });

  it("recognises an HTML body by its leading '<' when the content type is missing or wrong", async () => {
    const fetchImpl = vi.fn(async () => new Response("  \n<html><title>x</title></html>", { status: 200, headers: { "content-type": "text/plain" } }));
    const result = await series("UNRATE", {}, { ...NO_THROTTLE, retryDelaysMs: [0], fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.gap.reason).toMatch(/fredgraph\.csv returned a maintenance\/HTML page \(HTTP 200\)/);
      expect(result.gap.reason).not.toMatch(/unknown series id/);
    }
  });

  it("still names the St. Louis Fed maintenance page when that is the page served", async () => {
    const fetchImpl = async () => html("<html><title>Site Maintenance | St. Louis Fed<</title></html>");
    const result = await series("DGS10", {}, { ...NO_THROTTLE, apiKey: "k".repeat(32), retryDelaysMs: [], fetchImpl });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.gap.reason).toMatch(/FRED API returned a site maintenance page \(HTTP 200\).*fredgraph\.csv returned a site maintenance page/);
  });

  it("keeps a non-HTML CSV miss worded as a possible unknown series id, without retrying it", async () => {
    const fetchImpl = vi.fn(async () => csv("not,a,fred,header\n"));
    const result = await series("NOPE", {}, { ...NO_THROTTLE, retryDelaysMs: [0, 0], fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.gap.reason).toMatch(/non-CSV for NOPE \(unknown series id\?\)/);
  });

  it("reads a CSV body as data even when an edge labels it text/html: the body decides", async () => {
    const fetchImpl = vi.fn(async () => html("observation_date,DGS10\n2026-10-21,4.02\n"));
    const result = await series("DGS10", {}, { ...NO_THROTTLE, retryDelaysMs: [0, 0], fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: true, value: { data: [{ date: "2026-10-21", value: 4.02 }] } });
  });
});
