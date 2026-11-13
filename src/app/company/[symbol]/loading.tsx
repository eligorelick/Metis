/**
 * Route-level loading screen for every page under /company/[symbol]: the
 * company page, a saved run, the revisions list and the comparison view.
 *
 * Without it a page change keeps the old page on screen until the server has
 * rendered the whole new one, which for a long saved report takes seconds on
 * the development server. With it the shell and a skeleton appear at once and
 * the page streams in behind them. Only this placeholder can be fetched ahead
 * of a click; the page itself, and any live research, still runs on request.
 *
 * The print page has its own empty loading screen so paper output never shows
 * the app chrome.
 */

import { AppShell } from "@/components/shell";

import { CompanyBodySkeleton, SidebarSkeleton } from "./skeletons";

export default function Loading() {
  return (
    <AppShell sidebar={<SidebarSkeleton />}>
      <CompanyBodySkeleton />
    </AppShell>
  );
}
