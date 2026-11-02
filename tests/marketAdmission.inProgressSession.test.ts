import { describe, expect, it } from "vitest";
import { admitMarketBars } from "@/pipeline/stageB/marketAdmission";
import { computeTechnicals } from "@/pipeline/stageB/technicals";

/**
 * FIGR extra-high paid run (2026-11-02, built 16:04:49Z = 11:04 New York): the
 * price history held a bar for 2026-11-02 while that session was still open
 * (1.19M shares traded vs 7.92M the previous full day). Technicals called its
 * latest trade ($21.93) the "Last close" for 2026-11-02, beside the key-data
 * intraday quote ($22.10). A session bar counts once the 16:00 New York close
 * has settled (30 minutes, as quote caching treats it).
 */
const bar = (date: string, close: number, volume = 5_000_000) => ({ date, open: close, high: close * 1.02, low: close * 0.98, close, volume });
const tail = [bar("2026-10-28", 22.8), bar("2026-10-29", 23.59), bar("2026-10-30", 21.58, 7_915_528), bar("2026-11-02", 21.93, 1_191_267)];

describe("in-progress session bars", () => {
  it("leaves out the current session's bar while that session is open", () => {
    const out = admitMarketBars(tail, "symbol", "2026-11-02T16:04:49.810Z");
    expect(out.rows.map(r => r.date)).toEqual(["2026-10-28", "2026-10-29", "2026-10-30"]);
    expect(out.notes.join(" ")).toMatch(/2026-11-02 session.*in progress/);
  });

  it("keeps the bar once the close has settled, and keeps it after midnight UTC", () => {
    expect(admitMarketBars(tail, "symbol", "2026-11-02T21:20:00Z").rows.at(-1)!.date).toBe("2026-10-30"); // 16:20 New York: settling
    expect(admitMarketBars(tail, "symbol", "2026-11-02T21:31:00Z").rows.at(-1)!.date).toBe("2026-11-02"); // 16:31 New York
    expect(admitMarketBars(tail, "symbol", "2026-11-03T02:00:00Z").rows.at(-1)!.date).toBe("2026-11-02"); // 21:00 New York
  });

  it("follows daylight saving time", () => {
    const july = [bar("2026-07-14", 30), bar("2026-07-15", 31)];
    expect(admitMarketBars(july, "symbol", "2026-07-15T19:59:00Z").rows.at(-1)!.date).toBe("2026-07-14"); // 15:59 EDT
    expect(admitMarketBars(july, "symbol", "2026-07-15T20:31:00Z").rows.at(-1)!.date).toBe("2026-07-15"); // 16:31 EDT
  });

  it("changes nothing without an analysis time", () => {
    expect(admitMarketBars(tail, "chart").rows).toHaveLength(4);
  });

  it("reports the last completed close in technicals", () => {
    const history = Array.from({ length: 260 }, (_, i) => {
      const d = new Date(Date.UTC(2025, 9, 1) + i * 86_400_000);
      return d.getUTCDay() === 0 || d.getUTCDay() === 6 ? null : bar(d.toISOString().slice(0, 10), 40 - i * 0.05);
    }).filter((row): row is ReturnType<typeof bar> => row !== null && row.date < "2026-10-28");
    const rows = [...history, ...tail];
    const t = computeTechnicals(rows, rows, [], null, { analysisAt: "2026-11-02T16:04:49.810Z" });
    expect(t.lastClose).toBe(21.58);
    expect(t.asOf).toBe("2026-10-30");
  });
});
