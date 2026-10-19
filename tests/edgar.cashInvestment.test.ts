import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePrimaryCashInvestment } from "@/edgar/cashInvestment";

const html = readFileSync("tests/fixtures/iren-source-scope/iren-20260630-cash.html", "utf8");
const identity = { issuerId: "1878848", form: "10-K", accession: "0001878848-26-000052", filingDate: "2026-08-27", reportDate: "2026-06-30", primaryDocument: "iren-20260630.htm", documentUrl: "https://www.sec.gov/Archives/edgar/data/1878848/000187884826000052/iren-20260630.htm" };
const parse = (body = html, id = identity) => parsePrimaryCashInvestment(body, id, "2026-10-19");
describe("primary cash investment scope", () => {
  it("resolves the separate gross cash PPE and hardware components from same-issuer USD consolidated context", () => {
    expect(parse().periods.find(p => p.end === "2026-06-30")).toMatchObject({ start: "2025-07-01", currency: "USD", status: "established", capex: -4_333_087_000, operatingCashFlow: 2_100_418_000, components: [{ qname: "us-gaap:PaymentsToAcquirePropertyPlantAndEquipment", value: 2_998_006_000 }, { qname: "iren:PaymentsRelatedToComputerHardware", value: 1_335_081_000 }] });
  });
  it("retains the source period rather than manufacturing a quarter from nine-month hardware", () => {
    const q = readFileSync("tests/fixtures/iren-source-scope/iren-20260331-cash.html", "utf8");
    const id = { ...identity, form: "10-Q", accession: "0001878848-26-000026", filingDate: "2026-05-08", primaryDocument: "iren-20260331.htm", documentUrl: "https://www.sec.gov/Archives/edgar/data/1878848/000187884826000026/iren-20260331.htm" };
    const p = parse(q, id).periods.find(p => p.end === "2026-03-31");
    expect(p?.start).toBe("2025-07-01");
    expect(p?.components[1]?.value).toBe(685_777_000);
  });
  it.each([
    ["issuer", (s: string) => s.replaceAll(">0001878848<", ">0000000001<")],
    ["dimension", (s: string) => s.replace('<xbrli:entity>', '<xbrli:entity><xbrli:segment><xbrldi:explicitMember dimension="us-gaap:StatementBusinessSegmentsAxis">iren:CloudMember</xbrldi:explicitMember></xbrli:segment>')],
    ["unit", (s: string) => s.replaceAll("iso4217:USD", "iso4217:EUR")],
    ["lookalike namespace", (s: string) => s.replace('xmlns:iren="http://www.iren.com/20260630"', 'xmlns:iren="https://unrelated.invalid/20260630"')],
    ["namespace reassignment", (s: string) => s.replace('name="iren:PaymentsRelatedToComputerHardware"', 'xmlns:iren="https://unrelated.invalid/20260630" name="iren:PaymentsRelatedToComputerHardware"')],
    ["invalid scale", (s: string) => s.replaceAll('scale="3"', 'scale="300"')],
    ["duplicate context collision", (s: string) => s.replace('</body>', '<xbrli:context id="c-1"><xbrli:period><xbrli:instant>2026-06-30</xbrli:instant></xbrli:period></xbrli:context></body>')],
  ])("rejects %s without admitting a numerical capex", (_, mutate) => {
    expect(parse(mutate(html)).periods.some(p => p.end === "2026-06-30" && p.status === "established")).toBe(false);
  });
  it("does not add hardware when the PPE line is already inclusive or its definition is unknown", () => {
    expect(parse(html.replaceAll('net of computer hardware', 'including computer hardware')).periods.find(p => p.end === "2026-06-30")).toMatchObject({ status: "withheld", capex: null });
  });
  it("refuses the partial component when the separate hardware fact is missing", () => {
    expect(parse(html.replaceAll('name="iren:PaymentsRelatedToComputerHardware"', 'name="iren:NonCashHardwareAdditions"')).periods.find(p => p.end === "2026-06-30")).toMatchObject({ status: "withheld", capex: null });
  });
  it("binds accession, primary document and issuer in the source URL", () => {
    expect(parse(html, { ...identity, accession: "0001878848-26-999999" }).periods).toEqual([]);
    expect(parse(html, { ...identity, issuerId: "1" }).periods).toEqual([]);
  });
});
