/**
 * D-229, D-242 (P10, P11): the agreement check between each consumer's wording test on a
 * missing-data entry and the typed cause the producer writes beside it, and (D-242) the
 * consumer's switched decision.
 *
 * Each site keeps the consumer's other conditions (field, severity, path). `wording` is the
 * consumer's test as it stood on main before D-242, copied verbatim with its file named, so it
 * keeps deciding by the sentence alone; `code` swaps only the wording test for a code test;
 * `current` is the consumer's decision today (its own exported function where one exists, else
 * the reader it calls with the consumer's other conditions). D-242 requires `current` to equal
 * `wording` on every entry, with and without its code.
 *
 * Used by tests/gapCause.dualWrite.test.ts, tests/gapCause.readers.test.ts and, over the
 * same-report cases' Stage B outputs, by a one-off run of {@link agreementReport}.
 */
import { gapCauseMatches } from "@/edgar/refusalCauseRead";
import { isUnprofitableOverlayGap, isUnprofitableOverlaySuppression } from "@/pipeline/compute";
import { markSegmentationGapExpected, withResolvedPredecessor } from "@/pipeline/dataBundle";
import { symbolRefused } from "@/pipeline/peers";
import { dcfWithheldWarnGap, quotesUpstreamNetDebt } from "@/pipeline/stageB/fairValue";
import { temporaryEquityUnknownAt } from "@/pipeline/stageB/seniorClaims";
import { isConfirmedUnknownProfile } from "@/pipeline/unknownTicker";
import { FMP_EMPTY_ARRAY_REASON, isFmpQuotaGap } from "@/providers/fmp";
import type { FetchResult, ManifestEntry } from "@/types/core";
import { GAP_CAUSES, type GapCause } from "@/types/refusalCause";

export interface GapLike {
  field: string;
  reason: string;
  severity: string;
  cause?: unknown;
}

export interface AgreementSite {
  id: string;
  /** The consumer whose wording test is compared. */
  consumer: string;
  /** The entries the consumer reads (by the producer's field), so an entry that only quotes the sentence is not counted. */
  reads: (gap: GapLike) => boolean;
  wording: (gap: GapLike) => boolean;
  code: (gap: GapLike) => boolean;
  /** D-242: the consumer's decision as it now runs. */
  current: (gap: GapLike) => boolean;
}

/** `src/pipeline/dataBundle.ts` (not exported there). */
export const UNLINKED_PREDECESSOR_TEXT = " — its predecessor's annual reports live under another CIK that EDGAR does not link";
const ENRICHMENT_WITHHELD = "temporary-equity SEC enrichment withheld: ";

/** A code passes only when it is exactly one of the listed members; an absent or unknown value never does. */
const coded = (gap: GapLike, ...codes: GapCause[]): boolean =>
  typeof gap.cause === "string" && (GAP_CAUSES as readonly string[]).includes(gap.cause) && (codes as string[]).includes(gap.cause);

/** The balance date in a `statements.balance.<date>.<field>` path, or null. */
const balanceDate = (field: string): string | null => /^statements\.balance\.([^.]+)\./.exec(field)?.[1] ?? null;
/** `temporaryEquityUnknownAt`'s own non-wording conditions (warn, one of its paths), with its cause test satisfied by an uncoded probe. */
const temporaryEquityPath = (gap: GapLike): boolean => {
  const date = balanceDate(gap.field);
  return date !== null && temporaryEquityUnknownAt({}, date, [{ field: gap.field, severity: gap.severity, reason: `${ENRICHMENT_WITHHELD}path probe` }]) !== null;
};
/** `src/pipeline/stageB/seniorClaims.ts` `temporaryEquityUnknownAt` on main before D-242: its path and severity conditions, then its wording, verbatim. */
const SEC_SILENT = "temporary carrying amounts are absent or explicitly refused for this SEC period";
const legacyTemporaryEquityUnknown = (gap: GapLike): boolean =>
  temporaryEquityPath(gap) && gap.reason.startsWith(ENRICHMENT_WITHHELD) && !gap.reason.endsWith(SEC_SILENT);
/** `src/pipeline/stageB/seniorClaims.ts` `TEMPORARY_EQUITY_REFUSAL_LEAD` and `LEASE_EMPTIED_CAPITAL_LEAD`. */
const TEMPORARY_EQUITY_REFUSAL_LEAD = "Temporary equity refused for invested capital: ";
const LEASE_EMPTIED_CAPITAL_LEAD = "Invested capital emptied by the operating-lease removal: ";
const failed = <T = never>(gap: GapLike): FetchResult<T> => ({ ok: false, gap: gap as ManifestEntry });
/** A CIK lookup failure that is not a "not listed" answer. */
export const NEUTRAL_CIK_GAP: GapLike = { field: "edgar.tickerToCik(X)", reason: "company_tickers.json HTTP 503", severity: "critical" };
/** The two other entries `isConfirmedUnknownProfile` combines with a profile entry. */
export const NOT_LISTED_GAP: GapLike = { field: "edgar.tickerToCik(X)", reason: 'ticker "X" not in SEC company_tickers.json', severity: "warn", cause: "sec-ticker-not-listed" };
export const NO_KEY_GAP: GapLike = { field: "fmp.profile(X)", reason: "no API key + no fixture", severity: "warn", cause: "fmp-no-api-key" };
/** P5, D-242: `isConfirmedUnknownProfile` (`src/pipeline/unknownTicker.ts`) over a failed profile and a failed CIK lookup. */
export const confirmedUnknown = (profile: GapLike, cik: GapLike): boolean =>
  isConfirmedUnknownProfile({ profile: failed(profile), edgar: { cik: failed(cik) } });
/** `src/pipeline/jobRunner.ts` `confirmedMiss` and `src/app/company/[symbol]/page.tsx` `isConfirmedUnknownProfile` on main before D-242, verbatim (both failed). */
export const legacyConfirmedUnknown = (profile: GapLike, cik: GapLike): boolean =>
  profile.reason === FMP_EMPTY_ARRAY_REASON ||
  (/no API key/.test(profile.reason) && /not in SEC company_tickers\.json/.test(cik.reason));
const RESOLVED = { cik10: "0000034088", name: "EXXON MOBIL CORP" };

export const AGREEMENT_SITES: readonly AgreementSite[] = [
  {
    id: "G1",
    consumer: "src/pipeline/compute.ts FIN-OTHER retained-suppression rewrite (isUnprofitableOverlayGap)",
    reads: (g) => g.field === "valuation.dcf",
    wording: (g) => g.field === "valuation.dcf" && g.reason.startsWith("DCF suppressed for unprofitable overlay"),
    code: (g) => g.field === "valuation.dcf" && coded(g, "dcf-unprofitable-overlay"),
    current: (g) => isUnprofitableOverlayGap(g as ManifestEntry),
  },
  {
    id: "G3",
    consumer: "src/pipeline/stageB/fairValue.ts dcfWithheldWarnGap",
    reads: (g) => g.field === "valuation.dcf.salesToCapital",
    wording: (g) => g.severity === "warn" && g.field === "valuation.dcf.salesToCapital" &&
      (g.reason.startsWith(TEMPORARY_EQUITY_REFUSAL_LEAD) || g.reason.startsWith(LEASE_EMPTIED_CAPITAL_LEAD)),
    code: (g) => g.severity === "warn" && g.field === "valuation.dcf.salesToCapital" &&
      coded(g, "invested-capital-temporary-equity-refused", "invested-capital-lease-emptied"),
    current: (g) => dcfWithheldWarnGap([g as ManifestEntry]) !== undefined,
  },
  {
    id: "G4",
    consumer: "src/pipeline/stageB/fairValue.ts dcfWithheldReason (upstream net-debt quote, quotesUpstreamNetDebt)",
    reads: (g) => g.field === "valuation.dcf.salesToCapital",
    wording: (g) => g.severity === "critical" && g.field === "valuation.dcf.salesToCapital" && g.reason.startsWith("balance-sheet fields missing"),
    code: (g) => g.severity === "critical" && g.field === "valuation.dcf.salesToCapital" && coded(g, "invested-capital-balance-fields-missing"),
    current: (g) => g.severity === "critical" && quotesUpstreamNetDebt(g as ManifestEntry),
  },
  {
    id: "G5",
    consumer: "src/pipeline/stageB/seniorClaims.ts temporaryEquityUnknownAt",
    reads: (g) => g.field.startsWith("statements.balance."),
    wording: legacyTemporaryEquityUnknown,
    code: (g) => temporaryEquityPath(g) && coded(g, "temporary-equity-enrichment-withheld", "temporary-equity-operands-unmatched"),
    current: (g) => { const date = balanceDate(g.field); return date !== null && temporaryEquityUnknownAt({}, date, [g]) !== null; },
  },
  {
    id: "P1",
    consumer: "src/providers/fmp.ts isFmpQuotaGap (retry loop, dataBundle rateLimitedValuationEntry, compute analyst-estimate refusal)",
    reads: (g) => g.field.startsWith("fmp."),
    // `isFmpQuotaReason` on main before D-242.
    wording: (g) => g.reason.startsWith("FMP quota/rate limit"),
    code: (g) => coded(g, "fmp-quota"),
    current: (g) => isFmpQuotaGap(g),
  },
  {
    id: "P2",
    consumer: "src/providers/fmp.ts no-new-bar check (newestResult.gap.reason === FMP_EMPTY_ARRAY_REASON before D-242)",
    reads: (g) => g.field.startsWith("fmp."),
    wording: (g) => g.reason === FMP_EMPTY_ARRAY_REASON,
    code: (g) => coded(g, "fmp-empty-array"),
    current: (g) => gapCauseMatches(g, "fmpEmptyArrayAlone"),
  },
  {
    id: "P5-empty",
    consumer: "src/pipeline/unknownTicker.ts isConfirmedUnknownProfile (job runner and company page): a profile entry, the CIK lookup failed otherwise",
    reads: (g) => g.field.startsWith("fmp."),
    wording: (g) => legacyConfirmedUnknown(g, NEUTRAL_CIK_GAP),
    code: (g) => coded(g, "fmp-empty-array"),
    current: (g) => confirmedUnknown(g, NEUTRAL_CIK_GAP),
  },
  {
    id: "P3",
    consumer: "src/pipeline/dataBundle.ts markSegmentationGapExpected (includes FMP_EMPTY_ARRAY_REASON before D-242)",
    reads: (g) => /^fmp\.revenue(?:Product|Geographic)Segmentation\(/.test(g.field),
    wording: (g) => g.reason.includes(FMP_EMPTY_ARRAY_REASON),
    code: (g) => coded(g, "fmp-empty-array", "fmp-empty-array-fallback-failed"),
    current: (g) => { const result = failed(g); return markSegmentationGapExpected(result) !== result; },
  },
  {
    id: "P4",
    consumer: "src/pipeline/dataBundle.ts withResolvedPredecessor",
    reads: (g) => /^edgar\.(?:latestTenK|item1a|mdna|business|tenKNotes)\(/.test(g.field),
    wording: (g) => g.reason.includes(UNLINKED_PREDECESSOR_TEXT),
    code: (g) => coded(g, "sec-unlinked-predecessor"),
    current: (g) => { const result = failed(g); return withResolvedPredecessor(result, RESOLVED) !== result; },
  },
  {
    id: "P5-key",
    consumer: "src/pipeline/unknownTicker.ts isConfirmedUnknownProfile: a profile entry, SEC's ticker table not listing the symbol",
    reads: (g) => g.field.startsWith("fmp."),
    wording: (g) => legacyConfirmedUnknown(g, NOT_LISTED_GAP),
    code: (g) => coded(g, "fmp-empty-array", "fmp-no-api-key"),
    current: (g) => confirmedUnknown(g, NOT_LISTED_GAP),
  },
  {
    id: "P5-ticker",
    consumer: "src/pipeline/unknownTicker.ts isConfirmedUnknownProfile: a CIK entry, FMP without a key",
    reads: (g) => g.field.startsWith("edgar.tickerToCik("),
    wording: (g) => legacyConfirmedUnknown(NO_KEY_GAP, g),
    code: (g) => coded(g, "sec-ticker-not-listed"),
    current: (g) => confirmedUnknown(NO_KEY_GAP, g),
  },
  {
    id: "P7a",
    consumer: "src/pipeline/peers.ts symbolRefused",
    reads: (g) => g.field.startsWith("fmp."),
    wording: (g) => /this symbol is unavailable on this endpoint/i.test(g.reason),
    code: (g) => coded(g, "fmp-symbol-restricted"),
    current: (g) => symbolRefused(failed(g)),
  },
];

export interface Disagreement {
  site: string;
  /**
   * `uncoded`: the wording passes and the entry has no code. That is an entry written before D-229 (a
   * frozen input or run-input snapshot, whose codes are removed) or by a writer without one: it is
   * unresolved, and a reader moved to codes still reads it by its sentence (as `refusalCauseRead.ts`
   * does for conflicts). `conflict`: the entry carries a code and the two tests differ.
   */
  kind: "uncoded" | "conflict";
  path: string;
  wording: boolean;
  code: boolean;
  field: string;
  cause: unknown;
  reason: string;
}

/** Whether a plain value has a missing-data entry's shape (as `isManifestEntryShaped`). */
export const isGapLike = (value: unknown): value is GapLike => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return typeof v.field === "string" && typeof v.reason === "string" &&
    (v.severity === "info" || v.severity === "warn" || v.severity === "critical");
};

/** Every missing-data-shaped entry anywhere in `value`, with its JSON path. */
export function collectGaps(value: unknown, path = "$"): { path: string; gap: GapLike }[] {
  const out: { path: string; gap: GapLike }[] = [];
  const walk = (node: unknown, at: string) => {
    if (node === null || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach((item, i) => walk(item, `${at}[${i}]`)); return; }
    if (isGapLike(node)) out.push({ path: at, gap: node });
    for (const [key, child] of Object.entries(node)) walk(child, `${at}.${key}`);
  };
  walk(value, path);
  return out;
}

export interface AgreementReport {
  entries: number;
  coded: number;
  /** Per site: entries where both tests pass, and where they disagree. */
  sites: Record<string, { both: number; disagreements: Disagreement[] }>;
}

/** Run every site over every entry. A site with no positive entry reports `both: 0`. */
export function agreementReport(gaps: readonly { path: string; gap: GapLike }[]): AgreementReport {
  const sites: AgreementReport["sites"] = Object.fromEntries(AGREEMENT_SITES.map((s) => [s.id, { both: 0, disagreements: [] }]));
  for (const { path, gap } of gaps) {
    for (const site of AGREEMENT_SITES) {
      if (!site.reads(gap)) continue;
      const wording = site.wording(gap);
      const code = site.code(gap);
      if (wording && code) sites[site.id]!.both++;
      else if (wording !== code) {
        sites[site.id]!.disagreements.push({ site: site.id, kind: gap.cause === undefined ? "uncoded" : "conflict", path, wording, code, field: gap.field, cause: gap.cause, reason: gap.reason });
      }
    }
  }
  return { entries: gaps.length, coded: gaps.filter(({ gap }) => gap.cause !== undefined).length, sites };
}

/**
 * G2, `src/pipeline/compute.ts` observed-trigger suffix: it reads the valuation result's
 * `suppressionReason`, not an entry. The code is on the result's `valuation.dcf` gap, which carries
 * the same sentence; since D-242 `isUnprofitableOverlaySuppression` reads it there (`current`).
 */
export function g2Agreement(valuation: { kind?: unknown; suppressionReason?: unknown; gaps?: readonly GapLike[] }): { wording: boolean; code: boolean; current: boolean } {
  const wording = valuation.kind === "dcf-suppressed" && typeof valuation.suppressionReason === "string" &&
    valuation.suppressionReason.startsWith("DCF suppressed for unprofitable overlay");
  const code = valuation.kind === "dcf-suppressed" && (valuation.gaps ?? []).some((g) => g.field === "valuation.dcf" && coded(g, "dcf-unprofitable-overlay"));
  const current = valuation.kind === "dcf-suppressed" && isUnprofitableOverlaySuppression({
    suppressionReason: typeof valuation.suppressionReason === "string" ? valuation.suppressionReason : undefined,
    gaps: (valuation.gaps ?? []) as ManifestEntry[],
  });
  return { wording, code, current };
}

/** The entry without its code (an entry stored before D-229, or restored from a run-input snapshot). */
export const uncoded = (gap: GapLike): GapLike => {
  if (!("cause" in gap)) return gap;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { cause, ...rest } = gap;
  return rest;
};

export interface EqualityMismatch { site: string; path: string; coded: boolean; wording: boolean; current: boolean; field: string; cause: unknown; reason: string }

/**
 * D-242: for every entry a site reads, the consumer's decision now (`current`) against its
 * wording-only decision on main (`wording`), on the entry as written and on the same entry
 * without its code. Returns every mismatch and, per site, how many entries were compared and passed.
 */
export function equalityReport(gaps: readonly { path: string; gap: GapLike }[]): { mismatches: EqualityMismatch[]; sites: Record<string, { compared: number; passing: number; coded: number }> } {
  const mismatches: EqualityMismatch[] = [];
  const sites: Record<string, { compared: number; passing: number; coded: number }> =
    Object.fromEntries(AGREEMENT_SITES.map((s) => [s.id, { compared: 0, passing: 0, coded: 0 }]));
  for (const { path, gap } of gaps) {
    for (const site of AGREEMENT_SITES) {
      if (!site.reads(gap)) continue;
      for (const entry of gap.cause === undefined ? [gap] : [gap, uncoded(gap)]) {
        const wording = site.wording(entry);
        const current = site.current(entry);
        const tally = sites[site.id]!;
        tally.compared++;
        if (entry.cause !== undefined) tally.coded++;
        if (wording) tally.passing++;
        if (wording !== current) mismatches.push({ site: site.id, path, coded: entry.cause !== undefined, wording, current, field: entry.field, cause: entry.cause, reason: entry.reason });
      }
    }
  }
  return { mismatches, sites };
}
