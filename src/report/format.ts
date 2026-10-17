import { z } from "zod";

import { collapseDuplicateLegacyCitationDates } from "@/pipeline/stageC/citations";
import type { TracedNumber } from "@/report/schema";

export const CanonicalFinancialUnitSchema = z.enum([
  "percent",
  "multiple",
  "usd",
  "usd-per-share",
  "large-count",
  "basis-points",
  "years",
  "number",
]);
export type CanonicalFinancialUnit = z.infer<typeof CanonicalFinancialUnitSchema>;

const UNIT_ALIASES: Record<string, CanonicalFinancialUnit> = {
  "%": "percent", pct: "percent", percent: "percent",
  x: "multiple", "×": "multiple", multiple: "multiple",
  usd: "usd", "$": "usd", currency: "usd", usd_large: "usd", "usd-large": "usd", "$_large": "usd",
  "usd/share": "usd-per-share", "$/share": "usd-per-share", "currency/share": "usd-per-share",
  large: "large-count", count_large: "large-count",
  bps: "basis-points",
  years: "years", yr: "years", y: "years",
  "": "number", number: "number", count: "number",
};

export function normalizeFinancialUnit(unit: string): CanonicalFinancialUnit | null {
  const normalized = UNIT_ALIASES[unit.trim().toLowerCase()];
  return normalized && CanonicalFinancialUnitSchema.safeParse(normalized).success ? normalized : null;
}

/**
 * Round half away from zero on the DECIMAL value a figure stands for (D-62).
 * `toFixed` rounds the binary double, so 81,615,000,000 / 1e9 (stored as
 * 81.61499…) printed "81.61" in one table while a recast 81,616 printed
 * "81.62" in the next. Cleaning to 15 significant digits first recovers the
 * decimal the source printed.
 */
export function decimalRound(value: number, digits: number): number {
  if (!Number.isFinite(value) || digits < 0) return value;
  const sign = value < 0 ? -1 : 1;
  const cleaned = Number(Math.abs(value).toPrecision(15));
  const text = String(cleaned);
  const shifted = text.includes("e") ? Math.round(cleaned * 10 ** digits) : Math.round(Number(`${text}e${digits}`));
  return (sign * shifted) / 10 ** digits;
}

export function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return decimalRound(value, digits).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * A GENUINELY US-dollar amount (the Anthropic API cost, a USD-denominated
 * threshold). Never for a company figure: those go through
 * {@link formatMoneyAmount} / {@link formatFinancialValue} with the currency
 * their evidence establishes.
 */
export function formatCurrency(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `$${formatNumber(value, digits)}`;
}

export function formatPct(value: number | null | undefined, digits = 1, signed = false): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${signed && value >= 0 ? "+" : ""}${decimalRound(value, digits).toFixed(digits)}%`;
}

const LARGE_NUMBER_SCALES: readonly [scale: number, suffix: string, digits: number][] = [
  [1e12, "T", 2],
  [1e9, "B", 2],
  [1e6, "M", 2],
  [1e3, "K", 1],
];

/**
 * Compact magnitude ("$60.96B"). The scale is chosen on the ROUNDED mantissa,
 * largest first, so it never reaches 1000: 999,996,000,000 prints "1.00T",
 * not "1000.00B", and 999,999.999 prints "1.00M", not "1000.0K".
 *
 * `wholeAtScale` (D-67, report money): an amount that is a whole number at
 * its scale prints without decimals ("959M", "279B"); "$959.00M" claimed a
 * precision the filing's "$959 million" never stated. Only an exact whole
 * mantissa is shortened, so 1,000,400,000 still prints "1.00B". Charts and
 * share counts keep the fixed digits.
 */
export function formatLargeNumber(value: number | null | undefined, wholeAtScale = false): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  for (const [scale, suffix, digits] of LARGE_NUMBER_SCALES) {
    const mantissa = decimalRound(abs / scale, digits).toFixed(digits);
    if (Number(mantissa) >= 1) {
      const exact = Number((abs / scale).toPrecision(15));
      return `${sign}${wholeAtScale && Number.isInteger(exact) ? String(exact) : mantissa}${suffix}`;
    }
  }
  return `${sign}${decimalRound(abs, 2).toFixed(2)}`;
}

export function formatMultiple(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "n/m";
  return `${decimalRound(value, digits).toFixed(digits)}×`;
}

/**
 * Render a monetary magnitude in its ACTUAL currency.
 *
 * The canonical unit is named "usd" for historical reasons, but the figure it
 * carries is denominated in the statements' reportedCurrency — TWD for TSM, CHF
 * for Nestlé. Printing those with a "$" is a false statement about the number,
 * not a formatting nit. A non-USD code is appended (ISO-4217) rather than
 * guessed at a symbol, because symbols are ambiguous across currencies ($ alone
 * is used by a dozen of them).
 *
 * The currency must be ESTABLISHED ({@link establishedCurrency}); anything
 * else prints "(currency unknown)". There is no legacy-dollar default: no
 * report spec version was a USD-only contract, and the pipeline has served
 * non-US filers throughout, so a figure that does not say its currency is not
 * known to be in dollars.
 */
function formatMoney(value: number, currency: string | null, large: boolean): string {
  return withCurrency(large ? formatLargeNumber(value, true) : formatNumber(value, 2), currency);
}

/**
 * D-62: a negative amount leads with a true minus sign before the currency
 * ("−$7.35B", "−7.35B TWD"); "$-7.35B" put the sign inside the amount.
 */
function withCurrency(magnitude: string, currency: string | null): string {
  const code = (currency ?? "").trim().toUpperCase();
  const negative = magnitude.startsWith("-");
  const sign = negative ? "−" : "";
  const body = negative ? magnitude.slice(1) : magnitude;
  if (code === "USD") return `${sign}$${body}`;
  if (!ISO_CODE.test(code)) return `${sign}${body} (currency unknown)`;
  return `${sign}${body} ${code}`;
}

const ISO_CODE = /^[A-Z]{3}$/;

/**
 * The ISO code a unit string names itself ("USD", "TWD/share"), else null.
 * Case-sensitive on purpose: the lowercase canonical names ("usd", "usd/share",
 * "usd_large") and "currency" are historical spellings of "some currency",
 * not of US dollars (see {@link formatMoney}). Same rule as the provenance
 * layer's canonicalizeTracedUnit.
 */
export function unitCurrency(unit: string): string | null {
  return /^([A-Z]{3})(?:\/share)?$/.exec(unit.trim())?.[1] ?? null;
}

/**
 * A figure's ESTABLISHED currency: its own ISO `currency` field, else the ISO
 * code its unit names. Null when neither establishes one, or when the two
 * disagree (a figure cannot be in two currencies). Stored values are read, not
 * rewritten; an absent field is simply no evidence.
 */
export function establishedCurrency(unit: string, currency: string | null | undefined): string | null {
  const code = typeof currency === "string" ? currency.trim().toUpperCase() : "";
  const field = ISO_CODE.test(code) ? code : null;
  const fromUnit = unitCurrency(unit);
  if (field !== null && fromUnit !== null && field !== fromUnit) return null;
  return field ?? fromUnit;
}

/**
 * A plain money amount at a chosen precision, in its ACTUAL currency — the
 * same rule as {@link formatMoney}, for figures rendered outside a
 * TracedNumber (the DCF sensitivity grid, whose cells are bare numbers in the
 * currency of `valuation.dcf.perShare`). Pass the ESTABLISHED currency.
 */
export function formatMoneyAmount(
  value: number,
  currency: string | null,
  digits = 2,
): string {
  return withCurrency(formatNumber(value, digits), currency);
}

/**
 * Units the pipeline's own payload and score drivers emit that are not
 * canonical financial units: share counts, percentage-point deltas, RSI,
 * ranks, days, quarters and fractions. Rendered on their own terms rather
 * than through the generic "two decimals + unit word" fallback, which printed
 * a share count as "15,204,000,000.00 shares" and an RSI as "55.00 rsi".
 */
function formatPipelineUnit(value: number, unit: string): string | null {
  switch (unit.trim().toLowerCase()) {
    case "shares":
      return `${formatLargeNumber(value)} shares`;
    case "pp":
    case "pp/yr":
      return `${formatNumber(value, 1)} ${unit.trim().toLowerCase()}`;
    case "fraction":
    case "frac":
      return formatPct(value * 100);
    case "z":
      return `${formatNumber(value, 2)} z`;
    case "days":
    case "quarters":
    case "rank":
    case "pctile":
      return `${formatNumber(value, Number.isInteger(value) ? 0 : 1)} ${unit.trim().toLowerCase()}`;
    // D-62: a score, an index reading (RSI) and a 0-100 score carry no
    // unit word a reader needs ("-1.1 score", "40.25 index", "95.00 0-100").
    case "score":
    case "index":
    case "rsi":
      return formatNumber(value, Math.abs(value) >= 10 ? 1 : 2);
    case "0-100":
      return `${formatNumber(value, 0)}/100`;
    default:
      return null;
  }
}

const SCALE_MULTIPLIER: Record<string, number> = {
  thousand: 1e3, thousands: 1e3,
  million: 1e6, millions: 1e6,
  billion: 1e9, billions: 1e9,
  trillion: 1e12, trillions: 1e12,
};
const SCALED_MONEY_UNIT = /^(currency|[A-Z]{3})\s+(thousands?|millions?|billions?|trillions?)\s*:(.*)$/s;

/**
 * The label an explicit excerpt unit carries after its scale ("USD millions:
 * Free cash flow" → "Free cash flow"), or after a leading percent sign ("%
 * Gross margin" → "Gross margin"). Null for an ordinary unit.
 */
export function unitLabel(unit: string): string | null {
  const scaled = SCALED_MONEY_UNIT.exec(unit.trim());
  if (scaled) return scaled[3].trim() || null;
  const percent = /^%\s+(\S.*)$/s.exec(unit.trim());
  return percent ? percent[1].trim() : null;
}

/**
 * A value without the label its unit carries — for a table whose metric
 * column already names it (D-62). Identical to {@link formatFinancialValue}
 * for every unit that carries no label.
 */
export function formatFinancialAmount(value: number, unit: string, currency?: string | null): string {
  const scaled = SCALED_MONEY_UNIT.exec(unit.trim());
  if (scaled) return scaledMoneyAmount(value, scaled[1], scaled[2], currency);
  if (/^%\s+\S/.test(unit.trim())) return formatPct(value);
  return formatFinancialValue(value, unit, currency);
}

/**
 * An excerpt figure printed at a declared scale ("11,063 millions") shown as
 * the compact amount it states ("$11.06B"): D-62 replaced the
 * "$11,063.00 millions" spelling. The stored mantissa is unchanged; a
 * nonzero amount too small for two decimals keeps three significant digits
 * rather than reading as zero.
 */
function scaledMoneyAmount(value: number, code: string, scale: string, currency?: string | null): string {
  if (!Number.isFinite(value)) return "n/a";
  const amount = value * (SCALE_MULTIPLIER[scale.toLowerCase()] ?? 1);
  const established = establishedCurrency(code, currency);
  if (amount !== 0 && Math.abs(amount) < 0.005) {
    return withCurrency(`${amount < 0 ? "-" : ""}${Math.abs(amount).toPrecision(3)}`, established);
  }
  return formatMoney(amount, established, Math.abs(amount) >= 1e6);
}

export function formatFinancialValue(
  value: number,
  unit: string,
  currency?: string | null,
): string {
  // Explicit excerpt units store the printed mantissa at a declared scale.
  // D-62: shown as the compact amount it states, with the label it carries.
  const scaledMoney = SCALED_MONEY_UNIT.exec(unit.trim());
  if (scaledMoney) {
    const label = scaledMoney[3].trim();
    return `${scaledMoneyAmount(value, scaledMoney[1], scaledMoney[2], currency)}${label ? ` (${label})` : ""}`;
  }
  const percentLabel = /^%\s+(\S.*)$/s.exec(unit.trim());
  if (percentLabel) return `${formatPct(value)} (${percentLabel[1].trim()})`;
  const canonical = normalizeFinancialUnit(unit);
  switch (canonical) {
    case "percent": return formatPct(value);
    case "multiple": return formatMultiple(value);
    case "usd": return formatMoney(value, establishedCurrency(unit, currency), Math.abs(value) >= 1e6);
    case "usd-per-share": return formatMoney(value, establishedCurrency(unit, currency), false);
    case "large-count": return formatLargeNumber(value);
    case "basis-points": return `${formatNumber(value, 0)} bps`;
    case "years": return `${formatNumber(value, 1)}y`;
    case "number": return formatNumber(value, Number.isInteger(value) ? 0 : 2);
    default: return formatPipelineUnit(value, unit) ?? `${formatNumber(value)} ${unit}`;
  }
}

/**
 * Stable column identity for a peer metric.
 *
 * Peer tables were rendered POSITIONALLY ("Metric 1", "Metric 2"), so if one
 * peer reported P/E and EV/EBITDA while another reported only EV/EBITDA, the
 * second peer's EV/EBITDA landed under the first peer's P/E column. Different
 * metrics under one header is a false comparison, which is the entire purpose
 * of a peer table. Keying by the metric's own provenance fixes the alignment.
 */
export function peerMetricKey(metric: TracedNumber): string {
  // D-62: a peer's market-cap figure is registered under the PEER's own slug
  // (payload.peers.<symbol>-<name>), so keying by the trailing segment gave
  // every peer its own column — a diagonal table of dashes.
  if (/^payload\.peers\.[^.]+$/.test(metric.source)) return "Market cap";
  const tail = metric.source.split(/[.:/]/).filter(Boolean).pop();
  return tail && tail.length > 0 ? tail : metric.unit;
}

/**
 * Collision-safe column keys for ONE peer row, in order.
 *
 * `peerMetricKey` is NOT injective — two metrics from different sources can
 * share a trailing segment. Keying a row's metrics into a Map by that alone
 * silently DROPPED the earlier of any colliding pair (a peer losing a metric
 * entirely) and, across rows, split one logical metric over two columns. That
 * is worse than the positional layout it replaced, because the loss is
 * invisible. Duplicates within a row are disambiguated by occurrence, so every
 * metric keeps a column and no metric overwrites another.
 */
export function peerColumnKeys(metrics: readonly TracedNumber[]): string[] {
  const seen = new Map<string, number>();
  return metrics.map((metric) => {
    const base = peerMetricKey(metric);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base} (${n + 1})`;
  });
}

export function formatTracedValue(number: TracedNumber): string {
  return formatFinancialValue(number.value, number.unit, number.currency);
}

/** A failed match does not mean a citation was never supplied. */
export function numericCitationTraceLabel(value: TracedNumber["verified"]): string {
  return value === true ? "citation-traced" : value === false ? "untraced" : "not checked";
}

/** Measurement windows are stored evidence; an as-of date cannot supply one. */
export function tracedPeriodLabel(period: TracedNumber["period"], context?: TracedNumber["periodContext"]): string {
  const legacy = period?.trim() ? period : "not supplied";
  if (!context) return legacy;
  const boundaries = context.kind === "instant" ? `instant at ${context.at}` : `duration ${context.start} to ${context.end}`;
  return `${legacy}; ${boundaries}${context.basis ? `; ${context.basis}` : ""}${context.fiscalLabel ? `; ${context.fiscalLabel}` : ""}`;
}

/** Format machine-oriented verification-log claims for human display. */
export function formatVerificationClaim(value: string): string {
  const normalized = collapseDuplicateLegacyCitationDates(value);
  const match = /^(-?\d+(?:\.\d+)?)\s+(USD(?:\/share)?)(\s+\[[\s\S]+\])$/.exec(normalized);
  if (!match) return normalized;
  return `${formatFinancialValue(Number(match[1]), match[2])}${match[3]}`;
}

const COST_DIGITS = 6;
export function roundedDisplayedCost(value: number): number {
  return Number(value.toFixed(COST_DIGITS));
}
export function roundedDisplayedCostTotal(values: readonly number[]): number {
  return roundedDisplayedCost(values.reduce((sum, value) => sum + roundedDisplayedCost(value), 0));
}
export function formatCostUsd(value: number): string {
  return `$${roundedDisplayedCost(value).toFixed(COST_DIGITS)}`;
}
