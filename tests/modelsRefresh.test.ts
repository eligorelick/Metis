/**
 * Pure-function coverage for scripts/models-refresh.mjs. The script's main()
 * only runs when invoked as the entry point, so importing it here performs no
 * network access; the merge and parse helpers get fixture inputs.
 */
import path from "node:path";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import { MODEL_REGISTRY, parseModelRegistry } from "@/models/registry";

const SCRIPT = path.join(process.cwd(), "scripts", "models-refresh.mjs");

interface RefreshModule {
  htmlToText(html: string): string;
  parsePricingText(text: string, names: readonly string[]): { parsed: Record<string, Record<string, number>>; unparsed: string[] };
  mergeModelList(registry: unknown, api: ApiModel[], today: string): { registry: typeof MODEL_REGISTRY; report: string[]; candidates: NewModelCandidate[] };
  describeNewModel(registry: unknown, api: ApiModel, today: string): NewModelCandidate | { reason: string };
  applyPricing(registry: unknown, parsed: Record<string, Record<string, number>>): { registry: typeof MODEL_REGISTRY; report: string[] };
  refreshRegistryFile(registryPath: string, api: ApiModel[], html: string, today: string, write: boolean): { registry: typeof MODEL_REGISTRY; report: string[] };
}

type ApiModel = Record<string, unknown> & { id: string };
interface NewModelCandidate {
  template: (typeof MODEL_REGISTRY)["models"][number];
  entry: Omit<(typeof MODEL_REGISTRY)["models"][number], "pricing">;
}

/** A Models API record shaped like the documented response, for a model newer than every registry entry of its line. */
function apiModel(id: string, line: string, displayName: string, overrides: Record<string, unknown> = {}): ApiModel {
  const yes = { supported: true };
  return {
    type: "model",
    id,
    display_name: displayName,
    created_at: "2027-02-03T00:00:00Z",
    lifecycle: "active",
    line,
    max_input_tokens: 2_000_000,
    max_tokens: 256_000,
    capabilities: {
      structured_outputs: yes,
      server_tools: { supported: true, web_search: yes, code_execution: yes },
      effort: { supported: true, low: yes, medium: yes, high: yes, xhigh: yes, max: yes },
      thinking: { supported: true, types: { adaptive: yes, between_tools: yes, disabled: { supported: false }, enabled: { supported: false } } },
    },
    ...overrides,
  };
}

interface PriceRow { inputPerMTok: number; outputPerMTok: number; cacheWrite5mPerMTok: number; cacheWrite1hPerMTok: number; cacheReadPerMTok: number }
const PRICING_HEADERS = "<tr><th>Name</th><th>Input</th><th>Output</th><th>5m writes</th><th>1h writes</th><th>Hits and refreshes</th></tr>";
const priceRow = (name: string, p: PriceRow): string =>
  `<tr><td><a>${name}</a></td><td>$${p.inputPerMTok}</td><td>$${p.outputPerMTok}</td><td>$${p.cacheWrite5mPerMTok}</td><td>$${p.cacheWrite1hPerMTok}</td><td>$${p.cacheReadPerMTok}</td></tr>`;
/** A pricing page holding every registry model at its registry price, plus any extra rows. */
const pricingPage = (extraRows: string[] = []): string =>
  `<table>${PRICING_HEADERS}${MODEL_REGISTRY.models.map((m) => priceRow(m.displayName, m.pricing)).join("")}${extraRows.join("")}</table>`;

async function load(): Promise<RefreshModule> {
  return (await import(pathToFileURL(SCRIPT).href)) as RefreshModule;
}

const clone = () => JSON.parse(JSON.stringify(MODEL_REGISTRY)) as typeof MODEL_REGISTRY;

describe("models-refresh helpers", () => {
  it("syncs display names, flags unlisted and unknown ids, and stamps the snapshot date", async () => {
    const { mergeModelList } = await load();
    const api = [
      { id: "claude-opus-5", display_name: "Claude Opus 5" },
      { id: "claude-sonnet-5", display_name: "Claude Sonnet 5 (renamed)" },
      { id: "claude-haiku-4-5-20251001", display_name: "Claude Haiku 4.5" },
      { id: "claude-newmodel-6", display_name: "Claude Newmodel 6" },
    ];
    const { registry, report } = mergeModelList(clone(), api, "2027-01-15");
    expect(registry.snapshotDate).toBe("2027-01-15");
    expect(registry.models.find((m) => m.id === "claude-sonnet-5")?.displayName).toBe("Claude Sonnet 5 (renamed)");
    expect(report).toContainEqual(expect.stringContaining("claude-fable-5-1: not listed"));
    expect(report).toContainEqual(expect.stringContaining("claude-newmodel-6: listed by the API but not in the registry"));
    expect(report.some((line) => line.startsWith("claude-haiku-4-5-20251001:"))).toBe(false);
    // The merged document is still a valid registry.
    expect(() => parseModelRegistry(registry)).not.toThrow();
  });

  it("maps explicit pricing headers despite sidebar names, descriptions and column order", async () => {
    const { parsePricingText, applyPricing } = await load();
    const html = `
      <nav>Claude Opus 5 Claude Sonnet 5 Claude Fable 5.1</nav>
      <table><thead><tr><th>Model</th><th colspan="2">Base tokens</th><th colspan="3">Prompt caching</th></tr>
      <tr><th>Name</th><th>Input</th><th>Output</th><th><button>5m writes</button></th><th>1h writes</th><th>Hits and refreshes</th></tr></thead><tbody>
      <tr><td><a>Claude Opus 5.5</a></td><td>$4</td><td>$20</td><td>$5</td><td>$8</td><td>$0.20</td></tr>
      <tr><th colspan="6">Additional models</th></tr>
      <tr><td><a>Claude Opus 5</a><span>Some description</span></td><td>$5 / MTok</td><td>$25 / MTok</td><td>$6.25 / MTok</td><td>$10 / MTok</td><td>$0.50 / MTok</td></tr>
      <tr><td>Claude Sonnet 5</td><td>$2</td></tr></tbody></table>`;
    const { parsed, unparsed } = parsePricingText(html, ["Claude Opus 5", "Claude Sonnet 5", "Claude Fable 5.1"]);
    expect(parsed["Claude Opus 5"]).toEqual({
      inputPerMTok: 5, cacheWrite5mPerMTok: 6.25, cacheWrite1hPerMTok: 10, cacheReadPerMTok: 0.5, outputPerMTok: 25,
    });
    expect(unparsed).toEqual([
      expect.stringContaining("Claude Sonnet 5:"),
      expect.stringContaining("Claude Fable 5.1: not found"),
    ]);

    const changed = applyPricing(clone(), { "Claude Opus 5": { ...parsed["Claude Opus 5"]!, outputPerMTok: 30 } });
    expect(changed.report).toEqual(["claude-opus-5: outputPerMTok 25 -> 30"]);
    expect(changed.registry.models.find((m) => m.id === "claude-opus-5")?.pricing.outputPerMTok).toBe(30);
    const unchanged = applyPricing(clone(), { "Claude Opus 5": parsed["Claude Opus 5"]! });
    expect(unchanged.report).toEqual([]);
  });

  it("rejects ambiguous rows, unrecognized headers and malformed price cells", async () => {
    const { parsePricingText } = await load();
    const headers = "<tr><th>Name</th><th>Input</th><th>Output</th><th>5m writes</th><th>1h writes</th><th>Hits and refreshes</th></tr>";
    const row = "<tr><td>Claude Opus 5</td><td>$5</td><td>$25</td><td>$6.25</td><td>$10</td><td>$0.50</td></tr>";
    for (const html of [
      `<table>${headers}${row}${row}</table>`,
      `<table>${headers.replace("Output", "Unknown column")}${row}</table>`,
      `<table>${headers}${row.replace("$25", "$25 or $30")}</table>`,
      `<table>${headers}${row.replace("$25", "$25,000")}</table>`,
    ]) {
      const result = parsePricingText(html, ["Claude Opus 5"]);
      expect(result.parsed).toEqual({});
      expect(result.unparsed).toHaveLength(1);
    }
  });

  it("refuses to write or restamp a registry when any required pricing row is missing", async () => {
    const { refreshRegistryFile } = await load();
    const dir = mkdtempSync(path.join(os.tmpdir(), "thesis-model-refresh-"));
    const registryPath = path.join(dir, "models.json");
    const original = JSON.stringify(clone());
    writeFileSync(registryPath, original);
    try {
      expect(() => refreshRegistryFile(registryPath, [], "<nav>Claude Opus 5</nav>", "2026-10-02", true)).toThrow(/pricing/i);
      expect(readFileSync(registryPath, "utf8")).toBe(original);
      const dryRun = refreshRegistryFile(registryPath, [], "<nav>Claude Opus 5</nav>", "2026-10-02", false);
      expect(dryRun.report.some((line) => line.startsWith("pricing:"))).toBe(true);
      expect(readFileSync(registryPath, "utf8")).toBe(original);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("models-refresh adds newly published models", () => {
  const NEW_PRICE: PriceRow = { inputPerMTok: 6, outputPerMTok: 30, cacheWrite5mPerMTok: 7.5, cacheWrite1hPerMTok: 12, cacheReadPerMTok: 0.3 };
  const listed = (): ApiModel[] => MODEL_REGISTRY.models.map((m) => ({ id: m.id, display_name: m.displayName }));
  async function withRegistryFile<T>(run: (registryPath: string) => T | Promise<T>): Promise<T> {
    const dir = mkdtempSync(path.join(os.tmpdir(), "metis-model-refresh-"));
    const registryPath = path.join(dir, "models.json");
    writeFileSync(registryPath, JSON.stringify(clone()));
    try {
      return await run(registryPath);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it("builds a complete entry from the Models API and the pricing page, and leaves the auto order alone", async () => {
    const { refreshRegistryFile } = await load();
    await withRegistryFile((registryPath) => {
      const api = [...listed(), apiModel("claude-opus-6", "opus", "Claude Opus 6")];
      const html = pricingPage([priceRow("Claude Opus 6", NEW_PRICE)]);
      const { registry, report } = refreshRegistryFile(registryPath, api, html, "2027-02-10", true);
      const parsed = parseModelRegistry(JSON.parse(readFileSync(registryPath, "utf8")));
      expect(parsed).toEqual(parseModelRegistry(registry));

      const newestOpus = MODEL_REGISTRY.models.find((m) => m.id === "claude-opus-5-5")!;
      const added = parsed.models.find((m) => m.id === "claude-opus-6")!;
      expect(added).toMatchObject({
        family: "opus",
        generation: "6",
        displayName: "Claude Opus 6",
        lifecycle: "active",
        releasedOn: "2027-02-03",
        datedSnapshotIds: [],
        // From the Models API, not from the entry it sits above.
        contextWindowTokens: 2_000_000,
        maxOutputTokens: 256_000,
        effort: { supported: true, levels: ["low", "medium", "high", "xhigh", "max"] },
        sampling: { temperature: false, topP: false, topK: false },
        thinking: { mode: "always-on", sendParam: false },
        // From the pricing page.
        pricing: NEW_PRICE,
        // The three rules neither source states, from the newest entry of the line.
        taskBudget: newestOpus.taskBudget,
        serverSideFallback: newestOpus.serverSideFallback,
        webSearchToolType: newestOpus.webSearchToolType,
      });
      expect(added.notes.join(" ")).toContain("copied from claude-opus-5-5");
      // Directly above the entry it took those rules from; every other entry is untouched.
      const ids = parsed.models.map((m) => m.id);
      expect(ids.indexOf("claude-opus-6")).toBe(ids.indexOf("claude-opus-5-5") - 1);
      expect(parsed.models.filter((m) => m.id !== "claude-opus-6")).toEqual(MODEL_REGISTRY.models);
      // Selectable, but never placed in the auto order without a successful run.
      expect(parsed.autoPreference).toEqual(MODEL_REGISTRY.autoPreference);
      expect(report).toContainEqual(expect.stringMatching(/^claude-opus-6: added .*not in the "auto" order$/));
    });
  });

  it("reads the effort levels and the thinking rule from the capabilities", async () => {
    const { describeNewModel } = await load();
    const yes = { supported: true };
    const no = { supported: false };
    const describe6 = (capabilities: Record<string, unknown>) => {
      const base = apiModel("claude-sonnet-6", "sonnet", "Claude Sonnet 6");
      return describeNewModel(clone(), { ...base, capabilities: { ...(base.capabilities as object), ...capabilities } }, "2027-02-10");
    };
    // Thinking can be turned off: the parameter is sent so the model does think.
    expect(describe6({ thinking: { supported: true, types: { adaptive: yes, disabled: yes } } })).toMatchObject({
      entry: { thinking: { mode: "adaptive", sendParam: true } },
    });
    expect(describe6({ thinking: { supported: false, types: { adaptive: no, disabled: yes } } })).toMatchObject({
      entry: { thinking: { mode: "none", sendParam: false } },
    });
    expect(describe6({ effort: { supported: true, low: yes, medium: yes, high: yes, xhigh: null, max: no } })).toMatchObject({
      entry: { effort: { supported: true, levels: ["low", "medium", "high"] } },
    });
    expect(describe6({ effort: { supported: false, low: no, medium: no, high: no, max: no } })).toMatchObject({
      entry: { effort: { supported: false, levels: [] } },
    });
    // An unknown release date is reported as an epoch value and stays unknown.
    expect(describeNewModel(clone(), apiModel("claude-sonnet-6", "sonnet", "Claude Sonnet 6", { created_at: "1970-01-01T00:00:00Z" }), "2027-02-10"))
      .toMatchObject({ entry: { releasedOn: null } });
  });

  it("leaves a model out, with the reason, whenever the official sources do not describe it completely", async () => {
    const { describeNewModel } = await load();
    const yes = { supported: true };
    const reason = (api: ApiModel): string => {
      const described = describeNewModel(clone(), api, "2027-02-10");
      if (!("reason" in described)) throw new Error(`${api.id} was unexpectedly described`);
      return described.reason;
    };
    const base = apiModel("claude-opus-6", "opus", "Claude Opus 6");
    const caps = base.capabilities as Record<string, unknown>;
    expect(reason({ ...base, line: undefined })).toMatch(/names no model line/);
    expect(reason({ ...base, line: null })).toMatch(/names no model line/);
    expect(reason(apiModel("claude-mythos-6", "mythos", "Claude Mythos 6"))).toMatch(/line "mythos" is not one the registry carries/);
    // The line is never read off the id: an id of another line is refused.
    expect(reason(apiModel("claude-sonnet-6", "opus", "Claude Sonnet 6"))).toMatch(/not the dateless form claude-opus-/);
    expect(reason(apiModel("claude-opus-4-20250514", "opus", "Claude Opus 4"))).toMatch(/not the dateless form/);
    expect(reason(apiModel("claude-opus-6-1-20270301", "opus", "Claude Opus 6.1"))).toMatch(/not the dateless form/);
    // Older than, or the same generation as, the newest entry of its line.
    expect(reason(apiModel("claude-opus-4-7", "opus", "Claude Opus 4.7"))).toMatch(/not newer than claude-opus-5-5/);
    expect(reason(apiModel("claude-sonnet-4-6", "sonnet", "Claude Sonnet 4.6"))).toMatch(/not newer than claude-sonnet-5-5/);
    expect(reason({ ...base, lifecycle: "deprecated" })).toMatch(/lifecycle is "deprecated"/);
    expect(reason({ ...base, display_name: " " })).toMatch(/no display name/);
    expect(reason({ ...base, max_input_tokens: null })).toMatch(/no usable context and output limits/);
    expect(reason({ ...base, max_tokens: 0 })).toMatch(/no usable context and output limits/);
    expect(reason({ ...base, max_tokens: 3_000_000 })).toMatch(/no usable context and output limits/);
    expect(reason({ ...base, capabilities: null })).toMatch(/no capabilities/);
    expect(reason({ ...base, capabilities: { ...caps, structured_outputs: { supported: false } } })).toMatch(/structured output/);
    expect(reason({ ...base, capabilities: { ...caps, server_tools: { supported: true, code_execution: yes, web_search: { supported: false } } } })).toMatch(/web search/);
    expect(reason({ ...base, capabilities: { ...caps, effort: undefined } })).toMatch(/whether it takes an effort level/);
    expect(reason({ ...base, capabilities: { ...caps, effort: { supported: true } } })).toMatch(/lists none/);
    expect(reason({ ...base, capabilities: { ...caps, thinking: undefined } })).toMatch(/whether it thinks/);
    expect(reason({ ...base, capabilities: { ...caps, thinking: { supported: true, types: { adaptive: { supported: false }, enabled: yes } } } })).toMatch(/adaptive thinking/);
    // A line the registry holds no active entry for has nothing to take the unstated rules from.
    const withoutHaiku = clone();
    withoutHaiku.models = withoutHaiku.models.filter((m) => m.family !== "haiku");
    expect(describeNewModel(withoutHaiku, apiModel("claude-haiku-6", "haiku", "Claude Haiku 6"), "2027-02-10"))
      .toMatchObject({ reason: expect.stringMatching(/no active haiku entry/) });
  });

  it("leaves out a new model without one complete price row, and still refreshes the rest", async () => {
    const { refreshRegistryFile } = await load();
    await withRegistryFile((registryPath) => {
      const api = [
        ...listed(),
        // Priced in two tiers by prompt size: two rows, neither under the plain name.
        apiModel("claude-haiku-5-5", "haiku", "Claude Haiku 5.5"),
        // Listed twice on the page.
        apiModel("claude-sonnet-6", "sonnet", "Claude Sonnet 6"),
        // Complete: this one is added.
        apiModel("claude-fable-6", "fable", "Claude Fable 6"),
      ];
      const html = pricingPage([
        priceRow("Claude Haiku 5.5 (for prompts up to 100,000 tokens)", { inputPerMTok: 0.1, outputPerMTok: 0.5, cacheWrite5mPerMTok: 0.125, cacheWrite1hPerMTok: 0.2, cacheReadPerMTok: 0.01 }),
        priceRow("Claude Haiku 5.5 (for prompts over 100,000 tokens)", { inputPerMTok: 0.5, outputPerMTok: 2.5, cacheWrite5mPerMTok: 0.625, cacheWrite1hPerMTok: 1, cacheReadPerMTok: 0.05 }),
        priceRow("Claude Sonnet 6", NEW_PRICE),
        priceRow("Claude Sonnet 6", { ...NEW_PRICE, outputPerMTok: 31 }),
        priceRow("Claude Fable 6", NEW_PRICE),
      ]);
      const { report } = refreshRegistryFile(registryPath, api, html, "2027-02-10", true);
      const written = parseModelRegistry(JSON.parse(readFileSync(registryPath, "utf8")));
      const ids = written.models.map((m) => m.id);
      expect(ids).not.toContain("claude-haiku-5-5");
      expect(ids).not.toContain("claude-sonnet-6");
      expect(ids.indexOf("claude-fable-6")).toBe(ids.indexOf("claude-fable-5-2") - 1);
      expect(written.models.find((m) => m.id === "claude-fable-6")).toMatchObject({
        pricing: NEW_PRICE,
        serverSideFallback: MODEL_REGISTRY.models.find((m) => m.id === "claude-fable-5-2")!.serverSideFallback,
      });
      expect(report).toContainEqual(expect.stringMatching(/^claude-haiku-5-5: .*not added: no single complete price row .*not found/));
      expect(report).toContainEqual(expect.stringMatching(/^claude-sonnet-6: .*not added: no single complete price row .*ambiguous/));
      // A new model's missing price is not an existing entry's missing price: it does not block the write.
      expect(report.some((line) => line.startsWith("pricing:"))).toBe(false);
    });
  });

  it("orders several new models of one line newest first, and writes nothing on a dry run", async () => {
    const { refreshRegistryFile } = await load();
    await withRegistryFile((registryPath) => {
      const api = [...listed(), apiModel("claude-opus-6", "opus", "Claude Opus 6"), apiModel("claude-opus-6-1", "opus", "Claude Opus 6.1")];
      const html = pricingPage([priceRow("Claude Opus 6", NEW_PRICE), priceRow("Claude Opus 6.1", NEW_PRICE)]);
      const { registry } = refreshRegistryFile(registryPath, api, html, "2027-02-10", false);
      const ids = parseModelRegistry(registry).models.map((m) => m.id);
      expect(ids.slice(ids.indexOf("claude-opus-6-1"), ids.indexOf("claude-opus-5-5") + 1)).toEqual(["claude-opus-6-1", "claude-opus-6", "claude-opus-5-5"]);
      expect(JSON.parse(readFileSync(registryPath, "utf8"))).toEqual(clone());
    });
  });
});
