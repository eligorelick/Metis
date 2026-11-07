import { confirmedIssuerFacts } from "@/edgar/issuerFacts";
import { conceptFactsSchema, factPointSchema } from "@/edgar/xbrl";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import { shareBasisFactor } from "@/edgar/splits";
import type { DataBundle } from "./types";
import type { StatementFieldProvenance } from "@/providers/fmp";

const FIELDS = ["eps", "epsDiluted", "weightedAverageShsOut", "weightedAverageShsOutDil"] as const;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const day = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

/** Immutable exact-quarter admission from a complete furnished consolidated
 * statement. Retain source conflicts; never infer diluted shares from annual
 * averages, restore a split/unit refusal, or translate an ADR denominator. */
export function withReleaseQuarterEarnings(bundle: DataBundle): DataBundle {
  const edgar = bundle.edgar, reports = edgar?.currentReports, identity = edgar?.cik;
  const splitBasis = edgar?.shareBasis;
  const profile = bundle.profile?.ok ? bundle.profile.value.data.rows[0] : null;
  const input = bundle.statements?.incomeQuarterly;
  if (!input?.ok || !reports?.ok || !splitBasis || reports.value.source !== "edgar" || !identity?.ok || identity.value.source !== "edgar" ||
      profile?.isAdr !== false || identity.value.data.ticker.toUpperCase() !== bundle.symbol.toUpperCase() ||
      edgar.registrant?.cik10 !== identity.value.data.cik10 || edgar.registrant.tickers.length !== 1 || edgar.registrant.tickers[0]?.toUpperCase() !== bundle.symbol.toUpperCase() ||
      !Number.isFinite(Date.parse(reports.value.fetchedAt)) || Date.parse(reports.value.fetchedAt) > Date.parse(bundle.builtAt)) return bundle;
  const cik = identity.value.data.cik;
  if (!Number.isSafeInteger(cik) || cik <= 0 || String(cik).padStart(10, "0") !== identity.value.data.cik10) return bundle;
  const releases = [...reports.value.data.releases].sort((a, b) => b.filingDate.localeCompare(a.filingDate));
  if (!releases.some(release => release.quarterlyEarnings?.length)) return bundle;
  const issuerFacts = confirmedIssuerFacts(bundle.symbol, edgar), factsResult = edgar.companyFacts;
  if (!issuerFacts || !factsResult.ok || !Number.isFinite(Date.parse(factsResult.value.fetchedAt)) ||
      Date.parse(factsResult.value.fetchedAt) > Date.parse(bundle.builtAt)) return bundle;
  // Reuse canonical monetary quarter construction, including compatible FY/YTD
  // subtraction. A dollar glyph alone establishes neither USD nor an interval.
  const monetaryRows = buildStatementsFromCompanyFacts(issuerFacts, { symbol: bundle.symbol, cik: identity.value.data.cik10,
    asOf: bundle.builtAt.slice(0, 10), factsObservedAt: factsResult.value.fetchedAt, annualPeriods: 5, quarterlyPeriods: 20,
    vendorSplits: { status: "unavailable", source: "release-quarter-monetary-proof", reason: "Only monetary period/currency evidence is used" },
  }).incomeQuarterly.rows;
  const gaps = [...bundle.gaps];
  const rows = input.value.data.rows.map(row => {
    if (Number(row.cik) !== cik || !day(row.date) || !/^[A-Z]{3}$/.test(row.reportedCurrency ?? "") ||
        !finite(row.netIncome) || !/^Q[1-4]$/.test(row.period ?? "") || FIELDS.some(field => row.fieldConflicts?.[field]?.usable === false)) return row;
    const monetary = monetaryRows.filter(candidate => candidate.date === row.date);
    if (monetary.length !== 1) return row;
    const proof = monetary[0]!.fieldProvenance?.netIncome;
    if (!proof || !day(proof.periodStart) || proof.periodEnd !== row.date ||
        !["USD", "CAD", "AUD", "NZD", "HKD", "SGD"].includes(proof.unit) || proof.unit !== row.reportedCurrency ||
        (Date.parse(row.date) - Date.parse(proof.periodStart)) / 86400000 < 70 ||
        (Date.parse(row.date) - Date.parse(proof.periodStart)) / 86400000 > 135 ||
        row.periodStart != null && row.periodStart !== proof.periodStart ||
        !finite(monetary[0]!.netIncome) || Math.abs(monetary[0]!.netIncome! - row.netIncome) > Math.max(1, Math.abs(row.netIncome) * 0.001)) return row;
    const sourceCurrencies = new Set<string>();
    for (const tag of proof.tags) {
      const [namespace, conceptName] = tag.split("/");
      const concept = conceptFactsSchema.safeParse(issuerFacts.facts[namespace!]?.[conceptName!]);
      if (!concept.success) return row;
      for (const [unit, points] of Object.entries(concept.data.units)) {
        if (!/^[A-Z]{3}$/.test(unit)) continue;
        if (points.some(raw => {
          const point = factPointSchema.safeParse(raw);
          return point.success && point.data.end === row.date && proof.filings.some(filing =>
            filing.accn === point.data.accn && filing.filed === point.data.filed && filing.form === point.data.form);
        })) sourceCurrencies.add(unit);
      }
    }
    if (sourceCurrencies.size !== 1 || !sourceCurrencies.has(proof.unit)) return row;
    for (const release of releases) {
      const facts = (release.quarterlyEarnings ?? []).filter(f => f.periodEnd === row.date && f.months === 3);
      if (!facts.length) continue;
      if (facts.length !== 1) return row;
      const fact = facts[0]!, source = fact.source;
      if (!source) return row;
      const expectedPrefix = `https://www.sec.gov/Archives/edgar/data/${cik}/${release.accession.replaceAll("-", "")}/`;
      if (!day(source.filingDate) || source.filingDate !== release.filingDate || source.filingDate > bundle.builtAt.slice(0, 10) || source.filingDate <= row.date ||
          source.form !== "8-K" || source.accession !== release.accession || !/^\d{10}-\d{2}-\d{6}$/.test(source.accession) ||
          source.exhibit !== "EX-99.1" || source.url !== release.releaseUrl || !source.url?.startsWith(expectedPrefix) ||
          !/^[a-zA-Z0-9_.-]+\.html?$/.test(source.url.slice(expectedPrefix.length)) || fact.symbol !== "$" ||
          !finite(fact.netIncome) || Math.abs(fact.netIncome - row.netIncome) > Math.max(1, Math.abs(row.netIncome) * 0.001) ||
          FIELDS.some(field => !finite(fact[field]) || row.fieldProvenance?.[field]?.filings.some(f => f.filed > source.filingDate)) ||
          fact.weightedAverageShsOut <= 0 || fact.weightedAverageShsOutDil < fact.weightedAverageShsOut) return row;
      // These are statement averages on the release's filing basis, not a
      // point-in-time count measured at period end. Require complete coverage
      // and an unchanged basis; do not infer timing from a split context date.
      const basis = shareBasisFactor(splitBasis.splits, source.filingDate, null, splitBasis.basisDay);
      if ("withheld" in basis || basis.factor !== 1) return row;
      const out = { ...row, fieldConflicts: { ...row.fieldConflicts }, fieldProvenance: { ...row.fieldProvenance } };
      for (const field of FIELDS) {
        const evidence: StatementFieldProvenance = { source: "edgar", unit: field.startsWith("eps") ? `${row.reportedCurrency}/shares` : "shares",
          periodStart: proof.periodStart, periodEnd: row.date, observedAt: reports.value.fetchedAt, tags: [`release/consolidated-three-month-${field}`, ...proof.tags.map(tag => `currency-period/${tag}`)],
          filings: [{ accn: source.accession, filed: source.filingDate, form: source.form }, ...proof.filings] };
        if (row[field] !== fact[field]) {
          const prior = row.fieldConflicts?.[field];
          const reason = `Exact three-month consolidated GAAP ${field} for ${row.date} follows ${source.form} ${source.accession} ${source.exhibit}, filed ${source.filingDate} (${source.url}); vendor ${row[field] ?? "unavailable"}, filed ${fact[field]}. Currency ${proof.unit} and interval ${proof.periodStart} through ${proof.periodEnd} are corroborated by SEC monetary facts (${proof.filings.map(f => f.accn).join(", ")}). Direct quarterly shares and EPS are used; annual averages and adjusted denominators are not substituted.${prior ? ` Prior admission retained: vendor ${prior.vendorValue ?? "unavailable"}, SEC ${prior.secValue ?? "unavailable"}, resolution ${prior.resolution ?? "unspecified"}; ${prior.reason}${prior.secEvidence ? `; evidence ${JSON.stringify(prior.secEvidence)}` : ""}` : ""}`;
          out.fieldConflicts[field] = { vendorValue: prior ? prior.vendorValue : finite(row[field]) ? row[field] : null, secValue: fact[field], usable: true, resolution: "filed-line", reason, secEvidence: evidence };
          gaps.push({ field: `statements.income.${row.date}.${field}.releaseReconciliation`, reason, severity: "info", expected: true });
        }
        out[field] = fact[field]; out.fieldProvenance[field] = evidence;
      }
      return out;
    }
    return row;
  });
  return { ...bundle, statements: { ...bundle.statements, incomeQuarterly: { ...input, value: { ...input.value, data: { ...input.value.data, rows } } } }, gaps };
}
