import type { OAuthCredentials } from "@earendil-works/pi-ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchQoderUsageForMode, normalizeQoderQuotaSnapshot, type QoderProviderUsage } from "../auth/usage.js";
import { QoderQuotaService } from "../quota.js";

const credentials: OAuthCredentials = { access: "test-account-a", refresh: "", expires: 0 };
const otherCredentials: OAuthCredentials = { ...credentials, access: "test-account-b" };
const completeRaw = {
  userQuota: { total: 100, used: 25, remaining: 75, unit: "credits", percentage: 25 },
  orgResourcePackage: { total: 50, used: 10, remaining: 40, unit: "requests" },
  expiresAt: 1_800_000_000_000,
};

function usage(raw: Record<string, unknown> = completeRaw): QoderProviderUsage {
  return { raw };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("quota normalization", () => {
  it("preserves separate account buckets without aggregating different units", () => {
    expect(normalizeQoderQuotaSnapshot(completeRaw)).toEqual({
      userQuota: { total: 100, used: 25, remaining: 75, unit: "credits" },
      orgResourcePackage: { total: 50, used: 10, remaining: 40, unit: "requests" },
      expiresAt: 1_800_000_000_000,
    });
  });

  it("preserves explicit zero and does not invent missing numbers or units", () => {
    expect(normalizeQoderQuotaSnapshot({ userQuota: { remaining: 0 }, expiresAt: 0 })).toEqual({
      userQuota: { remaining: 0, used: undefined, total: undefined, unit: undefined },
      orgResourcePackage: undefined,
      expiresAt: 0,
    });
  });

  it("does not infer a missing remainder from total and used", () => {
    expect(normalizeQoderQuotaSnapshot({ userQuota: { total: 5, used: 2 } })?.userQuota?.remaining).toBeUndefined();
  });

  it("allows an org-only snapshot and trims a known unit", () => {
    expect(normalizeQoderQuotaSnapshot({ orgResourcePackage: { used: 2, unit: " requests " } })).toEqual({
      userQuota: undefined,
      orgResourcePackage: { used: 2, remaining: undefined, total: undefined, unit: "requests" },
      expiresAt: undefined,
    });
  });

  it.each([null, undefined, [], "usage", 0, {}, { userQuota: [] }, { userQuota: { unit: "credits" } }])(
    "does not produce quota from an unusable payload: %j",
    (raw) => {
      expect(normalizeQoderQuotaSnapshot(raw)).toBeUndefined();
    },
  );

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, "12", null, false, {}])(
    "rejects invalid numeric quota fields: %j",
    (invalid) => {
      expect(
        normalizeQoderQuotaSnapshot({ userQuota: { used: invalid, total: invalid, remaining: invalid } }),
      ).toBeUndefined();
    },
  );

  it.each([undefined, null, "", "  ", 5, false, {}])("keeps missing/invalid unit unknown: %j", (unit) => {
    expect(normalizeQoderQuotaSnapshot({ userQuota: { remaining: 10, unit } })?.userQuota?.unit).toBeUndefined();
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 8.64e15 + 1, "1800000000000", null])(
    "rejects invalid expiration values without discarding quota: %j",
    (expiresAt) => {
      const snapshot = normalizeQoderQuotaSnapshot({ userQuota: { remaining: 1 }, expiresAt });
      expect(snapshot?.userQuota?.remaining).toBe(1);
      expect(snapshot?.expiresAt).toBeUndefined();
    },
  );

  it("does not mutate raw fields, infer session costs, or merge unknown units", () => {
    const raw = {
      userQuota: { remaining: 2 },
      orgResourcePackage: { remaining: 4 },
      extra: { arbitrary: "preserved" },
    };
    const before = structuredClone(raw);
    const snapshot = normalizeQoderQuotaSnapshot(raw);
    expect(raw).toEqual(before);
    expect(snapshot?.userQuota?.remaining).toBe(2);
    expect(snapshot?.orgResourcePackage?.remaining).toBe(4);
    expect(snapshot).not.toHaveProperty("remaining");
    expect(snapshot).not.toHaveProperty("cost");
  });
});

describe("provider usage compatibility", () => {
  it("preserves the raw response and formatted provider usage with an optional signal", async () => {
    const raw = { ...completeRaw, providerExtra: { preserved: true } };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(raw)));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const result = await fetchQoderUsageForMode(credentials, "global", controller.signal);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://openapi.qoder.sh/api/v2/quota/usage",
      expect.objectContaining({ method: "GET", signal: controller.signal }),
    );
    expect(result.raw).toEqual(raw);
    expect(result.summary).toBe("75.00 credits remaining");
    expect(result.subscriptionTitle).toBe("Qoder AI Plan");
    expect(result.usageBuckets?.[0]).toEqual({
      id: "user-quota",
      label: "User Quota",
      usedDisplay: "25.00",
      limitDisplay: "100.00",
      unit: "credits",
      resetAt: new Date(completeRaw.expiresAt).toISOString(),
    });
  });

  it("accepts partial data and explicit zero without presenting absent usage as zero", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ userQuota: { remaining: 0 } }))));
    const result = await fetchQoderUsageForMode(credentials, "cn");
    expect(result.summary).toBe("0.00 remaining");
    expect(result.subscriptionTitle).toBe("Qoder CN Plan");
    expect(result.manageUrl).toBe("https://qoder.com.cn");
    expect(result.usageBuckets?.[0].usedDisplay).toBe("unknown");
    expect(result.usageBuckets?.[0].limitDisplay).toBeUndefined();
    expect(result.usageBuckets?.[0].unit).toBeUndefined();
  });

  it("formats expiration zero but ignores out-of-range dates", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ userQuota: { used: 0 }, expiresAt: 0 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ userQuota: { used: 0 }, expiresAt: 1e100 })));
    vi.stubGlobal("fetch", fetchMock);
    expect((await fetchQoderUsageForMode(credentials, "global")).resetAt).toBe("1970-01-01T00:00:00.000Z");
    expect((await fetchQoderUsageForMode(credentials, "global")).resetAt).toBeUndefined();
  });

  it("keeps unknown raw data for consumers without throwing on absent quota fields", async () => {
    const raw = { userQuota: { used: "unknown" }, futureField: "value" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(raw))));
    const result = await fetchQoderUsageForMode(credentials, "global");
    expect(result.raw).toEqual(raw);
    expect(result.usageBuckets).toEqual([]);
    expect(result.summary).toBe("");
  });

  it.each([null, [], "bad-payload"])("rejects invalid top-level response: %j", async (raw) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(raw))));
    await expect(fetchQoderUsageForMode(credentials, "global")).rejects.toThrow("Invalid Qoder usage response");
  });

  it("does not include server-controlled error text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("secret-body", { status: 401, statusText: "secret-text" })),
    );
    await expect(fetchQoderUsageForMode(credentials, "global")).rejects.toThrow("Failed to fetch Qoder usage (401)");
  });
});

describe("QoderQuotaService", () => {
  it("exposes loading, deduplicates concurrent same-identity reads, and records a monotonic timestamp", async () => {
    const pending = deferred<QoderProviderUsage>();
    const fetchUsage = vi.fn().mockReturnValue(pending.promise);
    const service = new QoderQuotaService({ fetchUsage, now: () => 123 });
    expect(service.peek("global")).toBeUndefined();
    const first = service.read("global", credentials);
    expect(service.peek("global")?.status).toBe("loading");
    const second = service.read("global", { ...credentials }, true);
    expect(first).toBe(second);
    pending.resolve(usage());
    expect(await first).toMatchObject({ status: "fresh", updatedAt: 123, snapshot: { userQuota: { remaining: 75 } } });
    expect(fetchUsage).toHaveBeenCalledTimes(1);
    expect(fetchUsage).toHaveBeenCalledWith(credentials, "global", expect.any(AbortSignal));
  });

  it("caches for 30 seconds, marks an expired snapshot stale on peek, and refreshes at the boundary", async () => {
    let now = 0;
    const fetchUsage = vi.fn().mockResolvedValue(usage());
    const service = new QoderQuotaService({ fetchUsage, now: () => now });
    await service.read("global", credentials);
    now = 29_999;
    expect((await service.read("global", credentials)).status).toBe("fresh");
    expect(fetchUsage).toHaveBeenCalledTimes(1);
    now = 30_000;
    expect(service.peek("global")?.status).toBe("stale");
    await service.read("global", credentials);
    expect(fetchUsage).toHaveBeenCalledTimes(2);
    expect(service.peek("global")?.status).toBe("fresh");
  });

  it("reports a one-shot expiry delay using the injected monotonic clock and custom TTL", async () => {
    let now = 100;
    const fetchUsage = vi.fn().mockResolvedValue(usage());
    const service = new QoderQuotaService({ fetchUsage, now: () => now, ttlMs: 500 });
    expect(service.staleAfterMs("global")).toBeUndefined();
    const request = service.read("global", credentials);
    expect(service.staleAfterMs("global")).toBeUndefined();
    await request;
    expect(service.staleAfterMs("global")).toBe(500);
    expect(service.staleAfterMs("cn")).toBeUndefined();
    now = 350;
    expect(service.staleAfterMs("global")).toBe(250);
    now = 600;
    expect(service.staleAfterMs("global")).toBe(0);
    now = 700;
    expect(service.staleAfterMs("global")).toBe(0);
    expect(service.peek("global")?.status).toBe("stale");
    expect(service.staleAfterMs("global")).toBeUndefined();
    expect(fetchUsage).toHaveBeenCalledTimes(1);
  });

  it("does not schedule expiry for loading, failed, or cleared snapshots", async () => {
    const pending = deferred<QoderProviderUsage>();
    const fetchUsage = vi.fn().mockResolvedValueOnce(usage()).mockReturnValueOnce(pending.promise);
    const service = new QoderQuotaService({ fetchUsage, now: () => 0 });
    await service.read("global", credentials);
    expect(service.staleAfterMs("global")).toBe(30_000);
    const request = service.read("global", credentials, true);
    expect(service.staleAfterMs("global")).toBeUndefined();
    pending.reject(new Error("failed"));
    await request;
    expect(service.staleAfterMs("global")).toBeUndefined();
    service.clear();
    expect(service.staleAfterMs("global")).toBeUndefined();
  });

  it("starts the TTL when a request completes and permits manual refresh inside the TTL", async () => {
    let now = 0;
    const pending = deferred<QoderProviderUsage>();
    const fetchUsage = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(usage());
    const service = new QoderQuotaService({ fetchUsage, now: () => now });
    const request = service.read("global", credentials);
    now = 20_000;
    pending.resolve(usage());
    await request;
    now = 40_000;
    await service.read("global", credentials);
    expect(fetchUsage).toHaveBeenCalledTimes(1);
    await service.read("global", credentials, true);
    expect(fetchUsage).toHaveBeenCalledTimes(2);
  });

  it("keeps only same-identity stale data and uses a generic credential-safe error", async () => {
    let now = 0;
    const fetchUsage = vi
      .fn()
      .mockResolvedValueOnce(usage())
      .mockRejectedValue(new Error(`server saw ${credentials.access}`));
    const service = new QoderQuotaService({ fetchUsage, now: () => now });
    const original = await service.read("global", credentials);
    now = 35_000;
    const stale = await service.read("global", credentials);
    expect(stale).toEqual({ ...original, status: "stale", error: "Qoder quota unavailable" });
    expect(JSON.stringify(stale)).not.toContain(credentials.access);
    expect(stale.updatedAt).toBe(0);
    await service.read("global", credentials);
    expect(fetchUsage).toHaveBeenCalledTimes(2);
    await service.read("global", credentials, true);
    expect(fetchUsage).toHaveBeenCalledTimes(3);
  });

  it("caches initial failures briefly, then recovers without ever claiming zero balance", async () => {
    let now = 0;
    const fetchUsage = vi.fn().mockRejectedValueOnce(new Error("failure")).mockResolvedValue(usage());
    const service = new QoderQuotaService({ fetchUsage, now: () => now });
    const result = await service.read("cn", credentials);
    expect(result.status).toBe("unavailable");
    expect(result.snapshot).toBeUndefined();
    expect(result.updatedAt).toBeUndefined();
    await service.read("cn", credentials);
    expect(fetchUsage).toHaveBeenCalledTimes(1);
    now = 30_000;
    expect((await service.read("cn", credentials)).status).toBe("fresh");
  });

  it("makes a new identity unavailable on failure instead of leaking the previous account snapshot", async () => {
    const pending = deferred<QoderProviderUsage>();
    const fetchUsage = vi.fn().mockResolvedValueOnce(usage()).mockReturnValueOnce(pending.promise);
    const service = new QoderQuotaService({ fetchUsage });
    await service.read("global", credentials);
    const request = service.read("global", otherCredentials);
    expect(service.peek("global")?.snapshot).toBeUndefined();
    pending.reject(new Error("denied"));
    expect(await request).toMatchObject({ status: "unavailable", snapshot: undefined });
    expect(service.peek("global")?.snapshot).toBeUndefined();
  });

  it("snapshots request credentials so caller mutation cannot change the selected account", async () => {
    const input = { ...credentials };
    const fetchUsage = vi.fn().mockResolvedValue(usage());
    const service = new QoderQuotaService({ fetchUsage });
    const request = service.read("global", input);
    input.access = otherCredentials.access;
    await request;
    expect(fetchUsage.mock.calls[0][0].access).toBe(credentials.access);
    await service.read("global", input);
    expect(fetchUsage).toHaveBeenCalledTimes(2);
    expect(fetchUsage.mock.calls[1][0].access).toBe(otherCredentials.access);
  });

  it("does not start a fetch after the request is immediately cleared", async () => {
    const fetchUsage = vi.fn().mockResolvedValue(usage());
    const service = new QoderQuotaService({ fetchUsage });
    const request = service.read("global", credentials);
    service.clear("global");
    expect((await request).status).toBe("unavailable");
    expect(fetchUsage).not.toHaveBeenCalled();
    expect(service.peek("global")).toBeUndefined();
  });

  it("isolates global and CN even with the same access identity", async () => {
    const fetchUsage = vi.fn().mockResolvedValueOnce(usage()).mockRejectedValueOnce(new Error("CN failed"));
    const service = new QoderQuotaService({ fetchUsage });
    await service.read("global", credentials);
    expect((await service.read("cn", credentials)).snapshot).toBeUndefined();
    expect(service.peek("global")?.snapshot?.userQuota?.remaining).toBe(75);
    expect(service.peek("cn")?.status).toBe("unavailable");
  });

  it("invalidates old in-flight work on identity change and ignores its late response", async () => {
    const old = deferred<QoderProviderUsage>();
    const fetchUsage = vi
      .fn()
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(usage({ userQuota: { remaining: 2 } }));
    const service = new QoderQuotaService({ fetchUsage });
    const oldRequest = service.read("global", credentials);
    await Promise.resolve();
    const currentRequest = service.read("global", otherCredentials);
    expect((await oldRequest).status).toBe("unavailable");
    expect((await currentRequest).snapshot?.userQuota?.remaining).toBe(2);
    expect(fetchUsage.mock.calls[0][2].aborted).toBe(true);
    old.resolve(usage());
    await Promise.resolve();
    expect(service.peek("global")?.snapshot?.userQuota?.remaining).toBe(2);
  });

  it("treats missing or unusable raw quota as failure and preserves a previous valid snapshot", async () => {
    const fetchUsage = vi.fn().mockResolvedValueOnce(usage()).mockResolvedValueOnce({ summary: "not quota" });
    const service = new QoderQuotaService({ fetchUsage });
    await service.read("global", credentials);
    const result = await service.read("global", credentials, true);
    expect(result.status).toBe("stale");
    expect(result.snapshot?.userQuota?.remaining).toBe(75);
  });

  it("does not fetch with an empty credential or retain an earlier account", async () => {
    const fetchUsage = vi.fn().mockResolvedValue(usage());
    const service = new QoderQuotaService({ fetchUsage });
    await service.read("global", credentials);
    const result = await service.read("global", { ...credentials, access: "" });
    expect(result.status).toBe("unavailable");
    expect(result.snapshot).toBeUndefined();
    expect(fetchUsage).toHaveBeenCalledTimes(1);
  });

  it("clears one region or all regions and aborts outstanding requests", async () => {
    const pending = deferred<QoderProviderUsage>();
    const fetchUsage = vi
      .fn()
      .mockResolvedValueOnce(usage())
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue(usage());
    const service = new QoderQuotaService({ fetchUsage });
    await service.read("global", credentials);
    const request = service.read("cn", credentials);
    await Promise.resolve();
    service.clear("cn");
    expect((await request).status).toBe("unavailable");
    expect(fetchUsage.mock.calls[1][2].aborted).toBe(true);
    expect(service.peek("cn")).toBeUndefined();
    expect(service.peek("global")?.status).toBe("fresh");
    await service.read("cn", credentials);
    service.clear();
    expect(service.peek("global")).toBeUndefined();
    expect(service.peek("cn")).toBeUndefined();
  });

  it("bounds requests even when the fetcher ignores AbortSignal, and can recover after timeout", async () => {
    vi.useFakeTimers();
    const pending = deferred<QoderProviderUsage>();
    const fetchUsage = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValueOnce(usage());
    const service = new QoderQuotaService({ fetchUsage, timeoutMs: 100 });
    const request = service.read("global", credentials);
    await vi.advanceTimersByTimeAsync(100);
    expect((await request).status).toBe("unavailable");
    expect(fetchUsage.mock.calls[0][2].aborted).toBe(true);
    expect((await service.read("global", credentials, true)).status).toBe("fresh");
    pending.resolve(usage({ userQuota: { remaining: 999 } }));
    await Promise.resolve();
    expect(service.peek("global")?.snapshot?.userQuota?.remaining).toBe(75);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps a previous valid snapshot stale on timeout and clears its timer", async () => {
    vi.useFakeTimers();
    const pending = deferred<QoderProviderUsage>();
    const fetchUsage = vi.fn().mockResolvedValueOnce(usage()).mockReturnValueOnce(pending.promise);
    const service = new QoderQuotaService({ fetchUsage, timeoutMs: 100 });
    await service.read("global", credentials);
    const request = service.read("global", credentials, true);
    expect(service.peek("global")).toMatchObject({ status: "loading", snapshot: { userQuota: { remaining: 75 } } });
    await vi.advanceTimersByTimeAsync(100);
    expect(await request).toMatchObject({ status: "stale", snapshot: { userQuota: { remaining: 75 } } });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("handles synchronous injected-fetch errors without leaving loading state or timers", async () => {
    vi.useFakeTimers();
    const service = new QoderQuotaService({
      fetchUsage: () => {
        throw new Error("secret");
      },
    });
    expect((await service.read("global", credentials)).status).toBe("unavailable");
    expect(service.peek("global")?.status).toBe("unavailable");
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([{ ttlMs: -1 }, { ttlMs: Number.NaN }, { timeoutMs: 0 }, { timeoutMs: Number.POSITIVE_INFINITY }])(
    "rejects invalid cache or timeout options: %j",
    (options) => {
      expect(() => new QoderQuotaService(options)).toThrow();
    },
  );
});
