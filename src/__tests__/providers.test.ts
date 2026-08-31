import type { OAuthCredentials } from "@earendil-works/pi-ai";
import { afterEach, describe, expect, it, vi } from "vitest";

const patEnvNames = [
  "QODER_API_KEY",
  "QODER_PERSONAL_ACCESS_TOKEN",
  "QODER_PAT",
  "QODERCN_API_KEY",
  "QODERCN_PERSONAL_ACCESS_TOKEN",
  "QODERCN_PAT",
] as const;
const originalPats = Object.fromEntries(patEnvNames.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of patEnvNames) {
    const value = originalPats[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  vi.unstubAllGlobals();
  vi.resetModules();
});

function liteModel(provider: "qoder" | "qoder-cn") {
  return {
    id: "Lite",
    name: "Lite",
    api: "qoder-api",
    provider,
    baseUrl: provider === "qoder-cn" ? "https://gateway.qoder.com.cn/" : "https://api3.qoder.sh/",
    reasoning: false,
    input: ["text"] as const,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1000000,
    maxTokens: 131072,
  };
}

describe("provider region binding", () => {
  it("binds qoder to global and qoder-cn to CN", async () => {
    for (const name of patEnvNames) delete process.env[name];
    const providers = new Map<string, Record<string, unknown>>();
    const pi = {
      registerProvider(providerID: string, config: Record<string, unknown>) {
        providers.set(providerID, config);
      },
      on: vi.fn(),
    };

    const { default: registerProviders } = await import("../index.js");
    await registerProviders(pi as never);

    expect(providers.get("qoder")?.baseUrl).toBe("https://api3.qoder.sh/");
    expect(providers.get("qoder-cn")?.baseUrl).toBe("https://gateway.qoder.com.cn/");

    const fetchMock = vi.fn().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            userQuota: { total: 100, used: 1, remaining: 99, percentage: 1, unit: "requests" },
            orgResourcePackage: { total: 0, used: 0, remaining: 0, percentage: 0, unit: "requests" },
            totalUsagePercentage: 1,
            isQuotaExceeded: false,
            expiresAt: Date.now() + 3600_000,
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const credentials: OAuthCredentials = { access: "test-token", refresh: "", expires: Date.now() + 3600_000 };
    const globalOAuth = providers.get("qoder")?.oauth as {
      fetchUsage: (credentials: OAuthCredentials) => Promise<unknown>;
    };
    const cnOAuth = providers.get("qoder-cn")?.oauth as {
      fetchUsage: (credentials: OAuthCredentials) => Promise<unknown>;
    };

    await globalOAuth.fetchUsage(credentials);
    expect(fetchMock).toHaveBeenLastCalledWith("https://openapi.qoder.sh/api/v2/quota/usage", expect.any(Object));

    await cnOAuth.fetchUsage(credentials);
    expect(fetchMock).toHaveBeenLastCalledWith("https://openapi.qoder.com.cn/api/v2/quota/usage", expect.any(Object));
  });
});

describe("qoder-api registry", () => {
  it("registers qoder-api so global streamSimple works for both regions", async () => {
    for (const name of patEnvNames) delete process.env[name];

    // Import compat and the extension in the same test. afterEach resetModules
    // would otherwise give them separate copies of the API registry Map.
    const { getApiProvider, streamSimple, unregisterApiProviders } = await import("@earendil-works/pi-ai/compat");
    const { default: registerProviders } = await import("../index.js");
    // Node caches node_modules ESM, so a prior test in this file may already
    // have registered qoder-api. Drop that entry before asserting the empty state.
    unregisterApiProviders("provider:qoder");
    const emptyContext = { systemPrompt: "", messages: [] };

    expect(getApiProvider("qoder-api")).toBeUndefined();
    expect(() => streamSimple(liteModel("qoder") as never, emptyContext)).toThrow(
      /No API provider registered for api: qoder-api/,
    );

    const providers = new Map<string, Record<string, unknown>>();
    const registerProvider = vi.fn((providerID: string, config: Record<string, unknown>) => {
      providers.set(providerID, config);
    });
    const pi = {
      registerProvider,
      on: vi.fn(),
    };

    await registerProviders(pi as never);

    expect(registerProvider).toHaveBeenCalledTimes(2);
    expect(providers.has("qoder")).toBe(true);
    expect(providers.has("qoder-cn")).toBe(true);
    expect(providers.get("qoder")?.api).toBe("qoder-api");
    expect(providers.get("qoder-cn")?.api).toBe("qoder-api");
    expect(typeof providers.get("qoder")?.streamSimple).toBe("function");
    expect(typeof providers.get("qoder-cn")?.streamSimple).toBe("function");

    expect(getApiProvider("qoder-api")).toBeDefined();
    expect(() => streamSimple(liteModel("qoder") as never, emptyContext)).not.toThrow(
      /No API provider registered for api: qoder-api/,
    );
    expect(() => streamSimple(liteModel("qoder-cn") as never, emptyContext)).not.toThrow(
      /No API provider registered for api: qoder-api/,
    );
  });
});
