import { createHash } from "node:crypto";
import { identicalClassRights } from "@/edgar/economicShares";
import type { DataBundle } from "@/pipeline/types";
import type { EconomicShareEvidence } from "@/pipeline/stageB/securityBasis";

const labelPattern = "(?:Class [A-Z0-9]{1,8}|[A-Z][A-Z-]{0,30}) common stock";
const labels = (text: string): string[] => [...text.matchAll(new RegExp(`\\b(${labelPattern})\\b`, "gi"))].map(m => m[1]!.toLowerCase());
const contraryLabels = (text: string): string[] => [...labels(text), ...[...text.matchAll(/\b(Class [A-Z0-9]{1,8}) (?:common )?shares?\b/gi)].map(m => `${m[1]!.toLowerCase()} common stock`)];
const validDay = (v: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const dated = (text: string): string | null => {
  const ms = Date.parse(`${text} UTC`);
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : null;
};

/**
 * N2: a deliberately narrow alternative to the inline cover layouts.
 * A primary balance sheet explicitly counts every equally participating class
 * at its report date, in unscaled shares; the SAME filing states their current
 * identical dividend/liquidation rights. Names, voting rights and conversion
 * options alone prove nothing. The provider title binds the quote class; it is
 * retained as provider evidence, never described as a filed symbol/title row.
 */
export function retainedClassEconomicEvidence(bundle: DataBundle): EconomicShareEvidence[] {
  const original = retainedStatementEconomicEvidence(bundle);
  return original.length ? original : retainedEqualCoverEvidence(bundle);
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
  try {
    const url = new URL(d.documentUrl);
    if (url.protocol !== "https:" || !["sec.gov", "www.sec.gov"].includes(url.hostname) || url.port || url.search || url.hash || url.username || url.password ||
      !new RegExp(`^/Archives/edgar/data/${Number(registrant.cik10)}/${d.accession.replaceAll("-", "")}/[a-zA-Z0-9_.-]+\\.html?$`).test(url.pathname)) return existing;
  } catch { return existing; }
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
  const memberLabel = (member: string): string | null => {
    const standard = /^us-gaap:CommonClass([A-Z0-9]{1,8})Member$/.exec(member);
    if (standard) return `class ${standard[1]!.toLowerCase()} common stock`;
    const custom = /^(?!us-gaap:)[A-Za-z][\w-]*:([A-Z][A-Za-z-]{0,30})CommonStockMember$/.exec(member);
    return custom ? `${custom[1]!.toLowerCase()} common stock` : null;
  };
  if (!cover.length && inventories.some(s => s.classes.some(o => o.asOf > d.reportDate))) return existing;
  let asOf = d.reportDate;
  let counts: number[] = [];
  if (cover.length) {
    const observations = inventories.flatMap(s => s.observations ?? []);
    const mapped = observations.map(o => memberLabel(o.classId));
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
  const sentences = d.text.split(/(?<=\.)\s+(?=[A-Z])/).map(s => s.trim());
  const relation = sentences.find(s => {
    const related = identicalClassRights(s);
    return related && related.length === names.length && names.every(n => related.includes(n));
  });
  if (!relation || sentences.some(s => s !== relation && contraryLabels(s).some(n => names.includes(n)) && /\b(?:dividends?|distributions?|liquidation)\b/i.test(s) &&
    /\b(?:different|unequal|not equal|not identical|preferen\w*|priority|senior|subordinat\w*|not entitled|non-?participating|times|twice|half|percent|greater|less than|equal to)\b|\d\s?%|\b\d+\/\d+\b/i.test(s))) return existing;
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
function retainedEqualCoverEvidence(bundle: DataBundle): EconomicShareEvidence[] {
  const profile = bundle.profile.ok ? bundle.profile.value.data.rows[0] : null;
  const reg = bundle.edgar.registrant, cutoff = bundle.builtAt.slice(0, 10);
  if (!profile || !reg || profile.isAdr !== false || profile.symbol !== bundle.symbol ||
    !/^\d{10}$/.test(reg.cik10) || Number(profile.cik) !== Number(reg.cik10) ||
    !reg.tickers.includes(bundle.symbol) || !validDay(cutoff) || bundle.edgar.shareBasis?.splits.unresolved.length) return [];
  const primary = (d: { form: string; accession: string; filingDate: string; documentUrl: string }) => {
    if (!/^(?:10-K|10-Q)(?:\/A)?$/.test(d.form) || !validDay(d.filingDate) || d.filingDate > cutoff || !/^\d{10}-\d{2}-\d{6}$/.test(d.accession)) return false;
    try {
      const u = new URL(d.documentUrl);
      return u.protocol === "https:" && ["sec.gov", "www.sec.gov"].includes(u.hostname) && !u.port && !u.search && !u.hash && !u.username && !u.password &&
        new RegExp(`^/Archives/edgar/data/${Number(reg.cik10)}/${d.accession.replaceAll("-", "")}/[a-zA-Z0-9_.-]+\\.html?$`).test(u.pathname);
    } catch { return false; }
  };
  const notes = [bundle.edgar.tenQNotes, bundle.edgar.tenKNotes].flatMap(m => m?.ok && m.value.source === "edgar" ? [m.value.data] : [])
    .filter(d => primary(d) && validDay(d.reportDate) && d.reportDate <= d.filingDate).sort((a, b) => b.filingDate.localeCompare(a.filingDate));
  const latest = notes[0];
  if (!latest || [bundle.edgar.latestTenK, bundle.edgar.latestTenQ].some(m => m?.ok && m.value.data.filingDate <= cutoff && m.value.data.filingDate > latest.filingDate)) return [];
  const inventories = (bundle.edgar.economicShareInventory ?? []).filter(i => i.source.filingDate <= cutoff);
  if (inventories.some(i => i.source.filingDate > latest.filingDate || i.source.filingDate === latest.filingDate &&
    (i.source.accession !== latest.accession || i.source.documentUrl !== latest.documentUrl))) return [];
  const covers = inventories.filter(i => i.source.accession === latest.accession && i.source.documentUrl === latest.documentUrl && i.source.filingDate === latest.filingDate);
  if (covers.length !== 1 || !primary(covers[0]!.source) || !covers[0]!.source.hash) return [];
  const observed = covers[0]!.observations ?? [];
  const names = observed.map(o => /^us-gaap:CommonClass([A-Z0-9]{1,8})Member$/.exec(o.classId)?.[1]?.toLowerCase() ?? "");
  const asOf = observed[0]?.asOf;
  if (!asOf || !validDay(asOf) || asOf < latest.reportDate || asOf > latest.filingDate || names.length < 2 ||
    names.some(n => !n) || new Set(names).size !== names.length || observed.some(o => o.asOf !== asOf || !o.contextId ||
      !Number.isSafeInteger(o.shares) || o.shares < 0 || !o.sourceId.startsWith(latest.documentUrl + "#"))) return [];
  if (covers[0]!.classes.some(c => !observed.some(o => c.classId === o.classId && c.asOf === o.asOf && c.shares === o.shares)) ||
    bundle.edgar.shareBasis?.splits.events.some(e => e.date > asOf && e.date <= cutoff)) return [];
  // Explicit balance-sheet rows establish the complete class set. Flattened
  // statements may scale these counts; only unscaled inline cover facts count.
  const statementNames = (d: typeof latest): string[] => {
    const s = d.statementsText ?? d.text;
    const section = /\bcommon stock at stated value:\s*([\s\S]*?)\bcapital in excess/i.exec(s)?.[1] ?? "";
    return [...section.matchAll(/\bClass ([A-Z0-9]{1,8})(?: convertible)?\s*[\u2014\u2013-][^;]{0,160}?shares outstanding/gi)].map(m => m[1]!.toLowerCase());
  };
  const sameSet = (ns: string[]) => ns.length === names.length && new Set(ns).size === names.length && names.every(n => ns.includes(n));
  if (!sameSet(statementNames(latest))) return [];
  const classNames = names.map(n => `class ${n} common stock`);
  const sentences = (text: string) => text.split(/(?<=\.)\s+(?=[A-Z])/).map(s => s.trim());
  const equal = (s: string) => {
    const ns = identicalClassRights(s);
    return ns !== null && ns.length === classNames.length && classNames.every(n => ns.includes(n));
  };
  const source = notes.find(d => Date.parse(latest.filingDate) - Date.parse(d.filingDate) <= 400 * 86_400_000 &&
    sentences(d.text).some(equal));
  if (!source) return [];
  // Existing full-sentence equality cannot be qualified by a later contrary
  // entitlement. Omission alone neither changes rights nor removes a class.
  const relevant = notes.filter(d => d.filingDate >= source.filingDate);
  if (relevant.some(d => sentences(d.text).some(s => !equal(s) && /\bClass [A-Z0-9]{1,8}\b/i.test(s) &&
    /\b(?:dividends?|distributions?|liquidation|participation)\b/i.test(s) &&
    /\b(?:different|differ|unequal|not equal|not identical|preferen\w*|priority|senior|subordinat\w*|not entitled|non-?participating|times|twice|half|percent|greater|less than|equal to)\b|\d\s?%|\b\d+\/\d+\b/i.test(s)))) return [];
  const annualInventory = inventories.find(i => i.source.accession === source.accession && i.source.documentUrl === source.documentUrl);
  if (source !== latest && (!annualInventory || !primary(annualInventory.source) || !sameSet((annualInventory.observations ?? []).map(o =>
    /^us-gaap:CommonClass([A-Z0-9]{1,8})Member$/.exec(o.classId)?.[1]?.toLowerCase() ?? "")))) return [];
  const relation = sentences(source.text).find(equal)!;
  return [{ issuerId: reg.cik10, securityId: bundle.symbol, asOf, filed: latest.filingDate,
    effectiveFrom: latest.filingDate, effectiveTo: null, complete: true,
    sourceHash: createHash("sha256").update(JSON.stringify({ covers, rights: source, statement: latest.statementsText ?? latest.text, profile: bundle.profile })).digest("hex"),
    sourceIds: [...new Set([latest.documentUrl, source.documentUrl, ...observed.map(o => o.sourceId)])],
    basis: `Filed cover counts at ${asOf} span the same complete Class ${names.map(n => n.toUpperCase()).join(" / Class ")} balance-sheet inventory. ` +
      `Filed equal economics (${source.form} ${source.accession}, filed ${source.filingDate}): "${relation}" ` +
      `The quoted class is not identified; every equally participating class uses the same-price approximation at the issuer's non-ADR common quote. Voting-price differences are not modelled.`,
    classes: observed.map((o, i) => ({ classId: classNames[i]!, shares: o.shares, countBasis: "outstanding", economicUnitsPerQuotedShare: 1, priceBasis: "economic-equivalence-proxy" })) }];
}
