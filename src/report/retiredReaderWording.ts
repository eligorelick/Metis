/**
 * D-296 (P20, P21, P22): the read-time view of reader text that earlier code
 * wrote with internal names. A saved report keeps its bytes, and a replay can
 * carry gap reasons its retained run inputs recorded at fetch time (for example
 * "filled with the D-98 chain"), so the producers' current wording cannot reach
 * them. This view rewrites only the exact retired phrases the producers used to
 * write: the API-key reason, decision ids in rule parentheticals, the net-debt
 * method label, raw field names in fixed basis formulas and retired setting
 * names. It touches strings only; no number, date, flag or key changes.
 */
import type { Report } from "@/report/schema";

const NO_AI = "this report was built without an AI connection, so no AI analysis ran";

/** [retired phrase, current words], applied in order to every string. */
const RETIRED_PHRASES: readonly (readonly [RegExp, string])[] = [
  [/\(ANTHROPIC_API_KEY not configured\)/g, `(${NO_AI})`],
  [/— ANTHROPIC_API_KEY not configured\./g, `— ${NO_AI}.`],
  [/^ANTHROPIC_API_KEY not configured$/g, "This report was built without an AI connection, so no AI analysis ran."],
  [/ANTHROPIC_API_KEY not configured/g, "This report was built without an AI connection, so no AI analysis ran."],
  [/none \(no ANTHROPIC_API_KEY\)/g, "none (no AI connection)"],
  [/\bNET_DEBT_V\d+: /g, "house net-debt basis: "],
  [/ \(NET_DEBT_V\d+; /g, " ("],
  [/the D-60 net cash the DCF bridge and the key-data EV use; house rule D-65/g, "the one net cash the DCF bridge and the key-data EV use; house rule"],
  [/\(house rule D-135, FIN-304\)/g, "(house rule)"],
  [/; house rule, decisions D-135 OD-1\)/g, "; house rule)"],
  [/; D-98, D-58\)/g, ")"],
  [/the D-98 chain/g, "the filed noncurrent-investment tag chain"],
  [/ and the D-98 gain test \(/g, " and the gain test ("],
  [/([Hh])ouse rule D-\d{1,3}([:;)])/g, "$1ouse rule$2"],
  [/, house rule D-\d{1,3}\)/g, ", house rule)"],
  [/\(house convention, D-\d{1,3}\)/g, "(house convention)"],
  [/\(ASC 842; D-25\)/g, "(ASC 842)"],
  [/\(lease-excluded basis, D-25\)/g, "(lease-excluded basis)"],
  [/leaves debt \(D-25\), /g, "leaves debt, "],
  [/ \(P13, D-237\)/g, ""],
  [/, D-237\)/g, ")"],
  [/\(D-61, graded\)/g, "(graded)"],
  [/ \(D-60 disclosure\)/g, ""],
  [/ \(D-57, amended by D-124\)/g, ""],
  [/ \(D-80, applied to provider rows by D-127\)/g, ""],
  [/\(display correction, D-124, D-125, D-127\)/g, "(display correction)"],
  [/ \(D-(?:11|25|46|57|58|60|61|65|80|125|261|267|285)\)/g, ""],
  [/totalDebt \+ consolidated equity \[totalEquity\]/g, "total debt + consolidated equity [total equity]"],
  [/consolidated equity \[totalStockholdersEquity \(NCI undisclosed\)\]/g, "consolidated equity [parent stockholders' equity (NCI undisclosed)]"],
  [/consolidated equity \[totalStockholdersEquity \+ minorityInterest\]/g, "consolidated equity [parent stockholders' equity + noncontrolling interest]"],
  [/totalDebt \+ consolidated equity \[/g, "total debt + consolidated equity ["],
  [/ - cashAndShortTermInvestments - longTermInvestments /g, " - cash and short-term investments - long-term investments "],
  [/ - cashAndShortTermInvestments, /g, " - cash and short-term investments, "],
  [/ \+ temporaryEquity /g, " + temporary equity "],
  [/Retained totalDebt operand /g, "Retained total-debt operand "],
  [/retained totalDebt basis/g, "retained total-debt basis"],
  [/EBITDA computed as operatingIncome \+ cash-flow D&A/g, "EBITDA computed as operating income + cash-flow D&A"],
  [/vendor ebitda field used \(own operatingIncome \+ D&A not computable\)/g, "vendor EBITDA used (own operating income + D&A not computable)"],
  [/vendor ebitda field used \(/g, "vendor EBITDA used ("],
  [/incomeTaxExpense \/ incomeBeforeTax/g, "income tax expense / pre-tax income"],
  [/TTM incomeTaxExpense \//g, "TTM income tax expense /"],
  [/; totalDebt (-?[\d.]+), cashAndShortTermInvestments /g, "; total debt $1, cash and short-term investments "],
  [/derived from cash \+ shortTermInvestments/g, "derived from cash + short-term investments"],
  [/price \/ epsDiluted/g, "price / diluted EPS"],
  [/ordinary epsDiluted x /g, "ordinary diluted EPS x "],
  [/EV \/ \(operatingIncome \+ D&A\)/g, "EV / (operating income + D&A)"],
  [/ — vendor ebitda field not trusted\./g, " — the vendor EBITDA field is not used."],
  [/marketCap \/ \(operatingCashFlow \+ capitalExpenditure\)/g, "market cap / (operating cash flow + capital expenditure)"],
  [/; FMP capex negative\)/g, "; the provider records capex as negative)"],
  [/marketCap \/ /g, "market cap / "],
  [/goodwill - intangibleAssets\)/g, "goodwill - intangible assets)"],
  [/ and intangibleAssets (-?[\d.]+|unavailable) /g, " and intangible assets $1 "],
  [/THESIS_EV_INCLUDE_LEASES=1/g, "METIS_EV_INCLUDE_LEASES=1"],
  [/THESIS_STATEMENT_SOURCE=/g, "METIS_STATEMENT_SOURCE="],
  [/THESIS_JUDGE_ORDER=/g, "METIS_JUDGE_ORDER="],
];

/** One string with every retired phrase in its current words. */
export function retiredReaderWording(text: string): string {
  let out = text;
  for (const [pattern, words] of RETIRED_PHRASES) out = out.replace(pattern, words);
  return out;
}

/**
 * Gap entries a retained bundle recorded at fetch time, with their reasons in current words. Every reader of
 * `bundle.gaps` that prints or de-duplicates them (Stage B, the payload, the report manifest) uses this one view,
 * so a retained gap and its Stage B copy stay one entry.
 */
export function withRetiredGapWording<T extends { reason: string }>(gaps: readonly T[]): T[] {
  return gaps.map((gap) => ({ ...gap, reason: retiredReaderWording(gap.reason) }));
}

function rewrite(value: unknown): unknown {
  if (typeof value === "string") return retiredReaderWording(value);
  if (Array.isArray(value)) return value.map(rewrite);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, rewrite(nested)]));
}

/** The report with retired reader phrases in current words; the input is not changed. */
export function withRetiredReaderWording(report: Report): Report {
  return rewrite(report) as Report;
}
