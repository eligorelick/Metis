import type { WaccOperatingEvidence } from "./stageB/returns";
import { sameIncomeScope as sameBasis } from "@/edgar/revenuePresentation";
import { corroborateOperatingIncome, operatingDerivationRefusal, operatingMarginRefusal, operatingRevenuePolicy, replayIncomeObservations, retainedIncomeRows } from "@/edgar/revenueAdmission";
import { parseOperatingRevenueBridge } from "@/edgar/currentReports";
import { applyPrimaryIncome, bindPrimaryIncome, contradictedOperatingTag, primaryPerimeterChange } from "@/edgar/primaryIncome";
import type { DataBundle } from "./types";
import type { FmpIncomeStatementRow } from "@/providers/fmp";
import { confirmedIssuerFacts } from "@/edgar/issuerFacts";
import { buildStatementsFromCompanyFacts } from "@/edgar/statements";
import { vendorAgreesWithDerived, vendorAgreesWithFiled } from "@/edgar/vendorAgreement";
import { sectorIndustryForSic } from "@/edgar/sic";
import { successorContinuity } from "@/edgar/successor";
import { conceptFactsSchema, parseFactPoints, type CompanyFacts } from "@/edgar/xbrl";
import { predecessorFactsFor } from "@/pipeline/stageB/debtLikeObligations";
import { enrichIncomeClassification } from "@/edgar/incomeClassification";
import { withFilerShareUnits } from "./shareUnits";

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
/** Continuity must be evidenced at the snapshot cutoff, like the amounts it admits. */
function factsAtCutoff(facts: CompanyFacts, day: string): CompanyFacts {
  return { ...facts, facts: Object.fromEntries(Object.entries(facts.facts).map(([namespace, concepts]) => [namespace,
    Object.fromEntries(Object.entries(concepts).map(([tag, raw]) => {
      const parsed = conceptFactsSchema.safeParse(raw);
      return [tag, parsed.success ? { ...parsed.data, units: Object.fromEntries(Object.entries(parsed.data.units).map(([unit, ps]) =>
        [unit, parseFactPoints(ps).filter(p =>
          /^\d{4}-\d{2}-\d{2}$/.test(p.filed) && Number.isFinite(Date.parse(p.filed)) && p.filed <= day)])) } : raw];
    }))] )) };
}
/** A retained statement's sales line is admitted only after every other-income
 * component reconciles and its total independently matches the SEC duration. */
function retainedSalesEvidence(bundle: DataBundle, rows: FmpIncomeStatementRow[], facts: CompanyFacts): FmpIncomeStatementRow[] {
  const cutoff = bundle.builtAt.slice(0,10);
  const documents: { text: string; accession: string; filed: string; form: string; url: string }[] = [];
  const additionalPrimary: typeof documents = [];
  for (const member of [bundle.edgar.tenKNotes, bundle.edgar.tenQNotes]) {
    if (member?.ok && member.value.source === "edgar" && Date.parse(member.value.fetchedAt) <= Date.parse(bundle.builtAt)) {
      const d = member.value.data;
      if ((d.statementsText || d.text) && d.accession && d.filingDate && d.documentUrl) documents.push({ text: d.statementsText || d.text,
        accession: d.accession, filed: d.filingDate, form: d.form ?? "", url: d.documentUrl });
      if (d.text && d.text !== d.statementsText && d.accession && d.filingDate && d.documentUrl) additionalPrimary.push({ text: d.text,
        accession: d.accession, filed: d.filingDate, form: d.form ?? "", url: d.documentUrl });
    }
  }
  const current = bundle.edgar.currentReports;
  if (current?.ok && current.value.source === "edgar" && Date.parse(current.value.fetchedAt) <= Date.parse(bundle.builtAt)) {
    for (const r of current.value.data.releases) {
      if (!r.accession || !r.filingDate || !r.form) continue;
      if (r.commentaryNarrative && r.commentaryUrl) documents.push({ text: r.commentaryNarrative, accession: r.accession, filed: r.filingDate, form: r.form, url: r.commentaryUrl });
      if (r.releaseNarrative && r.releaseUrl) documents.push({ text: r.releaseNarrative, accession: r.accession, filed: r.filingDate, form: r.form, url: r.releaseUrl });
    }
  }
  const observations = documents.filter(d => d.filed <= cutoff && Number(/\/edgar\/data\/(\d+)\//.exec(d.url)?.[1]) === facts.cik)
    .flatMap(d => parseOperatingRevenueBridge(d.text).map(f => ({ ...f, document: { accession: d.accession, filed: d.filed, form: d.form, url: d.url } })));
  const primary = [...documents,...additionalPrimary].flatMap(d => bindPrimaryIncome(d,facts,cutoff,bundle.builtAt));
  const contradicted=contradictedOperatingTag(primary,facts,cutoff);
  const perimeter=primaryPerimeterChange(primary,facts);
  return rows.map(original => {
    let row = applyPrimaryIncome(original,primary);
    if(contradicted && !row.primaryIncomeProof && (row.fieldProvenance?.operatingIncome?.tags.includes("us-gaap/OperatingIncomeLoss") || row.filedIncomeLines?.OperatingIncomeLoss)) row={...row,operatingTagScopeUnresolved:true};
    if(perimeter && (row.primaryIncomeProof?.proof.documents?.[0]?.filed ?? row.fieldProvenance?.revenue?.filings.map(f=>f.filed).sort().at(-1) ?? "") < perimeter.filed) row={...row,operatingPerimeterRefusal:perimeter.reason};
    const proof = row.fieldProvenance?.revenue;
    if (!proof || proof.unit !== "USD" || !finite(row.revenue)) return row;
    const days = proof.periodStart ? (Date.parse(proof.periodEnd) - Date.parse(proof.periodStart)) / 86400000 : 0;
    const months = days >= 300 ? 12 : days >= 60 && days <= 100 ? 3 : null;
    const matches = observations.filter(f => f.currency === proof.unit && f.periodEnd === row.date && f.months === months && vendorAgreesWithFiled(f.total, row.revenue!));
    if (!matches.length || !matches.every(f => f.sales === matches[0]!.sales)) return row;
    const sales = matches[0]!.sales;
    const documents = matches.map(f => f.document);
    return { ...row, filedIncomeLines: { ...row.filedIncomeLines, "operating-sales": { value: sales, role: "operating-sales",
      proof: { ...proof, calculation: "filed-sales-line", documents } } } };
  });
}

/** Revenue admission cannot revoke an operating figure that was already
 * usable on its own source row. Pre-existing mixed-source refusals stay closed. */
function priorOperatingUsable(row: FmpIncomeStatementRow | undefined): row is FmpIncomeStatementRow & {operatingIncome:number} {
  if (!row || !finite(row.operatingIncome) || row.fieldConflicts?.operatingIncome?.usable === false) return false;
  if(operatingDerivationRefusal(row,row.fieldProvenance?.operatingIncome)) return false;
  const revenue = row.fieldProvenance?.revenue, operating = row.fieldProvenance?.operatingIncome;
  return row.fieldConflicts?.revenue?.usable === false || !finite(row.revenue) ||
    !revenue && !operating || sameBasis(revenue, operating);
}

type OperatingRow = { revenue?: number | null; operatingIncome?: number | null;
  nonMarginOperatingIncome?: number | null; operatingIncomeBasis?: string; fieldConflicts?: FmpIncomeStatementRow["fieldConflicts"] };
/** Interest coverage, EBITDA, ROIC and multiples do not divide by revenue. */
export function operatingIncomeForNonMargins(row: OperatingRow | null | undefined): number | null {
  if (!row) return null;
  if (row.fieldConflicts?.operatingIncome?.cause === "operating-scope") return null;
  return finite(row.operatingIncome) && row.fieldConflicts?.operatingIncome?.usable !== false ? row.operatingIncome
    : row.nonMarginOperatingIncome ?? null;
}
/** Typed provenance for the actual selected numerator; no warning-text inference. */
export function operatingIncomeEvidenceForNonMargins(row: FmpIncomeStatementRow | null | undefined, standalone = false): WaccOperatingEvidence | undefined {
  if (!row) return undefined;
  const field = standalone ? "waccOperatingIncome" : "operatingIncome";
  const evidence = row.fieldProvenance?.[field];
  if (!evidence) return undefined;
  const filed = evidence.tags.includes("us-gaap/OperatingIncomeLoss") || evidence.calculation === "complete-operating-reconciliation";
  return { status: filed ? "filed-or-reconciled" : "unverified-derivation", asOf: row.date ?? null,
    field: `statements.income.${row.date}.${field}`, usedInDiscountRate: false };
}
/** Select both operands together. A separately usable numerator alone never
 * makes a margin on the row's newly admitted, differently scoped revenue. */
export function operatingMarginBasis(row: OperatingRow | null | undefined): { revenue: number | null; operatingIncome: number | null; basis?: string } {
  if (!row) return { revenue: null, operatingIncome: null };
  return { revenue: finite(row.revenue) && row.fieldConflicts?.revenue?.usable !== false ? row.revenue : null,
    operatingIncome: finite(row.operatingIncome) && row.fieldConflicts?.operatingIncome?.usable !== false ? row.operatingIncome : null,
    basis: row.operatingIncomeBasis };

}

/** Calculation view only, including replay of bundles frozen before admission existed. */
export function withIncomeOperatingBasis(bundle: DataBundle): DataBundle {
  if (!bundle.statements?.incomeAnnual || !bundle.statements.incomeQuarterly) return bundle;
  const facts = confirmedIssuerFacts(bundle.symbol, bundle.edgar);
  const bankRevenue = bundle.edgar.sic === "6211" || sectorIndustryForSic(bundle.edgar.sic ?? null).industry?.toLowerCase().startsWith("banks") === true;
  const acquired = bundle.edgar?.companyFacts?.ok ? bundle.edgar.companyFacts.value.fetchedAt : null;
  const built = facts && acquired && Number.isFinite(Date.parse(acquired)) && Date.parse(acquired) <= Date.parse(bundle.builtAt)
    ? buildStatementsFromCompanyFacts(facts, { symbol: bundle.symbol, cik: String(facts.cik), asOf: bundle.builtAt.slice(0, 10), factsObservedAt: acquired,
      annualPeriods: 40, quarterlyPeriods: 80, bankRevenue,
      vendorSplits: { status: "unavailable", source: "operating-basis", reason: "Additive operating amounts only; no per-share inference" } }) : null;
  const filed = built && facts ? { ...built,
    incomeAnnual: { ...built.incomeAnnual, rows: retainedSalesEvidence(bundle, built.incomeAnnual.rows, facts) },
    incomeQuarterly: { ...built.incomeQuarterly, rows: retainedSalesEvidence(bundle, built.incomeQuarterly.rows, facts) } } : null;
  const revenuePolicy = facts && filed ? operatingRevenuePolicy([...filed.incomeAnnual.rows,...filed.incomeQuarterly.rows]) : undefined;
  const gaps = [...(bundle.gaps ?? [])];
  const predecessor = bundle.edgar?.predecessor;
  const observed = (at: string | null | undefined) => typeof at === "string" && Number.isFinite(Date.parse(at)) && Date.parse(at) <= Date.parse(bundle.builtAt);
  const predecessorEvidence = facts && predecessor && /^\d{10}$/.test(predecessor.cik10) && Number(predecessor.cik10) === predecessor.facts.cik &&
    observed(acquired) && observed(predecessor.fetchedAt) && observed(predecessor.via.filed) &&
    predecessor.via.accession !== "" && predecessor.via.successorFormAccession !== "" &&
    successorContinuity(factsAtCutoff(facts, bundle.builtAt.slice(0, 10)), factsAtCutoff(predecessor.facts, bundle.builtAt.slice(0, 10))) !== null
    ? { facts: predecessor.facts, cik10: predecessor.cik10, continuity: true } : null;
  const predecessorAnnual = predecessorEvidence && predecessor
    ? buildStatementsFromCompanyFacts(predecessorEvidence.facts, { symbol: bundle.symbol, cik: predecessor.cik10,
      asOf: bundle.builtAt.slice(0, 10), factsObservedAt: predecessor.fetchedAt, annualPeriods: 40, quarterlyPeriods: 0,
      vendorSplits: { status: "unavailable", source: "annual-nci-predecessor", reason: "Additive annual ownership key only; no per-share inference" } }).incomeAnnual.rows : [];
  const family = (name: "incomeAnnual" | "incomeQuarterly") => {
    let input = bundle.statements[name];
    if (!input.ok) return input;
    if (facts && !bankRevenue && input.value.source === "fmp") input = {...input,value:{...input.value,data:replayIncomeObservations(input.value.data,facts.cik,facts,bundle.builtAt.slice(0,10))}};
    const previousRows = input.value.data.rows;
    const candidates = name === "incomeAnnual" ? filed?.incomeAnnual.rows : filed?.incomeQuarterly.rows;
    if (facts && candidates) {
      const admission = enrichIncomeClassification(input, facts, name === "incomeAnnual" ? "annual" : "quarter", bundle.builtAt,
        { earningsOnly: true, bankRevenue, revenuePolicy, securitiesRevenue: bundle.edgar.sic === "6211", filedRows: candidates });
      input = admission.income;
      gaps.push(...admission.gaps);
    }
    if (!input.ok) return input;
    const rows = input.value.data.rows.map(row => {
      let out: FmpIncomeStatementRow = row;
      const prior = previousRows.find(r => r.date === row.date && r.reportedCurrency === row.reportedCurrency && r.filingDate === row.filingDate);
      const preservePrior = priorOperatingUsable(prior);
      const sec = candidates?.find(r => r.date === row.date && r.reportedCurrency === row.reportedCurrency &&
        (row.cik == null || Number(row.cik) === facts?.cik));
      if(sec?.operatingPerimeterRefusal) {
        out={...out,operatingPerimeterRefusal:sec.operatingPerimeterRefusal};
        gaps.push({field:`statements.income.${row.date}.operatingPerimeter`,severity:"warn",reason:sec.operatingPerimeterRefusal});
      }
      const revenue = sec?.fieldProvenance?.revenue, operating = sec?.fieldProvenance?.operatingIncome;
      const standaloneRefusal=sec ? operatingDerivationRefusal(sec,operating) : null;
      const matches = sec && finite(row.revenue) && finite(sec.revenue) && vendorAgreesWithFiled(row.revenue, sec.revenue) &&
        row.fieldConflicts?.revenue?.usable !== false && (row.periodStart == null || row.periodStart === revenue?.periodStart) &&
        (row.filingDate == null || revenue?.filings.some(f => f.filed === row.filingDate));
      if (name === "incomeAnnual" && matches && finite(sec.operatingIncome) && !operating?.tags.includes("us-gaap/OperatingIncomeLoss") && sameBasis(revenue, operating) &&
          !standaloneRefusal &&
          row.fieldConflicts?.operatingIncome?.usable !== false && sec.fieldConflicts?.operatingIncome?.usable !== false) {
        out = { ...out, waccOperatingIncome: sec.operatingIncome,
          fieldProvenance: { ...out.fieldProvenance, waccOperatingIncome: operating! } };
        if(operating?.calculation!=="complete-operating-reconciliation") gaps.push({field:`statements.income.${row.date}.waccOperatingIncome`,severity:"info",
          reason:`Standalone WACC operating operand ${sec.operatingIncome} ${operating!.unit} is derived from filed pretax/nonoperating operands with unverified consolidated operating scope; it is not a directly filed operating result. ${operating!.tags.join(", ")}; ${operating!.filings.map(f=>f.accn).join(", ")}.`});
      }
      const retainedWaccRefusal=operatingDerivationRefusal(out,out.fieldProvenance?.waccOperatingIncome);
      if(standaloneRefusal || retainedWaccRefusal) {
        out={...out,waccOperatingIncome:undefined};
        gaps.push({field:`statements.income.${row.date}.waccOperatingIncome`,severity:"warn",reason:standaloneRefusal ?? retainedWaccRefusal!});
      }
      // Recover the annual E-5 fallback without rebuilding quarterly ownership
      // history for consumers whose valuation already had an annual key.
      // Fresh SEC extraction still reads every synonym on both period bases.
      const priorNci = name === "incomeAnnual" && predecessorEvidence && row.cik != null && Number(row.cik) === Number(predecessorEvidence.cik10) &&
        predecessorFactsFor(facts, predecessorEvidence, row.date ?? null, row.reportedCurrency ?? null, bundle.builtAt) !== null
        ? predecessorAnnual.find(r => r.date === row.date && r.reportedCurrency === row.reportedCurrency) : undefined;
      const ownership = sec ?? priorNci;
      const nci = ownership?.fieldProvenance?.netIncomeAttributableToNoncontrollingInterest;
      if (name === "incomeAnnual" && ownership && nci && finite(ownership.netIncomeAttributableToNoncontrollingInterest) &&
          (row.netIncomeAttributableToNoncontrollingInterest == null ||
            row.netIncomeAttributableToNoncontrollingInterest === 0 && row.fieldProvenance?.netIncomeAttributableToNoncontrollingInterest === undefined) &&
          row.fieldConflicts?.netIncomeAttributableToNoncontrollingInterest?.usable !== false &&
          ownership.fieldConflicts?.netIncomeAttributableToNoncontrollingInterest?.usable !== false &&
          (row.periodStart == null || row.periodStart === nci.periodStart) &&
          (row.filingDate == null || nci.filings.some(f => f.filed === row.filingDate))) {
        out = { ...out, netIncomeAttributableToNoncontrollingInterest: ownership.netIncomeAttributableToNoncontrollingInterest,
          fieldProvenance: { ...out.fieldProvenance, netIncomeAttributableToNoncontrollingInterest: nci } };
        gaps.push({ field: `statements.income.${row.date}.netIncomeAttributableToNoncontrollingInterest`, severity: "info", expected: true,
          reason: `Missing noncontrolling-interest income completed from the same-period core SEC filing${ownership === priorNci ? ` of predecessor CIK ${predecessorEvidence!.cik10} (existing successor continuity established)` : ""}: ${ownership.netIncomeAttributableToNoncontrollingInterest} ${nci.unit}; ${nci.tags.join(", ")}; ${nci.filings.map(f => f.accn).join(", ")}.` });
      }
      const consolidated = ownership?.fieldProvenance?.netIncomeConsolidated;
      if (name === "incomeAnnual" && ownership && finite(ownership.netIncomeConsolidated) && sameBasis(nci, consolidated) && out.netIncomeConsolidated == null &&
          out.fieldConflicts?.netIncomeConsolidated?.usable !== false &&
          out.fieldProvenance?.netIncomeAttributableToNoncontrollingInterest === nci) {
        out = { ...out, netIncomeConsolidated: ownership.netIncomeConsolidated,
          fieldProvenance: { ...out.fieldProvenance, netIncomeConsolidated: consolidated! } };
      }
      const raw = retainedIncomeRows(input.value.data, row, facts?.cik ?? Number(row.cik));
      if (sec && (out.fieldProvenance?.revenue || sec.operatingTagScopeUnresolved)) out = corroborateOperatingIncome(out, sec);
      if (out.operatingIncomeBasis && out.operatingIncomeBasis !== row.operatingIncomeBasis) gaps.push({
        field: `statements.income.${row.date}.operatingIncome`, severity: "info",
        reason: finite(out.operatingIncome) ? `Operating income admitted on the corroborated operating-revenue basis. ${out.operatingIncomeBasis}` : out.operatingIncomeBasis });
      if (out.fieldConflicts?.operatingIncome?.usable === false) out = { ...out, operatingIncome: undefined };
      if (!finite(out.operatingIncome) && out.nonMarginOperatingIncome === undefined &&
          out.fieldConflicts?.operatingIncome?.cause === "operating-basis" && preservePrior) {
        out = { ...out, nonMarginOperatingIncome: prior.operatingIncome };
      }
      const revProof = out.fieldProvenance?.revenue, opProof = out.fieldProvenance?.operatingIncome;
      const revSource = revProof?.source ?? out.source ?? input.value.source;
      const opSource = opProof?.source ?? out.source ?? input.value.source;
      const mixed = revSource !== opSource || (revProof !== undefined || opProof !== undefined) && !sameBasis(revProof, opProof);
      const retainedAgrees = opProof === undefined && raw.length > 0 && raw.every(r => finite(r.revenue) && finite(out.revenue) && vendorAgreesWithFiled(r.revenue, out.revenue) &&
        r.operatingIncome === out.operatingIncome) && out.fieldConflicts?.revenue?.resolution === "filed-line";
      const derivedAgrees = matches && finite(out.operatingIncome) && finite(sec?.operatingIncome) && sameBasis(revenue, operating) &&
        sec?.fieldConflicts?.operatingIncome?.usable !== false && vendorAgreesWithDerived(out.operatingIncome, sec.operatingIncome, [sec.operatingIncome]);
      const corroborated = out.fieldConflicts?.operatingIncome?.cause === "operating-basis" && out.fieldConflicts.operatingIncome.usable;
      if (mixed && derivedAgrees && out.fieldConflicts?.operatingIncome?.usable !== false) {
        gaps.push({field:`statements.income.${row.date}.operatingIncome`,severity:"info",reason:"Operating income admitted: the provider result agrees with the same-period filed EBIT bridge."});
      }
      // A checked result can use an eligible older corroboration of the same
      // admitted revenue. A newer revenue filing does not undo that bridge.
      if (mixed && finite(out.operatingIncome) && !retainedAgrees && !derivedAgrees && !corroborated) {
        const reason = operatingMarginRefusal(out);
        out = { ...out, operatingIncome: undefined, operatingIncomeRatio: undefined,
          nonMarginOperatingIncome: out.nonMarginOperatingIncome ?? (preservePrior ? prior.operatingIncome : undefined),
          operatingIncomeBasis: reason,
          fieldConflicts: { ...out.fieldConflicts, operatingIncome: { usable: false, cause: "operating-basis", vendorValue: row.operatingIncome ?? null, secValue: null, reason } } };
        gaps.push({ field: `statements.income.${row.date}.operatingIncome`, reason, severity: "info" });
      }
      // Restoring a provider observation cannot bypass the new-basis review
      // when the filing supplies no comparable numerator or revenue proof.
      if (out.operatingBasisReview && finite(out.operatingIncome) && out.fieldConflicts?.operatingIncome?.usable !== false &&
          !corroborated) {
        const reason=operatingMarginRefusal(out);
        out={...out,nonMarginOperatingIncome:out.nonMarginOperatingIncome ?? (preservePrior ? prior.operatingIncome : undefined),
          operatingIncome:undefined,operatingIncomeRatio:undefined,operatingIncomeBasis:reason,
          fieldConflicts:{...out.fieldConflicts,operatingIncome:{usable:false,cause:"operating-basis",vendorValue:out.operatingIncome,secValue:null,reason}}};
      }
      const expense = out.fieldProvenance?.operatingExpenses;
      const filedTotal = expense?.tags.includes("us-gaap/OperatingExpenses") === true && sameBasis(out.fieldProvenance?.revenue, expense);
      // Integration review (R2): a provider amount that bridges its own row's
      // gross profit to the (admitted) operating income is a complete total on
      // that row's operating basis. On the owner's saved real-data snapshots it
      // does for 31 of 34 QCOM, 33 of 34 NVDA and 33 of 34 AMZN rows; FIGR's
      // Q1 2026 does not once the filed operating income replaces the
      // provider's pre-interest numerator.
      const providerRow = (out.source ?? input.value.source) !== "edgar" && expense === undefined;
      const bridgeable = providerRow && finite(out.operatingExpenses) && finite(out.grossProfit) && finite(out.operatingIncome) &&
        out.fieldConflicts?.grossProfit?.usable !== false;
      const bridges = bridgeable && vendorAgreesWithDerived(out.operatingIncome as number, (out.grossProfit as number) - (out.operatingExpenses as number),
        [out.grossProfit as number, out.operatingExpenses as number]);
      if (finite(out.operatingExpenses) && !filedTotal && !bridges) {
        const reason = bridgeable
          ? `Operating expenses for ${row.date} withheld: the provider amount does not bridge gross profit to operating income on the admitted operating basis.`
          : `Operating expenses for ${row.date} withheld: a complete operating-expense total on the revenue's filed basis is not established; vendor expense subsets and revenue minus operating income do not establish this subtotal.`;
        out = { ...out, operatingExpenses: undefined, fieldConflicts: { ...out.fieldConflicts,
          operatingExpenses: { usable: false, vendorValue: row.operatingExpenses ?? null, secValue: null, reason } } };
        gaps.push({ field: `statements.income.${row.date}.operatingExpenses`, severity: "info", reason });
      }
      return out;
    });
    return { ...input, value: { ...input.value, data: { ...input.value.data, rows } } };
  };
  const admitted = { ...bundle, statements: { ...bundle.statements, incomeAnnual: family("incomeAnnual"), incomeQuarterly: family("incomeQuarterly") }, gaps };
  // Monetary admission can establish a missing period start after the first
  // share pass skipped an ambiguous interval. Resolve those deferred shares,
  // then recheck direct EPS only in families whose rows actually changed.
  const shares = facts && filed ? withFilerShareUnits(admitted) : admitted;
  const finalGaps = [...shares.gaps];
  const finishPerShare = (name: "incomeAnnual" | "incomeQuarterly") => {
    const input = shares.statements[name], prior = admitted.statements[name];
    if (!facts || !filed || !input.ok || !prior.ok || input.value.data.rows.every((row, i) => row === prior.value.data.rows[i])) return input;
    const result = enrichIncomeClassification(input, facts, name === "incomeAnnual" ? "annual" : "quarter", bundle.builtAt,
      { earningsOnly: true, bankRevenue, revenuePolicy, securitiesRevenue: bundle.edgar.sic === "6211",
        filedRows: name === "incomeAnnual" ? filed.incomeAnnual.rows : filed.incomeQuarterly.rows });
    finalGaps.push(...result.gaps);
    return result.income;
  };
  return { ...shares, statements: { ...shares.statements, incomeAnnual: finishPerShare("incomeAnnual"), incomeQuarterly: finishPerShare("incomeQuarterly") }, gaps: finalGaps };
}
