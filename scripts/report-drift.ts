/**
 * report:drift — measure where the reader surfaces still disagree about the
 * valuation figures (P22), offline, over saved reports.
 *
 *   npm run report:drift -- --golden tmp/golden/branch --db tmp/check.db --out tmp/drift/REPORT.md
 *   options: --golden DIR (a golden:run output: DIR/<case>/report.json)
 *            --db FILE    (a COPY of the application database, opened read-only)
 *            --out FILE   (Markdown report; default: print to stdout)
 *            --clock ISO  (fixed clock; default 2026-11-12T12:00:00.000Z)
 *
 * For every report, each surface (Markdown, print, classic and dossier app,
 * and the key-data box) prepares the stored report as it does when rendering
 * (src/report/readerPreparation.ts) and reads the shared valuation decisions
 * (src/report/presentation.ts): headline label, shown value, comparison,
 * withheld text and caveats, and the scenario heading, order, targets, weights,
 * weight basis and target caveat. The script compares those texts across
 * surfaces and counts the reports on which each disagreement shows. It also
 * renders each surface and checks that every decided text appears in it, so
 * the measurement is what a reader sees, and it measures the preparation
 * differences (web vs export chain) and the primary-capital evidence that only
 * Markdown prints.
 *
 * Nothing is fetched and nothing is written to the database: the network is
 * blocked by scripts/golden/offline-preload.mjs and the database copy is
 * opened read-only. The application database itself is refused.
 */
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { Report } from "../src/report/schema";

type Surface = "markdown" | "print" | "classic" | "dossier" | "key-data";
const SURFACES: readonly Surface[] = ["markdown", "print", "classic", "dossier", "key-data"];
const NONE = "(none)";

interface Args { golden?: string; db?: string; out?: string; clock: string }

function parseArgs(argv: string[]): Args {
  const args: Args = { clock: "2026-11-12T12:00:00.000Z" };
  for (let i = 0; i < argv.length; i += 2) {
    const [key, value] = [argv[i], argv[i + 1]];
    if (value === undefined) throw new Error(`report:drift: ${key} needs a value`);
    if (key === "--golden") args.golden = value;
    else if (key === "--db") args.db = value;
    else if (key === "--out") args.out = value;
    else if (key === "--clock") args.clock = value;
    else throw new Error(`report:drift: unknown option ${key}`);
  }
  if (!args.golden && !args.db) throw new Error("report:drift: give --golden DIR and/or --db FILE");
  return args;
}

function installFixedClock(iso: string): void {
  const fixed = Date.parse(iso);
  if (!Number.isFinite(fixed)) throw new Error(`report:drift: unusable clock ${iso}`);
  const RealDate = Date;
  globalThis.Date = new Proxy(RealDate, {
    construct(target, args, newTarget) { return Reflect.construct(target, args.length === 0 ? [fixed] : args, newTarget); },
    apply() { return new RealDate(fixed).toString(); },
    get(target, key, receiver) { return key === "now" ? () => fixed : Reflect.get(target, key, receiver); },
  });
}

/** Refuse the live application database (only a copy may be read). */
function assertDatabaseCopy(file: string): void {
  const resolved = path.resolve(file).toLowerCase();
  const live = [process.env.LOCALAPPDATA, process.env.APPDATA].filter(Boolean).map((dir) => path.join(dir!, "Thesis").toLowerCase());
  if (live.some((dir) => resolved.startsWith(dir))) throw new Error(`report:drift: ${file} is the application database; copy it and pass the copy`);
}

interface Source { set: "golden" | "saved"; id: string; json: string }

function goldenSources(dir: string): Source[] {
  return fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory())
    .map((entry) => path.join(dir, entry.name, "report.json"))
    .filter((file) => fs.existsSync(file))
    .map((file) => ({ set: "golden" as const, id: path.basename(path.dirname(file)), json: fs.readFileSync(file, "utf8") }));
}

async function savedSources(file: string): Promise<Source[]> {
  assertDatabaseCopy(file);
  const { default: Database } = await import("better-sqlite3");
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const rows = db.prepare("SELECT id, reportJson FROM reports WHERE reportJson IS NOT NULL ORDER BY id").all() as { id: number; reportJson: string }[];
    return rows.map((row) => ({ set: "saved" as const, id: String(row.id), json: row.reportJson }));
  } finally {
    db.close();
  }
}

function normalize(text: string): string { return text.replace(/\s+/g, " ").trim(); }

/** One figure field, as each surface shows it ({@link NONE} when it shows nothing). */
type FieldTexts = Partial<Record<Surface, string>>;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  installFixedClock(args.clock);
  const { parseStoredReportWithSafety } = await import("../src/report/legacyEntitySafety");
  const { prepareReportForSurface, SURFACE_PREPARATION } = await import("../src/report/readerPreparation");
  const presentation = await import("../src/report/presentation");
  const { unavailableCashFlowModel } = await import("../src/report/readerConventions");
  const { primaryCapitalEvidenceTables } = await import("../src/report/auditTables");
  const { reportToMarkdown } = await import("../src/report/export/markdown");
  const { reportToPrintBody } = await import("../src/report/export/printHtml");
  const { ReportView } = await import("../src/components/report/ReportView");
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { Window } = await import("happy-dom");

  const sources = [...(args.golden ? goldenSources(args.golden) : []), ...(args.db ? await savedSources(args.db) : [])];

  const readable = (html: string): string => {
    const window = new Window();
    window.document.body.innerHTML = html;
    window.document.querySelectorAll("script,style,[hidden],[aria-hidden=true],.sr-only").forEach((element) => element.remove());
    const text = normalize(window.document.body.textContent ?? "");
    void window.happyDOM.close();
    return text;
  };
  const unescapedMarkdown = (md: string): string => normalize(md.replace(/\\([\\`*_~[\]<>&#@{}()+\-.!|])/g, "$1").replace(/[`*]/g, ""));

  /**
   * Each figure field's texts on one report, and the pieces of each that the
   * rendered surface must contain (a field's text, unless the renderer lays
   * its parts out apart, e.g. "p = 25%" in the app; a synthetic summary such
   * as the scenario order has none).
   */
  const pieces = new Map<string, string[]>();
  function figures(report: Report): Map<string, FieldTexts> {
    const out = new Map<string, FieldTexts>();
    pieces.clear();
    const put = (field: string, surface: Surface, text: string | null | undefined, parts?: string[]) => {
      const entry = out.get(field) ?? {};
      entry[surface] = text === null || text === undefined || text === "" ? NONE : normalize(text);
      out.set(field, entry);
      if (parts) pieces.set(`${field}\u0000${surface}`, parts.map(normalize));
    };
    for (const surface of SURFACES) {
      if (surface === "key-data") continue;
      const prepared = prepareReportForSurface(report, surface === "markdown" || surface === "print" ? surface : "web").report;
      if (unavailableCashFlowModel(prepared)) {
        put("headline: no-model text", surface, presentation.valuationNoModelWithheldText(prepared.fairValue, surface));
        continue;
      }
      const headline = presentation.valuationHeadlineView(prepared.valuation, prepared.fairValue, surface);
      put("headline: label", surface, headline.label);
      put("headline: shown value", surface, headline.valueText ?? `${presentation.VALUATION_WITHHELD_TEXT}${headline.withheldReason ? ` — ${headline.withheldReason}` : ""}`);
      put("headline: comparison", surface, headline.comparison ? `${headline.comparison.label} ${headline.comparison.text}` : null);
      put("headline: degraded caveat", surface, headline.degradedCaveat);
      put("headline: basis / withheld caveat", surface, headline.basisCaveat);
      const scenarios = presentation.valuationScenarioView(prepared.valuation, prepared.scenarioPresentation, surface);
      put("scenarios: heading", surface, scenarios.heading);
      put("scenarios: order", surface, scenarios.rows.map((row) => row.scenario.name).join(", "), []);
      put("scenarios: weight basis", surface, scenarios.weightBasis);
      put("scenarios: target caveat", surface, presentation.scenarioTargetsCaveat(prepared.scenarioTargets, (text) => text));
      for (const row of scenarios.rows) {
        put(`scenarios: ${row.scenario.name} target`, surface, row.targetText ?? presentation.SCENARIO_TARGET_UNAVAILABLE_TEXT);
        put(`scenarios: ${row.scenario.name} weight`, surface, row.weight ? `${row.weight.label} ${row.weight.text}` : null, row.weight ? [row.weight.label, row.weight.text] : []);
      }
    }
    // The key-data box (one shared view; the app's prepared report feeds it in the classic layout).
    const keyRow = presentation.keyDataRows(prepareReportForSurface(report, "web").report).find((row) => presentation.isFairValueKeyDataLabel(row.label));
    if (keyRow) {
      put("headline: label", "key-data", keyRow.label);
      put("headline: shown value", "key-data", keyRow.value);
      put("headline: comparison", "key-data", keyRow.note?.split("; ").find((part) => part.endsWith(" vs price")) ?? null);
    }
    return out;
  }

  /** Every decided text a surface must show, checked against what it renders. */
  function rendered(report: Report): Record<Exclude<Surface, "key-data">, string> {
    const classic = renderToStaticMarkup(React.createElement(ReportView, { report, layout: "classic", headerNotices: true, selectedReportId: 1, selectedReportStatus: "done" }));
    const dossier = renderToStaticMarkup(React.createElement(ReportView, { report, layout: "dossier", headerNotices: true, selectedReportId: 1, selectedReportStatus: "done" }));
    return {
      markdown: unescapedMarkdown(reportToMarkdown(report, { selectedReportId: 1 })),
      print: readable(reportToPrintBody(report, { selectedReportId: 1 })),
      classic: readable(classic),
      dossier: readable(dossier),
    };
  }

  interface Disagreement { field: string; signature: string; texts: FieldTexts; reports: Set<string> }
  const disagreements = new Map<string, Disagreement>();
  const fieldReports = new Map<string, Set<string>>();
  const missing: string[] = [];
  const unreadable: string[] = [];
  let prepDiffer = 0;
  const prepPaths = new Map<string, number>();
  let primaryCapital = 0;
  let checked = 0;
  const counts = { golden: 0, saved: 0 };

  for (const source of sources) {
    const key = `${source.set}:${source.id}`;
    const stored = parseStoredReportWithSafety(source.json);
    if (stored === null) { unreadable.push(key); continue; }
    counts[source.set] += 1;
    const report = stored.report;
    const fields = figures(report);
    const shown = rendered(report);
    for (const [field, texts] of fields) {
      (fieldReports.get(field) ?? fieldReports.set(field, new Set()).get(field)!).add(key);
      for (const surface of ["markdown", "print", "classic", "dossier"] as const) {
        const text = texts[surface];
        if (text === undefined || text === NONE) continue;
        for (const piece of pieces.get(`${field}\u0000${surface}`) ?? [text]) {
          checked += 1;
          if (!shown[surface].includes(piece)) missing.push(`${key} ${surface} ${field}: ${piece.slice(0, 80)}`);
        }
      }
      const values = SURFACES.filter((surface) => texts[surface] !== undefined).map((surface) => texts[surface]!);
      if (new Set(values).size <= 1) continue;
      // Group surfaces that agree: "markdown=print | classic=dossier".
      const groups = new Map<string, Surface[]>();
      for (const surface of SURFACES) if (texts[surface] !== undefined) (groups.get(texts[surface]!) ?? groups.set(texts[surface]!, []).get(texts[surface]!)!).push(surface);
      const signature = [...groups.values()].map((group) => group.join("=")).join(" | ");
      const id = `${field}\u0000${signature}`;
      const entry = disagreements.get(id) ?? { field, signature, texts, reports: new Set<string>() };
      entry.reports.add(key);
      disagreements.set(id, entry);
    }
    // Preparation: does the app's prepared report differ from the exports'?
    const web = prepareReportForSurface(report, "web").report as unknown as Record<string, unknown>;
    const md = prepareReportForSurface(report, "markdown").report as unknown as Record<string, unknown>;
    if (!isDeepStrictEqual(web, md)) {
      prepDiffer += 1;
      for (const top of new Set([...Object.keys(web), ...Object.keys(md)])) {
        const sub = (a: unknown, b: unknown) => a && b && typeof a === "object" && typeof b === "object"
          ? [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => !isDeepStrictEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
          : [];
        if (isDeepStrictEqual(web[top], md[top])) continue;
        const keys = sub(web[top], md[top]);
        for (const k of keys.length > 0 ? keys.map((k) => `${top}.${k}`) : [top]) prepPaths.set(k, (prepPaths.get(k) ?? 0) + 1);
      }
    }
    if (primaryCapitalEvidenceTables(prepareReportForSurface(report, "markdown").report.primaryCapitalEvidence).length > 0) primaryCapital += 1;
  }

  const total = counts.golden + counts.saved;
  /** A table cell: a short text whole; a long one from just before the first character where the surfaces differ. */
  const cell = (texts: FieldTexts, surface: Surface): string => {
    const text = texts[surface];
    if (text === undefined) return "—";
    const others = Object.values(texts).filter((other): other is string => other !== undefined && other !== text);
    let at = 0;
    while (at < text.length && others.length > 0 && others.every((other) => other[at] === text[at])) at += 1;
    const start = text.length <= 140 ? 0 : Math.max(0, at - 40);
    const shown = `${start > 0 ? "…" : ""}${text.slice(start, start + 140)}${start + 140 < text.length ? "…" : ""}`;
    return shown.replace(/\|/g, "\\|");
  };
  const sorted = [...disagreements.values()].sort((a, b) => b.reports.size - a.reports.size || a.field.localeCompare(b.field));
  const bySet = (reports: Set<string>, set: string) => [...reports].filter((r) => r.startsWith(`${set}:`)).length;
  const fieldsWithDrift = new Set(sorted.map((d) => d.field));
  const reportsWithDrift = new Set(sorted.flatMap((d) => [...d.reports]));

  const lines: string[] = [];
  lines.push("# Valuation display drift across reader surfaces (P22)", "");
  lines.push(`Generated by \`scripts/report-drift.ts\` at fixed clock ${args.clock}. Reports read: ${counts.golden} same-report (golden) cases and ${counts.saved} saved reports${unreadable.length ? `; ${unreadable.length} could not be read (${unreadable.join(", ")})` : ""}.`, "");
  lines.push("## Headline numbers", "");
  lines.push(`- Figure fields compared: ${fieldReports.size}; fields on which at least two surfaces disagree on at least one report: ${fieldsWithDrift.size}.`);
  lines.push(`- Distinct disagreement patterns: ${sorted.length}; reports showing at least one: ${reportsWithDrift.size} of ${total}.`);
  lines.push(`- Rendered-text check: ${checked} decided texts looked up in the rendered surfaces; ${missing.length} not found${missing.length ? " (listed at the end)" : ""}.`);
  lines.push(`- Preparation: the app's prepared report differs from the exports' on ${prepDiffer} of ${total} reports.`);
  lines.push(`- Primary-capital evidence tables: printed by Markdown only, present on ${primaryCapital} of ${total} reports.`, "");
  lines.push("## Disagreements", "");
  lines.push("Surfaces that show the same text are joined with `=`; groups that differ are separated by `|`. The texts are from the first report that showed the pattern.", "");
  lines.push("| Figure field | Surfaces | Markdown | Print | Classic | Dossier | Key data | Reports (golden / saved) |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const d of sorted) {
    lines.push(`| ${d.field} | ${d.signature} | ${SURFACES.map((surface) => cell(d.texts, surface)).join(" | ")} | ${d.reports.size} (${bySet(d.reports, "golden")} / ${bySet(d.reports, "saved")}) |`);
  }
  lines.push("", "## Fields with no disagreement", "");
  for (const [field, reports] of [...fieldReports].sort()) if (!fieldsWithDrift.has(field)) lines.push(`- ${field} (${reports.size} reports)`);
  lines.push("", "## Named per-surface exceptions in the shared code", "");
  for (const file of ["src/report/readerPreparation.ts", "src/report/presentation.ts"]) {
    const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    for (const match of source.matchAll(/EXCEPTION ([a-z0-9]+(?:-[a-z0-9]+)+)/g)) lines.push(`- \`${match[1]}\` (${file})`);
  }
  lines.push("", "## Preparation differences (app vs exports)", "");
  lines.push(`Steps: exports ${SURFACE_PREPARATION.markdown.steps.join(" → ")}; app ${SURFACE_PREPARATION.web.steps.join(" → ")}.`, "");
  lines.push("| Report path that differs | Reports |", "|---|---|");
  for (const [p, n] of [...prepPaths].sort((a, b) => b[1] - a[1])) lines.push(`| ${p} | ${n} |`);
  if (missing.length) lines.push("", "## Decided texts not found in the rendered surface", "", ...missing.map((m) => `- ${m}`));
  const text = `${lines.join("\n")}\n`;
  if (args.out) {
    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, text);
    process.stdout.write(`report:drift: ${total} reports, ${sorted.length} disagreement patterns on ${fieldsWithDrift.size} fields, ${missing.length} missing texts -> ${args.out}\n`);
  } else {
    process.stdout.write(text);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
