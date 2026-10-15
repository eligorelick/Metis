// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProviderCredentials } from "@/app/settings/ProviderCredentials";
import { PROVIDER_CREDENTIAL_KEYS, type ProviderCredentialStatuses } from "@/settings/credentialContracts";

let container: HTMLDivElement;
let root: Root;

function missingStatuses(): ProviderCredentialStatuses {
  return Object.fromEntries(PROVIDER_CREDENTIAL_KEYS.map((key) => [key, { configured: false, source: "missing" }])) as ProviderCredentialStatuses;
}

async function enterValue(key: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`#credential-${key}`)!;
  await act(async () => {
    // Use the native setter so React observes the same input event as a user edit.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function button(action: "Save" | "Test", key: string): HTMLButtonElement {
  return container.querySelector<HTMLButtonElement>(`[aria-label="${action} ${key}"]`)!;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it("keeps both saved keys testable when concurrent save responses arrive in reverse order", async () => {
  const missing = missingStatuses();
  const fmpSaved = { ...missing, FMP_API_KEY: { configured: true, source: "settings" } };
  const bothSaved = { ...fmpSaved, FINNHUB_API_KEY: { configured: true, source: "settings" } };
  const pending: Record<string, (response: Response) => void> = {};
  vi.stubGlobal("fetch", (_input: unknown, init?: RequestInit) => {
    if (init?.method !== "POST") return Promise.resolve(Response.json({ credentials: missing }));
    const body = JSON.parse(String(init.body));
    return new Promise<Response>((resolve) => { pending[body.key] = resolve; });
  });
  await act(async () => root.render(createElement(ProviderCredentials)));

  async function save(key: string) {
    await enterValue(key, "test-only-key");
    expect(button("Save", key).disabled).toBe(false);
    await act(async () => button("Save", key).click());
  }

  await save("FMP_API_KEY");
  await save("FINNHUB_API_KEY");
  await act(async () => pending.FINNHUB_API_KEY!(Response.json({ ok: true, credentials: bothSaved })));
  await act(async () => pending.FMP_API_KEY!(Response.json({ ok: true, credentials: fmpSaved })));

  for (const key of ["FMP_API_KEY", "FINNHUB_API_KEY"]) {
    expect(container.querySelector<HTMLInputElement>(`#credential-${key}`)!.value).toBe("");
    expect(container.querySelector<HTMLButtonElement>(`[aria-label="Test ${key}"]`)!.disabled).toBe(false);
  }
  expect(container.textContent).not.toContain("Synthetic fixture mode");
});

it.each(PROVIDER_CREDENTIAL_KEYS)("tests a draft, saves %s, then tests the hidden saved value", async (key) => {
  const missing = missingStatuses();
  const requests: unknown[] = [];
  vi.stubGlobal("fetch", async (_input: unknown, init?: RequestInit) => {
    if (init?.method !== "POST") return Response.json({ credentials: missing });
    const body = JSON.parse(String(init.body));
    requests.push(body);
    return Response.json(body.action === "test"
      ? { ok: true, message: "Provider connection verified." }
      : { ok: true, credentials: { ...missing, [key]: { configured: true, source: "settings" } } });
  });
  await act(async () => root.render(createElement(ProviderCredentials)));
  expect(button("Test", key).disabled).toBe(true);
  const value = key === "EDGAR_CONTACT" ? "Research qa@metis-research.com" : "test-only-key";
  await enterValue(key, value);
  await act(async () => button("Test", key).click());
  expect(container.querySelector<HTMLInputElement>(`#credential-${key}`)!.value).toBe(value);
  expect(container.textContent).toContain("Save to use this value.");
  await act(async () => button("Save", key).click());
  expect(container.querySelector<HTMLInputElement>(`#credential-${key}`)!.value).toBe("");
  expect(button("Save", key).disabled).toBe(true);
  expect(button("Test", key).disabled).toBe(false);
  await act(async () => button("Test", key).click());
  expect(container.querySelector('[aria-label="Connection verified"]')).not.toBeNull();
  expect(requests).toEqual([
    { action: "test", key, value }, { action: "save", key, value }, { action: "test", key },
  ]);
});

it("retains the replacement input and allows retry when saving fails", async () => {
  vi.stubGlobal("fetch", async (_input: unknown, init?: RequestInit) => init?.method === "POST"
    ? Response.json({ error: "Credential storage is unavailable." }, { status: 500 })
    : Response.json({ credentials: missingStatuses() }));
  await act(async () => root.render(createElement(ProviderCredentials)));
  await enterValue("FMP_API_KEY", "test-only-key");
  await act(async () => button("Save", "FMP_API_KEY").click());
  expect(container.textContent).toContain("Credential storage is unavailable.");
  expect(container.querySelector<HTMLInputElement>("#credential-FMP_API_KEY")!.value).toBe("test-only-key");
  expect(button("Save", "FMP_API_KEY").disabled).toBe(false);
  expect(container.querySelector('[aria-label="Connection verified"]')).toBeNull();
});

it.each([
  ...PROVIDER_CREDENTIAL_KEYS.map((key) => ({ key, environment: false })),
  { key: "FMP_API_KEY", environment: true },
])("removes only the saved $key override with environment fallback: $environment", async ({ key, environment }) => {
  const initial = { ...missingStatuses(), [key]: { configured: true, source: "settings" } };
  const requests: unknown[] = [];
  vi.stubGlobal("fetch", async (_input: unknown, init?: RequestInit) => {
    if (init?.method !== "POST") return Response.json({ credentials: initial });
    requests.push(JSON.parse(String(init.body)));
    return Response.json({ ok: true, credentials: { ...missingStatuses(), [key]: { configured: environment, source: environment ? "environment" : "missing" } } });
  });
  await act(async () => root.render(createElement(ProviderCredentials)));
  const remove = container.querySelector<HTMLButtonElement>(`[aria-label="Remove saved ${key}"]`);
  expect(remove).not.toBeNull();
  expect(remove!.disabled).toBe(false);
  await enterValue(key, "unsaved-draft");
  await act(async () => remove!.click());
  expect(requests).toEqual([{ action: "remove", key }]);
  expect(container.querySelector<HTMLInputElement>(`#credential-${key}`)!.value).toBe("");
  expect(remove!.disabled).toBe(true);
  expect(button("Test", key).disabled).toBe(!environment);
  expect(container.textContent).toContain("Saved override removed.");
});
