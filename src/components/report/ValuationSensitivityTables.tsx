import type { Dcf } from "@/report/schema";
import { valuationAuditTables } from "@/report/auditTables";
import { establishedCurrency } from "@/report/format";
import { RecordedAuditTable } from "./RecordedAuditTable";
import { RecordedSensitivityMatrix, type RecordedSensitivityMatrixProps } from "./RecordedSensitivityMatrix";

/** Prepare only the method's recorded matrices; all remaining canonical tables survive. */
export function ValuationSensitivityTables({ dcf }: { dcf: Dcf }) {
  const growth = dcf.growthMarginGrid;
  const excess = dcf.excessReturnGrid;
  const excessCurrency = dcf.perShare ? establishedCurrency(dcf.perShare.unit, dcf.perShare.currency) : null;
  return valuationAuditTables(dcf).filter(table => table.heading !== "Enterprise value to equity bridge").map(table => {
    let matrix: RecordedSensitivityMatrixProps | undefined;
    if (growth && table.heading.startsWith("Sensitivity (per share — rows = year-one revenue growth shift")) {
      matrix = { label: "Recorded growth and margin sensitivity", table, values: growth.perShare,
        rowContext: growth.perShare.map((_row, index) => growth.growthShiftsPp[index] === undefined ? null : `Year-one revenue growth shift ${growth.growthShiftsPp[index]}pp`),
        columnContext: growth.marginShiftsPp.map(value => `Sustained operating-margin shift ${value}pp`), currency: dcf.bridge?.currency ?? null };
    } else if (excess && table.heading.startsWith("Sensitivity (per share — rows = starting return")) {
      matrix = { label: "Recorded excess-return sensitivity", table, values: excess.perShare,
        rowContext: excess.perShare.map((_row, index) => {
          const row = excess.rows[index];
          return row ? `${row.label}: starting return ${row.startReturnPct}%; recorded book value ${row.bookValue} ${excessCurrency ?? "currency not recorded"}` : null;
        }), columnContext: excess.costOfEquityPcts.map(value => `Cost of equity ${value}%`), currency: excessCurrency };
    }
    return matrix ? <RecordedSensitivityMatrix key={JSON.stringify(matrix)} {...matrix} />
      : <section key={table.heading} className="valuation-recorded-table"><h3>{table.heading}</h3><RecordedAuditTable table={table} /></section>;
  });
}
