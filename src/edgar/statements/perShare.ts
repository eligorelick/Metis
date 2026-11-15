/** Fourth-quarter share identity and disclosed per-share substitutions; EPS is not additive (P1; D-64, D-105). */
import { type FmpIncomeStatementRow } from "@/providers/fmp";
import { type NoteSink } from "./resolution";
import { dateMs, DAY_MS, tidy, PER_SHARE_DECIMALS } from "./periodMath";
import { DISCONTINUED_ELEMENT_FIELDS, CONTINUING_EPS_FIELDS, CONTINUING_EPS_WORKING_FIELDS } from "./fieldSpecs";


/**
 * Build FMP-shaped annual and quarterly statements from an SEC companyfacts
 * payload. Pure and total: a payload with no usable facts yields empty row
 * lists plus one manifest gap per statement and scope, never a throw.
 */
/**
 * A fourth quarter's EPS when the issuer tagged none (10-Ks carry the year,
 * not the quarter). FY EPS − nine-month EPS is wrong whenever the share count
 * moves, so the quarter's weighted share count is backed out of the
 * day-weighted identity
 *   FY shares × FY days = Σ quarter shares × quarter days
 * from the annual count and the three tagged quarterly counts of the same
 * fiscal year, and EPS = the quarter's net income ÷ that count. Without every
 * operand the per-share figure stays withheld, with a note. Share counts
 * themselves are never written back (a derived count is not a reported one).
 */
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function deriveFourthQuarterPerShare(
  quarterly: FmpIncomeStatementRow[],
  annual: readonly FmpIncomeStatementRow[],
  notes: NoteSink,
): void {
  const dated = (row: FmpIncomeStatementRow): row is FmpIncomeStatementRow & { date: string } => typeof row.date === "string";
  const annualByDate = new Map(annual.filter(dated).map((row) => [row.date, row]));
  const pairs = [
    { eps: "eps", shares: "weightedAverageShsOut" },
    { eps: "epsDiluted", shares: "weightedAverageShsOutDil" },
  ] as const;
  for (const q4 of quarterly.filter(dated)) {
    const fy = annualByDate.get(q4.date);
    if (fy === undefined) continue;
    const fyStart = fy.fieldProvenance?.netIncome?.periodStart ?? null;
    const missing = pairs.filter((pair) => !isNum(q4[pair.eps]));
    if (missing.length === 0 || fyStart === null) continue;
    const startMs = dateMs(fyStart) - DAY_MS;
    const quarters = quarterly
      .filter(dated)
      .filter((row) => dateMs(row.date) > startMs + DAY_MS && dateMs(row.date) < dateMs(q4.date))
      .sort((x, y) => dateMs(x.date) - dateMs(y.date));
    for (const pair of missing) {
      const withhold = (why: string): void => {
        notes.add(`${pair.eps} ${q4.date}: fourth-quarter per-share figure withheld — ${why}; FY − nine-month EPS is not used because per-share amounts are not additive across share counts`);
      };
      if (pair.eps === "epsDiluted") {
        withhold("the quarter-specific diluted numerator, denominator and antidilution treatment are not established by annual/earlier-quarter weighted shares");
        continue;
      }
      const fyShares = fy[pair.shares];
      const netIncome = q4.netIncomeAvailableToCommon;
      const income = q4.fieldProvenance?.netIncomeAvailableToCommon;
      if (!isNum(fyShares) || !isNum(netIncome) || income === undefined || !/^[A-Z]{3}$/.test(income.unit)) {
        withhold(`no annual ${pair.shares} or established quarter earnings available to common`); continue;
      }
      if (quarters.length !== 3 || quarters.some((row) => !isNum(row[pair.shares]))) {
        withhold(`the three earlier quarters' tagged ${pair.shares} are not all available`);
        continue;
      }
      const fyShareProvenance = fy.fieldProvenance?.[pair.shares];
      const shareEvidence = [fyShareProvenance, ...quarters.map(row => row.fieldProvenance?.[pair.shares])];
      const lastFiling = fyShareProvenance?.filings.map(f => f.filed).sort().at(-1);
      if (!lastFiling || shareEvidence.some(p => !p || p.unit !== "shares" || p.filings.length === 0 || p.filings.some(f => f.filed > lastFiling)) ||
        fyShareProvenance?.periodStart !== fyStart || income.filings.some(f => f.filed > lastFiling)) {
        withhold("compatible share-operand provenance and filing lineage are not established"); continue;
      }
      let previousEnd = startMs;
      let weighted = 0;
      for (const row of quarters) {
        const days = (dateMs(row.date) - previousEnd) / DAY_MS;
        weighted += (row[pair.shares] as number) * days;
        previousEnd = dateMs(row.date);
      }
      const q4Days = (dateMs(q4.date) - previousEnd) / DAY_MS;
      const fyDays = (dateMs(q4.date) - startMs) / DAY_MS;
      const q4Shares = (fyShares * fyDays - weighted) / q4Days;
      if (!(q4Days > 0) || !(q4Shares > 0)) { withhold("the day-weighted share identity gives no positive fourth-quarter count"); continue; }
      const q4Start = new Date(previousEnd + DAY_MS).toISOString().slice(0, 10);
      let expectedStart = fyStart;
      let intervalsAgree = income.periodStart === q4Start && income.periodEnd === q4.date;
      for (const row of quarters) {
        const p = row.fieldProvenance?.[pair.shares];
        intervalsAgree &&= p?.periodStart === expectedStart && p?.periodEnd === row.date;
        expectedStart = new Date(dateMs(row.date) + DAY_MS).toISOString().slice(0, 10);
      }
      if (!intervalsAgree) { withhold("common earnings and weighted-share intervals do not establish consecutive compatible quarters"); continue; }
      (q4 as Record<string, unknown>)[pair.eps] = tidy(netIncome / q4Shares, PER_SHARE_DECIMALS);
      if (income !== undefined && q4.fieldProvenance !== undefined) {
        const operands = [income, ...shareEvidence.flatMap(p => p ? [p] : [])];
        q4.fieldProvenance[pair.eps] = {
          ...income,
          unit: `${income.unit}/shares`,
          tags: [...new Set(operands.flatMap(p => p.tags))],
          filings: [...new Map(operands.flatMap(p => p.filings).map((f) => [`${f.accn}|${f.filed}`, f])).values()],
          derivation: "fy-share-identity",
        };
      }
      notes.add(`${pair.eps} ${q4.date}: Q4 net income ÷ a Q4 weighted share count of ${Math.round(q4Shares)} backed out of the day-weighted FY identity (FY − nine-month EPS is not additive)`);
    }
  }
}

/* D-105: Use basic shares for an absent diluted count only with the substitution disclosed. */
const BASIC_SHARES_FOR_DILUTED_DISCLOSURE =
  "no diluted weighted share count is tagged for the period, and the filer's basic and diluted EPS are equal for it; the basic weighted count is the diluted stand-in, so dilution too small to move EPS at its reported rounding is not reflected";
// In a loss from continuing operations, ASC 260's control number, every
// potential share is antidilutive and excluded, so the diluted count is the
// basic count by definition (ASC 260-10-45-18 to 45-20). Net EPS alone does
// not show that when a discontinued result is filed.
const BASIC_SHARES_FOR_DILUTED_LOSS_DISCLOSURE =
  "no diluted weighted share count is tagged for the period, and the filer's basic and diluted EPS are equal for it; it is a loss period for continuing operations, in which potential shares are antidilutive and excluded, so the basic weighted count is the diluted count";

/**
 * D-105: If no diluted weighted count is tagged but filed basic and diluted EPS are equal for the
 * basic-count interval, the basic count may stand in with a disclosure. Both EPS figures must be
 * reported rather than derived; any uncertainty leaves the diluted count null.
 */
function standInDilutedSharesFromBasic(rows: FmpIncomeStatementRow[], notes: NoteSink): void {
  for (const row of rows) {
    if (typeof row.date !== "string" || row.weightedAverageShsOutDil != null) continue;
    const basic = row.weightedAverageShsOut;
    const provenance = row.fieldProvenance;
    const shares = provenance?.weightedAverageShsOut;
    const eps = provenance?.eps;
    const epsDiluted = provenance?.epsDiluted;
    if (!isNum(basic) || !(basic > 0) || !isNum(row.eps) || !isNum(row.epsDiluted) || row.eps !== row.epsDiluted) continue;
    if (provenance === undefined || shares === undefined || eps === undefined || epsDiluted === undefined) continue;
    const sameInterval = [eps, epsDiluted].every((p) => p.derivation === undefined && p.periodStart === shares.periodStart && p.periodEnd === shares.periodEnd);
    if (shares.derivation !== undefined || !sameInterval) continue;
    row.weightedAverageShsOutDil = basic;
    provenance.weightedAverageShsOutDil = {
      ...shares,
      tags: [...new Set([...shares.tags, ...eps.tags, ...epsDiluted.tags])],
      filings: [...new Map([...shares.filings, ...eps.filings, ...epsDiluted.filings].map((f) => [`${f.accn}|${f.filed}`, f])).values()],
      calculation: "basic-shares-equal-eps",
    };
    const continuing = row.netIncomeFromContinuingOperations;
    const discontinued = row.netIncomeFromDiscontinuedOperations;
    const continuingLoss = isNum(continuing) ? continuing < 0 : (!isNum(discontinued) || discontinued === 0) && row.eps < 0;
    const disclosure = continuingLoss ? BASIC_SHARES_FOR_DILUTED_LOSS_DISCLOSURE : BASIC_SHARES_FOR_DILUTED_DISCLOSURE;
    notes.substitute("weightedAverageShsOutDil", row.date, disclosure);
    notes.add(`weightedAverageShsOutDil ${row.date}: ${disclosure}`);
  }
}

/* D-112: Disclose when continuing-operations EPS stands in for the missing net-income EPS line. */
const CONTINUING_EPS_DISCLOSURE =
  "no net-income EPS is tagged for the period; the filer's EPS from continuing operations stands in, and with no discontinued result filed for the period the two are equal (ASC 260-10-45-3)";

/* D-112: Serve continuing-operations EPS only with its scope and any discontinued result disclosed. */
function standInEpsFromContinuingOperations(rows: FmpIncomeStatementRow[], notes: NoteSink): void {
  const discontinuedFields: string[] = ["netIncomeFromDiscontinuedOperations", ...DISCONTINUED_ELEMENT_FIELDS.map((element) => element.field)];
  for (const row of rows) {
    const record = row as unknown as Record<string, unknown>;
    const noDiscontinued = discontinuedFields.every((field) => {
      const v = record[field];
      return (v === null || v === undefined || v === 0) && !notes.withheld.some((held) => held.field === field && typeof row.date === "string" && held.periods.includes(row.date));
    });
    for (const target of ["eps", "epsDiluted"] as const) {
      const source = CONTINUING_EPS_FIELDS[target];
      const value = record[source];
      const provenance = row.fieldProvenance?.[source];
      if (typeof row.date === "string" && record[target] == null && noDiscontinued && isNum(value) && provenance !== undefined && provenance.derivation === undefined) {
        record[target] = value;
        row.fieldProvenance![target] = provenance;
        const original = (record.original as Record<string, unknown> | undefined)?.[source];
        if (original !== undefined) (record.original as Record<string, unknown>)[target] = original;
        notes.substitute(target, row.date, CONTINUING_EPS_DISCLOSURE);
        notes.add(`${target} ${row.date}: ${CONTINUING_EPS_DISCLOSURE}`);
      }
    }
    const original = record.original as Record<string, unknown> | undefined;
    for (const field of CONTINUING_EPS_WORKING_FIELDS) {
      delete record[field];
      if (row.fieldProvenance !== undefined) delete row.fieldProvenance[field];
      if (original !== undefined) delete original[field];
    }
    if (original !== undefined && Object.keys(original).length === 0) delete record.original;
  }
  for (const list of [notes.withheld, notes.substitutions]) {
    for (let i = list.length - 1; i >= 0; i--) if (CONTINUING_EPS_WORKING_FIELDS.has(list[i]!.field)) list.splice(i, 1);
  }
  for (let i = notes.notes.length - 1; i >= 0; i--) {
    if (CONTINUING_EPS_WORKING_FIELDS.has(notes.notes[i]!.split(" ", 1)[0]!)) notes.notes.splice(i, 1);
  }
}
export { isNum, standInEpsFromContinuingOperations, deriveFourthQuarterPerShare, standInDilutedSharesFromBasic };
