import { createHash } from "node:crypto";
import { classEconomicContradiction, identicalClassRights, participatingClassRights, shareForShareClassRights } from "@/edgar/economicShares";
import { sameEntitySymbol } from "@/symbol";
import type { DataBundle } from "@/pipeline/types";
import type { EconomicShareEvidence } from "@/pipeline/stageB/securityBasis";
import { quotePriceObservationDay } from "@/pipeline/stageB/priceCurrency";
import { filingSentences, grantsSecurityEconomics, isSecClassFiling, nonEconomicDenial, sharedClassDividendRate } from "@/edgar/classEvidence";

/** Half a percent is the maximum nominal denominator error at fixed equity value.
 * This is not a bound on unknown preferences, enterprise value or discount rates. */
export const MAX_CLASS_COUNT_ERROR = 0.005;

interface ClassSection { form: string; accession: string; filingDate: string; documentUrl: string; reportDate: string; text: string; statementsText?: string }
export function retainedClassSections(bundle: DataBundle): ClassSection[] {
  const cutoff = bundle.builtAt.slice(0, 10), cik = bundle.edgar.registrant?.cik10;
  if (!cik) return [];
  const sections: ClassSection[] = [];
  for (const member of Object.values(bundle.edgar)) {
    if (!member || typeof member !== "object" || !("ok" in member) || !member.ok || !("value" in member)) continue;
    const value = member.value;
    if (!value || typeof value !== "object" || !("source" in value) || value.source !== "edgar" || !("data" in value)) continue;
    const data = value.data;
    if (!data || typeof data !== "object") continue;
    const fields = data as Record<string, unknown>;
    if (!["form", "accession", "filingDate", "documentUrl", "reportDate", "text"].every(k => typeof fields[k] === "string")) continue;
    const section = fields as unknown as ClassSection;
    if (isSecClassFiling(section, cik, cutoff) && Date.parse(cutoff) - Date.parse(section.filingDate) <= 400 * 86_400_000) {
      const statement = section.statementsText;
      sections.push(statement && !section.text.includes(statement) ? { ...section, text: `${section.text} ${statement}` } : section);
    }
  }
  return sections;
}

/** The statement can qualify a cover even when it cannot establish a count. */
function statementClasses(text: string): { name: string; zero: boolean; outstanding: boolean }[] {
  const opening = /\bcommon stock at stated value:|\b(?:stockholders['\u2019]?|shareholders['\u2019]?|shareowners['\u2019]?)\s+equity\s*:|\bEquity\s*:|\bCommon stock:/i.exec(text);
  if (!opening) return [];
  const capital = text.slice(opening.index).split(/\b(?:Additional paid[ -]in capital|Capital in excess|Retained earnings|Treasury stock|CONSOLIDATED STATEMENTS)\b/i)[0]!;
  const rows = [...capital.matchAll(/\b(?:Class ([A-Z0-9]{1,8})\b|([A-Z][A-Za-z-]{0,30}) common stock\b)/gi)];
  return rows.flatMap((m, i) => {
    const tail = capital.slice(m.index! + m[0].length, rows[i + 1]?.index);
    if (!/\b(?:issued|outstanding)\b/i.test(tail)) return [];
    const count = /\b([\d,]+|zero|no)(?:\s+and\s+(?:[\d,]+|zero|no))?\s+shares\s+(?:issued\s*(?:&|and)\s*)?outstanding\b/i.exec(tail)?.[1];
    const name = m[1] ? `class ${m[1].toLowerCase()} common stock` : `${m[2]!.toLowerCase()} common stock`;
    return [{ name, outstanding: /\boutstanding\b/i.test(tail), zero: count !== undefined && /^(?:0|zero|no)$/i.test(count) }];
  });
}

function coverName(classId: string): string | null {
  const key = /^[A-Za-z][\w-]*:CommonClass([A-Z0-9]{1,8})Member$/.exec(classId)?.[1];
  if (key) return `class ${key.toLowerCase()} common stock`;
  const custom = /^(?!us-gaap:)[A-Za-z][\w-]*:([A-Z][A-Za-z-]{0,30})CommonStockMember$/.exec(classId)?.[1];
  return custom ? `${custom.toLowerCase()} common stock` : null;
}

function retainedClassConflict(bundle: DataBundle): string | null {
  const cutoff = bundle.builtAt.slice(0, 10);
  const cover = [...(bundle.edgar.economicShareInventory ?? [])].filter(i => i.source.filingDate <= cutoff)
    .sort((a, b) => b.source.filingDate.localeCompare(a.source.filingDate))[0];
  if (!cover) return null;
  const observations = cover.observations ?? [];
  const names = observations.flatMap(o => coverName(o.classId) ?? []);
  for (const s of retainedClassSections(bundle).filter(s => s.accession === cover.source.accession && s.documentUrl === cover.source.documentUrl)) {
    for (const row of statementClasses(s.statementsText ?? s.text)) {
      const count = observations.find(o => coverName(o.classId) === row.name);
      if (row.outstanding && !row.zero && !count) return `${row.name} is outstanding in the balance sheet but omitted from the cover; participation wording cannot reconcile the conflicting inventory.`;
      if (row.zero && count && count.shares > 0) return `${row.name} has ${count.shares.toLocaleString("en-US")} cover shares but zero shares outstanding in the balance sheet; treasury scope requires reconciliation.`;
    }
  }
  const weighted = bundle.economicShareEvidence?.some(e => e.classes.some(c => c.economicUnitsPerQuotedShare !== 1));
  if (!weighted) for (const section of retainedClassSections(bundle)) {
    const conflict = classEconomicContradiction(section.text, names);
    if (conflict) return `${conflict} Source: ${section.form} ${section.accession}, filed ${section.filingDate}.`;
  }
  return null;
}

export function retainedClassEconomicRefusal(bundle: DataBundle): string | null {
  return readRetainedClassEconomics(bundle).refusal;
}

const labelPattern = "(?:Class [A-Z0-9]{1,8}|[A-Z][A-Z-]{0,30}) common stock";
const labels = (text: string): string[] => [...text.matchAll(new RegExp(`\\b(${labelPattern})\\b`, "gi"))].map(m => m[1]!.toLowerCase());
const validDay = (v: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const dated = (text: string): string | null => {
  const ms = Date.parse(`${text} UTC`);
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : null;
};

/** A conversion option without a ratio proves no weight. A filed rollforward
 * can establish one-for-one units when its two conversion rows reconcile in
 * every column and the filing says conversion is available at any time. */
interface ConversionRelation { text: string; from: string; to: string }
function conversionRollforward(text: string, names: readonly string[]): ConversionRelation | null {
  if (names.length !== 2) return null;
  const option = /\bClass ([A-Z0-9]{1,8}) shares(?: are primarily held by (?:(?!\bClass\b)[^.]){1,240}, and these shares)? are fully convertible into class ([A-Z0-9]{1,8}) shares at any time\./i.exec(text);
  if (!option || !names.includes(option[1]!.toLowerCase()) || !names.includes(option[2]!.toLowerCase()) || option[1]!.toLowerCase() === option[2]!.toLowerCase()) return null;
  const number = "(?:\\(\\s*[\\d,]+\\s*\\)|[\\d,]+|[—–-])";
  const rows = [...text.matchAll(new RegExp(`Conversions of class ${option[1]} to class ${option[2]} common stock\\s+((?:${number}\\s*)+)`, "gi"))];
  if (!rows.length || rows.length % 2 !== 0) return null;
  const amounts = rows.map(m => [...m[1]!.matchAll(/\(\s*([\d,]+)\s*\)|([\d,]+)|([—–-])/g)]
    .map(n => n[1] ? -Number(n[1].replaceAll(",", "")) : n[2] ? Number(n[2].replaceAll(",", "")) : 0));
  for (let i = 0; i < amounts.length; i += 2) {
    if (!amounts[i]!.length || amounts[i]!.length !== amounts[i + 1]!.length || !amounts[i]!.some(n => n < 0) ||
        amounts[i]!.some((n, j) => n > 0 || n !== -amounts[i + 1]![j]!)) return null;
  }
  return { text: `${option[0]} Filed Class ${option[1]} and Class ${option[2]} conversion rollforward rows have equal and opposite counts in every column (${amounts[1]!.join(", ")}), establishing a one-for-one conversion-unit approximation.`,
    from: `class ${option[1]!.toLowerCase()} common stock`, to: `class ${option[2]!.toLowerCase()} common stock` };
}

/**
 * N2: a deliberately narrow alternative to the inline cover layouts.
 * A primary balance sheet explicitly counts every equally participating class
 * at its report date, in unscaled shares; the SAME filing states their current
 * identical dividend/liquidation rights. Names, voting rights and conversion
 * options alone prove nothing. The provider title binds the quote class; it is
 * retained as provider evidence, never described as a filed symbol/title row.
 */
export function retainedClassEconomicEvidence(bundle: DataBundle): EconomicShareEvidence[] {
  return readRetainedClassEconomics(bundle).evidence;
}

function readRetainedClassEconomics(bundle: DataBundle): { evidence: EconomicShareEvidence[]; refusal: string | null } {
  const conflict = retainedClassConflict(bundle);
  if (conflict) return { evidence: (bundle.economicShareEvidence ?? []).map(e => ({ ...e, complete: false })), refusal: conflict };
  const original = retainedStatementEconomicEvidence(bundle);
  const quoteDay = quotePriceObservationDay(bundle.quote.ok ? bundle.quote.value.data.rows[0] : undefined);
  // A newer filing expires the earlier inventory. Its mere presence must not
  // prevent the independently proved interim-cover path from being evaluated.
  // Unknown/active evidence retains first choice and its existing refusals.
  const allExpired = quoteDay !== null && original.length > 0 && original.every(e =>
    e.effectiveTo !== null && validDay(e.effectiveTo) && e.effectiveTo <= quoteDay);
  if (original.length && !allExpired) return { evidence: original, refusal: null };
  let refusal: string | null = null;
  const current = retainedEqualCoverEvidence(bundle, reason => { refusal = reason; return []; });
  return { evidence: current.length ? current : refusal ? [] : original, refusal };
}

function retainedStatementEconomicEvidence(bundle: DataBundle): EconomicShareEvidence[] {
  const existing = bundle.economicShareEvidence ?? [];
  if (existing.length) return existing;
  const cutoff = bundle.builtAt.slice(0, 10);
  const registrant = bundle.edgar.registrant;
  const profile = bundle.profile.ok ? bundle.profile.value.data.rows[0] : null;
  if (!registrant || !profile || !validDay(cutoff) || !/^\d{10}$/.test(registrant.cik10) ||
    Number(profile.cik) !== Number(registrant.cik10) || profile.symbol !== bundle.symbol ||
    !registrant.tickers.includes(bundle.symbol) || profile.isAdr !== false || !bundle.profile.ok) return existing;
  const title = typeof profile.companyName === "string" ? profile.companyName : "";
  const quoteLabels = labels(title);
  if (quoteLabels.length !== 1) return existing;
  const notes = [bundle.edgar.tenQNotes, bundle.edgar.tenKNotes].flatMap(s => s?.ok ? [s.value] : [])
    .filter(s => /^(?:10-Q|10-K)(?:\/A)?$/.test(s.data.form) && validDay(s.data.filingDate) && s.data.filingDate <= cutoff)
    .sort((a, b) => b.data.filingDate.localeCompare(a.data.filingDate));
  const source = notes[0];
  if (!source) return existing;
  const d = source.data;
  if (!validDay(d.reportDate) || d.reportDate > d.filingDate || !/^\d{10}-\d{2}-\d{6}$/.test(d.accession)) return existing;
  if (!isSecClassFiling(d, registrant.cik10, cutoff)) return existing;
  // Never carry an older statement past a newer periodic filing or a competing
  // same-day inventory. No omission establishes that a class disappeared.
  if ([bundle.edgar.latestTenQ, bundle.edgar.latestTenK].some(s => s?.ok && s.value.data.filingDate <= cutoff && s.value.data.filingDate > d.filingDate) ||
    (bundle.edgar.economicShareInventory ?? []).some(s => s.source.filingDate <= cutoff &&
      (s.source.filingDate > d.filingDate || s.source.filingDate === d.filingDate && s.source.documentUrl !== d.documentUrl ||
        s.source.filingDate === d.filingDate && s.source.accession !== d.accession))) return existing;
  const statement = d.statementsText ?? "";
  if (!/BALANCE SHEETS?\b/i.test(statement) || !/in thousands, except share and per share data/i.test(statement)) return existing;
  const equityStart = /stockholders['\u2019]? equity:/i.exec(statement);
  if (!equityStart) return existing;
  const equity = statement.slice(equityStart.index).split(/\b(?:CONSOLIDATED )?STATEMENTS OF\b/i)[0]!;
  const entries = [...equity.matchAll(new RegExp(`\\b(${labelPattern})\\s*[-\\u2013\\u2014]`, "gi"))];
  const names = entries.map(m => m[1]!.toLowerCase());
  if (names.length < 2 || new Set(names).size !== names.length || !names.includes(quoteLabels[0]!)) return existing;
  // A plain or otherwise unsupported common-stock count is not silently lost.
  if ((equity.match(/\bcommon stock\b/gi) ?? []).length !== names.length) return existing;
  // L1: independently parsed cover observations must bijectively name the
  // same filing's balance-sheet classes; an unknown or missing member refuses.
  const inventories = (bundle.edgar.economicShareInventory ?? []).filter(s => s.source.filingDate === d.filingDate && s.source.documentUrl === d.documentUrl);
  const cover = inventories.flatMap(s => s.observations ?? []).filter(o => o.asOf > d.reportDate);
  if (!cover.length && inventories.some(s => s.classes.some(o => o.asOf > d.reportDate))) return existing;
  let asOf = d.reportDate;
  let counts: number[] = [];
  if (cover.length) {
    const observations = inventories.flatMap(s => s.observations ?? []);
    const mapped = observations.map(o => coverName(o.classId));
    const days = new Set(observations.map(o => o.asOf));
    if (observations.length !== names.length || new Set(mapped).size !== names.length || !names.every(n => mapped.includes(n)) || days.size !== 1 ||
      observations.some(o => !validDay(o.asOf) || o.asOf > d.filingDate || !Number.isSafeInteger(o.shares) || o.shares < 0 || !o.sourceId.startsWith(d.documentUrl + "#"))) return existing;
    asOf = observations[0]!.asOf;
    counts = names.map(name => observations[mapped.indexOf(name)]!.shares);
  } else {
    const countPattern = /([\d,]+|no)(?:\s+and\s+([\d,]+|no))?\s+shares issued and outstanding at ([A-Za-z]+\s+\d{1,2},?\s+\d{4})/gi;

    for (let i = 0; i < entries.length; i++) {
      const row = equity.slice(entries[i]!.index! + entries[i]![0].length, entries[i + 1]?.index);
      const observed = [...row.matchAll(countPattern)];
      if (!observed.length || dated(observed[0]![3]!) !== d.reportDate) return existing;
      const current = observed.filter(m => dated(m[3]!) === d.reportDate).map(m => m[1]!.toLowerCase() === "no" ? 0 : Number(m[1]!.replaceAll(",", "")));
      if (!current.length || current.some(n => !Number.isSafeInteger(n) || n < 0 || n !== current[0])) return existing;
      counts.push(current[0]!);
    }
  }
  const sentences = filingSentences(d.text);
  const relation = sentences.find(s => {
    const related = identicalClassRights(s);
    return related && related.length === names.length && names.every(n => related.includes(n));
  });
  if (!relation || classEconomicContradiction(d.text, names)) return existing;
  const total = counts.reduce((n, count) => n + count, 0);
  const provider = bundle.sharesFloat.ok ? bundle.sharesFloat.value.data.rows.find(r => r.symbol === bundle.symbol && r.source === d.documentUrl &&
    typeof r.outstandingShares === "number" && Number.isSafeInteger(r.outstandingShares) && r.outstandingShares > 0) : undefined;
  const quotedCount = counts[names.indexOf(quoteLabels[0]!)]!;
  const discrepancy = provider && quotedCount > 0 && Math.abs(provider.outstandingShares! / quotedCount - 1) > 0.03
    ? ` Provider quoted-class count ${provider.outstandingShares} (vendor observation date ${provider.date ?? "unavailable"}; same source filing dated ${d.filingDate}) differs from filed ${cover.length ? "cover" : "balance-sheet"} quoted-class count ${quotedCount} at ${asOf} by ${((provider.outstandingShares! / quotedCount - 1) * 100).toFixed(2)}%; the vendor date is not established as a filed count date. Admission is unchanged.` : "";
  const treasuryCounts = [...equity.matchAll(/\bTreasury (?:stock|shares)[^;]{0,60}?\(\s*([\d,]+)\s+shares\s*\)/gi)].map(m => Number(m[1]!.replaceAll(",", "")));
  // A flattened rollforward is readable only with the same ordered common
  // classes before Treasury Stock, and a closing row matching all counts.
  const roll = statement.split(/STATEMENTS OF STOCKHOLDERS['\u2019]? EQUITY/i)[1] ?? "";
  const header = roll.split(/\bTreasury Stock\b/i)[0] ?? "";
  const ordered = labels(header);
  if (ordered.length === names.length && ordered.every((name, i) => name === names[i])) {
    const amount = "\\s+\\$?\\s*(?:\\(\\s*[\\d,]+\\s*\\)|[\\d,]+|[\\u2014\\u2013-])";
    const count = "([\\d,]+)";
    const rowPattern = new RegExp(`\\bBalance at ([A-Za-z]+\\s+\\d{1,2},?\\s+\\d{4})${names.map(() => `\\s+${count}${amount}`).join("")}\\s+${count}\\s+\\$`, "gi");
    for (const row of roll.matchAll(rowPattern)) if (dated(row[1]!) === d.reportDate && counts.every((n, i) => Number(row[i + 2]!.replaceAll(",", "")) === n)) treasuryCounts.push(Number(row[names.length + 2]!.replaceAll(",", "")));
  }
  const treasury = treasuryCounts.length > 0 && new Set(treasuryCounts).size === 1 && Number.isSafeInteger(treasuryCounts[0]) ? treasuryCounts[0]! : null;
  const treasuryBasis = !cover.length && treasury !== null && total > 0 ? ` Treasury shares ${treasury} at ${d.reportDate} (${(treasury / total * 100).toFixed(2)}% of economic units), not netted: the filer's issued-and-outstanding label is followed; treasury is disclosed separately.` : "";
  return [{ issuerId: registrant.cik10, securityId: bundle.symbol, asOf, filed: d.filingDate,
    effectiveFrom: d.filingDate, effectiveTo: null, complete: true,
    sourceHash: createHash("sha256").update(JSON.stringify({ statement, text: d.text, quoteTitle: title, ...(cover.length ? { coverObservations: cover, inventoryHashes: inventories.map(s => s.source.hash) } : {}), ...(discrepancy ? { providerCountObservation: provider } : {}) })).digest("hex"),
    sourceIds: [d.documentUrl, bundle.profile.value.endpoint, ...cover.map(o => o.sourceId), ...(discrepancy && bundle.sharesFloat.ok ? [bundle.sharesFloat.value.endpoint] : [])],
    basis: `${cover.length ? `Filed cover class observations at ${asOf}, mapped one-to-one to the same filing's balance-sheet classes` : `Filed balance-sheet counts at ${d.reportDate}, not a cover-date inventory or weighted averages`}. Quote class bound by provider title "${title}", not independently by a filed trading-symbol row. The hash covers the retained statement, notes and provider title${cover.length ? ", cover observations and retained inventory hashes" : ""}${discrepancy ? " and the disclosed provider count observation" : ""}, not raw filing HTML. Filed rights: "${relation}"${discrepancy}${treasuryBasis}`,
    classes: names.map((name, i) => ({ classId: name === quoteLabels[0] ? bundle.symbol : name, shares: counts[i]!, countBasis: "outstanding",
      economicUnitsPerQuotedShare: 1, priceBasis: name === quoteLabels[0] ? "quoted-market-price" : "economic-equivalence-proxy" })) }];
}

/** D-186: a complete cover count and explicit equal economics do not require
 * identifying which equivalent class trades. All classes use the disclosed
 * same-price approximation. Annual rights can remain in force through an
 * interim filing only with the same class set and no contrary retained terms. */
function retainedEqualCoverEvidence(bundle: DataBundle, refuse: (reason: string) => EconomicShareEvidence[]): EconomicShareEvidence[] {
  const profile = bundle.profile.ok ? bundle.profile.value.data.rows[0] : null;
  const reg = bundle.edgar.registrant, cutoff = bundle.builtAt.slice(0, 10);
  if (!profile || !reg || profile.isAdr !== false || profile.symbol !== bundle.symbol ||
    !/^\d{10}$/.test(reg.cik10) || Number(profile.cik) !== Number(reg.cik10) ||
    !reg.tickers.some(t => sameEntitySymbol(bundle.symbol, t)) || !validDay(cutoff) || bundle.edgar.shareBasis?.splits.unresolved.length) return [];
  const primary = (d: ClassSection | NonNullable<DataBundle["edgar"]["economicShareInventory"]>[number]["source"]) => isSecClassFiling(d, reg.cik10, cutoff);
  const notes = [bundle.edgar.tenQNotes, bundle.edgar.tenKNotes].flatMap(m => m?.ok && m.value.source === "edgar" ? [m.value.data] : [])
    .filter(d => primary(d) && validDay(d.reportDate) && d.reportDate <= d.filingDate).sort((a, b) => b.filingDate.localeCompare(a.filingDate));
  const latest = notes[0];
  if (!latest || [bundle.edgar.latestTenK, bundle.edgar.latestTenQ].some(m => m?.ok && m.value.data.filingDate <= cutoff && m.value.data.filingDate > latest.filingDate)) return [];
  const inventories = (bundle.edgar.economicShareInventory ?? []).filter(i => i.source.filingDate <= cutoff);
  if (inventories.some(i => i.source.filingDate > latest.filingDate || i.source.filingDate === latest.filingDate &&
    (i.source.accession !== latest.accession || i.source.documentUrl !== latest.documentUrl))) return [];
  const covers = inventories.filter(i => i.source.accession === latest.accession && i.source.documentUrl === latest.documentUrl && i.source.filingDate === latest.filingDate);
  if (covers.length !== 1 || !primary(covers[0]!.source) || !covers[0]!.source.hash) return [];
  const allObserved = covers[0]!.observations ?? [];
  if (new Set(allObserved.map(o => o.classId)).size !== allObserved.length) return [];
  // A separately counted voting-only security can leave the economic sum
  // only when a retained, issuer-bound filing explicitly denies economic rights.
  const rightsSources = retainedClassSections(bundle);
  let exclusionRefusal: string | null = null;
  const nonEconomic = allObserved.flatMap(o => {
    if (coverName(o.classId)) return [];
    const custom = /^(?!us-gaap:)[A-Za-z][\w-]*:([A-Za-z][A-Za-z0-9]*)Member$/.exec(o.classId);
    if (!custom) return [];
    const name = custom[1]!.replace(/([a-z])([A-Z])/g, "$1 $2");
    const source = rightsSources.find(d => filingSentences(d.text).some(s => nonEconomicDenial(s, name)));
    const grants = rightsSources.flatMap(d => filingSentences(d.text)).find(s => grantsSecurityEconomics(s, name));
    const qualified = rightsSources.flatMap(d => filingSentences(d.text)).find(s => s.toLowerCase().includes(name.toLowerCase()) && /no economic rights/i.test(s) && !nonEconomicDenial(s, name));
    if (grants || qualified) exclusionRefusal = `The unconditional voting-only exclusion for ${name} is not established; it conflicts with this retained term: "${grants ?? qualified}"`;
    return source && !grants && !qualified ? [{ observation: o, name, source }] : [];
  });
  if (exclusionRefusal) return refuse(exclusionRefusal);
  const excluded = nonEconomic.reduce((n, c) => n + c.observation.shares, 0);
  const remaining = allObserved.reduce((n, c) => n + c.shares, 0) - excluded;
  if (excluded > remaining * MAX_CLASS_COUNT_ERROR) return refuse(`The counted voting-only securities (${nonEconomic.map(n => n.name).join(", ")}) exceed the 0.5% nominal count-error limit; a denial alone cannot remove this material count.`);
  const observed = allObserved.filter(o => !nonEconomic.some(n => n.observation === o));
  const names = observed.map(o => /^[A-Za-z][\w-]*:CommonClass([A-Z0-9]{1,8})Member$/.exec(o.classId)?.[1]?.toLowerCase() ?? "");
  const asOf = observed[0]?.asOf;
  if (!asOf || !validDay(asOf) || asOf < latest.reportDate || asOf > latest.filingDate || names.length < 2 ||
    names.some(n => !n) || new Set(names).size !== names.length || allObserved.some(o => o.asOf !== asOf || !o.contextId ||
      !Number.isSafeInteger(o.shares) || o.shares < 0 || !o.sourceId.startsWith(latest.documentUrl + "#"))) return [];
  if (covers[0]!.classes.some(c => !allObserved.some(o => c.classId === o.classId && c.asOf === o.asOf && c.shares === o.shares)) ||
    bundle.edgar.shareBasis?.splits.events.some(e => e.date > asOf && e.date <= cutoff)) return [];
  const sameSet = (ns: string[]) => ns.length === names.length && new Set(ns).size === names.length && names.every(n => ns.includes(n));
  const classNames = names.map(n => `class ${n} common stock`);
  const hasStatementInventory = sameSet(statementClasses(latest.statementsText ?? latest.text).filter(r => !r.zero).map(r => r.name.split(" ")[1]!));
  const participation = participatingClassRights(latest.text);
  if (!hasStatementInventory && !(participation && participation.length === classNames.length && classNames.every(n => participation.includes(n)))) return [];
  const currentRights = (text: string) => filingSentences(text).find(s => {
    const ns = identicalClassRights(s);
    return ns?.length === classNames.length && classNames.every(n => ns.includes(n));
  }) ?? sharedClassDividendRate(text, classNames);
  const currentSource = [...rightsSources].sort((a, b) => b.filingDate.localeCompare(a.filingDate)).find(d => currentRights(d.text));
  const converted = (text: string): ConversionRelation | null => {
    for (const sentence of filingSentences(text)) {
      const ns = shareForShareClassRights(sentence);
      if (ns?.length === classNames.length && classNames.every(n => ns.includes(n))) return { text: sentence, from: ns[0]!, to: ns[1]! };
    }
    return conversionRollforward(text, names);
  };
  const source = currentSource ?? notes.find(d => converted(d.text));
  if (!source) return [];
  const annualInventory = inventories.find(i => i.source.accession === source.accession && i.source.documentUrl === source.documentUrl);
  if (source.accession !== latest.accession && (!annualInventory || !primary(annualInventory.source) || !sameSet((annualInventory.observations ?? []).map(o =>
    /^[A-Za-z][\w-]*:CommonClass([A-Z0-9]{1,8})Member$/.exec(o.classId)?.[1]?.toLowerCase() ?? "")))) return [];
  const conversion = currentSource ? null : converted(source.text);
  const relation = currentSource ? currentRights(source.text)! : conversion!.text;
  let approximation: EconomicShareEvidence["approximation"];
  if (!currentSource) {
    const quote = bundle.quote.ok ? bundle.quote.value.data.rows[0] : null;
    const implied = quote && typeof quote.marketCap === "number" && typeof quote.price === "number" && quote.price > 0 ? quote.marketCap / quote.price : null;
    const matching = observed.filter(o => implied !== null && o.shares > 0 && Math.abs(implied / o.shares - 1) <= 0.01);
    const quoted = matching.length === 1 ? matching[0] : null;
    const unproven = observed.filter(o => o !== quoted);
    const affected = unproven.reduce((n, o) => n + o.shares, 0);
    if (!quoted || conversion?.to !== coverName(quoted.classId) || affected + excluded > quoted.shares * MAX_CLASS_COUNT_ERROR) return refuse(`Equal current rights or a shared per-share rate are not established for ${unproven.map(o => coverName(o.classId) ?? o.classId).join(", ")}; conversion alone cannot assign one unit to a material or unbound unquoted class. The small class must convert into the quote-bound reference class, within the aggregate nominal denominator error limit of 0.5% including voting-only exclusions.`);
    approximation = { quotedClassId: coverName(quoted.classId)!, unprovenClassIds: unproven.map(o => coverName(o.classId)!), affectedShares: affected, referenceShares: quoted.shares,
      maxFixedEquityPerShareErrorPct: affected / quoted.shares * 100,
      basis: `Small-class conversion approximation: ${unproven.map(o => coverName(o.classId)).join(", ")} contributes ${affected.toLocaleString("en-US")} assumed one-unit shares. Equal current economics are unproved. The quote-implied count identifies ${coverName(quoted.classId)} within 1%. The nominal denominator uncertainty is at most ${(affected / quoted.shares * 100).toFixed(4)}% at fixed common equity, below the 0.5% policy limit; this does not bound unknown preferential claims or changes to enterprise value or WACC.` };
  }
  const relationBasis = currentSource
    ? `Filed affirmative current economics (${source.form} ${source.accession}, filed ${source.filingDate}): "${relation}" `
    : `Filed conversion evidence (${source.form} ${source.accession}, filed ${source.filingDate}): ${relation} ${approximation!.basis} `;
  return [{ issuerId: reg.cik10, securityId: bundle.symbol, asOf, filed: latest.filingDate,
    effectiveFrom: latest.filingDate, effectiveTo: null, complete: true,
    ...(approximation ? { approximation } : {}),
    sourceHash: createHash("sha256").update(JSON.stringify({ covers, rights: source, ...(nonEconomic.length ? { nonEconomic } : {}), statement: latest.statementsText ?? latest.text, profile: bundle.profile })).digest("hex"),
    sourceIds: [...new Set([latest.documentUrl, source.documentUrl, ...allObserved.map(o => o.sourceId), ...nonEconomic.map(n => n.source.documentUrl)])],
    basis: `Filed cover counts at ${asOf} span Class ${names.map(n => n.toUpperCase()).join(" / Class ")}, ${hasStatementInventory ? "the complete class set enumerated in the same filing's balance sheet" : "the participating class set explicitly enumerated in the same filing's participation statement"}. ` +
      relationBasis +
      nonEconomic.map(n => `${n.name}: ${n.observation.shares} counted voting share(s) excluded because the ${n.source.form} ${n.source.accession} explicitly states no economic rights. `).join("") +
      `All included classes use the same-price approximation at the issuer's non-ADR common quote. Voting-price differences are not modelled.`,
    classes: observed.map((o, i) => ({ classId: classNames[i]!, shares: o.shares, countBasis: "outstanding", economicUnitsPerQuotedShare: 1, priceBasis: "economic-equivalence-proxy" })) }];
}
