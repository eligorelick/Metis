/**
 * AppShell — global chrome: top header bar, fixed left sidebar, scrollable
 * main region, and the mandatory "informational only" footer (hard product
 * requirement — every screen renders it).
 *
 * Presentational only; safe in server and client components.
 */

import { MetisLogo } from "@/brand/MetisLogo";
import type { ReactNode } from "react";
import Link from "next/link";
import { SidebarNavigation } from "./SidebarNavigation";
import { WorkspaceToolbar } from "./WorkspaceToolbar";

export function AppShell({
  sidebar,
  children,
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="thesis-shell flex h-screen flex-col overflow-hidden bg-bg text-fg">
      <a href="#main-content" className="skip-to-content">Skip to research</a>
      {/* Header bar */}
      <header className="thesis-header flex h-16 shrink-0 items-center justify-between border-b border-edge bg-panel px-4">
        <div className="flex items-center gap-5">
          <Link
            href="/"
            className="inline-flex shrink-0 text-fg"
            aria-label="Metis home"
          >
            <MetisLogo className="h-9 w-[142px]" />
          </Link>
          <span className="hidden text-[11px] text-faint sm:inline">
            equity research
          </span>
        </div>
        <nav className="flex items-center gap-3 text-[11px]">
          <Link href="/" className="dossier-only text-muted hover:text-accent">Coverage</Link>
          <WorkspaceToolbar />
          <Link
            href="/settings"
            className="mono uppercase tracking-[0.1em] text-muted hover:text-accent"
          >
            settings
          </Link>
        </nav>
      </header>

      {/* Sidebar + main */}
      <div className="thesis-frame flex min-h-0 flex-1">
        <SidebarNavigation>{sidebar}</SidebarNavigation>
        <main id="main-content" tabIndex={-1} className="thesis-main min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>

      {/* Global disclaimer footer — hard product requirement */}
      <footer className="shrink-0 border-t border-edge bg-panel px-4 py-1">
        <a href="https://eligorelick.com" className="text-[11px] text-muted underline hover:text-accent">
          Metis by Eli Gorelick — https://eligorelick.com
        </a>
        <p className="text-[10px] uppercase tracking-[0.08em] text-faint">
          informational only — not investment advice
        </p>
      </footer>
    </div>
  );
}
