"use client";

import { useSyncExternalStore } from "react";
import { useUiDesign } from "@/appearance/UiDesignProvider";
import { CommandLauncher } from "./CommandLauncher";

const subscribeHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/** Local display preferences; no research settings or provider requests. */
export function WorkspaceToolbar() {
  const { layout, design, saved, chooseDesign, density, densitySaved, chooseDensity } = useUiDesign();
  const hydrated = useSyncExternalStore(subscribeHydration, clientSnapshot, serverSnapshot);
  if (layout !== "dossier") return null;
  return (
    <div className="workspace-tools">
      <CommandLauncher />
      <details className="display-options" onKeyDown={event => {
        if (event.key === "Escape" && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); }
      }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.open = false; }}>
        <summary>View<span className="display-current"> · {design === "workspace" ? "Ivory" : "Ink"}</span></summary>
        <div className="display-options-panel">
          <fieldset disabled={!hydrated}><legend>Appearance</legend><div className="display-choices">
            {(["current", "workspace"] as const).map(value => <button type="button" key={value} aria-label={`Use Metis ${value === "current" ? "Ink" : "Ivory"}`} aria-pressed={design === value} onClick={() => chooseDesign(value)}>{value === "current" ? "Ink" : "Ivory"}</button>)}
          </div></fieldset>
          <fieldset disabled={!hydrated}><legend>Reading density</legend><div className="display-choices">
            {(["comfortable", "compact"] as const).map(value => <label key={value}><input type="radio" name="uiDensity" value={value} checked={density === value} onChange={() => chooseDensity(value)} />{value === "compact" ? "Compact" : "Comfortable"}</label>)}
          </div><p>Spacing only. All research and evidence remain available.</p></fieldset>
          {saved === false && <p role="status" className="text-warn">Appearance applied for this visit; saving was blocked.</p>}
          {densitySaved === false && <p role="status" className="text-warn">Density applied for this visit; saving was blocked.</p>}
          <noscript><p>Display controls require JavaScript. Saved research remains readable.</p></noscript>
        </div>
      </details>
    </div>
  );
}
