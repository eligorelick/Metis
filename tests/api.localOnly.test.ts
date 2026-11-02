import { afterEach, expect, it, vi } from "vitest";
import { GET as credentialsGET, POST as credentialsPOST } from "@/app/api/settings/credentials/route";
import { GET as connectionsGET, POST as connectionsPOST } from "@/app/api/ai/connections/route";
afterEach(() => vi.unstubAllEnvs());
it.each(["192.168.1.50:3000", "bad/authority"])("refuses all credential management with spoofed loopback Host in LAN mode: %s (SEC-202)", async (allowed) => {
  vi.stubEnv("METIS_ALLOWED_HOST", allowed);
  for (const host of ["localhost:3000", "127.0.0.1:3000", "[::1]:3000"]) {
    for (const handler of [credentialsGET, connectionsGET, credentialsPOST, connectionsPOST]) {
      const post = handler === credentialsPOST || handler === connectionsPOST;
      const response = await handler(new Request("http://192.168.1.50:3000/api/settings/credentials", { method: post ? "POST" : "GET", headers: { host, "sec-fetch-site": "same-origin", "content-type": "application/json" }, ...(post ? { body: JSON.stringify({ action: "select", provider: "none" }) } : {}) }));
      expect(response.status).toBe(403);
    }
  }
});

it.each(["", "localhost:3000", "127.0.0.1:3000", "[::1]:3000"])("retains loopback management for a loopback allowlist: %s", async (allowed) => {
  vi.stubEnv("METIS_ALLOWED_HOST", allowed);
  const { assertLocalOnlyRoute } = await import("@/app/requestSecurity");
  const local = new Request("http://localhost:3000/settings", { headers: { host: "localhost:3000" } });
  expect(assertLocalOnlyRoute(local)).toBeNull();
  expect(assertLocalOnlyRoute(new Request("http://192.168.1.50:3000/settings", { headers: { host: "192.168.1.50:3000" } }))?.status).toBe(403);
});
it("honors the legacy LAN alias (SEC-202)", async () => {
  vi.stubEnv("METIS_ALLOWED_HOST", undefined); vi.stubEnv("THESIS_ALLOWED_HOST", "192.168.1.50:3000");
  expect((await credentialsGET(new Request("http://localhost/settings", { headers: { host: "localhost", "sec-fetch-site": "same-origin" } }))).status).toBe(403);
});
