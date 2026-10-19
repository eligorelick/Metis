import type { ReportAuditTable } from "@/report/auditTables";
import { formatFinancialValue, formatNumber, formatPct } from "@/report/format";
import type { FilingRef } from "@/report/schema";

/**
 * The optional D-66 disclosure contract. Kept structural so the presentation
 * changes can also be validated against the preceding stored-report schema.
 */
export interface FilingSupplements {
  currency: string | null;
  filingFacts?: Array<{
    key?: string;
    label: string; value: number; unit: "currency" | "days" | "shares" | "count" | "percent";
    asOf: string | null; period: string | null; qualifier: string | null;
    computed: string | null; source: FilingRef; text: string;
  }>;
  commentaryOutlook?: Array<{ topic: string; text: string; source: FilingRef }>;
  officerChanges?: Array<{
    kind: "departure" | "appointment"; person: string; role: string; board: boolean;
    announced: string | null; effective: string | null; anticipated: boolean; inEffect: boolean;
    agreedDate?: string; completionStatus?: "unconfirmed";
    note: string | null; package: Array<{ component: string; value: number }>; source: FilingRef;
  }>;
  sayOnPay?: {
    meetingDate: string | null; approved: boolean; votesFor: number; votesAgainst: number;
    abstentions: number; brokerNonVotes: number | null; supportPct: number; source: FilingRef;
  };
  tradingArrangements?: Array<{
    person: string; role: string; action: "adoption" | "modification" | "termination";
    date: string; shares: number | null; includesFutureAwards: boolean; expires: string | null; source: FilingRef;
  }>;
}

const sourceText = (ref: FilingRef): string => `${ref.form}${ref.exhibit ? ` ${ref.exhibit}` : ""} filed ${ref.filingDate} (${ref.accession})`;
const count = (value: number): string => formatNumber(value, 0);

/** Filing facts retain their distinct periods, qualifications and derivations. */
export function filingFactTables(d: FilingSupplements): ReportAuditTable[] {
  if (!d.filingFacts?.length) return [];
  const groups = [
    { prefix: "composition-sbc-", heading: "SBC composition: separately reported expense and capitalization", note: "Each row retains the nonadditivity and unavailable current-service-cost qualification; these amounts do not change FCF." },
    { prefix: "composition-cash-", heading: "Cash composition: restrictions and reported combined balance", note: "Each balance retains its own date and primary filing. A combined balance including restrictions is not available liquidity." },
    { prefix: "composition-working-capital-", heading: "Working capital: identified standard cash-flow components (partial)", note: "Identified signed components and any partial subtotal do not establish complete working capital or a normalized cash-flow estimate." },
    { prefix: "composition-tax-", heading: "Income-tax balances: gross receivable and current payable", note: "Separate gross balances do not establish receivable maturity, an occupancy-tax pair or legal netting." },
    { prefix: "", heading: "Filing notes: customer, investment and transaction disclosures", note: "Each row retains its own period and issuer qualification. Customer shares, investment balances, commitments, financing capacity and transaction consideration describe different exposures; they are not additive. Reported customers are unnamed: matching positions across periods do not establish common identities. Separately stated indirect-customer and payment-term context does not identify those counterparties as the reported direct customers." },
  ];
  return groups.flatMap(group => {
    const facts = d.filingFacts!.filter(f => group.prefix === "" ? !f.key?.startsWith("composition-") : f.key?.startsWith(group.prefix));
    if (facts.length === 0) return [];
    return [{
      heading: group.heading,
      headers: ["Disclosure", "Value as stated", "Period / as of", "Basis / issuer context", "Source"],
      rows: facts.map((f) => {
        const amount = f.unit === "currency" ? formatFinancialValue(f.value, "currency", d.currency)
          : f.unit === "percent" ? formatPct(f.value)
            : `${formatNumber(f.value, Number.isInteger(f.value) ? 0 : 1)}${f.unit === "days" ? " days" : f.unit === "shares" ? " shares" : ""}`;
        return [f.label, `${f.qualifier ? `${f.qualifier} ` : ""}${amount}`, [f.period, f.asOf ? `as of ${f.asOf}` : null].filter(Boolean).join("; ") || "Not recorded",
          [f.computed ? `Derived: ${f.computed}.` : null, f.text].filter(Boolean).join(" "), sourceText(f.source)];
      }),
      note: group.note,
    }];
  });
}

/** Management's stated outlook remains an issuer expectation. */
export function filingCommentaryOutlookTables(d: FilingSupplements): ReportAuditTable[] {
  if (!d.commentaryOutlook?.length) return [];
  return [{ heading: "Management commentary outlook", headers: ["Topic", "Issuer expectation", "Source"],
    rows: d.commentaryOutlook.map((r) => [r.topic, r.text, sourceText(r.source)]),
    note: "Statements of management expectation, not realized results or model assumptions." }];
}

/** Governance records render independently of the optional analyst summaries. */
export function filingGovernanceTables(d: FilingSupplements): ReportAuditTable[] {
  const tables: ReportAuditTable[] = [];
  if (d.officerChanges?.length) {
    const showAgreement = d.officerChanges.some(r => r.agreedDate !== undefined);
    tables.push({ heading: "Officer and director changes disclosed in filings", headers: ["Person / role", "Change", "Public announcement", ...(showAgreement ? ["Agreement date"] : []), "Effective timing stated in filing", "Terms / context", "Source"],
      rows: d.officerChanges.map((r) => [
        `${r.person} — ${r.role}${r.board ? " (board)" : ""}`, r.kind === "departure" ? "Departure" : "Appointment", r.announced ?? "Not recorded",
        ...(showAgreement ? [r.agreedDate ?? "Not recorded"] : []),
        `${r.anticipated ? "Anticipated" : "Scheduled"} ${r.effective ?? "date not recorded"}; specified by filing; ${r.effective !== null && r.inEffect ? "date elapsed; " : ""}completion unconfirmed`,
        [r.note, ...r.package.map((p) => `${p.component}: ${formatFinancialValue(p.value, "currency", d.currency)}`)].filter(Boolean).join("; ") || "Not recorded", sourceText(r.source),
      ]), note: "Agreement, public announcement and filing dates are distinct. Effective timing is the date specified by the filing; the elapsed-date flag is a calendar comparison only. Elapsed time alone does not confirm a departure or appointment." });
  }
  if (d.sayOnPay) {
    const r = d.sayOnPay;
    tables.push({ heading: "Advisory vote on executive compensation", headers: ["Meeting", "Result", "For", "Against", "Abstentions", "Broker non-votes", "Support", "Source"],
      rows: [[r.meetingDate ?? "Not recorded", r.approved ? "Approved" : "Not approved", count(r.votesFor), count(r.votesAgainst), count(r.abstentions), r.brokerNonVotes === null ? "Not recorded" : count(r.brokerNonVotes), formatPct(r.supportPct), sourceText(r.source)]],
      note: "Support is votes for divided by votes for, against and abstaining; broker non-votes are excluded. This advisory vote does not assess an individual officer's execution." });
  }
  if (d.tradingArrangements?.length) {
    const actions = { adoption: "Adopted", modification: "Modified", termination: "Terminated" } as const;
    tables.push({ heading: "Rule 10b5-1 trading arrangements", headers: ["Person / role", "Action", "Date", "Plan shares", "Expiration", "Source"],
      rows: d.tradingArrangements.map((r) => [`${r.person} — ${r.role}`, actions[r.action], r.date,
        `${r.shares === null ? "Count not stated" : count(r.shares)}${r.includesFutureAwards ? "; includes future awards" : ""}`, r.expires ?? "Not recorded", sourceText(r.source)]),
      note: "Plan capacity is not an executed sale. An adoption, modification or termination alone does not establish discretionary insider sentiment; actual transactions require separate filings." });
  }
  return tables;
}
