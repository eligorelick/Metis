"use client";

import { useState, useSyncExternalStore } from "react";
import type { ReportAuditTable } from "@/report/auditTables";

const subscribe = () => () => {};
const client = () => true;
const server = () => false;

export interface RecordedSensitivityMatrixProps {
  label: string;
  table: ReportAuditTable;
  values: readonly (readonly (number | null)[])[];
  rowContext: readonly (string | null)[];
  columnContext: readonly (string | null)[];
  currency: string | null;
}

/** Canonical table strings plus raw stored cells, with no interpolation or replay. */
export function RecordedSensitivityMatrix({ label, table, values, rowContext, columnContext, currency }: RecordedSensitivityMatrixProps) {
  const enhanced = useSyncExternalStore(subscribe, client, server);
  const [selected, setSelected] = useState<{ row: number; column: number; value: number | null } | null>(null);
  const incomplete = values.some((row, index) => !rowContext[index] || row.some((_value, column) => !columnContext[column]));
  return <section className="recorded-sensitivity-matrix" aria-label={label}>
    <h3>{table.heading}</h3>
    {incomplete && <p className="analysis-unavailable">Some axis context was not recorded. Those table values remain visible; selection is withheld for those cells.</p>}
    <div className="recorded-audit-scroll" tabIndex={0} aria-label={`Scrollable ${label}`}>
      <table><caption className="sr-only">{table.heading}</caption>
        <thead><tr>{table.headers.map(header => <th scope="col" key={header}>{header}</th>)}</tr></thead>
        <tbody>{table.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, column) => {
          if (column === 0) return <th scope="row" key={column}>{cell}</th>;
          const value = values[rowIndex]?.[column - 1];
          const inspectable = enhanced && value !== undefined && rowContext[rowIndex] != null && columnContext[column - 1] != null;
          return <td key={column}>{inspectable ? <button type="button" className="sensitivity-case-button" data-matrix-row={rowIndex} data-matrix-column={column - 1} aria-pressed={selected?.row === rowIndex && selected.column === column - 1} aria-label={`Inspect ${rowContext[rowIndex]}; ${columnContext[column - 1]}`} onClick={() => setSelected({ row: rowIndex, column: column - 1, value })}>{cell}</button> : cell}</td>;
        })}</tr>)}</tbody>
      </table>
    </div>
    {table.note && <p className="recorded-audit-note">{table.note}</p>}
    <div className="recorded-sensitivity-selection" role="status">{selected ? <>
      <p>Selected recorded case · {rowContext[selected.row]} · {columnContext[selected.column]}</p>
      <p className="mono">{selected.value === null ? "This case was withheld in the stored grid." : `Recorded value (unrounded): ${selected.value} per share · ${currency ?? "currency not recorded"}`}</p>
    </> : <p>{enhanced ? "Select a recorded cell to inspect its exact assumptions and value." : "Recorded sensitivity values are shown in the table."}</p>}</div>
  </section>;
}
