/**
 * P11 (D-219 to D-222) steps 2 to 5: eleven readers decide by the typed refusal
 * code, and a conflict without a code is read by its sentence exactly as before.
 *
 * - C14 `restoreRefusedOperatingPortion` (via `restoreLeaseFinancingProvenance`):
 *   `debt-lease-line-no-operating-total`.
 * - C11 `completeFiledDebtScope` (via `admitDebtFields`): the five incomplete-scope codes.
 * - C4 `splitRefusal` (via `admitDebtFields`, D-220): `debt-maturity-scope` on
 *   shortTermDebt and `debt-noncurrent-allocation` on longTermDebt.
 * - C12 `recoverNoteCarryingDebt` (via `admitDebtFields`, D-220): `debt-maturity-scope`
 *   on shortTermDebt (behind its `fiscalStandIn` gate) and the three
 *   missing-taxonomy-class codes on totalDebt/netDebt.
 * - C7, the gross-debt reconciliation (via `admitDebtFields`, D-221):
 *   `debt-combined-aggregate-exceeds-components` on totalDebt.
 * - C9, the minor-difference note (via `admitDebtFields`, D-221): `debt-total-minor-difference`
 *   on a usable, filed-family totalDebt.
 * - C5, the old vendor-sum guard (via `admitDebtFields`, D-221): legacy-only, an empty code set.
 * - C1 `priorSbcZero` and C2 `replaySbc` (via `admitStockCompensation`, D-222):
 *   `vendor-sec-value-conflict` on stockBasedCompensation.
 * - C3 `replayCash` (via `admitBalanceCash`, D-222): `vendor-sec-value-conflict` on a
 *   balance row's cashAndCashEquivalents.
 * - C13 `canRecheck` (via `guardVendorShareFields`, D-222): `vendor-share-value-conflict`
 *   on eps and epsDiluted.
 *
 * Every refusal below is written by the real writer (the debt admission, the
 * SEC statement builder, the cash comparison, the plausibility helper); only
 * the presentation sentence is the writer's constant copied, because its writer
 * needs a parsed filing. Each refusal is then placed on one row whose facts let
 * the reader restore or complete it, so the reader's own check decides. Each case
 * runs twice, with its codes and with every `cause` deleted (the wording path),
 * and both runs must match each other and the stated outcome.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { implausibleDebtReason } from "@/edgar/debtCompleteness";
import { admitBalanceCash, admitDebtFields, admitStockCompensation, enrichFinancialFields } from "@/edgar/financialEnrichment";
import { CONFLICT_CAUSES_READ_BY_CODE, conflictCauseMatches, type ConflictCodeReader } from "@/edgar/refusalCauseRead";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import type { CompanyFacts, FactPoint } from "@/edgar/xbrl";
import { guardVendorShareFields } from "@/pipeline/keyless";
import { captureRunInputSnapshot } from "@/pipeline/runInputSnapshot";
import { restoreLeaseFinancingProvenance } from "@/pipeline/stageB/leaseScope";
import type { ExtractedSection } from "@/pipeline/types";
import type { FmpBalanceSheetRow, FmpCashFlowRow, FmpIncomeStatementRow, FmpPayload, FmpStatementRow, StatementFieldConflict } from "@/providers/fmp";
import type { FetchResult } from "@/types/core";
import { DUAL_WRITTEN_CONFLICT_CAUSES, STATEMENT_CONFLICT_CAUSES, type StatementConflictCause } from "@/types/refusalCause";
import { completeCurrencyBundle } from "./helpers/currencyBundle";
import { companyFacts, M, OBSERVED, Q2 } from "./helpers/amzn51LeaseShape";
import frozen from "./fixtures/crwv-debt-facts.json";

type Conflict = StatementFieldConflict;
type Conflicted = { fieldConflicts?: Record<string, Conflict> };
const READERS: readonly ConflictCodeReader[] = ["leaseLineNoOperatingTotal", "recoverableDebtScope", "shortTermDebtMaturityScope",
  "longTermDebtNoncurrentAllocation", "noteRecoverableDebtTotal", "combinedAggregateExceedsComponents", "debtTotalMinorDifference", "legacyVendorSumRefusal",
  "vendorSecStockCompensation", "vendorSecCash", "vendorShareRecheck"];
/** The fields each reader is called on. The D-219 readers are checked on every field, as before. */
const READ_FIELDS: Record<ConflictCodeReader, readonly string[] | "any"> = { leaseLineNoOperatingTotal: "any", recoverableDebtScope: "any",
  shortTermDebtMaturityScope: ["shortTermDebt"], longTermDebtNoncurrentAllocation: ["longTermDebt"], noteRecoverableDebtTotal: ["totalDebt", "netDebt"],
  combinedAggregateExceedsComponents: ["totalDebt"], debtTotalMinorDifference: ["totalDebt"], legacyVendorSumRefusal: ["totalDebt"],
  vendorSecStockCompensation: ["stockBasedCompensation"], vendorSecCash: ["cashAndCashEquivalents"], vendorShareRecheck: ["eps", "epsDiluted"] };
/** D-221: a reader no current writer's code reaches; only a row without a code can pass it. */
const LEGACY_ONLY: readonly ConflictCodeReader[] = ["legacyVendorSumRefusal"];

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
function bothWays<R, T = FmpBalanceSheetRow>(read: (row: T) => R, row: T): R {
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

// ---- D-220: C4 (`splitRefusal`) and C12 (`recoverNoteCarryingDebt`), both in `admitDebtFields`. ----
/** `base` with `from`'s sentence and code (or no code): a writer's refusal placed on the reader's row, at that row's amounts. */
function placed(base: Conflict, from: Conflict): Conflict {
  const rest: Conflict = structuredClone(base);
  delete rest.cause;
  return { ...rest, reason: from.reason, ...(from.cause !== undefined ? { cause: from.cause } : {}) };
}
const literalOn = (reason: string, cause?: StatementConflictCause): Conflict => ({ usable: false, vendorValue: null, secValue: null, reason, ...(cause ? { cause } : {}) });
/** The SEC statement builder's currency withholding (`sameRowEvidence`), which carries no code. */
const MIXED_UNIT = "mixed_unit: LongTermDebtCurrent uses EUR, conflicting with row reporting currency USD; field/component withheld without a currency conversion";
/** The SEC statement builder's double-count withholding on longTermDebt, which carries no code. */
const FINANCING_UNRESOLVED = "financing debt unresolved: DebtLongtermAndShorttermCombinedAmount is all debt, current included, and a current-debt figure also resolved";
const conflictOn = (row: Conflicted, field: string): Conflict => row.fieldConflicts![field]!;
const crwvAt = (rows: Conflicted[]): Conflicted => rows.find((row) => (row as { date?: string }).date === AT)!;

// C4: a vendor row whose inclusive LongTermDebt total stands while the maturity-bucket split is refused.
const SPLIT_FACTS = { LongTermDebt: 104, [MATURITY_TAG]: 4 };
const splitVendor = vendor({ longTermDebt: 104 * M, shortTermDebt: 4 * M, capitalLeaseObligations: 0, totalDebt: 104 * M, netDebt: 94 * M,
  fieldProvenance: { shortTermDebt: edgar(MATURITY_TAG), longTermDebt: edgar("LongTermDebt") } });
/** The split refusals the debt admission writes when the remainder-of-year bucket is tagged. */
const splitRefused = admitDebtFields(splitVendor, companyFacts({ [Q2]: { ...SPLIT_FACTS, [REMAINDER_TAG]: 2 } }), "USD", OBSERVED).row;
const crwvSplit = crwvAt(crwvBalanceRows({ LongTermDebt: 30e9 }));
const crwvInclusive = crwvAt(crwvBalanceRows({ DebtCurrent: 1e9, LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities: 30e9 },
  [MATURITY_TAG, REMAINDER_TAG, "DebtInstrumentCarryingAmount"]));

type Case = { conflict: Conflict; reads: boolean };
const SHORT_SPLIT = {
  "the debt admission's maturity bucket": { conflict: conflictOn(splitRefused, "shortTermDebt"), reads: true },
  "the SEC statement builder's maturity bucket": { conflict: conflictOn(crwvAt(crwvBalanceRows()), "shortTermDebt"), reads: true },
  "a currency withholding": { conflict: literalOn(MIXED_UNIT), reads: false },
  "the allocation refusal, on the wrong field": { conflict: conflictOn(splitRefused, "longTermDebt"), reads: false },
} satisfies Record<string, Case>;
const LONG_SPLIT = {
  "the debt admission's allocation": { conflict: conflictOn(splitRefused, "longTermDebt"), reads: true },
  "the SEC statement builder's LongTermDebt allocation": { conflict: conflictOn(crwvSplit, "longTermDebt"), reads: true },
  "the SEC statement builder's inclusive debt-and-lease allocation": { conflict: conflictOn(crwvInclusive, "longTermDebt"), reads: true },
  "a debt presentation conflict": { conflict: literalOn(PRESENTATION), reads: false },
  "implausible interest on resolved debt": { conflict: literalOn(implausibleDebtReason({ annualInterestExpense: 50 * M, financingDebt: 100 * M, priorFinancingDebts: [], totalAssets: null })!), reads: false },
  "a double-counted financing total": { conflict: literalOn(FINANCING_UNRESOLVED), reads: false },
  "the maturity bucket, on the wrong field": { conflict: conflictOn(splitRefused, "shortTermDebt"), reads: false },
} satisfies Record<string, Case>;
const splitRow = (short: Conflict, long: Conflict): FmpBalanceSheetRow => ({ ...structuredClone(splitRefused), fieldConflicts: {
  shortTermDebt: placed(conflictOn(splitRefused, "shortTermDebt"), short), longTermDebt: placed(conflictOn(splitRefused, "longTermDebt"), long) } });
/** With the remainder tagged the bucket's scope is refused again on this pass; without it only the row's own refusals decide. */
const SPLIT_PASSES = [["with the remainder tagged", { ...SPLIT_FACTS, [REMAINDER_TAG]: 2 }], ["without the remainder", SPLIT_FACTS]] as const;
const C4 = (tags: Record<string, number>) => (row: FmpBalanceSheetRow) => admitDebtFields(row, companyFacts({ [Q2]: tags }), "USD", OBSERVED);
function expectSplitOnly(out: ReturnType<ReturnType<typeof C4>>, kept: boolean): void {
  if (kept) {
    expect(out.row.totalDebt).toBe(104 * M);
    expect(out.row.fieldConflicts?.totalDebt).toBeUndefined();
  } else {
    expect(out.row.totalDebt).toBeNull();
    expect(out.row.fieldConflicts?.totalDebt?.usable).toBe(false);
  }
}
/** A later pass over the split row whose allocation was refused for another cause: the total names the refused component. */
const componentRefused = (tags: Record<string, number>): Conflicted =>
  C4(tags)({ ...structuredClone(splitRefused), fieldConflicts: { ...splitRefused.fieldConflicts, longTermDebt: literalOn(PRESENTATION) } }).row;
/** With the remainder tagged the bucket is excluded, so the total names the longTermDebt refusal (no code). */
const longUnavailable = componentRefused(SPLIT_PASSES[0][1]);
/** Without it the bucket is not exempt, so the total names the shortTermDebt refusal (debt-component-maturity-scope). */
const shortUnavailable = componentRefused(SPLIT_PASSES[1][1]);

// C12: CRWV's saved 10-Q, whose Note 10 reconciles carrying debt (tests/edgar.debtNoteCarrying.test.ts).
const NOTE_OBSERVED = "2026-10-18T03:45:24.555Z";
const NOTE_SECTION: ExtractedSection = { form: "10-Q", accession: "0001769628-26-000366", filingDate: "2026-08-12", reportDate: AT,
  documentUrl: "https://www.sec.gov/Archives/edgar/data/1769628/000176962826000366/crwv-20260630.htm",
  sectionName: "tenQNotes", method: "header-regex", chars: 1, text: readFileSync("fixtures/edgar/crwv-debt-note-20260630.txt", "utf8") };
const noteFacts = structuredClone(frozen.facts) as CompanyFacts;
const noteRow = buildStatementsFromCompanyFacts(noteFacts, { symbol: "CRWV", cik: "0001769628", asOf: NOTE_OBSERVED.slice(0, 10), factsObservedAt: NOTE_OBSERVED,
  annualPeriods: 2, quarterlyPeriods: 4, vendorSplits: { status: "retrieved", source: "test:vendor", events: [], coverage: [{ from: "2020-01-01", to: NOTE_OBSERVED.slice(0, 10) }] } })
  .balanceQuarterly.rows.find((row) => row.date === AT)! as FmpBalanceSheetRow;
const C12 = (row: FmpBalanceSheetRow) => admitDebtFields(row, noteFacts, "USD", NOTE_OBSERVED, [NOTE_SECTION]);
const NOTE_TAG = "filing:debt-note:carrying-reconciliation";
function expectNoteRecovered(out: ReturnType<typeof C12>, recovered: boolean): void {
  if (recovered) {
    expect(out.row).toMatchObject({ shortTermDebt: 7513e6, longTermDebt: 27555e6, totalDebt: 51608e6 });
    expect(out.row.fieldConflicts?.totalDebt).toBeUndefined();
    expect(out.row.fieldProvenance?.totalDebt?.tags).toContain(NOTE_TAG);
  } else {
    expect(out.row.fieldProvenance?.totalDebt?.tags ?? []).not.toContain(NOTE_TAG);
    expect(out.gaps.filter((gap) => gap.reason.startsWith("same-filing debt note reconciles"))).toEqual([]);
  }
}
/** The CRWV row with the named refusals replaced; `standIn: false` takes the maturity bucket out of the short-term evidence. */
function noteRowWith(over: Partial<Record<"shortTermDebt" | "totalDebt" | "netDebt", Conflict>>, standIn = true): FmpBalanceSheetRow {
  const row = structuredClone(noteRow);
  for (const [field, from] of Object.entries(over)) row.fieldConflicts![field] = placed(conflictOn(noteRow, field), from);
  if (!standIn) row.fieldProvenance = { ...row.fieldProvenance, shortTermDebt: { ...row.fieldProvenance!.shortTermDebt!, tags: ["us-gaap/LongTermDebtCurrent"] } };
  return row;
}
const cashOnNetDebt = admitBalanceCash(vendor(), recoveryFacts({ CashAndCashEquivalentsAtCarryingValue: 9 }), "quarter", OBSERVED).row;

const SHORT_NOTE = {
  "the SEC statement builder's maturity bucket": { conflict: conflictOn(noteRow, "shortTermDebt"), reads: true },
  "the debt admission's maturity bucket": { conflict: conflictOn(splitRefused, "shortTermDebt"), reads: true },
  "a currency withholding": { conflict: literalOn(MIXED_UNIT), reads: false },
  "the allocation refusal, on the wrong field": { conflict: conflictOn(splitRefused, "longTermDebt"), reads: false },
} satisfies Record<string, Case>;
const TOTAL_NOTE_READ = ["fiscal maturity bucket", "maturity-scoped short-term component", "components do not establish the total", "uncoded refused component"];
const TOTAL_NOTE: Record<string, Case & { only?: "netDebt" }> = {
  "the SEC statement builder's maturity-scoped total": { conflict: conflictOn(noteRow, "totalDebt"), reads: true },
  "the debt admission's maturity-scoped total": { conflict: REFUSALS["fiscal maturity bucket"].totalDebt, reads: true },
  "a total whose maturity-scoped short-term component is refused": { conflict: REFUSALS["maturity-scoped short-term component"].totalDebt, reads: true },
  "the same, written by a later split check": { conflict: conflictOn(shortUnavailable, "totalDebt"), reads: true },
  "a total whose longTermDebt component is refused": { conflict: conflictOn(longUnavailable, "totalDebt"), reads: false },
  "the debt admission's components that do not establish the total": { conflict: REFUSALS["components do not establish the total"].totalDebt, reads: true },
  "the SEC statement builder's components that do not establish the total": {
    conflict: conflictOn(crwvAt(crwvBalanceRows({ LongTermDebtNoncurrent: 10e9 }, [MATURITY_TAG, REMAINDER_TAG])), "totalDebt"), reads: true },
  "a vendor/SEC cash conflict": { conflict: conflictOn(cashOnNetDebt, "netDebt"), reads: false, only: "netDebt" },
  ...Object.fromEntries(ALL.filter((name) => !TOTAL_NOTE_READ.includes(name)).map((name) => [name, { conflict: REFUSALS[name].totalDebt, reads: false }])),
};

describe("C4: the split check reads debt-maturity-scope on shortTermDebt and debt-noncurrent-allocation on longTermDebt", () => {
  it("the split refusals carry the codes they are tested on", () => {
    expect(Object.fromEntries(Object.entries(SHORT_SPLIT).map(([name, { conflict }]) => [name, conflict.cause ?? null]))).toEqual({
      "the debt admission's maturity bucket": "debt-maturity-scope", "the SEC statement builder's maturity bucket": "debt-maturity-scope",
      "a currency withholding": null, "the allocation refusal, on the wrong field": "debt-noncurrent-allocation" });
    expect(Object.fromEntries(Object.entries(LONG_SPLIT).map(([name, { conflict }]) => [name, conflict.cause ?? null]))).toEqual({
      "the debt admission's allocation": "debt-noncurrent-allocation", "the SEC statement builder's LongTermDebt allocation": "debt-noncurrent-allocation",
      "the SEC statement builder's inclusive debt-and-lease allocation": "debt-noncurrent-allocation", "a debt presentation conflict": null,
      "implausible interest on resolved debt": null, "a double-counted financing total": null, "the maturity bucket, on the wrong field": "debt-maturity-scope" });
  });

  describe.each(SPLIT_PASSES)("%s", (_pass, tags) => {
    it.each(Object.keys(SHORT_SPLIT) as (keyof typeof SHORT_SPLIT)[])("shortTermDebt carrying %s, with its code and without", (name) => {
      const { conflict, reads } = SHORT_SPLIT[name];
      expectSplitOnly(bothWays(C4(tags), splitRow(conflict, LONG_SPLIT["the debt admission's allocation"].conflict)), reads);
    });

    it.each(Object.keys(LONG_SPLIT) as (keyof typeof LONG_SPLIT)[])("longTermDebt carrying %s, with its code and without", (name) => {
      const { conflict, reads } = LONG_SPLIT[name];
      expectSplitOnly(bothWays(C4(tags), splitRow(SHORT_SPLIT["the debt admission's maturity bucket"].conflict, conflict)), reads);
    });
  });
});

describe("C12: the debt-note recovery reads the maturity scope on shortTermDebt and three codes on totalDebt/netDebt", () => {
  it("the CRWV row as built is recovered, with its codes and without", () => {
    expect([conflictOn(noteRow, "shortTermDebt").cause, conflictOn(noteRow, "totalDebt").cause, conflictOn(noteRow, "netDebt").cause])
      .toEqual(["debt-maturity-scope", "debt-maturity-scope", "debt-maturity-scope"]);
    expectNoteRecovered(bothWays(C12, noteRow), true);
  });

  it("the total/net refusals carry the codes they are tested on", () => {
    expect(Object.fromEntries(Object.entries(TOTAL_NOTE).filter(([, { reads }]) => reads).map(([name, { conflict }]) => [name, conflict.cause]))).toEqual({
      "the SEC statement builder's maturity-scoped total": "debt-maturity-scope", "the debt admission's maturity-scoped total": "debt-maturity-scope",
      "a total whose maturity-scoped short-term component is refused": "debt-component-maturity-scope",
      "the same, written by a later split check": "debt-component-maturity-scope",
      "the debt admission's components that do not establish the total": "debt-components-incomplete",
      "the SEC statement builder's components that do not establish the total": "debt-components-incomplete" });
    expect(conflictOn(shortUnavailable, "totalDebt").reason).toMatch(/^incomplete debt carrying value: shortTermDebt is unavailable \(debt maturity scope unresolved: /);
    expect(conflictOn(longUnavailable, "totalDebt").reason).toMatch(/^incomplete debt carrying value: longTermDebt is unavailable \(debt presentation conflict: /);
    expect(conflictOn(longUnavailable, "totalDebt").cause).toBeUndefined();
  });

  describe.each([true, false])("shortTermDebt, fiscalStandIn %s", (standIn) => {
    it.each(Object.keys(SHORT_NOTE) as (keyof typeof SHORT_NOTE)[])("carrying %s, with its code and without", (name) => {
      const { conflict, reads } = SHORT_NOTE[name];
      expectNoteRecovered(bothWays(C12, noteRowWith({ shortTermDebt: conflict }, standIn)), standIn && reads);
    });
  });

  describe.each([[["totalDebt"]], [["netDebt"]], [["totalDebt", "netDebt"]]] as const)("on %j", (fields) => {
    it.each(Object.keys(TOTAL_NOTE).filter((name) => TOTAL_NOTE[name]!.only === undefined || fields.every((field) => field === TOTAL_NOTE[name]!.only)))(
      "%s, with its code and without", (name) => {
        const { conflict, reads } = TOTAL_NOTE[name]!;
        expectNoteRecovered(bothWays(C12, noteRowWith(Object.fromEntries(fields.map((field) => [field, conflict])))), reads);
      });
  });

  it("a total whose short-term component was refused without a code (an older row) is read by its sentence", () => {
    const legacy = REFUSALS["uncoded refused component"].totalDebt;
    expect(legacy.cause).toBeUndefined();
    expectNoteRecovered(bothWays(C12, noteRowWith({ totalDebt: legacy, netDebt: legacy })), true);
  });
});

describe("D-220: the code is what is read", () => {
  const ALTERED = "a sentence neither reader's wording matches";
  const UNRELATED = ["debt-lease-line-refused", "vendor-sec-value-conflict", "revenue-scope", "a-code-no-list-has"];
  const as = (cause: string, reason: string) => literalOn(reason, cause as StatementConflictCause);
  const SHORT_SENTENCE = conflictOn(splitRefused, "shortTermDebt").reason, LONG_SENTENCE = conflictOn(splitRefused, "longTermDebt").reason;
  const TOTAL_SENTENCE = conflictOn(noteRow, "totalDebt").reason;

  describe.each(SPLIT_PASSES)("C4, %s", (_pass, tags) => {
    it("keeps the inclusive total for the split codes whatever their sentences", () => {
      expectSplitOnly(C4(tags)(splitRow(as("debt-maturity-scope", ALTERED), as("debt-noncurrent-allocation", ALTERED))), true);
    });
    it.each([...UNRELATED, "debt-noncurrent-allocation", "debt-component-maturity-scope", "debt-components-incomplete"])(
      "withholds it when the bucket sentence carries %s", (cause) => {
        expectSplitOnly(C4(tags)(splitRow(as(cause, SHORT_SENTENCE), LONG_SPLIT["the debt admission's allocation"].conflict)), false);
      });
    it.each([...UNRELATED, "debt-maturity-scope", "debt-components-incomplete"])("withholds it when the allocation sentence carries %s", (cause) => {
      expectSplitOnly(C4(tags)(splitRow(SHORT_SPLIT["the debt admission's maturity bucket"].conflict, as(cause, LONG_SENTENCE))), false);
    });
    it("reads a row with no codes by its sentences", () => {
      expectSplitOnly(C4(tags)(splitRow(literalOn(SHORT_SENTENCE), literalOn(LONG_SENTENCE))), true);
      expectSplitOnly(C4(tags)(splitRow(literalOn(ALTERED), literalOn(LONG_SENTENCE))), false);
      expectSplitOnly(C4(tags)(splitRow(literalOn(SHORT_SENTENCE), literalOn(ALTERED))), false);
    });
  });

  it("C12 recovers for its codes whatever their sentences, and keeps the fiscal stand-in gate", () => {
    for (const cause of ["debt-maturity-scope", "debt-component-maturity-scope", "debt-components-incomplete"]) {
      expectNoteRecovered(C12(noteRowWith({ shortTermDebt: as("debt-maturity-scope", ALTERED), totalDebt: as(cause, ALTERED), netDebt: as(cause, ALTERED) })), true);
    }
    expectNoteRecovered(C12(noteRowWith({ shortTermDebt: as("debt-maturity-scope", ALTERED) }, false)), false);
  });

  it.each([...UNRELATED, "debt-noncurrent-allocation", "debt-component-maturity-scope", "debt-components-incomplete"])(
    "C12 leaves the bucket sentence refused under %s", (cause) => {
      expectNoteRecovered(C12(noteRowWith({ shortTermDebt: as(cause, conflictOn(noteRow, "shortTermDebt").reason) })), false);
    });

  it.each([...UNRELATED, "debt-noncurrent-allocation", "debt-aggregate-exceeds-components"])(
    "C12 leaves the maturity-scoped total sentence refused under %s, on either field", (cause) => {
      expectNoteRecovered(C12(noteRowWith({ totalDebt: as(cause, TOTAL_SENTENCE) })), false);
      expectNoteRecovered(C12(noteRowWith({ netDebt: as(cause, TOTAL_SENTENCE) })), false);
    });

  it("C12 reads a row with no codes by its sentences", () => {
    expectNoteRecovered(C12(uncoded(noteRow)), true);
    expectNoteRecovered(C12(uncoded(noteRowWith({ shortTermDebt: literalOn(ALTERED) }))), false);
    expectNoteRecovered(C12(uncoded(noteRowWith({ totalDebt: literalOn(ALTERED) }))), false);
    expectNoteRecovered(C12(uncoded(noteRowWith({ netDebt: conflictOn(longUnavailable, "totalDebt") }))), false);
  });
});

// ---- D-221: C7 (the gross-debt reconciliation), C9 (the minor-difference note), C5 (the old vendor sum), all in `admitDebtFields`. ----
const ADJUSTMENT_TAG = "DebtInstrumentUnamortizedDiscountPremiumAndDebtIssuanceCostsNet";
/** Carrying LongTermDebt 104 and a combined gross amount 106 in one filing; the components are 4 + 100. */
const GROSS_FACTS = { LongTermDebt: 104, DebtLongtermAndShorttermCombinedAmount: 106 };
const grossVendor = vendor({ shortTermDebt: 4 * M, longTermDebt: 100 * M, capitalLeaseObligations: 0, totalDebt: 104 * M, netDebt: 94 * M });
/** The tagged-total check's refusal, written while the filing carries no bridge from gross to carrying debt. */
const combinedRefused = admitDebtFields(grossVendor, companyFacts({ [Q2]: GROSS_FACTS }), "USD", OBSERVED).row;
/** The same filing with the signed discount and issuance costs that bridge gross 106 to carrying 104. */
const C7 = (row: FmpBalanceSheetRow) => admitDebtFields(row, companyFacts({ [Q2]: { ...GROSS_FACTS, [ADJUSTMENT_TAG]: -2 } }), "USD", OBSERVED);
/** The combined-total row with `from`'s sentence and code (or no code) on total and net debt. */
const grossRow = (from: Conflict): FmpBalanceSheetRow => ({ ...structuredClone(combinedRefused), fieldConflicts: { ...structuredClone(combinedRefused.fieldConflicts),
  totalDebt: placed(conflictOn(combinedRefused, "totalDebt"), from), netDebt: placed(conflictOn(combinedRefused, "netDebt"), from) } });
function expectGrossRecovered(out: ReturnType<typeof C7>, recovered: boolean): void {
  expect(out.gaps.some((gap) => gap.reason.includes("the gross amount is not an omitted borrowing"))).toBe(true);
  if (recovered) {
    expect(out.row).toMatchObject({ totalDebt: 104 * M, netDebt: 94 * M });
    expect(out.row.fieldConflicts?.totalDebt).toBeUndefined();
    expect(out.row.fieldConflicts?.netDebt).toBeUndefined();
  } else {
    expect(out.row.totalDebt).toBeNull();
    expect(out.row.fieldConflicts?.totalDebt?.usable).toBe(false);
  }
}
const crwvCombined = crwvAt(crwvBalanceRows({ LongTermDebtCurrent: 1e9, LongTermDebtNoncurrent: 10e9, DebtLongtermAndShorttermCombinedAmount: 30e9 },
  [MATURITY_TAG, REMAINDER_TAG, "DebtInstrumentCarryingAmount"]));
const crwvTaggedTotal = crwvAt(crwvBalanceRows({ LongTermDebtCurrent: 1e9, LongTermDebtNoncurrent: 10e9, LongTermDebtAndCapitalLeaseObligations: 30e9 },
  [MATURITY_TAG, REMAINDER_TAG, "DebtInstrumentCarryingAmount"]));
const C7_READ = ["combined total above the components"];
const COMBINED_CASES: Record<string, Case> = {
  "the debt admission's combined-total refusal on this row": { conflict: conflictOn(combinedRefused, "totalDebt"), reads: true },
  "the SEC statement builder's combined-total refusal": { conflict: conflictOn(crwvCombined, "totalDebt"), reads: true },
  "the SEC statement builder's tagged-total refusal (another aggregate tag)": { conflict: conflictOn(crwvTaggedTotal, "totalDebt"), reads: false },
  "a vendor/SEC cash conflict": { conflict: conflictOn(cashOnNetDebt, "netDebt"), reads: false },
  ...Object.fromEntries(ALL.map((name) => [name, { conflict: REFUSALS[name].totalDebt, reads: C7_READ.includes(name) }])),
};

/** D-202 minor differences: the filed-total completion (`completeFiledDebtScope`) and the noncurrent-only lease completion (`completeFromFiling`). */
const MINOR_TAGS = { LongTermDebtNoncurrent: 100, LongTermDebtCurrent: 4, OperatingLeaseLiabilityCurrent: 2, OperatingLeaseLiabilityNoncurrent: 18,
  FinanceLeaseLiabilityCurrent: 1, FinanceLeaseLiabilityNoncurrent: 5 };
const C9 = (row: FmpBalanceSheetRow) => admitDebtFields(row, companyFacts({ [Q2]: MINOR_TAGS }), "USD", OBSERVED);
const minorVendor = (lease: number, total: number) => vendor({ shortTermDebt: 4 * M, capitalLeaseObligations: lease * M, totalDebt: total * M, netDebt: (total - 10) * M });
const COMPLETIONS = {
  "the filed-total completion, minor difference": minorVendor(0, 103.48),
  "the noncurrent-only lease completion, minor difference": minorVendor(23, 126.365),
  "the filed-total completion, no minor difference": minorVendor(0, 104),
  "the noncurrent-only lease completion, no minor difference": minorVendor(23, 127),
} satisfies Record<string, FmpBalanceSheetRow>;
type CompletionName = keyof typeof COMPLETIONS;
const MINOR: readonly CompletionName[] = ["the filed-total completion, minor difference", "the noncurrent-only lease completion, minor difference"];
/** Each completion's own pass: the writer composes the row, then the note reads what it wrote. */
const completed = Object.fromEntries(Object.entries(COMPLETIONS).map(([name, row]) => [name, C9(row)])) as Record<CompletionName, ReturnType<typeof C9>>;
const minorKinds = (out: ReturnType<typeof C9>) => out.admissions.filter((admission) => admission.kind === "minor-debt-total");
function expectMinorNote(out: ReturnType<typeof C9>, detail: string | null): void {
  expect(out.row.totalDebt).toBe(130 * M);
  expect(minorKinds(out).map((admission) => admission.detail)).toEqual(detail === null ? [] : [detail]);
}
/** A completed row with its totalDebt qualification replaced; the next pass leaves the completed row as it is. */
const minorRow = (over: Partial<Conflict>): FmpBalanceSheetRow => {
  const row = structuredClone(completed["the filed-total completion, minor difference"].row);
  const kept = { ...row.fieldConflicts!.totalDebt! };
  delete kept.cause;
  return { ...row, fieldConflicts: { ...row.fieldConflicts, totalDebt: { ...kept, ...over } } };
};

/** C5: the noncurrent-only lease shape the old vendor-sum guard refused; the completion it revisits proves the total 130. */
const vendorSumRow = (refusal: Conflict): FmpBalanceSheetRow => ({ ...minorVendor(23, 127), totalDebt: null, netDebt: null,
  fieldConflicts: { totalDebt: { ...refusal, vendorValue: 127 * M }, netDebt: { ...refusal, vendorValue: 117 * M } } }) as unknown as FmpBalanceSheetRow;
const C5 = C9;
function expectRevisited(out: ReturnType<typeof C5>, revisited: boolean): void {
  if (revisited) {
    expect(out.row).toMatchObject({ totalDebt: 130 * M, netDebt: 120 * M });
    expect(out.row.fieldConflicts?.totalDebt).toBeUndefined();
    expect(out.row.fieldConflicts?.netDebt).toBeUndefined();
  }
  expect(out.admissions.some((admission) => admission.kind === "completion")).toBe(revisited);
}

describe("C7: the gross-debt reconciliation reads debt-combined-aggregate-exceeds-components on totalDebt", () => {
  it("the refusals carry the codes they are tested on", () => {
    expect(conflictOn(combinedRefused, "totalDebt")).toMatchObject({ usable: false, cause: "debt-combined-aggregate-exceeds-components" });
    expect(conflictOn(combinedRefused, "totalDebt").reason).toMatch(/^incomplete debt carrying value: same-period DebtLongtermAndShorttermCombinedAmount 106000000 exceeds /);
    expect(conflictOn(combinedRefused, "netDebt")).toMatchObject({ usable: false, cause: "debt-combined-aggregate-exceeds-components", reason: conflictOn(combinedRefused, "totalDebt").reason });
    expect(conflictOn(crwvCombined, "totalDebt").cause).toBe("debt-combined-aggregate-exceeds-components");
    expect(conflictOn(crwvTaggedTotal, "totalDebt")).toMatchObject({ cause: "debt-aggregate-exceeds-components" });
    expect(conflictOn(crwvTaggedTotal, "totalDebt").reason).toMatch(/^incomplete debt carrying value: same-period LongTermDebtAndCapitalLeaseObligations /);
  });

  it("the row its own pass refused is recovered on the next pass, once the filing bridges gross to carrying debt, with its code and without", () => {
    expectGrossRecovered(bothWays(C7, combinedRefused), true);
  });

  it.each(Object.keys(COMBINED_CASES))("%s, with its code and without", (name) => {
    const { conflict, reads } = COMBINED_CASES[name]!;
    expectGrossRecovered(bothWays(C7, grossRow(conflict)), reads);
  });
});

describe("C9: the minor-difference note reads debt-total-minor-difference on a usable, filed-family totalDebt", () => {
  it("each completion writes the qualification (and its code) only when the vendor total differs", () => {
    expect(Object.fromEntries(Object.entries(completed).map(([name, out]) => [name, out.row.fieldConflicts?.totalDebt ?? null]))).toEqual({
      "the filed-total completion, minor difference": expect.objectContaining({ usable: true, resolution: "filed-family", cause: "debt-total-minor-difference",
        reason: expect.stringMatching(/^vendor total 103\.48M versus component sum 104M .*; minor difference retained as a qualification/) }),
      "the noncurrent-only lease completion, minor difference": expect.objectContaining({ usable: true, resolution: "filed-family", cause: "debt-total-minor-difference",
        reason: expect.stringMatching(/^vendor total 126\.365M versus component sum 127M .*; minor difference retained as a qualification/) }),
      "the filed-total completion, no minor difference": null,
      "the noncurrent-only lease completion, no minor difference": null,
    });
    for (const [name, out] of Object.entries(completed)) {
      expectMinorNote(out, MINOR.includes(name as CompletionName) ? out.row.fieldConflicts!.totalDebt!.reason : null);
    }
  });

  it.each(Object.keys(COMPLETIONS) as CompletionName[])("a later pass over %s, with its code and without", (name) => {
    const row = completed[name].row;
    expectMinorNote(bothWays(C9, row), MINOR.includes(name) ? row.fieldConflicts!.totalDebt!.reason : null);
  });

  it.each(ALL)("a completed row whose total carries %s instead, with its code and without", (name) => {
    const row = minorRow({});
    const input = { ...row, totalDebt: null, fieldConflicts: { ...row.fieldConflicts, totalDebt: placed(conflictOn(row, "totalDebt"), REFUSALS[name].totalDebt) } } as unknown as FmpBalanceSheetRow;
    const out = bothWays(C9, input);
    expect(minorKinds(out)).toEqual([]);
  });

  it.each(["refused", "with no resolution", "minor-retained"] as const)(
    "the usable and resolution checks still decide, with its code and without: a qualification %s", (variant) => {
      const row = minorRow({ cause: "debt-total-minor-difference", ...(variant === "refused" ? { usable: false } : variant === "minor-retained" ? { resolution: "minor-retained" } : {}) });
      if (variant === "with no resolution") delete row.fieldConflicts!.totalDebt!.resolution;
      expect(minorKinds(bothWays(C9, row))).toEqual([]);
    });
});

describe("C5: the old vendor-sum guard is legacy-only: an uncoded row is revisited by its sentence, a coded one never", () => {
  it("revisits the pre-18ea3137 refusal on a row without codes", () => {
    expectRevisited(bothWays(C5, vendorSumRow(literalOn(OLD_VENDOR_SUM))), true);
  });

  it.each(ALL.filter((name) => name !== "pre-18ea3137 vendor-sum refusal"))("does not revisit %s, with its code and without", (name) => {
    expectRevisited(bothWays(C5, vendorSumRow(REFUSALS[name].totalDebt)), false);
  });
});

describe("D-221: the code is what is read", () => {
  const ALTERED = "a sentence neither reader's wording matches";
  const UNRELATED = ["debt-lease-line-refused", "vendor-sec-value-conflict", "revenue-scope", "a-code-no-list-has"];
  const as = (cause: string, reason: string) => literalOn(reason, cause as StatementConflictCause);
  const COMBINED_SENTENCE = conflictOn(combinedRefused, "totalDebt").reason;
  const MINOR_SENTENCE = conflictOn(completed["the filed-total completion, minor difference"].row, "totalDebt").reason;

  it("C7 recovers the combined-total code whatever its sentence", () => {
    expectGrossRecovered(C7(grossRow(as("debt-combined-aggregate-exceeds-components", ALTERED))), true);
  });
  it.each([...UNRELATED, "debt-aggregate-exceeds-components", "debt-total-minor-difference"])("C7 leaves the combined-total sentence refused under %s", (cause) => {
    expectGrossRecovered(C7(grossRow(as(cause, COMBINED_SENTENCE))), false);
  });
  it("C7 reads a row with no codes by its sentence", () => {
    expectGrossRecovered(C7(grossRow(literalOn(COMBINED_SENTENCE))), true);
    expectGrossRecovered(C7(grossRow(literalOn(ALTERED))), false);
    expectGrossRecovered(C7(grossRow(literalOn(conflictOn(crwvTaggedTotal, "totalDebt").reason))), false);
  });

  it("C9 notes the minor-difference code whatever its sentence", () => {
    expectMinorNote(C9(minorRow({ cause: "debt-total-minor-difference", reason: ALTERED })), ALTERED);
  });
  it.each([...UNRELATED, "debt-combined-aggregate-exceeds-components"])("C9 does not note the minor-difference sentence under %s", (cause) => {
    expectMinorNote(C9(minorRow({ cause: cause as StatementConflictCause, reason: MINOR_SENTENCE })), null);
  });
  it("C9 reads a row with no codes by its sentence", () => {
    expectMinorNote(C9(minorRow({ reason: MINOR_SENTENCE })), MINOR_SENTENCE);
    expectMinorNote(C9(minorRow({ reason: ALTERED })), null);
  });

  it.each([...UNRELATED, "debt-lease-line-no-operating-total", "debt-total-minor-difference"])("C5 never revisits the old vendor-sum sentence under %s", (cause) => {
    expectRevisited(C5(vendorSumRow(as(cause, OLD_VENDOR_SUM))), false);
  });
  it("C5 reads a row with no codes by its sentence", () => {
    expectRevisited(C5(vendorSumRow(literalOn(OLD_VENDOR_SUM))), true);
    expectRevisited(C5(vendorSumRow(literalOn(ALTERED))), false);
  });
});

// ---- D-222: C1 and C2 (stockBasedCompensation) and C3 (cashAndCashEquivalents) in the vendor/SEC
// comparison (`admitCashFields`), and C13 (`canRecheck`) in `guardVendorShareFields`. ----
const CASH_AT = "2026-11-06T21:00:34Z";
const usd = (val: number, start: string | undefined, end: string, filed: string, form = "10-Q"): FactPoint =>
  ({ ...(start ? { start } : {}), end, val: val * M, filed, accn: `0000000123-${filed.replaceAll("-", "")}`, form, fy: Number(end.slice(0, 4)), fp: form === "10-K" ? "FY" : "Q1" });
const usdFacts = (tags: Record<string, FactPoint[]>): CompanyFacts => ({ cik: 123, entityName: "Synthetic",
  facts: { "us-gaap": Object.fromEntries(Object.entries(tags).map(([tag, points]) => [tag, { units: { USD: points } }])) } });
/** A provenance the field still carries on the writer's pass, so the comparison takes no reconciliation branch and writes its own refusal. */
const HELD = { source: "edgar" as const, unit: "USD", periodStart: null, periodEnd: "2000-01-01", observedAt: CASH_AT, tags: [], filings: [] };
const fetched = <T extends FmpStatementRow>(rows: T[]): FetchResult<FmpPayload<T>> =>
  ({ ok: true, value: { source: "fmp", endpoint: "fixture", fetchedAt: CASH_AT, asOf: CASH_AT, data: { rows, raw: rows } } });
/** A reader's result must leave a row it does not read exactly as it was. */
function expectUnread<T>(out: { row: T; gaps: unknown[] }, input: T): void {
  expect(out.row).toEqual(input);
  expect(out.gaps).toEqual([]);
}

/** Stock compensation: a direct quarter (C1, vendor zero) and a quarter derived from the annual and nine-month filings (C2). */
const SBC_DIRECT = usdFacts({ ShareBasedCompensation: [usd(103, "2026-01-01", "2026-03-31", "2026-05-08")] });
const SBC_DERIVED = usdFacts({ ShareBasedCompensation: [usd(398, "2025-01-01", "2025-12-31", "2026-02-13", "10-K"), usd(293, "2025-01-01", "2025-09-30", "2025-11-07")] });
/** The comparison's own refusal, as a later pass reads it: the provenance that held the writer off is gone. */
function sbcRefused(row: FmpCashFlowRow, facts: CompanyFacts): FmpCashFlowRow {
  const out = structuredClone(admitStockCompensation<FmpCashFlowRow>({ ...row, fieldProvenance: { stockBasedCompensation: HELD } }, facts, "quarter", CASH_AT).row);
  delete out.fieldProvenance;
  return out;
}
const sbcZeroRefused = sbcRefused({ date: "2026-03-31", periodStart: "2026-01-01", filingDate: "2026-05-08", reportedCurrency: "USD", stockBasedCompensation: 0 }, SBC_DIRECT);
const sbcDerivedRefused = sbcRefused({ date: "2025-12-31", periodStart: "2025-10-01", filingDate: "2026-02-13", reportedCurrency: "USD", stockBasedCompensation: 50 * M }, SBC_DERIVED);
const C1 = (row: FmpCashFlowRow) => admitStockCompensation(row, SBC_DIRECT, "quarter", CASH_AT);
const C2 = (row: FmpCashFlowRow) => admitStockCompensation(row, SBC_DERIVED, "quarter", CASH_AT);
function expectSbcReconciled(out: ReturnType<typeof C1>, value: number, lead: RegExp): void {
  expect(out.row.stockBasedCompensation).toBe(value * M);
  expect(out.row.fieldConflicts?.stockBasedCompensation).toMatchObject({ usable: true, resolution: "filed-family", secValue: value * M, reason: expect.stringMatching(lead) });
  expect(out.gaps.map((gap) => gap.severity)).toEqual(["info"]);
}
const ZERO_RECONCILED = /^Vendor stock-based compensation zero placeholder reconciled at 2026-03-31: directly filed /;
const DERIVED_RECONCILED = /^Vendor stock-based compensation reconciled at 2025-12-31: compatible derived /;
/** `row` with its `field` conflict replaced by `from`'s sentence and code (or no code), at the row's amounts and evidence. */
const withConflict = <T extends FmpStatementRow>(row: T, field: string, from: Conflict): T =>
  ({ ...structuredClone(row), fieldConflicts: { ...structuredClone(row.fieldConflicts), [field]: placed(row.fieldConflicts![field]!, from) } });

/** Cash: the filing tags only unrestricted cash on the writer's pass; the later pass also sees its restricted-inclusive total. */
const CASH_POINT = usd(500, undefined, "2025-12-31", "2026-02-01", "10-K");
const CASH_ONLY = usdFacts({ CashAndCashEquivalentsAtCarryingValue: [CASH_POINT] });
const CASH_SCOPED = usdFacts({ CashAndCashEquivalentsAtCarryingValue: [CASH_POINT],
  CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents: [{ ...CASH_POINT, val: 520 * M }] });
const cashRefused = admitBalanceCash({ date: "2025-12-31", filingDate: "2026-02-01", reportedCurrency: "USD", cashAndCashEquivalents: 520 * M,
  cashAndShortTermInvestments: 600 * M, netDebt: -520 * M } as FmpBalanceSheetRow, CASH_ONLY, "annual", CASH_AT).row;
const C3 = (row: FmpBalanceSheetRow) => admitBalanceCash(row, CASH_SCOPED, "annual", CASH_AT);
function expectCashReconciled(out: ReturnType<typeof C3>): void {
  expect(out.row.cashAndCashEquivalents).toBe(500 * M);
  expect(out.row.fieldConflicts?.cashAndCashEquivalents).toMatchObject({ usable: true, resolution: "filed-family", vendorValue: 520 * M,
    reason: expect.stringMatching(/^vendor cash scope reconciled at 2025-12-31: vendor 520M USD equals the filed CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents/) });
  // The dependents keep the cash refusal they were given; the reader does not read them.
  for (const dependent of ["cashAndShortTermInvestments", "netDebt"]) expect(out.row.fieldConflicts?.[dependent]).toEqual(cashRefused.fieldConflicts![dependent]);
}

/** The acquisition pass (`enrichFinancialFields`) over both statements: refusals on stock compensation, investing and financing cash flow and cash. */
const ENRICH_FACTS = usdFacts({ ShareBasedCompensation: [usd(398, "2025-01-01", "2025-12-31", "2026-02-13", "10-K"), usd(103, "2026-01-01", "2026-03-31", "2026-05-08")],
  NetCashProvidedByUsedInInvestingActivities: [usd(-50, "2025-01-01", "2025-12-31", "2026-02-13", "10-K"), usd(-12, "2026-01-01", "2026-03-31", "2026-05-08")],
  NetCashProvidedByUsedInFinancingActivities: [usd(-20, "2025-01-01", "2025-12-31", "2026-02-13", "10-K")],
  CashAndCashEquivalentsAtCarryingValue: [usd(500, undefined, "2025-12-31", "2026-02-13", "10-K"), usd(400, undefined, "2024-12-31", "2025-02-13", "10-K")] });
function enriched(scope: "annual" | "quarter", cashflow: FmpCashFlowRow, balance: FmpBalanceSheetRow): { balance: FmpBalanceSheetRow; cashflow: FmpCashFlowRow } {
  const out = enrichFinancialFields(fetched([balance]), fetched([cashflow]), ENRICH_FACTS, scope, CASH_AT);
  if (!out.balance.ok || !out.cashflow.ok) throw Error("fixture");
  return { balance: out.balance.value.data.rows[0]!, cashflow: out.cashflow.value.data.rows[0]! };
}
const annualEnriched = enriched("annual", { date: "2025-12-31", periodStart: "2025-01-01", filingDate: "2026-02-13", reportedCurrency: "USD", stockBasedCompensation: 300 * M,
  netCashProvidedByInvestingActivities: -40 * M, netCashProvidedByFinancingActivities: -25 * M },
{ date: "2025-12-31", filingDate: "2026-02-13", reportedCurrency: "USD", cashAndCashEquivalents: 480 * M, cashAndShortTermInvestments: 600 * M, netDebt: -480 * M });
const quarterEnriched = enriched("quarter", { date: "2026-03-31", periodStart: "2026-01-01", filingDate: "2026-05-08", reportedCurrency: "USD", stockBasedCompensation: 0,
  netCashProvidedByInvestingActivities: -10 * M }, { date: "2026-03-31", filingDate: "2026-05-08", reportedCurrency: "USD", cashAndCashEquivalents: 480 * M });

/** Share counts: a loss quarter whose vendor EPS (basic and diluted) differs from the filer's exact-interval EPS. */
const SHARE_AS_OF = "2026-11-01";
const SHARE_TAGS = { eps: "EarningsPerShareBasic", epsDiluted: "EarningsPerShareDiluted", weightedAverageShsOut: "WeightedAverageNumberOfSharesOutstandingBasic",
  weightedAverageShsOutDil: "WeightedAverageNumberOfDilutedSharesOutstanding", revenue: "Revenues", netIncome: "NetIncomeLoss" } as const;
const SHARE_FILED: FmpIncomeStatementRow = { date: "2025-03-31", period: "Q1", fiscalYear: "2025", cik: "0001579878", symbol: "FIG", reportedCurrency: "USD", revenue: 228_199_000,
  netIncome: -200e6, eps: -2, epsDiluted: -2, weightedAverageShsOut: 100e6, weightedAverageShsOutDil: 100e6 };
const SHARE_FACTS: CompanyFacts = (() => {
  const concepts: Record<string, { units: Record<string, FactPoint[]> }> = {};
  for (const [field, tag] of Object.entries(SHARE_TAGS)) {
    const unit = field.startsWith("eps") ? "USD/shares" : field.startsWith("weighted") ? "shares" : "USD";
    ((concepts[tag] ??= { units: {} }).units[unit] ??= []).push({ start: "2025-01-01", end: "2025-03-31", val: SHARE_FILED[field] as number, filed: "2026-05-14",
      accn: "0001628280-26-250331", form: "10-Q", fy: 2025, fp: "Q1" });
  }
  concepts.Assets = { units: { USD: [{ end: "2025-03-31", val: 2e9, filed: "2026-05-14", accn: "0001628280-26-250331", form: "10-Q", fy: 2025, fp: "Q1" }] } };
  return { cik: 1579878, entityName: "Figma, Inc.", facts: { "us-gaap": concepts, dei: {} } };
})();
const SHARE_PRIMARY = buildStatementsFromCompanyFacts(SHARE_FACTS, { symbol: "FIG", cik: SHARE_FILED.cik!, asOf: SHARE_AS_OF, factsObservedAt: `${SHARE_AS_OF}T22:38:31.000Z`,
  annualPeriods: 10, quarterlyPeriods: 24, vendorSplits: { status: "retrieved", source: "fixture:split-history", events: [], coverage: [{ from: "2020-01-01", to: SHARE_AS_OF }] } });
const SHARE_GUARD = { companyFacts: SHARE_FACTS, registrantTickers: ["FIG"], isAdr: false, fiscalYearEnd: "1231", period: "quarter" as const };
/** The guard's first pass (the writer), with or without an unresolved split window. */
const guarded = (vendorRow: FmpIncomeStatementRow, splitWindow = false) => guardVendorShareFields([vendorRow], SHARE_PRIMARY.incomeQuarterly.rows,
  splitWindow ? { ...SHARE_PRIMARY.splits, unresolved: [{ from: "2025-01-01", to: "2026-01-01", reason: "fixture split window" }] } : SHARE_PRIMARY.splits, SHARE_AS_OF, SHARE_GUARD);
const lossRefused = guarded({ ...SHARE_FILED, eps: -1.8, epsDiluted: -1.8 }).rows[0]!;
const gainRefused = guarded({ ...SHARE_FILED, eps: 1.8, epsDiluted: 1.8 }).rows[0]!;
const unusableRefused = guarded({ ...SHARE_FILED, eps: Number.NaN }).rows[0]!;
const SPLIT_SENTENCE = guarded({ ...SHARE_FILED, eps: -1.8 }, true).withheld[0]!.reason;
/** The guard's "no filed" sentence. EPS never reaches it (a comparable filed EPS is always finite), so this is its template; it carries no code. */
const NO_FILED_SENTENCE = `no filed eps for 2025-03-31 on the ${SHARE_AS_OF} basis to test the vendor's -1.8 against independent same-period filed facts`;
/** C13: the filed-reconciliation pass, which rechecks a refused loss-quarter EPS from its conflict alone. */
const C13 = (row: FmpIncomeStatementRow) => {
  const out = guardVendorShareFields([row], [], SHARE_PRIMARY.splits, SHARE_AS_OF, { ...SHARE_GUARD, reconcileFiled: true });
  return { row: out.rows[0]!, gaps: [...out.withheld, ...out.reconciled] };
};
function expectRechecked(out: ReturnType<typeof C13>, fields: readonly ("eps" | "epsDiluted")[]): void {
  for (const field of fields) {
    expect(out.row[field]).toBe(-2);
    expect(out.row.fieldConflicts?.[field]).toMatchObject({ usable: true, resolution: "filed-line", vendorValue: -1.8, secValue: -2,
      reason: `${field} for 2025-03-31 corrected from vendor -1.8 to filed -2; exact 2025-01-01 through 2025-03-31 USD/shares; discrepancy exceeds rounding` });
  }
  expect(out.gaps.map((gap) => gap.field)).toEqual(fields);
}

describe("D-222: the writers' refusals the step-5 readers are tested on", () => {
  it("the comparison codes its refusal on the field (and the cash dependents) with the field's own sentence", () => {
    expect(conflictOn(sbcZeroRefused, "stockBasedCompensation")).toMatchObject({ usable: false, vendorValue: 0, secValue: 103 * M, cause: "vendor-sec-value-conflict",
      reason: "vendor/SEC stockBasedCompensation conflict: exact 2026-01-01 through 2026-03-31 USD; vendor 0M, filed 103M; field unavailable until reconciled" });
    expect(conflictOn(sbcDerivedRefused, "stockBasedCompensation")).toMatchObject({ usable: false, vendorValue: 50 * M, secValue: 105 * M, cause: "vendor-sec-value-conflict",
      reason: expect.stringMatching(/^vendor\/SEC stockBasedCompensation conflict: derived 105M USD for 2025-10-01 through 2025-12-31 /) });
    for (const field of ["cashAndCashEquivalents", "cashAndShortTermInvestments", "netDebt"]) {
      expect(conflictOn(cashRefused, field)).toMatchObject({ usable: false, cause: "vendor-sec-value-conflict",
        reason: "vendor/SEC cashAndCashEquivalents conflict: exact instant through 2025-12-31 USD; vendor 520M, filed 500M; field unavailable until reconciled" });
    }
    expect(conflictOn(annualEnriched.cashflow, "stockBasedCompensation")).toMatchObject({ cause: "vendor-sec-value-conflict",
      reason: expect.stringMatching(/^vendor\/SEC stockBasedCompensation conflict: exact 2025-01-01 through 2025-12-31 /) });
    expect(conflictOn(annualEnriched.cashflow, "netCashProvidedByInvestingActivities")).toMatchObject({ cause: "vendor-sec-value-conflict",
      reason: expect.stringMatching(/^vendor\/SEC netCashProvidedByInvestingActivities conflict: /) });
    expect(conflictOn(annualEnriched.cashflow, "netCashProvidedByFinancingActivities")).toMatchObject({ cause: "vendor-sec-value-conflict",
      reason: expect.stringMatching(/^vendor\/SEC netCashProvidedByFinancingActivities conflict: /) });
    expect(conflictOn(annualEnriched.balance, "cashAndCashEquivalents")).toMatchObject({ cause: "vendor-sec-value-conflict",
      reason: expect.stringMatching(/^vendor\/SEC cashAndCashEquivalents conflict: /) });
    // On the acquisition pass the quarter's zero placeholder is reconciled at once; investing is refused.
    expect(conflictOn(quarterEnriched.cashflow, "stockBasedCompensation")).toMatchObject({ usable: true, resolution: "filed-family" });
    expect(conflictOn(quarterEnriched.cashflow, "stockBasedCompensation").cause).toBeUndefined();
    expect(conflictOn(quarterEnriched.cashflow, "netCashProvidedByInvestingActivities")).toMatchObject({ usable: false, cause: "vendor-sec-value-conflict" });
  });

  it("the share guard codes only its no-split disagreement, which always ends with \"; field unavailable until reconciled\"", () => {
    for (const field of ["eps", "epsDiluted"]) {
      expect(conflictOn(lossRefused, field)).toMatchObject({ usable: false, vendorValue: -1.8, secValue: -2, cause: "vendor-share-value-conflict", reason:
        `the vendor's ${field} for 2025-03-31 (-1.8) differs from the filer's (-2) on the ${SHARE_AS_OF} basis; exact 2025-01-01 through 2025-03-31 USD/shares; field unavailable until reconciled` });
      expect(conflictOn(gainRefused, field)).toMatchObject({ usable: false, vendorValue: 1.8, cause: "vendor-share-value-conflict" });
    }
    expect(conflictOn(unusableRefused, "eps")).toMatchObject({ usable: false, vendorValue: null,
      reason: "the vendor's eps for 2025-03-31 (NaN) is not a usable figure to test against independent same-period filed facts" });
    expect(conflictOn(unusableRefused, "eps").cause).toBeUndefined();
    // Across a split window the guard writes no conflict at all, only its withheld sentence.
    expect(guarded({ ...SHARE_FILED, eps: -1.8 }, true).rows[0]!.fieldConflicts).toBeUndefined();
    expect(SPLIT_SENTENCE).toBe(`the vendor's eps for 2025-03-31 (-1.8) differs from the filer's (-2) on the ${SHARE_AS_OF} basis, across an unresolved split (fixture split window)`);
  });
});

/** Sentences other writers put on a field, placed on each reader's field; none passes it, with its code or without. */
const NEIGHBOURS: Record<string, Conflict> = {
  ...Object.fromEntries(Object.entries(REFUSALS).map(([name, refusal]) => [`the debt refusal "${name}"`, refusal.totalDebt])),
  "the share guard's coded EPS disagreement": conflictOn(lossRefused, "eps"),
  "the share guard's not-a-usable-figure sentence": conflictOn(unusableRefused, "eps"),
  "the share guard's split-check sentence": literalOn(SPLIT_SENTENCE),
  "the share guard's no-filed sentence": literalOn(NO_FILED_SENTENCE),
  "the SEC statement builder's unrestricted-cash withholding": literalOn("unrestricted cash unavailable: complete compatible current AND noncurrent restrictions are required to subtract from combined cash; no missing restriction is assumed zero"),
};
/** The comparison's coded refusals: the same code on each field, each with its own field's sentence. */
const COMPARISON_CODED: Record<string, Conflict> = {
  "the stock-compensation refusal": conflictOn(sbcZeroRefused, "stockBasedCompensation"),
  "the cash refusal": conflictOn(cashRefused, "cashAndCashEquivalents"),
  "the investing cash-flow refusal": conflictOn(annualEnriched.cashflow, "netCashProvidedByInvestingActivities"),
};

describe("C1, C2: the stock-compensation rechecks read vendor-sec-value-conflict on stockBasedCompensation", () => {
  it("C1 reconciles the comparison's vendor-zero refusal from the filed quarter, with its code and without", () => {
    expectSbcReconciled(bothWays(C1, sbcZeroRefused), 103, ZERO_RECONCILED);
  });

  it("C2 reconciles the comparison's refusal from the compatible derived quarter, with its code and without", () => {
    expectSbcReconciled(bothWays(C2, sbcDerivedRefused), 105, DERIVED_RECONCILED);
  });

  it.each(Object.keys(NEIGHBOURS))("C1 and C2 leave %s on stockBasedCompensation refused, with its code and without", (name) => {
    for (const [read, row] of [[C1, sbcZeroRefused], [C2, sbcDerivedRefused]] as const) {
      const input = withConflict(row, "stockBasedCompensation", NEIGHBOURS[name]!);
      expectUnread(bothWays(read, input), input);
    }
  });

  it("the other conditions still decide: an annual refusal and a reconciled quarter stay as they are, and other cash-flow fields are not read", () => {
    // The annual refusal is the comparison's own, so the recheck takes it up, finds no quarter to reconcile and restates it.
    const annual = annualEnriched.cashflow;
    const restated = bothWays((row: FmpCashFlowRow) => admitStockCompensation(row, ENRICH_FACTS, "annual", CASH_AT), annual);
    expect(restated.row).toEqual(annual);
    expect(restated.gaps.map((gap) => [gap.field, gap.reason, gap.severity])).toEqual([["statements.cashflow.2025-12-31.stockBasedCompensation",
      conflictOn(annual, "stockBasedCompensation").reason, "warn"]]);
    const quarter = quarterEnriched.cashflow;
    expectUnread(bothWays((row: FmpCashFlowRow) => admitStockCompensation(row, ENRICH_FACTS, "quarter", CASH_AT), quarter), quarter);
    // A vendor-zero refusal whose filed value no longer matches the filing is left refused.
    const moved = { ...sbcZeroRefused, fieldConflicts: { stockBasedCompensation: { ...conflictOn(sbcZeroRefused, "stockBasedCompensation"), secValue: 104 * M } } };
    expectUnread(bothWays(C1, moved), moved);
  });
});

describe("C3: the cash recheck reads vendor-sec-value-conflict on a balance row's cashAndCashEquivalents", () => {
  it("reconciles the comparison's cash refusal from the same filing's restricted-inclusive total, with its code and without", () => {
    expectCashReconciled(bothWays(C3, cashRefused));
  });

  it.each(Object.keys(NEIGHBOURS))("leaves %s on cashAndCashEquivalents refused, with its code and without", (name) => {
    const input = withConflict(cashRefused, "cashAndCashEquivalents", NEIGHBOURS[name]!);
    expectUnread(bothWays(C3, input), input);
  });

  it("does not read the cash refusal its dependents carry: with the cash field refused for another reason, nothing is rechecked", () => {
    const input = withConflict(cashRefused, "cashAndCashEquivalents", NEIGHBOURS["the SEC statement builder's unrestricted-cash withholding"]!);
    expect(conflictOn(input, "netDebt").cause).toBe("vendor-sec-value-conflict");
    expect(conflictOn(input, "cashAndShortTermInvestments").cause).toBe("vendor-sec-value-conflict");
    expectUnread(bothWays(C3, input), input);
  });

  it("the other conditions still decide: a cash refusal whose evidence names another tag is left refused", () => {
    const refusal = conflictOn(cashRefused, "cashAndCashEquivalents");
    const input = { ...cashRefused, fieldConflicts: { ...cashRefused.fieldConflicts, cashAndCashEquivalents: { ...refusal, secEvidence: { ...refusal.secEvidence!, tags: ["us-gaap/Cash"] } } } };
    expectUnread(bothWays(C3, input), input);
  });
});

describe("C13: the share-count recheck reads vendor-share-value-conflict on eps and epsDiluted", () => {
  it("rechecks the loss-quarter EPS refusal on both fields, with its code and without", () => {
    expectRechecked(bothWays(C13, lossRefused), ["eps", "epsDiluted"]);
  });

  it.each(Object.keys(NEIGHBOURS).filter((name) => name !== "the share guard's coded EPS disagreement"))(
    "leaves %s on eps and epsDiluted refused, with its code and without", (name) => {
      const input = withConflict(withConflict(lossRefused, "eps", NEIGHBOURS[name]!), "epsDiluted", NEIGHBOURS[name]!);
      expectUnread(bothWays(C13, input), input);
    });

  it.each(Object.keys(COMPARISON_CODED))("leaves %s placed on eps and epsDiluted refused, with its code and without", (name) => {
    const input = withConflict(withConflict(lossRefused, "eps", COMPARISON_CODED[name]!), "epsDiluted", COMPARISON_CODED[name]!);
    expectUnread(bothWays(C13, input), input);
  });

  it("the other conditions still decide: a positive-EPS refusal is never rechecked", () => {
    expectUnread(bothWays(C13, gainRefused), gainRefused);
  });
});

describe("D-222: the code is what is read", () => {
  const ALTERED = "a sentence none of these readers' wording matches";
  const as = (cause: string, reason: string) => literalOn(reason, cause as StatementConflictCause);
  const SBC_SENTENCE = conflictOn(sbcZeroRefused, "stockBasedCompensation").reason;
  const CASH_SENTENCE = conflictOn(cashRefused, "cashAndCashEquivalents").reason;
  const UNRELATED = ["debt-maturity-scope", "revenue-scope", "a-code-no-list-has"];
  const onBothEps = (row: FmpIncomeStatementRow, eps: Conflict, epsDiluted: Conflict) => withConflict(withConflict(row, "eps", eps), "epsDiluted", epsDiluted);

  it("C1, C2 and C3 recheck vendor-sec-value-conflict whatever its sentence", () => {
    expectSbcReconciled(C1(withConflict(sbcZeroRefused, "stockBasedCompensation", as("vendor-sec-value-conflict", ALTERED))), 103, ZERO_RECONCILED);
    expectSbcReconciled(C2(withConflict(sbcDerivedRefused, "stockBasedCompensation", as("vendor-sec-value-conflict", ALTERED))), 105, DERIVED_RECONCILED);
    expectCashReconciled(C3(withConflict(cashRefused, "cashAndCashEquivalents", as("vendor-sec-value-conflict", ALTERED))));
  });
  it.each([...UNRELATED, "vendor-share-value-conflict"])("C1, C2 and C3 leave their own sentences refused under %s", (cause) => {
    for (const [read, row] of [[C1, sbcZeroRefused], [C2, sbcDerivedRefused]] as const) {
      const input = withConflict(row, "stockBasedCompensation", as(cause, conflictOn(row, "stockBasedCompensation").reason));
      expectUnread(read(input), input);
    }
    const input = withConflict(cashRefused, "cashAndCashEquivalents", as(cause, CASH_SENTENCE));
    expectUnread(C3(input), input);
  });
  it("C1, C2 and C3 read a row with no codes by its sentence", () => {
    expectSbcReconciled(C1(withConflict(sbcZeroRefused, "stockBasedCompensation", literalOn(SBC_SENTENCE))), 103, ZERO_RECONCILED);
    for (const reason of [ALTERED, CASH_SENTENCE]) {
      const input = withConflict(sbcZeroRefused, "stockBasedCompensation", literalOn(reason));
      expectUnread(C1(input), input);
    }
    expectCashReconciled(C3(withConflict(cashRefused, "cashAndCashEquivalents", literalOn(CASH_SENTENCE))));
    for (const reason of [ALTERED, SBC_SENTENCE]) {
      const input = withConflict(cashRefused, "cashAndCashEquivalents", literalOn(reason));
      expectUnread(C3(input), input);
    }
  });

  it("C13 rechecks vendor-share-value-conflict whatever its sentence", () => {
    expectRechecked(C13(onBothEps(lossRefused, as("vendor-share-value-conflict", ALTERED), as("vendor-share-value-conflict", ALTERED))), ["eps", "epsDiluted"]);
  });
  it.each([...UNRELATED, "vendor-sec-value-conflict"])("C13 leaves its own sentence refused under %s", (cause) => {
    const input = onBothEps(lossRefused, as(cause, conflictOn(lossRefused, "eps").reason), as(cause, conflictOn(lossRefused, "epsDiluted").reason));
    expectUnread(C13(input), input);
  });
  it("C13 reads a row with no codes by its sentence", () => {
    expectRechecked(C13(uncoded(lossRefused)), ["eps", "epsDiluted"]);
    const input = onBothEps(lossRefused, literalOn(ALTERED), literalOn(NO_FILED_SENTENCE));
    expectUnread(C13(input), input);
  });
});

describe("refusalCauseRead", () => {
  const MATURITIES = [MATURITY_TAG, REMAINDER_TAG];
  const fieldsOf = (row: Conflicted): [string, Conflict][] => Object.entries(row.fieldConflicts ?? {});
  /** Every conflict the writers above produce, with the field it sits on. */
  const fielded: [string, Conflict][] = [
    ...Object.values(REFUSALS).flatMap((refusal): [string, Conflict][] => [["totalDebt", refusal.totalDebt], ["netDebt", refusal.netDebt]]),
    ...fieldsOf(admitBalanceCash(vendor(), recoveryFacts({ CashAndCashEquivalentsAtCarryingValue: 9 }), "quarter", OBSERVED).row),
    ...[
      crwvBalanceRows(),
      crwvBalanceRows({ LongTermDebt: 30e9 }),
      crwvBalanceRows({ LongTermDebtNoncurrent: 10e9 }, MATURITIES),
      crwvBalanceRows({ LongTermDebtCurrent: 1e9, LongTermDebtNoncurrent: 10e9, DebtLongtermAndShorttermCombinedAmount: 30e9 }, [...MATURITIES, "DebtInstrumentCarryingAmount"]),
      crwvBalanceRows({ LongTermDebtCurrent: 1e9, LongTermDebtNoncurrent: 10e9, LongTermDebtAndCapitalLeaseObligations: 30e9 }, [...MATURITIES, "DebtInstrumentCarryingAmount"]),
      // D-220: the split and debt-note shapes.
      crwvBalanceRows({ DebtCurrent: 1e9, LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities: 30e9 }, [...MATURITIES, "DebtInstrumentCarryingAmount"]),
      [splitRefused, shortUnavailable, longUnavailable, noteRow],
      // D-221: the combined-total and minor-difference shapes.
      [combinedRefused, crwvCombined, crwvTaggedTotal, ...Object.values(completed).map((out) => out.row)],
      // D-222: the vendor/SEC comparison's and the share guard's shapes, and what the rechecks make of them.
      [sbcZeroRefused, sbcDerivedRefused, cashRefused, annualEnriched.cashflow, annualEnriched.balance, quarterEnriched.cashflow, quarterEnriched.balance,
        C1(sbcZeroRefused).row, C2(sbcDerivedRefused).row, C3(cashRefused).row],
      [lossRefused, gainRefused, unusableRefused, C13(lossRefused).row],
    ].flat().flatMap(fieldsOf),
  ];
  const conflicts: Conflict[] = fielded.map(([, conflict]) => conflict);
  const readsField = (reader: ConflictCodeReader, field: string): boolean => {
    const fields = READ_FIELDS[reader];
    return fields === "any" || fields.includes(field);
  };

  it.each(READERS)("%s: on every sentence the writers produce on the fields it reads, the code set and the legacy wording agree", (reader) => {
    const coded = fielded.filter(([field, conflict]) => conflict.cause !== undefined && readsField(reader, field));
    expect(coded.length).toBeGreaterThan(READ_FIELDS[reader] === "any" ? 20 : 2);
    for (const [field, conflict] of coded) {
      expect({ field, reason: conflict.reason, cause: conflict.cause, matches: conflictCauseMatches(conflict, reader) })
        .toEqual({ field, reason: conflict.reason, cause: conflict.cause, matches: conflictCauseMatches({ reason: conflict.reason }, reader) });
    }
  });

  it("the writers reach every code a reader reads, each on both sides of each reader", () => {
    const reached = new Set(conflicts.map((conflict) => conflict.cause).filter((cause) => cause !== undefined));
    expect([...CONFLICT_CAUSES_READ_BY_CODE].filter((cause) => !reached.has(cause))).toEqual([]);
    for (const reader of READERS) {
      // D-221: a legacy-only reader passes no coded conflict at all.
      expect(new Set(conflicts.filter((c) => c.cause !== undefined).map((c) => conflictCauseMatches(c, reader))))
        .toEqual(new Set(LEGACY_ONLY.includes(reader) ? [false] : [true, false]));
    }
  });

  it("the D-220 codes sit on their own fields: the same code on another field has another sentence and another reader", () => {
    const codesOn = (...fields: string[]) => new Set(fielded.filter(([field, conflict]) => fields.includes(field) && conflict.cause !== undefined).map(([, conflict]) => conflict.cause));
    expect(codesOn("shortTermDebt")).toEqual(new Set(["debt-maturity-scope"]));
    expect(codesOn("longTermDebt")).toEqual(new Set(["debt-noncurrent-allocation"]));
    for (const code of ["debt-component-maturity-scope", "debt-maturity-scope", "debt-components-incomplete"] as const) expect(codesOn("totalDebt", "netDebt")).toContain(code);
    expect(codesOn("totalDebt", "netDebt")).not.toContain("debt-noncurrent-allocation");
    const maturityTotal = fielded.find(([field, conflict]) => field === "totalDebt" && conflict.cause === "debt-maturity-scope")![1];
    expect(conflictCauseMatches(maturityTotal, "noteRecoverableDebtTotal")).toBe(true);
    expect(conflictCauseMatches({ reason: maturityTotal.reason }, "shortTermDebtMaturityScope")).toBe(false);
  });

  it("reads exactly the D-218 step-1 codes, every one of them (D-222)", () => {
    expect([...CONFLICT_CAUSES_READ_BY_CODE].sort()).toEqual(["debt-aggregate-exceeds-components", "debt-combined-aggregate-exceeds-components",
      "debt-component-maturity-scope", "debt-components-incomplete", "debt-lease-line-no-operating-total", "debt-lease-line-refused", "debt-maturity-scope",
      "debt-noncurrent-allocation", "debt-total-minor-difference", "debt-vendor-short-term-zero", "vendor-sec-value-conflict", "vendor-share-value-conflict"]);
    expect([...CONFLICT_CAUSES_READ_BY_CODE].sort()).toEqual([...DUAL_WRITTEN_CONFLICT_CAUSES].sort());
  });

  it("D-222: the vendor/SEC code sits on stock compensation and cash only beside that field's own sentence; a dependent never is one of them", () => {
    const coded = fielded.filter(([, conflict]) => conflict.cause === "vendor-sec-value-conflict");
    expect(new Set(coded.map(([field]) => field))).toEqual(new Set(["stockBasedCompensation", "cashAndCashEquivalents", "cashAndShortTermInvestments", "netDebt",
      "netCashProvidedByInvestingActivities", "netCashProvidedByFinancingActivities"]));
    const DEPENDENT_OF: Record<string, string> = { cashAndShortTermInvestments: "cashAndCashEquivalents", netDebt: "cashAndCashEquivalents" };
    for (const [field, conflict] of coded) expect({ field, sentence: conflict.reason.startsWith(`vendor/SEC ${DEPENDENT_OF[field] ?? field} conflict: `) }).toEqual({ field, sentence: true });
    // The same code with another field's sentence would pass the code but not the wording, which is why the readers are per field.
    const investing = COMPARISON_CODED["the investing cash-flow refusal"]!;
    expect([conflictCauseMatches(investing, "vendorSecStockCompensation"), conflictCauseMatches({ reason: investing.reason }, "vendorSecStockCompensation")]).toEqual([true, false]);
    // The share code sits on the share fields only, always beside the disagreement sentence.
    const shareCoded = fielded.filter(([, c]) => c.cause === "vendor-share-value-conflict");
    expect(shareCoded.length).toBeGreaterThan(2);
    for (const [field, conflict] of shareCoded) {
      expect(["eps", "epsDiluted", "weightedAverageShsOut", "weightedAverageShsOutDil"]).toContain(field);
      expect(conflict.reason).toMatch(/^the vendor's .*; field unavailable until reconciled$/);
    }
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
    // D-220.
    expect(conflictCauseMatches({ cause: "debt-maturity-scope", reason: "x" }, "shortTermDebtMaturityScope")).toBe(true);
    expect(conflictCauseMatches({ cause: "debt-component-maturity-scope", reason: "debt maturity scope unresolved: x" }, "shortTermDebtMaturityScope")).toBe(false);
    expect(conflictCauseMatches({ reason: "debt maturity scope unresolved: x" }, "shortTermDebtMaturityScope")).toBe(true);
    expect(conflictCauseMatches({ cause: "debt-noncurrent-allocation", reason: "x" }, "longTermDebtNoncurrentAllocation")).toBe(true);
    expect(conflictCauseMatches({ cause: "debt-maturity-scope", reason: "noncurrent carrying debt allocation unavailable: x" }, "longTermDebtNoncurrentAllocation")).toBe(false);
    expect(conflictCauseMatches({ reason: "noncurrent carrying debt allocation unavailable: x" }, "longTermDebtNoncurrentAllocation")).toBe(true);
    for (const cause of ["debt-component-maturity-scope", "debt-maturity-scope", "debt-components-incomplete"] as const) {
      expect(conflictCauseMatches({ cause, reason: "x" }, "noteRecoverableDebtTotal")).toBe(true);
    }
    expect(conflictCauseMatches({ cause: "debt-noncurrent-allocation", reason: "incomplete debt carrying value: debt maturity scope unresolved: x" }, "noteRecoverableDebtTotal")).toBe(false);
    for (const reason of ["incomplete debt carrying value: shortTermDebt is unavailable (debt maturity scope unresolved: x)", "incomplete debt carrying value: debt maturity scope unresolved: x",
      "incomplete debt carrying value: current/noncurrent financing components do not establish the total; x"]) {
      expect(conflictCauseMatches({ reason }, "noteRecoverableDebtTotal")).toBe(true);
    }
    expect(conflictCauseMatches({ reason: "incomplete debt carrying value: longTermDebt is unavailable (debt maturity scope unresolved: x)" }, "noteRecoverableDebtTotal")).toBe(false);
    for (const reader of ["shortTermDebtMaturityScope", "longTermDebtNoncurrentAllocation", "noteRecoverableDebtTotal"] as const) expect(conflictCauseMatches({}, reader)).toBe(false);
    // D-221.
    const combined = "incomplete debt carrying value: same-period DebtLongtermAndShorttermCombinedAmount 3 exceeds x";
    expect(conflictCauseMatches({ cause: "debt-combined-aggregate-exceeds-components", reason: "x" }, "combinedAggregateExceedsComponents")).toBe(true);
    expect(conflictCauseMatches({ cause: "debt-aggregate-exceeds-components", reason: combined }, "combinedAggregateExceedsComponents")).toBe(false);
    expect(conflictCauseMatches({ reason: combined }, "combinedAggregateExceedsComponents")).toBe(true);
    expect(conflictCauseMatches({ reason: "incomplete debt carrying value: same-period LongTermDebt 3 exceeds x" }, "combinedAggregateExceedsComponents")).toBe(false);
    const minor = "vendor total 1M versus component sum 2M (x); minor difference retained as a qualification, x";
    expect(conflictCauseMatches({ cause: "debt-total-minor-difference", reason: "x" }, "debtTotalMinorDifference")).toBe(true);
    expect(conflictCauseMatches({ cause: "vendor-sec-value-conflict", reason: minor }, "debtTotalMinorDifference")).toBe(false);
    expect(conflictCauseMatches({ reason: minor }, "debtTotalMinorDifference")).toBe(true);
    expect(conflictCauseMatches({ reason: "vendor total 1M versus component sum 2M (x) exceeds the minor-difference limit" }, "debtTotalMinorDifference")).toBe(false);
    for (const cause of [...STATEMENT_CONFLICT_CAUSES, "a-code-no-list-has", null]) {
      expect(conflictCauseMatches({ cause, reason: OLD_VENDOR_SUM }, "legacyVendorSumRefusal")).toBe(false);
    }
    expect(conflictCauseMatches({ reason: OLD_VENDOR_SUM }, "legacyVendorSumRefusal")).toBe(true);
    expect(conflictCauseMatches({ reason: REFUSALS["lease line, any other refusal"].totalDebt.reason }, "legacyVendorSumRefusal")).toBe(false);
    for (const reader of ["combinedAggregateExceedsComponents", "debtTotalMinorDifference", "legacyVendorSumRefusal"] as const) expect(conflictCauseMatches({}, reader)).toBe(false);
    // D-222.
    expect(conflictCauseMatches({ cause: "vendor-sec-value-conflict", reason: "x" }, "vendorSecStockCompensation")).toBe(true);
    expect(conflictCauseMatches({ cause: "vendor-share-value-conflict", reason: "vendor/SEC stockBasedCompensation conflict: x" }, "vendorSecStockCompensation")).toBe(false);
    expect(conflictCauseMatches({ reason: "vendor/SEC stockBasedCompensation conflict: x" }, "vendorSecStockCompensation")).toBe(true);
    expect(conflictCauseMatches({ reason: "vendor/SEC cashAndCashEquivalents conflict: x" }, "vendorSecStockCompensation")).toBe(false);
    expect(conflictCauseMatches({ cause: "vendor-sec-value-conflict", reason: "x" }, "vendorSecCash")).toBe(true);
    expect(conflictCauseMatches({ cause: "debt-maturity-scope", reason: "vendor/SEC cashAndCashEquivalents conflict: x" }, "vendorSecCash")).toBe(false);
    expect(conflictCauseMatches({ reason: "vendor/SEC cashAndCashEquivalents conflict: x" }, "vendorSecCash")).toBe(true);
    expect(conflictCauseMatches({ reason: "vendor cash scope reconciled at 2025-12-31: x" }, "vendorSecCash")).toBe(false);
    const share = "the vendor's eps for 2025-03-31 (-1.8) differs from the filer's (-2) on the 2026-11-01 basis; x; field unavailable until reconciled";
    expect(conflictCauseMatches({ cause: "vendor-share-value-conflict", reason: "x" }, "vendorShareRecheck")).toBe(true);
    expect(conflictCauseMatches({ cause: "vendor-sec-value-conflict", reason: share }, "vendorShareRecheck")).toBe(false);
    expect(conflictCauseMatches({ reason: share }, "vendorShareRecheck")).toBe(true);
    expect(conflictCauseMatches({ reason: "the vendor's eps for 2025-03-31 (NaN) is not a usable figure to test against x" }, "vendorShareRecheck")).toBe(false);
    for (const reader of ["vendorSecStockCompensation", "vendorSecCash", "vendorShareRecheck"] as const) expect(conflictCauseMatches({}, reader)).toBe(false);
  });
});

describe("run input snapshots", () => {
  it("keep every code: each D-218 step-1 code is read (D-222), and the earlier codes stay", () => {
    const bundle = completeCurrencyBundle({});
    if (!bundle.statements.balanceAnnual.ok) throw Error("fixture");
    const row = bundle.statements.balanceAnnual.value.data.rows[0] as FmpStatementRow;
    row.fieldConflicts = Object.fromEntries(STATEMENT_CONFLICT_CAUSES.map((cause) =>
      [`field-${cause}`, { usable: false, vendorValue: 1, secValue: null, reason: "kept sentence", cause }]));
    const snapshot = captureRunInputSnapshot(bundle, { evIncludeLeases: false });
    const stored = snapshot.content.bundle.statements.balanceAnnual;
    const kept = Object.values((stored.ok ? stored.value.data.rows[0] as FmpStatementRow : row).fieldConflicts ?? {});
    expect(kept.map((conflict) => conflict.reason)).toEqual(STATEMENT_CONFLICT_CAUSES.map(() => "kept sentence"));
    // D-220 adds the four debt-maturity codes to the nine kept since D-219; D-221 adds the minor difference
    // (the combined-total code C7 reads was already kept for C11); D-222 adds the vendor/SEC and share codes.
    expect(kept.map((conflict) => conflict.cause).filter((cause) => cause !== undefined).sort()).toEqual([
      "borrowing-cost-scope", "debt-aggregate-exceeds-components", "debt-combined-aggregate-exceeds-components", "debt-component-maturity-scope",
      "debt-components-incomplete", "debt-lease-line-no-operating-total", "debt-lease-line-refused", "debt-maturity-scope", "debt-noncurrent-allocation",
      "debt-total-minor-difference", "debt-vendor-short-term-zero", "operating-basis", "operating-scope", "revenue-scope", "vendor-sec-value-conflict",
      "vendor-share-value-conflict"]);
    expect(kept.map((conflict) => conflict.cause).sort()).toEqual([...STATEMENT_CONFLICT_CAUSES].sort());
    const dropped = STATEMENT_CONFLICT_CAUSES.filter((cause) => DUAL_WRITTEN_CONFLICT_CAUSES.has(cause) && !CONFLICT_CAUSES_READ_BY_CODE.has(cause));
    expect(dropped).toEqual([]);
    // The live bundle is not mutated.
    expect(Object.values(row.fieldConflicts ?? {}).map((conflict) => conflict.cause)).toEqual([...STATEMENT_CONFLICT_CAUSES]);
  });
});
