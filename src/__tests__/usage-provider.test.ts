/**
 * OMP usage-surface mapping. The extension already parses Qoder's quota
 * payload for `/qoder-quota`; `omp usage` instead consumes a normalized report
 * (numeric amounts, status, absolute reset). These checks pin that mapping
 * against the endpoint's real field names — a contract the extension does not
 * own — so drift fails here rather than showing up as an empty row in the
 * host's usage view.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchQoderUsageForMode } from "../auth/usage.js";
import { createQoderUsageProvider, toUsageReport } from "../usage-provider.js";

/** `GET /api/v2/quota/usage` as an account with credits answers it. */
const QUOTA_PAYLOAD = {
  userId: "01a0809d-5d53-754f-a80b-a6cb580fa06c",
  userType: "personal_standard",
  totalUsagePercentage: 40,
  isQuotaExceeded: false,
  expiresAt: 1790000000000,
  upgradeUrl: "https://qoder.com/pricing",
  userQuota: { total: 3000, used: 1200, remaining: 1800, unit: "credits" },
  addOnQuota: { total: 50, used: 50, remaining: 0, unit: "credits" },
  orgResourcePackage: { cap: 100, used: 10, remaining: 90, unit: "credits" },
};

function json(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("toUsageReport", () => {
  it("maps each quota bucket to a limit with numeric amounts and a reset window", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(QUOTA_PAYLOAD)));
    const usage = await fetchQoderUsageForMode({ access: "t" } as never, "global");

    const report = toUsageReport(usage, "qoder");

    expect(report?.limits.map((limit) => limit.id)).toEqual(["user-quota", "add-on-quota", "org-resource-package"]);
    expect(report?.limits[0]).toMatchObject({
      label: "User Quota",
      scope: { provider: "qoder" },
      amount: { used: 1200, limit: 3000, remaining: 1800, unit: "credits", usedFraction: 0.4 },
      status: "ok",
    });
    // `expiresAt` is the payload's own boundary, carried as an absolute
    // timestamp because the host renders the countdown itself.
    expect(report?.limits[0]?.window?.resetsAt).toBe(1790000000000);
    // Nothing left in a bucket is exhausted whatever the fraction says.
    expect(report?.limits[1]?.status).toBe("exhausted");
    expect(report?.notes?.join(" ")).toContain("personal_standard");
  });

  it("treats the endpoint's exceeded flag as exhausted for every bucket", () => {
    const report = toUsageReport(
      {
        usageBuckets: [{ id: "user-quota", label: "User Quota", usedDisplay: "0.00" }],
        raw: {
          isQuotaExceeded: true,
          userQuota: { total: 0, used: 0, remaining: 0, unit: "credits" },
        },
      },
      "qoder",
      1_750_000_000_000,
    );
    expect(report?.limits[0]?.status).toBe("exhausted");
    expect(report?.fetchedAt).toBe(1_750_000_000_000);
    // A zero-total bucket has no fraction: 0/0 is not 0% used.
    expect(report?.limits[0]?.amount.usedFraction).toBeUndefined();
  });

  it("returns null when the account reports no buckets", () => {
    expect(toUsageReport({ usageBuckets: [] }, "qoder")).toBeNull();
  });

  it("drops the year-9999 no-expiry sentinel from the window", () => {
    const report = toUsageReport(
      {
        usageBuckets: [{ id: "user-quota", label: "User Quota", usedDisplay: "0.00" }],
        raw: {
          expiresAt: 253402214400000,
          userQuota: { total: 0, used: 0, remaining: 0, unit: "credits" },
        },
      },
      "qoder",
    );
    expect(report?.limits[0]?.window).toBeUndefined();
  });

  it("labels a real plan expiry instead of calling it a reset", () => {
    const report = toUsageReport(
      {
        usageBuckets: [{ id: "user-quota", label: "User Quota", usedDisplay: "10.00" }],
        subscriptionTitle: "Qoder Pro",
        resetAt: "2026-11-15T00:00:00.000Z",
        raw: { userQuota: { total: 100, used: 10, remaining: 90, unit: "credits" } },
      },
      "qoder",
    );
    expect(report?.limits[0]?.window).toEqual({
      id: "period",
      label: "Qoder Pro",
      resetsAt: Date.parse("2026-11-15T00:00:00.000Z"),
      resetLabel: "plan expires",
    });
  });
});

describe("createQoderUsageProvider", () => {
  it("accepts the host's normalized credential and asks the region's quota URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(QUOTA_PAYLOAD));
    vi.stubGlobal("fetch", fetchMock);

    const report = await createQoderUsageProvider("global", "qoder").fetchUsage({
      credential: { type: "oauth", accessToken: "host-token" },
    });

    expect(report?.limits[0]?.amount.used).toBe(1200);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://openapi.qoder.sh/api/v2/quota/usage");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer host-token");
  });

  it("returns null instead of throwing when the credential carries no token", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createQoderUsageProvider("global", "qoder").fetchUsage({ credential: { type: "oauth" } }),
    ).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null when the quota endpoint fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 500 })));

    await expect(
      createQoderUsageProvider("global", "qoder").fetchUsage({ credential: { access: "t" } }),
    ).resolves.toBeNull();
  });
});
