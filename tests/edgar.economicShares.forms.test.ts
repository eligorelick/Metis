import { describe, expect, it } from "vitest";
import { classEconomicContradiction, identicalClassRights, participatingClassRights, shareForShareClassRights } from "@/edgar/economicShares";

const classes = ["class q common stock", "class r common stock"];

describe("synthetic legal forms of class economics", () => {
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
  ])("names the classes whose current economics contradict a one-unit proxy: %s", text => {
    const reason = classEconomicContradiction(text, classes);
    expect(reason).toMatch(/Class [QR]/);
  });

  it.each([
    "Class Q and Class R common stock received dividends of $0.44 per share.",
    "During 2025 and 2024 we paid dividends of $0.44 and $0.28 per share, respectively, on Class Q and Class R common stock.",
    "Class Q received a dividend of $0.44 per share in 2025 and Class R received a dividend of $0.28 per share in 2024.",
    "The dividend was $0.44 per share for Class Q stock, par value $0.01 per share, and Class R stock, par value $0.02 per share.",
    "Class Q common stock received dividends of $0.44 per share and Class R common stock received dividends of $0.44 per share.",
    "We paid a dividend of $0.44 per common share, totaling $88 million for Class Q common stock and $44 million for Class R common stock.",
    "Class Q shares have voting rights different from Class R shares.",
    "Class Q shares are convertible into Class R shares on a one-for-one basis.",
  ])("does not confuse shared rates, aggregate payments or votes with unequal economics: %s", text => {
    expect(classEconomicContradiction(text, classes)).toBeNull();
  });
});
