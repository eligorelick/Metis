/**
 * accuracy:fetch — rebuild the committed filed reference values from SEC EDGAR.
 *
 *   npm run accuracy:fetch -- --network --run tmp/golden/<run> [--refresh] [--out FILE]
 *
 * The only part of the accuracy check that touches the network, and it refuses
 * to run without --network. It downloads each company's XBRL companyfacts JSON
 * from data.sec.gov (cached under tmp/accuracy/edgar; --refresh downloads
 * again), reads from the golden run only each figure's PERIOD and the report's
 * evidence cutoff (never Metis's values), and resolves the filed value for that
 * period with scripts/accuracy/recipes.ts: newest filing on or before the
 * cutoff (P2), the exact period (P1), one filing per composed balance (P7).
 * Output: scripts/accuracy/reference.json.
 *
 * SEC requires a contact in the User-Agent: set EDGAR_CONTACT in the
 * environment (it is never printed or written). Requests are spaced a quarter
 * second apart, well inside SEC's fair-access limit.
 */
import fs from "node:fs";
import path from "node:path";
import { extractFigures, dcfTranslationRate } from "./figures";
import { cutoffDate, mergeFacts, parseXbrlInstance, scanXbrlInstance, type CompanyFacts, type InstanceFact } from "./lib";
import { recipeFor, resolveReference, type CompanyConfig, type InstanceEvidence } from "./recipes";
import { REFERENCE_FILE, COMPANIES_FILE, readCompanies, type ReferenceEntry, type ReferenceFile } from "./files";

const REPO = path.resolve(__dirname, "..", "..");
const CACHE = path.join(REPO, "tmp", "accuracy", "edgar");

function parseArgs(argv: string[]): { network: boolean; run: string; refresh: boolean; out: string } {
  let network = false;
  let refresh = false;
  let run: string | undefined;
  let out = REFERENCE_FILE;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--network") network = true;
    else if (arg === "--refresh") refresh = true;
    else if (arg === "--run") run = argv[++i];
    else if (arg === "--out") out = path.resolve(argv[++i] ?? "");
    else throw new Error(`unknown option ${arg}`);
  }
  if (!run) throw new Error("usage: accuracy:fetch --network --run GOLDEN_RUN_DIR [--refresh] [--out FILE]");
  return { network, run: path.resolve(run), refresh, out };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function companyFacts(cik: number, refresh: boolean): Promise<CompanyFacts> {
  const padded = String(cik).padStart(10, "0");
  return JSON.parse(await cached(path.join(CACHE, `CIK${padded}.json`), refresh, `https://data.sec.gov/api/xbrl/companyfacts/CIK${padded}.json`)) as CompanyFacts;
}

async function secGet(url: string): Promise<string> {
  const contact = process.env.EDGAR_CONTACT?.trim();
  if (!contact) throw new Error("EDGAR_CONTACT is not set: SEC requires a contact name and email in the User-Agent");
  await sleep(250);
  const response = await fetch(url, { headers: { "User-Agent": contact } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

async function cached(file: string, refresh: boolean, url: string): Promise<string> {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!refresh && fs.existsSync(file)) return fs.readFileSync(file, "utf8");
  const text = await secGet(url);
  fs.writeFileSync(file, text);
  return text;
}

/** One filing's own XBRL instance document (the `*_htm.xml` an inline-XBRL filing carries). */
async function instanceXml(cik: number, accn: string, refresh: boolean): Promise<string> {
  const folder = `https://www.sec.gov/Archives/edgar/data/${cik}/${accn.replace(/-/g, "")}`;
  const index = JSON.parse(await cached(path.join(CACHE, `index-${accn}.json`), refresh, `${folder}/index.json`)) as { directory: { item: { name: string }[] } };
  const instance = index.directory.item.map((item) => item.name).find((name) => name.endsWith("_htm.xml"));
  if (!instance) throw new Error(`${accn} has no inline-XBRL instance document`);
  return cached(path.join(CACHE, `instance-${accn}.xml`), refresh, `${folder}/${instance}`);
}

/** One filing's own XBRL instance, for a filing companyfacts has not ingested. */
async function instanceFacts(cik: number, accn: string, refresh: boolean): Promise<CompanyFacts> {
  const padded = String(cik).padStart(10, "0");
  const submissions = JSON.parse(await cached(path.join(CACHE, `submissions-CIK${padded}.json`), refresh, `https://data.sec.gov/submissions/CIK${padded}.json`)) as {
    filings: { recent: { accessionNumber: string[]; form: string[]; filingDate: string[] } };
  };
  const recent = submissions.filings.recent;
  const at = recent.accessionNumber.indexOf(accn);
  if (at < 0) throw new Error(`${accn} is not in CIK${padded}'s recent filings`);
  return parseXbrlInstance(await instanceXml(cik, accn, refresh), { accn, form: recent.form[at]!, filed: recent.filingDate[at]! });
}

async function main(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  if (!args.network) {
    throw new Error("accuracy:fetch calls SEC EDGAR; pass --network to allow it (accuracy:check itself never uses the network)");
  }
  const companies = readCompanies();
  const entries: ReferenceEntry[] = [];
  const cases: ReferenceFile["cases"] = {};
  for (const company of companies) {
    const dir = path.join(args.run, company.case);
    if (!fs.existsSync(path.join(dir, "stageB.json"))) {
      process.stderr.write(`skip ${company.case}: not in ${args.run}\n`);
      continue;
    }
    const stageB = JSON.parse(fs.readFileSync(path.join(dir, "stageB.json"), "utf8")) as Record<string, unknown>;
    const report = JSON.parse(fs.readFileSync(path.join(dir, "report.json"), "utf8")) as Record<string, unknown>;
    const cutoffAt = ((report.meta as Record<string, unknown>)?.evidenceTiming as Record<string, unknown> | undefined)?.cutoffAt;
    if (typeof cutoffAt !== "string") throw new Error(`${company.case}: report has no evidence cutoff`);
    let facts = await companyFacts(company.cik, args.refresh);
    for (const filing of company.instanceFilings ?? []) facts = mergeFacts(facts, await instanceFacts(company.cik, filing.accn, args.refresh));
    cases[company.case] = { ticker: company.ticker, cik: company.cik, entityName: facts.entityName ?? null, cutoffAt, currency: company.currency };
    const translation = dcfTranslationRate(stageB);
    const cutoff = cutoffDate(cutoffAt);
    // Filings whose own instance an absence proof needs (dimensional facts companyfacts drops), read on demand.
    const instances: Record<string, InstanceFact[]> = {};
    for (const figure of extractFigures(stageB, report)) {
      const period = figure.referencePeriod ?? figure.period;
      const { recipe } = recipeFor(company, figure.id);
      for (;;) {
        const probe = resolveReference(recipe, period, facts, company.currency, cutoff, instances);
        const missing = ("reason" in probe ? probe.needsInstance ?? [] : []).filter((accn) => !(accn in instances));
        if (missing.length === 0) break;
        for (const accn of missing) instances[accn] = scanXbrlInstance(await instanceXml(company.cik, accn, args.refresh));
      }
      entries.push(buildEntry(company, figure.id, period, figure.currency, facts, cutoff, translation, instances));
    }
    process.stdout.write(`${company.case}: ${entries.filter((entry) => entry.case === company.case).length} figures\n`);
  }
  const output: ReferenceFile = {
    about: "Filed reference values for npm run accuracy:check, built by npm run accuracy:fetch from SEC EDGAR XBRL companyfacts (public SEC facts). Periods and cutoffs come from the golden run's reports; values come only from the filings. Rebuild with: npm run accuracy:fetch -- --network --run <golden run>.",
    source: "https://data.sec.gov/api/xbrl/companyfacts/",
    builtFrom: path.relative(REPO, args.run).replace(/\\/g, "/"),
    cases,
    entries,
  };
  fs.writeFileSync(args.out, `${JSON.stringify(output, null, 2)}\n`);
  process.stdout.write(`wrote ${path.relative(REPO, args.out)} (${entries.length} figures; companies from ${path.relative(REPO, COMPANIES_FILE)})\n`);
}

export function buildEntry(
  company: CompanyConfig,
  figure: string,
  period: string | null,
  figureCurrency: string | null,
  facts: CompanyFacts,
  cutoff: string,
  translation: { rate: number; from: string; to: string; note: string } | null,
  instances: InstanceEvidence = {},
): ReferenceEntry {
  const { recipe, why } = recipeFor(company, figure);
  const resolved = resolveReference(recipe, period, facts, company.currency, cutoff, instances);
  if ("reason" in resolved) {
    // Not admitted, only reported: the value a later filing gives for the same period (P2 keeps it out of the reference).
    const later = recipe.op === "none" ? null : resolveReference(recipe, period, facts, company.currency, "9999-12-31", instances);
    const afterCutoff = later && !("reason" in later) && later.points.some((point) => point.filed > cutoff)
      ? `after the cutoff, ${later.points.filter((point) => point.filed > cutoff).map((point) => `${point.form} ${point.accn} filed ${point.filed}`).filter((text, index, all) => all.indexOf(text) === index).join(", ")} gives ${later.value} for ${later.period} (not admitted, P2)`
      : undefined;
    return { case: company.case, figure, period, unresolved: resolved.reason, ...(afterCutoff ? { notes: [afterCutoff] } : {}), ...(why ? { recipeWhy: why } : {}) };
  }
  let value = resolved.value;
  let operands = resolved.operands;
  const notes = [...resolved.notes];
  const scale = company.scale?.[figure];
  if (scale) {
    value *= scale.factor;
    operands = operands.map((operand) => operand * scale.factor);
    notes.push(`filed amount × ${scale.factor}: ${scale.why}`);
  }
  let kind = resolved.kind;
  // The comparison measure travels with the value: the filed unit and currency, changed only by the report's own
  // stated translation (P4). The check refuses a match when it disagrees with the figure's own measure.
  let currency = resolved.measure.currency;
  if (currency && figureCurrency && figureCurrency !== currency && translation && translation.from === currency && translation.to === figureCurrency) {
    value *= translation.rate;
    operands = operands.map((operand) => operand * translation.rate);
    kind = kind === "filed" ? "derived" : kind;
    notes.push(`filed ${currency} amount translated to ${figureCurrency} at the report's own stated rate ${translation.rate} ${figureCurrency} per ${currency} (a market input, not a filed value): ${translation.note}`);
    currency = translation.to;
  }
  return {
    case: company.case,
    figure,
    period: resolved.period,
    value,
    kind,
    unit: resolved.measure.unit,
    currency,
    formula: resolved.formula,
    operands,
    points: resolved.points,
    notes,
    ...(why ? { recipeWhy: why } : {}),
  };
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
