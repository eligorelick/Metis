import { describe, expect, it } from "vitest";

import { CLOSE_SETTLE_MS, isUsSessionOpen, lastUsSessionClose, quoteTtlMs } from "@/providers/usSession";

const BASE = 15 * 60_000;
const at = (iso: string) => new Date(iso);
const closeOf = (iso: string) => new Date(lastUsSessionClose(at(iso))).toISOString();

describe("US session clock", () => {
  it("opens at 09:30 and closes at 16:00 New York on weekdays", () => {
    expect(isUsSessionOpen(at("2026-10-27T13:29:59Z"))).toBe(false); // Tue 09:29:59 EDT
    expect(isUsSessionOpen(at("2026-10-27T13:30:00Z"))).toBe(true);
    expect(isUsSessionOpen(at("2026-10-27T19:59:59Z"))).toBe(true);
    expect(isUsSessionOpen(at("2026-10-27T20:00:00Z"))).toBe(false); // 16:00 EDT
    expect(isUsSessionOpen(at("2026-10-31T15:00:00Z"))).toBe(false); // Saturday
    expect(isUsSessionOpen(at("2026-11-01T15:00:00Z"))).toBe(false); // Sunday
  });

  it("follows New York daylight saving time", () => {
    // DST ended 2026-11-01: Monday's open is 14:30 UTC, not 13:30.
    expect(isUsSessionOpen(at("2026-11-02T13:30:00Z"))).toBe(false);
    expect(isUsSessionOpen(at("2026-11-02T14:30:00Z"))).toBe(true);
    // A close before the change keeps its own offset.
    expect(closeOf("2026-11-02T14:00:00Z")).toBe("2026-10-30T20:00:00.000Z");
    // DST began 2026-03-08: Friday's close was 21:00 UTC (16:00 EST).
    expect(closeOf("2026-03-09T13:00:00Z")).toBe("2026-03-06T21:00:00.000Z");
  });

  it("finds the latest close at or before now, skipping weekends", () => {
    expect(closeOf("2026-10-26T23:06:37Z")).toBe("2026-10-26T20:00:00.000Z");
    expect(closeOf("2026-10-26T20:00:00Z")).toBe("2026-10-26T20:00:00.000Z");
    expect(closeOf("2026-10-26T19:59:00Z")).toBe("2026-10-23T20:00:00.000Z"); // Monday before the close: Friday's
    expect(closeOf("2026-10-27T03:00:00Z")).toBe("2026-10-26T20:00:00.000Z"); // Monday 23:00 New York
    expect(closeOf("2026-10-31T15:00:00Z")).toBe("2026-10-30T20:00:00.000Z");
  });
});

describe("quoteTtlMs", () => {
  it("keeps the plain TTL while the session is open", () => {
    expect(quoteTtlMs(BASE, at("2026-10-27T15:00:00Z"))).toBe(BASE);
  });

  /**
   * NVDA report #48 (2026-10-26): its quotes were fetched at 22:44 UTC, after
   * the 20:00 close, and reused at 23:06 as "served past cache TTL".
   */
  it("keeps a quote fetched after the close fresh until the next open", () => {
    const now = at("2026-10-26T23:06:37Z");
    const ttl = quoteTtlMs(BASE, now);
    const fetchedAt = (iso: string) => now.getTime() - Date.parse(iso);
    expect(fetchedAt("2026-10-26T22:44:47Z")).toBeLessThanOrEqual(ttl);
    expect(fetchedAt("2026-10-26T20:30:00Z")).toBeLessThanOrEqual(ttl);
    // Fetched inside the settle window or before the close: not the final price.
    expect(fetchedAt("2026-10-26T20:29:59Z")).toBeGreaterThan(ttl);
    expect(fetchedAt("2026-10-26T19:55:00Z")).toBeGreaterThan(ttl);
    expect(CLOSE_SETTLE_MS).toBe(30 * 60_000);
    // Still fresh at Tuesday 09:29; the open restores the plain TTL.
    expect(quoteTtlMs(BASE, at("2026-10-27T13:29:00Z"))).toBe(Date.parse("2026-10-27T13:29:00Z") - Date.parse("2026-10-26T20:30:00Z"));
    expect(quoteTtlMs(BASE, at("2026-10-27T13:30:00Z"))).toBe(BASE);
  });

  it("never shortens the plain TTL inside the settle window", () => {
    expect(quoteTtlMs(BASE, at("2026-10-26T20:10:00Z"))).toBe(BASE);
  });
});
