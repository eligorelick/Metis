/** Tokenize an attribute list; quoted contents cannot supply other attributes.
 * Malformed lists and duplicate names have no trustworthy attribute values. */
export function geographyAttributes(source: string): Map<string, string> | null {
  const attrs = new Map<string, string>();
  let at = 0;
  while (at < source.length) {
    const before = at;
    while (/\s/.test(source[at] ?? "") && at < source.length) at++;
    if (at === source.length || (source[at] === "/" && at === source.length - 1)) break;
    if (at === before && at !== 0) return null;
    const name = /^[A-Za-z_:][\w:.-]*/.exec(source.slice(at));
    if (!name) return null;
    const key = name[0].toLowerCase();
    if (attrs.has(key)) return null;
    at += name[0].length;
    const afterName = at;
    while (/\s/.test(source[at] ?? "") && at < source.length) at++;
    let value = "";
    if (source[at] === "=") {
      at++;
      while (/\s/.test(source[at] ?? "") && at < source.length) at++;
      const quote = source[at];
      if (quote === '"' || quote === "'") {
        const end = source.indexOf(quote, at + 1);
        if (end < 0) return null;
        value = source.slice(at + 1, end);
        at = end + 1;
      } else {
        const token = /^[^\s"'<>`=]+/.exec(source.slice(at));
        if (!token) return null;
        value = token[0];
        at += token[0].length;
      }
    } else at = afterName;
    attrs.set(key, value);
  }
  return attrs;
}

export const geographyAttribute = (source: string, name: string): string | null => geographyAttributes(source)?.get(name.toLowerCase()) ?? null;

/** These table readers support dot-decimal monetary values only. A displayed
 * number cannot override an explicit nil or a different iXBRL transformation. */
export function geographyNumber(source: string, printed: string): number | null {
  const attrs = geographyAttributes(source);
  if (!attrs || ![undefined, "ixt:num-dot-decimal", "ixt:numdotdecimal"].includes(attrs.get("format")) ||
    ![undefined, "false", "0"].includes(attrs.get("xsi:nil")) ||
    !/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(printed)) return null;
  const value = Number(printed.replaceAll(",", ""));
  return Number.isFinite(value) ? value : null;
}

/** Total-revenue concepts only; e.g. remaining performance obligations are
 * monetary and duration-scoped too, but do not measure recognized revenue. */
const REVENUE_CONCEPTS = new Set([
    "us-gaap:Revenues", "us-gaap:SalesRevenueNet",
    "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax",
    "us-gaap:RevenueFromContractWithCustomerIncludingAssessedTax",
]);
export function geographyRevenueConcept(name: string | null): boolean {
  return name !== null && REVENUE_CONCEPTS.has(name);
}
