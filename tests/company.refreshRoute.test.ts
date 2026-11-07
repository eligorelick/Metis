import { beforeEach, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/pipeline/companyData", () => ({ loadCompanyData: fake.load }));
vi.mock("@/pipeline/dataBundle", () => ({ buildDataBundle: vi.fn() }));
import { POST } from "@/app/api/company/[symbol]/refresh/route";
beforeEach(() => { fake.load.mockReset().mockResolvedValue({ builtAt: "2026-11-06T00:00:00Z" }); });
function request(origin = "http://localhost:3000") { return new Request("http://localhost:3000/api/company/AAPL/refresh", { method: "POST", headers: { host: "localhost:3000", origin } }); }
it("requires same-origin requests and a valid ticker before refreshing", async () => {
  expect((await POST(request("https://evil.example"), { params: Promise.resolve({ symbol: "AAPL" }) })).status).toBe(403);
  expect((await POST(request(), { params: Promise.resolve({ symbol: "bad/ticker" }) })).status).toBe(400);
  expect(fake.load).not.toHaveBeenCalled();
});
it("requests an explicit refresh and reports its retained timestamp", async () => {
  const response = await POST(request(), { params: Promise.resolve({ symbol: "AAPL" }) });
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ builtAt: "2026-11-06T00:00:00Z" });
  expect(fake.load).toHaveBeenCalledWith("AAPL", expect.any(Function), true);
});
it("does not expose internal provider errors on a failed refresh", async () => {
  fake.load.mockRejectedValue(new Error("private provider details"));
  const response = await POST(request(), { params: Promise.resolve({ symbol: "AAPL" }) });
  expect(response.status).toBe(503); expect(await response.text()).toContain("saved data is still available");
});
