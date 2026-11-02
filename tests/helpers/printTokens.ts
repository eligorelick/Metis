/** R3 token spans control wrapping; semantic text assertions keep checking their original content. */
export function withoutPrintTokens(html: string): string {
  return html.replace(/<span class="print-token">([^<]*)<\/span>/g, "$1");
}
