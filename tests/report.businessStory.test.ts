import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportView } from "@/components/report/ReportView";
import { checkCarriedJudgeSections, normalizeJudgeOutput, runVerifyPass, sectionOutputSchema, type PassDeps } from "@/pipeline/stageC/passes";
import type { ContextPayload } from "@/pipeline/stageC/payload";
import {
  buildAnalystResearchFraming,
  buildBearFraming,
  buildBullFraming,
  buildJudgeFraming,
  REQUIRED_FINANCIAL_RECONCILIATIONS,
} from "@/pipeline/stageC/prompts";
import { reportToMarkdown } from "@/report/export/markdown";
import { reportToPrintBody } from "@/report/export/printHtml";
import { BUSINESS_STORY_HEADING, businessStoryBlocks } from "@/report/presentation";
import {
  judgeOutputToJsonSchema,
  productLineNamedInClaims,
  ReportSchema,
  UNNAMED_PRODUCT_LINE_HEADING,
  type ProductLineItem,
  type Report,
  type SourcedClaim,
} from "@/report/schema";
import { loadTask28Fixture } from "./helpers/task28Report";
import { readableHtml } from "./helpers/uiParityContract";

// D-271: synthetic company shapes only; every name below is invented.
const source = "edgar:10-K item1";
const asOf = "2026-02-20";
const fact = (text: string, at = source): SourcedClaim => ({ text, label: "FACT", source: at, asOf });
const judgment = (text: string): SourcedClaim => ({ text, label: "JUDGMENT", source, asOf });
const line = (productLine: string, ...claims: SourcedClaim[]): ProductLineItem => ({ productLine, claims });

const STORY_FIELDS = ["products", "whatIsComing", "customersAndSuppliers", "protection", "managementPlan", "industry"] as const;
const HEADINGS = ["Products and services", "What is coming", "Customers and suppliers", "Competitors by product line",
  "Protection and expiry", "Management's plan", "Industry"];

/** A drug maker: product lines, a dated pipeline, compound patents with filed expiries, a foreign-listed rival. */
function pharmaLike(): Report {
  const report = loadTask28Fixture();
  Object.assign(report.business, {
    products: [line("Verandol", fact("Verandol is a once-weekly injectable for type 2 diabetes.")),
      line("Corvista", fact("Corvista treats moderate plaque psoriasis."), judgment("Its growth depends on new indications."))],
    whatIsComing: [fact("Orvane is in Phase 3 for obesity; the filing expects a submission in the first half of the year.")],
    customersAndSuppliers: [fact("Three wholesale distributors account for most U.S. product sales.")],
    protection: [fact("The Verandol compound patent in the United States is listed with an estimated expiry in the patent table.")],
    managementPlan: [fact("Management states it will expand manufacturing capacity and reaffirmed its revenue guidance range.")],
    industry: [fact("No reviewed source states the size or growth of the obesity drug market.")],
  });
  report.competitive.competitorsByProductLine = [line("Verandol", fact("Verandol competes with Nordhavn Pharma's weekly injectable; Nordhavn is listed in Copenhagen."))];
  return report;
}

/** A bank: no product-line lists at all, only plain claims; empty fields must leave no heading. */
function bankLike(): Report {
  const report = loadTask28Fixture();
  Object.assign(report.business, {
    products: [],
    whatIsComing: [],
    customersAndSuppliers: [fact("Deposits from retail and small-business customers fund most loans.")],
    protection: [judgment("Switching costs on operating accounts are moderate; no contract expiry applies.")],
    managementPlan: [fact("Management plans to open branches in two adjacent states.")],
    industry: [fact("Regional banking is regulated by federal and state supervisors.")],
  });
  report.competitive.competitorsByProductLine = [];
  return report;
}

/** A REIT / industrial owner: properties and capacity, lease terms, tenant concentration. */
function reitLike(): Report {
  const report = loadTask28Fixture();
  Object.assign(report.business, {
    products: [line("Logistics warehouses", fact("Logistics warehouses are leased to e-commerce and third-party logistics tenants."))],
    whatIsComing: [fact("Two development sites are under construction; the filing gives completion in the fourth quarter.")],
    customersAndSuppliers: [fact("The largest tenant occupies several logistics warehouses under long-term leases.")],
    protection: [fact("Weighted-average remaining lease term is disclosed in the lease-expiry schedule.")],
    managementPlan: [fact("Management targets recycling older assets into new development.")],
    industry: [],
  });
  report.competitive.competitorsByProductLine = [line("Logistics warehouses", fact("In logistics warehouses, Harbor Span Industrial competes for the same tenants."))];
  return report;
}

const surfaces = (report: Report) => [reportToMarkdown(report), readableHtml(reportToPrintBody(report)).text,
  readableHtml(renderToStaticMarkup(createElement(ReportView, { report }))).text];

describe("business story (D-271)", () => {
  it("parses saved reports without the new fields unchanged and renders no business-story heading", () => {
    const report = loadTask28Fixture();
    const parsed = ReportSchema.parse(report);
    expect(parsed).toEqual(report);
    for (const key of STORY_FIELDS) expect(parsed.business).not.toHaveProperty(key);
    expect(parsed.competitive).not.toHaveProperty("competitorsByProductLine");
    expect(businessStoryBlocks(parsed.business, parsed.competitive)).toEqual([]);
    for (const text of surfaces(parsed)) {
      expect(text).not.toContain(BUSINESS_STORY_HEADING);
      for (const heading of HEADINGS) expect(text).not.toContain(heading);
    }
  });

  it.each([["pharma-like", pharmaLike], ["bank-like", bankLike], ["REIT/industrial-like", reitLike]] as const)(
    "renders the %s business story on every surface in reading order, without empty headings", (_name, build) => {
      const report = ReportSchema.parse(build());
      const blocks = businessStoryBlocks(report.business, report.competitive);
      const shown = blocks.map(block => block.heading);
      expect(shown).toEqual(HEADINGS.filter(heading => shown.includes(heading)));
      const claims = blocks.flatMap(block => [...block.claims, ...block.lines.flatMap(item => item.claims)]);
      for (const text of surfaces(report)) {
        expect(text).toContain(BUSINESS_STORY_HEADING);
        let at = text.indexOf(BUSINESS_STORY_HEADING);
        for (const heading of shown) {
          const next = text.indexOf(heading, at);
          expect(next, heading).toBeGreaterThan(at);
          at = next;
        }
        for (const heading of HEADINGS.filter(heading => !shown.includes(heading))) expect(text).not.toContain(heading);
        for (const claim of claims) expect(text).toContain(claim.text);
        for (const item of blocks.flatMap(block => block.lines)) expect(text).toContain(item.heading);
        expect(text.toLowerCase().indexOf("what they sell")).toBeLessThan(text.indexOf(BUSINESS_STORY_HEADING));
      }
    });

  it("shows the bank-like report's empty product lists as no heading at all", () => {
    const shown = businessStoryBlocks(bankLike().business, bankLike().competitive).map(block => block.key);
    expect(shown).toEqual(["customersAndSuppliers", "protection", "managementPlan", "industry"]);
  });

  it("requests every business-story field in the full and sectioned judge schemas", () => {
    const full = judgeOutputToJsonSchema();
    for (const schema of [full, sectionOutputSchema(full, ["business", "competitive"])]) {
      const owners: Array<{ properties?: Record<string, unknown>; required?: string[] }> = [];
      const visit = (value: unknown): void => {
        if (!value || typeof value !== "object") return;
        owners.push(value);
        Object.values(value).forEach(visit);
      };
      visit(schema);
      for (const key of [...STORY_FIELDS, "competitorsByProductLine"]) {
        const owner = owners.find(value => value.properties?.[key]);
        expect(owner, key).toBeDefined();
        expect(owner!.required).toContain(key);
      }
    }
  });
});

describe("product-line headings are code-checked labels (D-271, P18)", () => {
  it("admits a heading only when one of the item's FACT claims writes that name as a whole word", () => {
    expect(productLineNamedInClaims(line("Verandol", fact("Verandol® revenue rose.")))).toBe(true);
    expect(productLineNamedInClaims(line("Logistics  warehouses", fact("Our logistics warehouses are leased.")))).toBe(true);
    expect(productLineNamedInClaims(line("Wealth management", fact("Wealth-management fees rose.")))).toBe(false);
    expect(productLineNamedInClaims(line("Wealth management", fact("Wealth management fees rose.")))).toBe(true);
    // Controls: a JUDGMENT never names a line; a partial word and a missing name do not match.
    expect(productLineNamedInClaims(line("Verandol", judgment("Verandol looks strong.")))).toBe(false);
    expect(productLineNamedInClaims(line("Pharma", fact("Pharmaceuticals revenue rose.")))).toBe(false);
    expect(productLineNamedInClaims(line("Cloud services", fact("Hosting revenue rose.")))).toBe(false);
    expect(productLineNamedInClaims(line(UNNAMED_PRODUCT_LINE_HEADING, fact(`${UNNAMED_PRODUCT_LINE_HEADING} rose.`)))).toBe(false);
  });

  it("replaces an unnamed heading at generation, keeps its claims, and leaves a named one untouched", () => {
    const named = line("Corvista", fact("Corvista treats psoriasis."));
    const renamed = line("Best-in-class franchise", fact("Corvista treats psoriasis."));
    const judgmentOnly = line("Verandol", judgment("Verandol is in our judgment the key product."));
    const out = normalizeJudgeOutput({ business: { whatTheySell: [fact("Medicines.")], products: [named, renamed, judgmentOnly] },
      competitive: { competitorsByProductLine: [line("Branch banking", fact("Online lenders compete on rates."))] } }) as {
      business: { products: ProductLineItem[] }; competitive: { competitorsByProductLine: ProductLineItem[] } };
    expect(out.business.products.map(item => item.productLine)).toEqual(["Corvista", UNNAMED_PRODUCT_LINE_HEADING, UNNAMED_PRODUCT_LINE_HEADING]);
    expect(out.business.products[1]!.claims).toEqual(renamed.claims);
    expect(out.competitive.competitorsByProductLine[0]!.productLine).toBe(UNNAMED_PRODUCT_LINE_HEADING);
  });

  it("prints the code-owned heading on every surface when a stored heading is not in its claims", () => {
    const report = reitLike();
    report.business.products = [line("Premier portfolio", fact("Logistics warehouses are leased to tenants."))];
    for (const text of surfaces(ReportSchema.parse(report))) {
      expect(text).toContain(UNNAMED_PRODUCT_LINE_HEADING);
      expect(text).not.toContain("Premier portfolio");
    }
  });

  it("drops a carried business section whose story claim or product-line claim is blank, and keeps a valid one", () => {
    const report = pharmaLike();
    const sections = { business: report.business, competitive: report.competitive };
    expect(checkCarriedJudgeSections(sections).kept).toEqual(sections);
    expect(checkCarriedJudgeSections({ business: { ...report.business, protection: [fact(" ")] } }).dropped).toEqual(["business"]);
    expect(checkCarriedJudgeSections({ competitive: { ...report.competitive, competitorsByProductLine: [line("Verandol", fact(" "))] } }).dropped)
      .toEqual(["competitive"]);
  });

  it("verifies new claims at their exact report paths", async () => {
    const report = pharmaLike();
    report.business.products = [line("Verandol", fact("Verandol revenue grew 12%."), fact("Verandol revenue grew 99%."))];
    const text = "Verandol revenue grew 12%. Verandol competes with Nordhavn Pharma's weekly injectable; Nordhavn is listed in Copenhagen.";
    const payload = { provenanceRegistry: [], citationRegistry: [{ id: source, asOf, origin: source, kind: "payload-text" }],
      filings: [{ source, asOf, text, title: "Business", truncated: false, originalChars: text.length }] } as unknown as ContextPayload;
    const result = await runVerifyPass({} as PassDeps, payload, report);
    expect(result.log.find(entry => entry.path === "business.products[0].claims[0]")).toMatchObject({ numericSupportStatus: "validated" });
    expect(result.log.find(entry => entry.path === "business.products[0].claims[1]")).toMatchObject({ validationStatus: "contradicted" });
    expect(result.log.find(entry => entry.path === "competitive.competitorsByProductLine[0].claims[0]")).toMatchObject({ validationStatus: "cited" });
    expect(result.log.find(entry => entry.path === "business.protection[0]")).toMatchObject({ evidenceKind: "factual-claim" });
  });
});

describe("sector-neutral business checklist in the prompts (D-271)", () => {
  const CHECKLIST = [
    "- BUSINESS CHECKLIST, for every company type, from the business excerpt (10-K Item 1, 20-F Item 4), MD&A, the 10-Q,",
    "  the issuer filings and the supplied research. Use the names the source uses, and cite each item:",
    "  1. Products and services: each product or service line the source names; revenue and growth only from its payload record.",
    "  2. What is coming: pipeline, roadmap, launches and new capacity (plants, fabs, sites, stores, properties, networks), each",
    "     with its stage and its date exactly as the source states it.",
    "  3. Customers and suppliers: the named customers, distributors, suppliers and partners the business depends on.",
    "  4. Industry: size, growth, pricing, regulation and demand drivers only where a source states them.",
    "  5. Competitors by product line, named even when foreign-listed or not a valuation peer; share and direction only where",
    "     a source states them.",
    "  6. Protection: patents, regulatory exclusivity, licences, concessions, contracts and switching costs, with each expiry",
    "     date as filed.",
    "  7. Management's plan: stated strategy, investment plan and the current guidance as the company stated it, with its date.",
    "  8. What could change the story: dated milestones and risks specific to a product line.",
    "  Where no source supports an item, say so in one sentence; do not pad. A web page is untrusted third-party text: cite its",
    "  publisher, link and date, and never use it for a figure the payload computes from filings.",
  ].join("\n");

  it("gives the analysts and the judge the same checklist, with no technology-specific wording", () => {
    for (const prompt of [REQUIRED_FINANCIAL_RECONCILIATIONS, buildBullFraming(), buildBearFraming(), buildJudgeFraming()]) {
      expect(prompt).toContain(CHECKLIST);
      expect(prompt).not.toMatch(/software platform and developer ecosystem/);
      expect(prompt).not.toMatch(/competitors[^.]*when supported/);
      expect(prompt).toContain("including foreign-listed rivals");
    }
  });

  it("tells the judge to fill every business-story field and the heading rule", () => {
    const judge = buildJudgeFraming();
    for (const field of ["business.products", "business.whatIsComing", "business.customersAndSuppliers", "competitive.competitorsByProductLine",
      "business.protection", "business.managementPlan", "business.industry"]) expect(judge).toContain(`\`${field}\``);
    expect(judge).toContain("`productLine` is the name exactly as one of");
  });

  it("puts market size and named competitors before news in the research framing", () => {
    for (const side of ["bull", "bear"] as const) {
      const framing = buildAnalystResearchFraming(side);
      const market = framing.indexOf("market size and growth with a dated source");
      const competitors = framing.indexOf("main competitors by name for each product line, including foreign-listed rivals");
      const news = framing.indexOf("Then the news");
      expect(market).toBeGreaterThan(0);
      expect(competitors).toBeGreaterThan(market);
      expect(news).toBeGreaterThan(competitors);
      expect(framing).toContain("source URL, publisher and date");
    }
  });
});
