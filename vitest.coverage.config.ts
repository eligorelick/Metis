import { defineConfig } from "vitest/config";
import product from "./vitest.config";
import { RISK_SOURCE_MANIFEST } from "./vitest.shared";

// Vitest's perFile switch applies to every threshold group. Enforce the
// original two policies in check-coverage.ts after this single collection.
export default defineConfig({
  ...product,
  test: {
    ...product.test,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: [...product.test!.coverage!.include!, ...RISK_SOURCE_MANIFEST],
      reportsDirectory: "coverage/product",
    },
  },
});
