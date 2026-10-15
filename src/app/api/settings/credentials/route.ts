import { NextResponse } from "next/server";
import { assertSameOrigin } from "@/app/api/sameOrigin";
import { getProviderCredential, readProviderCredentials, withAiStore } from "@/ai/store";
import { hasConfiguredEdgarIdentity } from "@/providers/edgar";
import { isProviderCredentialKey, PROVIDER_CREDENTIAL_KEYS, type ProviderCredentialStatuses } from "@/settings/credentialContracts";
import { testProviderCredential } from "@/settings/testCredential";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
function response(body: unknown, status = 200) { return NextResponse.json(body, { status, headers }); }

function guard(request: Request) {
  const denied = assertSameOrigin(request);
  if (denied) return denied;
  return /^(?:localhost|127\.0\.0\.1|\[::1\])(?::[1-9]\d{0,4})?$/.test(request.headers.get("host") ?? "")
    ? null : response({ error: "Provider credentials require local access on this computer." }, 403);
}

function statuses(): ProviderCredentialStatuses {
  const saved = readProviderCredentials();
  return Object.fromEntries(PROVIDER_CREDENTIAL_KEYS.map((key) => {
    const value = getProviderCredential(key);
    const configured = key === "EDGAR_CONTACT" ? hasConfiguredEdgarIdentity(value ?? "") : !!value;
    return [key, { configured, source: saved[key] ? "settings" : value ? "environment" : "missing" }];
  })) as ProviderCredentialStatuses;
}

export async function GET(request: Request) {
  const denied = guard(request); if (denied) return denied;
  try { return response({ credentials: statuses() }); }
  catch { return response({ error: "Credential storage is unavailable. Existing keys were not replaced." }, 500); }
}

export async function POST(request: Request) {
  const denied = guard(request); if (denied) return denied;
  try {
    const text = await request.text();
    if (text.length > 8192) return response({ error: "Request is too large." }, 413);
    let body: unknown;
    try { body = JSON.parse(text); }
    catch { return response({ error: "Invalid JSON." }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return response({ error: "Invalid credential request." }, 400);
    const { action, key, value } = body as Record<string, unknown>;
    if (!isProviderCredentialKey(key) || (action !== "save" && action !== "test" && action !== "remove")) return response({ error: "Choose a supported credential and action." }, 400);
    if (action === "remove") {
      if (value !== undefined) return response({ error: "Removal does not accept a credential value." }, 400);
      await withAiStore((store) => { if (store.providerCredentials) delete store.providerCredentials[key]; });
      return response({ ok: true, credentials: statuses(), message: "Saved override removed. Environment value applies if configured." });
    }
    if (value !== undefined && (typeof value !== "string" || value.length > 2048 || /[\x00-\x1f\x7f]/.test(value))) return response({ error: "Enter a single credential value of at most 2048 characters." }, 400);
    const draft = typeof value === "string" ? value.trim() : undefined;
    const secret = draft || (action === "test" ? getProviderCredential(key) : undefined);
    if (!secret) return response({ error: "Enter a value first." }, 400);
    if (key === "EDGAR_CONTACT" ? !hasConfiguredEdgarIdentity(secret) : /\s/.test(secret)) return response({ error: key === "EDGAR_CONTACT" ? "Enter your name or organization and a reachable email; placeholder addresses are not accepted." : "API keys cannot contain whitespace." }, 400);
    if (action === "test") return response(await testProviderCredential(key, secret));
    await withAiStore((store) => { store.providerCredentials = { ...store.providerCredentials, [key]: secret }; });
    return response({ ok: true, credentials: statuses(), message: "Saved. Test the connection to verify access." });
  } catch {
    return response({ error: "Credential storage is unavailable. The action could not be completed." }, 500);
  }
}
