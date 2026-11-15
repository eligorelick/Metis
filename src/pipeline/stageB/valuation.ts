/**
 * Stage B — valuation engine (own DCF, sensitivity grid, reverse DCF,
 * multiples framework, sector-override models).
 *
 * PURE, deterministic TypeScript: no network, no db, no LLM. Inputs are plain
 * typed rows whose field names match FMP exactly;
 * the integration agent wires the DataBundle into these interfaces.
 *
 * Conventions:
 * - Every rate/percentage field suffixed `Pct` is in PERCENT units (8 = 8%).
 *   Conversion to decimals happens only inside discounting math.
 * - Missing inputs never throw: results carry ManifestEntry-compatible gaps.
 * - FMP zero-for-undisclosed is treated as null where a zero is implausible.
 * - Every "house rule" (clamp/fade/guard) that fires is annotated in notes[].
 * - Full precision is returned everywhere; round only at display time.
 *
 * Methodology source: the valuation methodology (Damodaran-standard).
 */
/** Compatibility entry point; responsibilities live in adjacent modules with unchanged evidence rules. */
export {
  type Assumption,
  DCF_HORIZON_YEARS,
  NEAR_TERM_GROWTH_CLAMP_PP,
  S2C_CLAMP,
  S2C_HISTORY_MIN_YEARS,
  S2C_HISTORY_MIN_RATIO,
  LONG_TERM_INVESTMENTS_REMOVED_CLAUSE,
  TERMINAL_G_CAP_PCT,
  TERMINAL_EXCESS_RETURN_CAP_PP,
  TERMINAL_EXCESS_RETURN_MIN_YEARS,
  EXCESS_RETURN_START_GAP_PP,
  TERMINAL_EXCESS_RETURN_CARRY,
  TERMINAL_EXCESS_RETURN_MIN_PP,
  TV_GUARD_PP,
  GRID_TV_GUARD_PP,
  MARGIN_CLAMP_PP,
  MARGIN_WARN_BAND_PP,
  MARGIN_FADE_YEARS,
  MARGIN_TREND_THRESHOLD_PP_PER_YEAR,
  IMPROVING_MARGIN_TREND_SHARE,
  SENSITIVITY_STEPS_PP,
  SENSITIVITY_WACC_STEPS_PP,
  REVERSE_GROWTH_RANGE_PCT,
  REVERSE_MARGIN_RANGE_PCT,
  REVERSE_PRESCAN_POINTS,
  BISECTION_TOL_PP,
  BISECTION_MAX_ITER,
  EXCESS_RETURN_YEARS,
  REVERSE_ROE_RANGE_PCT,
  PAYOUT_CLAMP_PCT,
  MIN_PEERS_FOR_STATS,
  MIN_HISTORY_OBS_FOR_BAND,
  FULL_OWN_HISTORY_OBS,
  safeDiv,
  financeLeaseOnlyTotal,
  financeLeaseOnlyEvClause,
  establishedSalesToCapital,
  fadePath,
  GROWTH_FADE_HALF_LIFE_YEARS,
  convergentFadeWeights,
  convergentFadePath,
  GLOBAL_MINIMUM_TAX_PCT,
  STATUTORY_MARGINAL_TAX_PCT,
  marginalTaxFloor,
} from "./valuation/primitives";
export {
  MIN_CONSENSUS_ANALYSTS,
  MAX_CONSENSUS_CV_PCT,
  expectedNormalRange,
  consensusDispersionPct,
  revenueRunRate,
  seasonalQuarterShares,
  calendarizeConsensusWindow,
} from "./valuation/consensus";
export {
  quantile,
  medianOf,
  percentileRank,
} from "./valuation/statistics";
export {
  type AnalystEstimateRow,
  type FiscalYearToDate,
  type RevenueSeasonality,
  type ConsensusPathRow,
  type DcfIncomeRow,
  type DcfBalanceRow,
  type DcfSbcTreatment,
  type DcfRevenueTrend,
  type DcfAssumptionInputs,
  type DcfQuarterRevenue,
  type DcfGuidance,
  type RevenueRunRate,
  type RevenueAnchor,
  type DcfRoicYear,
  type TerminalRoic,
  terminalRoic,
  type GrowthAnchorMethod,
  type GrowthAnchor,
  type DcfAssumptions,
  type ScenarioMarginCeiling,
  type BuildDcfAssumptionsResult,
  consensusYearsText,
  scenarioMarginCeiling,
  MID_YEAR_DISCOUNTING_BASIS,
  buildDcfAssumptions,
} from "./valuation/assumptions";
export {
  type DcfRunOptions,
  type TemporaryEquityDisclosure,
  type NonOperatingAssetComponent,
  type DcfYearRow,
  type DcfForecastPeriod,
  forecastYearPeriod,
  type DcfBridge,
  type DcfResult,
  type DcfDomainTest,
  type DcfDomainFailure,
  dcfDomainFailure,
  runDcf,
} from "./valuation/dcf";
export {
  UNSPLIT_CELLS_LEAD,
  unsplitCellsNote,
  NCI_EARNINGS_KEY_MATERIALITY_PCT,
  noncontrollingProfitShareText,
  noncontrollingBookReason,
  type NoncontrollingEarningsRow,
  noncontrollingEarningsInput,
} from "./valuation/equityBridge";
export {
  type SensitivityGrid,
  sensitivityGrid,
  GROWTH_GRID_STEPS_PP,
  MARGIN_GRID_STEPS_PP,
  type GrowthMarginGrid,
  growthMarginGrid,
  type GrowthPathFamily,
  isStartingGrowthFamily,
  type ReverseDcfResult,
  reverseDcf,
} from "./valuation/sensitivity";
export {
  type MultipleKey,
  SECTOR_APPROPRIATE_MULTIPLES,
  type MultiplesQuoteInputs,
  type CommonIncomeQuarter,
  type MultiplesIncomeTtm,
  type MultiplesCashFlowTtm,
  type MultiplesBalance,
  type QuarterlyFundamentalsRow,
  type EnterpriseValuesRow,
  type VendorMultiplesRow,
  type PeerMultiples,
  type MultiplesFrameworkInputs,
  EV_LEASE_SETTING_TEXT,
  type EnterpriseValueBridge,
  type OwnHistoryBand,
  type OwnHistoryObservation,
  type PeerStats,
  type MultipleStat,
  GAIN_INFLATED_NON_OPERATING_SHARE,
  nonOperatingShareOfPretax,
  type MultiplesResult,
  multiplesFramework,
} from "./valuation/multiples";
export {
  type ExcessReturnInputs,
  type PriceToTangibleBookVsRote,
  type ExcessReturnStartAlternative,
  type ExcessReturnGrid,
  EXCESS_RETURN_GRID_START_STEP_PP,
  EXCESS_RETURN_GRID_COE_STEP_PP,
  type ExcessReturnResult,
  steadyStatePayoutPct,
  excessReturnValue,
  JUSTIFIED_PTBV_MIN_SPREAD_PP,
  excessReturnModel,
} from "./valuation/excessReturn";
export {
  type ReitInputs,
  type ReitValuationResult,
  reitValuation,
} from "./valuation/reit";
export {
  type ValuationBundleInputs,
  type ValuationResult,
  valueCompany,
} from "./valuation/company";
export {
  taxRateWithoutOneOffs,
} from "./valuation/tax";
export {
  investmentDefinition,
  revenueDefinition,
  INVESTMENT_DEFINITION_FAMILIES,
  REVENUE_DEFINITION_FAMILIES,
  annualRevenueDefinition,
} from "./valuation/evidenceDefinitions";
