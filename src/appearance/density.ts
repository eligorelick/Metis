import type { CookieDocument } from "./preference";

/** Nonsecret display spacing; never changes report content or computation. */
export type UiDensity = "comfortable" | "compact";
export const UI_DENSITY_COOKIE = "metis-ui-density-v1";
export function parseUiDensity(value: unknown): UiDensity {
  return value === "compact" ? "compact" : "comfortable";
}
export function persistUiDensity(density: UiDensity, storage: CookieDocument, secure: boolean): boolean {
  const value = parseUiDensity(density);
  try {
    storage.cookie = `${UI_DENSITY_COOKIE}=${value}; Path=/; Max-Age=15552000; SameSite=Lax${secure ? "; Secure" : ""}`;
    return storage.cookie.split(";").some(pair => pair.trim() === `${UI_DENSITY_COOKIE}=${value}`);
  } catch { return false; }
}
