import { describe, expect, it } from "vitest";
import { plainFieldNames, signalLabel } from "@/report/presentation";

// Release R54: a rank label names the measure it ranks; the book rank may fall back from P/TBV to P/B.
describe("R54 own-history rank labels", () => {
  it("names the book rank so it is true for P/TBV and for its P/B fallback", () => {
    expect(signalLabel("priceToTbvOwnHistoryRank")).toBe("Book multiple own-history rank (P/TBV, or P/B where tangible book is unavailable)");
    expect(signalLabel("priceToTbvOwnHistoryRank")).not.toMatch(/tbv own history/i);
  });
  it("words a withheld rank id in a gap reason", () => {
    expect(plainFieldNames("peOwnHistoryRank withheld")).toBe("valuation multiple own-history rank withheld");
    expect(plainFieldNames("computed.scores.valuation.peOwnHistoryRank")).toBe("computed.scores.valuation.peOwnHistoryRank");
  });
  it("keeps the valuation-multiple rank label (control)", () => {
    expect(signalLabel("peOwnHistoryRank")).toBe("Valuation multiple own-history rank");
  });
});
