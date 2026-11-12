/**
 * P11 (D-219) step 2: two readers decide by the typed refusal code, and a
 * conflict without a code is read by its sentence exactly as before.
 *
 * - C14 `restoreRefusedOperatingPortion` (via `restoreLeaseFinancingProvenance`):
 *   `debt-lease-line-no-operating-total`.
 * - C11 `completeFiledDebtScope` (via `admitDebtFields`): the five incomplete-scope codes.
 *
 * Every refusal below is written by the real writer (the debt admission, the
 * SEC statement builder, the cash comparison, the plausibility helper); only
 * the presentation sentence is the writer's constant copied, because its writer
 * needs a parsed filing. Each refusal is then placed on one row whose facts let
 * the reader restore or complete it, so the reader's own check decides. Each case
 * runs twice, with its codes and with every `cause` deleted (the wording path),
 * and both runs must match each other and the stated outcome.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { implausibleDebtReason } from "@/edgar/debtCompleteness";
import { admitBalanceCash, admitDebtFields } from "@/edgar/financialEnrichment";
import { CONFLICT_CAUSES_READ_BY_CODE, conflictCauseMatches, type ConflictCodeReader } from "@/edgar/refusalCauseRead";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import type { CompanyFacts, FactPoint } from "@/edgar/xbrl";
import { captureRunInputSnapshot } from "@/pipeline/runInputSnapshot";
import { restoreLeaseFinancingProvenance } from "@/pipeline/stageB/leaseScope";
import type { FmpBalanceSheetRow, FmpStatementRow, StatementFieldConflict } from "@/providers/fmp";
import { DUAL_WRITTEN_CONFLICT_CAUSES, STATEMENT_CONFLICT_CAUSES, type StatementConflictCause } from "@/types/refusalCause";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { companyFacts, M, OBSERVED, Q2 } from "./helpers/amzn51LeaseShape";
import frozen from "./fixtures/crwv-debt-facts.json";

type Conflict = StatementFieldConflict;
type Conflicted = { fieldConflicts?: Record<string, Conflict> };
const READERS: readonly ConflictCodeReader[] = ["leaseLineNoOperatingTotal", "recoverableDebtScope"];

/** A deep copy with every conflict's `cause` removed: the same row as an older stored input. */
function uncoded<T>(value: T): T {
  const copy = structuredClone(value);
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (node === null || typeof node !== "object") return;
    const conflicts = (node as Conflicted).fieldConflicts;
    if (conflicts) for (const conflict of Object.values(conflicts)) delete (conflict as { cause?: unknown }).cause;
    Object.values(node).forEach(visit);
  };
  visit(copy);
  return copy;
}

// ---- Refusals, each from its writer. ----
const CASH = 10 * M;
const vendor = (over: Partial<FmpBalanceSheetRow> = {}): FmpBalanceSheetRow => ({ date: Q2, reportedCurrency: "USD", cik: "0000000042", longTermDebt: 100 * M,
  shortTermDebt: 0, capitalLeaseObligations: 18 * M, totalDebt: 118 * M, cashAndCashEquivalents: CASH, netDebt: 108 * M, ...over });
const admitted = (tags: Record<string, number>, row: FmpBalanceSheetRow) => admitDebtFields(row, companyFacts({ [Q2]: tags }), "USD", OBSERVED).row as Conflicted;
const MATURITY_TAG = "LongTermDebtMaturitiesRepaymentsOfPrincipalInNextTwelveMonths";
const REMAINDER_TAG = "LongTermDebtMaturitiesRepaymentsOfPrincipalRemainderOfFiscalYear";
const edgar = (tag: string) => ({ source: "edgar" as const, unit: "USD", periodStart: null, periodEnd: Q2, observedAt: OBSERVED, tags: [`us-gaap/${tag}`], filings: [] });
const shortRefusal = { usable: false, vendorValue: 4 * M, secValue: null, reason: "debt maturity scope unresolved: x" } as const;
const PRESENTATION = "debt presentation conflict: resolved debt components do not match the same-filing carrying lines or the established taxonomy adjustment";
/** The pre-18ea3137 vendor-sum refusal (inventory C5): no current writer, so it never carries a code. */
const OLD_VENDOR_SUM = "incomplete debt carrying value: the vendor lease line 23M USD is noncurrent, but the vendor total debt 122.5M is not its short-term debt + long-term debt + lease line, so its composition is unknown; the row is not completed from that filing, so total debt and net debt are withheld";

interface Refusal { totalDebt: Conflict; netDebt: Conflict }
const refusalOf = (row: Conflicted): Refusal => ({ totalDebt: row.fieldConflicts!.totalDebt!, netDebt: row.fieldConflicts!.netDebt! });
const literal = (reason: string): Refusal => ({ totalDebt: { usable: false, vendorValue: null, secValue: null, reason }, netDebt: { usable: false, vendorValue: null, secValue: null, reason } });

const REFUSALS = {
  "lease line, no total operating-lease liability": refusalOf(admitted({ LongTermDebtNoncurrent: 100, OperatingLeaseLiabilityNoncurrent: 18 }, vendor())),
  "lease line, any other refusal": refusalOf(admitted({ LongTermDebtNoncurrent: 100, LongTermDebtCurrent: 4, OperatingLeaseLiability: 20, OperatingLeaseLiabilityCurrent: 2,
    OperatingLeaseLiabilityNoncurrent: 18 }, vendor({ operatingLeaseLiability: 25 * M }))),
  "vendor short-term debt of 0": refusalOf(admitted({ LongTermDebtNoncurrent: 100, LongTermDebtCurrent: 4 }, vendor({ longTermDebt: 90 * M, capitalLeaseObligations: 0, totalDebt: 90 * M }))),
  "tagged total above the components": refusalOf(admitted({ LongTermDebt: 300 }, vendor({ shortTermDebt: 4 * M, capitalLeaseObligations: 0, totalDebt: 104 * M }))),
  "combined total above the components": refusalOf(admitted({ DebtLongtermAndShorttermCombinedAmount: 300 }, vendor({ shortTermDebt: 4 * M, capitalLeaseObligations: 0, totalDebt: 104 * M }))),
  "components do not establish the total": refusalOf(admitted({ DebtInstrumentCarryingAmount: 300 }, vendor({ shortTermDebt: undefined, capitalLeaseObligations: 0, totalDebt: 100 * M }))),
  "fiscal maturity bucket": refusalOf(admitted({ LongTermDebtNoncurrent: 100, [MATURITY_TAG]: 4, [REMAINDER_TAG]: 2 }, vendor({ shortTermDebt: 4 * M, capitalLeaseObligations: 0,
    totalDebt: 104 * M, fieldProvenance: { shortTermDebt: edgar(MATURITY_TAG), longTermDebt: edgar("LongTermDebtNoncurrent") } }))),
  "maturity-scoped short-term component": refusalOf(admitted({ LongTermDebtNoncurrent: 100 }, vendor({ shortTermDebt: undefined, capitalLeaseObligations: 0, totalDebt: undefined,
    fieldConflicts: { shortTermDebt: { ...shortRefusal, cause: "debt-maturity-scope" } } }))),
  "uncoded refused component": refusalOf(admitted({ LongTermDebtNoncurrent: 100 }, vendor({ shortTermDebt: undefined, capitalLeaseObligations: 0, totalDebt: undefined,
    fieldConflicts: { shortTermDebt: shortRefusal } }))),
  "convertible notes not covered": refusalOf(admitted({ LongTermDebtNoncurrent: 100, ConvertibleLongTermNotesPayable: 150 }, vendor())),
  "same-filing completion refused": refusalOf(admitted({ LongTermDebtNoncurrent: 100, OperatingLeaseLiability: 20, OperatingLeaseLiabilityCurrent: 2 }, vendor())),
  "debt presentation conflict": literal(PRESENTATION),
  "implausible interest on resolved debt": literal(implausibleDebtReason({ annualInterestExpense: 50 * M, financingDebt: 100 * M, priorFinancingDebts: [], totalAssets: null })!),
  "pre-18ea3137 vendor-sum refusal": literal(OLD_VENDOR_SUM),
} satisfies Record<string, Refusal>;
type RefusalName = keyof typeof REFUSALS;

it("each writer's refusal carries the code (or no code) the readers are tested on", () => {
  const causes = Object.fromEntries(Object.entries(REFUSALS).map(([name, refusal]) => [name, [refusal.totalDebt.cause ?? null, refusal.netDebt.cause ?? null]]));
  expect(causes).toEqual({
    "lease line, no total operating-lease liability": ["debt-lease-line-no-operating-total", "debt-lease-line-no-operating-total"],
    "lease line, any other refusal": ["debt-lease-line-refused", "debt-lease-line-refused"],
    "vendor short-term debt of 0": ["debt-vendor-short-term-zero", "debt-vendor-short-term-zero"],
    "tagged total above the components": ["debt-aggregate-exceeds-components", "debt-aggregate-exceeds-components"],
    "combined total above the components": ["debt-combined-aggregate-exceeds-components", "debt-combined-aggregate-exceeds-components"],
    "components do not establish the total": ["debt-components-incomplete", "debt-components-incomplete"],
    "fiscal maturity bucket": ["debt-maturity-scope", "debt-maturity-scope"],
    "maturity-scoped short-term component": ["debt-component-maturity-scope", "debt-component-maturity-scope"],
    "uncoded refused component": [null, null],
    "convertible notes not covered": [null, null],
    "same-filing completion refused": [null, null],
    "debt presentation conflict": [null, null],
    "implausible interest on resolved debt": [null, null],
    "pre-18ea3137 vendor-sum refusal": [null, null],
  });
  for (const refusal of Object.values(REFUSALS)) {
    expect(refusal.totalDebt.usable).toBe(false);
    expect(refusal.netDebt.reason).toBe(refusal.totalDebt.reason);
  }
  expect(REFUSALS["convertible notes not covered"].totalDebt.reason).toMatch(/^incomplete debt carrying value: noncurrent convertible carrying debt /);
  expect(REFUSALS["same-filing completion refused"].totalDebt.reason).toMatch(/^incomplete debt carrying value: same-filing completion refused: /);
});

// ---- One row the readers would restore or complete; only the refusal varies. ----
/** Same-period filing: noncurrent debt 100, current debt 0, noncurrent operating lease 18, no operating-lease total. */
const RECOVERY_TAGS = { LongTermDebtNoncurrent: 100, LongTermDebtCurrent: 0, OperatingLeaseLiabilityNoncurrent: 18 };
const recoveryFacts = (extra: Record<string, number> = {}): CompanyFacts => companyFacts({ [Q2]: { ...RECOVERY_TAGS, ...extra } });
/** The refusal as the row carries it; the amounts it was refused at are this row's. */
function refusedRow(refusal: Refusal, base: FmpBalanceSheetRow = vendor()): FmpBalanceSheetRow {
  // Retained admission refusals serialize the withheld fields as null, unlike optional provider fields.
  return { ...base, totalDebt: null, netDebt: null, fieldConflicts: { ...base.fieldConflicts,
    totalDebt: { ...structuredClone(refusal.totalDebt), vendorValue: 118 * M },
    netDebt: base.fieldConflicts?.netDebt ?? { ...structuredClone(refusal.netDebt), vendorValue: 108 * M } } } as unknown as FmpBalanceSheetRow;
}
const C14 = (row: FmpBalanceSheetRow, facts = recoveryFacts()) => restoreLeaseFinancingProvenance(row, facts, OBSERVED);
const C11 = (row: FmpBalanceSheetRow, facts = recoveryFacts()) => admitDebtFields(row, facts, "USD", OBSERVED);

/** The reader's result with codes and without them: the same apart from `cause`. */
function bothWays<R>(read: (row: FmpBalanceSheetRow) => R, row: FmpBalanceSheetRow): R {
  const coded = read(structuredClone(row));
  const legacy = read(uncoded(row));
  expect(uncoded(coded)).toEqual(uncoded(legacy));
  return coded;
}

function expectRestored(row: FmpBalanceSheetRow, input: FmpBalanceSheetRow): void {
  expect(row.totalDebt).toBe(118 * M);
  expect(row.operatingLeaseLiability).toBe(18 * M);
  expect(row.fieldConflicts?.totalDebt).toBeUndefined();
  expect(row.fieldConflicts?.netDebt).toBeUndefined();
  expect(row.fieldProvenance?.totalDebt?.tags).toEqual(["us-gaap/LongTermDebtCurrent", "us-gaap/LongTermDebtNoncurrent", "us-gaap/OperatingLeaseLiabilityNoncurrent"]);
  expect(input.totalDebt).toBeNull();
}
function expectLeftRefused(row: FmpBalanceSheetRow, input: FmpBalanceSheetRow): void {
  expect(row).toEqual(input);
}
function expectRecovered(out: ReturnType<typeof C11>): void {
  expect(out.row.totalDebt).toBe(118 * M);
  expect(out.row.netDebt).toBe(108 * M);
  expect(out.row.fieldConflicts?.totalDebt).toBeUndefined();
  expect(out.row.fieldConflicts?.netDebt).toBeUndefined();
  expect(out.admissions.map((admission) => admission.kind)).toEqual(["filing-completion"]);
  expect(out.gaps).toEqual([]);
}
function expectStillRefused(out: ReturnType<typeof C11>, input: FmpBalanceSheetRow): void {
  expect(out.row.totalDebt).toBeNull();
  expect(out.row.netDebt).toBeNull();
  // The kept refusal keeps its sentence and its code (the cascade rebuilds the record around them).
  for (const field of ["totalDebt", "netDebt"]) {
    const kept = out.row.fieldConflicts?.[field], before = input.fieldConflicts![field]!;
    expect({ usable: kept?.usable, reason: kept?.reason, cause: kept?.cause }).toEqual({ usable: false, reason: before.reason, cause: before.cause });
  }
  expect(out.admissions).toEqual([]);
}

const C14_RESTORES: readonly RefusalName[] = ["lease line, no total operating-lease liability"];
const C11_RECOVERS: readonly RefusalName[] = ["lease line, no total operating-lease liability", "lease line, any other refusal", "vendor short-term debt of 0",
  "tagged total above the components", "combined total above the components", "pre-18ea3137 vendor-sum refusal"];
const ALL = Object.keys(REFUSALS) as RefusalName[];

describe("C14: the D-186 lease-portion recovery reads debt-lease-line-no-operating-total", () => {
  it.each(C14_RESTORES)("restores %s, with its code and without", (name) => {
    const input = refusedRow(REFUSALS[name]);
    expectRestored(bothWays(C14, input), input);
  });

  it.each(ALL.filter((name) => !C14_RESTORES.includes(name)))("leaves %s refused, with its code and without", (name) => {
    const input = refusedRow(REFUSALS[name]);
    expectLeftRefused(bothWays(C14, input), input);
  });

  it("restores the refusal the debt admission wrote on an earlier pass once the filing shows the current debt", () => {
    const earlier = admitDebtFields(vendor(), companyFacts({ [Q2]: { LongTermDebtNoncurrent: 100, OperatingLeaseLiabilityNoncurrent: 18 } }), "USD", OBSERVED).row;
    expect(earlier.fieldConflicts?.totalDebt?.cause).toBe("debt-lease-line-no-operating-total");
    expectRestored(bothWays(C14, earlier), earlier);
  });
});

describe("C11: the same-filing debt completion revisits only incomplete-scope refusals", () => {
  it.each(C11_RECOVERS)("completes past %s, with its code and without", (name) => {
    expectRecovered(bothWays(C11, refusedRow(REFUSALS[name])));
  });

  it.each(ALL.filter((name) => !C11_RECOVERS.includes(name)))("leaves %s refused, with its code and without", (name) => {
    const input = refusedRow(REFUSALS[name]);
    expectStillRefused(bothWays(C11, input), input);
  });

  it("completes a refusal it wrote on an earlier pass once the filing shows the current debt", () => {
    const earlier = admitDebtFields(vendor(), companyFacts({ [Q2]: { LongTermDebtNoncurrent: 100, OperatingLeaseLiabilityNoncurrent: 18 } }), "USD", OBSERVED).row;
    expect(earlier.fieldConflicts?.totalDebt?.cause).toBe("debt-lease-line-no-operating-total");
    expectRecovered(bothWays(C11, earlier));
  });

  describe("a vendor/SEC cash conflict on net debt", () => {
    const cashFacts = recoveryFacts({ CashAndCashEquivalentsAtCarryingValue: 9 });
    const cashRefused = admitBalanceCash(vendor(), cashFacts, "quarter", OBSERVED).row;
    const read = (row: FmpBalanceSheetRow) => C11(row, cashFacts);

    it("is the cash refusal itself, coded on the cash field and net debt", () => {
      expect(cashRefused.fieldConflicts?.netDebt).toMatchObject({ usable: false, cause: "vendor-sec-value-conflict", reason: cashRefused.fieldConflicts?.cashAndCashEquivalents?.reason });
    });

    it("does not stop a completion when it only repeats the cash refusal (C10), and stays on net debt", () => {
      const input = refusedRow(REFUSALS["vendor short-term debt of 0"], cashRefused);
      const out = bothWays(read, input);
      expect(out.row.totalDebt).toBe(118 * M);
      expect(out.row.netDebt).toBeNull();
      expect(out.row.fieldConflicts?.totalDebt).toBeUndefined();
      expect(out.row.fieldConflicts?.netDebt).toMatchObject({ usable: false, reason: cashRefused.fieldConflicts!.cashAndCashEquivalents!.reason });
      expect(out.admissions.map((admission) => admission.kind)).toEqual(["filing-completion"]);
    });

    it("stops the completion when the cash field itself is not refused", () => {
      const others = { ...cashRefused.fieldConflicts };
      delete others.cashAndCashEquivalents;
      const input = refusedRow(REFUSALS["vendor short-term debt of 0"], { ...cashRefused, cashAndCashEquivalents: CASH, fieldConflicts: others });
      expectStillRefused(bothWays(read, input), input);
    });
  });
});

describe("the code is what is read", () => {
  const LEASE_LINE_SENTENCE = REFUSALS["lease line, no total operating-lease liability"].totalDebt.reason;
  const recast = (cause: string | undefined, reason: string): Refusal => {
    const one = { usable: false, vendorValue: null, secValue: null, reason, ...(cause === undefined ? {} : { cause: cause as StatementConflictCause }) };
    return { totalDebt: one, netDebt: { ...one } };
  };

  it.each([
    ["debt-lease-line-no-operating-total", "a sentence neither reader's wording matches"],
  ] as const)("C14 restores %s whatever its sentence", (cause, reason) => {
    const input = refusedRow(recast(cause, reason));
    expectRestored(C14(input), input);
  });

  it.each(["debt-lease-line-refused", "debt-lease-line-no-operating-total", "debt-vendor-short-term-zero", "debt-aggregate-exceeds-components",
    "debt-combined-aggregate-exceeds-components"] as const)("C11 completes past %s whatever its sentence", (cause) => {
    expectRecovered(C11(refusedRow(recast(cause, "a sentence neither reader's wording matches"))));
  });

  it.each(["debt-maturity-scope", "debt-lease-line-refused", "vendor-sec-value-conflict", "revenue-scope", "a-code-no-list-has"])(
    "C14 leaves the lease-line sentence refused under %s", (cause) => {
      const input = refusedRow(recast(cause, LEASE_LINE_SENTENCE));
      expectLeftRefused(C14(input), input);
    });

  it.each(["debt-maturity-scope", "debt-components-incomplete", "vendor-sec-value-conflict", "revenue-scope", "a-code-no-list-has"])(
    "C11 leaves the lease-line sentence refused under %s", (cause) => {
      const input = refusedRow(recast(cause, LEASE_LINE_SENTENCE));
      expectStillRefused(C11(input), input);
    });

  it("a row with no code is read by its sentence: a matching sentence passes, any other does not", () => {
    expectRestored(C14(refusedRow(recast(undefined, LEASE_LINE_SENTENCE))), refusedRow(recast(undefined, LEASE_LINE_SENTENCE)));
    expectRecovered(C11(refusedRow(recast(undefined, LEASE_LINE_SENTENCE))));
    expectRecovered(C11(refusedRow(recast(undefined, OLD_VENDOR_SUM))));
    for (const reason of ["a sentence neither reader's wording matches", REFUSALS["components do not establish the total"].totalDebt.reason]) {
      const input = refusedRow(recast(undefined, reason));
      expectLeftRefused(C14(input), input);
      expectStillRefused(C11(input), input);
    }
  });
});

// ---- The module: code-set membership equals the legacy wording on every sentence the writers produce. ----
const AT = "2026-06-30";
function crwvBalanceRows(add: Record<string, number> = {}, remove: string[] = []): Conflicted[] {
  const facts = structuredClone(frozen.facts) as CompanyFacts;
  const gaap = facts.facts["us-gaap"]!;
  const filed = (gaap.Assets as { units: { USD: FactPoint[] } }).units.USD.find((p) => p.end === AT)!;
  for (const tag of remove) {
    const concept = gaap[tag] as { units: { USD: FactPoint[] } } | undefined;
    if (concept) concept.units.USD = concept.units.USD.filter((p) => p.end !== AT);
  }
  for (const [tag, val] of Object.entries(add)) ((gaap[tag] ??= { units: { USD: [] } }) as { units: { USD: FactPoint[] } }).units.USD.push({ ...filed, val });
  const out = buildStatementsFromCompanyFacts(facts, {
    symbol: "CRWV", cik: "0001769628", asOf: frozen.asOf, factsObservedAt: "2026-10-16T09:33:42.064Z", annualPeriods: 2, quarterlyPeriods: 4,
    vendorSplits: { status: "retrieved", source: "test:vendor", events: [], coverage: [{ from: "2020-01-01", to: frozen.asOf }] },
  });
  return [...out.balanceQuarterly.rows, ...out.balanceAnnual.rows] as Conflicted[];
}

describe("refusalCauseRead", () => {
  const MATURITIES = [MATURITY_TAG, REMAINDER_TAG];
  const conflicts: Conflict[] = [
    ...Object.values(REFUSALS).flatMap((refusal) => [refusal.totalDebt, refusal.netDebt]),
    ...Object.values(admitBalanceCash(vendor(), recoveryFacts({ CashAndCashEquivalentsAtCarryingValue: 9 }), "quarter", OBSERVED).row.fieldConflicts ?? {}),
    ...[
      crwvBalanceRows(),
      crwvBalanceRows({ LongTermDebt: 30e9 }),
      crwvBalanceRows({ LongTermDebtNoncurrent: 10e9 }, MATURITIES),
      crwvBalanceRows({ LongTermDebtCurrent: 1e9, LongTermDebtNoncurrent: 10e9, DebtLongtermAndShorttermCombinedAmount: 30e9 }, [...MATURITIES, "DebtInstrumentCarryingAmount"]),
      crwvBalanceRows({ LongTermDebtCurrent: 1e9, LongTermDebtNoncurrent: 10e9, LongTermDebtAndCapitalLeaseObligations: 30e9 }, [...MATURITIES, "DebtInstrumentCarryingAmount"]),
    ].flat().flatMap((row) => Object.values(row.fieldConflicts ?? {})),
  ];

  it.each(READERS)("%s: on every sentence the writers produce, the code set and the legacy wording agree", (reader) => {
    const coded = conflicts.filter((conflict) => conflict.cause !== undefined);
    expect(coded.length).toBeGreaterThan(20);
    for (const conflict of coded) {
      expect({ reason: conflict.reason, cause: conflict.cause, matches: conflictCauseMatches(conflict, reader) })
        .toEqual({ reason: conflict.reason, cause: conflict.cause, matches: conflictCauseMatches({ reason: conflict.reason }, reader) });
    }
  });

  it("the writers reach every code a reader reads, each on both sides of each reader", () => {
    const reached = new Set(conflicts.map((conflict) => conflict.cause).filter((cause) => cause !== undefined));
    expect([...CONFLICT_CAUSES_READ_BY_CODE].filter((cause) => !reached.has(cause))).toEqual([]);
    for (const reader of READERS) {
      expect(new Set(conflicts.filter((c) => c.cause !== undefined).map((c) => conflictCauseMatches(c, reader)))).toEqual(new Set([true, false]));
    }
  });

  it("reads exactly the five incomplete-scope and lease-line codes, all of them D-218 step-1 codes", () => {
    expect([...CONFLICT_CAUSES_READ_BY_CODE].sort()).toEqual(["debt-aggregate-exceeds-components", "debt-combined-aggregate-exceeds-components",
      "debt-lease-line-no-operating-total", "debt-lease-line-refused", "debt-vendor-short-term-zero"]);
    expect([...CONFLICT_CAUSES_READ_BY_CODE].every((cause) => DUAL_WRITTEN_CONFLICT_CAUSES.has(cause))).toBe(true);
  });

  it("decides a coded conflict by its code alone and an uncoded one by its sentence", () => {
    expect(conflictCauseMatches({ cause: "debt-lease-line-no-operating-total", reason: "" }, "leaseLineNoOperatingTotal")).toBe(true);
    expect(conflictCauseMatches({ cause: "debt-lease-line-refused", reason: "x" }, "leaseLineNoOperatingTotal")).toBe(false);
    expect(conflictCauseMatches({ cause: "debt-lease-line-refused", reason: "x" }, "recoverableDebtScope")).toBe(true);
    expect(conflictCauseMatches({ cause: null, reason: OLD_VENDOR_SUM }, "recoverableDebtScope")).toBe(false);
    expect(conflictCauseMatches({ reason: OLD_VENDOR_SUM }, "recoverableDebtScope")).toBe(true);
    expect(conflictCauseMatches({ reason: OLD_VENDOR_SUM }, "leaseLineNoOperatingTotal")).toBe(false);
    expect(conflictCauseMatches({}, "leaseLineNoOperatingTotal")).toBe(false);
    expect(conflictCauseMatches({}, "recoverableDebtScope")).toBe(false);
  });
});

describe("run input snapshots", () => {
  it("keep the codes readers read, still drop the step-1 codes nothing reads, and keep the earlier codes", () => {
    const bundle = completeCurrencyBundle({});
    if (!bundle.statements.balanceAnnual.ok) throw Error("fixture");
    const row = bundle.statements.balanceAnnual.value.data.rows[0] as FmpStatementRow;
    row.fieldConflicts = Object.fromEntries(STATEMENT_CONFLICT_CAUSES.map((cause) =>
      [`field-${cause}`, { usable: false, vendorValue: 1, secValue: null, reason: "kept sentence", cause }]));
    const snapshot = captureRunInputSnapshot(bundle, { evIncludeLeases: false });
    const stored = snapshot.content.bundle.statements.balanceAnnual;
    const kept = Object.values((stored.ok ? stored.value.data.rows[0] as FmpStatementRow : row).fieldConflicts ?? {});
    expect(kept.map((conflict) => conflict.reason)).toEqual(STATEMENT_CONFLICT_CAUSES.map(() => "kept sentence"));
    expect(kept.map((conflict) => conflict.cause).filter((cause) => cause !== undefined).sort()).toEqual([
      "borrowing-cost-scope", "debt-aggregate-exceeds-components", "debt-combined-aggregate-exceeds-components", "debt-lease-line-no-operating-total",
      "debt-lease-line-refused", "debt-vendor-short-term-zero", "operating-basis", "operating-scope", "revenue-scope"]);
    const dropped = STATEMENT_CONFLICT_CAUSES.filter((cause) => DUAL_WRITTEN_CONFLICT_CAUSES.has(cause) && !CONFLICT_CAUSES_READ_BY_CODE.has(cause));
    expect(dropped).toHaveLength(7);
    for (const cause of dropped) expect((stored.ok ? stored.value.data.rows[0] as FmpStatementRow : row).fieldConflicts?.[`field-${cause}`]?.cause).toBeUndefined();
    // The live bundle is not mutated.
    expect(row.fieldConflicts?.["field-debt-maturity-scope"]?.cause).toBe("debt-maturity-scope");
  });
});
