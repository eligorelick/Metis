/** Browser-safe names and status only. Saved credential values are never returned. */
export const PROVIDER_CREDENTIAL_KEYS = [
  "FMP_API_KEY", "FINNHUB_API_KEY", "FRED_API_KEY", "ANTHROPIC_API_KEY",
  "ANTHROPIC_ADMIN_KEY", "EDGAR_CONTACT",
] as const;

export type ProviderCredentialKey = (typeof PROVIDER_CREDENTIAL_KEYS)[number];
export interface ProviderCredentialStatus {
  configured: boolean;
  source: "settings" | "environment" | "missing";
}
export type ProviderCredentialStatuses = Record<ProviderCredentialKey, ProviderCredentialStatus>;
export const PROVIDER_CREDENTIALS_CHANGED = "metis:provider-credentials-changed";

export function isProviderCredentialKey(value: unknown): value is ProviderCredentialKey {
  return typeof value === "string" && PROVIDER_CREDENTIAL_KEYS.some((key) => key === value);
}
