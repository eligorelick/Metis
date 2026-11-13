/**
 * D-242 (P10, P11): the gap readers (G1-G5) and provider-status checks (P1-P5, P7a) decide by a
 * missing-data entry's typed cause, and by its sentence only when it carries none
 * (`gapCauseMatches`, `@/edgar/refusalCauseRead`). The decision must be what the wording-only
 * test on main decided, for every input:
 *
 * 1. entries with a code, as every producer writes them;
 * 2. the same entries without a code (stored before D-229, or restored from a run-input snapshot);
 * 3. D-229's one known disagreement (FMP's empty array with the keyless failure appended), which
 *    now carries `fmp-empty-array-fallback-failed` and stays "not a confirmed miss".
 *
 * Table-driven: each site in `AGREEMENT_SITES` names the wording test it had on main (`wording`)
 * and the consumer's decision now (`current`); `equalityReport` compares them on each entry with
 * and without its code.
 */
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GAP_CAUSES_READ_BY_CODE, gapCauseMatches, type GapCodeReader } from "@/edgar/refusalCauseRead";
import { selectAnnualFiling } from "@/pipeline/dataBundle";
import { FMP_EMPTY_ARRAY_REASON, resetFmpPlanLimits } from "@/providers/fmp";
import { resetFmpAccess } from "@/providers/fmpAccess";
import { GAP_CAUSES } from "@/types/refusalCause";
import { buildAuditFixtureComparison } from "./helpers/auditFixtureComparison";
import {
  AGREEMENT_SITES, collectGaps, confirmedUnknown, equalityReport, g2Agreement, legacyConfirmedUnknown, NEUTRAL_CIK_GAP,
  NOT_LISTED_GAP, NO_KEY_GAP, uncoded, UNLINKED_PREDECESSOR_TEXT, type GapLike,
} from "./helpers/gapCauseAgreement";
import {
  edgarTickerStatuses, fmpStatuses, gapOf, investedCapitalStatuses, keylessExtendedProfile, submissions, successorBundle,
  temporaryEquityStatuses, valuationStatuses,
} from "./helpers/gapCauseProducers";
import { withoutGapCauses } from "@/pipeline/stageA/manifest";
import { isConfirmedUnknownProfile } from "@/pipeline/unknownTicker";

const ROOT = path.join(__dirname, "..");

afterEach(() => {
  resetFmpPlanLimits();
  resetFmpAccess();
  vi.useRealTimers();
});

async function produced() {
  return {
    fmp: await fmpStatuses(), edgar: await edgarTickerStatuses(), bundle: await successorBundle(),
    temporaryEquity: temporaryEquityStatuses(), investedCapital: investedCapitalStatuses(), valuation: valuationStatuses(),
    annual: [selectAnnualFiling(submissions(["8-K12B", "10-Q"]), "EXMP"), selectAnnualFiling(submissions(["10-Q"]), "NEW")],
    keyless: (await keylessExtendedProfile()).profile,
  };
}

/**
 * Rows only an older writer, a saved report or a hand edit would hold: each site's wording edge
 * (prefix, suffix, case, containment) without a code. A code is never derived from these.
 */
const LEGACY_ROWS: readonly GapLike[] = [
  { field: "valuation.dcf", reason: "DCF suppressed for unprofitable overlay — older sentence", severity: "info" },
  { field: "valuation.dcf", reason: "dcf suppressed for unprofitable overlay (lower case)", severity: "info" },
  { field: "valuation.dcf.salesToCapital", reason: "Temporary equity refused for invested capital: older", severity: "warn" },
  { field: "valuation.dcf.salesToCapital", reason: "Temporary equity refused for invested capital: on a critical row", severity: "critical" },
  { field: "valuation.dcf.salesToCapital", reason: "Invested capital emptied by the operating-lease removal: older", severity: "warn" },
  { field: "valuation.dcf.salesToCapital", reason: "balance-sheet fields missing for invested capital: totalDebt", severity: "critical" },
  { field: "valuation.dcf.salesToCapital", reason: "balance-sheet fields missing on a warn row", severity: "warn" },
  { field: "statements.balance.2024-12-31.temporaryEquity", reason: "temporary-equity SEC enrichment withheld: temporary carrying amounts are absent or explicitly refused for this SEC period", severity: "warn" },
  { field: "statements.balance.2024-12-31.temporaryEquity", reason: "temporary-equity SEC enrichment withheld: older reason", severity: "warn" },
  { field: "statements.balance.2024-12-31.temporaryEquity", reason: "temporary-equity SEC enrichment withheld: on an info row", severity: "info" },
  { field: "statements.balance.2024-12-31.totalAssets", reason: "temporary-equity SEC enrichment withheld: off its paths", severity: "warn" },
  { field: "fmp.quote(X)", reason: "FMP quota/rate limit (HTTP 429): slow down. still refused after waiting 5 s (bound 60 s).", severity: "warn" },
  { field: "fmp.quote(X)", reason: "a note about the FMP quota/rate limit", severity: "warn" },
  { field: "fmp.profile(X)", reason: FMP_EMPTY_ARRAY_REASON, severity: "info" },
  { field: "fmp.profile(X)", reason: `${FMP_EMPTY_ARRAY_REASON}; keyless profile failed: Yahoo HTTP 404`, severity: "info" },
  { field: "fmp.revenueProductSegmentation(X)", reason: `${FMP_EMPTY_ARRAY_REASON}; extended`, severity: "info" },
  { field: "fmp.revenueGeographicSegmentation(X)", reason: "FMP error (HTTP 500)", severity: "warn" },
  { field: "fmp.profile(X)", reason: "no API key + no fixture; keyless profile failed: Yahoo HTTP 404", severity: "warn" },
  { field: "edgar.latestTenK(X)", reason: `no "10-K" ...; the registrant is a successor issuer (Form 8-K12B filed 2026-01-01)${UNLINKED_PREDECESSOR_TEXT}`, severity: "critical" },
  { field: "edgar.mdna(X)", reason: "no annual primary filing (10-K or 20-F) to extract from: ...", severity: "critical" },
  { field: "edgar.tickerToCik(X)", reason: 'ticker "X" not in SEC company_tickers.json', severity: "warn" },
  { field: "edgar.tickerToCik(X)", reason: "company_tickers.json HTTP 503", severity: "critical" },
  { field: "fmp.quote(X)", reason: "FMP subscription (HTTP 402): THIS SYMBOL IS UNAVAILABLE ON THIS ENDPOINT with this key.", severity: "warn" },
  { field: "fmp.quote(X)", reason: "FMP subscription (HTTP 402): Restricted Endpoint; this endpoint is unavailable with this key.", severity: "warn" },
];

function expectEqual(report: ReturnType<typeof equalityReport>, label: string): void {
  expect(report.mismatches, `${label}: ${JSON.stringify(report.mismatches, null, 1)}`).toEqual([]);
}

describe("D-242: each switched reader decides as its wording test did on main", () => {
  it("on every entry the producers write, with its code and without it; each site sees a passing coded and uncoded entry", async () => {
    const report = equalityReport(collectGaps(await produced()));
    expectEqual(report, "producers");
    for (const site of AGREEMENT_SITES) {
      const tally = report.sites[site.id]!;
      expect(tally.coded, `${site.id} compares a coded entry`).toBeGreaterThan(0);
      expect(tally.compared - tally.coded, `${site.id} compares an uncoded entry`).toBeGreaterThan(0);
      expect(tally.passing, `${site.id} has a passing entry`).toBeGreaterThan(0);
    }
  });

  it("on rows only an older writer or a saved report holds (no code)", () => {
    expectEqual(equalityReport(LEGACY_ROWS.map((gap, i) => ({ path: `legacy[${i}]`, gap }))), "legacy rows");
  });

  it("on the DEMO audit fixture rebuilt from current code, and on the same projection without codes", async () => {
    const result = await buildAuditFixtureComparison({
      fmpFixtures: path.join(ROOT, "fixtures", "fmp"),
      reportFixture: path.join(ROOT, "fixtures", "report", "DEMO-sample.json"),
    });
    const report = equalityReport(collectGaps(result.projection));
    expectEqual(report, "DEMO");
    expect(report.sites["P5-key"]!.passing).toBeGreaterThan(0);
  });

  it("G2: the observed-trigger suffix reads the result's own valuation.dcf code, or its suppression sentence without one", () => {
    const { unprofitable, finOtherRetained, profitable } = valuationStatuses();
    for (const [label, run, expected] of [["unprofitable", unprofitable, true], ["FIN-OTHER retained", finOtherRetained, false], ["profitable", profitable, false]] as const) {
      for (const valuation of [run.valuation, withoutGapCauses(run.valuation)]) {
        const { wording, current } = g2Agreement(valuation);
        expect({ label, wording, current }).toEqual({ label, wording: expected, current: expected });
      }
    }
    // The suffix itself is written once on the unprofitable run (end to end through compute.ts).
    expect(unprofitable.valuation.kind === "dcf-suppressed" && unprofitable.valuation.suppressionReason).toMatch(/Observed trigger: unprofitable overlay applied:/);
  });

  it("P5: the confirmed-miss check over every profile and CIK entry pair, coded and uncoded", async () => {
    const fmp = await fmpStatuses();
    const edgar = await edgarTickerStatuses();
    const { profile: extended } = await keylessExtendedProfile();
    const profiles: GapLike[] = [gapOf(fmp.empty), gapOf(fmp.noKey), gapOf(fmp.quota), gapOf(fmp.symbol), gapOf(fmp.endpoint), gapOf(fmp.httpError), gapOf(fmp.objectBody), extended, NO_KEY_GAP];
    const ciks: GapLike[] = [gapOf(edgar.notListed), gapOf(edgar.httpError), NOT_LISTED_GAP, NEUTRAL_CIK_GAP];
    let positives = 0;
    for (const profile of profiles.flatMap((g) => [g, uncoded(g)])) {
      for (const cik of ciks.flatMap((g) => [g, uncoded(g)])) {
        const legacy = legacyConfirmedUnknown(profile, cik);
        expect(confirmedUnknown(profile, cik), `${profile.reason} | ${cik.reason}`).toBe(legacy);
        if (legacy) positives++;
      }
    }
    expect(positives).toBeGreaterThan(0);
    // A served profile decides by its rows, whatever the CIK lookup said (unchanged by D-242).
    const served = (rows: unknown[]) => ({ ok: true as const, value: { data: { rows } } });
    expect(isConfirmedUnknownProfile({ profile: served([]), edgar: { cik: { ok: false, gap: NOT_LISTED_GAP } } } as never)).toBe(true);
    expect(isConfirmedUnknownProfile({ profile: served([{ symbol: "X" }]), edgar: { cik: { ok: false, gap: NOT_LISTED_GAP } } } as never)).toBe(false);
    // A served CIK is never a miss on a no-key profile.
    expect(isConfirmedUnknownProfile({ profile: { ok: false, gap: NO_KEY_GAP }, edgar: { cik: { ok: true, value: {} } } } as never)).toBe(false);
    // D-229's known case: not a confirmed miss with its code, and not without it.
    expect(extended.cause).toBe("fmp-empty-array-fallback-failed");
    for (const cik of [NEUTRAL_CIK_GAP, NOT_LISTED_GAP]) {
      expect(confirmedUnknown(extended, cik)).toBe(false);
      expect(confirmedUnknown(uncoded(extended), cik)).toBe(false);
    }
  });
});

describe("D-242: the reader table", () => {
  const READERS: GapCodeReader[] = ["dcfUnprofitableOverlay", "investedCapitalClaimWithheld", "investedCapitalBalanceFieldsMissing",
    "temporaryEquityEnrichmentRefused", "fmpQuota", "fmpEmptyArrayAlone", "fmpEmptyArrayStated", "fmpNoApiKey", "secTickerNotListed",
    "secUnlinkedPredecessor", "fmpSymbolRestricted"];

  it("reads every listed gap code (none is written without a reader)", () => {
    expect([...GAP_CAUSES_READ_BY_CODE].sort()).toEqual([...GAP_CAUSES].sort());
  });

  it("an entry with a code is decided by the code alone: an unrelated or unknown code fails closed, whatever its sentence", () => {
    const matching = LEGACY_ROWS.map((g) => g.reason);
    for (const reader of READERS) {
      for (const reason of matching) {
        expect(gapCauseMatches({ reason, cause: "unknown-guess" }, reader), `${reader}: ${reason}`).toBe(false);
        expect(gapCauseMatches({ reason, cause: null }, reader), `${reader}: null`).toBe(false);
      }
    }
    // A listed code passes its readers whatever the sentence says.
    expect(gapCauseMatches({ reason: "reworded", cause: "fmp-quota" }, "fmpQuota")).toBe(true);
    expect(gapCauseMatches({ reason: FMP_EMPTY_ARRAY_REASON, cause: "fmp-empty-array-fallback-failed" }, "fmpEmptyArrayAlone")).toBe(false);
    expect(gapCauseMatches({ reason: "x", cause: "fmp-empty-array-fallback-failed" }, "fmpEmptyArrayStated")).toBe(true);
  });

  it("an entry without a code is read by its sentence; a missing sentence fails", () => {
    expect(gapCauseMatches({ reason: FMP_EMPTY_ARRAY_REASON }, "fmpEmptyArrayAlone")).toBe(true);
    expect(gapCauseMatches({}, "fmpEmptyArrayAlone")).toBe(false);
  });
});
