/**
 * Stage C — Context payload assembly.
 *
 * assembleContextPayload(bundle, computed, validation) produces a DETERMINISTIC,
 * cache-friendly structured object containing EVERYTHING the LLM is allowed to
 * use, and NOTHING else. serializePayloadForPrompt(payload) renders it to a
 * clean, sectioned, LLM-readable text block where every number carries its
 * "[source · as-of]" provenance tag — this is the exact string that gets
 * prompt-cached and cited/traced by the verifier.
 *
 * Determinism is load-bearing for prompt caching and the Anthropic API
 * contract: NO Date.now(), NO UUIDs, NO timestamps sourced from the
 * clock, stable key order everywhere. The payload's own `builtAt`-derived asOf
 * dates come from the bundle (fiscal period ends), not from wall-clock reads
 * here. Given identical (bundle, computed, validation) inputs, this module
 * emits byte-identical output and a stable {@link payloadFingerprint}.
 *
 * Provenance is the whole point (rules #1 and #5): every figure in
 * the serialized payload appears as `value [source · as-of]` so the LLM can
 * cite it and the verification pass can trace it back. This module is the
 * single authority on WHAT the model may see; the prompts (prompts.ts) enforce
 * HOW it must use it.
 *
 * Pure: no network, no DB, no LLM, no clock. Server-safe (imports only Stage A/B
 * types + the report schema types), but importable anywhere since it never
 * touches provider clients.
 */

import type { ManifestEntry } from "@/types/core";
import { quotePriceObservationDay } from "@/providers/fmp";
import { selectedGeographyNotes } from "@/edgar/annualGeography";
import { PeriodContextSchema, type PeriodContext } from "@/types/periodContext";
import type { DataBundle } from "@/pipeline/types";
import { CORE_SERIES, fredFigureUnit, type FredUnits } from "@/providers/fred";
import { establishedCurrencyOn, statementCurrencyEvidence, statementCurrencies, type ComputedMetrics } from "@/pipeline/compute";
import { admitDebtFields, debtPresentationSections } from "@/edgar/financialEnrichment";
import { confirmedIssuerFacts } from "@/edgar/issuerFacts";
import { incompleteLeaseCoverage } from "@/pipeline/stageB/leaseScope";
import { inheritedIssuerCurrency, providerRowCurrency, type InheritedIssuerCurrency } from "@/pipeline/estimateCurrency";
import type { ValidationReport } from "@/pipeline/stageA/validate";
import type { DegradationPlan } from "@/pipeline/stageB/sectorRouting";
import { HTM_LOSS_TAX_RATE_PCT } from "@/pipeline/stageB/financialMetrics";
import { PIOTROSKI_SIGNAL_LABELS, type PiotroskiSignalName } from "@/pipeline/stageB/forensics";
import { describeFinancialValuation } from "@/pipeline/stageB/valuationAssumptions";
import type { FilingDisclosures, GuidanceRow, TracedNumber } from "@/report/schema";
import { buildFilingDisclosures, residualNote } from "@/pipeline/filingDisclosures";
import { peerSizeExclusion } from "@/pipeline/peers";
import { consensusYearsText } from "@/pipeline/stageB/valuation";
import { isoFromMonthDate, materialCreditSupportClauses } from "@/edgar/currentReports";
import { periodicControlsText, periodicSignatureText } from "@/edgar/extract";
import { buildScenarioPresentation, comparableScenarioPrice } from "@/report/scenarioPresentation";
import {
  PROJECTION_PATH_ORDER,
  SCORE_ASPECT_ORDER,
  orderedProjectionSeries,
  admittedProjectionPoints,
  projectionAvailability,
  projectionDisplayAssumptions,
  projectionCellPoint,
  projectionPeriodRows,
} from "@/report/surfaceManifest";
import {
  canonicalizeTracedUnit,
  isIsoDate,
  validateCitationRegistry,
  validateProvenanceRegistry,
  type CitationProvenanceRecord,
  type NumericProvenanceRecord,
} from "@/pipeline/stageC/provenance";
import { proseNumbers } from "@/pipeline/stageC/consistency";
import { selectMaterialEvidence, type EvidenceProfile, type EvidenceSpan, type EvidenceCoverage } from "@/pipeline/stageC/evidenceSelection";
import type {
  FmpBalanceSheetRow,
  FmpCashFlowRow,
  FmpIncomeStatementRow,
  FmpRawRow,
  FmpStatementRow,
} from "@/providers/fmp";

/* ------------------------------------------------------------------------ *
 * Token budgets (char-based approximations — cheap, deterministic).
 *
 * We budget by CHARACTER count, not tokens: a token count would require a
 * model-specific tokenizer (unavailable offline) and would make the payload
 * model-dependent, breaking determinism. ~4 chars/token is the standard rough
 * ratio, so the 18K-char transcript budget below ≈ 4.5K tokens — inside the
 * SPEC's "~15-20k chars" transcript budget. Every truncation is DISCLOSED
 * inline: the text excerpts carry a marker, and the news section carries a
 * note when rows were clipped or dropped.
 * ------------------------------------------------------------------------ */

export const PAYLOAD_BUDGETS = {
  /** Latest earnings-call transcript text (~15-20k chars). */
  transcriptChars: 18_000,
  /**
   * Annual risk-factors excerpt: 10-K Item 1A or 20-F Item 3.D. D-63: this is
   * the floor; a long section keeps `item1aLongShare` of its length, up to
   * `item1aMaxChars` (NVDA's 114,916-char Item 1A kept 12% under the flat cap).
   */
  item1aChars: 14_000,
  item1aMaxChars: 24_000,
  item1aLongShare: 0.2,
  /** D-63: annual business description — 10-K Item 1 or 20-F Item 4. */
  businessChars: 12_000,
  /**
   * D-63: the latest 10-Q's notes to the financial statements (Part I Item 1).
   * D-66: 14,000 (was 12,000): a quarter of it now goes first to the quantified
   * customer concentration, payment terms and end-customer statements, which
   * the families had left out (3 of 16 concentration passages kept).
   */
  tenQNotesChars: 14_000,
  /** D-66: the 10-K's notes (business combinations, goodwill, investments, commitments, segment footnotes). */
  tenKNotesChars: 10_000,
  /** D-66: the latest 10-Q's Part II Item 5 (Rule 10b5-1 trading arrangements), normally kept whole. */
  tenQOtherChars: 2_500,
  /** Annual review excerpt: 10-K Item 7 or 20-F Item 5. */
  mdnaChars: 14_000,
  /**
   * 10-Q Part I Item 2 (MD&A) excerpt. D-63: 8,000 dropped 81% of NVDA's
   * latest-quarter MD&A, including the H200 inventory charge and the
   * Hyperscale/ACIE recast; it is the most current narrative the filings give.
   */
  tenQMdnaChars: 12_000,
  /** Free-text news/press snippet total (many small rows). */
  newsChars: 6_000,
  /** Annual statement periods kept in the compact extract (last 5). */
  annualPeriods: 5,
  /** Quarterly statement periods kept in the compact extract (last 4). */
  quarterlyPeriods: 4,
  /** Rows kept for list-shaped sources (insiders, holders, peers, estimates). */
  listRows: 12,
  /**
   * Latest 8-K EX-99.1 earnings-release narrative (outlook, highlights). D-63:
   * 5,000 dropped 4,096 of NVDA's 8,593-char Q2 FY2027 narrative, and the
   * report then said what it held was "not in the filings".
   */
  earningsReleaseChars: 9_000,
  /**
   * Latest 8-K EX-99.2 CFO commentary narrative (drivers, commitments, cash
   * flow). D-63: 7,000 dropped the balance-sheet paragraph (DSO 60 vs 45 days,
   * receivables, inventory ahead of Vera Rubin, cash taxes) that explains the
   * quarter's operating-cash-flow drop.
   */
  cfoCommentaryChars: 11_000,
  /** One ordinary material-event 8-K's item text. */
  eightKEventChars: 1_200,
  /** Credit-support agreements retain named parties, caps, options and contractual offsets. */
  eightKCreditEventChars: 1_800,
  /** All material-event 8-K excerpts together. */
  eightKEventsTotalChars: 8_600,
} as const;

/** Marker appended when a text field was truncated to its budget. */
export const TRUNCATION_MARKER = "…[TRUNCATED";

/* ------------------------------------------------------------------------ *
 * Payload types
 * ------------------------------------------------------------------------ */

/**
 * A single figure with its provenance. `source` is a payload path or provider
 * tag the verifier can trace (e.g. "computed.growth.revenueCagr5y",
 * "fmp:income-statement", "edgar:10-K item1A", "fred:DGS10"); `asOf` is the ISO
 * date the figure is as-of, or null for a timeless/derived quantity.
 */
export interface PayloadFigure {
  /** Exact registry ID for numeric figures emitted by payload assembly. */
  provenanceId?: string;
  label: string;
  value: number | string | null;
  unit: string;
  currency: string | null;
  /**
   * D-57: the row carries no currency of its own and `currency` is the
   * issuer's, inherited. Rendered "(USD, inherited)" and kept on the record.
   */
  currencyInherited?: true;
  period: string | null;
  periodContext?: PeriodContext;
  /** Issuer fiscal label explicitly carried by a source row; never inferred from calendar year. */
  fiscalPeriod?: string;
  /** Exact person named by a parsed appointment-package disclosure. */
  subject?: string;
  source: string;
  asOf: string | null;
}

/** A labelled group of figures rendered as one block in the prompt. */
export interface PayloadSection {
  title: string;
  /** Stable-ordered figures. */
  figures: PayloadFigure[];
  /** Optional free-text notes (methodology/gaps) rendered under the figures. */
  notes: string[];
}

/** A compact statement extract: one line item across periods. */
export interface StatementLineExtract {
  lineItem: string;
  unit: string;
  source: string;
  /** period label (fiscal period end ISO) -> value; null when undisclosed. */
  byPeriod: StatementCell[];
}

export interface StatementCell {
  period: string;
  periodContext?: PeriodContext;
  /** Field/row evidence overrides the statement envelope for mixed sources. */
  source?: string;
  /**
   * The issuer's own label for the column ("FY2025", "Q1 FY2026"), from the
   * row's `fiscalYear`/`period`. Not rendered; the verifier reads a fiscal
   * spelling of `period` against it.
   */
  fiscalPeriod?: string;
  value: number | null;
  currency: string | null;
  asOf: string;
  provenanceId?: string;
}

export interface StatementExtractBlock {
  title: string;
  /** Fiscal period ends covered (newest first), for the header. */
  periods: string[];
  lineItems: StatementLineExtract[];
  notes: string[];
}

/** A budgeted text excerpt with its provenance and truncation disclosure. */
export interface TextExcerpt {
  title: string;
  text: string;
  source: string;
  asOf: string | null;
  /** True when {@link PAYLOAD_BUDGETS} forced a truncation (disclosed inline). */
  truncated: boolean;
  /** Original character length before truncation (0 when absent). */
  originalChars: number;
  /** Exact retained source passages; offsets refer to the original source text. */
  spans?: EvidenceSpan[];
  /** A keyword family being retained does not imply all of its passages survived. */
  coverage?: EvidenceCoverage;
  /** Retained authority and observation context for an official company statement. */
  sourceEvidence?: { kind: "issuer-statement"; publishedAt: string; observedAt: string; sourceHash: string; authorityChain: string[] };
}

/**
 * The complete context payload. Field order is fixed and every array is
 * deterministically ordered by the assembler, so `JSON.stringify(payload)` and
 * {@link serializePayloadForPrompt} are byte-stable for identical inputs.
 */
export interface ContextPayload {
  /** Spec-pinned payload format version (bump on shape changes). */
  payloadVersion: string;
  /** Exact numeric evidence available to the deterministic verifier. */
  provenanceRegistry?: NumericProvenanceRecord[];
  /** Exact non-numeric payload source/date tags available for prose claims. */
  citationRegistry?: CitationProvenanceRecord[];
  symbol: string;
  companyName: string | null;
  /** Sector route + overlays (drives which metrics are meaningful). */
  route: {
    base: string;
    overlays: string[];
    sector: string | null;
    industry: string | null;
  };
  /** Quote snapshot (price + as-of) — the anchor for all valuation framing. */
  quote: PayloadSection;
  /** Every Stage B computed metric block, with provenance/as-of. */
  computed: PayloadSection[];
  /** Compact statement extracts (annual + quarterly key line items). */
  statements: StatementExtractBlock[];
  /**
   * Eight-quarter trend, segment growth and guidance-vs-actual, computed from
   * the statements, the periodic XBRL and the earnings releases. Optional:
   * absent when the bundle carries none of that evidence.
   */
  quarterlyTrend?: PayloadSection;
  /** Segment revenue by quarter from the latest 10-Q/10-K XBRL instances. */
  segmentRevenue?: PayloadSection;
  /** Guidance, issuer-defined FCF and capital return from the latest 8-K EX-99 release. */
  issuerFilings?: PayloadSection;
  /** D-66: facts the 10-Q/10-K notes and statements and the CFO commentary print beyond the typed statements. */
  filingFacts?: PayloadSection;
  /** Analyst estimates / price-target consensus / grades summary. */
  estimates: PayloadSection;
  /** Peer set (symbol + name + headline size). */
  peers: PayloadSection;
  /** Insider trades + insider statistics + Finnhub MSPR sentiment. */
  insiders: PayloadSection;
  /** 13F institutional positions summary + top holders. */
  institutional: PayloadSection;
  /** Executives + compensation (leadership-grading inputs). */
  leadership: PayloadSection;
  /** Short interest + days-to-cover. */
  shortInterest: PayloadSection;
  /** Segmentation (product + geographic), as-reported free-text keys. */
  segments: PayloadSection;
  /** Macro series latest values (core + sector-mapped). */
  macro: PayloadSection;
  /** Latest earnings-call transcript (budgeted). */
  transcript: TextExcerpt | null;
  /** Annual risk/review + 10-Q MD&A excerpts (budgeted). */
  filings: TextExcerpt[];
  /** Recent news / press-release snippets (budgeted, for catalyst context). */
  news: PayloadSection;
  /** Stage A validation checks that failed or were skipped (data-quality signal). */
  validationFlags: string[];
  /** The missing-data manifest — gaps are DISCLOSED, never filled (rule #4). */
  missingData: ManifestEntry[];
  /** Provider provenance for the appendix (dot-path -> as-of). */
  asOfMap: Record<string, string>;
}

/**
 * Current payload format version.
 *
 * 1.4.0 (2026-09-30, currency integrity): each money figure is rendered with
 * its currency or "(currency unknown)", and the provenance registry holds a
 * money figure only when its own evidence establishes the currency (no
 * payload-wide listing-currency default; estimates only in their own).
 *
 * 1.5.0 (2026-09-30, stock-split correctness): EPS, share counts, market
 * values and per-share figures appear only where their split basis is
 * established, and read "n/a" otherwise; an analyst or judge pass stored under
 * 1.4.0 carries a 1.4.0 fingerprint and is never resumed under 1.5.0.
 */
// 1.6.0 (2026-10-02): currency-safe own-history bands, dated ROE and REIT
// approximation disclosures change the financial evidence sent to analysts.
// A pass stored under 1.5.0 must not resume with these changed conventions.
// 1.7.0 (D-34): bank evidence routing, common-equity/return pairing, and
// financial-route metric applicability. Older analyst work must be regenerated.
// Calendar-bounded beta and inclusive reverse-DCF roots change financial evidence.
// Partial analyst work from the prior conventions must not be reused.
// 1.9.0 (audit follow-up 2026-10-04): acceleration horizons and date validity
// change financial evidence; do not resume partial passes under prior rules.
// 1.10.0 (recommendation review 2026-10-04): completed-session beta and
// calendar-aligned FRED lags change evidence; prior partial passes cannot resume.
// 1.11.0 (D-39, 2026-10-05): growth-anchor CAGR span rule changes the DCF
// evidence sent to analysts; prior partial passes cannot resume.
// 1.12.0 (D-42..D-45, 2026-10-13): a bank's EDGAR tangible equity deducts its
// carrying-value preferred and all non-goodwill intangibles; every printed tag
// is citable (gap / unestablished kinds, manifest tags, the weights row); the
// next earnings date is shown; completeness and indicator units have their
// own rows. Analyst work written against the 1.11.0 evidence cannot resume.
// 1.13.0 (D-49, D-48, 2026-10-13): the aspect scores the analysts anchor to
// come from band table SCORE_BANDS_2026_10, which scores annualized weighted-average
// diluted common-share change and the SBC charge once each and grades technicals on 12-1 month
// relative strength; the technicals rows add that window and the displayed
// 6-month window vs SPY. Prior partial passes cannot resume.
// 1.14.0 (D-46, 2026-10-13): a bank's balance-sheet score is graded on capital,
// credit and funding, and a bank payload gains the section of route metrics it
// is computed from. Prior partial passes cannot resume. D-47 (same 1.14.0)
// adds the display-only HTM, reserve and loan-growth rows and the warning signs.
// 1.15.0 (review of D-46..D-50, 2026-10-13): the technicals score reads the
// distance below the 52-week high (driver pctFromHigh52w, not position52w); a
// bank's loan ratios divide by gross loans first; the bank capital note and
// tangible-leverage caveat no longer call the house cut point a regulatory
// line. Prior partial passes cannot resume.
// 1.17.0 combines both 1.16.0 branches: section-aware source spans and omissions,
// metric-labelled numeric prose evidence, current financial bridges, explicit
// accrual operands, flat-share/alternative EPS evidence, deterministic scenario
// interpretation, and comparable-peer evidence. Older passes cannot resume.
// 1.19.0 (D-54): equity-only FFO/AFFO comparisons are withheld when the REIT
// subtype is unknown; prior context cannot resume as the same convention.
// 1.20.0 (D-55): reconciled financial bridges, signed equity-method income,
// material filing context and distinct filing dates; prior passes cannot resume.
// 1.22.0 (D-56 review): actual envelope/row/field statement origins; passes
// built under normalized FMP-only origin labels cannot resume as equivalent.
// 1.23.0 (D-57, D-58): estimates, targets, peer caps and pay inherit the
// issuer currency when reporting and listing agree; the DCF evidence sent to
// analysts changes with the year-one anchor. Prior passes cannot resume.
// 1.23.0 (NVDA report #34 audit, work package 3): 8-K earnings-release and
// CFO-commentary evidence (guidance, issuer FCF, capital return), dated
// material-event 8-K excerpts, XBRL segment revenue by quarter and the
// eight-quarter trend. Passes built without that evidence cannot resume.
// The combined 1.23.0 carries both sets of evidence (NVDA audit integration).
// 1.24.0 (D-65..D-68): consensus/calendarization and equity-bridge conventions,
// typed filing facts and governance disclosures, bounded verifier matching,
// and corrected forensic notes. Prior analyst/judge artifacts cannot resume.
// 1.24.1 (D-72): revised financial evidence and source-bound filing facts.
// 1.24.2 (D-73): incomplete debt is withheld, including downstream valuation
// context. Analysts from earlier conventions cannot resume as equivalent.
// 1.25.0 (D-78): ownership-specific earnings rows, class/EV scope and current
// source form/exhibit context change analyst evidence; prior passes cannot resume.
// Primary disclosure composition and quote measurement dates change the
// admitted model context; earlier evidence fingerprints cannot resume.
// 1.28.0 (D-81): complete passage-level applicability, price-unit MACD and
// admitted per-multiple bases change the analyst context. Earlier reusable
// analyst/judge passes cannot resume as equivalent; completed reports stay readable.
// D-83: quarter-sum EPS basis and changed grade-override prompt contract.
// 1.29.1 (D-84): common-cash refusals cannot become zero-payout observations.
// 1.30.0 (D-86): retain source-bound fiscal payment buckets and unknown funding scope.
// 1.30.1 (D-85): distinguish earnings allocation from cash and retain actual source scope.
// 1.31.0 (D-87): source-bound accounting and retained critical filing context.
// 1.32.0 (D-88): preserve sourced duration intervals and final gap evidence.
export const PAYLOAD_VERSION = "1.32.0" as const;

/* ------------------------------------------------------------------------ *
 * Small pure helpers
 * ------------------------------------------------------------------------ */

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function numOrNull(v: unknown): number | null {
  return isNum(v) ? v : null;
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function isoDay(v: unknown): string | null {
  const s = strOrNull(v);
  return s ? s.slice(0, 10) : null;
}

function isoCurrency(v: unknown): string | null {
  const currency = typeof v === "string" ? v.trim().toUpperCase() : null;
  return currency !== null && /^[A-Z]{3}$/.test(currency) ? currency : null;
}

type PayloadFigureInput = Omit<PayloadFigure, "currency" | "period"> &
  Partial<Pick<PayloadFigure, "currency" | "period">>;

function payloadSection(
  input: Omit<PayloadSection, "figures"> & { figures: PayloadFigureInput[] },
): PayloadSection {
  return {
    ...input,
    figures: input.figures.map((figure) => ({
      ...figure,
      currency: figure.currency ?? null,
      period: figure.period ?? null,
    })),
  };
}

/** Round a number to at most `dp` decimals without trailing-zero noise. */
function round(v: number, dp = 4): number {
  return Number(v.toFixed(dp));
}

/**
 * Truncate `text` to `maxChars`, appending a disclosure marker that states how
 * many characters were dropped. Deterministic — no clock, no randomness.
 */
export function truncateWithDisclosure(
  text: string,
  maxChars: number,
): { text: string; truncated: boolean; originalChars: number } {
  const originalChars = text.length;
  if (originalChars <= maxChars) {
    return { text, truncated: false, originalChars };
  }
  const dropped = originalChars - maxChars;
  const full = `\n\n${TRUNCATION_MARKER} ${dropped} of ${originalChars} chars omitted to fit the payload budget]`;
  // Reserve room for the marker so the total stays within budget. When the
  // budget cannot hold the counted marker plus any text, fall back to the bare
  // marker — still visibly cut, and never longer than the budget it was given
  // (audit 2026-09-06, F165: a marker-only result used to exceed `maxChars`).
  const marker = maxChars >= full.length + 1 ? full : `${TRUNCATION_MARKER}]`.slice(0, Math.max(0, maxChars));
  const keep = Math.max(0, maxChars - marker.length);
  return { text: text.slice(0, keep) + marker, truncated: true, originalChars };
}

/**
 * The part of an excerpt a cited number may be read against (D-45): the text
 * the model was shown, minus the truncation marker this assembler appended —
 * the marker's own counts ("12,345 of 98,765 chars omitted") are not
 * evidence. An untruncated excerpt is returned whole.
 */
export function excerptBodyForVerification(excerpt: TextExcerpt): string {
  if (!excerpt.truncated) return excerpt.text;
  const at = excerpt.text.lastIndexOf(TRUNCATION_MARKER);
  return at < 0 ? excerpt.text : excerpt.text.slice(0, at).replace(/\s+$/, "");
}

/** Render a figure's provenance tag: "[source · as-of]" or "[source]". */
export function provenanceTag(source: string, asOf: string | null): string {
  return asOf ? `[${source} · ${asOf}]` : `[${source}]`;
}

/**
 * Render one figure as `label: value unit [source · as-of]`. Null values are
 * rendered as `n/a` (a disclosed gap, not an omission) so the model never sees
 * a fabricated number in place of a real absence.
 */
export function formatFigure(f: PayloadFigure): string {
  const val =
    f.value === null
      ? "n/a"
      : typeof f.value === "number"
        ? String(round(f.value))
        : f.value;
  const unit = f.unit && f.value !== null ? ` ${f.unit}` : "";
  // A money figure states its currency, or that it is unknown — the model is
  // never left to assume one (the listing's, or dollars).
  const canonical = f.value === null ? null : canonicalizeTracedUnit(f.unit, null);
  const monetary = canonical?.unit === "currency" || canonical?.unit === "currency-per-share";
  const currency = monetary && canonical?.currency === null
    ? ` (${f.currency === null ? "currency unknown" : f.currencyInherited ? `${f.currency}, inherited` : f.currency})`
    : "";
  const periodContext = f.periodContext === undefined ? "" : ` periodContext=${JSON.stringify(f.periodContext)}`;
  return `${f.label}: ${val}${unit}${currency} ${provenanceTag(f.provenanceId ?? f.source, f.asOf)}${periodContext}`;
}

/* ------------------------------------------------------------------------ *
 * Bundle unwrap helpers (every bundle member is a FetchResult<...>)
 * ------------------------------------------------------------------------ */

function rowsOf<TRow extends FmpRawRow>(f: {
  ok: boolean;
  value?: { data: { rows: TRow[] } };
}): TRow[] {
  return f.ok && f.value ? f.value.data.rows : [];
}

function firstRow<TRow extends FmpRawRow>(f: {
  ok: boolean;
  value?: { data: { rows: TRow[] } };
}): TRow | null {
  const rows = rowsOf(f);
  return rows[0] ?? null;
}

/* ------------------------------------------------------------------------ *
 * Section builders — each returns a deterministically ordered PayloadSection.
 * ------------------------------------------------------------------------ */

/** The quote is in the listing's trading currency. */
function quoteSection(bundle: DataBundle, currency: string | null): PayloadSection {
  const q = firstRow(bundle.quote);
  const asOf = quotePriceObservationDay(q);
  const figures: PayloadFigureInput[] = [
    { label: "price", value: numOrNull(q?.price), unit: "currency/share", currency, source: "fmp:quote", asOf },
    { label: "marketCap", value: numOrNull(q?.marketCap), unit: "currency", currency, source: "fmp:quote", asOf },
    { label: "dayLow", value: numOrNull(q?.dayLow), unit: "currency/share", currency, source: "fmp:quote", asOf },
    { label: "dayHigh", value: numOrNull(q?.dayHigh), unit: "currency/share", currency, source: "fmp:quote", asOf },
    { label: "yearLow", value: numOrNull(q?.yearLow), unit: "currency/share", currency, source: "fmp:quote", asOf },
    { label: "yearHigh", value: numOrNull(q?.yearHigh), unit: "currency/share", currency, source: "fmp:quote", asOf },
    { label: "volume", value: numOrNull(q?.volume), unit: "shares", source: "fmp:quote", asOf },
  ];
  return payloadSection({ title: "Quote", figures, notes: q && asOf === null ? ["Price observation date unavailable; source retrieval time does not establish the quote session."] : [] });
}

/**
 * The currency each group of computed money figures is established in, each
 * from its own evidence. There is no default: a registry-wide fallback to the
 * profile's TRADING currency once stamped statement-derived values (a DCF per
 * share, an FCF, projections) as the listing's currency even when the
 * statements carried none, or carried another (an ADR). A figure whose group
 * has no established currency stays unknown and is not registered.
 */
interface ComputedCurrencies {
  /** Price-derived figures (technicals): the listing's trading currency. */
  trading: string | null;
  /** Values the Stage B model computed (DCF / excess-return per share, BV0). */
  model: string | null;
  /** The latest annual FCF: the cash-flow row it was computed from. */
  fcf: string | null;
  /** Runway burn: the burn-window quarters' one shared label. */
  runwayBurn: string | null;
  /** Runway liquidity: the balance row it was read from. */
  runwayLiquidity: string | null;
  forensics: string | null;
}

/** The one ISO code every row carries, or null when any row lacks it or two differ. */
function sharedRowCurrency(rows: readonly FmpRawRow[]): string | null {
  const codes = new Set(rows.map((r) => isoCurrency(r.reportedCurrency)));
  if (rows.length === 0 || codes.size !== 1 || codes.has(null)) return null;
  return [...codes][0] ?? null;
}

function rowsOn(rows: readonly FmpRawRow[], date: string | null): FmpRawRow[] {
  return date === null ? [] : rows.filter((r) => isoDay(r.date) === date);
}

function computedCurrencies(bundle: DataBundle, computed: ComputedMetrics): ComputedCurrencies {
  const currencies = statementCurrencies(bundle);
  const fcfSeries = computed.capital.fcf.series;
  const fcfDate = isoDay(fcfSeries[fcfSeries.length - 1]?.date);
  const rw = computed.runway;
  const cashflowQuarterly = rowsOf(bundle.statements.cashflowQuarterly);
  const burnRows = (rw?.burnWindowDates ?? []).flatMap((d) => rowsOn(cashflowQuarterly, isoDay(d)));
  const accrualDates = [computed.forensics.accruals?.asOf.current ?? null, computed.forensics.accruals?.asOf.prior ?? null];
  return {
    trading: currencies.trading,
    model: currencies.model,
    // Several rows sharing the date (a restatement) must agree.
    fcf: sharedRowCurrency(rowsOn(rowsOf(bundle.statements.cashflowAnnual), fcfDate)),
    runwayBurn:
      rw !== null && burnRows.length === rw.burnWindowDates.length ? sharedRowCurrency(burnRows) : null,
    runwayLiquidity: sharedRowCurrency([
      ...rowsOn(rowsOf(bundle.statements.balanceQuarterly), rw?.liquidAssetsAsOf ?? null),
      ...rowsOn(rowsOf(bundle.statements.balanceAnnual), rw?.liquidAssetsAsOf ?? null),
    ]),
    forensics: sharedRowCurrency(accrualDates.flatMap((date) => [
      ...rowsOn(rowsOf(bundle.statements.incomeAnnual), date),
      ...rowsOn(rowsOf(bundle.statements.balanceAnnual), date),
      ...rowsOn(rowsOf(bundle.statements.cashflowAnnual), date),
    ])),
  };
}

/** Bank route metrics shown to the analysts, in display order (D-46). */
const BANK_PAYLOAD_METRICS = [
  "tangibleLeverage",
  "ncoToAverageLoans",
  "nplRatio",
  "loansToDeposits",
  "cet1Reported",
  // D-47: display only, never graded.
  "htmUnrealizedLossNet",
  "htmLossAfterTax",
  "htmLossToTce",
  "markedTceRatio",
  "aclToLoans",
  "loanCagr3y",
] as const;

/** Stage B computed-metrics sections — the analytical spine of the payload. */
function computedSections(
  computed: ComputedMetrics,
  currencies: ComputedCurrencies,
  currentPrice: number | null,
): PayloadSection[] {
  const sections: PayloadSection[] = [];
  const g = computed.growth;
  const gAsOf = g.asOf;

  // --- Growth --------------------------------------------------------------
  const growthFigures: PayloadFigureInput[] = [];
  for (const c of g.revenueCagrs) {
    growthFigures.push({
      label: `revenue CAGR ${c.windowYears}y`,
      value: c.cagrPct,
      unit: "%",
      source: "computed.growth.revenueCagrs",
      asOf: c.endDate,
    });
  }
  for (const c of g.epsDilutedCagrs) {
    growthFigures.push({
      label: `diluted EPS CAGR ${c.windowYears}y`,
      value: c.cagrPct,
      unit: "%",
      source: "computed.growth.epsDilutedCagrs",
      asOf: c.endDate,
    });
  }
  for (const c of g.fcfCagrs) {
    growthFigures.push({
      // D-60: the CAGR runs on the vendor before-SBC free cash flow, unlike the after-SBC FCF rows.
      label: `FCF CAGR ${c.windowYears}y (before SBC)`,
      value: c.cagrPct,
      unit: "%",
      source: "computed.growth.fcfCagrs",
      asOf: c.endDate,
    });
  }
  growthFigures.push(
    { label: "gross margin slope", value: g.margins.gross.slopePctPtsPerYear, unit: "pp/yr", source: "computed.growth.margins.gross", asOf: gAsOf },
    { label: "operating margin slope", value: g.margins.operating.slopePctPtsPerYear, unit: "pp/yr", source: "computed.growth.margins.operating", asOf: gAsOf },
    { label: "net margin slope", value: g.margins.net.slopePctPtsPerYear, unit: "pp/yr", source: "computed.growth.margins.net", asOf: gAsOf },
    { label: "latest revenue YoY", value: g.revenueAcceleration.latestYoyPct, unit: "%", source: "computed.growth.revenueAcceleration", asOf: gAsOf },
    { label: "revenue accel (YoY − 3y CAGR)", value: g.revenueAcceleration.deltaPctPts, unit: "pp", source: "computed.growth.revenueAcceleration", asOf: gAsOf },
  );
  // Latest margin levels (newest point of each series).
  const lastGross = g.margins.gross.series.at(-1);
  const lastOper = g.margins.operating.series.at(-1);
  const lastNet = g.margins.net.series.at(-1);
  if (lastGross) growthFigures.push({ label: "gross margin (latest)", value: lastGross.pct, unit: "%", source: "computed.growth.margins.gross", asOf: lastGross.date });
  if (lastOper) growthFigures.push({ label: "operating margin (latest)", value: lastOper.pct, unit: "%", source: "computed.growth.margins.operating", asOf: lastOper.date });
  if (lastNet) growthFigures.push({ label: "net margin (latest)", value: lastNet.pct, unit: "%", source: "computed.growth.margins.net", asOf: lastNet.date });
  sections.push(payloadSection({ title: "Growth & margins (computed)", figures: growthFigures, notes: g.notes }));

  // --- Returns (WACC / ROIC / DuPont) --------------------------------------
  const r = computed.returns;
  const returnsFigures: PayloadFigureInput[] = [
    // Current WACC mixes market observations and statement inputs. Its date is
    // the calculation day; each individual input retains its observation date.
    { label: "WACC", value: r.wacc.waccPct, unit: "%", source: "computed.returns.wacc", asOf: isoDay(computed.builtAt) },
    { label: "cost of equity", value: r.wacc.costOfEquityPct, unit: "%", source: "computed.returns.wacc.costOfEquity", asOf: r.wacc.asOf?.riskFreeRate ?? null },
    { label: "cost of debt (pre-tax)", value: r.wacc.costOfDebtPct, unit: "%", source: `computed.returns.wacc.costOfDebt(${r.wacc.costOfDebtMethod})`, asOf: r.wacc.asOf?.statements ?? null },
    { label: "risk-free rate", value: r.wacc.riskFreePct, unit: "%", source: "computed.returns.wacc.riskFree(fred:DGS10)", asOf: r.wacc.asOf?.riskFreeRate ?? null },
    { label: "ERP used", value: r.wacc.erpPct, unit: "%", source: "computed.returns.wacc.erp", asOf: null },
    { label: "beta (final)", value: r.wacc.betaFinal, unit: "x", source: "computed.returns.wacc.beta", asOf: null },
    { label: "ROIC (latest)", value: r.roic.latestRoicPct, unit: "%", source: "computed.returns.roic", asOf: r.roic.asOf },
    { label: "ROE (latest, DuPont)", value: r.dupont.latest?.roePct ?? null, unit: "%", source: "computed.returns.dupont", asOf: r.dupont.asOf },
    { label: "ROIC − WACC spread", value: r.roicVsWacc.spreadPctPts, unit: "pp", source: "computed.returns.roicVsWacc", asOf: r.roic.asOf },
  ];
  // clampsApplied is folded into the section notes so a bound WACC/beta/tax is
  // visible to the model (audit 2026-07-11 #5); material clamps ALSO surface as
  // manifest gaps (returns.ts), but immaterial ones would otherwise have no
  // consumer at all.
  sections.push(payloadSection({
    title: "Returns (computed)",
    figures: returnsFigures,
    notes: [...r.wacc.notes, ...r.wacc.clampsApplied, ...r.notes],
  }));

  // --- Capital -------------------------------------------------------------
  const cap = computed.capital;
  const capFigures: PayloadFigureInput[] = [
    // WS6 review (SHOULD-FIX 4): every free-cash-flow figure names its
    // definition. The house default subtracts SBC; the vendor convention does
    // not, and P/FCF and the graded conversion are both built on that one.
    { label: "latest FCF (after SBC, house default)", value: cap.fcf.latestFcf, unit: "currency", currency: currencies.fcf, source: "computed.capital.fcf", asOf: cap.asOf },
    { label: "latest FCF (before SBC, vendor convention)", value: cap.fcf.latestFcfBeforeSbc, unit: "currency", currency: currencies.fcf, source: "computed.capital.fcf.beforeSbc", asOf: cap.asOf },
    { label: "FCF conversion (latest, after SBC)", value: cap.fcf.latestConversion, unit: "x", source: "computed.capital.fcf.conversion", asOf: cap.asOf },
    { label: "FCF conversion (latest, before SBC — the graded ratio)", value: cap.fcf.latestConversionBeforeSbc, unit: "x", source: "computed.capital.fcf.conversionBeforeSbc", asOf: cap.asOf },
    { label: "capex/revenue (latest)", value: cap.capexIntensity.latestPct, unit: "%", source: "computed.capital.capexIntensity", asOf: cap.asOf },
    { label: "capex/revenue slope", value: cap.capexIntensity.slopePctPtsPerYear, unit: "pp/yr", source: "computed.capital.capexIntensity", asOf: cap.asOf },
    { label: "capex/D&A (latest)", value: cap.maintenanceVsGrowthCapex.capexToDALatest, unit: "x", source: "computed.capital.maintenanceVsGrowthCapex", asOf: cap.asOf },
    { label: "net debt/EBITDA", value: cap.netDebtToEbitda.value, unit: "x", source: "computed.capital.netDebtToEbitda", asOf: cap.netDebtToEbitda.asOf },
    { label: "interest coverage", value: cap.interestCoverage.value, unit: "x", source: "computed.capital.interestCoverage", asOf: cap.asOf },
    { label: "SBC % revenue", value: cap.sbc.pctOfRevenue, unit: "%", source: "computed.capital.sbc", asOf: cap.asOf },
    { label: "SBC % FCF", value: cap.sbc.pctOfFcf, unit: "%", source: "computed.capital.sbc", asOf: cap.asOf },
    // N3: the dilution overhang had no consumer in the payload, the data-only
    // report or the schema — only its note, and only when it was non-null.
    { label: "dilution overhang (diluted vs basic shares)", value: cap.dilution.overhangPct, unit: "%", source: "computed.capital.dilution", asOf: cap.dilution.asOf },
    { label: "weighted-average diluted common-share change (5y total)", value: cap.shareCount.trendPct, unit: "%", source: "computed.capital.shareCount", asOf: cap.shareCount.endDate },
    // D-61: the premium of today's quote over the proxy paid price is price
    // appreciation since the buybacks, labelled so and not graded; timing —
    // the price actually paid against the same year's average — is the
    // graded stewardship signal.
    { label: "current quote vs proxy buyback price (price appreciation since repurchases, not graded)", value: cap.buybackPriceAnalysis.premiumDiscountPct, unit: "%", source: "computed.capital.buybackPriceAnalysis", asOf: cap.asOf },
    ...(cap.buybackPriceAnalysis.totalRepurchased > 0
      ? [
          { label: "buyback timing: cost of the repurchased shares at each year's average price vs cost paid", value: cap.buybackPriceAnalysis.timingPct ?? null, unit: "%", source: "computed.capital.buybackPriceAnalysis.timingPct", asOf: cap.asOf },
          { label: "buyback timing coverage of repurchase dollars", value: cap.buybackPriceAnalysis.timingCoveragePct ?? null, unit: "%", source: "computed.capital.buybackPriceAnalysis.timingCoveragePct", asOf: cap.asOf },
        ]
      : []),
  ];
  sections.push(payloadSection({ title: "Capital & cash (computed)", figures: capFigures, notes: cap.notes }));

  // --- Bank capital, credit and funding (D-46) ------------------------------
  // The route metrics the bank balance-sheet grade is computed from, as rows
  // the analysts can cite. Notes stay digit-free: every number a sentence may
  // state is a row above them.
  const fm = computed.financialMetrics as ComputedMetrics["financialMetrics"] | undefined;
  if (fm?.route === "bank") {
    const bankFigures: PayloadFigureInput[] = [];
    for (const key of BANK_PAYLOAD_METRICS) {
      const m = fm.metrics.find((x) => x.key === key);
      if (m === undefined) continue;
      bankFigures.push({
        label: m.label,
        value: m.withheldReason === null ? m.value : null,
        unit: m.unit,
        currency: m.currency ?? null,
        source: `computed.financialMetrics.${m.key}`,
        asOf: m.asOf,
      });
    }
    const htmAfterTax = fm.metrics.find((x) => x.key === "htmLossAfterTax");
    if (htmAfterTax !== undefined && htmAfterTax.withheldReason === null) {
      // The after-tax loss rests on an assumed rate; the rate is a row so a
      // sentence stating it has a record to cite.
      bankFigures.push({
        label: "tax rate assumed on held-to-maturity losses (US federal statutory rate)",
        value: HTM_LOSS_TAX_RATE_PCT,
        unit: "%",
        source: "computed.financialMetrics.htmLossAfterTax.taxRate",
        asOf: htmAfterTax.asOf,
      });
    }
    // D-47: each evaluable warning sign as its value, its threshold and its
    // status, all citable. Caveats go to the notes, digit-free.
    const flags = fm.flags ?? [];
    for (const f of flags) {
      const src = `computed.financialMetrics.flags.${f.key}`;
      bankFigures.push(
        { label: `warning sign, ${f.label}: value`, value: f.value, unit: f.unit, source: `${src}.value`, asOf: f.asOf },
        { label: `warning sign, ${f.label}: threshold (heuristic, not validated)`, value: f.threshold, unit: f.unit, source: `${src}.threshold`, asOf: f.asOf },
        { label: `warning sign, ${f.label}: status`, value: f.triggered ? "triggered" : "not triggered", unit: "", source: src, asOf: f.asOf },
      );
    }
    sections.push(payloadSection({
      title: "Bank capital, credit and funding (computed — public-filing proxies, not a supervisory rating)",
      figures: bankFigures,
      notes: [
        "These are proxies built from public filings for a bank's capital, credit quality and funding. Management " +
          "quality and interest-rate sensitivity cannot be observed from them, and no supervisory rating is used.",
        "Tangible common equity / tangible assets is a leverage ratio, not CET1. It is not comparable across business " +
          "models: custody and trust banks run thin leverage and low loans / deposits by design. CET1 is shown only " +
          "when the filer tags it and is never graded.",
        "Held-to-maturity securities are carried at amortised cost, so their unrealised loss is in neither book nor " +
          "regulatory capital. The marked ratio deducts only that loss: available-for-sale losses are already in " +
          "tangible common equity. The loss would be realised only if deposits had to be funded by selling the " +
          "securities; a sticky deposit base offsets it.",
        ...(flags.length === 0
          ? []
          : [
              "Warning signs use heuristic thresholds that have not been validated. They are shown, not graded. " +
                "Discuss every triggered one; a count of warning signs is not a probability of anything.",
              // One note per caveat; two HTM signs share theirs.
              ...[...new Set(flags.map((f) => f.caveat))].map(
                (caveat) => `${flags.filter((f) => f.caveat === caveat).map((f) => f.label).join("; ")}: ${caveat}`,
              ),
            ]),
      ],
    }));
  }

  // --- Forensics -----------------------------------------------------------
  const fx = computed.forensics;
  const forensicFigures: PayloadFigureInput[] = [
    { label: `Altman ${fx.altman?.variant ?? "Z"}`, value: fx.altman?.score ?? null, unit: "score", source: "computed.forensics.altman", asOf: fx.altman?.asOf.balanceSheet ?? null },
    { label: "Altman zone", value: fx.altman?.zone ?? null, unit: "", source: "computed.forensics.altman.zone", asOf: fx.altman?.asOf.balanceSheet ?? null },
    { label: "Beneish M", value: fx.beneish?.score ?? null, unit: "score", source: "computed.forensics.beneish", asOf: fx.beneish?.asOf.current ?? null },
    { label: "Beneish verdict", value: fx.beneish?.verdict ?? null, unit: "", source: "computed.forensics.beneish.verdict", asOf: fx.beneish?.asOf.current ?? null },
    // D-61: the eight indices the M-score is built from, and the score without
    // the sales-growth term, so a flag can be traced to what carries it.
    ...(fx.beneish !== null && fx.beneish.score !== null
      ? [
          ...([
            ["DSRI", fx.beneish.indices.dsri], ["GMI", fx.beneish.indices.gmi], ["AQI", fx.beneish.indices.aqi],
            ["SGI", fx.beneish.indices.sgi], ["DEPI", fx.beneish.indices.depi], ["SGAI", fx.beneish.indices.sgai],
            ["TATA", fx.beneish.indices.tata], ["LVGI", fx.beneish.indices.lvgi],
          ] as const).map(([name, value]): PayloadFigureInput => ({
            label: `Beneish index ${name}`, value, unit: "x", source: `computed.forensics.beneish.indices.${name.toLowerCase()}`, asOf: fx.beneish!.asOf.current,
          })),
          { label: "Beneish M with the sales-growth index at neutral 1.0", value: fx.beneish.sgiNeutralScore ?? null, unit: "score", source: "computed.forensics.beneish.sgiNeutralScore", asOf: fx.beneish.asOf.current },
          { label: "Beneish flag carried by sales growth alone", value: fx.beneish.growthLed === true ? "yes" : "no", unit: "", source: "computed.forensics.beneish.growthLed", asOf: fx.beneish.asOf.current },
          // D-68: what the statements show behind AQI and GMI (context, not graded).
          ...(fx.beneish.aqiWithoutAcquiredAndInvestments != null
            ? [{ label: "Beneish AQI without goodwill, intangibles and long-term investments (context, not graded)", value: fx.beneish.aqiWithoutAcquiredAndInvestments, unit: "x", source: "computed.forensics.beneish.aqiWithoutAcquiredAndInvestments", asOf: fx.beneish.asOf.current }]
            : []),
          ...(fx.beneish.gmiContext != null && fx.beneish.inventoryWriteDownCurrent != null
            ? [
                { label: "inventory write-downs the filer tagged (current year)", value: fx.beneish.inventoryWriteDownCurrent, unit: "currency", currency: currencies.forensics, source: "computed.forensics.beneish.inventoryWriteDownCurrent", asOf: fx.beneish.asOf.current },
                ...(fx.beneish.inventoryWriteDownPrior != null
                  ? [{ label: "inventory write-downs the filer tagged (prior year)", value: fx.beneish.inventoryWriteDownPrior, unit: "currency", currency: currencies.forensics, source: "computed.forensics.beneish.inventoryWriteDownPrior", asOf: fx.beneish.asOf.prior }]
                  : []),
                ...(fx.beneish.gmiWithoutWriteDowns != null
                  ? [{ label: "Beneish GMI with inventory write-downs added back (context, not graded)", value: fx.beneish.gmiWithoutWriteDowns, unit: "x", source: "computed.forensics.beneish.gmiWithoutWriteDowns", asOf: fx.beneish.asOf.current }]
                  : []),
              ]
            : []),
        ]
      : []),
    // The forensic layer's own label carries the scale (variant, denominator
    // and the withheld signals by name), so a 3-of-3 on a bank is never read
    // against the paper's 9-point scale.
    { label: fx.piotroski?.label ?? "Piotroski F", value: fx.piotroski?.score ?? null, unit: "score", source: "computed.forensics.piotroski", asOf: fx.piotroski?.asOf.current ?? null },
    // D-61: each of the nine signals, passed, failed or not evaluable.
    ...(fx.piotroski !== null
      ? (Object.entries(PIOTROSKI_SIGNAL_LABELS) as [PiotroskiSignalName, string][]).map(([key, label]): PayloadFigureInput => {
          const value = fx.piotroski!.signals[key]?.value;
          return {
            label: `Piotroski signal: ${label}`,
            value: value === 1 ? "passed" : value === 0 ? "failed" : "not evaluable",
            unit: "", source: `computed.forensics.piotroski.signals.${key}`, asOf: fx.piotroski!.asOf.current,
          };
        })
      : []),
    { label: "accrual ratio (cash-flow)", value: fx.accruals?.cashFlowAccrualRatio ?? null, unit: "x", source: "computed.forensics.accruals.cashFlowAccrualRatio", asOf: fx.accruals?.asOf.current ?? null },
    { label: "accrual definition", value: fx.accruals?.definition ?? null, unit: "", source: "computed.forensics.accruals.definition", asOf: fx.accruals?.asOf.current ?? null },
    // The adjustment's operands exist only on the adjusted construction.
    ...(fx.accruals?.definition === "financial-asset-adjusted"
      ? [
          { label: "accrual operand financial-asset investing flows (purchases plus sales/maturities of investments)", value: fx.accruals.financialAssetCashFlow ?? null, unit: "currency", currency: currencies.forensics, source: "computed.forensics.accruals.financialAssetCashFlow", asOf: fx.accruals.asOf.current },
          { label: "accrual operand operating investing cash flow (CFI without financial-asset flows)", value: fx.accruals.operatingInvestingCashFlow ?? null, unit: "currency", currency: currencies.forensics, source: "computed.forensics.accruals.operatingInvestingCashFlow", asOf: fx.accruals.asOf.current },
          { label: "long-term investments removed from net operating assets (current)", value: fx.accruals.longTermInvestmentsCurrent ?? null, unit: "currency", currency: currencies.forensics, source: "computed.forensics.accruals.longTermInvestmentsCurrent", asOf: fx.accruals.asOf.current },
          { label: "long-term investments removed from net operating assets (prior)", value: fx.accruals.longTermInvestmentsPrior ?? null, unit: "currency", currency: currencies.forensics, source: "computed.forensics.accruals.longTermInvestmentsPrior", asOf: fx.accruals.asOf.prior },
        ] satisfies PayloadFigureInput[]
      : []),
    // D-68: one fiscal year over the prior, not "the accrual years".
    { label: "revenue growth in the accrual fiscal year (year over year)", value: fx.accruals?.revenueGrowthPct ?? null, unit: "%", source: "computed.forensics.accruals.revenueGrowthPct", asOf: fx.accruals?.asOf.current ?? null },
    { label: "net operating asset growth in the accrual fiscal year (year over year)", value: fx.accruals?.noaGrowthPct ?? null, unit: "%", source: "computed.forensics.accruals.noaGrowthPct", asOf: fx.accruals?.asOf.current ?? null },
    // D-68: how much of the NOA increase an acquisition added, when one did.
    ...(fx.accruals != null && (fx.accruals.acquisitionCashPaidUnallocated != null || fx.accruals.notes.some((note) => note.startsWith("Acquisitions ")))
      ? [
          { label: "goodwill (current)", value: fx.accruals.goodwillCurrent ?? null, unit: "currency", currency: currencies.forensics, source: "computed.forensics.accruals.goodwillCurrent", asOf: fx.accruals.asOf.current },
          { label: "goodwill (prior)", value: fx.accruals.goodwillPrior ?? null, unit: "currency", currency: currencies.forensics, source: "computed.forensics.accruals.goodwillPrior", asOf: fx.accruals.asOf.prior },
          { label: "increase in goodwill and other intangible assets", value: fx.accruals.acquiredGoodwillAndIntangibles ?? null, unit: "currency", currency: currencies.forensics, source: "computed.forensics.accruals.acquiredGoodwillAndIntangibles", asOf: fx.accruals.asOf.current },
          { label: fx.accruals.acquisitionCashPaidUnallocated != null
            ? "cash on the classified vendor acquisitions line (partial; filed payment overlap unresolved)"
            : "cash paid for acquisitions, net of cash acquired", value: fx.accruals.acquisitionCashPaid ?? null, unit: "currency", currency: currencies.forensics, source: "computed.forensics.accruals.acquisitionCashPaid", asOf: fx.accruals.asOf.current },
          ...(fx.accruals.acquisitionCashPaidUnallocated != null
            ? [{ label: "filed business payment (unallocated; overlap with classified acquisitions unresolved)", value: fx.accruals.acquisitionCashPaidUnallocated,
              unit: "currency", currency: currencies.forensics, source: "computed.forensics.accruals.acquisitionCashPaidUnallocated", asOf: fx.accruals.asOf.current }]
            : []),
          { label: "goodwill and intangibles increase as a share of the net-operating-asset increase", value: fx.accruals.acquiredShareOfNoaIncreasePct ?? null, unit: "%", source: "computed.forensics.accruals.acquiredShareOfNoaIncreasePct", asOf: fx.accruals.asOf.current },
        ]
      : []),
    { label: "accrual operand net income (NI)", value: fx.accruals?.netIncome ?? null, unit: "currency", currency: currencies.forensics, source: "computed.forensics.accruals.netIncome", asOf: fx.accruals?.asOf.current ?? null },
    { label: "accrual operand operating cash flow (CFO)", value: fx.accruals?.operatingCashFlow ?? null, unit: "currency", currency: currencies.forensics, source: "computed.forensics.accruals.operatingCashFlow", asOf: fx.accruals?.asOf.current ?? null },
    { label: "accrual operand investing cash flow (CFI)", value: fx.accruals?.investingCashFlow ?? null, unit: "currency", currency: currencies.forensics, source: "computed.forensics.accruals.investingCashFlow", asOf: fx.accruals?.asOf.current ?? null },
    { label: "operating accruals only (NI minus CFO)", value: fx.accruals?.operatingAccruals ?? null, unit: "currency", currency: currencies.forensics, source: "computed.forensics.accruals.operatingAccruals", asOf: fx.accruals?.asOf.current ?? null },
    { label: "accrual band", value: fx.accruals?.band ?? null, unit: "", source: "computed.forensics.accruals.band", asOf: fx.accruals?.asOf.current ?? null },
    { label: "accrual ratio (balance-sheet)", value: fx.accruals?.balanceSheetAccrualRatio ?? null, unit: "x", source: "computed.forensics.accruals.balanceSheetAccrualRatio", asOf: fx.accruals?.asOf.current ?? null },
    { label: "aggregate accruals (cash-flow)", value: fx.accruals?.aggregateAccrualsCashFlow ?? null, unit: "currency", currency: currencies.forensics, source: "computed.forensics.accruals.aggregateAccrualsCashFlow", asOf: fx.accruals?.asOf.current ?? null },
    { label: "aggregate accruals (balance-sheet)", value: fx.accruals?.aggregateAccrualsBalanceSheet ?? null, unit: "currency", currency: currencies.forensics, source: "computed.forensics.accruals.aggregateAccrualsBalanceSheet", asOf: fx.accruals?.asOf.current ?? null },
    { label: "net operating assets (current)", value: fx.accruals?.noaCurrent ?? null, unit: "currency", currency: currencies.forensics, source: "computed.forensics.accruals.noaCurrent", asOf: fx.accruals?.asOf.current ?? null },
    { label: "net operating assets (prior)", value: fx.accruals?.noaPrior ?? null, unit: "currency", currency: currencies.forensics, source: "computed.forensics.accruals.noaPrior", asOf: fx.accruals?.asOf.prior ?? null },
    { label: "accrual scaler", value: fx.accruals?.scaler ?? null, unit: "", source: "computed.forensics.accruals.scaler", asOf: fx.accruals?.asOf.current ?? null },
    { label: "accrual scaler value", value: fx.accruals?.scalerValue ?? null, unit: "currency", currency: currencies.forensics, source: "computed.forensics.accruals.scalerValue", asOf: fx.accruals?.asOf.current ?? null },
    { label: "absolute cash-flow versus balance-sheet accrual divergence", value: fx.accruals?.cashFlowAccrualRatio != null && fx.accruals.balanceSheetAccrualRatio !== null ? Math.abs(fx.accruals.cashFlowAccrualRatio - fx.accruals.balanceSheetAccrualRatio) * 100 : null, unit: "pp", source: "computed.forensics.accruals.divergence", asOf: fx.accruals?.asOf.current ?? null },
  ];
  const forensicNotes = [...fx.notes];
  if (fx.accruals !== null) {
    // D-61: the note names the construction actually used.
    forensicNotes.push(
      fx.accruals.definition === "operating"
        ? `Cash-flow accruals here are operating accruals = NI - CFO; ratio = that numerator / ${fx.accruals.scaler ?? "unavailable scaler"}, for ${fx.accruals.asOf.current ?? "unknown period"}. The statements do not separate investment purchases and sales from operating investment, so no investing flow is included. Read those exact-dated statement rows, not another cash-flow definition.`
        : `Cash-flow accruals are financial-asset-adjusted (Richardson, Sloan, Soliman and Tuna 2005) = NI - CFO - operating CFI, where operating CFI is investing cash flow without purchases and sales/maturities of investments; ratio = that numerator / ${fx.accruals.scaler ?? "unavailable scaler"}, for ${fx.accruals.asOf.current ?? "unknown period"}. Net operating assets exclude cash, short-term and long-term investments. Buying securities or strategic equity stakes is not an accrual; capex, acquisitions and unclassified investing flows remain operating investment. Read those exact-dated statement rows, not another cash-flow definition.`,
      "The balance-sheet alternative is (NOA current - NOA prior) / the same scaler; reconcile divergence before drawing an earnings-quality conclusion. A high ratio is growth in net operating assets, which for a fast-growing company largely scales with sales; it is not evidence of aggressive revenue recognition by itself.",
    );
  }
  for (const flag of fx.flags) {
    forensicNotes.push(`FLAG [${flag.severity}] ${flag.message} (rule: ${flag.rule})`);
  }
  sections.push(payloadSection({ title: "Forensics (computed)", figures: forensicFigures, notes: forensicNotes }));

  const currentCapital = computed.capital.current;
  if (currentCapital) {
    const figures: PayloadFigureInput[] = [];
    const add = (key: string, value: number | null, unit: string): void => {
      const period = key.startsWith("debtBridge.") ? currentCapital.asOf
        : `${currentCapital.basis}: ${currentCapital.periodStart ?? "unknown start"} to ${currentCapital.asOf ?? "unknown end"}`;
      // The bridge group is structure, not the metric: "total debt including
      // leases", never "debt Bridge total Debt Including Leases", which no
      // prose naming the metric could match (NVDA report 34).
      const label = key.replace(/^(?:cash|debt)Bridge\./, "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
      figures.push({ label, value, unit, currency: unit === "currency" ? currentCapital.currency : null,
        source: `computed.capital.current.${key}`, asOf: currentCapital.asOf, period });
    };
    for (const key of ["netDebtToEbitda", "interestCoverage", "fcfConversionBeforeSbc"] as const) add(key, currentCapital[key], "x");
    add("sbcPctOfFcf", currentCapital.sbcPctOfFcf, "%");
    for (const key of ["netDebt", "ebitda"] as const) add(key, currentCapital[key], "currency");
    for (const [key, value] of Object.entries(currentCapital.cashBridge)) {
      if (key !== "definition" && (typeof value === "number" || value === null)) add(`cashBridge.${key}`, value, "currency");
    }
    for (const [key, value] of Object.entries(currentCapital.debtBridge)) if (typeof value === "number" || value === null) add(`debtBridge.${key}`, value, "currency");
    figures.push({ label: "capital basis", value: `${currentCapital.basis}: ${currentCapital.periodStart ?? "unknown start"} to ${currentCapital.asOf ?? "unknown end"}`,
      unit: "", source: "computed.capital.current", asOf: currentCapital.asOf });
    sections.push(payloadSection({ title: "Current capital (computed)", figures, notes: [
      `Current capital basis: ${currentCapital.basis}; exact window ${currentCapital.periodStart ?? "unknown start"} through ${currentCapital.asOf ?? "unknown end"}.`,
      ...(currentCapital.fallbackReason ? [currentCapital.fallbackReason] : []), currentCapital.cashBridge.definition,
      ...(currentCapital.debtBridge.leaseScopeNote ? [currentCapital.debtBridge.leaseScopeNote] : []),
    ] }));
  }

  // --- Technicals ----------------------------------------------------------
  const t = computed.technicals;
  const rs = t.relativeStrength.benchmark;
  const techFigures: PayloadFigureInput[] = [
    { label: "last close", value: t.lastClose, unit: "currency/share", currency: currencies.trading, source: "computed.technicals", asOf: t.asOf },
    { label: "SMA50", value: t.smaCross.sma50, unit: "currency/share", currency: currencies.trading, source: "computed.technicals.smaCross", asOf: t.asOf },
    { label: "SMA200", value: t.smaCross.sma200, unit: "currency/share", currency: currencies.trading, source: "computed.technicals.smaCross", asOf: t.asOf },
    // RSI is dimensionless; MACD subtracts price EMAs and their signal EMA,
    // retaining the source price currency/share. An unknown currency cannot
    // support a numeric MACD quotation or a dimensionless substitute.
    { label: "RSI-14", value: t.rsi14, unit: "index", source: "computed.technicals.rsi14", asOf: t.asOf },
    { label: "MACD histogram", value: currencies.trading === null ? null : t.macd.histogram, unit: "currency/share", currency: currencies.trading, source: "computed.technicals.macd", asOf: t.asOf },
    { label: "52w high", value: t.range52w.high52w, unit: "currency/share", currency: currencies.trading, source: "computed.technicals.range52w", asOf: t.asOf },
    { label: "52w low", value: t.range52w.low52w, unit: "currency/share", currency: currencies.trading, source: "computed.technicals.range52w", asOf: t.asOf },
    { label: "% from 52w high", value: t.range52w.pctFromHigh, unit: "%", source: "computed.technicals.range52w", asOf: t.asOf },
    // D-48: the scored momentum signal, as of its own window end (a month
    // before the latest close), and the 6-month window, which is no longer
    // scored but stays visible. n/a rows are withheld windows; the reason is
    // in the gap list.
    { label: "relative strength vs SPY, 12-1 month (latest month skipped)", value: rs.momentum12m1m?.differentialPctPoints ?? null, unit: "pp", source: "computed.technicals.relativeStrength.12m1m", asOf: rs.momentum12m1m?.endDate ?? null },
    { label: "relative strength vs SPY, 6-month", value: rs.points.find((p) => p.months === 6)?.differentialPctPoints ?? null, unit: "pp", source: "computed.technicals.relativeStrength.6mo", asOf: rs.asOf },
    // D-66: one tag per read. Both rows printed `computed.technicals.read`, so
    // the NVDA final rerun's judge composed `computed.technicals.momentum` for
    // the momentum read, a tag that did not exist (unknown-source).
    { label: "trend read", value: t.read.trend, unit: "", source: "computed.technicals.trend-read", asOf: t.asOf },
    { label: "momentum read", value: t.read.momentum, unit: "", source: "computed.technicals.momentum-read", asOf: t.asOf },
  ];
  sections.push(payloadSection({ title: "Technicals (computed)", figures: techFigures, notes: [...t.notes,
    ...(currencies.trading === null ? ["MACD price currency is unknown; the numeric histogram is withheld rather than treated as a dimensionless index."] : []),
  ] }));

  // --- Valuation -----------------------------------------------------------
  const val = computed.valuation;
  const valFigures: PayloadFigureInput[] = [{ label: "valuation model", value: val.kind, unit: "", source: "computed.valuation.kind", asOf: null }];
  if (val.kind === "dcf") {
    valFigures.push(
      { label: "DCF per share", value: val.dcf?.perShare ?? null, unit: "currency/share", currency: currencies.model, source: "computed.valuation.dcf", asOf: null },
      { label: "DCF terminal value share", value: val.dcf?.terminalShare ?? null, unit: "fraction", source: "computed.valuation.dcf.terminalShare", asOf: null },
      { label: "reverse-DCF implied revenue growth", value: val.reverseDcf?.impliedRevenueGrowthPct ?? null, unit: "%", source: "computed.valuation.reverseDcf", asOf: null },
      { label: "reverse-DCF implied terminal margin", value: val.reverseDcf?.impliedTerminalMarginPct ?? null, unit: "%", source: "computed.valuation.reverseDcf", asOf: null },
    );
    // D-60 (P0-E): the price-implied year-one growth beside the evidence it
    // must be read against, each as growth over the same TTM start revenue, so
    // "demanding" or "undemanding" is a comparison, not an adjective.
    const anchor = val.assumptions?.revenueAnchor;
    const start = val.assumptions?.startRevenue.value ?? null;
    const anchorAsOf = val.assumptions?.asOf.statements ?? null;
    const overStart = (level: number | null | undefined): number | null =>
      start !== null && start > 0 && typeof level === "number" && Number.isFinite(level) ? (level / start - 1) * 100 : null;
    valFigures.push(...([
      { label: "DCF base-case year-one revenue growth over TTM", value: anchor?.yearOneGrowthPct ?? null, unit: "%", source: "computed.valuation.reverseDcfContext.baseYearOne", asOf: anchorAsOf },
      { label: "guided run-rate growth over TTM (next-quarter guidance × 4)", value: overStart(anchor?.evidence?.guidedRunRate), unit: "%", source: "computed.valuation.reverseDcfContext.guidedRunRate", asOf: anchorAsOf },
      { label: "guided sequential pace, annualized", value: anchor?.evidence?.guidedPacePct ?? null, unit: "%", source: "computed.valuation.reverseDcfContext.guidedPace", asOf: anchorAsOf },
      { label: "consensus year-one revenue growth over TTM", value: overStart(anchor?.evidence?.consensusYearOne), unit: "%", source: "computed.valuation.reverseDcfContext.consensusYearOne", asOf: anchorAsOf },
      { label: "latest-quarter revenue growth, year over year", value: anchor?.runRate?.yoyPct ?? null, unit: "%", source: "computed.valuation.reverseDcfContext.latestQuarterYoy", asOf: anchorAsOf },
    ] satisfies PayloadFigureInput[]).filter((figure) => figure.value !== null));
  } else if (val.kind === "excess-return") {
    // WS5 review (NIT 8): the model's shape and the multiple a financial is
    // actually read on had no consumer anywhere downstream — the payload showed
    // one number from a model whose horizon, discount rate and opening book
    // value were only inferable from prose.
    valFigures.push(
      { label: "excess-return per share", value: val.excessReturn.perShare ?? null, unit: "currency/share", currency: currencies.model, source: "computed.valuation.excessReturn", asOf: null },
      { label: "excess-return horizon (years)", value: val.excessReturn.horizonYears.value, unit: "years", source: "computed.valuation.excessReturn.horizonYears", asOf: null },
      { label: "cost of equity (the model's only discount rate)", value: val.excessReturn.costOfEquityPct.value, unit: "%", source: "computed.valuation.excessReturn.costOfEquityPct", asOf: null },
      { label: "opening book equity (BV0)", value: val.excessReturn.openingBookValue.value, unit: "currency", currency: currencies.model, source: "computed.valuation.excessReturn.openingBookValue", asOf: val.excessReturn.asOf },
      { label: "P/TBV", value: val.excessReturn.priceToTangibleBookVsRote.pTbv, unit: "x", source: "computed.valuation.excessReturn.priceToTangibleBookVsRote", asOf: val.excessReturn.asOf },
      { label: "ROTE (the return P/TBV is read against)", value: val.excessReturn.priceToTangibleBookVsRote.rotePct, unit: "%", source: "computed.valuation.excessReturn.priceToTangibleBookVsRote", asOf: val.excessReturn.asOf },
      { label: "justified P/TBV (stable-growth cross-check)", value: val.excessReturn.priceToTangibleBookVsRote.justifiedPTbv, unit: "x", source: "computed.valuation.excessReturn.priceToTangibleBookVsRote", asOf: val.excessReturn.asOf },
    );
    const a = val.excessReturn.financialAssumptions;
    for (const [label, key, unit] of [
      ["terminal ROE", "terminalRoePct", "%"],
      ["continuing residual-income growth", "terminalGrowthPct", "%"],
      ["terminal excess return over cost of equity", "terminalExcessReturnPp", "pp"],
      ["continuing value (present value)", "continuingValuePv", "currency"],
      ["continuing value share of equity value", "continuingValueSharePct", "%"],
    ] as const) {
      valFigures.push({ label, value: a?.[key] ?? null, unit, currency: unit === "currency" ? currencies.model : null,
        source: `computed.valuation.excessReturn.financialAssumptions.${key}`, asOf: val.excessReturn.asOf });
    }
  } else if (val.kind === "reit") {
    valFigures.push(
      { label: "REIT P/FFO", value: val.reit.pToFfo ?? null, unit: "x", source: "computed.valuation.reit", asOf: val.reit.asOf },
      { label: "REIT P/AFFO", value: val.reit.pToAffo ?? null, unit: "x", source: "computed.valuation.reit", asOf: val.reit.asOf },
    );
  }
  for (const m of val.kind === "pre-revenue" ? [] : val.multiples.multiples) {
    valFigures.push({
      label: `${m.key} (current)`,
      value: m.current,
      unit: "x",
      source: `computed.valuation.multiples.${m.key}`,
      asOf: val.kind === "pre-revenue" ? null : val.multiples.asOf.quote,
    });
    if (m.peers) {
      valFigures.push({
        label: `${m.key} peer median`,
        value: m.peers.median,
        unit: "x",
        source: `computed.valuation.multiples.${m.key}.peers`,
        asOf: null,
      });
    }
  }
  // D-65: which base-path years consensus sets, so the prose names them
  // instead of calling a ten-year path "consensus-anchored".
  const consensusYears = val.kind === "dcf" ? val.assumptions?.revenueAnchor?.consensusYears : undefined;
  const consensusPath = val.kind === "dcf" ? val.assumptions?.revenueAnchor?.consensusPath ?? [] : [];
  const anchoredLabels = consensusPath.filter((r) => r.anchored).map((r) => r.label);
  const consensusNote = consensusYears === undefined || val.kind !== "dcf" ? [] : [
    consensusYears.length === 0
      ? "Consensus anchoring (D-65): no base-path year takes its revenue from analyst consensus; do not describe the base path as consensus-anchored."
      : `Consensus anchoring (D-65): consensus sets ${consensusYearsText(consensusYears)} of the ${val.assumptions?.years ?? 10}-year base path` +
        `${anchoredLabels.length > 0 ? ` (${anchoredLabels[0]}${anchoredLabels.length > 1 ? ` through ${anchoredLabels[anchoredLabels.length - 1]}` : ""})` : ""}; ` +
        `the remaining years are the house convergent fade. Call the base path consensus-anchored only for those years, and name them.`,
  ];
  sections.push(payloadSection({ title: "Valuation (computed)", figures: valFigures, notes: [
    ...val.notes,
    ...(val.kind === "pre-revenue" ? [] : val.multiples.multiples.flatMap(stat => stat.basis?.trim() ? [`${stat.key}: ${stat.basis}`] : [])),
    ...(val.kind === "pre-revenue" ? [] : val.multiples.multiples.flatMap(stat => [stat.ownershipScope, stat.historyScope].filter((scope): scope is string => typeof scope === "string"))),
    ...consensusNote,
    ...(val.kind === "dcf" && val.reverseDcf?.impliedRevenueGrowthPct != null
      ? ["Reverse-DCF context (D-60): the implied rate is year-one revenue growth over TTM on the base path's convergent family. Read it against the base-case year one, the guided run-rate, consensus year one and the latest quarter's year-over-year growth rows, all measured over the same TTM revenue; describe the price as demanding only relative to those figures."]
      : []),
    ...(val.kind === "excess-return" ? [describeFinancialValuation(val.excessReturn.financialAssumptions)] : []),
  ] }));

  const peerCoverage = val.kind === "pre-revenue" ? undefined : val.multiples.peerCoverage;
  if (peerCoverage) {
    const peerFigures: PayloadFigureInput[] = peerCoverage.comparisons.flatMap((comparison) => {
      const source = `computed.valuation.peerCoverage.${semanticSlug(comparison.name)}`;
      return [
        { label: `${comparison.name} current`, value: comparison.current, unit: "x", source: `${source}.current`, asOf: null },
        { label: `${comparison.name} peer median`, value: comparison.peerMedian, unit: "x", source: `${source}.median`, asOf: null },
        { label: `${comparison.name} eligible peer count after filtering`, value: comparison.peerCount, unit: "count", source: `${source}.count`, asOf: null },
      ];
    });
    sections.push(payloadSection({
      title: "Comparable peers (computed)",
      figures: peerFigures.length ? peerFigures : [{ label: "qualified comparable peer valuation", value: null, unit: "x", source: "computed.valuation.peerCoverage", asOf: null }],
      notes: [
        ...peerCoverage.methodology,
        ...peerCoverage.comparisons.map((comparison) => `${comparison.name}: ${comparison.basis}`),
        ...peerCoverage.exclusions.map((entry) => `${entry.symbol}: ${entry.reason}`),
      ],
    }));
  }

  // --- Deterministic aspect scores (feature 1.1.0) -------------------------
  if (computed.scores) {
    const sc = computed.scores;
    const scoreFigures: PayloadFigureInput[] = [
      { label: "COMPOSITE score", value: sc.composite.score, unit: "0-100", source: "computed.scores.composite", asOf: null },
      { label: "COMPOSITE grade", value: sc.composite.band, unit: "", source: "computed.scores.composite", asOf: null },
    ];
    for (const key of SCORE_ASPECT_ORDER) {
      const a = sc.aspects[key];
      scoreFigures.push({
        label: `${key} score`,
        value: a.score,
        unit: `0-100 (grade ${a.band ?? "n/a"})`,
        source: `computed.scores.${key}`,
        asOf: null,
      });
      // D-44: completeness was shown only inside the score's unit qualifier,
      // which no record carries, so the true "quality evidence completeness
      // 0.4" in report 26 could only be cited against the score record and
      // failed. Its own row gives it its own id and unit.
      scoreFigures.push({
        label: `${key} evidence completeness`,
        value: a.dataCompleteness,
        unit: "fraction",
        source: `computed.scores.${key}.dataCompleteness`,
        asOf: null,
      });
    }
    sections.push(payloadSection({
      title: "Deterministic aspect scores (computed — ANCHOR your A–F letter grades to these bands; justify any deviation)",
      figures: scoreFigures,
      notes: [
        sc.composite.methodology,
        `band table: ${sc.bandsVersion}`,
        // D-61 (NVDA report #34: a leadership grade justified by guidance
        // execution that the score never measured).
        "The leadership score is a capital-stewardship proxy: repurchase timing (the price actually paid against the same fiscal year's average price) and annualized weighted-average diluted common-share change. That share measure is not net economic dilution. Management quality, guidance execution and governance are not inputs to it; a leadership grade that rests on them is a judgment beyond the band and must say so, not cite the band as support.",
      ],
    }));
  }

  // --- Weighted projections (feature 1.1.0) --------------------------------
  const projectionPoints = projectionAvailability(computed.projections?.series ?? []);
  if (computed.projections && projectionPoints.forward) {
    const pr = computed.projections;
    const projFigures: PayloadFigureInput[] = [];
    const projectionSeries = orderedProjectionSeries(pr.series);
    for (const s of projectionSeries) {
      const periodRows = projectionPeriodRows(s);
      const pointsFor = (path: (typeof PROJECTION_PATH_ORDER)[number]) =>
        admittedProjectionPoints(s, path);
      const w = pointsFor("weighted");
      const endpoint = [w, pointsFor("base"), pointsFor("bull"), pointsFor("bear")].find(points => points.length > 0) ?? [];
      const at = (arr: typeof w, i: number) => arr[i];
      const y5 = w.length - 1;
      const idxs = [0, Math.min(2, y5), y5];
      for (const i of idxs) {
        const pt = at(w, i);
        if (pt) projFigures.push({ label: `${s.metric} weighted ${pt.period}`, value: pt.value.value, unit: s.unit, currency: pt.value.currency, period: pt.period, source: `computed.projections.${s.metric}.weighted`, asOf: pt.value.asOf });
      }
      const endpointRow = endpoint.at(-1)
        ? periodRows.find((row) => row.period === endpoint.at(-1)!.period)
        : undefined;
      const b5 = endpointRow
        ? projectionCellPoint(endpointRow, "bull", s.unit)
        : null;
      const be5 = endpointRow
        ? projectionCellPoint(endpointRow, "bear", s.unit)
        : null;
      if (b5) projFigures.push({ label: `${s.metric} bull ${b5.period}`, value: b5.value.value, unit: s.unit, currency: b5.value.currency, period: b5.period, source: `computed.projections.${s.metric}.bull`, asOf: b5.value.asOf });
      if (be5) projFigures.push({ label: `${s.metric} bear ${be5.period}`, value: be5.value.value, unit: s.unit, currency: be5.value.currency, period: be5.period, source: `computed.projections.${s.metric}.bear`, asOf: be5.value.asOf });
      const baseEnd = !projectionPoints.weighted && endpointRow ? projectionCellPoint(endpointRow, "base", s.unit) : null;
      if (baseEnd) projFigures.push({ label: `${s.metric} base ${baseEnd.period}`, value: baseEnd.value.value, unit: s.unit, currency: baseEnd.value.currency, period: baseEnd.period, source: `computed.projections.${s.metric}.base`, asOf: baseEnd.value.asOf });
      for (const alternative of ["flatShare", "shareTrend"] as const) {
        const points = admittedProjectionPoints(s, "weighted", alternative);
        const last = points.length - 1;
        for (const i of new Set([0, Math.min(2, last), last])) {
          const point = points[i];
          if (point === undefined) continue;
          projFigures.push({ label: `${alternative === "flatShare" ? "flat-share EPS" : "hypothetical historical-share-trend EPS"} weighted ${point.period}`,
            value: point.value.value, unit: s.unit, currency: point.value.currency, period: point.period,
            source: `computed.projections.${s.metric}.${alternative}.weighted`, asOf: point.value.asOf });
        }
      }
    }
    // The weights as a citable row (D-43). They were printed only inside the
    // section title, so a sentence about them had no tag to cite and the
    // model fell back on the prompt's own style example. The row's text names
    // the three numbers, which become the only numbers a sentence citing it
    // may state (attachProvenanceRegistry, allowedNumbers).
    const pct = (w: number): number => Math.round(w * 1000) / 10;
    if (projectionPoints.weighted) projFigures.push({
      label: "scenario weights bull/base/bear in percent (fixed, unbacktested prior; not calibrated probabilities)",
      value: `${pct(pr.scenarioWeights.bull)}/${pct(pr.scenarioWeights.base)}/${pct(pr.scenarioWeights.bear)}`,
      unit: "",
      source: "computed.projections.scenarioWeights",
      asOf: null,
    });
    sections.push(payloadSection({
      title: projectionPoints.weighted
        ? `Weighted projections (computed — ${pr.horizonYears}y forward, fixed display weights ${pr.scenarioWeights.bull}/${pr.scenarioWeights.base}/${pr.scenarioWeights.bear} bull/base/bear; ESTIMATE, interpret — never restate as fact)`
        : `Operating projections (computed - ${pr.horizonYears}y forward; weighted path unavailable; ESTIMATE, interpret - never restate as fact)`,
      figures: projFigures,
      // D-65: the capital-return basis left the EPS series' assumptions (the
      // report states it once, under its table); the model still reads it here.
      notes: [...new Set(projectionSeries.flatMap((series) => [
        ...projectionDisplayAssumptions(series),
        ...(series.capitalReturn?.basis ? [series.capitalReturn.basis] : []),
      ])), ...(projectionPoints.weighted ? [] : ["No weighted projection points are available; no projection weights are applied."])],
    }));
  } else if (computed.projections) {
    // No weights here: nothing is weighted on this route, so none are shown.
    // The n/a row gives "probability-weighted forecasts are unavailable" a
    // gap tag to cite (D-43; report 26 cited "unsupported" for it).
    sections.push(payloadSection({
      title: "Weighted projections (computed)",
      figures: [{ label: "weighted projections", value: null, unit: "", source: "computed.projections", asOf: null }],
      notes: [`not applicable: ${computed.projections.notApplicableReason ?? "No actual forward projection points are available."}`],
    }));
  }

  const scenarioPresentation = buildScenarioPresentation(computed, currentPrice);
  const sensitivity = scenarioPresentation.sensitivity;
  sections.push(payloadSection({
    title: "Deterministic scenario interpretation",
    figures: [
      { label: "sensitivity conclusion within the modeled grid", value: sensitivity.conclusion, unit: "", source: "computed.scenarioPresentation.sensitivity", asOf: null },
      { label: "minimum available sensitivity-grid value", value: sensitivity.minPerShare, unit: computed.fairValue?.perShare?.unit ?? "per share (currency unknown)", source: "computed.scenarioPresentation.sensitivity.minPerShare", asOf: computed.fairValue?.perShare?.asOf ?? null },
      { label: "maximum available sensitivity-grid value", value: sensitivity.maxPerShare, unit: computed.fairValue?.perShare?.unit ?? "per share (currency unknown)", source: "computed.scenarioPresentation.sensitivity.maxPerShare", asOf: computed.fairValue?.perShare?.asOf ?? null },
    ],
    notes: [scenarioPresentation.weightBasis, scenarioPresentation.interpretation],
  }));

  // --- Runway (overlay-gated) ----------------------------------------------
  if (computed.runway) {
    const rw = computed.runway;
    sections.push(payloadSection({
      title: "Runway (computed — pre-revenue/unprofitable overlay)",
      figures: [
        { label: "avg quarterly burn", value: rw.avgQuarterlyBurn, unit: "currency", currency: currencies.runwayBurn, source: "computed.runway", asOf: rw.liquidAssetsAsOf },
        { label: "liquid assets", value: rw.liquidAssets, unit: "currency", currency: currencies.runwayLiquidity, source: "computed.runway.liquidAssets", asOf: rw.liquidAssetsAsOf },
        { label: "runway (quarters)", value: rw.runwayQuarters, unit: "quarters", source: "computed.runway", asOf: rw.liquidAssetsAsOf },
        { label: "estimated exhaustion date", value: rw.estimatedExhaustionDate, unit: "", source: "computed.runway", asOf: rw.liquidAssetsAsOf },
      ],
      notes: rw.notes,
    }));
  }

  // --- Suppressed metrics (disclose why a figure is absent) ----------------
  if (computed.suppressed.length > 0) {
    sections.push(payloadSection({
      title: "Suppressed metrics (sector policy)",
      figures: computed.suppressed.map((s) => ({
        label: s.key,
        value: "suppressed",
        unit: "",
        source: "computed.suppressed",
        asOf: null,
      })),
      notes: computed.suppressed.map((s) => `${s.key}: ${s.reason}`),
    }));
  }

  return sections;
}

/* ------------------------------------------------------------------------ *
 * Statement extracts — compact (last N annual + M quarterly key line items)
 * ------------------------------------------------------------------------ */

/** Key income-statement line items kept in the compact extract. */
const INCOME_LINE_ITEMS: { key: keyof FmpIncomeStatementRow; label: string; unit: string }[] = [
  { key: "revenue", label: "revenue", unit: "currency" },
  { key: "grossProfit", label: "gross profit", unit: "currency" },
  { key: "operatingIncome", label: "operating income", unit: "currency" },
  { key: "ebit", label: "EBIT", unit: "currency" },
  { key: "netIncome", label: "net income", unit: "currency" },
  { key: "netIncomeConsolidated", label: "consolidated net income", unit: "currency" },
  { key: "netIncomeAttributableToNoncontrollingInterest", label: "noncontrolling interest net income", unit: "currency" },
  { key: "epsDiluted", label: "diluted EPS", unit: "currency/share" },
  { key: "weightedAverageShsOutDil", label: "diluted shares", unit: "shares" },
  { key: "interestExpense", label: "interest expense", unit: "currency" },
  { key: "incomeBeforeTax", label: "income before tax", unit: "currency" },
  { key: "incomeTaxExpense", label: "income tax expense", unit: "currency" },
  { key: "equityMethodIncomeLoss", label: "equity-method income (loss), as filed", unit: "currency" },
];

const BALANCE_LINE_ITEMS: { key: keyof FmpBalanceSheetRow; label: string; unit: string }[] = [
  { key: "totalAssets", label: "total assets", unit: "currency" },
  { key: "totalLiabilities", label: "total liabilities", unit: "currency" },
  { key: "totalStockholdersEquity", label: "stockholders equity", unit: "currency" },
  { key: "totalDebt", label: "total debt", unit: "currency" },
  // D-60: the vendor netDebt field nets cash only (total debt − cash and
  // equivalents) and contradicted the house net debt in prose (NVDA report 34:
  // +$16.4B beside −$66.0B); the house figure is in the current-capital section.
  { key: "cashAndShortTermInvestments", label: "cash + STI", unit: "currency" },
];

const CASHFLOW_LINE_ITEMS: { key: keyof FmpCashFlowRow; label: string; unit: string }[] = [
  { key: "netIncome", label: "net income (cash-flow)", unit: "currency" },
  { key: "operatingCashFlow", label: "operating cash flow", unit: "currency" },
  { key: "netCashProvidedByOperatingActivities", label: "cash flow from operating activities (CFO)", unit: "currency" },
  { key: "netCashProvidedByInvestingActivities", label: "cash flow from investing activities (CFI)", unit: "currency" },
  { key: "capitalExpenditure", label: "capex (negative)", unit: "currency" },
  { key: "freeCashFlow", label: "free cash flow", unit: "currency" },
  { key: "stockBasedCompensation", label: "stock-based comp", unit: "currency" },
  { key: "commonStockRepurchased", label: "buybacks (negative)", unit: "currency" },
];

/** "FY2025" or "Q1 FY2026" from a statement row's own fiscal fields; null when either is missing or malformed. */
function issuerFiscalLabel(row: FmpRawRow): string | null {
  const year = typeof row.fiscalYear === "number" ? String(row.fiscalYear) : row.fiscalYear;
  if (typeof year !== "string" || !/^(?:19|20)\d{2}$/.test(year.trim())) return null;
  const period = typeof row.period === "string" ? row.period.trim().toUpperCase() : null;
  if (period === "FY") return `FY${year.trim()}`;
  if (period !== null && /^Q[1-4]$/.test(period)) return `${period} FY${year.trim()}`;
  return null;
}

/** Source boundaries only: issuer calendars and 52/53-week years vary (SEC API guidance). */
function statementPeriodContext(row: FmpRawRow, key: string, kind: "instant" | "duration"): PeriodContext | undefined {
  const field = (row as FmpStatementRow).fieldProvenance?.[key];
  const fiscalLabel = issuerFiscalLabel(row);
  const annotation = fiscalLabel === null ? {} : { fiscalLabel };
  let context: unknown;
  if (kind === "instant") {
    // A balance-sheet column establishes an instant even when no field-level
    // evidence exists. A contradictory duration is not relabeled as a balance.
    if (field && field.periodStart !== null) return undefined;
    context = { kind, at: field?.periodEnd ?? isoDay(row.date), ...annotation };
  } else {
    // A flow's end alone never establishes Q/H1/TTM or a start boundary.
    if (!field || field.periodStart === null) return undefined;
    const period = typeof row.period === "string" ? row.period.trim().toUpperCase() : "";
    const basis: PeriodContext["basis"] = period === "FY" ? "fiscal-year"
      : /^Q[1-4]$/.test(period) ? "fiscal-quarter"
        : /^H[12]$/.test(period) ? "fiscal-half-year"
          : period === "YTD" ? "year-to-date"
            : period === "TTM" || period === "LTM" ? "rolling-12-month" : undefined;
    context = { kind, start: field.periodStart, end: field.periodEnd,
      ...(basis === undefined ? {} : { basis }), ...annotation };
  }
  const parsed = PeriodContextSchema.safeParse(context);
  if (!parsed.success) return undefined;
  // Contradictory row/field dates establish no context for this column.
  const end = parsed.data.kind === "instant" ? parsed.data.at : parsed.data.end;
  return end === isoDay(row.date) ? parsed.data : undefined;
}

/** Statement adapters currently establish FMP or EDGAR; never invent a provider. */
function statementSourceTag(provider: unknown, statement: string): string {
  return `${provider === "fmp" || provider === "edgar" ? provider : "unknown"}:${statement}`;
}

function statementCellSource(row: FmpRawRow, key: string, envelopeSource: string): string {
  const statement = envelopeSource.slice(envelopeSource.indexOf(":") + 1);
  const fields = (row as FmpStatementRow).fieldProvenance;
  // SEC enrichment supplements one field; backfill tags a whole row while
  // retaining the FMP envelope. An explicit but unknown source cannot inherit
  // a known provider from a broader level of evidence.
  if (fields && Object.hasOwn(fields, key)) return statementSourceTag(fields[key]?.source, statement);
  if (Object.hasOwn(row, "source")) return statementSourceTag(row.source, statement);
  return envelopeSource;
}

function extractStatement<TRow extends FmpRawRow>(
  title: string,
  rows: TRow[],
  periods: number,
  asOf: string,
  lineItems: { key: keyof TRow; label: string; unit: string }[],
  source: string,
  periodKind: "instant" | "duration" = "duration",
): StatementExtractBlock | null {
  const kept = rows.slice(0, periods);
  if (kept.length === 0) return null;
  const periodLabels = kept.map((r) => isoDay(r.date) ?? "unknown");
  const fiscalLabels = kept.map((r) => issuerFiscalLabel(r));
  const lines: StatementLineExtract[] = lineItems.map((li) => ({
    lineItem: periodKind === "instant" && li.key === "totalDebt" && kept.some(r => incompleteLeaseCoverage(r as FmpBalanceSheetRow) !== null)
      ? "debt including disclosed lease portion (full lease coverage unverified; see period notes)" : li.label,
    unit: li.unit,
    source,
    byPeriod: kept.map((r, i) => {
      const periodContext = statementPeriodContext(r, String(li.key), periodKind);
      const cellSource = statementCellSource(r, String(li.key), source);
      return {
        period: periodLabels[i],
        ...(periodContext === undefined ? {} : { periodContext }),
        ...(cellSource === source ? {} : { source: cellSource }),
        ...(fiscalLabels[i] === null ? {} : { fiscalPeriod: fiscalLabels[i] }),
        value: (r as FmpStatementRow).fieldConflicts?.[String(li.key)]?.usable === false ? null : numOrNull(r[li.key]),
        currency: isoCurrency(r.reportedCurrency),
        asOf,
      };
    }),
  }));
  return { title, periods: periodLabels, lineItems: lines, notes: periodKind !== "instant" ? [] : kept.flatMap(r => {
    const coverage = incompleteLeaseCoverage(r as FmpBalanceSheetRow);
    return coverage === null ? [] : [`${isoDay(r.date) ?? "Unknown balance date"}: ${coverage.note}`];
  }) };
}

function statementExtracts(bundle: DataBundle): StatementExtractBlock[] {
  const blocks: StatementExtractBlock[] = [];
  const A = PAYLOAD_BUDGETS.annualPeriods;
  const Q = PAYLOAD_BUDGETS.quarterlyPeriods;
  const facts = confirmedIssuerFacts(bundle.symbol, bundle.edgar);
  const currencyEvidence = statementCurrencyEvidence(bundle);
  // Stage B may admit an old/raw snapshot locally. Repeat the same immutable
  // admission before raw statement cells can enter the analyst or verifier registry.
  const balances = (rows: FmpBalanceSheetRow[]): FmpBalanceSheetRow[] => facts === null ? rows : rows.map((row) =>
    admitDebtFields(row, facts, establishedCurrencyOn([row], isoDay(row.date), currencyEvidence), bundle.builtAt, debtPresentationSections(bundle.edgar)).row);
  const push = (b: StatementExtractBlock | null): void => {
    if (b) blocks.push(b);
  };
  const statementAsOf = (statement: DataBundle["statements"]["incomeAnnual"]): string =>
    statement.ok ? statement.value.asOf : "";
  const source = (statement: DataBundle["statements"]["incomeAnnual"], name: string): string =>
    statementSourceTag(statement.ok ? statement.value.source : undefined, name);
  push(extractStatement("Income statement — annual", rowsOf(bundle.statements.incomeAnnual), A, statementAsOf(bundle.statements.incomeAnnual), INCOME_LINE_ITEMS, source(bundle.statements.incomeAnnual, "income-statement(annual)")));
  push(extractStatement("Income statement — quarterly", rowsOf(bundle.statements.incomeQuarterly), Q, statementAsOf(bundle.statements.incomeQuarterly), INCOME_LINE_ITEMS, source(bundle.statements.incomeQuarterly, "income-statement(quarter)")));
  push(extractStatement("Balance sheet — annual", balances(rowsOf(bundle.statements.balanceAnnual)), A, statementAsOf(bundle.statements.balanceAnnual), BALANCE_LINE_ITEMS, source(bundle.statements.balanceAnnual, "balance-sheet(annual)"), "instant"));
  push(extractStatement("Balance sheet — quarterly", balances(rowsOf(bundle.statements.balanceQuarterly)), Q, statementAsOf(bundle.statements.balanceQuarterly), BALANCE_LINE_ITEMS, source(bundle.statements.balanceQuarterly, "balance-sheet(quarter)"), "instant"));
  push(extractStatement("Cash flow — annual", rowsOf(bundle.statements.cashflowAnnual), A, statementAsOf(bundle.statements.cashflowAnnual), CASHFLOW_LINE_ITEMS, source(bundle.statements.cashflowAnnual, "cash-flow(annual)")));
  push(extractStatement("Cash flow — quarterly", rowsOf(bundle.statements.cashflowQuarterly), Q, statementAsOf(bundle.statements.cashflowQuarterly), CASHFLOW_LINE_ITEMS, source(bundle.statements.cashflowQuarterly, "cash-flow(quarter)")));
  return blocks;
}

/* ------------------------------------------------------------------------ *
 * List-shaped sections (estimates, peers, insiders, holders, executives, …)
 * ------------------------------------------------------------------------ */

/**
 * The currency fields of a provider row: its own, else the issuer currency it
 * inherits (D-57), marked so the prompt and the registry disclose it.
 */
function rowCurrency(
  row: object | null | undefined,
  issuer: InheritedIssuerCurrency,
): Pick<PayloadFigureInput, "currency" | "currencyInherited"> {
  const { code, inherited } = providerRowCurrency(row, issuer);
  return inherited ? { currency: code, currencyInherited: true } : { currency: code };
}

/** One note per section whose money rows rely on the inheritance rule. */
function inheritanceNote(figures: readonly PayloadFigureInput[], issuer: InheritedIssuerCurrency): string[] {
  if (figures.some((f) => f.currencyInherited)) return [`Money rows marked "inherited": currency ${issuer.basis}.`];
  const unknownMoney = figures.some((f) => f.value !== null && f.currency === null && /^currency/.test(f.unit));
  return unknownMoney ? [`Money rows shown "(currency unknown)": the issuer currency was ${issuer.basis}.`] : [];
}

/**
 * Analyst estimates and price targets are money in the currency their OWN row
 * states (estimateCurrency), else in the issuer currency they inherit when the
 * statements and the listing agree and the issuer is not an ADR (D-57).
 * Anything else stays unknown: rendered as such to the model and never
 * registered, so no citation of it verifies in any currency.
 */
function estimatesSection(bundle: DataBundle, issuer: InheritedIssuerCurrency): PayloadSection {
  const figures: PayloadFigureInput[] = [];
  const notes: string[] = [];
  const estAsOf = bundle.analystEstimates.ok ? bundle.analystEstimates.value.asOf : null;
  const est = rowsOf(bundle.analystEstimates).slice(0, PAYLOAD_BUDGETS.listRows);
  for (const e of est) {
    const currency = rowCurrency(e, issuer);
    const candidatePeriod = isoDay(e.date);
    const period = isFullIsoDate(candidatePeriod) ? candidatePeriod : null;
    const periodLabel = period ?? "unknown";
    figures.push(
      { label: `est revenue ${periodLabel}`, value: numOrNull(e.revenueAvg), unit: "currency", ...currency, period, source: "fmp:analyst-estimates", asOf: estAsOf },
      { label: `est EPS ${periodLabel}`, value: numOrNull(e.epsAvg), unit: "currency/share", ...currency, period, source: "fmp:analyst-estimates", asOf: estAsOf },
    );
  }
  const ptc = firstRow(bundle.priceTargetConsensus);
  const ptcAsOf = bundle.priceTargetConsensus.ok ? bundle.priceTargetConsensus.value.asOf : null;
  if (ptc) {
    const currency = rowCurrency(ptc, issuer);
    figures.push(
      { label: "price target consensus", value: numOrNull(ptc.targetConsensus), unit: "currency/share", ...currency, source: "fmp:price-target-consensus", asOf: ptcAsOf },
      { label: "price target high", value: numOrNull(ptc.targetHigh), unit: "currency/share", ...currency, source: "fmp:price-target-consensus", asOf: ptcAsOf },
      { label: "price target low", value: numOrNull(ptc.targetLow), unit: "currency/share", ...currency, source: "fmp:price-target-consensus", asOf: ptcAsOf },
    );
  }
  notes.push(...inheritanceNote(figures, issuer));
  const grades = firstRow(bundle.gradesConsensus);
  if (grades) {
    notes.push(
      `analyst grades consensus string (NOT a rating we adopt): ${strOrNull(grades.consensus) ?? "n/a"} ` +
        `(strongBuy ${numOrNull(grades.strongBuy) ?? "n/a"}, buy ${numOrNull(grades.buy) ?? "n/a"}, hold ${numOrNull(grades.hold) ?? "n/a"}, sell ${numOrNull(grades.sell) ?? "n/a"}, strongSell ${numOrNull(grades.strongSell) ?? "n/a"})`,
    );
  }
  const nextEarnings = nextEarningsNote(bundle);
  if (nextEarnings !== null) notes.push(nextEarnings);
  return payloadSection({ title: "Analyst estimates & targets", figures, notes });
}

/**
 * The next scheduled earnings date, as one note ending in an assembler-owned
 * tag that `attachProvenanceRegistry` registers. Until 2026-10-13 the bundle
 * derived this date and nothing rendered it, so with a Finnhub key set the
 * manifest said "dataFallback.earningsCalendarNext: Supplied by Finnhub" while
 * no date reached the model. Only the date is rendered: the row's estimated
 * EPS and revenue carry no currency, so they stay out. Every piece of the note
 * is assembler-controlled — the source is allowlisted and both dates must be
 * real ISO days — so no provider text can forge the trailing tag.
 */
function nextEarningsNote(bundle: DataBundle): string | null {
  const next = bundle.earningsCalendarNext;
  if (!next.ok) return null;
  const source = next.value.source;
  if (source !== "fmp" && source !== "finnhub") return null;
  const date = typeof next.value.data.date === "string" ? next.value.data.date.slice(0, 10) : "";
  const asOf = next.value.asOf;
  if (!isFullIsoDate(date) || !isFullIsoDate(asOf)) return null;
  return `next scheduled earnings date per provider calendar (a provider schedule, not a company confirmation): ${date} [${source}:earnings-calendar · ${asOf}]`;
}

/**
 * FMP's stock-peers list draws peers from the subject's own exchange, so a
 * peer market cap without a currency inherits the subject's listing currency
 * under the same D-57 rule (which requires it to equal the reporting one).
 */
function peersSection(bundle: DataBundle, issuer: InheritedIssuerCurrency): PayloadSection {
  // D-65: discovery candidates outside the comparable-size band are named in
  // a note, not listed as peers (NVDA: a $29M and a $265M listing beside $5.2T).
  const subjectCap = numOrNull(firstRow(bundle.quote)?.marketCap) ?? numOrNull(firstRow(bundle.profile)?.marketCap);
  const screened = rowsOf(bundle.peers).map((p) => ({ p, size: peerSizeExclusion(subjectCap, numOrNull(p.mktCap)) }));
  const peers = screened.filter((s) => s.size === null).map((s) => s.p).slice(0, PAYLOAD_BUDGETS.listRows);
  const asOf = bundle.peers.ok ? bundle.peers.value.asOf : null;
  const figures: PayloadFigureInput[] = peers.map((p) => ({
    label: `${strOrNull(p.symbol) ?? "?"} — ${strOrNull(p.companyName) ?? "?"}`,
    value: numOrNull(p.mktCap),
    unit: "currency mkt cap",
    ...rowCurrency(p, issuer),
    source: "fmp:stock-peers",
    asOf,
  }));
  const sizeNotes = screened.filter((s) => s.size !== null)
    .map((s) => `${strOrNull(s.p.symbol) ?? "?"} (${strOrNull(s.p.companyName) ?? "?"}) is not listed as a peer: ${s.size}.`);
  return payloadSection({ title: "Peers", figures, notes: [...inheritanceNote(figures, issuer), ...sizeNotes] });
}

function insidersSection(bundle: DataBundle): PayloadSection {
  const figures: PayloadFigureInput[] = [];
  const notes: string[] = [];
  const stats = firstRow(bundle.insiderStats);
  const statsAsOf = bundle.insiderStats.ok ? bundle.insiderStats.value.asOf : null;
  if (stats) {
    figures.push(
      { label: "insider total purchases", value: numOrNull(stats.totalPurchases), unit: "shares", source: "fmp:insider-statistics", asOf: statsAsOf },
      { label: "insider total sales", value: numOrNull(stats.totalSales), unit: "shares", source: "fmp:insider-statistics", asOf: statsAsOf },
      { label: "acquired/disposed ratio", value: numOrNull(stats.acquiredDisposedRatio), unit: "x", source: "fmp:insider-statistics", asOf: statsAsOf },
    );
  }
  const trades = rowsOf(bundle.insiderTrades).slice(0, PAYLOAD_BUDGETS.listRows);
  for (const tr of trades) {
    const d = isoDay(tr.transactionDate) ?? isoDay(tr.filingDate) ?? "unknown";
    notes.push(
      `${d} ${strOrNull(tr.reportingName) ?? "?"} (${strOrNull(tr.typeOfOwner) ?? "?"}): ` +
        `${strOrNull(tr.transactionType) ?? "?"} ${numOrNull(tr.securitiesTransacted) ?? "?"} @ ${numOrNull(tr.price) ?? "?"} [fmp:insider-trades · ${d}]`,
    );
  }
  // Finnhub MSPR insider sentiment.
  if (bundle.insiderSentiment.ok) {
    const months = bundle.insiderSentiment.value.data.slice(-6);
    for (const m of months) {
      figures.push({
        label: `MSPR ${m.year}-${String(m.month).padStart(2, "0")}`,
        value: m.mspr,
        // A bare unit to copy (D-44); "" and "index" register identically.
        unit: "index",
        source: "finnhub:insider-sentiment",
        asOf: `${m.year}-${String(m.month).padStart(2, "0")}-01`,
      });
    }
  }
  return payloadSection({ title: "Insider activity & sentiment", figures, notes });
}

function institutionalSection(bundle: DataBundle): PayloadSection {
  const inst = bundle.institutional;
  const figures: PayloadFigureInput[] = [];
  const summary = firstRow(inst.positionsSummary);
  if (summary) {
    figures.push(
      { label: "investors holding", value: numOrNull(summary.investorsHolding), unit: "count", source: "fmp:13f-positions-summary", asOf: inst.quarterEnd },
      { label: "ownership %", value: numOrNull(summary.ownershipPercent), unit: "%", source: "fmp:13f-positions-summary", asOf: inst.quarterEnd },
      { label: "new positions", value: numOrNull(summary.newPositions), unit: "count", source: "fmp:13f-positions-summary", asOf: inst.quarterEnd },
      { label: "closed positions", value: numOrNull(summary.closedPositions), unit: "count", source: "fmp:13f-positions-summary", asOf: inst.quarterEnd },
      { label: "put/call ratio", value: numOrNull(summary.putCallRatio), unit: "x", source: "fmp:13f-positions-summary", asOf: inst.quarterEnd },
    );
  }
  const holders = rowsOf(inst.topHolders).slice(0, PAYLOAD_BUDGETS.listRows);
  for (const h of holders) {
    figures.push({
      label: `holder ${strOrNull(h.investorName) ?? "?"}`,
      value: numOrNull(h.sharesNumber),
      unit: "shares",
      source: "fmp:13f-holders",
      asOf: inst.quarterEnd,
    });
  }
  return payloadSection({
    title: `Institutional (13F ${inst.year} Q${inst.quarter}, quarter end ${inst.quarterEnd})`,
    figures,
    notes: [`13F data inherently lags the covered quarter by up to 45 days — label with the reporting quarter end ${inst.quarterEnd}, not the fetch date.`],
  });
}

function leadershipSection(bundle: DataBundle, issuer: InheritedIssuerCurrency): PayloadSection {
  const figures: PayloadFigureInput[] = [];
  const notes: string[] = [];
  const execAsOf = bundle.executives.ok ? bundle.executives.value.asOf : null;
  const execs = rowsOf(bundle.executives).slice(0, PAYLOAD_BUDGETS.listRows);
  for (const e of execs) {
    notes.push(
      `${strOrNull(e.name) ?? "?"} — ${strOrNull(e.title) ?? "?"}` +
        `${e.titleSince ? ` (since ${isoDay(e.titleSince)})` : ""}` +
        `${isNum(e.pay) ? `, pay ${e.pay} ${strOrNull(e.currencyPay) ?? ""}` : ""} [fmp:key-executives]`,
    );
  }
  const comp = rowsOf(bundle.compensation).slice(0, PAYLOAD_BUDGETS.listRows);
  for (const c of comp) {
    figures.push({
      label: `comp ${strOrNull(c.nameAndPosition) ?? "?"} FY${numOrNull(c.year) ?? "?"}`,
      value: numOrNull(c.total),
      unit: "currency",
      ...rowCurrency(c, issuer),
      source: "fmp:executive-compensation",
      asOf: isoDay(c.filingDate),
    });
  }
  void execAsOf;
  notes.push(...inheritanceNote(figures, issuer));
  return payloadSection({ title: "Leadership & compensation", figures, notes });
}

function shortInterestSection(bundle: DataBundle): PayloadSection {
  const figures: PayloadFigureInput[] = [];
  const notes: string[] = [];
  if (bundle.shortInterest.ok) {
    const si = bundle.shortInterest.value.data;
    figures.push(
      { label: "short position", value: numOrNull(si.currentShortPositionQuantity), unit: "shares", source: "finra:short-interest", asOf: si.settlementDate },
      { label: "days to cover", value: si.daysToCoverQuantity, unit: "days", source: "finra:short-interest", asOf: si.settlementDate },
      { label: "avg daily volume", value: si.averageDailyVolumeQuantity, unit: "shares", source: "finra:short-interest", asOf: si.settlementDate },
    );
    notes.push(...si.notes);
  }
  return payloadSection({ title: "Short interest", figures, notes });
}

function segmentsSection(bundle: DataBundle): PayloadSection {
  const figures: PayloadFigureInput[] = [];
  const build = (
    res: DataBundle["segmentation"]["product"],
    kind: string,
  ): void => {
    const latest = firstRow(res);
    const asOf = isoDay(latest?.date);
    // The segmentation row's own label; nothing else states its currency.
    const currency = isoCurrency(latest?.reportedCurrency);
    const data = latest?.data;
    if (data && typeof data === "object") {
      // Deterministic ordering: sort segment keys alphabetically.
      for (const key of Object.keys(data).sort()) {
        figures.push({
          label: `${kind}: ${key}`,
          value: numOrNull(data[key]),
          unit: "currency",
          currency,
          source: res.ok && res.value.source === "edgar" ? res.value.endpoint : `fmp:revenue-${kind}-segmentation`,
          asOf,
          ...(kind === "geographic" && selectedGeographyNotes(res).length > 0 ? { period: asOf } : {}),
        });
      }
    }
  };
  build(bundle.segmentation.product, "product");
  build(bundle.segmentation.geographic, "geographic");
  return payloadSection({
    title: "Revenue segmentation (as-reported keys — never hard-coded)",
    figures,
    notes: selectedGeographyNotes(bundle.segmentation.geographic),
  });
}

function macroSection(bundle: DataBundle): PayloadSection {
  const figures: PayloadFigureInput[] = [];
  const conversions: string[] = [];
  // Core series carry the transform the dashboard fetched them with (CPI is
  // YoY %); sector series are fetched as levels (dataBundle: units "lin").
  const coreUnits = new Map(CORE_SERIES.map((spec) => [spec.id, spec.units]));
  const emit = (
    record: Record<string, { ok: boolean; value?: { data: unknown } }>,
    tag: string,
    unitsOf: (seriesId: string) => FredUnits,
  ): void => {
    // Deterministic ordering: sort series ids.
    for (const seriesId of Object.keys(record).sort()) {
      const res = record[seriesId];
      if (res.ok && res.value) {
        const obs = res.value.data as { date: string; value: number }[];
        const last = obs[obs.length - 1];
        if (last) {
          const figureUnit = fredFigureUnit(seriesId, unitsOf(seriesId));
          const served = numOrNull(last.value);
          figures.push({
            label: `${seriesId}${tag}`,
            // FRED serves its scaled series with at most three decimals, so a
            // ×1,000 or larger product is a whole number; rounding only removes
            // binary float noise that would otherwise fail the value match.
            value: served === null || figureUnit.scale === 1 ? served : Math.round(served * figureUnit.scale),
            unit: figureUnit.unit,
            source: `fred:${seriesId}`,
            asOf: last.date,
          });
          if (figureUnit.qualifier !== null) conversions.push(`${seriesId}: ${figureUnit.qualifier}`);
        }
      }
    }
  };
  emit(
    bundle.macro.core as Record<string, { ok: boolean; value?: { data: unknown } }>,
    " (core)",
    (seriesId) => coreUnits.get(seriesId) ?? "lin",
  );
  emit(bundle.macro.sector as Record<string, { ok: boolean; value?: { data: unknown } }>, " (sector)", () => "lin");
  return payloadSection({
    title: "Macro (FRED latest values)",
    figures,
    notes: [bundle.macro.attribution, ...(conversions.length > 0 ? [`Units: ${conversions.join("; ")}`] : [])],
  });
}

function newsSection(bundle: DataBundle): PayloadSection {
  const figures: PayloadFigureInput[] = [];
  const notes: string[] = [];
  let used = 0;
  let clippedRows = 0;
  let droppedRows = 0;
  const budget = PAYLOAD_BUDGETS.newsChars;
  const addRows = (rows: FmpRawRow[], tag: string, provider: string): void => {
    for (const r of rows) {
      if (used >= budget) {
        droppedRows += 1;
        continue;
      }
      const d = isoDay(r.publishedDate) ?? "unknown";
      const title = strOrNull(r.title) ?? "";
      const text = strOrNull(r.text) ?? "";
      const line = `${d} [${tag}] ${strOrNull(r.publisher) ?? "?"}: ${title}${text ? ` — ${text}` : ""}`;
      const clipped = line.length + used > budget ? line.slice(0, Math.max(0, budget - used)) : line;
      if (clipped.length < line.length) clippedRows += 1;
      notes.push(`${clipped} [${provider}:${tag} · ${d}]`);
      used += clipped.length;
    }
  };
  if (bundle.news.ok) addRows(rowsOf(bundle.news).slice(0, PAYLOAD_BUDGETS.listRows), "news", bundle.news.value.source);
  if (bundle.pressReleases.ok) addRows(rowsOf(bundle.pressReleases).slice(0, PAYLOAD_BUDGETS.listRows), "press-release", bundle.pressReleases.value.source);
  // Every truncation is disclosed (module rule): a snippet cut mid-line or a
  // row left out for the budget used to vanish silently (audit 2026-09-06,
  // F171). The note carries no source tag, so it registers no citation.
  if (clippedRows > 0 || droppedRows > 0) {
    const parts: string[] = [];
    if (clippedRows > 0) parts.push(`${clippedRows} snippet${clippedRows === 1 ? "" : "s"} clipped mid-line`);
    if (droppedRows > 0) parts.push(`${droppedRows} row${droppedRows === 1 ? "" : "s"} omitted`);
    notes.push(`${TRUNCATION_MARKER} ${parts.join("; ")} to fit the ${budget}-char news budget]`);
  }
  return payloadSection({ title: "Recent news & press releases (snippets)", figures, notes });
}

/* ------------------------------------------------------------------------ *
 * Text excerpts (transcript + filings) — budgeted with disclosure
 * ------------------------------------------------------------------------ */

function transcriptExcerpt(bundle: DataBundle): TextExcerpt | null {
  const t = firstRow(bundle.transcript.latest);
  const content = strOrNull(t?.content);
  if (!content) return null;
  const asOf = isoDay(t?.date);
  const cut = selectMaterialEvidence(content, PAYLOAD_BUDGETS.transcriptChars);
  const period = strOrNull(t?.period);
  const year = numOrNull(t?.year);
  return {
    title: `Latest earnings-call transcript${period ? ` (${period}${year ? ` FY${year}` : ""})` : ""}`,
    text: cut.text,
    source: "fmp:earning-call-transcript",
    asOf,
    truncated: cut.truncated,
    originalChars: cut.originalChars,
    spans: cut.spans,
    coverage: cut.coverage,
  };
}

/** D-63: a long risk-factor section keeps a share of its length, between the floor and the cap. */
export function riskFactorBudget(sourceChars: number): number {
  return Math.min(PAYLOAD_BUDGETS.item1aMaxChars,
    Math.max(PAYLOAD_BUDGETS.item1aChars, Math.round(sourceChars * PAYLOAD_BUDGETS.item1aLongShare)));
}

/**
 * D-66: the fiscal label an earnings release gives the quarter ending on (or
 * within three days of) `periodEnd`; an annual filing takes that quarter's
 * fiscal year. Null when no release reports that period.
 */
function fiscalLabelOf(bundle: DataBundle, periodEnd: string, form: string): string | null {
  const res = bundle.edgar?.currentReports;
  if (!res?.ok) return null;
  const day = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);
  const release = res.value.data.releases.find((r) => r.reported.periodEnd !== null && isIsoDate(r.reported.periodEnd) &&
    Math.abs(day(r.reported.periodEnd) - day(periodEnd)) <= 3 * 86_400_000 && r.reported.fiscal !== null);
  const label = release?.reported.fiscal?.label ?? null;
  if (label === null) return null;
  if (form === "10-K" || form === "20-F") return /^Q4\s+(FY\d{4})$/.exec(label)?.[1] ?? null;
  return /^Q[1-3]\s+FY\d{4}$/.test(label) ? label : null;
}

function filingExcerpts(bundle: DataBundle): TextExcerpt[] {
  const out: TextExcerpt[] = [];
  const add = (
    res: { ok: boolean; value?: { data: { text: string; reportDate: string; filingDate?: string; form: string; accession: string; marker?: string } } } | undefined,
    title: (form: string) => string,
    budget: number | ((sourceChars: number) => number),
    source: (form: string) => string,
    profile: EvidenceProfile = "financial",
  ): void => {
    if (!res?.ok || !res.value) return;
    const sec = res.value.data;
    const cut = selectMaterialEvidence(sec.text, typeof budget === "number" ? budget : budget(sec.text.length), profile);
    const markerNote = sec.marker === "unchanged_from_10k" ? " [10-Q Item 1A: unchanged from the 10-K]" : "";
    const reportingPeriod = isoDay(sec.reportDate);
    const filingDate = isoDay(sec.filingDate);
    // D-66: the issuer's own fiscal label for that period, from its earnings
    // release ("Q2 FY2027"), so a figure stated for "the second quarter of
    // fiscal 2027" is read against the excerpt that reports it.
    const fiscal = reportingPeriod !== null && isIsoDate(reportingPeriod) ? fiscalLabelOf(bundle, reportingPeriod, sec.form) : null;
    const dateNote = (reportingPeriod !== null && isIsoDate(reportingPeriod) ? `; reporting period ended ${reportingPeriod}${fiscal === null ? "" : ` (${fiscal})`}` : "") +
      (filingDate !== null && isIsoDate(filingDate) ? `; filed ${filingDate}` : "");
    out.push({
      title: `${title(sec.form)}${markerNote} (${sec.form} ${sec.accession}${dateNote})`,
      text: cut.text,
      source: source(sec.form),
      asOf: isoDay(sec.reportDate),
      truncated: cut.truncated,
      originalChars: cut.originalChars,
      spans: cut.spans,
      coverage: cut.coverage,
    });
  };
  // D-63: the business description (software platform, roadmap, customers,
  // suppliers, competitors, officers) and the latest 10-Q's notes join the
  // risk factors and MD&A; risk factors are read for business risks too.
  add(
    bundle.edgar.business,
    (form) => (form === "20-F" ? "20-F Item 4 — Information on the Company" : "10-K Item 1 — Business"),
    PAYLOAD_BUDGETS.businessChars,
    (form) => (form === "20-F" ? "edgar:20-F item4" : "edgar:10-K item1"),
    "business",
  );
  add(
    bundle.edgar.item1a,
    (form) => (form === "20-F" ? "20-F Item 3.D — Risk Factors" : "10-K Item 1A — Risk Factors"),
    riskFactorBudget,
    (form) => (form === "20-F" ? "edgar:20-F item3D" : "edgar:10-K item1A"),
    "risk",
  );
  add(
    bundle.edgar.mdna,
    (form) => (form === "20-F" ? "20-F Item 5 — Operating and Financial Review and Prospects" : "10-K Item 7 — MD&A"),
    PAYLOAD_BUDGETS.mdnaChars,
    (form) => (form === "20-F" ? "edgar:20-F item5" : "edgar:10-K item7"),
  );
  // D-66: the 10-Q MD&A keeps its concentration-of-revenue statements first.
  add(bundle.edgar.tenQMdna, () => "10-Q Item 2 — MD&A", PAYLOAD_BUDGETS.tenQMdnaChars, () => "edgar:10-Q item2", "interim");
  add(bundle.edgar.tenQNotes, () => "10-Q Part I Item 1 — Notes to the financial statements", PAYLOAD_BUDGETS.tenQNotesChars, () => "edgar:10-Q notes", "notes");
  // D-66: the annual notes and the 10-Q's Other Information (trading arrangements).
  add(bundle.edgar.tenKNotes, () => "10-K — Notes to the consolidated financial statements", PAYLOAD_BUDGETS.tenKNotesChars, () => "edgar:10-K notes", "notes");
  add(bundle.edgar.tenQOther, () => "10-Q Part II Item 5 — Other Information", PAYLOAD_BUDGETS.tenQOtherChars, () => "edgar:10-Q item5");
  const signatures = periodicPrimaryExcerpt(bundle, "signatures");
  if (signatures !== null) out.push(signatures);
  const controls = periodicPrimaryExcerpt(bundle, "controls");
  if (controls !== null) out.push(controls);
  out.push(...currentReportExcerpts(bundle));
  out.push(...companyIrMaterialExcerpts(bundle));
  return out;
}

/** Same primary-document admission for dated roles and the controls conclusion. */
function periodicPrimaryExcerpt(bundle: DataBundle, kind: "signatures" | "controls"): TextExcerpt | null {
  const notes = bundle.edgar?.tenQNotes, filing = bundle.edgar?.latestTenQ, mapping = bundle.edgar?.cik;
  if (!notes?.ok || notes.value.source !== "edgar" || !filing?.ok || filing.value.source !== "edgar" || !mapping?.ok ||
      mapping.value.source !== "edgar" || mapping.value.data.ticker.trim().toUpperCase() !== bundle.symbol.trim().toUpperCase()) return null;
  const section = notes.value.data, metadata = filing.value.data;
  const cutoff = bundle.builtAt.slice(0, 10), cik = mapping.value.data.cik;
  if (!isIsoDate(cutoff) || !Number.isSafeInteger(cik) || cik <= 0 || section.sectionName !== "tenQNotes" || section.form !== "10-Q" ||
      !isIsoDate(section.reportDate) || !isIsoDate(section.filingDate) || section.reportDate > section.filingDate || section.filingDate > cutoff ||
      section.accession !== metadata.accessionNumber || section.form !== metadata.form || section.filingDate !== metadata.filingDate ||
      section.reportDate !== metadata.reportDate || !/^\d{10}-\d{2}-\d{6}$/.test(section.accession) ||
      !/^[A-Za-z0-9_.-]+\.html?$/.test(metadata.primaryDocument)) return null;
  const url = `https://www.sec.gov/Archives/edgar/data/${cik}/${section.accession.replaceAll("-", "")}/${metadata.primaryDocument}`;
  if (section.documentUrl !== url || (notes.value.endpoint !== url && notes.value.endpoint !== `${url} (10-Q Item 1)`)) return null;
  const raw = kind === "signatures" ? section.signaturesText : section.controlsText;
  const text = typeof raw === "string" ? (kind === "signatures" ? periodicSignatureText(raw) : periodicControlsText(raw)) : null;
  if (text === null) return null;
  if (kind === "controls") {
    const selected = selectMaterialEvidence(text, 6_000, "risk");
    return { title: `10-Q Part I Item 4 - Controls and Procedures (${section.accession}; period ended ${section.reportDate}; filed ${section.filingDate}; ${url})`,
      source: `edgar:10-Q item4 ${section.accession}`, asOf: section.filingDate, ...selected };
  }
  const dates = [...text.matchAll(/\bDate:\s*((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4})\b/g)]
    .map(match => isoFromMonthDate(match[1]!));
  if (dates.length === 0 || dates.some(date => date === null || date < section.reportDate || date > section.filingDate)) return null;
  return { title: `10-Q signatures; dated officer identity only, performance unestablished (${section.accession}; filed ${section.filingDate}; ${url})`,
    source: `edgar:10-Q signatures ${section.accession}`, asOf: section.filingDate, text, truncated: false, originalChars: text.length,
    spans: [{ start: 0, end: text.length, text }], coverage: { version: "periodic-signatures-1", retainedChars: text.length, omittedChars: 0, categories: [] } };
}

/** Official company statements remain distinct from SEC filings and news-feed snippets. */
function companyIrMaterialExcerpts(bundle: DataBundle): TextExcerpt[] {
  const result = bundle.companyIrMaterialEvents;
  if (!result?.ok) return [];
  return result.value.data.events.slice(0, 3).filter((event) => isIsoDate(event.publishedAt.slice(0, 10)) && event.publishedAt.slice(0, 10) <= bundle.builtAt.slice(0, 10)).map((event) => {
    const omittedChars = Math.max(0, event.originalChars - event.text.length);
    return {
      title: `Official company news: ${event.title} (${event.status}; consideration and funding not established by this reader)`,
      source: event.url, asOf: event.publishedAt.slice(0, 10),
      text: event.text + (omittedChars > 0 ? `\n\n${TRUNCATION_MARKER} ${omittedChars} of ${event.originalChars} source chars omitted; bounded official-news selection is not a comprehensive review]` : ""),
      truncated: omittedChars > 0, originalChars: event.originalChars, spans: [event.span],
      coverage: { version: "official-material-statement-1", retainedChars: event.text.length, omittedChars, categories: [] },
      sourceEvidence: { kind: "issuer-statement" as const, publishedAt: event.publishedAt, observedAt: event.observedAt, sourceHash: event.sourceHash, authorityChain: event.authorityChain },
    };
  });
}

/**
 * The latest earnings release and CFO commentary narratives, and one excerpt
 * per material-event 8-K (audit work package 3). Each 8-K excerpt has its own
 * source (the accession) and as-of (its filing date), so a sentence citing it
 * is read against that filing's text only (D-45 excerpt matching).
 */
function currentReportExcerpts(bundle: DataBundle): TextExcerpt[] {
  const res = bundle.edgar?.currentReports;
  if (!res?.ok) return [];
  const out: TextExcerpt[] = [];
  const latest = res.value.data.releases[0];
  const narrative = (text: string | null, title: string, source: string, budget: number): void => {
    if (latest === undefined || text === null || text.trim() === "" || !isIsoDate(latest.filingDate)) return;
    const cut = selectMaterialEvidence(text, budget);
    out.push({ title, text: cut.text, source, asOf: latest.filingDate, truncated: cut.truncated, originalChars: cut.originalChars, spans: cut.spans, coverage: cut.coverage });
  };
  if (latest !== undefined) {
    // D-63: the quarter end is stated too, so a figure the narrative gives
    // without restating its period is read as that quarter's (claimEvidence).
    const fiscal = latest.reported.fiscal?.label ?? null;
    const periodEnd = latest.reported.periodEnd !== null && isIsoDate(latest.reported.periodEnd) ? latest.reported.periodEnd : null;
    const period = fiscal !== null && periodEnd !== null ? `${fiscal}, quarter ended ${periodEnd}` : fiscal ?? periodEnd ?? "latest quarter";
    const where = `8-K ${latest.accession}; filed ${latest.filingDate}`;
    const primaryRelease = latest.releaseExhibit === null && latest.releaseUrl !== null;
    narrative(latest.releaseNarrative, `${primaryRelease ? "8-K primary document" : "8-K EX-99.1"} - earnings release, ${period} (${where})`, primaryRelease ? `edgar:8-K ${latest.accession}` : "edgar:8-K EX-99.1", PAYLOAD_BUDGETS.earningsReleaseChars);
    narrative(latest.commentaryNarrative, `8-K EX-99.2 — CFO commentary, ${period} (${where})`, "edgar:8-K EX-99.2", PAYLOAD_BUDGETS.cfoCommentaryChars);
  }
  let used = 0;
  for (const event of res.value.data.events) {
    if (!isIsoDate(event.filingDate) || event.sections.length === 0) continue;
    if (used >= PAYLOAD_BUDGETS.eightKEventsTotalChars) break;
    const body = event.sections
      .map((s) => s.incorporates !== null ? `Item ${s.item} (${s.title}): incorporates Item ${s.incorporates} by reference.` : `Item ${s.item} (${s.title}): ${s.text}`)
      .join("\n\n");
    // D-63: the operative paragraph's dated lead, named parties and amounts
    // come first (the RVG 8-K's tenant, OpenAI, used to be cut).
    const eventBudget = materialCreditSupportClauses(body).length > 0 ? PAYLOAD_BUDGETS.eightKCreditEventChars : PAYLOAD_BUDGETS.eightKEventChars;
    const cut = selectMaterialEvidence(body, Math.min(eventBudget, PAYLOAD_BUDGETS.eightKEventsTotalChars - used), "event");
    used += cut.text.length;
    const eventDate = event.eventDate !== null && isIsoDate(event.eventDate) ? `; event date ${event.eventDate}` : "";
    out.push({
      title: `8-K current report — Items ${event.items.join(", ")} (${event.form} ${event.accession}; filed ${event.filingDate}${eventDate})`,
      text: cut.text,
      source: `edgar:8-K ${event.accession}`,
      asOf: event.filingDate,
      truncated: cut.truncated,
      originalChars: cut.originalChars,
      spans: cut.spans,
      coverage: cut.coverage,
    });
  }
  return out;
}

/* ------------------------------------------------------------------------ *
 * Filing disclosures — guidance, issuer FCF, capital return, XBRL segments,
 * the eight-quarter trend (audit work package 3 / data depth of 9)
 * ------------------------------------------------------------------------ */

const GUIDANCE_METRIC_LABELS: Record<GuidanceRow["metric"], string> = {
  revenue: "revenue",
  "adjusted-ebitda": "adjusted EBITDA",
  "adjusted-ebitda-margin-expansion": "adjusted EBITDA margin expansion",
  "gross-margin": "gross margin",
  "operating-expenses": "operating expenses",
  "operating-margin": "operating margin",
  "operating-income": "operating income",
  "other-income": "other income (expense)",
  "tax-rate": "tax rate",
  eps: "diluted EPS",
  "capital-expenditures": "capital expenditures",
};

const RECONCILIATION_LABELS: Record<NonNullable<FilingDisclosures["reconciliation"]>[number]["metric"], string> = {
  "operating-cash-flow": "operating cash flow (issuer reconciliation)",
  "total-capital-expenditures": "total capital expenditures (positive outflow)",
  "purchases-property-equipment": "purchases related to property and equipment and intangible assets",
  "principal-payments-property-equipment": "principal payments on property and equipment and intangible assets",
  "equity-securities-gains": "net gains from equity securities",
  "non-gaap-tax-impact": "income tax impact of non-GAAP adjustments",
  "gaap-diluted-eps": "GAAP diluted EPS",
  "non-gaap-diluted-eps": "non-GAAP diluted EPS",
};

function guidanceMetricLabel(metric: GuidanceRow["metric"], basis: GuidanceRow["basis"]): string {
  return `${GUIDANCE_METRIC_LABELS[metric]}${basis === "gaap" ? " (GAAP)" : basis === "non-gaap" ? " (non-GAAP)" : ""}`;
}

function guidanceFigureName(row: Pick<GuidanceRow, "period" | "metric" | "basis">): string {
  return `${row.period} ${guidanceMetricLabel(row.metric, row.basis)} guidance`;
}

/** D-65: the registry id of one guidance figure, as issuerFilingsSection registers it. */
export function guidanceRecordId(row: Pick<GuidanceRow, "period" | "metric" | "basis">, part: "low" | "midpoint" | "high"): string {
  return `payload.issuer-filings.${semanticSlug(`${guidanceFigureName(row)} ${part}`)}`;
}

/**
 * D-65: the registered record a guided-quarter checkpoint cites: the low end
 * of the matching range row (revenue, or GAAP gross margin) in the release's
 * guidance table. Null when no registered row carries that low end, so the
 * checkpoint keeps its filing citation rather than an id nothing registered.
 */
export function guidanceLowCitation(disclosures: FilingDisclosures | undefined): (metric: "revenue" | "gross-margin", low: number) => string | null {
  const rows = disclosures?.guidance?.rows ?? [];
  return (metric, low) => {
    const row = rows.find((r) => r.metric === metric && r.basis !== "non-gaap" && (r.form === "range" || r.form === "plus-minus")
      && Math.abs(r.low - low) <= Math.max(1e-9, Math.abs(low) * 1e-9));
    return row === undefined ? null : guidanceRecordId(row, "low");
  };
}

function guidanceUnit(unit: GuidanceRow["unit"]): string {
  return unit === "percentage-points" ? "pp" : unit === "%" ? "%" : unit === "currency-per-share" ? "currency/share" : "currency";
}

/** Guidance, prior-outlook midpoints, issuer FCF and capital return (provider rows). */
function issuerFilingsSection(disclosures: FilingDisclosures | undefined): PayloadSection | undefined {
  if (disclosures === undefined) return undefined;
  const figures: PayloadFigureInput[] = [];
  const notes: string[] = [];
  const currency = disclosures.currency;
  const g = disclosures.guidance;
  if (g !== null) {
    const source = `edgar:${g.source.form} ${g.source.exhibit ?? g.source.accession}`;
    for (const row of g.rows) {
      const name = guidanceFigureName(row);
      const base = { unit: guidanceUnit(row.unit), currency: row.unit === "%" || row.unit === "percentage-points" ? null : currency, period: row.period, source, asOf: g.source.filingDate };
      if (row.form === "range" || row.form === "plus-minus") {
        figures.push({ ...base, label: `${name} low`, value: row.low }, { ...base, label: `${name} midpoint`, value: row.mid }, { ...base, label: `${name} high`, value: row.high });
      } else {
        figures.push({ ...base, label: `${name}${row.form === "approximate" ? " (approximately)" : ""}`, value: row.mid });
      }
      if (row.previous) figures.push({ ...base, label: `${name} previous low`, value: row.previous.low }, { ...base, label: `${name} previous high`, value: row.previous.high });
      if (row.growth) figures.push({ ...base, currency: null, unit: "%", label: `${name} current revenue growth low`, value: row.growth.low }, { ...base, currency: null, unit: "%", label: `${name} current revenue growth high`, value: row.growth.high });
      if (row.previousGrowth) figures.push({ ...base, currency: null, unit: "%", label: `${name} previous revenue growth low`, value: row.previousGrowth.low }, { ...base, currency: null, unit: "%", label: `${name} previous revenue growth high`, value: row.previousGrowth.high });
    }
    notes.push(`Guidance above is the issuer's outlook from 8-K ${g.source.accession} filed ${g.source.filingDate}${g.reportedPeriod ? `, issued with ${g.reportedPeriod} results` : ""}${g.reportedPeriodEnd ? ` (quarter ended ${g.reportedPeriodEnd})` : ""}; it is a company projection, not a result.`);
    for (const q of g.qualifiers) notes.push(`Outlook caveat (issuer text): ${q}`);
  }
  for (const check of disclosures.guidanceChecks) {
    const unit = check.metric === "revenue" ? "currency" : "%";
    figures.push({
      label: `${check.period} ${guidanceMetricLabel(check.metric, check.basis)} prior guidance midpoint (8-K filed ${check.guidance.filingDate})`,
      value: check.guidedMid,
      unit,
      currency: unit === "currency" ? currency : null,
      period: check.period,
      source: `edgar:${check.guidance.form} ${check.guidance.exhibit ?? check.guidance.accession}`,
      asOf: check.guidance.filingDate,
    });
  }
  for (const f of disclosures.freeCashFlow) {
    const window = f.months === 3 ? "three months" : `${f.months === 6 ? "six" : f.months === 9 ? "nine" : "twelve"} months`;
    figures.push({ label: `issuer-defined free cash flow, ${window} ended ${f.periodEnd}`, value: f.value, unit: "currency", currency, period: f.periodEnd, source: `edgar:${f.source.form} ${f.source.exhibit ?? "exhibit unrecorded"} ${f.source.accession}`, asOf: f.source.filingDate });
  }
  if (disclosures.freeCashFlowDefinition) notes.push(`Issuer free-cash-flow definition (issuer text): ${disclosures.freeCashFlowDefinition}`);
  const cr = disclosures.capitalReturn;
  if (cr !== null) {
    const base = { unit: "currency", currency, source: `edgar:${cr.source.form} ${cr.source.exhibit ?? cr.source.accession}`, asOf: cr.source.filingDate };
    if (cr.returned !== null) figures.push({ ...base, label: `returned to shareholders via repurchases and dividends${cr.returnedPeriod ? `, ${cr.returnedPeriod}` : ""}`, value: cr.returned });
    if (cr.authorizationRemaining !== null) figures.push({ ...base, label: "share repurchase authorization remaining", value: cr.authorizationRemaining });
    if (cr.authorizationAdded !== null) figures.push({ ...base, label: "share repurchase authorization added", value: cr.authorizationAdded });
    if (cr.dividendPerShare !== null) figures.push({ ...base, unit: "currency/share", label: "quarterly cash dividend per share", value: cr.dividendPerShare });
    if (cr.dividendChangeFrom !== null && cr.dividendChangeTo !== null) figures.push({ ...base, unit: "currency/share", label: "quarterly cash dividend per share before the increase", value: cr.dividendChangeFrom });
    if (cr.dividendPayDate !== null) notes.push(`Next quarterly dividend payable ${cr.dividendPayDate}${cr.dividendRecordDate ? ` to holders of record on ${cr.dividendRecordDate}` : ""} (8-K ${cr.source.accession}).`);
  }
  for (const check of disclosures.guidanceChecks) {
    notes.push(`${check.period} ${guidanceMetricLabel(check.metric, check.basis)}: actual ${check.position === "within" ? "within" : check.position} the guided range (outlook from 8-K filed ${check.guidance.filingDate}; actual from ${check.actualSource}).`);
  }
  // D-63: the release's GAAP-to-non-GAAP reconciliation (the free-cash-flow
  // bridge, the tax effect of the adjustments, GAAP EPS; the quarterly equity
  // gains and non-GAAP EPS are in the quarterly-trend rows) and the
  // commitments and guarantees tables.
  // Quarter columns only (the year-to-date free cash flow is above), to bound the prompt.
  for (const f of disclosures.reconciliation ?? []) {
    if (f.months !== 3 || f.metric === "equity-securities-gains" || f.metric === "non-gaap-diluted-eps") continue;
    figures.push({
      label: `${RECONCILIATION_LABELS[f.metric]}, three months ended ${f.periodEnd}`,
      value: f.value,
      unit: f.unit === "currency-per-share" ? "currency/share" : "currency",
      currency,
      period: f.periodEnd,
      source: `edgar:${f.source.form} ${f.source.exhibit ?? "exhibit unrecorded"} ${f.source.accession}`,
      asOf: f.source.filingDate,
    });
  }
  for (const c of disclosures.commitments ?? []) {
    const label = c.tableTotal ? `${c.table} table total` : `${c.label} (${c.table})`;
    figures.push({
      label: `${label}${c.asOf === null ? "" : `, as of ${c.asOf}`}`,
      value: c.total,
      unit: "currency",
      currency,
      period: c.asOf,
      source: `edgar:${c.source.form} ${c.source.exhibit ?? c.source.accession}`,
      asOf: c.source.filingDate,
    });
  }
  for (const table of disclosures.commitmentPaymentTiming ?? []) {
    notes.push(`Payment timing as reported (${table.source.form} ${table.source.exhibit ?? "exhibit unrecorded"}, ${table.source.accession}, table ${table.tableIndex + 1}): parsed-table coverage ${table.coverage}. Fiscal labels are not calendar maturity dates; thereafter has no exact maturity. This is not a complete obligation ledger: funding capacity and solvency are not assessed. Recognized debt, leases, guarantees and purchase commitments must not be added together without resolving overlap.`);
    if (table.reason) notes.push(`Payment timing limitation: ${table.reason}`);
    if (table.coverage !== "complete" || table.currency === null) continue;
    for (const row of table.rows) {
      if (row.tableTotal || row.reconciliation.status !== "reconciled-as-printed") continue;
      for (const bucket of row.buckets) {
        if (bucket.amount === null) continue;
        figures.push({
          label: `${row.label} (${table.table}, table ${table.tableIndex + 1}), fiscal payment bucket ${bucket.label}`,
          value: bucket.amount,
          unit: "currency",
          currency: table.currency,
          period: bucket.label,
          source: `edgar:${table.source.form} ${table.source.exhibit ?? "exhibit unrecorded"} ${table.source.accession} table ${table.tableIndex + 1}`,
          asOf: table.source.filingDate,
        });
      }
    }
  }
  if (disclosures.nonGaapBasisNote) notes.push(`Non-GAAP basis (issuer text): ${disclosures.nonGaapBasisNote}`);
  for (const n of disclosures.notes) notes.push(n);
  notes.push(disclosures.currencyBasis);
  if (figures.length === 0 && g === null && cr === null && disclosures.notes.length === 0) return undefined;
  return payloadSection({ title: "Issuer guidance, free cash flow & capital return (8-K earnings release)", figures, notes });
}

/**
 * D-66: the facts the 10-Q statements and notes, the 10-Q MD&A, the 10-K
 * notes, the XBRL goodwill balance and the two newest CFO commentaries state
 * that no typed statement row carries, each under its own tag, and the
 * commentary's stated outlook as text.
 */
/** Preserve a stated duration, without inferring fiscal basis from its dates. */
function filingFactPeriod(fact: { period: string | null; asOf: string | null }): Pick<PayloadFigure, "period" | "periodContext"> {
  const span = /^(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})$/.exec(fact.period ?? "");
  if (span && span[2] === fact.asOf) {
    const parsed = PeriodContextSchema.safeParse({ kind: "duration", start: span[1], end: span[2] });
    if (parsed.success) return { period: fact.period, periodContext: parsed.data };
  }
  return { period: fact.asOf };
}

function filingFactsSection(disclosures: FilingDisclosures | undefined): PayloadSection | undefined {
  const facts = disclosures?.filingFacts ?? [];
  const outlook = disclosures?.commentaryOutlook ?? [];
  const officers = disclosures?.officerChanges ?? [];
  const plans = disclosures?.tradingArrangements ?? [];
  const vote = disclosures?.sayOnPay;
  if (facts.length === 0 && (disclosures?.segmentPerformance?.length ?? 0) === 0 && outlook.length === 0 && officers.length === 0 && plans.length === 0 && vote === undefined) return undefined;
  const currency = disclosures?.currency ?? null;
  const figures: PayloadFigureInput[] = facts.map((f) => ({
    label: `${f.label}${f.qualifier === null ? "" : ` (${f.qualifier})`}${f.period !== null ? `, ${f.period}` : f.asOf !== null ? `, as of ${f.asOf}` : ""}`,
    value: f.value,
    unit: f.unit === "percent" ? "%" : f.unit,
    currency: f.unit === "currency" ? currency : null,
    ...filingFactPeriod(f),
    ...(/^(?:Q[1-4]\s+)?FY\d{4}$/.test(f.period ?? "") ? { fiscalPeriod: f.period! } : {}),
    source: f.sourceTag,
    asOf: f.source.filingDate,
  }));
  for (const row of disclosures?.segmentPerformance ?? []) {
    const base = { currency: row.currency, period: row.periodEnd, source: `edgar:${row.source.form} item2 ${row.source.accession} ${row.source.url}`, asOf: row.source.filingDate };
    figures.push({ ...base, label: `${row.segment} segment adjusted EBITDA margin, quarter ended ${row.periodEnd}`, value: row.marginPct, unit: "%" });
    figures.push({ ...base, label: `${row.segment} prior segment adjusted EBITDA margin, quarter ended ${row.comparisonPeriodEnd}`, value: row.priorMarginPct, unit: "%", period: row.comparisonPeriodEnd });
    figures.push({ ...base, label: `${row.segment} segment revenue, quarter ended ${row.periodEnd}`, value: row.revenue, unit: "currency" });
    figures.push({ ...base, label: `${row.segment} segment adjusted EBITDA, quarter ended ${row.periodEnd}`, value: row.profit, unit: "currency" });
    figures.push({ ...base, label: `${row.segment} prior segment revenue, quarter ended ${row.comparisonPeriodEnd}`, value: row.priorRevenue, unit: "currency", period: row.comparisonPeriodEnd });
    figures.push({ ...base, label: `${row.segment} prior segment adjusted EBITDA, quarter ended ${row.comparisonPeriodEnd}`, value: row.priorProfit, unit: "currency", period: row.comparisonPeriodEnd });
  }
  for (const o of outlook) {
    figures.push({ label: o.topic, value: o.text, unit: "", source: `edgar:8-K ${o.source.exhibit ?? "EX-99"} ${o.source.accession}`, asOf: o.source.filingDate });
  }
  // A bounded event excerpt can keep an appointee's dated lead while dropping
  // the later compensation paragraph. Keep parsed governance facts explicitly.
  for (const officer of officers) {
    const source = `edgar:8-K ${officer.source.accession}`;
    const when = officer.effective === null ? "effective date not stated" : `${officer.anticipated ? "anticipated " : ""}effective date ${officer.effective} specified by filing`;
    const dated = [officer.agreedDate === undefined ? null : `agreement date ${officer.agreedDate}`, officer.announced === null ? "public announcement date not stated" : `public announcement date ${officer.announced}`].filter(Boolean).join("; ");
    figures.push({ label: `${officer.person} ${officer.kind}`, value: `${officer.role}; ${dated}; ${when}; completion unconfirmed${officer.note === null ? "" : `; ${officer.note}`}`, unit: "", source, asOf: officer.source.filingDate });
    for (const component of officer.package) figures.push({ label: `${officer.person} ${component.component} (appointment package)`, value: component.value,
      unit: "currency", currency: currency === "USD" ? "USD" : null, period: officer.announced, subject: officer.person, source, asOf: officer.source.filingDate });
  }
  for (const plan of plans) {
    const source = "edgar:10-Q item5";
    const scope = `${plan.person} Rule 10b5-1 ${plan.action} on ${plan.date}`;
    if (plan.shares !== null) figures.push({ label: `${scope}, plan share capacity`, value: plan.shares, unit: "shares", period: plan.date, source, asOf: plan.source.filingDate });
    figures.push({ label: `${scope}, terms`, value: `${plan.role}; expires ${plan.expires ?? "not stated"}; ${plan.includesFutureAwards ? "includes future equity awards; " : ""}plan capacity, not an executed sale`, unit: "", source, asOf: plan.source.filingDate });
  }
  if (vote !== undefined) figures.push({ label: "say-on-pay support (votes for / for + against + abstentions)", value: vote.supportPct,
    unit: "%", period: vote.meetingDate, source: `edgar:8-K ${vote.source.accession}`, asOf: vote.source.filingDate });
  const notes = [
    "Read from the filings' own sentences and tables and matched SEC XBRL facts (10-Q statements and notes, 10-Q MD&A, 10-K notes, us-gaap/Goodwill, 8-K CFO commentary). Composition cash-flow components retain their signed cash contributions; other paid/received disclosures retain their stated amounts and windows.",
    ...facts.filter((f) => f.key.startsWith("composition-")).map((f) => `${f.label}: ${f.text}`),
    ...facts.filter((f) => f.key.startsWith("financing-")).map((f) => `${f.label}: ${f.text}`),
    ...facts.filter((f) => f.computed !== null).map((f) => `${f.label} is computed: ${f.computed} (${f.sourceTag}, ${f.source.form} ${f.source.accession}).`),
    ...(disclosures?.segmentPerformance ?? []).map((r) => `${r.segment} segment adjusted EBITDA margins are computed from matched quarterly tables: ${r.profit} / ${r.revenue} × 100 = ${r.marginPct}%; prior ${r.priorProfit} / ${r.priorRevenue} × 100 = ${r.priorMarginPct}%; change ${r.changeBasisPoints} basis points. These are segment adjusted measures, not consolidated GAAP margins (${r.source.form} ${r.source.accession}).`),
  ];
  return payloadSection({ title: "Filing notes, statements and commentary: investments, commitments, deals, working capital and governance", figures, notes });
}

/** Segment revenue for the latest quarter, the prior quarter and the year-ago quarter (provider rows). */
function segmentRevenueSection(bundle: DataBundle): PayloadSection | undefined {
  const res = bundle.edgar?.quarterlySegments;
  if (!res?.ok) return undefined;
  const data = res.value.data;
  const figures: PayloadFigureInput[] = [];
  const notes: string[] = [];
  const asOf = res.value.asOf;
  for (const axis of data.axes) {
    const columns = segmentColumns(axis.quarters);
    for (const row of axis.rows) {
      for (const i of columns) {
        const q = axis.quarters[i]!;
        const value = row.values[i] ?? null;
        if (value === null) continue;
        // D-63: a cell filled as the total less the other rows says so.
        const residual = row.residualAt?.includes(i) === true;
        figures.push({
          label: `${axis.axisLabel}: ${row.label} revenue${residual ? " (total less the other rows)" : ""}, quarter ended ${q.end}`,
          value,
          unit: "currency",
          currency: axis.currency,
          period: q.end,
          periodContext: { kind: "duration", start: q.start, end: q.end, basis: "fiscal-quarter" },
          source: residual ? "computed:xbrl segment residual" : "edgar:xbrl segment revenue",
          asOf,
        });
      }
    }
    const children = axis.rows.filter((r) => r.childOf !== null);
    if (children.length > 0) notes.push(`${axis.axisLabel}: ${children.map((c) => c.label).join(" and ")} are components of ${axis.rows.find((r) => r.member === children[0]!.childOf)?.label ?? "another row"} (they sum to it in the latest quarter).`);
    if (axis.priorPresentation.length > 0) notes.push(`${axis.axisLabel}: members tagged only in earlier quarters (a prior presentation) are not shown: ${axis.priorPresentation.join(", ")}.`);
    if (axis.derivedCells > 0) notes.push(`${axis.axisLabel}: ${axis.derivedCells} quarter value(s) are derived as the difference of two reported windows (e.g. fiscal year less nine months).`);
    if ((axis.residualCells ?? 0) > 0) notes.push(residualNote(axis.axisLabel, axis.residualCells));
  }
  notes.push(`Read from ${data.filings.map((f) => `${f.form} ${f.accession} (filed ${f.filingDate})`).join(", ")}; the newest filing's figure wins where filings overlap (recast comparatives).`);
  for (const n of data.notes) notes.push(n);
  return figures.length === 0 ? undefined : payloadSection({ title: "Segment revenue by quarter (10-Q/10-K XBRL)", figures, notes });
}

/** Latest quarter, the quarter before it, and the quarter about a year earlier. */
function segmentColumns(quarters: readonly { start: string; end: string }[]): number[] {
  if (quarters.length === 0) return [];
  const latest = Date.parse(`${quarters[0]!.end}T00:00:00Z`);
  const yearAgo = quarters.findIndex((q, i) => i > 0 && Math.abs((latest - Date.parse(`${q.end}T00:00:00Z`)) / 86_400_000 - 364) <= 16);
  return [...new Set([0, ...(quarters.length > 1 ? [1] : []), ...(yearAgo > 0 ? [yearAgo] : [])])];
}

/** The eight-quarter trend, segment growth and guidance-vs-actual differences (computed rows). */
function quarterlyTrendSection(bundle: DataBundle, disclosures: FilingDisclosures | undefined): PayloadSection | undefined {
  if (disclosures === undefined) return undefined;
  const figures: PayloadFigureInput[] = [];
  const currency = disclosures.currency;
  const statementSource = bundle.statements?.incomeQuarterly?.ok ? `${bundle.statements.incomeQuarterly.value.source}:income-statement(quarter)` : "statements";
  for (const row of disclosures.quarterlyTrend) {
    const at = `quarter ended ${row.periodEnd}`;
    const base = { period: row.periodEnd, source: statementSource, asOf: row.periodEnd };
    if (row.revenue !== null) figures.push({ ...base, label: `revenue, ${at}`, value: row.revenue, unit: "currency", currency });
    if (row.revenueYoyPct !== null) figures.push({ ...base, label: `revenue growth year over year, ${at}`, value: row.revenueYoyPct, unit: "%" });
    if (row.revenueQoqPct !== null) figures.push({ ...base, label: `revenue growth quarter over quarter, ${at}`, value: row.revenueQoqPct, unit: "%" });
    if (row.grossMarginPct !== null) figures.push({ ...base, label: `gross margin, ${at}`, value: row.grossMarginPct, unit: "%" });
    if (row.operatingMarginPct !== null) figures.push({ ...base, label: `operating margin, ${at}`, value: row.operatingMarginPct, unit: "%" });
    if (row.freeCashFlow !== null) figures.push({ ...base, label: `free cash flow (operating cash flow less capex), ${at}`, value: row.freeCashFlow, unit: "currency", currency });
    // D-63 (audit P1-B): the issuer's own reconciliation figures by quarter.
    const recon = { ...base, source: "edgar:8-K EX-99 reconciliation" };
    if (row.equitySecuritiesGains != null) figures.push({ ...recon, label: `net gains from equity securities, ${at}`, value: row.equitySecuritiesGains, unit: "currency", currency });
    if (row.nonGaapEpsDiluted != null) figures.push({ ...recon, label: `non-GAAP diluted EPS, ${at}`, value: row.nonGaapEpsDiluted, unit: "currency/share", currency });
  }
  const segments = bundle.edgar?.quarterlySegments;
  if (segments?.ok) {
    for (const axis of segments.value.data.axes) {
      const columns = segmentColumns(axis.quarters);
      const latestEnd = axis.quarters[0]!.end;
      for (const row of axis.rows) {
        const latest = row.values[0];
        if (latest === null || latest === undefined) continue;
        const growth = (i: number | undefined): number | null => {
          const prior = i === undefined ? null : row.values[i] ?? null;
          return prior === null || prior <= 0 ? null : Number(((latest / prior - 1) * 100).toFixed(2));
        };
        const base = { period: latestEnd, source: "edgar:xbrl segment revenue", asOf: latestEnd };
        const qoq = growth(columns.includes(1) ? 1 : undefined);
        const yoy = growth(columns.find((i) => i > 1));
        if (qoq !== null) figures.push({ ...base, label: `${axis.axisLabel}: ${row.label} revenue growth quarter over quarter, quarter ended ${latestEnd}`, value: qoq, unit: "%" });
        if (yoy !== null) figures.push({ ...base, label: `${axis.axisLabel}: ${row.label} revenue growth year over year, quarter ended ${latestEnd}`, value: yoy, unit: "%" });
        const total = axis.total[0];
        if (total !== null && total !== undefined && total > 0) figures.push({ ...base, label: `${axis.axisLabel}: ${row.label} share of revenue, quarter ended ${latestEnd}`, value: Number(((latest / total) * 100).toFixed(2)), unit: "%" });
      }
    }
  }
  for (const check of disclosures.guidanceChecks) {
    figures.push({
      label: `${check.period} ${guidanceMetricLabel(check.metric, check.basis)} actual vs prior guidance midpoint`,
      value: check.difference,
      unit: check.metric === "revenue" ? "%" : "pp",
      period: check.period,
      source: check.actualSource,
      asOf: check.periodEnd,
    });
  }
  const notes = [
    "Year-over-year growth compares with the quarter ending 350-380 days earlier; quarter-over-quarter with the quarter ending 80-100 days earlier. Free cash flow here is operating cash flow less capital expenditure, not the issuer's own definition.",
  ];
  // D-63: the company's guidance track record, one citable figure per metric:
  // the share of the guided quarters whose result landed above (below) the
  // range the preceding release gave. The CEO and CFO issue that outlook, so
  // it is their guidance-credibility record for the quarters of their tenure.
  for (const record of guidanceTrackRecord(disclosures.guidanceChecks)) {
    figures.push(...record.figures);
    notes.push(record.note);
  }
  if (figures.length === 0) return undefined;
  return payloadSection({
    title: "Quarterly trend (computed: last eight quarters, segment growth, results vs prior guidance)",
    figures,
    notes,
  });
}

const COUNT_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

/**
 * D-63: a company-level guidance track record per metric and basis, as two
 * percentages of the quarters checked (above / below the prior guided range).
 * The count is a word, not a digit, so a sentence stating the share carries
 * exactly one figure and the claim validator can bind it.
 */
export function guidanceTrackRecord(checks: FilingDisclosures["guidanceChecks"]): { figures: PayloadFigureInput[]; note: string }[] {
  const groups = new Map<string, FilingDisclosures["guidanceChecks"]>();
  for (const check of checks) {
    const key = `${check.metric}|${check.basis}`;
    groups.set(key, [...(groups.get(key) ?? []), check]);
  }
  return [...groups.values()].flatMap((group) => {
    const n = group.length;
    if (n === 0 || n >= COUNT_WORDS.length) return [];
    const metric = guidanceMetricLabel(group[0]!.metric, group[0]!.basis);
    const quarters = `last ${COUNT_WORDS[n]} guided ${n === 1 ? "quarter" : "quarters"}`;
    const newest = group.reduce((a, b) => (a.periodEnd >= b.periodEnd ? a : b));
    const oldest = group.reduce((a, b) => (a.periodEnd <= b.periodEnd ? a : b));
    const share = (position: "above" | "below"): number => Number(((group.filter((c) => c.position === position).length / n) * 100).toFixed(2));
    const base = { unit: "%", source: "computed.guidance-track-record", asOf: newest.periodEnd };
    return [{
      figures: [
        { ...base, label: `share of the ${quarters} with ${metric} above the prior guided range`, value: share("above") },
        { ...base, label: `share of the ${quarters} with ${metric} below the prior guided range`, value: share("below") },
      ],
      note: `Guidance track record for ${metric}: ${n} quarter${n === 1 ? "" : "s"} checked, ${oldest.period} to ${newest.period} ` +
        `(${group.filter((c) => c.position === "above").length} above, ${group.filter((c) => c.position === "within").length} within, ` +
        `${group.filter((c) => c.position === "below").length} below the range the preceding release gave). This is the company's outlook record; ` +
        "the CEO and CFO issue that outlook, so it is their guidance-credibility record for the quarters they held the role.",
    }];
  });
}

function excerptCoverageDisclosures(excerpts: readonly (TextExcerpt | null)[]): ManifestEntry[] {
  return excerpts.flatMap((excerpt) => {
    if (excerpt === null || excerpt.coverage === undefined || !excerpt.truncated) return [];
    const coverage = excerpt.coverage;
    const families = coverage.categories.map((entry) =>
      `${entry.category}: ${entry.status} (${entry.retainedPassages}/${entry.availablePassages} candidate passages retained)`).join("; ");
    return [{ field: `evidenceCoverage.${excerpt.source}`,
      reason: `${coverage.omittedChars} of ${excerpt.originalChars} source chars omitted by ${coverage.version} for ${excerpt.source} as of ${excerpt.asOf ?? "unknown date"}. ${families}. Retained evidence is not a complete source review; not-found means no matching passage was identified, not that the item does not exist.`,
      severity: "info" as const, attemptedSources: [excerpt.source] }];
  });
}

/** Same bounded-source limitations in the model context and report appendix. */
export function sourceEvidenceDisclosures(bundle: DataBundle): ManifestEntry[] {
  // Verification's legacy unregistered-context stand-in has no source bundle.
  return excerptCoverageDisclosures([
    bundle.transcript?.latest ? transcriptExcerpt(bundle) : null,
    ...(bundle.edgar ? filingExcerpts(bundle) : []),
  ]);
}

/* ------------------------------------------------------------------------ *
 * Exact numeric provenance registry
 * ------------------------------------------------------------------------ */

type PayloadWithoutRegistry = Omit<ContextPayload, "provenanceRegistry" | "citationRegistry">;

function semanticSlug(value: string): string {
  const slug = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "value";
}

/** Stable IDs for deterministic Stage B values attached after the judge pass. */
export function projectionProvenanceId(
  metric: string,
  scenario: string,
  period: string,
): string {
  return `payload.computed.projections.${semanticSlug(metric)}.${semanticSlug(scenario)}.${semanticSlug(period)}`;
}

export function scenarioTargetProvenanceId(name: string): string {
  return `payload.computed.scenario-targets.${semanticSlug(name)}.per-share`;
}

export const FAIR_VALUE_PROVENANCE_ID =
  "payload.computed.fair-value.per-share" as const;

/**
 * The citable tag of one missing-data manifest entry: `manifest.<field>`
 * (D-43). Until 2026-10-13 manifest lines carried no tag, and the prompt told
 * the model to "preserve an explicit unsupported state" when it had none, so
 * every data-gap statement (no insider activity, no estimate history) was
 * written with the source "unsupported" and failed verification. Null when the
 * field could not be written back as one source id (a bracket, the date
 * separator or whitespace in it); that line then renders untagged.
 */
export function manifestCitationId(field: string): string | null {
  return /^[^\s[\]·]+$/.test(field) ? `manifest.${field}` : null;
}

function periodFromLabel(label: string): string | null {
  return label.match(/\b(?:FY\d{4}|\d{4}-\d{2}-\d{2})\b/)?.[0] ?? null;
}

function isFullIsoDate(value: string | null): value is string {
  if (value === null) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, year, month, day] = match;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return (
    parsed.getUTCFullYear() === Number(year) &&
    parsed.getUTCMonth() === Number(month) - 1 &&
    parsed.getUTCDate() === Number(day)
  );
}

function attachProvenanceRegistry(
  payload: PayloadWithoutRegistry,
  computed: ComputedMetrics,
  computationAsOf: string | null,
): ContextPayload {
  const registry: NumericProvenanceRecord[] = [];
  const citationRegistry: CitationProvenanceRecord[] = [];
  const idCounts = new Map<string, number>();

  const citationIndex = new Map<string, CitationProvenanceRecord>();
  // D-43: when one tag+date is printed on rows of different kinds, an
  // unestablished figure outranks text, so its number never verifies through
  // the text row; text outranks a bare gap, because the text row's content
  // really is shown under that tag.
  const KIND_RANK: Record<CitationProvenanceRecord["kind"], number> = {
    "payload-gap": 0,
    "payload-text": 1,
    "payload-unestablished": 2,
  };
  const registerCitation = (
    id: string,
    asOf: string | null,
    origin = id,
    kind: CitationProvenanceRecord["kind"] = "payload-text",
    extra: { currencyUnknown?: boolean; allowedNumbers?: number[]; allowedDates?: string[] } = {},
  ): void => {
    // Provider dates reach this boundary unvalidated. validateCitationRegistry
    // is deliberately fail-loud on a malformed date, and its throw is not caught
    // before the runner unexpected-failure path — so one bad provider date
    // terminated the whole job instead of degrading. Normalize here, at the
    // producer, so the assembler invariant stays strict: the source is still
    // citable, its untrustworthy date simply becomes unknown.
    const safeAsOf = asOf !== null && isIsoDate(asOf) ? asOf : null;
    const key = `${id}\u0000${safeAsOf ?? ""}`;
    if (!id.trim()) return;
    const existing = citationIndex.get(key);
    if (existing !== undefined) {
      if (KIND_RANK[kind] > KIND_RANK[existing.kind]) existing.kind = kind;
      if (extra.currencyUnknown) existing.currencyUnknown = true;
      // A text row that names numbers restricts the tag to the numbers its
      // rows show; a row naming none adds nothing to the list.
      if (extra.allowedNumbers !== undefined) {
        existing.allowedNumbers = [...(existing.allowedNumbers ?? []), ...extra.allowedNumbers];
      }
      if (extra.allowedDates !== undefined) {
        existing.allowedDates = [...(existing.allowedDates ?? []), ...extra.allowedDates];
      }
      return;
    }
    const record: CitationProvenanceRecord = {
      id,
      kind,
      asOf: safeAsOf,
      origin,
      ...(extra.currencyUnknown ? { currencyUnknown: true as const } : {}),
      ...(extra.allowedNumbers === undefined ? {} : { allowedNumbers: extra.allowedNumbers }),
      ...(extra.allowedDates === undefined ? {} : { allowedDates: extra.allowedDates }),
    };
    citationIndex.set(key, record);
    citationRegistry.push(record);
  };

  const uniqueId = (base: string): string => {
    const count = (idCounts.get(base) ?? 0) + 1;
    idCounts.set(base, count);
    return count === 1 ? base : `${base}.${count}`;
  };

  const registerFigure = (
    prefix: string,
    figure: PayloadFigure,
    kind: NumericProvenanceRecord["kind"],
  ): void => {
    // Every row prints its tag (formatFigure), and the prompt says "Cite that
    // tag", so every row that does not become a numeric record is registered
    // as a citation of the kind it is (D-43). Until 2026-10-13 an n/a row or
    // a money row of unknown currency printed a tag nothing registered, and
    // every claim citing it — "EBIT interest coverage is not meaningful for
    // this bank" on computed.capital.interestCoverage, a compensation row's
    // named officer — failed as unknown-source.
    const shownAsOf = isFullIsoDate(figure.asOf) ? figure.asOf : null;
    if (typeof figure.value !== "number" || !Number.isFinite(figure.value)) {
      if (figure.value === null) {
        registerCitation(figure.source, shownAsOf, figure.source, "payload-gap");
      } else {
        const shown = typeof figure.value === "string" ? proseNumbers(figure.value) : [];
        registerCitation(
          figure.source,
          shownAsOf,
          figure.source,
          "payload-text",
          shown.length > 0 ? { allowedNumbers: shown } : {},
        );
      }
      return;
    }
    // The figure's own currency (or an ISO code in its unit) — never a
    // payload-wide default. A money figure nothing establishes stays unknown
    // and is not registered as a number, so no citation of it can verify in
    // any currency; its printed tag becomes an unestablished citation, which
    // supports number-free prose only (passes.ts claimSourceMatch) and fails a
    // sentence that puts a currency on it (consistency.ts).
    const unestablished = (currencyUnknown: boolean): void => {
      registerCitation(figure.source, shownAsOf, figure.source, "payload-unestablished", {
        currencyUnknown,
      });
    };
    const canonical = canonicalizeTracedUnit(figure.unit, figure.currency);
    if (canonical === null) {
      unestablished(false);
      return;
    }
    const { unit } = canonical;
    const monetary = unit === "currency" || unit === "currency-per-share";
    const resolvedCurrency = monetary ? canonical.currency : null;
    if (monetary && resolvedCurrency === null) {
      unestablished(true);
      return;
    }
    const asOf = isFullIsoDate(figure.asOf)
      ? figure.asOf
      : kind === "computed" && isFullIsoDate(computationAsOf)
        ? computationAsOf
        : null;
    if (asOf === null) {
      unestablished(false);
      return;
    }

    const id = uniqueId(`${prefix}.${semanticSlug(figure.label)}`);
    figure.provenanceId = id;
    figure.currency = resolvedCurrency;
    figure.period ??= periodFromLabel(figure.label);
    figure.asOf = asOf;
    registry.push({
      id,
      label: figure.label,
      kind,
      value: figure.value,
      unit,
      currency: resolvedCurrency,
      ...(figure.currencyInherited && resolvedCurrency !== null ? { currencyBasis: "inherited" as const } : {}),
      period: figure.period,
      ...(figure.periodContext === undefined ? {} : { periodContext: figure.periodContext }),
      ...(figure.fiscalPeriod === undefined ? {} : { fiscalPeriod: figure.fiscalPeriod }),
      ...(figure.subject === undefined ? {} : { subject: figure.subject }),
      asOf,
      origin: figure.source,
      formulaVersion: kind === "computed" ? "stage-b-v1" : null,
      displayPrecision: 4,
    });
  };

  const registerSection = (
    prefix: string,
    section: PayloadSection,
    kind: NumericProvenanceRecord["kind"],
  ): void => {
    for (const figure of section.figures) registerFigure(prefix, figure, kind);
  };

  const registerStageBNumber = (
    id: string,
    number: TracedNumber | null,
    period: string | null,
    formulaVersion: string,
  ): void => {
    if (number === null || !Number.isFinite(number.value) || !isFullIsoDate(number.asOf)) {
      return;
    }
    const canonical = canonicalizeTracedUnit(number.unit, number.currency);
    if (canonical === null) return;
    const monetary =
      canonical.unit === "currency" || canonical.unit === "currency-per-share";
    if (monetary && canonical.currency === null) return;
    registry.push({
      id,
      kind: "computed",
      value: number.value,
      unit: canonical.unit,
      currency: canonical.currency,
      period,
      ...(number.periodContext === undefined ? {} : { periodContext: number.periodContext }),
      asOf: number.asOf,
      origin: number.source,
      formulaVersion,
      displayPrecision: 4,
    });
  };

  registerSection("payload.quote", payload.quote, "provider");
  for (const section of payload.computed) {
    const sectionName = semanticSlug(section.title.split("(", 1)[0] ?? section.title);
    registerSection(`computed.${sectionName}`, section, "computed");
    // Report-injected bridge rows use stable object-field IDs. Keep the model's
    // printed semantic tag too; both identities refer to the same typed record.
    for (const figure of section.figures) {
      if (!/^computed\.(?:capital\.current\.|forensics\.accruals\.)/.test(figure.source)) continue;
      const record = registry.find((entry) => entry.id === figure.provenanceId);
      if (record && /^computed\.forensics\.accruals\./.test(figure.source) && isFullIsoDate(figure.asOf)) {
        figure.period = figure.asOf;
        record.period = figure.asOf;
      }
      if (record && !registry.some((entry) => entry.id === figure.source)) registry.push({ ...record, id: figure.source });
    }
  }
  for (const block of payload.statements) {
    const blockName = semanticSlug(block.title);
    for (const line of block.lineItems) {
      for (const cell of line.byPeriod) {
        const source = cell.source ?? line.source;
        // A null cell renders "period=n/a" with no tag, so there is nothing
        // to register. A cell that prints a number but cannot become a record
        // prints the line's raw tag (renderStatement); register that tag as
        // unestablished so number-free prose may cite it and no number can
        // (D-43, e.g. a quarter's balance cell of unknown currency).
        if (cell.value === null || !Number.isFinite(cell.value)) continue;
        const unestablished = (currencyUnknown: boolean): void => {
          registerCitation(source, cell.asOf, source, "payload-unestablished", {
            currencyUnknown,
          });
        };
        if (!isFullIsoDate(cell.period) || !isFullIsoDate(cell.asOf)) {
          unestablished(false);
          continue;
        }
        const unitOnly = canonicalizeTracedUnit(line.unit, null);
        if (unitOnly === null) {
          unestablished(false);
          continue;
        }
        const monetary = unitOnly.unit === "currency" || unitOnly.unit === "currency-per-share";
        const canonical = canonicalizeTracedUnit(
          line.unit,
          monetary ? cell.currency : null,
        );
        if (canonical === null) {
          unestablished(false);
          continue;
        }
        const { unit } = canonical;
        if (monetary && canonical.currency === null) {
          unestablished(true);
          continue;
        }
        const id = uniqueId(
          `payload.statements.${blockName}.${cell.period}.${semanticSlug(line.lineItem)}`,
        );
        cell.provenanceId = id;
        registry.push({
          id,
          label: line.lineItem,
          kind: "provider",
          value: cell.value,
          unit,
          currency: monetary ? canonical.currency : null,
          period: cell.period,
          ...(cell.periodContext === undefined ? {} : { periodContext: cell.periodContext }),
          ...(cell.fiscalPeriod === undefined ? {} : { fiscalPeriod: cell.fiscalPeriod }),
          asOf: cell.asOf,
          origin: source,
          formulaVersion: null,
          displayPrecision: 4,
        });
      }
    }
  }

  if (payload.quarterlyTrend !== undefined) registerSection("computed.quarterly-trend", payload.quarterlyTrend, "computed");
  const remainingSections: [string, PayloadSection][] = [
    ...(payload.segmentRevenue === undefined ? [] : [["payload.segment-revenue", payload.segmentRevenue] as [string, PayloadSection]]),
    ...(payload.issuerFilings === undefined ? [] : [["payload.issuer-filings", payload.issuerFilings] as [string, PayloadSection]]),
    ...(payload.filingFacts === undefined ? [] : [["payload.filing-facts", payload.filingFacts] as [string, PayloadSection]]),
    ["payload.estimates", payload.estimates],
    ["payload.peers", payload.peers],
    ["payload.insiders", payload.insiders],
    ["payload.institutional", payload.institutional],
    ["payload.leadership", payload.leadership],
    ["payload.short-interest", payload.shortInterest],
    ["payload.segments", payload.segments],
    ["payload.macro", payload.macro],
    ["payload.news", payload.news],
  ];
  for (const [prefix, section] of remainingSections) {
    registerSection(prefix, section, "provider");
  }

  for (const excerpt of [payload.transcript, ...payload.filings]) {
    if (excerpt !== null) registerCitation(excerpt.source, excerpt.asOf, excerpt.source);
  }
  // Each manifest line renders its own `[manifest.<field>]` tag
  // (serializePayloadForPrompt). A gap record: it supports the statement that
  // the data is absent and never a number.
  for (const entry of payload.missingData) {
    const id = manifestCitationId(entry.field);
    if (id !== null) registerCitation(id, null, entry.field, "payload-gap");
  }
  // News/press rows are rendered as inert text with one assembler-owned source
  // tag at the end. Parse only that final, allowlisted tag; never register a tag
  // embedded inside provider-controlled title/body text.
  for (const note of payload.news.notes) {
    const match = /\[((?:fmp|finnhub):news|fmp:press-release) · (\d{4}-\d{2}-\d{2})\]$/.exec(note);
    if (match) registerCitation(match[1], match[2], match[1]);
  }
  // Insider-trade + key-executive rows render as inert text notes carrying one
  // assembler-owned tag at the END (like news). They are shown to the model as
  // citable, so register that final, ANCHORED, allowlisted tag — otherwise every
  // claim citing them fails unknown-source. Parse only the trailing tag; never a
  // tag embedded inside provider-controlled name/title/type text mid-note.
  for (const note of payload.insiders.notes) {
    const match = /\[(fmp:insider-trades) · (\d{4}-\d{2}-\d{2})\]$/.exec(note);
    if (match) registerCitation(match[1], match[2], match[1]);
  }
  for (const note of payload.leadership.notes) {
    const match = /\[(fmp:key-executives)\]$/.exec(note);
    if (match) registerCitation(match[1], null, match[1]);
  }
  // The next-earnings note (nextEarningsNote) is wholly assembler-built; the
  // same anchored, allowlisted parse keeps any other estimates note — the
  // grades line carries provider strings — from registering a source. The
  // note's one date is the only date a sentence citing it may state
  // (allowedDates; review, 2026-10-13): registered as plain text, "reports on
  // 2027-02-14" verified against a note that says 2027-01-14.
  for (const note of payload.estimates.notes) {
    const match = /: (\d{4}-\d{2}-\d{2}) \[((?:fmp|finnhub):earnings-calendar) · (\d{4}-\d{2}-\d{2})\]$/.exec(note);
    if (match) registerCitation(match[2], match[3], match[2], "payload-text", { allowedDates: [match[1]] });
  }

  // The full deterministic Stage B blocks are attached to the report only after
  // the judge returns. Register every TracedNumber here as trusted internal
  // evidence so the final-report verifier can trace those pipeline-owned values
  // without exposing hundreds of duplicate rows in the prompt prefix.
  const projections = computed.projections;
  if (projections) {
    for (const series of orderedProjectionSeries(projections.series)) {
      const periodRows = projectionPeriodRows(series);
      for (const scenario of PROJECTION_PATH_ORDER) {
        for (const row of periodRows) {
          const point = projectionCellPoint(row, scenario, series.unit);
          if (point !== null) {
            registerStageBNumber(
              projectionProvenanceId(series.metric, scenario, point.period),
              point.value,
              point.period,
              projections.weightsVersion,
            );
          }
        }
      }
      for (const alternative of ["flatShare", "shareTrend"] as const) {
        for (const scenario of ["bull", "base", "bear", "weighted"] as const) {
          for (const point of admittedProjectionPoints(series, scenario, alternative)) {
            registerStageBNumber(projectionProvenanceId(series.metric, `${alternative}.${scenario}`, point.period),
              point.value, point.period, projections.weightsVersion);
          }
        }
      }
    }
  }

  const scenarioTargets = computed.scenarioTargets;
  if (scenarioTargets?.status === "available") {
    for (const target of scenarioTargets.targets) {
      registerStageBNumber(
        scenarioTargetProvenanceId(target.name),
        target.perShare,
        null,
        scenarioTargets.methodVersion,
      );
    }
  }

  const fairValue = computed.fairValue;
  if (fairValue?.status === "available") {
    registerStageBNumber(
      FAIR_VALUE_PROVENANCE_ID,
      fairValue.perShare,
      null,
      fairValue.methodVersion,
    );
  }

  // Deterministic aspect-score DRIVERS (feature 1.1.0) are TracedNumbers the
  // pipeline COMPUTED (source "computed.scores.<aspect>.<signal>") and attaches
  // to report.scores AFTER the judge pass; the schema routes them through the
  // verify pass on purpose (schema.ts AspectScoreSchema.drivers). Register each
  // keyed on its own source id so the final-report verifier resolves them as
  // computed-derived provenance instead of "[unverified] unknown-source" — they
  // ARE provenance-bearing, so counting them as untraceable falsely caps
  // citation coverage. Dedup against ids already in the registry so a repeated
  // signal id can never throw out of validateProvenanceRegistry (invariant 7:
  // degraded paths never crash).
  const scores = computed.scores;
  if (scores) {
    const takenIds = new Set(registry.map((record) => record.id));
    for (const aspect of SCORE_ASPECT_ORDER) {
      for (const driver of scores.aspects[aspect].drivers) {
        if (takenIds.has(driver.source)) continue;
        const before = registry.length;
        registerStageBNumber(driver.source, driver, driver.period ?? null, scores.bandsVersion);
        if (registry.length > before) takenIds.add(driver.source);
      }
    }
  }

  validateProvenanceRegistry(registry);
  validateCitationRegistry(citationRegistry);
  const { payloadVersion, ...rest } = payload;
  return { payloadVersion, provenanceRegistry: registry, citationRegistry, ...rest };
}

/* ------------------------------------------------------------------------ *
 * assembleContextPayload
 * ------------------------------------------------------------------------ */

/**
 * Assemble the deterministic context payload from Stage A/B outputs. Pure — no
 * clock, no network, no randomness. Given identical inputs the output is
 * byte-identical (drives the prompt cache).
 */
export function assembleContextPayload(
  bundle: DataBundle,
  computed: ComputedMetrics,
  validation: ValidationReport,
): ContextPayload {
  const profile = firstRow(bundle.profile);
  // Trading (listing), annual and model currencies, resolved exactly as Stage B
  // resolved them. Each figure below takes only the one its evidence supports.
  const currencies = statementCurrencies(bundle);
  // D-57: the one currency single-currency provider rows (estimates, targets,
  // peer caps, compensation) inherit when they carry none — the same rule
  // Stage B applied to the analyst-consensus growth case.
  const issuer = inheritedIssuerCurrency({
    reporting: currencies.model,
    listing: currencies.trading,
    isAdr: computed.route.overlays.includes("adr") || profile?.isAdr === true,
  });

  // Validation flags = failed/skipped checks + the flags array (data-quality
  // signals the model should weigh). Deterministically ordered.
  const validationFlags: string[] = [];
  for (const chk of validation.checks) {
    if (chk.status === "fail" || chk.status === "warn" || chk.status === "skipped") {
      validationFlags.push(`[${chk.status.toUpperCase()}] ${chk.name}: ${chk.detail}`);
    }
  }
  for (const flag of validation.flags) validationFlags.push(flag);

  // Missing-data manifest = computed gaps + validation gaps + degradation
  // disclosures (reduce-window / suppress / replace decisions), deduped by
  // field+reason, severity-ordered so critical gaps read first. The degradation
  // items/notes are info-severity disclosures (e.g. a recent-IPO's shortened
  // CAGR windows) that Stage B computes but that otherwise never reach the model
  // — surfacing them here keeps the prompt and the rendered appendix in agreement.
  const transcript = transcriptExcerpt(bundle);
  const filings = filingExcerpts(bundle);
  const disclosures = buildFilingDisclosures(bundle);
  const quarterlyTrend = quarterlyTrendSection(bundle, disclosures);
  const segmentRevenue = segmentRevenueSection(bundle);
  const issuerFilings = issuerFilingsSection(disclosures);
  const filingFacts = filingFactsSection(disclosures);
  const missingData = mergeManifest([
    bundle.gaps,
    computed.gaps,
    validation.gaps,
    degradationDisclosures(computed.degradation),
    excerptCoverageDisclosures([transcript, ...filings]),
  ]);

  const payload: PayloadWithoutRegistry = {
    payloadVersion: PAYLOAD_VERSION,
    symbol: bundle.symbol,
    companyName: strOrNull(profile?.companyName),
    route: {
      base: computed.route.base,
      overlays: [...computed.route.overlays].sort(),
      sector: computed.route.evidence.sector,
      industry: computed.route.evidence.industry,
    },
    quote: quoteSection(bundle, currencies.trading),
    computed: computedSections(computed, computedCurrencies(bundle, computed), comparableScenarioPrice(computed, bundle)),
    statements: statementExtracts(bundle),
    ...(quarterlyTrend === undefined ? {} : { quarterlyTrend }),
    ...(segmentRevenue === undefined ? {} : { segmentRevenue }),
    ...(issuerFilings === undefined ? {} : { issuerFilings }),
    ...(filingFacts === undefined ? {} : { filingFacts }),
    estimates: estimatesSection(bundle, issuer),
    peers: peersSection(bundle, issuer),
    insiders: insidersSection(bundle),
    institutional: institutionalSection(bundle),
    leadership: leadershipSection(bundle, issuer),
    shortInterest: shortInterestSection(bundle),
    segments: segmentsSection(bundle),
    macro: macroSection(bundle),
    transcript,
    filings,
    news: newsSection(bundle),
    validationFlags,
    missingData,
    // asOf map: bundle's own dot-path -> as-of, with stable key ordering.
    asOfMap: sortRecord(bundle.asOf),
  };
  return attachProvenanceRegistry(payload, computed, isoDay(bundle.builtAt));
}

/**
 * Convert a Stage B {@link DegradationPlan}'s items + notes into info-severity
 * {@link ManifestEntry} disclosures. The plan's `.gaps` already flow through
 * `computed.gaps`, but its `items[]` (per-target suppress/replace/annotate
 * decisions, e.g. a recent-IPO's shortened CAGR windows) and `notes[]` were
 * previously never surfaced to the prompt or the report. Deterministic order
 * (items in plan order first, then notes); a null/absent plan yields no rows.
 */
export function degradationDisclosures(degradation: DegradationPlan | undefined): ManifestEntry[] {
  if (!degradation) return [];
  const out: ManifestEntry[] = [];
  for (const item of degradation.items) {
    out.push({
      field: `degradation.${item.target}`,
      reason: `[${item.action}] ${item.disclosure}`,
      severity: "info",
    });
  }
  // Notes only accompany actual degradations. The empty-case note ("no
  // degradations: general route with no overlays.") is a SENTINEL, not a gap —
  // surfacing it into a missing-data manifest that every plain-vanilla report
  // renders would be misleading noise. Gate on items so a genuine future note
  // still surfaces while the empty-case sentinel never does.
  if (degradation.items.length > 0) {
    for (const note of degradation.notes) {
      out.push({ field: "degradation", reason: note, severity: "info" });
    }
  }
  return out;
}

/**
 * Dedup + severity-order a set of manifest lists. Deterministic: dedup key is
 * `field|reason`; severities order critical > warn > info; within a severity,
 * ties break on field then reason (stable, no clock).
 */
function mergeManifest(lists: ManifestEntry[][]): ManifestEntry[] {
  const seen = new Map<string, ManifestEntry>();
  for (const list of lists) {
    for (const e of list) {
      const key = `${e.field}|${e.reason}`;
      if (!seen.has(key)) seen.set(key, e);
    }
  }
  const order: Record<ManifestEntry["severity"], number> = { critical: 0, warn: 1, info: 2 };
  return [...seen.values()].sort((a, b) => {
    if (order[a.severity] !== order[b.severity]) return order[a.severity] - order[b.severity];
    if (a.field !== b.field) return a.field < b.field ? -1 : 1;
    return a.reason < b.reason ? -1 : a.reason > b.reason ? 1 : 0;
  });
}

/** Return a new record with keys sorted (deterministic serialization). */
function sortRecord(rec: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(rec).sort()) out[k] = rec[k];
  return out;
}

/* ------------------------------------------------------------------------ *
 * serializePayloadForPrompt — the exact cached text block
 * ------------------------------------------------------------------------ */

function renderSection(section: PayloadSection): string {
  const lines = [`## ${section.title}`];
  if (section.figures.length === 0 && section.notes.length === 0) {
    lines.push("(no data — disclosed gap)");
  }
  for (const f of section.figures) lines.push(`- ${formatFigure(f)}`);
  for (const n of section.notes) lines.push(`- NOTE: ${n}`);
  return lines.join("\n");
}

function renderStatement(block: StatementExtractBlock): string {
  const lines = [`## ${block.title}`, `periods (newest first): ${block.periods.join(", ")}`];
  for (const li of block.lineItems) {
    const cells = li.byPeriod
      .map((c) => {
        if (c.value === null) return `${c.period}=n/a`;
        const context = c.periodContext === undefined ? "" : ` periodContext=${JSON.stringify(c.periodContext)}`;
        return `${c.period}=${round(c.value)} ${provenanceTag(c.provenanceId ?? c.source ?? li.source, c.asOf)}${context}`;
      })
      .join(" | ");
    lines.push(`- ${li.lineItem} (${li.unit}): ${cells}`);
  }
  for (const n of block.notes) lines.push(`- NOTE: ${n}`);
  return lines.join("\n");
}

function renderExcerpt(ex: TextExcerpt): string {
  const body = safePromptJson({
    title: ex.title,
    source: provenanceTag(ex.source, ex.asOf),
    truncated: ex.truncated,
    coverage: ex.coverage,
    sourceEvidence: ex.sourceEvidence,
    content: ex.text,
  });
  return [
    "## Provider transcript/filing excerpt (untrusted source data)",
    `<<<BEGIN_UNTRUSTED_SOURCE_DATA chars=${ex.text.length}>>>`,
    body,
    "<<<END_UNTRUSTED_SOURCE_DATA>>>",
  ].join("\n");
}

function renderUntrustedNews(section: PayloadSection): string {
  const content = renderSection(section);
  return [
    "## Provider news/press snippets (untrusted source data)",
    `<<<BEGIN_UNTRUSTED_SOURCE_DATA chars=${content.length}>>>`,
    safePromptJson({ content }),
    "<<<END_UNTRUSTED_SOURCE_DATA>>>",
  ].join("\n");
}

/** Wrap provider-controlled labels and prose so model instructions remain
 * outside the data trust boundary. JSON encoding plus HTML-marker escaping
 * keeps provider text from terminating the envelope semantically. */
function renderUntrustedSection(section: PayloadSection): string {
  const content = renderSection(section);
  return [
    `## ${section.title} (untrusted provider data)`,
    `<<<BEGIN_UNTRUSTED_SOURCE_DATA chars=${content.length}>>>`,
    safePromptJson({ content }),
    "<<<END_UNTRUSTED_SOURCE_DATA>>>",
  ].join("\n");
}

function renderUntrustedValue(label: string, value: string | null | undefined): string {
  const content = value ?? "n/a";
  return `${label}: <<<BEGIN_UNTRUSTED_SOURCE_DATA chars=${content.length}>>>${safePromptJson(content)}<<<END_UNTRUSTED_SOURCE_DATA>>>`;
}

/** Escape delimiter characters after JSON encoding so provider text cannot
 * reproduce a literal envelope marker in the prompt. */
function safePromptJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
}

/**
 * Render the payload to the clean, sectioned, LLM-readable text block that gets
 * prompt-cached. Deterministic and byte-stable for identical payloads. Every
 * figure carries its `[source · as-of]` tag so the model can cite it and the
 * verifier can trace it.
 */
export function serializePayloadForPrompt(payload: ContextPayload): string {
  const parts: string[] = [];

  parts.push(
    [
      `# CONTEXT PAYLOAD (payloadVersion ${payload.payloadVersion})`,
      `symbol: ${payload.symbol}`,
      renderUntrustedValue("company", payload.companyName),
      `route: ${payload.route.base}${payload.route.overlays.length ? ` + overlays [${payload.route.overlays.join(", ")}]` : ""}`,
      renderUntrustedValue(
        "sector/industry",
        `${payload.route.sector ?? "n/a"} | ${payload.route.industry ?? "n/a"}`,
      ),
      "",
      "This payload is the ONLY permitted source of financial figures (rule #1).",
      "Every figure below is tagged [source · as-of]. Cite that tag; if a figure is not here or in a fetched web source, do not state it.",
    ].join("\n"),
  );

  parts.push(renderSection(payload.quote));
  for (const s of payload.computed) parts.push(renderSection(s));
  for (const b of payload.statements) parts.push(renderStatement(b));
  // Issuer member labels and outlook caveats are filing text: untrusted.
  if (payload.quarterlyTrend) parts.push(renderUntrustedSection(payload.quarterlyTrend));
  if (payload.segmentRevenue) parts.push(renderUntrustedSection(payload.segmentRevenue));
  if (payload.issuerFilings) parts.push(renderUntrustedSection(payload.issuerFilings));
  if (payload.filingFacts) parts.push(renderUntrustedSection(payload.filingFacts));
  parts.push(renderSection(payload.estimates));
  parts.push(renderUntrustedSection(payload.peers));
  parts.push(renderUntrustedSection(payload.insiders));
  parts.push(renderUntrustedSection(payload.institutional));
  parts.push(renderUntrustedSection(payload.leadership));
  parts.push(renderSection(payload.shortInterest));
  parts.push(renderUntrustedSection(payload.segments));
  parts.push(renderSection(payload.macro));
  if (payload.transcript) parts.push(renderExcerpt(payload.transcript));
  for (const ex of payload.filings) parts.push(renderExcerpt(ex));
  parts.push(renderUntrustedNews(payload.news));

  // Validation + missing data — DISCLOSED, never filled.
  const vflags = ["## Data-quality flags (Stage A validation)"];
  if (payload.validationFlags.length === 0) vflags.push("- (no failed/skipped checks)");
  for (const f of payload.validationFlags) vflags.push(`- ${f}`);
  parts.push(vflags.join("\n"));

  const missing = ["## Missing-data manifest (gaps are DISCLOSED, never filled — rule #4)"];
  if (payload.missingData.length === 0) missing.push("- (no recorded gaps)");
  for (const m of payload.missingData) {
    const id = manifestCitationId(m.field);
    missing.push(`- [${m.severity}] ${m.field}: ${m.reason}${id === null ? "" : ` ${provenanceTag(id, null)}`}`);
  }
  parts.push(missing.join("\n"));

  return parts.join("\n\n");
}

/* ------------------------------------------------------------------------ *
 * payloadFingerprint — stable hash for cache diagnostics
 * ------------------------------------------------------------------------ */

/**
 * FNV-1a 32-bit hash over a string. Deterministic, dependency-free, and stable
 * across runs/machines (no node:crypto needed — the fingerprint is a cache
 * diagnostic, not a security primitive). Returned as 8-char lowercase hex.
 */
export function fnv1a32(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    // 32-bit FNV prime multiply via shifts (keeps it in 32-bit range).
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Stable fingerprint of a payload for cache diagnostics: hashes the exact
 * serialized prompt text (so two payloads that render identically fingerprint
 * identically). Prefixed with the payload version so a format bump changes it.
 */
export function payloadFingerprint(payload: ContextPayload): string {
  return `${payload.payloadVersion}:${fnv1a32(serializePayloadForPrompt(payload))}`;
}
