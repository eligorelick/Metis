import { expect } from "vitest";

// N4a L6: restore only the counted 48-character peer-methodology addition.
// Numbers and every other string stay pinned. No stamp transition is owned here.
export function restoreN4aPeerWordingGolden<T>(value: T, count: number): T {
  const now = "same-label peers whose route or held-for-sale lender cash-flow applicability the profile-only screen cannot confirm";
  const before = "same-label peers whose route the profile-only screen cannot confirm";
  const text = JSON.stringify(value);
  expect(text.split(now).length - 1).toBe(count);
  return JSON.parse(text.split(now).join(before)) as T;
}
