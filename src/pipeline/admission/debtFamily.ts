/**
 * The debt family, admitted once per run (P13, P7; D-254).
 *
 * This is the pilot of "admit evidence once per run": one family (total debt,
 * net debt, the current and non-current borrowings and the three lease lines of
 * a balance row), one shared preparation, and a reader interface that carries
 * the decision without the statement row.
 *
 * What it owns. `admitDebtFields` (`@/edgar/financialEnrichment`, the P7 owner)
 * still decides everything; nothing here changes what it decides. This module
 * is the only place outside the data bundle's enrichment that calls it
 * (`tests/admission.debtFamily.oneOwner.test.ts`), and it derives the evidence
 * arguments in one place: the confirmed issuer's facts, the analysis cutoff and
 * the filing sections all come from the run's bundle. A reader supplies only
 * its own balance row, the statement family it took the row from, the name of
 * its row convention and the currency the P4 owner established for that row.
 *
 * Once per run. A decision is kept for the run's facts object (every view of
 * one bundle shares it) and found again only by the exact inputs that produced
 * it: the same facts object, the same cutoff, the same filing sections, the
 * same currency and a balance row with the same cells in the same order
 * (`canonicalKey`, a lossless encoding; a row it cannot encode is admitted
 * without being kept). Stage B and the Stage C payload therefore share one
 * admission of a row they both present unchanged, and a reader whose row
 * differs gets its own. The reader whose row causes a decision receives what
 * the owner returned, as before; what is kept is a private copy, and a later
 * reader receives its own deep copy of that. A row the admission left
 * untouched is returned as the caller's own object, as before. The facts
 * object is immutable evidence (D-67); the store is released with it.
 *
 * Conventions. Two readers present rows prepared differently, so each decision
 * names the convention of the row it was made on (`DebtRowConvention`). The
 * lease-refusal reversal (`restoreLeaseFinancingProvenance`, D-186) is Stage
 * B's alone and runs before admission; its rule stays in
 * `@/pipeline/stageB/leaseScope`. Only its result reaches this module, as the
 * row Stage B presents.
 */
import { canonicalKey } from "@/edgar/computationContext";
import { admitDebtFields, debtPresentationSections, type BalanceAdmission } from "@/edgar/financialEnrichment";
import { confirmedIssuerFacts } from "@/edgar/issuerFacts";
import type { CompanyFacts } from "@/edgar/xbrl";
import type { DataBundle, ExtractedSection } from "@/pipeline/types";
import type { FmpStatementRow, StatementFieldConflict, StatementFieldProvenance } from "@/providers/fmp";
import type { ManifestEntry } from "@/types/core";

/** Every cell `admitDebtFields` may write, with its entry in `fieldConflicts` and `fieldProvenance`. */
export const DEBT_FAMILY_FIELDS = [
  "totalDebt", "netDebt", "vendorNetDebt", "shortTermDebt", "longTermDebt",
  "capitalLeaseObligations", "operatingLeaseLiability", "financeLeaseLiability",
] as const;
export type DebtFamilyField = (typeof DEBT_FAMILY_FIELDS)[number];

/** The balance statement family a reader took its row from. */
export type DebtFamilyStatement = "balanceAnnual" | "balanceQuarterly";

/**
 * Which reader's row the decision was made on. The two are prepared differently
 * before admission, so a decision under one is not a decision under the other
 * unless the rows are the same.
 *
 * - `bundle-statement-row`: the balance row as the bundle's statement family
 *   carries it (the Stage C payload's statement extract).
 * - `stage-b-balance-row`: Stage B's working balance row. Before admission
 *   Stage B restores omitted lease-financing provenance and a refused
 *   noncurrent-only operating lease total (`restoreLeaseFinancingProvenance`,
 *   D-186), attaches marketable equity (D-60), adds the fiscal-year-end balance
 *   (D-173), keeps the model-currency rows and classifies tangible book.
 */
export type DebtRowConvention = "bundle-statement-row" | "stage-b-balance-row";

/** What a reader says about the row it presents. */
export interface DebtRowReader {
  statement: DebtFamilyStatement;
  convention: DebtRowConvention;
  /**
   * P4: the currency the owner's rule (`establishedCurrencyOn`, compute.ts) established for this row
   * from the reader's own currency evidence; null when none is. It is passed in because compute.ts
   * imports this module.
   */
  currency: string | null;
}

/** What one admitted debt decision is a decision about. */
export interface AdmittedDebtRowIdentity {
  /** The run's issuer; `cik` is null when the bundle has no confirmed SEC facts, and then nothing was checked. */
  issuer: { symbol: string; cik: number | null };
  statement: DebtFamilyStatement;
  /** The statement family's source ("edgar" or the provider's name); null when the family is unavailable. */
  source: string | null;
  /** The balance date and fiscal labels as the row states them. */
  periodEnd: string | null;
  fiscalYear: string | null;
  fiscalPeriod: string | null;
  /** The currency the family was admitted in; null when none was established, and then nothing was checked. */
  currency: string | null;
  /** The analysis cutoff the filed facts were read at (P2). */
  observedAt: string;
  convention: DebtRowConvention;
  /**
   * The report's retained debt basis: the total as the filing or the provider composes it, lease
   * lines as recorded. The lease-excluded and lease-inclusive net-debt conventions are decided
   * from this row by `leaseDebtScopeRefusal` and `resolveNetDebt` and are not part of it.
   */
  debtBasis: "retained";
}

/** One cell of the family: its value, its refusal or resolution (with the typed cause where the owner wrote one) and its filing evidence. */
export interface AdmittedDebtField {
  value: number | null | undefined;
  conflict: StatementFieldConflict | undefined;
  provenance: StatementFieldProvenance | undefined;
}

/** The debt family of one balance row after admission. It carries no other cell of the statement row. */
export interface AdmittedDebtRow {
  readonly identity: AdmittedDebtRowIdentity;
  readonly fields: Readonly<Record<DebtFamilyField, AdmittedDebtField>>;
  /** The admission's own manifest entries and row completions, as `admitDebtFields` returned them. */
  readonly gaps: ManifestEntry[];
  readonly admissions: BalanceAdmission[];
}

export interface DebtAdmissionResult<T extends FmpStatementRow> {
  /** The reader's own row with the admitted family written into it; every other cell is the reader's, untouched. */
  row: T;
  admitted: AdmittedDebtRow;
}

/** The run's debt-family admission: one per bundle evidence, shared by every reader of the run. */
export interface DebtFamilyAdmission {
  /** The confirmed issuer, or null when the bundle has no confirmed SEC facts: rows then pass through unchanged. */
  readonly issuer: { symbol: string; cik: number } | null;
  admit<T extends FmpStatementRow>(row: T, reader: DebtRowReader): DebtAdmissionResult<T>;
  /** Diagnostics: rows readers presented, and how many of them `admitDebtFields` had to decide. */
  counts(): { presented: number; decided: number };
}

interface KeptDecision {
  /** True when the admission returned the presented row itself; the caller's own row is then the result. */
  unchanged: boolean;
  row: FmpStatementRow | null;
  gaps: ManifestEntry[];
  admissions: BalanceAdmission[];
}

interface RunStore {
  observedAt: string;
  presentations: readonly ExtractedSection[];
  decisions: Map<string, KeptDecision>;
  presented: number;
  decided: number;
}

/** Kept per facts object (identity), so nothing reaches another issuer or outlives the run's evidence. */
const RUNS = new WeakMap<CompanyFacts, RunStore[]>();

function storeFor(facts: CompanyFacts, observedAt: string, presentations: readonly ExtractedSection[]): RunStore {
  let stores = RUNS.get(facts);
  if (!stores) RUNS.set(facts, stores = []);
  // The filing sections are compared by identity: the same objects, in the same order.
  let store = stores.find((candidate) => candidate.observedAt === observedAt && candidate.presentations.length === presentations.length &&
    candidate.presentations.every((section, index) => section === presentations[index]));
  if (!store) stores.push(store = { observedAt, presentations, decisions: new Map(), presented: 0, decided: 0 });
  return store;
}

const text = (value: unknown): string | null => typeof value === "string" ? value : null;

/**
 * `canonicalKey` sorts an object's members, so two rows with the same cells in a different order would
 * share a key, and the admitted row keeps its input's order. Spell the order out first: an object
 * becomes its members in their own order. Anything that is not plain data is passed through
 * unchanged, which makes `canonicalKey` refuse the row, and it is then admitted without being kept.
 */
function inOwnOrder(value: unknown, open: Set<object> = new Set()): unknown {
  if (value === null || typeof value !== "object") return value;
  // A cycle is not plain data; a function makes the encoder refuse.
  if (open.has(value)) return inOwnOrder;
  const prototype: unknown = Object.getPrototypeOf(value);
  const plain = Array.isArray(value) || ((prototype === Object.prototype || prototype === null) && Object.getOwnPropertySymbols(value).length === 0);
  if (!plain) return value;
  open.add(value);
  const out = Array.isArray(value) ? { list: value.map((item) => inOwnOrder(item, open)) }
    : { members: Object.keys(value).map((key) => [key, inOwnOrder((value as Record<string, unknown>)[key], open)]) };
  open.delete(value);
  return out;
}

function familyView(identity: AdmittedDebtRowIdentity, row: FmpStatementRow, gaps: ManifestEntry[], admissions: BalanceAdmission[]): AdmittedDebtRow {
  const fields = Object.fromEntries(DEBT_FAMILY_FIELDS.map((field) => {
    const value = row[field];
    return [field, { value: typeof value === "number" || value === null ? value : undefined,
      conflict: row.fieldConflicts?.[field], provenance: row.fieldProvenance?.[field] }];
  })) as Record<DebtFamilyField, AdmittedDebtField>;
  return { identity, fields, gaps, admissions };
}

/**
 * The run's debt-family admission for this bundle. Call it once per reader and present each balance
 * row through `admit`; a row another reader of the same run already presented is not decided again.
 */
export function debtFamilyAdmission(bundle: DataBundle): DebtFamilyAdmission {
  const facts = confirmedIssuerFacts(bundle.symbol, bundle.edgar);
  const observedAt = bundle.builtAt;
  const presentations = debtPresentationSections(bundle.edgar);
  const store = facts === null ? null : storeFor(facts, observedAt, presentations);
  const identityOf = (row: FmpStatementRow, reader: DebtRowReader): AdmittedDebtRowIdentity => {
    const family = bundle.statements?.[reader.statement];
    return {
      issuer: { symbol: bundle.symbol, cik: facts === null ? null : facts.cik },
      statement: reader.statement,
      source: family?.ok ? family.value.source : null,
      periodEnd: text(row.date), fiscalYear: text(row.fiscalYear), fiscalPeriod: text(row.period),
      currency: reader.currency, observedAt, convention: reader.convention, debtBasis: "retained",
    };
  };
  return {
    issuer: facts === null ? null : { symbol: bundle.symbol, cik: facts.cik },
    admit<T extends FmpStatementRow>(row: T, reader: DebtRowReader): DebtAdmissionResult<T> {
      const identity = identityOf(row, reader);
      if (facts === null || store === null) return { row, admitted: familyView(identity, row, [], []) };
      store.presented += 1;
      const key = canonicalKey({ row: inOwnOrder(row), currency: reader.currency });
      const kept = key === null ? undefined : store.decisions.get(key);
      if (kept === undefined) {
        // The reader that causes the decision receives exactly what the owner returned, as it did before.
        const decided = admitDebtFields(row, facts, reader.currency, observedAt, presentations);
        store.decided += 1;
        if (key !== null) {
          try {
            // Private copies: a later write to the presented row or to what a caller received cannot reach them.
            store.decisions.set(key, { unchanged: decided.row === row, row: decided.row === row ? null : structuredClone(decided.row),
              gaps: structuredClone(decided.gaps), admissions: structuredClone(decided.admissions) });
          } catch {
            // Not copyable: this caller alone gets the decision and nothing is kept.
          }
        }
        return { row: decided.row, admitted: familyView(identity, decided.row, decided.gaps, decided.admissions) };
      }
      const admittedRow = kept.unchanged || kept.row === null ? row : structuredClone(kept.row) as T;
      return { row: admittedRow, admitted: familyView(identity, admittedRow, structuredClone(kept.gaps), structuredClone(kept.admissions)) };
    },
    counts: () => ({ presented: store?.presented ?? 0, decided: store?.decided ?? 0 }),
  };
}
