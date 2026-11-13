/**
 * The one explicit mapping from a golden run's stored Stage B output and report
 * JSON to the headline figures the accuracy check compares with filed values.
 *
 * Every figure takes its value, period, unit and currency from the stored
 * output itself; nothing is recomputed from statements. A figure the report
 * does not carry is returned with value null, which the check classifies as a
 * disclosed gap, and the report's own reason is attached when a gap record or
 * withholding note names it.
 *
 * Period strings: "FY:<end>" a fiscal year ending <end>; "TTM:<start>..<end>"
 * trailing twelve months; "TTM-TO:<end>" trailing twelve months of which the
 * report states only the end (the start is never inferred from it, P1);
 * "Q:<start>..<end>" one fiscal quarter; "@<end>" an instant. Capital spending
 * is compared as a positive outflow (the report shows it negative).
 */

import type { FigureUnit } from "./lib";

export type FigureGroup = "statement" | "current" | "valuation";

export interface MetisFigure {
  id: string;
  label: string;
  group: FigureGroup;
  value: number | null;
  period: string | null;
  /** Unit of the stored value: "currency", "currency/share", "shares" or "%". */
  unit: FigureUnit;
  currency: string | null;
  /** Where the value was read (Stage B path). */
  source: string;
  /** The report's own basis or withholding text for this figure, shortened. */
  reportNote?: string;
  /**
   * The period the filed reference is built for, when it differs from `period`: a latest-fiscal-year figure is held
   * to the report's own latest fiscal year (capital.asOf), so an older year shown in its place is a period mismatch.
   */
  referencePeriod?: string;
}

type Json = Record<string, unknown>;

function at(root: unknown, path: string): unknown {
  let node: unknown = root;
  for (const key of path.split(".")) {
    if (node === null || node === undefined) return undefined;
    if (Array.isArray(node)) node = key === "-1" ? node[node.length - 1] : node[Number(key)];
    else if (typeof node === "object") node = (node as Json)[key];
    else return undefined;
  }
  return node;
}

function num(root: unknown, path: string): number | null {
  const value = at(root, path);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(root: unknown, path: string): string | null {
  const value = at(root, path);
  return typeof value === "string" && value.length > 0 ? value : null;
}

function shorten(text: string, limit = 260): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > limit ? `${flat.slice(0, limit)}…` : flat;
}

interface GapRecord { field?: string; reason?: string }

/** The first stored gap record whose field matches, as the report's own withholding reason. */
function gapReason(stageB: Json, patterns: readonly RegExp[]): string | undefined {
  const gaps = (stageB.gaps as GapRecord[] | undefined) ?? [];
  for (const pattern of patterns) {
    const hit = gaps.find((gap) => typeof gap.field === "string" && pattern.test(gap.field) && typeof gap.reason === "string");
    if (hit) return shorten(`${hit.field}: ${hit.reason}`);
  }
  return undefined;
}

/** A number written in a stored note, e.g. "net income 1058590000" → 1058590000. */
function noteNumber(text: string | null, label: RegExp): number | null {
  if (!text) return null;
  const match = label.exec(text);
  return match ? Number(match[1]) : null;
}

function fyPeriod(end: string | null): string | null {
  return end ? `FY:${end}` : null;
}

/** The TTM window of the current-capital block; an "annual" basis is the fiscal year itself. */
function currentPeriod(stageB: Json): string | null {
  const start = str(stageB, "capital.current.periodStart");
  const end = str(stageB, "capital.current.asOf");
  return start && end ? `TTM:${start}..${end}` : null;
}

function negate(value: number | null): number | null {
  return value === null ? null : value === 0 ? 0 : -value;
}

/** Headline figures for one data-only case, in a fixed order. */
export function extractFigures(stageB: Json, report: Json): MetisFigure[] {
  const statementCurrency = str(report, "filingDisclosures.currency") ?? str(stageB, "capital.current.currency");
  const currentCurrency = str(stageB, "capital.current.currency") ?? statementCurrency;
  const fyEnd = str(stageB, "capital.asOf");
  const currentEnd = str(stageB, "capital.current.asOf");
  const ttm = currentPeriod(stageB);
  const figures: MetisFigure[] = [];
  const add = (figure: MetisFigure, gapPatterns: readonly RegExp[] = []) => {
    if (figure.group === "statement" && fyEnd && figure.period !== `FY:${fyEnd}`) figure.referencePeriod = `FY:${fyEnd}`;
    if (figure.value === null && !figure.reportNote) {
      const reason = gapReason(stageB, gapPatterns);
      if (reason) figure.reportNote = reason;
    }
    figures.push(figure);
  };

  // ---- Latest fiscal year, as the statement history, growth and score tables show it.
  const revenueEnd = str(stageB, "growth.revenueCagrs.0.endDate");
  add({ id: "revenue.fy", label: "Revenue, latest fiscal year", group: "statement", value: num(stageB, "growth.revenueCagrs.0.endValue"), period: fyPeriod(revenueEnd ?? fyEnd), unit: "currency", currency: statementCurrency, source: "growth.revenueCagrs[0].endValue" },
    [/^statements\.income\.\d{4}-\d{2}-\d{2}\.revenue$/, /eligibility\.annual\.revenue/, /revenueEligibility/]);
  add({ id: "operatingIncome.fy", label: "Operating income, latest fiscal year", group: "statement", value: num(stageB, "capital.interestCoverage.ebit"), period: fyPeriod(fyEnd), unit: "currency", currency: statementCurrency, source: "capital.interestCoverage.ebit" },
    [/^capital\.interestCoverage/, /operatingIncome/]);
  const lastFcf = at(stageB, "capital.fcf.series.-1") as Json | undefined;
  add({ id: "netIncome.fy", label: "Net income, latest fiscal year", group: "statement", value: lastFcf && lastFcf.date === fyEnd ? num(lastFcf, "netIncome") : null, period: fyPeriod(fyEnd), unit: "currency", currency: statementCurrency, source: "capital.fcf.series[-1].netIncome" },
    [/^capital\.fcf/, /incomeAnnual\.netIncome/, /^statements\.income\.\d{4}-\d{2}-\d{2}\.netIncome$/]);
  add({ id: "epsDiluted.fy", label: "Diluted EPS, latest fiscal year", group: "statement", value: num(stageB, "growth.epsDilutedCagrs.0.endValue"), period: fyPeriod(str(stageB, "growth.epsDilutedCagrs.0.endDate")), unit: "currency/share", currency: statementCurrency, source: "growth.epsDilutedCagrs[0].endValue" },
    [/epsDiluted/, /dilutedEps/i]);
  add({ id: "dilutedShares.fy", label: "Diluted weighted-average shares, latest fiscal year", group: "statement", value: num(stageB, "capital.dilution.dilutedShares"), period: fyPeriod(str(stageB, "capital.dilution.asOf")), unit: "shares", currency: null, source: "capital.dilution.dilutedShares" },
    [/^capital\.dilution/, /dilutedShares/]);
  const lastCapex = at(stageB, "capital.capexIntensity.series.-1") as Json | undefined;
  add({ id: "capex.fy", label: "Capital spending, latest fiscal year", group: "statement", value: lastCapex && lastCapex.date === fyEnd ? num(lastCapex, "capex") : null, period: fyPeriod(fyEnd), unit: "currency", currency: statementCurrency, source: "capital.capexIntensity.series[-1].capex" },
    [/^capital\.capexIntensity/, /capitalExpenditure/]);
  add({ id: "fcf.fy", label: "Free cash flow before SBC (operating cash flow − capital spending), latest fiscal year", group: "statement", value: lastFcf && lastFcf.date === fyEnd ? num(lastFcf, "fcfBeforeSbc") : null, period: fyPeriod(fyEnd), unit: "currency", currency: statementCurrency, source: "capital.fcf.series[-1].fcfBeforeSbc" },
    [/^capital\.fcf/, /operatingCashFlow/]);

  // ---- Current basis: the TTM cash bridge and the latest balance the report's capital section uses.
  add({ id: "operatingIncome.ttm", label: "Operating income, TTM (current capital; DCF starting-margin numerator)", group: "current", value: num(stageB, "capital.current.ebit"), period: ttm, unit: "currency", currency: currentCurrency, source: "capital.current.ebit", reportNote: num(stageB, "capital.current.ebit") === null ? fallback(stageB) : undefined });
  add({ id: "netIncome.ttm", label: "Net income, TTM (current capital)", group: "current", value: num(stageB, "capital.current.netIncome"), period: ttm, unit: "currency", currency: currentCurrency, source: "capital.current.netIncome", reportNote: num(stageB, "capital.current.netIncome") === null ? consolidatedWindowNote(stageB) : undefined },
    [/compute\.ttmIncome/]);
  add({ id: "operatingCashFlow.ttm", label: "Operating cash flow, TTM", group: "current", value: num(stageB, "capital.current.cashBridge.operatingCashFlow"), period: ttm, unit: "currency", currency: currentCurrency, source: "capital.current.cashBridge.operatingCashFlow", reportNote: num(stageB, "capital.current.cashBridge.operatingCashFlow") === null ? fallback(stageB) : undefined },
    [/compute\.ttmCashFlow\.operatingCashFlow/]);
  add({ id: "capex.ttm", label: "Capital spending, TTM (shown as an outflow)", group: "current", value: negate(num(stageB, "capital.current.cashBridge.cashCapitalExpenditure")), period: ttm, unit: "currency", currency: currentCurrency, source: "−capital.current.cashBridge.cashCapitalExpenditure", reportNote: num(stageB, "capital.current.cashBridge.cashCapitalExpenditure") === null ? fallback(stageB) : undefined },
    [/compute\.ttmCashFlow\.capitalExpenditure/]);
  add({ id: "fcf.ttm", label: "Free cash flow before SBC, TTM (standardized: operating cash flow − capital spending)", group: "current", value: num(stageB, "capital.current.cashBridge.standardizedFcf"), period: ttm, unit: "currency", currency: currentCurrency, source: "capital.current.cashBridge.standardizedFcf", reportNote: num(stageB, "capital.current.cashBridge.standardizedFcf") === null ? fallback(stageB) : undefined },
    [/compute\.ttmCashFlow/]);
  const balance = currentEnd ? `@${currentEnd}` : null;
  add({ id: "cashAndShortTermInvestments.latest", label: "Cash and short-term investments, latest balance", group: "current", value: num(stageB, "capital.current.debtBridge.cashAndShortTermInvestments"), period: balance, unit: "currency", currency: currentCurrency, source: "capital.current.debtBridge.cashAndShortTermInvestments", reportNote: num(stageB, "capital.current.debtBridge.cashAndShortTermInvestments") === null ? fallback(stageB) : undefined });
  add({ id: "totalDebtIncludingLeases.latest", label: "Total debt including lease liabilities, latest balance", group: "current", value: num(stageB, "capital.current.debtBridge.totalDebtIncludingLeases"), period: balance, unit: "currency", currency: currentCurrency, source: "capital.current.debtBridge.totalDebtIncludingLeases", reportNote: num(stageB, "capital.current.debtBridge.totalDebtIncludingLeases") === null ? (str(stageB, "capital.current.debtBridge.compositionNote") ? shorten(str(stageB, "capital.current.debtBridge.compositionNote")!) : fallback(stageB)) : shorten(str(stageB, "capital.current.debtBridge.compositionNote") ?? "") || undefined },
    [/totalDebt/]);
  add({ id: "operatingLeases.latest", label: "Operating lease liabilities, latest balance", group: "current", value: num(stageB, "capital.current.debtBridge.operatingLeases"), period: balance, unit: "currency", currency: currentCurrency, source: "capital.current.debtBridge.operatingLeases", reportNote: num(stageB, "capital.current.debtBridge.operatingLeases") === null ? shorten(str(stageB, "capital.current.debtBridge.leaseEvidenceNote") ?? "") || fallback(stageB) : undefined });
  add({ id: "financeLeases.latest", label: "Finance lease liabilities, latest balance", group: "current", value: num(stageB, "capital.current.debtBridge.financeLeases"), period: balance, unit: "currency", currency: currentCurrency, source: "capital.current.debtBridge.financeLeases", reportNote: num(stageB, "capital.current.debtBridge.financeLeases") === null ? shorten(str(stageB, "capital.current.debtBridge.leaseEvidenceNote") ?? "") || fallback(stageB) : undefined });

  // ---- Fair-value inputs taken from the filings, per route.
  const kind = str(stageB, "valuation.kind");
  const dcf = at(stageB, "valuation.dcf");
  if (str(stageB, "fairValue.status") === "suppressed") {
    add({ id: "fv.suppressed", label: "Fair value (withheld; its filed inputs are not compared)", group: "valuation", value: null, period: null, unit: "currency/share", currency: null, source: "fairValue.status", reportNote: shorten(str(stageB, "fairValue.reasons.0.reason") ?? str(stageB, "valuation.suppressionReason") ?? str(stageB, "fairValue.basis.0") ?? "fair value suppressed") });
  }
  if (kind === "dcf" && dcf !== undefined && dcf !== null) {
    const statementDate = str(stageB, "valuation.assumptions.asOf.statements");
    // The base period is "TTM ... as of <anchor end>": the filed window ending there is the current-capital window when
    // that block ends on the same date; otherwise the DCF's own nominal anchor window.
    const anchorEnd0 = str(stageB, "valuation.assumptions.forecastPeriod.anchorEndDate");
    const anchorStart = anchorEnd0 && anchorEnd0 === currentEnd && str(stageB, "capital.current.periodStart")
      ? str(stageB, "capital.current.periodStart")
      : str(stageB, "valuation.assumptions.forecastPeriod.anchorStartDate");
    const anchorEnd = str(stageB, "valuation.assumptions.forecastPeriod.anchorEndDate");
    const dcfCurrency = dcfValuationCurrency(stageB) ?? currentCurrency;
    add({ id: "fv.startRevenue", label: "DCF base-period revenue (TTM)", group: "valuation", value: num(stageB, "valuation.assumptions.startRevenue.value"), period: anchorStart && anchorEnd ? `TTM:${anchorStart}..${anchorEnd}` : null, unit: "currency", currency: dcfCurrency, source: "valuation.assumptions.startRevenue.value", reportNote: shorten(str(stageB, "valuation.assumptions.startRevenue.basis") ?? "") || undefined });
    add({ id: "fv.taxRate", label: "DCF year-one tax rate (TTM effective rate)", group: "valuation", value: num(stageB, "valuation.assumptions.taxRatePath.value.0"), period: anchorStart && anchorEnd ? `TTM:${anchorStart}..${anchorEnd}` : null, unit: "%", currency: null, source: "valuation.assumptions.taxRatePath.value[0]", reportNote: shorten(str(stageB, "valuation.assumptions.taxRatePath.basis") ?? "") || undefined });
    add({ id: "fv.dilutedShares", label: "DCF per-share divisor (latest weighted-average diluted shares)", group: "valuation", value: num(stageB, "valuation.dcf.bridge.dilutedShares"), period: statementDate ? `LATEST-PERIOD:${statementDate}` : null, unit: "shares", currency: null, source: "valuation.dcf.bridge.dilutedShares" });
    add({ id: "fv.netDebt", label: "DCF equity bridge net debt (debt and finance leases, excluding operating leases, less cash and short-term investments)", group: "valuation", value: num(stageB, "valuation.dcf.bridge.netDebt"), period: statementDate ? `@${statementDate}` : null, unit: "currency", currency: dcfCurrency, source: "valuation.dcf.bridge.netDebt" });
    add({ id: "fv.minorityInterest", label: "DCF equity bridge non-controlling interest", group: "valuation", value: num(stageB, "valuation.dcf.bridge.minorityInterest"), period: statementDate ? `@${statementDate}` : null, unit: "currency", currency: dcfCurrency, source: "valuation.dcf.bridge.minorityInterest" });
    add({ id: "fv.preferred", label: "DCF equity bridge preferred equity", group: "valuation", value: num(stageB, "valuation.dcf.bridge.preferred"), period: statementDate ? `@${statementDate}` : null, unit: "currency", currency: dcfCurrency, source: "valuation.dcf.bridge.preferred" });
    const nonOperating = at(stageB, "valuation.dcf.bridge.nonOperatingComponents") as Json[] | undefined;
    const investments = nonOperating?.find((component) => component.kind === "long-term-investments");
    add({ id: "fv.nonOperatingInvestments", label: "DCF equity bridge long-term investments added back", group: "valuation", value: investments ? num(investments, "value") : null, period: statementDate ? `@${statementDate}` : null, unit: "currency", currency: dcfCurrency, source: "valuation.dcf.bridge.nonOperatingComponents[kind=long-term-investments].value", reportNote: investments ? shorten(String(investments.basis ?? "")) : "no long-term investments are added in this report's bridge" });
  } else if (kind === "excess-return") {
    const asOf = str(stageB, "valuation.excessReturn.asOf") ?? str(stageB, "returns.commonReturnTtm.asOf");
    const commonAsOf = str(stageB, "returns.commonReturnTtm.asOf");
    add({ id: "fv.openingBookValue", label: "Excess-return opening book value", group: "valuation", value: num(stageB, "valuation.excessReturn.openingBookValue.value"), period: asOf ? `@${asOf}` : null, unit: "currency", currency: currentCurrency, source: "valuation.excessReturn.openingBookValue.value", reportNote: shorten(str(stageB, "valuation.excessReturn.openingBookValue.basis") ?? "") || undefined });
    add({ id: "fv.incomeAvailableToCommon", label: "Excess-return TTM income available to common", group: "valuation", value: num(stageB, "returns.commonReturnTtm.incomeAvailableToCommon"), period: commonAsOf ? `TTM-TO:${commonAsOf}` : null, unit: "currency", currency: currentCurrency, source: "returns.commonReturnTtm.incomeAvailableToCommon", reportNote: shorten(str(stageB, "returns.commonReturnTtm.basisText") ?? str(stageB, "returns.commonReturnTtm.withheldReason") ?? "") || undefined });
    add({ id: "fv.dilutedShares", label: "Excess-return per-share divisor (latest weighted-average diluted shares)", group: "valuation", value: num(stageB, "valuation.excessReturn.scenarioEvidence.dilutedShares"), period: asOf ? `LATEST-PERIOD:${asOf}` : null, unit: "shares", currency: null, source: "valuation.excessReturn.scenarioEvidence.dilutedShares", reportNote: num(stageB, "valuation.excessReturn.scenarioEvidence.dilutedShares") === null ? shorten(str(stageB, "fairValue.reasons.0.reason") ?? "") || undefined : undefined });
    add({ id: "fv.payoutRatio", label: "Excess-return year-one payout ratio (common dividends + net buybacks over income to common, up to 3-year average)", group: "valuation", value: num(stageB, "valuation.excessReturn.payoutRatioPct.value"), period: fyPeriod(fyEnd), unit: "%", currency: null, source: "valuation.excessReturn.payoutRatioPct.value", reportNote: shorten(str(stageB, "valuation.excessReturn.payoutRatioPct.basis") ?? str(stageB, "fairValue.reasons.0.reason") ?? "") || undefined });
  } else if (kind === "reit") {
    const ffoNote = reitFfoNote(stageB);
    const reitAsOf = str(stageB, "valuation.reit.asOf");
    const period = fyPeriod(reitAsOf);
    const ffoNotePart = (label: string, pattern: RegExp, id: string) =>
      add({ id, label, group: "valuation", value: noteNumber(ffoNote, pattern), period, unit: "currency", currency: statementCurrency, source: `valuation.reit.notes[FFO] (${label})`, reportNote: ffoNote ? undefined : "no FFO reconstruction note" });
    ffoNotePart("net income", /net income (-?\d+(?:\.\d+)?)/, "fv.ffo.netIncome");
    // computeNareitFfo (src/pipeline/stageB/financialMetrics.ts) adds back either the filer's real-estate depreciation
    // or, when none is tagged, total depreciation and amortization; each is its own figure with its own filed line.
    if (ffoNote && /\breal-estate depreciation and amortization -?\d/.test(ffoNote)) {
      ffoNotePart("real-estate depreciation and amortization", /real-estate depreciation and amortization (-?\d+(?:\.\d+)?)/, "fv.ffo.realEstateDepreciationAmortization");
    } else {
      ffoNotePart("total depreciation and amortization", /total depreciation and amortization (-?\d+(?:\.\d+)?)/, "fv.ffo.depreciationAmortization");
    }
    ffoNotePart("gains on property sales", /gains on property sales (-?\d+(?:\.\d+)?)/, "fv.ffo.gainsOnSale");
    ffoNotePart("impairments", /impairments (-?\d+(?:\.\d+)?)/, "fv.ffo.impairments");
    // The note ends "= <FFO>." and, when approximate, continues " APPROXIMATE: ...".
    const ffoTotal = noteNumber(ffoNote, /= (-?\d+(?:\.\d+)?)\.(?: APPROXIMATE|$)/);
    const ffoPerShare = num(stageB, "valuation.reit.ffoPerShare");
    add({ id: "fv.ffo.shares", label: "FFO per-share divisor (FFO ÷ FFO per share)", group: "valuation", value: ffoTotal !== null && ffoPerShare ? Math.round(ffoTotal / ffoPerShare) : null, period, unit: "shares", currency: null, source: "FFO total in valuation.reit.notes ÷ valuation.reit.ffoPerShare", reportNote: "the divisor is not stored; it is FFO over FFO per share, rounded to a whole share" });
  }

  if (at(stageB, "runway") && at(stageB, "runway") !== null) {
    const liquidAsOf = str(stageB, "runway.liquidAssetsAsOf");
    add({ id: "runway.liquidAssets", label: "Runway liquid assets", group: "valuation", value: num(stageB, "runway.liquidAssets"), period: liquidAsOf ? `@${liquidAsOf}` : null, unit: "currency", currency: currentCurrency, source: "runway.liquidAssets", reportNote: shorten(str(stageB, "runway.liquidAssetsBasis") ?? "") || undefined });
  }
  return figures;
}

/** The FFO reconstruction note ("FFO (...) = net income N + ... depreciation and amortization N ..."), not the other FFO notes. */
export function reitFfoNote(stageB: Json): string | null {
  const notes = (at(stageB, "valuation.reit.notes") as unknown[] | undefined) ?? [];
  return notes.find((note): note is string => typeof note === "string" && /^FFO\b[^=]*= net income -?\d/.test(note)) ?? null;
}

function fallback(stageB: Json): string | undefined {
  const reason = str(stageB, "capital.current.fallbackReason");
  if (reason) return shorten(reason);
  const basis = str(stageB, "capital.current.basis");
  return basis && basis !== "ttm" ? `current capital basis is ${basis}; the figure is not computed for this route` : undefined;
}

function consolidatedWindowNote(stageB: Json): string | undefined {
  const definition = str(stageB, "capital.current.cashBridge.definition") ?? "";
  const match = /Consolidated FCF conversion is withheld because[^.]*\./.exec(definition);
  return match ? shorten(match[0]) : fallback(stageB);
}

/** The DCF runs in the translated currency when the notes say it was translated at one spot rate. */
function dcfValuationCurrency(stageB: Json): string | null {
  const notes = (at(stageB, "valuation.notes") as string[] | undefined) ?? [];
  const translated = notes.find((note) => note.startsWith("Valuation translated at one spot rate"));
  if (!translated) return null;
  const match = /use (\d+(?:\.\d+)?) ([A-Z]{3}) per ([A-Z]{3})/.exec(translated);
  return match ? match[2]! : null;
}

/** The one spot rate a translated DCF states (valuation currency per reporting currency), or null. */
export function dcfTranslationRate(stageB: Json): { rate: number; from: string; to: string; note: string } | null {
  const notes = (at(stageB, "valuation.notes") as string[] | undefined) ?? [];
  const translated = notes.find((note) => note.startsWith("Valuation translated at one spot rate"));
  if (!translated) return null;
  const match = /use (\d+(?:\.\d+)?) ([A-Z]{3}) per ([A-Z]{3})/.exec(translated);
  if (!match) return null;
  return { rate: Number(match[1]), to: match[2]!, from: match[3]!, note: shorten(translated, 200) };
}
