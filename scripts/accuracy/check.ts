/**
 * accuracy:check — compare a golden run's headline figures with filed values.
 *
 *   npm run accuracy:check -- GOLDEN_RUN_DIR [--report FILE] [--json FILE]
 *                             [--update-expectation --reason TEXT]
 *
 * Offline and deterministic. For every data-only case in the run it reads the
 * stored stageB.json and report.json, extracts the headline figures with the
 * one mapping in scripts/accuracy/figures.ts, compares each with the committed
 * filed reference (scripts/accuracy/reference.json, built by accuracy:fetch)
 * and classifies it: match, mismatch, gap (Metis withholds it) or
 * not-established (no filed value could be established, never a match). "Same
 * value" is the P8 owner's test (src/edgar/vendorAgreement.ts).
 *
 * It then compares the result with scripts/accuracy/expectation.json and exits
 * 0 only when every figure's status equals the expectation and, for anything
 * that is not a match, Metis's value is unchanged (SHA-256 prefix; the value
 * itself is not committed because it can carry vendor data). Otherwise it lists
 * each difference as better, worse, changed value, new or missing figure.
 *
 * A deliberate change passes only when the expectation is updated in the same
 * change: --update-expectation --reason TEXT rewrites expectation.json with the
 * observed statuses and puts the reason on every changed entry. A figure may
 * change value without an update only while it stays a match: proven against
 * the filing.
 *
 * --report FILE writes the BASELINE-style Markdown table; --json FILE the same
 * rows as JSON (these contain Metis's values: keep them under tmp/).
 */
import fs from "node:fs";
import path from "node:path";
import { extractFigures, type MetisFigure } from "./figures";
import {
  classifyFigure,
  cutoffDate,
  diffExpectation,
  expectationKey,
  formatNumber,
  updateExpectation,
  type ExpectationEntry,
  type FigureStatus,
  type ObservedFigure,
} from "./lib";
import { EXPECTATION_FILE, readCompanies, readExpectation, readReference, type ReferenceEntry, type ReferenceFile } from "./files";

export interface CheckRow {
  case: string;
  ticker: string;
  figure: string;
  label: string;
  group: string;
  period: string | null;
  metis: number | null;
  currency: string | null;
  unit: string;
  source: string;
  reportNote?: string;
  filed: number | null;
  filedPeriod: string | null;
  filedKind: string | null;
  filing: string;
  filedNotes: string[];
  status: FigureStatus;
  detail: string;
  cause?: string;
  note?: string;
}

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const options = new Map<string, string>();
  let update = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--update-expectation") update = true;
    else if (["--report", "--json", "--reason", "--reference", "--expectation"].includes(arg)) {
      const value = argv[++i];
      if (value === undefined || options.has(arg)) throw new Error(`${arg} needs one value`);
      options.set(arg, value);
    } else if (arg.startsWith("--")) throw new Error(`unknown option ${arg}`);
    else positional.push(arg);
  }
  if (positional.length !== 1) throw new Error("usage: accuracy:check GOLDEN_RUN_DIR [--report FILE] [--json FILE] [--update-expectation --reason TEXT]");
  if (update && !options.get("--reason")?.trim()) throw new Error("--update-expectation needs --reason TEXT");
  return { run: path.resolve(positional[0]!), update, options };
}

/** A short filing reference: form, accession, filing date and concept for each operand. */
export function filingReference(entry: ReferenceEntry | undefined): string {
  if (!entry) return "—";
  if (entry.unresolved) return "—";
  const points = entry.points ?? [];
  if (points.length === 0) return entry.notes?.[0] ?? "—";
  return points
    .map((point) => `${point.sign < 0 ? "− " : ""}${point.form} ${point.accn} filed ${point.filed}, ${point.concept} ${point.start ? `${point.start}..` : "@"}${point.end} = ${formatNumber(point.val)}`)
    .join("; ");
}

/** The report's evidence cutoff (meta.evidenceTiming.cutoffAt), as accuracy:fetch reads it. */
export function reportCutoffAt(report: Record<string, unknown>): string | null {
  const cutoffAt = ((report.meta as Record<string, unknown> | undefined)?.evidenceTiming as Record<string, unknown> | undefined)?.cutoffAt;
  return typeof cutoffAt === "string" && cutoffAt.length > 0 ? cutoffAt : null;
}

/**
 * The filed reference may be reused for a run only when it was built for the run's own evidence cutoff (P2): a
 * reference built for a later cutoff can hold filings this report could not have had, and one built for an earlier
 * cutoff can miss the newest filing it did have. Both cutoffs are compared as filing dates (a filing dated on the
 * cutoff's UTC day counts), and every operand's filing date is checked again against the run's cutoff. Anything else
 * fails loudly, naming the case and both cutoffs: rebuild the reference for this run.
 */
export function validateReferenceCutoff(caseId: string, runCutoffAt: string | null, reference: ReferenceFile, entries: readonly ReferenceEntry[]): void {
  const rebuild = "rebuild the filed reference for this run: npm run accuracy:fetch -- --network --run <golden run>";
  if (runCutoffAt === null) throw new Error(`${caseId}: the report states no evidence cutoff (meta.evidenceTiming.cutoffAt), so the filed reference cannot be validated against it; ${rebuild}`);
  const built = reference.cases?.[caseId]?.cutoffAt;
  if (typeof built !== "string") throw new Error(`${caseId}: reference.json records no evidence cutoff for this case (run cutoff ${runCutoffAt}); ${rebuild}`);
  const cutoff = cutoffDate(runCutoffAt);
  if (cutoffDate(built) !== cutoff) {
    throw new Error(`${caseId}: the run's evidence cutoff ${runCutoffAt} differs from the cutoff the filed reference was built for (${built}); ${rebuild}`);
  }
  for (const entry of entries) {
    if (entry.unresolved) continue;
    const late = (entry.points ?? []).find((point) => point.filed > cutoff);
    if (late) {
      throw new Error(`${caseId}: the filed reference for ${entry.figure} uses ${late.form} ${late.accn} filed ${late.filed}, after the run's evidence cutoff ${runCutoffAt} (P2); ${rebuild}`);
    }
  }
}

export function buildRows(run: string, reference: ReferenceFile, expectation: readonly ExpectationEntry[]): CheckRow[] {
  const companies = readCompanies();
  const refs = new Map(reference.entries.map((entry) => [expectationKey(entry), entry]));
  const expected = new Map(expectation.map((entry) => [expectationKey(entry), entry]));
  const rows: CheckRow[] = [];
  for (const company of companies) {
    const dir = path.join(run, company.case);
    if (!fs.existsSync(path.join(dir, "stageB.json"))) continue;
    const stageB = JSON.parse(fs.readFileSync(path.join(dir, "stageB.json"), "utf8")) as Record<string, unknown>;
    const report = JSON.parse(fs.readFileSync(path.join(dir, "report.json"), "utf8")) as Record<string, unknown>;
    validateReferenceCutoff(company.case, reportCutoffAt(report), reference, reference.entries.filter((entry) => entry.case === company.case));
    for (const figure of extractFigures(stageB, report)) rows.push(row(company.ticker, company.case, figure, refs.get(`${company.case}/${figure.id}`), expected.get(`${company.case}/${figure.id}`)));
  }
  return rows;
}

function row(ticker: string, caseId: string, figure: MetisFigure, ref: ReferenceEntry | undefined, expected: ExpectationEntry | undefined): CheckRow {
  const established = ref && !ref.unresolved && typeof ref.value === "number";
  // An established reference must say what it measures; one that does not predates that rule and is rebuilt, never guessed (P3, P4).
  if (established && (ref.unit === undefined || ref.currency === undefined)) {
    throw new Error(`${caseId}: the filed reference for ${figure.id} records no comparison unit and currency; rebuild the filed reference for this run: npm run accuracy:fetch -- --network --run <golden run>`);
  }
  const classification = classifyFigure({
    metis: figure.value,
    metisPeriod: figure.period ?? "",
    metisMeasure: { unit: figure.unit, currency: figure.currency },
    reference: established ? { kind: ref.kind ?? "filed", value: ref.value!, operands: ref.operands, unit: ref.unit!, currency: ref.currency ?? null } : null,
    referencePeriod: established ? ref.period : null,
  });
  return {
    case: caseId,
    ticker,
    figure: figure.id,
    label: figure.label,
    group: figure.group,
    period: figure.period,
    metis: figure.value,
    currency: figure.currency,
    unit: figure.unit,
    source: figure.source,
    ...(figure.reportNote ? { reportNote: figure.reportNote } : {}),
    filed: established ? ref.value! : null,
    filedPeriod: established ? ref.period : null,
    filedKind: established ? ref.kind ?? "filed" : null,
    filing: filingReference(ref),
    filedNotes: [...(ref?.unresolved ? [`filed value not established: ${ref.unresolved}`] : []), ...(ref?.notes ?? []), ...(ref?.recipeWhy ? [`recipe: ${ref.recipeWhy}`] : [])],
    status: classification.status,
    detail: classification.detail,
    ...(expected?.cause && (classification.status === "mismatch" || classification.status === "not-established") ? { cause: expected.cause } : {}),
    ...(expected?.note ? { note: expected.note } : {}),
  };
}

const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

function display(value: number | null, unit: string, currency: string | null): string {
  if (value === null) return "withheld";
  const suffix = unit === "%" ? "%" : unit === "shares" ? " shares" : unit === "currency/share" ? ` ${currency ?? ""}/share` : ` ${currency ?? ""}`;
  return `${formatNumber(value)}${suffix}`;
}

const METHOD = [
  "### Method",
  "",
  "- **Figures.** One explicit mapping (scripts/accuracy/figures.ts) reads each data-only case's stored stageB.json and report.json: the latest fiscal year's revenue, operating income, net income, diluted EPS, diluted shares, capital spending and free cash flow; the current-capital TTM operating income, net income, operating cash flow, capital spending and free cash flow; cash and short-term investments, total debt including leases and the lease lines at the latest balance; and every fair-value input taken from filings (DCF base revenue, tax rate, per-share divisor, net debt, NCI, preferred, long-term investments; excess-return opening book, TTM income to common, divisor, payout; REIT FFO operands and divisor; runway liquid assets). Value, period, unit and currency come from the stored output. Market inputs (price, beta, risk-free rate, equity risk premium, consensus, FX spot rates) are not filed values and are not compared.",
  "- **Filed side.** scripts/accuracy/fetch.ts reads SEC XBRL companyfacts (and, where companyfacts has not ingested a filing, that filing's own XBRL instance) and picks facts by concept, period and form with its own selection code (scripts/accuracy/lib.ts, recipes.ts); it never calls Metis's statement builders. Only filings dated on or before the report's evidence cutoff count, and the newest such filing wins across equivalent concepts (P2); earlier differing values are listed as restatements. The reference is used only for the cutoff it was built for. Non-controlling interest and preferred stock the filing does not present count as zero only when that filing's own XBRL instance shows no other such element, dimensional member or equity gap (P7, P10). TTM flows are fiscal year + current year to date − prior-year year to date, with both year-to-date operands from one filing (P1); per-share values are never built that way. Composed balances take every part from one filing (P7). A latest-fiscal-year row is held to the report's own latest fiscal year, so an older year shown in its place is a period mismatch.",
  "- **Same value.** The rulebook's P8 owner (src/edgar/vendorAgreement.ts): `vendorAgreesWithFiled` for a filed line, `vendorAgreesWithDerived` for a value built from filed operands. Stored precision is compared, never display text. The unit and currency must agree first; a disagreement is a mismatch (P3, P4).",
  "- **Status.** match; mismatch (with a cause: Metis error, definition, or vendor value shown); gap (Metis withholds the figure, or the route marks it not applicable; the note says whether the value is in the filings); not established (no filed value could be established, never counted as a match). Capital spending is compared as a positive outflow. Per-share and share figures of the 20-F filer TSM are compared per ADS (1 ADS = 5 ordinary shares, the report's own ratio); its statement figures in TWD; its DCF inputs in USD after translating the filed TWD at the report's own stated spot rate (a market input).",
  "",
];

function noteFor(r: CheckRow): string {
  const parts: string[] = [];
  if (r.cause) parts.push(`**${r.cause}.**`);
  if (r.note) parts.push(r.note);
  if (r.status === "mismatch" && !r.note) parts.push(r.detail);
  if (r.status === "mismatch" && r.note && r.detail.startsWith("period")) parts.push(`(${r.detail})`);
  if (r.status === "gap") {
    if (r.reportNote) parts.push(`Report: ${r.reportNote}`);
    parts.push(r.filed !== null ? "The value is in the filings (see the filing reference)." : `Filed value: ${r.filedNotes[0]?.replace(/^filed value not established: /, "not established — ") ?? "not established"}.`);
  }
  if (r.status === "not-established") parts.push(r.filedNotes.join(" "));
  else if (r.status !== "gap") parts.push(...r.filedNotes.filter((note) => !note.startsWith("recipe:")));
  return parts.filter(Boolean).join(" ");
}

export function renderMarkdown(rows: readonly CheckRow[], header: string): string {
  const lines: string[] = [header, "", ...METHOD, "### Figures", "", "| Company | Figure | Period | Metis value | Filed value | Filing reference | Status | Note |", "| --- | --- | --- | --- | --- | --- | --- | --- |"];
  for (const r of rows) {
    const filedShown = r.filed === null ? "—" : `${display(r.filed, r.unit, r.currency)}${r.filedPeriod && r.filedPeriod !== r.period ? ` (${r.filedPeriod})` : ""}`;
    lines.push(`| ${r.ticker} | ${cell(r.label)} | ${cell(r.period ?? "—")} | ${cell(display(r.metis, r.unit, r.currency))} | ${cell(filedShown)} | ${cell(r.filing)} | ${r.status} | ${cell(noteFor(r))} |`);
  }
  lines.push("", "### Market inputs (not a filed value; not compared)", "", "| Company | Inputs |", "| --- | --- |");
  for (const ticker of [...new Set(rows.map((r) => r.ticker))]) lines.push(`| ${ticker} | ${marketInputs(rows.filter((r) => r.ticker === ticker)).join("; ")} |`);
  lines.push("", ...renderSummary(rows), "", ...renderRanked(rows));
  return `${lines.join("\n")}\n`;
}

/** The market inputs a case's valuation uses, listed once: they are observations, not filed values. */
export function marketInputs(rows: readonly CheckRow[]): string[] {
  const has = (figure: string) => rows.some((r) => r.figure === figure && r.metis !== null);
  const inputs = ["share price (quote)", "provider market cap and share counts at the quote"];
  if (has("fv.startRevenue")) inputs.push("beta, risk-free rate and equity risk premium (WACC)", "analyst consensus (year-one revenue anchor and growth methods)");
  if (has("fv.openingBookValue")) inputs.push("beta, risk-free rate and equity risk premium (cost of equity)");
  const statementCurrencies = new Set(rows.filter((r) => r.group === "statement" && r.currency).map((r) => r.currency));
  if (rows.some((r) => r.group === "valuation" && r.currency && !statementCurrencies.has(r.currency))) inputs.push("FX spot rate that translates the valuation into the quote currency");
  if (!has("fv.startRevenue") && !has("fv.openingBookValue")) inputs.push("multiples' market values");
  return inputs;
}

const CAUSE_RANK: Record<string, number> = { "Metis error": 0, "vendor value shown": 1, definition: 2 };

function relative(r: CheckRow): number {
  if (r.metis === null || r.filed === null) return 0;
  const larger = Math.max(Math.abs(r.metis), Math.abs(r.filed));
  return larger === 0 ? 0 : Math.abs(r.metis - r.filed) / larger;
}

/** Mismatches ranked by cause (Metis error first) then size; gaps whose value is filed. */
export function renderRanked(rows: readonly CheckRow[]): string[] {
  const mismatches = rows.filter((r) => r.status === "mismatch" || (r.status === "not-established" && r.cause))
    .sort((a, b) => (CAUSE_RANK[a.cause ?? ""] ?? 3) - (CAUSE_RANK[b.cause ?? ""] ?? 3) || relative(b) - relative(a));
  const lines = ["### Ranked: mismatches and values shown without a filed counterpart", "", "| # | Company | Figure | Metis value | Filed value | Cause | Why |", "| --- | --- | --- | --- | --- | --- | --- |"];
  mismatches.forEach((r, index) => lines.push(`| ${index + 1} | ${r.ticker} | ${cell(r.label)} | ${cell(display(r.metis, r.unit, r.currency))} | ${cell(r.filed === null ? "not filed / not established" : display(r.filed, r.unit, r.currency))} | ${r.cause ?? "—"} | ${cell(r.note ?? r.detail)} |`));
  const filedGaps = rows.filter((r) => r.status === "gap" && r.filed !== null);
  lines.push("", "### Gaps whose value is in the filings", "", "| Company | Figure | Period | Filed value | Filing reference |", "| --- | --- | --- | --- | --- |");
  for (const r of filedGaps) lines.push(`| ${r.ticker} | ${cell(r.label)} | ${cell(r.period ?? "—")} | ${cell(display(r.filed, r.unit, r.currency))} | ${cell(r.filing)} |`);
  return lines;
}

const STATUSES: FigureStatus[] = ["match", "mismatch", "gap", "not-established"];

export function renderSummary(rows: readonly CheckRow[]): string[] {
  const count = (subset: readonly CheckRow[], status: FigureStatus) => subset.filter((r) => r.status === status).length;
  const lines = ["### Summary by company", "", "| Company | Match | Mismatch | Gap | Not established | Figures |", "| --- | --- | --- | --- | --- | --- |"];
  for (const ticker of [...new Set(rows.map((r) => r.ticker))]) {
    const subset = rows.filter((r) => r.ticker === ticker);
    lines.push(`| ${ticker} | ${STATUSES.map((s) => count(subset, s)).join(" | ")} | ${subset.length} |`);
  }
  lines.push(`| **All** | ${STATUSES.map((s) => count(rows, s)).join(" | ")} | ${rows.length} |`, "", "### Summary by figure", "", "| Figure | Match | Mismatch | Gap | Not established | Companies |", "| --- | --- | --- | --- | --- | --- |");
  for (const figure of [...new Set(rows.map((r) => r.figure))]) {
    const subset = rows.filter((r) => r.figure === figure);
    lines.push(`| ${cell(subset[0]!.label)} | ${STATUSES.map((s) => count(subset, s)).join(" | ")} | ${subset.length} |`);
  }
  return lines;
}

function main(argv: string[]): void {
  const args = parseArgs(argv);
  const reference = readReference(args.options.get("--reference") ? path.resolve(args.options.get("--reference")!) : undefined);
  const expectationFile = args.options.get("--expectation") ? path.resolve(args.options.get("--expectation")!) : EXPECTATION_FILE;
  const expectation = fs.existsSync(expectationFile) ? readExpectation(expectationFile) : { about: "", entries: [] };
  const rows = buildRows(args.run, reference, expectation.entries);
  if (rows.length === 0) throw new Error(`${args.run} has no data-only case listed in scripts/accuracy/companies.json`);
  const observed: ObservedFigure[] = rows.map((r) => ({ case: r.case, figure: r.figure, status: r.status, metis: r.metis }));
  const report = args.options.get("--report");
  if (report) fs.writeFileSync(path.resolve(report), renderMarkdown(rows, `## Headline figures against filed values (${path.basename(args.run)})`));
  const json = args.options.get("--json");
  if (json) fs.writeFileSync(path.resolve(json), `${JSON.stringify(rows, null, 2)}\n`);

  const out: string[] = [`accuracy:check ${path.basename(args.run)}: ${rows.length} figures in ${new Set(rows.map((r) => r.case)).size} cases — ${STATUSES.map((s) => `${rows.filter((r) => r.status === s).length} ${s}`).join(", ")}`];
  if (args.update) {
    const entries = updateExpectation(expectation.entries, observed, args.options.get("--reason")!);
    const about = expectation.about || "Expected accuracy status per headline figure for npm run accuracy:check: status, and for anything that is not a match a SHA-256 prefix of Metis's value (never the value). Update only with --update-expectation --reason, in the same change as the code that moves a figure.";
    fs.writeFileSync(expectationFile, `${JSON.stringify({ about, entries }, null, 2)}\n`);
    out.push(`expectation updated: ${path.relative(process.cwd(), expectationFile)}`);
    process.stdout.write(`${out.join("\n")}\n`);
    return;
  }
  const differences = diffExpectation(expectation.entries, observed);
  for (const difference of differences) out.push(`  ${difference.kind.toUpperCase()}: ${difference.case} ${difference.figure} — ${difference.detail}`);
  const worse = differences.filter((d) => d.kind === "worse").length;
  out.push(differences.length === 0
    ? "accuracy check: every figure as expected"
    : `accuracy check: ${differences.length} difference(s) from the expectation (${worse} worse); if intended and proven against the filing, update with --update-expectation --reason TEXT`);
  process.stdout.write(`${out.join("\n")}\n`);
  if (differences.length > 0) process.exitCode = 1;
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
