import { expect, it } from "vitest";
import { returnPathLanguageFindings } from "@/pipeline/stageC/returnPathLanguage";
it.each(["ROE recovers from last year's decline toward the cost of equity.", "ROTE rebounds after falling and climbs back toward the cost of equity."])("AI-104 flags recovery from a faded origin: %s", text => {
 expect(returnPathLanguageFindings({ texts: [{ path: "verdict.synthesis", text }], trailing: { returnPct: 16.5, asOf: null, label: "TTM" }, terminalTargetPct: 10.4 })).toHaveLength(1);
});
