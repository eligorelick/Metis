import { createHash } from "node:crypto";
import { htmlToText, stripHiddenBlocks } from "./extract";
import { explicitHtmlHiddenState } from "./htmlHidden";
import type { AnnualGeography } from "./annualGeography";
import type { EdgarFiling } from "@/providers/edgar";
import { geographyAttribute as attr, geographyRevenueConcept } from "./geographySource";

export interface CountryContext { start: string; end: string; member: string | null }
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** A wrapper alone never proves that an adjacent qualification belongs elsewhere. */
function followingDisclosureBoundary(html: string): number | null {
  const facts = (source: string) => [...source.matchAll(/<ix:nonFraction\b([^>]*)>/gi)]
    .map(fact => attr(fact[1]!, "name") ?? "");
  const independent = (names: string[]) => names.length >= 2 && names.every(name => /^us-gaap:/.test(name) && !/Revenue|SalesRevenue/i.test(name));
  for (const table of html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table\s*>/gi)) {
    const value = htmlToText(table[0]);
    if (!independent(facts(table[0])) || new Set(value.match(/\b20\d{2}\b/g)).size < 2 ||
      !/\b(?:Years? Ended|As of)\b/i.test(value) || !/\(In (?:thousands|millions|billions)\)/i.test(value)) continue;
    const introduction = [...html.slice(0, table.index).matchAll(/\bThe following table (?:presents|summarizes|shows)\b/gi)].at(-1);
    if (!introduction) continue;
    const prose = htmlToText(html.slice(introduction.index, table.index));
    if (/^The following table (?:presents|summarizes|shows) [^.!?]+[:.]?$/i.test(prose) && !/\brevenues?\b/i.test(prose)) return introduction.index;
  }
  // A numbered annual note with its own standard disclosure identity and
  // non-revenue quantitative facts is also a new population. Tagged prose
  // without that independent title and evidence remains in the country scope.
  for (const note of html.matchAll(/<(p|div|h[1-6])\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)) {
    if (!/^Note \d+\. [A-Za-z][A-Za-z ,&()-]{1,100}$/.test(htmlToText(note[2]!))) continue;
    const tag = /<ix:nonNumeric\b([^>]*)>/i.exec(note[2]!);
    if (!tag || !/^us-gaap:[A-Za-z]+DisclosureTextBlock$/.test(attr(tag[1]!, "name") ?? "")) continue;
    const next = html.slice(note.index + note[0].length);
    if (independent(facts(next).slice(0, 2))) return note.index;
  }
  return null;
}

/** Monetary country rows plus printed concentration percentages, never inferred
 * dollar values from a percent-only table. The enclosing tagged block supplies
 * a complete, narrowly supported headquarters allocation definition. */
export function countryGeographyTables(html: string, identity: { cik: string; filing: EdgarFiling; documentUrl: string; fetchedAt: string }, units: Map<string, string>, contexts: Map<string, CountryContext>): AnnualGeography[] {
  const candidates: AnnualGeography[] = [];
  if (explicitHtmlHiddenState(html.replace(/^<\?xml\s+[^?<>]*\?>\s*/i, "")) !== "clear") return candidates;
  const visible = stripHiddenBlocks(html);
  for (const block of html.matchAll(/<ix:nonNumeric\b([^>]*)>([\s\S]*?)<\/ix:nonNumeric>/gi)) {
    if (attr(block[1]!, "name") !== "us-gaap:RevenueFromExternalCustomersByGeographicAreasTableTextBlock" || block[0].length > 100_000) continue;
    const visibleBlock = stripHiddenBlocks(block[0]);
    if (!visibleBlock || !visible.includes(visibleBlock) || htmlToText(visibleBlock) !== htmlToText(block[0])) continue;
    const owner = contexts.get(attr(block[1]!, "contextRef") ?? "");
    if (!owner || owner.member !== null || owner.end !== identity.filing.reportDate) continue;
    // A tagged block cannot silently drop an adjacent population restriction.
    // A prior quantitative table ends the lookback; a separately established
    // disclosure ends the lookahead. Footnote/layout wrappers end neither.
    const before = html.slice(Math.max(0, block.index - 50_000), block.index);
    const previous = [...before.matchAll(/<table\b[^>]*>[\s\S]*?<\/table\s*>/gi)].filter(table =>
      [...table[0].matchAll(/<ix:nonFraction\b/gi)].length >= 2 && new Set(htmlToText(table[0]).match(/\b20\d{2}\b/g)).size >= 2 &&
      /\b(?:Years? Ended|As of)\b/i.test(htmlToText(table[0])) && /\(In (?:thousands|millions|billions)\)/i.test(htmlToText(table[0]))).at(-1);
    const priorProse = before.slice(previous ? previous.index + previous[0].length : 0);
    const after = html.slice(block.index + block[0].length, block.index + block[0].length + 50_000);
    const next = followingDisclosureBoundary(after);
    if (next === null && block.index + block[0].length + after.length < html.length) continue;
    const external = htmlToText(priorProse + " " + after.slice(0, next ?? after.length));
    if (/\b(?:these|those|this|the) (?:amounts|figures|data|table|disclosure)\b|\b(?:figures?|amounts?|data) (?:below|above)\b|\bselected operations\b/i.test(external) ||
      /\b(?:country|revenues?|figures?|table)\b[^.!?]{0,250}\b(?:exclud\w*|only|selected|except|partial|limited to)\b/i.test(external)) continue;
    const tables = [...block[2]!.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)];
    if (tables.length !== 1) continue;
    const table = tables[0]!;
    if (/<table\b/i.test(table[0].slice(6))) continue;
    const definition = htmlToText(block[2]!.slice(0, table.index));
    if (definition.length > 1800 || !/^We report revenues by country based on our customer[’']s\/licensee[’']s headquarters\. (?:As a result, the revenues by country presented herein are not necessarily indicative of the country in which [^.]{1,500} ultimately sold to consumers\. )?Revenues by country were as follows \(in (?:thousands|millions|billions), except percentages\):$/i.test(definition) || htmlToText(block[2]!.slice(table.index + table[0].length)) !== "") continue;
    const scale = /\(in billions,/i.test(definition) ? 1e9 : /\(in millions,/i.test(definition) ? 1e6 : 1e3;
    const rows = [...table[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].filter(row => htmlToText(row[1]!) !== "");
    if (rows.length < 4 || rows.length > 25) continue;
    const header = htmlToText(rows[0]![1]!);
    if (!/^20\d{2}(?: 20\d{2}){1,3}$/.test(header)) continue;
    const years = header.split(" ").map(Number);
    if (years.some((year, i) => i > 0 && years[i - 1]! - year !== 1)) continue;
    const periods = years.map(() => ({ end: "", values: {} as Record<string, number>, total: 0 }));
    const starts: string[] = [], members = new Set<string>();
    const percentages: { values: number[]; amounts: number[]; total: boolean }[] = [];
    let currency: string | undefined, totalSeen = false, valid = true;
    for (const row of rows.slice(1)) {
      const rowText = htmlToText(row[1]!);
      const numberStart = rowText.search(/\$|\d/);
      if (numberStart < 0 || totalSeen) { valid = false; break; }
      const label = rowText.slice(0, numberStart).trim();
      const total = label === "" || /^Total(?: revenues?)?$/i.test(label);
      if (label && !/^[A-Za-z][A-Za-z ,'’&()./-]{0,100}$/.test(label)) { valid = false; break; }
      const allFacts = [...row[1]!.matchAll(/<ix:nonFraction\b([^>]*)>([\s\S]*?)<\/ix:nonFraction>/gi)];
      const facts = allFacts.filter(f => geographyRevenueConcept(attr(f[1]!, "name")));
      if (facts.length !== years.length || allFacts.some(f => !facts.includes(f) && attr(f[1]!, "name") !== "us-gaap:ConcentrationRiskPercentage1")) { valid = false; break; }
      const numeric = rowText.slice(numberStart);
      const numbers = [...numeric.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map(m => Number(m[0].replace(/,/g, "")));
      if (numbers.length !== years.length * 2 || numeric.replace(/\d[\d,]*(?:\.\d+)?|\$|%|\s/g, "") !== "") { valid = false; break; }
      let rowMember: string | null = null;
      for (let i = 0; i < facts.length; i++) {
        const fact = facts[i]!, context = contexts.get(attr(fact[1]!, "contextRef") ?? ""), unit = units.get(attr(fact[1]!, "unitRef") ?? "");
        const amount = Number(htmlToText(fact[2]!).replace(/,/g, ""));
        if (!context || !unit || (currency !== undefined && currency !== unit) || Number(context.end.slice(0, 4)) !== years[i] ||
          (i === 0 && context.end !== identity.filing.reportDate) || (periods[i]!.end && periods[i]!.end !== context.end) ||
          (starts[i] && starts[i] !== context.start) || 10 ** Number(attr(fact[1]!, "scale")) !== scale || attr(fact[1]!, "sign") !== null ||
          !Number.isFinite(amount) || amount < 0 || amount !== numbers[i * 2] || numbers[i * 2 + 1]! < 0 || numbers[i * 2 + 1]! > 100) { valid = false; break; }
        if (total ? context.member !== null : context.member === null || (rowMember !== null && rowMember !== context.member) || (i === 0 && members.has(context.member)) || Object.hasOwn(periods[i]!.values, label)) { valid = false; break; }
        if (!total) {
          const member = context.member!;
          const iso = /^country:([A-Z]{2})$/.exec(member)?.[1];
          const memberLabel = iso ? new Intl.DisplayNames(["en"], { type: "region" }).of(iso) : member.split(":").at(-1)!.replace(/Member$/, "");
          if (!memberLabel || key(label.replace(/ \(including [A-Za-z ]+\)$/, "")) !== key(memberLabel)) { valid = false; break; }
          periods[i]!.values[label] = amount * scale;
        } else periods[i]!.total = amount * scale;
        rowMember = context.member; currency = unit; periods[i]!.end = context.end; starts[i] = context.start;
      }
      if (!valid) break;
      if (rowMember) members.add(rowMember);
      percentages.push({ values: years.map((_, i) => numbers[i * 2 + 1]!), amounts: years.map((_, i) => numbers[i * 2]!), total });
      totalSeen = total;
    }
    if (!valid || !currency || !totalSeen || members.size < 2 || periods.some(p => p.total <= 0 || Math.abs(Object.values(p.values).reduce((a, b) => a + b, 0) - p.total) > .01) ||
      // Issuers may allocate a whole-percent rounding residual across rows so
      // displayed percentages add to 100. Monetary rows remain authoritative.
      percentages.some(row => row.values.some((value, i) => Math.abs(value - row.amounts[i]! * scale / periods[i]!.total * 100) > 1.000001)) ||
      years.some((_, i) => Math.abs(percentages.filter(row => !row.total).reduce((sum, row) => sum + row.values[i]!, 0) - 100) > .01)) continue;
    candidates.push({ cik: identity.cik, accession: identity.filing.accessionNumber, form: "10-K", filingDate: identity.filing.filingDate, reportDate: identity.filing.reportDate, documentUrl: identity.documentUrl,
      fetchedAt: identity.fetchedAt, sha256: createHash("sha256").update(html).digest("hex"), currency, scale, definition, periods,
      spans: [{ start: block.index, end: block.index + block[0].length, html: block[0] }] });
  }
  return candidates;
}
