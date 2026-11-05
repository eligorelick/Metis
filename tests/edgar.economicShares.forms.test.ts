import { describe, expect, it } from "vitest";
import { classEconomicContradiction, identicalClassRights, participatingClassRights, shareForShareClassRights } from "@/edgar/economicShares";
import { nonEconomicDenial, sharedClassDividendRate } from "@/edgar/classEvidence";

const classes = ["class q common stock", "class r common stock"];

describe("synthetic legal forms of class economics", () => {
  it.each([
    "We declared dividends of $0.42 per share on Class Q and Class R common stock.",
    "Dividends of $0.42 per share were declared on Class Q common stock and Class R common stock.",
    "Class Q and Class R common stock each received dividends of $0.42 per share.",
  ])("requires one rate explicitly applied to a coordinated class list: %s", text => {
    expect(sharedClassDividendRate(text, classes, "2026-09-30")).toBe(text);
  });
  it.each([
    "Dividends of $0.42 per share were declared on Class Q common stock and none on Class R common stock.",
    "Before the 2022 reorganization, dividends of $0.42 per share were paid on Class Q and Class R common stock.",
    "If approved, dividends of $0.42 per share would be paid on Class Q and Class R common stock.",
    "Dividends of $0.42 per share were paid on Class Q and Class R common stock in 2023.",
  ])("does not turn mentions or historical/conditional payments into current parity: %s", text => {
    expect(sharedClassDividendRate(text, classes, "2026-09-30")).toBeNull();
  });
  it.each([
    "Class Q common stock does not participate in liquidation distributions.",
    "Class R common stock carries a preferred dividend entitlement.",
    "Class Q common stock is entitled to three times the distributions on Class R common stock.",
    "Class R common stock is junior to Class Q common stock for dividends.",
  ])("reads a named class entitlement with negation, a multiple or priority: %s", text => {
    expect(classEconomicContradiction(text, classes)).toContain(text);
  });
  it.each([
    "Class Q common stock has no dividends payable at quarter end.",
    "Class Q common stock does not receive dividends until declared by directors.",
    "Dividends are payable only on Class Q and Class R common stock.",
  ])("requires a complete entitlement clause rather than its prefix: %s", text => {
    expect(classEconomicContradiction(text, classes)).toBeNull();
  });
  it.each([
    "Class Q common stock is convertible, share-for-share, into Class R common stock.",
    "Each share of Class Q common stock is convertible into Class R common stock on a share-for-share basis.",
    "Each share of Class Q common stock is convertible at the option of its holder into one share of Class R common stock.",
    "Class Q common stock is convertible into Class R common stock on a one-for-one basis.",
    "Class Q shares are convertible, share for share, into Class R shares.",
    "Each Class Q share may be converted into one Class R share.",
    "Class Q shares are convertible at any time into Class R shares on a one-for-one basis at the option of the stockholder.",
    "Shares of our Class Q common stock are convertible into an equivalent number of shares of our Class R common stock.",
  ])("reads an explicit one-for-one conversion: %s", text => {
    expect(shareForShareClassRights(text)).toEqual(classes);
  });

  it.each([
    "Class Q common stock is convertible into Class R common stock.",
    "Each share of Class Q common stock is convertible into two shares of Class R common stock.",
    "Class Q common stock is not convertible, share for share, into Class R common stock.",
    "Class Q common stock was convertible, share for share, into Class R common stock.",
    "Class Q common stock may become convertible, share for share, into Class R common stock.",
    "If approved, Class Q shares are convertible, share for share, into Class R shares.",
    "Class Q shares are convertible into Class R shares at a ratio set by the board.",
    "Class Q shares have one vote per share, as do Class R shares.",
    "Class Q and Class R common stock have the same par value.",
  ])("does not infer economic units: %s", text => {
    expect(shareForShareClassRights(text)).toBeNull();
    expect(identicalClassRights(text)).toBeNull();
  });

  it.each([
    "Class Q common stock and Class R common stock are participating securities with equal participation rights and receive dividends on a share-for-share basis.",
    "Class Q subordinate voting shares and Class R restricted voting shares are participating securities with equal participation rights and are entitled to receive dividends on a share for share basis.",
    "We use the two-class method for net income per share as Class Q and Class R common shares are participating securities with equal participation rights and receive dividends on a one-for-one basis.",
    "Earnings per Share We use the two-class method for net income per share as Class Q and Class R common shares are participating securities with equal participation rights and receive dividends on a one-for-one basis.",
  ])("reads participation independently of an EPS introduction: %s", text => {
    expect(participatingClassRights(text)).toEqual(classes);
  });

  it.each([
    "Class Q and Class R common stock are participating securities with unequal participation rights and receive dividends on a share-for-share basis.",
    "Class Q and Class R common stock are participating securities with equal voting rights and receive dividends on a share-for-share basis.",
    "Class Q and Class R common stock are participating securities with equal participation rights and may receive dividends.",
    "Class Q and Class R common stock would be participating securities with equal participation rights and receive dividends on a share-for-share basis.",
  ])("does not infer equal participation: %s", text => {
    expect(participatingClassRights(text)).toBeNull();
  });

  it.each([
    "The rights of the holders of Class Q, Class R and Class S stock are identical, except with respect to voting.",
    "The rights of Class Q and Class R common stock are identical, other than voting rights.",
    "The Class Q and Class R common stock have the same dividend and liquidation rights.",
    "Holders of our Class Q and Class R common stock have identical rights except with respect to voting, conversion and transfer rights and therefore share equally in our net income or losses.",
    "Holders of Class Q and Class R common stock are entitled to equal dividends per share and share equally in liquidation.",
    "Earnings per share amounts are the same for Class Q and Class R common shares as the holders of each class are legally entitled to equal per-share distributions whether through dividends or in liquidation.",
    "Earnings per Share Earnings per share amounts are the same for Class Q and Class R common shares as the holders of each class are legally entitled to equal per-share distributions whether through dividends or in liquidation.",
  ])("reads complete current economic rights: %s", text => {
    expect(identicalClassRights(text)).toEqual(text.includes("Class S") ? [...classes, "class s common stock"] : classes);
  });

  it.each([
    "The voting rights of Class Q and Class R common stock are identical.",
    "The rights of Class Q and Class R common stock are identical, except for dividends.",
    "Holders of Class Q and Class R common stock are entitled to equal dividends per share.",
    "Earnings per share amounts are the same for Class Q and Class R common shares.",
  ])("requires economic rights beyond votes, par or equal EPS: %s", text => {
    expect(identicalClassRights(text)).toBeNull();
  });

  it.each([
    "Class Q common stock received dividends of $0.44 per share and Class R common stock received dividends of $0.28 per share.",
    "Dividends per share were $0.44 for Class Q and $0.28 for Class R.",
    "Dividends of $0.44 and $0.28 per share were declared on Class Q and Class R common stock, respectively.",
    "Class Q shares may receive a cash dividend without paying a cash dividend on Class R shares.",
    "Class R common stock has preferential dividend rights.",
    "Class R shares receive 110% of the dividend payable on Class Q shares.",
    "No dividends are paid on Class R common stock.",
    "The board declared $0.50 per share of Class Q common stock and $0.45 per share of Class R common stock in December 2025, payable January 2026.",
    "Class Q common stock receives 1.5 times the dividend on Class R common stock.",
    "Class Q common stock receives a lower dividend than Class R common stock.",
    "Class Q common stock holders receive $0.80 for each $1.00 of dividends paid to Class R common stock holders.",
    "The Class Q common stock dividend was $0.40 per share in 2025. The Class R common stock dividend was $0.30 per share in 2025.",
    "Dividends paid on Class Q common stock exceed dividends paid on Class R common stock by $0.03 per share.",
    "The board may declare dividends on Class Q common stock alone.",
  ])("names the classes whose current economics contradict a one-unit proxy: %s", text => {
    const reason = classEconomicContradiction(text, classes);
    expect(reason).toMatch(/Class [QR]/);
  });
  it("quotes both operands when equal-period class rates are in separate sentences", () => {
    const reason = classEconomicContradiction("The Class Q common stock dividend was $0.40 per share in 2025. The Class R common stock dividend was $0.30 per share in 2025.", classes);
    expect(reason).toContain("$0.40 per share");
    expect(reason).toContain("$0.30 per share");
  });
  it("does not guess a class identity from an unbound voting label", () => {
    expect(classEconomicContradiction("The rights of Class Q common stock and Class R common stock are identical. After 2027, the low-vote class will receive twice the dividend.", classes)).toBeNull();
  });

  it.each([
    "Class Q and Class R common stock received dividends of $0.44 per share.",
    "No dividends are paid on Class Q and Class R common stock.",
    "During 2025 and 2024 we paid dividends of $0.44 and $0.28 per share, respectively, on Class Q and Class R common stock.",
    "Class Q received a dividend of $0.44 per share in 2025 and Class R received a dividend of $0.28 per share in 2024.",
    "Employees purchase Class Q common stock through a stock purchase plan with participation limited to 15% of salary.",
    "Class Q and Class R common stock share ratably in liquidation after payment of senior liabilities.",
    "Class Q warrants: Dividend yield 0% and expected life 5 years.",
    "We signed an Equity Distribution Agreement to issue Class Q common stock.",
    "We paid 33 cents per share; Class Q and Class R received $880 million and $3 million, respectively.",
    "The dividend was $0.44 per share for Class Q stock, par value $0.01 per share, and Class R stock, par value $0.02 per share.",
    "Class Q common stock received dividends of $0.44 per share and Class R common stock received dividends of $0.44 per share.",
    "We paid a dividend of $0.44 per common share, totaling $88 million for Class Q common stock and $44 million for Class R common stock.",
    "Class Q shares have voting rights different from Class R shares.",
    "Class Q shares are convertible into Class R shares on a one-for-one basis.",
  ])("does not confuse shared rates, aggregate payments or votes with unequal economics: %s", text => {
    expect(classEconomicContradiction(text, classes)).toBeNull();
  });
  it.each([
    "There are no economic rights associated with the Control Share.",
    "There are no economic rights associated with the Control Share, and in certain circumstances, the controller could have voting power greater than the percentage of shares held.",
  ])("reads an unconditional no-economic-rights declaration: %s", text => {
    expect(nonEconomicDenial(text, "Control Share")).toBe(true);
  });
  it.each([
    "There are no economic rights associated with the Control Share until January 2027.",
    "There are no economic rights associated with the Control Share, and that ends on January 1, 2027.",
  ])("does not turn a qualified denial into a permanent exclusion: %s", text => {
    expect(nonEconomicDenial(text, "Control Share")).toBe(false);
  });
});
