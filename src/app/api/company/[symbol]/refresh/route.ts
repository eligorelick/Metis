import { assertSameOrigin } from "@/app/api/sameOrigin";
import { assertLocalOnlyRoute } from "@/app/requestSecurity";
import { normalizeRouteSymbol } from "@/symbol";
import { loadCompanyData } from "@/pipeline/companyData";
import { buildDataBundle } from "@/pipeline/dataBundle";
import { createCompanyLoadCoordinator } from "@/pipeline/companyLoad";
import { withFreshCacheReads } from "@/cache/apiCache";

export const runtime = "nodejs";
const refresh = createCompanyLoadCoordinator({ maxConcurrent: 2, maxQueued: 4, negativeTtlMs: 0,
  load: (symbol: string) => withFreshCacheReads(() => loadCompanyData(symbol, buildDataBundle, true)) });

export async function POST(request: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const denied = assertSameOrigin(request) ?? assertLocalOnlyRoute(request);
  if (denied) return denied;
  const symbol = normalizeRouteSymbol((await params).symbol);
  if (!symbol) return Response.json({ error: "Invalid ticker." }, { status: 400 });
  try {
    const bundle = await refresh(symbol);
    return Response.json({ builtAt: bundle!.builtAt }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Could not update ticker data. Your saved data is still available; try again shortly." }, { status: 503 });
  }
}
