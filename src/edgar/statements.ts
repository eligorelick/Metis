/** Compatibility entry point; responsibilities live in adjacent modules with unchanged evidence rules. */
export {
  type StatementBuildOptions,
  type ShareBasisWithheld,
  type Derivation,
  type StatementRowsResult,
  type FilingRef,
  type OriginalValue,
  type Restatement,
  RESTATEMENT_THRESHOLD_PCT,
  type Substitution,
  type Withholding,
  type SharesBasis,
  type SharesOutstandingPoint,
  type BuiltStatements,
  type StatementFactExclusion,
} from "./statements/types";
export {
  type ChainSpec,
  longTermDebtHoldsFinanceLeases,
  longTermDebtHoldsCurrent,
  lowerBoundDAndACaveat,
  DISCONTINUED_LABEL_TAGS,
  ADDITIVE_INCOME_FIELDS,
} from "./statements/fieldSpecs";
export {
  resolveFirstStepForTests,
} from "./statements/resolution";
export {
  longTermInvestmentsChainAt,
  EQUITY_METHOD_PLACEMENT_TOLERANCE,
} from "./statements/quarters";
export {
  latestSharesOutstanding,
  type CoverShareCount,
  CLASS_SIZE_RATIO_WARN,
  coverShareCountsByPeriod,
  classAmbiguityNote,
  classRatioNote,
} from "./statements/shares";
export {
  buildStatementsFromCompanyFacts,
  buildIncomeWindowFromCompanyFacts,
  buildStatementsUncached,
  describeShareBasisWithheld,
} from "./statements/company";
export {
  BALANCE_SHEET_SHARES_TAG,
} from "@/edgar/tagSynonyms";
export {
  describeChangePct,
} from "@/edgar/presentationLineage";
