import type { ReportAuditTable } from "@/report/auditTables";
import { formatFinancialValue, formatNumber, formatPct } from "@/report/format";
import type { FilingRef } from "@/report/schema";
import { readerBaseUnits } from "@/report/readerConventions";

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

const sourceText = (ref: FilingRef): string => `${ref.form}${ref.exhibit ? ` ${ref.exhibit}` : ""} filed ${ref.filingDate} (${ref.accession})${ref.url ? ` ${ref.url}` : ""}`;
const count = (value: number): string => formatNumber(value, 0);

/**
 * The XBRL provenance a composition fact's text ends with (tag; unit; period;
 * filing), plus the optional metadata-match sentence. The period and filing
 * already have their own columns; the audit export keeps the full text.
 */
const XBRL_PROVENANCE = /\s*\b[a-z][a-z0-9-]*\/[A-Za-z][A-Za-z0-9]*; [^;]+; [^;]+; [^;]+?, filed \d{4}-\d{2}-\d{2}\.(?: Matched SEC submissions metadata and XBRL; a successful notes-text extraction is not asserted\.)?/g;
// This exact older pipeline qualification is replaced by the populated-row
// qualification below. Issuer text and the saved audit evidence are unchanged.
const LEGACY_TAX_SCOPE = "Income-tax balances shown gross, not an occupancy-tax pair; legal netting and jurisdiction matching are unestablished. The receivable tag alone does not establish maturity.";

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=[A-Z“"(])/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Filing facts retain their distinct periods, qualifications and derivations.
 * FIGR extra-high audit B2-18 (2026-11-02): a qualification every row of a
 * table shares is stated once in the table note (the cash qualification had
 * printed four times), and XBRL tags stay in the audit export.
 */
export function filingFactTables(d: FilingSupplements): ReportAuditTable[] {
  if (!d.filingFacts?.length) return [];
  // A table-level sentence is skipped when every row's own text already says
  // it (the SBC rows state their FCF treatment, the cash rows their liquidity
  // limit), so the note does not print the same qualification twice.
  const groups: Array<{ prefix: string; heading: string; notes: Array<{ text: string; unlessEveryRow?: RegExp }> }> = [
    { prefix: "composition-sbc-", heading: "SBC composition: separately reported expense and capitalization",
      notes: [{ text: "These amounts do not change FCF.", unlessEveryRow: /\bFCF\b/ }] },
    { prefix: "composition-cash-", heading: "Cash composition: restrictions and reported combined balance",
      notes: [{ text: "Each balance keeps its own date and primary filing." },
        { text: "A combined balance including restrictions is not available liquidity.", unlessEveryRow: /including restrictions is not (?:all )?available liquidity/i }] },
    { prefix: "composition-working-capital-", heading: "Working capital: identified standard cash-flow components (partial)", notes: [{ text: "Identified signed components and any partial subtotal do not establish complete working capital or a normalized cash-flow estimate." }] },
    { prefix: "composition-tax-", heading: "Income-tax balances: gross receivable and current payable", notes: [{ text: "Separate gross balances do not establish receivable maturity, an occupancy-tax pair or legal netting." }] },
    { prefix: "", heading: "Filing notes: customer, investment and transaction disclosures", notes: [{ text: "Each row retains its own period and issuer qualification. Customer shares, investment balances, commitments, financing capacity and transaction consideration describe different exposures; they are not additive. Reported customers are unnamed: matching positions across periods do not establish common identities. Separately stated indirect-customer and payment-term context does not identify those counterparties as the reported direct customers." }] },
  ];
  return groups.flatMap(group => {
    const facts = d.filingFacts!.filter(f => group.prefix === "" ? !f.key?.startsWith("composition-") : f.key?.startsWith(group.prefix));
    if (facts.length === 0) return [];
    const labels = facts.map(f => f.label).join(" ");
    let heading = group.heading;
    let notes = group.notes;
    if (group.prefix === "composition-sbc-") {
      const capitalized = /capitali[sz]/i.test(labels);
      const recognized = /recogniz|expense|amortization/i.test(labels);
      heading = `SBC composition: ${recognized && capitalized ? "separately reported expense and capitalization" : capitalized ? "capitalized amounts" : "recognized expense"}`;
    } else if (group.prefix === "composition-tax-") {
      const receivable = /receivable/i.test(labels);
      const payable = /payable/i.test(labels);
      heading = `Income-tax balances: ${[receivable ? "gross receivable" : null, payable ? "current payable" : null].filter(Boolean).join(" and ") || "reported balances"}`;
      notes = [{ text: `Reported balances do not establish legal netting or jurisdiction matching.${receivable ? " Receivable maturity is not established by a gross balance." : ""}` }];
    } else if (group.prefix === "") {
      const topics = [
        /customer/i.test(labels) ? "customer disclosures" : null,
        /investment/i.test(labels) ? "investments" : null,
        /goodwill/i.test(labels) ? "goodwill" : null,
        /acquisi|transaction|consideration/i.test(labels) ? "transactions" : null,
        /commitment|financing|capacity/i.test(labels) ? "commitments and financing" : null,
      ].filter(Boolean);
      heading = `Filing notes: ${topics.join(", ") || "reported disclosures"}`;
      notes = [{ text: "Each row retains its own period and issuer qualification. Different exposures are not additive." },
        ...(/customer/i.test(labels) ? [{ text: "Reported customers are unnamed: matching positions across periods do not establish common identities. Separately stated indirect-customer and payment-term context does not identify those counterparties as the reported direct customers." }] : [])];
    }
    const bases = facts.map((f) => {
      const factText = f.text.replace(XBRL_PROVENANCE, "");
      const text = group.prefix === "composition-tax-" ? factText.replace(LEGACY_TAX_SCOPE, "") : factText;
      return sentences(readerBaseUnits([f.computed ? `Derived: ${f.computed}.` : null, text.trim()].filter(Boolean).join(" ")));
    });
    const shared = facts.length > 1 ? bases[0]!.filter((s) => bases.every((basis) => basis.includes(s))) : [];
    const rowBases = bases.map((basis) => basis.filter((s) => !shared.includes(s)).join(" "));
    const showBasis = rowBases.some((basis) => basis !== "");
    const groupNote = notes.filter((n) => !n.unlessEveryRow || !bases.every((basis) => n.unlessEveryRow!.test(basis.join(" "))))
      .map((n) => n.text).join(" ");
    return [{
      heading,
      headers: ["Disclosure", "Value as stated", "Period / as of", ...(showBasis ? ["Basis / issuer context"] : []), "Source"],
      rows: facts.map((f, i) => {
        const amount = f.unit === "currency" ? formatFinancialValue(f.value, "currency", d.currency)
          : f.unit === "percent" ? formatPct(f.value)
            : `${formatNumber(f.value, Number.isInteger(f.value) ? 0 : 1)}${f.unit === "days" ? " days" : f.unit === "shares" ? " shares" : ""}`;
        return [f.label, `${f.qualifier ? `${f.qualifier} ` : ""}${amount}`, [f.period, f.asOf ? `as of ${f.asOf}` : null].filter(Boolean).join("; ") || "Not recorded",
          ...(showBasis ? [rowBases[i]!] : []), sourceText(f.source)];
      }),
      // Each shared sentence was written for one row ("These are same-date ... balances").
      note: [shared.length ? `Applies to each row: ${shared.join(" ")}` : "", groupNote].filter(Boolean).join(" "),
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
