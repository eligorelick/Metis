import path from "node:path";
import { describe, expect, it } from "vitest";
import { aggregate, checkCoverage, CORE_THRESHOLDS } from "../scripts/check-coverage";

const root = process.cwd();
const summary = (covered: number, total = 100) => Object.fromEntries(
  ["statements", "branches", "functions", "lines"].map(metric => [metric, {
    covered, total, skipped: 0, pct: total ? Math.floor(10000 * covered / total) / 100 : 100,
  }]),
) as Parameters<typeof aggregate>[0][number];
const report = (core: number, risk: number) => ({
  [path.join(root, "core.ts")]: summary(core),
  [path.join(root, "risk.ts")]: summary(risk),
});
const check = (core: number, risk: number) => checkCoverage(report(core, risk), root, ["core.ts"], ["risk.ts"]);

describe("single collection coverage policy", () => {
  it("collects the exact union without applying Vitest's global threshold switch", async () => {
    const { default: config } = await import("../vitest.coverage.config");
    const { RISK_SOURCE_MANIFEST } = await import("../vitest.shared");
    const { default: product } = await import("../vitest.config");
    expect(config.test?.include).toBe(product.test?.include);
    expect(config.test?.exclude).toBe(product.test?.exclude);
    expect(product.test?.coverage?.thresholds).toMatchObject(CORE_THRESHOLDS);
    expect(CORE_THRESHOLDS).toEqual({ statements: 90, branches: 84, functions: 95, lines: 93 });
    expect(config.test?.coverage?.include).toEqual(["src/pipeline/stageB/**/*.ts", "src/report/schema.ts", ...RISK_SOURCE_MANIFEST]);
    expect(config.test?.coverage).not.toHaveProperty("thresholds");
    expect(config.test?.coverage?.reportsDirectory).toBe("coverage/product");
  });
  it("passes at the original thresholds and uses Istanbul truncation", () => {
    expect(check(95, 85).errors).toEqual([]);
    expect(aggregate([summary(1, 3)]).lines.pct).toBe(33.33);
    expect(aggregate([summary(0, 0)]).lines.pct).toBe(100);
  });
  it("rejects a risk file below its floor despite high aggregate coverage", () => {
    expect(check(100, 84).errors).toContain("risk.ts: statements 84% < 85%");
  });
  it("rejects a core file below its floor", () => {
    expect(check(84, 100).errors).toContain("core.ts: statements 84% < 85%");
  });
  it("rejects the core aggregate even when every per-file floor passes", () => {
    expect(check(89, 100).errors).toContain("core aggregate: statements 89% < 90%");
    expect(check(94, 100).errors).toContain("core aggregate: functions 94% < 95%");
  });
  it("fails closed on absent files and non-finite percentages", () => {
    expect(checkCoverage({}, root, ["missing.ts"], []).errors).toContain("Missing coverage: missing.ts");
    expect(check(100, NaN).errors).toContain("risk.ts: lines NaN% < 85%");
  });
  it("sums counts rather than averaging file percentages", () => {
    expect(aggregate([summary(1, 1), summary(1, 3)]).lines.pct).toBe(50);
  });
});
