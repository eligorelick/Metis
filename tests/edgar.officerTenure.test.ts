import { describe, expect, it } from "vitest";
import { extractOfficerTenures, officerBiographiesText } from "@/edgar/officerTenure";
import { parseDocument } from "@/edgar/extract";

const filing = { source: "edgar:10-K officer-biographies 000123426000001", filingDate: "2026-02-13", reportDate: "2025-12-31", issuer: "Example Holdings Inc." };
const roster = [{ name: "Alex S. Smith", title: "Chairman and Chief Executive Officer" }, { name: "Jane Doe", title: "Chief Financial Officer" }];
const read = (text: string) => extractOfficerTenures(text, roster, filing);

describe("filing officer tenure, bound to a current roster person and office", () => {
  it("reads an officer table's exact office date, independently of the chair date", () => {
    const text = "Executive officers of the registrant Name Age Positions Alex Smith 60 Chairman since December 2006 and Chief Executive Officer since December 31, 2005. Jane Doe 52 Chief Financial Officer since May 2021, prior to which she was Head of Research.";
    expect(read(text)).toEqual([
      expect.objectContaining({ name: "Alex S. Smith", office: "ceo", start: "2005-12-31", precision: "day", wording: "December 31, 2005", source: filing.source, filingDate: "2026-02-13" }),
      expect.objectContaining({ name: "Jane Doe", office: "cfo", start: "2021-05-31", precision: "month", wording: "May 2021" }),
    ]);
  });

  it.each([
    ["Alex Smith became President and CEO in 2024.", "2024-12-31", "year", "2024"],
    ["Alex Smith was appointed as President and CEO of Example Holdings on April 24, 2024.", "2024-04-24", "day", "April 24, 2024"],
    ["On 7 August 2025, Alex Smith succeeded Robin Lee as president and chief executive officer of the Company.", "2025-08-07", "day", "7 August 2025"],
    ["Alex Smith has served as our Chief Executive Officer since February 2024.", "2024-02-29", "month", "February 2024"],
    ["Alex Smith 60 Chair, President, and Chief Executive Officer (CEO) (since 2017).", "2017-12-31", "year", "2017"],
  ])("keeps the stated precision in %s", (text, start, precision, wording) => {
    expect(read(`Information About Our Executive Officers ${text}`)[0]).toMatchObject({ start, precision, wording });
  });

  it.each([
    ["another employer after the date", "Alex Smith has served as CEO since 2014 at Another Corporation."],
    ["a deputy role", "Alex Smith has served as Deputy Chief Executive Officer since 2014."],
    ["an assistant role", "Jane Doe has served as Assistant Chief Financial Officer since 2014."],
    ["an acting role", "Alex Smith has served as Acting Chief Executive Officer since 2014."],
    ["a closed period", "Alex Smith has served as Chief Executive Officer since 2014 until 2016."],
  ])("refuses %s", (_label, text) => {
    expect(read(`Information About Our Executive Officers ${text}`)).toEqual([]);
  });

  it("uses the stated effective date, not the date of the announcement", () => {
    expect(read("Information About Our Executive Officers Alex Smith was appointed CEO of the Company on April 24, 2024, effective May 1, 2024.")[0])
      .toMatchObject({ start: "2024-05-01", wording: "May 1, 2024" });
  });

  it("does not move the start for an effective date that belongs to another office", () => {
    expect(read("Information About Our Executive Officers Alex Smith has served as CEO since 2014, and his appointment as Chairman became effective May 1, 2024.")[0])
      .toMatchObject({ start: "2014-12-31", wording: "2014" });
  });

  it("withholds the date when an effective date elsewhere could be this office's", () => {
    expect(read("Information About Our Executive Officers Alex Smith was appointed CEO of the Company on April 24, 2024, and the appointment became effective May 1, 2024.")).toEqual([]);
  });

  it.each([
    ["another person's office later in the sentence", "Alex Smith has served as President since 2018, while Robin Lee has served as CEO since 2010."],
    ["a named person in a separate clause", "Alex Smith has served as President since 2018 and Robin Lee was appointed CEO in 2010."],
    ["a later interruption and return", "Alex Smith was appointed CEO on January 1, 2010. He resigned in 2015 and was reappointed CEO on May 1, 2024."],
  ])("withholds %s", (_label, text) => {
    expect(read(`Information About Our Executive Officers ${text}`).filter(t => t.office === "ceo")).toEqual([]);
  });

  it("still reads an appointment that names the predecessor", () => {
    expect(read("Information About Our Executive Officers On 7 August 2025, Alex Smith succeeded Robin Lee as president and chief executive officer of the Company.")[0])
      .toMatchObject({ start: "2025-08-07" });
  });

  it("keeps the issuer's own name after the date", () => {
    expect(read("Information About Our Executive Officers Alex Smith has served as Chief Executive Officer since 2014 at Example Holdings.")[0]).toMatchObject({ start: "2014-12-31" });
  });

  it("reads a co-CEO date only for a roster co-CEO", () => {
    const text = "Information About Our Executive Officers Alex Smith has served as Co-Chief Executive Officer since 2014.";
    expect(read(text)).toEqual([]);
    expect(extractOfficerTenures(text, [{ name: "Alex S. Smith", title: "Co-Chief Executive Officer" }], filing)).toHaveLength(1);
  });

  it("binds a surname pronoun only inside a uniquely named officer biography", () => {
    expect(read("Information About Our Executive Officers Alex Smith. Mr. Smith has served as President and CEO since July 2021. Jane Doe. In February 2018 Ms. Doe was promoted to Executive Vice President and Chief Financial Officer.")).toEqual([
      expect.objectContaining({ office: "ceo", start: "2021-07-31" }), expect.objectContaining({ office: "cfo", start: "2018-02-28" }),
    ]);
  });

  it.each([
    ["another person", "Alec Smith became Chief Executive Officer in 2024."],
    ["different middle initial", "Alex T. Smith became Chief Executive Officer in 2024."],
    ["another office", "Alex Smith became Chief Financial Officer in 2024."],
    ["former officer", "Alex Smith served as Chief Executive Officer from 2010 until 2024."],
    ["former appointment", "Alex Smith was appointed CEO in 2010 and stepped down in 2024."],
    ["divisional CEO", "Alex Smith became Chief Executive Officer of Consumer Banking in 2024."],
    ["divisional comma", "Alex Smith became CEO, Consumer Banking in 2024."],
    ["divisional bare qualifier", "Alex Smith has served as CEO Cloud Services since 2024."],
    ["director biography", "Our directors Alex Smith has served as CEO of Another Corporation since 2010."],
    ["table of contents", "Table of Contents Alex Smith CEO since 2024 ........ 12"],
    ["future period", "Alex Smith will become Chief Executive Officer on March 1, 2026."],
    ["after filing date", "Alex Smith became Chief Executive Officer on March 1, 2026."],
    ["invalid date", "Alex Smith became Chief Executive Officer on February 30, 2024."],
    ["executive officer date", "Alex Smith 60 Chief Executive Officer. Executive Officer Since 2017."],
    ["director date", "Alex Smith Chief Executive Officer. Director since 2017."],
    ["join date", "Alex Smith joined the Company in 2017 and became Chief Executive Officer in 2024."],
  ])("fails closed for %s", (_kind, text) => {
    expect(read(`Information About Our Executive Officers ${text}`)).toEqual([]);
  });

  it("rejects incompatible dates but reconciles a precise day with the same stated year", () => {
    expect(read("Information About Our Executive Officers Alex Smith became CEO in 2024. Alex Smith was appointed CEO on April 24, 2023.")).toEqual([]);
    expect(read("Information About Our Executive Officers Alex Smith became CEO in 2024. Alex Smith was appointed CEO on April 24, 2024.")[0]).toMatchObject({ start: "2024-04-24", precision: "day" });
  });

  it("never binds a joining year from the next subject to a current title", () => {
    expect(read("Information About Our Executive Officers Alex Smith Chief Executive Officer (CEO) Mr Smith joined the Company in 1992 as a clerk.")).toEqual([]);
  });

  it("retains the current office date before the biography describes a former divisional role", () => {
    expect(read("Executive officers of the registrant Jane Doe 53 Chief Financial Officer since May 2021, prior to which she worked for the former Investment Bank.")[0]).toMatchObject({ office: "cfo", start: "2021-05-31" });
    expect(read("Information About Our Executive Officers Alex Smith. Mr. Smith has served as President and Chief Executive Officer since July 2021, CEO Cloud Services from April 2016 until July 2021.")[0]).toMatchObject({ office: "ceo", start: "2021-07-31" });
  });

  it("keeps an opening appointment date inside the retained quotation", () => {
    const text = "On 7 August 2025, Alex Smith succeeded Robin Lee as Chief Executive Officer of the Company.";
    expect(read(text)[0]?.quote).toBe(text);
    const retained = officerBiographiesText(parseDocument(`<p>${text}</p>`));
    expect(read(retained.text)[0]?.start).toBe("2025-08-07");
  });

  it("uses a unique table-listed surname biography without binding another officer's office", () => {
    expect(read("Information About Our Executive Officers Alex Smith 60 CEO Jane Doe 53 CFO Mr. Smith was appointed Chairman in June 2021 and Chief Executive Officer in February 2014.")[0]).toMatchObject({ office: "ceo", start: "2014-02-28" });
    expect(read("Information About Our Executive Officers Alex Smith introduced Robin Lee, who became CEO in 2024.")).toEqual([]);
    expect(read("Information About Our Executive Officers Alex Smith 60 CEO Jane Doe 53 CFO since May 2021.")).toEqual([expect.objectContaining({ office: "cfo", start: "2021-05-31" })]);
  });

  it("keeps quotations inside their source sentence and passage", () => {
    const quote = "Alex Smith was appointed CEO on April 24, 2024.";
    expect(read(quote + " (7.0) 46 15.0 Internal pay ratio.")[0]?.quote).toBe(quote);
    expect(read("Alex Smith CEO\n\nJane Doe CFO since May 2021.")).toEqual([expect.objectContaining({ office: "cfo" })]);
  });

  it("reads a year only when the table explicitly says the current office was held since then", () => {
    expect(read("Executive officers of the registrant Name Age Office Held Since Alex Smith 60 Chief Executive Officer 2017 Jane Doe 52 Chief Financial Officer 2023")).toEqual([
      expect.objectContaining({ office: "ceo", start: "2017-12-31" }), expect.objectContaining({ office: "cfo", start: "2023-12-31" }),
    ]);
    expect(read("Executive officers of the registrant Name Age Executive Officer Since Alex Smith 60 Chief Executive Officer 2017")).toEqual([]);
  });

  it("does not mistake a printed page's contents label for a contents entry", () => {
    expect(read("Information About Our Executive Officers 75 Table of Contents ALEX S. SMITH, age 60, has served as our Chief Executive Officer since March 2022.")[0]?.start).toBe("2022-03-31");
  });

  it("keeps the office date when a same-issuer board membership follows it", () => {
    expect(read("Executive officers of the registrant Alex Smith 60 President and Chief Executive Officer, and a member of the Board, since August 8, 2024.")[0]?.start).toBe("2024-08-08");
  });

  it("binds a coordinated board membership to the same officer without losing the office start", () => {
    const text = "Alex Smith, age 60, has served as President and Chief Executive Officer and as a member of the Board of Directors since June 2021.";
    expect(read(text)[0]).toMatchObject({ office: "ceo", start: "2021-06-30", quote: text });
    expect(read("Alex Smith has served as Chief Executive Officer and as a member of the Board of Another Corporation since June 2021.")).toEqual([]);
    expect(read("Alex Smith has served as Chief Executive Officer and Robin Lee as a member of the Board of Directors since June 2021.")).toEqual([]);
    expect(read("Alex Smith has served as Chief Executive Officer since June 2021 and as a member of the Board of Directors since May 2018.")[0]?.start).toBe("2021-06-30");
  });

  it("bounds retained sections and issuer appointment footnotes together", () => {
    const html = "<h2>Our Board of Management</h2>" + Array.from({ length: 2500 }, (_, i) => `<p>Footnote ${i}. Alex Smith was appointed CEO of the Company on April 24, 2024.</p>`).join("");
    expect(officerBiographiesText(parseDocument(html)).text.length).toBeLessThanOrEqual(120_000);
  });

  it("never reads a statement approval or signature date as the office start", () => {
    expect(read("The statements were approved by Alex Smith, President and Chief Executive Officer, on June 18, 2025.")).toEqual([]);
    expect(read("Alex Smith President and Chief Executive Officer on June 18, 2025.")).toEqual([]);
  });

  it("discloses incorporation when the proxy reference precedes incorporated herein by reference", () => {
    const text = "Item 10. Directors, Executive Officers and Corporate Governance The information required by this Item will be included in our definitive proxy statement, and is incorporated herein by reference.";
    expect(officerBiographiesText(parseDocument(text)).notes.join(" ")).toContain("proxy");
  });

  it("does not bind a surname shared with another named person outside the roster", () => {
    expect(read("Information About Our Executive Officers Alex Smith 60 CEO. Jordan Smith is a director. Mr. Smith became CEO in 2024.")).toEqual([]);
  });

  it("refuses a director biography without issuer-qualified appointment authority", () => {
    expect(read("Our directors Alex Smith has served as Chief Executive Officer since 2010.")).toEqual([]);
  });

  it("does not mistake the middle and family names inside the full named officer for a second person", () => {
    const rows = [{ name: "Alex Mason Smith", title: "CEO" }];
    expect(extractOfficerTenures("Information About Our Executive Officers Alex Mason Smith. Mr Smith became CEO in 2024.", rows, filing)[0]?.start).toBe("2024-12-31");
  });

  it("treats punctuation before an explicit effective date as punctuation", () => {
    expect(read("Information About Our Executive Officers Jane Doe was appointed Chief Financial Officer, effective November 2025.")[0]?.start).toBe("2025-11-30");
  });

  it("does not attach an ambiguous surname or initial-only person to a roster officer", () => {
    expect(extractOfficerTenures("Information About Our Executive Officers Alex Smith. Jordan Smith. Mr. Smith became CEO in 2024.", [...roster, { name: "Jordan Smith", title: "CEO" }], filing)).toEqual([]);
    expect(read("Information About Our Executive Officers A. Smith became CEO in 2024.")).toEqual([]);
  });

  it("retains bounded executive sections from the existing parsed annual and discloses proxy incorporation", () => {
    const parsed = parseDocument('<p>Contents</p><h2>Information About Our Executive Officers</h2><table><tr><td>Alex Smith</td><td>CEO since 2024</td></tr></table><h2>Item 1A. Risk Factors</h2><p>Risk text.</p>');
    const retained = officerBiographiesText(parsed);
    expect(retained.text).toContain("Alex Smith");
    expect(retained.text).not.toContain("Risk text");
    expect(officerBiographiesText(parseDocument('<h2>Item 10. Directors, Executive Officers and Corporate Governance</h2><p>Information is incorporated by reference to our proxy statement.</p>')).notes.join(" ")).toContain("proxy");
  });
});
