import { describe, expect, it } from "vitest";
import { coerceVendorNumber } from "@/providers/vendorNumber";

describe("vendor number rule", () => {
  it.each([["1200", 1200], ["-3.5", -3.5], [" 1e3 ", 1000], [".5", 0.5], ["+7", 7]])("reads %j as a number", (raw, value) => {
    expect(coerceVendorNumber(raw)).toBe(value);
  });
  it.each([null, undefined, ""])("reads %j as absent", raw => {
    expect(coerceVendorNumber(raw)).toBeUndefined();
  });
  it.each(["n/a", "1,200", "2026-09-30", 42, true])("leaves %j as sent", raw => {
    expect(coerceVendorNumber(raw)).toBe(raw);
  });
});
