/** Shared source boundaries and structured common-class payout observations. */
export function filingSentences(text: string): string[] {
  return text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z])/).map(s => s.trim()).filter(Boolean);
}

export function isSecClassFiling(source: { form: string; accession: string; filingDate: string; documentUrl: string; primaryDocument?: string }, cik: string, cutoff: string): boolean {
  if (!source.form || !/^\d{10}-\d{2}-\d{6}$/.test(source.accession) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(source.filingDate) || source.filingDate > cutoff || !/^\d+$/.test(cik)) return false;
  if (!Number.isFinite(Date.parse(source.filingDate)) || new Date(source.filingDate).toISOString().slice(0, 10) !== source.filingDate) return false;
  try {
    const u = new URL(source.documentUrl);
    const prefix = `/Archives/edgar/data/${Number(cik)}/${source.accession.replaceAll("-", "")}/`;
    const document = u.pathname.slice(prefix.length);
    return u.protocol === "https:" && ["sec.gov", "www.sec.gov"].includes(u.hostname) && !u.port && !u.search && !u.hash && !u.username && !u.password &&
      u.pathname.startsWith(prefix) && /^[a-zA-Z0-9_.-]+\.html?$/.test(document) && (!source.primaryDocument || source.primaryDocument === document);
  } catch { return false; }
}

const classNoun = "Class ([A-Z0-9]{1,8})(?: (?:common (?:stock|shares?)|stock|shares?))?";
const money = "(?:\\$\\s*(\\d*\\.\\d+|\\d+)|(\\d+(?:\\.\\d+)?) cents)";
const canonical = (key: string): string => `class ${key.toLowerCase()} common stock`;
export const displayClassName = (name: string): string => name.replace(/^class ([a-z0-9]+) common stock$/, (_m, k: string) => `Class ${k.toUpperCase()}`).replace(/^./, c => c.toUpperCase());
export function commonClassName(classId: string): string | null {
  const key = /^[A-Za-z][\w-]*:CommonClass([A-Z0-9]{1,8})Member$/.exec(classId)?.[1];
  if (key) return canonical(key);
  const custom = /^(?!us-gaap:)[A-Za-z][\w-]*:([A-Z][A-Za-z-]{0,30})CommonStockMember$/.exec(classId)?.[1];
  return custom ? `${custom.toLowerCase()} common stock` : null;
}
interface Rate { name: string; value: number; period: string | null; sentence: string }

/** The observed inventory supplies class names, including non-lettered classes. */
function classReference(name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return escaped.replace(/ common stock$/, /^class /i.test(name)
    ? "(?: (?:common (?:stock|shares?)|stock|shares?))?" : " common (?:stock|shares?)");
}

function classListAtStart(value: string): string[] {
  const first = new RegExp(`^${classNoun}`, "i").exec(value);
  if (!first) return [];
  const names = [canonical(first[1]!)];
  let rest = value.slice(first[0].length);
  for (;;) {
    const next = new RegExp(`^(?:,? and |, | or )${classNoun}`, "i").exec(rest);
    if (!next) return names;
    names.push(canonical(next[1]!)); rest = rest.slice(next[0].length);
  }
}

function paymentPeriod(text: string): string | null {
  return /\bin ((?:[A-Za-z]+ )?(?:19|20)\d{2})\b/i.exec(text)?.[1]?.toLowerCase() ?? null;
}

/** A rate has an explicit per-share unit. Totals and par values are not rates. */
function dividendRates(sentence: string, names: readonly string[]): Rate[] {
  if (!/\b(?:dividends?|declared)\b/i.test(sentence) && !/^\$/.test(sentence)) return [];
  const payout = sentence.split(/\b(?:total(?:ing|ling)|aggregate payments)\b/i)[0]!;
  const rates: Rate[] = [];
  const add = (key: string, dollars: string | undefined, cents: string | undefined, context: string) => {
    const name = canonical(key);
    if (names.includes(name)) rates.push({ name, value: dollars ? Number(dollars) : Number(cents) / 100, period: /\bpayable\b/i.test(sentence) ? null : paymentPeriod(context), sentence });
  };
  // Unit followed by the class: "$x per share of Class A" / "$x per Class A share".
  const directed = new RegExp(`${money}\\s+per (?:share\\s+(?:of|on|for)\\s+Class ([A-Z0-9]{1,8})|Class ([A-Z0-9]{1,8}) (?:common )?share)`, "gi");
  const direct = [...payout.matchAll(directed)];
  direct.forEach((m, i) => add(m[3] ?? m[4]!, m[1], m[2], payout.slice(m.index! + m[0].length, direct[i + 1]?.index)));
  if (/^Dividends per share (?:were|are) /i.test(payout)) {
    for (const m of payout.matchAll(new RegExp(`${money} (?:for|on) Class ([A-Z0-9]{1,8})`, "gi"))) add(m[3]!, m[1], m[2], "");
  }
  // Class subject followed by its own payout predicate and explicit rate.
  const mentions = [...payout.matchAll(new RegExp(classNoun, "gi"))];
  mentions.forEach((m, i) => {
    const tail = payout.slice(m.index! + m[0].length, mentions[i + 1]?.index);
    const paid = new RegExp(`^[^$;]{0,120}?\\b(?:receives?|received|paid|dividends?|declared|was|were|is|are)\\b[^$;]{0,70}?${money}\\s+per[ -](?:common )?share\\b`, "i").exec(tail);
    if (paid && !/\bpar(?: value)?\b/i.test(paid[0])) add(m[1]!, paid[1], paid[2], tail.slice(paid.index + paid[0].length));
  });
  // A parallel list whose shared unit and "respectively" explicitly bind amounts to classes.
  const parallel = new RegExp(`dividends of \\$\\s*(\\d+(?:\\.\\d+)?) and \\$\\s*(\\d+(?:\\.\\d+)?) per share (?:were declared )?(?:on|for) (.+?), respectively[.]?$`, "i").exec(payout);
  if (parallel && !/^(?:During|For) (?:19|20)\d{2} and (?:19|20)\d{2}\b/i.test(payout)) {
    const cls = [...parallel[3]!.matchAll(new RegExp(classNoun, "gi"))];
    if (cls.length === 2) cls.forEach((m, i) => add(m[1]!, parallel[i + 1], undefined, ""));
  }
  return rates;
}

export function sharedClassDividendRate(text: string, names: readonly string[], reportDate?: string): string | null {
  const list = `(?<classes>${classNoun}(?:(?:,? and |, )${classNoun})+)`;
  const rate = `(?:a )?(?:(?:quarterly|cash) )?dividends? of ${money} per (?:common )?share`;
  const period = "(?: in (?:each quarter|(?:[A-Za-z]+ )?(?:19|20)\\d{2}))?";
  const forms = [
    new RegExp(`^(?:We|The (?:Company|board)) (?:declared|paid) ${rate} (?:on|of|for) (?:each of )?${list}${period}\\.$`, "i"),
    new RegExp(`^${rate} (?:was|were) (?:declared|paid) (?:on|of|for) (?:each of )?${list}${period}\\.$`, "i"),
    new RegExp(`^(?:Holders of )?${list} (?:each )?(?:receive|received) ${rate}${period}\\.$`, "i"),
  ];
  for (const sentence of filingSentences(text)) {
    const subject = forms.map(f => f.exec(sentence)?.groups?.classes).find(Boolean);
    if (!subject) continue;
    const classes = classListAtStart(subject);
    const years = sentence.match(/\b(?:19|20)\d{2}\b/g) ?? [];
    if (years.some(y => y !== reportDate?.slice(0, 4))) continue;
    if (names.length > 1 && classes.length === names.length && names.every(n => classes.includes(n))) return sentence;
  }
  return null;
}

/** A complete class entitlement clause, rather than arbitrary nearby words. */
function contraryEntitlement(sentence: string, names: readonly string[]): boolean {
  const refs = names.map(classReference).join("|");
  const member = `(?:${refs})`;
  const list = `${member}(?:(?:,? and |, | or )${member})*`;
  const holders = "(?:(?:The )?holders of |Each |The )?";
  const object = "(?:any |cash )?(?:dividends?|distributions?|liquidation)(?: (?:and|or) (?:dividends?|distributions?|liquidation))?(?: rights| distributions)?(?: (?:on|in) liquidation)?";
  const subset = (subject: string) => !names.every(n => new RegExp(`\\b${classReference(n)}\\b`, "i").test(subject));
  const exclusions = [
    new RegExp(`^No (?:cash )?dividends? (?:are |may be |shall be )?(?:paid|payable|declared) (?:on|to|for) (${list})\\.$`, "i"),
    new RegExp(`^Only ${holders}(${list})(?: holders)? (?:participates? in|(?:is|are) entitled to) ${object}\\.$`, "i"),
    new RegExp(`^Dividends? (?:are )?payable only on (${list})\\.$`, "i"),
    new RegExp(`^The board may declare dividends on (${list}) alone\\.$`, "i"),
    new RegExp(`^${holders}(${list})(?: holders)? (?:(?:does? not|will not) (?:receive|participate in)|(?:is|are) not entitled to|(?:has|have|carries|carry|receives|receive) no(?: rights? to)?) ${object}(?: (?:declared|paid|payable) (?:on|to|for) ${list})?\\.$`, "i"),
  ];
  if (exclusions.some(f => { const m = f.exec(sentence); return m && subset(m[1]!); })) return true;
  const verbs = "(?:receives?|earns?|has|have|possesses?|carries?|carry|(?:is|are)(?: entitled to)?|ranks?|must be|(?:will|may) receive|exceeds?|dividends? (?:is|are))";
  const clause = new RegExp(`\\b${holders}(${list})(?: (?:holders|stockholders))? (${verbs}\\b.+)\\.$`, "i").exec(sentence) ??
    new RegExp(`^(?:The |Cash )?(?:dividends?|dividend rate|distributions?) (?:paid )?(?:on|of|for) (${list}) (${verbs}\\b.+)\\.$`, "i").exec(sentence);
  if (!clause) return false;
  const predicate = clause[2]!;
  // Limit modifiers to an entitlement assertion; plans, yields and debt covenants
  // have different subjects or predicates. Status/date tails are not denials.
  if (!/\b(?:dividends?|distributions?|liquidation)\b/i.test(predicate)) return false;
  const priority = /^(?:(?:has|have|possesses?|carries?|carry) (?:a |an )?[^.]*\b(?:preferen\w*|preferred|priority|senior)\b|(?:ranks?|is|are) (?:senior|junior|subordinat\w*)\b|[^.]*\bpaid (?:before|after|first)\b|[^.]*\breceives? [^.]*\bonly after\b)/i.test(predicate);
  const ratio = /\b(?:\d+(?:\.\d+)?\s*(?:%|percent|times)|(?:one|two|three|four|five|six|seven|eight|nine|ten)(?:-[a-z]+)+|(?:one|two|three|four|five|six|seven|eight|nine|ten) times|twice|half|double|triple|for (?:each|every))(?!\w)/i.test(predicate);
  const comparative = names.filter(n => new RegExp(`\\b${classReference(n)}\\b`, "i").test(sentence)).length > 1 &&
    /\b(?:higher|lower|larger|smaller|additional|exceeds?|without)\b/i.test(predicate);
  const relatesClasses = subset(clause[1]!) || names.some(n => new RegExp(`\\b${classReference(n)}\\b`, "i").test(predicate));
  return relatesClasses && (priority || ratio || comparative);
}

/** Entitlement clauses compare class payouts or directly exclude a class.
 * A percentage elsewhere in a sentence is not an economic comparison. */
export function classEconomicContradiction(text: string, names: readonly string[], supportedRelations: readonly string[] = []): string | null {
  if (new Set(names).size < 2) return null;
  const datedRates: Rate[] = [];
  for (const sentence of filingSentences(text)) {
    if (supportedRelations.includes(sentence)) continue;
    const rates = dividendRates(sentence, names);
    const comparedRates = [...rates, ...datedRates];
    const unequal = rates.some(a => comparedRates.some(b => a.name !== b.name && a.period === b.period && a.value !== b.value));
    datedRates.push(...rates.filter(r => r.period !== null));
    const mentioned = names.filter(n => new RegExp(`\\b${classReference(n)}\\b`, "i").test(sentence));
    if (unequal || contraryEntitlement(sentence, names)) {
      const classes = [...new Set([...mentioned, ...comparedRates.map(r => r.name)])].map(displayClassName).join(" and ");
      const evidence = unequal ? [...new Set(comparedRates.filter(r => rates.some(a => a.period === r.period && a.name !== r.name && a.value !== r.value)).map(r => r.sentence).concat(sentence))].join(" ") : sentence;
      return `The one-unit assumption for ${classes} conflicts with this ${unequal ? "per-share dividend comparison" : "class-specific dividend or liquidation entitlement"}: "${evidence}"`;
    }
  }
  return null;
}

/** Denials must stand unconditionally; an attached voting-power statement may not qualify the denial. */
export function nonEconomicDenial(sentence: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const plain = new RegExp(`^(?:(?:The )?${escaped} (?:has|carries|possesses) no economic rights|There are no economic rights associated with the ${escaped})`, "i").exec(sentence);
  if (!plain) return false;
  const rest = sentence.slice(plain[0].length);
  return rest === "." || /^, and (?:in certain circumstances, )?[^.]{1,100}? (?:has|holds|could have) (?:variable )?voting (?:power|rights)[^.]*\.$/i.test(rest) && !/\b(?:until|ends?|expires?|unless|20\d{2})\b/i.test(rest);
}

export function grantsSecurityEconomics(sentence: string, name: string): boolean {
  if (nonEconomicDenial(sentence, name)) return false;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped} (?:has|carries|possesses|receives|will receive|may receive|is entitled to|participates in) (?:[^.]{0,100}? )?(?:dividends?|distributions?|economic rights|liquidation rights|participation rights)\\b`, "i").test(sentence);
}
