import { describe, expect, it } from "vitest";
import { parseAnnualGeography } from "@/edgar/annualGeography";

const identity = { cik: "1234567", filing: { form: "10-K", accessionNumber: "0001234567-26-000001", primaryDocument: "annual.htm", reportDate: "2025-09-28", filingDate: "2025-11-03" }, documentUrl: "https://www.sec.gov/Archives/edgar/data/1234567/000123456726000001/annual.htm", fetchedAt: "2025-11-04T00:00:00Z", cutoff: "2025-11-04" };
function fixture(): string {
  const dates = ["2025-09-28", "2024-09-29"];
  const ctx = (scope: string, member: string | null, i: number) => `<xbrli:context id="${scope}${i}"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">1234567</xbrli:identifier>${member ? `<xbrli:segment><xbrldi:explicitMember dimension="us-gaap:ConcentrationRiskByTypeAxis">us-gaap:GeographicConcentrationRiskMember</xbrldi:explicitMember><xbrldi:explicitMember dimension="us-gaap:ConcentrationRiskByBenchmarkAxis">us-gaap:RevenueFromContractWithCustomerMember</xbrldi:explicitMember><xbrldi:explicitMember dimension="srt:StatementGeographicalAxis">${member}</xbrldi:explicitMember></xbrli:segment>` : ""}</xbrli:entity><xbrli:period><xbrli:startDate>${i ? "2023-10-02" : "2024-09-30"}</xbrli:startDate><xbrli:endDate>${dates[i]}</xbrli:endDate></xbrli:period></xbrli:context>`;
  const fact = (v: number, ref: string) => `<ix:nonFraction contextRef="${ref}" unitRef="usd" name="us-gaap:Revenues" scale="6">${v}</ix:nonFraction>`;
  const row = (label: string, scope: string, amounts: number[], share: number) => `<tr><td>${label}</td>${amounts.map((v, i) => `<td>$ ${fact(v, scope + i)}</td><td>${share}%</td>`).join("")}</tr>`;
  return `<?xml version='1.0' encoding='ASCII'?><html><body><xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit>${dates.flatMap((_, i) => [ctx("c", null, i), ctx("u", "country:US", i), ctx("o", "ex:OtherForeignMember", i)]).join("")}
  <ix:nonNumeric contextRef="c0" name="us-gaap:RevenueFromExternalCustomersByGeographicAreasTableTextBlock"><p>We report revenues by country based on our customer's/licensee's headquarters. As a result, the revenues by country presented herein are not necessarily indicative of the country in which our products are ultimately sold to consumers. Revenues by country were as follows (in millions, except percentages):</p>
  <table><tr><td style="display:none"></td><td>2025</td><td></td><td>2024</td></tr>${row("United States", "u", [60, 54], 60)}${row("Other foreign", "o", [40, 36], 40)}${row("", "c", [100, 90], 100)}</table></ix:nonNumeric></body></html>`;
}
describe("tagged annual country revenues on a headquarters basis", () => {
  it("retains monetary amounts, exact fiscal ends and the full allocation caveat", () => {
    const result = parseAnnualGeography(fixture(), identity);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.data.periods).toEqual([{ end: "2025-09-28", values: { "United States": 60e6, "Other foreign": 40e6 }, total: 100e6 }, { end: "2024-09-29", values: { "United States": 54e6, "Other foreign": 36e6 }, total: 90e6 }]);
    expect(result.value.data.definition).toContain("not necessarily indicative");
    for (const span of result.value.data.spans) expect(fixture().slice(span.start, span.end)).toBe(span.html);
  });
  it("accepts whole-percent residual allocation while deriving shares from reconciled monetary amounts", () => {
    const html = fixture().replaceAll('60%', '59%').replaceAll('40%', '41%');
    expect(parseAnnualGeography(html, identity).ok).toBe(true);
  });
  it("refuses decimal-comma monetary facts rather than multiplying their amounts by a thousand", () => {
    const html = fixture().replaceAll('scale="6"', 'format="ixt:num-comma-decimal" scale="6"')
      .replace(/>(60|54|40|36|100|90)<\/ix:nonFraction>/g, '>$1,000</ix:nonFraction>');
    expect(parseAnnualGeography(html, identity).ok).toBe(false);
  });
  it.each(['xsi:nil="true"', 'xsi:nil="1"', 'xsi:nil="unknown"', 'format="ixt:fixed-zero"', 'format="custom:unknown"'])("refuses unsupported monetary fact semantics: %s", attributes => {
    expect(parseAnnualGeography(fixture().replaceAll('scale="6"', `${attributes} scale="6"`), identity).ok).toBe(false);
  });
  it.each(['format="ixt:num-dot-decimal"', 'format="ixt:numdotdecimal"', 'xsi:nil="false"', 'xsi:nil="0"'])("preserves supported numeric facts: %s", attributes => {
    const result = parseAnnualGeography(fixture().replaceAll('scale="6"', `${attributes} scale="6"`), identity);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.data.periods[0]?.total).toBe(100e6);
  });
  it.each(["unquoted", "spaced quoted"])("retains source identity for %s HTML attributes and unrelated boolean flags", mode => {
    const html = fixture().replace(/\b(id|contextRef|unitRef|name|scale|dimension)="([^"]+)"/g, mode === "unquoted" ? "$1=$2" : "$1 = '$2' ")
      .replaceAll("<ix:nonFraction ", "<ix:nonFraction compact ");
    const result = parseAnnualGeography(html, identity);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.data.periods[0]).toEqual({ end: "2025-09-28", values: { "United States": 60e6, "Other foreign": 40e6 }, total: 100e6 });
  });
  it.each([
    (scope: string) => `<table><tr><td>${scope}</td></tr></table>`,
    (scope: string) => `<ix:nonNumeric name="ex:ScopeTextBlock"><p>${scope}</p></ix:nonNumeric>`,
    (scope: string) => `<table><tr><td>(1)</td><td><ix:nonNumeric name="ex:ScopeTextBlock">${scope}</ix:nonNumeric></td></tr></table>`,
  ])("refuses referential restrictions through layout/tagged wrappers", wrap => {
    const restriction = wrap("The country amounts are limited to our Network division.");
    for (const adjacent of [restriction, `<table><tr><td>Footnotes</td></tr></table>${restriction}`]) {
      expect(parseAnnualGeography(fixture().replace("</ix:nonNumeric>", "</ix:nonNumeric>" + adjacent), identity).ok).toBe(false);
      expect(parseAnnualGeography(fixture().replace("<ix:nonNumeric", adjacent + "<ix:nonNumeric"), identity).ok).toBe(false);
    }
  });
  it("retains a preceding restriction across numeric footnote layout cells", () => {
    const footnote = `<p>These country figures exclude our Network division.</p><table><tr><td>2025 and 2024 assumptions</td><td><ix:nonFraction name="us-gaap:Revenues">10</ix:nonFraction></td><td><ix:nonFraction name="us-gaap:Revenues">9</ix:nonFraction></td></tr></table>`;
    expect(parseAnnualGeography(fixture().replace("<ix:nonNumeric", footnote + "<ix:nonNumeric"), identity).ok).toBe(false);
  });
  it("ends qualifications only at an independently introduced quantitative disclosure", () => {
    const next = `<p>The following table summarizes property and equipment:</p><table><tr><td>Years Ended (In millions)</td><td>2025</td><td>2024</td></tr><tr><td>Equipment</td><td><ix:nonFraction name="us-gaap:PropertyPlantAndEquipmentNet">40</ix:nonFraction></td><td><ix:nonFraction name="us-gaap:PropertyPlantAndEquipmentNet">30</ix:nonFraction></td></tr></table><p>These figures cover only our Network division.</p>`;
    expect(parseAnnualGeography(fixture().replace("</ix:nonNumeric>", "</ix:nonNumeric>" + next), identity).ok).toBe(true);
    expect(parseAnnualGeography(fixture().replace("</ix:nonNumeric>", "</ix:nonNumeric><p>These amounts exclude our Network division.</p>" + next), identity).ok).toBe(false);
  });
  it("recognizes a numbered independent note, but never a title or tagged prose alone", () => {
    const heading = `<div>Note 7. Acquisitions<ix:nonNumeric name="us-gaap:BusinessCombinationDisclosureTextBlock"></ix:nonNumeric></div>`;
    const facts = `<p>Consideration was <ix:nonFraction name="us-gaap:BusinessCombinationConsiderationTransferred1">12</ix:nonFraction> and cash was <ix:nonFraction name="us-gaap:PaymentsToAcquireBusinessesGross">8</ix:nonFraction>.</p>`;
    const restriction = `<p>These figures exclude our Network business.</p>`;
    const append = (value: string) => fixture().replace("</ix:nonNumeric>", "</ix:nonNumeric>" + value);
    expect(parseAnnualGeography(append(heading + facts + restriction), identity).ok).toBe(true);
    expect(parseAnnualGeography(append(heading + restriction), identity).ok).toBe(false);
    expect(parseAnnualGeography(append(heading.replace("us-gaap:", "ex:") + facts + restriction), identity).ok).toBe(false);
    expect(parseAnnualGeography(append(restriction + heading + facts), identity).ok).toBe(false);
  });
  it.each([
    ["revenue facts", "us-gaap:Revenues", "Years Ended (In millions)", "The following table summarizes revenue:"],
    ["unintroduced facts", "us-gaap:PropertyPlantAndEquipmentNet", "Years Ended (In millions)", "Additional information"],
    ["missing units", "us-gaap:PropertyPlantAndEquipmentNet", "Years Ended", "The following table summarizes property:"],
    ["one period", "us-gaap:PropertyPlantAndEquipmentNet", "Years Ended (In millions)", "The following table summarizes property:"],
  ])("does not sever a restriction at %s", (label, concept, title, introduction) => {
    const extra = `<p>${introduction}</p><table><tr><td>${title}</td><td>2025</td><td>${label === "one period" ? "2025" : "2024"}</td></tr><tr><td>Amounts</td><td><ix:nonFraction name="${concept}">40</ix:nonFraction></td><td><ix:nonFraction name="${concept}">30</ix:nonFraction></td></tr></table><p>These figures exclude the Components business.</p>`;
    expect(parseAnnualGeography(fixture().replace("</ix:nonNumeric>", "</ix:nonNumeric>" + extra), identity).ok).toBe(false);
  });
  it.each([
    ["business dimension", (h: string) => h.replaceAll("us-gaap:ConcentrationRiskByTypeAxis", "us-gaap:StatementBusinessSegmentsAxis")],
    ["lookalike context attribute", (h: string) => h.replaceAll('contextRef="u', 'data-contextRef="u')],
    ["lookalike dimension attribute", (h: string) => h.replaceAll(' dimension=', ' data-dimension=')],
    ["quoted context spoof", (h: string) => h.replaceAll(/contextRef="([^"]+)"/g, `data-note=' contextRef="$1"' contextRef="nonexistent"`)],
    ["duplicate context attributes", (h: string) => h.replaceAll(/contextRef="([^"]+)"/g, 'contextRef="$1" contextRef="nonexistent"')],
    ["missing unquoted attribute value", (h: string) => h.replaceAll('scale="6"', 'scale=')],
    ["unterminated quoted attribute", (h: string) => h.replaceAll('scale="6"', 'scale="6')],
    ["unseparated attribute names", (h: string) => h.replaceAll(' unitRef="usd"', 'unitRef="usd"')],
    ["invalid attribute name", (h: string) => h.replaceAll('scale="6"', '9invalid="x" scale="6"')],
    ["duplicate units", (h: string) => h.replace('</xbrli:unit>', '</xbrli:unit><xbrli:unit id="usd"><xbrli:measure>iso4217:EUR</xbrli:measure></xbrli:unit>')],
    ["outside population restriction", (h: string) => h.replace('<ix:nonNumeric', '<p>These figures exclude our Components business.</p><ix:nonNumeric')],
    ["outside population restriction across neutral prose", (h: string) => h.replace('<ix:nonNumeric', '<p>These figures exclude our Components business.</p><p>Further information follows.</p><ix:nonNumeric')],
    ["outside restriction in an adjacent tagged paragraph", (h: string) => h.replace('<ix:nonNumeric', '<ix:nonNumeric name="ex:ScopeTextBlock"><p>These figures exclude our Components business.</p></ix:nonNumeric><ix:nonNumeric')],
    ["outside restriction across a layout table", (h: string) => h.replace('<ix:nonNumeric', '<p>These figures exclude our Components business.</p><table><tr><td>Additional information</td></tr></table><ix:nonNumeric')],
    ["outside explicit country restriction", (h: string) => h.replace('<ix:nonNumeric', '<p>Country revenues exclude our Components business.</p><ix:nonNumeric')],
    ["following population restriction", (h: string) => h.replace('</ix:nonNumeric>', '</ix:nonNumeric><p>These figures exclude our Components business.</p>')],
    ["RPO concept", (h: string) => h.replaceAll('name="us-gaap:Revenues"', 'name="us-gaap:RevenueRemainingPerformanceObligation"')],
    ["foreign issuer", (h: string) => h.replaceAll(">1234567<", ">7654321<")],
    ["partial population", (h: string) => h.replace("We report revenues", "We report selected product revenues")],
    ["wrong country label", (h: string) => h.replace("United States", "Canada")],
    ["percentage mismatch", (h: string) => h.replace("60%", "10%")],
    ["inconsistent total", (h: string) => h.replace(">100</ix:nonFraction>", ">110</ix:nonFraction>")],
    ["unknown qualification", (h: string) => h.replace("<table>", "<p>This excludes our Components business.</p><table>")],
    ["duplicate table", (h: string) => h.replace("</body>", h + "</body>")],
    ["future period", (h: string) => h.replaceAll("2025-09-28", "2026-09-28")],
    ["hidden ancestor", (h: string) => h.replace('<ix:nonNumeric', '<div style="display:none"><ix:nonNumeric').replace('</ix:nonNumeric>', '</ix:nonNumeric></div>')],
  ] as const)("refuses %s", (_label, change) => expect(parseAnnualGeography(change(fixture()), identity).ok).toBe(false));
});
