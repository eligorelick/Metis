/** Negative lexical evidence only; this does not establish browser/CSS visibility. */
export type ExplicitHtmlHiddenState = "clear" | "hidden" | "unsupported";

/**
 * Inspect at most the collector's 2M-character source cap. Tags and attribute
 * values are recognized before comments/raw-text bodies, so delimiter-like
 * quoted values cannot erase real attributes. Ambiguous lexical states decline
 * proof; this is deliberately not a DOM repair or visibility implementation.
 */
export function explicitHtmlHiddenState(source: string): ExplicitHtmlHiddenState {
  if (source.length > 2_000_000) return "unsupported";
  const space = (c: string | undefined) => c !== undefined && /[\t\n\f\r ]/.test(c);
  const tagEnd = (start: number): number => {
    let quote: string | null = null;
    for (let i = start + 1; i < source.length; i++) {
      const c = source[i]!;
      if (quote !== null) { if (c === quote) quote = null; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === ">") return i;
      else if (c === "<") return -1;
    }
    return -1;
  };
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf("<", cursor);
    if (start < 0) return "clear";
    if (source.startsWith("<!--", start)) {
      const end = source.indexOf("-->", start + 4);
      if (end < 0) return "unsupported";
      cursor = end + 3;
      continue;
    }
    const end = tagEnd(start);
    if (end < 0) return "unsupported";
    if (/^<!doctype(?=[\t\n\f\r >])/i.test(source.slice(start, start + 11))) {
      cursor = end + 1;
      continue;
    }
    let at = start + 1;
    const closing = source[at] === "/";
    if (closing) at++;
    const name = /^[A-Za-z][A-Za-z0-9:._-]*/.exec(source.slice(at, end));
    if (name === null) return "unsupported";
    const tag = name[0].toLowerCase();
    at += name[0].length;
    while (at < end) {
      const separator = at;
      while (space(source[at])) at++;
      if (at === end) break;
      if (!closing && source[at] === "/" && at + 1 === end) { at++; break; }
      if (closing || at === separator) return "unsupported";
      const attributeStart = at;
      while (at < end && !/[\t\n\f\r "'<>/=]/.test(source[at]!)) at++;
      if (at === attributeStart) return "unsupported";
      const attribute = source.slice(attributeStart, at).toLowerCase();
      const afterName = at;
      while (space(source[at])) at++;
      if (source[at] === "=") {
        at++;
        while (space(source[at])) at++;
        const quote = source[at];
        if (quote === '"' || quote === "'") {
          const valueEnd = source.indexOf(quote, at + 1);
          if (valueEnd < 0 || valueEnd >= end) return "unsupported";
          at = valueEnd + 1;
        } else {
          const valueStart = at;
          while (at < end && !space(source[at])) {
            if (/["'<=`]/.test(source[at]!)) return "unsupported";
            at++;
          }
          if (at === valueStart) return "unsupported";
        }
      } else at = afterName;
      if (attribute === "hidden") return "hidden";
    }
    cursor = end + 1;
    if (!closing && (tag === "script" || tag === "style")) {
      // Raw-text end tags are syntax even inside a JS/CSS string. Their bodies
      // are never interpreted as HTML attributes or comments by this pass.
      const close = new RegExp(`</${tag}(?=[\\t\\n\\f\\r />])`, "gi");
      close.lastIndex = cursor;
      const match = close.exec(source);
      if (match === null) return "unsupported";
      cursor = match.index;
    }
  }
  return "clear";
}
