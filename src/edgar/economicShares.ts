import { createHash } from "node:crypto";
import { decodeEntities, htmlToText, type ParsedDocument } from "@/edgar/extract";
import type { EconomicShareEvidence } from "@/pipeline/stageB/securityBasis";

export interface FilingEconomicShares {
  source: { form: string; accession: string; filingDate: string; documentUrl: string; hash: string };
  classes: { classId: string; label: string; shares: number | null; asOf: string; sourceId: string }[];
  evidence: EconomicShareEvidence | null;
  reason: string;
  passages: { inventory: string; rights: string | null };
}
interface FilingIdentity { issuerId: string; securityId: string; form: string; accession: string; filingDate: string; documentUrl: string; primaryDocument: string }
const attr = (tag: string, key: string): string => decodeEntities(new RegExp(`\\b${key}\\s*=\\s*["']([^"']*)["']`, "i").exec(tag)?.[1] ?? "");
const classLabels = (text: string): string[] => [...text.toLowerCase().matchAll(/\b(?:class\s+[a-z0-9]{1,8}\s+)?(?:common\s+(?:stock|shares)|ordinary\s+shares)\b/g)]
  .map(match => match[0].replace(/\s+/g, " ").replace(/common shares$/, "common stock"));
const classLabel = (text: string): string | null => { const labels = classLabels(text); return labels.length === 1 ? labels[0] : null; };
const validDay = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

/** Deliberately narrow cover inventory parser. No class-name-to-economic-rights inference. */
export function parsePrimaryEconomicShares(html: string, identity: FilingIdentity, cutoff: string, parsed?: ParsedDocument): FilingEconomicShares {
  const source = { form: identity.form, accession: identity.accession, filingDate: identity.filingDate, documentUrl: identity.documentUrl,
    hash: createHash("sha256").update(html).digest("hex") };
  const result: FilingEconomicShares = { source, classes: [], evidence: null, reason: "No eligible complete inline cover-share inventory", passages: { inventory: "", rights: null } };
  if (!/^(?:10-K|10-Q)(?:\/A)?$/.test(identity.form) || !validDay(identity.filingDate) || !validDay(cutoff) || identity.filingDate > cutoff || !/^\d+$/.test(identity.issuerId) || !identity.securityId || !identity.documentUrl) return result;
  try {
    const url = new URL(identity.documentUrl);
    const expectedPath = `/Archives/edgar/data/${Number(identity.issuerId)}/${identity.accession.replaceAll("-", "")}/${identity.primaryDocument}`;
    if (url.protocol !== "https:" || !["www.sec.gov", "sec.gov"].includes(url.hostname) || url.port || url.username || url.password || url.search || url.hash ||
      !/^\d{10}-\d{2}-\d{6}$/.test(identity.accession) || !/^[a-zA-Z0-9_.-]+\.html?$/.test(identity.primaryDocument) || url.pathname !== expectedPath) {
      result.reason = "Primary source URL is not bound to SEC Archives issuer, accession and primary document"; return result;
    }
  } catch { result.reason = "Invalid primary source URL"; return result; }
  const issuerContexts = new Set<string>();
  const issuerInstantDates = new Map<string, string>();
  const contexts = new Map<string, { date: string; member: string }>();
  for (const match of html.matchAll(/<xbrli:context\b([^>]*)>([\s\S]*?)<\/xbrli:context>/gi)) {
    const body = match[2];
    const issuer = /<xbrli:identifier\b[^>]*scheme=["']http:\/\/www\.sec\.gov\/CIK["'][^>]*>(\d+)<\/xbrli:identifier>/i.exec(body)?.[1];
    if (issuer && Number(issuer) === Number(identity.issuerId)) issuerContexts.add(attr(match[1], "id"));
    const date = /<xbrli:instant>\s*([^<]+)\s*<\/xbrli:instant>/i.exec(body)?.[1];
    if (issuer && Number(issuer) === Number(identity.issuerId) && date && validDay(date)) issuerInstantDates.set(attr(match[1], "id"), date);
    const members = [...body.matchAll(/<xbrldi:explicitMember\b([^>]*)>([^<]+)<\/xbrldi:explicitMember>/gi)];
    if (issuer && Number(issuer) === Number(identity.issuerId) && date && validDay(date) && !/<xbrldi:typedMember/i.test(body) &&
      members.length <= 1 && members.every(member => attr(member[1], "dimension") === "us-gaap:StatementClassOfStockAxis")) {
      contexts.set(attr(match[1], "id"), { date, member: members[0]?.[2] ?? "unsegmented-common" });
    }
  }
  const shareUnits = new Set([...html.matchAll(/<xbrli:unit\b([^>]*)>([\s\S]*?)<\/xbrli:unit>/gi)]
    .filter(match => /^\s*<xbrli:measure>\s*xbrli:shares\s*<\/xbrli:measure>\s*$/i.test(match[2])).map(match => attr(match[1], "id")));
  // Binding to the registered quote class uses the filing's own title/symbol row.
  const tables = [...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)];
  const quotedLabels = new Set<string>();
  const registeredLabels = new Set<string>();
  for (const table of tables) for (const row of table[0].matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)) {
    const facts = [...row[0].matchAll(/<ix:nonNumeric\b([^>]*)>([\s\S]*?)<\/ix:nonNumeric>/gi)];
    const symbol = facts.find(fact => attr(fact[1], "name") === "dei:TradingSymbol" && !!htmlToText(fact[2]).trim());
    const title = symbol && facts.find(fact => attr(fact[1], "name") === "dei:Security12bTitle" && attr(fact[1], "contextRef") === attr(symbol[1], "contextRef"));
    const label = title && classLabel(htmlToText(title[2]));
    if (label && issuerContexts.has(attr(title![1], "contextRef"))) {
      registeredLabels.add(label);
      if (htmlToText(symbol![2]).trim().toUpperCase() === identity.securityId.toUpperCase()) quotedLabels.add(label);
    }
  }
  if (quotedLabels.size !== 1) { result.reason = "Quoted common class cannot be uniquely bound to the filing trading symbol"; return result; }
  const quotedLabel = [...quotedLabels][0];
  for (const table of tables) {
    if (!/name\s*=\s*["']dei:EntityCommonStockSharesOutstanding["']/i.test(table[0])) continue;
    const before = htmlToText(html.slice(Math.max(0, table.index! - 6000), table.index));
    const caption = /As of ([A-Za-z]+\s+\d{1,2},?\s+\d{4}),?\s+the following shares of the registrant['\u2019]s (?:common\s+(?:stock|shares)|ordinary\s+shares) were outstanding:\s*$/i.exec(before);
    const tableHeader = htmlToText(table[0].slice(0, table[0].indexOf("<ix:nonFraction")));
    const datedHeader = /^Class\s+Outstanding Shares at ([A-Za-z]+\s+\d{1,2},?\s+\d{4})\s+were(?: approximately)?,/i.exec(tableHeader);
    if (!caption && !datedHeader) continue;
    const stamp = Date.parse(`${(caption ?? datedHeader)![1]} UTC`);
    const inventoryDay = Number.isFinite(stamp) ? new Date(stamp).toISOString().slice(0, 10) : "";
    if (!validDay(inventoryDay) || inventoryDay > identity.filingDate) continue;
    result.passages.inventory = `${caption?.[0] ?? ""} ${htmlToText(table[0])}`.slice(0, 2500);
    const classes: FilingEconomicShares["classes"] = [];
    let invalid = false;
    // Adjacent tables with no intervening text can be one visually continuous
    // cover enumeration. Retain their class rows even if only some are tagged.
    let inventoryHtml = table[0];
    let inventoryEnd = table.index! + table[0].length;
    for (const next of tables.filter(next => next.index! > table.index!)) {
      if (htmlToText(html.slice(inventoryEnd, next.index)) || !classLabels(htmlToText(next[0])).length) break;
      inventoryHtml += next[0]; inventoryEnd = next.index! + next[0].length;
    }
    for (const row of inventoryHtml.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)) {
      const facts = [...row[0].matchAll(/<ix:nonFraction\b([^>]*)>([\s\S]*?)<\/ix:nonFraction>/gi)];
      const counts = facts.filter(fact => attr(fact[1], "name") === "dei:EntityCommonStockSharesOutstanding");
      if (!counts.length) {
        for (const label of classLabels(htmlToText(row[0]))) {
          invalid = true;
          if (!classes.some(cls => cls.label === label)) classes.push({ classId: `unresolved:${label}`, label, shares: null, asOf: inventoryDay, sourceId: identity.documentUrl });
        }
        continue;
      }
      const fact = counts[0];
      const context = contexts.get(attr(fact[1], "contextRef"));
      const label = classLabel(htmlToText(row[0]));
      const literal = htmlToText(fact[2]);
      const shares = /^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(literal) ? Number(literal.replaceAll(",", "")) : NaN;
      if (counts.length !== 1 || facts.length !== 1 || !context || context.date !== inventoryDay || !label || !shareUnits.has(attr(fact[1], "unitRef")) ||
        !["", "0"].includes(attr(fact[1], "scale")) || attr(fact[1], "sign") || attr(fact[1], "xsi:nil") || !Number.isSafeInteger(shares) || shares < 0 ||
        classes.some(cls => cls.label === label || cls.classId === context.member)) { invalid = true; continue; }
      classes.push({ classId: context.member, label, shares, asOf: inventoryDay,
        sourceId: `${identity.documentUrl}#${attr(fact[1], "id") || attr(fact[1], "contextRef")}` });
    }
    // A second cover table or unsupported context cannot disappear from a
    // claim that the first table enumerates every outstanding common class.
    const allCounts = [...html.matchAll(/<ix:nonFraction\b([^>]*)>([\s\S]*?)<\/ix:nonFraction>/gi)]
      .filter(fact => attr(fact[1], "name") === "dei:EntityCommonStockSharesOutstanding" && issuerInstantDates.get(attr(fact[1], "contextRef")) === inventoryDay);
    if (allCounts.length !== classes.length || allCounts.some(fact => !table[0].includes(fact[0]))) {
      invalid = true;
      for (const fact of allCounts) {
        const member = contexts.get(attr(fact[1], "contextRef"))?.member ?? attr(fact[1], "contextRef");
        if (!classes.some(cls => cls.classId === member)) classes.push({ classId: member, label: "additional unresolved outstanding common class",
          shares: Number(htmlToText(fact[2]).replaceAll(",", "")), asOf: inventoryDay, sourceId: `${identity.documentUrl}#${attr(fact[1], "id") || attr(fact[1], "contextRef")}` });
      }
    }
    result.classes = classes;
    if (invalid || !classes.length || classes.filter(cls => cls.label === quotedLabel).length !== 1) { result.reason = "Cover inventory has ambiguous, invalid or unaccounted common-class rows"; return result; }
    // Both distribution modes and exactly the enumerated classes must be explicit
    // in one bounded sentence. Equal EPS or conversion rights alone are insufficient.
    // Preserve row/paragraph boundaries: a financial table's class heading
    // must not attach to an unrelated dividend cash-flow row. Layout-table
    // rights assertions remain visible rather than disappearing wholesale.
    const rightsHtml = (parsed?.pre ?? html).replace(/<ix:header\b[\s\S]*?<\/ix:header>/gi, "")
      .replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, table => `${htmlToText(table.replace(/<\/tr>/gi, ". "))}. `)
      .replace(/<\/(?:p|div)>/gi, ". ");
    const text = htmlToText(rightsHtml);
    const sentences = text.split(/[.!?]\s+/);
    const supportedCurrentEquality = (sentence: string): boolean => sentence.length <= 1600 &&
      /\bequal\s+per[- ]share\s+distributions\s+(?:whether\s+)?through\s+dividends?\s+(?:or|and)\s+(?:in\s+)?liquidation\b/i.test(sentence) &&
      /\breceive\b|\bare\s+(?:legally\s+)?entitled\b/i.test(sentence) &&
      !/[;:]|\b(?:no|not|unequal|except|unless|without|denied|if|would|will|may|might|could|should|proposed|proposal|amendment|approval|approved|subject|upon|provided|contingent|conditional|future|prior|previous|previously|former|formerly|historical|historically|received|were|had|before|until)\b/i.test(sentence) &&
      // This bounded prose parser establishes only unqualified present rights.
      // Dated/relative applicability requires independent typed interval proof;
      // neither the filing date nor the inventory day supplies that interval.
      !/\b\d{4}\b|\b(?:effective|beginning|starting|commencing|from|next|following|after|when)\b|\bas\s+of\b/i.test(sentence) &&
      /\b(?:holders|entitled)\b/i.test(sentence) &&
      (() => { const labels = new Set(classLabels(sentence)); return labels.size === classes.length && classes.every(cls => labels.has(cls.label)); })();
    // Every additional-class economic assertion must be supported. An unknown
    // assertion can conflict with equality regardless of its ratio wording.
    const economicAssertions = sentences.filter(sentence => /\b(?:distributions?|dividends?|liquidation)\b/i.test(sentence) &&
      classLabels(sentence).some(label => label !== quotedLabel && classes.some(cls => cls.label === label)));
    const unsupportedRights = economicAssertions.some(sentence => !supportedCurrentEquality(sentence));
    const rights = !unsupportedRights ? sentences.find(supportedCurrentEquality) : undefined;
    result.passages.rights = rights ?? null;
    if (classes.length > 1 && !rights) { result.reason = "Outstanding common classes retained; equivalent dividend and liquidation economics are not established"; return result; }
    result.evidence = { issuerId: identity.issuerId, securityId: identity.securityId, asOf: inventoryDay, filed: identity.filingDate,
      effectiveFrom: identity.filingDate, effectiveTo: null, complete: true, sourceHash: source.hash,
      sourceIds: [...classes.map(cls => cls.sourceId), ...(rights ? [identity.documentUrl] : [])],
      classes: classes.map(cls => ({ classId: cls.label === quotedLabel ? identity.securityId : cls.classId,
        shares: cls.shares!, countBasis: "outstanding", economicUnitsPerQuotedShare: 1,
        priceBasis: registeredLabels.has(cls.label) ? "quoted-market-price" : "economic-equivalence-proxy" })) };
    result.reason = classes.some(cls => cls.label !== quotedLabel && registeredLabels.has(cls.label)) ? "Complete dated inventory includes another registered trading class; an independent same-session class price is still required" : classes.length > 1 ? "Complete dated cover inventory and explicit equal dividend/liquidation distributions; classes without a registered trading symbol use a same-price approximation" : "Dated single-class cover inventory bound to registered trading symbol";
    return result;
  }
  return result;
}

/** A newer observed inventory ends older evidence even when its rights are unresolved. */
export function economicEvidenceFromInventories(inventories: readonly FilingEconomicShares[]): EconomicShareEvidence[] {
  const rows = [...inventories].sort((a, b) => a.source.filingDate.localeCompare(b.source.filingDate));
  return rows.flatMap(row => {
    if (!row.evidence) return [];
    const sameDayUnknown = rows.filter(other => other.source.filingDate === row.source.filingDate && other.evidence === null);
    return [{ ...row.evidence,
      // Calendar dates cannot establish ordering between competing disclosures
      // on the same day. An unestablished state invalidates the day's proof.
      complete: row.evidence.complete && sameDayUnknown.length === 0,
      sourceIds: [...new Set([...row.evidence.sourceIds, ...sameDayUnknown.map(other => other.source.documentUrl)])],
      effectiveTo: rows.find(next => next.source.filingDate > row.source.filingDate)?.source.filingDate ?? null }];
  });
}
