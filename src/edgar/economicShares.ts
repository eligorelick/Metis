import { createHash } from "node:crypto";
import { decodeEntities, htmlToText, type ParsedDocument } from "@/edgar/extract";
import type { EconomicShareEvidence } from "@/pipeline/stageB/securityBasis";

export interface FilingEconomicShares {
  source: { form: string; accession: string; filingDate: string; documentUrl: string; hash: string };
  classes: { classId: string; label: string; shares: number | null; asOf: string; sourceId: string }[];
  /** Dated source observations are not a complete economic inventory. */
  observations?: { classId: string; shares: number; asOf: string; contextId: string; sourceId: string }[];
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
  // Preserve independently valid paragraph/cover observations even when the
  // complete-inventory contract below refuses them. No class sum or rights
  // inference follows from a count, label, date or word-number transform.
  const namespace = (prefix: string, uri: RegExp): boolean => {
    const bindings = [...html.matchAll(new RegExp(`\\bxmlns:${prefix}=["']([^"']+)["']`, "g"))].map(m => m[1]!);
    return bindings.length > 0 && new Set(bindings).size === 1 && uri.test(bindings[0]!);
  };
  const validObservationNamespaces = namespace("dei", /^http:\/\/xbrl.sec.gov\/dei\/20\d{2}$/) &&
    namespace("xbrli", /^http:\/\/www.xbrl.org\/2003\/instance$/) && namespace("ix", /^http:\/\/www.xbrl.org\/2013\/inlineXBRL$/);
  const words: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  result.observations = [];
  if (validObservationNamespaces) for (const fact of html.matchAll(/<ix:nonFraction\b([^>]*)>([\s\S]*?)<\/ix:nonFraction>/gi)) {
    if (attr(fact[1], "name") !== "dei:EntityCommonStockSharesOutstanding") continue;
    const contextId = attr(fact[1], "contextRef"), context = contexts.get(contextId);
    const raw = htmlToText(fact[2]).trim(), format = attr(fact[1], "format");
    const word = format === "ixt-sec:numwordsen" && namespace("ixt-sec", /^http:\/\/www.sec.gov\/inlineXBRL\/transformation\/2015-08-31$/) ? words[raw.toLowerCase()] : undefined;
    const count = word ?? (/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(raw) && ["", "ixt:num-dot-decimal"].includes(format) ? Number(raw.replaceAll(",", "")) : NaN);
    const duplicateContext = [...html.matchAll(/<xbrli:context\b([^>]*)>/g)].filter(m => attr(m[1]!, "id") === contextId).length !== 1;
    if (!context || duplicateContext || context.date > identity.filingDate || !shareUnits.has(attr(fact[1], "unitRef")) ||
      !["", "0"].includes(attr(fact[1], "scale")) || attr(fact[1], "sign") || attr(fact[1], "xsi:nil") || !Number.isSafeInteger(count) || count < 0) continue;
    result.observations.push({ classId: context.member, shares: count, asOf: context.date, contextId,
      sourceId: `${identity.documentUrl}#${attr(fact[1], "id") || contextId}` });
  }
  // Audit 2026-10-22 B-8 (owner decision): a cover outside the two layouts
  // above can still establish issuer-economic scope when the filing tags each
  // class's count at one date, binds the quote symbol to one of those classes
  // and states every class's economic relation in a supported sentence. Each
  // other class is then valued at its economic weight x the quoted price.
  const classTagged = (): FilingEconomicShares | null => {
    const observed = result.observations ?? [];
    const asOf = observed.map(o => o.asOf).sort().at(-1);
    if (asOf === undefined) return null;
    const dated = observed.filter(o => o.asOf === asOf);
    const factsAtDate = [...html.matchAll(/<ix:nonFraction\b([^>]*)>/gi)].filter(fact =>
      attr(fact[1], "name") === "dei:EntityCommonStockSharesOutstanding" && issuerInstantDates.get(attr(fact[1], "contextRef")) === asOf);
    const classKey = (member: string): string | null => /^[A-Za-z][\w-]*:CommonClass([A-Z][A-Z0-9]{0,3})Member$/.exec(member)?.[1] ?? null;
    const keys = dated.map(o => classKey(o.classId));
    if (dated.length < 2 || factsAtDate.length !== dated.length || keys.some(key => key === null) || new Set(keys).size !== keys.length) return null;
    const refuse = (reason: string): FilingEconomicShares => ({ ...result, reason });
    // Every class must be counted at the one date: a class counted earlier is never dropped from the sum.
    if (dated.length !== observed.length) return refuse("Class-tagged cover counts retained; the classes are counted at different dates, so no single-date inventory covers every class");
    // The quoted class: the class member on the trading symbol's own context,
    // else the single class its registered title names.
    const memberOf = new Map<string, string | null>();
    for (const match of html.matchAll(/<xbrli:context\b([^>]*)>([\s\S]*?)<\/xbrli:context>/gi)) {
      const members = [...match[2].matchAll(/<xbrldi:explicitMember\b([^>]*)>([^<]+)<\/xbrldi:explicitMember>/gi)];
      if (members.length > 1 || /<xbrldi:typedMember/i.test(match[2]) || members.some(member => attr(member[1], "dimension") !== "us-gaap:StatementClassOfStockAxis")) continue;
      memberOf.set(attr(match[1], "id"), members[0]?.[2].trim() ?? null);
    }
    const spelled = (symbol: string): string => symbol.trim().toUpperCase().replace(/[-/]/g, ".");
    const nonNumeric = [...html.matchAll(/<ix:nonNumeric\b([^>]*)>([\s\S]*?)<\/ix:nonNumeric>/gi)];
    const quotedKeys = new Set(nonNumeric.filter(fact => attr(fact[1], "name") === "dei:TradingSymbol" &&
      issuerContexts.has(attr(fact[1], "contextRef")) && spelled(htmlToText(fact[2])) === spelled(identity.securityId)).map(fact => {
      const contextRef = attr(fact[1], "contextRef");
      if (!memberOf.has(contextRef)) return null;
      const member = memberOf.get(contextRef);
      if (member) return classKey(member);
      const titles = nonNumeric.filter(title => attr(title[1], "name") === "dei:Security12bTitle" && attr(title[1], "contextRef") === contextRef);
      const label = titles.length === 1 ? classLabel(htmlToText(titles[0]![2])) : null;
      return label ? /^class ([a-z0-9]{1,4}) /.exec(label)?.[1]?.toUpperCase() ?? null : null;
    }));
    const quotedKey = quotedKeys.size === 1 ? [...quotedKeys][0] : null;
    if (!quotedKey || !keys.includes(quotedKey)) return refuse("Class-tagged cover counts retained; the trading symbol is not bound to exactly one tagged class");
    // Economic relations, from whole sentences of the filing's own text.
    // A block end also ends a sentence, so a heading never prefixes the statement under it.
    const sentences = (parsed?.pre ?? html).replace(/<ix:header\b[\s\S]*?<\/ix:header>/gi, "")
      .split(/<\/(?:p|div|h[1-6]|td|th|tr|li)>|<br\s*\/?>/i).map(block => htmlToText(block))
      .flatMap(block => block.split(/(?<=\.)\s+(?=[A-Z])/)).map(sentence => sentence.trim()).filter(Boolean);
    const list = "Class [A-Z][A-Z0-9]{0,3}(?:(?:,? and |, )Class [A-Z][A-Z0-9]{0,3})*";
    const stock = "(?:common )?(?:stock|shares)";
    const rights = "(?:liquidation and dividend|dividend and liquidation) rights";
    const equalForms = [
      new RegExp(`^(?:The )?holders of (?:our |its )?(${list}) ${stock}(?: \\([^)]{0,120}\\))? have identical ${rights}(?:,? but different voting rights)?\\.$`, "i"),
      new RegExp(`^(?:In accordance with (?:our|its) (?:amended and restated )?certificate of incorporation, )?the rights, including the ${rights}, of the holders of (?:our |its )?(${list}) ${stock} are identical(?:, except with respect to voting)?\\.$`, "i"),
    ];
    const ratioForm = /^(?:Each share of )?Class ([A-Z][A-Z0-9]{0,3}) common (?:stock|shares?) possess(?:es)? dividend and distribution rights equal to [a-z-]+ \(1\/(\d{1,3}(?:,\d{3})+|\d+)\) of (?:such|the) rights of (?:a share of )?Class ([A-Z][A-Z0-9]{0,3}) common (?:stock|shares?)\.$/i;
    const listed = (value: string): string[] => [...value.matchAll(/Class ([A-Z][A-Z0-9]{0,3})/gi)].map(match => match[1]!.toUpperCase());
    const relations: { sentence: string; equal?: string[]; ratio?: { cls: string; per: number; of: string } }[] = [];
    for (const sentence of sentences) {
      const equal = equalForms.map(form => form.exec(sentence)?.[1]).find(Boolean);
      if (equal) { relations.push({ sentence, equal: listed(equal) }); continue; }
      const ratio = ratioForm.exec(sentence);
      if (ratio) relations.push({ sentence, ratio: { cls: ratio[1]!.toUpperCase(), per: Number(ratio[2]!.replaceAll(",", "")), of: ratio[3]!.toUpperCase() } });
    }
    // A statement that the classes differ economically refuses the scope.
    const supported = new Set(relations.map(relation => relation.sentence));
    const conflicting = sentences.find(sentence => !supported.has(sentence) && /\b(?:dividends?|distributions?|liquidation)\b/i.test(sentence) &&
      listed(sentence).some(key => keys.includes(key)) &&
      /\b(?:different|differ|unequal|not (?:identical|equal|the same)|preferential|preference|not entitled|no right|non-?participating)\b/i.test(sentence));
    if (conflicting) return refuse(`Class-tagged cover counts retained; an economic statement is not one Métis reads as a class relation: "${conflicting.slice(0, 300)}"`);
    const weight = new Map<string, number>([[quotedKey, 1]]);
    let conflict = false;
    const assign = (key: string, value: number) => {
      const prior = weight.get(key);
      if (prior === undefined) weight.set(key, value);
      else if (Math.abs(prior - value) > 1e-12 * Math.max(prior, value)) conflict = true;
    };
    for (let pass = 0; pass < relations.length + 1; pass++) for (const relation of relations) {
      if (relation.equal) {
        const known = relation.equal.find(key => weight.has(key));
        if (known !== undefined) for (const key of relation.equal) assign(key, weight.get(known)!);
      } else if (relation.ratio) {
        const { cls, per, of } = relation.ratio;
        if (weight.has(of)) assign(cls, weight.get(of)! / per);
        if (weight.has(cls)) assign(of, weight.get(cls)! * per);
      }
    }
    const named = relations.flatMap(relation => relation.equal ?? [relation.ratio!.cls, relation.ratio!.of]);
    if (conflict || named.some(key => !keys.includes(key))) return refuse("Class-tagged cover counts retained; the stated class relations conflict or name a class with no tagged count");
    if (keys.some(key => !weight.has(key!))) return refuse("Class-tagged cover counts retained; the filing states no supported economic relation for every outstanding class");
    const classes = dated.map((o, index) => ({ classId: o.classId, label: `class ${keys[index]!.toLowerCase()} common stock`, shares: o.shares, asOf, sourceId: o.sourceId }));
    const used = relations.filter(relation => (relation.equal ?? [relation.ratio!.cls, relation.ratio!.of]).some(key => keys.includes(key)));
    return { ...result, classes,
      passages: { inventory: classes.map(cls => `${cls.label}: ${cls.shares} at ${asOf}`).join("; "), rights: used.map(relation => relation.sentence).join(" ") },
      evidence: { issuerId: identity.issuerId, securityId: identity.securityId, asOf, filed: identity.filingDate,
        effectiveFrom: identity.filingDate, effectiveTo: null, complete: true, sourceHash: source.hash,
        sourceIds: [...dated.map(o => o.sourceId), identity.documentUrl],
        classes: dated.map((o, index) => ({ classId: keys[index] === quotedKey ? identity.securityId : o.classId, shares: o.shares, countBasis: "outstanding" as const,
          economicUnitsPerQuotedShare: weight.get(keys[index]!)!, priceBasis: keys[index] === quotedKey ? "quoted-market-price" as const : "economic-equivalence-proxy" as const })) },
      reason: `Class-tagged cover counts at ${asOf} with the filing's stated class economics (${dated.map((o, index) => `Class ${keys[index]} ${weight.get(keys[index]!)} per quoted share`).join(", ")}); ` +
        "each other class is valued at its economic weight x the quoted class price, not at its own quote" };
  };

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
  if (quotedLabels.size !== 1) { result.reason = "Quoted common class cannot be uniquely bound to the filing trading symbol"; return classTagged() ?? result; }
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
    // Retain complete local passages. Generic layout headings and numeric
    // tables do not establish a change of accounting topic or end a qualifier.
    const ownershipAssertion = (value: string): boolean => /\b(?:distributions?|dividends?|liquidation|rights|recapitalization|amendment|charter|terms|provisions|appl(?:y|ies)|effective|operative|commenc(?:e|es|ing))\b/i.test(value);
    const strongAccountingBoundary = (value: string): boolean => {
      if (ownershipAssertion(value)) return false;
      return /^notes?\s+\d+\s*[-\u2013\u2014:]\s+\S/i.test(value) ||
        /^part\s+[ivx]+$/i.test(value) ||
        /^item\s+\d+[a-z]?\.\s*(?:financial statements|management.s discussion and analysis|market risk|risk factors)\s*$/i.test(value);
    };
    const rightsHtml = (parsed?.pre ?? html).replace(/<ix:header\b[\s\S]*?<\/ix:header>/gi, "")
      .replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, table => [...table.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)]
        .map(row => "\uE003" + htmlToText(row[0]) + "\uE000").join(""))
      .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_heading, _level, inner: string) => {
        const value = htmlToText(inner);
        return strongAccountingBoundary(value) ? "\uE001" + value + "\uE001" : "\uE000" + value + "\uE000";
      })
      .replace(/<\/(?:p|div)>/gi, "\uE000");
    let row = false;
    const blocks = htmlToText(rightsHtml).split(/([\uE000\uE001\uE003])/).reduce<{ text: string; boundary: boolean; row: boolean }[]>((all, part) => {
      const value = part.trim();
      if (value === "\uE003") row = true;
      else if (value === "\uE000") row = false;
      else if (value === "\uE001") { all.push({ text: "", boundary: true, row: false }); row = false; }
      else if (value) all.push({ text: value, boundary: strongAccountingBoundary(value), row });
      return all;
    }, []);
    const blockSentences = (block: typeof blocks[number]): string[] => block.row ? [block.text] : block.text.split(/[.!?]\s+/);
    const statements = blocks.flatMap((block, blockIndex) => block.boundary ? [] : blockSentences(block).map(sentence => ({ sentence, blockIndex })));
    const sentences = statements.map(statement => statement.sentence);
    const supportedCurrentEquality = (sentence: string): boolean => {
      const value = sentence.trim().replace(/[.]$/, "").replace(/\s+/g, " ");
      if (value.length > 1600) return false;
      const distribution = "equal per[- ]share distributions (?:whether )?through dividends? (?:or|and) (?:in )?liquidation";
      const predicate = "(?:receive|are (?:legally )?entitled to) " + distribution;
      const forms = [
        new RegExp("^For (.+), (?:the )?holders of each class " + predicate + "$", "i"),
        new RegExp("^(?:The )?holders of (.+) " + predicate + "$", "i"),
        new RegExp("^The earnings per share amounts are the same for (.+) because the holders of each class are (?:legally )?entitled to " + distribution + "$", "i"),
      ];
      const named = forms.map(form => form.exec(value)?.[1]).find(Boolean);
      if (!named) return false;
      // Validate the entire subject, not merely class-name substrings within an
      // attributed, negated or hypothetical assertion.
      const className = "(?:class [a-z0-9]{1,8} )?(?:common (?:stock|shares)|ordinary shares)";
      if (!new RegExp("^" + className + "(?:(?:,? and |, )" + className + ")*$", "i").test(named)) return false;
      const labels = classLabels(named);
      return labels.length === classes.length && new Set(labels).size === classes.length && classes.every(cls => labels.includes(cls.label));
    };
    // Every additional-class economic assertion must be supported. An unknown
    // assertion can conflict with equality regardless of its ratio wording.
    const economicAssertions = sentences.filter(sentence => /\b(?:distributions?|dividends?|liquidation)\b/i.test(sentence) &&
      classLabels(sentence).some(label => label !== quotedLabel && classes.some(cls => cls.label === label)));
    const unsupportedRights = economicAssertions.some(sentence => !supportedCurrentEquality(sentence));
    const currentIntro = (sentence: string): boolean => /^(?:the\s+)?following\s+(?:describes?|sets?\s+out|are)\s+(?:the\s+)?current\s+(?:distribution\s+)?rights[.]?$/i.test(sentence.trim());
    // The bounded passage grammar admits known accounting facts/methods and
    // neutral class introductions. Every other assertion is unresolved; unknown
    // pronouns or applicability clauses cannot disappear for lacking a class name.
    const neutralAccounting = (sentence: string, isRow: boolean): boolean => {
      const value = sentence.trim().replace(/[.:]$/, "");
      if (!value) return true;
      if (ownershipAssertion(value)) return false;
      if (/^(?:(?:the\s+)?company|common stock)\s+has\s+(?:one|two|three|four|\d+)\s+classes(?:\s+of\s+common\s+(?:stock|shares))?$/i.test(value)) return true;
      if (/^(?:financial|accounting)\s+(?:statements?\s+)?(?:discussion|information|data|statements|notes)$/i.test(value)) return true;
      if (/^(?:shares issued|treasury shares):\s*[\d,.]+$/i.test(value)) return true;
      if (/^(?:\d+|F-\s*\d+|Table of Contents|Notes to Consolidated Financial Statements\s*[-\u2013\u2014]?\s*\(Continued\))$/i.test(value)) return true;
      if (/^(?:Basic|Diluted)\s+Earnings\s+Per\s+Share$/i.test(value)) return true;
      if (/^The following table (?:represents|presents|shows) (?:our|the) basic and diluted earnings per share$/i.test(value)) return true;
      // Supported EPS methods are whole clauses. An accounting phrase cannot
      // absorb a second assertion about class participation or applicability.
      const method = value.replace(/\s+/g, " ");
      const years = "(?:the )?years? ended [A-Za-z]+ \\d{1,2}, \\d{4}(?:, \\d{4})*(?: and \\d{4})?";
      const methods = [
        /^(?:Basic |Diluted )?earnings per share is calculated using (?:our |the )?weighted[- ]average (?:outstanding common shares|shares)(?: including the dilutive effect of stock awards and common stock warrants as determined under the treasury stock method and of our Convertible Notes using the if-converted method prior to the date of our irrevocable election to settle in cash discussed in Note \d+ [–—-] Debt)?$/i,
        new RegExp("^Basic earnings per share was calculated for " + years + " using the weighted average number of common and Class [A-Za-z0-9]+ common shares outstanding during the period excluding restricted stock and stock held in escrow$", "i"),
        new RegExp("^For " + years + ", we computed diluted earnings per share using \\(i\\) the number of shares of common stock and Class [A-Za-z0-9]+ common stock used in the basic earnings per share calculation as indicated above, \\(ii\\) if dilutive, the incremental common stock that we would issue upon the assumed exercise or vesting of stock-based awards and common stock warrants using the treasury stock method, \\(iii\\) if dilutive, our Convertible Notes using the if-converted method prior to the date of our irrevocable election to settle in cash as discussed in NOTE \\d+ [–—-] Debt, and \\(iv\\) other stock-based commitments$", "i"),
        /^(?:In )?periods when we recognize a net loss, we exclude the impact of outstanding stock awards and the potential share settlement impact related to our Convertible Notes, if applicable, from the diluted loss per share calculation as their inclusion would have an antidilutive effect$/i,
        /^(?:For the (?:three|six|nine|twelve)(?: and (?:three|six|nine|twelve))? months ended [A-Za-z]+ \d{1,2}, \d{4}, (?:less than |approximately )?\d+(?: million)?|For the years? ended [A-Za-z]+ \d{1,2}, \d{4}(?:, \d{4})*(?: and \d{4})?, a minimal number of shares) of outstanding stock[- ](?:based )?awards (?:have been|were) excluded from the calculations of diluted earnings per share attributable to common stockholders because their effect would have been antidilutive$/i,
        /^For the (?:three|six|nine|twelve)(?: and (?:three|six|nine|twelve))? months ended [A-Za-z]+ \d{1,2}, \d{4}, approximately \d+(?: million)?(?: of outstanding stock awards| shares)? were excluded$/i,
        /^For the years? ended [A-Za-z]+ \d{1,2}, \d{4}(?:, \d{4})*(?: and \d{4})?, approximately \d+(?: million)?(?: and approximately \d+(?: million)?)?(?: shares)? were excluded$/i,
      ];
      if (methods.some(pattern => pattern.test(method))) return true;
      // Pagination may split the financial-method paragraph after its preposition.
      if (value === "In") return true;
      if (!isRow) return false;
      if (/^(?:Basic|Diluted|Convertible Notes|Stock[- ]based awards)\s+[$\d\s,.\u2014()\-]+$/i.test(value)) return true;
      if (/^(?:\d{4}\s*)+$/.test(value) || /^\(In (?:millions|thousands), except (?:share and )?per share data\)$/i.test(value)) return true;
      if (/^(?:(?:Three|Six|Nine|Twelve) months ended [A-Za-z]+\s+\d{1,2},?\s*)+$/i.test(value) || /^Year Ended [A-Za-z]+\s+\d{1,2},?$/i.test(value)) return true;
      // A numeric row must have a bounded noun label, not arbitrary prose before
      // its figures. Proper issuer-name tokens and the plain parent label are
      // supported; compound assertions and unknown lower-case clauses refuse.
      const issuerLabel = "(?:parent|[A-Z][A-Za-z0-9&'’.-]*(?:[ ,]+[A-Z][A-Za-z0-9&'’.-]*){0,11})";
      if (new RegExp("^Net income attributable to " + issuerLabel + " \\$?\\s*[\\d,.]+[\\d$\\s,.()\\-]*$").test(value)) return true;
      if (new RegExp("^Earnings per share attributable to " + issuerLabel + " available to common stockholders$").test(value)) return true;
      if (/^Weighted average number of shares outstanding\s*\(000['\u2019]s\)$/i.test(value) || /^Dilutive effect of$/i.test(value)) return true;
      return false;
    };
    const supportedPassage = (selectedBlock: number): boolean => {
      let first = selectedBlock, last = selectedBlock;
      let chars = blocks[selectedBlock].text.length, count = 1;
      if (chars > 12000) return false;
      for (const direction of [-1, 1]) {
        let index = selectedBlock + direction;
        while (index >= 0 && index < blocks.length && !blocks[index].boundary) {
          chars += blocks[index].text.length; count++;
          // Reaching a budget is unresolved context, not permission to discard it.
          if (chars > 12000 || count > 64) return false;
          if (direction < 0) first = index; else last = index;
          index += direction;
        }
      }
      return blocks.slice(first, last + 1).every(block => blockSentences(block).every(sentence =>
        supportedCurrentEquality(sentence) || currentIntro(sentence) || neutralAccounting(sentence, block.row)));
    };
    const rights = !unsupportedRights ? statements.find(statement => supportedCurrentEquality(statement.sentence) && supportedPassage(statement.blockIndex))?.sentence : undefined;
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
  return classTagged() ?? result;
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
