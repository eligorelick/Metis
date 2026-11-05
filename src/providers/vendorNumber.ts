/** Vendor amounts can arrive as numeric strings. Blanks read as absent; anything else stays as sent. */
export const coerceVendorNumber = (value: unknown): unknown => {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "string" && /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) {
    return Number(value);
  }
  return value;
};
