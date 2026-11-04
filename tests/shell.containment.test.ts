import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("contains absolutely positioned screen-reader labels within the scrollable main", () => {
  const source = readFileSync("src/components/shell.tsx", "utf8");
  const main = source.match(/<main\b[^>]*className="([^"]+)"/)?.[1].split(" ");
  expect(main).toContain("relative");
  expect(main).toContain("overflow-y-auto");
});
