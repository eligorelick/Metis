"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { parseUiDesign, persistUiDesign, type UiDesign } from "./preference";
import { parseUiDensity, persistUiDensity, type UiDensity } from "./density";

export interface CoverageTarget { symbol: string; companyName?: string }

interface UiDesignState {
  layout: "classic" | "dossier";
  design: UiDesign;
  saved: boolean | null;
  chooseDesign(design: UiDesign): void;
  density: UiDensity;
  densitySaved: boolean | null;
  chooseDensity(density: UiDensity): void;
  coverage: readonly CoverageTarget[];
  coverageAvailable: boolean;
}

// Presentational components are also rendered independently in server tests.
// Their absence of a provider must preserve the original Current surface.
const UiDesignContext = createContext<UiDesignState>({
  layout: "classic", design: "current", saved: null, chooseDesign: () => {},
  density: "comfortable", densitySaved: null, chooseDensity: () => {},
  coverage: [], coverageAvailable: true,
});

export function UiDesignProvider({ initialDesign, initialDensity = "comfortable", layout = "classic", coverage = [], coverageAvailable = true, children }: { initialDesign: UiDesign; initialDensity?: UiDensity; layout?: "classic" | "dossier"; coverage?: readonly CoverageTarget[]; coverageAvailable?: boolean; children?: ReactNode }) {
  const [design, setDesign] = useState<UiDesign>(parseUiDesign(initialDesign));
  const [saved, setSaved] = useState<boolean | null>(null);
  const [density, setDensity] = useState<UiDensity>(parseUiDensity(initialDensity));
  const [densitySaved, setDensitySaved] = useState<boolean | null>(null);
  // A server refresh may reconcile the body attribute from the cookie. Retain
  // the active visit's choice, including when cookie persistence was blocked.
  useEffect(() => { document.body.dataset.uiDesign = design; }, [design, initialDesign, children]);
  useEffect(() => { document.body.dataset.uiDensity = density; }, [density, initialDensity, children]);
  const chooseDesign = useCallback((value: UiDesign) => {
    const next = parseUiDesign(value);
    document.body.dataset.uiDesign = next;
    setDesign(next);
    setSaved(persistUiDesign(next, document, window.location.protocol === "https:"));
  }, []);
  const chooseDensity = useCallback((value: UiDensity) => {
    const next = parseUiDensity(value);
    document.body.dataset.uiDensity = next;
    setDensity(next);
    setDensitySaved(persistUiDensity(next, document, window.location.protocol === "https:"));
  }, []);
  return <UiDesignContext.Provider value={{ layout, design, saved, chooseDesign, density, densitySaved, chooseDensity, coverage, coverageAvailable }}>{children}</UiDesignContext.Provider>;
}

export function useUiDesign(): UiDesignState { return useContext(UiDesignContext); }

export function WorkspaceOnly({ children }: { children: ReactNode }) {
  return useUiDesign().design === "workspace" ? children : null;
}
