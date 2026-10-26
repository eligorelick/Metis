"use client";

import { useState, useSyncExternalStore } from "react";
import { SensitivityHeatmap, type SensitivityCell } from "@/components/charts/SensitivityHeatmap";

const subscribe = () => () => {};
const hydrated = () => true;
const server = () => false;

/** Inspect only stored cells; never interpolate, rerun the model or alter the headline. */
export function RecordedSensitivity({ cells, currency }: { cells: readonly SensitivityCell[]; currency: string | null }) {
  const enhanced = useSyncExternalStore(subscribe, hydrated, server);
  const [selected, setSelected] = useState<SensitivityCell | null>(null);
  return <section className="recorded-sensitivity" aria-label="Recorded sensitivity cases">
    <p className="analysis-visual-description">Model estimates under the recorded sensitivity conventions. This inspection leaves the saved headline valuation and assessment unchanged.</p>
    <SensitivityHeatmap cells={cells} currency={currency} digits={2} onCellSelect={enhanced ? setSelected : undefined} selectedCell={selected} />
    <div className="recorded-sensitivity-selection" role="status">
      {selected ? <>
        <p>Selected recorded case · WACC {selected.waccPct}% · terminal growth {selected.gTermPct}%</p>
        <p className="mono">{selected.perShare === null ? "This case was withheld in the stored grid." : `Recorded value (unrounded): ${selected.perShare} per share · ${currency ?? "currency not recorded"}`}</p>
      </> : <p>{enhanced ? "Select a recorded cell to inspect its exact assumptions and value." : "Recorded sensitivity values are shown in the table."}</p>}
    </div>
  </section>;
}
