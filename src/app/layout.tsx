import type { Metadata } from "next";
import { cookies } from "next/headers";
import { parseUiDesign, UI_DESIGN_COOKIE } from "@/appearance/preference";
import { UiDesignProvider, type CoverageTarget } from "@/appearance/UiDesignProvider";
import { parseUiDensity, UI_DENSITY_COOKIE } from "@/appearance/density";
import { getWatchlistView } from "@/watchlist/watchlist";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Metis · Equity research", template: "%s | Metis" },
  applicationName: "Metis",
  openGraph: { title: "Metis · Equity research", description: "Evidence. Judgment. Perspective. Local-first equity research.", siteName: "Metis", type: "website" },
  twitter: { card: "summary_large_image", title: "Metis · Equity research" },
  description:
    "Local-first equity research engine. Informational only, not investment advice.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const browserCookies = await cookies();
  const design = parseUiDesign(browserCookies.get(UI_DESIGN_COOKIE)?.value);
  const density = parseUiDensity(browserCookies.get(UI_DENSITY_COOKIE)?.value);
  let coverage: CoverageTarget[] = [];
  let coverageAvailable = true;
  try { coverage = (await getWatchlistView()).map(({ symbol, companyName }) => ({ symbol, companyName })); }
  catch { coverageAvailable = false; }
  // D-246: the dossier is the only layout; the attribute stays because the shared styles key on it.
  return (
    <html lang="en">
      <body data-ui-design={design} data-ui-layout="dossier" data-ui-density={density} className="min-h-screen bg-bg text-fg antialiased">
        <UiDesignProvider initialDesign={design} initialDensity={density} coverage={coverage} coverageAvailable={coverageAvailable}>{children}</UiDesignProvider>
      </body>
    </html>
  );
}
