/**
 * D-254 (P13, P7): the shadow of "the debt family is admitted once per run".
 *
 * Every time a reader presents a balance row to the run's shared preparation
 * (`@/pipeline/admission/debtFamily`), this test works out beside it what that
 * reader's own call decided before the pilot, from the reader's own arguments,
 * and compares the two: the whole row, the manifest entries, the completions
 * and each cell of the family (value, refusal or resolution, filing evidence).
 * It then compares the readers with one another on the same balance date. A
 * difference there is a place where two parts of the code decide the same
 * thing differently; it is listed with the company, the row, the field and
 * both values, never resolved here.
 *
 * Inputs. The DEMO fixture always runs. The same-report cases
 * (`scripts/golden/cases.json`) run when their frozen inputs are cached under
 * `tmp/golden/inputs` (they hold vendor data and are never committed, so a
 * clean checkout runs the DEMO part alone). The chain is the same-report
 * worker's (`scripts/golden/worker.ts`): validate at the bundle's clock, Stage
 * B, the balance integrity view, the Stage C payload, then the data-only
 * report, which assembles the payload a second time.
 */
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";

import { canonicalKey } from "@/edgar/computationContext";
import { admitDebtFields, debtPresentationSections } from "@/edgar/financialEnrichment";
import { admittedIssuerFacts, confirmedIssuerFacts } from "@/edgar/issuerFacts";
import { DEBT_FAMILY_FIELDS, type DebtAdmissionResult, type DebtFamilyAdmission, type DebtRowReader } from "@/pipeline/admission/debtFamily";
import { balanceIntegrityView } from "@/pipeline/balanceIntegrity";
import { establishedCurrencyOn, runStageB, statementCurrencyEvidence } from "@/pipeline/compute";
import { buildDataBundle } from "@/pipeline/dataBundle";
import { buildDataOnlyReport, NO_KEY_SKIP_REASON } from "@/pipeline/jobRunner";
import { verifyRunInputSnapshot } from "@/pipeline/runInputSnapshot";
import { validateBundle } from "@/pipeline/stageA/validate";
import { assembleContextPayload } from "@/pipeline/stageC/payload";
import type { DataBundle } from "@/pipeline/types";
import { EdgarClient } from "@/providers/edgar";
import { createFmpClient, type FmpStatementRow } from "@/providers/fmp";

type Phase = "stageB" | "payload" | "dataOnlyReport";
interface Request { phase: Phase; bundle: DataBundle; row: FmpStatementRow; reader: DebtRowReader; result: DebtAdmissionResult<FmpStatementRow> }

const state = vi.hoisted(() => ({ phase: "stageB" as string, requests: [] as unknown[], decided: 0, legacy: false }));

vi.mock("@/edgar/financialEnrichment", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/edgar/financialEnrichment")>();
  return {
    ...actual,
    admitDebtFields: (...args: Parameters<typeof actual.admitDebtFields>) => {
      if (!state.legacy) state.decided += 1;
      return actual.admitDebtFields(...args);
    },
  };
});

vi.mock("@/pipeline/admission/debtFamily", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/pipeline/admission/debtFamily")>();
  return {
    ...actual,
    debtFamilyAdmission: (bundle: DataBundle): DebtFamilyAdmission => {
      const admission = actual.debtFamilyAdmission(bundle);
      return {
        issuer: admission.issuer,
        counts: admission.counts,
        admit: (row, reader) => {
          const result = admission.admit(row, reader);
          state.requests.push({ phase: state.phase, bundle, row, reader, result });
          return result;
        },
      };
    },
  };
});

const INPUTS = path.join(process.cwd(), "tmp", "golden", "inputs");
const CASES = (JSON.parse(fs.readFileSync(path.join(process.cwd(), "scripts", "golden", "cases.json"), "utf8")) as { cases: { id: string; snapshot: string }[] }).cases;
/** One replay per distinct frozen input; the cases that share it are named together. */
const SNAPSHOTS = [...new Set(CASES.map((golden) => golden.snapshot))].map((snapshot) => ({
  snapshot, cases: CASES.filter((golden) => golden.snapshot === snapshot).map((golden) => golden.id).join(" + "),
  file: path.join(INPUTS, `snapshot-${snapshot}.json`),
}));
const CACHED = SNAPSHOTS.filter((entry) => fs.existsSync(entry.file));

/** The payload's own day rule (payload.ts `isoDay`), for its currency argument. */
const payloadDay = (value: unknown): string | null => typeof value === "string" && value.length > 0 ? value.slice(0, 10) : null;

/** What the reader's own call decided before the pilot, from that reader's arguments. */
function readerOwnCall(request: Request): { row: FmpStatementRow; gaps: unknown[]; admissions: unknown[] } {
  const { bundle, row, reader } = request;
  const stageBFacts = (): ReturnType<typeof confirmedIssuerFacts> => {
    const admitted = admittedIssuerFacts(bundle.symbol, bundle.edgar);
    return admitted?.ok ? admitted.value.data : null;
  };
  // compute.ts read `admittedIssuerFacts`, payload.ts `confirmedIssuerFacts`.
  const facts = reader.convention === "stage-b-balance-row" ? stageBFacts() : confirmedIssuerFacts(bundle.symbol, bundle.edgar);
  if (facts === null) return { row, gaps: [], admissions: [] };
  // The payload's currency is rebuilt from its own evidence rows; Stage B's evidence rows are internal to it,
  // so its established currency is taken as passed and checked against the payload's below.
  const currency = reader.convention === "bundle-statement-row"
    ? establishedCurrencyOn([row], payloadDay(row.date), statementCurrencyEvidence(bundle)) : reader.currency;
  state.legacy = true;
  try {
    return admitDebtFields(row, facts, currency, bundle.builtAt, debtPresentationSections(bundle.edgar));
  } finally {
    state.legacy = false;
  }
}

interface Tally { presented: number; decided: number; cells: number; pairs: number; siteDifferences: string[]; readerDifferences: string[] }

function familyKeys(a: FmpStatementRow, b: FmpStatementRow): string[] {
  const changed: string[] = [];
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (key === "fieldConflicts" || key === "fieldProvenance") {
      const x = (a[key] ?? {}) as Record<string, unknown>, y = (b[key] ?? {}) as Record<string, unknown>;
      for (const field of new Set([...Object.keys(x), ...Object.keys(y)])) if (!isDeepStrictEqual(x[field], y[field])) changed.push(`${key}.${field}`);
    } else if (!isDeepStrictEqual(a[key], b[key])) changed.push(key);
  }
  return changed;
}

function compare(label: string, requests: Request[], decided: number): Tally {
  const tally: Tally = { presented: requests.length, decided, cells: 0, pairs: 0, siteDifferences: [], readerDifferences: [] };
  const at = (request: Request): string => `${label} ${request.phase} ${request.reader.statement} ${String(request.row.date)} ${String(request.row.period ?? "")}`.trim();
  // 1. The shared preparation beside each reader's own call.
  for (const request of requests) {
    const own = readerOwnCall(request);
    const { row, admitted } = request.result;
    if (!isDeepStrictEqual(row, own.row)) tally.siteDifferences.push(`${at(request)}: row differs in ${familyKeys(row, own.row).join(", ")}`);
    if (!isDeepStrictEqual(admitted.gaps, own.gaps)) tally.siteDifferences.push(`${at(request)}: manifest entries differ`);
    if (!isDeepStrictEqual(admitted.admissions, own.admissions)) tally.siteDifferences.push(`${at(request)}: completions differ`);
    if ((row === request.row) !== (own.row === request.row)) tally.siteDifferences.push(`${at(request)}: one returns the presented row itself, the other a new row`);
    const outside = familyKeys(request.row, own.row).filter((key) => !DEBT_FAMILY_FIELDS.some((field) => key === field || key.endsWith(`.${field}`)));
    if (outside.length > 0) tally.siteDifferences.push(`${at(request)}: the admission wrote outside the family (${outside.join(", ")})`);
    if (request.reader.convention === "bundle-statement-row" && request.reader.currency !==
        establishedCurrencyOn([request.row], payloadDay(request.row.date), statementCurrencyEvidence(request.bundle))) tally.siteDifferences.push(`${at(request)}: currency differs from the payload's own rule`);
    for (const field of DEBT_FAMILY_FIELDS) {
      tally.cells += 3;
      const cell = admitted.fields[field];
      if (!isDeepStrictEqual(cell.value, own.row[field])) tally.siteDifferences.push(`${at(request)}: ${field} value ${String(cell.value)} vs ${String(own.row[field])}`);
      if (!isDeepStrictEqual(cell.conflict, own.row.fieldConflicts?.[field])) tally.siteDifferences.push(`${at(request)}: ${field} refusal or resolution differs`);
      if (!isDeepStrictEqual(cell.provenance, own.row.fieldProvenance?.[field])) tally.siteDifferences.push(`${at(request)}: ${field} filing evidence differs`);
    }
  }
  // 2. The readers beside one another: Stage B's row and each later reader's row for the same balance date.
  const dateKey = (request: Request): string => `${request.reader.statement}|${String(request.row.date)}|${String(request.row.period ?? "")}`;
  const stageB = new Map<string, Request[]>();
  for (const request of requests) if (request.phase === "stageB") stageB.set(dateKey(request), [...(stageB.get(dateKey(request)) ?? []), request]);
  for (const phase of ["payload", "dataOnlyReport"] as const) {
    const seen = new Map<string, number>();
    for (const request of requests.filter((candidate) => candidate.phase === phase)) {
      const index = seen.get(dateKey(request)) ?? 0;
      seen.set(dateKey(request), index + 1);
      const partner = stageB.get(dateKey(request))?.[index];
      if (partner === undefined) { tally.readerDifferences.push(`${at(request)}: Stage B admitted no row for this date`); continue; }
      tally.pairs += 1;
      const mine = request.result.admitted, theirs = partner.result.admitted;
      if (mine.identity.currency !== theirs.identity.currency) tally.readerDifferences.push(`${at(request)}: currency ${String(mine.identity.currency)} vs Stage B ${String(theirs.identity.currency)}`);
      for (const field of DEBT_FAMILY_FIELDS) {
        const a = mine.fields[field], b = theirs.fields[field];
        if (!isDeepStrictEqual(a.value, b.value)) tally.readerDifferences.push(`${at(request)}: ${field} ${String(a.value)} vs Stage B ${String(b.value)}`);
        if (!isDeepStrictEqual(a.conflict, b.conflict)) tally.readerDifferences.push(`${at(request)}: ${field} refusal or resolution "${a.conflict?.reason ?? "none"}" vs Stage B "${b.conflict?.reason ?? "none"}"`);
        if (!isDeepStrictEqual(a.provenance, b.provenance)) tally.readerDifferences.push(`${at(request)}: ${field} filing evidence differs from Stage B's`);
      }
      if (!isDeepStrictEqual(mine.gaps, theirs.gaps) || !isDeepStrictEqual(mine.admissions, theirs.admissions)) tally.readerDifferences.push(`${at(request)}: manifest entries or completions differ from Stage B's`);
    }
    const unmatched = [...stageB.entries()].filter(([key, rows]) => rows.length !== (seen.get(key) ?? 0)).map(([key]) => key);
    if (requests.some((candidate) => candidate.phase === phase) && unmatched.length > 0) tally.readerDifferences.push(`${label} ${phase}: Stage B admitted ${unmatched.join(", ")}, which this reader did not present the same number of times`);
  }
  return tally;
}

/** The same-report worker's chain, with each reader's requests labelled by the step that made them. */
function replay(bundleIn: DataBundle, config: Parameters<typeof runStageB>[1]): { requests: Request[]; decided: number } {
  state.requests.length = 0;
  state.decided = 0;
  let bundle = bundleIn;
  const validation = validateBundle(bundle as never, { now: new Date() });
  state.phase = "stageB";
  const computed = runStageB(bundle, config, validation);
  bundle = balanceIntegrityView(bundle);
  state.phase = "payload";
  assembleContextPayload(bundle, computed, validation);
  state.phase = "dataOnlyReport";
  buildDataOnlyReport({ symbol: bundle.symbol, companyName: bundle.symbol, generatedAt: new Date().toISOString(), model: "none (no ANTHROPIC_API_KEY)", costUsd: 0,
    bundle, validation, computed, costBreakdown: [], execution: [], reason: NO_KEY_SKIP_REASON });
  return { requests: [...state.requests] as Request[], decided: state.decided };
}

/** One decision per distinct balance row and currency a run's readers present. */
function distinctInputs(requests: Request[]): number {
  return new Set(requests.map((request) => canonicalKey({ row: request.row, currency: request.reader.currency }))).size;
}

afterEach(() => { vi.useRealTimers(); });

const totals = { snapshots: 0, presented: 0, decided: 0, cells: 0, pairs: 0 };

describe.skipIf(CACHED.length === 0)("D-254 shadow on the same-report cases' frozen inputs", () => {
  it.each(CACHED)("$cases: the shared preparation equals each reader's own call, and the readers agree", ({ cases, file }) => {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as { content: { bundle: { builtAt: string } } };
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(raw.content.bundle.builtAt) });
    const snapshot = verifyRunInputSnapshot(raw);
    const { requests, decided } = replay(structuredClone(snapshot.content.bundle) as DataBundle, snapshot.content.stageBConfig);
    const tally = compare(cases, requests, decided);
    expect(tally.siteDifferences).toEqual([]);
    expect(tally.readerDifferences).toEqual([]);
    // Every reader presented rows, and a row was decided once however many readers presented it.
    for (const phase of ["stageB", "payload", "dataOnlyReport"]) expect(requests.some((request) => request.phase === phase)).toBe(true);
    expect(decided).toBe(distinctInputs(requests));
    expect(decided).toBeLessThan(requests.length);
    totals.snapshots += 1;
    totals.presented += tally.presented; totals.decided += tally.decided; totals.cells += tally.cells; totals.pairs += tally.pairs;
    console.info(`D-254 shadow ${cases}: ${tally.presented} rows presented, ${tally.decided} decided, ${tally.cells} cells and ${tally.pairs} reader pairs compared, 0 differences`);
  }, 300_000);

  it("totals", () => {
    console.info(`D-254 shadow totals: ${JSON.stringify(totals)} over ${CACHED.length} of ${SNAPSHOTS.length} frozen inputs (${CASES.length} cases)`);
    expect(totals.snapshots).toBe(CACHED.length);
  });
});

describe("D-254 shadow on the DEMO fixture", () => {
  it("has no confirmed SEC facts, so no reader admits a debt row and none did before", async () => {
    const fixedDate = new Date("2026-07-06T00:00:00.000Z");
    vi.useFakeTimers({ toFake: ["Date"], now: fixedDate });
    const gap = async (id: string) => ({ ok: false as const, gap: { field: `fred.${id}`, reason: "offline fixture", severity: "info" as const, attemptedSources: ["fixture"] } });
    const bundle = await buildDataBundle("DEMO", {
      now: () => fixedDate,
      fmp: createFmpClient({ apiKey: "", fixturesDir: path.join(process.cwd(), "fixtures", "fmp"), now: () => fixedDate,
        fetchImpl: () => Promise.reject(new Error("fixture-mode FMP invoked live fetch")) }),
      edgar: new EdgarClient({ transport: { fetchText: async () => ({ status: 404, body: "", fetchedAt: fixedDate.toISOString(), fromCache: false, stale: false }) } }),
      fredFetch: gap,
      finnhub: { fetchImpl: () => Promise.reject(new Error("keyless Finnhub invoked live fetch")) },
      finra: { fetchImpl: async () => new Response("offline fixture", { status: 503 }), retryDelaysMs: [], minRequestIntervalMs: 0, timeoutMs: 100 },
      edgarSectionBudgetMs: 100,
    });
    const balanceRows = (["balanceAnnual", "balanceQuarterly"] as const).reduce((count, family) => {
      const statement = bundle.statements[family];
      return count + (statement.ok ? statement.value.data.rows.length : 0);
    }, 0);
    expect(balanceRows).toBeGreaterThan(0);
    expect(confirmedIssuerFacts(bundle.symbol, bundle.edgar)).toBeNull();
    expect(admittedIssuerFacts(bundle.symbol, bundle.edgar)?.ok ?? false).toBe(false);
    const { requests, decided } = replay(bundle, undefined);
    // Neither reader's own call ran without facts before the pilot; neither presents a row now.
    expect(requests).toEqual([]);
    expect(decided).toBe(0);
    console.info(`D-254 shadow DEMO: ${balanceRows} balance rows, 0 presented, 0 decided (no confirmed SEC facts)`);
  }, 120_000);
});
