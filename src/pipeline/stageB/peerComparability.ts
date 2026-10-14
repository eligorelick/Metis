export interface PeerEconomicEvidence { businessModel: string; accountingStandard: string; periodBasis: string; periodEnd: string; priceCurrency: string; statementCurrency: string; definitions: Record<string, string>; sourceIds: string[]; availableAt: string }
interface Peer { symbol: string; economicEvidence?: PeerEconomicEvidence }
const norm = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}(?:T.*Z)?$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value.slice(0, 10);
function evidenceIssues(evidence: PeerEconomicEvidence | undefined, metric: string, asOf: string | null): string[] {
  if (!evidence) return ["missing sourced economic/accounting comparability evidence"];
  const reasons: string[] = [];
  if (!evidence.businessModel.trim() || !evidence.accountingStandard.trim() || !evidence.periodBasis.trim() || !evidence.definitions[metric]?.trim() || !evidence.sourceIds.length || evidence.sourceIds.some((id) => !id.trim())) reasons.push("missing sourced economic/accounting/metric-definition evidence");
  if (!asOf || !validDate(asOf) || !validDate(evidence.availableAt) || Date.parse(evidence.availableAt) > Date.parse(asOf) + (asOf.length === 10 ? 86_399_999 : 0)) reasons.push("comparability evidence unavailable at comparison date");
  if (!validDate(evidence.periodEnd) || Date.parse(evidence.periodEnd) > Date.parse(evidence.availableAt)) reasons.push("invalid or future economic reporting period");
  if (!/^[A-Z]{3}$/.test(evidence.priceCurrency) || ["XXX", "UNK"].includes(evidence.priceCurrency) || evidence.priceCurrency !== evidence.statementCurrency) reasons.push("peer price and financial currency are not aligned");
  return reasons;
}

/** Explicit economic and accounting definitions precede any numeric outlier trim; inputs are retained untouched. */
export function comparablePeers<T extends Peer>(subject: PeerEconomicEvidence | undefined, peers: T[], metric: string, asOf: string | null): { eligible: T[]; excluded: { symbol: string; reasons: string[] }[] } {
  const eligible: T[] = [], excluded: { symbol: string; reasons: string[] }[] = [];
  const subjectIssues = evidenceIssues(subject, metric, asOf);
  for (const peer of peers) {
    const reasons = subjectIssues.length ? subjectIssues.map((reason) => `subject: ${reason}`) : evidenceIssues(peer.economicEvidence, metric, asOf);
    const e = peer.economicEvidence;
    if (reasons.length === 0 && subject && e) {
      if (norm(e.businessModel) !== norm(subject.businessModel)) reasons.push("different business-model economics");
      if (norm(e.accountingStandard) !== norm(subject.accountingStandard)) reasons.push("different accounting standard");
      if (norm(e.periodBasis) !== norm(subject.periodBasis) || e.periodEnd.slice(0, 10) !== subject.periodEnd.slice(0, 10)) reasons.push("different reporting period basis or end");
      if (norm(e.definitions[metric]!) !== norm(subject.definitions[metric]!)) reasons.push("different earnings/cash-flow/multiple definition");
    }
    if (reasons.length) excluded.push({ symbol: peer.symbol, reasons }); else eligible.push(peer);
  }
  return { eligible, excluded };
}
