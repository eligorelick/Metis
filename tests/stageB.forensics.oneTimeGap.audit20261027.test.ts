// FIN-509-V1 (audit 2026-10-27): when no lookback year can be evaluated, the
// one-time-items rule must say so in the missing-data manifest instead of
// disappearing silently.
import { describe, expect, it } from "vitest";
import { computeSupportFlags } from "@/pipeline/stageB/forensics";

const years = ["2025", "2024", "2023", "2022", "2021"];
const gapsFor = (r: ReturnType<typeof computeSupportFlags>) =>
  r.gaps.filter((g) => g.field === "forensics.flags.oneTimeItems");

describe("one-time-items rule not evaluated (FIN-509-V1)", () => {
  it("when no lookback year can be evaluated, the rule says it was not evaluated", () => {
    const r = computeSupportFlags({
      income: years.map((y) => ({ date: `${y}-12-31`, revenue: 1e9, operatingIncome: 100e6, totalOtherIncomeExpensesNet: null })),
      balance: [],
    });
    expect(r.gaps).toContainEqual(
      expect.objectContaining({
        field: "forensics.flags.oneTimeItems",
        severity: "info",
        reason: expect.stringMatching(/one-time-items rule not evaluated/),
      }),
    );
    expect(r.flags.filter((f) => /one-time-items/.test(f.id))).toEqual([]);
  });

  it("states the SEC-route operand and that no stand-in is used", () => {
    const r = computeSupportFlags({
      income: years.map((y) => ({ date: `${y}-12-31`, revenue: 1e9, operatingIncome: 100e6, totalOtherIncomeExpensesNet: null })),
      balance: [],
    });
    expect(gapsFor(r)).toEqual([
      {
        field: "forensics.flags.oneTimeItems",
        severity: "info",
        reason:
          "net other income/expense (totalOtherIncomeExpensesNet) is missing, or operating income is zero or missing, in every one of the last 5 fiscal years \u2014 one-time-items rule not evaluated (on SEC-built statements the field is the NonoperatingIncomeExpense aggregate only; a narrower OtherNonoperatingIncomeExpense is not used as a stand-in, RESEARCH 5.3)",
      },
    ]);
  });

  it("control: an evaluated lookback raises the flag as before and no gap", () => {
    const r = computeSupportFlags({
      income: years.map((y) => ({ date: `${y}-12-31`, revenue: 1e9, operatingIncome: 100e6, totalOtherIncomeExpensesNet: -30e6 })),
      balance: [],
    });
    expect(r.flags.map((f) => f.id)).toContain("serial-one-time-items");
    expect(gapsFor(r)).toEqual([]);
  });

  it("control: no income rows at all adds no one-time-items gap (the growth gap already covers it)", () => {
    expect(gapsFor(computeSupportFlags({ income: [], balance: [] }))).toEqual([]);
  });
});
