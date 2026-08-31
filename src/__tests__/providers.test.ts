import type { OAuthCredentials } from "@earendil-works/pi-ai";
import { afterEach, describe, expect, it, vi } from "vitest";

const originalRegion = process.env.QODER_REGION;
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
  if (originalRegion === undefined) delete process.env.QODER_REGION;
  else process.env.QODER_REGION = originalRegion;
  for (const name of patEnvNames) {
    const value = originalPats[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("provider region binding", () => {
  it("keeps qoder global and qoder-cn in CN when QODER_REGION=cn", async () => {
    process.env.QODER_REGION = "cn";
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
