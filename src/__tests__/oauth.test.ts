import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { OAuthLoginCallbacks } from "@earendil-works/pi-ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  autoLoginQoderFromEnvironment,
  clearQoderAuthMemCache,
  getCachedCredentials,
  getQoderPatForMode,
  loginQoderForMode,
} from "../auth/oauth.js";
import { credentialsFromPat } from "../auth/pat.js";
import { updateQoderModelsCache } from "../catalog.js";
import { loadLiveFixture } from "./live-fixture.js";

const AUTH_FILE = join(process.env.HOME || process.env.USERPROFILE || homedir(), ".pi", "agent", "auth.json");

const PAT_ENV_NAMES = [
  "QODER_API_KEY",
  "QODER_PERSONAL_ACCESS_TOKEN",
  "QODER_PAT",
  "QODERCN_API_KEY",
  "QODERCN_PERSONAL_ACCESS_TOKEN",
  "QODERCN_PAT",
] as const;

function clearPatEnv(): void {
  for (const name of PAT_ENV_NAMES) {
    delete process.env[name];
  }
}

vi.mock("../auth/pat.js", () => ({
  credentialsFromPat: vi.fn().mockResolvedValue({
    access: "mock-access-token",
    refresh: "mock-refresh-token",
    expires: Date.now() + 3600000,
    userID: "mock-user-123",
    email: "test@example.com",
    name: "Test User",
    machineID: "mock-machine-id",
    type: "oauth",
  }),
  isPatRefresh: vi.fn().mockReturnValue(false),
  decodePatRefresh: vi.fn(),
}));

vi.mock("../catalog.js", () => ({
  updateQoderModelsCache: vi.fn().mockResolvedValue(undefined),
  getCachedModels: vi.fn().mockReturnValue([]),
  isCacheStale: vi.fn().mockReturnValue(true),
  staticModels: [],
  staticCnModels: [],
}));

// Releases without a usable `AuthStorage` export must degrade to the auth file.
vi.mock("@earendil-works/pi-coding-agent", () => ({ AuthStorage: undefined }));

describe("oauth autoLoginQoderFromEnvironment", () => {
  const originalEnv = process.env;
  let originalAuth: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    clearPatEnv();
    clearQoderAuthMemCache();
    originalAuth = existsSync(AUTH_FILE) ? readFileSync(AUTH_FILE, "utf8") : undefined;
  });

  afterEach(() => {
    process.env = originalEnv;
    if (originalAuth === undefined) rmSync(AUTH_FILE, { force: true });
    else writeFileSync(AUTH_FILE, originalAuth, "utf8");
    clearQoderAuthMemCache();
  });

  it("extracts PAT correctly from env for global and CN mode", () => {
    process.env.QODER_PERSONAL_ACCESS_TOKEN = "pt-global-123";
    expect(getQoderPatForMode("global")).toBe("pt-global-123");

    process.env.QODERCN_PERSONAL_ACCESS_TOKEN = "pt-cn-456";
    expect(getQoderPatForMode("cn")).toBe("pt-cn-456");
  });

  it("does nothing if no PAT in environment", async () => {
    await autoLoginQoderFromEnvironment("qoder-test-provider", "global");
    expect(getCachedCredentials("mock-token", "qoder-test-provider")).toBeNull();
  });

  it("re-exchanges an environment PAT even when cached credentials exist", async () => {
    process.env.QODER_PERSONAL_ACCESS_TOKEN = "pt-global-new-account";
    const auth = existsSync(AUTH_FILE) ? JSON.parse(readFileSync(AUTH_FILE, "utf8")) : {};
    auth["qoder-test-provider"] = {
      type: "oauth",
      access: "old-access-token",
      refresh: "old-refresh-token",
      expires: Date.now() + 3600000,
      userID: "old-user",
    };
    writeFileSync(AUTH_FILE, JSON.stringify(auth), "utf8");

    await autoLoginQoderFromEnvironment("qoder-test-provider", "global");

    expect(credentialsFromPat).toHaveBeenCalledWith("pt-global-new-account", "global");
    expect(updateQoderModelsCache).toHaveBeenCalledWith(
      "mock-access-token",
      "mock-user-123",
      "Test User",
      "test@example.com",
      "global",
    );
  });

  it("stores an environment PAT login in the auth file when the framework has no AuthStorage", async () => {
    process.env.QODER_PERSONAL_ACCESS_TOKEN = "pt-global-fallback";

    await autoLoginQoderFromEnvironment("qoder-fallback-provider", "global");

    const auth = JSON.parse(readFileSync(AUTH_FILE, "utf8")) as Record<string, Record<string, unknown>>;
    expect(auth["qoder-fallback-provider"]).toMatchObject({
      type: "oauth",
      access: "mock-access-token",
      userID: "mock-user-123",
      machineID: "mock-machine-id",
    });
  });

  it("passes a recorded-format identity into the model catalog refresh", async () => {
    const identity = loadLiveFixture("global").interactions.userinfo.response.body as {
      id: string;
      email: string;
      name: string;
    };
    vi.mocked(credentialsFromPat).mockResolvedValueOnce({
      access: "<redacted:job-token>",
      refresh: "<redacted:refresh-token>",
      expires: Date.now() + 3600000,
      userID: identity.id,
      email: identity.email,
      name: identity.name,
      machineID: "<redacted:machine-id>",
      type: "oauth",
    } as never);
    clearPatEnv();
    process.env.QODER_PAT = "test-only-pat";

    await autoLoginQoderFromEnvironment("qoder-fixture-provider", "global");

    expect(updateQoderModelsCache).toHaveBeenCalledWith(
      "<redacted:job-token>",
      identity.id,
      identity.name,
      identity.email,
      "global",
    );
  });
});

describe("loginQoderForMode waits for the model cache", () => {
  it("waits for the model cache refresh before returning (PAT path)", async () => {
    process.env.QODER_PERSONAL_ACCESS_TOKEN = "pt-test-123";
    let resolveCache!: () => void;
    const cachePromise = new Promise<void>((resolve) => {
      resolveCache = resolve;
    });
    vi.mocked(updateQoderModelsCache).mockReturnValueOnce(cachePromise);
    let loginResolved = false;
    const loginPromise = loginQoderForMode({} as OAuthLoginCallbacks, "global").then((creds) => {
      loginResolved = true;
      return creds;
    });

    // Flush microtasks so the PAT exchange completes and login reaches the cache wait.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(loginResolved).toBe(false);

    resolveCache();
    const creds = await loginPromise;
    expect(loginResolved).toBe(true);
    expect(creds.access).toBe("mock-access-token");
    expect(updateQoderModelsCache).toHaveBeenCalledWith(
      "mock-access-token",
      "mock-user-123",
      "Test User",
      "test@example.com",
      "global",
    );
  });

  it("still returns when the model cache fetch hangs (bounded wait)", async () => {
    vi.useFakeTimers();
    try {
      process.env.QODER_PERSONAL_ACCESS_TOKEN = "pt-test-123";
      vi.mocked(updateQoderModelsCache).mockReturnValueOnce(new Promise<void>(() => {}));
      const loginPromise = loginQoderForMode({} as OAuthLoginCallbacks, "global");

      // Advance past the bounded wait; login must resolve without the fetch.
      await vi.advanceTimersByTimeAsync(16_000);
      const creds = await loginPromise;
      expect(creds.access).toBe("mock-access-token");
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the login timeout once the cache refresh finishes", async () => {
    vi.useFakeTimers();
    try {
      process.env.QODER_PERSONAL_ACCESS_TOKEN = "pt-test-123";
      vi.mocked(updateQoderModelsCache).mockResolvedValueOnce(undefined);
      const creds = await loginQoderForMode({} as OAuthLoginCallbacks, "global");
      expect(creds.access).toBe("mock-access-token");
      // The 15s fallback timer must not be left behind to hold the event loop.
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
