import { beforeEach, expect, it, vi } from "vitest";
import type { DataBundle } from "@/pipeline/types";
import { completeCurrencyBundle } from "./helpers/currencyBundle";

const fake = vi.hoisted(() => ({
  config: { evIncludeLeases: false },
  charts: vi.fn(() => ({ revenue: [], margins: [], fcf: [], shareCount: [], currency: "USD" })),
  versions: { stageB: "current", reportSpec: "current", scoreBands: "current" },
  compute: vi.fn((_bundle: DataBundle, config: { evIncludeLeases: boolean }) => ({ notes: [String(config.evIncludeLeases)] })),
}));
vi.mock("@/components/charts/map", () => ({ fundamentalsChartDataFromBundle: fake.charts }));
vi.mock("@/pipeline/balanceIntegrity", () => ({ balanceIntegrityView: (bundle: DataBundle) => bundle }));
vi.mock("@/config/env", () => ({ getConfig: () => fake.config }));
vi.mock("@/pipeline/compute", () => ({ runStageB: fake.compute }));
vi.mock("@/pipeline/runInputSnapshot", async importOriginal => ({
  ...await importOriginal<typeof import("@/pipeline/runInputSnapshot")>(), CURRENT_SNAPSHOT_VERSIONS: fake.versions,
}));

beforeEach(() => {
  vi.resetModules(); fake.compute.mockClear(); fake.charts.mockClear(); fake.config.evIncludeLeases = false; fake.versions.stageB = "current";
});

it("reuses unchanged inputs across page visits without sharing mutable presentation results", async () => {
  const { getCompanyAnalysis } = await import("@/components/report/companyAnalysis");
  const bundle = completeCurrencyBundle({});
  const first = getCompanyAnalysis(bundle);
  first.computed.notes.push("presentation mutation");
  first.fundamentals.currency = "EUR";
  const recalled = getCompanyAnalysis(structuredClone(bundle));
  expect(recalled.computed.notes).toEqual(["false"]);
  expect(recalled.fundamentals.currency).toBe("USD");
  // Stored snapshots sort object keys; recall should reuse the fresh result.
  getCompanyAnalysis(Object.fromEntries(Object.entries(bundle).reverse()) as DataBundle);
  expect(fake.compute).toHaveBeenCalledTimes(1);
  expect(fake.charts).toHaveBeenCalledTimes(1);
});

it("recalculates when source values change even if the ticker and collection date do not", async () => {
  const { getCompanyAnalysis } = await import("@/components/report/companyAnalysis");
  const bundle = completeCurrencyBundle({});
  getCompanyAnalysis(bundle);
  const updated = structuredClone(bundle);
  if (!updated.quote.ok) throw new Error("fixture requires a quote");
  updated.quote.value.data.rows[0]!.price = 123;
  getCompanyAnalysis(updated);
  expect(fake.compute).toHaveBeenCalledTimes(2);
});

it("invalidates calculations when settings or implementation versions change", async () => {
  const { getCompanyAnalysis } = await import("@/components/report/companyAnalysis");
  const bundle = completeCurrencyBundle({});
  expect(getCompanyAnalysis(bundle).computed.notes).toEqual(["false"]);
  fake.config.evIncludeLeases = true;
  expect(getCompanyAnalysis(bundle).computed.notes).toEqual(["true"]);
  fake.versions.stageB = "upgraded";
  getCompanyAnalysis(bundle);
  expect(fake.compute).toHaveBeenCalledTimes(3);
});

it("retries failed calculations and bounds the retained results", async () => {
  const { getCompanyAnalysis } = await import("@/components/report/companyAnalysis");
  const bundle = completeCurrencyBundle({});
  fake.compute.mockImplementationOnce(() => { throw new Error("calculation failed"); });
  expect(() => getCompanyAnalysis(bundle)).toThrow("calculation failed");
  expect(getCompanyAnalysis(bundle).computed.notes).toEqual(["false"]);
  for (let i = 0; i < 8; i++) getCompanyAnalysis({ ...bundle, symbol: `TICKER${i}` });
  getCompanyAnalysis(bundle);
  expect(fake.compute).toHaveBeenCalledTimes(11);
});
