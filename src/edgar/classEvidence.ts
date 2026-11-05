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
const money = "(?:\\$\\s*(\\d+(?:\\.\\d+)?)|(\\d+(?:\\.\\d+)?) cents)";
const canonical = (key: string): string => `class ${key.toLowerCase()} common stock`;
const title = (name: string): string => name.replace(/^class ([a-z0-9]+) common stock$/, (_m, k: string) => `Class ${k.toUpperCase()}`);
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
  const directed = new RegExp(`${money}\\s+per (?:share\\s+(?:of|on|for)\\s+Class ([A-Z0-9]{1,8})|Class ([A-Z0-9]{1,8}) share)`, "gi");
  const direct = [...payout.matchAll(directed)];
  direct.forEach((m, i) => add(m[3] ?? m[4]!, m[1], m[2], payout.slice(m.index! + m[0].length, direct[i + 1]?.index)));
  if (/^Dividends per share (?:were|are) /i.test(payout)) {
    for (const m of payout.matchAll(new RegExp(`${money} (?:for|on) Class ([A-Z0-9]{1,8})`, "gi"))) add(m[3]!, m[1], m[2], "");
  }
  // Class subject followed by its own payout predicate and explicit rate.
  const mentions = [...payout.matchAll(new RegExp(classNoun, "gi"))];
  mentions.forEach((m, i) => {
    const tail = payout.slice(m.index! + m[0].length, mentions[i + 1]?.index);
    const paid = new RegExp(`^[^$;]{0,120}?\\b(?:receives?|received|paid|dividends?|declared)\\b[^$;]{0,70}?${money}\\s+per[ -](?:common )?share\\b`, "i").exec(tail);
    if (paid && !/\bpar(?: value)?\b/i.test(paid[0])) add(m[1]!, paid[1], paid[2], tail.slice(paid.index + paid[0].length));
  });
  // A single rate explicitly shared by the named classes.
  const units = [...payout.matchAll(new RegExp(`${money}\\s+per[ -](?:common )?share\\b`, "gi"))];
  if (!rates.length && units.length === 1 && mentions.length >= 2 && !/\bpar(?: value)?\b/i.test(payout) &&
      !/\b(?:in|for|during) (?:19|20)\d{2} and (?:19|20)\d{2}\b/i.test(payout)) {
    for (const m of mentions) add(m[1]!, units[0]![1], units[0]![2], "");
  }
  // A parallel list whose shared unit and "respectively" explicitly bind amounts to classes.
  const parallel = new RegExp(`dividends of \\$\\s*(\\d+(?:\\.\\d+)?) and \\$\\s*(\\d+(?:\\.\\d+)?) per share (?:were declared )?(?:on|for) (.+?), respectively[.]?$`, "i").exec(payout);
  if (parallel && !/^(?:During|For) (?:19|20)\d{2} and (?:19|20)\d{2}\b/i.test(payout)) {
    const cls = [...parallel[3]!.matchAll(new RegExp(classNoun, "gi"))];
    if (cls.length === 2) cls.forEach((m, i) => add(m[1]!, parallel[i + 1], undefined, ""));
  }
  return rates;
}

export function sharedClassDividendRate(text: string, names: readonly string[]): string | null {
  for (const sentence of filingSentences(text)) {
    const rates = dividendRates(sentence, names);
    if (names.length > 1 && names.every(n => rates.some(r => r.name === n)) && new Set(rates.map(r => r.value)).size === 1 && new Set(rates.map(r => r.period)).size === 1) return sentence;
  }
  return null;
}

/** Entitlement clauses compare class payouts or directly exclude a class.
 * A percentage elsewhere in a sentence is not an economic comparison. */
export function classEconomicContradiction(text: string, names: readonly string[], supportedRelations: readonly string[] = []): string | null {
  if (new Set(names).size < 2) return null;
  const datedRates: Rate[] = [];
  let previousPayoutClasses: string[] = [];
  for (const sentence of filingSentences(text)) {
    if (supportedRelations.includes(sentence)) continue;
    const rates = dividendRates(sentence, names);
    const comparedRates = [...rates, ...datedRates];
    const unequal = rates.some(a => comparedRates.some(b => a.name !== b.name && a.period === b.period && a.value !== b.value));
    datedRates.push(...rates.filter(r => r.period !== null));
    const mentioned = names.filter(n => new RegExp(`\\b${classReference(n)}\\b`, "i").test(sentence));
    const noDividendSubject = /^No dividends? (?:are |may be |shall be )?(?:paid|payable|declared) (?:on|to|for) (.+)/i.exec(sentence)?.[1];
    const excludedClasses = noDividendSubject ? classListAtStart(noDividendSubject) : [];
    const exclusion = excludedClasses.some(n => names.includes(n)) && !names.every(n => excludedClasses.includes(n)) ||
      new RegExp(`^(?:(?:The )?${classNoun} (?:does not receive|do not receive|is excluded from|has no|is not entitled to) dividends?|Dividends? (?:are )?payable only on ${classNoun}|Only ${classNoun} participates in dividends|The board may declare dividends on ${classNoun} alone)`, "i").test(sentence);
    const subject = sentence.replace(/^(?:In liquidation, |Holders of |Each )/i, "");
    const entitlement = new RegExp(`\\b(${names.map(classReference).join("|")})(?: holders)? (?:receives?|has|possesses|(?:is|are) entitled to|dividends? (?:is|are)) (.+)`, "i").exec(subject);
    const predicate = (entitlement?.[2] ?? "").replace(/^receive /i, "");
    const comparative = mentioned.length >= 2 && (
      /^(?:a (?:higher|lower|larger|smaller) dividend than|an additional dividend|(?:\d+(?:\.\d+)?|one-half|twice|half) (?:times |of |per |for each )?(?:the )?dividend|\d+(?:\.\d+)?% of)/i.test(predicate) ||
      /\b(?:than|over|for each|whenever|per each)\b[\s\S]*\bClass\b/i.test(predicate) && /\bdividends?\b/i.test(predicate) ||
      /^dividends? (?:at )?\d+(?:\.\d+)? per each dividend on Class\b/i.test(predicate) ||
      /^dividend and distribution rights equal to one-[a-z-]+(?: \(1\/\d[\d,]*\))? of (?:such|the) rights of (?:a )?Class\b/i.test(predicate) ||
      /^(?:a |an )?(?:preferential|senior|priority) (?:dividend|liquidation)/i.test(predicate) ||
      /\bdividends?\b[^.]*\bwithout\b[^.]*\bClass\b/i.test(sentence) ||
      /\bClass\b[^.]*\bpaid first\b[^.]*\bClass\b[^.]*\bresidual\b/i.test(sentence) ||
      new RegExp(`^Dividends? paid on ${classNoun} exceed dividends? paid on ${classNoun}`, "i").test(sentence));
    const linked = entitlement && /^one-half of that amount/i.test(predicate) && previousPayoutClasses.some(n => !mentioned.includes(n));
    const referencedClass = previousPayoutClasses.length >= 2 && /\bthe [a-z-]+ class (?:will )?receive(?:s)? (?:twice|half|\d+(?:\.\d+)? times) the dividends?\b/i.test(sentence);
    const specific = entitlement && /^(?:preferential|priority|senior) dividend rights/i.test(predicate);
    if (unequal || exclusion || comparative || specific || linked || referencedClass) {
      const classes = [...new Set([...mentioned, ...comparedRates.map(r => r.name), ...(linked || referencedClass ? previousPayoutClasses : [])])].map(title).join(" and ");
      const evidence = unequal ? [...new Set(comparedRates.filter(r => rates.some(a => a.period === r.period && a.name !== r.name && a.value !== r.value)).map(r => r.sentence).concat(sentence))].join(" ") : sentence;
      return `The one-unit assumption for ${classes} conflicts with this ${unequal ? "per-share dividend comparison" : "class-specific dividend or liquidation entitlement"}: "${evidence}"`;
    }
    previousPayoutClasses = mentioned;
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
