/**
 * D-229 (P10, P11): the agreement check between each consumer's wording test on a
 * missing-data entry and the typed cause the producer now writes beside it.
 *
 * Each site keeps the consumer's other conditions (field, severity, path) and
 * swaps only the wording test for a code test, so a disagreement means a later
 * step that moves the consumer to the code would decide differently. The
 * wording side uses the consumer's own exported function where one exists;
 * otherwise it copies the expression, with its file named.
 *
 * Used by tests/gapCause.agreement.test.ts and, over the same-report cases'
 * Stage B outputs, by a one-off run of {@link agreementReport}.
 */
import { isFmpQuotaReason, FMP_EMPTY_ARRAY_REASON } from "@/providers/fmp";
import { dcfWithheldWarnGap } from "@/pipeline/stageB/fairValue";
import { temporaryEquityUnknownAt } from "@/pipeline/stageB/seniorClaims";
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
}

/** `src/pipeline/dataBundle.ts` (not exported there). */
export const UNLINKED_PREDECESSOR_TEXT = " — its predecessor's annual reports live under another CIK that EDGAR does not link";
const ENRICHMENT_WITHHELD = "temporary-equity SEC enrichment withheld: ";

/** A code passes only when it is exactly one of the listed members; an absent or unknown value never does. */
const coded = (gap: GapLike, ...codes: GapCause[]): boolean =>
  typeof gap.cause === "string" && (GAP_CAUSES as readonly string[]).includes(gap.cause) && (codes as string[]).includes(gap.cause);

/** The balance date in a `statements.balance.<date>.<field>` path, or null. */
const balanceDate = (field: string): string | null => /^statements\.balance\.([^.]+)\./.exec(field)?.[1] ?? null;
/** `temporaryEquityUnknownAt`'s own non-wording conditions (warn, one of its paths), with the wording test satisfied. */
const temporaryEquityPath = (gap: GapLike): boolean => {
  const date = balanceDate(gap.field);
  return date !== null && temporaryEquityUnknownAt({}, date, [{ ...gap, reason: `${ENRICHMENT_WITHHELD}path probe` }]) !== null;
};

export const AGREEMENT_SITES: readonly AgreementSite[] = [
  {
    id: "G1",
    consumer: "src/pipeline/compute.ts FIN-OTHER retained-suppression rewrite",
    reads: (g) => g.field === "valuation.dcf",
    wording: (g) => g.field === "valuation.dcf" && g.reason.startsWith("DCF suppressed for unprofitable overlay"),
    code: (g) => g.field === "valuation.dcf" && coded(g, "dcf-unprofitable-overlay"),
  },
  {
    id: "G3",
    consumer: "src/pipeline/stageB/fairValue.ts dcfWithheldWarnGap",
    reads: (g) => g.field === "valuation.dcf.salesToCapital",
    wording: (g) => dcfWithheldWarnGap([g as never]) !== undefined,
    code: (g) => g.severity === "warn" && g.field === "valuation.dcf.salesToCapital" &&
      coded(g, "invested-capital-temporary-equity-refused", "invested-capital-lease-emptied"),
  },
  {
    id: "G4",
    consumer: "src/pipeline/stageB/fairValue.ts dcfWithheldReason (upstream net-debt quote)",
    reads: (g) => g.field === "valuation.dcf.salesToCapital",
    wording: (g) => g.severity === "critical" && g.field === "valuation.dcf.salesToCapital" && g.reason.startsWith("balance-sheet fields missing"),
    code: (g) => g.severity === "critical" && g.field === "valuation.dcf.salesToCapital" && coded(g, "invested-capital-balance-fields-missing"),
  },
  {
    id: "G5",
    consumer: "src/pipeline/stageB/seniorClaims.ts temporaryEquityUnknownAt",
    reads: (g) => g.field.startsWith("statements.balance."),
    wording: (g) => { const date = balanceDate(g.field); return date !== null && temporaryEquityUnknownAt({}, date, [g]) !== null; },
    code: (g) => temporaryEquityPath(g) && coded(g, "temporary-equity-enrichment-withheld", "temporary-equity-operands-unmatched"),
  },
  {
    id: "P1",
    consumer: "src/providers/fmp.ts isFmpQuotaReason (retry loop, dataBundle, compute)",
    reads: (g) => g.field.startsWith("fmp."),
    wording: (g) => isFmpQuotaReason(g.reason),
    code: (g) => coded(g, "fmp-quota"),
  },
  {
    id: "P2/P5-empty",
    consumer: "src/providers/fmp.ts no-new-bar check; src/pipeline/jobRunner.ts and src/app/company/[symbol]/page.tsx confirmed miss (=== FMP_EMPTY_ARRAY_REASON)",
    reads: (g) => g.field.startsWith("fmp."),
    wording: (g) => g.reason === FMP_EMPTY_ARRAY_REASON,
    code: (g) => coded(g, "fmp-empty-array"),
  },
  {
    id: "P3",
    consumer: "src/pipeline/dataBundle.ts markSegmentationGapExpected (includes FMP_EMPTY_ARRAY_REASON)",
    reads: (g) => /^fmp\.revenue(?:Product|Geographic)Segmentation\(/.test(g.field),
    wording: (g) => g.reason.includes(FMP_EMPTY_ARRAY_REASON),
    code: (g) => coded(g, "fmp-empty-array"),
  },
  {
    id: "P4",
    consumer: "src/pipeline/dataBundle.ts withResolvedPredecessor",
    reads: (g) => /^edgar\.(?:latestTenK|item1a|mdna|business|tenKNotes)\(/.test(g.field),
    wording: (g) => g.reason.includes(UNLINKED_PREDECESSOR_TEXT),
    code: (g) => coded(g, "sec-unlinked-predecessor"),
  },
  {
    id: "P5-key",
    consumer: "src/pipeline/jobRunner.ts and src/app/company/[symbol]/page.tsx (/no API key/ on the profile gap)",
    reads: (g) => g.field.startsWith("fmp."),
    wording: (g) => /no API key/.test(g.reason),
    code: (g) => coded(g, "fmp-no-api-key"),
  },
  {
    id: "P5-ticker",
    consumer: "src/pipeline/jobRunner.ts and src/app/company/[symbol]/page.tsx (/not in SEC company_tickers\\.json/ on the CIK gap)",
    reads: (g) => g.field.startsWith("edgar.tickerToCik("),
    wording: (g) => /not in SEC company_tickers\.json/.test(g.reason),
    code: (g) => coded(g, "sec-ticker-not-listed"),
  },
  {
    id: "P7a",
    consumer: "src/pipeline/peers.ts symbolRefused",
    reads: (g) => g.field.startsWith("fmp."),
    wording: (g) => /this symbol is unavailable on this endpoint/i.test(g.reason),
    code: (g) => coded(g, "fmp-symbol-restricted"),
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
 * the same sentence; a later step that moves G2 to codes reads it there.
 */
export function g2Agreement(valuation: { kind?: unknown; suppressionReason?: unknown; gaps?: readonly GapLike[] }): { wording: boolean; code: boolean } {
  const wording = valuation.kind === "dcf-suppressed" && typeof valuation.suppressionReason === "string" &&
    valuation.suppressionReason.startsWith("DCF suppressed for unprofitable overlay");
  const code = valuation.kind === "dcf-suppressed" && (valuation.gaps ?? []).some((g) => g.field === "valuation.dcf" && coded(g, "dcf-unprofitable-overlay"));
  return { wording, code };
}
