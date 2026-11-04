/** Restore only the reviewed public-polish wording for existing byte-level pins.
 * New reader wording is checked separately; numbers and all other bytes stay pinned.
 */
const wording = [
  [
    " (house rule: median of methods).",
    " (house rule, WS6 D-18: median of methods; the former \"lower of the 3y/5y CAGR\" and sign-disagreement rules are RETIRED)."
  ],
  [
    "treated as non-operating assets, and the equity bridge adds them back at carrying value less the tax a sale would owe",
    "non-operating, house rule D-60, and the equity bridge adds them back at carrying value less the tax a sale would owe, house rule D-65"
  ],
  [
    "ranked in. The capital block's house-default free cash flow subtracts SBC and is a DIFFERENT figure; the two are never mixed",
    "ranked in. The capital block's house-default free cash flow subtracts SBC and is a DIFFERENT figure; the two are never mixed (WS6 review, SHOULD-FIX 4)"
  ]
] as const;
export function restorePublicPolishGolden<T>(value: T): T {
  return JSON.parse(JSON.stringify(value), (_key, item: unknown) => {
    if (typeof item !== "string") return item;
    return wording.reduce((text, [current, previous]) => text.replaceAll(current, previous), item);
  }) as T;
}
