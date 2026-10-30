import { describe, expect, it } from "vitest";
import { parseGuidance, parseIssuerGrowthEffect } from "@/edgar/currentReports";
import { nextPeriodRevenueGuidance, outlookCaveats } from "@/pipeline/filingDisclosures";
import { dcfGuidance, runStageB } from "@/pipeline/compute";
import { noBuySellHold } from "@/report/schema";
import { GUIDED, releaseText, twoReleaseBundle } from "./helpers/guidanceCaveats";

describe("issuer-stated growth effects, disclosure only (R4)", () => {
  it("reads only explicit ex-item growth effects, signed in percentage points", () => {
    expect(parseIssuerGrowthEffect(GUIDED)).toEqual({ pp: 4 });
    expect(parseIssuerGrowthEffect("Excluding the divested unit, fourth quarter year-over-year growth would be approximately 150 basis points lower.")).toEqual({ pp: -1.5 });
    expect(parseIssuerGrowthEffect("Excluding FX, year-over-year growth would be about 12.5 basis points higher.")).toEqual({ pp: .125 });
    expect(parseIssuerGrowthEffect("This guidance anticipates an unfavorable impact of approximately 30 basis points from foreign exchange rates.")).toBeNull();
    expect(parseIssuerGrowthEffect("This guidance assumes that the annual sales event occurs in second quarter 2026.")).toBeNull();
    expect(parseIssuerGrowthEffect("Excluding an item. Year-over-year growth would be 400 basis points higher.")).toBeNull();
  });
  it("passes raw qualifiers to the anchor, and applies the display filter separately", () => {
    const bundle = twoReleaseBundle();
    const anchor = nextPeriodRevenueGuidance(bundle)!;
    expect(anchor).not.toBeNull();
    expect(anchor.qualifiers).toEqual(parseGuidance(releaseText())!.qualifiers);
    expect(anchor.qualifiers!.map(parseIssuerGrowthEffect)).toContainEqual({ pp: 4 });
    expect(dcfGuidance(bundle, anchor.currency)!.qualifiers).toEqual(anchor.qualifiers);
    expect(outlookCaveats(bundle, anchor.accession)).toEqual(anchor.qualifiers!.map(q => noBuySellHold(q) ? q : "An issuer outlook caveat is withheld from display by the rating-language filter; see the release."));
    expect(outlookCaveats(bundle, null)).toEqual([]);
    expect(outlookCaveats(bundle, "0000000000-00-000000")).toEqual([]);
  });
  it("retains a raw numeric effect even when its sentence is withheld from display", () => {
    const raw = "Excluding the buy recommendation, year-over-year growth would be nearly 400 basis points higher.";
    expect(noBuySellHold(raw)).toBe(false);
    const bundle = twoReleaseBundle(raw);
    const anchor = nextPeriodRevenueGuidance(bundle)!;
    expect(anchor.qualifiers).toContain(raw);
    expect(outlookCaveats(bundle, anchor.accession)).toEqual(["An issuer outlook caveat is withheld from display by the rating-language filter; see the release."]);
    const computed = runStageB(bundle);
    if (computed.valuation.kind !== "dcf") throw new Error("DCF fixture");
    expect(computed.valuation.assumptions!.revenueAnchor!.evidence!.guidedYoyIssuerEffectPp).toBe(4);
  });
});
