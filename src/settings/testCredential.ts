import "server-only";
import type { ProviderCredentialKey } from "./credentialContracts";

export interface CredentialTestResult { ok: boolean; message: string }

/** One uncached, non-generating request. Never return provider bodies or thrown URLs. */
export async function testProviderCredential(key: ProviderCredentialKey, value: string): Promise<CredentialTestResult> {
  let url: URL;
  const headers: Record<string, string> = { Accept: "application/json" };
  switch (key) {
    case "FMP_API_KEY":
      url = new URL("https://financialmodelingprep.com/stable/quote?symbol=AAPL");
      headers.apikey = value;
      break;
    case "FINNHUB_API_KEY":
      url = new URL("https://finnhub.io/api/v1/quote?symbol=AAPL");
      headers["X-Finnhub-Token"] = value;
      break;
    case "FRED_API_KEY":
      url = new URL("https://api.stlouisfed.org/fred/series/observations?series_id=DGS10&file_type=json&sort_order=desc&limit=30");
      url.searchParams.set("api_key", value);
      break;
    case "ANTHROPIC_API_KEY":
      url = new URL("https://api.anthropic.com/v1/models?limit=1");
      headers["x-api-key"] = value;
      headers["anthropic-version"] = "2023-06-01";
      break;
    case "ANTHROPIC_ADMIN_KEY":
      url = new URL("https://api.anthropic.com/v1/organizations/cost_report");
      url.searchParams.set("starting_at", new Date(Date.now() - 86_400_000).toISOString());
      url.searchParams.set("ending_at", new Date().toISOString());
      headers["x-api-key"] = value;
      headers["anthropic-version"] = "2023-06-01";
      break;
    case "EDGAR_CONTACT":
      url = new URL("https://data.sec.gov/submissions/CIK0000320193.json");
      headers["User-Agent"] = value;
      break;
  }
  try {
    const response = await fetch(url, {
      headers, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      const message = response.status === 401 ? "Key rejected by the provider. Check and replace it."
        : response.status === 402 ? "This provider endpoint requires a different subscription or available credits (HTTP 402)."
          : response.status === 403 ? "Provider denied access. Check key permissions, subscription, or access restrictions (HTTP 403)."
            : response.status === 429 ? "Provider rate limit or quota reached. Try again later (HTTP 429)."
              : `Provider test failed (HTTP ${response.status}). Try again later.`;
      return { ok: false, message };
    }
    const data: unknown = await response.json();
    const record = data !== null && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {};
    const nonemptyRecords = (items: unknown): items is Record<string, unknown>[] =>
      Array.isArray(items) && items.length > 0 && items.every((row) => row !== null && typeof row === "object");
    const finitePositive = (number: unknown) => typeof number === "number" && Number.isFinite(number) && number > 0;
    let valid = false;
    if (!("error" in record) && !("Error Message" in record) && !("error_code" in record)) {
      switch (key) {
        case "FMP_API_KEY": valid = nonemptyRecords(data) && data.some((row) => row.symbol === "AAPL" && finitePositive(row.price)); break;
        case "FINNHUB_API_KEY": valid = finitePositive(record.c); break;
        case "FRED_API_KEY": valid = nonemptyRecords(record.observations) && record.observations.some((row) => typeof row.value === "string" && row.value.trim() !== "" && Number.isFinite(Number(row.value))); break;
        case "ANTHROPIC_API_KEY": valid = nonemptyRecords(record.data) && record.data.some((row) => typeof row.id === "string" && row.id.length > 0 && row.type === "model"); break;
        case "ANTHROPIC_ADMIN_KEY": valid = Array.isArray(record.data) && typeof record.has_more === "boolean"; break;
        case "EDGAR_CONTACT": valid = String(record.cik).padStart(10, "0") === "0000320193" && typeof record.name === "string" && record.name.length > 0; break;
      }
    }
    return valid ? { ok: true, message: key === "EDGAR_CONTACT" ? "SEC connection verified. Contact email ownership is not verified." : "Provider connection verified." }
      : { ok: false, message: "Provider did not return usable test data. Check the key and provider access." };
  } catch {
    return { ok: false, message: "Could not complete the provider test. Check your connection and try again." };
  }
}
