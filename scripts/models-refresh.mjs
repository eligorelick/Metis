/**
 * Rebuild config/models.json from the Anthropic Models API and the public
 * pricing page.
 *
 *   npm run models:refresh            # dry run: prints the proposed changes
 *   npm run models:refresh -- --write # writes config/models.json
 *
 * Needs ANTHROPIC_API_KEY (the Models API is free; no message is sent). The
 * tests use fixture inputs and intercept CLI provider reads.
 *
 * A model the Models API lists that is newer than the registry's newest entry
 * of the same line is added automatically, and only when the official sources
 * describe it completely: the Models API gives its line, limits, effort levels
 * and thinking rule, and the pricing page gives one complete price row. The
 * three request rules neither source states (task budget, web search tool
 * version, refusal fallback) are copied from the newest registry entry of the
 * same line and named in the new entry's notes. Anything missing or ambiguous
 * leaves the model out with the reason in the report; nothing is guessed. A new
 * model is selectable at once but is not placed in the `auto` order.
 *
 * Existing entries keep their checked-in limits and request policy.
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isEntryPoint } from "./lib/entrypoint.mjs";
import { loadMaintenanceEnv } from "./lib/load-env.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REGISTRY_PATH = path.join(HERE, "..", "config", "models.json");
export const MODELS_URL = "https://api.anthropic.com/v1/models";
export const PRICING_URL = "https://platform.claude.com/docs/en/about-claude/pricing";
export const ANTHROPIC_VERSION = "2023-06-01";

/** Registry price fields; HTML table headers determine their column positions. */
const PRICING_COLUMNS = ["inputPerMTok", "cacheWrite5mPerMTok", "cacheWrite1hPerMTok", "cacheReadPerMTok", "outputPerMTok"];
const PRICING_HEADERS = {
  name: "name",
  input: "inputPerMTok",
  output: "outputPerMTok",
  "5m writes": "cacheWrite5mPerMTok",
  "1h writes": "cacheWrite1hPerMTok",
  "hits and refreshes": "cacheReadPerMTok",
};

/** Collapse an HTML document to whitespace-normalized text. */
export function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Read named rows only from HTML tables with all six explicit pricing headers.
 * Sidebar mentions and similarly named models cannot supply another row's
 * prices. Duplicate rows, missing columns and ambiguous cells fail closed.
 */
export function parsePricingText(html, displayNames) {
  const parsed = {};
  const unparsed = [];
  const candidates = new Map(displayNames.map((name) => [name, []]));
  for (const table of html.match(/<table\b[\s\S]*?<\/table>/gi) ?? []) {
    let columns;
    for (const row of table.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? []) {
      const headers = [...row.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)];
      if (headers.length > 0) {
        const mapped = headers.map((cell) => PRICING_HEADERS[htmlToText(cell[1]).toLowerCase()]);
        // Group headings such as "Additional models" do not replace the columns.
        if (mapped.length === 6) columns = new Set(mapped).size === 6 && mapped.every(Boolean)
          ? mapped : undefined;
        continue;
      }
      if (columns === undefined) continue;
      const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cell[1]);
      const nameCell = cells[columns.indexOf("name")];
      if (nameCell === undefined) continue;
      const link = /<a\b[^>]*>([\s\S]*?)<\/a>/i.exec(nameCell);
      const name = htmlToText(link ? link[1] : nameCell);
      const rows = candidates.get(name);
      if (rows === undefined) continue;
      const pricing = {};
      let valid = cells.length === columns.length;
      for (const field of PRICING_COLUMNS) {
        const price = /^\$\s?(\d+(?:\.\d+)?)(?:\s*\/\s*MTok)?$/.exec(htmlToText(cells[columns.indexOf(field)] ?? ""));
        const amount = price === null ? NaN : Number(price[1]);
        if (!Number.isFinite(amount) || amount <= 0) valid = false;
        pricing[field] = amount;
      }
      rows.push(valid ? pricing : null);
    }
  }
  for (const name of displayNames) {
    const rows = candidates.get(name);
    if (rows.length === 0) unparsed.push(`${name}: not found in a recognized pricing table`);
    else if (rows.length !== 1 || rows[0] === null) unparsed.push(`${name}: ambiguous or incomplete pricing row`);
    else parsed[name] = rows[0];
  }
  return { parsed, unparsed };
}

/** Prepare a refresh, and write only when every registry entry has valid prices. */
export function refreshRegistryFile(registryPath, apiModels, pricingHtml, today, write) {
  const registry = JSON.parse(readFileSync(registryPath, "utf8"));
  const merged = mergeModelList(registry, apiModels, today);
  const existingNames = merged.registry.models.map((model) => model.displayName);
  const candidateNames = merged.candidates.map((candidate) => candidate.entry.displayName).filter((name) => !existingNames.includes(name));
  const pricing = parsePricingText(pricingHtml, [...existingNames, ...candidateNames]);
  // Only an existing entry without a price row blocks a write; a new model without one is left out.
  const unparsed = pricing.unparsed.filter((line) => existingNames.some((name) => line.startsWith(`${name}:`)));
  const added = addNewModels(merged.registry, merged.candidates, pricing.parsed, pricing.unparsed);
  const priced = applyPricing(added.registry, pricing.parsed);
  const report = [...merged.report, ...added.report, ...priced.report, ...unparsed.map((line) => `pricing: ${line}`)];
  if (write) {
    if (unparsed.length > 0) throw new Error(`Refusing to write incomplete pricing: ${unparsed.join("; ")}`);
    // The app validates the registry when it loads; a repeated id would stop it starting.
    const ids = priced.registry.models.map((model) => model.id);
    const repeated = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (repeated.length > 0) throw new Error(`Refusing to write a registry that repeats a model id: ${[...new Set(repeated)].join(", ")}`);
    writeFileSync(registryPath, `${JSON.stringify(priced.registry, null, 2)}\n`, "utf8");
  }
  return { registry: priced.registry, report };
}

/**
 * Merge the Models API listing into the registry: sync display names, flag
 * registry ids the API no longer lists, and list API ids the registry does
 * not know. Never invents context, output, or price data.
 */
export function mergeModelList(registry, apiModels, today) {
  const report = [];
  const apiById = new Map(apiModels.map((m) => [m.id, m]));
  const next = {
    ...registry,
    snapshotDate: today,
    models: registry.models.map((model) => {
      const listed = apiById.get(model.id);
      if (listed === undefined) {
        report.push(`${model.id}: not listed by ${MODELS_URL}; lifecycle "${model.lifecycle}" kept — check the deprecations page`);
        return model;
      }
      if (typeof listed.display_name === "string" && listed.display_name !== model.displayName) {
        report.push(`${model.id}: displayName "${model.displayName}" -> "${listed.display_name}"`);
        return { ...model, displayName: listed.display_name };
      }
      return model;
    }),
  };
  const known = new Set(registry.models.flatMap((m) => [m.id, ...m.datedSnapshotIds]));
  const notAdded = (id, reason) => report.push(`${id}: listed by the API but not in the registry — not added: ${reason}`);
  // One record per id. The same record listed twice (overlapping pages) counts once;
  // two different records for one id describe nothing reliably and are both withheld.
  const records = new Map();
  const conflicting = new Set();
  for (const api of apiModels) {
    if (typeof api.id !== "string" || !api.id.startsWith("claude-") || known.has(api.id)) continue;
    const seen = records.get(api.id);
    if (seen === undefined) records.set(api.id, api);
    else if (JSON.stringify(seen) !== JSON.stringify(api)) conflicting.add(api.id);
  }
  let candidates = [];
  for (const [id, api] of records) {
    if (conflicting.has(id)) {
      notAdded(id, "the Models API lists it more than once with different details");
      continue;
    }
    const described = describeNewModel(registry, api, today);
    if ("reason" in described) notAdded(id, described.reason);
    else candidates.push(described);
  }
  // A price row is matched by display name, so a name that is not this model's alone
  // could hand it another model's prices. Names before and after the sync both count.
  const takenNames = new Set([...registry.models, ...next.models].map((model) => model.displayName));
  const nameCounts = new Map();
  for (const { entry } of candidates) nameCounts.set(entry.displayName, (nameCounts.get(entry.displayName) ?? 0) + 1);
  candidates = candidates.filter(({ entry }) => {
    if (takenNames.has(entry.displayName)) {
      notAdded(entry.id, `its display name "${entry.displayName}" is already a registry entry's, so a price row cannot be matched to it alone`);
      return false;
    }
    if (nameCounts.get(entry.displayName) > 1) {
      notAdded(entry.id, `another new model has the same display name "${entry.displayName}", so a price row cannot be matched to it alone`);
      return false;
    }
    return true;
  });
  return { registry: next, report, candidates };
}

/** Lines the registry schema accepts. A line outside this list is never mapped onto one of them. */
const REGISTRY_LINES = ["fable", "opus", "sonnet", "haiku"];
const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"];

function compareGenerations(a, b) {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

const isPositiveInteger = (value) => Number.isInteger(value) && value > 0;
const isSupported = (capability) => capability !== null && typeof capability === "object" && capability.supported === true;

/**
 * Build the registry entry for a model the API lists and the registry does
 * not, without its prices, or say why it cannot be built. Every field comes
 * from the Models API record except the three request rules it does not state,
 * which come from `template`, the newest registry entry of the same line.
 */
export function describeNewModel(registry, api, today) {
  if (api.lifecycle !== undefined && api.lifecycle !== "active") return { reason: `its lifecycle is "${api.lifecycle}"` };
  if (typeof api.line !== "string") return { reason: "the Models API names no model line for it, and a line is never inferred from the id" };
  if (!REGISTRY_LINES.includes(api.line)) return { reason: `its line "${api.line}" is not one the registry carries` };
  const idShape = new RegExp(`^claude-${api.line}-(\\d{1,2})(?:-(\\d{1,2}))?$`).exec(api.id);
  if (idShape === null) return { reason: `its id is not the dateless form claude-${api.line}-<generation>` };
  const generation = idShape[2] === undefined ? idShape[1] : `${idShape[1]}.${idShape[2]}`;
  const sameLine = registry.models.filter((model) => model.family === api.line && model.lifecycle === "active");
  if (sameLine.length === 0) return { reason: `the registry has no active ${api.line} entry to take the unstated request rules from` };
  const template = sameLine.reduce((newest, model) => (compareGenerations(model.generation, newest.generation) > 0 ? model : newest));
  if (compareGenerations(generation, template.generation) <= 0) {
    return { reason: `it is not newer than ${template.id}, the registry's newest ${api.line} entry; an older model is added by hand` };
  }
  if (typeof api.display_name !== "string" || api.display_name.trim() === "") return { reason: "the Models API gives no display name" };
  if (!isPositiveInteger(api.max_input_tokens) || !isPositiveInteger(api.max_tokens) || api.max_tokens > api.max_input_tokens) {
    return { reason: "the Models API gives no usable context and output limits" };
  }
  const capabilities = api.capabilities;
  if (capabilities === null || typeof capabilities !== "object") return { reason: "the Models API gives no capabilities" };
  if (!isSupported(capabilities.structured_outputs)) return { reason: "it does not support structured output, which the synthesis pass needs" };
  if (!isSupported(capabilities.server_tools?.web_search)) return { reason: "it does not support the web search tool the analyst passes use" };
  const effort = capabilities.effort;
  if (effort === null || typeof effort !== "object" || typeof effort.supported !== "boolean") {
    return { reason: "the Models API does not say whether it takes an effort level" };
  }
  const levels = effort.supported ? EFFORT_LEVELS.filter((level) => isSupported(effort[level])) : [];
  if (effort.supported && levels.length === 0) return { reason: "the Models API says it takes an effort level but lists none" };
  // Metis sends whichever of the five levels is configured to any model that takes effort.
  if (effort.supported && levels.length !== EFFORT_LEVELS.length) {
    return { reason: `it takes only some effort levels (${levels.join(", ")}), and Metis sends any of the five to a model that takes effort; add it by hand` };
  }
  const thinkingCapability = capabilities.thinking;
  if (thinkingCapability === null || typeof thinkingCapability !== "object" || typeof thinkingCapability.supported !== "boolean") {
    return { reason: "the Models API does not say whether it thinks" };
  }
  let thinking;
  if (!thinkingCapability.supported) {
    thinking = { mode: "none", sendParam: false };
  } else if (!isSupported(thinkingCapability.types?.adaptive)) {
    return { reason: "it thinks but does not accept adaptive thinking, the only mode Metis sends" };
  } else if (thinkingCapability.types?.disabled?.supported === false) {
    // Thinking cannot be turned off, so the parameter is left out.
    thinking = { mode: "always-on", sendParam: false };
  } else {
    // Sent explicitly: on some models leaving it out runs without thinking.
    thinking = { mode: "adaptive", sendParam: true };
  }
  const released = typeof api.created_at === "string" ? /^(\d{4})-\d{2}-\d{2}/.exec(api.created_at) : null;
  // The API reports an epoch date when the release date is unknown.
  const releasedOn = released !== null && Number(released[1]) >= 2020 ? released[0] : null;
  return {
    template,
    entry: {
      id: api.id,
      taskBudget: template.taskBudget,
      family: api.line,
      generation,
      displayName: api.display_name,
      lifecycle: "active",
      releasedOn,
      datedSnapshotIds: [],
      contextWindowTokens: api.max_input_tokens,
      maxOutputTokens: api.max_tokens,
      effort: { supported: effort.supported, levels },
      // Metis sends no sampling parameter to any model.
      sampling: { temperature: false, topP: false, topK: false },
      thinking,
      serverSideFallback: template.serverSideFallback,
      webSearchToolType: template.webSearchToolType,
      notes: [
        `Added by models:refresh on ${today}. Line, limits, effort levels, thinking rule and release date are from the Models API; prices are from the pricing page.`,
        `Task budget, web search tool version and refusal fallback are copied from ${template.id}; check them against the model's migration guide.`,
        `Selectable, but not in the "auto" order: add it to autoPreference once a run on it has succeeded.`,
      ],
    },
  };
}

/**
 * Add the candidates that have one complete price row, each directly above the
 * entry it took its unstated rules from. A candidate without one is left out
 * and reported; it never blocks the rest of the refresh.
 */
export function addNewModels(registry, candidates, parsedByDisplayName, unparsed) {
  const report = [];
  let models = registry.models;
  // Newest first: each is placed directly above the shared template, so later (older) ones land below earlier ones.
  const ordered = [...candidates].sort((a, b) => compareGenerations(b.entry.generation, a.entry.generation));
  for (const { entry, template } of ordered) {
    const row = parsedByDisplayName[entry.displayName];
    if (row === undefined) {
      const why = unparsed.find((line) => line.startsWith(`${entry.displayName}:`)) ?? `${entry.displayName}: no price row`;
      report.push(`${entry.id}: listed by the API but not in the registry — not added: no single complete price row (${why})`);
      continue;
    }
    const { notes, ...rest } = entry;
    const pricing = {
      inputPerMTok: row.inputPerMTok,
      outputPerMTok: row.outputPerMTok,
      cacheWrite5mPerMTok: row.cacheWrite5mPerMTok,
      cacheWrite1hPerMTok: row.cacheWrite1hPerMTok,
      cacheReadPerMTok: row.cacheReadPerMTok,
    };
    const at = models.findIndex((model) => model.id === template.id);
    models = [...models.slice(0, at), { ...rest, pricing, notes }, ...models.slice(at)];
    report.push(`${entry.id}: added (${entry.displayName}); request rules the API does not state are copied from ${template.id}; selectable, not in the "auto" order`);
  }
  return { registry: { ...registry, models }, report };
}

/** Apply parsed pricing rows (keyed by display name) to matching registry entries. */
export function applyPricing(registry, parsedByDisplayName) {
  const report = [];
  const models = registry.models.map((model) => {
    const row = parsedByDisplayName[model.displayName];
    if (row === undefined) return model;
    const changed = PRICING_COLUMNS.filter((column) => model.pricing[column] !== row[column]);
    if (changed.length === 0) return model;
    for (const column of changed) {
      report.push(`${model.id}: ${column} ${model.pricing[column]} -> ${row[column]}`);
    }
    return { ...model, pricing: { ...model.pricing, ...row } };
  });
  return { registry: { ...registry, models }, report };
}

async function fetchAllModels(apiKey) {
  const models = [];
  let afterId;
  for (;;) {
    const url = new URL(MODELS_URL);
    url.searchParams.set("limit", "100");
    if (afterId !== undefined) url.searchParams.set("after_id", afterId);
    const response = await fetch(url, {
      headers: { "x-api-key": apiKey, "anthropic-version": ANTHROPIC_VERSION },
    });
    if (!response.ok) {
      throw new Error(`${MODELS_URL} responded ${response.status}`);
    }
    const page = await response.json();
    models.push(...(page.data ?? []));
    if (page.has_more !== true || typeof page.last_id !== "string") break;
    afterId = page.last_id;
  }
  return models;
}

async function main(argv) {
  loadMaintenanceEnv();
  const write = argv.includes("--write");
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is required (the Models API is free; no message is sent).");
    return 2;
  }
  const today = new Date().toISOString().slice(0, 10);

  const apiModels = await fetchAllModels(apiKey);

  const pricingResponse = await fetch(PRICING_URL);
  if (!pricingResponse.ok) {
    throw new Error(`${PRICING_URL} responded ${pricingResponse.status}`);
  }
  const { report } = refreshRegistryFile(REGISTRY_PATH, apiModels, await pricingResponse.text(), today, write);
  console.log(`models:refresh — snapshot ${today}`);
  for (const line of report) console.log(`  ${line}`);
  if (report.length === 0) console.log("  no changes");
  console.log("  review any added entry, and existing limits and request policy, against the model guides and lifecycle documentation.");

  if (write) {
    console.log(`  wrote ${REGISTRY_PATH}`);
  } else {
    console.log("  dry run — pass --write to update config/models.json");
  }
  return 0;
}

if (isEntryPoint(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    },
  );
}
