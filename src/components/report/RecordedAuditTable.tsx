import type { ReportAuditTable } from "@/report/auditTables";

/** Table alternative to a visual; accepts only an existing presentation result. */
export function RecordedAuditTable({ table }: { table: ReportAuditTable }) {
  return <>
    <div className="recorded-audit-scroll" tabIndex={0} aria-label={`Scrollable ${table.heading}`}>
      <table><caption className="sr-only">{table.heading}</caption>
        <thead><tr>{table.headers.map(header => <th scope="col" key={header}>{header}</th>)}</tr></thead>
        <tbody>{table.rows.map((row, index) => <tr key={index}>{row.map((cell, column) => column === 0 ? <th scope="row" key={column}>{cell}</th> : <td key={column}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
    {table.note && <p className="recorded-audit-note">{table.note}</p>}
  </>;
}
