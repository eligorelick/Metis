"use client";

import Link from "next/link";
import { AppShell } from "@/components/shell";
import { Badge, Panel, SectionHeading } from "@/components/ui";
import { activeModels } from "@/models/registry";
import {
  explainAnalysisModel,
  isAnalysisModelOption,
  type AnalysisModelOption,
  type EffortLevel,
} from "@/settings/contracts";
import {
  settingsModelOptionsForDisplay,
  type SettingsPageControllerState,
} from "@/settings/writeQueue";
import { ResumeQueueControl } from "./ResumeQueueControl";
import type { AnalysisRoute } from "@/ai/analysisRoute";
import { AiConnections } from "./AiConnections";
import { AppearanceSettings } from "./AppearanceSettings";
import { ProviderCredentials } from "./ProviderCredentials";

/**
 * Labels come from the model registry, which is also where the options come
 * from — a hand-maintained map goes stale silently, and this one had: it
 * listed neither `claude-opus-5` (the default) nor `claude-fable-5-1`, so the
 * two newest choices rendered without a label at all.
 */
const MODEL_LABELS: Record<string, string> = {
  auto: "auto — preferred model available to your API key",
  ...Object.fromEntries(
    activeModels().map((entry) => [entry.id, `${entry.id} — ${entry.displayName}`]),
  ),
};

const EFFORT_LABELS: Record<string, string> = {
  low: "low — fastest/cheapest, shallow reasoning",
  medium: "medium — balanced cost/quality",
  high: "high — thorough reasoning",
  xhigh: "xhigh — extra-deep reasoning, higher cost",
  max: "max — deepest reasoning, highest cost",
};

export interface SettingsPageViewProps {
  state: SettingsPageControllerState;
  onAnalysisModel(value: AnalysisModelOption): void;
  onAnalysisEffort(value: EffortLevel): void;
  /** The route reports run on now; the Claude panels say so when it is not Claude. */
  activeRoute?: Pick<AnalysisRoute, "provider" | "label" | "ready"> | null;
  onRoute?(route: AnalysisRoute | null): void;
}

export function SettingsPageView({
  state,
  onAnalysisModel,
  onAnalysisEffort,
  activeRoute = null,
  onRoute,
}: SettingsPageViewProps) {
  const claudeNotInUse = activeRoute !== null && activeRoute.provider !== "anthropic" ? (
    <p className="mb-2 border border-warn/40 bg-warn/10 px-2 py-1.5 text-[12px] text-warn">
      Not in use: reports currently run on {activeRoute.label}. Choose Claude API above to use these settings.
    </p>
  ) : null;
  const settings = state.payload;
  const status = state.writer?.status ?? "idle";
  const saveBadge = status === "saving" ? (
    <Badge tone="muted">saving…</Badge>
  ) : status === "recovering" ? (
    <Badge tone="muted">recovering…</Badge>
  ) : status === "saved" ? (
    <Badge tone="pos">saved</Badge>
  ) : status === "error" ? (
    <Badge tone="neg">save failed</Badge>
  ) : null;

  const sidebar = (
    <div className="flex flex-col gap-2 p-3">
      <Link
        href="/"
        className="mono text-[11px] uppercase tracking-[0.1em] text-muted hover:text-accent"
      >
        ← dashboard
      </Link>
      <div className="pt-2">
        <SectionHeading>settings</SectionHeading>
        <p className="pt-1 text-[11px] leading-snug text-faint">
          Configure models, provider keys, and your SEC contact here.
          Saved credentials stay on this computer.
        </p>
      </div>
    </div>
  );

  return (
    <AppShell sidebar={sidebar}>
      <div className="research-settings mx-auto flex max-w-2xl flex-col gap-3 p-4">
        <div className="dossier-only settings-introduction"><p className="section-eyebrow">Workspace configuration</p><h1 className="metis-heading">Settings</h1><p>Appearance, research connections and analysis preferences. Changes apply through the existing saved settings below.</p></div>
        {state.error !== null && (
          <div className="border border-neg/40 bg-neg/10 px-3 py-2 text-[12px] text-neg">
            {state.error}
            {settings === null && state.status === "error" && <p>Model settings unavailable. Provider credentials can still be configured below.</p>}
          </div>
        )}

        <AppearanceSettings />
        <ProviderCredentials capabilities={settings?.capabilities} />
        <AiConnections onRoute={onRoute} />
        <Panel title="Claude API model (used only when selected above)" right={saveBadge}>
          {claudeNotInUse}
          {settings === null && state.status === "loading" ? (
            <div className="py-2 text-[11px] text-faint">loading…</div>
          ) : settings !== null ? (
            <fieldset className="flex flex-col gap-1">
              <legend className="sr-only">Analysis model</legend>
              {settingsModelOptionsForDisplay(
                settings.analysisModel,
                settings.analysisModelOptions,
              ).map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-center gap-2 border border-edge bg-bg px-2 py-1.5 text-[12px] hover:border-edge-strong"
                >
                  <input
                    type="radio"
                    name="analysisModel"
                    value={option.value}
                    checked={settings.analysisModel === option.value}
                    disabled={option.unsupported}
                    onChange={() => {
                      if (isAnalysisModelOption(option.value)) {
                        onAnalysisModel(option.value);
                      }
                    }}
                    className="accent-[var(--accent)]"
                  />
                  <span className="mono">
                    {MODEL_LABELS[option.value] ?? option.value}
                    {option.carryOnly ? " (current; carry-only)" : ""}
                    {/*
                      D-02: say WHY the stored value is refused and what is
                      accepted instead. explainAnalysisModel already produces
                      that sentence; the page used to discard it for a generic
                      "(unsupported current model)" the reader could not act on.
                    */}
                    {option.unsupported
                      ? ` — ${explainAnalysisModel(option.value) ?? "unsupported current model"}`
                      : ""}
                  </span>
                </label>
              ))}
            </fieldset>
          ) : null}
        </Panel>

        <Panel title="Claude API effort" right={saveBadge}>
          {claudeNotInUse}
          {settings === null && state.status === "loading" ? (
            <div className="py-2 text-[11px] text-faint">loading…</div>
          ) : settings !== null ? (
            <>
              <fieldset className="flex flex-col gap-1">
                <legend className="sr-only">Analysis effort</legend>
                {settings.analysisEffortOptions.map((option) => (
                  <label
                    key={option}
                    className="flex cursor-pointer items-center gap-2 border border-edge bg-bg px-2 py-1.5 text-[12px] hover:border-edge-strong"
                  >
                    <input
                      type="radio"
                      name="analysisEffort"
                      value={option}
                      checked={settings.analysisEffort === option}
                      onChange={() => onAnalysisEffort(option)}
                      className="accent-[var(--accent)]"
                    />
                    <span className="mono">{EFFORT_LABELS[option] ?? option}</span>
                  </label>
                ))}
              </fieldset>
              <p className="pt-2 text-[11px] leading-snug text-faint">
                Reasoning tokens are billed as output. Anthropic recommends starting
                Opus 5.5 at medium; Sonnet 5.5 and Fable 5.1 default to high.
                Metis sends your saved effort explicitly, so changing models does
                not reset it. Start lower and raise effort when the results need it;
                xhigh and max can consume substantially more tokens.
              </p>
              <p className="pt-2 text-[11px] leading-snug text-faint">
                Opus 5.5 is the general starting choice; Sonnet 5.5 costs less,
                while Fable 5.1 targets the most demanding research. Claude runs at
                standard API speed here, at standard prices: Metis does not request
                Anthropic&rsquo;s premium-priced fast mode. The Fast control above
                applies to ChatGPT.
                {" "}<a className="underline" href="https://platform.claude.com/docs/en/about-claude/models/choosing-a-model" target="_blank" rel="noreferrer">Anthropic’s model guidance</a>.
              </p>
            </>
          ) : null}
        </Panel>

        {settings !== null && !settings.capabilities.resumeOnStart && (
          <ResumeQueueControl />
        )}

        <Panel title="verification">
          <p className="py-1 text-[11px] leading-snug text-faint">
            The citation-coverage pass is fully deterministic (numeric-source
            tracing) — it never calls a model and costs nothing, so there is no
            verification model to configure.
          </p>
        </Panel>

      </div>
    </AppShell>
  );
}
